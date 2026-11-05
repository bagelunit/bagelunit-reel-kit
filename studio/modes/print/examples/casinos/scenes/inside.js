// ═════════════ 02 · INSIDE  [CUT_INSIDE → CUT_STAY] "No clocks, no windows, no daylight. So time just disappears." ═════════════
// A wall of three frames builds up, one per "no": the empty clock nail gets crossed on "clocks", the window's shutters slam on
// "windows", the sun sinks on "daylight" · then the room goes casino-dark (the whole wall prints in engraved lines), neon OPEN 24/7
// buzzes on in the dead sun frame and a row of slot machines lights up along the floor · "time": the frames step back and a big
// wristwatch rises, its hands racing faster and faster · "disappears": its numerals fly off one by one and the face is left blank.
(() => {
  const S0 = CUT_INSIDE, S1 = CUT_STAY;
  const N1 = wordAt('no', S0, 1, S0 + 0.1), T_C = wordAt('clocks', S0, 1, N1 + 0.14);
  const N2 = wordAt('no', T_C, 1, T_C + 0.6), T_W = wordAt('windows', S0, 1, N2 + 0.14);
  const N3 = wordAt('no', T_W, 1, T_W + 0.7), T_D = wordAt('daylight', S0, 1, N3 + 0.14);
  const T_DARK = T_D + 0.3, T_TIME = wordAt('time', S0, 1, T_D + 0.9), T_GONE = wordAt('disappears', S0, 1, T_TIME + 0.6);
  const FW = 250, FH = 270, BACK = { y: 640, s: 0.8 };
  cue(T_C, 'tick', -4); cue(T_W, 'thud', -3); cue(T_D, 'swoosh', -6); cue(T_DARK + 0.1, 'click', -6);
  cue(T_GONE, 'shimmer', -4); kick(T_GONE + 0.03, 0.8, 0.6); kick(T_W + 0.02, 0.4, 0.5);

  // the tag under a frame: pops on its noun, the word in accent caps
  function inTag(K, t, str, when) {
    if (t < when) return;
    X([K], 0, FH / 2 + 62, clamp(pop(t - when, 2.8, 0.45)), -2, () => {
      fillRR(K, -118, -32, 236, 64, 12, CARD); strokeRR(K, -118, -32, 236, 64, 12, C.ink, 4);
      text(K, str, 0, 16, { font: F.anton, size: 44, color: C.red, ls: 2 });
    });
  }
  const frame = (kind, tag, when, o) => (T, K, t) => {
    czFrame(T, K, -FW / 2, -FH / 2, FW, FH, kind, t, o);
    if (kind === 'clock') cross(K, 0, 6, 150, P(t, T_C, 0.2, E.outCubic), C.red, 14);
    inTag(K, t, tag, when);
  };
  // the distant casino floor: small slot cabinets along the bottom that light up left to right once the daylight is gone
  function inFloor(T, K, t) {
    const k = clamp((t - T_DARK - 0.1) / 0.6); if (k <= 0) return;
    for (let i = 0; i < 5; i++) {
      if (i / 5 > k) continue;
      const x = 110 + i * 96, y = 1300, a = pop(t - T_DARK - 0.1 - i * 0.12, 3, 0.5);
      X([T, K], x, y, clamp(a), 0, () => {
        fillRR(T, -36 + 8, -110 + 10, 72, 120, 10, C.k60);
        fillRR(K, -36, -110, 72, 120, 10, C.red); strokeRR(K, -36, -110, 72, 120, 10, C.ink, 4);
        fillRR(K, -24, -92, 48, 34, 4, C.ink);
        for (let j = 0; j < 3; j++) circle(K, -14 + j * 14, -75, 4, (Math.floor(t * 6) + i + j) % 3 ? CZ_GOLD : '#6E6A62');
        fillRR(K, -26, -44, 52, 30, 4, CARD);
        line(K, 36, -70, 52, -96, C.ink, 4); circle(K, 52, -98, 7, C.red);
      });
    }
  }

  const ST = buildStage([
    { id: 'clockF', t: N1, x: 230, y: 700, enter: 'swing', moves: [[T_TIME, { x: 250, ...BACK }]], draw: frame('clock', 'NO CLOCKS', T_C) },
    { id: 'windowF', t: N2, x: 530, y: 700, enter: 'swing', moves: [[T_TIME, { x: 530, ...BACK }]], draw: frame('window', 'NO WINDOWS', T_W, { shutAt: T_W }) },
    { id: 'sunF', t: N3, x: 830, y: 700, enter: 'swing', moves: [[T_TIME, { x: 810, ...BACK }]], draw: frame('sun', 'NO DAYLIGHT', T_D, { setAt: T_D, neonAt: T_DARK + 0.1 }) },
    { id: 'watch', t: T_TIME - 0.08, x: 430, y: 1110, enter: 'rise', idle: 0.6, draw: (T, K, t) => {
      const spin = t < T_TIME ? 0 : Math.pow(t - T_TIME, 2) * 7;
      czWatch(T, K, 0, 0, 150, t, { spin, goneAt: T_GONE });
      if (t > T_GONE) puff(T, 0, 0, t - T_GONE - 0.4, 2.2, 1);
    } },
  ]);
  const MOODS = [['shrug', T_GONE + 0.1, S1 - 0.3]];

  SC.inside = {
    label: '// 02 — inside',
    cam: t => stageCam(t, ST, { release: S1 - 0.28 }),
    draw: (T, K, t) => {
      const dk = clamp((t - T_DARK) / 0.35);
      if (dk > 0) { T.fillStyle = `rgba(0,0,0,${0.2 * dk})`; T.fillRect(-1500, -1500, W + 3000, H + 3000); }
      line(K, 60, 545, 1020, 545, C.ink, 5);                                   // the picture rail the frames hang from
      moodFx(T, K, t, MOODS);
      inFloor(T, K, t);
      ST.draw(T, K, t);
    },
    guy: t => act(t, mood(t, MOODS, { focus: t => ST.focus(t) })),
  };
})();
