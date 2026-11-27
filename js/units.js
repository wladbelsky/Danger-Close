'use strict';
/* ===== Units: the road graph, vehicles driving paths, columns, helicopters, infantry squads, and the allies' patrols =====
   The allies always exist: from each outpost a column drives out along the roads to a district and back, a helicopter takes off
   from the pad, flies a round of the map and lands, a fireteam walks a loop round the walls. Runtime choices use Math.random.   */
const UNIT_TYPES = {
  ally:  { tank: buildAbrams, apc: buildBradley, car: buildHumvee, heli: [buildAH64, buildUH60, buildAH1Z] },
  enemy: { tank: buildT90, apc: buildBTR, car: buildTechnical, heli: [buildMi24, buildKa52, buildMi8] }
};
const UNIT_SPEED = { tank: 8, apc: 9.5, car: 12 };   // m/s on a road
const GAP = 16;                                          // metres between vehicles in a column

/* ---- combatants: every vehicle, helicopter, soldier and base structure is in UNITS with { side, kind, pos, hp, alive, tgt,
   ah (where to aim above pos), die(), remove() }; js/battle.js makes them fight ---- */
const UNITS = [];
const UNIT_HP = { inf: 1, car: 3, apc: 7, tank: 14, heli: 6, struct: 8 };
function enlist(u, side, kind, pos, ah) { u.side = side; u.kind = kind; u.pos = pos; u.hp = UNIT_HP[kind]; u.alive = true; u.tgt = null; u.cool = rand(1, 4); u.think = rand(0, 1); u.ah = ah; u.retreat = false; UNITS.push(u); return u; }
function delist(u) { u.alive = false; u.tgt = null; const i = UNITS.indexOf(u); if (i >= 0) UNITS.splice(i, 1); }
function untrack(obj) { const k = TRACKS.findIndex(t => t.obj === obj); if (k >= 0) TRACKS.splice(k, 1); }
function hurt(u, d) { if (!u.alive || d <= 0) return; u.hp -= d; if (u.hp <= 0) u.die(); else if (u.onHit) u.onHit(); else if (u.kind === 'inf') hitPuff(u.position); }   // (a soldier hit: dust where it struck; killed: puffDust)
/* a model of a type: built once, cloned after that (clones share the geometry and the materials: nothing to dispose) */
const PROTO = {};
function unitModel(side, type, variant) { const b = UNIT_TYPES[side][type], fn = Array.isArray(b) ? b[variant || 0] : b; return (PROTO[fn.name] || (PROTO[fn.name] = fn())).clone(); }

/* ---- the road graph: a node per road sample (4 m), edges along each road and where a road's end meets another road ---- */
const ROADNET = {
  n: 0, X: null, Z: null, Y: null, BR: null, HW: null, RID: null, adj: [], cell: new Map(),
  key(x, z) { return Math.floor(x / 12) + ',' + Math.floor(z / 12); },
  build() {
    const X = [], Z = [], Y = [], BR = [], HW = [], RID = [], adj = [], ends = [];
    LAYOUT.roads.forEach((r, ri) => {
      const hw = ROAD_KINDS[r.kind].w / 2, base = X.length;
      r.pts.forEach((p, i) => { X.push(p[0]); Z.push(p[1]); BR.push(r.br[i] ? 1 : 0); Y.push(r.br[i] ? r.h[i] + 0.5 : 0); HW.push(hw); RID.push(ri); adj.push(i ? [base + i - 1] : []); if (i) adj[base + i - 1].push(base + i); });
      ends.push(base, base + r.pts.length - 1);
    });
    Object.assign(this, { n: X.length, X, Z, Y, BR, HW, RID, adj }); this.cell = new Map();
    for (let k = 0; k < this.n; k++) { const c = this.key(X[k], Z[k]); (this.cell.get(c) || this.cell.set(c, []).get(c)).push(k); }
    for (const e of ends) {   // an end joins the nearest sample of every other road within 9 m
      const best = new Map();
      this.near(X[e], Z[e], 9, k => { if (RID[k] === RID[e]) return; const d = Math.hypot(X[k] - X[e], Z[k] - Z[e]), b = best.get(RID[k]); if (!b || d < b[1]) best.set(RID[k], [k, d]); });
      for (const [k] of best.values()) if (!adj[e].includes(k)) { adj[e].push(k); adj[k].push(e); }
    }
    this.g = new Float64Array(this.n); this.from = new Int32Array(this.n); this.stamp = new Int32Array(this.n); this.run = 0;
  },
  near(x, z, r, fn) { const c0 = Math.floor((x - r) / 12), c1 = Math.floor((x + r) / 12), d0 = Math.floor((z - r) / 12), d1 = Math.floor((z + r) / 12); for (let i = c0; i <= c1; i++) for (let j = d0; j <= d1; j++) for (const k of this.cell.get(i + ',' + j) || []) fn(k); },
  nearest(x, z, r) { let best = -1, d = r; this.near(x, z, r, k => { const e = Math.hypot(this.X[k] - x, this.Z[k] - z); if (e < d) { d = e; best = k; } }); return best; },
  /* the road node to send a column to for a place: the nearest within r m, else within 700 m (a fight in the fields, away from the
     roads: the armour comes to the nearest road, not off to some other errand) */
  toward(x, z, r = 250) { const k = this.nearest(x, z, r); return k >= 0 ? k : this.nearest(x, z, 700); },
  /* node indices from a to b (A*), or null */
  route(a, b) {
    const { X, Z, adj, g, from, stamp } = this, run = ++this.run, H = k => Math.hypot(X[k] - X[b], Z[k] - Z[b]), hk = [], hv = [];
    const push = (k, v) => { hk.push(k); hv.push(v); let i = hk.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (hv[p] <= hv[i]) break; [hk[p], hk[i]] = [hk[i], hk[p]]; [hv[p], hv[i]] = [hv[i], hv[p]]; i = p; } };
    const pop = () => { const k = hk[0], lk = hk.pop(), lv = hv.pop(); if (hk.length) { hk[0] = lk; hv[0] = lv; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < hk.length && hv[l] < hv[m]) m = l; if (r < hk.length && hv[r] < hv[m]) m = r; if (m === i) break; [hk[m], hk[i]] = [hk[i], hk[m]]; [hv[m], hv[i]] = [hv[i], hv[m]]; i = m; } } return k; };
    stamp[a] = run; g[a] = 0; from[a] = -1; push(a, H(a));
    while (hk.length) {
      const k = pop(); if (k === b) break;
      for (const n of adj[k]) { const v = g[k] + Math.hypot(X[n] - X[k], Z[n] - Z[k]); if (stamp[n] !== run || v < g[n]) { stamp[n] = run; g[n] = v; from[n] = k; push(n, v + H(n)); } }
    }
    if (stamp[b] !== run) return null;
    const out = []; for (let k = b; k >= 0; k = from[k]) out.push(k); return out.reverse();
  }
};

/* ---- a path to drive: points { x, z, y (deck height on a bridge, else NaN: the ground), hw (half width: the lane) }. A vehicle
   drives the line averaged over PATH_SMOOTH metres either side (less near the ends, none at them): a corner of the road's
   polyline becomes a bend it steers round, not a kink ---- */
const PATH_SMOOTH = 6;
class Path {
  constructor(pts) {
    this.p = pts; this.S = [0];
    for (let i = 1; i < pts.length; i++) this.S.push(this.S[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
    this.L = this.S[this.S.length - 1];
    // the right of the direction of travel at each point (the mean of the segments either side) and the lane's offset there: both
    // taken between points, so the lane bends round a corner or a junction and narrows onto a single track without a jump
    this.N = pts.map((q, i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], d = Math.hypot(b.x - a.x, b.z - a.z) || 1; return [-(b.z - a.z) / d, (b.x - a.x) / d]; });
    this.W = pts.map(q => { const hw = q.hw || 0; return Math.min(1.8, hw * 0.45) * smoothstep(2.1, 2.9, hw); });
    // per point: x, z and the lane's offset (right x width); their integrals along the way up to each point (for the average)
    const n = pts.length; this.V = [0, 1, 2, 3].map(c => Float64Array.from(pts, (q, i) => c === 0 ? q.x : c === 1 ? q.z : this.N[i][c - 2] * this.W[i]));
    this.F = this.V.map(V => { const F = new Float64Array(n); for (let i = 1; i < n; i++) F[i] = F[i - 1] + (this.S[i] - this.S[i - 1]) * (V[i] + V[i - 1]) / 2; return F; });
    this._f0 = [0, 0, 0, 0]; this._f1 = [0, 0, 0, 0];
  }
  seg(s) { const S = this.S; let lo = 0, hi = S.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m] <= s) lo = m; else hi = m; } return lo; }
  /* the integrals of x, z and the lane offset from the start up to s (into o) */
  prim(s, o) {
    const lo = this.seg(s), hi = Math.min(lo + 1, this.S.length - 1), d = s - this.S[lo], t = d / (this.S[hi] - this.S[lo] || 1);
    for (let c = 0; c < 4; c++) { const V = this.V[c]; o[c] = this.F[c][lo] + d * (V[lo] + lerp(V[lo], V[hi], t)) / 2; }
    return o;
  }
  /* the width of the lane's offset at s (metres per unit of laneK) */
  wAt(s) { s = clamp(s, 0, this.L); const lo = this.seg(s), hi = Math.min(lo + 1, this.S.length - 1); return lerp(this.W[lo], this.W[hi], clamp((s - this.S[lo]) / (this.S[hi] - this.S[lo] || 1), 0, 1)); }
  static fromNodes(nodes, head, tail) {
    const N = ROADNET, pts = (head || []).slice();
    for (const k of nodes) pts.push({ x: N.X[k], z: N.Z[k], y: N.BR[k] ? N.Y[k] : NaN, hw: N.HW[k] });
    return new Path(pts.concat(tail || []).filter((q, i, a) => !i || Math.hypot(q.x - a[i - 1].x, q.z - a[i - 1].z) > 0.3));
  }
  reversed() { return new Path(this.p.slice().reverse()); }
  /* the point at distance s, laneK × the lane's offset to the right of the direction of travel (on the averaged line) */
  at(s, laneK, out) {
    s = clamp(s, 0, this.L); const S = this.S, lo = this.seg(s), hi = Math.min(lo + 1, S.length - 1), a = this.p[lo], b = this.p[hi], t = (s - S[lo]) / (S[hi] - S[lo] || 1);
    const w = Math.min(PATH_SMOOTH, s, this.L - s); let x, z;
    if (w < 0.05) { const V = this.V; x = lerp(V[0][lo], V[0][hi], t) + lerp(V[2][lo], V[2][hi], t) * laneK; z = lerp(V[1][lo], V[1][hi], t) + lerp(V[3][lo], V[3][hi], t) * laneK; }
    else { const f0 = this.prim(s - w, this._f0), f1 = this.prim(s + w, this._f1), k = 1 / (2 * w); x = (f1[0] - f0[0] + (f1[2] - f0[2]) * laneK) * k; z = (f1[1] - f0[1] + (f1[3] - f0[3]) * laneK) * k; }
    const y = (a.y === a.y && b.y === b.y) ? lerp(a.y, b.y, t) : groundH(x, z);
    return out.set(x, y, z);
  }
}

/* ---- a ground vehicle on a path ---- */
const _va = new V3(), _vb = new V3(), _vc = new V3();
/* a vehicle swerving across the road under fire (BATTLE: laneT, weaveUntil) changes its lane factor at most this fast, per second,
   and that rate at most WEAVE_ACC per second: it eases into a swerve and out of it, an S, not a zigzag. Knocked out on the move,
   it rolls on down the road, slowing at COAST m/s per second and drifting towards a kerb */
const WEAVE_RATE = 2, WEAVE_ACC = 3, COAST = { tank: 4, apc: 3, car: 2.5 };
/* every vehicle (not only a column's leader) takes a bend no faster than this sideways acceleration allows (m/s per second): it
   slows for the bend over the next BEND_LOOK metres of its own lane */
const BEND_ACC = 3, BEND_LOOK = 16;
/* traffic: every vehicle looks TRAFFIC.look m ahead for another vehicle (any column, either side) or a wreck in its way: it brakes
   to stop `gap` m short of it (its hull's half length and the other's apart), an oncoming one makes both pull aside (`po`, metres
   to the right of their track, even on a single track: onto the verge), and one standing in the way (a wreck, a halted column)
   for `wait` s is driven round, up to `side` m aside, where no building or water is. Stuck nose to nose for `ghost` s: it gives up
   looking at that one (a narrow street between houses). All of it only within `near` m past the frame (VIEW.near): out there
   nobody sees them, they drive as they like (columns queued for minutes 1–1.5 km off kept the armour from ever reaching the
   fight). Two that come in inside each other (one drove through the other out there, or a wreck rolled into it) push apart
   sideways at `shove` m/s, up to 3 m further than `side`: apart before they are in the frame */
/* the nose's turn off its path (into a swerve, aside) eased over this many seconds (Vehicle.pose) */
const NOSE_EASE = 1.0;
/* the direction its aside (po) is laid off in (pd) turns towards its path's at most so fast that the aside moves `v` m/s round, never
   slower than `min` rad/s (a bend at speed turns it no faster: never held back there; a wide aside swings round faster than `v`); dirAt flips at once where a path doubles back: the aside jumped across */
const PD_RATE = { v: 3, min: 2 };
const TRAFFIC = { look: 35, every: 0.15, gap: 2, brake: 4, side: 5, off: 8, rate: 1.6, wait: 1.5, head: 4, ghost: 8, near: 80, shove: 2 };
/* do two boxes { x, z (centre), c, s (cos, sin of the heading), l, w (half length, half width) } overlap? (separating axes) */
function obbOverlap(A, B) {
  for (const [ax, az] of [[A.c, A.s], [-A.s, A.c], [B.c, B.s], [-B.s, B.c]]) {
    const pa = Math.abs(A.c * ax + A.s * az) * A.l + Math.abs(-A.s * ax + A.c * az) * A.w, pb = Math.abs(B.c * ax + B.s * az) * B.l + Math.abs(-B.s * ax + B.c * az) * B.w;
    if (Math.abs((B.x - A.x) * ax + (B.z - A.z) * az) > pa + pb) return false;
  }
  return true;
}
const HULL = {};   // half length, half width and the centre's offset along x of each model's hull (turret, gun and roof MG left out), metres
function hullOf(side, type) {
  const k = side + type; if (HULL[k]) return HULL[k];
  const o = unitModel(side, type), b = new THREE.Box3(); o.updateMatrixWorld(true);
  o.traverse(m => { if (!m.isMesh) return; for (let p = m; p; p = p.parent) if (p.name === 'turret' || p.name === 'mg') return; b.expandByObject(m); });
  return (HULL[k] = { l: (b.max.x - b.min.x) / 2 * ARMOR_SCALE, w: (b.max.z - b.min.z) / 2 * ARMOR_SCALE, c: (b.max.x + b.min.x) / 2 * ARMOR_SCALE });
}
class Vehicle {
  constructor(type, side) {
    this.type = type; this.obj = unitModel(side, type); this.obj.scale.setScalar(ARMOR_SCALE); scene.add(this.obj);
    this.turret = this.obj.getObjectByName('turret'); this.mg = this.obj.getObjectByName('mg'); this.aaUntil = 0; this.mgOff = 9; this.ph = Math.random() * TAU;   // (mg: the machine gun on the roof, raised at the aircraft while it fires up: AA in js/weather.js)
    this.path = null; this.s = 0; this.v = 0; this.yaw = 0; this.laneK = 1; this.lv = 0; this.vmax = UNIT_SPEED[type]; this.col = null; this.troops = type === 'apc' ? randi(4, 6) : 0;   // (troops: the infantry it carries)
    this.hull = hullOf(side, type); this.obj.userData.veh = this; this.po = 0; this.pov = 0; this.tk = Math.random() * TRAFFIC.every; this.blk = null; this.blkT = 0; this.byp = null; this.ghosts = null;   // (po: aside of its track, m; blk: what is in its way)
    enlist(this, side, type, this.obj.position, type === 'car' ? 1.3 : 1.9);
    TRACKS.push({ obj: this.obj, side, inf: false, h: type === 'car' ? 1.5 : 2.2 });
  }
  /* where it can turn off its way from, at its speed (a little further than it takes to stop: `x`, `z`), its way there (`via`) and its
     heading there (`hd`) */
  ahead() {
    const L = clamp(this.v * this.v / 4 + 2, 3, 25), via = [], tL = L / Math.max(this.v, 1); let hw;
    for (let d = 1.5; ; d = Math.min(d + 4, L)) {   // (the first a step on: the way's first stretch leaves the way it is going)
      const s = Math.min(this.path.L, this.s + d), t = d / Math.max(this.v, 1), e = t * (1 - t / (2 * tL)), k = clamp(this.laneK + this.lv * e, -2.2, 2.2), po = this.po + this.pov * e;   // (a swerve or a move aside under way carries on, easing out: the way on leaves where it is going, not a kink)
      hw = this.dirAt(s, k); const hd = this.asideAt(s - this.s, hw); this.path.at(s, k, _va); via.push({ x: _va.x - Math.sin(hd) * po, z: _va.z + Math.cos(hd) * po, y: NaN, hw: 0 }); if (d >= L || s >= this.path.L) break;
    }
    const e = via[via.length - 1]; return { x: e.x, z: e.z, via, hd: hw };   // (hd: its way's heading there)
  }
  setPath(path, s, snap) { this.path = path; this.s = s; this.pd = null; if (snap) { this.pose(0, true); } }   // (pd: the aside laid off across the new path at once: reroute measures po across it)
  /* towards the target speed (a gentle start, firmer brakes), then along the path */
  drive(dt, vt, smax, va) {   // (smax: no further than this along the path, va: then no faster than this; it never goes back)
    const turn = Math.abs(angleWrap(this.dirAt(this.s + 1) - this.yaw));
    if (turn > 0.6) vt = Math.min(vt, 1.2);                                  // (turning round first: slowly, nearly on the spot)
    else vt = Math.min(vt, Math.max(3, Math.sqrt(BEND_ACC / Math.max(this.bend(), T < (this.weaveUntil || 0) ? this.bend(this.laneT) : 0, 1e-3))));   // (weaving: the bend on the lane it swerves to as well, the inner one of a corner is tighter)
    this.near = VIEW.near(this.pos, TRAFFIC.near);   // (TRAFFIC.near)
    if (this.near) this.shove(dt); else this.shoveD = 0;
    if (!(occAt(this.pos.x, this.pos.z) & OCC_ROAD) && !(T < (this.dashUntil || 0))) vt = Math.min(vt, this.vmax * FIELD.speed);   // (across a field: slower, but for a dash into cover)
    const po0 = this.po; vt = this.traffic(dt, vt);   // (traffic() moves it aside: step() checks that move too)
    this.v += clamp(vt - this.v, -5 * dt, 2.5 * dt); let s = Math.min(this.path.L, this.s + this.v * dt);
    if (smax !== undefined && s > smax) { s = Math.max(this.s, smax); this.v = Math.min(this.v, va); }
    this.step(dt, s, po0);
  }
  /* on to s; a move that would take its hull further into another's (a vehicle or a wreck) is not made: it stands */
  step(dt, s, po0 = this.po) {   // (po0: its aside before this step's move: one standing and pushed aside went through a wreck unchecked)
    const s0 = this.s, po = po0, k = this.laneK, lv = this.lv, yaw = this.yaw, x0 = this.pos.x, z0 = this.pos.z, pd = this.pd, vE = this.vE, pvE = this.pvE;
    this.s = s; this.pose(dt, false);
    if ((s !== s0 || this.po !== po || (this.po && this.pd !== pd)) && this.near && this.bumps(x0, z0)) {   // (pd: its aside swinging round moves it too)
      const pn = this.po; this.s = s0; this.po = po; this.laneK = k; this.lv = lv; this.yaw = yaw; this.pd = pd; this.vE = vE; this.pvE = pvE; this.v = 0; this.pose(0, false); this.bumpT = T; this.bumpO = this._bo; BATTLE.stat.bump++;   // (all of the refused move's pose undone: where it stood)
      if (pn !== po) { this.po = pn; this.pose(0, false); if (this.bumps(x0, z0)) { this.po = po; this.pov = 0; this.yaw = yaw; this.pose(0, false); } }   // (only aside, then: away from what it touches; nose to nose they would stand for good)
      else this.pov = 0;
    }
  }
  /* inside another (a vehicle or a wreck): aside, away from it (TRAFFIC.shove), where no building or water is; it holds that
     offset while it touches (traffic() does not pull it back, and bumps() refuses a move back into it) */
  shove(dt) {   // (sets shoveD: -1 / 1 to its left / right, 0 touching nothing)
    const H = this.hull, c = Math.cos(this.yaw), sn = Math.sin(this.yaw), A = { x: this.pos.x + c * H.c, z: this.pos.z + sn * H.c, c, s: sn, l: H.l, w: H.w + 0.3 };
    const hd = this.asideAt(0, this.dirAt(this.s, this.laneK)), hc = Math.cos(hd), hs = Math.sin(hd);   // (sideways measured across its path, not its nose: the nose turns as it moves aside; as its aside is laid off, pd)
    const push = (u, p, still) => {
      const h = u.hull, dx = p.x - this.pos.x, dz = p.z - this.pos.z; if (dx * dx + dz * dz > (H.l + h.l + 1) ** 2) return false;
      const oc = Math.cos(u.yaw), os = Math.sin(u.yaw), B = { x: p.x + oc * h.c, z: p.z + os * h.c, c: oc, s: os, l: h.l, w: h.w + 0.3 }; if (!obbOverlap(A, B)) return false;
      const round = this.byp && this.byp.o === u; if (round && !obbOverlap(A, { x: B.x, z: B.z, c: oc, s: os, l: h.l, w: h.w })) return false;   // (the one it is going round steers it, bumps() keeps them apart; but inside its hull already: pushed out of it, to the side it goes round by: dropping the bypass to push it out set the two against each other, left and right)
      const lat = -(B.x - A.x) * hs + (B.z - A.z) * hc, d = round ? this.byp.d : this.shoveO === u ? this.shoveE : Math.abs(lat) > 0.1 ? -Math.sign(lat) : this.ph < u.ph || still ? -1 : 1;   // (away from it, the same way while they touch; right on top of each other: one each way)
      for (const e of round ? [d] : [d, -d]) { const M = this.asideMax() + 3, po = clamp(this.po + e * 1.5, -M, M); if (Math.abs(po - this.po) > 0.1 && this.clear(po, 6)) { this.shoveD = this.shoveE = e; this.shoveO = u; this.shoveT = T + 2; BATTLE.stat.shove += dt; return true; } }   // (traffic() eases it out that way)
      return false;
    };
    this.shoveD = 0;
    for (const u of UNITS) if (u !== this && u instanceof Vehicle && push(u, u.pos, false)) return;
    for (const w of WRECKS.list) { const u = w.veh; if (u && u !== this && w.obj.parent === scene && w.obj.position.y > w.y0 - 2 && push(u, u.obj.position, true)) return; }
    this.shoveO = null;
  }
  bumps(x0, z0) {
    const H = this.hull, c = Math.cos(this.yaw), sn = Math.sin(this.yaw), A = { x: this.pos.x + c * H.c, z: this.pos.z + sn * H.c, c, s: sn, l: H.l, w: H.w };
    const test = (u, p) => {
      const h = u.hull, dx = p.x - this.pos.x, dz = p.z - this.pos.z; if (dx * dx + dz * dz > (H.l + h.l + 1) ** 2) return false;
      const oc = Math.cos(u.yaw), os = Math.sin(u.yaw), B = { x: p.x + oc * h.c, z: p.z + os * h.c, c: oc, s: os, l: h.l, w: h.w };
      return obbOverlap(A, B) && Math.hypot(B.x - A.x, B.z - A.z) < Math.hypot(B.x - x0 - c * H.c, B.z - z0 - sn * H.c) - 1e-4;   // (only a move that brings them closer)
    };
    for (const u of UNITS) if (u !== this && u instanceof Vehicle && !(this.ghosts && this.ghosts.has(u)) && !(u.col && u.col === this.col && u.s < this.s) && test(u, u.pos)) { this._bo = u; return true; }   // (never its own column's one behind it: a way that turns back past it, an assault across a field, would hold both for good)
    for (const w of WRECKS.list) { const u = w.veh; if (u && u !== this && !(this.ghosts && this.ghosts.has(u)) && w.obj.parent === scene && w.obj.position.y > w.y0 - 2 && test(u, u.obj.position)) { this._bo = u; return true; } }
    return false;
  }
  /* what is in its way ahead (TRAFFIC): { o, al: metres ahead, lat: metres to the right of its path's line (po is its own),
     need: the sideways clearance, hl: its half length, still, head: oncoming } or null. Measured along its path, not its nose:
     the nose turns as it pulls aside, and a lat that turned with it sent the aside's target back and forth (the jitter) */
  blocker() {
    const H = this.hull, hd = this.asideAt(0, this.dirAt(this.s, this.laneK)), c = Math.cos(hd), s = Math.sin(hd); this.path.at(this.s, this.laneK, _va);   // (across the way its aside is laid off, pd: its po and the others' lat on one measure)
    const x0 = _va.x + c * H.c, z0 = _va.z + s * H.c, po = this.po; let best = null;
    const look = (o, ox, oz, oyaw, h, still) => {
      const dx = ox - x0, dz = oz - z0, al = dx * c + dz * s; if (al <= 0 || al > TRAFFIC.look) return;
      const lat = -dx * s + dz * c, rel = Math.abs(angleWrap(oyaw - hd)), need = H.w + (rel > 0.5 && rel < 2.6 ? h.l : h.w) + 0.5;   // (crossing: its length is across our way)
      if (Math.abs(lat - po) > need + 2.5 || (best && best.al < al)) return;
      best = { o, al, lat, need, hl: rel > 0.5 && rel < 2.6 ? h.w : h.l, still, opp: rel > 2.1, head: !still && rel > 2.1 };
    };
    for (const u of UNITS) { if (u === this || !(u instanceof Vehicle) || (u.col && u.col === this.col) || (this.ghosts && this.ghosts.has(u))) continue; const h = u.hull, a = u.yaw; look(u, u.pos.x + Math.cos(a) * h.c, u.pos.z + Math.sin(a) * h.c, a, h, u.v < 0.5); }
    for (const w of WRECKS.list) { const u = w.veh; if (!u || u === this || (this.ghosts && this.ghosts.has(u)) || w.obj.parent !== scene || w.obj.position.y < w.y0 - 2) continue; look(u, u.obj.position.x, u.obj.position.z, u.yaw, u.hull, !w.roll); }
    return best;
  }
  /* the target speed with what is ahead in mind; steers it aside (po) round what stands in its way or past one coming the other way */
  traffic(dt, vt) {
    if ((this.tk -= dt) <= 0) { this.tk = TRAFFIC.every; this.blk = this.near ? this.blocker() : null; }   // (TRAFFIC.near)
    const b = this.blk, H = this.hull, c = Math.cos(this.yaw), sn = Math.sin(this.yaw), S = this.asideMax(); let want = 0;   // (S: how far aside it may go)
    if (this.byp) {   // driving round something: until it is behind
      const o = this.byp.o, op = o.obj.position;
      if ((op.x - this.pos.x) * c + (op.z - this.pos.z) * sn < -(H.l + o.hull.l + 1)) this.byp = null; else { want = this.byp.po; vt = Math.min(vt, 4); }
    }
    if (b) {
      const rl = b.lat - this.po, inWay = Math.abs(rl) < b.need, side = b.opp && Math.abs(rl) < 1.5 ? 1 : rl >= 0 ? -1 : 1, round = this.byp && this.byp.o === b.o;   // (rl: where it is from this one; side: aside away from it; nose to nose, both to their right: away from a lat of nearly nothing both went the same way)
      if (round) { this.byp.po = want = clamp(b.lat + this.byp.d * (b.need + 0.4), -S, S); }   // (round it: as far aside as it takes, from its path's line: steady as the nose turns; a bend turns it)
      if (b.head) { want = this.po + side * Math.max(0, b.need + side * rl + 0.4) * 0.6; vt = Math.min(vt, TRAFFIC.head); }   // (both pull aside, each a share of it)
      else if (inWay && b.still && !round && this.path.L - this.s > b.al + 12) {   // (a new one in its way: round that one now)
        const mates = this.col && this.col.u.some(v => v.byp && v.byp.o === b.o);   // (a wreck, or the one ahead of it in the column already going round: at once)
        this.blkT = b.o.dead || mates ? TRAFFIC.wait : this.blkT + dt;
        if (this.blkT >= TRAFFIC.wait) for (const d of [side, -side]) {
          const S1 = this.asideMax(true), raw = b.lat + d * (b.need + 0.4), po = clamp(raw, -S1, S1);   // (its lat then: need + 0.4 to that side; one facing it pulls out as well, not a wreck: half of it will do)
          if ((b.opp && !b.o.dead ? Math.abs(raw) <= S1 + b.need / 2 : Math.abs(po - b.lat) >= b.need + 0.1) && this.clear(po, b.al + b.hl + 6)) { this.byp = { o: b.o, po, d, S: S1 }; want = po; BATTLE.stat.bypass++; break; }   // (held to S1 it must still get past: 0.1 m short of it, it stood nose to the wreck for good)
        }
      }
      if (inWay) {
        const gap = H.l + b.hl + (round ? 0.8 : b.still ? TRAFFIC.gap + 8 : TRAFFIC.gap);   // (short of one standing: room to go round it)
        vt = Math.min(vt, b.al > gap + 1 && round ? Math.max(1.5, Math.sqrt(2 * TRAFFIC.brake * (b.al - gap))) : Math.sqrt(2 * TRAFFIC.brake * Math.max(0, b.al - gap)));   // (going round it: on at a crawl, steering out)
        if (vt < 0.5 || this.v < 0.3) { this.stuckT = (this.stuckT || 0) + dt; BATTLE.stat.yield += dt; } else this.stuckT = 0;
        if (this.stuckT > TRAFFIC.ghost && (!VIEW.onScreen(this.pos, 0.5) || this.stuckT > 3 * TRAFFIC.ghost)) { (this.ghosts || (this.ghosts = new Set())).add(b.o); this.stuckT = 0; this.blk = null; BATTLE.stat.ghost++; }   // (no way past: it stops looking at that one; in sight only once turning off did not help)
        else if (this.stuckT > TRAFFIC.ghost && T > (this.unjamT || 0) && BATTLE.unjam(this, b.o)) { this.unjamT = T + 20; this.stuckT = 0; }   // (in sight: its column turns off another way)
      } else this.stuckT = 0;
    } else { this.blkT = 0; this.stuckT = 0; }
    if (!this.byp && !(b && b.head)) want = this.shoveT > T ? this.po : 0;   // (pushed aside: it stays there while it touches)
    want = clamp(want, -S, S);
    const r = Math.max(this.byp && this.v < 0.5 ? 0.5 : 0, Math.min(TRAFFIC.rate, this.v * 0.6) + (this.v > 0.3 ? 0.1 : 0)), e = want - this.po, pv = this.shoveD && this.shoveT > T ? this.shoveD * TRAFFIC.shove : Math.abs(e) < 0.03 ? 0 : Math.sign(e) * Math.min(r, Math.sqrt(3 * Math.abs(e)));   // (towards its target no faster than it can stop there at 1.5 m/s per second: no overshoot, no swinging about it)   // (shoved: out at TRAFFIC.shove m/s, eased like the rest; aside only as it rolls on: no crabbing; but going round one it stands nose to: slowly out, steering)
    const room = S + (this.shoveT > T ? 3 : 0) - Math.sign(pv) * this.po, pvs = Math.sign(pv) * Math.min(Math.abs(pv), Math.sqrt(4 * Math.max(0, room)));   // (easing to a stop at S: never further aside, off the verge)
    this.pov += clamp(pvs - this.pov, -2 * dt, 2 * dt); this.po += this.pov * dt;   // (its rate aside eased at 2 m/s per second: no jerk)
    if (this.ghosts && Math.random() < dt * 0.05) this.ghosts = null;
    return vt;
  }
  /* is the way `po` m aside clear of buildings and water for d m ahead (and on a bridge, does it stay on the deck)? */
  /* how far aside of its way it may go (m): on a road `TRAFFIC.side` (the verge), off it `off` (clear() keeps it off the forest the
     field ways avoid); one going round something keeps the limit it started with (own: not that one's), not 5 one step and 8 the
     next as its aside takes it on and off the road's edge */
  asideMax(own) { return this.byp && !own ? this.byp.S : occAt(this.pos.x, this.pos.z) & OCC_ROAD ? TRAFFIC.side : TRAFFIC.off; }
  clear(po, d) {
    const P = this.path; if (this.pos.y > groundH(this.pos.x, this.pos.z) + 0.3) return Math.abs(po) < 0.8;
    for (let k = 0; k <= d; k += 3) {
      if (this.s + k > P.L) break; P.at(this.s + k, this.laneK, _va); const h = this.asideAt(k, this.dirAt(this.s + k, this.laneK)), x = _va.x - Math.sin(h) * po, z = _va.z + Math.cos(h) * po;
      for (const e of [-1, 1]) { const ex = x - Math.sin(h) * e * this.hull.w, ez = z + Math.cos(h) * e * this.hull.w; if ((occAt(ex, ez) & (OCC_BUILD | OCC_WATER)) || waterAt(ex, ez) || Math.abs(ex) > MAP_HALF - 8 || Math.abs(ez) > MAP_HALF - 8) return false; }
      if (Math.abs(po) > TRAFFIC.side && MAP.sample(MAP.forest, x, z) > 2 * FIELD.forest) return false;   // (past the verge's 5 m, off the road: not into a thick forest, as fieldBlocked's soft)
    }
    return true;
  }
  /* the sharpest curvature (radians a metre) of its lane over the next BEND_LOOK metres */
  bend(k = this.laneK, from = 0) {
    let h = this.dirAt(this.s + from, k), m = 0;
    for (let d = from + 4; d <= BEND_LOOK; d += 4) { const g = this.dirAt(this.s + d, k); m = Math.max(m, Math.abs(angleWrap(g - h)) / 4); h = g; }
    return m;
  }
  /* the direction its aside is laid off in d m on (pose: pd where it is, eased onto the path's own over the first 6 m) */
  asideAt(d, h) { return this.pd == null ? h : this.pd + angleWrap(h - this.pd) * Math.min(1, Math.max(0, d) / 6); }
  dirAt(s, laneK = 0) { this.path.at(s - 3, laneK, _va); this.path.at(s + 3, laneK, _vb); return Math.atan2(_vb.z - _va.z, _vb.x - _va.x); }
  /* the lane factor towards tgt: its rate eased up and down (never a jump, never a sharp turn) */
  lane(dt, tgt, cap) {
    const f = clamp(this.v / 9, 0.3, 1), want = clamp((tgt - this.laneK) * 1.5, -cap * f, cap * f), a = WEAVE_ACC * f * f * dt;   // (slower: gentler, or it would turn on the spot)
    this.lv += clamp(want - this.lv, -a, a); this.laneK += this.lv * dt;
  }
  pose(dt, snap) {
    const P = this.path, weave = !snap && T < (this.weaveUntil || 0);
    if (snap) { this.laneK = 1; this.lv = 0; }
    else if (this.dead) this.lane(dt, this.laneT, 1);                       // (no hand on the wheel: towards a kerb)
    else if (weave) { const st = clamp((0.12 - this.bend(this.laneK, -8)) / 0.06, 0, 1); this.lane(dt, 1 + (this.laneT - 1) * st, WEAVE_RATE); }   // (swerving across the road; not round a sharp corner just behind or ahead: the lane's sideways turns fast there)
    else this.lane(dt, 1, 0.7);   // (back into its lane)
    if (snap) { this.po = this.pov = 0; }
    const hd = this.dirAt(this.s, this.laneK), ke = Math.min(1, dt / NOSE_EASE);
    if (snap || this.vE == null) { this.vE = this.v; this.pvE = this.pov; } else { this.vE += (this.v - this.vE) * ke; this.pvE += (this.pov - this.pvE) * ke; }   // (the speed and the rate aside go up and down by the step round what it goes round, and the nose swung with them: eased; the swerve, lv, is smooth already)
    const yt = snap ? hd : hd + Math.atan2(this.lv * P.wAt(this.s) + this.pvE, Math.max(this.vE, 2)) * clamp(this.vE / 2, 0.3, 1);   // (the nose along its own track: into the swerve, or aside; standing, it edges aside without swinging its nose)
    this.yaw = snap ? yt : approachAngle(this.yaw, yt, dt * (weave ? 2.5 : 1.8));
    P.at(this.s, this.laneK, _vc);
    this.pd = snap || this.pd == null ? hd : approachAngle(this.pd, hd, dt * Math.max(PD_RATE.min, PD_RATE.v / Math.max(0.1, Math.abs(this.po))));   // (where its path doubles back hd flips at once: the aside swings round at PD_RATE.v m/s, a wide one at PD_RATE.min rad/s)
    if (this.po) { const deck = _vc.y > groundH(_vc.x, _vc.z) + 0.3; _vc.x -= Math.sin(this.pd) * this.po; _vc.z += Math.cos(this.pd) * this.po; if (!deck) _vc.y = groundH(_vc.x, _vc.z); }
    this.obj.position.copy(_vc);
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw), f = groundH(_vc.x + c * 2.5, _vc.z + s * 2.5), b = groundH(_vc.x - c * 2.5, _vc.z - s * 2.5);
    const pitch = _vc.y > groundH(_vc.x, _vc.z) + 0.3 ? 0 : Math.atan2(f - b, 5);   // (on a bridge deck: level)
    this.obj.rotation.set(0, -this.yaw, pitch, 'YZX');
    if (this.dead) return;
    if (this.turret && this.tgt) this.turret.rotation.y = approachAngle(this.turret.rotation.y, this.yaw - Math.atan2(this.tgt.pos.z - _vc.z, this.tgt.pos.x - _vc.x), dt * 1.6);   // (onto its target)
    else if (this.turret && T < (this.tgtGoneT || -99) + TURRET_PICK.hold) { }   // (its target just gone: it holds there a while, not swung back and round again)
    else if (this.turret) this.turret.rotation.y = this.v > 1 ? this.turret.rotation.y * (1 - Math.min(1, dt)) : lerp(this.turret.rotation.y, Math.sin(T * 0.15 + this.ph) * 0.8, Math.min(1, dt));
    if (this.mg) this.aimMG(dt);
  }
  /* the roof machine gun: turned and raised at the aircraft while its crew fires up at it, else back level */
  aimMG(dt) {
    const m = this.mg; let yaw = 0, pitch = 0, k = dt * 1.2;
    if (T < this.aaUntil) { m.parent.updateWorldMatrix(true, false); m.parent.worldToLocal(_va.copy(camera.position)).sub(m.position); yaw = Math.atan2(-_va.z, _va.x); pitch = Math.atan2(_va.y, Math.hypot(_va.x, _va.z)); k = dt * 3.5; }
    this.mgOff = Math.abs(angleWrap(yaw - m.rotation.y)) + Math.abs(pitch - m.rotation.z);
    m.rotation.y = approachAngle(m.rotation.y, yaw, k); m.rotation.z += clamp(pitch - m.rotation.z, -k, k);
  }
  /* the muzzle of the roof machine gun in the world (out) */
  mgMuzzle(out) { const m = this.mg; m.updateWorldMatrix(true, false); return m.localToWorld(out.set(m.userData.muzzle, 0.008, 0)); }
  /* knocked out: a burning wreck where it stood */
  die() {
    this.gone(); blast(this.pos, 1.7); if (this.troops) BATTLE.bail(this); if (this.turret) this.turret.rotation.set(rand(-0.12, 0.12), rand(0, TAU), rand(-0.1, 0.1));
    this.dead = true; this.tgt = null; this.weaveUntil = 0; this.laneT = (Math.random() < 0.5 ? -1 : 1) * rand(1.2, 2.2);
    WRECKS.add(this.obj, 1.5, false, null, this.path && this.v > 0.5 ? this : null); BATTLE.cookOff(this);
  }
  /* a wreck still rolling: slower and slower along the road; false once it stands */
  coast(dt) {
    this.v = Math.max(0, this.v - (COAST[this.type] || 4) * dt); this.step(dt, Math.min(this.path.L, this.s + this.v * dt));
    if (this.s >= this.path.L) this.v = 0;
    return this.v > 0;
  }
  /* taken away (out of sight) */
  remove() { this.gone(); scene.remove(this.obj); }
  gone() { delist(this); untrack(this.obj); if (this.col) this.col.drop(this); }
}

/* ---- a column: vehicles on one path, the first leading, the rest keeping their gap ---- */
class Column {
  constructor(units) { this.u = units; this.alarm = 0; for (const v of units) v.col = this; }   // (alarm: under the gunship's fire until then: it drives on, faster)
  drop(v) { const i = this.u.indexOf(v); if (i >= 0) this.u.splice(i, 1); }
  get engaged() { return this.u.some(v => v.tgt && Math.hypot(v.tgt.pos.x - v.pos.x, v.tgt.pos.z - v.pos.z) < 75); }   // (halts only close in: it fires on the move from further out)
  /* onto a path from where the column is now: its head runs through the vehicles' own positions, so nobody jumps. If the way
     leads back, the rear vehicle leads (everyone turns round where he stands) */
  reroute(dest, tail) {
    const N = ROADNET, U = this.u, plan = v => { let k = N.nearest(v.pos.x, v.pos.z, 60); if (k < 0) k = N.nearest(v.pos.x, v.pos.z, 700); let n = k < 0 ? null : N.route(k, dest); while (n && n.length > 2 && Math.hypot(N.X[n[0]] - v.pos.x, N.Z[n[0]] - v.pos.z) < 9) n = n.slice(1); return n; };   // (no kink back to a node just behind; out in a field: the nearest road within 700 m)
    let nodes = plan(U[0]); if (!nodes) return false;
    const j = nodes[Math.min(nodes.length - 1, 3)], back = U.length > 1 && (N.X[j] - U[0].pos.x) * (U[0].pos.x - U[U.length - 1].pos.x) + (N.Z[j] - U[0].pos.z) * (U[0].pos.z - U[U.length - 1].pos.z) < 0;
    if (back) { nodes = plan(U[U.length - 1]); if (!nodes) return false; }
    const order = back ? U.slice() : U.slice().reverse();   // (rear to front on the new way)
    const head = order.map(v => ({ x: v.pos.x, z: v.pos.z, y: v.pos.y > groundH(v.pos.x, v.pos.z) + 0.3 ? v.pos.y : NaN, hw: 0 }));
    const lead = order[order.length - 1].pos;
    if (!(occAt(lead.x, lead.z) & OCC_ROAD) && Math.hypot(N.X[nodes[0]] - lead.x, N.Z[nodes[0]] - lead.z) > 15) {   // (off the road: back to it across the field, to the nearest node it can reach)
      const tried = [], cand = [nodes[0]]; N.near(lead.x, lead.z, 250, k => cand.push(k)); cand.sort((a, b) => Math.hypot(N.X[a] - lead.x, N.Z[a] - lead.z) - Math.hypot(N.X[b] - lead.x, N.Z[b] - lead.z));
      let f = null;
      for (const k of cand) {
        if (tried.length >= 6) break; if (N.BR[k] || tried.some(j => Math.hypot(N.X[j] - N.X[k], N.Z[j] - N.Z[k]) < 30)) continue; tried.push(k);
        const n = k === nodes[0] ? nodes : N.route(k, dest); if (!n) continue; f = fieldRoute(lead.x, lead.z, N.X[k], N.Z[k], 700); if (f) { nodes = n; break; }
      }
      if (!f) return false; head.push(...f.slice(1, -1));
    }
    this.lay(Path.fromNodes(nodes, head, tail), order); return true;
  }
  /* off the road along pts (fieldRoute from the leader's ahead() point), the others following through where they are; via: its
     way on to that point (no turning on the spot at speed) */
  goField(pts, via) {
    const order = this.u.slice().reverse(), head = order.map(v => ({ x: v.pos.x, z: v.pos.z, y: NaN, hw: 0 }));
    this.lay(new Path(head.concat(via || [], pts.slice(1)).filter((q, i, a) => !i || Math.hypot(q.x - a[i - 1].x, q.z - a[i - 1].z) > 0.3)), order);
  }
  /* each vehicle a column of its own (BATTLE wraps them): returns the new ones */
  split() { const out = this.u.slice(1).map(v => { const c = new Column([v]); c.path = this.path; c.alarm = this.alarm; return c; }); this.u.length = Math.min(1, this.u.length); return out; }
  /* onto a path whose head runs through the vehicles (order: rear to front) */
  lay(path, order) {
    let d = 0;
    order.forEach((v, i) => { if (i) d += Math.hypot(v.pos.x - order[i - 1].pos.x, v.pos.z - order[i - 1].pos.z); v.setPath(path, Math.min(d, path.L)); });
    const U = this.u;
    for (const v of U) {   // (the new way is smoothed: off where it stands by up to a metre; s and po take that up, po eases back: no jump)
      const h = v.dirAt(v.s, v.laneK); path.at(v.s, v.laneK, _va); const c = Math.cos(h), sn = Math.sin(h), dx = v.pos.x - _va.x, dz = v.pos.z - _va.z;
      v.s = clamp(v.s + dx * c + dz * sn, 0, path.L); const M = v.asideMax(true); v.po = clamp(-dx * sn + dz * c, -M, M); v.pov = 0; v.byp = null; v.blk = null; v.tk = 0;   // (what is in its way measured again at once, across the new way: the old one's lat set a way round a wreck to the wrong side, into it)
    }
    this.path = path; this.sort();
  }
  /* units ordered front first (largest s) */
  sort() { this.u.sort((a, b) => b.s - a.s); }
  place(path) { this.path = path; this.u.forEach((v, i) => v.setPath(path, Math.max(0, (this.u.length - 1 - i) * GAP), true)); }
  /* onto a new path that starts where the old one started (on the same way) or where it ended (turning round: s' = L - s,
     the order turns round and the lane swaps sides gently) */
  follow(path) {
    const o = this.path, q = path.p[0], back = Math.hypot(q.x - o.p[0].x, q.z - o.p[0].z) > Math.hypot(q.x - o.p[o.p.length - 1].x, q.z - o.p[o.p.length - 1].z);
    for (const v of this.u) { v.setPath(path, clamp(back ? o.L - v.s : v.s, 0, path.L)); if (back) { v.laneK = -v.laneK; v.lv = -v.lv; v.po = -v.po; v.pov = -v.pov; if (v.pvE != null) v.pvE = -v.pvE; v.byp = null; } }   // (the right of travel is the other side now: the lane and the aside keep where they are)
    this.path = path; this.sort();
  }
  get done() { return !this.u.length || (this.u[0].s >= this.path.L - 0.5 && this.u.every(v => v.v < 0.3)); }
  update(dt, go) {
    if (!this.u.length) return;
    if (go && this.u.some(v => v.unload > T)) go = false;   // (waits while an APC lets its infantry out)
    const vmax = Math.min(...this.u.map(v => v.vmax)) * (this.alarm > T ? 1.35 : 1), lead = this.u[0], P = this.path;
    // the leader: slower in bends (the heading change over the next 25 m) and braking to stop at the end
    let vt = 0;
    if (go) { const bend = Math.abs(angleWrap(lead.dirAt(lead.s + 25) - lead.dirAt(lead.s))); vt = Math.min(lerp(vmax, 4, clamp(bend / 1.2, 0, 1)), Math.sqrt(Math.max(0, 2 * 2.2 * (P.L - lead.s - 0.3)))); }
    lead.drive(dt, vt);
    for (let i = 1; i < this.u.length; i++) {
      const v = this.u[i], ahead = this.u[i - 1], err = (ahead.s - GAP) - v.s;
      v.drive(dt, go || err > 0.5 ? clamp(ahead.v + err * 0.6, 0, vmax * 1.25) : 0, ahead.s - GAP * 0.6, ahead.v);   // (never into the one ahead)
    }
  }
}

/* ---- a helicopter: sits on its pad, takes off, flies a round of waypoints, comes back and lands ---- */
const _hv = new V3();
/* helicopters in a fight: their rounds `r` m round the sensor's point; the target they go for (Heli.fightStep): within `near` m past the frame, up to `reach` m away, first */
const HELI_FIGHT = { r: [60, 180], near: 40, reach: 900 }, _hrU = { pos: new V3() };   // (_hrU: a waypoint tried by BATTLE.reach)
/* a helicopter in a fight flies one of two ways:
   fast (`fast` m/s), its nose where it goes: on its round, or in to a target it has picked (every `every` s; by the frame first,
   HELI_FIGHT), down to `low` + 10 m;
   slow (`slow` m/s: never hovering), within `ring[1]` + `brake` m of that target: round it `ring` m off, sliding sideways, its nose
   turned onto it (`yawRate` rad/s), for `hold` s; then away fast on its round.
   Either way its gun fires only within `cone` rad of its nose (BATTLE.heliTarget), its rockets only at what is within `line` rad dead
   ahead, `rk` m off (Heli.rockets: a salvo on the next beat, `reload` s for the next) */
const HELI_ATK = { fast: 34, slow: [8, 12], cone: 0.8, line: 0.14, rk: [70, 420], ring: [70, 130], brake: 80, hold: [10, 16], every: [6, 14], low: 35, yawRate: 0.8, course: 0.9, reload: [9, 15] };
class Heli {
  /* pad: where it lives (the allies'); without one it starts in the air at `start` and never lands (the enemies') */
  constructor(variant, side, pad, start) {
    this.side = side; this.pad = pad; this.obj = unitModel(side, 'heli', variant); scene.add(this.obj);
    this.rotors = []; this.obj.traverse(o => { if (o.name === 'rotor' || o.name === 'rotor2' || o.name === 'trotor') this.rotors.push(o); });
    this.pos = pad ? new V3(pad.x, pad.y, pad.z) : start.clone(); this.yaw = pad ? pad.a : Math.atan2(-start.z, -start.x); this.v = pad ? 0 : 30; this.bank = 0; this.spin = pad ? 0 : 26; this.state = pad ? 'pad' : 'fly'; this.timer = rand(15, 60);
    this.out = false;   // (crashed or flown away: its owner drops it)
    this.atk = null; this.atkNext = T + rand(3, 10); this.arm = null; this.rkT = T + rand(2, 6); this.rkLook = 0;   // (atk: the target it goes for, fightStep; arm: a salvo lined up, rockets)
    this.cv = this.yaw;   // (its course: where it flies; the nose (yaw) may point elsewhere when slow)
    enlist(this, side, 'heli', this.pos, 1.5); this.wps = pad ? [] : this.round();
    TRACKS.push({ obj: this.obj, side, inf: false, h: 2.5 });
    this.pose(0);
  }
  agl(x, z) { let h = groundH(x, z); const c = Math.cos(this.cv), s = Math.sin(this.cv);   /* (ahead along its course: sliding sideways, not where its nose points) */ for (const d of [40, 90]) h = Math.max(h, groundH(x + c * d, z + s * d)); return h; }
  update(dt) {
    const p = this.pos;
    if (this.state === 'crash') {                                      // shot down: spinning into the ground
      this.vy = Math.min(26, (this.vy || 0) + 9 * dt); p.y -= this.vy * dt; this.yaw += 2.6 * dt; this.spin = Math.max(6, this.spin - dt * 5); p.x += Math.cos(this.dir) * this.v * dt; p.z += Math.sin(this.dir) * this.v * dt;
      if ((this.puff = (this.puff || 0) - dt) <= 0) { this.puff = 0.05; FX.smoke.spawn(p, { s0: 3, s1: 9, life: rand(1.5, 2.5), a0: 0.5, color: 0x1c1a18, rise: 0.5, drag: 1 }); }
      if (p.y <= groundH(p.x, p.z) + 0.8) { p.y = groundH(p.x, p.z) + 0.3; this.obj.position.copy(p); this.obj.rotation.set(rand(-0.3, 0.3), -this.yaw, rand(-0.25, 0.25), 'YZX'); blast(p, 2.4); if (waterAt(p.x, p.z)) scene.remove(this.obj); else WRECKS.add(this.obj, 1.8); this.out = true; return; }
      this.pose(dt); return;
    }
    if (this.state === 'leave') {                                      // flying off the map: taken away once out of sight
      if (!this.wps.length) { const d = Math.hypot(p.x - CAM_TGT.x, p.z - CAM_TGT.z) || 1; this.wps = [[p.x + (p.x - CAM_TGT.x) / d * 3000, p.z + (p.z - CAM_TGT.z) / d * 3000]]; }
      if (!VIEW.onScreen(p, 0.3)) { BATTLE.seen('out', p); this.remove(); return; }
    }
    if (this.state === 'pad') { this.spin = Math.max(0, this.spin - dt * 4); if ((this.timer -= dt) <= 0) this.state = 'up'; }
    else if (this.state === 'up') {
      this.spin = Math.min(26, this.spin + dt * 6);
      if (this.spin > 20) p.y += Math.min(4, 1 + (p.y - this.pad.y)) * dt;
      if (p.y > this.pad.y + 30) { this.state = 'fly'; this.wps = this.round(); }
    } else if (this.state === 'fly' || this.state === 'home' || this.state === 'leave') {
      const R = this.state === 'fly' ? this.fightStep() : null;          // (a target to go for: [x, z, speed, height, slow])
      if (R && R[4]) this.slowStep(dt, R); else {
      const w = R || this.wps[0], dx = w[0] - p.x, dz = w[1] - p.z, d = Math.hypot(dx, dz);
      const last = this.state === 'home', vt = R ? R[2] : last ? Math.min(30, Math.max(2, d * 0.18)) : AUD.fighting ? HELI_ATK.fast : 30;
      const want = Math.atan2(dz, dx), tr = R ? 0.6 : 0.45, turn = clamp(angleWrap(want - this.yaw), -tr * dt, tr * dt); this.yaw += turn;
      this.cv = approachAngle(this.cv, this.yaw, HELI_ATK.course * dt);   // (fast: it flies where its nose is; out of a slow slide, eased onto it)
      this.v += clamp(vt * clamp(1.2 - Math.abs(angleWrap(want - this.yaw)), 0.3, 1) * clamp(Math.cos(this.cv - this.yaw), 0.3, 1) - this.v, -(R ? 8 : 4) * dt, (R ? 5 : 3) * dt);   // (out of a slow slide: up to speed only as its course comes round onto its nose)
      this.bankTo(turn / dt, dt);
      p.x += Math.cos(this.cv) * this.v * dt; p.z += Math.sin(this.cv) * this.v * dt;
      const yt = (last ? this.pad.y + 30 : this.agl(p.x, p.z) + (R ? R[3] : 60)); p.y += clamp(yt - p.y, -(R ? 8 : 4) * dt, 5 * dt);
      if (this.state === 'fly' && !this.pad && this.retreat) { this.state = 'leave'; this.wps = []; this.atk = this.arm = null; }
      else if (!R && this.state !== 'leave' && d < (last ? 3 : 60)) { this.wps.shift(); if (!this.wps.length) { if (last) this.state = 'down'; else if (!this.pad || AUD.combat) this.wps = this.round(); else { this.state = 'home'; this.wps = [[this.pad.x, this.pad.z]]; } } }
      }
      if (this.state === 'fly') this.rockets(dt);
    } else if (this.state === 'down') {
      this.v = Math.max(0, this.v - 4 * dt); this.bank *= 1 - Math.min(1, dt * 2); this.yaw = approachAngle(this.yaw, this.pad.a, dt * 0.4);
      p.x += (this.pad.x - p.x) * Math.min(1, dt); p.z += (this.pad.z - p.z) * Math.min(1, dt);
      p.y = Math.max(this.pad.y, p.y - Math.max(0.6, Math.min(3, (p.y - this.pad.y) * 0.25)) * dt);
      if (p.y <= this.pad.y + 0.01) { this.state = 'pad'; this.timer = rand(60, 150); }
    }
    if (this.state === 'pad' || this.state === 'down') this.bank *= 1 - Math.min(1, dt * 2);
    if (this.state === 'pad' || this.state === 'up' || this.state === 'down') this.cv = this.yaw;   // (its course with its nose: it takes off forward)
    if (this.state !== 'fly') this.arm = null;
    this.pose(dt);
  }
  /* in a fight, the target it goes for (HELI_ATK; every `every` s, none in a quiet part): the nearest of the other side on the ground by
     the frame within HELI_FIGHT.reach (the enemy's), else within 600 m. Fast in to it; once near, slow round it (slowStep) for `hold` s */
  fightStep() {
    const p = this.pos, H = HELI_ATK; let a = this.atk;
    if (!a) {
      if (!AUD.fighting || AUD.calm || this.retreat || T < this.atkNext) return null;
      this.atkNext = T + 3;   // (nothing to go for: looked for again in 3 s)
      const en = this.side === 'enemy', reach = u => !en || (_hrU.pos.set(u.pos.x, groundH(u.pos.x, u.pos.z) + H.low, u.pos.z), BATTLE.reach(_hrU));   // (the enemy's only where the sensor can bring it under the reticle as it circles there, as its rounds)
      let t = null, bd = en ? HELI_FIGHT.reach : 0; for (const u of UNITS) { if (u.side === this.side || u.kind === 'heli' || !u.alive || !VIEW.near(u.pos, HELI_FIGHT.near)) continue; const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z); if (d < bd && reach(u)) { bd = d; t = u; } }   // (what is in the frame first)
      if (!t) { bd = 600; for (const u of UNITS) { if (u.side === this.side || u.kind === 'heli' || !u.alive) continue; const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z); if (d < bd && reach(u)) { bd = d; t = u; } } }
      if (!t) return null;
      a = this.atk = { tgt: t, slow: false, until: 0, r: rand(...H.ring), dir: Math.random() < 0.5 ? 1 : -1, v: rand(...H.slow) }; BATTLE.stat.heliAtk = (BATTLE.stat.heliAtk || 0) + 1;
    }
    const t = a.tgt, o = this._r || (this._r = [0, 0, 0, 0, false]);
    if (a.slow && this.side === 'enemy' && !BATTLE.reach(this)) a.out = (a.out || 0) + 1; else a.out = 0;   // (circled out of what the sensor can bring under the reticle: off it, as its rounds keep within)
    if (this.retreat || !AUD.fighting || !t.alive || (a.slow && T > a.until) || a.out > 20) { this.endAtk(); return null; }
    if (!a.slow && Math.hypot(t.pos.x - p.x, t.pos.z - p.z) < a.r + H.brake) { a.slow = true; a.until = T + rand(...H.hold); }
    o[0] = t.pos.x; o[1] = t.pos.z; o[2] = a.slow ? a.v : H.fast; o[3] = a.slow ? H.low : H.low + 10; o[4] = a.slow; return o;
  }
  /* slow round its target: the course along the ring (`dir` the way round, in or out as it is off `r`), the nose onto the target */
  slowStep(dt, R) {
    const p = this.pos, a = this.atk, dx = R[0] - p.x, dz = R[1] - p.z, d = Math.hypot(dx, dz) || 1, to = Math.atan2(dz, dx);
    const course = to + a.dir * Math.PI / 2 * (1 - clamp((d - a.r) / a.r * 1.5, -0.8, 0.8));   // (too far: in towards it; too near: out)
    this.cv = approachAngle(this.cv, course, HELI_ATK.course * dt);
    const turn = clamp(angleWrap(to - this.yaw), -HELI_ATK.yawRate * dt, HELI_ATK.yawRate * dt); this.yaw += turn;
    this.v += clamp(R[2] - this.v, -8 * dt, 3 * dt);
    this.bankTo(turn / dt, dt);
    p.x = clamp(p.x + Math.cos(this.cv) * this.v * dt, -950, 950); p.z = clamp(p.z + Math.sin(this.cv) * this.v * dt, -950, 950);   // (on the map, as its rounds)
    p.y += clamp(this.agl(p.x, p.z) + R[3] - p.y, -6 * dt, 5 * dt);
    BATTLE.stat.heliSlow = (BATTLE.stat.heliSlow || 0) + dt;
  }
  /* banked into its turn and into a slide sideways (the course off the nose) */
  bankTo(rate, dt) { this.bank += (clamp(rate * 1.4 + Math.sin(this.cv - this.yaw) * this.v * 0.04, -0.45, 0.45) - this.bank) * Math.min(1, dt * 2); }
  endAtk() { this.atk = null; this.atkNext = T + rand(...HELI_ATK.every); this.wps = this.round(); }
  /* u within its rockets' reach; and still lined up on it (alive, dead ahead, in reach: BATTLE.salvo checks again) */
  inRk(u) { const d = Math.hypot(u.pos.x - this.pos.x, u.pos.z - this.pos.z); return d > HELI_ATK.rk[0] && d < HELI_ATK.rk[1]; }
  lined(u) { return u.alive && this.state === 'fly' && this.off(u) <= HELI_ATK.line * 1.5 && this.inRk(u); }
  /* the angle off its nose to u (rad) */
  off(u) { return Math.abs(angleWrap(Math.atan2(u.pos.z - this.pos.z, u.pos.x - this.pos.x) - this.yaw)); }
  /* its rockets: only at what is dead ahead (`line`) in reach (`rk`), its target first, else any of the other side on the ground; lined
     up, the salvo goes on the next beat (BATTLE.unitsOnBeat; 1.5 s without one: anyway), unless it has turned off it meanwhile */
  rockets(dt) {
    const H = HELI_ATK, A = this.arm, inR = u => this.inRk(u);
    if (!AUD.fighting || AUD.calm || this.retreat || T < this.rkT) { this.arm = null; return; }
    if (A) { if (!this.lined(A.tgt)) this.arm = null; else if (T - A.t > 1.5 && BATTLE.salvo(this, A.tgt)) BATTLE.stat.salvoLate++; return; }
    if ((this.rkLook -= dt) > 0) return; this.rkLook = 0.2;   // (looked for 5 times a second)
    const a = this.atk; let t = a && a.tgt.alive && this.off(a.tgt) < H.line && inR(a.tgt) ? a.tgt : null;
    if (!t) { let bo = H.line; for (const u of UNITS) { if (u.side === this.side || u.kind === 'heli' || !u.alive || !inR(u)) continue; const o = this.off(u); if (o < bo) { bo = o; t = u; } } }
    if (t) this.arm = { tgt: t, t: T };
  }
  die() { delist(this); untrack(this.obj); this.state = 'crash'; this.dir = this.cv; this.atk = this.arm = null; }
  remove() { delist(this); untrack(this.obj); scene.remove(this.obj); this.out = true; }
  /* a round: 3–4 districts or outposts, not too near the edge; in a fight: round the enemies' base */
  /* a round of waypoints: in a fight the enemy's fly two rounds in three over where the camera looks (HELI_FIGHT: through the frame;
     the allies' stay on their round over the base: firing 2.8 times as often, over the frame they cleared it of the enemy's armour and
     helicopters), else over the enemy's base; out of one, over the districts and the outposts */
  round() {
    const L = GUNSHIP.look, B = BATTLE.base;
    if (AUD.combat && this.side === 'enemy' && !BATTLE.slow() && ((this.rounds = (this.rounds || 0) + 1) % 3 || !B)) {   /* (very slow music fights group by group, with breaks once the frame is clear: not then) */ const out = [], u = _hrU;
      for (let i = randi(3, 4); i > 0; i--) for (let t = 0; t < 8; t++) {   /* (only where the sensor can bring it under the reticle: by the map's edge its line of sight runs past what the frame can be centred on, BATTLE.reach) */
        const a = rand(0, TAU), r = rand(...HELI_FIGHT.r) * (1 - t / 10), x = clamp(L.x + Math.cos(a) * r, -900, 900), z = clamp(L.z + Math.sin(a) * r, -900, 900);
        u.pos.set(x, groundH(x, z) + 60, z); if (BATTLE.reach(u) || t === 7) { out.push([x, z]); break; }
      }
      return out; }
    if (B && AUD.combat) { const out = []; for (let i = 0; i < 3; i++) { const a = rand(0, TAU), r = rand(20, 90); out.push([clamp(B.x + Math.cos(a) * r, -900, 900), clamp(B.z + Math.sin(a) * r, -900, 900)]); } return out; }
    const c = GUNSHIP.list.map(d => [d.x, d.z]).concat(LAYOUT.outposts.map(o => [o.x, o.z])), out = [];
    for (let i = 0; i < randi(3, 4); i++) { const q = pick(c); out.push([clamp(q[0] + rand(-120, 120), -850, 850), clamp(q[1] + rand(-120, 120), -850, 850)]); }
    return out;
  }
  pose(dt) {
    for (const r of this.rotors) { if (r.name === 'trotor') r.rotation.z += this.spin * 2.2 * dt; else r.rotation.y += (r.name === 'rotor2' ? -1 : 1) * this.spin * dt; }
    this.obj.position.copy(this.pos); this.obj.rotation.set(this.bank * 0.9, -this.yaw, -this.v * Math.cos(this.cv - this.yaw) / 30 * 0.12, 'YZX');   // (nose down as it flies forward: none sliding sideways)
  }
}

/* ---- an infantry squad: the leader walks a loop of waypoints, the others follow in file along the leader's trail ---- */
/* an allied squad closes in on what it shoots at to SQUAD_CLOSE m before it halts to fight */
const SQUAD_CLOSE = 35, SQUAD_ZONE = 100, SQUAD_IN = 15, SQUAD_NEAR = 220;
/* infantry keeps this far (m) from the other side's vehicles: not up against a tank (rifles do it no harm; their rockets, RPG, reach
   further); a squad closer than STANDOFF_IN of it backs off, a waypoint by one is passed over, an advance on one halts at it */
const STANDOFF = { tank: 45, apc: 32, car: 16 }, STANDOFF_IN = 0.85;
/* the other side's vehicle the nearest past its STANDOFF × k to (x, z), or null */
function armourNear(side, x, z, k) { let best = null, bm = 0; for (const u of UNITS) { const r = STANDOFF[u.kind]; if (!r || u.side === side || !u.alive) continue; const m = r * k - Math.hypot(u.pos.x - x, u.pos.z - z); if (m > bm) { bm = m; best = u; } } return best; }   // (they halt for a fight within SQUAD_ZONE m of where the sensor looks; one further off they shoot at on the move)
class Squad {
  constructor(side, n, x, z, wps) {
    this.side = side; this.wps = wps; this.wi = 0; this.wait = rand(2, 8); this.gap = 4; this.go = 0;   // (go: running out until then, not halting to fight)
    this.m = []; this.flee = false; for (let i = 0; i < n; i++) this.join(x, z);
    this.trail = [[x, z, 0]]; this.D = 0;
    for (const s of this.m) s.position.set(x, groundH(x, z), z);
  }
  join(x, z) { const s = INF.add(this.side, x, z); if (!s) return; enlist(s, this.side, 'inf', s.position, 1.1); s.at = Math.random() < RPG.share; s.rpgT = T + rand(...RPG.reload) * 0.5; /* (s.at: he carries a rocket launcher, BATTLE.rpg) */ s.die = () => { puffDust(s.position); this.lose(s); }; s.remove = () => this.lose(s); this.m.push(s); }
  /* one more, out of sight: where he would be in the file (not at the gate, walking straight to it through the wall), or, the squad
     gone, at the start of its loop */
  refill(x, z) {
    if (!this.m.length) { this.wi = 0; this.trail = [[x, z, this.D]]; this.join(x, z); return; }
    const [tx, tz] = this.trailAt(this.D - this.m.length * this.gap); this.join(tx, tz);
  }
  lose(s) { delist(s); INF.remove(s); const i = this.m.indexOf(s); if (i >= 0) this.m.splice(i, 1); }
  /* running from the camera's point, each for himself, round what is in the way; taken away once out of sight */
  run(dt) {
    for (const s of this.m.slice()) {
      const p = s.position, away = Math.atan2(p.z - CAM_TGT.z, p.x - CAM_TGT.x); this.mark(s);
      for (const da of [0, 0.6, -0.6, 1.2, -1.2, 1.9, -1.9]) { const a = away + da, x = p.x + Math.cos(a) * 3, z = p.z + Math.sin(a) * 3; if ((occAt(x, z) & (OCC_BUILD | OCC_WATER)) || waterAt(x, z)) continue; p.x += Math.cos(a) * 3.4 * dt; p.z += Math.sin(a) * 3.4 * dt; s.a = approachAngle(s.a, a, dt * 6); break; }
      p.y = groundH(p.x, p.z); this.legs(s, dt);
      if (!VIEW.onScreen(p, 0.2) || Math.abs(p.x) > MAP_HALF - 6 || Math.abs(p.z) > MAP_HALF - 6) { BATTLE.seen('out', p); this.lose(s); }
    }
  }
  /* the legs follow what he really walked this step (from mark() to now), not what a branch says: nobody slides. A jump (out of a
     door, a bail) is no step; quicker into a run */
  mark(s) { s.px = s.position.x; s.pz = s.position.z; }
  legs(s, dt) {
    const d = s.px === undefined ? 0 : Math.hypot(s.position.x - s.px, s.position.z - s.pz), mv = d < 3 ? d : 0; s.moved = mv;
    s.phase += mv * 3.4; s.stride += ((mv > 0.001 ? 1 : 0) - s.stride) * Math.min(1, dt * (mv > 2 * dt ? 12 : 5));
  }
  /* where the trail was at distance d (members walk it: never through a wall the leader went round) */
  trailAt(d) { const T_ = this.trail; let i = T_.length - 1; while (i > 0 && T_[i - 1][2] > d) i--; if (i === 0) return T_[0]; const a = T_[i - 1], b = T_[i], t = clamp((d - a[2]) / (b[2] - a[2] || 1), 0, 1); return [lerp(a[0], b[0], t), lerp(a[1], b[1], t)]; }
  update(dt) {
    const L = this.m[0]; if (!L) return;
    if (this.flee) { this.run(dt); return; }
    for (const s of this.m) this.mark(s);
    let step = 0, fight = T > this.go && this.m.some(s => s.tgt); const k = T < this.go ? (this.feed ? 3.3 : 2) : 1,   /* (feed: the allies' fireteams running into the frame, BATTLE.feed) */ gap = this.gap * (T < (this.spreadUntil || 0) ? 2 : 1);   // (under fire: twice as far apart)
    const run = s => s.scatter && T < s.scatter.until;   // (running from a hit: BATTLE.scatter)
    // the allies close in on what they shoot at (to SQUAD_CLOSE m, while the way is clear), firing as they go: into the fight the
    // sensor watches, not from out of its frame; themselves out of the picture within SQUAD_NEAR m of its centre, on into it (at
    // their target if it is in it, to SQUAD_IN m of it, else at the centre: they stood round its edge, shooting at its edge). Their
    // next loop then goes round where they got to
    let adv = null; const P0 = L.position;
    if ((this.offT = (this.offT || 0) - dt) <= 0) { this.offT = 0.3; this.off = armourNear(this.side, P0.x, P0.z, STANDOFF_IN); }   // (the other side's vehicle too close: STANDOFF)
    if (this.off && !run(L)) {   // back off from it, firing (round what is in the way)
      const o = this.off.pos, a0 = Math.atan2(P0.z - o.z, P0.x - o.x);
      for (const da of [0, 0.6, -0.6, 1.2, -1.2]) { const a = a0 + da, ux = Math.cos(a), uz = Math.sin(a); if (walkable(P0.x, P0.z, P0.x + ux * 3, P0.z + uz * 3)) { adv = [ux, uz]; break; } }
      if (adv) { fight = false; BATTLE.stat.backoff = (BATTLE.stat.backoff || 0) + 1; }
    }
    if (!adv && fight && this.side === 'ally' && !run(L)) {
      const tg = L.tgt || this.m.find(s => s.tgt).tgt, so = STANDOFF[tg.kind] || 0; let t = tg.pos; const lc = Math.hypot(P0.x - CAM_TGT.x, P0.z - CAM_TGT.z), out = lc < SQUAD_NEAR && !VIEW.onScreen(P0, -0.15);
      if (out && !BATTLE.inFrame(t)) t = CAM_TGT;
      const dx = t.x - P0.x, dz = t.z - P0.z, d = Math.hypot(dx, dz) || 1;
      const near = this.m.some(s => s.tgt && Math.hypot(s.tgt.pos.x - s.position.x, s.tgt.pos.z - s.position.z) < Math.max(SQUAD_CLOSE, (STANDOFF[s.tgt.kind] || 0) + 8)) && !(out && d > Math.max(SQUAD_IN, so + 8));   // (a vehicle: no closer than its STANDOFF)
      const nx = P0.x + dx / d * 3, nz = P0.z + dz / d * 3;
      if (!near && Math.hypot(t.x - CAM_TGT.x, t.z - CAM_TGT.z) > SQUAD_ZONE) fight = false;   // (a fight out of the sensor's frame: on round their loop, which goes round where it looks)
      else if (!near && walkable(P0.x, P0.z, nx, nz) && !armourNear(this.side, nx, nz, 1)) { adv = [dx / d, dz / d]; fight = false; }   // (not on into another vehicle's STANDOFF)
    }
    if (adv) { step = 1.5 * 1.6 * dt; L.position.x += adv[0] * step; L.position.z += adv[1] * step; L.a = approachAngle(L.a, Math.atan2(adv[1], adv[0]), dt * 6); this.moved = true; }
    else if (this.moved && !fight && !run(L)) {   // (got there: a loop round where it got to; the allies near the sensor's point round that, in the picture)
      this.moved = false; const P = L.position, on = this.side === 'ally' && Math.hypot(P.x - CAM_TGT.x, P.z - CAM_TGT.z) < SQUAD_NEAR && loopOn(patrolLoop(CAM_TGT.x, CAM_TGT.z, ...ALLY_LOOP, [P.x, P.z]));
      if (on) { this.wps = on; this.wi = 0; } else { this.wps = patrolLoop(P.x, P.z, 15, 40, [P.x, P.z]); this.wi = 1 % this.wps.length; } this.wait = rand(2, 5);   // (no loop round the point from here: one round where it got to, not standing for good)
    }
    else if (run(L)) {   // the leader runs too: the file's trail goes with him
      const S = L.scatter, dx = S.x - L.position.x, dz = S.z - L.position.z, d = Math.hypot(dx, dz);
      if (d > 0.3) { step = Math.min(d, SCATTER.v * dt); L.position.x += dx / d * step; L.position.z += dz / d * step; L.a = approachAngle(L.a, Math.atan2(dz, dx), dt * 8); }
    }
    else if (fight) { for (const s of this.m) if (s.tgt) s.a = approachAngle(s.a, Math.atan2(s.tgt.pos.z - s.position.z, s.tgt.pos.x - s.position.x), dt * 5); }   // (halted, facing what they shoot at)
    else if (L.scatter) {   // on from where he ran to, if the way to the next waypoint is clear; else back the way he ran first
      const S = L.scatter, [wx, wz] = this.wps[this.wi];
      if (walkable(L.position.x, L.position.z, wx, wz)) L.scatter = null;
      else { const dx = S.ox - L.position.x, dz = S.oz - L.position.z, d = Math.hypot(dx, dz); if (d > 0.3) { step = Math.min(d, 1.5 * k * dt); L.position.x += dx / d * step; L.position.z += dz / d * step; L.a = Math.atan2(dz, dx); } else L.scatter = null; }
    }
    else if (this.wait > 0) this.wait -= dt;
    else {
      const [wx, wz] = this.wps[this.wi], dx = wx - L.position.x, dz = wz - L.position.z, d = Math.hypot(dx, dz);
      if (d < 1 || (this.wps.length > 2 && armourNear(this.side, wx, wz, 1))) { this.wi = (this.wi + 1) % this.wps.length; this.wait = d < 1 ? rand(3, 10) : 0; }   // (one by the other side's vehicle: passed over, STANDOFF)
      else { step = Math.min(d, 1.5 * k * dt); L.position.x += dx / d * step; L.position.z += dz / d * step; L.a = Math.atan2(dz, dx); }
    }
    if (step > 0) { this.D += step; const last = this.trail[this.trail.length - 1]; if (this.D - last[2] > 0.5) { this.trail.push([L.position.x, L.position.z, this.D]); if (this.trail.length > 200) this.trail.shift(); } }
    this.m.forEach((s, i) => {
      if (i && run(s)) {   // off to his spot, running
        const S = s.scatter, dx = S.x - s.position.x, dz = S.z - s.position.z, d = Math.hypot(dx, dz), mv = Math.min(d, SCATTER.v * dt);
        if (d > 0.3) { s.position.x += dx / d * mv; s.position.z += dz / d * mv; s.a = approachAngle(s.a, Math.atan2(dz, dx), dt * 8); s.moved = mv; } else s.moved = 0;
      }
      else if (fight) s.moved = 0;
      else if (i && s.scatter) {   // back the way he ran (a walkable line), then into the file
        const S = s.scatter, dx = S.ox - s.position.x, dz = S.oz - s.position.z, d = Math.hypot(dx, dz), mv = Math.min(d, 1.9 * k * dt);
        if (d > 0.3) { s.position.x += dx / d * mv; s.position.z += dz / d * mv; s.a = approachAngle(s.a, Math.atan2(dz, dx), dt * 4); s.moved = mv; } else { s.scatter = null; s.moved = 0; }
      }
      else if (i) {   // in file, 4 m apart (out of a vehicle's door 2 m; twice that under fire), along the trail
        const [tx, tz] = this.trailAt(this.D - i * gap), dx = tx - s.position.x, dz = tz - s.position.z, d = Math.hypot(dx, dz);
        if (d > 0.05) { const mv = Math.min(d, 1.9 * k * dt); s.position.x += dx / d * mv; s.position.z += dz / d * mv; s.a = approachAngle(s.a, Math.atan2(dz, dx), dt * 4); s.moved = mv; } else s.moved = 0;
      } else s.moved = step;
      s.position.y = groundH(s.position.x, s.position.z); this.legs(s, dt);
    });
  }
}
/* can a soldier walk straight from a to b (no wall, building, water or outpost yard on the way)? */
function walkable(ax, az, bx, bz) {
  const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.8));   // (under a 2 m cell's width a step: a diagonal cannot cut a wall's corner; at least 1: a single point, a == b, is tested too)
  for (let i = 0; i <= n; i++) { const x = lerp(ax, bx, i / n), z = lerp(az, bz, i / n); if ((occAt(x, z) & (OCC_BUILD | OCC_WATER | OCC_YARD)) || waterAt(x, z) || Math.abs(x) > MAP_HALF - 40 || Math.abs(z) > MAP_HALF - 40) return false; }
  return true;
}
/* a loop of waypoints round a centre, each leg walkable */
function patrolLoop(cx, cz, r0, r1, start) {
  const out = [start]; let a0 = Math.atan2(start[1] - cz, start[0] - cx);
  for (let k = 1; k <= 6; k++) {
    for (let t = 0; t < 12; t++) {
      const a = a0 + k * TAU / 7 + rand(-0.2, 0.2), r = rand(r0, r1), p = [cx + Math.cos(a) * r, cz + Math.sin(a) * r], q = out[out.length - 1];
      if (walkable(q[0], q[1], p[0], p[1])) { out.push(p); break; }
    }
  }
  while (out.length > 2 && !walkable(out[out.length - 1][0], out[out.length - 1][1], start[0], start[1])) out.pop();
  return out.length > 2 ? out : [start, start];
}
/* a loop without the spot it starts from (the allies' round the sensor's point: not back out to where they came in from, every lap), its
   closing leg walkable as patrolLoop's are (it closed on the start); null when too little of it is left */
function loopOn(loop) { const o = loop.slice(1); while (o.length > 2 && !walkable(o[o.length - 1][0], o[o.length - 1][1], o[0][0], o[0][1])) o.pop(); return o.length > 2 ? o : null; }

/* ---- off the road: a way across the fields for a vehicle (A* on FIELD.cell m cells in a box round the two points). Never through a
   building, a yard, water, a forest (FIELD.forest: its trees stand that thick) or up a slope steeper than FIELD.slope, nor near the
   map's edge; roads are cheap (through a town it takes the streets), hedges, rail and sparse trees dear. Smoothed like the roads,
   every point checked again. [{ x, z, y: NaN, hw: 0 }] or null ---- */
const FIELD = { cell: 4, pad: 80, forest: 0.15, slope: 0.4, probe: 2.2, wide: 3.2, speed: 0.6, fail: { far: 0, end: 0, way: 0, smooth: 0 } };   // (fail: why none was found, for the tests)
function fieldBlocked(x, z, r = FIELD.probe, soft) {   // (r: the clearance round it; on a road the forest beside it does not count: the road is cut through it; soft: the forest only where it stands, thick)
  const road = occAt(x, z) & OCC_ROAD; if (road) r = Math.min(r, 1);   // (a street between houses: as narrow as the road is)
  if (soft && !road && MAP.sample(MAP.forest, x, z) > 2 * FIELD.forest) return true;
  for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
    const px = x + dx, pz = z + dz, w = waterAt(px, pz), o = occAt(px, pz);
    if ((o & (OCC_BUILD | OCC_WATER)) || (o & (OCC_YARD | OCC_ROAD)) === OCC_YARD || w === 1 || w === 2 ||   /* (a yard where the road runs through its edge: the road) */ Math.abs(px) > MAP_HALF - 30 || Math.abs(pz) > MAP_HALF - 30 || (!soft && !road && !(o & OCC_ROAD) && MAP.sample(MAP.forest, px, pz) > FIELD.forest)) return true;
  }
  return false;
}
function fieldRoute(ax, az, bx, bz, max = 500) {
  if (Math.hypot(bx - ax, bz - az) > max) { FIELD.fail.far++; return null; } if (fieldBlocked(bx, bz)) { FIELD.fail.end++; return null; }
  const G = FIELD.cell, x0 = Math.min(ax, bx) - FIELD.pad, z0 = Math.min(az, bz) - FIELD.pad, nx = Math.ceil((Math.max(ax, bx) + FIELD.pad - x0) / G) + 1, nz = Math.ceil((Math.max(az, bz) + FIELD.pad - z0) / G) + 1, N = nx * nz;
  const cc = new Float32Array(N).fill(-1), hh = new Float32Array(N).fill(NaN), g = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), done = new Uint8Array(N);
  const X = k => x0 + (k % nx) * G, Z = k => z0 + ((k / nx) | 0) * G, at = (x, z) => clamp(Math.round((z - z0) / G), 0, nz - 1) * nx + clamp(Math.round((x - x0) / G), 0, nx - 1);
  const cost = k => { if (cc[k] < 0) { const x = X(k), z = Z(k), o = occAt(x, z); cc[k] = fieldBlocked(x, z, FIELD.wide) ? Infinity : (o & OCC_ROAD ? 0.6 : 1) + MAP.sample(MAP.forest, x, z) * 30 + (o & OCC_HEDGE ? 6 : 0) + (o & OCC_RAIL ? 3 : 0); } return cc[k]; };
  const hgt = k => hh[k] === hh[k] ? hh[k] : (hh[k] = groundH(X(k), Z(k)));
  const s = at(ax, az), t = at(bx, bz), tx = t % nx, tz = (t / nx) | 0, H = k => Math.hypot(k % nx - tx, ((k / nx) | 0) - tz) * G;
  const hk = [], hv = [], push = (k, v) => { hk.push(k); hv.push(v); let i = hk.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (hv[p] <= hv[i]) break; [hk[p], hk[i]] = [hk[i], hk[p]]; [hv[p], hv[i]] = [hv[i], hv[p]]; i = p; } };
  const pop = () => { const k = hk[0], lk = hk.pop(), lv = hv.pop(); if (hk.length) { hk[0] = lk; hv[0] = lv; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < hk.length && hv[l] < hv[m]) m = l; if (r < hk.length && hv[r] < hv[m]) m = r; if (m === i) break; [hk[m], hk[i]] = [hk[i], hk[m]]; [hv[m], hv[i]] = [hv[i], hv[m]]; i = m; } } return k; };
  g[s] = 0; push(s, H(s));
  while (hk.length) {
    const k = pop(); if (done[k]) continue; done[k] = 1; if (k === t) break;
    const x = k % nx, z = (k / nx) | 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue; const ux = x + dx, uz = z + dz; if (ux < 0 || uz < 0 || ux >= nx || uz >= nz) continue;
      const n = uz * nx + ux; if (done[n]) continue;
      const c = cost(n); if (!(c < Infinity)) continue;
      const d = Math.hypot(dx, dz) * G, sl = Math.abs(hgt(n) - hgt(k)) / d; if (sl > FIELD.slope) continue;
      const v = g[k] + d * (c + sl * sl * 40); if (v < g[n]) { g[n] = v; from[n] = k; push(n, v + H(n)); }
    }
  }
  if (from[t] < 0) { FIELD.fail.way++; return null; }
  const raw = []; for (let k = t; k >= 0; k = from[k]) { raw.push([X(k), Z(k)]); if (k === s) break; }
  raw.reverse(); raw[0] = [ax, az]; raw[raw.length - 1] = [bx, bz];
  const free = (p, q) => { const n = Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / 2); let h0 = groundH(p[0], p[1]); for (let i = 1; i <= n; i++) { const x = lerp(p[0], q[0], i / n), z = lerp(p[1], q[1], i / n), h = groundH(x, z); if (fieldBlocked(x, z, FIELD.probe + 0.4) || Math.abs(h - h0) / (Math.hypot(q[0] - p[0], q[1] - p[1]) / n) > FIELD.slope) return false; h0 = h; } return true; };
  const pulled = [raw[0]]; for (let i = 0; i < raw.length - 1;) { let j = raw.length - 1; while (j > i + 1 && !free(raw[i], raw[j])) j--; pulled.push(raw[j]); i = j; }   // (the cells' staircase pulled straight wherever the line between is clear: a nose that swung at every step of it)
  for (const [line, tol, ch] of [[pulled, 0, 3], [pulled, 0, 2], [raw, 4, 2], [raw, 1.5, 2], [raw, 0.5, 1], [raw, 0, 1], [raw, 0, 0]]) {   // (the way is found with FIELD.wide clearance and checked with FIELD.probe: the smoothing's corners have room)
    const pts = resample(chaikin(rdp(line, tol), ch), 4);
    const okB = pts.every((p, i) => i === 0 || !fieldBlocked(p[0], p[1], FIELD.probe, true)), okS = pts.every((p, i) => !i || Math.abs(groundH(p[0], p[1]) - groundH(pts[i - 1][0], pts[i - 1][1])) / Math.max(0.5, Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1])) <= FIELD.slope + 0.1);
    if (okB && okS)
      return pts.map(p => ({ x: p[0], z: p[1], y: NaN, hw: 0 }));
  }
  FIELD.fail.smooth++; return null;
}

/* ---- the allies: a garrison per outpost. In a fight the columns drive to the enemies' base and the helicopters fly round it;
   afterwards they come home. Losses are replaced at the outpost, out of sight ---- */
const POST_TYPES = [['tank', 'apc'], ['apc', 'car', 'car'], ['tank', 'car']];
const ALLIES = {
  posts: [], helis: [], squads: [],
  init() {
    LAYOUT.outposts.forEach((o, k) => {
      const drive = [{ x: o.inner[0], z: o.inner[1], y: NaN, hw: 0 }, { x: o.gate[0], z: o.gate[1], y: NaN, hw: 0 }];
      const P = { o, k, col: null, drive, state: 'park', timer: k === 0 ? rand(4, 10) : rand(20, 70), refill: 0, heli: null, heliAt: 0, squad: null, gateNode: ROADNET.nearest(o.gate[0], o.gate[1], 20) };
      P.pad = { x: o.pad[0], z: o.pad[1], y: o.y + 0.25, a: o.a + (o.side > 0 ? Math.PI / 2 : -Math.PI / 2) };
      P.sq = [o.gate[0] + (o.gate[0] - o.x) * 0.25, o.gate[1] + (o.gate[1] - o.z) * 0.25];
      this.posts.push(P); this.garrison(P); this.fly(P);
      P.squad = new Squad('ally', 4, P.sq[0], P.sq[1], patrolLoop(o.x, o.z, 50, 110, P.sq)); this.squads.push(P.squad);
    });
  },
  garrison(P) { P.col = new Column(POST_TYPES[P.k % 3].map(t => new Vehicle(t, 'ally'))); P.col.place(new Path(P.drive)); P.full = P.col.u.length; P.state = 'park'; },
  fly(P) { P.flights = (P.flights || 0) + 1; P.heli = new Heli((P.k + P.flights - 1) % UNIT_TYPES.ally.heli.length, 'ally', P.pad); this.helis.push(P.heli); },   // (each sortie from a pad the next model: all of theirs show up, with two pads or three)
  /* a district to drive to: 350–1200 m off, reached along the roads */
  outbound(post) {
    const o = post.o, g = post.gateNode; if (g < 0) return null;
    for (let t = 0; t < 12; t++) {
      const d = pick(GUNSHIP.list), dist = Math.hypot(d.x - o.x, d.z - o.z); if (dist < 350 || dist > 1200) continue;
      const k = ROADNET.nearest(d.x, d.z, 160); if (k < 0) continue;
      const nodes = ROADNET.route(g, k); if (nodes && nodes.length > 20) return Path.fromNodes(nodes, post.drive);
    }
    return null;
  },
  seen(o) { _va.set(o.x, o.y, o.z); return VIEW.onScreen(_va, 0.6); },
  update(dt) {
    const war = AUD.combat && BATTLE.base;
    for (const P of this.posts) {
      const c = P.col, away = !this.seen(P.o);
      // losses: the column's (once what is left of it is home, or none is) and the helicopter's, replaced out of sight
      if (c.u.length < P.full && !P.refill) P.refill = T + rand(50, 100);
      if (P.refill && T > P.refill && away && !war && (P.state === 'park' || !c.u.length)) { for (const v of c.u.slice()) v.remove(); this.garrison(P); P.timer = rand(20, 60); P.refill = 0; }
      if (P.heli.out) { const i = this.helis.indexOf(P.heli); if (i >= 0) { this.helis.splice(i, 1); P.heliAt = T + rand(70, 130); } if (T > P.heliAt && away) this.fly(P); }
      if (P.squad.m.length < 4 && away && !war) P.squad.refill(P.sq[0], P.sq[1]);
      if (away && !war && P.state === 'park') for (const v of c.u) if (v.kind === 'apc' && !v.troops) v.troops = randi(4, 6);   // (its infantry back aboard at home)
      if (!c.u.length) continue;
      if (war && P.state !== 'sortie') { if (T > (P.retry || 0)) { if (c.reroute(BATTLE.base.node)) P.state = 'sortie'; else P.retry = T + 5; } }   // (no way there: tried again in 5 s, not every step)
      else if (!war && P.state === 'sortie') { if (P.gateNode >= 0 && c.reroute(P.gateNode, P.drive.slice().reverse())) P.state = 'back'; else { P.state = 'hold'; P.timer = 20; } }
      if (P.state === 'sortie') { c.update(dt, !c.engaged); continue; }
      if (P.state === 'park' || P.state === 'hold') {
        c.update(dt, false);
        if ((P.timer -= dt) <= 0) {
          if (P.state === 'park') { const p = this.outbound(P); if (p) { c.follow(p); P.state = 'out'; } else P.timer = 30; }
          else if (P.gateNode >= 0 && c.reroute(P.gateNode, P.drive.slice().reverse())) P.state = 'back'; else P.timer = 30;
        }
      } else {
        c.update(dt, true);
        if (c.done) { if (P.state === 'out') { P.state = 'hold'; P.timer = rand(15, 35); } else { P.state = 'park'; P.timer = rand(30, 90); } }
      }
    }
    for (const h of this.helis) { if (war && h.state === 'pad') h.timer = Math.min(h.timer, 8); h.update(dt); }
    for (const s of this.squads) s.update(dt);
  }
};
