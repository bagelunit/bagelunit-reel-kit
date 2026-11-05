/* timeline: the scene files, where the cuts fall, captions, and the few sounds that join the scenes.
   This runs after build/words.json is loaded (WORDS and SENTENCES exist) and before the scene files, so every scene can see the cut
   times below. Cue everything on words, never on hard-coded seconds: wordAt('comment'), sentenceAfter(t), wi(index).
   build/word_index.txt lists "index start end word" for picking cue words.
   The starter scenes are a pattern skeleton (modes/print/GUIDE.md Part 1): a stage that builds on the stressed words, live pieces
   that never freeze, a presenter who acts, wipes, and the CTA. Their hook and middle props are plain stand-ins: replace each props
   block with objects invented for your script (playbook/ideas.md); the motion helpers are in parts/mechanics.js. */

SCENE_FILES = ['hook', 'middle', 'cta'].map(name => `scenes/${name}.js`);

const KEYWORD = String((REEL.cta || {}).keyword || 'REEL').toUpperCase();
// cut 1: the first sentence starting after ~18 % of the voice (the hook is its first one or two sentences)
const CUT_MIDDLE = sentenceAfter(Math.max(frac(0.18), 1.6)) - 0.1;
// cut 2: the sentence that says "Comment KEYWORD" in the reel's language (commentIndex knows the word per language), else the last one
const CUT_CTA = (() => {
  const searchFrom = CUT_MIDDLE + 0.5;
  const found = [commentIndex(searchFrom), wordIndex(KEYWORD, searchFrom)];
  const at = Math.max(found[0], found[1]);
  const opening = at < 0 ? lastSentence() : sentenceAt(WORDS[at].s);
  return Math.max(CUT_MIDDLE + 1.5, opening.s - 0.1);
})();

// the stressed words of any script: up to n word indices in [t0, t1), at least `gap` s apart, in time order. Numbers rank first,
// then longer words, with a small bonus for a word that ends a clause. The starter scenes cue their build-up on these.
const tplHasDigit = str => [...str].some(ch => ch >= '0' && ch <= '9');
const tplEndsClause = str => str.length > 0 && ',.;:?!'.includes(str[str.length - 1]);
function tplBeats(t0, t1, n, gap = 0.4) {
  const ranked = [];
  WORDS.forEach((word, i) => {
    const inside = word.s >= t0 && word.s < t1;
    if (!inside || isStopWord(word.w)) return;
    const core = norm(word.w).split("'").join('');
    const numeric = tplHasDigit(core);
    if (core.length < 3 && !numeric) return;
    const score = (numeric ? 100 : 0) + core.length + (tplEndsClause(word.w) ? 1.5 : 0);
    ranked.push({ i, t: word.s, sc: score });
  });
  ranked.sort((a, b) => b.sc - a.sc || a.t - b.t);
  const picked = [];
  for (const q of ranked) {
    if (picked.length >= n) break;
    const spaced = picked.every(o => Math.abs(o.t - q.t) >= gap);
    if (spaced) picked.push(q);
  }
  return picked.sort((a, b) => a.t - b.t);
}
// an interface word with a fallback when the language has none (reel.json "ui" can set any key: "ui": { "problem": "stress" })
const tplText = (key, fallback) => {
  const said = uiText(key);
  return said === key ? fallback : said;
};
// a spoken word as an on-screen label: caps, no punctuation, '' when it is too long to read at size
const tplWord = (i, max = 10) => {
  const label = cleanWord(i).toUpperCase();
  return label.length <= max ? label : '';
};

TIMELINE = () => [
  ['hook', 0],
  ['middle', CUT_MIDDLE],
  ['cta', CUT_CTA],
];

// captions: null = automatic phrases and key words (reel.json captions.emphasize lists words to mark).
// For full control list phrases by word index: [[firstIdx, lastIdx, [key word idxs]], ...]
PHRASES = null;

// the top-right readout (optional): t => ({ k: 'LABEL', v: 'value', hot: bool }); a scene can set its own readout(t)
READOUT = null;

// sound stays sparse and quiet: a whoosh into each cut, and a wipe into the middle (radial) and into the CTA (diagonal)
for (const cut of [CUT_MIDDLE, CUT_CTA]) cue(cut - 0.12, 'whoosh', -4);   // each whoosh starts just before its cut
wipe(CUT_MIDDLE, 1);   // ink covers the hook's stage, then clears onto the middle
wipe(CUT_CTA, 0);
