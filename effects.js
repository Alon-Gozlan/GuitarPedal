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
    default:
      // SECURITY: Reject unknown effect names
      console.warn('Unknown effect type requested:', effectName);
      return null;
  }
}
