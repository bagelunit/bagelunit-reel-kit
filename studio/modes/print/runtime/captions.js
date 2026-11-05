/* Susanoo Reel Kit print · captions
   The headline that builds word by word from the voice: Barlow Condensed caps, 80 px, ink, centred on x 540, first baseline at
   y 330, wrapping at 840 px. A key word turns accent and a thick ink marker stroke swipes in under it, with a small spring.
   Timing: each word arrives 0.15 s before it is spoken (0.07 s fade, 18 px drop); when the next phrase starts the old one lifts
   40 px and fades over 0.2 s. A phrase never runs across a scene cut.
   PHRASES (optional, set in timeline.js): [[firstWord, lastWord, [key words], {size, maxW, swap: {index: 'text'}}], ...] by word
   index. Left null, phrases are cut at punctuation, pauses, six words and scene cuts, and key words come from reel.json
   captions.emphasize, else the CTA keyword, else a number, else the strongest content word (stop words per reel.json "language").
   reel.json captions.align "left" sets a flush-left block at captions.x; captions.upper false keeps the script's case. */
let PHRASES = null;
let PHRASE_LIST = [];
let EMPH_TIMES = [];
const CAP = { size: 80, maxW: 840, x: 130, y: 330, lead: 0.15, maxWords: 6, color: null, emphasis: null, align: 'center', upper: true };
const CAP_RX = {
  stopAny: new RegExp('[.?!,;:]["”)]*$'),
  stopHard: new RegExp('[.?!:;]["”)]*$'),
  comma: new RegExp(',$'),
  notAlnum: new RegExp(String.raw`[^\p{L}\p{N}]`, 'gu'),
  digit: new RegExp('[0-9]'),
  apostrophe: new RegExp("'", 'g'),
  quotes: new RegExp('["“”]', 'g'),
  tail: new RegExp('[,;:]+$'),
  rtl: new RegExp(String.raw`[֐-ࣿיִ-﷿ﹰ-﻿]`),
};

/* ---------- automatic phrasing ---------- */
// how many words until the next punctuation (looking at most three ahead; 9 = none that close)
function capWordsToBreak(i) {
  let count = 0;
  for (let k = i + 1; k < WORDS.length && k <= i + 3; k++) {
    count++;
    if (CAP_RX.stopAny.test(WORDS[k].w)) break;
    if (k === i + 3) count = 9;
  }
  return count;
}
// cut the voice into phrases [first, last, []] at punctuation, long pauses, scene cuts and the word limit
function capCutPhrases(cuts) {
  const startsAfterCut = i => cuts.some(c => WORDS[i].s >= c - 0.02 && WORDS[i - 1].s < c - 0.02);
  const phrases = [];
  let first = 0;
  WORDS.forEach((word, i) => {
    const size = i - first + 1;
    const next = WORDS[i + 1];
    const near = capWordsToBreak(i);
    const full = size >= CAP.maxWords && !(near <= 2 && size < CAP.maxWords + 2);   // never strand a one- or two-word tail ("a week.")
    const ends = CAP_RX.stopHard.test(word.w) || (CAP_RX.comma.test(word.w) && size >= 3) || full || i === WORDS.length - 1
      || (next && next.s - word.e > 0.35) || (next && startsAfterCut(i + 1));
    if (!ends) return;
    phrases.push([first, i, []]);
    first = i + 1;
  });
  return phrases;
}
// spoken in caps (any cased script), at least two letters long
const capShouted = w => {
  const core = w.replace(CAP_RX.notAlnum, '');
  return core.length >= 2 && core === core.toUpperCase() && core !== core.toLowerCase();
};
// within three words after a "comment" word of the reel's language
const capAfterComment = i => WORDS.slice(Math.max(0, i - 3), i).some(w => isCommentWord(w.w));
function autoPhrases(cuts) {
  const listed = new Set(((REEL.captions && REEL.captions.emphasize) || []).map(norm));
  const keyword = REEL.cta && REEL.cta.keyword ? norm(REEL.cta.keyword) : null;   // the CTA keyword is always a key word
  const phrases = capCutPhrases(cuts);
  for (const phrase of phrases) {
    const [from, to] = phrase;
    const indices = Array.from({ length: to - from + 1 }, (_, k) => from + k);
    const isKeyword = i => keyword && norm(WORDS[i].w) === keyword && (capShouted(WORDS[i].w) || capAfterComment(i));
    let chosen = indices.filter(i => listed.has(norm(WORDS[i].w)) || isKeyword(i));
    if (!chosen.length && !listed.size) {
      const numbers = indices.filter(i => CAP_RX.digit.test(WORDS[i].w));
      if (numbers.length) chosen = numbers.slice(0, 1);
      else {
        const weight = i => norm(WORDS[i].w).length + (i - from) * 0.8;
        const content = indices.filter(i => !isStopWord(WORDS[i].w) && norm(WORDS[i].w).replace(CAP_RX.apostrophe, '').length >= 4);
        content.sort((a, b) => weight(b) - weight(a));
        if (content.length && indices.length >= 2) chosen = content.slice(0, 1);
      }
    }
    phrase[2] = chosen;
  }
  return phrases;
}

/* ---------- layout ---------- */
let HL = null;
// one phrase's words with their display text, font, width and position (line, x, line centring)
function layoutPhrase(p) {
  const o = p.o || {};
  const size = o.size || CAP.size;
  const maxW = o.maxW || CAP.maxW;
  const face = { font: F.anton, weight: 400, size, ls: size * 0.01 };
  const caps = CAP.upper && o.upper !== false;
  const words = [];
  for (let i = p.i0; i <= p.i1; i++) {
    const word = WORDS[i];
    if (!word) continue;
    const swapped = o.swap && o.swap[i] !== undefined;
    const raw = swapped ? o.swap[i] : word.w.replace(CAP_RX.quotes, '');
    if (!raw) continue;
    const em = p.em.includes(i);
    let disp = caps ? raw.toLocaleUpperCase(REEL.language || undefined) : raw;
    if (em) disp = disp.replace(CAP_RX.tail, '');   // a key word never carries a trailing comma
    words.push({ ...word, disp, em, f: face, wd: measure(K, disp, face) });
  }
  const pad = size * 0.16;
  const gap = size * 0.24;
  // fill lines left to right
  let pen = 0;
  let line = 0;
  for (const w of words) {
    const room = w.wd + (w.em ? pad * 2 : 0);
    if (pen > 0 && pen + room > maxW) {
      pen = 0;
      line++;
    }
    Object.assign(w, { x: pen + (w.em ? pad : 0), line });
    pen += room + gap;
  }
  // right-to-left scripts keep the same breaks, placed from the right edge
  if (words.some(w => CAP_RX.rtl.test(w.disp))) words.forEach(w => { w.x = maxW - w.x - w.wd; });
  // centring: every line moves right by half its free width (a left-aligned block stays flush)
  const widest = [];
  words.forEach(w => { widest[w.line] = Math.max(widest[w.line] || 0, w.x + w.wd + (w.em ? pad : 0)); });
  const center = (o.align || CAP.align) !== 'left';
  words.forEach(w => { w.cx = center ? (maxW - widest[w.line]) / 2 : 0; });
  return { words, lines: line + 1, lh: size * 1.02 + pad * 0.9, size, pad, center, maxW, s: p.s, end: p.end, o };
}
function layoutPhrases() { HL = PHRASE_LIST.map(layoutPhrase); }

/* ---------- drawing ---------- */
// one word of the phrase: plain ink, or the key word in the accent with the marker stroke under it
function capDrawWord(ctx, w, ph, at, look) {
  if (!w.em) {
    ctx.translate(at.x, at.y);
    text(ctx, w.disp, 0, 0, { ...w.f, align: 'left', color: look.ink });
    return;
  }
  const swipe = E.outCubic(clamp(at.age / 0.16));
  const bounce = 1 + ring(at.age - 0.08, 2.4, 6) * 0.06;
  const strokeH = ph.size * 0.16;
  ctx.translate(at.x + w.wd / 2, at.y - ph.size * 0.36);
  ctx.scale(bounce, bounce);
  fillRR(ctx, -w.wd / 2 - ph.pad * 0.3, ph.size * 0.44, (w.wd + ph.pad * 0.6) * swipe, strokeH, strokeH / 2, C.ink);
  text(ctx, w.disp, -w.wd / 2, ph.size * 0.36, { ...w.f, align: 'left', color: look.key });
}
function headline(ctx, t, sc) {
  if (REEL.captions === false || !PHRASE_LIST.length) return;
  if (!HL) layoutPhrases();
  if (sc.noHeadline && sc.noHeadline(t)) return;
  // the newest phrase that has started and belongs to this scene (never one from the scene before a cut)
  const ph = HL.reduce((found, p) => (t >= p.s - CAP.lead && t < p.end + 0.2 && sceneAt(p.s + 0.12) === sc ? p : found), null);
  if (!ph || ph.s < sc.start - 0.12) return;
  const leaving = clamp((t - ph.end) / 0.2);
  const over = (sc.hl && sc.hl(t)) || {};
  const origin = { x: over.x ?? (ph.center ? (W - ph.maxW) / 2 : CAP.x), y: over.y ?? CAP.y };
  const look = { ink: over.color || CAP.color || C.ink, key: over.em || CAP.emphasis || C.red };
  ctx.save();
  ctx.globalAlpha = (over.alpha ?? 1) * (1 - E.inCubic(leaving));
  for (const w of ph.words) {
    const age = t - w.s + CAP.lead;   // words lead the voice a little, so each is readable as it is said
    if (age < 0) continue;
    const drop = (1 - E.outCubic(clamp(age / 0.18))) * -18;
    const at = { age, x: origin.x + w.cx + w.x, y: origin.y + w.line * ph.lh + drop - leaving * 40 };
    ctx.save();
    ctx.globalAlpha *= clamp(age / 0.07);
    capDrawWord(ctx, w, ph, at, look);
    ctx.restore();
  }
  ctx.restore();
}
// the phrase on screen at t: { n, i0, i1, s, end, em } (the last one that has started)
function phraseAt(t) { return PHRASE_LIST.reduce((found, p) => (t >= p.s - 0.15 ? p : found), null); }
// the bottom of the caption block (canvas y) for the phrase at t: keep hero objects below it
function captionBottom(t) {
  if (!HL) layoutPhrases();
  const ph = HL.reduce((found, p) => (t >= p.s - 0.15 ? p : found), null);
  return ph ? CAP.y + (ph.lines - 1) * ph.lh + ph.size * 0.3 : CAP.y;
}
