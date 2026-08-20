/**
 * effects.js - Guitar Pedal DSP Effect Processors
 *
 * SECURITY: All audio processing happens client-side using the native Web Audio API.
 * No audio data is transmitted, stored to disk, or sent to any external service.
 * Effect parameters are validated before being applied to prevent unexpected behavior.
 */

'use strict';

/**
 * Clamps a numeric value between min and max.
 * SECURITY: Used to validate all user-controlled effect parameters
 * before they reach the Web Audio API nodes.
 */
function clampParam(value, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return min;
  }
  return Math.max(min, Math.min(max, num));
}

/**
 * Creates a reverb effect using a ConvolverNode with a generated impulse response.
 *
 * Parameters:
 *   mix    - Wet/dry mix (0 = fully dry, 1 = fully wet)
 *   decay  - Reverb tail length in seconds (0.1 to 5.0)
 *   tone   - High-frequency damping (0 = dark, 1 = bright)
 *
 * Returns an object with connect/disconnect/update/destroy methods.
 */
function createReverbEffect(audioContext, params) {
  // Validate parameters
  const mix = clampParam(params.mix, 0, 1);
  const decay = clampParam(params.decay, 0.1, 5.0);
  const tone = clampParam(params.tone, 0, 1);

  // Create nodes
  const inputGain = audioContext.createGain();
  const dryGain = audioContext.createGain();
  const wetGain = audioContext.createGain();
  const convolver = audioContext.createConvolver();
  const toneFilter = audioContext.createBiquadFilter();
  const outputGain = audioContext.createGain();

  // Configure tone filter (low-pass to simulate damping)
  toneFilter.type = 'lowpass';
  toneFilter.frequency.value = 1000 + tone * 19000; // 1kHz to 20kHz

  // Generate impulse response for reverb
  function generateImpulse(decayTime) {
    const sampleRate = audioContext.sampleRate;
    const length = Math.floor(sampleRate * decayTime);
    const impulse = audioContext.createBuffer(2, length, sampleRate);

    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        // Exponential decay with random noise
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decayTime);
      }
    }
    return impulse;
  }

  convolver.buffer = generateImpulse(decay);

  // Set wet/dry mix
  dryGain.gain.value = 1 - mix;
  wetGain.gain.value = mix;
  outputGain.gain.value = 1;

  // Signal routing:
  // input -> dryGain -> output (dry path)
  // input -> convolver -> toneFilter -> wetGain -> output (wet path)
  inputGain.connect(dryGain);
  dryGain.connect(outputGain);

  inputGain.connect(convolver);
  convolver.connect(toneFilter);
  toneFilter.connect(wetGain);
  wetGain.connect(outputGain);

  return {
    input: inputGain,
    output: outputGain,

    /** Update effect parameters with validation */
    update: function(newParams) {
      const newMix = clampParam(newParams.mix, 0, 1);
      const newDecay = clampParam(newParams.decay, 0.1, 5.0);
      const newTone = clampParam(newParams.tone, 0, 1);

      dryGain.gain.setValueAtTime(1 - newMix, audioContext.currentTime);
      wetGain.gain.setValueAtTime(newMix, audioContext.currentTime);
      toneFilter.frequency.setValueAtTime(1000 + newTone * 19000, audioContext.currentTime);

      // Regenerate impulse if decay changed significantly
      if (Math.abs(newDecay - decay) > 0.05) {
        convolver.buffer = generateImpulse(newDecay);
      }
    },

    /** Disconnect all nodes and release resources */
    destroy: function() {
      inputGain.disconnect();
      dryGain.disconnect();
      wetGain.disconnect();
      convolver.disconnect();
      toneFilter.disconnect();
      outputGain.disconnect();
      convolver.buffer = null;
    }
  };
}

/**
 * Creates a delay effect using a DelayNode with feedback.
 *
 * Parameters:
 *   mix      - Wet/dry mix (0 = fully dry, 1 = fully wet)
 *   time     - Delay time in seconds (0.01 to 2.0)
 *   feedback - Amount of delayed signal fed back (0 to 0.9, capped for stability)
 *
 * Returns an object with connect/disconnect/update/destroy methods.
 */
function createDelayEffect(audioContext, params) {
  // Validate parameters
  const mix = clampParam(params.mix, 0, 1);
  const time = clampParam(params.time, 0.01, 2.0);
  // SECURITY: Cap feedback below 1.0 to prevent infinite feedback loops
  // that could produce dangerously loud audio output
  const feedback = clampParam(params.feedback, 0, 0.9);

  // Create nodes
  const inputGain = audioContext.createGain();
  const dryGain = audioContext.createGain();
  const wetGain = audioContext.createGain();
  const delayNode = audioContext.createDelay(3.0); // Max 3s delay
  const feedbackGain = audioContext.createGain();
  const outputGain = audioContext.createGain();

  // Configure
  delayNode.delayTime.value = time;
  feedbackGain.gain.value = feedback;
  dryGain.gain.value = 1 - mix;
  wetGain.gain.value = mix;
  outputGain.gain.value = 1;

  // Signal routing:
  // input -> dryGain -> output (dry path)
  // input -> delay -> wetGain -> output (wet path)
  //                -> feedbackGain -> delay (feedback loop)
  inputGain.connect(dryGain);
  dryGain.connect(outputGain);

  inputGain.connect(delayNode);
  delayNode.connect(wetGain);
  wetGain.connect(outputGain);

  delayNode.connect(feedbackGain);
  feedbackGain.connect(delayNode);

  return {
    input: inputGain,
    output: outputGain,

    /** Update effect parameters with validation */
    update: function(newParams) {
      const newMix = clampParam(newParams.mix, 0, 1);
      const newTime = clampParam(newParams.time, 0.01, 2.0);
      const newFeedback = clampParam(newParams.feedback, 0, 0.9);

      dryGain.gain.setValueAtTime(1 - newMix, audioContext.currentTime);
      wetGain.gain.setValueAtTime(newMix, audioContext.currentTime);
      delayNode.delayTime.setValueAtTime(newTime, audioContext.currentTime);
      feedbackGain.gain.setValueAtTime(newFeedback, audioContext.currentTime);
    },

    /** Disconnect all nodes and release resources */
    destroy: function() {
      inputGain.disconnect();
      dryGain.disconnect();
      wetGain.disconnect();
      delayNode.disconnect();
      feedbackGain.disconnect();
      outputGain.disconnect();
    }
  };
}

/**
 * Creates a distortion effect using a WaveShaperNode.
 *
 * Parameters:
 *   mix    - Wet/dry mix (0 = fully dry, 1 = fully wet)
 *   drive  - Distortion intensity (0 = clean, 1 = heavy)
 *   tone   - Post-distortion tone (0 = dark, 1 = bright)
 *
 * Returns an object with connect/disconnect/update/destroy methods.
 */
function createDistortionEffect(audioContext, params) {
  // Validate parameters
  const mix = clampParam(params.mix, 0, 1);
  const drive = clampParam(params.drive, 0, 1);
  const tone = clampParam(params.tone, 0, 1);

  // Create nodes
  const inputGain = audioContext.createGain();
  const dryGain = audioContext.createGain();
  const wetGain = audioContext.createGain();
  const waveshaper = audioContext.createWaveShaper();
  const preGain = audioContext.createGain();
  const toneFilter = audioContext.createBiquadFilter();
  const postGain = audioContext.createGain();
  const outputGain = audioContext.createGain();

  // Generate distortion curve
  function makeDistortionCurve(amount) {
    const k = amount * 400;
    const samples = 44100;
    const curve = new Float32Array(samples);
    const deg = Math.PI / 180;
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }

  waveshaper.curve = makeDistortionCurve(drive);
  waveshaper.oversample = '4x'; // Reduce aliasing

  // Pre-gain boosts signal into distortion
  preGain.gain.value = 1 + drive * 3;

  // Post-gain compensates for volume increase
  postGain.gain.value = 1 / (1 + drive * 2);

  // Tone filter
  toneFilter.type = 'lowpass';
  toneFilter.frequency.value = 2000 + tone * 18000;

  // Wet/dry
  dryGain.gain.value = 1 - mix;
  wetGain.gain.value = mix;
  outputGain.gain.value = 1;

  // Signal routing:
  // input -> dryGain -> output (dry path)
  // input -> preGain -> waveshaper -> toneFilter -> postGain -> wetGain -> output (wet path)
  inputGain.connect(dryGain);
  dryGain.connect(outputGain);

  inputGain.connect(preGain);
  preGain.connect(waveshaper);
  waveshaper.connect(toneFilter);
  toneFilter.connect(postGain);
  postGain.connect(wetGain);
  wetGain.connect(outputGain);

  return {
    input: inputGain,
    output: outputGain,

    /** Update effect parameters with validation */
    update: function(newParams) {
      const newMix = clampParam(newParams.mix, 0, 1);
      const newDrive = clampParam(newParams.drive, 0, 1);
      const newTone = clampParam(newParams.tone, 0, 1);

      dryGain.gain.setValueAtTime(1 - newMix, audioContext.currentTime);
      wetGain.gain.setValueAtTime(newMix, audioContext.currentTime);
      preGain.gain.setValueAtTime(1 + newDrive * 3, audioContext.currentTime);
      postGain.gain.setValueAtTime(1 / (1 + newDrive * 2), audioContext.currentTime);
      toneFilter.frequency.setValueAtTime(2000 + newTone * 18000, audioContext.currentTime);
      waveshaper.curve = makeDistortionCurve(newDrive);
    },

    /** Disconnect all nodes and release resources */
    destroy: function() {
      inputGain.disconnect();
      dryGain.disconnect();
      wetGain.disconnect();
      waveshaper.disconnect();
      preGain.disconnect();
      toneFilter.disconnect();
      postGain.disconnect();
      outputGain.disconnect();
      waveshaper.curve = null;
    }
  };
}

/**
 * Creates a fuzz effect using a WaveShaperNode with aggressive clipping.
 * Inspired by Maestro Fuzztone / Big Muff / Fuzz Face.
 *
 * Parameters:
 *   fuzz  - Fuzz intensity (0 = mild, 1 = extreme saturation)
 *   tone  - Post-fuzz tone filter frequency (0 = dark, 1 = bright)
 *   level - Output gain (0 = silent, 1 = full)
 *
 * Returns an object with input/output nodes and update/destroy methods.
 */
function createFuzzEffect(audioContext, params) {
  var fuzz = clampParam(params.fuzz, 0, 1);
  var tone = clampParam(params.tone, 0, 1);
  var level = clampParam(params.level, 0, 1);

  var inputGain = audioContext.createGain();
  var outputGain = audioContext.createGain();
  var preGain = audioContext.createGain();
  var waveshaper = audioContext.createWaveShaper();
  var toneFilter = audioContext.createBiquadFilter();
  var postGain = audioContext.createGain();

  // Aggressive sigmoid clipping curve for thick fuzz sustain
  function makeFuzzCurve(amount) {
    var samples = 44100;
    var curve = new Float32Array(samples);
    var k = 1 + amount * 99; // 1 to 100 saturation
    for (var i = 0; i < samples; i++) {
      var x = (i * 2) / samples - 1;
      // Hard sigmoid with high saturation
      curve[i] = (Math.PI + k) * x / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }

  waveshaper.curve = makeFuzzCurve(fuzz);
  waveshaper.oversample = '4x';

  // Heavy pre-gain to push signal hard into clipping
  preGain.gain.value = 1 + fuzz * 6;

  // Tone filter: low-pass sweep from 500 Hz to 12 kHz
  toneFilter.type = 'lowpass';
  toneFilter.frequency.value = 500 + tone * 11500;

  // Output level
  postGain.gain.value = level;
  outputGain.gain.value = 1;

  // Signal routing: input -> preGain -> waveshaper -> toneFilter -> postGain -> output
  inputGain.connect(preGain);
  preGain.connect(waveshaper);
  waveshaper.connect(toneFilter);
  toneFilter.connect(postGain);
  postGain.connect(outputGain);

  return {
    input: inputGain,
    output: outputGain,

    update: function(newParams) {
      var newFuzz = clampParam(newParams.fuzz, 0, 1);
      var newTone = clampParam(newParams.tone, 0, 1);
      var newLevel = clampParam(newParams.level, 0, 1);

      preGain.gain.setValueAtTime(1 + newFuzz * 6, audioContext.currentTime);
      toneFilter.frequency.setValueAtTime(500 + newTone * 11500, audioContext.currentTime);
      postGain.gain.setValueAtTime(newLevel, audioContext.currentTime);
      waveshaper.curve = makeFuzzCurve(newFuzz);
    },

    destroy: function() {
      inputGain.disconnect();
      preGain.disconnect();
      waveshaper.disconnect();
      toneFilter.disconnect();
      postGain.disconnect();
      outputGain.disconnect();
      waveshaper.curve = null;
    }
  };
}

/**
 * Creates an overdrive effect using a WaveShaperNode with soft asymmetric clipping.
 * Inspired by the Tubescreamer TS-808.
 *
 * Parameters:
 *   drive - Drive intensity (0 = clean, 1 = heavy overdrive)
 *   tone  - Mid-range emphasis (0 = dark/scooped, 1 = bright/mid-forward)
 *   level - Output gain (0 = silent, 1 = full)
 *
 * Returns an object with input/output nodes and update/destroy methods.
 */
function createOverdriveEffect(audioContext, params) {
  var drive = clampParam(params.drive, 0, 1);
  var tone = clampParam(params.tone, 0, 1);
  var level = clampParam(params.level, 0, 1);

  var inputGain = audioContext.createGain();
  var outputGain = audioContext.createGain();
  var preGain = audioContext.createGain();
  var midBoost = audioContext.createBiquadFilter();
  var waveshaper = audioContext.createWaveShaper();
  var toneFilter = audioContext.createBiquadFilter();
  var postGain = audioContext.createGain();
  // Asymmetric clipping is what gives the TS-808 its warmth, but it also
  // shifts the waveform off zero. Block that DC before it reaches the output,
  // where it would cost headroom and thump the speaker on start/stop.
  var dcBlocker = audioContext.createBiquadFilter();
  dcBlocker.type = 'highpass';
  dcBlocker.frequency.value = 25;
  dcBlocker.Q.value = 0.707;

  // Soft asymmetric clipping (warmer than distortion, emphasizes even harmonics)
  function makeOverdriveCurve(amount) {
    var samples = 44100;
    var curve = new Float32Array(samples);
    for (var i = 0; i < samples; i++) {
      var x = (i * 2) / samples - 1;
      if (x >= 0) {
        // Soft clip positive side
        curve[i] = 1 - Math.exp(-x * (1 + amount * 5));
      } else {
        // Slightly harder clip negative side (asymmetry adds warmth)
        curve[i] = -(1 - Math.exp(x * (1 + amount * 3.5)));
      }
    }
    return curve;
  }

  waveshaper.curve = makeOverdriveCurve(drive);
  waveshaper.oversample = '4x';

  // Pre-gain into clipping
  preGain.gain.value = 1 + drive * 4;

  // Pre-emphasis: mid-range boost before clipping (TS-808 characteristic)
  midBoost.type = 'peaking';
  midBoost.frequency.value = 720; // Classic TS mid-hump frequency
  midBoost.Q.value = 0.7;
  midBoost.gain.value = 6 + drive * 6; // 6-12 dB mid boost

  // Post tone filter
  toneFilter.type = 'lowpass';
  toneFilter.frequency.value = 1500 + tone * 10500; // 1.5kHz to 12kHz

  // Output level
  postGain.gain.value = level;
  outputGain.gain.value = 1;

  // Signal routing:
  // input -> midBoost -> preGain -> waveshaper -> dcBlocker -> toneFilter -> postGain -> output
  inputGain.connect(midBoost);
  midBoost.connect(preGain);
  preGain.connect(waveshaper);
  waveshaper.connect(dcBlocker);
  dcBlocker.connect(toneFilter);
  toneFilter.connect(postGain);
  postGain.connect(outputGain);

  return {
    input: inputGain,
    output: outputGain,

    update: function(newParams) {
      var newDrive = clampParam(newParams.drive, 0, 1);
      var newTone = clampParam(newParams.tone, 0, 1);
      var newLevel = clampParam(newParams.level, 0, 1);

      preGain.gain.setValueAtTime(1 + newDrive * 4, audioContext.currentTime);
      midBoost.gain.setValueAtTime(6 + newDrive * 6, audioContext.currentTime);
      toneFilter.frequency.setValueAtTime(1500 + newTone * 10500, audioContext.currentTime);
      postGain.gain.setValueAtTime(newLevel, audioContext.currentTime);
      waveshaper.curve = makeOverdriveCurve(newDrive);
    },

    destroy: function() {
      inputGain.disconnect();
      midBoost.disconnect();
      preGain.disconnect();
      waveshaper.disconnect();
      dcBlocker.disconnect();
      toneFilter.disconnect();
      postGain.disconnect();
      outputGain.disconnect();
      waveshaper.curve = null;
    }
  };
}

/**
 * Creates a chorus effect using a modulated delay line.
 * Inspired by the Boss CE-2.
 *
 * Parameters:
 *   rate  - LFO speed in Hz (0.1 to 5.0)
 *   depth - Modulation depth (0 = subtle, 1 = deep)
 *   mix   - Wet/dry blend (0 = fully dry, 1 = fully wet)
 *
 * Returns an object with input/output nodes and update/destroy methods.
 */
function createChorusEffect(audioContext, params) {
  var rate = clampParam(params.rate, 0.1, 5.0);
  var depth = clampParam(params.depth, 0, 1);
  var mix = clampParam(params.mix, 0, 1);

  var inputGain = audioContext.createGain();
  var outputGain = audioContext.createGain();
  var dryGain = audioContext.createGain();
  var wetGain = audioContext.createGain();
  var delayNode = audioContext.createDelay(0.1);
  var lfo = audioContext.createOscillator();
  var lfoGain = audioContext.createGain();

  // Base delay of 25ms with modulation depth up to +/- 7ms
  delayNode.delayTime.value = 0.025;

  // LFO modulates the delay time
  lfo.type = 'sine';
  lfo.frequency.value = rate;
  lfoGain.gain.value = depth * 0.007; // Max 7ms sweep

  lfo.connect(lfoGain);
  lfoGain.connect(delayNode.delayTime);
  lfo.start();

  // Wet/dry mix
  dryGain.gain.value = 1 - mix;
  wetGain.gain.value = mix;
  outputGain.gain.value = 1;

  // Signal routing:
  // input -> dryGain -> output (dry path)
  // input -> delayNode -> wetGain -> output (modulated wet path)
  inputGain.connect(dryGain);
  dryGain.connect(outputGain);

  inputGain.connect(delayNode);
  delayNode.connect(wetGain);
  wetGain.connect(outputGain);

  return {
    input: inputGain,
    output: outputGain,

    update: function(newParams) {
      var newRate = clampParam(newParams.rate, 0.1, 5.0);
      var newDepth = clampParam(newParams.depth, 0, 1);
      var newMix = clampParam(newParams.mix, 0, 1);

      lfo.frequency.setValueAtTime(newRate, audioContext.currentTime);
      lfoGain.gain.setValueAtTime(newDepth * 0.007, audioContext.currentTime);
      dryGain.gain.setValueAtTime(1 - newMix, audioContext.currentTime);
      wetGain.gain.setValueAtTime(newMix, audioContext.currentTime);
    },

    destroy: function() {
      lfo.stop();
      lfo.disconnect();
      lfoGain.disconnect();
      inputGain.disconnect();
      dryGain.disconnect();
      wetGain.disconnect();
      delayNode.disconnect();
      outputGain.disconnect();
    }
  };
}

/**
 * Creates a phaser effect using cascaded allpass filters modulated by an LFO.
 * Inspired by the MXR Phase 90.
 *
 * Parameters:
 *   rate      - LFO speed in Hz (0.1 to 5.0)
 *   depth     - Frequency sweep range (0 = narrow, 1 = wide)
 *   resonance - Feedback amount for more pronounced sweeps (0 to 0.9)
 *
 * Returns an object with input/output nodes and update/destroy methods.
 */
function createPhaserEffect(audioContext, params) {
  var rate = clampParam(params.rate, 0.1, 5.0);
  var depth = clampParam(params.depth, 0, 1);
  // SECURITY: Cap resonance below 1.0 to prevent runaway feedback
  var resonance = clampParam(params.resonance, 0, 0.9);

  var inputGain = audioContext.createGain();
  var outputGain = audioContext.createGain();
  var dryGain = audioContext.createGain();
  var wetGain = audioContext.createGain();
  var feedbackGain = audioContext.createGain();
  // The feedback path MUST contain a DelayNode. The Web Audio spec only
  // permits a cycle in the graph when a DelayNode is present in it; without
  // one the whole cycle is muted and the Resonance control does nothing.
  var feedbackDelay = audioContext.createDelay(0.05);
  feedbackDelay.delayTime.value = 0.002; // 2 ms - short enough to stay a phaser

  // 6 cascaded allpass filters for deep phase shifting
  var numStages = 6;
  var allpassFilters = [];
  var stageFreqs = [200, 400, 800, 1600, 3200, 6400];
  for (var i = 0; i < numStages; i++) {
    var filter = audioContext.createBiquadFilter();
    filter.type = 'allpass';
    filter.frequency.value = stageFreqs[i];
    filter.Q.value = 0.5;
    allpassFilters.push(filter);
  }

  // LFO modulates allpass filter frequencies.
  // The sweep is limited to +/-60% of each stage's base frequency so the
  // filter frequency can never approach 0 Hz, where a biquad allpass turns
  // degenerate and rings loudly.
  var SWEEP = 0.6;
  var lfo = audioContext.createOscillator();
  var lfoGains = [];
  lfo.type = 'sine';
  lfo.frequency.value = rate;

  for (var j = 0; j < numStages; j++) {
    var lg = audioContext.createGain();
    lg.gain.value = stageFreqs[j] * SWEEP * depth;
    lfo.connect(lg);
    lg.connect(allpassFilters[j].frequency);
    lfoGains.push(lg);
  }
  lfo.start();

  // Mix and feedback
  dryGain.gain.value = 0.5;
  wetGain.gain.value = 0.5;
  feedbackGain.gain.value = resonance;
  outputGain.gain.value = 1;

  // Chain allpass filters in series
  inputGain.connect(allpassFilters[0]);
  for (var k = 0; k < numStages - 1; k++) {
    allpassFilters[k].connect(allpassFilters[k + 1]);
  }

  // Dry path
  inputGain.connect(dryGain);
  dryGain.connect(outputGain);

  // Wet path from last allpass
  allpassFilters[numStages - 1].connect(wetGain);
  wetGain.connect(outputGain);

  // Feedback from last allpass back to first, via the delay that makes the
  // cycle legal under the Web Audio spec.
  allpassFilters[numStages - 1].connect(feedbackGain);
  feedbackGain.connect(feedbackDelay);
  feedbackDelay.connect(allpassFilters[0]);

  return {
    input: inputGain,
    output: outputGain,

    update: function(newParams) {
      var newRate = clampParam(newParams.rate, 0.1, 5.0);
      var newDepth = clampParam(newParams.depth, 0, 1);
      var newResonance = clampParam(newParams.resonance, 0, 0.9);

      lfo.frequency.setValueAtTime(newRate, audioContext.currentTime);
      feedbackGain.gain.setValueAtTime(newResonance, audioContext.currentTime);
      for (var i = 0; i < numStages; i++) {
        lfoGains[i].gain.setValueAtTime(stageFreqs[i] * SWEEP * newDepth, audioContext.currentTime);
      }
    },

    destroy: function() {
      lfo.stop();
      lfo.disconnect();
      for (var i = 0; i < numStages; i++) {
        lfoGains[i].disconnect();
        allpassFilters[i].disconnect();
      }
      inputGain.disconnect();
      dryGain.disconnect();
      wetGain.disconnect();
      feedbackGain.disconnect();
      feedbackDelay.disconnect();
      outputGain.disconnect();
    }
  };
}

/**
 * Creates a tremolo effect using LFO-modulated amplitude.
 * Classic volume wobble effect.
 *
 * Parameters:
 *   rate  - LFO speed in Hz (1 to 20)
 *   depth - Modulation intensity (0 = no effect, 1 = full tremolo)
 *
 * Returns an object with input/output nodes and update/destroy methods.
 */
function createTremoloEffect(audioContext, params) {
  var rate = clampParam(params.rate, 1, 20);
  var depth = clampParam(params.depth, 0, 1);

  var inputGain = audioContext.createGain();
  var outputGain = audioContext.createGain();
  var tremoloGain = audioContext.createGain();
  var lfo = audioContext.createOscillator();
  var lfoGain = audioContext.createGain();

  // LFO modulates amplitude
  // The gain oscillates between (1 - depth) and 1
  tremoloGain.gain.value = 1 - depth / 2;

  lfo.type = 'sine';
  lfo.frequency.value = rate;

  // LFO output range is -1 to 1; scale to -depth/2 to +depth/2
  lfoGain.gain.value = depth / 2;

  lfo.connect(lfoGain);
  lfoGain.connect(tremoloGain.gain);
  lfo.start();

  outputGain.gain.value = 1;

  // Signal routing: input -> tremoloGain -> output
  inputGain.connect(tremoloGain);
  tremoloGain.connect(outputGain);

  return {
    input: inputGain,
    output: outputGain,

    update: function(newParams) {
      var newRate = clampParam(newParams.rate, 1, 20);
      var newDepth = clampParam(newParams.depth, 0, 1);

      lfo.frequency.setValueAtTime(newRate, audioContext.currentTime);
      tremoloGain.gain.setValueAtTime(1 - newDepth / 2, audioContext.currentTime);
      lfoGain.gain.setValueAtTime(newDepth / 2, audioContext.currentTime);
    },

    destroy: function() {
      lfo.stop();
      lfo.disconnect();
      lfoGain.disconnect();
      inputGain.disconnect();
      tremoloGain.disconnect();
      outputGain.disconnect();
    }
  };
}

/**
 * Creates a wah-wah effect using a resonant bandpass filter.
 * Inspired by the VOX wah pedal.
 *
 * Parameters:
 *   frequency - Filter center frequency (0 = low 200Hz, 1 = high 2000Hz)
 *   q         - Filter resonance / Q factor (0.5 to 15)
 *   mix       - Wet/dry blend (0 = fully dry, 1 = fully wet)
 *
 * Returns an object with input/output nodes and update/destroy methods.
 */
function createWahEffect(audioContext, params) {
  var frequency = clampParam(params.frequency, 0, 1);
  var q = clampParam(params.q, 0.5, 15);
  var mix = clampParam(params.mix, 0, 1);

  var inputGain = audioContext.createGain();
  var outputGain = audioContext.createGain();
  var dryGain = audioContext.createGain();
  var wetGain = audioContext.createGain();
  var wahFilter = audioContext.createBiquadFilter();

  // A resonant PEAKING filter sweeping 200 Hz -> 2000 Hz.
  //
  // A pure bandpass is the textbook wah, but at high Q it throws away every
  // frequency outside the band: sweep the band away from the note's harmonics
  // and the guitar drops to near-silence. A peaking filter passes the whole
  // signal and boosts the swept band instead, so the resonance still gives the
  // vocal "wah" while the note is always audible.
  var PEAK_GAIN_DB = 16;
  wahFilter.type = 'peaking';
  wahFilter.frequency.value = 200 + frequency * 1800;
  wahFilter.Q.value = q;
  wahFilter.gain.value = PEAK_GAIN_DB;

  // Wet/dry mix
  dryGain.gain.value = 1 - mix;
  wetGain.gain.value = mix;
  outputGain.gain.value = 1;

  // Signal routing:
  // input -> dryGain -> output (dry path)
  // input -> wahFilter -> wetGain -> output (filtered wet path)
  inputGain.connect(dryGain);
  dryGain.connect(outputGain);

  inputGain.connect(wahFilter);
  wahFilter.connect(wetGain);
  wetGain.connect(outputGain);

  return {
    input: inputGain,
    output: outputGain,

    update: function(newParams) {
      var newFrequency = clampParam(newParams.frequency, 0, 1);
      var newQ = clampParam(newParams.q, 0.5, 15);
      var newMix = clampParam(newParams.mix, 0, 1);

      wahFilter.frequency.setValueAtTime(200 + newFrequency * 1800, audioContext.currentTime);
      wahFilter.Q.setValueAtTime(newQ, audioContext.currentTime);
      dryGain.gain.setValueAtTime(1 - newMix, audioContext.currentTime);
      wetGain.gain.setValueAtTime(newMix, audioContext.currentTime);
    },

    destroy: function() {
      inputGain.disconnect();
      dryGain.disconnect();
      wetGain.disconnect();
      wahFilter.disconnect();
      outputGain.disconnect();
    }
  };
}

/**
 * Factory function: creates the appropriate effect based on name.
 * SECURITY: Only known effect names are accepted; unknown names return null.
 */
function createEffect(audioContext, effectName, params) {
  switch (effectName) {
    case 'reverb':
      return createReverbEffect(audioContext, params);
    case 'delay':
      return createDelayEffect(audioContext, params);
    case 'distortion':
      return createDistortionEffect(audioContext, params);
    case 'fuzz':
      return createFuzzEffect(audioContext, params);
    case 'overdrive':
      return createOverdriveEffect(audioContext, params);
    case 'chorus':
      return createChorusEffect(audioContext, params);
    case 'phaser':
      return createPhaserEffect(audioContext, params);
    case 'tremolo':
      return createTremoloEffect(audioContext, params);
    case 'wah':
      return createWahEffect(audioContext, params);
    default:
      // SECURITY: Reject unknown effect names
      console.warn('Unknown effect type requested:', effectName);
      return null;
  }
}
