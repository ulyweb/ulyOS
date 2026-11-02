/* ==========================================================================
   ulyOS · js/app-bridge.js
   Lets the bundled apps run under a Content-Security-Policy without
   'unsafe-inline': their inline on*="…" attributes were rewritten to
   data-on-*="…" by tools/build-apps.js and are executed here.

     "#12"            → a handler compiled from the app's own HTML (apps/js/<app>.handlers.js)
     anything else    → handler text built at run time by the app's scripts, run by the small
                        interpreter below. It has no eval: it can call only the app functions the
                        build tool found referenced from handlers (the "scope"), call methods on
                        DOM objects, read/assign properties (not innerHTML/src/on*…), and use
                        literals, ! - + === && || ?: and `if`/`return`. Anything else is refused.
   ========================================================================== */
(function (root) {
  'use strict';

  const KW = new Set(['this', 'event', 'true', 'false', 'null', 'undefined', 'window', 'document', 'return', 'if']);
  const BAD_MEMBER = new Set(['constructor', '__proto__', 'prototype', 'caller', 'callee', 'eval', 'Function', 'arguments']);
  const BAD_ASSIGN = /^(innerHTML|outerHTML|srcdoc|src|href|action|formAction|cookie|location|on.*)$/i;

  function tokenize(src) {
    const out = []; let i = 0;
    while (i < src.length) {
      const c = src[i];
      if (/\s/.test(c)) { i++; continue; }
      if (/[A-Za-z_$]/.test(c)) { let j = i + 1; while (j < src.length && /[\w$]/.test(src[j])) j++; out.push({ t: 'id', v: src.slice(i, j) }); i = j; continue; }
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) { let j = i + 1; while (j < src.length && /[0-9.eE]/.test(src[j])) j++; out.push({ t: 'num', v: parseFloat(src.slice(i, j)) }); i = j; continue; }
      if (c === '"' || c === "'") {
        let j = i + 1, s = '';
        while (j < src.length && src[j] !== c) {
          if (src[j] === '\\') { j++; const e = src[j]; s += e === 'n' ? '\n' : e === 't' ? '\t' : e === 'u' ? String.fromCharCode(parseInt(src.slice(j + 1, j + 5), 16)) : e; if (e === 'u') j += 4; }
          else s += src[j];
          j++;
        }
        if (j >= src.length) throw new Error('unterminated string');
        out.push({ t: 'str', v: s }); i = j + 1; continue;
      }
      const three = src.slice(i, i + 3), two = src.slice(i, i + 2);
      if (three === '===' || three === '!==') { out.push({ t: 'p', v: three }); i += 3; continue; }
      if (['==', '!=', '&&', '||', '<=', '>='].includes(two)) { out.push({ t: 'p', v: two }); i += 2; continue; }
      if ('()[].,;?:!-+=<>*'.includes(c)) { out.push({ t: 'p', v: c }); i++; continue; }
      throw new Error('unexpected character ' + c);
    }
    return out;
  }

  /* Parser → small AST */
  function parse(src) {
    const tk = tokenize(src); let p = 0;
    const peek = () => tk[p], isP = (v) => tk[p] && tk[p].t === 'p' && tk[p].v === v;
    const eat = (v) => { if (!isP(v)) throw new Error('expected ' + v); p++; };
    function program() { const body = []; while (p < tk.length) { if (isP(';')) { p++; continue; } body.push(stmt()); if (p < tk.length && !isP(';')) throw new Error('unexpected token'); } return body; }
    function stmt() {
      const t = peek();
      if (t.t === 'id' && t.v === 'return') { p++; return { k: 'ret', e: p < tk.length && !isP(';') ? expr() : null }; }
      if (t.t === 'id' && t.v === 'if') { p++; eat('('); const c = expr(); eat(')'); return { k: 'if', c, s: stmt() }; }
      return { k: 'ex', e: expr() };
    }
    function expr() {
      const l = cond();
      if (isP('=')) { if (l.k !== 'mem') throw new Error('bad assignment'); p++; return { k: 'asg', l, r: expr() }; }
      return l;
    }
    function cond() { const c = bin(0); if (isP('?')) { p++; const a = expr(); eat(':'); return { k: 'cnd', c, a, b: expr() }; } return c; }
    const LEVELS = [['||'], ['&&'], ['===', '!==', '==', '!='], ['<', '>', '<=', '>='], ['+', '-'], ['*']];
    function bin(lv) {
      if (lv >= LEVELS.length) return unary();
      let l = bin(lv + 1);
      while (peek() && peek().t === 'p' && LEVELS[lv].includes(peek().v)) { const op = tk[p++].v; l = { k: 'bin', op, l, r: bin(lv + 1) }; }
      return l;
    }
    function unary() { if (isP('!') || isP('-')) { const op = tk[p++].v; return { k: 'un', op, e: unary() }; } return postfix(); }
    function postfix() {
      let e = primary();
      for (;;) {
        if (isP('.')) { p++; const n = tk[p++]; if (!n || n.t !== 'id') throw new Error('bad member'); e = { k: 'mem', o: e, n: { k: 'lit', v: n.v } }; }
        else if (isP('[')) { p++; const n = expr(); eat(']'); e = { k: 'mem', o: e, n }; }
        else if (isP('(')) { p++; const a = []; while (!isP(')')) { a.push(expr()); if (isP(',')) p++; else break; } eat(')'); e = { k: 'call', f: e, a }; }
        else return e;
      }
    }
    function primary() {
      const t = tk[p++];
      if (!t) throw new Error('unexpected end');
      if (t.t === 'num' || t.t === 'str') return { k: 'lit', v: t.v };
      if (t.t === 'id') return KW.has(t.v) && t.v !== 'window' && t.v !== 'document' && t.v !== 'this' && t.v !== 'event' ? { k: 'lit', v: t.v === 'true' ? true : t.v === 'false' ? false : t.v === 'null' ? null : undefined } : { k: 'id', n: t.v };
      if (t.t === 'p' && t.v === '(') { const e = expr(); eat(')'); return e; }
      throw new Error('unexpected ' + t.v);
    }
    const ast = program();
    return ast;
  }

  /* Evaluator */
  const RET = {};
  function run(ast, ctx) {
    const ev = (n) => {
      switch (n.k) {
        case 'lit': return n.v;
        case 'id':
          if (n.n === 'this') return ctx.el;
          if (n.n === 'event') return ctx.ev;
          if (n.n === 'window') return window;
          if (n.n === 'document') return document;
          if (Object.prototype.hasOwnProperty.call(ctx.scope, n.n)) return ctx.scope[n.n]();
          throw new Error('"' + n.n + '" is not available to inline handlers');
        case 'mem': { const o = ev(n.o), k = ev(n.n); if (BAD_MEMBER.has(k)) throw new Error('blocked member ' + k); if (o == null) throw new Error('cannot read ' + k + ' of ' + o); return o[k]; }
        case 'call': {
          let thisArg, f;
          if (n.f.k === 'mem') { thisArg = ev(n.f.o); const k = ev(n.f.n); if (BAD_MEMBER.has(k)) throw new Error('blocked member ' + k); f = thisArg == null ? undefined : thisArg[k]; }
          else if (n.f.k === 'id') f = ev(n.f);
          else throw new Error('unsupported call');
          if (typeof f !== 'function') throw new Error('not a function');
          return f.apply(thisArg, n.a.map(ev));
        }
        case 'asg': { const o = ev(n.l.o), k = ev(n.l.n); if (BAD_MEMBER.has(k) || BAD_ASSIGN.test(String(k))) throw new Error('blocked assignment to ' + k); if (typeof window !== 'undefined' && (o === window || o === document || o === window.location)) throw new Error('blocked assignment on window/document'); const v = ev(n.r); o[k] = v; return v; }
        case 'un': { const v = ev(n.e); return n.op === '!' ? !v : -v; }
        case 'cnd': return ev(n.c) ? ev(n.a) : ev(n.b);
        case 'bin': {
          if (n.op === '&&') { const l = ev(n.l); return l ? ev(n.r) : l; }
          if (n.op === '||') { const l = ev(n.l); return l ? l : ev(n.r); }
          const l = ev(n.l), r = ev(n.r);
          switch (n.op) { case '===': return l === r; case '!==': return l !== r; case '==': return l == r; case '!=': return l != r; case '<': return l < r; case '>': return l > r; case '<=': return l <= r; case '>=': return l >= r; case '+': return l + r; case '-': return l - r; case '*': return l * r; }
          throw new Error('bad operator');
        }
      }
      throw new Error('bad node');
    };
    const exec = (s) => {
      if (s.k === 'ret') throw { [RET]: true, v: s.e ? ev(s.e) : undefined };
      if (s.k === 'if') { if (ev(s.c)) exec(s.s); return; }
      ev(s.e);
    };
    try { ast.forEach(exec); } catch (e) { if (e && e[RET]) return e.v; throw e; }
    return undefined;
  }

  const cache = new Map();
  let compiled = [], scope = {};
  function dispatch(el, text, ev) {
    let r;
    if (text.charAt(0) === '#') { const f = compiled[+text.slice(1)]; r = f && f.call(el, ev); }
    else {
      let ast = cache.get(text);
      if (!ast) { ast = parse(text); cache.set(text, ast); }
      r = run(ast, { el, ev, scope });
    }
    if (r === false) ev.preventDefault();
  }

  const TYPES = ['click', 'change', 'input', 'keydown', 'keyup', 'keypress', 'submit', 'dblclick', 'mouseover', 'mouseout', 'mousedown', 'mouseup', 'touchstart', 'paste', 'drop', 'dragover', 'dragleave', 'dragenter', 'contextmenu'];
  const CAPTURE = ['focus', 'blur'];
  function listen() {
    const attrFor = (t) => 'data-on-' + t;
    const handle = (type, onlyTarget) => (ev) => {
      let el = ev.target;
      while (el && el.nodeType === 1) {
        const text = el.getAttribute(attrFor(type));
        if (text != null && text !== '') {
          try { dispatch(el, text, ev); } catch (err) { console.error('[ulyOS app handler]', text, err); }
          if (ev.cancelBubble) break;
        }
        if (onlyTarget) break;
        el = el.parentNode;
      }
    };
    TYPES.forEach((t) => document.addEventListener(t, handle(t, false)));
    CAPTURE.forEach((t) => document.addEventListener(t, handle(t, true), true));
  }

  const bridge = {
    install(handlers, sc) { compiled = handlers; scope = sc; listen(); },
    parse, run,
  };
  root.ulyOSBridge = bridge;
  if (typeof module !== 'undefined' && module.exports) module.exports = bridge;
})(typeof window !== 'undefined' ? window : globalThis);
