// Units and the allies' patrols: garrisons, nobody in water or walls, vehicles on the roads, columns keep their gaps,
// the patrol cycle, the helicopters' round, the models' sizes
const { test, expect } = require('./support/harness');

for (const seed of [3, 11, 29]) test(`the allies patrol without standing in water or walls, seed ${seed}`, async ({ wp }) => {
  await wp.boot({ query: `?hour=12&seed=${seed}&transit=0` });
  const r = await wp.run(() => {
    const out = { posts: ALLIES.posts.length, wet: 0, inWall: 0, offRoad: 0, close: 1e9, lowHeli: 0, states: new Set(), heli: new Set(), soldiers: INF.list.length, maxV: 0 };
    const V = ALLIES.posts.flatMap(p => p.col.u);
    for (let s = 0; s < 9000; s++) {   // 450 s
      __t.sim(0.05);
      for (const P of ALLIES.posts) out.states.add(P.state);
      for (const h of ALLIES.helis) out.heli.add(h.state);
      if (s % 10) continue;
      for (const v of V) {
        const p = v.obj.position, o = occAt(p.x, p.z), w = waterAt(p.x, p.z), deck = p.y > groundH(p.x, p.z) + 0.3;
        if ((w === 1 || w === 2) && !deck) out.wet++;
        if (o & OCC_BUILD) out.inWall++;
        if (!(o & OCC_YARD) && ROADNET.nearest(p.x, p.z, 22) < 0   /* (the gate is ~20 m from the road) */) out.offRoad++;
        out.maxV = Math.max(out.maxV, v.v);
      }
      for (const P of ALLIES.posts) { const U = P.col.u; for (let i = 0; i < U.length; i++) for (let j = i + 1; j < U.length; j++) { const d = U[i].obj.position.distanceTo(U[j].obj.position); if (d < out.close) { out.close = d; out.when = [P.state, s, U.map(v => v.s.toFixed(1) + '/' + v.v.toFixed(1)).join(' '), P.col.path.L.toFixed(0)]; } } }
      for (const sd of INF.list) { const p = sd.position, w = waterAt(p.x, p.z); if (w === 1 || w === 2 || (occAt(p.x, p.z) & OCC_WATER)) out.wet++; if (occAt(p.x, p.z) & OCC_BUILD) out.inWall++; }
      for (const h of ALLIES.helis) if (h.state === 'fly' && h.pos.y - groundH(h.pos.x, h.pos.z) < 20) out.lowHeli++;
    }
    out.states = [...out.states].sort(); out.heli = [...out.heli].sort(); return out;
  });
  expect(r.posts).toBeGreaterThanOrEqual(2);
  expect(r.soldiers).toBeGreaterThanOrEqual(8);
  expect(r.wet, 'unit samples in water').toBe(0);
  expect(r.inWall, 'unit samples inside walls or buildings').toBe(0);
  expect(r.offRoad, 'vehicle samples off the roads').toBe(0);
  expect(r.close, 'the closest two vehicles of a column came (m): ' + JSON.stringify(r.when)).toBeGreaterThan(6);
  expect(r.lowHeli, 'helicopter samples too low in flight').toBe(0);
  expect(r.maxV).toBeLessThan(15);
  expect(r.states).toEqual(expect.arrayContaining(['out', 'hold', 'back']));
  expect(r.heli).toEqual(expect.arrayContaining(['up', 'fly']));
});

test('a helicopter comes home and lands on its pad', async ({ wp }) => {
  await wp.boot({ query: '?hour=12&seed=11&transit=0' });
  const r = await wp.run(() => {
    const h = ALLIES.helis[0], seen = []; h.timer = 0;
    for (let s = 0; s < 20 * 400 && !(seen.includes('down') && h.state === 'pad'); s++) { __t.sim(0.05); if (seen[seen.length - 1] !== h.state) seen.push(h.state); }
    return { seen, d: Math.hypot(h.pos.x - h.pad.x, h.pos.z - h.pad.z), y: h.pos.y - h.pad.y };
  });
  expect(r.seen).toEqual(['up', 'fly', 'home', 'down', 'pad']);
  expect(r.d).toBeLessThan(1.5);
  expect(Math.abs(r.y)).toBeLessThan(0.05);
});

test('every unit model has a sensible size and goes through the sensor', async ({ wp }) => {
  await wp.boot({ query: '?hour=12&seed=11' });
  const r = await wp.run(() => {
    const out = {}, b = new THREE.Box3(), sz = new THREE.Vector3();
    for (const side of ['ally', 'enemy']) for (const [k, f] of Object.entries(UNIT_TYPES[side])) for (const build of [].concat(f)) {
      const g = build(); if (k !== 'heli') g.scale.setScalar(ARMOR_SCALE); g.updateMatrixWorld(true); b.setFromObject(g).getSize(sz);
      let raw = 0; g.traverse(o => { if (o.isMesh && o.material.onBeforeCompile !== sensorHook) raw++; });
      out[side + ':' + k + ':' + build.name] = { len: +sz.x.toFixed(1), h: +sz.y.toFixed(1), raw };
    }
    INF.add('ally', 0, 0); b.setFromObject(INF.body); out.soldier = { h: +(INF_BODY_GEO.boundingBox || (INF_BODY_GEO.computeBoundingBox(), INF_BODY_GEO.boundingBox)).max.y.toFixed(2) };
    return out;
  });
  const range = { tank: [6.5, 11], apc: [5.5, 8], car: [4.2, 6], heli: [12, 21] };
  for (const [k, v] of Object.entries(r)) {
    if (k === 'soldier') continue;
    const [lo, hi] = range[k.split(':')[1]];
    expect(v.len, k).toBeGreaterThan(lo); expect(v.len, k).toBeLessThan(hi); expect(v.raw, k).toBe(0);
  }
  expect(r.soldier.h).toBeGreaterThan(1.7); expect(r.soldier.h).toBeLessThan(1.9);
});
