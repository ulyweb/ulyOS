# vendor/

Third-party code shipped unmodified (loaded lazily, only when you use the feature):

- `lamejs.min.js` — [lamejs](https://github.com/breezystack/lamejs) 1.2.7, JavaScript port of the LAME MP3 encoder. **LGPL-3.0**, see `LICENSE-lamejs.txt`. Used when you save speech as .mp3.
- `mespeak.js` + `espeak/` — [meSpeak](http://www.masswerk.at/mespeak) 2.0.2 (npm `mespeak`), a build of the **eSpeak** speech synthesizer, with its config and a set of voices. **GNU GPL v3 or later** (https://www.gnu.org/licenses/gpl-3.0.html). Used for **Speak → Built-in voice**, which creates audio files directly (no recording), works offline and sounds robotic. `mespeak.js` is the npm package's `src/ESpeak.js` and `src/index.js` wrapped in a small CommonJS shim. The code is unchanged; the only differences are line endings (CRLF to LF) and the file's character encoding (Latin-1 to UTF-8, affecting comments), verified against the npm tarball with REA on 2026-11-03.

Because GPL code is distributed with ulyOS, anyone redistributing this repository must comply with the GPL for those files.
- `qrcode.js` — [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) 2.0.4 by Kazuhiko Arase, **MIT**. Draws the pairing QR codes in Beam.
- `jsQR.js` — [jsQR](https://github.com/cozmo/jsQR) 1.4.0, **Apache-2.0**, see `LICENSE-jsqr.txt`. Reads pairing QR codes with the camera when the browser has no built-in QR detector.
- `mediapipe/` — [MediaPipe Tasks Vision](https://github.com/google-ai-edge/mediapipe) 1.2.2 (`vision_bundle.mjs`, `wasm/vision_wasm_internal.{js,wasm}`) and the `hand_landmarker.task` model, **Apache-2.0** (Google), see `mediapipe/LICENSE-mediapipe.txt`. Used by Jarvis → Hands for webcam hand tracking; loaded only when you press Start camera and served from ulyOS itself (about 22 MB). SHA-256: `vision_bundle.mjs` b65acb59…, `vision_wasm_internal.wasm` f5bd2514…, `hand_landmarker.task` fbc2a300… (npm `@mediapipe/tasks-vision@1.2.2`; model from storage.googleapis.com/mediapipe-models).
