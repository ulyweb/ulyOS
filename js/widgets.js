/* ==========================================================================
   ulyOS · js/widgets.js
   Desktop widgets (iPadOS style): Clock, Calendar, Notes, System monitor,
   Crypto prices, Timer. Free-form dragging with grid snap, three sizes,
   right-click menu, saved in the profile vault (encrypted when protected).
   ========================================================================== */
(function () {
  'use strict';

  const { h, icon, clamp, pad2, fmtClock, store, debounce } = ulyOS.util;
  const { WM, ui, bus } = ulyOS;
  const W = (ulyOS.Widgets = {});
  const SETTINGS = () => ulyOS.desktopApi.Settings;

  const SIZES = { s: [168, 168], m: [348, 168], l: [348, 348] };
  const SIZE_LABEL = { s: 'Small', m: 'Medium', l: 'Large' };
  const MAX = 12;
  const use24 = () => SETTINGS().get('clockFormat') !== '12';
  const secs = () => !!SETTINGS().get('clockSeconds');

  let insts = [];
  let layer = null;
  const live = new Map();   // id → { el, update, destroy }

  /* ---------------- small helpers ---------------- */
  function analog(px) {
    const ticks = Array.from({ length: 12 }, (_, i) => '<line x1="0" y1="-41" x2="0" y2="' + (i % 3 ? -37.5 : -34) + '" transform="rotate(' + i * 30 + ')" class="tk' + (i % 3 ? '' : ' big') + '"/>').join('');
    const el = h('div', { class: 'w-analog', style: { width: px + 'px', height: px + 'px' }, html:
      '<svg viewBox="-50 -50 100 100" width="100%" height="100%"><circle r="47" class="face"/>' + ticks +
      '<line class="hh" y2="-22"/><line class="mh" y2="-33"/><line class="sh" y2="-37"/><circle r="2.6" class="pin"/></svg>' });
    const hh = el.querySelector('.hh'), mh = el.querySelector('.mh'), sh = el.querySelector('.sh');
    return {
      el,
      set(d) {
        const s = d.getSeconds(), m = d.getMinutes() + s / 60, hr = (d.getHours() % 12) + m / 60;
        hh.setAttribute('transform', 'rotate(' + hr * 30 + ')'); mh.setAttribute('transform', 'rotate(' + m * 6 + ')');
        sh.setAttribute('transform', 'rotate(' + s * 6 + ')'); sh.style.display = secs() ? '' : 'none';
      },
    };
  }
  function spark(canvas, data, max, color) {
    const dpr = window.devicePixelRatio || 1, w = canvas.clientWidth, hh = canvas.clientHeight;
    if (!w || !hh) return;
    if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(hh * dpr); }
    const c = canvas.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, hh);
    if (data.length < 2) return;
    const step = w / 89, x0 = w - (data.length - 1) * step;
    c.beginPath();
    data.forEach((v, i) => { const x = x0 + i * step, y = hh - 2 - clamp(v / max, 0, 1) * (hh - 6); i ? c.lineTo(x, y) : c.moveTo(x, y); });
    c.strokeStyle = color; c.lineWidth = 1.6; c.lineJoin = 'round'; c.stroke();
    c.lineTo(w, hh); c.lineTo(x0, hh); c.closePath(); c.fillStyle = color + '28'; c.fill();
  }
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

  /* ---------------- widget types ---------------- */
  const TYPES = {
    clock: {
      name: 'Clock', ico: 'clock', size: 's',
      build(body, inst) {
        body.classList.add('w-center');
        const dig = h('div', { class: 'w-time mono' }), date = h('div', { class: 'w-sub' });
        const an = inst.size === 'm' ? null : analog(inst.size === 's' ? 120 : 168);
        if (an) body.append(an.el);
        if (inst.size !== 's') body.append(dig, date);
        return {
          update() {
            const d = new Date();
            an && an.set(d);
            dig.textContent = fmtClock(d, { seconds: secs(), h24: use24() });
            date.textContent = d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
          },
        };
      },
    },
    calendar: {
      name: 'Calendar', ico: 'calendar', size: 'm',
      build(body, inst) {
        let view = new Date(); view.setDate(1);
        let stamp = '';
        const render = () => {
          const now = new Date(), key = now.toDateString() + view.getMonth();
          stamp = key;
          body.replaceChildren();
          if (inst.size === 's') {
            body.append(h('div', { class: 'cal-big' }, h('div', { class: 'cal-wd', text: now.toLocaleDateString([], { weekday: 'long' }) }), h('div', { class: 'cal-day', text: String(now.getDate()) }), h('div', { class: 'w-sub', text: now.toLocaleDateString([], { month: 'long', year: 'numeric' }) })));
            return;
          }
          const head = h('div', { class: 'cal-head' }, h('b', { text: view.toLocaleDateString([], { month: 'long', year: 'numeric' }) }), inst.size === 'l' ? h('span', { class: 'cal-nav' }, h('button', { class: 'tb-btn', 'aria-label': 'Previous month', html: icon('arrowLeft', 13), onclick: () => { view.setMonth(view.getMonth() - 1); render(); } }), h('button', { class: 'tb-btn', 'aria-label': 'Today', title: 'Today', html: icon('calendar', 13), onclick: () => { view = new Date(); view.setDate(1); render(); } }), h('button', { class: 'tb-btn', 'aria-label': 'Next month', html: icon('arrowRight', 13), onclick: () => { view.setMonth(view.getMonth() + 1); render(); } })) : null);
          const dn = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
          const grid = h('div', { class: 'cal-grid' }, dn.map((d) => h('i', { class: 'dn', text: d })));
          const isToday = (d) => d.toDateString() === now.toDateString();
          if (inst.size === 'm') {
            const start = new Date(now); start.setDate(now.getDate() - now.getDay());
            for (let i = 0; i < 7; i++) { const d = new Date(start); d.setDate(start.getDate() + i); grid.append(h('i', { class: 'dd' + (isToday(d) ? ' today' : ''), text: String(d.getDate()) })); }
          } else {
            const first = new Date(view), last = new Date(view.getFullYear(), view.getMonth() + 1, 0);
            for (let i = 0; i < first.getDay(); i++) grid.append(h('i'));
            for (let d = 1; d <= last.getDate(); d++) { const dt = new Date(view.getFullYear(), view.getMonth(), d); grid.append(h('i', { class: 'dd' + (isToday(dt) ? ' today' : ''), text: String(d) })); }
          }
          body.append(head, grid);
        };
        render();
        return { update() { if (stamp !== new Date().toDateString() + view.getMonth()) render(); } };
      },
    },
    notes: {
      name: 'Notes', ico: 'text', size: 'm',
      build(body, inst, ctx) {
        const ta = h('textarea', { class: 'w-notes w-nodrag', placeholder: 'Quick note… (saved in your profile)', spellcheck: false, value: inst.text || '', maxLength: 5000 });
        ta.addEventListener('input', debounce(() => ctx.save({ text: ta.value }), 400));
        body.append(ta);
        return {};
      },
    },
    system: {
      name: 'System', ico: 'cpu', size: 'm',
      build(body, inst) {
        const rows = {};
        const bar = (k, label) => { const v = h('span', { class: 'mono' }), i = h('i'); rows[k] = { v, i }; return h('div', { class: 'sys-row' }, h('span', { class: 'sys-l', text: label }), h('div', { class: 'tm-bar' }, i), v); };
        let ring = null, c1 = null, c2 = null;
        if (inst.size === 's') {
          ring = h('div', { class: 'ring', html: '<svg viewBox="0 0 42 42"><circle cx="21" cy="21" r="16" class="bg"/><circle cx="21" cy="21" r="16" class="fg" pathLength="100"/></svg>' });
          ring.append(h('div', { class: 'ring-t' }, h('b', { class: 'mono' }), h('span', { text: 'RAM' })));
          body.classList.add('w-center'); body.append(ring);
        } else {
          body.append(bar('ram', 'RAM'), bar('cpu', 'CPU'), bar('fps', 'FPS'));
          if (inst.size === 'l') { c1 = h('canvas', { class: 'sys-spark' }); c2 = h('canvas', { class: 'sys-spark' }); body.append(h('div', { class: 'w-sub', text: 'Memory (simulated)' }), c1, h('div', { class: 'w-sub', text: 'CPU (simulated)' }), c2, h('div', { class: 'w-sub mono', 'data-x': '' })); }
        }
        const paint = () => {
          const s = ulyOS.Telemetry && ulyOS.Telemetry.stats;
          if (!s || !s.ramLimit) return;
          const r = clamp(s.ram / s.ramLimit, 0, 1) * 100;
          if (ring) { ring.querySelector('.fg').style.strokeDasharray = r.toFixed(1) + ' 100'; ring.querySelector('b').textContent = Math.round(r) + '%'; return; }
          rows.ram.i.style.width = r + '%'; rows.ram.v.textContent = Math.round(s.ram) + ' MB';
          rows.cpu.i.style.width = clamp(s.cpu, 0, 100) + '%'; rows.cpu.v.textContent = s.cpu.toFixed(0) + '%';
          rows.fps.i.style.width = clamp(s.fps / 60 * 100, 0, 100) + '%'; rows.fps.v.textContent = s.fps;
          if (c1) { spark(c1, s.history.ram, s.ramLimit, css('--accent') || '#8fa3ff'); spark(c2, s.history.cpu, 100, '#5eead4'); body.querySelector('[data-x]').textContent = s.windows + ' windows · ' + s.iframes + ' iframes · ' + s.nodes.toLocaleString() + ' DOM nodes'; }
        };
        const off = bus.on('telemetry:tick', paint);
        paint();
        return { destroy: off };
      },
    },
    crypto: {
      name: 'Crypto prices', ico: 'trending', size: 'm',
      build(body, inst) {
        const COINS = [['ripple', 'XRP'], ['bitcoin', 'BTC'], ['ethereum', 'ETH'], ['stellar', 'XLM'], ['chainlink', 'LINK']];
        const show = inst.size === 's' ? [COINS[0]] : inst.size === 'm' ? [COINS[1], COINS[2], COINS[0]] : COINS;
        const list = h('div', { class: 'px-list' });
        const foot = h('div', { class: 'w-sub px-foot' }, 'Loading…');
        const btn = h('button', { class: 'tb-btn', title: 'Refresh', 'aria-label': 'Refresh', html: icon('refresh', 13), onclick: () => load() });
        body.append(list, h('div', { class: 'px-bottom' }, foot, btn));
        let timer = 0, dead = false;
        const fmt = (n) => '$' + (n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : n >= 1 ? n.toFixed(2) : n.toFixed(4));
        async function load() {
          foot.textContent = 'Updating…';
          try {
            const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=' + COINS.map((c) => c[0]).join(',') + '&vs_currencies=usd&include_24hr_change=true');
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const d = await r.json();
            if (dead) return;
            list.replaceChildren(...show.map(([id, sym]) => {
              const p = d[id]; if (!p) return h('div', { class: 'px-row' }, sym, ' —');
              const ch = p.usd_24h_change || 0;
              return h('div', { class: 'px-row' }, h('b', { text: sym }), h('span', { class: 'mono px-p', text: fmt(p.usd) }), h('span', { class: 'mono px-c ' + (ch >= 0 ? 'up' : 'dn'), text: (ch >= 0 ? '▲ ' : '▼ ') + Math.abs(ch).toFixed(2) + '%' }));
            }));
            foot.textContent = 'CoinGecko · ' + new Date().toLocaleTimeString();
          } catch { if (!dead) foot.textContent = 'Offline or rate-limited — tap ↻ to retry'; }
        }
        load();
        timer = setInterval(() => { if (!document.hidden) load(); }, 90000);
        return { destroy() { dead = true; clearInterval(timer); }, refresh: load };
      },
    },
    timer: {
      name: 'Timer', ico: 'timer', size: 's',
      build(body, inst) {
        let mode = 'stopwatch', running = false, acc = 0, t0 = 0, target = 5 * 60000;
        const disp = h('div', { class: 'w-time mono tm-disp' });
        const modeBtn = (m, l) => h('button', { class: 'btn sm', text: l, onclick: () => { mode = m; running = false; acc = 0; paint(); } });
        const toggle = h('button', { class: 'btn sm primary', onclick: () => { if (running) { acc += Date.now() - t0; running = false; } else { t0 = Date.now(); running = true; } paint(); } });
        const reset = h('button', { class: 'btn sm', text: 'Reset', onclick: () => { running = false; acc = 0; paint(); } });
        const presets = h('div', { class: 'tm-presets' }, [1, 5, 10, 25].map((m) => h('button', { class: 'btn sm', text: m + 'm', onclick: () => { target = m * 60000; running = false; acc = 0; mode = 'timer'; paint(); } })));
        const modes = h('div', { class: 'seg' }, modeBtn('stopwatch', 'Stopwatch'), modeBtn('timer', 'Timer'));
        const elapsed = () => acc + (running ? Date.now() - t0 : 0);
        const beep = () => { try { const ac = new AudioContext(); [0, 0.3, 0.6].forEach((t) => { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = 880; g.gain.value = 0.08; o.connect(g); g.connect(ac.destination); o.start(ac.currentTime + t); o.stop(ac.currentTime + t + 0.18); }); } catch { /* no audio */ } };
        const fmtMs = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)), hh = Math.floor(s / 3600); return (hh ? hh + ':' : '') + pad2(Math.floor(s / 60) % 60) + ':' + pad2(s % 60); };
        function paint() {
          const ms = mode === 'timer' ? target - elapsed() : elapsed();
          if (mode === 'timer' && ms <= 0 && running) { running = false; acc = 0; beep(); ui.toast('⏱ Timer finished', { type: 'ok', timeout: 6000 }); }
          disp.textContent = fmtMs(mode === 'timer' ? Math.max(ms, 0) : ms);
          toggle.textContent = running ? 'Pause' : 'Start';
          modes.querySelectorAll('button').forEach((b, i) => b.classList.toggle('on', (i === 0) === (mode === 'stopwatch')));
          presets.hidden = mode !== 'timer';
        }
        body.classList.add('w-center');
        body.append(modes, disp, h('div', { class: 'btn-row' }, toggle, reset), presets);
        paint();
        return { update: paint };
      },
    },
  };
  W.types = TYPES;

  /* ---------------- instances ---------------- */
  const uid = () => 'wg_' + Math.random().toString(36).slice(2, 9);
  const area = () => ({ w: layer ? layer.clientWidth : window.innerWidth, h: layer ? layer.clientHeight : window.innerHeight });
  const save = debounce(() => store.set('ulyos.widgets', { v: 1, list: insts.map(({ id, type, size, x, y, text }) => ({ id, type, size, x, y, ...(type === 'notes' ? { text } : {}) })) }), 200);

  function freeSpot(size) {
    const [w, hh] = SIZES[size], a = area();
    for (let x = a.w - w - 24; x >= 0; x -= w + 16) {
      for (let y = 64; y + hh <= a.h; y += hh + 16) {   // 64: clear of the floating status pill
        if (!insts.some((i) => { const [iw, ih] = SIZES[i.size]; return x < i.x + iw && x + w > i.x && y < i.y + ih && y + hh > i.y; })) return { x, y };
      }
    }
    return { x: clamp(a.w - w - 24, 0, a.w), y: 64 + (insts.length % 5) * 24 };
  }

  function mount(inst) {
    const T = TYPES[inst.type];
    const [w, hh] = SIZES[inst.size];
    const body = h('div', { class: 'w-body sz-' + inst.size });
    const ctx = { save: (patch) => { Object.assign(inst, patch); save(); } };
    const head = h('div', { class: 'w-head' }, h('span', { class: 'w-ico', html: icon(T.ico, 13) }), h('span', { class: 'w-title', text: T.name }),
      h('button', { class: 'w-x', 'aria-label': 'Remove widget', title: 'Remove', html: icon('x', 12), onclick: () => W.remove(inst.id) }));
    const el = h('section', { class: 'wgt wgt-' + inst.type, dataset: { id: inst.id }, style: { width: w + 'px', height: hh + 'px', left: inst.x + 'px', top: inst.y + 'px' } }, head, body);
    layer.append(el);
    const api = T.build(body, inst, ctx) || {};
    api.update?.();
    live.set(inst.id, { el, ...api });

    el.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); ui.contextMenu(e.clientX, e.clientY, itemMenu(inst)); });
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('button,input,textarea,select,a,canvas,.w-nodrag')) return;
      const sx = e.clientX, sy = e.clientY, ox = inst.x, oy = inst.y;
      let moved = false;
      try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      const mv = (ev) => {
        if (!moved) { if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return; moved = true; el.classList.add('dragging'); WM.setIframesInert(true); }
        const a = area();
        inst.x = clamp(Math.round((ox + ev.clientX - sx) / 8) * 8, 0, Math.max(0, a.w - el.offsetWidth));
        inst.y = clamp(Math.round((oy + ev.clientY - sy) / 8) * 8, 0, Math.max(0, a.h - el.offsetHeight));
        el.style.left = inst.x + 'px'; el.style.top = inst.y + 'px';
      };
      const up = () => {
        el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
        try { el.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
        if (moved) { el.classList.remove('dragging'); WM.setIframesInert(false); save(); }
      };
      el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    });
    return el;
  }
  function unmount(id) {
    const l = live.get(id);
    if (!l) return;
    try { l.destroy?.(); } catch { /* ignore */ }
    l.el.remove(); live.delete(id);
  }

  W.add = function (type, size) {
    if (!TYPES[type]) return null;
    if (insts.length >= MAX) { ui.toast('Widget limit reached (' + MAX + ')', { type: 'info' }); return null; }
    const sz = size || TYPES[type].size;
    const inst = { id: uid(), type, size: sz, ...freeSpot(sz) };
    insts.push(inst); mount(inst); save(); bus.emit('widgets:change');
    if (!SETTINGS().get('widgetsVisible')) SETTINGS().set('widgetsVisible', true);
    ulyOS.audit("Widget '" + TYPES[type].name + "' added to the desktop", 'info');
    return inst;
  };
  W.remove = function (id) {
    const i = insts.find((x) => x.id === id);
    if (!i) return;
    unmount(id); insts = insts.filter((x) => x.id !== id); save(); bus.emit('widgets:change');
    ulyOS.audit("Widget '" + TYPES[i.type].name + "' removed", 'info');
  };
  W.setSize = function (id, size) {
    const inst = insts.find((x) => x.id === id);
    if (!inst || !SIZES[size] || inst.size === size) return;
    unmount(id); inst.size = size;
    const a = area(), [w, hh] = SIZES[size];
    inst.x = clamp(inst.x, 0, Math.max(0, a.w - w)); inst.y = clamp(inst.y, 0, Math.max(0, a.h - hh));
    mount(inst); save();
  };
  W.clear = function () { [...insts].forEach((i) => W.remove(i.id)); };
  W.list = () => insts.map((i) => ({ ...i }));

  function itemMenu(inst) {
    const T = TYPES[inst.type];
    return [
      { label: T.name, icon: T.ico, disabled: true },
      { separator: true },
      { label: 'Size', icon: 'grid', submenu: Object.keys(SIZES).map((s) => ({ label: (inst.size === s ? '✓ ' : '    ') + SIZE_LABEL[s], action: () => W.setSize(inst.id, s) })) },
      inst.type === 'crypto' ? { label: 'Refresh prices', icon: 'refresh', action: () => live.get(inst.id)?.refresh?.() } : null,
      { label: 'Add widget', icon: 'plus', submenu: addItems() },
      { separator: true },
      { label: 'Remove widget', icon: 'trash', danger: true, action: () => W.remove(inst.id) },
    ].filter(Boolean);
  }
  const addItems = () => Object.entries(TYPES).map(([k, T]) => ({ label: T.name, icon: T.ico, action: () => W.add(k) }));
  /** Items for the desktop context menu. */
  W.menuItems = () => [
    { label: 'Add widget', icon: 'grid', submenu: addItems() },
    { label: SETTINGS().get('widgetsVisible') ? 'Hide widgets' : 'Show widgets', icon: 'desktop', disabled: !insts.length && SETTINGS().get('widgetsVisible'), action: () => SETTINGS().set('widgetsVisible', !SETTINGS().get('widgetsVisible')) },
  ];

  /* ---------------- settings panel + export / import ---------------- */
  W.settingsSection = function (H) {
    const list = h('div', { class: 'pin-list' });
    const paint = () => {
      list.replaceChildren(...(insts.length ? insts.map((i) => h('div', { class: 'pin-row' },
        h('span', { class: 'ico-wrap', html: icon(TYPES[i.type].ico, 16) }), h('span', { class: 'pin-name', text: TYPES[i.type].name + ' · ' + SIZE_LABEL[i.size] }),
        h('button', { class: 'btn sm danger', text: 'Remove', onclick: () => { W.remove(i.id); paint(); } }))) : [h('div', { class: 'set-desc', text: 'No widgets yet — add one below or right-click the desktop → Add widget.' })]));
    };
    paint();
    bus.on('widgets:change', () => { if (list.isConnected) paint(); });
    return h('div', {},
      h('h3', { text: 'Widgets' }),
      H.row('Show widgets', 'Hide or show every widget on the desktop', H.sw('widgetsVisible')),
      h('div', { class: 'set-tools' }, Object.entries(TYPES).map(([k, T]) => h('button', { class: 'btn sm', html: icon(T.ico, 14) + ' ' + T.name, onclick: () => { W.add(k); paint(); } }))),
      list,
      h('div', { class: 'set-desc', text: 'Drag a widget to move it; right-click for size and removal. Crypto prices call the public CoinGecko API (only while that widget exists).' }));
  };
  W.exportList = () => insts.map(({ type, size, x, y }) => ({ type, size, x, y }));
  W.importList = function (list) {
    if (!Array.isArray(list)) return;
    W.clear();
    list.slice(0, MAX).forEach((r) => {
      if (!r || !TYPES[r.type] || !SIZES[r.size]) return;
      const inst = { id: uid(), type: r.type, size: r.size, x: clamp(Math.round(+r.x) || 0, 0, 4000), y: clamp(Math.round(+r.y) || 0, 0, 4000) };
      insts.push(inst); mount(inst);
    });
    relayout(); save(); bus.emit('widgets:change');
  };

  /* ---------------- layout + lifecycle ---------------- */
  function relayout() {
    const a = area();
    insts.forEach((i) => {
      const l = live.get(i.id);
      if (!l) return;
      const [w, hh] = SIZES[i.size];
      i.x = clamp(i.x, 0, Math.max(0, a.w - w)); i.y = clamp(i.y, 0, Math.max(0, a.h - hh));
      l.el.style.left = i.x + 'px'; l.el.style.top = i.y + 'px';
    });
  }
  W.applyVisibility = () => document.body.classList.toggle('widgets-off', SETTINGS().get('widgetsVisible') === false);

  let started = false;
  W.init = function () {
    if (started) return;
    started = true;
    layer = h('div', { id: 'widgets' });
    document.getElementById('desktop').prepend(layer);
    const saved = store.get('ulyos.widgets', null);
    if (saved && Array.isArray(saved.list)) {
      saved.list.slice(0, MAX).forEach((r) => {
        if (!r || !TYPES[r.type] || !SIZES[r.size]) return;
        const inst = { id: typeof r.id === 'string' ? r.id : uid(), type: r.type, size: r.size, x: +r.x || 0, y: +r.y || 0, ...(typeof r.text === 'string' ? { text: r.text.slice(0, 5000) } : {}) };
        insts.push(inst); mount(inst);
      });
      relayout();
    }
    W.applyVisibility();
    setInterval(() => { if (!document.hidden) live.forEach((l) => { try { l.update?.(); } catch { /* ignore */ } }); }, 1000);
    window.addEventListener('resize', relayout);
    bus.on('settings:change', () => { W.applyVisibility(); relayout(); live.forEach((l) => l.update?.()); });
  };
})();
