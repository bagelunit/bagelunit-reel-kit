/* Susanoo Reel Kit print · fx
   Print-style effects: glows and dust on the tone layer T (grey prints as key-ink lines, '255,0,0' as accent lines), impacts,
   cables, energy flow, pen marks and confetti on the ink layer K. Every effect is a pure function of its time arguments. */

// the effects' tuning
const FX = {
  puffLife: 0.55, puffAlpha: 0.22, puffR0: 16, puffRStep: 8, puffGrow: 0.45, puffStepX: 24, puffDrift: 70, puffBob: 12, puffRise: 26,
  hitLife: 0.8, hitGlowW: 240, hitGlowH: 160, hitGlow: 0.9, hitGlowFade: 4.2, ringR: 175, ringW: 6, ringDur: 0.42,
  sparks: 18, sparkGravity: 2600, sparkTrail: 0.024, sparkRed: 0.74,
  flowSamples: 36, cableSamples: 40, pulseOver: 1.12, pulseFadeFrom: 0.9, pulseFadeSpan: 0.22, pulseGlow: 70, pulseCore: 3.1, pulseHot: 1.3,
  rippleLife: 0.45, rippleR0: 14, rippleGrow: 60,
  confettiFall: 1300, confettiFadeFrom: 0.6,
};
// a glow's falloff: [stop, share of its strength]
const FX_GLOW_STOPS = [[0, 1], [0.5, 0.42], [1, 0]];
// a soft glow on T, rx × ry; rgb '255,0,0' prints in the accent, '0,0,0' in key ink; a = strength 0..1
const glow = (T, x, y, rx, ry, a, rgb = '255,0,0') => {
  if (a <= 0.004) return;
  T.save();
  runOps(T, [['translate', x, y], ['scale', 1, ry / rx]]);   // a circle squashed into the ellipse
  const fade = T.createRadialGradient(0, 0, 0, 0, 0, rx);
  for (const [at, share] of FX_GLOW_STOPS) fade.addColorStop(at, `rgba(${rgb},${a * share})`);
  T.fillStyle = fade;
  runOps(T, [['fillRect', -rx, -rx, rx * 2, rx * 2], ['restore']]);
}
// a dust puff on T for slams and drops (0.55 s); dir 1 drifts right, -1 left
const puff = (T, x, y, dt, s = 1, dir = 1) => {
  if (dt < 0 || dt > FX.puffLife) return;
  const p = dt / FX.puffLife, spread = E.outCubic(p);
  const smoke = `rgba(0,0,0,${FX.puffAlpha * (1 - p)})`;
  [0, 1, 2, 3].forEach(i => {
    const r = (FX.puffR0 + i * FX.puffRStep) * s * (FX.puffGrow + spread);
    const cx = x + dir * (i * FX.puffStepX + FX.puffDrift * spread) * s;
    const cy = y - (i % 2) * FX.puffBob * s - FX.puffRise * spread * s;
    T.fillStyle = smoke;
    runOps(T, [['beginPath'], ['arc', cx, cy, r, 0, TAU], ['fill']]);
  });
}
// an impact at dt = 0: an accent bloom, a shock ring, two bursts and sparks falling under gravity (0.8 s)
const impact = (T, K, x, y, dt, s = 1, seed = 1) => {
  if (dt < 0 || dt > FX.hitLife) return;
  glow(T, x, y, FX.hitGlowW * s, FX.hitGlowH * s, FX.hitGlow * Math.exp(-dt * FX.hitGlowFade));
  shock(K, x, y, dt, { r: FX.ringR * s, color: C.red, lw: FX.ringW * s, dur: FX.ringDur });
  burst(K, x, y - 8 * s, dt, { n: 12, r0: 54 * s, r1: 178 * s, color: C.red, lw: 7 * s, dur: 0.3, rot: -0.12 });
  burst(K, x, y - 8 * s, dt - 0.035, { n: 7, r0: 84 * s, r1: 150 * s, color: C.ink, lw: 4 * s, dur: 0.26, rot: 0.33 });
  const draw = rng(seed * 7919 + 11);
  const gravity = FX.sparkGravity * s;
  for (let i = 0; i < FX.sparks; i++) {
    const heading = -Math.PI * (0.06 + 0.88 * draw());
    const speed = (430 + 680 * draw()) * s;
    const life = 0.26 + 0.36 * draw();
    const colour = draw() < FX.sparkRed ? C.red : C.ink;
    if (dt > life) continue;
    const [ux, uy] = [Math.cos(heading), Math.sin(heading)];
    const vx = ux * speed, vy = uy * speed + gravity * dt;
    const px = x + ux * speed * dt, py = y + uy * speed * dt + 0.5 * gravity * dt * dt;
    line(K, px - vx * FX.sparkTrail, py - vy * FX.sparkTrail, px, py, colour, (2 + 3.6 * (1 - dt / life)) * s, 'round');   // a streak along its velocity
  }
}

/* ---------- curves: P = [[x0, y0], [c1x, c1y], [c2x, c2y], [x1, y1]] ---------- */
// the point at u on the cubic Bézier P (Bernstein weights)
const bez = (P, u) => {
  const v = 1 - u;
  const w = [v * v * v, 3 * v * v * u, 3 * v * u * u, u * u * u];
  return [0, 1].map(axis => w[0] * P[0][axis] + w[1] * P[1][axis] + w[2] * P[2][axis] + w[3] * P[3][axis]);
};
const bezPath = (K, P) => {
  runOps(K, [['beginPath'], ['moveTo', P[0][0], P[0][1]], ['bezierCurveTo', P[1][0], P[1][1], P[2][0], P[2][1], P[3][0], P[3][1]]]);
}
// samples along P at n + 1 points and the running length to each
function fxSampleCurve(P, n) {
  const pts = Array.from({ length: n + 1 }, (_, i) => bez(P, i / n));
  const run = [0];
  for (let i = 1; i <= n; i++) run.push(run[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, run };
}
// the point at distance d along sampled points (run = the running length to each)
function fxAlong(pts, run, d) {
  const last = pts.length - 1;
  let seg = 1;
  while (seg < last && run[seg] < d) seg += 1;
  const a = pts[seg - 1], b = pts[seg];
  const u = (d - run[seg - 1]) / Math.max(1e-6, run[seg] - run[seg - 1]);
  return [lerp(a[0], b[0], u), lerp(a[1], b[1], u)];
}
// a cable along P, drawn on as p goes 0 → 1
const cable = (K, P, p = 1, col = C.ink, lw = 8) => {
  if (p <= 0) return;
  const n = FX.cableSamples;
  const length = Array.from({ length: n }, (_, i) => bez(P, (i + 1) / n))
    .reduce((acc, q) => ({ sum: acc.sum + Math.hypot(q[0] - acc.prev[0], q[1] - acc.prev[1]), prev: q }), { sum: 0, prev: P[0] }).sum;
  strokeP(K, c => bezPath(c, P), length, p, col, lw);
}
// energy flowing along P from its start: a bright pulse runs out over o.lead seconds, then accent dots stream behind it
const flow = (T, K, P, t, t0, o = {}) => {
  if (t < t0) return;
  const n = FX.flowSamples;
  const { pts, run } = fxSampleCurve(P, n);
  const total = run[n];
  const at = dist => fxAlong(pts, run, clamp(dist, 0, total));
  const f = withDefaults(o, { lead: 0.3, r: 3.4, gap: 44, speed: 360, a: 1, s: 1 });
  const lead = (t - t0) / f.lead;
  const front = total * E.inOutCubic(clamp(lead));
  K.save();
  K.globalAlpha *= f.a;
  for (let d = ((t - t0) * f.speed) % f.gap; d < front - 6; d += f.gap) {
    const q = at(d);
    circle(K, q[0], q[1], f.r, C.red);
  }
  if (lead < FX.pulseOver) {   // the pulse at the front, fading as it arrives
    const q = at(front), k = 1 - clamp((lead - FX.pulseFadeFrom) / FX.pulseFadeSpan);
    glow(T, q[0], q[1], FX.pulseGlow * f.s, FX.pulseGlow * f.s, 0.75 * k * f.a);
    [[FX.pulseCore, C.red], [FX.pulseHot, '#FFE1DA']].forEach(([size, colour]) => circle(K, q[0], q[1], f.r * size * k, colour));
  }
  K.restore();
}

/* ---------- shadows and pen marks ---------- */
// a dotted drop shadow drawn on K, for a prop sitting on another ink-layer card (where a T shadow would be hidden)
// a dot-screen fill for K, cached per colour and dot radius on a 5 px cell (the shader's cell): use it as a fillStyle
const FX_TILES = {};
const dotPattern = (K, col = '#111111', rad = 1.6) => {
  const key = col + rad;
  if (!FX_TILES[key]) {
    const tile = Object.assign(document.createElement('canvas'), { width: 5, height: 5 });
    const g = tile.getContext('2d');
    g.fillStyle = col;
    runOps(g, [['beginPath'], ['arc', 2.5, 2.5, rad, 0, TAU], ['fill']]);
    FX_TILES[key] = tile;
  }
  return K.createPattern(FX_TILES[key], 'repeat');
};
const FX_DOT_RINGS = [[18, 1.05], [11, 1.6], [5, 2.05]];   // [grow px, dot radius]: three rings, the densest inside
const dotShadow = (K, x, y, w, h, r, dense = 1) => {
  K.save();
  FX_DOT_RINGS.forEach(([grow, rad], ring) => {
    if (ring === 2 && dense < 0.6) return;   // light shadows skip the dense core
    const half = grow * 0.5;
    fillRR(K, x - half + 10, y - half + 16, w + grow, h + grow, r + half, dotPattern(K, '#111111', rad));
  });
  K.restore();
}
// set a pen: colour, width, round ends (and round corners when join is true)
function fxPen(K, col, lw, join) {
  Object.assign(K, { strokeStyle: col, lineWidth: lw, lineCap: 'round' });
  if (join) K.lineJoin = 'round';
}
// a marker underline sweeping in under a word as p goes 0 → 1, with a slight hand wobble
const underline = (K, x, y, w, p, col = C.red, lw = 10) => {
  if (p <= 0) return;
  const tip = [x + w * E.outCubic(p), y - 2 + 4 * p];   // the pen's end, dipping a little as it travels
  K.save();
  fxPen(K, col, lw);
  runOps(K, [['beginPath'], ['moveTo', x, y], ['quadraticCurveTo', x + w * 0.5, y + 6, ...tip], ['stroke'], ['restore']]);
}
// a highlighter block behind text (on T with the accent it prints as accent lines; on K use an rgba colour)
const highlight = (ctx, x, y, w, h, p, col = 'rgba(255,0,0,0.55)') => {
  if (p <= 0) return;
  const reach = w * E.outCubic(clamp(p));
  ctx.save();
  ctx.fillStyle = col;
  runOps(ctx, [['fillRect', x, y, reach, h], ['restore']]);
}
// a pen loop round a box (cx, cy, rx, ry) drawn on as p goes 0 → 1, running a little past its start like a real pen
const scribbleCircle = (K, cx, cy, rx, ry, p, col = C.red, lw = 7, seed = 3) => {
  if (p <= 0) return;
  const start = -2.2 + rng(seed)() * 0.4;
  const steps = 60, laps = 1.12;
  const drawn = Math.max(2, Math.floor(steps * E.outCubic(clamp(p))));
  K.save();
  fxPen(K, col, lw, true);
  K.beginPath();
  for (let i = 0; i <= drawn; i++) {
    const u = i / steps;
    const a = start + u * TAU * laps;
    const wobble = 1 + 0.06 * Math.sin(u * 9 + seed) + 0.05 * u;
    const px = cx + Math.cos(a) * rx * wobble, py = cy + Math.sin(a) * ry * wobble;
    if (i) K.lineTo(px, py);
    else K.moveTo(px, py);
  }
  K.stroke();
  K.restore();
}
// a curve from a to b bowed sideways by bend px: both handles sit two thirds of the way toward the bow point
function fxBow(a, b, bend) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const peak = [(a[0] + b[0]) / 2 - dy / len * bend, (a[1] + b[1]) / 2 + dx / len * bend];
  const toward = from => [lerp(from[0], peak[0], 0.66), lerp(from[1], peak[1], 0.66)];
  return [a, toward(a), toward(b), b];
}
// a hand-drawn arrow from (x0, y0) to (x1, y1), bowed sideways by o.bend px, drawn on over p; the head opens at the end
const arrow = (K, x0, y0, x1, y1, p, o = {}) => {
  if (p <= 0) return;
  const a = withDefaults(o, { col: C.red, lw: 7, bend: 60, head: 26 });
  const Q = fxBow([x0, y0], [x1, y1], a.bend);
  cable(K, Q, clamp(p * 1.25), a.col, a.lw);
  const headP = clamp((p - 0.75) / 0.25);
  if (headP <= 0) return;
  const [ax, ay] = bez(Q, 0.96);
  const ang = Math.atan2(y1 - ay, x1 - ax), size = a.head * E.outBack(headP);
  const barb = turn => [x1 + Math.cos(ang + turn) * size, y1 + Math.sin(ang + turn) * size];
  K.save();
  fxPen(K, a.col, a.lw, true);
  polyPath(K, [barb(2.5), [x1, y1], barb(-2.5)]);
  K.stroke();
  K.restore();
}
// confetti: paper bits in the accent and ink thrown up at dt = 0, spinning and falling
const confetti = (K, x, y, dt, o = {}) => {
  const c = withDefaults(o, { n: 26, spread: 520, seed: 5, dur: 1.1 });
  if (dt < 0 || dt > c.dur) return;
  const draw = rng(c.seed);
  const fadeOut = 1 - clamp((dt - c.dur * FX.confettiFadeFrom) / (c.dur * 0.4));   // the last 40 % fades
  for (let i = 0; i < c.n; i++) {
    const bit = { heading: -Math.PI * (0.1 + 0.8 * draw()), speed: c.spread * (0.6 + 0.8 * draw()), spin: (draw() - 0.5) * 18, size: 10 + draw() * 12 };
    bit.fill = draw() < 0.6 ? C.red : C.ink;
    const px = x + Math.cos(bit.heading) * bit.speed * dt;
    const py = y + Math.sin(bit.heading) * bit.speed * dt + FX.confettiFall * dt * dt;
    K.save();
    K.globalAlpha *= fadeOut;
    runOps(K, [['translate', px, py], ['rotate', bit.spin * dt + i]]);
    K.fillStyle = bit.fill;
    runOps(K, [['fillRect', -bit.size / 2, -bit.size * 0.3, bit.size, bit.size * 0.6], ['restore']]);
  }
}
// two rings spreading from a click point
const ripple = (K, x, y, dt, col = C.red) => {
  [0, 0.1].map(delay => dt - delay).filter(d => d >= 0 && d <= FX.rippleLife).forEach(d => {
    const p = d / FX.rippleLife;
    K.save();
    K.globalAlpha *= 1 - p;
    circle(K, x, y, FX.rippleR0 + FX.rippleGrow * E.outCubic(p), null, col, 4 * (1 - p) + 1);
    K.restore();
  });
}
// speed lines trailing an object moving in direction ang (radians); a = strength 0..1
const speedLines = (K, x, y, ang, a, o = {}) => {
  if (a <= 0.01) return;
  const sl = withDefaults(o, { n: 5, len: 160, gap: 26, col: C.ink, lw: 5, seed: 2 });
  const draw = rng(sl.seed);
  const [ux, uy] = [Math.cos(ang), Math.sin(ang)];
  K.save();
  K.globalAlpha *= a;
  fxPen(K, sl.col, sl.lw);
  for (let i = 0; i < sl.n; i++) {
    const across = (i - (sl.n - 1) / 2) * sl.gap;
    const length = sl.len * (0.5 + draw() * 0.5);
    const bx = x - ux * (40 + draw() * 40) - uy * across;   // each start sits a random distance behind the object
    const by = y - uy * (40 + draw() * 40) + ux * across;
    polyPath(K, [[bx, by], [bx - ux * length, by - uy * length]]);
    K.stroke();
  }
  K.restore();
}
