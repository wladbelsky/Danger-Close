// The big guns in frame: shown only while selected, a shot kicks and heats the barrel, nothing recompiles
const { test, expect } = require('./support/harness');

test('the barrels show while their weapons are enabled; a shot recoils and heats one; no new programs', async ({ wp }) => {
  await wp.boot({ query: '?hour=11&seed=11&transit=0&weapons=g25&auto=0' });
  expect(await wp.run(() => { __t.sim(1); __t.render(); return Object.values(GUNS.models).some(g => g.root.visible); }), 'no barrel with only the 25 mm').toBe(false);
  await wp.goto('?hour=11&seed=11&transit=0&weapons=g25,h105,rail&auto=0');
  const r = await wp.run(() => {
    ARMS.select('g25'); __t.sim(1); __t.render();
    const p0 = renderer.info.programs.length, both = Object.values(GUNS.models).every(g => g.root.visible), apart = GUNS.models.h105.root.position.distanceTo(GUNS.models.rail.root.position);
    const g = GUNS.models.h105, h0 = g.heat.value;
    GUNS.shot('h105'); __t.sim(0.04); __t.render(); const kick = g.rec, flash = GUNS.flash.live.length, heat = g.heat.value - h0;
    __t.sim(3); const back = g.rec;
    for (const m of ['wh', 'bh', 'nv', 'tv']) { SENSOR.set(m); GUNS.shot('h105'); GUNS.shot('rail'); __t.sim(0.04); __t.render(); }
    return { both, apart, kick, flash, heat, back, progs: renderer.info.programs.length - p0 };
  });
  expect(r.both, 'both barrels').toBe(true); expect(r.apart).toBeGreaterThan(0.4);
  expect(r.kick).toBeGreaterThan(0.3); expect(r.flash).toBeGreaterThan(0); expect(r.heat).toBeGreaterThan(0.05); expect(r.back).toBe(0);
  expect(r.progs, 'programs compiled after the start').toBe(0);
});

test('the barrels are fixed to the aircraft: the sensor looking down lifts them; a shot starts at the muzzle on the screen', async ({ wp }) => {
  await wp.boot({ query: '?hour=11&seed=11&transit=0&weapons=h105&auto=0' });
  const r = await wp.run(() => {
    const g = GUNS.models.h105, scr = () => { GUNS.pose(); return g.root.localToWorld(new THREE.Vector3(0, 0, g.muzzle)).project(GUNS.cam); };
    const slew = (m) => { const c = GUNSHIP.ctr, dx = camera.position.x - c.x, dz = camera.position.z - c.z, d = Math.hypot(dx, dz); GUNSHIP.nextWander = 1e9; GUNSHIP.vel.set(0, 0, 0); GUNSHIP.look.set(c.x + dx / d * m, 0, c.z + dz / d * m); GUNSHIP.aim.copy(GUNSHIP.look); GUNSHIP.aimS.copy(GUNSHIP.look); __t.sim(0.05); };
    __t.sim(1); slew(0); const y0 = scr().y;
    slew(100); const yDown = scr().y;
    slew(0); const m = scr(), w = GUNS.muzzleAt('h105', new THREE.Vector3(), 45).project(camera);
    CFG.zoom = 160; __t.sim(2); const zin = scr(); CFG.zoom = 100; __t.sim(2);
    return { zout: Math.hypot(m.x, m.y), zin: Math.hypot(zin.x, zin.y), y0, yDown, dx: Math.abs(w.x - m.x), dy: Math.abs(w.y - m.y), via: BATTLE.muzzle(new THREE.Vector3()).distanceTo(camera.position) };
  });
  expect(r.yDown - r.y0, 'looking down lifts the barrel in the frame').toBeGreaterThan(0.2);
  expect(r.zin, 'zoomed in: the muzzle moves out towards the edge').toBeGreaterThan(r.zout * 1.3);
  expect(r.dx).toBeLessThan(0.1); expect(r.dy).toBeLessThan(0.1); expect(r.via).toBeCloseTo(45, 0);
});

test('the fight fires the visible gun', async ({ wp }) => {
  await wp.boot({ query: '?hour=11&seed=11&weather=clear&weapons=h105&auto=0' });
  const r = await wp.run(() => { const h0 = GUNS.models.h105.heat.value; let kicks = 0; for (let i = 0; i < 1200 && BATTLE.stat.shots < 3; i++) { __t.sim(0.05, { audio: true }); if (GUNS.models.h105.recT != null) kicks++; } return { shots: BATTLE.stat.shots, kicks, heat: GUNS.models.h105.heat.value - h0 }; });
  expect(r.shots).toBeGreaterThan(0); expect(r.kicks).toBeGreaterThan(0); expect(r.heat).toBeGreaterThan(0);
});
