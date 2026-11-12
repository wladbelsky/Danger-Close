'use strict';
/* ===== Weather and the air between the aircraft and the ground: ragged clouds drifting under the camera, rain, snow, fog; and
   the enemies' anti-aircraft fire coming up past the lens, answered with flares (looks only: nothing here hits anything) =====
   WEATHER.kind is clear / rain / snow / fog ('auto' picks one for the season every few minutes); each fades in and out
   (WEATHER.k). Overcast dims the sun and greys the haze (applied in updateEnvironment through WEATHER.light).              */
const WEATHER_ODDS = { spring: { clear: 6, rain: 3, fog: 1 }, summer: { clear: 7, rain: 2, fog: 1 }, autumn: { clear: 5, rain: 3.5, fog: 1.5 }, winter: { clear: 5, snow: 4, fog: 1 } };
const CLOUD_R = 260, CLOUD_N = 22;   // (the frame only sees ~80 m of the cloud layer: they are kept close round the sensor's point)
const _wp = new V3(), _wq = new V3(), _wr = new V3(), _wu = new V3(), _wf = new V3();
const WEATHER = {
  kind: 'clear', k: { rain: 0, snow: 0, fog: 0 }, next: 0, acc: 0, clouds: [], cover: 0, fx: null, drops: null,
  init() {
    this.fx = new SpriteFX(scene, TEX.smoke, THREE.NormalBlending, CLOUD_N * 9, true, 0.25); this.fx.mesh.renderOrder = 9;   // (over everything on the ground)
    this.drops = new Tracers(scene, 900, 0.2); this.drops.mesh.renderOrder = 9;
    for (let i = 0; i < CLOUD_N; i++) {
      const c = { x: rand(-CLOUD_R, CLOUD_R), z: rand(-CLOUD_R, CLOUD_R), y: rand(100, 150), vis: 0, puffs: [] };
      for (let k = 0; k < randi(6, 9); k++) { const it = this.fx.items[i * 9 + k], a = rand(0, TAU), r = rand(0, 34); c.puffs.push({ it, ox: Math.cos(a) * r * 1.5, oy: rand(-5, 5), oz: Math.sin(a) * r, s: rand(22, 40), a: rand(0.3, 0.55) }); it.rot = rand(0, TAU); }
      this.clouds.push(c);
    }
    this.pick(true);
  },
  /* the weather now: the setting, or one drawn for the season */
  pick(first) {
    let k = CFG.weather;
    if (k === 'auto') { const o = WEATHER_ODDS[seasonNow()]; let r = Math.random() * Object.values(o).reduce((a, b) => a + b, 0); for (const n in o) if ((r -= o[n]) <= 0) { k = n; break; } }
    this.kind = k; this.next = T + rand(8, 15) * 60;
    if (first) for (const n in this.k) this.k[n] = n === k ? 1 : 0;   // (at the start: already there, no fading in)
  },
  get overcast() { return Math.max(this.k.rain, this.k.snow, this.k.fog * 0.7); },
  /* the light and the haze under this weather (called by updateEnvironment before the sensor's own part) */
  light() {
    const o = this.overcast, f = this.k.fog, thermal = SU.uThermal.value > 0.5, fk = f * (thermal ? 0.45 : 1) + this.k.rain * 0.18 + this.k.snow * 0.25;   // (thermal sees further through it)
    sunLight.intensity *= lerp(1, 0.5, o); hemi.intensity *= lerp(1, 1.12, o);
    _wcol.setRGB(0.62, 0.65, 0.68).multiplyScalar(lerp(0.12, 1, ENV.day)); scene.fog.color.lerp(_wcol, Math.max(o, fk) * 0.8);
    scene.fog.near = lerp(CAM_D + 150, 110, fk); scene.fog.far = lerp(CAM_D + 1100, CAM_D + 300, fk);
  },
  update(dt) {
    if (CFG.weather !== 'auto') { if (this.kind !== CFG.weather) this.kind = CFG.weather; } else if (T > this.next) this.pick();
    let moving = false;
    for (const n in this.k) { const t = n === this.kind ? 1 : 0, v = this.k[n]; if (v !== t) { this.k[n] = v + clamp(t - v, -dt / 25, dt / 25); moving = true; } }
    if (moving) envTimer = Math.min(envTimer, 0.5);   // (the light follows the change)
    this.precip(dt); this.drift(dt);
  },
  /* rain and snow: streaks falling through the air round the point the sensor is on */
  precip(dt) {
    const rain = this.k.rain, snow = this.k.snow;
    if (rain > 0.02 || snow > 0.02) {
      this.acc += dt * (rain * 300 + snow * 220); const n = Math.min(60, Math.floor(this.acc)); this.acc -= n;
      for (let i = 0; i < n; i++) {
        const isRain = Math.random() * (rain * 300 + snow * 220) < rain * 300, x = CAM_TGT.x + rand(-115, 115), z = CAM_TGT.z + rand(-115, 115), g = groundH(x, z);
        if (isRain) { const h = rand(25, 125); this.drops.spawn(_wp.set(x, g + h, z), _wq.set(WIND.x * 3, -27, WIND.z * 3), { life: h / 27, len: 2.6, w: 0.07, color: 0x9aa6b2 }); }
        else { const h = rand(6, 60); this.drops.spawn(_wp.set(x, g + h, z), _wq.set(WIND.x * 2 + rand(-1, 1), -3.4, WIND.z * 2 + rand(-1, 1)), { life: Math.min(4.5, h / 3.4), len: 0.32, w: 0.26, color: 0xe6ecf2 }); }
      }
    }
    this.drops.update(dt);
  },
  /* the clouds: clusters of soft puffs on the wind, kept in a square round the sensor's point (leaving one side they come back on the
     other). None in a fight: they would hide it (they thin out as it starts and gather again afterwards) */
  drift(dt) {
    const want = AUD.combat ? 0 : Math.round(CLOUD_N * clamp(CFG.clouds / 100 * (1 + this.overcast * 1.2), 0, 1)), live = this.fx.live; live.length = 0;
    const tint = ENV.smokeTint, lum = lerp(0.2, 1.05, ENV.day) * lerp(1, 0.7, this.overcast);
    this.clouds.forEach((c, i) => {
      c.x += WIND.x * 2.5 * dt; c.z += WIND.z * 2.5 * dt;
      let dx = c.x - CAM_TGT.x, dz = c.z - CAM_TGT.z;
      if (dx > CLOUD_R) c.x -= 2 * CLOUD_R; else if (dx < -CLOUD_R) c.x += 2 * CLOUD_R; if (dz > CLOUD_R) c.z -= 2 * CLOUD_R; else if (dz < -CLOUD_R) c.z += 2 * CLOUD_R;
      dx = c.x - CAM_TGT.x; dz = c.z - CAM_TGT.z;
      c.vis += clamp((i < want ? 1 : 0) - c.vis, -dt / 4, dt / 8);
      const edge = smoothstep(CLOUD_R, CLOUD_R - 70, Math.max(Math.abs(dx), Math.abs(dz))) * c.vis; if (edge <= 0.01) return;
      for (const p of c.puffs) { const it = p.it; it.p.set(c.x + p.ox, CAM_TGT.y + c.y + p.oy, c.z + p.oz); it.sc = p.s; it.a = p.a * edge; it.col.setRGB(lerp(tint.r, 1, 0.6) * lum, lerp(tint.g, 1, 0.6) * lum, lerp(tint.b, 1, 0.6) * lum); live.push(it); }
    });
    this.cover = want; this.fx.flush(camera);
  }
};
const _wcol = new THREE.Color();

/* ===== Anti-aircraft fire and flares =====
   In a fight the enemies near the sensor's point fire up at the aircraft: bursts of tracers (the base's gun most of all) and now
   and then a missile on a smoke trail. They all pass the lens: the tracers wide of it, the missile drawn off by the flares the
   aircraft drops (bright, falling away below it).                                                                    */
const AA = {
  nextGun: 0, nextSam: 0, bursts: [], sams: [], flares: [], shots: 0, launched: 0,
  basis() { const e = camera.matrixWorld.elements; _wr.set(e[0], e[1], e[2]); _wu.set(e[4], e[5], e[6]); _wf.set(-e[8], -e[9], -e[10]); },
  /* an enemy near the sensor's point that could be shooting up: the base's gun before the vehicles, those before the rest */
  source(sam) {
    let best = null, bs = 0;
    for (const u of UNITS) {
      if (u.side !== 'enemy' || u.kind === 'heli' || u.retreat || Math.hypot(u.pos.x - CAM_TGT.x, u.pos.z - CAM_TGT.z) > 230) continue;
      const s = (sam ? (u.kind === 'inf' ? 3 : u.kind === 'struct' ? 0 : 1) : (u.type === 'aa' ? 8 : u.kind === 'apc' || u.kind === 'car' ? 2 : u.kind === 'tank' ? 1 : 0)) * rand(0.5, 1); if (s > bs) { bs = s; best = u; }
    }
    return best;
  },
  update(dt) {
    if (CFG.aa && AUD.fighting && GUNSHIP.state === 'orbit') {
      if (T > this.nextGun) { this.nextGun = T + rand(2.5, 6) / (0.6 + AUD.heavy); const u = this.source(false); if (u) { this.basis(); this.bursts.push({ u, n: u.type === 'aa' ? randi(10, 16) : randi(4, 8), tick: 0, col: Math.random() < 0.6 ? 0xa8ff8a : 0xff8850, ox: rand(9, 24) * (Math.random() < 0.5 ? -1 : 1), oy: rand(-12, 14) }); if (Math.random() < 0.15) this.drop(3); } }
      if (T > this.nextSam) { this.nextSam = T + rand(18, 36); const u = this.source(true); if (u) this.launch(u); }
    }
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i]; if (!b.u.alive || b.n <= 0) { this.bursts.splice(i, 1); continue; }
      if ((b.tick -= dt) > 0) continue; b.tick = 0.07; b.n--; this.shots++;
      this.basis(); _wp.set(b.u.pos.x, b.u.pos.y + 2.2, b.u.pos.z);
      _wq.copy(camera.position).addScaledVector(_wr, b.ox + rand(-3, 3)).addScaledVector(_wu, b.oy + rand(-3, 3)).sub(_wp); const d = _wq.length();
      FX.tracers.spawn(_wp, _wq.multiplyScalar(430 / d), { life: d / 430, len: 7, w: 0.34, color: b.col });
      if (b.n % 3 === 0) FX.flash.spawn(_wp, { s0: 2, s1: 4, life: 0.08 });
    }
    for (let i = this.sams.length - 1; i >= 0; i--) {
      const m = this.sams[i]; m.p += dt / m.dur;
      if (!m.flared && m.p > 0.3) { m.flared = true; this.drop(6); }
      const q = m.p, a = (1 - q) * (1 - q), b = 2 * q * (1 - q), c = q * q; _wp.set(m.a.x * a + m.c.x * b + m.b.x * c, m.a.y * a + m.c.y * b + m.b.y * c, m.a.z * a + m.c.z * b + m.b.z * c);   // (a curve: it turns after the flares)
      if (m.p >= m.end) { this.sams.splice(i, 1); if (m.end < 1) hitFx(_wp.x, _wp.y, _wp.z, 1.6, true); continue; }
      FX.flare.spawn(_wp, { s0: 2.6, s1: 1.4, life: 0.07 });
      if ((m.puff -= dt) <= 0) { m.puff = 0.03; FX.smoke.spawn(_wp, { s0: 1.4, s1: 5, life: 1.6, a0: 0.4, color: 0xdcdcdc }); }
    }
    for (let i = this.flares.length - 1; i >= 0; i--) {
      const f = this.flares[i]; if ((f.wait -= dt) > 0) continue;
      f.life -= dt; if (f.life <= 0) { this.flares.splice(i, 1); continue; }
      f.v.y -= 6 * dt; f.v.multiplyScalar(1 - 0.5 * dt); f.p.addScaledVector(f.v, dt);
      FX.flare.spawn(f.p, { s0: 1.5 * Math.min(1, f.life), s1: 0.7, life: 0.09 });
      if ((f.puff -= dt) <= 0) { f.puff = 0.06; FX.smoke.spawn(f.p, { s0: 0.6, s1: 2.6, life: 1.2, a0: 0.28, color: 0xe8e8e8 }); }
    }
  },
  /* a missile from u: up towards the aircraft, then off to one side after the flares; some burst in the air on the way */
  launch(u) {
    this.basis(); this.launched++;
    const a = new V3(u.pos.x, u.pos.y + 2, u.pos.z), side = Math.random() < 0.5 ? -1 : 1, b = camera.position.clone().addScaledVector(_wr, side * rand(28, 46)).addScaledVector(_wu, rand(-12, 18));
    const c = a.clone().lerp(camera.position, 0.55).addScaledVector(_wr, -side * rand(4, 10));
    this.sams.push({ a, b, c, p: 0, dur: rand(2.6, 3.4), end: Math.random() < 0.4 ? rand(0.7, 0.85) : 1, flared: false, puff: 0 });
    FX.flash.spawn(a, { s0: 3, s1: 7, life: 0.2 }); for (let i = 0; i < 4; i++) FX.smoke.spawn(a, { s0: 2, s1: 8, life: rand(1.5, 2.5), a0: 0.45, color: 0xd0d0d0, v: _wq.set(rand(-3, 3), rand(0.5, 2), rand(-3, 3)), drag: 1.5 });
  },
  /* flares: thrown out to both sides just ahead of the lens, falling away towards the ground */
  drop(n) {
    this.basis();
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? 1 : -1, p = camera.position.clone().addScaledVector(_wf, rand(34, 42)).addScaledVector(_wr, side * rand(1.5, 4)).addScaledVector(_wu, rand(-3.5, -1.5));
      const v = new V3().addScaledVector(_wf, rand(38, 52)).addScaledVector(_wr, side * rand(5, 12)).addScaledVector(_wu, rand(-5, 2));
      this.flares.push({ p, v, life: rand(2.6, 3.4), wait: i * 0.14, puff: 0 });
    }
  }
};
