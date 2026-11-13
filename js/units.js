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
function hurt(u, d) { if (!u.alive || d <= 0) return; u.hp -= d; if (u.hp <= 0) u.die(); else if (u.onHit) u.onHit(); }
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

/* ---- a path to drive: points { x, z, y (deck height on a bridge, else NaN: the ground), hw (half width: the lane) } ---- */
class Path {
  constructor(pts) {
    this.p = pts; this.S = [0];
    for (let i = 1; i < pts.length; i++) this.S.push(this.S[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
    this.L = this.S[this.S.length - 1];
  }
  static fromNodes(nodes, head, tail) {
    const N = ROADNET, pts = (head || []).slice();
    for (const k of nodes) pts.push({ x: N.X[k], z: N.Z[k], y: N.BR[k] ? N.Y[k] : NaN, hw: N.HW[k] });
    return new Path(pts.concat(tail || []).filter((q, i, a) => !i || Math.hypot(q.x - a[i - 1].x, q.z - a[i - 1].z) > 0.3));
  }
  reversed() { return new Path(this.p.slice().reverse()); }
  /* the point at distance s, laneK × the lane's offset to the right of the direction of travel */
  at(s, laneK, out) {
    s = clamp(s, 0, this.L); const S = this.S; let lo = 0, hi = S.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m] <= s) lo = m; else hi = m; }
    const a = this.p[lo], b = this.p[hi], L = S[hi] - S[lo] || 1, t = (s - S[lo]) / L, tx = (b.x - a.x) / L, tz = (b.z - a.z) / L;
    const hw = lerp(a.hw, b.hw, t), lane = hw > 2.5 ? Math.min(1.8, hw * 0.45) : 0;
    const x = lerp(a.x, b.x, t) - tz * lane * laneK, z = lerp(a.z, b.z, t) + tx * lane * laneK;
    const y = (a.y === a.y && b.y === b.y) ? lerp(a.y, b.y, t) : groundH(x, z);
    return out.set(x, y, z);
  }
}

/* ---- a ground vehicle on a path ---- */
const _va = new V3(), _vb = new V3(), _vc = new V3();
class Vehicle {
  constructor(type, side) {
    this.type = type; this.obj = unitModel(side, type); this.obj.scale.setScalar(ARMOR_SCALE); scene.add(this.obj);
    this.turret = this.obj.getObjectByName('turret'); this.ph = Math.random() * TAU;
    this.path = null; this.s = 0; this.v = 0; this.yaw = 0; this.laneK = 1; this.vmax = UNIT_SPEED[type]; this.col = null;
    enlist(this, side, type, this.obj.position, type === 'car' ? 1.3 : 1.9);
    TRACKS.push({ obj: this.obj, side, inf: false, h: type === 'car' ? 1.5 : 2.2 });
  }
  setPath(path, s, snap) { this.path = path; this.s = s; if (snap) { this.pose(0, true); } }
  /* towards the target speed (a gentle start, firmer brakes), then along the path */
  drive(dt, vt) {
    const turn = Math.abs(angleWrap(this.dirAt(this.s + 1) - this.yaw));
    if (turn > 0.6) vt = Math.min(vt, 1.2);                                  // (turning round first: slowly, nearly on the spot)
    this.v += clamp(vt - this.v, -5 * dt, 2.5 * dt); this.s = Math.min(this.path.L, this.s + this.v * dt);
    this.pose(dt, false);
  }
  dirAt(s) { this.path.at(s - 3, 0, _va); this.path.at(s + 3, 0, _vb); return Math.atan2(_vb.z - _va.z, _vb.x - _va.x); }
  pose(dt, snap) {
    const P = this.path; this.laneK += (1 - this.laneK) * (snap ? 1 : Math.min(1, dt * 0.6));
    const yt = this.dirAt(this.s); this.yaw = snap ? yt : approachAngle(this.yaw, yt, dt * 1.4);
    P.at(this.s, this.laneK, _vc); this.obj.position.copy(_vc);
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw), f = groundH(_vc.x + c * 2.5, _vc.z + s * 2.5), b = groundH(_vc.x - c * 2.5, _vc.z - s * 2.5);
    const pitch = _vc.y > groundH(_vc.x, _vc.z) + 0.3 ? 0 : Math.atan2(f - b, 5);   // (on a bridge deck: level)
    this.obj.rotation.set(0, -this.yaw, pitch, 'YZX');
    if (this.turret && this.tgt) this.turret.rotation.y = approachAngle(this.turret.rotation.y, this.yaw - Math.atan2(this.tgt.pos.z - _vc.z, this.tgt.pos.x - _vc.x), dt * 1.6);   // (onto its target)
    else if (this.turret) this.turret.rotation.y = this.v > 1 ? this.turret.rotation.y * (1 - Math.min(1, dt)) : lerp(this.turret.rotation.y, Math.sin(T * 0.15 + this.ph) * 0.8, Math.min(1, dt));
  }
  /* knocked out: a burning wreck where it stood */
  die() { this.gone(); blast(this.pos, 1.7); if (this.turret) this.turret.rotation.set(rand(-0.12, 0.12), rand(0, TAU), rand(-0.1, 0.1)); WRECKS.add(this.obj, 1.5); }
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
    for (const v of this.u) { v.setPath(path, clamp(back ? o.L - v.s : v.s, 0, path.L)); if (back) v.laneK = -v.laneK; }
    this.path = path; this.sort();
  }
  get done() { return !this.u.length || (this.u[0].s >= this.path.L - 0.5 && this.u.every(v => v.v < 0.3)); }
  update(dt, go) {
    if (!this.u.length) return;
    const vmax = Math.min(...this.u.map(v => v.vmax)) * (this.alarm > T ? 1.35 : 1), lead = this.u[0], P = this.path;
    // the leader: slower in bends (the heading change over the next 25 m) and braking to stop at the end
    let vt = 0;
    if (go) { const bend = Math.abs(angleWrap(lead.dirAt(lead.s + 25) - lead.dirAt(lead.s))); vt = Math.min(lerp(vmax, 4, clamp(bend / 1.2, 0, 1)), Math.sqrt(Math.max(0, 2 * 2.2 * (P.L - lead.s - 0.3)))); }
    lead.drive(dt, vt);
    for (let i = 1; i < this.u.length; i++) {
      const v = this.u[i], ahead = this.u[i - 1], err = (ahead.s - GAP) - v.s;
      v.drive(dt, go || err > 0.5 ? clamp(ahead.v + err * 0.6, 0, vmax * 1.25) : 0);
      if (v.s > ahead.s - GAP * 0.6) v.s = ahead.s - GAP * 0.6;          // (never into the one ahead)
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
      const w = this.wps[0], dx = w[0] - p.x, dz = w[1] - p.z, d = Math.hypot(dx, dz);
      const last = this.state === 'home', vt = last ? Math.min(30, Math.max(2, d * 0.18)) : this.tgt ? 8 : 30;   // (slow over what it is shooting at)
      const want = Math.atan2(dz, dx), turn = clamp(angleWrap(want - this.yaw), -0.45 * dt, 0.45 * dt); this.yaw += turn;
      this.v += clamp(vt * clamp(1.2 - Math.abs(angleWrap(want - this.yaw)), 0.3, 1) - this.v, -4 * dt, 3 * dt);
      this.bank += (clamp(turn / dt * 1.4, -0.45, 0.45) - this.bank) * Math.min(1, dt * 2);
      p.x += Math.cos(this.yaw) * this.v * dt; p.z += Math.sin(this.yaw) * this.v * dt;
      const yt = (last ? this.pad.y + 30 : this.agl(p.x, p.z) + 60); p.y += clamp(yt - p.y, -4 * dt, 5 * dt);
      if (this.state === 'fly' && !this.pad && this.retreat) { this.state = 'leave'; this.wps = []; }
      else if (this.state !== 'leave' && d < (last ? 3 : 60)) { this.wps.shift(); if (!this.wps.length) { if (last) this.state = 'down'; else if (!this.pad || AUD.combat) this.wps = this.round(); else { this.state = 'home'; this.wps = [[this.pad.x, this.pad.z]]; } } }
    } else if (this.state === 'down') {
      this.v = Math.max(0, this.v - 4 * dt); this.bank *= 1 - Math.min(1, dt * 2); this.yaw = approachAngle(this.yaw, this.pad.a, dt * 0.4);
      p.x += (this.pad.x - p.x) * Math.min(1, dt); p.z += (this.pad.z - p.z) * Math.min(1, dt);
      p.y = Math.max(this.pad.y, p.y - Math.max(0.6, Math.min(3, (p.y - this.pad.y) * 0.25)) * dt);
      if (p.y <= this.pad.y + 0.01) { this.state = 'pad'; this.timer = rand(60, 150); }
    }
    if (this.state === 'pad' || this.state === 'down') this.bank *= 1 - Math.min(1, dt * 2);
    this.pose(dt);
  }
  die() { delist(this); untrack(this.obj); this.state = 'crash'; this.dir = this.yaw; }
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
class Squad {
  constructor(side, n, x, z, wps) {
    this.side = side; this.wps = wps; this.wi = 0; this.wait = rand(2, 8);
    this.m = []; this.flee = false; for (let i = 0; i < n; i++) this.join(x, z);
    this.trail = [[x, z, 0]]; this.D = 0;
    for (const s of this.m) s.position.set(x, groundH(x, z), z);
  }
  join(x, z) { const s = INF.add(this.side, x, z); if (!s) return; enlist(s, this.side, 'inf', s.position, 1.1); s.die = () => { puffDust(s.position); this.lose(s); }; s.remove = () => this.lose(s); this.m.push(s); }
  lose(s) { delist(s); INF.remove(s); const i = this.m.indexOf(s); if (i >= 0) this.m.splice(i, 1); }
  /* running from the camera's point, each for himself, round what is in the way; taken away once out of sight */
  run(dt) {
    for (const s of this.m.slice()) {
      const p = s.position, away = Math.atan2(p.z - CAM_TGT.z, p.x - CAM_TGT.x);
      for (const da of [0, 0.6, -0.6, 1.2, -1.2, 1.9, -1.9]) { const a = away + da, x = p.x + Math.cos(a) * 3, z = p.z + Math.sin(a) * 3; if ((occAt(x, z) & (OCC_BUILD | OCC_WATER)) || waterAt(x, z)) continue; p.x += Math.cos(a) * 3.4 * dt; p.z += Math.sin(a) * 3.4 * dt; s.a = approachAngle(s.a, a, dt * 6); break; }
      p.y = groundH(p.x, p.z); s.phase += 3.4 * dt * 3.4; s.stride += (1 - s.stride) * Math.min(1, dt * 5);
      if (!VIEW.onScreen(p, 0.2) || Math.abs(p.x) > MAP_HALF - 6 || Math.abs(p.z) > MAP_HALF - 6) { BATTLE.seen('out', p); this.lose(s); }
    }
  }
  /* where the trail was at distance d (members walk it: never through a wall the leader went round) */
  trailAt(d) { const T_ = this.trail; let i = T_.length - 1; while (i > 0 && T_[i - 1][2] > d) i--; if (i === 0) return T_[0]; const a = T_[i - 1], b = T_[i], t = clamp((d - a[2]) / (b[2] - a[2] || 1), 0, 1); return [lerp(a[0], b[0], t), lerp(a[1], b[1], t)]; }
  update(dt) {
    const L = this.m[0]; if (!L) return;
    if (this.flee) { this.run(dt); return; }
    let step = 0; const fight = this.m.some(s => s.tgt);
    if (fight) { for (const s of this.m) if (s.tgt) s.a = approachAngle(s.a, Math.atan2(s.tgt.pos.z - s.position.z, s.tgt.pos.x - s.position.x), dt * 5); }   // (halted, facing what they shoot at)
    else if (this.wait > 0) this.wait -= dt;
    else {
      const [wx, wz] = this.wps[this.wi], dx = wx - L.position.x, dz = wz - L.position.z, d = Math.hypot(dx, dz);
      if (d < 1) { this.wi = (this.wi + 1) % this.wps.length; this.wait = rand(3, 10); }
      else { step = Math.min(d, 1.5 * dt); L.position.x += dx / d * step; L.position.z += dz / d * step; L.a = Math.atan2(dz, dx); }
    }
    if (step > 0) { this.D += step; const last = this.trail[this.trail.length - 1]; if (this.D - last[2] > 0.5) { this.trail.push([L.position.x, L.position.z, this.D]); if (this.trail.length > 200) this.trail.shift(); } }
    this.m.forEach((s, i) => {
      if (fight) s.moved = 0;
      else if (i) {   // in file, 4 m apart, along the trail
        const [tx, tz] = this.trailAt(this.D - i * 4), dx = tx - s.position.x, dz = tz - s.position.z, d = Math.hypot(dx, dz);
        if (d > 0.05) { const mv = Math.min(d, 1.9 * dt); s.position.x += dx / d * mv; s.position.z += dz / d * mv; s.a = approachAngle(s.a, Math.atan2(dz, dx), dt * 4); s.moved = mv; } else s.moved = 0;
      } else s.moved = step;
      s.position.y = groundH(s.position.x, s.position.z);
      s.phase += (s.moved || 0) * 3.4; s.stride += ((s.moved > 0.001 ? 1 : 0) - s.stride) * Math.min(1, dt * 5);
    });
  }
}
/* can a soldier walk straight from a to b (no wall, building, water or outpost yard on the way)? */
function walkable(ax, az, bx, bz) {
  const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 2));   // (at least 1: a single point, a == b, is tested too, not 0 / 0)
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
      if (P.squad.m.length < 4 && away && !war) P.squad.join(P.sq[0], P.sq[1]);
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
