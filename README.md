# ulyOS

A self-hosted, browser-based operating system in vanilla HTML, CSS and JavaScript. No frameworks, no build step.
Live: https://ulyweb.github.io/ulyOS/

## Why ulyOS

ulyOS is a private workspace that runs in your browser. Your files, passwords, notes and tools sit behind one password and are encrypted on your device — there is no account to create and no ulyOS server that holds your data.

- **Private by design.** Everything is encrypted at rest (AES-256-GCM) with a key only you hold: a mandatory password and, optionally, a fingerprint / passkey. Nothing is uploaded unless you choose to sync, and then only encrypted data leaves the device.
- **Nothing to install, works anywhere.** Open it on a laptop, tablet or phone; an offline build runs without internet; encrypted sync keeps devices identical.
- **One tidy workspace.** Encrypted files, a password and key generator, QR tools, widgets, voice (Speak, Gemini Live) and an App Store of shortcuts instead of a dozen tabs and accounts.
- **Move data without the cloud.** Beam sends files and settings device-to-device, end-to-end encrypted; sync can use your own drive or network share.
- **Transparent and tested.** Open source, no trackers, a visible audit log, a strict Content-Security-Policy and automated tests on every change.
- **Good for** people handling sensitive documents, shared or borrowed computers (each profile is separately encrypted), travellers who need an offline copy, and anyone who wants control over their own data.

The default layout is deliberately calm: four tools on the desktop (Gemini Live, Speak, Beam, App Store) and an **Apps** folder holding everything else, with Settings, Beam, Files and Task Manager pinned to a full-width taskbar. Everything is configurable in Settings.

## Run locally

```bash
python3 -m http.server 8080
```

Open http://localhost:8080 in Chrome or Edge (use `localhost` or HTTPS, not `file://`; encryption and the sandbox filesystem need a secure context).

## Profiles & security
- Create or pick a profile on start-up. Each profile has its own desktop, settings, audit log, sandbox files and app data.
- **A password is mandatory for every profile** (10+ characters, about 45 bits). Profiles from older versions that had no password, a PIN or a weak password must choose one at next sign-in.
- **Key hierarchy**: a random 256-bit master key encrypts the vault and the sandbox files (AES-256-GCM, random IV per write). The master key is stored only *wrapped*: by a key from your password (PBKDF2-SHA256, 600,000 iterations, random salt) and by each passkey you add. Changing the password re-wraps the key; your data and passkeys are untouched.
- **Passkey / fingerprint unlock** (Settings → Security): Touch ID, Windows Hello, a phone or a security key, using the WebAuthn PRF extension. The wrapping key comes from the authenticator, is 256 bits and never leaves it, so it cannot be brute-forced offline the way a PIN can. The password remains as the fallback. Needs HTTPS or localhost and a browser/authenticator with PRF support (recent Chrome, Edge, Safari 18+).
- **Sandbox files are encrypted automatically** (`ULYSEC1` format) and decrypted on the fly in the Files app; existing files are encrypted at the next sign-in. Folders mounted from your computer stay ordinary files; files over 64 MB are stored as-is and you are told so.
- Lock screen, idle auto-lock, escalating delay after failed attempts, change password, encrypted `.ulyprofile` backup and restore, per-file `.uly` encryption for sharing.
- No recovery: a forgotten password cannot be reset (a passkey can still open the profile so you can set a new password). Keep an encrypted backup.
- GitHub Pages serves all `ulyweb.github.io` projects from one origin; with a password-protected vault other pages there cannot read your data.

## Sync between devices
Settings → Sync. Settings, desktop layout, widgets and app data are packed into an encrypted bundle (AES-256-GCM, key from a **sync passphrase** you choose and keep only inside your encrypted vault) and merged per item: the newest change wins and deletions propagate (tombstones kept 90 days).
- **File method**: Export a `.ulysync` file, move it however you like, Import on the other device.
- **Automatic**: a secret GitHub gist plus a token with only the `gist` permission. The token stays in your encrypted vault and is sent only to `api.github.com`; the gist contains ciphertext only. Sync runs on sign-in and every 10 minutes if you enable it.
- Not synced: sandbox files, the audit log, this device's sync settings. Limits: two devices changing the same item within seconds can overwrite each other (last write wins); after changes arrive ulyOS asks to reload and you sign in again.

## Guided tour, widgets, speech and the offline build
- **Welcome screen and guided tour** appear after your first sign-in. Replay them from Help → Guided tour / Welcome screen, the ulyOS logo menu or Settings → About; Settings → System can show the welcome screen on every sign-in.
- **Widgets** resize by dragging the bottom-right corner (or right-click → Size for presets) and re-pack themselves when the browser window changes size.
- **Speak** reads text aloud (optionally each word as you type) and can save speech as `.wav` or `.mp3`: browsers do not expose the audio of their built-in voices, so ulyOS records the tab's audio (choose “This tab” and “Share tab audio” in the browser prompt) and encodes it locally. Some cloud voices play outside the page and cannot be captured — pick a “local” voice. MP3 uses the LGPL `lamejs` encoder in `vendor/`.
- **Offline build**: run the start script (`server.py` serves only this computer). Stop it with profile menu → **Quit ulyOS (stop server)**, Settings → System → Quit, or just close the tab (the server exits within a minute). A web page cannot close the browser itself.

## Theme, App Store and cloud folders
- **Dark / light theme**: the sun / moon button beside the clock, or Settings → Appearance → Theme (Auto follows your device). Bundled apps keep their own colors.
- **App Store**: a curated catalog of the built-in apps and well-known web apps. “Add” creates a desktop shortcut (a link — nothing is installed); the catalog lives in `js/store.js`, add your own entries there.
- **Cloud drives and network folders** (Settings → Sync → section 4): ulyOS never logs in to Google Drive, iCloud, OneDrive, Box, Dropbox or Nextcloud. You choose a folder on your computer that their desktop app keeps in sync (or a mounted SMB / NAS share), and ulyOS reads and writes an encrypted `ulyos-sync.ulysync` and, on request, `ulyOS-settings.json` there. Needs Chrome or Edge on a computer; on phones use **Share…** (iCloud Drive / Drive via the share sheet). Direct API connectors (OAuth) are deliberately not included: they would need your own registered client IDs and a wider network policy.

## Beam (send between devices) and audio export
- **Beam** connects two devices directly with WebRTC (DTLS-encrypted, no server). One taps **Start** and shows a QR / code, the other taps **Join** and scans or pastes it, then shows a reply code that the first scans or pastes. Both screens show the same 6-digit number (derived from both devices' certificate fingerprints) — if they match, nobody is in the middle. Then send files (the receiver accepts each one), text, or your settings file. On the same Wi-Fi nothing leaves your network; “Also try over the internet” adds a public STUN server (Google's) which learns your public IP.
- It is **not** the LocalSend app: LocalSend needs a local web server and UDP discovery that web pages cannot run. Beam is the browser-to-browser equivalent (ulyOS ↔ ulyOS), with codes replacing discovery. Some Wi-Fi networks (guest networks, “client isolation”) block device-to-device traffic and Beam will say it could not connect.
- **Speak → Save audio**: *Browser voice* records the tab's audio while it speaks (cloud voices cannot be captured); *Built-in voice* synthesizes the file itself with eSpeak (robotic, 12 languages, works offline and always). WAV or MP3.
- Third-party code in `vendor/` is listed in `vendor/README.md`; the eSpeak build is GPL-3.0-or-later.

## Gemini voices and Gemini Live (optional, your own API key)
- Get a key at <https://aistudio.google.com/apikey>. Add it in **Speak → Gemini** or in the **Gemini Live** window. It is stored only in your encrypted vault, is never included in settings exports, backups' sync bundles or gists, and is sent only to `generativelanguage.googleapis.com` (the one extra host the page may talk to, over HTTPS and WSS).
- **Speak → Gemini voices**: 30 natural voices and style presets (Whisper, Calm, Cheerful, Storyteller, News anchor…) — the model follows the plain-language direction placed before your text. The audio arrives as data, so it is **exported directly** to WAV / MP3: no tab audio, no recording. Model names are editable in code (`js/gemini.js`) as Google renames its preview models.
- **Gemini Live**: real-time spoken conversation (microphone → Google → voice reply, with transcripts and typed messages). Needs a microphone and HTTPS or localhost; use headphones. Usage is limited or billed by Google under your key.
- Why browser voices cannot be saved: the page is never given the audio of the browser's own speech engine; the only trick is recording the tab while it plays, which needs “Share tab audio”. Gemini and the built-in voice produce audio data themselves, so they do not need it.
- These features were tested against a simulated Google API (REST and WebSocket) in the automated tests; only you can check them against the real service with your key.

## Look and widgets
- **Icons**: full-colour hand-drawn app icons (`js/icons-rich.js`); Settings → Desktop → “Full-colour app icons” turns them off for the flat styles.
- **Profile pictures**: letter, emoji or photo. The picture is stored with the profile name (not inside the encrypted vault) because the sign-in screen shows it; photos are cropped to 192 px on your device.
- **Wallpapers**: drawn nature scenes (`js/landscapes.js`, built in, work offline) plus 52 real photographs (`js/photos.js`) — cities, mist, mountains, coast, desert, aurora, space — fetched on demand from Wikimedia Commons, each verified as Public domain or CC0. Settings → Appearance also links to Magnific, Unsplash, Pexels and NASA for your own downloads (their licences apply to you, not to ulyOS).
- **Widgets**: Clock, Calendar, Notes, System, Crypto, Scoreboard, Headlines, Prediction markets, Timer, plus **Weather** (Open-Meteo, no key; contacts `api.open-meteo.com` and `geocoding-api.open-meteo.com` only while that widget exists), **To-do** (private — not exported), **World clocks**, **Moon** and **Device**. Pin a widget to lock its position; right-click → Theme or Settings → Widgets → Widget theme to recolor.

## Tests
```bash
npm ci
npx playwright install chromium
npm test        # lint + browser tests
```
`npm run lint` checks syntax, that no served page has `unsafe-inline`/`unsafe-eval` for scripts or inline handlers, that the converted apps are up to date, and scans for committed secrets. The Playwright tests (`tests/`) cover mandatory passwords and legacy upgrades, the vault format, passkeys (virtual authenticator), automatic file encryption, the strict CSP and all four bundled apps, two-device sync against a mocked gist, and a smoke test. They run on every push and pull request through `.github/workflows/test.yml`.

## Editing the bundled apps
`apps/*.html` and `apps/js/*` are generated from `tools/app-sources/*.html` by `node tools/build-apps.js` (it moves each app's inline script into a file, rewrites inline `on*=` handlers to `data-on-*` run by `js/app-bridge.js`, and adds a strict per-app Content-Security-Policy). Edit the source, run the tool, commit both.

## Jarvis AI assistant toolkit

Apps folder → **Jarvis**. An agent with a mind, a mouth, a face and optional hands, inspired by Jared Rhodenizer's open [fullstack-agent](https://github.com/jaredrhod/fullstack-agent) stack ([jaredrhod.com](https://jaredrhod.com), [tour video](https://www.youtube.com/watch?v=FiOTrxq9ckM)). His originals need a local install, Claude Code and local speech models, so they cannot run inside a web page; ulyOS has its own built-in version of each piece (`js/jarvis.js`, original code) and can embed his real local servers when they run on your computer.

| Piece | In ulyOS | His original |
|---|---|---|
| Mind (memory) | **Memory** tab: Markdown notes in encrypted Files → `Jarvis Vault` (profile, daily notes, `[[links]]`, backlinks, search, jobs that prime the AI, export) | [ai-memory-vault](https://github.com/jaredrhod/ai-memory-vault) |
| Mouth (voice) | **Talk** tab: Gemini Live (your own key) with the agent's name, personality and memory, spoken greeting, push-to-talk, voice commands ("go hands free", "push to talk mode", "clear the session"), save the conversation to today's note | [backtalk](https://github.com/jaredrhod/backtalk) (Claude Code, local models) |
| Face | four animated faces (Circuit board, Radial, Code rain, Neural core) that idle, listen, think and speak with the conversation; full screen | [ai-visualizer](https://github.com/jaredrhod/ai-visualizer) |
| Hands (optional) | **Stack** tab opens the real [barehands](https://github.com/jaredrhod/barehands) board (webcam hand tracking) inside ulyOS when it runs locally, plus install commands | barehands |

The Stack tab also checks whether his face (port 8790) and hands (port 8794) servers are running on `127.0.0.1` and shows the install commands for the whole stack. The CSP allows `http://127.0.0.1:*` and `http://localhost:*` for this, and nothing else over plain http.

**Licences.** His projects are AGPL-3.0-or-later (the memory templates are CC BY-SA 4.0). ulyOS contains **none** of their code: the features above are original implementations of the same ideas, and the originals are only linked or embedded from your own computer. Credit and thanks to Jared Rhodenizer.

## Apps
| App | Source |
|---|---|
| TrustVault | digital legacy platform, bundled in `apps/trustvault.html` but not a default icon |
| QR Seal | password-protected QR generator and reader (from ulyweb/qrcode) |
| System Vault | key and passphrase generator with entropy scoring (from ulyweb/key) |
| Crypto Compass | beginner crypto guide and prices (from ulyweb/crypto). Contains the author's referral links, each marked "referral" in the app |
| Jarvis | AI assistant toolkit: memory vault, Gemini Live voice, animated faces, links to the original stack (see above) |
| Polotno, GetArtCraft | embedded web apps |
| YouTube, XRP Price (CoinMarketCap), Outlook | shortcuts that open in a browser tab, because those sites forbid embedding |
| Your own URL shortcuts | right-click the desktop → New URL shortcut (sites that forbid embedding open in a browser tab) |
| Files, Task Manager, Settings | built in |

The bundled apps run inside ulyOS windows as their own documents (own strict policy) with their browser storage redirected into the signed-in profile's encrypted vault.

## Window manager
Drag, resize, maximize, minimize, close, edge snap, z-order. Iframes get `pointer-events: none` during drags and resizes.

## Task Manager
Simulated RAM from DOM nodes and iframes, plus a persistent audit trail.

## Personalize
- Settings → Appearance / Effects / Desktop: 14 wallpapers, cursor styles, icon styles and window animation styles, each with a **Random** option, plus **Surprise me** (and an optional "surprise me on every sign-in").
- Settings → Dock & Menu bar: taskbar or floating dock at any screen edge, auto-hide, icon magnification, pinned apps, and an optional macOS-style menu bar.
- Settings footer: autosave status, **Save now**, **Export settings** and **Import settings** (appearance, dock / menu bar and desktop icon layout as a JSON file, to copy a setup to another device or profile; imports are validated).
- Password generator everywhere a secret is chosen (new profile, change password, file encryption, backup export): length, character sets, live entropy and estimated brute-force time.
- Defaults: floating dock, clock with seconds, colorful animated icons.

## Widgets, clock, admin contact and offline version
- **Widgets** (right-click the desktop → Add widget, or Settings → Widgets): Clock, Calendar, Notes, System monitor, Crypto prices, Timer. Drag to move, three sizes, saved in your encrypted profile. Crypto prices use the public CoinGecko API only while that widget exists.
- **Clock**: 12-hour (AM/PM) or 24-hour (military), with or without seconds — Settings → Desktop.
- **Contact Admin** (online build): in the profile screen footer, start menu, Help menu and Settings → System. Uses the same Google Apps Script relay as ulyweb/key. Only what you type is sent, and only after you press Send.
- **Admin notification** (online build): the site admin is emailed when a profile is created — profile name, the optional email you typed, time, site, language and time zone. Never passwords, PINs, keys, files or app data. This is disclosed on the profile screen and is disabled on localhost, file:// and in the offline build.
- **Offline version**: Settings → System, the Help menu, the start menu or the desktop right-click menu builds `ulyOS-offline-YYYYMMDD.zip` in the browser: the whole OS, start scripts for macOS/Linux/Windows, and a config with `OFFLINE: true` (no Contact Admin, no notification, nothing sent anywhere).

## Data widgets, defaults and mobile
- **Crypto**: Watchlist and Trending tabs; ⚙ opens a search over every CoinGecko coin so you can follow your own tokens (★ in Trending adds one).
- **Scoreboard**: live scores from ESPN for NBA, WNBA, NCAA, NFL, MLB, NHL, MLS, Premier League, La Liga, Bundesliga, Serie A, Ligue 1, Champions League, UFC, F1, NASCAR, tennis and golf — pick leagues, add any ESPN `sport/league` path, or filter to your team.
- **Headlines**: tabs for World (Wikipedia In the news), Trending on Wikipedia, Tech (Hacker News) and ESPN news per league.
- **Prediction markets**: Polymarket Trending and a Watchlist you build by starring or searching. Odds are market-implied probabilities — informational only, nothing is traded.
- These widgets call public APIs (CoinGecko, ESPN, Polymarket, Wikipedia, Hacker News) only while the widget exists.
- Defaults: menu bar on, dock size 60, auto-hide on, floating dock, colorful icons.
- **Phones & tablets** (iPhone, Android, iPadOS): one-tap to open icons, long-press for context menus, full-screen windows on phones, a tap-to-reveal dock handle, a widgets panel on the dock, safe-area support for notches, and installable as a home-screen app (web app manifest + icons + service worker). iOS Safari file saving uses an OPFS worker fallback because it lacks `createWritable()`.

## 1.7.0 — memory hygiene, FX panel, landscapes, About
- **Purge memory**: every password generator has a **Purge** button (wipes the fields and, if you copied it, the clipboard). Typed or generated secrets are also wiped automatically when idle (default 2 min) and when the tab is hidden; clipboard auto-clears after copy (default 30 s). Settings → Security → Memory & clipboard, logo menu → Purge memory now.
- **Effects panel** (modelled on System Vault's Telemetry FX): aurora intensity, 3D tilt, FX animation, toolbar glow, icon scale, CRT scanlines, glass blur, panel fill, depth (shadow), sound effects + volume, **Reset FX to defaults**, and **Undo changes** in the Settings footer.
- **Pointer**: size slider; **Neon arrow** is the default style.
- **Clock**: 12-hour AM/PM is the default.
- **Nature & landscapes**: 12 procedurally drawn SVG wallpapers (no downloads, work offline), also in the desktop right-click → Wallpaper menu and in Random / Surprise me.
- **About**: version, diagnostics (with Copy diagnostics) and the complete version history (`js/version.js` — add an entry for every release).

## 1.8.0 — security audit
See [SECURITY.md](SECURITY.md) for the full model. Highlights: Content-Security-Policy and anti-clickjacking guard, sandboxed third-party iframes, password policy (10+ chars / ~45 bits; PINs 6–12 digits), range-checked key-derivation parameters, auto sign-out after a long lock, TrustVault's weak 32-bit hashes replaced with salted PBKDF2-SHA256, timestamped export file names, and a hardened contact relay in [docs/apps-script-relay.gs](docs/apps-script-relay.gs).

## 1.9.0 — mandatory passwords, passkeys, encrypted files, strict CSP, sync, tests
See "Profiles & security", "Sync between devices" and "Tests" above, and [SECURITY.md](SECURITY.md).
