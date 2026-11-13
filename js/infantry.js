'use strict';
/* ===== Infantry: every soldier of both sides in two instanced meshes (bodies; legs, two per soldier, swinging as they walk).
   A soldier faces +x, feet at y = 0, 1.8 m tall. The uniform's colour is the instance colour (allies tan, enemies green-grey),
   multiplied into the vertex colours (gear darker, the rifle black). People are warm on the thermal sensor.            */
const INF_MAX = 320;
const INF_COL = { ally: new THREE.Color(0x9a8e68), enemy: new THREE.Color(0x5e664c) };
/* boxes [w (x), h, d (z), x, y, z, grey] → one non-indexed geometry with vertex colours */
function boxesGeo(list) {
  const pos = [], nor = [], col = [];
  for (const [w, h, d, x, y, z, k, rz] of list) {
    const g = new THREE.BoxGeometry(w, h, d).toNonIndexed(); if (rz) g.rotateZ(rz); g.translate(x, y, z);
    pos.push(g.attributes.position.array); nor.push(g.attributes.normal.array);
    const c = new Float32Array(g.attributes.position.count * 3).fill(GAMMA(k)); col.push(c); g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(concatF32(pos), 3)); geo.setAttribute('normal', new THREE.BufferAttribute(concatF32(nor), 3)); geo.setAttribute('color', new THREE.BufferAttribute(concatF32(col), 3));
  return geo;
}
const INF_BODY_GEO = boxesGeo([
  [0.26, 0.6, 0.42, 0, 1.2, 0, 1],            // torso
  [0.3, 0.36, 0.46, 0.01, 1.28, 0, 0.72],     // vest
  [0.2, 0.42, 0.34, -0.22, 1.25, 0, 0.62],    // pack
  [0.2, 0.2, 0.2, 0.02, 1.62, 0, 0.9],        // head
  [0.27, 0.12, 0.27, 0.01, 1.75, 0, 0.75],    // helmet
  [0.42, 0.1, 0.1, 0.16, 1.32, 0.17, 0.95],   // arms forward to the rifle
  [0.42, 0.1, 0.1, 0.16, 1.32, -0.17, 0.95],
  [0.8, 0.07, 0.06, 0.3, 1.3, 0.06, 0.12, 0.12]   // rifle
]);
const INF_LEG_GEO = boxesGeo([[0.15, 0.88, 0.16, 0, -0.44, 0, 0.85], [0.2, 0.1, 0.17, 0.04, -0.85, 0, 0.35]]);   // (hangs from the hip)
const INF_MAT = sensorMat(new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: true, shininess: 6, specular: 0x111111 }), 0.6);
INF_MAT.userData.shared = true;
const _im = new THREE.Matrix4(), _iq = new THREE.Quaternion(), _ie = new THREE.Euler(0, 0, 0, 'YZX'), _is = new V3(1, 1, 1), _ip = new V3(), _io = new V3();
const INF = {
  list: [], body: null, legs: null,
  build() {
    this.body = new THREE.InstancedMesh(INF_BODY_GEO, INF_MAT, INF_MAX); this.legs = new THREE.InstancedMesh(INF_LEG_GEO, INF_MAT, INF_MAX * 2);
    for (const m of [this.body, this.legs]) { m.count = 0; m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); }
    this.body.setColorAt(0, INF_COL.ally); this.legs.setColorAt(0, INF_COL.ally);   // (creates the colour buffers)
  },
  /* a new soldier (the squads move it): { position, a (heading), y, phase, moving, side, visible } — it is its own HUD track */
  add(side, x, z) {
    if (this.list.length >= INF_MAX) return null;
    const s = { position: new V3(x, groundH(x, z), z), a: 0, phase: Math.random() * TAU, stride: 0, side, visible: true };
    this.list.push(s); TRACKS.push({ obj: s, side, inf: true, h: 1.1 }); return s;
  },
  remove(s) { const i = this.list.indexOf(s); if (i >= 0) this.list.splice(i, 1); const k = TRACKS.findIndex(t => t.obj === s); if (k >= 0) TRACKS.splice(k, 1); },
  /* the instances from the soldiers, once a frame */
  update() {
    let n = 0;
    for (const s of this.list) {
      if (!s.visible) continue;
      _ie.set(0, -s.a, 0); _iq.setFromEuler(_ie); _im.compose(s.position, _iq, _is); this.body.setMatrixAt(n, _im); this.body.setColorAt(n, INF_COL[s.side]);
      const sw = Math.sin(s.phase) * 0.5 * s.stride;
      for (let k = 0; k < 2; k++) {
        const side = k ? 1 : -1; _io.set(0, 0.9, side * 0.1).applyQuaternion(_iq); _ip.copy(s.position).add(_io);
        _ie.set(0, -s.a, sw * side); _iq.setFromEuler(_ie); _im.compose(_ip, _iq, _is); this.legs.setMatrixAt(n * 2 + k, _im); this.legs.setColorAt(n * 2 + k, INF_COL[s.side]);
        _ie.set(0, -s.a, 0); _iq.setFromEuler(_ie);
      }
      n++;
    }
    this.body.count = n; this.legs.count = n * 2;
    for (const m of [this.body, this.legs]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  }
};
