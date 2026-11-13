'use strict';
/* ===== The sensor: vision modes, the heat term in every material, the render target and the post pass =====
   The scene is drawn into a render target, then one fullscreen pass turns it into the picture of the current mode.
   Thermal is not a recolouring: while uThermal is on, every material writes its HEAT (0 cold … 1 white-hot) instead of
   its colour; the post pass maps that to white-hot or black-hot. Switching a mode only changes uniforms: no recompiles. */
const SENSOR_MODES = ['tv', 'wh', 'bh', 'nv'];
const SENSOR_LABEL = { tv: 'TV', wh: 'IR WHT', bh: 'IR BLK', nv: 'NVG' };
const SENSOR_INDEX = { tv: 0, wh: 1, bh: 2, nv: 3 };
const SU = { uThermal: { value: 0 }, uGain: { value: 1 }, uAmbHeat: { value: 0.36 }, uLit: { value: 1 }, uLampMap: { value: null }, uLampRect: { value: new THREE.Vector3(0, 0, 0) }, uCamW: { value: new THREE.Matrix4() } };   // (uLit: how much light there is, for what is not lit by the lights: smoke, dust, clouds)   // shared by every material

/* the one hook every material uses (a single function source: one program per material kind, no variants) */
function sensorHook(shader) {
  shader.uniforms.uThermal = SU.uThermal; shader.uniforms.uGain = SU.uGain; shader.uniforms.uAmbHeat = SU.uAmbHeat;
  shader.uniforms.uMatHeat = { value: this.userData.heat || 0 };         // the material's own heat
  shader.uniforms.uBaked = { value: this.userData.noBake ? 0 : 1 };      // 0: ignore aHeat (a wreck's burnt material on a merged mesh)
  shader.uniforms.uAlbK = { value: this.userData.albK != null ? this.userData.albK : 0.22 };   // how much the visible colour shows in thermal
  shader.vertexShader = 'attribute float aHeat; varying float vHeat;\n' + shader.vertexShader.replace('#include <begin_vertex>', 'vHeat = aHeat;\n#include <begin_vertex>');
  let fs = shader.fragmentShader;
  if (this.isMeshPhongMaterial && !this.userData.noLamp) {   // the lamps' light (js/lights.js): a map of it seen from above, read at the fragment's place in the world
    shader.uniforms.uLampMap = SU.uLampMap; shader.uniforms.uLampRect = SU.uLampRect; shader.uniforms.uCamW = SU.uCamW;
    fs = 'uniform sampler2D uLampMap; uniform vec3 uLampRect; uniform mat4 uCamW;\n' + fs.replace('#include <opaque_fragment>', 'outgoingLight += diffuseColor.rgb * texture2D(uLampMap, ((uCamW * vec4(-vViewPosition, 1.0)).xz - uLampRect.xy) * uLampRect.z + 0.5).rgb;\n#include <opaque_fragment>');
  }
  shader.fragmentShader = 'uniform float uThermal, uGain, uAmbHeat, uMatHeat, uBaked, uAlbK; varying float vHeat;\n' + fs.replace('#include <opaque_fragment>', `#include <opaque_fragment>
    if (uThermal > 0.5) {
      float alb = pow(dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)), 0.4545), sol = pow(dot(reflectedLight.directDiffuse, vec3(0.333)) + 0.03, 0.4545) - 0.203;   // (the heat is a display value: the colour and the sunlight go into it as they look)
      gl_FragColor.rgb = vec3(clamp(uAmbHeat + (alb - 0.35) * uAlbK + sol * 0.12 + uMatHeat + vHeat * uBaked, 0.0, 1.0));
    } else gl_FragColor.rgb *= uGain;`);
  if (this.userData.extend) this.userData.extend(shader);   // a material's own additions (the ground); it then needs a customProgramCacheKey
}
function sensorMat(mat, heat) { mat.onBeforeCompile = sensorHook; if (heat != null) mat.userData.heat = heat; return mat; }

const POST_FS = `
  uniform sampler2D tMap; uniform float uMode, uTime, uNight, uExp, uPulse, uLevel; varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  /* linear light → the display: a soft shoulder for what is over 1 (flashes, snow in the sun), then the sRGB curve. Thermal frames hold heat, not light: taken as they are */
  vec3 show(vec3 c) { if (uMode > 0.5 && uMode < 2.5) return c; c *= uExp * (1.0 + 0.2 * uPulse); c = c / (1.0 + max(c - 0.8, 0.0) * 0.55); return pow(clamp(c, 0.0, 1.0), vec3(0.4545)); }
  vec3 over(float lod) { vec3 x = max(textureLod(tMap, vUv, lod).rgb * uExp - vec3(1.9), vec3(0.0)); return x / (1.0 + x); }
  vec3 bright(float lod, float cut) { return max(show(textureLod(tMap, vUv, lod).rgb) - vec3(cut), vec3(0.0)); }
  void main() {
    vec3 c = show(texture2D(tMap, vUv).rgb);
    vec3 glow = uMode > 0.5 && uMode < 2.5 ? bright(2.0, 0.74) * 0.55 + bright(3.5, 0.66) * 0.75 + bright(5.5, 0.56) * 0.9   // thermal: what is hot blooms
      : over(2.0) * 0.55 + over(3.5) * 0.75 + over(5.5) * 0.9;                                                          // light: only what is brighter than a white surface in the sun (flashes, tracers, fire)
    glow *= 1.0 + 1.2 * uPulse;                                 // the kick drum: the bloom and the exposure pump (js/audio.js → SENSOR.kick)
    vec2 q = vUv - 0.5; float vig = 1.0 - dot(q, q) * 0.62;
    float grain = (hash(gl_FragCoord.xy * 0.73 + fract(uTime) * 311.7) - 0.5) * (1.0 + 0.6 * uLevel);   // (louder music, more grain)
    float scan = 0.5 + 0.5 * sin(gl_FragCoord.y * 2.094);       // a line every 3 pixels
    vec3 o;
    if (uMode < 0.5) {                                          // TV: a slightly crushed video picture
      c += glow * 0.8; float l = dot(c, vec3(0.299, 0.587, 0.114));
      o = mix(vec3(l), c, mix(0.86, 0.45, uNight)); o = smoothstep(0.0, 1.0, o) * 0.35 + o * 0.65; o += grain * 0.055; o *= 1.0 - scan * 0.13;
    } else if (uMode < 2.5) {                                   // thermal: the heat is in the red channel
      float h = c.r + glow.r * 0.9; h = smoothstep(0.08, 0.92, h);
      h += 0.05 * uPulse; if (uMode > 1.5) h = 1.0 - h;
      h += grain * 0.05; o = vec3(h) * vec3(0.985, 1.0, 0.99); o *= 1.0 - scan * 0.07;
    } else {                                                    // night vision: amplified mono, in the phosphor's green
      float l = dot(c, vec3(0.299, 0.587, 0.114)) + glow.g * 0.9; l = pow(clamp(l, 0.0, 1.0), 0.82);
      vec3 a = vec3(0.01, 0.07, 0.03), b = vec3(0.16, 0.52, 0.19), d = vec3(0.80, 0.98, 0.70);
      o = l < 0.5 ? mix(a, b, l * 2.0) : mix(b, d, (l - 0.5) * 2.0);
      o += grain * 0.085 * (0.6 + l); o *= 1.0 - scan * 0.09;
    }
    gl_FragColor = vec4(o * vig, 1.0);
  }`;

const SENSOR = {
  mode: 'tv', rt: null, post: null, postScene: null, postCam: null, pulse: 0, level: 0, pulseT: -1,
  build(renderer) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    this.rt = new THREE.WebGLRenderTarget(size.x, size.y, { samples: CFG.msaa, depthBuffer: true, type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
    this.post = new THREE.ShaderMaterial({
      uniforms: { tMap: { value: this.rt.texture }, uMode: { value: 0 }, uTime: { value: 0 }, uNight: { value: 0 }, uExp: { value: 1.6 }, uPulse: { value: 0 }, uLevel: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: POST_FS, depthTest: false, depthWrite: false
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.post); quad.frustumCulled = false;
    this.postScene = new THREE.Scene(); this.postScene.add(quad);
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  },
  resize(renderer) {
    const s = renderer.getDrawingBufferSize(new THREE.Vector2());
    this.rt.setSize(s.x, s.y);
  },
  /* set the vision mode; a click on the HUD comes here (never saved: the property gives the default at every start) */
  set(mode) {
    if (!SENSOR_MODES.includes(mode)) return;
    this.mode = mode; this.post.uniforms.uMode.value = SENSOR_INDEX[mode];
    SU.uThermal.value = mode === 'wh' || mode === 'bh' ? 1 : 0;
    this.env();
  },
  /* the default from the settings: 'auto' = TV by day, white-hot at night */
  initial() { return CFG.vision === 'auto' ? (ENV.night > 0.5 ? 'wh' : 'tv') : CFG.vision; },
  /* what depends on the mode and the time of day: gain, ambient heat, the fog's colour (or heat) */
  env() {
    const thermal = SU.uThermal.value > 0.5;
    SU.uGain.value = GAMMA(this.mode === 'nv' ? lerp(1.0, 2.5, ENV.night) : lerp(1, 1.3, ENV.night));   // (the TV camera is a low-light one too; the factors are display-space ones)
    this.post.uniforms.uNight.value = ENV.night;
    this.post.uniforms.uExp.value = TERRAIN.season === 'winter' ? 1.65 : 2.05;   // (the exposure: stopped down over snow)
    SU.uAmbHeat.value = lerp(0.3, 0.4, ENV.day);
    if (thermal) { scene.fog.color.setScalar(SU.uAmbHeat.value + 0.04); return; }
    scene.fog.color.multiplyScalar(SU.uGain.value);
  },
  /* a kick drum of strength st (js/audio.js): the picture pulses (decaying in a fraction of a second); the grain follows the loudness */
  kick(st) { if (CFG.pulse) this.pulse = Math.max(this.pulse, 0.25 + 0.5 * clamp((st - 1) / 1.5, 0, 1)); },
  pulseStep() {
    const now = RT(), dt = this.pulseT < 0 ? 0 : Math.max(0, now - this.pulseT); this.pulseT = now;
    const lv = CFG.pulse && AUD.active ? (BANDS.low.norm + BANDS.mid.norm + BANDS.high.norm) / 3 : 0;
    this.pulse = CFG.pulse ? this.pulse * Math.exp(-dt * 7) : 0; if (this.pulse < 0.002) this.pulse = 0;
    this.level += (lv - this.level) * (1 - Math.exp(-dt * 3));
    this.post.uniforms.uPulse.value = this.pulse; this.post.uniforms.uLevel.value = this.level;
  },
  render() {
    this.post.uniforms.uTime.value = T % 100; this.pulseStep();
    LAMPS.draw();
    // (render() clears the target itself; every render() into it also makes its mipmaps for the bloom: when the guns are drawn
    // over the world, only their render does)
    const guns = GUNS.pose(), tex = this.rt.texture;
    renderer.setRenderTarget(this.rt); tex.generateMipmaps = !guns; renderer.render(scene, camera); tex.generateMipmaps = true;
    if (guns) GUNS.render();
    renderer.setRenderTarget(null); renderer.render(this.postScene, this.postCam);
  }
};
