// The lit-room toolbox: seeded canvas textures, the house materials, primitives, text-on-canvas (labels, neon, cards,
// screens) and a few drawn icons. Shots reach it as k.kit (k.kit.box(...), k.kit.mat.wood, k.kit.label('OPEN')).
// Everything is seeded: the same reel renders the same pixels on every machine and in any frame order.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { rng, TAU, lerp } from '../runtime/maths.js';

let ANISO = 8;

// a canvas → texture. draw(g, w, h) paints once; keep the texture to repaint live screens (tex.paint(fn) then it updates)
export function canvasTex(w, h, draw, { repeat = [1, 1], color = true, edge = false } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw && draw(g, w, h);
  const tex = new THREE.CanvasTexture(c);
  if (color) tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = edge ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.anisotropy = ANISO;
  tex.paint = (fn) => { fn(g, w, h); tex.needsUpdate = true; };
  tex.ctx = g;
  return tex;
}

// scatter soft dots (tiling-safe): the speckle that makes painted surfaces read as real
export function speckle(g, w, h, rand, count, r0, r1, colours, a0, a1) {
  for (let i = 0; i < count; i++) {
    const x = rand() * w, y = rand() * h, r = r0 + rand() * (r1 - r0);
    g.globalAlpha = a0 + rand() * (a1 - a0);
    g.fillStyle = colours[(rand() * colours.length) | 0];
    for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
      const X = x + ox, Y = y + oy;
      if (X + r < 0 || X - r > w || Y + r < 0 || Y - r > h) continue;
      g.beginPath(); g.arc(X, Y, r, 0, TAU); g.fill();
    }
  }
  g.globalAlpha = 1;
}

// the surface library (built once per page, after the renderer exists)
export const tex = {};
function buildSurfaces() {
  tex.grain = canvasTex(512, 512, (g, w, h) => { const r = rng(11); g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); speckle(g, w, h, r, 260, 10, 60, ['#e7e0d6', '#f3eee6', '#dad1c4'], 0.08, 0.28); speckle(g, w, h, r, 2600, 0.6, 1.8, ['#c9bfb0', '#ffffff'], 0.25, 0.6); });
  tex.roughness = canvasTex(512, 512, (g, w, h) => { const r = rng(12); g.fillStyle = 'rgb(200,200,200)'; g.fillRect(0, 0, w, h); speckle(g, w, h, r, 420, 8, 50, ['rgb(140,140,140)', 'rgb(235,235,235)'], 0.15, 0.35); }, { color: false });
  tex.planks = canvasTex(1024, 1024, (g, w, h) => {
    const r = rng(21), n = 16, pw = w / n;
    for (let i = 0; i < n; i++) {
      const x0 = i * pw, runs = []; let left = h;
      while (left > 0) { const L = Math.min(left, h * (0.3 + r() * 0.45)); runs.push(L); left -= L; }
      let y = r() * h;
      for (const L of runs) {
        const v = 128 + r() * 34, col = `rgb(${Math.round(v + 46)},${Math.round(v - 8)},${Math.round(v - 58)})`;
        for (const off of [0, -h, h]) {
          const Y = y + off; if (Y > h || Y + L < 0) continue;
          g.fillStyle = col; g.fillRect(x0, Y, pw, L);
          g.fillStyle = 'rgba(40,18,6,.55)'; g.fillRect(x0, Y, pw, 3);
          for (let k = 0; k < 9; k++) {
            g.strokeStyle = `rgba(60,28,10,${0.05 + r() * 0.1})`; g.lineWidth = 1 + r() * 2;
            const gx = x0 + 4 + r() * (pw - 8);
            g.beginPath(); g.moveTo(gx, Y); g.bezierCurveTo(gx + (r() - 0.5) * 8, Y + L / 3, gx + (r() - 0.5) * 8, Y + (2 * L) / 3, gx + (r() - 0.5) * 6, Y + L); g.stroke();
          }
        }
        y = (y + L) % h;
      }
      g.fillStyle = 'rgba(30,12,4,.75)'; g.fillRect(x0, 0, 3, h);
    }
    speckle(g, w, h, r, 5200, 0.6, 2.2, ['#fff7ea', '#f2e4cf'], 0.12, 0.55);
  }, { repeat: [4, 4] });
  tex.cork = canvasTex(512, 512, (g, w, h) => { const r = rng(41); g.fillStyle = '#b97b49'; g.fillRect(0, 0, w, h); speckle(g, w, h, r, 5200, 0.8, 2.6, ['#8a5530', '#d49b66', '#6e4124'], 0.3, 0.85); });
  tex.brick = canvasTex(1024, 1024, (g, w, h) => {
    const r = rng(43), bw = 128, bh = 52; g.fillStyle = '#5a2f2a'; g.fillRect(0, 0, w, h);
    for (let row = 0; row < h / bh; row++) for (let col = -1; col < w / bw + 1; col++) {
      const x = col * bw + (row % 2 ? bw / 2 : 0), v = 120 + r() * 40;
      g.fillStyle = `rgb(${v + 40},${v * 0.45 + 10},${v * 0.36})`; g.fillRect(x + 4, row * bh + 4, bw - 8, bh - 8);
    }
    speckle(g, w, h, r, 3000, 0.8, 3, ['#2c1512', '#c47a62'], 0.15, 0.5);
  }, { repeat: [3, 3] });
  tex.nightSky = canvasTex(512, 560, (g, w, h) => {
    const r = rng(51); g.fillStyle = '#17215c'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 80; i++) { g.globalAlpha = 0.35 + r() * 0.65; g.fillStyle = '#ffffff'; g.beginPath(); g.arc(r() * w, r() * h, 0.9 + r() * 2, 0, TAU); g.fill(); }
    g.globalAlpha = 1; g.fillStyle = '#fff3d2'; g.beginPath(); g.arc(w * 0.68, h * 0.27, 52, 0, TAU); g.fill();
    g.fillStyle = '#17215c'; g.beginPath(); g.arc(w * 0.68 + 24, h * 0.27 - 12, 46, 0, TAU); g.fill();
  }, { edge: true });
  tex.beam = canvasTex(256, 512, (g, w, h) => { for (let y = 0; y < h; y++) { const k = y / h, half = lerp(0.26, 0.5, k) * w; g.fillStyle = `rgba(255,255,255,${(1 - k) ** 1.6 * 0.9})`; g.fillRect(w / 2 - half, y, half * 2, 1); } }, { edge: true });
  tex.blob = canvasTex(256, 256, (g, w, h) => { const rg = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = rg; g.fillRect(0, 0, w, h); }, { edge: true });
  tex.tread = canvasTex(256, 64, (g, w, h) => { g.fillStyle = '#26272d'; g.fillRect(0, 0, w, h); g.fillStyle = '#3a3c44'; for (let x = 0; x < w; x += 32) g.fillRect(x, 0, 14, h); }, { repeat: [6, 1] });
}

// a painted wall: base colour + darker/lighter blotches + fine speckle
export const wallpaper = (base, dark, light, seed, repeat = [4, 2]) => canvasTex(1024, 1024, (g, w, h) => {
  const r = rng(seed); g.fillStyle = base; g.fillRect(0, 0, w, h);
  speckle(g, w, h, r, 170, 40, 170, [dark, light, base], 0.14, 0.32);
  speckle(g, w, h, r, 4200, 0.6, 1.7, [dark, light], 0.22, 0.55);
}, { repeat });

// ── materials ──
export const paint = (color, o = {}) => new THREE.MeshStandardMaterial({
  color, map: o.map === undefined ? tex.grain : o.map, roughness: o.rough ?? 0.78, roughnessMap: o.rmap === undefined ? tex.roughness : o.rmap,
  metalness: o.metal ?? 0, side: o.side ?? THREE.FrontSide, transparent: !!o.transparent, opacity: o.opacity ?? 1,
  emissive: o.emissive ?? 0x000000, emissiveIntensity: o.ei ?? 1,
});
// self-lit (screens, bulbs, neon, glowing windows): r g b above 1 bloom
export const lit = (r, g, b, o = {}) => new THREE.MeshBasicMaterial({
  color: new THREE.Color(r, g, b), map: o.map || null, transparent: !!o.transparent, depthWrite: !o.transparent,
  side: o.side ?? THREE.FrontSide, blending: o.add ? THREE.AdditiveBlending : THREE.NormalBlending, opacity: o.opacity ?? 1,
});
export const mat = {};
function buildMaterials() {
  Object.assign(mat, {
    wood: paint(0x8a5534), woodDark: paint(0x5e3620), woodLight: paint(0xa9744a), navy: paint(0x232c5c), cream: paint(0xf1ece2),
    ink: paint(0x141418, { rough: 0.45 }), red: paint(0xc8302a, { map: null, rough: 0.5 }), brass: paint(0xd8b25a, { metal: 0.75, rough: 0.35, map: null }),
    steel: paint(0xb9bec8, { metal: 0.8, rough: 0.3, map: null }), charcoal: paint(0x2b2d33, { rough: 0.4 }), paper: paint(0xfbf8f1, { rough: 0.9 }),
    green: paint(0x2f9e5b, { map: null, rough: 0.55 }), leaf: paint(0x3f8a4f), terracotta: paint(0xc0603a), mugWhite: paint(0xf2ede4),
    glass: new THREE.MeshStandardMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.22, roughness: 0.06, metalness: 0.1, depthWrite: false }),
  });
}

// ── primitives (every mesh casts + receives shadows) ──
export function box(w, h, d, material, round = 0.02) {
  const r = Math.min(round, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
  const m = new THREE.Mesh(r > 0.002 ? new RoundedBoxGeometry(w, h, d, 3, r) : new THREE.BoxGeometry(w, h, d), material);
  m.castShadow = m.receiveShadow = true; return m;
}
export function tube(rTop, rBottom, h, material, seg = 28) { const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, seg), material); m.castShadow = m.receiveShadow = true; return m; }
export function ball(r, material, seg = 18) { const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(8, seg * 0.7)), material); m.castShadow = true; return m; }
export function sheet(w, h, material) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material); m.receiveShadow = true; return m; }
export function put(obj, x, y, z, parent) { obj.position.set(x, y, z); parent && parent.add(obj); return obj; }
export function group(parent, x = 0, y = 0, z = 0) { const g = new THREE.Group(); g.position.set(x, y, z); parent && parent.add(g); return g; }
export function contact(w, d, opacity = 0.35) {          // a soft contact shadow on the floor under something
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: tex.blob, color: 0x000000, transparent: true, opacity, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; return m;
}

// ── text on canvas ──
const FONT = { sans: "'Inter', 'Fallback', sans-serif", serif: "'Playfair Display', 'Fallback', serif", mono: "'JetBrains Mono', 'Fallback', monospace" };
export const fonts = FONT;
export function label(text, o = {}) {                     // a rounded plate with one line of text
  const { w = 512, h = 128, bg = '#FBF7EE', fg = '#17161A', border = '#17161A', bw = 8, radius = 18, size = 64, weight = 800, face = 'sans' } = o;
  return canvasTex(w, h, (g) => {
    g.fillStyle = bg; g.beginPath(); g.roundRect(bw / 2, bw / 2, w - bw, h - bw, radius); g.fill();
    if (bw) { g.strokeStyle = border; g.lineWidth = bw; g.stroke(); }
    let s = size; g.font = `${weight} ${s}px ${FONT[face]}`;
    while (g.measureText(text).width > w - bw * 2 - 24 && s > 18) { s -= 2; g.font = `${weight} ${s}px ${FONT[face]}`; }
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 4);
  }, { edge: true });
}
export function neon(text, { w = 1100, h = 300, size = 214 } = {}) {      // white stroke lettering: tint it with a lit() material
  return canvasTex(w, h, (g) => {
    let s = size; g.font = `800 ${s}px ${FONT.sans}`;
    while (g.measureText(text).width > w * 0.92 && s > 30) { s -= 4; g.font = `800 ${s}px ${FONT.sans}`; }
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round'; g.strokeStyle = '#ffffff'; g.lineWidth = Math.max(10, s * 0.08);
    g.strokeText(text, w / 2, h / 2 + 10);
  }, { edge: true });
}
// a pinned paper card: coloured header, an optional icon, 1–3 lines in the serif
export function card({ w = 620, h = 440, title, lines = [], icon, seed = 1, head = '#D9653B', bg = '#fbf8f1', titleSize = 52, lineSize = 50, face = 'serif', textX = 196 } = {}) {
  return canvasTex(w, h, (g) => {
    const r = rng(seed); g.fillStyle = bg; g.fillRect(0, 0, w, h); speckle(g, w, h, r, Math.round((w * h) / 170), 0.6, 1.6, ['#e7e0d3'], 0.3, 0.7);
    const top = title ? Math.round(titleSize * 1.85) : 0;
    if (title) { g.fillStyle = head; g.fillRect(0, 0, w, top); g.fillStyle = '#FFF3DF'; g.font = `800 ${titleSize}px ${FONT.sans}`; g.textBaseline = 'middle'; g.textAlign = 'center'; g.fillText(title, w / 2 + (icon ? 20 : 0), titleSize * 0.96); g.textAlign = 'left'; }
    if (icon) icon(g, 98, title ? h * 0.6 : h / 2);
    g.fillStyle = '#1b1a20'; g.font = `800 ${lineSize}px ${FONT[face]}`; g.textBaseline = 'alphabetic';
    const y0 = top + (h - top) / 2 - ((lines.length - 1) * lineSize * 1.3) / 2 + lineSize * 0.36;
    lines.forEach((s, i) => g.fillText(s, icon ? textX : 32, y0 + i * lineSize * 1.3));
    g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4);
  }, { edge: true });
}
// a live screen: returns { tex, draw(fn) } — fn(g, w, h) repaints only when you call draw (cache your own state key)
export function screen(w = 900, h = 1300) { const t = canvasTex(w, h, null, { edge: true }); return { tex: t, draw: (fn) => t.paint(fn), w, h }; }

export const icons = {
  parcel: (g, x, y) => { g.save(); g.translate(x, y); g.lineJoin = 'round'; g.lineWidth = 7; g.strokeStyle = '#1b1a20'; g.fillStyle = '#d8a86a'; g.beginPath(); g.moveTo(-58, -22); g.lineTo(0, -48); g.lineTo(58, -22); g.lineTo(58, 42); g.lineTo(0, 66); g.lineTo(-58, 42); g.closePath(); g.fill(); g.stroke(); g.beginPath(); g.moveTo(-58, -22); g.lineTo(0, 4); g.lineTo(58, -22); g.moveTo(0, 4); g.lineTo(0, 66); g.stroke(); g.restore(); },
  target: (g, x, y) => { g.save(); g.translate(x, y); [[62, '#D9653B'], [44, '#fbf8f1'], [26, '#D9653B'], [10, '#fbf8f1']].forEach(([r, c]) => { g.fillStyle = c; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill(); }); g.lineWidth = 6; g.strokeStyle = '#1b1a20'; g.beginPath(); g.arc(0, 0, 62, 0, TAU); g.stroke(); g.restore(); },
  clock: (g, x, y) => { g.save(); g.translate(x, y); g.fillStyle = '#fbf8f1'; g.strokeStyle = '#1b1a20'; g.lineWidth = 7; g.beginPath(); g.arc(0, 0, 58, 0, TAU); g.fill(); g.stroke(); g.lineCap = 'round'; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -38); g.moveTo(0, 0); g.lineTo(28, 10); g.stroke(); g.restore(); },
  star: (g, x, y, r = 40, col = '#FFF3DF') => { g.save(); g.translate(x, y); g.strokeStyle = col; g.lineCap = 'round'; g.lineWidth = r * 0.22; for (let i = 0; i < 4; i++) { g.rotate(Math.PI / 4); g.beginPath(); g.moveTo(-r, 0); g.lineTo(r, 0); g.stroke(); } g.restore(); },
  check: (g, x, y, r = 62) => { g.save(); g.translate(x, y); g.fillStyle = '#1f9a55'; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = r * 0.26; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); g.moveTo(-r * 0.48, r * 0.03); g.lineTo(-r * 0.13, r * 0.38); g.lineTo(r * 0.5, -r * 0.38); g.stroke(); g.restore(); },
};

export function buildKit(renderer) {
  ANISO = renderer.capabilities.getMaxAnisotropy();
  buildSurfaces(); buildMaterials();
  return { canvasTex, speckle, tex, wallpaper, paint, lit, mat, box, tube, ball, sheet, put, group, contact, label, neon, card, screen, icons, fonts };
}
