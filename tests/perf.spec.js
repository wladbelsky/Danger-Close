// perfReport(): the frame-time report for a real GPU (run in the wallpaper's console in Wallpaper Engine)
const { test, expect } = require('./support/harness');

test('perfReport: averages the frames, the CPU split into simulation and drawing, the whole frame\'s draw calls; two at once each its own', async ({ wp }) => {
  await wp.boot();
  const [r, r2, after] = await wp.run(async () => {
    lastMs = 0; const p = perfReport(0.3); for (let i = 1; i <= 5; i++) frame(i * 16.7);
    const p2 = perfReport(0.2); for (let i = 6; i <= 10; i++) frame(i * 16.7);   // (the second one starts later: each keeps its own frames)
    const out = await Promise.all([p, p2]); return [...out, renderer.info.autoReset];
  });
  console.log(JSON.stringify(r));
  expect(r.frames).toBe(10); expect(r2.frames).toBe(5);
  expect(r.frameMs).toBeCloseTo(16.7, 1);
  expect(r.cpuMs).toBeCloseTo(r.simMs + r.drawMs, 1); expect(r.simMs).toBeGreaterThan(0); expect(r.drawMs).toBeGreaterThan(0);
  expect(r.drawCalls, 'the whole frame: the shadow pass and the post too').toBeGreaterThan(50);
  expect(r.triangles).toBeGreaterThan(1000);
  expect(r.backend).toBe('WebGL 2'); expect(r.programs).toBeGreaterThan(5);
  expect(after, 'the renderer counts per pass again once no report runs').toBe(true);
});
