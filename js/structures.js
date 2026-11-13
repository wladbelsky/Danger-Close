'use strict';
/* ===== Structures: water, roads, the railway, bridges, the station and the buildings (meshes for what layout.js planned) =====
   Roads and rail are ribbons draped on the carved ground (a few cm up, no depth write, drawn after it: crossings and
   junctions overlap without fighting); on a bridge they run at the profile's deck height. Each material's ribbons are one
   mesh for the whole map (tens of thousands of triangles: cheaper than the draw calls of splitting them). Buildings are
   merged per town / farm (mergeStatic): a few meshes each.                                                              */
class GeoAcc {   // non-indexed triangles with per-vertex colours (and optional uvs)
  constructor(uv) { this.p = []; this.c = []; this.uv = uv ? [] : null; }
  /* a triangle, turned so its normal points along the hint (up for ground ribbons, outward for walls) */
  tri(a, b, c, ca, cb, cc, hint, ua, ub, uc) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nx * hint[0] + ny * hint[1] + nz * hint[2] < 0) { [b, c] = [c, b]; [cb, cc] = [cc, cb]; [ub, uc] = [uc, ub]; }
    this.p.push(...a, ...b, ...c); this.c.push(...ca, ...cb, ...cc); if (this.uv) this.uv.push(...ua, ...ub, ...uc);
  }
  quad(a, b, c, d, ca, cb, cc, cd, hint, ua, ub, uc, ud) { this.tri(a, b, c, ca, cb, cc, hint, ua, ub, uc); this.tri(a, c, d, ca, cc, cd, hint, ua, uc, ud); }
  mesh(mat) {
    if (!this.p.length) return null;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    if (this.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeVertexNormals();
    return new THREE.Mesh(g, mat);
  }
}
/* a ribbon vertex's height: the highest ground within 2.5 m (+7 cm; half a junction's longest segment), so a convex bump between vertices never pokes through */
function roadY(x, z) { return Math.max(groundH(x, z), groundH(x + 2.5, z), groundH(x - 2.5, z), groundH(x, z + 2.5), groundH(x, z - 2.5)) + 0.07; }
const UP = [0, 1, 0], _rgb = new THREE.Color(), rgb = h => { _rgb.setHex(h); return [_rgb.r, _rgb.g, _rgb.b]; };   // (sRGB hex → linear)
/* a ribbon along pts: cross = [[offset, dy, colour], …] left to right; y(i, x, z) the base height; u along (metres / uScale) */
function ribbonInto(G, pts, y, cross, uScale) {
  const n = pts.length, rows = []; let dist = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L;
    if (i) dist += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    rows.push(cross.map(([o, dy, col], c) => { const x = pts[i][0] + nx * o, z = pts[i][1] + nz * o; return { v: [x, y(i, x, z) + dy, z], col: rgb(col), uv: [dist / (uScale || 1), c / (cross.length - 1)] }; }));
  }
  for (let i = 0; i < n - 1; i++) for (let c = 0; c < cross.length - 1; c++) {
    const A = rows[i][c], B = rows[i][c + 1], C = rows[i + 1][c + 1], D = rows[i + 1][c];
    G.quad(A.v, B.v, C.v, D.v, A.col, B.col, C.col, D.col, UP, A.uv, B.uv, C.uv, D.uv);
  }
}
/* ground-hugging materials: drawn after the ground, no depth write (overlaps don't fight), pulled forward by a few depth units only
   (a slope factor made the markings show through house walls with this narrow lens) */
function decalMat(o, heat, order) { const m = sensorMat(new THREE.MeshPhongMaterial(Object.assign({ vertexColors: true, shininess: 4, specular: 0x0a0a0a, depthWrite: false, polygonOffset: true, polygonOffsetFactor: 0, polygonOffsetUnits: -4 - order * 2 }, o)), heat); m.userData.shared = true; return m; }
function sleeperTex() {
  const S = 64, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'), rng = mulberry32(5);
  g.fillStyle = '#8e887e'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 700; i++) { const k = 100 + Math.floor(rng() * 70); g.fillStyle = `rgb(${k},${k - 6},${k - 14})`; g.fillRect(rng() * S, rng() * S, 2, 2); }
  g.fillStyle = '#4e3c30'; g.fillRect(14, 12, 36, 40);                    // a sleeper across the middle (u runs along the track: x = along)
  g.fillStyle = '#3e3028'; g.fillRect(14, 12, 4, 40); g.fillRect(46, 12, 4, 40);
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping; t.anisotropy = 4; return t;
}
const WATER_HEAT = { value: 0 };
const WATER_MAT = sensorMat(new THREE.MeshPhongMaterial({ color: 0x1c3236, specular: 0x3a464c, shininess: 40, vertexColors: true }));
WATER_MAT.userData.shared = true; WATER_MAT.userData.albK = 0.3; WATER_MAT.userData.extend = s => { s.uniforms.uMatHeat = WATER_HEAT; };   // (uniforms only: the program is the shared one)
const WIN_MAT = windowMat(); WIN_MAT.userData.shared = true; WIN_MAT.userData.heat = 0.1;
/* At night only some windows are lit: WIN_MAT glows after dusk (updateEnvironment), WIN_DARK never does. Each building draws its own
   share (many are dark altogether) from its position, so a map looks the same every time. */
const WIN_DARK = windowMat(); WIN_DARK.userData.shared = true; WIN_DARK.userData.heat = 0.1;
const WIN_SHARE = { house: [0.65, 0.3, 0.75], flats: [0.9, 0.15, 0.4], shop: [0.3, 1, 1] };   // (how many buildings have any light; the share of their windows, from - to)
let winRng = Math.random, winLit = 0.4;
function winsOf(b, type) { const S = WIN_SHARE[type] || WIN_SHARE.house; winRng = mulberry32(Math.floor((b.x || 0) * 31.7 + (b.z || 0) * 517.3 + 9) | 0); winLit = winRng() < S[0] ? lerp(S[1], S[2], winRng()) : 0; }
const WALL_COLS = [0x948a7a, 0x9e9686, 0x887c6c, 0xa69e90, 0x7c7264, 0x989084, 0x84888a, 0xa29078];
const FLAT_COLS = [0x8e8a82, 0x9c968c, 0x86847c, 0xaaa49a, 0x7e7c76];
const BARN_ROOFS = [0x6e726e, 0x7a3c30, 0x5c6066];
/* a gable roof: ridge along x, w long, d deep, rh tall, eaves at y */
function gable(p, w, d, rh, mat, y) {
  const L = w / 2, D = d / 2, g = new THREE.BufferGeometry(), v = [
    -L, 0, D, L, 0, D, L, rh, 0, -L, 0, D, L, rh, 0, -L, rh, 0,
    L, 0, -D, -L, 0, -D, -L, rh, 0, L, 0, -D, -L, rh, 0, L, rh, 0,
    -L, 0, -D, -L, 0, D, -L, rh, 0, L, 0, D, L, 0, -D, L, rh, 0];
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.computeVertexNormals();
  const m = shade(new THREE.Mesh(g, mat)); m.position.y = y; p.add(m); return m;
}
function winPlane(p, x, y, z, w, h, ry) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), winRng() < winLit ? WIN_MAT : WIN_DARK); m.position.set(x, y, z); m.rotation.y = ry; m.receiveShadow = true; p.add(m); return m; }
/* windows along both long sides of a w x d box, f floors of fh, starting at y0 */
function windowRows(p, w, d, f, fh, y0, bay, wh) { const n = Math.max(1, Math.floor(w / bay)); for (let k = 0; k < f; k++) for (let i = 0; i < n; i++) { const x = (i + 0.5) * w / n - w / 2, y = y0 + k * fh + fh * 0.55; winPlane(p, x, y, d / 2 + 0.03, 1.3, wh, 0); winPlane(p, x, y, -d / 2 - 0.03, 1.3, wh, Math.PI); } }

const BUILDERS = {
  house(g, b) {
    const f = b.floors, H = f * 2.9, wall = HOT(WALL_COLS[Math.floor(b.tint * WALL_COLS.length)], 0.06), roof = HOUSE_ROOFS[Math.floor(b.roof * HOUSE_ROOFS.length)];
    box(g, b.w, H, b.d, wall, 0, H / 2, 0);
    gable(g, b.w + 0.7, b.d + 0.9, lerp(2.2, 3.4, b.seed), roof, H);
    windowRows(g, b.w, b.d, f, 2.9, 0, 3.2, 1.3);
    box(g, 0.6, 1.8, 0.6, HOT(0x6a5a50, 0.32), b.w * 0.25 * (b.seed < 0.5 ? 1 : -1), H + 1.9, b.d * 0.18);
    box(g, 1.1, 2.1, 0.12, 0x4a3c30, b.w * (b.seed - 0.5) * 0.5, 1.05, b.d / 2 + 0.05);
  },
  flats(g, b) {
    const f = b.floors, H = f * 2.8 + 0.6, wall = HOT(FLAT_COLS[Math.floor(b.tint * FLAT_COLS.length)], 0.07);
    box(g, b.w, H, b.d, wall, 0, H / 2, 0);
    box(g, b.w + 0.3, 0.5, b.d + 0.3, ROOF_MAT, 0, H + 0.25, 0);
    for (let x = -b.w / 2 + 6; x < b.w / 2 - 3; x += lerp(12, 18, b.seed)) box(g, 2.6, 2.2, 3, HOT(0x8a8680, 0.12), x, H + 1.5, 0);
    windowRows(g, b.w, b.d, f, 2.8, 0.6, 3.1, 1.25);
    for (let x = -b.w / 2 + 8; x < b.w / 2 - 4; x += 16) box(g, 2.4, 2.4, 0.4, 0x5a4e44, x, 1.2, b.d / 2 + 0.2);
  },
  shop(g, b) {
    const f = b.floors, H = f * 3.4, wall = HOT(WALL_COLS[Math.floor(b.tint * WALL_COLS.length)], 0.08);
    box(g, b.w, H, b.d, wall, 0, H / 2, 0); box(g, b.w + 0.2, 0.4, b.d + 0.2, ROOF_MAT, 0, H + 0.2, 0);
    winPlane(g, 0, 1.6, b.d / 2 + 0.03, b.w * 0.8, 2, 0);
    box(g, b.w * 0.6, 0.9, 0.3, [0x9a3a2a, 0x2a5a8a, 0x3a7a4a, 0xa88a2a][Math.floor(b.seed * 4)], 0, 3.0, b.d / 2 + 0.2);
    box(g, 1.6, 1.2, 1.6, HOT(0x8a8a86, 0.25), b.w * 0.25, H + 0.8, -b.d * 0.2);
  },
  barn(g, b) {
    const H = 4.6, wall = HOT([0x7a5a42, 0x8a8478, 0x6a5040][Math.floor(b.tint * 3)], 0.05);
    box(g, b.w, H, b.d, wall, 0, H / 2, 0);
    gable(g, b.w + 0.8, b.d + 1.2, b.d * 0.36, sharedRoof(BARN_ROOFS[Math.floor(b.roof * BARN_ROOFS.length)]), H);
    box(g, 4, 3.6, 0.2, 0x4a3a2e, 0, 1.8, b.d / 2 + 0.1);
  },
  shed(g, b) { const H = 2.6; box(g, b.w, H, b.d, HOT([0x8a8478, 0x6a5e50, 0x9a9488][Math.floor(b.tint * 3)], 0.05), 0, H / 2, 0); box(g, b.w + 0.4, 0.25, b.d + 0.4, sharedRoof(0x5a5e62), 0, H + 0.12, 0); },
  silo(g, b) { cyl(g, 3, 3, 13, 12, HOT(0xa4a49c, 0.05), 0, 6.5, 0); const c = shade(new THREE.Mesh(new THREE.ConeGeometry(3.15, 2, 12), sharedRoof(0x7a7e82))); c.position.y = 14; g.add(c); }
};
const ROOF_CACHE = {}; function sharedRoof(c) { return ROOF_CACHE[c] || (ROOF_CACHE[c] = sharedMat(c)); }

const STRUCT = {
  meshes: [], towns: [],
  *build() {
    for (const m of this.meshes) { scene.remove(m); m.geometry.dispose(); }
    this.meshes = [];
    const add = (m, order, shadow) => { if (!m) return; m.renderOrder = order; m.receiveShadow = true; m.castShadow = !!shadow; scene.add(m); this.meshes.push(m); return m; };
    // water: lakes as fans at their level (out under the banks), the river as a ribbon at its falling level
    const W = new GeoAcc(), wc = [0.9, 1, 1];
    for (const L of LAYOUT.lakes) for (let k = 0; k < 72; k++) {
      const a0 = k / 72 * TAU, a1 = (k + 1) / 72 * TAU, r0 = L.shape(a0) + 4, r1 = L.shape(a1) + 4;
      W.tri([L.x, L.W, L.z], [L.x + Math.cos(a0) * r0, L.W, L.z + Math.sin(a0) * r0], [L.x + Math.cos(a1) * r1, L.W, L.z + Math.sin(a1) * r1], wc, wc, wc, UP);
    }
    for (const R of LAYOUT.rivers) ribbonInto(W, R.pts, i => R.lv[i], [[-8.5, 0, 0xe6ffff], [-5, 0, 0xffffff], [5, 0, 0xffffff], [8.5, 0, 0xe6ffff]]);
    add(W.mesh(WATER_MAT), 0);
    yield;
    // roads in layers: shoulders and dirt tracks first, then all the asphalt (it covers a crossing road's shoulders), junction
    // patches, then the markings (stopping short of the junctions); on a bridge the deck's height
    const Sh = new GeoAcc(), Rd = new GeoAcc(), Mk = new GeoAcc(), B = new GeoAcc(), J = LAYOUT.junctions;
    const nearJ = (x, z, m) => J.some(j => Math.hypot(j.x - x, j.z - z) < j.r + m);
    for (const r of LAYOUT.roads) {
      const K = ROAD_KINDS[r.kind], hw = K.w / 2, y = (i, x, z) => r.br[i] ? r.h[i] + 0.5 : roadY(x, z);
      if (K.dirt) ribbonInto(Sh, r.pts, y, [[-hw - 0.6, -0.04, 0x6e6046], [-hw + 0.5, 0, K.asphalt], [hw - 0.5, 0, K.asphalt], [hw + 0.6, -0.04, 0x6e6046]]);
      else {
        ribbonInto(Sh, r.pts, y, [[-hw - 1.1, -0.04, 0x6a6458], [-hw + 0.2, 0, 0x6a6458], [hw - 0.2, 0, 0x6a6458], [hw + 1.1, -0.04, 0x6a6458]]);
        ribbonInto(Rd, r.pts, (i, x, z) => y(i, x, z) + 0.01, [[-hw, 0, K.asphalt], [hw, 0, K.asphalt]]);
      }
      if (K.mark) {   // dashed centre line and solid edge lines, broken at the junctions
        const P = r.pts, yy = (i, x, z) => y(i, x, z) + 0.03;
        for (let i = 0, s = 0; i < P.length - 1; i++, s += 4) if (s % 12 < 4 && !nearJ(P[i][0], P[i][1], 3) && !nearJ(P[i + 1][0], P[i + 1][1], 3)) ribbonInto(Mk, [P[i], P[i + 1]], (j, x, z) => yy(i + j, x, z), [[-0.08, 0, 0xffffff], [0.08, 0, 0xffffff]]);
        let run = [];
        const flush = () => { if (run.length > 1) for (const o of [-hw + 0.35, hw - 0.35]) ribbonInto(Mk, run.map(k => P[k]), (j, x, z) => yy(run[j], x, z), [[o - 0.08, 0, 0xffffff], [o + 0.08, 0, 0xffffff]]); run = []; };
        for (let i = 0; i < P.length; i++) { if (nearJ(P[i][0], P[i][1], 4)) flush(); else run.push(i); } flush();
      }
      this.bridges(B, r.pts, r.h, r.br, K.w + 1.2, 0.5);
    }
    for (const j of J) {   // a round patch where roads meet: fills the wedges between two ribbons
      const G = j.paved ? Rd : Sh, col = rgb(j.paved ? ROAD_KINDS.road.asphalt : ROAD_KINDS.track.asphalt), n = 18, c = [j.x, roadY(j.x, j.z) + 0.012, j.z];
      for (let k = 0; k < n; k++) {
        const a0 = k / n * TAU, a1 = (k + 1) / n * TAU, x0 = j.x + Math.cos(a0) * j.r, z0 = j.z + Math.sin(a0) * j.r, x1 = j.x + Math.cos(a1) * j.r, z1 = j.z + Math.sin(a1) * j.r;
        G.tri(c, [x0, roadY(x0, z0) + 0.012, z0], [x1, roadY(x1, z1) + 0.012, z1], col, col, col, UP);
      }
    }
    add(Sh.mesh(SHOULDER_MAT), 1); add(Rd.mesh(ROAD_MAT), 2); add(Mk.mesh(MARK_MAT), 3);
    yield;
    // the railway: ballast with sleepers (a texture along it), two rails, bridges
    const R = LAYOUT.rail;
    if (R) {
      const y = (i, x, z) => R.br[i] ? R.h[i] + 0.7 : groundH(x, z) + 0.06, Bd = new GeoAcc(true), Rl = new GeoAcc();
      ribbonInto(Bd, R.pts, y, [[-2.8, -0.35, 0x5e584e], [-1.7, 0, 0xd8d8d8], [1.7, 0, 0xd8d8d8], [2.8, -0.35, 0x5e584e]], 0.65);
      for (const o of [-0.72, 0.72]) ribbonInto(Rl, R.pts, y, [[o - 0.1, 0.02, 0x3a3634], [o - 0.05, 0.2, 0x8a8e92], [o + 0.05, 0.2, 0x8a8e92], [o + 0.1, 0.02, 0x3a3634]]);
      add(Bd.mesh(RAIL_BED_MAT), 1); add(Rl.mesh(RAIL_MAT), 4);
      this.bridges(B, R.pts, R.h, R.br, 6.5, 0.7);
    }
    const bm = add(B.mesh(BRIDGE_MAT), 0, true); if (bm) bm.receiveShadow = true;
    yield;
    // buildings: one group per town / farm (and the station), merged
    this.towns = [];
    const groups = new Map();
    for (const b of LAYOUT.buildings) {
      const key = b.town || b.farm, g = groups.get(key) || groups.set(key, new THREE.Group()).get(key);
      const o = new THREE.Group(); o.position.set(b.x, b.y, b.z); o.rotation.y = -b.a; g.add(o);
      const cs = rectCorners(b.x, b.z, b.w, b.d, b.a).map(c => groundH(c[0], c[1])), lo = Math.min(...cs) - 0.6;
      box(o, b.w + 0.4, b.y - lo + 0.25, b.d + 0.4, 0x8a8478, 0, (lo - b.y + 0.25) / 2, 0);   // the plinth down to the lowest corner
      winsOf(b, b.type); BUILDERS[b.type](o, b);
    }
    if (LAYOUT.station) {
      const S = LAYOUT.station, g = new THREE.Group(); groups.set('station', g);
      S.segs.forEach((s, n) => {   // the platform in pieces along the line (curved where it is), a canopy over the middle six
        const q = new THREE.Group(); q.position.set(s.x, s.y, s.z); q.rotation.y = -s.a; g.add(q); const fl = s.L + 0.35;
        const out = (S.nx * -Math.sin(s.a) + S.nz * Math.cos(s.a)) > 0 ? 1 : -1;   // (the side away from the track, in the piece's frame)
        box(q, fl, 1.1, 4.2, 0x9a968e, 0, 0.15, 0);
        if (n > 0 && n < S.segs.length - 1) { box(q, 0.3, 3, 0.3, 0x4a4e52, 0, 1.9, out * 0.8); box(q, fl, 0.2, 3.2, 0x5a6066, 0, 3.4, out * 0.6); }
      });
      const h = new THREE.Group(); h.position.set(S.bx, S.y, S.bz); h.rotation.y = -S.a; g.add(h);
      const cs = rectCorners(S.bx, S.bz, 18, 9, S.a).map(c => groundH(c[0], c[1])); box(h, 18.4, S.y - Math.min(...cs) + 0.8, 9.4, 0x8a8478, 0, (Math.min(...cs) - S.y) / 2 + 0.2, 0);
      winsOf({ x: S.bx, z: S.bz }, 'flats'); BUILDERS.house(h, { w: 18, d: 9, floors: 2, tint: 0.8, roof: 0.4, seed: 0.3 });
    }
    for (const o of LAYOUT.outposts) { winsOf(o, 'flats'); const g = new THREE.Group(); groups.set(o, g); OUTPOST_BUILD(g, o); }
    // street lamps: along the paved roads, on alternating sides (not on a bridge, not at a junction)
    const lg = new THREE.Group(); groups.set('lamps', lg); LAYOUT.lamps = [];
    for (const r of LAYOUT.roads) {
      const K = ROAD_KINDS[r.kind], P = r.pts, step = r.kind === 'street' ? 8 : 13; if (K.dirt) continue;
      for (let i = 3, n = 0; i < P.length - 3; i += step, n++) {
        if (r.br.slice(i - 2, i + 3).some(Boolean) || nearJ(P[i][0], P[i][1], 5)) continue;
        const dx = P[i + 1][0] - P[i - 1][0], dz = P[i + 1][1] - P[i - 1][1], d = Math.hypot(dx, dz) || 1, sd = n % 2 ? 1 : -1, off = K.w / 2 + 1.5;
        const x = P[i][0] - dz / d * off * sd, z = P[i][1] + dx / d * off * sd; if (occAt(x, z) & (OCC_WATER | OCC_BUILD | OCC_RAIL | OCC_YARD)) continue;
        const a = Math.atan2(P[i][1] - z, P[i][0] - x), y = groundH(x, z), q = new THREE.Group(); q.position.set(x, y, z); q.rotation.y = -a; lg.add(q); lampPost(q, 7.5, 2.2);
        LAYOUT.lamps.push({ x: x + Math.cos(a) * 2.1, y: y + 7.35, z: z + Math.sin(a) * 2.1 });
      }
    }
    for (const g of groups.values()) {
      mergeStatic(g, []);
      for (const c of g.children.slice()) if (c.isGroup && !c.children.length) g.remove(c);   // the per-building groups are empty now (one keeps a mesh no other shares a material with)
      g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      scene.add(g); this.towns.push(g);
      yield;
    }
  },
  /* a bridge under every run of deck samples: a slab with parapets, piers down to the bed */
  bridges(G, P, h, br, w, deckTop) {
    const con = rgb(0x8c8a84), dark = rgb(0x6a6864);
    for (let i = 0; i < P.length; i++) {
      if (!br[i] || (i && br[i - 1])) continue;
      let j = i; while (j + 1 < P.length && br[j + 1]) j++;
      const a = Math.max(0, i - 2), b = Math.min(P.length - 1, j + 2), seg = P.slice(a, b + 1), top = k => h[a + k] + deckTop - 0.02;
      ribbonInto(G, seg, k => top(k), [[-w / 2, 0, 0x8c8a84], [w / 2, 0, 0x8c8a84]]);
      for (const s of [-1, 1]) {   // the slab's sides and the parapets
        for (let k = 0; k < seg.length - 1; k++) {
          const n = (q) => { const p0 = seg[Math.max(0, q - 1)], p1 = seg[Math.min(seg.length - 1, q + 1)], L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]); return [-(p1[1] - p0[1]) / L, (p1[0] - p0[0]) / L]; };
          const n0 = n(k), n1 = n(k + 1), o = s * w / 2, x0 = seg[k][0] + n0[0] * o, z0 = seg[k][1] + n0[1] * o, x1 = seg[k + 1][0] + n1[0] * o, z1 = seg[k + 1][1] + n1[1] * o, hint = [n0[0] * s, 0, n0[1] * s];
          G.quad([x0, top(k) - 1.2, z0], [x1, top(k + 1) - 1.2, z1], [x1, top(k + 1) + 0.9, z1], [x0, top(k) + 0.9, z0], dark, dark, con, con, hint);
        }
      }
      for (let k = 2; k < seg.length - 2; k += 3) {   // piers
        const [x, z] = seg[k], y0 = groundH(x, z) - 1, y1 = top(k) - 1.2;
        if (y1 - y0 < 1.5) continue;
        for (const [dx, dz, nx, nz] of [[1, 0, 1, 0], [-1, 0, -1, 0], [0, 1, 0, 1], [0, -1, 0, -1]]) {
          const ax = x + dx * 0.9 - dz * 0.9, az = z + dz * 0.9 + dx * 0.9, bx = x + dx * 0.9 + dz * 0.9, bz = z + dz * 0.9 - dx * 0.9;
          G.quad([ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az], dark, dark, con, con, [nx, 0, nz]);
        }
      }
    }
  }
};
const SHOULDER_MAT = decalMat({}, 0.05, 0), ROAD_MAT = decalMat({}, 0.06, 1), MARK_MAT = decalMat({}, 0.04, 3);
const RAIL_BED_MAT = decalMat({ map: sleeperTex() }, 0.03, 0);
const RAIL_MAT = sensorMat(new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 50, specular: 0x666666 }), 0.04); RAIL_MAT.userData.shared = true;
const BRIDGE_MAT = sensorMat(new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: true, shininess: 4, specular: 0x111111 }), 0.04); BRIDGE_MAT.userData.shared = true;

/* a lamp post: a pole h high with an arm along +x and the lamp's head at its end */
function lampPost(q, h, arm) { box(q, 0.18, h, 0.18, 0x4a4c4e, 0, h / 2, 0); if (arm) box(q, arm, 0.12, 0.12, 0x4a4c4e, arm / 2, h - 0.06, 0); box(q, 0.7, 0.14, 0.34, 0x8a8c88, arm - 0.1, h - 0.2, 0); }
const OP_LAMPS = [[-11, -7], [-12, 11], [5, 17], [10, -12]];   // the yard lamps of an outpost (u, v)
/* an allied outpost: a gravel yard, a wall of earth-filled barriers, two watch towers, containers, tents, a helipad */
function OUTPOST_BUILD(root, o) {
  const g = new THREE.Group(); g.position.set(o.x, o.y, o.z); g.rotation.y = -o.a; root.add(g);
  box(g, OP_W - 1, 0.12, OP_D - 1, 0x625e52, 0, 0.0, 0).castShadow = false;                 // gravel
  const at = (part, fn) => { const q = new THREE.Group(); q.position.set(part.u, 0, part.v * o.side); g.add(q); fn(q, part); };   // (rotation.y = -a turns +x onto u and +z onto ±v: the side the outpost lies on)
  for (const [u, v] of OP_LAMPS) at({ u, v }, q => lampPost(q, 6, 0));
  for (const p of o.parts) at(p, (q, p) => {
    if (p.type === 'wall') {                                    // barriers in 1.1 m cells along the long side
      const long = p.w > p.d, L = long ? p.w : p.d, n = Math.max(1, Math.round(L / 1.12));
      for (let i = 0; i < n; i++) { const t = (i + 0.5) / n * L - L / 2, c = i % 3 === 1 ? 0x8f8062 : 0x9c8d6c; box(q, long ? 1.06 : 1.1, 2.1, long ? 1.1 : 1.06, c, long ? t : 0, 1.05, long ? 0 : t); }
    } else if (p.type === 'tower') {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(q, 0.25, 5, 0.25, 0x5a5448, sx * 1.4, 2.5, sz * 1.4);
      box(q, 3.4, 1.3, 3.4, 0x8a7c5e, 0, 5.6, 0); box(q, 3.8, 0.2, 3.8, 0x5c5a52, 0, 7.4, 0); for (const sx of [-1, 1]) box(q, 0.2, 1.1, 0.2, 0x5a5448, sx * 1.6, 6.8, 1.6), box(q, 0.2, 1.1, 0.2, 0x5a5448, sx * 1.6, 6.8, -1.6);
    } else if (p.type === 'container') box(q, p.w, 2.55, p.d, [0x66705c, 0x8a7a58, 0x5c6470][Math.abs(Math.round(p.u + p.v)) % 3], 0, 1.3, 0);
    else if (p.type === 'tent') { box(q, p.w, 1.5, p.d, 0x8e8466, 0, 0.75, 0); gable(q, p.w, p.d, 1.4, M(0x857b5e), 1.5); }
    else if (p.type === 'sandbag') { box(q, p.w, 1.1, 0.8, 0x857552, 0, 0.55, -(p.d / 2 - 0.4) * o.side); for (const sx of [-1, 1]) box(q, 0.8, 1.1, p.d, 0x857552, sx * (p.w / 2 - 0.4), 0.55, 0); }
    else if (p.type === 'pad') { box(q, p.w, 0.2, p.d, 0x6e6c66, 0, 0.1, 0).castShadow = false; box(q, 0.8, 0.04, 6, 0xd8d6cc, -1.6, 0.22, 0); box(q, 0.8, 0.04, 6, 0xd8d6cc, 1.6, 0.22, 0); box(q, 2.4, 0.04, 0.8, 0xd8d6cc, 0, 0.22, 0); }
  });
}
