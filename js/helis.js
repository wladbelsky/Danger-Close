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
function heliDone(g, nav) { const dyn = []; g.traverse(o => { if (o !== g && o.name) dyn.push(o); }); mergeStatic(g, dyn); g.scale.setScalar(HELI_SCALE); g.userData.nav = nav; return g; }
const heliMats = (c, c3, c2) => ({ C: HOT(c, 0.2), C3: HOT(c3, 0.2), C2: HOT(c2, 0.62), D: HOT(0x262924, 0.3), X: HOT(0x1e1f1e, 0.85), X2: HOT(0x2a2422, 0.97), GB: HOT(0x34372e, 0.42), G: HGLASS(), K: HOT(0x161616, 0.22), HUB: HOT(0x2a2c28, 0.35) });
const P3 = (x, y, z) => new V3(x, y, z);

/* UH-60 Black Hawk — the allies' transport: framed windscreen, cabin doors and windows, door guns, the canted tail rotor */
function buildUH60() {
  const g = new THREE.Group(), { C, C3, C2, D, X, X2, GB, G, K, HUB } = heliMats(0x474d3c, 0x51574a, 0x3f4535), R = 0x2a2d30;
  taper(g, 0.46, 0.2, 0.24, C, 0.03, 0.14, 0, 1.0, 0.85); taper(g, 0.22, 0.2, 0.235, C, 0.37, 0.14, 0, 0.55, 0.8, -0.05);
  taper(g, 0.14, 0.11, 0.2, C, 0.53, 0.095, 0, 0.6, 0.8, -0.03); taper(g, 0.12, 0.1, 0.24, G, 0.43, 0.2, 0, 0.4, 0.8, -0.035);   // (cabin, cockpit, nose, windscreen)
  strut(g, P3(0.49, 0.15, 0), P3(0.42, 0.25, 0), 0.004, D); for (const s of [-1, 1]) strut(g, P3(0.49, 0.15, s * 0.115), P3(0.42, 0.25, s * 0.093), 0.004, D);   // (the windscreen's posts)
  box(g, 0.05, 0.006, 0.2, D, 0.4, 0.252, 0);
  for (const s of [-1, 1]) {
    box(g, 0.15, 0.065, 0.006, G, 0.36, 0.175, s * 0.119); box(g, 0.006, 0.07, 0.008, D, 0.31, 0.175, s * 0.12);   // (cockpit door window, its frame)
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
  taper(g, 0.5, 0.17, 0.13, C, 0.3, 0.16, 0, 0.9, 0.8); taper(g, 0.16, 0.08, 0.11, G, 0.43, 0.27, 0, 0.7, 0.75, -0.01); taper(g, 0.18, 0.11, 0.115, G, 0.25, 0.29, 0, 0.75, 0.75, -0.02);
  box(g, 0.12, 0.008, 0.008, D, 0.42, 0.312, 0); box(g, 0.13, 0.008, 0.008, D, 0.23, 0.347, 0); box(g, 0.008, 0.008, 0.085, D, 0.42, 0.312, 0); box(g, 0.008, 0.008, 0.09, D, 0.24, 0.347, 0);   // (canopy frames)
  for (const s of [-1, 1]) { box(g, 0.15, 0.006, 0.006, D, 0.43, 0.275, s * 0.05); box(g, 0.17, 0.006, 0.006, D, 0.25, 0.3, s * 0.052); }
  box(g, 0.012, 0.1, 0.1, D, 0.34, 0.29, 0);   // (the blast panel between the seats)
  cyl(g, 0.045, 0.045, 0.05, 10, D, 0.62, 0.115, 0); for (const s of [-1, 1]) { tube(g, 0.6, 0.67, 0.03, 0.03, D, 0.115, s * 0.055, 8); box(g, 0.006, 0.03, 0.03, G, 0.672, 0.115, s * 0.055); }   // (TADS)
  cyl(g, 0.022, 0.022, 0.04, 8, D, 0.58, 0.225, 0); box(g, 0.006, 0.02, 0.02, G, 0.602, 0.225, 0);   // (PNVS)
  for (const s of [-1, 1]) strut(g, P3(0.55, 0.2, s * 0.04), P3(0.65, 0.21, s * 0.06), 0.003, D);
  strut(g, P3(0.5, 0.315, 0), P3(0.36, 0.36, 0), 0.004, D); strut(g, P3(0.5, 0.08, 0), P3(0.44, 0.07, 0), 0.004, D);   // (wire cutters)
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
  box(g, 0.012, 0.05, 0.012, D, -0.86, 0.05, 0); wheel(g, -0.86, 0.025, 0, 0.025, 0.02, K);
  heliRotor(g, 0.02, 0.43, 4, 0.73, 0.05, R, 'rotor', HUB);
  tailRotor(g, -0.88, 0.48, -0.03, 0.14, R, [0, 0.96, Math.PI, Math.PI + 0.96]);   // (the scissor tail rotor)
  return heliDone(g, { w: [-0.2, 1.9, 3.3], t: [-9.2, 5.0] });
}
/* Mi-24 Hind — the enemies': tandem bubble cockpits, the chin gun, a troop cabin, anhedral wings with rocket pods and missile
   rails at the tips, five blades, wheels */
function buildMi24() {
  const g = new THREE.Group(), { C, C3, C2, D, X, X2, GB, G, K, HUB } = heliMats(0x6a6648, 0x77734f, 0x5a5640), R = 0x262924;
  taper(g, 0.6, 0.22, 0.2, C, 0.05, 0.18, 0, 0.9, 0.85); taper(g, 0.34, 0.16, 0.16, C, 0.5, 0.14, 0, 0.75, 0.8, -0.03); box(g, 0.2, 0.07, 0.13, C, 0.4, 0.25, 0);   // (cabin, nose, the step the rear cockpit sits on)
  for (const [x, y, s] of [[0.5, 0.2, 0.06], [0.37, 0.27, 0.07]]) {
    const c = shade(new THREE.Mesh(new THREE.SphereGeometry(s, 10, 6, 0, TAU, 0, Math.PI / 2), G)); c.position.set(x, y, 0); c.scale.set(1.4, 1, 1); g.add(c);
    box(g, s * 2.4, 0.007, 0.007, D, x, y + s * 0.99, 0); box(g, 0.007, 0.007, s * 1.4, D, x - s * 0.3, y + s * 0.93, 0);   // (the bubble's frames)
  }
  cyl(g, 0.035, 0.035, 0.04, 8, D, 0.6, 0.065, 0); tube(g, 0.6, 0.7, 0.007, 0.007, D, 0.058, 0, 4); tube(g, 0.6, 0.69, 0.005, 0.005, D, 0.07, 0.008, 4);   // (chin turret, its four barrels)
  box(g, 0.08, 0.035, 0.03, D, 0.6, 0.12, -0.075); box(g, 0.006, 0.02, 0.02, G, 0.642, 0.12, -0.075); tube(g, 0.58, 0.66, 0.018, 0.014, D, 0.11, 0.075, 6);   // (guidance and sight pods)
  strut(g, P3(0.64, 0.17, 0.05), P3(0.78, 0.17, 0.06), 0.004, D);   // (air data boom)
  for (const s of [-1, 1]) {
    for (const x of [0.17, 0.08, -0.01]) box(g, 0.04, 0.035, 0.006, G, x, 0.21, s * 0.094);   // (troop cabin windows)
    box(g, 0.12, 0.13, 0.005, C3, 0.18, 0.16, s * 0.097);   // (the clamshell door)
    tube(g, -0.2, 0.15, 0.05, 0.05, C2, 0.33, s * 0.11, 8); tube(g, 0.15, 0.22, 0.055, 0.035, C3, 0.33, s * 0.11, 8);   // (engine, the intake's dust filter)
    for (const x of [-0.12, -0.04, 0.04]) box(g, 0.05, 0.006, 0.04, D, x, 0.381, s * 0.11);
    const e = tube(g, -0.29, -0.2, 0.04, 0.035, X, 0.33, s * 0.14, 8); e.rotation.y = s * 0.5; box(g, 0.012, 0.05, 0.05, X2, -0.285, 0.33, s * 0.18).rotation.y = s * 0.5;   // (exhaust, its hot mouth)
    box(g, 0.24, 0.02, 0.3, C, -0.05, 0.2, s * 0.22).rotation.x = s * 0.2;   // (stub wing, tips down)
    for (const z of [0.17, 0.28]) { const y = 0.2 - (z - 0.22) * 0.2; box(g, 0.06, 0.025, 0.012, D, -0.05, y - 0.022, s * z); tube(g, -0.15, 0.08, 0.03, 0.03, D, y - 0.06, s * z, 8); tube(g, 0.08, 0.1, 0.03, 0.016, D, y - 0.06, s * z, 8); }   // (rocket pods)
    box(g, 0.2, 0.06, 0.012, D, -0.05, 0.16, s * 0.375); for (const y of [0.135, 0.185]) tube(g, -0.13, 0.08, 0.011, 0.011, C3, y, s * 0.39, 6);   // (the wingtip's missile rails and tubes)
    box(g, 0.06, 0.025, 0.006, D, -0.36, 0.24, s * 0.042);   // (flare dispenser)
    strut(g, P3(-0.03, 0.12, s * 0.09), P3(-0.03, 0.035, s * 0.19), 0.01, D); strut(g, P3(-0.1, 0.13, s * 0.09), P3(-0.03, 0.04, s * 0.19), 0.006, D); wheel(g, -0.03, 0.035, s * 0.19, 0.035, 0.025, K);   // (main gear)
    wheel(g, 0.52, 0.025, s * 0.02, 0.025, 0.015, K);
  }
  strut(g, P3(0.5, 0.08, 0), P3(0.52, 0.025, 0), 0.008, D);   // (nose gear)
  taper(g, 0.34, 0.06, 0.12, C, -0.02, 0.32, 0, 0.85, 0.7); box(g, 0.12, 0.04, 0.09, GB, 0.0, 0.37, 0); cyl(g, 0.035, 0.035, 0.02, 10, D, -0.14, 0.355, 0);   // (deck, gearbox, the oil cooler's fan)
  const tb = taper(g, 0.1, 0.7, 0.08, C, -0.62, 0.24, 0, 0.45, 0.5, 0.04); tb.rotation.z = Math.PI / 2;
  box(g, 0.5, 0.012, 0.018, C3, -0.55, 0.29, 0); strut(g, P3(-0.4, 0.28, 0), P3(-0.45, 0.34, 0), 0.004, D); strut(g, P3(-0.83, 0.21, 0), P3(-0.87, 0.12, 0), 0.006, D);   // (shaft cover, antenna, tail skid)
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
  taper(g, 0.55, 0.2, 0.17, C, 0.2, 0.18, 0, 0.9, 0.85); taper(g, 0.22, 0.16, 0.16, C, 0.55, 0.15, 0, 0.6, 0.8, -0.04); taper(g, 0.2, 0.12, 0.17, G, 0.42, 0.3, 0, 0.6, 0.8, -0.03);
  box(g, 0.13, 0.008, 0.008, D, 0.39, 0.362, 0); box(g, 0.006, 0.008, 0.136, D, 0.45, 0.362, 0); strut(g, P3(0.52, 0.24, 0), P3(0.45, 0.36, 0), 0.004, D);   // (canopy frames)
  for (const s of [-1, 1]) { box(g, 0.18, 0.006, 0.006, D, 0.41, 0.3, s * 0.078); strut(g, P3(0.52, 0.24, s * 0.085), P3(0.45, 0.36, s * 0.068), 0.004, D); }
  tube(g, 0.66, 0.75, 0.055, 0.025, C3, 0.16, 0, 10);   // (radome)
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
  const tb = taper(g, 0.1, 0.6, 0.08, C, -0.58, 0.22, 0, 0.45, 0.5, 0.04); tb.rotation.z = Math.PI / 2;
  box(g, 0.4, 0.012, 0.018, C3, -0.5, 0.27, 0); strut(g, P3(-0.3, 0.26, 0), P3(-0.35, 0.32, 0), 0.004, D); strut(g, P3(-0.78, 0.2, 0), P3(-0.8, 0.12, 0), 0.006, D);
  for (const s of [-1, 1]) box(g, 0.06, 0.025, 0.006, D, -0.36, 0.22, s * 0.042);
  pair(g, [[-0.78, 0.0], [-0.8, 0.18], [-0.9, 0.18], [-0.9, 0.0]], 0.2, 0.015, C);
  cyl(g, 0.025, 0.025, 0.2, 6, D, 0.02, 0.45, 0);
  heliRotor(g, 0.02, 0.42, 3, 0.68, 0.05, R, 'rotor', HUB); heliRotor(g, 0.02, 0.55, 3, 0.68, 0.05, R, 'rotor2', HUB);
  return heliDone(g, { w: [-0.2, 2.1, 3.2], t: [-9.1, 3.2] });
}
