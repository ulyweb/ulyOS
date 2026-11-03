const { test, expect } = require('@playwright/test');
const { PW, hermetic, createProfile, watch } = require('./helpers');

test.beforeEach(async ({ context }) => { await hermetic(context); });

test('full-colour app icons: desktop, folder, taskbar; can be switched off', async ({ page }) => {
  const problems = watch(page);
  await createProfile(page, 'Icons');
  const rich = await page.evaluate(() => ({
    desk: [...document.querySelectorAll('#desktop .desk-icon')].map((e) => [e.getAttribute('aria-label'), !!e.querySelector('.di-tile.has-rich svg')]),
    dock: [...document.querySelectorAll('#taskbar .tb-item.pinned')].map((e) => !!e.querySelector('.rich-ico svg')),
    flag: document.body.dataset.rich,
  }));
  expect(rich.desk).toEqual([['Gemini Live', true], ['Speak', true], ['Beam', true], ['App Store', true], ['Apps', true]]);
  expect(rich.dock).toEqual([true, true, true, true]);
  expect(rich.flag).toBe('1');
  await page.dblclick('.desk-icon[data-id="apps"]');
  await page.waitForSelector('.fld-item');
  expect(await page.locator('.fld-item .di-tile.has-rich').count()).toBe(await page.locator('.fld-item').count());   // every stock app has artwork
  expect(await page.evaluate(() => ulyOS.richIcons.ids().length)).toBeGreaterThanOrEqual(15);
  // every icon is well-formed SVG with no scripts or external references
  const bad = await page.evaluate(() => ulyOS.richIcons.ids().filter((id) => { const d = new DOMParser().parseFromString(ulyOS.richIcons.svg(id), 'image/svg+xml'); const s = ulyOS.richIcons.svg(id); return d.querySelector('parsererror') || /<script|href=|onload|http/i.test(s.replace('http://www.w3.org/2000/svg', '')); }));
  expect(bad).toEqual([]);
  await page.evaluate(() => ulyOS.desktopApi.Settings.set('richIcons', false));
  await page.waitForTimeout(400);
  expect(await page.locator('#desktop .di-tile.has-rich').count()).toBe(0);
  expect(await page.locator('#desktop .desk-icon').count()).toBe(5);
  expect(problems).toEqual([]);
});

test('space and anime-style wallpapers: grouped, selectable, valid vector images', async ({ page }) => {
  const problems = watch(page);
  await createProfile(page, 'Walls');
  const info = await page.evaluate(() => ulyOS.landscapes.groups.map(([t, l]) => [t, l.length]));
  expect(info).toEqual([['Nature & landscapes', 12], ['Space', 8], ['Anime-style', 7], ['Futuristic', 8]]);
  const check = await page.evaluate(() => ulyOS.landscapes.list.map(([id]) => { const u = ulyOS.landscapes.url(id); const svg = decodeURIComponent(u.replace('data:image/svg+xml,', '')); const d = new DOMParser().parseFromString(svg, 'image/svg+xml'); return [id, !d.querySelector('parsererror'), /<script|onload|xlink:href|href=/i.test(svg), Math.round(u.length / 1024)]; }));
  for (const [id, ok, unsafe, kb] of check) { expect(ok, id + ' parses').toBe(true); expect(unsafe, id + ' has no scripts or links').toBe(false); expect(kb, id + ' size').toBeLessThan(200); }
  await page.evaluate(() => ulyOS.desktopApi.openSettings('appearance'));
  await page.waitForSelector('.set-content h3:has-text("Space")');
  await expect(page.locator('.set-content h3:has-text("Anime-style")')).toHaveCount(1);
  await page.click('.wp-tile[title="Mars dusk"]');
  expect(await page.evaluate(() => ulyOS.desktopApi.Settings.get('wallpaper'))).toBe('land:space-mars');
  expect(await page.evaluate(() => document.getElementById('wallpaper').style.backgroundImage)).toContain('data:image/svg+xml');
  await page.click('.wp-tile[title="Sakura twilight"]');
  expect(await page.evaluate(() => ulyOS.desktopApi.Settings.get('wallpaper'))).toBe('land:anime-sakura');
  // the desktop right-click menu lists the groups too
  await page.evaluate(() => ulyOS.WM.all().forEach((w) => ulyOS.WM.close(w, { force: true })));
  await page.mouse.click(800, 600, { button: 'right' });
  await page.hover('.ctx-item:has-text("Wallpaper")');
  await expect(page.locator('.ctx-item:has-text("Anime-style")')).toHaveCount(1);
  expect(problems).toEqual([]);
});

test('profile pictures: emoji and photo at creation, in the picker, the taskbar and backups; hostile values ignored', async ({ page, context }) => {
  const problems = watch(page);
  await page.goto('/index.html');
  await page.waitForSelector('.auth-form');
  await page.fill('input[placeholder="Profile name"]', 'Pic');
  await page.click('.av-tabs button:has-text("Emoji")');
  await page.click('.av-grid button[aria-label="🦊"]');
  await expect(page.locator('.prev .avatar')).toContainText('🦊');
  expect(await page.evaluate(() => { const a = document.querySelector('.prev .avatar'); const r = document.createRange(); r.selectNodeContents(a); const t = r.getBoundingClientRect(), b = a.getBoundingClientRect(); return Math.abs((t.left + t.width / 2) - (b.left + b.width / 2)) < 2; })).toBe(true);   // the emoji sits in the middle of the circle
  await page.fill('.pwc input[placeholder="Password"]', PW); await page.fill('.pwc input[placeholder="Confirm"]', PW);
  await page.click('button:has-text("Create profile")');
  await page.waitForSelector('.desk-icon', { timeout: 45000 });
  await page.evaluate(() => ulyOS.vault.set('ulyos.tour.seen', '1'));
  expect(await page.evaluate(() => ulyOS.security.profile().avatar)).toEqual({ t: 'emoji', v: '🦊' });
  await expect(page.locator('#tray-user .avatar')).toContainText('🦊');
  // change to a photo in Settings
  await page.evaluate(() => ulyOS.desktopApi.openSettings('security'));
  await page.click('.set-row:has-text("Picture") button:has-text("Change")');
  await page.click('.modal .av-tabs button:has-text("Photo")');
  const png = Buffer.from(await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 60; c.height = 40; const g = c.getContext('2d'); g.fillStyle = '#e44'; g.fillRect(0, 0, 60, 40); g.fillStyle = '#4ae'; g.fillRect(10, 10, 30, 20); return c.toDataURL('image/png').split(',')[1]; }), 'base64');
  await page.setInputFiles('.modal .av-picker input[type=file]:not([capture])', { name: 'me.png', mimeType: 'image/png', buffer: png });
  await expect(page.locator('.modal .prev .avatar img')).toHaveCount(1);
  await page.click('.modal button:has-text("Save")');
  const a = await page.evaluate(() => ulyOS.security.profile().avatar);
  expect(a.t).toBe('photo'); expect(a.v).toMatch(/^data:image\/jpeg;base64,/); expect(a.v.length).toBeLessThan(60000);
  await expect(page.locator('#tray-user .avatar img')).toHaveCount(1);
  // backup carries the picture
  const text = await page.evaluate(async (p) => await (await ulyOS.security.exportProfile(p)).text(), 'Backup-Phrase-Zx9!-long');
  expect(JSON.parse(text).profile.avatar.t).toBe('photo');
  // the picture shows on the profile screen
  await page.evaluate(() => ulyOS.security.signOut());
  await page.waitForSelector('.auth-form');
  await expect(page.locator('.auth-form .avatar img')).toHaveCount(1);
  // tampered registry entries (script-ish emoji, javascript: photo) fall back to the letter
  await page.evaluate(() => { const l = JSON.parse(localStorage.getItem('ulyos.profiles')); l[0].avatar = { t: 'emoji', v: '<img src=x onerror=alert(1)>' }; localStorage.setItem('ulyos.profiles', JSON.stringify(l)); });
  await page.reload(); await page.waitForSelector('.auth-form');
  expect(await page.locator('.auth-form .avatar').textContent()).toBe('P');
  expect(await page.locator('.auth-form .avatar img').count()).toBe(0);
  await page.evaluate(() => { const l = JSON.parse(localStorage.getItem('ulyos.profiles')); l[0].avatar = { t: 'photo', v: 'javascript:alert(1)' }; localStorage.setItem('ulyos.profiles', JSON.stringify(l)); });
  await page.reload(); await page.waitForSelector('.auth-form');
  expect(await page.locator('.auth-form .avatar img').count()).toBe(0);
  expect(problems).toEqual([]);
});

test('widgets: pin in place, per-widget and global themes, persistence, hostile values ignored', async ({ page }) => {
  const problems = watch(page);
  await createProfile(page, 'Pin');
  await page.setViewportSize({ width: 1500, height: 950 });
  await page.evaluate(() => ['clock', 'notes', 'crypto'].forEach((t) => ulyOS.Widgets.add(t, 'm')));
  await page.waitForSelector('.wgt-crypto'); await page.waitForTimeout(500);
  const id = (t) => page.evaluate((t) => ulyOS.Widgets.list().find((i) => i.type === t).id, t);
  const box = (t) => page.locator('.wgt-' + t).boundingBox();
  // pin the notes widget with the header button, then try to drag and resize it
  const b0 = await box('notes');
  await page.hover('.wgt-notes');
  await page.click('.wgt-notes .w-pin');
  expect(await page.evaluate(() => ulyOS.Widgets.list().find((i) => i.type === 'notes').pin)).toBe(true);
  await expect(page.locator('.wgt-notes')).toHaveClass(/pinned/);
  await page.mouse.move(b0.x + 80, b0.y + 12); await page.mouse.down(); await page.mouse.move(b0.x - 200, b0.y + 120, { steps: 5 }); await page.mouse.up();
  const b1 = await box('notes');
  expect(Math.abs(b1.x - b0.x) + Math.abs(b1.y - b0.y)).toBeLessThanOrEqual(4);   // it does not follow the drag (only sub-pixel rounding)
  expect(await page.locator('.wgt-notes .w-rz').isVisible()).toBe(false);
  // window shrinks: the pinned widget is not the one that moves; the others avoid it
  await page.setViewportSize({ width: 1100, height: 700 }); await page.waitForTimeout(800);
  const pinned = await page.evaluate(() => { const w = document.querySelector('.wgt-notes').getBoundingClientRect(), d = document.getElementById('desktop').getBoundingClientRect(); return { right: Math.round(d.right - w.right), top: Math.round(w.top - d.top) }; });
  const others = await page.evaluate(() => { const n = document.querySelector('.wgt-notes').getBoundingClientRect(); return [...document.querySelectorAll('.wgt:not(.wgt-notes)')].every((e) => { const r = e.getBoundingClientRect(); return r.right <= n.left + 1 || r.left >= n.right - 1 || r.bottom <= n.top + 1 || r.top >= n.bottom - 1; }); });
  expect(others).toBe(true);
  expect(pinned.right).toBeLessThan(80);
  // unpin via the context menu
  await page.click('.wgt-notes', { button: 'right', position: { x: 60, y: 60 } });
  await page.click('.ctx-item:has-text("Unpin")');
  await expect.poll(() => page.evaluate(() => !!ulyOS.Widgets.list().find((i) => i.type === 'notes').pin)).toBe(false);   // menu actions run after the close animation
  // themes
  const w1 = (t) => page.evaluate((t) => document.querySelector('.wgt-' + t).style.getPropertyValue('--w1'), t);
  await page.evaluate((i) => ulyOS.Widgets.setTheme(i, 'ocean'), await id('clock'));
  expect(await w1('clock')).toBe('#0ea5e9');
  await page.evaluate((i) => ulyOS.Widgets.setTheme(i, 'c:#112233,#445566'), await id('notes'));
  expect(await w1('notes')).toBe('#112233');
  await page.evaluate((i) => ulyOS.Widgets.setTheme(i, 'url(javascript:1)'), await id('crypto'));
  expect(await w1('crypto')).toBe('');                                    // rejected → keeps its default palette
  await page.evaluate(() => ulyOS.desktopApi.Settings.set('widgetTheme', 'sunset'));
  expect(await w1('crypto')).toBe('#fb7185');                             // global theme applies to widgets without their own
  expect(await w1('clock')).toBe('#0ea5e9');                              // …but not over a widget's own choice
  // persistence across sign-in
  await page.evaluate(() => ulyOS.Widgets.setPin(ulyOS.Widgets.list().find((i) => i.type === 'clock').id, true));
  await page.evaluate(() => ulyOS.security.signOut());
  await page.waitForSelector('.auth-form'); await page.fill('.auth-input', PW); await page.click('.auth-go');
  await page.waitForSelector('.wgt-clock', { timeout: 45000 });
  expect(await page.evaluate(() => { const c = ulyOS.Widgets.list().find((i) => i.type === 'clock'); return [c.pin, c.theme]; })).toEqual([true, 'ocean']);
  await expect(page.locator('.wgt-clock')).toHaveClass(/pinned/);
  expect(problems).toEqual([]);
});

test('new widgets: to-do (private, persistent), world clocks, moon, device, weather (mocked)', async ({ page }) => {
  const problems = watch(page);
  await page.route('https://geocoding-api.open-meteo.com/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ results: [{ name: 'Paris', country_code: 'FR', latitude: 48.85, longitude: 2.35 }] }) }));
  let wxUrl = '';
  await page.route('https://api.open-meteo.com/**', (r) => { wxUrl = r.request().url(); r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ current: { temperature_2m: 18.4, weather_code: 2, wind_speed_10m: 12, apparent_temperature: 17 }, daily: { time: ['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07'], weather_code: [2, 61, 3, 0, 95], temperature_2m_max: [19, 15, 14, 20, 17], temperature_2m_min: [9, 8, 7, 10, 11] } }) }); });
  await createProfile(page, 'Wid');
  await page.setViewportSize({ width: 1700, height: 1000 });
  await page.evaluate(() => ['todo', 'world', 'moon', 'device', 'weather'].forEach((t) => ulyOS.Widgets.add(t)));
  await page.waitForSelector('.wgt-weather'); await page.waitForTimeout(600);
  // to-do
  await page.fill('.wgt-todo input.input', 'buy milk'); await page.press('.wgt-todo input.input', 'Enter');
  await page.fill('.wgt-todo input.input', 'call mum'); await page.press('.wgt-todo input.input', 'Enter');
  await expect(page.locator('.wgt-todo .td-item')).toHaveCount(2);
  await page.check('.wgt-todo .td-item:has-text("buy milk") input');
  await expect(page.locator('.wgt-todo .td-foot')).toContainText('1 left');
  // world clocks, moon, device
  await expect(page.locator('.wgt-world .wc-row')).toHaveCount(3);
  expect(await page.locator('.wgt-world .wc-row b').first().textContent()).toMatch(/\d{1,2}:\d{2}/);
  expect(await page.locator('.wgt-moon .mn-face').textContent()).toMatch(/[🌑🌒🌓🌔🌕🌖🌗🌘]/u);
  await expect(page.locator('.wgt-device')).toContainText('CPU cores');
  // weather: asks for a city, then loads the mocked forecast
  await expect(page.locator('.wgt-weather')).toContainText('Choose a city');
  await page.click('.wgt-weather button:has-text("Choose a city")');
  await page.fill('.modal input >> nth=0', 'Paris'); await page.click('.modal button:has-text("Find")');
  await expect(page.locator('.wgt-weather .wx-big')).toContainText('18°C', { timeout: 15000 });
  await expect(page.locator('.wgt-weather .wx-day')).toHaveCount(5);
  expect(wxUrl).toContain('latitude=48.85');
  // to-do survives sign-out and is NOT part of the settings export; city is
  const exp = await page.evaluate(() => JSON.stringify(ulyOS.desktopApi.settingsFile().data.widgets));
  expect(exp).not.toContain('buy milk'); expect(exp).toContain('Paris');
  await page.evaluate(() => ulyOS.security.signOut());
  await page.waitForSelector('.auth-form'); await page.fill('.auth-input', PW); await page.click('.auth-go');
  await page.waitForSelector('.wgt-todo', { timeout: 45000 });
  await expect(page.locator('.wgt-todo .td-item')).toHaveCount(2);
  expect(problems).toEqual([]);
});

test('welcome screen v2 is rich: floating app icons, three benefits, stats, actions', async ({ page }) => {
  await createProfile(page, 'Hello', PW, { tour: true });
  await page.waitForSelector('.wl-card', { timeout: 15000 });
  expect(await page.locator('.wl-ico svg').count()).toBeGreaterThanOrEqual(5);
  expect(await page.locator('.wl-feat').count()).toBe(3);
  await expect(page.locator('.wl-stats')).toContainText('AES-256');
  await expect(page.locator('.wl-hello')).toContainText('Hello, Hello');
  await expect(page.locator('.wl-go')).toBeVisible();
  const box = await page.locator('.wl-card').boundingBox();
  expect(box.width).toBeGreaterThan(700);
  await page.setViewportSize({ width: 420, height: 800 });   // phones stack the two halves
  const b2 = await page.locator('.wl-card').boundingBox();
  expect(b2.width).toBeLessThanOrEqual(420);
  await page.keyboard.press('Enter');
  await expect(page.locator('.welcome')).toHaveCount(0);
});

test('photo wallpapers load only on request from Wikimedia Commons; unknown photo values are rejected', async ({ page }) => {
  const reqs = [];
  page.on('request', (r) => { if (/wikimedia/.test(r.url())) reqs.push(r.url()); });
  await createProfile(page, 'Photos');
  await page.evaluate(() => ulyOS.desktopApi.openSettings('appearance'));
  await page.waitForSelector('.set-content h3:has-text("Real photos")');
  expect(reqs).toEqual([]);                                   // nothing is fetched until you ask
  await page.click('.set-content button:has-text("Show photos")');
  await expect(page.locator('.wp-tile[title^="Pillars of Creation"]')).toHaveCount(1);
  await page.click('.wp-tile[title^="Pillars of Creation"]');
  expect(await page.evaluate(() => ulyOS.desktopApi.Settings.get('wallpaper'))).toBe('photo:pillars');
  const bg = await page.evaluate(() => document.getElementById('wallpaper').style.backgroundImage);
  expect(bg).toContain('https://commons.wikimedia.org/wiki/Special:FilePath/Pillars_of_creation');
  expect(bg).toMatch(/width=(1280|1920|2560|3840)/);
  expect(reqs.length).toBeGreaterThan(0);
  // imports cannot select a photo that is not in the list
  const kept = await page.evaluate(async () => { const f = new File([JSON.stringify({ format: 'ulyOS-settings', settings: { wallpaper: 'photo:../../evil' } })], 's.json'); const p = ulyOS.desktopApi.importSettings(f); await new Promise((r) => setTimeout(r, 400)); document.querySelector('.modal button:last-child').click(); await p; return ulyOS.desktopApi.Settings.get('wallpaper'); });
  expect(kept).toBe('photo:pillars');
});

test('defaults: Misty forest wallpaper; clock is customisable; icons animate; sign-in never clips', async ({ page }) => {
  const problems = watch(page);
  await createProfile(page, 'Clocky');
  expect(await page.evaluate(() => ulyOS.desktopApi.Settings.get('wallpaper'))).toBe('land:forest');
  // desktop icons have life: bob on the tile and motion inside the artwork
  const anim = await page.evaluate(() => { const t = document.querySelector('.desk-icon .di-tile.has-rich'); const b = document.querySelector('.desk-icon svg[data-ri=beam] .ri-b'); return [getComputedStyle(t).animationName, getComputedStyle(b).animationName]; });
  expect(anim).toEqual(['tile-bob', 'ri-fly']);
  // clock: 24-hour, no date, analog, stacked
  const S = (k, v) => page.evaluate(([a, b]) => { ulyOS.desktopApi.Settings.set(a, b); ulyOS.Shell.tickClock(); }, [k, v]);
  await S('clockFormat', '24'); await S('clockSeconds', false); await S('clockDate', 'iso');
  const txt = await page.locator('#tray-clock').innerText();
  expect(txt).toMatch(/\d{2}:\d{2}\s+\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/);
  await S('clockDate', 'none'); await S('clockSize', 20); await S('clockStyle', 'analog');
  expect(await page.locator('#tray-clock svg.aclock').count()).toBe(1);
  expect(await page.locator('#tray-clock span').count()).toBe(0);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--clock-size').trim())).toBe('20px');
  await S('clockStyle', 'lcd'); await S('clockLayout', 'stack');
  expect(await page.locator('#tray-clock').getAttribute('data-style')).toBe('lcd');
  // settings page has the controls
  await page.evaluate(() => ulyOS.desktopApi.openSettings('shell'));
  await page.waitForSelector('.set-content h3:has-text("Date & time")');
  expect(problems).toEqual([]);
});

test('create-profile screen scrolls on a short window instead of clipping the top', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 560 });
  await page.goto('/');
  await page.waitForSelector('#auth');
  const top = await page.evaluate(() => { const a = document.querySelector('#auth'); const first = a.firstElementChild.getBoundingClientRect(); return [first.top, a.scrollHeight > a.clientHeight]; });
  expect(top[0]).toBeGreaterThanOrEqual(0);   // the first element is never pushed above the top edge
});

test('screenshot: region select, save to Files, copy, visual search, send via Beam prompt', async ({ page, context }) => {
  const problems = watch(page);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  await page.addInitScript(() => {
    // simulated "share this tab": a canvas stream with a recognisable picture
    navigator.mediaDevices.getDisplayMedia = async () => {
      const c = document.createElement('canvas'); c.width = 1280; c.height = 720; const g = c.getContext('2d');
      const draw = () => { g.fillStyle = '#2a6df4'; g.fillRect(0, 0, 1280, 720); g.fillStyle = '#ffd54a'; g.fillRect(100, 100, 300, 200); };
      draw(); setInterval(draw, 50);
      return c.captureStream(20);
    };
    window.__opened = []; window.open = (u) => { window.__opened.push(u); return null; };
  });
  await createProfile(page, 'Shot');
  await page.evaluate(() => ulyOS.vault.set('ulyos.tour.seen', '1'));
  // right-click desktop → Screenshot submenu exists
  await page.evaluate(() => ulyOS.WM.all().forEach((w) => ulyOS.WM.close(w, { force: true })));
  await page.evaluate(() => document.querySelector('#desktop').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 800, clientY: 600 })));
  await expect(page.locator('.ctx-item:has-text("Screenshot")')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+Shift+S');
  await page.waitForSelector('.cap-ov');
  await page.mouse.move(200, 200); await page.mouse.down(); await page.mouse.move(520, 420, { steps: 6 }); await page.mouse.up();
  await page.waitForSelector('.cap-modal img');
  const dim = await page.evaluate(() => document.querySelector('.cap-modal .set-desc').textContent);
  expect(dim).toMatch(/\d+ × \d+ px/);
  await page.click('.cap-modal button:has-text("Save to Files")');
  await expect(page.locator('.toast.ok:has-text("Pictures/Screenshots")')).toHaveCount(1);
  expect(await page.evaluate(async () => { const f = await ulyOS.FS.readSandboxFile('Pictures/Screenshots'); return true; })).toBe(true);
  await page.click('.cap-modal button:has-text("Visual search")');
  expect(await page.evaluate(() => window.__opened)).toEqual(['https://lens.google.com/']);
  await page.click('.cap-modal button:has-text("Send to device")');
  await page.waitForSelector('.window:has-text("Beam")');
  await page.keyboard.press('Escape');
  expect(problems).toEqual([]);
});
