// ═════════════ 02 · LEARNMODE  [owi(18)−0.1 ≈ 4.46 → owi(28)−0.1 ≈ 7.50] · orange print look ═════════════
// NOTE: reference code from a real reel. Word indices (wi(n)) refer to that reel's script; re-cue on your own words.json.
// Through-object left in: learnCard() (kit).
// assets not included: IMG.gh_light, IMG.gh_readme (repo page screenshots), IMG.vwnam_icon (plugin icon); lookups no-op when missing.
// "It's called LearnMode, and it's in the official plugin directory."
// Beats: the REAL repo page (github.com/owner/learn-mode) flies in as a browser window → "called": the page punches in on the
// "learn-mode" title → "LearnMode": a red marker underline strikes under it (kick) → the page whip-pans right to the real Star button,
// which lifts off the page (2.1k) with sparkles → "and it's in": the page fly-scrolls (zoom out, travel, zoom in) down the README to
// the real line "Install from the built-in Plugin Directory" → "the official": a highlighter sweeps it and a red loop circles it
// → a Claude Code terminal pushes up under the window (which recedes a step) and types the README's install line;
// "@plugin-directory" types in red and a dashed leader ties it back to the circled words; an "Plugin Directory" tag
// pops → Enter: "Installed learn-mode" with the real plugin icon → "directory": the window whips off left, the terminal collapses
// into the icon, and the icon drops into the learning-mode card's "// learn-mode" header.
// Hand-off: ≤ 4.60 and ≥ 7.34 are exactly learnCard(TC) + the presenter at PRESENTER_DOCK, camera identity. Helpers prefixed vn.
(() => {
  (window.TOUR_ASSETS = window.TOUR_ASSETS || []).push(['vwnam_icon', 'assets/placeholder_icon.png']);
  const S0 = owi(18) - 0.1, S1 = owi(28) - 0.1;          // 4.46 → 7.50
  const tVW = owi(20), tAnd = owi(21), tAnth = owi(24);
  const BEG = S0 + 0.14, END = S1 - 0.16;               // 4.60 · 7.34

  // ── timing ──
  const W_IN = BEG;                                     // window flies in
  const PUSH0 = 4.78, PUSH1 = 5.08;                     // wide → title
  const UL0 = tVW - 0.02, UL1 = tVW + 0.2;              // marker underline
  const WHIP0 = 5.3, WHIP1 = 5.5;                       // pan → Star button
  const LIFT = 5.47, DROP = 5.66;                       // Star button lifts off / drops back
  const SCR0 = tAnd - 0.05, SCR1 = 6.06;                // fly-scroll to README line
  const HI0 = tAnth - 0.06, HI1 = tAnth + 0.12;         // highlighter sweep
  const LOOP0 = tAnth - 0.02, LOOP1 = tAnth + 0.26;     // red loop
  const T_IN = 6.24;                                    // terminal pushes up
  const TY1 = 6.32, TY2 = 6.47, TY_E = 6.83;            // typing: line 1 from TY1, line 2 TY2 → TY_E
  const LINK0 = 6.64, LINK1 = 6.84;                     // dashed leader
  const PILL = 6.84;                                    // "Plugin Directory" tag
  const ENTER = 6.9, OUTL = 6.95;                       // enter → installed
  const EX0 = 7.05;                                     // window exits
  const FLY0 = 7.03, FLY1 = 7.24;                        // icon → learning card

  // ── layout (scene coords) ──
  const WX = 90, WW = 900, BAR = 64;                    // browser window; its top and body height animate (wyAt / bhAt)
  const wyAt = t => lerp(222, 318, E.inOutCubic(inv(SCR0, SCR1, t)));
  const bhAt = t => lerp(860, 566, E.inOutCubic(inv(SCR0, SCR1, t)));
  const TX = 90, TY = 990, TW = 900, TH = 252;          // terminal
  const PAGE2 = 1588;                                   // gh_readme sits at page y + 1588 below gh_light
  const L1 = '/plugin install', L2a = 'learn-mode', L2b = '@plugin-directory';
  const MONO = (size, weight = 500) => ({ font: F.mono, weight, size });
  const CARD_HDR = [TC.x + 24 + 64, TC.y + 34];         // where the icon lands (over "// learn-mode")
  const CW = 19.2;                                      // JetBrains Mono advance at 32 px

  // ── helpers ──
  function vnA(cs, a, fn) { if (a <= 0.002) return; for (const c of cs) { c.save(); c.globalAlpha *= clamp(a); } fn(); for (const c of cs) c.restore(); }
  function vnShadow(T, x, y, w, h, r, o = {}) {
    T.save(); T.shadowColor = `rgba(0,0,0,${o.sh ?? 0.42})`; T.shadowBlur = o.blur ?? 44; T.shadowOffsetY = o.off ?? 24; fillRR(T, x, y, w, h, r, '#FFFFFF'); T.restore();
    fillRR(T, x, y, w, h, r, '#FFFFFF');
  }
  function vnGlow(T, x, y, r, a) {
    if (a <= 0.003) return;
    const g = T.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,0,0,${Math.min(1, a)})`); g.addColorStop(0.55, `rgba(255,0,0,${Math.min(1, a) * 0.3})`); g.addColorStop(1, 'rgba(255,0,0,0)');
    T.fillStyle = g; T.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const bez = (a, c, b, u) => [(1 - u) * (1 - u) * a[0] + 2 * (1 - u) * u * c[0] + u * u * b[0], (1 - u) * (1 - u) * a[1] + 2 * (1 - u) * u * c[1] + u * u * b[1]];
  function vnStar(ctx, x, y, r, fill) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r2 = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * r2, y + Math.sin(a) * r2); }
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  }
  function vnIcon(K, s) {                               // the real plugin icon (repo assets/placeholder_icon.png), centred
    const im = IMG.vwnam_icon;
    if (im && im.naturalWidth) K.drawImage(im, -s / 2, -s / 2, s, s);
    else fillRR(K, -s / 2, -s / 2, s, s, s * 0.22, '#152B25');
  }

  // ── the page "camera" inside the window: crop = { cx, cy, w, h } in page px ──
  const CR = {
    wide: { cx: 1280, cy: 1223, w: 2560 },
    name: { cx: 300, cy: 420, w: 560 },
    star: { cx: 2389, cy: 420, w: 560 },
    read: { cx: 600, cy: PAGE2 + 1488, w: 1000 },
  };
  const lerpCr = (a, b, u, bulge = 0) => ({ cx: lerp(a.cx, b.cx, u), cy: lerp(a.cy, b.cy, u), w: Math.exp(lerp(Math.log(a.w), Math.log(b.w), u)) + bulge * Math.sin(Math.PI * u) });
  function cropAt0(t) {
    if (t < PUSH0) return CR.wide;
    if (t < PUSH1) return lerpCr(CR.wide, CR.name, E.inOutQuint(inv(PUSH0, PUSH1, t)));
    const nm = { cx: CR.name.cx + 6, cy: CR.name.cy, w: CR.name.w * 0.97 }, sr = { cx: CR.star.cx, cy: CR.star.cy, w: CR.star.w * 0.97 };
    if (t < WHIP0) return lerpCr(CR.name, nm, inv(PUSH1, WHIP0, t));                               // slow living push
    if (t < WHIP1) return lerpCr(nm, CR.star, E.inOutQuint(inv(WHIP0, WHIP1, t)), 120);
    if (t < SCR0) return lerpCr(CR.star, sr, inv(WHIP1, SCR0, t));
    if (t < SCR1) return lerpCr(sr, CR.read, E.inOutCubic(inv(SCR0, SCR1, t)), 1500);
    const u = E.outCubic(inv(SCR1, 7.1, t));                                                       // slow push toward the circled words
    return { cx: lerp(CR.read.cx, 617, u * 0.15), cy: lerp(CR.read.cy, PAGE2 + 1530, u), w: lerp(CR.read.w, 940, u) };
  }
  function cropAt(t) { const c = Object.assign({}, cropAt0(t)); c.h = c.w * bhAt(t) / WW; return c; }
  // page point → window-body local point
  const toLocal = (c, px, py) => { const k = WW / c.w; return [(px - (c.cx - c.w / 2)) * k, (py - (c.cy - c.h / 2)) * k]; };
  function drawPage(K, c, a = 1) {
    const k = WW / c.w, ox = -(c.cx - c.w / 2) * k, oy = -(c.cy - c.h / 2) * k, ok = im => im && im.naturalWidth;
    K.save(); K.globalAlpha *= a;
    if (ok(IMG.gh_light)) K.drawImage(IMG.gh_light, ox, oy, 2560 * k, 1800 * k);
    if (ok(IMG.gh_readme)) K.drawImage(IMG.gh_readme, ox, oy + PAGE2 * k, 2560 * k, 1800 * k);
    // the page continues past the screenshot's right edge: stretch its last columns so there is no seam
    if (c.cx + c.w / 2 > 2560 && ok(IMG.gh_light)) K.drawImage(IMG.gh_light, 2554, 0, 6, 1800, ox + 2559 * k, oy, 700 * k, 1800 * k);
    K.restore();
  }

  // ── the browser window (local coords: chrome bar 0..BAR, body BAR..BAR+BH) ──
  function windowCard(T, K, t) {
    const BH = bhAt(t);
    vnShadow(T, 0, 0, WW, BAR + BH, 26, { sh: 0.44, blur: 48, off: 26 });
    fillRR(K, 0, 0, WW, BAR + BH, 26, '#FFFFFF');
    K.save(); rr(K, 0, 0, WW, BAR + 20, 26); K.clip(); K.fillStyle = '#F1EFEA'; K.fillRect(0, 0, WW, BAR); K.restore();
    [0, 1, 2].forEach(i => circle(K, 34 + i * 30, BAR / 2, 9, i === 0 ? C.red : '#FFFFFF', C.ink, 2.5));
    fillRR(K, 140, 13, WW - 280, BAR - 26, (BAR - 26) / 2, '#FFFFFF'); strokeRR(K, 140, 13, WW - 280, BAR - 26, (BAR - 26) / 2, HAIR, 2);
    text(K, 'github.com/owner/learn-mode', WW / 2, BAR / 2 + 8, Object.assign({ color: C.ink }, MONO(23, 500)));
    // body: the real page, with motion ghosts while the page "camera" travels
    const c = cropAt(t), cp = cropAt(t - 0.025), k = WW / c.w;
    const vx = (c.cx - cp.cx) * k, vy = (c.cy - cp.cy) * k, sp = Math.hypot(vx, vy);
    K.save(); rr(K, 0, BAR, WW, BH, 0); K.clip(); K.translate(0, BAR);
    K.fillStyle = '#FFFFFF'; K.fillRect(0, 0, WW, BH);
    if (sp > 14) for (let g = 3; g >= 1; g--) { K.save(); K.translate(-vx * g * 0.45, -vy * g * 0.45); drawPage(K, c, 0.16); K.restore(); }
    drawPage(K, c, sp > 14 ? 0.72 : 1);
    pageMarks(K, t, c);
    const sb = clamp(c.cy / (PAGE2 + 1800)), sbA = win(t, SCR0 - 0.05, SCR1 + 0.1, 0.1, 0.25);   // scrollbar: the page is scrolling
    if (sbA > 0) vnA([K], sbA, () => fillRR(K, WW - 16, 14 + sb * (BH - 120), 8, 92, 4, C.ink));
    K.restore();
    line(K, 0, BAR, WW, BAR, HAIR, 2, 'butt');
    strokeRR(K, 0, 0, WW, BAR + BH, 26, C.ink, 3.5);
  }

  // annotations pinned to the page (they move with the crop), body-local coords
  function pageMarks(K, t, c) {
    const k = WW / c.w;
    // marker underline under "learn-mode" (title ink spans page x 129..305, y 395..425)
    const up = E.outCubic(clamp((t - UL0) / (UL1 - UL0)));
    if (up > 0 && t < SCR1) {
      const [x0, y0] = toLocal(c, 122, 446), [x1] = toLocal(c, 318, 446);
      const path = cx => { cx.beginPath(); for (let i = 0; i <= 24; i++) { const u = i / 24; cx.lineTo(lerp(x0, x1, u), y0 + Math.sin(u * 7) * 2.5 * k + u * 4 * k); } };
      strokeP(K, path, (x1 - x0) * 1.05, up, C.red, 7 * k);
      burst(K, x1 + 8 * k, y0 - 26 * k, t - UL1 + 0.04, { n: 8, r0: 16 * k, r1: 46 * k, color: C.red, lw: 3.5 * k, dur: 0.28, rot: -0.4 });
    }
    // highlighter + loop around "Plugin Directory" (README ink x 466..769, y 1707..1737 + PAGE2)
    const hp = E.inOutCubic(clamp((t - HI0) / (HI1 - HI0)));
    if (hp > 0) {
      const [hx0, hy0] = toLocal(c, 460, PAGE2 + 1700), [hx1, hy1] = toLocal(c, 776, PAGE2 + 1744);
      K.save(); K.globalCompositeOperation = 'multiply'; K.globalAlpha = 0.34;
      fillRR(K, hx0, hy0, (hx1 - hx0) * hp, hy1 - hy0, 6, C.red); K.restore();
    }
    const lp = clamp((t - LOOP0) / (LOOP1 - LOOP0));
    if (lp > 0) {
      const [ex, ey] = toLocal(c, 618, PAGE2 + 1722), rx = 190 * k, ry = 44 * k;
      const path = cx => { cx.beginPath(); for (let i = 0; i <= 80; i++) { const u = i / 80, a = -2.6 + u * TAU * 1.12, wob = 1 + 0.035 * Math.sin(u * 9); cx.lineTo(ex + Math.cos(a) * rx * wob * (1 + 0.05 * u), ey + Math.sin(a) * ry * wob - 4 * k * u); } };
      strokeP(K, path, TAU * rx * 1.25, E.inOutCubic(lp), C.red, 6);
    }
  }

  // the Star button lifts off the page (real pixels), body-local coords
  function liftedStar(T, K, t, c) {
    const up = pop(t - LIFT, 2.6, 0.5), dn = E.inCubic(clamp((t - DROP) / 0.12));
    const L = clamp(up) * (1 - dn); if (L <= 0.01) return;
    const k = WW / c.w, [bx, by] = toLocal(c, 2389, 412), s = 1 + 0.42 * up * (1 - dn);
    const w = 214 * k, h = 62 * k;
    X([T, K], bx, by - 26 * L, s, -3 * L, () => {
      T.save(); T.shadowColor = `rgba(0,0,0,${0.5 * L})`; T.shadowBlur = 26; T.shadowOffsetY = 18 * L; fillRR(T, -w / 2, -h / 2, w, h, 12, '#FFFFFF'); T.restore();
      K.save(); rr(K, -w / 2, -h / 2, w, h, 12 * k); K.clip(); K.fillStyle = '#FFFFFF'; K.fillRect(-w / 2, -h / 2, w, h);
      if (IMG.gh_light && IMG.gh_light.naturalWidth) K.drawImage(IMG.gh_light, 2282, 381, 214, 62, -w / 2, -h / 2, w, h);
      K.restore();
      strokeRR(K, -w / 2 - 6, -h / 2 - 6, w + 12, h + 12, 16, C.red, 4.5);
    });
    const d = t - LIFT - 0.06;                          // sparkles from the star icon
    if (d > 0 && d < 0.5) {
      const sx = bx - 74 * k * s, sy = by - 26 * L;
      for (let i = 0; i < 7; i++) {
        const a = -Math.PI * (0.15 + 0.7 * i / 6) - 0.2, r = 40 + 170 * E.outCubic(d / 0.5) * (0.7 + 0.3 * hash(i + 3));
        vnA([K], 1 - d / 0.5, () => vnStar(K, sx + Math.cos(a) * r, sy + Math.sin(a) * r, 15 * (1 - d / 0.5 * 0.5), i % 2 ? C.red : C.ink));
      }
    }
  }

  // ── terminal (local coords 0..TW, 0..TH) ──
  const TFG = '#EDEBE6', TRED = '#FF6A4D', TDIM = '#8A8F98';
  const ICON_L = [30 + 22, 208];                        // icon centre in terminal-local coords
  function terminal(T, K, t, iconHere = true) {
    vnShadow(T, 0, 0, TW, TH, 24, { sh: 0.48, blur: 44, off: 24 });
    fillRR(K, 0, 0, TW, TH, 24, '#15161A');
    text(K, '// claude code', 30, 44, Object.assign({ color: TDIM, align: 'left' }, MONO(23, 500)));
    line(K, 30, 64, TW - 30, 64, 'rgba(255,255,255,0.1)', 2, 'butt');
    // directory tag
    const pp = pop(t - PILL, 3, 0.45);
    if (pp > 0.01) {
      const f = MONO(25, 700), str = 'Plugin Directory', pw = measure(K, str, f) + 36;
      X([K], TW - 24 - pw / 2, 36, pp, -3 * (1 - clamp(pp)), () => {
        fillRR(K, -pw / 2, -22, pw, 44, 22, C.red);
        text(K, str, 0, 9, Object.assign({ color: '#FFFFFF' }, f));
      });
      burst(K, TW - 24 - pw - 14, 36, t - PILL - 0.06, { n: 8, r0: 18, r1: 52, color: TRED, lw: 4, dur: 0.24, rot: 0.3 });
    }
    // typing
    const f = MONO(32, 500), x0 = 30 + CW * 2;
    text(K, '>', 30, 116, Object.assign({ color: TRED, align: 'left' }, MONO(32, 700)));
    const d1 = (TY2 - TY1 - 0.02) / L1.length, full2 = L2a + L2b, d2 = (TY_E - TY2) / full2.length;
    const n1 = Math.min(L1.length, Math.max(0, Math.floor((t - TY1) / d1) + 1)), n2 = Math.min(full2.length, Math.max(0, Math.floor((t - TY2) / d2) + 1));
    const glyph = (ch, i, row, t0, col) => {
      const rise = (1 - E.outCubic(clamp((t - t0) / 0.07))) * 10;
      text(K, ch, x0 + i * CW, (row ? 164 : 116) + rise, Object.assign({ color: col, align: 'left' }, f));
    };
    if (t >= TY1) for (let i = 0; i < n1; i++) glyph(L1[i], i, 0, TY1 + i * d1, TFG);
    if (t >= TY2) for (let i = 0; i < n2; i++) glyph(full2[i], i, 1, TY2 + i * d2, i < L2a.length ? TFG : TRED);
    const ulp = E.outCubic(clamp((t - LINK1 + 0.02) / 0.14));   // underline on the directory part once typed
    if (ulp > 0) line(K, x0 + L2a.length * CW, 176, x0 + L2a.length * CW + L2b.length * CW * ulp, 176, TRED, 3, 'butt');
    // cursor
    const cr = t >= TY2 ? [x0 + n2 * CW, 164] : [x0 + (t >= TY1 ? n1 : 0) * CW, 116];
    const enterFlash = t >= ENTER ? clamp(1 - (t - ENTER) / 0.12) : 0;
    const blinkOn = t < TY_E + 0.02 || Math.floor((t - TY_E) * 7) % 2 === 0;
    if (t < OUTL && blinkOn) fillRR(K, cr[0] + 2, cr[1] - 28, CW * 0.62, 34, 3, enterFlash > 0 ? TRED : TFG);
    if (enterFlash > 0) vnA([K], enterFlash, () => strokeRR(K, 14, 78, TW - 28, 108, 14, TRED, 3));
    // output: installed
    const op = pop(t - OUTL, 3, 0.5);
    if (op > 0.01) {
      const oy = 222, ic = 44;
      if (iconHere) X([K], ICON_L[0], ICON_L[1], op, 0, () => vnIcon(K, ic));
      vnA([K], clamp(op * 2), () => {
        const tx2 = 30 + ic + 18 + (1 - clamp(op)) * 30;
        circle(K, tx2 + 16, oy - 12, 16, C.red); check(K, tx2 + 16, oy - 11, 18, clamp((t - OUTL - 0.04) / 0.12), '#FFFFFF', 4);
        text(K, 'Installed', tx2 + 44, oy, Object.assign({ color: TFG, align: 'left' }, MONO(30, 700)));
        text(K, 'learn-mode', tx2 + 44 + measure(K, 'Installed ', MONO(30, 700)), oy, Object.assign({ color: TRED, align: 'left' }, MONO(30, 700)));
      });
    }
  }
  const termCharX = i => TX + 30 + 2 * CW + i * CW;

  // ── poses ──
  function winPose(t) {
    const p = pop(t - W_IN, 1.9, 0.8);                 // near-critical spring: lands without overshooting into the headline
    let x = WX + (1 - p) * 300, y = wyAt(t) + (1 - p) * 1750, s = lerp(0.82, 1, clamp(p)), r = (1 - p) * 12;
    const sb = 1 - 0.06 * pop(t - T_IN - 0.04, 2.2, 0.6);   // terminal arrives → window recedes a step (scaled about its bottom edge)
    s *= 1 + 0.012 * ring(t - SCR1 + 0.03, 3, 8);
    const e = clamp((t - EX0) / 0.18);
    if (e > 0) { const u = E.inBack(e); x -= u * 1350; r -= 8 * E.inCubic(e); y += 30 * u; }
    return { x, y, s, sb, r, on: e < 1 };
  }
  function termPose(t) {
    const p = inAt(t, T_IN, 2.4, 0.7);
    const s = 1 + 0.03 * ring(t - ENTER, 4, 10);
    let x = TX, y = TY + (1 - p) * 760, r = (1 - p) * -4;
    const e = clamp((t - EX0 - 0.05) / 0.18);           // whips off after the window (its icon already lifted out)
    if (e > 0) { const u = E.inBack(e); x -= u * 1400; r += 6 * E.inCubic(e); y -= 20 * u; }
    return { x, y, r, s, on: p > 0.001 && e < 1 };
  }
  // window-local → scene (ignores the small rotation)
  const winToScene = (wp, t, lx, ly) => { const H2 = BAR + bhAt(t), S = wp.s * wp.sb; return [wp.x + WW / 2 + (lx - WW / 2) * S, wp.y + H2 + (ly - H2) * S]; };

  // ── camera: zoom z about a focus F, plus swings ──
  const CAM = Track({ z: 1, fx: 540, fy: 760 })
    .key(BEG, { z: 1, fx: 540, fy: 700 })
    .key(PUSH1 + 0.02, { z: 1.06, fx: 410, fy: 760 }, E.inOutCubic)
    .key(WHIP0, { z: 1.065, fx: 420, fy: 760 })
    .key(WHIP1 + 0.02, { z: 1.06, fx: 600, fy: 760 }, E.inOutCubic)
    .key(SCR0, { z: 1.065, fx: 610, fy: 760 })
    .key(SCR1 + 0.04, { z: 1.075, fx: 555, fy: 860 }, E.inOutCubic)
    .key(tAnth + 0.3, { z: 1.085, fx: 555, fy: 880 })
    .key(6.62, { z: 1.05, fx: 480, fy: 1090 }, E.inOutCubic)
    .key(EX0, { z: 1.055, fx: 470, fy: 1100 })
    .key(END - 0.04, { z: 1, fx: 540, fy: 960 }, E.inOutCubic);

  kick(tVW + 0.04, 0.45, 0.35);   // the one punch: "LearnMode" underline strikes

  // what the presenter points at (scene coords)
  const FOC = Track({ x: 520, y: 760 })
    .key(4.5, { x: 600, y: 900 })
    .key(4.86, { x: 500, y: 680 }, E.inOutCubic)           // window lands
    .key(5.06, { x: 410, y: 700 }, E.inOutCubic)           // the title
    .key(WHIP0 + 0.02, { x: 420, y: 705 })
    .key(WHIP1 + 0.02, { x: 540, y: 690 }, E.inOutCubic)   // the Star button
    .key(SCR0, { x: 540, y: 690 })
    .key(SCR1 + 0.02, { x: 540, y: 870 }, E.inOutCubic)    // the README line
    .key(6.3, { x: 550, y: 880 })
    .key(6.42, { x: 330, y: 1070 }, E.inOutCubic);         // the terminal (then follows the typing)
  function vnFocus(t) {
    if (t >= 6.42 && t < FLY0) {
      const x = Math.min(470, t < TY2 ? termCharX(clamp((t - TY1) / (TY2 - TY1)) * 15) : termCharX(clamp((t - TY2) / (TY_E - TY2)) * 36));   // keep the point readable (no near-vertical arm)
      const y = t < TY2 ? TY + 100 : t < OUTL ? TY + 150 : TY + 205;
      const fx = t < OUTL ? x : lerp(x, TX + 200, E.outCubic(clamp((t - OUTL) / 0.12)));
      const k = clamp((t - 6.42) / 0.1);
      return { x: lerp(330, fx, k), y: lerp(1070, y, k) };
    }
    if (t >= FLY0) { const k = E.inOutCubic(clamp((t - FLY0) / 0.12)); return { x: lerp(TX + 200, CARD_HDR[0] + 60, k), y: lerp(TY + 205, CARD_HDR[1] + 10, k) }; }
    return FOC.at(t);
  }

  SC.name = {
    label: '// 02 — LearnMode', bg: 'light',
    cam(t) {
      if (t < BEG || t >= END) return { x: 0, y: 0, z: 1, r: 0 };
      const k = CAM.at(t);
      const wu = inv(WHIP0, WHIP1 + 0.12, t), su = inv(SCR0, SCR1 + 0.1, t), inW = wu > 0 && wu < 1, inS = su > 0 && su < 1;
      const ox = (inW ? -26 * Math.sin(Math.PI * wu) : 0) + (t > WHIP1 + 0.1 ? 10 * ring(t - WHIP1 - 0.1, 3, 8) : 0);
      const oy = inS ? 22 * Math.sin(Math.PI * su) : 0;
      const z = k.z + (t > LOOP0 + 0.05 ? 0.022 * ring(t - LOOP0 - 0.05, 2.5, 7) : 0);
      return { x: (k.fx - 540) * (1 - z) + ox, y: (k.fy - 960) * (1 - z) + oy, z, r: inS ? 0.006 * Math.sin(Math.PI * su) : 0 };
    },
    draw(T, K, t) {
      // learning-mode card: bumps when the plugin icon lands on its header (decays fully before END)
      const bump = t >= FLY1 && t < END ? 0.05 * ring(t - FLY1, 4, 14) * clamp((END - 0.01 - t) / 0.04) : 0;
      if (!bump) learnCard(T, K, TC.x, TC.y, TC.s, { t });
      else { const cx = TC.x + TC_W / 2, cy = TC.y + TC_H / 2; X([T, K], cx, cy, 1 + bump, 0, () => learnCard(T, K, -TC_W / 2, -TC_H / 2, 1, { t })); }
      if (t < BEG || t >= END) return;

      // warm red glow behind the current focus (prints as orange dots)
      vnGlow(T, 420, 700, 520, 0.22 * win(t, tVW - 0.05, WHIP0, 0.08, 0.2));
      vnGlow(T, 560, 880, 520, 0.2 * win(t, tAnth - 0.05, 6.5, 0.1, 0.25));

      const wp = winPose(t), tp = termPose(t);
      if (wp.on) { const H2 = BAR + bhAt(t); X([T, K], wp.x + WW / 2, wp.y + H2, wp.s * wp.sb, wp.r, () => {
        T.translate(-WW / 2, -H2); K.translate(-WW / 2, -H2);
        windowCard(T, K, t);
        if (t > LIFT - 0.02 && t < DROP + 0.14) { K.save(); T.save(); T.translate(0, BAR); K.translate(0, BAR); liftedStar(T, K, t, cropAt(t)); K.restore(); T.restore(); }
      }); }
      if (tp.on) X([T, K], tp.x + TW / 2, tp.y + TH / 2, tp.s, tp.r, () => { T.translate(-TW / 2, -TH / 2); K.translate(-TW / 2, -TH / 2); terminal(T, K, t, t < FLY0); });

      // dashed leader: the circled README words ↔ the typed "@plugin-directory"
      const lk = E.inOutCubic(clamp((t - LINK0) / (LINK1 - LINK0))), la = 1 - clamp((t - EX0) / 0.08);
      if (lk > 0 && la > 0) {
        const c = cropAt(t), [ex, ey] = toLocal(c, 618, PAGE2 + 1722), k = WW / c.w;
        const a = winToScene(wp, t, ex + 60, BAR + ey + 46 * k), b = [termCharX(L2a.length + 13), tp.y + 132], cc = [a[0] + 120, (a[1] + b[1]) / 2];
        const path = cx => { cx.beginPath(); for (let i = 0; i <= 30; i++) { const [x, y] = bez(a, cc, b, i / 30 * lk); cx.lineTo(x, y); } };
        vnA([K], la, () => {
          K.save(); K.setLineDash([12, 10]); K.lineDashOffset = -t * 120; K.lineWidth = 4; K.strokeStyle = C.red; K.lineCap = 'round'; path(K); K.stroke(); K.restore();
          if (lk > 0.95) { const [x, y] = b; K.beginPath(); K.moveTo(x - 12, y - 16); K.lineTo(x, y); K.lineTo(x + 12, y - 16); K.lineWidth = 4; K.strokeStyle = C.red; K.lineJoin = 'round'; K.stroke(); }
          circle(K, a[0], a[1], 7 * clamp(lk * 4), C.red);
        });
      }

      // the plugin icon drops into the learning-mode card
      if (t >= FLY0 && t < FLY1 + 0.02) {
        const k = clamp((t - FLY0) / (FLY1 - FLY0)), u = E.inOutCubic(k);
        const a = [TX + ICON_L[0], TY + ICON_L[1]], b = CARD_HDR, cc = [40, 1130];
        const [x, y] = bez(a, cc, b, u), s = lerp(1.5, 0.6, E.inCubic(k)) * (1 + 0.3 * Math.sin(Math.PI * k));
        if (k > 0.1) vnA([K], 0.4 * (1 - k), () => { const [px, py] = bez(a, cc, b, Math.max(0, u - 0.18)); line(K, px, py, x, y, C.red, 12 * s); });
        X([T, K], x, y, s, -180 * (1 - u), () => { fillRR(T, -22, -16, 48, 48, 11, C.k60); vnIcon(K, 48); });
      }
      if (t >= FLY1 && t < END) {
        burst(K, CARD_HDR[0], CARD_HDR[1], t - FLY1, { n: 10, r0: 30, r1: 90, color: C.red, lw: 5, dur: 0.09 });
        vnA([K], 1 - (t - FLY1) / (END - FLY1), () => strokeRR(K, TC.x + 12, TC.y + 10, TC_W - 24, 46, 12, C.red, 3));
      }
    },
    guy(t) {
      const d = PRESENTER_DOCK, st = { x: d.x, y: d.y, s: d.s };
      if (t < S0 + 0.001 || t >= END + 0.1) return st;
      // The presenter's left index re-aims at whatever is the focus (shoulder at dock ≈ 661, 1779)
      const f = vnFocus(t), SX = d.x - 226 * d.s, SY = d.y - 264 * d.s;
      const ang = clamp(Math.atan2(f.y - SY, -(f.x - SX)) / D2R, -86, -16);
      const pin = win(t, S0 + 0.02, END - 0.03, 0.14, 0.12);
      const o = Object.assign(st, arms(t, [[4.56, 5.02, 'R', 'hold'], [5.5, 5.8, 'R', 'thumb'], [ENTER - 0.02, 7.2, 'R', 'fist']]), { armL: 'point', armLp: pin, pointAng: ang });
      const lx = clamp((f.x - 842) / 520, -1, 1) * 0.85, ly = clamp((f.y - 1430) / 700, -1, 1) * 0.8;
      Object.assign(o, expr(t, [
        [4.56, 5.06, { smile: 0.35, brow: 0.5 }],
        [tVW - 0.04, 5.45, { smile: 0.75, brow: 0.7 }],
        [5.46, 5.72, { shock: 0.3, brow: 0.95, smile: 0.2 }],
        [tAnth - 0.06, 6.5, { brow: 0.85, browTilt: 0.45, smile: 0.45 }],
        [6.5, 6.9, { smile: 0.3, brow: 0.25 }],
        [ENTER - 0.02, 7.25, { smile: 0.95, brow: 0.6 }],
        [7.14, 7.3, { wink: 1 }]]));
      o.lookX = lx * pin; o.lookY = ly * pin;
      o.headTurn = 0.22 * lx * pin;
      o.headTilt = (t > tVW ? 6 * ring(t - tVW, 2, 5) : 0) - 4 * win(t, tAnth - 0.05, 6.45, 0.12, 0.2) + 4 * win(t, ENTER, 7.25, 0.1, 0.15);
      return o;
    },
  };
})();
