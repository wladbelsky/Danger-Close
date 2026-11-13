const { test, expect } = require('./support/harness');

test('headlights and navigation lights only at night; only some windows are lit', async ({ wp }) => {
  await wp.boot({ query: '?hour=12&seed=11&weather=clear&transit=0' });
  const r = await wp.run(() => {
    for (const P of ALLIES.posts) P.timer = 0; for (const h of ALLIES.helis) h.timer = 0;
    __t.sim(60);
    const day = LAMPS.n, moving = UNITS.filter(u => u.v > 0.3 && (u.kind === 'tank' || u.kind === 'apc' || u.kind === 'car')).length;
    CFG.fixedHour = 23.5; updateEnvironment(); __t.sim(5);
    let lit = 0, dark = 0; scene.traverse(o => { if (o.material === WIN_MAT) lit += o.geometry.attributes.position.count; if (o.material === WIN_DARK) dark += o.geometry.attributes.position.count; });
    const flying = UNITS.filter(u => u.kind === 'heli' && u.state !== 'pad').length;
    return { street: LAYOUT.lamps.length, map: SU.uLampMap.value === LAMPS.rt.texture, beams: LAMPS.nb, posts: LAYOUT.outposts.length, day, moving, flying, night: LAMPS.n, lit, dark, glow: WIN_MAT.emissive.r, off: WIN_DARK.emissive.r };
  });
  expect(r.street, 'street lamps').toBeGreaterThan(40); expect(r.map).toBe(true);
  expect(r.day).toBe(0); expect(r.moving).toBeGreaterThan(0);
  expect(r.night).toBeGreaterThanOrEqual(r.moving * 2 + r.flying * 2); expect(r.beams).toBeGreaterThanOrEqual(r.moving + r.posts);
  expect(r.glow).toBeGreaterThan(0.2); expect(r.off).toBe(0);
  const share = r.lit / (r.lit + r.dark); expect(share).toBeGreaterThan(0.12); expect(share).toBeLessThan(0.5);
});
