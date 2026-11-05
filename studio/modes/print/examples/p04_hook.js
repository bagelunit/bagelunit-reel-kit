// ═════════════ 01 · HOOK  [0 → owi(18)−0.1 ≈ 4.46] · print orange ═════════════
// NOTE: reference code from a real reel. Word indices (wi(n)) refer to that reel's script; re-cue on your own words.json.
// Through-object left in: learnCard() (kit); the skills card flips into it.
// assets not included: none (all vector drawing).
// "Vibe coding is quietly making you worse at coding, and there's now a plugin made to stop that."
// Beats: frame 0 a vibe-coding window is already spitting code (prompt → stream → "✓ Done!", auto-accept ON) while a
//   "your coding skills" card springs up · every "Done!" fires a red spark down that knocks one skill chip out of its slot
//   (quietly: chips just slip out and tumble off-screen, the status flips to "draining") · "worse" the code you shipped
//   scrambles into gibberish (camera punch), a cursor selects a line: "what does this do?", red ? marks · "and there's now"
//   an empty socket pops up on the skills card, one more chip works loose · "plugin" a plug flies in on its cable and JAMS into
//   the socket (the one kick): sparks, the falling chip FREEZES mid-air, auto-accept flips off, status "stopped" · "stop" the
//   loose chip snaps back · the window whips off, the cable whips away, the skills card flips over into the LEARNING-MODE card.
// Hand-off ≥ 4.31: exactly learnCard at TC + the presenter at PRESENTER_DOCK, camera identity. Helpers prefixed hk.
(() => {
  const S1 = owi(18) - 0.1;                                                  // 4.46
  const tQuiet = owi(3), tWorse = owi(6), tAt = owi(7), tAnd = owi(9), tPlugin = owi(13), tMade = owi(14), tStop = owi(16);
  const tJam = tPlugin + 0.06;                    // plug hits the socket (3.46)
  const tFly0 = tAnd + 0.12, tFly1 = tPlugin - 0.1, tHover = tPlugin;        // plug flight / hover / jam
    const tF0 = tStop + 0.06, tF1 = 4.30, tDock = 4.31;                          // card flip, then hand-off
  const G = '#8a8780', SOFT = '#C9C5BC', TRACK = '#F1EFEA', CODE_BG = '#15161A';

  // ── layout (scene coords) ──
  const WN = { x: 80, y: 450, w: 920, h: 500 };                // vibe-coding window
  const PANE = { x: 100, y: 522, w: 528, h: 412 };             // code pane (left)
  const CHAT = { x: 650, r: 980, top: 522, bot: 934 };         // chat column (right)
  const CW = TC_W, CH = TC_H;                                  // skills card = same footprint as the learning card
  const CARD_Y = 1040;                                         // skills card sits here, then travels down to TC while it flips
  const SOCK = { x: 430, w: 176, h: 50 };                      // socket (card-local centre x)
  const PLUG_REST = { x: TC.x + SOCK.x, y: CARD_Y - SOCK.h + 4 - 52 };    // plug body centre when jammed
  const tWx = tAnd + 0.1;                                      // the window whips off (frees the stage for the plug)

  // ── tiny helpers ──
  const hkA = (cs, a, fn) => { if (a <= 0.002) return; for (const c of cs) { c.save(); c.globalAlpha *= clamp(a); } fn(); for (const c of cs) c.restore(); };
  function hkGlow(T, x, y, r, a, sy = 1) {
    if (a <= 0.01) return;
    T.save(); T.translate(x, y); T.scale(1, sy);
    const g = T.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, `rgba(255,0,0,${0.55 * a})`); g.addColorStop(0.55, `rgba(255,0,0,${0.2 * a})`); g.addColorStop(1, 'rgba(255,0,0,0)');
    T.fillStyle = g; T.fillRect(-r, -r, 2 * r, 2 * r); T.restore();
  }
  function hkCard(T, K, x, y, w, h, r, o = {}) {
    T.save(); T.shadowColor = `rgba(0,0,0,${o.sh ?? 0.4})`; T.shadowBlur = o.blur ?? 40; T.shadowOffsetY = o.off ?? 22; fillRR(T, x, y, w, h, r, '#FFFFFF'); T.restore();
    fillRR(T, x, y, w, h, r, '#FFFFFF');
    fillRR(K, x, y, w, h, r, o.fill || '#FFFFFF'); strokeRR(K, x, y, w, h, r, o.stroke || 'rgba(17,17,17,0.14)', o.lw ?? 2);
  }
  const qb = (a, c, b, u) => [(1 - u) * (1 - u) * a[0] + 2 * (1 - u) * u * c[0] + u * u * b[0], (1 - u) * (1 - u) * a[1] + 2 * (1 - u) * u * c[1] + u * u * b[1]];
  const frozen = t => t >= tJam;
  const fz = t => Math.min(t, tJam);                       // clocks that stop dead when the plug goes in
  const jamRing = t => t > tJam ? ring(t - tJam, 4.5, 8) : 0;

  // ═════ the code that streams in (real-looking notes-app code) ═════
  const CODE = [
    'async function delFolder(id){',
    '  const ids = links',
    '    .filter(l => l.f === id)',
    '    .map(l => l.noteId);',
    '  await db.notes',
    '    .bulkDelete(ids);',
    '  await db.folders.delete(id);',
    '}',
    'export function useFolders(){',
    '  const [f, setF] = useState()',
    '  useEffect(() => {',
    '    db.folders.toArray()',
    '      .then(setF);',
    '  }, []);',
  ];
  const KW = /\b(async|function|const|await|export|return)\b/g;
  const COL = CODE.map(s => {                              // per-char colours
    const c = [...s].map(ch => /[(){}\[\];,.=>]/.test(ch) ? '#8F8B83' : '#E9E6DE');
    let m; KW.lastIndex = 0; while ((m = KW.exec(s))) for (let i = m.index; i < m.index + m[0].length; i++) c[i] = '#FF7A52';
    const mm = /(\.)([a-zA-Z]+)/g; while ((m = mm.exec(s))) for (let i = m.index + 1; i < m.index + 1 + m[2].length; i++) c[i] = '#A9D9A2';
    const fn = /function (\w+)/.exec(s); if (fn) for (let i = fn.index + 9; i < fn.index + 9 + fn[1].length; i++) c[i] = '#FFD58A';
    return c;
  });
  const CUM = []; { let n = 0; for (const s of CODE) { CUM.push(n); n += s.length + 4; } }
  const CPS = 128, STREAM0 = -0.72;                        // chars per second, stream started before frame 0
  const charsAt = t => (fz(t) - STREAM0) * CPS;
  const GLY = '#%&@$*?!{}<>=/\\~^;:01§¿';
  const LH = 42, PAD_X = 20, PAD_Y = 46, VIS = 9.5;
  const scrT = (row, col) => tWorse + 0.03 + row * 0.03 + col * 0.0055;      // scramble wave (pane rows)

  function scrollAt(t) {
    const n = charsAt(t); let cur = 0; for (let i = 0; i < CODE.length; i++) if (n >= CUM[i]) cur = i;
    return Math.max(0, cur + clamp((n - CUM[cur]) / (CODE[cur].length + 4)) + 1 - VIS) * LH;
  }
  function hkPane(T, K, t) {
    const { x, y, w, h } = PANE;
    fillRR(K, x, y, w, h, 18, CODE_BG);
    // file tab
    fillRR(K, x + 14, y + 12, 176, 28, 8, '#24262C');
    text(K, 'notes.js', x + 30, y + 33, { font: F.mono, weight: 700, size: 18, color: '#C9C5BC', align: 'left' });
    circle(K, x + 172, y + 26, 5, t < tJam ? C.red : '#5A5C63');
    const n = charsAt(t), scroll = scrollAt(t);
    let cur = 0; for (let i = 0; i < CODE.length; i++) if (n >= CUM[i]) cur = i;
    const cw = measure(K, 'M', { font: F.mono, weight: 500, size: 26 });
    K.save(); rr(K, x, y + 44, w, h - 48, 0); K.clip();
    let caret = null;
    CODE.forEach((s, li) => {
      const shown = clamp(Math.floor(n - CUM[li]), 0, s.length);
      if (n < CUM[li]) return;
      const by = y + PAD_Y + 30 + li * LH - scroll;
      if (by < y + 30 || by > y + h + 40) return;
      const row = Math.max(0, Math.round((by - y - PAD_Y - 30) / LH));
      for (let i = 0; i < shown; i++) {
        const ch = s[i]; if (ch === ' ') continue;
        const ts = scrT(row, i), sc = t >= ts;
        let g = ch, col = COL[li][i], dy = 0;
        if (sc) {
          const k = Math.floor(fz(t) * 16 + li * 7 + i * 3);
          g = GLY[Math.floor(hash(k * 1.37 + i) * GLY.length)];
          col = hash(k + li) > 0.82 ? 'rgba(255,122,82,0.8)' : '#6E6A63';
          dy = (hash(k * 2.1) - 0.5) * 6 * clamp((t - ts) / 0.15) * (frozen(t) ? 0 : 1);
          const flash = 1 - clamp((t - ts) / 0.08);
          if (flash > 0) col = '#FFFFFF';
        }
        text(K, g, x + PAD_X + i * cw + cw / 2, by + dy, { font: F.mono, weight: 500, size: 26, color: col });
      }
      if (shown < s.length || (li === cur && shown === s.length)) caret = [x + PAD_X + shown * cw, by];
    });
    if (caret && !frozen(t) && Math.floor(t * 5) % 2 === 0) fillRR(K, caret[0] + 2, caret[1] - 24, 14, 30, 2, C.red);
    K.restore();
    return { cw, scroll };
  }

  // ═════ chat column: prompt → "✓ Done!" (fast, accept, accept, accept) ═════
  const MSG = [['you', 'make a notes app', -0.9], ['ai', 'Done!', 0.43], ['you', 'add folders', 0.72], ['ai', 'Done!', 1.04],
    ['you', 'fix the bug', 1.30], ['ai', 'Done!', 1.58]];
  const MH = 60, MG = 14;
  const DONE_T = MSG.filter(m => m[0] === 'ai').map(m => m[2]);
  function msgY(t, i) {                 // bottom-anchored stack, springs up as new messages arrive
    let off = 0;
    for (let j = i + 1; j < MSG.length; j++) off += (MH + MG) * clamp(pop(t - MSG[j][2], 2.6, 0.62), 0, 1.05);
    return CHAT.bot - MH - off;
  }
  function hkChat(T, K, t) {
    K.save(); rr(K, CHAT.x - 10, CHAT.top, CHAT.r - CHAT.x + 20, CHAT.bot - CHAT.top + 4, 0); K.clip();
    MSG.forEach(([who, s, t0], i) => {
      const a = pop(t - t0, 2.8, 0.55); if (a <= 0.01) return;
      const y = msgY(t, i);
      if (y + MH < CHAT.top - 4) return;
      const fade = clamp((y - CHAT.top + 30) / 40);
      K.save(); K.globalAlpha *= fade;
      if (who === 'you') {
        const f = { font: F.grot, weight: 500, size: 27 }, bw = measure(K, s, f) + 44;
        X([K], CHAT.r - bw / 2 + (1 - clamp(a)) * 70, y + MH / 2, lerp(0.7, 1, clamp(a)), 0, () => {
          fillRR(K, -bw / 2, -MH / 2, bw, MH, 22, C.ink);
          text(K, s, 0, 9, Object.assign({ color: '#FFFFFF' }, f));
        });
      } else {
        const f = { font: F.grot, weight: 700, size: 28 }, bw = measure(K, s, f) + 96;
        const sq = 1 + ring(t - t0 - 0.08, 3.5, 8) * 0.12;
        X([K], CHAT.x + bw / 2, y + MH / 2, Math.max(0.01, a) * sq, (1 - clamp(a)) * -6, () => {
          fillRR(K, -bw / 2, -MH / 2, bw, MH, 22, '#FFFFFF'); strokeRR(K, -bw / 2, -MH / 2, bw, MH, 22, 'rgba(17,17,17,0.16)', 2);
          circle(K, -bw / 2 + 32, 0, 17, C.red);
          check(K, -bw / 2 + 32, 0, 20, clamp((t - t0 - 0.05) / 0.16), '#FFFFFF', 4.5);
          text(K, s, -bw / 2 + 60, 10, Object.assign({ color: C.ink, align: 'left' }, f));
        });
      }
      K.restore();
    });
    K.restore();
  }
  // where the k-th "Done!" sits right now (for the spark)
  const doneAt = (t, k) => { const i = MSG.findIndex((m, j) => m[0] === 'ai' && MSG.slice(0, j + 1).filter(q => q[0] === 'ai').length === k + 1); return [CHAT.x + 40, msgY(t, i) + MH / 2]; };

  // ═════ the window ═════
  function hkWindow(T, K, t) {
    const ent = pop(t + 0.3, 2.2, 0.5);
    const ex = E.inBack(clamp((t - tWx) / 0.3));
    if (ex >= 1) return;
    const dim = 0.35 * win(t, tAnd - 0.02, tWx + 1, 0.15, 0.1);
    const cx = WN.x + WN.w / 2, cy = WN.y + WN.h / 2;
    const punch = 1 + 0.018 * ring(t - tWorse, 3, 7) * (t >= tWorse ? 1 : 0);
    hkGlow(T, PANE.x + PANE.w / 2, PANE.y + PANE.h / 2, 520, 0.85 * win(t, tWorse, tAnd + 0.2, 0.08, 0.4), 0.75);
    X([T, K], cx - ex * 1500, cy + (1 - clamp(ent)) * 120 + jamRing(t) * 8, lerp(0.94, 1, clamp(ent)) * punch * (1 - dim * 0.05), (1 - clamp(ent)) * -3 - ex * 14, () => {
      T.translate(-cx, -cy); K.translate(-cx, -cy);
      hkCard(T, K, WN.x, WN.y, WN.w, WN.h, 28, { stroke: C.ink, lw: 4, sh: 0.42 });
      // title bar
      [0, 1, 2].forEach(i => circle(K, WN.x + 34 + i * 24, WN.y + 38, 7.5, i === 0 ? C.red : '#E3DFD6'));
      text(K, '// vibe coding', WN.x + 118, WN.y + 46, { font: F.mono, weight: 700, size: 22, color: C.ink, align: 'left' });
      // auto-accept toggle (flips OFF when the plug goes in)
      const off = E.outBack(clamp((t - tJam - 0.06) / 0.22));
      const tf = { font: F.mono, weight: 700, size: 20 }, lab = 'auto-accept';
      const tw = measure(K, lab, tf), sw = 64, pw = tw + sw + 46, px = WN.x + WN.w - 24 - pw, py = WN.y + 18;
      const tb = 1 + ring(t - tJam - 0.06, 4, 9) * 0.12 * (frozen(t) ? 1 : 0);
      X([K], px + pw / 2, py + 20, tb, 0, () => {
        fillRR(K, -pw / 2, -20, pw, 40, 20, TRACK);
        text(K, lab, -pw / 2 + 18, 7, Object.assign({ color: frozen(t) ? G : C.ink, align: 'left' }, tf));
        const sx = pw / 2 - sw - 8;
        fillRR(K, sx, -14, sw, 28, 14, off > 0.5 ? '#CFCBC2' : C.red);
        circle(K, sx + lerp(sw - 14, 14, clamp(off)), 0, 11, '#FFFFFF');
      });
      line(K, WN.x, WN.y + 64, WN.x + WN.w, WN.y + 64, '#ECEAE4', 2, 'butt');
      hkPane(T, K, t);
      hkChat(T, K, t);
      // the cursor selects a (now unreadable) line → "what does this do?"
      hkSelect(T, K, t);
      if (dim > 0.01) fillRR(K, WN.x, WN.y, WN.w, WN.h, 28, `rgba(246,245,241,${dim})`);
    });
  }

  // ── selection + cursor + question bubble (on "at coding") ──
  const SEL_LINE = 9, tSel = tAt - 0.04, tAsk = tAt + 0.08;
  const QS = [[tAsk + 0.14, 470, 610, -12], [tAsk + 0.26, 150, 880, 10], [tAsk + 0.38, 420, 905, 8]];
  function hkSelect(T, K, t) {
    if (t < tWorse + 0.05) return;
    const sy = PANE.y + PANE_ROWY(SEL_LINE) - scrollAt(t);
    const sp = E.outCubic(clamp((t - tSel) / 0.2));
    if (sp > 0) {
      fillRR(K, PANE.x + 10, sy - 32, (PANE.w - 20) * sp, 44, 8, accentA(0.30));
      if (sp >= 1) strokeRR(K, PANE.x + 10, sy - 32, PANE.w - 20, 44, 8, C.red, 3);
    }
    QS.forEach(([q0, qx, qy, r]) => {
      const p = E.outBack(clamp((t - q0) / 0.22)) * (1 - E.inCubic(clamp((t - tAnd) / 0.16)));
      if (p > 0.01) X([K], qx, qy, p * (1 + 0.06 * Math.sin((t - q0) * 9)), r, () => text(K, '?', 0, 22, { font: F.serif, italic: true, weight: 400, size: 76, color: C.red }));
    });
  }
  const PANE_ROWY = row => PAD_Y + 30 + row * LH;

  function hkCursorBubble(T, K, t) {
    if (t < tWorse + 0.05 || t > tAnd + 0.4) return;
    const exitP = E.inBack(clamp((t - tAnd + 0.02) / 0.2));
    // cursor glides in from the bottom-right and parks on the selected line
    const ci = E.inOutCubic(clamp((t - tWorse - 0.08) / 0.3));
    const tx = PANE.x + 360, ty = PANE.y + PANE_ROWY(SEL_LINE) - scrollAt(t) - 12;
    const cx = lerp(1060, tx, ci) - exitP * 900, cy = lerp(990, ty, ci) + jitter(t) * (1 - ci);
    const press = Math.exp(-Math.max(0, t - tSel) * 10) * (t > tSel ? 1 : 0);
    X([T, K], cx, cy, 0.9, 0, () => {
      T.save(); T.shadowColor = 'rgba(0,0,0,0.4)'; T.shadowBlur = 14; T.shadowOffsetY = 10; T.fillStyle = '#FFFFFF'; T.beginPath(); T.moveTo(0, 0); T.lineTo(0, 92); T.lineTo(74, 60); T.closePath(); T.fill(); T.restore();
      cursor(K, 0, 0, 1, press);
    });
    // bubble under the window, tail up to the selected line
    const bp = pop(t - tAsk, 2.6, 0.5) * (1 - exitP);
    if (bp > 0.01) {
      const str = 'what does this do?', f = { font: F.grot, weight: 500, size: 38, ls: -0.8 }, bw = measure(K, str, f) + 64, bh = 104;
      const ly = PANE.y + PANE_ROWY(SEL_LINE) - scrollAt(t) - 10;       // selected line
      const bx = 572, by = ly + 22;
      X([T, K], bx, by + bh / 2, Math.max(0.01, bp), (1 - clamp(bp)) * 6, () => {
        const x0 = 0, y0 = -bh / 2;
        T.save(); T.shadowColor = 'rgba(0,0,0,0.35)'; T.shadowBlur = 30; T.shadowOffsetY = 16; fillRR(T, x0, y0, bw, bh, 26, '#FFFFFF'); T.restore();
        fillRR(T, x0, y0, bw, bh, 26, '#FFFFFF');
        // tail → up-left to the selected line
        K.beginPath(); K.moveTo(x0 + 2, y0 + 30); K.lineTo(x0 - 40, y0 - 22); K.lineTo(x0 + 40, y0 + 2); K.closePath(); K.fillStyle = '#FFFFFF'; K.fill();
        K.lineWidth = 4; K.strokeStyle = C.ink; K.lineJoin = 'round'; K.beginPath(); K.moveTo(x0, y0 + 32); K.lineTo(x0 - 40, y0 - 22); K.lineTo(x0 + 42, y0); K.stroke();
        fillRR(K, x0, y0, bw, bh, 26, '#FFFFFF'); strokeRR(K, x0, y0, bw, bh, 26, C.ink, 4);
        text(K, '// you', x0 + 28, y0 + 36, { font: F.mono, weight: 700, size: 20, color: G, align: 'left' });
        const n = Math.floor(clamp((t - tAsk + 0.02) / 0.2) * str.length);
        text(K, str.slice(0, n), x0 + 28, y0 + 82, Object.assign({ color: C.ink, align: 'left' }, f));
      });
    }
  }
  const jitter = t => Math.sin(t * 31) * 6;

  // ═════ "your coding skills" card + chips that fall out ═════
  const SKILL = ['debugging', 'SQL', 'async', 'git', 'CSS', 'data model'];
  // [slot, t0 (leaves slot), vx, vy, spin]
  const FALL = [[5, DONE_T[0] + 0.12, 160, -620, 260], [2, DONE_T[1] + 0.12, 230, -560, 300], [4, DONE_T[2] + 0.12, 140, -600, 320],
    [1, tWorse + 0.08, -260, -760, -420], [3, tAnd + 0.36, 150, -260, 150]];
  const cardY = t => CARD_Y;
  // stage group (skills card + socket + plug + cable + falling chips): rises to centre stage once the window is gone, then rides down to TC
  const STG = Track({ s: 1, dx: 0, dy: 0 });
  STG.key(tAnd + 0.06, { s: 1, dx: 0, dy: 0 }).key(tAnd + 0.5, { s: 1.24, dx: -30, dy: -270 }, E.inOutCubic)
    .key(tStop - 0.02, { s: 1.24, dx: -30, dy: -270 }).key(tF1, { s: 1, dx: 0, dy: TC.y - CARD_Y }, E.inOutCubic);
  const gMap = (t, x, y) => { const g = STG.at(t); return [TC.x + (x - TC.x) * g.s + g.dx, CARD_Y + (y - CARD_Y) * g.s + g.dy]; };
  function inStage(T, K, t, fn) {
    const g = STG.at(t);
    for (const c of [T, K]) { c.save(); c.translate(TC.x + g.dx, CARD_Y + g.dy); c.scale(g.s, g.s); c.translate(-TC.x, -CARD_Y); }
    fn();
    for (const c of [T, K]) c.restore();
  }
  const LOOSE5 = tAnd + 0.02, LOOSE0 = tAnd + 0.2;
  const slotGeo = i => { const row = i < 3 ? 0 : 1, col = row ? i - 3 : i, cw = (CW - 48 - 16) / 3; return { x: 24 + col * (cw + 8), y: 80 + row * 82, w: cw, h: 68 }; };
  const fallOf = i => FALL.find(f => f[0] === i);
  const leftAt = (t, i) => { const f = fallOf(i); return f && t >= f[1]; };
  function chipFace(K, i, w, h, on = true) {
    fillRR(K, 0, 0, w, h, 14, on ? C.ink : TRACK);
    text(K, String(i + 1).padStart(2, '0'), 12, 26, { font: F.mono, weight: 700, size: 15, color: on ? 'rgba(255,255,255,0.6)' : '#B3AFA6', align: 'left' });
    const nm = SKILL[i], fs = Math.min(21, (w - 16) / (nm.length * 0.62));
    text(K, nm, w / 2, h - 16, { font: F.mono, weight: 700, size: fs, color: on ? '#FFFFFF' : '#B3AFA6' });
  }
  function skillsCard(T, K, t) {
    const w = CW, h = CH;
    T.save(); T.shadowColor = 'rgba(0,0,0,0.38)'; T.shadowBlur = 30; T.shadowOffsetY = 14; fillRR(T, 0, 0, w, h, 20, '#FFFFFF'); T.restore();
    fillRR(K, 0, 0, w, h, 20, '#FFFFFF'); strokeRR(K, 0, 0, w, h, 20, 'rgba(17,17,17,0.14)', 2);
    text(K, '// your coding skills', 24, 42, { font: F.mono, weight: 700, size: 20, color: C.ink, align: 'left' });
    // status pill
    const st = frozen(t) ? 'stopped' : t >= tQuiet ? 'draining' : 'stable';
    const sf = { font: F.mono, weight: 700, size: 19 }, pw = measure(K, st, sf) + 50;
    const k0 = frozen(t) ? tJam : tQuiet;
    const pb = 1 + (t >= tQuiet ? ring(t - k0, 4, 9) * 0.16 : 0) + (t >= tStop ? ring(t - tStop, 4, 9) * 0.18 : 0);
    X([K], w - 24 - pw / 2, 33, pb, 0, () => {
      const blink = st === 'draining' ? 0.75 + 0.25 * Math.sin(t * 16) : 1;
      fillRR(K, -pw / 2, -17, pw, 34, 17, st === 'stopped' ? C.ink : st === 'draining' ? C.red : TRACK);
      if (st === 'draining') { K.save(); K.globalAlpha *= blink; K.beginPath(); K.moveTo(-pw / 2 + 14, -5); K.lineTo(-pw / 2 + 28, -5); K.lineTo(-pw / 2 + 21, 6); K.closePath(); K.fillStyle = '#FFFFFF'; K.fill(); K.restore(); }
      else if (st === 'stopped') { fillRR(K, -pw / 2 + 14, -7, 4, 14, 1, '#FFFFFF'); fillRR(K, -pw / 2 + 22, -7, 4, 14, 1, '#FFFFFF'); }
      else circle(K, -pw / 2 + 20, 0, 5, '#B3AFA6');
      text(K, st, 10, 7, Object.assign({ color: st === 'stable' ? G : '#FFFFFF' }, sf));
    });
    if (t >= tStop && t < tStop + 0.35) { const q = (t - tStop) / 0.35, e = E.outCubic(q) * 22;
      K.save(); K.globalAlpha *= 1 - q; strokeRR(K, w - 24 - pw - e, 16 - e, pw + 2 * e, 34 + 2 * e, 17 + e, C.red, 4 * (1 - q) + 1); K.restore(); }
    // level bar: remaining skills
    let lv = 0; for (let i = 0; i < 6; i++) { const f = fallOf(i); lv += f ? 1 - E.outCubic(clamp((fz(t) - f[1]) / 0.35)) : 1; }
    fillRR(K, 24, 58, w - 48, 6, 3, TRACK); fillRR(K, 24, 58, (w - 48) * lv / 6, 6, 3, frozen(t) ? C.ink : C.red);
    if (t >= tMade - 0.04) {                       // the level gets pinned: a red notch pops where the drain stopped
      const q = E.outBack(clamp((t - tMade + 0.04) / 0.2)), nx = 24 + (w - 48) * lv / 6;
      X([K], nx, 61, Math.max(0.01, q), 0, () => { fillRR(K, -4, -16, 8, 32, 3, C.red); circle(K, 0, -20, 8, C.red, '#FFFFFF', 3); });
      if (t < tMade + 0.4) shock(K, nx, 61, t - tMade, { r: 46, color: C.red, lw: 4, dur: 0.35 });
    }
    // slots
    for (let i = 0; i < 6; i++) {
      const g = slotGeo(i);
      if (leftAt(t, i)) {                                // empty slot: dashed outline + ghost label
        K.save(); K.setLineDash([9, 7]); strokeRR(K, g.x + 2, g.y + 2, g.w - 4, g.h - 4, 12, SOFT, 2.5); K.restore();
        text(K, SKILL[i], g.x + g.w / 2, g.y + g.h - 16, { font: F.mono, weight: 700, size: Math.min(21, (g.w - 16) / (SKILL[i].length * 0.62)), color: '#DDD9D0' });
        continue;
      }
      // loose chips wobble before they go (and freeze when the plug lands)
      let r = 0, dy = 0;
      if (i === 3 && t >= LOOSE5) { const u = fz(t) - LOOSE5; r = Math.sin(u * 38) * 7 * clamp(u / 0.15); dy = -Math.abs(Math.sin(u * 19)) * 6; }
      if (i === 0 && t >= LOOSE0) {
        const u = fz(t) - LOOSE0; r = Math.sin(u * 34) * 9 * clamp(u / 0.2); dy = -Math.abs(Math.sin(u * 17)) * 10 * clamp(u / 0.2);
        if (t >= tStop) { const k = E.outBack(clamp((t - tStop) / 0.18)); r *= 1 - k; dy *= 1 - k; }
      }
      if (i === 0 && frozen(t) && t < tStop) { K.save(); K.setLineDash([8, 6]); strokeRR(K, g.x - 5, g.y - 5, g.w + 10, g.h + 10, 16, C.red, 3); K.restore(); }
      drawChipAt(K, i, g.x + g.w / 2, g.y + g.h / 2 + dy, 1 + (i === 0 && t >= tStop ? ring(t - tStop - 0.12, 3, 8) * 0.08 : 0), r);
    }
  }
  function drawChipAt(K, i, cx, cy, s, r) { X([K], cx, cy, s, r, () => { K.translate(-slotGeo(i).w / 2, -slotGeo(i).h / 2); chipFace(K, i, slotGeo(i).w, slotGeo(i).h, true); }); }

  // the socket that pops up on "there's now"
  function socket(K, t, front) {
    const p = E.outBack(clamp((t - tAnd) / 0.24));
    if (p <= 0.01) return;
    const w = SOCK.w, h = SOCK.h, x = SOCK.x - w / 2, y = -h + 4;
    K.save(); K.translate(SOCK.x, 4); K.scale(1, p); K.translate(-SOCK.x, -4);
    if (!front) {
      fillRR(K, x, y, w, h + 6, 12, '#FFFFFF'); strokeRR(K, x, y, w, h + 6, 12, C.ink, 4);
      const hot = t < tJam && t > tAnd + 0.2;
      fillRR(K, SOCK.x - 40, y + 14, 16, 26, 4, hot && Math.floor(t * 8) % 2 ? C.red : C.ink);
      fillRR(K, SOCK.x + 24, y + 14, 16, 26, 4, hot && Math.floor(t * 8) % 2 ? C.red : C.ink);
      if (t > tAnd + 0.15 && t < tJam) {          // "plug here" pulse
        const q = ((t - tAnd) * 2.2) % 1;
        K.save(); K.globalAlpha *= 1 - q; K.setLineDash([10, 8]); K.lineDashOffset = -t * 40;
        strokeRR(K, x - 10 - q * 26, y - 10 - q * 26, w + 20 + q * 52, h + 26 + q * 52, 18 + q * 10, C.red, 3.5); K.restore();
      }
    } else if (frozen(t)) {   // front lip that hides the prongs
      fillRR(K, x, y, w, h + 6, 12, '#FFFFFF'); strokeRR(K, x, y, w, h + 6, 12, C.ink, 4);
      fillRR(K, x + 18, y + 18, w - 36, 6, 3, frozen(t) ? C.red : TRACK);
    }
    K.restore();
  }

  // ═════ the plug ═════
  function plugPos(t) {
    if (t < tFly0) return null;
    const A = [1260, 880], Cc = [900, 760], B = [PLUG_REST.x, PLUG_REST.y - 104];
    if (t < tFly1) { const u = E.outCubic(clamp((t - tFly0) / (tFly1 - tFly0))); const [x, y] = qb(A, Cc, B, u); return { x, y, r: lerp(42, -6, u) }; }
    if (t < tHover) { const u = clamp((t - tFly1) / (tHover - tFly1)); return { x: B[0], y: B[1] - 14 * Math.sin(u * Math.PI * 0.5), r: -6 * (1 - E.outCubic(u)) }; }
    if (t < tJam) { const u = E.inQuart(clamp((t - tHover) / (tJam - tHover))); return { x: B[0], y: lerp(B[1] - 14, PLUG_REST.y, u), r: 0 }; }
    return { x: PLUG_REST.x, y: PLUG_REST.y + jamRing(t) * 5, r: 0 };
  }
  function plugBody(K, part) {     // centred at 0,0 ; body 156×104, prongs below
    if (part === 'prongs') {
      for (const s of [-1, 1]) { fillRR(K, s * 32 - 8, 40, 16, 64, 4, '#BDB9B0'); strokeRR(K, s * 32 - 8, 40, 16, 64, 4, C.ink, 3); }
      return;
    }
    fillRR(K, -30, -72, 60, 30, 8, C.ink);
    fillRR(K, -78, -52, 156, 104, 24, C.ink);
    fillRR(K, -66, -42, 132, 8, 4, 'rgba(255,255,255,0.12)');
    text(K, '+ plugin', 0, 14, { font: F.mono, weight: 700, size: 25, color: '#FFFFFF' });
    fillRR(K, -40, 26, 80, 6, 3, C.red);
  }
  function cable(K, t, p) {
    let end = [p.x, p.y - 72];
    const det = clamp((t - tF0 + 0.04) / 0.13);
    if (det > 0) end = [lerp(end[0], 1900, E.inCubic(det)), lerp(end[1], 700, E.inCubic(det))];
    if (det >= 1) return;
    const far = [1500, 880], sag = frozen(t) && det === 0 ? 60 + 10 * Math.sin((t - tJam) * 12) * Math.exp(-(t - tJam) * 3) : 40;
    const mid = [(end[0] + far[0]) / 2, Math.max(end[1], far[1]) + sag];
    K.save(); K.lineCap = 'round'; K.lineJoin = 'round';
    K.beginPath(); K.moveTo(...end); K.quadraticCurveTo(...mid, ...far); K.lineWidth = 16; K.strokeStyle = C.ink; K.stroke();
    K.beginPath(); K.moveTo(...end); K.quadraticCurveTo(...mid, ...far); K.lineWidth = 4; K.strokeStyle = 'rgba(255,255,255,0.18)'; K.stroke();
    K.restore();
  }

  // ═════ the spark that knocks a chip out after every "Done!" ═════
  function sparks(T, K, t) {
    DONE_T.forEach((d, k) => {
      const f = FALL.find(q => Math.abs(q[1] - (d + 0.12)) < 0.001); if (!f) return;
      const u = (t - d) / 0.12; if (u <= 0 || u >= 1.45) return;
      const g = slotGeo(f[0]), a = doneAt(t, k), b = [TC.x + g.x + g.w / 2, CARD_Y + g.y + g.h / 2], c = [a[0] - 40, (a[1] + b[1]) / 2 + 120];
      const h = E.inCubic(clamp(u)), tl = E.inCubic(clamp(u - 0.3));
      for (let j = 0; j < 8; j++) {
        const u0 = lerp(tl, h, j / 8), u1 = lerp(tl, h, (j + 1) / 8);
        line(K, ...qb(a, c, b, u0), ...qb(a, c, b, u1), C.red, 2 + 8 * (j + 1) / 8);
      }
      if (u < 1) { const [x, y] = qb(a, c, b, h); circle(K, x, y, 10, C.red); circle(K, x, y, 4, '#FFFFFF'); }
    });
  }

  // ═════ falling chips (gravity, spin; frozen mid-air when the plug lands) ═════
  function fallen(T, K, t) {
    for (const [i, t0, vx, vy, spin] of FALL) {
      if (t < t0) continue;
      const d = fz(t) - t0, g = slotGeo(i);
      let x = TC.x + g.x + g.w / 2 + vx * d, y = CARD_Y + g.y + g.h / 2 + vy * d + 0.5 * 5600 * d * d, r = spin * d;
      if (y > 2150) continue;
      const loud = i === 1;
      if (d < 0.3) burst(K, TC.x + g.x + g.w / 2, CARD_Y + g.y + g.h / 2, d, { n: loud ? 12 : 8, r0: 50, r1: loud ? 150 : 100, color: loud ? C.red : C.ink, lw: loud ? 7 : 5, dur: 0.28 });
      let s = 1;
      if (frozen(t) && t >= tF0 - 0.06) {          // sucked back into the flipping card
        const k = E.inCubic(clamp((t - tF0 + 0.06) / 0.16));
        x = lerp(x, TC.x + CW / 2, k); y = lerp(y, cardY(t) + CH / 2, k); s = 1 - k; r *= 1 - k;
        if (s <= 0.02) continue;
      }
      // motion streaks above a falling chip (held still when frozen)
      const vyNow = vy + 5600 * d;
      if (vyNow > 200 && !frozen(t)) hkA([K], 0.4 * s, () => { for (let k = -1; k <= 1; k++) line(K, x + k * 40, y - 70 - Math.min(160, vyNow * 0.08), x + k * 40, y - 60, k ? '#B3AFA6' : C.ink, 5); });
      drawChipAt(K, i, x, y, s, r);
      if (frozen(t)) {
        const p = E.outBack(clamp((t - tJam) / 0.2));
        X([K], x, y, s, r, () => {
          K.save(); K.setLineDash([10, 7]); K.lineDashOffset = -t * 20; strokeRR(K, -g.w / 2 - 8, -g.h / 2 - 8, g.w + 16, g.h + 16, 18, C.red, 3.5); K.restore();
          if (p > 0.01) X([K], g.w / 2 + 6, -g.h / 2 - 6, p, 0, () => { circle(K, 0, 0, 22, C.red, C.ink, 3); fillRR(K, -8, -9, 5, 18, 1, '#fff'); fillRR(K, 3, -9, 5, 18, 1, '#fff'); });
        });
      }
    }
  }

  // ═════ skills card group (enters at frame 0, squashes on the jam, flips into the learning card) ═════
  function hkCardGroup(T, K, t) {
    const ent = pop(t + 0.06, 2.3, 0.55);
    const fp = clamp((t - tF0) / (tF1 - tF0));
    const cx = TC.x + CW / 2, cy = cardY(t) + CH;          // squash anchored on the bottom edge
    const sq = jamRing(t) * 0.06;
    let sy = 1, sx = 1, lift = 0, learn = false;
    if (fp > 0) {
      lift = -34 * Math.sin(fp * Math.PI);
      sx = 1 + 0.04 * Math.sin(fp * Math.PI);
      if (fp < 0.5) sy = 1 - E.inCubic(fp * 2); else { sy = E.outBack(clamp((fp - 0.5) * 2)); learn = true; }
    }
    const oy = (1 - clamp(ent, 0, 1.2)) * 520;
    for (const c of [T, K]) { c.save(); c.translate(cx, cy + oy + lift); c.scale(sx * (1 + sq * 0.5), Math.max(0.001, sy) * (1 - sq)); c.translate(-CW / 2, -CH); }
    if (learn) learnCard(T, K, 0, 0, 1, { t });
    else {
      // socket back → card → plug prongs → socket front → plug body
      for (const c of [T, K]) c.save();
      skillsCard(T, K, t);
      for (const c of [T, K]) c.restore();
      const p = plugPos(t), pIn = p && frozen(t);
      const shrink = 1 - E.inBack(clamp((t - tF0 + 0.05) / 0.12));
      socket(K, t, false);
      if (pIn && shrink > 0.01) X([K], p.x - TC.x, p.y - CARD_Y, shrink, p.r, () => plugBody(K, 'prongs'));
      socket(K, t, true);
      if (pIn && shrink > 0.01) X([K], p.x - TC.x, p.y - CARD_Y, shrink, p.r, () => plugBody(K, 'body'));
    }
    for (const c of [T, K]) c.restore();
  }

  function hkStage(T, K, t) {
    hkGlow(T, PLUG_REST.x, CARD_Y - 40, 420, 1.1 * Math.exp(-Math.max(0, t - tJam) * 3) * (t >= tJam ? 1 : 0), 0.8);
    const p = plugPos(t);
      if (p) cable(K, t, p);
      hkCardGroup(T, K, t);
      if (p && !frozen(t)) {                              // in flight: drawn free, in front
        if (t < tFly1) hkA([K], 0.35, () => { for (let k = 0; k < 4; k++) { const q = plugPos(Math.max(tFly0, t - 0.03 * (k + 1))); if (q) line(K, q.x + 70, q.y - 30 + k * 18, q.x + 150 + k * 20, q.y - 50 + k * 18, k % 2 ? C.red : C.ink, 5); } });
        X([K], p.x, p.y, 1, p.r, () => { plugBody(K, 'prongs'); plugBody(K, 'body'); });
      }
      if (t >= tJam && t < tJam + 0.5) {
        burst(K, PLUG_REST.x, CARD_Y - 10, t - tJam, { n: 16, r0: 165, r1: 290, color: C.red, lw: 8, dur: 0.42 });
        shock(K, PLUG_REST.x, CARD_Y - 10, t - tJam, { r: 240, color: C.red, lw: 5, dur: 0.38 });
      }
      sparks(T, K, t);
      fallen(T, K, t);
  }

  // ═════ camera: drift on the window, punch on "worse", glide down to the socket, settle to identity ═════
  const CAM = Track({ z: 1.075, fx: 540, fy: 700, r: -0.012 });
  CAM.key(0.7, { z: 1.03, fx: 520, fy: 760, r: 0 }, E.outCubic)
    .key(tWorse - 0.02, { z: 1.035 })
    .key(tWorse + 0.1, { z: 1.095, fx: 380, fy: 700, r: 0.006 }, E.outExpo)
    .key(tAnd - 0.02, { z: 1.08, r: 0.004 })
    .key(tAnd + 0.42, { z: 1.035, fx: 430, fy: 900, r: -0.004 }, E.inOutCubic)
    .key(tJam - 0.02, { z: 1.05, fx: 440, fy: 880, r: 0 }, E.inOutCubic)
    .key(tF0, { z: 1.065, fx: 400, fy: 920 }, E.inOutCubic)
    .key(tDock - 0.01, { z: 1, fx: 540, fy: 960, r: 0 }, E.inOutCubic);

  // ═════ the presenter: points at the focus the whole time ═════
  const AIM = [[-1, 300, 700], [tQuiet - 0.05, 330, 1170], [tWorse - 0.02, 320, 700], [tSel, 300, 745],
    [tAnd + 0.02, PLUG_REST.x, CARD_Y - 30], ['plug', tFly0 + 0.04, tJam + 0.02], [tJam + 0.08, 230, 1400], [tStop - 0.06, 170, 1160], [tF0 + 0.04, 240, 1310]];
  function aimAt(t) {
    let x = AIM[0][1], y = AIM[0][2];
    for (const k of AIM) {
      if (k[0] === 'plug') {
        if (t < k[1]) continue;
        const p = plugPos(Math.min(t, k[2])) || { x, y }, b = E.inOutCubic(clamp((t - k[1]) / 0.14));
        x = lerp(x, Math.min(p.x, 470), b); y = lerp(y, p.y + 60, b); continue;
      }
      const b = E.inOutCubic(clamp((t - k[0]) / 0.16)); x = lerp(x, k[1], b); y = lerp(y, k[2], b);
    }
    return gMap(t, x, y);
  }
  const SHL = [PRESENTER_DOCK.x - 226 * PRESENTER_DOCK.s, PRESENTER_DOCK.y - 264 * PRESENTER_DOCK.s];

  SC.hook = {
    label: '// 01 — worse', bg: 'light',
    cam: t => {
      if (t >= tDock) return { x: 0, y: 0, z: 1, r: 0 };
      const c = CAM.at(t), hand = 1 - clamp((t - tStop) / 0.3);
      return { z: c.z, r: c.r, x: -(c.fx - 540) * (c.z - 1) + noise1(t * 1.3) * 5 * hand, y: -(c.fy - 960) * (c.z - 1) + noise1(t * 1.1 + 9) * 5 * hand };
    },
    draw(T, K, t) {
      if (t >= tDock) { learnCard(T, K, TC.x, TC.y, TC.s, { t }); return; }
      hkWindow(T, K, t);
      hkCursorBubble(T, K, t);
      inStage(T, K, t, () => hkStage(T, K, t));
    },
    guy(t) {
      const d = PRESENTER_DOCK, st = { x: d.x, y: d.y + jamRing(t) * 22, s: d.s };
      const [ax, ay] = aimAt(t);
      const ang = Math.atan2(ay - SHL[1], -(ax - SHL[0])) / D2R;
      const jab = 6 * ring(t - tJam, 3, 7) * (t >= tJam ? 1 : 0) + 5 * ring(t - tWorse, 3, 7) * (t >= tWorse ? 1 : 0);
      const lx = clamp((ax - 842) / 520, -1, 1) * 0.8, ly = clamp((ay - 1450) / 900, -1, 1) * 0.8;
      return Object.assign(st,
        arms(t, [[-1, S1 + 1, 'L', 'point'],
          [tWorse + 0.12, tAnd - 0.04, 'R', 'facepalm'],
          [tMade + 0.02, S1 + 1, 'R', 'thumb']]),
        { pointAng: ang + jab },
        expr(t, [[-1, tQuiet - 0.05, { smile: 0.6, brow: 0.45 }],
          [tQuiet - 0.05, tWorse - 0.04, { browTilt: 0.6, smile: -0.15, brow: 0.15 }],
          [tWorse - 0.04, tAnd, { brow: 0.6, sweat: 0.65, smile: -0.4, browTilt: 0.4 }],
          [tAnd, tJam - 0.04, { brow: 0.8, smile: 0.45 }],
          [tJam - 0.04, tMade + 0.05, { shock: 0.55, brow: 1 }],
          [tMade + 0.05, S1 + 1, { smile: 0.8, brow: 0.4 }]]),
        { lookX: lx, lookY: ly, headTurn: 0.2 * lx, headTilt: -5 * win(t, tQuiet, tWorse, 0.12, 0.15) + 4 * win(t, tMade, S1 + 1, 0.15, 0.2) });
    },
  };
  kick(tJam, 0.9, 0.85);   // the one punch: the plug jams in and the drain freezes
})();
