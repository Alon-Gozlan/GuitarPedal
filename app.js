/**
 * app.js - Main Application Logic for Guitar Pedal
 *
 * SECURITY DESIGN:
 * - All UI event handlers validate state before performing actions.
 * - Effect parameters are validated/clamped before being passed to the audio engine.
 * - No eval(), innerHTML assignments with user data, or other dangerous patterns.
 * - Error messages shown to users are generic and do not expose internal state.
 * - No data is stored persistently (no localStorage, cookies, etc.).
 */

'use strict';

(function() {
  // ============================================================
  // DOM Element References
  // ============================================================
  var startBtn = document.getElementById('start-btn');
  var recordBtn = document.getElementById('record-btn');
  var playBtn = document.getElementById('play-btn');
  var clearBtn = document.getElementById('clear-btn');
  var effectSelect = document.getElementById('effect-select');

  // Status indicators
  var permissionStatus = document.getElementById('permission-status');
  var recordingStatus = document.getElementById('recording-status');
  var playbackStatus = document.getElementById('playback-status');
  var statusMessage = document.getElementById('status-message');

  // Effect parameter controls
  var paramGroup1 = document.getElementById('param-group-1');
  var paramGroup2 = document.getElementById('param-group-2');
  var paramGroup3 = document.getElementById('param-group-3');

  var param1Slider = document.getElementById('param-1');
  var param2Slider = document.getElementById('param-2');
  var param3Slider = document.getElementById('param-3');

  var param1Value = document.getElementById('param-1-value');
  var param2Value = document.getElementById('param-2-value');
  var param3Value = document.getElementById('param-3-value');

  var param1Label = document.getElementById('param-1-label');
  var param2Label = document.getElementById('param-2-label');
  var param3Label = document.getElementById('param-3-label');

  // LED indicators
  var permissionLed = document.getElementById('permission-led');
  var recordingLed = document.getElementById('recording-led');
  var playbackLed = document.getElementById('playback-led');

  // ============================================================
  // Effect Parameter Definitions
  // ============================================================
  var effectParams = {
    reverb: {
      param1: { label: 'Mix', min: 0, max: 100, default: 50, unit: '%' },
      param2: { label: 'Decay', min: 1, max: 50, default: 20, unit: 's' },
      param3: { label: 'Tone', min: 0, max: 100, default: 70, unit: '%' }
    },
    delay: {
      param1: { label: 'Mix', min: 0, max: 100, default: 50, unit: '%' },
      param2: { label: 'Time', min: 1, max: 200, default: 50, unit: 'ms' },
      param3: { label: 'Feedback', min: 0, max: 90, default: 40, unit: '%' }
    },
    distortion: {
      param1: { label: 'Mix', min: 0, max: 100, default: 70, unit: '%' },
      param2: { label: 'Drive', min: 0, max: 100, default: 50, unit: '%' },
      param3: { label: 'Tone', min: 0, max: 100, default: 60, unit: '%' }
    },
    fuzz: {
      param1: { label: 'Fuzz', min: 0, max: 100, default: 70, unit: '%' },
      param2: { label: 'Tone', min: 0, max: 100, default: 50, unit: '%' },
      param3: { label: 'Level', min: 0, max: 100, default: 60, unit: '%' }
    },
    overdrive: {
      param1: { label: 'Drive', min: 0, max: 100, default: 55, unit: '%' },
      param2: { label: 'Tone', min: 0, max: 100, default: 60, unit: '%' },
      param3: { label: 'Level', min: 0, max: 100, default: 65, unit: '%' }
    },
    chorus: {
      param1: { label: 'Rate', min: 1, max: 50, default: 15, unit: 'Hz' },
      param2: { label: 'Depth', min: 0, max: 100, default: 50, unit: '%' },
      param3: { label: 'Mix', min: 0, max: 100, default: 50, unit: '%' }
    },
    phaser: {
      param1: { label: 'Rate', min: 1, max: 50, default: 10, unit: 'Hz' },
      param2: { label: 'Depth', min: 0, max: 100, default: 60, unit: '%' },
      param3: { label: 'Resonance', min: 0, max: 90, default: 40, unit: '%' }
    },
    tremolo: {
      param1: { label: 'Rate', min: 10, max: 200, default: 60, unit: 'Hz' },
      param2: { label: 'Depth', min: 0, max: 100, default: 60, unit: '%' },
      param3: { label: '', min: 0, max: 0, default: 0, unit: '' }
    },
    wah: {
      param1: { label: 'Frequency', min: 0, max: 100, default: 50, unit: '%' },
      param2: { label: 'Q', min: 5, max: 150, default: 50, unit: '' },
      param3: { label: 'Mix', min: 0, max: 100, default: 80, unit: '%' }
    }
  };

  // ============================================================
  // UI State Management
  // ============================================================

  /**
   * Show a status message to the user.
   * SECURITY: Uses textContent (never innerHTML) to prevent XSS.
   */
  function showMessage(text, type) {
    if (statusMessage) {
      statusMessage.textContent = text;
      statusMessage.className = 'status-message ' + (type || 'info');
    }
  }

  /**
   * Update all UI elements based on the current audio engine state.
   */
  function updateUI(state) {
    // Update permission status
    if (state.permissionGranted) {
      permissionStatus.textContent = 'Microphone: Allowed';
      permissionStatus.className = 'status-badge active';
      if (permissionLed) permissionLed.className = 'led led-on';
      startBtn.disabled = true;
      startBtn.textContent = 'Connected';
      recordBtn.disabled = false;
    } else {
      permissionStatus.textContent = 'Microphone: Not Connected';
      permissionStatus.className = 'status-badge';
      if (permissionLed) permissionLed.className = 'led';
      startBtn.disabled = false;
      startBtn.textContent = 'Start';
      recordBtn.disabled = true;
    }

    // Update recording status
    if (state.isRecording) {
      recordingStatus.textContent = 'Recording...';
      recordingStatus.className = 'status-badge recording';
      if (recordingLed) recordingLed.className = 'led led-recording';
      recordBtn.textContent = 'Stop Recording';
      recordBtn.classList.add('active');
      playBtn.disabled = true;
      clearBtn.disabled = true;
    } else {
      recordingStatus.textContent = state.hasRecording ? 'Recording Ready' : 'No Recording';
      recordingStatus.className = 'status-badge' + (state.hasRecording ? ' active' : '');
      if (recordingLed) recordingLed.className = 'led' + (state.hasRecording ? ' led-ready' : '');
      recordBtn.textContent = 'Record';
      recordBtn.classList.remove('active');
      playBtn.disabled = !state.hasRecording;
      clearBtn.disabled = !state.hasRecording;
    }

    // Update playback status
    if (state.isPlaying) {
      playbackStatus.textContent = 'Playing...';
      playbackStatus.className = 'status-badge playing';
      if (playbackLed) playbackLed.className = 'led led-playing';
      playBtn.textContent = 'Stop';
      playBtn.classList.add('active');
      recordBtn.disabled = true;
    } else {
      playbackStatus.textContent = 'Stopped';
      playbackStatus.className = 'status-badge';
      if (playbackLed) playbackLed.className = 'led';
      playBtn.textContent = 'Play';
      playBtn.classList.remove('active');
      if (state.permissionGranted && !state.isRecording) {
        recordBtn.disabled = false;
      }
    }
  }

  /**
   * Configure the parameter sliders based on the selected effect.
   * SECURITY: Effect name is validated against known keys before use.
   */
  function configureEffectParams() {
    var selected = effectSelect.value;
    var config = effectParams[selected];

    if (!config) {
      // SECURITY: Unknown effect selected, hide all params
      paramGroup1.style.display = 'none';
      paramGroup2.style.display = 'none';
      paramGroup3.style.display = 'none';
      return;
    }

    // Param 1 (always Mix)
    paramGroup1.style.display = 'flex';
    param1Label.textContent = config.param1.label;
    param1Slider.min = config.param1.min;
    param1Slider.max = config.param1.max;
    param1Slider.value = config.param1.default;
    param1Value.textContent = config.param1.default + config.param1.unit;

    // Param 2
    paramGroup2.style.display = 'flex';
    param2Label.textContent = config.param2.label;
    param2Slider.min = config.param2.min;
    param2Slider.max = config.param2.max;
    param2Slider.value = config.param2.default;
    param2Value.textContent = config.param2.default + config.param2.unit;

    // Param 3 (hidden if label is empty, e.g. tremolo only uses 2 params)
    if (config.param3.label) {
      paramGroup3.style.display = 'flex';
      param3Label.textContent = config.param3.label;
      param3Slider.min = config.param3.min;
      param3Slider.max = config.param3.max;
      param3Slider.value = config.param3.default;
      param3Value.textContent = config.param3.default + config.param3.unit;
    } else {
      paramGroup3.style.display = 'none';
    }
  }

  /**
   * Read current effect parameters from sliders and convert to 0-1 range.
   * SECURITY: Values are clamped within the effects.js functions as a second layer.
   */
  function getEffectParams() {
    var selected = effectSelect.value;
    var config = effectParams[selected];
    if (!config) return {};

    var p1 = Number(param1Slider.value);
    var p2 = Number(param2Slider.value);
    var p3 = Number(param3Slider.value);

    // Validate that values are numbers
    if (!Number.isFinite(p1)) p1 = config.param1.default;
    if (!Number.isFinite(p2)) p2 = config.param2.default;
    if (!Number.isFinite(p3)) p3 = config.param3.default;

    switch (selected) {
      case 'reverb':
        return {
          mix: p1 / 100,
          decay: p2 / 10,   // slider 1-50 maps to 0.1-5.0s
          tone: p3 / 100
        };
      case 'delay':
        return {
          mix: p1 / 100,
          time: p2 / 100,        // slider 1-200 maps to 0.01-2.0s
          feedback: p3 / 100     // slider 0-90 maps to 0.0-0.9
        };
      case 'distortion':
        return {
          mix: p1 / 100,
          drive: p2 / 100,
          tone: p3 / 100
        };
      case 'fuzz':
        return {
          fuzz: p1 / 100,
          tone: p2 / 100,
          level: p3 / 100
        };
      case 'overdrive':
        return {
          drive: p1 / 100,
          tone: p2 / 100,
          level: p3 / 100
        };
      case 'chorus':
        return {
          rate: p1 / 10,        // slider 1-50 maps to 0.1-5.0 Hz
          depth: p2 / 100,
          mix: p3 / 100
        };
      case 'phaser':
        return {
          rate: p1 / 10,        // slider 1-50 maps to 0.1-5.0 Hz
          depth: p2 / 100,
          resonance: p3 / 100   // slider 0-90 maps to 0.0-0.9
        };
      case 'tremolo':
        return {
          rate: p1 / 10,        // slider 10-200 maps to 1-20 Hz
          depth: p2 / 100
        };
      case 'wah':
        return {
          frequency: p1 / 100,
          q: p2 / 10,           // slider 5-150 maps to 0.5-15
          mix: p3 / 100
        };
      default:
        return {};
    }
  }

  // ============================================================
  // Event Handlers
  // ============================================================

  /**
   * Start button: Initialize microphone access.
   * SECURITY: This is a user-initiated action (click), which satisfies
   * browser requirements for getUserMedia and AudioContext creation.
   */
  startBtn.addEventListener('click', function() {
    startBtn.disabled = true;
    startBtn.textContent = 'Connecting...';
    showMessage('Requesting microphone access...', 'info');

    AudioEngine.requestMicrophoneAccess().then(function() {
      showMessage('Microphone connected. Ready to record.', 'success');
    }).catch(function(err) {
      startBtn.disabled = false;
      startBtn.textContent = 'Start';
      showMessage(err.message, 'error');
    });
  });

  /**
   * Record button: Toggle recording on/off.
   */
  recordBtn.addEventListener('click', function() {
    var state = AudioEngine.getState();
    if (state.isRecording) {
      AudioEngine.stopRecording();
      showMessage('Recording stopped. Select an effect and press Play.', 'success');
    } else {
      AudioEngine.startRecording().then(function() {
        showMessage('Recording... Click "Stop Recording" when done.', 'info');
      }).catch(function(err) {
        showMessage(err.message, 'error');
      });
    }
  });

  /**
   * Play button: Play back recorded audio with selected effect.
   */
  playBtn.addEventListener('click', function() {
    var state = AudioEngine.getState();
    if (state.isPlaying) {
      AudioEngine.stopPlayback();
      showMessage('Playback stopped.', 'info');
    } else {
      var effectName = effectSelect.value;
      var params = getEffectParams();

      AudioEngine.playRecording(effectName, params).then(function() {
        showMessage('Playing with ' + effectName + ' effect...', 'info');
      }).catch(function(err) {
        showMessage(err.message, 'error');
      });
    }
  });

  /**
   * Clear button: Delete all recorded audio from memory.
   * SECURITY: Explicitly clears all audio buffers.
   */
  clearBtn.addEventListener('click', function() {
    AudioEngine.clearAudioData();
    showMessage('All audio data cleared from memory.', 'success');
  });

  /**
   * Effect selector: Update parameter controls when effect changes.
   */
  effectSelect.addEventListener('change', function() {
    configureEffectParams();
  });

  /**
   * Slider input handlers: Update displayed values.
   */
  param1Slider.addEventListener('input', function() {
    var config = effectParams[effectSelect.value];
    if (config) {
      param1Value.textContent = param1Slider.value + config.param1.unit;
    }
  });

  param2Slider.addEventListener('input', function() {
    var config = effectParams[effectSelect.value];
    if (config) {
      param2Value.textContent = param2Slider.value + config.param2.unit;
    }
  });

  param3Slider.addEventListener('input', function() {
    var config = effectParams[effectSelect.value];
    if (config) {
      param3Value.textContent = param3Slider.value + config.param3.unit;
    }
  });

  // ============================================================
  // Audio Engine State Change Callback
  // ============================================================
  AudioEngine.setStateChangeCallback(function(state) {
    updateUI(state);
  });

  // ============================================================
  // Initialization
  // ============================================================

  // Set initial UI state
  recordBtn.disabled = true;
  playBtn.disabled = true;
  clearBtn.disabled = true;
  configureEffectParams();

  // SECURITY: Register page cleanup to clear audio data
  window.addEventListener('beforeunload', function() {
    AudioEngine.destroy();
  });

  showMessage('Click "Start" to connect your microphone.', 'info');
})();
