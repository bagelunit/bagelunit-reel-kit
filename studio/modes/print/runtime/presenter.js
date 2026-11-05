/* Susanoo Reel Kit print · presenter
   The host: a flat cut-paper bust drawn with Canvas 2D. On the ink layer every shape is one flat colour with one shade plane;
   on the tone layer the whole silhouette casts one soft offset shadow.

   How it is put together
   · new Host(state) compiles the pose: a root matrix, the torso and head matrices and two arm chains (shoulder → elbow → wrist).
   · host.draw(T, K) paints torso → head → arms through a Pen (a thin wrapper around a 2D context) in bust space: s = 1, origin
     on the bottom-centre crop line, y down, about 830 px tall.
   · Shapes are written as SVG path data or as point lists ("x,y" pairs, a trailing * marks a sharp corner).
   Public: window.PRESENTER = { ready, draw(T, K, state), anchors(state, t?), rig(state), look(o), DEFAULT, SKINS, HAIRCOLS,
   HAIRSTYLES } (also window.GUY3D). Every frame is a pure function of the state. */
(() => {
  'use strict';

  /* ---------- numbers ---------- */
  const RAD = Math.PI / 180;
  const FULL = 2 * Math.PI;
  const HALF = Math.PI;
  function clamp(v, lo = 0, hi = 1) {
    v = +v;
    if (v < lo) return lo;
    if (v > hi) return hi;
    return v;
  }
  // 0 → 1 as v runs from `from` to `to`
  function ramp(v, from, to) { return clamp((v - from) / (to - from)); }
  function lerp(a, b, k) { return a + (b - a) * k; }
  function settle(k) { const c = clamp(k); return c * c * (3 - 2 * c); }
  function wrapTurn(a) {
    let r = a;
    while (r > HALF) r -= FULL;
    while (r < -HALF) r += FULL;
    return r;
  }
  const pos = Math.max;

  /* ---------- 2D vectors (plain [x, y] arrays) ---------- */
  const vec = {
    sum: ([ax, ay], [bx, by]) => [ax + bx, ay + by],
    diff: ([ax, ay], [bx, by]) => [ax - bx, ay - by],
    scaled: ([x, y], k) => [x * k, y * k],
    step: ([x, y], [dx, dy], k) => [x + dx * k, y + dy * k],
    length: ([x, y]) => Math.hypot(x, y),
    norm([x, y]) {
      const l = Math.hypot(x, y) || 1;
      return [x / l, y / l];
    },
    left: ([x, y]) => [-y, x],
    dot: ([ax, ay], [bx, by]) => ax * bx + ay * by,
    cross: ([ax, ay], [bx, by]) => ax * by - ay * bx,
    between: ([ax, ay], [bx, by], k) => [lerp(ax, bx, k), lerp(ay, by, k)],
    fromAngle: a => [Math.cos(a), Math.sin(a)],
    angle: ([x, y]) => Math.atan2(y, x),
  };

  /* ---------- colour ---------- */
  function channels(hex) { return [hex.substr(1, 2), hex.substr(3, 2), hex.substr(5, 2)].map(h => parseInt(h, 16)); }
  function tint(a, b, k) {
    const from = channels(a);
    const to = channels(b);
    let out = '#';
    for (let i = 0; i < 3; i++) out += (0x100 + Math.round(from[i] + (to[i] - from[i]) * k)).toString(16).slice(1);
    return out;
  }

  /* ---------- shapes ---------- */
  const svg = d => new Path2D(d);
  const identity = () => new DOMMatrix();
  function pts(text) {
    return text.trim().split(/\s+/).map(token => {
      const sharp = token.endsWith('*');
      const xy = (sharp ? token.slice(0, -1) : token).split(',').map(Number);
      if (sharp) xy.push(1);
      return xy;
    });
  }
  // a smooth closed (or open) outline through the points: Catmull-Rom as cubic Béziers, sharp points get no handles
  function spline(path, P, open = false, tension = 1) {
    const n = P.length;
    const pick = i => open ? P[Math.min(n - 1, Math.max(0, i))] : P[(i + n) % n];
    const handle = q => q[2] ? 0 : tension / 6;
    path.moveTo(P[0][0], P[0][1]);
    const last = open ? n - 1 : n;
    for (let i = 0; i < last; i++) {
      const here = pick(i);
      const next = pick(i + 1);
      const out = vec.step(here, vec.diff(next, pick(i - 1)), handle(here));
      const into = vec.step(next, vec.diff(here, pick(i + 2)), handle(next));
      path.bezierCurveTo(out[0], out[1], into[0], into[1], next[0], next[1]);
    }
    if (!open) path.closePath();
    return path;
  }
  function outline(list, path = new Path2D()) { return spline(path, typeof list === 'string' ? pts(list) : list); }
  function blobs(path, list) {
    list.forEach(([x, y, r]) => {
      path.moveTo(x + r, y);
      path.arc(x, y, r, 0, FULL);
    });
    return path;
  }
  // a round-ended tube from a (radius ra) to b (radius rb)
  function tube(path, a, b, ra, rb) {
    const along = vec.norm(vec.diff(b, a));
    const side = vec.left(along);
    const facing = vec.angle(along);
    const quarter = HALF / 2;
    path.moveTo(...vec.step(a, side, ra));
    path.lineTo(...vec.step(b, side, rb));
    path.arc(...b, rb, facing + quarter, facing - quarter, true);      // round tip
    path.lineTo(...vec.step(a, side, -ra));
    path.arc(...a, ra, facing - quarter, facing - 3 * quarter, true);  // round root
    path.closePath();
    return path;
  }
  // a brush mark along the quadratic a → c → b, width w0 → w1 → w2, round at both ends (the brows)
  // the quadratic Bézier a → c → b at k: its point (Bernstein weights) and its derivative
  function quadPoint(a, c, b, k) {
    const j = 1 - k;
    const weights = [j * j, 2 * j * k, k * k];
    return [0, 1].map(axis => weights[0] * a[axis] + weights[1] * c[axis] + weights[2] * b[axis]);
  }
  function quadTangent(a, c, b, k) {
    const j = 1 - k;
    return [0, 1].map(axis => 2 * j * (c[axis] - a[axis]) + 2 * k * (b[axis] - c[axis]));
  }
  function brush(path, a, c, b, w0, w1, w2, steps = 14) {
    const samples = Array.from({ length: steps + 1 }, (_, i) => {
      const k = i / steps;
      const tg = quadTangent(a, c, b, k);
      const l = Math.hypot(...tg) || 1;
      const half = (k < 0.5 ? lerp(w0, w1, k * 2) : lerp(w1, w2, k * 2 - 1)) / 2;
      return { at: quadPoint(a, c, b, k), off: [tg[1] / l * half, tg[0] / l * half], dir: Math.atan2(tg[1], tg[0]) };
    });
    const sideA = samples.map(({ at, off }) => [at[0] - off[0], at[1] + off[1]]);
    const sideB = samples.map(({ at, off }) => [at[0] + off[0], at[1] - off[1]]).reverse();
    const q = HALF / 2;
    const first = samples[0].dir;
    const last = samples[steps].dir;
    path.moveTo(...sideA[0]);
    sideA.forEach(p => path.lineTo(...p));
    path.arc(...b, w2 / 2, last + q, last - q, true);
    sideB.forEach(p => path.lineTo(...p));
    path.arc(...a, w0 / 2, first - q, first - 3 * q, true);
    path.closePath();
    return path;
  }
  function oval(x, y, rx, ry, rot = 0) { const p = new Path2D(); p.ellipse(x, y, rx, ry, rot, 0, FULL); return p; }
  function disc(x, y, r) { const p = new Path2D(); p.arc(x, y, r, 0, FULL); return p; }
  function rounded(x, y, w, h, r) { const p = new Path2D(); p.roundRect(x, y, w, h, r); return p; }

  /* ---------- the pen: every ink and tone operation goes through it ---------- */
  const OUTSIDE = svg('M-9000 -9000h18000v18000h-18000z');
  const CAST = 'rgba(17,17,17,0.2)';
  class Pen {
    constructor(ctx) { this.c = ctx; }
    fill(shape, colour) { this.c.fillStyle = colour; this.c.fill(shape); return this; }
    // flat colour plus a shade plane: what the shape's own copy, nudged toward the light by (dx, dy), leaves uncovered
    shade(shape, base, dark, dx, dy) {
      this.fill(shape, base);
      if (!dark) return this;
      const rest = new Path2D(OUTSIDE);
      rest.addPath(shape, identity().translateSelf(dx, dy));
      this.c.save();
      this.c.clip(shape);
      this.c.fillStyle = dark;
      this.c.fill(rest, 'evenodd');
      this.c.restore();
      return this;
    }
    line(shape, width, colour) {
      this.c.lineWidth = width;
      this.c.strokeStyle = colour;
      this.c.stroke(typeof shape === 'string' ? svg(shape) : shape);
      return this;
    }
    // run fn with the context clipped (optional), moved and scaled, then put it back
    within(fn, x = 0, y = 0, sx = 1, sy = sx, clip = null) {
      this.c.save();
      if (clip) this.c.clip(clip);
      if (x || y) this.c.translate(x, y);
      if (sx !== 1 || sy !== 1) this.c.scale(sx, sy);
      fn();
      this.c.restore();
    }
    cast(shape, dx, dy) { this.within(() => this.fill(shape, CAST), dx, dy); }
  }

  /* ---------- the look (reel.json "presenter") ---------- */
  // "key=value ..." → an object (values: numbers, true / false / null, [] for an empty list, everything else a string)
  function keyed(text) {
    const out = {};
    for (const pair of text.trim().split(/\s+/)) {
      const [k, v] = pair.split('=');
      out[k] = v === 'null' ? null : v === 'true' ? true : v === 'false' ? false : v === '[]' ? [] : v !== '' && !isNaN(+v) ? +v : v;
    }
    return out;
  }
  const SKINS = keyed('porcelain=#F4E1D2 fair=#F1D9C4 light=#EAD3BE medium=#DDB592 olive=#C99B72 tan=#B98259 brown=#8E5B3C deep=#5F3B27');
  const HAIRCOLS = keyed('black=#1C1A19 darkbrown=#2E2723 brown=#5A4030 chestnut=#7A4A2A auburn=#8C3B22 red=#B5532A blonde=#C9A266 platinum=#DCD3C2 grey=#8F8A84 white=#E9E6E0');
  // skin: a SKINS name or '#hex' · hair: swept crop fringe curtain messy wavy curly buzz bald · long wavylong longcurly · ponytail bun
  // hairColor: a HAIRCOLS name or '#hex' · beard: none | stubble | full (beardColor null = the hair colour)
  // glassesStyle: square | round, glassesW: frame line width (4-5 thin wire, 7, 9-10 chunky) · top: tee | overshirt | hoodie | collar
  // accessories: any of earrings necklace headphones mic · face: adult | young
  const DEFAULT = keyed(`skin=medium hair=curly hairColor=black beard=stubble beardColor=null beanie=false beanieColor=#111111 beanieTab=true
    glasses=true glassesStyle=square glassesColor=#111111 glassesW=7 lashes=false top=hoodie topColor=#1E2A44 innerColor=#F6F5F1
    accessories=[] face=adult slim=false`);
  function swatch(value, named, fallback) {
    if (!value) return fallback;
    if (named[value]) return named[value];
    return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
  }
  const SWATCHES = [['skinHex', 'skin', SKINS, SKINS.medium], ['hairHex', 'hairColor', HAIRCOLS, HAIRCOLS.darkbrown], ['topHex', 'topColor', {}, '#4A5260'],
    ['innerHex', 'innerColor', {}, '#F6F5F1'], ['beanieHex', 'beanieColor', {}, '#111111'], ['glassesHex', 'glassesColor', {}, '#111111']];
  function resolveLook(o) {
    const L = { ...DEFAULT, ...(o || {}) };
    for (const [into, from, named, fallback] of SWATCHES) L[into] = swatch(L[from], named, fallback);
    L.beardHex = swatch(L.beardColor, HAIRCOLS, L.hairHex);
    L.young = L.face === 'young';
    L.acc = new Set(L.accessories || []);
    L.beard = L.beard === true ? 'full' : L.beard || 'none';
    return L;
  }
  // the palette: ink, paper, accent and the look's colours; every shade is one of them mixed toward ink or paper
  const INK = '#111111';
  const PAPER = '#F6F5F1';
  // shade recipes: name = base > toward : amount (base and toward are the look's colours, the accent, ink or paper)
  const RECIPES = `skinSh=skin>ink:.14 skinLine=skin>ink:.42 stubble=skin>beard:.3 fade=beard>skin:.62 lipSoft=skin>accent:.16 tongue=accent>ink:.22
    topSh=top>ink:.25 topLt=top>paper:.3 beardSh=beard>ink:.5 teeSh=tee>ink:.1 teeLine=tee>ink:.24 cuff=cap>paper:.14 crownLt=cap>paper:.07`
    .trim().split(/\s+/).map(r => r.split(/[=>:]/));
  let PAL = { key: '' };
  function usePalette(wanted) {
    const accent = window.ACCENT || '#C8603A';
    const key = JSON.stringify(wanted || null) + accent;
    if (PAL.key === key) return PAL.look;
    const L = resolveLook(wanted);
    const base = { skin: L.skinHex, top: L.topHex, beard: L.beardHex, tee: L.innerHex, cap: L.beanieHex, accent, ink: INK, paper: PAPER };
    const next = { key, look: L, accent, skin: base.skin, top: base.top, tee: base.tee, lip: tint(tint(base.skin, accent, 0.2), INK, 0.12) };
    for (const [name, from, toward, amount] of RECIPES) next[name] = tint(base[from], base[toward], +amount);
    PAL = next;
    return L;
  }

  /* ---------- proportions (bust space) ---------- */
  const NECK = -360;                 // head pivot at the jaw
  const EYES = -215;                 // eye line, above the pivot
  const SHOULDER = [226, -264];      // screen-right shoulder; the left arm is its mirror image
  const UPPER = 182;
  const LOWER = 168;
  const REACH = UPPER + LOWER;
  const HAND = 1.24;
  const SKULL = 170;                 // sphere radius for the fake head turn
  const SLIM = 0.88;

  /* ---------- hands: wrist at the origin, +y toward the fingertips, +x on the thumb side ---------- */
  // index curl · finger curl · thumb angle° · thumb reach · spread · thumb base y · palm crease
  const HANDS = {};
  for (const row of 'rest .35 .45 18 .6 .1 20 0 / point 0 1 -38 .5 0 24 0 / open 0 0 58 1 1 20 1 / flat 0 0 20 .85 .1 20 0 / fist 1 1 -58 .45 0 26 0 / thumb 1 1 92 1 0 38 0'.split('/')) {
    const f = row.trim().split(' ');
    HANDS[f[0]] = { ci: +f[1], cm: +f[2], ta: +f[3], te: +f[4], sp: +f[5], tb: +f[6], palm: +f[7] };
  }
  const DIGITS = [];   // x · length · radius · splay°, pinky → index
  for (const row of '-23 47 9.5 -22 / -8 59 10.5 -8 / 8 63 11 2 / 24 57 10.5 11'.split('/')) DIGITS.push(row.trim().split(' ').map(Number));
  const PALM = svg('M-22 -6C-30 14 -37 34 -35 54C-34 66 -20 70 0 70C20 70 35 66 36 52C37 36 32 14 24 -6Z');
  function handParts(H) {
    const curls = [H.cm, H.cm, H.cm, H.ci];
    const creases = new Path2D();
    const toward = deg => [Math.sin(deg * RAD), Math.cos(deg * RAD)];
    const fingers = DIGITS.map(([x, length, r, splay], i) => {
      const root = [x * (1 + 0.12 * H.sp), 56];
      const tip = vec.step(root, toward(splay * H.sp), length * (1 - 0.74 * curls[i]));
      if (curls[i] > 0.55) {   // a curled finger shows its knuckle fold
        creases.moveTo(tip[0] - r * 0.7, tip[1] - 2);
        creases.lineTo(tip[0] + r * 0.7, tip[1] - 2);
      }
      return tube(new Path2D(), root, tip, r, r * 0.9);
    });
    const thumbRoot = [27, H.tb];
    const thumb = tube(new Path2D(), thumbRoot, vec.step(thumbRoot, toward(H.ta), 22 + H.te * 28), 13, 11);
    return { parts: [...fingers, PALM, thumb], creases };
  }
  function drawHand(pen, H, scale) {
    const { parts, creases } = handParts(H);
    const c = pen.c;
    c.lineJoin = 'round';
    c.lineWidth = 2.6 / scale;
    c.strokeStyle = PAL.skinLine;
    c.fillStyle = PAL.skin;
    parts.forEach(p => { c.fill(p); c.stroke(p); });
    if (H.palm > 0.5) c.stroke(svg('M-22 44Q0 52 24 30'));
    c.stroke(creases);
  }

  /* ---------- gestures ---------- */
  // fixed gestures (screen-right arm frame): wrist point (head: = a point on the face) · elbow pole · hand · finger angle°
  // (pi, or - to follow the forearm) · thumb direction · shoulder raise
  const FIXED = {};
  for (const row of `thumb 196,-222 1,.6 thumb pi 0,-1
    shrug 396,-250 .2,1 open -24 0,-1 26
    facepalm head:98,60 1,.7 flat -116 -.2,1
    cover head:132,150 1,.8 flat 190 0,-1
    shh head:16,224 1,.9 point -90 -1,0
    hold 150,-170 1,.6 open 196 0,-1
    fist 334,-512 1,.3 fist -90 -1,0
    down 286,72 1,.12 rest - -1,0`.split('\n')) {
    const f = row.trim().split(/\s+/);
    const pair = s => s.split(',').map(Number);
    FIXED[f[0]] = {
      face: f[1].startsWith('head:'), spot: pair(f[1].replace('head:', '')), pole: pair(f[2]), hand: f[3],
      fa: f[4] === '-' ? null : f[4] === 'pi' ? HALF : +f[4] * RAD, th: pair(f[5]), raise: f[6] === undefined ? undefined : +f[6],
    };
  }
  // aimed gestures follow the pointing angle (radians)
  function aimPoint(a) {   // steep up-points bend the elbow out and pull the wrist in, so it reads as a reach
    const d = vec.fromAngle(a);
    const up = ramp(-a / RAD, 62, 88);
    return { hand: 'point', th: [d[1], -d[0]], fa: a - up * 0.12, pole: vec.between([0.2, 1], [1, 0.25], up), W: vec.step(SHOULDER, d, REACH - 24 - 46 * up) };
  }
  function aimPresent(a) { // the open palm offered toward the target; up aims keep the wrist out at the side, palm up
    const up = ramp(-a / RAD, 20, 45);
    const aim = lerp(a, pos(a, -40 * RAD), up);
    const d = vec.fromAngle(aim);
    return { hand: 'open', th: [d[1], -d[0]], fa: lerp(a - 28 * RAD, -16 * RAD, up), pole: [0.5, 1], W: vec.step(SHOULDER, d, REACH - lerp(70, 40, up)) };
  }
  function aimFrame(raw) { // both hands raised toward the target, fingers up, never beside the ears
    const a = clamp(raw, -150 * RAD, -15 * RAD);
    const up = ramp(-a / RAD, 50, 80);
    const aim = lerp(a, pos(a, -58 * RAD), up);
    const d = vec.fromAngle(aim);
    return { hand: 'open', th: [-1, 0], fa: lerp(aim, -HALF / 2, lerp(0.65, 0.4, up)), pole: [1, 0.45], W: vec.step(SHOULDER, d, REACH - lerp(150, 96, up)) };
  }
  const AIMED = { point: aimPoint, present: aimPresent, frame: aimFrame };
  function gestureOf(name, st, faceSpot, side) {
    if (Object.prototype.hasOwnProperty.call(AIMED, name)) return AIMED[name]((st['pointAng' + side] ?? st.pointAng ?? 0) * RAD);
    if (name === 'wave') {
      const sway = Math.sin(st.wave || 0);
      return { hand: 'open', th: [-1, 0], fa: (-92 + sway * 15) * RAD, pole: [1, 0.45], W: [372 + sway * 22, -548] };
    }
    const g = FIXED[name] || FIXED.down;
    return { hand: g.hand, th: g.th, fa: g.fa, pole: g.pole, raise: g.raise, W: g.face ? faceSpot(g.spot[0], g.spot[1]) : g.spot };
  }
  function thumbSide(fa, th) { return Math.sin(fa) * th[0] - Math.cos(fa) * th[1] >= 0 ? 1 : -1; }
  // two-bone reach: shoulder S toward wrist target W, the elbow bending to the pole side
  function twoBone(S, W, pole) {
    const toW = vec.diff(W, S);
    const u = vec.norm(toW);
    const d = clamp(vec.length(toW), Math.abs(UPPER - LOWER) + 6, REACH - 1);
    const along = (UPPER * UPPER - LOWER * LOWER + d * d) / (2 * d);
    const out = Math.sqrt(pos(0, UPPER * UPPER - along * along));
    let bend = vec.left(u);
    if (vec.dot(bend, pole) < 0) bend = vec.scaled(bend, -1);
    return { E: vec.step(vec.step(S, u, along), bend, out), W: vec.step(S, u, d) };
  }
  // hands at the face pull the head down: facepalm and cover fully, shh by a third
  function faceDip(st, side) {
    const g = st['arm' + side];
    const amount = clamp(st['arm' + side + 'p'] ?? 1);
    if (g === 'facepalm' || g === 'cover') return amount;
    if (g === 'shh') return 0.35 * amount;
    return 0;
  }

  /* ---------- the mouth: one family of shapes (closed line ↔ D ↔ wide ↔ O) from the viseme values ---------- */
  function mouthOf(st) {
    const given = (k, d = 0) => st[k] ?? d;
    const press = clamp(given('press'));
    const teeth = clamp(given('teeth'));
    const tongue = clamp(given('tongue'));
    const smile = clamp(given('smile', 0.3), -1, 1);
    const lipW = clamp(given('lipW'), -1, 1);
    const round = clamp(-lipW);
    const grin = pos(0, smile);
    const open = clamp(given('jaw', given('mouth') * 0.85), 0, 1.1) * (1 - press);
    const pucker = 0.46 * round * (0.55 + 0.45 * clamp(open * 2.5));
    const h = pos(2.5 + open * 76, teeth * 19 * (1 - press) * (1 - round * 0.6));
    const raise = smile * 9 - pos(0, open - 0.45) * 7;
    const tall = h / 0.75;
    const upperPart = tall * lerp(0.22, 0.44, round);
    const m = { open, round, press, tongue, teeth, smile, h, jd: open * 24 };
    m.w = 92 * (1 + 0.2 * clamp(lipW) - pucker) * (1 - 0.05 * press) + grin * 6;
    m.cyL = -raise;
    m.cyR = -raise - grin * 4;                  // a dry smirk: the screen-right corner sits higher
    m.ct = lerp(0.42, 1.0, round);
    m.cb = lerp(0.52, 1.0, round);
    m.D = tall - upperPart;
    m.U = upperPart - grin * 5 * (1 - round) * clamp(open * 3);
    m.lipUp = 5 + round * 5;
    m.lipLo = (13 + round * 5) * (1 - press * 0.35);
    m.tU = open > 0.03 || teeth > 0.05 ? Math.min(h * 0.6, 5 + 10 * pos(teeth, clamp(open * 1.4))) : 0;
    m.tL = teeth * (1 - clamp(open * 2.4)) * 7;
    return m;
  }
  // the opening, grown by `ex` sideways and `up` / `lo` above and below (that is the lips)
  function mouthLoop(m, ex = 0, up = 0, lo = 0) {
    const r = m.w / 2 + ex;
    const over = m.U + up / 0.75;
    const under = m.D + lo / 0.75;
    return svg(`M${-r} ${m.cyL}C${-r * m.ct} ${m.cyL - over} ${r * m.ct} ${m.cyR - over} ${r} ${m.cyR}C${r * m.cb} ${m.cyR + under} ${-r * m.cb} ${m.cyL + under} ${-r} ${m.cyL}Z`);
  }
  // a point on the opening's upper edge (k 0 → 1, left → right), raised by `up`
  function mouthTop(m, k, up = 0) {
    const r = m.w / 2;
    const rise = -m.U - up / 0.75;
    const j = 1 - k;
    const wts = [j * j * j, 3 * j * j * k, 3 * j * k * k, k * k * k];
    const xs = [-r, -r * m.ct, r * m.ct, r];
    const ys = [m.cyL, m.cyL + rise, m.cyR + rise, m.cyR];
    let x = 0;
    let y = 0;
    for (let i = 0; i < 4; i++) { x += wts[i] * xs[i]; y += wts[i] * ys[i]; }
    return [x, y];
  }
  function drawMouth(pen, m, bare) {
    const r = m.w / 2;
    const mid = (m.cyL + m.cyR) / 2;
    const lips = mouthLoop(m, 5, m.lipUp, m.lipLo);
    pen.fill(lips, bare ? PAL.lipSoft : PAL.lip);
    pen.within(() => pen.fill(oval(-r * 0.18, mid + m.D * 0.75 + m.lipLo * 0.42, r * 0.34, m.lipLo * 0.22), 'rgba(246,245,241,0.22)'), 0, 0, 1, 1, lips);
    const hole = mouthLoop(m);
    pen.fill(hole, INK);
    pen.within(() => {
      const o = r + 4;
      if (m.tL > 0.5) pen.fill(svg(`M${-o} ${m.cyL + 90}L${o} ${m.cyR + 90}L${o} ${m.cyR - m.tL}C${r * m.cb} ${m.cyR + m.D - m.tL} ${-r * m.cb} ${m.cyL + m.D - m.tL} ${-o} ${m.cyL - m.tL}Z`), PAPER);
      if (m.h > 7) {
        const ry = pos(7, m.h * 0.34);
        const ty = lerp(mid + 0.75 * m.D - m.h * 0.06, mid - 0.75 * m.U + m.h * 0.46, m.tongue);
        pen.fill(oval(0, ty + ry * 0.55, m.w * (0.3 + 0.06 * m.tongue), ry), PAL.tongue);
      }
      if (m.tU > 0.5) pen.fill(svg(`M${-o} ${m.cyL - 90}L${o} ${m.cyR - 90}L${o} ${m.cyR + m.tU}C${r * m.ct} ${m.cyR - m.U + m.tU} ${-r * m.ct} ${m.cyL - m.U + m.tU} ${-o} ${m.cyL + m.tU}Z`), PAPER);
    }, 0, 0, 1, 1, hole);
    const shut = clamp(1 - (m.h - 3) / 10);    // a closed mouth always reads as a line
    if (shut > 0.02) {
      pen.c.lineCap = 'round';
      pen.line(`M${-r} ${m.cyL}C${-r * m.ct} ${m.cyL - m.U * 0.5} ${r * m.ct} ${m.cyR - m.U * 0.5} ${r} ${m.cyR}`, 4.6 * shut + 0.5, INK);
    }
  }

  /* ---------- head, beard and hair outlines (head space: origin = centre of the eye line) ---------- */
  const SKULL_HALF = pts('0,-214 92,-203 148,-158 166,-84 168,-4 162,66 146,124 110,176 58,207');
  const BEARD_OUT = pts('153,-132* 167,-70 169,0 164,66 150,126 114,180 62,212 0,223');
  const BEARD_IN = pts('151,-132* 154,-40 151,34 134,84 100,108 62,102 30,95 0,97');
  const PART = '146,-58 134,-96 110,-128 80,-156 46,-180 14,-202* 0,-192* -14,-202* -46,-180 -80,-156 -110,-128 -134,-96 -146,-58';
  const TIED = '146,-96 120,-150 80,-176 40,-192 0,-198* -40,-192 -80,-176 -120,-150 -146,-96';
  // name  flags (key=value)  /  hairline (the edge of the fringe), right → left
  const HAIRSTYLES = {};
  for (const row of `fringe lock=5 flow=down / 140,-78 112,-92* 98,-80 80,-96* 60,-84 38,-98* 16,-86 -8,-100* -30,-88 -54,-100* -76,-86 -100,-98* -122,-84 -142,-76
    curtain lock=8 flow=part part=0 / ${PART}
    swept lock=2 flow=sweep part=-108 / 146,-70 122,-84* 104,-90 78,-104* 56,-112 28,-128* 4,-136 -24,-152* -50,-162 -80,-178* -104,-192 -122,-178 -140,-130 -146,-72
    crop lock=-78 flow=up tight / 150,-120 120,-132 80,-140 50,-150* 30,-138 0,-146 -30,-142 -60,-150* -80,-138 -120,-130 -150,-118
    messy lock=-48 flow=messy messy / 132,-88 118,-120 100,-96 84,-132 66,-100 50,-138 34,-84 18,-70 4,-112 -12,-132 -30,-96 -44,-80 -58,-118 -76,-136 -92,-104 -110,-126 -126,-96
    wavy lock=22 flow=wave wavy / 146,-40 134,-86 112,-70 96,-108 70,-84 52,-118 30,-62* 14,-104 -10,-128 -36,-92 -58,-130 -84,-96 -108,-126 -128,-84 -146,-46
    long lock=8 flow=part part=0 long / ${PART}
    ponytail lock=-60 flow=back tight tail / ${TIED}
    bun lock=-60 flow=back tight bun / ${TIED}
    curly lock=-30 flow=curly curly / 150,-96 128,-126 110,-104 88,-136 64,-110 40,-140 16,-114 -8,-142 -32,-112 -56,-140 -80,-108 -104,-134 -126,-104 -150,-94
    longcurly lock=8 flow=curlylong long curls / ${PART}
    wavylong lock=8 flow=wavylong part=0 long waves / ${PART}
    buzz flow=none buzz /`.split('\n')) {
    const [flags, edge] = row.split('/');
    const words = flags.trim().split(/\s+/);
    const style = {};
    for (const w of words.slice(1)) {
      const [k, v] = w.split('=');
      style[k] = v === undefined ? true : isNaN(+v) ? v : +v;
    }
    if (edge.trim()) style.edge = pts(edge);
    HAIRSTYLES[words[0]] = style;
  }
  function hairFor(L) {
    if (!L.hair || L.hair === 'bald' || L.hair === 'none') return null;
    const H = HAIRSTYLES[L.hair] || HAIRSTYLES.crop;
    const lock = H.lock;
    const w = H.tight ? 180 : 188;
    const kit = { H, back: null, extra: null, front: null };
    if (H.buzz) {
      kit.front = outline('-166,-50* -172,-120 -152,-176 -96,-212 0,-222 96,-212 152,-176 172,-120 166,-50* 150,-56* 150,-108 112,-138 56,-150 0,-154 -56,-150 -112,-138 -150,-108 -150,-56*');
      return kit;
    }
    const fringe = H.edge.slice(1, -1);
    if (H.long) {
      kit.front = H.waves
        ? outline(pts('-200,250* -222,180 -204,110 -222,40 -208,-30 -198,-150 -162,-232 -92,-270 0,-278 92,-270 162,-232 198,-150 208,-30 222,40 204,110 222,180 200,250* 152,250* 140,180 158,110 146,40 156,-10 152,-60')
          .concat(fringe, pts('-152,-60 -156,-10 -146,40 -158,110 -140,180 -152,250*')))
        : outline(pts('-202,236* -214,110 -208,-30 -198,-150 -162,-232 -92,-270 0,-278 92,-270 162,-232 198,-150 208,-30 214,110 202,236* 154,236* 150,110 156,-10 152,-60')
          .concat(fringe, pts('-152,-60 -156,-10 -150,110 -154,236*')));
      kit.back = H.waves
        ? outline('-214,340* -246,270 -226,190 -252,110 -232,30 -246,-60 -224,-130 -176,-238 -92,-284 0,-292 92,-284 176,-238 224,-130 246,-60 232,30 252,110 226,190 246,270 214,340*')
        : outline('-212,330* -232,120 -222,-110 -176,-238 -92,-284 0,-292 92,-284 176,-238 222,-110 232,120 212,330*');
      if (H.curls) {   // a curly mass behind, bumpy all round and open under the chin so the top shows
        const bumps = pts('-214,300 -238,220 -246,130 -240,40 -236,-50 -226,-140 -190,-222 -130,-272 -50,-296 50,-296 130,-272 190,-222 226,-140 236,-50 240,40 246,130 238,220 214,300');
        bumps.forEach((b, i) => b.push(34 + (i % 3) * 6));
        kit.back = blobs(outline('-120,340* -216,340* -236,120 -226,-120 -180,-248 -92,-294 0,-302 92,-294 180,-248 226,-120 236,120 216,340* 120,340* 96,160* -96,160*'), bumps);
      }
      return kit;
    }
    let cap = `${12 - w},${lock}* ${4 - w},-70 ${-w},-146 ${30 - w},-224 -90,-262 0,${H.tight ? -262 : -270} 90,-262 ${w - 30},-224 ${w},-146 ${w - 4},-70 ${w - 12},${lock}*`;
    if (H.messy) cap = `${14 - w},${lock}* ${-w - 2},-96 ${-w - 12},-150 ${2 - w},-196 ${-w - 10},-236 -150,-268 -118,-300 -72,-296 -42,-322 6,-310 46,-328 90,-306 132,-304 ${w - 8},-268 ${w + 14},-226 ${w + 2},-186 ${w + 10},-138 ${w + 2},-96 ${w - 14},${lock}*`;
    if (H.wavy) cap = `-186,${lock + 18}* -206,-20 -196,-70 -222,-130 -200,-190 -196,-236 -140,-262 -96,-292 -40,-284 10,-306 64,-286 118,-290 164,-252 204,-232 212,-170 226,-110 204,-60 210,-10 186,${lock + 18}*`;
    if (H.curly) cap = `-182,${lock}* -196,-90 -200,-170 -160,-250 -80,-292 0,-300 80,-292 160,-250 200,-170 196,-90 182,${lock}*`;
    const temple = Math.min(lock - 60, -70);
    const inner = H.messy
      ? pts(`152,${lock - 4}* 160,-96 144,-124`).concat(H.edge, pts(`-144,-122 -160,-96 -152,${lock - 4}*`))
      : pts(`150,${lock - 4}* 158,${temple}`).concat(H.edge, pts(`-158,${temple} -150,${lock - 4}*`));
    kit.front = outline(pts(cap).concat(inner));
    if (H.curly) {   // a ring of curls over the silhouette
      blobs(kit.front, Array.from({ length: 15 }, (_, i) => {
        const a = HALF * (1.02 + 0.96 * i / 14);
        return [Math.cos(a) * 196, -128 + Math.sin(a) * 172, 34 + (i % 3) * 5];
      }));
      kit.back = blobs(outline('-186,10* -214,-110 -180,-250 0,-316 180,-250 214,-110 186,10*'), [[-200, -40, 40], [200, -40, 40], [-206, 4, 34], [206, 4, 34]]);
    } else if (H.tight || H.messy) kit.back = outline('-178,-40* -194,-130 -162,-236 0,-288 162,-236 194,-130 178,-40*');
    else kit.back = outline('-176,44* -192,-60 -196,-150 -160,-230 -90,-268 0,-276 90,-268 160,-230 196,-150 192,-60 176,44*');
    if (H.tail) kit.extra = { path: outline('120,-214* 196,-196 244,-120 246,-10 226,96 206,150 200,60 206,-50 188,-140 150,-178'), tie: [196, -186, 18, 13, 0.5] };
    if (H.bun) kit.extra = { path: blobs(new Path2D(), [[0, -318, 74]]), tie: [0, -252, 50, 11, 0] };
    return kit;
  }
  // light strands over the hair (the caller has clipped to the hair shape)
  const STRANDS = {
    part: '0,-250 70,-200 120,-110 / 0,-250 -70,-200 -120,-110 / 20,-270 110,-236 160,-150 / -20,-270 -110,-236 -160,-150',
    sweep: '-100,-240 0,-210 90,-120 / -80,-270 40,-250 140,-150 / -130,-200 -40,-170 30,-140 / -150,-150 -120,-120 -100,-110',
    up: '-100,-150 -110,-200 -90,-246 / -30,-160 -36,-214 -20,-256 / 40,-160 46,-214 30,-256 / 110,-150 118,-200 96,-244',
    wave: '-140,-230 -60,-250 -110,-140 / -40,-270 40,-240 -20,-150 / 60,-270 140,-230 80,-130 / 150,-200 200,-120 150,-80',
    back: '-120,-150 -110,-210 -60,-250 / -50,-186 -40,-236 0,-262 / 50,-186 40,-236 0,-262 / 120,-150 110,-210 60,-250',
    plain: '-110,-240 -118,-176 -104,-112 / -40,-258 -46,-186 -34,-120 / 40,-258 44,-186 32,-118 / 110,-240 116,-176 102,-110',
  };
  function strandPaths(key) {
    return STRANDS[key].split('/').map(group => {
      const [a, c, b] = pts(group);
      return svg(`M${a[0]} ${a[1]}Q${c[0]} ${c[1]} ${b[0]} ${b[1]}`);
    });
  }
  const MESSY_TUFTS = '-120 -236 26 3.6 5.9 / -58 -268 24 3.3 5.6 / 8 -262 26 3.8 6.1 / 74 -272 24 3.4 5.8 / 132 -232 24 3.7 6.0 / -96 -176 22 0.3 2.6 / -20 -186 24 0.5 2.8 / 58 -180 22 0.2 2.5 / 120 -160 20 0.4 2.7 / -150 -150 20 0.6 2.9';
  function arcPath(x, y, r, a0, a1) { const p = new Path2D(); p.arc(x, y, r, a0, a1); return p; }
  function drawStrands(pen, H, colour) {
    if (H.flow === 'none') return;
    const c = pen.c;
    c.save();
    c.strokeStyle = colour;
    c.lineWidth = 5;
    c.lineCap = 'round';
    const marks = [];
    if (H.flow === 'curly') {
      for (let i = 0; i < 22; i++) {
        const row = Math.floor(i / 6);
        marks.push(arcPath(-150 + (i % 6) * 60 + (row % 2) * 30, -250 + row * 40, 14, 0.4 + i, 3.6 + i));
      }
    } else if (H.flow === 'wavylong') {
      marks.push(...strandPaths('part'));
      for (const s of [-1, 1]) for (const dx of [0, 22]) {
        const x0 = s * (178 + dx * 0.4);
        const xa = v => s * (v + dx * 0.2);
        const xb = v => s * (v + dx);
        marks.push(svg(`M${s * (168 + dx * 0.3)} -170C${xa(204)} -110 ${xb(160)} -60 ${x0} -10C${xa(200)} 40 ${xb(160)} 90 ${x0} 140C${xa(196)} 180 ${xb(166)} 210 ${x0} 240`));
      }
    } else if (H.flow === 'curlylong') {
      c.lineWidth = 4.5;
      for (let i = 0; i < 46; i++) {
        const row = Math.floor(i / 9);
        const x = -220 + (i % 9) * 55 + (row % 2) * 27;
        const y = -270 + row * 104 + ((i * 37) % 23);
        if (Math.abs(x) < 140 && y > -150) continue;
        marks.push(arcPath(x, y, 13, 0.6 + i * 1.7, 4.4 + i * 1.7));
      }
    } else if (H.flow === 'messy') {
      for (const t of MESSY_TUFTS.split('/')) marks.push(arcPath(...t.trim().split(' ').map(Number)));
    } else marks.push(...strandPaths(STRANDS[H.flow] && H.flow !== 'plain' ? H.flow : 'plain'));
    for (const p of marks) c.stroke(p);
    c.restore();
  }

  /* ---------- fixed little shapes ---------- */
  const NOSE = svg('M3 -6C12 14 23 34 23 50C23 64 11 70 0 70C-13 70 -23 64 -23 56C-23 48 -16 46 -9 49C-3 52 5 49 7 42C9 28 6 10 3 -6Z');
  const DROP = new Path2D();
  DROP.moveTo(0, -20);
  DROP.bezierCurveTo(7, -8, 13, 0, 13, 7);
  DROP.arc(0, 7, 13, 0, HALF);
  DROP.bezierCurveTo(-13, 0, -7, -8, 0, -20);
  DROP.closePath();
  const LASHES = [[0.72, 11, -0.5], [0.88, 12, -0.1], [1.0, 10, 0.3]];
  const CROP = svg('M-4000 -6000h8000v6000h-8000z');   // the bust is cut flat at the bottom
  const GOLD = '#C9A24A';

  /* ---------- the host ---------- */
  class Host {
    constructor(st) {
      this.st = st;
      this.kid = false;
      this.look = usePalette(st.look || window.PRESENTER_LOOK || null);
      const size = this.given('s', 1);
      this.root = identity().translateSelf(this.given('x', 540), this.given('y', 1900) + this.soft('bob')).rotateSelf(this.soft('rot'))
        .scaleSelf(size * this.given('sx', 1), size * this.given('sy', 1));
      this.turn = clamp(this.soft('headTurn'), -1, 1);
      this.bt = clamp(this.soft('bodyTurn') + this.turn * 0.18, -1, 1);
      this.torso = identity().rotateSelf(this.soft('lean')).scaleSelf(1 - 0.03 * Math.abs(this.bt), 1);
      const dipR = faceDip(st, 'R');
      const dipL = faceDip(st, 'L');
      const dip = pos(dipR, dipL);
      this.shock = clamp(this.soft('shock'));
      this.nod = clamp(this.soft('headNod') + dip * 0.4, -1, 1);
      this.headT = identity()
        .translateSelf(this.turn * 5, NECK + dip * 12 + this.nod * 5)
        .rotateSelf(this.soft('headTilt') + (dipR - dipL) * 7)
        .translateSelf(0, EYES)
        .scaleSelf(1 - 0.04 * Math.abs(this.turn), 1 + this.shock * 0.025);
      this.head = this.torso.multiply(this.headT);
      this.armM = { R: this.torso, L: this.torso.scale(-1, 1) };
      this.arms = {};
      for (const side of ['L', 'R']) {
        const name = st['arm' + side] || 'down';
        const given = st['arm' + side + 'p'];
        this.arms[side] = this.solveArm(side, name, clamp(given === undefined ? (name === 'down' ? 0 : 1) : given));
      }
      this.mouth = mouthOf(st);
    }

    soft(k) { return this.st[k] || 0; }
    given(k, d) { return this.st[k] ?? d; }

    // one arm: blend from the previous gesture (or from down) toward `name` by p, then solve the elbow and the hand
    solveArm(side, name, p) {
      const st = this.st;
      const was = st[`arm${side}From`];
      const mixing = st[`arm${side}Mix`];
      // a finished arm that is changing pose cross-fades from its previous pose instead of dropping
      const prior = was && ![name, 'down'].includes(was) && mixing != null && mixing < 1 && p >= 0.999 ? was : null;
      const e = settle(prior ? mixing : p);
      const sgn = side === 'R' ? 1 : -1;
      const onFace = (x, y) => {
        const spot = this.headT.transformPoint(new DOMPoint(sgn * x, y));
        return [sgn * spot.x, spot.y];
      };
      const A = gestureOf(prior || 'down', st, onFace, side);
      const B = gestureOf(name, st, onFace, side);
      const raise = (B.raise || 0) * e;
      const S = [SHOULDER[0], SHOULDER[1] - raise];
      const toA = vec.diff(A.W, S);
      const toB = vec.diff(B.W, S);
      const heading = vec.angle(toA) + wrapTurn(vec.angle(toB) - vec.angle(toA)) * e;
      const chain = twoBone(S, vec.step(S, vec.fromAngle(heading), lerp(vec.length(toA), vec.length(toB), e)), vec.norm(vec.between(A.pole, B.pole, e)));
      const forearm = vec.angle(vec.diff(chain.W, chain.E));
      const faA = A.fa ?? forearm;
      const faB = B.fa ?? forearm;
      const flip = lerp(thumbSide(faA, A.th), thumbSide(faB, B.th), e);
      const hsx = Math.abs(flip) < 0.3 ? (flip < 0 ? -0.3 : 0.3) : flip;   // never paper-thin while the hand turns over
      const [h0, h1] = [HANDS[A.hand], HANDS[B.hand]];
      const hand = Object.fromEntries(Object.keys(h0).map(k => [k, lerp(h0[k], h1[k], e)]));
      hand.palm = (e > 0.5 ? h1 : h0).palm;
      return {
        side, sgn, name, p, e, S, raise, hsx, hand, E: chain.E, W: chain.W,
        Rl: vec.between(chain.E, chain.W, 0.4), fa: faA + wrapTurn(faB - faA) * e,
      };
    }

    draw(T, K) {
      K.save();
      const silhouette = this.paint(new Pen(K), K.getTransform().multiply(this.root));
      K.restore();
      this.castShadow(T, T.getTransform().multiply(this.root), silhouette);
    }

    // one soft shadow of the whole silhouette on the tone layer, offset down-right
    castShadow(T, at, silhouette) {
      const merged = new Path2D();
      silhouette.forEach(([shape, frame]) => merged.addPath(shape, frame));
      T.save();
      T.setTransform(at);
      T.clip(CROP);
      T.setTransform(at.translate(18, 12));
      T.fillStyle = 'rgba(0,0,0,0.26)';
      T.fill(merged);
      T.restore();
    }

    paint(pen, M) {
      const sil = [];
      pen.c.setTransform(M);
      pen.c.clip(CROP);
      this.paintTorso(pen, M, sil);
      this.paintHead(pen, M, sil);
      const body = new Path2D();
      for (const [p, m] of sil) body.addPath(p, m);
      const lastIsFace = s => faceDip(this.st, s) + this.arms[s].e * 0.01;   // the arm reaching for the face is drawn last
      const order = ['L', 'R'].sort((a, b) => lastIsFace(a) - lastIsFace(b));
      for (const s of order) this.paintArm(pen, M, this.arms[s], body, sil);
      return sil;
    }

    paintTorso(pen, M, sil) {
      const L = this.look;
      const top = L.top;
      const crew = top !== 'overshirt';
      const bx = this.bt * 26;
      const rl = this.arms.L.raise;
      const rr = this.arms.R.raise;
      pen.c.setTransform(M.multiply(this.torso));
      pen.c.lineCap = 'round';
      const body = svg(`M-312 60L312 60L305 0C303 -80 289 -158 270 -210C264 ${-258 - rr} 256 ${-300 - rr} 218 ${-314 - rr}C172 ${-328 - rr * 0.5} 112 -337 72 -342`
        + `C${52 + bx} -306 ${-52 + bx} -306 -72 -342C-112 -337 -172 ${-328 - rl * 0.5} -218 ${-314 - rl}C-256 ${-300 - rl} -264 ${-258 - rl} -270 -210C-289 -158 -303 -80 -305 0Z`);
      sil.push([body, this.torso]);
      if (top === 'hoodie') pen.shade(svg('M-150 -320C-170 -420 170 -420 150 -320Z'), PAL.topSh, tint(PAL.topSh, INK, 0.2), 0, 10);   // hood behind the neck
      pen.fill(svg('M-86 -336C-88 -378 88 -378 86 -336Z'), PAL.topSh);                                                               // collar stand
      const nw = L.slim ? 43 : 50;
      pen.shade(svg(`M${-nw} -450L${nw} -450L${nw + 2} -300L${-nw - 2} -300Z`), crew ? PAL.skin : PAL.skinSh, crew ? PAL.skinSh : tint(PAL.skinSh, INK, 0.08), -14, 0);
      pen.shade(body, PAL.top, PAL.topSh, -30, -6);
      const o = bx * 0.9;
      if (crew) {
        pen.line(`M-72 -342C${-52 + bx} -306 ${52 + bx} -306 72 -342`, 12, PAL.topLt);                                                  // the rib
        if (top === 'hoodie') {
          for (const s of [-1, 1]) {
            pen.line(`M${s * 40 + bx} -318Q${s * 46 + bx} -250 ${s * 38 + bx} -190`, 6, PAL.topLt).fill(disc(s * 38 + bx, -186, 7), PAL.topLt);   // drawstrings
          }
        }
        if (top === 'collar') {
          for (const s of [-1, 1]) {
            const wing = svg(`M${s * 20 + o} -318L${s * 74 + o} -352Q${s * 120 + o} -344 ${s * 136 + o} -320L${s * 30 + o} -296Z`);
            pen.cast(wing, s * 3 + 2, 8);
            pen.shade(wing, PAL.top, PAL.topSh, -5, -5);
          }
          for (const y of [-268, -190, -112]) pen.fill(disc(o, y, 5), INK);
        }
      } else {
        // the open overshirt: a tee in the gap, collar wings, a chest pocket, placket buttons
        const sx = bx * 0.2;
        const tee = svg(`M${-72 + sx} -342C${-52 + bx} -306 ${52 + bx} -306 ${72 + sx} -342C${80 + bx} -260 ${94 + bx} -130 ${106 + bx} 60L${-106 + bx} 60C${-94 + bx} -130 ${-80 + bx} -260 ${-72 + sx} -342Z`);
        pen.shade(tee, PAL.tee, PAL.teeSh, 12, 0);
        pen.within(() => pen.fill(oval(bx * 0.6, -318, 70, 22), 'rgba(17,17,17,0.08)'), 0, 0, 1, 1, tee);
        pen.line(`M${-62 + sx} -331C${-44 + bx} -292 ${44 + bx} -292 ${62 + sx} -331`, 3, PAL.teeLine);
        for (const s of [-1, 1]) {
          const wing = svg(`M${s * 58 + o} -352Q${s * 108 + o} -348 ${s * 154 + o * 0.5} -326L${s * 128 + o} -260Q${s * 100 + o} -282 ${s * 82 + o} -300Q${s * 66 + o} -322 ${s * 58 + o} -352Z`);
          pen.cast(wing, s * 3 + 2, 9);
          pen.shade(wing, PAL.top, PAL.topSh, -6, -5);
        }
        const px = -171 + o;
        pen.shade(rounded(px - 43, -236, 86, 102, [4, 4, 10, 10]), PAL.top, PAL.topSh, -5, -5);
        const flap = svg(`M${px - 46} -244L${px + 46} -244L${px + 46} -214L${px} -198L${px - 46} -214Z`);
        pen.cast(flap, 1, 6);
        pen.shade(flap, PAL.top, PAL.topSh, -4, -4);
        pen.fill(disc(px, -207, 5), INK).fill(disc(100 + bx, -214, 5.5), INK).fill(disc(108 + bx, -112, 5.5), INK);
      }
      this.paintNeckwear(pen, bx);
    }

    // things worn at the neck (torso space)
    paintNeckwear(pen, bx) {
      const worn = this.look.acc;
      if (worn.has('necklace')) {
        pen.line(`M${-52 + bx * 0.3} -336Q${bx * 0.8} -250 ${52 + bx * 0.3} -336`, 3.5, GOLD);
        const pendant = disc(bx * 0.8, -290, 9);
        pen.fill(pendant, GOLD).line(pendant, 2.5, tint(GOLD, INK, 0.35));
      }
      if (worn.has('mic')) {   // a lavalier on the collar, its cable running down
        pen.c.save();
        pen.c.translate(-96 + bx * 0.6, -282);
        pen.c.rotate(-0.3);
        pen.fill(rounded(-9, -20, 18, 40, 9), INK).fill(rounded(-12, 12, 24, 10, 3), '#3A3A3A');
        pen.c.restore();
        pen.line(`M${-100 + bx * 0.6} -262Q-130 -150 -120 60`, 3, INK);
      }
      if (worn.has('headphones')) {   // resting round the neck
        pen.line('M-104 -318C-110 -250 110 -250 104 -318', 14, '#2A2A2C');
        for (const s of [-1, 1]) {
          pen.c.save();
          pen.c.translate(s * 104, -322);
          pen.c.rotate(s * 0.35);
          pen.fill(rounded(-30, -40, 60, 74, 26), '#1E1E20').fill(rounded(-20, -30, 40, 54, 18), '#3A3A3D');
          pen.c.restore();
        }
      }
    }

    // the fake head turn: a feature at x slides round a sphere of radius SKULL + depth and squashes by its foreshortening
    slide(x, depth = 0) {
      const r = SKULL + depth;
      return r * Math.sin(Math.asin(clamp(x / r, -1, 1)) + this.turn * 21 * RAD);
    }
    squash(x, depth = 0) {
      const ph = Math.asin(clamp(x / (SKULL + depth), -1, 1));
      return pos(0.3, Math.cos(ph + this.turn * 21 * RAD) / Math.cos(ph));
    }

    faceOutline() {
      const young = this.look.young;
      const half = SKULL_HALF.map(([x, y]) => young && y > 40 ? [x * 0.97, y * 0.965] : [x, y]);
      let loop = half.concat([[0, young ? 208 : 215]], half.slice(1).reverse().map(([x, y]) => [-x, y]));
      if (this.look.slim) loop = loop.map(([x, y]) => [x * SLIM * (y > 30 ? 1 - 0.1 * ramp(y, 30, 200) : 1), y > 40 ? y * 1.05 : y]);
      return outline(loop.map(([x, y]) => [x + this.turn * 22 * ramp(y, 60, 220), y + this.mouth.jd * ramp(y, 100, 218)]));
    }

    beardOutline(fy) {
      const jaw = this.mouth.jd;
      const t = this.turn;
      const onJaw = ([x, y, c]) => [x + t * 22 * ramp(y, 40, 220), y + jaw * ramp(y, 104, 224), c];
      const onFace = ([x, y, c]) => [x + t * 30 * ramp(y, -20, 90) * (1 - Math.abs(x) / 190), y + jaw * ramp(y, 104, 224) + fy * ramp(y, -20, 40), c];
      const mirrored = ([x, y, c]) => [-x, y, c];
      const loop = BEARD_OUT.map(onJaw)
        .concat(BEARD_OUT.slice(0, -1).reverse().map(q => onJaw(mirrored(q))))
        .concat(BEARD_IN.map(q => onFace(mirrored(q))))
        .concat(BEARD_IN.slice(0, -1).reverse().map(onFace));
      return outline(loop);
    }

    paintHead(pen, M, sil) {
      const st = this.st;
      const L = this.look;
      const t = this.turn;
      const shock = this.shock;
      const fy = this.nod * 11;
      const FW = L.slim ? SLIM : 1;
      const capOn = !!L.beanie;
      const hc = L.hairHex;
      const hairDk = tint(hc, INK, 0.55);
      const hair = hairFor(L);
      const shaved = hair && hair.H.buzz;
      const fringe = hair && !capOn;
      const c = pen.c;
      c.setTransform(M.multiply(this.head));
      const lift = this.nod * 4 - shock * 10;
      if (hair && (hair.back || hair.extra) && !(capOn && hair.H.bun)) this.paintBackHair(pen, hair, lift, FW, capOn, sil);
      // ears: the near one opens up, the far one tucks behind
      for (const s of [-1, 1]) {
        const near = -s * t;
        const ex = s * (167 * FW - 22 * pos(0, -near));
        const rx = 21 + 6 * pos(0, near) - 8 * pos(0, -near);
        const ear = oval(ex, 16 + fy * 0.5, rx, 36);
        pen.fill(ear, PAL.skin).fill(oval(ex + s * 4, 18 + fy * 0.5, rx * 0.5, 22), PAL.skinSh);
        sil.push([ear, this.head]);
        if (L.acc.has('earrings') && near > -0.3) pen.line(disc(ex + s * 4, 60 + fy * 0.5, 10), 4, GOLD);
      }
      // the face, with the shade band under the hair or the beanie
      const face = this.faceOutline();
      sil.push([face, this.head]);
      pen.shade(face, PAL.skin, PAL.skinSh, -17 + t * 10, -6);
      pen.within(() => {
        if (fringe && !shaved) pen.within(() => pen.fill(hair.front, PAL.skinSh), t * 9 + 4, lift + 15, FW, 1);
        else if (capOn) pen.fill(svg(`M-200 -300L200 -300L200 ${-114 + fy * 0.3}Q0 ${-100 + fy * 0.3} -200 ${-114 + fy * 0.3}Z`), PAL.skinSh);
      }, 0, 0, 1, 1, face);
      // nose
      const noseScale = L.young ? 0.88 : 1;
      pen.within(() => pen.fill(NOSE, PAL.skinSh), this.slide(0, 34), fy, this.squash(0, 34) * noseScale, noseScale);
      // beard: one mass including the mouth area; the mouth goes on top, the mustache over the upper lip
      const mouthX = this.slide(0, -6);
      const mouthY = 118 + fy;
      const narrow = 1 - 0.14 * Math.abs(t);
      const full = L.beard === 'full';
      if (L.beard === 'stubble') { c.save(); c.globalAlpha = 0.85; pen.fill(this.beardOutline(fy), PAL.stubble); c.restore(); }
      if (full) {
        const beard = this.beardOutline(fy);
        sil.push([beard, this.head]);
        pen.within(() => pen.fill(beard, PAL.fade), 0, -9);
        pen.shade(beard, L.beardHex, PAL.beardSh, -12 + t * 8, -10);
      }
      pen.within(() => drawMouth(pen, this.mouth, !full), mouthX, mouthY, narrow, 1);
      if (full) this.paintMustache(pen, mouthX, mouthY, narrow);
      // eyes and brows
      const eyes = [-1, 1].map(s => ({ s, ex: this.slide(s * 77 * FW), ey: fy, fs: this.squash(s * 77 * FW) }));
      eyes.forEach(E => this.paintEye(pen, E, FW));
      const brow = clamp(this.soft('brow'), -1, 1) + shock * 0.9;
      const browTilt = clamp(this.soft('browTilt'));
      for (const s of [-1, 1]) {
        const inY = -74 - brow * 13 - browTilt * 16 + pos(0, -brow) * 8;
        const outY = -76 - brow * 11 + browTilt * 5 - pos(0, -brow) * 2;
        const a = [this.slide(s * 36 * FW), inY + fy];
        const mid = [this.slide(s * 82 * FW), lerp(inY, outY, 0.5) - 12 + browTilt * 6 + fy];
        const b = [this.slide(s * 118 * FW), outY + fy + (FW < 1 ? 3 : 0)];
        pen.fill(brush(new Path2D(), a, mid, b, 17, 16, 10), tint(hc, INK, /^(platinum|white|blonde|grey)$/.test(L.hairColor) ? 0.35 : 0));
      }
      // hair front, or a knit beanie
      const hx = t * 9;
      const hy = this.nod * 4 - shock * 16;
      pen.within(() => {
        if (fringe && shaved) pen.within(() => pen.fill(hair.front, tint(hc, PAL.skin, 0.42)), 0, 0, FW, 1);
        else if (fringe) {
          pen.within(() => {
            pen.shade(hair.front, hc, hairDk, -12 + t * 8, -9);
            pen.within(() => drawStrands(pen, hair.H, tint(hc, PAPER, 0.2)), 0, 0, 1, 1, hair.front);
            const pt = hair.H.part;
            if (pt !== undefined) pen.line(`M${pt} -206Q${pt * 0.9} -236 ${pt * 0.7} -252`, 4, hairDk);
          }, 0, 0, FW, 1);
          sil.push([hair.front, this.head.translate(hx, hy).scale(FW, 1)]);
        } else if (capOn) this.paintBeanie(pen, hx, hy, sil);
      }, hx, hy);
      if (L.glasses) this.paintGlasses(pen, eyes, FW);
      // sweat beads sliding down
      const sweat = clamp(this.soft('sweat'));
      if (sweat > 0.05) {
        [[-150, -92, 1], [156, -62, 0.8]].forEach(([x, y, k], i) => {
          const a = clamp((sweat - i * 0.3) / 0.5);
          if (a <= 0) return;
          const drop = ((this.soft('t') * 0.6 + i * 0.37) % 1) * 18;
          pen.within(() => {
            pen.fill(DROP, PAPER).line(DROP, 3.4, INK).fill(oval(4, 9, 4, 6), PAL.teeSh);
          }, this.slide(x, 8), y + fy + drop, a * k, a * k);
        });
      }
    }

    // the hair mass behind the head (and a tail or bun with its tie), drawn before the face
    paintBackHair(pen, hair, lift, FW, capOn, sil) {
      const hc = this.look.hairHex;
      const style = hair.H;
      const dark = tint(hc, INK, 0.55);
      const showBack = hair.back && (!capOn || style.long || style.curly);
      pen.within(() => {
        if (showBack) pen.fill(hair.back, style.curls ? tint(hc, INK, 0.3) : dark);
        if (!hair.extra) return;
        const [x, y, rx, ry, rot] = hair.extra.tie;
        pen.shade(hair.extra.path, hc, dark, -10, -8).fill(oval(x, y, rx, ry, rot), PAL.accent);
      }, this.turn * 9, lift, FW, 1);
      if (style.long && hair.back) sil.push([hair.back, this.head.translate(this.turn * 9, lift).scale(FW, 1)]);
    }

    paintMustache(pen, mouthX, mouthY, narrow) {
      const m = this.mouth;
      const r = m.w / 2;
      const at = (x, y) => [mouthX + x * narrow, mouthY + y];
      const loop = [at(-r - 13, m.cyL + 7).concat(1)];
      for (const [x, y] of pts('-60,-18 -32,-26 0,-23 32,-26 60,-18')) loop.push(at(x, y));
      loop.push(at(r + 13, m.cyR + 7).concat(1));
      for (let i = 8; i >= 0; i--) {   // the bottom edge rides the upper lip
        const [x, y] = mouthTop(m, i / 8, m.lipUp - 3.5);
        loop.push(at(x, pos(y, -17 + Math.abs(x) * 0.1)));
      }
      pen.shade(outline(loop), this.look.beardHex, PAL.beardSh, -6, -6);
    }

    paintEye(pen, E, FW) {
      const st = this.st;
      const shock = this.shock;
      const c = pen.c;
      const size = (this.look.young ? 1.07 : 1) * (1 + shock * 0.22);
      const w = 27;
      const up = FW < 1 ? 14 : 17;
      const dn = FW < 1 ? 12 : 14;
      c.save();
      c.translate(E.ex, E.ey);
      c.scale(E.fs * size, size);
      const white = svg(`M${-w} 0C${-w * 0.55} ${-up * 1.33} ${w * 0.55} ${-up * 1.33} ${w} 0C${w * 0.55} ${dn * 1.33} ${-w * 0.55} ${dn * 1.33} ${-w} 0Z`);
      pen.fill(white, PAPER);
      const brow = clamp(this.soft('brow'), -1, 1) + shock * 0.9;
      const wink = E.s > 0 ? clamp(this.soft('wink')) : 0;
      const blink = clamp(this.soft('blink'));
      const shut = pos(blink, wink);
      const winking = wink > blink;
      const lidOpen = -11.5 - brow * 4.5 - shock * 7 + clamp(this.soft('browTilt')) * 1.5 + pos(0, -brow) * 3;
      const lowOpen = 14 - pos(0, clamp(this.given('smile', 0.3), -1, 1) - 0.45) * 12;
      const upY = lerp(lidOpen, winking ? -6 : lowOpen - 1, shut);
      const loY = lerp(lowOpen, winking ? -6 : lowOpen, shut);
      const lid = (y, edge) => svg(`M${-w - 6} 0C${-w * 0.55} ${y * 1.33} ${w * 0.55} ${y * 1.33} ${w + 6} 0L${w + 6} ${edge}L${-w - 6} ${edge}Z`);
      pen.within(() => {
        const ix = clamp(this.soft('lookX'), -1, 1) * 11 / E.fs * 0.9 + this.turn * 3;
        const iy = clamp(this.soft('lookY'), -1, 1) * 6.5 + 1;
        pen.fill(disc(ix, iy, 12.5 * (1 - shock * 0.22)), INK).fill(disc(ix - 4.5, iy - 4.5, 3.4), PAPER);
        pen.fill(lid(upY, -40), PAL.skin).fill(lid(loY, 40), PAL.skin);
      }, 0, 0, 1, 1, white);
      c.lineCap = 'round';
      pen.line(`M${-w - 1} 0.5C${-w * 0.55} ${upY * 1.33} ${w * 0.55} ${upY * 1.33} ${w + 1} 0.5`, 4.6, INK);
      if (this.look.lashes && shut < 0.6) {
        for (const [u, l, a] of LASHES) {
          const x = E.s * w * u;
          const y = upY * 1.33 * (1 - u * u) * 0.75 + 0.5;
          pen.line(`M${x} ${y}L${x + E.s * Math.cos(a) * l} ${y - Math.sin(a + 0.9) * l}`, 3.6, INK);
        }
      }
      c.restore();
    }

    paintBeanie(pen, hx, hy, sil) {
      const L = this.look;
      const t = this.turn;
      const crown = svg('M-171 -176C-180 -238 -118 -286 0 -288C118 -286 180 -238 171 -176Z');
      pen.fill(crown, L.beanieHex);
      pen.within(() => pen.fill(svg(`M-200 -300L${-40 + t * 30} -300C${-70 + t * 30} -250 ${-104 + t * 20} -210 ${-110 + t * 20} -170L-200 -170Z`), PAL.crownLt), 0, 0, 1, 1, crown);
      const cuff = svg('M-183 -188Q-189 -154 -181 -126Q0 -112 181 -126Q189 -154 183 -188Q0 -206 -183 -188Z');
      pen.fill(cuff, PAL.cuff);
      pen.within(() => {
        const ribs = new Path2D();
        const shift = (t * 40) % 12;
        for (let x = -190; x <= 190; x += 12) {
          ribs.moveTo(x + shift, -210);
          ribs.lineTo(x + shift, -100);
        }
        pen.line(ribs, 3.2, 'rgba(17,17,17,0.55)');
        pen.fill(svg('M-200 -130Q0 -112 200 -130L200 -100L-200 -100'), 'rgba(17,17,17,0.35)');
      }, 0, 0, 1, 1, cuff);
      pen.line('M-181 -188Q0 -206 181 -188', 2.5, 'rgba(246,245,241,0.14)');
      if (L.beanieTab) {
        const tx = this.slide(-104, 14) - hx;
        const tf = this.squash(-104, 14);
        pen.fill(rounded(tx - 17 * tf, -174, 34 * tf, 21, 3), PAL.accent);
        pen.c.fillStyle = 'rgba(246,245,241,0.7)';
        pen.c.fillRect(tx - 10 * tf, -165, 20 * tf, 2.5);
      }
      const at = this.head.translate(hx, hy);
      sil.push([crown, at], [cuff, at]);
    }

    paintGlasses(pen, eyes, FW) {
      const L = this.look;
      const square = L.glassesStyle === 'square';
      const width = +L.glassesW > 0 ? +L.glassesW : 7;
      const lenses = eyes.map(E => square ? rounded(E.ex - 54 * E.fs, E.ey - 38, 108 * E.fs, 80, 16) : oval(E.ex, E.ey + 3, 50 * E.fs, 50));
      lenses.forEach((lens, i) => {   // a faint tint and two diagonal glints in each lens
        const E = eyes[i];
        pen.within(() => {
          pen.fill(lens, 'rgba(246,245,241,0.12)');
          pen.c.translate(E.ex - 22 * E.fs, E.ey - 19);
          pen.c.rotate(-42 * RAD);
          pen.c.fillStyle = 'rgba(246,245,241,0.55)';
          pen.c.fillRect(-70, -7, 140, 12);
          pen.c.fillRect(-70, 11, 140, 4.5);
        }, 0, 0, 1, 1, lens);
      });
      pen.c.lineCap = 'round';
      for (const lens of lenses) pen.line(lens, width, L.glassesHex);
      const [a, b] = eyes;
      pen.line(`M${a.ex + 48 * a.fs} ${a.ey - 10}Q${(a.ex + b.ex) / 2} ${a.ey - 24} ${b.ex - 48 * b.fs} ${b.ey - 10}`, width, L.glassesHex);
      for (const E of eyes) {   // temples back to the ears, when they show
        const rim = E.ex + E.s * (square ? 54 : 50) * E.fs;
        const ear = E.s * (166 * FW - 22 * pos(0, E.s * this.turn));
        if (E.s * (ear - rim) > 2) pen.line(`M${rim} ${E.ey - 6}L${ear} ${E.ey - 2}`, width * 0.85, L.glassesHex);
      }
    }

    paintArm(pen, M, A, body, sil) {
      const frame = this.armM[A.side];
      const AM = M.multiply(frame);
      const lx = -A.sgn;
      const fwd = vec.norm(vec.diff(A.W, A.E));
      const across = vec.left(fwd);
      const cuffAt = vec.sum(A.Rl, vec.scaled(fwd, 1));
      // a point on the rolled cuff: a along the forearm, b across it
      const at = (a, b) => vec.sum(cuffAt, [fwd[0] * a + across[0] * b, fwd[1] * a + across[1] * b]);
      const sleeve = sleeveOutline(new Path2D(), A.S, A.E, A.Rl, 54, 45, 42);
      const fore = tube(new Path2D(), vec.step(A.Rl, fwd, -12), A.W, 29, 24);
      const cuff = spline(new Path2D(), [at(-13, -49), at(-15, 0), at(-13, 49), at(0, 51), at(13, 46), at(15, 0), at(13, -46), at(0, -51)], false, 0.9);
      const handM = identity().translateSelf(A.W[0], A.W[1]).rotateSelf(A.fa / RAD - 90).scaleSelf(A.hsx * HAND, HAND);
      const palmBlob = new Path2D();
      palmBlob.addPath(tube(new Path2D(), [0, 20], [0, 96], 36, 26), handM);
      sil.push([sleeve, frame], [fore, frame], [palmBlob, frame]);
      // its shadow on the body: nudged down-right, clipped to the body
      const c = pen.c;
      c.save();
      c.setTransform(M);
      c.clip(body);
      c.setTransform(M.translate(9, 12).multiply(frame));
      c.fillStyle = 'rgba(17,17,17,0.16)';
      for (const p of [sleeve, fore, palmBlob]) c.fill(p);
      c.setTransform(AM);
      pen.line(sleeve, 7, 'rgba(17,17,17,0.2)');
      c.restore();
      c.setTransform(AM);
      pen.shade(sleeve, PAL.top, PAL.topSh, 12 * lx, -9);
      pen.shade(fore, PAL.skin, PAL.skinSh, 8 * lx, -6);
      pen.shade(cuff, PAL.topLt, tint(PAL.topLt, INK, 0.2), 5 * lx, -6);
      c.setTransform(AM.multiply(handM));
      drawHand(pen, A.hand, HAND);
    }

    // where things are in the scene: a point in some part's space → scene coordinates
    sceneOf(part, [x, y]) {
      const { x: sx, y: sy } = this.root.multiply(part).transformPoint(new DOMPoint(x, y));
      return { x: sx, y: sy };
    }
    anchors() {
      const spots = { head: [0, -20], top: [0, -290], mouth: [0, 124] };
      const found = {};
      for (const name in spots) found[name] = this.sceneOf(this.head, spots[name]);
      for (const side of ['L', 'R']) {
        const arm = this.arms[side];
        const raised = arm.name !== 'down' && arm.p > 0.02;
        found['hand' + side] = raised ? this.sceneOf(this.armM[side], vec.step(arm.W, vec.fromAngle(arm.fa), 62 * HAND)) : null;
      }
      return found;
    }
  }

  // the sleeve: one outline round shoulder A → elbow B → cuff C: a round shoulder cap, a round outer elbow, a creased inner elbow
  function sleeveOutline(path, A, B, C, ra, rb, rc) {
    const u1 = vec.norm(vec.diff(B, A));
    const u2 = vec.norm(vec.diff(C, B));
    const n1 = vec.left(u1);
    const n2 = vec.left(u2);
    const out = vec.dot(n1, u2) >= 0 ? -1 : 1;
    const inn = -out;
    // both edges at each joint: [outer, inner]
    const [oA, iA] = [out, inn].map(s => vec.step(A, n1, ra * s));
    const [oB, iB1] = [out, inn].map(s => vec.step(B, n1, rb * s));
    const [oC, iC] = [out, inn].map(s => vec.step(C, n2, rc * s));
    const iB2 = vec.step(B, n2, rb * inn);
    const to = q => path.lineTo(...q);
    const facing = (n, s) => vec.angle(vec.scaled(n, s));
    path.moveTo(...oA);
    path.quadraticCurveTo(...vec.step(vec.between(oA, oB, 0.5), n1, out * 8), ...oB);   // a slight muscle bulge
    const [a1, a2] = [facing(n1, out), facing(n2, out)];
    path.arc(...B, rb, a1, a2, wrapTurn(a2 - a1) < 0);
    [oC, iC].forEach(to);
    const bend = vec.cross(u1, u2);
    const crease = Math.abs(bend) < 0.03 ? null : vec.step(iB1, u1, vec.cross(vec.diff(iB2, iB1), u2) / bend);
    const fillet = 16;
    const roomy = crease && vec.dot(vec.diff(crease, iA), u1) > fillet + 4 && vec.dot(vec.diff(iC, crease), u2) > fillet + 4
      && vec.length(vec.diff(crease, B)) < rb * 2.2;
    if (roomy) {   // the inner edges meet at the crease, rounded off a little
      to(vec.step(crease, u2, fillet));
      path.quadraticCurveTo(...crease, ...vec.step(crease, u1, -fillet));
    } else [iB2, iB1].forEach(to);   // nearly straight, or folded tight: cut through the joint
    [vec.between(iB1, iA, 0.5), iA].forEach(to);
    const cap = facing(n1, inn);
    path.arc(...A, ra, cap, cap + inn * HALF, inn < 0);   // the shoulder cap round the back of the joint
    path.closePath();
    return path;
  }

  /* ---------- public ---------- */
  function draw(T, K, st) { new Host(st).draw(T, K); }
  // scene points on the drawn presenter. Takes the state guy(t) returns (raw act()/mood() output, normalised here exactly as
  // the engine does before drawing) or an already normalised guyState(...); t = state.t or the second argument.
  function anchors(st, t) {
    let state = st;
    const needsNormalising = st && !st._norm && typeof window.guyState === 'function';
    const when = needsNormalising ? t ?? st.t : null;
    if (needsNormalising && when == null) console.error('PRESENTER.anchors(state) needs the time: anchors(state, t), or a state that act() made (it carries t)');
    if (needsNormalising && when != null) state = window.guyState(when, { t: when, ...st });
    return new Host(state).anchors();
  }
  window.PRESENTER = window.GUY3D = Object.freeze({
    ready: Promise.resolve(true),
    draw,
    anchors,
    rig: st => new Host(st),
    look: resolveLook,
    DEFAULT,
    SKINS,
    HAIRCOLS,
    HAIRSTYLES: [...Object.keys(HAIRSTYLES), 'bald'],
  });
})();
