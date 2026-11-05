/* Susanoo Reel Kit print · lib
   The drawing vocabulary every scene shares. Each frame is drawn on two canvases:
     T  the tone layer: the compositor prints it as engraved lines (greys = key ink, pure #FF0000 = accent ink, white = paper)
     K  the ink layer: composited on top exactly as drawn (type, outlines, flat colour, stamps)
   Everything here is a global (scripts share one scope) and a pure function of its arguments. Shape helpers build the context's
   current path (as canvas calls do), so a caller can still fill, stroke or clip what they drew. */

/* ---------- frame, palette, type ---------- */
const W = 1080;
const H = 1920;
const TAU = 2 * Math.PI;
const D2R = Math.PI / 180;
// ink, paper and the accent (red is replaced by the reel's theme accent at boot; redD is its darker edge)
const C = { ink: '#151515', paper: '#F3F1EC', red: '#F2542D', redD: '#C23A17' };
// tone values the compositor reads as ink density: greys k10…k100, accent tints r20…r100
'k10 E6E6E6 k20 CCCCCC k30 B3B3B3 k45 8C8C8C k60 666666 k75 404040 k90 1A1A1A k100 000000 r100 FF0000 r60 FF6666 r35 FFA6A6 r20 FFCCCC'
  .split(' ').forEach((word, i, all) => { if (i % 2 === 0) C[word] = '#' + all[i + 1]; });
// type: Barlow Condensed (display, captions, stamps), Figtree (cards, UI), Oswald (the accent voice: tags, seals), JetBrains Mono
// (code). serif is an old name that now points at the Oswald voice. "Fallback" = on-demand non-Latin glyphs (tools/glyphs.py).
const F = Object.fromEntries([
  ['anton', '"Barlow Condensed"'], ['grot', 'Figtree'], ['serif', 'Oswald'], ['voice', 'Oswald'], ['mono', '"JetBrains Mono"'],
].map(([role, family]) => [role, family + ', "Fallback"']));
// the theme accent with alpha a, for glows and tints
const accentA = (a) => {
  const n = parseInt(String(C.red).slice(1), 16);
  return 'rgba(' + [16, 8, 0].map(shift => n >> shift & 255).join(',') + ',' + a + ')';
}

/* ---------- numbers ---------- */
const clamp = (x, a = 0, b = 1) => { return Math.min(b, Math.max(a, x)); }
const lerp = (a, b, t) => { return a + (b - a) * t; }
const inv = (a, b, x) => { return clamp((x - a) / (b - a)); }
// o's options with defaults filled in where an option was left out (null and 0 are kept, as with destructuring defaults)
const withDefaults = (o, defaults) => {
  const out = { ...defaults };
  for (const key in o) if (o[key] !== undefined) out[key] = o[key];
  return out;
}
// easing curves, 0 → 1. backOutBy(s) overshoots by s
const backOutBy = s => t => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
const E = {
  lin: t => t,
  outQuad: t => 1 - (1 - t) * (1 - t),
  inCubic: t => t * t * t,
  outCubic: t => 1 - Math.pow(1 - t, 3),
  inOutCubic: t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inQuart: t => t ** 4,
  outQuart: t => 1 - Math.pow(1 - t, 4),
  outQuint: t => 1 - Math.pow(1 - t, 5),
  outExpo: t => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inExpo: t => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
  inOutExpo(t) {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return t < .5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2;
  },
  inOutQuint: t => (t < .5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2),
  outBack: backOutBy(1.70158),
  outBackX: backOutBy(2.6),
  inBack(t) {
    const s = 1.70158;
    return (s + 1) * t * t * t - s * t * t;
  },
  // extra names people reach for, so a guess never throws
  inQuad: t => t * t,
  inOutQuad: t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  inOutBack(t) {
    const c = 1.70158 * 1.525;
    if (t < 0.5) return (Math.pow(2 * t, 2) * ((c + 1) * 2 * t - c)) / 2;
    return (Math.pow(2 * t - 2, 2) * ((c + 1) * (t * 2 - 2) + c) + 2) / 2;
  },
  inOutSine: t => -(Math.cos(Math.PI * t) - 1) / 2,
  outSine: t => Math.sin(t * Math.PI / 2),
  inSine: t => 1 - Math.cos(t * Math.PI / 2),
};
// progress of t through the window [a, a + d], eased
const P = (t, a, d, e = E.lin) => { return e(clamp((t - a) / d)); }
// a damped spring settling on 1 (overshoots first), dt seconds after it starts
const spring = (dt, f = 2.4, z = 0.36) => {
  if (dt <= 0) return 0;
  const omega = TAU * f;
  const envelope = Math.exp(-z * omega * dt);
  return 1 - envelope * Math.cos(omega * Math.sqrt(1 - z * z) * dt);
}
// a decaying wobble around 0
const ring = (dt, f = 3.5, k = 7) => {
  if (dt < 0) return 0;
  return Math.exp(-k * dt) * Math.cos(TAU * f * dt);
}
// repeatable randomness: hash(n) 0..1, noise1(x) smooth -1..1, rng(seed)() a seeded stream (mulberry32)
const hash = (n) => {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
}
const noise1 = (x) => {
  const cell = Math.floor(x);
  const f = x - cell;
  return lerp(hash(cell), hash(cell + 1), f * f * (3 - 2 * f)) * 2 - 1;
}
const rng = (seed) => {
  let state = seed;
  return function next() {
    state |= 0;
    state = state + 0x6D2B79F5 | 0;
    let m = Math.imul(state ^ state >>> 15, 1 | state);
    m = m + Math.imul(m ^ m >>> 7, 61 | m) ^ m;
    return ((m ^ m >>> 14) >>> 0) / 4294967296;
  };
}
const money = (n, cur = '$') => { return cur + Math.round(n).toLocaleString('en-US'); }

/* ---------- paths ---------- */
// run a list of canvas calls: [['moveTo', x, y], ['arc', …], ['fill'], …]
const runOps = (ctx, list) => { for (const [name, ...args] of list) ctx[name](...args); }
// a polyline through points [[x, y], ...], optionally closed
const polyPath = (ctx, pts, close = false) => {
  runOps(ctx, [['beginPath'], ['moveTo', ...pts[0]], ...pts.slice(1).map(p => ['lineTo', p[0], p[1]]), ...(close ? [['closePath']] : [])]);
}
// a rounded rectangle (the radius shrinks to fit)
const rr = (ctx, x, y, w, h, r) => {
  const k = Math.max(0, Math.min(r, w / 2, h / 2));
  const right = x + w, bottom = y + h;
  runOps(ctx, [['beginPath'], ['moveTo', x + k, y], ['arcTo', right, y, right, bottom, k], ['arcTo', right, bottom, x, bottom, k],
    ['arcTo', x, bottom, x, y, k], ['arcTo', x, y, right, y, k], ['closePath']]);
}
const fillRR = (ctx, x, y, w, h, r, fill) => {
  rr(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
}
const strokeRR = (ctx, x, y, w, h, r, col = C.ink, lw = 6) => {
  rr(ctx, x, y, w, h, r);
  Object.assign(ctx, { strokeStyle: col, lineJoin: 'round', lineWidth: lw });
  ctx.stroke();
}
// a printed card: its hard offset shadow and paper face on T, its outline on K
const card = (T, K, x, y, w, h, o = {}) => {
  const look = withDefaults(o, { r: 26, sh: 22, shade: C.k60, lw: 6, stroke: C.ink, tone: null });
  if (look.sh) fillRR(T, x + look.sh, y + look.sh, w, h, look.r, look.shade);
  fillRR(T, x, y, w, h, look.r, look.tone || '#FFFFFF');
  if (look.lw) strokeRR(K, x, y, w, h, look.r, look.stroke, look.lw);
}
const circle = (ctx, x, y, r, fill, stroke, lw = 6) => {
  runOps(ctx, [['beginPath'], ['arc', x, y, Math.max(0, r), 0, TAU]]);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (!stroke) return;
  ctx.lineWidth = lw;
  ctx.strokeStyle = stroke;
  ctx.stroke();
}
const line = (ctx, x1, y1, x2, y2, col = C.ink, lw = 6, cap = 'round') => {
  polyPath(ctx, [[x1, y1], [x2, y2]]);
  Object.assign(ctx, { strokeStyle: col, lineCap: cap, lineWidth: lw });
  ctx.stroke();
}

/* ---------- type ---------- */
// the CSS font string for a style {font, weight, size, italic}: the Oswald voice is always upright 500-700, the display face is
// always ExtraBold and set 6 % larger
const font = (o) => {
  const size = o.size || 100;
  const voice = o.font === F.serif || o.font === F.voice;
  if (voice) return `${Math.max(500, Math.min(700, (o.weight || 600) + 200))} ${size}px ${F.voice}`;
  if (o.font === F.anton) return `800 ${size * 1.06}px ${F.anton}`;
  return `${o.italic ? 'italic ' : ''}${o.weight || 700} ${size}px ${o.font || F.grot}`;
}
// one line of text; o: {font, weight, size, italic, align, base, ls (letter spacing), color, slw + stroke (an outline)}
const text = (ctx, str, x, y, o = {}) => {
  ctx.save();
  const look = { font: font(o), textAlign: o.align || 'center', textBaseline: o.base || 'alphabetic', letterSpacing: (o.ls || 0) + 'px' };
  Object.assign(ctx, look);
  if (o.slw) {
    Object.assign(ctx, { strokeStyle: o.stroke || C.paper, lineJoin: 'round', lineWidth: o.slw });
    ctx.strokeText(str, x, y);
  }
  ctx.fillStyle = o.color || C.ink;
  ctx.fillText(str, x, y);
  ctx.restore();
}
const measure = (ctx, str, o) => {
  ctx.save();
  Object.assign(ctx, { font: font(o), letterSpacing: (o.ls || 0) + 'px' });
  const { width } = ctx.measureText(str);
  ctx.restore();
  return width;
}
// lay a string out glyph by glyph (with the context's current font): each glyph's centre x and width, and the total width
const glyphLayout = (ctx, str, x, o) => {
  const glyphs = [...str].map(ch => ({ ch, w: ctx.measureText(ch).width }));
  const gap = o.ls || 0;
  const total = glyphs.reduce((sum, g) => sum + g.w, 0) + gap * (glyphs.length - 1);
  let pen = o.align === 'left' ? x : o.align === 'right' ? x - total : x - total / 2;
  for (const g of glyphs) {
    g.mid = pen + g.w / 2;
    pen += g.w + gap;
  }
  return { glyphs, total };
}
// kinetic type, one glyph at a time: fn(i, n, ch) → {dx, dy, s, sx, sy, r (degrees), a (alpha), c (colour)}
const LIB_GLYPH_REST = { dx: 0, dy: 0, s: 1, sx: 1, sy: 1, r: 0, a: 1 };
const letters = (ctx, str, x, y, o, fn) => {
  ctx.save();
  Object.assign(ctx, { font: font(o), letterSpacing: '0px' });
  const { glyphs, total } = glyphLayout(ctx, str, x, o);
  ctx.restore();
  glyphs.forEach(({ ch, mid }, i) => {
    const m = { ...LIB_GLYPH_REST, ...fn(i, glyphs.length, ch) };
    if (!(m.a > 0.001 && m.s > 0.001 && ch !== ' ')) return;
    ctx.save();
    ctx.globalAlpha *= clamp(m.a);
    ctx.translate(mid + m.dx, y + m.dy);
    ctx.rotate(m.r * D2R);
    ctx.scale(m.s * m.sx, m.s * m.sy);
    const look = { ...o, align: 'center', ls: 0 };
    if (m.c) look.color = m.c;
    text(ctx, ch, 0, 0, look);
    ctx.restore();
  });
  return total;
}
// a rolling counter: every digit column spins up to its value as p goes 0 → 1, the rightmost column first, each a few extra turns
const slot = (ctx, str, x, y, o, p) => {
  ctx.save();
  ctx.font = font(o);
  const { glyphs, total } = glyphLayout(ctx, str, x, o);
  const size = o.size || 100;
  const rowH = size * 1.12;
  const look = { ...o, align: 'center', ls: 0 };
  const digits = glyphs.filter(g => /\d/.test(g.ch));
  digits.forEach((g, n) => { g.column = digits.length - 1 - n; });
  for (const g of glyphs) {
    if (g.column === undefined) {
      text(ctx, g.ch, g.mid, y, look);
      continue;
    }
    const travel = E.outCubic(clamp(p * 1.5 - g.column * 0.07)) * (+g.ch + 10 * (2 + g.column % 3));
    const base = Math.floor(travel);
    ctx.save();
    ctx.beginPath();
    ctx.rect(g.mid - g.w, y - size * 0.95, g.w * 2, rowH);
    ctx.clip();
    for (const d of [base - 1, base, base + 1]) text(ctx, String(((d % 10) + 10) % 10), g.mid, y + (d - travel) * rowH, look);
    ctx.restore();
  }
  ctx.restore();
  return total;
}

/* ---------- marks ---------- */
const segLength = (p, q) => Math.hypot(q[0] - p[0], q[1] - p[1]);
// stroke a polyline drawn on as p goes 0 → 1 (dash trick), with the given stroke withDefaults
const drawOnStroke = (ctx, pts, p, look) => {
  const length = pts.slice(1).reduce((sum, q, i) => sum + segLength(pts[i], q), 0);
  ctx.save();
  Object.assign(ctx, look);
  ctx.setLineDash([length, length]);
  ctx.lineDashOffset = length * (1 - p);
  polyPath(ctx, pts);
  ctx.stroke();
  ctx.restore();
}
// a check mark drawn on as p goes 0 → 1
const LIB_CHECK = [[-0.45, 0.02], [-0.12, 0.34], [0.5, -0.32]];
const check = (ctx, x, y, s, p, color = C.ink, lw = 12) => {
  if (p > 0) drawOnStroke(ctx, LIB_CHECK.map(([u, v]) => [x + u * s, y + v * s]), p, { strokeStyle: color, lineWidth: lw, lineCap: 'round', lineJoin: 'round' });
}
// a cross: the first stroke over p 0 → 0.5, the second over 0.5 → 1
const cross = (ctx, x, y, s, p, color = C.red, lw = 12) => {
  if (p <= 0) return;
  const half = s / 2;
  const strokes = [[x - half, 1, clamp(p * 2)], [x + half, -1, clamp(p * 2 - 1)]];
  ctx.save();
  Object.assign(ctx, { strokeStyle: color, lineWidth: lw, lineCap: 'round' });
  strokes.forEach(([x0, dir, k], i) => {
    if (i && k <= 0) return;
    polyPath(ctx, [[x0, y - half], [x0 + dir * s * k, y - half + s * k]]);
    ctx.stroke();
  });
  ctx.restore();
}
// stroke any path progressively: pathFn(ctx) adds the path (its length ≈ len), p 0 → 1
const strokeP = (ctx, pathFn, len, p, col = C.ink, lw = 6) => {
  if (p <= 0) return;
  ctx.save();
  ctx.setLineDash([len, len]);
  Object.assign(ctx, { lineDashOffset: len * (1 - p), strokeStyle: col, lineWidth: lw, lineCap: 'round', lineJoin: 'round' });
  pathFn(ctx);
  ctx.stroke();
  ctx.restore();
}
// radial burst lines that shoot out and vanish over dur seconds (every other ray shorter and turned a little)
const burst = (ctx, x, y, dt, o = {}) => {
  const b = withDefaults(o, { n: 12, r0: 90, r1: 300, color: C.ink, lw: 9, dur: 0.4, rot: 0 });
  if (dt < 0 || dt > b.dur) return;
  const p = dt / b.dur;
  const head = E.outCubic(p), tail = E.outCubic(clamp(p * 1.6 - 0.35));
  ctx.save();
  Object.assign(ctx, { strokeStyle: b.color, lineWidth: b.lw * (1 - p * 0.6), lineCap: 'round' });
  for (let i = 0; i < b.n; i++) {
    const odd = i % 2;
    const ang = b.rot + i * TAU / b.n + odd * 0.12;
    const reach = b.r1 * (odd ? 0.75 : 1);
    const [from, to] = [lerp(b.r0, reach, tail), lerp(b.r0, reach, head)];
    if (to - from < 1) continue;
    const [cx, cy] = [Math.cos(ang), Math.sin(ang)];
    polyPath(ctx, [[x + cx * from, y + cy * from], [x + cx * to, y + cy * to]]);
    ctx.stroke();
  }
  ctx.restore();
}
// an expanding ring that fades out
const shock = (ctx, x, y, dt, o = {}) => {
  const s = withDefaults(o, { r: 320, color: C.ink, lw: 10, dur: 0.5 });
  if (dt < 0 || dt > s.dur) return;
  const p = dt / s.dur;
  ctx.save();
  ctx.globalAlpha = 1 - p;
  circle(ctx, x, y, s.r * E.outExpo(p), null, s.color, s.lw * (1 - p) + 1);
  ctx.restore();
}

/* ---------- the rubber stamp ---------- */
// its frame size and baselines for a word (and an optional mono line under it)
const stampGeometry = (K, str, look) => {
  const { size, pad, sub } = look;
  const word = { font: look.font, weight: 400, size, ls: 4 };
  const small = { font: F.mono, weight: 700, size: Math.round(size * 0.22), ls: 3 };
  const inner = Math.max(measure(K, str, word), sub ? measure(K, sub, small) : 0);   // the frame fits the wider line
  const w = inner + pad * 2;
  const h = size * 1.08 + pad * 1.1 + (sub ? pad * 0.5 + small.size * 0.75 : 0);
  const main = sub ? -h / 2 + size * 0.17 + pad * 0.55 + size * 0.74 : size * 0.4;
  return { w, h, word, small, main, under: main + pad * 0.5 + small.size * 0.75 };
}
// a stamp slamming down (2.6× → 1× in 0.14 s, then a small ring) with worn ink
const stamp = (K, T, str, x, y, dt, o = {}) => {
  if (dt < 0) return;
  const look = withDefaults(o, { size: 120, rot: -8, col: C.red, pad: 34, font: F.anton, sub: null });
  const L = stampGeometry(K, str, look);
  const k = dt < 0.14 ? lerp(2.6, 1, E.inQuart(dt / 0.14)) : 1 + ring(dt - 0.14, 5, 12) * 0.05;
  K.save();
  K.translate(x, y);
  K.rotate(look.rot * D2R);
  K.scale(k, k);
  K.globalAlpha *= clamp(dt / 0.06);
  strokeRR(K, -L.w / 2, -L.h / 2, L.w, L.h, 16, look.col, 10);
  strokeRR(K, -L.w / 2 + 16, -L.h / 2 + 16, L.w - 32, L.h - 32, 8, look.col, 4);
  text(K, str, 0, L.main, { ...L.word, color: look.col });
  if (look.sub) text(K, look.sub, 0, L.under, { color: look.col, ...L.small });
  K.globalCompositeOperation = 'destination-out';   // knock out specks of worn ink
  const speck = rng(str.length * 91 + Math.round(x));
  for (let i = 0; i < 70; i++) {
    const sx = (speck() - 0.5) * L.w;
    const sy = (speck() - 0.5) * L.h;
    circle(K, sx, sy, speck() * 5 + 1, '#000');
  }
  K.restore();
}

/* ---------- glyphs ---------- */
// draw a glyph in its own little frame: moved to (x, y), scaled by s
const inGlyphFrame = (ctx, x, y, s, fn) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  fn();
  ctx.restore();
}
const LIB_PERSON = [['beginPath'], ['arc', 0, -38, 22, 0, TAU], ['fill'],
  ['beginPath'], ['moveTo', -40, 40], ['quadraticCurveTo', -40, -8, 0, -8], ['quadraticCurveTo', 40, -8, 40, 40], ['closePath'], ['fill']];
const person = (ctx, x, y, s, fill = C.ink) => {
  inGlyphFrame(ctx, x, y, s, () => {
    ctx.fillStyle = fill;
    runOps(ctx, LIB_PERSON);
  });
}
const LIB_CURSOR = [[0, 0], [0, 92], [24, 70], [42, 108], [60, 100], [42, 62], [74, 60]];
const cursor = (ctx, x, y, s = 1, press = 0) => {
  inGlyphFrame(ctx, x, y, s * (1 - press * 0.18), () => {
    polyPath(ctx, LIB_CURSOR, true);
    ctx.fillStyle = C.paper;
    ctx.fill();
    Object.assign(ctx, { strokeStyle: C.ink, lineJoin: 'round', lineWidth: 7 });
    ctx.stroke();
  });
}
const envelope = (ctx, x, y, w, h, lw = 6, col = C.ink, fill = C.paper) => {
  const left = x - w / 2, top = y - h / 2;
  fillRR(ctx, left, top, w, h, 10, fill);
  strokeRR(ctx, left, top, w, h, 10, col, lw);
  polyPath(ctx, [[left + 8, top + 8], [x, y + h * 0.08], [x + w / 2 - 8, top + 8]]);   // the flap
  Object.assign(ctx, { strokeStyle: col, lineJoin: 'round', lineWidth: lw });
  ctx.stroke();
}
const warn = (ctx, x, y, s, col = C.red) => {
  inGlyphFrame(ctx, x, y, s, () => {
    polyPath(ctx, [[0, -50], [52, 42], [-52, 42]], true);
    Object.assign(ctx, { fillStyle: col, strokeStyle: col, lineJoin: 'round', lineWidth: 12 });
    ctx.fill();
    ctx.stroke();
    text(ctx, '!', 0, 34, { font: F.anton, weight: 400, size: 70, color: C.paper });
  });
}

/* ---------- keyframes ---------- */
// Track({x: 0, s: 1}).key(t, {x: 120}, ease).at(t): every property tweened between its keys; each key carries the ease into it
const Track = (defaults) => {
  const lanes = new Map(Object.entries(defaults).map(([name, v]) => [name, [[-1e9, v, E.lin]]]));
  const valueAt = (lane, t) => {
    let i = lane.length - 1;
    while (i > 0 && lane[i][0] > t) i--;
    const [t0, v0] = lane[i];
    const next = lane[i + 1];
    if (!next) return v0;
    const [t1, v1, ease] = next;
    return lerp(v0, v1, ease(inv(t0, t1, t)));
  };
  return {
    key(t, props, e = E.inOutCubic) {
      for (const name in props) {
        if (!lanes.has(name)) lanes.set(name, []);
        const lane = lanes.get(name);
        lane.push([t, props[name], e]);
        lane.sort((a, b) => a[0] - b[0]);
      }
      return this;
    },
    at(t) {
      const out = {};
      lanes.forEach((lane, name) => { out[name] = valueAt(lane, t); });
      return out;
    },
  };
}
