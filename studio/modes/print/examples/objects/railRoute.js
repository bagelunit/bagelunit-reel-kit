// ── OUR PROP · RAIL ROUTE: a model railway on a wooden plinth. The team lays the track station by station, then a
// locomotive runs the same route on its own.
// Story it tells: "people did these steps by hand, now one thing runs the whole route" (a workflow, a pipeline, a process).
// How it moves:
//   · each layAt: a track segment drops in with a kick, its station sign pops up, the lamp turns red, a little worker appears
//   · trainAt: the locomotive rolls in from the left; wheels turn with the distance travelled, the side rod cranks,
//     the boiler bobs and steam puffs rise and spread (they print as line screen)
//   · passAt: the cab reaches each station, the lamp swaps for a tick and the worker waves; the last one is where it stops
//     (a little squash on arrival)
// Idle life: steam keeps puffing slowly after it stops.
// Loading: not part of the engine; the props showcase (examples/props-reel) loads it.

// o: { plate, stops: ['A', 'B', 'C'], layAt: [t, t, t], trainAt, passAt: [t, t, t], w = 900, s = 1 }
function railRoute(T, K, x, y, t, o = {}) {
  const { plate = 'HOW THE TEAM WORKS', stops = ['RESEARCH', 'DRAFT', 'SHIP'], layAt = [0, 0.3, 0.6], trainAt = 1.2, passAt = [1.8, 2.4, 3], w = 900, s = 1 } = o;
  const SX = [-290, 0, 290], RY = 100;
  const stop = passAt[passAt.length - 1];
  const keys = [[trainAt, -790], ...passAt.map((a, i) => [a, SX[i] - 150])];
  const trainX = tt => {
    if (tt <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      const [a, xa] = keys[i - 1], [b, xb] = keys[i];
      if (tt < b) { const u = (tt - a) / (b - a); return lerp(xa, xb, i === keys.length - 1 ? E.outCubic(u) : i === 1 ? E.inOutCubic(u) * 0.5 + u * 0.5 : u); }
    }
    return keys[keys.length - 1][1];
  };
  X([T, K], x, y, s * w / 900, 0, () => {
    // plinth: wood front, a lip, a brass plate
    fillRR(T, -450 + 18, 130 + 22, 900, 122, 10, C.k60);
    fillRR(K, -450, 130, 900, 122, 10, '#9C6B44');
    for (let i = 0; i < 3; i++) line(K, -430, 162 + i * 30, 430, 160 + i * 30 + Math.sin(i * 3) * 4, '#7E5534', 3);
    fillRR(T, 330, 130, 120, 122, 0, C.k30);
    strokeRR(K, -450, 130, 900, 122, 10, C.ink, 5);
    fillRR(K, -450, 120, 900, 18, 5, '#B98A5C'); strokeRR(K, -450, 120, 900, 18, 5, C.ink, 4);
    fillRR(K, -200, 162, 400, 58, 9, '#D9B45A'); strokeRR(K, -200, 162, 400, 58, 9, C.ink, 4);
    [-182, 182].forEach(sx => { circle(K, sx, 191, 6, '#B08A3A', C.ink, 2); line(K, sx - 4, 191, sx + 4, 191, C.ink, 2); });
    text(K, plate, 0, 201, { font: F.mono, weight: 800, size: 22, color: C.ink, ls: 1 });
    fillRR(T, -436, RY - 2, 872, 22, 0, C.k10);
    // stations, then the track segments
    SX.forEach((sx, i) => rrStation(T, K, t, sx, RY, i, stops[i] || '', layAt[i], passAt[i]));
    SX.forEach((sx, i) => {
      const u = t - layAt[i]; if (u < 0) return;
      const dy = -40 * (1 - E.outCubic(clamp(u / 0.14))) + 4 * ring(u - 0.14, 3.6, 8);
      const a = sx - 145, b = sx + 145;
      for (let px = a + 8; px < b - 6; px += 32) { fillRR(K, px, RY + 6 + dy, 16, 20, 3, '#5A3A22'); strokeRR(K, px, RY + 6 + dy, 16, 20, 3, C.ink, 2.5); }
      fillRR(K, a, RY - 10 + dy, b - a, 14, 2, '#B9BEC6'); strokeRR(K, a, RY - 10 + dy, b - a, 14, 2, C.ink, 3.5);
      line(K, a + 6, RY - 6 + dy, b - 6, RY - 6 + dy, '#FFFFFF', 2.5);
      burst(K, sx, RY, u - 0.12, { n: 8, r0: 40, r1: 90, color: C.ink, lw: 4, dur: 0.25 });
    });
    if (t >= trainAt - 0.02) rrTrain(T, K, t, trainX, trainAt, stop, RY);
  });
}

function rrStation(T, K, t, sx, RY, i, label, at, passAt) {
  const u = t - at + 0.06; if (u < 0) return;
  fillRR(K, sx - 7, -102, 14, RY + 96, 2, '#8E939B'); strokeRR(K, sx - 7, -102, 14, RY + 96, 2, C.ink, 3);
  const k = Math.max(0.01, Math.min(1.12, pop(u, 3.2, 0.5)));
  X([T, K], sx, -104, k, 0, () => {
    card(T, K, -118, -94, 236, 94, { r: 10, sh: 12, lw: 4.5 });
    circle(K, -78, -47, 26, C.red, C.ink, 3.5);
    text(K, String(i + 1), -78, -36, { font: F.anton, size: 34, color: '#FFFFFF' });
    text(K, label, 30, -35, { font: F.anton, size: label.length > 8 ? 30 : 36, color: C.ink, ls: 1 });
  });
  const passed = t >= passAt;
  if (!passed) circle(K, sx + 100, -112, 13, u > 0.1 ? C.red : '#C9C4BA', C.ink, 3);
  else X([K], sx + 100, -112, Math.max(0.01, Math.min(1.2, pop(t - passAt, 3.6, 0.45))), 0, () => {
    circle(K, 0, 0, 22, C.ink); check(K, -10, -2, 0.22, 1, '#FFFFFF', 5);
  });
  // the worker: pops up beside the post, waves when the train passes
  const pu = pop(t - at - 0.05, 3, 0.5);
  const wave = passed ? Math.sin(TAU * 3 * (t - passAt)) * Math.max(0, 1 - (t - passAt) / 1.4) : 0;
  K.save(); K.globalAlpha *= clamp(pu * 2);
  person(K, sx + 48, RY - 30 + 30 * (1 - Math.min(1, pu)), 0.75, C.ink);
  if (passed) line(K, sx + 62, RY - 70, sx + 80 + wave * 10, RY - 104, C.ink, 7);
  K.restore();
}
function rrTrain(T, K, t, trainX, trainAt, stop, RY) {
  const x = trainX(t), moving = t > trainAt && t < stop + 0.05, dist = x + 790, ang = dist / 30;
  const bob = moving ? -2.5 * Math.abs(Math.sin(dist * 0.06)) : 0, arr = t >= stop ? ring(t - stop, 3, 6) : 0;
  // steam: puffs left behind at the chimney, rising and spreading
  for (let a = trainAt + 0.05; a < t; a += a < stop ? 0.13 : 0.55) {
    const age = t - a; if (age > 0.9) continue;
    const bx = trainX(a) + 220 - 70 * age, by = RY - 200 - 130 * age;
    circle(T, bx, by, 12 + 46 * E.outCubic(age / 0.9), age < 0.45 ? C.k20 : C.k10);
  }
  X([T, K], x + 150, RY - 10 + bob, 1, 0, () => {
    K.save(); K.scale(1 + 0.04 * arr, 1 - 0.05 * arr); K.translate(-150, 0);
    T.save(); T.translate(-150, 0);
    fillRR(T, 12, -160, 300, 150, 14, C.k45);
    // cab
    fillRR(K, -6, -188, 116, 20, 7, C.ink);
    fillRR(K, 6, -170, 92, 124, 7, C.red); strokeRR(K, 6, -170, 92, 124, 7, C.ink, 5);
    fillRR(K, 26, -150, 52, 44, 6, '#F1EAD8'); strokeRR(K, 26, -150, 52, 44, 6, C.ink, 4);
    line(K, 52, -150, 52, -106, C.ink, 3); line(K, 26, -128, 78, -128, C.ink, 3);
    fillRR(K, 74, -168, 22, 120, 0, C.redD);
    // boiler, bands, badge, chimney, dome, lamp
    K.beginPath(); K.moveTo(98, -128); K.lineTo(234, -128); K.quadraticCurveTo(266, -128, 266, -90); K.quadraticCurveTo(266, -52, 234, -52); K.lineTo(98, -52); K.closePath();
    K.fillStyle = C.ink; K.fill();
    fillRR(K, 150, -128, 12, 76, 0, C.red); fillRR(K, 222, -128, 10, 76, 0, C.red);
    circle(K, 192, -90, 24, '#F1EAD8', C.ink, 3.5);
    polyPath(K, Array.from({ length: 10 }, (_, j) => { const a = -Math.PI / 2 + j * Math.PI / 5, rr = j % 2 ? 7 : 16; return [192 + Math.cos(a) * rr, -90 + Math.sin(a) * rr]; }), true); K.fillStyle = C.red; K.fill();
    polyPath(K, [[208, -128], [232, -128], [242, -176], [198, -176]], true); K.fillStyle = C.ink; K.fill();
    fillRR(K, 192, -186, 56, 14, 5, '#B9BEC6'); strokeRR(K, 192, -186, 56, 14, 5, C.ink, 3.5);
    fillRR(K, 258, -122, 24, 24, 5, '#B9BEC6'); strokeRR(K, 258, -122, 24, 24, 5, C.ink, 3); circle(K, 276, -110, 7, '#FFF3C4', C.ink, 2);
    line(K, 112, -120, 226, -120, 'rgba(255,255,255,0.35)', 3);
    fillRR(K, -4, -56, 276, 16, 4, C.ink);
    polyPath(K, [[262, -48], [300, -48], [318, -6], [262, -6]], true); K.fillStyle = '#B9BEC6'; K.fill(); K.lineWidth = 3.5; K.strokeStyle = C.ink; K.stroke();
    // wheels with spokes that turn with the distance, and the side rod
    [[52, -30, 30, 1], [124, -30, 30, 1], [196, -30, 30, 1], [262, -16, 15, 2]].forEach(([cx, cy, r, m]) => {
      circle(K, cx, cy, r, C.red, C.ink, 4); circle(K, cx, cy, r * 0.72, null, C.ink, 2.5);
      for (let j = 0; j < 8; j++) { const a = ang * m + j * Math.PI / 4; line(K, cx, cy, cx + Math.cos(a) * r * 0.86, cy + Math.sin(a) * r * 0.86, C.ink, 3); }
      circle(K, cx, cy, r * 0.24, '#B9BEC6', C.ink, 2.5);
    });
    const px = 15 * Math.cos(ang), py = 15 * Math.sin(ang);
    line(K, 52 + px, -30 + py, 196 + px, -30 + py, C.ink, 13); line(K, 52 + px, -30 + py, 196 + px, -30 + py, '#B9BEC6', 6);
    K.restore(); T.restore();
  });
}
