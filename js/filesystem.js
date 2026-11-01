/* ==========================================================================
   ulyOS · js/filesystem.js
   File Manager backed by the real File System Access API:
     • "Sandbox"      → Origin Private File System (OPFS), always available
     • "Local folder" → a directory the user mounts via showDirectoryPicker()
   Features: browse, create folders/files, text editor, media viewer, upload
   (button + OS drag-and-drop), download, rename, copy/cut/paste, drag-to-move, delete.
   ========================================================================== */
(function () {
  'use strict';

  const { h, icon, fmtBytes, clamp } = ulyOS.util;
  const { WM, ui, bus } = ulyOS;
  const FS = (ulyOS.FS = {});

  const roots = {
    sandbox: { id: 'sandbox', label: 'Sandbox', handle: null, error: null },
    local: { id: 'local', label: 'Local folder', handle: null, stored: null },
  };
  FS.roots = roots;

  /* ---------------- IndexedDB (persist the mounted local directory handle) ---------------- */
  function idb() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('ulyos-fs', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  async function idbGet(k) { try { const db = await idb(); return await new Promise((res, rej) => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); } catch { return null; } }
  async function idbSet(k, v) { try { const db = await idb(); await new Promise((res, rej) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); } catch { /* ignore */ } }
  async function idbDel(k) { try { const db = await idb(); await new Promise((res) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').delete(k); tx.oncomplete = res; }); } catch { /* ignore */ } }

  /* ---------------- Low-level helpers ---------------- */
  const BAD_NAME = /[\\/:*?"<>|\x00-\x1f]/;
  function validName(n) {
    n = (n || '').trim();
    if (!n) return 'Name cannot be empty';
    if (n === '.' || n === '..') return 'Invalid name';
    if (BAD_NAME.test(n)) return 'Name cannot contain \\ / : * ? " < > |';
    if (n.length > 200) return 'Name is too long';
    return null;
  }
  const extOf = (n) => { const i = n.lastIndexOf('.'); return i > 0 ? n.slice(i + 1).toLowerCase() : ''; };

  async function exists(dir, name) {
    try { await dir.getFileHandle(name); return 'file'; } catch (e) { if (e.name === 'TypeMismatchError') return 'directory'; }
    try { await dir.getDirectoryHandle(name); return 'directory'; } catch { /* not found */ }
    return null;
  }
  async function uniqueName(dir, name, suffix = ' copy') {
    if (!(await exists(dir, name))) return name;
    const i = name.lastIndexOf('.');
    const base = i > 0 ? name.slice(0, i) : name, ext = i > 0 ? name.slice(i) : '';
    for (let n = 1; n < 1000; n++) {
      const cand = base + (n === 1 ? suffix : suffix + ' ' + n) + ext;
      if (!(await exists(dir, cand))) return cand;
    }
    return base + '-' + Date.now() + ext;
  }
  async function writeFile(dir, name, data) {
    const fh = await dir.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    try { await w.write(data); } finally { await w.close(); }
    return fh;
  }
  async function copyEntry(src, dstDir, newName) {
    if (src.kind === 'file') {
      const f = await src.getFile();
      await writeFile(dstDir, newName, f);
    } else {
      const nd = await dstDir.getDirectoryHandle(newName, { create: true });
      for await (const [n, hd] of src.entries()) await copyEntry(hd, nd, n);
    }
  }
  /** copy/move named entries from srcDir into dstDir. Returns count. */
  async function transfer(srcDir, names, dstDir, move) {
    if (move && (await srcDir.isSameEntry(dstDir))) return 0;
    let n = 0;
    for (const name of names) {
      let hd;
      try { hd = await srcDir.getFileHandle(name); } catch { hd = await srcDir.getDirectoryHandle(name); }
      if (hd.kind === 'directory' && (await hd.resolve(dstDir)) !== null) throw new Error("Can't copy a folder into itself");
      const target = await uniqueName(dstDir, name);
      await copyEntry(hd, dstDir, target);
      if (move) await srcDir.removeEntry(name, { recursive: true });
      n++;
    }
    return n;
  }
  const changed = () => bus.emit('fs:change');
  async function walkTo(root, parts) {
    let d = root;
    for (const p of parts) d = await d.getDirectoryHandle(p, { create: true });
    return d;
  }

  /* ---------------- Public API ---------------- */
  FS.init = async function () {
    try {
      if (!navigator.storage || !navigator.storage.getDirectory) throw new Error('OPFS is not supported in this browser');
      const root = await navigator.storage.getDirectory();
      const base = await root.getDirectoryHandle('ulyos-home', { create: true });
      const home = await base.getDirectoryHandle(ulyOS.security.profileId(), { create: true });
      // One-time: adopt files created before profiles existed (they lived directly in ulyos-home/)
      if (!localStorage.getItem('ulyos.legacyAdopted')) {
        localStorage.setItem('ulyos.legacyAdopted', '1');
        const legacy = [];
        for await (const [name, hd] of base.entries()) if (!/^p_[0-9a-f]{10}$/.test(name)) legacy.push([name, hd]);
        let empty = true;
        for await (const _ of home.entries()) { empty = false; break; }
        if (legacy.length && empty) {
          for (const [name, hd] of legacy) { await copyEntry(hd, home, name); await base.removeEntry(name, { recursive: true }); }
          ulyOS.audit('Adopted ' + legacy.length + ' pre-profile sandbox item(s) into this profile', 'info');
        }
      }
      for (const d of ['Documents', 'Pictures', 'Downloads', 'Wallpapers']) await home.getDirectoryHandle(d, { create: true });
      if (!ulyOS.util.store.get('ulyos.fs.seeded', false)) {
        const docs = await home.getDirectoryHandle('Documents');
        await writeFile(docs, 'Welcome.txt',
          'Welcome to ulyOS.\n\nThis file lives in your profile\'s sandboxed Origin Private File System inside your browser.\n' +
          '• Create folders and files with the toolbar or right-click.\n• Double-click a text file to edit it (Ctrl+S saves).\n' +
          '• Right-click a file → Encrypt… to lock it with a password (AES-256-GCM).\n' +
          '• Mount a real folder from your computer using "Open folder…" in the sidebar.\n• Drag files from your desktop into any Files window to upload them.\n');
        ulyOS.util.store.set('ulyos.fs.seeded', true);
      }
      roots.sandbox.handle = home;
      try { navigator.storage.persist?.(); } catch { /* ignore */ }
    } catch (err) {
      roots.sandbox.error = err;
      ulyOS.audit('Sandbox filesystem unavailable: ' + err.message, 'err');
    }
    roots.local.stored = (await idbGet('localRoot:' + ulyOS.security.profileId())) || null;
    return !!roots.sandbox.handle;
  };

  FS.writeSandboxFile = async function (path, data) {
    if (!roots.sandbox.handle) throw new Error('Sandbox filesystem unavailable');
    const parts = path.split('/').filter(Boolean);
    const name = parts.pop();
    const dir = await walkTo(roots.sandbox.handle, parts);
    await writeFile(dir, name, data);
    ulyOS.audit("File '" + path + "' written to sandbox (" + fmtBytes(data.size ?? String(data).length) + ')', 'ok');
    changed();
  };
  FS.readSandboxFile = async function (path) {
    if (!roots.sandbox.handle) return null;
    try {
      const parts = path.split('/').filter(Boolean);
      const name = parts.pop();
      let d = roots.sandbox.handle;
      for (const p of parts) d = await d.getDirectoryHandle(p);
      return await (await d.getFileHandle(name)).getFile();
    } catch { return null; }
  };

  async function mountLocal(forcePick) {
    if (!window.showDirectoryPicker) throw new Error('Your browser does not support the File System Access API (use Chrome/Edge).');
    const h0 = roots.local.handle || roots.local.stored;
    if (h0 && !forcePick) {
      let perm = await h0.queryPermission({ mode: 'readwrite' });
      if (perm !== 'granted') perm = await h0.requestPermission({ mode: 'readwrite' });
      if (perm === 'granted') { roots.local.handle = h0; return true; }
    }
    const handle = await window.showDirectoryPicker({ id: 'ulyos', mode: 'readwrite' });
    roots.local.handle = handle; roots.local.stored = handle;
    await idbSet('localRoot:' + ulyOS.security.profileId(), handle);
    ulyOS.audit("Local folder '" + handle.name + "' mounted with read/write access", 'ok');
    return true;
  }

  /* ---------------- File typing ---------------- */
  const TEXT_EXT = new Set('txt md markdown json js mjs ts css html htm xml csv tsv log ini cfg conf yml yaml toml py sh bash rb go rs java c h cpp hpp cs php sql svg env gitignore lua tex rtf bat'.split(' '));
  const IMG_EXT = new Set('png jpg jpeg gif webp bmp ico avif svg'.split(' '));
  const AUD_EXT = new Set('mp3 wav ogg flac m4a aac opus'.split(' '));
  const VID_EXT = new Set('mp4 webm mov mkv ogv m4v'.split(' '));
  function kindOf(name, isDir) {
    if (isDir) return 'folder';
    const e = extOf(name);
    if (e === 'uly') return 'locked';
    if (IMG_EXT.has(e) && e !== 'svg') return 'image';
    if (AUD_EXT.has(e)) return 'audio';
    if (VID_EXT.has(e)) return 'video';
    if (e === 'pdf') return 'pdf';
    if (TEXT_EXT.has(e)) return 'text';
    return 'file';
  }
  const KIND_ICON = { folder: 'folder', image: 'image', audio: 'music', video: 'video', pdf: 'file', text: 'text', file: 'file', locked: 'lock' };
  const KIND_LABEL = { folder: 'Folder', image: 'Image', audio: 'Audio', video: 'Video', pdf: 'PDF document', text: 'Text file', file: 'File', locked: 'Encrypted file' };

  async function looksBinary(file) {
    const buf = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
    return buf.includes(0);
  }

  /* ==========================================================================
     Text editor
     ========================================================================== */
  FS.openEditor = function ({ dir, name, handle, pathLabel, rootId }) {
    const key = handle ? (rootId || 'x') + ':' + (pathLabel || name) : null;
    return WM.open({
      appId: 'editor', key, singleton: !!key, title: name || 'Untitled', icon: icon('text', 16),
      width: 700, height: 520, minWidth: 380, minHeight: 240, mem: 16,
      render: (win) => buildEditor(win, { dir, name, handle, pathLabel }),
    });
  };

  FS.newDocument = function () {
    if (!roots.sandbox.handle) { ui.toast('Sandbox filesystem is unavailable', { type: 'err' }); return; }
    roots.sandbox.handle.getDirectoryHandle('Documents', { create: true }).then((dir) =>
      FS.openEditor({ dir, name: null, handle: null, pathLabel: 'Documents' }));
  };

  function buildEditor(win, st) {
    let { dir, name, handle } = st;
    let dirty = false, wrap = false;
    const ta = h('textarea', { class: 'ed-text', spellcheck: false, wrap: 'off', 'aria-label': 'Editor' });
    const gutter = h('div', { class: 'ed-gutter', 'aria-hidden': 'true' });
    const status = h('span', { class: 'mono', text: 'Ln 1, Col 1' });
    const info = h('span', { class: 'mono', text: '' });
    const state = h('span', { class: 'ed-state', text: 'Saved' });
    const pathEl = h('span', { class: 'ed-path', text: (st.pathLabel ? st.pathLabel + '/' : '') + (name || 'Untitled') });

    const title = () => WM.setTitle(win, (dirty ? '● ' : '') + (name || 'Untitled'));
    const setDirty = (d) => { dirty = d; state.textContent = d ? 'Unsaved changes' : 'Saved'; state.classList.toggle('dirty', d); title(); };
    const lines = () => {
      const n = ta.value.split('\n').length;
      if (gutter._n !== n) { gutter._n = n; gutter.textContent = Array.from({ length: n }, (_, i) => i + 1).join('\n'); }
    };
    const caret = () => {
      const before = ta.value.slice(0, ta.selectionStart).split('\n');
      status.textContent = 'Ln ' + before.length + ', Col ' + (before[before.length - 1].length + 1);
      info.textContent = ta.value.length.toLocaleString() + ' chars · UTF-8';
    };

    async function save(asNew) {
      try {
        if (!handle || asNew) {
          const nm = await ui.prompt({
            title: asNew ? 'Save as' : 'Save file', label: 'File name', value: name || 'untitled.txt', okText: 'Save',
            validate: validName,
          });
          if (nm == null) return false;
          const clean = nm.trim();
          if ((await exists(dir, clean)) && clean !== name) {
            if (!(await ui.confirm({ title: 'Replace file?', message: "'" + clean + "' already exists.", okText: 'Replace', danger: true }))) return false;
          }
          handle = await writeFile(dir, clean, ta.value);
          name = clean;
          pathEl.textContent = (st.pathLabel ? st.pathLabel + '/' : '') + name;
        } else {
          const w = await handle.createWritable();
          try { await w.write(ta.value); } finally { await w.close(); }
        }
        setDirty(false);
        ulyOS.audit("File '" + name + "' saved (" + fmtBytes(new Blob([ta.value]).size) + ')', 'ok');
        changed();
        return true;
      } catch (err) {
        ui.toast('Save failed: ' + err.message, { type: 'err' });
        ulyOS.audit("Saving '" + (name || 'Untitled') + "' failed: " + err.message, 'err');
        return false;
      }
    }

    ta.addEventListener('input', () => { setDirty(true); lines(); caret(); });
    ta.addEventListener('keyup', caret); ta.addEventListener('click', caret);
    ta.addEventListener('scroll', () => { gutter.scrollTop = ta.scrollTop; });
    ta.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(e.shiftKey); }
      else if (e.key === 'Tab') {
        e.preventDefault();
        const s = ta.selectionStart;
        ta.setRangeText('  ', s, ta.selectionEnd, 'end');
        ta.dispatchEvent(new Event('input'));
      }
    });
    win.canClose = async () => {
      if (!dirty) return true;
      const c = await ui.choose({
        title: 'Unsaved changes', message: "'" + (name || 'Untitled') + "' has unsaved changes.",
        choices: [{ label: 'Cancel', value: 'cancel' }, { label: 'Discard', value: 'discard', danger: true }, { label: 'Save', value: 'save', primary: true }],
      });
      if (c === 'save') return await save(false);
      return c === 'discard';
    };

    const root = h('div', { class: 'ed' },
      h('div', { class: 'ed-bar' },
        h('button', { class: 'btn sm', html: icon('save', 14) + ' Save', onclick: () => save(false) }),
        h('button', { class: 'btn sm', text: 'Save as…', onclick: () => save(true) }),
        h('label', { class: 'tm-inline' }, h('input', {
          type: 'checkbox', onchange: (e) => { wrap = e.target.checked; ta.wrap = wrap ? 'soft' : 'off'; root.classList.toggle('wrap', wrap); },
        }), 'Word wrap'),
        h('span', { class: 'grow' }), pathEl),
      h('div', { class: 'ed-wrap' }, gutter, ta),
      h('div', { class: 'ed-status' }, status, info, h('span', { class: 'grow' }), state));

    (async () => {
      if (handle) {
        try {
          const f = await handle.getFile();
          if (f.size > 5 * 1024 * 1024 && !(await ui.confirm({ title: 'Large file', message: name + ' is ' + fmtBytes(f.size) + '. Open it anyway?', okText: 'Open' }))) { WM.close(win, { force: true }); return; }
          ta.value = await f.text();
        } catch (err) { ui.toast('Cannot read file: ' + err.message, { type: 'err' }); }
      }
      lines(); caret(); setDirty(false); ta.focus();
    })();
    return root;
  }

  /* ==========================================================================
     Media / PDF viewer
     ========================================================================== */
  async function openViewer(handle, kind, pathLabel) {
    const file = await handle.getFile();
    const url = URL.createObjectURL(file);
    let body;
    if (kind === 'image') body = h('img', { class: 'vw-img', src: url, alt: file.name, draggable: false });
    else if (kind === 'audio') body = h('div', { class: 'vw-audio' }, h('div', { class: 'vw-ico', html: icon('music', 56) }), h('div', { text: file.name }), h('audio', { src: url, controls: true, autoplay: true }));
    else if (kind === 'video') body = h('video', { class: 'vw-video', src: url, controls: true, autoplay: true });
    else body = h('iframe', { class: 'vw-pdf', src: url, title: file.name });
    WM.open({
      appId: 'viewer', key: pathLabel, singleton: true, title: file.name, icon: icon(KIND_ICON[kind], 16),
      width: kind === 'audio' ? 460 : 760, height: kind === 'audio' ? 300 : 540, mem: kind === 'video' ? 60 : 26,
      onClose: () => URL.revokeObjectURL(url),
      render: () => h('div', { class: 'vw' }, body, h('div', { class: 'vw-bar mono', text: file.name + ' · ' + fmtBytes(file.size) })),
    });
  }

  /* ==========================================================================
     File Explorer
     ========================================================================== */
  FS.clipboard = null;   // { mode, srcDir, names }
  let dragPayload = null;
  const openExplorers = new Set();

  FS.open = function (opts = {}) {
    return WM.open({
      appId: 'files', title: 'Files', icon: icon('folder', 16), width: 940, height: 600, minWidth: 560, minHeight: 320,
      mem: 24, singleton: !opts.newWindow,
      render: (win) => { const ex = new Explorer(win, opts); return ex.root; },
    });
  };

  class Explorer {
    constructor(win, opts) {
      this.win = win;
      this.rootId = 'sandbox';
      this.stack = [];
      this.entries = [];
      this.sel = new Set();
      this.anchor = null;
      this.sort = { key: 'name', dir: 1 };
      this.hist = []; this.hi = -1;
      this.view = 'list';
      this.filter = '';
      this.dead = false;
      this.build();
      openExplorers.add(this);
      this.offChange = bus.on('fs:change', () => { if (!win.minimized) this.refresh(true); });
      const prevClose = win.onClose;
      win.onClose = (w) => { this.dead = true; openExplorers.delete(this); this.offChange(); prevClose?.(w); };
      this.goRoot('sandbox', opts.path || []);
    }

    get dir() { return this.stack[this.stack.length - 1]?.handle; }
    get pathLabel() { return this.stack.slice(1).map((s) => s.name).join('/'); }

    /* ---------- DOM ---------- */
    build() {
      const btn = (ico, title, fn) => h('button', { class: 'tb-btn', title, 'aria-label': title, html: icon(ico, 16), onclick: fn });
      this.bBack = btn('arrowLeft', 'Back', () => this.go(-1));
      this.bFwd = btn('arrowRight', 'Forward', () => this.go(1));
      this.bUp = btn('arrowUp', 'Up one level', () => this.up());
      this.crumbs = h('div', { class: 'fm-crumbs' });
      this.search = h('input', { class: 'input sm', type: 'search', placeholder: 'Filter…', oninput: (e) => { this.filter = e.target.value.toLowerCase(); this.paint(); } });
      this.viewBtn = btn('grid', 'Toggle grid view', () => { this.view = this.view === 'list' ? 'grid' : 'list'; this.paint(); });
      this.fileInput = h('input', { type: 'file', multiple: true, hidden: true, onchange: async (e) => { await this.upload([...e.target.files]); e.target.value = ''; } });

      const act = (ico, label, fn) => h('button', { class: 'btn sm', html: icon(ico, 14) + ' <span>' + label + '</span>', onclick: fn });
      this.actions = h('div', { class: 'fm-actions' },
        act('folderPlus', 'New folder', () => this.createEntry('directory')),
        act('filePlus', 'New file', () => this.createEntry('file')),
        act('upload', 'Upload', () => this.fileInput.click()),
        h('span', { class: 'fm-vsep' }),
        h('button', { class: 'tb-btn', title: 'Cut', html: icon('scissors', 15), onclick: () => this.setClip('cut') }),
        h('button', { class: 'tb-btn', title: 'Copy', html: icon('copy', 15), onclick: () => this.setClip('copy') }),
        (this.bPaste = h('button', { class: 'tb-btn', title: 'Paste', html: icon('clipboard', 15), onclick: () => this.paste() })),
        h('button', { class: 'tb-btn', title: 'Rename (F2)', html: icon('edit', 15), onclick: () => this.rename() }),
        h('button', { class: 'tb-btn', title: 'Download', html: icon('download', 15), onclick: () => this.download() }),
        h('button', { class: 'tb-btn danger', title: 'Delete (Del)', html: icon('trash', 15), onclick: () => this.remove() }));

      this.side = h('aside', { class: 'fm-side' });
      this.head = h('div', { class: 'fm-head' },
        ...[['name', 'Name'], ['mtime', 'Modified'], ['size', 'Size'], ['kind', 'Type']].map(([k, l]) =>
          h('div', { class: 'c-' + k, text: l, onclick: () => { this.sort.dir = this.sort.key === k ? -this.sort.dir : 1; this.sort.key = k; this.paint(); } })));
      this.list = h('div', { class: 'fm-list', role: 'listbox', 'aria-multiselectable': 'true' });
      this.drop = h('div', { class: 'fm-drop', text: 'Drop files to upload' });
      this.content = h('div', { class: 'fm-content' }, this.head, this.list, this.drop);
      this.status = h('div', { class: 'fm-status' });

      this.root = h('div', { class: 'fm', tabindex: 0 },
        h('div', { class: 'fm-toolbar' }, this.bBack, this.bFwd, this.bUp, this.crumbs, this.search, this.viewBtn),
        this.actions,
        h('div', { class: 'fm-main' }, this.side, this.content),
        this.status, this.fileInput);

      this.root.addEventListener('keydown', (e) => this.onKey(e));
      this.content.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); this.blankMenu(e); });
      this.list.addEventListener('pointerdown', (e) => { if (e.target === this.list) { this.sel.clear(); this.paintSel(); } });
      // OS file drop → upload
      let depth = 0;
      this.content.addEventListener('dragenter', (e) => { if (e.dataTransfer.types.includes('Files')) { depth++; this.drop.classList.add('on'); } });
      this.content.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; this.drop.classList.remove('on'); } });
      this.content.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('Files') || dragPayload) e.preventDefault(); });
      this.content.addEventListener('drop', async (e) => {
        e.preventDefault(); depth = 0; this.drop.classList.remove('on');
        if (dragPayload) return;
        const items = [...e.dataTransfer.items].filter((i) => i.kind === 'file');
        const handles = [];
        for (const it of items) {
          if (it.getAsFileSystemHandle) { try { handles.push(await it.getAsFileSystemHandle()); continue; } catch { /* fall through */ } }
          const f = it.getAsFile(); if (f) handles.push(f);
        }
        await this.upload(handles);
      });
    }

    /* ---------- navigation ---------- */
    async goRoot(rootId, parts = [], push = true) {
      const r = roots[rootId];
      try {
        if (rootId === 'local') await mountLocal(false);
        if (!r.handle) throw r.error || new Error('Not available');
        let d = r.handle;
        const stack = [{ name: r.id === 'local' ? r.handle.name : 'Sandbox', handle: d }];
        for (const p of parts) { d = await d.getDirectoryHandle(p); stack.push({ name: p, handle: d }); }
        this.rootId = rootId; this.setStack(stack, push);
      } catch (err) {
        if (err.name !== 'AbortError') ui.toast(err.message || String(err), { type: 'err' });
        if (!this.stack.length) { this.paintSide(); this.list.replaceChildren(h('div', { class: 'fm-empty', text: 'Filesystem unavailable: ' + (err.message || err) })); }
      }
    }
    setStack(stack, push = true) {
      this.stack = stack; this.sel.clear();
      if (push) { this.hist = this.hist.slice(0, this.hi + 1); this.hist.push({ rootId: this.rootId, stack }); this.hi = this.hist.length - 1; }
      this.refresh();
      this.win && WM.setTitle(this.win, 'Files — ' + (stack[stack.length - 1].name));
    }
    go(d) {
      const i = this.hi + d;
      if (i < 0 || i >= this.hist.length) return;
      this.hi = i; this.rootId = this.hist[i].rootId; this.stack = this.hist[i].stack; this.sel.clear(); this.refresh();
    }
    up() { if (this.stack.length > 1) this.setStack(this.stack.slice(0, -1)); }
    enter(name) {
      const e = this.entries.find((x) => x.name === name);
      if (e && e.isDir) this.setStack([...this.stack, { name, handle: e.handle }]);
    }

    async refresh(quiet) {
      if (!this.dir) return;
      try {
        const out = [];
        for await (const [name, handle] of this.dir.entries()) out.push({ name, handle, isDir: handle.kind === 'directory' });
        await Promise.all(out.map(async (e) => {
          if (e.isDir) { e.size = null; e.mtime = 0; return; }
          try { const f = await e.handle.getFile(); e.size = f.size; e.mtime = f.lastModified; } catch { e.size = 0; e.mtime = 0; }
        }));
        out.forEach((e) => { e.kind = kindOf(e.name, e.isDir); });
        if (this.dead) return;
        this.entries = out;
        const names = new Set(out.map((e) => e.name));
        this.sel.forEach((n) => { if (!names.has(n)) this.sel.delete(n); });
        this.paint();
        if (this.rootId === 'sandbox') this.updateUsage();
      } catch (err) {
        if (!quiet) ui.toast('Cannot read folder: ' + err.message, { type: 'err' });
        if (err.name === 'NotFoundError' && this.stack.length > 1) this.up();
      }
    }
    async updateUsage() {
      try { const e = await navigator.storage.estimate(); this.usage = fmtBytes(e.usage) + ' used of ' + fmtBytes(e.quota); this.paintStatus(); } catch { /* ignore */ }
    }

    /* ---------- painting ---------- */
    paint() {
      if (this.dead) return;
      this.bBack.disabled = this.hi <= 0; this.bFwd.disabled = this.hi >= this.hist.length - 1; this.bUp.disabled = this.stack.length <= 1;
      this.bPaste.disabled = !FS.clipboard;
      this.viewBtn.innerHTML = icon(this.view === 'list' ? 'grid' : 'list', 16);
      this.content.classList.toggle('grid', this.view === 'grid');
      this.paintCrumbs(); this.paintSide();
      const { key, dir } = this.sort;
      const rows = this.entries.filter((e) => !this.filter || e.name.toLowerCase().includes(this.filter));
      rows.sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        let r;
        if (key === 'size') r = (a.size || 0) - (b.size || 0);
        else if (key === 'mtime') r = a.mtime - b.mtime;
        else if (key === 'kind') r = a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name);
        else r = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
        return r * dir;
      });
      this.shown = rows;
      this.head.querySelectorAll('div').forEach((d) => d.classList.toggle('sorted', d.className.includes('c-' + key)));
      this.list.replaceChildren(...(rows.length ? rows.map((e) => this.row(e)) : [h('div', { class: 'fm-empty', text: this.filter ? 'No matches' : 'This folder is empty' })]));
      this.paintSel();
    }
    row(e) {
      const row = h('div', { class: 'fm-row', role: 'option', draggable: true, dataset: { name: e.name } },
        h('div', { class: 'c-name' }, h('span', { class: 'fi ' + e.kind, html: icon(KIND_ICON[e.kind], e.isDir ? 18 : 17) }), h('span', { class: 'fn', text: e.name })),
        h('div', { class: 'c-mtime', text: e.mtime ? new Date(e.mtime).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—' }),
        h('div', { class: 'c-size', text: e.isDir ? '—' : fmtBytes(e.size) }),
        h('div', { class: 'c-kind', text: e.isDir ? 'Folder' : (extOf(e.name) ? extOf(e.name).toUpperCase() + ' ' : '') + KIND_LABEL[e.kind].toLowerCase().replace(/^./, (c) => c) }));
      row.addEventListener('click', (ev) => this.select(e.name, ev));
      row.addEventListener('dblclick', () => this.open(e));
      row.addEventListener('contextmenu', (ev) => {
        ev.preventDefault(); ev.stopPropagation();
        if (!this.sel.has(e.name)) { this.sel = new Set([e.name]); this.paintSel(); }
        this.rowMenu(ev, e);
      });
      row.addEventListener('dragstart', (ev) => {
        if (!this.sel.has(e.name)) { this.sel = new Set([e.name]); this.paintSel(); }
        dragPayload = { srcDir: this.dir, names: [...this.sel] };
        ev.dataTransfer.effectAllowed = 'move';
        ev.dataTransfer.setData('text/plain', [...this.sel].join('\n'));
      });
      row.addEventListener('dragend', () => { dragPayload = null; });
      if (e.isDir) {
        row.addEventListener('dragover', (ev) => { if (dragPayload && !this.sel.has(e.name)) { ev.preventDefault(); row.classList.add('drop-target'); } });
        row.addEventListener('dragleave', () => row.classList.remove('drop-target'));
        row.addEventListener('drop', (ev) => { ev.preventDefault(); ev.stopPropagation(); row.classList.remove('drop-target'); this.dropInto(e.handle, e.name); });
      }
      return row;
    }
    async dropInto(dirHandle, label) {
      if (!dragPayload) return;
      const p = dragPayload; dragPayload = null;
      try {
        const n = await transfer(p.srcDir, p.names, dirHandle, true);
        if (n) { ulyOS.audit('Moved ' + n + " item(s) into '" + label + "'", 'ok'); changed(); }
      } catch (err) { ui.toast(err.message, { type: 'err' }); }
    }
    paintSel() {
      this.list.querySelectorAll('.fm-row').forEach((r) => {
        const s = this.sel.has(r.dataset.name);
        r.classList.toggle('selected', s); r.setAttribute('aria-selected', s);
      });
      this.paintStatus();
    }
    paintStatus() {
      const n = this.entries.length, s = this.sel.size;
      let txt = n + (n === 1 ? ' item' : ' items');
      if (s) {
        const bytes = this.entries.filter((e) => this.sel.has(e.name) && !e.isDir).reduce((a, e) => a + e.size, 0);
        txt += ' · ' + s + ' selected' + (bytes ? ' (' + fmtBytes(bytes) + ')' : '');
      }
      if (FS.clipboard) txt += ' · ' + FS.clipboard.names.length + ' on clipboard (' + FS.clipboard.mode + ')';
      this.status.replaceChildren(h('span', { text: txt }), h('span', { class: 'grow' }), h('span', { class: 'mono', text: this.rootId === 'sandbox' ? (this.usage || 'OPFS sandbox') : 'Local disk · read/write' }));
    }
    paintCrumbs() {
      const kids = [];
      this.stack.forEach((s, i) => {
        if (i) kids.push(h('span', { class: 'sep', html: icon('chevronRight', 11) }));
        const b = h('button', { class: 'crumb' + (i === this.stack.length - 1 ? ' last' : ''), text: s.name, onclick: () => i < this.stack.length - 1 && this.setStack(this.stack.slice(0, i + 1)) });
        b.addEventListener('dragover', (ev) => { if (dragPayload) { ev.preventDefault(); b.classList.add('drop-target'); } });
        b.addEventListener('dragleave', () => b.classList.remove('drop-target'));
        b.addEventListener('drop', (ev) => { ev.preventDefault(); b.classList.remove('drop-target'); this.dropInto(s.handle, s.name); });
        kids.push(b);
      });
      this.crumbs.replaceChildren(...kids);
    }
    paintSide() {
      const place = (ico, label, onclick, active) => h('button', { class: 'place' + (active ? ' active' : ''), html: icon(ico, 16) + '<span></span>', onclick },);
      const mk = (ico, label, fn, active) => { const b = place(ico, label, fn, active); b.querySelector('span').textContent = label; return b; };
      const sb = this.rootId === 'sandbox';
      const top = sb ? this.stack[1]?.name : null;
      const items = [
        h('div', { class: 'side-h', text: 'Sandbox' }),
        mk('home', 'Home', () => this.goRoot('sandbox', []), sb && this.stack.length === 1),
        ...['Documents', 'Pictures', 'Downloads'].map((n) => mk('folder', n, () => this.goRoot('sandbox', [n]), sb && top === n)),
        h('div', { class: 'side-h', text: 'This computer' }),
      ];
      const loc = roots.local;
      const name = (loc.handle || loc.stored)?.name;
      if (name) items.push(mk('hdd', name, () => this.goRoot('local', []), this.rootId === 'local'));
      items.push(mk('plus', name ? 'Change folder…' : 'Open folder…', async () => {
        try { await mountLocal(true); await this.goRoot('local', []); } catch (err) { if (err.name !== 'AbortError') ui.toast(err.message, { type: 'err' }); }
      }));
      this.side.replaceChildren(...items);
    }

    /* ---------- selection / keyboard ---------- */
    select(name, ev) {
      const names = this.shown.map((e) => e.name);
      if (ev.shiftKey && this.anchor && names.includes(this.anchor)) {
        const a = names.indexOf(this.anchor), b = names.indexOf(name);
        this.sel = new Set(names.slice(Math.min(a, b), Math.max(a, b) + 1));
      } else if (ev.ctrlKey || ev.metaKey) {
        this.sel.has(name) ? this.sel.delete(name) : this.sel.add(name); this.anchor = name;
      } else { this.sel = new Set([name]); this.anchor = name; }
      this.paintSel();
    }
    onKey(e) {
      if (e.target.matches('input, textarea')) return;
      const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
      if (k === 'delete') this.remove();
      else if (k === 'f2') this.rename();
      else if (k === 'enter') { const en = this.shown.find((x) => this.sel.has(x.name)); if (en) this.open(en); }
      else if (k === 'backspace') this.up();
      else if (mod && k === 'a') { e.preventDefault(); this.sel = new Set(this.shown.map((x) => x.name)); this.paintSel(); }
      else if (mod && k === 'c') this.setClip('copy');
      else if (mod && k === 'x') this.setClip('cut');
      else if (mod && k === 'v') this.paste();
      else if (k === 'arrowdown' || k === 'arrowup') {
        e.preventDefault();
        const names = this.shown.map((x) => x.name);
        const cur = names.indexOf(this.anchor);
        const next = names[clamp(cur + (k === 'arrowdown' ? 1 : -1), 0, names.length - 1)];
        if (next) { this.sel = new Set([next]); this.anchor = next; this.paintSel(); this.list.querySelector('[data-name="' + CSS.escape(next) + '"]')?.scrollIntoView({ block: 'nearest' }); }
      }
    }

    /* ---------- context menus ---------- */
    rowMenu(ev, e) {
      const multi = this.sel.size > 1;
      ui.contextMenu(ev.clientX, ev.clientY, [
        { label: 'Open', icon: e.isDir ? 'folder' : 'file', disabled: multi, action: () => this.open(e) },
        !e.isDir ? { label: 'Open with Text Editor', icon: 'text', disabled: multi, action: () => this.openText(e) } : null,
        !e.isDir && e.kind !== 'locked' ? { label: 'Encrypt…', icon: 'lock', action: () => this.encryptSel() } : null,
        e.kind === 'locked' ? { label: 'Decrypt…', icon: 'lock', disabled: multi, action: () => this.decrypt(e) } : null,
        { separator: true },
        { label: 'Cut', icon: 'scissors', shortcut: 'Ctrl+X', action: () => this.setClip('cut') },
        { label: 'Copy', icon: 'copy', shortcut: 'Ctrl+C', action: () => this.setClip('copy') },
        { label: 'Rename', icon: 'edit', shortcut: 'F2', disabled: multi, action: () => this.rename() },
        { label: 'Download', icon: 'download', action: () => this.download() },
        { separator: true },
        { label: 'Delete', icon: 'trash', danger: true, shortcut: 'Del', action: () => this.remove() },
      ]);
    }
    blankMenu(ev) {
      ui.contextMenu(ev.clientX, ev.clientY, [
        { label: 'New folder', icon: 'folderPlus', action: () => this.createEntry('directory') },
        { label: 'New text file', icon: 'filePlus', action: () => this.createEntry('file') },
        { separator: true },
        { label: 'Paste', icon: 'clipboard', shortcut: 'Ctrl+V', disabled: !FS.clipboard, action: () => this.paste() },
        { label: 'Upload files…', icon: 'upload', action: () => this.fileInput.click() },
        { separator: true },
        { label: 'Refresh', icon: 'refresh', action: () => this.refresh() },
        { label: 'New Files window', icon: 'external', action: () => FS.open({ newWindow: true }) },
      ]);
    }

    /* ---------- operations ---------- */
    async open(e) {
      if (e.isDir) return this.enter(e.name);
      if (e.kind === 'locked') return this.decrypt(e);
      const label = this.rootId + ':' + [this.pathLabel, e.name].filter(Boolean).join('/');
      try {
        if (['image', 'audio', 'video', 'pdf'].includes(e.kind)) { await openViewer(e.handle, e.kind, label); ulyOS.audit("Opened '" + e.name + "' in viewer", 'info'); return; }
        if (e.kind === 'file') {
          const f = await e.handle.getFile();
          if (await looksBinary(f)) { ui.toast("'" + e.name + "' is a binary file — use Download to save a copy", { type: 'info' }); return; }
        }
        this.openText(e);
      } catch (err) { ui.toast(err.message, { type: 'err' }); }
    }
    openText(e) {
      FS.openEditor({ dir: this.dir, name: e.name, handle: e.handle, pathLabel: this.pathLabel, rootId: this.rootId });
      ulyOS.audit("Opened '" + e.name + "' in text editor", 'info');
    }

    async createEntry(kind) {
      const base = kind === 'directory' ? 'New folder' : 'New file.txt';
      const name = await uniqueName(this.dir, base, '');
      const n = await ui.prompt({ title: kind === 'directory' ? 'New folder' : 'New file', label: 'Name', value: name, okText: 'Create', validate: (v) => validName(v) });
      if (n == null) return;
      const clean = n.trim();
      try {
        if (await exists(this.dir, clean)) throw new Error("'" + clean + "' already exists");
        if (kind === 'directory') await this.dir.getDirectoryHandle(clean, { create: true });
        else await writeFile(this.dir, clean, '');
        ulyOS.audit((kind === 'directory' ? "Folder '" : "File '") + clean + "' created in /" + this.pathLabel, 'ok');
        this.sel = new Set([clean]);
        changed();
      } catch (err) { ui.toast(err.message, { type: 'err' }); }
    }

    async rename() {
      if (this.sel.size !== 1) return;
      const old = [...this.sel][0];
      const e = this.entries.find((x) => x.name === old);
      if (!e) return;
      const n = await ui.prompt({ title: 'Rename', label: 'New name', value: old, okText: 'Rename', validate: (v) => validName(v) });
      if (n == null || n.trim() === old) return;
      const clean = n.trim();
      try {
        if (await exists(this.dir, clean)) throw new Error("'" + clean + "' already exists");
        let done = false;
        if (typeof e.handle.move === 'function') { try { await e.handle.move(clean); done = true; } catch { /* fall back to copy */ } }
        if (!done) { await copyEntry(e.handle, this.dir, clean); await this.dir.removeEntry(old, { recursive: true }); }
        ulyOS.audit("Renamed '" + old + "' → '" + clean + "'", 'ok');
        this.sel = new Set([clean]); changed();
      } catch (err) { ui.toast('Rename failed: ' + err.message, { type: 'err' }); }
    }

    async remove() {
      const names = [...this.sel];
      if (!names.length) return;
      const ok = await ui.confirm({
        title: 'Delete ' + (names.length === 1 ? "'" + names[0] + "'" : names.length + ' items') + '?',
        message: 'This permanently removes ' + (names.length === 1 ? 'it' : 'them') + ' from the filesystem and cannot be undone.', okText: 'Delete', danger: true,
      });
      if (!ok) return;
      try {
        for (const n of names) await this.dir.removeEntry(n, { recursive: true });
        ulyOS.audit('Deleted ' + (names.length === 1 ? "'" + names[0] + "'" : names.length + ' items') + ' from /' + this.pathLabel, 'warn');
        this.sel.clear(); changed();
      } catch (err) { ui.toast('Delete failed: ' + err.message, { type: 'err' }); changed(); }
    }

    async encryptSel() {
      const picks = this.entries.filter((e) => this.sel.has(e.name) && !e.isDir && e.kind !== 'locked');
      if (!picks.length) { ui.toast('Select one or more files to encrypt', { type: 'info' }); return; }
      const v = await ui.form({
        title: 'Encrypt ' + (picks.length === 1 ? "'" + picks[0].name + "'" : picks.length + ' files'),
        message: 'Creates a .uly file protected with AES-256-GCM (PBKDF2-SHA256, 600,000 iterations). The original is kept. There is no recovery if you forget the password.',
        fields: [{ name: 'pw', label: 'Password', type: 'password' }, { name: 'pw2', label: 'Confirm password', type: 'password' }], okText: 'Encrypt',
        validate: (x) => (x.pw.length < 8 ? 'Use at least 8 characters' : x.pw !== x.pw2 ? 'Passwords do not match' : null),
      });
      if (!v) return;
      try {
        for (const e of picks) {
          const f = await e.handle.getFile();
          if (f.size > 200 * 1024 * 1024) throw new Error(e.name + ' is too large to encrypt in the browser (200 MB max)');
          const out = await ulyOS.crypto.encryptFile(new Uint8Array(await f.arrayBuffer()), v.pw, e.name);
          const nm = await uniqueName(this.dir, e.name + '.uly', ' copy');
          await writeFile(this.dir, nm, out);
          ulyOS.audit("File '" + e.name + "' encrypted → '" + nm + "' (" + fmtBytes(out.length) + ')', 'ok');
        }
        ui.toast('Encrypted ' + picks.length + ' file(s)', { type: 'ok' }); changed();
      } catch (err) { ui.toast('Encryption failed: ' + err.message, { type: 'err' }); }
    }
    async decrypt(e) {
      const pw = await ui.prompt({ title: "Decrypt '" + e.name + "'", label: 'Password', okText: 'Decrypt', validate: (x) => (x ? null : 'Enter the password') });
      if (pw == null) return;
      try {
        const f = await e.handle.getFile();
        const { name, data } = await ulyOS.crypto.decryptFile(new Uint8Array(await f.arrayBuffer()), pw);
        const nm = await uniqueName(this.dir, name, ' (decrypted)');
        await writeFile(this.dir, nm, data);
        ulyOS.audit("File '" + e.name + "' decrypted → '" + nm + "'", 'ok');
        ui.toast("Decrypted to '" + nm + "'", { type: 'ok' }); this.sel = new Set([nm]); changed();
      } catch (err) { ui.toast(err.message, { type: 'err' }); ulyOS.audit("Decrypting '" + e.name + "' failed", 'warn'); }
    }

    setClip(mode) {
      if (!this.sel.size) return;
      FS.clipboard = { mode, srcDir: this.dir, names: [...this.sel] };
      ui.toast((mode === 'cut' ? 'Cut ' : 'Copied ') + this.sel.size + ' item(s)', { type: 'info', timeout: 1500 });
      openExplorers.forEach((x) => x.paint());
    }
    async paste() {
      const c = FS.clipboard;
      if (!c) return;
      try {
        const n = await transfer(c.srcDir, c.names, this.dir, c.mode === 'cut');
        ulyOS.audit((c.mode === 'cut' ? 'Moved ' : 'Copied ') + n + " item(s) into /" + this.pathLabel, 'ok');
        if (c.mode === 'cut') FS.clipboard = null;
        changed();
      } catch (err) { ui.toast('Paste failed: ' + err.message, { type: 'err' }); }
    }

    async download() {
      const picks = this.entries.filter((e) => this.sel.has(e.name));
      for (const e of picks) {
        if (e.isDir) { ui.toast("Folders can't be downloaded — open it and select files", { type: 'info' }); continue; }
        const f = await e.handle.getFile();
        const a = h('a', { href: URL.createObjectURL(f), download: e.name });
        document.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        ulyOS.audit("File '" + e.name + "' exported to host (" + fmtBytes(f.size) + ')', 'info');
      }
    }

    async upload(items) {
      let n = 0, bytes = 0;
      try {
        for (const it of items) {
          if (it.kind === 'directory' || it.kind === 'file') {          // FileSystemHandle from drag-drop
            const nm = await uniqueName(this.dir, it.name, ' copy');
            await copyEntry(it, this.dir, nm);
            if (it.kind === 'file') bytes += (await it.getFile()).size;
          } else {                                                       // plain File
            const nm = await uniqueName(this.dir, it.name, ' copy');
            await writeFile(this.dir, nm, it);
            bytes += it.size;
          }
          n++;
        }
        if (n) { ulyOS.audit('Uploaded ' + n + ' item(s) (' + fmtBytes(bytes) + ') into /' + this.pathLabel, 'ok'); ui.toast('Uploaded ' + n + ' item(s)', { type: 'ok' }); changed(); }
      } catch (err) { ui.toast('Upload failed: ' + err.message, { type: 'err' }); }
    }
  }
})();
