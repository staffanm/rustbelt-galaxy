// Browser test: starts the built game, plays some turns through the user interface, and saves screenshots.
// Usage: npx vite build && node scripts/smoke.mjs [output folder]
import { chromium } from 'playwright-core';
import { preview } from 'vite';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const out = process.argv[2] ?? 'screenshots';
function browserPath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const root = join(homedir(), '.cache/ms-playwright');
  if (existsSync(root)) {
    for (const dir of readdirSync(root).filter((d) => d.startsWith('chromium-')).sort().reverse()) {
      const p = join(root, dir, 'chrome-linux64/chrome');
      if (existsSync(p)) return p;
      const q = join(root, dir, 'chrome-linux/chrome');
      if (existsSync(q)) return q;
    }
  }
  return '/usr/bin/google-chrome';
}

const server = await preview({ preview: { port: 4179, strictPort: true }, logLevel: 'error' });
const browser = await chromium.launch({ executablePath: browserPath(), args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
const shot = (name) => page.screenshot({ path: join(out, `${name}.png`) });
const click = (text) => page.getByRole('button', { name: text, exact: true }).first().click();

try {
  await page.goto('http://localhost:4179/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('.menu');
  await shot('01-menu');
  await click('New game');
  await page.locator('.species').nth(3).click();
  await shot('02-newgame');
  await page.locator('input[type=number]').fill('4242');
  await click('Start');
  await page.waitForSelector('.topbar');
  await page.waitForTimeout(300);
  await shot('03-start');

  // Open the home planet and queue two items.
  await page.evaluate(() => {
    const app = window.app;
    app.openPlanet(app.s.planets.find((p) => p.owner === app.me));
  });
  await page.waitForSelector('.planetright');
  await page.locator('.planetright .option .grow').first().click();
  await page.locator('.planetright .option .grow').nth(1).click();
  await shot('04-planet');
  await page.keyboard.press('Escape');

  await page.keyboard.press('t');
  await page.waitForSelector('.tech');
  await page.locator('.tech', { hasText: 'Warp Drive' }).click();
  await shot('05-research');
  await page.keyboard.press('Escape');

  // Move a unit with a right click on a reachable hex.
  const moved = await page.evaluate(() => {
    const app = window.app;
    app.selectNext();
    app.refresh();
    const u = app.selectedUnit;
    if (!u || !app.reach?.size) return 'no unit';
    const target = [...app.reach.keys()][0];
    const from = u.hex;
    const p = app.renderer.center(target);
    return { x: p.x, y: p.y, from, target, id: u.id };
  });
  if (typeof moved === 'string') throw new Error(moved);
  await page.mouse.click(moved.x, moved.y, { button: 'right' });
  const after = await page.evaluate((id) => window.app.s.units.find((u) => u.id === id)?.hex, moved.id);
  if (after !== moved.target) throw new Error(`unit did not move: ${JSON.stringify(moved)} now ${after}`);

  // Play 30 turns. Units explore or sleep.
  for (let t = 0; t < 30; t++) {
    await page.evaluate(() => {
      const app = window.app;
      for (const u of app.needsOrders()) {
        app.select(u);
        if (app.canColonize(u)) app.unitCommand('colonize');
        else app.unitCommand(u.type.includes('scout') || u.type === 'privateer' ? 'explore' : 'sleep');
      }
      for (const p of app.s.planets) {
        if (p.owner === app.me && !p.queue.length) {
          app.openPlanet(p);
          const el = document.querySelector('.planetright .option:not(.off) .grow');
          if (el) el.click();
          app.closePlanet();
        }
      }
    });
    await page.keyboard.press('Shift+Enter');
  }
  await page.waitForTimeout(200);
  const state = await page.evaluate(() => ({ turn: window.app.s.turn, planets: window.app.s.planets.filter((p) => p.owner === 0).length, techs: window.app.faction.techs.length }));
  console.log('state after 30 turns', JSON.stringify(state));
  if (state.turn !== 31) throw new Error(`expected turn 31, got ${state.turn}`);
  await page.keyboard.press('c');
  await page.keyboard.press('y');
  await page.mouse.move(800, 450);
  await shot('06-turn31');
  await page.keyboard.press('-');
  await page.waitForTimeout(100);
  await shot('07-zoomout');
  await page.keyboard.press('=');

  await page.keyboard.press('g');
  await page.waitForSelector('.factions');
  await shot('08-diplomacy');
  await page.keyboard.press('Escape');
  await page.keyboard.press('o');
  await page.waitForSelector('.rules');
  await shot('09-forum');
  await page.keyboard.press('Escape');
  await page.keyboard.press('e');
  await page.waitForSelector('.ency');
  await page.locator('.cats .entry', { hasText: 'Units' }).click();
  await page.locator('.names .entry', { hasText: 'Siege Hulk' }).click();
  await shot('10-encyclopedia');
  await page.keyboard.press('Escape');

  // Planet screen: fix a worker with a click on the map, buy a hex, start a trade route.
  const planetTest = await page.evaluate(() => {
    const app = window.app;
    const p = app.s.planets.find((x) => x.owner === app.me);
    p.buildings.push('bazaar_ring');
    app.faction.credits = 500;
    app.openPlanet(p);
    const hex = app.s.hexes.findIndex((h, i) => h.owner === p.id && i !== p.hex && !p.worked.includes(i) && h.terrain !== 'rift');
    const c = app.renderer.center(hex);
    return { x: c.x, y: c.y, hex, id: p.id };
  });
  await page.mouse.click(planetTest.x, planetTest.y);
  const locked = await page.evaluate((t) => window.app.s.planets[t.id].locked.includes(t.hex), planetTest);
  if (!locked) throw new Error('click on an owned hex did not fix a worker');
  await page.getByRole('button', { name: /Buy a hex/ }).click();
  const buy = await page.evaluate(() => {
    const app = window.app;
    const before = app.s.hexes.filter((h) => h.owner === app.planetId).length;
    return { before, mode: app.mode };
  });
  if (buy.mode !== 'buyHex') throw new Error('buy mode is not active');
  await shot('12-buyhex');
  const spot = await page.evaluate(() => {
    const app = window.app;
    const hex = window.core.claimOptions(app.s, app.planet)[0];
    return { hex, ...app.renderer.center(hex) };
  });
  await page.mouse.click(spot.x, spot.y);
  const bought = await page.evaluate((t) => window.app.s.hexes[t.hex].owner === window.app.planetId && window.app.s.hexes.filter((h) => h.owner === window.app.planetId).length, spot);
  if (bought !== buy.before + 1) throw new Error(`hex count ${bought}, expected ${buy.before + 1}`);
  if (!bought) throw new Error('no hex was bought');
  const routeOptions = await page.locator('.planetleft select option').count();
  if (routeOptions > 1) {
    await page.locator('.planetleft select').selectOption({ index: 1 });
    const routes = await page.evaluate(() => window.app.planet.routes.length);
    if (routes !== 1) throw new Error('the trade route was not started');
  }
  await shot('13-planet-routes');
  await page.keyboard.press('Escape');

  // Combat through the user interface: a frigate attacks an enemy corvette with a right click.
  const fight = await page.evaluate(() => {
    const app = window.app;
    const s = app.s;
    const p = s.planets.find((x) => x.owner === app.me);
    const free = (i) => s.hexes[i].terrain === 'space' && !s.units.some((u) => u.hex === i);
    let a = -1;
    let b = -1;
    for (let i = 0; i < s.hexes.length && a < 0; i++) {
      if (!free(i) || s.hexes[i].owner !== p.id) continue;
      const row = Math.floor(i / s.width);
      if (i % s.width < s.width - 1 && free(i + 1) && Math.floor((i + 1) / s.width) === row) {
        a = i;
        b = i + 1;
      }
    }
    if (a < 0) return null;
    window.core.meet(s, app.me, 1);
    window.core.declareWar(s, app.me, 1);
    const mine = window.core.createUnit(s, app.me, 'frigate', a);
    const enemy = window.core.createUnit(s, 1, 'corvette', b);
    app.select(mine, true);
    app.refresh();
    const c = app.renderer.center(b);
    return { x: c.x, y: c.y, mine: mine.id, enemy: enemy.id, targets: app.targets.includes(b) };
  });
  if (!fight) throw new Error('no place for the combat test');
  if (!fight.targets) throw new Error('the enemy is not marked as a target');
  await page.mouse.move(fight.x, fight.y);
  await page.waitForTimeout(50);
  const previewText = await page.locator('.hexinfo .preview').textContent();
  if (!/Expected damage/.test(previewText ?? '')) throw new Error('no attack preview');
  await shot('14-attack-preview');
  await page.mouse.click(fight.x, fight.y, { button: 'right' });
  const result = await page.evaluate((f) => {
    const s = window.app.s;
    const enemy = s.units.find((u) => u.id === f.enemy);
    const mine = s.units.find((u) => u.id === f.mine);
    return { enemyHp: enemy?.hp ?? 0, mineHp: mine?.hp ?? 0, attacked: mine?.attacked };
  }, fight);
  if (!(result.enemyHp < 100) || !result.attacked) throw new Error(`attack had no effect: ${JSON.stringify(result)}`);
  console.log('combat result', JSON.stringify(result));
  await page.waitForTimeout(300);
  await shot('15-after-attack');

  // Diplomacy buttons
  await page.keyboard.press('g');
  await page.waitForSelector('.factions');
  await page.getByRole('button', { name: 'Propose peace', exact: true }).first().click();
  await page.waitForSelector('.answer');
  await shot('16-diplomacy-war');
  await page.keyboard.press('Escape');

  // Save, reload the page, continue from the autosave.
  await page.keyboard.press('Shift+Enter');
  await page.reload();
  await page.waitForSelector('.menu');
  await page.getByRole('button', { name: /Continue/ }).click();
  await page.waitForSelector('.topbar');
  const turn = await page.evaluate(() => window.app.s.turn);
  if (turn !== 32) throw new Error(`autosave has turn ${turn}`);
  await shot('11-loaded');
  console.log(errors.length ? `page errors:\n${errors.join('\n')}` : 'no page errors');
  if (errors.length) process.exitCode = 1;
} catch (e) {
  await shot('error');
  console.error('FAILED', e);
  console.error(errors.join('\n'));
  process.exitCode = 1;
} finally {
  await browser.close();
  await server.close();
}
