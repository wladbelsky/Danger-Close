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

/* a wreck: one burnt colour, cooling in four stages (noBake: the merged mesh's baked heat no longer counts) */
const WRECK_MATS = [0.62, 0.34, 0.14, 0.02].map(h => { const m = sensorMat(new THREE.MeshPhongMaterial({ color: 0x1b1a18, flatShading: true, shininess: 2, specular: 0x080808 }), h); m.userData.shared = true; m.userData.noBake = true; return m; });
function toWreck(g, stage) { g.traverse(o => { if (o.isMesh) o.material = WRECK_MATS[stage]; }); }
