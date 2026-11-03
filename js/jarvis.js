/* ==========================================================================
   ulyOS · js/jarvis.js — Jarvis AI assistant toolkit
   Inspired by Jared Rhodenizer's open "fullstack-agent" stack (github.com/jaredrhod):
   an agent with a MIND (memory), MOUTH (voice), FACE (visualizer) and optional
   HANDS (webcam hand tracking). His originals need a local install, Claude Code
   and local speech models, so they cannot run inside a web page. This module is
   original code that gives ulyOS the same four ideas natively, and it can embed
   his real local servers (face / hands) when they are running on this machine.
   No code from his repositories is included (they are AGPL-3.0 / CC BY-SA).

     Mind   — a Markdown notes vault in your encrypted Files (daily notes,
              [[wiki links]], backlinks, search, "jobs" that prime the AI)
     Mouth  — Gemini Live voice conversation with your agent's name, personality
              and memory; push-to-talk; spoken greeting; voice commands
     Face   — four animated canvas faces that idle / listen / think / speak with
              the real conversation (Circuit board, Radial, Code rain, Neural)
     Hands  — the real "barehands" app (webcam, MediaPipe) embedded when it runs
              locally, with install instructions
   ========================================================================== */
(function () {
  'use strict';
  const { h, icon, pad2, stamp } = ulyOS.util;
  const { ui, WM, bus } = ulyOS;
  const J = (ulyOS.Jarvis = {});
  const KEY = 'ulyos.jarvis';

  /* ======================================================================
     Settings (encrypted in the profile vault)
     ====================================================================== */
  const FACES = [['board', 'Circuit board'], ['radial', 'Radial'], ['rain', 'Code rain'], ['neural', 'Neural core']];
  const PTT_KEYS = [['Space', 'Space bar'], ['Home', 'Home'], ['F4', 'F4'], ['ControlRight', 'Right Ctrl']];
  const DEF = {
    name: 'Jarvis', you: '', greeting: '', voice: '', face: 'board', useMemory: true, ptt: false, pttKey: 'Space',
    personality: 'You are calm, warm and quietly witty, like a trusted chief of staff. You are direct, you keep answers short enough to say out loud, and you ask one clarifying question when something is ambiguous. You are honest when you do not know something.',
    ports: { face: 8790, hands: 8794 },
  };
  const clean = (o) => {
    const c = { ...DEF, ...(o && typeof o === 'object' ? o : {}) };
    c.name = String(c.name || DEF.name).trim().slice(0, 30) || DEF.name;
    c.you = String(c.you || '').trim().slice(0, 40);
    c.greeting = String(c.greeting || '').trim().slice(0, 200);
    c.personality = String(c.personality || '').slice(0, 1200);
    c.voice = String(c.voice || '').slice(0, 40);
    if (!FACES.some((f) => f[0] === c.face)) c.face = DEF.face;
    if (!PTT_KEYS.some((k) => k[0] === c.pttKey)) c.pttKey = DEF.pttKey;
    c.useMemory = c.useMemory !== false; c.ptt = !!c.ptt;
    const pn = (v, d) => { v = Math.round(+v); return v >= 1024 && v <= 65535 ? v : d; };
    c.ports = { face: pn(c.ports && c.ports.face, 8790), hands: pn(c.ports && c.ports.hands, 8794) };
    return c;
  };
  const cfg = () => { try { return clean(JSON.parse(ulyOS.vault.get(KEY) || '{}')); } catch { return clean({}); } };
  const save = (patch) => { const c = clean({ ...cfg(), ...patch }); ulyOS.vault.set(KEY, JSON.stringify(c)); return c; };
  J.config = cfg;
  const greetingOf = (c) => c.greeting || ('Hello' + (c.you ? ' ' + c.you : '') + ', what are we working on today?');

  /* ======================================================================
     Mind — the notes vault (Markdown files in Files → Jarvis Vault)
     ====================================================================== */
  const ROOT = 'Jarvis Vault';
  const FS = () => ulyOS.FS;
  const rootHandle = async (create) => { const r = FS().roots.sandbox.handle; if (!r) throw new Error('Files are unavailable in this browser'); return r.getDirectoryHandle(ROOT, { create }); };
  const safePath = (p) => String(p).split('/').map((s) => s.replace(/[\\:*?"<>|\u0000-\u001f]/g, '').replace(/^\.+/, '').trim()).filter(Boolean).slice(0, 4).join('/');
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); };
  const DAILY_DIR = '01 - Daily Notes';
  const dailyPath = (d = today()) => DAILY_DIR + '/' + d + '.md';
  const SEED = {
    'Profile.md': '# Profile\n\nWho you are, how you like to work, and what matters right now. Your assistant reads this before every conversation.\n\n- Name: \n- Work: \n- Goals this month: \n- How I like answers: short and direct\n',
    'Jobs/Weekly plan.md': '# Weekly plan\n\nA "job" tells the assistant which notes to read first (this is called priming).\n\nPrime: [[Profile]]\n\nSteps:\n1. Look at last week\'s daily notes\n2. Ask me what matters this week\n3. Write the plan into today\'s daily note\n',
    'Projects/First project.md': '# First project\n\nStatus: idea\n\nNotes about a project go here. Link other notes with double brackets, like [[Profile]].\n',
  };
  const dailyTemplate = (d) => '# ' + d + '\n\n## Plan\n- \n\n## Log\n- \n\n## Lessons\n- \n';
  async function walk(dir, prefix, out, depth = 0) {
    for await (const [name, hd] of dir.entries()) {
      if (out.length >= 400) return;
      if (hd.kind === 'directory') { if (depth < 3) await walk(hd, prefix + name + '/', out, depth + 1); }
      else if (/\.md$/i.test(name)) out.push({ path: prefix + name, name: name.replace(/\.md$/i, ''), folder: prefix.replace(/\/$/, '') });
    }
  }
  const V = {
    cache: new Map(),
    async ensure() {
      let fresh = false;
      try { await (await rootHandle(false)).getFileHandle('Profile.md'); } catch { fresh = true; }
      await rootHandle(true);
      if (fresh) for (const [p, t] of Object.entries(SEED)) { if (!(await V.read(p, true))) await V.write(p, t); }
    },
    async list() { const out = []; await walk(await rootHandle(true), '', out); return out.sort((a, b) => a.path.localeCompare(b.path)); },
    async read(path, quiet) { const f = await FS().readSandboxFile(ROOT + '/' + safePath(path)); if (!f) return quiet ? null : ''; return (await f.text()).slice(0, 200000); },
    async write(path, text) {
      const p = safePath(path); if (!/\.md$/i.test(p)) throw new Error('Notes are .md files');
      await FS().writeSandboxFile(ROOT + '/' + p, new Blob([String(text).slice(0, 200000)], { type: 'text/markdown' })); V.cache.set(p, String(text));
    },
    async remove(path) {
      const parts = safePath(path).split('/'); const name = parts.pop(); let d = await rootHandle(false);
      for (const s of parts) d = await d.getDirectoryHandle(s);
      await d.removeEntry(name); V.cache.delete(parts.concat(name).join('/'));
    },
    async loadAll() { const l = await V.list(); V.cache.clear(); await Promise.all(l.map(async (n) => { V.cache.set(n.path, await V.read(n.path)); })); return l; },
    resolve(link, list) { const k = link.trim().toLowerCase(); return list.find((n) => n.name.toLowerCase() === k || n.path.toLowerCase().replace(/\.md$/, '') === k); },
    links(text) { return [...String(text).matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g)].map((m) => m[1].trim()); },
    async dailyAppend(chunk) {
      const p = dailyPath(); let t = await V.read(p, true); if (t == null) t = dailyTemplate(today());
      await V.write(p, t.replace(/\s*$/, '\n') + '\n' + chunk + '\n');
    },
  };
  J.vault = V;

  /** The memory the assistant starts every conversation with (profile, recent daily notes, a chosen job and its primed notes). */
  async function memoryContext(job) {
    const out = []; let budget = 2600;
    const add = (title, text, max) => { text = String(text || '').trim(); if (!text || budget < 80) return; const t = text.slice(0, Math.min(max, budget)); budget -= t.length; out.push('## ' + title + '\n' + t); };
    try {
      await V.ensure(); const list = await V.list();
      add('Profile', await V.read('Profile.md'), 1200);
      const dailies = list.filter((n) => n.folder === DAILY_DIR).slice(-3).reverse();
      for (const n of dailies) add('Daily note ' + n.name, await V.read(n.path), 500);
      if (job) {
        const jn = list.find((n) => n.path === job);
        if (jn) { const jt = await V.read(jn.path); add('Job: ' + jn.name, jt, 700); for (const l of V.links(jt).slice(0, 5)) { const t = V.resolve(l, list); if (t && t.path !== 'Profile.md') add('Primed note: ' + t.name, await V.read(t.path), 600); } }
      }
    } catch { /* memory is optional */ }
    return out.join('\n\n');
  }
  function instruction(c, mem) {
    const who = c.you ? 'the personal AI assistant of ' + c.you : 'a personal AI assistant';
    const parts = ['You are ' + c.name + ', ' + who + '. ' + c.personality, 'You are speaking aloud, so use short natural sentences and never read out markdown symbols.'];
    if (mem) parts.push('Private notes from the user\'s memory vault. Use them naturally and do not recite them:\n' + mem);
    return parts.join('\n\n').slice(0, 3900);
  }

  /* tiny, safe Markdown → DOM (no innerHTML) */
  function inline(text, onLink) {
    const frag = document.createDocumentFragment();
    const re = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]|\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*/g;
    let last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) frag.append(text.slice(last, m.index));
      if (m[1] != null) { const target = m[1].trim(); frag.append(h('a', { class: 'jv-wl', href: '#', text: (m[2] || m[1]).trim(), onclick: (e) => { e.preventDefault(); onLink(target); } })); }
      else if (m[3] != null) frag.append(h('b', { text: m[3] }));
      else if (m[4] != null) frag.append(h('code', { text: m[4] }));
      else frag.append(h('i', { text: m[5] }));
      last = re.lastIndex;
    }
    if (last < text.length) frag.append(text.slice(last));
    return frag;
  }
  function renderMd(text, onLink) {
    const root = h('div', { class: 'jv-md' }); let list = null;
    for (const raw of String(text).split('\n')) {
      const line = raw.replace(/\s+$/, ''); let m;
      if ((m = /^(#{1,3})\s+(.*)$/.exec(line))) { list = null; root.append(h('h' + (m[1].length + 2), {}, inline(m[2], onLink))); }
      else if ((m = /^\s*(?:[-*]|\d+\.)\s+(.*)$/.exec(line))) { if (!list) { list = h('ul'); root.append(list); } list.append(h('li', {}, inline(m[1], onLink))); }
      else if (!line.trim()) list = null;
      else { list = null; root.append(h('p', {}, inline(line, onLink))); }
    }
    return root;
  }

  /* ======================================================================
     Face — four animated canvas faces driven by the conversation state
     ====================================================================== */
  const COL = { idle: '#38bdf8', listening: '#fbbf24', thinking: '#a78bfa', speaking: '#34d399' };
  const env = (J.env = { state: 'idle', level: 0, mic: 0, t: 0 });
  const rnd = (a, b) => a + Math.random() * (b - a);
  function mkBoard(w, hgt) {
    const cx = w / 2, cy = hgt / 2, traces = [];
    for (let i = 0; i < 70; i++) {
      const side = i % 4; let x = side === 0 ? rnd(0, w) : side === 1 ? w : side === 2 ? rnd(0, w) : 0, y = side === 0 ? 0 : side === 1 ? rnd(0, hgt) : side === 2 ? hgt : rnd(0, hgt);
      const pts = [[x, y]]; let horizontal = Math.random() < 0.5;
      for (let k = 0; k < 7; k++) { const tx = cx + rnd(-90, 90), ty = cy + rnd(-60, 60); if (horizontal) x = x + (tx - x) * rnd(0.3, 0.8); else y = y + (ty - y) * rnd(0.3, 0.8); pts.push([x, y]); horizontal = !horizontal; }
      pts.push([cx + rnd(-70, 70), cy + rnd(-45, 45)]);
      let len = 0; const seg = []; for (let k = 1; k < pts.length; k++) { const d = Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); seg.push(d); len += d; }
      traces.push({ pts, seg, len });
    }
    return { traces, pulses: Array.from({ length: 50 }, () => ({ t: Math.floor(Math.random() * 70), p: Math.random() })) };
  }
  const at = (tr, p) => { let d = p * tr.len; for (let k = 0; k < tr.seg.length; k++) { if (d <= tr.seg[k]) { const f = tr.seg[k] ? d / tr.seg[k] : 0; return [tr.pts[k][0] + (tr.pts[k + 1][0] - tr.pts[k][0]) * f, tr.pts[k][1] + (tr.pts[k + 1][1] - tr.pts[k][1]) * f]; } d -= tr.seg[k]; } return tr.pts[tr.pts.length - 1]; };
  const FACE_DRAW = {
    board(g, w, hgt, e, S, name) {
      if (!S.b || S.b.w !== w || S.b.h !== hgt) S.b = { w, h: hgt, ...mkBoard(w, hgt) };
      const c = COL[e.state], boost = 0.35 + e.level * 1.6, dir = e.state === 'listening' ? -1 : 1;
      g.lineWidth = 1; g.strokeStyle = c; g.globalAlpha = 0.16 + e.level * 0.2;
      for (const tr of S.b.traces) { g.beginPath(); tr.pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.stroke(); }
      g.globalAlpha = 1;
      const speed = e.state === 'thinking' ? 0.5 : e.state === 'idle' ? 0.12 : 0.3;
      for (const pl of S.b.pulses) {
        pl.p += (dir * speed * boost * 0.016 * 200) / S.b.traces[pl.t].len; if (pl.p > 1) { pl.p = 0; pl.t = (Math.random() * 70) | 0; } if (pl.p < 0) { pl.p = 1; pl.t = (Math.random() * 70) | 0; }
        const [x, y] = at(S.b.traces[pl.t], pl.p); g.fillStyle = c; g.shadowColor = c; g.shadowBlur = 12; g.beginPath(); g.arc(x, y, 2.4, 0, 7); g.fill();
      }
      g.shadowBlur = 0;
      const cw = Math.min(w, hgt) * 0.3, cx = w / 2, cy = hgt / 2;
      g.fillStyle = '#04070d'; g.strokeStyle = c; g.lineWidth = 2; g.shadowColor = c; g.shadowBlur = 10 + e.level * 40;
      g.fillRect(cx - cw / 2, cy - cw / 4, cw, cw / 2); g.strokeRect(cx - cw / 2, cy - cw / 4, cw, cw / 2); g.shadowBlur = 0;
      g.fillStyle = c; g.textAlign = 'center'; g.font = '600 ' + Math.round(cw / 7) + 'px ui-monospace, monospace'; g.fillText(name.toUpperCase(), cx, cy + cw / 22);
      g.font = '12px ui-monospace, monospace'; g.globalAlpha = 0.8; g.fillText(e.state.toUpperCase(), cx, cy + cw / 5); g.globalAlpha = 1;
    },
    radial(g, w, hgt, e, S, name) {
      const c = COL[e.state], cx = w / 2, cy = hgt / 2, R = Math.min(w, hgt) * 0.2;
      if (!S.p) S.p = Array.from({ length: 260 }, () => ({ a: rnd(0, 6.283), d: Math.random(), s: rnd(0.2, 1) }));
      g.strokeStyle = c; g.lineWidth = 3; g.lineCap = 'round';
      for (let i = 0; i < 80; i++) {
        const a = (i / 80) * 6.283 + e.t * (e.state === 'thinking' ? 0.9 : 0.1), n = 0.5 + 0.5 * Math.sin(e.t * 3 + i * 0.7) * Math.sin(e.t * 1.3 + i * 0.21);
        const len = R * (0.15 + (e.state === 'idle' ? 0.05 : 0.15) + n * e.level * 1.6 + (e.state === 'thinking' ? 0.18 * Math.abs(Math.sin(a * 3 - e.t * 4)) : 0));
        g.globalAlpha = 0.55 + n * 0.45; g.beginPath(); g.moveTo(cx + Math.cos(a) * R * 1.15, cy + Math.sin(a) * R * 1.15); g.lineTo(cx + Math.cos(a) * (R * 1.15 + len), cy + Math.sin(a) * (R * 1.15 + len)); g.stroke();
      }
      g.globalAlpha = 1; g.fillStyle = c;
      for (const p of S.p) { p.a += 0.004 * p.s * (e.state === 'thinking' ? 4 : 1); const d = R * (0.2 + p.d * 0.8) * (1 + e.level * 0.5 * Math.sin(e.t * 9 + p.a * 5)); g.globalAlpha = 0.25 + p.s * 0.6; g.fillRect(cx + Math.cos(p.a) * d, cy + Math.sin(p.a) * d, 2, 2); }
      g.globalAlpha = 1;
      if (e.state === 'idle') { const k = (e.t * 0.35) % 1; g.strokeStyle = c; g.globalAlpha = 1 - k; g.lineWidth = 1.5; g.beginPath(); g.arc(cx, cy, R * (1.4 + k * 2.2), 0, 7); g.stroke(); g.globalAlpha = 1; }
      g.fillStyle = c; g.textAlign = 'center'; g.font = '600 15px ui-monospace, monospace'; g.fillText(name.toUpperCase() + ' · ' + e.state.toUpperCase(), cx, cy + R * 2.9);
    },
    rain(g, w, hgt, e, S, name) {
      const sz = 16, cols = Math.ceil(w / sz); const c = COL[e.state];
      if (!S.r || S.r.length !== cols) S.r = Array.from({ length: cols }, () => rnd(-50, hgt / sz));
      g.fillStyle = 'rgba(2,6,10,0.18)'; g.fillRect(0, 0, w, hgt); g.font = sz + 'px ui-monospace, monospace';
      const fx = w / 2, fy = hgt / 2, rx = Math.min(w, hgt) * (0.2 + e.level * 0.08), ry = rx * 1.3, chars = '01ΣΔΩ▲▼◆<>{}/\\|=+*';
      for (let i = 0; i < cols; i++) {
        const x = i * sz, y = S.r[i] * sz, inside = ((x - fx) / rx) ** 2 + ((y - fy) / ry) ** 2 < 1;
        g.fillStyle = inside && e.state !== 'idle' ? '#ffffff' : c; g.globalAlpha = inside && e.state !== 'idle' ? 0.95 : 0.55; g.fillText(chars[(Math.random() * chars.length) | 0], x, y);
        S.r[i] += (e.state === 'idle' ? 0.5 : 0.9) * (0.5 + Math.random() * 0.7); if (S.r[i] * sz > hgt && Math.random() > 0.975) S.r[i] = 0;
      }
      g.globalAlpha = 1; g.fillStyle = c; g.textAlign = 'center'; g.font = '600 14px ui-monospace, monospace'; g.fillText(name.toUpperCase() + ' · ' + e.state.toUpperCase(), fx, hgt - 24);
    },
    neural(g, w, hgt, e, S, name) {
      const c = COL[e.state], cx = w / 2, cy = hgt / 2, rx = w * 0.3, ry = hgt * 0.28;
      if (!S.n) {
        const lab = ['MEMORY', 'VOICE', 'VISION', 'LANGUAGE', 'PLANNING', 'TOOLS', 'EMOTION', 'FOCUS', 'REFLEX'];
        S.n = { nodes: Array.from({ length: 90 }, (_, i) => { const a = rnd(0, 6.283), r = Math.sqrt(Math.random()); return { a, r, k: i % 9, ph: rnd(0, 6.283) }; }), lab, pulses: [] };
      }
      const pos = (n) => [cx + Math.cos(n.a) * n.r * rx, cy + Math.sin(n.a) * n.r * ry];
      const ps = S.n.nodes.map(pos);
      g.lineWidth = 1; g.strokeStyle = c;
      for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) { const d = Math.hypot(ps[i][0] - ps[j][0], ps[i][1] - ps[j][1]); if (d < 62) { g.globalAlpha = (1 - d / 62) * (0.25 + e.level); g.beginPath(); g.moveTo(ps[i][0], ps[i][1]); g.lineTo(ps[j][0], ps[j][1]); g.stroke(); } }
      g.globalAlpha = 1;
      if (Math.random() < 0.08 + e.level * 0.5 + (e.state === 'thinking' ? 0.25 : 0)) S.n.pulses.push({ a: (Math.random() * ps.length) | 0, b: (Math.random() * ps.length) | 0, p: 0 });
      S.n.pulses = S.n.pulses.filter((q) => (q.p += 0.03) < 1);
      g.shadowColor = c; g.shadowBlur = 10; g.fillStyle = '#fff';
      for (const q of S.n.pulses) { const x = ps[q.a][0] + (ps[q.b][0] - ps[q.a][0]) * q.p, y = ps[q.a][1] + (ps[q.b][1] - ps[q.a][1]) * q.p; g.beginPath(); g.arc(x, y, 2.5, 0, 7); g.fill(); }
      g.shadowBlur = 0;
      S.n.nodes.forEach((n, i) => { g.fillStyle = c; g.globalAlpha = 0.5 + 0.5 * Math.sin(e.t * 2 + n.ph); g.beginPath(); g.arc(ps[i][0], ps[i][1], 2 + e.level * 2, 0, 7); g.fill(); });
      g.globalAlpha = 1; g.font = '11px ui-monospace, monospace'; g.textAlign = 'center';
      S.n.lab.forEach((t, k) => { const a = (k / 9) * 6.283 - 1.57, x = cx + Math.cos(a) * rx * 1.28, y = cy + Math.sin(a) * ry * 1.35; g.fillStyle = c; g.fillText(t, x, y); });
      g.textAlign = 'left'; g.font = '12px ui-monospace, monospace'; g.fillStyle = c;
      ['CORTEX STATUS', name.toUpperCase(), 'STATE: ' + e.state.toUpperCase(), 'LEVEL: ' + Math.round(e.level * 100) + '%'].forEach((t, i) => g.fillText(t, 18, 28 + i * 18));
    },
  };
  function faceCanvas(getFace, getName) {
    const cv = h('canvas', { class: 'jv-canvas', 'aria-label': 'Animated face', role: 'img' }); const g = cv.getContext('2d'); const S = {};
    let w = 0, hh = 0, last = 0, which = '';
    const fit = () => { const r = cv.getBoundingClientRect(); const d = Math.min(2, window.devicePixelRatio || 1); const nw = Math.max(200, Math.round(r.width)), nh = Math.max(160, Math.round(r.height)); if (nw !== w || nh !== hh) { w = nw; hh = nh; cv.width = w * d; cv.height = hh * d; g.setTransform(d, 0, 0, d, 0, 0); for (const k of Object.keys(S)) delete S[k]; g.fillStyle = '#02060a'; g.fillRect(0, 0, w, hh); } };
    const loop = (ts) => {
      if (!cv.isConnected) return; requestAnimationFrame(loop);
      if (document.hidden || cv.offsetParent === null) return;
      fit(); const dt = Math.min(0.1, (ts - last) / 1000 || 0.016); last = ts; env.t += dt;
      const f = getFace(); if (f !== which) { which = f; for (const k of Object.keys(S)) delete S[k]; g.fillStyle = '#02060a'; g.fillRect(0, 0, w, hh); }
      if (f !== 'rain') { g.globalAlpha = 0.28; g.fillStyle = '#02060a'; g.fillRect(0, 0, w, hh); g.globalAlpha = 1; }
      if (f === 'board' || f === 'radial' || f === 'neural') { g.fillStyle = '#02060a'; g.globalAlpha = 0.65; g.fillRect(0, 0, w, hh); g.globalAlpha = 1; }
      FACE_DRAW[f](g, w, hh, env, S, getName());
    };
    requestAnimationFrame(loop);
    return cv;
  }

  /* ======================================================================
     Mouth — a Gemini Live conversation (face + memory + push-to-talk)
     ====================================================================== */
  const norm = (t) => String(t).toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();

  function buildApp() {
    const root = h('div', { class: 'jv' });
    const tabs = h('div', { class: 'seg jv-tabs' }); const pane = h('div', { class: 'jv-pane' });
    let tab = 'talk', session = null, poll = null, demo = null;
    const leave = {}, panes = {}, FN = {};
    const G = () => ulyOS.Gemini;
    const names = [['talk', 'Talk'], ['memory', 'Memory'], ['agent', 'Agent'], ['stack', 'Stack']];
    /* The Talk pane is built once and only hidden, so a running conversation survives tab switches; the others rebuild on entry. */
    const setTab = (t) => {
      if (leave[tab]) { try { leave[tab](); } catch { /* ignore */ } }
      tab = t; paintTabs();
      if (t !== 'talk' || !panes.talk) { if (panes[t]) panes[t].remove(); panes[t] = h('div', { class: 'jv-tabpane' }); pane.append(panes[t]); FN[t](panes[t]); }
      for (const k of Object.keys(panes)) panes[k].hidden = k !== t;
    };
    const paintTabs = () => tabs.replaceChildren(...names.map(([k, l]) => h('button', { class: tab === k ? 'active' : '', text: l, onclick: () => setTab(k) })));
    root.append(tabs, pane);
    J._leave = () => { if (leave[tab]) { try { leave[tab](); } catch { /* ignore */ } } };

    /* ---------------- Talk ---------------- */
    function talkTab(pane) {
      const c = cfg();
      const cv = faceCanvas(() => cfg().face, () => cfg().name);
      const stage = h('div', { class: 'jv-stage' }, cv, h('div', { class: 'jv-badge', text: 'idle' }));
      const log = h('div', { class: 'jv-log', role: 'log', 'aria-live': 'polite' });
      const status = h('div', { class: 'jv-status', text: 'Not connected' });
      const go = h('button', { class: 'btn primary', html: icon('mic', 15) + ' Start talking' });
      const faceSel = h('select', { class: 'input sm', 'aria-label': 'Face', onchange: () => save({ face: faceSel.value }) }, FACES.map(([k, l]) => h('option', { value: k, text: l, selected: k === c.face })));
      const fullBtn = h('button', { class: 'btn sm', html: icon('fullscreen', 14) + ' Full screen', onclick: () => { if (document.fullscreenElement) document.exitFullscreen(); else stage.requestFullscreen?.().catch(() => {}); } });
      const demoBtn = h('button', { class: 'btn sm', text: 'Demo', title: 'Show the face moving without a conversation' });
      const holdBtn = h('button', { class: 'btn sm jv-hold', text: 'Hold to talk', hidden: !c.ptt });
      const jobSel = h('select', { class: 'input sm', 'aria-label': 'Job', title: 'A job primes the assistant with the notes it lists' }, h('option', { value: '', text: 'No job' }));
      const text = h('input', { class: 'input', placeholder: 'Or type a message…', maxLength: 1500, disabled: true, 'aria-label': 'Message' });
      const keyBtn = h('button', { class: 'btn sm', onclick: G().keyDialog(paintKey) });
      const saveBtn = h('button', { class: 'btn sm', text: 'Save to today’s note', disabled: true });
      function paintKey() { keyBtn.textContent = G().hasKey() ? 'Gemini key: ' + G().config().key + ' (change)' : 'Add Gemini API key…'; }
      paintKey();
      V.list().then((l) => { l.filter((n) => n.folder === 'Jobs').forEach((n) => jobSel.append(h('option', { value: n.path, text: n.name }))); }).catch(() => {});
      pane.replaceChildren(stage,
        h('div', { class: 'jv-bar' }, go, holdBtn, faceSel, fullBtn, demoBtn, jobSel),
        h('div', { class: 'jv-bar' }, status, keyBtn),
        log, h('div', { class: 'jv-bar' }, text, saveBtn),
        h('p', { class: 'set-desc', text: 'Voice by Gemini Live with your own API key. Say “go hands free” or “push to talk mode” to switch the microphone, or “clear the session” to start fresh. Your memory notes are shared with Google only while a conversation is running, and only the parts selected for it.' }));

      const lines = []; let curMe = null, curAi = null, userTurn = '', awaiting = false, lastUser = 0, held = false;
      const addLine = (who, t) => { const row = h('div', { class: 'jv-line ' + who }, h('b', { text: who === 'me' ? (cfg().you || 'You') : cfg().name }), h('span', { text: t })); log.append(row); log.scrollTop = log.scrollHeight; return row; };
      const part = (who, t) => { let cur = who === 'me' ? curMe : curAi; if (!cur) { cur = addLine(who, ''); if (who === 'me') curMe = cur; else curAi = cur; lines.push([who, cur]); } cur.lastChild.textContent += t; log.scrollTop = log.scrollHeight; };
      const badge = stage.querySelector('.jv-badge');
      const setState = (s) => { env.state = s; badge.textContent = s; badge.dataset.s = s; };
      const mute = (on) => { const tr = session && session.mic && session.mic.getAudioTracks()[0]; if (tr) tr.enabled = !on; };
      const stop = () => { clearInterval(poll); poll = null; if (session) { const s = session; session = null; s.close(); } setState('idle'); env.level = 0; go.innerHTML = icon('mic', 15) + ' Start talking'; go.classList.remove('danger'); text.disabled = true; status.textContent = 'Not connected'; };
      const tick = () => {
        const s = session; if (!s) return; let lvl = 0;
        if (s.an) { const d = new Uint8Array(s.an.frequencyBinCount); s.an.getByteFrequencyData(d); let sum = 0; for (let i = 0; i < d.length; i++) sum += d[i]; lvl = Math.min(1, sum / d.length / 120); }
        if (s.sources.size > 0) { setState('speaking'); awaiting = false; env.level += (lvl - env.level) * 0.4; }
        else if (awaiting && Date.now() - lastUser < 25000 && Date.now() - lastUser > 500) { setState('thinking'); env.level *= 0.8; }
        else if (env.mic > 0.05 && !(cfg().ptt && !held)) { setState('listening'); env.level += (env.mic * 3 - env.level) * 0.4; }
        else { setState('idle'); env.level *= 0.85; }
      };
      const applyCommand = (said) => {
        const t = norm(said);
        if (t === 'go hands free') { save({ ptt: false }); holdBtn.hidden = true; mute(false); ui.toast('Hands-free listening', { type: 'ok', timeout: 1600 }); }
        else if (t === 'push to talk mode') { save({ ptt: true }); holdBtn.hidden = false; mute(true); ui.toast('Push to talk: hold ' + (PTT_KEYS.find((k) => k[0] === cfg().pttKey) || ['', 'the key'])[1], { type: 'ok', timeout: 2400 }); }
        else if (t === 'clear the session') { stop(); log.replaceChildren(); start(); }
      };
      async function start() {
        if (!G().hasKey()) { await G().keyDialog(paintKey)(); if (!G().hasKey()) return; }
        const cc = cfg(); go.disabled = true; status.textContent = 'Connecting…'; curMe = curAi = null; userTurn = '';
        try {
          const mem = cc.useMemory ? await memoryContext(jobSel.value) : '';
          session = await G().live({
            config: { persona: instruction(cc, mem), ...(cc.voice ? { voice: cc.voice } : {}) },
            onState: (t) => { status.textContent = t; },
            onInText: (t) => { curAi = null; part('me', t); userTurn += t; awaiting = true; lastUser = Date.now(); },
            onOutText: (t) => { curMe = null; part('ai', t); },
            onTurn: () => { awaiting = false; if (userTurn) applyCommand(userTurn); userTurn = ''; curMe = curAi = null; },
            onLevel: (l) => { env.mic += (l - env.mic) * 0.5; },
            onError: (m) => { ui.toast(m, { type: 'err', timeout: 5000 }); status.textContent = m; },
            onClose: () => { if (session) stop(); },
          });
          go.innerHTML = icon('stop', 15) + ' Stop'; go.classList.add('danger'); text.disabled = false; saveBtn.disabled = false; status.textContent = 'Connected as ' + cc.name;
          if (cc.ptt) mute(true);
          poll = setInterval(tick, 50);
          session.sendText('Greet me out loud with exactly this sentence and nothing else: "' + greetingOf(cc).replace(/"/g, '') + '"');
        } catch (e) { stop(); ui.toast(e.message || String(e), { type: 'err', timeout: 6000 }); status.textContent = e.message || 'Could not connect'; }
        go.disabled = false;
      }
      go.addEventListener('click', () => { if (session) stop(); else start(); });
      text.addEventListener('keydown', (e) => { if (e.key === 'Enter' && text.value.trim() && session) { addLine('me', text.value.trim()); awaiting = true; lastUser = Date.now(); session.sendText(text.value); text.value = ''; } });
      saveBtn.addEventListener('click', async () => {
        const rows = [...log.querySelectorAll('.jv-line')]; if (!rows.length) { ui.toast('Nothing to save yet', { type: 'info' }); return; }
        const d = new Date();
        try { await V.dailyAppend('## Conversation ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + '\n' + rows.map((r) => '- **' + r.firstChild.textContent + ':** ' + r.lastChild.textContent.replace(/\s+/g, ' ').trim()).join('\n')); ui.toast('Saved to ' + dailyPath(), { type: 'ok' }); } catch (e) { ui.toast(e.message, { type: 'err' }); }
      });
      /* push to talk: hold the chosen key (when not typing) or the on-screen button */
      const kd = (e) => { if (!session || !cfg().ptt || e.code !== cfg().pttKey || e.repeat || /INPUT|TEXTAREA|SELECT/.test((e.target && e.target.tagName) || '')) return; if (WM.focused() && WM.focused().appId !== 'jarvis') return; e.preventDefault(); held = true; mute(false); setState('listening'); };
      const ku = (e) => { if (e.code === cfg().pttKey && held) { held = false; mute(true); } };
      document.addEventListener('keydown', kd); document.addEventListener('keyup', ku);
      holdBtn.addEventListener('pointerdown', () => { held = true; mute(false); }); ['pointerup', 'pointerleave'].forEach((ev) => holdBtn.addEventListener(ev, () => { if (held) { held = false; mute(true); } }));
      demoBtn.addEventListener('click', () => {
        if (session) { ui.toast('Stop the conversation to run the demo', { type: 'info' }); return; }
        if (demo) { clearInterval(demo); demo = null; demoBtn.textContent = 'Demo'; setState('idle'); env.level = 0; return; }
        demoBtn.textContent = 'Stop demo'; const seq = ['idle', 'listening', 'thinking', 'speaking']; let i = 0, n = 0;
        demo = setInterval(() => { n++; if (n % 40 === 1) i = (i + 1) % 4; setState(seq[i]); env.level = seq[i] === 'speaking' || seq[i] === 'listening' ? 0.25 + 0.5 * Math.abs(Math.sin(n * 0.4) * Math.sin(n * 0.13)) : 0.05; }, 50);
      });
      J._dispose = () => { document.removeEventListener('keydown', kd); document.removeEventListener('keyup', ku); clearInterval(demo); demo = null; stop(); };
    }

    /* ---------------- Memory ---------------- */
    function memoryTab(pane) {
      let list = [], cur = null, dirty = false, editing = true;
      const q = h('input', { class: 'input sm', placeholder: 'Search notes…', 'aria-label': 'Search notes' });
      const nav = h('div', { class: 'jv-nav' });
      const title = h('div', { class: 'jv-ntitle', text: 'No note open' });
      const ed = h('textarea', { class: 'input jv-ed', spellcheck: 'true', 'aria-label': 'Note', disabled: true });
      const view = h('div', { class: 'jv-view', hidden: true });
      const back = h('div', { class: 'jv-back' });
      const modeBtn = h('button', { class: 'btn sm', text: 'Preview' });
      const saveBtn = h('button', { class: 'btn sm primary', text: 'Save', disabled: true });
      const delBtn = h('button', { class: 'btn sm danger', text: 'Delete', disabled: true });
      const newBtn = h('button', { class: 'btn sm', html: icon('plus', 14) + ' New' });
      const dayBtn = h('button', { class: 'btn sm', text: 'Today' });
      const exBtn = h('button', { class: 'btn sm', html: icon('download', 14) + ' Export' });
      const info = h('p', { class: 'set-desc', text: 'Plain Markdown files in Files → Jarvis Vault, encrypted at rest. Link notes with [[double brackets]]. Obsidian can open an exported copy.' });
      pane.replaceChildren(h('div', { class: 'jv-mem' },
        h('div', { class: 'jv-side' }, h('div', { class: 'jv-bar' }, newBtn, dayBtn, exBtn), q, nav),
        h('div', { class: 'jv-main' }, h('div', { class: 'jv-bar' }, title, modeBtn, saveBtn, delBtn), ed, view, back)), info);
      const paintNav = () => {
        const f = q.value.trim().toLowerCase(); const groups = new Map();
        for (const n of list) { if (f && !(n.path.toLowerCase().includes(f) || (V.cache.get(n.path) || '').toLowerCase().includes(f))) continue; const g = n.folder || 'Vault'; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(n); }
        nav.replaceChildren(...[...groups].flatMap(([g, ns]) => [h('div', { class: 'jv-grp', text: g }), ...ns.reverse().map((n) => h('button', { class: 'jv-item' + (cur && cur.path === n.path ? ' on' : ''), text: n.name, onclick: () => open(n) }))]));
        if (!list.length) nav.replaceChildren(h('p', { class: 'set-desc', text: 'No notes yet.' }));
      };
      const paintBacklinks = () => {
        if (!cur) { back.replaceChildren(); return; }
        const bl = list.filter((n) => n.path !== cur.path && V.links(V.cache.get(n.path) || '').some((l) => { const t = V.resolve(l, list); return t && t.path === cur.path; }));
        back.replaceChildren(h('div', { class: 'jv-grp', text: 'Linked from' }), ...(bl.length ? bl.map((n) => h('button', { class: 'jv-item', text: n.name, onclick: () => open(n) })) : [h('span', { class: 'set-desc', text: 'No other note links here yet.' })]));
      };
      const showView = () => { editing = false; ed.hidden = true; view.hidden = false; modeBtn.textContent = 'Edit'; view.replaceChildren(renderMd(ed.value, (l) => { const t = V.resolve(l, list); if (t) open(t); else ui.confirm({ title: 'Create “' + l + '”?', message: 'No note with that name exists yet.', okText: 'Create' }).then(async (ok) => { if (ok) { await V.write('Inbox/' + l + '.md', '# ' + l + '\n\n'); await refresh(); open(V.resolve(l, list)); } }); })); };
      const showEdit = () => { editing = true; ed.hidden = false; view.hidden = true; modeBtn.textContent = 'Preview'; };
      const flush = async () => { if (cur && dirty) { await V.write(cur.path, ed.value); dirty = false; saveBtn.disabled = true; paintBacklinks(); } };
      async function open(n) { try { await flush(); } catch { /* ignore */ } cur = n; const t = V.cache.get(n.path) ?? await V.read(n.path); ed.value = t; ed.disabled = false; delBtn.disabled = false; title.textContent = n.path; dirty = false; saveBtn.disabled = true; paintNav(); paintBacklinks(); if (editing) showEdit(); else showView(); }
      async function refresh() { await V.ensure(); list = await V.loadAll(); paintNav(); paintBacklinks(); }
      ed.addEventListener('input', () => { dirty = true; saveBtn.disabled = false; });
      ed.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveBtn.click(); } });
      saveBtn.addEventListener('click', async () => { try { await flush(); ui.toast('Saved', { type: 'ok', timeout: 1200 }); } catch (e) { ui.toast(e.message, { type: 'err' }); } });
      modeBtn.addEventListener('click', () => { if (editing) showView(); else showEdit(); });
      q.addEventListener('input', paintNav);
      newBtn.addEventListener('click', async () => {
        const v = await ui.form({ title: 'New note', fields: [{ name: 'name', label: 'Title' }, { name: 'folder', label: 'Folder (Projects, Jobs, Inbox…)', value: 'Inbox' }], okText: 'Create', validate: (x) => (x.name.trim() ? null : 'Give the note a title') });
        if (!v) return; const p = safePath((v.folder || 'Inbox') + '/' + v.name.trim()) + '.md'; await V.write(p, '# ' + v.name.trim() + '\n\n'); await refresh(); open(list.find((n) => n.path === p));
      });
      dayBtn.addEventListener('click', async () => { const p = dailyPath(); if ((await V.read(p, true)) == null) await V.write(p, dailyTemplate(today())); await refresh(); open(list.find((n) => n.path === p)); });
      delBtn.addEventListener('click', async () => { if (!cur) return; if (!(await ui.confirm({ title: 'Delete this note?', message: cur.path, okText: 'Delete' }))) return; await V.remove(cur.path); cur = null; ed.value = ''; ed.disabled = true; delBtn.disabled = true; title.textContent = 'No note open'; await refresh(); });
      exBtn.addEventListener('click', async () => {
        const all = await V.loadAll(); const body = all.map((n) => '<!-- ' + n.path + ' -->\n' + (V.cache.get(n.path) || '')).join('\n\n----\n\n');
        const a = h('a', { href: URL.createObjectURL(new Blob([body], { type: 'text/markdown' })), download: 'jarvis-vault-' + stamp() + '.md' }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        ui.toast('Exported ' + all.length + ' notes as one Markdown file', { type: 'ok' });
      });
      leave.memory = () => { if (dirty && cur) V.write(cur.path, ed.value).catch(() => {}); };
      refresh().then(() => { const t = list.find((n) => n.path === dailyPath()) || list.find((n) => n.path === 'Profile.md'); if (t) open(t); }).catch((e) => { nav.replaceChildren(h('p', { class: 'set-desc', text: e.message || 'Files are unavailable' })); });
    }

    /* ---------------- Agent ---------------- */
    function agentTab(pane) {
      const c = cfg(); const g = G();
      const f = (label, el, desc) => h('div', { class: 'set-row' }, h('div', {}, h('div', { class: 'set-label', text: label }), desc ? h('div', { class: 'set-desc', text: desc }) : null), el);
      const name = h('input', { class: 'input sm', value: c.name, maxLength: 30, 'aria-label': 'Agent name' });
      const you = h('input', { class: 'input sm', value: c.you, maxLength: 40, placeholder: 'Your first name', 'aria-label': 'Your name' });
      const pers = h('textarea', { class: 'input', rows: 5, maxLength: 1200, 'aria-label': 'Personality' }); pers.value = c.personality;
      const greet = h('input', { class: 'input', value: c.greeting, maxLength: 200, placeholder: greetingOf(c), 'aria-label': 'Greeting' });
      const voice = h('select', { class: 'input sm', 'aria-label': 'Voice' }, h('option', { value: '', text: 'Default (from Gemini Live settings)' }), ...g.VOICES.map(([n, d]) => h('option', { value: n, text: n + ' — ' + d, selected: n === c.voice })));
      const mem = h('input', { type: 'checkbox', checked: c.useMemory, 'aria-label': 'Use memory' });
      const ptt = h('input', { type: 'checkbox', checked: c.ptt, 'aria-label': 'Push to talk' });
      const key = h('select', { class: 'input sm', 'aria-label': 'Talk key' }, PTT_KEYS.map(([k, l]) => h('option', { value: k, text: l, selected: k === c.pttKey })));
      const faceSel = h('select', { class: 'input sm', 'aria-label': 'Default face' }, FACES.map(([k, l]) => h('option', { value: k, text: l, selected: k === c.face })));
      const msg = h('div', { class: 'set-desc' });
      const collect = () => ({ name: name.value, you: you.value, personality: pers.value, greeting: greet.value, voice: voice.value, useMemory: mem.checked, ptt: ptt.checked, pttKey: key.value, face: faceSel.value });
      pane.replaceChildren(h('div', { class: 'jv-form' },
        f('Agent name', name, 'What your assistant is called. It appears on the face and in conversations.'),
        f('Your name', you, 'Used in the spoken greeting.'),
        f('Personality', pers, 'How it speaks and behaves. Keep it short; the notes in Memory add the rest.'),
        f('Greeting', greet, 'Spoken first when you start talking. Leave empty for “Hello <you>, what are we working on today?”'),
        f('Voice', voice), f('Default face', faceSel),
        f('Use my memory', mem, 'Shares your profile, recent daily notes and the chosen job with Gemini during a conversation.'),
        f('Push to talk', ptt, 'The microphone stays closed until you hold the key or the on-screen button.'), f('Talk key', key),
        h('div', { class: 'btn-row' }, h('button', { class: 'btn primary', text: 'Save', onclick: () => { save(collect()); msg.textContent = 'Saved.'; } }),
          h('button', { class: 'btn', text: 'Reset to defaults', onclick: () => { ulyOS.vault.remove(KEY); setTab('agent'); } })), msg));
    }

    /* ---------------- Stack ---------------- */
    function stackTab(pane) {
      const c = cfg();
      const REPO = 'https://github.com/jaredrhod/';
      const CMD_UNIX = 'mkdir -p ~/my-agent && cd ~/my-agent && git clone https://github.com/jaredrhod/fullstack-agent && cd fullstack-agent && claude "set me up"';
      const CMD_WIN = '$d="$env:USERPROFILE\\.local\\bin"; if (Test-Path "$d\\claude.exe") { $env:Path="$d;$env:Path" }; New-Item -ItemType Directory -Force -Path $HOME\\my-agent | Out-Null; cd $HOME\\my-agent; if (-not (Test-Path fullstack-agent\\fullstack-agent.md)) { Invoke-WebRequest https://github.com/jaredrhod/fullstack-agent/archive/refs/heads/main.zip -OutFile fsa.zip; Expand-Archive fsa.zip . -Force; New-Item -ItemType Directory -Force -Path fullstack-agent | Out-Null; Get-ChildItem fullstack-agent-main -Force | Copy-Item -Destination fullstack-agent -Recurse -Force; Remove-Item fullstack-agent-main -Recurse -Force; Remove-Item fsa.zip }; cd fullstack-agent; if (Get-Command claude -ErrorAction SilentlyContinue) { claude "set me up" } else { Write-Output "Claude Code is not installed yet. Install it first at https://jaredrhod.com/start then paste this again." }';
      const CMD_HANDS = 'git clone https://github.com/jaredrhod/barehands && cd barehands && python3 server.py';
      const copy = (t) => navigator.clipboard.writeText(t).then(() => ui.toast('Copied. Paste it into your terminal', { type: 'ok', timeout: 2200 })).catch(() => ui.toast('Select the command and copy it', { type: 'info' }));
      const cmd = (label, t) => h('div', { class: 'jv-cmd' }, h('div', { class: 'set-label', text: label }), h('code', { text: t }), h('button', { class: 'btn sm', html: icon('copy', 13) + ' Copy', onclick: () => copy(t) }));
      const chip = (id) => h('span', { class: 'jv-chip', id, text: 'not checked' });
      const probe = async (port) => { const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 1500); try { await fetch('http://127.0.0.1:' + port + '/', { mode: 'no-cors', signal: ctl.signal, cache: 'no-store' }); return true; } catch { return false; } finally { clearTimeout(t); } };
      const check = async () => {
        for (const [id, port] of [['jv-face-chip', c.ports.face], ['jv-hands-chip', c.ports.hands]]) { const el = pane.querySelector('#' + id); if (!el) continue; el.textContent = 'checking…'; const ok = await probe(port); el.textContent = ok ? 'running on port ' + port : 'not running'; el.dataset.ok = ok ? '1' : '0'; }
      };
      const openLocal = (title, port, path) => WM.open({ appId: 'jarvis-local-' + port, title, icon: icon('sparkles', 16), width: 1000, height: 680, url: 'http://127.0.0.1:' + port + path });
      const card = (emoji, title, native, original, extra) => h('div', { class: 'jv-card' }, h('b', { text: emoji + ' ' + title }), h('p', {}, h('span', { class: 'jv-k', text: 'In ulyOS: ' }), native), h('p', {}, h('span', { class: 'jv-k', text: 'Original: ' }), original), extra || null);
      pane.replaceChildren(h('div', { class: 'jv-stack' },
        h('p', { class: 'set-desc', text: 'Jarvis is an agent with a mind (memory), a mouth (voice), a face and optional hands. The idea and the open projects come from Jared Rhodenizer (jaredrhod.com). ulyOS has its own built-in version of each piece, and can also embed his originals when they run on this computer.' }),
        card('🧠', 'Mind — memory', 'the Memory tab: Markdown notes in your encrypted Files, daily notes, links, backlinks and jobs.', h('a', { href: REPO + 'ai-memory-vault', target: '_blank', rel: 'noopener noreferrer', text: 'ai-memory-vault' })),
        card('🗣️', 'Mouth — voice', 'the Talk tab: Gemini Live with your agent’s name, personality and memory; push to talk; voice commands.', h('span', {}, h('a', { href: REPO + 'backtalk', target: '_blank', rel: 'noopener noreferrer', text: 'backtalk' }), ' (talks to Claude Code with local speech models, needs install)')),
        card('🖥️', 'Face — visualizer', 'four animated faces on the Talk tab that react to the conversation.', h('a', { href: REPO + 'ai-visualizer', target: '_blank', rel: 'noopener noreferrer', text: 'ai-visualizer' }),
          h('div', { class: 'btn-row' }, chip('jv-face-chip'), h('button', { class: 'btn sm', text: 'Open original face', onclick: () => openLocal('Original face', c.ports.face, '/') }))),
        card('🖐️', 'Hands — barehands (optional, webcam)', 'opens the real app inside ulyOS when it is running on this computer.', h('a', { href: REPO + 'barehands', target: '_blank', rel: 'noopener noreferrer', text: 'barehands' }),
          h('div', { class: 'btn-row' }, chip('jv-hands-chip'), h('button', { class: 'btn sm', text: 'Open hands board', onclick: () => openLocal('Barehands', c.ports.hands, '/stage.html') }), h('button', { class: 'btn sm', text: 'Check again', onclick: check }))),
        h('h3', { text: 'Install the original stack on your computer' }),
        h('p', { class: 'set-desc', text: 'It needs Claude Code with a Claude subscription and sets up local speech models (about 1 GB). Run this in a terminal; it walks you through everything.' }),
        cmd('Mac / Linux', CMD_UNIX), cmd('Windows (PowerShell)', CMD_WIN),
        h('h3', { text: 'Add the hands later (webcam + Chrome)' }), cmd('Mac / Linux', CMD_HANDS),
        h('p', { class: 'set-desc', text: 'On Windows run run.bat in the barehands folder instead. Then open http://127.0.0.1:' + c.ports.hands + '/stage.html in Chrome and allow the camera. Re-running the main installer also adds it.' }),
        h('p', { class: 'set-desc', text: 'Update everything later: ./fullstack-agent/update.sh (Mac), or ask your agent “update everything and tell me what changed”.' }),
        h('div', { class: 'jv-note' }, h('b', { text: 'Local servers and your browser. ' }), 'Checking and embedding use 127.0.0.1 only. Chrome may ask to allow access to devices on your local network, and Safari does not allow a secure page to reach a local server; if so, open the address in a normal tab.'),
        h('p', { class: 'set-desc' }, 'Videos: ', h('a', { href: 'https://www.youtube.com/watch?v=FiOTrxq9ckM', target: '_blank', rel: 'noopener noreferrer', text: 'the Jarvis tour' }), ' · ', h('a', { href: 'https://youtube.com/@jaredrhod', target: '_blank', rel: 'noopener noreferrer', text: 'the full series' }), '. His projects are AGPL-3.0 (memory templates CC BY-SA 4.0). ulyOS includes none of their code.')));
      check();
    }

    Object.assign(FN, { talk: talkTab, memory: memoryTab, agent: agentTab, stack: stackTab });
    setTab('talk');
    return root;
  }

  J.open = function () {
    const ex = WM.byApp('jarvis')[0]; if (ex) { WM.focus(ex); return ex; }
    return WM.open({ appId: 'jarvis', title: 'Jarvis', icon: icon('sparkles', 16), width: 860, height: 760, minWidth: 420, minHeight: 480, mem: 24, render: buildApp, onClose: () => { if (J._leave) J._leave(); if (J._dispose) { J._dispose(); J._dispose = null; } } });
  };
  bus.on('session:lock', () => { if (J._dispose) { J._dispose(); J._dispose = null; } });
  J._test = { clean, instruction, norm, renderMd, FACES };
})();
