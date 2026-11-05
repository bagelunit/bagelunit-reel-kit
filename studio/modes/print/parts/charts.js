/* Susanoo Reel Kit print · charts
   Bars, a line, a ring, a before/after wipe and a versus card. Bars grow on a spring and their values count up; the one bar that
   matters is printed in the accent, the rest in grey dots with ink outlines. Everything is drawn on K (dot patterns stand in for
   tone fills), so charts also work inside cards and windows where T is covered. */

// (dotPattern, the dot-screen fill, lives in fx.js)
// a chart text style: face (grot / mono), weight, size, colour, then any extra fields
const chartType = (face, weight, size, color, extra) => Object.assign({ font: F[face], weight, size, color }, extra);

// a bar chart in the box (x, y, w, h). bars: [{ v, label, hot, t0 }]; a bar grows at its t0 (default o.t0 + 0.08 s per bar).
// o: { t, t0, max, fmt: v => string, gap: 0.28 }
const BARS = { floor: 56, headroom: 140, stagger: 0.08, radius: 10, lip: 6, outline: 4, valueRise: 18, labelDrop: 40 };
const barChart = (T, K, x, y, w, h, bars, o = {}) => {
  const t = o.t ?? 0, n = bars.length;
  const gap = o.gap ?? 0.28;
  const bw = w / (n + (n - 1) * gap);
  const max = o.max || Math.max(...bars.map(b => b.v)) || 1;
  const fmt = o.fmt || (v => String(Math.round(v)));
  const base = y + h - BARS.floor;
  line(K, x - 10, base, x + w + 10, base, C.ink, 4, 'round');
  bars.forEach((b, i) => {
    const start = b.t0 ?? (o.t0 ?? 0) + i * BARS.stagger;
    const grown = clamp(pop(t - start, 2.2, 0.55), 0, 1.15);
    const bh = (h - BARS.headroom) * (b.v / max) * grown;
    const bx = x + i * bw * (1 + gap);
    const mid = bx + bw / 2;
    if (bh > 1) {
      const shape = [bx, base - bh, bw, bh + BARS.lip, BARS.radius];
      fillRR(K, ...shape, '#FFFFFF');
      fillRR(K, ...shape, dotPattern(K, b.hot ? C.red : '#111111', b.hot ? 2.1 : 1.1));
      strokeRR(K, ...shape, b.hot ? C.red : C.ink, BARS.outline);
      if (grown > 0.3) text(K, fmt(b.v * Math.min(1, grown)), mid, base - bh - BARS.valueRise, chartType('grot', 700, Math.min(48, bw * 0.42), b.hot ? C.red : C.ink));
    }
    if (b.label) text(K, b.label, mid, base + BARS.labelDrop, chartType('mono', 500, Math.min(24, bw * 0.24), b.hot ? C.red : '#8a8780'));
  });
};
// a line chart of pts [v0, v1, …] drawn on as p goes 0 → 1, with the area under it in grey dots. o: { max, min, hotLast }
const lineChart = (T, K, x, y, w, h, pts, p, o = {}) => {
  const n = pts.length;
  const max = o.max ?? Math.max(...pts);
  const min = o.min ?? Math.min(0, ...pts);
  const floor = y + h;
  const at = pts.map((v, i) => [x + w * i / (n - 1), floor - (v - min) / (max - min || 1) * h]);
  // the drawn part: every whole point reached, plus a point partway along the next segment
  const shown = chartReached(at, clamp(p) * (n - 1));
  if (shown.length < 2) return;
  const tip = shown[shown.length - 1];
  runOps(K, [['beginPath'], ['moveTo', shown[0][0], floor], ...shown.map(q => ['lineTo', q[0], q[1]]), ['lineTo', tip[0], floor], ['closePath']]);
  K.fillStyle = dotPattern(K, '#111111', 1.1);
  K.fill();
  K.save();
  Object.assign(K, { strokeStyle: C.ink, lineWidth: 7, lineJoin: 'round', lineCap: 'round' });
  runOps(K, [['beginPath'], ...shown.map((q, j) => [j ? 'lineTo' : 'moveTo', q[0], q[1]]), ['stroke']]);
  K.restore();
  circle(K, tip[0], tip[1], 14, o.hotLast === false ? C.ink : C.red, '#FFFFFF', 5);
  line(K, x, floor, x + w, floor, C.ink, 4, 'round');
};
// the points of a polyline reached at `reach` segments along: the whole points, then one partway along the next segment
function chartReached(at, reach) {
  const whole = Math.floor(reach);
  const shown = at.slice(0, whole + 1);
  const next = at[whole + 1];
  if (next) shown.push([0, 1].map(axis => lerp(at[whole][axis], next[axis], reach - whole)));
  return shown;
}
// a progress ring centred on (x, y), radius r, filled clockwise from the top by p; the percentage (or o.label) in the middle
const ringChart = (T, K, x, y, r, p, o = {}) => {
  const lw = o.lw || r * 0.22;
  const top = -Math.PI / 2;
  K.save();
  Object.assign(K, { lineWidth: lw, strokeStyle: dotPattern(K, '#111111', 1.2) });
  runOps(K, [['beginPath'], ['arc', x, y, r, 0, TAU], ['stroke']]);
  K.restore();
  K.save();
  Object.assign(K, { lineWidth: lw, lineCap: 'round', strokeStyle: o.col || C.red });
  if (p > 0.001) runOps(K, [['beginPath'], ['arc', x, y, r, top, top + TAU * clamp(p)], ['stroke']]);
  K.restore();
  if (o.label === false) return;
  text(K, o.label || Math.round(p * 100) + '%', x, y + r * 0.2, chartType('grot', 700, r * 0.55, C.ink, { ls: -r * 0.02 }));
};
// a before/after card: a divider wipes left to right as p goes 0 → 1, uncovering drawB over drawA (each gets (K, x, y, w, h))
const beforeAfter = (T, K, x, y, w, h, p, drawA, drawB, o = {}) => {
  const split = x + w * clamp(p);
  const clipTo = (left, width, draw) => {
    K.save();
    runOps(K, [['beginPath'], ['rect', left, y, width, h], ['clip']]);
    draw(K, x, y, w, h);
    K.restore();
  };
  uiCard(T, K, x, y, w, h, { r: 28 });
  K.save();
  rr(K, x, y, w, h, 28);
  K.clip();
  clipTo(split, x + w - split, drawA);
  clipTo(x, split - x, drawB);
  K.restore();
  const moving = p > 0.001 && p < 0.999;
  if (moving) chartHandle(K, split, y, h);
  // the side labels: BEFORE until the wipe is most of the way across, AFTER once it has begun
  const labels = [[p < 0.85, o.a || 'BEFORE', x + w - 28, '#8a8780', 'right'], [p > 0.15, o.b || 'AFTER', x + 28, C.red, 'left']];
  for (const [visible, word, lx, colour, align] of labels) {
    if (visible) text(K, word, lx, y + 46, chartType('mono', 700, 22, colour, { align }));
  }
};
// the wipe's divider line and its round ↔ handle
function chartHandle(K, sx, y, h) {
  const middle = y + h / 2;
  line(K, sx, y - 10, sx, y + h + 10, C.red, 6, 'round');
  circle(K, sx, middle, 22, C.red);
  text(K, '↔', sx, middle + 9, chartType('grot', 700, 26, '#FFFFFF'));
}
// two stacked option rows; at o.tWin the winner (row o.winner) gets an accent border and the other dims and is crossed out.
// rows: [{ label, value }]; o: { t, tWin, winner }
const VERSUS = { rowH: 130, gap: 26, inset: 34, size: 40 };
const versus = (T, K, x, y, w, rows, o = {}) => {
  const t = o.t ?? 0, rh = VERSUS.rowH;
  const decided = t >= (o.tWin ?? 1e9);
  rows.forEach((r, i) => {
    const ry = y + i * (rh + VERSUS.gap);
    const won = decided && i === (o.winner ?? 0);
    const lost = decided && !won;
    const mid = ry + rh / 2 + 14;
    uiCard(T, K, x, ry, w, rh, { r: 26, border: won ? C.red : HAIR, lw: won ? 4 : 3 });
    K.save();
    K.globalAlpha *= lost ? 0.45 : 1;
    text(K, r.label, x + VERSUS.inset, mid, chartType('grot', 700, VERSUS.size, C.ink, { align: 'left', ls: -1 }));
    if (r.value) text(K, r.value, x + w - VERSUS.inset, mid, chartType('grot', 700, VERSUS.size, won ? C.red : C.ink, { align: 'right' }));
    K.restore();
    if (lost) cross(K, x + w - 60, ry + rh / 2, 50, clamp((t - o.tWin) / 0.25), C.red, 8);
  });
};
