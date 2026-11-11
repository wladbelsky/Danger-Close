'use strict';
/* ===== Scene, camera, light & seasons, Wallpaper Engine properties, main loop ===== */
let scene, camera, renderer, sunLight, hemi;
const FX = {};
let T = 0, paused = false, fpsLimit = 0, lastMs = 0, ready = false;
const ENV = { elev: 30, night: 0, day: 1, smokeTint: new THREE.Color(0xbbbbbb), dustTint: new THREE.Color(0xa89878) };
function RT() { return performance.now() / 1000; }

/* ---- URL test parameters (for browser preview) ---- */
const QS = new URLSearchParams(location.search);
if (QS.has('hour')) { CFG.timeMode = 'fixed'; CFG.fixedHour = parseFloat(QS.get('hour')); }
if (QS.has('zoom')) CFG.zoom = parseFloat(QS.get('zoom'));
if (QS.has('season')) CFG.season = QS.get('season');
if (QS.has('mode')) CFG.vision = QS.get('mode');
if (QS.has('seed')) CFG.seed = parseInt(QS.get('seed'), 10) || 0;

/* ---- Wallpaper Engine properties ---- */
window.wallpaperPropertyListener = {
  applyUserProperties(p) { if (ready) updateEnvironment(); },
  applyGeneralProperties(p) { if (p.fps !== undefined) fpsLimit = p.fps; },
  setPaused(v) { paused = v; }
};

/* ---- init: the renderer at once, the world in slices under the splash ---- */
function init() {
  const canvas = document.getElementById('c');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, precision: 'highp', powerPreference: 'high-performance' });   // (MSAA is on the render target)
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
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
  sunLight.shadow.bias = -0.0005; sunLight.shadow.normalBias = 0.25;
  scene.add(sunLight); scene.add(sunLight.target);

  FX.tracers = new Tracers(scene, 600);
  FX.flash = new SpriteFX(scene, TEX.flash, THREE.AdditiveBlending, 160, false, 1);
  FX.fire = new SpriteFX(scene, TEX.flash, THREE.AdditiveBlending, 260, false, 0.95);
  FX.smoke = new SpriteFX(scene, TEX.smoke, THREE.NormalBlending, 420, true, 0.14);
  FX.dust = new SpriteFX(scene, TEX.smoke, THREE.NormalBlending, 240, true, 0.46);
  FX.scorch = new Scorch(scene, 60);

  runSlices(buildWorld(), finishInit);
}
function* buildWorld() {
  const t0 = performance.now();
  yield* MAP.generate(CFG.seed || (Math.random() * 2147483647 | 1));
  yield* TERRAIN.buildGround();
  const season = seasonNow(); TERRAIN.setSeason(season);
  yield* TERRAIN.buildVeg(season);
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
  const p = MAP.startPoint();
  CAM_TGT.set(QS.has('x') ? parseFloat(QS.get('x')) : p[0], 0, QS.has('z') ? parseFloat(QS.get('z')) : p[1]);
  CAM_TGT.y = groundH(CAM_TGT.x, CAM_TGT.z);
  if (QS.has('az')) camAz = parseFloat(QS.get('az')) * DEG;
  window.addEventListener('resize', resize);
  resize();
  updateEnvironment();
  buildModeStrip();
  SENSOR.set(SENSOR.initial());
  updateEnvironment();
  renderer.setRenderTarget(SENSOR.rt); renderer.compile(scene, camera); renderer.setRenderTarget(null);   // under the splash: no compile stalls later
  ready = true;
  const s = document.getElementById('splash'); if (s) { s.classList.add('off'); setTimeout(() => s.remove(), 700); }
  requestAnimationFrame(frame);
}

/* ---- a temporary mode switch (the real HUD comes in stage 4) ---- */
function buildModeStrip() {
  const el = document.getElementById('modes'); if (!el) return;
  if (QS.get('hud') === '0') { el.style.display = 'none'; return; }
  for (const m of SENSOR_MODES) {
    const b = document.createElement('button'); b.textContent = SENSOR_LABEL[m]; b.dataset.m = m;
    b.onclick = () => { SENSOR.set(m); updateEnvironment(); markModes(); };
    el.appendChild(b);
  }
  markModes();
}
function markModes() { for (const b of document.querySelectorAll('#modes button')) b.classList.toggle('on', b.dataset.m === SENSOR.mode); }

/* ---- camera: perspective with a narrow lens from far away; ~95 m of screen height at 100 % zoom ---- */
const VIEW_H = 95, CAM_D = 340, CAM_ELEV = 45 * DEG, CAM_TGT = new V3(0, 0, 0);
let camAz = 135 * DEG;
function resize() {
  if (!window.innerWidth || !window.innerHeight) return;   // a hidden pane / window at start: a zero-sized target is an incomplete framebuffer
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  SENSOR.resize(renderer);
  updateCamera();
}
function updateCamera() {
  const viewH = VIEW_H * 100 / CFG.zoom;
  camera.aspect = Math.max(1, window.innerWidth) / Math.max(1, window.innerHeight);
  camera.fov = 2 * Math.atan(viewH * 0.5 / CAM_D) / DEG;
  camera.updateProjectionMatrix();
  updateCameraPose();
}
function updateCameraPose() {
  camera.position.set(CAM_TGT.x + Math.cos(CAM_ELEV) * Math.cos(camAz) * CAM_D, CAM_TGT.y + Math.sin(CAM_ELEV) * CAM_D, CAM_TGT.z + Math.cos(CAM_ELEV) * Math.sin(camAz) * CAM_D);
  camera.lookAt(CAM_TGT);
  camera.updateMatrixWorld();
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
const _hg = new THREE.Color(), SUN_DIR = new V3();
function updateEnvironment() {
  const season = seasonNow(); if (TERRAIN.season && season !== TERRAIN.season) TERRAIN.changeSeason(season);   // a new month, or the setting changed
  const S = SEASONS[season];
  const sp = sunPosition(getNow(), CFG.lat, CFG.lon);
  ENV.elev = sp.elev;
  const k = skyAt(sp.elev);
  const dirOf = (az, el) => new V3(Math.sin(az * DEG) * Math.cos(el * DEG), Math.sin(el * DEG), -Math.cos(az * DEG) * Math.cos(el * DEG));
  const sunDir = dirOf(sp.az, Math.max(sp.elev, 7)), moonDir = dirOf(sp.az + 160, 42);
  SUN_DIR.copy(sunDir.lerp(moonDir, smoothstep(-2, -7, sp.elev))).normalize();
  sunLight.color.copy(k.sun); sunLight.intensity = k.si * Math.PI;   // (SKY_KEYS are in the old non-physical light units: ×π gives the same picture)
  _hg.setHex(S.hg).multiplyScalar(lerp(0.35, 1, smoothstep(-8, 12, sp.elev)));
  hemi.color.copy(k.hs); hemi.groundColor.copy(k.hg).lerp(_hg, 0.6); hemi.intensity = k.hi * Math.PI;
  scene.fog.color.copy(k.fog);
  ENV.smokeTint.copy(k.smoke);
  ENV.dustTint.setHex(GROUND_PAL[season].a).lerp(k.smoke, 0.45);
  ENV.night = 1 - smoothstep(-10, 1, sp.elev);
  ENV.day = smoothstep(-6, 10, sp.elev);
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
  for (let i = 0; i < n * TIME_SCALE; i++) step(dt);
  renderFrame();
}
function renderFrame() { if (CFG.shadows) fitShadow(); SENSOR.render(); }
const TIME_SCALE = Math.max(1, Math.round(parseFloat(QS.get('ts') || '1')));
function step(dt) {
  T += dt;
  if (!QS.has('az')) { camAz -= 0.03 * dt; updateCameraPose(); }   // (a plain turn until the gunship comes in stage 4)
  FX.tracers.update(dt);
  FX.flash.update(dt);
  FX.fire.update(dt);
  FX.smoke.update(dt, null, camera);
  FX.dust.update(dt, null, camera);
  FX.scorch.update(dt);
  envTimer -= dt; if (envTimer <= 0) { envTimer = 2; updateEnvironment(); }
}

init();
