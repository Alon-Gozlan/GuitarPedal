# Tests

Zero-dependency checks for the effect DSP and the UI wiring. Plain Node, no
npm install, matching the project's no-build-step philosophy.

```bash
node tests/run.js
```

## What these are

`webaudio-mock.js` is a small stand-in for the subset of the Web Audio API that
`effects.js` uses. It does two things:

1. **Records the graph** each effect builds, so the topology can be analysed —
   illegal cycles, orphaned nodes, parameters wired to nothing.
2. **Renders audio** through DSP kernels that follow the spec's formulas
   (BiquadFilter uses the Audio-EQ-Cookbook coefficients the spec specifies,
   WaveShaper uses the spec's curve-interpolation rule, DelayNode interpolates
   a fractional delay line).

`test-effects.js` runs the real `effects.js` through that mock: every effect at
nominal and extreme settings, checking for non-finite samples, silence, runaway
levels, DC offset, and illegal graph cycles. It then asserts that **every knob
measurably changes the output** — a control can look connected and do nothing.

`test-ui.js` runs the real `app.js` against a DOM stub, pushes each slider to
both rails, and intercepts what gets handed to the audio engine. This catches
sliders whose travel maps outside the range `clampParam()` accepts, which would
leave part of the knob silently clamped.

## What these are NOT

**This is not a browser.** It cannot prove how Chrome, Firefox, or Safari
actually behave. Notably:

- `ConvolverNode` is modelled as a passthrough, so the reverb wet path is not
  really exercised. Reverb's numbers in the output are not meaningful.
- Cycle muting is modelled from the spec's rule (a cycle is only permitted when
  it contains a `DelayNode`); real engines may differ in the details of how they
  break the cycle.
- `oversample` on `WaveShaperNode` is ignored, so aliasing is not measured.
- Timing, scheduling, and `AudioParam` automation curves are simplified to
  per-sample values.

Treat a pass as "the DSP math and the wiring are sane", not as "verified in a
browser". Anything that matters for release should still be listened to on real
hardware.

## Known finding, not introduced by these tests

`delay` at `mix=1, feedback=0.9` peaks around 3.0x the dry signal, because
successive echoes sum. The feedback cap of 0.9 keeps it from diverging but does
not bound the sum. This predates the effects added alongside these tests and is
reported rather than silently changed.
