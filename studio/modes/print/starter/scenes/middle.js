/* 02 · MIDDLE, from CUT_MIDDLE to CUT_CTA. A pattern to copy, not a finished look.
   Keep the grammar, swap the props for a picture of your own script:
     · one event per spoken clause (its key word, plus stressed words when there are few clauses), 2 to 6 events, each on its word
     · the stage builds and never freezes: every piece that lands keeps floating, and a LIVE progress card rolls up with each event
     · the presenter points at the newest piece (focusTrack), leans in on the first, and celebrates the payoff (kick, confetti)
     · the camera leans toward each new piece and lets go before the wipe into the CTA (timeline.js)
   The stand-in props are deliberately plain: a SOLUTION frame with one empty slot per key word. On each word a labelled part flies in
   on an arc and slams into its slot (squash, sparks, a ring), and power starts running between placed parts; on the payoff word the
   gaps close, the frame lights up and a "Done." seal slams down. `kit effort` skips this file while it still matches the starter:
   draw this script's own objects (playbook/ideas.md) inside the props block.
   Always moving: parts breathe, power dots run between them, the counter and sparkline, the LIVE dot, the floating seal. */
(() => {
  const S0 = CUT_MIDDLE, S1 = CUT_CTA;

  /* ---------- the events, all taken from the words ---------- */
  const wanted = clamp(Math.round((S1 - S0) / 1.1), 2, 6);
  const startOf = i => WORDS[i].s;
  // one key word per clause, topped up with stressed words that keep half a second from the ones already chosen
  const keys = [];
  for (const c of clauses(S0 + 0.05, S1 - 0.3)) if (startOf(c.key) < S1 - 0.6) keys.push(c.key);
  for (const q of tplBeats(S0 + 0.3, S1 - 0.6, wanted, 0.5)) {
    if (keys.length >= wanted) continue;
    if (keys.some(i => !(Math.abs(startOf(i) - q.t) > 0.5))) continue;
    keys.push(q.i);
  }
  keys.sort((a, b) => a - b);
  // more than six: merge the closest pair, keeping the longer word
  const gapAfter = i => startOf(keys[i + 1]) - startOf(keys[i]);
  while (keys.length > 6) {
    const closest = keys.slice(1, -1).reduce((best, _, n) => (gapAfter(n + 1) < gapAfter(best) ? n + 1 : best), 0);
    const keepFirst = cleanWord(keys[closest]).length >= cleanWord(keys[closest + 1]).length;
    keys.splice(closest + (keepFirst ? 1 : 0), 1);
  }
  if (keys.length === 0) keys.push(wordIdxAt(lerp(S0, S1, 0.4)));
  const N = keys.length;
  const EVENTS = keys.map((i, k) => {
    const earliest = S0 + 0.45 + k * 0.12;   // never two slams in the same instant
    const label = tplWord(i, 12) || cleanWord(i).toUpperCase().slice(0, 12);
    return { t: Math.max(earliest, startOf(i)), label };
  });
  const LAST = EVENTS[N - 1].t;
  // the payoff lands on a word after the last part when one exists
  const after = tplBeats(LAST + 0.45, S1 - 0.7, 1);
  const payoffAt = after.length ? after[0].t : LAST + 0.5;
  const T_DONE = clamp(payoffAt, LAST + 0.3, Math.max(LAST + 0.3, S1 - 0.6));
  const placedBy = t => EVENTS.filter(e => t >= e.t);
  const LAYOUT = {
    stat: { x: 70, y: 1065, w: 500, h: 280 },
    seal: { x: 800, y: 1115 },
    frame: { x: 90, y: 560, w: 900, h: 430, head: 66 },   // the solution frame, in scene space
  };
  const { stat: STAT, seal: SEAL, frame: FRAME } = LAYOUT;
  // type styles: [font, weight, size, colour, align]
  const TYPE = {
    header: ['mono', 700, 22, 'ink', 'left'],
    count: ['mono', 700, 30, null, 'right'],
    empty: ['mono', 700, 30, '#C9C5BC', 'center'],
    number: ['mono', 700, 22, null, 'left'],
  };
  const typeOf = (name, color) => {
    const [font, weight, size, ink, align] = TYPE[name];
    return { font: F[font], weight, size, color: color || (ink === 'ink' ? C.ink : ink), align };
  };

  /* ---------- the props: replace this block with objects invented for your script (playbook/ideas.md) ----------
     A real reel draws the thing that IS this section's idea here (plugs going into a strip, badges dropping onto a line, a beam
     tipping, a calendar tearing), with one physical reaction per key word and an idle life, built from the mechanics. */
  const ROWS = N <= 3 ? 1 : 2;
  const COLS = Math.ceil(N / ROWS);
  const GAP = 22;
  const SW = (FRAME.w - 48 - GAP * (COLS - 1)) / COLS;
  const SH = (FRAME.h - FRAME.head - 30 - GAP * (ROWS - 1)) / ROWS;
  const closeAt = t => E.inOutCubic(P(t, T_DONE - 0.08, 0.25));   // the gaps between slots close at the payoff
  // the centre of slot k with the gaps closed by `closed` (0 open → 1 shut); the last row is centred on its own
  function mdSlot(k, closed = 0) {
    const row = Math.floor(k / COLS);
    const inRow = row === ROWS - 1 ? N - row * COLS : COLS;
    const gap = GAP * (1 - closed);
    const left = FRAME.x + FRAME.w / 2 - (inRow * SW + (inRow - 1) * gap) / 2;
    const top = FRAME.y + FRAME.head + 14;
    return [left + (k % COLS) * (SW + gap) + SW / 2, top + row * (SH + GAP) + SH / 2];
  }
  const frameCentre = [FRAME.x + FRAME.w / 2, FRAME.y + FRAME.h / 2];
  // the frame: an outlined card, a mono header with an n/N count, a power LED that flickers on at the payoff, and a dashed slot for
  // every part still to come
  function mdFrame(T, K, t) {
    const grown = clamp(pop(t - S0 - 0.08, 2.2, 0.55), 0, 1.15);
    const on = t >= T_DONE;
    const pulse = 1 + ring(t - T_DONE, 3.5, 7) * 0.03;
    X([T, K], frameCentre[0], frameCentre[1], lerp(0.6, 1, grown) * pulse, 0, () => {
      const left = -FRAME.w / 2, top = -FRAME.h / 2;
      if (on) glow(T, 0, 0, FRAME.w * 0.7, FRAME.h * 0.8, 0.45 + 0.12 * Math.sin(t * 6));
      uiCard(T, K, left, top, FRAME.w, FRAME.h, { r: 32, border: on ? C.red : C.ink, lw: 4 });
      mdHeader(K, t, left, top, on);
      const closed = closeAt(t);
      EVENTS.forEach((_, k) => mdEmptySlot(K, t, k, closed));
    });
  }
  const MD_FLICKER = [1, 0, 1, 1, 0, 1];   // the LED's first 0.3 s, in 0.05 s steps
  function mdHeader(K, t, left, top, on) {
    const since = t - T_DONE;
    const lit = on && (since > 0.3 || MD_FLICKER[Math.floor(since / 0.05)]);
    circle(K, left + 40, top + 36, 10, lit ? C.red : '#E3DFD6', C.ink, 3);
    text(K, '// ' + uiText('sceneHow'), left + 64, top + 44, typeOf('header'));
    const placed = placedBy(t);
    const newest = placed[placed.length - 1];
    const bump = 1 + ring(t - (newest ? newest.t : -9), 4, 9) * 0.25;
    const tally = `${placed.length}/${N}`;
    const style = typeOf('count', placed.length ? C.red : C.ink);
    X([K], -left - 36, top + 44, bump, 0, () => text(K, tally, 0, 0, style));
  }
  // an empty slot: a dashed outline with its number, popping in a beat after the one before
  function mdEmptySlot(K, t, k, closed) {
    if (t >= EVENTS[k].t) return;
    const centre = mdSlot(k, closed);
    const grown = clamp(pop(t - S0 - 0.2 - k * 0.05, 3, 0.5), 0, 1.2);
    const local = [centre[0] - FRAME.x - FRAME.w / 2, centre[1] - FRAME.y - FRAME.h / 2];
    X([K], local[0], local[1], grown, 0, () => {
      K.save();
      K.setLineDash([14, 10]);
      strokeRR(K, -SW / 2, -SH / 2, SW, SH, 20, '#C9C5BC', 3);
      K.restore();
      text(K, '0' + (k + 1), 0, 14, typeOf('empty'));
    });
  }
  // power between neighbours on the same row once both are placed: a line with two dots running along it
  function mdPower(K, t) {
    const closed = closeAt(t);
    for (let k = 1; k < N; k++) {
      const live = t >= EVENTS[k].t + 0.1 && Math.floor(k / COLS) === Math.floor((k - 1) / COLS);
      if (!live) continue;
      const a = mdSlot(k - 1, closed), b = mdSlot(k, closed);
      const from = a[0] + SW / 2 - 6, to = b[0] - SW / 2 + 6;
      line(K, from, a[1], to, b[1], C.red, 5);
      for (const phase of [0, 0.5]) circle(K, lerp(from, to, (t * 1.8 + phase) % 1), a[1], 6, C.red);
    }
  }
  // part k: it flies in on an arc over the 0.28 s before its word (spinning down from the side), slams into its slot on the word
  // (squash, sparks, a ring), then breathes. The newest part is accent for its first 1.4 s.
  function mdPart(T, K, t, k) {
    const ev = EVENTS[k], age = t - ev.t;
    if (age < -0.28) return null;
    const home = mdSlot(k, closeAt(t));
    const pose = age < 0 ? mdFlying(home, age, k % 2 ? 1 : -1) : mdLanded(home, age, t, k);
    const newest = age >= 0 && EVENTS.every(o => o === ev || o.t <= ev.t || t < o.t);
    if (age >= 0) {
      burst(K, home[0], home[1], age, { n: 12, r0: SW * 0.4, r1: SW * 0.75, color: C.red, lw: 6, dur: 0.32 });
      shock(K, home[0], home[1], age, { r: SW * 0.6, color: C.red, lw: 5, dur: 0.4 });
    }
    X([T, K], pose.x, pose.y, 1, pose.r, () => {
      // squash from the bottom edge
      [T, K].forEach(c => runOps(c, [['save'], ['translate', 0, SH / 2], ['scale', 1 + pose.squash, 1 - pose.squash], ['translate', 0, -SH / 2]]));
      mdPartCard(T, K, ev, k, newest && age < 1.4);
      [T, K].forEach(c => c.restore());
    });
    return [pose.x, pose.y];
  }
  // the flight in: from off the frame's side, arcing over and spinning down into the slot
  function mdFlying(home, age, side) {
    const u = E.inCubic((age + 0.28) / 0.28);
    return {
      x: lerp(side > 0 ? 1260 : -180, home[0], u),
      y: lerp(home[1] - 420, home[1], u) - Math.sin(u * Math.PI) * 120,
      r: (1 - u) * 160 * side,
      squash: 0,
    };
  }
  // after landing: a squash that springs out, then a slow float
  function mdLanded(home, age, t, k) {
    const sway = idleSway(t, k * 1.7, 0.35 * clamp((age - 0.4) / 0.5));
    return { x: home[0] + sway.dx, y: home[1] + sway.dy, r: sway.r, squash: ring(age, 4, 10) * 0.12 };
  }
  function mdPartCard(T, K, ev, k, hot) {
    const half = [SW / 2, SH / 2];
    uiCard(T, K, -half[0], -half[1], SW, SH, { r: 20, border: C.ink, lw: 4, fill: hot ? C.red : '#FFFFFF' });
    fillRR(K, half[0] - 4, -16, 18, 32, 8, hot ? C.ink : C.red);   // the connector nub
    text(K, '0' + (k + 1), 22 - half[0], 38 - half[1], typeOf('number', hot ? '#FFE1DA' : '#8a8780'));
    const face = { font: F.grot, weight: 700, size: 46, ls: -1 };
    const natural = Math.max(1, measure(K, ev.label, face));
    face.size = Math.max(24, Math.min(46, 46 * (SW - 40) / natural));   // long labels shrink to fit
    text(K, ev.label, 0, face.size * 0.36 + 8, Object.assign({ color: hot ? '#FFFFFF' : C.ink, align: 'center' }, face));
  }
  // the payoff: a band of light sweeps across the finished frame
  function mdSweep(K, t) {
    const p = P(t, T_DONE + 0.05, 0.5);
    if (!(p > 0 && p < 1)) return;
    const sx = lerp(FRAME.x - 200, FRAME.x + FRAME.w + 200, E.inOutCubic(p));
    const top = FRAME.y, bottom = FRAME.y + FRAME.h;
    K.save();
    rr(K, FRAME.x, FRAME.y, FRAME.w, FRAME.h, 32);
    K.clip();
    polyPath(K, [[sx - 60, top], [sx + 40, top], [sx - 40, bottom], [sx - 140, bottom]], true);
    K.fillStyle = 'rgba(255,255,255,0.55)';
    K.fill();
    K.restore();
  }
  /* ---------- end of the props ---------- */

  // the progress card climbs a share with every part
  const PROGRESS = [[S0, 0]];
  EVENTS.forEach((e, k) => PROGRESS.push([e.t + 0.05, Math.round(100 * (k + 1) / N)]));
  // sound and camera punches (one thud per slam: the mixer drops crowded cues anyway)
  const SOUNDS = EVENTS.map(e => ['cue', e.t, 'thud', -6]).concat([
    ['kick', EVENTS[0].t + 0.02, 0.45, 0.5],
    ['cue', T_DONE, 'stamp', -2],
    ['cue', T_DONE + 0.05, 'shimmer', -8],
    ['kick', T_DONE + 0.02, 0.8, 0.7],
    ['cue', S0 + 0.12, 'swoosh', -6],
  ]);
  for (const [kind, ...args] of SOUNDS) (kind === 'cue' ? cue : kick)(...args);

  // where the presenter points: the frame, the progress card, each new part, then the seal
  const FOCUS = [[S0 + 0.1, frameCentre[0], FRAME.y + 120], [S0 + 0.35, STAT.x + STAT.w / 2, STAT.y + 120]];
  EVENTS.forEach((e, k) => FOCUS.push([e.t, t => mdSlot(k, closeAt(t))[0], t => mdSlot(k, closeAt(t))[1]]));
  FOCUS.push([T_DONE, SEAL.x - 80, SEAL.y - 60]);
  const statRise = t => (1 - clamp(pop(t - S0 - 0.25, 2.0, 0.6), 0, 1.2)) * 900;   // the progress card rises in from below
  const MOODS = [['lean', EVENTS[0].t, EVENTS[0].t + 0.6]];
  if (N > 3) {
    const mid = EVENTS[Math.floor(N / 2)];
    MOODS.push(['lean', mid.t, mid.t + 0.6]);
  }
  MOODS.push(['celebrate', T_DONE, Math.min(T_DONE + 0.9, S1 - 0.3)]);
  // the camera leans a little toward each new slot, then toward the seal
  const leanX = [[-1e9, 0]], leanY = [[-1e9, 0]];
  EVENTS.forEach((e, k) => {
    const [sx, sy] = mdSlot(k);
    leanX.push([e.t, (540 - sx) * 0.08]);
    leanY.push([e.t, (900 - sy) * 0.05]);
  });
  leanX.push([T_DONE, 40]);
  leanY.push([T_DONE, -40]);

  // what the scene draws, back to front
  const statOptions = { label: uiText('plan'), keys: PROGRESS, suffix: '%', size: 120, roll: 0.6, hot: tt => tt >= T_DONE, delta: [LAST + 0.2, `${N}/${N}`] };
  const LAYERS = [
    (T, K, t) => moodFx(T, K, t, MOODS),
    (T, K, t) => liveStat(T, K, STAT.x, STAT.y + statRise(t), STAT.w, STAT.h, t, statOptions),
    (T, K, t) => t >= T_DONE && impact(T, K, SEAL.x, SEAL.y - 30, t - T_DONE - 0.04, 1, 5),
    (T, K, t) => {
      const drift = clamp(t - T_DONE - 0.4);   // the seal floats once it has landed
      const lift = Math.sin(t * 2.3) * 5 * drift, tilt = Math.sin(t * 1.9) * 1.5 * drift;
      X([K], SEAL.x, SEAL.y + lift, 1, tilt, () => seal(K, uiText('done'), 0, 0, t - T_DONE, { size: 104, rot: -10 }));
    },
    (T, K, t) => confetti(K, SEAL.x, SEAL.y - 40, t - T_DONE, { seed: 9 }),
    mdFrame,
    (T, K, t) => mdPower(K, t),
    (T, K, t) => EVENTS.forEach((_, k) => mdPart(T, K, t, k)),
    (T, K, t) => mdSweep(K, t),
  ];

  SC.middle = {
    label: '// 02 — ' + uiText('sceneHow'),
    readout: t => {
      const done = placedBy(t).length;
      return { k: uiText('doneCount'), v: done + '/' + N, hot: t >= EVENTS[0].t };
    },
    cam: t => {
      const hold = 1 - E.inOutCubic(clamp((t - S1 + 0.3) / 0.3));   // back to rest before the wipe
      const push = 0.03 * E.inOutCubic(P(t, S0, 0.8)) + 0.004 * (t - S0);
      const view = { x: springTo(t, leanX, 1.3, 0.6), y: springTo(t, leanY, 1.3, 0.6) };
      return { x: view.x * hold, y: view.y * hold, z: 1 + push * hold };
    },
    draw: (T, K, t) => LAYERS.forEach(layer => layer(T, K, t)),
    guy: t => act(t, mood(t, MOODS, { focus: tt => focusTrack(tt, FOCUS) })),
  };
})();
