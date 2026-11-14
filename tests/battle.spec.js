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

test('a weapon picked by hand gives way to the auto-switching once nothing it may hit is left in the sector', async ({ wp }) => {
  await wp.boot({ query: '?hour=12&seed=11&weather=clear&aa=0&weapons=g25,g30,h105,aim' });
  const r = await wp.run(() => {
    __t.sim(5.5, { audio: true }); for (let i = 0; i < 1200 && (GUNSHIP.state === 'transit' || !BATTLE.base); i++) __t.sim(0.05, { audio: true });
    for (const u of UNITS) if (u.kind === 'heli' && u.side === 'enemy') u.pos.x += 5000;   // (no enemy helicopter anywhere near)
    BATTLE.nextHeli = 1e9;
    ARMS.select('aim'); BATTLE.manualUntil = T + 30; BATTLE.focus = null; BATTLE.seekT = 0; BATTLE.fTick = 0; const t0 = T;
    let took = null; for (let i = 0; i < 200 && took == null; i++) { __t.sim(0.05, { audio: true }); if (ARMS.cur !== 'aim') took = T - t0; }
    // and a weapon with targets round it is held
    const g = UNITS.some(u => u.alive && u.side === 'enemy' && WEAPON.h105.hitSet.has(u.kind) && Math.hypot(u.pos.x - GUNSHIP.look.x, u.pos.z - GUNSHIP.look.z) < 250);
    ARMS.select('h105'); BATTLE.manualUntil = T + 30; __t.sim(8, { audio: true });
    return { took, cur: ARMS.cur, targets: g, held: ARMS.cur === 'h105' };
  });
  expect(r.took, 'the auto-switching took over').not.toBeNull(); expect(r.took).toBeLessThan(6);
  if (r.targets) expect(r.held, 'held while it has targets').toBe(true);
});

test('helicopters make rocket runs: the salvo mostly on a beat, low but never into the ground', async ({ wp }) => {
  await wp.boot({ query: '?hour=12&seed=11' });
  const r = await wp.run(() => {
    let minAgl = 1e9; const sides = new Set(), s0 = BATTLE.stat.salvos;
    const salvo0 = BATTLE.salvo.bind(BATTLE); BATTLE.salvo = (h, t) => { if (h.run && h.run.ph === 'in') sides.add(h.side); salvo0(h, t); };
    for (let i = 0; i < 3600; i++) {
      __t.sim(0.05, { audio: true });
      for (const u of UNITS) if (u.kind === 'heli' && u.run && u.run.ph !== 'setup') minAgl = Math.min(minAgl, u.pos.y - groundH(u.pos.x, u.pos.z));
    }
    const { salvos, salvoBeat, salvoLate, splash } = BATTLE.stat;
    return { salvos: salvos - s0, salvoBeat, salvoLate, splash, minAgl, sides: [...sides] };
  });
  console.log(JSON.stringify(r));
  expect(r.salvos).toBeGreaterThan(2);
  expect(r.salvoBeat / r.salvos, 'salvos on a beat').toBeGreaterThan(0.6);
  expect(r.minAgl).toBeGreaterThan(12);
  expect(r.sides).toContain('ally');
  expect(r.splash).toBeGreaterThan(0);
  await wp.sim(12); await wp.sim(3);
  expect(await wp.run(() => BATTLE.rockets.length)).toBe(0);
});

test('APCs let their infantry out by the rear door near the enemy; a knocked-out one lets some bail out', async ({ wp }) => {
  await wp.boot({ query: '?hour=12&seed=11' });
  const r = await wp.run(() => {
    const sides = new Set(); let bad = 0;
    const out0 = BATTLE.dismount.bind(BATTLE); BATTLE.dismount = u => { const n = BATTLE.stat.dismounts; out0(u); if (BATTLE.stat.dismounts > n) sides.add(u.side); };
    for (let i = 0; i < 3600; i++) {
      __t.sim(0.05, { audio: true });
      if (i % 20 === 0) for (const sd of INF.list) { const p = sd.position, w = waterAt(p.x, p.z); if (w === 1 || w === 2 || (occAt(p.x, p.z) & (OCC_WATER | OCC_BUILD))) bad++; }
    }
    // an APC with its infantry aboard knocked out in the fight
    const v = UNITS.find(u => u.kind === 'apc' && u.alive && !u.retreat && BATTLE.cols.some(E => E.col === u.col)); let bailed = -1;
    if (v) { v.troops = 5; const b0 = BATTLE.stat.bailed; hurt(v, 99); __t.sim(1.5, { audio: true }); bailed = BATTLE.stat.bailed - b0; }
    const { dismounts, outOf, doorMax } = BATTLE.stat;
    return { dismounts, outOf, doorMax, bad, bailed, sides: [...sides] };
  });
  console.log(JSON.stringify(r));
  expect(r.dismounts).toBeGreaterThan(1);
  expect(r.outOf / r.dismounts, 'soldiers out of each APC').toBeGreaterThan(3.5);
  expect(r.doorMax, 'out by the door, not anywhere').toBeLessThan(3.6);
  expect(r.bad, 'soldiers in water or walls').toBe(0);
  expect(r.bailed).toBeGreaterThanOrEqual(1);
  expect(r.bailed).toBeLessThanOrEqual(3);
});

test('a blast hurts every enemy round it, not only the kinds its weapon is aimed at; never its own side', async ({ wp }) => {
  await wp.boot({ query: '?hour=12&seed=11' });
  await wp.sim(20, { audio: true });
  const r = await wp.run(() => {
    const e = UNITS.find(u => u.side === 'enemy' && u.kind === 'inf' && u.alive), a = UNITS.find(u => u.side === 'ally' && u.kind === 'inf' && u.alive);
    const log0 = BATTLE.log.length, sp0 = BATTLE.stat.splash;
    BATTLE.strike(new V3(e.pos.x + 3, e.pos.y, e.pos.z), GUN.hf.r, GUN.hf.dmg, WEAPON.hf, false);   // (a Hellfire is never fired at infantry)
    const hfLog = BATTLE.log.slice(log0).filter(l => l === 'hf inf').length;
    BATTLE.splashAt(a.pos, ROCKET.r, ROCKET.dmg, 'ally'); const ownSide = a.alive;
    BATTLE.splashAt(a.pos, ROCKET.r, ROCKET.dmg, 'enemy');
    return { eDead: !e.alive, splash: BATTLE.stat.splash - sp0, hfLog, ownSide, aDead: !a.alive };
  });
  expect(r).toEqual({ eDead: true, splash: expect.any(Number), hfLog: 0, ownSide: true, aDead: true });
  expect(r.splash).toBeGreaterThan(1);
});

test('the light guns barely scratch an APC; a map with one base site gets its base back on the ruin', async ({ wp }) => {
  await wp.boot({ query: '?hour=12&seed=11' });
  await wp.sim(5.5, { audio: true });
  await wp.until(() => BATTLE.base && GUNSHIP.state === 'orbit', 60, { audio: true });
  const r = await wp.run(() => {
    const rounds = (id, kind) => {   // (direct hits of one round each until it dies)
      const v = new Vehicle(kind, 'enemy'); v.pos.set(BATTLE.base.x + 40, 0, BATTLE.base.z); v.pos.y = groundH(v.pos.x, v.pos.z);
      let n = 0; while (v.alive && n < 500) { BATTLE.strike(v.pos, GUN[id].r, GUN[id].dmg, WEAPON[id], false); n++; } return n;
    };
    const inf = UNITS.find(u => u.side === 'enemy' && u.kind === 'inf' && u.alive); let infN = 0;
    if (inf) { BATTLE.strike(inf.pos, GUN.g25.r, GUN.g25.dmg, WEAPON.g25, false); infN = inf.alive ? 2 : 1; }
    const out = { sites: LAYOUT.sites.length, infN, g25car: rounds('g25', 'car'), g25apc: rounds('g25', 'apc'), g30car: rounds('g30', 'car'), g30apc: rounds('g30', 'apc') };
    const site = BATTLE.base.site; for (const p of BATTLE.base.parts) hurt(p, 1e3);
    __t.sim(0.1, { audio: true }); out.wrecked = !BATTLE.base;
    for (let i = 0; i < 2400 && !BATTLE.base; i++) __t.sim(0.05, { audio: true });
    out.back = !!BATTLE.base && BATTLE.base.site === site; out.after = Math.round(T - site.restUntil + 300);
    return out;
  });
  console.log(JSON.stringify(r));
  expect(r.sites).toBe(1);
  expect(r.infN, 'a soldier: one round').toBe(1);
  expect(r.g25car).toBeLessThan(20); expect(r.g25apc).toBeGreaterThan(80);
  expect(r.g30car).toBeLessThanOrEqual(2); expect(r.g30apc).toBeGreaterThanOrEqual(7);
  expect(r.wrecked).toBe(true); expect(r.back, 'a new base on the only site').toBe(true);
  expect(r.after).toBeGreaterThanOrEqual(40); expect(r.after).toBeLessThan(120);
});

test('a vehicle firing up at the aircraft raises its roof machine gun and the tracers leave its muzzle; missiles fly with a body, flares without', async ({ wp }) => {
  await wp.boot({ query: '?hour=12&seed=11&weapons=hf&auto=0&transit=0' });
  const r = await wp.run(() => {
    const v = new Vehicle('apc', 'enemy'); v.obj.position.set(CAM_TGT.x, groundH(CAM_TGT.x, CAM_TGT.z), CAM_TGT.z);   // (under the camera: the aircraft some 45° up) v.yaw = 1; v.obj.rotation.set(0, -1, 0, 'YZX');
    const out = { mgs: ['tank', 'apc', 'car'].map(k => !!unitModel('enemy', k).getObjectByName('mg')), rest: v.mg.rotation.z };
    v.aaUntil = T + 99; AA.bursts.push({ u: v, wait: 0, n: 6, tick: 0, col: 0xa8ff8a, ox: 16, oy: 6 });
    const spawn0 = FX.tracers.spawn, from = []; FX.tracers.spawn = (p, vel, o) => { from.push(p.distanceTo(v.mgMuzzle(new THREE.Vector3()))); return spawn0.call(FX.tracers, p, vel, o); };
    let up = 0; for (let i = 0; i < 100; i++) { v.aimMG(0.05); __t.sim(0.05); up = Math.max(up, v.mg.rotation.z); }
    FX.tracers.spawn = spawn0;
    const near = from.filter(d => d < 0.05).length;
    out.raised = up; out.after = v.mg.rotation.z; out.near = near; out.shots = from.length;
    // a Hellfire on its way: a body each step; flares: none
    __t.sim(5.5, { audio: true }); let bodies = 0, steps = 0;
    for (let i = 0; i < 3000 && !BATTLE.missiles.length; i++) __t.sim(0.05, { audio: true });
    for (let i = 0; i < 10 && BATTLE.missiles.length; i++) { __t.sim(0.05, { audio: true }); steps++; bodies += FX.bodies.mesh.count; }
    out.missile = { steps, bodies };
    for (const m of BATTLE.missiles.splice(0)) {} AA.sams.length = 0; AA.drop(6); let fb = 0; for (let i = 0; i < 20; i++) { __t.sim(0.05); fb += FX.bodies.mesh.count; }
    out.flareBodies = fb;
    return out;
  });
  expect(r.mgs).toEqual([true, true, true]);
  expect(Math.abs(r.rest)).toBeLessThan(1e-6); expect(r.raised, 'raised at the aircraft').toBeGreaterThan(0.5); expect(r.after, 'and lowered after').toBeLessThan(r.raised - 0.3);
  expect(r.near, 'tracers from the muzzle').toBeGreaterThanOrEqual(5);
  expect(r.missile.steps).toBeGreaterThan(3); expect(r.missile.bodies).toBeGreaterThanOrEqual(r.missile.steps);
  expect(r.flareBodies).toBe(0);
});
