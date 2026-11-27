// Off the road and in the air over the fight: the way across a field, an assault on the allies, a column scattering under the
// gunship's fire, the helicopters over the frame, no jitter
const { test, expect } = require('./support/harness');

for (const seed of [11, 3]) test(`a way across the fields keeps out of buildings, water and forest, and has no kinks (seed ${seed})`, async ({ wp }) => {
  await wp.boot({ query: `?hour=12&seed=${seed}&transit=0` });
  const r = await wp.run(() => {
    const N = ROADNET; let tried = 0, found = 0, bad = 0, kink = 0, longest = 0;
    for (let t = 0; tried < 20 && t < 400; t++) {
      const k = Math.floor(Math.random() * N.n), a = Math.random() * TAU, d = 150 + Math.random() * 250, x = N.X[k] + Math.cos(a) * d, z = N.Z[k] + Math.sin(a) * d;
      if (N.BR[k] || fieldBlocked(x, z)) continue; tried++;
      const p = fieldRoute(N.X[k], N.Z[k], x, z, 500); if (!p) continue; found++; longest = Math.max(longest, p.length);
      for (let i = 1; i < p.length; i++) if (fieldBlocked(p[i].x, p[i].z, FIELD.probe, true)) bad++;
      const P = new Path(p), pa = new V3(), pb = new V3(); for (let s = 8; s < P.L - 8; s += 2) { P.at(s - 1, 0, pa); P.at(s + 1, 0, pb); const h0 = Math.atan2(pb.z - pa.z, pb.x - pa.x); P.at(s + 1, 0, pa); P.at(s + 3, 0, pb); const h1 = Math.atan2(pb.z - pa.z, pb.x - pa.x); if (Math.abs(angleWrap(h1 - h0)) > 0.35) kink++; }   // (as driven: the line averaged over PATH_SMOOTH; the ends left out, where a way across a field is never driven alone: it goes on from a road)
    }
    return { tried, found, bad, kink, longest };
  });
  console.log(JSON.stringify(r));
  expect(r.tried).toBe(20);
  expect(r.found, 'ways found (some lie over a river or through a forest: none)').toBeGreaterThanOrEqual(12);
  expect(r.bad, 'points in a building, a yard, water or a thick forest').toBe(0);
  expect(r.kink, 'turns as driven sharper than 0.35 rad in 2 m (a radius under ~6 m)').toBe(0);
});

test('an enemy column near the frame leaves the road and assaults the allies in the field; its APC lets its infantry out', async ({ wp }) => {
  test.setTimeout(180000);
  let r = null;
  for (const seed of [11, 29, 3]) {   // (the first map whose frame has such a field)
  await wp.boot({ query: `?hour=12&seed=${seed}&transit=0&weapons=aim&auto=0` });   // (the gunship has nothing for the ground: no hits, no scatter)
  await wp.sim(6, { audio: true });
  r = await wp.run(() => {
    const N = ROADNET; let S = null;   // allies in a field in the frame, 60 m and more off any road; the column on the road nearest to them, 80–260 m off
    for (const rr of [50, 80, 110, 140]) for (let t = 0; t < 16 && !S; t++) {
      const a = t / 16 * TAU, x = CAM_TGT.x + Math.cos(a) * rr, z = CAM_TGT.z + Math.sin(a) * rr; if (fieldBlocked(x, z) || N.nearest(x, z, 50) >= 0 || !walkable(x, z, x, z)) continue;
      const k = N.nearest(x, z, 300); if (k < 0 || N.BR[k] || Math.hypot(N.X[k] - x, N.Z[k] - z) < 70 || !fieldRoute(N.X[k], N.Z[k], x, z, 300)) continue; S = { k, x, z };
    }
    if (!S) return null;
    let dest = -1; for (let t = 0; t < 400 && dest < 0; t++) { const c = (t * 7919) % N.n, d = Math.hypot(N.X[c] - N.X[S.k], N.Z[c] - N.Z[S.k]); if (d > 250 && d < 450) dest = c; }
    const col = new Column(['apc', 'tank'].map(ty => new Vehicle(ty, 'enemy'))); for (const v of col.u) v.hp = 1e9; col.place(Path.fromNodes(N.route(S.k, dest))); BATTLE.cols.push({ col, hold: false, retreat: false });
    const q = new Squad('ally', 4, S.x, S.z, patrolLoop(S.x, S.z, 6, 14, [S.x, S.z])); BATTLE.squads.push(q); for (const s of q.m) s.hp = 1e9;   // (they live through it: the test is the way it comes at them)
    const V = col.u.slice(), a0 = BATTLE.stat.assaults, o0 = BATTLE.stat.outOf; let off = 0, near = 1e9, wet = 0, wall = 0;
    for (let i = 0; i < 1200; i++) {
      __t.sim(0.05, { audio: true });
      for (const v of V) {
        if (!v.alive) continue; const p = v.pos, F = BATTLE.cols.find(e => e.col.u.includes(v));
        if (N.nearest(p.x, p.z, 25) < 0) off++;
        if (F && F.assault) near = Math.min(near, Math.hypot(F.assault.tgt.pos.x - p.x, F.assault.tgt.pos.z - p.z));   // (to whichever of the allies it is going for)
        const w = waterAt(p.x, p.z); if (w === 1 || w === 2) wet++; if (occAt(p.x, p.z) & OCC_BUILD) wall++;
      }
    }
    return { assaults: BATTLE.stat.assaults - a0, off, near, wet, wall, out: BATTLE.stat.outOf - o0 };
  });
  if (r) break;
  }
  console.log(JSON.stringify(r));
  expect(r, 'a field in the frame away from the roads').not.toBeNull();
  expect(r.assaults, 'assaults').toBeGreaterThanOrEqual(1);
  expect(r.off, 'samples of its vehicles more than 25 m off any road').toBeGreaterThan(20);
  expect(r.near, 'closest it came to the allies it went for (m)').toBeLessThan(70);
  expect(r.wet + r.wall, 'samples in water or in a building').toBe(0);
  expect(r.out, 'its APC let its infantry out').toBeGreaterThan(0);
});

test('a column the gunship hits in the frame scatters off the road, holds, then drives on', async ({ wp }) => {
  await wp.boot({ query: '?hour=12&seed=11&transit=0&weapons=aim&auto=0' });
  await wp.sim(6, { audio: true });
  const r = await wp.run(() => {
    const N = ROADNET; let S = null;
    for (let k = 0; k < N.n && !S; k += 3) { if (N.BR[k] || !VIEW.near(new V3(N.X[k], 0, N.Z[k]), -20)) continue; let free = 0; for (let t = 0; t < 12; t++) { const a = t / 12 * TAU; if (!fieldBlocked(N.X[k] + Math.cos(a) * 60, N.Z[k] + Math.sin(a) * 60)) free++; } if (free >= 6) S = k; }
    if (S === null) return null;
    let dest = -1; for (let t = 0; t < 400 && dest < 0; t++) { const c = (t * 7919) % N.n, d = Math.hypot(N.X[c] - N.X[S], N.Z[c] - N.Z[S]); if (d > 250 && d < 450) dest = c; }
    const col = new Column(['tank', 'apc', 'car'].map(ty => new Vehicle(ty, 'enemy'))); for (const v of col.u) v.hp = 1e9;   /* (they live through it: the test is where they go) */ col.place(Path.fromNodes(N.route(S, dest))); const E = { col, hold: false, retreat: false }; BATTLE.cols.push(E);
    const V = col.u.slice(), line = col.path.p.map(p => [p.x, p.z]);
    __t.sim(3, { audio: true });   // (on the move)
    const p = V[1].pos.clone(), s0 = BATTLE.stat.scatterV; BATTLE.strike(p, 3, 0, WEAPON.g25, false);
    const n = BATTLE.stat.scatterV - s0; let wet = 0, wall = 0; const spot = new Map(), y0 = new Map(V.map(v => [v, v.yaw])), turn = new Map(V.map(v => [v, 0])), again = new Set();
    for (let i = 0; i < 900 && spot.size < V.length; i++) {   // (where each holds: on its spot, its way there done)
      __t.sim(0.05, { audio: true });
      for (const v of V) { if (!spot.has(v)) turn.set(v, Math.max(turn.get(v), Math.abs(angleWrap(v.yaw - y0.get(v))))); const w = waterAt(v.pos.x, v.pos.z); if (w === 1 || w === 2) wet++; if (occAt(v.pos.x, v.pos.z) & OCC_BUILD) wall++; const F = BATTLE.cols.find(e => e.col.u.includes(v)); if (F && F.rescat) again.add(v); if (F && !spot.has(v) && F.scat > T && !F.scatHold && !F.move) spot.set(v, { p: v.pos.clone(), path: v.path }); }
    }
    const at = [...spot.values()].map(h => h.p), live = V.filter(v => v.alive);
    let apart = 1e9; for (let a = 0; a < at.length; a++) for (let b = a + 1; b < at.length; b++) apart = Math.min(apart, Math.hypot(at[a].x - at[b].x, at[a].z - at[b].z));
    const offLine = Math.max(...at.map(q => Math.min(...line.map(l => Math.hypot(l[0] - q.x, l[1] - q.z)))));
    __t.sim(40, { audio: true });
    const went = [...spot].filter(([v]) => v.alive).map(([v, h]) => v.path !== h.path || Math.hypot(v.pos.x - h.p.x, v.pos.z - h.p.z) > 15);   // (on its way again: a new errand, or a fight where it stands)
    return { n, held: at.length, live: live.length, apart, offLine, wet, wall, went, turn: Math.max(0, ...[...spot.keys()].filter(v => !again.has(v)).map(v => turn.get(v))) };   // (the ones that broke off, on their way to their spot; not one stuck and sent off again)
  });
  console.log(JSON.stringify(r));
  expect(r, 'a road in the frame with room round it').not.toBeNull();
  expect(r.n, 'vehicles sent off').toBeGreaterThanOrEqual(2);
  expect(r.held, 'vehicles that got to a spot and held there').toBeGreaterThanOrEqual(2);
  expect(r.apart, 'the closest two of their spots (m)').toBeGreaterThan(15);
  expect(r.offLine, 'the furthest of them from the road it was on (m; in a town down a side street)').toBeGreaterThan(12);
  expect(r.wet + r.wall, 'samples in water or in a building').toBe(0);
  for (const g of r.went) expect(g, 'on its way again after holding').toBe(true);
  expect(r.turn, 'an evasive break off to the side, not turning round: the most its nose turned on the way (rad)').toBeLessThan(2);
});

test('a scatter is a break, not a flight: forward and off to alternate sides from where each turns off; the hit ahead: across, clear of it', async ({ wp }) => {
  await wp.boot({ query: '?hour=12&seed=11&transit=0&weapons=aim&auto=0' });
  await wp.sim(6, { audio: true });
  const r = await wp.run(() => {
    const N = ROADNET; let S = null, bf = 0;
    for (let k = 0; k < N.n; k += 3) { if (N.BR[k] || !VIEW.near(new V3(N.X[k], 0, N.Z[k]), -20)) continue; let free = 0; for (let t = 0; t < 12; t++) { const a = t / 12 * TAU; if (!fieldBlocked(N.X[k] + Math.cos(a) * 60, N.Z[k] + Math.sin(a) * 60)) free++; } if (free > bf) { bf = free; S = k; } }   // (the most open stretch of road in the frame)
    if (S === null || bf < 6) return null;
    let dest = -1; for (let t = 0; t < 400 && dest < 0; t++) { const c = (t * 7919) % N.n, d = Math.hypot(N.X[c] - N.X[S], N.Z[c] - N.Z[S]); if (d > 250 && d < 450) dest = c; }
    const col = new Column(['tank', 'apc', 'car', 'apc'].map(ty => new Vehicle(ty, 'enemy'))); col.place(Path.fromNodes(N.route(S, dest))); BATTLE.cols.push({ col, hold: false, retreat: false });
    __t.sim(3, { audio: true });
    const V = col.u.slice(), idx = new Map(V.map((v, i) => [v, i]));
    const spotOf = (f, v) => { for (let t = 0; t < 40; t++) { const q = f(v, [], t % 2); if (q) return q; } return null; };   // (its first-stage spot: tries 0 and 1, no side flipped)
    const rel = q => { const A = q.from, dx = q.x - A.x, dz = q.z - A.z, c = Math.cos(A.hd), s = Math.sin(A.hd); return { fwd: dx * c + dz * s, side: Math.sign(dz * c - dx * s), off: Math.abs(Math.atan2(dz * c - dx * s, dx * c + dz * s)) }; };
    const back = V[V.length - 1], bh = back.yaw, behind = new V3(back.pos.x - Math.cos(bh) * 40, 0, back.pos.z - Math.sin(bh) * 40);   // (the hit far behind the column)
    const f1 = BATTLE.scatSpot(behind, idx), a = V.map(v => spotOf(f1, v)).map(q => q && rel(q));
    const lead = V[0], ahead = new V3(lead.pos.x + Math.cos(lead.yaw) * 15, 0, lead.pos.z + Math.sin(lead.yaw) * 15);   // (the hit on the road just ahead of the leader)
    const f2 = BATTLE.scatSpot(ahead, idx), b = V.map(v => { const q = spotOf(f2, v); return q && { ...rel(q), dHit: Math.hypot(q.x - ahead.x, q.z - ahead.z) }; });
    for (const v of V) v.remove();
    return { a, b };
  });
  console.log(JSON.stringify(r));
  expect(r, 'a road in the frame with room round it').not.toBeNull();
  const a = r.a.filter(Boolean); expect(a.length).toBeGreaterThanOrEqual(3);
  for (const q of a) { expect(q.fwd, 'the hit behind: forward of where it turns off').toBeGreaterThan(0); expect(q.off, 'and off to one side').toBeGreaterThan(0.5); }
  for (let i = 1; i < r.a.length; i++) if (r.a[i] && r.a[i - 1]) expect(r.a[i].side, 'every other one the other way').toBe(-r.a[i - 1].side);
  const b = r.b.filter(Boolean); expect(b.length).toBeGreaterThanOrEqual(3);
  for (const q of b) { expect(q.off, 'the hit ahead: across the road').toBeGreaterThan(1); expect(q.off, 'not back').toBeLessThan(1.7); expect(q.dHit, 'not up beside the blast (m)').toBeGreaterThanOrEqual(25); }
});

test('a column hit behind its knocked-out leader still scatters (round the wreck, not into it), and one holding its spot hit again goes again', async ({ wp }) => {
  await wp.boot({ query: '?hour=12&seed=11&transit=0&weapons=aim&auto=0' });
  await wp.sim(6, { audio: true });
  const r = await wp.run(() => {
    const N = ROADNET, room = (x, z, r, n) => { let free = 0; for (let t = 0; t < 12; t++) { const a = t / 12 * TAU; if (!fieldBlocked(x + Math.cos(a) * r, z + Math.sin(a) * r)) free++; } return free >= n; };
    let S = null, way = null; const q = new V3();
    for (let k = 0; k < N.n && S === null; k += 3) {
      if (N.BR[k] || !VIEW.near(new V3(N.X[k], 0, N.Z[k]), -20) || !room(N.X[k], N.Z[k], 60, 6)) continue;
      let dest = -1; for (let t = 0; t < 400 && dest < 0; t++) { const c = (t * 7919) % N.n, d = Math.hypot(N.X[c] - N.X[k], N.Z[c] - N.Z[k]); if (d > 250 && d < 450) dest = c; }
      if (dest < 0) continue; const P = Path.fromNodes(N.route(k, dest)); let ok = P.L > 140;
      for (let s = 20; ok && s <= 100; s += 20) { P.at(s, 0, q); ok = room(q.x, q.z, 35, 7); }   // (room to break off where they are hit, 7 s of driving on: not boxed in by a town, whatever the run's random numbers)
      if (ok) { S = k; way = P; }
    }
    if (S === null) return null;
    const col = new Column(['tank', 'apc', 'car'].map(ty => new Vehicle(ty, 'enemy'))); col.place(way); BATTLE.cols.push({ col, hold: false, retreat: false });
    const V = col.u.slice(); for (const v of V.slice(1)) v.hp = 1e9;   /* (the two behind live through it: the test is where they go) */
    __t.sim(3, { audio: true }); V[0].hp = 1; hurt(V[0], 5); __t.sim(4, { audio: true });   // (the leader knocked out on the road: a wreck, rolling to a stop, the two behind it)
    for (let i = 0; i < 160 && !VIEW.near(V[1].pos, 0); i++) { GUNSHIP.track(V[1].pos); __t.sim(0.05, { audio: true }); }   // (the sensor on them: a hit out of the frame scatters nobody)
    const at = V.slice(1).map(v => v.pos.clone()); BATTLE.strike(V[1].pos.clone(), 3, 0, WEAPON.g25, false);
    __t.sim(10, { audio: true });
    const went = V.slice(1).map((v, i) => Math.hypot(v.pos.x - at[i].x, v.pos.z - at[i].z));
    let held = null; for (let i = 0; i < 600 && !held; i++) { __t.sim(0.05, { audio: true }); for (const v of V.slice(1)) { const F = BATTLE.cols.find(e => e.col.u.includes(v)); if (F && F.scat > T && !F.scatHold && !F.move && T > F.scT) held = v; } }   // (holding its spot, 15 s after it scattered)
    if (!held) return { went, again: null };
    for (let i = 0; i < 160 && !(i >= 40 && VIEW.near(held.pos, 0)); i++) { GUNSHIP.track(held.pos); __t.sim(0.05, { audio: true }); }   // (the sensor on it: only one hit in the frame scatters; 2 s at least, up to 8 from 230 m off)
    const seen = VIEW.near(held.pos, 0), h0 = held.pos.clone(); BATTLE.strike(held.pos.clone(), 3, 0, WEAPON.g25, false); __t.sim(8, { audio: true });
    return { went, seen, again: Math.hypot(held.pos.x - h0.x, held.pos.z - h0.z), wrecked: !V[0].alive };
  });
  console.log(JSON.stringify(r));
  expect(r, 'a road in the frame with room round it').not.toBeNull();
  expect(r.wrecked).toBe(true);
  for (const d of r.went) expect(d, 'each of the two behind the wreck got away from where it was hit (m in 10 s)').toBeGreaterThan(20);
  expect(r.seen, 'the sensor got to the one holding its spot (a hit out of the frame scatters nobody)').toBe(true);
  expect(r.again, 'hit again while holding its spot: off again (m in 8 s)').toBeGreaterThan(12);
});

test('the helicopters fight over the frame: in it, and rocket runs at what is in it', async ({ wp }) => {
  test.setTimeout(240000);
  const out = [];
  for (const seed of [11, 3]) {
    await wp.boot({ query: `?hour=12&seed=${seed}&transit=0` });
    out.push(await wp.run(() => {
      let n = 0, inF = 0, runsF = 0, runs = 0; const s0 = BATTLE.salvo.bind(BATTLE);
      BATTLE.salvo = (h, t) => { const ok = s0(h, t); if (ok) { runs++; if (VIEW.near(t.pos, 40)) runsF++; } return ok; };
      for (let i = 0; i < 12000; i++) { __t.sim(0.05, { audio: true }); if (i % 10 || i < 200) continue; n++; if (BATTLE.helis.some(h => h.alive && BATTLE.inFrame(h.pos))) inF++; }
      BATTLE.salvo = s0;
      return { share: inF / n, runs, runsF };
    }));
  }
  console.log(JSON.stringify(out));
  expect((out[0].share + out[1].share) / 2, 'an enemy helicopter in the frame (share of the time; was 0–3 %)').toBeGreaterThan(0.04);
  for (const r of out) expect(r.runsF, 'rocket runs at targets by the frame').toBeGreaterThan(0);
});

test('vehicles by the frame do not jitter left and right', async ({ wp }) => {
  test.setTimeout(240000);
  const out = [];
  for (const seed of [11, 3]) {
    await wp.boot({ query: `?hour=12&seed=${seed}&transit=0` });
    out.push(await wp.run(() => {
      const st = new Map(); let win = 0, jit = 0;
      for (let i = 0; i < 3000; i++) {
        __t.sim(0.05, { audio: true });
        for (const u of UNITS) {
          if (!(u instanceof Vehicle) || !u.alive || !VIEW.near(u.pos, 0)) continue;
          let s = st.get(u); if (!s) st.set(u, s = { yaw: u.yaw, yr: 0, acc: 0, fl: [], w0: T, jit: false });
          const yr = angleWrap(u.yaw - s.yaw); s.yaw = u.yaw;
          if (Math.abs(yr) > 0.002 && T >= (u.weaveUntil || 0)) {   // (a swerve under fire is meant: kerb to kerb every 2 s)
            if (s.yr && Math.sign(yr) !== Math.sign(s.yr)) { if (Math.abs(s.acc) > 0.03) { s.fl.push(T); while (s.fl[0] < T - 3) s.fl.shift(); if (s.fl.length >= 3) s.jit = true; } s.acc = 0; }
            s.acc += yr; s.yr = yr;
          }
          if (T - s.w0 >= 3) { win++; if (s.jit) jit++; s.w0 = T; s.jit = false; }
        }
      }
      return { win, jit };
    }));
  }
  console.log(JSON.stringify(out));
  // the nose turning one way and the other three times in 3 s, each by over 0.03 rad: 25–45 % of the 3 s windows before (a lat
  // measured from the nose, a shove against a drive round, a rate aside that overshot, the staircase of a way's cells); 0–18 % now
  const win = out[0].win + out[1].win, jit = out[0].jit + out[1].jit;
  expect(win).toBeGreaterThan(40);
  expect(jit / win, 'share of 3 s windows a vehicle by the frame jitters').toBeLessThan(0.15);
  for (const r of out) expect(r.jit / Math.max(1, r.win), 'on either map').toBeLessThan(0.25);
});
