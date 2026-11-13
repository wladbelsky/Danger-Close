'use strict';
/* ===== Lights at night =====
   Headlights on the vehicles of both sides, navigation lights on every helicopter in the air (red on the left, green on the
   right, a white strobe on the tail), searchlights sweeping the ground round the enemy's base and the allies' outposts, lamps in
   both, street lamps along the paved roads.
   The lamps themselves are additive sprites (one pool refilled every frame). Their LIGHT is a map: every cone and pool of light is
   drawn from above into one texture round the point the sensor looks at (LAMP_HALF m each way), and every lit material adds
   albedo × that map at its place in the world (sensorHook, js/sensor.js). So the ground, the vehicle ahead, the trees and the
   walls are all lit, for one small pass and one texture read: no real lights, nothing recompiles.
   What stands in the way casts a shadow: the heights of the whole map's fixed things (the ground, buildings, walls, trees) are baked
   once from above into LAMPS.hmap, and the light pass walks from each texel to its lamp over them (14 reads): a wall or a house
   stops a beam, a roof above the lamp stays dark, a forest is lit along its edge. Vehicles are not in it (a headlight is cut at
   the vehicle ahead instead), nor is the enemy's base.
   Cold on the thermal sensor: it sees heat, not light. The lit windows are in js/structures.js (WIN_MAT / WIN_DARK).   */
const LAMP_AT = { tank: [3.4, 1.15, 1.5], apc: [3.3, 0.95, 1.4], car: [2.3, 0.7, 1.0] };   // the lamps: ahead of the centre, to each side, up
const LAMP_HALF = 256, LAMP_N = 1024, HMAP_N = 2048;                                                      // the map: metres each way, texels
const LC_LASER = [1, 0.1, 0.05], LC_HEAD = [1, 0.9, 0.7], LC_STREET = [1, 0.7, 0.36], LC_SEARCH = [0.88, 0.94, 1], LC_YARD = [1, 0.86, 0.62];   // a lamp and its light: one colour
const BEAM_VS = `attribute vec4 iA; attribute vec4 iB; attribute vec4 iC; attribute vec4 iD; uniform vec3 uLampRect; varying vec2 vUv; varying vec4 vCol; varying vec2 vP; varying vec2 vW; varying vec3 vL;
  void main() {
    vUv = position.xy; vCol = iC; vP = iB.zw; vL = iD.xyz;
    vec2 dir = iA.zw, side = vec2(-dir.y, dir.x);
    float cone = step(iB.z, 0.5), along = position.x - 0.5 * (1.0 - cone), wide = mix(1.0, 0.35 + 0.65 * position.x, cone);   // (a cone starts at the lamp, narrow; a pool lies round its centre)
    vec2 xz = iA.xy + dir * along * iB.x + side * position.y * iB.y * wide;
    vW = xz;
    gl_Position = vec4((xz - uLampRect.xy) * uLampRect.z * 2.0, 0.0, 1.0);
  }`;
const BEAM_FS = `uniform sampler2D uHMap; uniform float uHK; varying vec2 vUv; varying vec4 vCol; varying vec2 vP; varying vec2 vW; varying vec3 vL;
  float H(vec2 p) { return texture2D(uHMap, vec2(p.x * uHK + 0.5, 0.5 - p.y * uHK)).r; }
  void main() {
    float f;
    if (vP.x < 0.5) { float across = 1.0 - smoothstep(0.0, 1.0, abs(vUv.y) * 2.0); f = across * across * smoothstep(0.0, 0.1, vUv.x) * pow(1.0 - vUv.x, 1.5) * (1.0 - smoothstep(vP.y - 0.08, vP.y, vUv.x)); }   // (soft edges, fading with the distance, cut at what stands in the way)
    else { float d = length(vec2(vUv.x - 0.5, vUv.y)) * 2.0; f = pow(max(0.0, 1.0 - d), 2.0); }
    if (f < 0.002) discard;
    float h0 = H(vW), y0 = h0 + 0.4, occ = smoothstep(4.0, 12.0, h0 - vL.z);   // (what is far above the lamp is not lit by it)
    for (int i = 1; i <= 14; i++) { float t = float(i) / 16.0; occ = max(occ, smoothstep(0.3, 1.6, H(mix(vW, vL.xy, t)) - mix(y0, vL.z, t))); }   // the way to the lamp over the heights
    gl_FragColor = vec4(vCol.rgb * vCol.a * f * (1.0 - occ), 1.0);
  }`;
const LAMPS = {
  fx: null, beams: null, rt: null, hmap: null, k: 0, n: 0, nb: 0, NB: 512, clean: false,
  init() {
    this.fx = new SpriteFX(scene, TEX.flash, THREE.AdditiveBlending, 500, false, 0); this.fx.mesh.renderOrder = 6;
    const geo = new THREE.InstancedBufferGeometry(), n = this.NB;
    geo.setAttribute('position', new THREE.Float32BufferAttribute([0, -0.5, 0, 1, -0.5, 0, 0, 0.5, 0, 1, 0.5, 0], 3)); geo.setIndex([0, 1, 2, 2, 1, 3]);
    const attr = k => { const a = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4).setUsage(THREE.DynamicDrawUsage); geo.setAttribute(k, a); return a; };
    this.aA = attr('iA'); this.aB = attr('iB'); this.aC = attr('iC'); this.aD = attr('iD'); geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({ uniforms: { uLampRect: SU.uLampRect, uHMap: { value: null }, uHK: { value: 1 / (MAP_HALF * 2) } }, vertexShader: BEAM_VS, fragmentShader: BEAM_FS, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide });
    this.beams = new THREE.Mesh(geo, mat); this.beams.frustumCulled = false;
    this.mapScene = new THREE.Scene(); this.mapScene.add(this.beams); this.mapCam = new THREE.Camera();
    this.rt = new THREE.WebGLRenderTarget(LAMP_N, LAMP_N, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.hmap = new THREE.WebGLRenderTarget(HMAP_N, HMAP_N, { type: THREE.HalfFloatType, format: THREE.RedFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    mat.uniforms.uHMap.value = this.hmap.texture;
    this.hCam = new THREE.OrthographicCamera(-MAP_HALF, MAP_HALF, MAP_HALF, -MAP_HALF, 1, 1200); this.hCam.position.set(0, 600, 0); this.hCam.rotation.x = -Math.PI / 2; this.hCam.updateMatrixWorld();
    this.hMat = new THREE.ShaderMaterial({ side: THREE.DoubleSide, vertexShader: `varying float vY;
      void main() {
        vec4 p = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          p = instanceMatrix * p;
        #endif
        vec4 mv = modelViewMatrix * p; vY = 600.0 + mv.z; gl_Position = projectionMatrix * mv;
      }`, fragmentShader: 'varying float vY; void main() { gl_FragColor = vec4(vY, 0.0, 0.0, 1.0); }' });
    SU.uLampMap.value = this.rt.texture; SU.uCamW.value = camera.matrixWorld; SU.uLampRect.value.set(0, 0, 1 / (LAMP_HALF * 2));
  },
  /* the heights of everything that stands still, seen from above (once the world is built, and again when a season reshapes the trees) */
  bake() {
    const keep = new Set([].concat(TERRAIN.chunks, TERRAIN.veg, STRUCT.meshes, STRUCT.towns)), vis = scene.children.map(o => o.visible), bg = scene.background, au = renderer.shadowMap.autoUpdate;
    scene.children.forEach(o => { o.visible = keep.has(o); }); scene.overrideMaterial = this.hMat; scene.background = null; renderer.shadowMap.autoUpdate = false;
    const col = renderer.getClearColor(new THREE.Color()), al = renderer.getClearAlpha();
    renderer.setRenderTarget(this.hmap); renderer.setClearColor(0x000000, 1); renderer.clear(); renderer.render(scene, this.hCam); renderer.setRenderTarget(null); renderer.setClearColor(col, al);
    scene.children.forEach((o, i) => { o.visible = vis[i]; }); scene.overrideMaterial = null; scene.background = bg; renderer.shadowMap.autoUpdate = au;
  },
  put(x, y, z, s, c, m, a) {
    const live = this.fx.live; if (live.length >= this.fx.n) return;
    const it = this.fx.items[live.length]; it.p.set(x, y, z); it.sc = s; it.rot = 0; it.a = a; it.col.setRGB(c[0] * m, c[1] * m, c[2] * m); live.push(it);
  },
  /* light on the map: kind 0 a cone from (x, z) along the angle a, len long and w wide at its far end, cut at the share `cut` of its
     length; kind 1 a pool len × w round (x, z) */
  light(kind, x, z, a, len, w, c, k, cut, lx, lz, ly) {
    const i = this.nb; if (i >= this.NB) return; this.nb++;
    const A = this.aA.array, B = this.aB.array, C = this.aC.array, D = this.aD.array, o = i * 4;
    A[o] = x; A[o + 1] = z; A[o + 2] = Math.cos(a); A[o + 3] = Math.sin(a);
    B[o] = len; B[o + 1] = w; B[o + 2] = kind; B[o + 3] = cut == null ? 1 : cut;
    D[o] = lx; D[o + 1] = lz; D[o + 2] = ly;   // where the lamp is (for the shadows)
    C[o] = c[0]; C[o + 1] = c[1]; C[o + 2] = c[2]; C[o + 3] = k;
  },
  near(x, z, m) { return Math.abs(x - CAM_TGT.x) < LAMP_HALF - m && Math.abs(z - CAM_TGT.z) < LAMP_HALF - m; },   // (on the map with its whole pool of light)
  /* a lamp on a pole: the lamp and the pool of light under it */
  pole(x, y, z, c, r, k) { if (!this.near(x, z, r)) return; this.put(x, y, z, 1.3, c, 2.4, k); this.light(1, x, z, 0, r * 2, r * 2, c, k, 1, x, z, y); },
  /* a searchlight on a tower at (x, z): the lamp and its spot on the ground, sweeping about the angle a */
  search(x, z, a, ph, k, h) {
    const d = a + Math.sin(T * 0.22 + ph) * 0.85;
    const y = groundH(x, z) + h; this.put(x, y, z, 1.6, LC_SEARCH, 2.8, k);
    this.light(0, x + Math.cos(d) * 4, z + Math.sin(d) * 4, d, 20, 9, LC_SEARCH, k * 1.2, 1, x, z, y);            // the beam grazing the ground on its way
    this.light(1, x + Math.cos(d) * 30, z + Math.sin(d) * 30, d, 34, 20, LC_SEARCH, k * 3.2, 1, x, z, y);         // the spot
  },
  update(dt) {
    const live = this.fx.live; live.length = 0; this.nb = 0;
    const k = this.k = smoothstep(0.35, 0.75, ENV.night);   // (they come on at dusk)
    if (k > 0.01) {
      for (const u of UNITS) {
        if (!u.alive) continue;
        const L = LAMP_AT[u.kind];
        if (L) {
          if (u.stopT == null) u.stopT = u.v > 0.3 ? 0 : 99;
          u.stopT = u.v > 0.3 ? 0 : u.stopT + dt;                                   // (lights out a minute after it stops: a parked column is dark, one halted in a fight is not)
          u.lampK = clamp((u.lampK || 0) + (u.stopT < 60 ? dt / 1.5 : -dt / 3), 0, 1);
          const a = k * u.lampK; if (a < 0.02) continue;
          const c = Math.cos(u.yaw), s = Math.sin(u.yaw), y = u.pos.y, fx = u.pos.x + c * L[0], fz = u.pos.z + s * L[0];
          this.put(fx - s * L[1], y + L[2], fz + c * L[1], 1.1, LC_HEAD, 2.6, a); this.put(fx + s * L[1], y + L[2], fz - c * L[1], 1.1, LC_HEAD, 2.6, a);
          let len = 22, cut = 1;   // the light stops at whatever stands in front of it (it lights the back of the next vehicle of the column, not the road beyond)
          for (const o of UNITS) { if (o === u || !o.alive || !LAMP_AT[o.kind]) continue; const dx = o.pos.x - fx, dz = o.pos.z - fz, al = dx * c + dz * s; if (al > 0 && al < len && Math.abs(dz * c - dx * s) < 3) cut = Math.min(cut, (al + 0.5) / len); }
          this.light(0, fx, fz, u.yaw, len, 15, LC_HEAD, a * 3.2, cut, fx, fz, y + L[2]);
        } else if (u.kind === 'heli') {
          if (u.state === 'pad' || u.state === 'crash') continue;
          const c = Math.cos(u.yaw), s = Math.sin(u.yaw), y = u.pos.y + 1.6;
          this.put(u.pos.x + s * 2.6, y, u.pos.z - c * 2.6, 1.4, [1, 0.05, 0.03], 3, k);     // port: red
          this.put(u.pos.x - s * 2.6, y, u.pos.z + c * 2.6, 1.4, [0.03, 1, 0.12], 3, k);     // starboard: green
          u.strobe = u.strobe == null ? Math.random() * 1.1 : (u.strobe + dt) % 1.1;
          if (u.strobe < 0.09) this.put(u.pos.x - c * 7.5, y + 1, u.pos.z - s * 7.5, 2.2, [1, 1, 1], 2.5, k);   // the tail strobe
        } else if (u.kind === 'struct' && BATTLE.base) {                             // the enemy's base
          if (u.type === 'bunker' || u.type === 'mast') this.search(u.pos.x, u.pos.z, Math.atan2(u.pos.z - BATTLE.base.z, u.pos.x - BATTLE.base.x), u.pos.x * 0.37, k, u.type === 'mast' ? 14 : 3.2);   // (outwards from its bunkers and its mast)
          else if (u.type === 'hq' || u.type === 'tent' || u.type === 'fuel' || u.type === 'ammo') { const q = BASE_LAMP[u.type], cy = Math.cos(u.obj.rotation.y), sy = Math.sin(u.obj.rotation.y); this.pole(u.pos.x + q[0] * cy + q[1] * sy, u.pos.y + 4.85, u.pos.z - q[0] * sy + q[1] * cy, LC_YARD, 13, k * 2.2); }     // (a lamp over each tent and dump: out when it is destroyed)
        }
      }
      for (const o of LAYOUT.outposts) {   // the allies' outposts: a searchlight on every watchtower, looking outwards over the wall; lamps in the yard
        if (!o.lamps) {
          const c = Math.cos(o.a), sn = Math.sin(o.a), W = (u, v) => { const vz = v * o.side; return [o.x + u * c - vz * sn, o.z + u * sn + vz * c]; };
          o.lamps = o.parts.filter(p => p.type === 'tower').map(p => { const [x, z] = W(p.u, p.v); return { x, z, a: Math.atan2(z - o.z, x - o.x) }; });
          o.yard = OP_LAMPS.map(([u, v]) => { const [x, z] = W(u, v); return { x, z }; });
        }
        for (const l of o.lamps) this.search(l.x, l.z, l.a, l.x * 0.11, k, 9);
        for (const l of o.yard) this.pole(l.x, o.y + 5.85, l.z, LC_YARD, 15, k * 2.4);
      }
      for (const l of LAYOUT.lamps || []) this.pole(l.x, l.y, l.z, LC_STREET, 17, k * 2.6);   // the street lamps
    }
    if (BATTLE.beam && BATTLE.beam.visible) {   // the laser's hit, day or night: a red glow on the ground and on what stands round it, flickering
      const h = BATTLE.lasHit, f = 0.8 + 0.2 * Math.sin(T * 47) * Math.sin(T * 13);
      this.put(h.x, h.y + 0.4, h.z, 2.4, LC_LASER, 3.6 * f, 1);
      this.light(1, h.x, h.z, 0, 26, 26, LC_LASER, (2.4 + 2.6 * this.k) * f, 1, h.x, h.z, h.y + 2);
    }
    this.n = live.length; this.fx.flush(camera);
    if (this.nb) for (const a of [this.aA, this.aB, this.aC, this.aD]) { a.needsUpdate = true; a.clearUpdateRanges(); a.addUpdateRange(0, this.nb * 4); }
    this.beams.geometry.instanceCount = this.nb;
  },
  /* the map of light for this frame (before the scene is drawn): centred on the sensor's point, snapped to its texels */
  draw() {
    if (!this.rt || (!this.nb && this.clean)) return;
    const t = LAMP_HALF * 2 / LAMP_N; SU.uLampRect.value.set(Math.round(CAM_TGT.x / t) * t, Math.round(CAM_TGT.z / t) * t, 1 / (LAMP_HALF * 2));
    const col = renderer.getClearColor(new THREE.Color()), al = renderer.getClearAlpha();
    renderer.setRenderTarget(this.rt); renderer.setClearColor(0x000000, 1); renderer.clear(); if (this.nb) renderer.render(this.mapScene, this.mapCam);
    renderer.setRenderTarget(null); renderer.setClearColor(col, al); this.clean = !this.nb;
  }
};
