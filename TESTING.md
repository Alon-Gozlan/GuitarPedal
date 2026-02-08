# Testing the GuitarPedal

This document describes how to test the digital guitar pedal at each stage of development.

## 1. Unit Tests

Unit tests verify individual functions (DSP algorithms, parameter handling, etc.) in isolation on a host machine — no hardware needed.

**Setup:**
```bash
# Example using a C/C++ project with CMake and GoogleTest
mkdir build && cd build
cmake -DBUILD_TESTS=ON ..
make
ctest --output-on-failure
```

**What to test:**
- DSP processing functions (filters, distortion curves, delay lines) with known input/output pairs
- Parameter mapping and range clamping
- Buffer management and edge cases (empty buffer, max-length buffer)

## 2. Audio Integration Tests

Feed reference audio files through the signal chain and compare the output against golden reference files.

```bash
# Example: process a test tone and compare
./guitar_pedal --input test_fixtures/clean_sine_440hz.wav --output /tmp/out.wav
diff <(md5sum test_fixtures/expected_output.wav) <(md5sum /tmp/out.wav)
```

Alternatively, use a tolerance-based comparison (e.g., peak error < -60 dB) since floating-point results can vary across platforms.

## 3. Hardware-in-the-Loop (HIL) Testing

If targeting a microcontroller (e.g., STM32, Daisy Seed, Teensy, ESP32):

1. **Flash the firmware** to the board.
2. **Send a test signal** from a computer or signal generator into the pedal's audio input.
3. **Record the output** back on the computer via an audio interface.
4. **Compare** the recorded output against the expected result.

Tools that help:
- A loopback audio interface setup
- Scripts using `sox` or Python (`scipy.io.wavfile`) to generate and analyze test signals

## 4. Real-Time Performance Tests

Verify the DSP runs within the audio callback deadline:

- **Measure processing time** per audio block (e.g., with a GPIO pin toggle or cycle counter).
- **Check for buffer underruns** — most audio frameworks report xruns.
- **Profile CPU usage** on the target hardware.

```
Target: processing time < audio block duration
Example: 128 samples @ 48 kHz = 2.67 ms deadline
```

## 5. Manual / Listening Tests

Some qualities are best evaluated by ear:

1. Power on the pedal, plug in a guitar.
2. Bypass mode — confirm clean pass-through with no added noise.
3. Engage each effect — verify the sound matches expectations.
4. Sweep each knob through its full range — check for clicks, pops, or zipper noise.
5. Test with high-gain input — check for unwanted clipping or aliasing.

## 6. CI Pipeline

Once the project has source code and unit tests, add a CI workflow:

```yaml
# .github/workflows/test.yml
name: Test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build and test
        run: |
          mkdir build && cd build
          cmake -DBUILD_TESTS=ON ..
          make -j$(nproc)
          ctest --output-on-failure
```

## Quick Reference

| Layer              | Requires Hardware? | Automated? |
|--------------------|-------------------|------------|
| Unit tests         | No                | Yes        |
| Audio integration  | No                | Yes        |
| HIL testing        | Yes               | Partially  |
| Performance tests  | Yes               | Partially  |
| Listening tests    | Yes               | No         |
| CI pipeline        | No                | Yes        |
