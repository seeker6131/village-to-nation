// Browser end-to-end tests (Playwright + Chromium). Run: npm run test:e2e
// Starts its own static server, drives the real UI with mouse/keyboard/touch, saves screenshots to qa/screens/.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const root = path.resolve(import.meta.dirname, '../..');
const SHOTS = path.join(root, 'qa', 'screens');
fs.mkdirSync(SHOTS, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.json': 'application/json' };
let server, base, browser;
const allErrors = [];

test.before(async () => {
  server = http.createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const f = path.join(root, u === '/' ? 'index.html' : u);
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  await new Promise(r => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch();
});
test.after(async () => { await browser?.close(); server?.close(); });

const DEVICES = {
  android: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2.6, hasTouch: true, isMobile: true },
  iphone: { viewport: { width: 932, height: 430 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' },
  pc: { viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 },
  pcHD: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 },
};
async function open(device = 'pc', { url = '/index.html?test=1', storage = null, name = 'ต้นกล้า' } = {}) {
  const ctx = await browser.newContext(DEVICES[device]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => { errors.push(e.message); allErrors.push(`${device}: ${e.message}`); });
  page.on('console', m => { if (m.type() === 'error') { errors.push(m.text()); allErrors.push(`${device}: ${m.text()}`); } });
  if (storage) await page.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); }, storage);
  await page.goto(base + url);
  await page.waitForFunction(() => window.__V2N__ && !document.querySelector('#app').classList.contains('booting'));
  if (name && await page.isVisible('#creator')) { await page.fill('#cr-name', name); await page.click('#cr-confirm'); await page.waitForTimeout(150); }
  if (name && await page.isVisible('#path-choice')) { await page.click('#path-choice [data-path=founder]'); await page.waitForTimeout(100); }
  return { ctx, page, errors };
}
const G = (page, fn, arg) => page.evaluate(([f, a]) => { const G = window.__V2N__.G; return new Function('G', 'a', 'return (' + f + ')(G,a)')(G, a); }, [fn.toString(), arg]);
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, name + '.png') });

// ------------------------------------------------------------------------------------------------
test('first run shows the dressing room; validates TH/EN names; saves the character', async () => {
  const { ctx, page, errors } = await open('android', { name: null });
  assert.ok(await page.isVisible('#creator'));
  await shot(page, '01_creator_android');
  await page.click('#cr-confirm');
  assert.match(await page.textContent('#cr-error'), /ตั้งชื่อ/);
  await page.fill('#cr-name', '<b>');
  assert.match(await page.textContent('#cr-error'), /ใช้ได้เฉพาะ/);
  await page.click('.cr-lang [data-lang=en]');
  assert.match(await page.textContent('#cr-title'), /Dressing/);
  await page.fill('#cr-name', 'River');
  await page.click('#cr-hair [data-v=short]');
  await page.click('#cr-haircolor [data-v=black]');
  await page.click('#cr-skin [data-v=s4]');
  await page.click('#cr-eyes [data-v=green]');
  await page.click('#cr-outfit [data-v=blue]');
  await page.click('#cr-next'); await page.click('#cr-next');
  assert.equal(await page.textContent('#cr-dir'), 'Back');
  await shot(page, '02_creator_custom_back');
  await page.click('#cr-confirm');
  assert.ok(await page.isHidden('#creator'));
  assert.ok(await page.isVisible('#path-choice'), 'founder / citizen choice after the dressing room');
  assert.equal(await page.isDisabled('#path-choice [data-path=citizen]'), true, 'citizen path needs the online server');
  await shot(page, '02b_path_choice');
  await page.click('#path-choice [data-path=founder]');
  const saved = JSON.parse(await page.evaluate(() => localStorage.getItem('v2n-prototype-v1')));
  assert.equal(saved.character.name, 'River'); assert.equal(saved.character.lang, 'en');
  assert.deepEqual(saved.character.appearance, { hair: 'short', hairColor: 'black', skin: 's4', eyes: 'green', outfit: 'blue' });
  await page.waitForTimeout(300); await shot(page, '03_game_android');
  // edit later, cancel keeps old, save applies new
  await page.click('.dock [data-panel=wardrobe]');
  assert.match(await page.textContent('#cr-mode'), /Dressing/);
  await page.click('#cr-hair [data-v=pony]'); await page.click('#cr-cancel');
  assert.equal(await G(page, G => G.state.character.appearance.hair), 'short');
  await page.click('#hud-avatar'); await page.fill('#cr-name', 'ริเวอร์'); await page.click('#cr-hair [data-v=pony]'); await page.click('#cr-confirm');
  assert.equal(await G(page, G => G.state.character.name + '/' + G.state.character.appearance.hair), 'ริเวอร์/pony');
  assert.equal(await page.textContent('#hud-name'), 'ริเวอร์');
  assert.deepEqual(errors, []); await ctx.close();
});

test('PC: WASD walks in 4 directions with matching facing; walls block movement', async () => {
  const { ctx, page, errors } = await open('pc');
  const start = await G(page, G => ({ ...G.state.player }));
  for (const [key, facing, axis, sign] of [['d', 'right', 'x', 1], ['s', 'down', 'y', 1], ['a', 'left', 'x', -1], ['w', 'up', 'y', -1]]) {
    const before = await G(page, G => ({ x: G.state.player.x, y: G.state.player.y }));
    await page.keyboard.down(key); await page.waitForTimeout(350);
    assert.equal(await G(page, G => G.facing), facing);
    assert.equal(await G(page, G => G.walking), true);
    await page.keyboard.up(key); await page.waitForTimeout(60);
    const after = await G(page, G => ({ x: G.state.player.x, y: G.state.player.y }));
    assert.ok((after[axis] - before[axis]) * sign > 8, `${key} moves ${axis}`);
  }
  await shot(page, '04_game_pc');
  // collision: stand below the leader house (tiles 38-42 x 44-46) and push up for 1.5s
  await G(page, G => { G.state.player.x = 40.5 * 16; G.state.player.y = 49.5 * 16; G.npcs.forEach(n => { n.x = 20 * 16; n.y = 52 * 16; }); });
  await page.keyboard.down('w'); await page.waitForTimeout(1500); await page.keyboard.up('w');
  const p = await G(page, G => ({ x: G.state.player.x, y: G.state.player.y, blocked: !G.__walk }));
  const tile = await page.evaluate(([x, y]) => import('/src/ui/game.js').then(m => m.walkable(Math.floor(x / 16), Math.floor((y - 3) / 16))), [p.x, p.y]);
  assert.equal(tile, true, 'player never stands inside a blocked tile');
  assert.ok(p.y > 46 * 16, 'stopped by the house');
  void start; assert.deepEqual(errors, []); await ctx.close();
});

test('NPCs follow schedules and never stand inside buildings', async () => {
  const { ctx, page, errors } = await open('pc');
  await G(page, G => { G.state.tickMultiplier = 20; });
  const bad = [];
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => import('/src/ui/game.js').then(m => m.G.npcs.filter(n => !m.walkable(Math.floor(n.x / 16), Math.floor(n.y / 16))).map(n => n.def.name)));
    bad.push(...r);
  }
  const acts = await G(page, G => [...new Set(G.npcs.map(n => n.plan?.activity))]);
  assert.ok(acts.length >= 2, 'NPCs do different things: ' + acts);
  assert.deepEqual(bad, []);
  assert.ok(await G(page, G => G.state.gameTime) > 6.5 * 3600, 'time advanced');
  assert.deepEqual(errors, []); await ctx.close();
});

test('zoom: buttons, mouse wheel and touch pinch; camera drag and overview', async () => {
  const { ctx, page, errors } = await open('pc');
  const z0 = await G(page, G => G.cam.zoom);
  await page.click('#zoom-in'); assert.ok(await G(page, G => G.cam.zoom) > z0, 'zoom-in button goes one crisp step closer');
  await page.click('#zoom-out'); await page.click('#zoom-out'); assert.ok(await G(page, G => G.cam.zoom) < z0, 'zoom-out button goes one crisp step out');
  await page.mouse.move(600, 400); await page.mouse.wheel(0, -400); await page.waitForTimeout(100);
  const zw = await G(page, G => G.cam.zoom); assert.ok(zw > 0);
  await page.keyboard.press('='); assert.ok(await G(page, G => G.cam.zoom) > zw, 'keyboard + zooms in');
  // drag pans the camera and detaches it from the player
  const c0 = await G(page, G => ({ x: G.cam.x, y: G.cam.y }));
  await page.mouse.move(700, 400); await page.mouse.down(); await page.mouse.move(500, 300, { steps: 6 }); await page.mouse.up();
  const c1 = await G(page, G => ({ x: G.cam.x, y: G.cam.y, f: G.cam.follow }));
  assert.ok(c1.x > c0.x && c1.f === false, `drag pans right ${JSON.stringify([c0, c1])}`);
  await page.click('#overview'); await page.waitForTimeout(100);
  assert.equal(await G(page, G => G.cam.overview), true);
  await shot(page, '05_overview_pc');
  await page.click('#overview');
  assert.equal(await G(page, G => G.cam.follow), true);
  await ctx.close();
  // touch pinch via CDP
  const t = await open('android');
  const cdp = await t.ctx.newCDPSession(t.page);
  const zBefore = await G(t.page, G => G.cam.zoom);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p[0], y: p[1], id: i })) });
  await touch('touchStart', [[380, 200], [460, 200]]);
  for (let d = 40; d <= 140; d += 20) await touch('touchMove', [[420 - d, 200], [420 + d, 200]]);
  await touch('touchEnd', []);
  await t.page.waitForTimeout(100);
  assert.ok(await G(t.page, G => G.cam.zoom) > zBefore, 'pinch zooms in');
  // joystick moves the player
  const p0 = await G(t.page, G => G.state.player.x);
  const box = await t.page.locator('#stick').boundingBox();
  await touch('touchStart', [[box.x + box.width / 2, box.y + box.height / 2]]);
  await touch('touchMove', [[box.x + box.width - 4, box.y + box.height / 2]]);
  await t.page.waitForTimeout(500);
  await touch('touchEnd', []);
  assert.ok(await G(t.page, G => G.state.player.x) > p0 + 10, 'joystick walks right');
  assert.deepEqual([...errors, ...t.errors], []); await t.ctx.close();
});

test('every dock/HUD menu opens with real content and closes; time pauses while reading', async () => {
  const { ctx, page, errors } = await open('android');
  for (const id of ['inventory', 'jobs', 'build', 'market', 'craft', 'quests', 'civil', 'leader', 'shop']) {
    await page.click(`.dock [data-panel=${id}]`);
    assert.ok(await page.isVisible('#panel'), id);
    const t0 = await G(page, G => G.state.gameTime); await page.waitForTimeout(300);
    assert.equal(await G(page, G => G.state.gameTime), t0, `${id}: time paused`);
    assert.ok((await page.textContent('#panel-body')).length > 80, `${id} has content`);
    await shot(page, `06_menu_${id}`);
    await page.click('#panel-close'); assert.ok(await page.isHidden('#panel'));
  }
  await page.click('#settings-btn'); assert.match(await page.textContent('#panel-title'), /ตั้งค่า/); await shot(page, '06_menu_settings'); await page.click('#panel-close');
  await page.click('#menu-btn'); assert.match(await page.textContent('#panel-title'), /เมนู/); await page.click('#panel-close');
  await page.click('#quest-pin'); assert.ok(await page.isVisible('#panel')); await page.click('#panel-close');
  assert.deepEqual(errors, []); await ctx.close();
});

test('market + inventory buttons change state and refuse when not affordable', async () => {
  const { ctx, page, errors } = await open('pc');
  await page.keyboard.press('m');
  const c0 = await G(page, G => G.state.player.coins), s0 = await G(page, G => G.state.market.seed);
  await page.click('[data-act=buy][data-id=seed]');
  assert.ok(await G(page, G => G.state.player.coins) < c0); assert.equal(await G(page, G => G.state.market.seed), s0 - 1);
  await G(page, G => { G.state.player.coins = 0; G.refreshPanel(); });
  assert.equal(await page.isDisabled('[data-act=buy][data-id=food]'), true);
  await page.keyboard.press('i');
  await G(page, G => { G.state.player.stamina = 40; G.refreshPanel(); });
  const f0 = await G(page, G => G.state.inventory.food);
  await page.click('[data-act=eat]');
  assert.equal(await G(page, G => G.state.inventory.food), f0 - 1);
  assert.ok(await G(page, G => G.state.player.stamina) >= 60, 'a meal gives +20 (v0.26 daily energy)');
  assert.ok(await G(page, G => G.state.player.coins) >= 0);
  assert.deepEqual(errors, []); await ctx.close();
});

test('gather resources, accept a delivery job, walk there and complete it', async () => {
  const { ctx, page, errors } = await open('pc');
  // stand just below the nearest tree and chop it down with the starting axe (3 hits), then dig the stump
  const tree = await page.evaluate(() => import('/src/world.js').then(W => { const st = window.__V2N__.G.state; const t = W.TREES.filter(n => n.kind !== 3 && W.nodeStatus(st, n) !== 'gone').map(n => [n, Math.hypot(n.x - 40, n.y - 50)]).sort((a, b) => a[1] - b[1])[0][0]; return t; }));
  await G(page, (G, t) => { G.state.player.x = (t.x + .5) * 16; G.state.player.y = (t.y + 2) * 16 - 2; G.facing = 'up'; G.npcs.forEach(n => { n.x = 20 * 16; n.y = 52 * 16; }); }, tree);
  await page.waitForTimeout(120);
  for (let i = 0; i < 3; i++) { await page.keyboard.press('e'); await page.waitForTimeout(60); }
  assert.equal(await G(page, G => G.state.player.wood), 4, 'tree felled: 1+1+2 wood');
  await page.keyboard.press('e');
  assert.equal(await G(page, (G, t) => G.state.world.n[t.id], tree), 'x', 'stump dug out');
  await page.keyboard.press('j');
  await page.click('[data-act=acceptJob][data-id=delivery]');
  assert.equal(await G(page, G => G.state.job?.id), 'delivery');
  await page.click('#panel-close');
  await G(page, G => { G.state.player.x = 45.5 * 16; G.state.player.y = 51.6 * 16; });
  await page.waitForTimeout(120);
  const c0 = await G(page, G => G.state.player.coins);
  await page.click('#action-btn');
  assert.equal(await G(page, G => G.state.player.coins), c0 + 11, '12 wage - 10% income tax');
  assert.equal(await G(page, G => G.state.job), null);
  assert.deepEqual(errors, []); await ctx.close();
});

test('construction flow: menu -> preview (red/green) -> cancel -> confirm -> progress -> done -> upgrade', async () => {
  const { ctx, page, errors } = await open('pc');
  await G(page, G => { Object.assign(G.state.player, { coins: 500, wood: 60, stone: 60 }); G.state.player.x = 44 * 16; G.state.player.y = 54 * 16; });
  await page.keyboard.press('b');
  await page.click('[data-act=placeMode][data-id=bench]');
  assert.ok(await page.isVisible('#buildbar'));
  // invalid: over the public plot -> red & disabled
  await G(page, G => { const m = window.__V2N__; }, null);
  await page.evaluate(() => import('/src/ui/game.js').then(m => m.setBuildPreview(53, 44)));
  assert.equal(await page.isDisabled('#bb-confirm'), true);
  assert.match(await page.textContent('#bb-status'), /✕/);
  await shot(page, '07_build_invalid');
  // cancel: nothing charged
  await page.click('#bb-cancel');
  assert.equal(await G(page, G => G.state.player.coins), 500);
  await page.keyboard.press('b'); await page.click('[data-act=placeMode][data-id=bench]');
  const spot = await page.evaluate(() => Promise.all([import('/src/construction.js'), import('/src/ui/game.js')]).then(([C, g]) => { const P = g.G.state.player; for (let y = 30; y < 70; y++) for (let x = 20; x < 60; x++) if (C.canPlace(g.G.state, 'bench', x, y, (a, b) => !g.walkable(a, b)).ok && Math.hypot(x + 1 - P.x / 16, y + .5 - P.y / 16) > 3) return [x, y]; }));
  await page.evaluate(([x, y]) => import('/src/ui/game.js').then(m => m.setBuildPreview(x, y)), spot);
  assert.equal(await page.isDisabled('#bb-confirm'), false);
  await shot(page, '08_build_valid');
  // keyboard nudges the ghost
  await page.keyboard.press('ArrowRight'); assert.equal(await G(page, G => G.build.tx), spot[0] + 1);
  await page.keyboard.press('ArrowLeft');
  await page.click('#bb-confirm');
  const g = await G(page, G => ({ ...G.state.placed[0], coins: G.state.player.coins }));
  assert.equal(g.status, 'building'); assert.equal(g.coins, 496);
  await G(page, G => { G.state.tickMultiplier = 20; });
  await page.waitForTimeout(400); await shot(page, '09_build_progress');
  await page.waitForFunction(() => window.__V2N__.G.state.placed[0].status === 'done', null, { timeout: 15000 });
  await G(page, G => { G.state.tickMultiplier = 1; });
  await page.evaluate(() => window.__V2N__.G.openPanel('structure', window.__V2N__.G.state.placed[0].uid));
  await page.click('[data-act=upgrade]');
  assert.equal(await G(page, G => G.state.placed[0].upgradingTo), 2);
  // public project with timed construction and help action
  await page.keyboard.press('Escape');
  await page.evaluate(() => import('/src/world.js').then(W => { const G = window.__V2N__.G; for (const n of W.plotObstacles(G.state, 'home')) W.setNode(G.state, n.id, 'x'); }));
  await page.keyboard.press('b');
  await page.click('[data-act=startPublic][data-id=home]');
  assert.equal(await G(page, G => G.state.publicSites.home.status), 'building');
  const w0 = await G(page, G => G.state.publicSites.home.work);
  await page.click('[data-act=help][data-id=home]');
  assert.ok(await G(page, G => G.state.publicSites.home.work) >= w0 + 45);
  assert.deepEqual(errors, []); await ctx.close();
});

test('exams: civil service and leadership are separate tracks; election uses qualifications', async () => {
  const { ctx, page, errors } = await open('pc');
  await G(page, G => { G.state.player.knowledge = 3; G.state.stats.deliveries = 1; });
  await page.keyboard.press('r');
  await page.evaluate(() => { document.querySelectorAll('#civil-form .quiz').forEach((q, i) => q.querySelectorAll('input')[[0, 1, 0][i]].click()); });
  await page.click('#civil-form button[type=submit]');
  assert.equal(await G(page, G => G.state.civilService.examPassed), true);
  assert.equal(await G(page, G => G.state.examPassed), false, 'civil exam != leadership');
  assert.equal(await page.isDisabled('[data-act=civilShift]'), true, 'the acting leader cannot take civil-service shifts');
  assert.equal(await G(page, G => G.state.civilService.shifts), 0);
  await page.keyboard.press('Escape'); await page.keyboard.press('l');
  assert.match(await page.textContent('#panel-body'), /ผู้นำรักษาการ/, 'the founder is acting leader from day 1');
  assert.match(await page.textContent('#panel-body'), /ยังลงสมัครไม่ได้/);
  await page.evaluate(() => { document.querySelectorAll('#exam-form .quiz').forEach((q, i) => q.querySelectorAll('input')[[1, 0, 1][i]].click()); });
  await page.click('#exam-form button[type=submit]');
  assert.equal(await G(page, G => G.state.examPassed), true);
  assert.match(await page.textContent('#panel-body'), /ต้องลาออก/, 'a civil servant must resign before running');
  await page.keyboard.press('Escape'); await page.keyboard.press('r'); await page.click('[data-act=resign]');
  await page.keyboard.press('Escape'); await page.keyboard.press('l');
  assert.match(await page.textContent('#panel-body'), /ลงสมัครได้/);
  // a poorly run village loses the end-of-term election; popularity comes only from how villagers live
  const lost = await page.evaluate(() => import('/src/leadership.js').then(L => { const s = window.__V2N__.G.state; s.leadership.popularity = 10; return L.runTermElection(s); }));
  assert.equal(lost.won, false);
  assert.equal(await G(page, G => G.state.leadership.isLeader), false);
  const won = await page.evaluate(() => import('/src/leadership.js').then(L => { const s = window.__V2N__.G.state; s.leadership.popularity = 95; return L.runTermElection(s); }));
  assert.equal(won.won, true, 'can win back the seat in the next term');
  await G(page, G => G.refreshPanel());
  assert.match(await page.textContent('#panel-body'), /ผลเลือกตั้ง/);
  assert.match(await page.textContent('#panel-body'), /นายกรัฐมนตรี/);
  await shot(page, '10_leader_panel');
  assert.deepEqual(errors, []); await ctx.close();
});

test('OBT shop never takes money; try-on preview does not save locked outfits', async () => {
  const { ctx, page, errors } = await open('pc');
  await page.click('.dock [data-panel=shop]');
  const c0 = await G(page, G => G.state.player.coins);
  await page.click('[data-act=buySku][data-id=supporter_founder]');
  assert.match(await page.textContent('#toast'), /ยังไม่เปิดขาย/);
  assert.equal(await G(page, G => G.state.player.coins), c0);
  await page.click('[data-act=tryOutfit][data-id=sailor]');
  assert.ok(await page.isVisible('#creator'));
  await page.click('#cr-confirm');
  assert.notEqual(await G(page, G => G.state.character.appearance.outfit), 'sailor');
  assert.equal(await page.locator('[data-act=mockGrant]').count(), 0, 'dev grant hidden without ?dev=1');
  assert.deepEqual(errors, []); await ctx.close();
});

test('graphics: Low/Medium/High change the real render resolution; FPS cap is respected', async () => {
  const { ctx, page, errors } = await open('pcHD');
  await page.click('#settings-btn');
  const res = {};
  for (const q of ['low', 'medium', 'high']) { await page.click(`[data-act=setQuality][data-id=${q}]`); res[q] = await page.evaluate(() => document.querySelector('#game').width); }
  assert.ok(res.low < res.medium && res.medium < res.high, JSON.stringify(res));
  await page.click('[data-act=setFps][data-id="30"]');
  await page.click('[data-act=toggleFps]'); await page.click('#panel-close');
  await page.waitForTimeout(2300);
  const fps30 = await G(page, G => G.measuredFps);
  assert.ok(fps30 <= 34 && fps30 >= 15, 'fps capped near 30: ' + fps30);
  assert.ok(await page.isVisible('#fps-counter'));
  await page.click('#settings-btn'); await page.click('[data-act=setFps][data-id="120"]'); await page.click('#panel-close');
  await page.waitForTimeout(2300);
  const fps120 = await G(page, G => G.measuredFps);
  assert.ok(fps120 > fps30, `uncapped faster than 30 (${fps120})`);
  await G(page, G => { G.state.gameTime = 21.5 * 3600; });
  await page.waitForTimeout(300); await shot(page, '11_night_high_pcHD');
  const prefs = JSON.parse(await page.evaluate(() => localStorage.getItem('v2n-visual-settings-v1')));
  assert.equal(prefs.fps, 120); assert.equal(prefs.quality, 'high'); assert.equal(prefs.showFps, true);
  assert.deepEqual(errors, []); await ctx.close();
});

test('save -> reload restores progress; v0.5 save migrates; v0.7 character imports', async () => {
  const { ctx, page, errors } = await open('pc');
  await G(page, G => { G.state.player.coins = 4321; G.state.player.x = 40 * 16; });
  await page.click('#menu-btn'); await page.click('[data-act=save]');
  await page.reload(); await page.waitForFunction(() => window.__V2N__);
  assert.equal(await G(page, G => G.state.player.coins), 4321);
  assert.ok(await page.isHidden('#creator'), 'character remembered');
  await ctx.close();
  const old = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/v05_save.json'), 'utf8'));
  const m = await open('pc', { storage: { 'v2n-prototype-v1': JSON.stringify(old), 'v2n-inline-06': JSON.stringify({ character: { name: 'มะปราง', hair: 'bob', outfit: 'green', lang: 'th' } }) }, name: null });
  assert.ok(await m.page.isHidden('#creator'), 'v0.7 character imported, no re-creation');
  assert.equal(await G(m.page, G => G.state.character.name), 'มะปราง');
  assert.equal(await G(m.page, G => G.state.player.coins), old.player.coins + 6, 'coins kept + old garden refunded');
  assert.equal(await G(m.page, G => G.state.placed.length), 0, 'old painted-map building refunded and moved to the forest');
  assert.ok(await m.page.evaluate(() => !!localStorage.getItem('v2n-prototype-v1-backup-schema1')));
  assert.deepEqual([...errors, ...m.errors], []); await m.ctx.close();
});

test('layout fits Android/iPhone landscape and PC without overflow; standalone play.html works', async () => {
  for (const dev of ['android', 'iphone', 'pc', 'pcHD']) {
    const { ctx, page, errors } = await open(dev);
    const vp = DEVICES[dev].viewport;
    for (const sel of ['.hud-card', '.hud-tools', '.dock', '#action-btn', '#quest-pin']) {
      const b = await page.locator(sel).boundingBox();
      assert.ok(b && b.x >= -1 && b.y >= -1 && b.x + b.width <= vp.width + 1 && b.y + b.height <= vp.height + 1, `${dev} ${sel} inside viewport ${JSON.stringify(b)}`);
    }
    const hud = await page.locator('.hud-card').boundingBox(), tools = await page.locator('.hud-tools').boundingBox(), top = await page.locator('.hud-top').boundingBox();
    assert.ok(hud.x + hud.width <= top.x + 2 && top.x + top.width <= tools.x + 2, `${dev}: top HUD rows do not overlap`);
    await shot(page, `12_layout_${dev}`);
    assert.deepEqual(errors, []); await ctx.close();
  }
  const sa = await open('android', { url: '/play.html?test=1' });
  assert.ok(await G(sa.page, G => G.npcs.length) >= 4, 'founder starts with 4 NPC helpers');
  await shot(sa.page, '13_standalone_play_html');
  assert.deepEqual(sa.errors, []); await sa.ctx.close();
});

test('forest start: dense trees, see-through canopy over the player, NPC helpers clear the forest', async () => {
  const { ctx, page, errors } = await open('android');
  assert.ok(await page.evaluate(() => import('/src/world.js').then(W => W.TREES.length)) > 500);
  // stand behind a tree: the renderer draws that tree translucent
  await page.evaluate(() => import('/src/world.js').then(W => { const G = window.__V2N__.G; const t = W.TREES.find(n => Math.hypot(n.x - 40, n.y - 50) > 9 && !W.blocked(n.x, n.y - 1)); G.state.player.x = (t.x + .5) * 16; G.state.player.y = (t.y) * 16 - 4; }));
  await page.waitForTimeout(300);
  await shot(page, '14_tree_see_through');
  await G(page, G => { G.state.gameTime = 7.5 * 3600; G.state.tickMultiplier = 20; G.state.player.x = 42.5 * 16; G.state.player.y = 53.5 * 16; });
  await page.waitForFunction(() => (window.__V2N__.G.state.stats.npcTreesFelled || 0) >= 1, null, { timeout: 40000 });
  await G(page, G => { G.state.tickMultiplier = 1; });
  await shot(page, '15_npc_cleared_forest');
  assert.deepEqual(errors, []); await ctx.close();
});

test('pixel-perfect zoom in the browser: zoom × resolution is always a whole number', async () => {
  const { ctx, page, errors } = await open('android');
  for (const f of [1.13, 1.37, 0.71, 1.9]) {
    await page.evaluate(f => import('/src/ui/input.js').then(m => m.zoomBy(f)), f);
    const r = await G(page, G => G.cam.zoom * G.k);
    assert.ok(Math.abs(r - Math.round(r)) < 1e-6, 'crisp scale ' + r);
  }
  await shot(page, '16_zoomed_crisp');
  assert.deepEqual(errors, []); await ctx.close();
});

test('start screen: one tap = play; portrait phone gets a rotated landscape game with working taps', async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => { errors.push(e.message); allErrors.push('start: ' + e.message); });
  await page.goto(base + '/index.html?test=1&start=1');
  await page.waitForSelector('#ss-play', { state: 'visible' });
  await shot(page, '17_start_screen');
  await page.tap('#ss-play'); await page.waitForTimeout(300);
  assert.equal(await page.isVisible('#start-screen'), false);
  assert.ok(await page.evaluate(() => document.body.classList.contains('force-land')), 'CSS landscape rotation on an upright phone');
  const size = await G(page, G => [G.cssW, G.cssH]);
  assert.ok(size[0] > size[1], 'game area is landscape: ' + size);
  await page.fill('#cr-name', 'แนวนอน'); await page.tap('#cr-confirm'); await page.waitForTimeout(150);
  await page.tap('#path-choice [data-path=founder]'); await page.waitForTimeout(150);
  // a tap on the rotated screen must land where it appears: tap the joystick area (bottom-left of the landscape game)
  const box = await page.locator('#stick').boundingBox();
  const before = await G(page, G => ({ x: G.state.player.x, y: G.state.player.y }));
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.95, { steps: 3 }); // screen-down = landscape-right
  await page.waitForTimeout(500); await page.mouse.up();
  const after = await G(page, G => ({ x: G.state.player.x, y: G.state.player.y }));
  assert.ok(after.x - before.x > 8 && Math.abs(after.y - before.y) < 8, `stick right moved right: ${JSON.stringify([before, after])}`);
  await shot(page, '18_portrait_forced_landscape');
  assert.deepEqual(errors, []); await ctx.close();
});

test('village plan: build every slot of tier 1, the leader presses ยกระดับ, the plan and title grow', async () => {
  const { ctx, page, errors } = await open('pc');
  const ok = await page.evaluate(async () => {
    const [C, W, V, N, H] = await Promise.all([import('/src/construction.js'), import('/src/world.js'), import('/src/villageLayout.js'), import('/src/npcs.js'), import('/src/housing.js')]);
    const G = window.__V2N__.G, s = G.state; s.player.coins = 999; s.player.wood = 300; s.player.stone = 300; s.player.knowledge = 15; // the village head must have studied (v0.26)
    for (const sl of V.TIERS[0].slots) {
      if (sl.kind === 'public') { for (const n of W.plotObstacles(s, sl.id)) W.setNode(s, n.id, 'x'); C.startPublic(s, sl.id); }
      else H.buildHouseFor(s, sl.id, 'npc_' + sl.id);
    }
    C.tickConstruction(s, 99999);
    while (N.population(s) < 12) { s.day++; N.settlerArrivals(s); }
    return V.nextTierCheck(s, N.population(s)).ok;
  });
  assert.equal(ok, true);
  await page.keyboard.press('b'); await page.waitForTimeout(200);
  assert.match(await page.textContent('#panel-body'), /ผังค่ายบุกเบิก/);
  await shot(page, '23_village_plan_panel');
  await page.click('[data-act=upgradeVillage]'); await page.waitForTimeout(200);
  assert.equal(await G(page, G => G.state.town.stage), 1);
  assert.match(await page.textContent('#hud-role'), /ผู้ใหญ่บ้าน/);
  await page.keyboard.press('Escape');
  await G(page, G => { G.cam.follow = false; G.cam.zoomTarget = 1; G.applyZoom(); G.cam.x = 41 * 16; G.cam.y = 49 * 16; });
  await page.waitForTimeout(500); await shot(page, '24_village_tier2');
  assert.deepEqual(errors, []); await ctx.close();
});

test('no JavaScript errors were raised in any scenario', () => { assert.deepEqual(allErrors, []); });
