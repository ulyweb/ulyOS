# vendor/

Third-party code shipped unmodified (loaded lazily, only when you use the feature):

- `lamejs.min.js` — [lamejs](https://github.com/breezystack/lamejs) 1.2.7, JavaScript port of the LAME MP3 encoder. **LGPL-3.0**, see `LICENSE-lamejs.txt`. Used when you save speech as .mp3.
- `mespeak.js` + `espeak/` — [meSpeak](http://www.masswerk.at/mespeak) 2.0.2 (npm `mespeak`), a build of the **eSpeak** speech synthesizer, with its config and a set of voices. **GNU GPL v3 or later** (https://www.gnu.org/licenses/gpl-3.0.html). Used for **Speak → Built-in voice**, which creates audio files directly (no recording), works offline and sounds robotic. `mespeak.js` is the npm package's `src/ESpeak.js` and `src/index.js` wrapped in a small CommonJS shim, nothing else changed.

Because GPL code is distributed with ulyOS, anyone redistributing this repository must comply with the GPL for those files.
- `qrcode.js` — [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) 2.0.4 by Kazuhiko Arase, **MIT**. Draws the pairing QR codes in Beam.
- `jsQR.js` — [jsQR](https://github.com/cozmo/jsQR) 1.4.0, **Apache-2.0**, see `LICENSE-jsqr.txt`. Reads pairing QR codes with the camera when the browser has no built-in QR detector.
