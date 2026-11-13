// The fight: nothing without music, arming after 5 s, arrivals and departures out of sight, the weapon table, the stand-down
const { test, expect } = require('./support/harness');
const enemies = () => UNITS.filter(u => u.side === 'enemy').length;

test('silence: no enemies, no base, nobody fires', async ({ wp }) => {
  await wp.boot({ query: '?hour=12&seed=11' });
  await wp.sim(90);
  const r = await wp.run(() => ({ en: UNITS.filter(u => u.side === 'enemy').length, base: !!BATTLE.base, shots: BATTLE.stat.shots, combat: AUD.combat, allies: UNITS.filter(u => u.side === 'ally').length }));
  expect(r).toMatchObject({ en: 0, base: false, shots: 0, combat: false });
  expect(r.allies).toBeGreaterThan(8);
});

test('music arms the fight after 5 s; enemies come and go out of sight; the gunship fires by the table', async ({ wp }) => {
  await wp.boot({ query: '?hour=12&seed=11' });
  await wp.sim(3, { audio: true });
  expect(await wp.run(() => AUD.combat)).toBe(false);
  await wp.sim(3, { audio: true });
  const a = await wp.run(() => ({ combat: AUD.combat, base: !!BATTLE.base, parts: BATTLE.base ? BATTLE.base.parts.length : 0, state: GUNSHIP.state, en: UNITS.filter(u => u.side === 'enemy').length }));
  expect(a).toMatchObject({ combat: true, base: true, state: 'transit' });
  expect(a.en).toBeGreaterThan(15);
  // the allies are in the fight: vehicles and soldiers of theirs near the place the camera is on, most of the time
  // the camera never leaves enemies that are still in its frame (unless it waited for the allies in vain), and where it looks at enemies the allies are mostly there too
  const cam = await wp.run(() => {
    let left = 0, was = GUNSHIP.state, on = 0, backed = 0;
    for (let i = 0; i < 4800; i++) {
      __t.sim(0.05, { audio: true });
      const seen = UNITS.filter(u => u.side === 'enemy' && u.kind !== 'struct' && BATTLE.inFrame(u.pos));
      if (GUNSHIP.state === 'transit' && was === 'orbit' && seen.length && !(BATTLE.waitT && T >= BATTLE.waitT)) left++;
      was = GUNSHIP.state;
      if (i > 1200 && i % 20 === 0 && GUNSHIP.state === 'orbit' && seen.length) { on++; if (UNITS.some(u => u.side === 'ally' && Math.hypot(u.pos.x - CAM_TGT.x, u.pos.z - CAM_TGT.z) < 150)) backed++; }
    }
    return { left, on, backed };
  });
  console.log('camera: ' + JSON.stringify(cam));
  expect(cam.left, 'transits begun with enemies still in the frame').toBe(0);
  expect(cam.backed / Math.max(1, cam.on), 'the share of the time with enemy units in the frame when allies are within 150 m (it varies a lot from run to run)').toBeGreaterThan(0.15);
  const b = await wp.run(() => {
    const bad = BATTLE.log.filter(l => { const [w, k] = l.split(' '); return !WEAPON[w].hitSet.has(k) || !CFG.weapons.includes(w); });
    return { stat: BATTLE.stat, bad, log: BATTLE.log.length, wrecks: WRECKS.list.length, used: [...new Set(BATTLE.log.map(l => l.split(' ')[0]))].sort(), water: UNITS.filter(u => u.kind !== 'heli' && waterAt(u.pos.x, u.pos.z) === 1).length };
  });
  expect(b.bad).toEqual([]);
  expect(b.stat.shots).toBeGreaterThan(40);
  expect(b.log).toBeGreaterThan(20);
  expect(b.wrecks).toBeGreaterThan(0);
  expect(b.stat.seenIn, 'arrivals in the frame').toBe(0);
  expect(b.used.length, 'the auto-switching uses several weapons').toBeGreaterThan(1);
  expect(b.water).toBe(0);
  // the music stops: a hold, then the stand-down; the enemies leave and are taken away out of sight, the base too
  await wp.sim(3);
  expect(await wp.run(() => [AUD.combat, AUD.fighting])).toEqual([true, false]);
  const shots = await wp.run(() => BATTLE.stat.shots);
  await wp.sim(6);
  expect(await wp.run(() => AUD.combat)).toBe(false);
  const u = await wp.until(() => !UNITS.some(u => u.side === 'enemy') && !BATTLE.base && !BATTLE.ruins.length, 400);
  const c = await wp.run(() => ({ stat: BATTLE.stat, en: UNITS.filter(u => u.side === 'enemy').length, tracks: TRACKS.filter(t => t.side === 'enemy').length }));
  expect(u.done, 'no enemies and no base left').toBe(true);
  expect(c.stat.shots).toBe(shots);
  expect(c.stat.seenOut, 'departures in the frame').toBe(0);
  expect(c.tracks).toBe(0);
});

test('every weapon alone fires only at what its table allows', async ({ wp }) => {
  test.setTimeout(600000);
  const out = {};
  for (const id of ['g25', 'g30', 'h105', 'b40', 'hf', 'apk', 'gbu', 'aim', 'las', 'rail']) {
    const q = `?hour=12&seed=11&weapons=${id}&auto=0`;
    if (!Object.keys(out).length) await wp.boot({ query: q }); else await wp.goto(q);
    await wp.sim(200, { audio: true });
    out[id] = await wp.run(() => ({ n: BATTLE.log.length, kinds: [...new Set(BATTLE.log.map(l => l.split(' ')[1]))], bad: BATTLE.log.filter(l => { const [w, k] = l.split(' '); return w !== ARMS.cur || !WEAPON[w].hitSet.has(k); }).length }));
  }
  console.log(JSON.stringify(out));
  for (const id in out) { expect(out[id].bad, id).toBe(0); if (id !== 'aim') expect(out[id].n, id + ' hit something').toBeGreaterThan(0); }
});

test('a fight leaks nothing: geometries and programs stay put over two fights', async ({ wp }) => {
  await wp.boot({ query: '?hour=12&seed=3' });
  const cycle = async () => { await wp.sim(120, { audio: true }); await wp.sim(12); await wp.until(() => !UNITS.some(u => u.side === 'enemy') && !BATTLE.base && !BATTLE.ruins.length && !WRECKS.list.length, 500); };
  await cycle(); await wp.run(() => __t.render());
  const count = () => { const set = new Set(); scene.traverse(o => { if (o.geometry) set.add(o.geometry.uuid); }); let protos = 0; for (const k in PROTO) PROTO[k].traverse(o => { if (o.geometry) protos++; }); return { g: renderer.info.memory.geometries, live: set.size, protos, p: renderer.info.programs.length, kids: scene.children.length }; };
  const a = await wp.run(count);
  await cycle(); await wp.run(() => __t.render());
  const b = await wp.run(count);
  expect(b.live, 'geometries in the scene').toBeLessThanOrEqual(a.live + 2); expect(b.p, 'shader programs (a shadow-pass variant may still turn up once)').toBeLessThanOrEqual(a.p + 1); expect(b.kids).toBeLessThanOrEqual(a.kids + 6);
});

test('at the map edge, where the frame cannot centre the target, the gun still fires at it', async ({ wp }) => {
  await wp.boot({ query: '?hour=11&seed=3&transit=0&weapons=h105&auto=0' });
  const r = await wp.run(() => {
    const p = new THREE.Vector3(MAP_HALF - 25, 0, 0); p.y = groundH(p.x, p.z);
    GUNSHIP.nextWander = 1e9; GUNSHIP.track(p); GUNSHIP.aimS.copy(GUNSHIP.aim); GUNSHIP.look.copy(GUNSHIP.aim); GUNSHIP.vel.set(0, 0, 0); __t.sim(0.1);
    const u = { pos: GUNSHIP.look.clone() }, n = VIEW.ndc(u.pos);
    return { shifted: Math.hypot(GUNSHIP.look.x - CAM_TGT.x, GUNSHIP.look.z - CAM_TGT.z), centred: Math.hypot(n.x * camera.aspect, n.y) < RET_ON, aim: BATTLE.onAim(u), far: BATTLE.onAim({ pos: new THREE.Vector3(GUNSHIP.look.x - 40, GUNSHIP.look.y, GUNSHIP.look.z) }) };
  });
  expect(r.shifted, 'the frame stops at the edge').toBeGreaterThan(3);
  expect(r.centred).toBe(false); expect(r.aim, 'on the point the sensor is turned to').toBe(true); expect(r.far).toBe(false);
});
