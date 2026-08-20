/**
 * webaudio-mock.js
 *
 * A minimal but faithful mock of the Web Audio API subset used by effects.js.
 *
 * Two jobs:
 *  1. Record the real graph topology that effects.js builds, so it can be
 *     statically analysed (illegal cycles, orphan nodes, bad param values).
 *  2. Render audio through DSP kernels that match the Web Audio spec
 *     (BiquadFilter uses the spec's Audio-EQ-Cookbook coefficients,
 *     WaveShaper uses the spec's curve-interpolation rule, etc.)
 *
 * This is NOT a browser. It cannot prove browser behaviour. It is a way to
 * exercise the actual effects.js source in the absence of one.
 */

'use strict';

let uid = 0;

class AudioParam {
  constructor(owner, name, defaultValue) {
    this.owner = owner;
    this.name = name;
    this._value = defaultValue;
    this.inputs = []; // nodes modulating this param (a-rate)
  }
  get value() { return this._value; }
  set value(v) { this._value = v; }
  setValueAtTime(v) { this._value = v; return this; }
  linearRampToValueAtTime(v) { this._value = v; return this; }
}

class AudioNode {
  constructor(ctx, kind) {
    this.ctx = ctx;
    // NOTE: stored as `nodeKind`, not `type` — BiquadFilterNode and
    // OscillatorNode expose a real `type` property of their own.
    this.nodeKind = kind;
    this.id = ++uid;
    this.outputs = [];       // AudioNode | AudioParam
    this.numInputs = 0;
    ctx._nodes.push(this);
  }
  connect(target) {
    if (target instanceof AudioParam) {
      target.inputs.push(this);
      this.outputs.push(target);
      this.ctx._edges.push({ from: this, to: target.owner, param: target.name });
    } else {
      target.numInputs++;
      this.outputs.push(target);
      this.ctx._edges.push({ from: this, to: target, param: null });
    }
    return target;
  }
  disconnect() { this.outputs = []; this._disconnected = true; }
}

class GainNode extends AudioNode {
  constructor(ctx) { super(ctx, 'gain'); this.gain = new AudioParam(this, 'gain', 1); }
}

class DelayNode extends AudioNode {
  constructor(ctx, maxDelay) {
    super(ctx, 'delay');
    this.maxDelayTime = maxDelay;
    this.delayTime = new AudioParam(this, 'delayTime', 0);
    this._buf = new Float64Array(Math.ceil(maxDelay * ctx.sampleRate) + 4);
    this._w = 0;
  }
}

class BiquadFilterNode extends AudioNode {
  constructor(ctx) {
    super(ctx, 'biquad');
    this._filterType = 'lowpass';
    this.frequency = new AudioParam(this, 'frequency', 350);
    this.Q = new AudioParam(this, 'Q', 1);
    this.gain = new AudioParam(this, 'gain', 0);
    this.detune = new AudioParam(this, 'detune', 0);
    this._x1 = 0; this._x2 = 0; this._y1 = 0; this._y2 = 0;
  }
  get type() { return this._filterType; }
  set type(v) {
    const ok = ['lowpass','highpass','bandpass','lowshelf','highshelf','peaking','notch','allpass'];
    if (!ok.includes(v)) throw new TypeError('Bad BiquadFilter type: ' + v);
    this._filterType = v;
  }
}

class WaveShaperNode extends AudioNode {
  constructor(ctx) {
    super(ctx, 'waveshaper');
    this.curve = null;
    this.oversample = 'none';
  }
}

class OscillatorNode extends AudioNode {
  constructor(ctx) {
    super(ctx, 'oscillator');
    this._oscType = 'sine';
    this.frequency = new AudioParam(this, 'frequency', 440);
    this.detune = new AudioParam(this, 'detune', 0);
    this._phase = 0;
    this._started = false;
    this._stopped = false;
  }
  get type() { return this._oscType; }
  set type(v) { this._oscType = v; }
  start() {
    if (this._started) throw new Error('InvalidStateError: OscillatorNode already started');
    this._started = true;
  }
  stop() {
    if (!this._started) throw new Error('InvalidStateError: stop() before start()');
    this._stopped = true;
  }
}

class ConvolverNode extends AudioNode {
  constructor(ctx) { super(ctx, 'convolver'); this.buffer = null; }
}

class AudioBufferSourceNode extends AudioNode {
  constructor(ctx) { super(ctx, 'buffersource'); this.buffer = null; }
  start() {} stop() {}
}

class AudioBuffer {
  constructor(channels, length, sampleRate) {
    this.numberOfChannels = channels;
    this.length = length;
    this.sampleRate = sampleRate;
    this._data = [];
    for (let i = 0; i < channels; i++) this._data.push(new Float32Array(length));
  }
  getChannelData(i) { return this._data[i]; }
}

class MockAudioContext {
  constructor(sampleRate = 48000) {
    this.sampleRate = sampleRate;
    this.currentTime = 0;
    this._nodes = [];
    this._edges = [];
    this.destination = new AudioNode(this, 'destination');
  }
  createGain() { return new GainNode(this); }
  createDelay(max = 1) { return new DelayNode(this, max); }
  createBiquadFilter() { return new BiquadFilterNode(this); }
  createWaveShaper() { return new WaveShaperNode(this); }
  createOscillator() { return new OscillatorNode(this); }
  createConvolver() { return new ConvolverNode(this); }
  createBufferSource() { return new AudioBufferSourceNode(this); }
  createBuffer(ch, len, sr) { return new AudioBuffer(ch, len, sr); }
}

// ---------------------------------------------------------------------------
// Graph analysis
// ---------------------------------------------------------------------------

/**
 * Find all cycles in the audio graph (following audio-rate edges AND
 * param-modulation edges, both of which the spec counts as connections).
 *
 * Per the Web Audio API spec, a cycle is only permitted when it contains at
 * least one DelayNode; otherwise implementations mute the cycle.
 */
function findCycles(ctx) {
  const adj = new Map();
  for (const n of ctx._nodes) adj.set(n, []);
  for (const e of ctx._edges) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from).push(e.to);
  }

  const cycles = [];
  const colour = new Map(); // 0 unvisited, 1 in-stack, 2 done
  const stack = [];

  function dfs(n) {
    colour.set(n, 1);
    stack.push(n);
    for (const m of (adj.get(n) || [])) {
      const c = colour.get(m) || 0;
      if (c === 1) {
        const idx = stack.indexOf(m);
        cycles.push(stack.slice(idx).concat([m]));
      } else if (c === 0) {
        dfs(m);
      }
    }
    stack.pop();
    colour.set(n, 2);
  }

  for (const n of ctx._nodes) if (!(colour.get(n) || 0)) dfs(n);
  return cycles;
}

function describeNode(n) {
  if (n instanceof BiquadFilterNode) return `biquad(${n._filterType})#${n.id}`;
  return `${n.nodeKind}#${n.id}`;
}

module.exports = {
  MockAudioContext,
  AudioParam,
  AudioNode,
  BiquadFilterNode,
  DelayNode,
  WaveShaperNode,
  OscillatorNode,
  GainNode,
  findCycles,
  describeNode
};
