/* Susanoo Reel Kit print · cards
   Interface cards in the house look (white card stock, hairlines, mono labels, the accent only on what matters): tags, avatars,
   toggles, progress bars, a checklist, the comment sheet of the CTA, a DM bubble, a notification and a stat card. */

const CARD_GREY = '#8a8780';
const CARD_RULE = 'rgba(17,17,17,0.09)';
// the cards' type styles (- = not set; grey / ink name the house colours)
const CARD_TYPES = `
  counter  mono 700 24 -  -        right
  meta     mono 500 20 -  grey     right
  you      mono 500 22 -  grey     left
  delta    mono 700 22 1  -        -
  pill     grot 700 28 3  -        -
  typed    grot 700 30 3  -        -
  post     grot 700 29 -  -        -
  heading  grot 700 30 -  ink      -
  title    grot 700 30 -  ink      left
  hint     grot 500 28 -  #b3b0a8  left
  body     grot 500 26 -  #6b6861  left
  glyph    grot 700 26 -  #FFFFFF  -
`;
let cardTypeRows = null;
// a type style by name, with extra fields laid over it
function cardType(name, extra) {
  if (!cardTypeRows) {
    cardTypeRows = {};
    CARD_TYPES.trim().split('\n').forEach(row => {
      const [key, font, weight, size, ls, color, align] = row.trim().split(/\s+/);
      cardTypeRows[key] = { font, weight: +weight, size: +size, ls, color, align };
    });
  }
  const r = cardTypeRows[name];
  const style = { font: F[r.font], weight: r.weight, size: r.size };
  if (r.ls !== '-') style.ls = +r.ls;
  if (r.color !== '-') style.color = r.color === 'grey' ? CARD_GREY : r.color === 'ink' ? C.ink : r.color;
  if (r.align !== '-') style.align = r.align;
  return Object.assign(style, extra);
}
// a soft accent flash over a row that just changed (strength 0..1)
const cardFlash = (K, x, y, w, h, strength) => fillRR(K, x, y, w, h, 16, accentA(0.12 * strength));

// a capsule tag, left edge at x, centred on y → its width. o: { fill, color, size, stroke, font, ls }
const tag = (K, str, x, y, o = {}) => {
  const size = o.size || 22;
  const face = { font: o.font || F.mono, weight: 700, size, ls: o.ls ?? 1 };
  const [w, h] = [measure(K, str, face) + size * 1.3, size * 1.7];
  const top = y - h / 2;
  fillRR(K, x, top, w, h, h / 2, o.fill || C.red);
  if (o.stroke) strokeRR(K, x, top, w, h, h / 2, o.stroke, 2.5);
  text(K, str, x + w / 2, y + size * 0.36, { color: o.color || '#FFFFFF', ...face });
  return w;
};
// a round avatar: a person glyph in a disc (no faces), or an image from IMG when o.img names a loaded one
const avatar = (K, x, y, r, o = {}) => {
  const im = o.img && IMG[o.img];
  if (!(im && im.naturalWidth)) {
    circle(K, x, y, r, o.fill || '#E4DFD5');
    person(K, x, y + r * 0.2, r / 52, o.ink || '#FFFFFF');
    return;
  }
  K.save();
  runOps(K, [['beginPath'], ['arc', x, y, r, 0, TAU], ['clip']]);
  coverImg(K, im, x - r, y - r, 2 * r, 2 * r);
  K.restore();
};
// a switch centred on (x, y); on 0 → 1 slides the knob (animate it)
const toggle = (K, x, y, on, o = {}) => {
  const w = o.w || 72, h = o.h || 40, knob = h / 2;
  const travel = [x - w / 2 + knob, x + w / 2 - knob];
  fillRR(K, x - w / 2, y - h / 2, w, h, knob, on > 0.5 ? C.red : '#D9D5CC');
  circle(K, lerp(travel[0], travel[1], E.inOutCubic(clamp(on))), y, knob - 5, '#FFFFFF');
};
// a progress bar, top-left at (x, y), filled to p
const progress = (K, x, y, w, p, o = {}) => {
  const h = o.h || 16;
  const bar = (len, fill) => fillRR(K, x, y, len, h, h / 2, fill);
  bar(w, o.track || '#EDE9E0');
  if (p > 0) bar(Math.max(h, w * clamp(p)), o.fill || C.red);
};

/* ---------- the checklist ---------- */
// items: [{ txt, t0 (when it ticks), sub, a (0..1 row reveal) }]. A row ticks at t0: the accent box pops, the check draws on, the row
// flashes, the text dims (and strikes through with o.strike). o: { t, title, row: 86, size, strike, dim, counter } → its height
const CHECK = { row: 86, head: 78, bare: 18, foot: 18, radius: 28, inset: 30, box: 44, boxR: 12, gap: 26, flash: 0.45, slide: 60, size: 36 };
// the tick box at (cx, mid): grey outline, or an accent box that pops in with a white check
function checkBox(K, cx, mid, age, done) {
  const side = CHECK.box, half = side / 2;
  let scale = 1;
  if (done) {
    const popped = clamp(pop(age, 3, 0.45), 0, 1.25);
    scale = lerp(0.6, 1, Math.min(1, popped)) * (1 + 0.12 * ring(age, 3, 8));
  }
  X([K], cx, mid, scale, 0, () => {
    if (!done) return strokeRR(K, -half, -half, side, side, CHECK.boxR, '#CFCBC2', 3);
    fillRR(K, -half, -half, side, side, CHECK.boxR, C.red);
    check(K, 0, 0, side * 0.62, clamp(age / 0.22), '#FFFFFF', 6);
  });
}
function checkRow(K, it, box, o, t) {
  const age = t - it.t0;
  const done = age >= 0;
  const flash = done ? Math.max(0, 1 - age / CHECK.flash) : 0;
  const rowTop = box.mid - box.row / 2, right = box.x + box.w;
  if (flash > 0) cardFlash(K, box.x + 12, rowTop + 6, box.w - 24, box.row - 12, flash);
  const boxX = box.x + CHECK.inset;
  checkBox(K, boxX + CHECK.box / 2, box.mid, age, done);
  const face = { font: F.grot, weight: 500, size: o.size || CHECK.size, ls: -0.5 };
  const tx = boxX + CHECK.box + CHECK.gap;
  const ink = done && o.dim !== false ? CARD_GREY : C.ink;
  text(K, it.txt, tx, box.mid + face.size * 0.34, { color: ink, align: 'left', ...face });
  if (done && o.strike) {
    const reach = measure(K, it.txt, face) * E.outCubic(clamp((age - 0.1) / 0.25));
    line(K, tx - 4, box.mid + 2, tx + reach + 4, box.mid + 2, C.red, 4, 'round');
  }
  if (it.sub) text(K, it.sub, right - CHECK.inset, box.mid + 9, cardType('meta'));
  const below = box.mid + box.row / 2;
  if (!box.last) line(K, tx, below, right - 24, below, 'rgba(17,17,17,0.06)', 2, 'butt');
}
const checklist = (T, K, x, y, w, items, o = {}) => {
  const t = o.t ?? 0;
  const row = o.row || CHECK.row;
  const head = o.title ? CHECK.head : CHECK.bare;
  const h = head + items.length * row + CHECK.foot;
  uiCard(T, K, x, y, w, h, { r: CHECK.radius });
  if (o.title) {
    const labelY = y + 48;
    uiLabel(K, o.title, x + CHECK.inset, labelY);
    if (o.counter !== false) {
      const ticked = items.filter(it => t >= it.t0).length;
      text(K, `${ticked}/${items.length}`, x + w - CHECK.inset, labelY, cardType('counter', { color: ticked ? C.red : CARD_GREY }));
    }
    const rule = y + head - 12;
    line(K, x, rule, x + w, rule, CARD_RULE, 2, 'butt');
  }
  items.forEach((it, i) => {
    const shown = it.a ?? 1;
    if (shown <= 0.01) return;
    K.save();
    K.globalAlpha *= clamp(shown);
    K.translate((1 - Math.min(1, shown)) * CHECK.slide, 0);   // rows slide in from the right as they appear
    checkRow(K, it, { x, w, row, mid: y + head + i * row + row / 2, last: i === items.length - 1 }, o, t);
    K.restore();
  });
  return h;
};

/* ---------- the comment sheet (the CTA) ---------- */
// the keyword types into the composer, posts as a glowing accent pill, other viewers' replies stack under it.
// o: { t, keyword, tType, tSend, replies: [t, …], w, cps }, top-left at (x, y) → its height. Its words come from uiText (comments,
// addComment, post, you), so they follow reel.json "language" and "ui".
const SHEET = { head: 84, row: 84, rows: 3, composer: 104, face: 56, faceR: 25, textX: 100, rise: 22, pillH: 44, pillPad: 36, glow: 30 };
// the keyword as a capsule (lit = posted: accent with a glow), left edge at px, centred on py, scaled by k → its width
function keywordPill(K, keyword, px, py, lit, k = 1) {
  const face = cardType('pill');
  const pw = measure(K, keyword, face) + SHEET.pillPad;
  const ph = SHEET.pillH;
  const shape = [-pw / 2, -ph / 2, pw, ph, ph / 2];
  X([K], px + pw / 2, py, k, 0, () => {
    if (lit) {
      K.save();
      Object.assign(K, { shadowColor: accentA(0.7), shadowBlur: SHEET.glow });
      fillRR(K, ...shape, C.red);
      K.restore();
    }
    fillRR(K, ...shape, lit ? C.red : '#FFFFFF');
    strokeRR(K, ...shape, C.red, 3);
    text(K, keyword, 0, 10, { color: lit ? '#FFFFFF' : C.red, ...face });
  });
  return pw;
}
// one row of the thread: a placeholder comment, your posted keyword, or a reply
function sheetRow(K, it, x, w, ry, keyword, t) {
  const appear = it.t0 === undefined ? 1 : E.outCubic(clamp((t - it.t0) / 0.2));
  const lift = (1 - appear) * SHEET.rise;   // rows rise as they fade in
  const cy = ry + SHEET.row / 2 + lift;
  const faceX = x + SHEET.face, textX = x + SHEET.textX;
  K.save();
  K.globalAlpha *= appear;
  if (it.skel) {
    circle(K, faceX, cy, SHEET.faceR, '#E4DFD5');
    [[ry + 22, 120, 14, '#E6E3DC'], [ry + 46, it.skel[0], 16, '#DDD9D1']].forEach(([top, len, thick, fill]) => fillRR(K, textX, top + lift, len, thick, thick / 2, fill));
  } else if (it.you) {
    const flash = Math.max(0, 1 - (t - it.t0) / 0.5);
    if (flash > 0) cardFlash(K, x + 12, ry + 4, w - 24, SHEET.row - 8, flash);
    avatar(K, faceX, cy, SHEET.faceR, { fill: C.ink });
    const pw = keywordPill(K, keyword, textX, cy, true, 1 + 0.08 * ring(t - it.t0, 3, 7));
    text(K, uiText('you'), textX + pw + 18, ry + SHEET.row / 2 + 8 + lift, cardType('you'));
  } else {
    circle(K, faceX, cy, SHEET.faceR, it.bg);
    keywordPill(K, keyword, textX, cy, false);
  }
  K.restore();
}
// the composer at the bottom: your avatar, the field the keyword types into, and Post (it presses at tSend)
function sheetComposer(K, x, y, w, h, keyword, s, t) {
  const postWord = uiText('post');
  const postFace = cardType('post');
  const postW = Math.max(74, measure(K, postWord, postFace));   // the field shrinks for a long "Post"
  const iy = y + h - SHEET.composer;
  const field = { x: x + SHEET.textX, y: iy + 20, w: w - 176 - postW, h: 64 };
  const mid = field.y + field.h / 2;
  line(K, x, iy, x + w, iy, HAIR, 2, 'butt');
  avatar(K, x + SHEET.face, iy + 52, SHEET.faceR, { fill: C.ink });
  const typing = t >= s.tType && t < s.tSend;
  const fieldShape = [field.x, field.y, field.w, field.h, 32];
  fillRR(K, ...fieldShape, '#FFFFFF');
  strokeRR(K, ...fieldShape, typing ? C.ink : HAIR, 3);
  const typed = t < s.tSend ? typedStr(keyword, t, s.tType, s.cps) : '';
  if (typed) {
    const face = cardType('typed');
    const chipW = measure(K, typed, face) + 32;
    strokeRR(K, field.x + 14, mid - 23, chipW, 46, 12, C.red, 3);
    text(K, typed, field.x + 30, mid + 11, { color: C.red, align: 'left', ...face });
    caretAt(K, field.x + 14 + chipW + 6, field.y + 45, 34, t, C.ink);
  } else text(K, uiText('addComment'), field.x + 28, field.y + 42, cardType('hint'));
  const press = win(t, s.tSend - 0.06, s.tSend + 0.04, 0.04, 0.12);
  const ready = typed.length === keyword.length || t >= s.tSend;
  X([K], x + w - 38 - postW / 2, mid, 1 - press * 0.15, 0, () => text(K, postWord, 0, 10, { ...postFace, color: ready ? C.red : '#C9C5BC' }));
}
const commentSheet = (T, K, x, y, o = {}) => {
  const t = o.t ?? 0, w = o.w || 900;
  const keyword = String(o.keyword || 'REEL').toUpperCase();
  const listH = SHEET.rows * SHEET.row;
  const h = SHEET.head + listH + SHEET.composer;
  const s = { tType: o.tType ?? 0, tSend: o.tSend ?? 0.8, cps: o.cps || 16 };
  const replies = (o.replies || []).map((rt, k) => ({ t0: rt, bg: k % 2 ? '#F0DDD6' : '#E4DFD5' }));
  const thread = [{ skel: [300, 190] }, { skel: [220, 330] }, { you: true, t0: s.tSend }].concat(replies);
  // the thread scrolls up one row as each reply beyond the visible rows arrives
  let scroll = 0;
  thread.forEach((it, k) => {
    scroll += k >= SHEET.rows && it.t0 !== undefined ? E.inOutCubic(P(t, it.t0, 0.24)) : 0;
  });
  const listTop = y + SHEET.head;
  uiCard(T, K, x, y, w, h, { r: 30 });
  fillRR(K, x + w / 2 - 36, y + 14, 72, 7, 3.5, '#DAD7CF');   // the sheet's grab handle
  text(K, uiText('comments'), x + w / 2, y + 62, cardType('heading'));
  line(K, x, listTop, x + w, listTop, HAIR, 2, 'butt');
  K.save();
  runOps(K, [['beginPath'], ['rect', x, listTop + 1, w, listH], ['clip']]);
  thread.forEach((it, k) => {
    const ry = listTop + (k - scroll) * SHEET.row;
    if (ry < listTop - SHEET.row || ry > listTop + listH) return;
    if (it.t0 !== undefined && t < it.t0) return;
    sheetRow(K, it, x, w, ry, keyword, t);
  });
  K.restore();
  sheetComposer(K, x, y, w, h, keyword, s, t);
  return h;
};

/* ---------- messages ---------- */
// a DM bubble with a tail at the bottom-right (or left); lines [{ txt, t0, cps, size, bold, col }] type in.
// o: { t, w, title, tail: 'right' | 'left' }; title true = uiText('newMessage'), a string = that text, none = no header → height
const DM = { w: 660, head: 70, bare: 24, lh: 56, foot: 26, radius: 34, pad: 30 };
const dmBubble = (T, K, x, y, lines, o = {}) => {
  const title = o.title === true ? uiText('newMessage') : o.title;
  const t = o.t ?? 0, w = o.w || DM.w;
  const head = title ? DM.head : DM.bare;
  const h = head + lines.length * DM.lh + DM.foot;
  const s = o.tail !== 'left' ? 1 : -1;
  const bx = s > 0 ? x + w : x, by = y + h;
  // the tail: a curved hook hanging off the bottom corner
  const hook = [['beginPath'], ['moveTo', bx - s * 70, by - 4], ['quadraticCurveTo', bx + s * 6, by + 10, bx + s * 30, by + 40],
    ['quadraticCurveTo', bx - s * 10, by + 26, bx - s * 130, by - 4], ['closePath']];
  cardShadow(T, x, y, w, h, DM.radius);
  runOps(T, hook);
  T.fillStyle = '#FFFFFF';
  T.fill();
  runOps(K, hook);
  Object.assign(K, { lineWidth: 6, strokeStyle: C.ink, lineJoin: 'round' });
  K.stroke();
  strokeRR(K, x, y, w, h, DM.radius, C.ink, 3);
  fillRR(K, x + 1.5, y + 1.5, w - 3, h - 3, DM.radius - 1.5, CARD);
  runOps(K, hook);
  K.fillStyle = CARD;
  K.fill();
  if (title) {
    circle(K, x + 40, y + 42, 7, C.red);
    text(K, title, x + 58, y + 50, cardType('you'));
  }
  lines.forEach((l, i) => {
    if (t < l.t0) return;
    const style = { font: F.grot, weight: l.bold === false ? 500 : 700, size: l.size || 36, ls: -1, color: l.col || C.ink, align: 'left' };
    text(K, typedStr(l.txt, t, l.t0, l.cps || 60), x + DM.pad, y + head + (i + 0.75) * DM.lh, style);
  });
  return h;
};
// a notification, top-left at (x, y): an accent icon (o.glyph on it), the title, o.time, an optional body → its height
const toast = (T, K, x, y, w, title, body, o = {}) => {
  const h = body ? 120 : 84;
  const textX = x + 82;
  uiCard(T, K, x, y, w, h, { r: 26 });
  fillRR(K, x + 24, y + 22, 40, 40, 11, o.icon || C.red);
  const lines = [
    [o.glyph, x + 44, y + 52, 'glyph'],
    [title, textX, y + 50, 'title'],
    [o.time, x + w - 26, y + 48, 'meta'],
    [body, textX, y + 92, 'body'],
  ];
  lines.forEach(([str, lx, ly, style], k) => {
    if (k === 1 || str) text(K, str, lx, ly, cardType(style));
  });
  return h;
};
// a stat card: a label, a big number rolling in by p, and an optional delta tag top-right
const statCard = (T, K, x, y, w, h, label, value, p, o = {}) => {
  uiCard(T, K, x, y, w, h, { r: 28 });
  uiLabel(K, label, x + 30, y + 50);
  bigFigure(K, value, x + 30, y + h - 44, o.size || 120, p, { align: 'left', color: o.color || C.ink });
  if (!o.delta) return;
  const deltaW = measure(K, o.delta, cardType('delta'));
  tag(K, o.delta, x + w - 30 - deltaW - 29, y + 44, {});
};
