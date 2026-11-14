'use strict';
/* ===== The fight: it starts when the music has armed it (js/audio.js) and ends when the music stops =====
   On arming an enemy base is built on one of the map's sites, out of sight, with a garrison; the camera goes to it, the
   allies' columns and helicopters too. While the fight lasts, enemy columns, squads and helicopters keep arriving (always out
   of sight). Both sides shoot at each other on timers; the gunship fires the selected weapon on the beat, only at what its
   table allows (WEAPONS.hits). Vehicles die into wrecks that cool and sink, soldiers into a puff of dust, base structures
   into rubble. When the music stops everybody holds fire; after the hold the enemies leave the frame and are taken away out of
   sight, the base too.                                                                                              */

/* ---- how each kind of unit shoots: range, reload, tracers per shot and their look, accuracy, damage, where the muzzle is, and the
   beat it fires on (reloaded, it waits for a beat of its band: rifles and technicals the hats, APCs and helicopters the snare, tanks
   the kick; after 1.2 s any beat will do, after 3 s with none it fires anyway) ---- */
const FIRE = {
  inf:  { range: 90,  reload: [1.5, 3.5], n: 1, v: 320, len: 2.2, w: 0.07, acc: 0.3,  dmg: 0.5, mh: 1.3, band: 'high' },
  car:  { range: 150, reload: [1.6, 3],   n: 3, v: 340, len: 3,   w: 0.1,  acc: 0.35, dmg: 0.6, mh: 2,   band: 'high' },
  apc:  { range: 180, reload: [2, 4],     n: 3, v: 380, len: 3.5, w: 0.14, acc: 0.4,  dmg: 1.4, mh: 2.6, band: 'mid', blast: 0.35 },
  tank: { range: 230, reload: [5, 8],     n: 1, v: 520, len: 5,   w: 0.3,  acc: 0.45, dmg: 7,   mh: 2.2, band: 'low', blast: 1.2, flash: 2.2 },
  heli: { range: 260, reload: [1.4, 2.8], n: 2, v: 260, len: 4,   w: 0.2,  acc: 0.4,  dmg: 2.5, mh: 0,   band: 'mid', blast: 0.8 }
};
const UNIT_BEAT_MAX = 24;   // unit shots on one beat at most (a volley)
/* ---- splash: the blast of a bomb, a rocket or a shell hurts every enemy round it, not only the kinds the weapon is aimed at (the
   table says what a weapon is fired at, not what its blast spares): the gunship's blast radii, metres ---- */
const SPLASH = { h105: 10, hf: 8, apk: 6, gbu: 14 };
/* a helicopter's rocket run: it dives in, and on a beat looses a salvo of unguided rockets that burst on and round the target */
const ROCKET = { n: 8, step: 0.07, v: 220, spread: 7, r: 6, dmg: 2.2, fx: 1.1, ally: 0.6, puff: 5 };   // (puff: metres between the trail's puffs)
/* the allies fire this many times as often (their helicopters most of all), each round doing less: their damage a second is only
   ALLY_DPS × the enemy's, so the fight looks busier without the allies clearing it before the gunship gets a word in */
const ALLY_RATE = { inf: 1.6, car: 1.6, apc: 1.6, tank: 1.3, heli: 2.8 }, ALLY_DPS = 1.2;
/* damage factor shooter → target (0: not a target for it) */
const VS = {
  inf:  { inf: 1,   car: 0.3, apc: 0,   tank: 0,    heli: 0.06, struct: 0 },
  car:  { inf: 1,   car: 1,   apc: 0.3, tank: 0,    heli: 0.6,  struct: 0 },
  apc:  { inf: 1,   car: 1.4, apc: 1,   tank: 0.25, heli: 1,    struct: 0.3 },
  tank: { inf: 0.3, car: 1,   apc: 1,   tank: 1,    heli: 0,    struct: 0.5 },
  heli: { inf: 1,   car: 1,   apc: 1,   tank: 0.8,  heli: 0.6,  struct: 0.6 }
};
/* ---- the gunship's weapons' ballistics: n rounds a trigger (step apart, spread in metres), damage and its radius, the blast's
   size, the tracer; missile: seconds of flight (it lands on the next beat once past halfway, or at its deadline) ---- */
/* rounds a trigger by the beat's strength (from a weak beat to the strongest), and the light guns that fire on any beat in dense music */
const BURST = { g25: [5, 14], b40: [2, 5], apk: [2, 6] }, LIGHT_ARMS = new Set(['g25', 'g30', 'b40']);
/* fast music: the light guns fire between the beats too, on a grid locked to the kick (subdivisions of a beat at a tempo 0..1 over it) */
const SUBDIV = { g25: [[0.2, 2], [0.6, 4]], g30: [[0.4, 2]], b40: [[0.4, 2]] };
const GUN = {
  g25:  { n: 8, step: 0.024, spread: 2.2, dmg: 0.34, r: 2.4, fx: 0.35, tw: 0.16, tl: 7, gap: 0.16 },
  g30:  { n: 1, step: 0,     spread: 1.6, dmg: 2.4,  r: 3.4, fx: 0.8,  tw: 0.28, tl: 8, gap: 0.34 },   // (single aimed rounds, three a second at most)
  b40:  { n: 4, step: 0.25,  spread: 3,   dmg: 2.2,  r: 4,   fx: 0.9,  tw: 0.3,  tl: 8, gap: 0.3 },
  h105: { n: 1, step: 0,     spread: 1.5, dmg: 17,   r: 10,  fx: 3,    tw: 0.7,  tl: 9, gap: 0.5 },
  hf:   { n: 1, step: 0,     spread: 0.5, dmg: 18,   r: 5,   fx: 2.2,  missile: 1.5, gap: 0.5 },
  apk:  { n: 4, step: 0.12,  spread: 6,   dmg: 5,    r: 5,   fx: 1.3,  missile: 1.0, gap: 0.5 },
  gbu:  { n: 1, step: 0,     spread: 1,   dmg: 22,   r: 12,  fx: 3.6,  missile: 2.2, gap: 0.5, bomb: true },
  aim:  { n: 1, step: 0,     spread: 0,   dmg: 8,    r: 7,   fx: 1.6,  missile: 1.3, gap: 0.5, air: true },
  las:  { dps: 7, gap: 0 },
  rail: { dmg: 30, r: 5, len: 64, gap: 0.5 }
};
/* what each weapon is best at (the auto-switching): 1 unless listed */
const PREF = {
  g25: { inf: 3, car: 1.5, apc: 0.3 }, g30: { inf: 1.5, car: 2.5, apc: 2, struct: 0.8 }, h105: { inf: 0.8, car: 1.5, apc: 2.5, tank: 4, struct: 2.5 },
  b40: { inf: 1.5, car: 2.5, apc: 2.2 }, hf: { car: 1.5, apc: 2.5, tank: 5, struct: 1.5 }, apk: { inf: 2, car: 2.5, apc: 2, struct: 1.5 },
  gbu: { inf: 0.8, car: 1.2, apc: 2, tank: 4, struct: 4 }, aim: { heli: 8 }, las: { inf: 1.5, car: 1.5, apc: 1.5, tank: 1.5, heli: 3 }, rail: { inf: 1.2, car: 1.5, apc: 2, tank: 3, heli: 2 }
};
/* armour against the light guns: a factor on their damage to a vehicle (a 25 mm burst stops a car, an APC takes a long hammering) */
const ARMOR = { g25: { car: 0.6, apc: 0.2 }, g30: { car: 0.8, apc: 0.4 } };
/* the missiles' and the bomb's bodies in flight, a scale on a 1.7 m missile (js/effects.js: missileFx) */
const MISSILE_S = { hf: 1, apk: 1.1, gbu: 1.2, aim: 1.6 };
const HEAVY_ARMS = new Set(['h105', 'hf', 'gbu', 'rail', 'apk']);
const QRF_TYPES = [['tank', 'apc'], ['apc', 'car'], ['tank', 'car', 'car'], ['apc', 'apc']];
const WAVES = [['car', 'car'], ['apc', 'car'], ['tank', 'apc'], ['tank', 'tank', 'apc'], ['car', 'apc', 'apc'], ['tank', 'car', 'car']];

/* ---- wrecks: burnt, smoking, cooling in four stages on the thermal sensor, then sinking into the ground (keep: base rubble stays
   until the base goes) ---- */
const _wk = new V3(), _wv = new V3();
const WRECKS = {
  list: [],
  add(obj, s, keep, pos) {
    toWreck(obj, 0); this.list.push({ obj, pos: pos || obj.position, t: 0, stage: 0, s, puff: 0, keep: !!keep, y0: obj.position.y });
    let n = 0; for (const w of this.list) if (!w.keep) n++;
    if (n > 22) { const o = this.list.find(w => !w.keep && w.t < 130); if (o) o.t = 130; }   // (too many: the oldest sinks now)
  },
  dropUnder(root) { this.list = this.list.filter(w => w.obj.parent !== root); },
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const w = this.list[i]; w.t += dt;
      const st = w.t < 25 ? 0 : w.t < 60 ? 1 : w.t < 100 ? 2 : 3; if (st !== w.stage) { w.stage = st; toWreck(w.obj, st); }
      if (w.t < 45 && (w.puff -= dt) <= 0) {
        w.puff = lerp(0.12, 0.7, w.t / 45); _wk.set(w.pos.x, w.pos.y + 1.4, w.pos.z);
        FX.smoke.spawn(_wk, { s0: 2 * w.s, s1: 7 * w.s, life: rand(2.5, 4.5), a0: 0.42 * (1 - w.t / 60), color: 0x1c1a18, v: _wv.set(WIND.x * 1.5 + rand(-0.5, 0.5), rand(2, 3.5), WIND.z * 1.5 + rand(-0.5, 0.5)), drag: 0.3 });
        if (w.t < 14) FX.fire.spawn(_wk, { s0: 1.8 * w.s, s1: 3.2 * w.s, life: 0.4, a0: 0.75, v: _wv.set(rand(-1, 1), 3, rand(-1, 1)) });
      }
      if (!w.keep && w.t > 130) { w.obj.position.y -= 0.35 * dt; if (w.obj.position.y < w.y0 - 4) { scene.remove(w.obj); this.list.splice(i, 1); } }
    }
  }
};
/* a soldier gone: dust */
function puffDust(p) { _wk.set(p.x, p.y + 0.8, p.z); for (let i = 0; i < 4; i++) FX.dust.spawn(_wk, { s0: 1.5, s1: rand(4, 6), life: rand(1, 1.8), a0: 0.55, color: ENV.dustTint.getHex(), v: _wv.set(rand(-2, 2), rand(0.5, 2), rand(-2, 2)), drag: 2 }); }
/* a hit of size s: a full blast from 1 up, else a light one (many a second); air: no ground, no crater */
function hitFx(x, y, z, s, air) {
  if (s >= 1 && !air) { blast(_wk.set(x, 0, z), s); return; }
  _wk.set(x, air ? y : groundH(x, z) + 0.3, z);
  FX.flash.spawn(_wk, { s0: s * 5, s1: s * 10, life: 0.14 });
  FX.fire.spawn(_wk, { s0: s * 2.5, s1: s * 5, life: 0.25, a0: 0.8 });
  for (let i = 0; i < (s >= 1 ? 4 : 1); i++) FX.smoke.spawn(_wk, { s0: s * 3, s1: s * 9, life: rand(1.2, 2.4), a0: 0.36, color: 0x2c2823, v: _wv.set(rand(-2, 2) * s, rand(1, 3), rand(-2, 2) * s), drag: 1.2 });
  if (air) return;
  FX.dust.spawn(_wk, { s0: s * 3, s1: s * 10, life: rand(0.9, 1.6), a0: 0.5, color: ENV.dustTint.getHex(), v: _wv.set(rand(-3, 3), rand(0.5, 2), rand(-3, 3)), drag: 2 });
  if (Math.random() < 0.25) FX.scorch.spawn(_wk, s * 2.2, 15);
}

/* ---- the enemies' base: structures on a site (local metres: +x along the road, z away from it), each a target ---- */
const BASE_MODELS = {
  pad(g) { box(g, 58, 0.1, 48, 0x5a5446, 0, 0.05, 0).castShadow = false; },
  hq(g) { box(g, 10, 3, 6, 0x6e6a5e, 0, 1.5, 0); box(g, 10.6, 0.3, 6.6, 0x4a4840, 0, 3.15, 0); box(g, 1.2, 2, 0.1, 0x2a2a28, 2, 1, -3.03); cyl(g, 0.05, 0.05, 4, 4, 0x333333, -4, 5.2, 2); box(g, 1.6, 1.2, 1, HOT(0x4a5040, 0.6), -6.2, 0.6, -1); },
  /* the damaged states of what takes several hits */
  hq2(g) { box(g, 5, 3, 6, 0x5e5a50, -2.5, 1.5, 0); box(g, 5.6, 0.3, 6.6, 0x3e3c36, -2.5, 3.15, 0); for (const z of [-2.85, 2.85]) box(g, 5, 1.1 + (z > 0 ? 0.7 : 0), 0.3, 0x4c4840, 2.5, 0.6 + (z > 0 ? 0.35 : 0), z); box(g, 0.3, 1.5, 6, 0x4c4840, 4.85, 0.75, 0); box(g, 4.6, 0.3, 5.6, 0x34322e, 2.3, 1.1, 0).rotation.z = -0.38; for (const [x, z, k] of [[1.2, 1.5, 1], [3.4, -1.2, 0.8], [5.8, 2.2, 0.7], [6.2, -2, 0.9]]) box(g, 1.2 * k, 0.6 * k, 0.9 * k, 0x3a3834, x, 0.3 * k, z).rotation.y = x; box(g, 1.6, 1.2, 1, HOT(0x4a5040, 0.6), -6.2, 0.6, -1); },
  tent2(g) { const h = new THREE.Group(); h.position.x = -2; g.add(h); box(h, 4, 1.6, 5, 0x55593f, 0, 0.8, 0); gable(h, 4, 5, 1.5, M(0x4c5038), 1.6); box(g, 4.4, 0.25, 5.3, 0x3c3e2e, 2.1, 0.2, 0).rotation.z = -0.06; box(g, 0.12, 1.3, 0.12, 0x2e2e28, 3.4, 0.6, 1.4).rotation.z = 0.7; box(g, 1.4, 0.5, 1, 0x34342c, 1.6, 0.4, -1.2); },
  bunker2(g) { for (const z of [-2.2, 2.2]) box(g, z < 0 ? 5.2 : 2.6, z < 0 ? 1.3 : 0.8, 0.9, 0x6a5e42, z < 0 ? 0 : -1.3, z < 0 ? 0.65 : 0.4, z); for (const x of [-2.2, 2.2]) box(g, 0.9, x < 0 ? 1.3 : 0.7, 3.6, 0x6a5e42, x, x < 0 ? 0.65 : 0.35, 0); const r = box(g, 5.6, 0.3, 5.6, 0x403c2e, 0.9, 1.1, 0.6); r.rotation.z = -0.36; r.rotation.x = 0.12; for (const [x, z] of [[3.4, 2.8], [2.6, 3.6], [3.8, 1.2]]) box(g, 0.9, 0.4, 0.6, 0x5a5038, x, 0.2, z).rotation.y = x; },
  aa(g) { cyl(g, 1.5, 1.7, 0.4, 8, 0x4a4c40, 0, 0.2, 0); box(g, 1.2, 0.9, 1.4, 0x3e4236, 0, 0.85, 0); for (const z of [-0.3, 0.3]) { const b = cyl(g, 0.07, 0.09, 3.2, 5, 0x2a2c28, 0.9, 2, z); b.rotation.z = -0.75; } box(g, 0.8, 0.5, 0.5, HOT(0x34362e, 0.5), -0.7, 0.9, 0); },
  tent(g) { box(g, 8, 1.6, 5, 0x55593f, 0, 0.8, 0); gable(g, 8, 5, 1.5, M(0x4c5038), 1.6); },
  fuel(g) { for (const z of [-1.7, 1.7]) { const c = cyl(g, 1.3, 1.3, 6, 10, 0x7c7e7a, 0, 1.7, z); c.rotation.z = Math.PI / 2; for (const x of [-2, 2]) box(g, 0.5, 0.8, 2.4, 0x4a4a46, x, 0.4, z); } },
  ammo(g) { for (const [x, y, z] of [[-1.4, 0.6, -0.9], [1.3, 0.6, -0.8], [-1.2, 0.6, 1], [1.4, 0.6, 0.9], [0, 1.8, 0]]) box(g, 2.4, 1.2, 1.6, 0x4e4a34, x, y, z); for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, 0.12, 2.9, 0.12, 0x3a3a32, sx * 3, 1.45, sz * 2.4); box(g, 6.4, 0.08, 5.2, 0x444a36, 0, 2.9, 0); },
  mast(g) { cyl(g, 0.1, 0.24, 14, 4, 0x5a5a58, 0, 7, 0); box(g, 1.8, 1.6, 1.6, 0x5a5e52, 1.4, 0.8, 0); for (let k = 0; k < 3; k++) { const a = k * TAU / 3; strut(g, new V3(0, 11, 0), new V3(Math.cos(a) * 5, 0, Math.sin(a) * 5), 0.03, 0x444444); } },
  truck(g) { box(g, 1.9, 1.9, 2.3, HOT(0x4c5238, 0.4), 2.5, 1.55, 0); box(g, 4.8, 0.3, 2.4, 0x3c3c34, -0.9, 0.95, 0); box(g, 4.5, 1.6, 2.3, 0x5a5c44, -1, 1.9, 0); for (const x of [2.4, -1.2, -2.5]) for (const s of [-1, 1]) wheel(g, x, 0.5, s * 1.05, 0.5, 0.35, 0x1c1c1c); },
  bunker(g) { for (const z of [-2.2, 2.2]) box(g, 5.2, 1.3, 0.9, 0x7a6c4c, 0, 0.65, z); for (const x of [-2.2, 2.2]) box(g, 0.9, 1.3, 3.6, 0x7a6c4c, x, 0.65, 0); for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, 0.2, 0.7, 0.2, 0x3a3a32, sx * 2.2, 1.65, sz * 2.2); box(g, 5.6, 0.3, 5.6, 0x56523e, 0, 2.1, 0); }
};
const STRUCT_HP = { hq: 60, tent: 20, fuel: 14, ammo: 14, mast: 10, truck: 14, bunker: 40, aa: 8 }, STRUCT_FLAT = { aa: 0.4, tent: 0.15, mast: 0.08, hq: 0.4, fuel: 0.3, ammo: 0.25, truck: 0.6, bunker: 0.5 };
const BASE_PLAN = [['hq', -16, 14, 0], ['mast', -25, 19, 0], ['tent', 2, 18, 0], ['tent', 12, 18, 0], ['tent', 22, 18, 0], ['fuel', 21, -3, Math.PI / 2], ['ammo', -21, -6, 0], ['ammo', -21, -14, 0], ['truck', -9, 3, 1.4], ['truck', 9, -1, 1.75], ['bunker', -9, -20, 0], ['bunker', 9, -20, 0], ['aa', -7, 22, 0], ['aa', 24, 8, 0]];
const BASE_LAMP = { hq: [5.9, 3.5], tent: [4.7, 3], fuel: [3.9, 0], ammo: [3.9, 3.1] };   // a lamp post beside each of these (x, z in the model's frame): js/lights.js
function baseModel(type) {
  const k = 'base_' + type;
  if (!PROTO[k]) { const g = new THREE.Group(), lp = BASE_LAMP[type.replace('2', '')]; BASE_MODELS[type](g); if (lp) { const q = new THREE.Group(); q.position.set(lp[0], 0, lp[1]); g.add(q); lampPost(q, 5, 0); } mergeStatic(g, []); PROTO[k] = g; }
  return PROTO[k].clone();
}

const RET_ON = 0.07;   // the reticle is "on" a target within this of the frame's centre (in half frame heights): no shot before that
const _bm = new V3(), _bla = new V3(), _bt = new V3(), _bd = new V3(), _bp = new V3(), _bx = new V3(1, 0, 0);
const BATTLE = {
  base: null, ruins: [], cols: [], squads: [], helis: [], focus: null, log: [], stat: { in: 0, out: 0, seenIn: 0, seenOut: 0, shots: 0, uShots: 0, uBeat: 0, uBand: 0, uLate: 0, volleys: 0, drops: 0, uDmg: 0, splash: 0, salvos: 0, salvoBeat: 0, salvoLate: 0, subShots: 0, subOff: 0, rush: 0, dismounts: 0, outOf: 0, bailed: 0, doorMax: 0 }, surgeUntil: 0, rockets: [], forceUntil: 0,
  pend: [], missiles: [], was: false, downT: -99, nextWave: 0, nextHeli: 0, nextSquad: 0, nextBase: 0, nextQrf: 0, nextAsq: 0, nextField: 0, nextHop: 0, spots: [], wantGo: null, waitT: 0, nextCall: 0, autoTick: 0, seekT: 0, fTick: 0, lastShot: -9, shotRT: -9, fedT: 0, rushT: 0, gridN: -1, manualUntil: 0, nextSwitch: 0, laserUntil: 0, lasTick: 0, beam: null, offT: 0,
  init() {
    const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0.5, 0, 0);
    this.beam = new THREE.Mesh(geo, sensorMat(new THREE.MeshBasicMaterial({ color: 0xff4a36, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }), 1));   // the laser: a red core
    this.beam.frustumCulled = false; this.beam.renderOrder = 8; this.beam.visible = false; scene.add(this.beam);
    this.beamGlow = new THREE.Mesh(geo, sensorMat(new THREE.MeshBasicMaterial({ color: 0xff1808, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }), 0.8));   // and a wide red haze round it
    this.beamGlow.frustumCulled = false; this.beamGlow.renderOrder = 8; this.beamGlow.visible = false; scene.add(this.beamGlow); this.lasHit = new V3();
    for (const side in UNIT_TYPES) for (const type in UNIT_TYPES[side]) { unitModel(side, type, 0); if (type === 'heli') unitModel(side, type, 1); }   // (every model built now, under the splash)
    for (const type in BASE_MODELS) baseModel(type);
  },
  after(d, fn) { this.pend.push({ t: T + d, fn }); },
  /* an enemy came (in) or was taken away (out) at p: counted, and whether that was in the frame (it never should be) */
  seen(kind, p) { this.stat[kind]++; if (VIEW.onScreen(p, 0)) this.stat[kind === 'in' ? 'seenIn' : 'seenOut']++; },
  inFrame(p) { const n = VIEW.ndc(p); return n.z < 1 && Math.abs(n.x) < 0.9 && Math.abs(n.y) < 0.85; },

  /* ---- the base ---- */
  pickSite() {
    const c = LAYOUT.sites.filter(s => (!this.base || this.base.site !== s) && !this.ruins.some(r => r.site === s) && !VIEW.onScreen(_bp.set(s.x, s.y, s.z), 0.9) && Math.hypot(s.x - CAM_TGT.x, s.z - CAM_TGT.z) > 300);
    const fresh = c.filter(s => !(T < s.restUntil)), old = c.filter(s => T > s.restUntil - 260);   // (a site wrecked 40 s ago will do when there is no other: a map may have only one)
    return fresh.length ? pick(fresh) : old.length ? pick(old) : null;
  },
  buildBase(site) {
    const root = new THREE.Group(); root.position.set(site.x, site.y, site.z); root.rotation.y = -site.a;
    const B = this.base = { site, x: site.x, z: site.z, y: site.y, root, parts: [], node: ROADNET.nearest(site.gate[0], site.gate[1], 20), built: T };
    root.add(baseModel('pad'));
    for (const [type, u, v, r] of BASE_PLAN) {
      const obj = baseModel(type); obj.position.set(u, 0.08, v * site.side); obj.rotation.y = r * site.side; root.add(obj);
      const [px, pz] = site.at(u, v), pos = new V3(px, site.y, pz), mark = { position: pos, visible: true };
      const s = enlist({ obj, type, mark }, 'enemy', 'struct', pos, 1.5); s.hp = STRUCT_HP[type];
      s.gone = () => { delist(s); untrack(mark); };
      s.remove = s.gone;
      s.onHit = () => {   // half gone: the damaged model
        if (s.hit || s.hp > STRUCT_HP[type] * 0.55 || !BASE_MODELS[type + '2']) return; s.hit = true;
        const o = baseModel(type + '2'); o.position.copy(s.obj.position); o.rotation.copy(s.obj.rotation); root.remove(s.obj); root.add(o); s.obj = o;
        for (let i = 0; i < 5; i++) FX.smoke.spawn(_wk.set(pos.x + rand(-2, 2), pos.y + 2, pos.z + rand(-2, 2)), { s0: 4, s1: 12, life: rand(2.5, 4), a0: 0.45, color: 0x2a2622, v: _wv.set(WIND.x + rand(-1, 1), rand(1.5, 3), WIND.z + rand(-1, 1)), drag: 0.5 });
      };
      s.die = () => {
        const obj = s.obj; s.gone(); blast(pos, type === 'fuel' ? 3 : 2);
        if (type === 'ammo' || type === 'fuel') for (let i = 0; i < 4; i++) this.after(rand(0.3, 2.2), () => hitFx(pos.x + rand(-4, 4), 0, pos.z + rand(-4, 4), rand(0.8, 1.6)));   // (it cooks off)
        obj.scale.y = STRUCT_FLAT[type]; WRECKS.add(obj, 1.7, true, pos);
      };
      TRACKS.push({ obj: mark, side: 'enemy', inf: false, h: 2 }); B.parts.push(s);
    }
    scene.add(root); this.seen('in', _bp.set(site.x, site.y, site.z));
    // the garrison: a tank and a technical on the drive, two squads walking round the wire
    const drive = [site.at(0, 6), site.gate].map(p => ({ x: p[0], z: p[1], y: NaN, hw: 0 })), col = new Column([new Vehicle('tank', 'enemy'), new Vehicle('car', 'enemy')]);
    col.place(new Path(drive)); this.cols.push({ col, hold: true, retreat: false });
    for (const st of [[site.gate[0] + (site.gate[0] - site.x) * 0.3, site.gate[1] + (site.gate[1] - site.z) * 0.3], site.at(44, 4)]) if (walkable(st[0], st[1], st[0], st[1])) this.squads.push(new Squad('enemy', 5, st[0], st[1], patrolLoop(site.x, site.z, 46, 85, st)));
    return B;
  },
  baseSeen(B) { for (const [u, v] of [[0, 0], [-34, -29], [34, -29], [34, 29], [-34, 29]]) { const p = B.site.at(u, v); if (VIEW.onScreen(_bp.set(p[0], B.y, p[1]), 0.25)) return true; } return false; },
  removeBase(B) {
    for (const s of B.parts) if (s.alive) s.gone();
    WRECKS.dropUnder(B.root); scene.remove(B.root); this.seen('out', _bp.set(B.x, B.y, B.z));
    if (this.base === B) this.base = null; else this.ruins.splice(this.ruins.indexOf(B), 1);
  },

  /* ---- arming and standing down ---- */
  start() {
    if (!this.base) { const s = this.pickSite(); if (s) this.buildBase(s); }
    if (this.base) GUNSHIP.goTo({ n: 'obj', x: this.base.x, z: this.base.z });
    this.nextWave = T + rand(3, 8); this.nextHeli = T + rand(25, 50); this.nextSquad = T + rand(8, 16); this.fedT = 0; this.seekT = T + 6; this.nextQrf = T + 3; this.nextAsq = T + 6; this.nextField = T + rand(6, 12); this.nextHop = T + rand(45, 65); this.spots = []; this.wantGo = null; this.waitT = 0;
  },
  standDown() {
    this.downT = T; this.focus = null;
    for (const E of this.cols) if (!E.retreat) this.retreatCol(E);
    for (const s of this.squads) { s.flee = true; for (const m of s.m) m.retreat = true; }
    for (const h of this.helis) h.retreat = true;
    if (CFG.transitMin > 0) GUNSHIP.nextTransit = Math.min(GUNSHIP.nextTransit, T + rand(12, 20));   // (the camera leaves; the base goes once out of sight)
  },
  /* a column drives off towards a road far from the camera */
  retreatCol(E) {
    E.retreat = true; E.hold = false; for (const v of E.col.u) { v.retreat = true; v.tgt = null; }
    if (!E.col.u.length) return;
    const N = ROADNET, c = []; for (let i = 0; i < 12; i++) { const k = randi(0, N.n - 1); c.push([k, Math.hypot(N.X[k] - CAM_TGT.x, N.Z[k] - CAM_TGT.z)]); }
    c.sort((a, b) => b[1] - a[1]); for (const [k] of c) if (E.col.reroute(k)) return;
  },

  /* ---- arrivals: always out of sight ---- */
  hidden(x, z, m) { return !VIEW.onScreen(_bp.set(x, groundH(x, z), z), m) && Math.hypot(x - CAM_TGT.x, z - CAM_TGT.z) > 300; },
  waves() {
    const k = CFG.enemies / 100; if (k <= 0 || GUNSHIP.state === 'transit') return;
    // nothing of the enemy's in the frame for 6 s: the next arrivals (and a new base, if there is none) are called now (at most every 12 s; the caps still hold)
    let seen = false; for (const u of UNITS) if (u.side === 'enemy' && u.kind !== 'struct' && this.inFrame(u.pos)) { seen = true; break; }
    if (seen || !this.fedT) this.fedT = T; else if (T - this.fedT > 6 && T > this.rushT) { this.rushT = T + 12; this.stat.rush++; this.nextWave = this.nextSquad = this.nextField = 0; this.nextBase = Math.min(this.nextBase, T + 2); }
    if (T > this.nextWave) { this.nextWave = T + rand(6, 12) / k; let n = 0; for (const E of this.cols) if (!E.retreat && !E.ally) n += E.col.u.length; if (n < Math.round(14 * k)) this.spawnColumn(); }
    if (T > this.nextSquad) { this.nextSquad = T + rand(10, 20) / k; if (this.base && this.squads.filter(s => !s.flee && s.side === 'enemy').length < Math.round(6 * k)) this.squadAt('enemy', this.base.x, this.base.z, 95, 170, 60, 150); }
    if (T > this.nextField) { this.nextField = T + rand(25, 45) / k; this.spots = this.spots.filter(s => this.hot(s, 200)); if (this.spots.length < 3) this.spawnField(); }
    if (T > this.nextHeli) { this.nextHeli = T + rand(40, 70) / k; if (this.helis.filter(h => h.alive && !h.retreat).length < Math.round(2 * k)) this.spawnHeli(); }   // (with a base or without, whatever the allies' share)
    // the allies' quick reaction force: a column from a road near the base and fireteams round it, so there are always some of them in the fight
    const B = this.base; if (!B) return;
    const ka = CFG.allies / 100; if (ka <= 0) return;   // (the allies' share: how many and how often)
    if (T > this.nextQrf) { this.nextQrf = T + rand(20, 35) / ka; let n = 0; for (const u of UNITS) if (u.side === 'ally' && u.col && Math.hypot(u.pos.x - B.x, u.pos.z - B.z) < 320) n++; if (n < Math.round(4 * ka)) this.columnTo('ally', B.node, pick(QRF_TYPES)); }
    if (T > this.nextAsq) { this.nextAsq = T + rand(15, 30) / ka; if (this.squads.filter(s => !s.flee && s.side === 'ally').length < Math.max(1, Math.round(2 * ka))) this.squadAt('ally', B.x, B.z, 95, 170, 60, 150); }
  },
  spawnColumn() {
    const N = ROADNET; let k = -1;
    for (let t = 0; t < 40 && k < 0; t++) { const c = randi(0, N.n - 1), x = N.X[c], z = N.Z[c]; if (!N.BR[c] && this.hidden(x, z, 0.8) && !UNITS.some(u => u.side === 'ally' && Math.hypot(u.pos.x - x, u.pos.z - z) < 160)) k = c; }
    if (k < 0) return;
    const opts = this.dests(); if (!opts.length) return;
    const dest = pick(opts), nodes = N.route(k, dest); if (!nodes || nodes.length < 30) return;
    const path = Path.fromNodes(nodes); if (!this.hidden(path.p[Math.min(path.p.length - 1, 14)].x, path.p[Math.min(path.p.length - 1, 14)].z, 0.8)) return;
    const col = new Column(pick(WAVES).map(t => new Vehicle(t, 'enemy'))); col.place(path);
    for (const v of col.u) this.seen('in', v.pos);
    this.cols.push({ col, hold: false, retreat: false });
    // the allies meet it: a column of theirs some 350 m down its road, driving towards it (the fight starts within seconds, wherever that is)
    if (!(nodes.length > 110 && this.allyRoom() && this.columnOn('ally', nodes.slice(50, 90).reverse(), pick(QRF_TYPES)))) this.columnTo('ally', dest, pick(QRF_TYPES));
  },
  /* a column of a side driving to a road node from 180–420 m away (out of sight, not next to the other side) */
  columnTo(side, node, types) {
    const N = ROADNET; if (node < 0) return false;
    if (side === 'ally' && !this.allyRoom()) return false;
    for (let t = 0; t < 80; t++) {
      const c = randi(0, N.n - 1), x = N.X[c], z = N.Z[c], d = Math.hypot(x - N.X[node], z - N.Z[node]);
      if (d < 180 || d > 420 || N.BR[c] || !this.hidden(x, z, 0.8) || UNITS.some(u => u.side !== side && Math.hypot(u.pos.x - x, u.pos.z - z) < 110)) continue;
      const nodes = N.route(c, node); if (!nodes || nodes.length < 30 || nodes.length > 220) continue;
      if (this.columnOn(side, nodes, types)) return true;
    }
    return false;
  },
  /* a column of a side placed at the start of a run of road nodes, if that is out of sight */
  columnOn(side, nodes, types) {
    const path = Path.fromNodes(nodes), q = path.p[Math.min(path.p.length - 1, 14)]; if (!this.hidden(path.p[0].x, path.p[0].z, 0.8) || !this.hidden(q.x, q.z, 0.8)) return false;
    const col = new Column(types.map(k => new Vehicle(k, side))); col.place(path);
    for (const v of col.u) this.seen('in', v.pos);
    this.cols.push({ col, hold: false, retreat: false, ally: side === 'ally' }); return true;
  },
  /* room for another of the allies' columns? At most seven: one standing idle out of sight is taken away to make room */
  allyRoom() {
    if (CFG.allies <= 0) return false;   // (no allied reinforcements at all)
    const mine = this.cols.filter(E => E.ally && !E.retreat && E.col.u.length); if (mine.length < 7) return true;   // (a column emptied this step is gone, not idle)
    const E = mine.find(E => E.col.done && !E.col.engaged && E.col.u.every(v => this.hidden(v.pos.x, v.pos.z, 0.5))); if (!E) return false;
    for (const v of E.col.u.slice()) { this.seen('out', v.pos); v.remove(); } return true;
  },
  /* an idle column's next errand: the allies' to the enemies nearest to where the camera looks, the enemies' to the base, an outpost or the camera's district */
  retask(E) {
    const N = ROADNET, c = E.col;
    if (E.ally) { let best = null, bd = 1e9; for (const u of UNITS) { if (u.side !== 'enemy' || u.kind === 'heli') continue; const d = Math.hypot(u.pos.x - GUNSHIP.look.x, u.pos.z - GUNSHIP.look.z); if (d < bd) { bd = d; best = u; } } if (best) c.reroute(N.nearest(best.pos.x, best.pos.z, 250)); return; }
    const opts = this.dests(); if (opts.length) c.reroute(pick(opts));
  },
  dests() {
    const opts = []; if (this.base && this.base.node >= 0) opts.push(this.base.node, this.base.node);
    for (const P of ALLIES.posts) if (P.gateNode >= 0) opts.push(P.gateNode);
    const h = ROADNET.nearest(GUNSHIP.home.x, GUNSHIP.home.z, 160); if (h >= 0) opts.push(h);
    return opts;
  },
  /* a squad of a side appearing r0–r1 from a point (out of sight) and walking a loop l0–l1 round it */
  squadAt(side, cx, cz, r0, r1, l0, l1) {
    for (let t = 0; t < 20; t++) {
      const a = rand(0, TAU), r = rand(r0, r1), x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (!this.hidden(x, z, 0.5) || !walkable(x, z, x, z)) continue;
      const loop = patrolLoop(cx, cz, l0, l1, [x, z]); if (loop.length < 3) continue;
      const s = new Squad(side, randi(4, 6), x, z, loop); this.squads.push(s); for (const m of s.m) this.seen('in', m.position); return;
    }
  },
  /* a fight out in the country, away from the base: enemies at a district (a squad or two, a column driving in) and allies coming for them */
  spawnField() {
    const B = this.base, c = GUNSHIP.list.filter(d => d.n !== 'outpost' && this.hidden(d.x, d.z, 0.9) && (!B || Math.hypot(d.x - B.x, d.z - B.z) > 350) && !this.spots.some(s => Math.hypot(d.x - s.x, d.z - s.z) < 300));
    if (!c.length) return;
    const d = pick(c), node = ROADNET.nearest(d.x, d.z, 160); this.spots.push({ x: d.x, z: d.z });
    this.squadAt('enemy', d.x, d.z, 10, 60, 25, 70); if (Math.random() < 0.6) this.squadAt('enemy', d.x, d.z, 10, 60, 25, 70);
    this.columnTo('enemy', node, pick(WAVES)); this.columnTo('ally', node, pick(QRF_TYPES));
    if (CFG.allies > 0) this.squadAt('ally', d.x, d.z, 70, 130, 50, 110);
  },
  /* are there allied vehicles within 200 m of p? */
  backed(p) { return UNITS.some(u => u.side === 'ally' && u.kind !== 'inf' && u.kind !== 'heli' && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < 200); },
  hot(p, r) { return UNITS.some(u => u.side === 'enemy' && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < r); },
  spawnHeli() {
    const a = rand(0, TAU), p = new V3(Math.cos(a) * 1500, 140, Math.sin(a) * 1500);
    const h = new Heli(randi(0, 1), 'enemy', null, p); this.helis.push(h); this.seen('in', p);
  },

  /* ---- units shooting at each other ---- */
  think(u, dt, fight) {
    const F = FIRE[u.kind]; if (!F) return;
    if (!fight || u.retreat || u.state === 'pad' || u.state === 'crash') { u.tgt = null; return; }
    if (u.tgt && !u.tgt.alive) u.tgt = null;
    if (u.troops && T > (u.dropT || 0)) this.dismount(u);
    if ((u.think -= dt) <= 0) { u.think = rand(0.7, 1.3); u.tgt = this.pickTarget(u, F); }
    if (u.tgt && (u.cool -= dt) <= 0) { if (!u.ready) u.ready = T; else if (T - u.ready > 3) { this.stat.uLate++; this.unitShot(u); } }   // (reloaded: it waits for a beat; with none, it fires anyway)
  },
  /* ---- an APC's infantry: halted near the enemy (or at its own base), it lets them out by the rear door one by one; they run
     out in file and spread round it. If it moves off first, the rest stay aboard for the next halt ---- */
  dismount(u) {
    if (u.v > 0.5 || u.col && u.col.alarm > T) return;
    const t = u.tgt, B = this.base;
    if (!(t && Math.hypot(t.pos.x - u.pos.x, t.pos.z - u.pos.z) < 200) && !(u.side === 'enemy' && B && Math.hypot(B.x - u.pos.x, B.z - u.pos.z) < 160)) return;
    u.dropT = T + 3;
    const c = Math.cos(u.yaw), sn = Math.sin(u.yaw), x = u.pos.x - c * 3.4, z = u.pos.z - sn * 3.4;
    if (u.pos.y > groundH(u.pos.x, u.pos.z) + 0.3 || !walkable(x, z, x - c * 4, z - sn * 4)) return;   // (not off a bridge, not into a wall)
    const loop = patrolLoop(u.pos.x, u.pos.z, 18, 40, [x, z]); if (loop.length < 3) return;
    const q = new Squad(u.side, 0, x, z, loop), n = u.troops; q.from = 'door'; q.wi = 1; q.wait = 0; q.gap = 2; q.go = T + n * 0.6 + 5;
    this.squads.push(q); this.stat.dismounts++; u.dropT = T + n * 0.6 + 8; u.unload = T + n * 0.6 + 0.4;
    const out = () => {   // one through the door, facing out
      if (!u.alive || u.v > 0.5 || !u.troops || q.flee || !this.squads.includes(q)) { u.unload = 0; return false; }
      const dx = u.pos.x - Math.cos(u.yaw) * 3.4, dz = u.pos.z - Math.sin(u.yaw) * 3.4; if (!walkable(dx, dz, dx, dz)) return false;   // (the door where it is now: it may have crept on)
      const k = q.m.length; q.join(dx, dz); if (q.m.length === k) return false;
      const s = q.m[k]; s.a = u.yaw + Math.PI; u.troops--; this.stat.outOf++;
      this.stat.doorMax = Math.max(this.stat.doorMax, Math.hypot(s.position.x - u.pos.x, s.position.z - u.pos.z)); return true;
    };
    if (!out()) { this.squads.splice(this.squads.indexOf(q), 1); return; }
    for (let i = 1; i < n; i++) this.after(i * 0.6, out);
  },
  /* knocked out with its infantry aboard: one to three of them bail out round the wreck and fight on */
  bail(u) {
    const n = Math.min(u.troops, randi(1, 3)), p = u.pos.clone(), side = u.side; u.troops = 0;
    if (!AUD.fighting) return;
    this.after(rand(0.5, 1), () => {
      for (let t = 0; t < 8; t++) {
        const a = rand(0, TAU), x = p.x + Math.cos(a) * 4.5, z = p.z + Math.sin(a) * 4.5; if (!walkable(x, z, x, z)) continue;
        const loop = patrolLoop(p.x, p.z, 15, 35, [x, z]); if (loop.length < 3) continue;
        const q = new Squad(side, n, x, z, loop); if (!q.m.length) return;
        q.from = 'bail'; q.wi = 1; q.wait = 0; q.go = T + 4; for (const s of q.m) { const jx = x + rand(-1.2, 1.2), jz = z + rand(-1.2, 1.2); if (walkable(jx, jz, jx, jz)) s.position.set(jx, groundH(jx, jz), jz); s.a = a; }
        this.squads.push(q); this.stat.bailed += q.m.length; return;
      }
    });
  },
  /* the pace of the units' fire: up to twice as often in dense music, half in a quiet part, twice more in a drop's surge; each round
     does that much less, so the damage a second (and how long a fight lasts) stays the same */
  pace() { let r = (0.75 + 1.25 * AUD.drive) * (1 + 0.4 * AUD.tempo); if (AUD.calm) r /= 1.5; if (T < this.surgeUntil) r *= 2; return r; },
  unitShot(u) {
    const F = FIRE[u.kind], r = this.pace(); u.ready = 0;
    u.cool = rand(F.reload[0], F.reload[1]) / (u.side === 'ally' ? ALLY_RATE[u.kind] : 1) / r; this.stat.uShots++;
    this.unitFire(u, u.tgt, F, r);
  },
  /* a beat: the units that have reloaded and whose band it is fire (any that waited 1.2 s too); a strong one (or a drop) is a volley of
     every unit in the frame that has reloaded */
  unitsOnBeat(band, st, volley) {
    const all = volley || st > 1.6; let n = 0;
    for (const h of UNITS) if (h.kind === 'heli' && h.run && h.run.ph === 'in' && h.run.armed && (band !== 'high' || st > 1.4)) { this.stat.salvoBeat++; this.salvo(h, h.run.tgt); }   // (a helicopter lined up on its run: the salvo on this beat)
    for (let i = 0; i < UNITS.length && n < UNIT_BEAT_MAX; i++) {
      const u = UNITS[i]; if (!u.ready || !u.tgt || !u.tgt.alive) continue;
      const mine = FIRE[u.kind].band === band;
      if (mine || T - u.ready > 1.2 || (all && this.inFrame(u.pos))) { this.stat.uBeat++; if (mine) this.stat.uBand++; this.unitShot(u); n++; }
    }
    if (all && n > 2) this.stat.volleys++;
  },
  pickTarget(u, F) {
    const V = VS[u.kind]; let best = null, bd = F.range;
    for (const o of UNITS) { if (o.side === u.side || !V[o.kind]) continue; const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z); if (d < bd) { bd = d; best = o; } }
    return best;
  },
  unitFire(u, t, F, pace) {
    _bm.set(u.pos.x, u.pos.y + F.mh, u.pos.z);
    const hit = Math.random() < F.acc, off = hit ? 0.5 : rand(3, 7), a = rand(0, TAU), air = t.kind === 'heli', x = t.pos.x + Math.cos(a) * off, z = t.pos.z + Math.sin(a) * off, y = air ? t.pos.y + rand(-3, 3) : groundH(x, z) + (hit ? t.ah * 0.6 : 0);
    _bd.set(x - _bm.x, y - _bm.y, z - _bm.z); const d = _bd.length() || 1, fl = d / F.v, col = u.side === 'ally' ? 0xffb060 : 0xa8ff8a;
    _bd.multiplyScalar(F.v / d);
    for (let i = 0; i < F.n; i++) { _bt.copy(_bd); if (i) { _bt.x += rand(-6, 6); _bt.y += rand(-4, 4); _bt.z += rand(-6, 6); _bt.multiplyScalar(1 - i * 0.07); } FX.tracers.spawn(_bm, _bt, { life: fl, len: F.len, w: F.w, color: col }); }
    if (F.flash) FX.flash.spawn(_bm, { s0: F.flash * 2, s1: F.flash * 4, life: 0.12 });
    const dmg = F.dmg * VS[u.kind][t.kind] * (u.side === 'ally' ? ALLY_DPS / ALLY_RATE[u.kind] : 1) / (pace || 1), side = u.side;
    this.after(fl, () => {
      if (F.blast) hitFx(x, y, z, F.blast, air);
      if (hit) { hurt(t, dmg); this.stat.uDmg += dmg; }
      if (F.blast >= 1 && Math.random() < 1 / (pace || 1)) for (let i = UNITS.length - 1; i >= 0; i--) { const o = UNITS[i]; if (o.kind === 'inf' && o.side !== side && Math.hypot(o.pos.x - x, o.pos.z - z) < 5) hurt(o, 1); }   // (at a faster pace, as deadly a second)
    });
  },

  /* ---- the gunship ---- */
  /* where the rounds come from: just under the lens (they fly away from the viewer and shrink onto the target) */
  muzzle(out, side) { this.barrel = !side && !!GUNS.muzzleAt(ARMS.cur, out, 45); if (this.barrel) return out; const e = camera.matrixWorld.elements; return out.copy(camera.position).addScaledVector(_bt.set(e[4], e[5], e[6]), -5.5).addScaledVector(_bt.set(e[0], e[1], e[2]), side || -1.5); },
  /* the target for a weapon: the one it is on while that is alive and in the frame, else the nearest to the frame's centre */
  target(w) {
    const f = this.focus; if (f && f.alive && w.hitSet.has(f.kind) && this.inFrame(f.pos)) return f;
    let best = null, bs = 1e9;
    for (const u of UNITS) { if (u.side !== 'enemy' || !w.hitSet.has(u.kind) || !this.inFrame(u.pos)) continue; const d = Math.hypot(u.pos.x - CAM_TGT.x, u.pos.z - CAM_TGT.z) * (u.kind === 'struct' ? 1.6 : 1); if (d < bs) { bs = d; best = u; } }
    if (best) { this.offT = 0; this.focus = best; } return best;
  },
  onBeat(band, st) {
    if (!ready || !AUD.fighting || paused) return;
    this.unitsOnBeat(band, st, false); AA.onBeat(band, st);
    for (const m of this.missiles) if (m.p > 0.55) m.rush = true;                     // what is in flight lands on this beat
    this.gunOnBeat(band, st, false);
  },
  /* the gunship on a beat: the selected weapon, if the beat suits it (force: a drop, at once) */
  gunOnBeat(band, st, force) {
    if (GUNSHIP.state !== 'orbit' || T < GUNSHIP.settled) return;                     // (flying to another place, or just arrived: the sensor is not on anything yet)
    const w = ARMS.w, f = CFG.fire / 100; if (!w || f <= 0) return;
    force = force || T < this.forceUntil;   // (a drop's shot waits up to 1.5 s for the reticle to come onto a target)
    if (w.band === 'hold') { const t = this.target(w); if (t && this.onReticle(t)) { this.laserUntil = T + (force ? 1.5 : 0.5); if (force) this.forceUntil = 0; } return; }
    const idle = T - this.lastShot, strong = st > 1.45 || (band === 'low' && AUD.heavy > 0.45);
    let ok = w.band === 'strong' ? (strong || (band === 'low' && idle > w.reload + 2.5)) : (w.band === band || idle > 1.4 / Math.min(2, f) || (LIGHT_ARMS.has(w.id) && AUD.drive > 0.6));   // (music with no such beats: any beat will do after a while; dense music: any beat for the light guns)
    if (AUD.calm && st <= 1.45) ok = false;                                            // (a quiet part: only the strong beats)
    if (!force && (!ok || idle < GUN[w.id].gap || (f < 1 && Math.random() > f))) return;
    const t = this.target(w); if (!t || !this.onReticle(t) || !ARMS.shoot()) return;   // (only at what the reticle is on)
    if (force) this.forceUntil = 0;
    this.lastShot = T; this.shotRT = RT(); this.stat.shots++; this.fire(w, t, st);
  },
  /* between the beats: on each point of the grid (the kick's beat split in 2 or 4 by the tempo) the light gun fires a short burst
     unless a shot went within most of a step before (no ammunition taken: the rate is the music's, the store cosmetic) */
  subBeat() {
    const w = ARMS.w, S = w && SUBDIV[w.id]; if (!S || !AUD.beatP || AUD.calm || !AUD.fighting) { this.gridN = -1; return; }
    let n = 1; for (const [t, k] of S) if (AUD.tempo > t) n = k; if (n < 2) { this.gridN = -1; return; }
    const q = AUD.beatP / n, now = RT(), g = Math.floor((now - AUD.kickT) / q); if (g === this.gridN || now - AUD.kickT > AUD.beatP * 2) return;
    const fresh = this.gridN < 0; this.gridN = g; if (fresh) return;   // (just back on the grid: wait for its next point, not fire off it)
    const f = CFG.fire / 100; if (GUNSHIP.state !== 'orbit' || T < GUNSHIP.settled || now - this.shotRT < q * 0.6 || !ARMS.ready(w) || (f < 1 && Math.random() > f)) return;
    const t = this.target(w); if (!t || !this.onReticle(t)) return;
    this.shotRT = now; this.stat.subShots++; this.stat.subOff = Math.max(this.stat.subOff, Math.abs((now - AUD.kickT) - g * q));
    this.fire(w, t, 1.15, 0.5);   // (half the damage: faster music, more fire, not a quicker fight)
  },
  /* a drop (js/audio.js): for 4 s everybody fires twice as often; a volley now, the AA and the flares, and the heaviest weapon there is */
  onDrop() {
    if (!ready || !AUD.fighting || paused) return;
    this.surgeUntil = T + 4; this.stat.drops++;
    for (const u of UNITS) if (u.tgt && !u.ready && u.cool > 0.6) u.cool = rand(0, 0.6);
    this.unitsOnBeat('low', 3, true);
    if (CFG.aa && GUNSHIP.state === 'orbit') { AA.burst(true); AA.drop(6); }
    if (CFG.autoArms && T >= this.manualUntil) {   // (a weapon picked by hand stays)
      let best = null, bs = 0;
      for (const w of ARMS.enabled()) {
        if (!HEAVY_ARMS.has(w.id) || !ARMS.ready(w)) continue;
        let s = 0; for (const u of UNITS) if (u.side === 'enemy' && w.hitSet.has(u.kind) && this.inFrame(u.pos)) s += (PREF[w.id] && PREF[w.id][u.kind]) || 1;
        if (s > bs) { bs = s; best = w; }
      }
      if (best && best.id !== ARMS.cur) { ARMS.select(best.id); this.focus = null; HUD.markArms(); this.nextSwitch = T + rand(7, 12); }
    }
    this.forceUntil = T + 1.5; this.gunOnBeat('low', 3, true);
  },
  /* is the target under the reticle (within 0.13 of the frame's height from the centre)? */
  onReticle(u) { return this.onAim(u) || this.offT > 5; },   // (or it could not be brought there for a while)
  /* is it where the sensor points? At the map's edge the frame stops short of the point it is turned to (clampFrame): then
     what counts is that point, wherever it shows in the frame (else a wide lens, the 105 mm's, may never fire there) */
  onAim(u) {
    const n = VIEW.ndc(u.pos), ax = n.x * camera.aspect, ay = n.y; if (Math.hypot(ax, ay) < RET_ON) return true;
    if (Math.hypot(GUNSHIP.look.x - CAM_TGT.x, GUNSHIP.look.z - CAM_TGT.z) < 0.5) return false;
    const m = VIEW.ndc(_bla.copy(GUNSHIP.look)); return Math.hypot(ax - m.x * camera.aspect, ay - m.y) < RET_ON;
  },
  /* the camera onto a unit: a little ahead of a moving one, so the slew's lag leaves the reticle on it */
  lookAt(u) {
    this.velOf(u, _bd); _bp.set(u.pos.x + _bd.x * (2 / SLEW_LOCK + 0.125), 0, u.pos.z + _bd.z * (2 / SLEW_LOCK + 0.125));
    const h = u.pos.y - groundH(u.pos.x, u.pos.z); if (h > 3) { _bd.subVectors(CAM_TGT, camera.position).normalize(); _bp.addScaledVector(_bd, -h / _bd.y); }   // (one in the air: the ground point behind it on the line of sight)
    GUNSHIP.track(_bp);
  },
  velOf(u, out) { const v = u.v || 0, a = u.yaw || 0; return u.kind === 'inf' ? out.set(0, 0, 0) : out.set(Math.cos(a) * v, 0, Math.sin(a) * v); },
  /* a trigger pull at t; the beat's strength st sets how many rounds (BURST) and how big the blasts look (not their damage) */
  fire(w, t, st, dk = 1) {
    const G = GUN[w.id]; GUNS.shot(w.id);
    if (w.id === 'rail') { this.rail(w, G, t); return; }
    const k = clamp(((st || 1.5) - 1) / 1.5, 0, 1), B = BURST[w.id], n = B ? Math.round(lerp(B[0], B[1], k)) : G.n, fx = G.fx * (0.85 + 0.35 * k), dmg = G.dmg * G.n / n * dk;   // (a trigger does the same damage, in more or fewer rounds)
    this.lastBurst = n;
    for (let i = 0; i < n; i++) this.after(i * G.step, () => {
      const a = rand(0, TAU), r = Math.sqrt(Math.random()) * G.spread, fl = G.missile || 0.28; this.velOf(t, _bd);
      const to = new V3(t.pos.x + _bd.x * (G.missile ? 0 : fl) + Math.cos(a) * r, 0, t.pos.z + _bd.z * (G.missile ? 0 : fl) + Math.sin(a) * r); to.y = G.air ? t.pos.y + t.ah : groundH(to.x, to.z);
      if (G.missile) { this.missiles.push({ w, G, tgt: G.spread < 2 ? t : null, from: this.muzzle(new V3(), rand(-1, 1) > 0 ? rand(8, 14) : rand(-14, -8)).addScaledVector(_bt.set(camera.matrixWorld.elements[4], camera.matrixWorld.elements[5], camera.matrixWorld.elements[6]), -3), to, p: 0, t: 0, dur: G.missile, rush: false, puff: 0, fx, dmg }); return; }
      this.muzzle(_bm); _bt.subVectors(to, _bm); const d = _bt.length();
      FX.tracers.spawn(_bm, _bt.multiplyScalar(1 / fl), { life: fl, len: G.tl, w: G.tw, color: 0xffc070 });
      if (this.barrel) FX.tracers.spawn(_bm, _bt, { life: 0.08, len: 45, w: G.tw * 2.5, color: 0xffd090 });   // (out of the barrel in the frame: a streak back to the muzzle for the first frames)
      this.after(fl, () => { hitFx(to.x, to.y, to.z, fx); this.strike(to, G.r, dmg, w, false); });
    });
  },
  flyMissiles(dt) {
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i], G = m.G; m.t += dt;
      if (m.tgt && m.tgt.alive) { m.to.copy(m.tgt.pos); m.to.y += G.air ? m.tgt.ah : 0; }
      if (m.t > m.dur * 1.5) m.rush = true;                                         // (no beat came: the deadline)
      m.p += dt / m.dur * (m.rush ? 6 : m.p < 0.8 ? 1 : 0.25);
      if (m.p >= 1) { this.missiles.splice(i, 1); hitFx(m.to.x, m.to.y, m.to.z, m.fx, G.air); this.strike(m.to, G.r, m.dmg, m.w, G.air); continue; }
      _bp.lerpVectors(m.from, m.to, m.p); missileFx(m, _bp, _bd.subVectors(m.to, m.from).normalize(), { s: MISSILE_S[m.w.id] || 1, motor: !G.bomb });
    }
  },
  /* the damage of a hit at p: every enemy the weapon is allowed to hit within r, falling off with the distance */
  strike(p, r, dmg, w, air) {
    const S = air ? 0 : SPLASH[w.id] || 0; r = Math.max(r, S);   // (a blast: every enemy on the ground within its radius, of any kind)
    for (let i = UNITS.length - 1; i >= 0; i--) {
      const u = UNITS[i], aimed = w.hitSet.has(u.kind); if (u.side !== 'enemy' || (!aimed && !S)) continue;
      const fly = u.kind === 'heli' && u.pos.y > groundH(u.pos.x, u.pos.z) + 8; if (fly !== !!air) continue;
      const d = Math.max(0, Math.hypot(u.pos.x - p.x, u.pos.z - p.z, air ? u.pos.y - p.y : 0) - (u.kind === 'struct' ? 3 : u.kind === 'inf' ? 0 : 1.5)); if (d >= (u.kind === 'struct' ? Math.min(r, 4) : r)) continue;   // (a structure: only what lands on it)
      if (aimed) this.note(w, u); else this.stat.splash++;   // (the weapon's log keeps to its table: what it was fired at)
      const A = ARMOR[w.id]; hurt(u, dmg * (1 - d / r) * (u.kind === 'inf' ? 3 : 1) * (A && A[u.kind] || 1));
    }
  },
  /* a blast at p of a unit's weapon (side: who fired): every unit of the other side on the ground within r */
  splashAt(p, r, dmg, side) {
    for (let i = UNITS.length - 1; i >= 0; i--) {
      const u = UNITS[i]; if (u.side === side || !u.alive || (u.kind === 'heli' && u.pos.y > groundH(u.pos.x, u.pos.z) + 8)) continue;
      const d = Math.max(0, Math.hypot(u.pos.x - p.x, u.pos.z - p.z) - (u.kind === 'struct' ? 3 : u.kind === 'inf' ? 0 : 1.5)); if (d >= (u.kind === 'struct' ? Math.min(r, 4) : r)) continue;
      if (u.col) u.col.alarm = T + 20; this.stat.splash++; hurt(u, dmg * (1 - d / r) * (u.kind === 'inf' ? 3 : 1));
    }
  },
  /* a helicopter's salvo at t (js/units.js, Heli.runStep): rockets from its pods, one side then the other */
  salvo(h, t) {
    const R = h.run; if (!R || R.ph !== 'in') return;
    R.ph = 'out'; R.until = T + 3; this.stat.salvos++;
    const dmg = ROCKET.dmg * (h.side === 'ally' ? ROCKET.ally : 1), side = h.side, tx = t.pos.x, tz = t.pos.z;
    for (let i = 0; i < ROCKET.n; i++) this.after(i * ROCKET.step, () => {
      if (!h.alive) return;
      const c = Math.cos(h.yaw), s = Math.sin(h.yaw), sd = i % 2 ? 1.6 : -1.6, from = new V3(h.pos.x - s * sd, h.pos.y - 1, h.pos.z + c * sd);
      const a = rand(0, TAU), rr = Math.sqrt(Math.random()) * ROCKET.spread, along = rand(-5, 5), to = new V3(tx + Math.cos(a) * rr + c * along, 0, tz + Math.sin(a) * rr + s * along); to.y = groundH(to.x, to.z);
      const len = from.distanceTo(to), dur = len / ROCKET.v; this.rockets.push({ from, to, t: 0, dur, len, side, dmg, trail: 2 });
      FX.tracers.spawn(from, _bd.subVectors(to, from).multiplyScalar(1 / dur), { life: dur, len: 7, w: 0.32, color: 0xffe0a0 });   // (the motor's glare, flying itself)
      FX.flash.spawn(from, { s0: 2.2, s1: 4.5, life: 0.09 }); FX.smoke.spawn(from, { s0: 1.5, s1: 5, life: 1.2, a0: 0.35, color: 0xd8d8d8 });
    });
  },
  flyRockets(dt) {
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const m = this.rockets[i]; m.t += dt; const q = m.t / m.dur;
      if (q >= 1) { this.rockets.splice(i, 1); hitFx(m.to.x, m.to.y, m.to.z, ROCKET.fx); this.splashAt(m.to, ROCKET.r, m.dmg, m.side); continue; }
      for (; m.trail < m.len * q; m.trail += ROCKET.puff) { _bp.lerpVectors(m.from, m.to, m.trail / m.len); FX.smoke.spawn(_bp, { s0: 1.2, s1: 4, life: rand(1, 1.6), a0: 0.34, color: 0xd8d8d8 }); }   // (a trail of puffs every few metres, whatever the frame rate)
    }
  },
  note(w, u) { if (u.col) u.col.alarm = T + 20; this.log.push(w.id + ' ' + u.kind); if (this.log.length > 600) this.log.shift(); },
  /* the laser: a beam kept up by the beats, burning its target */
  laser(dt) {
    const w = ARMS.w; let t = w && w.band === 'hold' && T < this.laserUntil && AUD.fighting && GUNSHIP.state === 'orbit' ? this.target(w) : null; if (t && !this.onReticle(t)) t = null;
    this.beam.visible = this.beamGlow.visible = !!t; if (!t) return;
    this.muzzle(_bm); _bt.set(t.pos.x, t.pos.y + t.ah * 0.7, t.pos.z); _bd.subVectors(_bt, _bm); const d = _bd.length(), k = rand(0.16, 0.26);
    this.beam.position.copy(_bm); this.beam.quaternion.setFromUnitVectors(_bx, _bd.multiplyScalar(1 / d)); this.beam.scale.set(d, k, k);
    this.beamGlow.position.copy(_bm); this.beamGlow.quaternion.copy(this.beam.quaternion); this.beamGlow.scale.set(d, k * 4, k * 4);
    this.lasHit.copy(_bt);   // (the red glow round it: js/lights.js)
    if ((this.lasTick -= dt) <= 0) { this.lasTick = 0.06; this.note(w, t); FX.fire.spawn(_bt, { s0: 1.4, s1: 3.2, life: 0.22, a0: 0.85, color: 0xff3a1c }); FX.smoke.spawn(_bt, { s0: 1.5, s1: 5, life: 1.4, a0: 0.3, color: 0x2c2823, rise: 1.5 }); }
    hurt(t, GUN.las.dps * dt * (t.kind === 'inf' ? 4 : 1));
  },
  /* the railgun: the slug goes through everything on a line (along the column it hits) */
  rail(w, G, t) {
    this.muzzle(_bm); _bt.set(t.pos.x, t.pos.y + t.ah * 0.5, t.pos.z); _bd.subVectors(_bt, _bm); const d = _bd.length();
    FX.tracers.spawn(_bm, _bd.multiplyScalar(1 / 0.1), { life: 0.1, len: d * 0.6, w: 0.5, color: 0xcfe4ff });
    const air = t.kind === 'heli' && t.pos.y > groundH(t.pos.x, t.pos.z) + 8, a = t.col || air ? (t.yaw || 0) : rand(0, TAU), cx = Math.cos(a), cz = Math.sin(a), x0 = t.pos.x, z0 = t.pos.z, y0 = t.pos.y;
    if (air) { hitFx(x0, y0 + t.ah, z0, 1.4, true); this.note(w, t); hurt(t, G.dmg); return; }
    for (let k = -8; k <= 8; k++) this.after(Math.abs(k) * 0.012, () => hitFx(x0 + cx * k * 8, 0, z0 + cz * k * 8, k ? 0.6 : 1.6));
    for (let i = UNITS.length - 1; i >= 0; i--) {
      const u = UNITS[i]; if (u.side !== 'enemy' || !w.hitSet.has(u.kind) || (u.kind === 'heli' && u.pos.y > groundH(u.pos.x, u.pos.z) + 8)) continue;
      const dx = u.pos.x - x0, dz = u.pos.z - z0, al = dx * cx + dz * cz; if (Math.abs(al) > G.len || Math.abs(dx * cz - dz * cx) > G.r) continue;
      this.note(w, u); hurt(u, G.dmg);
    }
  },
  /* the camera: onto the target; with nothing to shoot at in the frame for a while, to the nearest enemy there is */
  aimCamera(dt) {
    if ((this.fTick -= dt) > 0) { if (this.focus && this.focus.alive && GUNSHIP.state === 'orbit') this.lookAt(this.focus); return; }
    this.fTick = 0.4; if (GUNSHIP.state === 'transit') { this.offT = 0; this.focus = null; return; }
    const w0 = ARMS.w;   // a weapon picked by hand: the auto-switching takes over again after 30 s, or 3 s after the click once nothing it may hit is left round here
    if (CFG.autoArms && T < this.manualUntil && T > this.manualUntil - 27 && w0 && !UNITS.some(u => u.alive && u.side === 'enemy' && w0.hitSet.has(u.kind) && Math.hypot(u.pos.x - GUNSHIP.look.x, u.pos.z - GUNSHIP.look.z) < 250)) { this.manualUntil = 0; this.autoTick = 0; }
    const man = !CFG.autoArms || T < this.manualUntil; let here = null;
    for (const u of UNITS) if (u.side === 'enemy' && this.inFrame(u.pos)) { here = u; break; }   // (never away from enemies still in the frame)
    if (this.wantGo && !here) { const d = this.wantGo; this.wantGo = null; GUNSHIP.goTo(d); return; }
    if (T > this.nextHop && !man && !here) {   // now and then to another fight: the base, or one out in the country
      this.nextHop = T + rand(35, 55); const c = this.spots.filter(s => this.hot(s, 160) && UNITS.some(u => u.side === 'ally' && Math.hypot(u.pos.x - s.x, u.pos.z - s.z) < 130)); if (this.base && this.hot(this.base, 120)) c.push(this.base);   // (only where both sides already are)
      const far = c.filter(s => Math.hypot(s.x - GUNSHIP.look.x, s.z - GUNSHIP.look.z) > 250); if (far.length) { const s = pick(far); this.focus = null; GUNSHIP.goTo({ n: 'tgt', x: s.x, z: s.z }); return; }
    }
    const w = ARMS.w, f = w ? this.target(w) : null;
    if (f) { this.seekT = T + 4; this.lookAt(f); this.offT = this.onAim(f) ? 0 : this.offT + 0.4; return; }
    this.focus = null; this.offT = 0; if (T < this.seekT) return;
    if (here && !man) {   // enemies here that no enabled weapon may hit: the sensor stays on them and the allies are called in to finish them
      this.lookAt(here);
      if (!this.waitT) { this.waitT = T + 40; if (!this.backed(here.pos)) this.columnTo('ally', ROADNET.nearest(here.pos.x, here.pos.z, 250), pick(QRF_TYPES)); }
      if (T < this.waitT) return;
    } else this.waitT = 0;
    const en = man && w ? [w] : ARMS.enabled(); let best = null, bd = 1e9;   // (a weapon chosen by hand: to what it can hit)
    for (const u of UNITS) { if (u.side !== 'enemy' || !en.some(q => q.hitSet.has(u.kind))) continue; let d = Math.hypot(u.pos.x - GUNSHIP.look.x, u.pos.z - GUNSHIP.look.z); if (d * 0.4 < bd && this.backed(u.pos)) d *= 0.4; if (d < bd) { bd = d; best = u; } }   // (rather where the allies already are; backed() only for one that could win)
    if (best) bd = Math.hypot(best.pos.x - GUNSHIP.look.x, best.pos.z - GUNSHIP.look.z);
    if (best && !this.backed(best.pos) && T > this.nextCall) { this.nextCall = T + 25; this.columnTo('ally', ROADNET.nearest(best.pos.x, best.pos.z, 250), pick(QRF_TYPES)); }   // (nobody of ours there: a column is called in)
    if (!best) { if (man) this.manualUntil = 0; return; }   // (nothing anywhere for the chosen weapon: the auto-switching takes over)
    this.seekT = T + (man ? 2.5 : 5);
    if (bd < 200) this.lookAt(best); else GUNSHIP.goTo({ n: 'tgt', x: clamp(best.pos.x, -MAP_HALF + 120, MAP_HALF - 120), z: clamp(best.pos.z, -MAP_HALF + 120, MAP_HALF - 120) });
  },
  /* the auto-switching: the enabled weapon that suits what is in the frame and how heavy the music is */
  autoArm() {
    if (!CFG.autoArms || T < this.manualUntil || T < this.autoTick) return;
    this.autoTick = T + 1;
    const cnt = {}; let any = false; for (const u of UNITS) if (u.side === 'enemy' && this.inFrame(u.pos)) { cnt[u.kind] = (cnt[u.kind] || 0) + 1; any = true; }
    if (!any) return;
    let best = null, bs = 0, cur = 0;   // (switching at once if the one in hand has nothing to do here, else after its dwell)
    for (const w of ARMS.enabled()) {
      let s = 0; for (const k of w.hitSet) if (cnt[k]) s += Math.min(4, cnt[k]) * ((PREF[w.id] && PREF[w.id][k]) || 1);
      s *= (HEAVY_ARMS.has(w.id) ? 0.6 + 0.8 * AUD.heavy : 1.2 - 0.4 * AUD.heavy) * (ARMS.ready(w) ? 1 : 0.5);
      if (w.id === ARMS.cur) cur = s; if (s > bs) { bs = s; best = w; }
    }
    if (best && best.id !== ARMS.cur && (cur === 0 || (T > this.nextSwitch && bs > cur * 1.2))) { ARMS.select(best.id); this.focus = null; HUD.markArms(); this.nextSwitch = T + rand(7, 12); }
  },

  update(dt) {
    updateArming();
    const war = AUD.combat, fight = AUD.fighting;
    if (war && !this.was) this.start();
    if (!war && this.was) this.standDown();
    this.was = war;
    for (let i = this.pend.length - 1; i >= 0; i--) if (T >= this.pend[i].t) { const p = this.pend[i]; this.pend.splice(i, 1); p.fn(); }
    this.flyMissiles(dt); this.flyRockets(dt); this.laser(dt); this.subBeat();
    for (let i = UNITS.length - 1; i >= 0; i--) this.think(UNITS[i], dt, fight);
    for (let i = this.cols.length - 1; i >= 0; i--) {
      const E = this.cols[i], c = E.col;
      if (!c.u.length) { this.cols.splice(i, 1); continue; }
      if (!E.retreat) {   // under the gunship's fire a column does not stand still: it drives on, and from where it was halted, off down the road
        const run = c.alarm > T; if (run && c.done && T > (E.runT || 0)) { E.hold = false; E.runT = T + 2; for (let k = 0; k < 6; k++) { const n = randi(0, ROADNET.n - 1); if (Math.hypot(ROADNET.X[n] - c.u[0].pos.x, ROADNET.Z[n] - c.u[0].pos.z) > 300 && c.reroute(n)) break; } }   // (no way found: tried again in 2 s, not every step)
        if (c.done && !c.engaged && !E.hold && !run) { if (!E.idle) E.idle = T + rand(8, 15); else if (T > E.idle) { E.idle = 0; this.retask(E); } } else E.idle = 0;   // (arrived and nothing to do: on to the next fight)
        c.update(dt, run || (!E.hold && !c.engaged)); continue;
      }
      c.update(dt, true);
      for (const v of c.u.slice()) if (!VIEW.onScreen(v.pos, 0.3)) { this.seen('out', v.pos); v.remove(); }
      if (c.u.length && c.done) this.retreatCol(E);
    }
    for (let i = this.squads.length - 1; i >= 0; i--) { const s = this.squads[i]; s.update(dt); if (!s.m.length) this.squads.splice(i, 1); }
    for (let i = this.helis.length - 1; i >= 0; i--) { const h = this.helis[i]; h.update(dt); if (h.out) this.helis.splice(i, 1); }
    WRECKS.update(dt);
    if (fight) { this.waves(); this.aimCamera(dt); this.autoArm(); } else this.focus = null;
    // the base: wrecked, it is left as a ruin and another is built elsewhere; a ruin, or the base after the fight, goes once out of sight
    const B = this.base;
    if (B && war && !B.parts.some(p => p.alive)) { this.ruins.push(B); this.base = null; this.nextBase = T + rand(12, 20); B.site.restUntil = T + 300; }   // (no base on that site again for five minutes)
    else if (B && !war && T > this.downT + 3 && !this.baseSeen(B)) this.removeBase(B);
    else if (!B && fight && T > this.nextBase && GUNSHIP.state !== 'transit') { const s = this.pickSite(); if (s) { this.buildBase(s); this.wantGo = { n: 'obj', x: s.x, z: s.z }; } else this.nextBase = T + 5; }
    for (const R of this.ruins.slice()) if (!this.baseSeen(R)) this.removeBase(R);
  }
};
