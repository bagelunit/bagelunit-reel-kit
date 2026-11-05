// ═════════════ 04 · TRADEOFFS  [owi(38)−0.1 ≈ 10.10 → owi(52)−0.1 ≈ 13.38] · print orange look ═════════════
// NOTE: reference code from a real reel. Word indices (wi(n)) refer to that reel's script; re-cue on your own words.json.
// Through-object left in: learnCard() (kit).
// assets not included: none (all vector drawing).
// "It walks you through the tradeoffs, and explains any concept you don't know yet."
// Beats (README example, the shared-note checkpoint): the "✦ Build checkpoint: Deleting a shared note" strip launches out of chip 02
// of the learning card → a FULCRUM rises, a BEAM drops on it → two option cards are tossed onto the beam ends and each landing
// tips it ("A keep it in Summer" / "B delete everywhere") → "walks you through": a red walker steps row by row (pro ✓ / cost −),
// every step re-tips the beam, hopping from A to B → "tradeoffs": chip 02 lights, a spark runs up into the fulcrum knob ("?"),
// the beam settles level: a real tradeoff, your call → "and explains": the walker hops back to A's cost and morphs onto the unknown
// term "many-to-many" (dashed = unknown), a red marker sweeps it, a "?" pops → "any concept": a "✦ Concept: many-to-many" card bursts
// OUT of the term (kick) while the scale recedes; chip 03 lights and its spark lands on the card; the README diagram draws itself:
// "Trip ideas" note → two folder links → Travel + Summer, "notes ← folder links → folders" → "you don't know yet": the "?" flips
// to ✓ → the scale files itself into chip 02 and the concept card into chip 03. Hand-off: ≤ 10.25 and ≥ 13.23 are exactly
// learnCard(TC) + the presenter at PRESENTER_DOCK, camera identity. Helpers prefixed tr.
(() => {
  const S0 = owi(38) - 0.1, S1 = owi(52) - 0.1;                 // 10.10 → 13.38
  const IN = S0 + 0.15, END = S1 - 0.15;                        // content lives in [10.25, 13.23)
  const tWalks = owi(39), tTrade = owi(43), tAnd = owi(44), tExpl = owi(45), tConc = owi(47), tYou = owi(48);

  // ── timing ──
  const STRIP0 = IN;                                 // checkpoint strip launches out of chip 02
  const FUL0 = IN + 0.05, BEAM0 = IN + 0.08, BEAM_F = 0.13;
  const DROP = [tWalks + 0.02, tWalks + 0.13], TOSS = 0.15;     // option cards tossed onto the beam
  const LAND = DROP.map(d => d + TOSS);
  const STEPS = [10.66, 10.79, 10.94, 11.07];       // walker arrives on A+, A−, B+, B−
  const SP1 = tTrade, SP1_D = 0.17;                 // chip 02 spark → fulcrum knob
  const BACK = tAnd + 0.1, MORPH = tExpl + 0.12;    // walker hops back to A− (arrives), morphs onto the term (arrives)
  const MARK0 = tExpl + 0.08, MARK_D = 0.15;        // marker sweep
  const QB = tExpl + 0.17;                           // "?" badge
  const CPOP = 11.93, CLAND = 12.11;                 // concept card bursts out of the term
  const SP2 = tConc, SP2_D = 0.15;                  // chip 03 spark → concept card
  const NOTE0 = 12.06, FOLD = [12.11, 12.17], LINK = [12.21, 12.3], LINK_D = 0.18, PILL = [12.35, 12.44], CAP0 = 12.44;
  const FLIP = 12.68;                          // ? → ✓
  const EXA = 12.88, EXC = 12.91, EXD = 0.17;        // file away into chips 02 / 03

  // ── layout (scene coords) ──
  const P = { x: 540, y: 668 };                      // beam pivot
  const ARM = 262, BEAM_L = 930, BEAM_T = 18;
  const CW = 420, CH = 226;
  const STRIP = { x: 540, y: 990, w: 870, h: 116 };
  const CK = { x: 112, y: 650, w: 856, h: 500 };    // concept card slot
  const chipC = i => { const cw = (TC_W - 48 - 16) / 3; return [TC.x + 24 + i * (cw + 8) + cw / 2, TC.y + 80 + 34]; };
  const CHIP2 = chipC(1), CHIP3 = chipC(2);
  const OPT = [
    { k: 'A', title: 'keep it in Summer', rows: [['+', 'nothing gets lost'], ['-', 'needs ', 'many-to-many']] },
    { k: 'B', title: 'delete everywhere', rows: [['+', 'one simple rule'], ['-', 'gone from Summer too']] },
  ];
  const GREY = '#8a8780', LIGHT = '#B3AFA6';
  const G = (size, weight = 500) => ({ font: F.grot, weight, size });
  const M = (size, weight = 500) => ({ font: F.mono, weight, size });
  const ROW_Y = [124, 184];

  // ── helpers ──
  function trA(cs, a, fn) { if (a <= 0.002) return; for (const c of cs) { c.save(); c.globalAlpha *= clamp(a); } fn(); for (const c of cs) c.restore(); }
  function trM(cs, m, fn) { for (const c of cs) { c.save(); c.transform(m.a, m.b, m.c, m.d, m.e, m.f); } fn(); for (const c of cs) c.restore(); }
  function trGlow(T, x, y, r, a) {
    if (a <= 0.003) return;
    const g = T.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,0,0,${Math.min(1, a)})`); g.addColorStop(0.55, `rgba(255,0,0,${Math.min(1, a) * 0.35})`); g.addColorStop(1, 'rgba(255,0,0,0)');
    T.fillStyle = g; T.fillRect(x - r, y - r, r * 2, r * 2);
  }
  function trCard(T, K, x, y, w, h, r, o = {}) {
    T.save(); T.shadowColor = `rgba(0,0,0,${o.sh ?? 0.4})`; T.shadowBlur = o.blur ?? 34; T.shadowOffsetY = o.off ?? 20; fillRR(T, x, y, w, h, r, '#FFFFFF'); T.restore();
    fillRR(T, x, y, w, h, r, '#FFFFFF');
    fillRR(K, x, y, w, h, r, o.fill || '#FFFFFF'); strokeRR(K, x, y, w, h, r, o.stroke || C.ink, o.lw ?? 3.5);
  }
  const bez = (a, c, b, u) => [(1 - u) * (1 - u) * a[0] + 2 * (1 - u) * u * c[0] + u * u * b[0], (1 - u) * (1 - u) * a[1] + 2 * (1 - u) * u * c[1] + u * u * b[1]];
  // spark: a red head running along a curve with a fading tail
  function trSpark(K, a, c, b, k) {
    if (k <= 0 || k >= 1) return;
    const u = E.inOutCubic(k), [x, y] = bez(a, c, b, u);
    for (let j = 1; j <= 8; j++) {
      const [qx, qy] = bez(a, c, b, Math.max(0, u - j * 0.035)), [px, py] = bez(a, c, b, Math.max(0, u - (j - 1) * 0.035));
      line(K, px, py, qx, qy, C.red, 12 * (1 - j / 9) + 1);
    }
    circle(K, x, y, 13, C.red); circle(K, x, y, 5, '#FFFFFF');
  }

  // ── beam physics: every landing / step is an impulse into a damped spring ──
  const IMP = [[BEAM0 + BEAM_F, 0], [LAND[0], -7.5], [LAND[1], 7.5], [STEPS[0], -3.6], [STEPS[1], 3.6], [STEPS[2], 3.6], [STEPS[3], -3.6]];
  const beamAng = t => IMP.reduce((s, [t0, d]) => s + d * spring(t - t0, 2.2, 0.3), 0) + 0.7 * Math.sin((t - 10.6) * 2.4) * win(t, 11.25, 12.9, 0.4, 0.2);

  const dimP = t => E.inOutCubic(clamp((t - CPOP) / 0.2));
  const exitK = (t, t0) => clamp((t - t0) / EXD);
  const trBack = u => u * u * (1.5 * u - 0.5);           // soft anticipation (less lift than inBack)
  // assembly (strip + fulcrum + beam + cards): recedes during the concept, then files itself into chip 02
  function asmM(t) {
    const d = dimP(t), k = exitK(t, EXA);
    let x = P.x, y = P.y, s = 1 - 0.06 * d, r = 0;
    if (k > 0) { const u = trBack(k); [x, y] = bez([P.x, P.y], [160, 1050], CHIP2, u); s *= lerp(1, 0.035, E.inCubic(k)); r = -14 * k; }
    return new DOMMatrix().translate(x, y).rotate(r).scale(s).translate(-P.x, -P.y);
  }
  // option card i: bottom-centre sits on the beam end, tossed in from its side
  function cardM(i, t) {
    const th = beamAng(t), rad = th * D2R, ex = (i ? 1 : -1) * ARM, ey = -BEAM_T / 2;
    let x = P.x + Math.cos(rad) * ex - Math.sin(rad) * ey, y = P.y + Math.sin(rad) * ex + Math.cos(rad) * ey, rot = th;
    const k = clamp((t - DROP[i]) / TOSS);
    if (k < 1) {
      const side = i ? 1 : -1, u = E.outQuad(k);
      x += side * 760 * (1 - u); y += -120 * Math.sin(Math.PI * k) * 1.0 + (1 - u) * 40; rot = lerp(side * 28, th, E.outCubic(k));
    }
    const rg = t >= LAND[i] ? ring(t - LAND[i], 3.4, 9) : 0;
    return new DOMMatrix().translate(x, y).rotate(rot).scale(1 + 0.06 * rg, 1 - 0.09 * rg).translate(-CW / 2, -CH);
  }
  const cardIn = (i, t) => t >= DROP[i];

  let TERM = null;                                     // term box in card-A local coords
  function termBox(K) {
    if (!TERM) { const x = 79 + measure(K, 'needs ', G(28)), w = measure(K, 'many-to-many', G(28)); TERM = { x: x - 7, y: ROW_Y[1] - 24, w: w + 14, h: 46, tx: x }; }
    return TERM;
  }

  // ── option card (local 0..CW × 0..CH) ──
  function optCard(T, K, i, t) {
    const o = OPT[i];
    trCard(T, K, 0, 0, CW, CH, 24, { sh: 0.38, blur: 30, off: 18 });
    fillRR(K, 22, 22, 44, 44, 22, i ? C.ink : C.ink);
    text(K, o.k, 44, 54, Object.assign(G(28, 700), { color: '#FFFFFF' }));
    text(K, o.title, 80, 55, Object.assign(G(32, 700), { color: C.ink, align: 'left', ls: -0.6 }));
    line(K, 22, 86, CW - 22, 86, HAIR, 2, 'butt');
    o.rows.forEach((row, r) => {
      const yc = ROW_Y[r], st = STEPS[i * 2 + r], v = clamp((t - st + 0.02) / 0.12), on = v > 0.3;
      const pro = row[0] === '+';
      // icon
      const ip = E.outBack(v);
      circle(K, 44, yc, 16, null, on ? (pro ? C.ink : C.red) : '#CFCBC2', 2.5);
      if (v > 0) {
        circle(K, 44, yc, 16 * ip, pro ? C.ink : C.red);
        if (pro) check(K, 44, yc + 1, 17, clamp(v * 1.4 - 0.2), '#FFFFFF', 4);
        else line(K, 44 - 7 * clamp(v * 1.5), yc, 44 + 7 * clamp(v * 1.5), yc, '#FFFFFF', 4.5);
      }
      const col = on ? C.ink : LIGHT, sl = (1 - E.outCubic(v)) * 0;
      text(K, row[1], 76 + sl, yc + 10, Object.assign(G(28), { color: col, align: 'left' }));
      if (row[2]) {                                                    // the unknown term: dashed underline
        const tb = termBox(K);
        text(K, row[2], tb.tx, yc + 10, Object.assign(G(28, 700), { color: col, align: 'left' }));
        K.save(); K.setLineDash([5, 6]); line(K, tb.tx, yc + 18, tb.tx + tb.w - 14, yc + 18, on ? C.red : LIGHT, 2.5, 'butt'); K.restore();
      }
    });
  }

  // ── fulcrum + beam (assembly coords) ──
  function fulcrum(T, K, t) {
    const p = pop(t - FUL0, 3, 0.5);
    if (p <= 0.01) return;
    X([T, K], P.x, 900, 1, 0, () => {
      for (const c of [T, K]) c.scale(1, clamp(p, 0, 1.15));
      // triangle
      const tri = c => { c.beginPath(); c.moveTo(0, -(900 - P.y) + 4); c.lineTo(78, -6); c.lineTo(-78, -6); c.closePath(); };
      tri(T); T.fillStyle = C.k45; T.fill();
      tri(K); K.lineWidth = 4; K.strokeStyle = C.ink; K.lineJoin = 'round'; K.stroke();
      fillRR(K, -120, -8, 240, 18, 9, C.ink);
    });
  }
  function beam(T, K, t) {
    const k = clamp((t - BEAM0) / BEAM_F);
    if (k <= 0) return;
    const off = -260 * (1 - k * k), rg = t > BEAM0 + BEAM_F ? ring(t - BEAM0 - BEAM_F, 4, 10) : 0;
    X([T, K], P.x, P.y + off, 1, beamAng(t), () => {
      T.save(); T.shadowColor = 'rgba(0,0,0,0.35)'; T.shadowBlur = 16; T.shadowOffsetY = 10; fillRR(T, -BEAM_L / 2, -BEAM_T / 2, BEAM_L, BEAM_T, 9, '#FFFFFF'); T.restore();
      K.save(); K.scale(1, 1 - 0.25 * rg);
      fillRR(K, -BEAM_L / 2, -BEAM_T / 2, BEAM_L, BEAM_T, 9, C.ink);
      for (const s of [-1, 1]) fillRR(K, s * BEAM_L / 2 - (s > 0 ? 14 : 0), -BEAM_T / 2 - 6, 14, BEAM_T + 12, 5, C.ink);
      // notch ticks
      for (let j = -5; j <= 5; j++) if (j) line(K, j * 80, -2, j * 80, 2, 'rgba(255,255,255,0.35)', 3, 'butt');
      K.restore();
    });
  }
  function knob(T, K, t) {
    const k = clamp((t - BEAM0) / BEAM_F);
    if (k <= 0) return;
    const hit = t - (SP1 + SP1_D), hot = hit >= 0;
    const s = clamp(pop(t - BEAM0 - 0.04, 3.2, 0.45), 0, 1.3) * (1 + 0.28 * ring(hit, 3.5, 8));
    if (dimP(t) > 0.98) return;
    trA([T, K], 1 - dimP(t), () => X([T, K], P.x, P.y + -260 * (1 - k * k), s, 0, () => {
      circle(T, 0, 4, 34, C.k30);
      circle(K, 0, 0, 33, hot ? C.red : '#FFFFFF', C.ink, 4);
      text(K, '?', 1, 15, { font: F.serif, italic: true, weight: 400, size: 46, color: hot ? '#FFFFFF' : C.red });
    }));
    if (hot) { shock(K, P.x, P.y, hit, { r: 120, color: C.red, lw: 5, dur: 0.32 }); burst(K, P.x, P.y, hit, { n: 12, r0: 50, r1: 120, color: C.red, lw: 5, dur: 0.3 }); }
  }
  // ── checkpoint strip (real README checkpoint) ──
  function strip(T, K, t) {
    const p = pop(t - STRIP0, 2.6, 0.55);
    if (p <= 0.01) return;
    const u = clamp(p, 0, 1.08);
    const x = lerp(CHIP2[0], STRIP.x, Math.min(u, 1.015)), y = lerp(CHIP2[1], STRIP.y, Math.min(u, 1.015)), s = lerp(0.22, 1, clamp(p, 0, 1.06));
    trA([T, K], clamp(p * 3), () => X([T, K], x, y, s, -4 * (1 - u), () => {
      const w = STRIP.w, h = STRIP.h;
      trCard(T, K, -w / 2, -h / 2, w, h, 22, { sh: 0.32, blur: 26, off: 14, lw: 3 });
      text(K, '✦ Build checkpoint:', -w / 2 + 30, -h / 2 + 44, Object.assign(M(23, 700), { color: C.red, align: 'left' }));
      const bx = -w / 2 + 30 + measure(K, '✦ Build checkpoint: ', M(23, 700));
      text(K, 'Deleting a shared note', bx, -h / 2 + 44, Object.assign(M(23, 700), { color: C.ink, align: 'left' }));
      text(K, 'Delete Travel. What happens to “Trip ideas” in Summer?', -w / 2 + 30, -h / 2 + 90, Object.assign(G(29), { color: C.ink, align: 'left' }));
    }));
  }

  // ── walker: one red outline that steps through the rows (in world coords via the card matrices) ──
  const WK = [[STEPS[0], 0, 0, 0.1], [STEPS[1], 0, 1, 0.1], [STEPS[2], 1, 0, 0.14], [STEPS[3], 1, 1, 0.1], [BACK, 0, 1, 0.15], [MORPH, 0, 2, 0.12]];
  function wkRect(K, ci, ri, t) {             // → {m, cx, cy, w, h} in card-local
    if (ri === 2) { const tb = termBox(K); return { cx: tb.x + tb.w / 2, cy: tb.y + tb.h / 2, w: tb.w, h: tb.h }; }
    return { cx: CW / 2, cy: ROW_Y[ri], w: CW - 36, h: 52 };
  }
  function wkWorld(K, ci, ri, t) {
    const m = asmM(t).multiply(cardM(ci, t)), r = wkRect(K, ci, ri, t), p = m.transformPoint(new DOMPoint(r.cx, r.cy));
    return { x: p.x, y: p.y, w: r.w, h: r.h, rot: Math.atan2(m.b, m.a) / D2R, s: Math.hypot(m.a, m.b) };
  }
  function walker(K, t) {
    if (t < STEPS[0] - 0.1 || t > CPOP + 0.12) return;
    let i = 0; while (i + 1 < WK.length && t >= WK[i + 1][0] - WK[i + 1][3]) i++;
    let q = wkWorld(K, WK[i][1], WK[i][2], t), hop = 0;
    // in transit to i (between its start and arrival)?
    if (i > 0 && t < WK[i][0]) {
      const k = clamp((t - (WK[i][0] - WK[i][3])) / WK[i][3]), u = E.inOutCubic(k);
      const a = wkWorld(K, WK[i - 1][1], WK[i - 1][2], t);
      const cross = WK[i - 1][1] !== WK[i][1];
      q = { x: lerp(a.x, q.x, u), y: lerp(a.y, q.y, u), w: lerp(a.w, q.w, u), h: lerp(a.h, q.h, u), rot: lerp(a.rot, q.rot, u), s: q.s };
      hop = (cross ? 90 : 14) * Math.sin(Math.PI * k);
    }
    const app = i === 0 ? E.outBack(clamp((t - (STEPS[0] - 0.1)) / 0.1)) : 1;
    const fade = 1 - clamp((t - CPOP) / 0.12);
    const pulse = 1 + 0.08 * ring(t - WK[i][0], 4, 10) * (t >= WK[i][0] ? 1 : 0);
    trA([K], fade, () => X([K], q.x, q.y - hop, q.s * app * pulse, q.rot, () => {
      strokeRR(K, -q.w / 2, -q.h / 2, q.w, q.h, 12, C.red, 4.5);
      // little runner arrow on the left edge
      K.beginPath(); K.moveTo(-q.w / 2 - 6, -11); K.lineTo(-q.w / 2 + 9, 0); K.lineTo(-q.w / 2 - 6, 11); K.closePath(); K.fillStyle = C.red; K.fill();
    }));
  }

  // ── term overlay (marker + ?/✓ badge), drawn on top in card-A space at full strength ──
  function termOverlay(K, t) {
    const hp = E.outCubic(clamp((t - MARK0) / MARK_D));
    const tb = termBox(K);
    if (hp > 0) {
      const s = 1 + 0.1 * ring(t - MARK0 - MARK_D, 4, 10);
      X([K], tb.x + tb.w / 2, tb.y + tb.h / 2, s, 0, () => {
        K.translate(-(tb.x + tb.w / 2), -(tb.y + tb.h / 2));
        fillRR(K, tb.x, tb.y, tb.w * hp, tb.h, 10, C.red);
        K.save(); rr(K, tb.x, tb.y, tb.w * hp, tb.h, 10); K.clip();
        text(K, 'many-to-many', tb.tx, ROW_Y[1] + 10, Object.assign(G(28, 700), { color: '#FFFFFF', align: 'left' }));
        K.restore();
      });
    }
    // ? badge → ✓ (flips around its vertical axis)
    const bq = pop(t - QB, 3.2, 0.42);
    if (bq > 0.01) {
      const bx = tb.x + tb.w + 6, by = tb.y - 10, fl = clamp((t - FLIP) / 0.16), sx = Math.abs(Math.cos(Math.PI * fl)), done = fl >= 0.5;
      X([K], bx, by, clamp(bq, 0, 1.25) * (1 + (done ? 0.25 * ring(t - FLIP - 0.08, 3.5, 8) : 0)), 8 - 8 * clamp(bq, 0, 1), () => {
        K.scale(Math.max(0.05, sx), 1);
        circle(K, 0, 0, 25, done ? C.ink : '#FFFFFF', done ? C.ink : C.red, 3.5);
        if (!done) text(K, '?', 0, 12, Object.assign(G(32, 700), { color: C.red }));
        else check(K, 0, 1, 24, 1, '#FFFFFF', 5);
      });
      if (done) burst(K, bx, by, t - FLIP - 0.08, { n: 10, r0: 34, r1: 80, color: C.red, lw: 4, dur: 0.28 });
    }
  }

  // ── concept card (local 0..CK.w × 0..CK.h) — README: "notes ← folder links → folders" ──
  const NOTE = { x: 40, y: 182, w: 236, h: 146 };
  const FLD = [{ x: 590, y: 140, w: 226, h: 108, n: 'Travel' }, { x: 590, y: 296, w: 226, h: 108, n: 'Summer' }];
  const LNK = [[[NOTE.x + NOTE.w, NOTE.y + 52], [430, 176], [FLD[0].x, FLD[0].y + 56]], [[NOTE.x + NOTE.w, NOTE.y + 92], [430, 370], [FLD[1].x, FLD[1].y + 56]]];
  function folder(T, K, f, p) {
    X([T, K], f.x + f.w / 2, f.y + f.h / 2, p, 0, () => {
      const x = -f.w / 2, y = -f.h / 2;
      fillRR(T, x + 8, y + 10, f.w, f.h, 14, C.k30);
      K.beginPath(); K.moveTo(x, y + 12); K.lineTo(x, y - 10); K.arcTo(x, y - 18, x + 8, y - 18, 8); K.lineTo(x + 70, y - 18); K.lineTo(x + 86, y); K.closePath(); K.fillStyle = C.ink; K.fill();
      fillRR(K, x, y, f.w, f.h, 14, '#FFFFFF'); strokeRR(K, x, y, f.w, f.h, 14, C.ink, 3.5);
      text(K, f.n, 0, 13, Object.assign(G(36, 700), { color: C.ink, ls: -0.5 }));
    });
  }
  function conceptCard(T, K, t) {
    const w = CK.w, h = CK.h;
    trCard(T, K, 0, 0, w, h, 28, { sh: 0.45, blur: 46, off: 26, lw: 4 });
    // header
    const hb = 1 + 0.12 * ring(t - (SP2 + SP2_D), 3.5, 8);
    X([K], 36, 50, hb, 0, () => {
      const f = M(24, 700), pw = measure(K, '✦ Concept', f) + 28;
      fillRR(K, 0, -24, pw, 40, 20, C.red);
      text(K, '✦ Concept', pw / 2, 4, Object.assign({}, f, { color: '#FFFFFF' }));
    });
    const hx = 36 + measure(K, '✦ Concept', M(24, 700)) + 28 + 18;
    text(K, 'many-to-many', hx, 60, { font: F.serif, italic: true, weight: 400, size: 54, color: C.ink, align: 'left' });
    line(K, 28, 88, w - 28, 88, HAIR, 2, 'butt');
    // links (behind boxes)
    LNK.forEach(([a, c, b], j) => {
      const lp = E.inOutCubic(clamp((t - LINK[j]) / LINK_D));
      if (lp <= 0) return;
      const pulse = t > FLIP ? 1 + 0.6 * Math.max(0, ring(t - FLIP - j * 0.05, 3, 7)) : 1;
      strokeP(K, cx => { cx.beginPath(); cx.moveTo(...a); cx.quadraticCurveTo(...c, ...b); }, 520, lp, C.ink, 5 * pulse);
      if (lp > 0.95) { // arrow head
        const [px, py] = bez(a, c, b, 0.96), ang = Math.atan2(b[1] - py, b[0] - px);
        X([K], b[0] - 2, b[1], 1, ang / D2R, () => { K.beginPath(); K.moveTo(0, 0); K.lineTo(-18, -11); K.lineTo(-18, 11); K.closePath(); K.fillStyle = C.ink; K.fill(); });
      }
      const pq = pop(t - PILL[j], 3.2, 0.45);
      if (pq > 0.01) {
        const [mx, my] = bez(a, c, b, 0.5), ps = clamp(pq, 0, 1.25) * (t > FLIP ? 1 + 0.18 * ring(t - FLIP - j * 0.05, 3.5, 8) : 1);
        X([K], mx, my, ps, 0, () => {
          const f = M(22, 700), pw = measure(K, 'link', f) + 30;
          fillRR(K, -pw / 2, -19, pw, 38, 19, t > FLIP + 0.04 ? C.red : C.ink);
          text(K, 'link', 0, 7, Object.assign({}, f, { color: '#FFFFFF' }));
        });
      }
    });
    text(K, 'folder links', 430, 148, Object.assign(M(22, 500), { color: clamp((t - LINK[0]) / 0.12) > 0.5 ? GREY : 'rgba(0,0,0,0)' }));
    // note
    const np = pop(t - NOTE0, 3, 0.45);
    if (np > 0.01) X([T, K], NOTE.x + NOTE.w / 2, NOTE.y + NOTE.h / 2, clamp(np, 0, 1.2), -3 * (1 - clamp(np)), () => {
      const x = -NOTE.w / 2, y = -NOTE.h / 2, fl = 30;
      fillRR(T, x + 8, y + 12, NOTE.w, NOTE.h, 12, C.k30);
      K.beginPath(); K.moveTo(x + 12, y); K.lineTo(x + NOTE.w - fl, y); K.lineTo(x + NOTE.w, y + fl); K.lineTo(x + NOTE.w, y + NOTE.h - 12);
      K.arcTo(x + NOTE.w, y + NOTE.h, x + NOTE.w - 12, y + NOTE.h, 12); K.lineTo(x + 12, y + NOTE.h); K.arcTo(x, y + NOTE.h, x, y + NOTE.h - 12, 12);
      K.lineTo(x, y + 12); K.arcTo(x, y, x + 12, y, 12); K.closePath(); K.fillStyle = '#FFFFFF'; K.fill(); K.lineWidth = 3.5; K.strokeStyle = C.ink; K.lineJoin = 'round'; K.stroke();
      K.beginPath(); K.moveTo(x + NOTE.w - fl, y); K.lineTo(x + NOTE.w - fl, y + fl); K.lineTo(x + NOTE.w, y + fl); K.stroke();
      text(K, '// note', x + 22, y + 44, Object.assign(M(22, 500), { color: GREY, align: 'left' }));
      text(K, 'Trip ideas', x + 22, y + 104, Object.assign(G(38, 700), { color: C.ink, align: 'left', ls: -0.6 }));
    });
    FLD.forEach((f, j) => { const fp = pop(t - FOLD[j], 3, 0.45); if (fp > 0.01) folder(T, K, f, clamp(fp, 0, 1.2)); });
    // caption types in (README line)
    const cap = 'notes ← folder links → folders', n = Math.floor(clamp((t - CAP0) / 0.24) * cap.length);
    if (n > 0) {
      const f = M(25, 700), cw = measure(K, cap, f), x0 = w / 2 - cw / 2;
      text(K, cap.slice(0, n), x0, 466, Object.assign({}, f, { color: C.ink, align: 'left' }));
      if (n < cap.length) fillRR(K, x0 + measure(K, cap.slice(0, n), f) + 3, 444, 13, 28, 2, C.red);
    }
  }
  function conceptPose(K, t) {
    const p = inAt(t, CPOP, 2.3, 0.5);
    if (p <= 0.001) return null;
    const mA = asmM(t).multiply(cardM(0, t)), tb = termBox(K), o = mA.transformPoint(new DOMPoint(tb.x + tb.w / 2, tb.y + tb.h / 2));
    const fk = E.outCubic(clamp((t - CPOP) / (CLAND - CPOP)));
    const cx = CK.x + CK.w / 2, cy = CK.y + CK.h / 2;
    let [x, y] = bez([o.x, o.y], [o.x - 60, cy + 40], [cx, cy], fk);
    let s = lerp(0.06, 1, clamp(p, 0, 1.08)), r = lerp(-9, 0, clamp(p)), a = clamp(p * 4);
    const k = exitK(t, EXC);
    if (k > 0) { const u = trBack(k); [x, y] = bez([cx, cy], [760, 1240], CHIP3, u); s *= lerp(1, 0.03, E.inCubic(k)); r = 12 * k; a *= 1 - clamp((k - 0.8) / 0.2); }
    return { x, y, s, r, a, k, o };
  }

  kick(CLAND, 0.5, 0.45);   // the one punch: the concept card lands

  SC.tradeoffs = {
    label: '// 04 — tradeoffs', bg: 'light',
    cam: t => {
      if (t < IN || t >= END) return { x: 0, y: 0, z: 1, r: 0 };
      const a = win(t, IN, 11.5, 0.45, 0.3);                  // on the scale; drift with the walker
      const sx = lerp(14, -14, E.inOutCubic(clamp((t - (STEPS[2] - 0.12)) / 0.2))) * (1 - E.inOutCubic(clamp((t - (BACK - 0.16)) / 0.2)));
      const b = win(t, 11.5, 11.98, 0.2, 0.2);                  // push toward the unknown term
      const c = win(t, 12.0, 12.94, 0.25, 0.26);                // concept card
      return { x: sx * a + 26 * b + 6 * c * Math.sin((t - 12) * 1.6), y: 12 * a + 18 * b + 6 * c, z: 1 + 0.03 * a + 0.045 * b + 0.04 * c, r: 0.004 * Math.sin((t - 10.3) * 1.9) * (a + c) };
    },
    draw(T, K, t) {
      if (t < IN || t >= END) { learnCard(T, K, TC.x, TC.y, TC.s, { t }); return; }
      // glows
      trGlow(T, P.x, P.y, 420, 0.3 * Math.exp(-Math.max(0, t - SP1 - SP1_D) * 3) * (t >= SP1 + SP1_D ? 1 : 0));
      trGlow(T, CK.x + CK.w / 2, CK.y + CK.h / 2, 620, 0.32 * Math.exp(-Math.max(0, t - CLAND) * 2.4) * (t >= CLAND - 0.05 ? 1 : 0) + 0.1 * win(t, 12.1, 12.9, 0.2, 0.2) * (1 - exitK(t, EXC)));
      // learning card (through-object): recoil on launch, bump as things land in chips 02 / 03, focus rings on lit chips
      const LA = EXA + EXD, LC2 = EXC + EXD;
      const b = (-0.02 * ring(t - STRIP0, 3, 9) + 0.04 * ring(t - LA, 3.2, 10) + 0.04 * ring(t - LC2, 3.5, 11)) * clamp((END - t) / 0.06);
      const foc = t > tTrade - 0.02 && t < 11.62 ? 1 : t > tConc - 0.02 && t < 12.78 ? 2 : undefined;
      const cx = TC.x + TC_W / 2, cy = TC.y + TC_H / 2;
      X([T, K], cx, cy, 1 + b, 0, () => learnCard(T, K, -TC_W / 2, -TC_H / 2, TC.s, { t, focus: foc }));
      // ── assembly ──
      const ka = exitK(t, EXA), mAsm = asmM(t);
      if (ka < 1) {
        const al = (1 - 0.6 * dimP(t)) * (1 - clamp((ka - 0.8) / 0.2));
        trA([T, K], al, () => trM([T, K], mAsm, () => {
          strip(T, K, t);
          fulcrum(T, K, t);
          beam(T, K, t);
          LAND.forEach((l, i) => { const th = beamAng(t) * D2R, ex = (i ? 1 : -1) * ARM; burst(K, P.x + Math.cos(th) * ex, P.y + Math.sin(th) * ex, t - l, { n: 12, r0: 60, r1: 170, color: C.red, lw: 5, dur: 0.26 }); });
          for (const i of [1, 0]) if (cardIn(i, t)) trM([T, K], cardM(i, t), () => optCard(T, K, i, t));
          knob(T, K, t);
        }));
        walker(K, t);
        trA([K], 1 - clamp((ka - 0.8) / 0.2), () => trM([K], mAsm.multiply(cardM(0, t)), () => termOverlay(K, t)));
      }
      // ── concept card ──
      const q = conceptPose(K, t);
      if (q && q.k < 1) {
        if (t < CLAND + 0.05) trA([K], 0.5 * (1 - clamp((t - CPOP) / 0.2)), () => line(K, q.o.x, q.o.y, q.x, q.y, C.red, 10));
        trA([T, K], q.a, () => X([T, K], q.x, q.y, q.s, q.r, () => { T.translate(-CK.w / 2, -CK.h / 2); K.translate(-CK.w / 2, -CK.h / 2); conceptCard(T, K, t); }));
        // the term stays readable above the card while it pops
        if (t < CLAND + 0.3) trA([K], 1 - clamp((ka - 0.8) / 0.2), () => trM([K], mAsm.multiply(cardM(0, t)), () => termOverlay(K, t)));
      }
      shock(K, CK.x + CK.w / 2, CK.y + CK.h / 2, t - CLAND, { r: 520, color: C.red, lw: 6, dur: 0.34 });
    },
    front(T, K, t) {
      if (t < IN || t >= END) return;
      // chip 02 → fulcrum knob; chip 03 → concept card header
      trSpark(K, CHIP2, [180, 1080], [P.x, P.y], (t - SP1) / SP1_D);
      const hx = CK.x + 90, hy = CK.y + 46;
      trSpark(K, CHIP3, [760, 1280], [hx, hy], (t - SP2) / SP2_D);
      [[SP1, CHIP2], [SP2, CHIP3]].forEach(([t0, c]) => { const d = t - t0; if (d >= 0 && d < 0.35) { shock(K, c[0], c[1], d, { r: 110, color: C.red, lw: 5, dur: 0.3 }); } });
      const d2 = t - SP2 - SP2_D; if (d2 >= 0 && d2 < 0.35) burst(K, hx, hy, d2, { n: 10, r0: 70, r1: 120, color: C.red, lw: 4, dur: 0.26 });
      // landings in the chips
      [[EXA + EXD, CHIP2], [EXC + EXD, CHIP3]].forEach(([t0, c]) => { const d = t - t0; if (d >= -0.02 && d < 0.3) { shock(K, c[0], c[1], d + 0.02, { r: 110, color: C.red, lw: 5, dur: 0.16 }); burst(K, c[0], c[1], d + 0.02, { n: 10, r0: 50, r1: 110, color: C.red, lw: 5, dur: 0.15 }); } });
    },
    guy(t) {
      const D = PRESENTER_DOCK, sh = win(t, IN - 0.05, END - 0.25, 0.3, 0.25), st = { x: D.x + 55 * sh, y: D.y - 30 * sh, s: D.s };
      if (t < S0 + 0.001) return st;
      // aim keys: [time, targetX, targetY] — left arm points constantly, re-aimed at each new focus
      const SHX = st.x - 226 * D.s, SHY = st.y - 264 * D.s;
      const AIM = [[S0, 540, 980], [DROP[0] + 0.02, 280, 600], [DROP[1] + 0.03, 700, 600], [STEPS[0] - 0.08, 280, 610], [STEPS[2] - 0.12, 720, 640],
        [SP1 + 0.04, P.x, P.y], [BACK - 0.14, 260, 660], [CPOP + 0.04, 420, 900], [NOTE0 + 0.1, 260, 930], [LINK[1], 470, 930],
        [FLIP - 0.1, 330, 640], [EXA - 0.02, 470, 1250]];
      const angOf = (x, y) => clamp(-Math.atan2(SHY - y, SHX - x) / D2R, -95, -20);
      let ang = angOf(AIM[0][1], AIM[0][2]), tx = AIM[0][1], ty = AIM[0][2];
      for (let i = 1; i < AIM.length; i++) {
        const q = E.inOutCubic(clamp((t - AIM[i][0]) / 0.15));
        ang = lerp(ang, angOf(AIM[i][1], AIM[i][2]), q); tx = lerp(tx, AIM[i][1], q); ty = lerp(ty, AIM[i][2], q);
      }
      const lx = clamp((tx - (D.x - 40)) / 520, -1, 1) * 0.9, ly = clamp((ty - 1420) / 900, -1, 1) * 0.9;
      const ar = arms(t, [[10.3, 10.86, 'R', 'hold'], [10.92, 11.5, 'R', 'shrug'], [12.02, 12.48, 'R', 'hold'], [12.86, END + 0.2, 'R', 'thumb']]);
      Object.assign(st, ar, { armL: 'point', armLp: 1, pointAng: ang + 2.2 * Math.sin(t * 5.3) * win(t, IN + 0.2, END - 0.15) },
        expr(t, [[S0 + 0.05, 10.88, { brow: 0.5, smile: 0.4 }],
          [10.88, 11.5, { browTilt: 0.55, smile: 0.1, brow: 0.3 }],
          [11.52, 12.02, { brow: 0.85, smile: 0.35 }],
          [12.02, 12.5, { smile: 0.65, brow: 0.55 }],
          [12.32, FLIP, { browTilt: 0.75, smile: -0.25, brow: 0.2 }],
          [FLIP, END + 0.3, { smile: 0.85, brow: 0.45 }],
          [FLIP + 0.04, FLIP + 0.22, { wink: 1 }]]),
        { lookX: lx, lookY: ly,
          headTilt: -4 * win(t, 10.4, 10.86, 0.1, 0.15) + 4 * win(t, 10.9, 11.45, 0.1, 0.15) - 6 * win(t, 12.32, FLIP, 0.1, 0.12) + 3 * win(t, FLIP, END, 0.1, 0.2),
          headTurn: 0.16 * lx * win(t, S0, END, 0.15, 0.15) });
      return st;
    },
  };
})();
