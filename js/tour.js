/* ==========================================================================
   ulyOS · js/tour.js — welcome screen + guided tour
   • Welcome splash after sign-in (first time, or every time if switched on).
   • Spotlight tour: highlights real parts of the desktop and explains them.
   • Reopen any time: Help → Guided tour / Welcome screen, logo menu, About.
   ========================================================================== */
(function () {
  'use strict';
  const { h, icon } = ulyOS.util;
  const { bus } = ulyOS;
  const T = (ulyOS.tour = {});
  const overlay = () => document.getElementById('overlay-root') || document.body;
  const SEEN = 'ulyos.tour.seen';
  const q = (sel) => { const el = document.querySelector(sel); return el && el.getBoundingClientRect().width ? el : null; };
  const API = () => ulyOS.desktopApi;
  const off = () => !!ulyOS.config.OFFLINE;

  /* target: selector (or function) of what to highlight; null → centred card */
  const STEPS = () => [
    { title: 'Welcome to ulyOS', text: 'A private desktop that runs entirely in your browser: windows, files, apps, widgets and a password-protected vault, with no server and no account. This 2-minute tour shows where everything is.', icon: 'home' },
    { target: () => q('.desk-icon'), title: 'Desktop icons', text: 'Double-click (or tap once on a phone) to open an app. Right-click the desktop to add a URL shortcut, a widget, change the wallpaper or tidy the grid. Drag icons to rearrange them.', icon: 'grid' },
    { target: () => q('#menubar'), title: 'Menu bar', text: 'The ulyOS logo opens system actions (settings, lock, switch profile). File, View, Window and Help work on the focused window. On the right: memory use, the sun / moon button (dark ↔ light theme), your profile (lock or switch) and the clock.', icon: 'list' },
    { target: () => q('#taskbar'), before: () => document.getElementById('taskbar')?.classList.add('reveal'), after: () => document.getElementById('taskbar')?.classList.remove('reveal'), title: 'Dock', text: 'Start menu, pinned apps and open windows live here. It hides at the screen edge — move the pointer there to bring it back. Dock position, size, magnification and auto-hide are in Settings → Dock & Menu bar.', icon: 'desktop' },
    { target: () => q('.desk-icon[data-id="files"]'), title: 'Files', text: 'Your private sandbox: documents, pictures and downloads, stored encrypted in this browser. Create, rename, drag-and-drop and upload files, or mount a real folder from your computer with “Open folder…”. Right-click a file for Encrypt…, Download and more.', icon: 'folder' },
    { target: () => q('.wgt') || q('#desktop'), title: 'Widgets', text: 'Clock, calendar, notes, system monitor, crypto prices, scoreboards, headlines and prediction markets. Right-click the desktop → Add widget. Drag to move, pull the bottom-right corner to resize; they rearrange themselves when the window changes size. Notes can read aloud.', icon: 'layers' },
    { target: () => q('.desk-icon[data-id="speak"]'), title: 'Speak', text: 'Type or paste text and ulyOS reads it aloud, or turn on “speak each word as I type”. Pick a voice engine — browser voices, natural Gemini voices (whisper, calm, storyteller…) or a built-in offline voice — and save the speech as a .wav or .mp3 file.', icon: 'volume' },
    { target: () => q('.desk-icon[data-id="live"]'), title: 'Gemini Live', text: 'Have a spoken conversation with Google’s Gemini: press Start talking, speak, and it answers out loud while showing the transcript. You bring your own free API key; it stays encrypted in your profile.', icon: 'mic', action: { label: 'Open Gemini Live', run: () => ulyOS.Gemini.openLive() } },
    { target: () => q('.desk-icon[data-id="beam"]'), title: 'Beam', text: 'Send files, pictures, text or your settings between your PC and phone. Start on one device, Join on the other by scanning a QR code, check the same number shows on both, then drag files across. Direct and end-to-end encrypted — no server.', icon: 'send', action: { label: 'Open Beam', run: () => ulyOS.Beam.open() } },
    { target: () => q('.desk-icon[data-id="store"]'), title: 'App Store', text: 'Browse around 45 apps — the built-in ones and well-known web apps (drawing, office, coding, learning, media). Add puts a shortcut on your desktop; nothing is installed. Sites that refuse to be embedded open in a browser tab.', icon: 'store', action: { label: 'Open App Store', run: () => ulyOS.Store.open() } },
    { target: () => q('.desk-icon[data-id="settings"]'), title: 'Make it yours', text: 'Settings → Appearance: wallpapers (including nature scenes), accent color, font, text size and widget style. Effects: animations, glass, sounds. Pointer: style, size and color. “Surprise me” randomizes the whole look.', icon: 'palette', action: { label: 'Open Appearance', run: () => API().openSettings('appearance') } },
    { target: () => q('.desk-icon[data-id="settings"]'), title: 'Security', text: 'Every profile has a password and everything is encrypted at rest. Add a fingerprint / passkey for quick, un-guessable unlock, set auto-lock, and export an encrypted backup. There is no password recovery — keep a backup.', icon: 'shield', action: { label: 'Open Security', run: () => API().openSettings('security') } },
    { target: () => q('.desk-icon[data-id="settings"]'), title: 'Sync between devices', text: 'Settings → Sync keeps your look and data identical on all your devices through an encrypted file or a secret GitHub gist. Step-by-step instructions are inside.', icon: 'refresh', action: { label: 'Open Sync', run: () => API().openSettings('sync') } },
    { target: () => q('.desk-icon[data-id="qrseal"]') || q('.desk-icon[data-id="systemvault"]'), title: 'Built-in apps', text: 'QR Seal, System Vault (password and key generator), Crypto Compass and others run inside windows, and their data is stored in your encrypted profile. Drag a window’s edges to resize, double-click its title to maximize.', icon: 'key' },
    { title: off() ? 'Offline build' : 'Take it offline', text: off() ? 'You are running the offline build. Nothing is sent anywhere. When you are done use your profile menu → “Quit ulyOS (stop server)” so the local Python server shuts down.' : 'Help → Download offline version builds a .zip with the whole OS and a tiny local server. It never contacts anyone and quits cleanly when you press Quit.', icon: 'download' },
    { title: 'You are all set', text: 'Replay this tour or the welcome screen any time from Help, the ulyOS logo menu, or Settings → About. Enjoy!', icon: 'check' },
  ];

  let active = null;
  function stop() {
    if (!active) return;
    try { active.step?.after?.(); } catch { /* ignore */ }
    active.nodes.forEach((n) => n.remove());
    document.removeEventListener('keydown', active.key, true);
    window.removeEventListener('resize', active.place);
    active = null;
  }

  T.start = function (from = 0) {
    stop(); closeWelcome();
    ulyOS.ui.closeMenu?.();
    const steps = STEPS();
    const hole = h('div', { class: 'tour-hole' });
    const card = h('div', { class: 'tour-card', role: 'dialog', 'aria-live': 'polite' });
    const shield = h('div', { class: 'tour-shield' });
    overlay().append(shield, hole, card);
    let i = Math.max(0, Math.min(from, steps.length - 1));
    const st = { nodes: [shield, hole, card], step: null };
    const place = () => {
      const s = steps[i]; const el = s.target ? s.target() : null;
      const pad = 8;
      if (el) {
        const r = el.getBoundingClientRect();
        Object.assign(hole.style, { display: 'block', left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
        const cw = Math.min(360, window.innerWidth - 24), ch = card.offsetHeight || 220;
        let x = r.right + 18, y = r.top + r.height / 2 - ch / 2;
        if (x + cw > window.innerWidth - 12) x = r.left - cw - 18;                       // no room on the right → left
        if (x < 12) { x = clamp(r.left + r.width / 2 - cw / 2, 12, window.innerWidth - cw - 12); y = r.bottom + 18; if (y + ch > window.innerHeight - 12) y = r.top - ch - 18; }
        card.style.left = clamp(x, 12, window.innerWidth - cw - 12) + 'px'; card.style.top = clamp(y, 12, Math.max(12, window.innerHeight - ch - 12)) + 'px'; card.style.transform = 'none';
      } else {
        hole.style.display = 'none';
        card.style.left = '50%'; card.style.top = '50%'; card.style.transform = 'translate(-50%,-50%)';
      }
    };
    const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
    const show = () => {
      try { st.step?.after?.(); } catch { /* ignore */ }
      const s = steps[i]; st.step = s;
      try { s.before?.(); } catch { /* ignore */ }
      const last = i === steps.length - 1;
      card.replaceChildren(...[
        h('div', { class: 'tour-head' }, h('span', { class: 'tour-ico', html: icon(s.icon || 'info', 18) }), h('b', { text: s.title }), h('span', { class: 'tour-n', text: i + 1 + ' / ' + steps.length })),
        h('p', { class: 'tour-text', text: s.text }),
        s.action ? h('button', { class: 'btn sm tour-try', text: s.action.label, onclick: () => { s.action.run(); } }) : null,
        h('div', { class: 'tour-dots' }, steps.map((_, k) => h('i', { class: k === i ? 'on' : '', onclick: () => { i = k; show(); } }))),
        h('div', { class: 'tour-nav' },
          h('button', { class: 'btn sm', text: 'Skip tour', onclick: finish }),
          h('span', { class: 'grow' }),
          i > 0 ? h('button', { class: 'btn sm', text: '← Back', onclick: () => { i--; show(); } }) : null,
          h('button', { class: 'btn sm primary', text: last ? 'Finish' : 'Next →', onclick: () => { if (last) finish(); else { i++; show(); } } }))].filter(Boolean));
      requestAnimationFrame(() => { place(); card.querySelector('.primary')?.focus(); });
    };
    const finish = () => { stop(); ulyOS.vault.set(SEEN, '1'); };
    st.key = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(); }
      else if (e.key === 'ArrowRight' || e.key === 'Enter') { if (e.target.closest?.('.tour-card button:not(.primary)') && e.key === 'Enter') return; e.preventDefault(); if (i < steps.length - 1) { i++; show(); } else finish(); }
      else if (e.key === 'ArrowLeft' && i > 0) { e.preventDefault(); i--; show(); }
    };
    st.place = place;
    document.addEventListener('keydown', st.key, true);
    window.addEventListener('resize', place);
    active = st;
    show();
  };

  /* ---------------- welcome splash ---------------- */
  let welcomeEl = null;
  function closeWelcome() { if (!welcomeEl) return; document.removeEventListener('keydown', welcomeEl._key, true); welcomeEl.classList.add('out'); const el = welcomeEl; welcomeEl = null; setTimeout(() => el.remove(), 260); }
  T.welcome = function (force) {
    if (welcomeEl || active) return;
    ulyOS.ui.closeMenu?.();
    const always = h('input', { type: 'checkbox', checked: !!API().Settings.get?.('welcomeAlways'), onchange: () => API().Settings.set('welcomeAlways', always.checked) });
    const enter = () => { ulyOS.vault.set(SEEN, '1'); closeWelcome(); };
    const el = h('div', { class: 'welcome', role: 'dialog', 'aria-label': 'Welcome to ulyOS' },
      h('div', { class: 'welcome-card' },
        h('div', { class: 'welcome-logo', html: '<svg viewBox="0 0 80 80" width="54" height="54"><circle cx="40" cy="40" r="28" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="40" cy="40" r="5" fill="currentColor"/></svg>' }),
        h('h1', { html: 'Welcome to uly<span>OS</span>' }),
        h('div', { class: 'mono welcome-ver', text: 'version ' + ulyOS.version + ' · ' + (off() ? 'offline build' : 'online build') }),
        h('p', { text: 'Hello, ' + (ulyOS.security.profile()?.name || 'there') + '. Your private desktop in the browser — files, apps, widgets and a password-protected vault, all stored on this device.' }),
        h('div', { class: 'welcome-actions' },
          h('button', { class: 'btn primary welcome-go', text: 'Enter ulyOS', onclick: enter }),
          h('button', { class: 'btn', html: '🧭 Guided tour', onclick: () => { ulyOS.vault.set(SEEN, '1'); T.start(); } }),
          h('button', { class: 'btn', text: 'Make it yours', onclick: () => { enter(); API().openSettings('appearance'); } })),
        h('label', { class: 'welcome-opt' }, always, 'Show this welcome screen on every sign-in'),
        h('div', { class: 'welcome-hint', text: 'Press Enter to start · Esc to close · Help → Guided tour to replay' })));
    el._key = (e) => { if (e.key === 'Escape' || (e.key === 'Enter' && !e.target.closest?.('button,label,input'))) { e.preventDefault(); enter(); } };
    document.addEventListener('keydown', el._key, true);
    overlay().append(el); welcomeEl = el;
    requestAnimationFrame(() => el.classList.add('in'));
    setTimeout(() => el.querySelector('.welcome-go')?.focus(), 80);
  };

  bus.on('session:start', () => {
    let tries = 0;
    const when = () => {   // wait for the boot animation to finish, then a beat
      if (document.body.classList.contains('booting') && tries++ < 60) { setTimeout(when, 300); return; }
      setTimeout(() => {
        if (document.body.classList.contains('locked') || !ulyOS.security.profileId()) return;
        const always = API() && API().Settings.get?.('welcomeAlways');
        if (always || ulyOS.vault.get(SEEN) !== '1') T.welcome();
      }, 900);
    };
    setTimeout(when, 600);
  });
  bus.on('session:lock', () => { stop(); closeWelcome(); });
})();
