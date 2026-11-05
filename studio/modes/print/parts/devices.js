/* Susanoo Reel Kit print · devices
   A phone, a browser window, an app panel and a terminal, drawn in the caller's space: shadows on T (they print as lines),
   surfaces and type on K. Wrap them in X([T, K], x, y, s, rotDeg, () => …) to move, scale or turn them. */

// a phone centred on (x, y), w wide (16:9 screen plus bezel); content(K, x, y, w, h) is drawn clipped to the screen.
// o: { frame: '#0C0D0E', screen: '#FFFFFF', shadow: true, notch: true } → the screen rectangle
const phone = (T, K, x, y, w, content, o = {}) => {
  const h = w * 16 / 9 + w * 0.06, left = x - w / 2, top = y - h / 2, radius = w * 0.13, bezel = w * 0.035;
  const screen = { x: left + bezel, y: top + bezel, w: w - 2 * bezel, h: h - 2 * bezel };
  if (T && o.shadow !== false) cardShadow(T, left, top, w, h, radius);
  fillRR(K, left, top, w, h, radius, o.frame || '#0C0D0E');
  K.save();
  rr(K, screen.x, screen.y, screen.w, screen.h, radius - bezel);
  K.clip();
  K.fillStyle = o.screen || '#FFFFFF';
  K.fillRect(left, top, w, h);
  if (content) content(K, screen.x, screen.y, screen.w, screen.h);
  K.restore();
  if (o.notch !== false) fillRR(K, x - w * 0.14, top + bezel + w * 0.03, w * 0.28, w * 0.07, w * 0.035, '#000');
  return screen;
};
// a status bar and app title at the top of a phone screen (call it from phone's content) → the y under the header
const phoneHeader = (K, x, y, w, title, o = {}) => {
  const u = w / 400;   // the header is laid out for a 400 px wide screen
  text(K, o.time || '9:41', x + 34 * u, y + 38 * u, { font: F.grot, weight: 700, size: 17 * u, color: C.ink, align: 'left' });
  fillRR(K, x + w - 64 * u, y + 25 * u, 30 * u, 14 * u, 4 * u, C.ink);
  if (title) text(K, title, x + w / 2, y + 96 * u, { font: F.grot, weight: 700, size: 26 * u, color: C.ink });
  line(K, x, y + 124 * u, x + w, y + 124 * u, HAIR, 2, 'butt');
  return y + 124 * u;
};
// clip to a rectangle (the current path becomes that rectangle)
const clipRect = (K, x, y, w, h) => runOps(K, [['beginPath'], ['rect', x, y, w, h], ['clip']]);

// a light browser window, top-left at (x, y). o: { url, tab, page, r }; content(K, x, y, w, h) is clipped to the page
const BROWSER_BAR = 92;
const browser = (T, K, x, y, w, h, content, o = {}) => {
  const radius = o.r ?? 22;
  const tabTitle = o.tab || uiText('newTab');
  const tabFace = { font: F.grot, weight: 500, size: 19 };
  uiCard(T, K, x, y, w, h, { r: radius });
  K.save();
  rr(K, x, y, w, h, radius);
  K.clip();
  K.fillStyle = '#F1EFEA';
  K.fillRect(x, y, w, BROWSER_BAR);
  ['red', 'grey', 'grey'].forEach((dot, i) => circle(K, x + 30 + i * 24, y + 26, 7.5, dot === 'red' ? C.red : '#CFCBC2'));   // window buttons
  fillRR(K, x + 108, y + 10, Math.min(w * 0.45, measure(K, tabTitle, tabFace) + 70), 36, 10, '#FFFFFF');                 // the tab
  circle(K, x + 128, y + 28, 7, C.red);
  text(K, tabTitle, x + 144, y + 35, { color: C.ink, align: 'left', ...tabFace });
  fillRR(K, x + 20, y + 52, w - 40, 32, 16, '#FFFFFF');                                                                    // the address bar
  text(K, o.url || 'example.com', x + 46, y + 74, { font: F.grot, weight: 500, size: 18, color: '#6b6861', align: 'left' });
  line(K, x, y + BROWSER_BAR, x + w, y + BROWSER_BAR, HAIR, 2, 'butt');
  const page = { x, y: y + BROWSER_BAR, w, h: h - BROWSER_BAR };
  K.fillStyle = o.page || '#FFFFFF';
  K.fillRect(page.x, page.y, page.w, page.h);
  K.save();
  clipRect(K, page.x, page.y, page.w, page.h);
  if (content) content(K, page.x, page.y, page.w, page.h);
  K.restore();
  K.restore();
  strokeRR(K, x, y, w, h, radius, C.ink, 3);
  return page;
};

// an app panel: a card with a mono "// LABEL ······ right" header and a hairline under it (dark: a black card).
// o: { label, right, dot: true, r, dark, head }; content(K, x, y, w, h) gets the area under the header
const panel = (T, K, x, y, w, h, content, o = {}) => {
  const dark = !!o.dark, head = o.head ?? 64, radius = o.r ?? 28;
  const tone = dark ? { fill: '#111214', label: '#9A938A', right: '#8F8F8F', rule: '#26272B' } : { fill: CARD, label: '#8a8076', right: '#8a8780', rule: 'rgba(17,17,17,0.09)' };
  uiCard(T, K, x, y, w, h, { r: radius, fill: tone.fill, border: C.ink });
  if (o.dot !== false) circle(K, x + 32, y + 32, 8, C.red);
  if (o.label) text(K, String(o.label).toUpperCase(), x + 52, y + 41, { font: F.voice, weight: 400, size: 23, ls: 1.5, color: tone.label, align: 'left' });
  if (o.right) text(K, o.right, x + w - 28, y + 40, { font: F.mono, weight: 500, size: 20, color: tone.right, align: 'right' });
  line(K, x, y + head, x + w, y + head, tone.rule, 2, 'butt');
  const body = { x, y: y + head, w, h: h - head };
  K.save();
  rr(K, x, y, w, h, radius);
  K.clip();
  clipRect(K, body.x, body.y, body.w, body.h);
  if (content) content(K, body.x, body.y, body.w, body.h);
  K.restore();
  return body;
};

/* ---------- the terminal ---------- */
// a dark terminal or agent session. lines: [{ t0, txt, kind, cps, dur, done, col }]
//   kind: cmd ("> " typed at cps) · ai (accent bullet, typed fast) · ok (✓) · warn (✗ in the accent) · spin (a spinner until t0 + dur,
//   then ✓ done) · dim · blank
// o: { t, title, lines, input: { txt, t0, cps, ph }, status: [left, right], fs, lh, pad }
const TERM = { bg: '#211D1A', bar: '#2B2622', line: '#3B3430', text: '#F1EAE0', dim: '#9C9288', ok: '#8FCB9B', font: '"JetBrains Mono"' };   // warm dark
const SPIN = '✻ ✶ ✳ ✢ · ✢ ✳ ✶'.split(' ');
const TERM_TITLE_BAR = 50;
// a line as it shows at t → { l, prefix, pcol, txt, col, caret, bold }
function termRow(l, t) {
  const age = t - l.t0;
  const row = (prefix, pcol, txt, col, extra) => ({ l, ...(prefix ? { prefix, pcol } : {}), txt, col, ...extra });
  if (l.kind === 'cmd') {
    const typed = typedStr(l.txt, t, l.t0, l.cps || 30);
    return row('> ', TERM.dim, typed, TERM.text, { caret: typed.length < l.txt.length });
  }
  if (l.kind === 'ai') return row('⏺ ', C.red, typedStr(l.txt, t, l.t0, l.cps || 90), TERM.text);
  if (l.kind === 'ok') return row('✓ ', TERM.ok, l.txt, TERM.text);
  if (l.kind === 'warn') return row('✗ ', C.red, l.txt, C.red, { bold: true });
  if (l.kind === 'spin') {
    if (age >= (l.dur ?? 1)) return row('✓ ', TERM.ok, l.done || l.txt, TERM.text);
    return row(SPIN[Math.floor(t * 12) % SPIN.length] + ' ', C.red, l.txt + '.'.repeat(1 + Math.floor(t * 3) % 3), C.red);
  }
  if (l.kind === 'dim') return row('', '', '  ' + l.txt, TERM.dim);
  if (l.kind === 'blank') return row('', '', '', TERM.dim);
  return row('', '', l.txt, l.col || TERM.dim);
}
const termFace = (size, bold) => ({ font: TERM.font, weight: bold ? 700 : 500, size });
// shorten txt with an ellipsis until it fits in room px
function termFit(K, txt, face, room) {
  if (measure(K, txt, face) <= room) return txt;
  let cut = txt;
  while (cut.length > 1 && measure(K, cut + '…', face) > room) cut = cut.slice(0, -1);
  return cut + '…';
}
const terminal = (T, K, x, y, w, h, o = {}) => {
  const t = o.t ?? 0, fs = o.fs ?? 24, lh = o.lh ?? fs * 1.42, pad = o.pad ?? 26, bar = TERM_TITLE_BAR;
  cardShadow(T, x, y, w, h, 22);
  fillRR(K, x, y, w, h, 22, TERM.bg);
  K.save();
  rr(K, x, y, w, h, 22);
  K.clip();
  K.fillStyle = TERM.bar;
  K.fillRect(x, y, w, bar);
  line(K, x, y + bar, x + w, y + bar, TERM.line, 2, 'butt');
  [C.red, '#4A4C53', '#4A4C53'].forEach((dot, i) => circle(K, x + 28 + i * 26, y + bar / 2, 8, dot));
  text(K, o.title || 'terminal — ~/project', x + w / 2, y + bar / 2 + 7, { font: TERM.font, weight: 500, size: 19, color: TERM.dim });
  // the scrolling body: rows that have started, the newest at the bottom once it fills
  const top = y + bar + pad;
  const bottom = y + h - pad - (o.input ? 78 : 0) - (o.status ? 34 : 0);
  const rows = (o.lines || []).filter(l => t >= l.t0).map(l => termRow(l, t));
  const scroll = Math.max(0, rows.length * lh - (bottom - top));
  K.save();
  clipRect(K, x, top - 4, w, bottom - top + 8);
  rows.forEach((r, i) => {
    const baseline = top + (i + 0.8) * lh - scroll;
    if (baseline < top - lh || baseline > bottom + lh) return;
    const age = t - r.l.t0;
    K.save();
    K.globalAlpha *= clamp(age / 0.12);
    K.translate(0, (1 - E.outCubic(clamp(age / 0.18))) * 10);   // each new row rises 10 px into place
    let pen = x + pad;
    if (r.prefix) {
      text(K, r.prefix, pen, baseline, { font: TERM.font, weight: 700, size: fs, color: r.pcol, align: 'left' });
      pen += measure(K, r.prefix, termFace(fs, true));
    }
    const face = termFace(fs, r.bold);
    const shown = termFit(K, r.txt, face, x + w - pad - pen);
    text(K, shown, pen, baseline, { color: r.col, align: 'left', ...face });
    if (r.caret) caretAt(K, pen + measure(K, shown, face), baseline, fs * 1.05, t, TERM.text);
    K.restore();
  });
  K.restore();
  if (o.input) termInput(K, o.input, t, x, y, w, h, pad, fs, o.status ? 34 : 0);
  if (o.status) {
    const sy = y + h - pad + 2;
    const small = { font: TERM.font, weight: 500, size: fs * 0.66, color: TERM.dim };
    text(K, o.status[0] || '', x + pad + 4, sy, { ...small, align: 'left' });
    text(K, o.status[1] || '', x + w - pad - 4, sy, { ...small, align: 'right' });
  }
  K.restore();
};
// the input line at the bottom: a "> " prompt, the typed text (or a placeholder) and a caret
function termInput(K, input, t, x, y, w, h, pad, fs, statusH) {
  const iy = y + h - pad - statusH - 62;
  const typed = input.t0 !== undefined ? typedStr(input.txt, t, input.t0, input.cps || 30) : input.txt || '';
  const at = x + pad + 52;
  strokeRR(K, x + pad, iy, w - pad * 2, 62, 12, '#44464E', 2);
  text(K, '>', x + pad + 20, iy + 40, { font: TERM.font, weight: 700, size: fs, color: TERM.dim, align: 'left' });
  if (typed) text(K, typed, at, iy + 40, { font: TERM.font, weight: 500, size: fs, color: TERM.text, align: 'left' });
  else if (input.ph) text(K, input.ph, at, iy + 40, { font: TERM.font, weight: 500, size: fs, color: '#5C5E66', align: 'left' });
  caretAt(K, at + measure(K, typed, termFace(fs, false)), iy + 40, fs * 1.05, t, TERM.text);
}
// a small dark code chip, left edge at x, centred on y → its width
const codeChip = (K, str, x, y, o = {}) => {
  const size = o.size || 26;
  const face = { font: F.mono, weight: 700, size };
  const w = measure(K, str, face) + 32, chipH = size * 1.75;
  fillRR(K, x, y - chipH / 2, w, chipH, 10, o.fill || TERM.bg);
  text(K, str, x + 16, y + size * 0.36, { color: o.color || TERM.text, align: 'left', ...face });
  return w;
};
// placeholder text: grey bars of the given widths, one per row
const skeleton = (K, x, y, widths, o = {}) => {
  const sk = withDefaults(o, { h: 16, gap: 30, col: '#E6E3DC' });
  widths.forEach((w, i) => fillRR(K, x, y + i * sk.gap, w, sk.h, sk.h / 2, i === 0 && o.dark ? '#2A2B30' : sk.col));
};
