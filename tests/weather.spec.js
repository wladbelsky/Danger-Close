// Weather, clouds, night, anti-aircraft fire: what shows when, and that none of it touches the fight
const { test, expect } = require('./support/harness');

test('rain and snow fall only in their weather; fog closes in; clouds leave when a fight starts', async ({ wp }) => {
  await wp.boot({ query: '?hour=12&seed=11&weather=clear&clouds=100&transit=0' });
  await wp.sim(20);
  const clear = await wp.run(() => ({ drops: WEATHER.drops.items.filter(i => i.on).length, far: scene.fog.far, cover: WEATHER.cover, sun: sunLight.intensity }));
  expect(clear.drops).toBe(0); expect(clear.cover).toBeGreaterThan(10);
  await wp.run(() => { CFG.weather = 'rain'; }); await wp.sim(40);
  const rain = await wp.run(() => ({ drops: WEATHER.drops.items.filter(i => i.on).length, k: WEATHER.k.rain, sun: sunLight.intensity }));
  expect(rain.k).toBe(1); expect(rain.drops).toBeGreaterThan(300); expect(rain.sun).toBeLessThan(clear.sun * 0.6);
  await wp.run(() => { CFG.weather = 'fog'; }); await wp.sim(40);
  const fog = await wp.run(() => ({ drops: WEATHER.drops.items.filter(i => i.on).length, far: scene.fog.far }));
  expect(fog.drops).toBe(0); expect(fog.far).toBeLessThan(clear.far * 0.75);
  await wp.sim(12, { audio: true });
  expect(await wp.run(() => [AUD.combat, WEATHER.cover, WEATHER.fx.live.length])).toEqual([true, 0, 0]);
});

test('anti-aircraft fire and flares only in a fight, and not with the setting off', async ({ wp }) => {
  await wp.boot({ query: '?hour=12&seed=11&weather=clear' });
  await wp.sim(60);
  expect(await wp.run(() => [AA.shots, AA.launched, AA.flares.length])).toEqual([0, 0, 0]);
  const r = await wp.run(() => {
    __t.sim(6, { audio: true });
    AA.nextSam = 0; let flares = 0;
    let guns = 0, aimed = 1;
    for (let i = 0; i < 2400; i++) {
      __t.sim(0.05, { audio: true }); flares = Math.max(flares, AA.flares.length);
      for (const u of UNITS) {   // the base's guns: turned to the aircraft a few seconds after they appear
        if (u.type !== 'aa' || !u.alive) continue; u.__t0 = u.__t0 || T; if (T - u.__t0 < 4) continue;
        u.obj.updateWorldMatrix(true, false); const e = u.obj.matrixWorld.elements, dx = camera.position.x - u.pos.x, dz = camera.position.z - u.pos.z, d = Math.hypot(dx, dz);
        guns++; aimed = Math.min(aimed, (e[0] * dx + e[2] * dz) / d / Math.hypot(e[0], e[2]));
      }
    }
    return { shots: AA.shots, launched: AA.launched, flares, guns, aimed };
  });
  expect(r.shots).toBeGreaterThan(10); expect(r.launched).toBeGreaterThan(0); expect(r.flares).toBeGreaterThan(0);
  expect(r.guns, 'guns seen').toBeGreaterThan(0); expect(r.aimed, 'the guns point at the aircraft').toBeGreaterThan(0.95);
  await wp.run(() => { CFG.aa = false; const a = AA.shots; __t.sim(60, { audio: true }); window.__d = AA.shots - a; });
  expect(await wp.run(() => window.__d), 'with the setting off').toBeLessThan(20);
});

test('the auto vision follows day and night until a mode is clicked; windows light up at night; nothing recompiles', async ({ wp }) => {
  await wp.boot({ query: '?hour=12&seed=11&mode=auto&weather=rain&spot=town&transit=0' });
  await wp.run(() => __t.render());
  const p0 = await wp.run(() => renderer.info.programs.length);
  expect(await wp.run(() => SENSOR.mode)).toBe('tv');
  const night = await wp.run(() => { CFG.fixedHour = 0; updateEnvironment(); __t.render(); return { mode: SENSOR.mode, win: WIN_MAT.emissive.r, progs: renderer.info.programs.length }; });
  expect(night.mode).toBe('wh'); expect(night.win).toBeGreaterThan(0.2); expect(night.progs).toBe(p0);
  await wp.page.click('#modes button[data-m=nv]');
  const day = await wp.run(() => { CFG.fixedHour = 12; updateEnvironment(); __t.render(); return { mode: SENSOR.mode, win: WIN_MAT.emissive.r, progs: renderer.info.programs.length }; });
  expect(day.mode).toBe('nv'); expect(day.win).toBe(0); expect(day.progs).toBe(p0);
});
