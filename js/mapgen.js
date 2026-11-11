'use strict';
/* ===== The map generator: heights and forests on one 4 m grid (roads, rail, lakes and towns come on top in stage 3) =====
   Everything repeats for a seed: only mulberry32 and the seeded vnoise here, never Math.random (three.js UUIDs consume it).
   The work is a generator: main.js runs it in slices under the splash.                                                    */
const MAP_HALF = 1024, MAP_CELL = 4, MAP_N = 512, MAP_V = MAP_N + 1;   // 2048 m square, MAP_N cells a side, MAP_V vertices
/* cheap value noise (deterministic for a seed) */
function vnoise(x, z, seed) {
  const h = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7 + seed * 74.7) * 43758.5453; return s - Math.floor(s); };
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  return lerp(lerp(h(xi, zi), h(xi + 1, zi), u), lerp(h(xi, zi + 1), h(xi + 1, zi + 1), u), v);
}
const MAP = {
  seed: 0, h: null, forest: null, conifer: null, dry: null, forestShare: 0, genMs: 0,
  /* heights (m) and the 0..1 masks at every grid vertex */
  *generate(seed) {
    this.seed = seed; this.lo = undefined;
    const rng = mulberry32(seed), s = rng() * 900 + 10, relief = lerp(0.7, 1.25, rng()), share = lerp(0.2, 0.34, rng());
    const h = this.h = new Float32Array(MAP_V * MAP_V), f = this.forest = new Float32Array(MAP_V * MAP_V);
    const c = this.conifer = new Float32Array(MAP_V * MAP_V), d = this.dry = new Float32Array(MAP_V * MAP_V);
    for (let j = 0, k = 0; j < MAP_V; j++) {
      const z = -MAP_HALF + j * MAP_CELL;
      for (let i = 0; i < MAP_V; i++, k++) {
        const x = -MAP_HALF + i * MAP_CELL;
        const wx = x + (vnoise(x / 300, z / 300, s + 9) - 0.5) * 150, wz = z + (vnoise(x / 300, z / 300, s + 10) - 0.5) * 150;   // a warp: no grid-aligned hills
        const n = vnoise(wx / 690, wz / 690, s) * 0.62 + vnoise(wx / 270, wz / 270, s + 1) * 0.28 + vnoise(x / 95, z / 95, s + 2) * 0.1;
        h[k] = (n - 0.5) * 60 * relief + (vnoise(x / 38, z / 38, s + 3) - 0.5) * 0.9;
        f[k] = vnoise(wx / 330, wz / 330, s + 4) * 0.6 + vnoise(x / 120, z / 120, s + 5) * 0.28 + vnoise(x / 44, z / 44, s + 6) * 0.12;
        c[k] = vnoise(wx / 240, wz / 240, s + 7);
        d[k] = vnoise(wx / 210, wz / 210, s + 8);
      }
      if (j % 24 === 23) yield;
    }
    // the threshold that gives this map its share of forest (whatever the noise happened to be)
    const sample = []; for (let k = 0; k < f.length; k += 37) sample.push(f[k]); sample.sort((a, b) => a - b);
    const t = sample[Math.floor(sample.length * (1 - share))];
    let on = 0; for (let k = 0; k < f.length; k++) { f[k] = smoothstep(t - 0.012, t + 0.022, f[k]); c[k] = smoothstep(0.54, 0.62, c[k]); d[k] = smoothstep(0.5, 0.74, d[k]); on += f[k] > 0.5 ? 1 : 0; }
    this.forestShare = on / f.length;
    this.naturalSlope = this.maxSlope();   // (before the layout carves roads, rail and the river into it)
    yield;
  },
  /* the value of a grid field at a world point (bilinear) */
  sample(a, x, z) {
    const gx = clamp((x + MAP_HALF) / MAP_CELL, 0, MAP_N - 1e-3), gz = clamp((z + MAP_HALF) / MAP_CELL, 0, MAP_N - 1e-3), i = Math.floor(gx), j = Math.floor(gz), u = gx - i, v = gz - j, k = j * MAP_V + i;
    return lerp(lerp(a[k], a[k + 1], u), lerp(a[k + MAP_V], a[k + MAP_V + 1], u), v);
  },
  /* a point worth starting over: inside the middle of the map, with a mix of forest and open ground around it */
  startPoint() {
    let best = null, score = -1;
    for (let z = -320; z <= 320; z += 80) for (let x = -320; x <= 320; x += 80) {
      let m = 0; for (let a = 0; a < 8; a++) m += this.sample(this.forest, x + Math.cos(a * 0.785) * 60, z + Math.sin(a * 0.785) * 60) / 8;
      const q = 1 - Math.abs(m - 0.4) - Math.hypot(x, z) / 4000;
      if (q > score) { score = q; best = [x, z]; }
    }
    return best;
  },
  /* a checksum of the map (tests: the same seed gives the same map) */
  hash() { let s = 0; for (let k = 0; k < this.h.length; k += 11) s = (Math.imul(s, 31) + Math.round(this.h[k] * 100) + Math.round(this.forest[k] * 100)) | 0; return s; },
  /* the steepest slope between neighbouring grid vertices (rise over run) */
  maxSlope(skipAbutments) { let m = 0; for (let j = 0; j < MAP_N; j++) for (let i = 0; i < MAP_N; i++) { const k = j * MAP_V + i; if (skipAbutments && MAP.water && (MAP.water[k] || MAP.water[k + 1] || MAP.water[k + MAP_V])) continue; m = Math.max(m, Math.abs(this.h[k + 1] - this.h[k]) / MAP_CELL, Math.abs(this.h[k + MAP_V] - this.h[k]) / MAP_CELL); } return m; }
};
/* the ground's height: exactly the mesh's triangles (each quad split along b-c: a b / c d), so nothing floats or sinks */
function groundH(x, z) {
  if (!MAP.h) return 0;
  const gx = clamp((x + MAP_HALF) / MAP_CELL, 0, MAP_N - 1e-3), gz = clamp((z + MAP_HALF) / MAP_CELL, 0, MAP_N - 1e-3), i = Math.floor(gx), j = Math.floor(gz), u = gx - i, v = gz - j, k = j * MAP_V + i, H = MAP.h;
  const a = H[k], b = H[k + 1], c = H[k + MAP_V], d = H[k + MAP_V + 1];
  return u + v < 1 ? a + u * (b - a) + v * (c - a) : d + (1 - u) * (c - d) + (1 - v) * (b - d);
}
/* the ground's normal at a world point */
function groundN(x, z, out) { const e = MAP_CELL; return out.set(groundH(x - e, z) - groundH(x + e, z), 2 * e, groundH(x, z - e) - groundH(x, z + e)).normalize(); }
