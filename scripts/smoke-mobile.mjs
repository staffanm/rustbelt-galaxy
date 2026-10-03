// Browser test on a phone: touch gestures, sheets and screens on an iPhone sized window. Usage: npx vite build && node scripts/smoke-mobile.mjs [output folder]
import { chromium, devices } from 'playwright-core';
import { preview } from 'vite';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
const out = process.argv[2] ?? "screenshots";
function browserPath() {
  const root = join(homedir(), '.cache/ms-playwright');
  for (const dir of readdirSync(root).filter((d) => d.startsWith('chromium-')).sort().reverse()) {
    for (const sub of ['chrome-linux64/chrome', 'chrome-linux/chrome']) if (existsSync(join(root, dir, sub))) return join(root, dir, sub);
  }
  return '/usr/bin/google-chrome';
}
const server = await preview({ preview: { port: 4183, strictPort: true }, logLevel: 'error' });
const browser = await chromium.launch({ executablePath: browserPath(), args: ['--no-sandbox'] });
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const shot = (n) => page.screenshot({ path: join(out, n + '.png') });
const check = (name, ok, extra) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ' ' + JSON.stringify(extra)}`); if (!ok) process.exitCode = 1; };
const st = () => page.evaluate(() => ({ screen: window.app.screen, sel: window.app.selected, planet: window.app.planetId, tab: window.app.planetTab, hover: window.app.hover, armed: window.app.armed, mobile: window.app.mobile, zoom: window.app.camera.size }));
const tapHex = async (hex) => { const p = await page.evaluate((hex) => window.app.renderer.center(hex), hex); await page.touchscreen.tap(p.x, p.y); await page.waitForTimeout(150); };
try {
  await page.goto('http://localhost:4183/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('.menu');
  await shot('m01-menu');
  await page.getByRole('button', { name: 'New game', exact: true }).tap();
  await page.waitForSelector('.speciesgrid');
  await shot('m02-newgame');
  await page.locator('input[type=number]').fill('4242');
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await page.waitForSelector('.topbar');
  await page.waitForTimeout(300);
  let s = await st(); check('mobile layout is on', s.mobile === true, s);
  await shot('m03-map');
  // The game selected the first unit. A drag of the unit to an empty hex two steps away moves it.
  const cdp = await ctx.newCDPSession(page);
  const u = await page.evaluate(() => { const a = window.app; const u = a.selectedUnit; return { id: u.id, hex: u.hex, reach: [...a.reach.keys()] }; });
  const target = await page.evaluate((u) => { const s = window.app.s; return u.reach.find((h) => s.hexes[h].terrain === 'space' && !s.units.some((x) => x.hex === h)); }, u);
  const from = await page.evaluate((h) => window.app.renderer.center(h), u.hex);
  const to = await page.evaluate((h) => window.app.renderer.center(h), target);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] });
  for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + ((to.x - from.x) * i) / 8, y: from.y + ((to.y - from.y) * i) / 8 }] });
  const preview = await page.evaluate(() => window.app.pathPreview.length);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(150);
  const moved = await page.evaluate((id) => window.app.s.units.find((x) => x.id === id)?.hex, u.id);
  check('a drag of the selected unit shows the path and moves it', moved === target && preview > 0, { moved, target, preview });
  // A tap on an empty hex shows the hex sheet and moves nothing.
  const other = await page.evaluate((t) => { const s = window.app.s; return window.app.renderer.center([...window.app.s.hexes.keys()].find((h) => s.hexes[h].terrain === 'space' && h !== t && Math.abs(h - t) < 3)); }, target);
  await page.touchscreen.tap(other.x, other.y);
  await page.waitForTimeout(150);
  s = await st(); check('a tap on an empty hex shows the hex and moves nothing', s.hover >= 0 && (await page.evaluate((id) => window.app.s.units.find((x) => x.id === id)?.hex, u.id)) === moved && (await page.locator('.bottomleft .hexinfo').count()) === 1, s);
  await shot('m04-after-move');
  // Tap the own home planet: the planet sheet opens.
  const home = await page.evaluate(() => window.app.s.planets.find((p) => p.owner === window.app.me).hex);
  await page.evaluate(() => (window.app.hover = -1, window.app.peek = false, window.app.selected = null));
  await page.evaluate((h) => window.app.renderer.centerOn(h), home);
  await tapHex(home);
  s = await st(); check('a tap on the home planet opens the planet sheet', s.planet !== null && s.tab === 'planet', s);
  await shot('m05-planet');
  await page.getByRole('button', { name: 'Production', exact: true }).tap();
  await page.waitForTimeout(100);
  await shot('m06-production');
  const q0 = await page.evaluate(() => window.app.planet.queue.length);
  await page.locator('.planetright .option .grow').first().tap();
  check('a tap on an option queues it', (await page.evaluate(() => window.app.planet.queue.length)) === q0 + 1);
  await page.getByRole('button', { name: 'Map', exact: true }).tap();
  s = await st(); check('the map tab keeps the planet open', s.planet !== null && s.tab === 'map', s);
  await shot('m07-planet-map');
  await page.getByRole('button', { name: 'Close', exact: true }).tap();
  // Zoom out to the smallest size.
  for (let i = 0; i < 4; i++) await page.evaluate(() => window.app.renderer.zoom(-1, 200, 400));
  s = await st(); check('the map zooms out to 16', s.zoom === 16, s);
  await shot('m08-zoomout');
  await page.evaluate(() => window.app.renderer.zoom(1, 200, 400));
  await page.evaluate(() => window.app.renderer.zoom(1, 200, 400));
  s = await st();
  // Pinch zoom out.
  const z0 = s.zoom;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 100, y: 400 }, { x: 300, y: 400 }] });
  for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 100 + i * 12, y: 400 }, { x: 300 - i * 12, y: 400 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(150);
  s = await st(); check('a pinch zooms the map out', s.zoom < z0, { z0, now: s.zoom });
  // Menu and screens.
  await page.locator('.menubtn').tap();
  await page.waitForSelector('.menu');
  await shot('m09-menu-ingame');
  await page.getByRole('button', { name: 'Research', exact: true }).tap();
  await page.waitForTimeout(200);
  await shot('m10-research');
  await page.getByRole('button', { name: 'Close', exact: true }).tap();
  await page.locator('.menubtn').tap();
  await page.getByRole('button', { name: 'Encyclopedia', exact: true }).tap();
  await page.waitForTimeout(200);
  await shot('m11-ency-list');
  await page.locator('.names .entry').nth(2).tap();
  await page.waitForTimeout(200);
  s = await st(); check('an entry opens the detail view', await page.locator('.ency.detail').count() === 1, s);
  await shot('m12-ency-detail');
  await page.getByRole('button', { name: 'Back to the list', exact: true }).tap();
  check('back returns to the list', await page.locator('.ency.list').count() === 1);
  await page.getByRole('button', { name: 'Close', exact: true }).tap();
  // Diplomacy and end turn.
  await page.locator('.menubtn').tap();
  await page.getByRole('button', { name: 'Diplomacy', exact: true }).tap();
  await page.waitForTimeout(200);
  await shot('m13-diplomacy');
  await page.getByRole('button', { name: 'Close', exact: true }).tap();
  await page.getByRole('button', { name: 'End shift now', exact: true }).tap();
  await page.waitForTimeout(600);
  check('the turn ends', (await page.evaluate(() => window.app.s.turn)) >= 2);
  await shot('m14-turn2');
  check('no page errors', errors.length === 0, errors);
} finally { await browser.close(); await server.httpServer.close(); }
