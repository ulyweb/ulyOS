/* ==========================================================================
   ulyOS · js/gemini.js — Google Gemini voices and Gemini Live
   • Gemini.tts(): natural text-to-speech (many voices, style prompts such as
     "whisper") → audio you can play or export as WAV / MP3.
   • "Live" app: a real-time voice conversation with Gemini over a WebSocket.
   You bring your own API key (https://aistudio.google.com/apikey). It is kept
   only inside your encrypted ulyOS vault and is sent only to
   generativelanguage.googleapis.com. Nothing else is contacted.
   ========================================================================== */
(function () {
  'use strict';
  const { h, icon } = ulyOS.util;
  const { ui, WM, bus } = ulyOS;
  const G = (ulyOS.Gemini = {});
  const KEY = 'ulyos.gemini';
  const HOST = 'generativelanguage.googleapis.com';
  const DEF = { key: '', ttsModel: 'gemini-2.5-flash-preview-tts', liveModel: 'gemini-live-2.5-flash-preview', voice: 'Kore', style: '' };
  const get = () => { try { return { ...DEF, ...JSON.parse(ulyOS.vault.get(KEY) || '{}') }; } catch { return { ...DEF }; } };
  const set = (patch) => ulyOS.vault.set(KEY, JSON.stringify({ ...get(), ...patch }));
  G.config = () => { const c = get(); return { ...c, key: c.key ? '••••' + c.key.slice(-4) : '' }; };
  G.hasKey = () => !!get().key;
  G.setKey = (k) => { k = String(k || '').trim(); if (k && !/^[\w-]{20,200}$/.test(k)) throw new Error('That does not look like a Gemini API key'); set({ key: k }); };
  G.save = (patch) => { const ok = {}; for (const k of ['ttsModel', 'liveModel', 'voice', 'style']) if (typeof patch[k] === 'string') ok[k] = patch[k].slice(0, 200); set(ok); };

  /** [name, character] — the prebuilt voices of the Gemini speech models */
  G.VOICES = [['Kore', 'firm'], ['Puck', 'upbeat'], ['Charon', 'informative'], ['Zephyr', 'bright'], ['Fenrir', 'excitable'], ['Leda', 'youthful'], ['Orus', 'firm'], ['Aoede', 'breezy'], ['Callirrhoe', 'easy-going'], ['Autonoe', 'bright'], ['Enceladus', 'breathy'], ['Iapetus', 'clear'], ['Umbriel', 'easy-going'], ['Algieba', 'smooth'], ['Despina', 'smooth'], ['Erinome', 'clear'], ['Algenib', 'gravelly'], ['Rasalgethi', 'informative'], ['Laomedeia', 'upbeat'], ['Achernar', 'soft'], ['Alnilam', 'firm'], ['Schedar', 'even'], ['Gacrux', 'mature'], ['Pulcherrima', 'forward'], ['Achird', 'friendly'], ['Zubenelgenubi', 'casual'], ['Vindemiatrix', 'gentle'], ['Sadachbia', 'lively'], ['Sadaltager', 'knowledgeable'], ['Sulafat', 'warm']];
  /** style presets — the model follows plain-language direction placed before the text */
  G.STYLES = [['', 'Natural'], ['Say in a soft whisper', 'Whisper'], ['Say calmly and slowly in a soothing voice', 'Calm'], ['Say cheerfully and with energy', 'Cheerful'], ['Read like a warm bedtime storyteller', 'Storyteller'], ['Read like a professional news anchor', 'News anchor'], ['Say in a deep, dramatic movie-trailer voice', 'Dramatic'], ['Say in a friendly, casual way', 'Casual']];

  const b64ToBytes = (b) => { const s = atob(b), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
  const bytesToB64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  /** 16-bit little-endian PCM bytes → Float32 */
  const pcm16 = (u8) => { const n = u8.length >> 1, f = new Float32Array(n), dv = new DataView(u8.buffer, u8.byteOffset, n * 2); for (let i = 0; i < n; i++) f[i] = dv.getInt16(i * 2, true) / 32768; return f; };

  const apiError = async (r) => {
    let msg = '';
    try { const j = await r.json(); msg = (j.error && j.error.message) || ''; } catch { /* not JSON */ }
    if (r.status === 400 && /API key/i.test(msg)) return new Error('Google rejected the API key — check it in Settings → Gemini (Speak or Live)');
    if (r.status === 401 || r.status === 403) return new Error('Google refused the request (' + r.status + '): ' + (msg || 'the key is not allowed to use this model').slice(0, 200));
    if (r.status === 404) return new Error('Model not found: ' + (msg || 'check the model name').slice(0, 200));
    if (r.status === 429) return new Error('Google says the free quota is used up or you are going too fast (429). Wait a bit and retry.');
    return new Error('Gemini error ' + r.status + (msg ? ': ' + msg.slice(0, 200) : ''));
  };

  /** Text → natural speech. Resolves { pcm: Float32Array, rate }. */
  G.tts = async function (text, o = {}) {
    const c = { ...get(), ...o };
    if (!c.key) throw new Error('Add your Gemini API key first');
    text = String(text || '').trim();
    if (!text) throw new Error('Type something to speak first');
    const prompt = (c.style ? c.style.trim() + ': ' : '') + text.slice(0, 4000);
    let r;
    try {
      r = await fetch('https://' + HOST + '/v1beta/models/' + encodeURIComponent(c.ttsModel) + ':generateContent', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': c.key },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: c.voice } } } } }),
      });
    } catch { throw new Error('Could not reach Google (offline, or blocked)'); }
    if (!r.ok) throw await apiError(r);
    const j = await r.json();
    const part = j.candidates && j.candidates[0] && j.candidates[0].content && (j.candidates[0].content.parts || []).find((p) => p.inlineData && p.inlineData.data);
    if (!part) throw new Error('Gemini returned no audio (the text may have been blocked or too long)');
    const mime = part.inlineData.mimeType || '';
    const rate = +(/rate=(\d+)/.exec(mime) || [])[1] || 24000;
    return { pcm: pcm16(b64ToBytes(part.inlineData.data)), rate };
  };

  /* ---------- play PCM (shared by Speak) ---------- */
  let playCtx = null, playing = null;
  G.playPcm = function (pcm, rate, onend) {
    G.stopPlay();
    playCtx = playCtx || new (window.AudioContext || window.webkitAudioContext)();
    playCtx.resume?.();
    const buf = playCtx.createBuffer(1, pcm.length, rate); buf.copyToChannel(pcm, 0);
    const src = playCtx.createBufferSource(); src.buffer = buf; src.connect(playCtx.destination);
    src.onended = () => { if (playing === src) playing = null; if (onend) onend(); };
    playing = src; src.start();
    return src;
  };
  G.pausePlay = () => { if (playCtx && playing) playCtx.suspend(); };
  G.resumePlay = () => { if (playCtx) playCtx.resume(); };
  G.stopPlay = () => { if (playing) { const p = playing; playing = null; p.onended = null; try { p.stop(); } catch { /* ignore */ } } };

  /* ======================================================================
     Gemini Live — real-time voice chat
     ====================================================================== */
  /** Opens a Live session. Callbacks: onState(text), onInText(t), onOutText(t), onTurn(), onLevel(0..1), onError(msg), onClose(). */
  G.live = async function (o) {
    const c = { ...get(), ...o.config };
    if (!c.key) throw new Error('Add your Gemini API key first');
    const url = 'wss://' + HOST + '/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=' + encodeURIComponent(c.key);
    const ws = new WebSocket(url);
    const S = { ws, ctx: null, mic: null, node: null, nextAt: 0, sources: new Set(), played: 0, sent: 0, closed: false };
    const textOf = async (d) => (typeof d === 'string' ? d : d instanceof Blob ? d.text() : new TextDecoder().decode(d));
    const flush = () => { S.sources.forEach((s) => { try { s.stop(); } catch { /* ignore */ } }); S.sources.clear(); S.nextAt = 0; };
    const play = (b64, rate) => {
      const f = pcm16(b64ToBytes(b64));
      const buf = S.ctx.createBuffer(1, f.length, rate); buf.copyToChannel(f, 0);
      const src = S.ctx.createBufferSource(); src.buffer = buf; src.connect(S.ctx.destination);
      const at = Math.max(S.ctx.currentTime + 0.03, S.nextAt); src.start(at); S.nextAt = at + buf.duration;
      S.sources.add(src); src.onended = () => S.sources.delete(src); S.played++;
    };
    const send = (m) => { if (ws.readyState === 1) ws.send(JSON.stringify(m)); };
    S.sendText = (t) => { t = String(t || '').trim(); if (!t) return; send({ clientContent: { turns: [{ role: 'user', parts: [{ text: t }] }], turnComplete: true } }); };
    S.close = () => {
      if (S.closed) return; S.closed = true;
      try { send({ realtimeInput: { audioStreamEnd: true } }); } catch { /* ignore */ }
      try { ws.close(); } catch { /* ignore */ }
      flush();
      try { S.node && S.node.disconnect(); } catch { /* ignore */ }
      if (S.mic) S.mic.getTracks().forEach((t) => t.stop());
      try { S.ctx && S.ctx.close(); } catch { /* ignore */ }
      o.onClose && o.onClose();
    };
    ws.onopen = () => {
      o.onState && o.onState('Connected — setting up…');
      send({ setup: {
        model: 'models/' + c.liveModel.replace(/^models\//, ''),
        generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: c.voice } } } },
        ...(c.persona ? { systemInstruction: { parts: [{ text: String(c.persona).slice(0, 4000) }] } } : {}),
        inputAudioTranscription: {}, outputAudioTranscription: {},
      } });
    };
    ws.onerror = () => { o.onError && o.onError('The connection to Google failed (check the key, the model name and your network)'); };
    ws.onclose = (e) => { if (!S.closed) { if (o.onError && e.code !== 1000) o.onError('Closed by Google' + (e.reason ? ': ' + e.reason.slice(0, 160) : ' (code ' + e.code + ')')); S.close(); } };
    S.ready = new Promise((resolve, reject) => { S._res = resolve; S._rej = reject; });
    ws.onmessage = async (e) => {
      let m; try { m = JSON.parse(await textOf(e.data)); } catch { return; }
      if (m.setupComplete) { S._res(); return; }
      if (m.error) { const msg = (m.error.message || 'error').slice(0, 200); S._rej(new Error(msg)); o.onError && o.onError(msg); return; }
      const sc = m.serverContent; if (!sc) return;
      if (sc.interrupted) flush();
      if (sc.inputTranscription && sc.inputTranscription.text) o.onInText && o.onInText(sc.inputTranscription.text);
      if (sc.outputTranscription && sc.outputTranscription.text) o.onOutText && o.onOutText(sc.outputTranscription.text);
      if (sc.modelTurn) for (const p of sc.modelTurn.parts || []) if (p.inlineData && p.inlineData.data && /audio\/pcm/i.test(p.inlineData.mimeType || 'audio/pcm')) play(p.inlineData.data, +(/rate=(\d+)/.exec(p.inlineData.mimeType || '') || [])[1] || 24000);
      if (sc.turnComplete) o.onTurn && o.onTurn();
    };
    await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('Timed out connecting to Google')), 15000); ws.addEventListener('open', () => { clearTimeout(t); res(); }, { once: true }); ws.addEventListener('error', () => { clearTimeout(t); rej(new Error('The connection to Google failed (check the key and your network)')); }, { once: true }); });
    await Promise.race([S.ready, new Promise((_, rej) => setTimeout(() => rej(new Error('Google did not answer the setup (check the model name)')), 15000))]).catch((e) => { S.close(); throw e; });
    o.onState && o.onState('Ready'); G._session = S;
    S.ctx = new (window.AudioContext || window.webkitAudioContext)(); S.ctx.resume?.();
    if (o.mic !== false) {
      try {
        S.mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
        await S.ctx.audioWorklet.addModule('js/live-worklet.js');
        const src = S.ctx.createMediaStreamSource(S.mic);
        S.node = new AudioWorkletNode(S.ctx, 'ulyos-pcm16', { processorOptions: { target: 16000 } });
        S.node.port.onmessage = (ev) => {
          const { pcm, level } = ev.data;
          o.onLevel && o.onLevel(level);
          send({ realtimeInput: { audio: { data: bytesToB64(new Uint8Array(pcm)), mimeType: 'audio/pcm;rate=16000' } } }); S.sent++;
        };
        src.connect(S.node);
        const mute = S.ctx.createGain(); mute.gain.value = 0; S.node.connect(mute); mute.connect(S.ctx.destination);   // keeps the graph running without echoing the mic
      } catch (err) { S.close(); throw new Error(err && err.name === 'NotAllowedError' ? 'Microphone permission was denied' : 'Could not use the microphone: ' + (err && err.message)); }
    }
    return S;
  };

  /* ---------- the Live app ---------- */
  G.openLive = function () {
    const ex = WM.byApp('live')[0];
    if (ex) { WM.focus(ex); return ex; }
    return WM.open({ appId: 'live', title: 'Gemini Live', icon: icon('mic', 16), width: 560, height: 700, minWidth: 380, minHeight: 460, mem: 14, render: buildLive, onClose: () => { if (G._liveClose) G._liveClose(); } });
  };

  function keyForm(onSaved) {
    return async () => {
      const v = await ui.form({ title: 'Gemini API key', message: 'Get a key at aistudio.google.com/apikey. It is stored only in your encrypted ulyOS vault and sent only to ' + HOST + '. Leave empty to remove it.',
        fields: [{ name: 'key', label: 'API key', type: 'password' }], okText: 'Save', validate: (x) => { try { if (x.key) G.setKey(x.key); else G.setKey(''); return null; } catch (e) { return e.message; } } });
      if (v) { ui.toast(G.hasKey() ? 'API key saved' : 'API key removed', { type: 'ok' }); if (onSaved) onSaved(); }
    };
  }
  G.keyDialog = keyForm;

  function buildLive() {
    const c0 = get();
    let session = null, busy = false;
    const log = h('div', { class: 'lv-log', role: 'log', 'aria-live': 'polite' });
    const status = h('div', { class: 'lv-status', text: 'Not connected' });
    const meter = h('i');
    const voiceSel = h('select', { class: 'input sm', 'aria-label': 'Voice', onchange: () => G.save({ voice: voiceSel.value }) }, G.VOICES.map(([n, d]) => h('option', { value: n, text: n + ' — ' + d, selected: n === c0.voice })));
    const modelIn = h('input', { class: 'input sm', value: c0.liveModel, 'aria-label': 'Live model', list: 'lv-models', onchange: () => G.save({ liveModel: modelIn.value.trim() || DEF.liveModel }), style: { width: '230px' } });
    const models = h('datalist', { id: 'lv-models' }, ['gemini-live-2.5-flash-preview', 'gemini-2.5-flash-native-audio-preview-09-2025', 'gemini-2.0-flash-live-001'].map((m) => h('option', { value: m })));
    const persona = h('textarea', { class: 'input', rows: 2, placeholder: 'Optional: how should Gemini behave? e.g. “Speak softly and keep answers short.”', 'aria-label': 'Instructions', maxLength: 1000 });
    const text = h('input', { class: 'input', placeholder: 'Or type a message…', 'aria-label': 'Message', maxLength: 2000, disabled: true });
    const btn = h('button', { class: 'btn primary lv-go', html: icon('mic', 15) + ' Start talking' });
    const line = (who, t) => { const el = h('div', { class: 'lv-line ' + who }, h('b', { text: who === 'me' ? 'You' : 'Gemini' }), h('span', { text: t })); log.append(el); log.scrollTop = log.scrollHeight; return el; };
    let curMe = null, curAi = null;
    const addPart = (who, t) => { let cur = who === 'me' ? curMe : curAi; if (!cur) { cur = line(who, ''); if (who === 'me') curMe = cur; else curAi = cur; } cur.lastChild.textContent += t; log.scrollTop = log.scrollHeight; };
    const keyBtn = h('button', { class: 'btn sm', onclick: keyForm(paint) });
    function paint() { keyBtn.textContent = G.hasKey() ? 'API key: ' + G.config().key + ' (change)' : 'Add API key…'; btn.disabled = busy; }
    const setRunning = (on) => { btn.innerHTML = on ? icon('stop', 15) + ' Stop' : icon('mic', 15) + ' Start talking'; btn.classList.toggle('danger', on); text.disabled = !on; voiceSel.disabled = on; modelIn.disabled = on; persona.disabled = on; };
    const stop = () => { if (session) { const s = session; session = null; s.close(); } };
    G._liveClose = stop;
    btn.addEventListener('click', async () => {
      if (session) { stop(); return; }
      if (!G.hasKey()) { await keyForm(paint)(); if (!G.hasKey()) return; }
      busy = true; paint(); status.textContent = 'Connecting…'; curMe = curAi = null;
      try {
        session = await G.live({ config: { voice: voiceSel.value, liveModel: modelIn.value.trim() || DEF.liveModel, persona: persona.value.trim() },
          onState: (s) => { status.textContent = s; }, onInText: (t) => addPart('me', t), onOutText: (t) => addPart('ai', t),
          onTurn: () => { curMe = curAi = null; status.textContent = 'Listening…'; }, onLevel: (l) => { meter.style.width = Math.min(100, l * 260) + '%'; },
          onError: (m) => { status.textContent = m; if (session) ui.toast(m, { type: 'err', timeout: 7000 }); }, onClose: () => { session = null; setRunning(false); meter.style.width = '0'; if (!/failed|Closed|refused|rejected/i.test(status.textContent)) status.textContent = 'Not connected'; } });
        setRunning(true); status.textContent = 'Listening… just talk'; ulyOS.audit('Gemini Live session started', 'info'); text.focus();
      } catch (e) { session = null; status.textContent = e.message; ui.toast(e.message, { type: 'err', timeout: 7000 }); setRunning(false); }
      busy = false; paint();
    });
    text.addEventListener('keydown', (e) => { if (e.key === 'Enter' && session && text.value.trim()) { e.preventDefault(); line('me', text.value.trim()); session.sendText(text.value); text.value = ''; curMe = curAi = null; } });
    paint();
    bus.on('session:lock', stop);
    return h('div', { class: 'lv' },
      h('div', { class: 'lv-top' }, h('div', {}, h('b', { text: 'Gemini Live' }), h('div', { class: 'set-desc', text: 'Talk with Gemini in real time. Your voice goes directly from this page to Google; nothing passes through ulyOS or any other server.' })), keyBtn),
      h('div', { class: 'lv-opts' }, voiceSel, modelIn, models), persona,
      h('div', { class: 'lv-live' }, btn, h('div', { class: 'lv-meter' }, meter), status),
      log, text,
      h('div', { class: 'set-desc', text: 'Use headphones to avoid echo. Needs a microphone, HTTPS or localhost, and your own API key; usage is billed or limited by Google under your key.' }));
  }
})();
