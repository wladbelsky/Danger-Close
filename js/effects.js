'use strict';
/* ===== Effects: tracers, sprites (flashes/smoke), scorch marks, blasts ===== */

class Tracers {
  constructor(scene, n) {
    this.n = n;
    const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(-0.5, 0, 0);
    const mat = sensorMat(new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }), 1);   // white-hot on the thermal sensor
    this.mesh = new THREE.InstancedMesh(geo, mat, n);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 6;
    this.items = [];
    const zero = new THREE.Matrix4().makeScale(0, 0, 0), c = new THREE.Color(0, 0, 0);
    for (let i = 0; i < n; i++) {
      this.mesh.setMatrixAt(i, zero); this.mesh.setColorAt(i, c);
      this.items.push({ on: false, p: new V3(), v: new V3(), life: 0, max: 1, len: 1, w: 0.1, col: new THREE.Color(), grav: 0, splash: 0 });
    }
    this.next = 0; this.mesh.visible = false; scene.add(this.mesh);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new V3(); this._d = new V3(); this._x = new V3(1, 0, 0);
    this.onSplash = null;
  }
  spawn(p, v, o) {
    const i = this.next, it = this.items[i]; this.next = (this.next + 1) % this.n;
    it.on = true; it.p.copy(p); it.v.copy(v); it.life = it.max = o.life || 1; it.len = o.len || 1; it.w = o.w || 0.1;
    it.col.setHex(o.color || 0xffaa55); it.grav = o.grav || 0; it.splash = o.splash || 0;
    this.mesh.setColorAt(i, it.col); this.mesh.instanceColor.needsUpdate = true; this.mesh.visible = true;
    return it;
  }
  /* idle (no tracers in flight, i.e. most of the time) costs neither a buffer upload nor a draw call */
  update(dt) {
    let active = 0, changed = false;
    for (let i = 0; i < this.n; i++) {
      const it = this.items[i]; if (!it.on) continue;
      changed = true;
      it.v.y -= it.grav * dt; it.p.addScaledVector(it.v, dt); it.life -= dt;
      if (it.splash && it.p.y < groundH(it.p.x, it.p.z)) { if (this.onSplash) this.onSplash(it.p, it.splash); it.life = 0; }
      if (it.life <= 0) { it.on = false; this._m.makeScale(0, 0, 0); this.mesh.setMatrixAt(i, this._m); continue; }
      active++;
      this._d.copy(it.v).normalize(); this._q.setFromUnitVectors(this._x, this._d);
      const fw = Math.min(1, it.life / 0.2); this._s.set(it.len, it.w * fw, it.w * fw); this._m.compose(it.p, this._q, this._s); this.mesh.setMatrixAt(i, this._m);
    }
    if (changed) this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.visible = active > 0;
  }
}

/* Camera-facing particles (flashes / smoke): the whole pool is one instanced draw call instead of a
   THREE.Sprite per particle. Same look as SpriteMaterial (quad of `scale` world units rotated in screen
   space, color × texture, alpha = opacity, scene fog). Normal-blended pools are sorted back to front
   on the CPU, exactly like three.js sorted the individual sprites.                                   */
const SPRITE_VS = `attribute vec3 iPos; attribute vec4 iCol; attribute vec2 iSR;
  varying vec2 vUv; varying vec4 vCol;
  #include <fog_pars_vertex>
  void main() {
    vUv = uv; vCol = iCol;
    vec4 mvPosition = modelViewMatrix * vec4(iPos, 1.0);
    vec2 q = position.xy * iSR.x; float c = cos(iSR.y), s = sin(iSR.y);
    mvPosition.xy += vec2(c * q.x - s * q.y, s * q.x + c * q.y);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;
const SPRITE_FS = `uniform sampler2D map; uniform float uThermal; uniform float uHeat; uniform float uGain; varying vec2 vUv; varying vec4 vCol;
  #include <fog_pars_fragment>
  void main() {
    gl_FragColor = vCol * texture2D(map, vUv);
    if (uThermal > 0.5) gl_FragColor.rgb = vec3(uHeat); else gl_FragColor.rgb *= uGain;   // a pool's heat: flashes white-hot, smoke cold
    #include <fog_fragment>
  }`;
const _sfxFwd = new V3(), farFirst = (a, b) => b.depth - a.depth;
class SpriteFX {
  /* heat: what the pool shows on the thermal sensor (0 cold ... 1 white-hot) */
  constructor(scene, tex, blending, n, fog, heat) {
    this.n = n; this.sorted = blending !== THREE.AdditiveBlending;   // additive blending is order independent
    this.items = []; this.live = [];
    for (let i = 0; i < n; i++) this.items.push({ on: false, p: new V3(), v: new V3(), col: new THREE.Color(), rot: 0, life: 0, max: 1, s0: 1, s1: 1, a0: 1, drag: 0, rise: 0, sc: 1, a: 0, depth: 0 });
    const quad = new THREE.PlaneGeometry(1, 1), geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index; geo.setAttribute('position', quad.attributes.position); geo.setAttribute('uv', quad.attributes.uv);
    const attr = (k, size) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(n * size), size).setUsage(THREE.DynamicDrawUsage); geo.setAttribute(k, a); return a; };
    this.aPos = attr('iPos', 3); this.aCol = attr('iCol', 4); this.aSR = attr('iSR', 2); this.attrs = [this.aPos, this.aCol, this.aSR];
    geo.instanceCount = 0;
    const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog]); uniforms.map = { value: tex };
    uniforms.uThermal = SU.uThermal; uniforms.uHeat = { value: heat != null ? heat : 0.15 }; uniforms.uGain = blending === THREE.AdditiveBlending ? { value: 1 } : SU.uGain;   // (flashes are bright enough: no sensor gain)
    const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: SPRITE_VS, fragmentShader: SPRITE_FS, blending, transparent: true, depthWrite: false, fog: !!fog });
    this.mesh = new THREE.Mesh(geo, mat); this.mesh.frustumCulled = false; this.mesh.visible = false;
    this.mesh.renderOrder = blending === THREE.AdditiveBlending ? 7 : 3; scene.add(this.mesh);
    this.geo = geo; this.next = 0;
  }
  spawn(p, o) {
    const it = this.items[this.next]; this.next = (this.next + 1) % this.n;
    it.on = true; it.p.copy(p);
    it.life = it.max = o.life || 1; it.s0 = o.s0 || 1; it.s1 = o.s1 || it.s0; it.a0 = o.a0 != null ? o.a0 : 1;
    if (o.v) it.v.copy(o.v); else it.v.set(0, 0, 0);
    it.drag = o.drag || 0; it.rise = o.rise || 0;
    it.col.set(o.color != null ? o.color : 0xffffff); it.rot = Math.random() * 6.28;
    it.tintWithSmoke = !!o.smoke;
    return it;
  }
  update(dt, smokeTint, cam) {
    const live = this.live; live.length = 0;
    for (const it of this.items) {
      if (!it.on) continue;
      it.life -= dt;
      if (it.life <= 0) { it.on = false; continue; }
      const t = 1 - it.life / it.max;
      it.v.multiplyScalar(Math.max(0, 1 - it.drag * dt)); it.v.y += it.rise * dt;
      it.p.addScaledVector(it.v, dt);
      it.sc = lerp(it.s0, it.s1, Math.sqrt(t));
      it.a = it.a0 * (1 - t) * (t < 0.08 ? t / 0.08 : 1);
      if (it.tintWithSmoke && smokeTint) it.col.copy(smokeTint);
      live.push(it);
    }
    if (this.sorted && cam && live.length > 1) {
      cam.getWorldDirection(_sfxFwd);
      for (const it of live) it.depth = it.p.dot(_sfxFwd);
      live.sort(farFirst);
    }
    const P = this.aPos.array, C = this.aCol.array, S = this.aSR.array;
    for (let i = 0; i < live.length; i++) {
      const it = live[i];
      P[i * 3] = it.p.x; P[i * 3 + 1] = it.p.y; P[i * 3 + 2] = it.p.z;
      C[i * 4] = it.col.r; C[i * 4 + 1] = it.col.g; C[i * 4 + 2] = it.col.b; C[i * 4 + 3] = it.a;
      S[i * 2] = it.sc; S[i * 2 + 1] = it.rot;
    }
    if (live.length) for (const a of this.attrs) { a.needsUpdate = true; a.clearUpdateRanges(); a.addUpdateRange(0, live.length * a.itemSize); }   // upload only the live part
    this.geo.instanceCount = live.length; this.mesh.visible = live.length > 0;
  }
}

/* craters where shells and bombs hit the ground: a low lathe (dark bowl, a raised rim of turned-up earth that catches
   the light, soot-dark ejecta thinning out to the ground) in vertex colours; one instanced mesh, a fixed pool of slots; old
   ones flatten and shrink away. A hit on a live crater widens it instead of stacking a second one on it (merge); on paved
   ground they are cleared sooner, a repair (runway crew, a mount back on line) fills them in over 3 s */
const CRATER_PROFILE = [[0, 0.004, 0x15110d, 0.95], [0.4, 0.006, 0x1a1612, 0.95], [0.7, 0.04, 0x221d17, 0.9], [0.95, 0.07, 0x2b241c, 0.72], [1.25, 0.03, 0x2c261e, 0.4], [1.75, 0.0, 0x2e2820, 0]];   // [r, y, colour, alpha]: the ejecta fades into the ground
function craterGeometry() {
  const geo = new THREE.LatheGeometry(CRATER_PROFILE.map(([r, y]) => new THREE.Vector2(r, y)).reverse(), 11), pos = geo.attributes.position, col = new Float32Array(pos.count * 4), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getZ(i)); let j = 0; while (j < CRATER_PROFILE.length - 2 && CRATER_PROFILE[j + 1][0] < r - 1e-4) j++;
    const P = CRATER_PROFILE[j], Q = CRATER_PROFILE[j + 1], u = clamp((r - P[0]) / (Q[0] - P[0]), 0, 1);
    c.setHex(P[2]).lerp(new THREE.Color(Q[2]), u); c.toArray(col, i * 4); col[i * 4 + 3] = lerp(P[3], Q[3], u);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4));   // rgba: vertex alpha (three picks it up from the item size)
  return geo;
}
class Scorch {
  static MERGE = 0.6;                                // two craters closer than MERGE × (r1 + r2) become one
  static CROWD = 30;                                 // slots kept free (crowd): a 3 s fade frees them at ~10/s
  static LIFT = 0.2;                               // its base over the ground: above the paving and its painted lines (≤ 0.048; lower, the taxiway lines showed through)
  constructor(scene, n) {
    const geo = craterGeometry();
    // no depth write: its faded ejecta would cut holes in ground decals drawn after it (runway lettering); nearly flat, so it doesn't need it
    const mat = sensorMat(new THREE.MeshPhongMaterial({ vertexColors: true, transparent: true, depthWrite: false, flatShading: true, shininess: 0, specular: 0x000000, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), 0.07);
    this.mesh = new THREE.InstancedMesh(geo, mat, n); this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 1; this.mesh.count = n;
    this.items = []; const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < n; i++) { this.mesh.setMatrixAt(i, zero); this.items.push({ on: false, fade: false, k: 0, p: new V3(), n: new V3(0, 1, 0), r: 1, base: 1, t: 0, max: 1, rot: 0 }); }
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._qy = new THREE.Quaternion(); this._s = new V3(); this._y = new V3(0, 1, 0);
    scene.add(this.mesh);
  }
  spawn(p, r, life) {
    r *= 0.8; life = life || 45;
    if (r < 1.1) life = Math.min(life, 20);          // shell holes (tank rounds far out past the wire, several a second): not for long
    let it = this.items.find(o => o.on && !o.fade && Math.hypot(o.p.x - p.x, o.p.z - p.z) < Scorch.MERGE * (o.r + r));
    if (it) {                                        // on a live one: it grows (up to 1.4× the bigger of the two), its centre a little toward the hit
      const b = Math.max(it.base, r), w = 0.25 * r / (it.r + r);
      it.r = Math.min(Math.max(it.r, r) * 1.12, 1.4 * b); it.base = b; it.p.x += (p.x - it.p.x) * w; it.p.z += (p.z - it.p.z) * w;
      it.t = it.max = Math.max(it.t, life);
      this.absorb(it);
      return it;
    }
    // a free slot (crowding keeps some); with none at all this one isn't made — rather than cut a showing one short
    it = this.items.find(o => !o.on); if (!it) return null;
    it.on = true; it.fade = false; it.k = 1; it.p.set(p.x, groundH(p.x, p.z) + Scorch.LIFT, p.z); it.r = it.base = r; it.t = it.max = life; it.rot = rand(0, TAU); groundN(p.x, p.z, it.n);
    this.crowd();
    return it;
  }
  /* a grown crater takes in the neighbours it now overlaps (mostly under it): they shrink away */
  absorb(it) { for (const o of this.items) if (o !== it && o.on && !o.fade && Math.hypot(o.p.x - it.p.x, o.p.z - it.p.z) < Scorch.MERGE * (o.r + it.r)) { it.t = it.max = Math.max(it.t, o.t); this.fadeOut(o); } }
  /* a crater on its way out: it shrinks away over (at most) 3 s — never just switched off */
  fadeOut(o) { if (!o.fade) { o.fade = true; o.max = 12; o.t = Math.min(o.t, 3); } }
  /* fewer than CROWD slots free (heavy bombing): the oldest start shrinking away, so a new one never takes a live one's slot */
  crowd() {
    let free = 0; for (const o of this.items) if (!o.on) free++;
    if (free >= Scorch.CROWD) return;
    const live = this.items.filter(o => o.on && !o.fade).sort((a, b) => a.t - b.t);
    for (let i = 0; i < Scorch.CROWD - free && i < live.length; i++) this.fadeOut(live[i]);
  }
  /* fill in the craters around p (within r of their rim) */
  repair(p, r) { for (const it of this.items) if (it.on && Math.hypot(it.p.x - p.x, it.p.z - p.z) < r + it.r * 0.5) this.fadeOut(it); }
  update(dt) {
    let changed = false;
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i]; if (!it.on) continue;
      it.t -= dt; changed = true;
      const k = it.k = it.t <= 0 ? 0 : Math.min(1, it.t / (it.max * 0.25));
      if (it.t <= 0) it.on = false;
      this._q.setFromUnitVectors(this._y, it.n).multiply(this._qy.setFromAxisAngle(this._y, it.rot)); this._s.set(it.r * k, it.r * 0.8 * k * k, it.r * k * 0.85);   // flattens as it shrinks
      this.mesh.setMatrixAt(i, this._m.compose(it.p, this._q, this._s));
    }
    if (changed) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/* a blast of size s (a 25 mm hit ~0.6 … a 105 mm shell ~3, metres of fireball radius, roughly): flash, smoke, dust, sparks, a crater */
const _bq = new V3(), _bv = new V3();
function blast(p, s) {
  _bq.set(p.x, groundH(p.x, p.z) + 0.6, p.z);
  FX.flash.spawn(_bq, { s0: s * 5, s1: s * 11, life: 0.2 });
  FX.flash.spawn(_bq, { s0: s * 9, s1: s * 18, life: 0.32, a0: 0.45 });
  for (let i = 0; i < 5; i++) FX.fire.spawn(_bq, { s0: s * 2.4, s1: s * 5.5, life: rand(0.25, 0.55), a0: 0.85, v: _bv.set(rand(-6, 6) * s, rand(1, 7) * s, rand(-6, 6) * s), drag: 3 });
  for (let i = 0; i < 7; i++) FX.smoke.spawn(_bq, { s0: s * 3, s1: s * rand(8, 13), life: rand(2.2, 4.5), a0: 0.42, color: 0x2c2823, rise: 0.4, v: _bv.set(rand(-5, 5) * s + WIND.x * 2.5, rand(1, 5) * s, rand(-5, 5) * s + WIND.z * 2.5), drag: 1.1 });
  for (let i = 0; i < 6; i++) FX.dust.spawn(_bq, { s0: s * 2, s1: s * 9, life: rand(1.2, 2.4), a0: 0.5, color: ENV.dustTint.getHex(), v: _bv.set(rand(-9, 9) * s, rand(0, 1.5), rand(-9, 9) * s), drag: 2 });
  for (let i = 0; i < 14; i++) { const a = rand(0, TAU), v = rand(30, 80) * Math.sqrt(s); FX.tracers.spawn(_bq, _bv.set(Math.cos(a) * v, rand(6, 36), Math.sin(a) * v), { life: rand(0.14, 0.4), len: rand(1.4, 4) * Math.sqrt(s), w: 0.14, color: 0xffd8a0, grav: 28 }); }
  FX.scorch.spawn(p, s * 1.8, 30);
}
