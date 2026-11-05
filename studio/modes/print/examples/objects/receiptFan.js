// ── OUR PROP · RECEIPT FAN: receipts fan out one by one, then slide together and flip into one big total.
// Story it tells: costs that add up ("five subscriptions", "every tool you pay for"), then the shocking sum.
// How it moves:
//   · each receipt springs into its place in the fan on its own cue (rotation around a shared pivot under the fan),
//     with an echo while it moves; the ×n badge ticks up with each one
//   · totalAt: they all slide onto the front receipt in one move, it flips edge-on (0.1 s) and comes back as the total card:
//     a big accent number that rolls up, a line above and a line below
// Idle life: the fan breathes ±0.8°, the total card floats.
// Loading: not part of the engine; the props showcase (examples/props-reel) loads it.

// o: { items: [{ title, amount, lines: [[label, value]], stamp }], arriveAt: [t, …], totalAt, total = 0, totalLine, totalSub,
//      prefix = '$', w = 300, s = 1 }
function receiptFan(T, K, x, y, t, o = {}) {
  const { items = [], arriveAt = [], totalAt = null, total = 0, totalLine = 'EVERY MONTH', totalSub = '', prefix = '$', w = 300, s = 1 } = o;
  const n = items.length;
  const fanA = j => (j - (n - 1) / 2) * 13;
  const gather = totalAt == null ? 0 : E.inOutCubic(clamp((t - totalAt) / 0.22));
  const flip = totalAt == null ? -1 : (t - totalAt - 0.22) / 0.12;
  const count = arriveAt.filter(a => t >= a).length;
  X([T, K], x, y, s, Math.sin(t * 1.4) * 0.8, () => {
    if (flip < 0.5) {
      items.forEach((it, j) => {
        const at = arriveAt[j] ?? 0; if (t < at) return;
        const k = Math.min(1.1, spring(t - at, 2.6, 0.45));
        const angOf = tt => lerp(fanA(j) + 30, fanA(j), Math.min(1.1, spring(tt - at, 2.6, 0.45))) * (1 - gather);
        const draw = (tt, alpha) => {
          K.save(); T.save(); K.globalAlpha *= alpha; T.globalAlpha *= alpha;
          X([T, K], 0, 420, 1, angOf(tt), () => X([T, K], 0, -420, lerp(0.7, 1, Math.min(1, k)), 0, () => rfReceipt(T, K, it, j, w, flip > 0 && j === n - 1 ? Math.cos(flip * Math.PI) : 1)));
          K.restore(); T.restore();
        };
        if (t - at < 0.25) draw(t - 1 / 30, 0.3);
        draw(t, 1);
      });
    } else rfTotal(T, K, t, totalAt + 0.28, Math.min(1, -Math.cos(flip * Math.PI)), total, prefix, totalLine, totalSub, w);
    // the count badge
    if (count > 0 && flip < 0.5) X([K], w * 0.95, -360, 1 + ring(t - arriveAt[count - 1], 4, 8) * 0.25, 0, () => {
      circle(K, 0, 0, 40, C.red, C.ink, 4);
      text(K, '×' + count, 0, 13, { font: F.anton, size: 40, color: '#FFFFFF' });
    });
  });
}

function rfReceipt(T, K, it, j, w, sx) {
  const { title = 'ITEM', amount = '$0', lines = [], stamp: mark = null } = it;
  const H = 330 + lines.length * 34, L = -w / 2, Tp = -H / 2;
  K.save(); T.save(); K.scale(Math.max(0.02, sx), 1); T.scale(Math.max(0.02, sx), 1);
  const edge = (c) => {
    c.beginPath(); c.moveTo(L, Tp); c.lineTo(L + w, Tp); c.lineTo(L + w, Tp + H);
    for (let i = 0; i <= 12; i++) c.lineTo(L + w - i * w / 12, Tp + H + (i % 2 ? -14 : 0));
    c.closePath();
  };
  T.save(); T.translate(14, 16); edge(T); T.fillStyle = C.k60; T.fill(); T.restore();
  // face on the crisp layer: receipts overlap, and only crisp fills hide what's behind them
  edge(K); K.fillStyle = CARD; K.fill();
  K.fillStyle = '#ECE7DE'; K.fillRect(L + w - 26, Tp + 2, 24, H - 16);
  edge(K); Object.assign(K, { strokeStyle: C.ink, lineWidth: 4, lineJoin: 'round' }); K.stroke();
  text(K, '#00' + (j + 1), L + w - 18, Tp + 34, { font: F.mono, weight: 700, size: 20, color: '#8a8780', align: 'right' });
  text(K, title, 0, Tp + 82, { font: F.anton, size: 44, color: C.ink, ls: 2 });
  K.save(); K.setLineDash([8, 7]); line(K, L + 20, Tp + 106, L + w - 20, Tp + 106, C.k45, 3); K.restore();
  lines.forEach(([a, b], i) => {
    text(K, a, L + 22, Tp + 146 + i * 34, { font: F.mono, weight: 600, size: 21, color: '#5E5A54', align: 'left' });
    text(K, b, L + w - 22, Tp + 146 + i * 34, { font: F.mono, weight: 600, size: 21, color: '#5E5A54', align: 'right' });
  });
  const ty = Tp + 160 + lines.length * 34;
  line(K, L + 20, ty, L + w - 20, ty, C.ink, 3);
  text(K, 'TOTAL', L + 22, ty + 46, { font: F.mono, weight: 800, size: 24, color: C.ink, align: 'left' });
  text(K, amount, L + w - 22, ty + 50, { font: F.anton, size: 52, color: C.red, align: 'right' });
  if (mark) X([K], 20, ty + 110, 1, -10, () => {
    strokeRR(K, -78, -30, 156, 56, 8, C.red, 5);
    text(K, mark, 0, 14, { font: F.anton, size: 38, color: C.red, ls: 4 });
  });
  K.restore(); T.restore();
}
function rfTotal(T, K, t, at, sx, total, prefix, top, sub, w) {
  const W = w * 1.7, H = 420;
  X([T, K], 0, Math.sin(t * 2) * 4, 1, 0, () => {
    K.save(); T.save(); K.scale(Math.max(0.02, sx), 1); T.scale(Math.max(0.02, sx), 1);
    card(T, K, -W / 2, -H / 2, W, H, { r: 22, sh: 22, lw: 5 });
    fillRR(T, W / 2 - 46, -H / 2, 46, H, 0, C.k20);
    text(K, top, 0, -H / 2 + 62, { font: F.mono, weight: 800, size: 28, color: '#8a8780', ls: 3 });
    const v = total * E.outCubic(clamp((t - at) / 0.7));
    text(K, prefix + Math.round(v).toLocaleString('en-US'), 0, 70, { font: F.anton, size: 190, color: C.red });
    if (sub) text(K, sub, 0, H / 2 - 40, { font: F.grot, weight: 800, size: 32, color: C.ink });
    K.restore(); T.restore();
  });
}
