/* ==========================================================================
   ulyOS · js/fx.js
   Telemetry-FX runtime: UI sound effects (WebAudio synth, no audio files) and
   3D tilt on widgets / icons / profile cards. CSS-driven FX (aurora, glow,
   depth, scanlines) live in style.css and are switched by Settings.
   ========================================================================== */
(function () {
  'use strict';
  const F = (ulyOS.fx = {});
  const S = () => ulyOS.settings;

  /* ---------------- sound ---------------- */
  let ac = null;
  function ctx() {
    if (!ac) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; ac = new C(); }
    if (ac.state === 'suspended') ac.resume().catch(() => {});
    return ac;
  }
  const TONES = {
    click: [[880, 0.035, 0]],
    open: [[520, 0.07, 0], [780, 0.09, 0.06]],
    close: [[640, 0.05, 0], [420, 0.08, 0.05]],
    ok: [[660, 0.07, 0], [990, 0.12, 0.07]],
    err: [[240, 0.12, 0], [180, 0.16, 0.1]],
    notify: [[740, 0.06, 0], [740, 0.08, 0.1]],
    lock: [[500, 0.07, 0], [330, 0.12, 0.07]],
    unlock: [[400, 0.06, 0], [600, 0.06, 0.06], [800, 0.1, 0.12]],
    purge: [[300, 0.1, 0], [200, 0.14, 0.08]],
  };
  F.sound = function (kind, mul = 1) {
    if (!S() || !S().get('sfx')) return;
    const vol = (S().get('sfxVolume') || 0) / 100;
    if (!vol) return;
    const a = ctx();
    if (!a) return;
    const t0 = a.currentTime;
    (TONES[kind] || TONES.click).forEach(([f, d, off]) => {
      const o = a.createOscillator(), g = a.createGain(), v = Math.max(0.0003, 0.1 * vol * mul);
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + off);
      g.gain.exponentialRampToValueAtTime(v, t0 + off + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + off + d);
      o.connect(g); g.connect(a.destination);
      o.start(t0 + off); o.stop(t0 + off + d + 0.03);
    });
  };

  /* ---------------- 3D tilt ---------------- */
  let tiltDeg = 0, cur = null, raf = 0, ev = null;
  const reset = (el) => { if (el) { el.style.removeProperty('--rx'); el.style.removeProperty('--ry'); } };
  F.setTilt = (d) => { tiltDeg = +d || 0; if (!tiltDeg) { reset(cur); cur = null; } };
  function step() {
    raf = 0;
    if (!ev || !tiltDeg) return;
    const host = ev.target.closest && ev.target.closest('.wgt, .desk-icon, .prof');
    const el = host && (host.classList.contains('desk-icon') ? host.querySelector('.di-tile') : host);
    if (el !== cur) { reset(cur); cur = el || null; }
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (ev.clientX - r.left) / r.width - 0.5, py = (ev.clientY - r.top) / r.height - 0.5;
    el.style.setProperty('--ry', (px * 2 * tiltDeg).toFixed(2) + 'deg');
    el.style.setProperty('--rx', (-py * 2 * tiltDeg).toFixed(2) + 'deg');
  }
  document.addEventListener('pointermove', (e) => { if (!tiltDeg || e.pointerType === 'touch') return; ev = e; if (!raf) raf = requestAnimationFrame(step); }, { passive: true });
  document.addEventListener('pointerleave', () => { reset(cur); cur = null; }, true);

  /* ---------------- hooks ---------------- */
  F.init = function () {
    const bus = ulyOS.bus;
    bus.on('window:open', () => F.sound('open'));
    bus.on('window:close', () => F.sound('close', 0.8));
    bus.on('session:start', () => F.sound('unlock'));
    bus.on('session:lock', () => F.sound('lock'));
    bus.on('session:unlock', () => F.sound('unlock'));
    document.addEventListener('pointerdown', (e) => {
      if (e.target.closest && e.target.closest('button, .desk-icon, .ctx-item, .tb-item, .prof, .sm-item, .mb-btn, .place')) F.sound('click', 0.55);
    }, { capture: true, passive: true });
  };
})();
