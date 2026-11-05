/* 03 · CTA, from CUT_CTA to the end: "Comment KEYWORD and I'll send you the link." (KEYWORD = reel.json cta.keyword, see timeline.js)
   The beats: the wipe clears and a comment sheet springs up under the captions while the presenter points at its empty field · on
   the spoken keyword, KEYWORD types into an outlined accent chip · Post presses (the one camera kick): the keyword slams in big as
   an accent pill, KEYWORD notifications push in on the sheet's empty right side every ~0.35 s, KEYWORD replies roll in under the
   posted comment, and the presenter celebrates · on "send" / "link" a DM bubble springs out of the presenter ("sent you the link" and
   a check) · the last beat is a thumbs-up and a wink, held to the end while the notifications keep coming.
   On-screen words come from uiText() (reel.json "language" and "ui"); the DM line is uiText('sentLink').
   The comment counter is off by default, because invented engagement numbers are not ok. Switch it on only with a real number:
   reel.json "cta": { "keyword": "REEL", "counter": 1480 } adds a red odometer badge to the sheet that rolls up to it after Post.
   Sound only on the beats that matter (typing, the Post click and pop, the DM pop, the closing shimmer); toasts and replies are silent. */
(() => {
  const S0 = CUT_CTA, S1 = DUR_END();

  /* ---------- timing, from the words ---------- */
  const spokenAt = wordIndex(KEYWORD, S0 - 0.2);
  const said = spokenAt >= 0 ? WORDS[spokenAt] : null;   // the keyword as the voice says it, when it does
  const T_TYPE = said ? said.s - 0.05 : S0 + 0.45;
  const typedBy = T_TYPE + KEYWORD.length / 16 + 0.1;   // typing runs at 16 letters a second
  const T_SEND = Math.max(typedBy, said ? said.e + 0.06 : T_TYPE + 0.6);
  const sendWord = cueAny(['send', 'link', 'dm', 'message'], T_SEND, T_SEND + 0.6);
  const T_DM = Math.max(T_SEND + 0.45, sendWord);
  const T_THUMB = Math.max(T_DM + 0.5, VO_END - 0.45);
  const SHEET_AT = { x: 90, y: 540, w: 900 };
  const DM_AT = { x: 110, y: 1250, w: 620 };
  const BIG_AT = { x: 540, y: 1050 };   // where the keyword lands big: the CTA's hero
  // replies under the posted comment, and notifications (one every ~0.35 s from Post to the end)
  const between = (lo, hi, v) => Math.max(lo, Math.min(hi, v));
  const REPLIES = [];
  const TOASTS = [];
  for (let k = 0, n = between(2, 8, Math.floor((S1 - T_SEND) / 0.3)); k < n; k++) {
    const settle = k > 1 ? (k - 1) * 0.08 : 0;   // the first two come quickly, later ones spread out
    REPLIES.push(T_SEND + 0.3 + k * 0.22 + settle);
  }
  for (let k = 0, n = between(2, 9, Math.floor((S1 - T_SEND - 0.1) / 0.35)); k < n; k++) {
    TOASTS.push({ t: T_SEND + 0.14 + k * 0.35, title: KEYWORD, glyph: k % 2 ? 'mail' : 'bell', time: (k + 1) + 's' });
  }
  // the optional comment counter (reel.json cta.counter): it creeps before Post, rolls fast after it and keeps climbing to the end
  const counterSetting = REEL.cta && REEL.cta.counter;
  const COUNT = Math.max(0, Math.round(+(counterSetting || 0))) || 0;
  const COUNT_CURVE = [[S0, 0.02], [T_SEND, 0.026], [T_SEND + 0.6, 0.28], [T_DM + 0.4, 0.65], [S1 + 0.5, 1]];   // [time, share of COUNT]
  const COUNT_KEYS = COUNT_CURVE.map(([at, share]) => [at, Math.round(share * COUNT)]);
  function ctaCount(t) {
    const next = COUNT_KEYS.findIndex((key, i) => i > 0 && !(t > key[0]));
    if (next < 0) return COUNT_KEYS[COUNT_KEYS.length - 1][1];
    const [a, va] = COUNT_KEYS[next - 1], [b, vb] = COUNT_KEYS[next];
    if (t <= a) return va;
    const ease = next === 2 ? E.outCubic : E.lin;   // the burst right after Post eases out; the rest is steady
    return lerp(va, vb, ease(clamp((t - a) / (b - a))));
  }

  const SOUNDS = [['cue', T_SEND, 'click', 0], ['cue', T_SEND + 0.05, 'pop', -2], ['kick', T_SEND + 0.04, 0.6, 0.45], ['cue', T_TYPE, 'type', -8]];
  if (KEYWORD.length > 3) SOUNDS.push(['cue', T_TYPE + KEYWORD.length / 32, 'type', -9]);   // two keystrokes, not one per letter
  SOUNDS.push(['cue', T_DM, 'pop', -4], ['cue', T_THUMB, 'shimmer', -6]);
  for (const [kind, ...args] of SOUNDS) (kind === 'kick' ? kick : cue)(...args);

  const sheetY = t => SHEET_AT.y + (1 - clamp(pop(t - S0 - 0.08, 2.0, 0.64), 0, 1.2)) * 1300;   // springs up from below the frame
  const MOODS = [['celebrate', T_SEND + 0.02, T_DM - 0.06]];

  // the notifications, clipped to the sheet's empty right half (newest on top; older ones slide down and fade)
  function ctaToasts(T, K, t, sy) {
    const tx = SHEET_AT.x + SHEET_AT.w - 400;
    [T, K].forEach(c => runOps(c, [['save'], ['beginPath'], ['rect', tx - 20, sy + 92, 420, 238], ['clip']]));
    toastStack(T, K, tx, sy + 108, 370, t, TOASTS, { max: 2, h: 84 });
    [T, K].forEach(c => c.restore());
  }
  // the counter badge on the sheet's top-right corner (accent once posted), only with a real cta.counter
  function ctaCounter(T, K, t, sy) {
    const v = ctaCount(t);
    const speed = (ctaCount(t + 0.02) - ctaCount(t - 0.02)) / 0.04;
    const bump = 1 + 0.12 * ring(t - T_SEND - 0.02, 3, 7) * (t > T_SEND ? 1 : 0);
    const grown = clamp(pop(t - S0 - 0.3, 3, 0.5), 0, 1.2);
    X([T, K], SHEET_AT.x + SHEET_AT.w - 120, sy + 6, grown * bump, -4, () => {
      const face = { font: F.grot, weight: 700, size: 46 };
      const w = Math.max(180, measure(K, Math.floor(v).toLocaleString('en-US'), face) + 110);
      fillRR(T, -w / 2 + 8, -34, w, 76, 38, C.k45);
      fillRR(K, -w / 2, -38, w, 76, 38, t >= T_SEND ? C.red : C.ink);
      odometer(K, v, 20, 17, { size: 46, color: '#FFFFFF', align: 'center', vel: speed });
      ctaSpeechIcon(K, -w / 2 + 36, -2);
    });
  }
  // a small white speech-bubble icon
  function ctaSpeechIcon(K, x, y) {
    K.save();
    K.translate(x, y);
    fillRR(K, -14, -12, 28, 22, 7, '#FFFFFF');
    polyPath(K, [[-6, 9], [-10, 17], [2, 9]], true);   // its tail
    K.fillStyle = '#FFFFFF';
    K.fill();
    K.restore();
  }
  // after Post: the keyword slams in big on an accent pill (~130 px type), then floats
  function ctaBigKeyword(T, K, t) {
    const grown = clamp(pop(t - T_SEND - 0.02, 2.6, 0.5), 0, 1.25);
    const face = { font: F.grot, weight: 700, size: 132, ls: -2 };
    impact(T, K, BIG_AT.x, BIG_AT.y, t - T_SEND - 0.06, 1.1, 6);
    const y = BIG_AT.y + Math.sin(t * 2.2) * 5 * clamp(t - T_SEND - 0.5);
    const tilt = lerp(-9, -3, clamp(grown)) + Math.sin(t * 1.7) * 0.8;
    X([T, K], BIG_AT.x, y, lerp(0.35, 1, grown), tilt, () => {
      const w = measure(K, KEYWORD, face) + 130;
      fillRR(T, -w / 2 + 18, -80, w, 196, 98, C.k60);   // the printed drop shadow
      fillRR(K, -w / 2, -98, w, 196, 98, C.red);
      text(K, KEYWORD, 0, 48, Object.assign({}, face, { color: '#FFFFFF' }));
    });
  }
  // the DM bubble springs out of the presenter, then a check pops on it
  function ctaDM(T, K, t) {
    const a = pop(t - T_DM, 2.2, 0.58);
    const x = lerp(PRESENTER_DOCK.x - 100, DM_AT.x + DM_AT.w / 2, a), y = lerp(1500, DM_AT.y + 70, a);
    X([T, K], x, y, lerp(0.15, 1, a), lerp(10, 0, clamp(a)), () => {
      const h = dmBubble(T, K, -DM_AT.w / 2, -70, [{ txt: uiText('sentLink'), t0: T_DM + 0.12 }], { t, w: DM_AT.w, title: uiText('newMessage') });
      const tick = pop(t - T_DM - 0.5, 3, 0.45);
      if (tick <= 0) return;
      X([K], DM_AT.w / 2 - 50, -70 + h / 2 + 10, tick, 0, () => {
        circle(K, 0, 0, 26, C.red);
        check(K, 1, 1, 30, clamp((t - T_DM - 0.52) / 0.2), '#FFFFFF', 7);
      });
    });
  }

  function readout(t) {
    const shown = COUNT ? Math.floor(ctaCount(t)).toLocaleString('en-US') : KEYWORD;
    return { k: uiText('comments'), v: shown, hot: t >= T_SEND };
  }
  // lean in on the field while it types, then a slow push
  function cam(t) {
    const lean = win(t, T_TYPE - 0.2, T_SEND + 0.3, 0.4, 0.5);
    const push = Math.max(0, t - T_SEND);
    const lift = win(t, T_SEND, S1 + 1, 0.4, 0.1);
    return { z: 1 + 0.03 * lean + 0.006 * push, y: -12 * lift };
  }
  function draw(T, K, t) {
    moodFx(T, K, t, MOODS);
    const sy = sheetY(t);
    const sheet = { t, w: SHEET_AT.w, keyword: KEYWORD, tType: T_TYPE, tSend: T_SEND, replies: REPLIES };
    commentSheet(T, K, SHEET_AT.x, sy, sheet);
    ctaToasts(T, K, t, sy);
    if (COUNT) ctaCounter(T, K, t, sy);
    if (t >= T_SEND) ctaBigKeyword(T, K, t);
    if (t >= T_DM) ctaDM(T, K, t);
  }
  // the presenter: points at the field, then at the big keyword; holds while the DM lands; ends on a thumbs-up and a wink
  const span = (from, to, what) => [from, to, what];
  function acting() {
    const pointAt = [span(S0 + 0.2, T_SEND + 0.1, SHEET_AT.x + 300), span(T_SEND + 0.1, T_DM - 0.05, BIG_AT.x - 120)];
    pointAt[0].push(tt => sheetY(tt) + 380);
    pointAt[1].push(BIG_AT.y - 40);
    const poses = [['hold', T_DM, T_THUMB - 0.1], ['thumb', T_THUMB, S1 + 1]].map(([pose, from, to]) => [from, to, 'R', pose]);
    const looks = [span(T_DM, T_THUMB, { smile: 0.9, brow: 0.5 }), span(T_THUMB, S1 + 1, { smile: 0.95 }), span(T_THUMB + 0.14, S1 + 1, { wink: 1 })];
    return { focus: pointAt, beats: poses, faces: looks, gestures: false };
  }
  const guy = t => act(t, mood(t, MOODS, acting()));
  SC.cta = { label: '// 03 — ' + uiText('sceneGet'), readout, cam, draw, guy };
})();
