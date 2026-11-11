'use strict';
/* ===== The sensor: vision modes, the heat term in every material, the render target and the post pass =====
   The scene is drawn into a render target, then one fullscreen pass turns it into the picture of the current mode.
   Thermal is not a recolouring: while uThermal is on, every material writes its HEAT (0 cold … 1 white-hot) instead of
   its colour; the post pass maps that to white-hot or black-hot. Switching a mode only changes uniforms: no recompiles. */
const SENSOR_MODES = ['tv', 'wh', 'bh', 'nv'];
const SENSOR_LABEL = { tv: 'TV', wh: 'IR WHT', bh: 'IR BLK', nv: 'NVG' };
const SENSOR_INDEX = { tv: 0, wh: 1, bh: 2, nv: 3 };
const SU = { uThermal: { value: 0 }, uGain: { value: 1 }, uAmbHeat: { value: 0.36 } };   // shared by every material

/* the one hook every material uses (a single function source: one program per material kind, no variants) */
function sensorHook(shader) {
  shader.uniforms.uThermal = SU.uThermal; shader.uniforms.uGain = SU.uGain; shader.uniforms.uAmbHeat = SU.uAmbHeat;
  shader.uniforms.uMatHeat = { value: this.userData.heat || 0 };         // the material's own heat
  shader.uniforms.uBaked = { value: this.userData.noBake ? 0 : 1 };      // 0: ignore aHeat (a wreck's burnt material on a merged mesh)
  shader.uniforms.uAlbK = { value: this.userData.albK != null ? this.userData.albK : 0.22 };   // how much the visible colour shows in thermal
  shader.vertexShader = 'attribute float aHeat; varying float vHeat;\n' + shader.vertexShader.replace('#include <begin_vertex>', 'vHeat = aHeat;\n#include <begin_vertex>');
  shader.fragmentShader = 'uniform float uThermal, uGain, uAmbHeat, uMatHeat, uBaked, uAlbK; varying float vHeat;\n' + shader.fragmentShader.replace('#include <opaque_fragment>', `#include <opaque_fragment>
    if (uThermal > 0.5) {
      float alb = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)), sol = dot(reflectedLight.directDiffuse, vec3(0.333));
      gl_FragColor.rgb = vec3(clamp(uAmbHeat + (alb - 0.35) * uAlbK + sol * 0.12 + uMatHeat + vHeat * uBaked, 0.0, 1.0));
    } else gl_FragColor.rgb *= uGain;`);
  if (this.userData.extend) this.userData.extend(shader);   // a material's own additions (the ground); it then needs a customProgramCacheKey
}
function sensorMat(mat, heat) { mat.onBeforeCompile = sensorHook; if (heat != null) mat.userData.heat = heat; return mat; }

const POST_FS = `
  uniform sampler2D tMap; uniform float uMode, uTime, uNight; uniform vec2 uRes; varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  vec3 bright(float lod, float cut) { return max(textureLod(tMap, vUv, lod).rgb - vec3(cut), vec3(0.0)); }
  void main() {
    vec3 c = texture2D(tMap, vUv).rgb;
    vec3 glow = bright(2.0, 0.74) * 0.55 + bright(3.5, 0.66) * 0.75 + bright(5.5, 0.56) * 0.9;
    vec2 q = vUv - 0.5; float vig = 1.0 - dot(q, q) * 0.62;
    float grain = hash(gl_FragCoord.xy * 0.73 + fract(uTime) * 311.7) - 0.5;
    float scan = 0.5 + 0.5 * sin(gl_FragCoord.y * 2.094);       // a line every 3 pixels
    vec3 o;
    if (uMode < 0.5) {                                          // TV: a slightly crushed video picture
      c += glow * 0.8; float l = dot(c, vec3(0.299, 0.587, 0.114));
      o = mix(vec3(l), c, mix(0.86, 0.45, uNight)); o = smoothstep(0.0, 1.0, o) * 0.35 + o * 0.65; o += grain * 0.055; o *= 1.0 - scan * 0.13;
    } else if (uMode < 2.5) {                                   // thermal: the heat is in the red channel
      float h = c.r + glow.r * 0.9; h = smoothstep(0.08, 0.92, h);
      if (uMode > 1.5) h = 1.0 - h;
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
  mode: 'tv', rt: null, post: null, postScene: null, postCam: null,
  build(renderer) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    this.rt = new THREE.WebGLRenderTarget(size.x, size.y, { samples: CFG.msaa, depthBuffer: true, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
    this.post = new THREE.ShaderMaterial({
      uniforms: { tMap: { value: this.rt.texture }, uMode: { value: 0 }, uTime: { value: 0 }, uNight: { value: 0 }, uRes: { value: size } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: POST_FS, depthTest: false, depthWrite: false
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.post); quad.frustumCulled = false;
    this.postScene = new THREE.Scene(); this.postScene.add(quad);
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  },
  resize(renderer) {
    const s = renderer.getDrawingBufferSize(new THREE.Vector2());
    this.rt.setSize(s.x, s.y); this.post.uniforms.uRes.value.copy(s);
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
    SU.uGain.value = this.mode === 'nv' ? lerp(1.0, 2.5, ENV.night) : lerp(1, 1.9, ENV.night);   // (the TV camera is a low-light one too)
    this.post.uniforms.uNight.value = ENV.night;
    SU.uAmbHeat.value = lerp(0.3, 0.4, ENV.day);
    if (thermal) { scene.fog.color.setScalar(SU.uAmbHeat.value + 0.04); return; }
    scene.fog.color.multiplyScalar(SU.uGain.value);
  },
  render() {
    this.post.uniforms.uTime.value = T % 100;
    renderer.setRenderTarget(this.rt); renderer.clear(); renderer.render(scene, camera);
    renderer.setRenderTarget(null); renderer.render(this.postScene, this.postCam);
  }
};
