// the shader-pack world behind the sign: a voxel island at sunset, rendered through
// a little post stack (depth of field, bloom, god rays, flare, grading)
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.min.js';

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const root = document.documentElement;

// --- noise -------------------------------------------------------------------

function hash(x, z, s = 0) {
  let h = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ Math.imul(s, 982451653);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const smooth = t => t * t * (3 - 2 * t);

function noise(x, z, s) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const u = smooth(x - xi), v = smooth(z - zi);
  const a = hash(xi, zi, s), b = hash(xi + 1, zi, s);
  const c = hash(xi, zi + 1, s), d = hash(xi + 1, zi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x, z, s) {
  let sum = 0, amp = 0.5, f = 1;
  for (let o = 0; o < 4; o++, amp /= 2, f *= 2) sum += noise(x * f, z * f, s + o) * amp;
  return sum / 0.9375;
}

function rand(seed) {
  return () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
}
const pick = (r, a) => a[Math.floor(r() * a.length)];

// --- pixel textures ----------------------------------------------------------

function paint(size, seed, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw((x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); }, rand(seed));
  return c;
}

// wood for the sign and its post, handed to the css
const plank = paint(16, 11, (px, r) => {
  const cols = ['#4a301b', '#50341e', '#452c19', '#563820'];
  for (let y = 0; y < 16; y++) {
    const seam = [3, 11, 6, 14][y >> 2];
    for (let x = 0; x < 16; x++) {
      const edge = y % 4 === 3 || x === seam;
      px(x, y, edge ? '#3a2514' : pick(r, cols));
    }
  }
});
const post = paint(16, 12, (px, r) => {
  const cols = ['#3b2a1b', '#33241a', '#43301f', '#2c1f15'];
  for (let x = 0; x < 16; x++) {
    let c = pick(r, cols);
    for (let y = 0; y < 16; y++) { if (r() < 0.3) c = pick(r, cols); px(x, y, c); }
  }
});
root.style.setProperty('--plank', `url(${plank.toDataURL()})`);
root.style.setProperty('--post', `url(${post.toDataURL()})`);

// 4x4 atlas of 16px tiles for the terrain
const T = {
  grassTop: 0, grassSide: 1, dirt: 2, stone: 3, sand: 4, logSide: 5, logTop: 6, leaves: 7,
  tuft: 8, flower: 9, tntSide: 10, tntTop: 11, tntBottom: 12,
};
const GRASS_C = ['#a3ab47', '#949e3c', '#aeb552', '#8b9535'];
const DIRT_C = ['#7a5535', '#6b4a2e', '#86603e', '#5c3f27'];
const STONE_C = ['#7d7d7d', '#737373', '#878787', '#6a6a6a'];
const SAND_C = ['#dbcf9b', '#d2c38c', '#e3d7a6', '#c9ba82'];
const BARK_C = ['#6b645a', '#5d564d', '#776f64', '#524c44'];
const LEAF_C = ['#6f8f2a', '#5e7d22', '#7c9c33', '#4f6b1c'];

const atlasCanvas = paint(64, 21, (px, r) => {
  const tile = (t, fn) => {
    const ox = (t % 4) * 16, oy = Math.floor(t / 4) * 16;
    for (let x = 0; x < 16; x++) for (let y = 0; y < 16; y++) {
      const c = fn(x, y);
      if (c) px(ox + x, oy + y, c);
    }
  };
  tile(T.grassTop, () => pick(r, GRASS_C));
  const lip = Array.from({ length: 16 }, () => 3 + Math.floor(r() * 3));
  tile(T.grassSide, (x, y) => (y < lip[x] ? pick(r, GRASS_C) : pick(r, DIRT_C)));
  tile(T.dirt, () => pick(r, DIRT_C));
  tile(T.stone, () => pick(r, STONE_C));
  tile(T.sand, () => pick(r, SAND_C));
  tile(T.logSide, () => pick(r, BARK_C));
  tile(T.logTop, (x, y) => {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    return d > 6.5 ? pick(r, BARK_C) : ['#c46b3b', '#ad5a2f'][Math.floor(d) % 2];
  });
  tile(T.leaves, () => (r() < 0.78 ? pick(r, LEAF_C) : null));
  const blades = Array.from({ length: 16 }, () => (r() < 0.6 ? 5 + Math.floor(r() * 9) : 0));
  tile(T.tuft, (x, y) => (15 - y < blades[x] ? pick(r, GRASS_C) : null));
  tile(T.flower, (x, y) => {
    if (x >= 6 && x <= 9 && y >= 3 && y <= 6) return (x + y) % 3 ? '#d23a2c' : '#a52419';
    if (x === 7 && y > 6) return '#4f7d22';
    return null;
  });
  const label = ['###.#..#.###', '.#..##.#..#.', '.#..#.##..#.', '.#..#..#..#.'];
  tile(T.tntSide, (x, y) => {
    if (y < 5 || y > 10) return (x + y * 3) % 7 ? '#c8352a' : '#a82a20';
    return label[y - 6]?.[x - 2] === '#' ? '#1d1d1d' : '#e8e8e8';
  });
  tile(T.tntTop, (x, y) => {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    return d < 1.5 ? '#2a2a2a' : d > 6.5 ? '#8a2a20' : (x + y) % 5 ? '#cfcfcf' : '#b5b5b5';
  });
  tile(T.tntBottom, () => pick(r, ['#5a5a5a', '#505050', '#646464']));
});

const atlas = new THREE.CanvasTexture(atlasCanvas);
atlas.magFilter = atlas.minFilter = THREE.NearestFilter;
atlas.generateMipmaps = false;
atlas.colorSpace = THREE.SRGBColorSpace;

// --- terrain: endless, generated one 16x16 column at a time ---------------------------

const SY = 64, SEA = 16, CH = 16;
const AIR = 0, GRASS = 1, DIRT = 2, STONE = 3, SAND = 4, LOG = 5, LEAVES = 6, TUFT = 7, FLOWER = 8, TNT = 9;
const PLAYER = { x: 128, z: 230 };
const opaque = id => (id >= GRASS && id <= LOG) || id === TNT;
const plant = id => id === TUFT || id === FLOWER;
const clamp01 = v => Math.min(1, Math.max(0, v));

// the home archipelago: [x, z, radius, how mountainous]
const ISLANDS = [
  [148, 142, 78, 1], // the big one across the lake
  [118, 60, 56, 1.4], // mountains behind it
  [52, 128, 38, 0.6], // under the sunset
  [218, 112, 34, 0.8], // off to the right
  [88, 196, 14, 0.2], // a little islet near the player
];

function height(x, z) {
  let island = 0, rugged = 0;
  for (const [ix, iz, r, m] of ISLANDS) {
    const k = Math.max(0, 1 - Math.hypot(x - ix, (z - iz) * 1.1) / r);
    if (k > island) { island = k; rugged = m; }
  }
  // past the home islands the sea is dotted with more, as far as anyone cares to walk
  const away = clamp01((Math.hypot(x - 128, z - 128) - 170) / 90);
  if (away > 0) {
    const k = smooth(clamp01((fbm(x * 0.006, z * 0.006, 50) - 0.48) / 0.16)) * away;
    if (k > island) { island = k; rugged = 0.4 + fbm(x * 0.004, z * 0.004, 60) * 1.4; }
  }
  // flat-topped so there's some ground in view in front of the player
  const hill = Math.min(1, Math.max(0, (1 - Math.hypot(x - PLAYER.x, z - PLAYER.z) / 22) * 1.7));
  const h = SEA - 7 + smooth(island) * 16 + smooth(hill) * 14
    + (fbm(x * 0.04, z * 0.04, 1) - 0.5) * 10
    + Math.max(0, fbm(x * 0.025, z * 0.025, 20) - 0.42) * 70 * island * rugged;
  return Math.max(2, Math.min(SY - 14, Math.round(h)));
}
const h = height;

function kindOf(top, ...around) {
  const steep = Math.max(...around.map(n => Math.abs(top - n)));
  return top <= SEA + 1 ? SAND : steep > 2 || top > SEA + 20 ? STONE : GRASS;
}
const kindAt = (x, z) => kindOf(h(x, z), h(x + 1, z), h(x - 1, z), h(x, z + 1), h(x, z - 1));

function canopy(put, cx, y, cz, rad) {
  for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) {
    if (Math.abs(dx) === rad && Math.abs(dz) === rad) continue;
    put(cx + dx, y, cz + dz, LEAVES, true);
  }
}

// acacias: straight trunk, a diagonal lean, flat canopy, sometimes a second branch
function acacia(put, x, y, z, r) {
  const trunk = 4 + Math.floor(r() * 2);
  for (let i = 0; i < trunk; i++) put(x, y + i, z, LOG);
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const branch = (from, [dx, dz], len, rad) => {
    let cx = x, cy = from, cz = z;
    for (let k = 0; k < len; k++) { cx += dx; cz += dz; put(cx, cy, cz, LOG); cy++; }
    canopy(put, cx, cy, cz, rad);
    canopy(put, cx, cy + 1, cz, rad - 1);
  };
  const d = pick(r, dirs);
  branch(y + trunk, d, 1 + Math.floor(r() * 3), 3);
  if (r() < 0.5) branch(y + trunk - 2, [-d[0], -d[1]], 1 + Math.floor(r() * 2), 2);
}

// the one suspicious block: dropped where the player looks down and to the right,
// so it always lands somewhere visible on the hill
const FUSE = (() => {
  const yaw = -0.22, pitch = -0.33;
  const d = [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
  const o = [PLAYER.x + 0.5, h(PLAYER.x, PLAYER.z) + 2.62, PLAYER.z + 0.5];
  for (let t = 0; t < 40; t += 0.05) {
    const x = Math.floor(o[0] + d[0] * t), z = Math.floor(o[2] + d[2] * t);
    const top = h(x, z);
    if (Math.floor(o[1] + d[1] * t) > top) continue;
    if (top <= SEA + 1) break;
    return { x, y: top + 1, z };
  }
  return { x: PLAYER.x + 2, y: h(PLAYER.x + 2, PLAYER.z - 3) + 1, z: PLAYER.z - 3 };
})();

// one column of the world, the same every time it's asked for
function generate(cx, cz) {
  const data = new Uint8Array(CH * SY * CH);
  const x0 = cx * CH, z0 = cz * CH;
  const put = (x, y, z, id, onlyAir = false) => {
    const lx = x - x0, lz = z - z0;
    if (lx < 0 || lz < 0 || lx >= CH || lz >= CH || y < 0 || y >= SY) return;
    const i = (y * CH + lz) * CH + lx;
    if (!onlyAir || data[i] === AIR) data[i] = id;
  };

  const W = CH + 2, tops = new Int32Array(W * W);
  for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) tops[z * W + x] = h(x0 + x - 1, z0 + z - 1);
  const top = (lx, lz) => tops[(lz + 1) * W + lx + 1];
  const kinds = new Uint8Array(CH * CH);
  for (let lz = 0; lz < CH; lz++) for (let lx = 0; lx < CH; lx++) {
    const t = top(lx, lz);
    const kind = kindOf(t, top(lx + 1, lz), top(lx - 1, lz), top(lx, lz + 1), top(lx, lz - 1));
    kinds[lz * CH + lx] = kind;
    for (let y = 0; y <= t; y++) {
      put(x0 + lx, y, z0 + lz, kind === STONE || y < t - 3 ? STONE : y === t ? kind : kind === SAND ? SAND : DIRT);
    }
  }

  // trees sit on a jittered 7 block grid; look a little past the edges since canopies spill over
  for (let gz = Math.floor((z0 - 9) / 7); gz <= Math.floor((z0 + CH + 9) / 7); gz++) {
    for (let gx = Math.floor((x0 - 9) / 7); gx <= Math.floor((x0 + CH + 9) / 7); gx++) {
      const r = rand(Math.floor(hash(gx, gz, 42) * 4294967296));
      const x = gx * 7 + Math.floor(r() * 4), z = gz * 7 + Math.floor(r() * 4);
      if (r() > 0.4 || Math.hypot(x - PLAYER.x, z - PLAYER.z) < 14) continue;
      if (kindAt(x, z) === GRASS) acacia(put, x, h(x, z) + 1, z, r);
    }
  }

  for (let lz = 0; lz < CH; lz++) for (let lx = 0; lx < CH; lx++) {
    const x = x0 + lx, z = z0 + lz, t = top(lx, lz), roll = hash(x, z, 77);
    if (kinds[lz * CH + lx] !== GRASS || t + 1 >= SY || data[((t + 1) * CH + lz) * CH + lx] !== AIR) continue;
    if (roll < 0.012) put(x, t + 1, z, FLOWER);
    else if (roll < 0.2) put(x, t + 1, z, TUFT);
  }

  put(FUSE.x, FUSE.y, FUSE.z, TNT);
  return data;
}

// columns live in a map, made on first touch; the ones you've changed are kept for good
const store = new Map(), modified = new Set();
const ckey = (cx, cz) => (cx + 32768) * 65536 + (cz + 32768);
const keyX = k => Math.floor(k / 65536) - 32768, keyZ = k => (k % 65536) - 32768;
let cacheX = NaN, cacheZ = NaN, cacheData = null;

function column(cx, cz) {
  if (cx === cacheX && cz === cacheZ) return cacheData;
  const k = ckey(cx, cz);
  let data = store.get(k);
  if (!data) store.set(k, (data = generate(cx, cz)));
  cacheX = cx;
  cacheZ = cz;
  cacheData = data;
  return data;
}

function forget(k) {
  store.delete(k);
  if (ckey(cacheX, cacheZ) === k) cacheX = cacheZ = NaN;
}

const inside = (x, y) => y >= 0 && y < SY;
const get = (x, y, z) => (y < 0 || y >= SY ? AIR : column(x >> 4, z >> 4)[(y * CH + (z & 15)) * CH + (x & 15)]);
const set = (x, y, z, id) => { if (y >= 0 && y < SY) column(x >> 4, z >> 4)[(y * CH + (z & 15)) * CH + (x & 15)] = id; };

// --- meshing (culled faces + minecraft style corner ao) ---------------------------

const FACES = [
  { d: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], f: 'side' },
  { d: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], f: 'side' },
  { d: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], f: 'top' },
  { d: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], f: 'bottom' },
  { d: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], f: 'side' },
  { d: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], f: 'side' },
];
const TILES = {
  [GRASS]: { top: T.grassTop, side: T.grassSide, bottom: T.dirt },
  [DIRT]: T.dirt, [STONE]: T.stone, [SAND]: T.sand,
  [LOG]: { top: T.logTop, side: T.logSide, bottom: T.logTop },
  [LEAVES]: T.leaves,
  [TNT]: { top: T.tntTop, side: T.tntSide, bottom: T.tntBottom },
};
const AO = [0.42, 0.62, 0.82, 1];
const EPS = 0.5 / 64;

function bucket() {
  return { pos: [], nrm: [], uv: [], col: [], wave: [], idx: [] };
}

function tileRect(tile) {
  const u0 = (tile % 4) / 4 + EPS, u1 = (tile % 4 + 1) / 4 - EPS;
  const v1 = 1 - Math.floor(tile / 4) / 4 - EPS, v0 = 1 - (Math.floor(tile / 4) + 1) / 4 + EPS;
  return [u0, v0, u1, v1];
}

const tileOf = (id, f) => (typeof TILES[id] === 'number' ? TILES[id] : TILES[id][f]);

function face4(b, corners, n, tile, shade, waves) {
  const base = b.pos.length / 3;
  const [u0, v0, u1, v1] = tileRect(tile);
  const uvs = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
  corners.forEach((p, i) => {
    b.pos.push(...p);
    b.nrm.push(...n);
    b.uv.push(...uvs[i]);
    b.col.push(shade[i], shade[i], shade[i]);
    b.wave.push(waves[i]);
  });
  // flip the diagonal so ao gradients don't crease
  if (shade[0] + shade[2] < shade[1] + shade[3]) b.idx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
  else b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

const occludes = (x, y, z) => (opaque(get(x, y, z)) || get(x, y, z) === LEAVES ? 1 : 0);

function meshVoxel(x, y, z, solid, cutout) {
  const id = get(x, y, z);
  if (id === AIR) return;
  const tint = 0.9 + hash(x * 7 + y, z, 5) * 0.14;

  if (plant(id)) {
    const tile = id === TUFT ? T.tuft : T.flower, s = [tint, tint, tint, tint], w = [0, 0, 1.4, 1.4];
    const a = 0.15, b = 0.85;
    face4(cutout, [[x + a, y, z + a], [x + b, y, z + b], [x + b, y + 1, z + b], [x + a, y + 1, z + a]], [0, 1, 0], tile, s, w);
    face4(cutout, [[x + a, y, z + b], [x + b, y, z + a], [x + b, y + 1, z + a], [x + a, y + 1, z + b]], [0, 1, 0], tile, s, w);
    return;
  }

  for (const face of FACES) {
    const [dx, dy, dz] = face.d;
    const n = get(x + dx, y + dy, z + dz);
    if (opaque(n) || (id === LEAVES && n === LEAVES)) continue;
    const axis = dx ? 0 : dy ? 1 : 2;
    const [a1, a2] = [0, 1, 2].filter(a => a !== axis);
    const shade = face.c.map(c => {
      const o1 = [0, 0, 0], o2 = [0, 0, 0];
      o1[a1] = c[a1] ? 1 : -1;
      o2[a2] = c[a2] ? 1 : -1;
      const px = x + dx, py = y + dy, pz = z + dz;
      const s1 = occludes(px + o1[0], py + o1[1], pz + o1[2]);
      const s2 = occludes(px + o2[0], py + o2[1], pz + o2[2]);
      const cc = occludes(px + o1[0] + o2[0], py + o1[1] + o2[1], pz + o1[2] + o2[2]);
      return AO[s1 && s2 ? 0 : 3 - s1 - s2 - cc] * tint;
    });
    const corners = face.c.map(([cx, cy, cz]) => [x + cx, y + cy, z + cz]);
    const waves = id === LEAVES ? [0.5, 0.5, 0.5, 0.5] : [0, 0, 0, 0];
    face4(id === LEAVES ? cutout : solid, corners, face.d, tileOf(id, face.f), shade, waves);
  }
}

function geometry(b) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
  g.setAttribute('wave', new THREE.Float32BufferAttribute(b.wave, 1));
  g.setIndex(b.idx);
  return g;
}

// --- shaders shared by everything in the world ----------------------------------

const elev = THREE.MathUtils.degToRad(8), azim = THREE.MathUtils.degToRad(40);
const sunDir = new THREE.Vector3(-Math.sin(azim) * Math.cos(elev), Math.sin(elev), -Math.cos(azim) * Math.cos(elev));
const shared = {
  uTime: { value: 0 },
  uSunDir: { value: sunDir },
  uFogDensity: { value: 0.0055 },
};

const SKY = /* glsl */`
uniform vec3 uSunDir;
vec3 skyColor(vec3 d) {
  float s = max(dot(d, uSunDir), 0.0);
  vec3 horizon = mix(vec3(0.62, 0.36, 0.48), vec3(1.1, 0.5, 0.24), pow(s * 0.5 + 0.5, 4.0));
  vec3 col = mix(horizon, vec3(0.42, 0.24, 0.42), smoothstep(0.0, 0.2, d.y));
  col = mix(col, vec3(0.05, 0.08, 0.24), smoothstep(0.12, 0.7, d.y));
  col = mix(col, horizon * 0.8, smoothstep(0.0, -0.1, d.y));
  col += vec3(1.4, 0.65, 0.25) * pow(s, 10.0) * 0.45;
  col += vec3(2.0, 1.1, 0.5) * pow(s, 90.0) * 1.2;
  return col;
}`;

const FOG = /* glsl */`{
  vec3 fd = vFogWorld - cameraPosition;
  float fogAmount = 1.0 - exp(-pow(length(fd) * uFogDensity, 2.0));
  gl_FragColor.rgb = mix(gl_FragColor.rgb, skyColor(normalize(vec3(fd.x, max(fd.y, 0.0) * 0.25, fd.z))), fogAmount);
}`;

// lambert, but with sky-coloured fog and (optionally) wind
function worldMaterial(params, wave = false) {
  const m = new THREE.MeshLambertMaterial(params);
  m.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, shared);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        varying vec3 vFogWorld;
        uniform float uTime;
        attribute float wave;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        ${wave ? 'transformed.xz += wave * vec2(sin(uTime * 1.7 + position.x * 0.7 + position.y * 0.4), cos(uTime * 1.3 + position.z * 0.6 + position.y * 0.3)) * 0.07;' : ''}`)
      .replace('#include <fog_vertex>', `#include <fog_vertex>
        vec4 fogWorld = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          fogWorld = instanceMatrix * fogWorld;
        #endif
        vFogWorld = (modelMatrix * fogWorld).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vFogWorld;
        uniform float uFogDensity;
        ${SKY}`)
      .replace('#include <fog_fragment>', FOG);
  };
  m.customProgramCacheKey = () => `world-${wave}`;
  return m;
}

// --- scene -------------------------------------------------------------------

const canvas = document.createElement('canvas');
canvas.id = 'world';
canvas.setAttribute('aria-hidden', 'true');
document.body.prepend(canvas);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false; // the sun never moves, so the shadow map is drawn once

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, 1, 0.2, 3000);
const eye = new THREE.Vector3(PLAYER.x + 0.5, h(PLAYER.x, PLAYER.z) + 2.62, PLAYER.z + 0.5);
camera.position.copy(eye);

// columns are meshed around the camera as it moves, nearest first; edits jump the queue
// and a crater only rebuilds the columns it touched
const terrainMat = worldMaterial({ map: atlas, vertexColors: true });
const foliageMat = worldMaterial({ map: atlas, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide }, true);
const VIEW = 10;
const meshes = new Map(), dirty = new Set(), loading = new Set();

function remesh(k) {
  const solid = bucket(), cutout = bucket();
  const x0 = keyX(k) * CH, z0 = keyZ(k) * CH;
  for (let y = 0; y < SY; y++) for (let z = z0; z < z0 + CH; z++) for (let x = x0; x < x0 + CH; x++) meshVoxel(x, y, z, solid, cutout);
  let pair = meshes.get(k);
  if (!pair) {
    pair = [terrainMat, foliageMat].map(mat => {
      const m = new THREE.Mesh(new THREE.BufferGeometry(), mat);
      m.castShadow = m.receiveShadow = true;
      scene.add(m);
      return m;
    });
    meshes.set(k, pair);
  }
  pair.forEach((m, i) => {
    m.geometry.dispose();
    m.geometry = geometry(i ? cutout : solid);
  });
}

function unmesh(k) {
  for (const m of meshes.get(k) || []) {
    scene.remove(m);
    m.geometry.dispose();
  }
  meshes.delete(k);
}

let streamedFrom = NaN;
function stream(x, z, now = 0) {
  const pcx = Math.floor(x / CH), pcz = Math.floor(z / CH);
  if (streamedFrom === ckey(pcx, pcz) && !now) return;
  streamedFrom = ckey(pcx, pcz);
  const want = [];
  for (let dz = -VIEW; dz <= VIEW; dz++) for (let dx = -VIEW; dx <= VIEW; dx++) {
    const d = Math.hypot(dx, dz);
    if (d <= VIEW) want.push([d, ckey(pcx + dx, pcz + dz)]);
  }
  want.sort((a, b) => a[0] - b[0]);
  loading.clear();
  want.forEach(([, k], n) => {
    if (meshes.has(k)) return;
    if (n < now) remesh(k);
    else loading.add(k);
  });
  // let go of what's far behind; changed columns keep their blocks for when you come back
  for (const k of [...meshes.keys()]) if (Math.hypot(keyX(k) - pcx, keyZ(k) - pcz) > VIEW + 2) unmesh(k);
  for (const k of [...store.keys()]) {
    if (!modified.has(k) && Math.hypot(keyX(k) - pcx, keyZ(k) - pcz) > VIEW + 4) forget(k);
  }
}
stream(eye.x, eye.z, reduceMotion ? Infinity : 24);

scene.add(new THREE.HemisphereLight(0x8a8fd0, 0x5a3a2a, 2.2));
const sun = new THREE.DirectionalLight(0xffa860, 4.2);
sun.target.position.set(128, SEA, 128);
sun.position.copy(sun.target.position).addScaledVector(sunDir, 280);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -135, right: 135, top: 135, bottom: -135, near: 1, far: 560 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);

const sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), new THREE.ShaderMaterial({
  uniforms: shared,
  side: THREE.BackSide,
  depthWrite: false,
  vertexShader: /* glsl */`
    varying vec3 vDir;
    void main() {
      vDir = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      gl_Position.z = gl_Position.w;
    }`,
  fragmentShader: /* glsl */`
    varying vec3 vDir;
    ${SKY}
    void main() {
      vec3 d = normalize(vDir);
      vec3 col = skyColor(d);
      // a square sun, obviously
      vec3 t1 = normalize(cross(uSunDir, vec3(0.0, 1.0, 0.0)));
      vec3 t2 = cross(t1, uSunDir);
      float facing = dot(d, uSunDir);
      vec2 q = vec2(dot(d, t1), dot(d, t2)) / max(facing, 1e-3);
      if (facing > 0.0) col += vec3(24.0, 14.0, 7.0) * (1.0 - smoothstep(0.035, 0.04, max(abs(q.x), abs(q.y))));
      gl_FragColor = vec4(col, 1.0);
    }`,
}));
sky.renderOrder = -1;
scene.add(sky);

const water = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.ShaderMaterial({
  uniforms: shared,
  transparent: true,
  side: THREE.DoubleSide,
  vertexShader: /* glsl */`
    varying vec3 vFogWorld;
    void main() {
      vec4 w = modelMatrix * vec4(position, 1.0);
      vFogWorld = w.xyz;
      gl_Position = projectionMatrix * viewMatrix * w;
    }`,
  fragmentShader: /* glsl */`
    uniform float uTime, uFogDensity;
    varying vec3 vFogWorld;
    ${SKY}
    void main() {
      vec2 p = vFogWorld.xz;
      float t = uTime;
      vec3 n = normalize(vec3(
        sin(p.x * 0.8 + t * 1.3) * 0.05 + sin(p.x * 2.3 - p.y * 1.7 + t * 2.1) * 0.03 + sin((p.x + p.y) * 4.1 + t * 3.0) * 0.015,
        1.0,
        cos(p.y * 0.9 + t * 1.1) * 0.05 + cos(p.y * 2.7 + p.x * 1.3 + t * 1.9) * 0.03 + cos((p.x - p.y) * 3.7 + t * 2.7) * 0.015));
      vec3 v = normalize(cameraPosition - vFogWorld);
      vec3 r = reflect(-v, n);
      r.y = abs(r.y);
      float fres = 0.04 + 0.96 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
      vec3 col = mix(vec3(0.02, 0.08, 0.11), skyColor(r), fres);
      float s = max(dot(r, uSunDir), 0.0);
      col += vec3(1.0, 0.62, 0.32) * (pow(s, 400.0) * 60.0 + pow(s, 40.0) * 1.2);
      gl_FragColor = vec4(col, mix(0.78, 1.0, fres));
      ${FOG}
    }`,
}));
water.rotation.x = -Math.PI / 2;
water.position.set(eye.x, SEA + 0.88, eye.z);
scene.add(water);

// flat blocky clouds, drifting
const cloudCells = [];
for (let i = -25; i < 25; i++) for (let j = -25; j < 25; j++) {
  if (fbm(i * 0.17, j * 0.17, 9) > 0.56) cloudCells.push([i * 12, j * 12]);
}
const clouds = new THREE.InstancedMesh(
  new THREE.BoxGeometry(12, 4, 12),
  worldMaterial({ color: 0xfff0e6, emissive: 0x6a3a4a }),
  cloudCells.length,
);
scene.add(clouds);
const cloudMatrix = new THREE.Matrix4();
// the cloud layer wraps around wherever the camera is
const wrap = v => ((v + 300) % 600 + 600) % 600 - 300;
function placeClouds(t) {
  const shift = t * 0.8, { x: camX, z: camZ } = camera.position;
  cloudCells.forEach(([cx, cz], i) => {
    const x = camX + wrap(128 + cx + shift - camX), z = camZ + wrap(128 + cz - camZ);
    clouds.setMatrixAt(i, cloudMatrix.makeTranslation(x, 100, z));
  });
  clouds.instanceMatrix.needsUpdate = true;
}

// sunlit dust drifting in front of the camera (they blur into bokeh)
const MOTES = 220;
const motePos = new Float32Array(MOTES * 3), moteSeed = new Float32Array(MOTES);
const mr = rand(5);
for (let i = 0; i < MOTES; i++) {
  motePos.set([eye.x - 20 + mr() * 40, eye.y - 3 + mr() * 10, eye.z - 30 + mr() * 26], i * 3);
  moteSeed[i] = mr();
}
const motesGeo = new THREE.BufferGeometry();
motesGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
motesGeo.setAttribute('seed', new THREE.BufferAttribute(moteSeed, 1));
const motes = new THREE.Points(motesGeo, new THREE.ShaderMaterial({
  uniforms: shared,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  vertexShader: /* glsl */`
    uniform float uTime;
    attribute float seed;
    varying float vGlow;
    void main() {
      vec3 p = position + vec3(sin(uTime * 0.3 + seed * 40.0) * 0.8, sin(uTime * 0.2 + seed * 25.0) * 0.6, cos(uTime * 0.25 + seed * 31.0) * 0.8);
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      vGlow = 0.5 + 0.5 * sin(uTime * 1.5 + seed * 60.0);
      gl_PointSize = (0.6 + seed) * 90.0 / -mv.z;
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */`
    varying float vGlow;
    void main() {
      float d = length(gl_PointCoord - 0.5);
      gl_FragColor = vec4(vec3(3.0, 1.9, 0.9) * vGlow * smoothstep(0.5, 0.2, d), 1.0);
    }`,
}));
scene.add(motes);

// --- post ----------------------------------------------------------------------

const VERT = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const fx = (uniforms, fragmentShader) => new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader, depthTest: false, depthWrite: false });

const downMat = fx({ tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } }, /* glsl */`
  uniform sampler2D tSrc;
  uniform vec2 uTexel;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tSrc, vUv + uTexel * vec2(-0.5, -0.5)).rgb + texture2D(tSrc, vUv + uTexel * vec2(0.5, -0.5)).rgb
           + texture2D(tSrc, vUv + uTexel * vec2(-0.5, 0.5)).rgb + texture2D(tSrc, vUv + uTexel * vec2(0.5, 0.5)).rgb;
    gl_FragColor = vec4(min(c * 0.25, vec3(40.0)), 1.0);
  }`);

const blurMat = fx({ tSrc: { value: null }, uDir: { value: new THREE.Vector2() } }, /* glsl */`
  uniform sampler2D tSrc;
  uniform vec2 uDir;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tSrc, vUv).rgb * 0.227;
    c += (texture2D(tSrc, vUv + uDir * 1.385).rgb + texture2D(tSrc, vUv - uDir * 1.385).rgb) * 0.316;
    c += (texture2D(tSrc, vUv + uDir * 3.231).rgb + texture2D(tSrc, vUv - uDir * 3.231).rgb) * 0.070;
    gl_FragColor = vec4(c, 1.0);
  }`);

const raysMat = fx({
  tDepth: { value: null }, tColor: { value: null }, uSun: { value: new THREE.Vector2() }, uSunVis: { value: 0 },
}, /* glsl */`
  uniform sampler2D tDepth, tColor;
  uniform vec2 uSun;
  uniform float uSunVis;
  varying vec2 vUv;
  void main() {
    vec2 march = (vUv - uSun) / 40.0 * 0.95;
    vec2 uv = vUv;
    float decay = 1.0;
    vec3 sum = vec3(0.0);
    for (int i = 0; i < 40; i++) {
      uv -= march;
      sum += step(0.99999, texture2D(tDepth, uv).x) * max(texture2D(tColor, uv).rgb - 0.8, 0.0) * decay;
      decay *= 0.965;
    }
    gl_FragColor = vec4(sum / 40.0 * uSunVis, 1.0);
  }`);

const compositeMat = fx({
  tScene: { value: null }, tDepth: { value: null }, tHalf: { value: null }, tQuarter: { value: null }, tRays: { value: null },
  uBlur: { value: 0 }, uFlash: { value: 0 }, uWater: { value: 0 }, uNear: { value: camera.near }, uFar: { value: camera.far }, uTime: shared.uTime,
  uSun: raysMat.uniforms.uSun, uSunVis: raysMat.uniforms.uSunVis, uRes: { value: new THREE.Vector2() },
}, /* glsl */`
  uniform sampler2D tScene, tDepth, tHalf, tQuarter, tRays;
  uniform float uBlur, uFlash, uWater, uNear, uFar, uTime, uSunVis;
  uniform vec2 uSun, uRes;
  varying vec2 vUv;

  vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
  float rnd(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

  void main() {
    float aspect = uRes.x / uRes.y;
    float z = uNear * uFar / (uFar - texture2D(tDepth, vUv).x * (uFar - uNear));
    float coc = (0.3 + 0.7 * smoothstep(3.0, 60.0, z)) * uBlur;

    vec2 ca = (vUv - 0.5) * 0.006 * (0.3 + uBlur);
    vec3 quarter = vec3(texture2D(tQuarter, vUv + ca).r, texture2D(tQuarter, vUv).g, texture2D(tQuarter, vUv - ca).b);
    vec3 col = mix(texture2D(tScene, vUv).rgb, texture2D(tHalf, vUv).rgb, smoothstep(0.0, 0.45, coc));
    col = mix(col, quarter, smoothstep(0.45, 1.0, coc));

    // bloom + god rays
    col += max(quarter - 1.2, 0.0) * 0.35 + quarter * 0.02;
    col += texture2D(tRays, vUv).rgb * 0.6;

    // lens flare: ghosts across the centre and an anamorphic streak
    if (uSunVis > 0.0) {
      float lit = step(0.99999, texture2D(tDepth, clamp(uSun, 0.001, 0.999)).x) * uSunVis;
      vec2 asp = vec2(aspect, 1.0);
      vec2 axis = vec2(0.5) - uSun;
      vec3 flare = vec3(0.0);
      flare += vec3(1.0, 0.5, 0.2) * smoothstep(0.06, 0.03, length((vUv - (uSun + axis * 0.7)) * asp)) * 0.10;
      flare += vec3(0.4, 0.8, 1.0) * smoothstep(0.10, 0.07, length((vUv - (uSun + axis * 1.3)) * asp)) * 0.07;
      flare += vec3(0.9, 0.4, 0.9) * smoothstep(0.03, 0.01, length((vUv - (uSun + axis * 1.6)) * asp)) * 0.18;
      flare += vec3(1.0, 0.7, 0.3) * smoothstep(0.22, 0.18, length((vUv - (uSun + axis * 2.0)) * asp)) * 0.035;
      vec2 sd = (vUv - uSun) * asp;
      flare += vec3(1.0, 0.55, 0.25) * exp(-abs(sd.y) * 140.0) * exp(-abs(sd.x) * 2.5) * 0.9;
      col += flare * lit;
    }

    col = mix(col, col * vec3(0.2, 0.5, 0.7) + vec3(0.0, 0.04, 0.07), uWater);
    col += vec3(1.0, 0.75, 0.5) * uFlash;
    col = aces(col * 0.9);
    col = pow(col, vec3(1.0 / 2.2));
    // warm highlights, cooler shadows
    float l = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(col * vec3(0.9, 0.95, 1.08), col * vec3(1.06, 1.0, 0.9), smoothstep(0.2, 0.8, l));
    col = mix(vec3(l), col, 1.18);

    vec2 vc = (vUv - 0.5) * vec2(aspect, 1.0);
    col *= mix(0.45, 1.0, smoothstep(1.1, 0.3, length(vc)));
    col += (rnd(vUv * uRes + fract(uTime) * 100.0) - 0.5) * 0.03;
    gl_FragColor = vec4(col, 1.0);
  }`);

const quadScene = new THREE.Scene();
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
quad.frustumCulled = false;
quadScene.add(quad);
const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

function pass(material, target) {
  quad.material = material;
  renderer.setRenderTarget(target);
  renderer.render(quadScene, quadCam);
}

let scale = 0.7, targets;
const rt = (w, h, extra) => new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), { type: THREE.HalfFloatType, depthBuffer: false, ...extra });

function makeTargets() {
  if (targets) Object.values(targets).forEach(t => t.dispose());
  const w = Math.round(root.clientWidth * scale), hgt = Math.round(root.clientHeight * scale);
  targets = {
    scene: rt(w, hgt, { depthBuffer: true, depthTexture: new THREE.DepthTexture(w, hgt) }),
    halfA: rt(w >> 1, hgt >> 1), halfB: rt(w >> 1, hgt >> 1),
    qA: rt(w >> 2, hgt >> 2), qB: rt(w >> 2, hgt >> 2),
    rays: rt(w >> 2, hgt >> 2),
  };
}

function resize() {
  const w = root.clientWidth, hgt = root.clientHeight;
  renderer.setSize(w, hgt, false);
  camera.aspect = w / hgt;
  camera.updateProjectionMatrix();
  compositeMat.uniforms.uRes.value.set(w, hgt);
  makeTargets();
}

function blur(a, b, spread) {
  const { width, height } = a;
  blurMat.uniforms.tSrc.value = a.texture;
  blurMat.uniforms.uDir.value.set(spread / width, 0);
  pass(blurMat, b);
  blurMat.uniforms.tSrc.value = b.texture;
  blurMat.uniforms.uDir.value.set(0, spread / height);
  pass(blurMat, a);
}

function down(src, dst) {
  downMat.uniforms.tSrc.value = src.texture;
  downMat.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
  pass(downMat, dst);
}

const sunScreen = new THREE.Vector3();

function draw() {
  const t = targets;
  renderer.setRenderTarget(t.scene);
  renderer.render(scene, camera);

  down(t.scene, t.halfA);
  blur(t.halfA, t.halfB, 1.2);
  down(t.halfA, t.qA);
  blur(t.qA, t.qB, 2);
  blur(t.qA, t.qB, 3.2);

  sunScreen.copy(camera.position).addScaledVector(sunDir, 1000).project(camera);
  const offscreen = Math.max(Math.abs(sunScreen.x), Math.abs(sunScreen.y)) - 1;
  raysMat.uniforms.uSun.value.set((sunScreen.x + 1) / 2, (sunScreen.y + 1) / 2);
  raysMat.uniforms.uSunVis.value = sunScreen.z < 1 ? Math.min(1, Math.max(0, 1 - offscreen / 1.2)) : 0;
  raysMat.uniforms.tDepth.value = t.scene.depthTexture;
  raysMat.uniforms.tColor.value = t.qA.texture;
  pass(raysMat, t.rays);

  const u = compositeMat.uniforms;
  u.tScene.value = t.scene.texture;
  u.tDepth.value = t.scene.depthTexture;
  u.tHalf.value = t.halfA.texture;
  u.tQuarter.value = t.qA.texture;
  u.tRays.value = t.rays.texture;
  pass(compositeMat, null);
}

// --- camera, intro zoom, peeking -------------------------------------------------

const look = { x: 0, y: 0, tx: 0, ty: 0 };
let blurAmount = reduceMotion ? 1 : 0, blurTarget = 1;
let fovTarget = 58;
camera.fov = reduceMotion ? fovTarget : 72;

addEventListener('pointermove', e => {
  look.tx = e.clientX / root.clientWidth - 0.5;
  look.ty = e.clientY / root.clientHeight - 0.5;
}, { passive: true });

function aim(t) {
  if (playing) {
    // first person: the player's eyes, with a little walking bob
    const bobY = Math.abs(Math.sin(player.bob)) * 0.08 * player.bobAmp;
    const roll = Math.cos(player.bob) * 0.012 * player.bobAmp;
    camera.rotation.set(player.pitch, player.yaw, roll, 'YXZ');
    camera.position.set(
      player.p.x + (Math.random() - 0.5) * shake,
      player.eyeY + bobY + (Math.random() - 0.5) * shake,
      player.p.z + (Math.random() - 0.5) * shake,
    );
    sky.position.copy(camera.position);
    return;
  }
  // hold still while the sign is away so things can be clicked
  const f = peeking ? 0 : 1;
  look.x += (look.tx * f - look.x) * 0.05;
  look.y += (look.ty * f - look.y) * 0.05;
  tilt += ((peeking ? -0.2 : -0.07) - tilt) * 0.05;
  const yaw = 0.08 - look.x * 0.12 + Math.sin(t * 0.13) * 0.025 * f;
  const pitch = tilt - look.y * 0.07 + Math.sin(t * 0.21) * 0.012 * f;
  camera.rotation.set(pitch, yaw, 0, 'YXZ');
  camera.position.set(
    eye.x + (Math.random() - 0.5) * shake,
    eye.y + Math.sin(t * 0.9) * 0.03 + (Math.random() - 0.5) * shake,
    eye.z + (Math.random() - 0.5) * shake,
  );
  sky.position.copy(camera.position);
}

// --- blowing the world up ---------------------------------------------------------

let peeking = false, playing = false, walking = false, shake = 0, flash = 0, tilt = -0.07;
const desktop = matchMedia('(hover: hover) and (pointer: fine)').matches;
const tip = document.createElement('span');
tip.className = 'mc-tip';
tip.setAttribute('aria-hidden', 'true');
if (desktop) document.body.append(tip);

function setTip() {
  tip.textContent = walking
    ? 'wasd walk · space jump · shift sprint · drag to throw · right click places · middle click picks · f goes boom · esc pauses'
    : playing ? 'paused · click to keep playing · r rebuilds the world · c goes back to the sign'
    : peeking ? 'click to play · c to go back' : 'press c to look around';
}

// options for how big the booms are: a slider for the sensible range, plus a box to
// type any power at all (blasts stop at the edge of the world, so huge is still cheap)
const POWER_NAMES = ['firecracker', 'pop', 'tnt', 'tnt', 'big tnt', 'bigger tnt', 'creeper with a grudge', 'crater maker', 'too much', 'please no'];
const clampPower = v => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(1, n) : 1;
};
const powerName = () => POWER_NAMES[power - 1] || (power < 100 ? 'absolutely not' : 'goodbye island');
let power = 3;
try { power = clampPower(localStorage.getItem('mc-power') || 3); } catch {}
const options = document.createElement('div');
options.className = 'mc-options';
options.innerHTML = '<label class="mc-slider"><input type="range" min="1" step="1" aria-label="explosive power"><span></span></label>'
  + '<input class="mc-field" type="number" min="1" step="1" aria-label="type an explosive power">';
const [powerInput, powerField] = options.querySelectorAll('input');
const powerLabel = options.querySelector('span');

function setPower(v) {
  power = clampPower(v);
  powerInput.max = Math.min(100, Math.max(10, power));
  powerInput.value = power;
  powerField.value = power;
  powerLabel.textContent = `explosive power: ${power} (${powerName()})`;
  try { localStorage.setItem('mc-power', power); } catch {}
}
setPower(power);
powerInput.addEventListener('input', () => setPower(powerInput.value));
powerField.addEventListener('change', () => setPower(powerField.value));
powerField.addEventListener('keydown', e => { if (e.key === 'Enter') { setPower(powerField.value); powerField.blur(); } });
if (desktop) document.body.append(options);

const solidish = id => opaque(id) || id === LEAVES;

function touch(x, z) {
  modified.add(ckey(x >> 4, z >> 4));
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) dirty.add(ckey((x + dx) >> 4, (z + dz) >> 4));
}

function setBlock(x, y, z, id) {
  if (!inside(x, y)) return;
  set(x, y, z, id);
  if (id === AIR && plant(get(x, y + 1, z))) set(x, y + 1, z, AIR);
  touch(x, z);
}

// voxel walk along a ray: first solid cell and the face it was entered through
function castVoxel(o, d, max = 140) {
  let x = Math.floor(o.x), y = Math.floor(o.y), z = Math.floor(o.z);
  const sx = Math.sign(d.x), sy = Math.sign(d.y), sz = Math.sign(d.z);
  const dx = Math.abs(1 / d.x), dy = Math.abs(1 / d.y), dz = Math.abs(1 / d.z);
  let tx = d.x ? (sx > 0 ? x + 1 - o.x : o.x - x) * dx : Infinity;
  let ty = d.y ? (sy > 0 ? y + 1 - o.y : o.y - y) * dy : Infinity;
  let tz = d.z ? (sz > 0 ? z + 1 - o.z : o.z - z) * dz : Infinity;
  let t = 0, n = [0, 0, 0];
  while (t < max) {
    if (solidish(get(x, y, z))) return { x, y, z, n, t };
    if (tx < ty && tx < tz) { x += sx; t = tx; tx += dx; n = [-sx, 0, 0]; }
    else if (ty < tz) { y += sy; t = ty; ty += dy; n = [0, -sy, 0]; }
    else { z += sz; t = tz; tz += dz; n = [0, 0, -sz]; }
  }
  return null;
}

const pointer = { x: 0, y: 0 };
const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
function pointerRay() {
  // the crosshair while walking, otherwise wherever the mouse is
  if (walking) ndc.set(0, 0);
  else ndc.set((pointer.x / root.clientWidth) * 2 - 1, -(pointer.y / root.clientHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  return raycaster.ray;
}

const outline = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.01, 1.01, 1.01)),
  new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.75 }),
);
outline.visible = false;
scene.add(outline);

// loose blocks: one instanced mesh per block type
function blockGeometry(id) {
  const g = new THREE.BoxGeometry(1, 1, 1), uv = g.attributes.uv;
  for (let f = 0; f < 6; f++) {
    const [u0, v0, u1, v1] = tileRect(tileOf(id, f === 2 ? 'top' : f === 3 ? 'bottom' : 'side'));
    for (let k = f * 4; k < f * 4 + 4; k++) uv.setXY(k, u0 + uv.getX(k) * (u1 - u0), v0 + uv.getY(k) * (v1 - v0));
  }
  return g;
}

const MAX_DEBRIS = 500;
const looseMat = worldMaterial({ map: atlas });
const looseLeafMat = worldMaterial({ map: atlas, alphaTest: 0.5, side: THREE.DoubleSide });
const looseMeshes = new Map([GRASS, DIRT, STONE, SAND, LOG, LEAVES].map(id => {
  const m = new THREE.InstancedMesh(blockGeometry(id), id === LEAVES ? looseLeafMat : looseMat, MAX_DEBRIS);
  m.count = 0;
  m.frustumCulled = false;
  scene.add(m);
  return [id, m];
}));
const tntGeometry = blockGeometry(TNT);

let debris = [], primed = [], grabbed = null, holdDist = 6, serial = 0;

function loosen(id, x, y, z, v) {
  if (debris.length >= MAX_DEBRIS) debris.shift();
  const d = {
    id, n: serial++, p: new THREE.Vector3(x, y, z), v: v || new THREE.Vector3(), q: new THREE.Quaternion(),
    spin: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(10),
    rest: 0, ground: false, supported: false, asleep: false,
  };
  debris.push(d);
  return d;
}

function prime(x, y, z, fuse) {
  setBlock(x, y, z, AIR);
  const mesh = new THREE.Mesh(tntGeometry, looseMat);
  const glow = new THREE.Mesh(tntGeometry, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
  glow.scale.setScalar(1.02);
  mesh.add(glow);
  mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
  scene.add(mesh);
  primed.push({ mesh, glow, fuse });
}

const SPARKS = 500;
const sparkPos = new Float32Array(SPARKS * 3), sparkVel = new Float32Array(SPARKS * 3), sparkLife = new Float32Array(SPARKS);
const sparkGeo = new THREE.BufferGeometry();
sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3).setUsage(THREE.DynamicDrawUsage));
sparkGeo.setAttribute('life', new THREE.BufferAttribute(sparkLife, 1).setUsage(THREE.DynamicDrawUsage));
const sparks = new THREE.Points(sparkGeo, new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  vertexShader: /* glsl */`
    attribute float life;
    varying float vLife;
    void main() {
      vLife = life;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = life > 0.0 ? (60.0 + 140.0 * (1.0 - life)) / -mv.z : 0.0;
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */`
    varying float vLife;
    void main() {
      float d = length(gl_PointCoord - 0.5);
      vec3 col = mix(vec3(0.35, 0.3, 0.3), vec3(7.0, 3.2, 1.0), smoothstep(0.35, 0.9, vLife));
      gl_FragColor = vec4(col * vLife * smoothstep(0.5, 0.1, d), 1.0);
    }`,
}));
sparks.frustumCulled = false;
scene.add(sparks);
let sparkNext = 0;

// blasts top out at a 48 block radius; past that the world is endless, so it'd never finish
const MAX_RADIUS = 48;
function explode(c, radius = 1.5 + power * 0.7) {
  radius = Math.min(radius, MAX_RADIUS);
  const cx = Math.floor(c.x), cy = Math.floor(c.y), cz = Math.floor(c.z), r = Math.ceil(radius);
  const x0 = cx - r, x1 = cx + r, z0 = cz - r, z1 = cz + r;
  const y0 = Math.max(0, cy - r), y1 = Math.min(SY - 1, cy + r);
  // bigger blasts throw harder, but only loosen enough blocks to keep the pile manageable
  const volume = Math.min(2.1 * radius ** 3, (x1 - x0 + 1) * (y1 - y0 + 1) * (z1 - z0 + 1) * 0.5);
  const punch = Math.sqrt(power / 3), keep = Math.min(0.55, 160 / Math.max(1, volume));
  for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
    const dist = Math.hypot(x - cx, y - cy, z - cz);
    if (dist > radius + Math.random() * 0.8 - 0.4) continue;
    const id = get(x, y, z);
    if (id === AIR) continue;
    if (id === TNT) { prime(x, y, z, 0.2 + Math.random() * 0.4); continue; }
    set(x, y, z, AIR);
    if (plant(get(x, y + 1, z))) set(x, y + 1, z, AIR);
    if (plant(id) || Math.random() > keep) continue;
    const dir = new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5).sub(c).normalize();
    const v = dir.multiplyScalar((8 + 14 * (1 - dist / radius)) * punch)
      .add(new THREE.Vector3(Math.random() - 0.5, 6 + Math.random() * 4, Math.random() - 0.5))
      .clampLength(0, 70);
    loosen(id, x + 0.5, y + 0.5, z + 0.5, v);
  }
  // mark every chunk the blast box covers in one go rather than block by block
  for (let k = (z0 - 1) >> 4; k <= (z1 + 1) >> 4; k++) {
    for (let j = (x0 - 1) >> 4; j <= (x1 + 1) >> 4; j++) {
      dirty.add(ckey(j, k));
      modified.add(ckey(j, k));
    }
  }
  for (const d of debris) {
    const away = d.p.clone().sub(c), dist = away.length();
    if (dist > radius * 2.5) continue;
    d.v.addScaledVector(away.normalize(), 18 * punch * (1 - dist / (radius * 2.5))).clampLength(0, 70).y += 4;
    d.ground = d.asleep = false;
  }
  for (let i = 0; i < Math.min(SPARKS, 50 + power * 15); i++) {
    const k = sparkNext++ % SPARKS;
    const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5)
      .normalize().multiplyScalar((3 + Math.random() * 13) * punch);
    sparkPos.set([c.x, c.y, c.z], k * 3);
    sparkVel.set([dir.x, dir.y, dir.z], k * 3);
    sparkLife[k] = 0.6 + Math.random() * 0.4;
  }
  const near = c.distanceTo(eye);
  flash = Math.max(flash, 1.1 * Math.min(punch, 2) * Math.min(1, 20 / near));
  shake = Math.max(shake, 0.5 * Math.min(punch, 2.5) * Math.min(1, 15 / near));
}

const G = 28, HALF = 0.45;
const hits = p => {
  for (let x = Math.floor(p.x - HALF); x <= Math.floor(p.x + HALF); x++)
    for (let y = Math.floor(p.y - HALF); y <= Math.floor(p.y + HALF); y++)
      for (let z = Math.floor(p.z - HALF); z <= Math.floor(p.z + HALF); z++) if (solidish(get(x, y, z))) return true;
  return false;
};
const spinQ = new THREE.Quaternion(), spinE = new THREE.Euler(), hold = new THREE.Vector3();
const dummy = new THREE.Matrix4(), ONE = new THREE.Vector3(1, 1, 1);
const UP = new THREE.Vector3(0, 1, 0), AXES = [new THREE.Vector3(1, 0, 0), UP, new THREE.Vector3(0, 0, 1)];
const faceDown = new THREE.Vector3(), restQ = new THREE.Quaternion(), below = new THREE.Vector3();

// the pose a tumbling block falls into: whichever face is nearest flat, same heading
function restingPose(q) {
  let best = 0;
  for (const a of AXES) {
    const y = faceDown.copy(a).applyQuaternion(q).y;
    if (Math.abs(y) > Math.abs(best)) best = y;
  }
  for (const a of AXES) {
    faceDown.copy(a).applyQuaternion(q);
    if (faceDown.y === best) break;
  }
  return restQ.setFromUnitVectors(faceDown.multiplyScalar(Math.sign(best)), UP).multiply(q);
}

// loose blocks shove each other apart along the shallowest overlap, so they pile up
const cells = new Map();
function separate() {
  cells.clear();
  for (const d of debris) {
    d.supported = false;
    const k = `${Math.floor(d.p.x)},${Math.floor(d.p.y)},${Math.floor(d.p.z)}`;
    if (!cells.has(k)) cells.set(k, []);
    cells.get(k).push(d);
  }
  const SIZE = HALF * 2;
  for (const a of debris) {
    const cx = Math.floor(a.p.x), cy = Math.floor(a.p.y), cz = Math.floor(a.p.z);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      for (const b of cells.get(`${cx + dx},${cy + dy},${cz + dz}`) || []) {
        if (b.n <= a.n) continue;
        const ox = SIZE - Math.abs(b.p.x - a.p.x), oy = SIZE - Math.abs(b.p.y - a.p.y), oz = SIZE - Math.abs(b.p.z - a.p.z);
        if (ox <= 0 || oy <= 0 || oz <= 0) continue;
        const axis = oy <= ox && oy <= oz ? 'y' : ox <= oz ? 'x' : 'z';
        const depth = axis === 'y' ? oy : axis === 'x' ? ox : oz;
        const sign = Math.sign(b.p[axis] - a.p[axis]) || 1;
        // sleeping and held blocks don't get pushed around by the others
        const fixedA = a.asleep || a === grabbed, fixedB = b.asleep || b === grabbed;
        if (fixedA && fixedB) continue;
        const shareA = fixedA ? 0 : fixedB ? 1 : 0.5;
        a.p[axis] -= sign * depth * shareA;
        b.p[axis] += sign * depth * (1 - shareA);
        if (hits(a.p)) a.p[axis] += sign * depth * shareA;
        if (hits(b.p)) b.p[axis] -= sign * depth * (1 - shareA);
        if (axis === 'y') {
          const [lower, upper] = sign > 0 ? [a, b] : [b, a];
          upper.supported = true;
          if (upper.v.y < lower.v.y) upper.v.y = lower.v.y;
        } else {
          const mid = fixedA ? a.v[axis] : fixedB ? b.v[axis] : (a.v[axis] + b.v[axis]) / 2;
          if (Math.abs(a.v[axis] - b.v[axis]) > 6) a.asleep = b.asleep = false;
          a.v[axis] = b.v[axis] = mid;
        }
      }
    }
  }
}

function simulate(dt) {
  if (grabbed) pointerRay().at(holdDist, hold);
  separate();
  for (let i = debris.length - 1; i >= 0; i--) {
    const d = debris[i];
    if (d.asleep) {
      // wake up if whatever it was lying on got blown away
      if (d.supported || hits(below.copy(d.p).setY(d.p.y - 0.08))) continue;
      d.asleep = false;
    }
    if (d === grabbed) {
      d.v.copy(hold).sub(d.p).multiplyScalar(12).clampLength(0, 45);
    } else {
      d.v.y -= G * dt;
      if (d.p.y < SEA + 0.9) d.v.multiplyScalar(Math.exp(-3 * dt));
    }
    d.ground = d.supported;
    const steps = Math.max(1, Math.ceil((d.v.length() * dt) / 0.4));
    for (let s = 0; s < steps; s++) for (const axis of ['y', 'x', 'z']) {
      const move = (d.v[axis] * dt) / steps;
      d.p[axis] += move;
      if (!hits(d.p)) continue;
      d.p[axis] -= move;
      if (axis === 'y' && d.v.y < 0) d.ground = true;
      d.v[axis] = Math.abs(d.v[axis]) > 4 ? -d.v[axis] * 0.25 : 0;
    }
    if (d.ground && d !== grabbed) {
      const f = Math.exp(-8 * dt);
      d.v.x *= f;
      d.v.z *= f;
      d.spin.multiplyScalar(Math.exp(-5 * dt));
      d.q.slerp(restingPose(d.q), Math.min(1, dt * 6));
    } else {
      d.q.multiply(spinQ.setFromEuler(spinE.set(d.spin.x * dt, d.spin.y * dt, d.spin.z * dt)));
    }
    if (d.p.y < -10) { debris.splice(i, 1); continue; }
    if (d !== grabbed && d.ground && d.v.lengthSq() < 0.3) d.rest += dt;
    else d.rest = 0;
    if (d.rest > 0.6) {
      d.asleep = true;
      d.v.set(0, 0, 0);
      d.q.copy(restingPose(d.q));
    }
  }

  const counts = new Map();
  for (const d of debris) {
    const m = looseMeshes.get(d.id), n = counts.get(m) || 0;
    m.setMatrixAt(n, dummy.compose(d.p, d.q, ONE));
    counts.set(m, n + 1);
  }
  for (const m of looseMeshes.values()) {
    m.count = counts.get(m) || 0;
    m.instanceMatrix.needsUpdate = true;
  }

  for (let i = primed.length - 1; i >= 0; i--) {
    const tnt = primed[i];
    tnt.fuse -= dt;
    tnt.glow.material.opacity = Math.floor(tnt.fuse * 6) % 2 ? 0.75 : 0;
    tnt.mesh.scale.setScalar(1 + Math.max(0, 0.3 - tnt.fuse) * 0.6);
    if (tnt.fuse > 0) continue;
    scene.remove(tnt.mesh);
    tnt.glow.material.dispose();
    primed.splice(i, 1);
    explode(tnt.mesh.position);
  }

  const drag = Math.exp(-1.8 * dt);
  for (let k = 0; k < SPARKS; k++) {
    if (sparkLife[k] <= 0) continue;
    sparkVel[k * 3] *= drag;
    sparkVel[k * 3 + 1] = sparkVel[k * 3 + 1] * drag + 2 * dt;
    sparkVel[k * 3 + 2] *= drag;
    for (let a = 0; a < 3; a++) sparkPos[k * 3 + a] += sparkVel[k * 3 + a] * dt;
    sparkLife[k] = Math.max(0, sparkLife[k] - dt * 1.1);
  }
  sparkGeo.attributes.position.needsUpdate = sparkGeo.attributes.life.needsUpdate = true;
}

// rebuild changed chunks for a few ms each frame; shadows catch up a few times a second
let shadowsStale = false, shadowClock = 0;
function rebuild(dt) {
  const start = performance.now();
  outer: for (const queue of [dirty, loading]) {
    for (const k of queue) {
      queue.delete(k);
      // edits to columns that aren't on screen just wait until they're streamed in
      if (queue === dirty && !meshes.has(k)) continue;
      remesh(k);
      shadowsStale = true;
      if (performance.now() - start > 6) break outer;
    }
  }
  shadowClock += dt;
  if (shadowsStale && shadowClock > 0.25) {
    renderer.shadowMap.needsUpdate = true;
    shadowsStale = false;
    shadowClock = 0;
  }
}

// --- walking around ------------------------------------------------------------------

const keys = new Set();
const PW = 0.3, PH = 1.8, EYE = 1.62;
const player = { p: new THREE.Vector3(), v: new THREE.Vector3(), yaw: 0, pitch: 0, ground: false, eyeY: 0, bob: 0, bobAmp: 0, splash: 0 };
const fwd = new THREE.Vector3(), side = new THREE.Vector3(), wish = new THREE.Vector3();

function blocked(p) {
  for (let x = Math.floor(p.x - PW); x <= Math.floor(p.x + PW); x++)
    for (let y = Math.floor(p.y); y <= Math.floor(p.y + PH - 0.01); y++)
      for (let z = Math.floor(p.z - PW); z <= Math.floor(p.z + PW); z++) if (solidish(get(x, y, z))) return true;
  return false;
}

function spawnPlayer() {
  player.p.set(eye.x, eye.y - EYE, eye.z);
  player.v.set(0, 0, 0);
  player.yaw = camera.rotation.y;
  player.pitch = camera.rotation.x;
  player.eyeY = eye.y;
}

function walk(dt) {
  const p = player.p, v = player.v;
  const wet = p.y + 0.6 < SEA + 0.88;
  // stays set for a moment after your feet leave the water, so banks can be climbed
  player.splash = p.y < SEA + 0.88 ? 0.6 : Math.max(0, player.splash - dt);
  const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const ix = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  const iz = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
  fwd.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  side.set(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
  wish.copy(fwd).multiplyScalar(iz).addScaledVector(side, ix);
  if (wish.lengthSq() > 0) wish.normalize().multiplyScalar((sprint && iz > 0 ? 8 : 5) * (wet ? 0.6 : 1));
  const grip = Math.min(1, dt * (player.ground ? 14 : wet ? 4 : 2.5));
  v.x += (wish.x - v.x) * grip;
  v.z += (wish.z - v.z) * grip;
  if (wet) {
    v.y -= 9 * dt;
    v.y *= Math.exp(-2.5 * dt);
    if (keys.has('Space')) v.y = Math.max(v.y, 3.5);
  } else {
    v.y -= 32 * dt;
    if (keys.has('Space') && player.ground) v.y = 9.2;
    // bobbing at the surface: space hops you up far enough to reach the bank
    else if (keys.has('Space') && player.splash > 0) v.y = Math.max(v.y, 7.5);
  }
  v.y = Math.max(v.y, -60);

  const wasGround = player.ground;
  player.ground = false;
  const steps = Math.max(1, Math.ceil((v.length() * dt) / 0.3));
  for (let s = 0; s < steps; s++) for (const axis of ['y', 'x', 'z']) {
    const move = (v[axis] * dt) / steps;
    if (!move) continue;
    p[axis] += move;
    if (!blocked(p)) continue;
    // walk up single blocks instead of having to jump them (also out of the water)
    if (axis !== 'y' && (wasGround || player.ground || wet)) {
      p.y += 1.01;
      if (!blocked(p)) continue;
      p.y -= 1.01;
    }
    p[axis] -= move;
    // swimming into a taller bank climbs it
    if (axis !== 'y' && player.splash > 0) v.y = Math.max(v.y, 6.5);
    if (axis === 'y') {
      if (v.y < 0) player.ground = true;
      v.y = 0;
    } else {
      v[axis] = 0;
    }
  }
  if (p.y < -30) spawnPlayer();

  // the eye eases up steps but drops instantly when falling
  const target = p.y + EYE;
  player.eyeY = target < player.eyeY ? target : player.eyeY + (target - player.eyeY) * Math.min(1, dt * 16);
  const speed = Math.hypot(v.x, v.z);
  player.bobAmp += ((player.ground && speed > 0.5 ? Math.min(1, speed / 6) : 0) - player.bobAmp) * Math.min(1, dt * 8);
  player.bob += speed * dt * 1.7;
  fovTarget = sprint && speed > 6 ? 84 : 74;
}

addEventListener('mousemove', e => {
  if (!walking) return;
  player.yaw -= e.movementX * 0.0022;
  player.pitch = Math.max(-1.55, Math.min(1.55, player.pitch - e.movementY * 0.0022));
});

// the hotbar, and whatever's selected held in your hand
const HOTBAR = [GRASS, DIRT, STONE, SAND, LOG, LEAVES, TNT];
const HOTBAR_NAMES = ['grass', 'dirt', 'stone', 'sand', 'acacia log', 'leaves', 'tnt'];
let sel = HOTBAR.length - 1;

const heldGeos = new Map();
const heldGeometry = id => {
  if (!heldGeos.has(id)) heldGeos.set(id, blockGeometry(id));
  return heldGeos.get(id);
};
const held = new THREE.Mesh(heldGeometry(TNT), worldMaterial({ map: atlas, alphaTest: 0.5, depthTest: false, depthWrite: false }));
held.renderOrder = 10;
held.frustumCulled = false;
held.visible = false;
camera.add(held);
scene.add(camera);
let swing = 0;

function updateHeld(dt) {
  held.visible = walking;
  swing = Math.max(0, swing - dt * 4);
  const s = Math.sin(swing * Math.PI), bob = Math.abs(Math.sin(player.bob)) * 0.04 * player.bobAmp;
  held.position.set(0.72 - s * 0.15, -0.62 + bob + s * 0.12, -1.15 - s * 0.1);
  held.rotation.set(0.15 - s * 0.9, 0.75, 0);
  held.scale.setScalar(0.3);
}

const hotbar = document.createElement('div');
hotbar.className = 'mc-hotbar';
HOTBAR.forEach((id, i) => {
  const icon = document.createElement('canvas');
  icon.width = icon.height = 16;
  const tile = tileOf(id, 'side');
  icon.getContext('2d').drawImage(atlasCanvas, (tile % 4) * 16, Math.floor(tile / 4) * 16, 16, 16, 0, 0, 16, 16);
  const slot = document.createElement('button');
  slot.type = 'button';
  slot.className = 'mc-slot';
  slot.setAttribute('aria-label', HOTBAR_NAMES[i]);
  slot.append(icon);
  slot.addEventListener('click', () => select(i));
  hotbar.append(slot);
});
const cross = document.createElement('div');
cross.className = 'mc-cross';
if (desktop) document.body.append(hotbar, cross);

function select(i) {
  sel = (i + HOTBAR.length) % HOTBAR.length;
  [...hotbar.children].forEach((slot, k) => slot.classList.toggle('on', k === sel));
  held.geometry = heldGeometry(HOTBAR[sel]);
}
select(sel);

addEventListener('wheel', e => {
  if (!walking) return;
  e.preventDefault();
  select(sel + Math.sign(e.deltaY));
}, { passive: false });

function hover() {
  let hit = null;
  if (peeking && !grabbed && (walking || !playing)) {
    const ray = pointerRay();
    hit = castVoxel(ray.origin, ray.direction, walking ? 60 : 140);
  }
  const tnt = !!hit && get(hit.x, hit.y, hit.z) === TNT;
  outline.visible = !!hit && (walking || tnt);
  if (hit) outline.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
  root.classList.toggle('mc-hover', tnt && !playing);
}

function lock() {
  try { canvas.requestPointerLock()?.catch?.(() => {}); } catch {}
}

document.addEventListener('pointerlockchange', () => {
  walking = document.pointerLockElement === canvas;
  root.classList.toggle('mc-walk', walking);
  if (!walking) {
    keys.clear();
    grabbed = null;
    root.classList.remove('mc-grab');
  }
  setTip();
});

function startPlay() {
  playing = true;
  spawnPlayer();
  root.classList.add('mc-play');
  setTip();
}

// put every block back where it started
function resetWorld() {
  grabbed = null;
  for (const tnt of primed) { scene.remove(tnt.mesh); tnt.glow.material.dispose(); }
  primed = [];
  debris = [];
  sparkLife.fill(0);
  // forget every changed column so it regenerates fresh, then redraw it and its neighbours
  const redo = new Set();
  for (const k of modified) {
    forget(k);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) redo.add(ckey(keyX(k) + dx, keyZ(k) + dz));
  }
  modified.clear();
  dirty.clear();
  for (const k of redo) if (meshes.has(k)) remesh(k);
  renderer.shadowMap.needsUpdate = true;
  simulate(0);
  if (playing) spawnPlayer();
}

function stopPlay() {
  if (document.pointerLockElement) document.exitPointerLock();
  playing = walking = false;
  resetWorld();
  root.classList.remove('mc-play', 'mc-walk', 'mc-grab');
  compositeMat.uniforms.uWater.value = 0;
  setTip();
}

function peek(on) {
  peeking = on;
  root.classList.toggle('mc-peek', on);
  blurTarget = on ? 0 : 1;
  fovTarget = on ? 70 : 58;
  if (!on && playing) stopPlay();
  if (!on) { outline.visible = false; root.classList.remove('mc-hover'); }
  setTip();
  loop();
}

addEventListener('pointermove', e => {
  pointer.x = e.clientX;
  pointer.y = e.clientY;
}, { passive: true });

function placeBlock(hit) {
  if (!hit || hit.t > 10) return;
  const x = hit.x + hit.n[0], y = hit.y + hit.n[1], z = hit.z + hit.n[2];
  if (!inside(x, y) || (get(x, y, z) !== AIR && !plant(get(x, y, z)))) return;
  const p = player.p;
  if (x + 1 > p.x - PW && x < p.x + PW && z + 1 > p.z - PW && z < p.z + PW && y + 1 > p.y && y < p.y + PH) return;
  setBlock(x, y, z, HOTBAR[sel]);
}

addEventListener('pointerdown', e => {
  if (!peeking || e.target.closest?.('.mc-options, .mc-hotbar')) return;
  if (!walking) {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    if (!playing) {
      // clicking the tnt from the peek view lights it on the way in
      const ray = pointerRay(), hit = castVoxel(ray.origin, ray.direction);
      if (e.button === 0 && hit && get(hit.x, hit.y, hit.z) === TNT) prime(hit.x, hit.y, hit.z, 1.6);
      startPlay();
    }
    lock();
    return;
  }

  const ray = pointerRay();
  const hit = castVoxel(ray.origin, ray.direction, 60);
  const id = hit ? get(hit.x, hit.y, hit.z) : AIR;
  swing = 1;
  if (e.button === 1) {
    e.preventDefault();
    if (HOTBAR.includes(id)) select(HOTBAR.indexOf(id));
    return;
  }
  if (e.button === 2) return placeBlock(hit);
  if (e.button !== 0) return;

  // grab the nearest loose block on the ray, otherwise pull one out of the world
  const box = new THREE.Box3(), at = new THREE.Vector3();
  let best = null, bestT = hit ? hit.t : Infinity;
  for (const d of debris) {
    if (!ray.intersectBox(box.setFromCenterAndSize(d.p, ONE), at)) continue;
    const t = at.distanceTo(ray.origin);
    if (t < bestT) { best = d; bestT = t; }
  }
  if (!best && hit) {
    if (id === TNT) { prime(hit.x, hit.y, hit.z, 1.6); return; }
    setBlock(hit.x, hit.y, hit.z, AIR);
    best = loosen(id, hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
  }
  if (!best) return;
  best.asleep = false;
  grabbed = best;
  holdDist = Math.min(12, Math.max(3, bestT));
  root.classList.add('mc-grab');
});

addEventListener('pointerup', () => {
  // let go of a held block and it flies the way you're looking
  if (grabbed && walking) grabbed.v.addScaledVector(pointerRay().direction, 14).clampLength(0, 60);
  grabbed = null;
  root.classList.remove('mc-grab');
});

addEventListener('contextmenu', e => { if (peeking) e.preventDefault(); });

const GAME_KEYS = ['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight'];
addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.('input, textarea, [contenteditable]')) return;
  const key = e.key.toLowerCase();
  if (key === 'c' && !e.repeat) return peek(!peeking);
  if (!playing) return;
  if (GAME_KEYS.includes(e.code)) {
    e.preventDefault();
    if (walking) keys.add(e.code);
  }
  if (e.repeat) return;
  if (key === 'r') return resetWorld();
  const digit = /^Digit([1-9])$/.exec(e.code);
  if (digit && Number(digit[1]) <= HOTBAR.length) return select(Number(digit[1]) - 1);
  if (key === 'f' && walking) {
    const ray = pointerRay(), hit = castVoxel(ray.origin, ray.direction);
    if (!hit) return;
    swing = 1;
    explode(new THREE.Vector3(hit.x + 0.5 + hit.n[0] * 0.5, hit.y + 0.5 + hit.n[1] * 0.5, hit.z + 0.5 + hit.n[2] * 0.5));
  }
});
addEventListener('keyup', e => keys.delete(e.code));

setTip();

// --- loop ----------------------------------------------------------------------

// the sun's shadow box jumps along with the camera, a column's width at a time
function follow() {
  const c = camera.position;
  water.position.set(c.x, SEA + 0.88, c.z);
  motes.position.copy(c).sub(eye);
  stream(c.x, c.z);
  const st = sun.target.position;
  if (Math.hypot(c.x - st.x, c.z - st.z) < 40) return;
  st.set(Math.round(c.x / CH) * CH, SEA, Math.round(c.z / CH) * CH);
  sun.position.copy(st).addScaledVector(sunDir, 280);
  renderer.shadowMap.needsUpdate = true;
}

let last = performance.now(), slow = 0, running = false;

function loop() {
  if (running) return;
  running = true;
  last = performance.now();
  requestAnimationFrame(frame);
}

function frame(now) {
  // with reduced motion the world only moves while someone is looking at it
  if (!reduceMotion || peeking) requestAnimationFrame(frame);
  else running = false;
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  const t = now / 1000;

  // drop resolution if the gpu is struggling
  slow = dt > 0.028 ? slow + 1 : Math.max(0, slow - 1);
  if (slow > 90 && scale > 0.4) { scale -= 0.1; slow = 0; makeTargets(); }

  const k = reduceMotion ? 1 : Math.min(dt * 2.2, 1);
  blurAmount += (blurTarget - blurAmount) * k;
  camera.fov += (fovTarget - camera.fov) * k;
  camera.updateProjectionMatrix();
  compositeMat.uniforms.uBlur.value = blurAmount;
  shake *= Math.exp(-5 * dt);
  flash *= Math.exp(-6 * dt);
  compositeMat.uniforms.uFlash.value = flash;
  shared.uTime.value = t;
  placeClouds(t);
  if (walking) walk(dt);
  if (playing) {
    const under = camera.position.y < SEA + 0.88;
    blurTarget = under ? 0.55 : 0;
    compositeMat.uniforms.uWater.value = under ? 1 : 0;
  }
  aim(t);
  updateHeld(dt);
  follow();
  if (playing || debris.length || primed.length) simulate(dt);
  rebuild(dt);
  hover();
  draw();
}

resize();
placeClouds(0);
renderer.shadowMap.needsUpdate = true;
let resizeTimer;
addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { resize(); if (reduceMotion) draw(); }, 150);
});

if (reduceMotion) {
  compositeMat.uniforms.uBlur.value = 1;
  shared.uTime.value = 10;
  camera.updateProjectionMatrix();
  aim(0);
  draw();
} else {
  loop();
}
root.classList.add('mc-world');
