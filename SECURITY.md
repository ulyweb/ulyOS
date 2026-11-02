# Security

ulyOS runs entirely in the browser. There is no ulyOS server and nothing to log in to remotely.

## What is protected, and how
| Data | Protection |
|---|---|
| Profile vault (settings, desktop layout, audit log, widgets, notes, bundled-app data) | AES-256-GCM, key from PBKDF2-SHA256 (600,000 iterations, random 16-byte salt); random 96-bit IV on every write; ciphertext bound to the profile id; key is non-extractable and kept only in memory |
| Passwords / PINs | **Never stored.** Whether a password is right is decided by successfully decrypting the vault. Typed or generated secrets can be wiped from memory (Purge) and are wiped when idle or when the tab is hidden |
| Files | Per-profile sandbox (OPFS). Not encrypted at rest unless you use Files → Encrypt… (AES-256-GCM, PBKDF2 600,000) |
| Backups (`.ulyprofile`) | Encrypted with a password you choose |
| Bundled apps (TrustVault, QR Seal, System Vault, Crypto Compass) | Their browser storage is redirected into the encrypted vault. TrustVault's own app-lock hashes use PBKDF2-SHA256 (120,000 iterations) |

## Policy enforced when you choose a secret
Passwords: at least 10 characters and about 45 bits of estimated entropy. PINs: 6–12 digits and not trivially guessable. A digits-only PIN can still be guessed quickly by someone who copies your browser data — use a password for anything valuable.

## Hardening in the page
- Content-Security-Policy limits where scripts, connections, frames and images may come from; there are no third-party scripts and no CDNs.
- The page refuses to run inside another site's frame (anti-clickjacking).
- Third-party sites opened in a window run in a sandboxed iframe with no ability to navigate ulyOS itself.
- Settings and widget imports are validated and sanitised; text from the network is only ever inserted as text.
- Key-derivation parameters read from storage or a backup are range-checked.

## Network
The online build only talks to: your relay (Contact Admin, and a notice when a profile is created — never passwords or data) and the public APIs used by widgets (CoinGecko, ESPN, Polymarket, Wikipedia, Hacker News) while a widget exists. The offline build sends nothing.

## Known limits
- Anyone with the unlocked browser, malware, or a hostile extension can read what the page can read.
- The failed-attempt delay is stored in the browser, so it slows a casual guesser but not someone attacking a copy of your data offline — the password strength is your real protection.
- Bundled apps are trusted code with full access to the vault API; do not add untrusted local apps.
- Pages on the same `ulyweb.github.io` origin share browser storage: an unprotected profile is readable by them.
- No recovery: a forgotten password cannot be reset.

## Reporting a problem
Use **Contact Admin** inside ulyOS or open a private security advisory on the GitHub repository. Please do not post exploit details publicly first.

## Contact relay
`docs/apps-script-relay.gs` is a hardened replacement for the Google Apps Script relay (hard-coded recipient, subject allow-list, length caps, rate limits). Deploy it and put its URL in `js/config.js`.
