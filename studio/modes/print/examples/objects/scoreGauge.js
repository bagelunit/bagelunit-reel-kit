// ── OUR PROP · SCORE GAUGE: a big riveted dial. The needle sweeps to a score, the counter rolls with it, flags pop underneath.
// Story it tells: a score, a rating, a level, a health check ("your site scores 64", "risk: high").
// How it moves:
//   · sweepAt: the needle springs to the value with a soft overshoot, then trembles (9 Hz) for 1.4 s as it settles
//   · the counter in the black window always shows the needle's current value, so it rolls with the sweep
//   · flags: accent chips pop up under the dial one by one, each on its own cue, tilted a little differently
// Idle life: after settling the needle keeps a slow ±0.25 drift, and the glass glare stays put while the dial breathes.
// Loading: not part of the engine; the props showcase (examples/props-reel) loads it.

// o: { label = 'SCORE', tag, value = 64, sweepAt, flags: [[t, 'text']], w = 760, s = 1 }
function scoreGauge(T, K, x, y, t, o = {}) {
  const { label = 'SCORE', tag = '', value = 64, sweepAt = 0, flags = [], w = 760, s = 1 } = o;
  const u = t - sweepAt;
  let v = u <= 0 ? 0 : value * spring(u, 1.3, 0.42) + (u < 1.4 ? 0.8 * Math.sin(TAU * 9 * u) * (1 - u / 1.4) : 0.25 * Math.sin(TAU * 0.4 * t));
  v = clamp(v, -2, 104);
  const ang = vv => (150 + 2.4 * vv) * D2R;
  const at = (r, vv) => [Math.cos(ang(vv)) * r, Math.sin(ang(vv)) * r];
  X([T, K], x, y, s * w / 760, 0, () => {
    // bezel: print shadow, grey steel (line screen), rivets, a shaded lower-right
    circle(T, 16, 20, 302, C.k60);
    circle(T, 0, 0, 300, C.k30);
    T.save(); T.beginPath(); T.arc(0, 0, 300, -0.6, 1.9); T.arc(0, 0, 268, 1.9, -0.6, true); T.closePath(); T.fillStyle = C.k45; T.fill(); T.restore();
    circle(K, 0, 0, 300, null, C.ink, 6); circle(K, 0, 0, 278, null, '#8E939B', 4);
    for (let j = 0; j < 10; j++) { const a = j / 10 * TAU; circle(K, Math.cos(a) * 286, Math.sin(a) * 286, 5, '#D7DBE0', C.ink, 2); }
    // face, zones, ticks, numbers
    circle(T, 0, 0, 262, '#FFFFFF'); circle(K, 0, 0, 262, null, C.ink, 4);
    [[0, 50, C.red], [50, 80, '#C9C4BA'], [80, 100, C.ink]].forEach(([a, b, col]) => {
      K.beginPath(); K.arc(0, 0, 232, ang(a), ang(b)); Object.assign(K, { strokeStyle: col, lineWidth: 22, lineCap: 'butt' }); K.stroke();
    });
    for (let j = 0; j <= 50; j++) { const vv = j * 2, major = j % 5 === 0, [x0, y0] = at(major ? 188 : 200, vv), [x1, y1] = at(214, vv); line(K, x0, y0, x1, y1, C.ink, major ? 5 : 2.5); }
    [0, 20, 40, 60, 80, 100].forEach(vv => { const [nx, ny] = at(156, vv); text(K, String(vv), nx, ny + 11, { font: F.anton, size: 34, color: C.ink }); });
    text(K, label, 0, 92, { font: F.mono, weight: 800, size: 26, color: '#8a8780', ls: 2 });
    // counter window
    fillRR(K, -100, 116, 200, 96, 14, C.ink);
    text(K, String(Math.max(0, Math.min(100, Math.round(v)))), -14, 188, { font: F.anton, size: 84, color: '#FFFFFF' });
    text(K, '/100', 64, 186, { font: F.mono, weight: 800, size: 22, color: '#8E8A82' });
    // needle on its hub
    K.save(); K.rotate(ang(v));
    polyPath(K, [[-40, -7], [196, -3], [214, 0], [196, 3], [-40, 7]], true);
    Object.assign(K, { fillStyle: C.red, strokeStyle: C.ink, lineWidth: 3.5, lineJoin: 'round' }); K.fill(); K.stroke();
    K.restore();
    circle(K, 0, 0, 30, '#B9BEC6', C.ink, 4); circle(K, 0, 0, 10, C.ink);
    // the glass glare
    K.beginPath(); K.arc(0, 0, 240, ang(-12), ang(16)); Object.assign(K, { strokeStyle: 'rgba(255,255,255,0.6)', lineWidth: 14, lineCap: 'round' }); K.stroke();
    if (tag) { fillRR(K, -130, 296, 260, 44, 10, C.ink); text(K, tag, 0, 326, { font: F.mono, weight: 800, size: 20, color: '#FFFFFF' }); }
    // flag chips
    flags.forEach(([fa, str], j) => {
      const m = Math.min(1.12, pop(t - fa, 3.4, 0.5)); if (m <= 0) return;
      const fx = -272 + j * 272;
      X([T, K], fx, 390 + 40 * (1 - m), Math.max(0.01, m), [-4, 3, -2][j % 3] * m, () => {
        fillRR(T, -118 + 8, -30 + 10, 236, 60, 12, C.k60);
        fillRR(K, -118, -30, 236, 60, 12, C.red); strokeRR(K, -118, -30, 236, 60, 12, C.ink, 4);
        warn(K, -88, 0, 0.32, '#FFFFFF');
        text(K, str, 14, 10, { font: F.grot, weight: 800, size: str.length > 11 ? 23 : 27, color: '#FFFFFF' });
      });
    });
  });
}
