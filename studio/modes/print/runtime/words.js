/* Susanoo Reel Kit print · words
   The voice clock. WORDS = build/words.json as [{ w, s, e }] (seconds on the finished audio), loaded before timeline.js and the
   scenes, so a scene can work out its beats while it loads:  const T_SLAM = wordAt('camera', 0, 1, 0.2 * VO_END);
   Every beat is a word (a fraction of the voice is the fallback when a word isn't in the script); never hard-coded seconds. */
let WORDS = [];      // [{ w, s, e }]
let VO_END = 0;      // end of the last word
let SENTENCES = [];  // built by buildSentences()
// the text patterns the clock uses
const WORD_RX = {
  quote: new RegExp("[’']", 'g'),
  notWordy: new RegExp("[^a-z0-9$€£%'À-￿-]", 'g'),
  sentenceEnd: new RegExp('[.?!]["”)]*$'),
  clauseEnd: new RegExp('[,;:.?!]["”)]*$'),
  wrapping: new RegExp('^["“(]+|[.,;:?!"”)]+$', 'g'),
  gaps: new RegExp(String.raw`\s+`),
  letters: new RegExp('[^a-z0-9]', 'gi'),
  stops: new RegExp('[.?!]$'),
  pauses: new RegExp('[,;:]$'),
  digit: new RegExp('[0-9]'),
};
// a word reduced to what matching cares about: lower case, curly apostrophes straightened, punctuation dropped
const norm = s => String(s).toLowerCase().replace(WORD_RX.quote, "'").replace(WORD_RX.notWordy, '');
const wordAtClamped = i => WORDS[Math.max(0, Math.min(WORDS.length - 1, i))];
// start / end of word index i (clamped, so a template never breaks on a short script)
const wi = i => (WORDS.length ? wordAtClamped(i).s : 0);
const wiE = i => (WORDS.length ? wordAtClamped(i).e : 0);
const wordStartsAfter = (word, fromT) => word.s >= fromT - 1e-6;

/* ---------- finding words ---------- */
// index of the nth (1-based) word starting with `word` (prefix, case and punctuation ignored) at or after fromT; -1 if none
function wordIndex(word, fromT = 0, nth = 1) {
  const wanted = norm(word);
  if (!wanted) return -1;
  let seen = 0;
  const hit = WORDS.findIndex(w => wordStartsAfter(w, fromT) && norm(w.w).startsWith(wanted) && ++seen === nth);
  return hit;
}
// that word's start (or end) time; `fallback` seconds when it isn't in the script (default: fromT)
const wordTimeOf = (field, word, fromT, nth, fallback) => {
  const i = wordIndex(word, fromT, nth);
  return i < 0 ? fallback ?? fromT : WORDS[i][field];
};
const wordAt = (word, fromT = 0, nth = 1, fallback) => wordTimeOf('s', word, fromT, nth, fallback);
const wordEnd = (word, fromT = 0, nth = 1, fallback) => wordTimeOf('e', word, fromT, nth, fallback);
// the earliest of several candidate words, e.g. cueAny(['comment', 'follow', 'link'], 0, 0.85 * VO_END)
function cueAny(words, fromT = 0, fallback) {
  const starts = words.map(w => wordIndex(w, fromT)).filter(i => i >= 0).map(i => WORDS[i].s);
  const first = Math.min(Infinity, ...starts);
  return first < Infinity ? first : fallback ?? fromT;
}
// short names the example scenes use: wt('word', nth, after) / we(...)
const wt = (w, k = 1, after = 0) => wordAt(w, after, k);
const we = (w, k = 1, after = 0) => wordEnd(w, after, k);
// a fraction of the voice in seconds (0.5 = halfway through)
const frac = f => f * VO_END;
// the index of the word being spoken at t (or the last one that started), -1 before the first
function wordIdxAt(t) {
  const next = WORDS.findIndex(w => !(w.s <= t));   // the first word not yet started (a NaN time counts as before everything)
  return (next < 0 ? WORDS.length : next) - 1;
}

/* ---------- sentences ---------- */
// SENTENCES = [{ i0, i1, s, e, text }], split after . ? ! and at pauses over 0.6 s
function buildSentences() {
  SENTENCES = [];
  let first = 0;
  WORDS.forEach((word, i) => {
    const last = i === WORDS.length - 1;
    if (!(WORD_RX.sentenceEnd.test(word.w) || last || WORDS[i + 1].s - word.e > 0.6)) return;
    SENTENCES.push({ i0: first, i1: i, s: WORDS[first].s, e: word.e, text: WORDS.slice(first, i + 1).map(w => w.w).join(' ') });
    first = i + 1;
  });
}
// the start of the first sentence beginning at or after t (t itself if none): a cut point that works for any script
function sentenceAfter(t) {
  const found = SENTENCES.find(s => s.s >= t - 1e-6);
  return found ? found.s : t;
}
// the sentence that holds time t (the first one before the voice starts)
function sentenceAt(t) { return SENTENCES.reduce((held, s) => (s.s <= t ? s : held), SENTENCES[0]); }
const lastSentence = () => SENTENCES[SENTENCES.length - 1];

// stand-in timings from script.txt (about 2.6 words a second) so a reel previews before it has a voice
function fakeWords(script) {
  let clock = 0.1;
  return script.split(WORD_RX.gaps).filter(Boolean).map(w => {
    const length = 0.16 + Math.min(0.5, w.replace(WORD_RX.letters, '').length * 0.045);
    const word = { w, s: +clock.toFixed(3), e: +(clock + length).toFixed(3) };
    clock += length + (WORD_RX.stops.test(w) ? 0.42 : WORD_RX.pauses.test(w) ? 0.2 : 0.06);
    return word;
  });
}

/* ---------- languages ---------- */
// reel.json "language" (ISO code) picks the stop words (skipped when choosing key words) and the words that mean "comment" (CTA
// detection). A language not listed has no stop words (length decides) and English "comment".
// lang | comment words, comma separated | stop words
const LEX = {};
`en|comment|a an the and or but so to of in on at for with from by as is are was were be been it its this that these those you your yours i me my we our us they them their he she his her not no do does did have has had will would can could just very really than then there here what when where who how why if about into out up down over all any some more most also only even still get got make made like ever never every own
ru|коммент,напиши,пиши,оставь|и а но или да не ни в во на с со к ко у о об от до по за из для без под над при про через это этот эта эти то тот та те так как что чтобы кто где когда если уже еще ещё же ли бы вот там тут здесь все всё всех я ты он она оно мы вы они мне меня тебе тебя его ее её нас вас их им свой свою своё твой твоя мой моя был была было были быть есть будет просто очень только даже тоже потом сейчас можно нужно надо
uk|комент,напиши,пиши,залиш|і й та а але або не ні в у на з із зі до по за від для без під над при про через це цей ця ці той та ті так як що щоб хто де коли якщо вже ще же чи би ось там тут все всі я ти він вона воно ми ви вони мені мене тобі тебе його її нас вас їх свій твій мій був була було були бути є буде просто дуже тільки навіть теж потім зараз можна треба
es|comenta,escribe|el la los las un una unos unas y o pero que de del a al en con por para sin sobre es son fue ser está están esto este esta estos eso ese esa lo le les se me te nos mi mis tu tus su sus yo tú él ella nosotros ellos no sí muy más menos ya hay como cuando donde porque si también solo todo todos
pt|comenta,escreve,escreva|o a os as um uma uns umas e ou mas que de do da dos das em no na nos nas com por para sem sobre é são foi ser está estão isso isto esse essa este esta lo se me te nos meu minha seu sua eu você ele ela nós eles não sim muito mais menos já há como quando onde porque se também só todo todos tem
de|kommentier,schreib|der die das den dem des ein eine einen einem einer und oder aber dass zu von mit für auf in im an am aus bei nach über um ist sind war waren sein bin bist hat haben wird werden es er sie wir ihr ich du man nicht kein keine ja nein sehr mehr nur auch noch schon so wie wenn wo was dann denn mal dein deine mein meine sich
fr|commente,écris,ecris|le la les un une des et ou mais que qui de du à au aux en dans sur pour par avec sans est sont était être a ont avoir ce cet cette ces se ne pas plus je tu il elle on nous vous ils elles me te mon ma mes ton ta tes son sa ses très tout tous comme quand si aussi déjà encore y
it|commenta,scrivi|il lo la i gli le un uno una e o ma che di del della da dal in nel nella con per su tra fra è sono era essere ha hanno questo questa quello quella si mi ti ci vi io tu lui lei noi voi loro non sì molto più meno già come quando dove perché se anche solo tutto tutti mio tuo suo
tr|yorum|ve veya ama ile bir bu şu o da de ki mi mı mu mü için gibi kadar çok daha en ne neden nasıl her şey ben sen biz siz onlar var yok değil ise sonra önce artık hem ya sadece bile
ar|علق,علّق,اكتب,تعليق|و في من إلى على عن مع هذا هذه ذلك تلك هو هي هم أنا أنت نحن أن إن كان كانت لا ما لم لن قد ثم أو كل بعض هناك هنا الذي التي الذين كما لكن بل حتى إذا عند
hi|कमेंट,कॉमेंट,लिखो,लिखें,टिप्पणी|और या लेकिन का के की को में से पर है हैं था थे थी हो होता होती यह वह ये वो मैं तुम आप हम वे इस उस एक भी तो ही नहीं न क्या कि जो जब तक अब बहुत सब कुछ अपना अपने`
  .split('\n').forEach(row => {
    const [lang, comment, stop] = row.split('|');
    LEX[lang] = { comment: comment.split(','), stop };
  });
const reelLang = () => String((typeof REEL !== 'undefined' && REEL && REEL.language) || 'en').toLowerCase().split(/[-_]/)[0];
const _LEXC = {};   // stop-word sets, built once per language
function stopWords(lang = reelLang()) {
  if (!_LEXC[lang]) _LEXC[lang] = new Set(LEX[lang] ? LEX[lang].stop.split(' ').map(norm) : []);
  return _LEXC[lang];
}
const isStopWord = (w, lang) => stopWords(lang).has(norm(w));
// the words that mean "comment" in the reel's language (prefix match), plus English "comment" everywhere except French (where
// "comment" means "how")
function commentWords(lang = reelLang()) {
  const own = (LEX[lang] && LEX[lang].comment) || [];
  const extra = { fr: null, en: [] }[lang];
  return extra === null ? own : own.concat(extra || ['comment']);
}
const isCommentWord = w => {
  const n = norm(w);
  return !!n && commentWords().some(c => n.startsWith(norm(c)));
};
// index of the first "comment" word at or after fromT, or -1
const commentIndex = (fromT = 0) => WORDS.findIndex(w => wordStartsAfter(w, fromT) && isCommentWord(w.w));

/* ---------- key words ---------- */
// the strongest word in [i0, i1]: a number if there is one (unless o.numbers === false), else the longest content word, a little
// bonus the later it comes (so later words win ties)
function keyWordIdx(i0, i1, o = {}) {
  const weigh = i => {
    const bare = norm(WORDS[i].w).replace(/'/g, '');
    if (WORD_RX.digit.test(bare)) return o.numbers === false ? -1 : 100 + i;
    return isStopWord(WORDS[i].w) ? -1 : bare.length + (i - i0) * 0.8;
  };
  let best = -1;
  let top = -1;
  for (let i = Math.max(0, i0), end = Math.min(WORDS.length - 1, i1); i <= end; i++) {
    const score = weigh(i);
    if (score > top) [top, best] = [score, i];
  }
  return best < 0 ? i0 : best;
}
// clauses inside [t0, t1), split after , ; : . ? ! → [{ i0, i1, s, e, key }]: handy for one beat per clause
function clauses(t0, t1) {
  const out = [];
  let open = -1;
  WORDS.forEach((word, i) => {
    if (word.s < t0 - 1e-6 || word.s >= t1) return;
    if (open < 0) open = i;
    const closes = WORD_RX.clauseEnd.test(word.w) || i === WORDS.length - 1 || WORDS[i + 1].s >= t1;
    if (!closes) return;
    out.push({ i0: open, i1: i, s: WORDS[open].s, e: word.e, key: keyWordIdx(open, i, { numbers: false }) });
    open = -1;
  });
  return out;
}
// word i without its surrounding quotes and punctuation
const cleanWord = i => (WORDS[i] ? WORDS[i].w : '').replace(WORD_RX.wrapping, '');
