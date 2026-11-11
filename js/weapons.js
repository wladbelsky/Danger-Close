'use strict';
/* ===== The gunship's weapons: what each is, its zoom and reticle, its cosmetic ammunition (the firing itself comes in stage 6) =====
   zoom: a factor on the zoom setting while it is selected; mag / reload: rounds between reloads and the reload's seconds (cosmetic). */
const WEAPONS = [
  { id: 'g25',  name: '25MM',    sub: 'GAU-12',   zoom: 1.25, rounds: 1800, mag: 300, reload: 4,   reticle: 'cross',    def: true },
  { id: 'g30',  name: '30MM',    sub: 'GAU-23',   zoom: 1.1,  rounds: 500,  mag: 100, reload: 5,   reticle: 'box',      def: true },
  { id: 'h105', name: '105MM',   sub: 'M102',     zoom: 0.85, rounds: 100,  mag: 1,   reload: 2.6, reticle: 'frame',    def: true },
  { id: 'b40',  name: '40MM',    sub: 'L/60',     zoom: 1.05, rounds: 256,  mag: 4,   reload: 1.5, reticle: 'box',      def: false },
  { id: 'hf',   name: 'HELLFIRE', sub: 'AGM-114', zoom: 0.9,  rounds: 4,    mag: 1,   reload: 6,   reticle: 'circle',   def: false },
  { id: 'apk',  name: 'APKWS',   sub: 'HYDRA 70', zoom: 0.9,  rounds: 16,   mag: 4,   reload: 6,   reticle: 'circle',   def: false },
  { id: 'gbu',  name: 'GBU-39',  sub: 'SDB',      zoom: 0.72, rounds: 4,    mag: 1,   reload: 8,   reticle: 'circle',   def: false },
  { id: 'aim',  name: 'AIM-9X',  sub: 'SIDEWNDR', zoom: 0.68, rounds: 2,    mag: 1,   reload: 10,  reticle: 'seeker',   def: false },
  { id: 'las',  name: 'LASER',   sub: 'HEL 60KW', zoom: 1.2,  rounds: 0,    mag: 0,   reload: 0,   reticle: 'laser',    def: false },
  { id: 'rail', name: 'RAILGUN', sub: 'EMRG',     zoom: 0.9,  rounds: 40,   mag: 1,   reload: 3.5, reticle: 'rail',     def: false }
];
const WEAPON = Object.fromEntries(WEAPONS.map(w => [w.id, w]));

/* the selected weapon and the state of each one's ammunition */
const ARMS = {
  cur: null, st: {},
  enabled() { return WEAPONS.filter(w => CFG.weapons.includes(w.id)); },
  init() {
    for (const w of WEAPONS) this.st[w.id] = { left: w.rounds, mag: w.mag, reload: 0 };
    const en = this.enabled(); if (!en.some(w => w.id === this.cur)) this.cur = en.length ? en[0].id : null;
  },
  /* select a weapon (a click, or the auto-switching later) */
  select(id) { if (WEAPON[id] && CFG.weapons.includes(id)) this.cur = id; },
  get w() { return WEAPON[this.cur] || null; },
  /* one shot from the selected weapon (stage 6): rounds and the magazine go down, an empty magazine reloads */
  shoot() {
    const w = this.w; if (!w) return false; const s = this.st[w.id];
    if (!w.mag) return true;                                              // (the laser has no ammunition)
    if (s.reload > 0 || s.left <= 0) return false;
    s.left--; if (--s.mag <= 0) { s.reload = w.reload; } return true;
  },
  update(dt) {
    for (const w of WEAPONS) { const s = this.st[w.id]; if (s.reload > 0 && (s.reload -= dt) <= 0) { s.reload = 0; s.mag = Math.min(w.mag, s.left || (s.left = w.rounds, w.mag)); } }   // (cosmetic: an empty store refills)
  }
};
