'use strict';
/* ===== Vehicle models, facing +x, wheels on y = 0 (scaled to metres by the caller: T-90 / BTR ×3) =====
   Hot parts use HOT(colour, heat): the hull a little over the ground, tracks warm, the engine deck and exhausts hot. */
function tube(g, x0, x1, r0, r1, c, y, z, seg) { const m = cyl(g, r1, r0, x1 - x0, seg || 8, c, (x0 + x1) / 2, y || 0, z || 0); m.rotation.z = -Math.PI / 2; return m; }
function turretGroup(g, x, y) { const t = new THREE.Group(); t.name = 'turret'; t.position.set(x, y, 0); g.add(t); return t; }
const ARMOR_SCALE = 3;

/* T-90 — low hull, rounded turret with ERA blocks, long 125 mm gun */
function buildT90() {
  const g = new THREE.Group(), C = HOT(0x4f5638, 0.17), C2 = HOT(0x434a30, 0.17), D = HOT(0x26292a, 0.26), E = HOT(0x3a3f2e, 0.5), X = HOT(0x1e1f1e, 0.72);
  taper(g, 2.3, 0.3, 1.15, C, 0, 0.4, 0, 0.9, 0.95, 0.05);
  for (const s of [-1, 1]) { box(g, 2.4, 0.3, 0.3, D, 0, 0.17, s * 0.55); box(g, 2.3, 0.05, 0.34, C2, 0, 0.34, s * 0.55); }
  box(g, 0.25, 0.25, 0.9, C2, -1.15, 0.45, 0);                                   // fuel drums at the back
  box(g, 0.8, 0.05, 0.85, E, -0.66, 0.57, 0);                                    // engine deck
  for (const s of [-1, 1]) box(g, 0.3, 0.06, 0.12, X, -0.5, 0.42, s * 0.6);      // exhausts on the sides
  const t = turretGroup(g, 0.1, 0.55);
  const tu = shade(new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 6, 0, TAU, 0, Math.PI / 2), C)); tu.scale.set(1.1, 0.55, 1); t.add(tu);
  for (const s of [-1, 1]) box(t, 0.35, 0.12, 0.25, C2, 0.35, 0.12, s * 0.3).rotation.y = s * 0.4;   // ERA
  tube(t, 0.4, 2.0, 0.045, 0.04, C2, 0.12, 0, 6);
  mergeStatic(g, [t]); return g;
}
/* BTR-82 — eight-wheeled APC with a small MG turret */
function buildBTR() {
  const g = new THREE.Group(), C = HOT(0x5c6244, 0.17), C2 = HOT(0x4e5438, 0.17), D = HOT(0x26292a, 0.28), E = HOT(0x444a36, 0.5);
  taper(g, 2.3, 0.45, 0.95, C, 0, 0.55, 0, 0.88, 0.85);
  box(g, 0.6, 0.04, 0.6, E, -0.75, 0.79, 0);
  for (const x of [-0.8, -0.3, 0.3, 0.8]) for (const s of [-1, 1]) { const w = cyl(g, 0.17, 0.17, 0.14, 8, D, x, 0.17, s * 0.45); w.rotation.x = Math.PI / 2; }
  const t = turretGroup(g, 0.35, 0.8);
  cyl(t, 0.22, 0.25, 0.18, 8, C2, 0, 0.09, 0); tube(t, 0.2, 0.75, 0.02, 0.018, D, 0.1, 0, 5);
  mergeStatic(g, [t]); return g;
}

/* ---- the allies' vehicles (a sandier olive) and the enemies' car ---- */
const wheel = (g, x, y, z, r, w, c) => { const m = cyl(g, r, r, w, 8, c, x, y, z); m.rotation.x = Math.PI / 2; return m; };
/* M1 Abrams — long flat hull, angular turret with a bustle, side skirts, the turbine's exhaust at the back */
function buildAbrams() {
  const g = new THREE.Group(), C = HOT(0x78734f, 0.17), C2 = HOT(0x69644a, 0.17), D = HOT(0x26292a, 0.26), E = HOT(0x5c573e, 0.52), X = HOT(0x1e1f1e, 0.8);
  taper(g, 2.6, 0.34, 1.2, C, 0, 0.42, 0, 0.92, 0.95, 0.04);
  for (const s of [-1, 1]) { box(g, 2.65, 0.3, 0.3, D, 0, 0.17, s * 0.57); box(g, 2.5, 0.2, 0.06, C2, 0.05, 0.36, s * 0.72); }
  box(g, 0.6, 0.05, 0.95, E, -0.95, 0.61, 0); box(g, 0.06, 0.2, 0.7, X, -1.31, 0.46, 0);
  const t = turretGroup(g, -0.08, 0.59);
  taper(t, 1.3, 0.3, 1.05, C, 0.05, 0.15, 0, 0.82, 0.9, 0.06); box(t, 0.4, 0.22, 0.98, C2, -0.72, 0.13, 0);
  tube(t, 0.6, 2.1, 0.05, 0.045, C2, 0.16, 0, 6); box(t, 0.14, 0.12, 0.14, D, -0.15, 0.36, 0.26);
  mergeStatic(g, [t]); return g;
}
/* M2 Bradley — tall boxy hull, a sloped glacis, a small two-man turret off to the side with the TOW box */
function buildBradley() {
  const g = new THREE.Group(), C = HOT(0x7a7552, 0.17), C2 = HOT(0x6a6548, 0.17), D = HOT(0x26292a, 0.26), E = HOT(0x5e593f, 0.52);
  taper(g, 2.15, 0.62, 1.08, C, 0, 0.52, 0, 0.88, 0.95, -0.08);
  for (const s of [-1, 1]) { box(g, 2.2, 0.3, 0.28, D, 0, 0.16, s * 0.5); box(g, 2.1, 0.26, 0.05, C2, 0, 0.38, s * 0.66); }
  box(g, 0.5, 0.05, 0.4, E, 0.6, 0.84, 0.25);
  const t = turretGroup(g, 0.0, 0.83); t.position.z = -0.12;
  taper(t, 0.68, 0.26, 0.6, C2, 0, 0.13, 0, 0.85, 0.9); tube(t, 0.3, 1.0, 0.025, 0.02, D, 0.17, 0.05, 5); box(t, 0.36, 0.16, 0.12, C2, -0.06, 0.2, -0.36);
  mergeStatic(g, [t]); return g;
}
/* HMMWV — wide and low, a flat hood, a gunner's ring with a machine gun */
function buildHumvee() {
  const g = new THREE.Group(), C = HOT(0x7e7856, 0.16), C2 = HOT(0x6c6649, 0.16), D = HOT(0x222424, 0.25), E = HOT(0x6a6448, 0.5), G = HOT(0x18222c, 0.12);
  box(g, 1.6, 0.3, 0.74, C, 0, 0.4, 0); box(g, 0.52, 0.1, 0.72, E, 0.52, 0.6, 0);
  taper(g, 0.9, 0.3, 0.72, C, -0.22, 0.7, 0, 0.92, 0.9); box(g, 0.02, 0.18, 0.62, G, 0.24, 0.74, 0);
  for (const x of [-0.5, 0.5]) for (const s of [-1, 1]) wheel(g, x, 0.18, s * 0.36, 0.18, 0.13, D);
  const t = turretGroup(g, -0.28, 0.85);
  cyl(t, 0.15, 0.16, 0.12, 8, C2, 0, 0.06, 0); tube(t, 0.05, 0.42, 0.015, 0.015, D, 0.14, 0, 5); box(t, 0.03, 0.12, 0.24, C2, 0.1, 0.16, 0);
  mergeStatic(g, [t]); return g;
}
/* a technical: a faded pickup with a heavy machine gun on a post in the bed */
function buildTechnical() {
  const g = new THREE.Group(), C = HOT(0x9a9282, 0.15), C2 = HOT(0x7e776a, 0.15), D = HOT(0x222424, 0.25), E = HOT(0x8a8274, 0.5), G = HOT(0x18222c, 0.12);
  box(g, 1.75, 0.24, 0.66, C, 0, 0.38, 0); box(g, 0.5, 0.14, 0.64, E, 0.6, 0.57, 0);
  taper(g, 0.48, 0.3, 0.64, C, 0.13, 0.65, 0, 0.78, 0.9, -0.04); box(g, 0.02, 0.18, 0.56, G, 0.32, 0.66, 0);
  for (const s of [-1, 1]) box(g, 0.82, 0.16, 0.04, C2, -0.45, 0.58, s * 0.31); box(g, 0.04, 0.16, 0.62, C2, -0.85, 0.58, 0);
  for (const x of [-0.55, 0.58]) for (const s of [-1, 1]) wheel(g, x, 0.17, s * 0.33, 0.17, 0.12, D);
  const t = turretGroup(g, -0.48, 0.62);
  box(t, 0.04, 0.3, 0.04, D, 0, 0.15, 0); tube(t, -0.12, 0.42, 0.02, 0.018, D, 0.3, 0, 5); box(t, 0.03, 0.16, 0.26, C2, 0.1, 0.34, 0);
  mergeStatic(g, [t]); return g;
}

/* a wreck: one burnt colour, cooling in four stages (noBake: the merged mesh's baked heat no longer counts) */
const WRECK_MATS = [0.62, 0.34, 0.14, 0.02].map(h => { const m = sensorMat(new THREE.MeshPhongMaterial({ color: 0x1b1a18, flatShading: true, shininess: 2, specular: 0x080808 }), h); m.userData.shared = true; m.userData.noBake = true; return m; });
function toWreck(g, stage) { g.traverse(o => { if (o.isMesh) o.material = WRECK_MATS[stage]; }); }
