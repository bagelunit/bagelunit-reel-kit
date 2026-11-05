// Gear: the props a story is told WITH, as opposed to the rooms it is told IN. Close-up product pieces (a phone you can
// wake, tap and see inside; a hand that taps, presses and swipes; a pen that writes; field lines with charges riding them)
// and the moving city pieces (a car, a traffic flow along lanes, a jet with a contrail, a glowing trail that draws itself).
// Shots reach them as k.gear.phone(shot.root, {...}) etc. Every piece returns a handle; animate it from your frame() with
// the time t. Nothing here reads a clock: frames render in any order.
//
//   const p = k.gear.phone(root, { face: 'up' });   p.g.position.copy(set.centre);   p.screen.draw((g, w, h) => …)
//   p.wake(t, t0) · p.xray(t, t0) · p.marks.battery (an Object3D to pin a k.label on)
//   const h = k.gear.hand(root);   const c = h.tap(t, tTap, p.spot(0, 0.1));   (c = 0..1 contact: spawn a ripple on it)
//   const f = k.gear.field(root, { from, to, lines: 7 });   f.frame(t, tDraw)
//   const cars = k.gear.traffic(root, lanes);   cars.frame(t)          const j = k.gear.jet(root);   j.fly(t, path, t0, t1)
//   const r = k.gear.trail(root, points, { color: [2.0, 0.8, 0.4] });   r.reveal(u)
import * as THREE from 'three';
import { box, tube, ball, sheet, put, group, contact, paint, lit, mat, screen as liveScreen } from './kit3d.js';
import { clamp, lerp, ease, settle, jolt, TAU } from '../runtime/maths.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const toV = (p) => (p instanceof THREE.Vector3 ? p.clone() : Array.isArray(p) ? V(p[0], p[1], p[2]) : V());

// ── a glowing line that draws itself along any path (routes on a map, contrails, field lines, ink) ──
export function trail(parent, points, { radius = 0.012, color = [2.0, 0.9, 0.45], segments = 160, sides = 8, closed = false } = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map(toV), closed, 'centripetal');
  const geo = new THREE.TubeGeometry(curve, segments, radius, sides, closed);
  const m = lit(color[0], color[1], color[2]);
  const mesh = put(new THREE.Mesh(geo, m), 0, 0, 0, parent); mesh.castShadow = false;
  const per = sides * 6, total = geo.index.count;
  const head = put(ball(radius * 2.4, lit(color[0] * 1.2, color[1] * 1.2, color[2] * 1.2), 12), 0, 0, 0, parent); head.castShadow = false;
  const h = {
    mesh, curve, head,
    // u0..u1 of the path is drawn (default from the start); the head dot rides the leading end while it grows
    reveal(u1, u0 = 0, showHead = true) {
      u1 = clamp(u1); u0 = clamp(u0, 0, u1);
      const a = Math.floor(u0 * segments) * per, b = Math.ceil(u1 * segments) * per;
      geo.setDrawRange(a, Math.max(0, Math.min(total, b) - a));
      mesh.visible = u1 > 0.001;
      head.visible = showHead && u1 > 0.001 && u1 < 0.999;
      if (head.visible) head.position.copy(curve.getPointAt(u1));
    },
    pointAt: (u) => curve.getPointAt(clamp(u)),
  };
  h.reveal(0);
  return h;
}

// ── a phone: graphite body with a warm brass edge, a live screen, and real insides for the x-ray ──
// face: 'up' (lying on a table, screen to the sky) or 'front' (standing, screen toward +z). w = width in metres.
export function phone(parent, { face = 'up', w = 0.32, body = 0x2a2c33, edge = 0xc9a25a, screenPx = [540, 1100] } = {}) {
  const h = w * 2.06, d = 0.034;
  const g = group(parent), inner = group(g);
  if (face === 'up') inner.rotation.x = -Math.PI / 2;
  const shellMat = paint(body, { rough: 0.35, metal: 0.2, map: null }); shellMat.transparent = true;
  const edgeMat = paint(edge, { rough: 0.3, metal: 0.7, map: null }); edgeMat.transparent = true;
  const shell = put(box(w, h, d, shellMat, 0.045), 0, 0, 0, inner);
  const band = put(box(w + 0.006, h + 0.006, d * 0.45, edgeMat, 0.047), 0, 0, 0, inner);
  const cam = group(inner, -w * 0.28, h * 0.4, -d / 2 - 0.004);
  [[0, 0], [0, -0.05], [0.045, -0.025]].forEach(([x, y]) => put(tube(0.016, 0.016, 0.01, mat.ink, 20), x, y, 0, cam).rotation.x = Math.PI / 2);
  const scr = liveScreen(screenPx[0], screenPx[1]);
  const glassMat = new THREE.MeshBasicMaterial({ map: scr.tex, toneMapped: false, transparent: true, color: new THREE.Color(0.06, 0.06, 0.07) });
  const glass = put(sheet(w - 0.024, h - 0.03, glassMat), 0, 0, d / 2 + 0.0015, inner); glass.receiveShadow = false;
  const notch = put(box(0.07, 0.018, 0.004, mat.ink, 0.008), 0, h / 2 - 0.035, d / 2 + 0.003, inner);
  // the insides (hidden until x-ray): a battery, the logic board with chips, the camera stack, antenna lines in the frame
  const inside = group(inner); inside.visible = false;
  const battery = put(box(w * 0.68, h * 0.5, 0.012, paint(0xd9653b, { map: null, rough: 0.5 }), 0.008), 0, -h * 0.12, 0, inside);
  const boardM = paint(0x2f6f5e, { map: null, rough: 0.6 });
  const board = put(box(w * 0.78, h * 0.26, 0.006, boardM, 0.004), 0, h * 0.3, 0.006, inside);
  const chips = [[-0.05, 0.31, 0.05, 0.04], [0.04, 0.29, 0.04, 0.035], [0.07, 0.33, 0.025, 0.02], [-0.08, 0.26, 0.02, 0.03]].map(([x, y, cw, ch]) =>
    put(box(cw, ch, 0.006, mat.charcoal, 0.003), x, h * y, 0.011, inside));
  const lensStack = put(tube(0.03, 0.03, 0.02, mat.steel, 20), -w * 0.28, h * 0.4, 0, inside); lensStack.rotation.x = Math.PI / 2;
  const copper = paint(0xd88a4a, { map: null, metal: 0.6, rough: 0.35 });
  const antennas = [[0, h / 2 - 0.012, w * 0.7, 0.004], [0, -h / 2 + 0.012, w * 0.7, 0.004], [w / 2 - 0.01, 0, 0.004, h * 0.6]].map(([x, y, aw, ah]) => put(box(aw, ah, 0.004, copper, 0), x, y, 0, inside));
  const scan = put(sheet(w * 1.1, 0.012, lit(1.6, 2.2, 2.4, { transparent: true, add: true })), 0, 0, d / 2 + 0.006, inner); scan.visible = false;
  // the group's origin sits on the surface: flat ('up') the phone rests on it, standing ('front') its bottom edge does
  const shadow = put(contact(w * 1.6, h * 1.2, 0.35), 0, 0.002, 0, g);
  if (face === 'up') inner.position.y = d / 2; else { inner.position.y = h / 2; shadow.scale.y = 0.12 / (h * 1.2); }
  // Object3D marks to pin callout labels on (k.label('battery', p.marks.battery, 'Battery'))
  const mark = (x, y) => { const o = new THREE.Object3D(); o.position.set(x, y, 0.01); inner.add(o); return o; };
  const marks = { battery: mark(0, -h * 0.12), chip: mark(-0.05, h * 0.31), camera: mark(-w * 0.28, h * 0.4), antenna: mark(w / 2 - 0.01, -h * 0.05), screen: mark(0, 0) };
  let level = 0.06;
  const p = {
    g, inner, glass, screen: scr, shell, inside, marks, w, h, d, battery, board, chips, antennas,
    // a point on the glass in set coordinates of the phone's parent: (u, v) in -0.5..0.5 of the screen (v up = toward the top)
    spot(u = 0, v = 0) { const q = V(u * (w - 0.03), v * (h - 0.04), d / 2 + 0.002); inner.updateMatrix(); g.updateMatrix(); return q.applyMatrix4(inner.matrix).applyMatrix4(g.matrix); },
    // the screen lights from dark to full at t0 with a short flare
    wake(t, t0, len = 0.35) { level = t < t0 ? 0.06 : lerp(0.06, 1, ease.out((t - t0) / len)) + 0.25 * jolt(t - t0, 3, 0.6) * (t > t0 ? 1 : 0); glassMat.color.setScalar(clamp(level, 0, 1.25)); },
    brightness(v) { level = v; glassMat.color.setScalar(v); },
    // the cutaway: the shell goes ghostly, a scan line sweeps the length, the insides show and lift apart a touch
    xray(t, t0, len = 0.7, spread = 1) {
      const u = t < t0 ? 0 : ease.both((t - t0) / len);
      const o = lerp(1, 0.14, u);
      shellMat.opacity = o; edgeMat.opacity = lerp(1, 0.3, u); shellMat.depthWrite = edgeMat.depthWrite = u < 0.5;
      glassMat.opacity = lerp(1, 0.08, u);
      inside.visible = u > 0.02;
      battery.position.z = 0.012 * spread * u; board.position.z = 0.006 + 0.03 * spread * u; chips.forEach((c, i) => { c.position.z = 0.011 + (0.04 + 0.008 * i) * spread * u; });
      const sv = (t - t0) / len; scan.visible = sv > 0 && sv < 1; if (scan.visible) scan.position.y = lerp(h / 2, -h / 2, ease.both(sv));
      return u;
    },
  };
  p.wake(0, 9e9);
  return p;
}

// ── a hand: a chunky stylised hand in a sleeve, built around its fingertip (the group's origin IS the fingertip) ──
// dir: 'down' (taps things lying flat) or 'forward' (presses things on a wall, toward -z). All moves return the contact
// amount 0..1 for that frame, so the shot can fire a ripple, a click, a light on it.
export function hand(parent, { skin = 0xe9b48c, sleeve = 0x3f6390, cuff = 0xf3ecdd, dir = 'down', scale = 1 } = {}) {
  const g = group(parent), rig = group(g);
  rig.scale.setScalar(scale);
  if (dir === 'forward') rig.rotation.x = -Math.PI / 2;
  const sk = paint(skin, { rough: 0.6, map: null }), nail = paint(0xf4d6c4, { map: null, rough: 0.35 });
  const tipSeg = put(box(0.026, 0.05, 0.027, sk, 0.012), 0, 0.025, 0, rig);
  put(box(0.016, 0.012, 0.006, nail, 0.004), 0, 0.012, -0.0135, rig);
  const mid = put(box(0.028, 0.05, 0.029, sk, 0.012), 0, 0.07, -0.002, rig); mid.rotation.x = 0.08;
  const palm = put(box(0.092, 0.1, 0.042, sk, 0.02), 0.022, 0.14, 0.004, rig);
  [0, 1, 2].forEach((i) => { const f = put(box(0.024, 0.04, 0.03, sk, 0.011), 0.033 + i * 0.022, 0.095, 0.024, rig); f.rotation.x = -1.1; });
  const thumb = put(box(0.026, 0.06, 0.028, sk, 0.012), -0.034, 0.122, 0.018, rig); thumb.rotation.set(-0.5, 0, 0.55);
  put(tube(0.045, 0.048, 0.03, paint(cuff, { map: null }), 20), 0.022, 0.2, 0.004, rig);
  put(tube(0.05, 0.056, 0.2, paint(sleeve), 20), 0.022, 0.31, 0.004, rig);
  const shadow = put(contact(0.16, 0.12, 0.0), 0, 0, 0, parent);
  const up = dir === 'forward' ? V(0, 0, 1) : V(0, 1, 0);
  if (dir === 'down') rig.rotation.z = -0.18;            // a slight cant, so the finger reads against the palm
  const place = (p, liftAmt) => { g.position.copy(p).addScaledVector(up, liftAmt); };
  const ground = (p, liftAmt) => { if (dir !== 'down') { shadow.material.opacity = 0; return; } shadow.position.set(p.x + 0.03, p.y + 0.002, p.z + 0.02); shadow.material.opacity = 0.32 * clamp(1 - liftAmt / 0.25); };
  // enter: the hand slides in from `from` (a point off to the side) during the 0.5 s before the move starts
  const enter = (t, tStart, from, hover) => { if (!from || t >= tStart) return hover; const u = ease.out(clamp((t - (tStart - 0.5)) / 0.5)); return toV(from).lerp(hover, u); };
  const H = {
    g, rig, shadow,
    hover(p, lift = 0.09) { const q = toV(p); place(q, lift); ground(q, lift); },
    // a quick tap on p at t0: dip, touch for 0.06 s, lift. Returns contact 0..1.
    tap(t, t0, p, { lift = 0.09, from = null } = {}) {
      const q = toV(p), v = t - t0;
      let L = lift; if (v > -0.2 && v < 0) L = lift * (1 - ease.in((v + 0.2) / 0.2)); else if (v >= 0 && v < 0.06) L = 0; else if (v >= 0.06) L = lift * ease.out((v - 0.06) / 0.22);
      const at = enter(t, t0 - 0.2, from, q.clone().addScaledVector(up, lift)); g.position.copy(at); if (L < lift || t >= t0 - 0.2) place(q, L);
      ground(q, L);
      rig.scale.setScalar(scale * (1 - 0.04 * (v >= 0 && v < 0.12 ? Math.sin((Math.PI * v) / 0.12) : 0)));
      return v >= -0.02 && v < 0.1 ? 1 - Math.abs(v - 0.03) / 0.07 : 0;
    },
    // press and hold from t0 for `hold` seconds
    press(t, t0, p, { hold = 0.4, lift = 0.09, from = null } = {}) {
      const q = toV(p), v = t - t0;
      let L = lift; if (v > -0.22 && v < 0) L = lift * (1 - ease.in((v + 0.22) / 0.22)); else if (v >= 0 && v < hold) L = -0.004; else if (v >= hold) L = lift * ease.out((v - hold) / 0.25);
      if (t < t0 - 0.22 && from) g.position.copy(enter(t, t0 - 0.22, from, q.clone().addScaledVector(up, lift))); else place(q, L);
      ground(q, Math.max(0, L));
      return v >= 0 && v < hold ? 1 : 0;
    },
    // swipe from a to b starting at t0 over `len` seconds (touch, slide, lift)
    swipe(t, t0, a, b, { len = 0.4, lift = 0.08, from = null } = {}) {
      const A = toV(a), B = toV(b), v = t - t0;
      let q = A, L = lift, c = 0;
      if (v < -0.18) { q = A; L = lift; } else if (v < 0) { q = A; L = lift * (1 - ease.in((v + 0.18) / 0.18)); }
      else if (v < len) { q = A.clone().lerp(B, ease.both(v / len)); L = 0; c = 1; } else { q = B; L = lift * ease.out((v - len) / 0.22); }
      if (t < t0 - 0.18 && from) g.position.copy(enter(t, t0 - 0.18, from, A.clone().addScaledVector(up, lift))); else place(q, L);
      ground(q, L);
      return c;
    },
    // follow any point (writing, pointing at something moving)
    at(p, lift = 0) { const q = toV(p); place(q, lift); ground(q, lift); },
  };
  return H;
}

// ── a pen: lacquered barrel, brass clip and nib. pen.write(t, t0, len, path) moves the nib along a path and returns
// the drawn share 0..1 (pair it with a k.gear.trail of the same path for the ink line) ──
export function pen(parent, { color = 0x23305c, trim = 0xd8b25a, scale = 1, lean = 0.5 } = {}) {
  const g = group(parent), rig = group(g); rig.scale.setScalar(scale); rig.rotation.z = lean;
  const barrel = paint(color, { rough: 0.25, metal: 0.1, map: null }), gold = paint(trim, { metal: 0.75, rough: 0.3, map: null });
  put(new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.03, 16), gold), 0, 0.015, 0, rig).rotation.x = Math.PI;
  put(tube(0.009, 0.011, 0.04, gold, 18), 0, 0.05, 0, rig);
  put(tube(0.012, 0.012, 0.15, barrel, 20), 0, 0.145, 0, rig);
  put(tube(0.0125, 0.0125, 0.012, gold, 20), 0, 0.225, 0, rig);
  put(tube(0.012, 0.01, 0.06, barrel, 20), 0, 0.26, 0, rig);
  put(box(0.004, 0.06, 0.008, gold, 0.002), 0.013, 0.23, 0, rig);
  const shadow = put(contact(0.12, 0.05, 0.25), 0, 0, 0, parent);
  return {
    g, rig, shadow,
    at(p, lift = 0) { const q = toV(p); g.position.set(q.x, q.y + lift, q.z); shadow.position.set(q.x + 0.05, q.y + 0.002, q.z + 0.02); shadow.material.opacity = 0.25 * clamp(1 - lift / 0.2); },
    write(t, t0, len, path) {
      const pts = path.map(toV), c = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
      const u = clamp((t - t0) / len), lift = t < t0 ? 0.06 * (1 - ease.out(clamp((t - t0 + 0.3) / 0.3))) : t > t0 + len ? 0.06 * ease.out((t - t0 - len) / 0.3) : 0;
      this.at(c.getPointAt(u), lift + 0.003 * Math.abs(Math.sin(TAU * 7 * t)));
      return u;
    },
  };
}

// ── field lines: curved lines that draw from a source to a spread of targets, with charges riding them ──
export function field(parent, { from, to, lines = 7, spread = 0.18, bulge = 0.16, color = [0.7, 1.7, 2.2], charges = 3, radius = 0.004 } = {}) {
  const S = toV(from), T = toV(to);
  const set = Array.from({ length: lines }, (_, i) => {
    const a = (i / Math.max(1, lines - 1) - 0.5) * 2, side = V(a * spread, 0, (i % 2 ? 1 : -1) * spread * 0.35 * Math.abs(a));
    const end = T.clone().add(side), mid = S.clone().lerp(end, 0.5).add(V(a * bulge, bulge * (1 - Math.abs(a) * 0.4), 0));
    const tr = trail(parent, [S, mid, end], { radius, color, segments: 60, sides: 6 });
    const dots = Array.from({ length: charges }, () => { const b = put(ball(radius * 3.4, lit(color[0] * 1.3, color[1] * 1.3, color[2] * 1.3), 10), 0, 0, 0, parent); b.castShadow = false; b.visible = false; return b; });
    return { tr, dots };
  });
  return {
    set,
    // lines draw over `len` from tDraw (staggered); charges flow toward the targets after they are drawn
    frame(t, tDraw, { len = 0.5, flow = 0.9, dir = 1, until = Infinity } = {}) {
      set.forEach(({ tr, dots }, i) => {
        const u = ease.out(clamp((t - tDraw - i * 0.04) / len)), on = t < until;
        tr.reveal(on ? u : 0, 0, false);
        dots.forEach((b, j) => { const ph = ((t - tDraw) * flow + j / dots.length + i * 0.13) % 1; b.visible = on && u >= 1 && t > tDraw; if (b.visible) b.position.copy(tr.pointAt(dir > 0 ? ph : 1 - ph)); });
      });
    },
  };
}

// ── a car: rounded body, glass cabin, four wheels, head and tail lights. Forward is +x. ──
export function car(parent, { color = 0xd9653b, scale = 1, lights = true } = {}) {
  const g = group(parent), rig = group(g); rig.scale.setScalar(scale);
  const bodyM = paint(color, { rough: 0.35, map: null });
  put(box(0.42, 0.1, 0.2, bodyM, 0.04), 0, 0.085, 0, rig);
  put(box(0.24, 0.09, 0.18, paint(0x2b3440, { rough: 0.15, metal: 0.2, map: null }), 0.035), -0.02, 0.165, 0, rig);
  put(box(0.2, 0.012, 0.16, bodyM, 0.005), -0.02, 0.212, 0, rig);
  const tyre = paint(0x1c1c20, { rough: 0.8, map: null }), hub = paint(0xc9ccd2, { metal: 0.6, rough: 0.35, map: null });
  const wheels = [[0.13, 0.1], [0.13, -0.1], [-0.13, 0.1], [-0.13, -0.1]].map(([x, z]) => { const wg = group(rig, x, 0.045, z); const t = put(tube(0.045, 0.045, 0.04, tyre, 18), 0, 0, 0, wg); t.rotation.x = Math.PI / 2; put(tube(0.02, 0.02, 0.042, hub, 12), 0, 0, 0, wg).rotation.x = Math.PI / 2; return wg; });
  if (lights) { [0.06, -0.06].forEach((z) => { put(box(0.01, 0.025, 0.04, lit(1.7, 1.5, 1.1), 0.004), 0.211, 0.095, z, rig); put(box(0.01, 0.022, 0.04, lit(1.5, 0.2, 0.15), 0.004), -0.211, 0.095, z, rig); }); }
  put(contact(0.55, 0.32, 0.35), 0, 0.003, 0, rig);
  return { g, rig, wheels, spin(a) { wheels.forEach((w) => { w.rotation.z = -a; }); } };
}

// ── traffic: cars that drive lanes forever. lanes = [{ pts: [[x, z], …], speed, cars, y }] in the parent's coordinates. ──
// pace(t) (optional, per lane) scales the speed over time (0 = stopped): a jam, a green light.
export function traffic(parent, lanes, { colors = [0xd9653b, 0x2f8f83, 0xe3a21a, 0x6b5bb8, 0x3f6390, 0xc2557a, 0xf3ecdd, 0x58c08a], scale = 0.45, y = 0 } = {}) {
  let n = 0;
  const all = lanes.map((ln) => {
    const pts = ln.pts.map(([x, z]) => V(x, ln.y ?? y, z)), lens = [0];
    for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + pts[i].distanceTo(pts[i - 1]));
    const L = lens.at(-1), count = ln.cars ?? 2;
    const cars = Array.from({ length: count }, (_, j) => ({ c: car(parent, { color: colors[n++ % colors.length], scale: ln.scale ?? scale }), off: (j / count) * L + (ln.offset ?? 0) }));
    return { ...ln, pts, lens, L, cars };
  });
  // how far a lane has driven by t (integrates pace when given, in 1/30 s steps so it stays a pure function of t)
  const distance = (ln, t) => { if (!ln.pace) return t * (ln.speed ?? 0.6); let d = 0; for (let s = 0; s < t; s += 1 / 30) d += (ln.speed ?? 0.6) * ln.pace(s) / 30; return d; };
  const where = (ln, s) => {
    s = ((s % ln.L) + ln.L) % ln.L; let i = 1; while (i < ln.lens.length - 1 && ln.lens[i] < s) i++;
    const a = ln.pts[i - 1], b = ln.pts[i], u = (s - ln.lens[i - 1]) / Math.max(1e-6, ln.lens[i] - ln.lens[i - 1]);
    return { p: a.clone().lerp(b, u), yaw: Math.atan2(-(b.z - a.z), b.x - a.x) };
  };
  return {
    lanes: all,
    frame(t) {
      all.forEach((ln) => { const d = distance(ln, t); ln.cars.forEach(({ c, off }) => { const w = where(ln, off + d); c.g.position.copy(w.p); c.g.rotation.y = w.yaw; c.spin((off + d) / 0.045 / (ln.scale ?? scale)); }); });
    },
    // where a given car is at t (to pin a label or ring on it)
    carAt(t, lane = 0, j = 0) { const ln = all[lane]; return where(ln, ln.cars[j].off + distance(ln, t)).p; },
  };
}

// ── a jet: white fuselage with an accent cheat line, swept wings, two engines, a tail fin. Nose is +x. ──
// jet.fly(t, path, t0, t1) moves it along a path (eased) and banks into the turns; jet.contrail grows behind it.
export function jet(parent, { scale = 1, livery = 0xd9653b, body = 0xf3efe6, trailColor = [1.6, 1.55, 1.5] } = {}) {
  const g = group(parent), rig = group(g); rig.scale.setScalar(scale);
  const white = paint(body, { rough: 0.35, map: null }), acc = paint(livery, { rough: 0.4, map: null }), grey = paint(0x9aa0aa, { metal: 0.5, rough: 0.35, map: null });
  const fus = put(new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.5, 6, 16), white), 0, 0, 0, rig); fus.rotation.z = Math.PI / 2; fus.castShadow = true;
  put(box(0.5, 0.012, 0.004, acc, 0), 0, 0.012, 0.055, rig); put(box(0.5, 0.012, 0.004, acc, 0), 0, 0.012, -0.055, rig);
  put(box(0.42, 0.01, 0.0035, mat.ink, 0), 0.02, 0.028, 0.0535, rig); put(box(0.42, 0.01, 0.0035, mat.ink, 0), 0.02, 0.028, -0.0535, rig);
  const wing = new THREE.Shape([[0.08, 0], [-0.06, 0.34], [-0.13, 0.34], [-0.07, 0]].map(([x, y]) => new THREE.Vector2(x, y)));
  [-1, 1].forEach((s) => { const w = put(new THREE.Mesh(new THREE.ExtrudeGeometry(wing, { depth: 0.012, bevelEnabled: false }), white), 0.02, -0.02, 0, rig); w.rotation.x = s * Math.PI / 2; w.castShadow = true;
    const e = put(tube(0.025, 0.022, 0.1, grey, 16), 0.03, -0.045, s * 0.16, rig); e.rotation.z = Math.PI / 2; });
  const fin = new THREE.Shape([[0, 0], [-0.1, 0.16], [-0.16, 0.16], [-0.12, 0]].map(([x, y]) => new THREE.Vector2(x, y)));
  put(new THREE.Mesh(new THREE.ExtrudeGeometry(fin, { depth: 0.008, bevelEnabled: false }), acc), -0.2, 0.03, -0.004, rig).castShadow = true;
  [-1, 1].forEach((s) => { const tp = put(box(0.08, 0.008, 0.12, white, 0.003), -0.26, 0.02, s * 0.07, rig); tp.castShadow = true; });
  const shadow = put(contact(0.7, 0.7, 0.3), 0, 0.003, 0, parent);
  let contrail = null, lastPath = null;
  const J = {
    g, rig, shadow,
    // fly along `path` (points in the parent's coordinates) between t0 and t1; shadow follows on the ground (groundY)
    fly(t, path, t0, t1, { groundY = 0, bank = 0.5, trail: wantTrail = true, ease: eas = 'in' } = {}) {
      if (lastPath !== path) { lastPath = path; if (contrail) { parent.remove(contrail.mesh, contrail.head); } contrail = wantTrail ? trail(parent, path, { radius: 0.018, color: trailColor, segments: 140, sides: 6 }) : null; this.curve = new THREE.CatmullRomCurve3(path.map(toV), false, 'centripetal'); }
      const raw = clamp((t - t0) / Math.max(1e-6, t1 - t0)), u = eas === 'in' ? raw * raw * (1.6 - 0.6 * raw) : eas === 'both' ? ease.both(raw) : raw;
      const p = this.curve.getPointAt(u), ahead = this.curve.getPointAt(Math.min(1, u + 0.01)), back = this.curve.getPointAt(Math.max(0, u - 0.01));
      g.position.copy(p);
      const dir = ahead.clone().sub(back); if (dir.lengthSq() > 1e-10) { const yaw = Math.atan2(-dir.z, dir.x), pitch = Math.atan2(dir.y, Math.hypot(dir.x, dir.z)); g.rotation.set(0, yaw, 0); rig.rotation.set(0, 0, pitch); }
      const a2 = this.curve.getPointAt(Math.min(1, u + 0.03)), turn = Math.atan2(-(a2.z - p.z), a2.x - p.x) - Math.atan2(-dir.z, dir.x);
      rig.rotation.x = clamp(-turn * bank * 6, -0.6, 0.6);
      shadow.position.set(p.x, groundY + 0.003, p.z); shadow.material.opacity = 0.3 * clamp(1 - (p.y - groundY) / 1.5);
      if (contrail) contrail.reveal(p.y - groundY > 0.12 ? u : 0, Math.max(0, u - 0.45), false);
      return u;
    },
  };
  return J;
}
