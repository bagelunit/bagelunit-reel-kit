/* Susanoo Reel Kit print · lipsync
   Mouth shapes from the word timings, with no outside tools. Letters become rough phonemes (letter pairs first), each word's
   phonemes share its time (vowels get more), keyframes are joined, smoothed (quick to open, slower to close), and m / b / p press
   the lips shut. Cyrillic and Greek are spelled out in Latin first, accents are dropped (é ñ ü ç ş ß…); a word in any other script
   gets an open-close rhythm at about five syllables a second from its length, so the mouth never freezes on one shape.
   Output: VIS = { fps, jaw[], lipW[], press[], teeth[], tongue[] } and ENV[] (a 0..1 talking envelope for head bob and brows). */
let VIS = null;
let ENV = [];
const VIS_FPS = 60;
(() => {
  // mouth shapes: jaw · lip width (-1 round … 1 wide) · lip press · teeth · tongue
  const SHAPE = {};
  `P 0 0 1 0 0|M 0 0 1 0 0|F .12 .2 0 1 0|TH .25 .2 0 .5 .9|L .35 .2 0 .3 1|W .15 -1 0 0 0|UW .25 -.9 0 0 0|OW .5 -.75 0 0 0|AO .65 -.4 0 0 0
   AA .9 .1 0 .2 0|AE .8 .5 0 .4 0|AH .55 .15 0 .2 0|AY .8 .3 0 .3 0|EH .45 .65 0 .6 0|IH .28 .75 0 .6 0|IY .2 .95 0 .7 0|ER .3 -.4 0 .2 0
   R .25 -.5 0 .2 0|S .12 .5 0 .9 0|T .18 .3 0 .7 .5|N .18 .3 0 .5 .5|SH .18 -.55 0 .5 0|K .3 .2 0 .3 0|HH .35 .2 0 .2 0|Y .2 .7 0 .5 0`
    .split(/[|\n]/).forEach(row => {
      const [name, ...v] = row.trim().split(' ');
      SHAPE[name] = v.map(Number);
    });
  const REST = [0, 0, 0.15, 0, 0];
  const VOWELS = new Set('UW OW AO AA AE AH AY EH IH IY ER'.split(' '));
  // letter groups read before single letters, in this order: spelling = phonemes
  const GROUPS = 'tion=SH AH N|ough=OW|igh=AY|th=TH|sh=SH|ch=SH|ph=F|wh=W|ck=K|ng=N|qu=K W|oo=UW|ee=IY|ea=IY|ai=EH|ay=EH|oa=OW|ou=AW|ow=OW|oi=OW IY|oy=OW IY|au=AO|aw=AO|er=ER|ir=ER|ur=ER|ar=AA R|or=AO R'
    .split('|').map(pair => {
      const [spelling, sounds] = pair.split('=');
      return [spelling, sounds.split(' ')];
    });
  // one pass over a word: the first group that fits at each position (in list order), else a single letter
  const GROUP_SOUNDS = new Map(GROUPS);
  const SPELLING = new RegExp(GROUPS.map(([spelling]) => spelling).join('|') + '|.', 'g');
  const pairsToMap = text => Object.fromEntries(text.trim().split(/\s+/).map(pair => pair.split('=')));
  const LETTER = pairsToMap('a=AE e=EH i=IH o=AA u=AH y=IY b=P p=P m=M f=F v=F l=L w=W r=R s=S z=S c=K x=K k=K g=K q=K j=SH t=T d=T n=N h=HH');
  const DIGIT_NAMES = 'zero one two three four five six seven eight nine'.split(' ');
  // phonetic Latin for Cyrillic (Russian, Ukrainian, Belarusian, Kazakh, Serbian, Macedonian, Bulgarian), Greek (with tonos) and a
  // few Latin extras; an empty value drops the letter
  const SPELL = pairsToMap(`а=a б=b в=v г=g ґ=g д=d е=e ё=yo є=ye ж=zh з=z и=ee і=ee ї=yee й=y к=k л=l м=m н=n о=o п=p р=r с=s т=t у=oo ў=w
    ф=f х=h ц=ts ч=ch ш=sh щ=sh ъ= ы=i ь= э=e ю=yoo я=ya ә=a ғ=g қ=k ң=ng ө=o ұ=oo ү=oo һ=h ђ=j ј=y љ=l њ=n ћ=ch џ=j ѓ=g ќ=k ѕ=dz
    α=a ά=a β=v γ=g δ=th ε=e έ=e ζ=z η=ee ή=ee θ=th ι=ee ί=ee ϊ=ee ΐ=ee κ=k λ=l μ=m ν=n ξ=ks ο=o ό=o π=p ρ=r σ=s ς=s τ=t υ=ee ύ=ee
    ϋ=ee ΰ=ee φ=f χ=h ψ=ps ω=o ώ=o ß=ss æ=ae œ=oe ø=o ł=l đ=d ı=i þ=th ð=th`);
  const R = (src, flags) => new RegExp(src, flags);
  const RX = {
    beyondLatin: R(String.raw`[^\u0000-ɏ]`),
    greekOu: R('ο[υύ]', 'g'), greekEi: R('[εέοό][ιί]', 'g'), greekAi: R('[αά][ιί]', 'g'), greekAv: R('([αάεέ])[υύ]', 'g'),
    spellable: R(String.raw`[Ͱ-ϿЀ-ӿԀ-ԯßæœøłđıþð]`, 'g'),
    accents: R(String.raw`[̀-ͯ]`, 'g'),
    digit: R(String.raw`\d`, 'g'),
    notLatin: R('[^a-z ]', 'g'),
    latinLetter: R('[a-z]'),
    space: R(String.raw`\s`, 'g'),
    anyLetter: R(String.raw`\p{L}`, 'u'),
    vowelE: R('[aeiouy]e$'),
  };
  // spell a word in phonetic Latin → { lat (a-z and spaces), nonLatin (it had letters beyond Latin), foreign (nothing readable left) }
  function translit(word) {
    const lower = String(word).toLowerCase();
    const nonLatin = RX.beyondLatin.test(lower);
    const spelled = lower
      .replace(RX.greekOu, 'oo').replace(RX.greekEi, 'ee').replace(RX.greekAi, 'e').replace(RX.greekAv, '$1v')   // Greek letter pairs
      .replace(RX.spellable, ch => SPELL[ch] ?? ch)
      .normalize('NFD').replace(RX.accents, '');
    const lat = spelled.replace(RX.digit, d => DIGIT_NAMES[d] + ' ').replace(RX.notLatin, '');
    return { lat, nonLatin, foreign: !RX.latinLetter.test(lat.replace(RX.space, '')) && RX.anyLetter.test(spelled) };
  }
  // an open-close rhythm for a word we can't read: about five syllables a second of its duration, the same every time for that word
  const BEAT_CONSONANTS = 'N T K M S L T HH'.split(' ');
  const BEAT_VOWELS = 'AA EH AO IY AH UW AE IH'.split(' ');
  function syllables(word, dur) {
    const count = Math.max(1, Math.min(14, Math.round(dur * 5)));
    const seed = [...String(word)].reduce((acc, ch) => (acc * 31 + ch.codePointAt(0)) >>> 0, 7);
    return Array.from({ length: count }, (_, i) => {
      const vowel = BEAT_VOWELS[(seed >> 3) + i * 5 & 7];
      const leads = i > 0 || (seed & 1);   // the very first syllable may start on its vowel
      return leads ? [BEAT_CONSONANTS[(seed + i * 3) % BEAT_CONSONANTS.length], vowel] : [vowel];
    }).flat();
  }
  // a word's phonemes; dur (seconds) only matters for unreadable scripts
  function phones(word, dur = 0.3) {
    const spelled = translit(word);
    if (spelled.foreign) return syllables(word, dur);
    const out = [];
    spelled.lat.split(' ').filter(Boolean).forEach(chunk => {
      let part = chunk;
      const silentE = !spelled.nonLatin && part.length > 3 && part.endsWith('e') && !RX.vowelE.test(part);   // English: a silent final e
      if (silentE) part = part.slice(0, -1);
      for (const [piece] of part.matchAll(SPELLING)) {
        const group = GROUP_SOUNDS.get(piece);
        if (group) out.push(...group);
        else if (LETTER[piece] && LETTER[piece] !== out[out.length - 1]) out.push(LETTER[piece]);   // doubled letters sound once
      }
    });
    if (!out.length) return ['AH'];
    return out.map(p => (p === 'AW' ? 'AO' : p));
  }
  const closesLips = p => p === 'P' || p === 'M';
  const timeShare = p => (VOWELS.has(p) ? 1.7 : p === 'T' || p === 'K' || p === 'P' ? 0.7 : 1);
  // keyframes [time, shape, lipsClose] for the whole voice: each word's phonemes, rests in pauses, a rest before and after
  function keyframes(words) {
    const keys = words.flatMap(w => {
      const ph = phones(w.w, w.e - w.s);
      const shares = ph.map(timeShare);
      const whole = shares.reduce((a, b) => a + b, 0);
      const span = Math.max(0.06, w.e - w.s);
      const before = shares.reduce((acc, share, i) => acc.concat(i ? acc[i - 1] + shares[i - 1] : 0), []);   // time share used up before each phoneme
      return ph.map((p, i) => [w.s + (before[i] + shares[i] / 2) / whole * span, SHAPE[p] || SHAPE.AH, closesLips(p)]);
    });
    words.forEach((w, i) => {
      const next = words[i + 1];
      if (next && next.s - w.e > 0.18) keys.push([(w.e + next.s) / 2, REST, false]);
    });
    if (words.length) keys.push([words[0].s - 0.2, REST, false], [words[words.length - 1].e + 0.25, REST, false]);
    return keys.sort((a, b) => a[0] - b[0]);
  }
  const channels = n => [0, 1, 2, 3, 4].map(() => new Float32Array(n));
  // the shape at every frame: ramp up into the first key, hold the last, straight lines between keys
  function sampleKeys(keys, n) {
    const raw = channels(n);
    let k = 0;
    for (let f = 0; f < n; f++) {
      const t = f / VIS_FPS;
      while (k + 1 < keys.length && keys[k + 1][0] <= t) k++;
      const A = keys[k], B = keys[k + 1];
      raw.forEach((track, j) => {
        if (!A) track[f] = REST[j];
        else if (!B || t <= A[0]) track[f] = t < A[0] ? REST[j] + (A[1][j] - REST[j]) * clamp(1 - (A[0] - t) / 0.2) : A[1][j];
        else track[f] = lerp(A[1][j], B[1][j], (t - A[0]) / Math.max(1e-6, B[0] - A[0]));
      });
    }
    return raw;
  }
  window.buildLipSync = function (words, dur) {
    const n = Math.max(2, Math.ceil((dur + 1) * VIS_FPS));
    const keys = keyframes(words);
    const raw = sampleKeys(keys, n);
    // coarticulation: follow each track, faster when opening than when closing
    const out = channels(n);
    const now = [0, 0, 0.15, 0, 0];
    for (let f = 0; f < n; f++) {
      for (let j = 0; j < 5; j++) {
        const target = raw[j][f];
        now[j] += (target - now[j]) * (target > now[j] ? 0.62 : 0.42);
        out[j][f] = now[j];
      }
    }
    const [jaw, , press] = out;
    // m, b, p: the lips really shut for ±30 ms around the key
    // every frame index from time a up to (not including) time b that exists
    const framesBetween = (a, b, fn) => {
      for (let f = Math.floor(a * VIS_FPS); f < b * VIS_FPS; f++) if (f >= 0 && f < n) fn(f);
    };
    keys.filter(key => key[2]).forEach(([c]) => framesBetween(c - 0.03, c + 0.03, f => {
      jaw[f] = Math.min(jaw[f], 0.03);
      press[f] = 1;
    }));
    // stress: long content words open wider than "a" or "the"
    words.forEach(w => {
      const spelled = translit(w.w);
      const size = spelled.foreign ? (w.e - w.s) * 14 : spelled.lat.replace(RX.space, '').length;
      const gain = 0.72 + 0.28 * clamp((size - 2) / 6);
      framesBetween(w.s, w.e, f => { jaw[f] *= gain; });
    });
    VIS = { fps: VIS_FPS, jaw, lipW: out[1], press, teeth: out[3], tongue: out[4] };
    // the talking envelope: the jaw, boosted and smoothed slowly
    ENV = new Float32Array(n);
    jaw.reduce((level, open, f) => {
      const next = level + (open * 1.4 - level) * 0.12;
      ENV[f] = clamp(next);
      return next;
    }, 0);
  };
  window.lipPhones = phones;
})();
// the mouth at time t, interpolated between frames (a closed resting mouth before any lip sync exists)
function visAt(t) {
  if (!VIS) return { jaw: 0, lipW: 0, press: 0.15, teeth: 0, tongue: 0, mouth: 0 };
  const f = t * VIS.fps;
  const i = Math.max(0, Math.min(VIS.jaw.length - 2, Math.floor(f)));
  const u = clamp(f - i);
  const shape = Object.fromEntries(['jaw', 'lipW', 'press', 'teeth', 'tongue'].map(name => [name, lerp(VIS[name][i], VIS[name][i + 1], u)]));
  shape.mouth = shape.jaw * 0.95;
  return shape;
}
// how much talking is going on at t, 0..1
const envAt = t => (ENV.length ? ENV[Math.max(0, Math.min(ENV.length - 1, Math.floor(t * VIS_FPS)))] : 0);
