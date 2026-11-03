/* ==========================================================================
   ulyOS · js/beam.js — Beam: send files, text and your settings between devices
   A browser-native cousin of LocalSend. Browsers cannot run LocalSend's local
   web server or UDP discovery, so Beam connects two devices directly with
   WebRTC (end-to-end encrypted, DTLS) after you swap two short codes — by QR
   code or copy / paste. Nothing goes through a server; on the same Wi-Fi the
   data never leaves your network.
   ========================================================================== */
(function () {
  'use strict';
  const { h, icon, fmtBytes } = ulyOS.util;
  const { ui, WM, bus } = ulyOS;
  const B = (ulyOS.Beam = {});
  const CHUNK = 32 * 1024, MAX_FILE = 512 * 1024 * 1024, MAX_CODE = 24000;
  const enc = new TextEncoder(), dec = new TextDecoder();
  const supported = !!window.RTCPeerConnection;
  B.supported = supported;

  /* ---------- pairing codes ---------- */
  const b64u = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const unb64u = (t) => { const b = atob(t.replace(/-/g, '+').replace(/_/g, '/')); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
  async function pipe(bytes, Stream) { const s = new Blob([bytes]).stream().pipeThrough(new Stream('deflate-raw')); return new Uint8Array(await new Response(s).arrayBuffer()); }
  async function encode(type, sdp) {
    const raw = enc.encode(JSON.stringify({ t: type, s: sdp }));
    if (window.CompressionStream) return 'BEAM1.' + b64u(await pipe(raw, CompressionStream));
    return 'BEAM0.' + b64u(raw);
  }
  async function decode(code) {
    code = String(code || '').replace(/\s+/g, '');
    if (code.length > MAX_CODE || !/^BEAM[01]\.[\w-]+$/.test(code)) throw new Error('That is not a Beam code');
    let raw = unb64u(code.slice(6));
    if (code[4] === '1') { if (!window.DecompressionStream) throw new Error('This browser cannot read compressed codes'); try { raw = await pipe(raw, DecompressionStream); } catch { throw new Error('That Beam code is damaged'); } }
    let o; try { o = JSON.parse(dec.decode(raw)); } catch { throw new Error('That Beam code is damaged'); }
    if (!o || (o.t !== 'o' && o.t !== 'a') || typeof o.s !== 'string' || !o.s.startsWith('v=0') || o.s.length > 20000) throw new Error('That Beam code is damaged');
    return o;
  }
  const fingerprints = (sdp) => [...sdp.matchAll(/a=fingerprint:sha-256 ([0-9A-Fa-f:]+)/g)].map((m) => m[1].toUpperCase());
  async function verifyCode(a, b) {
    const f = [...fingerprints(a), ...fingerprints(b)].sort().join('|');
    const d = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode('ulyOS-beam|' + f)));
    const n = ((d[0] << 24) | (d[1] << 16) | (d[2] << 8) | d[3]) >>> 0;
    const s = String(n % 1000000).padStart(6, '0');
    return s.slice(0, 3) + ' ' + s.slice(3);
  }
  const safeName = (n) => String(n || 'file').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').replace(/^\.+/, '_').slice(0, 120) || 'file';

  /* ---------- a connection ---------- */
  function createLink({ internet = false, onState, onMessage, onBinary }) {
    const pc = new RTCPeerConnection({ iceServers: internet ? [{ urls: 'stun:stun.l.google.com:19302' }] : [] });
    const link = { pc, dc: null, open: false, localSdp: '', remoteSdp: '' };
    const wire = (dc) => {
      link.dc = dc; dc.binaryType = 'arraybuffer'; dc.bufferedAmountLowThreshold = 1 << 20;
      dc.onopen = () => { if (link.open) return; link.open = true; onState('open'); };
      dc.onclose = () => { link.open = false; onState('closed'); };
      if (dc.readyState === 'open') queueMicrotask(() => dc.onopen());   // an answerer's channel can already be open
      dc.onmessage = (e) => { if (typeof e.data === 'string') { let m; try { m = JSON.parse(e.data); } catch { return; } if (m && typeof m.t === 'string') onMessage(m); } else onBinary(e.data); };
    };
    pc.ondatachannel = (e) => wire(e.channel);
    pc.onconnectionstatechange = () => { if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) { link.open = false; onState(pc.connectionState === 'failed' ? 'failed' : 'closed'); } };
    const gathered = () => new Promise((res) => {
      if (pc.iceGatheringState === 'complete') return res();
      const t = setTimeout(res, 5000);
      pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } });
    });
    link.offer = async () => { wire(pc.createDataChannel('beam', { ordered: true })); await pc.setLocalDescription(await pc.createOffer()); await gathered(); link.localSdp = pc.localDescription.sdp; return encode('o', link.localSdp); };
    link.accept = async (o) => { link.remoteSdp = o.s; await pc.setRemoteDescription({ type: 'offer', sdp: o.s }); await pc.setLocalDescription(await pc.createAnswer()); await gathered(); link.localSdp = pc.localDescription.sdp; return encode('a', link.localSdp); };
    link.finish = async (o) => { link.remoteSdp = o.s; await pc.setRemoteDescription({ type: 'answer', sdp: o.s }); };
    link.send = (m) => link.dc.send(JSON.stringify(m));
    link.sendBin = async (buf) => { if (link.dc.bufferedAmount > 4 << 20) await new Promise((r) => link.dc.addEventListener('bufferedamountlow', r, { once: true })); link.dc.send(buf); };
    link.close = () => { try { link.dc?.close(); } catch { /* ignore */ } try { pc.close(); } catch { /* ignore */ } };
    return link;
  }
  B._createLink = createLink; B._encode = encode; B._decode = decode;

  /* ---------- QR ---------- */
  async function loadScript(src) { await new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src)); document.head.append(s); }); }
  async function drawQr(canvas, text) {
    if (!window.qrcode) await loadScript('vendor/qrcode.js');
    const qr = window.qrcode(0, 'L'); qr.addData(text, 'Byte'); qr.make();
    const n = qr.getModuleCount(), size = 360, cell = Math.max(2, Math.floor(size / (n + 4))), px = cell * (n + 4);
    canvas.width = canvas.height = px; const g = canvas.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, px, px); g.fillStyle = '#000';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) g.fillRect((c + 2) * cell, (r + 2) * cell, cell, cell);
  }
  /** Camera scan → resolves the text of the first QR code seen, or null if cancelled / unavailable. */
  function scan() {
    return new Promise(async (resolve) => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { ui.toast('This browser cannot use the camera here (needs HTTPS or localhost)', { type: 'err' }); return resolve(null); }
      let stream = null, stopped = false, timer = 0;
      const video = h('video', { class: 'bm-video', playsinline: true, muted: true, autoplay: true });
      const hint = h('div', { class: 'bm-hint', text: 'Point the camera at the QR code on the other device' });
      const box = h('div', { class: 'bm-scan' }, h('div', { class: 'bm-scan-card' }, video, hint, h('button', { class: 'btn', text: 'Cancel', onclick: () => finish(null) })));
      const finish = (v) => { if (stopped) return; stopped = true; clearInterval(timer); if (stream) stream.getTracks().forEach((t) => t.stop()); box.remove(); resolve(v); };
      document.getElementById('overlay-root').append(box);
      try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }); }
      catch (e) { hint.textContent = e.name === 'NotAllowedError' ? 'Camera permission was denied — paste the code instead' : 'No camera available — paste the code instead'; setTimeout(() => finish(null), 2400); return; }
      video.srcObject = stream; await video.play().catch(() => {});
      const detector = window.BarcodeDetector ? new window.BarcodeDetector({ formats: ['qr_code'] }) : null;
      if (!detector && !window.jsQR) { try { await loadScript('vendor/jsQR.js'); } catch { hint.textContent = 'QR reader unavailable — paste the code instead'; setTimeout(() => finish(null), 2400); return; } }
      const cv = document.createElement('canvas'), cx = cv.getContext('2d', { willReadFrequently: true });
      timer = setInterval(async () => {
        if (stopped || video.readyState < 2) return;
        try {
          if (detector) { const r = await detector.detect(video); if (r.length) finish(r[0].rawValue); }
          else {
            const w = video.videoWidth, hh = video.videoHeight; if (!w) return;
            const k = Math.min(1, 720 / Math.max(w, hh)); cv.width = Math.round(w * k); cv.height = Math.round(hh * k); cx.drawImage(video, 0, 0, cv.width, cv.height);
            const q = window.jsQR(cx.getImageData(0, 0, cv.width, cv.height).data, cv.width, cv.height); if (q && q.data) finish(q.data);
          }
        } catch { /* keep scanning */ }
      }, 250);
    });
  }
  B.scan = scan;

  /* ---------- the app ---------- */
  B.open = function () {
    const ex = WM.byApp('beam')[0];
    if (ex) { WM.focus(ex); return ex; }
    return WM.open({ appId: 'beam', title: 'Beam', icon: icon('send', 16), width: 600, height: 680, minWidth: 380, minHeight: 440, mem: 10, render: build, onClose: () => { if (B._cleanup) B._cleanup(); } });
  };

  function build() {
    const root = h('div', { class: 'bm' });
    const show = (...nodes) => root.replaceChildren(...nodes.flat().filter(Boolean));
    let link = null, internet = false, verify = '', peer = 'the other device';
    const rows = new Map();                 // transfer id → { el, bar, status, actions }
    const pending = new Map();              // outgoing offers waiting for accept / reject
    let cur = null;                         // file currently being received
    const list = h('div', { class: 'bm-list' });
    B._cleanup = () => { try { if (link) link.close(); } catch { /* ignore */ } link = null; B._link = null; B._send = null; cur = null; helloSent = false; };
    bus.on('session:lock', () => { B._cleanup(); if (root.isConnected) home('The screen was locked, so the connection was closed.'); });

    const note = (t) => h('p', { class: 'set-desc', text: t });
    const copyBtn = (getText) => h('button', { class: 'btn sm', text: 'Copy code', onclick: async () => { try { await ulyOS.clip.copy(getText()); ui.toast('Code copied', { type: 'ok', timeout: 1600 }); } catch { ui.toast('Select the code and copy it', { type: 'info' }); } } });

    let helloSent = false;
    const sayHello = () => { if (helloSent || !link || !link.open) return; helloSent = true; link.send({ t: 'hello', name: (ulyOS.security.profile() && ulyOS.security.profile().name) || 'ulyOS' }); };
    function newLink() {
      B._cleanup();
      link = createLink({ internet, onState, onMessage, onBinary });
      B._link = link;
      return link;
    }
    async function onState(st) {
      if (st === 'open') {
        verify = await verifyCode(link.localSdp, link.remoteSdp).catch(() => '');
        sayHello();
        connected();
        ulyOS.audit('Beam: device connected', 'ok');
      } else if ((st === 'closed' || st === 'failed') && root.isConnected) {
        B._cleanup();
        home(st === 'failed' ? 'The connection could not be made. Both devices must be on the same Wi-Fi (not a guest network), or tick “Also try over the internet”.' : 'The other device disconnected.');
      }
    }

    /* ----- screens ----- */
    function home(message) {
      show(
        h('div', { class: 'bm-hero' }, h('div', { class: 'bm-logo', html: icon('send', 30) }), h('h2', { text: 'Beam' }), h('p', { text: 'Send files, pictures, text and your ulyOS settings straight between two devices — end-to-end encrypted, no server, no account.' })),
        message ? h('div', { class: 'bm-msg', text: message }) : null,
        !supported ? h('div', { class: 'bm-msg', text: 'This browser has no WebRTC, so Beam cannot connect.' }) : null,
        h('div', { class: 'bm-choice' },
          h('button', { class: 'btn primary', html: '<b>Start</b><span>This device shows the first code</span>', disabled: !supported, onclick: hostStart }),
          h('button', { class: 'btn', html: '<b>Join</b><span>I have a code from the other device</span>', disabled: !supported, onclick: joinStart })),
        h('label', { class: 'check bm-opt' }, h('input', { type: 'checkbox', checked: internet, onchange: (e) => { internet = e.target.checked; } }), h('span', { text: 'Also try over the internet (asks a public STUN server — Google’s — which then learns your public IP address)' })),
        h('details', { class: 'howto' }, h('summary', { text: 'How to use Beam (and how it compares to LocalSend)' }),
          h('ol', {}, [
            h('li', { html: 'Open Beam on <b>both</b> devices (the phone can use the online site or an offline copy). Be on the same Wi-Fi.' }),
            h('li', { html: 'Device 1: <b>Start</b> — a code and QR appear. Device 2: <b>Join</b> — scan the QR (or paste the code).' }),
            h('li', { html: 'Device 2 now shows a reply code. On device 1 scan or paste it and press <b>Connect</b>.' }),
            h('li', { html: 'Both devices show the same 6-digit number — check they match, then send files, text or settings. The receiver chooses to accept each file.' }),
          ]),
          h('p', { html: '<b>Not the LocalSend app:</b> LocalSend’s own protocol needs a local web server and network discovery that web pages are not allowed to run, so Beam cannot talk to the LocalSend app. It does the same job browser-to-browser: ulyOS ↔ ulyOS. The two codes replace automatic discovery.' }))
      );
    }

    async function hostStart() {
      show(h('div', { class: 'bm-wait', text: 'Creating your code…' }));
      let code;
      try { code = await newLink().offer(); } catch (e) { home('Could not start: ' + e.message); return; }
      const qr = h('canvas', { class: 'bm-qr' });
      drawQr(qr, code).catch(() => { qr.replaceWith(h('div', { class: 'set-desc', text: 'The code is too long for a QR — copy it instead.' })); });
      const box = h('textarea', { class: 'bm-code', readonly: true, rows: 3, 'aria-label': 'Your code', value: code });
      const reply = h('textarea', { class: 'bm-code', rows: 3, placeholder: 'Paste the reply code from the other device here', 'aria-label': 'Reply code', spellcheck: false });
      const err = h('div', { class: 'auth-err', role: 'alert' });
      const connect = async () => {
        err.textContent = '';
        try { const o = await decode(reply.value); if (o.t !== 'a') throw new Error('That is a first code — paste the reply code from the other device'); await link.finish(o); err.textContent = 'Connecting…'; }
        catch (e) { err.textContent = e.message; }
      };
      show(
        h('h3', { text: '1 · Show this to the other device' }), note('On the other device open Beam → Join, then scan this QR or paste the code.'),
        h('div', { class: 'bm-qrwrap' }, qr), box, h('div', { class: 'btn-row' }, copyBtn(() => code)),
        h('h3', { text: '2 · Enter its reply' }),
        reply, err,
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn', html: icon('qr', 14) + ' Scan reply', onclick: async () => { const t = await scan(); if (t) { reply.value = t; connect(); } } }),
          h('button', { class: 'btn primary', text: 'Connect', onclick: connect }),
          h('button', { class: 'btn', text: 'Cancel', onclick: () => { B._cleanup(); home(); } })));
    }

    function joinStart(message) {
      const input = h('textarea', { class: 'bm-code', rows: 3, placeholder: 'Paste the code shown on the other device here', 'aria-label': 'Code from the other device', spellcheck: false });
      const err = h('div', { class: 'auth-err', role: 'alert', text: message || '' });
      const go = async () => {
        err.textContent = '';
        try {
          const o = await decode(input.value);
          if (o.t !== 'o') throw new Error('That is a reply code — on this device paste the first code from the device that pressed Start');
          show(h('div', { class: 'bm-wait', text: 'Creating the reply…' }));
          const code = await newLink().accept(o);
          const qr = h('canvas', { class: 'bm-qr' });
          drawQr(qr, code).catch(() => { qr.replaceWith(h('div', { class: 'set-desc', text: 'The code is too long for a QR — copy it instead.' })); });
          show(h('h3', { text: 'Show this reply to the other device' }), note('On the other device: scan this QR (or paste the code) and press Connect. This screen changes by itself when you are connected.'),
            h('div', { class: 'bm-qrwrap' }, qr), h('textarea', { class: 'bm-code', readonly: true, rows: 3, value: code, 'aria-label': 'Reply code' }),
            h('div', { class: 'btn-row' }, copyBtn(() => code), h('button', { class: 'btn', text: 'Cancel', onclick: () => { B._cleanup(); home(); } })));
        } catch (e) { B._cleanup(); joinStart(e.message); }
      };
      show(h('h3', { text: 'Join: enter the other device’s code' }), note('On the other device open Beam and press Start. Then scan its QR with the button below, or paste the code.'),
        input, err,
        h('div', { class: 'btn-row' }, h('button', { class: 'btn', html: icon('qr', 14) + ' Scan QR', onclick: async () => { const t = await scan(); if (t) { input.value = t; go(); } } }), h('button', { class: 'btn primary', text: 'Continue', onclick: go }), h('button', { class: 'btn', text: 'Back', onclick: () => home() })));
    }

    function connected() {
      const text = h('input', { class: 'input', placeholder: 'Type a message or paste a link…', maxLength: 5000, 'aria-label': 'Message to send' });
      const picker = h('input', { type: 'file', multiple: true, hidden: true, onchange: () => { const fl = [...picker.files]; picker.value = ''; sendFiles(fl); } });
      const drop = h('div', { class: 'bm-drop', tabindex: 0, role: 'button', 'aria-label': 'Choose files to send', html: icon('upload', 22) + '<b>Drop files here or tap to choose</b><span>Photos, documents, anything up to 512 MB each</span>' });
      drop.addEventListener('click', () => picker.click());
      drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); picker.click(); } });
      drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
      drop.addEventListener('dragleave', () => drop.classList.remove('over'));
      drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); sendFiles([...e.dataTransfer.files]); });
      const sendText = () => { const t = text.value.trim(); if (!t || !link || !link.open) return; link.send({ t: 'text', text: t.slice(0, 5000) }); addNote('You', t); text.value = ''; };
      text.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); sendText(); } });
      show(
        h('div', { class: 'bm-conn' }, h('span', { class: 'bm-dot' }), h('div', {}, h('b', { text: 'Connected to ' + peer }), h('div', { class: 'set-desc', text: 'Check that the other device shows the same number:' })), h('div', { class: 'bm-verify mono', text: verify || '—' })),
        drop, picker,
        h('div', { class: 'bm-send' }, text, h('button', { class: 'btn', text: 'Send text', onclick: sendText })),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn sm', html: icon('settings', 13) + ' Send my settings', title: 'Sends your look and layout as a settings file (no notes, passwords or app data)', onclick: () => { const { blob, name } = ulyOS.desktopApi.settingsFile(); sendFiles([new File([blob], name, { type: 'application/json' })]); } }),
          h('span', { class: 'grow' }),
          h('button', { class: 'btn sm danger', text: 'Disconnect', onclick: () => { B._cleanup(); home(); } })),
        h('h3', { text: 'Transfers' }), list);
    }

    /* ----- transfers ----- */
    const row = (id, title, sub) => {
      const bar = h('i'), status = h('div', { class: 'set-desc', text: sub }), actions = h('div', { class: 'btn-row' });
      const el = h('div', { class: 'bm-row' }, h('div', { class: 'bm-rt', text: title }), h('div', { class: 'stor-bar' }, bar), status, actions);
      const r = { el, bar, status, actions }; rows.set(id, r); list.prepend(el); return r;
    };
    const setProg = (r, f) => { r.bar.style.width = Math.max(0, Math.min(100, f * 100)) + '%'; };
    function addNote(who, text) {
      const r = row('n' + Math.random(), who + ' · message', ''); r.el.classList.add('note');
      r.status.remove(); r.el.querySelector('.stor-bar').remove(); r.el.append(h('div', { class: 'bm-text', text }));
      if (who !== 'You') r.actions.append(h('button', { class: 'btn sm', text: 'Copy', onclick: () => ulyOS.clip.copy(text).then(() => ui.toast('Copied', { type: 'ok', timeout: 1400 })).catch(() => {}) }));
    }
    B._send = (fl) => sendFiles(fl);
    async function sendFiles(files) {
      for (const f of files) {
        if (!link || !link.open) { ui.toast('Not connected', { type: 'err' }); return; }
        const id = Math.random().toString(36).slice(2, 10);
        const r = row(id, '↑ ' + f.name, fmtBytes(f.size));
        if (f.size > MAX_FILE) { r.status.textContent = 'Too large (512 MB max)'; continue; }
        r.status.textContent = 'Waiting for ' + peer + ' to accept…';
        link.send({ t: 'offer', id, name: safeName(f.name), size: f.size, mime: f.type || '' });
        const ok = await new Promise((res) => pending.set(id, res));
        pending.delete(id);
        if (!ok) { r.status.textContent = ok === false ? 'Declined' : 'Cancelled'; continue; }
        r.status.textContent = 'Sending…';
        try {
          for (let o = 0; o < f.size; o += CHUNK) {
            if (!link || !link.open) throw new Error('Disconnected');
            if (r.cancel) { r.status.textContent = 'Cancelled'; break; }
            await link.sendBin(await f.slice(o, o + CHUNK).arrayBuffer());
            setProg(r, Math.min(1, (o + CHUNK) / f.size)); r.status.textContent = 'Sending… ' + fmtBytes(Math.min(o + CHUNK, f.size)) + ' of ' + fmtBytes(f.size);
          }
          if (!r.cancel) { if (f.size === 0) { /* nothing to stream */ } link.send({ t: 'done', id }); setProg(r, 1); r.status.textContent = 'Sent · ' + fmtBytes(f.size); ulyOS.audit("Beam: sent '" + f.name + "' (" + fmtBytes(f.size) + ')', 'ok'); }
        } catch (e) { r.status.textContent = 'Failed: ' + e.message; }
      }
    }
    function onMessage(m) {
      if (m.t === 'hello') { peer = String(m.name || 'the other device').slice(0, 40); const b = root.querySelector('.bm-conn b'); if (b) b.textContent = 'Connected to ' + peer; sayHello(); }
      else if (m.t === 'text' && typeof m.text === 'string') { addNote(peer, m.text.slice(0, 5000)); if (ulyOS.fx && ulyOS.fx.sound) ulyOS.fx.sound('ok'); }
      else if (m.t === 'offer') {
        const id = String(m.id || ''), size = +m.size, name = safeName(m.name);
        if (!/^[a-z0-9]{4,12}$/.test(id) || !Number.isFinite(size) || size < 0) return;
        const r = row(id, '↓ ' + name, fmtBytes(size) + ' from ' + peer);
        if (size > MAX_FILE || cur) { link.send({ t: 'reject', id }); r.status.textContent = size > MAX_FILE ? 'Too large — declined' : 'Busy — declined'; return; }
        if (ulyOS.fx && ulyOS.fx.sound) ulyOS.fx.sound('ok');
        r.actions.append(
          h('button', { class: 'btn sm primary', text: 'Accept', onclick: () => {
            if (cur) { ui.toast('Another file is still arriving', { type: 'info' }); return; }
            cur = { id, name, size, mime: String(m.mime || ''), chunks: [], got: 0, r };
            r.actions.replaceChildren(h('button', { class: 'btn sm', text: 'Cancel', onclick: () => { link.send({ t: 'cancel', id }); cur = null; r.status.textContent = 'Cancelled'; r.actions.replaceChildren(); } }));
            r.status.textContent = 'Receiving…'; link.send({ t: 'accept', id }); if (size === 0) finishIncoming();
          } }),
          h('button', { class: 'btn sm', text: 'Decline', onclick: () => { link.send({ t: 'reject', id }); r.status.textContent = 'Declined'; r.actions.replaceChildren(); } }));
      } else if (m.t === 'accept' && pending.has(m.id)) pending.get(m.id)(true);
      else if (m.t === 'reject' && pending.has(m.id)) pending.get(m.id)(false);
      else if (m.t === 'cancel') {
        const r = rows.get(m.id); if (r) { r.cancel = true; r.status.textContent = 'Cancelled by the other device'; r.actions.replaceChildren(); }
        if (cur && cur.id === m.id) cur = null;
      } else if (m.t === 'done' && cur && cur.id === m.id) finishIncoming();
    }
    function onBinary(buf) {
      if (!cur) return;
      cur.chunks.push(buf); cur.got += buf.byteLength;
      if (cur.got > cur.size) { cur.r.status.textContent = 'Failed: more data than announced'; cur = null; return; }
      setProg(cur.r, cur.size ? cur.got / cur.size : 1); cur.r.status.textContent = 'Receiving… ' + fmtBytes(cur.got) + ' of ' + fmtBytes(cur.size);
    }
    function finishIncoming() {
      const c = cur; cur = null;
      if (c.got !== c.size) { c.r.status.textContent = 'Failed: incomplete (' + fmtBytes(c.got) + ' of ' + fmtBytes(c.size) + ')'; return; }
      const blob = new Blob(c.chunks, { type: c.mime || 'application/octet-stream' });
      setProg(c.r, 1); c.r.status.textContent = 'Received · ' + fmtBytes(c.size); ulyOS.audit("Beam: received '" + c.name + "' (" + fmtBytes(c.size) + ')', 'ok');
      const isSettings = /^ulyOS-settings.*\.json$/i.test(c.name);
      c.r.actions.replaceChildren(...[
        h('button', { class: 'btn sm primary', text: 'Save to Files', title: 'Documents → Received (encrypted)', onclick: async () => { try { await ulyOS.FS.writeSandboxFile('Documents/Received/' + c.name, blob); ui.toast(c.name + ' saved in Files → Documents → Received', { type: 'ok' }); } catch (e) { ui.toast('Could not save: ' + e.message, { type: 'err' }); } } }),
        h('button', { class: 'btn sm', text: 'Download', onclick: () => { const a = h('a', { href: URL.createObjectURL(blob), download: c.name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); } }),
        isSettings ? h('button', { class: 'btn sm', text: 'Import settings', onclick: () => ulyOS.desktopApi.importSettings(new File([blob], c.name, { type: 'application/json' })) }) : null,
      ].filter(Boolean));
      if (/^image\/(png|jpe?g|gif|webp)$/.test(blob.type) && blob.size < 8e6) { const img = h('img', { class: 'bm-thumb', alt: c.name }); img.src = URL.createObjectURL(blob); img.onload = () => URL.revokeObjectURL(img.src); c.r.el.append(img); }
    }
    home();
    return root;
  }
})();
