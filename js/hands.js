/* ==========================================================================
   ulyOS · js/hands.js — Hands: move notes and images with your bare hands
   A webcam-driven board in the spirit of Jared Rhodenizer's "barehands"
   (github.com/jaredrhod/barehands). Original code: hand tracking by Google
   MediaPipe (Apache-2.0, vendored in vendor/mediapipe and loaded only when
   you start the camera); everything else here is ulyOS.

   Gestures:  tap (quick pinch) closes a card or presses a button
              pinch-drag moves a card · two hands pinching one card scale it
              flick to throw · clap (palms together) sweeps the board clean
   The ring shows what your assistant is doing (idle / listening / thinking /
   speaking). Cards can also be moved with a mouse or finger, so the board works
   without a camera. The camera image never leaves your device.
   ========================================================================== */
(function () {
  'use strict';
  const { h, icon } = ulyOS.util;
  const { ui } = ulyOS;
  const Hd = (ulyOS.Hands = {});
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  /* ======================================================================
     Gesture maths (pure; landmarks are MediaPipe's 21 normalised points)
     ====================================================================== */
  const TIP = { index: 8, middle: 12, ring: 16, pinky: 20 }, PIP = { index: 6, middle: 10, ring: 14, pinky: 18 };
  /** Hand size = wrist → middle-finger knuckle, so every ratio below holds at any camera distance. */
  const handSize = (lm) => dist(lm[0], lm[9]) || 1e-6;
  const pinchRatio = (lm) => dist(lm[4], lm[8]) / handSize(lm);
  const fingers = (lm) => {
    const ext = {};
    for (const k of Object.keys(TIP)) ext[k] = dist(lm[TIP[k]], lm[0]) > dist(lm[PIP[k]], lm[0]) * 1.08;
    ext.count = ext.index + ext.middle + ext.ring + ext.pinky;
    return ext;
  };
  const isOpenPalm = (lm) => fingers(lm).count >= 4 && pinchRatio(lm) > 0.7;
  const isUp = (lm) => lm[12].y < lm[0].y - handSize(lm) * 0.6;       // fingertips above the wrist
  Hd.gesture = { handSize, pinchRatio, fingers, isOpenPalm, isUp };
  const PINCH_ON = 0.4, PINCH_OFF = 0.58;                              // hysteresis: no flicker around the threshold

  /* ======================================================================
     Interaction engine (works on stage pixels; shared by camera, tests and demo)
     hand = { cursor:{x,y}, pinch:bool, open:bool, up:bool, size:px, wrist:{x,y} }
     ====================================================================== */
  function engine(api) {
    const slots = [{}, {}]; let lastClap = 0, clapCool = 0;
    const release = (s, now) => {
      if (!s.down) return; s.down = false;
      const dt = now - s.t0;
      if (dt < 380 && s.moved < 26) api.tap(s.p0.x, s.p0.y, s.card);
      else if (s.card && s.hist && s.hist.length > 2) {
        const a = s.hist[s.hist.length - 1], b = s.hist.find((q) => a.t - q.t < 140) || s.hist[0], span = Math.max(16, a.t - b.t);
        const vx = ((a.x - b.x) / span) * 16, vy = ((a.y - b.y) / span) * 16;     // px per frame (~60 fps)
        if (Math.hypot(vx, vy) > 14) { s.card.vx = vx; s.card.vy = vy; }
      }
      s.card = null; s.pair = null;
    };
    return {
      slots,
      update(hands, now = performance.now()) {
        hands.forEach((hd, i) => {
          const s = slots[i];
          if (hd.pinch && !s.down) {
            Object.assign(s, { down: true, t0: now, p0: { ...hd.cursor }, moved: 0, hist: [], card: api.cardAt(hd.cursor.x, hd.cursor.y) });
            if (s.card) { s.off = { x: s.card.x - hd.cursor.x, y: s.card.y - hd.cursor.y }; api.raise(s.card); s.card.vx = s.card.vy = 0; }
          } else if (hd.pinch && s.down) {
            s.moved = Math.max(s.moved, dist(hd.cursor, s.p0)); s.hist.push({ x: hd.cursor.x, y: hd.cursor.y, t: now }); if (s.hist.length > 8) s.hist.shift();
            if (s.card && !(slots[1 - i].down && slots[1 - i].card === s.card)) { s.card.x = hd.cursor.x + s.off.x; s.card.y = hd.cursor.y + s.off.y; }
          } else if (!hd.pinch && s.down) release(s, now);
        });
        for (let i = hands.length; i < 2; i++) release(slots[i], now);                 // a hand that left the picture lets go
        // two hands pinching the same card: scale and rotate it
        const [a, b] = slots;
        if (a.down && b.down && a.card && a.card === b.card && hands.length === 2) {
          const d = dist(hands[0].cursor, hands[1].cursor);
          if (!a.pair) a.pair = { d0: d, s0: a.card.scale, ang0: Math.atan2(hands[1].cursor.y - hands[0].cursor.y, hands[1].cursor.x - hands[0].cursor.x), r0: a.card.rot };
          const k = Math.max(0.4, Math.min(3, a.pair.s0 * (d / Math.max(20, a.pair.d0))));
          a.card.scale = k; a.card.rot = a.pair.r0 + (Math.atan2(hands[1].cursor.y - hands[0].cursor.y, hands[1].cursor.x - hands[0].cursor.x) - a.pair.ang0) * 57.3 * 0.5;
          a.card.x = (hands[0].cursor.x + hands[1].cursor.x) / 2; a.card.y = (hands[0].cursor.y + hands[1].cursor.y) / 2;
        }
        // clap: both palms open and upright, wrists close together and closing fast
        if (hands.length === 2 && hands[0].open && hands[1].open && hands[0].up && hands[1].up) {
          const d = dist(hands[0].wrist, hands[1].wrist), sz = (hands[0].size + hands[1].size) / 2;
          if (now > clapCool && d < sz * 1.7 && lastClap && lastClap - d > sz * 0.25) { clapCool = now + 1800; api.clear(); }
          lastClap = d;
        } else lastClap = 0;
      },
    };
  }
  Hd.engine = engine;

  /* ======================================================================
     The board
     ====================================================================== */
  let idSeq = 0;
  Hd.mount = function (stage, opts = {}) {
    const getState = opts.state || (() => 'idle');
    const cards = []; let zTop = 10, spotlight = null, running = false, stream = null, landmarker = null, raf = 0, lastT = -1, frames = 0, orbs = false;
    const cam = h('video', { class: 'hd-cam', muted: true, playsInline: true, 'aria-hidden': 'true' });
    const layer = h('div', { class: 'hd-cards' });
    const cursors = [h('div', { class: 'hd-cursor', hidden: true }), h('div', { class: 'hd-cursor', hidden: true })];
    const status = h('div', { class: 'hd-status', text: 'Camera off. Cards still work with the mouse or touch.' });
    const ring = h('button', { class: 'hd-ring', 'data-tap': '1', 'aria-label': 'Menu', 'data-s': 'idle', onclick: () => toggleOrbs() }, h('i'));
    const orbBox = h('div', { class: 'hd-orbs' });
    const camBtn = h('button', { class: 'btn sm primary', html: icon('video', 14) + ' Start camera' });
    const imgIn = h('input', { type: 'file', accept: 'image/*', hidden: true });
    const imgBtn = h('button', { class: 'btn sm', html: icon('image', 14) + ' Add image', onclick: () => imgIn.click() });
    const clearBtn = h('button', { class: 'btn sm', text: 'Clear board', onclick: () => clear() });
    const fullBtn = h('button', { class: 'btn sm', html: icon('fullscreen', 14) + ' Full screen', onclick: () => { if (document.fullscreenElement) document.exitFullscreen(); else stage.requestFullscreen?.().catch(() => {}); } });
    stage.classList.add('hd');
    stage.append(cam, layer, ...cursors, orbBox, ring, h('div', { class: 'hd-bar' }, camBtn, imgBtn, clearBtn, fullBtn), status, imgIn);

    const size = () => ({ W: stage.clientWidth || 800, H: stage.clientHeight || 450 });
    const place = (c) => { c.el.style.transform = 'translate(' + (c.x - c.w / 2) + 'px,' + (c.y - c.h / 2) + 'px) rotate(' + c.rot + 'deg) scale(' + c.scale + ')'; c.el.style.zIndex = c.z; };
    const api = {
      cardAt(x, y) { for (let i = cards.length - 1; i >= 0; i--) { const c = cards[i]; if (!c.gone && Math.abs(x - c.x) < (c.w * c.scale) / 2 && Math.abs(y - c.y) < (c.h * c.scale) / 2) return c; } return null; },
      raise(c) { c.z = ++zTop; place(c); },
      tap(x, y, card) {
        const els = document.elementsFromPoint(stage.getBoundingClientRect().left + x, stage.getBoundingClientRect().top + y).filter((e) => stage.contains(e));
        const t = els.map((e) => e.closest('[data-tap]')).find(Boolean);
        if (t) { t.click(); return; }
        if (card) remove(card);                      // tap a card to close it
      },
      clear() { clear(); },
    };
    const eng = engine(api);

    function add({ title = 'Note', body = '', img = null, x, y, scale = 1, cls = '' }) {
      const { W, H } = size(); const el = h('div', { class: 'hd-card ' + cls });
      const c = { id: ++idSeq, title, el, x: x ?? W / 2 + (Math.random() - 0.5) * W * 0.3, y: y ?? H / 2 + (Math.random() - 0.5) * H * 0.25, w: 270, h: 160, scale, rot: (Math.random() - 0.5) * 5, vx: 0, vy: 0, z: ++zTop, gone: false, blob: null };
      const close = h('button', { class: 'hd-x', 'aria-label': 'Close card', text: '×', onclick: (e) => { e.stopPropagation(); remove(c); } });
      const bodyEl = h('div', { class: 'hd-body' });
      if (img) { bodyEl.append(h('img', { src: img, alt: title, draggable: false })); c.blob = img; }
      else bodyEl.append(typeof body === 'string' ? opts.render ? opts.render(body, (l) => opts.onLink && opts.onLink(l)) : h('p', { text: body }) : body);
      el.append(h('div', { class: 'hd-head' }, h('b', { text: title }), close), bodyEl);
      layer.append(el); c.w = el.offsetWidth || 270; c.h = el.offsetHeight || 160; cards.push(c); place(c);
      // mouse / touch dragging (so the board works without a camera)
      el.addEventListener('pointerdown', (e) => {
        if (e.target.closest('button,a,input')) return; e.preventDefault(); api.raise(c); c.vx = c.vy = 0;
        const r = stage.getBoundingClientRect(), ox = c.x - (e.clientX - r.left), oy = c.y - (e.clientY - r.top); el.setPointerCapture(e.pointerId);
        const mv = (ev) => { c.x = ev.clientX - r.left + ox; c.y = ev.clientY - r.top + oy; place(c); };
        const up = () => { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); };
        el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up);
      });
      el.classList.add('pop'); return c;
    }
    function remove(c) { if (c.gone) return; c.gone = true; c.el.classList.add('out'); if (c.blob && c.blob.startsWith('blob:')) URL.revokeObjectURL(c.blob); setTimeout(() => c.el.remove(), 260); cards.splice(cards.indexOf(c), 1); if (spotlight === c) { spotlight = null; layer.classList.remove('dim'); } }
    function clear() { [...cards].forEach((c) => { c.vy = -22; setTimeout(() => remove(c), 120); }); spotlight = null; layer.classList.remove('dim'); }
    /** "Put it on the glass": a card flies centre stage, enlarged and spotlit, everything else dimmed. */
    function present({ title, body }) {
      const { W, H } = size(); if (spotlight) remove(spotlight);
      const c = add({ title: String(title || 'Note').slice(0, 80), body: String(body || '').slice(0, 4000), x: W / 2, y: H / 2, scale: 1.18, cls: 'spot' }); c.rot = 0; place(c);
      spotlight = c; layer.classList.add('dim'); return c;
    }
    function toggleOrbs(force) {
      orbs = force ?? !orbs;
      const { W, H } = size();
      orbBox.replaceChildren(...(orbs ? [['Notes', () => openNotes()], ['Gestures', () => showGestures()], ['Clear', () => clear()]].map(([t, fn], i) => h('button', { class: 'hd-orb', 'data-tap': '1', text: t, style: { left: W / 2 + (i - 1) * 96 + 'px', top: H - 150 - (i === 1 ? 20 : 0) + 'px' }, onclick: () => { fn(); toggleOrbs(false); } })) : []));
    }
    async function openNotes() {
      const V = ulyOS.Jarvis && ulyOS.Jarvis.vault; if (!V) return;
      try { await V.ensure(); const list = (await V.list()).slice(-24).reverse();
        const box = h('div', { class: 'hd-list' }, list.map((n) => h('button', { class: 'hd-note', 'data-tap': '1', text: n.name, title: n.path, onclick: async () => { add({ title: n.name, body: await V.read(n.path) }); } })));
        add({ title: 'Notes', body: box });
      } catch (e) { ui.toast(e.message || 'Could not read the notes', { type: 'err' }); }
    }
    function showGestures() {
      add({ title: 'Gestures', body: h('div', { class: 'hd-help' }, ['Tap (a quick pinch): close a card, press a button', 'Pinch and drag: move a card', 'Two hands pinching one card: resize and turn it', 'Flick as you let go: throw it', 'Clap (palms together, fingers up): sweep the board clean', 'Tap the ring: open the menu'].map((t) => h('p', { text: t })))});
    }
    imgIn.addEventListener('change', () => {
      const f = imgIn.files[0]; imgIn.value = ''; if (!f) return;
      if (!/^image\/(png|jpe?g|gif|webp|avif)$/i.test(f.type) || f.size > 15 * 1024 * 1024) { ui.toast('Choose a PNG, JPEG, GIF or WebP under 15 MB', { type: 'err' }); return; }
      add({ title: f.name.slice(0, 40), img: URL.createObjectURL(f) });
    });

    /* physics: thrown cards glide, slow down and bounce off the edges */
    function physics() {
      const { W, H } = size();
      for (const c of cards) {
        if (!c.vx && !c.vy) continue;
        c.x += c.vx; c.y += c.vy; c.vx *= 0.94; c.vy *= 0.94;
        const mx = (c.w * c.scale) / 2, my = (c.h * c.scale) / 2;
        if (c.x < mx) { c.x = mx; c.vx = Math.abs(c.vx) * 0.6; } else if (c.x > W - mx) { c.x = W - mx; c.vx = -Math.abs(c.vx) * 0.6; }
        if (c.y < my) { c.y = my; c.vy = Math.abs(c.vy) * 0.6; } else if (c.y > H - my) { c.y = H - my; c.vy = -Math.abs(c.vy) * 0.6; }
        if (Math.hypot(c.vx, c.vy) < 0.3) c.vx = c.vy = 0;
        place(c);
      }
    }
    const paintRing = () => { const s = getState(); ring.dataset.s = s; ring.style.setProperty('--lvl', String((ulyOS.Jarvis && ulyOS.Jarvis.env.level) || 0)); };

    /* camera → hands */
    const memo = [{ pinch: false }, { pinch: false }];
    function toStage(p) {            // the camera is mirrored and shown with object-fit: cover
      const { W, H } = size(), vw = cam.videoWidth || 1280, vh = cam.videoHeight || 720, k = Math.max(W / vw, H / vh);
      return { x: W / 2 + ((1 - p.x) * vw - vw / 2) * k, y: H / 2 + (p.y * vh - vh / 2) * k };
    }
    function toHand(lm, i) {
      const r = pinchRatio(lm); memo[i].pinch = memo[i].pinch ? r < PINCH_OFF : r < PINCH_ON;
      const mid = { x: (lm[4].x + lm[8].x) / 2, y: (lm[4].y + lm[8].y) / 2 };
      const { W } = size(), k = Math.max(W / (cam.videoWidth || 1280), 1);
      return { cursor: toStage(mid), pinch: memo[i].pinch, open: isOpenPalm(lm), up: isUp(lm), size: handSize(lm) * (cam.videoWidth || 1280) * k, wrist: toStage(lm[0]) };
    }
    const frame = (hands) => {
      cursors.forEach((cu, i) => { const hd = hands[i]; cu.hidden = !hd; if (hd) { cu.style.transform = 'translate(' + (hd.cursor.x - 16) + 'px,' + (hd.cursor.y - 16) + 'px)'; cu.dataset.pinch = hd.pinch ? '1' : '0'; } });
      eng.update(hands);
    };
    const loop = () => {
      if (!running) return; raf = requestAnimationFrame(loop);
      if (!stage.isConnected) { stopCamera(); return; }
      physics(); paintRing();
      if (landmarker && cam.readyState >= 2 && cam.currentTime !== lastT) {
        lastT = cam.currentTime; frames++;
        let res = null; try { res = landmarker.detectForVideo(cam, performance.now()); } catch { /* skip a bad frame */ }
        const lms = ((res && res.landmarks) || []).slice(0, 2).sort((a, b) => a[0].x - b[0].x);
        frame(lms.map((lm, i) => toHand(lm, i)));
      }
    };
    async function ensureLandmarker() {
      if (landmarker) return landmarker;
      status.textContent = 'Loading hand tracking (about 22 MB, once)…';
      const base = (p) => new URL(p, document.baseURI).href;
      const { FilesetResolver, HandLandmarker } = await import(base('vendor/mediapipe/vision_bundle.mjs'));
      const files = await FilesetResolver.forVisionTasks(base('vendor/mediapipe/wasm'));
      const mk = (delegate) => HandLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: base('vendor/mediapipe/hand_landmarker.task'), delegate }, runningMode: 'VIDEO', numHands: 2, minHandDetectionConfidence: 0.55, minTrackingConfidence: 0.5 });
      try { landmarker = await mk('GPU'); } catch { landmarker = await mk('CPU'); }
      return landmarker;
    }
    async function startCamera() {
      if (running) return;
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { ui.toast('This browser has no camera access', { type: 'err' }); return; }
      camBtn.disabled = true;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }, audio: false });
        cam.srcObject = stream; await cam.play(); stage.classList.add('live');
        await ensureLandmarker();
        running = true; camBtn.disabled = false; camBtn.innerHTML = icon('x', 14) + ' Stop camera'; camBtn.classList.remove('primary'); status.textContent = 'Hand tracking is on. Pinch to grab a card. Video stays on this device.';
        loop();
      } catch (e) { stopCamera(); const m = e && e.name === 'NotAllowedError' ? 'Camera permission was denied' : e && e.name === 'NotFoundError' ? 'No camera found' : 'Could not start hand tracking: ' + ((e && e.message) || e); status.textContent = m; ui.toast(m, { type: 'err', timeout: 5000 }); }
      camBtn.disabled = false;
    }
    function stopCamera() {
      running = false; cancelAnimationFrame(raf); if (stream) stream.getTracks().forEach((t) => t.stop()); stream = null; cam.srcObject = null; stage.classList.remove('live');
      cursors.forEach((c) => { c.hidden = true; }); camBtn.innerHTML = icon('video', 14) + ' Start camera'; camBtn.classList.add('primary');
      if (!/denied|No camera|Could not/.test(status.textContent)) status.textContent = 'Camera off. Cards still work with the mouse or touch.';
      eng.update([], performance.now());
    }
    camBtn.addEventListener('click', () => (running ? stopCamera() : startCamera()));
    // the ring and physics also run without the camera
    const idle = () => { if (!stage.isConnected) return; requestAnimationFrame(idle); if (!running) { physics(); paintRing(); } };
    requestAnimationFrame(idle);
    return {
      add, present, clear, remove, startCamera, stopCamera,
      list: () => cards.map((c) => ({ id: c.id, title: c.title })),
      destroy: () => { stopCamera(); },
      _cards: cards, _engine: eng, _frames: () => frames, _running: () => running,
    };
  };

  Hd._test = { engine, PINCH_ON, PINCH_OFF };
})();
