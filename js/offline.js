/* ==========================================================================
   ulyOS · js/offline.js
   "Download offline version": builds a .zip in the browser (no server, no
   libraries) containing the whole OS, a config with OFFLINE: true (no Contact
   Admin, no notifications) and one-click start scripts.
   ========================================================================== */
(function () {
  'use strict';

  const { h, fmtBytes } = ulyOS.util;
  const { ui } = ulyOS;
  const enc = new TextEncoder();
  const O = (ulyOS.offline = {});

  /* ---- minimal ZIP writer (method 0 = stored) ---- */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (u8) => { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

  /** entries: [{name, data:Uint8Array, mode?:0o644}] → Uint8Array */
  O.zip = function (entries) {
    const d = new Date();
    const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    const parts = [], central = [];
    let offset = 0;
    for (const e of entries) {
      const name = enc.encode(e.name), crc = crc32(e.data), size = e.data.length;
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true); lh.setUint32(14, crc, true); lh.setUint32(18, size, true); lh.setUint32(22, size, true);
      lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, (3 << 8) | 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
      ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true); ch.setUint32(20, size, true); ch.setUint32(24, size, true);
      ch.setUint16(28, name.length, true); ch.setUint32(38, (((0o100000 | (e.mode || 0o644)) << 16) >>> 0), true); ch.setUint32(42, offset, true);
      parts.push(new Uint8Array(lh.buffer), name, e.data);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + size;
    }
    const cSize = central.reduce((a, c) => a + c.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true); end.setUint32(12, cSize, true); end.setUint32(16, offset, true);
    const all = [...parts, ...central, new Uint8Array(end.buffer)];
    const out = new Uint8Array(all.reduce((a, c) => a + c.length, 0));
    let o = 0; for (const c of all) { out.set(c, o); o += c.length; }
    return out;
  };

  const OFFLINE_CONFIG = (files) => '/* ulyOS offline build — Contact Admin and notifications are disabled. */\nwindow.ulyOS = window.ulyOS || {};\nulyOS.config = {\n  OFFLINE: true,\n  CONTACT_ENDPOINT: \'\',\n  CONTACT_EMAIL: \'\',\n  NOTIFY_ON_PROFILE: false,\n  FILES: ' + JSON.stringify(files, null, 2).replace(/\n/g, '\n  ') + ',\n};\n';

  const SERVER_PY = `#!/usr/bin/env python3
"""ulyOS offline server: serves this folder on http://localhost:8080 (this computer only)
and stops itself when you press "Quit ulyOS" in the app or close the ulyOS tab."""
import http.server, os, socketserver, sys, threading, time
from urllib.parse import urlparse

PORT = int(os.environ.get("ULYOS_PORT", sys.argv[1] if len(sys.argv) > 1 else 8080))
IDLE = float(os.environ.get("ULYOS_IDLE", "90"))   # seconds without a heartbeat (browsers slow timers in hidden tabs)
BYE = float(os.environ.get("ULYOS_BYE", "6"))      # grace after the tab says it closed (a reload cancels it)
os.chdir(os.path.dirname(os.path.abspath(__file__)))
state = {"last": time.time(), "seen": False, "bye": None, "stop": False}

class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()
    def _same_origin(self):
        o = self.headers.get("Origin")
        return o is None or urlparse(o).netloc in ("localhost:%d" % PORT, "127.0.0.1:%d" % PORT)
    def _reply(self, code):
        self.send_response(code); self.send_header("Content-Length", "0"); self.end_headers()
    def do_GET(self):
        if self.path.split("?")[0] == "/__ping":
            state.update(last=time.time(), seen=True, bye=None); return self._reply(204)
        super().do_GET()
    def do_POST(self):
        path = self.path.split("?")[0]
        if not self._same_origin():
            return self._reply(403)
        if path == "/__quit" and self.headers.get("X-ulyOS") == "1":
            state["stop"] = True; return self._reply(200)
        if path == "/__bye":
            state["bye"] = time.time() + BYE; return self._reply(204)
        self._reply(404)

class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True

def watchdog(httpd):
    while True:
        time.sleep(0.5)
        now = time.time()
        if state["stop"] or (state["bye"] and now > state["bye"]) or (state["seen"] and now - state["last"] > IDLE):
            httpd.shutdown(); return

try:
    httpd = Server(("127.0.0.1", PORT), Handler)
except OSError:
    print("Port %d is already in use. Close the other ulyOS window (or the program using the port) and try again." % PORT)
    sys.exit(1)
print("ulyOS is running at http://localhost:%d" % PORT)
print("Stop it with Quit ulyOS (profile menu), by closing the ulyOS tab, or Ctrl+C here.")
threading.Thread(target=watchdog, args=(httpd,), daemon=True).start()
try:
    httpd.serve_forever()
except KeyboardInterrupt:
    pass
httpd.server_close()
print("ulyOS stopped. You can close this window.")
`;

  const README = `ulyOS — offline version
=======================

A browser-based operating system. Everything runs on your own computer; nothing is sent anywhere
(this offline build has no "Contact Admin" and no notifications).

HOW TO START
  macOS / Linux : double-click  start-mac-linux.command   (or run:  python3 server.py)
  Windows       : double-click  start-windows.bat         (or run:  py server.py)
  Your browser opens http://localhost:8080  (use Chrome or Edge).

HOW TO STOP
  Profile menu (your name, top right) -> "Quit ulyOS (stop server)", or Settings -> System -> Quit.
  Closing the ulyOS tab also stops the server after a few seconds to a minute.
  The Python window then says "ulyOS stopped" and closes itself where the system allows it.
  (A web page cannot close the browser itself — just close the tab.)

WHY A LOCAL SERVER?
  Profile encryption (Web Crypto) and the private file system (OPFS) need a "secure context".
  http://localhost counts as one; a plain double-click on index.html may not work everywhere.
  The server only listens on this computer (127.0.0.1), not on your network.

GOOD TO KNOW
  - Profiles, files and settings live in THIS browser on THIS computer (per address: localhost:8080).
    Use Settings -> Security -> Export encrypted profile to move a profile between devices.
  - Use the same port every time (8080) or your profiles will look empty on a different port.
  - Embedded sites (Polotno, GetArtCraft, widgets like Crypto prices) need an internet connection.
  - Forgotten passwords cannot be recovered.

Online version: https://ulyweb.github.io/ulyOS/
`;
  const MAC = '#!/bin/bash\ncd "$(dirname "$0")"\n(sleep 1 && (open "http://localhost:8080" 2>/dev/null || xdg-open "http://localhost:8080" 2>/dev/null)) &\npython3 server.py\nosascript -e \'tell application "Terminal" to close (every window whose name contains "start-mac-linux")\' >/dev/null 2>&1 &\nexit 0\n';
  const WIN = '@echo off\r\ncd /d "%~dp0"\r\nstart "" /b cmd /c "timeout /t 1 >nul & start http://localhost:8080"\r\npy server.py || python server.py\r\nexit\r\n';

  /* Offline build only: heartbeat so the local server stops when the tab is closed, plus an explicit Quit. */
  let beat = 0;
  O.initOffline = async function () {
    if (!ulyOS.config.OFFLINE || beat) return;
    try { const r = await fetch('/__ping', { cache: 'no-store' }); if (r.status !== 204) return; } catch { return; }   // not served by server.py
    beat = setInterval(() => { fetch('/__ping', { cache: 'no-store' }).catch(() => {}); }, 10000);
    window.addEventListener('pagehide', () => { try { navigator.sendBeacon('/__bye'); } catch { /* ignore */ } });
  };
  O.canQuit = () => !!(ulyOS.config.OFFLINE && beat);
  O.quit = async function () {
    if (!ulyOS.config.OFFLINE) return;
    if (!(await ui.confirm({ title: 'Quit ulyOS?', message: 'This saves your profile, stops the local server (the Python window closes) and ends this session.', okText: 'Quit' }))) return;
    try { await ulyOS.vault.flush(); } catch { /* ignore */ }
    clearInterval(beat); beat = 0;
    try { await fetch('/__quit', { method: 'POST', headers: { 'X-ulyOS': '1' } }); } catch { /* server already gone */ }
    document.body.append(h('div', { style: { position: 'fixed', inset: '0', zIndex: '2147483647', display: 'grid', placeItems: 'center', background: '#07080c', color: '#e8eaf2', fontFamily: 'system-ui, sans-serif', textAlign: 'center' } },
      h('div', {}, h('div', { style: { fontSize: '42px', marginBottom: '10px' }, text: '⏻' }), h('h2', { text: 'ulyOS has stopped' }), h('p', { style: { color: '#9aa0b4' }, text: 'The local server is shut down. You can close this tab.' }))));
    try { window.close(); } catch { /* browsers only allow this for script-opened tabs */ }
  };
  O.SERVER_PY = SERVER_PY;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => O.initOffline()); else O.initOffline();

  O.build = async function (onProgress) {
    const files = ulyOS.config.FILES || [];
    const entries = [];
    let i = 0;
    for (const f of files) {
      onProgress?.(++i, files.length, f);
      if (f === 'js/config.js') { entries.push({ name: 'ulyOS-offline/js/config.js', data: enc.encode(OFFLINE_CONFIG(files)) }); continue; }
      const r = await fetch(f, { cache: 'no-cache' });
      if (!r.ok) throw new Error(f + ' → HTTP ' + r.status);
      entries.push({ name: 'ulyOS-offline/' + f, data: new Uint8Array(await r.arrayBuffer()) });
    }
    entries.push({ name: 'ulyOS-offline/README-OFFLINE.txt', data: enc.encode(README) });
    entries.push({ name: 'ulyOS-offline/server.py', data: enc.encode(SERVER_PY) });
    entries.push({ name: 'ulyOS-offline/start-mac-linux.command', data: enc.encode(MAC), mode: 0o755 });
    entries.push({ name: 'ulyOS-offline/start-windows.bat', data: enc.encode(WIN) });
    return O.zip(entries);
  };

  O.download = async function () {
    if (ulyOS.config.OFFLINE) { ui.toast('You are already using the offline version', { type: 'info' }); return; }
    const kill = ui.toast('Building the offline package…', { timeout: 60000 });
    try {
      const zip = await O.build();
      const a = h('a', { href: URL.createObjectURL(new Blob([zip], { type: 'application/zip' })), download: 'ulyOS-offline-' + ulyOS.util.stamp() + '.zip' });
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 8000);
      kill();
      ulyOS.audit('Offline package built and downloaded (' + (ulyOS.config.FILES || []).length + ' files, ' + fmtBytes(zip.length) + ')', 'ok');
      ui.toast('Offline version downloaded (' + fmtBytes(zip.length) + ') — unzip it and open the start script inside', { type: 'ok', timeout: 6500 });
    } catch (err) {
      kill();
      ui.toast('Could not build the offline package: ' + err.message + ' (serve ulyOS over http://, not file://)', { type: 'err', timeout: 7000 });
    }
  };
})();
