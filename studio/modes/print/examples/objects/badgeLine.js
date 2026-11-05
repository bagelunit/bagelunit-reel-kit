// ── OUR PROP · BADGE LINE: a clothesline of lanyard ID badges, one per job the same person is doing.
// Story it tells: "one person wearing every hat" (founder, sales, support…), or any list of roles that piles up on one owner.
// How it moves:
//   · the rope draws across left → right in 0.18 s and sags; clothes-pins pop on as it passes
//   · each badge grows out of its pin (45 → 100 % in 0.1 s), kicks to ±12° and swings like a pendulum at 1.4 Hz,
//     each swing back about 55 % of the last; a faint echo of the last frame trails it while it moves
//   · on every landing the rope dips and the neighbours lean away and rock back
//   · the newest badge has the accent header, older ones turn ink; its job icon pops on with three ticks
//   · tearAt: the straps snap left to right and the badges fall away tumbling
// Idle life: the whole line breathes (a slow sway), so a held shot never freezes.
// Use it as a pattern: swap the badges for whatever your script hangs on a line (tickets, receipts, warnings).
// Loading: not part of the engine; the props showcase (examples/props-reel) loads it.

// badges: [[t, 'JOB', icon]] icon: 'crown' | 'phone' | 'mega' | 'headset' | 'laptop' | null
// o: { badges, ropeAt = first badge - 0.3, tearAt = null, w = 960, s = 1, photo = C.ink }
function badgeLine(T, K, x, y, t, o = {}) {
  const { badges = [], w = 960, s = 1, tearAt = null, photo = C.ink } = o;
  const ropeAt = o.ropeAt ?? (badges.length ? badges[0][0] - 0.3 : 0);
  if (t < ropeAt) return;
  const n = badges.length, gap = w / (n + 1);
  const pins = badges.map((_, i) => -w / 2 + gap * (i + 1));
  const size = Math.min(1.35, gap * 0.9 / 168);   // badges grow to fill their share of the line
  const ropeP = P(t, ropeAt, 0.18, E.outCubic);
  // the rope dips a little more with every landing, then springs back
  const dip = badges.reduce((sum, [at]) => sum + (t >= at ? 14 * Math.max(0, ring(t - at, 1.6, 3.2)) + 4 : 0), 0);
  const sagAt = px => (22 + dip) * Math.sin(Math.PI * clamp((px + w / 2) / w)) + Math.sin(t * 1.3) * 2;
  X([T, K], x, y, s, 0, () => {
    blRope(T, K, w, ropeP, sagAt);
    badges.forEach(([at, job, icon], i) => {
      const px = pins[i], py = sagAt(px);
      if ((px + w / 2) / w > ropeP) return;
      blPin(K, px, py);
      if (t < at) { blSlot(K, px, py, size); return; }
      const lean = badges.reduce((sum, [bt], j) => (j === i || t < bt ? sum : sum + Math.sign(i - j) * 5 * ring(t - bt, 1.4, 3) / Math.abs(i - j)), 0);
      const angleAt = tt => pendulum(tt - at, 12.5, 1.4, 1.67) + lean + Math.sin(tt * 1.1 + i) * 1.2;
      const fall = tearAt != null && t >= tearAt + i * 0.07 ? gravityFall(t, tearAt + i * 0.07, (i - n / 2) * 60, -260, (i % 2 ? 1 : -1) * 160) : null;
      const newest = badges.every(([bt]) => bt <= at || bt > t);
      const draw = (tt, alpha) => {
        const grow = lerp(0.45, 1, E.outCubic(clamp((tt - at) / 0.1)));
        K.save(); T.save();
        K.globalAlpha *= alpha; T.globalAlpha *= alpha;
        X([T, K], px + (fall ? fall.dx : 0), py + (fall ? fall.dy : 0), grow * size, angleAt(tt) + (fall ? fall.r : 0), () => blBadge(T, K, tt, at, job, icon, newest, photo, !!fall));
        K.restore(); T.restore();
      };
      const moving = Math.abs(angleAt(t) - angleAt(t - 1 / 30)) > 0.6;
      if (moving && !fall) draw(t - 1 / 30, 0.3);   // the echo: last frame, see-through
      if (!fall || fall.dy < 2200) draw(t, 1);
    });
  });
}

function blRope(T, K, w, p, sagAt) {
  const pts = [];
  for (let i = 0; i <= 40 * p; i++) { const px = -w / 2 + w * i / 40; pts.push([px, sagAt(px)]); }
  if (pts.length < 2) return;
  polyPath(T, pts.map(([a, b]) => [a + 8, b + 12])); Object.assign(T, { strokeStyle: C.k45, lineWidth: 8 }); T.stroke();
  polyPath(K, pts); Object.assign(K, { strokeStyle: C.ink, lineWidth: 6, lineJoin: 'round' }); K.stroke();
  [-w / 2, w / 2].forEach((px, i) => { if (i === 0 || p >= 1) { fillRR(K, px - 14, sagAt(px) - 26, 28, 52, 6, C.ink); } });
}
function blPin(K, px, py) {
  fillRR(K, px - 9, py - 30, 18, 52, 4, '#C9A877'); strokeRR(K, px - 9, py - 30, 18, 52, 4, C.ink, 4);
  line(K, px, py - 22, px, py + 16, C.ink, 3);
}
// an empty slot under a pin before its badge arrives: a dashed outline
function blSlot(K, px, py, size) {
  K.save(); K.setLineDash([12, 10]); strokeRR(K, px - 70 * size, py + 86 * size, 140 * size, 230 * size, 14, C.k45, 4); K.restore();
}
function blBadge(T, K, tt, at, job, icon, hot, photo, falling) {
  const W = 168, H = 230, top = 74;
  line(K, -18, 18, -6, top, C.red, 10); line(K, 18, 18, 6, top, C.red, 10);               // the lanyard strap
  if (falling) { line(K, -18, 18, -14, 34, C.red, 10); }
  fillRR(K, -14, top - 6, 28, 22, 5, '#9AA0A8'); strokeRR(K, -14, top - 6, 28, 22, 5, C.ink, 3);   // the clip
  // face on the crisp layer so a leaning neighbour hides behind it; print shadow on the tone layer
  fillRR(T, -W / 2 + 14, top + 26, W, H, 16, C.k60);
  fillRR(K, -W / 2, top + 12, W, H, 16, CARD);
  fillRR(K, W / 2 - 30, top + 14, 28, H - 4, 0, '#ECE7DE');                              // shade side
  strokeRR(K, -W / 2, top + 12, W, H, 16, C.ink, 5);
  fillRR(K, -W / 2 + 3, top + 15, W - 6, 46, 13, hot ? C.red : C.ink);
  text(K, 'STAFF', 0, top + 48, { font: F.anton, size: 30, color: '#FFFFFF', ls: 4 });
  // the photo slides up into its window
  const rise = 1 - E.outCubic(clamp((tt - at - 0.08) / 0.2));
  K.save(); K.beginPath(); K.rect(-46, top + 74, 92, 92); K.clip();
  fillRR(K, -46, top + 74, 92, 92, 0, '#E9E4DA');
  person(K, 0, top + 128 + rise * 90, 1.0, photo);
  K.restore(); strokeRR(K, -46, top + 74, 92, 92, 8, C.ink, 4);
  text(K, job, 0, top + 206, { font: F.anton, size: job.length > 8 ? 30 : 38, color: C.ink, ls: 2 });
  if (icon) {
    const k = pop(tt - at - 0.16, 3.2, 0.45);
    if (k > 0) X([K], 52, top + 84, k, -10, () => blIcon(K, icon));
    for (let j = 0; j < 3; j++) {
      const p = P(tt, at + 0.18, 0.22, E.outCubic), a = -1.9 + j * 0.45;
      if (p > 0 && p < 1) line(K, 52 + Math.cos(a) * (36 + p * 30), top + 84 + Math.sin(a) * (36 + p * 30), 52 + Math.cos(a) * (50 + p * 34), top + 84 + Math.sin(a) * (50 + p * 34), C.red, 5);
    }
  }
}
function blIcon(K, kind) {
  circle(K, 0, 0, 30, '#FFFFFF', C.ink, 4);
  K.save(); K.fillStyle = C.ink; K.strokeStyle = C.ink; K.lineWidth = 4; K.lineJoin = 'round';
  if (kind === 'crown') { polyPath(K, [[-18, 10], [-18, -10], [-9, 0], [0, -14], [9, 0], [18, -10], [18, 10]], true); K.fillStyle = C.red; K.fill(); K.stroke(); }
  if (kind === 'phone') { fillRR(K, -11, -18, 22, 36, 5, C.ink); fillRR(K, -7, -13, 14, 22, 2, '#FFFFFF'); }
  if (kind === 'mega') { polyPath(K, [[-16, -6], [6, -16], [6, 16], [-16, 6]], true); K.fill(); fillRR(K, 6, -6, 10, 12, 3, C.red); }
  if (kind === 'headset') { K.beginPath(); K.arc(0, 2, 16, Math.PI, TAU); K.stroke(); fillRR(K, -20, -2, 9, 16, 3, C.ink); fillRR(K, 11, -2, 9, 16, 3, C.ink); line(K, 15, 14, 4, 18, C.red, 4); }
  if (kind === 'laptop') { fillRR(K, -16, -14, 32, 22, 3, C.ink); fillRR(K, -12, -10, 24, 14, 2, '#FFFFFF'); fillRR(K, -21, 8, 42, 6, 2, C.ink); }
  K.restore();
}
