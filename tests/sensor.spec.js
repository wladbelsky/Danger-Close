// The sensor: vision modes, the heat term, the render target
const { test, expect } = require('./support/harness');

test('boots and renders in every mode without errors', async ({ wp }) => {
  await wp.boot({ query: '?hour=12' });
  await wp.sim(2);
  for (const m of ['tv', 'wh', 'bh', 'nv']) await wp.run((m) => { SENSOR.set(m); __t.render(); }, m);
});

test('switching the vision mode adds no shader programs', async ({ wp }) => {
  await wp.boot({ query: '?hour=12' });
  await wp.sim(2);
  const counts = await wp.run(() => {
    const out = []; __t.render(); out.push(renderer.info.programs.length);
    for (const m of ['wh', 'bh', 'nv', 'tv', 'wh']) { SENSOR.set(m); __t.render(); out.push(renderer.info.programs.length); }
    return out;
  });
  for (const c of counts) expect(c).toBe(counts[0]);
});

test('every material in the scene goes through the sensor', async ({ wp }) => {
  await wp.boot({ query: '?hour=12' });
  const raw = await wp.run(() => {
    const bad = [];
    scene.traverse(o => { if (!o.material || !o.isMesh) return; const m = o.material; if (m.onBeforeCompile !== sensorHook && !(m.isShaderMaterial && m.uniforms.uThermal)) bad.push(m.type + ':' + o.name); });
    return bad;
  });
  expect(raw).toEqual([]);
});

test('thermal shows heat: the live engine is hot, black-hot is the inverse of white-hot', async ({ wp }) => {
  await wp.boot({ query: '?hour=12' });
  await wp.sim(1);
  const r = await wp.run(() => {
    const [ex, ey] = __t.screenOf(-26 - Math.cos(0.5) * 2, 2, 2 + Math.sin(0.5) * 2);
    const box = (x, y, s) => [x - s, y - s, x + s, y + s];
    const engine = box(ex, ey, 0.008), far = box(0.82, 0.14, 0.04);
    SENSOR.set('wh'); const we = __t.sample(...engine), wf = __t.sample(...far);
    SENSOR.set('bh'); const be = __t.sample(...engine), bf = __t.sample(...far);
    return { we, wf, be, bf };
  });
  expect(r.we).toBeGreaterThan(r.wf + 0.08);
  expect(r.be).toBeLessThan(r.bf - 0.08);
});

test('the vision mode is not persisted across a restart', async ({ wp }) => {
  await wp.boot({ query: '?hour=12' });
  await wp.run(() => SENSOR.set('nv'));
  await wp.reload();
  expect(await wp.run(() => SENSOR.mode)).toBe('tv');
});

test('auto default: TV by day, white-hot at night', async ({ wp }) => {
  await wp.boot({ query: '?hour=12&mode=auto' });
  expect(await wp.run(() => SENSOR.mode)).toBe('tv');
  await wp.page.goto('/index.html?hour=1&mode=auto');
  expect(await wp.run(() => SENSOR.mode)).toBe('wh');
});

test('the clickable switch changes the mode', async ({ wp }) => {
  await wp.boot({ query: '?hour=12' });
  await wp.page.click('#modes button[data-m="bh"]');
  expect(await wp.run(() => SENSOR.mode)).toBe('bh');
});
