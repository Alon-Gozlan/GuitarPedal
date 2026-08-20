/**
 * test-ui.js - drives the REAL app.js against a DOM stub.
 *
 * Verifies that slider travel maps onto the range each effect actually
 * accepts. If a slider maps outside the clampParam() range, that part of the
 * knob's travel is silently clamped and does nothing.
 */
'use strict';

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const APP = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const EFFECTS = fs.readFileSync(path.join(ROOT, 'effects.js'), 'utf8');

let failures = 0;
const fail = m => { failures++; console.log('  FAIL: ' + m); };

// --- 1. Extract the accepted range of every effect parameter from effects.js
// by reading its clampParam(params.X, lo, hi) calls, per factory function.
const ranges = {};
const fnRe = /function create(\w+?)Effect\s*\(audioContext, params\)\s*\{([\s\S]*?)\n\}/g;
let m;
while ((m = fnRe.exec(EFFECTS))) {
  const key = m[1].toLowerCase();
  const body = m[2];
  const r = {};
  const cRe = /clampParam\(\s*params\.(\w+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)/g;
  let c;
  while ((c = cRe.exec(body))) r[c[1]] = [parseFloat(c[2]), parseFloat(c[3])];
  ranges[key] = r;
}

// --- 2. Effect names offered in the HTML <select>
const options = [...HTML.matchAll(/<option value="([^"]+)"/g)].map(x => x[1]);
console.log('HTML offers effects: ' + options.join(', ') + '\n');

// --- 3. DOM stub
function mkEl(id) {
  return {
    id, value: '0', textContent: '', className: '', disabled: false,
    min: '0', max: '100', style: {}, _listeners: {},
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener(ev, fn) { (this._listeners[ev] = this._listeners[ev] || []).push(fn); },
    fire(ev) { (this._listeners[ev] || []).forEach(f => f.call(this, {})); }
  };
}
const els = {};
const ids = ['start-btn','record-btn','play-btn','clear-btn','effect-select',
  'permission-status','recording-status','playback-status','status-message',
  'param-group-1','param-group-2','param-group-3','param-1','param-2','param-3',
  'param-1-value','param-2-value','param-3-value','param-1-label','param-2-label',
  'param-3-label','permission-led','recording-led','playback-led'];
ids.forEach(i => els[i] = mkEl(i));

let captured = null;
const sandbox = {
  console, Math, Number, Object, Array, Promise,
  document: { getElementById: id => els[id] || null, addEventListener() {} },
  window: { addEventListener() {} },
  AudioEngine: {
    getState: () => ({ permissionGranted: true, isRecording: false, isPlaying: false, hasRecording: true }),
    setStateChangeCallback() {},
    requestMicrophoneAccess: () => Promise.resolve(),
    startRecording: () => Promise.resolve(),
    stopRecording() {}, stopPlayback() {}, clearAudioData() {}, destroy() {},
    playRecording(name, params) { captured = { name, params }; return Promise.resolve(); }
  }
};
vm.createContext(sandbox);
vm.runInContext(APP, sandbox, { filename: 'app.js' });

// --- 4. For each effect, push each slider to both rails and read what app.js
// actually hands the audio engine.
console.log('Slider travel -> engine value (checked against clampParam range):\n');

for (const fxName of options) {
  els['effect-select'].value = fxName;
  els['effect-select'].fire('change'); // configureEffectParams()

  const sliders = ['param-1', 'param-2', 'param-3'];
  const groups = ['param-group-1', 'param-group-2', 'param-group-3'];
  const accepted = ranges[fxName] || {};

  // Which params does this effect's UI expose?
  const shown = groups.map(g => els[g].style.display !== 'none');

  for (const end of ['min', 'max']) {
    sliders.forEach((s, i) => {
      els[s].value = end === 'min' ? els[s].min : els[s].max;
    });
    captured = null;
    els['play-btn'].fire('click');
    if (!captured) { fail(`${fxName}: play handler produced no params`); continue; }

    const p = captured.params;
    if (captured.name !== fxName) fail(`${fxName}: engine got effect name "${captured.name}"`);

    for (const key of Object.keys(p)) {
      const val = p[key];
      const rng = accepted[key];
      if (!rng) {
        fail(`${fxName}: app.js sends "${key}" but ${fxName} effect never reads params.${key}`);
        continue;
      }
      const [lo, hi] = rng;
      const tag = `${fxName}.${key}`.padEnd(22);
      const outside = val < lo - 1e-9 || val > hi + 1e-9;
      if (end === 'min') {
        console.log(`  ${tag} ${end}=${String(val).padEnd(8)} accepted[${lo}, ${hi}]${outside ? '  <-- OUT OF RANGE' : ''}`);
      } else {
        console.log(`  ${tag} ${end}=${String(val).padEnd(8)} accepted[${lo}, ${hi}]${outside ? '  <-- OUT OF RANGE' : ''}`);
      }
      if (outside) fail(`${tag.trim()} slider ${end} maps to ${val}, outside accepted [${lo}, ${hi}] -> silently clamped`);
    }

    // Every param the effect accepts should be driven by the UI.
    if (end === 'max') {
      for (const key of Object.keys(accepted)) {
        if (!(key in p)) fail(`${fxName}: effect accepts "${key}" but app.js never sends it`);
      }
    }
  }

  // Reachability: does the slider's max actually reach the top of the range?
  for (const key of Object.keys(accepted)) {
    if (!(key in (captured?.params || {}))) continue;
    const [lo, hi] = accepted[key];
    const v = captured.params[key];
    if (v < hi - (hi - lo) * 0.001 && Math.abs(v - hi) > 1e-9) {
      console.log(`     note: ${fxName}.${key} max slider reaches ${v}, range top is ${hi}`);
    }
  }
  console.log('');
}

// --- 5. Every HTML option must have a config, and vice versa.
const cfgNames = [...APP.matchAll(/^\s{4}(\w+):\s*\{$/gm)].map(x => x[1]);
for (const o of options) if (!cfgNames.includes(o)) fail(`HTML offers "${o}" but app.js effectParams has no entry`);
for (const c of cfgNames) if (!options.includes(c)) fail(`app.js configures "${c}" but HTML has no <option>`);
console.log('effectParams entries: ' + cfgNames.join(', '));

console.log('\n' + (failures === 0 ? 'UI RESULT: all checks passed' : `UI RESULT: ${failures} check(s) FAILED`));
process.exit(failures === 0 ? 0 : 1);
