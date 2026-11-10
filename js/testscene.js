'use strict';
/* ===== Stage 1 test scene (goes away with the map generator): a patch of ground, two houses, trees, a road,
   a live T-90, a knocked-out one, a BTR, and shells landing around them ===== */
const TESTS = { root: null, burn: new V3(), tSmoke: 0, tShell: 0.3, tGun: 0 };
function testGroundTex(season) {
  const S = SEASONS[season], s = 512, c = document.createElement('canvas'); c.width = c.height = s;
  const g = c.getContext('2d'), col = h => '#' + h.toString(16).padStart(6, '0');
  g.fillStyle = col(S.ground); g.fillRect(0, 0, s, s);
  for (let i = 0; i < 5200; i++) { g.fillStyle = col(pick(S.grass)); g.globalAlpha = rand(0.12, 0.5); const r = rand(1, 5); g.fillRect(rand(0, s), rand(0, s), r, r); }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(36, 36); t.anisotropy = 4; return t;
}
function buildTestScene() {
  const root = TESTS.root = new THREE.Group(); scene.add(root);
  const gm = sensorMat(new THREE.MeshPhongMaterial({ map: testGroundTex(seasonNow()), color: 0x7f8a70, shininess: 0, specular: 0 })); gm.userData.albK = 1.0; gm.userData.heat = 0.16;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), gm); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; root.add(ground);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(1400, 9), sensorMat(new THREE.MeshPhongMaterial({ color: 0x3a3b3d, shininess: 0, specular: 0 }), 0.05)); road.rotation.x = -Math.PI / 2; road.rotation.z = 0.5; road.position.set(0, 0.03, 26); road.receiveShadow = true; root.add(road);

  const town = new THREE.Group(); root.add(town);
  for (const [x, z, w, d, h, c, rot] of [[-52, -26, 22, 12, 18, 0x8a8074, 0.5], [-16, -40, 14, 11, 7, 0xa59a86, 0.5], [44, -28, 18, 10, 6, 0x7a7468, 0.2], [60, 34, 26, 14, 22, 0x9a9488, 0.5]]) {
    const b = new THREE.Group(); b.position.set(x, 0, z); b.rotation.y = rot; town.add(b);
    box(b, w, h, d, c, 0, h / 2, 0); box(b, w + 0.6, 0.5, d + 0.6, ROOF_MAT, 0, h + 0.25, 0); box(b, w * 0.2, 2, d * 0.3, 0x55524c, w * 0.2, h + 1.2, 0);
  }
  for (let i = 0; i < 90; i++) {
    const a = rand(0, TAU), r = rand(30, 200), x = Math.cos(a) * r, z = Math.sin(a) * r; if (Math.abs(z - 26 + x * 0.55) < 12) continue;
    const h = rand(5, 9); cyl(town, 0.3, 0.5, h * 0.5, 5, HOT(0x4a3a2a, -0.03), x, h * 0.25, z);
    const c = shade(new THREE.Mesh(new THREE.IcosahedronGeometry(h * 0.55, 0), HOT(pick([0x34562a, 0x3c6030, 0x2e4c26]), 0.03))); c.position.set(x, h * 0.75, z); town.add(c);
  }
  mergeStatic(town, []);

  const put = (m, x, z, yaw, stage) => { m.scale.setScalar(ARMOR_SCALE); m.position.set(x, 0, z); m.rotation.y = yaw; if (stage != null) toWreck(m, stage); root.add(m); return m; };
  put(buildT90(), -26, 2, 0.5); put(buildBTR(), -40, 13, 0.5);
  const wreck = put(buildT90(), 14, -8, -1.1, 0); wreck.getObjectByName('turret').rotation.y = 0.9; wreck.getObjectByName('turret').rotation.z = 0.08;
  put(buildBTR(), 34, 8, 2.2, 2);
  TESTS.burn.set(14, 3.2, -8);
  FX.scorch.spawn(new V3(14, 0, -8), 7, 1e6);
  SENSOR_DEMO.warm();
}
const _tp = new V3(), _tv = new V3();
const SENSOR_DEMO = {
  warm() { for (let i = 0; i < 120; i++) this.update(0.05); },
  update(dt) {
    TESTS.tSmoke -= dt;
    while (TESTS.tSmoke <= 0) {
      TESTS.tSmoke += 0.09;
      _tp.copy(TESTS.burn).add(_tv.set(rand(-1.2, 1.2), 0, rand(-1.2, 1.2)));
      FX.smoke.spawn(_tp, { s0: 2.4, s1: 13, life: rand(3.5, 6), a0: 0.34, color: 0x24211e, rise: 0.4, v: _tv.set(WIND.x * 4.5 + rand(-1.6, 1.6), 3, WIND.z * 4.5 + rand(-1.6, 1.6)), drag: 0.05 });
      if (Math.random() < 0.55) FX.fire.spawn(_tp, { s0: 2.2, s1: 4.6, life: rand(0.3, 0.65), a0: 0.9, v: _tv.set(0, 3, 0) });
    }
    TESTS.tShell -= dt;
    if (TESTS.tShell <= 0) { TESTS.tShell = rand(0.8, 1.5); blast(_tp.set(rand(-34, 30), 0, rand(-22, 30)), rand(1.4, 3)); }
    TESTS.tGun -= dt;
    if (TESTS.tGun <= 0) {
      TESTS.tGun = 0.05; const x = -8 + rand(-5, 5), z = 16 + rand(-5, 5);
      FX.tracers.spawn(_tp.set(x - 70, 110, z + 40), _tv.set(70, -110, -40).multiplyScalar(11), { life: 0.09, len: 9, w: 0.28, color: 0xffd090 });
      if (Math.random() < 0.5) FX.dust.spawn(_tp.set(x, 0.4, z), { s0: 1, s1: 4, life: 0.7, a0: 0.4, color: ENV.dustTint.getHex(), rise: 1 });
    }
  }
};
