// Two bigger places for the set builders (reached as k.rooms.studio / k.rooms.city, same contract as parts/rooms.js:
// .views, .light(rig, at), .focus, .frame(t), plus handles).
//
//   studio · a warm product table for close-up object stories: a walnut top with a felt mat, a brass gooseneck lamp
//            throwing a pool of light, a pencil cup and a plant against warm plaster. Pair it with k.gear.phone / hand / pen.
//   city   · a model city at dusk: a road grid with lane marks and crossings, plaster blocks with lit windows, a park with a
//            pond, a clock-tower landmark, an airport with a runway, apron and control tower, cars that drive the lanes,
//            a jet that can take off, and routes that draw themselves along the streets.
import * as THREE from 'three';
import { canvasTex, speckle, paint, lit, mat, tex, box, tube, ball, sheet, put, group, contact, label, fonts } from './kit3d.js';
import { clamp, lerp, ease, jolt, settle, noise01, rng, TAU } from '../runtime/maths.js';
import { room, plant, mug } from './rooms.js';
import { traffic, jet, trail, car } from './gear.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const aim = (l, p, target, intensity, color, angle) => { l.position.copy(p); if (l.target) l.target.position.copy(target); l.intensity = intensity; if (color != null) l.color.set(color); if (angle != null) l.angle = angle; };

// ════════ STUDIO ════════
export function studio(parent, { wall = 'oat', mat: matColor = 0x6c8c76, top = 0x7a4a2e } = {}) {
  room(parent, { wall, lamps: false });
  const TOP = 0.78, Z = -0.95, TW = 2.4, TD = 1.2;
  const walnut = canvasTex(1024, 512, (g, w, h) => {
    const r = rng(41); g.fillStyle = '#' + top.toString(16).padStart(6, '0'); g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) { g.strokeStyle = `rgba(30,14,4,${0.06 + r() * 0.12})`; g.lineWidth = 1 + r() * 3; const y = r() * h; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + (r() - 0.5) * 30, w * 0.7, y + (r() - 0.5) * 30, w, y + (r() - 0.5) * 20); g.stroke(); }
    speckle(g, w, h, r, 900, 0.6, 1.6, ['#a06a44', '#4a2814'], 0.15, 0.35);
  });
  put(box(TW, 0.06, TD, new THREE.MeshStandardMaterial({ map: walnut, roughness: 0.42 }), 0.02), 0, TOP - 0.03, Z, parent);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => put(box(0.07, TOP - 0.06, 0.07, mat.woodDark, 0.01), sx * (TW / 2 - 0.1), (TOP - 0.06) / 2, Z + sz * (TD / 2 - 0.1), parent));
  const felt = canvasTex(512, 512, (g, w, h) => { g.fillStyle = '#' + matColor.toString(16).padStart(6, '0'); g.fillRect(0, 0, w, h); speckle(g, w, h, rng(42), 4200, 0.5, 1.4, ['rgba(255,255,255,.35)', 'rgba(0,0,0,.3)'], 0.15, 0.35); g.strokeStyle = 'rgba(255,255,255,.35)'; g.setLineDash([10, 9]); g.lineWidth = 4; g.strokeRect(18, 18, w - 36, h - 36); });
  const feltMesh = put(sheet(1.25, 0.82, new THREE.MeshStandardMaterial({ map: felt, roughness: 0.98 })), 0, TOP + 0.002, Z + 0.05, parent); feltMesh.rotation.x = -Math.PI / 2;
  // the gooseneck lamp: a weighted brass base, two arms, a cone shade aimed at the mat, a warm pool
  const LB = V(-0.82, TOP, Z - 0.32), lamp = group(parent, LB.x, LB.y, LB.z);
  put(tube(0.1, 0.12, 0.035, mat.brass, 32), 0, 0.017, 0, lamp);
  const arm1 = put(tube(0.012, 0.012, 0.55, mat.brass, 10), 0.08, 0.29, 0.05, lamp); arm1.rotation.z = -0.32;
  const arm2 = put(tube(0.011, 0.011, 0.42, mat.brass, 10), 0.3, 0.58, 0.12, lamp); arm2.rotation.set(0.35, 0, -1.15);
  const head = group(lamp, 0.5, 0.62, 0.2); head.rotation.set(0.5, 0, -0.9);
  put(new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.17, 32, 1, true), paint(0x2f6f5e, { side: THREE.DoubleSide, rough: 0.45, map: null })), 0, -0.04, 0, head);
  put(new THREE.Mesh(new THREE.SphereGeometry(0.04, 16, 12), lit(3.0, 2.2, 1.3)), 0, -0.1, 0, head);
  const pool = put(sheet(1.6, 1.2, lit(0.42, 0.26, 0.12, { map: tex.blob, transparent: true, add: true })), 0.05, TOP + 0.004, Z + 0.02, parent); pool.rotation.x = -Math.PI / 2; pool.renderOrder = 2;
  put(new THREE.PointLight(0xffc488, 2.2, 3.2, 2), -0.2, TOP + 0.55, Z + 0.05, parent);
  // a pencil cup with pencils, a plant, a mug at the back of the table
  const cup = group(parent, 0.82, TOP, Z - 0.34); put(tube(0.06, 0.055, 0.14, paint(0xd9653b, { map: null }), 24), 0, 0.07, 0, cup);
  [[0.015, 0.01, 0.15, 0xe3a21a], [-0.02, 0.005, -0.12, 0x3f6390], [0.0, -0.02, 0.05, 0x2f8f83]].forEach(([x, z, rz, c]) => { const p = put(tube(0.007, 0.007, 0.22, paint(c, { map: null }), 6), x, 0.17, z, cup); p.rotation.z = rz; });
  plant(parent, 1.02, TOP, Z - 0.2, 0.9); const m = mug(parent, -1.0, TOP, Z + 0.15, 0x2f8f83);
  // a framed print and a shelf on the wall behind (so the wide view isn't a bare wall)
  const art = canvasTex(400, 520, (g, w, h) => { g.fillStyle = '#f3ead8'; g.fillRect(0, 0, w, h); g.fillStyle = '#d9653b'; g.beginPath(); g.arc(200, 220, 110, 0, TAU); g.fill(); g.fillStyle = '#2f6f5e'; g.fillRect(60, 330, 280, 40); g.fillStyle = '#1b1a20'; g.font = `800 40px ${fonts.sans}`; g.textAlign = 'center'; g.fillText('MAKE IT', 200, 460); });
  put(box(0.62, 0.8, 0.03, mat.woodDark, 0.01), 0.75, 1.75, -3.17, parent); put(sheet(0.54, 0.7, new THREE.MeshStandardMaterial({ map: art, roughness: 0.8 })), 0.75, 1.75, -3.15, parent);
  put(box(1.1, 0.04, 0.22, mat.woodLight, 0.01), -0.7, 1.6, -3.08, parent);
  [[-1.0, 0xd9653b], [-0.88, 0x3f6390], [-0.76, 0xe3a21a], [-0.66, 0x2f8f83]].forEach(([x, c]) => put(box(0.08, 0.26, 0.17, paint(c, { map: null }), 0.01), x, 1.75, -3.08, parent));
  const s = {
    TOP, centre: V(0, TOP, Z + 0.05), at: V(0, TOP, Z + 0.05), peek: V(0.6, TOP, Z - 0.22), peekYaw: -0.55, host: V(1.5, 0, Z + 0.2), hostYaw: -1.0,
    focus: V(0, TOP + 0.05, Z + 0.05), lamp, cup: m,
    views: {
      hero: { from: [0.42, TOP + 0.46, Z + 1.15], to: [0.26, TOP + 0.42, Z + 1.0], look0: [0, TOP + 0.05, Z + 0.03], look1: [0, TOP + 0.05, Z + 0.05], fov: 34, ap: 0.0028 },
      top: { from: [0.06, TOP + 1.02, Z + 0.58], to: [0.02, TOP + 0.96, Z + 0.5], look0: [0, TOP, Z + 0.02], look1: [0, TOP, Z + 0.04], fov: 36, ap: 0.0022 },
      macro: { from: [-0.16, TOP + 0.26, Z + 0.46], to: [-0.08, TOP + 0.24, Z + 0.38], look0: [0, TOP + 0.03, Z + 0.04], look1: [0, TOP + 0.03, Z + 0.05], fov: 30, ap: 0.0042 },
      wide: { from: [0.35, 1.5, 2.1], to: [0.22, 1.45, 1.8], look0: [0, 0.98, -1.1], look1: [0.02, 0.98, -1.1], fov: 40, ap: 0.0018 },
    },
    light(rig, at) {
      aim(rig.key, at(-0.35, TOP + 1.1, Z + 0.2), at(0.05, TOP, Z + 0.05), 12, 0xffd2a0, 0.85);
      aim(rig.accent, at(1.8, 2.2, -2.6), at(0, TOP + 0.1, Z), 7, 0xa8c4ff, 0.7);
      aim(rig.fill, at(0.3, 2.0, 3.0), at(0, TOP, Z), 8);
      aim(rig.rim, at(2.5, 3.2, -3.6), at(0, TOP, Z), 1.0);
    },
    frame(t) { head.rotation.z = -0.9 + 0.02 * Math.sin(TAU * 0.3 * t); m.steam(t); },
  };
  return s;
}

// ════════ CITY ════════
// The city's own coordinates: metres of the model (a block is 3 m across, a tower up to 2 m tall, a car 0.2 m). Road
// centres run at x = -6 -3 0 3 6 and z = -6 -3 0 3; the airport lies north (z ≈ -8). Name a place with s.spot(name):
// 'airport' 'runway' 'tower' 'park' 'landmark' 'centre', or 'b0' … 'b11' for a block (row by row from the north-west).
const XS = [-6, -3, 0, 3, 6], ZS = [-6, -3, 0, 3], ROAD = 0.5, WALK = 0.16;
const PALETTE = ['#c9826b', '#9fb9a3', '#e0c27a', '#cdbb9b', '#8fa7c6', '#a3ad7a', '#d9a27e', '#b8a8c8'];
const SKIES = {
  dusk: ['#2c3a66', '#6b6aa0', '#e7a27a', '#f3c58e'], day: ['#5f8fc8', '#8db6e0', '#cfe2ee', '#eef2ea'], night: ['#0e1430', '#1c2448', '#3a3d68', '#57517a'],
};

export function city(parent, { mood = 'dusk', blocks: blockNames = [], landmark = true, airport = true, park = 4, trafficLanes = 12, seed = 7 } = {}) {
  const r = rng(seed), sky = SKIES[mood] || SKIES.dusk;
  // the sky: a big gradient dome; the far ground fades into its horizon colour
  const dome = canvasTex(64, 512, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, sky[0]); gr.addColorStop(0.42, sky[1]); gr.addColorStop(0.5, sky[2]); gr.addColorStop(0.56, sky[3]); gr.addColorStop(1, sky[3]); g.fillStyle = gr; g.fillRect(0, 0, w, h); }, { edge: true });
  put(new THREE.Mesh(new THREE.SphereGeometry(46, 32, 16), new THREE.MeshBasicMaterial({ map: dome, side: THREE.BackSide })), 0, 0, -2, parent);
  const far = canvasTex(512, 512, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, w * 0.12, w / 2, h / 2, w / 2); gr.addColorStop(0, '#57524c'); gr.addColorStop(0.75, '#6b6560'); gr.addColorStop(1, sky[3]); g.fillStyle = gr; g.fillRect(0, 0, w, h); }, { edge: true });
  const farMesh = put(sheet(92, 92, new THREE.MeshStandardMaterial({ map: far, roughness: 1 })), 0, -0.004, -2, parent); farMesh.rotation.x = -Math.PI / 2;

  // the ground map: asphalt grid, pavements, lane dashes, zebra crossings, the park, the airport apron and runway
  const GX0 = -7.5, GX1 = 7.5, GZ0 = -9.6, GZ1 = 4.4, PX = 2048, PZ = Math.round((PX * (GZ1 - GZ0)) / (GX1 - GX0));
  const X = (x) => ((x - GX0) / (GX1 - GX0)) * PX, Zp = (z) => ((z - GZ0) / (GZ1 - GZ0)) * PZ, S = PX / (GX1 - GX0);
  const parkBlock = park;
  const mapTex = canvasTex(PX, PZ, (g) => {
    g.fillStyle = '#6a655e'; g.fillRect(0, 0, PX, PZ);
    // blocks: pavement squares
    for (let row = 0; row < 3; row++) for (let col = 0; col < 4; col++) {
      const x0 = XS[col] + ROAD / 2, x1 = XS[col + 1] - ROAD / 2, z0 = ZS[row] + ROAD / 2, z1 = ZS[row + 1] - ROAD / 2, i = row * 4 + col;
      g.fillStyle = '#cfc6b4'; g.fillRect(X(x0), Zp(z0), (x1 - x0) * S, (z1 - z0) * S);
      if (i === parkBlock) { g.fillStyle = '#86a86e'; g.fillRect(X(x0 + WALK), Zp(z0 + WALK), (x1 - x0 - 2 * WALK) * S, (z1 - z0 - 2 * WALK) * S); g.fillStyle = '#d9cdb1'; g.lineWidth = 0.14 * S; g.strokeStyle = '#d9cdb1'; g.beginPath(); g.moveTo(X(x0 + WALK), Zp((z0 + z1) / 2)); g.bezierCurveTo(X(x0 + 1), Zp(z0 + 0.6), X(x1 - 1), Zp(z1 - 0.6), X(x1 - WALK), Zp((z0 + z1) / 2)); g.stroke(); g.fillStyle = '#7fb3d4'; g.beginPath(); g.ellipse(X((x0 + x1) / 2 + 0.5), Zp((z0 + z1) / 2 + 0.55), 0.55 * S, 0.32 * S, 0.3, 0, TAU); g.fill(); }
      else { g.fillStyle = '#b9b09d'; g.fillRect(X(x0 + WALK), Zp(z0 + WALK), (x1 - x0 - 2 * WALK) * S, (z1 - z0 - 2 * WALK) * S); }
    }
    // lane dashes and crossings
    g.strokeStyle = '#f1e2b8'; g.lineWidth = 0.025 * S; g.setLineDash([0.16 * S, 0.14 * S]);
    XS.forEach((x) => { g.beginPath(); g.moveTo(X(x), Zp(ZS[0] - ROAD / 2)); g.lineTo(X(x), Zp(ZS.at(-1) + ROAD / 2)); g.stroke(); });
    ZS.forEach((z) => { g.beginPath(); g.moveTo(X(XS[0] - ROAD / 2), Zp(z)); g.lineTo(X(XS.at(-1) + ROAD / 2), Zp(z)); g.stroke(); });
    g.setLineDash([]); g.fillStyle = 'rgba(245,238,220,.85)';
    XS.forEach((x) => ZS.forEach((z) => { for (let k = -2; k <= 2; k++) { g.fillRect(X(x + k * 0.09 - 0.03), Zp(z + ROAD / 2 + 0.02), 0.06 * S, 0.14 * S); g.fillRect(X(x + ROAD / 2 + 0.02), Zp(z + k * 0.09 - 0.03), 0.14 * S, 0.06 * S); } }));
    if (airport) {
      g.fillStyle = '#7b766f'; g.fillRect(X(-6.4), Zp(-9.2), 12.8 * S, 2.9 * S);                           // apron
      g.fillStyle = '#3c3a37'; g.fillRect(X(-6.0), Zp(-8.6), 12.0 * S, 0.74 * S);                           // runway
      g.fillStyle = '#f3efe4'; for (let x = -5.4; x < 5.6; x += 0.7) g.fillRect(X(x), Zp(-8.25), 0.36 * S, 0.035 * S);
      for (let k = 0; k < 6; k++) { g.fillRect(X(-5.9), Zp(-8.55 + k * 0.11), 0.36 * S, 0.06 * S); g.fillRect(X(5.54), Zp(-8.55 + k * 0.11), 0.36 * S, 0.06 * S); }
      g.font = `800 ${Math.round(0.36 * S)}px ${fonts.sans}`; g.textAlign = 'center'; g.save(); g.translate(X(-5.2), Zp(-8.23)); g.rotate(Math.PI / 2); g.fillText('09', 0, 0.12 * S); g.restore(); g.save(); g.translate(X(5.2), Zp(-8.23)); g.rotate(-Math.PI / 2); g.fillText('27', 0, 0.12 * S); g.restore();
      g.strokeStyle = '#e3c56a'; g.lineWidth = 0.03 * S; g.beginPath(); g.moveTo(X(-1.6), Zp(-8.2)); g.lineTo(X(-1.6), Zp(-7.0)); g.lineTo(X(1.8), Zp(-7.0)); g.stroke();
    }
    speckle(g, PX, PZ, rng(9), 9000, 0.6, 2.2, ['#57524c', '#857f77', '#f0e8d8'], 0.12, 0.3);
  });
  mapTex.wrapS = mapTex.wrapT = THREE.ClampToEdgeWrapping;
  const ground = put(sheet(GX1 - GX0, GZ1 - GZ0, new THREE.MeshStandardMaterial({ map: mapTex, roughness: 0.92 })), (GX0 + GX1) / 2, 0, (GZ0 + GZ1) / 2, parent); ground.rotation.x = -Math.PI / 2;

  // buildings: plaster blocks with window floors (lit at dusk / night), darker roofs, rooftop tanks and units
  const facade = PALETTE.map((col, ci) => {
    const lightOn = mood !== 'day';
    const base = canvasTex(128, 512, (g, w, h) => { g.fillStyle = col; g.fillRect(0, 0, w, h); for (let f = 0; f < 8; f++) for (let k = 0; k < 4; k++) { g.fillStyle = 'rgba(38,40,52,.85)'; g.fillRect(8 + k * 30, f * 64 + 18, 22, 32); g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(8 + k * 30, f * 64 + 16, 22, 3); } speckle(g, w, h, rng(60 + ci), 260, 0.5, 1.4, ['rgba(0,0,0,.25)', 'rgba(255,255,255,.2)'], 0.2, 0.4); });
    const glow = canvasTex(128, 512, (g, w, h) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); if (!lightOn) return; const rr = rng(80 + ci); for (let f = 0; f < 8; f++) for (let k = 0; k < 4; k++) if (rr() < 0.42) { g.fillStyle = rr() < 0.7 ? '#ffc477' : '#fff0c8'; g.fillRect(9 + k * 30, f * 64 + 19, 20, 30); } });
    return { base, glow, roof: paint(new THREE.Color(col).multiplyScalar(0.62).getHex(), { rough: 0.85 }) };
  });
  const blocks = [];
  for (let row = 0; row < 3; row++) for (let col = 0; col < 4; col++) {
    const i = row * 4 + col, x0 = XS[col] + ROAD / 2 + WALK + 0.05, x1 = XS[col + 1] - ROAD / 2 - WALK - 0.05, z0 = ZS[row] + ROAD / 2 + WALK + 0.05, z1 = ZS[row + 1] - ROAD / 2 - WALK - 0.05;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, name = blockNames[i] || `b${i}`;
    const b = { i, name, x: cx, z: cz, h: 0, towers: [] };
    blocks.push(b);
    if (landmark && i === 6) {                                                   // the landmark's plaza: paving, four trees, no towers
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz], k) => { const tg = group(parent, cx + sx * (x1 - x0) * 0.34, 0, cz + sz * (z1 - z0) * 0.34); put(tube(0.025, 0.035, 0.22, mat.woodDark, 6), 0, 0.11, 0, tg); put(ball(0.16, paint(k % 2 ? 0x4f8a50 : 0x6b9a46, { rough: 0.9 }), 12), 0, 0.34, 0, tg).scale.y = 1.15; put(contact(0.4, 0.4, 0.3), 0, 0.004, 0, tg); });
      b.h = 2.4; continue;
    }
    if (i === parkBlock) {
      for (let k = 0; k < 9; k++) { const tx = lerp(x0 + 0.2, x1 - 0.2, noise01(k * 3 + 1)), tz = lerp(z0 + 0.2, z1 - 0.2, noise01(k * 5 + 2)); const tg = group(parent, tx, 0, tz); put(tube(0.025, 0.035, 0.22, mat.woodDark, 6), 0, 0.11, 0, tg); const crown = put(ball(0.17 + 0.06 * noise01(k), paint(k % 3 ? 0x4f8a50 : 0x6b9a46, { rough: 0.9 }), 12), 0, 0.36, 0, tg); crown.scale.y = 1.15; put(contact(0.45, 0.45, 0.3), 0, 0.004, 0, tg); }
      continue;
    }
    const W2 = (x1 - x0) / 2, D2 = (z1 - z0) / 2;
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz], k) => {
      const centre = 1 - Math.min(1, Math.hypot(cx, cz + 1.5) / 7);
      const hgt = 0.45 + centre * 1.3 + noise01(i * 7 + k * 3 + seed) * 0.55, w = W2 * (0.78 + noise01(i + k * 11) * 0.16), d = D2 * (0.78 + noise01(i * 3 + k) * 0.16);
      const pc = (i * 3 + k * 5 + seed) % PALETTE.length, f = facade[pc], floors = Math.max(2, Math.round(hgt / 0.2));
      const map = f.base.clone(); map.repeat.set(1, floors / 8); map.needsUpdate = true;
      const em = f.glow.clone(); em.repeat.set(1, floors / 8); em.needsUpdate = true;
      const wallM = new THREE.MeshStandardMaterial({ map, emissiveMap: em, emissive: new THREE.Color(1, 1, 1), emissiveIntensity: mood === 'night' ? 1.2 : mood === 'dusk' ? 0.85 : 0, roughness: 0.85 });
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, d), [wallM, wallM, f.roof, f.roof, wallM, wallM]); m.castShadow = m.receiveShadow = true;
      put(m, cx + sx * W2 / 2, hgt / 2, cz + sz * D2 / 2, parent);
      put(box(w + 0.03, 0.035, d + 0.03, f.roof, 0.005), cx + sx * W2 / 2, hgt + 0.017, cz + sz * D2 / 2, parent);
      if (noise01(i * 13 + k) > 0.45) { const tk = group(parent, cx + sx * W2 / 2 + 0.1, hgt + 0.035, cz + sz * D2 / 2 - 0.08); put(tube(0.07, 0.07, 0.14, mat.woodDark, 12), 0, 0.12, 0, tk); [[-0.05, -0.05], [0.05, 0.05], [0.05, -0.05], [-0.05, 0.05]].forEach(([a, c]) => put(box(0.012, 0.06, 0.012, mat.charcoal, 0), a, 0.03, c, tk)); }
      else put(box(0.16, 0.07, 0.12, mat.steel, 0.01), cx + sx * W2 / 2 - 0.06, hgt + 0.07, cz + sz * D2 / 2 + 0.05, parent);
      b.h = Math.max(b.h, hgt); b.towers.push({ x: cx + sx * W2 / 2, z: cz + sz * D2 / 2, h: hgt });
    });
  }

  // the landmark: a brick clock tower with a copper roof and lit clock faces, on the centre block's plaza
  let clockHands = null;
  const LM = blocks[6] ? V(blocks[6].x, 0, blocks[6].z) : V(1.5, 0, -1.5);
  if (landmark) {
    blocks[6].landmark = true;
    const tw = group(parent, LM.x, 0, LM.z);
    const brick = new THREE.MeshStandardMaterial({ map: tex.brick, color: 0xd9a58a, roughness: 0.9 });
    put(box(0.46, 1.45, 0.46, brick, 0.02), 0, 0.725, 0, tw); put(box(0.56, 0.1, 0.56, paint(0xe8dcc4, { rough: 0.8 }), 0.01), 0, 1.5, 0, tw);
    put(box(0.52, 0.46, 0.52, brick, 0.02), 0, 1.78, 0, tw);
    const roof = put(new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.6, 4), paint(0x5f9c8a, { metal: 0.4, rough: 0.5, map: null })), 0, 2.31, 0, tw); roof.rotation.y = Math.PI / 4; roof.castShadow = true;
    const face = canvasTex(256, 256, (g, w) => { g.fillStyle = '#fff3dc'; g.beginPath(); g.arc(128, 128, 120, 0, TAU); g.fill(); g.strokeStyle = '#1b1a20'; g.lineWidth = 10; g.stroke(); g.fillStyle = '#1b1a20'; for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU; g.fillRect(128 + Math.sin(a) * 100 - 5, 128 - Math.cos(a) * 100 - 5, 10, 10); } }, { edge: true });
    clockHands = [];
    [0, Math.PI / 2, Math.PI, -Math.PI / 2].forEach((ry) => {
      const fg = group(tw, 0, 1.78, 0); fg.rotation.y = ry;
      put(new THREE.Mesh(new THREE.CircleGeometry(0.18, 32), lit(1.25, 1.12, 0.9, { map: face })), 0, 0, 0.265, fg);
      const hh = box(0.016, 0.12, 0.01, mat.ink, 0), mm = box(0.012, 0.17, 0.01, mat.ink, 0);
      hh.geometry.translate(0, 0.05, 0); mm.geometry.translate(0, 0.07, 0);                    // pivot the hands at the centre of the face
      put(hh, 0, 0, 0.272, fg); put(mm, 0, 0, 0.274, fg); clockHands.push({ hh, mm, fg });
    });
    put(contact(1.0, 1.0, 0.4), 0, 0.004, 0, tw);
    put(new THREE.PointLight(0xffd59a, 1.4, 2.2, 2), LM.x, 1.78, LM.z + 0.55, parent);
  }

  // the airport: terminal, a control tower, a jet on the runway (s.jet), taxi lights
  let tower = null;
  const RW = { from: V(-5.4, 0.06, -8.23), to: V(5.4, 0.06, -8.23) };
  const jetObj = airport ? jet(parent, { scale: 1.2 }) : null;
  const taxiLights = [];
  if (airport) {
    const term = group(parent, 0, 0, -6.85);
    put(box(3.6, 0.42, 0.7, paint(0xe8e2d4, { rough: 0.6 }), 0.03), 0, 0.21, 0, term);
    put(sheet(3.4, 0.22, lit(0.95, 0.85, 0.65)), 0, 0.24, -0.355, term).rotation.y = Math.PI;
    put(box(3.7, 0.05, 0.8, paint(0x5f9c8a, { metal: 0.3, rough: 0.5, map: null }), 0.01), 0, 0.45, 0, term);
    put(sheet(1.4, 0.18, new THREE.MeshStandardMaterial({ map: label('DEPARTURES', { w: 900, h: 116, size: 70, bg: '#1b1a20', fg: '#f3c25b', border: '#1b1a20' }), roughness: 0.7 })), 0, 0.58, 0.36, term);
    tower = group(parent, 3.4, 0, -7.0);
    put(tube(0.1, 0.13, 1.4, paint(0xe8e2d4, { rough: 0.7 }), 16), 0, 0.7, 0, tower);
    put(new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.2, 0.22, 8), [new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.85, 1.0) }), paint(0x2b2d33), paint(0x2b2d33)]), 0, 1.5, 0, tower);
    put(new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.05, 8), paint(0x2b2d33)), 0, 1.63, 0, tower);
    const beacon = put(ball(0.04, lit(3.0, 0.6, 0.4), 10), 0, 1.72, 0, tower); tower.beacon = beacon;
    put(contact(0.6, 0.6, 0.4), 0, 0.004, 0, tower);
    for (let x = -5.6; x <= 5.6; x += 0.8) [-8.62, -7.84].forEach((z) => taxiLights.push(put(ball(0.025, lit(1.8, 1.6, 0.9), 8), x, 0.03, z, parent)));
  }

  // the cars: lanes on the grid, driving on the right
  const ns = [], ew = [];
  XS.forEach((x, k) => { ns.push({ pts: [[x + 0.12, ZS[0] - 0.3], [x + 0.12, ZS.at(-1) + 0.3]], speed: 0.55 + 0.1 * (k % 3), cars: k % 2 ? 2 : 1, offset: k * 0.7 }); ns.push({ pts: [[x - 0.12, ZS.at(-1) + 0.3], [x - 0.12, ZS[0] - 0.3]], speed: 0.5 + 0.08 * (k % 2), cars: 1, offset: k * 1.3 }); });
  ZS.forEach((z, k) => { ew.push({ pts: [[XS[0] - 0.3, z - 0.12], [XS.at(-1) + 0.3, z - 0.12]], speed: 0.6, cars: 2, offset: k * 0.9 }); ew.push({ pts: [[XS.at(-1) + 0.3, z + 0.12], [XS[0] - 0.3, z + 0.12]], speed: 0.52, cars: k % 2 ? 2 : 1, offset: k * 1.7 }); });
  const lanes = []; for (let i = 0; i < Math.max(ns.length, ew.length); i++) { if (ns[i]) lanes.push(ns[i]); if (ew[i]) lanes.push(ew[i]); }   // alternate, so a short list still covers both directions
  const cars = traffic(parent, lanes.slice(0, Math.max(0, trafficLanes)), { scale: 0.42, y: 0.004 });

  const routes = [];
  const spots = {
    centre: V(0, 0, -1.5), park: blocks[parkBlock] ? V(blocks[parkBlock].x, 0.3, blocks[parkBlock].z) : V(-4.5, 0.3, -1.5),
    landmark: V(LM.x, 2.0, LM.z), airport: V(0, 0.5, -6.85), runway: V(0, 0.06, -8.23), tower: V(3.4, 1.6, -7.0),
  };
  const s = {
    blocks, cars, jet: jetObj, tower, runway: RW, focus: V(0, 0.5, -1.5),
    takeoffAt: null, takeoffLen: 4.2,
    // a takeoff path: roll down runway 09, rotate, climb out over the east of the city
    takeoffPath: [V(-4.9, 0.12, -8.23), V(-1.5, 0.12, -8.23), V(1.5, 0.2, -8.23), V(4.0, 0.9, -8.0), V(6.5, 2.3, -6.6), V(8.0, 3.6, -3.5)],
    spot(name) { if (spots[name]) return spots[name].clone(); const b = blocks.find((q) => q.name === name); return b ? V(b.x, b.h + 0.08, b.z) : spots.centre.clone(); },
    // route(points [[x, z], …] along the streets, t0, len, { color, rise }) → a trail that draws itself, with pins at both ends
    route(points, t0, len = 1.2, { color = [1.25, 0.36, 0.16], rise = 0.05, radius = 0.07 } = {}) {
      const pts = points.map(([x, z]) => V(x, rise, z));
      const tr = trail(parent, pts, { radius, color, segments: 200, sides: 8 });
      const pin = (p, c) => { const pg = group(parent, p.x, 0, p.z); put(tube(0.012, 0.012, 0.35, mat.steel, 6), 0, 0.175, 0, pg); put(ball(0.07, paint(c, { map: null, rough: 0.35 }), 16), 0, 0.38, 0, pg); return pg; };
      const a = pin(pts[0], 0x2f8f83), b = pin(pts.at(-1), 0xd9653b);
      const R = { tr, a, b, t0, len, pts, start: pts[0].clone().setY(0.4), end: pts.at(-1).clone().setY(0.4) };
      routes.push(R); return R;
    },
    views: {
      high: { from: [-0.8, 8.4, 8.6], to: [0.4, 7.9, 8.0], look0: [0, 0, -1.6], look1: [0.2, 0, -1.8], fov: 40, ap: 0.0006 },
      street: { from: [-1.35, 0.42, 3.35], to: [-1.25, 0.44, 2.75], look0: [-1.35, 0.55, -3.5], look1: [-1.25, 0.6, -3.5], fov: 44, ap: 0.0016 },
      runway: { from: [-2.4, 1.15, -4.7], to: [-1.4, 1.2, -4.9], look0: [0.6, 0.35, -8.2], look1: [1.2, 0.5, -8.0], fov: 40, ap: 0.0012 },
      tower: { from: [2.6, 1.6, 0.4], to: [2.2, 1.7, 0.0], look0: [1.5, 2.2, -1.5], look1: [1.5, 2.3, -1.5], fov: 40, ap: 0.0016 },
      // an aerial pass on a spline with a little roll: a view that is a path (see "The camera" in the manual)
      aerial: { path: [[-5.5, 9.5, 10.5], [-2.0, 10.2, 9.6], [2.0, 9.8, 8.8], [4.5, 9.0, 7.6]], look: [-0.2, 0, -0.8], roll: [-4, 3], fov: 44, ap: 0.0004 },
    },
    light(rig, at) {
      const warm = mood === 'day' ? 0xfff2dc : mood === 'night' ? 0x8fa0d8 : 0xffc890;
      rig.key.distance = 0; rig.key.decay = 1; rig.key.angle = 0.95; rig.key.penumbra = 0.8;
      aim(rig.key, at(-8.5, 9.5, 5.5), at(0, 0, -2.2), mood === 'night' ? 10 : 34, warm);
      rig.accent.distance = 0; rig.accent.decay = 1;
      aim(rig.accent, at(7.5, 6.5, -10), at(0, 0.5, -2), mood === 'night' ? 12 : 16, 0x9ab4ff, 0.9);
      rig.fill.distance = 0; rig.fill.decay = 1;
      aim(rig.fill, at(0, 7, 12), at(0, 0, -2), mood === 'night' ? 6 : 14, 0xfff0e0, 0.8);
      aim(rig.rim, at(6, 8, -12), at(0, 0, -2), mood === 'day' ? 1.6 : 1.0);
      rig.sky.intensity = mood === 'day' ? 1.3 : mood === 'night' ? 0.55 : 0.95;
    },
    frame(t) {
      cars.frame(t);
      if (clockHands) clockHands.forEach(({ hh, mm }) => { hh.rotation.z = -t * 0.3; mm.rotation.z = -t * 2.4; });
      if (tower) tower.beacon.material.color.setRGB(Math.floor(t * 1.4) % 2 ? 3.0 : 0.4, 0.5, 0.35);
      taxiLights.forEach((l, i) => { const k = 0.7 + 0.3 * Math.sin(TAU * 0.8 * t + i * 0.6); l.material.color.setRGB(1.8 * k, 1.6 * k, 0.9 * k); });
      if (jetObj) { if (this.takeoffAt != null) jetObj.fly(t, this.takeoffPath, this.takeoffAt, this.takeoffAt + this.takeoffLen, { groundY: 0 }); else jetObj.fly(0, this.takeoffPath, 1, 2, { trail: true }); }
      routes.forEach((R) => { const u = ease.both(clamp((t - R.t0) / R.len)); R.tr.reveal(u); [R.a, R.b].forEach((pg, k) => { const v = t - (k ? R.t0 + R.len : R.t0); pg.visible = v > 0; pg.scale.setScalar(Math.max(0.001, settle(v, 3, 0.5))); }); });
    },
  };
  return s;
}
