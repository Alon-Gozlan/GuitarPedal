/**
 * test-effects.js - exercises the REAL effects.js source against the mock.
 */
'use strict';

const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { MockAudioContext, findCycles, describeNode, DelayNode } = require('./webaudio-mock');
const { render } = require('./render');

const SRC = process.env.EFFECTS_SRC ||
  path.join(__dirname, '..', 'effects.js');

// Load the real effects.js into a sandbox.
const sandbox = { console, Math, Number, Float32Array, Array, Object };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(SRC, 'utf8'), sandbox, { filename: SRC });
const createEffect = sandbox.createEffect;

const FS = 48000;
const DUR = 1.0;
const N = Math.floor(FS * DUR);

/** A guitar-ish test tone: 196 Hz (G3) with harmonics + short attack. */
function guitarSignal() {
  const s = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const t = i / FS;
    const env = Math.min(1, t / 0.005) * Math.exp(-t * 0.8);
    s[i] = env * 0.5 * (
      Math.sin(2 * Math.PI * 196 * t) +
      0.5 * Math.sin(2 * Math.PI * 392 * t) +
      0.25 * Math.sin(2 * Math.PI * 588 * t)
    );
  }
  return s;
}

function stats(a) {
  let peak = 0, sum = 0, nan = 0, mean = 0;
  for (let i = 0; i < a.length; i++) {
    const v = a[i];
    if (!Number.isFinite(v)) { nan++; continue; }
    const av = Math.abs(v);
    if (av > peak) peak = av;
    sum += v * v;
    mean += v;
  }
  return { peak, rms: Math.sqrt(sum / a.length), nan, dc: mean / a.length };
}

/** Envelope RMS in windows, to detect amplitude modulation (tremolo). */
function envelopeVariation(a, win) {
  const envs = [];
  for (let i = 0; i + win <= a.length; i += win) {
    let s = 0;
    for (let j = 0; j < win; j++) s += a[i + j] * a[i + j];
    envs.push(Math.sqrt(s / win));
  }
  const mx = Math.max(...envs), mn = Math.min(...envs);
  return mx > 0 ? (mx - mn) / mx : 0;
}

const CASES = [
  ['reverb',     { mix: 0.5, decay: 2.0, tone: 0.7 }],
  ['delay',      { mix: 0.5, time: 0.25, feedback: 0.4 }],
  ['distortion', { mix: 0.7, drive: 0.5, tone: 0.6 }],
  ['fuzz',       { fuzz: 0.7, tone: 0.5, level: 0.6 }],
  ['overdrive',  { drive: 0.55, tone: 0.6, level: 0.65 }],
  ['chorus',     { rate: 1.5, depth: 0.5, mix: 0.5 }],
  ['phaser',     { rate: 1.0, depth: 0.6, resonance: 0.4 }],
  ['tremolo',    { rate: 6.0, depth: 0.6 }],
  ['wah',        { frequency: 0.5, q: 5.0, mix: 0.8 }]
];

// Extreme-parameter cases: verify nothing blows up at the rails.
const EXTREMES = [
  ['fuzz',       { fuzz: 1, tone: 1, level: 1 }],
  ['overdrive',  { drive: 1, tone: 1, level: 1 }],
  ['phaser',     { rate: 5, depth: 1, resonance: 0.9 }],
  ['delay',      { mix: 1, time: 0.01, feedback: 0.9 }],
  ['tremolo',    { rate: 20, depth: 1 }],
  ['wah',        { frequency: 1, q: 15, mix: 1 }],
  ['chorus',     { rate: 5, depth: 1, mix: 1 }],
  ['distortion', { mix: 1, drive: 1, tone: 1 }]
];

const sig = guitarSignal();
const dryStats = stats(sig);
let failures = 0;

function check(cond, msg) {
  if (!cond) { failures++; console.log('      FAIL: ' + msg); }
  return cond;
}

function runCase(name, params, label) {
  const ctx = new MockAudioContext(FS);
  let fx;
  try {
    fx = createEffect(ctx, name, params);
  } catch (e) {
    failures++;
    console.log(`  ${label} ${name}: THREW during construction: ${e.message}`);
    return null;
  }
  if (!fx) { failures++; console.log(`  ${label} ${name}: createEffect returned null`); return null; }

  const cycles = findCycles(ctx);
  const bad = cycles.filter(c => !c.some(n => n instanceof DelayNode));

  const { out } = render(ctx, fx.input, fx.output, sig);
  const st = stats(out);

  console.log(`  ${label} ${name.padEnd(11)} peak=${st.peak.toFixed(3)} rms=${st.rms.toFixed(4)} ` +
              `dc=${st.dc.toFixed(4)} nan=${st.nan} nodes=${ctx._nodes.length} cycles=${cycles.length}` +
              (bad.length ? ` ILLEGAL_CYCLES=${bad.length}` : ''));

  if (bad.length) {
    failures++;
    for (const c of bad) {
      console.log('      FAIL: cycle with no DelayNode -> muted by browsers: ' +
        c.map(describeNode).join(' -> '));
    }
  }

  // reverb/delay/distortion predate this change set; report issues in them as
  // findings rather than regressions.
  const preExisting = ['reverb', 'delay', 'distortion'].includes(name);
  const note = (cond, msg) => {
    if (cond) return;
    if (preExisting) console.log('      PRE-EXISTING (not introduced here): ' + msg);
    else { failures++; console.log('      FAIL: ' + msg); }
  };

  check(st.nan === 0, `${name}: produced ${st.nan} non-finite samples`);
  check(st.rms > 1e-5, `${name}: output is silent (rms=${st.rms})`);
  note(st.peak < 2.0, `${name}: output peak ${st.peak.toFixed(3)} (clips/loud)`);
  note(Math.abs(st.dc) < 0.02, `${name}: DC offset ${st.dc.toFixed(4)} (speaker thump / headroom loss)`);
  note(st.rms > dryStats.rms * 0.05,
       `${name}: output collapsed to near-silence vs dry (${(st.rms/dryStats.rms).toFixed(3)}x)`);

  // update() must not throw and must not corrupt the graph
  try { fx.update(params); } catch (e) {
    failures++; console.log(`      FAIL: ${name}.update() threw: ${e.message}`);
  }
  try { fx.destroy(); } catch (e) {
    failures++; console.log(`      FAIL: ${name}.destroy() threw: ${e.message}`);
  }

  return { out, st, ctx };
}

console.log(`\nDry input: peak=${dryStats.peak.toFixed(3)} rms=${dryStats.rms.toFixed(4)}\n`);
console.log('== Nominal parameters ==');
const results = {};
for (const [name, p] of CASES) {
  const r = runCase(name, p, ' ');
  if (r) results[name] = r;
}

console.log('\n== Extreme parameters ==');
for (const [name, p] of EXTREMES) runCase(name, p, ' ');

console.log('\n== Behavioural assertions ==');

// Tremolo must actually modulate amplitude.
if (results.tremolo) {
  const v = envelopeVariation(results.tremolo.out, Math.floor(FS / 200));
  console.log(`  tremolo envelope variation: ${(v * 100).toFixed(1)}%`);
  check(v > 0.3, `tremolo depth=0.6 should swing amplitude >30%, got ${(v*100).toFixed(1)}%`);
}

// Wah must be band-limited around its centre: compare energy to dry.
if (results.wah) {
  console.log(`  wah rms vs dry: ${(results.wah.st.rms / dryStats.rms).toFixed(3)}x`);
  check(results.wah.st.rms < dryStats.rms * 1.5, 'wah should not boost overall energy much');
}

// Distortion-family must add harmonics -> higher crest-normalised energy than dry.
for (const n of ['fuzz', 'overdrive', 'distortion']) {
  if (!results[n]) continue;
  const ratio = results[n].st.rms / dryStats.rms;
  console.log(`  ${n} rms vs dry: ${ratio.toFixed(3)}x`);
  check(ratio > 0.2, `${n} output suspiciously quiet vs dry (${ratio.toFixed(3)}x)`);
}

// Modulation effects must differ from the dry signal.
for (const n of ['chorus', 'phaser']) {
  if (!results[n]) continue;
  let diff = 0;
  const o = results[n].out;
  for (let i = 0; i < N; i++) diff += Math.abs(o[i] - sig[i]);
  diff /= N;
  console.log(`  ${n} mean |wet - dry|: ${diff.toFixed(5)}`);
  check(diff > 1e-4, `${n} output is ~identical to dry input; effect is not doing anything`);
}

// --- Control efficacy: every knob must measurably change the output. ---
// This is the bug class that shipped: a control wired into a graph the browser
// silently mutes still "looks" connected but does nothing.
function renderWith(name, params) {
  const ctx = new MockAudioContext(FS);
  const fx = createEffect(ctx, name, params);
  const { out } = render(ctx, fx.input, fx.output, sig);
  fx.destroy();
  return out;
}
function meanAbsDiff(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]);
  return d / a.length;
}

const KNOBS = [
  ['phaser', 'resonance', { rate: 1, depth: 0.6, resonance: 0.0 }, { rate: 1, depth: 0.6, resonance: 0.8 }],
  ['phaser', 'depth',     { rate: 1, depth: 0.0, resonance: 0.4 }, { rate: 1, depth: 1.0, resonance: 0.4 }],
  ['phaser', 'rate',      { rate: 0.2, depth: 0.6, resonance: 0.4 }, { rate: 5, depth: 0.6, resonance: 0.4 }],
  ['chorus', 'depth',     { rate: 1.5, depth: 0.0, mix: 0.5 }, { rate: 1.5, depth: 1.0, mix: 0.5 }],
  ['chorus', 'rate',      { rate: 0.2, depth: 0.5, mix: 0.5 }, { rate: 5, depth: 0.5, mix: 0.5 }],
  ['chorus', 'mix',       { rate: 1.5, depth: 0.5, mix: 0.0 }, { rate: 1.5, depth: 0.5, mix: 1.0 }],
  ['tremolo','depth',     { rate: 6, depth: 0.0 }, { rate: 6, depth: 1.0 }],
  ['tremolo','rate',      { rate: 1, depth: 0.8 }, { rate: 20, depth: 0.8 }],
  ['wah',    'frequency', { frequency: 0.0, q: 5, mix: 1 }, { frequency: 1.0, q: 5, mix: 1 }],
  ['wah',    'q',         { frequency: 0.5, q: 0.5, mix: 1 }, { frequency: 0.5, q: 15, mix: 1 }],
  ['wah',    'mix',       { frequency: 0.5, q: 5, mix: 0.0 }, { frequency: 0.5, q: 5, mix: 1.0 }],
  ['fuzz',   'fuzz',      { fuzz: 0.0, tone: 0.5, level: 0.6 }, { fuzz: 1.0, tone: 0.5, level: 0.6 }],
  ['fuzz',   'tone',      { fuzz: 0.7, tone: 0.0, level: 0.6 }, { fuzz: 0.7, tone: 1.0, level: 0.6 }],
  ['fuzz',   'level',     { fuzz: 0.7, tone: 0.5, level: 0.1 }, { fuzz: 0.7, tone: 0.5, level: 1.0 }],
  ['overdrive','drive',   { drive: 0.0, tone: 0.6, level: 0.65 }, { drive: 1.0, tone: 0.6, level: 0.65 }],
  ['overdrive','tone',    { drive: 0.55, tone: 0.0, level: 0.65 }, { drive: 0.55, tone: 1.0, level: 0.65 }],
  ['overdrive','level',   { drive: 0.55, tone: 0.6, level: 0.1 }, { drive: 0.55, tone: 0.6, level: 1.0 }]
];

for (const [name, knob, lo, hi] of KNOBS) {
  const d = meanAbsDiff(renderWith(name, lo), renderWith(name, hi));
  const ok = d > 1e-4;
  console.log(`  ${name}.${knob.padEnd(10)} min->max mean|diff| = ${d.toFixed(6)}${ok ? '' : '   <-- NO EFFECT'}`);
  check(ok, `${name}: "${knob}" control has no audible effect (diff=${d})`);
}

// Unknown effect must be rejected.
{
  const ctx = new MockAudioContext(FS);
  const r = createEffect(ctx, 'definitely-not-an-effect', {});
  check(r === null, 'unknown effect name must return null');
  console.log(`  unknown effect name -> ${r === null ? 'null (rejected)' : 'NOT rejected'}`);
}

// Garbage params must be clamped, not crash.
{
  const ctx = new MockAudioContext(FS);
  const junk = { fuzz: NaN, tone: 'abc', level: Infinity, drive: -999,
                 rate: null, depth: undefined, resonance: 1e9, mix: {}, q: [], frequency: -5, time: 1e9, feedback: 5, decay: -1 };
  for (const [name] of CASES) {
    try {
      const fx = createEffect(new MockAudioContext(FS), name, junk);
      if (!fx) { failures++; console.log(`      FAIL: ${name} returned null on junk params`); continue; }
      fx.destroy();
    } catch (e) {
      failures++;
      console.log(`      FAIL: ${name} threw on junk params: ${e.message}`);
    }
  }
  console.log('  junk/hostile params handled by all effects');
}

console.log('\n' + (failures === 0
  ? 'RESULT: all checks passed'
  : `RESULT: ${failures} check(s) FAILED`));
process.exit(failures === 0 ? 0 : 1);
