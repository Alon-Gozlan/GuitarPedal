/**
 * audio-engine.js - Web Audio API Recording and Playback Engine
 *
 * SECURITY DESIGN:
 * - Audio data is stored ONLY in JavaScript variables (in-memory).
 * - No data is written to localStorage, sessionStorage, IndexedDB, cookies, or disk.
 * - No audio data is transmitted over the network.
 * - All buffers are explicitly cleared on cleanup via clearAudioData().
 * - The beforeunload event triggers full cleanup when the page is closed or refreshed.
 * - Microphone access is requested only after explicit user interaction.
 */

'use strict';

var AudioEngine = (function() {
  // Private state - all audio data lives here in memory only
  var audioContext = null;
  var mediaStream = null;
  var mediaRecorder = null;
  var recordedChunks = [];      // Raw recorded chunks (cleared on stop/clear)
  var recordedBuffer = null;    // Decoded AudioBuffer (cleared on clear)
  var isRecording = false;
  var isPlaying = false;
  var currentSource = null;     // Currently playing AudioBufferSourceNode
  var currentEffect = null;     // Currently active effect chain
  var permissionGranted = false;

  // Callbacks for UI updates
  var onStateChange = null;

  /**
   * Notify the UI of state changes.
   * SECURITY: Only passes safe state information, never raw audio data.
   */
  function notifyStateChange() {
    if (typeof onStateChange === 'function') {
      onStateChange({
        permissionGranted: permissionGranted,
        isRecording: isRecording,
        isPlaying: isPlaying,
        hasRecording: recordedBuffer !== null
      });
    }
  }

  /**
   * Initialize the AudioContext.
   * SECURITY: AudioContext is created only after user interaction (click handler),
   * which is required by browser autoplay policies.
   */
  function initContext() {
    if (!audioContext) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) {
        throw new Error('Web Audio API is not supported in this browser.');
      }
      audioContext = new AC();
    }
    // Resume if suspended (browsers suspend until user gesture)
    if (audioContext.state === 'suspended') {
      return audioContext.resume();
    }
    return Promise.resolve();
  }

  /**
   * Request microphone permission.
   * SECURITY:
   * - Only called from a user-initiated click handler.
   * - Requests audio-only access (no video).
   * - Stores the stream reference so it can be stopped on cleanup.
   * - Error messages are generic to avoid leaking system information.
   */
  function requestMicrophoneAccess() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return Promise.reject(new Error(
        'Microphone access is not available. Please use a modern browser with HTTPS.'
      ));
    }

    return initContext().then(function() {
      return navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false  // SECURITY: Never request video access
      });
    }).then(function(stream) {
      mediaStream = stream;
      permissionGranted = true;
      notifyStateChange();
      return true;
    }).catch(function(err) {
      permissionGranted = false;
      notifyStateChange();
      // SECURITY: Return generic error messages to avoid exposing system details
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        throw new Error('Microphone permission was denied. Please allow access and try again.');
      } else if (err.name === 'NotFoundError') {
        throw new Error('No microphone found. Please connect a microphone and try again.');
      } else if (err.name === 'NotReadableError') {
        throw new Error('Microphone is in use by another application. Please close other apps and try again.');
      } else {
        throw new Error('Could not access the microphone. Please check your browser settings.');
      }
    });
  }

  /**
   * Start recording audio from the microphone.
   * SECURITY:
   * - Checks that permission was granted before starting.
   * - Previous recorded data is cleared before new recording begins.
   * - Audio chunks are stored only in the recordedChunks array (in-memory).
   */
  function startRecording() {
    if (!permissionGranted || !mediaStream) {
      return Promise.reject(new Error('Microphone permission not granted.'));
    }
    if (isRecording) {
      return Promise.reject(new Error('Already recording.'));
    }

    return initContext().then(function() {
      // Clear any previous recording data
      clearRecordedChunks();
      recordedBuffer = null;

      // Create MediaRecorder
      // SECURITY: Using default MIME type to avoid compatibility issues
      mediaRecorder = new MediaRecorder(mediaStream);

      mediaRecorder.ondataavailable = function(event) {
        if (event.data && event.data.size > 0) {
          recordedChunks.push(event.data);
        }
      };

      mediaRecorder.onstop = function() {
        isRecording = false;
        // Convert chunks to AudioBuffer
        var blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType });

        // SECURITY: Clear raw chunks immediately after creating blob
        clearRecordedChunks();

        var reader = new FileReader();
        reader.onloadend = function() {
          if (reader.result) {
            audioContext.decodeAudioData(reader.result).then(function(buffer) {
              recordedBuffer = buffer;
              notifyStateChange();
            }).catch(function() {
              // SECURITY: Generic error, don't expose decode details
              console.warn('Could not decode recorded audio.');
              notifyStateChange();
            });
          }
        };
        reader.readAsArrayBuffer(blob);
        // blob reference will be garbage collected after reader finishes
        notifyStateChange();
      };

      mediaRecorder.onerror = function() {
        isRecording = false;
        clearRecordedChunks();
        notifyStateChange();
      };

      mediaRecorder.start(100); // Collect data every 100ms
      isRecording = true;
      notifyStateChange();
    });
  }

  /**
   * Stop recording.
   * SECURITY: Raw chunks are cleared in the onstop handler above.
   */
  function stopRecording() {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
    }
  }

  /**
   * Play back the recorded audio with an optional effect applied.
   *
   * @param {string} effectName - Name of the effect ('reverb', 'delay', 'distortion', or 'none')
   * @param {object} effectParams - Parameters for the effect
   *
   * SECURITY: Effect name is validated by the createEffect function in effects.js.
   * Effect parameters are validated/clamped within each effect constructor.
   */
  function playRecording(effectName, effectParams) {
    if (!recordedBuffer) {
      return Promise.reject(new Error('No recording to play.'));
    }
    if (isPlaying) {
      stopPlayback();
    }

    return initContext().then(function() {
      // Create a buffer source node
      currentSource = audioContext.createBufferSource();
      currentSource.buffer = recordedBuffer;

      // Apply effect if requested
      if (effectName && effectName !== 'none') {
        currentEffect = createEffect(audioContext, effectName, effectParams || {});
        if (currentEffect) {
          currentSource.connect(currentEffect.input);
          currentEffect.output.connect(audioContext.destination);
        } else {
          // Unknown effect, play dry
          currentSource.connect(audioContext.destination);
        }
      } else {
        currentSource.connect(audioContext.destination);
      }

      currentSource.onended = function() {
        isPlaying = false;
        cleanupPlayback();
        notifyStateChange();
      };

      currentSource.start(0);
      isPlaying = true;
      notifyStateChange();
    });
  }

  /**
   * Stop current playback.
   */
  function stopPlayback() {
    if (currentSource && isPlaying) {
      try {
        currentSource.stop();
      } catch (e) {
        // Source may have already stopped
      }
    }
    isPlaying = false;
    cleanupPlayback();
    notifyStateChange();
  }

  /**
   * Clean up playback nodes.
   */
  function cleanupPlayback() {
    if (currentSource) {
      try { currentSource.disconnect(); } catch (e) { /* already disconnected */ }
      currentSource = null;
    }
    if (currentEffect) {
      try { currentEffect.destroy(); } catch (e) { /* already destroyed */ }
      currentEffect = null;
    }
  }

  /**
   * Clear raw recorded chunks from memory.
   * SECURITY: Explicitly nullifies each chunk reference.
   */
  function clearRecordedChunks() {
    for (var i = 0; i < recordedChunks.length; i++) {
      recordedChunks[i] = null;
    }
    recordedChunks = [];
  }

  /**
   * Clear ALL audio data from memory.
   * SECURITY: This is the primary data cleanup function.
   * Called on user "Clear" action and on page unload.
   */
  function clearAudioData() {
    // Stop any active recording
    if (isRecording) {
      stopRecording();
    }
    // Stop any active playback
    if (isPlaying) {
      stopPlayback();
    }

    // Clear recorded chunks
    clearRecordedChunks();

    // Clear decoded audio buffer
    recordedBuffer = null;

    // Clean up playback resources
    cleanupPlayback();

    notifyStateChange();
  }

  /**
   * Fully shut down: release microphone, close audio context, clear all data.
   * SECURITY: Called on page unload to ensure complete cleanup.
   */
  function destroy() {
    clearAudioData();

    // Stop and release the microphone stream
    if (mediaStream) {
      mediaStream.getTracks().forEach(function(track) {
        track.stop();
      });
      mediaStream = null;
    }

    // Close the audio context
    if (audioContext && audioContext.state !== 'closed') {
      audioContext.close().catch(function() {
        // Context close can fail if already closed, that's fine
      });
      audioContext = null;
    }

    mediaRecorder = null;
    permissionGranted = false;
    isRecording = false;
    isPlaying = false;
  }

  /**
   * Register a callback for state changes.
   */
  function setStateChangeCallback(callback) {
    if (typeof callback === 'function') {
      onStateChange = callback;
    }
  }

  /**
   * Get current engine state (read-only snapshot).
   * SECURITY: Only exposes boolean state flags, never raw audio data.
   */
  function getState() {
    return {
      permissionGranted: permissionGranted,
      isRecording: isRecording,
      isPlaying: isPlaying,
      hasRecording: recordedBuffer !== null
    };
  }

  // SECURITY: Register cleanup handlers for page unload.
  // This ensures audio data is cleared when the user navigates away,
  // closes the tab, or refreshes the page.
  window.addEventListener('beforeunload', function() {
    destroy();
  });

  window.addEventListener('pagehide', function() {
    destroy();
  });

  // Public API
  return {
    requestMicrophoneAccess: requestMicrophoneAccess,
    startRecording: startRecording,
    stopRecording: stopRecording,
    playRecording: playRecording,
    stopPlayback: stopPlayback,
    clearAudioData: clearAudioData,
    destroy: destroy,
    setStateChangeCallback: setStateChangeCallback,
    getState: getState
  };
})();
