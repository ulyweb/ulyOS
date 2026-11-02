// Pure unit tests for the inline-handler interpreter (no browser needed).
const { test, expect } = require('@playwright/test');
const bridge = require('../js/app-bridge.js');
global.window = global.window || undefined;

const run = (code, scope = {}, el = {}) => bridge.run(bridge.parse(code), { el, ev: {}, scope });

test('parses and runs the handler shapes the apps use', () => {
  const calls = [];
  const vault = { batch: [{ shown: false }] };
  const scope = { f: () => (...a) => calls.push(a), vault: () => vault };
  run("f('a', 1, -1)", scope); run("f(this.value, this.checked)", scope, { value: 'v', checked: true });
  run("vault.batch[0].shown=!vault.batch[0].shown;f(vault.batch[0].shown)", scope);
  run("if (event.key==='Enter') f('go')", scope); run("f(1); return false", scope);
  expect(calls).toEqual([['a', 1, -1], ['v', true], [true], [1]]);
  expect(run('return false')).toBe(false);
});

test('refuses everything outside the allow-list', () => {
  const scope = { f: () => () => 'ok' };
  for (const bad of ['eval("1")', 'fetch("/x")', 'this.constructor.constructor("1")()', 'f.__proto__', 'x = 1', 'window.location = "x"', 'this.innerHTML = "<b>"', 'document.cookie = "a=b"', 'while(1){}', 'new Foo()', '`x`'])
    expect(() => run(bad, scope, { constructor: Object, innerHTML: '' }), bad).toThrow();
});
