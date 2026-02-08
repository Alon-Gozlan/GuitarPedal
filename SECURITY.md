# Security Documentation

This document explains every security measure implemented in the Guitar Pedal application and the reasoning behind each decision.

---

## Overview

The Guitar Pedal app was built with a "security-first" approach. The core principle is simple: **your audio data never leaves your device**. There is no server, no database, no tracking, and no way for anyone (including the app developer) to access your recordings.

---

## Security Measures

### 1. No Data Transmission to Servers

**What this means:** The app never sends any data over the internet. Period.

**How it's implemented:**
- The Content Security Policy includes `connect-src 'none'`, which instructs the browser to block ALL outbound network requests (fetch, XMLHttpRequest, WebSocket, etc.)
- There are no API calls, analytics scripts, or telemetry endpoints anywhere in the code
- No third-party services are loaded (no CDNs, no fonts, no tracking pixels)
- The app functions identically with or without an internet connection after the initial page load

**Why this matters:** Even if a bug were introduced into the code, the CSP header would prevent data from being sent to any external server.

---

### 2. No Persistent Storage

**What this means:** Nothing is saved to your device permanently. When you close the tab, everything is gone.

**How it's implemented:**
- Audio data is stored exclusively in JavaScript variables (RAM)
- No use of `localStorage`, `sessionStorage`, `IndexedDB`, `cookies`, or the File System API
- The `beforeunload` and `pagehide` events trigger the `destroy()` function, which:
  - Stops any active recording
  - Stops any active playback
  - Nullifies all audio buffer references
  - Stops the microphone stream
  - Closes the AudioContext
- The `clearAudioData()` function explicitly sets all buffer references to `null`, allowing garbage collection

**Why this matters:** After closing the tab or refreshing, there is no residual audio data on the device. A forensic analysis of the browser would find no stored audio.

---

### 3. Memory Cleanup on Page Close

**What this means:** The app actively cleans up when you leave.

**How it's implemented:**
```
window.addEventListener('beforeunload', function() { destroy(); });
window.addEventListener('pagehide', function() { destroy(); });
```

The `destroy()` function:
1. Calls `clearAudioData()` to nullify all audio buffers
2. Stops all microphone stream tracks via `track.stop()`
3. Closes the AudioContext
4. Resets all state variables to their initial values

**Why this matters:** Some browsers keep JavaScript in memory briefly after tab close. By explicitly nullifying references and stopping streams, the app ensures cleanup happens immediately rather than waiting for garbage collection.

---

### 4. Explicit User Consent for Microphone

**What this means:** The app never tries to access your microphone until you click a button.

**How it's implemented:**
- Microphone access is requested via `navigator.mediaDevices.getUserMedia()` only inside the "Start" button's click event handler
- The AudioContext is created inside the same click handler (browsers require user interaction to create an AudioContext)
- Recording doesn't begin until the user separately clicks "Record"
- Clear status indicators show when the microphone is active and when recording is in progress
- A privacy notice is permanently visible explaining data handling

**Why this matters:** Some websites try to access the microphone as soon as the page loads, sometimes even before the user realizes what's happening. This app makes microphone access a deliberate, two-step process.

---

### 5. HTTPS Requirement

**What this means:** The app must be served over a secure (encrypted) connection.

**Why it's required:**
- Browsers block `getUserMedia()` (microphone access) on non-HTTPS pages
- HTTPS ensures the app's code hasn't been tampered with during transmission
- HTTPS prevents man-in-the-middle attacks on the initial page load
- The `localhost` exception exists for development purposes only

**How users get HTTPS:**
- GitHub Pages provides free HTTPS hosting
- The deployment guide directs users to use GitHub Pages

---

### 6. No Third-Party Dependencies

**What this means:** The app uses zero external libraries, frameworks, or services.

**What's used instead:**
- **Web Audio API** (built into all modern browsers) for audio processing
- **MediaDevices API** (built into all modern browsers) for microphone access
- **Vanilla JavaScript** for application logic
- **CSS** for styling (no frameworks)

**Why this matters:**
- Third-party libraries are a common attack vector (supply chain attacks)
- External CDN scripts could be compromised or serve malicious code
- No dependency means no risk from abandoned or vulnerable packages
- The app's complete source code is visible in 5 files with no obfuscation

---

### 7. Content Security Policy (CSP)

**What this means:** The browser is given strict rules about what the app is allowed to do.

**CSP directives implemented:**

| Directive | Value | Purpose |
|-----------|-------|---------|
| `default-src` | `'self'` | Only allow resources from same origin |
| `script-src` | `'self'` | Only allow scripts from same origin (blocks inline scripts, eval) |
| `style-src` | `'self'` | Only allow stylesheets from same origin |
| `img-src` | `'self' data:` | Allow images from same origin and data URIs |
| `media-src` | `'self' blob: mediastream:` | Allow audio from same origin, blob URLs, and MediaStream (for recording) |
| `connect-src` | `'none'` | Block ALL network requests |
| `object-src` | `'none'` | Block plugins (Flash, Java applets) |
| `frame-src` | `'none'` | Block iframes |
| `base-uri` | `'self'` | Prevent base tag injection attacks |
| `form-action` | `'none'` | Prevent form submissions to external URLs |

**Additional security headers:**
- `X-Content-Type-Options: nosniff` - Prevents MIME type sniffing
- `Referrer-Policy: no-referrer` - Prevents referrer information from leaking
- `Permissions-Policy` - Only allows microphone, blocks camera, geolocation, and payment APIs

**Why this matters:** Even if an attacker found a way to inject code into the page (e.g., via a browser extension), the CSP would prevent that code from:
- Loading external scripts
- Making network requests to exfiltrate data
- Embedding the page in an iframe for clickjacking
- Using eval() to execute arbitrary code

---

### 8. Input Validation on Effect Parameters

**What this means:** All values that control audio effects are checked and constrained to safe ranges before being used.

**How it's implemented:**
- The `clampParam()` function validates that inputs are finite numbers and constrains them to defined ranges
- Each effect constructor validates its own parameters independently
- UI slider values are validated before being converted to effect parameters
- The effect factory function (`createEffect`) rejects unknown effect names

**Parameter constraints:**

| Parameter | Valid Range | Safety Reason |
|-----------|------------|---------------|
| Mix (all effects) | 0.0 - 1.0 | Prevents signal inversion or amplification |
| Reverb Decay | 0.1 - 5.0 seconds | Prevents excessive memory use or silence |
| Reverb Tone | 0.0 - 1.0 | Maps to valid filter frequency range |
| Delay Time | 0.01 - 2.0 seconds | Within Web Audio API DelayNode limits |
| Delay Feedback | 0.0 - 0.9 | **Prevents infinite feedback loops** that could produce dangerously loud output |
| Distortion Drive | 0.0 - 1.0 | Keeps waveshaper curve within reasonable bounds |
| Distortion Tone | 0.0 - 1.0 | Maps to valid filter frequency range |

**Why this matters:** Unconstrained audio parameters can cause:
- Extremely loud output that could damage hearing or speakers
- Infinite feedback loops
- Browser crashes from excessive memory allocation
- NaN or Infinity values propagating through the audio graph

---

## Additional Security Practices

### No Dangerous JavaScript Patterns
- No use of `eval()`, `Function()`, or `new Function()`
- No use of `innerHTML` with dynamic content (all text updates use `textContent`)
- No dynamic script loading or injection
- All scripts use `'use strict'` mode

### Error Handling
- Error messages shown to users are generic and descriptive ("Microphone permission was denied")
- Internal error details are not exposed to the UI
- Technical details are logged to the console only (visible in browser DevTools but not to casual users)
- All async operations (Promises) have proper error handling with `.catch()` blocks

### No Information Leakage
- No `console.log` statements with sensitive data
- Error messages don't reveal internal state, file paths, or system information
- The `Referrer-Policy: no-referrer` header prevents URL leaking when navigating away

### Defensive Coding
- Functions check preconditions before executing (e.g., verifying permission before recording)
- Audio node disconnection is wrapped in try/catch to handle already-disconnected nodes
- State transitions are validated (can't play without a recording, can't record without permission)

---

## What This App Does NOT Do

For complete transparency, here is what this application never does:

- **Never** transmits audio data over the network
- **Never** stores audio to the device's file system
- **Never** uses cookies, localStorage, or any persistent storage
- **Never** loads external scripts, stylesheets, fonts, or images
- **Never** contacts any analytics or tracking service
- **Never** fingerprints the user's browser or device
- **Never** accesses the camera, location, or any sensor besides the microphone
- **Never** runs in the background after the tab is closed
- **Never** requests more permissions than needed (audio only, no video)

---

## Verifying Security Claims

You can verify all of these claims yourself:

1. **Check network requests:** Open browser DevTools (F12) > Network tab. You should see zero requests after the initial page load.

2. **Check storage:** Open DevTools > Application tab > check localStorage, sessionStorage, cookies, and IndexedDB. All should be empty.

3. **Check CSP:** Open DevTools > Console. If any CSP violations occur, they'll be logged here.

4. **Read the source code:** The entire application is contained in 5 readable files with extensive comments explaining security decisions.

5. **Test cleanup:** Record audio, then refresh the page. The app should start with a clean state and no retained audio.

6. **Test offline:** After loading the page once, disconnect from the internet. The app should continue to work normally (all features except initial page load are offline-capable).

---

## Threat Model

| Threat | Mitigation |
|--------|-----------|
| Audio data exfiltration | CSP `connect-src 'none'` blocks all network requests |
| Persistent audio on device | Only RAM storage; cleanup on page unload |
| Unauthorized microphone access | Requires explicit user click; browser permission dialog |
| Code injection (XSS) | CSP blocks inline scripts and eval; no innerHTML with user data |
| Supply chain attack | Zero third-party dependencies |
| Man-in-the-middle | HTTPS required for deployment |
| Clickjacking | CSP `frame-src 'none'` prevents iframe embedding |
| Session hijacking | No sessions, no cookies, no server |
| Plugin-based attacks | CSP `object-src 'none'` blocks all plugins |
