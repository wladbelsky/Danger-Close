// The layout: towns joined by roads, nothing standing on anything else, grades, water, ribbons on the ground, determinism
const { test, expect } = require('./support/harness');
const SEEDS = [3, 11, 29, 47];

for (const seed of SEEDS) test(`layout invariants, seed ${seed}`, async ({ wp }) => {
  await wp.boot({ query: `?hour=12&seed=${seed}` });
  const r = await wp.run(() => {
    const out = {};
    // every town reaches every other one along the roads (pieces join where their samples come within 9 m)
    const roads = LAYOUT.roads, parent = roads.map((_, i) => i), find = i => parent[i] === i ? i : (parent[i] = find(parent[i])), cell = new Map(), key = (x, z) => Math.floor(x / 12) + ',' + Math.floor(z / 12);
    roads.forEach((r, i) => r.pts.forEach(p => { const k = key(p[0], p[1]); (cell.get(k) || cell.set(k, []).get(k)).push([i, p]); }));
    roads.forEach((r, i) => r.pts.forEach(p => { for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (const [j, q] of cell.get(key(p[0] + dx * 12, p[1] + dz * 12)) || []) if (Math.hypot(p[0] - q[0], p[1] - q[1]) < 9) parent[find(i)] = find(j); }));
    out.townComps = new Set(LAYOUT.towns.map(t => { let best = null, d = 1e9; roads.forEach((r, i) => { if (r.kind === 'track') return; for (const p of r.pts) { const e = Math.hypot(p[0] - t.x, p[1] - t.z); if (e < d) { d = e; best = i; } } }); return d < t.R ? find(best) : -1; })).size;
    out.townNoRoad = LAYOUT.towns.length && out.townComps === 1 ? 0 : 1;
    // buildings: on no road, rail or water, not on each other
    const B = LAYOUT.buildings, inside = (b, x, z) => { const dx = x - b.x, dz = z - b.z, c = Math.cos(b.a), s = Math.sin(b.a); return Math.abs(dx * c + dz * s) < b.w / 2 - 0.2 && Math.abs(-dx * s + dz * c) < b.d / 2 - 0.2; };
    out.onRoad = 0; out.overlap = 0;
    const pts = b => { const o = [], c = Math.cos(b.a), s = Math.sin(b.a); for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) { const u = (i / 4 - 0.5) * (b.w - 0.6), v = (j / 4 - 0.5) * (b.d - 0.6); o.push([b.x + u * c - v * s, b.z + u * s + v * c]); } return o; };
    for (const b of B) for (const [x, z] of pts(b)) {
      for (const r of roads) { const K = ROAD_KINDS[r.kind]; for (let i = 0; i < r.pts.length - 1; i++) if (segDist(x, z, r.pts[i][0], r.pts[i][1], r.pts[i + 1][0], r.pts[i + 1][1]) < K.w / 2) { out.onRoad++; break; } }
      if (LAYOUT.rail) for (let i = 0; i < LAYOUT.rail.pts.length - 1; i++) if (segDist(x, z, ...LAYOUT.rail.pts[i], ...LAYOUT.rail.pts[i + 1]) < 2.5) { out.onRoad++; break; }
      if (waterAt(x, z) === 1 || waterAt(x, z) === 2) out.onRoad++;
      for (const o of B) if (o !== b && Math.hypot(o.x - b.x, o.z - b.z) < 60 && inside(o, x, z)) out.overlap++;
    }
    // trees: none on what is used
    out.trees = 0; const m = new THREE.Matrix4();
    for (const v of TERRAIN.veg) for (let i = 0; i < v.count; i++) { v.getMatrixAt(i, m); const x = m.elements[12], z = m.elements[14], o = occAt(x, z); if ((o & (OCC_ROAD | OCC_RAIL | OCC_BUILD | OCC_FIELD | OCC_WATER)) || waterAt(x, z) === 1) out.trees++; }
    // grades along the draped centre lines (8 m steps; bridges at their deck)
    out.roadGrade = 0; out.railGrade = 0;
    const grade = (r, y) => { let g = 0; for (let i = 2; i < r.pts.length; i += 2) { const a = r.pts[i - 2], b = r.pts[i]; g = Math.max(g, Math.abs(y(i, b) - y(i - 2, a)) / Math.hypot(b[0] - a[0], b[1] - a[1])); } return g; };
    for (const r of roads) out.roadGrade = Math.max(out.roadGrade, grade(r, (i, p) => r.br[i] ? r.h[i] : groundH(p[0], p[1])));
    if (LAYOUT.rail) { const r = LAYOUT.rail; out.railGrade = grade(r, (i, p) => r.br[i] ? r.h[i] : groundH(p[0], p[1])); }
    // ribbons never dip under the ground between their vertices (halfway along and at the edges)
    out.under = 0;
    for (const r of roads) { const K = ROAD_KINDS[r.kind]; for (let i = 0; i < r.pts.length - 1; i++) { if (r.br[i] || r.br[i + 1]) continue; const a = r.pts[i], b = r.pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L;
      for (const o of [-K.w / 2, 0, K.w / 2]) { const ya = roadY(a[0] + nx * o, a[1] + nz * o), yb = roadY(b[0] + nx * o, b[1] + nz * o), mx = (a[0] + b[0]) / 2 + nx * o, mz = (a[1] + b[1]) / 2 + nz * o; if ((ya + yb) / 2 - groundH(mx, mz) < -0.02) out.under++; } } }
    // lakes: the water stands below the shore all round
    out.leak = 0; for (const L of LAYOUT.lakes) for (let k = 0; k < 72; k++) { const a = k / 72 * TAU, r = L.shape(a) + 4, x = L.x + Math.cos(a) * r, z = L.z + Math.sin(a) * r; if (waterAt(x, z) >= 2) continue; if (groundH(x, z) < L.W + 0.02) out.leak++; }   // (where the river leaves it, the water goes on)
    // the platform runs along the track: both its ends at the same distance from the line
    out.platform = 0; const S = LAYOUT.station;
    if (S) for (const sg of S.segs) for (const e of [-sg.L / 2, 0, sg.L / 2]) { const x = sg.x + Math.cos(sg.a) * e, z = sg.z + Math.sin(sg.a) * e; let d = 1e9; for (const p of LAYOUT.rail.pts) d = Math.min(d, Math.hypot(p[0] - x, p[1] - z)); if (Math.abs(d - 5.2) > 0.6) out.platform++; }
    out.counts = { towns: LAYOUT.towns.length, buildings: B.length, roads: roads.length, fields: LAYOUT.fields.length, rail: !!LAYOUT.rail, station: !!LAYOUT.station };
    return out;
  });
  expect(r.townNoRoad, `towns in ${r.townComps} road networks`).toBe(0);
  expect(r.onRoad, 'building points on roads / rail / water').toBe(0);
  expect(r.overlap, 'building points inside another building').toBe(0);
  expect(r.trees, 'trees on roads, rail, buildings, fields or water').toBe(0);
  expect(r.roadGrade).toBeLessThan(0.2);
  expect(r.railGrade).toBeLessThan(0.04);
  expect(r.under, 'road ribbon points under the ground').toBe(0);
  expect(r.platform, 'platform points off their distance from the track').toBe(0);
  expect(r.leak, 'lake shore points below the water').toBe(0);
  expect(r.counts.towns).toBeGreaterThanOrEqual(3);
  expect(r.counts.buildings).toBeGreaterThan(100);
  expect(r.counts.rail).toBe(true);
  expect(r.counts.station).toBe(true);
});

test('the layout repeats for a seed', async ({ wp }) => {
  await wp.boot({ query: '?hour=12&seed=13' });
  const sig = () => wp.run(() => [MAP.hash(), LAYOUT.buildings.length, LAYOUT.roads.length, LAYOUT.fields.length, Math.round(LAYOUT.buildings[0].x * 100)].join(':'));
  const a = await sig();
  await wp.goto('?hour=12&seed=13');
  expect(await sig()).toBe(a);
});

test('the world builds within the time limit', async ({ wp }) => {
  await wp.boot({ query: '?hour=12&seed=17' });
  expect(await wp.run(() => MAP.genMs)).toBeLessThan(8000);
});
