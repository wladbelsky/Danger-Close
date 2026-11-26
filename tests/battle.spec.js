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
  expect(cam.backed / Math.max(1, cam.on), 'the share of the time with enemy units in the frame when allies are within 150 m (it varies a lot from run to run)').toBeGreaterThan(0.1);   // (was 0 on both maps)
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

test('at the map edge the sensor stops where the frame can be centred: the reticle stays in the middle, what lies past that is left to the allies', async ({ wp }) => {
  await wp.boot({ query: '?hour=11&seed=3&transit=0&weapons=h105&auto=0' });
  const r = await wp.run(() => {
    const p = new THREE.Vector3(MAP_HALF - 25, 0, 0); p.y = groundH(p.x, p.z);
    GUNSHIP.nextWander = 1e9; GUNSHIP.ctr.set(MAP_HALF - 200, 0, 0); let off = 0;
    for (let i = 0; i < 80; i++) { GUNSHIP.track(p); __t.sim(0.1); off = Math.max(off, Math.hypot(GUNSHIP.look.x - CAM_TGT.x, GUNSHIP.look.z - CAM_TGT.z)); }   // (slewing at it, circling over it)
    const L = GUNSHIP.look.clone(), R = VIEW.ndc(L);   // (where the sensor's point shows: the reticle is the frame's centre)
    const at = { pos: p.clone(), kind: 'inf', side: 'enemy', alive: true }, mid = { pos: CAM_TGT.clone() };
    return { off, ret: Math.hypot(R.x, R.y), short: MAP_HALF - L.x, reachEdge: BATTLE.reach({ pos: p }), reachMid: BATTLE.reach({ pos: L }),
      hitEdge: BATTLE.canHit(ARMS.w, at), middle: BATTLE.onAim(mid), under: (() => { const q = BATTLE.aimPoint(new THREE.Vector3()); return Math.hypot(q.x - CAM_TGT.x, q.z - CAM_TGT.z); })() };
  });
  console.log(JSON.stringify(r));
  expect(r.off, 'the sensor\'s point never left the frame\'s centre (m)').toBeLessThan(0.5);
  expect(r.short, 'it stopped short of the edge by the frame\'s reach').toBeGreaterThan(60);
  expect(r.ret, 'the point under the reticle, in the middle').toBeLessThan(0.01);
  expect(r.middle, 'a target in the middle is under it').toBe(true); expect(r.under, 'a shot under the reticle goes to the middle').toBeLessThan(0.5);
  expect({ reachEdge: r.reachEdge, hitEdge: r.hitEdge, reachMid: r.reachMid }, 'one 25 m off the edge out of its reach, not a target').toEqual({ reachEdge: false, hitEdge: false, reachMid: true });
});

test('a weapon picked by hand gives way to the auto-switching once nothing it may hit is left in the sector', async ({ wp }) => {
  await wp.boot({ query: '?hour=12&seed=11&weather=clear&aa=0&weapons=g25,g30,h105,aim' });
  const r = await wp.run(() => {
    __t.sim(5.5, { audio: true }); for (let i = 0; i < 1200 && (GUNSHIP.state === 'transit' || !BATTLE.base); i++) __t.sim(0.05, { audio: true });
    for (const u of UNITS) if (u.kind === 'heli' && u.side === 'enemy') u.pos.x += 5000;   // (no enemy helicopter anywhere near)
    BATTLE.nextHeli = 1e9;
    for (let i = 0; i < 1200 && !UNITS.some(u => u.side === 'enemy' && u.kind !== 'heli' && BATTLE.inFrame(u.pos)); i++) __t.sim(0.05, { audio: true });   // (it switches to what is in the frame: something there)
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
    for (const u of UNITS) if (u.kind === 'apc') u.troops = 0; __t.sim(1.2, { audio: true });   // (another knocked out just before still had its crew getting out, up to 1 s on: let them out first)
    const v = UNITS.find(u => u.kind === 'apc' && u.alive && !u.retreat && BATTLE.cols.some(E => E.col === u.col)); let bailed = -1;   // (picked after that: one picked before may have died meanwhile)
    if (v) { for (const u of UNITS) if (u.kind === 'apc' && u !== v) u.troops = 0; v.troops = 5; const b0 = BATTLE.stat.bailed; hurt(v, 99); __t.sim(1.5, { audio: true }); bailed = BATTLE.stat.bailed - b0; }   // (its own crew only: another APC dying meanwhile has nobody aboard; counted as they get out, so one shot dead at once still counts)
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
  expect(r.acc, 'sideways acceleration at most (was hundreds: kinks)').toBeLessThan(15);
  // (the weave at 9–14 m/s is 6–9 m/s sideways: the share grows with how many weave at full speed; 1.5–2 % while columns queued
  // out of sight, 2.5–4.5 % since they do not)
  expect(r.sharp, 'share of steps turning harder than 6 m/s sideways (was 7 %)').toBeLessThan(0.05);
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

test('the guns fire only at what is under the reticle, and a burst follows the reticle, not a target running off', async ({ wp }) => {
  await wp.boot({ query: '?hour=12&seed=11&weapons=g25,g30,b40,h105' });
  await wp.sim(6, { audio: true, bpm: 140 });
  const r = await wp.run(() => {
    const off = [], hit = [], f0 = BATTLE.fire.bind(BATTLE), s0 = BATTLE.strike.bind(BATTLE); let led = 0;
    // from the reticle, the frame's centre, as BATTLE.onAim measures it
    const aimD = p => { const n = VIEW.ndc(p); return Math.hypot(n.x * camera.aspect, n.y); };
    // (a round already in the air when the sensor jumps to another target, BURST_LET_GO m or more within 0.3 s, cannot follow it:
    // not counted; following a running target moves it a few metres in that time)
    const hist = []; let jumpT = -9;
    const seen = () => { const L = GUNSHIP.look; if (hist.length && hist[hist.length - 1].T >= T) return; hist.push({ T, x: L.x, z: L.z }); while (hist[0].T < T - 0.3) hist.shift(); if (hist.some(h => Math.hypot(h.x - L.x, h.z - L.z) > BURST_LET_GO)) jumpT = T; };
    const jumped = () => T - jumpT < 1.2;
    BATTLE.fire = (w, t, st, dk, at) => { seen(); if (!at && t) off.push(aimD(t.pos)); return f0(w, t, st, dk, at); };
    BATTLE.strike = (p, r, d, w, air) => { seen(); if (!air && !jumped()) hit.push(aimD(p)); return s0(p, r, d, w, air); };
    for (let i = 0; i < 240; i++) { __t.sim(0.5, { audio: true, bpm: 140 }); for (const u of UNITS) if (u.kind === 'inf' && u.scatter && T < u.scatter.until && BATTLE.velOf(u, new V3()).length() > 3) { led++; break; } }
    const q = (a, f) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(f * (s.length - 1))]; };
    return { n: off.length, offMax: Math.max(...off), hits: hit.length, hitP99: q(hit, 0.99), far: hit.filter(x => x > 0.3).length / hit.length, led, scatter: BATTLE.stat.scatter };
  });
  console.log(JSON.stringify(r));
  expect(r.n).toBeGreaterThan(40);
  expect(r.offMax, 'at the trigger the target is under the reticle (RET_ON), never fired at off it').toBeLessThanOrEqual(0.0701);
  expect(r.hitP99, 'where the rounds land, from the reticle (half heights; was 0.23)').toBeLessThan(0.21);
  expect(r.far, 'rounds landing far off the reticle').toBeLessThan(0.01);
  expect(r.led, 'a soldier running from a hit is led by the sensor').toBeGreaterThan(0);
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

for (const seed of [11, 3]) test(`vehicles keep out of each other and out of wrecks: they brake, pull aside, go round (seed ${seed})`, async ({ wp }) => {
  await wp.boot({ query: `?hour=12&seed=${seed}` });
  await wp.sim(6, { audio: true, bpm: 140 });
  const r = await wp.run(() => {
    const box = u => { const h = u.hull, o = u.obj, a = -o.rotation.y, c = Math.cos(a), s = Math.sin(a); return { x: o.position.x + c * h.c, z: o.position.z + s * h.c, c, s, l: h.l * 0.92, w: h.w * 0.92 }; };
    let live = 0, wreck = 0, vis = 0, vs = 0, vn = 0;
    for (let i = 0; i < 600; i++) {
      __t.sim(0.25, { audio: true, bpm: 140 });
      const V = UNITS.filter(u => u instanceof Vehicle), B = V.map(box), W = WRECKS.list.filter(w => w.veh && w.obj.parent === scene && w.t < 130).map(w => [w.veh, box(w.veh)]);
      for (const u of V) { vs += u.v; vn++; }
      const on = (a, b) => VIEW.onScreen(a.obj.position, 0.05) || VIEW.onScreen(b.obj.position, 0.05);
      for (let a = 0; a < V.length; a++) {
        for (let b = a + 1; b < V.length; b++) if (Math.hypot(B[a].x - B[b].x, B[a].z - B[b].z) < 14 && obbOverlap(B[a], B[b])) { live++; if (on(V[a], V[b])) vis++; }
        for (const [w, wb] of W) if (Math.hypot(B[a].x - wb.x, B[a].z - wb.z) < 14 && obbOverlap(B[a], wb)) { wreck++; if (on(V[a], w)) vis++; }
      }
    }
    return { live, wreck, vis, v: vs / vn, bypass: BATTLE.stat.bypass, yield: BATTLE.stat.yield };
  });
  console.log(JSON.stringify(r));
  // before: 6400–6800 (seed 11) and ~680 (seed 3) overlapping pairs over 150 s, ~4850 / ~95 of them in sight; ~1200–4300 with wrecks.
  // Out of sight a vehicle stuck for TRAFFIC.ghost s may still drive through (a narrow street), so only what is in sight counts
  expect(r.vis, 'overlapping in sight (pair × 0.25 s)').toBeLessThan(60);
  expect(r.bypass, 'they drive round what stands in the way').toBeGreaterThan(5);
  expect(r.v, 'nobody stuck for good: the mean speed (was 4.4–4.7; they wait and go round now)').toBeGreaterThan(2.4);
});

test('a soldier walks with his legs: nobody slides, not even a squad leader running from a hit', async ({ wp }) => {
  await wp.boot({ query: '?hour=12&seed=11' });
  await wp.sim(6, { audio: true, bpm: 140 });
  const r = await wp.run(() => {
    const prev = new Map(), run = new Map(); let n = 0, fast = 0, slide = 0;
    for (let i = 0; i < 2400; i++) {
      __t.sim(0.05, { audio: true, bpm: 140 }); const now = new Map();
      for (const q of BATTLE.squads.concat(ALLIES.squads || [])) for (const s of q.m) {
        now.set(s, [s.position.x, s.position.z]); const p = prev.get(s); if (!p) continue;
        const v = Math.hypot(s.position.x - p[0], s.position.z - p[1]) / 0.05; if (v > 60) continue;
        n++; const sl = v > 1 && s.stride < 0.3 ? (run.get(s) || 0) + 1 : 0; run.set(s, sl); if (v > 1) fast++; if (sl >= 6) slide++;   // (moving and his legs still for 0.3 s and more)
      }
      prev.clear(); for (const [k, v] of now) prev.set(k, v);
    }
    return { n, fast, slide };
  });
  console.log(JSON.stringify(r));
  expect(r.fast, 'soldiers on the move').toBeGreaterThan(20000);
  expect(r.slide, 'soldier-steps sliding with still legs').toBeLessThan(20);
});

test('the AIM-9X locks on first: the corners of a diamond close in on the box on the helicopter, SHOOT, the launch half a second on', async ({ wp }) => {
  await wp.boot({ query: '?hour=12&seed=11&weapons=aim&auto=0' });
  await wp.sim(8, { audio: true });
  const r = await wp.run(() => {
    BATTLE.nextHeli = 1e9; for (const u of BATTLE.helis.slice()) u.remove();   // (only the one put here: the others fly over the frame now, the lock would go from one to another)
    const put = () => { const p = new V3(CAM_TGT.x + 30, 0, CAM_TGT.z); p.y = groundH(p.x, p.z) + 60; const h = new Heli(0, 'enemy', null, p); h.runNext = 1e9; BATTLE.helis.push(h);   /* (no rocket runs: diving at 55 m/s it slips the lock, and runs are at the frame now) */ const c = CAM_TGT.clone().multiplyScalar(0.75);   /* (its round a little in from the frame's centre: this map starts 320 m off its edge, where its line of sight on one side runs past what the frame can be centred on) */ h.round = () => [0, 1, 2, 3, 4, 5].map(i => [c.x + Math.cos(i) * 50, c.z + Math.sin(i) * 50]); h.wps = h.round(); return h; };
    const f0 = BATTLE.fire.bind(BATTLE), fired = []; BATTLE.fire = (w, ...a) => { fired.push(w.id); return f0(w, ...a); };
    let h = put(), drawn = 0, arrows = 0, shoot = 0, k0 = 1, kUp = false;
    for (let i = 0; i < 1200; i++) {
      __t.sim(0.05, { audio: true }); HUD.draw(); const d = HUD.lockDraw;
      if (d) { drawn++; if (d.k > 0 && d.k < 1) arrows++; if (d.shoot) shoot++; if (d.k > k0) kUp = true; k0 = d.k; } else k0 = 1;
      if (!h.alive && i % 100 === 0) h = put();
    }
    BATTLE.fire = f0;
    return { locks: BATTLE.stat.locks, shots: BATTLE.stat.lockShots, fired: fired.length, log: BATTLE.lockLog.map(l => [l.shoot - l.t0, l.fire - l.shoot]), drawn, arrows, shoot, kUp, hits: BATTLE.log.filter(l => l === 'aim heli').length };
  });
  console.log(JSON.stringify(r));
  expect(r.shots, 'launches').toBeGreaterThanOrEqual(3);
  expect(r.locks, 'locks begun for each launch (the sensor holds a helicopter under the reticle: it aimed 10 m and more off one in the air where the frame is held off the edge of the map, 40–80 locks for 1–2 launches)').toBeLessThan(r.shots * 6);
  expect(r.fired, 'every launch through the lock').toBe(r.shots);
  for (const [lock, wait] of r.log) {
    expect(lock, 'the seeker takes LOCK.t (1.4 s) of the target under the reticle').toBeGreaterThanOrEqual(1.39);
    expect(wait, 'SHOOT, then the launch about half a second on').toBeGreaterThanOrEqual(0.34); expect(wait).toBeLessThanOrEqual(0.55);
  }
  expect(r.kUp && r.arrows > 20, 'the diamond closes in on the box').toBe(true);
  expect(r.shoot, 'SHOOT shown').toBeGreaterThan(5);
  expect(r.hits, 'it hits').toBeGreaterThanOrEqual(1);
});

test('a soldier hit kicks up dust; one killed goes in a burst of dust that hides him, whichever side', async ({ wp }) => {
  await wp.boot({ query: '?hour=12&seed=11' });
  await wp.sim(3);
  const r = await wp.run(() => {
    const q = ALLIES.squads.find(s => s.m.length >= 2) || BATTLE.squads.find(s => s.m.length >= 2), [a, b] = q.m, live = () => FX.puff.items.filter(i => i.on).length;
    a.hp = 2; const n0 = live(); hurt(a, 1); const hit = live() - n0;
    const n1 = live(), p = b.position.clone(); hurt(b, 5); const dead = live() - n1, gone = !b.alive;
    const near = FX.puff.items.filter(i => i.on && Math.hypot(i.p.x - p.x, i.p.z - p.z) < 3).length;
    __t.sim(1); const after = FX.puff.items.filter(i => i.on).length;
    return { side: q.side, hit, dead, gone, near, after };
  });
  console.log(JSON.stringify(r));
  expect(r.hit, 'a hit: a kick of dust').toBeGreaterThanOrEqual(2);
  expect(r.gone).toBe(true);
  expect(r.dead, 'killed: a burst').toBeGreaterThanOrEqual(8);
  expect(r.near, 'where he stood').toBeGreaterThanOrEqual(8);
  expect(r.after, 'still there a second on').toBeGreaterThanOrEqual(6);
});

/* the enemy's armour reaches the frame: a column halts for a fight only near where the sensor looks (COL_ZONE), the allies'
   fire does it no harm far out of sight, the traffic rules hold only near the screen, a column bound for where the camera was is
   sent on to where it looks now. Before: on some maps not one enemy vehicle in the frame in 10 min, ~50–120 killed unseen */
for (const seed of [5, 71]) test(`the enemy armour comes into the frame, not killed or stuck out of sight (seed ${seed})`, async ({ wp }) => {
  test.setTimeout(180000);
  await wp.boot({ query: `?hour=12&seed=${seed}` });
  const r = await wp.run(() => {
    let n = 0, inF = 0, unseen = 0; const seen = new Set(), prev = new Set();
    for (let i = 0; i < 9000; i++) {   // 450 s
      __t.sim(0.05, { audio: true });
      if (i % 10 || i < 200) continue; n++; let f = false; const now = new Set();
      const held = new Set(BATTLE.cols.filter(E => E.hold).flatMap(E => E.col.u));   // (the base's own, parked)
      for (const u of UNITS) { if (u.side !== 'enemy' || !u.alive || !(u instanceof Vehicle) || held.has(u)) continue; now.add(u); if (BATTLE.inFrame(u.pos)) { f = true; seen.add(u); } }
      for (const u of prev) if (!now.has(u) && !u.alive && !seen.has(u)) unseen++;
      prev.clear(); for (const u of now) prev.add(u); if (f) inF++;
    }
    return { share: inF / n, seen: seen.size, unseen, steer: BATTLE.stat.steer, spared: BATTLE.stat.spared };
  });
  console.log(JSON.stringify(r));
  expect(r.share, 'the share of the time an enemy vehicle is in the frame').toBeGreaterThan(0.1);   // (was 0 on both maps)
  expect(r.unseen, 'enemy vehicles killed without ever being in the frame').toBeLessThan(Math.max(15, r.seen * 0.4));
});

/* the Hellfire is laser-guided (semi-active): the sensor's designator puts its spot on a vehicle, the seeker locks on it before
   the launch (LOCK_T.hf), SHOOT, the launch on a strong beat; in flight it goes for the spot, wherever the laser holds it, and the
   sensor stays on the target until the hit (BATTLE.lase), LASE and the time of flight on the HUD */
test('the Hellfire locks on the laser spot first and flies to it, the sensor holding the target until the hit', async ({ wp }) => {
  await wp.boot({ query: '?hour=12&seed=11&weapons=hf&auto=0&transit=0' });
  await wp.sim(8, { audio: true });
  const r = await wp.run(() => {
    const put = () => { const v = new Vehicle('apc', 'enemy'); v.hp = 1e9; v.troops = 0; v.obj.position.set(CAM_TGT.x + 15, 0, CAM_TGT.z); v.obj.position.y = groundH(v.obj.position.x, v.obj.position.z); v.path = new Path([{ x: v.pos.x, z: v.pos.z, y: NaN, hw: 0 }, { x: v.pos.x + 1, z: v.pos.z, y: NaN, hw: 0 }]); return v; };
    for (const u of UNITS.slice()) if (u.side === 'enemy' && u instanceof Vehicle) u.remove();
    BATTLE.nextWave = BATTLE.nextFeed = 1e9;
    const v = put(), f0 = BATTLE.fire.bind(BATTLE), s0 = BATTLE.strike.bind(BATTLE), fired = [], hits = [];
    BATTLE.fire = (w, ...a) => { if (w.id === 'hf') fired.push(T); return f0(w, ...a); };
    BATTLE.strike = (p, rr, d, w, air) => { if (w.id === 'hf') hits.push({ p: p.clone(), spot: BATTLE.lase ? BATTLE.lase.p.clone() : null, v: v.pos.clone() }); return s0(p, rr, d, w, air); };
    let lased = 0, held = 0, drawn = 0, moved = false, lockSeen = false;
    for (let i = 0; i < 1600; i++) {
      __t.sim(0.05, { audio: true }); HUD.draw();
      const L = BATTLE.lock; if (L && L.w === 'hf') lockSeen = true;
      const S = BATTLE.lase; if (S) { lased++; if (Math.hypot(GUNSHIP.look.x - S.tgt.pos.x, GUNSHIP.look.z - S.tgt.pos.z) < 6) held++; if (HUD.laseDraw) drawn++;
        if (!moved && S.m.p > 0.3) { moved = true; v.obj.position.x += 12; v.obj.position.y = groundH(v.obj.position.x, v.obj.position.z); } }   // (the target moves off under the laser: the missile follows the spot)
    }
    BATTLE.fire = f0; BATTLE.strike = s0;
    const log = BATTLE.lockLog.filter(l => l.w === 'hf');
    return { lockSeen, launches: log.length, fired: fired.length, lock: log.map(l => +(l.shoot - l.t0).toFixed(2)), wait: log.map(l => +(l.fire - l.shoot).toFixed(2)), lased, held, drawn, hits: hits.map(h => +Math.hypot(h.p.x - h.v.x, h.p.z - h.v.z).toFixed(1)), moved };
  });
  console.log(JSON.stringify(r));
  expect(r.lockSeen, 'a lock on the laser spot').toBe(true);
  expect(r.launches, 'launches').toBeGreaterThanOrEqual(2);
  expect(r.fired, 'every Hellfire through the lock').toBe(r.launches);
  for (const t of r.lock) expect(t, 'the seeker takes LOCK_T.hf (0.8 s, less a 0.05 s step) of the spot').toBeGreaterThanOrEqual(0.74);
  for (const t of r.wait) { expect(t).toBeGreaterThanOrEqual(0.34); expect(t).toBeLessThan(0.75); }
  expect(r.held / r.lased, 'the sensor kept on the target while the missile flies').toBeGreaterThan(0.9);
  expect(r.drawn, 'LASE and the spot on the HUD').toBeGreaterThan(0);
  expect(r.moved, 'the target moved off under the laser').toBe(true);
  expect(r.hits.length).toBeGreaterThanOrEqual(2);
  for (const d of r.hits) expect(d, 'where it hit, from the target (it moved 12 m in flight: the missile followed the spot)').toBeLessThan(4);
});

test('the mission cost: every round at its weapon\'s price, in three figures at the HUD\'s top right, off with its setting, back to 0 after a minute of silence', async ({ wp }) => {
  await wp.boot({ query: '?hour=12&seed=11&transit=0&weapons=g25,h105&auto=0' });
  await wp.sim(10, { audio: true, bpm: 140 });
  const r = await wp.run(() => {
    const fmt = [0, 750, 999.7, 12400, 1254000, 3.4e9, 2e12].map(fmtMoney), fought = BATTLE.spent, shots = BATTLE.stat.shots;
    const t = UNITS.find(u => u.alive && u.side === 'enemy') || { pos: CAM_TGT.clone(), kind: 'car', side: 'enemy', alive: true, ah: 2, v: 0, yaw: 0 };
    // (each round is paid for as it leaves: the trigger's queued rounds run at once here, the sensor still on the point)
    const price = id => { const s = BATTLE.spent, k = BATTLE.pend.length; BATTLE.fire(WEAPON[id], t, 1.5); for (const q of BATTLE.pend.splice(k)) q.fn(); return BATTLE.spent - s; };
    const p = { h105: price('h105'), gbu: price('gbu'), aim: price('aim'), rail: price('rail') }; BATTLE.lastBurst = 0; const g25 = price('g25'), n25 = BATTLE.lastBurst;
    const seen = [], o = HUD.text; HUD.text = function (s, ...a) { seen.push(s); return o.call(this, s, ...a); };
    HUD.spentShown = BATTLE.spent; HUD.draw(); const on = seen.find(s => s.startsWith('MISSION COST ')); seen.length = 0; CFG.cost = false; HUD.draw(); const off = seen.some(s => s.startsWith('MISSION COST')); HUD.text = o; CFG.cost = true;
    const s0 = HUD.spentShown = BATTLE.spent, roll = []; BATTLE.spent += 470000; for (let i = 1; i <= 30; i++) { const v = HUD.spentAt(0.1); if (i === 1 || i === 10 || i === 20 || i === 30) roll.push((v - s0) / 470000); }   // (an AIM-9X's price: 0.1, 1, 2, 3 s on)
    const want = fmtMoney(BATTLE.spent - 470000), cost = BATTLE.spent;
    HUD.spentShown = BATTLE.spent; __t.sim(30); const kept = BATTLE.spent; __t.sim(31); const top = HUD.spentShown, reset = [BATTLE.spent]; for (let i = 1; i <= 21; i++) { const v = HUD.spentAt(0.1); if (i === 1 || i === 10 || i === 21) reset.push(v / top); }   // (the music stopped: half a minute on, the same; a minute, a new mission, the HUD rolling down to it: 0.1, 1, 2.1 s on)
    return { fmt, fought, shots, p, g25, n25, on, off, want, roll, cost, kept, reset };
  });
  console.log(JSON.stringify(r));
  expect(r.fmt).toEqual(['$0', '$750', '$1.00K', '$12.4K', '$1.25M', '$3.40B', '$2.00T']);
  expect(r.shots, 'it fought').toBeGreaterThan(0); expect(r.fought, 'and that cost money').toBeGreaterThan(0);
  expect(r.p).toEqual({ h105: 1200, gbu: 40000, aim: 470000, rail: 25000 }); expect(r.g25, 'a 25 mm burst: each round').toBe(35 * r.n25);
  expect(r.on, 'on the HUD').toBe('MISSION COST ' + r.want); expect(r.off, 'not with the setting off').toBe(false);
  expect(r.roll[0], 'a new sum: not there at once').toBeLessThan(0.4); expect(r.roll[1], 'most of it in a second').toBeGreaterThan(0.8);
  expect(r.roll[2], 'nearly all in two').toBeGreaterThan(0.98); expect(r.roll[3]).toBeLessThanOrEqual(1);
  expect(r.kept, 'half a minute of silence: kept (the last shots as the fight stands down added)').toBeGreaterThanOrEqual(r.cost); expect(r.reset[0], 'a minute: back to 0').toBe(0); expect(r.reset[1], 'the HUD rolls down: not at once').toBeGreaterThan(0.6); expect(r.reset[2], 'most of the way in a second').toBeLessThan(0.2); expect(r.reset[3], 'at 0 in two').toBe(0);
});

test('a missile on its way to a target it will kill: no other weapon wasted on it, the sensor on to the next', async ({ wp }) => {
  await wp.boot({ query: '?hour=12&seed=11&weapons=gbu,h105&auto=0&transit=0' });
  await wp.sim(8, { audio: true });
  const r = await wp.run(() => {
    for (const u of UNITS.slice()) if (u.side === 'enemy' && u instanceof Vehicle) u.remove();
    BATTLE.nextWave = BATTLE.nextFeed = 1e9;
    const put = (dx) => { const v = new Vehicle('car', 'enemy'); v.obj.position.set(CAM_TGT.x + dx, 0, CAM_TGT.z); v.obj.position.y = groundH(v.obj.position.x, v.obj.position.z); v.path = new Path([{ x: v.pos.x, z: v.pos.z, y: NaN, hw: 0 }, { x: v.pos.x + 1, z: v.pos.z, y: NaN, hw: 0 }]); return v; };
    const a = put(0), b = put(25);
    const k = BATTLE.pend.length; BATTLE.fire(WEAPON.gbu, a, 1.5); for (const q of BATTLE.pend.splice(k)) q.fn();   // (the bomb released: in flight to a)
    const out = { flying: BATTLE.missiles.length, doomedA: BATTLE.doomed(a), doomedB: BATTLE.doomed(b) };
    ARMS.select('h105'); BATTLE.focus = a; const t = BATTLE.target(WEAPON.h105); out.next = t === b ? 'b' : t === a ? 'a' : String(t && t.kind);
    b.remove(); out.alone = BATTLE.target(WEAPON.h105) === null;   // (nothing else to shoot: none at it either)
    // in a fight: every round of another weapon fired while a missile flies to a target it will kill, at that target
    BATTLE.missiles.length = 0; a.remove(); BATTLE.nextWave = BATTLE.nextFeed = 0; CFG.autoArms = true; BATTLE.manualUntil = 0;
    const f0 = BATTLE.fire.bind(BATTLE); let wasted = 0, other = 0;
    BATTLE.fire = (w, t, ...x) => { if (!GUN[w.id].missile) { other++; if (BATTLE.missiles.some(m => m.tgt === t && BATTLE.incoming(t) >= t.hp)) wasted++; } return f0(w, t, ...x); };
    __t.sim(150, { audio: true, bpm: 120 }); BATTLE.fire = f0;
    out.wasted = wasted; out.other = other; out.gbu = BATTLE.log.filter(l => l.startsWith('gbu')).length;
    return out;
  });
  console.log(JSON.stringify(r));
  expect(r.flying, 'the bomb in flight').toBe(1);
  expect(r.doomedA, 'the car it is on: doomed').toBe(true); expect(r.doomedB, 'one 25 m off: not').toBe(false);
  expect(r.next, 'the 105 mm on the other car').toBe('b');
  expect(r.alone, 'and with only the doomed one left, at nothing').toBe(true);
  expect(r.other, 'the 105 mm fired in the fight').toBeGreaterThan(5); expect(r.gbu, 'and the GBU-39').toBeGreaterThan(0);
  expect(r.wasted, 'never at what a missile in flight will kill').toBe(0);
});

test('a GBU-39 brings a base building down at one bomb, and what stands next to it; a 105 mm shell there does not', async ({ wp }) => {
  await wp.boot({ query: '?hour=12&seed=11&weapons=gbu,h105&auto=0&transit=0' });
  await wp.sim(8, { audio: true });
  const r = await wp.run(() => {
    const S = () => UNITS.filter(u => u.kind === 'struct' && u.alive), hq = S().find(u => u.type === 'hq'), out = { base: !!hq };
    if (!hq) return out;
    BATTLE.strike(hq.pos.clone(), GUN.gbu.r, GUN.gbu.dmg, WEAPON.gbu, false); out.hq = hq.alive;
    const off = (u, d) => { const p = u.pos.clone(); p.x += d; return p; };
    const [a, b] = S().filter(u => u.type === 'tent' || u.type === 'bunker');
    BATTLE.strike(off(a, 9), GUN.h105.r, GUN.h105.dmg, WEAPON.h105, false); out.shell = a.alive;
    BATTLE.strike(off(b, 9), GUN.gbu.r, GUN.gbu.dmg, WEAPON.gbu, false); out.bomb = b.alive;
    return out;
  });
  expect(r.base, 'a base').toBe(true);
  expect(r.hq, 'the HQ (60) at one bomb on it').toBe(false);
  expect(r.shell, 'a 105 mm shell 9 m off a building: only what lands on it').toBe(true);
  expect(r.bomb, 'a bomb 9 m off: down').toBe(false);
});

test('the GBU-39\'s reticle is drawn in the world: its fall line\'s ticks spread as the sensor looks further off, its ring the blast on the ground', async ({ wp }) => {
  await wp.boot({ query: '?hour=12&seed=11&weapons=gbu,apk&auto=0&transit=0' });
  const r = await wp.run(() => {
    // (the sensor's point moved along the aircraft's bearing: under it, the line of sight steep; away from it, further and flatter)
    ARMS.select('gbu'); const c = CAM_CTR.clone(), ax = camera.position.x - c.x, az = camera.position.z - c.z, an = Math.hypot(ax, az);
    const at = (k) => { CAM_TGT.set(c.x + ax / an * k, 0, c.z + az / an * k); CAM_TGT.y = groundH(CAM_TGT.x, CAM_TGT.z); updateCamera(); HUD.draw(); return { d: camera.position.distanceTo(CAM_TGT), ...HUD.bombDraw, u: HUD.u }; };
    const near = at(150), far = at(-150);
    ARMS.select('apk'); let ok = true; try { HUD.draw(); } catch (e) { ok = false; }
    // a salvo: the pod's rockets go off its four marks one by one as they leave, then it fills up again as it reloads
    HUD.draw(); const pod = [HUD.podDraw], t = { pos: CAM_TGT.clone(), kind: 'car', side: 'enemy', alive: true, ah: 2, v: 0, yaw: 0, hp: 1e9 };
    ARMS.shoot(); BATTLE.fire(WEAPON.apk, t, 3); const of = BATTLE.pod.of;   /* (a strong beat: the most rockets, 6) */ const ts = [T]; for (let i = 0; i < 40; i++) { __t.sim(0.05); HUD.draw(); if (HUD.podDraw !== pod[pod.length - 1]) { pod.push(HUD.podDraw); ts.push(T); } }
    const gap = Math.min(...ts.slice(2, 5).map((t, i) => t - ts[i + 1]));   // (between one mark going off and the next)
    __t.sim(WEAPON.apk.reload); HUD.draw(); pod.push(HUD.podDraw);
    return { near, far, ok, pod, of, gap };
  });
  console.log(JSON.stringify(r));
  expect(r.far.d - r.near.d, 'looking further off').toBeGreaterThan(150);
  for (const s of [r.near, r.far]) { expect(s.ticks[0]).toBeLessThan(s.ticks[1]); expect(s.ticks[1]).toBeLessThan(s.ticks[2]); expect(s.ticks[2]).toBeLessThan(s.top); }
  expect(r.far.ticks[2] / r.near.ticks[2], 'further off, the line of sight flatter: the ticks further apart').toBeGreaterThan(1.15);
  expect(r.near.rx, 'the ring: the blast on the ground, on the screen').toBeGreaterThan(30 * r.near.u);
  expect(r.of, 'a full salvo').toBe(6); expect(r.pod.slice(0, 5), 'the pod emptied rocket by rocket').toEqual([4, 3, 2, 1, 0]); expect(r.pod[r.pod.length - 1], 'and full again').toBe(4);
  expect(r.gap, 'one at a time, to be seen: a rocket every GUN.apk.step 0.25 s, a mark every 0.25–0.5 s (in 0.05 s steps; at 0.12 s it was 0.1)').toBeGreaterThanOrEqual(0.19);
  expect(r.ok, 'the APKWS\'s salvo reticle draws').toBe(true);
});

test('a missile or a bomb makes for the beat only a beat of its flight short of the end: a bomb in fast music near the ground', async ({ wp }) => {
  await wp.boot({ query: '?hour=12&seed=11&weapons=gbu,hf&auto=0&transit=0' });
  const fly = async (id, bpm) => wp.run(([id, bpm]) => {
    __t.sim(8, { audio: true, bpm }); BATTLE.missiles.length = 0;
    const t = { pos: CAM_TGT.clone(), kind: 'tank', side: 'enemy', alive: true, ah: 2, v: 0, yaw: 0, hp: 1e9 };
    const k = BATTLE.pend.length; BATTLE.fire(WEAPON[id], t, 1.5); for (const q of BATTLE.pend.splice(k)) q.fn();
    const m = BATTLE.missiles[BATTLE.missiles.length - 1], cut = BATTLE.cut(m); let rushAt = null, p0 = 0, wait = 0, fast = 0;
    for (let i = 0; i < 100 && BATTLE.missiles.includes(m); i++) { __t.sim(0.05, { audio: true, bpm }); if (m.rush && rushAt === null) rushAt = p0; const dp = m.p - p0; if (!m.rush && p0 < cut - 0.02 && dp < 0.05 / m.dur * 0.5) wait++; if (dp > 0.05 / m.dur * 2) fast++; p0 = m.p; }
    return { cut, rushAt, wait, bpm: AUD.bpm };
  }, [id, bpm]);
  const gbu = await fly('gbu', 150), hf = await fly('hf', 90);
  console.log(JSON.stringify({ gbu, hf }));
  expect(gbu.cut, 'a bomb in fast music: its cut near the ground').toBeGreaterThan(0.78); expect(hf.cut, 'a Hellfire in slow music: further up').toBeLessThan(0.65);
  for (const r of [gbu, hf]) { expect(r.rushAt, 'it made for a beat').not.toBeNull(); expect(r.rushAt, 'not before its cut').toBeGreaterThanOrEqual(r.cut - 0.03); expect(r.wait, 'no waiting before the cut').toBe(0); }
  expect(gbu.rushAt, 'the bomb makes for it nearer the ground than the Hellfire').toBeGreaterThan(hf.rushAt);
});
