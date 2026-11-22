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

test('music arms the fight after 5 s; the camera stays and the enemy comes to it, out of sight; transits only in quiet parts; the gunship fires by the table', async ({ wp }) => {
  await wp.boot({ query: '?hour=12&seed=11' });
  await wp.sim(3, { audio: true });
  expect(await wp.run(() => AUD.combat)).toBe(false);
  await wp.sim(3, { audio: true });
  const a = await wp.run(() => ({ combat: AUD.combat, base: !!BATTLE.base, parts: BATTLE.base ? BATTLE.base.parts.length : 0, state: GUNSHIP.state, en: UNITS.filter(u => u.side === 'enemy').length }));
  expect(a).toMatchObject({ combat: true, base: true, state: 'orbit' });   // (the camera stays: the enemy comes to it)
  expect(a.en).toBeGreaterThan(15);
  // the allies are in the fight: vehicles and soldiers of theirs near the place the camera is on, most of the time
  // the camera never leaves enemies that are still in its frame (unless it waited for the allies in vain), and where it looks at enemies the allies are mostly there too
  const cam = await wp.run(() => {
    let left = 0, was = GUNSHIP.state, on = 0, backed = 0, first = null; const t0 = T, legs = [];
    for (let i = 0; i < 4800; i++) {
      const arr = GUNSHIP.arrived, calm = AUD.calm, dry = BATTLE.dry();
      __t.sim(0.05, { audio: true });
      const seen = UNITS.filter(u => u.side === 'enemy' && u.kind !== 'struct' && BATTLE.inFrame(u.pos));
      if (first == null && seen.length) first = T - t0;
      if (GUNSHIP.state === 'transit' && was === 'orbit' && AUD.fighting) legs.push({ stay: T - arr, calm, dry });
      if (GUNSHIP.state === 'transit' && was === 'orbit' && seen.length && !(BATTLE.waitT && T >= BATTLE.waitT)) left++;
      was = GUNSHIP.state;
      if (i > 1200 && i % 20 === 0 && GUNSHIP.state === 'orbit' && seen.length) { on++; if (UNITS.some(u => u.side === 'ally' && Math.hypot(u.pos.x - CAM_TGT.x, u.pos.z - CAM_TGT.z) < 150)) backed++; }
    }
    return { left, on, backed, first, legs };
  });
  console.log('camera: ' + JSON.stringify(cam));
  expect(cam.left, 'transits begun with enemies still in the frame').toBe(0);
  expect(cam.first, 'the first enemy in the frame, s after arming').not.toBeNull(); expect(cam.first).toBeLessThan(25);
  for (const l of cam.legs) { expect(l.stay, 'a transit in a fight: after the stay').toBeGreaterThan(45); expect(l.calm || l.dry, 'a transit in a fight: in a quiet part, or nothing left here').toBe(true); }
  expect(cam.backed / Math.max(1, cam.on), 'the share of the time with enemy units in the frame when allies are within 150 m (it varies a lot from run to run)').toBeGreaterThan(0.15);
  const b = await wp.run(() => {
    const bad = BATTLE.log.filter(l => { const [w, k] = l.split(' '); return !WEAPON[w].hitSet.has(k) || !CFG.weapons.includes(w); });
    return { stat: BATTLE.stat, bad, log: BATTLE.log.length, wrecks: WRECKS.list.length, used: [...new Set(BATTLE.log.map(l => l.split(' ')[0]))].sort(), water: UNITS.filter(u => u.kind !== 'heli' && waterAt(u.pos.x, u.pos.z) === 1).length };
  });
  expect(b.bad).toEqual([]);
  expect(b.stat.shots).toBeGreaterThan(40);
  expect(b.stat.near, 'shots at a target coming onto the reticle').toBeGreaterThan(0); expect(b.stat.miss, 'misses').toBeGreaterThan(0);
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
  // (geometries of the unit prototypes, shared by every clone, do not count: which models stand about after a fight varies)
  const count = () => { const shared = new Set(); let protos = 0; for (const k in PROTO) PROTO[k].traverse(o => { if (o.geometry) { protos++; shared.add(o.geometry.uuid); } }); const set = new Set(); scene.traverse(o => { if (o.geometry && !shared.has(o.geometry.uuid)) set.add(o.geometry.uuid); }); return { g: renderer.info.memory.geometries, live: set.size, protos, p: renderer.info.programs.length, kids: scene.children.length }; };
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
    if (v) { v.troops = 5; const q0 = new Set(BATTLE.squads); hurt(v, 99); __t.sim(1.5, { audio: true }); bailed = BATTLE.squads.filter(q => !q0.has(q) && q.from === 'bail' && q.m.some(s => Math.hypot(s.position.x - v.pos.x, s.position.z - v.pos.z) < 12)).reduce((n, q) => n + q.m.length, 0); }   // (its own crew: another may die meanwhile)
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
    let plumes = 0; for (let i = 0; i < 4 && BATTLE.missiles.length; i++) { __t.sim(0.05, { audio: true }); plumes += FX.plumes.mesh.count; }
    out.missile = { steps, bodies, plumes };
    for (const m of BATTLE.missiles.splice(0)) {} AA.sams.length = 0; AA.flares.length = 0; AA.bursts.length = 0; AA.drop(6); let fb = 0, fp = 0, sparks = 0; const sp = FX.tracers.spawn; FX.tracers.spawn = function () { sparks++; return sp.apply(this, arguments); };
    for (let i = 0; i < 20; i++) { __t.sim(0.05); fb += FX.bodies.mesh.count; fp += FX.plumes.mesh.count; }
    FX.tracers.spawn = sp; out.flareBodies = fb; out.flarePlumes = fp; out.flareSparks = sparks;
    return out;
  });
  expect(r.mgs).toEqual([true, true, true]);
  expect(Math.abs(r.rest)).toBeLessThan(1e-6); expect(r.raised, 'raised at the aircraft').toBeGreaterThan(0.5); expect(r.after, 'and lowered after').toBeLessThan(r.raised - 0.3);
  expect(r.near, 'tracers from the muzzle').toBeGreaterThanOrEqual(5);
  expect(r.missile.steps).toBeGreaterThan(3); expect(r.missile.bodies).toBeGreaterThanOrEqual(r.missile.steps);
  expect(r.missile.plumes, 'the missile flame').toBeGreaterThan(0);
  expect(r.flareBodies).toBe(0); expect(r.flarePlumes).toBe(0); expect(r.flareSparks, 'flares as they were: no sparks').toBe(0);
});

test('the auto-switching fires another weapon while the one in hand reloads for a while', async ({ wp }) => {
  await wp.boot({ query: '?hour=12&seed=11&weapons=g25,h105&transit=0' });
  const r = await wp.run(() => {
    const e = { alive: true, side: 'enemy', kind: 'car', pos: CAM_TGT.clone(), ah: 1.6 }; UNITS.push(e);
    const at = (rl) => { ARMS.select('h105'); ARMS.st.h105.reload = rl; BATTLE.manualUntil = 0; BATTLE.autoTick = 0; BATTLE.nextSwitch = T + 100; BATTLE.autoArm(); return ARMS.cur; };
    const out = { ready: at(0), short: at(1), long: at(2.4) };
    UNITS.splice(UNITS.indexOf(e), 1); ARMS.st.h105.reload = 0; BATTLE.stat.hops = 0;
    __t.sim(90, { audio: true, bpm: 90 }); out.hops = BATTLE.stat.hops; out.shots = BATTLE.stat.shots;
    return out;
  });
  expect(r.ready, 'loaded: it stays').toBe('h105'); expect(r.short, 'a short reload: it stays').toBe('h105');
  expect(r.long, 'a long reload: the 25 mm meanwhile').toBe('g25');
  expect(r.hops, 'in a fight').toBeGreaterThan(0);
});

test('a knocked-out tank cooks off on the beats and may throw its turret; light rounds glance off an APC', async ({ wp }) => {
  await wp.boot({ query: '?hour=12&seed=11&transit=0' });
  await wp.sim(6, { audio: true });
  const r = await wp.run(() => {
    const at = (dx, dz) => { const p = new THREE.Vector3(CAM_TGT.x + dx, 0, CAM_TGT.z + (dz || 0)); p.y = groundH(p.x, p.z); return p; }, out = {};
    // cook-offs: three pops, the last throwing the turret (made certain here)
    COOK.toss = 1; const v = new Vehicle('tank', 'enemy'); v.obj.position.copy(at(30)); const y0 = v.turret.position.y;
    const pop0 = BATTLE.pop, cb0 = BATTLE.cookBeat; let mine = 0, onBeat = 0, inBeat = false;   // (this tank's pops only: others die in the fight too)
    BATTLE.cookBeat = function () { inBeat = true; cb0.apply(this, arguments); inBeat = false; };
    BATTLE.pop = function (i) { if (this.cooks[i].v === v) { mine++; if (inBeat) onBeat++; } return pop0.call(this, i); };
    hurt(v, 1e4); let top = 0;
    for (let i = 0; i < 160; i++) { __t.sim(0.05, { audio: true }); top = Math.max(top, v.turret.position.y - y0); }
    BATTLE.pop = pop0; BATTLE.cookBeat = cb0; out.cooks = mine; out.onBeat = onBeat; out.left = BATTLE.cooks.filter(c => c.v === v).length; out.top = top * ARMOR_SCALE; out.landed = Math.abs(v.turret.position.y - y0) * ARMOR_SCALE; COOK.toss = 0.35;
    // ricochets off an APC (at most RICO_MAX a step)
    const apc = new Vehicle('apc', 'enemy'); apc.obj.position.copy(at(-30)); const r0 = BATTLE.stat.ricochet;
    for (let i = 0; i < 20; i++) BATTLE.strike(apc.pos, GUN.g25.r, GUN.g25.dmg, WEAPON.g25, false);
    out.rico = BATTLE.stat.ricochet - r0; apc.remove();
    return out;
  });
  console.log(JSON.stringify(r));
  expect(r.cooks, 'three pops').toBe(3); expect(r.left).toBe(0); expect(r.onBeat, 'mostly on strong beats').toBeGreaterThanOrEqual(1);
  expect(r.top, 'the turret thrown up, metres').toBeGreaterThan(2.5); expect(r.landed, 'and back on the hull').toBeLessThan(0.2);
  expect(r.rico).toBeGreaterThan(0); expect(r.rico).toBeLessThanOrEqual(8);
});

test('the feed: the next group comes in as the last one dies, at the music pace; very slow music has breaks', async ({ wp }) => {
  const run = async (seed, bpm) => {
    await wp.boot({ query: '?hour=12&seed=' + seed });
    await wp.sim(6, { audio: true, bpm });
    return wp.run((bpm) => {
      let n = 0, idle = 0;
      for (let i = 0; i < 3600; i++) { __t.sim(0.05, { audio: true, bpm }); if (i % 10 || GUNSHIP.state !== 'orbit') continue; n++; if (T - BATTLE.lastShot > 2) idle++; }
      return { idle: idle / n, feed: BATTLE.stat.feed, breaks: BATTLE.stat.breaks, seenIn: BATTLE.stat.seenIn };
    }, bpm);
  };
  const fast = await run(11, 140); console.log('fast ' + JSON.stringify(fast));
  expect(fast.feed).toBeGreaterThan(10); expect(fast.breaks).toBe(0); expect(fast.seenIn, 'arrivals in the frame').toBe(0);
  expect(fast.idle, 'the share of the fight with no shot for 2 s').toBeLessThan(0.5);
  const slow = await run(11, 84); console.log('slow ' + JSON.stringify(slow));
  expect(slow.breaks, 'breaks between the groups').toBeGreaterThan(0); expect(slow.seenIn).toBe(0);
});

test('a column under fire weaves across the road, steered: no jump sideways, no sharp turn', async ({ wp }) => {
  await wp.boot({ query: '?hour=12&seed=11&transit=0' });
  await wp.sim(6, { audio: true });
  const r = await wp.run(() => {
    let jump = 0, lane = 0, n = 0, acc = 0, sharp = 0, m = 0; const last = new Map();
    for (let i = 0; i < 600; i++) {
      for (const E of BATTLE.cols) if (!E.ally && !E.retreat) E.col.alarm = T + 20;   // (every enemy column under fire)
      __t.sim(0.05, { audio: true });
      for (const E of BATTLE.cols) for (const v of E.col.u) {
        const p = v.obj.position, q = last.get(v);
        if (q && v.alive) {
          const d = Math.hypot(p.x - q.x, p.z - q.z), h = Math.atan2(p.z - q.z, p.x - q.x); jump = Math.max(jump, d - Math.max(v.v, 0) * 0.05); n++;
          // the sideways acceleration of its track (the change of heading a metre × speed²), where it moves at a fair speed
          if (d > 0.25 && q.d > 0.25) { const a = Math.abs(Math.atan2(Math.sin(h - q.h), Math.cos(h - q.h))) / d * (d / 0.05) ** 2; m++; acc = Math.max(acc, a); if (a > 6) sharp++; }
          last.set(v, { x: p.x, z: p.z, h, d });
        } else last.set(v, { x: p.x, z: p.z, h: 0, d: 0 });
        lane = Math.max(lane, Math.abs(v.laneK));
      }
    }
    return { jump, lane, n, acc, sharp: sharp / Math.max(1, m), m };
  });
  console.log(JSON.stringify(r));
  expect(r.n).toBeGreaterThan(100);
  expect(r.lane, 'they do weave').toBeGreaterThan(1.3);
  expect(r.jump, 'metres moved in a step beyond the speed along the road').toBeLessThan(0.5);
  expect(r.acc, 'sideways acceleration at most (was hundreds: kinks)').toBeLessThan(12);
  expect(r.sharp, 'share of steps turning harder than 6 m/s sideways (was 7 %)').toBeLessThan(0.03);
});

test('the allies are in the fight the sensor watches, not only round it', async ({ wp }) => {
  await wp.boot({ query: '?hour=12&seed=11' });
  await wp.sim(6, { audio: true, bpm: 140 });
  const r = await wp.run(() => {
    let enF = 0, both = 0, ai = 0, n = 0;
    for (let i = 0; i < 360; i++) {
      __t.sim(0.5, { audio: true, bpm: 140 }); let ef = 0, af = 0;
      for (const u of UNITS) { if (!u.alive || u.kind === 'struct' || u.kind === 'heli') continue; if (BATTLE.inFrame(u.pos)) { if (u.side === 'enemy') ef++; else af++; } }
      n++; if (ef) { enF++; if (af) both++; } ai += af;
    }
    return { share: both / Math.max(1, enF), ai: ai / n, allies: UNITS.filter(u => u.side === 'ally').length, feed: BATTLE.stat.allyFeed, seenIn: BATTLE.stat.seenIn };
  });
  console.log(JSON.stringify(r));
  expect(r.seenIn, 'nobody appears in sight').toBe(0);
  expect(r.feed, 'fireteams and columns of theirs called in').toBeGreaterThan(2);
  expect(r.share, 'share of the time with enemies in the frame that allies are in it too (was 0.12 on average)').toBeGreaterThan(0.18);
  expect(r.ai, 'allies in the frame on average (was 0.4)').toBeGreaterThan(0.5);
  expect(r.allies, 'not a crowd').toBeLessThan(90);
});

test('infantry under fire runs from the hit, its squad spreads out, nobody fires on the run', async ({ wp }) => {
  await wp.boot({ query: '?hour=12&seed=11' });
  await wp.sim(6, { audio: true });
  const r = await wp.run(() => {
    let q = null;
    for (let i = 0; i < 1200 && !q; i++) { __t.sim(0.05, { audio: true }); q = BATTLE.squads.find(s => s.side === 'enemy' && !s.flee && s.m.length >= 3 && T > s.go); }
    if (!q) return null;
    const m = q.m.slice(), c = m.reduce((a, s) => a.add(s.position), new V3()).multiplyScalar(1 / m.length), p = new V3(c.x + 2, c.y, c.z + 1);
    const d0 = m.map(s => Math.hypot(s.position.x - p.x, s.position.z - p.z)), shots0 = BATTLE.stat.uShots, sc0 = BATTLE.stat.scatter;
    const fired = new Set(), u0 = BATTLE.unitShot.bind(BATTLE); BATTLE.unitShot = u => { if (m.includes(u) && u.scatter && T < u.scatter.until) fired.add(u); u0(u); };
    BATTLE.scare(p, 3, 'enemy'); const ran = m.filter(s => s.scatter).length, spread = q.spreadUntil > T;
    let bad = 0; for (let i = 0; i < 50; i++) { __t.sim(0.05, { audio: true }); for (const s of m) { if (!s.alive) continue; const w = waterAt(s.position.x, s.position.z); if (w === 1 || w === 2 || (occAt(s.position.x, s.position.z) & (OCC_WATER | OCC_BUILD))) bad++; } }
    const alive = m.filter(s => s.alive), d1 = alive.map(s => Math.hypot(s.position.x - p.x, s.position.z - p.z));
    BATTLE.unitShot = u0;
    // and in a whole fight the gunship's hits send them running
    __t.sim(60, { audio: true });
    return { n: m.length, ran, spread, gain: d1.reduce((a, b) => a + b, 0) / Math.max(1, d1.length) - d0.reduce((a, b) => a + b, 0) / d0.length, bad, firedOnRun: fired.size, scatter: BATTLE.stat.scatter - sc0 };
  });
  console.log(JSON.stringify(r));
  expect(r, 'an enemy squad').toBeTruthy();
  expect(r.ran, 'who was close runs').toBeGreaterThanOrEqual(Math.min(3, r.n));
  expect(r.spread, 'the squad spreads out').toBe(true);
  expect(r.gain, 'metres further from the hit, on average, after 2.5 s').toBeGreaterThan(5);
  expect(r.bad, 'nobody in water or a wall').toBe(0);
  expect(r.firedOnRun, 'nobody fires on the run').toBe(0);
  expect(r.scatter, 'the fight sends them running too').toBeGreaterThan(r.ran);
  expect(r.scatter, 'but not every round: they stand and fire between runs').toBeLessThan(600);
});

test('a vehicle knocked out on the move rolls on, slowing, and stops', async ({ wp }) => {
  await wp.boot({ query: '?hour=12&seed=11&transit=0' });
  await wp.sim(6, { audio: true });
  const r = await wp.run(() => {
    let v = null;
    for (let i = 0; i < 2000 && !v; i++) { __t.sim(0.05, { audio: true }); for (const E of BATTLE.cols) for (const u of E.col.u) if (u.alive && u.v > 6) v = u; }
    if (!v) return null;
    const p0 = v.pos.clone(), v0 = v.v; v.die(); const d = [];
    for (let i = 0; i < 200; i++) { __t.sim(0.05, { audio: true }); if (i % 20 === 19) d.push(Math.hypot(v.obj.position.x - p0.x, v.obj.position.z - p0.z)); }
    return { v0, d, w: WRECKS.list.find(w => w.obj === v.obj) };
  });
  console.log(JSON.stringify({ v0: r.v0, d: r.d }));
  expect(r.w, 'a wreck').toBeTruthy();
  expect(r.d[0], 'rolled on in the first second').toBeGreaterThan(r.v0 * 0.5);
  expect(r.d[9] - r.d[0], 'further, slowing').toBeGreaterThan(0.5);
  expect(r.d[9], 'and stopped').toBeCloseTo(r.d[8], 2);
  expect(r.w.roll, 'no longer rolling').toBeFalsy();
});
