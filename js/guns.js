'use strict';
/* ===== The big guns in frame: the barrels of the 105 mm and the railgun (each while it is enabled) at the bottom right =====
   A scene of its own with a wide lens at the origin, drawn into the sensor's target after the world over a cleared depth: the
   post pass (modes, grain, bloom) treats it like the rest. Its world is fixed to the AIRCRAFT: the view the sensor has when it
   looks at the orbit's centre (CAM_CTR, where the guns of a pylon turn point). The lens turns with the sensor: when the sensor
   slews off the centre the barrels move the other way in the frame (looking further down lifts them, they may leave the frame).
   Two guns sit one after the other along the fuselage (the nose is to the right), their barrels parallel. A shot's tracer
   starts in the world on the line of sight through the muzzle on the screen (muzzleAt), so it leaves the visible barrel.
   On every shot (BATTLE.fire): recoil and counter-recoil, a muzzle flash that lights the barrel, gases out of the muzzle brake
   blown back by the slipstream; the railgun's rails flash blue and glow again as it recharges. The barrels heat up with every
   shot (white on the thermal sensor) and cool down slowly. Lit like the world: the sun / moon and the sky turned into view space.
   Its materials skip the lamps' light map (a view-space scene has no place in the world): their own program (customProgramCacheKey). */
const GUN_FOV = 40, GUN_MOUNTS = ['h105', 'rail'];   // (forward to aft along the fuselage)
const GUNS = {
  scene: null, cam: null, models: {}, cur: null,
  init() {
    const S = this.scene = new THREE.Scene(); this.cam = new THREE.PerspectiveCamera(GUN_FOV, 1, 0.05, 80);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x333333, 1); this.sun = new THREE.DirectionalLight(0xffffff, 1); S.add(this.hemi, this.sun, this.sun.target);
    this.flashLight = new THREE.PointLight(0xffc890, 0, 7, 2); S.add(this.flashLight);
    this.flash = new SpriteFX(S, TEX.flash, THREE.AdditiveBlending, 40, false, 1);
    this.plasma = new SpriteFX(S, TEX.glow, THREE.AdditiveBlending, 40, false, 1);
    this.gas = new SpriteFX(S, TEX.smoke, THREE.NormalBlending, 60, false, 0.32);
    for (const id of ['h105', 'rail']) {
      const root = new THREE.Group(), body = new THREE.Group(); root.add(body); root.visible = false; S.add(root);
      const g = this.models[id] = { id, root, body, k: 0, rec: 0, recV: 0, glow: 0, heat: { value: 0.04 }, muzzle: 0 };
      (id === 'h105' ? this.build105 : this.buildRail).call(this, g);
    }
  },
  /* a material of the guns: Phong, its heat a uniform of the gun's own (barrels heat up) */
  mat(color, heat, o) {
    const m = sensorMat(new THREE.MeshPhongMaterial(Object.assign({ color, shininess: 55, specular: 0x8a9096 }, o || {})));
    m.userData.noLamp = true; m.customProgramCacheKey = () => 'gun';
    if (heat) m.userData.extend = sh => { sh.uniforms.uMatHeat = heat; };
    return m;
  },
  /* a cylinder along +z from z0 to z1 */
  tube(p, r0, r1, z0, z1, seg, mat, x, y) { const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, z1 - z0, seg, 1), mat); m.rotation.x = Math.PI / 2; m.position.set(x || 0, y || 0, (z0 + z1) / 2); p.add(m); return m; },
  cube(p, w, h, d, mat, x, y, z) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); p.add(m); return m; },
  /* the M102: a long tube with a two-baffle muzzle brake over a cradle with its recoil cylinders (the tube recoils, the cradle stays) */
  build105(g) {
    const steel = this.mat(0x5c6166, g.heat), dark = this.mat(0x34383b, g.heat), grey = this.mat(0x7a7f84, null, { shininess: 18, specular: 0x3a3c3e }), b = g.body;
    g.tube = new THREE.Group(); b.add(g.tube);
    this.tube(g.tube, 0.1, 0.082, -1.2, 2.75, 28, steel);                                   // the tube, a little thinner towards the muzzle
    this.tube(g.tube, 0.14, 0.14, -1.6, -0.75, 28, grey);                                   // the breech ring
    for (const [z0, z1] of [[2.75, 2.83], [2.95, 3.03], [3.14, 3.2]]) this.tube(g.tube, 0.115, 0.115, z0, z1, 28, dark);   // the brake's baffles
    this.tube(g.tube, 0.085, 0.085, 2.75, 3.2, 20, dark);                                   // (its core between them: the ports)
    for (const s of [-1, 1]) this.cube(g.tube, 0.16, 0.025, 0.45, dark, 0, s * 0.1, 2.97);  // the brake's top and bottom straps (its ports open sideways)
    this.cube(b, 0.32, 0.12, 1.9, grey, 0, -0.17, -0.8);                                    // the cradle (fixed)
    for (const s of [-1, 1]) this.tube(b, 0.05, 0.05, -1.7, 0.45, 14, grey, s * 0.1, -0.2); // the recoil cylinders
    this.tube(b, 0.07, 0.07, -1.5, -0.1, 14, grey, 0, 0.16);                                // the recuperator on top
    g.muzzle = 3.2; g.L = 3.2; g.kick = 0.5; g.back = 1.2;
  },
  /* the railgun: two rails in a clamped composite barrel, a capacitor block behind; a light between the rails on every shot */
  buildRail(g) {
    const rail = this.mat(0x8a6a4c, g.heat, { shininess: 80, specular: 0xa08a70, emissive: 0x000000 }), comp = this.mat(0x464b50, null, { shininess: 30, specular: 0x50565c }), clamp = this.mat(0x6a7076, null), b = g.body;
    g.railMat = rail;
    this.cube(b, 0.24, 0.2, 4.1, comp, 0, 0, 1.05);                                          // the barrel's composite body
    for (const s of [-1, 1]) this.cube(b, 0.025, 0.07, 4.1, rail, s * 0.128, 0, 1.05);      // the rails' edges along its sides
    for (const z of [-0.5, 0.45, 1.4, 2.35]) this.cube(b, 0.3, 0.26, 0.06, clamp, 0, 0, z); // the clamps
    this.cube(b, 0.32, 0.28, 0.14, clamp, 0, 0, 3.08);                                      // the muzzle ring
    this.cube(b, 0.5, 0.42, 1.1, comp, 0, -0.06, -1.45);                                    // the capacitors' block
    for (const s of [-1, 1]) this.tube(b, 0.035, 0.035, -2, -0.4, 10, clamp, s * 0.17, -0.24);   // the feeds
    g.arc = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.02, 3.95), sensorMat(new THREE.MeshBasicMaterial({ color: 0x7fb4ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }), 0.9));
    g.arc.position.set(0, 0.101, 1.05); b.add(g.arc);                                       // (the slot along its top: the light between the rails)
    g.muzzle = 3.15; g.L = 3.15; g.kick = 0.14; g.back = 0.45;
  },
  /* a shot of a weapon (BATTLE.fire) */
  shot(id) {
    const g = this.models[id]; if (!g || g.k < 0.3) return;
    g.rec = g.kick; g.recT = 0; g.heat.value = Math.min(0.62, g.heat.value + (id === 'rail' ? 0.09 : 0.12)); g.glow = 1; g.puff = 0.35;
    const m = g.root.localToWorld(_gm.set(0, 0, g.muzzle)), ax = _ga.set(0, 0, 1).transformDirection(g.root.matrixWorld), sx = _gs.set(1, 0, 0).transformDirection(g.root.matrixWorld);
    if (id === 'h105') {
      for (const [d, s] of [[0.15, 0.75], [0.5, 0.65], [0.9, 0.5], [1.3, 0.34]]) this.flash.spawn(_gp.copy(m).addScaledVector(ax, d), { s0: s, s1: s * 1.5, life: 0.07, color: 0xfff0d0, a0: 3.5 });   // (a tongue of fire forwards)
      for (const s of [-1, 1]) this.flash.spawn(_gp.copy(m).addScaledVector(ax, -0.2).addScaledVector(sx, s * 0.28), { s0: 0.35, s1: 0.6, life: 0.06, color: 0xffd0a0, a0: 3 });   // (out of the brake's ports)
      this.flashLight.color.setHex(0xffc890); this.flashLight.userData.k = 60;
    } else {
      for (const [d, s] of [[0.1, 0.6], [0.5, 0.45], [1, 0.3], [1.6, 0.2]]) this.plasma.spawn(_gp.copy(m).addScaledVector(ax, d), { s0: s, s1: s * 1.8, life: 0.1, color: 0xd0e6ff, a0: 4 });   // (the plasma out of the muzzle)
      for (let i = 1; i < 7; i++) this.plasma.spawn(_gp.copy(m).addScaledVector(ax, -i * 0.5).addScaledVector(_gu.set(0, 1, 0).transformDirection(g.root.matrixWorld), 0.11), { s0: 0.22, s1: 0.1, life: 0.06 + i * 0.01, color: 0x8ab8ff, a0: 2.5 });   // (sparks along the slot)
      this.flashLight.color.setHex(0xa8ccff); this.flashLight.userData.k = 45;
    }
    this.flashLight.position.copy(m);
  },
  update(dt) {
    for (const g of Object.values(this.models)) {
      g.k = clamp(g.k + (CFG.weapons.includes(g.id) ? dt : -dt) / 0.7, 0, 1);   // (shown while enabled: it slides in and out when the setting changes)
      if (g.recT != null) { g.recT += dt; const t = g.recT; g.rec = t < 0.05 ? g.kick * t / 0.05 : g.kick * Math.max(0, 1 - smoothstep(0.05, 0.05 + g.back, t)); if (t > 0.05 + g.back) g.recT = null; }   // (back at once, forward slowly)
      g.heat.value = Math.max(0.04, g.heat.value - dt * 0.006);
      g.glow = Math.max(0, g.glow - dt * 2.2);
      if (g.puff > 0) {                                                                                  // the gases: a short stream from the brake / the rails
        g.puff -= dt; g.root.updateMatrixWorld();
        const m = g.root.localToWorld(_gm.set(0, 0, g.muzzle)), ax = _ga.set(0, 0, 1).transformDirection(g.root.matrixWorld), sx = _gs.set(1, 0, 0).transformDirection(g.root.matrixWorld), up = _gu.set(0, 1, 0).transformDirection(g.root.matrixWorld);
        const n = g.id === 'rail' ? 1 : 2;
        for (let i = 0; i < n; i++) {
          const s = Math.random() < 0.5 ? -1 : 1, side = g.id === 'h105' && Math.random() < 0.6;
          const v = side ? _gv.copy(sx).multiplyScalar(s * rand(1.5, 3)).addScaledVector(ax, rand(-0.5, 0.5)) : _gv.copy(ax).multiplyScalar(rand(2, 4.5)).addScaledVector(sx, rand(-1, 1)).addScaledVector(up, rand(-1, 1));
          v.x -= rand(1, 2);                                                                             // (the slipstream: the aircraft's nose is to the right)
          this.gas.spawn(m, { v, s0: 0.15, s1: g.id === 'rail' ? 0.8 : rand(1, 1.6), life: rand(0.9, 1.6), drag: 2, a0: g.id === 'rail' ? 0.2 : 0.45, color: 0x9a9a96, smoke: true });
        }
      }
    }
    if (this.flashLight.userData.k) { this.flashLight.intensity = this.flashLight.userData.k; this.flashLight.userData.k *= Math.max(0, 1 - dt * 22); if (this.flashLight.userData.k < 0.05) this.flashLight.userData.k = 0; } else this.flashLight.intensity = 0;
    this.flash.update(dt, null, this.cam); this.plasma.update(dt, null, this.cam); this.gas.update(dt, ENV.smokeTint, this.cam);
  },
  /* the aircraft's frame (the sensor looking at the orbit's centre) and the lens turned as the sensor is; the barrels in it:
     their mounts fixed to the aircraft (they depend on the frame's aspect only), each barrel turned onto the line of sight,
     so it points at the frame's middle, where its shells go. The lens zooms with the sensor's: zoomed in, the barrels grow
     and move out towards the frame's edges; zoomed out, they shrink towards its middle */
  pose() {
    const a = camera.aspect, t = Math.tan(GUN_FOV / 2 * DEG), zm = 4.6, mag = Math.max(30, CFG.zoom * GUNSHIP.zm) / 85;   // (the sensor's zoom against the 105 mm's at 100 %: the lens magnifies the barrels as it does the ground)
    this.cam.aspect = a; this.cam.fov = 2 * Math.atan(t / mag) / DEG; this.cam.updateProjectionMatrix();
    _gn.position.copy(camera.position); _gn.lookAt(CAM_CTR); _gn.updateMatrixWorld();
    this.cam.quaternion.copy(_gn.quaternion).invert().multiply(camera.quaternion); this.cam.updateMatrixWorld();   // (the sensor's turn away from the centre)
    _gt.set(t * zm * a * 0.64, -t * zm * 0.5, -zm); _gd.set(0, 0, -1).applyQuaternion(this.cam.quaternion);   // (the muzzles' mounts; the barrels on the line of sight: they point where the shells go)
    const on = GUN_MOUNTS.filter(id => this.models[id].k > 0.001), along = t * zm * a * 0.3;   // (two guns: this far apart along the fuselage)
    let any = false;
    for (const g of Object.values(this.models)) {
      g.root.visible = g.k > 0.001; if (!g.root.visible) continue; any = true;
      const e = g.k * g.k * (3 - 2 * g.k), slot = on.length > 1 ? on.indexOf(g.id) : 0;
      g.root.scale.setScalar(1.15); g.root.position.copy(_gt).addScaledVector(_gd, -(g.L + 0.3) * 1.15 - (1 - e) * 4); g.root.position.x -= slot * along; g.root.lookAt(_gp.copy(g.root.position).add(_gd)); g.root.updateMatrixWorld();
      (g.tube || g.body).position.z = -g.rec;
      if (g.arc) { g.arc.material.opacity = Math.min(1, g.glow * 1.6); const s = ARMS.st.rail, ch = s && s.reload > 0 ? 1 - s.reload / WEAPON.rail.reload : 1; g.railMat.emissive.setRGB(0.25, 0.5, 1).multiplyScalar(g.glow * 2.5 + ch * 0.03 * (0.7 + 0.3 * Math.sin(T * 9))); }
    }
    // the light of the world, turned into the aircraft's frame
    const V = _gn.matrixWorldInverse;
    this.sun.position.copy(SUN_DIR).transformDirection(V).multiplyScalar(10); this.sun.color.copy(sunLight.color); this.sun.intensity = sunLight.intensity;
    this.hemi.position.set(0, 1, 0).transformDirection(V); this.hemi.color.copy(hemi.color); this.hemi.groundColor.copy(hemi.groundColor); this.hemi.intensity = hemi.intensity;
    return any || this.flash.live.length > 0 || this.gas.live.length > 0;
  },
  /* where a shot of this gun starts in the world: on the line of sight through its muzzle on the screen, d metres out
     (null: no barrel of it is shown) */
  muzzleAt(id, out, d) {
    const g = this.models[id]; if (!g || g.k < 0.3) return null;
    this.pose(); g.root.localToWorld(_gm.set(0, 0, g.muzzle + 0.3)).project(this.cam);
    _gp.set(_gm.x, _gm.y, 0.5).unproject(camera).sub(camera.position).normalize();
    return out.copy(camera.position).addScaledVector(_gp, d);
  },
  /* over the world in the sensor's target (SENSOR.render, once pose() said something of it is shown) */
  render() {
    const ac = renderer.autoClear; renderer.autoClear = false; renderer.clearDepth(); renderer.render(this.scene, this.cam); renderer.autoClear = ac;
  },
  /* compile its programs under the splash (everything shown once) */
  warm() {
    const hid = []; this.scene.traverse(o => { if (!o.visible) { hid.push(o); o.visible = true; } });
    const p = renderer.compileAsync(this.scene, this.cam); for (const o of hid) o.visible = false; return p;   // (compileAsync takes what is visible at the call)
  }
};
const _gn = new THREE.PerspectiveCamera(), _gm = new V3(), _ga = new V3(), _gs = new V3(), _gu = new V3(), _gv = new V3(), _gp = new V3(), _gt = new V3(), _gd = new V3();
