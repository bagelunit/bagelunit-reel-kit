// ═════════════ 05 · YOU DECIDE  [owi(52)−0.1 ≈ 13.38 → owi(70)−0.1 ≈ 17.82] · print orange look ═════════════
// NOTE: reference code from a real reel. Word indices (wi(n)) refer to that reel's script; re-cue on your own words.json.
// Through-object left in: learnCard() (kit).
// assets not included: none (all vector drawing).
// "You make the design decisions. Claude still writes the code, and then explains what it changed and why."
// Beats: YOUR cursor ("you") clicks chip 04 of the learning card → the README's Build checkpoint springs out of the chip
// ("When someone deletes Travel, what should happen to “Trip ideas” in Summer?") → you hover "Delete it everywhere", hesitate,
// pick "Keep it in Summer" (red fill wipes from the click, check), the other option is struck and drops away, YOUR DECISION
// stamp (kick) → the card folds back into chip 04 while your choice stays in your hand as a red token; a LOCKED code panel
// (folders.sql, "0 lines written") rises from behind the learning card → you drag the token into the padlock → it springs open,
// falls, a scan wipes the dim code awake, the token docks in the panel header → Claude writes fast: a CREATE TABLE links row is
// inserted (rows shove down) and typed, the old "DELETE FROM notes" row is struck (−), a "DELETE FROM links" row is inserted and
// typed (+), status rolls to +2 −1 → unchanged rows dim, chip 05 lights and the ✦ Implementation report springs out of it,
// pinned to the changed line: CHANGED "deletes the links, not the notes" ("links" underlined in the code), WHY: your token flies
// down from the header into the WHY row ("your call") → report folds into chip 05, panel whips off. Hand-off: card at TC + dock.
(() => {
  const S0 = owi(52) - 0.1, END = owi(70) - 0.1;               // 13.38 · 17.82
  const CLEAN0 = S0 + 0.15, CLEAN1 = END - 0.15;             // only card + the presenter before / after these
  // ── beat times ──
  const CUR0 = S0 + 0.12, CLICK1 = owi(53) + 0.07;            // cursor in · clicks chip 04 (lights at owi(53))
  const DEC_IN = owi(53) + 0.09;                              // checkpoint card springs out of chip 04
  const HOVER_A = 13.95, MOVE_B = 14.05, CHOOSE = owi(55) + 0.2;    // ~14.12 on "design"
  const STRIKE_A = CHOOSE + 0.04, FALL_A = CHOOSE + 0.15;
  const STAMP = owi(56) + 0.1;                               // "decisions"
  const FOLD = 14.46, FOLD_D = 0.17;                          // card folds back into chip 04, choice stays as token
  const PANEL_IN = 14.42;                                    // code panel rises from behind the learning card
  const DRAG0 = 14.54, DRAG1 = owi(57) - 0.02;                 // drag token into the padlock
  const UNLOCK = owi(57);                                     // "Claude"
  const WIPE0 = UNLOCK + 0.04, WIPE_D = 0.2;
  const DOCK0 = UNLOCK + 0.08, DOCK1 = UNLOCK + 0.28;        // token → panel header
  const INS1 = 14.98, TY1 = [15.0, 15.36];
  const DEL = 15.38, INS2 = 15.52, TY2 = [15.56, 15.94];
  const DONE = owi(61) + 0.18;                                // status +2 −1
  const DIM = 16.08;
  const REP_IN = owi(64);                                     // chip 05 "explained" lights · report springs out of it
  const ROW1 = owi(65) - 0.04, UL = owi(67) - 0.06;            // "what" · "changed"
  const WHY0 = 17.06, WHY1 = 17.25;                          // token header → WHY row
  const EXIT = 17.49, EXIT_D = 0.16;                          // report folds into chip 05
  const EXIT_P = 17.4, EXIT_PD = 0.24;                        // code panel whips off left

  // ── layout (scene coords) ──
  const CARD_CX = TC.x + TC_W / 2, CARD_CY = TC.y + TC_H / 2;
  const CHIPC = i => { const cw = (TC_W - 48 - 16) / 3, row = i < 3 ? 0 : 1, col = row ? i - 3 : i; return [TC.x + 24 + col * (cw + 8) + cw / 2, TC.y + 80 + row * 82 + 34, cw]; };
  const [C4X, C4Y, CHW] = CHIPC(3), [C5X, C5Y] = CHIPC(4);
  const DX = 90, DY = 466, DW = 900, DH = 452;                // checkpoint card
  const OPT = { x: 40, w: 820, h: 96, ya: 214, yb: 330 };     // option rows (card local, top)
  const PX = 90, PY = 446, PW = 900, HDR = 72, PAD = 20, ROWH = 58;   // code panel
  const RX = 100, RY = 900, RW = 760, RH = 236;               // implementation report
  const CODE = { font: F.mono, weight: 500, size: 29 };
  const CODEX = 100;                                         // code text x (panel local)
  const LOCK_DX = -262, SLOT_DX = 74, SLOT_W = 470;          // locked overlay: padlock + decision slot (panel-centre relative)
  const PALETTE = { bg: '#15161A', hdr: '#1D1E23', kw: '#FF7A5C', id: '#F2EFE8', col: '#A9C7FF', p: '#8F8C85', cm: '#6F717B', st: '#9BE38E', add: '#5BD178', del: '#FF6A4D' };
  const INK2 = '#8a8780';

  // ── code rows (final order). ins: insert time (null = existing) · sign · type window ──
  const K_ = PALETTE;
  const ROWS = [
    { ins: INS1, sign: '+', ty: TY1, tok: [['CREATE TABLE ', K_.kw], ['links', K_.id], [' (', K_.p], ['note_id', K_.col], [', ', K_.p], ['folder_id', K_.col], [');', K_.p]] },
    { tok: [['-- delete a folder', K_.cm]], plain: true },
    { tok: [['DELETE FROM ', K_.kw], ['folders', K_.id], [' WHERE ', K_.kw], ['id', K_.col], [' = ', K_.p], ['?', K_.st], [';', K_.p]], plain: true },
    { del: DEL, sign: '−', tok: [['DELETE FROM ', K_.kw], ['notes', K_.id], ['   WHERE ', K_.kw], ['folder_id', K_.col], [' = ', K_.p], ['?', K_.st], [';', K_.p]] },
    { ins: INS2, sign: '+', ty: TY2, tok: [['DELETE FROM ', K_.kw], ['links', K_.id], ['   WHERE ', K_.kw], ['folder_id', K_.col], [' = ', K_.p], ['?', K_.st], [';', K_.p]] },
  ];
  ROWS.forEach(r => { r.str = r.tok.map(x => x[0]).join(''); });

  // ── small helpers ──
  function vdA(cs, a, fn) { if (a <= 0.002) return; for (const c of cs) { c.save(); c.globalAlpha *= clamp(a); } fn(); for (const c of cs) c.restore(); }
  function vdGlow(T, x, y, r, a, red = true) {
    if (a <= 0.003) return;
    const c = red ? '255,0,0' : '0,0,0', g = T.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${c},${Math.min(1, a)})`); g.addColorStop(0.55, `rgba(${c},${Math.min(1, a) * 0.35})`); g.addColorStop(1, `rgba(${c},0)`);
    T.fillStyle = g; T.fillRect(x - r, y - r, r * 2, r * 2);
  }
  function vdShadow(T, x, y, w, h, r, a = 0.42, blur = 44, off = 24) {
    T.save(); T.shadowColor = `rgba(0,0,0,${a})`; T.shadowBlur = blur; T.shadowOffsetY = off; fillRR(T, x, y, w, h, r, '#FFFFFF'); T.restore();
    fillRR(T, x, y, w, h, r, '#FFFFFF');
  }
  function vdStar(K, x, y, r, col) {          // ✦ four-point sparkle
    K.beginPath();
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 - Math.PI / 2, rr2 = i % 2 ? r * 0.3 : r; K[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); }
    K.closePath(); K.fillStyle = col; K.fill();
  }
  const bez = (a, c, b, u) => [(1 - u) * (1 - u) * a[0] + 2 * (1 - u) * u * c[0] + u * u * b[0], (1 - u) * (1 - u) * a[1] + 2 * (1 - u) * u * c[1] + u * u * b[1]];
  // rubber stamp in Space Grotesk 700 (double border, worn speckle)
  function vdStamp(K, str, x, y, dt, o = {}) {
    if (dt < 0) return;
    const { size = 56, rot = -8, col = C.red } = o;
    const s = dt < 0.13 ? lerp(2.5, 1, E.inQuart(dt / 0.13)) : 1 + ring(dt - 0.13, 5, 12) * 0.05;
    const f = { font: F.grot, weight: 700, size, ls: 3 }, tw = measure(K, str, f), w = tw + 56, h = size * 1.55;
    K.save(); K.translate(x, y); K.rotate(rot * D2R); K.scale(s, s); K.globalAlpha *= clamp(dt / 0.05);
    strokeRR(K, -w / 2, -h / 2, w, h, 14, col, 8); strokeRR(K, -w / 2 + 12, -h / 2 + 12, w - 24, h - 24, 7, col, 3);
    text(K, str, 0, size * 0.36, Object.assign({ color: col }, f));
    K.globalCompositeOperation = 'destination-out';
    const r = rng(77 + str.length);
    for (let i = 0; i < 60; i++) circle(K, (r() - 0.5) * w, (r() - 0.5) * h, r() * 4 + 1, '#000');
    K.restore();
  }
  // the "you" cursor: arrow + red name tag (multiplayer style)
  function vdCursor(T, K, x, y, press = 0, a = 1) {
    vdA([T, K], a, () => {
      X([T], x + 8, y + 10, 0.8, 0, () => { T.fillStyle = 'rgba(0,0,0,0.35)'; T.beginPath(); T.moveTo(0, 0); T.lineTo(0, 92); T.lineTo(24, 70); T.lineTo(42, 108); T.lineTo(60, 100); T.lineTo(42, 62); T.lineTo(74, 60); T.closePath(); T.fill(); });
      cursor(K, x, y, 0.8, press);
      const tx = x + 52, ty = y + 74;
      fillRR(K, tx, ty, 74, 38, 19, C.red); text(K, 'you', tx + 37, ty + 27, { font: F.grot, weight: 700, size: 24, color: '#FFFFFF' });
    });
  }
  // a choice row / token (centred at 0,0). fillP 0..1 = red wipe radius fraction from local wipe point (wx), checkP = check draw
  function vdChoice(T, K, label, w, h, fs, o = {}) {
    const { fillP = 0, checkP = 0, wx = 0, hover = 0, dim = 0, strike = 0, shadow = 0.25, outline = true } = o;
    const r = Math.min(h / 2, o.r ?? 22);
    if (shadow > 0) vdShadow(T, -w / 2, -h / 2, w, h, r, shadow, 24, 12);
    fillRR(K, -w / 2, -h / 2, w, h, r, '#FFFFFF');
    if (outline) strokeRR(K, -w / 2, -h / 2, w, h, r, hover > 0 ? `rgba(17,17,17,${0.18 + 0.82 * hover})` : 'rgba(17,17,17,0.18)', 3 + hover);
    const rx = -w / 2 + h * 0.5, lx = -w / 2 + h * 0.98, lf = { font: F.grot, weight: 700, size: fs, ls: -fs * 0.02 };
    const draw = (inv) => {
      const col = inv ? '#FFFFFF' : `rgba(17,17,17,${1 - dim * 0.65})`;
      circle(K, rx, 0, h * 0.19, inv ? '#FFFFFF' : null, inv ? null : col, 3.5);
      if (inv) check(K, rx + 1, 1, h * 0.24, checkP, C.red, Math.max(4, h * 0.06));
      text(K, label, lx, fs * 0.35, Object.assign({ color: col, align: 'left' }, lf));
    };
    draw(false);
    if (strike > 0) { const tw = measure(K, label, lf); line(K, lx - 6, -2, lx - 6 + (tw + 12) * E.outCubic(strike), -2, C.red, 5); }
    if (fillP > 0) {
      K.save(); rr(K, -w / 2, -h / 2, w, h, r); K.clip();
      K.beginPath(); K.arc(wx, 0, Math.max(1, fillP * (w + 40)), 0, TAU); K.clip();
      K.fillStyle = C.red; K.fillRect(-w / 2, -h / 2, w, h); draw(true); K.restore();
    }
  }
  // padlock (centred at body centre). open 0..1 shackle swing
  function vdLock(K, x, y, s, open = 0, rot = 0) {
    X([K], x, y, s, rot, () => {
      K.save(); K.translate(30, -40); K.rotate(-open * 0.9); K.translate(-30, 40);
      K.beginPath(); K.moveTo(-30, -40); K.lineTo(-30, -66 - open * 14); K.arc(0, -66 - open * 14, 30, Math.PI, 0); K.lineTo(30, -40 - open * 14);
      K.lineWidth = 15; K.strokeStyle = '#FFFFFF'; K.lineCap = 'round'; K.stroke(); K.restore();
      fillRR(K, -56, -44, 112, 92, 18, '#FFFFFF');
      circle(K, 0, -4, 12, PALETTE.bg); fillRR(K, -5, -2, 10, 28, 4, PALETTE.bg);
    });
  }

  // ── code panel ──
  const rowGrow = (r, t) => r.ins == null ? 1 : E.outBack(clamp((t - r.ins) / 0.16));
  const rowsH = t => ROWS.reduce((a, r) => a + ROWH * clamp(rowGrow(r, t), 0, 1.1), 0);
  let CW = 0;
  function codeText(K, r, x, y, n, a = 1) {
    let cx = x, left = n;
    for (const [s, col] of r.tok) {
      if (left <= 0) break;
      const part = s.slice(0, left); left -= s.length;
      text(K, part, cx, y, Object.assign({ color: col, align: 'left' }, CODE));
      cx += part.length * CW;
    }
    return cx;
  }
  function panel(T, K, t, ox, oy, rot) {
    if (!CW) CW = measure(K, 'MMMMMMMMMM', CODE) / 10;
    const h = HDR + PAD * 2 + rowsH(t);
    X([T, K], ox + PW / 2, oy, 1, rot, () => {
      const x = -PW / 2, y = 0;
      vdShadow(T, x, y, PW, h, 26, 0.5, 50, 28);
      fillRR(K, x, y, PW, h, 26, PALETTE.bg);
      // header
      K.save(); rr(K, x, y, PW, h, 26); K.clip(); K.fillStyle = PALETTE.hdr; K.fillRect(x, y, PW, HDR); K.restore();
      line(K, x, y + HDR, x + PW, y + HDR, 'rgba(255,255,255,0.07)', 2, 'butt');
      [C.red, '#3B3C43', '#3B3C43'].forEach((c, i) => circle(K, x + 34 + i * 26, y + 36, 8, c));
      text(K, 'folders.sql', x + 128, y + 45, { font: F.mono, weight: 700, size: 24, color: '#E8E6E1', align: 'left' });
      line(K, x + 128, y + HDR - 2, x + 128 + measure(K, 'folders.sql', { font: F.mono, weight: 700, size: 24 }), y + HDR - 2, C.red, 3, 'butt');
      // status (right)
      const sf = { font: F.mono, weight: 700, size: 23 };
      if (t < UNLOCK) text(K, '0 lines written', x + PW - 30, y + 45, Object.assign({ color: '#7C7E87', align: 'right' }, sf));
      else if (t < DONE) {
        const blink = Math.floor(t * 9) % 2 ? 1 : 0.35;
        text(K, 'writing', x + PW - 30 - 22, y + 45, Object.assign({ color: '#E8E6E1', align: 'right' }, sf));
        fillRR(K, x + PW - 30 - 14, y + 26, 13, 24, 2, `rgba(255,122,92,${blink})`);
      } else {
        const p = clamp((t - DONE) / 0.28), b = 1 + ring(t - DONE - 0.1, 4, 9) * 0.1;
        X([K], x + PW - 30, y + 37, b, 0, () => {
          const w2 = slot(K, '1', 0, 9, Object.assign({ color: PALETTE.del, align: 'right' }, sf), p);
          text(K, '−', -w2 - 4, 9, Object.assign({ color: PALETTE.del, align: 'right' }, sf));
          const off = w2 + 4 + measure(K, '−', sf) + 18;
          const w3 = slot(K, '2', -off, 9, Object.assign({ color: PALETTE.add, align: 'right' }, sf), p);
          text(K, '+', -off - w3 - 4, 9, Object.assign({ color: PALETTE.add, align: 'right' }, sf));
          const cx2 = -off - w3 - 4 - measure(K, '+', sf) - 30;
          circle(K, cx2, 0, 15 * E.outBack(clamp(p * 2)), PALETTE.add); check(K, cx2, 1, 15, clamp(p * 2 - 0.4), PALETTE.bg, 4);
        });
      }
      // rows
      const dim = E.inOutCubic(clamp((t - DIM) / 0.25)) * (1 - E.inOutCubic(clamp((t - EXIT) / 0.1)));
      let ry = y + HDR + PAD, ln = 0;
      K.save(); rr(K, x, y + HDR, PW, h - HDR, 0); K.clip();
      ROWS.forEach((r, i) => {
        const g = rowGrow(r, t), rh = ROWH * clamp(g, 0, 1.1);
        if (g <= 0.01) return;
        ln++;
        const top = ry, base = ry + rh / 2 + 10;
        const isAdd = r.sign === '+', delP = r.del ? clamp((t - r.del) / 0.16) : 0;
        const rowA = clamp(g * 1.4) * (r.plain ? 1 - dim * 0.66 : 1);
        vdA([K], rowA, () => {
          // diff tint
          if (isAdd) { const a = clamp((t - r.ins) / 0.12); fillRR(K, x + 8, top + 3, PW - 16, rh - 6, 8, `rgba(91,209,120,${0.15 * a})`); fillRR(K, x + 8, top + 3, 5, rh - 6, 2, PALETTE.add); }
          if (delP > 0) { fillRR(K, x + 8, top + 3, PW - 16, rh - 6, 8, accentA(0.2 * delP)); fillRR(K, x + 8, top + 3, 5, rh - 6, 2, PALETTE.del); }
          text(K, String(ln), x + 50, base, { font: F.mono, weight: 500, size: 22, color: '#5B5D66', align: 'right' });
          if (isAdd || delP > 0) X([K], x + 72, base - 9, isAdd ? 1 : E.outBack(delP), 0, () => text(K, r.sign, 0, 10, { font: F.mono, weight: 700, size: 28, color: isAdd ? PALETTE.add : PALETTE.del }));
          // text: typed or full
          let n = r.str.length, typing = false;
          if (r.ty) { const q = clamp((t - r.ty[0]) / (r.ty[1] - r.ty[0])); n = Math.floor(r.str.length * q); typing = q > 0 && q < 1; }
          const lockedDim = t < UNLOCK + 0.1 ? 0.55 : 1;
          vdA([K], (delP > 0 ? 1 - delP * 0.35 : 1) * lockedDim, () => { const ex = codeText(K, r, x + CODEX, base, n); if (typing) fillRR(K, ex + 2, base - 24, 15, 31, 2, PALETTE.kw); });
          if (delP > 0) line(K, x + CODEX - 4, base - 9, x + CODEX - 4 + (r.str.length * CW + 8) * E.inOutCubic(delP), base - 9, PALETTE.del, 3.5, 'butt');
          // underline "links" in the last row (explain)
          if (i === 4) {
            const u = E.outCubic(clamp((t - UL) / 0.2)), lx = x + CODEX + 12 * CW;
            if (u > 0) {
              fillRR(K, lx - 6, top + 6, (5 * CW + 12), rh - 12, 8, accentA(0.25 * u));
              line(K, lx, base + 9, lx + 5 * CW * u, base + 9, C.red, 5);
            }
          }
          if (i === 3 && t > UL) {     // "notes" ring pulse in the struck row
            const u = E.outCubic(clamp((t - UL - 0.08) / 0.2)), lx = x + CODEX + 12 * CW;
            strokeRR(K, lx - 6, top + 6, (5 * CW + 12) , rh - 12, 8, `rgba(255,106,77,${0.9 * u})`, 3);
          }
        });
        ry += rh;
      });
      K.restore();
      // LOCKED overlay with scan wipe
      if (t < WIPE0 + WIPE_D) {
        const wp = E.inOutCubic(clamp((t - WIPE0) / WIPE_D)), wx0 = x + PW * wp;
        K.save(); rr(K, x, y + HDR, PW, h - HDR, 26); K.clip(); K.beginPath(); K.rect(wx0, y + HDR, PW, h); K.clip();
        K.fillStyle = 'rgba(21,22,26,0.78)'; K.fillRect(x, y + HDR, PW, h);
        // diagonal hazard hatch
        K.strokeStyle = 'rgba(255,255,255,0.045)'; K.lineWidth = 10;
        for (let k = -20; k < 30; k++) { K.beginPath(); K.moveTo(x + k * 44, y + h); K.lineTo(x + k * 44 + (h - HDR), y + HDR); K.stroke(); }
        K.restore();
        if (wp > 0 && wp < 1) { line(K, wx0, y + HDR + 4, wx0, y + h - 4, C.red, 5, 'butt'); vdGlow(T, wx0, y + h / 2, 200, 0.45); }
        // lock (left) + the empty decision slot (right); the lock springs open and falls when your token fills the slot
        const cy = y + HDR + (h - HDR) / 2;
        const op = E.outBack(clamp((t - UNLOCK) / 0.1)), fall = Math.max(0, t - UNLOCK - 0.1);
        const jig = t < DRAG1 ? Math.sin(t * 60) * 4 * win(t, DRAG1 - 0.14, DRAG1, 0.04, 0.02) : 0;
        vdA([K], 1 - clamp(fall / 0.22), () => vdLock(K, LOCK_DX + jig - 90 * fall, cy + 8 - 260 * fall + 0.5 * 4200 * fall * fall, 0.92 * (1 + 0.1 * ring(t - UNLOCK, 4, 9)), op, fall * -160));
        vdA([K], 1 - clamp((t - DRAG1 + 0.06) / 0.08), () => {
          K.save(); K.setLineDash([12, 10]); strokeRR(K, SLOT_DX - SLOT_W / 2, cy - 40, SLOT_W, 80, 40, 'rgba(255,255,255,0.4)', 3); K.restore();
          text(K, 'waiting for your decision', SLOT_DX, cy + 8, { font: F.mono, weight: 700, size: 23, color: '#A6A39B' });
        });
      }
      burst(K, LOCK_DX, y + HDR + (h - HDR) / 2, t - UNLOCK, { n: 12, r0: 90, r1: 210, color: C.red, lw: 7, dur: 0.34 });
    });
    return h;
  }

  // ── checkpoint card (local 0..DW, 0..DH) ──
  function decisionCard(T, K, t) {
    vdShadow(T, 0, 0, DW, DH, 28, 0.45, 48, 26);
    fillRR(K, 0, 0, DW, DH, 28, '#FFFFFF'); strokeRR(K, 0, 0, DW, DH, 28, HAIR, 3);
    vdStar(K, 52, 50, 15, C.red);
    text(K, 'Build checkpoint', 78, 59, { font: F.mono, weight: 700, size: 26, color: C.ink, align: 'left' });
    text(K, 'deleting a shared note', 78 + measure(K, 'Build checkpoint', { font: F.mono, weight: 700, size: 26 }) + 16, 60, { font: F.serif, italic: true, weight: 400, size: 32, color: C.red, align: 'left' });
    line(K, 40, 86, DW - 40, 86, 'rgba(17,17,17,0.1)', 2, 'butt');
    const qf = { font: F.grot, weight: 500, size: 38, color: C.ink, align: 'left', ls: -0.6 };
    text(K, 'When someone deletes Travel, what should', 40, 142, qf);
    text(K, 'happen to “Trip ideas” in Summer?', 40, 190, qf);
    // option A (stays here until it falls)
    if (t < FALL_A) {
      const ia = E.outBack(clamp((t - DEC_IN - 0.1) / 0.22));
      const hv = win(t, HOVER_A - 0.04, MOVE_B + 0.02, 0.08, 0.1);
      vdA([T, K], clamp(ia * 2), () => X([T, K], OPT.x + OPT.w / 2 + (1 - ia) * 80, OPT.ya + OPT.h / 2, 1 + 0.02 * hv, 0, () =>
        vdChoice(T, K, 'Delete it everywhere', OPT.w, OPT.h, 38, { hover: hv, dim: clamp((t - CHOOSE) / 0.1), strike: clamp((t - STRIKE_A) / 0.12), shadow: 0.18 })));
    }
    // option B (until it detaches as the token)
    if (t < FOLD) {
      const ib = E.outBack(clamp((t - DEC_IN - 0.16) / 0.22));
      const press = win(t, CHOOSE - 0.03, CHOOSE + 0.05, 0.03, 0.08);
      vdA([T, K], clamp(ib * 2), () => X([T, K], OPT.x + OPT.w / 2 + (1 - ib) * 80, OPT.yb + OPT.h / 2, (1 - 0.035 * press) * (1 + 0.04 * ring(t - CHOOSE - 0.06, 4, 9)), 0, () =>
        vdChoice(T, K, 'Keep it in Summer', OPT.w, OPT.h, 38, { hover: win(t, MOVE_B + 0.04, CHOOSE + 0.1, 0.06, 0.05), fillP: E.outCubic(clamp((t - CHOOSE) / 0.22)), wx: 150, checkP: clamp((t - CHOOSE - 0.08) / 0.16), shadow: 0.18 })));
    }
  }
  const BW = OPT.w, BH = OPT.h;
  const B_WORLD = [DX + OPT.x + OPT.w / 2, DY + OPT.yb + OPT.h / 2];      // (540, 842)
  const tokenW = (K) => measure(K, 'Keep it in Summer', { font: F.grot, weight: 700, size: 36, ls: -0.7 }) + 80 * 0.98 + 34;
  // card pose: from chip 04 → stage → back into chip 04
  function cardPose(t) {
    if (t < DEC_IN || t >= FOLD + FOLD_D) return null;
    const p = inAt(t, DEC_IN, 2.4, 0.82), ps = inAt(t, DEC_IN, 2.6, 0.5), f = E.inBack(clamp((t - FOLD) / FOLD_D));
    const s0 = CHW / DW;
    let cx = lerp(C4X, DX + DW / 2, p), cy = lerp(C4Y, DY + DH / 2, p), s = lerp(s0, 1, ps), r = lerp(-9, 0, clamp(ps)) + 1.5 * ring(t - DEC_IN - 0.18, 2.5, 8);
    if (f !== 0) { cx = lerp(cx, C4X, f); cy = lerp(cy, C4Y, f); s = lerp(s, s0, clamp(f)); r = lerp(r, 7, f); }
    return { cx, cy, s, r, a: 1 - clamp((t - FOLD - FOLD_D * 0.8) / (FOLD_D * 0.2)) };
  }
  // the decision token: B row → token (held by cursor) → padlock → header → WHY row
  const LOCK_P = () => [PX + PW / 2 + SLOT_DX, PY + HDR + (PAD * 2 + 3 * ROWH) / 2];
  const HDR_SLOT = [PX + 300 + 140, PY + HDR / 2];
  const WHY_SLOT = [RX + 196 + 170, RY + 192];
  function tokenPose(t, K) {
    if (t < FOLD || t >= EXIT + EXIT_D) return null;
    const tw = tokenW(K), m = E.inOutCubic(clamp((t - FOLD) / 0.12));
    let w = lerp(BW, tw, m), h = lerp(BH, 80, m), fs = lerp(38, 36, m), r = lerp(22, 40, m), x = B_WORLD[0], y = B_WORLD[1], s = 1 + 0.06 * win(t, FOLD, DRAG1, 0.08, 0.06), rot = 0;
    const L = LOCK_P();
    const tokX0 = B_WORLD[0] - (BW - tw) / 2 * 0;          // stays centred
    if (t >= DRAG0) { const u = E.inOutCubic(clamp((t - DRAG0) / (DRAG1 - DRAG0))); x = lerp(tokX0, L[0], u); y = lerp(B_WORLD[1], L[1], u); rot = -4 * Math.sin(Math.PI * u); }
    if (t >= DRAG1) { x = L[0]; y = L[1]; s *= 1 + 0.08 * ring(t - UNLOCK, 5, 10); }
    if (t >= DOCK0) {
      const u = E.inOutCubic(clamp((t - DOCK0) / (DOCK1 - DOCK0)));
      [x, y] = bez([L[0], L[1]], [L[0] + 60, PY - 110], HDR_SLOT, u); s = lerp(s, 0.66, u); rot = 6 * Math.sin(Math.PI * u);
    }
    if (t >= DOCK1) { s = 0.66 * (1 + 0.1 * ring(t - DOCK1, 4, 9)); rot = 0; }
    return { x, y, w, h, fs, r, s, rot };
  }

  // ── implementation report (local 0..RW, 0..RH) ──
  function report(T, K, t) {
    vdShadow(T, 0, 0, RW, RH, 24, 0.42, 40, 22);
    fillRR(K, 0, 0, RW, RH, 24, '#FFFFFF'); strokeRR(K, 0, 0, RW, RH, 24, C.ink, 3);
    // nub pointing at "links"
    const nx = PX + CODEX + 14.5 * CW - RX;
    K.beginPath(); K.moveTo(nx - 18, 1.5); K.lineTo(nx, -18); K.lineTo(nx + 18, 1.5); K.closePath(); K.fillStyle = '#FFFFFF'; K.fill();
    K.beginPath(); K.moveTo(nx - 18, 0); K.lineTo(nx, -18); K.lineTo(nx + 18, 0); K.lineWidth = 3; K.strokeStyle = C.ink; K.lineJoin = 'round'; K.stroke();
    vdStar(K, 34, 40, 13, C.red);
    text(K, 'Implementation report', 56, 49, { font: F.mono, weight: 700, size: 24, color: C.ink, align: 'left' });
    text(K, '// explained', RW - 26, 49, { font: F.mono, weight: 500, size: 22, color: INK2, align: 'right' });
    line(K, 24, 70, RW - 24, 70, 'rgba(17,17,17,0.1)', 2, 'butt');
    // row 1: CHANGED
    const p1 = E.outBack(clamp((t - ROW1) / 0.2)), tf = { font: F.mono, weight: 700, size: 22 };
    vdA([K], clamp(p1 * 2), () => {
      X([K], 24 + 76, 118, p1, 0, () => { fillRR(K, -76, -24, 152, 48, 24, C.ink); text(K, 'changed', 0, 8, Object.assign({ color: '#FFFFFF' }, tf)); });
      const f = { font: F.grot, weight: 500, size: 32, align: 'left' }, w = clamp((t - ROW1 - 0.05) / 0.25);
      K.save(); K.beginPath(); K.rect(196, 80, (RW - 200) * E.outCubic(w), 70); K.clip();
      let cx = 196; for (const [s, c] of [['deletes the ', C.ink], ['links', C.red], [', not the notes', C.ink]]) { text(K, s, cx, 129, Object.assign({ color: c }, f)); cx += measure(K, s, f); }
      K.restore();
    });
    line(K, 24, 158, RW - 24, 158, 'rgba(17,17,17,0.07)', 2, 'butt');
    // row 2: WHY (token lands here)
    const p2 = E.outBack(clamp((t - WHY0 + 0.04) / 0.2));
    vdA([K], clamp(p2 * 2), () => {
      X([K], 24 + 76, 196, p2, 0, () => { fillRR(K, -76, -24, 152, 48, 24, C.red); text(K, 'why', 0, 8, Object.assign({ color: '#FFFFFF' }, tf)); });
      if (t < WHY1) { K.save(); K.setLineDash([8, 8]); strokeRR(K, 196, 196 - 30, 340, 60, 30, 'rgba(17,17,17,0.25)', 2.5); K.restore(); }
      const yp = clamp((t - WHY1 - 0.06) / 0.14);
      if (yp > 0) vdA([K], yp, () => text(K, 'your call', 556 + (1 - yp) * 16, 208, { font: F.serif, italic: true, weight: 400, size: 40, color: C.red, align: 'left' }));
    });
  }
  function reportPose(t) {
    if (t < REP_IN || t >= EXIT + EXIT_D) return null;
    const p = inAt(t, REP_IN, 2.5, 0.82), ps = inAt(t, REP_IN, 2.6, 0.5), f = E.inOutCubic(clamp((t - EXIT) / EXIT_D)), s0 = 165 / RW;
    let cx = lerp(C5X, RX + RW / 2, p), cy = lerp(C5Y, RY + RH / 2, p), s = lerp(s0, 1, ps), r = lerp(8, 0, clamp(ps)) - 2 * ring(t - REP_IN - 0.18, 2.5, 6);
    if (f > 0) { cx = lerp(cx, C5X, f); cy = lerp(cy, C5Y, f); s = lerp(s, s0, f); r = lerp(0, -6, f); }
    return { cx, cy, s, r, a: 1 - clamp((f - 0.85) / 0.15) };
  }

  // ── cursor path ──
  function cursorPose(t) {
    if (t < CUR0 || t > DOCK0 + 0.3) return null;
    const keys = [[CUR0, -150, 1820], [CLICK1, C4X - 8, C4Y - 4], [HOVER_A, 420, DY + OPT.ya + 50], [MOVE_B - 0.02, 436, DY + OPT.ya + 54], [MOVE_B + 0.06, 330, DY + OPT.yb + 46], [CHOOSE, 330, DY + OPT.yb + 46]];
    let x = keys[0][1], y = keys[0][2];
    for (let i = 1; i < keys.length; i++) { const [t0, x0, y0] = keys[i - 1], [t1, x1, y1] = keys[i]; if (t >= t0) { const u = E.inOutCubic(clamp((t - t0) / (t1 - t0))); x = lerp(x0, x1, u); y = lerp(y0, y1, u); } }
    // hesitation wiggle over A
    x += Math.sin((t - HOVER_A) * 38) * 7 * win(t, HOVER_A, MOVE_B - 0.03, 0.03, 0.03);
    let press = Math.max(win(t, CLICK1 - 0.04, CLICK1 + 0.03, 0.03, 0.06), win(t, CHOOSE - 0.04, CHOOSE + 0.04, 0.03, 0.06), win(t, DRAG1 - 0.02, UNLOCK + 0.02, 0.03, 0.05));
    if (t >= FOLD - 0.06) {
      const L = LOCK_P(), u0 = E.inOutCubic(clamp((t - FOLD + 0.06) / 0.1));
      const gx = B_WORLD[0] - 120, gy = B_WORLD[1];
      x = lerp(x, gx, u0); y = lerp(y, gy, u0);
      if (t >= DRAG0) { const u = E.inOutCubic(clamp((t - DRAG0) / (DRAG1 - DRAG0))); x = lerp(gx, L[0] - 120, u); y = lerp(gy, L[1], u); }
      if (t >= DRAG1) { x = L[0] - 120; y = L[1]; }
      if (t >= UNLOCK + 0.06) { const u = E.inCubic(clamp((t - UNLOCK - 0.06) / 0.24)); x = lerp(x, -200, u); y = lerp(y, 1900, u); }
      press = Math.max(press, win(t, FOLD - 0.02, DRAG1, 0.05, 0.05) * 0.6);
    }
    return { x, y, press };
  }

  // ── camera ──
  const CAM = Track({ x: 0, y: 0, z: 1 })
    .key(CLEAN0, { x: 0, y: 0, z: 1 })
    .key(DEC_IN + 0.2, { x: 6, y: 34, z: 1.055 }, E.inOutCubic)
    .key(CHOOSE, { x: 14, y: 22, z: 1.07 }, E.inOutCubic)
    .key(FOLD, { x: 0, y: 30, z: 1.06 }, E.inOutCubic)
    .key(DRAG1, { x: 0, y: 70, z: 1.1 }, E.inOutCubic)
    .key(TY1[1], { x: 22, y: 94, z: 1.14 }, E.inOutCubic)
    .key(TY2[1], { x: -6, y: 84, z: 1.15 }, E.inOutCubic)
    .key(REP_IN + 0.15, { x: 4, y: 6, z: 1.035 }, E.inOutCubic)
    .key(WHY1, { x: 0, y: -6, z: 1.055 }, E.inOutCubic)
    .key(EXIT, { x: 0, y: -4, z: 1.05 }, E.lin)
    .key(CLEAN1 - 0.01, { x: 0, y: 0, z: 1 }, E.inOutCubic);

  kick(STAMP + 0.02, 0.5, 0.6);   // the one punch: YOUR DECISION

  // ── focus path for the presenter's point / gaze ──
  const FOCUS = [[S0, C4X, C4Y], [DEC_IN + 0.06, 520, 650], [HOVER_A - 0.06, 420, DY + OPT.ya + 48], [MOVE_B, 380, DY + OPT.yb + 48], [STAMP - 0.04, 690, DY + OPT.ya + 48],
    [FOLD + 0.04, 460, 840], [DRAG1 - 0.1, 540, 640], [UNLOCK + 0.18, 360, 560], [TY1[1] - 0.1, 620, 560], [DEL, 420, 760], [TY2[0] + 0.05, 330, 816], [TY2[1], 700, 816],
    [REP_IN + 0.1, 420, 1000], [UL, 440, 820], [WHY0 - 0.02, 470, 500], [WHY1 - 0.04, 420, 1090], [EXIT + 0.02, C5X, C5Y]];
  function focusAt(t) {
    let x = FOCUS[0][1], y = FOCUS[0][2];
    for (let i = 1; i < FOCUS.length; i++) { const [t1, x1, y1] = FOCUS[i]; if (t >= t1 - 0.14) { const u = E.inOutCubic(clamp((t - t1 + 0.14) / 0.14)); x = lerp(x, x1, u); y = lerp(y, y1, u); } }
    return [x, y];
  }

  SC.decide = {
    label: '// 05 — you decide', bg: 'light',
    cam: t => (t < CLEAN0 || t >= CLEAN1) ? { x: 0, y: 0, z: 1, r: 0 } : Object.assign({ r: 0 }, CAM.at(t)),
    draw(T, K, t) {
      if (t < CLEAN0 || t >= CLEAN1) { learnCard(T, K, TC.x, TC.y, TC.s, { t }); return; }
      // ── code panel (behind the learning card while it rises) ──
      if (t >= PANEL_IN && t < EXIT_P + EXIT_PD) {
        const p = inAt(t, PANEL_IN, 1.9, 0.62), e = E.inBack(clamp((t - EXIT_P) / EXIT_PD));
        const oy = PY + (1 - p) * 1150, ox = PX - e * 1350, rot = (1 - clamp(p)) * 5 - e * 7;
        vdGlow(T, PX + PW / 2, PY + 220, 640, 0.3 * Math.exp(-Math.max(0, t - UNLOCK) * 2.5) * (t >= UNLOCK ? 1 : 0) + 0.08 * win(t, UNLOCK, DONE, 0.2, 0.3));
        panel(T, K, t, ox, oy, rot);
      }
      // ── learning card: bumps when something launches from / lands in a chip ──
      const bump = 0.035 * (ring(t - CLICK1, 3.5, 9) + ring(t - REP_IN, 3.5, 9)) + 0.03 * ring(t - FOLD - FOLD_D, 4, 10);
      const bmp = t >= CLEAN1 - 0.05 ? 0 : bump;
      if (Math.abs(bmp) < 0.001) learnCard(T, K, TC.x, TC.y, TC.s, { t });
      else X([T, K], CARD_CX, CARD_CY, 1 + bmp, 0, () => learnCard(T, K, -TC_W / 2, -TC_H / 2, TC.s, { t }));
      // chip ring flashes
      [[CLICK1, C4X], [FOLD + FOLD_D, C4X], [REP_IN, C5X], [EXIT + EXIT_D, C5X]].forEach(([tt, cx]) => {
        const d = t - tt; if (d < 0 || d > 0.4) return;
        vdA([K], 1 - d / 0.4, () => strokeRR(K, cx - CHW / 2 - 6 - d * 30, C4Y - 40 - d * 30, CHW + 12 + d * 60, 80 + d * 60, 18, C.red, 4));
      });
      // ── checkpoint card ──
      const cp = cardPose(t);
      if (cp) {
        if (t < DEC_IN + 0.3) { const k = clamp((t - DEC_IN) / 0.3); vdA([K], 0.5 * (1 - k), () => line(K, C4X, C4Y, cp.cx, cp.cy, C.red, 14 * (1 - k) + 2)); }
        vdGlow(T, B_WORLD[0] - 200, B_WORLD[1], 420, 0.32 * Math.exp(-Math.max(0, t - CHOOSE) * 2.2) * (t >= CHOOSE ? 1 : 0));
        vdA([T, K], cp.a, () => X([T, K], cp.cx, cp.cy, cp.s, cp.r, () => { T.translate(-DW / 2, -DH / 2); K.translate(-DW / 2, -DH / 2); decisionCard(T, K, t); }));
      }
      // option A falls off
      if (t >= FALL_A && t < FALL_A + 0.7) {
        const d = t - FALL_A, x = DX + OPT.x + OPT.w / 2 - 260 * d, y = DY + OPT.ya + OPT.h / 2 - 320 * d + 0.5 * 5200 * d * d;
        vdA([T, K], 1 - clamp((d - 0.3) / 0.2), () => X([T, K], x, y, 1 - d * 0.3, -50 * d * d * 4 - 6 * d, () =>
          vdChoice(T, K, 'Delete it everywhere', OPT.w, OPT.h, 38, { dim: 1, strike: 1, shadow: 0.25 })));
      }
      // ── implementation report ──
      const rp = reportPose(t);
      if (rp) {
        if (t < REP_IN + 0.3) { const k = clamp((t - REP_IN) / 0.3); vdA([K], 0.5 * (1 - k), () => line(K, C5X, C5Y, rp.cx, rp.cy, C.red, 14 * (1 - k) + 2)); }
        // dotted connector from the nub to "links"
        const c = E.outCubic(clamp((t - ROW1 + 0.1) / 0.2)) * (1 - clamp((t - EXIT) / 0.06));
        if (c > 0 && CW) { const nx = PX + CODEX + 14.5 * CW; K.save(); K.setLineDash([6, 7]); line(K, nx, RY - 18, nx, RY - 18 - 52 * c, C.red, 3, 'butt'); K.restore(); circle(K, nx, RY - 18 - 52 * c, 6 * c, C.red); }
        vdA([T, K], rp.a, () => X([T, K], rp.cx, rp.cy, rp.s, rp.r, () => { T.translate(-RW / 2, -RH / 2); K.translate(-RW / 2, -RH / 2); report(T, K, t); }));
        shock(K, WHY_SLOT[0], WHY_SLOT[1], t - WHY1, { r: 150, color: C.red, lw: 4, dur: 0.28 });
      }
    },
    front(T, K, t) {
      if (t < CLEAN0 || t >= CLEAN1) return;
      // stamp rides on the card
      const cp = cardPose(t);
      if (cp && t >= STAMP) vdA([K], cp.a, () => X([K], cp.cx, cp.cy, cp.s, cp.r, () => {
        vdStamp(K, 'YOUR DECISION', 150, -DH / 2 + OPT.ya + OPT.h / 2, t - STAMP, { size: 46, rot: -7 });
      }));
      if (cp && t >= STAMP) burst(K, cp.cx + 150, cp.cy - DH / 2 + OPT.ya + OPT.h / 2, t - STAMP - 0.1, { n: 14, r0: 170, r1: 300, color: C.red, lw: 7, dur: 0.34 });
      // decision token (in hand → lock → header → WHY row)
      const tp = tokenPose(t, K);
      if (tp) {
        let { x, y, s, rot } = tp;
        if (t >= WHY0) { const u = E.inOutCubic(clamp((t - WHY0) / (WHY1 - WHY0))); [x, y] = bez(HDR_SLOT, [HDR_SLOT[0] + 260, 720], WHY_SLOT, u); s = lerp(0.66, 0.62, u) * (1 + 0.12 * Math.sin(Math.PI * u)); rot = -8 * Math.sin(Math.PI * u); }
        if (t >= WHY1) s = 0.62 * (1 + 0.1 * ring(t - WHY1, 4, 9));
        // follow the panel / report when they leave or settle
        if (t >= EXIT) { const rp = reportPose(t); if (!rp) return; const k = rp.s; x = rp.cx + (WHY_SLOT[0] - RX - RW / 2) * k; y = rp.cy + (WHY_SLOT[1] - RY - RH / 2) * k; s = 0.62 * k; }
        if (t >= WHY0 - 0.001 && t < WHY0 + 0.05) burst(K, HDR_SLOT[0], HDR_SLOT[1], t - WHY0, { n: 8, r0: 90, r1: 150, color: C.red, lw: 4, dur: 0.2 });
        const trail = t >= DOCK0 && t < DOCK1 ? 1 : t >= WHY0 && t < WHY1 ? 1 : 0;
        if (trail) vdA([K], 0.25, () => circle(K, x, y, 30 * s, C.red));
        X([T, K], x, y, s, rot, () => vdChoice(T, K, 'Keep it in Summer', tp.w, tp.h, tp.fs, { fillP: 1, checkP: 1, wx: 0, r: tp.r, shadow: t < DOCK1 ? 0.35 : 0.15, outline: false }));
      }
      // cursor ("you")
      const cu = cursorPose(t);
      if (cu) vdCursor(T, K, cu.x, cu.y, cu.press);
    },
    guy(t) {
      const D0 = PRESENTER_DOCK, up = E.inOutCubic(clamp((t - S0 - 0.12) / 0.3)) * (1 - E.inOutCubic(clamp((t - EXIT + 0.02) / 0.18)));
      const d = { x: lerp(D0.x, 890, up), y: lerp(D0.y, 1886, up), s: lerp(D0.s, 0.85, up) }, st = { x: d.x, y: d.y, s: d.s };   // rises into the free space mid-scene
      if (t >= CLEAN1) return { x: D0.x, y: D0.y, s: D0.s, armL: 'point', armLp: 1, pointAng: Math.atan2(C5Y - (D0.y - 264 * D0.s), -(C5X - (D0.x - 226 * D0.s))) / D2R };
      const [fx, fy] = focusAt(t);
      const shx = d.x - 226 * d.s, shy = d.y - 264 * d.s;
      const ang = Math.atan2(fy - shy, -(fx - shx)) / D2R;
      const hx = d.x, hy = d.y - 575 * d.s;
      const lx = clamp((fx - hx) / 520, -1, 1) * 0.85, ly = clamp((fy - hy) / 760, -1, 1) * 0.85;
      const pIn = E.inOutCubic(clamp((t - S0 - 0.02) / 0.2));
      return Object.assign(st,
        arms(t, [[STAMP - 0.04, FOLD + 0.06, 'R', 'thumb'],
          [UNLOCK + 0.02, UNLOCK + 0.42, 'R', 'fist'],
          [REP_IN + 0.05, ROW1 + 0.4, 'R', 'hold'],
          [WHY1 - 0.02, CLEAN1 - 0.06, 'R', 'thumb']]),
        { armL: 'point', armLp: pIn, pointAng: ang },
        expr(t, [[S0 + 0.05, DEC_IN + 0.2, { brow: 0.5, smile: 0.3 }],
          [HOVER_A - 0.05, MOVE_B + 0.02, { browTilt: 0.7, smile: -0.15 }],
          [CHOOSE, FOLD, { smile: 0.75, brow: 0.45 }],
          [STAMP + 0.02, STAMP + 0.22, { wink: 1 }],
          [DRAG0, UNLOCK, { brow: 0.6, smile: 0.1 }],
          [UNLOCK, UNLOCK + 0.35, { shock: 0.35, brow: 0.9, smile: 0.4 }],
          [UNLOCK + 0.35, DONE, { brow: 0.35, smile: 0.3 }],
          [DONE, REP_IN, { smile: 0.55, brow: 0.2 }],
          [REP_IN, WHY0, { brow: 0.55, smile: 0.35, browTilt: 0.3 }],
          [WHY0, CLEAN1, { smile: 0.75, brow: 0.4 }]]),
        { lookX: lx, lookY: ly, headTurn: lx * 0.32 * pIn, headTilt: -5 * win(t, HOVER_A - 0.05, MOVE_B, 0.08, 0.1) + 4 * win(t, CHOOSE, FOLD, 0.1, 0.2) - 3 * win(t, REP_IN, WHY0, 0.15, 0.2) + 5 * win(t, WHY1, CLEAN1, 0.1, 0.1),
          headNod: 0.5 * win(t, STAMP, STAMP + 0.2, 0.06, 0.12) + 0.4 * win(t, DONE, DONE + 0.18, 0.05, 0.12) + 0.45 * win(t, WHY1, WHY1 + 0.2, 0.05, 0.12) });
    },
  };
})();
