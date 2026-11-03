# REA reminders (Reverse Engineer Anything)

Notes for using REA ([github.com/morluto/rea](https://github.com/morluto/rea), npm `rea-agents`) on my own machines.
Written 2026-11-03 after installing REA 6.8.0 + Ghidra 12.1.4 in a cloud session.

## Limits to remember

1. **New session after setup.** After `rea setup` on a real machine, restart the agent / open a new session so the REA tools appear.
2. **Cloud installs are temporary.** The cloud container is ephemeral; nothing installed there carries over. On every machine run either
   - `npx rea-agents setup`, or
   - `npm install --global rea-agents` then `rea setup`.
3. **Doctor warnings are normal.** `rea doctor` lists Hopper, Ghidra, IDA, JADX and Kuna as missing until installed. Check only the lines for what I use (Ghidra, Claude Code registration). `environment_healthy: true` after Ghidra is configured.

## Requirements (all machines)

- Node.js 22.x (>=22.23.4), 24.x (>=24.22.1) or 26.12.1+, with npm.
- For Ghidra: a **full JDK 21** (with `javac`), and Ghidra **12.1.4**:
  - https://github.com/NationalSecurityAgency/ghidra/releases/download/Ghidra_12.1.4_build/ghidra_12.1.4_PUBLIC_20260921.zip
  - SHA-256 (pinned by REA's CI): `ddac49f903da9d5bac833e5cc79395098b9c33cfd3279be5f31bd00387d2d4db`
- Then: `export GHIDRA_INSTALL_DIR=/absolute/path/to/ghidra_12.1.4_PUBLIC`, `export JAVA_HOME=/path/to/jdk-21`, run `rea doctor`, then `rea setup`.

## MX Linux (work laptop)

- `sudo apt install openjdk-21-jdk` (check `javac -version`).
- A procps-compatible `ps` must be on PATH (REA uses it for process-ownership checks).
- Only analyse software I own or am authorised to examine (see REA `DISCLAIMER.md`: no DRM/licence bypass, no cheats, no copying protected code).

## Mac (home)

- Homebrew OpenJDK is keg-only: set `JAVA_HOME` to e.g. `/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home` (or `/usr/local/opt/...`).
- The JDK must run natively (not under Rosetta); Ghidra's decompiler for the Mac's chip must be present.
- Hopper can be installed by `rea setup` after approval. It is commercial: needs my own licence (or demo mode).
- macOS-only tools (Mach-O, plist, signatures, Swift) work without Ghidra.

## Quick checks

```bash
rea --version
rea doctor
rea decompile ./some-binary main --provider ghidra
```
