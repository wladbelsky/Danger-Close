// Review sheets for the current stage → test-results/: terrain-zooms.png (3 zooms, TV and white-hot), terrain-seeds.png (top-down
// map + a still for 6 seeds), terrain-seasons.png (the same spot in 4 seasons), terrain-metrics.json (generation time, draw calls)
const { test } = require('../tests/support/harness');
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, '..', 'test-results');
const save = (name, url) => { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, name), Buffer.from(url.split(',')[1], 'base64')); };

test('zooms', async ({ wp }) => {
  await wp.boot({ query: '?hour=11&hud=0&seed=5&az=135&season=summer' });
  const url = await wp.run(() => {
    const W = 640, H = 360, c = document.createElement('canvas'); c.width = W * 3; c.height = H * 2; const g = c.getContext('2d');
    [['tv', 0], ['wh', 1]].forEach(([m, row]) => {
      SENSOR.set(m); updateEnvironment();
      [55, 100, 230].forEach((z, i) => { CFG.zoom = z; updateCamera(); renderFrame(); g.drawImage(renderer.domElement, i * W, row * H, W, H);
        g.font = '600 15px Consolas, monospace'; g.fillStyle = '#000'; g.fillRect(i * W + 8, row * H + 8, 150, 24); g.fillStyle = '#fff'; g.fillText(`${m.toUpperCase()}  ${Math.round(VIEW_H * 100 / z)} m tall`, i * W + 14, row * H + 25); });
    });
    return c.toDataURL('image/png');
  });
  save('terrain-zooms.png', url);
});

test('seeds', async ({ wp }) => {
  const W = 569, H = 320, seeds = [11, 23, 47, 71, 103, 139], tiles = [];
  for (const seed of seeds) {
    if (!tiles.length) await wp.boot({ query: `?hour=11&hud=0&seed=${seed}&az=135&season=summer` }); else await wp.goto(`?hour=11&hud=0&seed=${seed}&az=135&season=summer`);
    tiles.push(await wp.run(([W, H]) => {
      renderFrame();
      const c = document.createElement('canvas'); c.width = W + H; c.height = H; const g = c.getContext('2d');
      const im = g.createImageData(H, H), N = H; let lo = 1e9, hi = -1e9; for (const v of MAP.h) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
      for (let j = 0, k = 0; j < N; j++) for (let i = 0; i < N; i++, k += 4) {
        const x = -MAP_HALF + (i + 0.5) / N * 2 * MAP_HALF, z = -MAP_HALF + (j + 0.5) / N * 2 * MAP_HALF, h = (groundH(x, z) - lo) / (hi - lo), f = MAP.sample(MAP.forest, x, z), d = MAP.sample(MAP.dry, x, z), sh = 1 + (groundH(x - 8, z - 8) - groundH(x + 8, z + 8)) * 0.14;
        const b = (70 + 130 * h) * sh; im.data[k] = lerp(lerp(b * 0.82, b * 1.05, d), 26, f); im.data[k + 1] = lerp(b, 60 + 30 * h, f); im.data[k + 2] = lerp(b * 0.55, 34, f); im.data[k + 3] = 255;
      }
      g.putImageData(im, 0, 0); g.drawImage(renderer.domElement, H, 0, W, H);
      g.strokeStyle = '#ff5040'; g.lineWidth = 2; g.strokeRect((CAM_TGT.x + MAP_HALF) / (2 * MAP_HALF) * H - 5, (CAM_TGT.z + MAP_HALF) / (2 * MAP_HALF) * H - 5, 10, 10);
      g.font = '600 15px Consolas, monospace'; g.fillStyle = '#000'; g.fillRect(8, 8, 230, 24); g.fillStyle = '#fff'; g.fillText(`seed ${MAP.seed}  forest ${Math.round(MAP.forestShare * 100)}%  ${Math.round(hi - lo)} m`, 14, 25);
      return c.toDataURL('image/png');
    }, [W, H]));
  }
  const url = await wp.run(async ([tiles, W, H]) => {
    const c = document.createElement('canvas'); c.width = (W + H) * 2; c.height = H * 3; const g = c.getContext('2d');
    for (let i = 0; i < tiles.length; i++) { const im = new Image(); im.src = tiles[i]; await im.decode(); g.drawImage(im, (i % 2) * (W + H), (i >> 1) * H); }
    return c.toDataURL('image/png');
  }, [tiles, W, H]);
  save('terrain-seeds.png', url);
});

test('seasons', async ({ wp }) => {
  await wp.boot({ query: '?hour=11&hud=0&seed=5&az=135&season=summer' });
  const url = await wp.run(() => {
    const W = 960, H = 540, c = document.createElement('canvas'); c.width = W * 2; c.height = H * 2; const g = c.getContext('2d');
    ['spring', 'summer', 'autumn', 'winter'].forEach((s, i) => { CFG.season = s; updateEnvironment(); renderFrame(); g.drawImage(renderer.domElement, (i % 2) * W, (i >> 1) * H, W, H);
      g.font = '600 18px Consolas, monospace'; g.fillStyle = '#000'; g.fillRect((i % 2) * W + 12, (i >> 1) * H + 12, 110, 30); g.fillStyle = '#fff'; g.fillText(s.toUpperCase(), (i % 2) * W + 22, (i >> 1) * H + 33); });
    return c.toDataURL('image/png');
  });
  save('terrain-seasons.png', url);
});

test('metrics', async ({ wp }) => {
  const out = [];
  for (const seed of [11, 23, 47, 71]) {
    if (!out.length) await wp.boot({ query: `?hour=11&hud=0&seed=${seed}&az=135&season=summer` }); else await wp.goto(`?hour=11&hud=0&seed=${seed}&az=135&season=summer`);
    out.push(await wp.run(() => {
      const res = { seed: MAP.seed, genMs: Math.round(MAP.genMs), trees: TERRAIN.trees, veg: TERRAIN.veg.length };
      renderer.info.autoReset = false;
      for (const z of [55, 100, 230]) {
        CFG.zoom = z; updateCamera(); renderer.info.reset(); renderer.shadowMap.autoUpdate = false; renderFrame();
        const main = { calls: renderer.info.render.calls - 1, tris: renderer.info.render.triangles - 2 };
        renderer.shadowMap.autoUpdate = true; renderer.info.reset(); renderFrame();
        res['z' + z] = { main, shadow: { calls: renderer.info.render.calls - 1 - main.calls, tris: renderer.info.render.triangles - 2 - main.tris } };
      }
      renderer.info.autoReset = true; return res;
    }));
  }
  fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, 'terrain-metrics.json'), JSON.stringify(out, null, 1));
});
