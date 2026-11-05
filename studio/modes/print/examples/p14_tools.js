// ═════════════ 04 · BROWSER TOOLS MCP  [wi(105)−0.1 ≈ 29.91 → wi(144)−0.08 ≈ 42.04] · print look · video B "plug it in" ═════════════
// NOTE: reference code from a real reel. Word indices (wi(n)) refer to that reel's script; re-cue on your own words.json.
// Through-object left in: powerStrip() (kit) and the ccWindow terminal.
// assets not included: IMG.tools_av (avatar; lookups no-op when missing).
// owner/browser-tools-mcp (48.2K ★, Apache-2.0, v1.4.0, 98,431 installs, published by Acme Inc.). Beats:
//   dock → centre stage → the browser-tools plug swings in, hovers, SLAMS in on PLUGIN_DONE[3] → 4/4: a surge runs the whole strip
//   → a pulse climbs the cable and powers up a real browser window (radial power-on from the cable entry) showing the repo's README
//   (typed H1, 48.2K ★, Acme Inc., 98,431 installs, the real install command) → "eyes on a real browser": the tab navigates to
//   the user's app, a lens-eye powers on over the page and docks into the toolbar → Inspector slides up and each capability lights
//   on its word: console errors (red → "0 errors"), network requests (Claude's cursor clicks, waterfall), screenshots (shutter,
//   thumbnail), performance traces (flame chart) → "instead of coding blindfolded": the power dims, a blindfold wraps the eye,
//   then drops away → the window powers down into its cable, back to the dock (4/4).
// Uses BB (shared helpers, defined in p09_crew.js). File-local names are prefixed bb.

SC.tools = (() => {
  const S0 = wi(105) - 0.1, S1 = wi(144) - 0.08;       // 29.91 → 42.04
  const I = 3, TD = PLUGIN_DONE[I];                    // 31.52 slam (PLUGINS 4/4)
  const T_ON = TD + 0.26, T_OFF = S1 - 0.38;
  const T_GOOG = wi(115), T_INST = wi(116) + 0.02;
  const T_NAV = wi(118) - 0.02, T_PAGEB = T_NAV + 0.3;
  const T_EYE = wi(121) - 0.14, T_REAL = wi(124), T_EYEDOCK = wi(126) - 0.26;
  const T_DT = wi(126) - 0.04, T_CON = wi(129) - 0.14;
  const T_ERR = [wi(129) + 0.12, wi(130) - 0.04], T_FIX = wi(131) - 0.26;
  const T_CUR = wi(131) - 0.1, T_CLICK = wi(132) - 0.2, T_NET = wi(132) - 0.12, T_SEL = wi(133);
  const T_BRK = wi(134) - 0.06, T_SHOT = wi(135) + 0.02, T_THUMBOUT = wi(137) - 0.16;
  const T_PERF = wi(137) - 0.12, T_REC = wi(137) - 0.04, T_FLAME = wi(138), T_TRACE = wi(139);
  const T_BLIND = wi(140) - 0.06, T_WRAP = wi(141) - 0.1, T_DROP = wi(143) - 0.08;
  kick(TD, 0.75, 0.6);

  // ── strip ──
  function stripG(t) {
    const up = pop(t - (S0 + 0.02), 1.5, 0.62), down = E.inOutCubic(P(t, TD + 0.3, 0.52));
    const g = BB.mixG(BB.DOCK, BB.HERO, up * (1 - down));
    const im = BB.impact(t, TD); g.y += im.dy * g.s; g.sq = im.sq;
    return g;
  }
  const pOf = t => { const p = BB.defP(t); if (t < TD) p[I] = 0; return p; };

  // ── Browser window geometry ──
  const WIN = { x: 60, y: 436, w: 960, h: 860, r: 20 };
  const TABH = 54, BARH = 60, PAGE_Y = WIN.y + TABH + BARH, DT_H = 452;
  const EN = (() => { const [x] = BB.cableAtY(BB.DOCK, I, WIN.y + WIN.h); return { x, y: WIN.y + WIN.h }; })();
  let HIT = null;
  const hitPt = () => HIT || (HIT = BB.hit(stripG(T_ON), I, 740));
  const onP = t => t < T_OFF ? E.outCubic(P(t, T_ON, 0.46)) : 1 - E.inCubic(P(t, T_OFF, 0.3));
  const dtOpen = t => pop(t - T_DT, 2.2, 0.74);
  const dtTop = t => WIN.y + WIN.h - DT_H * dtOpen(t);
  const G = { ink: '#202124', icon: '#5F6368', dim: '#80868B', frame: '#E4E1DA', omni: '#F1EFEA', line: '#D9D5CC', dt: '#F5F3EE' };
  const gf = (size, o = {}) => Object.assign({ font: F.grot, weight: 500, size, color: G.ink, align: 'left' }, o);
  const mf = (size, o = {}) => Object.assign({ font: F.mono, weight: 500, size, color: G.ink, align: 'left' }, o);

  // small line icons
  function icoArrow(K, x, y, dir, col) { K.save(); K.translate(x, y); K.scale(dir, 1); K.strokeStyle = col; K.lineWidth = 3.2; K.lineCap = 'round'; K.lineJoin = 'round'; K.beginPath(); K.moveTo(9, 0); K.lineTo(-9, 0); K.moveTo(-2, -7); K.lineTo(-9, 0); K.lineTo(-2, 7); K.stroke(); K.restore(); }
  function icoReload(K, x, y, col, spin = 0) { K.save(); K.translate(x, y); K.rotate(spin); K.strokeStyle = col; K.lineWidth = 3.2; K.lineCap = 'round'; K.beginPath(); K.arc(0, 0, 9, -0.4, 4.6); K.stroke(); K.fillStyle = col; K.beginPath(); K.moveTo(10, -9); K.lineTo(10, 0); K.lineTo(2, -4); K.closePath(); K.fill(); K.restore(); }
  function icoInspect(K, x, y, col) { K.save(); K.strokeStyle = col; K.lineWidth = 2.6; K.lineJoin = 'round'; K.setLineDash([4, 3]); K.strokeRect(x - 10, y - 10, 18, 18); K.setLineDash([]); K.fillStyle = col; K.beginPath(); K.moveTo(x - 1, y - 1); K.lineTo(x + 11, y + 4); K.lineTo(x + 5, y + 6); K.lineTo(x + 3, y + 12); K.closePath(); K.fill(); K.restore(); }
  function icoDevice(K, x, y, col) { strokeRR(K, x - 11, y - 9, 14, 20, 3, col, 2.6); strokeRR(K, x + 1, y - 4, 11, 15, 2, col, 2.6); }
  function icoGear(K, x, y, col) { K.save(); K.translate(x, y); K.strokeStyle = col; K.lineWidth = 2.6; for (let k = 0; k < 8; k++) { K.rotate(TAU / 8); K.beginPath(); K.moveTo(0, -8); K.lineTo(0, -11.5); K.stroke(); } circle(K, 0, 0, 7.5, null, col, 2.6); circle(K, 0, 0, 2.5, col); K.restore(); }
  function icoDots(K, x, y, col) { [-7, 0, 7].forEach(d => circle(K, x, y + d, 2.4, col)); }
  function icoPuzzle(K, x, y, col) { K.save(); K.translate(x, y); K.fillStyle = col; rr(K, -9, -6, 16, 15, 2); K.fill(); circle(K, -1, -8, 3.6, col); circle(K, 8, 1.5, 3.6, col); K.restore(); }

  // ── lens-eye (Claude's "eyes on a real browser"): o = { open 0..1, look −1..1, power 0..1, s } ──
  function eye(T, K, x, y, w, o = {}) {
    const open = clamp(o.open ?? 1), pw = o.power ?? 1, h = w * 0.5, look = o.look || 0;
    if (pw > 0) BB.kdots(K, x, y, w * 0.72, w * 0.5, 0.6 * pw);
    T.save(); T.shadowColor = 'rgba(0,0,0,0.35)'; T.shadowBlur = w * 0.08; T.shadowOffsetY = w * 0.04;
    T.beginPath(); T.moveTo(x - w / 2, y); T.quadraticCurveTo(x, y - h * 1.05 * Math.max(0.1, open), x + w / 2, y); T.quadraticCurveTo(x, y + h * 1.05 * Math.max(0.1, open), x - w / 2, y); T.fillStyle = '#FFFFFF'; T.fill(); T.restore();
    const lid = (ctx, k) => { ctx.beginPath(); ctx.moveTo(x - w / 2, y); ctx.quadraticCurveTo(x, y - h * 1.05 * k, x + w / 2, y); ctx.quadraticCurveTo(x, y + h * 1.05 * k, x - w / 2, y); ctx.closePath(); };
    lid(K, Math.max(0.02, open)); K.fillStyle = '#FFFFFF'; K.fill();
    K.save(); lid(K, Math.max(0.02, open)); K.clip();
    const ir = w * 0.2, ix = x + look * w * 0.16;
    circle(K, ix, y, ir, '#15161A');
    circle(K, ix, y, ir, null, C.red, w * 0.028);
    circle(K, ix, y, ir * 0.72, null, 'rgba(255,255,255,0.14)', w * 0.008);
    circle(K, ix, y, ir * 0.5, null, 'rgba(255,255,255,0.1)', w * 0.008);
    const pr = ir * lerp(0.2, 0.34, pw);
    
    circle(K, ix, y, pr, pw > 0.2 ? C.red : '#3A3B41');
    circle(K, ix - ir * 0.34, y - ir * 0.36, ir * 0.14, '#FFFFFF');
    K.restore();
    // upper lid line + outline
    K.save(); K.lineWidth = Math.max(2.5, w * 0.022); K.strokeStyle = C.ink; K.lineJoin = 'round'; K.lineCap = 'round';
    K.beginPath(); K.moveTo(x - w / 2, y); K.quadraticCurveTo(x, y - h * 1.05 * Math.max(0.02, open), x + w / 2, y); K.stroke();
    K.beginPath(); K.moveTo(x - w / 2, y); K.quadraticCurveTo(x, y + h * 1.05 * Math.max(0.02, open), x + w / 2, y); K.stroke();
    K.restore();
  }
  const EYE_BIG = { x: WIN.x + WIN.w / 2, y: 880, w: 380 };
  const EYE_DOCK = { x: WIN.x + WIN.w - 138, y: WIN.y + TABH + BARH / 2, w: 40 };
  function eyeState(t) {
    if (t < T_EYE) return null;
    let x, y, w;
    const dk = pop(t - T_EYEDOCK, 2.3, 0.7), back = pop(t - T_BLIND, 2.2, 0.7), sd = clamp(back);
    const k = dk * (1 - clamp(back));
    x = lerp(EYE_BIG.x, EYE_DOCK.x, k); y = lerp(EYE_BIG.y, EYE_DOCK.y, k) - Math.sin(Math.PI * clamp(dk)) * 40 * (1 - sd); w = lerp(EYE_BIG.w, EYE_DOCK.w, k);
    const app = pop(t - T_EYE, 2.6, 0.55);
    let open = E.outCubic(P(t, T_EYE + 0.1, 0.24));
    open *= 1 - Math.max(0, Math.sin(Math.PI * clamp((t - (T_REAL + 0.12)) / 0.16)));          // blink on "real"
    const wrapped = t > T_WRAP + 0.12 && t < T_DROP + 0.04;
    if (t > T_BLIND - 0.05 && t < T_DROP + 0.05) open = Math.min(open, 1 - E.inOutCubic(P(t, T_WRAP, 0.16)));
    if (t >= T_DROP) open = E.outBack(P(t, T_DROP + 0.04, 0.22));
    const look = Math.sin((t - T_EYE) * 5) * 0.55 * win(t, T_EYE + 0.3, T_EYEDOCK, 0.1, 0.1) + Math.sin(t * 3) * 0.3 * win(t, T_DROP + 0.2, S1, 0.1, 0.1);
    const pw = t < T_BLIND ? E.outCubic(P(t, T_EYE + 0.14, 0.3)) : t < T_DROP ? 1 - E.inOutCubic(P(t, T_BLIND, 0.2)) : E.outCubic(P(t, T_DROP + 0.04, 0.2));
    return { x, y, w, s: app, open, look, pw, wrapped };
  }

  // ── pages ──
  function pageA(T, K, t, x, y, w, h) {
    const x0 = x + 44;
    const hy = y + 58;
    if (IMG.tools_av && IMG.tools_av.naturalWidth) { K.save(); K.beginPath(); K.arc(x0 + 26, hy, 26, 0, TAU); K.clip(); coverImg(K, IMG.tools_av, x0, hy - 26, 52, 52, { fy: 0.5 }); K.restore(); }
    circle(K, x0 + 26, hy, 26, null, 'rgba(17,17,17,0.12)', 2);
    const f1 = gf(30, { color: '#6B6B6B' }), own = 'owner / ';
    text(K, own, x0 + 66, hy + 11, f1);
    text(K, 'browser-tools-mcp', x0 + 66 + measure(K, own, f1), hy + 11, gf(30, { weight: 700 }));
    const sp = E.outCubic(P(t, T_ON + 0.25, 1.05));
    BB.starPill(K, x + w - 40, hy, (52.7 * sp).toFixed(1) + 'K');
    const ty = y + 126;
    text(K, 'README', x0, ty, gf(24, { weight: 700 }));
    fillRR(K, x0 - 6, ty + 14, measure(K, 'README', gf(24, { weight: 700 })) + 12, 5, 2.5, '#FD8C73');
    text(K, 'Apache-2.0', x0 + 130, ty, gf(24, { color: '#6B6B6B' }));
    text(K, 'v1.4.0', x0 + 280, ty, gf(24, { color: '#6B6B6B' }));
    line(K, x, ty + 19, x + w, ty + 19, 'rgba(17,17,17,0.10)', 2, 'butt');
    const H1 = 'Browser Tools MCP', h1 = typedStr(H1, t, T_ON + 0.12, 34), hf = gf(58, { weight: 700, ls: -1.8 });
    text(K, h1, x0, y + 226, hf);
    if (h1.length < H1.length) caretAt(K, x0 + measure(K, h1, hf), y + 226, 54, t, C.ink);
    text(K, 'lets your coding agent … control and inspect', x0, y + 280, { font: F.serif, italic: true, weight: 400, size: 36, color: '#555', align: 'left' });
    text(K, 'a live browser.', x0, y + 322, { font: F.serif, italic: true, weight: 400, size: 36, color: '#555', align: 'left' });
    // publisher + installs chips (slapped on "Acme's" / "Browser Tools team")
    const cy = y + 386;
    const d1 = t - T_GOOG;
    if (d1 > 0) X([K], x0, cy, BB.slap(d1), 0, () => {
      const f = mf(22, { weight: 700 }), lab = 'Acme Inc.', cw = measure(K, lab, f) + 132;
      fillRR(K, 0, -24, cw, 48, 24, C.ink);
      text(K, 'npm', 20, 8, mf(20, { color: '#9A9CA3', weight: 700 }));
      text(K, lab, 76, 8, Object.assign({}, f, { color: '#FFFFFF' }));
      circle(K, cw - 26, 0, 11, C.red); iconCheck(K, cw - 25, 1, 12, clamp(d1 / 0.2), '#FFFFFF');
    });
    const d2 = t - T_INST;
    if (d2 > 0) X([K], x0 + 290, cy, BB.slap(d2), 0, () => {
      const n = Math.round(98431 * E.outCubic(clamp(d2 / 0.7))).toLocaleString('en-US');
      const f = mf(22, { weight: 700 }), cw = 360;
      fillRR(K, 0, -24, cw, 48, 24, '#FFFFFF'); strokeRR(K, 0, -24, cw, 48, 24, C.red, 3);
      text(K, n, 22, 8, Object.assign({}, f, { color: C.red }));
      text(K, 'installs · plugins.example.com', 22 + measure(K, '98,431', f) + 12, 7, mf(19, { color: G.dim }));
    });
    // the real install command in a README code block
    const by = y + 440;
    text(K, 'Getting started', x0, by + 8, gf(30, { weight: 700 }));
    fillRR(K, x0, by + 32, w - 88, 118, 14, '#F3F1EC'); strokeRR(K, x0, by + 32, w - 88, 118, 14, 'rgba(17,17,17,0.08)', 2);
    text(K, 'claude mcp add browser-tools --scope user', x0 + 24, by + 80, mf(25));
    text(K, '  npx browser-tools-mcp@latest', x0 + 24, by + 120, mf(25));
    text(K, 'What your agent can do', x0, by + 212, gf(30, { weight: 700 }));
    let cx = x0, rowN = 0;
    ['console messages', 'network requests', 'screenshots', 'performance traces'].forEach((c, k) => {
      const f = mf(21), cw = measure(K, c, f) + 30;
      if (cx + cw > x + w - 44) { cx = x0; rowN++; }
      const rowY = by + 240 + rowN * 54;
      fillRR(K, cx, rowY, cw, 42, 21, '#F3F1EC'); strokeRR(K, cx, rowY, cw, 42, 21, 'rgba(17,17,17,0.12)', 2);
      text(K, c, cx + 15, rowY + 28, f); cx += cw + 12;
    });
    strokeRR(K, x + w - 44 - 58, by + 50, 40, 40, 8, 'rgba(17,17,17,0.18)', 2);
    strokeRR(K, x + w - 44 - 50, by + 58, 18, 20, 3, G.icon, 2.4); strokeRR(K, x + w - 44 - 44, by + 64, 18, 20, 3, G.icon, 2.4);
  }
  // the user's app (my-app.example.com); fixed = 0 broken → 1 fixed
  function pageB(T, K, t, x, y, w, h, fixed, press = 0) {
    const x0 = x + 40;
    fillRR(K, x0, y + 26, 30, 30, 8, C.ink); fillRR(K, x0 + 9, y + 35, 12, 12, 3, C.red);
    text(K, 'my-app', x0 + 44, y + 51, gf(29, { weight: 700, ls: -0.8 }));
    [0, 1].forEach(k => fillRR(K, x + w - 330 + k * 96, y + 34, 70, 14, 7, '#E3E0D9'));
    strokeRR(K, x + w - 132, y + 22, 92, 38, 19, C.ink, 2.5); text(K, 'Cart', x + w - 86, y + 48, gf(21, { weight: 700, align: 'center' }));
    line(K, x, y + 80, x + w, y + 80, 'rgba(17,17,17,0.08)', 2, 'butt');
    // hero copy (skeleton) + Checkout button
    fillRR(K, x0, y + 106, 420, 30, 10, C.ink); fillRR(K, x0, y + 146, 300, 30, 10, C.ink);
    [0, 1].forEach(k => fillRR(K, x0, y + 196 + k * 22, k ? 290 : 380, 12, 6, '#DDD9D1'));
    X([K], x0 + 92, y + 262, 1 - press * 0.08, 0, () => { fillRR(K, -92, -26, 184, 52, 26, press > 0 ? C.red : C.ink); text(K, 'Checkout', 0, 8, gf(23, { weight: 700, color: '#FFFFFF', align: 'center' })); });
    // product tile: broken (red dashed, ✗) until Claude fixes it
    const px = x + w - 390, py = y + 100, pw = 350, ph = 186;
    if (fixed < 1) {
      K.save(); K.globalAlpha *= 1 - fixed; K.setLineDash([12, 9]); strokeRR(K, px, py, pw, ph, 18, C.red, 3); K.setLineDash([]);
      iconX(K, px + pw / 2, py + ph / 2 - 10, 34, 1, C.red);
      text(K, 'undefined', px + pw / 2, py + ph / 2 + 44, mf(21, { color: C.red, align: 'center' }));
      K.restore();
    }
    if (fixed > 0) {
      const s = pop(fixed * 0.5, 3, 0.5);
      X([T, K], px + pw / 2, py + ph / 2, s, 0, () => {
        const l = -pw / 2, tp = -ph / 2;
        fillRR(K, l, tp, pw, ph, 18, '#ECE9E3');
        K.save(); rr(K, l, tp, pw, ph, 18); K.clip(); BB.kdots(K, 30, -10, 190, 150, 0.55, '#8C8A85'); K.restore();
        fillRR(K, l + 18, ph / 2 - 58, 150, 40, 20, '#FFFFFF');
        fillRR(K, l + 38, ph / 2 - 43, 90, 10, 5, C.ink);
        circle(K, pw / 2 - 40, ph / 2 - 38, 20, C.red); iconCheck(K, pw / 2 - 39, ph / 2 - 37, 20, 1, '#FFFFFF');
      });
    }
    // below the fold: a product row (seen in the full-page screenshot)
    for (let k = 0; k < 3; k++) { const cx = x0 + k * 300; fillRR(K, cx, y + 360, 270, 170, 16, '#ECE9E3'); fillRR(K, cx, y + 548, 180, 14, 7, '#DDD9D1'); fillRR(K, cx, y + 572, 110, 14, 7, '#E8E5DE'); }
  }

  // ── Inspector ──
  const TABS = ['Elements', 'Console', 'Sources', 'Network', 'Performance'];
  const TABF = gf(22, { weight: 500 });
  let TABX = null;
  function tabX(K) { if (TABX) return TABX; let x = WIN.x + 96; TABX = TABS.map(n => { const w = measure(K, n, TABF) + 25; const o = { x, w }; x += w; return o; }); return TABX; }
  function activeTab(t) { return t < T_CON ? 0 : t < T_NET ? 1 : t < T_PERF ? 3 : 4; }
  function tabUnderline(K, t) {
    const X0 = tabX(K), seq = [[T_DT, 0], [T_CON, 1], [T_NET, 3], [T_PERF, 4]];
    let a = X0[0], k = 0; for (let j = 0; j < seq.length; j++) if (t >= seq[j][0]) k = j;
    const from = X0[seq[Math.max(0, k - 1)][1]], to = X0[seq[k][1]], m = k === 0 ? 1 : E.outBack(P(t, seq[k][0], 0.22));
    return { x: lerp(from.x, to.x, m), w: lerp(from.w, to.w, m) };
  }
  function inspector(T, K, t) {
    const top = dtTop(t), x = WIN.x, w = WIN.w, bottom = WIN.y + WIN.h;
    if (top >= bottom - 1) return;
    fillRR(K, x, top, w, bottom - top + 30, 0, '#FFFFFF');
    K.fillStyle = G.dt; K.fillRect(x, top, w, 46);
    line(K, x, top, x + w, top, G.line, 2.5, 'butt'); line(K, x, top + 46, x + w, top + 46, G.line, 2, 'butt');
    icoInspect(K, x + 30, top + 23, G.icon); icoDevice(K, x + 66, top + 23, G.icon);
    line(K, x + 88, top + 12, x + 88, top + 34, G.line, 2, 'butt');
    const X0 = tabX(K), at = activeTab(t);
    TABS.forEach((n, k) => text(K, n, X0[k].x + 12.5, top + 31, Object.assign({}, TABF, { color: k === at ? G.ink : G.dim, weight: k === at ? 700 : 500 })));
    const u = tabUnderline(K, t);
    fillRR(K, u.x + 6, top + 41, u.w - 12, 5, 2.5, C.red);
    // error badge → "0 errors"
    const rx = x + w - 30;
    icoDots(K, rx - 6, top + 23, G.icon); icoGear(K, rx - 42, top + 23, G.icon);
    const ea = clamp((t - T_ERR[0]) / 0.1), fx = E.outBack(P(t, T_FIX + 0.18, 0.24));
    if (ea > 0) {
      const lab = fx > 0.5 ? '0 errors' : 'errors', f = mf(20, { weight: 700 }), bw = measure(K, lab, f) + 48;
      X([K], rx - 62 - bw / 2, top + 23, fx > 0 && fx < 1 ? 1 + 0.12 * Math.sin(Math.PI * fx) : ea, 0, () => {
        fillRR(K, -bw / 2, -16, bw, 32, 16, fx > 0.5 ? '#FFFFFF' : C.red);
        if (fx > 0.5) { strokeRR(K, -bw / 2, -16, bw, 32, 16, C.ink, 2.5); iconCheck(K, -bw / 2 + 18, 1, 16, 1, C.ink); }
        else iconX(K, -bw / 2 + 18, 0, 11, 1, '#FFFFFF');
        text(K, lab, -bw / 2 + 34, 7, Object.assign({}, f, { color: fx > 0.5 ? C.ink : '#FFFFFF' }));
      });
    }
    K.save(); K.beginPath(); K.rect(x, top + 47, w, bottom - top - 47); K.clip();
    T.save(); T.beginPath(); T.rect(x, top + 47, w, bottom - top - 47); T.clip();
    const cy = top + 47;
    const sw = (t0, dur = 0.16) => E.outCubic(P(t, t0, dur));
    const pC = at === 1 ? 1 : 0, pN = at === 3 ? 1 : 0, pP = at === 4 ? 1 : 0;
    if (at === 0) elements(K, t, x, cy, w);
    if (pC) consolePane(T, K, t, x, cy, w, sw(T_CON));
    if (pN) networkPane(T, K, t, x, cy, w, sw(T_NET));
    if (pP) perfPane(T, K, t, x, cy, w, sw(T_PERF));
    T.restore(); K.restore();
  }
  function elements(K, t, x, y, w) {
    const rows = ['<!DOCTYPE html>', '<html lang="en">', '  <head>…</head>', '  <body>', '    <div id="root">…</div>', '  </body>'];
    rows.forEach((r, k) => text(K, r, x + 30, y + 40 + k * 34, mf(20, { color: k === 4 ? C.ink : G.dim })));
  }
  function row(K, x, y, w, h, kind) {
    if (kind === 'err') { K.fillStyle = accentA(0.08); K.fillRect(x, y, w, h); line(K, x, y, x + w, y, accentA(0.3), 1.5, 'butt'); line(K, x, y + h, x + w, y + h, accentA(0.3), 1.5, 'butt'); }
    else line(K, x, y + h, x + w, y + h, '#ECE9E2', 1.5, 'butt');
  }
  function consolePane(T, K, t, x, y, w, a) {
    BB.fade([K], a, () => {
      // console toolbar
      text(K, 'top ▾', x + 26, y + 30, mf(19, { color: G.dim }));
      strokeRR(K, x + 120, y + 11, 260, 28, 6, G.line, 2); text(K, 'Filter', x + 134, y + 31, gf(19, { color: '#B0ADA6' }));
      text(K, 'Default levels ▾', x + w - 30, y + 31, gf(19, { color: G.dim, align: 'right' }));
      line(K, x, y + 48, x + w, y + 48, '#ECE9E2', 1.5, 'butt');
      let ry = y + 50;
      const rh = 46, fix = P(t, T_FIX, 0.3);
      // info
      text(K, 'Navigated to my-app.example.com', x + 52, ry + 30, mf(20, { color: G.dim })); row(K, x, ry, w, rh, 'info'); ry += rh;
      const errs = [['Uncaught TypeError: Cannot read properties of undefined', 'app.js'], ['GET my-app.example.com/api/cart net::ERR_FAILED', 'cart.js']];
      errs.forEach(([msg, src], k) => {
        const age = t - T_ERR[k];
        if (age < 0) return;
        const collapse = E.inOutCubic(clamp((fix - k * 0.15) / 0.7)), hh = rh * (1 - collapse);
        if (hh < 1) return;
        K.save(); K.beginPath(); K.rect(x, ry, w, hh); K.clip();
        K.globalAlpha *= clamp(age / 0.08);
        const sl = (1 - E.outCubic(clamp(age / 0.2))) * 30;
        row(K, x, ry, w, rh, 'err');
        if (age < 0.4) { K.save(); K.globalAlpha *= 1 - age / 0.4; K.fillStyle = accentA(0.22); K.fillRect(x, ry, w, rh); K.restore(); }
        iconX(K, x + 28, ry + rh / 2, 13, 1, C.red);
        text(K, msg, x + 52 + sl, ry + 30, mf(20, { color: C.red }));
        text(K, src, x + w - 26, ry + 30, mf(19, { color: G.dim, align: 'right' }));
        // Claude's fix: a strike sweeps the row before it collapses
        const st = clamp((fix - k * 0.15) / 0.35);
        if (st > 0) line(K, x + 52, ry + 24, lerp(x + 52, x + w - 100, E.outCubic(st)), ry + 24, C.ink, 3, 'butt');
        K.restore();
        ry += hh;
      });
      if (fix > 0.6) {
        const d = t - (T_FIX + 0.2);
        K.save(); K.globalAlpha *= clamp(d / 0.12);
        circle(K, x + 28, ry + rh / 2, 11, C.ink); iconCheck(K, x + 29, ry + rh / 2 + 1, 12, 1, '#FFFFFF');
        text(K, 'fixed · 0 errors', x + 52, ry + 30, mf(20, { weight: 700 })); row(K, x, ry, w, rh, 'info');
        K.restore(); ry += rh;
      }
      text(K, '›', x + 24, ry + 32, mf(24, { color: '#1A73E8', weight: 700 }));
      caretAt(K, x + 46, ry + 30, 24, t, G.ink);
    });
  }
  const NET = [
    { n: 'my-app.example.com', ty: 'document', s: 0.0, d: 0.22 },
    { n: 'app.js', ty: 'script', s: 0.2, d: 0.26 },
    { n: 'styles.css', ty: 'stylesheet', s: 0.21, d: 0.14 },
    { n: 'api/cart', ty: 'fetch', s: 0.5, d: 0.3, hot: true },
    { n: 'hero.webp', ty: 'webp', s: 0.46, d: 0.34 },
    { n: 'inter.woff2', ty: 'font', s: 0.3, d: 0.18 },
  ];
  function networkPane(T, K, t, x, y, w, a) {
    BB.fade([K], a, () => {
      const c1 = x + 26, c2 = x + 330, c3 = x + 480, c3w = w - (c3 - x) - 30;
      K.fillStyle = '#FAF9F6'; K.fillRect(x, y, w, 40);
      text(K, 'Name', c1, y + 27, gf(19, { color: G.dim, weight: 700 })); text(K, 'Type', c2, y + 27, gf(19, { color: G.dim, weight: 700 })); text(K, 'Waterfall', c3, y + 27, gf(19, { color: G.dim, weight: 700 }));
      line(K, x, y + 40, x + w, y + 40, G.line, 1.5, 'butt');
      [c2 - 16, c3 - 16].forEach(cx => line(K, cx, y, cx, y + 360, '#ECE9E2', 1.5, 'butt'));
      const rh = 44;
      // DOMContentLoaded / load markers
      const ml = E.outCubic(P(t, T_CLICK + 0.1, 0.9));
      line(K, c3 + c3w * 0.78 * ml, y + 40, c3 + c3w * 0.78 * ml, y + 40 + rh * 6, accentA(0.5), 2, 'butt');
      NET.forEach((r, k) => {
        const t0 = T_CLICK + 0.06 + k * 0.07, age = t - t0;
        if (age < 0) return;
        const ry = y + 40 + k * rh, sel = r.hot && t >= T_SEL - 0.04;
        K.save(); K.globalAlpha *= clamp(age / 0.08);
        if (sel) { K.fillStyle = accentA(0.1); K.fillRect(x, ry, w, rh); fillRR(K, x, ry, 5, rh, 0, C.red); }
        row(K, x, ry, w, rh, 'info');
        const ic = r.ty === 'fetch' ? C.red : r.ty === 'document' ? '#6D93C9' : '#A9A59C';
        fillRR(K, c1, ry + 13, 16, 18, 3, ic);
        text(K, r.n, c1 + 28, ry + 29, mf(20, { color: sel ? C.red : G.ink, weight: sel ? 700 : 500 }));
        text(K, r.ty, c2, ry + 29, mf(19, { color: G.dim }));
        const bw = c3w * r.d * E.outCubic(clamp(age / 0.35)), bx = c3 + c3w * r.s;
        fillRR(K, bx, ry + 15, Math.max(4, bw), 14, 4, r.hot ? C.red : '#8E8B84');
        fillRR(K, bx, ry + 15, Math.max(4, bw * 0.3), 14, 4, r.hot ? '#FF8A73' : '#C9C5BC');
        K.restore();
      });
      // selected request: headers pop
      const sd = t - T_SEL;
      if (sd > 0) X([T, K], c3 + c3w * 0.52, y + 40 + rh * 3 + rh + 18, BB.slap(sd) * clamp(sd / 0.06), 0, () => {
        const f = mf(19, { weight: 700 }), lab = 'GET api/cart', bw = measure(K, lab, f) + 90;
        T.save(); T.shadowColor = 'rgba(0,0,0,0.35)'; T.shadowBlur = 16; T.shadowOffsetY = 6; fillRR(T, -bw / 2, 0, bw, 40, 10, '#FFFFFF'); T.restore();
        fillRR(K, -bw / 2, 0, bw, 40, 10, C.ink);
        text(K, lab, -bw / 2 + 16, 27, Object.assign({}, f, { color: '#FFFFFF' }));
        circle(K, bw / 2 - 26, 20, 10, C.red); iconCheck(K, bw / 2 - 25, 21, 11, clamp(sd / 0.2), '#FFFFFF');
      });
    });
  }
  // flame chart (monochrome + red long task)
  const FLAME = (() => {
    const r = rng(314), out = [];
    const tasks = [[0.04, 0.3, true], [0.4, 0.14], [0.6, 0.22], [0.87, 0.1]];
    const labs = ['Function call', 'Evaluate script', '(anonymous)', 'Layout', 'Paint', 'Run microtasks'];
    tasks.forEach(([s, d, long]) => {
      out.push({ s, d, lv: 0, lab: 'Task', long: !!long });
      const rec = (s0, d0, lv) => {
        if (lv > 3 || d0 < 0.02) return;
        let c = s0 + d0 * 0.03;
        while (c < s0 + d0 * 0.95) { const dd = Math.min(s0 + d0 * 0.97 - c, d0 * (0.3 + r() * 0.55)); if (dd < 0.012) break; out.push({ s: c, d: dd, lv, lab: labs[Math.floor(r() * labs.length)] }); if (r() < 0.8) rec(c, dd, lv + 1); c += dd + d0 * 0.04; }
      };
      rec(s, d, 1);
    });
    return out;
  })();
  function perfPane(T, K, t, x, y, w, a) {
    BB.fade([K], a, () => {
      // toolbar: record ● → recording pulse → trace
      const rec = t >= T_REC && t < T_FLAME;
      circle(K, x + 34, y + 26, 11, rec || t < T_FLAME ? C.red : '#8E8B84');
      if (rec) circle(K, x + 34, y + 26, 16 + 5 * Math.sin(t * 20), null, C.red, 2.5);
      icoReload(K, x + 76, y + 26, G.icon);
      text(K, rec ? 'Recording…' : t >= T_FLAME ? 'Trace · my-app.example.com' : 'Record', x + 108, y + 33, mf(19, { color: rec ? C.red : G.dim, weight: rec ? 700 : 500 }));
      line(K, x, y + 50, x + w, y + 50, '#ECE9E2', 1.5, 'butt');
      const L = x + 110, R = x + w - 24, TW = R - L;
      const sweep = E.inOutCubic(P(t, T_FLAME, 0.62));
      // overview (CPU) area
      K.save(); K.beginPath(); K.rect(L, y + 54, TW * sweep, 400); K.clip();
      const oy = y + 118;
      K.beginPath(); K.moveTo(L, oy);
      for (let k = 0; k <= 80; k++) { const u = k / 80, v = FLAME.filter(f => f.lv <= 2 && u >= f.s && u <= f.s + f.d).length; K.lineTo(L + u * TW, oy - Math.min(52, v * 14) - 2 * noise1(k * 0.7)); }
      K.lineTo(R, oy); K.closePath(); K.fillStyle = '#D9D5CC'; K.fill();
      K.save(); K.beginPath(); K.rect(L + TW * 0.04, y + 54, TW * 0.3, 64); K.clip(); K.fillStyle = accentA(0.55); K.fill(); K.restore();
      // ruler
      for (let k = 0; k <= 10; k++) line(K, L + TW * k / 10, oy + 6, L + TW * k / 10, oy + (k % 5 ? 14 : 20), '#BDB9B0', 2, 'butt');
      // flames
      const fy = oy + 34, lh = 40;
      text(K, 'Main', x + 24, fy + 22, gf(20, { weight: 700 }));
      FLAME.forEach(f => {
        const bx = L + f.s * TW, bw = f.d * TW - 2, by = fy + f.lv * lh;
        const fill = f.lv === 0 ? (f.long ? '#FFD9D2' : '#E7E4DD') : ['', '#3B3C42', '#6A6B72', '#9A9CA3', '#C4C5CA'][f.lv];
        fillRR(K, bx, by, bw, lh - 4, 4, fill);
        if (f.lv === 0 && f.long) { K.save(); rr(K, bx, by, bw, lh - 4, 4); K.clip(); K.strokeStyle = C.red; K.lineWidth = 3; for (let s = bx + bw - 90; s < bx + bw + 30; s += 12) { K.beginPath(); K.moveTo(s, by + lh); K.lineTo(s + 30, by - 4); K.stroke(); } K.restore(); strokeRR(K, bx, by, bw, lh - 4, 4, C.red, 2.5); }
        if (bw > 120) text(K, f.lab, bx + 8, by + 26, mf(18, { color: f.lv === 0 ? (f.long ? C.red : G.ink) : f.lv >= 3 ? G.ink : '#FFFFFF', weight: 700 }));
      });
      K.restore();
      if (sweep > 0 && sweep < 1) { const px = L + TW * sweep; line(K, px, y + 54, px, y + 400, C.red, 3, 'butt'); BB.kdots(K, px, y + 200, 34, 150, 0.55); }
      // Summary (the inspector's bottom pane): donut + categories, fills in once the trace lands
      const sy = fy + 4 * lh + 22, sa = E.outCubic(P(t, T_TRACE - 0.1, 0.4));
      if (sa > 0) BB.fade([K], sa, () => {
        line(K, x, sy - 14, x + w, sy - 14, '#ECE9E2', 1.5, 'butt');
        text(K, 'Summary', x + 24, sy + 18, gf(19, { weight: 700 }));
        const dx = x + 180, dy = sy + 10, segs = [[0.46, C.red], [0.24, '#3B3C42'], [0.14, '#9A9CA3'], [0.16, '#D9D5CC']];
        let a0 = -Math.PI / 2;
        segs.forEach(([f, col]) => { const a1 = a0 + TAU * f * sa; K.beginPath(); K.arc(dx, dy, 20, a0, a1); K.lineWidth = 10; K.strokeStyle = col; K.stroke(); a0 = a0 + TAU * f; });
        let lx = dx + 44;
        [['Scripting', C.red], ['Rendering', '#3B3C42'], ['Painting', '#9A9CA3'], ['System', '#D9D5CC']].forEach(([n, col]) => {
          fillRR(K, lx, dy - 8, 16, 16, 4, col); text(K, n, lx + 24, dy + 7, gf(19, { color: G.ink })); lx += measure(K, n, gf(19)) + 56;
        });
      });
      const ld = t - T_TRACE;
      if (ld > 0) X([K], L + TW * 0.19, fy - 12, BB.slap(ld), 0, () => {
        const lab = 'long task', f = mf(18, { weight: 700 }), bw = measure(K, lab, f) + 28;
        fillRR(K, -bw / 2, -34, bw, 32, 8, C.red); text(K, lab, 0, -12, Object.assign({}, f, { color: '#FFFFFF', align: 'center' }));
      });
    });
  }

  // ── window frame ──
  function url(t) {
    const A = 'github.com/owner/browser-tools-mcp', B = 'my-app.example.com';
    if (t < T_NAV) return { s: A, sel: 0 };
    if (t < T_NAV + 0.1) return { s: A, sel: 1 };
    return { s: typedStr(B, t, T_NAV + 0.1, 90), sel: 0, typing: t < T_NAV + 0.1 + B.length / 90 };
  }
  function frame(T, K, t) {
    const { x, y, w, h, r } = WIN;
    T.save(); T.shadowColor = 'rgba(0,0,0,0.45)'; T.shadowBlur = 50; T.shadowOffsetY = 28; fillRR(T, x, y, w, h, r, '#FFFFFF'); T.restore();
    fillRR(K, x, y, w, h, r, '#FFFFFF');
    K.save(); rr(K, x, y, w, h, r); K.clip();
    K.fillStyle = G.frame; K.fillRect(x, y, w, TABH);
    [0, 1, 2].forEach(k => circle(K, x + 30 + k * 26, y + TABH / 2 + 2, 8, k === 0 ? C.red : '#C9C5BC'));
    // active tab
    const tx = x + 118, tw = 380, tt = y + 10;
    K.beginPath(); K.moveTo(tx - 12, y + TABH); K.quadraticCurveTo(tx, y + TABH, tx, y + TABH - 12); K.lineTo(tx, tt + 12); K.quadraticCurveTo(tx, tt, tx + 12, tt);
    K.lineTo(tx + tw - 12, tt); K.quadraticCurveTo(tx + tw, tt, tx + tw, tt + 12); K.lineTo(tx + tw, y + TABH - 12); K.quadraticCurveTo(tx + tw, y + TABH, tx + tw + 12, y + TABH); K.closePath();
    K.fillStyle = '#FFFFFF'; K.fill();
    const onB = t >= T_PAGEB - 0.1;
    if (onB) { fillRR(K, tx + 16, tt + 12, 22, 22, 6, C.ink); fillRR(K, tx + 23, tt + 19, 8, 8, 2, C.red); }
    else { K.save(); K.beginPath(); K.arc(tx + 27, tt + 23, 11, 0, TAU); K.clip(); coverImg(K, IMG.tools_av, tx + 16, tt + 12, 22, 22, { fy: 0.5 }); K.restore(); }
    const ttl = onB ? 'my-app' : 'owner/browser-tools-mcp';
    K.save(); K.beginPath(); K.rect(tx + 44, tt, tw - 84, 40); K.clip(); text(K, ttl, tx + 48, tt + 30, gf(19, { color: G.ink })); K.restore();
    const ld = t >= T_NAV + 0.3 && t < T_PAGEB + 0.25;
    if (ld) { K.save(); K.translate(tx + tw - 26, tt + 22); K.rotate(t * 14); K.strokeStyle = C.red; K.lineWidth = 3; K.lineCap = 'round'; K.beginPath(); K.arc(0, 0, 8, 0, 4.2); K.stroke(); K.restore(); }
    else { K.save(); K.strokeStyle = G.icon; K.lineWidth = 2.4; K.lineCap = 'round'; const cx = tx + tw - 26, cy = tt + 22; K.beginPath(); K.moveTo(cx - 6, cy - 6); K.lineTo(cx + 6, cy + 6); K.moveTo(cx + 6, cy - 6); K.lineTo(cx - 6, cy + 6); K.stroke(); K.restore(); }
    text(K, '+', tx + tw + 34, y + 38, gf(30, { color: G.icon, align: 'center' }));
    // toolbar + omnibox
    const by = y + TABH, bc = by + BARH / 2;
    line(K, x, by + BARH, x + w, by + BARH, G.line, 2, 'butt');
    icoArrow(K, x + 34, bc, 1, G.icon); icoArrow(K, x + 74, bc, -1, '#C4C1BA'); icoReload(K, x + 114, bc, G.icon, ld ? t * 10 : 0);
    const ox = x + 146, ow = w - 146 - 196;
    fillRR(K, ox, bc - 22, ow, 44, 22, G.omni);
    // tune icon
    K.save(); K.strokeStyle = G.icon; K.lineWidth = 2.4; K.lineCap = 'round'; line(K, ox + 22, bc - 5, ox + 40, bc - 5, G.icon, 2.4); line(K, ox + 22, bc + 5, ox + 40, bc + 5, G.icon, 2.4); circle(K, ox + 27, bc - 5, 3.5, G.omni, G.icon, 2.4); circle(K, ox + 35, bc + 5, 3.5, G.omni, G.icon, 2.4); K.restore();
    const u = url(t), uf = gf(22);
    if (u.sel) { fillRR(K, ox + 54, bc - 15, measure(K, u.s, uf) + 8, 30, 4, accentA(0.22)); }
    K.save(); K.beginPath(); K.rect(ox + 50, bc - 22, ow - 60, 44); K.clip();
    const dom = u.s.split('/')[0];
    text(K, dom, ox + 58, bc + 8, uf); text(K, u.s.slice(dom.length), ox + 58 + measure(K, dom, uf), bc + 8, gf(22, { color: G.dim }));
    if (u.typing) caretAt(K, ox + 58 + measure(K, u.s, uf), bc + 8, 26, t, G.ink);
    K.restore();
    icoPuzzle(K, x + w - 96, bc, G.icon);
    circle(K, x + w - 58, bc, 15, '#DAD6CD'); person(K, x + w - 58, bc + 2, 0.24, '#FFFFFF');
    icoDots(K, x + w - 24, bc, G.icon);
    K.restore();
    strokeRR(K, x, y, w, h, r, 'rgba(17,17,17,0.16)', 2.5);
  }
  // page viewport content (A → B swap, broken → fixed, screenshot shutter)
  function viewport(T, K, t) {
    const x = WIN.x, y = PAGE_Y, w = WIN.w, h = dtTop(t) - PAGE_Y;
    K.save(); K.beginPath(); K.rect(x, y, w, h); K.clip();
    T.save(); T.beginPath(); T.rect(x, y, w, h); T.clip();
    const sw = E.inOutCubic(P(t, T_PAGEB - 0.1, 0.34));
    if (sw < 1) X([T, K], 0, -sw * 160, 1, 0, () => BB.fade([T, K], 1 - sw, () => pageA(T, K, t, x, y, w, h)));
    if (sw > 0) {
      const fixed = E.outCubic(P(t, T_FIX + 0.14, 0.3)), press = win(t, T_CLICK - 0.03, T_CLICK + 0.08, 0.03, 0.12);
      X([T, K], 0, (1 - sw) * 120, 1, 0, () => BB.fade([T, K], sw, () => pageB(T, K, t, x, y, w, h, fixed, press)));
    }
    T.restore(); K.restore();
    // screenshot: viewfinder brackets close in → shutter blink
    const bq = win(t, T_BRK, T_SHOT + 0.2, 0.2, 0.18);
    if (bq > 0) {
      const ins = lerp(-60, 18, E.outBack(P(t, T_BRK, 0.3))), L = 60, bx0 = x + ins, by0 = y + ins, bx1 = x + w - ins, by1 = y + h - ins;
      BB.fade([K], bq, () => {
        K.save(); K.strokeStyle = C.red; K.lineWidth = 7; K.lineCap = 'round'; K.lineJoin = 'round';
        [[bx0, by0, 1, 1], [bx1, by0, -1, 1], [bx1, by1, -1, -1], [bx0, by1, 1, -1]].forEach(([cx, cy, sx, sy]) => { K.beginPath(); K.moveTo(cx, cy + sy * L); K.lineTo(cx, cy); K.lineTo(cx + sx * L, cy); K.stroke(); });
        K.restore();
        circle(K, x + w - 60, y + 40, 9, Math.floor(t * 6) % 2 ? C.red : accentA(0.3));
      });
    }
    const sh = t - T_SHOT;
    if (sh > 0 && sh < 0.3) { K.save(); K.globalAlpha = sh < 0.05 ? 0.9 : 0.9 * (1 - (sh - 0.05) / 0.25); K.fillStyle = C.ink; K.fillRect(x, y, w, h); K.restore(); }
  }
  // screenshot thumbnail (full page) flies out and pins to the window's side
  function thumb(T, K, t) {
    const d = t - T_SHOT - 0.05;
    if (d < 0) return;
    const op = P(t, T_THUMBOUT, 0.3), out = E.inBack(op);
    if (op >= 1) return;
    const p = pop(d, 2.2, 0.62), q = clamp(p);
    const tw = 300, th = 216, s0 = 0.9;
    const cx = lerp(WIN.x + WIN.w / 2, 846, p) + out * 900, cy = lerp(PAGE_Y + 170, 600, p) - Math.sin(Math.PI * q) * 60, s = lerp(s0 * 2.2, 1, p), r = lerp(0, 5, q) + out * 20;
    X([T, K], cx, cy, s, r, () => {
      T.save(); T.shadowColor = 'rgba(0,0,0,0.45)'; T.shadowBlur = 30; T.shadowOffsetY = 16; fillRR(T, -tw / 2 - 10, -th / 2 - 10, tw + 20, th + 20, 12, '#FFFFFF'); T.restore();
      fillRR(K, -tw / 2 - 10, -th / 2 - 10, tw + 20, th + 20, 12, '#FFFFFF'); strokeRR(K, -tw / 2 - 10, -th / 2 - 10, tw + 20, th + 20, 12, 'rgba(17,17,17,0.12)', 2);
      K.save(); rr(K, -tw / 2, -th / 2, tw, th, 6); K.clip(); T.save(); rr(T, -tw / 2, -th / 2, tw, th, 6); T.clip();
      const k = tw / WIN.w;
      for (const c of [T, K]) { c.save(); c.translate(-tw / 2, -th / 2); c.scale(k, k); c.translate(-WIN.x, -PAGE_Y); }
      pageB(T, K, t, WIN.x, PAGE_Y, WIN.w, 700, 1, 0);
      for (const c of [T, K]) c.restore();
      T.restore(); K.restore();
      const f = mf(15, { weight: 700 });
      fillRR(K, -tw / 2 + 8, th / 2 - 34, 128, 26, 13, C.ink); text(K, 'screenshot', -tw / 2 + 72, th / 2 - 16, Object.assign({}, f, { color: '#FFFFFF', align: 'center' }));
    });
  }
  // Claude's cursor (control): glides to Checkout, clicks
  function cursorFx(T, K, t) {
    const a = win(t, T_CUR, T_SEL + 0.25, 0.12, 0.2);
    if (a <= 0) return;
    const bx = WIN.x + 40 + 92, by = PAGE_Y + 262;
    const m = E.inOutCubic(P(t, T_CUR, T_CLICK - T_CUR - 0.04));
    const x = lerp(WIN.x + WIN.w - 180, bx + 30, m) + Math.sin(m * Math.PI) * 30, y = lerp(PAGE_Y + 250, by + 4, m) - Math.sin(m * Math.PI) * 50;
    const pr = win(t, T_CLICK - 0.03, T_CLICK + 0.06, 0.03, 0.1);
    BB.fade([K], a, () => {
      if (t > T_CLICK) shock(K, bx + 30, by + 4, t - T_CLICK, { r: 60, color: C.red, lw: 4, dur: 0.35 });
      cursor(K, x, y, 0.5, pr);
      const f = mf(16, { weight: 700 }), lw = measure(K, 'Claude', f) + 20;
      fillRR(K, x + 34, y + 44, lw, 28, 8, C.red); text(K, 'Claude', x + 44, y + 63, Object.assign({}, f, { color: '#FFFFFF' }));
    });
  }
  // blindfold: wraps the eye, then drops away (drawn in front of the presenter)
  function blindfold(T, K, t, e) {
    if (!e || t < T_WRAP - 0.2) return;
    const wr = pop(t - T_WRAP, 2.4, 0.66), fall = t - T_DROP;
    if (fall > 1.2) return;
    const bw = e.w * 1.55, bh = e.w * 0.36;
    let x = e.x + lerp(-700, 0, wr), y = e.y, rot = lerp(-18, -4, clamp(wr));
    if (fall > 0) { y += 2600 * fall * fall + 60 * fall; x += 220 * fall; rot += 160 * fall * fall + 30 * fall; }
    X([T, K], x, y, 1, rot, () => {
      T.save(); T.shadowColor = 'rgba(0,0,0,0.5)'; T.shadowBlur = 30; T.shadowOffsetY = 18;
      const band = c => { c.beginPath(); c.moveTo(-bw / 2, -bh / 2 + 10); c.quadraticCurveTo(0, -bh / 2 - 18, bw / 2, -bh / 2 + 6); c.lineTo(bw / 2, bh / 2 - 6); c.quadraticCurveTo(0, bh / 2 + 16, -bw / 2, bh / 2 - 10); c.closePath(); };
      band(T); T.fillStyle = '#FFFFFF'; T.fill(); T.restore();
      band(K); K.fillStyle = '#1B1B1E'; K.fill();
      K.save(); band(K); K.clip();
      K.strokeStyle = 'rgba(255,255,255,0.08)'; K.lineWidth = 6; K.lineCap = 'round';
      [-0.22, 0.05, 0.28].forEach(k => { K.beginPath(); K.moveTo(-bw / 2, k * bh); K.quadraticCurveTo(0, k * bh - 14, bw / 2, k * bh - 4); K.stroke(); });
      K.setLineDash([10, 8]); K.strokeStyle = 'rgba(255,255,255,0.35)'; K.lineWidth = 2.5;
      K.beginPath(); K.moveTo(-bw / 2, -bh / 2 + 22); K.quadraticCurveTo(0, -bh / 2 - 4, bw / 2, -bh / 2 + 18); K.stroke();
      K.beginPath(); K.moveTo(-bw / 2, bh / 2 - 22); K.quadraticCurveTo(0, bh / 2 + 2, bw / 2, bh / 2 - 18); K.stroke();
      K.restore();
      // knot + two tails fluttering
      const kx = bw / 2 - 20, fl = Math.sin(t * 13) * 10;
      circle(K, kx, 0, bh * 0.3, '#232327');
      [[1, -1], [1, 1]].forEach(([sx, sy], k) => {
        K.beginPath(); K.moveTo(kx, 0);
        K.bezierCurveTo(kx + 60, sy * 20 + fl * (k ? 1 : -1), kx + 110, sy * 50 - fl, kx + 150, sy * 80 + fl * 0.6);
        K.lineTo(kx + 124, sy * 92 + fl * 0.6); K.bezierCurveTo(kx + 90, sy * 58, kx + 50, sy * 30, kx, sy * 14); K.closePath();
        K.fillStyle = '#1B1B1E'; K.fill();
      });
    });
  }

  function win_(T, K, t) {
    if (t < TD) return;
    const p = onP(t);
    if (p <= 0) return;
    const fl = Math.sin(t * 2.1) * 3 * clamp((t - T_ON) / 0.5) * (1 - clamp((t - T_OFF) / 0.1));
    const box = [WIN.x, WIN.y, WIN.w, WIN.h, WIN.r];
    const O = t < T_OFF ? hitPt() : EN;
    X([T, K], 0, fl, 1, 0, () => BB.powerOn(T, K, p, O.x, O.y - fl, 1250, box, () => {
      frame(T, K, t);
      K.save(); rr(K, WIN.x, WIN.y, WIN.w, WIN.h, WIN.r); K.clip(); T.save(); rr(T, WIN.x, WIN.y, WIN.w, WIN.h, WIN.r); T.clip();
      viewport(T, K, t);
      inspector(T, K, t);
      cursorFx(T, K, t);
      // power dims while "blindfolded"
      const dim = win(t, T_BLIND, T_DROP + 0.02, 0.2, 0.18);
      if (dim > 0) { K.save(); K.globalAlpha = 0.62 * dim; K.fillStyle = '#15161A'; K.fillRect(WIN.x, WIN.y, WIN.w, WIN.h); K.restore(); }
      K.restore(); T.restore();
      strokeRR(K, WIN.x, WIN.y, WIN.w, WIN.h, WIN.r, 'rgba(17,17,17,0.16)', 2.5);
      circle(K, EN.x, EN.y - 4, 12, C.red);
      // the eye (docked in the toolbar in between)
      const e = eyeState(t);
      if (e && e.s > 0.01) {
        const small = e.w < 80;
        if (small) { fillRR(K, e.x - 26, e.y - 17, 52, 34, 17, accentA(0.12)); }
        X([T, K], e.x, e.y, e.s, 0, () => eye(T, K, 0, 0, e.w, { open: e.open, look: e.look, power: e.pw }));
      }
    }));
  }

  return {
    label: '// 04 — browser tools', bg: 'light',
    cam: t => {
      const k = win(t, T_DT - 0.1, T_BLIND + 0.05, 0.55, 0.45), b = win(t, T_BLIND + 0.1, T_OFF - 0.05, 0.4, 0.34);
      return { z: 1 + 0.03 * win(t, S0 + 0.05, TD + 0.45, 0.6, 0.5) + 0.15 * k - 0.05 * b, y: 46 * k + 34 * b };
    },
    draw(T, K, t) {
      const g = stripG(t), p = pOf(t), sw = BB.swing(t, I, TD, { amp: 1.0 });
      BB.cables(K, g, p);
      BB.looseCable(K, g, I, sw);
      BB.inStrip([T, K], g, () => {
        BB.pulseTo(T, K, I, t, TD + 0.05, T_ON, hitPt().u);
        BB.flow(K, I, t, clamp((t - TD - 0.45) / 0.2) * (1 - clamp((t - T_OFF) / 0.2)));
      });
      BB.fadeTop(K);                                     // cables, pulse and flow soften out under the headline
      win_(T, K, t);
      BB.body(T, K, t, g, p, () => {
        if (t < TD && t > TD - 1.3 && Math.floor(t * 5) % 2) circle(K, socketX(I) + 30, BB.SY - 30, 5, accentA(0.7));   // empty socket blinks, waiting
        if (sw) BB.loosePlug(T, K, I, sw.bx, sw.by, sw.rot, { glow: 0.35 * sw.hover });
        if (sw && sw.hover > 0.2) BB.kdots(K, socketX(I), BB.SY, 64, 64, 0.5 * sw.hover * (0.6 + 0.4 * Math.sin(t * 20)));
        BB.plugFace(K, 2, socketX(2), BB.SEAT, 0, 1);
        if (t >= TD) BB.plugFace(K, I, socketX(I), BB.SEAT, 0, 1);
        BB.sparks(T, K, socketX(I), BB.SY - 40, t - TD, 91, 1);
        // 4/4: a surge of power runs the whole strip, every LED flashes in turn
        const d = t - TD - 0.06;
        if (d > 0 && d < 0.7) {
          const sx = lerp(-120, STRIP_W + 120, E.inOutCubic(clamp(d / 0.42)));
          K.save(); rr(K, 0, 0, STRIP_W, STRIP_H, 34); K.clip();
          const gr = K.createLinearGradient(sx - 90, 0, sx + 90, 0); gr.addColorStop(0, accentA(0)); gr.addColorStop(0.5, accentA(0.35 * (1 - clamp((d - 0.4) / 0.3)))); gr.addColorStop(1, accentA(0));
          K.fillStyle = gr; K.fillRect(0, 0, STRIP_W, STRIP_H); K.restore();
          BB.glow(T, sx, STRIP_H / 2, 150, 110, 0.7 * (1 - clamp((d - 0.4) / 0.3)));
          [0, 1, 2, 3].forEach(k => { const lt = d - 0.07 * k - 0.1; if (lt > 0) shock(K, socketX(k) + 30, BB.SY - 30, lt, { r: 34, color: C.red, lw: 3, dur: 0.3 }); });
          shock(K, 44, 44, d, { r: 70, color: C.red, lw: 4, dur: 0.45 });
        }
      });
    },
    front(T, K, t) {
      blindfold(T, K, t, eyeState(t) ? Object.assign({}, eyeState(t), { y: eyeState(t).y + Math.sin(t * 2.1) * 3 }) : null);
      thumb(T, K, t);
    },
    guy(t) {
      const th = PRESENTER_DOCK;
      const eyeAng = BB.aim('L', th, EYE_BIG.x, EYE_BIG.y);
      const dtAng = BB.aim('L', th, WIN.x + 360, dtTop(t) + 140);
      const A = arms(t, [
        [S0 - 1, S0 + 0.18, 'R', 'thumb'],                                                                      // carried over from "together"
        [S0 + 0.12, TD - 0.03, 'L', 'point', { pointAng: -60 + BB.jab(t, [wi(107), wi(110)]) }],                // "the last one is Browser Tools…"
        [TD - 0.02, TD + 0.5, 'LR', 'fist'],                                                                    // 4/4!
        [wi(113) - 0.1, T_TEAM_() + 0.3, 'R', 'cover'],                                                         // "built by the Browser Tools team" — impressed
        [T_NAV + 0.02, T_DT - 0.02, 'L', 'point', { pointAng: eyeAng + BB.jab(t, [wi(121)]) }],               // "eyes on a real browser"
        [T_DT + 0.04, T_BRK - 0.04, 'L', 'point', { pointAng: dtAng + BB.jab(t, [wi(129), wi(130), wi(132), wi(133)], 7) }],   // console · network
        [T_SHOT + 0.04, T_PERF - 0.02, 'R', 'thumb'],                                                          // screenshot
        [T_PERF + 0.04, T_BLIND - 0.06, 'L', 'shrug'],                                                          // performance traces
        [T_BLIND + 0.02, T_DROP - 0.02, 'L', 'facepalm'],                                                       // "coding blindfolded"
        [T_DROP + 0.04, S1 + 1, 'LR', 'shrug'],                                                                // ta-da
      ]);
      const ex = expr(t, [
        [S0 - 1, S0 + 0.08, { smile: 1, brow: 0.5 }],                 // continues agent-crew's "together" face
        [S0, TD - 0.06, { smile: 0.6, brow: 0.35 }],
        [TD - 0.06, TD + 0.16, { shock: 0.5, brow: 1 }],
        [TD + 0.12, wi(113), { smile: 1, brow: 0.55 }],
        [wi(113), T_NAV, { brow: 0.95, smile: 0.35, browTilt: 0.12 }],
        [T_NAV, T_DT, { smile: 0.8, brow: 0.6 }],
        [T_ERR[0] - 0.05, T_FIX + 0.1, { browTilt: 0.35, brow: -0.3, smile: -0.2 }],
        [T_FIX + 0.1, T_SHOT, { smile: 0.75, brow: 0.3 }],
        [T_SHOT - 0.02, T_SHOT + 0.14, { shock: 0.35, blink: 1 }],
        [T_SHOT + 0.14, T_PERF, { smile: 0.9, brow: 0.4 }],
        [T_PERF, T_BLIND, { brow: 0.8, smile: 0.5 }],
        [T_BLIND, T_DROP, { smile: -0.25, browTilt: 0.3 }],
        [T_DROP, S1 + 0.5, { smile: 1, brow: 0.6 }],
      ]);
      return Object.assign({ x: th.x, y: th.y, s: th.s }, A, ex, {
        lookX: -0.1 * win(t, S0 - 1, S0 + 0.1) - 0.3 * win(t, S0 + 0.05, TD + 0.1) - 0.45 * win(t, TD + 0.1, T_DT) - 0.55 * win(t, T_DT, T_SHOT) - 0.05 * win(t, T_SHOT, T_THUMBOUT) - 0.5 * win(t, T_PERF, T_BLIND) - 0.35 * win(t, T_DROP + 0.1, S1 + 1),
        lookY: -0.85 * win(t, S0 + 0.05, TD + 0.05) - 0.45 * win(t, TD + 0.05, T_DT) - 0.2 * win(t, T_DT, T_SHOT) - 0.7 * win(t, T_SHOT, T_THUMBOUT) - 0.25 * win(t, T_PERF, T_BLIND) - 0.4 * win(t, T_DROP + 0.1, S1 + 1),
        headTurn: -0.2 * win(t, S0 + 0.05, T_SHOT) + 0.15 * win(t, T_SHOT + 0.1, T_THUMBOUT) - 0.18 * win(t, T_PERF, S1 + 1),
        headTilt: 6 * win(t, S0 - 1, S0 + 0.12) + 6 * win(t, wi(115), T_NAV) - 4 * win(t, T_ERR[0], T_FIX) + 5 * win(t, T_DROP, S1 + 1),
        headNod: 0.4 * Math.max(0, Math.sin((t - TD) * 12)) * win(t, TD, TD + 0.5, 0.05, 0.2),
      });
    },
  };
  function T_TEAM_() { return wi(117); }
})();
