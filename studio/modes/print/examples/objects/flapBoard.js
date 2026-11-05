// ── OUR PROP · FLAP BOARD: a split-flap departure board that flips to a new word on each cue.
// Story it tells: "the next one is…" (the next role, city, step, tool), a status that keeps changing, a count that ticks.
// How it moves:
//   · every change runs left → right: each changed flap folds through one or two random letters before it lands
//     (the top half falls on its hinge, then the new bottom half swings down), 0.07 s per fold, 0.014 s apart
//   · row 1 = a big word (8 flaps) with an accent icon flap, row 2 = a small line (16 flaps), row 3 = a 3-flap counter + label
//   · the housing jolts on every row-1 change; the status lamp blinks while any flap is running
// Idle life: the lamp keeps a slow pulse and the board breathes 1 px, so a held board still reads as live.
// Loading: not part of the engine; the props showcase (examples/props-reel) loads it.

// o: { title, big: [[t, 'WORD', 'ICON']], line: [[t, 'small line']], count: [[t, '036']], countLabel = 'ITEMS', w = 920, s = 1 }
function flapBoard(T, K, x, y, t, o = {}) {
  const { title = 'NOW BOARDING', big = [], line: small = [], count = [], countLabel = 'ITEMS', w = 920, s = 1 } = o;
  const k = w / 920, H = 500;
  const rows = [
    { x: 196, y: 112, w: 78, h: 124, gap: 8, n: 8, size: 96, stagger: 0.014, extra: 1, changes: big.map(([a, wd]) => [a, wd]) },
    { x: 40, y: 262, w: 46, h: 66, gap: 6, n: 16, size: 44, stagger: 0.008, extra: 1, changes: small },
    { x: 40, y: 352, w: 84, h: 110, gap: 8, n: 3, size: 86, stagger: 0.04, extra: 2, changes: count },
  ];
  const kickT = big.reduce((m, [a]) => (t >= a ? a : m), -9);
  const jolt = ring(t - kickT, 3.2, 6);
  const busy = [...big, ...small, ...count].some(([a]) => t >= a && t < a + 0.5);
  X([T, K], x, y + Math.sin(t * 2) * 1, s * k, -0.8 * jolt, () => {
    const L = -460, Tp = -H / 2;
    // brackets on top, then the housing (dark, so its depth comes from the print shadow and a shaded right edge)
    [0.22, 0.78].forEach(f => { fillRR(K, L + 920 * f - 30, Tp - 30, 60, 44, 8, '#AEB3BA'); strokeRR(K, L + 920 * f - 30, Tp - 30, 60, 44, 8, C.ink, 4); });
    fillRR(T, L + 24, Tp + 26, 920, H, 28, C.k60);
    fillRR(K, L, Tp, 920, H, 28, '#1F1E24'); fillRR(K, L + 872, Tp + 84, 44, H - 90, 0, '#16151A');
    fillRR(K, L, Tp, 920, 84, 28, '#2B2A31'); fillRR(K, L, Tp + 56, 920, 28, 0, '#2B2A31'); line(K, L, Tp + 84, L + 920, Tp + 84, C.ink, 4);
    strokeRR(K, L, Tp, 920, H, 28, C.ink, 6);
    fillRR(K, L + 24, Tp + 18, 330, 50, 8, '#F1EAD8'); strokeRR(K, L + 24, Tp + 18, 330, 50, 8, C.ink, 4);
    text(K, title, L + 189, Tp + 55, { font: F.anton, size: 34, color: C.ink, ls: 4 });
    const lampOn = busy ? Math.sin(t * TAU * 7) > 0 : Math.sin(t * TAU * 0.8) > 0.6;
    circle(K, L + 880, Tp + 42, 14, lampOn ? C.red : '#55535C', C.ink, 3);
    // icon flap
    const icons = big.filter(b => b[2]).map(([a, , ic]) => [a - 0.02, ic]);
    fbTile(K, L + 40, Tp + 112, 124, 124, fbFlipsOf(icons.map(([a, ic]) => [a, ic]), 0, 0, 0, true), t, 40, true);
    rows.forEach((r, ri) => {
      for (let j = 0; j < r.n; j++) {
        const flips = fbFlipsOf(r.changes, j, r.stagger, r.extra, false, r.n, ri);
        fbTile(K, L + r.x + j * (r.w + r.gap), Tp + r.y, r.w, r.h, flips, t, r.size, false);
      }
    });
    text(K, countLabel, L + 40 + 3 * 92 + 22, Tp + 438, { font: F.anton, size: 76, color: '#F4F0E8', align: 'left', ls: 2 });
  });
}

const FB_LETTERS = 'ABCDEFGHIJKLMNOPRSTUVWXYZ0123456789';
const FB_FOLD = 0.07;
// the flips one flap makes: [[start, from, to]], each change passing through `extra` random letters
function fbFlipsOf(changes, j, stagger, extra, whole, n = 1, salt = 0) {
  const flips = [];
  let prev = ' ';
  changes.slice().sort((a, b) => a[0] - b[0]).forEach(([at, str], ci) => {
    const next = whole ? str : (String(str).toUpperCase().padEnd(n)[j] || ' ');
    if (next === prev) return;
    const seq = [prev];
    for (let m = 0; m < extra; m++) seq.push(FB_LETTERS[Math.floor(hash(j * 31 + ci * 7 + m + salt * 101) * FB_LETTERS.length)]);
    seq.push(next);
    for (let m = 0; m < seq.length - 1; m++) flips.push([at + j * stagger + m * FB_FOLD, seq[m], seq[m + 1]]);
    prev = next;
  });
  return flips;
}
function fbFace(K, x, y, w, h, str, size, icon) {
  fillRR(K, x, y, w, h, Math.max(4, w * 0.1), icon ? C.red : '#34333B');
  fillRR(K, x, y + h / 2, w, h / 2, 0, icon ? C.redD : '#2A2930');
  if (!str || str === ' ') return;
  if (icon) { fbIcon(K, x + w / 2, y + h / 2, w * 0.3, str); return; }
  text(K, str, x + w / 2, y + h / 2 + size * 0.36, { font: F.mono, weight: 800, size, color: '#F4F0E8' });
}
// one flap: the settled face, or a fold in progress (old bottom + new top underneath, the moving half on top)
function fbTile(K, x, y, w, h, flips, t, size, icon) {
  let cur = ' ', fold = null;
  for (const f of flips) { if (f[0] > t) break; if (t < f[0] + FB_FOLD) { fold = f; break; } cur = f[2]; }
  const half = (str, top, sy = 1) => {
    K.save(); K.beginPath(); K.rect(x - 2, top ? y - 2 : y + h / 2, w + 4, h / 2 + 2); K.clip();
    K.translate(0, y + h / 2); K.scale(1, sy); K.translate(0, -(y + h / 2));
    fbFace(K, x, y, w, h, str, size, icon);
    if (sy < 1) { K.fillStyle = `rgba(0,0,0,${0.5 * (1 - sy)})`; K.fillRect(x, y, w, h); }
    K.restore();
  };
  if (!fold) fbFace(K, x, y, w, h, cur, size, icon);
  else {
    const p = (t - fold[0]) / FB_FOLD;
    half(fold[2], true); half(fold[1], false);
    if (p < 0.5) half(fold[1], true, Math.max(0.02, Math.cos(p * Math.PI)));
    else half(fold[2], false, Math.max(0.02, -Math.cos(p * Math.PI)));
  }
  line(K, x, y + h / 2, x + w, y + h / 2, '#0B0B0D', 3);
  fillRR(K, x - 3, y + h / 2 - 5, 6, 10, 2, '#8E939B'); fillRR(K, x + w - 3, y + h / 2 - 5, 6, 10, 2, '#8E939B');
}
function fbIcon(K, x, y, r, kind) {
  K.save(); Object.assign(K, { fillStyle: '#FFFFFF', strokeStyle: '#FFFFFF', lineWidth: 6, lineCap: 'round', lineJoin: 'round' });
  if (kind === 'plane') { polyPath(K, [[x - r, y], [x + r, y - r * 0.15], [x + r, y + r * 0.15]], true); K.fill(); line(K, x, y, x - r * 0.3, y - r * 0.8, '#FFFFFF', 8); line(K, x, y, x - r * 0.3, y + r * 0.8, '#FFFFFF', 8); }
  else if (kind === 'phone') { fillRR(K, x - r * 0.5, y - r, r, r * 2, 6, '#FFFFFF'); fillRR(K, x - r * 0.3, y - r * 0.7, r * 0.6, r * 1.2, 2, C.red); }
  else if (kind === 'coin') { circle(K, x, y, r, '#FFFFFF'); text(K, '$', x, y + r * 0.45, { font: F.anton, size: r * 1.3, color: C.red }); }
  else if (kind === 'scale') { line(K, x, y - r, x, y + r, '#FFFFFF', 6); line(K, x - r, y - r * 0.5, x + r, y - r * 0.5, '#FFFFFF', 6); K.beginPath(); K.arc(x - r * 0.8, y, r * 0.4, 0, Math.PI); K.fill(); K.beginPath(); K.arc(x + r * 0.8, y, r * 0.4, 0, Math.PI); K.fill(); }
  else text(K, String(kind).slice(0, 1).toUpperCase(), x, y + r * 0.5, { font: F.anton, size: r * 1.6, color: '#FFFFFF' });
  K.restore();
}
