// Soak: hours of the wallpaper's life squeezed into one run — fights and silences with every weapon, transits, weather, day and
// night, a change of season. Nothing may pile up: GPU geometries and textures, shader programs, scene children, units, effects.
const { test, expect } = require('./support/harness');

test('five fights and silences with every weapon, weather, day and night, a new season: nothing piles up', async ({ wp }) => {
  test.setTimeout(600000);
  await wp.boot({ query: '?hour=12&seed=5&weapons=all&transit=1&weather=auto' });
  const snap = () => wp.run(() => {
    __t.render();
    let n = 0; scene.traverse(() => n++);
    return { geo: renderer.info.memory.geometries, tex: renderer.info.memory.textures, progs: renderer.info.programs.length, kids: scene.children.length, nodes: n, units: UNITS.length, enemies: UNITS.filter(u => u.side === 'enemy').length,
      tracers: FX.tracers.items.filter(i => i.on).length, wrecks: WRECKS.list.length, missiles: BATTLE.missiles.length, pend: BATTLE.pend.length, heap: performance.memory ? performance.memory.usedJSHeapSize / 1048576 : 0 };
  });
  const cycle = (i) => wp.run((i) => {
    CFG.fixedHour = [12, 21, 2, 7, 16][i]; CFG.weather = ['rain', 'fog', 'snow', 'clear', 'auto'][i]; updateEnvironment();
    const t0 = performance.now(), s0 = T; __t.sim(150, { audio: true }); __t.sim(20);
    for (let k = 0; k < 20 && (UNITS.some(u => u.side === 'enemy') || BATTLE.base || BATTLE.ruins.length || WRECKS.list.length); k++) __t.sim(30);
    return { ms: (performance.now() - t0) / ((T - s0) / 0.05), shots: BATTLE.stat.shots };
  }, i);
  const r0 = await cycle(0); const a = await snap();
  const runs = [r0]; for (let i = 1; i < 5; i++) { if (i === 3) await wp.run(() => { CFG.season = 'winter'; updateEnvironment(); }); runs.push(await cycle(i)); }
  const b = await snap();
  console.log('soak', JSON.stringify({ a, b, ms: runs.map(r => +r.ms.toFixed(2)), shots: runs[4].shots }));
  expect(runs[4].shots, 'it kept fighting').toBeGreaterThan(runs[0].shots + 20);
  expect(b.enemies, 'every enemy gone after the last stand-down').toBe(0); expect(b.wrecks).toBe(0); expect(b.missiles).toBe(0);
  expect(b.geo, 'GPU geometries').toBeLessThanOrEqual(a.geo + 12); expect(b.tex, 'GPU textures').toBeLessThanOrEqual(a.tex + 2);
  expect(b.progs, 'shader programs (the winter set adds its own materials)').toBeLessThanOrEqual(a.progs + 6);
  expect(b.kids, 'scene children').toBeLessThanOrEqual(a.kids + 4); expect(b.nodes, 'scene nodes').toBeLessThanOrEqual(a.nodes * 1.1 + 50);
  expect(b.units, 'units (the allies\' garrisons refill)').toBeLessThanOrEqual(a.units + 15);
  if (a.heap) expect(b.heap, 'JS heap, MB').toBeLessThan(a.heap * 1.6 + 40);
});
