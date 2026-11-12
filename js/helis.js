'use strict';
/* ===== Helicopter models (from FAB's airframes: 1 unit = 10 m, scaled by HELI_SCALE; nose +x, skids / wheels on y = 0) =====
   The rotors are groups named 'rotor' / 'rotor2' / 'trotor' (dynamic: spun by units.js); engines and exhausts are hot.
   No navigation lights: point sprites would bypass the sensor.                                                       */
const HELI_SCALE = 10;
const HCAN = () => M(0x1a2838, { shininess: 90, specular: 0x88aacc });
function mirrorZ(pts) { return pts.map(p => [p[0], -p[1]]); }
function pair(g, pts, y, t, c) { prism(g, pts, y, t, c); prism(g, mirrorZ(pts), y, t, c); }
/* a main rotor: n blades of len about a hub (no blur disc: the sensor shows the blades stepping round, as real footage does) */
function heliRotor(g, x, y, n, len, chord, color, name) {
  const r = new THREE.Group(); r.name = name || 'rotor'; r.position.set(x, y, 0); g.add(r);
  cyl(r, 0.05, 0.05, 0.05, 6, color, 0, 0, 0);
  for (let i = 0; i < n; i++) { const h = new THREE.Group(); h.rotation.y = i * TAU / n; r.add(h); box(h, len, 0.018, chord, color, len / 2 + 0.04, 0, 0).castShadow = false; }
  return r;
}
function tailRotor(g, x, y, z, r, color) {
  const t = new THREE.Group(); t.name = 'trotor'; t.position.set(x, y, z); g.add(t);
  box(t, 0.03, r * 2, 0.02, color, 0, 0, 0); box(t, r * 2, 0.03, 0.02, color, 0, 0, 0); return t;
}
function heliDone(g) { const dyn = []; g.traverse(o => { if (o !== g && o.name) dyn.push(o); }); mergeStatic(g, dyn); g.scale.setScalar(HELI_SCALE); return g; }

/* UH-60 Black Hawk — the allies' transport */
function buildUH60() {
  const g = new THREE.Group(), C = HOT(0x474d3c, 0.2), C2 = HOT(0x3f4535, 0.62), D = HOT(0x2a2d2a, 0.3), X = HOT(0x1e1f1e, 0.85), CAN = HCAN();
  taper(g, 0.46, 0.2, 0.24, C, 0.03, 0.14, 0, 1.0, 0.85); taper(g, 0.22, 0.2, 0.235, C, 0.37, 0.14, 0, 0.55, 0.8, -0.05);
  taper(g, 0.14, 0.11, 0.2, C, 0.53, 0.095, 0, 0.6, 0.8, -0.03); taper(g, 0.12, 0.1, 0.24, CAN, 0.43, 0.2, 0, 0.4, 0.8, -0.035);
  for (const s of [-1, 1]) { box(g, 0.15, 0.065, 0.006, CAN, 0.36, 0.175, s * 0.119); box(g, 0.17, 0.14, 0.006, D, 0.04, 0.12, s * 0.122); }
  taper(g, 0.5, 0.07, 0.19, C, -0.01, 0.275, 0, 0.85, 0.75);
  for (const s of [-1, 1]) {
    tube(g, -0.19, 0.09, 0.045, 0.045, C2, 0.285, s * 0.1); const x = box(g, 0.08, 0.04, 0.05, X, -0.21, 0.29, s * 0.13); x.rotation.y = s * 0.5;
    box(g, 0.1, 0.015, 0.2, C, -0.05, 0.22, s * 0.2); tube(g, -0.12, 0.05, 0.035, 0.035, D, 0.17, s * 0.28, 6);
  }
  const tc = taper(g, 0.17, 0.64, 0.16, C, -0.49, 0.145, 0, 0.35, 0.38, 0.05); tc.rotation.z = Math.PI / 2;
  taper(g, 0.17, 0.32, 0.045, C, -0.86, 0.36, 0, 0.55, 0.8, -0.06);
  pair(g, [[-0.8, 0.0], [-0.82, 0.22], [-0.92, 0.22], [-0.92, 0.0]], 0.22, 0.015, C);
  for (const s of [-1, 1]) { const st = box(g, 0.025, 0.09, 0.025, D, 0.33, 0.07, s * 0.145); st.rotation.x = s * 0.35; wheel(g, 0.33, 0.035, s * 0.165, 0.035, 0.03, 0x1a1a1a); }
  box(g, 0.025, 0.06, 0.025, D, -0.42, 0.06, 0); wheel(g, -0.43, 0.03, 0, 0.03, 0.025, 0x1a1a1a);
  heliRotor(g, 0.0, 0.38, 4, 0.77, 0.055, 0x2a2d30);
  const th = new THREE.Group(); th.position.set(-0.9, 0.43, 0.04); th.rotation.x = -0.35; th.name = 'hub'; g.add(th); tailRotor(th, 0, 0, 0, 0.167, 0x2a2d30);
  return heliDone(g);
}
/* AH-64 Apache — the allies' attack helicopter: tandem cockpit, chin sensors, stub wings with rockets and missiles */
function buildAH64() {
  const g = new THREE.Group(), C = HOT(0x3e4436, 0.2), C2 = HOT(0x363b30, 0.62), D = HOT(0x262924, 0.3), X = HOT(0x1e1f1e, 0.85), CAN = HCAN();
  taper(g, 0.5, 0.17, 0.13, C, 0.3, 0.16, 0, 0.9, 0.8); taper(g, 0.16, 0.08, 0.11, CAN, 0.43, 0.27, 0, 0.7, 0.75, -0.01); taper(g, 0.18, 0.11, 0.115, CAN, 0.25, 0.29, 0, 0.75, 0.75, -0.02);
  box(g, 0.1, 0.1, 0.09, D, 0.6, 0.14, 0); taper(g, 0.4, 0.2, 0.15, C, -0.08, 0.18, 0, 1, 0.8);
  for (const s of [-1, 1]) { tube(g, -0.25, 0.08, 0.05, 0.05, C2, 0.26, s * 0.13, 8); box(g, 0.08, 0.04, 0.06, X, -0.28, 0.27, s * 0.15).rotation.y = s * 0.6; }
  taper(g, 0.32, 0.08, 0.12, C, 0.02, 0.33, 0, 0.8, 0.7);
  const lb = shade(new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), C)); lb.position.set(0.02, 0.52, 0); lb.scale.y = 0.55; g.add(lb);
  tube(g, 0.42, 0.56, 0.008, 0.008, D, 0.06, 0, 4);
  pair(g, [[0.05, 0.06], [0.03, 0.3], [-0.08, 0.3], [-0.1, 0.06]], 0.17, 0.02, C);
  for (const s of [-1, 1]) { tube(g, -0.1, 0.1, 0.028, 0.028, D, 0.12, s * 0.15, 8); for (const dz of [-0.015, 0.015]) tube(g, -0.08, 0.08, 0.01, 0.01, 0xb8b8b0, 0.11, s * 0.26 + dz, 5); }
  const tb = taper(g, 0.11, 0.55, 0.08, C, -0.55, 0.2, 0, 0.45, 0.5, 0.04); tb.rotation.z = Math.PI / 2;
  pair(g, [[-0.82, 0.0], [-0.84, 0.17], [-0.92, 0.17], [-0.92, 0.0]], 0.2, 0.012, C); taper(g, 0.12, 0.28, 0.025, C, -0.84, 0.36, 0, 0.55, 0.8, -0.05);
  for (const s of [-1, 1]) { const st = box(g, 0.02, 0.1, 0.02, D, 0.36, 0.07, s * 0.12); st.rotation.x = s * 0.4; wheel(g, 0.36, 0.035, s * 0.15, 0.035, 0.025, 0x1a1a1a); }
  wheel(g, -0.86, 0.025, 0, 0.025, 0.02, 0x1a1a1a);
  heliRotor(g, 0.02, 0.43, 4, 0.73, 0.05, 0x262924);
  tailRotor(g, -0.88, 0.48, -0.03, 0.14, 0x262924);
  return heliDone(g);
}
/* Mi-24 Hind — the enemies': tandem bubble cockpits, a troop cabin, stub wings, five blades */
function buildMi24() {
  const g = new THREE.Group(), C = HOT(0x6a6648, 0.2), C2 = HOT(0x5a5640, 0.62), D = HOT(0x26292a, 0.3), CAN = HCAN();
  taper(g, 0.6, 0.22, 0.2, C, 0.05, 0.18, 0, 0.9, 0.85); taper(g, 0.34, 0.16, 0.16, C, 0.5, 0.14, 0, 0.75, 0.8, -0.03); box(g, 0.2, 0.07, 0.13, C, 0.4, 0.25, 0);   // (the nose, and the step the rear cockpit sits on)
  for (const [x, y, s] of [[0.5, 0.2, 0.06], [0.37, 0.27, 0.07]]) { const c = shade(new THREE.Mesh(new THREE.SphereGeometry(s, 8, 6, 0, TAU, 0, Math.PI / 2), CAN)); c.position.set(x, y, 0); c.scale.set(1.4, 1, 1); g.add(c); }
  for (const s of [-1, 1]) { tube(g, -0.2, 0.15, 0.05, 0.05, C2, 0.33, s * 0.11, 8); box(g, 0.24, 0.02, 0.3, C, -0.05, 0.2, s * 0.22).rotation.x = s * -0.2; tube(g, -0.15, 0.08, 0.03, 0.03, D, 0.13, s * 0.3, 8); }
  const tb = taper(g, 0.1, 0.7, 0.08, C, -0.62, 0.24, 0, 0.45, 0.5, 0.04); tb.rotation.z = Math.PI / 2;
  taper(g, 0.14, 0.26, 0.025, C, -0.98, 0.36, 0, 0.6, 0.8, -0.05);
  tailRotor(g, -1.0, 0.38, 0.04, 0.15, 0x262924);
  cyl(g, 0.025, 0.03, 0.08, 6, D, 0.0, 0.42, 0);
  heliRotor(g, 0.0, 0.46, 5, 0.85, 0.05, 0x262924);
  return heliDone(g);
}
/* Ka-52 — the enemies' coaxial attack helicopter: side-by-side cockpit, no tail rotor */
function buildKa52() {
  const g = new THREE.Group(), C = HOT(0x4e5446, 0.2), C2 = HOT(0x444a3c, 0.62), D = HOT(0x26292a, 0.3), CAN = HCAN();
  taper(g, 0.55, 0.2, 0.17, C, 0.2, 0.18, 0, 0.9, 0.85); taper(g, 0.22, 0.16, 0.16, C, 0.55, 0.15, 0, 0.6, 0.8, -0.04); taper(g, 0.2, 0.12, 0.17, CAN, 0.42, 0.3, 0, 0.6, 0.8, -0.03);
  for (const s of [-1, 1]) { tube(g, -0.22, 0.12, 0.05, 0.05, C2, 0.3, s * 0.13, 8); box(g, 0.25, 0.02, 0.22, C, -0.02, 0.2, s * 0.18); tube(g, -0.12, 0.1, 0.028, 0.028, D, 0.15, s * 0.26, 8); }
  const tb = taper(g, 0.1, 0.6, 0.08, C, -0.58, 0.22, 0, 0.45, 0.5, 0.04); tb.rotation.z = Math.PI / 2;
  pair(g, [[-0.78, 0.0], [-0.8, 0.18], [-0.9, 0.18], [-0.9, 0.0]], 0.2, 0.015, C);
  for (const s of [-1, 1]) taper(g, 0.1, 0.18, 0.02, C, -0.88, 0.26, s * 0.18, 0.6, 1, -0.03);
  cyl(g, 0.025, 0.025, 0.2, 6, D, 0.02, 0.45, 0);
  heliRotor(g, 0.02, 0.42, 3, 0.68, 0.05, 0x262924); heliRotor(g, 0.02, 0.55, 3, 0.68, 0.05, 0x262924, 'rotor2');
  return heliDone(g);
}
