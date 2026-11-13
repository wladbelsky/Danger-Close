'use strict';
/* ===== The gunship: a slow left orbit over a district, the sensor slewing between points of interest in it, a transit to
   another district every few minutes in silence; the zoom per weapon. It moves the camera's look-at point (main.js turns it into a pose).
   Runtime choices (start district, wander) use Math.random: they need not repeat for a seed, only the map does.            */
const SLEW_LOCK = 2.6;          // the slew's stiffness while the sensor is on a target (0.9 when just looking around)
const GS_MARGIN = 260;          // districts keep this far from the map's edge (the frame is clamped inside the map anyway)
const _gsa = new V3();
const GUNSHIP = {
  state: 'orbit', list: [], home: null, look: new V3(), aim: new V3(), aimS: new V3(), vel: new V3(), ctr: new V3(),   // (ctr: what the aircraft circles)
  zm: 1, applied: 0, nextTransit: 0, nextWander: 0, tr: null, ao: 0, next: null, settled: 0,
  /* the districts worth orbiting: towns, the station, a bridge, lakes, farms, fields and roads out in the country */
  districts() {
    const out = [], sp = LAYOUT.spots(), M = MAP_HALF - GS_MARGIN;
    const add = (n, x, z) => { x = clamp(x, -M, M); z = clamp(z, -M, M); if (!out.some(d => Math.hypot(d.x - x, d.z - z) < 280)) out.push({ n, x, z }); };
    for (const t of LAYOUT.towns) add('town', t.x, t.z);
    for (const o of LAYOUT.outposts) add('outpost', o.x, o.z);
    for (const k in sp) add(k, sp[k][0], sp[k][1]);
    for (const f of LAYOUT.farms) add('farm', f.x, f.z);
    for (let z = -600; z <= 600; z += 400) for (let x = -600; x <= 600; x += 400) {   // open country: on a road out there (not just a forest's roof)
      let best = null, d = 240; for (const r of LAYOUT.roads) if (r.kind !== 'track') for (let i = 0; i < r.pts.length; i += 4) { const p = r.pts[i], e = Math.hypot(p[0] - x, p[1] - z); if (e < d) { d = e; best = p; } }
      if (best) add('road', best[0], best[1]);
    }
    return out;
  },
  /* a random district to start over (?spot=name or ?x=&z= in the browser preview) */
  pickStart() { const far = this.list.filter(d => !LAYOUT.sites.some(s => Math.hypot(s.x - d.x, s.z - d.z) < 450)); return pick(far.length ? far : this.list); },   // (not next to a site of the enemy's base: it is only built out of sight)
  init() {
    this.list = this.districts();
    let d = this.pickStart();
    if (QS.has('spot')) { const n = QS.get('spot'); d = this.list.find(o => o.n === n) || d; }
    if (QS.has('x')) d = { n: 'url', x: parseFloat(QS.get('x')), z: parseFloat(QS.get('z') || 0) };
    this.home = d; this.ao = this.list.indexOf(d) + 1;
    this.look.set(d.x, groundH(d.x, d.z), d.z); this.aim.copy(this.look); this.aimS.copy(this.look); this.vel.set(0, 0, 0);
    CAM_TGT.copy(this.look); this.ctr.copy(this.look); CAM_CTR.copy(this.look);
    this.zm = this.zoomTarget(); this.state = 'orbit';
    this.nextTransit = T + this.interval(); this.nextWander = T + rand(8, 14);
  },
  interval() { return CFG.transitMin * 60 * rand(0.8, 1.2); },
  zoomTarget() { const w = ARMS.w; return (w ? w.zoom : 1) * (this.state === 'transit' ? 1 - 0.3 * Math.sin(Math.PI * this.tr.p) : 1); },
  /* a point of interest near the district: a building, a junction, a tracked vehicle, or just somewhere close */
  wanderPoint(out) {
    const h = this.home, R = 150, poi = [];
    for (const b of LAYOUT.buildings) if (Math.abs(b.x - h.x) < R && Math.abs(b.z - h.z) < R) poi.push([b.x, b.z]);
    for (const j of LAYOUT.junctions) if (Math.abs(j.x - h.x) < R && Math.abs(j.z - h.z) < R) poi.push([j.x, j.z], [j.x, j.z]);
    for (const t of TRACKS) { if (t.side === 'enemy') continue; const p = t.obj.position; if (Math.abs(p.x - h.x) < R && Math.abs(p.z - h.z) < R) poi.push([p.x, p.z], [p.x, p.z], [p.x, p.z]); }
    const p = poi.length && Math.random() < 0.8 ? pick(poi) : [h.x + rand(-90, 90), h.z + rand(-90, 90)];
    return out.set(p[0], groundH(p[0], p[1]), p[1]);
  },
  /* fly to another district at least 500 m away */
  startTransit() {
    const far = this.list.filter(d => d !== this.home && Math.hypot(d.x - this.look.x, d.z - this.look.z) > 500);
    if (!far.length) { this.nextTransit = T + this.interval(); return; }
    this.goTo(pick(far));
  },
  /* fly to a point { n, x, z } (a district, or in a fight the enemies' base or a target); during a transit it waits for the arrival */
  goTo(d) {
    if (this.state === 'transit') { this.next = d; return; }
    const dist = Math.hypot(d.x - this.look.x, d.z - this.look.z); if (dist < 60) { this.track(d); return; }
    this.tr = { from: this.look.clone(), to: d, p: 0, dur: Math.max(d.n === 'tgt' ? 5 : 9, dist / 80) };   // (smootherstep peaks at 1.9× the mean: ~150 m/s)
    this.state = 'transit';
  },
  /* slew onto a point (combat, stage 6) */
  track(p) { this.aim.set(p.x, groundH(p.x, p.z), p.z); this.nextWander = T + 12; },
  update(dt) {
    if (!QS.has('az')) camAz -= 0.03 * CFG.orbit / 100 * dt;               // the left orbit
    if (this.state === 'orbit') {
      if (T >= this.nextTransit && CFG.transitMin > 0 && !AUD.combat) this.startTransit();
      else if (T >= this.nextWander) { this.wanderPoint(this.aim); this.nextWander = T + rand(12, 22); }
      // a critically damped slew towards an eased aim point (no overshoot; the easing takes the kick out of the start)
      const lock = AUD.fighting && BATTLE.focus, w = lock ? SLEW_LOCK : 0.9;   // (on a target: a quick, firm slew that keeps the reticle on it)
      this.aimS.lerp(this.aim, Math.min(1, dt * (lock ? 8 : 0.9))); _gsa.subVectors(this.aimS, this.look).multiplyScalar(w * w).addScaledVector(this.vel, -2 * w);
      this.vel.addScaledVector(_gsa, dt); this.look.addScaledVector(this.vel, dt);
    }
    if (this.state === 'transit') {
      const t = this.tr; t.p = Math.min(1, t.p + dt / t.dur); const e = t.p * t.p * t.p * (t.p * (t.p * 6 - 15) + 10);   // (smootherstep)
      const lx = this.look.x, lz = this.look.z; this.look.set(lerp(t.from.x, t.to.x, e), 0, lerp(t.from.z, t.to.z, e));
      this.ctr.x += this.look.x - lx; this.ctr.z += this.look.z - lz;   // (a transit: the aircraft flies along with its sensor's point)
      if (t.p >= 1) { this.state = 'orbit'; this.home = t.to; this.ao = this.list.indexOf(t.to) + 1; this.aim.copy(this.look); this.aimS.copy(this.look); this.vel.set(0, 0, 0); this.settled = T + 0.8; this.nextTransit = T + this.interval(); this.nextWander = T + rand(6, 10); if (this.next) { const n = this.next; this.next = null; this.goTo(n); } }
    }
    this.look.y = groundH(this.look.x, this.look.z);
    this.ctr.x += (this.look.x - this.ctr.x) * Math.min(1, dt * 0.1); this.ctr.z += (this.look.z - this.ctr.z) * Math.min(1, dt * 0.1);   // (the orbit drifts after what the sensor is on, slowly)
    CAM_CTR.x = this.ctr.x; CAM_CTR.z = this.ctr.z; CAM_CTR.y += (groundH(this.ctr.x, this.ctr.z) - CAM_CTR.y) * Math.min(1, dt * 0.8);
    const zt = this.zoomTarget(); this.zm += (zt - this.zm) * Math.min(1, dt * 1.6);
    CAM_TGT.x = this.look.x; CAM_TGT.z = this.look.z; CAM_TGT.y += (this.look.y - CAM_TGT.y) * Math.min(1, dt * 2.5);   // (the height eased: bumps don't shake the picture)
    this.applied = this.zm * CFG.zoom; updateCamera();   // (every step: the lens follows the range to the point as well as the weapon's, the transit's and the setting's zoom)
  }
};

/* ===== What the HUD brackets: { obj, side: 'ally' | 'enemy', inf, h (the bracket's centre above the object's origin) } ===== */
const TRACKS = [];
