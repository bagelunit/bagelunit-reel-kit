// ── OUR PROP · TUBE MAIL: two terminals staged in depth, joined by a glass pneumatic tube. Capsules shoot through it; at
// the far end the door flips open and the note inside unrolls.
// Story it tells: a handoff between two workers, apps, sessions or teams ("one plans, the other builds", "it sends the result back").
// How it moves:
//   · the two terminals slide in from opposite edges (front one big, back one smaller), their lines type in on cue
//   · tubeAt: the glass arch draws itself from A to B
//   · each send: a capsule (steel body, accent caps) flies along the arch in 0.45 s with a short trail of echoes;
//     the counter box on the arch ticks as it passes; the receiving terminal jolts, its frame flashes accent, and the note
//     unrolls above it (label + a short checklist)
// Idle life: cursors blink, the counter LED pulses, the tube highlight slides slowly.
// Loading: not part of the engine; the props showcase (examples/props-reel) loads it.

// o: { aTitle, bTitle, aLines: [[t, 'text']], bLines, arriveAt, tubeAt, sends: [{ at, label, dir: 'ab' | 'ba', lines: [] }],
//      counterLabel = 'HANDOFFS', s = 1 }
function tubeMail(T, K, x, y, t, o = {}) {
  const { aTitle = 'planner', bTitle = 'builder', aLines = [], bLines = [], arriveAt = 0, sends = [], counterLabel = 'HANDOFFS', s = 1 } = o;
  const tubeAt = o.tubeAt ?? arriveAt + 0.35;
  const A = { x: -230, y: 260, w: 560, h: 330, fs: 28 }, B = { x: 250, y: -150, w: 420, h: 260, fs: 22 };
  const inA = E.outCubic(clamp((t - arriveAt) / 0.32)), inB = E.outCubic(clamp((t - arriveAt - 0.08) / 0.32));
  const path = [[A.x + 80, A.y - A.h / 2 - 30], [A.x + 80, -380], [B.x - 60, -470], [B.x - 60, B.y - B.h / 2 - 30]];
  const hitOf = (side) => sends.filter(sd => ((sd.dir || 'ab') === 'ab' ? 'b' : 'a') === side).map(sd => sd.at + 0.45);
  const jolt = side => hitOf(side).reduce((m, h) => m + (t >= h ? ring(t - h, 3, 7) : 0), 0);
  const rolled = sends.reduce((sum, sd) => sum + E.outCubic(clamp((t - sd.at - 0.22) / 0.2)), 0);   // ticks as each capsule passes the box
  X([T, K], x, y, s, 0, () => {
    // back terminal first (it sits behind the tube and the front one)
    X([T, K], lerp(900, 0, inB), 0, 1, 0, () => tmTerminal(T, K, t, B, bTitle, bLines, jolt('b'), hitOf('b')));
    // stations on top of each terminal + the glass arch
    const tp = P(t, tubeAt, 0.35, E.outCubic);
    if (inA > 0.99 && inB > 0.99 && tp > 0) {
      [[path[0], 1], [path[3], 1]].forEach(([q]) => { fillRR(K, q[0] - 34, q[1] - 6, 68, 40, 8, '#B9BEC6'); strokeRR(K, q[0] - 34, q[1] - 6, 68, 40, 8, C.ink, 4); });
      cable(K, path, tp, C.ink, 30); cable(K, path, tp, '#E9EEF2', 20);
      if (tp >= 1) { const g = bez(path, (t * 0.15) % 1), g2 = bez(path, ((t * 0.15) % 1) + 0.04 > 1 ? 1 : (t * 0.15) % 1 + 0.04); line(K, g[0] - 5, g[1] - 4, g2[0] - 5, g2[1] - 4, '#FFFFFF', 5); }
      // counter box mounted at the top of the arch
      const top = bez(path, 0.3);
      X([T, K], top[0], top[1] - 70, 1, 0, () => {
        card(T, K, -120, -44, 240, 88, { r: 12, sh: 10, lw: 4 });
        text(K, counterLabel, -14, -12, { font: F.mono, weight: 800, size: 18, color: '#8a8780' });
        circle(K, 96, -22, 8, Math.sin(t * 6) > 0 ? C.red : C.redD);
        odometer(K, rolled, -14, 34, { size: 46, align: 'center', digits: 2 });
      });
      // capsules with echoes
      sends.forEach(sd => {
        const u = (t - sd.at) / 0.45; if (u < 0 || u > 1) return;
        const ab = (sd.dir || 'ab') === 'ab';
        [0.12, 0.06, 0].forEach((lag, gi) => {
          const uu = clamp(E.inOutCubic(clamp(u - lag)));
          const q = bez(path, ab ? uu : 1 - uu), q2 = bez(path, clamp((ab ? uu : 1 - uu) + 0.01));
          const a = Math.atan2(q2[1] - q[1], q2[0] - q[0]);
          K.save(); K.globalAlpha *= gi === 2 ? 1 : 0.25 + gi * 0.2;
          X([K], q[0], q[1], 1, a / D2R, () => { fillRR(K, -34, -12, 68, 24, 10, '#C9CED4'); strokeRR(K, -34, -12, 68, 24, 10, C.ink, 3); fillRR(K, -34, -12, 14, 24, 6, C.red); fillRR(K, 20, -12, 14, 24, 6, C.red); });
          K.restore();
        });
      });
    }
    X([T, K], lerp(-900, 0, inA), 0, 1, 0, () => tmTerminal(T, K, t, A, aTitle, aLines, jolt('a'), hitOf('a')));
    // the note unrolls above whichever terminal received the capsule
    sends.forEach(sd => {
      const h = sd.at + 0.45, u = t - h; if (u < 0) return;
      const to = (sd.dir || 'ab') === 'ab' ? B : A;
      const next = sends.find(o2 => o2.at > sd.at && (((o2.dir || 'ab') === 'ab') === ((sd.dir || 'ab') === 'ab')));
      if (next && t > next.at + 0.45) return;
      tmNote(T, K, t, u, to.x + to.w * 0.08, to.y - to.h / 2 - 40, sd);
    });
  });
}

function tmTerminal(T, K, t, R, title, lines, jolt, hits) {
  X([T, K], R.x, R.y + -4 * jolt, 1, 1.2 * jolt, () => {
    const l = -R.w / 2, tp = -R.h / 2;
    fillRR(T, l + 18, tp + 20, R.w, R.h, 18, C.k60);
    fillRR(K, l, tp, R.w, R.h, 18, '#17161B');
    const flash = hits.some(h => t >= h && t < h + 0.25);
    strokeRR(K, l, tp, R.w, R.h, 18, flash ? C.red : C.ink, flash ? 8 : 5);
    fillRR(K, l + 4, tp + 4, R.w - 8, 44, 14, '#2B2A31');
    [C.red, '#E6B84A', '#5DBB63'].forEach((c, i) => circle(K, l + 28 + i * 24, tp + 26, 7, c));
    text(K, title, 0, tp + 34, { font: F.mono, weight: 700, size: 20, color: '#9A968E' });
    const shown = lines.filter(([a]) => t >= a);
    shown.slice(-6).forEach(([a, str, role], i) => {
      const typed = str.slice(0, Math.floor((t - a) / 0.025));
      const col = role === 'ok' ? '#7BD88F' : role === 'dim' ? '#77736C' : '#F4F0E8';
      text(K, (role === 'cmd' ? '> ' : '') + typed, l + 26, tp + 86 + i * R.fs * 1.45, { font: F.mono, weight: 600, size: R.fs, color: role === 'cmd' ? C.red : col, align: 'left' });
    });
    const ly = tp + 86 + Math.min(shown.length, 6) * R.fs * 1.45;
    if (Math.floor(t * 2.4) % 2) fillRR(K, l + 26, ly - R.fs * 0.8, R.fs * 0.55, R.fs, 2, '#F4F0E8');
  });
}
function tmNote(T, K, t, u, x, y, sd) {
  const lines = sd.lines || [];
  const W = 280, H = 70 + lines.length * 40;
  const k = E.outCubic(clamp(u / 0.3));
  X([T, K], x, y, 1, -3 + Math.sin(t * 1.8) * 0.8, () => {
    [T, K].forEach(c => { c.save(); c.beginPath(); c.rect(-W / 2 - 30, -H * k - 10, W + 60, H * k + 30); c.clip(); });
    card(T, K, -W / 2, -H, W, H, { r: 8, sh: 12, lw: 4 });
    fillRR(K, -W / 2 + 3, -H + 3, W - 6, 48, 6, C.red);
    text(K, sd.label || 'NOTE', 0, -H + 38, { font: F.anton, size: 34, color: '#FFFFFF', ls: 3 });
    lines.forEach((ln, i) => {
      check(K, -W / 2 + 22, -H + 82 + i * 40, 0.16, P(t, 0, 1) * clamp((u - 0.3 - i * 0.12) / 0.12), C.ink, 5);
      text(K, ln, -W / 2 + 60, -H + 92 + i * 40, { font: F.mono, weight: 700, size: 22, color: C.ink, align: 'left' });
    });
    [T, K].forEach(c => c.restore());
    fillRR(K, -W / 2 - 8, -H * k - 12, W + 16, 16, 8, '#C9CED4'); strokeRR(K, -W / 2 - 8, -H * k - 12, W + 16, 16, 8, C.ink, 3);
  });
}
