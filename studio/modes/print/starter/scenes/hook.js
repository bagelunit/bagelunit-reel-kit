/* 01 · HOOK, from 0 to CUT_MIDDLE. A pattern to copy, not a finished look.
   Keep the grammar, swap the props for a picture of your own script:
     · frame 0 already moves: the main object falls in while the presenter springs up from below
     · the stage builds: each stressed word of the hook (tplBeats) adds or changes one thing, and earlier things stay alive
     · the newest thing has the focus: the presenter points at it (ST.focus) and the camera leans toward it (stageCam)
     · on the last build-up word everything strains and the presenter panics; the key word of sentence 2 is the one big hit: the
       object breaks, a stamp slams down, the presenter is shocked and then shakes his head. A wipe leads into the middle (timeline.js)
   The stand-in props are deliberately plain, so even an untouched copy moves well: a labelled PROBLEM card takes one hit per stressed
   word (a chip with that word strikes it, it cracks and shakes, a strain bar climbs, and the chip then hangs off a pin and swings),
   and it shatters on the stamp word. `kit effort` skips this file while it still matches the starter, so an untouched copy fails the
   craft check: draw this script's own objects (playbook/ideas.md) inside the props block.
   Always moving: the strain bar and its counter, a running timer, cracks glowing red at the peak, swinging chips, idle float, the
   camera lean. */
(() => {
  const S0 = 0, S1 = CUT_MIDDLE;
  const LAND = 0.14;   // when the problem card lands (it is already falling on frame 0)

  /* ---------- timing, all taken from the words ---------- */
  const secondSentence = SENTENCES[1] && SENTENCES[1].s < S1 - 0.3 ? SENTENCES[1] : null;
  // the stamp lands on sentence 2's key word, at least ~0.5 s before the wipe covers the frame
  function hkStampWord() {
    if (secondSentence) {
      const key = keyWordIdx(secondSentence.i0, secondSentence.i1);
      if (key >= 0) return key;
    }
    const pick = tplBeats(lerp(S0, S1, 0.5), S1 - 0.5, 1);
    return pick.length ? pick[0].i : -1;
  }
  const stampWord = hkStampWord();
  const hasStampWord = stampWord >= 0;
  const earliestStamp = secondSentence ? secondSentence.s : 0;
  const stampAt = hasStampWord ? Math.max(earliestStamp, Math.min(WORDS[stampWord].s, S1 - 0.74)) : lerp(LAND, S1, 0.62);
  const T_STAMP = clamp(stampAt, LAND + 0.9, Math.max(LAND + 0.9, S1 - 0.45));
  const STAMP = (hasStampWord ? tplWord(stampWord, 10) : '') || uiText('nope').toUpperCase();
  // three or four build-up hits before the stamp: stressed words, topped up from the widest gaps when the hook has too few
  const window0 = LAND + 0.25, window1 = T_STAMP - 0.3;
  const span = T_STAMP - 0.3 - (LAND + 0.25);
  const NB = span > 1.5 ? 4 : 3;
  const HITS = [];
  for (const q of tplBeats(window0, window1, NB, Math.min(0.42, span / NB))) HITS.push({ t: q.t, w: tplWord(q.i, 9) });
  while (HITS.length < NB) {
    HITS.push(hkTopUp());
    HITS.sort((a, b) => a.t - b.t);
  }
  // a hit for the widest gap between hits: its longest content word, else the gap's middle with no label
  function hkTopUp() {
    const edges = [window0].concat(HITS.map(h => h.t), [window1]);
    const width = j => edges[j + 1] - edges[j];
    let widest = 0;
    for (let j = 1; j < edges.length - 1; j++) if (width(j) > width(widest)) widest = j;
    const lo = edges[widest] + 0.2, hi = edges[widest + 1] - 0.2;
    let best = -1;
    for (let i = 0; i < WORDS.length; i++) {
      const s = WORDS[i].s;
      if (!(s > lo && s < hi) || isStopWord(WORDS[i].w)) continue;
      if (best < 0 || cleanWord(i).length > cleanWord(best).length) best = i;
    }
    if (best < 0) return { t: (edges[widest] + edges[widest + 1]) / 2, w: '' };
    return { t: WORDS[best].s, w: tplWord(best, 9) };
  }
  const T_MAX = HITS[NB - 1].t;   // the last hit: everything is at full strain

  /* ---------- the props: replace this block with objects invented for your script (playbook/ideas.md) ----------
     A real reel puts two to five drawing functions here for things that ARE its idea (a power strip for "4 plugins", a clothesline of
     badges for "you do 6 jobs", a REC frame for "scared to show your face"), each with an entrance, a reaction to its words and an
     idle life, built from the mechanics (springTo, pendulum, gravityFall, ring, idleSway…). */
  const GEO = {
    card: { w: 560, h: 420, x: 360, y: 820 },   // the problem card (drawn centred on 0, 0) and where it sits
    chip: { x: 820, y0: 640, dy: 128, w: 300, h: 92 },
    string: 26,   // a chip hangs this far under its pin
  };
  const { card: CARD, chip: CHIP } = GEO;
  const TITLE = tplWord(keyWordIdx(SENTENCES[0].i0, SENTENCES[0].i1), 11) || uiText('sceneProblem').toUpperCase();
  // the strain level after each hit, and where each chip strikes the card's right edge
  const STRAIN = [[0, 0.06]];
  const STRIKE_Y = [];
  HITS.forEach((h, k) => {
    STRAIN.push([h.t, 0.12 + 0.85 * (k + 1) / NB]);
    STRIKE_Y.push(-130 + k * (260 / Math.max(1, NB - 1)));
  });
  const strainAt = t => springTo(t, STRAIN, 2.2, 0.32);
  const mono22 = (color, align) => ({ font: F.mono, weight: 700, size: 22, color, align });

  // a crack running into the card from the struck edge: a seeded zig-zag growing over 0.1 s
  function hkCrack(K, k, grown, colour) {
    const draw = rng(31 + k * 7);
    const turn0 = (draw() - 0.5) * 0.7;
    const pts = [[CARD.w / 2, STRIKE_Y[k]]];
    let heading = Math.PI + turn0;
    while (pts.length < 6) {
      heading += (draw() - 0.5) * 1.1;
      const step = (34 + draw() * 40) * grown;
      const [px, py] = pts[pts.length - 1];
      pts.push([px + Math.cos(heading) * step, py + Math.sin(heading) * step]);
    }
    K.save();
    Object.assign(K, { strokeStyle: colour, lineWidth: 4, lineCap: 'round', lineJoin: 'round' });
    polyPath(K, pts);
    K.stroke();
    K.restore();
  }
  // the problem card: a mono header with a live dot and timer, the hook's key word, and a strain bar with a rolling percentage that
  // climbs with every hit. Each hit adds a crack and a recoil; at full strain it turns red, jitters and glows; at the stamp it shatters.
  function hkCard(T, K, t) {
    if (t >= T_STAMP + 0.02) {
      hkShatter(T, K, t);
      return;
    }
    let recoil = 0;
    for (const h of HITS) recoil += ring(t - h.t, 5, 9) * 12;
    const hot = t >= T_MAX;
    const shove = recoil + (hot ? noise1(t * 34) * 5 : 0);
    X([T, K], shove, 0, 1, recoil * 0.12, () => hkCardFace(T, K, t, hot));
  }
  function hkCardFace(T, K, t, hot) {
    const box = { left: -CARD.w / 2, top: -CARD.h / 2 };
    const ink = hot ? C.red : C.ink;
    if (hot) glow(T, 0, 20, CARD.w * 0.9, CARD.h * 0.8, 0.6 + 0.2 * Math.sin(t * 20));
    uiCard(T, K, box.left, box.top, CARD.w, CARD.h, { r: 30, border: ink, lw: 4 });
    hkHeader(K, t, box);
    const big = TITLE.length > 8 ? 78 : 96;
    const titleStyle = { font: F.grot, weight: 700, size: big, color: ink, align: 'left', ls: -3 };
    const punch = 1 + ring(t - T_MAX, 4, 9) * 0.12;
    X([K], box.left + 32, box.top + 168, punch, 0, () => text(K, TITLE, 0, 0, titleStyle));
    hkStrainBar(K, t, box.left + 32, box.top + CARD.h - 120, CARD.w - 64);
    HITS.forEach((h, k) => {
      const age = t - h.t;
      if (age >= 0) hkCrack(K, k, clamp(age / 0.1), ink);
    });
    HITS.forEach((h, k) => burst(K, CARD.w / 2, STRIKE_Y[k], t - h.t, { n: 10, r0: 20, r1: 110, color: C.red, lw: 6, dur: 0.3 }));
  }
  function hkHeader(K, t, box) {
    const right = -box.left, baseline = box.top + 54;
    text(K, '// ' + uiText('sceneProblem'), box.left + 32, baseline, mono22('#8a8780', 'left'));
    liveDot(K, right - 120, box.top + 46, 7, t);
    const secs = Math.floor(t * 37) % 60;   // a timer running fast, so it visibly ticks
    text(K, '00:' + String(secs).padStart(2, '0'), right - 32, baseline, mono22(C.ink, 'right'));
  }
  // the strain bar (it overshoots on each hit) and its rolling number
  function hkStrainBar(K, t, bx, by, bw) {
    const level = strainAt(t);
    const danger = level > 0.75 ? C.red : C.ink;
    const track = [bx, by, bw, 34, 17];
    fillRR(K, ...track, '#EFEBE2');
    fillRR(K, bx, by, Math.max(34, bw * clamp(level, 0, 1.04)), 34, 17, danger);
    const rate = (strainAt(t + 0.02) - strainAt(t - 0.02)) * 2500;
    odometer(K, clamp(level) * 100, bx, by + 96, { size: 52, color: danger, suffix: '%', vel: rate });
  }
  // the shatter: the card splits along a jagged 3 × 2 grid and each shard falls with its own spin, a beat apart
  const SHATTER = { cols: 3, rows: 2, nudgeX: 60, nudgeY: 50 };
  function hkShatter(T, K, t) {
    const { cols, rows } = SHATTER;
    const draw = rng(5);
    const cell = [CARD.w / cols, CARD.h / rows];
    const joints = [];
    for (let j = 0; j <= rows; j++) {
      for (let i = 0; i <= cols; i++) {
        const nx = i % cols ? (draw() - 0.5) * SHATTER.nudgeX : 0;   // inner joints are nudged; the outline stays straight
        const ny = j % rows ? (draw() - 0.5) * SHATTER.nudgeY : 0;
        joints.push([-CARD.w / 2 + i * cell[0] + nx, -CARD.h / 2 + j * cell[1] + ny]);
      }
    }
    const joint = (i, j) => joints[j * (cols + 1) + i];
    burst(K, 0, 0, t - T_STAMP, { n: 16, r0: 60, r1: 320, color: C.ink, lw: 8, dur: 0.4 });
    for (let n = 0; n < cols * rows; n++) {
      const i = n % cols, j = Math.floor(n / cols);
      hkShard(T, K, t, [joint(i, j), joint(i + 1, j), joint(i + 1, j + 1), joint(i, j + 1)], n);
    }
  }
  function hkShard(T, K, t, corners, n) {
    const mid = [(corners[0][0] + corners[2][0]) / 2, (corners[0][1] + corners[2][1]) / 2];
    const throwX = mid[0] * 4.2 + (hash(n) - 0.5) * 300;
    const throwY = (mid[1] < 0 ? -260 : 60) - hash(n + 9) * 160;
    const fall = gravityFall(t, T_STAMP + 0.02 + n * 0.025, throwX, throwY, (hash(n + 3) - 0.5) * 420, 5600);
    if (fall.dy > 2200) return;
    const outline = corners.map(c => [c[0] - mid[0], c[1] - mid[1]]);
    X([T, K], mid[0] + fall.dx, mid[1] + fall.dy, 1, fall.r, () => {
      polyPath(T, outline, true);
      polyPath(K, outline, true);
      T.fillStyle = C.k45;
      T.fill();
      K.fillStyle = '#FFFFFF';
      K.fill();
      Object.assign(K, { strokeStyle: C.ink, lineWidth: 4, lineJoin: 'round' });
      K.stroke();
    });
  }
  // hit chip k: it appears on the struck edge on its word, springs back out to its pin, then hangs there and swings.
  // Drawn at its hanging spot; it starts from the strike point.
  function hkChip(T, K, t, e, k) {
    const hit = HITS[k], age = t - hit.t;
    const hang = [CHIP.x, CHIP.y0 + k * CHIP.dy];
    const strike = [CARD.x + CARD.w / 2 - hang[0], CARD.y + STRIKE_Y[k] - hang[1]];
    const back = springTo(t, [[hit.t, 0], [hit.t + 0.06, 1]], 2.4, 0.42);
    const ox = lerp(strike[0], 0, back), oy = lerp(strike[1], 0, back);
    const trail = clamp(1 - age / 0.18);
    speedLines(K, ox + CHIP.w * 0.6, oy, 0, trail, { n: 4, len: 120, gap: 22, col: C.ink, lw: 4, seed: k + 2 });
    const side = k % 2 ? -1 : 1;
    const swing = pendulum(age - 0.15, 16 * side, 1.3, 2.0) + Math.sin(t * 2.4 + k) * 1.5 * clamp(age - 0.6);
    X([T, K], ox, oy - CHIP.h / 2 - GEO.string, 1, swing, () => hkChipFace(T, K, hit.w || '+1', e.newest));
  }
  function hkChipFace(T, K, label, newest) {
    const drop = GEO.string;
    line(K, 0, 0, 0, drop, C.ink, 4);   // the string
    circle(K, 0, 0, 8, C.red, C.ink, 3);   // the pin
    const face = { font: F.grot, weight: 700, size: 40, ls: -1 };
    const w = Math.max(160, Math.min(CHIP.w, measure(K, label, face) + 90));
    uiCard(T, K, -w / 2, drop, w, CHIP.h, { r: CHIP.h / 2, border: C.ink, lw: 4, fill: newest ? C.red : '#FFFFFF' });
    text(K, label, 0, drop + CHIP.h / 2 + 14, Object.assign({ color: newest ? '#FFFFFF' : C.ink, align: 'center' }, face));
  }
  /* ---------- end of the props ---------- */

  // camera punches, then sound (the drop's own thud plays from the stage element)
  const PUNCHES = [[LAND, 0.8, 0.9], [T_STAMP + 0.04, 1, 1], [T_MAX + 0.02, 0.35, 0.4]];
  const SOUNDS = [[0, 'whoosh', -2], [T_STAMP + 0.02, 'stamp', 0], [T_MAX, 'riser', -8], [T_STAMP + 0.3, 'thud', -6]].concat(HITS.map(h => [h.t, 'thud', -8]));
  PUNCHES.forEach(p => kick(...p));
  SOUNDS.forEach(s => cue(...s));

  const stageEls = [{ id: 'problem', t: LAND, x: CARD.x, y: CARD.y, enter: 'drop', sfx: 'thud', gain: 0, idle: 0.6, focus: [0, -40], draw: (T, K, t) => hkCard(T, K, t) }];
  HITS.forEach((h, k) => stageEls.push({
    id: 'hit' + k, t: h.t, x: CHIP.x, y: CHIP.y0 + k * CHIP.dy, enter: 'none', sfx: null, idle: 0.5, focus: [-40, 0],
    exit: T_STAMP + 0.04 + k * 0.05, exitMode: 'fall', draw: (T, K, t, e) => hkChip(T, K, t, e, k),
  }));
  const stampSize = STAMP.length > 7 ? 92 : 116;
  stageEls.push({
    id: 'stamp', t: T_STAMP, x: 380, y: 830, enter: 'none', idle: 0, nudge: 0, sfx: null, focus: [0, 0],
    draw: (T, K, t) => {
      impact(T, K, 0, 0, t - T_STAMP - 0.04, 1.3, 4);
      stamp(K, T, STAMP, 0, 0, t - T_STAMP, { size: stampSize, rot: -9 });
    },
  });
  const ST = buildStage(stageEls);

  const OUT = S1 - 0.27;   // every mood ends before the wipe, so the presenter is docked at the cut
  const MOODS = [];
  MOODS.push(['panic', T_MAX - 0.04, Math.min(T_STAMP - 0.05, OUT)]);
  MOODS.push(['shock', T_STAMP, Math.min(T_STAMP + 0.5, OUT)]);
  MOODS.push(['no', T_STAMP + 0.5, OUT]);
  // the readout's clock: it creeps, races through the strain, then stops at the stamp
  const beforeLast = HITS[NB - 2].t;
  const CLOCK_SPEED = [[beforeLast - 0.1, 0.03], [beforeLast + 0.3, 0.9], [T_MAX, 2.2], [T_STAMP + 0.35, 0.02]];
  const two = v => String(v).padStart(2, '0');
  function hkClock(t) {
    const minutes = Math.floor(9 * 60 + 41 + 60 * 6 * phaseAt(t, CLOCK_SPEED));
    return two(Math.floor(minutes / 60) % 24) + ':' + two(minutes % 60);
  }

  const readout = t => ({ k: uiText('today'), v: hkClock(t), hot: t >= T_MAX });
  function cam(t) {
    const view = stageCam(t, ST, { release: S1 - 0.32 });
    const release = 1 - E.inOutCubic(clamp((t - S1 + 0.32) / 0.3));
    const tremble = win(t, T_MAX, T_STAMP, 0.1, 0.05) * release;   // the frame trembles at full strain
    view.x += noise1(t * 30) * 4 * tremble;
    view.z += 0.02 * tremble;
    return view;
  }
  function draw(T, K, t) {
    moodFx(T, K, t, MOODS);
    ST.draw(T, K, t);
  }
  const dockedRise = tt => ({ x: PRESENTER_DOCK.x, y: PRESENTER_DOCK.y + enterY(tt, -0.06, 900), s: PRESENTER_DOCK.s });   // springs up from below
  const guy = t => act(t, mood(t, MOODS, { focus: tt => ST.focus(tt), at: dockedRise }));
  SC.hook = { label: '// 01 — ' + uiText('sceneProblem'), readout, cam, draw, guy };
})();
