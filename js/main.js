'use strict';
/* ===== Scene, camera, light & seasons, Wallpaper Engine properties, main loop ===== */
let scene, camera, renderer, sunLight, hemi;
const FX = {};
let T = 0, paused = false, fpsLimit = 0, lastMs = 0, ready = false, worldSeed = 0;
const ENV = { elev: 30, night: 0, day: 1, smokeTint: new THREE.Color(0xbbbbbb), dustTint: new THREE.Color(0xa89878) };
function RT() { return performance.now() / 1000; }

/* ---- URL test parameters (for browser preview) ---- */
const QS = new URLSearchParams(location.search);
if (QS.has('hour')) { CFG.timeMode = 'fixed'; CFG.fixedHour = parseFloat(QS.get('hour')); }
if (QS.has('zoom')) CFG.zoom = parseFloat(QS.get('zoom'));
if (QS.has('season')) CFG.season = QS.get('season');
if (QS.has('mode')) CFG.vision = QS.get('mode');
if (QS.has('seed')) CFG.seed = parseInt(QS.get('seed'), 10) || 0;
if (QS.has('weapons')) CFG.weapons = QS.get('weapons') === 'all' ? WEAPONS.map(w => w.id) : QS.get('weapons').split(',');
if (QS.has('transit')) CFG.transitMin = parseFloat(QS.get('transit'));
if (QS.has('weather')) CFG.weather = QS.get('weather');
if (QS.has('clouds')) CFG.clouds = parseFloat(QS.get('clouds'));
if (QS.has('aa')) CFG.aa = QS.get('aa') !== '0';
if (QS.has('auto')) CFG.autoArms = QS.get('auto') !== '0';
if (QS.has('enemies')) CFG.enemies = parseFloat(QS.get('enemies'));

/* ---- Wallpaper Engine properties (project.json; in a browser the settings panel feeds the same listener: js/settings.js) ----
   They may come before the world is built (then init reads CFG) or at any time after it (then they apply at once). The URL's
   test parameters win over them. A new seed rebuilds the map: a reload. */
window.wallpaperPropertyListener = {
  applyUserProperties(p) {
    const has = k => p[k] !== undefined && p[k] !== null, v = k => p[k].value, url = k => QS.has(k);
    if (has('vision') && !url('mode')) { CFG.vision = v('vision'); if (ready && !SENSOR.manual) { SENSOR.set(SENSOR.initial()); HUD.markModes(); } }
    if (has('zoom') && !url('zoom')) CFG.zoom = v('zoom');
    if (has('orbit')) CFG.orbit = v('orbit');
    if (has('transit') && !url('transit')) { CFG.transitMin = v('transit'); if (ready) GUNSHIP.nextTransit = T + GUNSHIP.interval(); }
    if (has('callsign')) CFG.callsign = String(v('callsign') || '').trim().toUpperCase().slice(0, 20) || 'GHOSTRIDER 31';
    if (has('hudscale')) CFG.hudScale = v('hudscale') / 100;
    if (has('hudbottom')) CFG.hudBottom = v('hudbottom');
    if (has('timemode') && !url('hour')) CFG.timeMode = v('timemode');
    if (has('fixedhour') && !url('hour')) CFG.fixedHour = v('fixedhour');
    if (has('season') && !url('season')) CFG.season = v('season');
    if (has('weather') && !url('weather')) CFG.weather = v('weather');
    if (has('clouds') && !url('clouds')) CFG.clouds = v('clouds');
    let arms = false;
    if (!url('weapons')) for (const w of WEAPONS) if (has('w_' + w.id)) { const on = !!v('w_' + w.id), i = CFG.weapons.indexOf(w.id); if (on && i < 0) CFG.weapons.push(w.id); if (!on && i >= 0) CFG.weapons.splice(i, 1); arms = true; }
    if (arms) CFG.weapons.sort((a, b) => WEAPONS.indexOf(WEAPON[a]) - WEAPONS.indexOf(WEAPON[b]));
    if (has('autoarms') && !url('auto')) CFG.autoArms = !!v('autoarms');
    if (has('sens')) CFG.sens = v('sens');
    if (has('fire')) CFG.fire = v('fire');
    if (has('enemies') && !url('enemies')) CFG.enemies = v('enemies');
    if (has('allies')) CFG.allies = v('allies');
    if (has('aa') && !url('aa')) CFG.aa = !!v('aa');
    if (has('shadows')) { CFG.shadows = !!v('shadows'); if (sunLight) sunLight.castShadow = CFG.shadows; }
    if (has('quality')) { CFG.quality = v('quality'); applyQuality(); }
    if (has('seed') && !url('seed')) { const s = Math.max(0, Math.round(v('seed'))); if (s !== CFG.seed) { CFG.seed = s; if (s && worldSeed && s !== worldSeed) location.reload(); } }
    if (!ready) return;
    if (arms) { if (!CFG.weapons.includes(ARMS.cur)) ARMS.cur = CFG.weapons[0] || null; HUD.buildArms(); }
    HUD.resize(); updateEnvironment();
  },
  applyGeneralProperties(p) { if (p.fps !== undefined) fpsLimit = p.fps; },
  setPaused(v) { paused = v; }
};

/* the quality setting: the render target's antialiasing and the pixel ratio */
function applyQuality() {
  const q = CFG.quality, pr = q === 'high' ? Math.min(window.devicePixelRatio || 1, 1.5) : q === 'medium' ? 1 : 0.75;
  CFG.msaa = q === 'low' ? 0 : 4; if (!renderer) return;
  renderer.setPixelRatio(pr);
  if (SENSOR.rt && SENSOR.rt.samples !== CFG.msaa) { SENSOR.rt.samples = CFG.msaa; SENSOR.rt.dispose(); }   // (made again with the new samples on its next use)
  if (ready) resize(); else if (SENSOR.rt) SENSOR.resize(renderer);
}

/* ---- init: the renderer at once, the world in slices under the splash ---- */
function init() {
  const canvas = document.getElementById('c');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, precision: 'highp', powerPreference: 'high-performance' });   // (MSAA is on the render target)
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  applyQuality();
  renderer.setSize(Math.max(1, window.innerWidth), Math.max(1, window.innerHeight), false);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  SENSOR.build(renderer);
  scene = new THREE.Scene(); scene.fog = new THREE.Fog(0x9fc0da, CAM_D + 150, CAM_D + 1100);
  camera = new THREE.PerspectiveCamera(16, 1, 30, 2400);

  hemi = new THREE.HemisphereLight(0xffffff, 0x333333, 0.6); scene.add(hemi);
  sunLight = new THREE.DirectionalLight(0xffffff, 1);
  sunLight.castShadow = CFG.shadows;
  sunLight.shadow.mapSize.set(SHADOW_N, SHADOW_N);
  Object.assign(sunLight.shadow.camera, { left: -50, right: 50, top: 50, bottom: -50, near: 1, far: 1600 });   // bounds: fitShadow()
  sunLight.shadow.bias = -0.0012; sunLight.shadow.normalBias = 1.1;   // (in linear light a faint acne under the moon would show)
  scene.add(sunLight); scene.add(sunLight.target);

  FX.tracers = new Tracers(scene, 600);
  FX.flash = new SpriteFX(scene, TEX.flash, THREE.AdditiveBlending, 160, false, 1);
  FX.fire = new SpriteFX(scene, TEX.flash, THREE.AdditiveBlending, 260, false, 0.95);
  FX.smoke = new SpriteFX(scene, TEX.smoke, THREE.NormalBlending, 420, true, 0.14);
  FX.dust = new SpriteFX(scene, TEX.smoke, THREE.NormalBlending, 240, true, 0.46);
  FX.scorch = new Scorch(scene, 60);
  FX.flare = new SpriteFX(scene, TEX.flash, THREE.AdditiveBlending, 120, false, 1); FX.flare.mesh.renderOrder = 10; LAMPS.init(); GUNS.init();   // flares and missiles near the lens: over the clouds
  WEATHER.init();

  runSlices(buildWorld(), finishInit);
}
function* buildWorld() {
  const t0 = performance.now();
  worldSeed = CFG.seed || (Math.random() * 2147483647 | 1);   // (from here on a new seed needs a reload)
  yield* MAP.generate(worldSeed);
  yield* LAYOUT.plan(MAP.seed);
  yield* TERRAIN.buildGround();
  yield* STRUCT.build();
  const season = seasonNow(); TERRAIN.setSeason(season);
  yield* TERRAIN.buildVeg(season);
  LAMPS.bake();
  MAP.genMs = performance.now() - t0;
}
/* run a generator in slices of ~30 ms, yielding to the browser in between (a MessageChannel: no 4 ms timer clamp, no throttling) */
function runSlices(gen, done) {
  const ch = new MessageChannel();
  ch.port1.onmessage = () => {
    const t = performance.now();
    while (performance.now() - t < 30) if (gen.next().done) { ch.port1.onmessage = null; ch.port1.close(); done(); return; }
    ch.port2.postMessage(0);
  };
  ch.port2.postMessage(0);
}
function finishInit() {
  if (QS.has('az')) camAz = parseFloat(QS.get('az')) * DEG;
  ARMS.init();
  GUNSHIP.init();                      // a random district to start over
  ROADNET.build(); INF.build(); BATTLE.init(); ALLIES.init();   // the allies' garrisons at their outposts
  initAudio();
  window.addEventListener('resize', resize);
  HUD.build();
  resize();
  updateEnvironment();
  SENSOR.set(SENSOR.initial()); HUD.markModes();
  updateEnvironment();
  const hid = []; scene.traverse(o => { if (!o.visible) { hid.push(o); o.visible = true; } });   // (what is hidden now is compiled too: effect pools, the beam)
  // every program compiled under the splash, without blocking it (compileAsync: the driver links them in parallel where it can;
  // a deadline in case one never reports), then one whole frame of everything: the shadow pass's programs are only made when
  // something is first drawn into it
  renderer.setRenderTarget(SENSOR.rt);
  const deadline = new Promise(r => setTimeout(r, 20000)), go = () => {
    if (ready) return;
    renderer.setRenderTarget(null);
    const cull = []; scene.traverse(o => { if (o.frustumCulled) { cull.push(o); o.frustumCulled = false; } });
    if (CFG.shadows) fitShadow(); SENSOR.render();
    for (const o of cull) o.frustumCulled = true;
    for (const o of hid) o.visible = false;
    ready = true;
    const s = document.getElementById('splash'); if (s) { s.classList.add('off'); setTimeout(() => s.remove(), 700); }
    requestAnimationFrame(frame);
  };
  Promise.race([Promise.all([renderer.compileAsync(scene, camera), GUNS.warm()]), deadline]).then(go, go);
}

/* ---- camera: perspective with a narrow lens from far away; ~95 m of screen height at 100 % zoom ---- */
/* The aircraft flies a circle round CAM_CTR (CAM_D away, CAM_ELEV up: 240 m out, 240 m above); the sensor looks from it at CAM_TGT.
   Slewing moves CAM_TGT only: the line of sight turns, the aircraft stays on its orbit. The lens keeps the frame's size at any range. */
const VIEW_H = 95, CAM_D = 340, CAM_ELEV = 45 * DEG, CAM_TGT = new V3(0, 0, 0), CAM_CTR = new V3(0, 0, 0);
let camAz = 135 * DEG;
function resize() {
  if (!window.innerWidth || !window.innerHeight) return;   // a hidden pane / window at start: a zero-sized target is an incomplete framebuffer
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  SENSOR.resize(renderer);
  HUD.resize();
  updateCamera();
}
function updateCamera() {
  const viewH = VIEW_H * 100 / Math.max(30, CFG.zoom * GUNSHIP.zm);   // (the zoom setting × the weapon's × the transit's)
  camera.aspect = Math.max(1, window.innerWidth) / Math.max(1, window.innerHeight);
  updateCameraPose();
  camera.fov = 2 * Math.atan(viewH * 0.5 / camera.position.distanceTo(CAM_TGT)) / DEG;
  camera.updateProjectionMatrix();
  for (let i = 0; i < 3 && clampFrame(); i++) updateCameraPose();   // (moving the look-at point turns the line of sight: a few passes settle it)
}
function updateCameraPose() {
  camera.position.set(CAM_CTR.x + Math.cos(CAM_ELEV) * Math.cos(camAz) * CAM_D, CAM_CTR.y + Math.sin(CAM_ELEV) * CAM_D, CAM_CTR.z + Math.cos(CAM_ELEV) * Math.sin(camAz) * CAM_D);
  camera.lookAt(CAM_TGT);
  camera.updateMatrixWorld();
}
/* keep the whole frame on the map: shift the look-at point back by however far a corner of the frame overshoots the edge */
function clampFrame() {
  const E = MAP_HALF - 2; let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  if (MAP.lo === undefined) { MAP.lo = Infinity; for (const v of MAP.h) MAP.lo = Math.min(MAP.lo, v); }   // (the corner rays measured down to the map's lowest ground: no hollow lets them reach past the edge)
  for (const c of SCREEN_CORNERS) { const p = VIEW.groundAt(c[0], c[1], MAP.lo - 1, _shc); x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
  const dx = Math.max(0, x1 - E) - Math.max(0, -E - x0), dz = Math.max(0, z1 - E) - Math.max(0, -E - z0);
  if (Math.abs(dx) < 0.01 && Math.abs(dz) < 0.01) return false;
  CAM_TGT.x -= dx; CAM_TGT.z -= dz; return true;
}
/* screen helpers (perspective camera) */
const _nd = new V3(), _rd = new V3();
const VIEW = {
  ndc(p) { return _nd.copy(p).project(camera); },
  onScreen(p, m) { const n = this.ndc(p); return Math.abs(n.x) < 1 + (m || 0) && Math.abs(n.y) < 1 + (m || 0); },
  groundAt(nx, ny, alt, out) {          // the point at height alt seen at screen position (nx, ny)
    _rd.set(nx, ny, 0.5).unproject(camera).sub(camera.position).normalize();
    return (out || new V3()).copy(camera.position).addScaledVector(_rd, (alt - camera.position.y) / _rd.y);
  }
};

/* ---- time of day, season & lighting ---- */
const _hg = new THREE.Color(), SUN_DIR = new V3(), SUN_K = 1.0, SKY_K = 1.0;   // (the sun's and the sky's share, tuned on the review sheets)
function updateEnvironment() {
  const season = seasonNow(); if (TERRAIN.season && season !== TERRAIN.season) TERRAIN.changeSeason(season);   // a new month, or the setting changed
  const S = SEASONS[season];
  const sp = sunPosition(getNow(), CFG.lat, CFG.lon);
  ENV.elev = sp.elev;
  const k = skyAt(sp.elev);
  const dirOf = (az, el) => new V3(Math.sin(az * DEG) * Math.cos(el * DEG), Math.sin(el * DEG), -Math.cos(az * DEG) * Math.cos(el * DEG));
  const sunDir = dirOf(sp.az, Math.max(sp.elev, 7)), moonDir = dirOf(sp.az + 160, 42);
  SUN_DIR.copy(sunDir.lerp(moonDir, smoothstep(-2, -7, sp.elev))).normalize();
  sunLight.color.copy(k.sun); sunLight.intensity = k.si * Math.PI * SUN_K;   // (× π: a white surface facing a light of 1 comes out 1)
  _hg.setHex(S.hg).multiplyScalar(GAMMA(lerp(0.35, 1, smoothstep(-8, 12, sp.elev))));
  hemi.color.copy(k.hs); hemi.groundColor.copy(k.hg).lerp(_hg, 0.6); hemi.intensity = k.hi * Math.PI * SKY_K;
  scene.fog.color.copy(k.fog);
  ENV.smokeTint.copy(k.smoke);
  ENV.dustTint.setHex(GROUND_PAL[season].a).lerp(k.smoke, 0.45);
  ENV.night = 1 - smoothstep(-10, 1, sp.elev);
  ENV.day = smoothstep(-6, 10, sp.elev);
  WIN_MAT.emissive.setHex(0xffc27a).multiplyScalar(GAMMA(0.8 * (1 - smoothstep(-3, 5, sp.elev))));   // lit windows after dusk
  if (CFG.vision === 'auto' && !SENSOR.manual && ready) { const m = ENV.night > 0.5 ? 'wh' : 'tv'; if (m !== SENSOR.mode) { SENSOR.mode = m; SENSOR.post.uniforms.uMode.value = SENSOR_INDEX[m]; SU.uThermal.value = m === 'wh' ? 1 : 0; HUD.markModes(); } }   // (auto: TV by day, white-hot at night, until a mode is clicked)
  WEATHER.light();
  const lum = c => c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722; SU.uLit.value = clamp((sunLight.intensity * lum(sunLight.color) * 0.7 + hemi.intensity * lum(hemi.color)) / Math.PI / 1.1, 0.01, 1.1);   // (1 at noon)
  WATER_HEAT.value = lerp(0.12, -0.1, ENV.day);   // water: cooler than the ground by day, warmer at night
  SENSOR.env();
  renderer.setClearColor(scene.fog.color);
  fitShadow();
}

/* ---- the sun's shadow camera: a stable circle around the look-at point, snapped to shadow texels (the orbit must not shimmer) ---- */
const SHADOW_N = 2048, SCREEN_CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
const _shc = new V3(), _shm = new THREE.Matrix4(), _shi = new THREE.Matrix4(), _shp = new V3(), _shO = new V3(), _shU = new V3(0, 1, 0);
function fitShadow() {
  const sc = sunLight.shadow.camera;
  let r = 0; for (const c of SCREEN_CORNERS) r = Math.max(r, VIEW.groundAt(c[0], c[1], CAM_TGT.y, _shc).distanceTo(CAM_TGT));
  r = Math.ceil((r + 30) / 16) * 16;
  if (sc.right !== r) { sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r; sc.updateProjectionMatrix(); }
  const texel = 2 * r / SHADOW_N;
  _shm.lookAt(SUN_DIR, _shO, _shU); _shi.copy(_shm).invert();
  _shp.copy(CAM_TGT).applyMatrix4(_shi); _shp.x = Math.round(_shp.x / texel) * texel; _shp.y = Math.round(_shp.y / texel) * texel; _shp.applyMatrix4(_shm);
  sunLight.target.position.copy(_shp); sunLight.position.copy(_shp).addScaledVector(SUN_DIR, 800);
  sunLight.target.updateMatrixWorld();
}

/* ---- main loop ---- */
let frameDue = 0, envTimer = 0;
function frame(ms) {
  requestAnimationFrame(frame);
  if (paused) { lastMs = ms; return; }
  if (fpsLimit > 0) {
    if (ms < frameDue - 2) return;
    frameDue += 1000 / fpsLimit; if (frameDue <= ms) frameDue = ms + 1000 / fpsLimit;
  }
  const el = clamp((ms - lastMs) / 1000, 0, 0.25); lastMs = ms;
  const n = Math.max(1, Math.ceil(el / 0.05)), dt = el / n;
  if (DEMO.on && !FILE_AUDIO.playing) onAudio(demoSpectrum(RT(), DEMO.bpm, DEMO.pauses));   // (a file playing in the settings panel feeds onAudio itself)
  for (let i = 0; i < n * TIME_SCALE; i++) step(dt);
  renderFrame();
}
function renderFrame() { INF.update(); if (CFG.shadows) fitShadow(); SENSOR.render(); HUD.draw(); }
const TIME_SCALE = Math.max(1, Math.round(parseFloat(QS.get('ts') || '1')));
function step(dt) {
  T += dt;
  ALLIES.update(dt);
  BATTLE.update(dt);
  GUNSHIP.update(dt);
  ARMS.update(dt);
  FX.tracers.update(dt);
  FX.flash.update(dt);
  FX.fire.update(dt);
  FX.smoke.update(dt, null, camera);
  FX.dust.update(dt, null, camera);
  FX.scorch.update(dt);
  FX.flare.update(dt);
  WEATHER.update(dt); AA.update(dt); LAMPS.update(dt); GUNS.update(dt);
  envTimer -= dt; if (envTimer <= 0) { envTimer = 2; updateEnvironment(); }
}

init();
