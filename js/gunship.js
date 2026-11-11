'use strict';
/* ===== The gunship: a slow left orbit over a district, the sensor slewing between points of interest in it, a transit to
   another district every few minutes in silence; the zoom per weapon. It moves the camera's look-at point (main.js turns it into a pose).
   Runtime choices (start district, wander) use Math.random: they need not repeat for a seed, only the map does.            */
const GS_MARGIN = 260;          // districts keep this far from the map's edge (the frame is clamped inside the map anyway)
const _gsa = new V3();
const GUNSHIP = {
  state: 'orbit', list: [], home: null, look: new V3(), aim: new V3(), aimS: new V3(), vel: new V3(),
  zm: 1, nextTransit: 0, nextWander: 0, tr: null, ao: 0,
  /* the districts worth orbiting: towns, the station, a bridge, lakes, farms, fields and roads out in the country */
  districts() {
    const out = [], sp = LAYOUT.spots(), M = MAP_HALF - GS_MARGIN;
    const add = (n, x, z) => { x = clamp(x, -M, M); z = clamp(z, -M, M); if (!out.some(d => Math.hypot(d.x - x, d.z - z) < 280)) out.push({ n, x, z }); };
    for (const t of LAYOUT.towns) add('town', t.x, t.z);
    for (const k in sp) add(k, sp[k][0], sp[k][1]);
    for (const f of LAYOUT.farms) add('farm', f.x, f.z);
    for (let z = -600; z <= 600; z += 400) for (let x = -600; x <= 600; x += 400) {   // open country: on a road out there (not just a forest's roof)
      let best = null, d = 240; for (const r of LAYOUT.roads) if (r.kind !== 'track') for (let i = 0; i < r.pts.length; i += 4) { const p = r.pts[i], e = Math.hypot(p[0] - x, p[1] - z); if (e < d) { d = e; best = p; } }
      if (best) add('road', best[0], best[1]);
    }
    return out;
  },
  /* a random district to start over (?spot=name or ?x=&z= in the browser preview) */
  pickStart() { return pick(this.list); },
  init() {
    this.list = this.districts();
    let d = this.pickStart();
    if (QS.has('spot')) { const n = QS.get('spot'); d = this.list.find(o => o.n === n) || d; }
    if (QS.has('x')) d = { n: 'url', x: parseFloat(QS.get('x')), z: parseFloat(QS.get('z') || 0) };
    this.home = d; this.ao = this.list.indexOf(d) + 1;
    this.look.set(d.x, groundH(d.x, d.z), d.z); this.aim.copy(this.look); this.aimS.copy(this.look); this.vel.set(0, 0, 0);
    CAM_TGT.copy(this.look);
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
    for (const t of TRACKS) { const p = t.obj.position; if (Math.abs(p.x - h.x) < R && Math.abs(p.z - h.z) < R) poi.push([p.x, p.z], [p.x, p.z], [p.x, p.z]); }
    const p = poi.length && Math.random() < 0.8 ? pick(poi) : [h.x + rand(-90, 90), h.z + rand(-90, 90)];
    return out.set(p[0], groundH(p[0], p[1]), p[1]);
  },
  /* fly to another district at least 500 m away */
  startTransit() {
    const far = this.list.filter(d => d !== this.home && Math.hypot(d.x - this.look.x, d.z - this.look.z) > 500);
    if (!far.length) { this.nextTransit = T + this.interval(); return; }
    const d = pick(far), dist = Math.hypot(d.x - this.look.x, d.z - this.look.z);
    this.tr = { from: this.look.clone(), to: d, p: 0, dur: Math.max(9, dist / 80) }   // (smootherstep peaks at 1.9× the mean: ~150 m/s);
    this.state = 'transit';
  },
  /* slew onto a point (combat, stage 6) */
  track(p) { this.aim.set(p.x, groundH(p.x, p.z), p.z); this.nextWander = T + 12; },
  update(dt) {
    if (!QS.has('az')) camAz -= 0.03 * CFG.orbit / 100 * dt;               // the left orbit
    if (this.state === 'orbit') {
      if (T >= this.nextTransit && CFG.transitMin > 0) this.startTransit();
      else if (T >= this.nextWander) { this.wanderPoint(this.aim); this.nextWander = T + rand(12, 22); }
      // a critically damped slew towards an eased aim point (no overshoot; the easing takes the kick out of the start)
      this.aimS.lerp(this.aim, Math.min(1, dt * 0.9));
      const w = 0.9; _gsa.subVectors(this.aimS, this.look).multiplyScalar(w * w).addScaledVector(this.vel, -2 * w);
      this.vel.addScaledVector(_gsa, dt); this.look.addScaledVector(this.vel, dt);
    }
    if (this.state === 'transit') {
      const t = this.tr; t.p = Math.min(1, t.p + dt / t.dur); const e = t.p * t.p * t.p * (t.p * (t.p * 6 - 15) + 10);   // (smootherstep)
      this.look.set(lerp(t.from.x, t.to.x, e), 0, lerp(t.from.z, t.to.z, e));
      if (t.p >= 1) { this.state = 'orbit'; this.home = t.to; this.ao = this.list.indexOf(t.to) + 1; this.aim.copy(this.look); this.aimS.copy(this.look); this.vel.set(0, 0, 0); this.nextTransit = T + this.interval(); this.nextWander = T + rand(6, 10); }
    }
    this.look.y = groundH(this.look.x, this.look.z);
    const zt = this.zoomTarget(), zm0 = this.zm; this.zm += (zt - this.zm) * Math.min(1, dt * 1.6);
    CAM_TGT.x = this.look.x; CAM_TGT.z = this.look.z; CAM_TGT.y += (this.look.y - CAM_TGT.y) * Math.min(1, dt * 2.5);   // (the height eased: bumps don't shake the picture)
    if (Math.abs(this.zm - zm0) > 1e-5) updateCamera(); else updateCameraPose();
  }
};

/* ===== What the HUD brackets: { obj, side: 'ally' | 'enemy', inf, h (the bracket's centre above the object's origin) } ===== */
const TRACKS = [];
/* dummies until the units come in stage 5: allied armour on a road in every district, enemy armour in every other one */
function placeDummies() {
  const roads = LAYOUT.roads.filter(r => r.kind !== 'track');
  const nearRoad = (x, z, avoid) => {
    let best = null, d = 220;
    for (const r of roads) for (let i = 4; i < r.pts.length - 8; i += 3) {
      const p = r.pts[i], e = Math.hypot(p[0] - x, p[1] - z);
      if (e < d && !r.br[i] && !r.br[i + 8] && !(avoid && Math.hypot(p[0] - avoid[0], p[1] - avoid[1]) < 70)) { d = e; best = [r, i]; }
    }
    return best;
  };
  const put = (side, at) => {
    const [r, i0] = at; let k = 0;
    for (const build of [buildT90, buildBTR]) {
      const i = i0 + k * 4, p = r.pts[i], q = r.pts[i + 1], g = build(); k++;
      g.scale.setScalar(ARMOR_SCALE); g.position.set(p[0], groundH(p[0], p[1]), p[1]); g.rotation.y = -Math.atan2(q[1] - p[1], q[0] - p[0]);
      scene.add(g); TRACKS.push({ obj: g, side, inf: false, h: 2 });
    }
    return r.pts[i0];
  };
  GUNSHIP.list.forEach((d, n) => {
    const a = nearRoad(d.x, d.z); if (!a) return;
    const pa = put('ally', a);
    if (n % 2 === 0) { const b = nearRoad(d.x + 30, d.z - 30, pa); if (b) put('enemy', b); }
  });
}
