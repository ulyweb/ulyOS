/* ==========================================================================
   ulyOS · js/scenes.js — space and anime-style wallpapers
   Original artwork drawn in code as vector SVG: sharp at 1080p, 4K or 8K,
   a few kilobytes each, works offline, and carries no third-party licence
   (it is part of ulyOS). They join the landscape wallpapers.
   ========================================================================== */
(function () {
  'use strict';
  if (!ulyOS.landscapes) return;
  const W = 1600, H = 900;
  const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const f1 = (n) => n.toFixed(1);
  const lin = (id, stops, x2 = 0, y2 = 1) => '<linearGradient id="' + id + '" x1="0" y1="0" x2="' + x2 + '" y2="' + y2 + '">' + stops.map((c, i) => '<stop offset="' + (i / (stops.length - 1)).toFixed(2) + '" stop-color="' + c + '"/>').join('') + '</linearGradient>';
  const rad = (id, stops) => '<radialGradient id="' + id + '">' + stops.map(([o, c, a]) => '<stop offset="' + o + '" stop-color="' + c + '" stop-opacity="' + (a == null ? 1 : a) + '"/>').join('') + '</radialGradient>';
  const blur = (id, s) => '<filter id="' + id + '" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="' + s + '"/></filter>';
  const stars = (r, n, ymax = H, big = 0.35) => { let o = ''; for (let i = 0; i < n; i++) { const x = r() * W, y = r() * ymax, k = r(); o += '<circle cx="' + f1(x) + '" cy="' + f1(y) + '" r="' + (k > 1 - big * 0.12 ? (1.6 + r() * 1.4).toFixed(1) : (0.4 + r() * 0.9).toFixed(1)) + '" fill="' + (k > 0.9 ? '#cfe3ff' : k < 0.1 ? '#ffe3c4' : '#fff') + '" opacity="' + (0.3 + r() * 0.7).toFixed(2) + '"/>'; } return o; };
  const cloud = (r, cx, cy, w, color, op = 1) => { let o = ''; const n = 9 + Math.floor(r() * 5); for (let i = 0; i < n; i++) { const x = cx + (r() - 0.5) * w, rr = w * (0.08 + r() * 0.1), y = cy + (r() - 0.5) * w * 0.06 - Math.abs(x - cx) * 0.05; o += '<ellipse cx="' + f1(x) + '" cy="' + f1(y) + '" rx="' + f1(rr * 1.5) + '" ry="' + f1(rr) + '"/>'; } return '<g fill="' + color + '" opacity="' + op + '">' + o + '<rect x="' + f1(cx - w * 0.42) + '" y="' + f1(cy) + '" width="' + f1(w * 0.84) + '" height="' + f1(w * 0.05) + '" rx="' + f1(w * 0.025) + '"/></g>'; };
  const ridge = (r, base, amp, color, rough = 6) => { let d = 'M0,' + H; for (let i = 0; i <= 80; i++) { const x = (i / 80) * W; d += ' L' + f1(x) + ',' + f1(base - (Math.sin(i * 0.21 + rough) * 0.5 + Math.sin(i * 0.5 + rough * 2) * 0.3 + r() * 0.25) * amp); } return '<path d="' + d + ' L' + W + ',' + H + ' Z" fill="' + color + '"/>'; };
  const petals = (r, n, color) => { let o = ''; for (let i = 0; i < n; i++) o += '<ellipse cx="' + f1(r() * W) + '" cy="' + f1(r() * H) + '" rx="' + f1(3 + r() * 4) + '" ry="' + f1(1.6 + r() * 2.2) + '" fill="' + color + '" opacity="' + (0.4 + r() * 0.5).toFixed(2) + '" transform="rotate(' + f1(r() * 180) + ' ' + f1(r() * W) + ' ' + f1(r() * H) + ')"/>'; return o; };

  const SC = {
    /* ---------------- space ---------------- */
    'space-mars': ['Mars dusk', 'Space', (r) => ({
      defs: lin('s', ['#0b1030', '#4a2d5e', '#d4604a', '#ffb27a']) + rad('sun', [[0, '#bfe2ff'], [0.25, '#8fb8ff', 0.7], [1, '#8fb8ff', 0]]) + lin('g1', ['#a1442c', '#5a2216']) + lin('g2', ['#7a301d', '#2d100a']) + blur('b6', 6),
      body: '<rect width="' + W + '" height="' + H + '" fill="url(#s)"/>' + stars(r, 120, 380) +
        '<circle cx="1180" cy="560" r="240" fill="url(#sun)"/><circle cx="1180" cy="560" r="14" fill="#eaf4ff"/>' +
        '<circle cx="360" cy="170" r="22" fill="#b9a89a"/><circle cx="352" cy="164" r="6" fill="#9a8a7e" opacity=".6"/><circle cx="690" cy="110" r="9" fill="#cdbfb2"/>' +
        ridge(r, 620, 140, '#7c3a2a', 1) + ridge(r, 700, 120, 'url(#g1)', 3) + ridge(r, 800, 90, 'url(#g2)', 5) +
        Array.from({ length: 26 }, () => { const x = r() * W, y = 740 + r() * 150, s = 8 + r() * 26; return '<ellipse cx="' + f1(x) + '" cy="' + f1(y) + '" rx="' + f1(s * 1.4) + '" ry="' + f1(s) + '" fill="#3a1610" opacity=".85"/><ellipse cx="' + f1(x - s * 0.3) + '" cy="' + f1(y - s * 0.3) + '" rx="' + f1(s * 0.7) + '" ry="' + f1(s * 0.4) + '" fill="#a65a3e" opacity=".5"/>'; }).join('') +
        '<g transform="translate(520 760)" fill="#14080a"><rect x="0" y="-26" width="70" height="16" rx="4"/><rect x="26" y="-44" width="22" height="18" rx="3"/><path d="M52 -44l26 -22" stroke="#14080a" stroke-width="3"/><circle cx="10" cy="-4" r="9"/><circle cx="35" cy="-4" r="9"/><circle cx="60" cy="-4" r="9"/></g>' }) ],
    'space-jupiter': ['Jupiter rising', 'Space', (r) => {
      const bands = ['#e8d3b4', '#c99a6a', '#f2e3c8', '#b8774e', '#e9c9a0', '#a8623f', '#f0dcc0', '#c58c5c', '#e4cba6'];
      return { defs: lin('s', ['#02030a', '#0a1030', '#1a1f4a']) + rad('gl', [[0.78, '#ffd9a8', 0.35], [1, '#ffd9a8', 0]]) + '<clipPath id="jc"><circle cx="1150" cy="1000" r="680"/></clipPath>' + rad('sh', [[0.55, '#000', 0], [1, '#000', 0.65]]) + blur('b3', 3),
        body: '<rect width="' + W + '" height="' + H + '" fill="url(#s)"/>' + stars(r, 260, H * 0.7) + '<circle cx="1150" cy="1000" r="760" fill="url(#gl)"/>' +
          '<g clip-path="url(#jc)"><rect x="400" y="300" width="1500" height="800" fill="#d8b890"/>' + bands.map((c, i) => '<path d="M400 ' + (330 + i * 50) + ' Q900 ' + (300 + i * 50 + (i % 2 ? 22 : -22)) + ' 1500 ' + (330 + i * 50) + ' L1500 ' + (385 + i * 50) + ' Q900 ' + (355 + i * 50 + (i % 2 ? 22 : -22)) + ' 400 ' + (385 + i * 50) + ' Z" fill="' + c + '" opacity=".85" filter="url(#b3)"/>').join('') +
          '<ellipse cx="1010" cy="505" rx="86" ry="46" fill="#b8452c"/><ellipse cx="1010" cy="505" rx="58" ry="28" fill="#d9674a"/><ellipse cx="1010" cy="505" rx="30" ry="14" fill="#8f2f1d"/><circle cx="1150" cy="1000" r="680" fill="url(#sh)"/></g>' +
          '<circle cx="470" cy="300" r="26" fill="#e8d28a"/><circle cx="462" cy="292" r="9" fill="#c7a94f" opacity=".6"/><circle cx="260" cy="520" r="11" fill="#cfd6e4"/>' };
    }],
    'space-saturn': ['Saturn rings', 'Space', (r) => ({
      defs: lin('s', ['#02030a', '#0b0f2e', '#16183d']) + lin('pl', ['#f3e0b4', '#d6b27a', '#b88e57']) + lin('rg', ['#8a7a64', '#e8d9bd', '#b9a888', '#efe2c8', '#8d7d68'], 1, 0) + '<clipPath id="pc"><circle cx="800" cy="470" r="215"/></clipPath>' + rad('sh', [[0.5, '#000', 0], [1, '#000', 0.55]]),
      body: '<rect width="' + W + '" height="' + H + '" fill="url(#s)"/>' + stars(r, 280) +
        '<g transform="rotate(-18 800 470)">' +
        '<ellipse cx="800" cy="470" rx="640" ry="150" fill="none" stroke="url(#rg)" stroke-width="92" opacity=".9"/><ellipse cx="800" cy="470" rx="640" ry="150" fill="none" stroke="#2a2218" stroke-width="3" opacity=".5" transform="scale(1 1)"/>' +
        '<circle cx="800" cy="470" r="215" fill="url(#pl)"/>' + [-110, -60, -10, 40, 90, 140].map((y, i) => '<path d="M' + (800 - 215) + ' ' + (470 + y) + ' Q800 ' + (470 + y + (i % 2 ? 12 : -12)) + ' ' + (800 + 215) + ' ' + (470 + y) + '" stroke="' + (i % 2 ? '#b98c55' : '#f8ecd0') + '" stroke-width="14" fill="none" opacity=".35" clip-path="url(#pc)"/>').join('') +
        '<circle cx="800" cy="470" r="215" fill="url(#sh)"/>' +
        '<path d="M160 470A640 150 0 0 0 1440 470" fill="none" stroke="url(#rg)" stroke-width="92" opacity=".95"/></g>' }) ],
    'space-nebula': ['Pink nebula', 'Space', (r) => {
      const blobs = [['#ff4fa3', 0.5], ['#7a5cff', 0.55], ['#27c4ff', 0.4], ['#ff9a4d', 0.3], ['#c13dff', 0.5]];
      return { defs: lin('s', ['#04030f', '#0b0a24']) + blur('b60', 60) + blur('b25', 25) + rad('fl', [[0, '#fff'], [0.2, '#cfe3ff', 0.8], [1, '#cfe3ff', 0]]),
        body: '<rect width="' + W + '" height="' + H + '" fill="url(#s)"/>' +
          blobs.map(([c, o], i) => Array.from({ length: 5 }, () => '<ellipse cx="' + f1(200 + r() * 1200) + '" cy="' + f1(120 + r() * 650) + '" rx="' + f1(160 + r() * 280) + '" ry="' + f1(80 + r() * 160) + '" fill="' + c + '" opacity="' + (o * (0.35 + r() * 0.4)).toFixed(2) + '" filter="url(#b60)" transform="rotate(' + f1(r() * 160 - 80) + ' 800 450)"/>').join('')).join('') +
          Array.from({ length: 6 }, () => '<ellipse cx="' + f1(300 + r() * 1000) + '" cy="' + f1(200 + r() * 500) + '" rx="' + f1(60 + r() * 120) + '" ry="' + f1(14 + r() * 24) + '" fill="#fff" opacity=".18" filter="url(#b25)" transform="rotate(' + f1(r() * 60 - 30) + ' 800 450)"/>').join('') +
          stars(r, 420, H, 0.6) + [[420, 300], [1180, 520]].map(([x, y]) => '<circle cx="' + x + '" cy="' + y + '" r="70" fill="url(#fl)"/><path d="M' + (x - 90) + ' ' + y + 'H' + (x + 90) + 'M' + x + ' ' + (y - 90) + 'V' + (y + 90) + '" stroke="#fff" stroke-width="1.6" opacity=".7"/>').join('') };
    }],
    'space-galaxy': ['Spiral galaxy', 'Space', (r) => {
      let dots = '';
      for (let arm = 0; arm < 2; arm++) for (let i = 0; i < 480; i++) { const t = i / 480, a = t * 9 + arm * Math.PI, rr = 30 + t * 520 + (r() - 0.5) * 70 * (0.4 + t), x = 800 + Math.cos(a) * rr * 1.25, y = 450 + Math.sin(a) * rr * 0.5, k = r(); dots += '<circle cx="' + f1(x) + '" cy="' + f1(y) + '" r="' + (0.5 + r() * 1.4).toFixed(1) + '" fill="' + (k > 0.7 ? '#bcd7ff' : k > 0.35 ? '#fff' : '#ffd9b0') + '" opacity="' + (0.25 + (1 - t) * 0.55).toFixed(2) + '"/>'; }
      return { defs: lin('s', ['#020208', '#080a20']) + rad('core', [[0, '#fff6dc'], [0.18, '#ffd68a', 0.9], [0.5, '#ff8a5c', 0.25], [1, '#ff8a5c', 0]]) + blur('b30', 30) + rad('halo', [[0, '#7aa0ff', 0.28], [1, '#7aa0ff', 0]]),
        body: '<rect width="' + W + '" height="' + H + '" fill="url(#s)"/>' + stars(r, 300) + '<g transform="rotate(-24 800 450)"><ellipse cx="800" cy="450" rx="760" ry="320" fill="url(#halo)"/>' + dots + '<ellipse cx="800" cy="450" rx="120" ry="60" fill="url(#core)"/></g>' };
    }],
    'space-earth': ['Earth horizon', 'Space', (r) => ({
      defs: lin('s', ['#01020a', '#050a22', '#0a1d4a']) + rad('atm', [[0.9, '#4aa8ff', 0.0], [0.96, '#5ec0ff', 0.55], [1, '#9fe0ff', 0]]) + lin('ea', ['#0f4fa8', '#0a2a66', '#04122e']) + rad('sun', [[0, '#fff', 1], [0.1, '#ffe9b8', 0.9], [1, '#ffb86b', 0]]) + '<clipPath id="ec"><circle cx="800" cy="1760" r="1040"/></clipPath>',
      body: '<rect width="' + W + '" height="' + H + '" fill="url(#s)"/>' + stars(r, 320, 640) +
        '<circle cx="800" cy="1760" r="1090" fill="url(#atm)"/><circle cx="800" cy="1760" r="1040" fill="url(#ea)"/>' +
        '<g clip-path="url(#ec)">' + Array.from({ length: 16 }, () => '<ellipse cx="' + f1(100 + r() * 1400) + '" cy="' + f1(740 + r() * 140) + '" rx="' + f1(90 + r() * 200) + '" ry="' + f1(12 + r() * 20) + '" fill="#fff" opacity="' + (0.18 + r() * 0.3).toFixed(2) + '"/>').join('') +
        Array.from({ length: 150 }, () => '<circle cx="' + f1(300 + r() * 1000) + '" cy="' + f1(760 + r() * 130) + '" r="' + (0.7 + r() * 1.6).toFixed(1) + '" fill="#ffd27a" opacity="' + (0.4 + r() * 0.6).toFixed(2) + '"/>').join('') + '</g>' +
        '<circle cx="1180" cy="722" r="190" fill="url(#sun)"/><path d="M1000 722h360" stroke="#fff" stroke-width="2" opacity=".6"/>' }) ],
    'space-blackhole': ['Black hole', 'Space', (r) => ({
      defs: lin('s', ['#010106', '#06081c']) + rad('disk', [[0.35, '#fff7e0'], [0.5, '#ffb347'], [0.75, '#ff5a2a', 0.8], [1, '#8a1a3a', 0]]) + blur('b8', 8) + blur('b18', 18),
      body: '<rect width="' + W + '" height="' + H + '" fill="url(#s)"/>' + stars(r, 340) +
        '<g transform="rotate(-12 800 450)"><ellipse cx="800" cy="450" rx="620" ry="120" fill="url(#disk)" filter="url(#b8)" opacity=".95"/><ellipse cx="800" cy="450" rx="620" ry="120" fill="none" stroke="#fff3cf" stroke-width="2.4" opacity=".7"/>' +
        '<ellipse cx="800" cy="372" rx="215" ry="100" fill="none" stroke="#ffd9a0" stroke-width="30" opacity=".85" filter="url(#b8)"/><ellipse cx="800" cy="528" rx="215" ry="100" fill="none" stroke="#ff8a4a" stroke-width="22" opacity=".6" filter="url(#b8)"/>' +
        '<circle cx="800" cy="450" r="170" fill="#000"/><circle cx="800" cy="450" r="172" fill="none" stroke="#ffd29a" stroke-width="2.2" opacity=".6"/></g>' }) ],
    'space-earthrise': ['Lunar earthrise', 'Space', (r) => ({
      defs: lin('s', ['#000', '#04050c']) + rad('eg', [[0.7, '#4aa8ff', 0], [1, '#4aa8ff', 0.4]]) + lin('lu', ['#9a9a9f', '#4a4a50', '#1c1c20']) + lin('ea', ['#2a7fff', '#0b3a86']) + '<clipPath id="ek"><circle cx="1130" cy="260" r="120"/></clipPath>',
      body: '<rect width="' + W + '" height="' + H + '" fill="url(#s)"/>' + stars(r, 300, 650) +
        '<circle cx="1130" cy="260" r="150" fill="url(#eg)"/><circle cx="1130" cy="260" r="120" fill="url(#ea)"/><g clip-path="url(#ek)"><path d="M1030 200q50 -30 90 6t40 70-70 20-60-40z" fill="#3fbf6a" opacity=".85"/><path d="M1140 290q40 -10 70 20t-10 50-60-30z" fill="#4fcf7a" opacity=".8"/><ellipse cx="1090" cy="190" rx="70" ry="14" fill="#fff" opacity=".6"/><ellipse cx="1170" cy="300" rx="60" ry="12" fill="#fff" opacity=".5"/></g>' +
        ridge(r, 690, 60, '#52525a', 2) + '<path d="M0 ' + H + 'V720Q400 690 800 730T1600 700V' + H + 'Z" fill="url(#lu)"/>' +
        Array.from({ length: 40 }, () => { const x = r() * W, y = 740 + r() * 150, s = 6 + r() * 40; return '<ellipse cx="' + f1(x) + '" cy="' + f1(y) + '" rx="' + f1(s * 1.6) + '" ry="' + f1(s * 0.5) + '" fill="#2a2a30" opacity=".75"/><ellipse cx="' + f1(x) + '" cy="' + f1(y - s * 0.12) + '" rx="' + f1(s * 1.3) + '" ry="' + f1(s * 0.34) + '" fill="#6a6a72" opacity=".6"/>'; }).join('') }) ],

    /* ---------------- anime-style ---------------- */
    'anime-sakura': ['Sakura twilight', 'Anime-style', (r) => ({
      defs: lin('s', ['#3b2f8f', '#b35fb8', '#ff9fa6', '#ffd9a8']) + rad('sun', [[0, '#fff3d8'], [0.35, '#ffd0a0', 0.7], [1, '#ffb0a0', 0]]) + blur('b10', 10) + lin('hill', ['#2c1d52', '#140c2e']),
      body: '<rect width="' + W + '" height="' + H + '" fill="url(#s)"/>' + stars(r, 60, 250) + '<circle cx="1050" cy="520" r="260" fill="url(#sun)"/>' +
        cloud(r, 380, 250, 520, '#ffc4d0', 0.75) + cloud(r, 1180, 190, 600, '#ffe3d0', 0.7) + cloud(r, 760, 400, 700, '#ff9fb0', 0.55) +
        ridge(r, 600, 110, '#6b4a9e', 4) + ridge(r, 680, 80, '#40307a', 6) +
        '<g transform="translate(1120 330)" fill="#1a0f2e"><rect x="-96" y="0" width="192" height="14" rx="4"/><rect x="-82" y="26" width="164" height="10"/><rect x="-70" y="14" width="14" height="220"/><rect x="56" y="14" width="14" height="220"/><path d="M-118 -4Q-96 -22 -70 -12H70Q96 -22 118 -4L106 6H-106Z"/></g>' +
        '<path d="M0 ' + H + 'V720Q500 660 1000 735T1600 700V' + H + 'Z" fill="url(#hill)"/>' +
        [[190, 620, 1.2], [420, 660, 0.9], [1330, 650, 1.1], [1500, 690, 0.8]].map(([x, y, k]) => '<g transform="translate(' + x + ' ' + y + ') scale(' + k + ')"><path d="M-8 220C-6 140 -10 80 -2 20L12 22C8 90 12 150 12 220Z" fill="#241438"/>' + Array.from({ length: 34 }, () => '<circle cx="' + f1((r() - 0.5) * 300) + '" cy="' + f1(-40 - r() * 170) + '" r="' + f1(16 + r() * 28) + '" fill="' + ['#ffb7c9', '#ff9fb8', '#ffd0dc', '#f78fb3'][Math.floor(r() * 4)] + '" opacity="' + (0.7 + r() * 0.3).toFixed(2) + '"/>').join('') + '</g>').join('') + petals(r, 90, '#ffd0dc') }) ],
    'anime-neon': ['Neon city rain', 'Anime-style', (r) => {
      let b = '';
      for (let layer = 0; layer < 3; layer++) { let x = -20; const col = ['#2a1b5c', '#1c1245', '#0f0a2a'][layer]; while (x < W) { const w = 60 + r() * 110, h = 220 + r() * 380 - layer * 40, y = H * 0.82 - h; b += '<rect x="' + f1(x) + '" y="' + f1(y) + '" width="' + f1(w) + '" height="' + f1(h + 200) + '" fill="' + col + '"/>'; for (let k = 0; k < (layer === 2 ? 26 : 10); k++) b += '<rect x="' + f1(x + 6 + r() * (w - 14)) + '" y="' + f1(y + 10 + r() * (h - 20)) + '" width="' + (4 + r() * 6).toFixed(0) + '" height="' + (5 + r() * 8).toFixed(0) + '" fill="' + (r() > 0.5 ? '#ffd27a' : r() > 0.5 ? '#7df9ff' : '#ff7ad9') + '" opacity="' + (0.35 + r() * 0.65).toFixed(2) + '"/>'; x += w + r() * 14; } }
      let rain = ''; for (let i = 0; i < 160; i++) { const x = r() * W, y = r() * H * 0.85; rain += '<path d="M' + f1(x) + ' ' + f1(y) + 'l-6 26" stroke="#cfe3ff" stroke-width="1.1" opacity="' + (0.15 + r() * 0.3).toFixed(2) + '"/>'; }
      return { defs: lin('s', ['#0c0a2e', '#3a1a6e', '#c4408f', '#ff8a6b']) + lin('st', ['#1a1233', '#07050f']) + blur('b9', 9),
        body: '<rect width="' + W + '" height="' + H + '" fill="url(#s)"/>' + stars(r, 50, 230) + b +
          '<g filter="url(#b9)" opacity=".9"><rect x="240" y="300" width="44" height="150" fill="#ff3fa4"/><rect x="900" y="250" width="60" height="120" fill="#27e0ff"/><rect x="1260" y="340" width="40" height="170" fill="#ffb02e"/></g>' +
          '<rect x="240" y="300" width="44" height="150" rx="3" fill="none" stroke="#ffd0ec" stroke-width="2"/><rect x="900" y="250" width="60" height="120" rx="3" fill="none" stroke="#d0fbff" stroke-width="2"/><rect x="1260" y="340" width="40" height="170" rx="3" fill="none" stroke="#ffe5b8" stroke-width="2"/>' +
          '<rect y="' + f1(H * 0.82) + '" width="' + W + '" height="' + f1(H * 0.18) + '" fill="url(#st)"/><g opacity=".5" filter="url(#b9)"><rect x="220" y="760" width="90" height="120" fill="#ff3fa4"/><rect x="880" y="770" width="110" height="110" fill="#27e0ff"/><rect x="1240" y="765" width="80" height="120" fill="#ffb02e"/></g>' + rain }; }],
    'anime-train': ['Sea of mirrors', 'Anime-style', (r) => ({
      defs: lin('s', ['#0b1e5e', '#3f6fd6', '#a7d4ff', '#ffe9d0']) + lin('w', ['#bfe0ff', '#3a6fd0']) + blur('b3', 3),
      body: '<rect width="' + W + '" height="' + H + '" fill="url(#s)"/>' + stars(r, 90, 280) + cloud(r, 420, 220, 620, '#ffffff', 0.9) + cloud(r, 1150, 300, 760, '#fff0e0', 0.85) + cloud(r, 800, 140, 500, '#d8ebff', 0.7) +
        '<rect y="560" width="' + W + '" height="340" fill="url(#w)"/><g opacity=".5" filter="url(#b3)">' + cloud(r, 420, 640, 620, '#ffffff', 0.9) + cloud(r, 1150, 600, 760, '#fff0e0', 0.8) + '</g>' +
        Array.from({ length: 22 }, () => '<path d="M' + f1(r() * W) + ' ' + f1(580 + r() * 300) + 'h' + f1(40 + r() * 140) + '" stroke="#fff" stroke-width="2" opacity="' + (0.15 + r() * 0.3).toFixed(2) + '"/>').join('') +
        '<path d="M0 640H1600" stroke="#1c2a4a" stroke-width="5"/><path d="M0 660H1600" stroke="#1c2a4a" stroke-width="2.5"/>' +
        Array.from({ length: 80 }, (_, i) => '<rect x="' + (i * 22) + '" y="654" width="8" height="12" fill="#1c2a4a"/>').join('') +
        '<g transform="translate(460 560)" fill="#16213f"><rect x="0" y="0" width="520" height="72" rx="12"/>' + Array.from({ length: 6 }, (_, i) => '<rect x="' + (22 + i * 82) + '" y="14" width="54" height="30" rx="6" fill="#ffd27a"/>').join('') + '<rect x="-20" y="30" width="30" height="42" rx="10"/><rect x="0" y="62" width="520" height="12" fill="#0d1530"/></g>' +
        '<g transform="translate(466 566)" opacity=".28" filter="url(#b3)"><rect y="150" width="520" height="40" fill="#16213f"/></g>' }) ],
    'anime-sky': ['Summer clouds', 'Anime-style', (r) => ({
      defs: lin('s', ['#1478e8', '#4ea4ff', '#a9d9ff', '#e6f6ff']) + rad('rays', [[0, '#fff', 0.55], [1, '#fff', 0]]) + blur('b2', 2),
      body: '<rect width="' + W + '" height="' + H + '" fill="url(#s)"/><circle cx="1320" cy="150" r="460" fill="url(#rays)"/>' +
        [[300, 520, 760], [950, 600, 900], [1400, 450, 640], [620, 330, 520], [1100, 260, 560]].map(([x, y, w], i) => cloud(r, x, y, w, '#ffffff', 0.96) + cloud(r, x + 10, y + w * 0.05, w * 0.9, '#bcd8f5', 0.45)).join('') +
        ridge(r, 860, 80, '#2d7a58', 2) + '<path d="M0 900V820Q400 780 800 830T1600 800V900Z" fill="#1d5c42"/>' +
        '<g stroke="#12202c" fill="none" stroke-width="3"><path d="M140 330V860M60 380H240M80 420H220"/><path d="M-20 392Q300 470 640 392T1300 410T1640 392"/><path d="M-20 428Q300 500 640 428T1300 446T1640 428" opacity=".8"/></g><g stroke="#12202c" stroke-width="3"><path d="M1180 280V860M1100 330H1260M1120 370H1240"/></g>' }) ],
    'anime-lantern': ['Lantern night', 'Anime-style', (r) => ({
      defs: lin('s', ['#050a24', '#1a1e5a', '#5a2d7a', '#d0586a']) + rad('l', [[0, '#fff2c0'], [0.3, '#ffb347', 0.85], [1, '#ff6a2a', 0]]) + blur('b4', 4),
      body: '<rect width="' + W + '" height="' + H + '" fill="url(#s)"/>' + stars(r, 140, 400) + '<circle cx="1180" cy="190" r="70" fill="#fff6dc"/><circle cx="1180" cy="190" r="120" fill="#fff6dc" opacity=".12"/>' +
        ridge(r, 640, 120, '#1a1040', 3) + '<g fill="#0a0620"><path d="M380 600Q420 560 520 556L640 520 760 556Q860 560 900 600Z"/><rect x="450" y="600" width="380" height="130"/><path d="M420 612H860L820 640H460Z"/></g>' +
        '<path d="M0 ' + H + 'V760Q400 740 800 770T1600 750V' + H + 'Z" fill="#06041a"/>' +
        Array.from({ length: 70 }, () => { const x = r() * W, y = 80 + r() * 700, s = 0.5 + r() * 1.3; return '<g transform="translate(' + f1(x) + ' ' + f1(y) + ') scale(' + s.toFixed(2) + ')"><circle r="46" fill="url(#l)" opacity=".7" filter="url(#b4)"/><rect x="-11" y="-15" width="22" height="30" rx="8" fill="#ffc15a"/><rect x="-11" y="-15" width="22" height="30" rx="8" fill="none" stroke="#fff0c0" stroke-width="1.4" opacity=".8"/></g>'; }).join('') }) ],
    'anime-rooftop': ['Golden hour rooftop', 'Anime-style', (r) => {
      let c = ''; let x = -10; while (x < W) { const w = 50 + r() * 90, h = 120 + r() * 260; c += '<rect x="' + f1(x) + '" y="' + f1(640 - h) + '" width="' + f1(w) + '" height="' + f1(h + 260) + '" fill="#3a2250"/>'; for (let k = 0; k < 8; k++) c += '<rect x="' + f1(x + 6 + r() * (w - 12)) + '" y="' + f1(640 - h + 10 + r() * (h - 10)) + '" width="5" height="7" fill="#ffd27a" opacity="' + (0.2 + r() * 0.6).toFixed(2) + '"/>'; x += w + r() * 10; }
      return { defs: lin('s', ['#2a3a8a', '#b4568c', '#ff9a6a', '#ffd88a']) + rad('sun', [[0, '#fff4d0'], [0.3, '#ffc27a', 0.8], [1, '#ff9a6a', 0]]),
        body: '<rect width="' + W + '" height="' + H + '" fill="url(#s)"/><circle cx="520" cy="540" r="340" fill="url(#sun)"/><circle cx="520" cy="540" r="58" fill="#fff6dc"/>' +
          cloud(r, 1150, 250, 700, '#ffc2a0', 0.85) + cloud(r, 420, 330, 600, '#ff9fb0', 0.7) + cloud(r, 900, 440, 560, '#ffe0b0', 0.55) + c +
          '<rect y="760" width="' + W + '" height="140" fill="#1c1030"/><g stroke="#0c0618" stroke-width="3" fill="none"><path d="M0 700H1600"/><path d="M0 760H1600"/>' + Array.from({ length: 54 }, (_, i) => '<path d="M' + (i * 30) + ' 700V760"/>').join('') + '</g>' };
    }],
    'anime-bamboo': ['Bamboo moon', 'Anime-style', (r) => ({
      defs: lin('s', ['#071a2e', '#134a5a', '#3c8a82', '#a6d9b8']) + rad('m', [[0, '#fffff0'], [0.4, '#eaffd8', 0.5], [1, '#cfeec0', 0]]) + blur('b8', 8),
      body: '<rect width="' + W + '" height="' + H + '" fill="url(#s)"/>' + stars(r, 80, 360) + '<circle cx="900" cy="300" r="260" fill="url(#m)"/><circle cx="900" cy="300" r="120" fill="#fffff0"/><circle cx="870" cy="270" r="22" fill="#e6f2c8" opacity=".6"/><circle cx="935" cy="330" r="30" fill="#e6f2c8" opacity=".5"/>' +
        '<g opacity=".55" filter="url(#b8)"><ellipse cx="500" cy="700" rx="600" ry="70" fill="#cdeedd"/><ellipse cx="1200" cy="760" rx="520" ry="60" fill="#cdeedd"/></g>' +
        [[0.55, '#0c3a3a', 14], [0.8, '#08282c', 22], [1, '#041418', 30]].map(([o, col, wd], layer) => Array.from({ length: 9 - layer * 2 }, () => { const x = r() * W; let s = '<g fill="' + col + '">'; s += '<rect x="' + f1(x) + '" y="0" width="' + wd + '" height="' + H + '" rx="4"/>'; for (let k = 1; k < 8; k++) s += '<rect x="' + f1(x - 3) + '" y="' + (k * 115) + '" width="' + (wd + 6) + '" height="6" rx="3" opacity=".8"/>'; for (let k = 0; k < 7; k++) { const y = 120 + k * 100 + r() * 40, dir = r() > 0.5 ? 1 : -1; s += '<path d="M' + f1(x + wd / 2) + ' ' + f1(y) + 'q' + (dir * 80) + ' ' + (-20 - r() * 30) + ' ' + (dir * (120 + r() * 70)) + ' ' + (20 + r() * 30) + 'q' + (-dir * 60) + ' ' + (-10) + ' ' + (-dir * (120 + r() * 70)) + ' ' + (-20) + 'z" opacity=".9"/>'; } return s + '</g>'; }).join('')).join('') +
        '<g fill="#bfffd0" opacity=".7">' + Array.from({ length: 40 }, () => '<circle cx="' + f1(r() * W) + '" cy="' + f1(r() * H) + '" r="' + (1.2 + r() * 2).toFixed(1) + '"/>').join('') + '</g>' }) ],
    /* ---------------- futuristic (cartoon sci-fi and cinematic) ---------------- */
    'fut-sky': ['Sky city', 'Futuristic', (r) => {
      let b = ''; const col = ['#6b5bd6', '#4a3fb0', '#2c2678'];
      for (let l = 0; l < 3; l++) { let x = -30; while (x < W) { const w = 70 + r() * 110, h = 260 + r() * 420 - l * 60, y = 820 - h; b += '<rect x="' + f1(x) + '" y="' + f1(y) + '" width="' + f1(w) + '" height="' + f1(h + 100) + '" rx="10" fill="' + col[l] + '"/>';
        if (r() > 0.5) b += '<rect x="' + f1(x + w / 2 - 3) + '" y="' + f1(y - 60) + '" width="6" height="60" fill="' + col[l] + '"/><circle cx="' + f1(x + w / 2) + '" cy="' + f1(y - 62) + '" r="6" fill="#ffe27a"/>';
        for (let k = 0; k < (l + 1) * 7; k++) b += '<rect x="' + f1(x + 8 + r() * (w - 20)) + '" y="' + f1(y + 14 + r() * h * 0.9) + '" width="7" height="10" rx="2" fill="' + (r() > 0.5 ? '#ffe9a8' : '#9ff4ff') + '" opacity="' + (0.5 + r() * 0.5).toFixed(2) + '"/>'; x += w + 10 + r() * 20; } }
      let cars = ''; for (let i = 0; i < 9; i++) { const x = r() * W, y = 120 + r() * 420; cars += '<g transform="translate(' + f1(x) + ' ' + f1(y) + ')"><path d="M-70 0H-8" stroke="#fff" stroke-opacity=".55" stroke-width="5" stroke-linecap="round"/><rect x="-6" y="-8" width="34" height="16" rx="8" fill="#ff7ab8"/><rect x="6" y="-12" width="14" height="9" rx="4" fill="#bff4ff"/></g>'; }
      return { defs: lin('s', ['#6fc3ff', '#b79bff', '#ffb4d6', '#ffe7c2']) + rad('sun', [[0, '#fff7d6'], [0.35, '#ffd9a0', 0.7], [1, '#ffc0a0', 0]]),
        body: '<rect width="' + W + '" height="' + H + '" fill="url(#s)"/><circle cx="1180" cy="330" r="300" fill="url(#sun)"/><circle cx="1180" cy="330" r="70" fill="#fff8e0"/><circle cx="360" cy="190" r="34" fill="#fff" opacity=".85"/><circle cx="440" cy="240" r="16" fill="#ffd9f0" opacity=".9"/>' + cloud(r, 420, 420, 700, '#ffffff', 0.7) + cloud(r, 1300, 500, 600, '#ffe6f4', 0.6) + b + cars }; }],
    'fut-grid': ['Neon horizon', 'Futuristic', (r) => {
      let g = ''; for (let i = -14; i <= 14; i++) g += '<path d="M' + (800 + i * 40) + ' 560L' + (800 + i * 320) + ' 900" stroke="#ff4fd8" stroke-width="2" opacity=".75"/>';
      for (let j = 0; j < 12; j++) { const y = 560 + Math.pow(j / 11, 2.2) * 340; g += '<path d="M0 ' + f1(y) + 'H1600" stroke="#27e0ff" stroke-width="' + (1 + j * 0.25).toFixed(1) + '" opacity=".7"/>'; }
      let m = ''; let x = -20; while (x < W) { const w = 20 + r() * 40, h = 20 + r() * 90; m += '<rect x="' + f1(x) + '" y="' + f1(560 - h) + '" width="' + f1(w) + '" height="' + f1(h) + '" fill="#0a0620"/>'; x += w + 4; }
      return { defs: lin('s', ['#07021f', '#2a0a5e', '#c6228f', '#ff8a4c']) + lin('sn', ['#fff06a', '#ff4fa0']) + blur('b6', 6),
        body: '<rect width="' + W + '" height="' + H + '" fill="url(#s)"/>' + stars(r, 90, 400) + '<circle cx="800" cy="480" r="190" fill="url(#sn)"/><g fill="#2a0a5e">' + [0, 1, 2, 3, 4, 5].map((i) => '<rect x="600" y="' + (470 + i * 14) + '" width="400" height="' + (2 + i * 1.6) + '"/>').join('') + '</g>' + m + '<rect y="560" width="' + W + '" height="340" fill="#12052e"/><g filter="url(#b6)" opacity=".6">' + g + '</g>' + g }; }],
    'fut-station': ['Orbital station', 'Futuristic', (r) => ({
      defs: lin('s', ['#02030a', '#050b24', '#0a1a4a']) + rad('e', [[0, '#7ec8ff'], [0.7, '#2a68d8'], [1, '#0a2a78']]) + rad('glow', [[0, '#9fd8ff', 0.7], [1, '#9fd8ff', 0]]) + lin('hull', ['#f0f4ff', '#8c98b8']),
      body: '<rect width="' + W + '" height="' + H + '" fill="url(#s)"/>' + stars(r, 220, H, 0.2) +
        '<circle cx="800" cy="1500" r="1000" fill="url(#glow)"/><circle cx="800" cy="1500" r="940" fill="url(#e)"/><path d="M-100 700Q800 520 1700 700" fill="none" stroke="#bfe6ff" stroke-width="5" opacity=".7"/>' +
        '<g transform="translate(900 330)"><ellipse rx="300" ry="86" fill="none" stroke="url(#hull)" stroke-width="26"/><ellipse rx="300" ry="86" fill="none" stroke="#ffe27a" stroke-width="3" stroke-dasharray="3 14" opacity=".9"/><rect x="-14" y="-170" width="28" height="340" rx="10" fill="url(#hull)"/><rect x="-60" y="-26" width="120" height="52" rx="16" fill="url(#hull)"/><path d="M-14 -150H-170M14 -150H170M-14 150H-170M14 150H170" stroke="#8c98b8" stroke-width="8"/><rect x="-250" y="-190" width="90" height="46" fill="#2a68d8"/><rect x="160" y="-190" width="90" height="46" fill="#2a68d8"/><rect x="-250" y="144" width="90" height="46" fill="#2a68d8"/><rect x="160" y="144" width="90" height="46" fill="#2a68d8"/></g>' +
        '<g transform="translate(260 520) rotate(-18)"><path d="M0 0L90 -10L110 0L90 10z" fill="url(#hull)"/><path d="M-60 0H0" stroke="#7ee0ff" stroke-width="6" stroke-linecap="round" opacity=".8"/></g>' })],
    'fut-colony': ['Mars colony', 'Futuristic', (r) => ({
      defs: lin('s', ['#1a1030', '#7a3a5a', '#e8704a', '#ffc27a']) + rad('d', [[0, '#d8f6ff', 0.9], [1, '#6fd8ff', 0.35]]) + lin('g', ['#a2442c', '#4a1c12']) + rad('p', [[0, '#ffe0a8'], [1, '#c4753c']]),
      body: '<rect width="' + W + '" height="' + H + '" fill="url(#s)"/>' + stars(r, 80, 300) + '<circle cx="1260" cy="230" r="120" fill="url(#p)"/><ellipse cx="1260" cy="230" rx="230" ry="26" fill="none" stroke="#ffd9a8" stroke-width="10" opacity=".75" transform="rotate(-18 1260 230)"/>' +
        ridge(r, 640, 130, '#8c3c28', 2) + '<rect y="680" width="' + W + '" height="220" fill="url(#g)"/>' + ridge(r, 740, 60, '#6a2a1a', 4) +
        [[420, 700, 150], [660, 720, 100], [900, 705, 130]].map(([x, y, w]) => '<g><path d="M' + (x - w) + ' ' + y + 'A' + w + ' ' + w * 0.85 + ' 0 0 1 ' + (x + w) + ' ' + y + 'Z" fill="url(#d)" stroke="#fff" stroke-opacity=".7" stroke-width="3"/><path d="M' + (x - w * 0.5) + ' ' + y + 'V' + (y - w * 0.5) + 'M' + x + ' ' + y + 'V' + (y - w * 0.85) + 'M' + (x + w * 0.5) + ' ' + y + 'V' + (y - w * 0.5) + '" stroke="#fff" stroke-opacity=".5" stroke-width="2"/><rect x="' + (x - 10) + '" y="' + (y - 28) + '" width="20" height="28" rx="4" fill="#ffe9a8"/></g>').join('') +
        '<path d="M520 700H770" stroke="#ffe9a8" stroke-width="12" opacity=".8"/><g transform="translate(1150 780)"><rect x="-44" y="-26" width="88" height="22" rx="8" fill="#f2f4fa"/><rect x="-18" y="-46" width="36" height="22" rx="6" fill="#bfe8ff"/><circle cx="-28" cy="0" r="14" fill="#222"/><circle cx="28" cy="0" r="14" fill="#222"/></g>' })],
    'fut-ocean': ['Ocean arcology', 'Futuristic', (r) => {
      let t = ''; [[300, 520, 110], [520, 440, 90], [760, 560, 130], [1040, 400, 100], [1260, 500, 120]].forEach(([x, h, w], i) => { t += '<path d="M' + (x - w / 2) + ' 700L' + (x - w / 3) + ' ' + (700 - h) + 'H' + (x + w / 3) + 'L' + (x + w / 2) + ' 700Z" fill="#e8f2ff" opacity=".95"/><path d="M' + x + ' ' + (700 - h) + 'V' + (700 - h - 70) + '" stroke="#e8f2ff" stroke-width="5"/><g fill="#7ad8ff">' + Array.from({ length: 9 }, (_, k) => '<rect x="' + (x - w / 3 + 8) + '" y="' + (700 - h + 24 + k * (h / 11)) + '" width="' + (w * 0.66 - 16) + '" height="5" rx="2"/>').join('') + '</g><ellipse cx="' + x + '" cy="' + (700 - h * 0.5) + '" rx="' + (w * 0.8) + '" ry="12" fill="#8fe6a8" opacity=".9"/>'; });
      return { defs: lin('s', ['#2a5cff', '#7a8cff', '#ff9ec0', '#ffe2b0']) + lin('w', ['#ffb98a', '#1f58b8', '#082a66']) + blur('b5', 5),
        body: '<rect width="' + W + '" height="' + H + '" fill="url(#s)"/>' + cloud(r, 300, 250, 560, '#fff', 0.7) + cloud(r, 1200, 190, 640, '#ffe6ee', 0.65) + '<circle cx="800" cy="640" r="120" fill="#fff4cc" opacity=".9"/><rect y="700" width="' + W + '" height="200" fill="url(#w)"/>' + t + '<g opacity=".4" transform="translate(0 1400) scale(1 -1)" filter="url(#b5)">' + t + '</g>' }; }],
    'fut-biotech': ['Bioluminescent grove', 'Futuristic', (r) => {
      let b = ''; for (let i = 0; i < 16; i++) { const x = r() * W, h = 300 + r() * 380, c = ['#27ffc9', '#7a8cff', '#ff5fd0', '#8fff6a'][i % 4]; b += '<path d="M' + f1(x) + ' ' + H + 'Q' + f1(x + (r() - 0.5) * 120) + ' ' + f1(H - h / 2) + ' ' + f1(x + (r() - 0.5) * 80) + ' ' + f1(H - h) + '" stroke="#05301f" stroke-width="' + f1(14 + r() * 18) + '" fill="none" stroke-linecap="round"/><circle cx="' + f1(x) + '" cy="' + f1(H - h) + '" r="' + f1(30 + r() * 40) + '" fill="' + c + '" opacity=".55" filter="url(#b9)"/>'; for (let k = 0; k < 9; k++) b += '<circle cx="' + f1(x + (r() - 0.5) * 140) + '" cy="' + f1(H - r() * h) + '" r="' + f1(2 + r() * 4) + '" fill="' + c + '"/>'; }
      return { defs: lin('s', ['#021510', '#06382e', '#0b5a4a']) + blur('b9', 12),
        body: '<rect width="' + W + '" height="' + H + '" fill="url(#s)"/>' + stars(r, 40, 300) + '<ellipse cx="800" cy="860" rx="900" ry="120" fill="#27ffc9" opacity=".18" filter="url(#b9)"/>' + b + '<g fill="#bfffe8">' + Array.from({ length: 50 }, () => '<circle cx="' + f1(r() * W) + '" cy="' + f1(r() * H) + '" r="' + (1 + r() * 2).toFixed(1) + '" opacity=".7"/>').join('') + '</g>' }; }],
    'fut-warp': ['Hyperspace jump', 'Futuristic', (r) => {
      let s = ''; for (let i = 0; i < 260; i++) { const a = r() * Math.PI * 2, d1 = 60 + r() * 500, d2 = d1 + 60 + r() * 520, c = ['#bfe6ff', '#fff', '#c9b6ff', '#ffd6f0'][i % 4]; s += '<path d="M' + f1(800 + Math.cos(a) * d1) + ' ' + f1(450 + Math.sin(a) * d1 * 0.6) + 'L' + f1(800 + Math.cos(a) * d2) + ' ' + f1(450 + Math.sin(a) * d2 * 0.6) + '" stroke="' + c + '" stroke-width="' + (0.8 + r() * 2.2).toFixed(1) + '" stroke-linecap="round" opacity="' + (0.35 + r() * 0.6).toFixed(2) + '"/>'; }
      return { defs: rad('c', [[0, '#ffffff'], [0.15, '#8fb8ff', 0.8], [0.6, '#3a1d9a', 0.5], [1, '#02030f', 0]]),
        body: '<rect width="' + W + '" height="' + H + '" fill="#02030f"/><ellipse cx="800" cy="450" rx="900" ry="560" fill="url(#c)"/>' + s + '<circle cx="800" cy="450" r="26" fill="#fff"/>' }; }],
    'fut-highway': ['Hover highway', 'Futuristic', (r) => {
      let t = ''; for (let i = 0; i < 26; i++) { const lane = Math.floor(r() * 5) - 2, d = r(), x = 800 + lane * (60 + d * 300), y = 470 + d * d * 420, w = 6 + d * 52; t += '<rect x="' + f1(x - w / 2) + '" y="' + f1(y) + '" width="' + f1(w) + '" height="' + f1(w * 0.4) + '" rx="' + f1(w * 0.18) + '" fill="' + (r() > 0.5 ? '#ff4f5e' : '#fff6c4') + '"/><rect x="' + f1(x - w / 2) + '" y="' + f1(y + w * 0.4) + '" width="' + f1(w) + '" height="' + f1(w * 1.2) + '" fill="#ff4f5e" opacity=".18"/>'; }
      return { defs: lin('s', ['#0d1a5e', '#6b3fb6', '#ff7aa8', '#ffd0a0']) + lin('rd', ['#2a2f5a', '#0d0f26']),
        body: '<rect width="' + W + '" height="' + H + '" fill="url(#s)"/>' + stars(r, 60, 260) + '<circle cx="800" cy="380" r="110" fill="#fff0cc" opacity=".9"/>' + Array.from({ length: 14 }, (_, i) => { const x = 40 + i * 118, h = 90 + ((i * 53) % 190); return '<rect x="' + x + '" y="' + (470 - h) + '" width="70" height="' + h + '" rx="6" fill="#241a55"/>'; }).join('') +
          '<path d="M0 900V470H1600V900Z" fill="url(#rd)"/><path d="M800 470L-400 900M800 470L400 900M800 470L1200 900M800 470L2000 900" stroke="#27e0ff" stroke-width="3" opacity=".7"/><path d="M800 470V900" stroke="#ffe27a" stroke-width="4" stroke-dasharray="14 18"/>' + t }; }],
  };

  const cache = {};
  const build = (id) => { const [, , draw] = SC[id]; const r = rng(id.length * 7919 + id.charCodeAt(id.length - 1) * 31); const { defs, body } = draw(r); return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid slice"><defs>' + defs + '</defs>' + body + '</svg>'; };
  const L = ulyOS.landscapes;
  const natureIds = L.list.map((x) => x[0]);
  const natureUrl = L.url;
  L.groups = [['Nature & landscapes', L.list.slice()]];
  ['Space', 'Anime-style', 'Futuristic'].forEach((grp) => L.groups.push([grp, Object.keys(SC).filter((k) => SC[k][1] === grp).map((k) => [k, SC[k][0]])]));
  L.list = L.groups.flatMap((g) => g[1]);
  L.url = (id) => (SC[id] ? cache[id] || (cache[id] = 'data:image/svg+xml,' + encodeURIComponent(build(id))) : natureUrl(id));
  L.isNature = (id) => natureIds.includes(id);

  /* Real photographs. Not bundled (they are large): each is loaded on demand from Wikimedia Commons, only after you
     choose it, as a resized copy. Every file below was checked on Commons as Public domain (NASA) or CC0. */
  const P = (key, label, file, credit) => ({ key, label, file, credit });
  L.photos = [
    P('saturn-equinox', 'Saturn at equinox', 'Saturn during Equinox.jpg', 'NASA/JPL-Caltech/Cassini · public domain'),
    P('saturn-cassini', 'Saturn from Cassini', 'Saturn from Cassini Orbiter (2004-10-06).jpg', 'NASA/JPL/Cassini · public domain'),
    P('saturn-farewell', 'A farewell to Saturn', 'PIA17218 – A Farewell to Saturn, Brightened Version.jpg', 'NASA/JPL-Caltech/Cassini · public domain'),
    P('saturn-eclipse', 'Saturn eclipse', 'Saturn eclipse.jpg', 'NASA/JPL/Cassini · public domain'),
    P('saturn-rings', 'Rings of Saturn', 'Top view of the rings of Saturn by Cassini - October 10, 2013.jpg', 'NASA/JPL/Cassini · public domain'),
    P('pillars', 'Pillars of Creation', 'Pillars of creation 2014 HST WFC3-UVIS full-res denoised.jpg', 'NASA/ESA Hubble · public domain'),
    P('horsehead', 'Horsehead and Flame nebulae', 'Ic434 Horsehead Nebula B33 Flame Nebula Ngc2024.jpg', 'Wikimedia Commons · CC0'),
    P('horsehead2', 'Horsehead nebula field', 'Horsehead flame nebula logoga.jpg', 'Wikimedia Commons · CC0'),
    P('earth-aurora', 'Aurora and cities from orbit', 'ISS-43 Earth sunrise, aurora and sparling cities in northern Europe.jpg', 'NASA / ISS · public domain'),
    P('earth-europe-night', 'Europe at night', 'ISS-65 Europe, city lights from space.jpg', 'NASA / ISS · public domain'),
    P('earth-java', 'Lights of Java', 'Lights of Java.jpg', 'NASA / ISS · public domain'),
    P('earth-japan', 'Japan city lights', 'City lights outline southern Japan from Fukuoka to Tokyo (iss073e0824492).jpg', 'NASA / ISS · public domain'),
    P('aurora-jem', 'Aurora from the Space Station', 'ISS-45 Aurora and Stars From the Space Station\'s JEM Window.jpg', 'NASA / ISS · public domain'),
    P('aurora-antarctica', 'Aurora above Antarctica', 'ISS-52 Aurora australis above Antarctica.jpg', 'NASA / ISS · public domain'),
    P('aurora-night', 'Aurora at night', 'Image of aurora at night from the ISS 01.jpg', 'NASA / ISS · public domain'),
    P('earthrise-orion', 'Earthrise (Artemis II, Orion)', 'Earthrise Captured by Orion (art002e016299).jpg', 'NASA · public domain'),
    P('milkyway-centre', 'Centre of the Milky Way', 'Center of the Milky Way Galaxy IV – Composite.jpg', 'NASA / ESA / CXC · public domain'),
    P('jupiter-grs', 'Jupiter, Great Red Spot', 'PIA00022 Jupiter Great Red Spot Mosaic.jpg', 'NASA/JPL · public domain'),
  ];
  L.photoUrl = (key, w = 1920) => { const p = L.photos.find((x) => x.key === key); return p ? 'https://commons.wikimedia.org/wiki/Special:FilePath/' + encodeURIComponent(p.file.replace(/ /g, '_')) + '?width=' + w : ''; };
})();
