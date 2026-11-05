// cutlist.js · the depth mode's planner: spoken words in, a timed list of cuts out.
//
// A project's cuts.js default-exports a function that gets the voice and returns the cuts, always placed by WORDS, never by typed seconds:
//
//   export default ({ lines, at, end, reel }) => [
//     { id: '01-open', from: 0 },                        // the first cut always starts at 0
//     { id: '02-how',  from: 'here' },                   // the first "here" spoken after the previous cut
//     { id: '03-proof', from: 'last month', title: 'LAST MONTH' },
//     { id: '04-ask',  from: lines.at(-1).t0 },          // seconds are fine when they were read off the words
//   ];
//
// Cut fields
//   id      plays shots/<id>.js
//   from    'word' | 'a phrase' | a word number (whole) | seconds (a fraction, or { s: 4 })
//   title   the taped title over that shot (default: its label, else none)
//   turn    'cut' (default: hard cut, one-frame jolt) | 'soft' (no jolt: two shots of one set) | 'whip' (fast pan through the cut,
//           speed lines, a whoosh of its own) | 'swoop' (fast tilt through the cut, a swoosh)
//   dir     1 | -1 flips a whip or swoop · sound: false keeps the turn silent · any other field is yours (shot.cut.foo)
// cuts.js may instead return { cuts: [...], length: seconds, keys: ['word', …] }; keys are words that show as light tiles.

export const plain = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');
const ENDS_LINE = /[.!?]["”']?$/;

// does the run of words starting at `i` read as `want`? strict = same words; loose = each word starts with the wanted one (3+ letters)
function runMatches(list, i, want, loose) {
  return want.every((w, j) => (loose ? w.length >= 3 && list[i + j].key.startsWith(w) : list[i + j].key === w));
}

// readWords(words) → lookups over the voice clock. words: [{ w, s, e }]
export function readWords(words) {
  const list = words.map((x, i) => ({ text: x.w, s: x.s, e: x.e, i, key: plain(x.w) }));

  // the entry where `phrase` is spoken for the nth time from `after` seconds on; strict matches win over loose ones
  function when(phrase, after = 0, nth = 0) {
    const want = String(phrase).split(/\s+/).map(plain).filter(Boolean);
    if (!want.length) return null;
    for (const loose of [false, true]) {
      let skip = nth;
      for (let i = 0; i + want.length <= list.length; i++) {
        if (list[i].s < after - 0.05 || !runMatches(list, i, want, loose)) continue;
        if (skip === 0) return list[i];
        skip--;
      }
    }
    return null;
  }
  const at = (phrase, after = 0, nth = 0) => when(phrase, after, nth)?.s ?? null;
  const nthWord = (i) => {
    if (!list.length) return null;
    const k = i < 0 ? list.length + i : i;
    return list[Math.min(list.length - 1, Math.max(0, k))].s;
  };

  // spoken lines (sentences), each with its words and times
  const groups = list.reduce((acc, x) => { acc.at(-1).push(x); if (ENDS_LINE.test(x.text)) acc.push([]); return acc; }, [[]]).filter((g) => g.length);
  const lines = groups.map((g) => ({ t0: g[0].s, t1: g.at(-1).e, first: g[0].i, last: g.at(-1).i, text: g.map((x) => x.text).join(' '), words: g }));
  return { list, when, at, nthWord, lines, end: list.length ? list.at(-1).e : 0 };
}

// no voice yet: the house dummy pace (2.7 words a second, +0.35 s after . ! ?, +0.15 s after , : ;, long words a little slower),
// so the starter previews before tools/voice.py has run
export function guessWords(script) {
  const spoken = String(script || 'Write your script in script.txt.').split('\n').filter((l) => !/^\s*#/.test(l)).join(' ').split(/\s+/).filter(Boolean);
  const out = [];
  for (let k = 0, clock = 0.12; k < spoken.length; k++) {
    const w = spoken[k], say = 1 / 2.7 + Math.max(0, w.replace(/[^\p{L}\p{N}]/gu, '').length - 6) * 0.03;
    out.push({ w, s: +clock.toFixed(3), e: +(clock + say * 0.9).toFixed(3) });
    clock += say + (/[.?!]["')]?$/.test(w) ? 0.35 : /[,;:]$/.test(w) ? 0.15 : 0);
  }
  return out;
}

// where a cut's `from` lands, in seconds (null = not found); phrases are searched after the previous cut first
function startOf(from, voice, previous) {
  if (from && typeof from === 'object') return isFinite(from.s) ? +from.s : null;   // { s: 4 } = exactly 4 seconds
  if (typeof from === 'number') return from === 0 ? 0 : Number.isInteger(from) ? voice.nthWord(from) : from;
  if (typeof from === 'string') return voice.at(from, previous + 0.01) ?? voice.at(from);
  return null;
}

async function loadPlan(base, override) {
  if (override) return override;
  try { return (await import(new URL('cuts.js', base).href)).default; }
  catch (e) { console.error('cuts.js missing or broken, playing one shot:', e.message); return null; }
}

export async function readCuts(words, reel, base, override = null) {
  const W = readWords(words);
  const plan = await loadPlan(base, override);
  let made = typeof plan === 'function' ? plan({ lines: W.lines, at: W.at, when: W.when, nthWord: W.nthWord, end: W.end, words: W.list, reel }) : null;
  if (Array.isArray(made)) made = { cuts: made };
  if (!made?.cuts?.length) made = { cuts: [{ id: '01-open', from: 0 }] };

  // 1 · each cut's start, in order
  let previous = 0;
  const placed = made.cuts.map((c) => {
    const t0 = startOf(c.from, W, previous);
    if (t0 == null && typeof c.from === 'string') console.warn(`cuts.js: "${c.from}" is never said (cut ${c.id}); spacing it evenly`);
    if (t0 != null) previous = t0;
    return { ...c, t0 };
  });
  for (let i = 1; i < placed.length; i++) {
    const a = placed[i - 1], c = placed[i];
    if (c.t0 != null && a.t0 != null && c.t0 <= a.t0) console.error(`cuts.js: cut "${c.id}" (${c.t0.toFixed(2)} s) is not after "${a.id}" (${a.t0.toFixed(2)} s): use a longer phrase or a word index`);
  }
  // 2 · cuts that found nothing split the gap up to the next found one (left to right, in place)
  for (let i = 0; i < placed.length; i++) {
    if (placed[i].t0 != null) continue;
    let j = i;
    while (j < placed.length && placed[j].t0 == null) j++;
    const a = i ? placed[i - 1].t0 : 0, b = j < placed.length ? placed[j].t0 : Math.max(W.end, a + 2);
    placed[i].t0 = a + (b - a) / (j - i + 1);
  }
  placed[0].t0 = 0;

  // 3 · ends and turns
  const length = made.length ?? Math.max(W.end + (reel.tail ?? 1.0), reel.length || 0, 2);
  const cuts = placed.map((c, i) => ({ ...c, n: i, t1: placed[i + 1]?.t0 ?? length, turn: i === 0 ? 'none' : c.turn || 'cut' }));
  return { cuts, length, keys: made.keys || [], W };
}
