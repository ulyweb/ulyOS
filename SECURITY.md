# Security

ulyOS runs entirely in the browser. There is no ulyOS server and nothing to log in to remotely.

## What is protected, and how
| Data | Protection |
|---|---|
| Profile vault (settings, desktop layout, audit log, widgets, notes, bundled-app data) | AES-256-GCM under a random 256-bit master key; random 96-bit IV on every write. The master key is stored only wrapped, by a PBKDF2-SHA256 key (600,000 iterations, random 16-byte salt) from the password and, optionally, by a WebAuthn-PRF-derived key per passkey |
| Passwords | **Mandatory for every profile.** Never stored: a password is right if it unwraps the master key and the vault then authenticates. Typed or generated secrets can be wiped from memory (Purge) and are wiped when idle or when the tab is hidden |
| Passkeys | The authenticator returns a 256-bit PRF output that never leaves the device; it wraps the master key via HKDF-SHA256. No offline guessing is possible without the authenticator |
| Sandbox files | Encrypted automatically: `ULYSEC1` header, AES-GCM with a key derived from the master key (HKDF), authenticated, per-file random IV. Not applied to folders you mount from your computer or to files over 64 MB (you are told) |
| Backups (`.ulyprofile`) and sync bundles (`.ulysync`, gist) | Encrypted with a password / sync passphrase you choose (PBKDF2 600,000 + AES-256-GCM) |
| Bundled apps (TrustVault, QR Seal, System Vault, Crypto Compass) | Their browser storage is redirected into the encrypted vault. TrustVault's own app-lock hashes use PBKDF2-SHA256 (120,000 iterations) |

## Policy enforced when you choose a secret
Passwords: at least 10 characters and about 45 bits of estimated entropy. There are no PINs. Profiles created by earlier versions without a password, with a PIN or with a weak password are blocked at sign-in until a strong password is chosen.

## Hardening in the page
- **Content-Security-Policy without `unsafe-inline` or `unsafe-eval` for scripts**, in the shell and in every bundled app. All scripts are files; there are no inline scripts and no inline event handlers (apps' handlers run through `js/app-bridge.js`, a small allow-listed interpreter with no `eval`; it can only call the app functions the build found referenced by handlers). `style-src` still allows inline styles, which the UI uses heavily; styles cannot run code.
- No third-party scripts and no CDNs.
- The page refuses to run inside another site's frame (anti-clickjacking).
- Third-party sites opened in a window run in a sandboxed iframe with no ability to navigate ulyOS itself. Bundled apps are separate same-origin documents with their own policy.
- Settings, widget and sync imports are validated and sanitised; sync bundles can never overwrite sync settings, the audit log or non-string values.
- Key-derivation parameters read from storage, backups or sync bundles are range-checked.
- Automated tests and lint run on every push (`.github/workflows/test.yml`), including the CSP rules and a secret scan.

## Network
The online build only talks to: your relay (Contact Admin, and a notice when a profile is created — never passwords or data), the public APIs used by widgets (CoinGecko, ESPN, Polymarket, Wikipedia, Hacker News), and — only if you turn on gist sync — `api.github.com` (and `gist.githubusercontent.com` for large files) with your token, and — only while the Weather widget exists — `api.open-meteo.com` / `geocoding-api.open-meteo.com`, and — when you choose a real-photo wallpaper — `commons.wikimedia.org` (images), and — only if you use Gemini voices or Gemini Live — `generativelanguage.googleapis.com` with your Google API key (kept in the vault, never exported or synced). Sync payloads are ciphertext.

## Known limits
- Gemini features send your text (voices) or microphone audio (Live) to Google under your own API key; Google's terms and quotas apply. The API key is sent to Google as a header (voices) or in the WebSocket address (Live, which is how that API authenticates).
- Anyone with the unlocked browser, malware, or a hostile extension can read what the page can read. While a profile is open the master key is held in memory (the lock screen and the "sign out after lock" timer discard it).
- The failed-attempt delay is stored in the browser, so it slows a casual guesser but not someone attacking a copy of your data offline — for the password, its strength is your real protection; a passkey removes that guessing surface.
- The sync token is stored in your encrypted vault and is only as safe as the open session; use a token limited to the `gist` permission and revoke it if a device is lost. The sync passphrase protects the gist: choose a strong one.
- Gist sync is last-write-wins at the gist level; two devices syncing within seconds can lose one device's change.
- Passkey unlock needs a browser and authenticator that support the WebAuthn PRF extension.
- Bundled apps are trusted code with full access to the vault API; do not add untrusted local apps.
- No recovery: a forgotten password cannot be reset (an enrolled passkey can still open the profile).
- Files larger than 64 MB in the sandbox are stored unencrypted (the browser must hold the whole file in memory to encrypt it).

## Reporting a problem
Use **Contact Admin** inside ulyOS or open a private security advisory on the GitHub repository. Please do not post exploit details publicly first.

## Contact relay
`docs/apps-script-relay.gs` is a hardened replacement for the Google Apps Script relay (hard-coded recipient, subject allow-list, length caps, rate limits). Deploy it and put its URL in `js/config.js`.
