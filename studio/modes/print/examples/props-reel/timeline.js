// ───────────────────────── timeline: props reel ─────────────────────────
// A showcase of the props in ../objects: one sentence per shot, each prop cued on the words of its sentence.
// It doubles as the test page for those props: `kit frames <this folder> 1 4 7 …` renders every one of them.
SCENE_FILES = ['badgeLine', 'flapBoard', 'railRoute', 'scoreGauge', 'launchBox', 'tubeMail', 'receiptFan', 'keyRing']
  .map(name => `/mode/examples/objects/${name}.js`).concat(['scenes/showcase.js']);

const KEYWORD = String((REEL.cta && REEL.cta.keyword) || 'REEL').toUpperCase();
const SHOT_KEYS = ['badges', 'board', 'rail', 'gauge', 'box', 'tube', 'receipts', 'keys'];
// every shot starts 0.1 s before its sentence
const SHOT_AT = SHOT_KEYS.map((_, i) => Math.max(0, (SENTENCES[i] || lastSentence()).s - 0.1));

TIMELINE = () => SHOT_KEYS.map((key, i) => [key, SHOT_AT[i]]);

PHRASES = null;
READOUT = null;

SHOT_AT.slice(1).forEach(t => cue(t - 0.12, 'whoosh', -4));
wipe(SHOT_AT[4], 2);
