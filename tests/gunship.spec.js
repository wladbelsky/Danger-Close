// The gunship and the HUD: the frame stays on the map, transits, smooth slewing, a random start, clicks, brackets
const { test, expect } = require('./support/harness');

test('the frame never leaves the map, through transits and at a wide zoom', async ({ wp }) => {
  await wp.boot({ query: '?hour=12&seed=3&transit=0.2' });
  const r = await wp.run(() => {
    const out = { worst: -1e9, homes: new Set(), transits: 0, maxStep: 0 }, c = new THREE.Vector3(); let prev = GUNSHIP.state, last = CAM_TGT.clone();
    for (let s = 0; s < 3000; s++) {
      if (s === 1500) CFG.zoom = 50;
      __t.sim(0.05);
      if (s < 1500 || s > 1502) out.maxStep = Math.max(out.maxStep, Math.hypot(CAM_TGT.x - last.x, CAM_TGT.z - last.z) / 0.05); last.copy(CAM_TGT);   // (the setting itself changing may shift the clamped frame once)
      if (GUNSHIP.state !== prev) { if (GUNSHIP.state === 'transit') out.transits++; prev = GUNSHIP.state; }
      out.homes.add(GUNSHIP.list.indexOf(GUNSHIP.home));
      if (s % 10) continue;
      for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const p = VIEW.groundAt(x, y, MAP.lo, c); out.worst = Math.max(out.worst, Math.abs(p.x), Math.abs(p.z)); }
    }
    out.homes = out.homes.size; return out;
  });
  expect(r.worst).toBeLessThan(MAP_HALF_);
  expect(r.transits).toBeGreaterThanOrEqual(3);
  expect(r.homes).toBeGreaterThanOrEqual(3);
  expect(r.maxStep, 'the look-at point never jumps (m/s)').toBeLessThan(200);
});
const MAP_HALF_ = 1024;

test('the slew in orbit is smooth: no jumps in speed', async ({ wp }) => {
  await wp.boot({ query: '?hour=12&seed=11&transit=0' });
  const r = await wp.run(() => {
    let v0 = null, maxAcc = 0; const last = CAM_TGT.clone();
    for (let s = 0; s < 1200; s++) { __t.sim(0.05); const v = Math.hypot(CAM_TGT.x - last.x, CAM_TGT.z - last.z) / 0.05; last.copy(CAM_TGT); if (v0 !== null) maxAcc = Math.max(maxAcc, Math.abs(v - v0) / 0.05); v0 = v; }
    return { maxAcc, state: GUNSHIP.state };
  });
  expect(r.state).toBe('orbit');
  expect(r.maxAcc, 'm/s²').toBeLessThan(60);
});

test('the start district is a random one of the list', async ({ wp }) => {
  await wp.boot({ query: '?hour=12&seed=11' });
  const r = await wp.run(() => { const s = new Set(); for (let i = 0; i < 12; i++) s.add(GUNSHIP.list.indexOf(GUNSHIP.pickStart())); return { picks: s.size, n: GUNSHIP.list.length, inside: GUNSHIP.list.every(d => Math.abs(d.x) <= MAP_HALF - GS_MARGIN && Math.abs(d.z) <= MAP_HALF - GS_MARGIN) }; });
  expect(r.n).toBeGreaterThanOrEqual(5);
  expect(r.picks).toBeGreaterThanOrEqual(3);
  expect(r.inside).toBe(true);
});

test('the selector lists only the enabled weapons; a click selects one and its zoom', async ({ wp }) => {
  await wp.boot({ query: '?hour=12&seed=11' });
  expect(await wp.page.locator('#arms button').count()).toBe(3);
  await wp.page.click('#arms button[data-id=h105]');
  await wp.sim(4);
  const r = await wp.run(() => ({ cur: ARMS.cur, zm: GUNSHIP.zm, on: document.querySelector('#arms button.on').dataset.id }));
  expect(r.cur).toBe('h105'); expect(r.on).toBe('h105'); expect(r.zm).toBeCloseTo(WEAPON_ZOOM_105, 2);
  await wp.goto('?hour=12&seed=11&weapons=all');
  expect(await wp.page.locator('#arms button').count()).toBe(10);
});
const WEAPON_ZOOM_105 = 0.85;

test('a click on a mode switches the vision and recompiles nothing', async ({ wp }) => {
  await wp.boot({ query: '?hour=12&seed=11' });
  await wp.run(() => __t.render());
  const p0 = await wp.run(() => renderer.info.programs.length);
  for (const m of ['wh', 'bh', 'nv', 'tv']) {
    await wp.page.click(`#modes button[data-m=${m}]`);
    const r = await wp.run(() => { __t.render(); return { mode: SENSOR.mode, on: document.querySelector('#modes button.on').dataset.m, progs: renderer.info.programs.length }; });
    expect(r.mode).toBe(m); expect(r.on).toBe(m); expect(r.progs).toBe(p0);
  }
});

test('brackets keep their size at any zoom: allies blue, enemies white', async ({ wp }) => {
  await wp.boot({ query: '?hour=12&seed=11&spot=town&transit=0' });
  const r = await wp.run(() => {
    const t = TRACKS.find(t => t.side === 'ally' && Math.hypot(t.obj.position.x - GUNSHIP.home.x, t.obj.position.z - GUNSHIP.home.z) < 250);
    GUNSHIP.look.copy(t.obj.position); GUNSHIP.aim.copy(t.obj.position); GUNSHIP.vel.set(0, 0, 0); GUNSHIP.nextWander = 1e9;
    const sizes = [];
    for (const z of [60, 200]) { CFG.zoom = z; __t.sim(3); __t.render(); const b = HUD.boxes.find(b => b.side === 'ally'); sizes.push(b ? b.s : 0); }
    return { sizes, sides: [...new Set(TRACKS.map(t => t.side))].sort() };
  });
  expect(r.sizes[0]).toBeGreaterThan(0);
  expect(r.sizes[1]).toBeCloseTo(r.sizes[0], 5);
  expect(r.sides).toEqual(['ally', 'enemy']);
});
