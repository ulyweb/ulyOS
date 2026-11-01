/* ==========================================================================
   ulyOS · js/telemetry.js
   Telemetry daemon + Task Manager / System Audit dashboard.
   - Simulated RAM derived from live DOM node counts and running iframes
   - Simulated CPU, real FPS, real JS heap (Chromium), storage estimate
   - Persistent audit trail ("09:22:01 - Window 'Photopea' opened. Memory allocated: 120MB")
   ========================================================================== */
(function () {
  'use strict';

  const { h, icon, store, fmtBytes, fmtTime, fmtDuration, clamp, debounce, pad2 } = ulyOS.util;
  const bus = ulyOS.bus;
  const WM = ulyOS.WM;
  const T = (ulyOS.Telemetry = {});

  /* ---------------- Memory model ---------------- */
  const CFG = {
    NODE_MB: 0.012,          // every live DOM node costs ~12 KB
    SHELL_MB: 68, WM_MB: 22, TELEMETRY_MB: 11, FS_MB: 16,
    NATIVE_WIN_MB: 11,       // default for native (non-iframe) windows
    IFRAME_WIN_MB: 85,       // default for a running iframe
    SUSPEND_FACTOR: 0.55,    // minimized windows are throttled
    HISTORY: 90,
    LOG_MAX: 1000,
  };
  let ramLimit = 4096;
  let started = false;
  const bootAt = Date.now();

  /* ---------------- Audit trail ---------------- */
  let log = [];   // filled from the signed-in profile's vault on session start
  const saveLog = debounce(() => { if (started) store.set('ulyos.audit', log); }, 400);
  function addLog(e) {
    const entry = { ts: e.ts || Date.now(), level: e.level || 'info', msg: String(e.msg) };
    log.push(entry);
    if (log.length > CFG.LOG_MAX) log.splice(0, log.length - CFG.LOG_MAX);
    saveLog();
    bus.emit('audit:entry', entry);
  }
  bus.on('audit', addLog);
  window.addEventListener('beforeunload', () => { if (started) store.set('ulyos.audit', log); });
  T.getLog = () => log.slice();
  T.fmtLine = (e) => fmtTime(e.ts) + ' - ' + e.msg;

  /* ---------------- Metrics ---------------- */
  const meta = new Map();   // window id → record
  let nextPid = 1000;
  const stats = {
    ram: 0, ramLimit, cpu: 0, nodes: 0, iframes: 0, suspended: 0, windows: 0, fps: 0, heap: null,
    storage: null, peakRam: 0, opened: 0, closed: 0, procs: [],
    history: { ram: [], cpu: [], nodes: [] },
  };
  let spike = 0, sysJ = 0, fpsFrames = 0, lastFps = performance.now(), pressureWarned = false;

  function rec(win) {
    let r = meta.get(win.id);
    if (!r) {
      r = { pid: nextPid++, jitter: (Math.random() - 0.5) * 0.04, nodes: 0, mem: 0, cpu: 0 };
      meta.set(win.id, r);
    }
    return r;
  }
  const baseMem = (w) => (w.mem != null ? w.mem : w.iframe ? CFG.IFRAME_WIN_MB : CFG.NATIVE_WIN_MB);
  function estimate(win) {
    const nodes = win.el.querySelectorAll('*').length + 1;
    return (baseMem(win) + nodes * CFG.NODE_MB) * (1 + rec(win).jitter) * (win.minimized ? CFG.SUSPEND_FACTOR : 1);
  }

  const push = (arr, v) => { arr.push(v); if (arr.length > CFG.HISTORY) arr.shift(); };

  function sample() {
    const wins = WM.all().filter((w) => !w.closing);
    const procs = [];
    let winNodes = 0, iframes = 0, suspended = 0, cpuTarget = 1.2;

    wins.forEach((w) => {
      const r = rec(w);
      r.nodes = w.el.querySelectorAll('*').length + 1;
      winNodes += r.nodes;
      r.jitter = clamp(r.jitter + (Math.random() - 0.5) * 0.012, -0.06, 0.09);
      r.mem = estimate(w);
      const isFrame = !!w.iframe;
      if (isFrame) { iframes++; if (w.minimized) suspended++; }
      r.cpu = isFrame ? (w.minimized ? 0.3 + Math.random() * 0.4 : 2 + Math.random() * 5 + (w.focused ? 1.5 : 0))
        : (w.minimized ? 0.05 : 0.2 + Math.random() * 0.5 + (w.focused ? 0.8 : 0));
      cpuTarget += r.cpu;
      procs.push({
        pid: r.pid, wid: w.id, win: w, name: w.title, icon: w.icon, type: isFrame ? 'iframe' : 'native',
        nodes: r.nodes, mem: r.mem, cpu: r.cpu, sys: false,
        state: w.minimized ? 'suspended' : w.focused ? 'foreground' : 'running',
      });
    });

    const totalNodes = document.getElementsByTagName('*').length;
    const shellNodes = Math.max(0, totalNodes - winNodes);
    sysJ = clamp(sysJ + (Math.random() - 0.5) * 0.6, -3, 3);
    const sys = (pid, name, mem, cpu) => procs.unshift({ pid, name, icon: '', type: 'system', nodes: 0, mem, cpu, sys: true, state: 'running' });
    // unshift in reverse so PIDs end up ascending
    sys(4, 'fs-daemon', CFG.FS_MB + Math.random() * 0.4, 0.05 + Math.random() * 0.1);
    sys(3, 'telemetryd', CFG.TELEMETRY_MB + log.length * 0.004 + Math.random() * 0.3, 0.2 + Math.random() * 0.3);
    sys(2, 'window-manager', CFG.WM_MB + wins.length * 0.8 + Math.random() * 0.3, 0.1 + Math.random() * 0.2);
    sys(1, 'ulyos-shell', CFG.SHELL_MB + shellNodes * CFG.NODE_MB + sysJ, 0.3 + Math.random() * 0.4);
    procs[0].nodes = shellNodes;
    cpuTarget += procs.filter((p) => p.sys).reduce((s, p) => s + p.cpu, 0);

    cpuTarget += spike; spike *= 0.78;
    stats.cpu = clamp(stats.cpu * 0.55 + cpuTarget * 0.45, 0, 100);
    stats.ram = procs.reduce((s, p) => s + p.mem, 0);
    stats.ramLimit = ramLimit;
    stats.peakRam = Math.max(stats.peakRam, stats.ram);
    stats.nodes = totalNodes;
    stats.iframes = iframes; stats.suspended = suspended; stats.windows = wins.length;
    stats.procs = procs;

    const now = performance.now();
    stats.fps = Math.round((fpsFrames * 1000) / Math.max(1, now - lastFps));
    fpsFrames = 0; lastFps = now;
    stats.heap = performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null;

    push(stats.history.ram, stats.ram); push(stats.history.cpu, stats.cpu); push(stats.history.nodes, totalNodes);

    const ratio = stats.ram / ramLimit;
    if (ratio >= 0.8 && !pressureWarned) {
      pressureWarned = true;
      ulyOS.audit('Memory pressure: ' + Math.round(stats.ram) + 'MB of ' + ramLimit + 'MB (' + Math.round(ratio * 100) + '%) in use', 'warn');
      if (ratio >= 0.95) ulyOS.ui.toast('Critical memory pressure — close some windows', { type: 'warn' });
    } else if (ratio < 0.7) pressureWarned = false;

    bus.emit('telemetry:tick', stats);
  }
  (function rafLoop() { fpsFrames++; requestAnimationFrame(rafLoop); })();

  async function refreshStorage() {
    try { stats.storage = await navigator.storage.estimate(); } catch { stats.storage = null; }
  }

  /* ---------------- Automatic audit hooks ---------------- */
  bus.on('window:open', (w) => {
    stats.opened++; spike += 14;
    ulyOS.audit("Window '" + w.title + "' opened. Memory allocated: " + Math.round(estimate(w)) + 'MB', 'ok');
  });
  bus.on('window:close', (w) => {
    stats.closed++;
    const r = meta.get(w.id);
    ulyOS.audit("Window '" + w.title + "' closed. Memory released: " + Math.round(r ? r.mem : 0) + 'MB (uptime ' + fmtDuration(Date.now() - w.openedAt) + ')', 'info');
    meta.delete(w.id);
  });
  bus.on('window:minimize', (w) => ulyOS.audit("Window '" + w.title + "' minimized" + (w.iframe ? ' (iframe throttled, ' + Math.round(estimate(w)) + 'MB resident)' : ''), 'info'));
  bus.on('window:restore', (w) => ulyOS.audit("Window '" + w.title + "' restored", 'info'));

  /* ---------------- Daemon start (after a profile signs in) ---------------- */
  function start() {
    if (started) return;
    started = true;
    const saved = store.get('ulyos.audit', []);
    log = (Array.isArray(saved) ? saved : []).concat(log);
    ramLimit = store.get('ulyos.ramLimit', 4096);
    stats.ramLimit = ramLimit;
    ulyOS.audit('telemetryd started · RAM budget ' + ramLimit + 'MB', 'sys');
    refreshStorage();
    setInterval(refreshStorage, 15000);
    setInterval(sample, 1000);
    sample();
  }
  bus.on('session:start', start);

  T.stats = stats;
  T.setRamLimit = (mb) => { ramLimit = mb; store.set('ulyos.ramLimit', mb); ulyOS.audit('RAM budget set to ' + mb + 'MB', 'info'); sample(); };

  /* ==========================================================================
     Task Manager UI
     ========================================================================== */
  const PALETTE = ['#8fa3ff', '#5eead4', '#fbbf24', '#fb7185', '#a78bfa', '#38bdf8', '#a3e635', '#f97316'];
  const fmtMB = (n) => (n >= 1000 ? (n / 1024).toFixed(2) + ' GB' : n.toFixed(n < 100 ? 1 : 0) + ' MB');

  function spark(canvas, data, { max, color, unit = '' }) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, hgt = canvas.clientHeight;
    if (!w || !hgt) return;
    if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(hgt * dpr); }
    const c = canvas.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, hgt);
    c.strokeStyle = 'rgba(255,255,255,.06)'; c.lineWidth = 1;
    for (let i = 1; i < 4; i++) { const y = Math.round((hgt / 4) * i) + 0.5; c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
    if (data.length < 2) return;
    const top = max || Math.max(...data) * 1.15 || 1;
    const stepX = w / (CFG.HISTORY - 1);
    const x0 = w - (data.length - 1) * stepX;
    const pts = data.map((v, i) => [x0 + i * stepX, hgt - 3 - clamp(v / top, 0, 1) * (hgt - 8)]);
    const g = c.createLinearGradient(0, 0, 0, hgt);
    g.addColorStop(0, color + '55'); g.addColorStop(1, color + '00');
    c.beginPath(); c.moveTo(pts[0][0], hgt);
    pts.forEach((p) => c.lineTo(p[0], p[1]));
    c.lineTo(pts[pts.length - 1][0], hgt); c.closePath(); c.fillStyle = g; c.fill();
    c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])));
    c.strokeStyle = color; c.lineWidth = 1.6; c.lineJoin = 'round'; c.stroke();
    const last = pts[pts.length - 1];
    c.beginPath(); c.arc(last[0] - 1, last[1], 2.6, 0, Math.PI * 2); c.fillStyle = color; c.fill();
    c.fillStyle = 'rgba(255,255,255,.35)'; c.font = '10px ui-monospace, Menlo, monospace';
    c.fillText(Math.round(top) + unit, 6, 12);
  }

  T.open = () => WM.open({
    appId: 'taskmgr', title: 'Task Manager', icon: icon('activity', 16), width: 900, height: 620,
    minWidth: 560, minHeight: 360, mem: 18, singleton: true, render,
  });

  function render(win) {
    const offs = [];
    const accent = () => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#8fa3ff';
    let tab = 'proc';
    let sortKey = 'pid', sortDir = 1;

    /* --- header --- */
    const liveDot = h('span', { class: 'tm-dot' });
    const uptimeEl = h('span', { class: 'mono', text: '0s' });
    const head = h('div', { class: 'tm-head' },
      h('div', { class: 'tm-brand' },
        h('span', { class: 'tm-brand-ico', html: icon('shield', 20) }),
        h('div', {}, h('div', { class: 'tm-title', text: 'System Audit' }), h('div', { class: 'tm-sub', text: 'ulyOS telemetry · self-hosted · local only' }))),
      h('div', { class: 'tm-live' }, liveDot, h('span', { text: 'LIVE' }), h('span', { class: 'tm-sep' }), h('span', { text: 'uptime ' }), uptimeEl));

    /* --- tabs --- */
    const tabs = {};
    const panes = {};
    const auditCount = h('span', { class: 'tm-badge', text: String(log.length) });
    const mkTab = (id, label, extra) => {
      tabs[id] = h('button', { class: 'tm-tab', role: 'tab', onclick: () => select(id) }, label, extra || null);
      return tabs[id];
    };
    const tabbar = h('nav', { class: 'tm-tabs', role: 'tablist' },
      mkTab('proc', 'Processes'), mkTab('perf', 'Performance'), mkTab('audit', 'Audit Trail', auditCount));
    function select(id) {
      tab = id;
      Object.keys(tabs).forEach((k) => { tabs[k].classList.toggle('active', k === id); panes[k].hidden = k !== id; });
      paint(true);
    }

    /* --- Processes pane --- */
    const card = (label) => {
      const val = h('div', { class: 'tm-val mono' });
      const sub = h('div', { class: 'tm-card-sub' });
      const bar = h('div', { class: 'tm-bar' }, h('i'));
      return { el: h('div', { class: 'tm-card' }, h('div', { class: 'tm-card-label', text: label }), val, bar, sub), val, sub, bar: bar.firstChild };
    };
    const cMem = card('Memory (simulated)'), cCpu = card('CPU (simulated)'), cNodes = card('DOM nodes'), cFrames = card('Running iframes');
    const cards = h('div', { class: 'tm-cards' }, cMem.el, cCpu.el, cNodes.el, cFrames.el);

    const cols = [['name', 'Name'], ['pid', 'PID'], ['type', 'Type'], ['state', 'State'], ['cpu', 'CPU'], ['nodes', 'Nodes'], ['mem', 'Memory']];
    const thead = h('thead', {}, h('tr', {},
      cols.map(([k, label]) => h('th', {
        class: 'sortable' + (k === 'mem' || k === 'cpu' || k === 'nodes' ? ' num' : ''), text: label, dataset: { k },
        onclick: () => { if (sortKey === k) sortDir = -sortDir; else { sortKey = k; sortDir = k === 'name' || k === 'pid' || k === 'type' || k === 'state' ? 1 : -1; } paint(true); },
      })), h('th', { class: 'act' })));
    const tbody = h('tbody');
    const rows = new Map();
    function makeRow(p) {
      const c = {
        name: h('td', { class: 'name' }), pid: h('td', { class: 'mono' }), type: h('td'), state: h('td'),
        cpu: h('td', { class: 'num mono' }), nodes: h('td', { class: 'num mono' }), mem: h('td', { class: 'num mono' }), act: h('td', { class: 'act' }),
      };
      const tr = h('tr', {}, c.name, c.pid, c.type, c.state, c.cpu, c.nodes, c.mem, c.act);
      c.name.innerHTML = '<span class="tm-pico">' + (p.sys ? icon('cpu', 14) : p.icon) + '</span><span class="tm-pname"></span>';
      if (p.win) {
        c.name.style.cursor = 'pointer';
        c.name.title = 'Switch to window';
        c.name.addEventListener('click', () => WM.focus(p.win));
        c.act.append(h('button', {
          class: 'btn sm danger', text: 'End task', title: 'Force-close this process',
          onclick: () => {
            ulyOS.audit("Process " + p.pid + " '" + p.win.title + "' terminated via Task Manager (End Task)", 'warn');
            WM.close(p.win, { force: true });
          },
        }));
      } else c.act.append(h('span', { class: 'tm-lock', html: icon('lock', 13), title: 'System process' }));
      c.type.append(h('span', { class: 'tag ' + p.type, text: p.type }));
      return { tr, c };
    }
    const procPane = h('section', { class: 'tm-pane' }, cards,
      h('div', { class: 'tm-tablewrap' }, h('table', { class: 'tm-table' }, thead, tbody)));

    /* --- Performance pane --- */
    const mkChart = (label) => {
      const cv = h('canvas', { class: 'tm-canvas' });
      const val = h('span', { class: 'mono tm-chart-val' });
      return { cv, val, el: h('div', { class: 'tm-chart' }, h('div', { class: 'tm-chart-head' }, h('span', { text: label }), val), cv) };
    };
    const chRam = mkChart('Memory'), chCpu = mkChart('CPU'), chNodes = mkChart('DOM nodes');
    const limitSel = h('select', { class: 'input sm', onchange: (e) => T.setRamLimit(+e.target.value) },
      [2048, 4096, 8192, 16384].map((v) => h('option', { value: v, text: v / 1024 + ' GB', selected: v === ramLimit })));
    const stacked = h('div', { class: 'tm-stack' });
    const legend = h('div', { class: 'tm-legend' });
    const kv = {};
    const kvItems = [['fps', 'UI frame rate'], ['heap', 'JS heap (real)'], ['peak', 'Peak RAM'], ['storage', 'Sandbox storage'], ['wins', 'Windows open'], ['opened', 'Opened / closed'], ['mon', 'Frame budget']];
    const kvGrid = h('div', { class: 'tm-kv' }, kvItems.map(([k, label]) => {
      kv[k] = h('div', { class: 'mono' });
      return h('div', { class: 'tm-kv-item' }, h('div', { class: 'tm-card-label', text: label }), kv[k]);
    }));
    const perfPane = h('section', { class: 'tm-pane', hidden: true },
      h('div', { class: 'tm-charts' }, chRam.el, chCpu.el, chNodes.el),
      h('div', { class: 'tm-block' },
        h('div', { class: 'tm-block-head' }, h('span', { text: 'Memory breakdown' }), h('label', { class: 'tm-inline' }, 'RAM budget', limitSel)),
        stacked, legend),
      kvGrid,
      h('p', { class: 'tm-note', text: 'RAM model: shell baseline + 12 KB per live DOM node + a per-window cost (iframes ≈ 70–140 MB, native apps ≈ 10–25 MB). Minimized iframes are throttled to 55%. CPU is a simulation; FPS and JS heap are measured.' }));

    /* --- Audit pane --- */
    const search = h('input', { class: 'input sm', placeholder: 'Filter…', type: 'search', oninput: () => paintLog(true) });
    const levelSel = h('select', { class: 'input sm', onchange: () => paintLog(true) },
      [['all', 'All levels'], ['ok', 'OK'], ['info', 'Info'], ['warn', 'Warnings'], ['err', 'Errors'], ['sys', 'System']].map(([v, l]) => h('option', { value: v, text: l })));
    const countEl = h('span', { class: 'tm-count mono' });
    const logEl = h('div', { class: 'audit-list mono', role: 'log' });
    const download = (blob, name) => {
      const a = h('a', { href: URL.createObjectURL(blob), download: name });
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    };
    const exportText = () => log.map((e) => new Date(e.ts).toISOString() + ' [' + e.level.toUpperCase() + '] ' + e.msg).join('\n') + '\n';
    const stamp = () => { const d = new Date(); return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + '-' + pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds()); };
    const auditPane = h('section', { class: 'tm-pane audit', hidden: true },
      h('div', { class: 'tm-toolbar' }, search, levelSel, countEl, h('span', { class: 'grow' }),
        h('button', { class: 'btn sm', html: icon('download', 14) + ' Export', onclick: () => download(new Blob([exportText()], { type: 'text/plain' }), 'ulyos-audit-' + stamp() + '.log') }),
        h('button', {
          class: 'btn sm', html: icon('save', 14) + ' Save to Files',
          onclick: async () => {
            try {
              await ulyOS.FS.writeSandboxFile('Documents/audit-' + stamp() + '.log', new Blob([exportText()], { type: 'text/plain' }));
              ulyOS.ui.toast('Audit log saved to Documents', { type: 'ok' });
            } catch (err) { ulyOS.ui.toast('Could not save: ' + err.message, { type: 'err' }); }
          },
        }),
        h('button', {
          class: 'btn sm danger', html: icon('trash', 14) + ' Clear',
          onclick: async () => {
            if (!(await ulyOS.ui.confirm({ title: 'Clear audit trail?', message: 'All ' + log.length + ' entries will be removed permanently.', okText: 'Clear', danger: true }))) return;
            log.length = 0; ulyOS.audit('Audit trail cleared by user', 'warn'); paintLog(true);
          },
        })),
      logEl);

    panes.proc = procPane; panes.perf = perfPane; panes.audit = auditPane;
    const root = h('div', { class: 'tm' }, head, tabbar, procPane, perfPane, auditPane);

    /* --- painting --- */
    const lineEl = (e) => h('div', { class: 'log-line ' + e.level },
      h('span', { class: 't', text: fmtTime(e.ts) }), h('span', { class: 'sep', text: ' - ' }), h('span', { class: 'm', text: e.msg }));
    const matches = (e) => {
      if (levelSel.value !== 'all' && e.level !== levelSel.value) return false;
      const q = search.value.trim().toLowerCase();
      return !q || e.msg.toLowerCase().includes(q);
    };
    function paintLog(full) {
      if (full) {
        const frag = document.createDocumentFragment();
        let n = 0;
        log.forEach((e) => { if (matches(e)) { frag.append(lineEl(e)); n++; } });
        logEl.replaceChildren(frag);
        countEl.textContent = n + ' / ' + log.length + ' entries';
        logEl.scrollTop = logEl.scrollHeight;
      }
      auditCount.textContent = String(log.length);
    }
    offs.push(bus.on('audit:entry', (e) => {
      auditCount.textContent = String(log.length);
      if (tab !== 'audit' || !matches(e)) return;
      const stick = logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 40;
      logEl.append(lineEl(e));
      while (logEl.childElementCount > CFG.LOG_MAX) logEl.firstChild.remove();
      countEl.textContent = logEl.childElementCount + ' / ' + log.length + ' entries';
      if (stick) logEl.scrollTop = logEl.scrollHeight;
    }));

    const cmp = {
      name: (a, b) => a.name.localeCompare(b.name), pid: (a, b) => a.pid - b.pid, type: (a, b) => a.type.localeCompare(b.type),
      state: (a, b) => a.state.localeCompare(b.state), cpu: (a, b) => a.cpu - b.cpu, nodes: (a, b) => a.nodes - b.nodes, mem: (a, b) => a.mem - b.mem,
    };

    function paint(force) {
      if (win.minimized || document.hidden) return;
      const s = stats;
      uptimeEl.textContent = fmtDuration(Date.now() - bootAt);
      if (tab === 'proc') {
        const ratio = s.ram / s.ramLimit;
        cMem.val.textContent = fmtMB(s.ram); cMem.sub.textContent = 'of ' + fmtMB(s.ramLimit) + ' · ' + (ratio * 100).toFixed(1) + '%';
        cMem.bar.style.width = clamp(ratio * 100, 0, 100) + '%'; cMem.bar.className = ratio > 0.8 ? 'bad' : ratio > 0.6 ? 'warn' : '';
        cCpu.val.textContent = s.cpu.toFixed(1) + '%'; cCpu.sub.textContent = 'estimated load';
        cCpu.bar.style.width = clamp(s.cpu, 0, 100) + '%'; cCpu.bar.className = s.cpu > 80 ? 'bad' : s.cpu > 50 ? 'warn' : '';
        cNodes.val.textContent = s.nodes.toLocaleString(); cNodes.sub.textContent = '≈ ' + fmtMB(s.nodes * CFG.NODE_MB) + ' of heap';
        cNodes.bar.style.width = clamp(s.nodes / 80, 0, 100) + '%';
        cFrames.val.textContent = String(s.iframes); cFrames.sub.textContent = s.suspended + ' suspended · ' + s.windows + ' windows';
        cFrames.bar.style.width = clamp(s.iframes * 20, 0, 100) + '%';

        const seen = new Set();
        const sorted = s.procs.slice().sort((a, b) => sortDir * cmp[sortKey](a, b));
        sorted.forEach((p) => {
          seen.add(p.pid);
          let r = rows.get(p.pid);
          if (!r) { r = makeRow(p); rows.set(p.pid, r); }
          const { c } = r;
          const nm = c.name.querySelector('.tm-pname');
          if (nm.textContent !== p.name) nm.textContent = p.name;
          c.pid.textContent = p.pid; c.state.textContent = p.state;
          c.cpu.textContent = p.cpu.toFixed(1) + '%'; c.nodes.textContent = p.nodes.toLocaleString();
          c.mem.textContent = fmtMB(p.mem);
        });
        rows.forEach((r, pid) => { if (!seen.has(pid)) { r.tr.remove(); rows.delete(pid); } });
        // only touch DOM order when it actually changed (keeps clicks reliable)
        const want = sorted.map((p) => rows.get(p.pid).tr);
        const have = [...tbody.children];
        if (want.length !== have.length || want.some((tr, i) => tr !== have[i])) tbody.replaceChildren(...want);
        thead.querySelectorAll('th').forEach((th) => th.classList.toggle('sorted', th.dataset.k === sortKey));
      } else if (tab === 'perf') {
        const col = accent();
        spark(chRam.cv, s.history.ram, { max: s.ramLimit, color: col, unit: 'MB' });
        spark(chCpu.cv, s.history.cpu, { max: 100, color: '#5eead4', unit: '%' });
        spark(chNodes.cv, s.history.nodes, { color: '#fbbf24' });
        chRam.val.textContent = fmtMB(s.ram); chCpu.val.textContent = s.cpu.toFixed(1) + '%'; chNodes.val.textContent = s.nodes.toLocaleString();
        const total = s.procs.reduce((a, p) => a + p.mem, 0) || 1;
        const sortedMem = s.procs.slice().sort((a, b) => b.mem - a.mem);
        stacked.replaceChildren(...sortedMem.map((p, i) => h('i', { style: { width: (p.mem / s.ramLimit * 100) + '%', background: PALETTE[i % PALETTE.length] }, title: p.name + ' · ' + fmtMB(p.mem) })));
        legend.replaceChildren(...sortedMem.slice(0, 8).map((p, i) => h('span', { class: 'lg' },
          h('i', { style: { background: PALETTE[i % PALETTE.length] } }), p.name + ' ', h('b', { class: 'mono', text: ((p.mem / total) * 100).toFixed(0) + '%' }))));
        kv.fps.textContent = s.fps + ' fps';
        kv.heap.textContent = s.heap != null ? s.heap.toFixed(1) + ' MB' : 'n/a (Chromium only)';
        kv.peak.textContent = fmtMB(s.peakRam);
        kv.storage.textContent = s.storage ? fmtBytes(s.storage.usage) + ' / ' + fmtBytes(s.storage.quota) : 'n/a';
        kv.wins.textContent = String(s.windows);
        kv.opened.textContent = s.opened + ' / ' + s.closed;
        kv.mon.textContent = s.fps >= 55 ? 'healthy' : s.fps >= 30 ? 'degraded' : 'starved';
      }
    }
    offs.push(bus.on('telemetry:tick', () => paint(false)));
    new ResizeObserver(() => { if (tab === 'perf') paint(true); }).observe(root);
    win.onClose = () => offs.forEach((f) => f());

    paintLog(true);
    select('proc');
    return root;
  }
})();
