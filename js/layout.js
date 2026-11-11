'use strict';
/* ===== Layout: lakes, a river, towns, the railway, roads, building lots, farms and fields =====
   Planned on the map after the heights (mapgen.js), carved into them (roads and rail get a smoothed profile, lakes a
   basin, the river a channel, lots a flat pad), rasterised into the occupancy grid OCC (2 m cells: what is where — the
   vegetation, the buildings and later the units read it) and painted into the land-use texture (fields).
   Everything comes from the map's seed (its own mulberry32). Run as a generator in slices, like the rest of the world. */
const OCC_N = 1024, OCC_CELL = 2;
const OCC_WATER = 1, OCC_ROAD = 2, OCC_RAIL = 4, OCC_BUILD = 8, OCC_YARD = 16, OCC_FIELD = 32, OCC_HEDGE = 64, OCC_NEAR = 128;   // NEAR: within ~7 m of a road's edge
const ROAD_KINDS = {
  highway: { w: 8, grade: 0.08, asphalt: 0x343537, mark: true },
  road:    { w: 6.5, grade: 0.1, asphalt: 0x343537 },
  street:  { w: 6, grade: 0.12, asphalt: 0x343537 },
  track:   { w: 3.6, grade: 0.14, asphalt: 0x5e5038, dirt: true }
};
const occI = (x, z) => { const i = Math.floor((x + MAP_HALF) / OCC_CELL), j = Math.floor((z + MAP_HALF) / OCC_CELL); return i < 0 || j < 0 || i >= OCC_N || j >= OCC_N ? -1 : j * OCC_N + i; };
function occAt(x, z) { const k = occI(x, z); return k < 0 || !LAYOUT.occ ? 0 : LAYOUT.occ[k]; }
/* the MAP grid's water flag at a world point (1 lake bed, 2 river bed, 3 river bank zone) and the water level there */
function waterAt(x, z) { const i = clamp(Math.round((x + MAP_HALF) / MAP_CELL), 0, MAP_N), j = clamp(Math.round((z + MAP_HALF) / MAP_CELL), 0, MAP_N); return MAP.water[j * MAP_V + i]; }
function waterLevelAt(x, z) { const i = clamp(Math.round((x + MAP_HALF) / MAP_CELL), 0, MAP_N), j = clamp(Math.round((z + MAP_HALF) / MAP_CELL), 0, MAP_N); return MAP.wl[j * MAP_V + i]; }

/* ---- geometry helpers on polylines [[x, z], …] ---- */
let _sd = 0, _st = 0;   // segDist results: distance and parameter
function segDist(px, pz, ax, az, bx, bz) { const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz; _st = L2 > 0 ? clamp(((px - ax) * dx + (pz - az) * dz) / L2, 0, 1) : 0; _sd = Math.hypot(px - ax - dx * _st, pz - az - dz * _st); return _sd; }
function resample(pts, step) {
  const out = [pts[0].slice()]; let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]); let s = step - carry;
    while (s <= L) { const t = s / L; out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); s += step; }
    carry = L - (s - step);
  }
  const e = pts[pts.length - 1], l = out[out.length - 1]; if (Math.hypot(e[0] - l[0], e[1] - l[1]) > step * 0.3) out.push(e.slice()); else out[out.length - 1] = e.slice();
  return out;
}
function chaikin(pts, it) { for (let k = 0; k < it; k++) { const o = [pts[0]]; for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1]; o.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); } o.push(pts[pts.length - 1]); pts = o; } return pts; }
function rdp(pts, tol) {
  if (pts.length < 3) return pts;
  let m = 0, k = 0; const a = pts[0], b = pts[pts.length - 1];
  for (let i = 1; i < pts.length - 1; i++) { const d = segDist(pts[i][0], pts[i][1], a[0], a[1], b[0], b[1]); if (d > m) { m = d; k = i; } }
  if (m <= tol) return [a, b];
  const l = rdp(pts.slice(0, k + 1), tol), r = rdp(pts.slice(k), tol); return l.slice(0, -1).concat(r);
}
function pathLen(pts) { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return s; }

/* ---- A* on a 16 m grid; cost(x0, z0, x1, z1) is a multiplier of the step length (Infinity: never) ---- */
const AG = 16, AN = MAP_HALF * 2 / AG + 1;
function astar(sx, sz, tx, tz, cost) {
  const toI = v => clamp(Math.round((v + MAP_HALF) / AG), 0, AN - 1), W = x => -MAP_HALF + x * AG;
  const s = toI(sz) * AN + toI(sx), t = toI(tz) * AN + toI(tx), g = new Float32Array(AN * AN).fill(Infinity), from = new Int32Array(AN * AN).fill(-1), done = new Uint8Array(AN * AN);
  const hk = [], hv = [], push = (k, v) => { hk.push(k); hv.push(v); let i = hk.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (hv[p] <= hv[i]) break; [hk[p], hk[i]] = [hk[i], hk[p]]; [hv[p], hv[i]] = [hv[i], hv[p]]; i = p; } };
  const pop = () => { const k = hk[0], lk = hk.pop(), lv = hv.pop(); if (hk.length) { hk[0] = lk; hv[0] = lv; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < hk.length && hv[l] < hv[m]) m = l; if (r < hk.length && hv[r] < hv[m]) m = r; if (m === i) break; [hk[m], hk[i]] = [hk[i], hk[m]]; [hv[m], hv[i]] = [hv[i], hv[m]]; i = m; } } return k; };
  const tx0 = t % AN, tz0 = (t / AN) | 0, H = (k) => Math.hypot(k % AN - tx0, ((k / AN) | 0) - tz0) * AG;
  g[s] = 0; push(s, H(s));
  while (hk.length) {
    const k = pop(); if (done[k]) continue; done[k] = 1; if (k === t) break;
    const x = k % AN, z = (k / AN) | 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue; const nx = x + dx, nz = z + dz; if (nx < 0 || nz < 0 || nx >= AN || nz >= AN) continue;
      const n = nz * AN + nx; if (done[n]) continue;
      const c = cost(W(x), W(z), W(nx), W(nz)); if (!(c < Infinity)) continue;
      const v = g[k] + Math.hypot(dx, dz) * AG * c; if (v < g[n]) { g[n] = v; from[n] = k; push(n, v + H(n)); }
    }
  }
  if (from[t] < 0 && t !== s) return null;
  const out = []; for (let k = t; k >= 0; k = from[k]) { out.push([W(k % AN), W((k / AN) | 0)]); if (k === s) break; }
  out.reverse(); out[0] = [sx, sz]; out[out.length - 1] = [tx, tz]; return out;
}

/* ---- carving into MAP.h: the strongest claim on a vertex wins (scratch arrays reused) ---- */
let CW = null, CT = null; const CTOUCH = [];
function carveStart() { if (!CW) { CW = new Float32Array(MAP_V * MAP_V); CT = new Float32Array(MAP_V * MAP_V); } }
function carveClaim(k, w, h) { if (w > CW[k]) { if (CW[k] === 0) CTOUCH.push(k); CW[k] = w; CT[k] = h; } }
function carveApply(skip) { const H = MAP.h; for (const k of CTOUCH) { if (!skip || !skip(k)) H[k] = lerp(H[k], CT[k], CW[k]); CW[k] = 0; } CTOUCH.length = 0; }
function carvePath(pts, hs, inner, outer, skip) {
  carveStart();
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - outer + MAP_HALF) / MAP_CELL)), i1 = Math.min(MAP_N, Math.ceil((Math.max(ax, bx) + outer + MAP_HALF) / MAP_CELL));
    const j0 = Math.max(0, Math.floor((Math.min(az, bz) - outer + MAP_HALF) / MAP_CELL)), j1 = Math.min(MAP_N, Math.ceil((Math.max(az, bz) + outer + MAP_HALF) / MAP_CELL));
    for (let j = j0; j <= j1; j++) for (let ii = i0; ii <= i1; ii++) {
      const d = segDist(-MAP_HALF + ii * MAP_CELL, -MAP_HALF + j * MAP_CELL, ax, az, bx, bz); if (d >= outer) continue;
      carveClaim(j * MAP_V + ii, d <= inner ? 1 : smoothstep(outer, inner, d), lerp(hs[i], hs[i + 1], _st));
    }
  }
  carveApply(skip);
}
/* a flat pad for a building lot (a rotated rectangle) */
function carveRect(cx, cz, w, d, a, h, margin) {
  carveStart(); const ca = Math.cos(a), sa = Math.sin(a), R = Math.hypot(w, d) / 2 + margin;
  const i0 = Math.max(0, Math.floor((cx - R + MAP_HALF) / MAP_CELL)), i1 = Math.min(MAP_N, Math.ceil((cx + R + MAP_HALF) / MAP_CELL)), j0 = Math.max(0, Math.floor((cz - R + MAP_HALF) / MAP_CELL)), j1 = Math.min(MAP_N, Math.ceil((cz + R + MAP_HALF) / MAP_CELL));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const x = -MAP_HALF + i * MAP_CELL - cx, z = -MAP_HALF + j * MAP_CELL - cz, u = Math.abs(x * ca + z * sa) - w / 2, v = Math.abs(-x * sa + z * ca) - d / 2, e = Math.max(u, v, 0);
    if (e < margin) carveClaim(j * MAP_V + i, smoothstep(margin, 0.5, e), h);
  }
  carveApply(k => MAP.water[k]);
}
/* a road / rail profile: the ground along it smoothed over `win` metres, its grade limited, raised over water (bridges) with ramps */
function profile(pts, win, grade, deck) {
  const n = pts.length, h0 = pts.map(p => groundH(p[0], p[1])), r = Math.max(1, Math.round(win / 8)), h = new Array(n);
  for (let i = 0; i < n; i++) { let s = 0, c = 0; for (let k = Math.max(0, i - r); k <= Math.min(n - 1, i + r); k++) { s += h0[k]; c++; } h[i] = s / c; }
  const ds = pts.length > 1 ? Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]) : 4, g = grade * ds;
  for (let it = 0; it < 80; it++) { let moved = false; for (let i = 0; i < n - 1; i++) { const d = h[i + 1] - h[i]; if (Math.abs(d) > g) { const m = (Math.abs(d) - g) / 2 * Math.sign(d); h[i] += m; h[i + 1] -= m; moved = true; } } if (!moved) break; }
  const br = pts.map(p => waterAt(p[0], p[1]) >= 2);
  for (let i = 0; i < n; i++) if (br[i]) h[i] = Math.max(h[i], waterLevelAt(pts[i][0], pts[i][1]) + deck);
  for (let i = 1; i < n; i++) h[i] = Math.max(h[i], h[i - 1] - g);
  for (let i = n - 2; i >= 0; i--) h[i] = Math.max(h[i], h[i + 1] - g);
  return { h, br };
}
function stampSeg(ax, az, bx, bz, r, flag) {
  const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - r + MAP_HALF) / OCC_CELL)), i1 = Math.min(OCC_N - 1, Math.floor((Math.max(ax, bx) + r + MAP_HALF) / OCC_CELL));
  const j0 = Math.max(0, Math.floor((Math.min(az, bz) - r + MAP_HALF) / OCC_CELL)), j1 = Math.min(OCC_N - 1, Math.floor((Math.max(az, bz) + r + MAP_HALF) / OCC_CELL));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (segDist(-MAP_HALF + (i + 0.5) * OCC_CELL, -MAP_HALF + (j + 0.5) * OCC_CELL, ax, az, bx, bz) <= r) LAYOUT.occ[j * OCC_N + i] |= flag;
}
function stampPath(pts, r, flag) { for (let i = 0; i < pts.length - 1; i++) stampSeg(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], r, flag); }
function stampRect(cx, cz, w, d, a, flag) {
  const ca = Math.cos(a), sa = Math.sin(a), R = Math.hypot(w, d) / 2;
  const i0 = Math.max(0, Math.floor((cx - R + MAP_HALF) / OCC_CELL)), i1 = Math.min(OCC_N - 1, Math.floor((cx + R + MAP_HALF) / OCC_CELL)), j0 = Math.max(0, Math.floor((cz - R + MAP_HALF) / OCC_CELL)), j1 = Math.min(OCC_N - 1, Math.floor((cz + R + MAP_HALF) / OCC_CELL));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const x = -MAP_HALF + (i + 0.5) * OCC_CELL - cx, z = -MAP_HALF + (j + 0.5) * OCC_CELL - cz; if (Math.abs(x * ca + z * sa) <= w / 2 && Math.abs(-x * sa + z * ca) <= d / 2) LAYOUT.occ[j * OCC_N + i] |= flag; }
}
/* is a rotated rectangle free of the given flags (sampled every ~2 m) and of water? */
function rectFree(cx, cz, w, d, a, mask) {
  const ca = Math.cos(a), sa = Math.sin(a), nu = Math.max(2, Math.ceil(w / 2)), nv = Math.max(2, Math.ceil(d / 2));
  for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
    const u = (i / nu - 0.5) * w, v = (j / nv - 0.5) * d, x = cx + u * ca - v * sa, z = cz + u * sa + v * ca;
    if (Math.abs(x) > MAP_HALF - 20 || Math.abs(z) > MAP_HALF - 20 || (occAt(x, z) & mask) || waterAt(x, z)) return false;
  }
  return true;
}
function rectCorners(cx, cz, w, d, a) { const ca = Math.cos(a), sa = Math.sin(a), o = []; for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) o.push([cx + u * w / 2 * ca - v * d / 2 * sa, cz + u * w / 2 * sa + v * d / 2 * ca]); return o; }

const LAYOUT = {
  occ: null, lakes: [], rivers: [], towns: [], roads: [], junctions: [], rail: null, buildings: [], fields: [], farms: [], station: null, landuse: null, ms: 0,
  *plan(seed) {
    const t0 = performance.now(), rng = this.rng = mulberry32((seed * 7 + 3) >>> 0);
    this.occ = new Uint8Array(OCC_N * OCC_N); MAP.water = new Uint8Array(MAP_V * MAP_V); MAP.wl = new Float32Array(MAP_V * MAP_V);
    Object.assign(this, { lakes: [], rivers: [], towns: [], roads: [], junctions: [], rail: null, buildings: [], fields: [], farms: [], station: null });
    this.planLakes(rng); yield;
    this.planRiver(rng); yield;
    this.planTowns(rng); yield;
    this.planRail(rng); this.planStation(); yield;
    this.planRoads(rng); yield;
    for (const t of this.towns) { this.planStreets(t, rng); yield; }
    this.planTracks(rng); yield;
    for (const t of this.towns) { this.planLots(t, rng); yield; }
    this.planFarms(rng); yield;
    for (const t of this.towns) this.planFields(t, rng);
    yield;
    this.clearForest(); this.paintLanduse();
    this.ms = performance.now() - t0;
  },
  /* lakes in the lowest spots: a basin under a level just below its rim (water never stands above the shore) */
  planLakes(rng) {
    const n = 1 + Math.floor(rng() * 2.6), cand = [];
    for (let i = 0; i < 400; i++) { const x = (rng() - 0.5) * 1560, z = (rng() - 0.5) * 1560; cand.push([groundH(x, z), x, z]); }
    cand.sort((a, b) => a[0] - b[0]);
    for (const [, x, z] of cand) {
      if (this.lakes.length >= n) break;
      if (this.lakes.some(l => Math.hypot(l.x - x, l.z - z) < 480)) continue;
      const R = lerp(55, 135, rng()), ph = rng() * 20, shape = a => R * (0.72 + 0.55 * vnoise(Math.cos(a) * 1.4 + ph, Math.sin(a) * 1.4 + ph, 3));
      let W = Infinity; for (let k = 0; k < 64; k++) { const a = k / 64 * TAU, r = shape(a) + 10; W = Math.min(W, groundH(x + Math.cos(a) * r, z + Math.sin(a) * r)); }
      W -= 0.35; const D = lerp(3, 6, rng()), H = MAP.h, Rm = R * 1.3 + 16;
      for (let j = Math.max(0, Math.floor((z - Rm + MAP_HALF) / MAP_CELL)); j <= Math.min(MAP_N, Math.ceil((z + Rm + MAP_HALF) / MAP_CELL)); j++)
        for (let i = Math.max(0, Math.floor((x - Rm + MAP_HALF) / MAP_CELL)); i <= Math.min(MAP_N, Math.ceil((x + Rm + MAP_HALF) / MAP_CELL)); i++) {
          const k = j * MAP_V + i, dx = -MAP_HALF + i * MAP_CELL - x, dz = -MAP_HALF + j * MAP_CELL - z, d = Math.hypot(dx, dz), r = shape(Math.atan2(dz, dx));
          if (d < r - 2) { H[k] = Math.min(H[k], W - 0.5 - D * (1 - (d / r) * (d / r))); MAP.water[k] = 1; MAP.wl[k] = W; }
          else if (d < r + 12) { H[k] = Math.max(H[k], W + 0.3 + Math.max(0, d - r) * 0.02); if (d < r) { MAP.water[k] = 1; MAP.wl[k] = W; } }   // (a ring above the water from 2 m inside: the shore can't dip under it between vertices)
        }
      const L = { x, z, R, W, shape }; this.lakes.push(L);
      const Rs = R * 1.3 + 4; for (let j = Math.floor((z - Rs + MAP_HALF) / OCC_CELL); j <= Math.ceil((z + Rs + MAP_HALF) / OCC_CELL); j++) for (let i = Math.floor((x - Rs + MAP_HALF) / OCC_CELL); i <= Math.ceil((x + Rs + MAP_HALF) / OCC_CELL); i++) {
        if (i < 0 || j < 0 || i >= OCC_N || j >= OCC_N) continue; const dx = -MAP_HALF + (i + 0.5) * OCC_CELL - x, dz = -MAP_HALF + (j + 0.5) * OCC_CELL - z;
        if (Math.hypot(dx, dz) < shape(Math.atan2(dz, dx)) + 3) this.occ[j * OCC_N + i] |= OCC_WATER;
      }
    }
  },
  /* a river down to the lowest point of the map's edge: out of a lake that stands above it, else from a spring in a dip
     inland; its level only ever falls, and it never needs a canyon (else no river on this map) */
  planRiver(rng) {
    if (rng() > 0.85) return;
    const E = MAP_HALF - 2; let mouth = null;
    for (let k = 0; k < 160; k++) { const s = ((k % 40) + 0.5) / 40 * 2 - 1, side = k / 40 | 0, x = [s * E, E, s * E, -E][side], z = [-E, s * E, E, s * E][side], h = groundH(x, z); if (!mouth || h < mouth[0]) mouth = [h, x, z]; }
    let L = null, sx, sz, W0;
    for (const l of this.lakes) if (l.W > mouth[0] + 3 && Math.hypot(l.x - mouth[1], l.z - mouth[2]) > 600 && (!L || l.W > L.W)) L = l;
    if (L) {
      let best = null;
      for (let k = 0; k < 32; k++) { const a = k / 32 * TAU, r = L.shape(a) + 40, h = groundH(L.x + Math.cos(a) * r, L.z + Math.sin(a) * r) + Math.hypot(L.x + Math.cos(a) * r - mouth[1], L.z + Math.sin(a) * r - mouth[2]) * 0.004; if (!best || h < best[0]) best = [h, a]; }
      sx = L.x + Math.cos(best[1]) * (L.shape(best[1]) - 6); sz = L.z + Math.sin(best[1]) * (L.shape(best[1]) - 6); W0 = L.W;
    } else {
      let best = null;
      for (let k = 0; k < 120; k++) {
        const x = (rng() - 0.5) * 1400, z = (rng() - 0.5) * 1400, h = groundH(x, z), d = Math.hypot(x - mouth[1], z - mouth[2]);
        if (d < 700 || h < mouth[0] + 4 || h > mouth[0] + 30 || waterAt(x, z) || (occAt(x, z) & OCC_WATER)) continue;
        let ring = 0; for (let a = 0; a < 8; a++) ring += groundH(x + Math.cos(a * 0.785) * 120, z + Math.sin(a * 0.785) * 120) / 8;
        const q = (h - ring) + Math.abs(h - mouth[0] - 12) * 0.2;   // a dip, not too high above the mouth
        if (!best || q < best[0]) best = [q, x, z];
      }
      if (!best) return;
      sx = best[1]; sz = best[2]; W0 = groundH(sx, sz) - 1;
    }
    const end = [0, mouth[1], mouth[2]];
    const raw = astar(sx, sz, end[1], end[2], (x0, z0, x1, z1) => { const w = waterAt(x1, z1); if ((w === 1 || (occAt(x1, z1) & OCC_WATER)) && (!L || Math.hypot(x1 - L.x, z1 - L.z) > L.R * 1.4)) return Infinity; const h1 = groundH(x1, z1), up = Math.max(0, h1 - groundH(x0, z0)); return 1 + up * 6 + Math.max(0, h1 - W0) * 0.8; });   // (along the valleys: climbing means a cut)
    if (!raw) return;
    const pts = resample(chaikin(rdp(raw, 6), 3), 4), n = pts.length, gs = pts.map(p => groundH(p[0], p[1])), lv = new Array(n);
    for (let i = 0; i < n; i++) { let s = 0, c = 0; for (let k = Math.max(0, i - 4); k <= Math.min(n - 1, i + 4); k++) { s += gs[k]; c++; } lv[i] = Math.min(i ? lv[i - 1] - 0.004 : W0, s / c - 1.6); }
    if (L) for (let i = 0; i < n; i++) if (waterAt(pts[i][0], pts[i][1]) === 1) lv[i] = Math.min(lv[i], L.W);
    let cut = 0; for (let i = 0; i < n; i++) cut = Math.max(cut, gs[i] - lv[i]);
    if (cut > 14) return;                                                          // it would need a canyon: no river on this map
    carvePath(pts, lv.map(v => v + 0.6), 9, 26 + cut * 2.5, k => MAP.water[k] === 1);   // (a deeper cut: gentler banks)
    carvePath(pts, lv.map(v => v - 1.4), 5, 8, k => MAP.water[k] === 1);
    // mark the bed (2) and the bank zone (3: roads and rail bridge it) with the level
    for (let i = 0; i < n - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], o = 26;
      for (let j = Math.max(0, Math.floor((Math.min(az, bz) - o + MAP_HALF) / MAP_CELL)); j <= Math.min(MAP_N, Math.ceil((Math.max(az, bz) + o + MAP_HALF) / MAP_CELL)); j++)
        for (let ii = Math.max(0, Math.floor((Math.min(ax, bx) - o + MAP_HALF) / MAP_CELL)); ii <= Math.min(MAP_N, Math.ceil((Math.max(ax, bx) + o + MAP_HALF) / MAP_CELL)); ii++) {
          const k = j * MAP_V + ii, d = segDist(-MAP_HALF + ii * MAP_CELL, -MAP_HALF + j * MAP_CELL, ax, az, bx, bz); if (d > 22 || MAP.water[k] === 1) continue;
          const f = d < 7.5 ? 2 : 3; if (MAP.water[k] === 0 || f < MAP.water[k]) { MAP.water[k] = f; MAP.wl[k] = lerp(lv[i], lv[i + 1], _st); }
        }
    }
    stampPath(pts, 8, OCC_WATER);
    this.rivers.push({ pts, lv });
  },
  /* towns on flat open ground away from the water; the first one is the big one (the railway goes through it) */
  planTowns(rng) {
    const n = 3 + Math.floor(rng() * 3.5), cand = [];
    for (let i = 0; i < 600; i++) {
      const x = (rng() - 0.5) * 1500, z = (rng() - 0.5) * 1500; let lo = 1e9, hi = -1e9, wet = 0, f = 0;
      for (let k = 0; k < 12; k++) { const a = k / 12 * TAU, r = k % 2 ? 60 : 120, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r, h = groundH(px, pz); lo = Math.min(lo, h); hi = Math.max(hi, h); if (waterAt(px, pz) || (occAt(px, pz) & OCC_WATER)) wet++; f += MAP.sample(MAP.forest, px, pz) / 12; }
      if (wet || waterAt(x, z)) continue;
      cand.push([hi - lo + f * 6 + rng() * 3, x, z]);
    }
    cand.sort((a, b) => a[0] - b[0]);
    for (const [, x, z] of cand) {
      if (this.towns.length >= n) break;
      if (this.towns.some(t => Math.hypot(t.x - x, t.z - z) < (this.towns.length ? 430 : 0) + 20)) continue;
      if (this.lakes.some(l => Math.hypot(l.x - x, l.z - z) < l.R * 1.3 + (this.towns.length ? 120 : 240))) continue;
      const big = !this.towns.length;
      this.towns.push({ x, z, R: big ? lerp(190, 235, rng()) : lerp(95, 140, rng()), a: rng() * Math.PI, big, name: big ? 'town' : 'village' });
    }
  },
  /* the railway: across the map from one edge to the other, past the big town (the station), gentle grades and long curves */
  planRail(rng) {
    const T = this.towns[0]; if (!T) return;
    const alongX = rng() < 0.5, o1 = lerp(-500, 500, rng()), o2 = lerp(-500, 500, rng()), E = MAP_HALF - 2;
    const a = alongX ? [-E, o1] : [o1, -E], b = alongX ? [E, o2] : [o2, E];
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz), side = rng() < 0.5 ? 1 : -1, off = T.R * 0.62;
    const wp = [T.x - dz / L * off * side, T.z + dx / L * off * side];
    const cost = (x0, z0, x1, z1) => {
      if (waterAt(x1, z1) === 1 || (occAt(x1, z1) & OCC_WATER && waterAt(x1, z1) !== 2 && waterAt(x1, z1) !== 3)) return Infinity;
      const g = Math.abs(groundH(x1, z1) - groundH(x0, z0)) / Math.hypot(x1 - x0, z1 - z0);
      let c = 1 + g * g * 5000 + MAP.sample(MAP.forest, x1, z1) * 0.4 + (waterAt(x1, z1) ? 4 : 0);
      for (const t of this.towns) if (t !== T && Math.hypot(t.x - x1, t.z - z1) < t.R + 40) c += 6;
      if (Math.hypot(T.x - x1, T.z - z1) < T.R * 0.45) c += 8;
      return c;
    };
    const p1 = astar(a[0], a[1], wp[0], wp[1], cost), p2 = astar(wp[0], wp[1], b[0], b[1], cost); if (!p1 || !p2) return;
    const raw = p1.concat(p2.slice(1));
    let pts = null;
    for (const tol of [36, 20, 10, 4, 0]) { const c = resample(chaikin(rdp(raw, tol), 4), 4); if (c.every(p => waterAt(p[0], p[1]) !== 1)) { pts = c; break; } }
    if (!pts) return;
    const pr = profile(pts, 260, 0.018, 6);
    carvePath(pts, pr.h, 4.5, 22, k => MAP.water[k] >= 2);
    stampPath(pts, 5.5, OCC_RAIL);
    this.rail = { pts, h: pr.h, br: pr.br, wp };
  },
  /* add a road along pts: the parts already on a road are dropped (a crossing / joining one ends there), each new part is profiled,
     carved and stamped */
  /* the nearest point on an existing road's centre line (within lim m): a joining road ends exactly there */
  snapRoad(x, z, lim) {
    let best = null, d = lim;
    for (const r of this.roads) for (let i = 0; i < r.pts.length - 1; i++) {
      const a = r.pts[i], b = r.pts[i + 1]; if (Math.abs(a[0] - x) > lim + 8 || Math.abs(a[1] - z) > lim + 8) continue;
      if (segDist(x, z, a[0], a[1], b[0], b[1]) < d) { d = _sd; best = { x: a[0] + (b[0] - a[0]) * _st, z: a[1] + (b[1] - a[1]) * _st, w: ROAD_KINDS[r.kind].w, kind: r.kind }; }
    }
    return best;
  },
  /* add a road along pts: the parts already on a road are dropped, a part that meets one ends on its centre line (a junction),
     each new part is profiled, carved and stamped */
  addRoad(pts, kind) {
    const K = ROAD_KINDS[kind], on = pts.map(p => (occAt(p[0], p[1]) & OCC_NEAR) !== 0), pieces = [];   // (alongside one counts as on it: no road doubling another 8 m off)
    let s = -1;
    for (let i = 0; i <= pts.length; i++) {
      const free = i < pts.length && !on[i];
      if (free && s < 0) s = i;
      if (!free && s >= 0) {
        let p = pts.slice(s, i);
        const a = s > 0 ? this.snapRoad(pts[s - 1][0], pts[s - 1][1], 20) : null, b = i < pts.length ? this.snapRoad(pts[i][0], pts[i][1], 20) : null;
        if (a) { p.unshift([a.x, a.z]); this.junctions.push({ x: a.x, z: a.z, r: Math.max(K.w, a.w) / 2 + 0.4, paved: !K.dirt && !ROAD_KINDS[a.kind].dirt }); }
        if (b) { p.push([b.x, b.z]); this.junctions.push({ x: b.x, z: b.z, r: Math.max(K.w, b.w) / 2 + 0.4, paved: !K.dirt && !ROAD_KINDS[b.kind].dirt }); }
        if (pathLen(p) >= 20) pieces.push(resample(p, 4));
        s = -1;
      }
    }
    for (const p of pieces) {
      const pr = profile(p, kind === 'street' ? 28 : 40, K.grade, 4.5);
      carvePath(p, pr.h, K.w / 2 + 1.5, K.w / 2 + 11, k => MAP.water[k] >= 2 || (occAt(-MAP_HALF + (k % MAP_V) * MAP_CELL, -MAP_HALF + ((k / MAP_V) | 0) * MAP_CELL) & (OCC_RAIL | OCC_ROAD)));   // (never re-carve another road: a junction keeps both levels)
      stampPath(p, K.w / 2 + 2, OCC_ROAD); stampPath(p, K.w / 2 + 7, OCC_NEAR);
      this.roads.push({ kind, pts: p, h: pr.h, br: pr.br });
    }
  },
  roadCost(x0, z0, x1, z1) {
    const w = waterAt(x1, z1); if (w === 1 || ((occAt(x1, z1) & OCC_WATER) && w < 2) || (occAt(x1, z1) & OCC_BUILD)) return Infinity;   // (the station and farms: never through them)
    const g = Math.abs(groundH(x1, z1) - groundH(x0, z0)) / Math.hypot(x1 - x0, z1 - z0), o = occAt(x1, z1);
    let rail = 0; for (const [dx, dz] of [[0, 0], [9, 0], [-9, 0], [0, 9], [0, -9]]) if (occAt(x1 + dx, z1 + dz) & OCC_RAIL) rail++;   // (crossing the line is fine, running along it is not)
    return (o & OCC_NEAR ? 0.35 : 1) * (1 + g * g * 900 + MAP.sample(MAP.forest, x1, z1) * 0.8 + (w ? 4 : 0) + rail * 6);
  },
  route(ax, az, bx, bz) {
    const raw = astar(ax, az, bx, bz, (x0, z0, x1, z1) => this.roadCost(x0, z0, x1, z1)); if (!raw) return null;
    for (const tol of [8, 4, 0]) { const c = resample(chaikin(rdp(raw, tol), 3), 4); if (c.every(p => waterAt(p[0], p[1]) !== 1)) return c; }
    return null;
  },
  /* towns joined by a spanning tree (and one more link), two roads out to the map's edge; the big town's way out is the highway */
  planRoads(rng) {
    const T = this.towns, inT = [T[0]], out = T.slice(1), edges = [];
    while (out.length) { let best = null; for (const a of inT) for (const b of out) { const d = Math.hypot(a.x - b.x, a.z - b.z); if (!best || d < best[0]) best = [d, a, b]; } edges.push([best[1], best[2]]); inT.push(best[2]); out.splice(out.indexOf(best[2]), 1); }
    if (T.length >= 4) { const a = T[1 + Math.floor(rng() * (T.length - 1))], b = T[Math.floor(rng() * T.length)]; if (a !== b && !edges.some(e => (e[0] === a && e[1] === b) || (e[0] === b && e[1] === a))) edges.push([a, b]); }
    const E = MAP_HALF - 2, edgePt = (t, ang) => { const c = Math.cos(ang), s = Math.sin(ang), k = E / Math.max(Math.abs(c), Math.abs(s)); return [clamp(t.x + c * k * 2, -E, E), clamp(t.z + s * k * 2, -E, E)]; };
    const hw = edgePt(T[0], rng() * TAU), p = this.route(T[0].x, T[0].z, hw[0], hw[1]); if (p) this.addRoad(p, 'highway');
    for (const [a, b] of edges) { const q = this.route(a.x, a.z, b.x, b.z); if (q) this.addRoad(q, 'road'); }
    const t2 = T[T.length - 1], e2 = edgePt(t2, Math.atan2(t2.z, t2.x) + lerp(-0.6, 0.6, rng())), q = this.route(t2.x, t2.z, e2[0], e2[1]); if (q) this.addRoad(q, 'road');
  },
  /* a street grid in the town's own direction, clipped to its (ragged) edge */
  planStreets(t, rng) {
    const ca = Math.cos(t.a), sa = Math.sin(t.a), sp = t.big ? lerp(62, 78, rng()) : lerp(70, 90, rng()), n = t.big ? 2 : 1;
    const lines = [];
    for (let k = -n; k <= n; k++) { if (!t.big && k && rng() < 0.5) continue; lines.push([k * sp, 0]); if (t.big || rng() < 0.6) lines.push([k * sp, 1]); }
    for (const [o, axis] of lines) {
      const ux = axis ? -sa : ca, uz = axis ? ca : sa, nx = -uz, nz = ux, half = Math.sqrt(Math.max(0, t.R * t.R * 0.92 - o * o)); if (half < 40) continue;
      const pts = []; for (let s = -half; s <= half; s += 4) { const x = t.x + ux * s + nx * o, z = t.z + uz * s + nz * o; pts.push([x, z]); }
      // split where it would cross water
      let run = [];
      const crossOk = this.railCrossing(ux, uz);   // a level crossing where the street meets the line squarely enough; else it ends there
      for (const p of pts) { if (waterAt(p[0], p[1]) || (occAt(p[0], p[1]) & (OCC_WATER | OCC_BUILD)) || ((occAt(p[0], p[1]) & OCC_RAIL) && !crossOk(p[0], p[1]))) { if (run.length > 6) this.addRoad(run, 'street'); run = []; } else run.push(p); }
      if (run.length > 6) this.addRoad(run, 'street');
    }
  },
  /* a test for a street of direction (ux, uz): does it cross the line at a point at more than ~40 degrees? */
  railCrossing(ux, uz) {
    const R = this.rail;
    return (x, z) => {
      if (!R) return false; let k = 0, d = 1e9; for (let i = 0; i < R.pts.length; i++) { const e = Math.hypot(R.pts[i][0] - x, R.pts[i][1] - z); if (e < d) { d = e; k = i; } }
      const a = R.pts[Math.max(0, k - 1)], b = R.pts[Math.min(R.pts.length - 1, k + 1)], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      return !R.br[k] && Math.abs(ux * (b[1] - a[1]) / L - uz * (b[0] - a[0]) / L) > 0.64;
    };
  },
  /* lots along the town's roads and streets: apartments and shops in a big town's core, houses, sheds and barns further out */
  planLots(t, rng) {
    for (const r of this.roads) {
      if (r.kind === 'track') continue; const K = ROAD_KINDS[r.kind], P = r.pts;
      for (const side of [-1, 1]) {
        let s = rng() * 8;
        for (let i = 1; i < P.length - 1; ) {
          const [x, z] = P[i], dist = Math.hypot(x - t.x, z - t.z), ragged = t.R * (0.86 + 0.24 * vnoise(Math.atan2(z - t.z, x - t.x) * 2 + t.x, 1.3, 5));
          if (dist > ragged || r.br[i]) { i++; continue; }
          const dx = P[i + 1][0] - P[i - 1][0], dz = P[i + 1][1] - P[i - 1][1], L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L, nx = -uz * side, nz = ux * side, core = dist / t.R;
          let b;
          const q = rng(), house = () => ({ type: 'house', w: lerp(8, 12.5, rng()), d: lerp(7, 10, rng()), floors: rng() < 0.3 ? 2 : 1 });
          if (t.big && core < 0.42 && q < 0.5) b = { type: 'flats', w: lerp(22, 40, rng()), d: lerp(11, 13.5, rng()), floors: 4 + Math.floor(rng() * 6) };
          else if (t.big && core < 0.55 && q < 0.72) b = { type: 'shop', w: lerp(12, 22, rng()), d: lerp(10, 14, rng()), floors: 1 + Math.floor(rng() * 2) };
          else if (core > 0.7 && q < 0.12) b = { type: 'barn', w: lerp(14, 22, rng()), d: lerp(10, 14, rng()), floors: 1 };
          else if (q > 0.93) b = { type: 'shed', w: lerp(5, 8, rng()), d: lerp(5, 7, rng()), floors: 1 };
          else b = house();
          const a = Math.atan2(uz, ux), fits = b => { const sb = K.w / 2 + (b.type === 'flats' ? 9 : lerp(4, 8, rng())); b.cx = x + nx * (sb + b.d / 2); b.cz = z + nz * (sb + b.d / 2); const cs = rectCorners(b.cx, b.cz, b.w, b.d, a).map(c => groundH(c[0], c[1])); b.lo = Math.min(...cs); b.hi = Math.max(...cs); return b.hi - b.lo < 3.5 && rectFree(b.cx, b.cz, b.w + 3, b.d + 3, a, OCC_ROAD | OCC_RAIL | OCC_WATER | OCC_BUILD); };
          let ok = fits(b); if (!ok && b.type !== 'house') ok = fits(b = house());   // a big one that doesn't fit: a house instead
          const cx = b.cx, cz = b.cz, lo = b.lo, hi = b.hi;
          if (ok) {
            const h = (lo + hi) / 2; carveRect(cx, cz, b.w, b.d, a, h, 3);
            Object.assign(b, { x: cx, z: cz, a, y: h, town: t, roof: rng(), tint: rng(), seed: rng() });
            this.buildings.push(b); stampRect(cx, cz, b.w + 2, b.d + 2, a, OCC_BUILD); stampRect(cx - nx * 2, cz - nz * 2, b.w + 6, b.d + 10, a, OCC_YARD);
            i += Math.max(1, Math.round((b.w + lerp(3, 9, rng())) / 4));
          } else i++;
        }
      }
    }
  },
  /* the station beside the line at the big town: a platform and a building */
  planStation() {
    const R = this.rail; if (!R) return;
    let k0 = 0, best = 1e9; for (let i = 0; i < R.pts.length; i++) { const d = Math.hypot(R.pts[i][0] - R.wp[0], R.pts[i][1] - R.wp[1]); if (d < best) { best = d; k0 = i; } }
    const t = this.towns[0], P = R.pts;
    // the nearest place along the line (either side, the town's side first) where the platform and the building stand on free ground
    for (let step = 0; step < 60; step++) {
      const k = clamp(k0 + (step % 2 ? 1 : -1) * Math.ceil(step / 2) * 3, 10, P.length - 11);
      const dx = P[k + 1][0] - P[k - 1][0], dz = P[k + 1][1] - P[k - 1][1], L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L, a = Math.atan2(uz, ux);
      const town = Math.sign((t.x - P[k][0]) * -uz + (t.z - P[k][1]) * ux) || 1;
      for (const sgn of [town, -town]) {
        const nx = -uz * sgn, nz = ux * sgn, S = { x: P[k][0] + nx * 5.2, z: P[k][1] + nz * 5.2, a, y: R.h[k], nx, nz, bx: P[k][0] + nx * 15, bz: P[k][1] + nz * 15 };
        if (R.br.slice(k - 10, k + 11).some(Boolean)) continue;
        if (!rectFree(S.x - nx * 4, S.z - nz * 4, 96, 14, a, OCC_ROAD | OCC_BUILD | OCC_WATER) || !rectFree(S.bx, S.bz, 20, 11, a, OCC_ROAD | OCC_BUILD | OCC_WATER | OCC_RAIL)) continue;
        this.station = S;
        carveRect(S.bx, S.bz, 18, 9, a, S.y, 4); stampRect(S.x - nx * 4, S.z - nz * 4, 96, 14, a, OCC_BUILD);   // the platform, both tracks and a clearance: no crossing or road next to it stampRect(S.bx, S.bz, 20, 12, a, OCC_BUILD);
        return;
      }
    }
  },
  /* farmsteads along the roads outside the towns: a house, a barn, a silo, a shed round a yard */
  planFarms(rng) {
    const want = 3 + Math.floor(rng() * 4);
    for (let tries = 0; tries < 300 && this.farms.length < want; tries++) {
      const r = this.roads[Math.floor(rng() * this.roads.length)]; if (!r || r.kind === 'street') continue;
      const i = 2 + Math.floor(rng() * (r.pts.length - 4)), [x, z] = r.pts[i];
      if (this.towns.some(t => Math.hypot(t.x - x, t.z - z) < t.R + 140) || this.farms.some(f => Math.hypot(f.x - x, f.z - z) < 300)) continue;
      const dx = r.pts[i + 1][0] - r.pts[i - 1][0], dz = r.pts[i + 1][1] - r.pts[i - 1][1], L = Math.hypot(dx, dz), side = rng() < 0.5 ? 1 : -1, nx = -dz / L * side, nz = dx / L * side, a = Math.atan2(dz, dx);
      const cx = x + nx * (ROAD_KINDS[r.kind].w / 2 + 26), cz = z + nz * (ROAD_KINDS[r.kind].w / 2 + 26), cs = rectCorners(cx, cz, 46, 40, a).map(c => groundH(c[0], c[1]));
      if (Math.max(...cs) - Math.min(...cs) > 4 || !rectFree(cx, cz, 50, 44, a, OCC_ROAD | OCC_RAIL | OCC_WATER | OCC_BUILD)) continue;
      const h = cs.reduce((s, v) => s + v, 0) / 4, ca = Math.cos(a), sa = Math.sin(a), at = (u, v) => [cx + u * ca - v * sa, cz + u * sa + v * ca];
      carveRect(cx, cz, 46, 40, a, h, 6);
      const f = { x: cx, z: cz, a, y: h }; this.farms.push(f);
      const put = (type, u, v, w, d, extra) => { const [px, pz] = at(u, v); this.buildings.push(Object.assign({ type, x: px, z: pz, a, y: h, w, d, floors: 1, roof: rng(), tint: rng(), seed: rng(), farm: f }, extra)); stampRect(px, pz, w + 2, d + 2, a, OCC_BUILD); };
      put('house', -12, -12, 10, 8, { floors: rng() < 0.5 ? 2 : 1 }); put('barn', 8, 2, 20, 12); put('silo', -14, 10, 6, 6); put('shed', -2, 14, 7, 6);
      stampRect(cx, cz, 50, 44, a, OCC_YARD);
      const lane = resample([[x + nx * ROAD_KINDS[r.kind].w * 0.3, z + nz * ROAD_KINDS[r.kind].w * 0.3], [cx - nx * 19, cz - nz * 19]], 4); this.addRoad(lane, 'track');   // (to the yard's edge)
    }
  },
  /* dirt tracks off the roads into the fields and the forests (dead ends) */
  planTracks(rng) {
    for (let k = 0, made = 0; k < 40 && made < 4; k++) {
      const r = this.roads[Math.floor(rng() * this.roads.length)]; if (!r || r.kind === 'track' || r.kind === 'street') continue;
      const [x, z] = r.pts[Math.floor(rng() * r.pts.length)], a = rng() * TAU, L = lerp(220, 520, rng()), tx = clamp(x + Math.cos(a) * L, -900, 900), tz = clamp(z + Math.sin(a) * L, -900, 900);
      if (this.towns.some(t => Math.hypot(t.x - tx, t.z - tz) < t.R + 60) || waterAt(tx, tz) || (occAt(tx, tz) & OCC_WATER)) continue;
      const p = this.route(x, z, tx, tz); if (!p || pathLen(p) < 150) continue;
      this.addRoad(p, 'track'); made++;
    }
  },
  /* fields round a town: a grid in the town's direction, cells on free, open, flat ground; a hedge on some edges */
  planFields(t, rng) {
    const ca = Math.cos(t.a), sa = Math.sin(t.a), cw = lerp(70, 125, rng()), ch = lerp(55, 100, rng()), ext = t.R + 380, ni = Math.ceil(ext / cw), nj = Math.ceil(ext / ch);
    for (let i = -ni; i <= ni; i++) for (let j = -nj; j <= nj; j++) {
      const u = i * cw, v = j * ch, cx = t.x + u * ca - v * sa, cz = t.z + u * sa + v * ca, d = Math.hypot(cx - t.x, cz - t.z);
      if (d < t.R * 0.9 || d > ext || rng() > 0.85) continue;
      const w = cw - 5, h = ch - 5;
      if (!rectFree(cx, cz, w + 4, h + 4, t.a, OCC_ROAD | OCC_RAIL | OCC_WATER | OCC_BUILD | OCC_FIELD | OCC_YARD)) continue;
      let f = 0, lo = 1e9, hi = -1e9; for (const [x, z] of rectCorners(cx, cz, w, h, t.a).concat([[cx, cz]])) { f += MAP.sample(MAP.forest, x, z) / 5; const g = groundH(x, z); lo = Math.min(lo, g); hi = Math.max(hi, g); }
      if (f > 0.35 || hi - lo > 9) continue;
      const fl = { x: cx, z: cz, w, h, a: t.a, crop: rng(), dir: rng() < 0.5 ? t.a : t.a + Math.PI / 2 };
      this.fields.push(fl); stampRect(cx, cz, w, h, t.a, OCC_FIELD);
      for (const [eu, ev, ew, eh] of [[0, -h / 2 - 2.5, w, 2], [0, h / 2 + 2.5, w, 2], [-w / 2 - 2.5, 0, 2, h], [w / 2 + 2.5, 0, 2, h]]) if (rng() < 0.35) stampRect(cx + eu * ca - ev * sa, cz + eu * sa + ev * ca, ew, eh, t.a, OCC_HEDGE);
    }
  },
  /* no forest where the land is used (the ground's mask and the trees both read MAP.forest) */
  clearForest() {
    const F = MAP.forest;
    for (let j = 0, k = 0; j < MAP_V; j++) for (let i = 0; i < MAP_V; i++, k++) {
      if (F[k] === 0) continue; const x = -MAP_HALF + i * MAP_CELL, z = -MAP_HALF + j * MAP_CELL;
      if (MAP.water[k] === 1 || MAP.water[k] === 2 || (occAt(x, z) & (OCC_FIELD | OCC_BUILD | OCC_YARD | OCC_WATER)) || this.towns.some(t => Math.hypot(t.x - x, t.z - z) < t.R + 20)) F[k] = 0;
    }
  },
  /* the land-use texture (2 m a texel): fields as rgb(coverage, stripe angle, crop) — the shader divides g and b by r, so an
     edge's blend keeps its own crop instead of sliding into another one */
  paintLanduse() {
    const c = this.landuse || (this.landuse = document.createElement('canvas')); c.width = c.height = OCC_N;
    const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, OCC_N, OCC_N);
    for (const f of this.fields) {
      const ang = (((f.dir % Math.PI) + Math.PI) % Math.PI) / Math.PI;
      g.save(); g.translate((f.x + MAP_HALF) / OCC_CELL, (f.z + MAP_HALF) / OCC_CELL); g.rotate(f.a);
      g.fillStyle = `rgb(255,${Math.round(ang * 255)},${Math.round(f.crop * 255)})`; g.fillRect(-f.w / 2 / OCC_CELL, -f.h / 2 / OCC_CELL, f.w / OCC_CELL, f.h / OCC_CELL); g.restore();
    }
  },
  /* named points worth looking at (preview sheets, the camera later) */
  spots() {
    const s = {}, T = this.towns;
    if (T[0]) s.town = [T[0].x, T[0].z];
    if (T[1]) s.village = [T[1].x, T[1].z];
    if (this.station) s.station = [this.station.x, this.station.z];
    for (const r of this.roads.concat(this.rail ? [this.rail] : [])) { const i = r.br.indexOf(true); if (i >= 0 && !s.bridge) s.bridge = r.pts[i]; }
    if (this.lakes[0]) { const L = this.lakes[0]; s.lake = [L.x + L.shape(0.6) * Math.cos(0.6), L.z + L.shape(0.6) * Math.sin(0.6)]; }
    if (this.fields.length) { const f = this.fields[Math.floor(this.fields.length / 2)]; s.fields = [f.x, f.z]; }
    if (this.farms[0]) s.farm = [this.farms[0].x, this.farms[0].z];
    if (this.rail) { const P = this.rail.pts, i = Math.floor(P.length * 0.25); s.rail = P[i]; }
    return s;
  }
};
