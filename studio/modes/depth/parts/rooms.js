// The set builders: small lit rooms you can drop a story into. Each builder takes a parent group (a shot's root) and
// options, builds the set in metres (floor at y 0, the back wall at z ≈ -3.2, the lens looks toward -z), and returns:
//   .views   named camera moves  { from, to, look0, look1, fov, ap }  (set-local; pick one in your shot's view())
//   .light(rig, at)              places the shared light rig for this set (at(x,y,z) → a world point)
//   .focus   a point the depth of field holds sharp (override per view with view.focus)
//   .frame(t)                    ambient life (clock hands, flicker, steam); call it from your shot's frame()
//   … plus handles for the things a shot animates (signs, cards, screens, belts, pins).
// Shots reach them as k.rooms.shop(shot.root, {...}) etc. Names on signs come from options: no real brands by default.
import * as THREE from 'three';
import { tex, wallpaper, paint, lit, mat, box, tube, ball, sheet, put, group, contact, label, neon, card, screen, icons, canvasTex, speckle, fonts } from './kit3d.js';
import { clamp, lerp, settle, jolt, grow, noise01, TAU, rng, ease } from '../runtime/maths.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const aim = (l, p, target, intensity, color, angle) => { l.position.copy(p); if (l.target) l.target.position.copy(target); l.intensity = intensity; if (color != null) l.color.set(color); if (angle != null) l.angle = angle; };

// wall colour families (base, darker, lighter, wainscot tint). The kit's own defaults are the warm plasters (clay, sage,
// butter, oat, denim, moss): mid tones that stay readable under the practical lamps. The deep ones below them stay for night moods.
export const WALLS = {
  clay: ['#a9543f', '#96493a', '#bb6651', 0xe6b29a], sage: ['#6c8c76', '#5d7c67', '#7e9f88', 0xc6dac6], butter: ['#c49b45', '#b0893b', '#d4ad5c', 0xf0dca4],
  oat: ['#b3a07f', '#a08e70', '#c4b292', 0xe9ddc6], denim: ['#466487', '#3b5676', '#57769b', 0xaabfd8], moss: ['#5b6a3c', '#4e5c33', '#6b7b49', 0xc2cc9e],
  indigo: ['#2c2b62', '#242256', '#37367c', 0x6f6ab0], teal: ['#1e4a4a', '#173c3c', '#285e5e', 0x7fb0a8], slate: ['#2a2f3a', '#20242d', '#363c4a', 0x8a93a6],
  plum: ['#3a2f55', '#2f2547', '#4a3d6b', 0xa894c8], night: ['#2b3555', '#222b47', '#3a4670', 0x8f9ac0], wine: ['#4a2b2b', '#3d2323', '#5c3636', 0xc09090],
  ocean: ['#1f3a4a', '#183040', '#2a4d60', 0x7fa0b0], midnight: ['#1b2333', '#141b29', '#26314a', 0x7a8ab0], olive: ['#3b3a24', '#302f1c', '#4c4a2f', 0xb0aa7f],
};
let seedN = 30;
const wallTex = (name, repeat) => { const w = WALLS[name] || WALLS.clay; return wallpaper(w[0], w[1], w[2], seedN++, repeat); };

// ── the shell every interior shares: plank floor, back wall + two side walls, wainscot, chair rail, skirting ──
export function room(parent, { wall = 'clay', width = 16, depth = 16, back = -3.2, side = 3.4, rail = true, lamps = true } = {}) {
  const w = WALLS[wall] || WALLS.clay, wt = wallTex(wall);
  const wallMat = new THREE.MeshStandardMaterial({ map: wt, roughness: 0.92 });
  const floor = sheet(width, depth, new THREE.MeshStandardMaterial({ map: tex.planks, roughness: 0.6, roughnessMap: tex.roughness })); floor.rotation.x = -Math.PI / 2; parent.add(floor);
  put(sheet(width, 9, wallMat), 0, 4.5, back, parent);
  for (const s of [-1, 1]) { const sw = put(sheet(width, 9, wallMat), s * side, 4.5, back + width / 2, parent); sw.rotation.y = (-s * Math.PI) / 2; }
  if (rail) {
    put(sheet(width, 1.02, new THREE.MeshStandardMaterial({ map: wt, color: w[3], roughness: 0.9 })), 0, 0.51, back + 0.005, parent);
    put(box(width, 0.06, 0.06, mat.woodLight, 0.01), 0, 1.03, back + 0.03, parent);
    put(box(width, 0.13, 0.04, mat.woodDark, 0.01), 0, 0.065, back + 0.02, parent);
  }
  if (lamps) [-2.35, 2.35].forEach((x) => sconce(parent, x, 2.1, back));   // two warm practicals: light pools on the wall and floor
  return { wallMat, back };
}

// a brass wall sconce with a warm shade: a point light, a soft glow pool on the wall
export function sconce(parent, x, y, back, { power = 2.4, color = 0xffb46e } = {}) {
  const g = group(parent, x, y, back + 0.02);
  put(box(0.12, 0.2, 0.025, mat.brass, 0.01), 0, 0, 0, g); put(box(0.025, 0.025, 0.2, mat.brass, 0.005), 0, 0.02, 0.1, g);
  const shade = put(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.12, 0.15, 24, 1, true), paint(0xf3e3c4, { side: THREE.DoubleSide, rough: 0.9, emissive: 0x6a4420 })), 0, 0.09, 0.2, g); shade.castShadow = false;
  put(new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 10), lit(3.2, 2.2, 1.2)), 0, 0.06, 0.2, g);
  const pool = put(sheet(1.5, 1.9, lit(0.5, 0.3, 0.14, { map: tex.blob, transparent: true, add: true })), 0, 0.05, 0.004, g); pool.renderOrder = 2;
  put(new THREE.PointLight(color, power, 4.6, 2), 0, 0.05, 0.42, g);
  return g;
}

// small furniture
export function plant(parent, x, y, z, s = 1) {
  const p = group(parent, x, y, z); p.scale.setScalar(s);
  put(tube(0.11, 0.085, 0.18, mat.terracotta), 0, 0.09, 0, p);
  for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU, lf = put(ball(0.09, mat.leaf, 12), Math.cos(a) * 0.08, 0.27 + (i % 3) * 0.05, Math.sin(a) * 0.08, p); lf.scale.set(0.7, 1.6, 0.35); lf.rotation.set(Math.sin(a) * 0.6, a, Math.cos(a) * 0.6); }
  return p;
}
export function mug(parent, x, y, z, band = 0xd9653b) {
  const m = group(parent, x, y, z);
  put(tube(0.075, 0.068, 0.17, mat.mugWhite), 0, 0.085, 0, m);
  put(new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.014, 10, 20), mat.mugWhite), 0.08, 0.09, 0, m);
  put(tube(0.0765, 0.0765, 0.03, paint(band)), 0, 0.11, 0, m);
  const puffs = [0, 1, 2].map(() => put(new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 })), 0, 0.2, 0, m));
  m.steam = (t) => puffs.forEach((s, i) => { const v = (t * 0.8 + i / 3) % 1; s.position.set(0.03 * Math.sin(t * 3 + i), 0.2 + v * 0.35, 0); s.scale.setScalar(0.6 + v * 1.4); s.material.opacity = 0.35 * (1 - v); });
  return m;
}
export function table(parent, x, z, w = 1.36, d = 0.62, h = 0.74) {
  const g = group(parent, x, 0, z);
  put(box(w, 0.06, d, mat.woodLight, 0.02), 0, h, 0, g);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => put(box(0.06, h - 0.03, 0.06, mat.woodDark, 0.01), sx * (w / 2 - 0.06), (h - 0.03) / 2, sz * (d / 2 - 0.06), g));
  g.top = h + 0.03; return g;
}
export function laptop(parent, x, y, z, yaw = 0, o = {}) {
  const { w = 0.6, d = 0.4, tilt = -0.32, sw = 640, sh = 420 } = o;
  const l = group(parent, x, y, z); l.rotation.y = yaw;
  put(box(w, 0.03, d, mat.charcoal, 0.01), 0, 0.015, 0, l);
  const lid = group(l, 0, 0.03, -d / 2 + 0.01); lid.rotation.x = tilt;
  put(box(w, d, 0.02, mat.charcoal, 0.01), 0, d / 2, 0, lid);
  const scr = screen(sw, sh);
  put(sheet(w * 0.94, d * 0.92, lit(1.35, 1.35, 1.35, { map: scr.tex })), 0, d / 2, 0.0115, lid);
  l.screen = scr; return l;
}

// a window with frame + sill. sky: 'night' (stars + moon) | 'day' | a THREE.Material
export function windowFrame(parent, x, y, z, { w = 1.0, h = 1.1, sky = 'night' } = {}) {
  const skyMat = sky === 'night' ? lit(0.75, 0.8, 1.05, { map: tex.nightSky }) : sky === 'day' ? lit(0.55, 0.78, 1.05) : sky;
  put(sheet(w, h, skyMat), x, y, z, parent);
  const fr = paint(0xe9e2d2);
  [[0, h / 2 + 0.03, w + 0.12, 0.07], [0, -h / 2 - 0.03, w + 0.12, 0.07], [-w / 2 - 0.03, 0, 0.07, h + 0.12], [w / 2 + 0.03, 0, 0.07, h + 0.12], [0, 0, 0.04, h], [0, 0, w, 0.04]]
    .forEach(([dx, dy, ww, hh]) => put(box(ww, hh, 0.07, fr, 0.01), x + dx, y + dy, z + 0.03, parent));
  put(box(w + 0.2, 0.05, 0.16, fr, 0.01), x, y - h / 2 - 0.05, z + 0.07, parent);
  return skyMat;
}

// neon lettering: one plane per letter so a word can light up letter by letter. Returns { on(t, t0), letters }
export function neonSign(parent, text, x, y, z, { size = 0.37, gap = 0.256, color = [4.2, 1.35, 1.05], lightColor = 0xff6a4a } = {}) {
  const chars = [...String(text)], w0 = (chars.length - 1) * gap;
  const mats = chars.map((ch, i) => { const m = lit(0.2, 0.13, 0.13, { map: neon(ch, { w: 220, h: 300, size: 230 }), transparent: true }); put(sheet(size * 0.73, size, m), x - w0 / 2 + i * gap, y, z, parent); return m; });
  const glow = put(new THREE.PointLight(lightColor, 0, 2.8, 2), x, y, z + 0.4, parent);
  return {
    mats,
    on(t, t0, flicker = true) {                         // letters light one by one from t0, with a short flicker each
      mats.forEach((m, i) => { const v = t - t0 - i * 0.05, k = v < 0 ? 0 : v > 0.12 ? 1 : flicker && noise01(Math.floor(t * 30) * 3.1 + i) > 0.4 ? 1 : 0.2;
        const hum = k === 1 && noise01(Math.floor(t * 30) * 7 + i) > 0.985 ? 0.45 : 1;
        m.color.setRGB(lerp(0.2, color[0], k) * hum, lerp(0.13, color[1], k) * hum, lerp(0.13, color[2], k) * hum); });
      glow.intensity = 3.2 * clamp((t - t0) / 0.35);
    },
  };
}

// ════════ SHOP: a small shopfront interior at night. A lit doorway (OPEN sign that flips), a window, a neon word over the
// door, a wall clock, a hanging lamp over the host spot, a work desk. Customers can walk in through the door.
export function shop(parent, { wall = 'clay', neonWord = 'OPEN', openSign = true } = {}) {
  room(parent, { wall });
  const DX = 0.95, HOST = V(0.5, 0, -1.5);
  put(sheet(0.95, 1.95, lit(1.2, 0.66, 0.3)), DX, 0.975, -3.19, parent);
  put(box(0.09, 2.04, 0.12, mat.woodDark, 0.01), DX - 0.52, 1.02, -3.15, parent); put(box(0.09, 2.04, 0.12, mat.woodDark, 0.01), DX + 0.52, 1.02, -3.15, parent); put(box(1.13, 0.09, 0.12, mat.woodDark, 0.01), DX, 2.0, -3.15, parent);
  const leaf = group(parent, DX - 0.47, 0, -3.14); leaf.rotation.y = 1.25; put(box(0.92, 1.9, 0.05, paint(0x7a3f2a), 0.01), 0.46, 0.95, 0, leaf); put(box(0.05, 0.05, 0.06, mat.brass, 0.01), 0.82, 0.95, 0.05, leaf);
  const pool = put(sheet(1.3, 2.6, lit(0.42, 0.24, 0.1, { map: tex.beam, transparent: true, add: true })), DX, 0.004, -1.9, parent); pool.rotation.x = -Math.PI / 2;
  put(new THREE.PointLight(0xffa860, 4.5, 6, 2), DX, 1.05, -2.75, parent);
  let sign = null;
  if (openSign) {
    sign = group(parent, DX, 1.6, -3.0);
    put(box(0.004, 0.22, 0.004, mat.ink, 0), -0.12, 0.14, 0, sign); put(box(0.004, 0.22, 0.004, mat.ink, 0), 0.12, 0.14, 0, sign);
    put(sheet(0.36, 0.16, new THREE.MeshStandardMaterial({ map: label('OPEN', { w: 360, h: 160, bg: '#D9653B', fg: '#FFF3DF', size: 92 }), roughness: 0.8 })), 0, 0, 0.004, sign).castShadow = true;
    const back = put(sheet(0.36, 0.16, new THREE.MeshStandardMaterial({ map: label('CLOSED', { w: 360, h: 160, bg: '#3a3b44', fg: '#d8d4cc', size: 72 }), roughness: 0.8 })), 0, 0, -0.004, sign); back.rotation.y = Math.PI;
  }
  windowFrame(parent, -1.45, 1.78, -3.19);
  const word = neonWord ? neonSign(parent, neonWord, -0.08, 1.9, -3.17, { size: 0.25, gap: 0.175 }) : null;
  const clock = group(parent, 1.9, 1.75, -3.16); clock.add(box(0.48, 0.48, 0.04, mat.ink, 0.2)); put(new THREE.Mesh(new THREE.CircleGeometry(0.2, 40), paint(0xfbf7ee)), 0, 0, 0.024, clock);
  const hourH = group(clock, 0, 0, 0.03), minH = group(clock, 0, 0, 0.034); put(box(0.022, 0.1, 0.006, mat.ink, 0), 0, 0.05, 0, hourH); put(box(0.016, 0.16, 0.006, mat.ink, 0), 0, 0.08, 0, minH);
  const LAMP = V(HOST.x, 2.32, HOST.z + 0.05);
  put(box(0.012, 2.0, 0.012, mat.ink, 0), LAMP.x, LAMP.y + 1.15, LAMP.z, parent);
  put(new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.24, 40, 1, true), paint(0x1f3d33, { side: THREE.DoubleSide, rough: 0.5 })), LAMP.x, LAMP.y + 0.08, LAMP.z, parent);
  put(new THREE.Mesh(new THREE.SphereGeometry(0.07, 24, 16), lit(2.6, 1.9, 1.2)), LAMP.x, LAMP.y - 0.02, LAMP.z, parent);
  const desk = table(parent, -1.45, -2.8);
  put(box(0.46, 0.34, 0.5, mat.wood, 0.02), 0.4, 0.53, 0, desk);
  const cup = mug(parent, -1.03, desk.top, -2.68); plant(parent, -2.0, desk.top, -2.92);
  const s = {
    host: HOST, door: V(DX, 0, -3.0), lamp: LAMP, sign, word, cup, focus: V(HOST.x, 0.75, HOST.z),
    views: {
      wide: { from: [0.3, 2.72, 4.45], to: [0.14, 2.5, 3.75], look0: [0.14, 0.86, -1.72], look1: [0.12, 0.86, -1.65], fov: 36, ap: 0.0022 },
      host: { from: [-0.22, 1.0, 1.85], to: [0.12, 1.06, 1.75], look0: [0.4, 1.12, -1.6], look1: [0.45, 1.14, -1.6], fov: 44, ap: 0.0034 },
      desk: { from: [-1.2, 1.5, -0.6], to: [-1.3, 1.45, -0.9], look0: [-1.45, 0.95, -2.8], look1: [-1.45, 0.95, -2.8], fov: 40, ap: 0.0028, focus: [-1.45, 0.9, -2.8] },
    },
    signAt: 0.12, wordAt: 0.4,
    light(rig, at) { aim(rig.key, at(0.3, 2.5, -0.9), at(0.5, 0.4, -1.5), 12, 0xffd3a4, 0.85); aim(rig.accent, at(0.95, 2.2, -2.6), at(0.5, 0.6, -1.5), 6, 0xffb070, 0.7); aim(rig.fill, at(1.0, 3.0, 4.6), at(0.2, 0.8, -1.7), 20); aim(rig.rim, at(-3, 3.6, -3.8), at(0, 0, 0), 1.1); },
    frame(t) {
      if (sign) { sign.rotation.y = Math.PI * (1 - settle(t - s.signAt, 1.8, 0.45)); sign.rotation.z = 0.08 * Math.sin(TAU * 0.6 * t); }
      if (word) word.on(t, s.wordAt);
      minH.rotation.z = (-TAU * t) / 3; hourH.rotation.z = (-TAU * t) / 36; cup.steam(t);
    },
  };
  return s;
}

// ════════ BOARD: a corkboard on the back wall with pinned cards that land on cue and a red string between them
export function board(parent, { wall = 'sage', cards = [], x = 0, y = 1.6 } = {}) {
  room(parent, { wall });
  const Z = -3.17, BW = 1.1, BH = 1.5;
  put(sheet(BW, BH, new THREE.MeshStandardMaterial({ map: tex.cork, roughness: 0.95 })), x, y, Z, parent);
  [[0, BH / 2 + 0.04, BW + 0.12, 0.09], [0, -BH / 2 - 0.04, BW + 0.12, 0.09], [-BW / 2 - 0.04, 0, 0.09, BH + 0.16], [BW / 2 + 0.04, 0, 0.09, BH + 0.16]]
    .forEach(([dx, dy, w, h]) => put(box(w, h, 0.07, mat.woodDark, 0.015), x + dx, y + dy, Z + 0.02, parent));
  const slots = cards.length <= 1 ? [0] : cards.length === 2 ? [0.36, -0.34] : [0.48, 0, -0.48];
  const made = cards.map((c, i) => {
    const g = group(parent); const m = put(new THREE.Mesh(new THREE.PlaneGeometry(0.84, 0.6), new THREE.MeshStandardMaterial({ map: card({ ...c, seed: 90 + i }), roughness: 0.85 })), 0, 0, 0, g); m.castShadow = m.receiveShadow = true;
    if (cards.length > 2) g.scale.setScalar(0.62);
    const pin = group(g, -0.35, 0.255, 0.002); put(ball(0.035, paint(0xd9342b, { rough: 0.35, map: null }), 16), 0, 0, 0.04, pin);
    return { g, pin, home: V(x + (i % 2 ? 0.03 : 0), y + slots[i], Z + 0.012), from: V(i % 2 ? -0.6 : 0.7, -0.5, 2.3), at: 0 };
  });
  let yarn = null, yarnN = 0;
  if (made.length >= 2) {
    const a = made[0].home, b2 = made[made.length - 1].home;
    yarn = put(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(a.x - 0.35 * (made.length > 2 ? 0.62 : 1), a.y + 0.255, Z + 0.05), V(x - 0.5, (a.y + b2.y) / 2, Z + 0.05), V(b2.x - 0.32, b2.y + 0.17, Z + 0.05)]), 60, 0.008, 8, false), paint(0xc4241c, { map: null, rough: 0.6 })), 0, 0, 0, parent);
    yarn.castShadow = true; yarnN = yarn.geometry.index.count;
  }
  const s = {
    cards: made, yarn, yarnAt: 99, focus: V(x, y, Z),
    views: { board: { from: [x + 0.15, y - 0.55, 1.65], to: [x + 0.08, y - 0.5, 1.4], look0: [x, y - 0.15, Z], look1: [x, y - 0.12, Z], fov: 36, ap: 0.0018 } },
    light(rig, at) { aim(rig.key, at(x + 0.85, 2.6, -1.6), at(x + 1.0, 0.6, -2.6), 10, 0xffd3a4, 0.8); aim(rig.accent, at(x + 0.45, 3.1, -1.4), at(x, y, Z), 4.5, 0xffe2bd, 0.55); aim(rig.fill, at(x + 0.6, 2.4, 3.5), at(x, y - 0.4, -2.8), 12); aim(rig.rim, at(-3, 3.6, -3.8), at(x, 0, -2), 1.1); },
    frame(t) {
      made.forEach((c) => {
        const v = settle(t - c.at + 0.2, 2.5, 0.6), q = settle(t - c.at + 0.2, 2.5, 0.48); c.g.visible = t >= c.at - 0.2;
        const off = c.from.clone().multiplyScalar(1 - v); off.z = Math.max(0, off.z); c.g.position.copy(c.home).add(off);
        c.g.rotation.set(0.5 * (1 - q), -0.9 * (1 - q), 0.55 * (1 - q) - 0.03); c.pin.scale.setScalar(grow(t - c.at - 0.02, 4, 0.5));
      });
      if (yarn) { yarn.visible = t >= s.yarnAt; yarn.geometry.setDrawRange(0, Math.floor((yarnN * ease.out((t - s.yarnAt) / 0.4)) / 3) * 3); }
    },
  };
  return s;
}

// ════════ DESK: a work desk with a laptop whose screen you paint live, a mug, a plant, a window behind.
// sky: 'night' | 'day' | 'cycle' (days race past; s.cycleFrom = when the first day starts). Or s.dawn = [t0, t1]: one night → sunrise.
// laptopFaces: 'lens' (the screen is the subject) | 'host' (a host sits behind the desk at s.host and types; a seat at y 0.3).
export function desk(parent, { wall = 'denim', sky = 'cycle', neonWord = null, laptopFaces = 'lens' } = {}) {
  room(parent, { wall });
  const Z = -3.18, WX = 0, WY = 1.85;
  const skyMat = new THREE.MeshBasicMaterial({ color: 0x17215c }); put(sheet(1.9, 1.35, skyMat), WX, WY, Z, parent);
  const stars = put(sheet(1.9, 1.35, new THREE.MeshBasicMaterial({ map: tex.nightSky, transparent: true, opacity: 0 })), WX, WY, Z + 0.002, parent);
  const cloudTex = canvasTex(512, 256, (g) => { g.fillStyle = 'rgba(255,255,255,0.95)'; [[120, 120, 60], [190, 100, 70], [260, 125, 55], [380, 150, 45], [430, 135, 38]].forEach(([cx, cy, r]) => { g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill(); }); }, { edge: true });
  const clouds = put(sheet(1.9, 0.95, new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, opacity: 0 })), WX, WY + 0.1, Z + 0.003, parent);
  const sun = put(new THREE.Mesh(new THREE.CircleGeometry(0.16, 32), lit(3, 2.4, 1.1)), 0, 0, Z + 0.004, parent), moon = put(new THREE.Mesh(new THREE.CircleGeometry(0.13, 32), lit(2.2, 2.1, 1.7)), 0, 0, Z + 0.004, parent);
  const fr = paint(0xe9e2d2); [[0, 0.71, 2.02, 0.08], [0, -0.71, 2.02, 0.08], [-0.98, 0, 0.08, 1.5], [0.98, 0, 0.08, 1.5], [0, 0, 0.05, 1.35]].forEach(([dx, dy, w, h]) => put(box(w, h, 0.08, fr, 0.01), WX + dx, WY + dy, Z + 0.03, parent));
  const w = WALLS[wall] || WALLS.denim;
  [[-1.98, 0, 2.0, 2.6], [1.98, 0, 2.0, 2.6], [0, 1.6, 2.2, 1.8], [0, -1.4, 2.2, 1.4]].forEach(([dx, dy, ww, hh]) => put(sheet(ww, hh, new THREE.MeshStandardMaterial({ map: wallpaper(w[0], w[1], w[2], 42, [1, 1]), roughness: 0.92 })), WX + dx, WY + dy, Z + 0.008, parent));
  const top = table(parent, 0, -1.25, 1.8, 0.8, 0.76);
  // laptopFaces 'lens': the screen faces the camera (a screen story) · 'host': it faces a host sitting behind the desk (the lid's back to us)
  const lap = laptopFaces === 'host' ? laptop(parent, -0.52, 0.795, -1.2, Math.PI - 0.75, { tilt: -0.32 }) : laptop(parent, -0.12, 0.795, -1.22, 0.12, { tilt: -0.28, w: 0.74, d: 0.48 });   /* the screen faces the lens; the host works from the right */
  if (laptopFaces === 'host') put(new THREE.PointLight(0x9ad0ff, 0.7, 1.4, 2), -0.62, 0.98, -1.5, parent);   // the screen glow on the host side
  else put(new THREE.PointLight(0x9ad0ff, 1.2, 1.6, 2), -0.12, 1.15, -0.85, parent);
  let sign = null;
  if (neonWord) { put(box(0.5, 0.05, 0.14, mat.ink, 0.01), -0.72, 0.82, -1.5, parent); sign = neonSign(parent, neonWord, -0.72, 0.98, -1.49, { size: 0.21, gap: 0.62 / Math.max(1, neonWord.length), color: [1.2, 3.0, 4.2], lightColor: 0x7cc8ff }); }
  const cup = mug(parent, -0.82, 0.795, -0.98);
  plant(parent, 0.82, 0.795, -1.5, 0.9);
  let day = sky === 'day' ? 1 : 0;
  const s = {
    laptop: lap, screen: lap.screen, sign, signAt: 99, host: V(0.62, 0.3, -1.85), hostYaw: -0.45, peek: V(0.36, 0.795, -1.82), focus: V(-0.1, 1.02, -1.35),
    views: {
      wide: { from: [0.3, 1.45, 2.2], to: [0.12, 1.42, 1.8], look0: [0.0, 1.5, -2.6], look1: [0.0, 1.48, -2.6], fov: 40, ap: 0.0022 },
      screen: { from: [0.38, 1.38, 0.62], to: [0.25, 1.33, 0.36], look0: [-0.05, 1.06, -1.3], look1: [-0.07, 1.06, -1.3], fov: 40, ap: 0.003, focus: [-0.1, 1.04, -1.32] },
    },
    day: () => day,
    light(rig, at) { aim(rig.key, at(0.6, 3.0, 0.4), at(0, 0.9, -1.8), lerp(11, 19, day), new THREE.Color().setRGB(lerp(0.55, 1, day), lerp(0.65, 0.88, day), lerp(1, 0.7, day)).getHex(), 0.9); aim(rig.accent, at(0, 2.2, -3.0), at(0, 0.9, -1.85), lerp(10, 4, day), day > 0.5 ? 0xffe2a0 : 0x7a9cff, 0.8); aim(rig.fill, at(0.4, 2.2, 3.5), at(0, 1.0, -1.8), 9); aim(rig.rim, at(-3, 3.6, -3.8), at(0, 0, -2), 1.1); },
    frame(t, cycle = sky === 'cycle') {
      if (s.dawn) { const u = clamp((t - s.dawn[0]) / (s.dawn[1] - s.dawn[0])); day = 0.8 * ease.soft(u); const a = Math.PI * (1 - 0.5 * ease.soft(u)); sun.position.set(WX + 0.55, WY - 0.85 + 0.9 * ease.soft(u), Z + 0.004); moon.position.set(WX - 0.5, WY + 0.32 - 0.6 * ease.soft(u), Z + 0.004); sun.visible = moon.visible = true; }
      else if (cycle) { const ph = ((t - (s.cycleFrom || 0)) / 0.85 + 0.15) % 1; day = 0.5 + 0.5 * Math.cos(ph * TAU); const a = ph * TAU; sun.position.set(WX + 0.7 * Math.sin(a), WY - 0.55 + 0.85 * Math.cos(a), Z + 0.004); moon.position.set(WX - 0.7 * Math.sin(a), WY - 0.55 - 0.85 * Math.cos(a), Z + 0.004); }
      else { sun.position.set(WX + 0.45, WY + 0.25, Z + 0.004); moon.position.set(WX - 0.4, WY + 0.3, Z + 0.004); sun.visible = day > 0.5; moon.visible = day <= 0.5; }
      skyMat.color.setRGB(lerp(0.07, 0.45, day), lerp(0.1, 0.72, day), lerp(0.33, 0.98, day)); stars.material.opacity = clamp(1 - day * 1.6); clouds.material.opacity = clamp(day * 1.4 - 0.3); clouds.position.x = WX - 0.3 + ((t * 0.5) % 0.6);
      if (sign) sign.on(t, s.signAt); cup.steam(t);
    },
  };
  return s;
}

// ════════ MONITOR: a tall screen on a desk, painted live (dashboards, feeds, charts). draw(fn) repaints it.
export function monitor(parent, { wall = 'oat', sw = 900, sh = 1300, glow = 0.95 } = {}) {
  room(parent, { wall });
  const Z = -1.6, W = 0.9, H = 1.3, Y = 1.55;
  const mon = group(parent, 0, 0, Z);
  put(box(W + 0.1, H + 0.1, 0.06, paint(0x18191e, { rough: 0.35 }), 0.03), 0, Y, 0, mon); put(box(0.1, 0.4, 0.08, mat.charcoal, 0.02), 0, Y - H / 2 - 0.2, -0.05, mon); put(box(0.5, 0.04, 0.3, mat.charcoal, 0.02), 0, 0.81, -0.05, mon);
  put(box(2.5, 0.08, 1.1, mat.woodLight, 0.02), 0, 0.76, Z + 0.1, parent); put(box(2.4, 0.72, 1.0, mat.wood, 0.02), 0, 0.36, Z + 0.1, parent);
  mug(parent, -0.75, 0.8, Z + 0.25); plant(parent, 0.8, 0.8, Z + 0.1, 0.9);
  const scr = screen(sw, sh); put(sheet(W, H, lit(glow, glow, glow, { map: scr.tex })), 0, Y, Z + 0.032, parent);
  const glowL = put(new THREE.PointLight(0x9ac8ff, 2.2, 3, 2), 0, Y, Z + 0.6, parent);
  return {
    screen: scr, focus: V(0, Y, Z), peek: V(0.36, 0.8, -1.32),
    views: {
      screen: { from: [0.12, 1.6, 1.3], to: [0.02, 1.58, 1.12], look0: [0, 1.5, -1.6], look1: [0, 1.5, -1.6], fov: 40, ap: 0.0016 },
      wide: { from: [0.3, 1.72, 2.1], to: [0.05, 1.7, 1.75], look0: [0, 1.66, -1.6], look1: [0, 1.68, -1.6], fov: 40, ap: 0.0018 },
    },
    light(rig, at) { aim(rig.key, at(0.4, 3.2, 0.2), at(0, 1.0, -1.4), 12, 0xffd8b0, 0.9); aim(rig.accent, at(2.6, 2.4, -1.2), at(1.15, 0.8, -0.65), 9, 0x9ac8ff, 0.7); aim(rig.fill, at(0.3, 2.2, 3.5), at(0, 1.2, -1.4), 8); aim(rig.rim, at(-3, 3.6, -3.8), at(0, 0, -1), 1.1); },
    frame(t) { glowL.intensity = 2.2 + 0.4 * Math.sin(TAU * 3 * t); },
  };
}

// ════════ MACHINE: a sage "press" on a production line. A copper hood with two vent pipes, a big gauge on the front, a
// pull lever on top, a row of indicator bulbs and a ticket slot. Things ride the input belt in; on `startAt` the lever
// pulls, the bulbs run, the needle swings, steam puffs from the pipes and a ticket feeds out of the slot; results ride the
// out belt to a labelled tray. Items are yours (add meshes to s.line).
export function machine(parent, { wall = 'butter', name = 'PRESS', body = 0x6f9a86, hood = 0xc4763f, outLabel = 'OUTBOX', outSub = 'ready to send', inLabel = 'INBOX', inSub = 'in' } = {}) {
  room(parent, { wall });
  const line = group(parent, 0, 0, -0.6); line.rotation.y = -0.95;
  const m = group(line), copper = paint(hood, { metal: 0.55, rough: 0.32, map: null });
  put(box(1.18, 0.26, 0.82, mat.charcoal, 0.03), 0, 0.13, 0, m);                                     // plinth
  put(box(1.12, 0.98, 0.78, paint(body), 0.1), 0, 0.75, 0, m);                                       // body
  put(box(1.16, 0.06, 0.82, copper, 0.02), 0, 0.27, 0, m);                                           // copper band at the foot
  const hood3 = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.14, 40, 1, false, 0, Math.PI), copper);
  hood3.rotation.z = Math.PI / 2; hood3.scale.set(1, 1, 0.62); hood3.castShadow = true; put(hood3, 0, 1.24, 0, m);
  const pipes = [-0.3, -0.1];
  pipes.forEach((x) => { put(tube(0.05, 0.05, 0.42, copper, 16), x, 1.58, -0.18, m); put(tube(0.075, 0.06, 0.06, copper, 16), x, 1.8, -0.18, m); });
  // the gauge: cream face with ticks, a red arc and a needle
  const face = canvasTex(256, 256, (g) => {
    g.fillStyle = '#f6efe0'; g.beginPath(); g.arc(128, 128, 124, 0, TAU); g.fill();
    g.strokeStyle = '#d9342b'; g.lineWidth = 16; g.beginPath(); g.arc(128, 128, 96, Math.PI * 1.75, Math.PI * 2.2); g.stroke();
    g.strokeStyle = '#1b1a20';
    for (let i = 0; i <= 10; i++) { const a = Math.PI * (0.8 + i * 0.14), r1 = i % 5 ? 88 : 78; g.lineWidth = i % 5 ? 4 : 8; g.beginPath(); g.moveTo(128 + Math.cos(a) * 104, 128 + Math.sin(a) * 104); g.lineTo(128 + Math.cos(a) * r1, 128 + Math.sin(a) * r1); g.stroke(); }
    g.fillStyle = '#1b1a20'; g.font = `800 34px ${fonts.sans}`; g.textAlign = 'center'; g.fillText('BATCH', 128, 196);
  }, { edge: true });
  const gauge = group(m, -0.2, 0.86, 0.395);
  put(new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.03, 12, 40), copper), 0, 0, 0, gauge);
  put(new THREE.Mesh(new THREE.CircleGeometry(0.19, 40), new THREE.MeshStandardMaterial({ map: face, roughness: 0.6 })), 0, 0, 0.005, gauge);
  const needle = group(gauge, 0, 0, 0.02);
  put(box(0.012, 0.15, 0.008, paint(0xd9342b, { map: null }), 0), 0, 0.065, 0, needle); put(ball(0.022, mat.ink, 10), 0, 0, 0.004, gauge);
  put(new THREE.Mesh(new THREE.CircleGeometry(0.2, 40), new THREE.MeshStandardMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.16, roughness: 0.05 })), 0, 0, 0.03, gauge);
  // name plate, three bulbs, the ticket slot
  put(sheet(0.46, 0.13, new THREE.MeshStandardMaterial({ map: label(name, { w: 600, h: 170, bg: '#F6EFE0', fg: '#1b1a20', border: '#c4763f', size: 74 }), roughness: 0.7 })), 0.28, 1.0, 0.396, m);
  const bulbs = [0.12, 0.28, 0.44].map((x) => put(ball(0.04, lit(0.35, 0.22, 0.1), 14), x, 0.8, 0.4, m));
  put(box(0.42, 0.05, 0.06, mat.charcoal, 0.01), 0.28, 0.58, 0.39, m);
  const ticketTex = canvasTex(340, 240, (g, w, h) => { g.fillStyle = '#fbf8f1'; g.fillRect(0, 0, w, h); g.fillStyle = '#1b1a20'; for (let i = 0; i < 5; i++) g.fillRect(24, 30 + i * 38, i === 0 ? 200 : 140 + ((i * 37) % 120), 12); g.fillStyle = '#c4763f'; g.fillRect(24, 214, 90, 8); }, { edge: true });
  const ticket = put(sheet(0.34, 0.24, new THREE.MeshStandardMaterial({ map: ticketTex, roughness: 0.85, side: THREE.DoubleSide })), 0.28, 0.5, 0.42, m);
  ticket.rotation.x = -0.25;
  // the lever: a copper arm on a pivot at the hood's front-right, a red knob
  const lever = group(m, 0.42, 1.36, 0.16); put(box(0.05, 0.05, 0.12, copper, 0.01), 0, 0, 0, lever);
  const arm = group(lever, 0, 0, 0); put(box(0.035, 0.34, 0.035, mat.steel, 0.01), 0, 0.17, 0, arm); put(ball(0.06, paint(0xd9342b, { map: null, rough: 0.35 }), 16), 0, 0.36, 0, arm);
  const puffs = [0, 1, 2, 3, 4, 5].map(() => put(new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 10), new THREE.MeshStandardMaterial({ color: 0xf6f2ea, transparent: true, opacity: 0.6, roughness: 1, depthWrite: false })), 0, 1.85, -0.18, m));
  const belt = (x0, x1) => {
    const g = group(line, (x0 + x1) / 2, 0, 0.05), L = Math.abs(x1 - x0); put(box(L, 0.1, 0.5, mat.charcoal, 0.02), 0, 0.6, 0, g);
    const tt = tex.tread.clone(); tt.repeat.set(L * 3, 1); tt.needsUpdate = true; put(sheet(L, 0.44, new THREE.MeshStandardMaterial({ map: tt, roughness: 0.6 })), 0, 0.652, 0, g).rotation.x = -Math.PI / 2;
    [-L / 2 + 0.1, L / 2 - 0.1].forEach((x) => put(box(0.08, 0.6, 0.08, mat.steel, 0.01), x, 0.3, 0, g)); return tt;
  };
  const beltIn = belt(-1.95, -0.6), beltOut = belt(0.6, 1.2);
  const tray = (x, title, sub, yaw) => {
    const g = group(line, x, 0, 0.05); put(box(0.62, 0.08, 0.5, mat.wood, 0.02), 0, 0.78, 0, g); [0.25, -0.25].forEach((z) => put(box(0.62, 0.08, 0.02, mat.wood, 0.005), 0, 0.83, z, g)); put(box(0.06, 0.78, 0.06, mat.woodDark, 0.01), 0, 0.39, 0, g);
    const plateTex = canvasTex(600, 180, (c, w) => { c.fillStyle = '#F6EFE0'; c.fillRect(0, 0, w, 180); c.fillStyle = '#1b1a20'; c.font = `800 64px ${fonts.sans}`; c.fillText(title, 24, 80); c.fillStyle = '#9a5a30'; c.font = `700 34px ${fonts.mono}`; c.fillText(sub, 26, 140); }, { edge: true });
    const plate = put(sheet(0.6, 0.18, new THREE.MeshStandardMaterial({ map: plateTex, roughness: 0.7 })), 0, 1.0, 0.27, g); plate.rotation.y = yaw; return g;
  };
  tray(1.42, outLabel, outSub, 0.95); tray(-2.3, inLabel, inSub, 0.5);
  line.updateMatrixWorld(true);
  const s = {
    line, startAt: 99, focus: V(0.2, 0.9, -0.6),
    toSet: (x, y, z) => V(x, y, z).applyMatrix4(line.matrix),     // a point on the line → set coordinates
    beltX: { inFrom: -1.85, inTo: -0.55, outFrom: 0.6, outTo: 1.4, y: 0.665 },
    views: { line: { from: [-1.1, 2.6, 4.3], to: [0.85, 2.4, 4.15], look0: [0.05, 0.9, -0.75], look1: [0.5, 0.92, -0.45], fov: 46, ap: 0.002 } },
    light(rig, at) { aim(rig.key, at(0.3, 3.4, 0.6), at(0.2, 0.6, -0.5), 15, 0xffd8b0, 0.9); aim(rig.accent, at(2.4, 2.6, -1.8), at(0.4, 0.9, -0.5), 7, 0xffc690, 0.8); aim(rig.fill, at(0.4, 2.6, 4.8), at(0.3, 0.9, -0.5), 13); aim(rig.rim, at(-3, 3.6, -3.8), at(0, 0, -1), 1.0); },
    frame(t) {
      const t0 = s.startAt, pull = Math.max(0, Math.sin(Math.PI * clamp((t - t0 + 0.25) / 0.45))), run = clamp((t - t0) / 0.3);
      arm.rotation.x = 0.9 * pull;
      bulbs.forEach((b, i) => { const on = t > t0 && Math.floor((t - t0) * 6 + i) % 3 !== 0; b.material.color.setRGB(on ? 2.4 : 0.35, on ? (i === 2 ? 2.0 : 1.4) : 0.22, on ? 0.5 : 0.1); });
      needle.rotation.z = 1.25 - run * (1.9 + 0.12 * Math.sin(TAU * 3 * t));
      m.position.y = 0.01 * Math.sin(TAU * 9 * t) * run;
      const tv = clamp((t - t0 - 0.4) / 0.9); ticket.visible = tv > 0; ticket.position.set(0.28, 0.56, 0.42 + 0.22 * ease.out(tv)); ticket.scale.set(1, Math.max(0.01, ease.out(tv)), 1);
      puffs.forEach((p, i) => { const v = ((t - t0) * 1.1 + i / 6) % 1, x = pipes[i % 2]; p.visible = t > t0; p.position.set(x + 0.08 * Math.sin(i * 2.1 + t), 1.86 + v * 0.75, -0.18); p.scale.setScalar(0.45 + v * 1.5); p.material.opacity = 0.6 * (1 - v); });
      beltIn.offset.x = -t * 1.2; beltOut.offset.x = -t * 1.2;
    },
  };
  return s;
}

// ════════ MAP TABLE: a little town on a table. Blocks carry names you choose; pins drop on cue; the picked ones get a ring + ✓
export function mapTable(parent, { wall = 'clay', names = ['BAKERY', 'GYM', 'DENTIST', 'FLORIST', 'PIZZA', 'CAFE', 'BOOKS', 'YOGA', 'DELI', 'BARBER', 'VET', 'TAILOR'], streets = ['MAIN ST', 'OAK AVE', 'MILL RD'] } = {}) {
  room(parent, { wall });
  const TOP = 0.86, MZ = -0.5, MW = 2.6, MD = 2.0, GX = [-0.9, -0.3, 0.3, 0.9], GZ = [-0.6, 0, 0.6];
  put(box(MW + 0.3, 0.1, MD + 0.3, mat.woodDark, 0.03), 0, TOP - 0.06, MZ, parent);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => put(box(0.1, TOP - 0.1, 0.1, mat.woodDark, 0.01), sx * (MW / 2), (TOP - 0.1) / 2, MZ + sz * (MD / 2), parent));
  const mapTex = canvasTex(2048, 1576, (g, w, h) => {
    const r = rng(7), X = (x) => (x / MW + 0.5) * w, Zm = (z) => (z / MD + 0.5) * h; g.fillStyle = '#efe8d8'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#b9dca0'; g.fillRect(X(-1.28), Zm(-0.95), X(-1.2) - X(-1.28), Zm(0.95) - Zm(-0.95));
    g.strokeStyle = '#8fc1e8'; g.lineWidth = 64; g.lineCap = 'round'; g.beginPath(); g.moveTo(-40, Zm(0.93)); g.bezierCurveTo(w * 0.3, Zm(0.86), w * 0.65, Zm(1.0), w + 40, Zm(0.9)); g.stroke();
    const road = (x0, y0, x1, y1, wd, col) => { g.lineCap = 'butt'; g.strokeStyle = '#c9c2b2'; g.lineWidth = wd + 10; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); g.strokeStyle = col; g.lineWidth = wd; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); };
    [-1.2, -0.6, 0, 0.6, 1.2].forEach((x) => road(X(x), 0, X(x), h, 70, '#ffffff')); [-0.9, -0.3, 0.3, 0.9].forEach((z) => road(0, Zm(z), w, Zm(z), z === 0.3 ? 92 : 70, z === 0.3 ? '#f6d58e' : '#ffffff'));
    g.fillStyle = '#8a857a'; g.font = `700 30px ${fonts.mono}`; streets.forEach((s, i) => g.fillText(s, X([0.12, -0.95, 0.4][i] || 0), Zm([0.3, -0.3, -0.9][i] || 0) + 11));
    speckle(g, w, h, r, 3000, 0.6, 1.8, ['#d9d0bd', '#ffffff'], 0.2, 0.5);
  });
  const sheetM = put(sheet(MW, MD, new THREE.MeshStandardMaterial({ map: mapTex, roughness: 0.85 })), 0, TOP + 0.002, MZ, parent); sheetM.rotation.x = -Math.PI / 2;
  const tints = [[0xe9d3a8, 0x7a4a2e], [0x9fb8d8, 0x3e5c8a], [0xe8eef2, 0x5aa6b5], [0xf3c9d6, 0xc2557a], [0xd7ecd0, 0x3f8a4f], [0xf5d98c, 0x2f7d4f], [0xd9c2a0, 0x5e3620], [0xd7cdeb, 0x6b58a8], [0xe6d6c8, 0x8a4a6a], [0xf2c6a0, 0xc0603a], [0xe9e2d3, 0xb23a3a], [0xcfe8d8, 0x3f8a6a]];
  const blocks = names.slice(0, 12).map((name, i) => {
    const x = GX[i % 4], z = MZ + GZ[Math.floor(i / 4)], g = group(parent, x, TOP, z), hgt = 0.31 + noise01(i + 3) * 0.14, w = 0.42, d = 0.32, [c, roof] = tints[i % tints.length];
    put(box(w, hgt, d, paint(c), 0.012), 0, hgt / 2, 0, g); put(box(w + 0.03, 0.04, d + 0.03, paint(roof), 0.008), 0, hgt + 0.02, 0, g);
    const aw = put(box(w * 0.9, 0.02, 0.1, paint(roof), 0.004), 0, hgt * 0.4, d / 2 + 0.04, g); aw.rotation.x = 0.35;
    put(sheet(w * 0.88, 0.09, new THREE.MeshStandardMaterial({ map: label(name, { w: 512, h: 112, size: name.length > 7 ? 56 : 68 }), roughness: 0.8 })), 0, hgt * 0.72, d / 2 + 0.004, g);
    put(sheet(0.1, 0.1, lit(1.4, 1.05, 0.6)), -0.1, hgt * 0.2, d / 2 + 0.003, g); put(sheet(0.1, 0.1, lit(1.4, 1.05, 0.6)), 0.1, hgt * 0.2, d / 2 + 0.003, g);
    put(contact(0.7, 0.55, 0.3), 0, 0.004, 0.02, g);
    return { g, name, x, z, h: hgt };
  });
  [[-1.2, -0.95], [1.2, -0.95], [-1.2, 0.95], [1.2, 0.95], [-0.6, 0.95], [0.6, -0.95], [0, 0.95], [0, -0.95]].forEach(([x, z], i) => { const tg = group(parent, x + (noise01(i) - 0.5) * 0.06, TOP, MZ + z * 0.98); put(tube(0.012, 0.016, 0.08, mat.woodDark, 6), 0, 0.04, 0, tg); put(new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.18, 10), mat.leaf), 0, 0.16, 0, tg).castShadow = true; });
  const pinRed = paint(0xd9342b, { map: null, rough: 0.35 }), pinGrey = paint(0x8a8f99, { map: null, rough: 0.5 });
  const checkTex = canvasTex(128, 128, (g) => icons.check(g, 64, 64, 62), { edge: true });
  const marks = [];
  const s = {
    blocks, focus: V(0, TOP + 0.25, MZ - 0.15),
    // pin(name, t0, { pick: true at tPick }) — drop a pin on a block; picked ones get a ring + ✓, the rest grey out at greyAt
    pin(name, t0, o = {}) {
      const b = blocks.find((q) => q.name === name); if (!b) return;
      const p = group(parent, b.x, TOP + b.h + 0.3, b.z); put(tube(0.005, 0.005, 0.2, mat.steel, 6), 0, 0.1, 0, p);
      const head = put(ball(0.05, pinRed, 16), 0, 0.22, 0, p);
      let ring = null, tick = null;
      if (o.pickAt != null) {
        ring = put(new THREE.Mesh(new THREE.RingGeometry(0.3, 0.35, 40), lit(0.6, 1.8, 0.8, { transparent: true })), b.x, TOP + 0.008, b.z, parent); ring.rotation.x = -Math.PI / 2;
        tick = put(new THREE.Mesh(new THREE.CircleGeometry(0.085, 32), new THREE.MeshBasicMaterial({ map: checkTex, transparent: true })), b.x + 0.17, TOP + b.h + 0.14, b.z + 0.17, parent);
      }
      marks.push({ p, head, b, t0, ...o, ring, tick });
    },
    views: { table: { from: [-0.35, 2.55, 2.5], to: [0.35, 2.5, 2.4], look0: [-0.2, 0.95, -0.7], look1: [0.2, 0.95, -0.65], fov: 46, ap: 0.0016 } },
    light(rig, at) { aim(rig.key, at(0.2, 3.6, 1.0), at(0, 0.86, -0.5), 9, 0xffe0b8, 0.95); aim(rig.accent, at(-1.6, 2.6, -2.4), at(0, 0.9, -0.5), 9, 0x8fb8ff, 0.8); aim(rig.fill, at(0.4, 2.6, 3.6), at(0, 0.9, -0.5), 3); aim(rig.rim, at(3, 3.6, -3.8), at(0, 0, 0), 1.1); },
    frame(t, cam) {
      marks.forEach((mk) => {
        const v = t - mk.t0; mk.p.visible = v >= 0;
        mk.p.position.y = TOP + mk.b.h + (1 - ease.out(v / 0.16)) * 0.8 - (v > 0.16 ? 0.04 * jolt(v - 0.16, 4, 0.4) : 0);
        const grey = mk.greyAt != null && t > mk.greyAt; mk.head.material = grey ? pinGrey : pinRed; mk.p.scale.setScalar(grey ? lerp(1, 0.55, ease.out((t - mk.greyAt) / 0.3)) : 1);
        if (mk.ring) { const w2 = t - mk.pickAt; mk.ring.visible = mk.tick.visible = w2 >= 0; mk.ring.scale.setScalar(grow(w2, 3, 0.5) * (1 + 0.05 * Math.sin(TAU * 1.5 * t))); mk.tick.scale.setScalar(grow(w2 - 0.05, 4, 0.5)); if (cam) mk.tick.quaternion.copy(cam.quaternion); mk.b.g.scale.setScalar(1 + 0.1 * jolt(w2, 3, 0.4)); }
      });
    },
  };
  return s;
}

// ════════ STREET: a corner shopfront at dusk. Painted clapboard facade with cream trim, a big lit window with goods and
// gold window lettering, a scalloped canopy, a hanging round blade sign, string lights, window boxes, a chalkboard
// A-frame on the pavement and a stoop for the host and a queue. The place for a call to action.
// sign: the word painted on the window (and the blade sign); neonWord is accepted as the old name for it.
export function street(parent, { sign = null, neonWord = null, facade = '#5f8b7d', trim = '#f3ead8', canopy = '#d9653b', board = 'FRESH AT 6' } = {}) {
  const word = String(sign || neonWord || 'OPEN');
  const ground = put(sheet(30, 20, paint(0x2b2a2e, { rough: 0.95 })), 0, 0, 0, parent); ground.rotation.x = -Math.PI / 2;
  const SH = 0.3, BACK = -2.8;
  put(box(12, SH, 1.6, paint(0xa39d92, { map: tex.grain, rough: 0.85 }), 0.02), 0.5, SH / 2, -2.0, parent);
  put(box(12, 0.15, 0.4, paint(0x8d877d, { rough: 0.85 }), 0.01), 0.5, 0.075, -1.05, parent);
  // clapboard: horizontal boards with a shadow line under each
  const boards = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = facade; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 32) { g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(0, y + 28, w, 4); g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(0, y, w, 3); }
    speckle(g, w, h, rng(91), 1800, 0.6, 1.6, ['rgba(0,0,0,0.25)', 'rgba(255,255,255,0.18)'], 0.15, 0.4);
  }, { repeat: [6, 4] });
  put(sheet(12, 7, new THREE.MeshStandardMaterial({ map: boards, roughness: 0.88 })), 0.5, 3.5, BACK, parent);
  const trimM = paint(trim, { rough: 0.7 });
  [[-4.2, 3.5, 0.18, 7], [4.6, 3.5, 0.18, 7], [0.2, 2.62, 8.8, 0.12]].forEach(([x, y, w, h]) => put(box(w, h, 0.06, trimM, 0.01), x, y, BACK + 0.03, parent));
  // the window: warm interior, shelves of goods, gold lettering on the glass
  put(sheet(1.9, 1.35, lit(0.92, 0.6, 0.32)), -1.0, SH + 1.25, BACK + 0.01, parent);
  for (let r = 0; r < 2; r++) { put(box(1.8, 0.03, 0.2, mat.woodDark, 0.005), -1.0, SH + 0.82 + r * 0.42, BACK + 0.1, parent); for (let i = 0; i < 5; i++) { const c = [0xd9a050, 0xc7834a, 0xe7c27a, 0xb5653d, 0xdcae62][(i + r) % 5]; const loaf = put(ball(0.09, paint(c), 14), -1.7 + i * 0.35, SH + 0.92 + r * 0.42, BACK + 0.12, parent); loaf.scale.set(1.5, 0.75, 1); } }
  const glassWord = canvasTex(1024, 300, (g, w, h) => { g.textAlign = 'center'; g.font = `800 150px ${fonts.serif}`; g.lineWidth = 10; g.strokeStyle = 'rgba(60,30,10,0.55)'; g.strokeText(word, w / 2, 190); g.fillStyle = '#f4c25b'; g.fillText(word, w / 2, 190); }, { edge: true });
  const wordMat = new THREE.MeshBasicMaterial({ map: glassWord, transparent: true, opacity: 0, depthWrite: false });
  put(sheet(1.3, 0.38, wordMat), -0.62, SH + 1.1, BACK + 0.14, parent);
  [[-1.0, SH + 1.96, 2.02, 0.08], [-1.0, SH + 0.54, 2.02, 0.08], [-1.98, SH + 1.25, 0.08, 1.5], [-0.02, SH + 1.25, 0.08, 1.5]].forEach(([x, y, w, h]) => put(box(w, h, 0.1, trimM, 0.01), x, y, BACK + 0.04, parent));
  // window box with plants under the glass
  put(box(1.9, 0.18, 0.24, paint(0x6b4a2e), 0.02), -1.0, SH + 0.44, BACK + 0.14, parent);
  for (let i = 0; i < 6; i++) plant(parent, -1.75 + i * 0.3, SH + 0.5, BACK + 0.15, 0.62);
  // scalloped canopy over the window, solid colour with a cream edge
  const scallop = canvasTex(512, 128, (g, w, h) => { g.fillStyle = canopy; g.fillRect(0, 0, w, 70); for (let x = 0; x < w; x += 64) { g.beginPath(); g.arc(x + 32, 70, 32, 0, Math.PI); g.fill(); } g.fillStyle = trim; g.fillRect(0, 60, w, 6); }, { edge: true });
  const cg = group(parent, -1.0, SH + 2.18, BACK + 0.3);
  const cm = put(sheet(2.3, 0.62, new THREE.MeshStandardMaterial({ map: scallop, transparent: true, alphaTest: 0.5, roughness: 0.8, side: THREE.DoubleSide })), 0, 0, 0, cg); cm.rotation.x = -0.75; cm.castShadow = true;
  // the door and its warm light
  put(sheet(0.95, 1.95, lit(1.15, 0.7, 0.34)), 1.05, SH + 0.975, BACK + 0.01, parent);
  [[0.53, SH + 1.02, 0.09, 2.04], [1.57, SH + 1.02, 0.09, 2.04], [1.05, SH + 2.0, 1.13, 0.09]].forEach(([x, y, w, h]) => put(box(w, h, 0.12, trimM, 0.01), x, y, BACK + 0.06, parent));
  // the round blade sign on an iron bracket (it swings a little)
  const bracket = group(parent, 0.26, SH + 2.42, BACK + 0.04); put(box(0.04, 0.04, 0.62, mat.ink, 0.005), 0, 0, 0.31, bracket);
  const blade = group(bracket, 0, -0.04, 0.5);
  const bladeTex = canvasTex(400, 400, (g, w) => { g.fillStyle = trim; g.beginPath(); g.arc(200, 200, 190, 0, TAU); g.fill(); g.lineWidth = 16; g.strokeStyle = canopy; g.stroke(); g.fillStyle = '#1b1a20'; g.textAlign = 'center'; g.font = `900 ${word.length > 6 ? 70 : 90}px ${fonts.sans}`; g.fillText(word, 200, 230); }, { edge: true });
  const disc = put(new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.04, 40), [paint(trim), new THREE.MeshStandardMaterial({ map: bladeTex, roughness: 0.7 }), new THREE.MeshStandardMaterial({ map: bladeTex, roughness: 0.7 })]), 0, -0.34, 0, blade);
  disc.rotation.set(0, Math.PI / 2, Math.PI / 2); disc.castShadow = true;
  // string lights along the facade
  const bulbs = [];
  for (let i = 0; i < 15; i++) { const u = i / 14, x = -2.6 + u * 5.6, y = SH + 2.85 - 0.22 * Math.sin(Math.PI * ((u * 2) % 1)); bulbs.push(put(ball(0.035, lit(1.7, 1.15, 0.55), 10), x, y, BACK + 0.35, parent)); }
  put(new THREE.PointLight(0xffb06a, 2.2, 5, 2), -1.2, SH + 2.6, BACK + 0.6, parent); put(new THREE.PointLight(0xffb06a, 2.2, 5, 2), 1.5, SH + 2.6, BACK + 0.6, parent);
  put(new THREE.PointLight(0xffa860, 3.0, 4.5, 2), -1.0, 1.4, -1.9, parent); put(new THREE.PointLight(0xffa860, 2.4, 4, 2), 1.05, 1.2, -2.2, parent);
  // a chalkboard A-frame on the pavement
  const af = group(parent, -2.35, SH, -1.75); af.rotation.y = 0.35;
  const chalk = canvasTex(300, 400, (g, w, h) => { g.fillStyle = '#26302c'; g.fillRect(0, 0, w, h); g.strokeStyle = '#8a5a34'; g.lineWidth = 22; g.strokeRect(0, 0, w, h); g.fillStyle = '#f3ead8'; g.textAlign = 'center'; g.font = `800 52px ${fonts.sans}`; String(board).split(' ').reduce((rows, wd) => { const l = rows.at(-1); if (l && (l + ' ' + wd).length < 9) rows[rows.length - 1] = l + ' ' + wd; else rows.push(wd); return rows; }, []).slice(0, 4).forEach((l, i) => g.fillText(l, w / 2, 110 + i * 72)); }, { edge: true });
  [-1, 1].forEach((sd) => { const p = put(box(0.5, 0.72, 0.03, new THREE.MeshStandardMaterial({ map: chalk, roughness: 0.9 }), 0.01), 0, 0.34, sd * 0.1, af); p.rotation.x = sd * 0.2; });
  return {
    stoop: SH, host: V(1.05, SH, -2.25), queueFrom: V(1.85, SH, -1.95), wordAt: 0, focus: V(1.05, SH + 0.75, -2.25),
    word: { on(t, t0) { wordMat.opacity = clamp((t - t0) / 0.4) * 0.95; } },
    views: { front: { from: [0.25, 1.4, 4.5], to: [0.18, 1.36, 4.05], look0: [0.05, 1.5, -2.6], look1: [0.02, 1.52, -2.6], fov: 42, ap: 0.0016 } },
    light(rig, at) { aim(rig.key, at(1.4, 3.4, 1.0), at(0.6, 0.6, -2.0), 11, 0xffc890, 0.9); aim(rig.accent, at(-1.6, 2.6, -0.6), at(0.0, 1.0, -2.4), 5, 0xffd2a0, 0.9); aim(rig.fill, at(0.6, 2.4, 4.0), at(0.4, 1.2, -2.2), 12); aim(rig.rim, at(3, 3.6, -3.8), at(0, 0, -2), 0.9); },
    frame(t) {
      this.word.on(t, this.wordAt);
      blade.rotation.x = 0.06 * Math.sin(TAU * 0.4 * t);
      bulbs.forEach((b, i) => { const k = 0.85 + 0.15 * Math.sin(TAU * 0.7 * t + i * 1.3); b.material.color.setRGB(1.7 * k, 1.15 * k, 0.55 * k); });
    },
  };
}

// ════════ CALENDAR: a week planner on the wall; event cards pop into slots on cue
export function calendar(parent, { wall = 'butter', title = 'THIS WEEK', days = ['MON', 'TUE', 'WED', 'THU', 'FRI'], hours = ['9', '10', '11', '12', '1', '2', '3'] } = {}) {
  room(parent, { wall });
  const Z = -3.17, CX = 0, CY = 1.72, W = 1.7, H = 1.275, PW = 1200, PH = 900;
  const calTex = canvasTex(PW, PH, (g, w, h) => { const r = rng(501); g.fillStyle = '#e6dfd0'; g.fillRect(0, 0, w, h); speckle(g, w, h, r, 5000, 0.6, 1.6, ['#d4cbb8'], 0.3, 0.7); g.fillStyle = '#c8302a'; g.fillRect(0, 0, w, 130); g.fillStyle = '#FFF3DF'; g.font = `800 74px ${fonts.sans}`; g.fillText(title, 40, 92);
    const cw = (w - 120) / days.length; g.font = `800 40px ${fonts.sans}`; g.fillStyle = '#4a463f'; days.forEach((d, i) => g.fillText(d, 110 + i * cw + cw / 2 - 40, 190));
    g.strokeStyle = '#d0c6b4'; g.lineWidth = 3; for (let i = 0; i <= days.length; i++) { g.beginPath(); g.moveTo(110 + i * cw, 210); g.lineTo(110 + i * cw, h - 30); g.stroke(); }
    hours.forEach((s, i) => { const y = 250 + i * 92; g.beginPath(); g.moveTo(110, y); g.lineTo(w - 10, y); g.stroke(); g.fillStyle = '#8a857a'; g.font = `700 32px ${fonts.mono}`; g.fillText(s, 40, y + 14); }); });
  put(sheet(W, H, new THREE.MeshStandardMaterial({ map: calTex, roughness: 0.92 })), CX, CY, Z, parent);
  put(box(W + 0.04, 0.06, 0.04, mat.ink, 0.01), CX, CY + H / 2 + 0.02, Z + 0.02, parent);
  const cw = (W * (PW - 120)) / days.length / PW, x0 = CX - W / 2 + W * (110 / PW), events = [];
  return {
    focus: V(CX, CY, Z),
    // add(day, row, time, text, colour, t0, stamp?) — an event card pops into that slot at t0
    add(day, row, time, text, colour, t0, stamp = null) {
      const m = put(sheet(cw * 2.0, cw * 1.15, new THREE.MeshStandardMaterial({ map: canvasTex(420, 240, (g, w, h) => { g.fillStyle = colour; g.fillRect(0, 0, w, h); g.fillStyle = '#17161A'; g.font = `700 40px ${fonts.mono}`; g.fillText(time, 22, 54); g.font = `800 52px ${fonts.serif}`; g.fillText(text, 22, 128);
        if (stamp) { g.save(); g.translate(w - 170, h - 46); g.rotate(-0.12); g.strokeStyle = '#c8302a'; g.lineWidth = 7; g.strokeRect(-8, -38, 164, 54); g.fillStyle = '#c8302a'; g.font = `800 32px ${fonts.sans}`; g.fillText(stamp, 0, 2); g.restore(); } }, { edge: true }), roughness: 0.85 })),
        x0 + cw * day + cw * 0.5, CY + H / 2 - H * ((250 + row * 92 - 40) / PH), Z + 0.012, parent); m.castShadow = true;
      events.push({ m, t0, base: m.position.clone(), n: events.length });
    },
    views: { wall: { from: [0.25, 1.52, 1.45], to: [0.1, 1.56, 1.05], look0: [0.02, 1.58, -3.1], look1: [0, 1.6, -3.1], fov: 40, ap: 0.0016 } },
    light(rig, at) { aim(rig.key, at(0.3, 3.4, -1.0), at(0, 1.6, -3.1), 7, 0xffe0c0, 0.85); aim(rig.accent, at(1.8, 2.4, -1.4), at(0.6, 0.8, -1.85), 8, 0xc8b0ff, 0.8); aim(rig.fill, at(0.4, 2.4, 3.5), at(0, 1.4, -3.0), 10); aim(rig.rim, at(-3, 3.6, -3.8), at(0, 0, -2), 1.1); },
    frame(t) { events.forEach((e) => { const v = t - e.t0; e.m.visible = v > 0; e.m.scale.setScalar(grow(v, 3.4, 0.45)); e.m.rotation.z = 0.25 * (1 - settle(v, 3, 0.5)) * (e.n % 2 ? 1 : -1); e.m.position.z = e.base.z + 0.08 * (1 - settle(v, 3, 0.6)); }); },
  };
}

// ════════ TANKS: glass tanks on a wall joined by glass pipes; tokens flow from the top tank down. Labels are yours.
export function tanks(parent, { wall = 'oat', names = ['NEW', 'TALKING', 'DONE'], colours = [0xd9653b, 0x5bc6d8, 0x58c08a] } = {}) {
  room(parent, { wall });
  const Z = -2.6, spots = [[-0.5, 2.05], [0.5, 1.35], [-0.5, 0.65]];
  const plate = (text, w, h, o) => sheet(w, h, new THREE.MeshStandardMaterial({ map: label(text, { w: 512, h: Math.round((512 * h) / w), ...o }), roughness: 0.75 }));
  const made = names.slice(0, 3).map((name, i) => { const [x, y] = spots[i], g = group(parent, x, y, Z); put(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.52, 32, 1, true), mat.glass), 0, 0, 0, g);
    put(tube(0.33, 0.33, 0.07, mat.brass, 32), 0, 0.29, 0, g); put(tube(0.33, 0.33, 0.07, mat.brass, 32), 0, -0.29, 0, g);
    const liquid = put(tube(0.28, 0.28, 0.2, paint(colours[i], { map: null, rough: 0.3, transparent: true, opacity: 0.6 }), 32), 0, -0.15, 0, g);
    put(plate(name, 0.46, 0.12, { bg: '#17161A', fg: '#FFF3DF', border: '#d8b25a', size: 70 }), 0, 0.12, 0.315, g); return { g, liquid }; });
  const pipes = [[spots[0], spots[1]], [spots[1], spots[2]]].map(([[x0, y0], [x1, y1]]) => { const a = y0 - 0.29, b = y1 + 0.29, curve = new THREE.CatmullRomCurve3([V(x0, a, Z), V(x0, (a + b) / 2 + 0.02, Z), V(x1, (a + b) / 2 - 0.02, Z), V(x1, b, Z)]); parent.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.07, 14, false), mat.glass)); return curve; });
  put(tube(0.08, 0.08, 0.6, mat.brass, 16), -0.5, 2.62, Z, parent); put(tube(0.08, 0.08, 0.45, mat.brass, 16), -0.5, 0.2, Z, parent);
  const wheel = group(parent, -0.5, 0.3, Z + 0.12); put(new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.022, 10, 32), paint(0xd9342b, { map: null, rough: 0.4 })), 0, 0, 0, wheel).castShadow = true; for (let i = 0; i < 4; i++) put(box(0.26, 0.02, 0.02, paint(0xd9342b, { map: null }), 0), 0, 0, 0, wheel).rotation.z = (i / 4) * Math.PI;
  const tokens = [0x6c8ef5, 0x58c08a, 0xf08bb4, 0xe8d6a8, 0xa98bea, 0xe58a5c, 0x5bc6d8, 0xf09a5b].map((c, i) => { const g = group(parent, 0, 0, Z); put(box(0.12, 0.1, 0.1, paint(c), 0.02), 0, 0, 0, g); [-0.025, 0.025].forEach((x) => put(box(0.014, 0.022, 0.01, mat.ink, 0), x, 0.012, 0.052, g)); return { g, i }; });
  return {
    focus: V(0, 1.35, Z), flowAt: 0,
    views: { wall: { from: [0.05, 1.5, 2.9], to: [-0.05, 1.47, 2.5], look0: [-0.05, 1.38, -2.6], look1: [-0.06, 1.37, -2.6], fov: 42, ap: 0.0018 } },
    light(rig, at) { aim(rig.key, at(0.2, 3.4, -0.8), at(0, 1.2, -2.6), 13, 0xffe0c0, 0.9); aim(rig.accent, at(-2.2, 2.6, -1.0), at(0, 1.3, -2.6), 8, 0x8fd0ff, 0.8); aim(rig.fill, at(0.6, 2.2, 3.5), at(0, 1.2, -2.6), 10); aim(rig.rim, at(3, 3.6, -3.8), at(0, 0, -2), 1.1); },
    frame(t) {
      const u = t - this.flowAt; wheel.rotation.z = -Math.max(0, u) * 4.5;
      made.forEach((tk, i) => { const k = clamp(u / 1.2); tk.liquid.scale.y = 0.6 + 0.5 * (i === 0 ? 1 - k * 0.4 : k * (i === 1 ? 0.6 : 0.9)); tk.liquid.position.y = -0.24 + 0.1 * tk.liquid.scale.y; });
      tokens.forEach((b) => { b.g.visible = u > 0; if (u <= 0) return; const ph = (u * 0.95 + b.i / tokens.length) % 1, seg = ph < 0.5 ? 0 : 1, p = pipes[seg].getPointAt(ease.both((ph % 0.5) / 0.5)); b.g.position.copy(p); b.g.rotation.set(0, 0, Math.sin(ph * TAU * 2) * 0.4); });
    },
  };
}

// ════════ BENCH: a maker's workbench under a hanging lamp, a pegboard of tools behind it, a stool. The place for close-up
// object stories: something to open, light up, take apart or stack. Build your object on the top (y = s.TOP, centre s.at).
//   handles: TOP, centre (V on the top), host + hostYaw (Bix beside the bench: wide view only), peek + peekYaw (a small Bix
//            standing ON the bench, scale ~0.32, in frame in every view), lampAt (the lamp swing time)
//   views: top (high, looking down at the bench) · close (low macro across the top) · wide (bench, Bix and the wall)
export function bench(parent, { wall = 'sage', board = 0xd8c9a8, top = 0xb7834f } = {}) {
  room(parent, { wall });
  const TOP = 0.92, Z = -1.15, BW = 2.3, BD = 1.0;
  put(box(BW, 0.08, BD, paint(top), 0.02), 0, TOP - 0.04, Z, parent);
  put(box(BW - 0.1, 0.12, 0.06, mat.woodDark, 0.01), 0, TOP - 0.14, Z + BD / 2 - 0.05, parent);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => put(box(0.08, TOP - 0.08, 0.08, mat.woodDark, 0.01), sx * (BW / 2 - 0.08), (TOP - 0.08) / 2, Z + sz * (BD / 2 - 0.08), parent));
  put(box(BW - 0.2, 0.04, BD - 0.2, mat.wood, 0.01), 0, 0.22, Z, parent);
  const pegTex = canvasTex(1024, 512, (g, w, h) => { g.fillStyle = '#' + board.toString(16).padStart(6, '0'); g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(40,28,16,.45)'; for (let y = 24; y < h; y += 40) for (let x = 24; x < w; x += 40) { g.beginPath(); g.arc(x, y, 5, 0, TAU); g.fill(); } speckle(g, w, h, rng(91), 900, 0.6, 1.6, ['#ffffff', '#8a7a60'], 0.1, 0.35); }, { edge: true });
  put(box(2.6, 1.3, 0.03, new THREE.MeshStandardMaterial({ map: pegTex, roughness: 0.9 }), 0.01), 0, 1.75, -3.17, parent);
  const tool = (w, h, col, x, y, rz = 0) => { const m = put(box(w, h, 0.03, paint(col), 0.01), x, y, -3.13, parent); m.rotation.z = rz; return m; };
  tool(0.06, 0.42, 0x2b2d33, -1.0, 1.85); tool(0.16, 0.06, 0xc0603a, -1.0, 2.05); tool(0.05, 0.36, 0xd8b25a, -0.7, 1.8, 0.1); tool(0.3, 0.05, 0x2b2d33, -0.36, 2.1, -0.2);
  tool(0.22, 0.22, 0xd9653b, 0.55, 1.78); tool(0.05, 0.45, 0x5e3620, 0.9, 1.82); tool(0.4, 0.04, 0xb9bec8, 1.05, 2.15, 0.15);
  plant(parent, -1.0, TOP, Z - 0.3, 0.8); const cup = mug(parent, 0.98, TOP, Z - 0.28, 0x2f8f83);
  const stool = group(parent, -1.55, 0, Z + 0.6); put(tube(0.2, 0.2, 0.05, mat.wood, 28), 0, 0.6, 0, stool); [0, 1, 2].forEach((i) => { const l = put(tube(0.02, 0.025, 0.6, mat.woodDark, 8), 0.14 * Math.cos(i * 2.1), 0.3, 0.14 * Math.sin(i * 2.1), stool); l.rotation.z = 0.1 * Math.cos(i * 2.1); });
  const LAMP = V(0, 2.35, Z + 0.05);
  put(box(0.012, 1.6, 0.012, mat.ink, 0), LAMP.x, LAMP.y + 0.95, LAMP.z, parent);
  const shade = group(parent, LAMP.x, LAMP.y, LAMP.z);
  put(new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.22, 40, 1, true), paint(0x2f6f5e, { side: THREE.DoubleSide, rough: 0.5 })), 0, 0.08, 0, shade);
  put(new THREE.Mesh(new THREE.SphereGeometry(0.06, 20, 14), lit(2.8, 2.0, 1.2)), 0, -0.02, 0, shade);
  const pool = put(sheet(2.0, 1.4, lit(0.36, 0.22, 0.1, { map: tex.blob, transparent: true, add: true })), 0, TOP + 0.003, Z, parent); pool.rotation.x = -Math.PI / 2; pool.renderOrder = 2;
  const s = {
    TOP, at: V(0, TOP, Z), centre: V(0, TOP, Z), host: V(1.55, 0, Z + 0.15), hostYaw: -1.05, peek: V(0.5, TOP, Z - 0.28), peekYaw: -0.6, lampAt: -9, cup, focus: V(0, TOP + 0.15, Z),
    views: {
      top: { from: [0.2, 2.25, 1.25], to: [0.05, 2.1, 1.05], look0: [0, TOP + 0.05, Z - 0.05], look1: [0, TOP + 0.05, Z], fov: 40, ap: 0.0018 },
      close: { from: [-0.35, TOP + 0.38, 0.35], to: [-0.15, TOP + 0.34, 0.2], look0: [0, TOP + 0.12, Z], look1: [0, TOP + 0.12, Z], fov: 40, ap: 0.003 },
      wide: { from: [0.35, 1.75, 2.75], to: [0.2, 1.68, 2.35], look0: [0.2, 1.05, -1.4], look1: [0.25, 1.05, -1.4], fov: 40, ap: 0.002 },
    },
    light(rig, at) { aim(rig.key, at(0, 2.3, Z + 0.1), at(0, TOP, Z), 14, 0xffd9a8, 0.9); aim(rig.accent, at(-2.2, 2.4, -0.4), at(0, TOP, Z), 6, 0x9ab8ff, 0.7); aim(rig.fill, at(0.4, 2.4, 3.6), at(0, 1.0, Z), 10); aim(rig.rim, at(3, 3.6, -3.8), at(0, 0, -1), 1.1); },
    frame(t) { shade.rotation.z = 0.06 * Math.sin(TAU * 0.35 * t) + 0.18 * jolt(t - s.lampAt, 2.2, 0.35); cup.steam(t); },
  };
  return s;
}

// the two bigger places live in places.js: a warm product table for close-ups and a model city at dusk
export { studio, city } from './places.js';
