'use strict';
/* ===== Vehicle models, facing +x, wheels on y = 0 (scaled to metres by the caller: T-90 / BTR ×3) =====
   Hot parts use HOT(colour, heat): the hull a little over the ground, tracks warm, the engine deck and exhausts hot. */
function tube(g, x0, x1, r0, r1, c, y, z, seg) { const m = cyl(g, r1, r0, x1 - x0, seg || 8, c, (x0 + x1) / 2, y || 0, z || 0); m.rotation.z = -Math.PI / 2; return m; }
function turretGroup(g, x, y) { const t = new THREE.Group(); t.name = 'turret'; t.position.set(x, y, 0); g.add(t); return t; }
const ARMOR_SCALE = 3;

/* ---- shared parts ---- */
const wheel = (g, x, y, z, r, w, c) => { const m = cyl(g, r, r, w, 8, c, x, y, z); m.rotation.x = Math.PI / 2; return m; };
/* the running gear of a tracked vehicle: the track's lower and upper runs, n road wheels, the sprocket and the idler raised at the ends */
function tracks(g, L, z, w, D, W, n, r) {
  const step = (L - 4 * r) / (n - 1);
  for (const s of [-1, 1]) {
    box(g, L, 0.06, w, D, 0, 0.03, s * z); box(g, L - 2.4 * r, 0.04, w, D, 0, 2 * r + 0.06, s * z);
    for (let i = 0; i < n; i++) wheel(g, -L / 2 + 2 * r + i * step, r + 0.02, s * z, r, w * 0.8, W);
    wheel(g, L / 2 - r * 0.7, r * 1.45, s * z, r * 0.85, w * 0.9, D); wheel(g, -L / 2 + r * 0.7, r * 1.45, s * z, r * 0.9, w * 0.9, D);
  }
}
/* a machine gun on a pintle: a dynamic node 'mg' (js/units.js raises it at the aircraft when its crew fires at it), the barrel
   along +x, the muzzle at userData.muzzle */
function mgGun(p, x, y, z, D, C, shield) {
  cyl(p, 0.014, 0.014, 0.1, 5, D, x, y - 0.06, z);
  const m = new THREE.Group(); m.name = 'mg'; m.position.set(x, y, z); p.add(m);
  box(m, 0.17, 0.05, 0.045, D, 0.02, 0, 0); tube(m, 0.1, 0.44, 0.013, 0.011, D, 0.008, 0, 5); tube(m, 0.4, 0.45, 0.018, 0.018, D, 0.008, 0, 5);
  box(m, 0.07, 0.06, 0.05, C, -0.01, -0.025, -0.055); box(m, 0.07, 0.015, 0.015, D, -0.1, -0.01, 0);
  if (shield) { box(m, 0.015, 0.15, 0.24, C, 0.1, 0.03, 0); for (const s of [-1, 1]) box(m, 0.08, 0.13, 0.012, C, 0.065, 0.03, s * 0.12).rotation.y = s * 0.5; }
  m.userData.muzzle = 0.45; return m;
}
/* smoke grenade launchers: a row of short tubes either side, tilted outward and up */
function smokers(t, x0, dx, n, y, z, D) { for (const s of [-1, 1]) for (let i = 0; i < n; i++) cyl(t, 0.024, 0.024, 0.08, 6, D, x0 + i * dx, y, s * z).rotation.x = s * 0.65; }
function antenna(g, x, y, z, h, D) { strut(g, new V3(x, y, z), new V3(x - 0.05, y + h, z), 0.006, D); }

/* T-90 — a low hull with a long sloped glacis under ERA, rounded turret with Kontakt-5 wedges, the Shtora's red eyes, a 12.7 mm
   machine gun on the commander's cupola, drums and a log at the back */
function buildT90() {
  const g = new THREE.Group(), C = HOT(0x4f5638, 0.17), C2 = HOT(0x434a30, 0.17), C3 = HOT(0x596042, 0.17), D = HOT(0x26292a, 0.26), W = HOT(0x3a3e33, 0.3), E = HOT(0x3a3f2e, 0.5), X = HOT(0x1e1f1e, 0.72), G = HOT(0x18222c, 0.1), R = HOT(0x45201a, 0.1), K = HOT(0x1d1e1c, 0.2);
  taper(g, 2.2, 0.3, 1.15, C, -0.05, 0.4, 0, 0.92, 0.95, -0.04);
  taper(g, 0.5, 0.24, 1.1, C, 1.12, 0.39, 0, 0.12, 1, -0.19);                                          // the glacis
  for (let i = 0; i < 5; i++) box(g, 0.32, 0.035, 0.19, C3, 1.165, 0.415, -0.42 + i * 0.21).rotation.z = -0.5;   // ERA on it
  tracks(g, 2.4, 0.55, 0.3, D, W, 6, 0.11);
  for (const s of [-1, 1]) {
    box(g, 2.45, 0.03, 0.36, C2, 0.02, 0.36, s * 0.55);                                              // fenders
    box(g, 1.2, 0.14, 0.02, K, 0.55, 0.29, s * 0.725); for (let i = 0; i < 4; i++) box(g, 0.25, 0.11, 0.03, C3, 0.13 + i * 0.27, 0.3, s * 0.745);   // rubber skirts, ERA on the front of them
    box(g, 0.5, 0.1, 0.2, C2, -0.45, 0.42, s * 0.6); box(g, 0.05, 0.05, 0.07, G, 1.2, 0.41, s * 0.48);   // stowage boxes, headlights
    const d = cyl(g, 0.11, 0.11, 0.36, 10, C2, -1.2, 0.5, s * 0.24); d.rotation.x = Math.PI / 2;     // fuel drums
  }
  const log = cyl(g, 0.055, 0.055, 1.05, 6, HOT(0x3a3226, 0.15), -1.07, 0.66, 0); log.rotation.x = Math.PI / 2;
  box(g, 0.8, 0.03, 0.85, E, -0.66, 0.56, 0); for (let i = 0; i < 4; i++) box(g, 0.07, 0.02, 0.7, X, -0.95 + i * 0.18, 0.58, 0);   // engine deck, grilles
  box(g, 0.3, 0.07, 0.06, X, -0.45, 0.46, -0.6);                                                      // exhaust
  cyl(g, 0.09, 0.09, 0.03, 8, C2, 0.8, 0.565, 0); box(g, 0.04, 0.03, 0.14, G, 0.9, 0.57, 0);         // driver's hatch, periscope
  const t = turretGroup(g, 0.05, 0.55);
  const tu = shade(new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 6, 0, TAU, 0, Math.PI / 2), C)); tu.scale.set(1.1, 0.55, 1); t.add(tu);
  for (const s of [-1, 1]) {
    box(t, 0.42, 0.16, 0.28, C3, 0.4, 0.13, s * 0.3).rotation.y = s * 0.45;                           // Kontakt-5 wedges
    for (let i = 0; i < 2; i++) box(t, 0.18, 0.04, 0.16, C3, 0.22 - i * 0.2, 0.27, s * 0.2);
    box(t, 0.12, 0.1, 0.14, C2, 0.52, 0.21, s * 0.36); box(t, 0.012, 0.07, 0.1, R, 0.585, 0.21, s * 0.36);   // the Shtora's dazzlers
  }
  box(t, 0.18, 0.18, 0.2, C2, 0.6, 0.12, 0);                                                          // mantlet
  tube(t, 0.6, 1.12, 0.05, 0.048, C2, 0.12, 0, 8); tube(t, 1.1, 1.26, 0.06, 0.06, C2, 0.12, 0, 8); tube(t, 1.24, 2.0, 0.044, 0.04, C2, 0.12, 0, 8); tube(t, 1.97, 2.05, 0.05, 0.05, D, 0.12, 0, 8);
  box(t, 0.16, 0.14, 0.14, C2, 0.28, 0.33, 0.25); box(t, 0.012, 0.08, 0.1, G, 0.365, 0.35, 0.25);    // gunner's sight
  cyl(t, 0.13, 0.15, 0.09, 10, C2, -0.1, 0.3, -0.22); for (const a of [-0.6, 0, 0.6]) box(t, 0.03, 0.03, 0.06, G, -0.1 + Math.cos(a) * 0.13, 0.33, -0.22 + Math.sin(a) * 0.13).rotation.y = -a;   // commander's cupola
  const mg = mgGun(t, -0.1, 0.43, -0.22, D, C2, false);
  smokers(t, -0.12, 0.08, 4, 0.2, 0.52, D);
  box(t, 0.22, 0.12, 0.6, C2, -0.64, 0.09, 0); box(t, 0.23, 0.015, 0.62, C3, -0.64, 0.155, 0);       // the stowage bin round the back
  tube(t, -0.55, -0.15, 0.035, 0.035, C2, 0.25, 0.42, 6);                                             // snorkel
  antenna(t, -0.45, 0.25, 0.3, 0.8, D);
  mergeStatic(g, [t, mg]); return g;
}
/* BTR-82A — a boat hull with a wedge bow and the trim vane folded on it, eight wheels (a gap between the second and third
   axles, the side doors there), a small turret with a 30 mm cannon and a machine gun on its roof */
function buildBTR() {
  const g = new THREE.Group(), C = HOT(0x5c6244, 0.17), C2 = HOT(0x4e5438, 0.17), C3 = HOT(0x676d4d, 0.17), D = HOT(0x26292a, 0.28), W = HOT(0x45493c, 0.3), E = HOT(0x444a36, 0.5), X = HOT(0x1e1f1e, 0.72), G = HOT(0x18222c, 0.1), K = HOT(0x1d1e1c, 0.26);
  taper(g, 2.2, 0.28, 0.78, C, -0.1, 0.36, 0, 1, 1.2);                                                 // lower hull, flaring out over the wheels
  taper(g, 2.2, 0.26, 0.94, C, -0.1, 0.63, 0, 0.94, 0.78);                                              // upper hull, sloped sides
  taper(g, 0.4, 0.28, 0.92, C, 1.2, 0.36, 0, 0.1, 1.02, -0.18).rotation.x = Math.PI;                    // the bow: a wedge
  taper(g, 0.4, 0.26, 0.92, C, 1.2, 0.63, 0, 0.1, 0.8, -0.18);
  box(g, 0.3, 0.02, 0.78, C3, 1.22, 0.65, 0).rotation.z = -0.58;                                         // trim vane, folded
  for (const x of [-0.9, -0.45, 0.3, 0.75]) for (const s of [-1, 1]) { wheel(g, x, 0.19, s * 0.44, 0.19, 0.14, K); wheel(g, x, 0.19, s * 0.515, 0.08, 0.02, W); }
  for (const s of [-1, 1]) {
    box(g, 0.3, 0.2, 0.02, C2, -0.08, 0.6, s * 0.44).rotation.x = -s * 0.38;                               // the side door
    box(g, 0.2, 0.03, 0.18, C2, 0.75, 0.775, s * 0.17); for (let i = 0; i < 2; i++) box(g, 0.03, 0.04, 0.07, G, 0.97, 0.745, s * (0.08 + i * 0.13));   // hatches, vision blocks
    box(g, 0.05, 0.05, 0.07, G, 1.3, 0.52, s * 0.3);                                                       // headlights
    box(g, 0.4, 0.08, 0.06, C2, -0.6, 0.72, s * 0.36);                                                     // stowage
  }
  box(g, 0.6, 0.03, 0.62, E, -0.8, 0.77, 0); for (let i = 0; i < 3; i++) box(g, 0.1, 0.02, 0.5, X, -1.0 + i * 0.2, 0.787, 0);   // engine deck, grilles
  box(g, 0.25, 0.06, 0.05, X, -0.75, 0.62, 0.45); box(g, 0.02, 0.16, 0.3, C2, -1.21, 0.4, 0);            // exhaust, the water jet's door
  antenna(g, -0.95, 0.76, 0.32, 0.75, D); antenna(g, -0.95, 0.76, -0.32, 0.6, D);
  const t = turretGroup(g, 0.3, 0.77);
  cyl(t, 0.24, 0.27, 0.1, 10, C2, 0, 0.05, 0); taper(t, 0.5, 0.13, 0.42, C2, 0.02, 0.165, 0, 0.75, 0.8);
  box(t, 0.1, 0.1, 0.12, C2, 0.27, 0.15, 0); tube(t, 0.3, 1.05, 0.026, 0.022, D, 0.15, 0, 6); tube(t, 1.0, 1.08, 0.034, 0.034, D, 0.15, 0, 6); tube(t, 0.3, 0.45, 0.012, 0.012, D, 0.15, 0.09, 5);   // 30 mm, coax
  box(t, 0.12, 0.1, 0.1, C2, 0.05, 0.28, -0.15); box(t, 0.01, 0.06, 0.07, G, 0.115, 0.29, -0.15);        // sight
  smokers(t, -0.14, 0.07, 3, 0.2, 0.22, D);
  const mg = mgGun(t, -0.1, 0.33, 0.1, D, C3, false);
  mergeStatic(g, [t, mg]); return g;
}

/* ---- the allies' vehicles (a sandier olive) and the enemies' car ---- */
/* M1 Abrams — long flat hull, angular turret with a bustle rack, skirts, the commander's .50 behind a shield */
function buildAbrams() {
  const g = new THREE.Group(), C = HOT(0x78734f, 0.17), C2 = HOT(0x69644a, 0.17), C3 = HOT(0x837e5a, 0.17), D = HOT(0x26292a, 0.26), W = HOT(0x4a4a40, 0.3), E = HOT(0x5c573e, 0.52), X = HOT(0x1e1f1e, 0.8), G = HOT(0x18222c, 0.1);
  taper(g, 2.5, 0.34, 1.2, C, 0, 0.42, 0, 0.92, 0.95, 0.04);
  tracks(g, 2.6, 0.57, 0.3, D, W, 7, 0.1);
  for (const s of [-1, 1]) {
    box(g, 2.65, 0.03, 0.34, C2, 0, 0.36, s * 0.57); box(g, 2.5, 0.2, 0.06, C2, 0.05, 0.34, s * 0.72);
    for (let i = 0; i < 5; i++) box(g, 0.012, 0.2, 0.065, D, -0.9 + i * 0.45, 0.34, s * 0.72);           // the skirts' panel joints
    box(g, 0.05, 0.05, 0.07, G, 1.22, 0.5, s * 0.45);
  }
  box(g, 0.6, 0.05, 0.95, E, -0.95, 0.61, 0); for (let i = 0; i < 3; i++) box(g, 0.1, 0.02, 0.8, X, -1.15 + i * 0.2, 0.64, 0);
  box(g, 0.06, 0.2, 0.7, X, -1.31, 0.46, 0); box(g, 0.04, 0.03, 0.16, G, 0.95, 0.6, 0);
  const t = turretGroup(g, -0.08, 0.59);
  taper(t, 1.3, 0.3, 1.05, C, 0.05, 0.15, 0, 0.82, 0.9, 0.06); box(t, 0.4, 0.22, 0.98, C2, -0.72, 0.13, 0);
  box(t, 0.28, 0.14, 1.0, C3, -1.0, 0.18, 0); for (const z of [-0.5, 0.5]) box(t, 0.3, 0.05, 0.015, D, -1.0, 0.27, z); box(t, 0.015, 0.05, 1.0, D, -1.14, 0.27, 0);   // the bustle rack, packed
  box(t, 0.12, 0.2, 0.32, C2, 0.7, 0.15, 0);
  tube(t, 0.7, 1.3, 0.05, 0.05, C2, 0.16, 0, 8); tube(t, 1.25, 1.45, 0.066, 0.066, C2, 0.16, 0, 8); tube(t, 1.4, 2.12, 0.047, 0.044, C2, 0.16, 0, 8); tube(t, 2.08, 2.15, 0.052, 0.052, D, 0.16, 0, 8);
  box(t, 0.2, 0.14, 0.18, C2, 0.35, 0.36, -0.28); box(t, 0.012, 0.08, 0.13, G, 0.455, 0.38, -0.28);    // gunner's sight
  cyl(t, 0.06, 0.06, 0.13, 8, C2, 0.12, 0.38, 0.3);                                                      // the commander's viewer
  cyl(t, 0.13, 0.14, 0.07, 10, C2, -0.25, 0.33, 0.26); const mg = mgGun(t, -0.2, 0.44, 0.26, D, C2, true);
  cyl(t, 0.11, 0.11, 0.03, 8, C2, -0.25, 0.31, -0.26); tube(t, -0.25, 0.08, 0.01, 0.01, D, 0.37, -0.26, 4); box(t, 0.1, 0.04, 0.035, D, -0.22, 0.37, -0.26);   // loader's hatch, M240
  smokers(t, 0.28, 0.07, 3, 0.25, 0.47, D);
  strut(t, new V3(-0.45, 0.3, 0), new V3(-0.45, 0.48, 0), 0.008, D); antenna(t, -0.7, 0.24, 0.42, 0.75, D); antenna(t, -0.7, 0.24, -0.42, 0.75, D);
  mergeStatic(g, [t, mg]); return g;
}
/* M2 Bradley — tall boxy hull, a sloped glacis, armour tiles on the skirts, a ramp at the back, the two-man turret off to the
   side with the 25 mm and the TOW box */
function buildBradley() {
  const g = new THREE.Group(), C = HOT(0x7a7552, 0.17), C2 = HOT(0x6a6548, 0.17), C3 = HOT(0x847f5b, 0.17), D = HOT(0x26292a, 0.26), W = HOT(0x4a4a40, 0.3), E = HOT(0x5e593f, 0.52), X = HOT(0x1e1f1e, 0.8), G = HOT(0x18222c, 0.1);
  taper(g, 2.15, 0.62, 1.08, C, 0, 0.52, 0, 0.88, 0.95, -0.08);
  tracks(g, 2.25, 0.5, 0.28, D, W, 6, 0.1);
  for (const s of [-1, 1]) {
    box(g, 2.1, 0.26, 0.05, C2, 0, 0.38, s * 0.66); for (let i = 0; i < 6; i++) box(g, 0.32, 0.22, 0.03, C3, -0.85 + i * 0.34, 0.39, s * 0.69);
    box(g, 0.05, 0.05, 0.07, G, 1.0, 0.62, s * 0.4);
  }
  box(g, 0.5, 0.05, 0.4, E, 0.6, 0.84, 0.25); for (let i = 0; i < 3; i++) box(g, 0.08, 0.02, 0.34, X, 0.45 + i * 0.15, 0.87, 0.25);
  box(g, 0.03, 0.5, 0.7, C2, -1.08, 0.48, 0); box(g, 0.2, 0.03, 0.18, C2, 0.55, 0.835, -0.2);          // the ramp, the driver's hatch
  antenna(g, -0.85, 0.83, 0.38, 0.7, D);
  const t = turretGroup(g, 0.0, 0.83); t.position.z = -0.12;
  taper(t, 0.68, 0.26, 0.6, C2, 0, 0.13, 0, 0.85, 0.9); box(t, 0.18, 0.18, 0.62, C3, -0.42, 0.14, 0);
  box(t, 0.1, 0.12, 0.12, C2, 0.33, 0.17, 0.05); tube(t, 0.3, 1.02, 0.026, 0.022, D, 0.17, 0.05, 6); tube(t, 0.98, 1.06, 0.034, 0.034, D, 0.17, 0.05, 6);   // 25 mm
  box(t, 0.4, 0.16, 0.13, C2, -0.06, 0.2, -0.38); box(t, 0.012, 0.12, 0.1, D, 0.145, 0.2, -0.38);       // the TOW box
  box(t, 0.12, 0.1, 0.1, C2, 0.12, 0.3, 0.18); box(t, 0.012, 0.06, 0.07, G, 0.185, 0.31, 0.18);         // sight
  cyl(t, 0.1, 0.1, 0.03, 8, C2, -0.12, 0.27, 0.12); smokers(t, 0.1, 0.06, 2, 0.2, 0.3, D);
  mergeStatic(g, [t]); return g;
}
/* HMMWV — wide and low, a flat hood, glass, a gunner's ring with a shield and a machine gun */
function buildHumvee() {
  const g = new THREE.Group(), C = HOT(0x7e7856, 0.16), C2 = HOT(0x6c6649, 0.16), D = HOT(0x222424, 0.25), W = HOT(0x5a5a50, 0.25), E = HOT(0x6a6448, 0.5), G = HOT(0x18222c, 0.12), L = HOT(0x9a9a8a, 0.2);
  box(g, 1.6, 0.3, 0.74, C, 0, 0.4, 0); box(g, 0.52, 0.1, 0.72, E, 0.52, 0.6, 0);
  taper(g, 0.9, 0.3, 0.72, C, -0.22, 0.7, 0, 0.92, 0.9); box(g, 0.02, 0.18, 0.62, G, 0.24, 0.74, 0);
  box(g, 0.02, 0.14, 0.5, G, -0.66, 0.74, 0); box(g, 0.03, 0.12, 0.5, D, 0.8, 0.43, 0); box(g, 0.06, 0.06, 0.8, D, 0.83, 0.3, 0);   // rear glass, grille, bumper
  for (const s of [-1, 1]) {
    for (const x of [-0.42, 0.0]) box(g, 0.34, 0.13, 0.01, G, x, 0.75, s * 0.345);                         // side windows
    for (const x of [-0.5, 0.5]) { wheel(g, x, 0.18, s * 0.36, 0.18, 0.13, D); wheel(g, x, 0.18, s * 0.43, 0.08, 0.02, W); }
    box(g, 0.02, 0.05, 0.08, L, 0.805, 0.5, s * 0.28); box(g, 0.02, 0.06, 0.05, D, 0.25, 0.82, s * 0.41);  // headlights, mirrors
  }
  antenna(g, -0.62, 0.55, 0.32, 0.7, D);
  const t = turretGroup(g, -0.28, 0.85);
  cyl(t, 0.15, 0.16, 0.12, 8, C2, 0, 0.06, 0); box(t, 0.03, 0.14, 0.34, C2, 0.14, 0.15, 0);
  for (const s of [-1, 1]) box(t, 0.12, 0.12, 0.02, C2, 0.08, 0.14, s * 0.18).rotation.y = s * 0.6;
  const mg = mgGun(t, 0.0, 0.2, 0, D, C2, false);
  mergeStatic(g, [t, mg]); return g;
}
/* a technical: a faded pickup with a heavy machine gun on a post in the bed (behind a shield), a spare wheel and cans in the bed */
function buildTechnical() {
  const g = new THREE.Group(), C = HOT(0x9a9282, 0.15), C2 = HOT(0x7e776a, 0.15), D = HOT(0x222424, 0.25), W = HOT(0x77736a, 0.25), E = HOT(0x8a8274, 0.5), G = HOT(0x18222c, 0.12), L = HOT(0xa8a898, 0.2), K = HOT(0x1d1e1c, 0.2), J = HOT(0x4e5a3a, 0.15);
  box(g, 1.75, 0.24, 0.66, C, 0, 0.38, 0); box(g, 0.5, 0.14, 0.64, E, 0.6, 0.57, 0);
  taper(g, 0.48, 0.3, 0.64, C, 0.13, 0.65, 0, 0.78, 0.9, -0.04); box(g, 0.02, 0.18, 0.56, G, 0.32, 0.66, 0); box(g, 0.02, 0.14, 0.5, G, -0.115, 0.68, 0);
  for (const s of [-1, 1]) {
    box(g, 0.82, 0.16, 0.04, C2, -0.45, 0.58, s * 0.31); box(g, 0.26, 0.13, 0.01, G, 0.13, 0.69, s * 0.295);
    for (const x of [-0.55, 0.58]) { wheel(g, x, 0.17, s * 0.33, 0.17, 0.12, D); wheel(g, x, 0.17, s * 0.4, 0.07, 0.02, W); }
    box(g, 0.02, 0.05, 0.08, L, 0.86, 0.47, s * 0.24); box(g, 0.02, 0.05, 0.05, D, 0.3, 0.7, s * 0.37);
  }
  box(g, 0.04, 0.16, 0.62, C2, -0.85, 0.58, 0); box(g, 0.05, 0.06, 0.68, D, 0.89, 0.3, 0);
  cyl(g, 0.15, 0.15, 0.08, 10, K, -0.72, 0.54, 0.12); for (const z of [-0.2, -0.08]) box(g, 0.1, 0.16, 0.08, J, -0.74, 0.58, z);   // spare wheel, jerrycans
  const t = turretGroup(g, -0.48, 0.62);
  box(t, 0.04, 0.3, 0.04, D, 0, 0.15, 0);
  const mg = mgGun(t, 0, 0.36, 0, D, C2, true);
  mergeStatic(g, [t, mg]); return g;
}

/* a wreck: one burnt colour, cooling in four stages (noBake: the merged mesh's baked heat no longer counts) */
const WRECK_MATS = [0.62, 0.34, 0.14, 0.02].map(h => { const m = sensorMat(new THREE.MeshPhongMaterial({ color: 0x1b1a18, flatShading: true, shininess: 2, specular: 0x080808 }), h); m.userData.shared = true; m.userData.noBake = true; return m; });
function toWreck(g, stage) { g.traverse(o => { if (o.isMesh) o.material = WRECK_MATS[stage]; }); }
