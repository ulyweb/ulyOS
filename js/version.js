/* ==========================================================================
   ulyOS · js/version.js — version number + full release history (shown in Settings → About).
   Add a new entry at the TOP for every release and bump ulyOS.version.
   ========================================================================== */
window.ulyOS = window.ulyOS || {};
ulyOS.version = '1.15.0';
ulyOS.CHANGELOG = [
  { v: '1.15.0', d: '2026-11-03', n: [
    'New default layout: a full-width Taskbar that stays visible (no floating dock, no auto-hide) with Settings, Beam, Files and Task Manager pinned',
    'A calm desktop: only Gemini Live, Speak, Beam and App Store, plus a new Apps folder that holds every other icon (open it, search it, drag icons onto it, right-click → Move to desktop). Apps added from the App Store land in the folder. Existing profiles are migrated once; your own shortcuts are kept inside Apps',
    'New welcome screen, guided tour and About tab that explain why ulyOS is better: private by design (encrypted at rest, no account, no server holding your data), nothing to install, one tidy workspace, device-to-device Beam and your-own-drive sync, transparent and tested — and who it is for',
    'Offline Quit shows its goodbye screen as an overlay instead of wiping the page',
  ] },
  { v: '1.14.0', d: '2026-11-03', n: [
    'Widgets remember where they sit relative to the nearest screen edge, so a widget on the right stays on the right when the window is resized and returns exactly when the window does; relocation keeps them in their column, they never overlap icons or each other, and dragging / resizing starts from where they are shown',
    'Speak has three voice engines: Browser voices, Gemini voices (natural, 30 voices, styles such as Whisper, Calm, Storyteller — your own API key) and the Built-in robotic voice. Gemini and Built-in audio is exported directly to WAV / MP3 with no tab-audio sharing; browser voices explain why they cannot be exported and offer recording, Built-in or Gemini',
    'Gemini Live: talk with Gemini in real time (microphone in, voice out, live transcripts, typed messages, voice and instruction choice). The key lives only in the encrypted vault, is never exported or synced, and is sent only to generativelanguage.googleapis.com',
    'Dialogs with several long buttons now wrap instead of overflowing',
  ] },
  { v: '1.13.0', d: '2026-11-03', n: [
    'Beam: send files, pictures, text and your settings between two devices (PC ↔ phone) over a direct, end-to-end encrypted WebRTC link. Pair by scanning a QR code or pasting a code, check the same 6-digit number on both screens, and the receiver accepts each file. No server, no account. (It cannot talk to the LocalSend app itself — browsers cannot run its server or network discovery — it does the same job ulyOS ↔ ulyOS.)',
    'Speak → Save audio now always works: choose the new Built-in voice (eSpeak) to create a WAV or MP3 directly, and when recording a browser voice fails ulyOS offers to switch to it automatically',
    'Vendored libraries (see vendor/README.md): eSpeak / meSpeak (GPL-3.0+), qrcode-generator (MIT), jsQR (Apache-2.0)',
  ] },
  { v: '1.12.0', d: '2026-11-03', n: [
    'Dark / light theme: a sun / moon button next to the clock, and Settings → Appearance → Theme (Dark, Light, Auto follows your device). The profile screen remembers the last theme',
    'App Store: about 45 apps (the built-in ones plus well-known web apps) in categories with search; Add puts a shortcut on the desktop, Try opens it without adding. Nothing is installed',
    'Speak: Save text… (to Files, encrypted, and/or a download), Open… a text file, and audio saves now ask where to put the file. Recording automatically uses a local voice when the chosen one is a cloud voice that cannot be captured',
    'Sync → Cloud drive or network folder: choose a folder kept in step by Google Drive, iCloud Drive, OneDrive, Dropbox, Box, Nextcloud or a mounted network share and ulyOS syncs an encrypted file there; also save / open the settings .json in that folder. A Share button sends files to iCloud Drive / Drive from phones',
  ] },
  { v: '1.11.0', d: '2026-11-02', n: [
    'Guided tour: a welcome screen after sign-in (first time, or every time if you switch it on) and a 13-step spotlight tour of the desktop, dock, Files, widgets, Speak, settings, security, sync and offline use. Replay from Help, the ulyOS logo menu or Settings → About',
    'Widgets can be resized freely by dragging the bottom-right corner, and they repack themselves (shrinking if needed) whenever the window changes size, so they no longer overlap icons or each other; they return to your chosen spots when there is room again',
    'Speak can record speech to a .wav or .mp3 file (records the tab audio, encoded on your device)',
    'Offline build: a new local server (server.py, this computer only) that quits from the profile menu or Settings → System, and stops by itself when you close the tab; start scripts no longer leave a server running',
    'Help → About ulyOS and the logo menu now show the version, build (online / offline) and what is new; the About tab shows the build too',
  ] },
  { v: '1.10.0', d: '2026-11-02', n: [
    'Speak: a text-to-speech app (desktop icon, start menu) — type or paste text, or turn on "speak each word as I type"; choose voice, speed, pitch and volume. The Notes widget has a read-aloud button',
    'Text: choose the interface font (8 families), size (10–22 px), weight and italic in Settings → Appearance',
    'Pointer: new Solid arrow and Target styles, and a pointer color picker (or follow the accent)',
    'Vivid widgets: every widget type has its own color palette, glow and gradient numbers; switch back to the neutral Glass look in Settings → Appearance',
    'Settings → System → Browser storage explains where the "of 10 GB" figure comes from (the browser grants it, ulyOS cannot change it), shows a usage bar and a Keep my data button',
    'Step-by-step guides for passkeys and sync inside Settings, a Copy gist ID button, and clearer messages when a settings file cannot be imported',
  ] },
  { v: '1.9.0', d: '2026-11-02', n: [
    'A password is now mandatory for every profile. The "no password" option and PINs are gone; profiles from earlier versions (no password, a PIN, or a weak password) must choose a strong password the next time they sign in',
    'Passkey / fingerprint unlock (WebAuthn PRF): Touch ID, Windows Hello, a phone or a security key unlock the profile. The key comes from the authenticator, so it cannot be guessed offline the way a PIN can. The password stays as the fallback; add and remove passkeys in Settings → Security',
    'New vault format: a random master key encrypts everything and is wrapped separately by the password and by each passkey, so changing the password no longer re-keys your data and passkeys keep working',
    'Files in the sandbox are encrypted automatically (AES-256-GCM, key derived from the master key); existing files are encrypted at the next sign-in; files over 64 MB and folders mounted from your computer stay as normal files',
    'Stricter Content-Security-Policy: no inline scripts or inline event handlers anywhere. The page scripts moved to files, and the bundled apps now open as their own documents with their own strict policy (tools/build-apps.js rebuilds them)',
    'Multi-device sync (Settings → Sync): encrypted bundles merged per item, newest change wins, deletions propagate. Move a .ulysync file yourself or sync automatically through a secret GitHub gist with your own token',
    'Automated tests (Playwright) and lint run on every push and pull request (.github/workflows/test.yml)',
  ] },
  { v: '1.8.0', d: '2026-11-02', n: [
    'Security audit and hardening: Content-Security-Policy, anti-clickjacking frame guard, sandboxed iframes for third-party sites, range checks on key-derivation parameters read from storage or backups',
    'Password policy for profiles, backups and file encryption: 10+ characters and about 45 bits of entropy; PINs 6–12 digits and not trivially guessable',
    'TrustVault: replaced the unsalted 32-bit djb2 hashes (beneficiary password, vault passcode) with salted PBKDF2-SHA256 (120,000 iterations); old hashes upgrade automatically on next use; Math.random salt replaced by the CSPRNG',
    'Auto sign-out after the screen has been locked for a set time (default 15 min) so the key is discarded from memory',
    'Exports (settings, profile backup, offline package) now include date and time in the file name',
    'docs/apps-script-relay.gs (hardened contact relay) and SECURITY.md added; contact recipient address can now live only inside the relay',
  ] },
  { v: '1.7.0', d: '2026-11-02', n: [
    'Purge memory: Purge button on every password generator, automatic purge when idle or when the tab is hidden, "Purge memory now" in Settings → Security and the logo menu, clipboard auto-clear',
    'Effects panel like System Vault: aurora intensity, 3D tilt, FX animation, toolbar glow, icon scale, CRT scanlines, glass blur, panel fill, depth, sound effects and volume, Reset FX to defaults, Undo changes',
    'Pointer size slider; Neon arrow is the default cursor',
    '12-hour AM/PM is the default clock format',
    '12 procedurally drawn nature landscape wallpapers (offline, no downloads)',
    'About tab with diagnostics and this full version history; version included in admin messages',
  ] },
  { v: '1.6.0', d: '2026-11-01', n: [
    'Data widgets: Crypto (watchlist, trending, search any CoinGecko coin), Scoreboard (ESPN), Headlines (Wikipedia, Hacker News, ESPN), Prediction markets (Polymarket trending + watchlist)',
    'Defaults: menu bar on, dock size 60, auto-hide on',
    'Mobile: iPhone / Android / iPadOS — tap to open, long-press menus, full-screen phone windows, dock handle, widgets panel, safe areas, installable web app (manifest, icons, service worker), iOS file-write fallback',
    'Fixes: Trending star updated a stale list; widgets no longer placed over desktop icons; context-menu placement measured mid-animation',
  ] },
  { v: '1.5.0', d: '2026-11-01', n: [
    'Desktop widgets: Clock, Calendar, Notes, System monitor, Crypto prices, Timer',
    '12-hour / 24-hour clock setting',
    'Contact Admin (same relay as System Vault) and new-profile notification with on-screen disclosure',
    'Offline version: in-browser .zip builder with start scripts; config with OFFLINE: true',
  ] },
  { v: '1.4.0', d: '2026-11-01', n: [
    'Password generator widget (length, character sets, live entropy, brute-force estimate) in profile creation, password change, backups and file encryption',
    'Dock magnification repositions neighbours so icons never overlap',
    'Settings: autosave status, Save now, Export / Import settings (validated)',
    'Colorful animated icon style (default) with per-app animated artwork; defaults: floating dock, seconds clock',
  ] },
  { v: '1.3.0', d: '2026-11-01', n: [
    'shell.js: taskbar or floating dock at any edge, auto-hide, pinned apps, optional macOS-style menu bar, start menu',
    'Randomisation: Surprise me, random wallpaper / cursor / icon / window animation style',
    '14 wallpapers, 5 cursor styles, 6 icon styles, 6 window animation styles',
    'TrustVault removed from the default icons',
  ] },
  { v: '1.2.0', d: '2026-11-01', n: [
    'Custom URL shortcuts: YouTube / Vimeo / Spotify links become embeddable players; sites that forbid framing open in a browser tab; per-shortcut Open-in mode',
    'Default icons: YouTube, XRP Price (CoinMarketCap), Outlook; Photopea and Spotify removed',
  ] },
  { v: '1.1.0', d: '2026-11-01', n: [
    'Profiles with optional password / PIN: PBKDF2-SHA256 (600,000) + AES-256-GCM encrypted vault, lock screen, idle auto-lock, attempt throttling, encrypted .ulyprofile backup',
    'Per-profile sandbox filesystem; file encryption (.uly) in Files',
    'Bundled apps: TrustVault, QR Seal, System Vault, Crypto Compass (storage redirected into the encrypted vault)',
  ] },
  { v: '1.0.0', d: '2026-11-01', n: [
    'First release: window manager (drag, resize, maximize, minimize, snap; iframes protected during drags), Task Manager with simulated RAM and persistent audit trail',
    'Grid desktop with right-click menus and URL shortcuts, File Manager on OPFS / File System Access API, Settings, boot sequence, custom cursors',
    'Renamed from BrowOS to ulyOS and published to GitHub Pages',
  ] },
];
