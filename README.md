# ulyOS

A self-hosted, browser-based operating system in vanilla HTML, CSS and JavaScript. No frameworks, no build step.
Live: https://ulyweb.github.io/ulyOS/

## Run locally

```bash
python3 -m http.server 8080
```

Open http://localhost:8080 in Chrome or Edge (use `localhost` or HTTPS, not `file://`; encryption and the sandbox filesystem need a secure context).

## Profiles & security
- Create or pick a profile on start-up. Each profile has its own desktop, settings, audit log, sandbox files and app data.
- Optional password or PIN per profile. Everything the profile stores is encrypted at rest: PBKDF2-SHA256 (600,000 iterations) then AES-256-GCM, random salt per vault and random IV per write. The key is non-extractable and kept only in memory while signed in.
- Lock screen, idle auto-lock, escalating delay after failed attempts, change or remove password, encrypted `.ulyprofile` backup and restore.
- Files app: right-click a file, then **Encrypt…** or **Decrypt…** (`.uly` files, AES-256-GCM).
- No recovery: a forgotten password cannot be reset. Keep an encrypted backup.
- Sandbox files are isolated per profile but are not encrypted at rest unless you encrypt them.
- GitHub Pages serves all `ulyweb.github.io` projects from one origin, so an unprotected profile is readable by other pages there. Use a password.

## Apps
| App | Source |
|---|---|
| TrustVault | digital legacy platform, bundled in `apps/trustvault.html` but not a default icon |
| QR Seal | password-protected QR generator and reader (from ulyweb/qrcode) |
| System Vault | key and passphrase generator with entropy scoring (from ulyweb/key) |
| Crypto Compass | beginner crypto guide and prices (from ulyweb/crypto) |
| Polotno, GetArtCraft | embedded web apps |
| YouTube, XRP Price (CoinMarketCap), Outlook | shortcuts that open in a browser tab, because those sites forbid embedding |
| Your own URL shortcuts | right-click the desktop → New URL shortcut (sites that forbid embedding open in a browser tab) |
| Files, Task Manager, Settings | built in |

The bundled apps run inside ulyOS windows with their browser storage redirected into the signed-in profile's encrypted vault.

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
