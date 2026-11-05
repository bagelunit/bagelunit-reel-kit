// ═════════════ 05 · CTA  [CUT_CTA → end] "Comment CASINO and I'll send you the full breakdown." ═════════════
// The blinds clear on a comment composer sliding down · CASINO types in on the spoken word, Post presses: the comment posts and a
// giant CASINO chip slams down on the felt-navy spot under it (the kick), spinning to rest; other viewers' CASINO replies stack
// up beside it · "send": an envelope flips off the chip and flies down · "full": it lands as THE FULL BREAKDOWN booklet ·
// "breakdown": its four rows tick in one by one · the presenter celebrates on Post, then thumbs-up to the end.
(() => {
  const S0 = CUT_CTA, S1 = DUR_END();
  const kwI = wordIndex(KEYWORD, S0 - 0.2);
  const T_TYPE = kwI >= 0 ? WORDS[kwI].s - 0.05 : S0 + 0.4;
  const T_POST = Math.max(T_TYPE + KEYWORD.length / 15 + 0.08, kwI >= 0 ? WORDS[kwI].e + 0.04 : T_TYPE + 0.6);
  const T_SEND = Math.max(T_POST + 0.25, wordAt('send', T_POST - 0.3, 1, T_POST + 0.3));
  const T_BOOK = Math.max(T_SEND + 0.35, wordAt('full', T_SEND, 1, T_SEND + 0.4));
  const T_BRK = Math.max(T_BOOK + 0.12, wordAt('breakdown', T_SEND, 1, T_BOOK + 0.2));
  const T_THUMB = Math.max(T_BOOK + 0.4, VO_END - 0.4);
  const ROWS = ['no clocks, no windows', 'carpet that keeps you walking', 'free drinks, on purpose', 'chips instead of cash'];
  const rowAt = k => T_BRK + 0.05 + k * Math.max(0.14, (S1 - 0.35 - T_BRK) / 4);
  const CHIP = { x: 270, y: 1030, r: 120 };
  cue(T_TYPE, 'type', -8); cue(T_POST, 'click', -2); cue(T_POST + 0.05, 'stamp', -2); kick(T_POST + 0.07, 1, 0.9);
  cue(T_SEND, 'swoosh', -5); cue(T_BOOK, 'thud', -4); cue(T_BRK, 'tick', -6); cue(S1 - 0.5, 'shimmer', -8);

  // the composer: my avatar disc, the field where the keyword types with a caret, the Post button that presses
  function ctComposer(T, K, t) {
    const y = 560 + (1 - clamp(pop(t - S0 - 0.05, 2.4, 0.6))) * -420, x = 90, w = 900, h = 330;
    fillRR(T, x + 14, y + 16, w, h, 26, C.k60); fillRR(K, x, y, w, h, 26, CARD); strokeRR(K, x, y, w, h, 26, C.ink, 4);
    text(K, 'COMMENTS', x + 40, y + 58, { font: F.voice, size: 30, color: '#8a8076', align: 'left', ls: 3 });
    line(K, x + 30, y + 84, x + w - 30, y + 84, '#E0D6C8', 3);
    if (t >= T_POST) ctPosted(K, t, x + 40, y + 140);
    else text(K, 'be the first to comment', x + 40, y + 160, { font: F.grot, weight: 500, size: 28, color: '#B5AEA3', align: 'left' });
    const fy = y + h - 30;
    circle(K, x + 70, fy - 30, 30, C.red, C.ink, 3); text(K, 'F', x + 70, fy - 18, { font: F.anton, size: 34, color: '#FFFFFF' });
    const typed = t < T_POST ? typedStr(KEYWORD, t, T_TYPE, 15) : '';
    fillRR(K, x + 120, fy - 62, 560, 64, 32, '#F3F1EC'); strokeRR(K, x + 120, fy - 62, 560, 64, 32, typed ? C.red : '#CFCBC2', 3);
    text(K, typed || 'Add a comment…', x + 150, fy - 18, { font: F.grot, weight: typed ? 800 : 500, size: 32, color: typed ? C.red : '#8a8076', align: 'left' });
    if (t < T_POST && t > T_TYPE) caretAt(K, x + 150 + measure(K, typed, { font: F.grot, weight: 800, size: 32 }) + 4, fy - 46, 38, t, C.red);
    const press = t > T_POST - 0.06 && t < T_POST + 0.1 ? 0.9 : 1;
    X([K], x + 790, fy - 30, press, 0, () => { fillRR(K, -80, -32, 160, 64, 32, typed.length === KEYWORD.length || t >= T_POST ? C.red : '#CFCBC2'); text(K, 'POST', 0, 12, { font: F.anton, size: 34, color: '#FFFFFF', ls: 3 }); });
  }
  // the posted comment: it pops into the list under the header
  function ctPosted(K, t, x, y) {
    X([K], x, y, clamp(pop(t - T_POST, 3, 0.5)), 0, () => {
      text(K, '@you', 0, -12, { font: F.mono, weight: 700, size: 22, color: '#8a8076', align: 'left' });
      fillRR(K, 0, 0, 200, 50, 25, C.red); text(K, KEYWORD, 100, 36, { font: F.anton, size: 34, color: '#FFFFFF', ls: 3 });
      text(K, 'just now', 220, 34, { font: F.mono, weight: 500, size: 22, color: '#8a8076', align: 'left' });
    });
  }
  // the giant CASINO chip: slams down on Post (from 2.4×), spins to rest, then idles with a slow wobble; the word runs round its rim
  function ctChip(T, K, t) {
    if (t < T_POST) return;
    const dt = t - T_POST, s = dt < 0.14 ? lerp(2.4, 1, E.inQuart(dt / 0.14)) : 1 + ring(dt - 0.14, 5, 10) * 0.06;
    const spin = (1 - Math.exp(-dt * 3)) * 4 * Math.PI + Math.sin(t * 1.8) * 0.06;
    X([T, K], CHIP.x, CHIP.y, s, 0, () => {
      circle(T, 20, 26, CHIP.r, C.k70);
      circle(K, 0, 0, CHIP.r, C.red, C.ink, 6);
      for (let i = 0; i < 12; i++) { K.save(); K.rotate(spin + i / 12 * TAU); fillRR(K, -15, -CHIP.r + 4, 30, 36, 5, '#FFFFFF'); K.restore(); }
      circle(K, 0, 0, CHIP.r * 0.68, CARD, C.ink, 5);
      K.save(); K.setLineDash([14, 10]); circle(K, 0, 0, CHIP.r * 0.6, null, C.red, 4); K.restore();
      text(K, KEYWORD, 0, 22, { font: F.anton, size: 64, color: C.red, ls: 3 });
      text(K, 'COMMENT', 0, -34, { font: F.mono, weight: 700, size: 20, color: '#8a8076', ls: 4 });
    });
    impact(T, K, CHIP.x, CHIP.y, dt - 0.12, 1, 9);
  }
  // other viewers answering: three CASINO replies stack up right of the chip, each pushing the last one up
  function ctReplies(T, K, t) {
    const R = [['@maya.k', KEYWORD], ['@dev_jo', KEYWORD + ' pls'], ['@tom.r', KEYWORD + '!!']];
    R.forEach(([who, txt], i) => {
      const t0 = T_POST + 0.22 + i * 0.2; if (t < t0) return;
      const n = R.filter((_, j) => j > i && t >= T_POST + 0.22 + j * 0.2).length, y = 1120 - n * 96 - (t - t0) * 6;
      X([T, K], 770, y, clamp(pop(t - t0, 3, 0.5)), i % 2 ? 2 : -2, () => {
        fillRR(T, -130 + 8, -38 + 10, 260, 76, 38, C.k50); fillRR(K, -130, -38, 260, 76, 38, CARD); strokeRR(K, -130, -38, 260, 76, 38, C.ink, 3);
        circle(K, -92, 0, 22, [CZ_NAVY(), C.red, CZ_GOLD][i], C.ink, 3);
        text(K, who, -60, -6, { font: F.mono, weight: 600, size: 20, color: '#8a8076', align: 'left' });
        text(K, txt, -60, 26, { font: F.anton, size: 30, color: C.ink, align: 'left' });
      });
    });
  }
  // the DM: an envelope flips off the chip and arcs down to where the booklet lands
  function ctEnvelope(K, t) {
    if (t < T_SEND || t > T_BOOK + 0.02) return;
    const k = E.inOutCubic(clamp((t - T_SEND) / Math.max(0.2, T_BOOK - T_SEND)));
    const x = lerp(CHIP.x + 60, 370, k), y = lerp(CHIP.y - 80, 1370, k) - Math.sin(k * Math.PI) * 220;
    X([K], x, y, 1, Math.sin(k * 8) * 18, () => { fillRR(K, -70, -46, 140, 92, 10, '#FFFFFF'); strokeRR(K, -70, -46, 140, 92, 10, C.ink, 4); K.beginPath(); K.moveTo(-70, -46); K.lineTo(0, 10); K.lineTo(70, -46); K.lineWidth = 4; K.strokeStyle = C.ink; K.stroke(); circle(K, 0, 6, 12, C.red); });
  }
  // THE FULL BREAKDOWN booklet: ink cover with a gold spine and title, four rows that tick in on "breakdown", a PDF tag clipped on
  function ctBooklet(T, K, t) {
    if (t < T_BOOK) return;
    const w = 600, h = 330, s = 1 + ring(t - T_BOOK, 4, 9) * 0.08, y0 = 1330 + (1 - clamp(pop(t - T_BOOK, 2.8, 0.55))) * -180;
    X([T, K], 335, y0, s, -2 + Math.sin(t * 2.2) * 0.8, () => {
      fillRR(T, -w / 2 + 16, -h / 2 + 18, w, h, 18, C.k70);
      fillRR(K, -w / 2, -h / 2, w, h, 18, C.ink); fillRR(K, -w / 2, -h / 2, 28, h, 8, CZ_GOLD);
      text(K, 'THE FULL BREAKDOWN', -w / 2 + 56, -h / 2 + 62, { font: F.anton, size: 50, color: CZ_GOLD, align: 'left', ls: 3 });
      ROWS.forEach((row, k) => {
        if (t < rowAt(k)) return;
        const yy = -h / 2 + 122 + k * 52;
        check(K, -w / 2 + 74, yy - 10, 26, clamp((t - rowAt(k)) / 0.15), C.red, 6);
        text(K, row, -w / 2 + 108, yy, { font: F.grot, weight: 600, size: 32, color: '#FFFFFF', align: 'left' });
      });
      X([K], w / 2 - 40, -h / 2 - 6, clamp(pop(t - T_BRK, 3, 0.5)), 10, () => { fillRR(K, -80, -26, 160, 52, 8, '#F6E39A'); strokeRR(K, -80, -26, 160, 52, 8, C.ink, 3); text(K, 'PDF · 4 PAGES', 0, 9, { font: F.mono, weight: 700, size: 19, color: C.ink }); });
    });
  }

  const MOODS = [['celebrate', T_POST + 0.05, T_POST + 0.7], ['thumbs', T_THUMB, S1 + 1]];
  const focusAt = t => t < T_POST ? [560, 760] : t < T_SEND ? [CHIP.x, CHIP.y] : [CHIP.x + 40, CHIP.y - 60];
  SC.cta = {
    label: '// 05 — get it',
    readout: t => ({ k: 'COMMENT', v: KEYWORD, hot: t >= T_POST }),
    cam: t => ({ x: 0, y: 0, z: 1 + 0.025 * clamp((t - S0) / (S1 - S0)), r: 0 }),
    draw: (T, K, t) => {
      moodFx(T, K, t, MOODS);
      ctComposer(T, K, t);
      ctReplies(T, K, t);
      ctChip(T, K, t);
      ctBooklet(T, K, t);
      ctEnvelope(K, t);
      if (t >= T_POST) confetti(K, CHIP.x, CHIP.y - 60, t - T_POST - 0.05, { n: 22 });
    },
    guy: t => act(t, mood(t, MOODS, { focus: focusAt })),
  };
})();
