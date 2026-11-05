// Colour for the lit-room look. One paper, one ink, one accent, one support colour: the same four inks the other kit modes use,
// so a buyer's theme carries across styles. reel.json "theme": "studio" | "harbor" | "ochre" | "ink" (older names clay / cobalt / forest / mono still work) or an object
// { paper, ink, accent, support } (any subset; the rest comes from studio).
//
//   k.swatch.paper    backdrop + the light side of every prop
//   k.swatch.ink      outlines, type, dark props
//   k.swatch.accent   THE colour that means "this matters" (caption tiles, the counter badge, the hero object)
//   k.swatch.support  the second colour (the other side of a comparison, the human, the input)
//   k.swatch.good / bad / warn   status colours, muted to sit in the paper world
//   k.swatch.tone(c, amount)     lighter (+) or darker (-) version of any colour
//
// Shots pick colours from here so every reel in this mode reads as one family.

const PRESETS = {
  studio: { paper: '#EFE9DE', ink: '#161514', accent: '#E5482D', support: '#2F6F8E' },
  harbor: { paper: '#E8EDED', ink: '#0F1B22', accent: '#0B6E99', support: '#E0902F' },
  ochre: { paper: '#EFE9DA', ink: '#1B1712', accent: '#D4911A', support: '#2F5F7E' },
  ink: { paper: '#EDECE8', ink: '#121212', accent: '#202020', support: '#8F8F8F' },
};

const hexToRgb = (h) => { const v = parseInt(String(h).replace('#', '').slice(0, 6), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
const rgbToHex = (c) => '#' + c.map((x) => Math.round(Math.min(255, Math.max(0, x))).toString(16).padStart(2, '0')).join('');

export const blend = (a, b, u) => { const p = hexToRgb(a), q = hexToRgb(b); return rgbToHex(p.map((x, i) => x + (q[i] - x) * u)); };
export const alpha = (h, a) => { const [r, g, b] = hexToRgb(h); return `rgba(${r},${g},${b},${a})`; };
export const luma = (h) => { const [r, g, b] = hexToRgb(h); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };
export const tone = (c, amount) => (amount >= 0 ? blend(c, '#ffffff', amount) : blend(c, '#000000', -amount));

export const swatch = {};

export function pickTheme(theme) {
  const OLD = { clay: 'studio', cobalt: 'harbor', forest: 'ochre', mono: 'ink' }, key = OLD[theme] || theme;   // older preset names map onto the house four
  const base = typeof key === 'string' && PRESETS[key] ? PRESETS[key] : PRESETS.studio;
  const own = theme && typeof theme === 'object' ? theme : {};
  const s = { ...base, ...(own.preset && PRESETS[own.preset] ? PRESETS[own.preset] : {}), ...own };
  if (own.ink2 && !own.support) s.support = own.ink2;              // older reel.json themes used ink2
  const paper = s.paper, ink = s.ink;
  Object.assign(swatch, {
    name: typeof theme === 'string' ? theme : own.preset || 'custom',
    paper, ink, accent: s.accent, support: s.support,
    good: blend('#3D8B5A', paper, 0.12), bad: blend('#B93A2E', paper, 0.1), warn: blend('#D99A2B', paper, 0.1),
    // set tones (older shots used these for a paper studio; the lit rooms pick their own wall families in parts/rooms.js)
    cycTop: tone(paper, 0.35), cycMid: paper, cycLow: blend(paper, ink, 0.12),
    deck: blend(paper, ink, 0.08), deckSide: blend(paper, ink, 0.3), rim: s.accent,
    // props: a warm clay white, a card stock, a slate, a soft metal
    clay: tone(paper, 0.55), card: tone(paper, 0.75), slate: blend(ink, paper, 0.18), metal: blend('#B9B6B0', paper, 0.25),
    screen: blend(ink, '#0B0F14', 0.5), skin: '#E2B08E',
    line: ink,
    tone, blend, alpha, luma,
  });
  return swatch;
}
pickTheme('studio');
