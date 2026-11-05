// ───────────────────────── timeline: casinos ─────────────────────────
// "Casinos have no clocks. And that's on purpose. No clocks, no windows, no daylight. So time just disappears. Players stay 40
//  percent longer when they can't see the hour. And the longer you stay, the more the house wins. Comment CASINO and I'll send
//  you the full breakdown."
// One story: the casino takes the clock (hook) → the room shuts out time and your watch goes blank (inside) → the slot keeps you
// (stay) → your chips walk to the house (house) → CTA. Every cut sits on the first word of a sentence.
SCENE_FILES = ['scenes/props.js', 'scenes/hook.js', 'scenes/inside.js', 'scenes/stay.js', 'scenes/house.js', 'scenes/cta.js'];

const KEYWORD = String((REEL.cta && REEL.cta.keyword) || 'REEL').toUpperCase();
const CUT_INSIDE = wordAt('no', wordEnd('purpose', 0, 1, 2.7), 1, 2.92) - 0.1;
const CUT_STAY = wordAt('players', CUT_INSIDE, 1, 7.24) - 0.1;
const CUT_HOUSE = wordAt('and', CUT_STAY + 2, 1, 10.12) - 0.1;
const CUT_CTA = wordAt('comment', CUT_HOUSE, 1, 12.66) - 0.1;

TIMELINE = () => [
  ['hook', 0],
  ['inside', CUT_INSIDE],
  ['stay', CUT_STAY],
  ['house', CUT_HOUSE],
  ['cta', CUT_CTA],
];

PHRASES = null;
READOUT = null;

for (const t of [CUT_INSIDE, CUT_STAY, CUT_HOUSE, CUT_CTA]) cue(t - 0.12, 'whoosh', -4);
wipe(CUT_STAY, 2);          // blinds rise into the effect
wipe(CUT_CTA, 0);
