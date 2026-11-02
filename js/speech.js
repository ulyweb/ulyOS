/* ==========================================================================
   ulyOS · js/speech.js — text-to-speech ("Speak" app, speaker buttons)
   Uses the browser's built-in speech engine (Web Speech API). Nothing is
   sent to any server by ulyOS; some browsers voices are cloud voices — pick
   one marked "local" if that matters to you.
   ========================================================================== */
(function () {
  'use strict';
  const { h, icon, store } = ulyOS.util;
  const { ui, WM } = ulyOS;
  const synth = window.speechSynthesis;
  const supported = !!(synth && window.SpeechSynthesisUtterance);
  const S = (ulyOS.Speech = { supported });
  const KEY = 'ulyos.speech';
  const DEF = { voice: '', rate: 1, pitch: 1, volume: 1, perWord: true };
  const prefs = () => { try { return { ...DEF, ...(JSON.parse(ulyOS.vault.get(KEY) || '{}')) }; } catch { return { ...DEF }; } };
  const save = (p) => ulyOS.vault.set(KEY, JSON.stringify(p));
  let voices = [];
  const loadVoices = () => { voices = supported ? synth.getVoices() : []; };
  if (supported) { loadVoices(); synth.addEventListener?.('voiceschanged', loadVoices); }

  /** Speak text now (replaces anything being spoken). Returns the utterance. */
  S.speak = function (text, o = {}) {
    if (!supported) { ui.toast('This browser has no speech engine', { type: 'err' }); return null; }
    text = String(text || '').trim().slice(0, 20000);
    if (!text) return null;
    const p = { ...prefs(), ...o };
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = voices.find((x) => x.voiceURI === p.voice);
    if (v) { u.voice = v; u.lang = v.lang; }
    u.rate = Math.min(3, Math.max(0.3, +p.rate || 1)); u.pitch = Math.min(2, Math.max(0, +p.pitch)); u.volume = Math.min(1, Math.max(0, +p.volume));
    if (o.onstart) u.onstart = o.onstart;
    if (o.onend) { u.onend = o.onend; u.onerror = o.onend; }
    setTimeout(() => synth.speak(u), 30);   // Chrome drops a speak() issued in the same tick as cancel()
    return u;
  };
  S.stop = () => { if (supported) synth.cancel(); };

  S.open = function () {
    const ex = WM.byApp('speak')[0];
    if (ex) { WM.focus(ex); return ex; }
    return WM.open({ appId: 'speak', title: 'Speak', icon: icon('volume', 16), width: 560, height: 520, minWidth: 360, minHeight: 380, mem: 8, render: build });
  };

  function build(win) {
    const p = prefs();
    if (!supported) return h('div', { class: 'spk' }, h('p', { class: 'set-desc', text: 'Your browser does not provide a speech engine, so ulyOS cannot speak. Chrome, Edge and Safari do.' }));
    const ta = h('textarea', { placeholder: 'Type or paste something… then press Speak.\nWith “speak each word as I type” on, every word is read out when you finish it.', spellcheck: false, 'aria-label': 'Text to speak' });
    const now = h('div', { class: 'spk-now' });
    const voiceSel = h('select', { class: 'input sm', 'aria-label': 'Voice' });
    const paintVoices = () => {
      loadVoices();
      const list = voices.slice().sort((a, b) => (a.lang + a.name).localeCompare(b.lang + b.name));
      voiceSel.replaceChildren(h('option', { value: '', text: 'Default voice' }), ...list.map((v) => h('option', { value: v.voiceURI, text: v.name + ' (' + v.lang + (v.localService ? ', local' : '') + ')', selected: v.voiceURI === p.voice })));
    };
    paintVoices(); synth.addEventListener?.('voiceschanged', paintVoices); setTimeout(paintVoices, 400);
    voiceSel.addEventListener('change', () => { p.voice = voiceSel.value; save(p); });
    const slider = (key, min, max, step, label, fmt) => {
      const out = h('b', { class: 'mono', text: fmt(p[key]) });
      const inp = h('input', { type: 'range', min, max, step, value: p[key], 'aria-label': label, oninput: () => { p[key] = +inp.value; out.textContent = fmt(p[key]); save(p); } });
      return h('label', {}, label, inp, out);
    };
    const speakAll = () => {
      const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd).trim();
      const text = sel || ta.value;
      if (!text.trim()) { ta.focus(); return; }
      S.speak(text, { onstart: () => { now.replaceChildren('Speaking…'); }, onend: () => { now.textContent = ''; } });
    };
    const perWord = h('input', { type: 'checkbox', checked: !!p.perWord, onchange: () => { p.perWord = perWord.checked; save(p); } });
    ta.addEventListener('input', (e) => {
      if (!perWord.checked) return;
      if (!(e.inputType === 'insertText' && /[\s.,!?;:]/.test(e.data || '')) && e.inputType !== 'insertLineBreak') return;
      const before = ta.value.slice(0, ta.selectionStart);
      const m = before.match(/([^\s.,!?;:]+)[\s.,!?;:]+$/);
      if (m) { S.speak(m[1], { onstart: () => { now.replaceChildren('Speaking: ', h('b', { text: m[1] })); }, onend: () => { now.textContent = ''; } }); }
    });
    const el = h('div', { class: 'spk' }, ta,
      h('div', { class: 'spk-row' },
        h('button', { class: 'btn primary speak-go', html: icon('volume', 14) + ' Speak', title: 'Speak the selection, or everything', onclick: speakAll }),
        h('button', { class: 'btn', html: icon('pause', 14) + ' Pause', onclick: () => synth.pause() }),
        h('button', { class: 'btn', html: icon('play', 14) + ' Resume', onclick: () => synth.resume() }),
        h('button', { class: 'btn', html: icon('stop', 14) + ' Stop', onclick: S.stop }),
        h('button', { class: 'btn', text: 'Clear', onclick: () => { ta.value = ''; ta.focus(); } })),
      h('div', { class: 'spk-row' }, h('label', {}, perWord, 'Speak each word as I type'), voiceSel),
      h('div', { class: 'spk-row' }, slider('rate', 0.5, 2, 0.1, 'Speed', (v) => (+v).toFixed(1) + '×'), slider('pitch', 0.5, 1.8, 0.1, 'Pitch', (v) => (+v).toFixed(1)), slider('volume', 0, 1, 0.05, 'Volume', (v) => Math.round(v * 100) + '%')),
      now);
    win.onClose = () => S.stop();
    setTimeout(() => ta.focus(), 60);
    return el;
  }
  ulyOS.bus.on('session:lock', () => S.stop());
})();
