# The presenter (print mode)

Print reels have a flat-vector presenter: a head-and-shoulders bust with a die-cut sticker border, docked in the bottom-right
corner. It points at whatever is new on the stage, follows it with its eyes, lip-syncs to the voice and acts every phrase. It is
drawn in code, so any user can have their own look without generating images.

## Setting it up once

1. **Ask how they want to appear.** Options: a presenter based on a photo or a short description ("curly dark hair, round
   glasses, short beard"), the default presenter, or none at all (`"presenter": false` in reel.json; scenes then use the full
   height).
2. **Translate the photo into options.** Pick the closest skin tone, hair shape and colour, facial hair, glasses, headwear, top and
   accessories (every value is listed in `modes/print/GUIDE.md`, section 6). Aim for a friendly caricature that reads as them at a
   glance, not a portrait.
3. **Render and compare:** `node "$KIT_DIR/tools/kit.mjs" frames <project> 0 1 2 3 4 5 --only presenter` draws the presenter sheet
   (0 portrait, 1 poses, 2 expressions, 3 every hairstyle in their colours, 4 pointing aims, 5 moods). Put page 0 next to the photo
   and adjust. Hair shape, hair colour, glasses and beard carry most of the likeness.
4. **Save it as their default** in `~/.config/susanoo-reels/config.json` under `"host"`. `kit start` copies it into every new print
   reel as `"presenter"`. Tell them it's saved and easy to change ("give my presenter longer hair").

## What the options cover

| Option | What it controls |
|---|---|
| `hair` | the haircut: short straight cuts, waves and curls, buzz or bald, long styles, ponytail or bun |
| `hairColor` | a named colour (black, brown, auburn, blonde, grey…) or any `#hex` |
| `glasses`, `glassesStyle`, `glassesColor`, `glassesW` | on/off, round or square, frame colour, frame thickness |
| `beard`, `beardColor` | none, stubble or full; its colour (default: the hair colour) |
| `beanie`, `beanieColor`, `beanieTab` | a knit beanie, its colour, the small accent tab |
| `skin`, `top`, `topColor`, `innerColor`, `accessories`, `face`, `slim`, `lashes` | the rest of the look |
| `dock` | its home spot `{ x, y, s }` (default bottom-right, 842, 1990, scale 0.8) |

reel.json `"sticker": false` removes the sticker border.

## Making it feel alive

- **It acts on its own.** A scene's `guy: t => act(t, { focus: … })` makes it point at the focus and re-aim when the focus moves,
  turn its head and eyes to it, change expression every phrase, alternate point / present / frame gestures, and jab on the
  emphasised words. Give `focus` the newest element (`ST.focus` from the build-up stage does this for you).
- **Moods for the big moments:** `mood(t, [[name, t0, t1], …])` with `panic`, `shock`, `thinking`, `celebrate`, `lean`, `shrug`,
  `facepalm`, `wave`, `thumbs`, `shh`, `no`, `nod`, `hero`; `moodFx` adds their extras (red glow, burst lines, a thought bubble,
  confetti). Use shock and panic only on a real surprise.
- **Poses** for hand-written beats: point, present, frame, wave, thumb, shrug, facepalm, cover, shh, hold, fist, down.
- **Props in hand:** `PRESENTER.anchors(state)` gives its hand, mouth and head points, so a DM bubble or a prop can come out of its
  hand.
- **Talking:** the mouth follows the letters of each word (open, wide, round, pressed lips for m/b/p, teeth on the lip for f/v), in
  any language the kit reads.
