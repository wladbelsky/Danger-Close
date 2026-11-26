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
  inf:  { range: 90,  reload: [1.5, 3.5], n: 1, v: 320, len: 3.5, w: 0.13, acc: 0.3,  dmg: 0.5, mh: 1.3, band: 'high' },
  car:  { range: 150, reload: [1.6, 3],   n: 3, v: 340, len: 5,   w: 0.2,  acc: 0.35, dmg: 0.6, mh: 2,   band: 'high', flash: 0.5 },
  apc:  { range: 180, reload: [2, 4],     n: 3, v: 380, len: 6,   w: 0.26, acc: 0.4,  dmg: 1.4, mh: 2.6, band: 'mid', blast: 0.35, flash: 0.8 },
  tank: { range: 230, reload: [5, 8],     n: 1, v: 520, len: 7,   w: 0.4,  acc: 0.45, dmg: 7,   mh: 2.2, band: 'low', blast: 1.2, flash: 2.2 },
  heli: { range: 260, reload: [1.4, 2.8], n: 2, v: 260, len: 6,   w: 0.3,  acc: 0.4,  dmg: 2.5, mh: 0,   band: 'mid', blast: 0.8 }
};
/* tracers brighter than white, so that they bloom (SENSOR's over(): what is over 1.9 at the exposure); a unit's / the gunship's */
const TRACER_GLOW = { unit: 6, gun: 3 };
const UNIT_BEAT_MAX = 24;   // unit shots on one beat at most (a volley)
/* ---- splash: the blast of a bomb, a rocket or a shell hurts every enemy round it, not only the kinds the weapon is aimed at (the
   table says what a weapon is fired at, not what its blast spares): the gunship's blast radii, metres ---- */
const SPLASH = { h105: 10, hf: 8, apk: 6, gbu: 18 };
/* how far off a structure a hit still counts (from its 3 m pad): only what lands on it, but a bomb flattens what stands next to it too */
/* the CBU-97: its canister opens `open` m over the point, its `subs` submunitions come down on chutes over `fall` s to `hover` m, spread
   over a circle of `r` m (CLUSTER_PAT: three in, seven round, in its radii; turned with the line of sight from the aircraft); then one a
   sixteenth of the beat (on the kick's grid) fires its `skeets` down at once: each at the nearest enemy vehicle within `seek` m of it
   that the ones before have not already done for (`dmg` each: a car or an APC at one, a tank at two), else into the ground, its
   fragments killing the enemy's infantry within `frag.r` m */
const CLUSTER = { open: 40, subs: 10, fall: 1.0, hover: 15, r: 16, mark: 3, skeets: 4, seek: 9, dmg: 8, frag: { r: 4, dmg: 1.2 }, sub: 0.4 };
const CLUSTER_PAT = [...[0, 1, 2].map(i => [0.35 * Math.cos(i * TAU / 3 + 0.5), 0.35 * Math.sin(i * TAU / 3 + 0.5)]), ...[0, 1, 2, 3, 4, 5, 6].map(i => [0.88 * Math.cos(i * TAU / 7), 0.88 * Math.sin(i * TAU / 7)])];   // (where each submunition comes down, in CLUSTER.r)
const STRUCT_REACH = { gbu: 8 }, structReach = (w, r) => Math.min(r, STRUCT_REACH[w.id] || 4);
/* a helicopter's rocket run: it dives in, and on a beat looses a salvo of unguided rockets that burst on and round the target */
const ROCKET = { n: 8, step: 0.07, v: 220, spread: 7, r: 6, dmg: 2.2, fx: 1.1, ally: 0.6, puff: 5 };   // (puff: metres between the trail's puffs)
/* a soldier's rocket at a vehicle (an RPG / an AT launcher; rifles do nothing to armour): `share` of the soldiers carry one (s.at), fired
   at the other side's nearest vehicle within `range` m once its `reload` is done, on the soldier's beat; `acc` of them hit, doing `dmg`
   (an APC at two, a tank at three); a flying body with a flame and a trail (missileFx at `s`), a blast where it lands */
const RPG = { share: 0.2, range: 160, min: 12, v: 140, reload: [25, 45], acc: 0.55, dmg: { car: 3, apc: 4, tank: 5 }, fx: 1.2, s: 0.5 };
/* the allies fire this many times as often (their helicopters most of all), each round doing less: their damage a second is only
   ALLY_DPS × the enemy's, so the fight looks busier without the allies clearing it before the gunship gets a word in */
const ALLY_RATE = { inf: 1.6, car: 1.6, apc: 1.6, tank: 1.3, heli: 2.8 }, ALLY_DPS = 1.2;
const COST_RESET = 60;   // seconds of silence (no music) after which the mission cost on the HUD starts again from 0: a new mission
/* the enemy's fire does this much to the allies (from cover, outnumbered as they are): they live to be seen in the fight */
const ALLY_TOUGH = 0.25, ALLY_TOUGH_K = u => u.side === 'ally' ? ALLY_TOUGH : 1;
/* the fight is where the camera looks: a column halts for a fight only within COL_ZONE m past the frame (VIEW.near), further off it
   fires on the move and drives on, and the allies' fire does an enemy vehicle out there no harm, so it comes into the frame. Nobody
   fires at all unless the shooter or its target is within FIRE_NEAR m past the frame: out there nobody sees it */
const COL_ZONE = 60, FIRE_NEAR = 150;
/* off the road (BATTLE.assault / deploy / scatterNear): an assault from within `near` m past the frame at allies `reach` m off, to
   `short` m of them, at most `assaults` at once, given up after `assaultT` s, looked for every `every` s; positions `deploy` m off
   the road; a scatter within `scatterR` m of the hit, `scatter` m away, holding `hold` s */
const OFFROAD = { near: 100, tgtNear: 40, reach: [60, 250], short: 40, assaults: 2, assaultT: 60, every: [6, 10], deploy: [15, 35], scatterR: 30, scatter: [30, 60], hold: [10, 20] };
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
const BURST = { g25: [5, 14], b40: [2, 5], apk: [2, 6] }, BURST_LET_GO = 8, LIGHT_ARMS = new Set(['g25', 'g30', 'b40']);
/* fast music: the light guns fire between the beats too, on a grid locked to the kick (subdivisions of a beat at a tempo 0..1 over it) */
const SUBDIV = { g25: [[0.2, 2], [0.6, 4]], g30: [[0.4, 2]], b40: [[0.4, 2]] };
const GUN = {
  g25:  { n: 8, step: 0.024, spread: 2.2, dmg: 0.34, r: 2.4, fx: 0.35, tw: 0.16, tl: 7, gap: 0.16 },
  g30:  { n: 1, step: 0,     spread: 1.6, dmg: 2.4,  r: 3.4, fx: 0.8,  tw: 0.28, tl: 8, gap: 0.34 },   // (single aimed rounds, three a second at most)
  b40:  { n: 4, step: 0.25,  spread: 3,   dmg: 2.2,  r: 4,   fx: 0.9,  tw: 0.3,  tl: 8, gap: 0.3 },
  h105: { n: 1, step: 0,     spread: 1.5, dmg: 17,   r: 10,  fx: 3,    tw: 0.7,  tl: 9, gap: 0.5 },
  hf:   { n: 1, step: 0,     spread: 0.5, dmg: 18,   r: 5,   fx: 2.2,  missile: 1.5, gap: 0.5 },
  apk:  { n: 4, step: 0.25,  spread: 6,   dmg: 5,    r: 5,   fx: 1.3,  missile: 1.0, gap: 0.5 },
  gbu:  { n: 1, step: 0,     spread: 1,   dmg: 22,   r: 12,  fx: 4.6,  missile: 2.2, gap: 0.5, bomb: true },
  cbu:  { n: 1, step: 0,     spread: 3,   dmg: 0,    r: 0,   fx: 1.5,  missile: 2.2, gap: 0.5, bomb: true, cluster: true },   // (to a point CLUSTER.open m over the ground, no homing: BATTLE.cluster)
  aim:  { n: 1, step: 0,     spread: 0,   dmg: 8,    r: 7,   fx: 1.6,  missile: 1.3, gap: 0.5, air: true },
  las:  { dps: 7, gap: 0 },
  rail: { dmg: 30, r: 5, len: 64, gap: 0.5 }
};
/* what each weapon is best at (the auto-switching): 1 unless listed */
const PREF = {
  g25: { inf: 3, car: 1.5, apc: 0.3 }, g30: { inf: 1.5, car: 2.5, apc: 2, struct: 0.8 }, h105: { inf: 0.8, car: 1.5, apc: 2.5, tank: 4, struct: 2.5 },
  b40: { inf: 1.5, car: 2.5, apc: 2.2 }, hf: { car: 1.5, apc: 2.5, tank: 5, struct: 1.5 }, apk: { inf: 2, car: 2.5, apc: 2, struct: 1.5 },
  gbu: { inf: 0.8, car: 1.2, apc: 2, tank: 4, struct: 4 }, cbu: { inf: 1, car: 2, apc: 3, tank: 3.5 }, aim: { heli: 8 }, las: { inf: 1.5, car: 1.5, apc: 1.5, tank: 1.5, heli: 3 }, rail: { inf: 1.2, car: 1.5, apc: 2, tank: 3, heli: 2 }
};
/* armour against the light guns: a factor on their damage to a vehicle (a 25 mm burst stops a car, an APC takes a long hammering) */
const ARMOR = { g25: { car: 0.6, apc: 0.2 }, g30: { car: 0.8, apc: 0.4 }, gbu: { struct: 3 } };   // (the GBU-39 brings a building down: the HQ's 60 at one bomb)
/* the missiles' and the bomb's bodies in flight, a scale on a 1.7 m missile (js/effects.js: missileFx) */
const MISSILE_S = { hf: 1, apk: 1.1, gbu: 1.2, cbu: 1.3, aim: 1.6 };
const CUT = [0.55, 0.93];   // the share of its way past which a missile waits for a beat, at most and at least (BATTLE.cut; was 0.55 for the beat, 0.8 for the wait)
/* the auto-switching changes weapon while the one in hand reloads longer than this (or two beats), seconds */
const RELOAD_HOP = 1.5;
const HEAVY_ARMS = new Set(['h105', 'hf', 'gbu', 'cbu', 'rail', 'apk']);
const QRF_TYPES = [['tank', 'apc'], ['apc', 'car'], ['tank', 'car', 'car'], ['apc', 'apc']];
const WAVES = [['car', 'car'], ['apc', 'car'], ['tank', 'apc'], ['tank', 'tank', 'apc'], ['car', 'apc', 'apc'], ['tank', 'car', 'car']];

/* ---- wrecks: burnt, smoking, cooling in four stages on the thermal sensor, then sinking into the ground (keep: base rubble stays
   until the base goes) ---- */
const _wk = new V3(), _wv = new V3();
const WRECKS = {
  list: [],
  add(obj, s, keep, pos, roll) {
    toWreck(obj, 0); this.list.push({ obj, pos: pos || obj.position, t: 0, stage: 0, s, puff: 0, keep: !!keep, y0: obj.position.y, roll, veh: obj.userData.veh });   // (roll: a vehicle knocked out on the move, still rolling; veh: a vehicle's wreck, in the way of the traffic)
    let n = 0; for (const w of this.list) if (!w.keep) n++;
    if (n > 22) { const o = this.list.find(w => !w.keep && w.t < 130); if (o) o.t = 130; }   // (too many: the oldest sinks now)
  },
  dropUnder(root) { this.list = this.list.filter(w => w.obj.parent !== root); },
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const w = this.list[i]; w.t += dt;
      if (w.roll && (w.t > 130 || !w.roll.coast(dt))) { w.roll = null; w.y0 = w.obj.position.y; }
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
/* a soldier gone: a burst of dust that hides him as he goes (lighter than the ground, so it shows from above), a wisp of smoke in it */
const _pc = new THREE.Color(), PUFF_MAX = 12;   // (hit puffs a step at most; a death always puffs)
function puffDust(p) {
  _pc.copy(ENV.dustTint).lerp(ENV.smokeTint, 0.35); const c = _pc.getHex();
  for (let i = 0; i < 8; i++) { _wk.set(p.x + rand(-0.6, 0.6), p.y + rand(0.3, 1.4), p.z + rand(-0.6, 0.6)); FX.puff.spawn(_wk, { s0: rand(1.6, 2.4), s1: rand(5, 7), life: rand(1.2, 2), a0: 0.8, color: c, v: _wv.set(rand(-2.5, 2.5), rand(0.8, 2.6), rand(-2.5, 2.5)), drag: 2.2 }); }
  _wk.set(p.x, p.y + 1, p.z); FX.smoke.spawn(_wk, { s0: 2, s1: 6, life: rand(1.6, 2.4), a0: 0.35, color: 0x3a3632, v: _wv.set(WIND.x, rand(1, 2), WIND.z), drag: 0.6 });
}
/* a soldier hit and still up: a small kick of dust where the round struck */
function hitPuff(p) {
  if (BATTLE.puffN >= PUFF_MAX) return; BATTLE.puffN++;
  _pc.copy(ENV.dustTint).lerp(ENV.smokeTint, 0.35); const c = _pc.getHex();
  for (let i = 0; i < 3; i++) { _wk.set(p.x + rand(-0.4, 0.4), p.y + rand(0.2, 1.1), p.z + rand(-0.4, 0.4)); FX.puff.spawn(_wk, { s0: rand(0.8, 1.2), s1: rand(2.5, 3.5), life: rand(0.6, 1), a0: 0.7, color: c, v: _wv.set(rand(-1.5, 1.5), rand(1, 2.5), rand(-1.5, 1.5)), drag: 2.5 }); }
}
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

const RET_ON = 0.07, OFF_SWITCH = 3;
/* the AIM-9X's lock: the seeker takes LOCK.t s of a helicopter held under the reticle (off it, the lock slips back; off it for
   `lose` s, it is gone); then SHOOT, and the launch `fire` s on (on a strong beat if one falls between win[0] and win[1] s) */
const LOCK = { t: 1.4, fire: 0.5, lose: 0.5, win: [0.35, 0.7] };
/* the seekers that lock on before the launch, and how long they take: the AIM-9X's infrared one on a helicopter; the Hellfire's
   semi-active laser one on the spot the sensor's designator puts on a vehicle on the ground (the Hellfire then flies to that spot,
   wherever the laser holds it: BATTLE.lase, the sensor kept on the target until the hit) */
const LOCK_T = { aim: LOCK.t, hf: 0.8 };   // the reticle is "on" a target within this of the frame's centre (in half frame heights): no shot before that
/* a gun already fires at a target this near the reticle (half frame heights): its rounds land under the reticle and walk onto the
   target as the sensor comes round; the missiles, the laser and the railgun wait for it to be on */
const RET_NEAR = 0.4, NEAR_ARMS = new Set(['g25', 'g30', 'b40', 'h105']);
/* a trigger on target that lands off it anyway: [chance, metres off from, to] (the 25 mm sprays as it is) */
const MISS = { g30: [0.25, 3, 7], b40: [0.2, 3, 8], h105: [0.2, 5, 12] };
/* a light gun's round glancing off armour: the chance of a ricochet per hit by kind; at most RICO_MAX of them a step */
const RICO = { g25: { car: 0.3, apc: 1 }, g30: { car: 0.4, apc: 1 }, b40: { apc: 0.7 } }, RICO_MAX = 8;
/* fewer enemies on the ground than this (× the enemies' share) within ZONE.r of the camera's point: the next arrivals are called at once */
const ZONE_FILL = 12;
/* the feed: the next group already coming in from just off the frame as the last one dies. Enemies on the ground within r of the
   sensor's point that an enabled weapon may hit are kept up to want (× the enemies' share), a group at most every `every` s, both
   from the music's pace (slow → fast); music slower than `slow` bpm has a break of brk s once the ground round the point is clear.
   cap: no feeding past that many enemies on the ground */
/* a turret's next target (a tank's, an APC's, a car's gun): by its distance times 1 + `turn` × the turn to it over 180° (one the gun
   points at first); the one it has kept unless another scores under `keep` × its; with none, the turret holds `hold` s where it was */
const TURRET_PICK = { turn: 1.5, keep: 0.65, hold: 3 };
const FEED = { r: 220, want: [5, 14], every: [6, 2], slow: 92, brk: [8, 14], cap: 90, sq: 0.6 };
/* the allies in the sensor's frame: when fewer than `min` of theirs have been in it for ALLY_FEED.gap s, a fireteam of theirs runs in from its
   edge (every `every` s at most, while fewer than near + k × the enemies are round the point, FEED.r);
   their fireteams with nobody to shoot get a new loop round the point when it has moved on `move` m, and one far out of the fight
   and out of sight is taken away; at most `inf` × the allies' share of their infantry (an APC of theirs lets nobody out past it);
   with no vehicle of theirs round the
   point, a column of theirs drives in from just out of sight (every `col` s at most) */
/* the next target: rather one with an ally within MIXED.r m (in the frame with it: its ground reaches only 40–70 m from its centre), its distance × k */
const MIXED = { r: 35, k: 0.1 };
/* the allies' loops round the sensor's point: inside the frame */
const ALLY_LOOP = [8, 28];
const ALLY_FEED = { gap: 3, every: 4, col: 25, near: 6, k: 0.8, inf: 45, move: 40, min: 3 };
/* infantry under fire: soldiers within max(r0, k × the blast's radius) of a hit run 8–16 m away from it for 2.5–4 s, not firing;
   their squad keeps twice its spacing for `spread` s. Once he has run, a soldier stands his ground for `rest` s (and fires) */
const SCATTER = { r0: 10, k: 3, d: [8, 16], t: [2.5, 4], v: 3.6, spread: 10, rest: 4 };
/* a knocked-out vehicle cooks off: pops by kind, the first not before COOK.first s, each on a strong beat (or COOK.late s on), COOK.gap s apart */
const COOK = { tank: 3, apc: 2, car: 1, first: 0.6, gap: 0.5, late: 1.6, toss: 0.35 };
const _bm = new V3(), _bla = new V3(), _bt = new V3(), _bd = new V3(), _bp = new V3(), _bx = new V3(1, 0, 0), _br = new V3(), _bd2 = new V3(), _wobs = [];
const BATTLE = {
  base: null, spent: 0, silent: 0, silentRT: 0, ruins: [], cols: [], squads: [], helis: [], focus: null, chase: null, log: [], stat: { in: 0, out: 0, seenIn: 0, seenOut: 0, shots: 0, uShots: 0, uBeat: 0, uBand: 0, uLate: 0, volleys: 0, drops: 0, uDmg: 0, splash: 0, salvos: 0, salvoBeat: 0, salvoLate: 0, subShots: 0, subOff: 0, rush: 0, hops: 0, near: 0, miss: 0, feed: 0, breaks: 0, cooks: 0, tosses: 0, ricochet: 0, dismounts: 0, outOf: 0, bailed: 0, doorMax: 0, allyFeed: 0, scatter: 0, refocus: 0, yield: 0, bypass: 0, ghost: 0, bump: 0, locks: 0, lockShots: 0, spared: 0, steer: 0, shove: 0, quiet: 0, unjam: 0, assaults: 0, deploys: 0, scatterV: 0, rescat: 0, lased: 0, clusters: 0, skeets: 0, skeetHits: 0, cluSalvo: [] }, surgeUntil: 0, rockets: [], forceUntil: 0,
  pend: [], missiles: [], was: false, downT: -99, nextWave: 0, nextHeli: 0, nextSquad: 0, nextBase: 0, nextQrf: 0, nextAsq: 0, nextField: 0, spots: [], wantGo: null, waitT: 0, nextCall: 0, autoTick: 0, seekT: 0, fTick: 0, lastShot: -9, shotRT: -9, fedT: 0, rushT: 0, gridN: -1, manualUntil: 0, nextSwitch: 0, laserUntil: 0, lasTick: 0, beam: null, offT: 0, cooks: [], tosses: [], nextFeed: 0, nextAllyFeed: 0, nextAllyCol: 0, allyFrameT: 0, feedT: 0, breakUntil: 0, armT: -99, ricoN: 0, puffN: 0, lock: null, lase: null, pod: null, subs: [], lockLog: [], atP: new V3(),
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
  /* can the sensor bring it under the reticle? Not by the map's edge, where the frame cannot be centred on it (VIEW.fits; a few
     metres of slack: the reticle's width); the gunship leaves those to the allies */
  reach(u) { return VIEW.fits(u.pos.y - groundH(u.pos.x, u.pos.z) > 3 ? this.behind(_br.copy(u.pos)) : u.pos, 4); },
  /* the ground point behind one in the air, on the camera's line of sight through it (p: where it is; set to that point) */
  behind(p) {
    const y = p.y; _bd2.subVectors(p, camera.position).normalize(); let t = 0;
    for (let i = 0; i < 3; i++) t = (groundH(p.x + _bd2.x * t, p.z + _bd2.z * t) - y) / Math.min(-0.05, _bd2.y);   // (metres along it, down to the ground)
    p.x += _bd2.x * t; p.z += _bd2.z * t; p.y = 0; return p;
  },
  inPlay(p) { return VIEW.near(p, COL_ZONE) || this.slow(); },   // (COL_ZONE; very slow music fights group by group with breaks: anywhere then)

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
    this.nextWave = T + rand(3, 8); this.nextHeli = T + rand(3, 8); this.nextSquad = T + rand(8, 16); this.fedT = 0; this.seekT = T + 1; this.nextQrf = T + 3; this.nextAsq = T + 6; this.nextField = T + rand(6, 12); this.spots = []; this.waitT = 0; this.armT = T; this.nextFeed = T + 2; this.breakUntil = 0; this.allyFrameT = T; this.nextAllyFeed = T + 6; this.nextAllyCol = T + 20;
    this.wantGo = this.base ? { n: 'obj', x: this.base.x, z: this.base.z } : null;   // (the camera stays: the base is where it goes on its next allowed transit)
    this.firstWave();
  },
  /* the first arrivals: a column on a road into the camera's zone from just out of sight (150–250 m), the allies to meet it */
  firstWave() {
    const node = this.toPlace(GUNSHIP.look.x, GUNSHIP.look.z); if (node.node < 0) return;
    if (this.columnTo('enemy', node, pick(WAVES), true)) this.stat.first = T; else this.columnTo('enemy', node, pick(WAVES));
    this.columnTo('ally', node, pick(QRF_TYPES));
  },
  standDown() {
    this.downT = T; this.focus = this.chase = null;
    for (const E of this.cols) if (!E.retreat) this.retreatCol(E);
    for (const s of this.squads) { s.flee = true; for (const m of s.m) m.retreat = true; }
    for (const h of this.helis) h.retreat = true;
    for (const c of this.cooks) c.n = 1;   // (what was still to pop goes up once more, then it is over)
    if (CFG.transitMin > 0 && this.base && Math.hypot(this.base.x - GUNSHIP.look.x, this.base.z - GUNSHIP.look.z) < ZONE.r) GUNSHIP.nextTransit = Math.min(GUNSHIP.nextTransit, T + rand(12, 20));   // (the camera leaves the base, which goes once out of sight)
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
  /* out of sight, but close: well off the frame and 1.6 × its half diagonal on the ground away, 150 m at least (arrivals in the zone) */
  hiddenNear(x, z) {
    const vh = camera.position.distanceTo(CAM_TGT) * Math.tan(camera.fov * DEG / 2), hd = Math.hypot(vh * camera.aspect, vh * 1.42);
    return !VIEW.onScreen(_bp.set(x, groundH(x, z), z), 0.5) && Math.hypot(x - CAM_TGT.x, z - CAM_TGT.z) > Math.max(150, 1.6 * hd);
  },
  /* nothing left round the camera's zone that an enabled weapon may hit */
  dry() { const en = ARMS.enabled(); return !UNITS.some(u => u.alive && u.side === 'enemy' && en.some(w => w.hitSet.has(u.kind)) && Math.hypot(u.pos.x - GUNSHIP.look.x, u.pos.z - GUNSHIP.look.z) < ZONE.r && this.reach(u)); },   // (what the sensor cannot reach by the map's edge is the allies': it keeps nobody here)
  /* the music's pace for the feed, 0..1: the tempo (95–150 bpm), how hard it drives, half in a quiet part */
  pace() { return clamp(0.15 + 0.75 * AUD.tempo + 0.25 * AUD.drive, 0, 1) * (AUD.calm ? 0.5 : 1); },
  /* very slow music (its kicks under FEED.slow bpm) */
  slow() { return AUD.bpm > 0 && AUD.bpm < FEED.slow && AUD.tempo < 0.05 && T - this.armT > 8; },
  /* keeps the next group coming in round the sensor's point (FEED); true while slow music has its break */
  feed(k) {
    if (T < this.feedT) return T < this.breakUntil; this.feedT = T + 0.5;
    const F = FEED, C = CAM_TGT, en = ARMS.enabled(); let n = 0, all = 0;
    let an = 0, av = false, ain = 0;
    for (const u of UNITS) {
      if (u.side === 'ally') { if (u.kind === 'heli' || !u.alive) continue; const d = Math.hypot(u.pos.x - C.x, u.pos.z - C.z); if (d < F.r) { an++; if (u.kind !== 'inf') av = true; } if (this.inFrame(u.pos)) ain++; continue; }
      if (u.side !== 'enemy' || !u.alive || u.kind === 'struct' || u.kind === 'heli') continue; all++; const d = Math.hypot(u.pos.x - C.x, u.pos.z - C.z); if (en.some(w => w.hitSet.has(u.kind)) && d < F.r) n++;
    }
    if (ain >= ALLY_FEED.min) this.allyFrameT = T;
    if (CFG.allies > 0 && n > 0) {   // the allies come where the camera looks: a fireteam in from the frame's edge, a column from just out of sight
      if (T - this.allyFrameT > ALLY_FEED.gap && T > this.nextAllyFeed && an < ALLY_FEED.near + ALLY_FEED.k * n && this.edgeSquad('ally')) { this.nextAllyFeed = T + ALLY_FEED.every; this.stat.allyFeed++; }
      for (let i = this.squads.length - 1; i >= 0; i--) {   // a fireteam of theirs (fighting or not), its loop round where the point was: a new loop round where it is now, running there
        const q = this.squads[i], L0 = q.m[0]; if (q.side !== 'ally' || q.flee || !L0 || T < (q.feed ? q.reT || 0 : q.go) || L0.scatter || q.moved) continue;   // (a fireteam fed in, running in too: they ran on to where the sensor had been, 100–150 m off by the time they got there; any other, an APC's still coming out of its door, only once it is off)
        const dl = Math.hypot(L0.position.x - C.x, L0.position.z - C.z);
        if (dl > F.r + 120) { if (q.m.every(s => this.hidden(s.position.x, s.position.z, 0.3))) { for (const s of q.m.slice()) { this.seen('out', s.position); s.remove(); } this.squads.splice(i, 1); } continue; }   // (far out of the fight, out of sight: gone)
        const c = q.loopC || q.wps[0]; if (Math.hypot(c[0] - C.x, c[1] - C.z) < ALLY_FEED.move || dl > F.r) continue;
        const loop = patrolLoop(C.x, C.z, ...ALLY_LOOP, [L0.position.x, L0.position.z]); if (loop.length < 3) continue;
        const on = loopOn(loop); if (on) { q.wps = on; q.wi = 0; } else { q.wps = loop; q.wi = 1; } q.wait = 0; q.go = T + 10; q.reT = T + 4; q.feed = true; q.loopC = [C.x, C.z]; this.stat.regroup = (this.stat.regroup || 0) + 1;   // (round the point only, not back out to where they were)
      }
      if (!av && T > this.nextAllyCol) { this.nextAllyCol = T + ALLY_FEED.col; if (this.columnTo('ally', this.toPlace(C.x, C.z, 200), pick(QRF_TYPES), true)) this.stat.allyFeed++; }
    }
    if (this.slow()) {   // group by group: the ground round the point cleared, a break, then the next group
      const clear = n <= 2 && !UNITS.some(u => u.side === 'enemy' && u.alive && u.kind !== 'struct' && this.inFrame(u.pos));   // (the group gone: a straggler or two out of the frame do not count)
      if (!clear && T > this.breakUntil) this.breakUntil = 0;
      if (clear && !this.breakUntil) { this.breakUntil = T + rand(...F.brk); this.stat.breaks++; }
      if (T < this.breakUntil) return true;
      if (!clear) return false;
    } else this.breakUntil = 0;
    const p = this.pace(); if (n >= Math.round(lerp(F.want[0], F.want[1], p) * k) || T < this.nextFeed || all >= F.cap * k) return false;
    if (Math.random() < F.sq ? this.edgeSquad() : this.columnTo('enemy', this.toPlace(C.x, C.z, 200), pick(WAVES), true) || this.edgeSquad()) { this.nextFeed = T + lerp(F.every[0], F.every[1], p); this.stat.feed++; }
    return false;
  },
  /* a squad of a side (the enemy's by default) just off the frame (10–30 m past its edge), running in to a loop round the sensor's point */
  edgeSquad(side = 'enemy') {
    const C = CAM_TGT;
    for (let t = 0; t < 16; t++) {
      const a = rand(0, TAU), dx = Math.cos(a), dz = Math.sin(a); let d = 30;
      while (d < 400 && VIEW.onScreen(_bp.set(C.x + dx * d, groundH(C.x + dx * d, C.z + dz * d), C.z + dz * d), 0.15)) d += 8;
      d += rand(10, 30); const x = C.x + dx * d, z = C.z + dz * d;
      if (Math.abs(x) > MAP_HALF - 40 || Math.abs(z) > MAP_HALF - 40 || VIEW.onScreen(_bp.set(x, groundH(x, z), z), 0.1) || !walkable(x, z, x, z) || UNITS.some(u => u.side !== side && Math.hypot(u.pos.x - x, u.pos.z - z) < 50)) continue;
      const loop = patrolLoop(C.x, C.z, ...(side === 'ally' ? ALLY_LOOP : [15, 45]), [x, z]); if (loop.length < 3) continue;
      const own = side === 'ally' && loopOn(loop), s = new Squad(side, randi(4, 6), x, z, own || loop); if (!s.m.length) return null;   // (the allies' loop without the spot they start from out of the frame: they came back out to it every lap)
      s.wait = 0; s.wi = own ? 0 : 1; s.go = T + (side === 'ally' ? rand(14, 18) : rand(6, 10)); s.feed = side === 'ally';   // (wi 1: straight on, no halt at the spot it starts from)
      this.squads.push(s); for (const m of s.m) this.seen('in', m.position); return s;   // (the allies run in further: into the frame)
    }
    return null;
  },
  /* the next arrivals now (at most every 12 s; the caps still hold) */
  rush() { if (T <= this.rushT) return; this.rushT = T + 12; this.stat.rush++; this.nextWave = this.nextSquad = this.nextField = 0; this.nextBase = Math.min(this.nextBase, T + 2); },
  waves() {
    const k = CFG.enemies / 100; if (k <= 0 || GUNSHIP.state === 'transit') return;
    // nothing of the enemy's in the frame for 6 s: the next arrivals (and a new base, if there is none) are called now (at most every 12 s; the caps still hold)
    let seen = false; for (const u of UNITS) if (u.side === 'enemy' && u.kind !== 'struct' && this.inFrame(u.pos)) { seen = true; break; }
    if (this.feed(k)) return;   // (a break between the groups in slow music: no arrivals at all)
    if (seen || !this.fedT || this.slow()) this.fedT = T; else if (T - this.fedT > 6) this.rush();   // (slow music waits for its groups)
    // few of them left round the camera's zone (outside a quiet part): the next arrivals now too
    const L = GUNSHIP.look; let zn = 0; for (const u of UNITS) if (u.side === 'enemy' && u.kind !== 'struct' && u.kind !== 'heli' && Math.hypot(u.pos.x - L.x, u.pos.z - L.z) < ZONE.r) zn++;
    if (zn < Math.round(ZONE_FILL * k) && !AUD.calm && !this.slow()) this.rush();
    if (T > this.nextWave) { this.nextWave = T + rand(6, 12) / k; let n = 0; for (const E of this.cols) if (!E.retreat && !E.ally) n += E.col.u.length; if (n < Math.round(14 * k)) this.spawnColumn(); }
    if (T > this.nextSquad) {   // squads: running into the camera's zone from just out of sight, else round the base
      this.nextSquad = T + rand(8, 16) / k; const sq = this.squads.filter(s => !s.flee && s.side === 'enemy'), inZ = sq.filter(s => s.m[0] && Math.hypot(s.m[0].position.x - L.x, s.m[0].position.z - L.z) < ZONE.r).length;
      if (sq.length < Math.round(9 * k) && !(inZ < Math.round(4 * k) && this.squadAt('enemy', L.x, L.z, 150, 240, 25, 70, true)) && this.base) this.squadAt('enemy', this.base.x, this.base.z, 95, 170, 60, 150);
    }
    if (T > this.nextField) { this.nextField = T + rand(25, 45) / k; this.spots = this.spots.filter(s => this.hot(s, 200)); if (this.spots.length < 3) this.spawnField(); }
    if (T > this.nextHeli) { this.nextHeli = T + rand(40, 70) / k; if (this.helis.filter(h => h.alive && !h.retreat).length < Math.round(2 * k)) this.spawnHeli(); }   // (with a base or without, whatever the allies' share)
    // the allies' quick reaction force: a column and fireteams into the camera's zone (where the fight is), so there are always some of them in it
    const ka = CFG.allies / 100; if (ka <= 0) return;   // (the allies' share: how many and how often)
    if (T > this.nextQrf) { this.nextQrf = T + rand(20, 35) / ka; let n = 0; for (const u of UNITS) if (u.side === 'ally' && u.col && Math.hypot(u.pos.x - L.x, u.pos.z - L.z) < ZONE.r) n++; if (n < Math.round(4 * ka)) this.columnTo('ally', this.toPlace(L.x, L.z), pick(QRF_TYPES), true); }
    if (T > this.nextAsq) { this.nextAsq = T + rand(15, 30) / ka; if (this.squads.filter(s => !s.flee && s.side === 'ally').length < Math.max(1, Math.round(2 * ka))) this.squadAt('ally', L.x, L.z, 150, 240, 25, 70, true); }
  },
  spawnColumn() {
    const N = ROADNET, h = this.toPlace(GUNSHIP.look.x, GUNSHIP.look.z); let k = -1;
    if (h.node >= 0 && Math.random() < 0.6 && this.columnTo('enemy', h, pick(WAVES))) { this.columnTo('ally', h, pick(QRF_TYPES)); return; }   // (mostly from 180–420 m down a road into the camera's zone, the allies meeting it there)
    for (let t = 0; t < 40 && k < 0; t++) { const c = randi(0, N.n - 1), x = N.X[c], z = N.Z[c]; if (!N.BR[c] && this.hidden(x, z, 0.8) && !UNITS.some(u => u.side === 'ally' && Math.hypot(u.pos.x - x, u.pos.z - z) < 160)) k = c; }
    if (k < 0) return;
    const opts = this.dests(); if (!opts.length) return;
    const dest = pick(opts), nodes = N.route(k, dest.node); if (!nodes || nodes.length < 30) return;
    const path = Path.fromNodes(nodes, null, dest.tail); if (!this.hidden(path.p[Math.min(path.p.length - 1, 14)].x, path.p[Math.min(path.p.length - 1, 14)].z, 0.8) || !this.roadFree(path, 3)) return;
    const col = new Column(pick(WAVES).map(t => new Vehicle(t, 'enemy'))); col.place(path);
    for (const v of col.u) this.seen('in', v.pos);
    this.cols.push({ col, hold: false, retreat: false });
    // the allies meet it: a column of theirs some 350 m down its road, driving towards it (the fight starts within seconds, wherever that is)
    if (!(nodes.length > 110 && this.allyRoom() && this.columnOn('ally', nodes.slice(50, 90).reverse(), pick(QRF_TYPES)))) this.columnTo('ally', dest, pick(QRF_TYPES));
  },
  /* a column of a side driving to a road node from 180–420 m away (out of sight, not next to the other side) */
  columnTo(side, dest, types, near) {
    const N = ROADNET, D = typeof dest === 'number' ? { node: dest, tail: null } : dest, node = D.node; if (node < 0) return false;   // (dest: a node, or a place: toPlace)
    if (side === 'ally' && !this.allyRoom()) return false;
    for (let t = 0; t < 80; t++) {
      const c = randi(0, N.n - 1), x = N.X[c], z = N.Z[c], d = Math.hypot(x - N.X[node], z - N.Z[node]);
      if (d < (near ? 150 : 180) || d > (near ? 250 : 420) || N.BR[c] || !(near ? this.hiddenNear(x, z) : this.hidden(x, z, 0.8)) || UNITS.some(u => u.side !== side && Math.hypot(u.pos.x - x, u.pos.z - z) < 110)) continue;
      const nodes = N.route(c, node); if (!nodes || nodes.length < (near ? 20 : 30) || nodes.length > 220) continue;
      if (this.columnOn(side, nodes, types, near, D.tail)) return true;
    }
    return false;
  },
  /* is the start of a path clear for a column of n (no vehicle or wreck on it: a new one would stand inside it) */
  roadFree(path, n) {
    for (let s = 0; s <= (n - 1) * GAP + 8; s += 4) { path.at(s, 1, _bp); for (const u of UNITS) if (u instanceof Vehicle && Math.hypot(u.pos.x - _bp.x, u.pos.z - _bp.z) < 9) return false; for (const w of WRECKS.list) if (w.veh && w.obj.parent === scene && Math.hypot(w.obj.position.x - _bp.x, w.obj.position.z - _bp.z) < 9) return false; }
    return true;
  },
  /* a column of a side placed at the start of a run of road nodes, if that is out of sight */
  columnOn(side, nodes, types, near, tail) {
    const path = Path.fromNodes(nodes, null, tail), q = path.p[Math.min(path.p.length - 1, 14)], H = near ? (x, z) => this.hiddenNear(x, z) : (x, z) => this.hidden(x, z, 0.8); if (!H(path.p[0].x, path.p[0].z) || !H(q.x, q.z) || !this.roadFree(path, types.length)) return false;
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
  /* a vehicle stuck nose to nose (or before a wreck with no way round it) in sight for TRAFFIC.ghost s: its column turns off to a
     road 150–400 m away on the side away from what blocks it (the one that gives way first; the other then has the road) */
  unjam(v, o) {
    const E = this.cols.find(e => e.col === v.col); if (!E || E.hold || E.move || E.scatHold) return false;   // (not one on its own way across a field: it waits, or gives up looking at that one)
    const N = ROADNET, p = v.pos, ox = o.pos ? o.pos.x : o.obj.position.x, oz = o.pos ? o.pos.z : o.obj.position.z;
    for (let t = 0; t < 16; t++) { const k = randi(0, N.n - 1), dx = N.X[k] - p.x, dz = N.Z[k] - p.z, d = Math.hypot(dx, dz); if (d < 150 || d > 400 || dx * (ox - p.x) + dz * (oz - p.z) > 0) continue; if (E.col.reroute(k)) { this.stat.unjam++; E.idle = 0; return true; } }
    return false;
  },
  /* off the road (OFFROAD): an enemy column near the frame goes across the field at the allies' infantry or vehicles there
     (`assault`: to 40 m short of the nearest one off the road, 60–250 m away); a column halted for a fight on the road in the frame
     takes positions off it (`deploy`: each vehicle 15–35 m out towards the enemy, 15 m apart); a column the gunship hits in the frame
     scatters (`scatterNear`: each vehicle dashes 40–80 m away from the hit and holds there 10–20 s, then goes on alone) */
  assault(E) {
    const c = E.col, v = c.u[0]; if (!v || !VIEW.near(v.pos, OFFROAD.near) || this.cols.filter(e => e.assault).length >= OFFROAD.assaults) return false;
    let best = null, bd = OFFROAD.reach[1];
    for (const u of UNITS) { if (u.side !== 'ally' || !u.alive || u.kind === 'heli' || u.kind === 'struct' || !VIEW.near(u.pos, OFFROAD.tgtNear)) continue; const d = Math.hypot(u.pos.x - v.pos.x, u.pos.z - v.pos.z);   // (at allies in the picture: an assault to be seen)
      if (d < OFFROAD.reach[0] || d > bd || ROADNET.nearest(u.pos.x, u.pos.z, 25) >= 0) continue; bd = d; best = u; }
    if (!best) return false;
    const dx = (v.pos.x - best.pos.x) / bd, dz = (v.pos.z - best.pos.z) / bd;
    for (const a of [0, 0.44, -0.44]) {
      const ca = Math.cos(a), sa = Math.sin(a), qx = best.pos.x + (dx * ca - dz * sa) * OFFROAD.short, qz = best.pos.z + (dx * sa + dz * ca) * OFFROAD.short;
      if (fieldBlocked(qx, qz)) continue; const A = v.ahead(), r = fieldRoute(A.x, A.z, qx, qz, 320); if (!r || 4 * r.length > 1.8 * Math.hypot(qx - A.x, qz - A.z) + 60) continue;   // (no long way round a forest or a river: straight at them or not at all)
      c.goField(r, A.via); E.assault = { tgt: best, t: T }; E.move = true; E.idle = 0; this.stat.assaults++; return true;
    }
    return false;
  },
  /* each of the column's vehicles a column of its own, on its own way (spot(v, placed) → { x, z } or null; route length max;
     opt.clear: the way kept off other vehicles and wrecks for the first tries, wayClear; opt.here: from where it stands, not from
     where it can turn off at its speed) */
  spread(E, spot, max, after, opt) {
    const parts = [E.col].concat(E.col.split()), placed = []; let n = 0;
    for (const col of parts) {
      const F = col === E.col ? E : { col, hold: false, retreat: false, ally: E.ally }; if (F !== E) this.cols.push(F);
      const v = col.u[0]; if (!v) continue;
      for (let t = 0; t < 20; t++) { const q = spot(v, placed, t); if (!q || fieldBlocked(q.x, q.z) || placed.some(p => Math.hypot(p.x - q.x, p.z - q.z) < q.gap)) continue; const A = opt && opt.here ? { x: v.pos.x, z: v.pos.z, via: [] } : v.ahead(), r = fieldRoute(A.x, A.z, q.x, q.z, max); if (!r || 4 * r.length > 1.5 * Math.hypot(q.x - A.x, q.z - A.z) + 20) continue; if (opt && opt.clear && t < 14 && !this.wayClear(v, A.via.concat(r))) continue; col.goField(r, A.via); /* (no long way round) */ placed.push(q); F.move = true; after(F, v); n++; break; }
    }
    return n;
  },
  deploy(E) {
    const t = (E.col.u.find(v => v.tgt) || {}).tgt; E.dep = T; if (!t) return;
    const n = this.spread(E, (v, placed, k) => {
      const hd = v.dirAt(v.s), nx = -Math.sin(hd), nz = Math.cos(hd), sd = Math.sign(nx * (t.pos.x - v.pos.x) + nz * (t.pos.z - v.pos.z)) || 1, off = rand(...OFFROAD.deploy) * (k > 5 ? -1 : 1), al = rand(-10, 10);
      return { x: v.pos.x + nx * sd * off + Math.cos(hd) * al, z: v.pos.z + nz * sd * off + Math.sin(hd) * al, gap: 15 };
    }, 90, F => { F.dep = T; });
    if (n) this.stat.deploys++;
  },
  /* is a way (its points) for v clear of the other vehicles and the wrecks: none of its points within 9 m of one (what traffic() would go round), unless further off
     it than v is now (out of the way of one it stands by)? A scattering column's wreck lay on the road ahead, the way's start */
  wayClear(v, pts) {
    const C = 9, obs = _wobs; obs.length = 0;
    for (const u of UNITS) if (u !== v && u.alive && u instanceof Vehicle) obs.push(u.pos);
    for (const w of WRECKS.list) if (w.veh && w.veh !== v && w.obj.parent === scene && w.obj.position.y > w.y0 - 2) obs.push(w.obj.position);
    for (const o of obs) { const d0 = Math.hypot(o.x - v.pos.x, o.z - v.pos.z); for (const q of pts) { const d = Math.hypot(q.x - o.x, q.z - o.z); if (d < C && d < d0 + (d0 < C ? 1 : -0.5) && Math.hypot(q.x - v.pos.x, q.z - v.pos.z) > 3) return false; } }   // (one it stands by: every point near it further off than it is now, not along it)
    return true;
  },
  scatterNear(p) {
    for (const E of this.cols.slice()) {
      if (E.retreat || E.hold || E.scatHold || T < (E.scT || 0)) continue; const c = E.col;   // (on its dash: not again; holding where it got to, hit again 15 s on: off again)
      if (!c.u.some(v => Math.hypot(v.pos.x - p.x, v.pos.z - p.z) < OFFROAD.scatterR && VIEW.near(v.pos, 0))) continue;
      E.scT = T + 15;
      const n = this.spread(E, this.scatSpot(p), 140, (F, v) => { F.rescat = 0; this.scatGo(F, v, p); }, { clear: true });
      if (n) this.stat.scatterV += n;
    }
  },
  /* a scattering vehicle on its way: until its hold, then on alone (retask); it dashes there */
  scatGo(F, v, p) { F.scatHold = rand(...OFFROAD.hold); F.scat = T + 40; F.wasScat = true; F.scT = T + 15; F.dep = T; F.assault = null; F.scatP = p; F.slowT = 0; v.dashUntil = T + 30; },
  /* where one scatters to from a hit at p */
  scatSpot(p) {
    return (v, placed, k) => {   // (away from the hit and off the road to one side: the first tries only off the road)
        let ax = v.pos.x - p.x, az = v.pos.z - p.z; const d = Math.hypot(ax, az); if (d < 1) { ax = 0; az = 0; } else { ax /= d; az /= d; }
        const hd = v.dirAt(v.s), nx = -Math.sin(hd), nz = Math.cos(hd), sd = (k % 2 ? -1 : 1) * (Math.sign(nx * ax + nz * az) || (Math.random() < 0.5 ? -1 : 1));
        let dx = nx * sd + ax * 0.6, dz = nz * sd + az * 0.6; const dl = Math.hypot(dx, dz) || 1, a = rand(-0.5, 0.5) * (1 + k * 0.15), r = k < 8 ? rand(...OFFROAD.scatter) : rand(25, 40), ca = Math.cos(a), sa = Math.sin(a); dx /= dl; dz /= dl;
        const q = { x: v.pos.x + (dx * ca - dz * sa) * r, z: v.pos.z + (dx * sa + dz * ca) * r, gap: 20 };
        if (k < 9 && !this.inFrame(_bp.set(q.x, groundH(q.x, q.z), q.z))) return null;   // (it stays in the picture if it can)
        return k < 5 && ROADNET.nearest(q.x, q.z, 12) >= 0 ? null : q;   // (later, a road will do: in a town, down a side street)
    };
  },
  /* an idle column's next errand: the allies' to the enemies nearest to where the camera looks, the enemies' to the base, an outpost or the camera's district */
  retask(E) {
    const N = ROADNET, c = E.col; E.dep = 0; E.assault = null;
    if (E.ally) { let best = null, bd = 1e9; for (const u of UNITS) { if (u.side !== 'enemy' || u.kind === 'heli') continue; const d = Math.hypot(u.pos.x - GUNSHIP.look.x, u.pos.z - GUNSHIP.look.z); if (d < bd) { bd = d; best = u; } } if (best) { const P = this.toPlace(best.pos.x, best.pos.z); if (P.node >= 0) c.reroute(P.node, P.tail); } return; }
    const opts = this.dests(); if (opts.length) { const d = pick(opts); c.reroute(d.node, d.tail); }
  },
  /* an enemy column far off on its way to where the camera was (it drifts with the fight): out of sight, on to where it looks now.
     One bound for the base or an outpost keeps its errand */
  steer(E) {
    const c = E.col, L = GUNSHIP.look, v = c.u[0], P = c.path, e = P.p[P.p.length - 1], N = ROADNET, R = 300;
    if (Math.hypot(e.x - L.x, e.z - L.z) < R || Math.hypot(v.pos.x - L.x, v.pos.z - L.z) < R || c.u.some(u => VIEW.onScreen(u.pos, 0.3))) return;
    const at = n => n >= 0 && Math.hypot(N.X[n] - e.x, N.Z[n] - e.z) < 40;
    if ((this.base && at(this.base.node)) || ALLIES.posts.some(P => at(P.gateNode))) return;
    const h = this.toPlace(L.x, L.z); if (h.node >= 0 && !(at(h.node) && !h.tail) && c.reroute(h.node, h.tail)) this.stat.steer++;   // (already bound for that road: on)
  },
  /* where a column goes for a place: { node: the road node (ROADNET.toward), tail: the way on across the field (fieldRoute) to 25 m
     short of it, when the road is over 70 m away; null where there is no way } (cached a few seconds per 20 m square) */
  toPlace(x, z, r = 250) {
    const C = this.placeC || (this.placeC = new Map()), key = Math.round(x / 20) + ',' + Math.round(z / 20) + ',' + r, c = C.get(key); if (c && T < c.t) return c.P;
    if (C.size > 64) C.clear();
    const N = ROADNET, k = N.toward(x, z, r); let tail = null;
    if (k >= 0) { const d = Math.hypot(N.X[k] - x, N.Z[k] - z); if (d > 70) { const f = (d - 25) / d; for (const a of [0, 0.4, -0.4]) { const ca = Math.cos(a), sa = Math.sin(a), dx = (x - N.X[k]) * f, dz = (z - N.Z[k]) * f, p = fieldRoute(N.X[k], N.Z[k], N.X[k] + dx * ca - dz * sa, N.Z[k] + dx * sa + dz * ca, 700); if (p) { tail = p.slice(1); break; } } } }
    const P = { node: k, tail }; C.set(key, { t: T + 5, P }); return P;
  },
  dests() {
    const opts = [], h = this.toPlace(GUNSHIP.look.x, GUNSHIP.look.z); if (h.node >= 0) opts.push(h, h, h);   // (mostly into the camera's zone: they come to the aircraft, across the field if it is there)
    if (this.base && this.base.node >= 0) opts.push({ node: this.base.node, tail: null });
    const posts = ALLIES.posts.filter(P => P.gateNode >= 0); if (posts.length) opts.push({ node: pick(posts).gateNode, tail: null });
    return opts;
  },
  /* a squad of a side appearing r0–r1 from a point (out of sight) and walking a loop l0–l1 round it */
  squadAt(side, cx, cz, r0, r1, l0, l1, near) {
    for (let t = 0; t < 20; t++) {
      const a = rand(0, TAU), r = rand(r0, r1), x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (!(near ? this.hiddenNear(x, z) : this.hidden(x, z, 0.5)) || !walkable(x, z, x, z)) continue;
      const loop = patrolLoop(cx, cz, l0, l1, [x, z]); if (loop.length < 3) continue;
      const s = new Squad(side, randi(4, 6), x, z, loop); if (near) { s.go = T + 60; s.wait = 0; s.wi = 1; } this.squads.push(s); for (const m of s.m) this.seen('in', m.position); return s;
    }
  },
  /* a fight out in the country, away from the base: enemies at a district (a squad or two, a column driving in) and allies coming for them */
  spawnField() {
    const L = GUNSHIP.look, zone = !this.spots.some(s => Math.hypot(L.x - s.x, L.z - s.z) < 300);   // (the first one in the camera's zone: its squads come in, running, from just out of sight)
    const B = this.base, c = zone ? [{ x: L.x, z: L.z }] : GUNSHIP.list.filter(d => d.n !== 'outpost' && this.hidden(d.x, d.z, 0.9) && (!B || Math.hypot(d.x - B.x, d.z - B.z) > 350) && !this.spots.some(s => Math.hypot(d.x - s.x, d.z - s.z) < 300));
    if (!c.length) return;
    const d = pick(c), node = ROADNET.nearest(d.x, d.z, 160); this.spots.push({ x: d.x, z: d.z });
    const [r0, r1] = zone ? [150, 240] : [10, 60];
    this.squadAt('enemy', d.x, d.z, r0, r1, 25, 70, zone); if (Math.random() < 0.6) this.squadAt('enemy', d.x, d.z, r0, r1, 25, 70, zone);
    this.columnTo('enemy', node, pick(WAVES)); this.columnTo('ally', node, pick(QRF_TYPES));
    if (CFG.allies > 0) this.squadAt('ally', d.x, d.z, zone ? 150 : 70, zone ? 240 : 130, 50, 110, zone);
  },
  /* are there allied vehicles within 200 m of p? */
  /* any of the allies on the ground within 80 m of p (a fight with both sides in one frame)? */
  /* how far the nearest of the allies on the ground is from p (within MIXED.r: in the frame with it; 80 m: both sides in one fight) */
  allyD(p) { let d = Infinity; for (const u of UNITS) if (u.side === 'ally' && u.kind !== 'heli' && u.alive) d = Math.min(d, Math.hypot(u.pos.x - p.x, u.pos.z - p.z)); return d; },
  backed(p) { return UNITS.some(u => u.side === 'ally' && u.kind !== 'inf' && u.kind !== 'heli' && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < 200); },
  hot(p, r) { return UNITS.some(u => u.side === 'enemy' && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < r); },
  spawnHeli() {
    const L = GUNSHIP.look; let p = null;   // (in from some 700 m off the fight, out of sight: it is over the frame within half a minute)
    for (let t = 0; t < 12 && !p; t++) { const a = rand(0, TAU), x = clamp(L.x + Math.cos(a) * 700, -MAP_HALF + 60, MAP_HALF - 60), z = clamp(L.z + Math.sin(a) * 700, -MAP_HALF + 60, MAP_HALF - 60); if (this.hidden(x, z, 0.3)) p = new V3(x, groundH(x, z) + 140, z); }
    if (!p) { const a = rand(0, TAU); p = new V3(Math.cos(a) * 1500, 140, Math.sin(a) * 1500); }
    const h = new Heli(randi(0, 1), 'enemy', null, p); this.helis.push(h); this.seen('in', p);
  },

  /* ---- units shooting at each other ---- */
  think(u, dt, fight) {
    const F = FIRE[u.kind]; if (!F) return;
    if (!fight || u.retreat || u.state === 'pad' || u.state === 'crash') { u.tgt = null; return; }
    if (u.tgt && !u.tgt.alive) { u.tgt = null; u.tgtGoneT = T; }   // (its turret holds where it was a while: Vehicle.pose)
    if (u.troops && T > (u.dropT || 0)) this.dismount(u);
    if ((u.think -= dt) <= 0) { u.think = rand(0.7, 1.3); const had = u.tgt; u.tgt = this.pickTarget(u, F); if (!u.tgt && had) u.tgtGoneT = T; }
    if (u.tgt && (u.cool -= dt) <= 0) { if (!u.ready) u.ready = T; else if (T - u.ready > 3) { this.stat.uLate++; this.unitShot(u); } }   // (reloaded: it waits for a beat; with none, it fires anyway)
  },
  /* ---- an APC's infantry: halted near the enemy (or at its own base), it lets them out by the rear door one by one; they run
     out in file and spread round it. If it moves off first, the rest stay aboard for the next halt ---- */
  dismount(u) {
    if (u.v > 0.5 || u.col && u.col.alarm > T) return;
    const t = u.tgt, B = this.base;
    if (!(t && Math.hypot(t.pos.x - u.pos.x, t.pos.z - u.pos.z) < 200) && !(u.side === 'enemy' && B && Math.hypot(B.x - u.pos.x, B.z - u.pos.z) < 160)) return;
    if (u.side === 'ally') { const cap = ALLY_FEED.inf * CFG.allies / 100; let n = 0; for (const s of UNITS) if (s.kind === 'inf' && s.side === 'ally' && ++n >= cap) return; }   // (enough of theirs on foot; counted, not filtered into a new array, and only once it has a reason to let them out)
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
    const n = Math.min(u.troops, randi(1, 3)), side = u.side; u.troops = 0;
    if (!AUD.fighting) return;
    this.after(rand(0.5, 1), () => {
      const p = u.pos.clone();   // (where the wreck is now: it may have rolled on)
      let at = null;
      for (let t = 0, a0 = rand(0, TAU); t < 16; t++) {   // (all round it, then closer in: it may have rolled up to a wall)
        const a = a0 + t * TAU * 5 / 16, r = t < 8 ? 4.5 : 3.2, x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r; if (!walkable(x, z, x, z)) continue;
        const loop = patrolLoop(p.x, p.z, 15, 35, [x, z]); if (!at || loop.length > 2) at = { a, x, z, loop }; if (loop.length > 2) break;
      }
      if (!at) return;   // (a spot with a round to walk; in a lane between walls, none: they hold where they got out, not lost aboard)
      const { a, x, z, loop } = at, q = new Squad(side, n, x, z, loop); if (!q.m.length) return;
      q.from = 'bail'; q.wi = 1; q.wait = 0; q.go = T + 4; for (const s of q.m) { const jx = x + rand(-1.2, 1.2), jz = z + rand(-1.2, 1.2); if (walkable(jx, jz, jx, jz)) s.position.set(jx, groundH(jx, jz), jz); s.a = a; }
      this.squads.push(q); this.stat.bailed += q.m.length;
    });
  },
  /* the pace of the units' fire: up to twice as often in dense music, half in a quiet part, twice more in a drop's surge; each round
     does that much less, so the damage a second (and how long a fight lasts) stays the same */
  pace() { let r = (0.75 + 1.25 * AUD.drive) * (1 + 0.4 * AUD.tempo); if (AUD.calm) r /= 1.5; if (T < this.surgeUntil) r *= 2; return r; },
  unitShot(u) {
    if (u.kind === 'heli' && u.off(u.tgt) > HELI_ATK.cone) { u.think = 0; this.stat.heliHeld = (this.stat.heliHeld || 0) + 1; return false; }   // (turned off it since: holds fire, still loaded, and picks again)
    const F = FIRE[u.kind], r = this.pace(); u.ready = 0;
    u.cool = rand(F.reload[0], F.reload[1]) / (u.side === 'ally' ? ALLY_RATE[u.kind] : 1) / r;
    if (!VIEW.near(u.pos, FIRE_NEAR) && !VIEW.near(u.tgt.pos, FIRE_NEAR)) { this.stat.quiet++; return; }   // (FIRE_NEAR: it holds fire, reloaded again)
    if (u.kind === 'inf' && RPG.dmg[u.tgt.kind] && u.at && T > (u.rpgT || 0)) { this.rpg(u, u.tgt); return; }   // (a vehicle and a rocket ready: the rocket)
    if (!VS[u.kind][u.tgt.kind]) return;   // (rifles at armour: no harm, no shot)
    this.stat.uShots++; this.unitFire(u, u.tgt, F, r);
  },
  /* a beat: the units that have reloaded and whose band it is fire (any that waited 1.2 s too); a strong one (or a drop) is a volley of
     every unit in the frame that has reloaded */
  unitsOnBeat(band, st, volley) {
    const all = volley || st > 1.6; let n = 0;
    for (const h of UNITS) if (h.kind === 'heli' && h.arm && (band !== 'high' || st > 1.4) && this.salvo(h, h.arm.tgt)) this.stat.salvoBeat++;   // (a helicopter lined up on a target dead ahead: the salvo on this beat)
    for (let i = 0; i < UNITS.length && n < UNIT_BEAT_MAX; i++) {
      const u = UNITS[i]; if (!u.ready || !u.tgt || !u.tgt.alive) continue;
      const mine = FIRE[u.kind].band === band;
      if ((mine || T - u.ready > 1.2 || (all && this.inFrame(u.pos))) && this.unitShot(u) !== false) { this.stat.uBeat++; if (mine) this.stat.uBand++; n++; }   // (false: held, a helicopter turned off its target: no shot, no place in the volley)
    }
    if (all && n > 2) this.stat.volleys++;
  },
  pickTarget(u, F) {
    if (u.kind === 'heli') return this.heliTarget(u, F);
    if (u.at && T > (u.rpgT || 0)) { let a = null, ad = RPG.range; for (const o of UNITS) { if (o.side === u.side || !o.alive || !RPG.dmg[o.kind]) continue; const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z); if (d > RPG.min && d < ad) { ad = d; a = o; } } if (a) return a; }   // (a rocket ready: at the nearest vehicle in reach first)
    const V = VS[u.kind], tr = u.turret, b = tr ? u.yaw - tr.rotation.y : 0;   // (b: where its gun points now)
    const score = (o, d) => tr ? d * (1 + TURRET_PICK.turn * Math.abs(angleWrap(Math.atan2(o.pos.z - u.pos.z, o.pos.x - u.pos.x) - b)) / Math.PI) : d;
    let best = null, bs = Infinity;
    for (const o of UNITS) { if (o.side === u.side || !V[o.kind]) continue; const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z); if (d >= F.range) continue; const s = score(o, d); if (s < bs) { bs = s; best = o; } }
    const c = u.tgt; if (tr && c && c !== best && c.alive && V[c.kind]) { const d = Math.hypot(c.pos.x - u.pos.x, c.pos.z - u.pos.z); if (d < F.range && score(c, d) * TURRET_PICK.keep <= bs) return c; }   // (the one it has, unless another is much the better)
    return best;
  },
  /* a helicopter's gun: only within HELI_ATK.cone of its nose; the target it goes for first, else the nearest there */
  heliTarget(u, F) {
    const V = VS.heli, c = HELI_ATK.cone, a = u.atk && u.atk.tgt, ok = (o, d) => o.alive && o.side !== u.side && V[o.kind] && d < F.range && u.off(o) < c;
    if (a && ok(a, Math.hypot(a.pos.x - u.pos.x, a.pos.z - u.pos.z))) return a;
    let best = null, bd = F.range; for (const o of UNITS) { const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z); if (d < bd && ok(o, d)) { bd = d; best = o; } }   // (the distance first: the angle only for what is in range)
    return best;
  },
  unitFire(u, t, F, pace) {
    _bm.set(u.pos.x, u.pos.y + F.mh, u.pos.z);
    const hit = Math.random() < F.acc, off = hit ? 0.5 : rand(3, 7), a = rand(0, TAU), air = t.kind === 'heli', x = t.pos.x + Math.cos(a) * off, z = t.pos.z + Math.sin(a) * off, y = air ? t.pos.y + rand(-3, 3) : groundH(x, z) + (hit ? t.ah * 0.6 : 0);
    _bd.set(x - _bm.x, y - _bm.y, z - _bm.z); const d = _bd.length() || 1, fl = d / F.v, col = u.side === 'ally' ? 0xffb060 : 0xa8ff8a;
    _bd.multiplyScalar(F.v / d);
    for (let i = 0; i < F.n; i++) { _bt.copy(_bd); if (i) { _bt.x += rand(-6, 6); _bt.y += rand(-4, 4); _bt.z += rand(-6, 6); _bt.multiplyScalar(1 - i * 0.07); } FX.tracers.spawn(_bm, _bt, { life: fl, len: F.len, w: F.w, color: col, glow: TRACER_GLOW.unit }); }
    if (F.flash) FX.flash.spawn(_bm, { s0: F.flash * 2, s1: F.flash * 4, life: 0.12 });
    const dmg = F.dmg * VS[u.kind][t.kind] * (u.side === 'ally' ? ALLY_DPS / ALLY_RATE[u.kind] : ALLY_TOUGH_K(t)) / (pace || 1), side = u.side;
    this.after(fl, () => {
      if (F.blast) hitFx(x, y, z, F.blast, air);
      if (hit && side === 'ally' && t instanceof Vehicle && !this.inPlay(t.pos)) this.stat.spared++;   // (COL_ZONE: no harm out there)
      else if (hit) { hurt(t, dmg); this.stat.uDmg += dmg; }
      if (F.blast >= 1 && Math.random() < 1 / (pace || 1)) for (let i = UNITS.length - 1; i >= 0; i--) { const o = UNITS[i]; if (o.kind === 'inf' && o.side !== side && Math.hypot(o.pos.x - x, o.pos.z - z) < 5) hurt(o, ALLY_TOUGH_K(o)); }   // (at a faster pace, as deadly a second)
    });
  },

  /* ---- the gunship ---- */
  /* where the rounds come from: the gun's barrel in the frame, else its mount on the same side of the fuselage just out of the frame
     (js/guns.js); side: a missile off a pylon, metres to the side under the lens */
  muzzle(out, side) {
    this.barrel = !side && !!GUNS.muzzleAt(ARMS.cur, out, 45); if (this.barrel) return out;
    if (!side) return GUNS.sideAt(ARMS.cur, out, GUN_SIDE_D);
    const e = camera.matrixWorld.elements; return out.copy(camera.position).addScaledVector(_bt.set(e[4], e[5], e[6]), -5.5).addScaledVector(_bt.set(e[0], e[1], e[2]), side);
  },
  /* the target for a weapon: the one it is on while that is alive and in the frame, else the nearest to the frame's centre */
  target(w) {
    const f = this.focus; if (f && f.alive && w.hitSet.has(f.kind) && this.inFrame(f.pos) && this.reach(f) && !this.doomed(f)) return f;
    let best = null, bs = 1e9;
    for (const u of UNITS) { if (!this.canHit(w, u) || this.doomed(u)) continue; const d = Math.hypot(u.pos.x - CAM_TGT.x, u.pos.z - CAM_TGT.z) * (u.kind === 'struct' ? 1.6 : 1); if (d < bs) { bs = d; best = u; } }
    if (best) { this.offT = 0; this.focus = best; } return best;
  },
  /* the damage the gunship's missiles in flight will do to u, as strike() deals it: a homing one's in full, the rest by where they land */
  incoming(u) {
    let s = 0; const S0 = this.lase, fly = u.kind === 'heli' && u.pos.y > groundH(u.pos.x, u.pos.z) + 8;
    for (const m of this.missiles) {
      const G = m.G, w = m.w, S = G.air ? 0 : SPLASH[w.id] || 0, r = Math.max(G.r, S); if (G.cluster || (!w.hitSet.has(u.kind) && !S) || fly !== !!G.air) continue;
      const on = m.tgt === u || (m.laser && S0 && S0.m === m && S0.tgt === u), d = on ? 0 : Math.max(0, Math.hypot(u.pos.x - m.to.x, u.pos.z - m.to.z) - (u.kind === 'struct' ? 3 : u.kind === 'inf' ? 0 : 1.5)); if (d >= (u.kind === 'struct' ? structReach(w, r) : r)) continue;
      const A = ARMOR[w.id]; s += m.dmg * (1 - d / r) * (u.kind === 'inf' ? 3 : 1) * (A && A[u.kind] || 1);
    }
    return s;
  },
  /* a missile on its way will kill it: no other weapon is wasted on it meanwhile (a 105 mm shell gets there first, and one is as dead
     from either), the sensor goes on to the next */
  doomed(u) { return this.missiles.length > 0 && u.hp > 0 && this.incoming(u) >= u.hp; },
  /* an enemy in the frame that weapon w may hit */
  canHit(w, u) { return u.side === 'enemy' && w.hitSet.has(u.kind) && this.inFrame(u.pos) && this.reach(u); },
  /* the target in the frame nearest the reticle other than x (null: none) */
  nearestTo(w, x) {
    let best = null, bs = 1e9;
    for (const u of UNITS) { if (u === x || !this.canHit(w, u) || this.doomed(u)) continue; const n = VIEW.ndc(u.pos), d = Math.hypot(n.x * camera.aspect, n.y); if (d < bs) { bs = d; best = u; } }
    return best;
  },
  onBeat(band, st) {
    if (!ready || !AUD.fighting || paused) return;
    this.unitsOnBeat(band, st, false); AA.onBeat(band, st); this.cookBeat(band, st);
    for (const m of this.missiles) if (m.p > this.cut(m)) m.rush = true;               // what is in flight and near enough lands on this beat (cut)
    this.gunOnBeat(band, st, false);
  },
  /* a song fading out: the share of the gunship's shots it still fires (AUD.fade); a drop's surge at full (the loudness over ~2 s lags behind its return) */
  fadeK() { return T < this.surgeUntil ? 1 : AUD.fade; },
  /* the gunship on a beat: the selected weapon, if the beat suits it (force: a drop, at once) */
  gunOnBeat(band, st, force) {
    if (GUNSHIP.state !== 'orbit' || T < GUNSHIP.settled) return;                     // (flying to another place, or just arrived: the sensor is not on anything yet)
    const w = ARMS.w, f = CFG.fire / 100; if (!w || f <= 0) return;
    force = force || T < this.forceUntil;   // (a drop's shot waits up to 1.5 s for the reticle to come onto a target)
    const fv = force ? 1 : this.fadeK();   // (a song fading out: fewer shots, none at its end; FADE)
    if (fv < 1 && Math.random() > fv) return;
    if (w.band === 'hold') { const t = this.target(w); if (t && this.onReticle(t)) { this.laserUntil = T + (force ? 1.5 : 0.5); if (force) this.forceUntil = 0; } return; }
    if (LOCK_T[w.id]) { const L = this.lock; if (L && L.shootT && T - L.shootT >= LOCK.win[0] && st > 1.2) this.launch(w, L); return; }   // (the AIM-9X and the Hellfire only through their lock: SHOOT, then on a strong beat or LOCK.fire s on)
    const idle = T - this.lastShot, strong = st > 1.45 || (band === 'low' && AUD.heavy > 0.45), any = fv >= 1;
    let ok = w.band === 'strong' ? (strong || (any && band === 'low' && idle > w.reload + 2.5)) : (w.band === band || (any && idle > 1.4 / Math.min(2, f)) || (LIGHT_ARMS.has(w.id) && AUD.drive > 0.6));   // (music with no such beats: any beat will do after a while, not in a fading song; dense music: any beat for the light guns)
    if (AUD.calm && st <= 1.45) ok = false;                                            // (a quiet part: only the strong beats)
    if (!force && (!ok || idle < GUN[w.id].gap || (f < 1 && Math.random() > f))) return;
    const t = this.target(w), k = t ? this.shotAt(w, t) : 0; if (!k || !ARMS.shoot()) return;   // (at what the reticle is on, or a gun's at what it is coming onto)
    this.noteShot(k);
    if (force) this.forceUntil = 0;
    if (ARMS.st[w.id].reload > 0) this.autoTick = Math.min(this.autoTick, T + 0.3);   // (it has to reload: another weapon may take over meanwhile)
    this.lastShot = T; this.shotRT = RT(); this.stat.shots++; this.fire(w, t, st, 1, k > 1 ? this.atP : null);
  },
  /* the lock of the weapon in hand (LOCK_T: the AIM-9X on a helicopter, the Hellfire on the laser's spot on a vehicle) on what it has
     (each step, in a fight); none while a Hellfire is still flying to the spot (the designator is busy: lase) */
  lockStep(dt) {
    const w = ARMS.w, LT = w && LOCK_T[w.id]; let L = this.lock;
    if (!LT || GUNSHIP.state !== 'orbit' || T < GUNSHIP.settled || CFG.fire <= 0 || this.lase) { this.lock = null; return; }
    if (L && L.w !== w.id) L = this.lock = null;
    if (L && L.shootT) { if (!L.t.alive || !this.canHit(w, L.t)) this.lock = null; else if (T >= L.fireT) { const fv = this.fadeK(); if (fv < 1 && Math.random() > fv) L.fireT = T + LOCK.fire; else this.launch(w, L); } return; }   // (SHOOT: the launch is coming; a song fading out: held, tried again LOCK.fire s on)
    const t = this.target(w);
    if (!t || (t.kind === 'heli') !== (w.id === 'aim') || !ARMS.ready(w)) { if (L && (L.k -= dt / LT * 2) <= 0) this.lock = null; return; }
    if (!L || L.t !== t) { L = this.lock = { w: w.id, t, t0: T, k: 0, off: 0, shootT: 0, fireT: 0 }; this.stat.locks++; }
    if (this.onAim(t)) { L.off = 0; L.k = Math.min(1, L.k + dt / LT); }
    else { L.off += dt; L.k = Math.max(0, L.k - dt / LT); if (L.off > LOCK.lose) { this.lock = null; return; } }
    if (L.k >= 1) { L.shootT = T; L.fireT = T + LOCK.fire; }
  },
  launch(w, L) {
    this.lock = null; if (!ARMS.shoot()) return;
    this.lockLog.push({ w: L.w, t0: L.t0, shoot: L.shootT, fire: T }); if (this.lockLog.length > 40) this.lockLog.shift();
    if (ARMS.st[w.id].reload > 0) this.autoTick = Math.min(this.autoTick, T + 0.3);
    this.lastShot = T; this.shotRT = RT(); this.stat.shots++; this.stat.lockShots++; this.fire(w, L.t, 1.6, 1, null);
  },
  /* between the beats: on each point of the grid (the kick's beat split in 2 or 4 by the tempo) the light gun fires a short burst
     unless a shot went within most of a step before (no ammunition taken: the rate is the music's, the store cosmetic) */
  subBeat() {
    const w = ARMS.w, S = w && SUBDIV[w.id]; if (!S || !AUD.beatP || AUD.calm || !AUD.fighting) { this.gridN = -1; return; }
    let n = 1; for (const [t, k] of S) if (AUD.tempo > t) n = k; if (n < 2) { this.gridN = -1; return; }
    const q = AUD.beatP / n, now = RT(), g = Math.floor((now - AUD.kickT) / q); if (g === this.gridN || now - AUD.kickT > AUD.beatP * 2) return;
    const fresh = this.gridN < 0; this.gridN = g; if (fresh) return;   // (just back on the grid: wait for its next point, not fire off it)
    const f = CFG.fire / 100, fv = this.fadeK(); if (GUNSHIP.state !== 'orbit' || T < GUNSHIP.settled || now - this.shotRT < q * 0.6 || !ARMS.ready(w) || (f < 1 && Math.random() > f) || (fv < 1 && Math.random() > fv)) return;   // (a fading song: fewer, FADE)
    const t = this.target(w), k = t ? this.shotAt(w, t) : 0; if (!k) return;
    this.noteShot(k); this.shotRT = now; this.stat.subShots++; this.stat.subOff = Math.max(this.stat.subOff, Math.abs((now - AUD.kickT) - g * q));
    this.fire(w, t, 1.15, 0.5, k > 1 ? this.atP : null);   // (half the damage: faster music, more fire, not a quicker fight)
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
        let s = 0; for (const u of UNITS) if (this.canHit(w, u)) s += (PREF[w.id] && PREF[w.id][u.kind]) || 1;
        if (s > bs) { bs = s; best = w; }
      }
      if (best && best.id !== ARMS.cur) { ARMS.select(best.id); this.focus = null; HUD.markArms(); this.nextSwitch = T + rand(7, 12); }
    }
    this.forceUntil = T + 1.5; this.gunOnBeat('low', 3, true);
  },
  /* is the target under the reticle (RET_ON)? Never a shot off it: one the sensor cannot bring there in OFF_SWITCH s is given up
     for the one nearest the reticle (aimCamera) */
  onReticle(u) { return this.onAim(u); },
  /* is it under the reticle: the frame's centre (at the map's edge the sensor's point stays there too, GUNSHIP.update) */
  onAim(u, r = RET_ON) { const n = VIEW.ndc(u.pos); return Math.hypot(n.x * camera.aspect, n.y) < r; },
  /* near the reticle: a gun may already fire */
  near(u) { return this.onAim(u, RET_NEAR); },
  /* the ground under the reticle: the sensor's point, the frame's centre */
  aimPoint(out) { const L = GUNSHIP.look; return out.set(L.x, groundH(L.x, L.z), L.z); },
  /* where a trigger at t goes: 0 no shot, 1 the target, 2 off it (MISS), 3 under the reticle while the target is only near it;
     2 and 3 put the point in atP */
  shotAt(w, t) {
    if (this.onReticle(t)) {
      const M = MISS[w.id]; if (!M || Math.random() >= M[0]) return 1;
      const a = rand(0, TAU), r = rand(M[1], M[2]), x = t.pos.x + Math.cos(a) * r, z = t.pos.z + Math.sin(a) * r; this.atP.set(x, groundH(x, z), z); return 2;
    }
    if (!NEAR_ARMS.has(w.id) || !this.near(t)) return 0;
    this.aimPoint(this.atP); return 3;
  },
  noteShot(k) { if (k === 2) this.stat.miss++; else if (k === 3) this.stat.near++; },
  /* the camera onto a unit: a little ahead of a moving one, so the slew's lag leaves the reticle on it */
  lookAt(u) {
    this.velOf(u, _bd); const lead = 2 / (SLEW_LOCK * GUNSHIP.slewK) + 0.125; _bp.set(u.pos.x + _bd.x * lead, 0, u.pos.z + _bd.z * lead);
    if (u.pos.y - groundH(u.pos.x, u.pos.z) > 3) { _bp.y = u.pos.y; this.behind(_bp); }   // (one in the air: the ground point behind it on its own line of sight; the line to the frame's centre missed it by 10 m and more)
    GUNSHIP.track(_bp);
  },
  velOf(u, out) {
    if (u.kind === 'inf') { const S = u.scatter; if (!S || T >= S.until) return out.set(0, 0, 0); const dx = S.x - u.pos.x, dz = S.z - u.pos.z, d = Math.hypot(dx, dz); return d < 0.3 ? out.set(0, 0, 0) : out.set(dx / d * SCATTER.v, 0, dz / d * SCATTER.v); }   // (a soldier running from a hit: the sensor leads him)
    const v = u.v || 0, a = u.cv != null ? u.cv : u.yaw || 0; return out.set(Math.cos(a) * v, 0, Math.sin(a) * v);   // (cv: a helicopter's course, sliding sideways)
  },
  /* a trigger pull at t; the beat's strength st sets how many rounds (BURST) and how big the blasts look (not their damage); at: a point
     to put them on instead (a miss, or the ground under the reticle: no lead) */
  fire(w, t, st, dk = 1, at = null) {
    const G = GUN[w.id], A = at && at.clone(); GUNS.shot(w.id);
    if (w.id === 'rail') { this.spent += w.cost; this.rail(w, G, t); return; }
    const k = clamp(((st || 1.5) - 1) / 1.5, 0, 1), B = BURST[w.id], n = B ? Math.round(lerp(B[0], B[1], k)) : G.n, fx = G.fx * (0.85 + 0.35 * k), dmg = G.dmg * G.n / n * dk;   // (a trigger does the same damage, in more or fewer rounds)
    this.lastBurst = n; if (G.missile && w.use > 1) this.pod = { id: w.id, n: 0, of: n };   // (a salvo of n (BURST: 2–6 by the beat): its rockets counted as they go, the HUD's salvo reticle)
    // a gun's burst goes where the sensor points: the point at the trigger (the target, led, or `at`) kept as an offset from the
    // sensor's point, so later rounds follow the reticle, not a target running off under it (a missile flies to its target);
    // once the aircraft is off to another place (a transit) the rest stay on the trigger's point
    const P0 = A || t.pos, fl = G.missile || 0.28; let px = P0.x, pz = P0.z;
    if (!A && !G.missile) { this.velOf(t, _bd); px += _bd.x * fl; pz += _bd.z * fl; }
    let mx = P0.x, mz = P0.z; if (!A && G.cluster) { this.velOf(t, _bd); const L = G.missile + CLUSTER.fall + 4 * (AUD.beatP ? AUD.beatP / 4 : 0.125); mx += _bd.x * L; mz += _bd.z * L; }   // (the CBU-97 has no homing: it opens where a moving target will be once its skeets fire, not where it was at release)
    const ox = px - GUNSHIP.look.x, oz = pz - GUNSHIP.look.z, lx = GUNSHIP.look.x, lz = GUNSHIP.look.z, tx = t.pos.x, tz = t.pos.z;
    for (let i = 0; i < n; i++) this.after(i * G.step, () => {
      if (i && !G.missile && GUNSHIP.state === 'orbit' && Math.hypot(GUNSHIP.look.x - lx - (t.pos.x - tx), GUNSHIP.look.z - lz - (t.pos.z - tz)) > BURST_LET_GO) return;   // (the sensor off to another target, not following this one: the trigger let go, not a line of hits across the ground between them)
      this.spent += w.cost;   // (the money: every round of the burst fired, every rocket of the salvo; none the trigger let go of)
      const a = rand(0, TAU), r = Math.sqrt(Math.random()) * G.spread, c = Math.cos(a) * r, s = Math.sin(a) * r, L = GUNSHIP.state === 'orbit' ? GUNSHIP.look : null;
      const to = G.missile ? new V3(mx + c, 0, mz + s) : L ? new V3(L.x + ox + c, 0, L.z + oz + s) : new V3(px + c, 0, pz + s);
      to.y = G.air ? t.pos.y + t.ah : groundH(to.x, to.z) + (G.cluster ? CLUSTER.open : 0);
      if (G.missile) { if (this.pod && this.pod.id === w.id) this.pod.n++; this.missiles.push({ w, G, tgt: G.spread < 2 && !A ? t : null, from: this.muzzle(new V3(), rand(-1, 1) > 0 ? rand(8, 14) : rand(-14, -8)).addScaledVector(_bt.set(camera.matrixWorld.elements[4], camera.matrixWorld.elements[5], camera.matrixWorld.elements[6]), -3), to, p: 0, t: 0, dur: G.missile, rush: false, puff: 0, fx, dmg, laser: w.id === 'hf' });
        if (w.id === 'hf') { this.lase = { tgt: t, p: t.pos.clone(), m: this.missiles[this.missiles.length - 1] }; this.stat.lased++; }   // (the designator holds the spot on it until the hit)
        return; }
      this.muzzle(_bm); _bt.subVectors(to, _bm); const d = _bt.length();
      FX.tracers.spawn(_bm, _bt.multiplyScalar(1 / fl), { life: fl, len: G.tl, w: G.tw, color: 0xffc070, glow: TRACER_GLOW.gun });
      FX.tracers.spawn(_bm, _bt, this.barrel ? { life: 0.08, len: 45, w: G.tw * 2.5, color: 0xffd090 } : { life: 0.06, len: 20, w: G.tw * 1.3, color: 0xffd090 });   // (out of the barrel in the frame, or in from its edge: a streak back to the muzzle for the first frames)
      this.after(fl, () => { hitFx(to.x, to.y, to.z, fx); this.strike(to, G.r, dmg, w, false); });
    });
  },
  /* how far along its way a missile or a bomb waits for a beat and makes for it on one: about a beat of its own flight short of the
     end (the faster the music and the slower it flies, the nearer the ground: a bomb no longer hangs high, then drops at 6x) */
  cut(m) { return clamp(1 - (AUD.beatP || 0.5) / m.dur, CUT[0], CUT[1]); },
  flyMissiles(dt) {
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i], G = m.G; m.t += dt;
      const S = this.lase;
      if (m.laser) { if (S && S.m === m) { if (S.tgt.alive) S.p.copy(S.tgt.pos); m.to.copy(S.p); } }   // (a Hellfire: to the laser's spot, where the sensor holds it; its target dead meanwhile: the spot stays where it was)
      else if (m.tgt && m.tgt.alive) { m.to.copy(m.tgt.pos); m.to.y += G.air ? m.tgt.ah : 0; }
      if (m.t > m.dur * 1.5) m.rush = true;                                         // (no beat came: the deadline)
      m.p += dt / m.dur * (m.rush ? 6 : m.p < this.cut(m) ? 1 : 0.25);   // (past its cut it waits for a beat, then makes for it)
      if (m.p >= 1 && G.cluster) { this.missiles.splice(i, 1); this.cluster(m.to, m.w); continue; }
      if (m.p >= 1) { this.missiles.splice(i, 1); if (S && S.m === m) this.lase = null; hitFx(m.to.x, m.to.y, m.to.z, m.fx, G.air); this.strike(m.to, G.r, m.dmg, m.w, G.air); continue; }
      _bp.lerpVectors(m.from, m.to, m.p); missileFx(m, _bp, _bd.subVectors(m.to, m.from).normalize(), { s: MISSILE_S[m.w.id] || 1, motor: !G.bomb });
    }
  },
  /* the CBU-97's canister opens at p (CLUSTER): its submunitions spread out and down, and fire their skeets one a sixteenth */
  cluster(p, w) {
    const C = CLUSTER, ax0 = p.x - camera.position.x, az0 = p.z - camera.position.z, an = Math.hypot(ax0, az0) || 1, ax = ax0 / an, az = az0 / an;
    FX.flash.spawn(p, { s0: 5, s1: 12, life: 0.16 }); FX.smoke.spawn(p, { s0: 2, s1: 7, life: 1.6, a0: 0.4, color: 0xc8c8c0, v: _wv.set(0, -1, 0), drag: 1 }); this.stat.clusters++;
    const subs = CLUSTER_PAT.map(([s, t]) => { const x = p.x + (ax * s - az * t) * C.r + rand(-1, 1), z = p.z + (az * s + ax * t) * C.r + rand(-1, 1); return { from: p.clone(), p: p.clone(), at: new V3(x, groundH(x, z) + C.hover, z), t: 0, spin: rand(0, TAU), fired: 0 }; });
    this.subs.push(...subs);
    const q = AUD.beatP ? AUD.beatP / 4 : 0.125, ph = AUD.beatP ? (((RT() + C.fall - AUD.kickT) % q) + q) % q : 0, d0 = C.fall + (q - ph) % q, hit = new Map();   // (the first on the grid once they are down; hit: what each vehicle has coming)
    subs.forEach((s, i) => this.after(d0 + i * q, () => this.skeets(s, hit, w)));
  },
  /* a submunition fires its skeets down: each at the nearest enemy vehicle in reach not yet done for, else into the ground */
  skeets(s, hit, w) {
    const C = CLUSTER; s.fired = T; this.stat.cluSalvo.push(RT()); if (this.stat.cluSalvo.length > 40) this.stat.cluSalvo.shift();
    for (let k = 0; k < C.skeets; k++) {
      this.stat.skeets++; let best = null, bd = C.seek;
      for (const u of UNITS) { if (u.side !== 'enemy' || !u.alive || u.kind === 'inf' || !w.hitSet.has(u.kind) || (hit.get(u) || 0) >= u.hp) continue; const d = Math.hypot(u.pos.x - s.at.x, u.pos.z - s.at.z); if (d < bd) { bd = d; best = u; } }
      const to = best ? _bp.set(best.pos.x, best.pos.y + best.ah * 0.8, best.pos.z) : _bp.set(s.at.x + rand(-4, 4), 0, s.at.z + rand(-4, 4)); if (!best) to.y = groundH(to.x, to.z);
      FX.tracers.spawn(s.p, _bd.subVectors(to, s.p).multiplyScalar(1 / 0.06), { life: 0.06, len: 7, w: 0.32, color: 0xfff0c0, glow: TRACER_GLOW.unit });   // (the slug of molten copper, down)
      const x = to.x, y = to.y, z = to.z;
      if (best) { hit.set(best, (hit.get(best) || 0) + C.dmg); this.stat.skeetHits++; const v = best; this.after(0.06, () => { hitFx(x, y, z, 0.7); hit.set(v, hit.get(v) - C.dmg); if (v.alive) { this.note(w, v); hurt(v, C.dmg); } }); }   // (hit: the damage still on its way; once it lands it is in hp)
      else this.after(0.06, () => { hitFx(x, y, z, 0.45); for (let i = UNITS.length - 1; i >= 0; i--) { const u = UNITS[i]; if (u.side === 'enemy' && u.kind === 'inf' && u.alive && Math.hypot(u.pos.x - x, u.pos.z - z) < C.frag.r) { this.note(w, u); hurt(u, C.frag.dmg); } } });
    }
    FX.flash.spawn(s.p, { s0: 1.2, s1: 2.4, life: 0.06, color: 0xfff4e0 });
    const g = new V3(s.at.x, s.at.y - C.hover, s.at.z); this.scare(g, C.frag.r, 'enemy'); this.scatterNear(g);
  },
  /* the submunitions on their chutes: out and down from the canister, easing in, then drifting down a little as they spin */
  flySubs(dt) {
    const C = CLUSTER;
    for (let i = this.subs.length - 1; i >= 0; i--) {
      const s = this.subs[i]; s.t += dt; const k = Math.min(1, s.t / C.fall), e = 1 - (1 - k) * (1 - k);
      s.p.lerpVectors(s.from, s.at, e); if (k >= 1) s.p.y = s.at.y - Math.min(4, (s.t - C.fall) * 1.5);
      s.spin += dt * 14; _bd.set(Math.cos(s.spin) * 0.3, -1, Math.sin(s.spin) * 0.3).normalize(); FX.bodies.add(s.p, _bd, C.sub);
      if (s.fired && T - s.fired > 0.35) this.subs.splice(i, 1);
    }
  },
  /* the damage of a hit at p: every enemy the weapon is allowed to hit within r, falling off with the distance */
  strike(p, r, dmg, w, air) {
    const S = air ? 0 : SPLASH[w.id] || 0; r = Math.max(r, S);   // (a blast: every enemy on the ground within its radius, of any kind)
    for (let i = UNITS.length - 1; i >= 0; i--) {
      const u = UNITS[i], aimed = w.hitSet.has(u.kind); if (u.side !== 'enemy' || (!aimed && !S)) continue;
      const fly = u.kind === 'heli' && u.pos.y > groundH(u.pos.x, u.pos.z) + 8; if (fly !== !!air) continue;
      const d = Math.max(0, Math.hypot(u.pos.x - p.x, u.pos.z - p.z, air ? u.pos.y - p.y : 0) - (u.kind === 'struct' ? 3 : u.kind === 'inf' ? 0 : 1.5)); if (d >= (u.kind === 'struct' ? structReach(w, r) : r)) continue;   // (a structure: only what lands on it, STRUCT_REACH)
      if (aimed) this.note(w, u); else this.stat.splash++;   // (the weapon's log keeps to its table: what it was fired at)
      const A = ARMOR[w.id]; hurt(u, dmg * (1 - d / r) * (u.kind === 'inf' ? 3 : 1) * (A && A[u.kind] || 1));
      const ri = aimed && u.alive && RICO[w.id] && RICO[w.id][u.kind]; if (ri && Math.random() < ri) this.ricochet(u);
    }
    if (!air) { this.scare(p, r, 'enemy'); this.scatterNear(p); }
  },
  /* infantry of a side under fire at p (a blast of radius r): who is close runs from it (SCATTER), his squad spreads out */
  scare(p, r, side) {
    const R = Math.max(SCATTER.r0, SCATTER.k * r);
    for (const q of this.squads) {
      if (q.side !== side || q.flee || !q.m.length) continue; let hit = false;
      for (const s of q.m) { const d = Math.hypot(s.position.x - p.x, s.position.z - p.z); if (d < R && s.alive && this.scatter(s, p, d)) hit = true; }
      if (hit) q.spreadUntil = T + SCATTER.spread;
    }
  },
  /* one soldier off to a walkable spot 8–16 m away from p (the way away from it, give or take 60°) */
  scatter(s, p, d) {
    if (T < (s.scareT || 0)) return false;   // (running, or just stopped)
    const away = d > 0.5 ? Math.atan2(s.position.z - p.z, s.position.x - p.x) : rand(0, TAU);
    for (let t = 0; t < 6; t++) {
      const a = away + rand(-1.05, 1.05), r = rand(...SCATTER.d) * (1 - t * 0.12), x = s.position.x + Math.cos(a) * r, z = s.position.z + Math.sin(a) * r;
      if (!walkable(s.position.x, s.position.z, x, z)) continue;
      const dur = rand(...SCATTER.t); s.scatter = { x, z, ox: s.position.x, oz: s.position.z, until: T + dur }; s.scareT = T + dur + SCATTER.rest; s.cool = Math.max(s.cool, dur + rand(0.3, 1)); s.ready = 0; this.stat.scatter++; return true;
    }
    return false;
  },
  /* a round of a light gun glancing off armour: a spark and one to three bright streaks bouncing up and away */
  ricochet(u) {
    if (this.ricoN >= RICO_MAX) return; this.ricoN++; this.stat.ricochet++;
    const p = new V3(u.pos.x + rand(-1, 1), u.pos.y + u.ah * rand(0.4, 0.9), u.pos.z + rand(-1, 1)); _bd.subVectors(p, camera.position).normalize();
    FX.flash.spawn(p, { s0: 1.4, s1: 2.6, life: 0.05, color: 0xfff4e0 });
    for (let i = 0, n = randi(1, 3); i < n; i++) { _bt.set(_bd.x + rand(-0.7, 0.7), Math.abs(_bd.y) * 0.5 + rand(0.3, 1), _bd.z + rand(-0.7, 0.7)).normalize().multiplyScalar(rand(45, 90)); FX.tracers.spawn(p, _bt, { life: rand(0.15, 0.35), len: rand(2, 4), w: 0.12, color: 0xfff0c8, grav: 9.8 }); }
  },
  /* ---- a knocked-out vehicle cooking off: its pops wait for strong beats ---- */
  cookOff(v) {
    const n = v.kind === 'car' ? (Math.random() < 0.5 ? COOK.car : 0) : COOK[v.kind] || 0; if (!n || !AUD.fighting) return;
    this.cooks.push({ v, pos: v.pos, n, next: T + COOK.first, late: T + COOK.first + COOK.late });
  },
  cookBeat(band, st) { if (AUD.calm || !(st > 1.45 || band === 'low')) return; for (let i = this.cooks.length - 1; i >= 0; i--) if (T >= this.cooks[i].next) { this.stat.cookBeat = (this.stat.cookBeat || 0) + 1; this.pop(i); } },
  pop(i) {
    const c = this.cooks[i], k = c.v.kind === 'tank' ? 1 : c.v.kind === 'apc' ? 0.8 : 0.6, p = c.pos; c.n--; this.stat.cooks++;
    blast(p, rand(0.5, 1) * k);
    _bp.set(p.x, groundH(p.x, p.z) + 1.6, p.z);
    for (let j = 0, n = randi(6, 10); j < n; j++) FX.tracers.spawn(_bp, _bd.set(rand(-9, 9), rand(14, 32), rand(-9, 9)), { life: rand(0.5, 1), len: rand(1.5, 3), w: 0.14, color: 0xffd890, grav: 22 });   // (rounds and sparks thrown up)
    for (let j = 0; j < 3; j++) FX.smoke.spawn(_bp, { s0: 3 * k, s1: rand(9, 14) * k, life: rand(3, 5), a0: 0.55, color: 0x161412, rise: 0.8, v: _bd.set(rand(-1, 1) + WIND.x, rand(4, 8), rand(-1, 1) + WIND.z), drag: 0.6 });
    if (!c.n) { this.cooks.splice(i, 1); const t = c.v.turret; if (t && c.v.kind === 'tank' && Math.random() < COOK.toss) { this.stat.tosses++; this.tosses.push({ t, y0: t.position.y, x0: t.position.x, r0: t.rotation.clone(), a: 0, vy: rand(11, 13), sx: rand(-1.5, 1.5), spin: [rand(-4, 4), rand(-3, 3), rand(-4, 4)] }); } return; }
    c.next = T + COOK.gap; c.late = T + COOK.gap + COOK.late;
  },
  /* the pops past their deadline (no strong beat came); a tank's turret thrown up by the last one: up and down in about a second, it
     lands askew on the hull (in the wreck's own frame: it is scaled by ARMOR_SCALE) */
  cookUpdate(dt) {
    for (let i = this.cooks.length - 1; i >= 0; i--) if (T >= this.cooks[i].late) this.pop(i);
    for (let i = this.tosses.length - 1; i >= 0; i--) {
      const q = this.tosses[i]; q.a += dt; const h = q.vy * q.a - 10 * q.a * q.a, f = Math.min(1, q.a / (q.vy / 10));
      q.t.position.y = q.y0 + Math.max(0, h) / ARMOR_SCALE; q.t.position.x = q.x0 + q.sx * f / ARMOR_SCALE;
      q.t.rotation.set(q.r0.x + q.spin[0] * q.a * 0.25, q.r0.y + q.spin[1] * q.a, q.r0.z + q.spin[2] * q.a * 0.25);
      if (h < 0) { q.t.position.y = q.y0 + 0.02; this.tosses.splice(i, 1); }
    }
  },
  /* a blast at p of a unit's weapon (side: who fired): every unit of the other side on the ground within r */
  splashAt(p, r, dmg, side) {
    for (let i = UNITS.length - 1; i >= 0; i--) {
      const u = UNITS[i]; if (u.side === side || !u.alive || (u.kind === 'heli' && u.pos.y > groundH(u.pos.x, u.pos.z) + 8)) continue;
      const d = Math.max(0, Math.hypot(u.pos.x - p.x, u.pos.z - p.z) - (u.kind === 'struct' ? 3 : u.kind === 'inf' ? 0 : 1.5)); if (d >= (u.kind === 'struct' ? Math.min(r, 4) : r)) continue;
      if (u.col) u.col.alarm = T + 20; this.stat.splash++; hurt(u, dmg * (1 - d / r) * (u.kind === 'inf' ? 3 : 1) * ALLY_TOUGH_K(u));
    }
    this.scare(p, r, side === 'ally' ? 'enemy' : 'ally');
  },
  /* a helicopter's salvo at t (js/units.js, Heli.rockets): rockets from its pods, one side then the other, then `reload` s */
  salvo(h, t) {
    if (!h.arm) return false; h.arm = null;
    if (!h.lined(t)) return false;   // (killed, or turned off it, since it lined up: the pods keep their rockets)
    h.rkT = T + rand(...HELI_ATK.reload);
    if (!VIEW.near(h.pos, FIRE_NEAR) && !VIEW.near(t.pos, FIRE_NEAR)) { this.stat.quiet++; return false; }   // (FIRE_NEAR: out there nobody fires, as the units' guns)
    this.stat.salvos++;
    const dmg = ROCKET.dmg * (h.side === 'ally' ? ROCKET.ally : 1), side = h.side, tx = t.pos.x, tz = t.pos.z;
    for (let i = 0; i < ROCKET.n; i++) this.after(i * ROCKET.step, () => {
      if (!h.alive) return;
      const c = Math.cos(h.yaw), s = Math.sin(h.yaw), sd = i % 2 ? 1.6 : -1.6, from = new V3(h.pos.x - s * sd, h.pos.y - 1, h.pos.z + c * sd);
      const a = rand(0, TAU), rr = Math.sqrt(Math.random()) * ROCKET.spread, along = rand(-5, 5), to = new V3(tx + Math.cos(a) * rr + c * along, 0, tz + Math.sin(a) * rr + s * along); to.y = groundH(to.x, to.z);
      const len = from.distanceTo(to), dur = len / ROCKET.v; this.rockets.push({ from, to, t: 0, dur, len, side, dmg, trail: 2 });
      FX.tracers.spawn(from, _bd.subVectors(to, from).multiplyScalar(1 / dur), { life: dur, len: 7, w: 0.32, color: 0xffe0a0 });   // (the motor's glare, flying itself)
      FX.flash.spawn(from, { s0: 2.2, s1: 4.5, life: 0.09 }); FX.smoke.spawn(from, { s0: 1.5, s1: 5, life: 1.2, a0: 0.35, color: 0xd8d8d8 });
    });
    return true;
  },
  /* a soldier's rocket at a vehicle (RPG): led at where it will be, a hit or a miss decided as it leaves */
  rpg(u, t) {
    u.rpgT = T + rand(...RPG.reload); this.stat.rpg = (this.stat.rpg || 0) + 1;
    const from = new V3(u.pos.x, u.pos.y + 1.5, u.pos.z), dur0 = Math.hypot(t.pos.x - from.x, t.pos.z - from.z) / RPG.v; this.velOf(t, _bd);
    const hit = Math.random() < RPG.acc, a = rand(0, TAU), off = hit ? 0 : rand(3, 7), to = new V3(t.pos.x + _bd.x * dur0 + Math.cos(a) * off, 0, t.pos.z + _bd.z * dur0 + Math.sin(a) * off);
    to.y = hit ? t.pos.y + t.ah * 0.5 : groundH(to.x, to.z); u.a = Math.atan2(to.z - from.z, to.x - from.x);   // (he turns to it)
    const len = from.distanceTo(to); this.rockets.push({ from, to, t: 0, dur: len / RPG.v, len, side: u.side, rpg: true, tgt: hit ? t : null, dmg: RPG.dmg[t.kind] * (u.side === 'ally' ? 1 : ALLY_TOUGH_K(t)) });
    FX.flash.spawn(from, { s0: 1.2, s1: 2.6, life: 0.08 }); FX.smoke.spawn(from, { s0: 1, s1: 4, life: 1.4, a0: 0.4, color: 0xd8d8d0, v: _bp.set(-Math.cos(u.a) * 4, 0.5, -Math.sin(u.a) * 4) });   // (the backblast)
  },
  flyRockets(dt) {
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const m = this.rockets[i]; m.t += dt; const q = m.t / m.dur;
      if (m.rpg) {
        if (m.tgt && m.tgt.alive) { m.to.set(m.tgt.pos.x, m.tgt.pos.y + m.tgt.ah * 0.5, m.tgt.pos.z); m.len = m.from.distanceTo(m.to); }   // (a hit: it lands on it, wherever it has got to)
        if (q >= 1) { this.rockets.splice(i, 1); hitFx(m.to.x, m.to.y, m.to.z, RPG.fx);
          if (m.tgt && m.tgt.alive) { const sp = m.side === 'ally' && !this.inPlay(m.tgt.pos); if (sp) this.stat.spared++; else { hurt(m.tgt, m.dmg); this.stat.rpgHits = (this.stat.rpgHits || 0) + 1; /* (no alarm: that is the gunship's fire, the column running and weaving) */ } }   // (COL_ZONE: no harm out there, as the allies' other fire)
          this.scare(m.to, 3, m.side === 'ally' ? 'enemy' : 'ally'); continue; }
        _bp.lerpVectors(m.from, m.to, q); missileFx(m, _bp, _bd.subVectors(m.to, m.from).normalize(), { s: RPG.s }); continue;
      }
      if (q >= 1) { this.rockets.splice(i, 1); hitFx(m.to.x, m.to.y, m.to.z, ROCKET.fx); if (m.side === 'ally' && !this.inPlay(m.to)) this.stat.spared++; else this.splashAt(m.to, ROCKET.r, m.dmg, m.side); continue; }   // (COL_ZONE: the allies' fire does no harm out there)
      for (; m.trail < m.len * q; m.trail += ROCKET.puff) { _bp.lerpVectors(m.from, m.to, m.trail / m.len); FX.smoke.spawn(_bp, { s0: 1.2, s1: 4, life: rand(1, 1.6), a0: 0.34, color: 0xd8d8d8 }); }   // (a trail of puffs every few metres, whatever the frame rate)
    }
  },
  note(w, u) { if (u.col) u.col.alarm = T + 20; this.log.push(w.id + ' ' + u.kind); if (this.log.length > 600) this.log.shift(); },
  /* the laser: a beam kept up by the beats, burning its target */
  laser(dt) {
    const w = ARMS.w; let t = w && w.band === 'hold' && T < this.laserUntil && AUD.fighting && GUNSHIP.state === 'orbit' ? this.target(w) : null; if (t && !this.onReticle(t)) t = null;
    this.beam.visible = this.beamGlow.visible = !!t; if (!t) return; this.spent += w.cost * dt;
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
    const S = this.lase; if (S && GUNSHIP.state === 'orbit') { if (S.tgt.alive) { this.focus = S.tgt; this.lookAt(S.tgt); } return; }   // (a Hellfire on its way: the laser stays on its target until the hit)
    if ((this.fTick -= dt) > 0) { if (this.focus && this.focus.alive && GUNSHIP.state === 'orbit') this.lookAt(this.focus); return; }
    this.fTick = 0.4; if (GUNSHIP.state === 'transit') { this.offT = 0; this.focus = this.chase = null; return; }
    const w0 = ARMS.w;   // a weapon picked by hand: the auto-switching takes over again after 30 s, or 3 s after the click once nothing it may hit is left round here
    if (CFG.autoArms && T < this.manualUntil && T > this.manualUntil - 27 && w0 && !UNITS.some(u => u.alive && u.side === 'enemy' && w0.hitSet.has(u.kind) && Math.hypot(u.pos.x - GUNSHIP.look.x, u.pos.z - GUNSHIP.look.z) < 250)) { this.manualUntil = 0; this.autoTick = 0; }
    const man = !CFG.autoArms || T < this.manualUntil; let here = null, dm = null;
    for (const u of UNITS) if (u.side === 'enemy' && this.inFrame(u.pos) && this.reach(u)) { if (!this.doomed(u)) here = here || u; else dm = dm || u; }   // (never away from enemies still in the frame; dm: one a missile is on its way to)
    // away from the zone only when the gunship may leave it (a quiet part, past its stay and its timer) and no enemy is in the frame
    const go = !here && !dm && GUNSHIP.mayLeave(this.dry());
    if (this.wantGo && go) { const d = this.wantGo; this.wantGo = null; this.focus = null; GUNSHIP.goTo(d); return; }
    if (go && !man) {   // to another fight: the base, or one out in the country
      const c = this.spots.filter(s => this.hot(s, 160) && UNITS.some(u => u.side === 'ally' && Math.hypot(u.pos.x - s.x, u.pos.z - s.z) < 130)); if (this.base && this.hot(this.base, 120)) c.push(this.base);   // (only where both sides already are)
      const far = c.filter(s => Math.hypot(s.x - GUNSHIP.look.x, s.z - GUNSHIP.look.z) > ZONE.r); if (far.length) { const s = pick(far); this.focus = null; GUNSHIP.goTo({ n: 'tgt', x: s.x, z: s.z }); return; }
    }
    const w = ARMS.w, f = w ? this.target(w) : null;
    let t = f; if (f && this.offT > OFF_SWITCH) { const g = this.nearestTo(w, f); if (g) { this.focus = t = g; this.offT = 0; this.stat.refocus++; } }   // (it got away from the reticle: the one nearest it now)
    if (t) { this.chase = null; this.seekT = T + 0.8; this.lookAt(t); this.offT = this.onAim(t) ? 0 : this.offT + 0.4; return; }
    if (dm) { this.focus = dm; this.offT = 0; this.chase = null; this.lookAt(dm); return; }   // (nothing else for the weapon in hand here: the sensor follows the missile's target to the hit, every frame as its focus; target() skips it)
    this.focus = null; this.offT = 0; if (T < this.seekT) { if (this.chase && this.chase.alive) this.lookAt(this.chase); return; }   // (on the way to the next one: it is followed)
    this.chase = null;
    if (here && !man) {   // enemies here that no enabled weapon may hit: the sensor stays on them and the allies are called in to finish them
      this.lookAt(here);
      if (!this.waitT) { this.waitT = T + 40; if (!this.backed(here.pos)) this.columnTo('ally', this.toPlace(here.pos.x, here.pos.z), pick(QRF_TYPES)); }
      if (T < this.waitT) return;
    } else this.waitT = 0;
    const en = man && w ? [w] : ARMS.enabled(); let best = null, bd = 1e9;   // (a weapon chosen by hand: to what it can hit)
    for (const u of UNITS) { if (u.side !== 'enemy' || !en.some(q => q.hitSet.has(u.kind)) || !this.reach(u) || this.doomed(u)) continue; let d = Math.hypot(u.pos.x - GUNSHIP.look.x, u.pos.z - GUNSHIP.look.z); const ad = this.allyD(u.pos); if (ad < MIXED.r) d *= MIXED.k; else if (ad < 80) d *= 0.25; else if (d * 0.4 < bd && this.backed(u.pos)) d *= 0.4; if (d < bd) { bd = d; best = u; } }   // (rather where the allies are in the frame with them (MIXED), then where they are near; backed() only for one that could win)
    if (best) bd = Math.hypot(best.pos.x - GUNSHIP.look.x, best.pos.z - GUNSHIP.look.z);
    if (best && !this.backed(best.pos) && T > this.nextCall) { this.nextCall = T + 25; this.columnTo('ally', this.toPlace(best.pos.x, best.pos.z), pick(QRF_TYPES)); }   // (nobody of ours there: a column is called in)
    if (!best) { if (man) this.manualUntil = 0; return; }   // (nothing anywhere for the chosen weapon: the auto-switching takes over)
    this.seekT = T + (man ? 2.5 : 5);
    if (bd < ZONE.r) { this.lookAt(best); this.chase = best; } else if (!GUNSHIP.mayLeave(this.dry())) this.rush(); else GUNSHIP.goTo(VIEW.clampIn({ n: 'tgt', x: best.pos.x, z: best.pos.z }));
  },
  /* the auto-switching: the enabled weapon that suits what is in the frame and how heavy the music is */
  autoArm() {
    if (!CFG.autoArms || T < this.manualUntil || T < this.autoTick || this.lock || this.lase) return;   // (never in the middle of a lock, nor with a Hellfire on its way)
    const P = this.pod; if (P && P.id === ARMS.cur && P.n < P.of) return;   // (nor mid-salvo: its rockets ripple off for up to 1.25 s, the pod's marks with them; pending ones are not yet `incoming`)
    this.autoTick = T + 1;
    const w0 = ARMS.w, s0 = w0 && ARMS.st[w0.id], hop = w0 && w0.mag && s0.reload > Math.max(RELOAD_HOP, 2 * (AUD.beatP || 0.5));   // (the weapon in hand reloads for a while: one that is ready fires meanwhile)
    const cnt = {}; let any = false; for (const u of UNITS) if (u.side === 'enemy' && this.inFrame(u.pos) && this.reach(u) && !this.doomed(u)) { cnt[u.kind] = (cnt[u.kind] || 0) + 1; any = true; }
    if (!any) return;
    let best = null, bs = 0, cur = 0, alt = null, as = 0;   // (switching at once if the one in hand has nothing to do here, else after its dwell)
    for (const w of ARMS.enabled()) {
      let s = 0; for (const k of w.hitSet) if (cnt[k]) s += Math.min(4, cnt[k]) * ((PREF[w.id] && PREF[w.id][k]) || 1);
      s *= (HEAVY_ARMS.has(w.id) ? 0.6 + 0.8 * AUD.heavy : 1.2 - 0.4 * AUD.heavy) * (ARMS.ready(w) ? 1 : 0.5);
      if (w.id === ARMS.cur) cur = s; if (s > bs) { bs = s; best = w; }
      if (w.id !== ARMS.cur && ARMS.ready(w) && s > as) { as = s; alt = w; }
    }
    if (hop && alt) { ARMS.select(alt.id); this.focus = null; HUD.markArms(); this.stat.hops++; this.nextSwitch = T + s0.reload + rand(0.5, 2); return; }   // (the reloaded one may win it back soon after)
    if (best && best.id !== ARMS.cur && (cur === 0 || (T > this.nextSwitch && bs > cur * 1.2))) { ARMS.select(best.id); this.focus = null; HUD.markArms(); this.nextSwitch = T + rand(7, 12); }
  },

  update(dt) {
    updateArming();
    const war = AUD.combat, fight = AUD.fighting;
    if (war && !this.was) this.start();
    if (!war && this.was) this.standDown();
    this.was = war;
    const now = RT(); this.silent = AUD.active ? now - AUD.lastActive : this.silent + clamp(now - (this.silentRT || now), 0, 0.5); this.silentRT = now;   // (silence counted only while running: a paused wallpaper, music on, is no silence)
    if (this.spent && this.silent > COST_RESET) this.spent = 0;   // (the mission is over: the next one's cost from 0; the HUD rolls it down, HUD.spentAt)
    for (let i = this.pend.length - 1; i >= 0; i--) if (T >= this.pend[i].t) { const p = this.pend[i]; this.pend.splice(i, 1); p.fn(); }
    this.ricoN = 0; this.puffN = 0; this.flyMissiles(dt); this.flySubs(dt); this.flyRockets(dt); this.laser(dt); this.subBeat(); this.cookUpdate(dt);
    for (let i = UNITS.length - 1; i >= 0; i--) this.think(UNITS[i], dt, fight);
    for (let i = this.cols.length - 1; i >= 0; i--) {
      const E = this.cols[i], c = E.col;
      if (!c.u.length) { this.cols.splice(i, 1); continue; }
      if (!E.retreat) {   // under the gunship's fire a column does not stand still: it drives on, and from where it was halted, off down the road
        const lead = c.u[0], moving = E.move && c.path.L - lead.s > 3; if (!moving) E.move = false;
        if (E.scatHold && moving) { E.slowT = lead.v < 0.5 ? (E.slowT || 0) + dt : 0; if (E.slowT > 2 && (E.rescat || 0) < 3) { E.slowT = 0; E.rescat = (E.rescat || 0) + 1; if (this.spread(E, this.scatSpot(E.scatP), 140, (F, v) => this.scatGo(F, v, E.scatP), { clear: true, here: true })) this.stat.rescat++; } }   // (stuck on its dash behind a wreck or another vehicle: off another way, from where it stands)
        if (E.scatHold && !moving) { E.scat = T + E.scatHold; E.scatHold = 0; lead.dashUntil = 0; }   // (scattered: the hold starts once it is there, the dash over)
        const scat = E.scat > T, run = c.alarm > T && !scat;
        if (E.wasScat && !scat && !E.scatHold) { E.wasScat = false; if (!run) this.retask(E); }   // (held long enough: off at once, alone)   // (scat: scattered, holding where it got to; move: on its own way off the road, a fight or not)
        if (E.assault && (!E.assault.tgt.alive || T - E.assault.t > OFFROAD.assaultT || run)) E.assault = null;
        if (!E.ally && !run && !E.hold && !E.assault && !scat && !moving && T > (E.asT || 0)) { E.asT = T + rand(...OFFROAD.every); if (!this.slow()) this.assault(E); }
        if (!run && !E.hold && !E.dep && !moving && !scat && !E.assault && c.engaged && VIEW.near(lead.pos, 0) && (occAt(lead.pos.x, lead.pos.z) & OCC_ROAD)) this.deploy(E);
        if (run && T > (E.weave || 0)) { E.weave = T + rand(1.8, 2.6); for (const v of c.u) if (v.v > 2) { v.laneT = (v.laneK > 0 ? -1 : 1) * rand(1.5, 2.1); v.weaveUntil = T + 2.8; } }   // (under fire: they weave across the road, kerb to kerb)
        if (!E.ally && !run && !E.hold && !E.assault && !moving && !scat && T > (E.steerT || 0)) { E.steerT = T + rand(6, 10); if (!this.slow()) this.steer(E); }   // (not one on its own errand across a field)   // (very slow music fights group by group, with breaks: none sent on then)
        if (run && c.done && T > (E.runT || 0)) { E.hold = false; E.runT = T + 2; for (let k = 0; k < 6; k++) { const n = randi(0, ROADNET.n - 1); if (Math.hypot(ROADNET.X[n] - c.u[0].pos.x, ROADNET.Z[n] - c.u[0].pos.z) > 300 && c.reroute(n)) break; } }   // (no way found: tried again in 2 s, not every step)
        if (c.done && !c.engaged && !E.hold && !run && !scat) { if (!E.idle) E.idle = T + rand(8, 15); else if (T > E.idle) { E.idle = 0; this.retask(E); } } else E.idle = 0;   // (arrived and nothing to do: on to the next fight)
        c.update(dt, run || moving || (!E.hold && !(c.engaged && this.inPlay(lead.pos)))); continue;
      }
      c.update(dt, true);
      for (const v of c.u.slice()) if (!VIEW.onScreen(v.pos, 0.3)) { this.seen('out', v.pos); v.remove(); }
      if (c.u.length && c.done) this.retreatCol(E);
    }
    for (let i = this.squads.length - 1; i >= 0; i--) { const s = this.squads[i]; s.update(dt); if (!s.m.length) this.squads.splice(i, 1); }
    for (let i = this.helis.length - 1; i >= 0; i--) { const h = this.helis[i]; h.update(dt); if (h.out) this.helis.splice(i, 1); }
    WRECKS.update(dt);
    if (fight) { this.waves(); this.aimCamera(dt); this.autoArm(); this.lockStep(dt); } else { this.focus = this.chase = null; this.lock = null; }
    // the base: wrecked, it is left as a ruin and another is built elsewhere; a ruin, or the base after the fight, goes once out of sight
    const B = this.base;
    if (B && war && !B.parts.some(p => p.alive)) { this.ruins.push(B); this.base = null; this.nextBase = T + rand(12, 20); B.site.restUntil = T + 300; }   // (no base on that site again for five minutes)
    else if (B && !war && T > this.downT + 3 && !this.baseSeen(B)) this.removeBase(B);
    else if (!B && fight && T > this.nextBase && GUNSHIP.state !== 'transit') { const s = this.pickSite(); if (s) { this.buildBase(s); this.wantGo = { n: 'obj', x: s.x, z: s.z }; } else this.nextBase = T + 5; }
    for (const R of this.ruins.slice()) if (!this.baseSeen(R)) this.removeBase(R);
  }
};
