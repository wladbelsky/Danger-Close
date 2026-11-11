// Review sheets for the current stage → test-results/: layout-maps.png (top-down maps of 4 seeds), layout-spots-<seed>.png
// (stills of the town, a village, the station, a bridge, a lake, fields, a farm, the line), layout-town.png (the town in
// four modes, day and night), layout-metrics.json (generation time, draw calls)
const { test } = require('../tests/support/harness');
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, '..', 'test-results');
const save = (name, url) => { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, name), Buffer.from(url.split(',')[1], 'base64')); };
const SEEDS = [11, 23, 47, 71];
const Q = s => `?hour=11&hud=0&seed=${s}&az=135&season=summer`;

/* a top-down map of the current world (2 m occupancy, 4 m heights) */
function drawMap(N) {
  const c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'), im = g.createImageData(N, N);
  let lo = 1e9, hi = -1e9; for (const v of MAP.h) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const lu = LAYOUT.landuse.getContext('2d').getImageData(0, 0, OCC_N, OCC_N).data;
  for (let j = 0, k = 0; j < N; j++) for (let i = 0; i < N; i++, k += 4) {
    const x = -MAP_HALF + (i + 0.5) / N * 2 * MAP_HALF, z = -MAP_HALF + (j + 0.5) / N * 2 * MAP_HALF, h = (groundH(x, z) - lo) / (hi - lo), sh = 1 + (groundH(x - 6, z - 6) - groundH(x + 6, z + 6)) * 0.12;
    const o = occAt(x, z), w = waterAt(x, z), f = MAP.sample(MAP.forest, x, z), li = (Math.floor((z + MAP_HALF) / 2) * OCC_N + Math.floor((x + MAP_HALF) / 2)) * 4;
    let r = (90 + 80 * h) * 0.78 * sh, gg = (90 + 80 * h) * sh, b = (90 + 80 * h) * 0.5 * sh;
    if (f > 0.5) { r = 30; gg = 62 + 20 * h; b = 34; }
    if (lu[li] > 128) { const cb = lu[li + 2] / 255; [r, gg, b] = cb < 0.25 ? [200, 176, 92] : cb < 0.5 ? [110, 150, 60] : cb < 0.75 ? [170, 160, 100] : [130, 100, 70]; }
    if (o & OCC_YARD) { r = r * 0.6 + 70; gg = gg * 0.6 + 64; b = b * 0.6 + 50; }
    if (w === 1 || w === 2 || (o & OCC_WATER)) { r = 40; gg = 80; b = 120; }
    if (o & OCC_RAIL) { r = 70; gg = 50; b = 40; }
    if (o & OCC_ROAD) { r = gg = b = 235; }
    if (o & OCC_BUILD) { r = 200; gg = 60; b = 50; }
    im.data[k] = r; im.data[k + 1] = gg; im.data[k + 2] = b; im.data[k + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  g.font = '600 13px Consolas, monospace'; g.fillStyle = '#000'; g.fillRect(4, 4, 330, 20); g.fillStyle = '#fff';
  g.fillText(`seed ${MAP.seed}: ${LAYOUT.towns.length} towns, ${LAYOUT.buildings.length} bldg, ${LAYOUT.lakes.length} lakes${LAYOUT.rivers.length ? ', river' : ''}, ${LAYOUT.fields.length} fields`, 9, 18);
  return c.toDataURL('image/png');
}

test('maps', async ({ wp }) => {
  const tiles = [];
  for (const s of SEEDS) { if (!tiles.length) await wp.boot({ query: Q(s) }); else await wp.goto(Q(s)); tiles.push(await wp.run(`(${drawMap})(720)`)); }
  save('layout-maps.png', await wp.run(async (tiles) => {
    const c = document.createElement('canvas'); c.width = c.height = 1440; const g = c.getContext('2d');
    for (let i = 0; i < tiles.length; i++) { const im = new Image(); im.src = tiles[i]; await im.decode(); g.drawImage(im, (i % 2) * 720, (i >> 1) * 720); }
    return c.toDataURL('image/png');
  }, tiles));
});

for (const s of [11, 47]) test(`spots ${s}`, async ({ wp }) => {
  await wp.boot({ query: Q(s) });
  save(`layout-spots-${s}.png`, await wp.run(() => {
    const W = 640, H = 360, spots = LAYOUT.spots(), names = ['town', 'village', 'station', 'bridge', 'lake', 'fields', 'farm', 'rail'].filter(n => spots[n]);
    const c = document.createElement('canvas'); c.width = W * 3; c.height = H * Math.ceil(names.length / 3); const g = c.getContext('2d');
    names.forEach((n, i) => {
      const [x, z] = spots[n]; CAM_TGT.set(x, groundH(x, z), z); CFG.zoom = n === 'town' || n === 'fields' ? 60 : 100; updateCamera(); renderFrame();
      g.drawImage(renderer.domElement, (i % 3) * W, Math.floor(i / 3) * H, W, H);
      g.font = '600 15px Consolas, monospace'; g.fillStyle = '#000'; g.fillRect((i % 3) * W + 8, Math.floor(i / 3) * H + 8, 110, 24); g.fillStyle = '#fff'; g.fillText(n.toUpperCase(), (i % 3) * W + 14, Math.floor(i / 3) * H + 25);
    });
    return c.toDataURL('image/png');
  }));
});

test('junctions', async ({ wp }) => {
  await wp.boot({ query: Q(11) });
  save('layout-junctions.png', await wp.run(() => {
    const W = 640, H = 360, T0 = LAYOUT.towns[0], J = LAYOUT.junctions.filter(j => j.paved).sort((a, b) => Math.hypot(a.x - T0.x, a.z - T0.z) - Math.hypot(b.x - T0.x, b.z - T0.z));
    const pick = [J[0], J[3], J[7], J[12], J[J.length >> 1], J[J.length - 1]].filter(Boolean), c = document.createElement('canvas'); c.width = W * 3; c.height = H * 2; const g = c.getContext('2d');
    CFG.zoom = 220; updateCamera();
    pick.forEach((j, i) => { CAM_TGT.set(j.x, groundH(j.x, j.z), j.z); updateCameraPose(); renderFrame(); g.drawImage(renderer.domElement, (i % 3) * W, (i / 3 | 0) * H, W, H); });
    return c.toDataURL('image/png');
  }));
});

test('crossings', async ({ wp }) => {
  await wp.boot({ query: Q(11) });
  save('layout-crossings.png', await wp.run(() => {
    const W = 640, H = 360, R = LAYOUT.rail, hits = [];
    for (const r of LAYOUT.roads) { if (r.kind === 'track') continue; for (const p of r.pts) if (R.pts.some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < 3) && !hits.some(h => Math.hypot(h[0] - p[0], h[1] - p[1]) < 40)) hits.push(p); }
    const c = document.createElement('canvas'); c.width = W * 3; c.height = H * 2; const g = c.getContext('2d'); CFG.zoom = 220; updateCamera();
    hits.slice(0, 6).forEach(([x, z], i) => { CAM_TGT.set(x, groundH(x, z), z); updateCameraPose(); renderFrame(); g.drawImage(renderer.domElement, (i % 3) * W, (i / 3 | 0) * H, W, H); });
    g.font = '600 15px Consolas, monospace'; g.fillStyle = '#000'; g.fillRect(8, 8, 160, 24); g.fillStyle = '#fff'; g.fillText(`${hits.length} crossings`, 14, 25);
    return c.toDataURL('image/png');
  }));
});

test('town in four modes', async ({ wp }) => {
  await wp.boot({ query: Q(11) });
  save('layout-town.png', await wp.run(() => {
    const W = 960, H = 540, c = document.createElement('canvas'); c.width = W * 2; c.height = H * 2; const g = c.getContext('2d'), [x, z] = LAYOUT.spots().town;
    CAM_TGT.set(x + 40, groundH(x + 40, z + 30), z + 30); CFG.zoom = 80; updateCamera();
    [['tv', 11], ['wh', 11], ['nv', 23.5], ['tv', 23.5]].forEach(([m, h], i) => {
      CFG.fixedHour = h; SENSOR.set(m); updateEnvironment(); renderFrame(); g.drawImage(renderer.domElement, (i % 2) * W, (i >> 1) * H, W, H);
      g.font = '600 18px Consolas, monospace'; g.fillStyle = '#000'; g.fillRect((i % 2) * W + 12, (i >> 1) * H + 12, 170, 30); g.fillStyle = '#fff'; g.fillText(`${SENSOR_LABEL[m]} ${h < 20 ? 'DAY' : 'NIGHT'}`, (i % 2) * W + 22, (i >> 1) * H + 33);
    });
    return c.toDataURL('image/png');
  }));
});

test('metrics', async ({ wp }) => {
  const out = [];
  for (const s of SEEDS) {
    if (!out.length) await wp.boot({ query: Q(s) }); else await wp.goto(Q(s));
    out.push(await wp.run(() => {
      const res = { seed: MAP.seed, genMs: Math.round(MAP.genMs), layoutMs: Math.round(LAYOUT.ms), buildings: LAYOUT.buildings.length, trees: TERRAIN.trees };
      renderer.info.autoReset = false; const [x, z] = LAYOUT.spots().town; CAM_TGT.set(x, groundH(x, z), z);
      for (const zm of [55, 100]) {
        CFG.zoom = zm; updateCamera(); renderer.info.reset(); renderer.shadowMap.autoUpdate = false; renderFrame();
        const main = { calls: renderer.info.render.calls - 1, tris: renderer.info.render.triangles - 2 }; renderer.shadowMap.autoUpdate = true; renderer.info.reset(); renderFrame();
        res['town_z' + zm] = { main, shadow: { calls: renderer.info.render.calls - 1 - main.calls, tris: renderer.info.render.triangles - 2 - main.tris } };
      }
      renderer.info.autoReset = true; return res;
    }));
  }
  fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, 'layout-metrics.json'), JSON.stringify(out, null, 1));
});
