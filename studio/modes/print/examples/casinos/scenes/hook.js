// ═════════════ 01 · HOOK  [0 → CUT_INSIDE] "Casinos have no clocks. And that's on purpose." ═════════════
// 0.0  the casino front is already dropping onto the stage (marquee chasing, doors glowing, the dome sweeping)
// have a wall clock swings onto its nail beside the doors · "no" it shudders · "clocks" it is yanked off and tumbles out of frame,
//      the presenter recoils (shock) · a red X is drawn over the empty nail · "purpose" BY DESIGN slams over the doors (the kick) and
//      the presenter puts a finger to his lips: it's a secret.
(() => {
  const S0 = 0, S1 = CUT_INSIDE;
  const T_HAVE = wordAt('have', 0, 1, 0.56), T_NO = wordAt('no', 0, 1, 0.83), T_CLOCKS = wordAt('clocks', 0, 1, 1.04);
  const T_X = T_CLOCKS + 0.32, T_PURPOSE = wordAt('purpose', 0, 1, 2.16);
  const CLK = { x: 800, y: 960, r: 100 };
  cue(T_CLOCKS + 0.03, 'impact', -3); kick(T_CLOCKS + 0.04, 0.7, 0.8); cue(T_HAVE, 'pop', -5); cue(T_X, 'tick', -4); cue(T_PURPOSE, 'stamp'); kick(T_PURPOSE + 0.03, 1, 1);

  // the clock's path: hung → shudder on "no" → yanked up and out on "clocks", tumbling under gravity
  function hkClock(T, K, t) {
    let dx = 0, dy = 0, rot = Math.sin(t * 2.1) * 2;
    if (t >= T_NO && t < T_CLOCKS) { dx = noise1(t * 60) * 7; rot = noise1(t * 50 + 3) * 6; }
    if (t >= T_CLOCKS) { const g = gravityFall(t, T_CLOCKS, 380, -900, 420, 5600); dx = g.dx; dy = g.dy; rot = g.r; }
    if (dy > 1400) return;
    X([T, K], CLK.x + dx, CLK.y + dy, 1, rot, () => {
      if (t < T_CLOCKS) { line(K, -40, -CLK.r + 6, 0, -CLK.r - 34, C.ink, 4); line(K, 40, -CLK.r + 6, 0, -CLK.r - 34, C.ink, 4); }
      czClock(T, K, 0, 0, CLK.r, t, { spin: t > T_NO ? (t - T_NO) * (t - T_NO) * 4 : 0 });
    });
  }
  // the nail left behind, a pale ring where the clock hung, and the red X drawn over it
  function hkEmpty(T, K, t) {
    if (t < T_CLOCKS) return;
    circle(T, CLK.x, CLK.y, CLK.r + 8, C.k10);
    circle(K, CLK.x, CLK.y - CLK.r - 34, 8, C.ink);
    cross(K, CLK.x, CLK.y - 10, 120, P(t, T_X, 0.22, E.outCubic), C.red, 14);
    puff(T, CLK.x, CLK.y - CLK.r - 20, t - T_CLOCKS, 1.2, 1);
  }

  // guests drifting in the whole shot: they walk up the steps toward the doors, shrink a little and vanish inside
  function hkGuests(T, K, t) {
    [[0.0, CZ_NAVY()], [0.9, C.ink], [1.7, '#7C2A17']].forEach(([o, col], i) => {
      const k = ((t + o) % 2.4) / 2.4, x = lerp(i % 2 ? 140 : 880, 500, E.inOutCubic(k)), y = lerp(1330, 1160, k);
      if (k > 0.92) return;
      czGuest(T, K, x, y, lerp(1, 0.62, k), (t + o) * 9, col);
    });
  }

  const ST = buildStage([
    { id: 'front', t: 0.1, x: 500, y: 860, s: 1.12, enter: 'drop', kick: 0.5, draw: (T, K, t) => czFacade(T, K, t) },
    { id: 'stamp', t: T_PURPOSE, x: 500, y: 1050, enter: 'none', idle: 0, nudge: 0, sfx: null,
      draw: (T, K, t) => stamp(K, T, 'BY DESIGN', 0, 0, t - T_PURPOSE, { size: 118, rot: -8, sub: 'HOUSE RULE #1' }) },
  ]).focusOn([CLK.x, CLK.y - 40], T_HAVE, T_X + 0.4);
  const MOODS = [['shock', T_CLOCKS, T_CLOCKS + 0.55], ['shh', T_PURPOSE + 0.12, S1 - 0.28]];

  SC.hook = {
    label: '// 01 — the casino',
    cam: t => stageCam(t, ST, { release: S1 - 0.25 }),
    draw: (T, K, t) => {
      moodFx(T, K, t, MOODS);
      ST.draw(T, K, t);
      if (t > 0.3) hkGuests(T, K, t);
      if (t > 0.22) X([T, K], 0, (1 - clamp(pop(t - 0.22, 2.6, 0.5))) * 300, 1, 0, () => { czRope(T, K, 110, 330, 1300, 3, t); czRope(T, K, 680, 900, 1300, 3, t + 1); });
      if (t >= T_HAVE - 0.05) X([T, K], 0, (1 - clamp(pop(t - T_HAVE + 0.05, 2.6, 0.5))) * -260, 1, 0, () => hkClock(T, K, t));
      hkEmpty(T, K, t);
      if (t >= T_PURPOSE) impact(T, K, 500, 1050, t - T_PURPOSE - 0.1, 1, 3);
    },
    guy: t => act(t, mood(t, MOODS, { focus: t => ST.focus(t) })),
  };
})();
