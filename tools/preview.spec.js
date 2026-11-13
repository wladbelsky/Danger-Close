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
    pick.forEach((j, i) => { CAM_TGT.set(j.x, groundH(j.x, j.z), j.z); CAM_CTR.copy(CAM_TGT); updateCameraPose(); renderFrame(); g.drawImage(renderer.domElement, (i % 3) * W, (i / 3 | 0) * H, W, H); });
    return c.toDataURL('image/png');
  }));
});

test('crossings', async ({ wp }) => {
  await wp.boot({ query: Q(11) });
  save('layout-crossings.png', await wp.run(() => {
    const W = 640, H = 360, R = LAYOUT.rail, hits = [];
    for (const r of LAYOUT.roads) { if (r.kind === 'track') continue; for (const p of r.pts) if (R.pts.some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < 3) && !hits.some(h => Math.hypot(h[0] - p[0], h[1] - p[1]) < 40)) hits.push(p); }
    const c = document.createElement('canvas'); c.width = W * 3; c.height = H * 2; const g = c.getContext('2d'); CFG.zoom = 220; updateCamera();
    hits.slice(0, 6).forEach(([x, z], i) => { CAM_TGT.set(x, groundH(x, z), z); CAM_CTR.copy(CAM_TGT); updateCameraPose(); renderFrame(); g.drawImage(renderer.domElement, (i % 3) * W, (i / 3 | 0) * H, W, H); });
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

/* stage 4: the HUD over the town with the dummies' brackets, in four modes (whole-page screenshots: the HUD is canvas + DOM) */
async function sheet(wp, shots, cols, name) {
  save(name, await wp.run(async ([shots, cols]) => {
    const ims = []; for (const s of shots) { const im = new Image(); im.src = 'data:image/png;base64,' + s; await im.decode(); ims.push(im); }
    const W = ims[0].width, H = ims[0].height, c = document.createElement('canvas'); c.width = W * cols; c.height = H * Math.ceil(ims.length / cols);
    const g = c.getContext('2d'); ims.forEach((im, i) => g.drawImage(im, (i % cols) * W, Math.floor(i / cols) * H)); return c.toDataURL('image/png');
  }, [shots, cols]));
}
const aimAtDummies = () => {
  const t = TRACKS.filter(t => Math.hypot(t.obj.position.x - GUNSHIP.home.x, t.obj.position.z - GUNSHIP.home.z) < 300).sort((a, b) => (a.side === 'enemy') - (b.side === 'enemy'))[0];
  const e = TRACKS.find(o => o.side === 'enemy' && Math.hypot(o.obj.position.x - t.obj.position.x, o.obj.position.z - t.obj.position.z) < 160);
  const p = e ? t.obj.position.clone().lerp(e.obj.position, 0.5) : t.obj.position;
  GUNSHIP.look.copy(p); GUNSHIP.aim.copy(p); GUNSHIP.aimS.copy(p); GUNSHIP.vel.set(0, 0, 0); GUNSHIP.nextWander = 1e9; CFG.zoom = e ? 60 : 100; __t.sim(2);
};
test('hud in four modes', async ({ wp }) => {
  await wp.page.setViewportSize({ width: 1600, height: 900 });
  await wp.boot({ query: '?hour=11&seed=11&spot=town&transit=0&season=summer&weapons=all' });
  await wp.run(`(${aimAtDummies})()`);
  const shots = [];
  for (const [m, h, wpn] of [['tv', 11, 'g25'], ['wh', 11, 'h105'], ['nv', 23.5, 'hf'], ['bh', 23.5, 'rail']]) {
    await wp.run(([m, h, wpn]) => { CFG.fixedHour = h; SENSOR.set(m); HUD.markModes(); ARMS.select(wpn); HUD.markArms(); updateEnvironment(); __t.sim(3); HUD.domT = 0; __t.render(); }, [m, h, wpn]);
    shots.push((await wp.page.screenshot()).toString('base64'));
  }
  await sheet(wp, shots, 2, 'hud-modes.png');
});
test('transit', async ({ wp }) => {
  await wp.page.setViewportSize({ width: 1280, height: 720 });
  await wp.boot({ query: '?hour=15&seed=11&spot=town&transit=0&season=summer' });
  await wp.run(() => { GUNSHIP.startTransit(); });
  const shots = [];
  for (let i = 0; i < 6; i++) { await wp.run((i) => { if (i) __t.sim(GUNSHIP.tr ? GUNSHIP.tr.dur / 5 : 3); __t.render(); }, i); shots.push((await wp.page.screenshot()).toString('base64')); }
  await sheet(wp, shots, 3, 'hud-transit.png');
});
test('stations', async ({ wp }) => {
  const tiles = [];
  for (const s of [5, 8, 13, 21, 34, 55]) {
    if (!tiles.length) await wp.boot({ query: Q(s) + '&transit=0' }); else await wp.goto(Q(s) + '&transit=0');
    tiles.push(await wp.run(() => {
      const S = LAYOUT.station; if (!S) return null; let bend = 0; for (const g of S.segs) bend = Math.max(bend, Math.abs(angleWrap(g.a - S.a)));
      GUNSHIP.look.set(S.x, 0, S.z); GUNSHIP.aim.copy(GUNSHIP.look); GUNSHIP.ctr.copy(GUNSHIP.look); GUNSHIP.aimS.copy(GUNSHIP.look); GUNSHIP.nextWander = 1e9; CFG.zoom = 120; __t.sim(3); renderFrame();
      const c = document.createElement('canvas'); c.width = 640; c.height = 360; const g = c.getContext('2d'); g.drawImage(renderer.domElement, 0, 0, 640, 360);
      g.font = '600 15px Consolas, monospace'; g.fillStyle = '#000'; g.fillRect(8, 8, 230, 24); g.fillStyle = '#fff'; g.fillText(`seed ${MAP.seed} bend ${(bend / DEG).toFixed(1)}°`, 14, 25);
      return c.toDataURL('image/png');
    }));
  }
  save('stations.png', await wp.run(async (tiles) => {
    const c = document.createElement('canvas'); c.width = 1920; c.height = 720; const g = c.getContext('2d');
    for (let i = 0; i < tiles.length; i++) if (tiles[i]) { const im = new Image(); im.src = tiles[i]; await im.decode(); g.drawImage(im, (i % 3) * 640, (i / 3 | 0) * 360); }
    return c.toDataURL('image/png');
  }, tiles));
});

/* stage 5: every model of both sides in a row along a street next to the houses (the scale), in TV and white-hot */
const lookAt = (x, z, zoom) => { GUNSHIP.look.set(x, groundH(x, z), z); GUNSHIP.aim.copy(GUNSHIP.look); GUNSHIP.ctr.copy(GUNSHIP.look); GUNSHIP.aimS.copy(GUNSHIP.look); GUNSHIP.vel.set(0, 0, 0); GUNSHIP.nextWander = 1e9; CFG.zoom = zoom; __t.sim(2.5); };
test('units lineup', async ({ wp }) => {
  await wp.page.setViewportSize({ width: 1600, height: 900 });
  await wp.boot({ query: '?hour=11&seed=11&spot=town&transit=0&season=summer&az=120' });
  await wp.run(`(${lookAt.toString()}, 0)`);
  await wp.run(() => {
    ALLIES.update = () => {};
    const T0 = LAYOUT.towns[0], r = LAYOUT.roads.filter(r => r.kind === 'street').sort((a, b) => Math.hypot(a.pts[0][0] - T0.x, a.pts[0][1] - T0.z) - Math.hypot(b.pts[0][0] - T0.x, b.pts[0][1] - T0.z))[0];
    const P = r.pts, i0 = Math.min(6, P.length - 1), list = [];
    for (const side of ['ally', 'enemy']) for (const k of ['tank', 'apc', 'car', 'heli']) for (const b of [].concat(UNIT_TYPES[side][k])) list.push([side, k, b]);
    window.__L = { pts: P.slice(i0, i0 + list.length * 3 + 6) };
    list.forEach(([side, k, b], n) => {
      const p = P[Math.min(P.length - 2, i0 + n * 3)], q = P[Math.min(P.length - 1, i0 + n * 3 + 1)], g = b(); if (k !== 'heli') g.scale.setScalar(ARMOR_SCALE);
      const nx = -(q[1] - p[1]), nz = q[0] - p[0], L = Math.hypot(nx, nz), off = side === 'ally' ? 2 : -2;
      g.position.set(p[0] + nx / L * off * (k === 'heli' ? 4 : 1), 0, p[1] + nz / L * off * (k === 'heli' ? 4 : 1)); g.position.y = groundH(g.position.x, g.position.z); g.rotation.y = -Math.atan2(q[1] - p[1], q[0] - p[0]); scene.add(g); TRACKS.push({ obj: g, side, inf: false, h: 2 });
    });
    const e = P[Math.min(P.length - 1, i0 + list.length * 3)];
    for (let i = 0; i < 8; i++) { const s = INF.add(i < 4 ? 'ally' : 'enemy', e[0] + (i % 4) * 1.2, e[1] + (i < 4 ? 3 : -3)); s.a = 0.6; }
    const m = P[Math.min(P.length - 1, i0 + Math.floor(list.length * 1.5))]; window.__L.c = m;
  });
  const shots = [];
  for (const [m, zoom] of [['tv', 70], ['wh', 70], ['tv', 220], ['wh', 220]]) {
    await wp.run(([m, zoom]) => { const c = window.__L.c; SENSOR.set(m); HUD.markModes(); updateEnvironment(); GUNSHIP.look.set(c[0], groundH(c[0], c[1]), c[1]); GUNSHIP.aim.copy(GUNSHIP.look); GUNSHIP.ctr.copy(GUNSHIP.look); GUNSHIP.aimS.copy(GUNSHIP.look); GUNSHIP.vel.set(0, 0, 0); CFG.zoom = zoom; __t.sim(2.5); __t.render(); }, [m, zoom]);
    shots.push((await wp.page.screenshot()).toString('base64'));
  }
  await sheet(wp, shots, 2, 'units-lineup.png');
});
/* stage 5: the patrols — an outpost, a column on the road, a helicopter up, the fireteam, night vision and white-hot */
test('patrols', async ({ wp }) => {
  await wp.page.setViewportSize({ width: 1280, height: 720 });
  await wp.boot({ query: '?hour=11&seed=11&spot=outpost&transit=0&season=summer' });
  const shots = [], at = async (fn, arg) => { await wp.run(fn, arg); shots.push((await wp.page.screenshot()).toString('base64')); };
  const follow = (o) => { const p = o.position || o; GUNSHIP.look.set(p.x, groundH(p.x, p.z), p.z); GUNSHIP.aim.copy(GUNSHIP.look); GUNSHIP.ctr.copy(GUNSHIP.look); GUNSHIP.aimS.copy(GUNSHIP.look); GUNSHIP.vel.set(0, 0, 0); GUNSHIP.nextWander = 1e9; };
  await wp.run(`window.__follow = ${follow.toString()}`);
  await at(() => { CFG.zoom = 70; const o = LAYOUT.outposts[0]; __follow({ x: o.x, z: o.z }); __t.sim(2); __t.render(); });
  await at(() => { const P = ALLIES.posts[0]; P.timer = 0; __t.sim(40, {}); CFG.zoom = 100; __follow(P.col.u[0].obj); __t.sim(0.05); __t.render(); });
  await at(() => { const h = ALLIES.helis[0]; h.timer = 0; for (let i = 0; i < 200 && h.state !== 'fly'; i++) __t.sim(0.5); __t.sim(4); CFG.zoom = 90; const up = h.pos.y - groundH(h.pos.x, h.pos.z); __follow({ x: h.pos.x - Math.cos(camAz) * up, z: h.pos.z - Math.sin(camAz) * up }); __t.sim(0.05); __t.render(); });
  await at(() => { const s = ALLIES.squads[0].m[1]; CFG.zoom = 230; __follow(s); __t.sim(0.05); __t.render(); });
  await at(() => { CFG.fixedHour = 23.5; SENSOR.set('nv'); HUD.markModes(); updateEnvironment(); const o = LAYOUT.outposts[0]; CFG.zoom = 80; __follow({ x: o.x, z: o.z }); __t.sim(0.05); __t.render(); });
  await at(() => { SENSOR.set('wh'); HUD.markModes(); updateEnvironment(); const P = ALLIES.posts[0]; CFG.zoom = 110; __follow(P.col.u[0].obj); __t.sim(0.05); __t.render(); });
  await sheet(wp, shots, 3, 'units-patrols.png');
});

/* stage 6: the fight as the camera sees it (the music armed it; the frames are whatever the gunship looks at) */
const afterShot = () => { const n = BATTLE.stat.shots; for (let i = 0; i < 400 && BATTLE.stat.shots === n; i++) __t.sim(0.05, { audio: true }); __t.sim(0.4, { audio: true }); __t.render(); };
test('battle', async ({ wp }) => {
  await wp.page.setViewportSize({ width: 1280, height: 720 });
  await wp.boot({ query: '?hour=11&seed=11&season=summer' });
  const shots = [], snap = async () => shots.push((await wp.page.screenshot()).toString('base64')), at = async (fn, arg) => { await wp.run(fn, arg); await snap(); };
  await wp.run(`window.__shot = ${afterShot.toString()}`);
  await at(() => { __t.sim(5.5, { audio: true }); for (let i = 0; i < 600 && GUNSHIP.state === 'transit'; i++) __t.sim(0.05, { audio: true }); __t.sim(1.5, { audio: true }); __shot(); });
  await at(() => { __t.sim(8, { audio: true }); SENSOR.set('wh'); HUD.markModes(); updateEnvironment(); __shot(); });
  await at(() => { __t.sim(25, { audio: true }); SENSOR.set('tv'); HUD.markModes(); updateEnvironment(); __shot(); });
  await at(() => { __t.sim(60, { audio: true }); SENSOR.set('bh'); HUD.markModes(); updateEnvironment(); __shot(); });
  await at(() => { __t.sim(40, { audio: true }); CFG.fixedHour = 23.5; SENSOR.set('nv'); HUD.markModes(); updateEnvironment(); __shot(); });
  await at(() => { CFG.fixedHour = 11; SENSOR.set('tv'); HUD.markModes(); updateEnvironment(); __t.sim(30, { audio: true }); __t.sim(9); __t.render(); });   // the music has stopped: they leave
  await sheet(wp, shots, 3, 'battle.png');
});
test('weapons firing', async ({ wp }) => {
  await wp.page.setViewportSize({ width: 960, height: 540 });
  const shots = [];
  for (const id of ['g25', 'g30', 'h105', 'b40', 'hf', 'apk', 'gbu', 'aim', 'las', 'rail']) {
    const q = `?hour=11&seed=11&season=summer&weapons=${id}&auto=0`;
    if (!shots.length) await wp.boot({ query: q }); else await wp.goto(q);
    await wp.run((id) => {
      __t.sim(5.5, { audio: true }); for (let i = 0; i < 600 && GUNSHIP.state === 'transit'; i++) __t.sim(0.05, { audio: true });
      const hit = () => id === 'las' ? BATTLE.beam.visible : BATTLE.missiles.some(m => m.p > 0.5) || BATTLE.stat.shots > (window.__n || 0);
      window.__n = 0; for (let k = 0; k < (id === 'aim' ? 1 : 3); k++) { window.__n = BATTLE.stat.shots; for (let i = 0; i < 3000 && !hit(); i++) __t.sim(0.05, { audio: true }); }
      __t.sim(BATTLE.missiles.length || id === 'las' ? 0.1 : 0.35, { audio: true }); __t.render();
    }, id);
    shots.push((await wp.page.screenshot()).toString('base64'));
  }
  await sheet(wp, shots, 5, 'battle-weapons.png');
});

/* stage 7: clouds, weather, night, anti-aircraft fire and flares */
test('weather', async ({ wp }) => {
  await wp.page.setViewportSize({ width: 1280, height: 720 });
  const shots = [], snap = async () => shots.push((await wp.page.screenshot()).toString('base64'));
  const view = async (q, fn) => { const url = '?seed=11&transit=0&spot=town&' + q; if (!shots.length) await wp.boot({ query: url }); else await wp.goto(url); await wp.run(fn || (() => { __t.sim(20); __t.render(); })); await snap(); };
  await view('hour=11&season=summer&weather=clear&clouds=70', () => { __t.sim(20); const c = WEATHER.clouds[0], d = new THREE.Vector3().subVectors(camera.position, CAM_TGT).normalize(); c.x = CAM_TGT.x + d.x * 150 + 25; c.z = CAM_TGT.z + d.z * 150; __t.sim(0.05); __t.render(); });   // (a cloud drifting across the frame)
  await view('hour=11&season=summer&weather=rain');
  await view('hour=11&season=winter&weather=snow');
  await view('hour=9&season=autumn&weather=fog&clouds=0');
  await view('hour=9&season=autumn&weather=fog&clouds=0&mode=wh');
  await view('hour=23&season=summer&weather=clear&clouds=0');
  const fight = () => { __t.sim(5.5, { audio: true }); for (let i = 0; i < 600 && GUNSHIP.state === 'transit'; i++) __t.sim(0.05, { audio: true }); __t.sim(4, { audio: true }); };
  await wp.goto('?seed=11&hour=11&season=summer&weather=clear'); await wp.run(`(${fight})()`);
  await wp.run(() => { AA.nextGun = 0; for (let i = 0; i < 400 && !AA.bursts.length; i++) __t.sim(0.05, { audio: true }); __t.sim(0.75, { audio: true }); __t.render(); }); await snap();
  await wp.run(() => { const u = AA.source(true) || AA.source(false); AA.launch(u); __t.sim(1.5, { audio: true }); __t.render(); }); await snap();
  await wp.run(() => { __t.sim(0.9, { audio: true }); SENSOR.set('wh'); HUD.markModes(); updateEnvironment(); __t.render(); }); await snap();
  await sheet(wp, shots, 3, 'weather.png');
});

/* stage 8: the look of the light and the colours (compared before / after the change to r187's own lighting and colour management) */
test('lighting', async ({ wp }) => {
  await wp.page.setViewportSize({ width: 960, height: 540 });
  const shots = [], snap = async () => shots.push((await wp.page.screenshot()).toString('base64'));
  const view = async (q) => { const url = '?seed=11&transit=0&hud=0&weather=clear&clouds=0&az=135&' + q; if (!shots.length) await wp.boot({ query: url }); else await wp.goto(url); await wp.run(() => { __t.sim(2); __t.render(); }); await snap(); };
  await view('spot=town&hour=12&season=summer');
  await view('spot=town&hour=19.6&season=summer');
  await view('spot=town&hour=23.5&season=summer');
  await view('spot=fields&hour=12&season=autumn');
  await view('spot=town&hour=12&season=winter');
  await view('spot=outpost&hour=10&season=spring&zoom=80');
  await view('spot=town&hour=12&season=summer&mode=wh');
  await view('spot=town&hour=23.5&season=summer&mode=bh');
  await view('spot=town&hour=23.5&season=summer&mode=nv');
  await wp.goto('?seed=11&hud=0&weather=clear&clouds=0&hour=12&season=summer');
  await wp.run(() => { __t.sim(5.5, { audio: true }); for (let i = 0; i < 600 && GUNSHIP.state === 'transit'; i++) __t.sim(0.05, { audio: true }); const n = BATTLE.stat.shots; for (let i = 0; i < 400 && BATTLE.stat.shots < n + 2; i++) __t.sim(0.05, { audio: true }); __t.sim(0.4, { audio: true }); __t.render(); }); await snap();
  await wp.run(() => { CFG.fixedHour = 23.5; updateEnvironment(); const n = BATTLE.stat.shots; for (let i = 0; i < 400 && BATTLE.stat.shots < n + 1; i++) __t.sim(0.05, { audio: true }); __t.sim(0.4, { audio: true }); __t.render(); }); await snap();
  await wp.run(() => { SENSOR.set('wh'); updateEnvironment(); const n = BATTLE.stat.shots; for (let i = 0; i < 400 && BATTLE.stat.shots < n + 1; i++) __t.sim(0.05, { audio: true }); __t.sim(0.4, { audio: true }); __t.render(); }); await snap();
  await sheet(wp, shots, 3, 'lighting.png');
});

/* stage 9: night lights (windows, headlights, the helicopters' navigation lights) */
test('night lights', async ({ wp }) => {
  await wp.page.setViewportSize({ width: 1280, height: 720 });
  const shots = [], at = async (fn, arg) => { await wp.run(fn, arg); shots.push((await wp.page.screenshot()).toString('base64')); };
  await wp.boot({ query: '?hour=23.5&seed=11&spot=town&transit=0&season=summer&weather=clear&clouds=0&mode=tv' });
  const follow = (o) => { const p = o.position || o; GUNSHIP.look.set(p.x, groundH(p.x, p.z), p.z); GUNSHIP.aim.copy(GUNSHIP.look); GUNSHIP.ctr.copy(GUNSHIP.look); GUNSHIP.aimS.copy(GUNSHIP.look); GUNSHIP.vel.set(0, 0, 0); GUNSHIP.nextWander = 1e9; };
  await wp.run(`window.__follow = ${follow.toString()}`);
  await at(() => { CFG.zoom = 70; __t.sim(2); __t.render(); });
  await at(() => { const P = ALLIES.posts[0]; P.timer = 0; __t.sim(40, {}); CFG.zoom = 110; __follow(P.col.u[0].obj); __t.sim(0.05); __t.render(); });
  await at(() => { SENSOR.set('nv'); HUD.markModes(); updateEnvironment(); CFG.zoom = 150; __t.sim(0.05); __t.render(); });
  await at(() => { SENSOR.set('tv'); HUD.markModes(); updateEnvironment(); const h = ALLIES.helis[0]; h.timer = 0; for (let i = 0; i < 200 && h.state !== 'fly'; i++) __t.sim(0.5); __t.sim(4); h.strobe = 0; CFG.zoom = 110; const up = h.pos.y - groundH(h.pos.x, h.pos.z); __follow({ x: h.pos.x - Math.cos(camAz) * up, z: h.pos.z - Math.sin(camAz) * up }); __t.sim(0.05); __t.render(); });
  await at(() => { const o = LAYOUT.outposts[0]; CFG.zoom = 60; __follow({ x: o.x, z: o.z }); __t.sim(0.05); __t.render(); });
  await wp.goto('?hour=23.5&seed=11&season=summer&weather=clear&clouds=0&mode=tv&aa=0');
  await wp.run(`window.__follow = ${follow.toString()}`);
  await at(() => { __t.sim(5.5, { audio: true }); for (let i = 0; i < 600 && GUNSHIP.state === 'transit'; i++) __t.sim(0.05, { audio: true }); __t.sim(1, { audio: true }); CFG.zoom = 70; if (BATTLE.base) __follow(BATTLE.base); __t.sim(0.5, { audio: true }); __t.render(); });
  await sheet(wp, shots, 3, 'night-lights.png');
});

/* stage 10: the big guns in frame (the 105 mm and the railgun on the aircraft): both at rest, their shots, the sensor slewed down
   and up off the orbit's centre, thermal after a series, night, a fight with the tracer out of the barrel */
test('big guns', async ({ wp }) => {
  await wp.page.setViewportSize({ width: 1280, height: 720 });
  const shots = [], at = async (fn, arg) => { await wp.run(fn, arg); shots.push((await wp.page.screenshot()).toString('base64')); };
  await wp.boot({ query: '?hour=11&seed=11&spot=town&transit=0&season=summer&weather=clear&clouds=0&mode=tv&weapons=h105,rail&auto=0' });
  await wp.run(() => { window.__slew = (m) => { const c = GUNSHIP.ctr, dx = camera.position.x - c.x, dz = camera.position.z - c.z, d = Math.hypot(dx, dz); GUNSHIP.nextWander = 1e9; GUNSHIP.vel.set(0, 0, 0); GUNSHIP.look.set(c.x + dx / d * m, 0, c.z + dz / d * m); GUNSHIP.aim.copy(GUNSHIP.look); GUNSHIP.aimS.copy(GUNSHIP.look); }; });
  await at(() => { __t.sim(1.5); __t.render(); });
  await at(() => { GUNS.shot('h105'); __t.sim(0.03); __t.render(); });
  await at(() => { __t.sim(0.6); GUNS.shot('rail'); __t.sim(0.03); __t.render(); });
  await at(() => { __t.sim(1.5); __slew(110); __t.sim(0.05); __t.render(); });
  await at(() => { __slew(-120); __t.sim(0.05); __t.render(); });
  await at(() => { __slew(0); CFG.zoom = 60; __t.sim(2); __t.render(); });
  await at(() => { CFG.zoom = 150; __t.sim(2); __t.render(); CFG.zoom = 100; __t.sim(2); });
  await at(() => { __slew(0); for (let i = 0; i < 5; i++) { GUNS.shot('h105'); __t.sim(0.6); } SENSOR.set('wh'); HUD.markModes(); updateEnvironment(); __t.sim(0.05); __t.render(); });
  await at(() => { SENSOR.set('tv'); HUD.markModes(); CFG.fixedHour = 23.5; updateEnvironment(); GUNS.shot('rail'); __t.sim(0.03); __t.render(); });
  for (const id of ['h105', 'rail']) {
    await wp.goto(`?hour=11&seed=11&season=summer&weather=clear&clouds=0&mode=tv&weapons=${id}&auto=0&aa=0`);
    await at((id) => {
      __t.sim(5.5, { audio: true }); for (let i = 0; i < 600 && GUNSHIP.state === 'transit'; i++) __t.sim(0.05, { audio: true });
      const n = BATTLE.stat.shots + 1; for (let i = 0; i < 4000 && BATTLE.stat.shots < n; i++) __t.sim(0.05, { audio: true });
      __t.render();
    }, id);
  }
  await sheet(wp, shots, 3, 'big-guns.png');
});

/* ===== stage 11: the Workshop preview (preview.gif: animated, 256x256, < 1 MB) and the README screenshots (screenshots/*.jpg)
   -g gif → test-results/gif-<seed>.gif (+ gif-<seed>-sheet.png, four of its frames); -g screens → test-results/shot-*.jpg.
   Copy the best ones over preview.gif / screenshots/. The HUD canvas is drawn over the picture (the DOM buttons are not). */
const GIF = { size: 256, render: 768, frames: 40, fps: 10, colors: 64 };
const FIGHT = (q) => `?seed=${q.seed}&hour=${q.hour}&season=${q.season}&weather=clear&clouds=0&mode=${q.mode}&transit=0&aa=0`;
async function intoFight(wp) {   // music until the gunship is over the enemy and has fired a few times
  await wp.run(() => { __t.sim(5.5, { audio: true }); for (let i = 0; i < 1200 && (GUNSHIP.state === 'transit' || BATTLE.stat.shots < 6); i++) __t.sim(0.05, { audio: true }); });
}
const grab = (size) => {   // the picture with the HUD over it, downscaled in halving steps (in the task of the render: the WebGL buffer is still there)
  __t.render();
  const C = window.__shotC || (window.__shotC = {}), src0 = renderer.domElement, W = src0.width, H = src0.height;
  const full = C.full || (C.full = document.createElement('canvas')); full.width = W; full.height = H;
  const g = full.getContext('2d'); g.drawImage(src0, 0, 0); if (HUD.cv) g.drawImage(HUD.cv, 0, 0, W, H);
  let src = full, w = W, h = H;
  while (w > size[0]) { w = Math.max(size[0], w >> 1); h = Math.round(w * H / W); const c = C[w] || (C[w] = document.createElement('canvas')); c.width = w; c.height = h; const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, w, h); src = c; }
  return src;
};
test.describe('gif', () => {
  test.use({ viewport: { width: GIF.render, height: GIF.render } });
  for (const q of [{ seed: 11, hour: 23, season: 'summer', mode: 'wh' }, { seed: 29, hour: 23, season: 'autumn', mode: 'wh' }, { seed: 11, hour: 15, season: 'summer', mode: 'tv' }]) test(`gif, ${q.mode} seed ${q.seed}`, async ({ wp }) => {
    test.setTimeout(6 * 60 * 1000);
    await wp.boot({ query: FIGHT(q) + '&weapons=g25&auto=0&enemies=200' });   // (the 25 mm: a stream of tracers on every beat)
    await intoFight(wp); await wp.run(() => {
      BATTLE.nextHop = 1e9; CFG.zoom = 135; __t.sim(1.5, { audio: true });   // (closer; no hop to another fight while it records)
      const at = []; for (let i = 0, n = BATTLE.stat.shots; i < 2400; i++) { __t.sim(0.05, { audio: true }); if (BATTLE.stat.shots > n) { n = BATTLE.stat.shots; at.push(T); } if (at.filter(t => T - t < 1.6).length >= 4 && ARMS.st.g25.reload <= 0 && ARMS.st.g25.mag >= 200) break; }   // (start in a burst: four volleys in the last 1.6 s, a full magazine)
      for (const u of UNITS) if (u.side === 'enemy' && u.kind !== 'struct') u.hp = 1e6;   // (staged for the preview: the targets outlast the clip, the 25 mm keeps firing at them)
      window.__s0 = BATTLE.stat.shots;
    });
    const frames = [];
    for (let i = 0; i < GIF.frames; i++) {
      await wp.sim(1 / GIF.fps, { audio: true });
      const b64 = await wp.run(([size, i, n, grabSrc]) => {
        const src = (0, eval)('(' + grabSrc + ')')([size, size]), C = window.__shotC;
        const sheet = C.sheet || (C.sheet = Object.assign(document.createElement('canvas'), { width: size * 2, height: size * 2 }));
        const k = [0, n / 3, 2 * n / 3, n - 1].map(Math.floor).indexOf(i); if (k >= 0) sheet.getContext('2d').drawImage(src, (k % 2) * size, (k >> 1) * size);
        const d = src.getContext('2d').getImageData(0, 0, size, size).data;
        let s = ''; for (let j = 0; j < d.length; j += 0x8000) s += String.fromCharCode.apply(null, d.subarray(j, j + 0x8000));
        return btoa(s);
      }, [GIF.size, i, GIF.frames, grab.toString()]);
      frames.push(new Uint8Array(Buffer.from(b64, 'base64')));
    }
    console.log(`${q.mode} ${q.seed}: ${await wp.run(() => BATTLE.stat.shots - __s0)} volleys while recording`);
    const { GIFEncoder, quantize, applyPalette } = require('gifenc'), name = `gif-${q.mode}-${q.seed}`;
    save(`${name}-sheet.png`, await wp.run(() => __shotC.sheet.toDataURL('image/png')));
    const all = new Uint8Array(frames[0].length * Math.ceil(frames.length / 2)); frames.filter((f, i) => i % 2 === 0).forEach((f, i) => all.set(f, i * f.length));
    const palette = quantize(all, GIF.colors), gif = GIFEncoder();
    frames.forEach((f, i) => gif.writeFrame(applyPalette(f, palette), GIF.size, GIF.size, i ? { delay: 1000 / GIF.fps } : { palette, delay: 1000 / GIF.fps, repeat: 0 }));
    gif.finish(); const bytes = gif.bytes(); fs.writeFileSync(path.join(OUT, name + '.gif'), bytes);
    console.log(`${name}.gif: ${(bytes.length / 1024).toFixed(0)} KB`);
    if (bytes.length >= 1024 * 1024) throw new Error('Wallpaper Engine takes previews under 1 MB');
  });
});
test('screens', async ({ wp }) => {
  test.setTimeout(8 * 60 * 1000);
  await wp.page.setViewportSize({ width: 1280, height: 720 });
  const shot = async (name) => save(`shot-${name}.jpg`, await wp.run((g) => (0, eval)('(' + g + ')')([1280, 720]).toDataURL('image/jpeg', 0.88), grab.toString()));
  await wp.boot({ query: '?seed=11&hour=10.5&season=summer&weather=clear&clouds=20&mode=tv&spot=town&transit=0' }); await wp.sim(3); await shot('day-tv');
  await wp.goto('?seed=47&hour=8&season=winter&weather=clear&clouds=40&mode=tv&transit=0'); await wp.sim(3); await shot('winter-tv');
  await wp.goto(FIGHT({ seed: 11, hour: 23, season: 'summer', mode: 'wh' }) + '&weapons=g25,h105'); await intoFight(wp); await shot('fight-wh');
  await wp.goto(FIGHT({ seed: 29, hour: 22, season: 'autumn', mode: 'nv' }) + '&weapons=g30,h105,rail'); await intoFight(wp); await shot('fight-nv');
  await wp.goto(FIGHT({ seed: 23, hour: 16, season: 'summer', mode: 'tv' }) + '&weapons=h105,rail'); await intoFight(wp); await shot('fight-tv');
  await wp.goto('?seed=11&hour=23.5&season=summer&weather=clear&clouds=0&mode=tv&spot=town&transit=0'); await wp.sim(3); await shot('night-tv');
});

/* the settings drawer of the browser preview, open; and the splash screen */
test('settings panel', async ({ wp }) => {
  await wp.page.setViewportSize({ width: 1280, height: 720 });
  await wp.boot({ we: false, query: '?seed=11&hour=10.5&season=summer&weather=clear&mode=tv&spot=town&transit=0&cfg=1' });
  await wp.run(() => { __t.sim(2); __t.render(); document.getElementById('cfg').classList.add('open'); });
  await wp.page.waitForTimeout(400);
  save('settings-panel.png', 'x,' + (await wp.page.screenshot()).toString('base64'));
  await wp.run(() => { document.getElementById('cfg').classList.remove('open'); const s = document.createElement('div'); s.id = 'splash'; s.innerHTML = '<div class="t">DANGER CLOSE</div><div class="s">ACQUIRING SENSOR FEED</div>'; s.style.animation = 'none'; document.body.append(s); });
  save('splash.png', 'x,' + (await wp.page.screenshot()).toString('base64'));
});

/* stage 12: the red laser and its red glow where it hits — by day, at dusk, at night, night vision, white-hot */
test('laser', async ({ wp }) => {
  await wp.page.setViewportSize({ width: 1280, height: 720 });
  const shots = [];
  for (const [hour, mode] of [[12, 'tv'], [19.6, 'tv'], [23, 'tv'], [23, 'nv'], [23, 'wh'], [12, 'tv']]) {
    const q = `?seed=11&hour=${hour}&season=summer&weather=clear&clouds=0&mode=${mode}&transit=0&aa=0&weapons=las&auto=0`;
    if (!shots.length) await wp.boot({ query: q }); else await wp.goto(q);
    await wp.run((zoom) => {
      __t.sim(5.5, { audio: true }); for (let i = 0; i < 1200 && (GUNSHIP.state === 'transit' || BATTLE.stat.out < 1); i++) __t.sim(0.05, { audio: true });
      for (let i = 0; i < 2400 && !BATTLE.beam.visible; i++) __t.sim(0.05, { audio: true });
      __t.sim(0.3, { audio: true }); for (let i = 0; i < 200 && !BATTLE.beam.visible; i++) __t.sim(0.05, { audio: true });
      if (zoom) { CFG.zoom = zoom; __t.sim(1.5, { audio: true }); for (let i = 0; i < 400 && !BATTLE.beam.visible; i++) __t.sim(0.05, { audio: true }); }
      __t.render();
    }, shots.length === 5 ? 190 : 0);
    shots.push((await wp.page.screenshot()).toString('base64'));
  }
  await sheet(wp, shots, 3, 'laser.png');
});

/* stage 13: the music drives it — a fight on a kick and just before the next one (TV by day, white-hot at night), a drop's surge */
test('music', async ({ wp }) => {
  await wp.page.setViewportSize({ width: 1280, height: 720 });
  await wp.boot({ query: '?hour=11&seed=11&season=summer&weather=clear&clouds=0&transit=0' });
  const shots = [], at = async (fn) => { await wp.run(fn); shots.push((await wp.page.screenshot()).toString('base64')); };
  const onKick = () => { for (let i = 0; i < 60; i++) { const was = BANDS.low.last; __t.sim(0.05, { audio: true }); if (BANDS.low.last !== was && BANDS.low.last - was > 0.4) break; } __t.render(); };
  await wp.run(`window.__kick = ${onKick.toString()}`);
  await at(() => { __t.sim(5.5, { audio: true }); for (let i = 0; i < 1200 && GUNSHIP.state === 'transit'; i++) __t.sim(0.05, { audio: true }); __t.sim(12, { audio: true }); __kick(); });
  await at(() => { __t.sim(0.4, { audio: true }); __t.render(); });
  await at(() => { CFG.fixedHour = 23.5; SENSOR.set('wh'); HUD.markModes(); updateEnvironment(); __t.sim(3, { audio: true }); __kick(); });
  await at(() => { __t.sim(0.4, { audio: true }); __t.render(); });
  await at(() => { CFG.fixedHour = 11; SENSOR.set('tv'); HUD.markModes(); updateEnvironment(); const n = BATTLE.stat.drops; for (let i = 0; i < 1600 && BATTLE.stat.drops === n; i++) __t.sim(0.05, { audio: true, pauses: true }); __t.sim(0.3, { audio: true, pauses: true }); __t.render(); });
  await at(() => { __t.sim(0.9, { audio: true, pauses: true }); __t.render(); });
  console.log('music stat', JSON.stringify(await wp.run(() => BATTLE.stat)));
  await sheet(wp, shots, 2, 'music.png');
});

/* the helicopters' rocket runs: lined up and diving in, the salvo in flight, the rockets bursting round the target (by day, white-hot at night) */
test('rocket run', async ({ wp }) => {
  await wp.page.setViewportSize({ width: 1280, height: 720 });
  const shots = [], snap = async () => shots.push((await wp.page.screenshot()).toString('base64'));
  for (const [hour, mode] of [[11, 'tv'], [23, 'wh']]) {
    const q = `?seed=11&hour=${hour}&season=summer&weather=clear&clouds=0&mode=${mode}&transit=0`;
    if (!shots.length) await wp.boot({ query: q }); else await wp.goto(q);
    const ok = await wp.run(() => {
      window.__look = (x, z) => { GUNSHIP.look.set(x, groundH(x, z), z); GUNSHIP.aim.copy(GUNSHIP.look); GUNSHIP.aimS.copy(GUNSHIP.look); GUNSHIP.vel.set(0, 0, 0); GUNSHIP.ctr.copy(GUNSHIP.look); GUNSHIP.nextWander = 1e9; };
      __t.sim(5.5, { audio: true }); for (let i = 0; i < 1200 && GUNSHIP.state === 'transit'; i++) __t.sim(0.05, { audio: true });
      BATTLE.aimCamera = () => {}; CFG.zoom = 45;
      let h = null; for (let i = 0; i < 6000 && !h; i++) { __t.sim(0.05, { audio: true }); h = UNITS.find(u => u.kind === 'heli' && u.run && u.run.ph === 'in' && u.run.armed); }
      if (!h) return false;
      window.__h = h; window.__tg = h.run.tgt; __look(h.pos.x * 0.6 + __tg.pos.x * 0.4, h.pos.z * 0.6 + __tg.pos.z * 0.4); __t.sim(0.05, { audio: true }); __t.render(); return true;
    });
    if (!ok) { console.log('no run found'); continue; }
    await snap();
    await wp.run(() => {
      const h = __h, t = __tg;
      for (let i = 0; i < 60 && h.run && h.run.ph === 'in'; i++) { __look((h.pos.x + t.pos.x) / 2, (h.pos.z + t.pos.z) / 2); __t.sim(0.05, { audio: true }); }
      __t.sim(0.3, { audio: true }); __look(t.pos.x * 0.7 + h.pos.x * 0.3, t.pos.z * 0.7 + h.pos.z * 0.3); __t.sim(0.05, { audio: true }); __t.render();
    });
    await snap();
    await wp.run(() => { __t.sim(1.3, { audio: true }); __t.render(); });
    await snap();
  }
  await sheet(wp, shots, 3, 'rocket-run.png');
});

/* an APC lets its infantry out: the first through the rear door, the file running out, the squad spread round it (by day, white-hot at night) */
test('dismount', async ({ wp }) => {
  await wp.page.setViewportSize({ width: 1280, height: 720 });
  const shots = [], snap = async () => shots.push((await wp.page.screenshot()).toString('base64'));
  for (const [hour, mode] of [[11, 'tv'], [23, 'wh']]) {
    const q = `?seed=11&hour=${hour}&season=summer&weather=clear&clouds=0&mode=${mode}&transit=0`;
    if (!shots.length) await wp.boot({ query: q }); else await wp.goto(q);
    const ok = await wp.run(() => {
      window.__look = (x, z) => { GUNSHIP.look.set(x, groundH(x, z), z); GUNSHIP.aim.copy(GUNSHIP.look); GUNSHIP.aimS.copy(GUNSHIP.look); GUNSHIP.vel.set(0, 0, 0); GUNSHIP.ctr.copy(GUNSHIP.look); GUNSHIP.nextWander = 1e9; };
      __t.sim(5.5, { audio: true }); for (let i = 0; i < 1200 && GUNSHIP.state === 'transit'; i++) __t.sim(0.05, { audio: true });
      BATTLE.aimCamera = () => {}; CFG.zoom = 170; CFG.fire = 10;
      let v = null; const d0 = BATTLE.dismount.bind(BATTLE); BATTLE.dismount = u => { const n = BATTLE.stat.dismounts; d0(u); if (BATTLE.stat.dismounts > n && !v) v = u; };
      for (let i = 0; i < 6000 && !v; i++) __t.sim(0.05, { audio: true });
      if (!v) return false;
      window.__v = v; const c = Math.cos(v.yaw), s = Math.sin(v.yaw); window.__lk = [v.pos.x - c * 8, v.pos.z - s * 8];
      __look(...__lk); __t.sim(1.2, { audio: true }); __look(...__lk); __t.render(); return true;
    });
    if (!ok) { console.log('no dismount found'); continue; }
    await snap();
    await wp.run(() => { for (let i = 0; i < 50; i++) { __look(...__lk); __t.sim(0.05, { audio: true }); } __t.render(); });
    await snap();
    await wp.run(() => { CFG.zoom = 110; for (let i = 0; i < 100; i++) { __look(...__lk); __t.sim(0.05, { audio: true }); } __t.render(); });
    await snap();
  }
  await sheet(wp, shots, 3, 'dismount.png');
});
