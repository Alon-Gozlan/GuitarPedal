# Guitar Pedal - Browser-Based Digital Audio Effects

A secure, browser-based digital guitar pedal application that records audio from your microphone, applies real-time DSP effects (reverb, delay, distortion), and plays back the processed audio. All processing happens entirely in your browser.

## Security Features

This application was designed with security and privacy as the primary concern:

- **100% Client-Side Processing** - All audio recording, processing, and playback happens in the browser. No server communication whatsoever.
- **No Persistent Storage** - Audio is held only in JavaScript memory. Nothing is written to localStorage, cookies, IndexedDB, or disk.
- **Explicit Consent** - Microphone access is requested only after the user clicks the "Start" button. No auto-requests.
- **Automatic Cleanup** - All audio data is cleared from memory when the page is closed, refreshed, or the user clicks "Clear."
- **No External Dependencies** - Built with pure HTML, CSS, and JavaScript using only native Web Audio API and MediaDevices API. No third-party libraries.
- **Content Security Policy** - Strict CSP headers prevent script injection, block network requests, and disable plugins.
- **No Tracking** - Zero analytics, telemetry, or external resource loading. Works completely offline after first load.
- **Input Validation** - All effect parameters are validated and clamped to safe ranges before reaching audio processing nodes.

See [SECURITY.md](SECURITY.md) for a detailed breakdown of every security measure.

## HTTPS Requirement

**This app requires HTTPS to function.** Browsers block microphone access on non-HTTPS pages (except `localhost`). If you open `index.html` directly by double-clicking, the microphone will not work.

The recommended deployment method is **GitHub Pages**, which provides free HTTPS hosting. See [DEPLOYMENT.md](DEPLOYMENT.md) for step-by-step instructions.

## How to Use

1. Open the app in your browser (via HTTPS)
2. Click **Start** to connect your microphone
3. Click **Record** to capture audio
4. Click **Record** again to stop
5. Select an effect (Reverb, Delay, or Distortion)
6. Adjust the effect parameters with the sliders
7. Click **Play** to hear your processed audio
8. Click **Clear** to delete all audio from memory

## Browser Compatibility

| Browser | Supported |
|---------|-----------|
| Chrome 66+ | Yes |
| Firefox 76+ | Yes |
| Edge 79+ | Yes |
| Safari 14.1+ | Yes |
| Mobile Chrome | Yes |
| Mobile Safari | Yes |

Older browsers that lack Web Audio API or MediaDevices API support will not work.

## File Structure

```
index.html        - Main page with CSP meta tags
styles.css        - Guitar pedal visual design
app.js            - UI logic and event handling
audio-engine.js   - Recording and playback engine
effects.js        - DSP effect processors (reverb, delay, distortion)
README.md         - This file
DEPLOYMENT.md     - Step-by-step deployment guide for non-technical users
SECURITY.md       - Detailed security documentation
```

## Effects

### Reverb
Simulates the sound of a room or hall using convolution with a generated impulse response.
- **Mix** - Blend between dry (original) and wet (reverb) signal
- **Decay** - Length of the reverb tail
- **Tone** - High-frequency damping (dark to bright)

### Delay
Repeating echo effect with adjustable timing and feedback.
- **Mix** - Blend between dry and delayed signal
- **Time** - Delay time between repeats
- **Feedback** - Amount of signal fed back (capped at 90% for safety)

### Distortion
Overdrives the signal using waveshaping for gritty, saturated tones.
- **Mix** - Blend between clean and distorted signal
- **Drive** - Distortion intensity
- **Tone** - Post-distortion brightness

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed instructions. The easiest method is GitHub Pages (free, takes about 10 minutes, no coding required).

## Testing Checklist

After deployment, verify:

- [ ] Microphone permission prompt appears when clicking "Start"
- [ ] Recording captures audio (recording LED pulses red)
- [ ] Effects can be selected and parameters adjusted
- [ ] Processed audio plays back correctly
- [ ] No console errors in browser DevTools (F12 > Console)
- [ ] Works in Chrome, Firefox, and Edge
- [ ] No network requests visible in DevTools Network tab
- [ ] No localStorage/cookies visible in DevTools Application tab
- [ ] Audio data is cleared after clicking "Clear"
- [ ] Audio data is cleared after refreshing the page

## Local Testing

For development purposes, you can use a local server:

```bash
# Python 3
python3 -m http.server 8000

# Then visit http://localhost:8000
```

Note: `localhost` is treated as a secure context by most browsers, so microphone access works without HTTPS during local development.

## License

This project is provided as-is for educational and personal use.
