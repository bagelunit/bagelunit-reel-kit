// ═════════════ 03 · STAY  [CUT_STAY → CUT_HOUSE] "Players stay 40 percent longer when they can't see the hour." ═════════════
// The blinds rise on a slot machine dropping in · "Players": its lever yanks down, the reels spin and stop one by one on sevens,
// the win line flashes and coins spill into the tray · "40": the display rolls +0 → +40 % and lands with the kick · "longer": a
// time ticket feeds out beside it, WITH A CLOCK 1h 00m, then NO CLOCK rolling up to 1h 24m · "hour": the blank watch from the last
// scene swings in and a strip of tape slaps over its face: ??:??
(() => {
  const S0 = CUT_STAY, S1 = CUT_HOUSE;
  const T_PL = wordAt('players', S0, 1, S0 + 0.1), T_40 = wordAt('40', S0, 1, T_PL + 0.6), T_40E = wordEnd('40', S0, 1, T_40 + 0.2);
  const T_LONG = wordAt('longer', S0, 1, T_40 + 0.6), T_HOUR = wordAt('hour', S0, 1, T_LONG + 1);
  const STOPS = [T_PL + 0.36, T_PL + 0.52, T_PL + 0.68];
  const SW = 500, SH = 740;
  cue(T_PL, 'click', -2); cue(STOPS[2] + 0.02, 'pop', -4); cue(T_40E, 'cash', -2); kick(T_40E + 0.02, 1, 0.8);
  cue(T_LONG, 'riser', -8); cue(T_HOUR, 'thud', -3);

  const pullAt = t => t < T_PL ? 0 : Math.max(0, Math.sin(clamp((t - T_PL) / 0.42) * Math.PI));
  // one reel window: symbols scroll while spinning (motion lines), then it stops on a seven with a kick
  function stReel(K, t, x, y, w, h, stopAt, seed) {
    fillRR(K, x, y, w, h, 10, '#FFFFFF');
    K.save(); rr(K, x, y, w, h, 10); K.clip();
    const spinning = t >= T_PL && t < stopAt, kk = t >= stopAt ? ring(t - stopAt, 5, 10) * 14 : 0;
    const off = spinning ? (t - T_PL) * 1500 : 0;
    for (let k = -1; k <= 2; k++) {
      const yy = y + h / 2 + k * 118 + (off % 118) + kk;
      czSymbol(K, spinning ? (seed + k + Math.floor(off / 118) + 40) % 4 : (k === 0 ? 0 : (seed + k + 4) % 4), x + w / 2, yy, 0.9);
    }
    if (spinning) for (let k = 0; k < 4; k++) line(K, x + 12 + k * (w - 24) / 3, y + 10, x + 12 + k * (w - 24) / 3, y + h - 10, 'rgba(255,255,255,0.7)', 3);
    K.fillStyle = 'rgba(0,0,0,0.08)'; K.fillRect(x, y, w, 26); K.fillRect(x, y + h - 26, w, 26);
    K.restore();
    strokeRR(K, x, y, w, h, 10, C.ink, 5);
  }
  // the slot machine (local, centred): bulb crown, accent cabinet with a shade side, display, three reels, win line, coin tray, lever
  function stSlot(T, K, t) {
    const x = -SW / 2, y = -SH / 2;
    fillRR(T, x + 24, y + 90 + 24, SW, SH - 90, 30, C.k60);
    fillRR(K, x + 50, y, SW - 100, 130, 65, C.ink);
    czBulbs(K, x + 100, y + 44, x + SW - 100, y + 44, 9, t, { r: 11, speed: t > STOPS[2] ? 16 : 7 });
    text(K, 'LUCKY 7', 0, y + 112, { font: F.voice, size: 34, color: CZ_GOLD, ls: 6 });
    fillRR(K, x, y + 130, SW, SH - 130, 30, C.red); strokeRR(K, x, y + 130, SW, SH - 130, 30, C.ink, 6);
    fillRR(T, x + SW - 70, y + 140, 60, SH - 150, 20, C.k30);
    // display
    fillRR(K, x + 40, y + 165, SW - 80, 130, 16, '#15161A'); strokeRR(K, x + 40, y + 165, SW - 80, 130, 16, C.ink, 5);
    const v = Math.round(40 * E.outQuint(clamp((t - (T_40E - 0.6)) / 0.6))), land = t > T_40E ? 1 + ring(t - T_40E, 4, 8) * 0.12 : 1;
    X([K], 0, y + 230, land, 0, () => text(K, `+${v}%`, 0, 38, { font: F.anton, size: 108, color: v >= 40 ? CZ_GOLD : '#E9E4DA', ls: 4 }));
    // reels
    const rw = (SW - 120) / 3;
    for (let k = 0; k < 3; k++) stReel(K, t, x + 40 + k * (rw + 20), y + 325, rw, 236, STOPS[k], k * 2 + 1);
    if (t > STOPS[2]) {
      const fl = t < STOPS[2] + 0.6 ? (Math.floor((t - STOPS[2]) * 12) % 2 ? 1 : 0.3) : 0.8 + 0.2 * Math.sin(t * 6);
      K.save(); K.globalAlpha *= fl; fillRR(K, x + 26, y + 436, SW - 52, 14, 7, CZ_GOLD); K.restore();
    }
    // coin tray + spilling coins
    fillRR(K, x + 70, y + 600, SW - 140, 70, 14, '#7C2A17'); strokeRR(K, x + 70, y + 600, SW - 140, 70, 14, C.ink, 5);
    for (let i = 0; i < 12; i++) {
      const t0 = STOPS[2] + 0.12 + i * 0.06; if (t < t0) continue;
      const k = t - t0, fall = Math.min(1, k / 0.3), b = k > 0.3 ? Math.abs(Math.sin((k - 0.3) * 10)) * Math.exp(-(k - 0.3) * 7) * 20 : 0;
      const cx = x + 110 + (i % 6) * 54 + (hash(i) - 0.5) * 16, cy = y + 590 + fall * 50 - b - Math.floor(i / 6) * 16;
      circle(K, cx, cy, 19, CZ_GOLD, C.ink, 3.5); circle(K, cx - 5, cy - 5, 6, '#FFF3C4');
    }
    // lever
    const p = pullAt(t), ky = y + 210 + p * 230;
    fillRR(K, x + SW - 6, y + 360, 34, 80, 10, '#9A968E'); strokeRR(K, x + SW - 6, y + 360, 34, 80, 10, C.ink, 4);
    line(K, x + SW + 22, y + 400, x + SW + 52, ky, C.ink, 14); line(K, x + SW + 22, y + 400, x + SW + 52, ky, '#C9C5BC', 7);
    circle(K, x + SW + 52, ky, 30, C.red, C.ink, 5); circle(K, x + SW + 44, ky - 9, 9, '#FF9B85');
  }
  // the time ticket: feeds out of a slot from its top edge, two rows, the NO CLOCK time rolling up
  function stTicket(T, K, t, e) {
    const k = E.outCubic(clamp((t - T_LONG) / 0.8)), h = 120 + k * 250, w = 300, x = -w / 2, y = -200;
    fillRR(K, x - 20, y - 20, w + 40, 34, 10, C.ink);
    K.save(); K.beginPath(); K.rect(x - 30, y, w + 60, h + 40); K.clip();
    fillRR(T, x + 14, y + 14, w, h, 6, C.k50);
    fillRR(K, x, y, w, h, 4, '#FFFFFF'); strokeRR(K, x, y, w, h, 4, C.ink, 4);
    for (let i = 0; i < 15; i++) circle(K, x + 10 + i * 20, y + h, 7, '#F3F1EC');
    text(K, 'TIME PLAYED', 0, y + h - 300, { font: F.mono, weight: 700, size: 24, color: '#8a8076', ls: 3 });
    text(K, 'WITH A CLOCK', 0, y + h - 248, { font: F.mono, weight: 700, size: 22, color: '#8a8076' });
    text(K, '1h 00m', 0, y + h - 196, { font: F.anton, size: 52, color: C.ink });
    line(K, x + 20, y + h - 172, x + w - 20, y + h - 172, '#E0D6C8', 3);
    text(K, 'NO CLOCK', 0, y + h - 132, { font: F.mono, weight: 700, size: 22, color: C.red });
    const m = Math.round(lerp(0, 24, E.outCubic(clamp((t - T_LONG - 0.2) / 0.9))));
    text(K, `1h ${String(m).padStart(2, '0')}m`, 0, y + h - 56, { font: F.anton, size: 82, color: C.red });
    K.restore();
  }
  // the blank watch from the last scene, with the ??:?? tape slapped over it on "hour"
  function stWatch(T, K, t) {
    czWatch(T, K, 0, 0, 74, t, { goneAt: -10, blankMark: false });
    if (t < T_HOUR) return;
    X([T, K], 6, -6, 1 + ring(t - T_HOUR, 4, 9) * 0.15 + Math.max(0, 1 - (t - T_HOUR) / 0.1) * 0.6, -12, () => {
      fillRR(T, -110 + 8, -38 + 10, 220, 76, 6, C.k50);
      fillRR(K, -110, -38, 220, 76, 6, '#F6E39A'); strokeRR(K, -110, -38, 220, 76, 6, C.ink, 3);
      text(K, '??:??', 0, 24, { font: F.anton, size: 64, color: C.ink, ls: 4 });
    });
  }

  const ST = buildStage([
    { id: 'slot', t: S0 + 0.04, x: 360, y: 930, enter: 'drop', kick: 0.4, idle: 0.4, draw: stSlot },
    { id: 'ticket', t: T_LONG - 0.06, x: 800, y: 770, enter: 'none', sfx: null, idle: 0.7, draw: stTicket },
    { id: 'drink', t: T_40E + 0.25, x: 210, y: 1395, s: 0.85, enter: 'slide', from: -1, idle: 0, sfx: 'swoosh',
      draw: (T, K, t, e) => czDrink(T, K, 0, 0, 1, Math.exp(-Math.max(0, e.age - 0.35) * 3), t) },
    { id: 'watch', t: T_HOUR - 0.45, x: 810, y: 1010, enter: 'swing', draw: stWatch },
  ]).focusOn([360, 700], T_PL, T_LONG - 0.1);
  const MOODS = [['celebrate', T_40E, T_40E + 0.6], ['shrug', T_HOUR + 0.05, S1 - 0.28]];

  SC.stay = {
    label: '// 03 — the effect',
    readout: t => ({ k: 'STAY', v: t >= T_40E ? '+40%' : '…', hot: t >= T_40E }),
    cam: t => stageCam(t, ST, { release: S1 - 0.28 }),
    draw: (T, K, t) => {
      moodFx(T, K, t, MOODS);
      ST.draw(T, K, t);
      if (t > T_40E) impact(T, K, 360, 650, t - T_40E, 0.8, 5);
    },
    guy: t => act(t, mood(t, MOODS, { focus: t => ST.focus(t) })),
  };
})();
