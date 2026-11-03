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

  const SIZES = { s: [168, 168], m: [348, 168], l: [348, 348], x: [348, 520] };
  const SIZE_LABEL = { s: 'Small', m: 'Medium', l: 'Large', x: 'Tall' };
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
  /* ---------------- network + UI helpers for the data widgets ---------------- */
  const netCache = new Map();
  function getJSON(url, ttl = 45000) {
    const hit = netCache.get(url);
    if (hit && Date.now() - hit.t < ttl) return hit.p;
    const p = fetch(url).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
    netCache.set(url, { t: Date.now(), p });
    p.catch(() => netCache.delete(url));
    return p;
  }
  const safeHref = (u) => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : null; } catch { return null; } };
  const anchor = (text, href, cls) => { const u = safeHref(href); return u ? h('a', { class: cls || '', href: u, target: '_blank', rel: 'noopener noreferrer', text }) : h('span', { class: cls || '', text }); };
  const segTabs = (items, active, pick) => h('div', { class: 'seg w-tabs w-nodrag' }, items.map(([k, l]) => h('button', { type: 'button', class: k === active ? 'on' : '', text: l, onclick: () => pick(k) })));
  const fmtUsd = (n) => '$' + (n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : n >= 1 ? n.toFixed(2) : n >= 0.01 ? n.toFixed(4) : n.toPrecision(3));
  const fmtBig = (n) => (n >= 1e9 ? '$' + (n / 1e9).toFixed(1) + 'B' : n >= 1e6 ? '$' + (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? '$' + (n / 1e3).toFixed(0) + 'K' : '$' + Math.round(n));
  const ago = (iso) => { const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000)); return m < 60 ? m + 'm ago' : m < 1440 ? Math.round(m / 60) + 'h ago' : Math.round(m / 1440) + 'd ago'; };
  const plain = (html) => (new DOMParser().parseFromString(String(html || ''), 'text/html').body.textContent || '').replace(/\s+/g, ' ').trim();
  const status = (txt) => h('div', { class: 'w-sub w-status', text: txt });
  /** Refresh timer shared by the data widgets (skips hidden tabs). */
  const every = (fn, ms) => { const t = setInterval(() => { if (!document.hidden) fn(); }, ms); return () => clearInterval(t); };

  /** Search-and-pick list (used for coins and markets). value() → [{key,label,sym?}] */
  function picker({ placeholder, search, initial, max = 30 }) {
    let sel = (initial || []).map((x) => ({ ...x }));
    const input = h('input', { class: 'input', type: 'search', placeholder, autocomplete: 'off', spellcheck: false });
    const results = h('div', { class: 'pk-results' });
    const chips = h('div', { class: 'pk-chips' });
    const paint = () => chips.replaceChildren(...(sel.length ? sel.map((x, i) => h('span', { class: 'pk-chip' },
      h('button', { type: 'button', class: 'pk-mv', title: 'Move earlier', 'aria-label': 'Move earlier', text: '↑', disabled: i === 0, onclick: () => { [sel[i - 1], sel[i]] = [sel[i], sel[i - 1]]; paint(); } }),
      h('span', { class: 'pk-l', text: x.sym ? x.sym + ' · ' + x.label : x.label, title: x.label }),
      h('button', { type: 'button', class: 'pk-rm', title: 'Remove', 'aria-label': 'Remove', text: '✕', onclick: () => { sel.splice(i, 1); paint(); } }))) : [h('span', { class: 'w-sub', text: 'Nothing selected yet — search above.' })]));
    paint();
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') e.preventDefault(); });
    input.addEventListener('input', debounce(async () => {
      const q = input.value.trim();
      if (q.length < 2) { results.replaceChildren(); return; }
      results.textContent = 'Searching…';
      try {
        const found = await search(q);
        results.replaceChildren(...(found.length ? found.slice(0, 8).map((it) => h('button', { type: 'button', class: 'pk-res', onclick: () => { if (!sel.some((x) => x.key === it.key) && sel.length < max) { sel.push({ key: it.key, label: it.label, ...(it.sym ? { sym: it.sym } : {}) }); paint(); } } },
          h('b', { text: it.label }), h('span', { text: it.sub || '' }))) : [status('No results')]));
      } catch { results.replaceChildren(status('Search unavailable — check your connection')); }
    }, 350));
    return { el: h('div', { class: 'pk' }, input, results, h('div', { class: 'field-label', text: 'Selected (' + max + ' max)' }), chips), value: () => sel.map((x) => ({ ...x })) };
  }
  /** Checkbox grid. options: [[key,label]] → value() = checked keys */
  function checks(options, selected) {
    const sel = new Set(selected || []);
    const extra = [...sel].filter((k) => !options.some((o) => o[0] === k)).map((k) => [k, k]);
    const boxes = [...options, ...extra].map(([k, l]) => { const c = h('input', { type: 'checkbox', checked: sel.has(k) }); return { k, c, el: h('label', { class: 'opt ck' }, c, l) }; });
    return { el: h('div', { class: 'ck-grid' }, boxes.map((b) => b.el)), value: () => boxes.filter((b) => b.c.checked).map((b) => b.k) };
  }
  const field = (label, node) => h('label', { class: 'field' }, h('span', { class: 'field-label', text: label }), node);

  const LEAGUES = [['basketball/nba', 'NBA'], ['basketball/wnba', 'WNBA'], ['basketball/mens-college-basketball', 'NCAA Men’s Basketball'], ['basketball/womens-college-basketball', 'NCAA Women’s Basketball'],
    ['football/nfl', 'NFL'], ['football/college-football', 'College Football'], ['baseball/mlb', 'MLB'], ['hockey/nhl', 'NHL'], ['soccer/usa.1', 'MLS'], ['soccer/eng.1', 'Premier League'],
    ['soccer/esp.1', 'La Liga'], ['soccer/ger.1', 'Bundesliga'], ['soccer/ita.1', 'Serie A'], ['soccer/fra.1', 'Ligue 1'], ['soccer/uefa.champions', 'Champions League'],
    ['mma/ufc', 'UFC'], ['racing/f1', 'Formula 1'], ['racing/nascar-premier', 'NASCAR'], ['tennis/atp', 'ATP Tennis'], ['tennis/wta', 'WTA Tennis'], ['golf/pga', 'PGA Tour']];
  const leagueName = (p) => (LEAGUES.find((l) => l[0] === p) || [0, p])[1];
  const validPath = (p) => /^[a-z0-9-]+\/[a-z0-9._-]+$/i.test(p);
  const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/';
  const PM = 'https://gamma-api.polymarket.com';
  const DEFAULT_TOKENS = [{ key: 'ripple', label: 'XRP', sym: 'XRP' }, { key: 'bitcoin', label: 'Bitcoin', sym: 'BTC' }, { key: 'ethereum', label: 'Ethereum', sym: 'ETH' }];

  /** Per-widget settings that are safe to persist / import (strings only, bounded). */
  function cleanCfg(r) {
    const o = {};
    const str = (v, n) => String(v).slice(0, n);
    const list = (v, fn, max) => (Array.isArray(v) ? v.slice(0, max).map(fn).filter(Boolean) : null);
    const tokens = list(r.tokens, (t) => t && typeof t.key === 'string' && /^[\w.-]{1,60}$/.test(t.key) ? { key: t.key, label: str(t.label || t.key, 40), sym: str(t.sym || '', 12) } : null, 30); if (tokens) o.tokens = tokens;
    const watch = list(r.watch, (t) => t && typeof t.key === 'string' && /^[\w.-]{1,80}$/.test(t.key) ? { key: t.key, label: str(t.label || t.key, 140) } : null, 30); if (watch) o.watch = watch;
    const leagues = list(r.leagues, (v) => typeof v === 'string' && validPath(v) ? v : null, 12); if (leagues) o.leagues = leagues;
    const sources = list(r.sources, (v) => typeof v === 'string' && (/^(world|trending|tech)$/.test(v) || /^espn:[a-z0-9-]+\/[a-z0-9._-]+$/i.test(v)) ? v : null, 6); if (sources) o.sources = sources;
    if (typeof r.team === 'string') o.team = str(r.team, 40);
    if (r.tab === 'watch' || r.tab === 'trend') o.tab = r.tab;
    const zones = list(r.zones, (z) => (typeof z === 'string' && validZone(z) ? z : null), 6); if (zones && zones.length) o.zones = zones;
    if (r.city && typeof r.city.name === 'string' && Number.isFinite(+r.city.lat) && Number.isFinite(+r.city.lon) && Math.abs(r.city.lat) <= 90 && Math.abs(r.city.lon) <= 180) o.city = { name: str(r.city.name, 60), lat: +r.city.lat, lon: +r.city.lon };
    if (r.unit === 'c' || r.unit === 'f') o.unit = r.unit;
    return o;
  }

  const DEFAULT_ZONES = ['America/New_York', 'Europe/London', 'Asia/Tokyo'];
  const validZone = (z) => { try { new Intl.DateTimeFormat([], { timeZone: z }); return /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)+$|^UTC$/.test(z); } catch { return false; } };
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
      name: 'Notes', ico: 'text', size: 'm', speak: (inst) => inst.text,
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
      name: 'Crypto', ico: 'trending', size: 'm', cfg: true,
      async config(inst) {
        const pk = picker({
          placeholder: 'Search any coin — solana, sui, pepe…', initial: inst.tokens || DEFAULT_TOKENS,
          search: async (q) => (await getJSON('https://api.coingecko.com/api/v3/search?query=' + encodeURIComponent(q), 120000)).coins.slice(0, 8).map((c) => ({ key: c.id, label: c.name, sym: String(c.symbol).toUpperCase(), sub: '#' + (c.market_cap_rank || '–') + ' · ' + String(c.symbol).toUpperCase() })),
        });
        const v = await ui.form({ title: 'Crypto watchlist', message: 'Pick the tokens you want to follow (data: CoinGecko). The order here is the display order.', okText: 'Save', fields: [{ name: 't', type: 'custom', node: pk.el, get: pk.value }], validate: (x) => (x.t.length ? null : 'Add at least one token') });
        return v ? { tokens: v.t } : null;
      },
      build(body, inst, ctx) {
        let tab = inst.tab === 'trend' ? 'trend' : 'watch';
        const tokenList = () => (inst.tokens && inst.tokens.length ? inst.tokens : DEFAULT_TOKENS);   // read live: starring in Trending changes it
        const tabsHost = h('div'), list = h('div', { class: 'px-list' });
        const foot = h('div', { class: 'w-sub px-foot', text: 'Loading…' });
        const btn = h('button', { class: 'tb-btn', title: 'Refresh', 'aria-label': 'Refresh', html: icon('refresh', 13), onclick: () => load() });
        body.append(tabsHost, list, h('div', { class: 'px-bottom' }, foot, btn));
        let dead = false;
        const paintTabs = () => tabsHost.replaceChildren(segTabs([['watch', 'Watchlist'], ['trend', 'Trending']], tab, (k) => { tab = k; ctx.save({ tab }); paintTabs(); load(); }));
        const pct = (c) => h('span', { class: 'mono px-c ' + (c >= 0 ? 'up' : 'dn'), text: (c >= 0 ? '▲ ' : '▼ ') + Math.abs(c).toFixed(2) + '%' });
        const star = (key, sym, name) => {
          const on = (inst.tokens || DEFAULT_TOKENS).some((t) => t.key === key);
          return h('button', { class: 'tb-btn star' + (on ? ' on' : ''), title: on ? 'In watchlist' : 'Add to watchlist', 'aria-label': 'Toggle watchlist', text: on ? '★' : '☆', onclick: () => {
            const cur = (inst.tokens || DEFAULT_TOKENS).slice();
            const i = cur.findIndex((t) => t.key === key);
            if (i >= 0) cur.splice(i, 1); else cur.push({ key, label: name, sym });
            ctx.save({ tokens: cur }); inst.tokens = cur; load();
          } });
        };
        async function load() {
          foot.textContent = 'Updating…';
          try {
            if (tab === 'watch') {
              const tokens = tokenList();
              const ids = tokens.map((t) => t.key).join(',');
              const d = await getJSON('https://api.coingecko.com/api/v3/simple/price?ids=' + encodeURIComponent(ids) + '&vs_currencies=usd&include_24hr_change=true', 30000);
              if (dead) return;
              list.replaceChildren(...tokens.map((t) => { const p = d[t.key]; return h('div', { class: 'px-row', title: t.label }, h('b', { text: t.sym || t.label }), p ? h('span', { class: 'mono px-p', text: fmtUsd(p.usd) }) : h('span', { class: 'px-p', text: '—' }), p ? pct(p.usd_24h_change || 0) : h('span')); }));
            } else {
              const d = await getJSON('https://api.coingecko.com/api/v3/search/trending', 120000);
              if (dead) return;
              list.replaceChildren(...d.coins.map(({ item }) => {
                const px = item.data && item.data.price;
                const ch = item.data && item.data.price_change_percentage_24h && item.data.price_change_percentage_24h.usd;
                return h('div', { class: 'px-row tr', title: item.name }, h('b', { text: String(item.symbol).toUpperCase() }), h('span', { class: 'mono px-p', text: typeof px === 'number' ? fmtUsd(px) : '—' }), typeof ch === 'number' ? pct(ch) : h('span'), star(item.id, String(item.symbol).toUpperCase(), item.name));
              }));
            }
            foot.textContent = 'CoinGecko · ' + new Date().toLocaleTimeString();
          } catch { if (!dead) foot.textContent = 'Offline or rate-limited — tap ↻ to retry'; }
        }
        paintTabs(); load();
        const stop = every(load, 90000);
        return { destroy() { dead = true; stop(); }, refresh: load };
      },
    },
    sports: {
      name: 'Scoreboard', ico: 'activity', size: 'l', cfg: true,
      async config(inst) {
        const ck = checks(LEAGUES, inst.leagues || ['basketball/nba', 'football/nfl']);
        const custom = h('input', { class: 'input', placeholder: 'Any other ESPN path, e.g. soccer/mex.1 (sport/league)', spellcheck: false });
        const team = h('input', { class: 'input', placeholder: 'Only show games with this team (optional)', value: inst.team || '', maxLength: 40 });
        const node = h('div', { class: 'pwc' }, ck.el, field('Add another league', custom), field('Team filter', team));
        const v = await ui.form({ title: 'Scoreboard', message: 'Choose the leagues to follow (live scores from ESPN). Add any ESPN league path, or filter to your team.', okText: 'Save',
          fields: [{ name: 's', type: 'custom', node, get: () => ({ leagues: [...ck.value(), ...(validPath(custom.value.trim()) ? [custom.value.trim()] : [])], team: team.value.trim() }) }],
          validate: (x) => (x.s.leagues.length ? null : 'Pick at least one league') });
        return v ? { leagues: [...new Set(v.s.leagues)].slice(0, 12), team: v.s.team } : null;
      },
      build(body, inst) {
        const leagues = inst.leagues && inst.leagues.length ? inst.leagues : ['basketball/nba', 'football/nfl'];
        const list = h('div', { class: 'sp-list' });
        const foot = h('div', { class: 'w-sub px-foot', text: 'Loading…' });
        body.append(list, h('div', { class: 'px-bottom' }, foot, h('button', { class: 'tb-btn', title: 'Refresh', 'aria-label': 'Refresh', html: icon('refresh', 13), onclick: () => load() })));
        let dead = false, anyLive = false;
        const side = (t) => h('div', { class: 'sp-team' + (t.winner ? ' win' : '') }, t.logo ? h('img', { src: t.logo, alt: '', loading: 'lazy', referrerPolicy: 'no-referrer' }) : null, h('b', { text: t.abbr }), h('span', { class: 'mono sp-score', text: t.score == null ? '' : String(t.score) }));
        async function load() {
          foot.textContent = 'Updating…';
          const res = await Promise.allSettled(leagues.map((p) => getJSON(ESPN + p + '/scoreboard', 25000)));
          if (dead) return;
          const rows = [];
          res.forEach((r, i) => {
            if (r.status !== 'fulfilled') return;
            (r.value.events || []).forEach((ev) => {
              const c = ev.competitions && ev.competitions[0]; if (!c || !ev.status) return;
              const t = ev.status.type || {};
              const versus = (c.competitors || []).length === 2 && c.competitors.every((k) => k.homeAway);
              const mk = (ha) => { const k = c.competitors.find((x) => x.homeAway === ha) || {}, tm = k.team || {}; return { abbr: tm.abbreviation || tm.shortDisplayName || '?', name: tm.displayName || '', score: k.score, winner: !!k.winner, logo: safeHref(tm.logo) || '' }; };
              const link = (ev.links || []).find((l) => (l.rel || []).includes('summary')) || (ev.links || [])[0];
              rows.push({ lg: leagueName(leagues[i]), state: t.state, detail: t.shortDetail || t.detail || '', date: ev.date, title: ev.shortName || ev.name, versus, away: versus ? mk('away') : null, home: versus ? mk('home') : null, href: link && link.href });
            });
          });
          const q = (inst.team || '').toLowerCase();
          const shown = rows.filter((r) => !q || (r.versus ? [r.away.name, r.away.abbr, r.home.name, r.home.abbr] : [r.title]).some((x) => String(x).toLowerCase().includes(q)));
          const order = { in: 0, pre: 1, post: 2 };
          shown.sort((a, b) => (order[a.state] ?? 3) - (order[b.state] ?? 3) || new Date(a.date) - new Date(b.date));
          anyLive = shown.some((r) => r.state === 'in');
          list.replaceChildren(...(shown.length ? shown.map((r) => {
            const when = r.state === 'pre' ? ((new Date(r.date).toDateString() === new Date().toDateString() ? '' : new Date(r.date).toLocaleDateString([], { weekday: 'short' }) + ' ') + fmtClock(new Date(r.date), { h24: use24() })) : r.detail;
            const mid = h('div', { class: 'sp-mid' }, r.state === 'in' ? h('span', { class: 'live', text: '● LIVE' }) : null, h('span', { text: when }), h('i', { text: r.lg }));
            const row = r.versus ? h('div', { class: 'sp-row ' + r.state }, side(r.away), mid, side(r.home)) : h('div', { class: 'sp-row ev ' + r.state }, h('b', { text: r.title }), mid);
            if (r.href && safeHref(r.href)) { row.classList.add('lnk'); row.title = 'Open game details'; row.addEventListener('click', () => window.open(safeHref(r.href), '_blank', 'noopener,noreferrer')); }
            return row;
          }) : [status(res.every((r) => r.status === 'rejected') ? 'Offline or ESPN unavailable — tap ↻' : 'No games today for ' + leagues.map(leagueName).join(', ') + (q ? ' matching “' + inst.team + '”' : ''))]));
          foot.textContent = 'ESPN · ' + new Date().toLocaleTimeString() + (anyLive ? ' · live' : '');
        }
        load();
        const stop = every(() => load(), 45000);
        return { destroy() { dead = true; stop(); }, refresh: load };
      },
    },
    news: {
      name: 'Headlines', ico: 'text', size: 'l', cfg: true,
      async config(inst) {
        const base = [['world', 'World headlines (Wikipedia)'], ['trending', 'Trending on Wikipedia'], ['tech', 'Tech (Hacker News)']];
        const all = [...base, ...LEAGUES.map(([k, l]) => ['espn:' + k, l + ' news (ESPN)'])];
        const ck = checks(all, inst.sources || ['world', 'tech']);
        const v = await ui.form({ title: 'Headlines', message: 'Choose up to 4 sources — each becomes a tab. All are public feeds that need no account.', okText: 'Save', fields: [{ name: 's', type: 'custom', node: h('div', { class: 'pwc' }, ck.el), get: ck.value }],
          validate: (x) => (!x.s.length ? 'Pick at least one source' : x.s.length > 4 ? 'Pick at most 4 sources' : null) });
        return v ? { sources: v.s } : null;
      },
      build(body, inst, ctx) {
        const sources = (inst.sources && inst.sources.length ? inst.sources : ['world', 'tech']).slice(0, 4);
        const label = (k) => (k === 'world' ? 'World' : k === 'trending' ? 'Trending' : k === 'tech' ? 'Tech' : leagueName(k.slice(5)));
        let cur = sources[0];
        const tabsHost = h('div'), list = h('div', { class: 'nw-list' });
        const foot = h('div', { class: 'w-sub px-foot', text: 'Loading…' });
        body.append(tabsHost, list, h('div', { class: 'px-bottom' }, foot, h('button', { class: 'tb-btn', title: 'Refresh', 'aria-label': 'Refresh', html: icon('refresh', 13), onclick: () => load() })));
        let dead = false;
        const paintTabs = () => tabsHost.replaceChildren(segTabs(sources.map((k) => [k, label(k)]), cur, (k) => { cur = k; paintTabs(); load(); }));
        const wiki = async (kind) => {
          for (let back = 0; back < 3; back++) {
            const d = new Date(Date.now() - back * 864e5);
            const j = await getJSON('https://en.wikipedia.org/api/rest_v1/feed/featured/' + d.getUTCFullYear() + '/' + pad2(d.getUTCMonth() + 1) + '/' + pad2(d.getUTCDate()), 300000);
            if (kind === 'world' && j.news && j.news.length) return j.news.map((n) => ({ title: plain(n.story), href: n.links && n.links[0] ? 'https://en.wikipedia.org/wiki/' + encodeURIComponent((n.links[0].titles && n.links[0].titles.canonical) || '') : '', meta: 'Wikipedia · In the news' }));
            if (kind === 'trending' && j.mostread && j.mostread.articles) return j.mostread.articles.filter((a) => !/^(Main_Page|Special:|Wikipedia:|Portal:)/.test(a.title)).slice(0, 20).map((a) => ({ title: (a.titles && a.titles.normalized) || a.title, href: 'https://en.wikipedia.org/wiki/' + encodeURIComponent(a.title), meta: Number(a.views).toLocaleString() + ' views · ' + plain(a.description || '') }));
          }
          return [];
        };
        const fetchers = {
          world: () => wiki('world'), trending: () => wiki('trending'),
          async tech() {
            const ids = (await getJSON('https://hacker-news.firebaseio.com/v0/topstories.json', 120000)).slice(0, 15);
            const items = await Promise.all(ids.map((id) => getJSON('https://hacker-news.firebaseio.com/v0/item/' + id + '.json', 300000).catch(() => null)));
            return items.filter((x) => x && x.title).map((x) => ({ title: x.title, href: x.url || 'https://news.ycombinator.com/item?id=' + x.id, meta: x.score + ' pts · ' + x.by + ' · Hacker News' }));
          },
          async espn(path) { const j = await getJSON(ESPN + path + '/news?limit=15', 120000); return (j.articles || []).map((a) => ({ title: a.headline, href: a.links && a.links.web && a.links.web.href, meta: 'ESPN · ' + (a.published ? ago(a.published) : '') })); },
        };
        async function load() {
          foot.textContent = 'Updating…';
          try {
            const items = cur.startsWith('espn:') ? await fetchers.espn(cur.slice(5)) : await fetchers[cur]();
            if (dead) return;
            list.replaceChildren(...(items.length ? items.map((it) => h('div', { class: 'nw-item' }, anchor(it.title, it.href, 'nw-t'), h('div', { class: 'w-sub', text: it.meta }))) : [status('No headlines right now')]));
            foot.textContent = new Date().toLocaleTimeString();
          } catch { if (!dead) foot.textContent = 'Offline or feed unavailable — tap ↻'; }
        }
        paintTabs(); load();
        const stop = every(load, 300000);
        return { destroy() { dead = true; stop(); }, refresh: load };
      },
    },
    markets: {
      name: 'Prediction markets', ico: 'trending', size: 'l', cfg: true,
      async config(inst) {
        const pk = picker({
          placeholder: 'Search markets — election, bitcoin, NBA, fed…', initial: inst.watch || [], max: 20,
          search: async (q) => {
            const j = await getJSON(PM + '/public-search?q=' + encodeURIComponent(q) + '&limit_per_type=6', 60000);
            return (j.events || []).flatMap((e) => (e.markets || []).filter((m) => m.active !== false && !m.closed).slice(0, 3)).map((m) => { let pr = []; try { pr = JSON.parse(m.outcomePrices); } catch { /* ignore */ } return { key: String(m.id), label: String(m.question).slice(0, 140), sub: pr.length ? Math.round(pr[0] * 100) + '%' : '' }; });
          },
        });
        const v = await ui.form({ title: 'Market watchlist', message: 'Search Polymarket and add the markets you want to track. You can also star markets directly from the Trending tab.', okText: 'Save', fields: [{ name: 'w', type: 'custom', node: pk.el, get: pk.value }] });
        return v ? { watch: v.w } : null;
      },
      build(body, inst, ctx) {
        let tab = inst.tab === 'watch' ? 'watch' : 'trend';
        const tabsHost = h('div'), list = h('div', { class: 'mk-list' });
        const foot = h('div', { class: 'w-sub px-foot', text: 'Loading…' });
        body.append(tabsHost, list, h('div', { class: 'px-bottom' }, foot, h('button', { class: 'tb-btn', title: 'Refresh', 'aria-label': 'Refresh', html: icon('refresh', 13), onclick: () => load() })), h('div', { class: 'w-sub mk-note', text: 'Polymarket odds = market-implied probability. Informational only.' }));
        let dead = false;
        const paintTabs = () => tabsHost.replaceChildren(segTabs([['trend', 'Trending'], ['watch', 'Watchlist']], tab, (k) => { tab = k; ctx.save({ tab }); paintTabs(); load(); }));
        const parse = (m) => { let outs = [], pr = []; try { outs = JSON.parse(m.outcomes); pr = JSON.parse(m.outcomePrices); } catch { /* ignore */ } return { id: String(m.id), q: m.question, ev: (m.events && m.events[0] && m.events[0].slug) || '', outs, pr: pr.map(Number), vol: +m.volume24hr || 0, chg: +m.oneDayPriceChange || 0 }; };
        const isWatched = (id) => (inst.watch || []).some((w) => w.key === id);
        const row = (m) => {
          const p = m.pr[0], pct = Number.isFinite(p) ? Math.round(p * 100) : null;
          const star = h('button', { class: 'tb-btn star' + (isWatched(m.id) ? ' on' : ''), title: isWatched(m.id) ? 'In watchlist' : 'Add to watchlist', 'aria-label': 'Toggle watchlist', text: isWatched(m.id) ? '★' : '☆', onclick: (e) => {
            e.stopPropagation();
            const cur = (inst.watch || []).slice(); const i = cur.findIndex((w) => w.key === m.id);
            if (i >= 0) cur.splice(i, 1); else cur.push({ key: m.id, label: String(m.q).slice(0, 140) });
            inst.watch = cur; ctx.save({ watch: cur }); star.textContent = i >= 0 ? '☆' : '★'; star.classList.toggle('on', i < 0);
          } });
          const el = h('div', { class: 'mk-row lnk' }, h('div', { class: 'mk-top' }, anchor(m.q, m.ev ? 'https://polymarket.com/event/' + m.ev : 'https://polymarket.com/markets', 'mk-q'), star),
            h('div', { class: 'mk-bar' }, h('i', { style: { width: (pct == null ? 0 : pct) + '%' } }), h('span', { class: 'mono', text: pct == null ? '—' : (m.outs[0] || 'Yes') + ' ' + pct + '%' })),
            h('div', { class: 'w-sub mk-meta' }, h('span', { text: 'Vol 24h ' + fmtBig(m.vol) }), Math.abs(m.chg) > 0.0005 ? h('span', { class: 'mono ' + (m.chg >= 0 ? 'up' : 'dn'), text: (m.chg >= 0 ? '▲ ' : '▼ ') + Math.abs(m.chg * 100).toFixed(1) + ' pts' }) : null));
          return el;
        };
        async function load() {
          foot.textContent = 'Updating…';
          try {
            let rows;
            if (tab === 'trend') rows = (await getJSON(PM + '/markets?limit=25&active=true&closed=false&order=volume24hr&ascending=false', 60000)).map(parse);
            else {
              const ids = (inst.watch || []).map((w) => w.key);
              if (!ids.length) { if (!dead) { list.replaceChildren(status('Your watchlist is empty — star markets in Trending, or use ⚙ to search.')); foot.textContent = ''; } return; }
              rows = (await getJSON(PM + '/markets?' + ids.map((i) => 'id=' + encodeURIComponent(i)).join('&'), 30000)).map(parse);
              rows.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
            }
            if (dead) return;
            list.replaceChildren(...(rows.length ? rows.map(row) : [status('No markets found')]));
            foot.textContent = 'Polymarket · ' + new Date().toLocaleTimeString();
          } catch { if (!dead) foot.textContent = 'Offline or unavailable — tap ↻'; }
        }
        paintTabs(); load();
        const stop = every(load, 60000);
        return { destroy() { dead = true; stop(); }, refresh: load };
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

    todo: {
      name: 'To-do', ico: 'check', size: 'm', private: true,
      build(body, inst, ctx) {
        inst.items = Array.isArray(inst.items) ? inst.items : [];
        const list = h('div', { class: 'td-list w-nodrag' });
        const input = h('input', { class: 'input sm w-nodrag', placeholder: 'Add a task and press Enter', maxLength: 120, 'aria-label': 'New task' });
        const persist = () => ctx.save({ items: inst.items });
        const paint = () => {
          const left = inst.items.filter((i) => !i.d).length;
          list.replaceChildren(...(inst.items.length ? inst.items.map((it, idx) => h('label', { class: 'td-item' + (it.d ? ' done' : '') },
            h('input', { type: 'checkbox', checked: !!it.d, onchange: (e) => { it.d = e.target.checked; persist(); paint(); } }),
            h('span', { text: it.t }),
            h('button', { class: 'td-x', 'aria-label': 'Delete task', title: 'Delete', html: icon('x', 11), onclick: (e) => { e.preventDefault(); inst.items.splice(idx, 1); persist(); paint(); } }))) : [h('div', { class: 'w-sub', text: 'Nothing to do — enjoy the quiet.' })]));
          foot.textContent = inst.items.length ? left + ' left · ' + (inst.items.length - left) + ' done' : '';
        };
        const foot = h('div', { class: 'w-sub' });
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && input.value.trim() && inst.items.length < 30) { inst.items.unshift({ t: input.value.trim().slice(0, 120), d: false }); input.value = ''; persist(); paint(); } });
        body.append(input, list, h('div', { class: 'td-foot' }, foot, h('button', { class: 'btn sm w-nodrag', text: 'Clear done', onclick: () => { inst.items = inst.items.filter((i) => !i.d); persist(); paint(); } })));
        paint();
        return {};
      },
    },
    world: {
      name: 'World clocks', ico: 'clock', size: 'l', cfg: true,
      async config(inst) {
        const v = await ui.form({ title: 'World clocks', message: 'Up to 6 time zones, separated by commas — e.g. America/New_York, Europe/London, Asia/Tokyo, Australia/Sydney.', fields: [{ name: 'z', label: 'Time zones', value: (inst.zones || DEFAULT_ZONES).join(', ') }], okText: 'Save', validate: (x) => { const l = x.z.split(',').map((t) => t.trim()).filter(Boolean); return l.length && l.length <= 6 && l.every(validZone) ? null : 'Use valid names like Europe/Paris (max 6)'; } });
        return v ? { zones: v.z.split(',').map((t) => t.trim()).filter(Boolean) } : null;
      },
      build(body, inst) {
        const zones = inst.zones && inst.zones.length ? inst.zones : DEFAULT_ZONES;
        const rows = zones.map((z) => { const t = h('b', { class: 'mono' }), d = h('span', { class: 'w-sub' }); return { z, t, d, el: h('div', { class: 'wc-row' }, h('div', {}, h('div', { text: z.split('/').pop().replace(/_/g, ' ') }), d), t) }; });
        body.append(h('div', { class: 'wc-list' }, rows.map((r) => r.el)));
        const update = () => {
          const now = new Date(), h12 = SETTINGS().get('clockFormat') !== '24';
          rows.forEach((r) => {
            try {
              r.t.textContent = new Intl.DateTimeFormat([], { timeZone: r.z, hour: '2-digit', minute: '2-digit', hour12: h12 }).format(now);
              const day = new Intl.DateTimeFormat('en-CA', { timeZone: r.z }).format(now), mine = new Intl.DateTimeFormat('en-CA').format(now);
              r.d.textContent = day === mine ? 'Today' : day > mine ? 'Tomorrow' : 'Yesterday';
            } catch { r.t.textContent = '—'; }
          });
        };
        update();
        return { update };
      },
    },
    moon: {
      name: 'Moon', ico: 'sparkles', size: 's',
      build(body) {
        const face = h('div', { class: 'mn-face' }), name = h('div', { class: 'w-time mn-name' }), sub = h('div', { class: 'w-sub' }), nxt = h('div', { class: 'w-sub' });
        body.classList.add('w-center'); body.append(face, name, sub, nxt);
        const update = () => {
          const SYN = 29.530588853, ref = Date.UTC(2000, 0, 6, 18, 14) / 864e5;
          const age = (((Date.now() / 864e5 - ref) % SYN) + SYN) % SYN, ill = (1 - Math.cos((2 * Math.PI * age) / SYN)) / 2;
          const idx = Math.floor((age / SYN) * 8 + 0.5) % 8;
          face.textContent = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'][idx];
          name.textContent = ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'][idx];
          sub.textContent = Math.round(ill * 100) + '% lit · day ' + Math.floor(age + 1);
          const toFull = (SYN / 2 - age + SYN) % SYN, toNew = (SYN - age) % SYN;
          nxt.textContent = 'Full in ' + Math.round(toFull) + ' d · New in ' + Math.round(toNew) + ' d';
        };
        update();
        return { update };
      },
    },
    device: {
      name: 'Device', ico: 'cpu', size: 'm',
      build(body) {
        const rows = {};
        const row = (k, label) => { const v = h('b', { class: 'mono' }); rows[k] = v; return h('div', { class: 'dv-row' }, h('span', { class: 'sys-l', text: label }), v); };
        const bar = h('div', { class: 'stor-bar' }, h('i'));
        body.append(row('bat', 'Battery'), bar, row('net', 'Network'), row('cpu', 'CPU cores'), row('mem', 'Memory'), row('scr', 'Screen'));
        let battery = null;
        const update = () => {
          if (battery) { rows.bat.textContent = Math.round(battery.level * 100) + '%' + (battery.charging ? ' ⚡ charging' : ''); bar.firstChild.style.width = battery.level * 100 + '%'; }
          else { rows.bat.textContent = navigator.getBattery ? '…' : 'not available'; bar.hidden = !battery; }
          const c = navigator.connection;
          rows.net.textContent = (navigator.onLine ? 'online' : 'offline') + (c && c.effectiveType ? ' · ' + c.effectiveType + (c.downlink ? ' · ' + c.downlink + ' Mbps' : '') : '');
          rows.cpu.textContent = navigator.hardwareConcurrency ? String(navigator.hardwareConcurrency) : 'n/a';
          rows.mem.textContent = navigator.deviceMemory ? '≥ ' + navigator.deviceMemory + ' GB' : 'n/a';
          rows.scr.textContent = screen.width + '×' + screen.height + ' @' + (devicePixelRatio || 1) + 'x';
        };
        navigator.getBattery?.().then((b) => { battery = b; bar.hidden = false; update(); ['levelchange', 'chargingchange'].forEach((e) => b.addEventListener(e, update)); }).catch(() => {});
        update();
        return { update };
      },
    },
    weather: {
      name: 'Weather', ico: 'globe', size: 'm', cfg: true,
      async config(inst) {
        const v = await ui.form({ title: 'Weather', message: 'Search for a city (data from Open-Meteo, no account or key needed).', fields: [{ name: 'city', label: 'City', value: inst.city ? inst.city.name : '' }, { name: 'unit', label: 'Units', type: 'select', value: inst.unit || 'c', options: [{ value: 'c', label: '°C · km/h' }, { value: 'f', label: '°F · mph' }] }], okText: 'Find', validate: (x) => (x.city.trim().length >= 2 ? null : 'Enter a city name') });
        if (!v) return null;
        try {
          const r = await fetch('https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=' + encodeURIComponent(v.city.trim()));
          const j = await r.json(); const c = j.results && j.results[0];
          if (!c) { ui.toast('No city found for “' + v.city.trim() + '”', { type: 'err' }); return null; }
          return { city: { name: String(c.name).slice(0, 60) + (c.country_code ? ', ' + c.country_code : ''), lat: +c.latitude, lon: +c.longitude }, unit: v.unit };
        } catch { ui.toast('Could not reach the weather service', { type: 'err' }); return null; }
      },
      build(body, inst, ctx) {
        const head = h('div', { class: 'wx-now' }), days = h('div', { class: 'wx-days' }), foot = h('div', { class: 'w-sub' });
        const setup = h('button', { class: 'btn sm primary w-nodrag', text: 'Choose a city…', onclick: () => W.configure(inst.id) });
        body.append(head, days, foot);
        const CODES = { 0: ['☀️', 'Clear'], 1: ['🌤️', 'Mostly clear'], 2: ['⛅', 'Partly cloudy'], 3: ['☁️', 'Overcast'], 45: ['🌫️', 'Fog'], 48: ['🌫️', 'Rime fog'], 51: ['🌦️', 'Light drizzle'], 53: ['🌦️', 'Drizzle'], 55: ['🌧️', 'Heavy drizzle'], 61: ['🌧️', 'Light rain'], 63: ['🌧️', 'Rain'], 65: ['🌧️', 'Heavy rain'], 71: ['🌨️', 'Light snow'], 73: ['🌨️', 'Snow'], 75: ['❄️', 'Heavy snow'], 80: ['🌦️', 'Showers'], 81: ['🌧️', 'Showers'], 82: ['⛈️', 'Violent showers'], 95: ['⛈️', 'Thunderstorm'], 96: ['⛈️', 'Thunderstorm, hail'], 99: ['⛈️', 'Thunderstorm, hail'] };
        const code = (c) => CODES[c] || CODES[Math.floor(c / 10) * 10] || ['🌡️', 'Weather'];
        let timer = 0, dead = false;
        async function load() {
          if (!inst.city) { head.replaceChildren(h('div', { class: 'w-sub', text: 'Show the weather for your city.' }), setup); days.replaceChildren(); foot.textContent = ''; return; }
          const f = inst.unit === 'f';
          try {
            const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + inst.city.lat + '&longitude=' + inst.city.lon + '&current=temperature_2m,weather_code,wind_speed_10m,apparent_temperature&daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=5&timezone=auto' + (f ? '&temperature_unit=fahrenheit&wind_speed_unit=mph' : '');
            const j = await (await fetch(url)).json(); if (dead) return;
            const [em, tx] = code(j.current.weather_code), u = f ? '°F' : '°C';
            head.replaceChildren(h('div', { class: 'wx-big' }, h('span', { class: 'wx-em', text: em }), h('b', { text: Math.round(j.current.temperature_2m) + u })), h('div', {}, h('div', { text: tx }), h('div', { class: 'w-sub', text: inst.city.name + ' · feels ' + Math.round(j.current.apparent_temperature) + u + ' · wind ' + Math.round(j.current.wind_speed_10m) + (f ? ' mph' : ' km/h') })));
            days.replaceChildren(...j.daily.time.map((d, i) => h('div', { class: 'wx-day' }, h('span', { text: new Date(d + 'T12:00').toLocaleDateString([], { weekday: 'short' }) }), h('span', { class: 'wx-em', text: code(j.daily.weather_code[i])[0] }), h('b', { text: Math.round(j.daily.temperature_2m_max[i]) + '°' }), h('span', { class: 'w-sub', text: Math.round(j.daily.temperature_2m_min[i]) + '°' }))));
            foot.textContent = 'Open-Meteo · ' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
          } catch { if (!dead) foot.textContent = 'Could not load the forecast (offline?)'; }
        }
        load(); timer = setInterval(load, 15 * 60000);
        return { refresh: load, destroy() { dead = true; clearInterval(timer); } };
      },
    },
  };
  W.types = TYPES;

  /* ---------------- instances ---------------- */
  /* Widget themes: [name, colour 1, colour 2]. "auto" keeps each widget type's own palette. */
  const THEMES = [['auto', 'Per widget (default)'], ['ocean', 'Ocean', '#0ea5e9', '#6366f1'], ['sunset', 'Sunset', '#fb7185', '#f59e0b'], ['forest', 'Forest', '#22c55e', '#14b8a6'], ['violet', 'Violet', '#8b5cf6', '#ec4899'], ['aurora', 'Aurora', '#34d399', '#8b5cf6'], ['ember', 'Ember', '#f97316', '#dc2626'], ['sakura', 'Sakura', '#f9a8d4', '#c084fc'], ['mono', 'Graphite', '#94a3b8', '#475569']];
  W.themes = THEMES;
  const HEXC = /^#[0-9a-f]{6}$/i;
  const themeCols = (t) => {
    if (typeof t === 'string' && t.startsWith('c:')) { const [a, b] = t.slice(2).split(','); return HEXC.test(a) && HEXC.test(b) ? [a, b] : null; }
    const e = THEMES.find((x) => x[0] === t && x.length > 2); return e ? [e[2], e[3]] : null;
  };
  const themeSan = (t) => (typeof t === 'string' && (THEMES.some((x) => x[0] === t) || (t.startsWith('c:') && themeCols(t))) ? t : undefined);
  const effTheme = (i) => i.theme || SETTINGS().get('widgetTheme') || 'auto';
  function paintTheme(i, el) {
    const c = themeCols(effTheme(i));
    if (c) { el.style.setProperty('--w1', c[0]); el.style.setProperty('--w2', c[1]); } else { el.style.removeProperty('--w1'); el.style.removeProperty('--w2'); }
    el.classList.toggle('pinned', !!i.pin);
    const b = el.querySelector('.w-pin'); if (b) { b.classList.toggle('on', !!i.pin); b.title = i.pin ? 'Pinned in place — click to unpin' : 'Pin in place'; b.setAttribute('aria-pressed', i.pin ? 'true' : 'false'); }
  }
  const miscSan = (r) => ({ ...(r.pin ? { pin: true } : {}), ...(themeSan(r.theme) ? { theme: themeSan(r.theme) } : {}) });
  const miscOf = (i) => ({ ...(i.pin ? { pin: true } : {}), ...(i.theme ? { theme: i.theme } : {}) });
  const MINW = 168, MINH = 120, MAXW = 900, MAXH = 900;
  /** width/height of an instance: free-form if the user resized it, else the preset */
  const dim = (i) => [i.w || SIZES[i.size][0], i.h || SIZES[i.size][1]];
  const sizeOf = (r) => (Number.isFinite(+r.w) && Number.isFinite(+r.h) && r.w && r.h ? { w: clamp(Math.round(+r.w), MINW, MAXW), h: clamp(Math.round(+r.h), MINH, MAXH) } : {});
  // (anchors are read with anchorSan(r))
  /** Where a widget sits is remembered relative to its NEAREST screen edges (like a phone's home screen), so a widget
      on the right stays on the right when the window is resized instead of floating toward the middle. */
  const anchorOf = (i) => (i.ax ? { ax: i.ax, ox: i.ox, ay: i.ay, oy: i.oy } : {});
  const anchorSan = (r) => (['l', 'r'].includes(r.ax) && ['t', 'b'].includes(r.ay) && Number.isFinite(+r.ox) && Number.isFinite(+r.oy) ? { ax: r.ax, ay: r.ay, ox: clamp(Math.round(+r.ox), 0, 6000), oy: clamp(Math.round(+r.oy), 0, 6000) } : {});
  function setAnchor(i, x, y, w, hh) {
    const a = area(), right = a.w - (x + w), bottom = a.h - (y + hh);
    i.x = x; i.y = y;
    i.ax = right < x ? 'r' : 'l'; i.ox = Math.max(0, Math.round(i.ax === 'r' ? right : x));
    i.ay = bottom < y ? 'b' : 't'; i.oy = Math.max(0, Math.round(i.ay === 'b' ? bottom : y));
  }
  /** preferred top-left for an instance of size w × hh in the current area */
  function posOf(i, w, hh) {
    const a = area();
    if (!i.ax) setAnchor(i, clamp(i.x, 0, Math.max(0, a.w - w)), clamp(i.y, 0, Math.max(0, a.h - hh)), w, hh);   // saved before anchors existed
    return [i.ax === 'r' ? a.w - w - i.ox : i.ox, i.ay === 'b' ? a.h - hh - i.oy : i.oy];
  }
  const bucket = (w, hh) => (hh >= 440 ? 'x' : hh >= 300 ? 'l' : w >= 300 ? 'm' : 's');
  const uid = () => 'wg_' + Math.random().toString(36).slice(2, 9);
  const area = () => ({ w: layer ? layer.clientWidth : window.innerWidth, h: layer ? layer.clientHeight : window.innerHeight });
  const cfgOf = (i) => { const o = {}; ['tokens', 'watch', 'leagues', 'sources', 'team', 'tab', 'zones', 'city', 'unit'].forEach((k) => { if (i[k] !== undefined) o[k] = i[k]; }); return o; };
  const persist = () => store.set('ulyos.widgets', { v: 1, list: insts.map((i) => ({ id: i.id, type: i.type, size: i.size, x: i.x, y: i.y, ...anchorOf(i), ...miscOf(i), ...(i.w ? { w: i.w, h: i.h } : {}), ...cfgOf(i), ...(i.type === 'notes' ? { text: i.text } : {}), ...(i.type === 'todo' ? { items: i.items || [] } : {}) })) });
  const save = debounce(persist, 200);

  const iconBlocks = () => {
    const cw = parseFloat(css('--cell-w')) || 100, ch = parseFloat(css('--cell-h')) || 110, pad = (ulyOS.Desktop && ulyOS.Desktop.pad) || 16;
    return ((ulyOS.Desktop && ulyOS.Desktop.icons) || []).filter((i) => i.col != null).map((i) => ({ x: pad + i.col * cw, y: pad + i.row * ch, w: cw, h: ch }));
  };
  const overlaps = (blocks, x, y, w, hh) => blocks.some((b) => x < b.x + b.w && x + w > b.x && y < b.y + b.h && y + hh > b.y);
  /** The free rectangle (inside the area, clear of icons and the blocks given) closest to the wanted top-left. */
  function nearestSpot(wantX, wantY, w, hh, blocks) {
    const a = area(); let best = null, bd = Infinity;
    const maxX = a.w - w, maxY = a.h - hh;
    if (maxX < 0 || maxY < 0) return null;
    const xs = [clamp(wantX, 0, maxX)], ys = [clamp(wantY, 0, maxY)];
    for (let x = 0; x <= maxX; x += 16) xs.push(x); xs.push(maxX);
    for (let y = 0; y <= maxY; y += 16) ys.push(y); ys.push(maxY);
    for (const x of xs) for (const y of ys) {
      const d = 2.5 * Math.abs(x - wantX) + Math.abs(y - wantY);   // prefer staying in the same column
      if (d < bd && !overlaps(blocks, x, y, w, hh)) { bd = d; best = { x, y }; }
    }
    return best;
  }
  function freeSpot(size) {
    const [w, hh] = SIZES[size], a = area();
    const blocks = [...iconBlocks(), ...insts.map((i) => { const [iw, ih] = dim(i); const [px, py] = posOf(i, iw, ih); return { x: px, y: py, w: iw, h: ih }; })];
    const sp = nearestSpot(a.w - w - 24, 16, w, hh, blocks);   // start at the top right, like the previous widgets
    return sp || { x: clamp(a.w - w - 24, 0, a.w), y: 16 + (insts.length % 5) * 24 };   // screen is full: stack with an offset
  }

  function mount(inst) {
    const T = TYPES[inst.type];
    const [w, hh] = dim(inst);
    const body = h('div', { class: 'w-body sz-' + inst.size });
    const ctx = { save: (patch) => { Object.assign(inst, patch); save(); } };
    const head = h('div', { class: 'w-head' }, h('span', { class: 'w-ico', html: icon(T.ico, 13) }), h('span', { class: 'w-title', text: T.name }),
      T.speak && ulyOS.Speech && ulyOS.Speech.supported ? h('button', { class: 'w-speak', 'aria-label': 'Read aloud', title: 'Read aloud', html: icon('volume', 12), onclick: () => ulyOS.Speech.speak(T.speak(inst)) }) : null,
      T.config ? h('button', { class: 'w-x w-cfg', 'aria-label': 'Configure widget', title: 'Configure', html: icon('settings', 12), onclick: () => W.configure(inst.id) }) : null,
      h('button', { class: 'w-pin', 'aria-label': 'Pin in place', title: 'Pin in place', html: icon('pin', 12), onclick: () => W.setPin(inst.id, !inst.pin) }),
      h('button', { class: 'w-x', 'aria-label': 'Remove widget', title: 'Remove', html: icon('x', 12), onclick: () => W.remove(inst.id) }));
    const grip = h('div', { class: 'w-rz w-nodrag', title: 'Drag to resize', 'aria-label': 'Resize widget' });
    const el = h('section', { class: 'wgt wgt-' + inst.type, dataset: { id: inst.id }, style: { width: w + 'px', height: hh + 'px', left: inst.x + 'px', top: inst.y + 'px' } }, head, body, grip);
    grip.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || document.body.classList.contains('compact') || inst.pin) return;
      e.preventDefault(); e.stopPropagation();
      const sx = e.clientX, sy = e.clientY, [ow, oh] = [el.offsetWidth, el.offsetHeight];
      inst.x = el.offsetLeft; inst.y = el.offsetTop;   // continue from where it is shown
      try { grip.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      el.classList.add('resizing'); WM.setIframesInert(true);
      const mv = (ev) => {
        const a = area();
        const nw = clamp(Math.round((ow + ev.clientX - sx) / 8) * 8, MINW, Math.min(MAXW, a.w)), nh = clamp(Math.round((oh + ev.clientY - sy) / 8) * 8, MINH, Math.min(MAXH, a.h));
        inst.w = nw; inst.h = nh; el.style.width = nw + 'px'; el.style.height = nh + 'px';
        // at the screen edge the widget grows toward the middle instead of stopping
        if (inst.x + nw > a.w) { inst.x = Math.max(0, a.w - nw); el.style.left = inst.x + 'px'; }
        if (inst.y + nh > a.h) { inst.y = Math.max(0, a.h - nh); el.style.top = inst.y + 'px'; }
        const b = bucket(nw, nh);
        if (b !== inst.size) { inst.size = b; body.className = 'w-body sz-' + b; live.get(inst.id)?.update?.(); }
      };
      const up = () => {
        grip.removeEventListener('pointermove', mv); grip.removeEventListener('pointerup', up); grip.removeEventListener('pointercancel', up);
        try { grip.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
        el.classList.remove('resizing'); WM.setIframesInert(false);
        setAnchor(inst, el.offsetLeft, el.offsetTop, el.offsetWidth, el.offsetHeight); save(); relayout();
      };
      grip.addEventListener('pointermove', mv); grip.addEventListener('pointerup', up); grip.addEventListener('pointercancel', up);
    });
    layer.append(el);
    paintTheme(inst, el);
    const api = T.build(body, inst, ctx) || {};
    api.update?.();
    live.set(inst.id, { el, ...api });

    el.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); ui.contextMenu(e.clientX, e.clientY, itemMenu(inst)); });
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || document.body.classList.contains('compact') || inst.pin || e.target.closest('button,input,textarea,select,a,canvas,.w-nodrag')) return;
      const sx = e.clientX, sy = e.clientY, ox = el.offsetLeft, oy = el.offsetTop;
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
        if (moved) { el.classList.remove('dragging'); WM.setIframesInert(false); setAnchor(inst, el.offsetLeft, el.offsetTop, el.offsetWidth, el.offsetHeight); save(); relayout(); }
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
    { const [iw, ih] = dim(inst); setAnchor(inst, inst.x, inst.y, iw, ih); }
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
    unmount(id); inst.size = size; delete inst.w; delete inst.h;
    const a = area(), [w, hh] = SIZES[size];
    { const l = live.get(id); const cx = l ? l.el.offsetLeft : inst.x, cy = l ? l.el.offsetTop : inst.y; setAnchor(inst, clamp(cx, 0, Math.max(0, a.w - w)), clamp(cy, 0, Math.max(0, a.h - hh)), w, hh); }
    mount(inst); save(); relayout();
  };
  W.setPin = function (id, on) {
    const inst = insts.find((x) => x.id === id), l = live.get(id);
    if (!inst) return;
    if (on) { const el = l && l.el; if (el) setAnchor(inst, el.offsetLeft, el.offsetTop, el.offsetWidth, el.offsetHeight); inst.pin = true; } else delete inst.pin;
    if (l) paintTheme(inst, l.el);
    persist(); relayout(); bus.emit('widgets:change');
    ulyOS.audit("Widget '" + TYPES[inst.type].name + "' " + (on ? 'pinned in place' : 'unpinned'), 'info');
  };
  W.setTheme = function (id, theme) {
    const inst = insts.find((x) => x.id === id), l = live.get(id);
    if (!inst) return;
    const t = themeSan(theme); if (t && t !== 'auto') inst.theme = t; else delete inst.theme;
    if (l) paintTheme(inst, l.el);
    persist();
  };
  W.restyle = () => insts.forEach((i) => { const l = live.get(i.id); if (l) paintTheme(i, l.el); });
  W.rebuild = function (id) {
    const inst = insts.find((x) => x.id === id);
    if (!inst) return;
    unmount(id); mount(inst);
  };
  W.configure = async function (id) {
    const inst = insts.find((x) => x.id === id);
    if (!inst || !TYPES[inst.type].config) return;
    const patch = await TYPES[inst.type].config(inst);
    if (!patch) return;
    Object.assign(inst, patch); save(); W.rebuild(id);
    ulyOS.audit("Widget '" + TYPES[inst.type].name + "' reconfigured", 'info');
  };
  W.clear = function () { [...insts].forEach((i) => W.remove(i.id)); };
  W.list = () => insts.map((i) => ({ ...i }));

  function itemMenu(inst) {
    const T = TYPES[inst.type];
    return [
      { label: T.name, icon: T.ico, disabled: true },
      { separator: true },
      T.config ? { label: 'Configure…', icon: 'settings', action: () => W.configure(inst.id) } : null,
      { label: inst.pin ? 'Unpin' : 'Pin in place', icon: 'pin', action: () => W.setPin(inst.id, !inst.pin) },
      { label: 'Theme', icon: 'palette', submenu: [
        ...THEMES.map((t) => ({ label: ((inst.theme || 'auto') === t[0] ? '✓ ' : '    ') + (t[0] === 'auto' ? 'Default (follow settings)' : t[1]), action: () => W.setTheme(inst.id, t[0]) })),
        { separator: true }, { label: 'Custom colors…', action: async () => {
          const v = await ui.form({ title: 'Widget colors', message: 'Two hex colors make the gradient, e.g. #38bdf8 and #8b5cf6.', fields: [{ name: 'a', label: 'Color 1', value: '#38bdf8' }, { name: 'b', label: 'Color 2', value: '#8b5cf6' }], okText: 'Apply', validate: (x) => (HEXC.test((x.a || '').trim()) && HEXC.test((x.b || '').trim()) ? null : 'Use six-digit hex colors like #38bdf8') });
          if (v) W.setTheme(inst.id, 'c:' + v.a.trim() + ',' + v.b.trim());
        } }] },
      { label: 'Size', icon: 'grid', submenu: Object.keys(SIZES).map((s) => ({ label: (inst.size === s ? '✓ ' : '    ') + SIZE_LABEL[s], action: () => W.setSize(inst.id, s) })) },
      live.get(inst.id)?.refresh ? { label: 'Refresh now', icon: 'refresh', action: () => live.get(inst.id)?.refresh?.() } : null,
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
      H.row('Widget theme', 'Colors for all widgets. Right-click a widget → Theme to override just that one; the pin button keeps a widget exactly where it is', H.choose('widgetTheme', THEMES.map((t) => [t[0], t[1]]))),
      h('div', { class: 'set-tools' }, Object.entries(TYPES).map(([k, T]) => h('button', { class: 'btn sm', html: icon(T.ico, 14) + ' ' + T.name, onclick: () => { W.add(k); paint(); } }))),
      list,
      h('div', { class: 'set-desc', text: 'Drag a widget to move it; right-click for size and removal. Crypto prices call the public CoinGecko API (only while that widget exists).' }));
  };
  W.exportList = () => insts.map((i) => ({ type: i.type, size: i.size, x: i.x, y: i.y, ...anchorOf(i), ...miscOf(i), ...(i.w ? { w: i.w, h: i.h } : {}), ...cfgOf(i) }));
  W.importList = function (list) {
    if (!Array.isArray(list)) return;
    W.clear();
    list.slice(0, MAX).forEach((r) => {
      if (!r || !TYPES[r.type] || !SIZES[r.size]) return;
      const inst = { id: uid(), type: r.type, size: r.size, x: clamp(Math.round(+r.x) || 0, 0, 4000), y: clamp(Math.round(+r.y) || 0, 0, 4000), ...sizeOf(r), ...anchorSan(r), ...miscSan(r), ...cleanCfg(r) };
      insts.push(inst); mount(inst);
    });
    relayout(); save(); bus.emit('widgets:change');
  };

  /* ---------------- layout + lifecycle ---------------- */
  /** Fit every widget into the current desktop area without overlapping icons or each other.
      The position the user chose (inst.x / inst.y) is kept as the preference; a widget is only
      shown elsewhere while its preferred spot does not fit, and returns when the window grows back. */
  function relayout() {
    if (!layer || document.body.classList.contains('compact')) return;
    const a = area();
    const order = [...insts].sort((p, q) => (q.pin ? 1 : 0) - (p.pin ? 1 : 0) || p.y - q.y || p.x - q.x).filter((i) => live.get(i.id));   // pinned widgets are placed first
    /** Place everyone at their anchored spot if it is clear; otherwise at the nearest clear spot, shrunk by factor k when
        needed (0 = minimum size). Returns null if some widget has nowhere to go (unless cascade is allowed). */
    const plan = (k, cascade) => {
      const blocks = iconBlocks(), out = [];
      let n = 0;
      for (const i of order) {
        let [w, hh] = dim(i);
        w = Math.min(w, Math.max(MINW, a.w - 16)); hh = Math.min(hh, Math.max(MINH, a.h - 16));   // never larger than the screen
        const [px, py] = posOf(i, w, hh);
        let x = clamp(px, 0, Math.max(0, a.w - w)), y = clamp(py, 0, Math.max(0, a.h - hh));
        if (!i.pin && overlaps(blocks, x, y, w, hh)) {
          const tw = k ? Math.max(MINW, Math.round(w * k)) : MINW, th = k ? Math.max(MINH, Math.round(hh * k)) : MINH;
          const spot = nearestSpot(x, y, tw, th, blocks);
          if (spot) { x = spot.x; y = spot.y; w = tw; hh = th; }
          else if (!cascade) return null;
          else { w = MINW; hh = MINH; x = clamp(a.w - w - 8 - (n % 4) * 28, 0, a.w); y = clamp(16 + (n % 6) * 28, 0, Math.max(0, a.h - hh)); n++; }
        }
        blocks.push({ x, y, w, h: hh }); out.push([i, x, y, w, hh]);
      }
      return out;
    };
    let result = null;
    for (const k of [1, 0.85, 0.7, 0.55, 0]) { result = plan(k, false); if (result) break; }
    if (!result) result = plan(0, true);   // truly full: the rest cascade
    for (const [i, x, y, w, hh] of result) {
      const el = live.get(i.id).el;
      el.style.width = w + 'px'; el.style.height = hh + 'px'; el.style.left = x + 'px'; el.style.top = y + 'px';
    }
  }
  let rt = 0;
  const relayoutSoon = () => { clearTimeout(rt); rt = setTimeout(relayout, 140); };   // after the icon grid has reflowed
  /** Phone layout: widgets live in a full-screen panel opened from the dock instead of floating over the icons. */
  W.togglePanel = (on) => {
    const open = on === undefined ? !document.body.classList.contains('widgets-open') : on;
    if (open && WM.compact()) WM.minimizeAll();   // full-screen windows would cover the panel
    document.body.classList.toggle('widgets-open', open);
  };
  W.applyVisibility = () => document.body.classList.toggle('widgets-off', SETTINGS().get('widgetsVisible') === false);

  let started = false;
  W.init = function () {
    if (started) return;
    started = true;
    layer = h('div', { id: 'widgets' });
    layer.append(h('button', { class: 'w-panel-x', text: 'Done', onclick: () => W.togglePanel(false) }));
    document.getElementById('desktop').prepend(layer);
    const saved = store.get('ulyos.widgets', null);
    if (saved && Array.isArray(saved.list)) {
      saved.list.slice(0, MAX).forEach((r) => {
        if (!r || !TYPES[r.type] || !SIZES[r.size]) return;
        const inst = { id: typeof r.id === 'string' ? r.id : uid(), type: r.type, size: r.size, x: +r.x || 0, y: +r.y || 0, ...sizeOf(r), ...anchorSan(r), ...miscSan(r), ...cleanCfg(r), ...(typeof r.text === 'string' ? { text: r.text.slice(0, 5000) } : {}), ...(r.type === 'todo' && Array.isArray(r.items) ? { items: r.items.slice(0, 30).filter((x) => x && typeof x.t === 'string').map((x) => ({ t: x.t.slice(0, 120), d: !!x.d })) } : {}) };
        insts.push(inst); mount(inst);
      });
      relayout();
    }
    W.applyVisibility();
    setInterval(() => { if (!document.hidden) live.forEach((l) => { try { l.update?.(); } catch { /* ignore */ } }); }, 1000);
    window.addEventListener('resize', relayoutSoon);
    bus.on('settings:change', () => { W.applyVisibility(); W.restyle(); relayoutSoon(); live.forEach((l) => l.update?.()); });
    bus.on('desktop:layout', relayoutSoon); bus.on('widgets:change', relayoutSoon);
  };
})();
