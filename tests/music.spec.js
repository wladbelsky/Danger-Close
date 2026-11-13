// The music drives the fight: units fire on the beats of their band, at a pace set by how dense the music is (the same damage a
// second), quiet parts and drops and the AA on the beat
const { test, expect } = require('./support/harness');

test('the units fire on the beats, mostly of their own band', async ({ wp }) => {
  await wp.boot({ query: '?hour=12&seed=11' });
  await wp.sim(90, { audio: true });
  const s = await wp.run(() => BATTLE.stat);
  expect(s.uShots).toBeGreaterThan(150);
  expect(s.uBeat / (s.uBeat + s.uLate), 'shots on a beat').toBeGreaterThan(0.9);
  expect(s.uBand / s.uBeat, 'shots on a beat of their band').toBeGreaterThan(0.6);
  expect(s.volleys).toBeGreaterThan(0);
});

test('music with no beats: the units still fire', async ({ wp }) => {
  await wp.boot({ query: '?hour=12&seed=11' });
  const s = await wp.run(() => {
    const flat = () => new Array(128).fill(0.25);   // (steady: no rise, no beat)
    __t.sim(90, { audio: true, spec: flat });
    return { combat: AUD.combat, ...BATTLE.stat };
  });
  expect(s.combat).toBe(true);
  expect(s.uBeat).toBe(0);
  expect(s.uLate).toBeGreaterThan(40);
});

test('denser music: more shots, the same damage a second', async ({ wp }) => {
  await wp.boot({ query: '?hour=12&seed=11' });
  const r = await wp.run(() => {
    const u = UNITS.find(o => o.side === 'ally' && o.kind === 'tank') || UNITS.find(o => o.side === 'ally' && FIRE[o.kind]);
    const tgt = { alive: true, kind: 'inf', pos: u.pos.clone(), ah: 1.6 }; tgt.pos.x += 30;
    const fire0 = BATTLE.unitFire, out = {};
    for (const H of [0.1, 1]) {
      Object.defineProperty(AUD, 'heavy', { get: () => H, set() {}, configurable: true });
      let n = 0, dmg = 0; BATTLE.unitFire = (w, t, F, pace) => { if (w === u) { n++; dmg += F.dmg / (pace || 1); } };
      u.tgt = tgt; u.think = 1e9; u.cool = 0; u.ready = 0;
      for (let i = 0; i < 2400; i++) {   // 120 s, a beat in every band every half second
        T += 0.05; BATTLE.think(u, 0.05, true);
        if (i % 10 === 0) for (const b of ['low', 'mid', 'high']) BATTLE.unitsOnBeat(b, 1.2, false);
      }
      out[H] = { n, dps: dmg / 120, pace: BATTLE.pace() };
    }
    delete AUD.heavy; AUD.heavy = 0; BATTLE.unitFire = fire0; u.think = 0;
    return { kind: u.kind, out };
  });
  const lo = r.out['0.1'], hi = r.out['1'];
  expect(hi.pace).toBeCloseTo(2, 2); expect(lo.pace).toBeCloseTo(0.75, 2);
  expect(hi.n / lo.n, `${r.kind}: shots`).toBeGreaterThan(1.8);
  expect(hi.dps / lo.dps, `${r.kind}: damage a second`).toBeGreaterThan(0.8);
  expect(hi.dps / lo.dps, `${r.kind}: damage a second`).toBeLessThan(1.25);
});

test('a quiet part, then the kick back: one drop each time, a surge; the AA bursts start on beats', async ({ wp }) => {
  await wp.boot({ query: '?hour=12&seed=11' });
  const r = await wp.run(() => {
    const drops = [], calm = []; let wasCalm = false;
    for (let i = 0; i < 2400; i++) {   // 120 s of the demo loop with its quiet part and its silent bars (23 s a loop)
      __t.sim(0.05, { audio: true, pauses: true });
      if (BATTLE.stat.drops > drops.length) drops.push({ t: T, surge: BATTLE.surgeUntil - T, fighting: AUD.fighting });
      if (AUD.calm && !wasCalm) calm.push(T); wasCalm = AUD.calm;
    }
    return { drops, calm, aud: AUD.drops, combat: AUD.combat, aaBeat: AA.onBeatN, aaLate: AA.late };
  });
  expect(r.combat).toBe(true);
  expect(r.calm.length, 'quiet parts').toBeGreaterThanOrEqual(4);
  expect(r.drops.length, 'drops').toBeGreaterThanOrEqual(3);
  expect(r.drops.length).toBeLessThanOrEqual(6);
  expect(r.aud).toBe(r.drops.length);
  for (let i = 1; i < r.drops.length; i++) expect(r.drops[i].t - r.drops[i - 1].t).toBeGreaterThan(19.9);
  for (const d of r.drops) { expect(d.fighting).toBe(true); expect(d.surge).toBeGreaterThan(3.5); }
  expect(r.aaBeat).toBeGreaterThan(3);
  expect(r.aaLate, 'AA bursts that found no beat').toBeLessThanOrEqual(r.aaBeat / 4);
});
