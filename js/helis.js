'use strict';
/* ===== Helicopter models (from FAB's airframes: 1 unit = 10 m, scaled by HELI_SCALE; nose +x, wheels on y = 0) =====
   The rotors are groups named 'rotor' / 'rotor2' / 'trotor' (dynamic: spun by units.js); engines warm, exhausts hot, the gearbox
   and hub warm. Glass is a plain dark material (merged with the rest: no draw call of its own). userData.nav: where the navigation
   lights are, metres (w: the starboard wingtip, x y z; the port one mirrored; t: the tail, x y) — js/lights.js puts them there. */
const HELI_SCALE = 10;
const HGLASS = () => HOT(0x18222c, 0.1);
function mirrorZ(pts) { return pts.map(p => [p[0], -p[1]]); }
function pair(g, pts, y, t, c) { prism(g, pts, y, t, c); prism(g, mirrorZ(pts), y, t, c); }
/* a blade from the hub out along +x: tapering towards the tip, thin */
function blade(p, len, chord, c) { prism(p, [[0, -chord * 0.5], [len * 0.88, -chord * 0.45], [len, -chord * 0.22], [len, chord * 0.28], [len * 0.88, chord * 0.45], [0, chord * 0.5]], -0.006, 0.012, c).castShadow = false; }
/* a main rotor: n blades of len about a hub with its grips, pitch links and swashplate; the blades rise a little to their tips (no
   blur disc: the sensor shows the blades stepping round, as real footage does) */
function heliRotor(g, x, y, n, len, chord, color, name, hub, bifilar) {
  const r = new THREE.Group(); r.name = name || 'rotor'; r.position.set(x, y, 0); g.add(r); const H = hub || color;
  cyl(r, 0.045, 0.055, 0.035, 10, H, 0, 0, 0); cyl(r, 0.018, 0.032, 0.03, 8, H, 0, 0.032, 0); cyl(r, 0.062, 0.062, 0.008, 12, H, 0, -0.034, 0);   // (hub, cap, swashplate)
  if (bifilar) for (let i = 0; i < 4; i++) { const a = i * TAU / 4 + 0.4; box(r, 0.05, 0.008, 0.012, H, Math.cos(a) * 0.03, 0.05, -Math.sin(a) * 0.03).rotation.y = a; }
  for (let i = 0; i < n; i++) {
    const h = new THREE.Group(); h.rotation.y = i * TAU / n; r.add(h);
    box(h, 0.07, 0.022, 0.026, H, 0.075, 0, 0); strut(h, new V3(0.05, -0.034, 0.018), new V3(0.06, -0.006, 0.018), 0.004, H);   // (grip, pitch link)
    const b = new THREE.Group(); b.position.set(0.1, 0, 0); b.rotation.z = 0.03; h.add(b); blade(b, len - 0.06, chord, color);
  }
  return r;
}
/* a tail rotor: blades in the XY plane (it spins about z) at the angles given round a small hub */
function tailRotor(g, x, y, z, r, color, angles) {
  const t = new THREE.Group(); t.name = 'trotor'; t.position.set(x, y, z); g.add(t);
  cyl(t, 0.018, 0.018, 0.03, 8, color, 0, 0, 0).rotation.x = Math.PI / 2;
  for (const a of angles || [0, TAU / 4, TAU / 2, TAU * 3 / 4]) { const h = new THREE.Group(); h.rotation.z = a; t.add(h); box(h, 0.026, r, 0.006, color, 0, r / 2 + 0.012, 0).castShadow = false; }
  return t;
}
/* a cockpit: a body-coloured taper (as taper()) glazed with flat panes set into its faces; the strips of the body left between
   them are the frames (no bar laid over the glass). faces: [face, panes, sill] — 'f' the front (split across), 'b' the back,
   's' both sides (split along), 't' the roof split along, 'T' the roof split across; sill: the share of the face under the glass
   (from its bottom edge; for the roof from its front edge). fr: the frames' width */
function canopy(g, w, h, d, C, G, x, y, z, tx, tz, sx, faces, fr) {
  taper(g, w, h, d, C, x, y, z, tx, tz, sx); fr = fr || 0.01; sx = sx || 0;
  const P = (i, j, top) => new V3(x + i * w / 2 * (top ? tx : 1) + (top ? sx : 0), y + (top ? h / 2 : -h / 2), z + j * d / 2 * (top ? tz : 1));
  const F = { f: [P(1, 1), P(1, -1), P(1, -1, 1), P(1, 1, 1)], b: [P(-1, -1), P(-1, 1), P(-1, 1, 1), P(-1, -1, 1)],
    l: [P(1, -1), P(-1, -1), P(-1, -1, 1), P(1, -1, 1)], r: [P(-1, 1), P(1, 1), P(1, 1, 1), P(-1, 1, 1)],
    t: [P(1, -1, 1), P(-1, -1, 1), P(-1, 1, 1), P(1, 1, 1)], T: [P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1), P(-1, -1, 1)] };
  const ctr = new V3(x + sx / 2, y, z), pos = [], nor = [];
  for (const [f, n, sill] of faces) for (const k of f === 's' ? ['l', 'r'] : [f]) {
    const [a, b, c, e] = F[k], L = (u, v) => new V3().addScaledVector(a, (1 - u) * (1 - v)).addScaledVector(b, u * (1 - v)).addScaledVector(c, u * v).addScaledVector(e, (1 - u) * v);
    const fu = fr / ((a.distanceTo(b) + e.distanceTo(c)) / 2), fv = fr / ((a.distanceTo(e) + b.distanceTo(c)) / 2);
    const N = new V3().subVectors(b, a).cross(new V3().subVectors(e, a)).normalize(); if (N.dot(new V3().subVectors(L(0.5, 0.5), ctr)) < 0) N.negate();
    for (let i = 0; i < n; i++) {
      const u0 = i / n + (i ? fu / 2 : fu), u1 = (i + 1) / n - (i < n - 1 ? fu / 2 : fu), v0 = (sill || 0) + fv, v1 = 1 - fv;
      pane(pos, nor, [L(u0, v0), L(u1, v0), L(u1, v1), L(u0, v1)], N);
    }
  }
  return paneMesh(g, pos, nor, G);
}
/* a flat pane of glass: the quad q set 0.003 out along its face's normal N, wound to face it (canopy, hull) */
function pane(pos, nor, q, N) {
  q = q.map(p => p.clone().addScaledVector(N, 0.003)); if (new V3().subVectors(q[1], q[0]).cross(new V3().subVectors(q[2], q[0])).dot(N) < 0) q.reverse();
  for (const p of [q[0], q[1], q[2], q[0], q[2], q[3]]) { pos.push(p.x, p.y, p.z); nor.push(N.x, N.y, N.z); }
}
function paneMesh(g, pos, nor, G) {
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  const m = shade(new THREE.Mesh(geo, mm(G)), false); g.add(m); return m;
}
/* a rounded body lofted along x: stations [x, y, w, hb, ht, k] in rising x (y its centre line, w the half width, hb / ht down and
   up from y; its section a superellipse: k 2 an ellipse, higher a box with round corners, o.k for all), o.seg points round (from
   the side +z, over the top), the ends closed. o.glass [[x0, x1, a0, a1]]: the cells between stations within x0..x1 whose middle is
   a0..a1 degrees round (0 the +z side, 90 the top, -90 the bottom) glazed: a flat pane in each, o.fr of the body round it the frame */
function hull(g, st, C, o) {
  o = o || {}; const seg = o.seg || 16, pos = [], idx = [], R = [];
  for (const [x, y, w, hb, ht, k] of st) {
    const e = 2 / (k || o.k || 2.5), ring = [];
    for (let i = 0; i < seg; i++) { const a = i / seg * TAU, ca = Math.cos(a), sa = Math.sin(a), cz = Math.sign(ca) * Math.abs(ca) ** e, cy = Math.sign(sa) * Math.abs(sa) ** e;
      ring.push(new V3(x, y + cy * (cy > 0 ? ht : hb), cz * w)); pos.push(x, y + cy * (cy > 0 ? ht : hb), cz * w); }
    R.push(ring);
  }
  const n = st.length, I = (s, i) => s * seg + (i % seg);
  for (let s = 0; s < n - 1; s++) for (let i = 0; i < seg; i++) idx.push(I(s, i), I(s + 1, i), I(s, i + 1), I(s + 1, i), I(s + 1, i + 1), I(s, i + 1));
  for (const [s, f] of [[0, false], [n - 1, true]]) {   // (the ends: a fan round the middle)
    const c = pos.length / 3; pos.push(st[s][0], st[s][1], 0);
    for (let i = 0; i < seg; i++) f ? idx.push(c, I(s, i + 1), I(s, i)) : idx.push(c, I(s, i), I(s, i + 1));
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
  const m = shade(new THREE.Mesh(geo, mm(C))); g.add(m);
  if (o.glass) {
    const gp = [], gn = [], fr = o.fr || 0.008;
    for (let s = 0; s < n - 1; s++) for (let i = 0; i < seg; i++) {
      let am = (i + 0.5) / seg * 360; if (am > 270) am -= 360;
      if (!o.glass.some(([x0, x1, a0, a1]) => st[s][0] >= x0 - 1e-6 && st[s + 1][0] <= x1 + 1e-6 && am >= a0 && am <= a1)) continue;
      const p = [R[s][i], R[s + 1][i], R[s + 1][(i + 1) % seg], R[s][(i + 1) % seg]], c = p.reduce((a, b) => a.add(b), new V3()).multiplyScalar(0.25);
      const N = new V3().subVectors(p[1], p[0]).cross(new V3().subVectors(p[3], p[0])); if (N.lengthSq() < 1e-10) continue; N.normalize();
      pane(gp, gn, p.map(v => v.clone().lerp(c, Math.min(0.45, fr / Math.max(1e-6, v.distanceTo(c)) * 1.4))), N);
    }
    paneMesh(g, gp, gn, o.G);
  }
  return m;
}
/* how far out the side of a hull is (z, its half width) at x and height y: its stations' sections eased between them (k0 the
   hull's o.k); 0 above or below it */
function hullAt(st, x, y, k0) {
  let i = 0; while (i < st.length - 2 && st[i + 1][0] < x) i++;
  const a = st[i], b = st[i + 1], t = clamp((x - a[0]) / (b[0] - a[0]), 0, 1), L = j => a[j] + (b[j] - a[j]) * t;
  const yc = L(1), k = (a[5] || k0 || 2.5) + ((b[5] || k0 || 2.5) - (a[5] || k0 || 2.5)) * t, d = Math.abs(y - yc) / (y < yc ? L(3) : L(4));
  return d >= 1 ? 0 : L(2) * (1 - d ** k) ** (1 / k);
}
/* a panel (a door) on a hull's side s (±1) from x0 to x1, y0 to y1, following its curve 0.002 out */
function skin(g, st, x0, x1, y0, y1, s, c, k0) {
  const pos = [], idx = [], nx = 2, ny = 6;
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) { const x = x0 + (x1 - x0) * i / nx, y = y0 + (y1 - y0) * j / ny; pos.push(x, y, s * (hullAt(st, x, y, k0) + 0.002)); }
  const I = (i, j) => j * (nx + 1) + i;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) s > 0 ? idx.push(I(i, j), I(i + 1, j), I(i, j + 1), I(i + 1, j), I(i + 1, j + 1), I(i, j + 1)) : idx.push(I(i, j), I(i, j + 1), I(i + 1, j), I(i + 1, j), I(i, j + 1), I(i + 1, j + 1));
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
  const m = shade(new THREE.Mesh(geo, mm(c))); g.add(m); return m;
}
function heliDone(g, nav) { const dyn = []; g.traverse(o => { if (o !== g && o.name) dyn.push(o); }); mergeStatic(g, dyn); g.scale.setScalar(HELI_SCALE); g.userData.nav = nav; return g; }
const heliMats = (c, c3, c2) => ({ C: HOT(c, 0.2), C3: HOT(c3, 0.2), C2: HOT(c2, 0.62), D: HOT(0x262924, 0.3), X: HOT(0x1e1f1e, 0.85), X2: HOT(0x2a2422, 0.97), GB: HOT(0x34372e, 0.42), G: HGLASS(), K: HOT(0x161616, 0.22), HUB: HOT(0x2a2c28, 0.35) });
const P3 = (x, y, z) => new V3(x, y, z);

/* UH-60 Black Hawk — the allies' transport: framed windscreen, cabin doors and windows, door guns, the canted tail rotor */
function buildUH60() {
  const g = new THREE.Group(), { C, C3, C2, D, X, X2, GB, G, K, HUB } = heliMats(0x474d3c, 0x51574a, 0x3f4535), R = 0x2a2d30;
  taper(g, 0.46, 0.2, 0.24, C, 0.03, 0.14, 0, 1.0, 0.85); taper(g, 0.14, 0.11, 0.2, C, 0.53, 0.095, 0, 0.6, 0.8, -0.03);   // (cabin, nose)
  canopy(g, 0.22, 0.2, 0.235, C, G, 0.37, 0.14, 0, 0.55, 0.8, -0.05, [['f', 2, 0.52], ['s', 2, 0.45]]);   // (the cockpit: the windscreen's two panes, the quarter and door windows)
  for (const s of [-1, 1]) {
    box(g, 0.17, 0.14, 0.006, C3, 0.04, 0.12, s * 0.122); box(g, 0.07, 0.05, 0.004, G, 0.06, 0.16, s * 0.126); box(g, 0.32, 0.006, 0.006, D, -0.02, 0.2, s * 0.124);   // (sliding door, its window, its rail)
    box(g, 0.05, 0.045, 0.006, G, 0.2, 0.17, s * 0.121); box(g, 0.06, 0.045, 0.006, G, -0.12, 0.17, s * 0.116);   // (gunner's window, the rear cabin window)
    box(g, 0.03, 0.02, 0.02, D, 0.2, 0.15, s * 0.13); tube(g, 0.2, 0.31, 0.006, 0.006, D, 0.15, s * 0.14, 4);   // (door gun)
    strut(g, P3(0.55, 0.13, s * 0.06), P3(0.64, 0.13, s * 0.07), 0.003, D);   // (pitot)
  }
  strut(g, P3(0.4, 0.255, 0), P3(0.3, 0.29, 0), 0.004, D); strut(g, P3(0.56, 0.045, 0), P3(0.47, 0.03, 0), 0.004, D);   // (wire cutters)
  taper(g, 0.5, 0.07, 0.19, C, -0.01, 0.275, 0, 0.85, 0.75); box(g, 0.16, 0.05, 0.1, GB, 0.02, 0.33, 0); cyl(g, 0.02, 0.025, 0.04, 8, GB, 0, 0.36, 0);   // (engine deck, gearbox, mast)
  box(g, 0.07, 0.02, 0.06, D, -0.18, 0.315, 0);   // (the APU's exhaust)
  for (const s of [-1, 1]) {
    tube(g, -0.19, 0.09, 0.045, 0.045, C2, 0.285, s * 0.1); tube(g, 0.09, 0.1, 0.045, 0.04, D, 0.285, s * 0.1); tube(g, 0.1, 0.103, 0.03, 0.03, K, 0.285, s * 0.1, 8);   // (engine, intake lip, intake)
    for (const x of [-0.12, -0.04]) box(g, 0.05, 0.006, 0.04, D, x, 0.33, s * 0.1);
    box(g, 0.08, 0.04, 0.05, X, -0.21, 0.29, s * 0.13).rotation.y = s * 0.5; box(g, 0.02, 0.03, 0.04, X2, -0.245, 0.29, s * 0.15).rotation.y = s * 0.5;   // (IR suppressor and its hot mouth)
    box(g, 0.1, 0.015, 0.2, C, -0.05, 0.22, s * 0.2); box(g, 0.03, 0.025, 0.012, D, -0.05, 0.2, s * 0.24); tube(g, -0.12, 0.05, 0.035, 0.035, D, 0.17, s * 0.28, 6);   // (ESSS stub wing, pylon, tank)
  }
  const tc = taper(g, 0.17, 0.64, 0.16, C, -0.49, 0.145, 0, 0.35, 0.38, 0.05); tc.rotation.z = Math.PI / 2;
  box(g, 0.5, 0.012, 0.018, C3, -0.45, 0.23, 0); strut(g, P3(-0.3, 0.22, 0), P3(-0.35, 0.29, 0), 0.004, D); strut(g, P3(-0.15, 0.31, 0), P3(-0.2, 0.36, 0), 0.004, D);   // (drive shaft cover, antennas)
  taper(g, 0.17, 0.32, 0.045, C, -0.86, 0.36, 0, 0.55, 0.8, -0.06); box(g, 0.05, 0.04, 0.045, GB, -0.9, 0.44, 0);   // (tail pylon, tail gearbox)
  pair(g, [[-0.8, 0.0], [-0.82, 0.22], [-0.92, 0.22], [-0.92, 0.0]], 0.22, 0.015, C);
  for (const s of [-1, 1]) { const st = box(g, 0.025, 0.09, 0.025, D, 0.33, 0.07, s * 0.145); st.rotation.x = s * 0.35; box(g, 0.08, 0.015, 0.015, D, 0.31, 0.04, s * 0.16); wheel(g, 0.33, 0.035, s * 0.165, 0.035, 0.03, K); }
  box(g, 0.025, 0.06, 0.025, D, -0.42, 0.06, 0); wheel(g, -0.43, 0.03, 0, 0.03, 0.025, K);
  heliRotor(g, 0.0, 0.38, 4, 0.77, 0.055, R, 'rotor', HUB, true);
  const th = new THREE.Group(); th.position.set(-0.9, 0.43, 0.04); th.rotation.x = -0.35; th.name = 'hub'; g.add(th); tailRotor(th, 0, 0, 0, 0.167, R);
  return heliDone(g, { w: [-0.5, 2.3, 2.6], t: [-9.3, 5.2] });
}
/* AH-64 Apache — the allies' attack helicopter: tandem framed canopies, TADS / PNVS, the chin gun, Longbow, rockets and Hellfires */
function buildAH64() {
  const g = new THREE.Group(), { C, C3, C2, D, X, X2, GB, G, K, HUB } = heliMats(0x3e4436, 0x474d3f, 0x363b30), MS = HOT(0xb8b8b0, 0.12), R = 0x262924;
  taper(g, 0.5, 0.17, 0.13, C, 0.3, 0.16, 0, 0.9, 0.8);
  canopy(g, 0.16, 0.08, 0.11, C, G, 0.43, 0.27, 0, 0.62, 0.75, -0.015, [['f', 1, 0.3], ['s', 1, 0.3], ['t', 1, 0]]);   // (the gunner's flat-plate canopy, the pilot's higher behind it)
  canopy(g, 0.18, 0.11, 0.115, C, G, 0.25, 0.29, 0, 0.7, 0.75, -0.02, [['f', 1, 0.55], ['s', 2, 0.3], ['t', 1, 0]]);
  box(g, 0.05, 0.03, 0.05, D, 0.545, 0.1, 0); cyl(g, 0.045, 0.045, 0.05, 10, D, 0.57, 0.08, 0); for (const s of [-1, 1]) { tube(g, 0.55, 0.62, 0.03, 0.03, D, 0.08, s * 0.055, 8); box(g, 0.006, 0.03, 0.03, G, 0.622, 0.08, s * 0.055); }   // (TADS: its turret under the nose's tip, the day and night sights either side)
  box(g, 0.04, 0.02, 0.03, D, 0.51, 0.25, 0); cyl(g, 0.022, 0.022, 0.035, 8, D, 0.53, 0.27, 0); box(g, 0.006, 0.02, 0.02, G, 0.549, 0.27, 0);   // (PNVS on top of the nose, ahead of the gunner)
  for (const s of [-1, 1]) strut(g, P3(0.55, 0.2, s * 0.04), P3(0.65, 0.21, s * 0.06), 0.003, D);
  strut(g, P3(0.49, 0.25, 0), P3(0.41, 0.33, 0), 0.004, D); strut(g, P3(0.5, 0.08, 0), P3(0.44, 0.07, 0), 0.004, D);   // (wire cutters: on the nose up the gunner's windscreen, under the chin)
  taper(g, 0.4, 0.2, 0.15, C, -0.08, 0.18, 0, 1, 0.8);
  for (const s of [-1, 1]) { taper(g, 0.36, 0.1, 0.05, C3, 0.14, 0.13, s * 0.09, 0.9, 0.8); for (const x of [0.04, 0.12, 0.2]) box(g, 0.05, 0.004, 0.035, D, x, 0.181, s * 0.09); }   // (avionics bays, their doors)
  for (const s of [-1, 1]) {
    tube(g, -0.25, 0.08, 0.05, 0.05, C2, 0.26, s * 0.13, 8); tube(g, 0.08, 0.1, 0.05, 0.042, D, 0.26, s * 0.13, 8); tube(g, 0.1, 0.103, 0.032, 0.032, K, 0.26, s * 0.13, 8);
    for (const x of [-0.18, -0.1, -0.02]) box(g, 0.05, 0.006, 0.05, D, x, 0.31, s * 0.13);
    box(g, 0.1, 0.045, 0.065, X, -0.29, 0.27, s * 0.155).rotation.y = s * 0.6; box(g, 0.02, 0.035, 0.05, X2, -0.33, 0.27, s * 0.183).rotation.y = s * 0.6;   // ("black hole" exhaust, its hot mouth)
  }
  taper(g, 0.32, 0.08, 0.12, C, 0.02, 0.33, 0, 0.8, 0.7); box(g, 0.14, 0.05, 0.09, GB, 0.02, 0.38, 0); cyl(g, 0.02, 0.025, 0.05, 8, GB, 0.02, 0.41, 0);
  for (const s of [-1, 1]) box(g, 0.08, 0.01, 0.02, D, 0.1, 0.371, s * 0.035);
  cyl(g, 0.01, 0.01, 0.07, 6, D, 0.02, 0.48, 0); const lb = shade(new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 6), C)); lb.position.set(0.02, 0.53, 0); lb.scale.y = 0.55; g.add(lb);   // (Longbow)
  box(g, 0.05, 0.03, 0.04, D, 0.42, 0.075, 0); tube(g, 0.42, 0.56, 0.008, 0.008, D, 0.06, 0, 4); tube(g, 0.54, 0.565, 0.012, 0.012, D, 0.06, 0, 6);   // (the 30 mm under the chin)
  pair(g, [[0.05, 0.06], [0.03, 0.3], [-0.08, 0.3], [-0.1, 0.06]], 0.17, 0.02, C);
  for (const s of [-1, 1]) {
    box(g, 0.1, 0.03, 0.025, D, -0.02, 0.18, s * 0.31);   // (wingtip countermeasures)
    for (const z of [0.15, 0.25]) box(g, 0.07, 0.03, 0.012, D, -0.02, 0.155, s * z);
    tube(g, -0.1, 0.1, 0.028, 0.028, D, 0.12, s * 0.15, 8); tube(g, 0.1, 0.112, 0.028, 0.02, D, 0.12, s * 0.15, 8);   // (rocket pod and its fairing)
    for (const [dy, dz] of [[0, 0], [0.014, 0], [-0.014, 0], [0.007, 0.012], [-0.007, 0.012], [0.007, -0.012], [-0.007, -0.012]]) tube(g, 0.112, 0.114, 0.005, 0.005, K, 0.12 + dy, s * 0.15 + dz, 5);
    box(g, 0.16, 0.012, 0.05, D, -0.01, 0.137, s * 0.25);   // (the Hellfire launcher: four on its rails)
    for (const dy of [0.119, 0.098]) for (const dz of [-0.016, 0.016]) { tube(g, -0.08, 0.06, 0.009, 0.009, MS, dy, s * 0.25 + dz, 6); tube(g, 0.06, 0.078, 0.009, 0.003, MS, dy, s * 0.25 + dz, 6); }
  }
  const tb = taper(g, 0.11, 0.55, 0.08, C, -0.55, 0.2, 0, 0.45, 0.5, 0.04); tb.rotation.z = Math.PI / 2;
  box(g, 0.42, 0.012, 0.02, C3, -0.5, 0.258, 0); for (const s of [-1, 1]) box(g, 0.06, 0.02, 0.006, D, -0.4, 0.2, s * 0.04);   // (drive shaft cover, flare dispensers)
  strut(g, P3(-0.3, 0.25, 0), P3(-0.35, 0.31, 0), 0.004, D); strut(g, P3(-0.1, 0.08, 0.03), P3(-0.15, 0.03, 0.03), 0.004, D);
  pair(g, [[-0.82, 0.0], [-0.84, 0.17], [-0.92, 0.17], [-0.92, 0.0]], 0.2, 0.012, C); taper(g, 0.12, 0.28, 0.025, C, -0.84, 0.36, 0, 0.55, 0.8, -0.05); box(g, 0.05, 0.04, 0.035, GB, -0.89, 0.48, 0);
  for (const s of [-1, 1]) { const st = box(g, 0.02, 0.1, 0.02, D, 0.36, 0.07, s * 0.12); st.rotation.x = s * 0.4; box(g, 0.07, 0.014, 0.014, D, 0.34, 0.035, s * 0.15); wheel(g, 0.36, 0.035, s * 0.15, 0.035, 0.025, K); }
  box(g, 0.014, 0.2, 0.014, D, -0.85, 0.12, 0); wheel(g, -0.85, 0.025, 0, 0.025, 0.02, K);   // (tail wheel: its leg up into the tail)
  heliRotor(g, 0.02, 0.43, 4, 0.73, 0.05, R, 'rotor', HUB);
  tailRotor(g, -0.88, 0.48, -0.03, 0.14, R, [0, 0.96, Math.PI, Math.PI + 0.96]);   // (the scissor tail rotor)
  return heliDone(g, { w: [-0.2, 1.9, 3.3], t: [-9.2, 5.0] });
}
/* Mi-24 Hind — the enemies': tandem bubble cockpits, the chin gun, a troop cabin, anhedral wings with rocket pods and missile
   rails at the tips, five blades, wheels */
function buildMi24() {
  const g = new THREE.Group(), { C, C3, C2, D, X, X2, GB, G, K, HUB } = heliMats(0x6a6648, 0x77734f, 0x5a5640), R = 0x262924;
  const B = [[-1.0, 0.28, 0.014, 0.016, 0.016], [-0.98, 0.28, 0.02, 0.022, 0.022], [-0.36, 0.235, 0.045, 0.045, 0.05], [-0.28, 0.22, 0.065, 0.065, 0.075],   // (one body: the boom out of the cabin's sloped back,
    [-0.2, 0.185, 0.095, 0.11, 0.105], [0.05, 0.18, 0.1, 0.11, 0.11, 3], [0.3, 0.18, 0.1, 0.11, 0.11, 3], [0.4, 0.17, 0.09, 0.1, 0.115],   //  the cabin, the step the pilot sits on,
    [0.48, 0.15, 0.08, 0.085, 0.08], [0.58, 0.145, 0.075, 0.08, 0.075], [0.64, 0.135, 0.055, 0.065, 0.06], [0.68, 0.13, 0.02, 0.03, 0.03]]; hull(g, B, C);   //  the nose down to the gunner)
  hull(g, [[0.44, 0.235, 0.052, 0.03, 0.045], [0.5, 0.24, 0.06, 0.03, 0.06], [0.57, 0.225, 0.052, 0.03, 0.048], [0.62, 0.2, 0.025, 0.02, 0.015]],
    C, { G, glass: [[0.44, 0.62, 12, 168]], k: 2.2, seg: 10, fr: 0.006 });   // (the gunner's bubble canopy, the pilot's on the step behind)
  hull(g, [[0.29, 0.3, 0.045, 0.03, 0.03], [0.33, 0.3, 0.062, 0.03, 0.058], [0.42, 0.3, 0.06, 0.03, 0.058], [0.48, 0.275, 0.035, 0.02, 0.018]],
    C, { G, glass: [[0.33, 0.48, 12, 168]], k: 2.2, seg: 10, fr: 0.006 });
  cyl(g, 0.035, 0.035, 0.04, 8, D, 0.6, 0.065, 0); tube(g, 0.6, 0.7, 0.007, 0.007, D, 0.058, 0, 4); tube(g, 0.6, 0.69, 0.005, 0.005, D, 0.07, 0.008, 4);   // (chin turret, its four barrels)
  box(g, 0.08, 0.035, 0.03, D, 0.6, 0.12, -0.075); box(g, 0.006, 0.02, 0.02, G, 0.642, 0.12, -0.075); tube(g, 0.58, 0.66, 0.018, 0.014, D, 0.11, 0.075, 6);   // (guidance and sight pods)
  strut(g, P3(0.64, 0.17, 0.05), P3(0.78, 0.17, 0.06), 0.004, D);   // (air data boom)
  for (const s of [-1, 1]) {
    for (const x of [0.17, 0.08, -0.01]) box(g, 0.04, 0.035, 0.006, G, x, 0.21, s * 0.103);   // (troop cabin windows)
    skin(g, B, 0.12, 0.24, 0.095, 0.225, s, C3);   // (the clamshell door, on the body's curve)
    tube(g, -0.2, 0.15, 0.05, 0.05, C2, 0.33, s * 0.11, 12); tube(g, 0.15, 0.22, 0.055, 0.035, C3, 0.33, s * 0.11, 12);   // (engine, the intake's dust filter)
    for (const x of [-0.12, -0.04, 0.04]) box(g, 0.05, 0.006, 0.04, D, x, 0.381, s * 0.11);
    const e = tube(g, -0.29, -0.2, 0.04, 0.035, X, 0.33, s * 0.14, 12); e.rotation.y = s * 0.5; box(g, 0.012, 0.05, 0.05, X2, -0.285, 0.33, s * 0.18).rotation.y = s * 0.5;   // (exhaust, its hot mouth)
    box(g, 0.24, 0.02, 0.3, C, -0.05, 0.2, s * 0.22).rotation.x = s * 0.2;   // (stub wing, tips down)
    for (const z of [0.17, 0.28]) { const y = 0.2 - (z - 0.22) * 0.2; box(g, 0.06, 0.025, 0.012, D, -0.05, y - 0.022, s * z); tube(g, -0.15, 0.08, 0.03, 0.03, D, y - 0.06, s * z, 8); tube(g, 0.08, 0.1, 0.03, 0.016, D, y - 0.06, s * z, 8); }   // (rocket pods)
    box(g, 0.2, 0.06, 0.012, D, -0.05, 0.16, s * 0.375); for (const y of [0.135, 0.185]) tube(g, -0.13, 0.08, 0.011, 0.011, C3, y, s * 0.39, 6);   // (the wingtip's missile rails and tubes)
    box(g, 0.06, 0.025, 0.006, D, -0.4, 0.24, s * 0.043);   // (flare dispenser)
    strut(g, P3(-0.03, 0.12, s * 0.09), P3(-0.03, 0.035, s * 0.19), 0.01, D); strut(g, P3(-0.1, 0.13, s * 0.09), P3(-0.03, 0.04, s * 0.19), 0.006, D); wheel(g, -0.03, 0.035, s * 0.19, 0.035, 0.025, K);   // (main gear)
    wheel(g, 0.52, 0.025, s * 0.02, 0.025, 0.015, K);
  }
  strut(g, P3(0.5, 0.08, 0), P3(0.52, 0.025, 0), 0.008, D);   // (nose gear)
  hull(g, [[-0.2, 0.3, 0.035, 0.02, 0.02], [-0.15, 0.3, 0.06, 0.02, 0.05], [0.1, 0.3, 0.06, 0.02, 0.05], [0.17, 0.29, 0.03, 0.02, 0.02]], C, { k: 3 }); box(g, 0.12, 0.04, 0.09, GB, 0.0, 0.37, 0); cyl(g, 0.035, 0.035, 0.02, 10, D, -0.14, 0.355, 0);   // (deck, gearbox, the oil cooler's fan)
  box(g, 0.5, 0.012, 0.018, C3, -0.55, 0.294, 0); strut(g, P3(-0.4, 0.28, 0), P3(-0.45, 0.34, 0), 0.004, D); strut(g, P3(-0.83, 0.26, 0), P3(-0.87, 0.12, 0), 0.006, D);   // (shaft cover, antenna, tail skid)
  pair(g, [[-0.8, 0.0], [-0.82, 0.15], [-0.9, 0.15], [-0.9, 0.0]], 0.26, 0.012, C);
  taper(g, 0.14, 0.26, 0.025, C, -0.98, 0.36, 0, 0.6, 0.8, -0.05); box(g, 0.05, 0.035, 0.035, GB, -1.0, 0.38, 0);
  tailRotor(g, -1.0, 0.38, 0.04, 0.15, R, [0, TAU / 3, TAU * 2 / 3]);
  cyl(g, 0.025, 0.03, 0.08, 6, D, 0.0, 0.42, 0);
  heliRotor(g, 0.0, 0.46, 5, 0.85, 0.05, R, 'rotor', HUB);
  return heliDone(g, { w: [-0.5, 1.6, 3.9], t: [-9.9, 4.6] });
}
/* Ka-52 — the enemies' coaxial attack helicopter: side-by-side framed cockpit, the radar nose and sensor ball, the 30 mm on the
   right, three pylons a wing, wheels, no tail rotor */
function buildKa52() {
  const g = new THREE.Group(), { C, C3, C2, D, X, X2, GB, G, K, HUB } = heliMats(0x4e5446, 0x585e4f, 0x444a3c), R = 0x262924;
  taper(g, 0.55, 0.2, 0.17, C, 0.2, 0.18, 0, 0.9, 0.85); taper(g, 0.22, 0.16, 0.16, C, 0.55, 0.15, 0, 0.6, 0.8, -0.04);
  canopy(g, 0.2, 0.12, 0.17, C, G, 0.42, 0.29, 0, 0.6, 0.8, -0.03, [['f', 2, 0.15], ['s', 2, 0.2], ['T', 2, 0]]);   // (side by side: the windscreen and the roof in two halves)
  taper(g, 0.3, 0.07, 0.156, C, 0.19, 0.315, 0, 0.8, 0.87, 0.03);   // (the body behind the cockpit at its roof's height, sloping down onto the deck: no back face of the glass sticking up)
  tube(g, 0.6, 0.75, 0.055, 0.025, C3, 0.16, 0, 10);   // (radome: its root inside the nose's sloped front, 0.5 m off it before)
  const ball = shade(new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), D)); ball.position.set(0.6, 0.07, 0); g.add(ball); box(g, 0.006, 0.03, 0.03, G, 0.638, 0.07, 0);   // (sensor ball)
  box(g, 0.14, 0.04, 0.04, D, 0.22, 0.12, 0.1); tube(g, 0.29, 0.52, 0.009, 0.009, D, 0.12, 0.1, 5); tube(g, 0.5, 0.53, 0.013, 0.013, D, 0.12, 0.1, 6);   // (the 30 mm)
  for (const s of [-1, 1]) {
    tube(g, -0.22, 0.12, 0.05, 0.05, C2, 0.3, s * 0.13, 8); tube(g, 0.12, 0.17, 0.05, 0.035, C3, 0.3, s * 0.13, 8);
    for (const x of [-0.15, -0.07, 0.01]) box(g, 0.05, 0.006, 0.04, D, x, 0.351, s * 0.13);
    const e = tube(g, -0.31, -0.22, 0.045, 0.035, X, 0.29, s * 0.15, 8); e.rotation.y = s * 0.45; box(g, 0.012, 0.05, 0.05, X2, -0.305, 0.29, s * 0.185).rotation.y = s * 0.45;
    box(g, 0.25, 0.02, 0.22, C, -0.02, 0.2, s * 0.18); box(g, 0.12, 0.03, 0.025, D, -0.02, 0.2, s * 0.3);   // (wing, countermeasure pod at its tip)
    for (const z of [0.14, 0.2, 0.26]) box(g, 0.06, 0.025, 0.012, D, -0.02, 0.178, s * z);
    tube(g, -0.12, 0.08, 0.028, 0.028, D, 0.14, s * 0.14, 8); tube(g, 0.08, 0.1, 0.028, 0.015, D, 0.14, s * 0.14, 8);   // (rocket pod)
    box(g, 0.2, 0.045, 0.045, C3, -0.02, 0.143, s * 0.2); for (const dy of [-0.011, 0.011]) for (const dz of [-0.011, 0.011]) tube(g, 0.08, 0.083, 0.008, 0.008, K, 0.143 + dy, s * 0.2 + dz, 5);   // (missile pack)
    tube(g, -0.1, 0.07, 0.025, 0.025, D, 0.14, s * 0.26, 8);
    strut(g, P3(-0.05, 0.1, s * 0.08), P3(-0.06, 0.035, s * 0.15), 0.01, D); wheel(g, -0.06, 0.035, s * 0.15, 0.035, 0.025, K); wheel(g, 0.55, 0.025, s * 0.02, 0.025, 0.015, K);   // (gear)
    taper(g, 0.1, 0.18, 0.02, C, -0.88, 0.26, s * 0.18, 0.6, 1, -0.03);
  }
  strut(g, P3(0.54, 0.08, 0), P3(0.55, 0.025, 0), 0.008, D);
  taper(g, 0.3, 0.06, 0.12, C, 0.0, 0.31, 0, 0.85, 0.7); box(g, 0.12, 0.05, 0.09, GB, 0.02, 0.36, 0);
  taper(g, 0.38, 0.16, 0.15, C, -0.15, 0.2, 0, 0.8, 0.75);   // (the rear fuselage under the engines, the tail boom out of it)
  const tb = taper(g, 0.1, 0.6, 0.08, C, -0.58, 0.22, 0, 0.45, 0.5, 0.04); tb.rotation.z = Math.PI / 2;
  box(g, 0.4, 0.012, 0.018, C3, -0.5, 0.27, 0); strut(g, P3(-0.3, 0.26, 0), P3(-0.35, 0.32, 0), 0.004, D); strut(g, P3(-0.78, 0.25, 0), P3(-0.8, 0.12, 0), 0.006, D);
  for (const s of [-1, 1]) box(g, 0.06, 0.025, 0.006, D, -0.36, 0.22, s * 0.042);
  pair(g, [[-0.78, 0.0], [-0.8, 0.18], [-0.9, 0.18], [-0.9, 0.0]], 0.2, 0.015, C);
  cyl(g, 0.025, 0.025, 0.2, 6, D, 0.02, 0.45, 0);
  heliRotor(g, 0.02, 0.42, 3, 0.68, 0.05, R, 'rotor', HUB); heliRotor(g, 0.02, 0.55, 3, 0.68, 0.05, R, 'rotor2', HUB);
  return heliDone(g, { w: [-0.2, 2.1, 3.2], t: [-9.1, 3.2] });
}
/* AH-1Z Viper — the allies' second attack helicopter: a slim (1 m) tandem fuselage under one long stepped canopy, the TSS sight
   ball on the nose, the three-barrel chin gun, stub wings with a rocket pod, four Hellfires and a wingtip missile each side, the
   engines high on the sides with their exhausts turned out, four-blade main and tail rotors, skids */
function buildAH1Z() {
  const g = new THREE.Group(), { C, C3, C2, D, X, X2, GB, G, K, HUB } = heliMats(0x575d5f, 0x62686a, 0x4d5355), MS = HOT(0xb8b8b0, 0.12), R = 0x262924;
  taper(g, 0.62, 0.17, 0.1, C, 0.12, 0.17, 0, 0.92, 0.8);   // (body)
  const nose = taper(g, 0.17, 0.23, 0.1, C, 0.505, 0.17, 0, 0.35, 0.5, 0.04); nose.rotation.z = -Math.PI / 2;   // (the nose: one wedge out of the body's front, its top sloping down and its belly up to the point, 0.4 m under the body's middle)
  canopy(g, 0.14, 0.07, 0.085, C, G, 0.4, 0.26, 0, 0.7, 0.75, -0.015, [['f', 1, 0.25], ['s', 1, 0.25], ['t', 1, 0]]);   // (the gunner's, low in front; the pilot's higher behind)
  canopy(g, 0.15, 0.1, 0.09, C, G, 0.29, 0.29, 0, 0.75, 0.75, -0.02, [['f', 1, 0.5], ['s', 2, 0.3], ['t', 1, 0]]);
  const ball = shade(new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), D)); ball.position.set(0.635, 0.13, 0); g.add(ball); box(g, 0.006, 0.028, 0.03, G, 0.673, 0.13, 0);   // (TSS: the sight ball on the nose's point)
  box(g, 0.06, 0.035, 0.05, D, 0.44, 0.07, 0); tube(g, 0.46, 0.6, 0.007, 0.007, D, 0.06, 0, 5); for (const s of [-1, 1]) tube(g, 0.46, 0.58, 0.005, 0.005, D, 0.072, s * 0.008, 4);   // (the 20 mm's three barrels)
  strut(g, P3(0.5, 0.215, 0), P3(0.43, 0.3, 0), 0.004, D); strut(g, P3(0.5, 0.092, 0), P3(0.44, 0.075, 0), 0.004, D);   // (wire cutters: up the gunner's windscreen from the nose, under the chin)
  for (const s of [-1, 1]) {
    strut(g, P3(0.57, 0.175, s * 0.02), P3(0.68, 0.185, s * 0.03), 0.003, D);   // (pitots, from the nose's top)
    tube(g, -0.2, 0.08, 0.042, 0.042, C2, 0.3, s * 0.065, 8); tube(g, 0.08, 0.1, 0.042, 0.035, D, 0.3, s * 0.065, 8); tube(g, 0.1, 0.103, 0.028, 0.028, K, 0.3, s * 0.065, 8);   // (engine, intake lip, intake)
    for (const x of [-0.14, -0.06, 0.02]) box(g, 0.05, 0.006, 0.03, D, x, 0.342, s * 0.065);
    const e = tube(g, -0.3, -0.2, 0.035, 0.04, X, 0.31, s * 0.075, 8); e.rotation.y = s * 0.35; box(g, 0.012, 0.05, 0.05, X2, -0.295, 0.31, s * 0.098).rotation.y = s * 0.35;   // (exhaust turned out, its hot mouth)
    box(g, 0.14, 0.018, 0.13, C, 0.0, 0.17, s * 0.11);   // (stub wing)
    box(g, 0.05, 0.02, 0.01, D, 0.0, 0.155, s * 0.085); tube(g, -0.09, 0.08, 0.026, 0.026, D, 0.12, s * 0.085, 8); tube(g, 0.08, 0.09, 0.026, 0.018, D, 0.12, s * 0.085, 8);   // (rocket pod)
    for (const [dy, dz] of [[0, 0], [0.012, 0], [-0.012, 0], [0.006, 0.011], [-0.006, 0.011], [0.006, -0.011], [-0.006, -0.011]]) tube(g, 0.09, 0.092, 0.004, 0.004, K, 0.12 + dy, s * 0.085 + dz, 5);
    box(g, 0.14, 0.012, 0.045, D, 0.0, 0.155, s * 0.142);   // (the Hellfire launcher: four on its rails)
    for (const dy of [0.137, 0.116]) for (const dz of [-0.014, 0.014]) { tube(g, -0.07, 0.06, 0.008, 0.008, MS, dy, s * 0.142 + dz, 6); tube(g, 0.06, 0.076, 0.008, 0.003, MS, dy, s * 0.142 + dz, 6); }
    box(g, 0.16, 0.012, 0.012, D, 0.0, 0.17, s * 0.181); tube(g, -0.07, 0.08, 0.008, 0.008, MS, 0.157, s * 0.181, 6); tube(g, 0.08, 0.095, 0.008, 0.003, MS, 0.157, s * 0.181, 6);   // (wingtip missile)
    box(g, 0.05, 0.02, 0.006, D, -0.2, 0.2, s * 0.05);   // (flare dispenser)
    tube(g, -0.24, 0.26, 0.009, 0.009, D, 0.009, s * 0.095, 6); strut(g, P3(0.26, 0.009, s * 0.095), P3(0.31, 0.035, s * 0.095), 0.009, D);   // (skid, its toe turned up)
    for (const x of [0.2, -0.12]) strut(g, P3(x, 0.09, s * 0.04), P3(x, 0.009, s * 0.095), 0.008, D);   // (cross tubes)
  }
  taper(g, 0.3, 0.06, 0.08, C, -0.02, 0.28, 0, 0.85, 0.7); box(g, 0.12, 0.04, 0.08, GB, 0.0, 0.33, 0); cyl(g, 0.02, 0.025, 0.06, 8, GB, 0.0, 0.37, 0);   // (deck, gearbox, mast)
  const tb = taper(g, 0.09, 0.66, 0.07, C, -0.5, 0.22, 0, 0.5, 0.55, 0.03); tb.rotation.z = Math.PI / 2;   // (tail boom)
  box(g, 0.45, 0.012, 0.018, C3, -0.42, 0.262, 0); strut(g, P3(-0.3, 0.26, 0), P3(-0.34, 0.31, 0), 0.004, D);   // (drive shaft cover, antenna)
  pair(g, [[-0.5, 0.0], [-0.52, 0.12], [-0.58, 0.12], [-0.58, 0.0]], 0.225, 0.012, C);   // (elevators, half way down the boom)
  taper(g, 0.13, 0.26, 0.025, C, -0.84, 0.36, 0, 0.55, 0.8, -0.06); box(g, 0.05, 0.04, 0.035, GB, -0.88, 0.44, 0);   // (fin, tail gearbox)
  strut(g, P3(-0.8, 0.22, 0), P3(-0.84, 0.13, 0), 0.006, D);   // (tail skid)
  heliRotor(g, 0.0, 0.41, 4, 0.73, 0.05, R, 'rotor', HUB);
  tailRotor(g, -0.88, 0.44, -0.03, 0.13, R);
  return heliDone(g, { w: [0, 1.6, 1.9], t: [-8.9, 4.6] });
}
/* Mi-8AMTSh — the enemies' armed transport: a big cabin with round windows, the glazed nose and its chin windows, the engines on
   the roof with dust filters on their intakes and exhausts turned out, fuel tanks on the sides, outriggers with two rocket pods
   each and missile tubes at their tips, a clamshell tail, a long boom, five blades, three on the tail rotor (port), wheels */
function buildMi8() {
  const g = new THREE.Group(), { C, C3, C2, D, X, X2, GB, G, K, HUB } = heliMats(0x5e6349, 0x686d52, 0x545940), R = 0x262924;
  const B = [[-1.1, 0.34, 0.016, 0.018, 0.018], [-1.08, 0.34, 0.022, 0.025, 0.025], [-0.6, 0.3, 0.042, 0.05, 0.05], [-0.52, 0.27, 0.07, 0.07, 0.075],   // (one body: the boom out of the clamshell doors,
    [-0.42, 0.235, 0.105, 0.1, 0.11, 3], [-0.33, 0.215, 0.125, 0.125, 0.125, 3.2], [0.4, 0.215, 0.125, 0.125, 0.125, 3.2], [0.47, 0.21, 0.118, 0.12, 0.125, 2.8],   //  the cabin,
    [0.53, 0.205, 0.105, 0.11, 0.115, 2.4], [0.58, 0.2, 0.085, 0.095, 0.095, 2.2], [0.615, 0.195, 0.055, 0.07, 0.065, 2], [0.635, 0.19, 0.02, 0.03, 0.025, 2]];   //  the round nose: glazed above, its chin windows)
  hull(g, B, C, { G, glass: [[0.47, 0.635, -8, 188], [0.53, 0.615, -62, -30], [0.53, 0.615, 210, 242]], seg: 18, fr: 0.007 });
  taper(g, 0.16, 0.3, 0.03, C, -1.1, 0.48, 0, 0.55, 0.8, -0.07); box(g, 0.05, 0.04, 0.04, GB, -1.13, 0.58, 0);   // (tail pylon, its gearbox)
  pair(g, [[-0.94, 0.0], [-0.96, 0.14], [-1.02, 0.14], [-1.02, 0.0]], 0.31, 0.012, C);   // (stabiliser)
  strut(g, P3(-1.0, 0.31, 0), P3(-1.04, 0.2, 0), 0.006, D);   // (tail bumper)
  hull(g, [[-0.19, 0.37, 0.05, 0.03, 0.02], [-0.14, 0.37, 0.1, 0.035, 0.05], [0.28, 0.37, 0.1, 0.035, 0.05], [0.35, 0.36, 0.06, 0.025, 0.03]], C, { k: 3 });   // (the engines' cowling)
  for (const s of [-1, 1]) {
    tube(g, -0.12, 0.28, 0.05, 0.05, C2, 0.39, s * 0.065, 12); tube(g, 0.28, 0.36, 0.055, 0.045, C3, 0.39, s * 0.065, 12); tube(g, 0.36, 0.363, 0.035, 0.035, K, 0.39, s * 0.065, 12);   // (engine, dust filter, intake)
    for (const x of [-0.04, 0.06, 0.16]) box(g, 0.06, 0.006, 0.04, D, x, 0.441, s * 0.065);
    const e = tube(g, -0.22, -0.12, 0.045, 0.04, X, 0.39, s * 0.1, 12); e.rotation.y = s * 0.6; box(g, 0.012, 0.055, 0.055, X2, -0.21, 0.39, s * 0.145).rotation.y = s * 0.6;   // (exhaust turned out, its hot mouth)
    tube(g, -0.32, -0.08, 0.055, 0.055, C3, 0.14, s * 0.15, 10); tube(g, -0.08, -0.04, 0.055, 0.025, C3, 0.14, s * 0.15, 10); tube(g, -0.36, -0.32, 0.025, 0.055, C3, 0.14, s * 0.15, 10);   // (fuel tank)
    box(g, 0.07, 0.02, 0.2, C, 0.1, 0.24, s * 0.215); strut(g, P3(0.1, 0.12, s * 0.12), P3(0.1, 0.232, s * 0.28), 0.008, D);   // (outrigger, its brace)
    for (const z of [0.2, 0.27]) { box(g, 0.05, 0.025, 0.012, D, 0.1, 0.218, s * z); tube(g, -0.02, 0.2, 0.032, 0.032, D, 0.175, s * z, 8); tube(g, 0.2, 0.22, 0.032, 0.02, D, 0.175, s * z, 8); }   // (rocket pods)
    box(g, 0.16, 0.05, 0.012, D, 0.1, 0.27, s * 0.312); for (const y of [0.255, 0.285]) tube(g, 0.02, 0.2, 0.011, 0.011, C3, y, s * 0.326, 6);   // (missile tubes at the tip)
    box(g, 0.06, 0.03, 0.006, D, -0.55, 0.3, s * 0.062);   // (flare dispenser)
    strut(g, P3(0.0, 0.1, s * (hullAt(B, 0, 0.1) - 0.005)), P3(0.0, 0.045, s * 0.2), 0.012, D); strut(g, P3(0.08, 0.11, s * (hullAt(B, 0.08, 0.11) - 0.005)), P3(0.0, 0.05, s * 0.2), 0.008, D); strut(g, P3(0.0, 0.05, s * 0.2), P3(0.0, 0.2, s * hullAt(B, 0, 0.2)), 0.01, D);   // (main gear: legs, brace, shock strut, from the body's side)
    wheel(g, 0.0, 0.045, s * 0.2, 0.045, 0.03, K); wheel(g, 0.5, 0.035, s * 0.025, 0.035, 0.02, K);
  }
  for (const x of [0.33, 0.23, 0.13, 0.03, -0.07]) cyl(g, 0.022, 0.022, 0.006, 10, G, x, 0.25, 0.126).rotation.x = Math.PI / 2;   // (round windows, starboard)
  for (const x of [0.13, 0.03, -0.07]) cyl(g, 0.022, 0.022, 0.006, 10, G, x, 0.25, -0.126).rotation.x = Math.PI / 2;
  skin(g, B, 0.28, 0.38, 0.11, 0.27, -1, C3); cyl(g, 0.02, 0.02, 0.006, 10, G, 0.33, 0.25, -0.129).rotation.x = Math.PI / 2;   // (the sliding door, port, its window)
  strut(g, P3(0.5, 0.1, 0), P3(0.5, 0.035, 0), 0.01, D);   // (nose gear)
  strut(g, P3(0.3, 0.34, 0), P3(0.25, 0.4, 0), 0.004, D);   // (antenna)
  box(g, 0.16, 0.06, 0.14, GB, -0.04, 0.45, 0); cyl(g, 0.025, 0.03, 0.08, 8, GB, -0.02, 0.5, 0);   // (main gearbox, mast)
  heliRotor(g, -0.02, 0.55, 5, 1.06, 0.055, R, 'rotor', HUB);
  tailRotor(g, -1.13, 0.58, -0.035, 0.19, R, [0, TAU / 3, TAU * 2 / 3]);
  return heliDone(g, { w: [1.0, 2.5, 3.3], t: [-11.2, 6.0] });
}
