'use strict';
/* ===== Units: the road graph, vehicles driving paths, columns, helicopters, infantry squads, and the allies' patrols =====
   The allies always exist: from each outpost a column drives out along the roads to a district and back, a helicopter takes off
   from the pad, flies a round of the map and lands, a fireteam walks a loop round the walls. Runtime choices use Math.random.   */
const UNIT_TYPES = {
  ally:  { tank: buildAbrams, apc: buildBradley, car: buildHumvee, heli: [buildAH64, buildUH60] },
  enemy: { tank: buildT90, apc: buildBTR, car: buildTechnical, heli: [buildMi24, buildKa52] }
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
   looking at that one (a narrow street between houses) */
const TRAFFIC = { look: 35, every: 0.15, gap: 2, brake: 4, side: 5, rate: 1.6, wait: 1.5, head: 4, ghost: 8 };
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
  setPath(path, s, snap) { this.path = path; this.s = s; if (snap) { this.pose(0, true); } }
  /* towards the target speed (a gentle start, firmer brakes), then along the path */
  drive(dt, vt, smax, va) {   // (smax: no further than this along the path, va: then no faster than this; it never goes back)
    const turn = Math.abs(angleWrap(this.dirAt(this.s + 1) - this.yaw));
    if (turn > 0.6) vt = Math.min(vt, 1.2);                                  // (turning round first: slowly, nearly on the spot)
    else vt = Math.min(vt, Math.max(3, Math.sqrt(BEND_ACC / Math.max(this.bend(), 1e-3))));
    vt = this.traffic(dt, vt);
    this.v += clamp(vt - this.v, -5 * dt, 2.5 * dt); let s = Math.min(this.path.L, this.s + this.v * dt);
    if (smax !== undefined && s > smax) { s = Math.max(this.s, smax); this.v = Math.min(this.v, va); }
    this.step(dt, s);
  }
  /* on to s; a move that would take its hull further into another's (a vehicle or a wreck) is not made: it stands */
  step(dt, s) {
    const s0 = this.s, po = this.po, k = this.laneK, lv = this.lv, yaw = this.yaw, x0 = this.pos.x, z0 = this.pos.z;
    this.s = s; this.pose(dt, false);
    if ((s !== s0 || this.po !== po) && this.bumps(x0, z0)) {
      const pn = this.po; this.s = s0; this.po = po; this.laneK = k; this.lv = lv; this.yaw = yaw; this.v = 0; this.pose(0, false); this.bumpT = T; this.bumpO = this._bo; BATTLE.stat.bump++;
      if (pn !== po) { this.po = pn; this.pose(0, false); if (this.bumps(x0, z0)) { this.po = po; this.pov = 0; this.yaw = yaw; this.pose(0, false); } }   // (only aside, then: away from what it touches; nose to nose they would stand for good)
      else this.pov = 0;
    }
  }
  bumps(x0, z0) {
    const H = this.hull, c = Math.cos(this.yaw), sn = Math.sin(this.yaw), A = { x: this.pos.x + c * H.c, z: this.pos.z + sn * H.c, c, s: sn, l: H.l, w: H.w };
    const test = (u, p) => {
      const h = u.hull, dx = p.x - this.pos.x, dz = p.z - this.pos.z; if (dx * dx + dz * dz > (H.l + h.l + 1) ** 2) return false;
      const oc = Math.cos(u.yaw), os = Math.sin(u.yaw), B = { x: p.x + oc * h.c, z: p.z + os * h.c, c: oc, s: os, l: h.l, w: h.w };
      return obbOverlap(A, B) && Math.hypot(B.x - A.x, B.z - A.z) < Math.hypot(B.x - x0 - c * H.c, B.z - z0 - sn * H.c) - 1e-4;   // (only a move that brings them closer)
    };
    for (const u of UNITS) if (u !== this && u instanceof Vehicle && !(this.ghosts && this.ghosts.has(u)) && test(u, u.pos)) { this._bo = u; return true; }
    for (const w of WRECKS.list) { const u = w.veh; if (u && u !== this && !(this.ghosts && this.ghosts.has(u)) && w.obj.parent === scene && w.obj.position.y > w.y0 - 2 && test(u, u.obj.position)) { this._bo = u; return true; } }
    return false;
  }
  /* what is in its way ahead (TRAFFIC): { o, al: metres ahead, lat: metres to its right, need: the sideways clearance, hl: its half
     length, still, head: oncoming } or null */
  blocker() {
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw), H = this.hull, x0 = this.pos.x + c * H.c, z0 = this.pos.z + s * H.c; let best = null;
    const look = (o, ox, oz, oyaw, h, still) => {
      const dx = ox - x0, dz = oz - z0, al = dx * c + dz * s; if (al <= 0 || al > TRAFFIC.look) return;
      const lat = -dx * s + dz * c, rel = Math.abs(angleWrap(oyaw - this.yaw)), need = H.w + (rel > 0.5 && rel < 2.6 ? h.l : h.w) + 0.5;   // (crossing: its length is across our way)
      if (Math.abs(lat) > need + 2.5 || (best && best.al < al)) return;
      best = { o, al, lat, need, hl: rel > 0.5 && rel < 2.6 ? h.w : h.l, still, opp: rel > 2.1, head: !still && rel > 2.1 };
    };
    for (const u of UNITS) { if (u === this || !(u instanceof Vehicle) || (u.col && u.col === this.col) || (this.ghosts && this.ghosts.has(u))) continue; const h = u.hull, a = u.yaw; look(u, u.pos.x + Math.cos(a) * h.c, u.pos.z + Math.sin(a) * h.c, a, h, u.v < 0.5); }
    for (const w of WRECKS.list) { const u = w.veh; if (!u || u === this || (this.ghosts && this.ghosts.has(u)) || w.obj.parent !== scene || w.obj.position.y < w.y0 - 2) continue; look(u, u.obj.position.x, u.obj.position.z, u.yaw, u.hull, !w.roll); }
    return best;
  }
  /* the target speed with what is ahead in mind; steers it aside (po) round what stands in its way or past one coming the other way */
  traffic(dt, vt) {
    if ((this.tk -= dt) <= 0) { this.tk = TRAFFIC.every; this.blk = this.blocker(); }
    const b = this.blk, H = this.hull, c = Math.cos(this.yaw), sn = Math.sin(this.yaw); let want = 0;
    if (this.byp) {   // driving round something: until it is behind
      const o = this.byp.o, op = o.obj.position;
      if ((op.x - this.pos.x) * c + (op.z - this.pos.z) * sn < -(H.l + o.hull.l + 1)) this.byp = null; else { want = this.byp.po; vt = Math.min(vt, 4); }
    }
    if (b) {
      const inWay = Math.abs(b.lat) < b.need, side = b.opp && Math.abs(b.lat) < 1.5 ? 1 : b.lat >= 0 ? -1 : 1, round = this.byp && this.byp.o === b.o;   // (side: aside away from it; nose to nose, both to their right: away from a lat of nearly nothing both went the same way)
      if (round) { this.byp.po = want = clamp(this.po + b.lat + this.byp.d * (b.need + 0.4), -TRAFFIC.side, TRAFFIC.side); }   // (round it: as far aside as it takes, measured again as it goes; a bend turns it)
      if (b.head) { want = this.po + side * Math.max(0, b.need + side * b.lat + 0.4) * 0.6; vt = Math.min(vt, TRAFFIC.head); }   // (both pull aside, each a share of it)
      else if (inWay && b.still && !round && this.path.L - this.s > b.al + 12) {   // (a new one in its way: round that one now)
        const mates = this.col && this.col.u.some(v => v.byp && v.byp.o === b.o);   // (a wreck, or the one ahead of it in the column already going round: at once)
        this.blkT = b.o.dead || mates ? TRAFFIC.wait : this.blkT + dt;
        if (this.blkT >= TRAFFIC.wait) for (const d of [side, -side]) {
          const raw = this.po + b.lat + d * (b.need + 0.4), po = clamp(raw, -TRAFFIC.side, TRAFFIC.side);   // (its lat then: need + 0.4 to that side; one facing it pulls out as well, not a wreck: half of it will do)
          if (Math.abs(raw) <= TRAFFIC.side + (b.opp && !b.o.dead ? b.need / 2 : 0.5) && this.clear(po, b.al + b.hl + 6)) { this.byp = { o: b.o, po, d }; want = po; BATTLE.stat.bypass++; break; }
        }
      }
      if (inWay) {
        const gap = H.l + b.hl + (round ? 0.8 : b.still ? TRAFFIC.gap + 8 : TRAFFIC.gap);   // (short of one standing: room to go round it)
        vt = Math.min(vt, b.al > gap + 1 && round ? Math.max(1.5, Math.sqrt(2 * TRAFFIC.brake * (b.al - gap))) : Math.sqrt(2 * TRAFFIC.brake * Math.max(0, b.al - gap)));   // (going round it: on at a crawl, steering out)
        if (vt < 0.5 || this.v < 0.3) { this.stuckT = (this.stuckT || 0) + dt; BATTLE.stat.yield += dt; } else this.stuckT = 0;
        if (this.stuckT > TRAFFIC.ghost && !VIEW.onScreen(this.pos, 0.5)) { (this.ghosts || (this.ghosts = new Set())).add(b.o); this.stuckT = 0; this.blk = null; BATTLE.stat.ghost++; }   // (no way past: it stops looking at that one)
      } else this.stuckT = 0;
    } else { this.blkT = 0; this.stuckT = 0; }
    if (!this.byp && !(b && b.head)) want = 0;
    want = clamp(want, -TRAFFIC.side, TRAFFIC.side);
    const r = Math.max(this.byp && this.v < 0.5 ? 0.5 : 0, Math.min(TRAFFIC.rate, this.v * 0.6) + (this.v > 0.3 ? 0.1 : 0)), pv = clamp(want - this.po, -r, r);   // (aside only as it rolls on: no crabbing; but going round one it stands nose to: slowly out, steering)
    this.pov += clamp(pv - this.pov, -2 * dt, 2 * dt); this.po += this.pov * dt;   // (its rate aside eased at 2 m/s per second: no jerk)
    if (this.ghosts && Math.random() < dt * 0.05) this.ghosts = null;
    return vt;
  }
  /* is the way `po` m aside clear of buildings and water for d m ahead (and on a bridge, does it stay on the deck)? */
  clear(po, d) {
    const P = this.path; if (this.pos.y > groundH(this.pos.x, this.pos.z) + 0.3) return Math.abs(po) < 0.8;
    for (let k = 0; k <= d; k += 3) {
      if (this.s + k > P.L) break; P.at(this.s + k, this.laneK, _va); const h = this.dirAt(this.s + k, this.laneK), x = _va.x - Math.sin(h) * po, z = _va.z + Math.cos(h) * po;
      for (const e of [-1, 1]) { const ex = x - Math.sin(h) * e * this.hull.w, ez = z + Math.cos(h) * e * this.hull.w; if ((occAt(ex, ez) & (OCC_BUILD | OCC_WATER)) || waterAt(ex, ez) || Math.abs(ex) > MAP_HALF - 8 || Math.abs(ez) > MAP_HALF - 8) return false; }
    }
    return true;
  }
  /* the sharpest curvature (radians a metre) of its lane over the next BEND_LOOK metres */
  bend() {
    let h = this.dirAt(this.s, this.laneK), m = 0;
    for (let d = 4; d <= BEND_LOOK; d += 4) { const g = this.dirAt(this.s + d, this.laneK); m = Math.max(m, Math.abs(angleWrap(g - h)) / 4); h = g; }
    return m;
  }
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
    else this.lane(dt, weave ? this.laneT : 1, weave ? WEAVE_RATE : 0.7);   // (swerving across the road, or back into its lane)
    if (snap) { this.po = this.pov = 0; }
    const hd = this.dirAt(this.s, this.laneK); let yt = hd; if (!snap) yt += Math.atan2(this.lv * P.wAt(this.s) + this.pov, Math.max(this.v, 2));   // (the nose along its own track: into the swerve, or aside)
    this.yaw = snap ? yt : approachAngle(this.yaw, yt, dt * (weave ? 2.5 : 1.8));
    P.at(this.s, this.laneK, _vc);
    if (this.po) { const deck = _vc.y > groundH(_vc.x, _vc.z) + 0.3; _vc.x -= Math.sin(hd) * this.po; _vc.z += Math.cos(hd) * this.po; if (!deck) _vc.y = groundH(_vc.x, _vc.z); }
    this.obj.position.copy(_vc);
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw), f = groundH(_vc.x + c * 2.5, _vc.z + s * 2.5), b = groundH(_vc.x - c * 2.5, _vc.z - s * 2.5);
    const pitch = _vc.y > groundH(_vc.x, _vc.z) + 0.3 ? 0 : Math.atan2(f - b, 5);   // (on a bridge deck: level)
    this.obj.rotation.set(0, -this.yaw, pitch, 'YZX');
    if (this.dead) return;
    if (this.turret && this.tgt) this.turret.rotation.y = approachAngle(this.turret.rotation.y, this.yaw - Math.atan2(this.tgt.pos.z - _vc.z, this.tgt.pos.x - _vc.x), dt * 1.6);   // (onto its target)
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
    const N = ROADNET, U = this.u, plan = v => { const k = N.nearest(v.pos.x, v.pos.z, 60); let n = k < 0 ? null : N.route(k, dest); while (n && n.length > 2 && Math.hypot(N.X[n[0]] - v.pos.x, N.Z[n[0]] - v.pos.z) < 9) n = n.slice(1); return n; };   // (no kink back to a node just behind)
    let nodes = plan(U[0]); if (!nodes) return false;
    const j = nodes[Math.min(nodes.length - 1, 3)], back = U.length > 1 && (N.X[j] - U[0].pos.x) * (U[0].pos.x - U[U.length - 1].pos.x) + (N.Z[j] - U[0].pos.z) * (U[0].pos.z - U[U.length - 1].pos.z) < 0;
    if (back) { nodes = plan(U[U.length - 1]); if (!nodes) return false; }
    const order = back ? U.slice() : U.slice().reverse();   // (rear to front on the new way)
    const head = order.map(v => ({ x: v.pos.x, z: v.pos.z, y: v.pos.y > groundH(v.pos.x, v.pos.z) + 0.3 ? v.pos.y : NaN, hw: 0 }));
    const path = Path.fromNodes(nodes, head, tail); let d = 0;
    order.forEach((v, i) => { if (i) d += Math.hypot(v.pos.x - order[i - 1].pos.x, v.pos.z - order[i - 1].pos.z); v.setPath(path, Math.min(d, path.L)); });
    this.path = path; this.sort(); return true;
  }
  /* units ordered front first (largest s) */
  sort() { this.u.sort((a, b) => b.s - a.s); }
  place(path) { this.path = path; this.u.forEach((v, i) => v.setPath(path, Math.max(0, (this.u.length - 1 - i) * GAP), true)); }
  /* onto a new path that starts where the old one started (on the same way) or where it ended (turning round: s' = L - s,
     the order turns round and the lane swaps sides gently) */
  follow(path) {
    const o = this.path, q = path.p[0], back = Math.hypot(q.x - o.p[0].x, q.z - o.p[0].z) > Math.hypot(q.x - o.p[o.p.length - 1].x, q.z - o.p[o.p.length - 1].z);
    for (const v of this.u) { v.setPath(path, clamp(back ? o.L - v.s : v.s, 0, path.L)); if (back) { v.laneK = -v.laneK; v.lv = -v.lv; } }
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
class Heli {
  /* pad: where it lives (the allies'); without one it starts in the air at `start` and never lands (the enemies') */
  constructor(variant, side, pad, start) {
    this.side = side; this.pad = pad; this.obj = unitModel(side, 'heli', variant); scene.add(this.obj);
    this.rotors = []; this.obj.traverse(o => { if (o.name === 'rotor' || o.name === 'rotor2' || o.name === 'trotor') this.rotors.push(o); });
    this.pos = pad ? new V3(pad.x, pad.y, pad.z) : start.clone(); this.yaw = pad ? pad.a : Math.atan2(-start.z, -start.x); this.v = pad ? 0 : 30; this.bank = 0; this.spin = pad ? 0 : 26; this.state = pad ? 'pad' : 'fly'; this.timer = rand(15, 60);
    this.out = false;   // (crashed or flown away: its owner drops it)
    this.run = null; this.runNext = T + rand(5, 20);   // (rocket runs: runStep)
    enlist(this, side, 'heli', this.pos, 1.5); this.wps = pad ? [] : this.round();
    TRACKS.push({ obj: this.obj, side, inf: false, h: 2.5 });
    this.pose(0);
  }
  agl(x, z) { let h = groundH(x, z); const c = Math.cos(this.yaw), s = Math.sin(this.yaw); for (const d of [40, 90]) h = Math.max(h, groundH(x + c * d, z + s * d)); return h; }
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
      const R = this.state === 'fly' ? this.runStep() : null;            // (a rocket run steers instead of the round: [x, z, speed, height])
      const w = R || this.wps[0], dx = w[0] - p.x, dz = w[1] - p.z, d = Math.hypot(dx, dz);
      const last = this.state === 'home', vt = R ? R[2] : last ? Math.min(30, Math.max(2, d * 0.18)) : this.tgt ? 8 : 30;   // (slow over what it is shooting at)
      const want = Math.atan2(dz, dx), tr = R ? 0.6 : 0.45, turn = clamp(angleWrap(want - this.yaw), -tr * dt, tr * dt); this.yaw += turn;
      this.v += clamp(vt * clamp(1.2 - Math.abs(angleWrap(want - this.yaw)), 0.3, 1) - this.v, -4 * dt, (R ? 7 : 3) * dt);
      this.bank += (clamp(turn / dt * 1.4, -0.45, 0.45) - this.bank) * Math.min(1, dt * 2);
      p.x += Math.cos(this.yaw) * this.v * dt; p.z += Math.sin(this.yaw) * this.v * dt;
      const yt = (last ? this.pad.y + 30 : this.agl(p.x, p.z) + (R ? R[3] : 60)); p.y += clamp(yt - p.y, -(R ? 8 : 4) * dt, 5 * dt);
      if (this.state === 'fly' && !this.pad && this.retreat) { this.state = 'leave'; this.wps = []; this.run = null; }
      else if (!R && this.state !== 'leave' && d < (last ? 3 : 60)) { this.wps.shift(); if (!this.wps.length) { if (last) this.state = 'down'; else if (!this.pad || AUD.combat) this.wps = this.round(); else { this.state = 'home'; this.wps = [[this.pad.x, this.pad.z]]; } } }
    } else if (this.state === 'down') {
      this.v = Math.max(0, this.v - 4 * dt); this.bank *= 1 - Math.min(1, dt * 2); this.yaw = approachAngle(this.yaw, this.pad.a, dt * 0.4);
      p.x += (this.pad.x - p.x) * Math.min(1, dt); p.z += (this.pad.z - p.z) * Math.min(1, dt);
      p.y = Math.max(this.pad.y, p.y - Math.max(0.6, Math.min(3, (p.y - this.pad.y) * 0.25)) * dt);
      if (p.y <= this.pad.y + 0.01) { this.state = 'pad'; this.timer = rand(60, 150); }
    }
    if (this.state === 'pad' || this.state === 'down') this.bank *= 1 - Math.min(1, dt * 2);
    this.pose(dt);
  }
  /* a rocket run in a fight: at the nearest enemy on the ground within 600 m (from farther out: one too near is first flown away
     from to 450 m), diving in fast and low; lined up within 240 m it fires a salvo on the next beat (BATTLE.unitsOnBeat; 1.5 s
     without one, or at 110 m: anyway), breaks away for 3 s and goes back to its round. Every 14–28 s; none in a quiet part */
  runStep() {
    const p = this.pos; let R = this.run;
    if (!R) {
      if (!AUD.fighting || AUD.calm || this.retreat || T < this.runNext) return null;
      this.runNext = T + 3;   // (nothing to run at: looked for again in 3 s)
      let t = null, bd = 600; for (const u of UNITS) { if (u.side === this.side || u.kind === 'heli' || !u.alive) continue; const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z); if (d < bd) { bd = d; t = u; } }
      if (!t) return null;
      R = this.run = { tgt: t, ph: 'in', armed: 0, until: 0, sx: 0, sz: 0 };
      if (bd < 320) { const k = 450 / Math.max(bd, 1); R.ph = 'setup'; R.sx = clamp(t.pos.x + (p.x - t.pos.x) * k, -900, 900); R.sz = clamp(t.pos.z + (p.z - t.pos.z) * k, -900, 900); }
    }
    const o = this._r || (this._r = [0, 0, 0, 0]), t = R.tgt;
    if (this.retreat || !AUD.fighting || (!t.alive && R.ph !== 'out')) { this.endRun(); return null; }
    if (R.ph === 'setup') { if (Math.hypot(R.sx - p.x, R.sz - p.z) < 60) R.ph = 'in'; o[0] = R.sx; o[1] = R.sz; o[2] = 36; o[3] = 60; return o; }
    if (R.ph === 'in') {
      const dx = t.pos.x - p.x, dz = t.pos.z - p.z, d = Math.hypot(dx, dz), lined = Math.abs(angleWrap(Math.atan2(dz, dx) - this.yaw)) < 0.25;
      if (!R.armed && lined && d < 240) R.armed = T;                     // (lined up: the salvo goes on the next beat)
      if (R.armed && (d < 110 || T - R.armed > 1.5)) { BATTLE.stat.salvoLate++; BATTLE.salvo(this, t); }
      else if (!R.armed && d < 90) { this.endRun(); return null; }       // (overshot without lining up)
      o[0] = t.pos.x; o[1] = t.pos.z; o[2] = 55; o[3] = 32; return o;
    }
    if (T > R.until) { this.endRun(); return null; }
    o[0] = p.x + Math.cos(this.yaw) * 300; o[1] = p.z + Math.sin(this.yaw) * 300; o[2] = 50; o[3] = 60; return o;   // (breaking away and climbing)
  }
  endRun() { this.run = null; this.runNext = T + rand(14, 28); this.wps = this.round(); }
  die() { delist(this); untrack(this.obj); this.state = 'crash'; this.dir = this.yaw; this.run = null; }
  remove() { delist(this); untrack(this.obj); scene.remove(this.obj); this.out = true; }
  /* a round: 3–4 districts or outposts, not too near the edge; in a fight: round the enemies' base */
  round() {
    const B = BATTLE.base; if (B && AUD.combat) { const out = []; for (let i = 0; i < 3; i++) { const a = rand(0, TAU), r = rand(20, 90); out.push([clamp(B.x + Math.cos(a) * r, -900, 900), clamp(B.z + Math.sin(a) * r, -900, 900)]); } return out; }
    const c = GUNSHIP.list.map(d => [d.x, d.z]).concat(LAYOUT.outposts.map(o => [o.x, o.z])), out = [];
    for (let i = 0; i < randi(3, 4); i++) { const q = pick(c); out.push([clamp(q[0] + rand(-120, 120), -850, 850), clamp(q[1] + rand(-120, 120), -850, 850)]); }
    return out;
  }
  pose(dt) {
    for (const r of this.rotors) { if (r.name === 'trotor') r.rotation.z += this.spin * 2.2 * dt; else r.rotation.y += (r.name === 'rotor2' ? -1 : 1) * this.spin * dt; }
    this.obj.position.copy(this.pos); this.obj.rotation.set(this.bank * 0.9, -this.yaw, -this.v / 30 * 0.12, 'YZX');
  }
}

/* ---- an infantry squad: the leader walks a loop of waypoints, the others follow in file along the leader's trail ---- */
/* an allied squad closes in on what it shoots at to SQUAD_CLOSE m before it halts to fight */
const SQUAD_CLOSE = 35, SQUAD_ZONE = 100;   // (they halt for a fight within SQUAD_ZONE m of where the sensor looks; one further off they shoot at on the move)
class Squad {
  constructor(side, n, x, z, wps) {
    this.side = side; this.wps = wps; this.wi = 0; this.wait = rand(2, 8); this.gap = 4; this.go = 0;   // (go: running out until then, not halting to fight)
    this.m = []; this.flee = false; for (let i = 0; i < n; i++) this.join(x, z);
    this.trail = [[x, z, 0]]; this.D = 0;
    for (const s of this.m) s.position.set(x, groundH(x, z), z);
  }
  join(x, z) { const s = INF.add(this.side, x, z); if (!s) return; enlist(s, this.side, 'inf', s.position, 1.1); s.die = () => { puffDust(s.position); this.lose(s); }; s.remove = () => this.lose(s); this.m.push(s); }
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
    let step = 0, fight = T > this.go && this.m.some(s => s.tgt); const k = T < this.go ? 2 : 1, gap = this.gap * (T < (this.spreadUntil || 0) ? 2 : 1);   // (under fire: twice as far apart)
    const run = s => s.scatter && T < s.scatter.until;   // (running from a hit: BATTLE.scatter)
    // the allies close in on what they shoot at (to SQUAD_CLOSE m, while the way is clear), firing as they go: into the fight the
    // sensor watches, not from out of its frame. Their next loop then goes round where they got to
    let adv = null;
    if (fight && this.side === 'ally' && !run(L) && !this.m.some(s => s.tgt && Math.hypot(s.tgt.pos.x - s.position.x, s.tgt.pos.z - s.position.z) < SQUAD_CLOSE)) {
      const t = (L.tgt || this.m.find(s => s.tgt).tgt).pos, dx = t.x - L.position.x, dz = t.z - L.position.z, d = Math.hypot(dx, dz);
      if (Math.hypot(t.x - CAM_TGT.x, t.z - CAM_TGT.z) > SQUAD_ZONE) fight = false;   // (a fight out of the sensor's frame: on round their loop, which goes round where it looks)
      else if (walkable(L.position.x, L.position.z, L.position.x + dx / d * 3, L.position.z + dz / d * 3)) { adv = [dx / d, dz / d]; fight = false; }
    }
    if (adv) { step = 1.5 * 1.6 * dt; L.position.x += adv[0] * step; L.position.z += adv[1] * step; L.a = approachAngle(L.a, Math.atan2(adv[1], adv[0]), dt * 6); this.moved = true; }
    else if (this.moved && !fight && !run(L)) { this.moved = false; this.wps = patrolLoop(L.position.x, L.position.z, 15, 40, [L.position.x, L.position.z]); this.wi = 1 % this.wps.length; this.wait = rand(2, 5); }
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
      if (d < 1) { this.wi = (this.wi + 1) % this.wps.length; this.wait = rand(3, 10); }
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
  fly(P) { P.heli = new Heli(P.k % 2, 'ally', P.pad); this.helis.push(P.heli); },
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
