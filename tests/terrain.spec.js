// The map and the terrain: determinism, gentle hills, groundH on the mesh, vegetation, seasons, no leaks
const { test, expect } = require('./support/harness');

test('the same seed gives the same map, another seed another one', async ({ wp }) => {
  await wp.boot({ query: '?hour=12&seed=7' });
  const a = await wp.run(() => MAP.hash());
  await wp.goto('?hour=12&seed=7');
  expect(await wp.run(() => MAP.hash())).toBe(a);
  await wp.goto('?hour=12&seed=8');
  expect(await wp.run(() => MAP.hash())).not.toBe(a);
});

test('seed 0 picks a random seed of its own', async ({ wp }) => {
  await wp.boot({ query: '?hour=12' });
  expect(await wp.run(() => MAP.seed)).not.toBe(0);
});

for (const seed of [3, 11, 29]) {
  test(`gentle hills and a sensible forest share, seed ${seed}`, async ({ wp }) => {
    await wp.boot({ query: `?hour=12&seed=${seed}` });
    const r = await wp.run(() => { let lo = 1e9, hi = -1e9; for (const v of MAP.h) { lo = Math.min(lo, v); hi = Math.max(hi, v); } return { slope: MAP.maxSlope(), span: hi - lo, share: MAP.forestShare, trees: TERRAIN.trees }; });
    expect(r.slope).toBeLessThan(0.3);          // no extreme mountains (under ~17 degrees)
    expect(r.span).toBeGreaterThan(8);          // but not flat either
    expect(r.span).toBeLessThan(80);
    expect(r.share).toBeGreaterThan(0.12);
    expect(r.share).toBeLessThan(0.42);
    expect(r.trees).toBeGreaterThan(5000);
  });
}

test('groundH matches the mesh within a centimetre', async ({ wp }) => {
  await wp.boot({ query: '?hour=12&seed=5' });
  const worst = await wp.run(() => {
    const ray = new THREE.Raycaster(), dn = new THREE.Vector3(0, -1, 0), o = new THREE.Vector3(); let worst = 0, misses = 0;
    for (let i = 0; i < 400; i++) {
      const x = -900 + Math.random() * 1800, z = -900 + Math.random() * 1800;
      const cx = Math.floor((x + MAP_HALF) / CHUNK_M), cz = Math.floor((z + MAP_HALF) / CHUNK_M), m = TERRAIN.chunks[cz * CHUNK_N + cx];
      ray.set(o.set(x, 500, z), dn); const hit = ray.intersectObject(m)[0];
      if (!hit) { misses++; continue; }
      worst = Math.max(worst, Math.abs(hit.point.y - groundH(x, z)));
    }
    return { worst, misses };
  });
  expect(worst.misses).toBe(0);
  expect(worst.worst).toBeLessThan(0.01);
});

test('only a few chunks and vegetation meshes are drawn', async ({ wp }) => {
  await wp.boot({ query: '?hour=12&seed=5' });
  const r = await wp.run(() => {
    renderer.info.autoReset = false; renderer.info.reset(); renderer.shadowMap.autoUpdate = false; __t.render();
    const main = renderer.info.render.calls; renderer.shadowMap.autoUpdate = true; renderer.info.reset(); __t.render();
    const all = renderer.info.render.calls; renderer.info.autoReset = true; return { main, shadow: all - main, chunks: TERRAIN.chunks.length, veg: TERRAIN.veg.length };
  });
  expect(r.chunks).toBe(256);
  expect(r.main).toBeLessThan(90);
  expect(r.shadow).toBeLessThan(70);
});

test('every kind of vegetation goes through the sensor in every season', async ({ wp }) => {
  await wp.boot({ query: '?hour=12&seed=5' });
  for (const season of ['spring', 'summer', 'autumn', 'winter']) {
    const bad = await wp.run((season) => {
      CFG.season = season; updateEnvironment(); __t.render();
      const out = []; scene.traverse(o => { if (o.isMesh && o.material.onBeforeCompile !== sensorHook && !(o.material.isShaderMaterial && o.material.uniforms.uThermal)) out.push(o.material.type); });
      return out;
    }, season);
    expect(bad).toEqual([]);
  }
});

test('changing the season keeps every tree in place and leaks nothing', async ({ wp }) => {
  await wp.boot({ query: '?hour=12&seed=5' });
  const r = await wp.run(() => {
    const snap = () => TERRAIN.veg.reduce((s, v) => { const m = new THREE.Matrix4(); v.getMatrixAt(0, m); return s + m.elements[12] * 3 + m.elements[14]; }, 0);
    CFG.season = 'summer'; updateEnvironment(); __t.render();
    const a = snap(), g0 = renderer.info.memory.geometries, t0 = renderer.info.memory.textures, n0 = TERRAIN.trees;
    for (const s of ['autumn', 'winter', 'spring', 'summer', 'autumn', 'summer']) { CFG.season = s; updateEnvironment(); __t.render(); }
    return { same: Math.abs(snap() - a) < 1e-3, g0, g1: renderer.info.memory.geometries, t0, t1: renderer.info.memory.textures, n0, n1: TERRAIN.trees };
  });
  expect(r.same).toBe(true);
  expect(r.n1).toBe(r.n0);
  expect(r.g1).toBeLessThanOrEqual(r.g0);
  expect(r.t1).toBeLessThanOrEqual(r.t0);
});

test('craters lie on the slope', async ({ wp }) => {
  await wp.boot({ query: '?hour=12&seed=5' });
  const r = await wp.run(() => {
    let best = [0, 0], s = 0; for (let i = 0; i < 400; i++) { const x = -800 + Math.random() * 1600, z = -800 + Math.random() * 1600; const n = groundN(x, z, new THREE.Vector3()); if (1 - n.y > s) { s = 1 - n.y; best = [x, z]; } }
    const it = FX.scorch.spawn(new THREE.Vector3(best[0], 0, best[1]), 4, 30); FX.scorch.update(0.05);
    const m = new THREE.Matrix4(); FX.scorch.mesh.getMatrixAt(FX.scorch.items.indexOf(it), m); const up = new THREE.Vector3(m.elements[4], m.elements[5], m.elements[6]).normalize();
    return { dot: up.dot(groundN(best[0], best[1], new THREE.Vector3())), tilt: s, lift: it.p.y - groundH(best[0], best[1]) };
  });
  expect(r.tilt).toBeGreaterThan(0.001);
  expect(r.dot).toBeGreaterThan(0.9999);
  expect(r.lift).toBeGreaterThan(0.1);
});
