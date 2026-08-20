/**
 * render.js - sample-accurate renderer for the mock graph.
 *
 * DSP kernels follow the Web Audio API spec:
 *  - BiquadFilter coefficients are the spec's Audio-EQ-Cookbook formulas.
 *  - WaveShaper uses the spec's curve interpolation over x in [-1, 1].
 *  - DelayNode uses linear interpolation on a fractional delay line.
 *
 * Cycle handling models the spec: a cycle containing a DelayNode is rendered
 * (the delay supplies the needed sample memory); a cycle WITHOUT a DelayNode
 * is muted, which is what browsers do.
 */

'use strict';

const {
  BiquadFilterNode, DelayNode, WaveShaperNode, OscillatorNode,
  GainNode, findCycles
} = require('./webaudio-mock');

function biquadCoeffs(type, fs, freq, Q, gainDb) {
  const nyq = fs / 2;
  let f = Math.min(Math.max(freq, 0), nyq);
  const w0 = 2 * Math.PI * (f / fs);
  const cw = Math.cos(w0), sw = Math.sin(w0);
  const A = Math.pow(10, gainDb / 40);
  let b0, b1, b2, a0, a1, a2;

  switch (type) {
    case 'lowpass': {
      // Web Audio uses Q in dB for lowpass/highpass
      const q = Math.pow(10, Q / 20);
      const alpha = sw / (2 * q);
      b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2;
      a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha;
      break;
    }
    case 'highpass': {
      const q = Math.pow(10, Q / 20);
      const alpha = sw / (2 * q);
      b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2;
      a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha;
      break;
    }
    case 'bandpass': {
      const alpha = sw * Math.sinh(Math.log(2) / 2 * (Q <= 0 ? 0.0001 : 1) ) ;
      // Spec form: alpha = sin(w0)/(2Q), constant 0 dB peak gain
      const a = sw / (2 * Math.max(Q, 1e-6));
      b0 = a; b1 = 0; b2 = -a;
      a0 = 1 + a; a1 = -2 * cw; a2 = 1 - a;
      break;
    }
    case 'peaking': {
      const alpha = sw / (2 * Math.max(Q, 1e-6));
      b0 = 1 + alpha * A; b1 = -2 * cw; b2 = 1 - alpha * A;
      a0 = 1 + alpha / A; a1 = -2 * cw; a2 = 1 - alpha / A;
      break;
    }
    case 'notch': {
      const alpha = sw / (2 * Math.max(Q, 1e-6));
      b0 = 1; b1 = -2 * cw; b2 = 1;
      a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha;
      break;
    }
    case 'allpass': {
      const alpha = sw / (2 * Math.max(Q, 1e-6));
      b0 = 1 - alpha; b1 = -2 * cw; b2 = 1 + alpha;
      a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha;
      break;
    }
    default:
      b0 = 1; b1 = 0; b2 = 0; a0 = 1; a1 = 0; a2 = 0;
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

function shape(curve, x) {
  if (!curve || curve.length === 0) return x;
  const n = curve.length;
  if (n === 1) return curve[0];
  // Spec: v = (N-1) * (x + 1) / 2, then linear-interpolate
  const v = (n - 1) * (x + 1) / 2;
  if (v <= 0) return curve[0];
  if (v >= n - 1) return curve[n - 1];
  const k = Math.floor(v);
  const f = v - k;
  return (1 - f) * curve[k] + f * curve[k + 1];
}

/**
 * Render the graph.
 * @param ctx      MockAudioContext
 * @param inputNode node that the test signal is injected into
 * @param outputNode node whose output is captured
 * @param signal   Float64Array of input samples
 */
function render(ctx, inputNode, outputNode, signal) {
  const fs = ctx.sampleRate;
  const N = signal.length;
  const out = new Float64Array(N);

  // Determine which cycles are legal (contain a DelayNode) vs muted.
  const cycles = findCycles(ctx);
  const mutedEdges = new Set();
  const illegalCycles = [];
  for (const cyc of cycles) {
    const hasDelay = cyc.some(n => n instanceof DelayNode);
    if (!hasDelay) {
      illegalCycles.push(cyc);
      // Browsers break the cycle; model that by muting the closing edge.
      const a = cyc[cyc.length - 2], b = cyc[cyc.length - 1];
      mutedEdges.add(a.id + '->' + b.id);
    }
  }

  // Build reverse adjacency: for each node, list of source nodes (audio-rate)
  const audioIn = new Map();
  const paramIn = new Map(); // node -> {paramName: [sources]}
  for (const n of ctx._nodes) { audioIn.set(n, []); paramIn.set(n, {}); }
  for (const e of ctx._edges) {
    if (mutedEdges.has(e.from.id + '->' + e.to.id)) continue;
    if (e.param) {
      const m = paramIn.get(e.to);
      (m[e.param] = m[e.param] || []).push(e.from);
    } else {
      audioIn.get(e.to).push(e.from);
    }
  }

  // Node output memory (previous sample) — used to break feedback loops the
  // same way a render-quantum boundary does.
  const prev = new Map();
  for (const n of ctx._nodes) prev.set(n, 0);

  // Topological-ish order ignoring back edges.
  const order = [];
  const seen = new Set();
  const inStack = new Set();
  function visit(n) {
    if (seen.has(n)) return;
    if (inStack.has(n)) return; // back edge
    inStack.add(n);
    for (const s of audioIn.get(n)) visit(s);
    for (const k of Object.keys(paramIn.get(n))) {
      for (const s of paramIn.get(n)[k]) visit(s);
    }
    inStack.delete(n);
    seen.add(n);
    order.push(n);
  }
  for (const n of ctx._nodes) visit(n);

  const cur = new Map();

  for (let i = 0; i < N; i++) {
    for (const n of order) {
      // Sum audio inputs (use current value if already computed this sample,
      // else previous sample -> models feedback delay)
      let x = 0;
      for (const s of audioIn.get(n)) {
        x += cur.has(s) ? cur.get(s) : prev.get(s);
      }
      if (n === inputNode) x += signal[i];

      let y;
      switch (true) {
        case n instanceof GainNode: {
          let g = n.gain.value;
          for (const s of (paramIn.get(n).gain || [])) {
            g += cur.has(s) ? cur.get(s) : prev.get(s);
          }
          y = x * g;
          break;
        }
        case n instanceof OscillatorNode: {
          let f = n.frequency.value;
          for (const s of (paramIn.get(n).frequency || [])) {
            f += cur.has(s) ? cur.get(s) : prev.get(s);
          }
          if (!n._started || n._stopped) { y = 0; break; }
          y = Math.sin(n._phase);
          n._phase += 2 * Math.PI * f / fs;
          if (n._phase > 2 * Math.PI) n._phase -= 2 * Math.PI;
          break;
        }
        case n instanceof WaveShaperNode: {
          y = shape(n.curve, x);
          break;
        }
        case n instanceof BiquadFilterNode: {
          let f = n.frequency.value;
          for (const s of (paramIn.get(n).frequency || [])) {
            f += cur.has(s) ? cur.get(s) : prev.get(s);
          }
          let q = n.Q.value;
          for (const s of (paramIn.get(n).Q || [])) {
            q += cur.has(s) ? cur.get(s) : prev.get(s);
          }
          const c = biquadCoeffs(n._filterType, fs, f, q, n.gain.value);
          y = c.b0 * x + c.b1 * n._x1 + c.b2 * n._x2 - c.a1 * n._y1 - c.a2 * n._y2;
          n._x2 = n._x1; n._x1 = x;
          n._y2 = n._y1; n._y1 = y;
          break;
        }
        case n instanceof DelayNode: {
          let d = n.delayTime.value;
          for (const s of (paramIn.get(n).delayTime || [])) {
            d += cur.has(s) ? cur.get(s) : prev.get(s);
          }
          d = Math.min(Math.max(d, 0), n.maxDelayTime);
          const buf = n._buf, L = buf.length;
          buf[n._w] = x;
          const ds = d * fs;
          let rp = n._w - ds;
          while (rp < 0) rp += L;
          const i0 = Math.floor(rp) % L;
          const i1 = (i0 + 1) % L;
          const fr = rp - Math.floor(rp);
          y = buf[i0] * (1 - fr) + buf[i1] * fr;
          n._w = (n._w + 1) % L;
          break;
        }
        default:
          y = x; // plain AudioNode / destination
      }
      if (!Number.isFinite(y)) y = NaN;
      cur.set(n, y);
    }

    out[i] = cur.get(outputNode);
    for (const n of order) prev.set(n, cur.get(n));
    cur.clear();
    ctx.currentTime += 1 / fs;
  }

  return { out, illegalCycles, cycles };
}

module.exports = { render, biquadCoeffs, shape };
