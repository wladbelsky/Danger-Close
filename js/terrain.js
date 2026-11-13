'use strict';
/* ===== Terrain: the ground in chunks and the vegetation =====
   16 x 16 chunks of 128 m, culled whole: only a few hundred metres are ever in frame. The ground's colour comes from a
   mask (forest floor, dry fields) and tiled detail in world space; a season only changes the palette. Vegetation is one
   InstancedMesh per kind and chunk, placed the same in every season (rebuilt only because the shapes differ).            */
const CHUNK_CELLS = 32, CHUNK_N = MAP_N / CHUNK_CELLS, CHUNK_M = CHUNK_CELLS * MAP_CELL;
/* albedo of the ground per season: a / b grass, fld dry field, frs forest floor; heat: its offset on the thermal sensor (snow is cold) */
const GROUND_PAL = {
  spring: { a: 0x3e5228, b: 0x324524, fld: 0x4c5b30, frs: 0x26301c, heat: 0.13, crops: [0x4e6232, 0x5a4a36, 0x46582e, 0x5c5a3a], yard: 0x56553e },
  summer: { a: 0x434e2d, b: 0x39462a, fld: 0x59603a, frs: 0x262f1c, heat: 0.13, crops: [0x86783f, 0x52632c, 0x6c6a40, 0x5a4a34], yard: 0x625c44 },
  autumn: { a: 0x55512e, b: 0x484526, fld: 0x605636, frs: 0x3a3020, heat: 0.10, crops: [0x6e5a3a, 0x4c3c2c, 0x6a6036, 0x58603a], yard: 0x5a5240 },
  winter: { a: 0x747c88, b: 0x6c7482, fld: 0x7a828e, frs: 0x626a76, heat: -0.22, crops: [0x7a828e, 0x727a86, 0x6e7682, 0x7e8692], yard: 0x6a7280 }
};
function detailTex() {   // tiling noise: r coarse grain, g big blotches, b fine speckle
  const S = 512, rng = mulberry32(77), data = new Uint8Array(S * S * 4);
  const layer = P => { const L = new Float32Array(P * P); for (let i = 0; i < L.length; i++) L[i] = rng(); return (u, v) => { const x = u * P, y = v * P, i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, a = fx * fx * (3 - 2 * fx), b = fy * fy * (3 - 2 * fy), I = (i + 1) % P, J = (j + 1) % P; return lerp(lerp(L[j * P + i], L[j * P + I], a), lerp(L[J * P + i], L[J * P + I], a), b); }; };
  const r1 = layer(128), r2 = layer(64), g1 = layer(8), g2 = layer(16), g3 = layer(32), b1 = layer(256);
  for (let y = 0, k = 0; y < S; y++) for (let x = 0; x < S; x++, k += 4) {
    const u = x / S, v = y / S;
    data[k] = 255 * (r1(u, v) * 0.6 + r2(u, v) * 0.4); data[k + 1] = 255 * (g1(u, v) * 0.55 + g2(u, v) * 0.3 + g3(u, v) * 0.15); data[k + 2] = 255 * b1(u, v); data[k + 3] = 255;
  }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 4; t.needsUpdate = true;
  return t;
}
function landTex() { const t = new THREE.CanvasTexture(LAYOUT.landuse); t.flipY = false; t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = 4; return t; }
function vegGeometry(parts) {   // a geometry from parts with per-vertex colours
  const pos = [], nor = [], col = [], c = new THREE.Color();
  for (const [geo, hex, x, y, z, sx, sy, sz] of parts) {
    const g = geo.index ? geo.toNonIndexed() : geo; g.scale(sx || 1, sy || 1, sz || 1); g.translate(x || 0, y || 0, z || 0); g.computeVertexNormals();
    c.setHex(hex); for (let i = 0; i < g.attributes.position.count; i++) col.push(c.r, c.g, c.b);
    pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array);
    g.dispose(); if (g !== geo) geo.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return out;
}
/* a broadleaf crown seen from above: one lumpy blob with soft round normals (facets looked like gems), darker low down, on a thin trunk */
function crownGeo(v) {
  const base = new THREE.IcosahedronGeometry(1, 1), p = base.attributes.position, trunk = new THREE.CylinderGeometry(0.07, 0.1, 0.9, 4, 1, true).toNonIndexed(); trunk.translate(0, 0.45, 0); trunk.computeVertexNormals();
  const pos = [], nor = [], col = [], n = new V3();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), d = 1 + (vnoise(x * 1.9 + v * 5, z * 1.9 + y * 2.3, v * 3 + 1) - 0.5) * 0.55;
    pos.push(x * d, y * d * 0.8 + 1.25, z * d); n.set(x, y * 1.2, z).normalize(); nor.push(n.x, n.y, n.z);
    const k = lerp(0.58, 1.08, (y + 1) / 2) * (0.82 + vnoise(x * 3 + v, z * 3 - v, 9 + v) * 0.36); col.push(k, k, k);
  }
  for (let i = 0; i < trunk.attributes.position.count; i++) { pos.push(trunk.attributes.position.getX(i), trunk.attributes.position.getY(i), trunk.attributes.position.getZ(i)); nor.push(trunk.attributes.normal.getX(i), trunk.attributes.normal.getY(i), trunk.attributes.normal.getZ(i)); col.push(0.34, 0.28, 0.22); }
  base.dispose(); trunk.dispose();
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return out;
}
function bareGeo(v) {   // a leafless tree: a trunk and a fan of branches
  const rng = mulberry32(100 + v), parts = [[new THREE.CylinderGeometry(0.05, 0.11, 2.1, 4, 1, true), 0x5a5046, 0, 1.05, 0]];
  for (let i = 0; i < 7; i++) {
    const L = lerp(0.9, 1.5, rng()), g = new THREE.CylinderGeometry(0.012, 0.045, L, 3, 1, true), a = i / 7 * TAU + rng(), t = lerp(0.5, 1.05, rng()); g.translate(0, L / 2, 0); g.rotateZ(-t); g.rotateY(a);
    parts.push([g, 0x6a5e52, 0, lerp(1.2, 2, rng()), 0]);
  }
  return vegGeometry(parts);
}
const cone = (r, h, s) => new THREE.ConeGeometry(r, h, s || 7, 1, true), cylv = (a, b, h, s) => new THREE.CylinderGeometry(a, b, h, s || 4, 1, true);
const CROWN_MAT = sensorMat(new THREE.MeshPhongMaterial({ color: 0x8c9084, vertexColors: true, shininess: 3, specular: 0x050505 }), 0.03); CROWN_MAT.userData.shared = true;
const FIR_MAT = sensorMat(new THREE.MeshPhongMaterial({ color: 0xffffff, vertexColors: true, flatShading: true, shininess: 3, specular: 0x050505, side: THREE.DoubleSide }), 0.01); FIR_MAT.userData.shared = true;
const FIR_DEPTH = new THREE.MeshDepthMaterial({ side: THREE.DoubleSide });
const SNOW_FIR_MAT = sensorMat(new THREE.MeshPhongMaterial({ color: 0xbcc2ca, vertexColors: true, flatShading: true, shininess: 3, specular: 0x050505, side: THREE.DoubleSide }), -0.16); SNOW_FIR_MAT.userData.shared = true;
const BARE_MAT = sensorMat(new THREE.MeshPhongMaterial({ color: 0xffffff, vertexColors: true, flatShading: true, shininess: 2, specular: 0x050505 }), 0.02); BARE_MAT.userData.shared = true;
/* what grows in a season: roles are the same every season (the layout does not change), the shapes are not */
const VEG_ROLES = ['broad0', 'broad1', 'fir', 'bush'];
function vegKinds(season) {
  const S = SEASONS[season];
  const firParts = [[cylv(0.1, 0.14, 0.8), 0x4a3a2a, 0, 0.4, 0], [cone(1.05, 1.7), 0x24402c, 0, 1.45, 0], [cone(0.82, 1.4), 0x284a32, 0, 2.3, 0], [cone(0.56, 1.2), 0x2e5238, 0, 3.05, 0]];
  if (season === 'winter') {
    const snowy = firParts.concat([[cone(0.9, 0.52), 0xeaf0f6, 0, 1.86, 0], [cone(0.68, 0.46), 0xeaf0f6, 0, 2.62, 0], [cone(0.44, 0.5), 0xf2f5f9, 0, 3.42, 0]]);
    return { broad0: { geo: bareGeo(0), mat: BARE_MAT, size: [2.4, 3.8], tint: [0xffffff, 0xdddddd] }, broad1: { geo: bareGeo(1), mat: BARE_MAT, size: [2.4, 3.8], tint: [0xffffff, 0xdddddd] },
      fir: { geo: vegGeometry(snowy), mat: SNOW_FIR_MAT, size: [1.5, 2.6], tint: [0xffffff, 0xe8f0e8, 0xf4f4ec] },
      bush: { geo: bareGeo(2), mat: BARE_MAT, size: [0.7, 1.1], tint: [0xcccccc] } };
  }
  return { broad0: { geo: crownGeo(0), mat: CROWN_MAT, size: [2.3, 4.4], tint: S.leaf }, broad1: { geo: crownGeo(1), mat: CROWN_MAT, size: [2.3, 4.4], tint: S.leaf },
    fir: { geo: vegGeometry(firParts), mat: FIR_MAT, size: [1.5, 2.6], tint: [0xffffff, 0xe0f0e0] },
    bush: { geo: crownGeo(2), mat: CROWN_MAT, size: [0.9, 1.7], tint: S.leaf, flat: true } };
}
const _tm = new THREE.Matrix4(), _tq = new THREE.Quaternion(), _ts = new V3(), _tp = new V3(), _tc = new THREE.Color(), _tup = new V3(0, 1, 0);
const TERRAIN = {
  season: null, chunks: [], veg: [], kinds: null, trees: 0, uHeat: { value: 0.13 }, u: null, mat: null,
  /* the world's ground, once per map */
  *buildGround() {
    const V = CHUNK_CELLS + 1, idx = new Uint16Array(CHUNK_CELLS * CHUNK_CELLS * 6);
    for (let j = 0, n = 0; j < CHUNK_CELLS; j++) for (let i = 0; i < CHUNK_CELLS; i++) { const a = j * V + i, b = a + 1, c = a + V, d = c + 1; idx[n++] = a; idx[n++] = c; idx[n++] = b; idx[n++] = b; idx[n++] = c; idx[n++] = d; }   // split along b-c: groundH follows it
    const index = new THREE.BufferAttribute(idx, 1), H = MAP.h, W = MAP_V;
    this.buildMaterial();
    for (let cz = 0; cz < CHUNK_N; cz++) {
      for (let cx = 0; cx < CHUNK_N; cx++) {
        const p = new Float32Array(V * V * 3), n = new Float32Array(V * V * 3); let lo = 1e9, hi = -1e9;
        for (let j = 0, k = 0; j < V; j++) for (let i = 0; i < V; i++, k += 3) {
          const gi = cx * CHUNK_CELLS + i, gj = cz * CHUNK_CELLS + j, y = H[gj * W + gi];
          p[k] = -MAP_HALF + gi * MAP_CELL; p[k + 1] = y; p[k + 2] = -MAP_HALF + gj * MAP_CELL; lo = Math.min(lo, y); hi = Math.max(hi, y);
          const L = H[gj * W + Math.max(gi - 1, 0)], R = H[gj * W + Math.min(gi + 1, MAP_N)], U = H[Math.max(gj - 1, 0) * W + gi], D = H[Math.min(gj + 1, MAP_N) * W + gi];
          let nx = L - R, ny = 2 * MAP_CELL, nz = U - D; const l = Math.hypot(nx, ny, nz); n[k] = nx / l; n[k + 1] = ny / l; n[k + 2] = nz / l;
        }
        const g = new THREE.BufferGeometry(); g.setIndex(index); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
        const hx = -MAP_HALF + (cx + 0.5) * CHUNK_M, hz = -MAP_HALF + (cz + 0.5) * CHUNK_M;
        g.boundingSphere = new THREE.Sphere(new V3(hx, (lo + hi) / 2, hz), Math.hypot(CHUNK_M * 0.71, (hi - lo) / 2));
        const m = new THREE.Mesh(g, this.mat); m.receiveShadow = true; scene.add(m); this.chunks.push(m);
      }
      yield;
    }
  },
  buildMaterial() {
    const data = new Uint8Array(MAP_V * MAP_V * 4), F = MAP.forest, D = MAP.dry;
    for (let k = 0; k < F.length; k++) { const x = -MAP_HALF + (k % MAP_V) * MAP_CELL, z = -MAP_HALF + ((k / MAP_V) | 0) * MAP_CELL; data[k * 4] = 255 * D[k] * (1 - F[k]); data[k * 4 + 1] = 255 * F[k]; data[k * 4 + 2] = occAt(x, z) & OCC_YARD ? 230 : 0; data[k * 4 + 3] = 255; }
    const mask = new THREE.DataTexture(data, MAP_V, MAP_V, THREE.RGBAFormat); mask.magFilter = THREE.LinearFilter; mask.minFilter = THREE.LinearMipmapLinearFilter; mask.generateMipmaps = true; mask.needsUpdate = true;
    const u = this.u = { tMask: { value: mask }, tDet: { value: detailTex() }, uA: { value: new THREE.Color() }, uB: { value: new THREE.Color() }, uFld: { value: new THREE.Color() }, uFrs: { value: new THREE.Color() }, tLand: { value: landTex() }, uYard: { value: new THREE.Color() }, uC0: { value: new THREE.Color() }, uC1: { value: new THREE.Color() }, uC2: { value: new THREE.Color() }, uC3: { value: new THREE.Color() } };
    const uHeat = this.uHeat, mat = this.mat = sensorMat(new THREE.MeshPhongMaterial({ shininess: 0, specular: 0 }));
    mat.userData.shared = true; mat.userData.albK = 1.0;
    mat.userData.extend = shader => {
      Object.assign(shader.uniforms, u); shader.uniforms.uMatHeat = uHeat;   // (a shared object: the season changes it)
      shader.vertexShader = 'varying vec2 vW;\n' + shader.vertexShader.replace('#include <begin_vertex>', 'vW = position.xz;\n#include <begin_vertex>');
      shader.fragmentShader = 'uniform sampler2D tMask, tDet, tLand; uniform vec3 uA, uB, uFld, uFrs, uYard, uC0, uC1, uC2, uC3; varying vec2 vW;\n' + shader.fragmentShader.replace('#include <color_fragment>', `
        vec4 mk = texture2D(tMask, (vW + ${MAP_HALF.toFixed(1)}) / ${(MAP_N * MAP_CELL).toFixed(1)} * ${(MAP_N / MAP_V).toFixed(6)} + ${(0.5 / MAP_V).toFixed(6)});
        vec4 d0 = texture2D(tDet, vW / 41.0), d1 = texture2D(tDet, vW / 133.0), d2 = texture2D(tDet, vW / 23.0);
        vec3 g = mix(uA, uB, smoothstep(0.34, 0.66, d1.g));
        g = mix(g, uFld, mk.r * 0.75); g = mix(g, uFrs, mk.g); g = mix(g, uYard, mk.b * 0.8);
        vec4 lu = texture2D(tLand, (vW + ${MAP_HALF.toFixed(1)}) / ${(2 * MAP_HALF).toFixed(1)});
        if (lu.r > 0.004) {      // a field: g and b are premultiplied by the coverage (an edge keeps its own crop and rows)
          float ang = lu.g / lu.r * 3.14159265, cb = lu.b / lu.r;
          vec3 cc = cb < 0.25 ? uC0 : cb < 0.5 ? uC1 : cb < 0.75 ? uC2 : uC3;
          cc *= pow(0.86 + 0.14 * sin(dot(vW, vec2(cos(ang), sin(ang))) * 2.4), 2.2);
          g = mix(g, cc, lu.r);
        }
        g *= pow(0.74 + d0.r * 0.34 + d2.b * 0.18 + (d1.r - 0.5) * 0.14, 2.2);   // (the detail's shading is a display-space factor)
        diffuseColor.rgb = g;`);
    };
    mat.customProgramCacheKey = () => 'ground';   // its own program: the source above differs from the shared hook's
  },
  setSeason(season) {
    const P = GROUND_PAL[season], u = this.u;
    u.uA.value.setHex(P.a); u.uB.value.setHex(P.b); u.uFld.value.setHex(P.fld); u.uFrs.value.setHex(P.frs); u.uYard.value.setHex(P.yard); P.crops.forEach((c, i) => u['uC' + i].value.setHex(c)); this.uHeat.value = P.heat;
    seasonMats(season);
  },
  /* the vegetation: positions depend only on the map's seed, so a season keeps every tree where it was */
  *buildVeg(season) {
    this.clearVeg();
    this.season = season;
    const kinds = this.kinds = vegKinds(season), rng = mulberry32(MAP.seed ^ 0x51ed270b), N = VEG_ROLES.length, buckets = Array.from({ length: CHUNK_N * CHUNK_N * N }, () => []), SP = 6;
    let n = 0;
    for (let z = -MAP_HALF + SP / 2; z < MAP_HALF; z += SP) {
      for (let x = -MAP_HALF + SP / 2; x < MAP_HALF; x += SP) {
        const px = x + (rng() - 0.5) * SP * 0.9, pz = z + (rng() - 0.5) * SP * 0.9, a = rng(), b = rng(), c = rng(), d = rng(), e = rng();
        const f = MAP.sample(MAP.forest, px, pz), open = 0.012 + MAP.sample(MAP.dry, px, pz) * -0.008;
        let role; const o = occAt(px, pz), w = waterAt(px, pz);
        if ((o & (OCC_WATER | OCC_ROAD | OCC_RAIL | OCC_BUILD | OCC_FIELD)) || w === 1 || w === 2) continue;   // nothing grows on what is used
        if (o & OCC_HEDGE) { if (a > 0.55) continue; role = b < 0.6 ? 3 : c < 0.5 ? 0 : 1; }       // hedgerows between the fields
        else if (o & OCC_YARD) { if (a > 0.06 || LAYOUT.outposts.concat(LAYOUT.sites).some(q => Math.abs(q.x - px) < 45 && Math.abs(q.z - pz) < 45)) continue; role = b < 0.5 ? 3 : 0; }                    // a garden tree now and then (none in an outpost)
        else if (a < f * 0.94) role = MAP.sample(MAP.conifer, px, pz) > 0.5 ? (b < 0.85 ? 2 : c < 0.5 ? 0 : 1) : (b < 0.06 ? 2 : c < 0.5 ? 0 : 1);
        else if (f > 0.03 && f < 0.9 && a < 0.22 + f * 0.5) role = 3;                     // bushes at the forest's edge
        else if (a > 1 - open) role = b < 0.45 ? 3 : b < 0.72 ? 0 : b < 0.94 ? 1 : 2;     // a lone tree or bush in the open
        else continue;
        const cx = clamp(Math.floor((px + MAP_HALF) / CHUNK_M), 0, CHUNK_N - 1), cz = clamp(Math.floor((pz + MAP_HALF) / CHUNK_M), 0, CHUNK_N - 1);
        buckets[(cz * CHUNK_N + cx) * N + role].push(px, pz, d, e); n++;
      }
      if (Math.round(z) % 96 === 3) yield;
    }
    this.trees = n;
    for (let c = 0; c < buckets.length; c++) {
      const list = buckets[c]; if (!list.length) continue;
      const K = kinds[VEG_ROLES[c % N]], count = list.length / 4, g = new THREE.BufferGeometry(); for (const k in K.geo.attributes) g.setAttribute(k, K.geo.attributes[k]);
      const inst = new THREE.InstancedMesh(g, K.mat, count);
      let lo = 1e9, hi = -1e9, sx = 0, sz = 0;
      for (let i = 0; i < count; i++) {
        const px = list[i * 4], pz = list[i * 4 + 1], d = list[i * 4 + 2], e = list[i * 4 + 3], y = groundH(px, pz), s = lerp(K.size[0], K.size[1], d);
        lo = Math.min(lo, y); hi = Math.max(hi, y); sx += px / count; sz += pz / count;
        _tq.setFromAxisAngle(_tup, e * TAU * 7); _ts.set(s, s * lerp(0.88, 1.15, e), s);
        inst.setMatrixAt(i, _tm.compose(_tp.set(px, y - 0.1, pz), _tq, _ts)); inst.setColorAt(i, _tc.setHex(K.tint[Math.floor(e * 977) % K.tint.length]));
      }
      let r = 0; for (let i = 0; i < count; i++) r = Math.max(r, Math.hypot(list[i * 4] - sx, list[i * 4 + 1] - sz));
      inst.boundingSphere = new THREE.Sphere(new V3(sx, (lo + hi) / 2 + 6, sz), Math.hypot(r + 9, (hi - lo) / 2 + 12));
      inst.castShadow = true; inst.receiveShadow = true; inst.instanceColor.needsUpdate = true;
      if (K.mat.side === THREE.DoubleSide) inst.customDepthMaterial = FIR_DEPTH;   // (two-sided firs: a depth material of their own, compiled with the rest at the start; the shared one only switches its program in some orders)
      scene.add(inst); this.veg.push(inst);
      if (c % 64 === 0) yield;
    }
  },
  clearVeg() {
    for (const v of this.veg) { scene.remove(v); v.geometry.dispose(); v.dispose(); }
    this.veg = [];
    if (this.kinds) for (const k in this.kinds) this.kinds[k].geo.dispose();
    this.kinds = null;
  },
  /* a new season (the month turned, or the setting): palette at once, the shapes rebuilt in one go */
  changeSeason(season) { this.setSeason(season); for (const _ of this.buildVeg(season)); LAMPS.bake(); }
};
