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
  const DEF = { voice: '', rate: 1, pitch: 1, volume: 1, perWord: true, engine: '', bv: 'en/en-us' };
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

  /* ---------- save speech as .wav / .mp3 ----------
     Browsers do not hand over the audio of the built-in voices, so ulyOS records the tab's own audio
     (you pick "This tab" + "Share tab audio" once in the browser prompt), speaks the text, then encodes
     what was heard. Everything stays on your device. */
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  function encodeWav(pcm, rate) {
    const n = pcm.length, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    const str = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i])) * 0x7fff, true);
    return new Blob([buf], { type: 'audio/wav' });
  }
  const loadScript = (src, what) => new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = src; sc.onload = res; sc.onerror = () => rej(new Error(what + ' could not be loaded')); document.head.append(sc); });
  const loadLame = () => (window.lamejs ? Promise.resolve() : loadScript('vendor/lamejs.min.js', 'The MP3 encoder'));

  /* ---------- built-in voice (eSpeak): synthesizes the audio itself, so saving always works, offline too ---------- */
  const BUILTIN = [['en/en-us', 'English (US)'], ['en/en-rp', 'English (UK)'], ['en/en', 'English'], ['es', 'Spanish'], ['fr', 'French'], ['de', 'German'], ['it', 'Italian'], ['pt', 'Portuguese'], ['nl', 'Dutch'], ['pl', 'Polish'], ['sv', 'Swedish'], ['tr', 'Turkish']];
  S.builtinVoices = BUILTIN;
  const loadedVoices = new Set();
  let espeakReady = null;
  async function loadEspeak(voice) {
    if (!window.meSpeak) await loadScript('vendor/mespeak.js', 'The built-in voice engine');
    if (!espeakReady) espeakReady = fetch('vendor/espeak/mespeak_config.json').then((r) => { if (!r.ok) throw new Error('voice data missing'); return r.json(); }).then((cfg) => window.meSpeak.loadConfig(cfg));
    await espeakReady;
    if (!loadedVoices.has(voice)) {
      const r = await fetch('vendor/espeak/voices/' + voice + '.json'); if (!r.ok) throw new Error('voice data missing');
      const vj = await r.json();
      await new Promise((res) => window.meSpeak.loadVoice(vj, res)); loadedVoices.add(voice);
    }
  }
  /** Synthesize with the built-in voice → { pcm: Float32Array, rate } */
  S.synthesize = async function (text, o = {}) {
    text = String(text || '').trim();
    if (!text) throw new Error('Type something to speak first');
    const voice = BUILTIN.some((v) => v[0] === o.voice) ? o.voice : 'en/en-us', p = { ...prefs(), ...o };
    await loadEspeak(voice);
    const buf = window.meSpeak.speak(text.slice(0, 20000), {
      rawdata: 'default', voice, speed: Math.round(175 * Math.min(2, Math.max(0.5, +p.rate || 1))),
      pitch: Math.round(Math.min(99, Math.max(10, 50 * (+p.pitch || 1)))), amplitude: Math.round(Math.min(200, Math.max(10, 100 * (p.volume == null ? 1 : +p.volume)))),
    });
    if (!buf || buf.byteLength < 100) throw new Error('The built-in voice could not speak that text');
    const dv = new DataView(buf), rate = dv.getUint32(24, true), n = (buf.byteLength - 44) >> 1, pcm = new Float32Array(n);
    for (let i = 0; i < n; i++) pcm[i] = dv.getInt16(44 + i * 2, true) / 32768;
    return { pcm, rate };
  };
  /** Audio file (Blob) made with the built-in voice. */
  S.renderBuiltin = async function (text, fmt, o) {
    const { pcm, rate } = await S.synthesize(text, o);
    return fmt === 'mp3' ? encodeMp3(pcm, rate) : encodeWav(pcm, rate);
  };
  async function encodeMp3(pcm, rate) {
    await loadLame();
    const enc = new window.lamejs.Mp3Encoder(1, rate, 128), i16 = new Int16Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) i16[i] = Math.max(-1, Math.min(1, pcm[i])) * 0x7fff;
    const out = [];
    for (let i = 0; i < i16.length; i += 1152) { const b = enc.encodeBuffer(i16.subarray(i, i + 1152)); if (b.length) out.push(new Uint8Array(b)); }
    const end = enc.flush(); if (end.length) out.push(new Uint8Array(end));
    return new Blob(out, { type: 'audio/mpeg' });
  }
  S.CANT_RECORD = /Nothing was captured|No audio was shared/;   // errors where the built-in voice is the right fallback
  S.canRecord = !!(supported && navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia && window.MediaRecorder);
  /** Speak `text` and resolve with a Blob (audio/wav or audio/mpeg). */
  S.record = async function (text, fmt, status = () => {}) {
    if (!S.canRecord) throw new Error('This browser cannot record the tab’s audio (use Chrome or Edge on a computer)');
    text = String(text || '').trim();
    if (!text) throw new Error('Type something to speak first');
    // cloud voices (e.g. "Google UK English") are played by the browser outside the page and cannot be captured → use a local one
    let recVoice = prefs().voice;
    const chosen = voices.find((x) => x.voiceURI === recVoice);
    if (!chosen || !chosen.localService) {
      const lang = ((chosen && chosen.lang) || navigator.language || 'en').slice(0, 2).toLowerCase();
      const local = voices.find((x) => x.localService && x.lang.toLowerCase().startsWith(lang)) || voices.find((x) => x.localService);
      if (local) { recVoice = local.voiceURI; status('Using the local voice “' + local.name + '” for recording…'); }
    }
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true, preferCurrentTab: true, selfBrowserSurface: 'include', systemAudio: 'exclude', surfaceSwitching: 'exclude' });
    const stopAll = () => stream.getTracks().forEach((t) => t.stop());
    try {
      if (!stream.getAudioTracks().length) throw new Error('No audio was shared. Choose “This tab” and tick “Share tab audio” in the browser prompt, then try again.');
      stream.getVideoTracks().forEach((t) => { t.enabled = false; });
      const rec = new MediaRecorder(new MediaStream(stream.getAudioTracks()));
      const chunks = []; rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      const stopped = new Promise((r) => { rec.onstop = r; });
      rec.start(250); await sleep(400);
      status('Recording while speaking…');
      await new Promise((resolve) => {
        const guard = setTimeout(resolve, Math.min(15 * 60000, 8000 + text.length * 120));
        S.speak(text, { voice: recVoice, onend: () => { clearTimeout(guard); resolve(); } });
      });
      await sleep(700); rec.stop(); await stopped; stopAll();
      status('Encoding…');
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      const NOTHING = 'Nothing was captured. Some voices play outside the page and cannot be recorded — pick a different voice (a “local” one) and try again.';
      let audio;
      try { audio = await ac.decodeAudioData(await new Blob(chunks).arrayBuffer()); } catch { throw new Error(NOTHING); }
      const rate = audio.sampleRate, ch = audio.numberOfChannels, len = audio.length, mono = new Float32Array(len);
      for (let c = 0; c < ch; c++) { const d = audio.getChannelData(c); for (let i = 0; i < len; i++) mono[i] += d[i] / ch; }
      ac.close?.();
      let a = 0, b = len - 1; const th = 0.003;
      while (a < len && Math.abs(mono[a]) < th) a++;
      while (b > a && Math.abs(mono[b]) < th) b--;
      if (a >= b) throw new Error(NOTHING);
      const pad = Math.round(rate * 0.15);
      const pcm = mono.subarray(Math.max(0, a - pad), Math.min(len, b + pad));
      return fmt === 'mp3' ? await encodeMp3(pcm, rate) : encodeWav(pcm, rate);
    } finally { stopAll(); }
  };

  S.open = function () {
    const ex = WM.byApp('speak')[0];
    if (ex) { WM.focus(ex); return ex; }
    return WM.open({ appId: 'speak', title: 'Speak', icon: icon('volume', 16), width: 560, height: 520, minWidth: 360, minHeight: 380, mem: 8, render: build });
  };

  function build(win) {
    const p = prefs();
    const hasGem = () => !!(ulyOS.Gemini && ulyOS.Gemini.hasKey());
    if (!['browser', 'gemini', 'builtin'].includes(p.engine)) p.engine = hasGem() ? 'gemini' : (supported ? 'browser' : 'builtin');
    const ta = h('textarea', { placeholder: 'Type or paste something… then press Speak.\nWith the browser engine and “speak each word as I type” on, every word is read out when you finish it.', spellcheck: false, 'aria-label': 'Text to speak' });
    const now = h('div', { class: 'spk-now' });
    const stopAll = () => { S.stop(); if (ulyOS.Gemini) ulyOS.Gemini.stopPlay(); };

    /* ----- engine + its options ----- */
    const engSel = h('select', { class: 'input sm', 'aria-label': 'Voice engine', onchange: () => { p.engine = engSel.value; save(p); showEngine(); } },
      h('option', { value: 'browser', text: 'Browser voices (instant, cannot be saved directly)', disabled: !supported }),
      h('option', { value: 'gemini', text: 'Gemini voices (natural, whisper & styles — needs your API key)' }),
      h('option', { value: 'builtin', text: 'Built-in voice (robotic, offline, saves directly)' }));
    engSel.value = p.engine;
    const voiceSel = h('select', { class: 'input sm', 'aria-label': 'Browser voice' });
    const paintVoices = () => {
      loadVoices();
      const list = voices.slice().sort((a, b) => (a.lang + a.name).localeCompare(b.lang + b.name));
      voiceSel.replaceChildren(h('option', { value: '', text: 'Default voice' }), ...list.map((v) => h('option', { value: v.voiceURI, text: v.name + ' (' + v.lang + (v.localService ? ', local' : '') + ')', selected: v.voiceURI === p.voice })));
    };
    if (supported) { paintVoices(); synth.addEventListener?.('voiceschanged', paintVoices); setTimeout(paintVoices, 400); }
    voiceSel.addEventListener('change', () => { p.voice = voiceSel.value; save(p); });
    const perWord = h('input', { type: 'checkbox', checked: !!p.perWord, onchange: () => { p.perWord = perWord.checked; save(p); } });
    const gc = ulyOS.Gemini ? ulyOS.Gemini.config() : {};
    const gVoice = h('select', { class: 'input sm', 'aria-label': 'Gemini voice', onchange: () => ulyOS.Gemini.save({ voice: gVoice.value }) }, (ulyOS.Gemini ? ulyOS.Gemini.VOICES : []).map(([n, d]) => h('option', { value: n, text: n + ' — ' + d, selected: n === gc.voice })));
    const gStyle = h('select', { class: 'input sm', 'aria-label': 'Speaking style', onchange: () => ulyOS.Gemini.save({ style: gStyle.value }) }, (ulyOS.Gemini ? ulyOS.Gemini.STYLES : []).map(([v, l]) => h('option', { value: v, text: l, selected: v === gc.style })));
    const gKey = h('button', { class: 'btn sm', onclick: () => ulyOS.Gemini.keyDialog(paintKey)() });
    const paintKey = () => { gKey.textContent = hasGem() ? 'API key: ' + ulyOS.Gemini.config().key : 'Add API key…'; };
    paintKey();
    const bvSel = h('select', { class: 'input sm', 'aria-label': 'Built-in voice language', onchange: () => { p.bv = bvSel.value; save(p); } }, S.builtinVoices.map(([v, l]) => h('option', { value: v, text: l, selected: v === (p.bv || 'en/en-us') })));
    const gBox = h('div', { class: 'spk-row' }, h('label', {}, 'Voice', gVoice), h('label', {}, 'Style', gStyle), gKey, h('span', { class: 'set-desc', text: 'Style presets include “Whisper”. The key stays in your encrypted vault.' }));
    const bBox = h('div', { class: 'spk-row' }, h('label', {}, 'Language', bvSel));
    const brBox = h('div', { class: 'spk-row' }, h('label', {}, perWord, 'Speak each word as I type'), voiceSel);
    const showEngine = () => { gBox.hidden = p.engine !== 'gemini'; bBox.hidden = p.engine !== 'builtin'; brBox.hidden = p.engine !== 'browser'; };
    showEngine();
    const slider = (key, min, max, step, label, fmt) => {
      const out = h('b', { class: 'mono', text: fmt(p[key]) });
      const inp = h('input', { type: 'range', min, max, step, value: p[key], 'aria-label': label, oninput: () => { p[key] = +inp.value; out.textContent = fmt(p[key]); save(p); } });
      return h('label', {}, label, inp, out);
    };

    /* ----- synthesis for the non-browser engines ----- */
    const render = async (text) => {   // → { pcm, rate }
      if (p.engine === 'gemini') { now.textContent = 'Asking Gemini…'; return ulyOS.Gemini.tts(text, { voice: gVoice.value, style: gStyle.value }); }
      now.textContent = 'Creating audio…';
      return S.synthesize(text, { voice: p.bv || 'en/en-us' });
    };
    const selectedText = () => { const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd).trim(); return sel || ta.value; };
    const speakAll = async () => {
      const text = selectedText();
      if (!text.trim()) { ta.focus(); return; }
      stopAll();
      if (p.engine === 'browser') { S.speak(text, { onstart: () => { now.replaceChildren('Speaking…'); }, onend: () => { now.textContent = ''; } }); return; }
      try { const { pcm, rate } = await render(text); now.textContent = 'Speaking…'; ulyOS.Gemini.playPcm(pcm, rate, () => { now.textContent = ''; }); }
      catch (err) { now.textContent = ''; ui.toast(err.message, { type: 'err', timeout: 7000 }); }
    };
    const fmtSel = h('select', { class: 'input sm', 'aria-label': 'Audio format' }, h('option', { value: 'wav', text: 'WAV (lossless)' }), h('option', { value: 'mp3', text: 'MP3 (smaller)' }));

    /** Ask where to put a file: the encrypted Files sandbox (Documents/Speak) and/or a normal download. */
    const saveFile = async (blob, defName, kind) => {
      const v = await ui.form({ title: 'Save ' + kind, message: 'Choose a name and where to keep it.', okText: 'Save',
        fields: [
          { name: 'name', label: 'File name', value: defName },
          { name: 'where', label: 'Save to', type: 'select', value: 'both', options: [
            { value: 'both', label: 'Files (encrypted in ulyOS) and download a copy' }, { value: 'files', label: 'Files only — Documents/Speak (encrypted)' }, { value: 'download', label: 'Download only' }] },
        ], validate: (x) => (/^[^\\/:*?"<>|]{1,80}$/.test((x.name || '').trim()) ? null : 'Use a simple file name (no / \\ : * ? " < > |)') });
      if (!v) return false;
      const name = v.name.trim();
      if (v.where !== 'download') {
        try { await ulyOS.FS.writeSandboxFile('Documents/Speak/' + name, blob); } catch (e) { ui.toast('Could not save to Files: ' + e.message, { type: 'err' }); if (v.where === 'files') return false; }
      }
      if (v.where !== 'files') { const a = h('a', { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
      ui.toast('Saved ' + name + (v.where === 'download' ? '' : ' in Files → Documents → Speak'), { type: 'ok' });
      ulyOS.audit("Speak: saved '" + name + "' (" + blob.size + ' bytes)', 'ok');
      return true;
    };
    const encodeFrom = async ({ pcm, rate }, fmt) => (fmt === 'mp3' ? encodeMp3(pcm, rate) : encodeWav(pcm, rate));
    const recordFlow = async (text, fmt, name, kind) => {
      if (!S.canRecord) { ui.toast('This browser cannot record the tab’s audio — pick the Built-in or Gemini engine', { type: 'err', timeout: 6000 }); return; }
      if (!(await ui.confirm({ title: 'Record this browser voice', message: 'Browsers do not hand web pages the audio of their own voices, so the only way to keep it is to record it while it plays. Your browser will ask what to share: choose “This tab” and tick “Share tab audio”. Nothing leaves your device.', okText: 'Continue' }))) return;
      try { const blob = await S.record(text, fmt, (m) => { now.textContent = m; }); now.textContent = ''; await saveFile(blob, name, kind); }
      catch (err) {
        now.textContent = ''; S.stop();
        if (err.name === 'NotAllowedError') { ui.toast('Recording was cancelled', { type: 'info' }); return; }
        ui.toast(err.message + (S.CANT_RECORD.test(err.message) ? ' — choose the Built-in or Gemini engine to save this text.' : ''), { type: 'err', timeout: 8000 });
      }
    };
    const saveAudio = async () => {
      const text = selectedText();
      if (!text.trim()) { ta.focus(); ui.toast('Type something to speak first', { type: 'info' }); return; }
      const fmt = fmtSel.value, name = 'speech-' + ulyOS.util.stamp() + '.' + fmt, kind = fmt.toUpperCase() + ' audio';
      let engine = p.engine;
      if (engine === 'browser') {
        const c = await ui.choose({ title: 'Saving a browser voice', message: 'Browsers keep the audio of their own voices to themselves, so a page cannot export it directly. Choose how to continue:',
          choices: [{ label: 'Cancel', value: null }, { label: 'Record it (needs tab audio)', value: 'record' }, { label: 'Built-in voice (robotic)', value: 'builtin' }, { label: 'Gemini voice (natural)', value: 'gemini', primary: true }] });
        if (!c) return;
        if (c === 'record') { await recordFlow(text, fmt, name, kind); return; }
        if (c === 'gemini' && !hasGem()) { await ulyOS.Gemini.keyDialog(paintKey)(); if (!hasGem()) return; }
        engine = c;
      }
      try {
        let audio;
        if (engine === 'gemini') { now.textContent = 'Asking Gemini…'; audio = await ulyOS.Gemini.tts(text, { voice: gVoice.value, style: gStyle.value }); }
        else { now.textContent = 'Creating audio…'; audio = await S.synthesize(text, { voice: p.bv || 'en/en-us' }); }
        const blob = await encodeFrom(audio, fmt); now.textContent = '';
        await saveFile(blob, name, kind);
      } catch (err) { now.textContent = ''; ui.toast(err.message, { type: 'err', timeout: 7000 }); }
    };
    const saveText = async () => {
      if (!ta.value.trim()) { ta.focus(); ui.toast('Nothing to save yet — type something first', { type: 'info' }); return; }
      await saveFile(new Blob([ta.value], { type: 'text/plain' }), 'speak-' + ulyOS.util.stamp() + '.txt', 'text');
    };
    const openText = () => {
      const inp = h('input', { type: 'file', accept: '.txt,.md,text/plain' });
      inp.addEventListener('change', async () => { const f = inp.files[0]; if (!f) return; if (f.size > 1e6) { ui.toast('That file is too large (1 MB max)', { type: 'err' }); return; } ta.value = (await f.text()).slice(0, 20000); ta.focus(); });
      inp.click();
    };
    ta.addEventListener('input', (e) => {
      if (p.engine !== 'browser' || !perWord.checked) return;
      if (!(e.inputType === 'insertText' && /[\s.,!?;:]/.test(e.data || '')) && e.inputType !== 'insertLineBreak') return;
      const before = ta.value.slice(0, ta.selectionStart);
      const m = before.match(/([^\s.,!?;:]+)[\s.,!?;:]+$/);
      if (m) { S.speak(m[1], { onstart: () => { now.replaceChildren('Speaking: ', h('b', { text: m[1] })); }, onend: () => { now.textContent = ''; } }); }
    });
    const el = h('div', { class: 'spk' }, ta,
      h('div', { class: 'spk-row' }, h('b', { text: 'Voice' }), engSel),
      brBox, gBox, bBox,
      h('div', { class: 'spk-row' },
        h('button', { class: 'btn primary speak-go', html: icon('volume', 14) + ' Speak', title: 'Speak the selection, or everything', onclick: speakAll }),
        h('button', { class: 'btn', html: icon('pause', 14) + ' Pause', onclick: () => { if (supported) synth.pause(); ulyOS.Gemini?.pausePlay?.(); } }),
        h('button', { class: 'btn', html: icon('play', 14) + ' Resume', onclick: () => { if (supported) synth.resume(); ulyOS.Gemini?.resumePlay?.(); } }),
        h('button', { class: 'btn', html: icon('stop', 14) + ' Stop', onclick: stopAll }),
        h('button', { class: 'btn', text: 'Clear', onclick: () => { ta.value = ''; ta.focus(); } }),
        h('span', { class: 'grow' }),
        h('button', { class: 'btn', html: icon('save', 14) + ' Save text…', onclick: saveText }),
        h('button', { class: 'btn', html: icon('upload', 14) + ' Open…', onclick: openText })),
      h('div', { class: 'spk-row spk-save' },
        h('b', { text: 'Save as audio' }), fmtSel,
        h('button', { class: 'btn', html: icon('download', 14) + ' Save audio…', title: 'Create a WAV or MP3 file from the text', onclick: saveAudio }),
        h('span', { class: 'set-desc', text: 'Gemini and Built-in voices are exported directly. Browser voices can only be recorded while they play.' })),
      h('div', { class: 'spk-row' }, slider('rate', 0.5, 2, 0.1, 'Speed', (v) => (+v).toFixed(1) + '×'), slider('pitch', 0.5, 1.8, 0.1, 'Pitch', (v) => (+v).toFixed(1)), slider('volume', 0, 1, 0.05, 'Volume', (v) => Math.round(v * 100) + '%')),
      now);
    win.onClose = () => stopAll();
    setTimeout(() => ta.focus(), 60);
    return el;
  }
  ulyOS.bus.on('session:lock', () => S.stop());
})();
