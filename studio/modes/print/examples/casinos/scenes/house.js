// ═════════════ 04 · HOUSE  [CUT_HOUSE → CUT_CTA] "And the longer you stay, the more the house wins." ═════════════
// A card table slides in (navy felt printed in the second ink): YOUR tall stack left, the HOUSE's short stack right, a session
// clock over the table. On each stressed word (and between them) one chip flips through the air from you to the house, the totals
// roll, the clock races faster · "house": the croupier's rake sweeps in · "wins": HOUSE WINS slams (the kick), confetti on the
// house stack, the presenter facepalms.
(() => {
  const S0 = CUT_HOUSE, S1 = CUT_CTA;
  const T_LONG = wordAt('longer', S0, 1, S0 + 0.2), T_STAY = wordAt('stay', S0, 1, T_LONG + 0.4), T_MORE = wordAt('more', S0, 1, T_STAY + 0.5);
  const T_HOUSE = wordAt('house', S0, 1, T_MORE + 0.3), T_WINS = wordAt('wins', S0, 1, T_HOUSE + 0.2);
  const YOU = { x: 300, y: 1170, n: 10 }, HSE = { x: 730, y: 1170, n: 3 }, CR = 74, CH = CR * 0.3, HOP = 0.3;
  const HOPS = [T_LONG, (T_LONG + T_STAY) / 2, T_STAY, T_MORE, (T_MORE + T_HOUSE) / 2, T_HOUSE].map(v => v - 0.04);
  HOPS.forEach((h, i) => cue(h + HOP, i % 2 ? 'tick' : 'pop', -6));
  cue(T_WINS, 'stamp'); kick(T_WINS + 0.03, 1.1, 1);
  const moved = t => HOPS.filter(h => t >= h + HOP).length, flying = t => HOPS.findIndex(h => t >= h && t < h + HOP);
  const eased = t => HOPS.reduce((s, h) => s + E.outCubic(clamp((t - h - HOP) / 0.3)), 0);

  function hsTable(T, K, t) {
    fillRR(T, -460 + 24, -150 + 26, 920, 300, 70, C.k60);
    fillRR(T, -460, -150, 920, 300, 70, 'rgb(70,255,70)');                         // the felt prints in the navy second ink
    strokeRR(K, -446, -136, 892, 272, 56, '#6B4A33', 30);                   // padded wooden rail
    strokeRR(K, -460, -150, 920, 300, 70, C.ink, 6); strokeRR(K, -430, -120, 860, 240, 42, C.ink, 4);
    K.save(); K.beginPath(); K.ellipse(0, 70, 360, 70, 0, Math.PI, TAU); K.lineWidth = 4; K.strokeStyle = 'rgba(255,255,255,0.7)'; K.stroke(); K.restore();
    text(K, 'THE HOUSE ALWAYS PAYS ITSELF', 0, -88, { font: F.mono, weight: 700, size: 22, color: '#FFFFFF', ls: 4 });
    for (const s of [-1, 1]) { fillRR(K, s * 330 - 18, 150, 36, 150, 8, '#4A3222'); strokeRR(K, s * 330 - 18, 150, 36, 150, 8, C.ink, 4); }
  }
  function hsPlate(K, x, str, hot) {
    fillRR(K, x - 104, 1196, 208, 60, 12, hot ? C.red : CARD); strokeRR(K, x - 104, 1196, 208, 60, 12, C.ink, 4);
    text(K, str, x, 1240, { font: F.anton, size: 42, color: hot ? '#FFFFFF' : C.ink, ls: 4 });
  }
  function hsTotal(K, t, x, topY, dollars, hot) {
    const y = topY - 52 + Math.sin(t * 3 + x) * 3;
    fillRR(K, x - 92, y - 46, 184, 64, 32, hot ? '#F6E39A' : CARD); strokeRR(K, x - 92, y - 46, 184, 64, 32, C.ink, 4);
    text(K, money(dollars), x, y + 2, { font: F.anton, size: 48, color: C.ink, ls: 2 });
  }
  function hsChip(K, t) {
    const i = flying(t); if (i < 0) return;
    const k = (t - HOPS[i]) / HOP, d = moved(t);
    const fy = YOU.y - (YOU.n - d) * CH, ty = HSE.y - (HSE.n + d) * CH;
    const x = lerp(YOU.x, HSE.x, E.inOutCubic(k)), y = lerp(fy, ty, k) - Math.sin(k * Math.PI) * 320;
    czChip(K, x, y, CR * 0.8, C.red, { spin: k * 9, text: '25' });
  }
  function hsRake(K, t) {
    if (t < T_HOUSE - 0.12) return;
    const k = E.outCubic(clamp((t - T_HOUSE + 0.12) / 0.4)), hx = lerp(1160, YOU.x + 130, k) + (t > T_WINS ? E.outCubic(clamp((t - T_WINS) / 0.4)) * 220 : 0);
    line(K, hx, 1090, hx + 560, 820, C.ink, 18); line(K, hx, 1090, hx + 560, 820, '#9C6B44', 10);
    fillRR(K, hx - 16, 1010, 32, 160, 8, '#9C6B44'); strokeRR(K, hx - 16, 1010, 32, 160, 8, C.ink, 4);
  }

  // the session timer card: TIME AT THE TABLE runs faster and faster as the chips leave, a red LOST line counts down
  function hsTimer(T, K, t) {
    const mins = Math.floor(lerp(47, 212, E.inCubic(clamp((t - S0) / (T_WINS - S0 + 0.3)))));
    fillRR(T, -150 + 12, -95 + 14, 300, 190, 20, C.k60); fillRR(K, -150, -95, 300, 190, 20, CARD); strokeRR(K, -150, -95, 300, 190, 20, C.ink, 4);
    circle(K, -118, -62, 7, Math.floor(t * 2.5) % 2 ? C.red : '#E9A090');
    text(K, 'AT THE TABLE', -100, -54, { font: F.mono, weight: 700, size: 20, color: '#8a8076', align: 'left', ls: 2 });
    text(K, `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`, 0, 28, { font: F.anton, size: 84, color: C.ink, ls: 4 });
    line(K, -126, 44, 126, 44, '#E0D6C8', 3);
    text(K, `LOST  ${money(moved(t) * 25)}`, 0, 80, { font: F.anton, size: 34, color: C.red, ls: 2 });
  }

  const ST = buildStage([
    { id: 'table', t: S0 + 0.02, x: 515, y: 1110, enter: 'slide', from: -1, idle: 0, nudge: 0, draw: hsTable },
    { id: 'timer', t: T_LONG - 0.05, x: 815, y: 690, s: 0.9, enter: 'pop', draw: hsTimer },
    { id: 'clock', t: S0 + 0.16, x: 360, y: 700, enter: 'swing', idle: 0.5, draw: (T, K, t) => {
      line(K, 0, -230, 0, -134, C.ink, 5);
      czClock(T, K, 0, 0, 130, t, { spin: t < S0 ? 0 : Math.pow(t - S0, 2.2) * 2.2 });
    } },
  ]).focusOn(t => [lerp(YOU.x, HSE.x, clamp(moved(t) / 3)), 1000], T_LONG - 0.1, T_WINS - 0.05).focusOn([HSE.x, 960], T_WINS, S1);
  const MOODS = [['facepalm', T_WINS + 0.08, S1 - 0.3]];

  SC.house = {
    label: '// 04 — who wins',
    readout: t => ({ k: 'HOUSE', v: `+$${moved(t) * 25}`, hot: t >= T_WINS }),
    cam: t => stageCam(t, ST, { release: S1 - 0.28 }),
    draw: (T, K, t) => {
      moodFx(T, K, t, MOODS);
      ST.draw(T, K, t);
      if (t < S0 + 0.1) return;
      const d = moved(t), f = flying(t) >= 0 ? 1 : 0, m = eased(t);
      const ys = czStack(T, K, YOU.x, YOU.y, YOU.n - d - f, C.ink, CR);
      const hs = czStack(T, K, HSE.x, HSE.y, HSE.n + d, C.red, CR);
      hsPlate(K, YOU.x, 'YOU', false); hsPlate(K, HSE.x, 'HOUSE', t >= T_WINS);
      hsTotal(K, t, YOU.x, ys, (YOU.n - m) * 25, false); hsTotal(K, t, HSE.x, hs, (HSE.n + m) * 25, t >= T_WINS);
      hsChip(K, t); hsRake(K, t);
      if (t >= T_WINS) { impact(T, K, HSE.x, hs - 40, t - T_WINS - 0.05, 0.9, 7); confetti(K, HSE.x, hs - 60, t - T_WINS, { n: 26 }); }
      stamp(K, T, 'HOUSE WINS', 500, 860, t - T_WINS, { size: 120, rot: -6 });
    },
    guy: t => act(t, mood(t, MOODS, { focus: t => ST.focus(t) })),
  };
})();
