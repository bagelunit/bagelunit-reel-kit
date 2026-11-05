# Print mode manual

This is everything `modes/print/` expects from a scene. Read all of it once before you write the first one; after that, Part 3 and
Part 4 are the parts you'll keep coming back to.

**The look in one paragraph.** A two-colour riso print on warm stock. The paper (`#F5EFE6`) carries a faint accent bloom in two
corners, fibre mottle and grain. Shading is engraved: parallel ink lines whose weight carries the tone, with the accent lines printed
a hair off-register like a real drum. There is one accent colour (signal orange `#F2542D` in the default `studio` theme) and it only
ever marks the thing that matters. Cards are paper-white with a 3 px ink edge and a hard, line-shaded offset shadow (never a soft
blur); their labels are Oswald caps. Captions are big centred Barlow Condensed ExtraBold caps, built word by word; the key word turns
accent and a thick ink marker line swipes in under it. A flat cartoon presenter bust with a die-cut sticker edge sits bottom-right,
points at the main object the whole time and changes gesture and face on every phrase. Up top: a section tab (ink tab, accent
number) on the left and a readout chip on the right. Everything moves like a physical thing: it slams, squashes, overshoots and
settles. One camera kick per big moment. Scenes change on a hard cut on a word, now and then through a shutter wipe (diagonal blinds
close over the old scene and open on the new one).

**Themes** (reel.json `"theme"`): `studio` (default), `harbor`, `ochre`, `ink`. The v1.0 names `clay`, `cobalt`, `forest`, `mono`
still work. For your own mix pass an object: `{ "preset": "studio", "accent": "#…", "paper": "#…", "ink2": "#…", "bloom": 0..1,
"grain": 0.03 }`. `"brand": { "handle": "@you" }` prints the handle top-right whenever a scene has no readout. `"sticker": false`
drops the presenter's sticker edge.

**See it before you write it.** `node tools/kit.mjs frames <project> 1 3 5 --only presenter` shows the presenter; the starter's
scenes show the cards; `modes/print/examples/SHOTS.md` lists every example (each file's header comment is the useful part). The
strips in `modes/print/examples/frames/` are 1 fps frames of the casinos reel (`examples/casinos/`), "Casinos have no clocks", 15 s:
use them to calibrate density, staging and pace. Every word changes the stage, and one object carries each section.

---

# Part 1 · The bar

## 1.1 Numbers to hit

Measured on the benchmark reels: **motion 5.0-7.8, big moves 0.7-1.6 per second.** A reel made of "one object per beat on bare
paper" measures about 3.8 / 0.3 and reads as a slideshow. Before planning, open the three strips (one frame per second):

| strip | watch for |
|---|---|
| `examples/frames/look_01.jpg` | 0-5 s · the casino front lands already lit (marquee chasing, guests walking in, velvet ropes) → a wall clock swings onto its nail, shudders on "no", gets yanked off on "clocks", and a red X is drawn over the empty nail → BY DESIGN slams on "purpose" → a wall of frames fills up, one per "no" (nail crossed out, shutters slam, the sun sinks) |
| `examples/frames/look_02.jpg` | 5-10 s · the room goes dark (the whole wall prints in lines), a neon OPEN 24/7 buzzes on, a wristwatch rises and its numerals fly off on "disappears" → blind wipe → a slot machine drops, the lever pulls on "Players", the reels stop on sevens, +40 % rolls in on "40", a free drink slides in, a time ticket feeds out on "longer", tape slaps over the watch on "hour" |
| `examples/frames/look_03.jpg` | 10-15.5 s · a card table slides in, a chip hops from YOU to HOUSE on every stressed word while the session timer races, the rake sweeps in and HOUSE WINS slams → blind wipe → the CTA: CASINO types into the composer, a giant CASINO chip slams down on Post, replies stack up, an envelope flies down and lands as THE FULL BREAKDOWN booklet, its rows ticking |

What every scene has to deliver (check it on the shot cards and with `kit pace`):
- **Something happens on every stressed word**, roughly every 0.4-0.8 s: a thing arrives or changes state. The quiet words between
  still have motion.
- **A big move at least 0.7 times a second** on average: a slam or drop, a stamp, a topple, a cut, a whip, a shutter wipe, a big
  counter roll, the presenter stepping forward. "Big" means a large part of the frame changes.
- **No element holds still for more than 1.2 s.** Everything that has landed keeps an idle life (§1.4). A frozen frame reads as flat.
- **`kick` only on the one or two biggest moments** of a scene, never on every event.
- `kit pace <project>` has to PASS: motion ≥ 4.8, big/s ≥ 0.65, flat ≤ 27 %. It prints every flat stretch with its words.

## 1.2 The stage fills up, the focus moves

Treat a scene as a stage that **accumulates**. Each stressed word either adds one element or changes the state of one that's there
(a card lands, a needle jumps, a counter rolls, a stamp hits, a badge drops, a plug goes in). What arrived earlier **stays** (pushed
aside, a little smaller) and **keeps moving** (ticking, swinging, scrolling, blinking). Two or three seconds in, the frame holds 3-6
elements, and the eye still knows where to go, because there is **exactly one focus**: the newest element, the one that just moved.
It gets the accent and the presenter's finger. "One hero per beat" means one focus at a time on a full stage, never one small object
alone on empty paper.

## 1.3 Where things go

- **Coverage.** Halfway through a beat, 60-80 % of the hero zone (scene y 540-1320) has something on it. That's the focus, 360-800 px
  across, with two to five older pieces of 200-420 px around it. Only the focus gets the accent, the finger and the camera lean. Older
  pieces shrink to 0.75-0.9, slide out of the way and lose their accent header, and they stay on stage until it resets.
- **Resets** happen at a cut or a transition, roughly every one to three sentences: the old stage drops, flies off or gets wiped, and
  the next one starts filling.
- **Regions, in scene coordinates:**

  | region | x | y | for |
  |---|---|---|---|
  | upper band | full width | 540-760 | rows that hang, pills, small live props |
  | middle | full width | 760-1150 | the focus |
  | left column | 60-560 | down to 1400 | anything that grows: stacks, towers, toast piles |
  | right column | 640-1000 | down to ~1150 only | the presenter's head lives below it |

  Captions sit above all of these. Never leave one card parked bottom-left for the whole reel.
- **Type size:** whatever the viewer has to read is 40 px or more. Small mono bits (statuses, timestamps, labels at 20-28 px) are
  allowed as texture.
- **Marks land exactly on their target.** The accent goes on the newest or most important thing, nothing else.

## 1.4 Idle life (every element that has landed gets one)

Pick whichever suits the object. Clocks: the seconds hand ticks, or the minutes hand spins. Hanging things (badges, plugs, signs):
they keep swinging. Stacks: the higher they get, the more they sway. Numbers: odometers keep rolling. Charts: the sparkline keeps
drawing and its last dot pulses. Indicators: a REC dot or LIVE pill blinks, a caret flashes. Text: it types, or a reply streams in.
Media: the playhead runs. Tasks: a spinner turns on the row. Alerts: new ones push the old ones down. Statuses count up ("on a call
0:14", "12 tickets"). Gauges: the needle strains at the top with sparks. Cables: dots of power run along them. Anything else floats
gently (`idleSway`, which the build-up stage applies for you).

## 1.5 The presenter acts

- **Their finger is always on the focus**, following it when it moves (`act({ focus: t => ST.focus(t) })` does the following).
- **Each phrase gets a reaction.** The `mood()` presets (§3.8) cover the usual ones: panic is a hand over the mouth with sweat and a
  red glow; shock is both hands to the face, an O mouth and a jolt backwards; there's thinking; celebrating is two fists, a hop and
  confetti; plus leaning in for the reveal, a shrug, a facepalm, a wave, and a thumbs-up with a wink.
- **Once per reel the presenter is the hero**, on a personal line ("you're scared", "you hide", "I did this"): they step to the
  centre and grow (`heroAt`, or mood `'hero'`), REC viewfinder brackets close on their face (`recFrame`), a red glow sits behind them.
  The content moves aside for those 1.5-2.5 s.
- **A clone in a card makes a role personal** (an ID-badge photo, say): draw `PRESENTER.draw(T, K, guyState(...))` clipped into your
  card. The badge photos in `examples/objects/badgeLine.js` show the clipping.

## 1.6 Every reel invents its own objects

Each reel builds **its own central metaphor** from its script and draws **2-5 props** for it, inside its own scene files. Props never
carry over from reel to reel. The object comes from the script's own words: "4 plugins" was a power strip, "you do 6 jobs" a line of
ID badges, "scared to show your face" a REC viewfinder on the presenter. Strong reels carry 52-111 lines of their own scene code per
second; reels assembled from finished props carry about 13, and they all look alike.

So the engine ships **how things move, not what moves**: `parts/mechanics.js` holds springs, pendulums, gravity, idle life, the
build-up stage, acting and generic live UI. The method (find the object in the script's words, list its parts, give every word a
physical reaction) and the effort budget are in `playbook/ideas.md`. The example props in `examples/objects/` (badge line, flap board,
rail route, score gauge, launch box, tube mail, receipt fan, key ring) show overshoot values, physics and idle loops: learn from them,
don't paste them. The starter's hook and middle props are stand-ins inside a `// ── THIS REEL'S METAPHOR ... ──` block: replace that
block. Physics is what makes any prop read: gravity, overshoot and settle, pendulum swings, squash on landing, neighbours jolted,
and an idle life afterwards.

## 1.7 Between scenes

- **Hard cut** on the first word of a beat (the default).
- **Shutter wipe** (`wipe(t, mode)`), 1-3 per reel: into a new section or into the CTA.
- **Palette switch** for a contrasting section (`paletteFlood`, e.g. "now picture a team" in dark ink).
- **Carry-over morph:** the focus of one scene becomes the first element of the next (a laptop screen turns into a roster card, a step
  becomes a staircase; `morphRect`).
- **Topple or fly-out:** the old stage falls (`exitMode: 'fall'`) while the new focus slams in on the same word.

## 1.8 Shot card (write one per beat in STORYBOARD.md before any code)

```
beat 02 · "Every app you signed into has a copy of your password, and most of them never change it." (words 14-31, 4.2-9.0 s)
  already on stage : the key ring top-left (swaying), the phone top-right (screen glowing)
  per stressed word: app → EMAIL key drops onto the ring (clink) · signed → BANK key drops, ring swings · copy → a carbon copy
                     slides out of each key · password → *** chips pop on the copies · never → a calendar flips, nothing changes
  keeps moving     : the ring sway, the phone's notification count, the calendar pages
  presenter        : points at the newest key · "copy" leans in · "never" facepalm
  camera           : stageCam leans to each key; kick on "never"
  big moves        : 4 drops + the flip = about 1 per second ✓
```

## 1.9 Slideshow or stage

The same script with the same voice: built one object per beat it measured motion 3.8, big 0.31/s, 32 % flat; rebuilt with this
part of the manual and the mechanics primitives it measured motion 6.6, big 0.98/s, 0 % flat.

| reads as a slideshow | reads as a stage |
|---|---|
| for three seconds there's only a stopwatch, centred on bare paper | top-right, the stopwatch keeps ticking; next to it a pile grows piece by piece, and the finger follows each new piece |
| a card appears and then sits there, frozen, until the cut | on landing, the card's rows check off one at a time, its number rolls, and the next word pushes a toast in |
| one object disappears and the next pops up in the middle | the previous object shrinks to the side and keeps moving while the next one slams into the focus spot |
| the presenter holds one pointing pose all scene | first panic, then a lean-in, then a celebration; and in one moment of the reel the presenter is the hero |
| a 4-second scene whose only big moment is a stamp | HIGH, MAX, then BROKEN on the needle, then a stamp, a pile tipping over and a camera kick, each landing on its word |
| "habit", "streak", "discipline" as a text label on a card | an object made for THIS script that changes physically on each word (a calendar ticking over, a chain of links snapping) |
| the same gauge, badge line or tower as in other reels | 2-5 props drawn for this script and moved with the primitives (`kit effort` flags stock props) |

---

# Part 2 · How a print reel is built

## 2.1 Files, load order, commands

```
<project>/
  index.html       the loader page (never edit)          reel.json  style, name, language, cta.keyword, presenter, captions, theme, ui
  timeline.js      SCENE_FILES, cut times, TIMELINE, PHRASES, READOUT, reel-wide sounds     (yours)
  scenes/*.js      one file per scene, an IIFE that registers SC.<key> = {...}              (yours)
  script.txt       build/words.json  build/word_index.txt  audio/vo.mp3  assets/ (your images)
the engine (read-only, served at /mode/):
  runtime/  load.js (loads the rest in order) lib.js ui.js media.js words.js lipsync.js captions.js acting.js presenter.js halftone.js engine.js
  parts/    fx.js devices.js cards.js charts.js mechanics.js (motion primitives, the build-up stage, live UI, acting presets: §3.8)
examples (read-only, never loaded by a reel): examples/objects/*.js (props, played by examples/props-reel) · examples/p*.js (scenes) · examples/casinos/ (a whole reel)
```

**Boot order:** runtime and parts → `reel.json` → `build/words.json` (stand-in timings from `script.txt` when there's no voice yet)
→ `timeline.js` → each file in `SCENE_FILES`, in order → `TIMELINE()` → captions → lip sync → fonts and `ASSETS` images →
`window.studio.ready` (the page handshake, see `modes/MODE-RULES.md`).

**One shared global scope.** Every file is a plain script, so a top-level `const` in timeline.js is visible to the scenes. Wrap each
scene in `(() => { ... })();` and prefix any helper you leave global: two scenes that both declare `const T_IN` at top level crash
the page. Don't name your own constants after engine or kit functions (`slot`, `stamp`, `glow`, `tag`, `toast`…): inside the IIFE
they quietly shadow the real one. The starter's globals are `KEYWORD`, `CUT_MIDDLE`, `CUT_CTA`, `tplBeats`, `tplText`, `tplWord`
(timeline.js); its scene-level names are prefixed (`CTA_SHEET`, `CTA_DM`, `CTA_BIG`, `mdSlot`).

```
node tools/kit.mjs frames <project> 0.3 1.5 3 5 7      → stills/sheet.jpg  (open it and look, every time)
node tools/kit.mjs frames <project> 2 4 --only cta     → one scene only (times are reel times)
node tools/kit.mjs frames <project> 0 1 2 3 4 5 --only presenter
                                                        → presenter sheet: 0 portrait · 1 poses · 2 faces · 3 hairstyles ·
                                                          4 act() aimed at up-left targets · 5 mood() presets + stamp
node tools/kit.mjs render <project> [--from a --to b]   → build/draft.mp4 (half size) · --final for the full render
node tools/kit.mjs export <project>                     → out/<name>.mp4 (voice + sound effects)
page URL options: ?t=3.5 · ?play (a click starts it with audio/vo.mp3) · ?only=<sceneKey>
```

## 2.2 Colour and type

| name | value | what it's for |
|---|---|---|
| paper | `C.paper` `#F5EFE6`, printed by the shader with the corner bloom and fibre | the background. Don't paint it: leave T white |
| ink | `C.ink` `#191614` | type, outlines, icons, card edges |
| accent | `C.red` `#F2542D`, dark `C.redD` (derived) · `accentA(a)` = the accent at alpha a | the one key thing per beat: marked words, ticks, stamps, the hot bar. It follows the reel's theme, so never hard-code an accent hex |
| second ink | the theme's `ink2` (navy `#1E2A44` in studio), printed from pure `#00FF00` on T | a rare second colour: a second team, a "before" state |
| hairline | `HAIR` `#E0D6C8` | dividers inside cards (card edges stay ink) |
| grey text | `#8a8076` | labels, meta lines, done or dimmed states |
| card | `CARD` `#FFFDF9`, radius 26, 3 px `C.ink` edge, hard dot shadow `cardShadow(T, x, y, w, h, r)` (offset 12, 14, no blur) | every UI surface (`uiCard`) |
| warm greys | `#F3F1EC` `#E6E3DC` `#DAD7CF` `#CFCBC2` | chips, skeleton bars, empty boxes |
| dark surface | `#15161A` / `#111214` | terminals and code; at most one dark device per reel |
| tone values | greys `C.k10…C.k100`, `C.r100` `'#FF0000'` (accent lines), `'#00FF00'` (second ink, rare) | shadows, glows and fills that should print as lines |

**Fonts (`F`):** `F.anton` = Barlow Condensed ExtraBold (captions, stamps, big display words; the old name stays so scene code keeps
working) · `F.grot` = Figtree 500-800 (UI and card text) · `F.voice` = Oswald, the accent voice (labels, tags, chips, asides, seals,
written in CAPS) · `F.mono` = JetBrains Mono 500/700 (code, terminals). `F.serif` still exists for older scene code and now points at
Oswald (upright; `italic: true` is ignored). Inter 500-800 is loaded too. Never pull fonts from the web.

**Sizes:** captions 80 · card titles 40-52 · body 30-36 · labels 22-26 · big figures 110-160. Nothing below 20 px, key text ≥ 40.

## 2.3 Tone and ink: the rule everything rests on

Every draw function receives `(T, K, t)`:
- **T, the tone layer**, prints as engraved lines. White = bare paper, grey = ink lines (darker = heavier), pure `#FF0000` = accent
  lines, and where two inks meet they crosshatch. Use it for drop shadows, glows (`glow()`), dust (`puff()`) and large soft shapes.
- **K, the ink layer**, is crisp: type, outlines, UI fills, icons, the presenter.

**K always prints over T**, whatever order you drew them in. Two consequences:
- Inside a K card (the content callback of `panel`, `browser`, `phone`) anything on T is hidden. Draw with K only there: solid fills,
  or `dotPattern(K, col, radius)` for a printed-dot fill (the chart kit does this). Card shadows go on T before the card.
- When paper overlaps paper (a fan of receipts, badges that lean into each other), fill each face on K, or the back piece's outlines
  show through the front one. `examples/objects/receiptFan.js` and `badgeLine.js` do this.

## 2.4 Frame, safe zones, scene space

Scene content is drawn in a 1080×1920 space. The engine scales it by `SAFE_S = 0.88` around the bottom-centre, which keeps the sides
and Instagram's right-hand buttons clear, and then applies the camera. Captions and the top chrome are drawn on top, unscaled.

```
 y 132   [0N| LABEL] tab (ink, accent number)                 (K  V) readout chip, V in accent when hot · or the brand handle
 y 330   CAPTION LINE 1 (Barlow Condensed 80, centred, wrap 840)  ← up to 3 lines, ending near screen y 560
 y 520+  HERO ZONE: x 90 … 990, y 520 … 1300 (scene space)
 y 1330+ the presenter's head and shoulders, bottom-right (PRESENTER_DOCK = {x 842, y 1990, s 0.8})
```

- Keep the hero above scene y ≈ 1300 and left of x ≈ 1000. Below y 1300 on the left there's room for small secondary pieces, but
  never a card that stays there the whole reel.
- The focus element is big (360-800 px wide) and shares the stage with the 2-5 that came before it (§1.2).
- **Fill the frame.** The hero zone is about 780 px tall and the hero's mass should cover **at least 55-70 %** of it. A 300 px
  stopwatch or a three-row card floating in empty paper looks machine-made. Go bigger (a stopwatch 560-640 across, a phone 520×1060,
  checklist rows 70-90 px tall with 40+ px text, icons 160-240 px), or pair the hero with its result (a card plus a stamp, a card plus
  the big number under it). Between beats the frame is never empty: the next hero lands on the same frame the old one leaves, or the
  old one turns into the new one.
- **Captions in scene space.** Captions live in screen space while your scene is scaled around the bottom-centre, so the same y means
  different things in each. `captionBottom(t)` = the caption block's bottom in screen y; **`captionBottomScene(t)`** = the same line in
  scene y, the one to compare your layout with. With the camera at identity: `sceneY = H - (H - screenY) / SAFE_S` and
  `sceneX = W / 2 + (screenX - W / 2) / SAFE_S`; back again: `screenY = H - (H - sceneY) * SAFE_S`. Helpers: `screenToSceneY(y, cam)`,
  `sceneToScreenY(y, cam)`. Typical: two caption lines end at screen ≈ 446 = scene ≈ 245; three at screen ≈ 560 = scene ≈ 375, so
  the hero zone (scene y ≥ 520) is always clear. `captionBottomScene(t, true)` also undoes this frame's camera zoom and lean for an
  exact fit; don't call it with `true` inside your own `cam()`, because it calls the camera.
- `"presenter": false` in reel.json removes the bust, and scenes may use the full height (hero zone y 520 … 1500).
- `stickerDraw(K, k => …, r)` gives any prop the presenter's die-cut edge (a paper ring with a thin ink line). Use it on one or two
  hero props per reel (a mascot, a product box), not on cards.

## 2.5 Captions

They come from the voice automatically. Each word shows 0.15 s before it's spoken (0.07 s fade, an 18 px drop). When the next phrase
starts, the old one lifts 40 px and fades out over 0.2 s; phrases never run across a scene cut. Barlow Condensed ExtraBold, caps,
80 px, ink, centred on x 540, wrapping at 840. An emphasised word turns accent, and a thick ink marker line swipes in under it
(left to right, 0.16 s) with a small spring pop.

**Settings** (reel.json `captions`): `size, maxW, x, y, lead, maxWords, color, emphasis, emphasize`; `{ "align": "left" }` = a
flush-left block at `x` (130); `{ "upper": false }` keeps the script's own case; `"captions": false` turns them off. Per scene:
`noHeadline: t => bool` hides them, and `hl: t => ({ x, y, color, em, emText, alpha })` moves or recolours them frame by frame
(`em` = the marker colour, `emText` = the type colour on it).

**How phrases are cut** with `PHRASES = null` (the default): on punctuation, on pauses over 0.35 s, at scene cuts, and at 6 words at
most. Emphasis goes to the words in `captions.emphasize`, to the CTA keyword (in caps, or within 3 words after the reel language's
word for "comment"), and otherwise to the strongest word (numbers first, then the longest content word that isn't a stop word).
**Pick emphasis yourself for anything that matters:** list it in `captions.emphasize` (`["camera", "40%", "free"]`), or write the
phrases out in timeline.js:
```js
PHRASES = [[0, 4, [3, 4]], [5, 9, [9]], [10, 16, [12]]];   // [firstWordIdx, lastWordIdx, [emphasised idxs], {size, maxW, swap: {idx: 'text'}}]
```
Good emphasis: the one or two words that carry the phrase (the noun, number or verb a headline would bold), never function words,
never more than two per phrase, and the keyword on the CTA. Best of all is the same word as the object on screen.

**Other languages** (reel.json `"language": "ru"`, an ISO code): stop words and "comment" words exist for
`en ru uk es pt de fr it tr ar hi` (`LEX` in runtime/words.js; e.g. ru комментар*/напиши, es comenta, de kommentier*, fr commente,
tr yorum, ar علّق/اكتب, hi कमेंट). Any other language gets no stop words, and emphasis falls back to the longest word. Either way,
**check the emphasis yourself** on a non-English reel (read `build/word_index.txt`, then set `captions.emphasize` or `PHRASES`): the
guess only measures length, so a long filler word can beat the noun that matters. The mouth moves for any language: Cyrillic and Greek
go through transliteration, and other scripts get a mouth that opens at syllable rate.

**Interface words** (comment sheet, DM, browser tab, starter labels) all come from `uiText(key)`: English by default, built-in
translations for `ru uk es pt de fr it tr ar hi` chosen by reel.json `"language"`, and any key can be overridden per reel:
```json
"language": "ru",
"ui": { "post": "Отправить", "sentLink": "лови ссылку" }
```
The keys: `comments` "Comments" · `addComment` "Add a comment…" · `post` "Post" · `you` "you" · `newMessage` "new message" ·
`sentLink` "sent you the link" · `newTab` "New tab" · starter: `workflow` "your workflow" · `today` · `plan` "the plan" · `done`
"Done." · `doneCount` "DONE" · `nope` "NOPE" (stamp fallback) · `sceneProblem` / `sceneHow` / `sceneGet` (chrome labels). Your own
keys work too (`"ui": {"cvTitle": "// резюме"}` → `uiText('cvTitle')`). In your scenes, write on-screen words in the reel's language
(or through `uiText`), never hard-coded English. `dmBubble(..., {title: true})` uses `uiText('newMessage')`. Glyphs for any non-Latin
text (voice words, UI strings, the keyword) are preloaded from the "Fallback" font family before the first frame.

**The starter's CTA**, in order: a comment sheet slides up, the keyword gets typed and posted, it grows into a big pill, notifications
and replies with the keyword arrive, a DM says "sent you the link", and the presenter gives a thumbs-up. Its comment counter is **off by default**, because invented engagement numbers are a lie. Turn it
on only with a real number: `"cta": { "keyword": "REEL", "counter": 1480 }` (an accent odometer badge rolls up to it after Post, and
the readout shows it). Its sound is sparse on purpose (two keystrokes, the Post click and pop, the DM pop, a closing shimmer); the
mixer drops cues that crowd each other.

## 2.6 The presenter

**Look** (reel.json `"presenter"`; every field optional; `false` = no presenter). Without settings it's a neutral, clean-shaven
person in a slate tee.

| field | values |
|---|---|
| `skin` | `porcelain` `fair` `light` `medium` `olive` `tan` `brown` `deep` or `#hex` |
| `hair` | short straight: `swept` (deep side part) `crop` (short and textured, high fringe) `fringe` (blunt bangs) `curtain` (middle part, clear of the jaw) `messy` (tousled spikes) · short wavy or curly: `wavy` (tousled medium waves) `curly` (short curls, afro-textured) · very short: `buzz` `bald` · to the shoulders: `long` (straight, middle part) `wavylong` (soft waves) `longcurly` (big curls, a curly mass behind) · tied back: `ponytail` `bun` |
| `hairColor` | `black` `darkbrown` `brown` `chestnut` `auburn` `red` `blonde` `platinum` `grey` `white` or `#hex` |
| `beard` / `beardColor` | `none` `stubble` `full` / a colour (defaults to the hair's) |
| `beanie`, `beanieColor`, `beanieTab` | knit beanie on or off, `#hex`, a small accent tab on or off |
| `glasses`, `glassesStyle`, `glassesColor`, `glassesW` | on or off, `round` `square`, `#hex`, frame weight (default 7; 4-5 = thin wire, 9-10 = chunky) |
| `lashes` | `true` = small lashes at the outer corner of each upper lid (off by default) |
| `top`, `topColor`, `innerColor` | `tee` `hoodie` `collar` (buttoned shirt) `overshirt` (open shirt over a tee in `innerColor`) |
| `accessories` | any of `earrings` `necklace` `headphones` `mic` |
| `face`, `slim` | `adult` / `young`, a narrower face |
| `dock` | a different home spot `{x, y, s}` |

To match a photo, pick the nearest options (hair shape and colour, glasses and beard matter most), render
`frames <project> 0 1 2 3 --only presenter` and compare; page 3 shows every hairstyle in the colours you set. More in `playbook/host.md`.

**How they act**
1. **By default the presenter is pointing.** Give `act()` a `focus` and the arm, eyes and head track the hero, re-aiming whenever it
   or the focus moves.
2. **Phrases change the face and hands.** `act()` rotates through face presets as phrases change and throws in a gesture with the free
   arm now and then. For the moments that matter, add `beats` / `faces` yourself: a big number earns shock, a question a shrug, a win
   a fist, the closing CTA a wink with a thumbs-up.
3. **Emphasis gets a little jab** without you doing anything: on a marked word the finger dips 7° and the brows jump.
4. **Pose variety and body, automatic in `act()`:** from phrase to phrase the pointing arm alternates between `point`, `present` (an
   upturned palm held out at the target) and `frame` (both hands up at the target, only when the phrase lasts 0.9 s or longer). The
   switch is a cross-fade, so the hand never falls between phrases. The torso joins in: it leans and turns to the target and takes a
   small step toward it, and the head tips back when the target is high. For a target straight above the bust the arm reaches out
   and up with the elbow pointing outward, rather than folding over the head. For the docked presenter's usual up-left targets, `present` keeps the hand out at the side at
   shoulder height, palm up, fingers toward the target (an open hand beside the head would read as a salute or a hand to the ear), and
   `frame` is used only when the free hand can reach without crossing the head; otherwise that phrase gets `present`.
   `act(t, { poses: false })` = always the plain point · `{ pose: 'present' }` = force one pose · `{ lean: false }` = no automatic
   lean or step. Page 4 of the presenter sheet shows point, present and frame aimed at up-left targets.
5. **Every scene starts and ends with the presenter at `PRESENTER_DOCK`.** In between they may move (in the hook: bigger and centred,
   gliding home in the last 0.4 s).
6. **Lip sync, blinks, the breathing bob and idle head motion are automatic** (from words.json). Don't animate the mouth yourself
   except for a scripted "O" (`mouth: 0.8`).

**The state object** (what `guy(t)` returns; `act()` builds it):
- placement: `x, y, s` (the bust's bottom-centre and scale), `rot, sx, sy, lean, bodyTurn`
- arms: `armL, armR` (pose names) with `armLp, armRp` 0..1 · `pointAng` in degrees (0 = straight out to the side, -90 = straight up,
  +90 = down; used by any arm in `point` / `present` / `frame`; `pointAngL` / `pointAngR` per arm) · `armLFrom` / `armRFrom` with
  `armLMix` / `armRMix` (cross-fade from another pose) · `wave` phase
- head and face: `headTurn` -1..1, `headTilt` (deg), `headNod` · `lookX, lookY` -1..1 · `brow` -1..1, `browTilt`, `smile` -1..1,
  `shock`, `sweat`, `wink`, `blink` 0..1 · `mouth` (a scripted O) · `look` (a per-state look override) · `hide`

**Poses:** `point` · `present` (open palm toward pointAng; for up aims, palm-up and out at the side) · `frame` (open hand raised toward
pointAng; use it on both arms) · `wave` · `thumb` · `shrug` · `facepalm` · `cover` · `hold` (palm up, presenting) · `fist` · `shh`
(index finger over the lips) · `down`. `L` is the arm on screen-left. Page 1 of the presenter sheet shows them all.

**Attaching a prop to a hand or the mouth:** `PRESENTER.anchors(state)` → `{head, top, mouth, handL, handR}` in scene space. Pass
the same state your `guy(t)` returns: a raw `act()` / `mood()` state is normalised inside (breathing bob, idle head motion, lip sync,
exactly as the engine does before drawing; `act()` stamps `t` onto its state). A state you build by hand needs the time,
`anchors(state, t)`. A state that's already normalised (`guyState(t, ...)`) is used as it is.
```js
const ACT = t => act(t, { focus: t => ST.focus(t) });          // one function, used for guy() and for the prop
SC.reply = {
  guy: ACT,
  front: (T, K, t) => {
    const hand = PRESENTER.anchors(ACT(t)).handL;
    if (hand) dmBubble(T, K, hand.x - 40, hand.y - 260, [{ txt: uiText('sentLink'), t0: T_DM }], { t, w: 520 });
  },
};
```

## 2.7 What a scene file looks like

```js
// ═════════════ 03 · THE LEAK  [CUT_LEAK → CUT_FIX] ═════════════
// Beats: what happens on which word. Write these lines first; they are your storyboard.
(() => {
  const S0 = CUT_LEAK, S1 = CUT_FIX;                        // cut times from timeline.js
  const T_DRIP = wordAt('every', S0, 1, S0 + 0.5);          // each beat is a word, with a fallback time
  kick(T_DRIP + 0.03, 0.8, 0.8); cue(T_DRIP, 'thud');       // kicks and sounds are registered at load time
  SC.leak = {
    label: '// 03 — the leak',                              // the top-left tab (default "// 0N — key")
    readout: t => ({ k: 'LOST', v: '$40', hot: t > T_DRIP }),   // optional top-right chip
    cam: t => ({ x, y, z, r }),                             // optional camera (z 1 = identity); back to identity at the cuts
    back: (T, K, t) => {},                                  // optional full-frame background, screen space, under everything
    draw: (T, K, t) => {},                                  // the scene itself, scene space
    guy: t => act(t, { focus: ... }),                       // presenter state (or an array of states, or null)
    front: (T, K, t) => {},                                 // drawn over the presenter (a DM bubble out of their hand)
    top: (T, K, t) => {},                                   // screen space, over the captions (rare)
    noHeadline: t => false, hl: t => ({}), noChrome: false,
  };
})();
```

`t` is reel time, not scene time. A scene must be a pure function of `t`: no `Date`, no `Math.random` (use `rng(seed)`, `hash(n)`,
`noise1(x)`), and nothing that depends on the previous frame, because frames render in any order.

**timeline.js** holds `SCENE_FILES = [...]`, your cut constants, `TIMELINE = () => [['hook', 0], ['leak', CUT_LEAK], ...]`, and
optionally `PHRASES`, `READOUT`, `END_AT` (otherwise the reel ends at the last word's end + reel.json `tail`, 0.8 s) and reel-wide
cues. `KEYWORD` is reel.json `cta.keyword` in caps. A scene that's registered but not in `TIMELINE` can still be previewed with `--only`.

## 2.8 Cue on words, never on seconds

| helper | gives you |
|---|---|
| `wi(i)` / `wiE(i)` | start / end of word number i (clamped). Numbers are in `build/word_index.txt` |
| `wordAt(word, fromT = 0, nth = 1, fallback)` | start of the nth word beginning with `word` at or after `fromT` (prefix match, case and punctuation ignored), else `fallback` |
| `wordEnd(...)`, `wordIndex(...)` | that word's end time / its index (-1 when missing) |
| `cueAny(['send', 'link'], fromT, fallback)` | the earliest of several candidates |
| `sentenceAfter(t)`, `sentenceAt(t)`, `lastSentence()`, `SENTENCES` | sentences `{i0, i1, s, e, text}`: safe cut points |
| `clauses(t0, t1)` | comma-level clauses `[{i0, i1, s, e, key}]` with their key word (one beat per clause) |
| `keyWordIdx(i0, i1)`, `cleanWord(i)` | the strongest word in a range · a word without its punctuation |
| `frac(f)`, `VO_END` | f × the voice length (for fallbacks) · the end of the last word |
| `phraseAt(t)`, `PHRASE_LIST`, `EMPH_TIMES` | caption phrases and emphasised word times (at draw time only, not at scene load) |
| `sceneStart(key)`, `sceneEnd(key)`, `DUR_END()` | scene bounds · the final duration |

Timing rule: a hit belongs to its word. Place the slam or tick at `wordAt(word)` or a hair later (0.02-0.05 s); if it fires before
the viewer hears the word, it feels wrong.

## 2.9 Motion, camera, wipes, sound

**Progress and springs:** `P(t, t0, dur, ease)` 0..1 · easings `E.*` (full list in §5.3) · `pop(dt, f, z)` a 0→1 spring with
overshoot (`dt = t - start`; `pop(dt, 2.6, 0.42)` is the snappy default, `2.0, 0.64` a soft card rise) · `spring(dt, f, z)` ·
`ring(dt, f, k)` a decaying wobble (add it to a scale: `1 + ring(t - T, 3, 8) * 0.1`) · `win(t, t0, t1, in, out)` an on/off window ·
`enterY(t, t0, dist)` spring up from below · `exitY(t, t0, dur, dist)` fly up and out · `pulses(t, times, dur)` · `Track` keyframes.

**Placing things:** `X([T, K], x, y, scale, rotDeg, () => { /* draw in local coords */ })` moves both layers together.

**Camera:** a slow push on the hero, `cam: t => ({ z: 1 + 0.03 * win(t, a, b, 0.8, 0.3) })` · `kick(t, amp = 1, shake = 1, dur = 0.8)`,
a short zoom bump with shake, for big beats only. Kicks stay inside their scene: if the scene ends before `dur` runs out, the engine
compresses the kick and eases it so the camera reaches identity exactly on the last frame. That means a kick fired 0.1 s from a cut
still lands, and still resolves before the cut. Any `cam()` you write needs to reach identity by the cut as well.

**Cuts and wipes:** a hard cut on the first word of the new beat (scene start = `wordAt(...) - 0.1`). `wipe(t, mode, col)` is the
shutter: diagonal blinds close over the old scene and open on the new one. `mode` sets the order the blinds run in (0 diagonal,
1 from the centre, 2 bottom-up, 3 left to right); they cover the 0.24 s before `t`, the new scene already shows between them from
`t`, and they clear in 0.3 s, so at most about one frame is fully covered. `col` is `C.ink` by default, `C.red` for an accent wipe.
One or two per reel (into the CTA, or a big reveal). **A wipe at `t` hides the last ~0.24 s of the outgoing scene** (`t - 0.24` →
`t`): nothing important may first appear there (no stamp, no number, no punchline). Finish that scene's beats by `t - 0.3` and have
the presenter docked by then (the starter's hook ends its moods at `S1 - 0.27`).

**Hand-offs:** scene N ends in the state scene N+1 starts in (presenter docked, nothing jumping). A hard cut may also reframe: an
element carried over can come back at another size or position, with the stage rebuilt around it. That's a normal edit, not a jump to
fix. Only the presenter has to match across the cut.

**Sound:** `cue(t, name, gainDb = 0)` with `whoosh swoosh pop click tick thud impact boom shimmer riser type cash stamp`. The gain is
relative: 0 is the normal level, -4 quieter, -8 barely there, and positive values get clamped to 0. Less is more: whooshes go into
cuts, and each beat gets one accent sound that matches its action (stamp for a slam, tick for a checkbox, type for typing, pop for a
win), at most about two cues a second. `tools/sound.py` also thins the cue list on its own, so only cue what carries meaning:

| group | sounds | rule |
|---|---|---|
| always kept | `whoosh stamp impact boom` | transitions and slams |
| mid | `swoosh thud cash riser` | needs 0.25 s clear after the previous cue |
| light | `pop tick click type shimmer`, unknown names | needs ~0.35 s clear, and no more than one a second |

A sound is never repeated within 0.12-0.25 s of itself. Whatever breaks these rules is dropped and counted in the export log, so ten
pops in a second come out as one. Decide which one counts.

## 2.10 Pace

| rhythm | target |
|---|---|
| clear visual change or cut | every 1-1.5 s |
| small motion (tick, count, cursor, pulse) | every 0.3-0.5 s |
| stressed-word event | every 0.4-0.8 s |
| big moves | ≥ 0.7 per second |
| longest freeze | 1.2 s |
| scene length | 2-6 s (longer sections = more beats or more scenes) |

- Watch it muted: it still has to make sense. Readable text ≥ 40 px, readable states on screen ≥ 0.4 s, marks right on their targets.
- The very first frame is in motion; the hook's object is already slamming in at t = 0.
- Kicks are for big beats; the accent is for the current point. `kit pace` passes before you render the final.
- A physical object beats an abstract UI, and every reel invents its own (§1.6): one object that carries the idea, 2-5 props, a
  physical reaction on each word.

---

# Part 3 · The toolbox

Signatures are exact; arguments in `{}` are an options object.

## 3.1 runtime/lib.js: drawing basics
- `W, H` (1080, 1920) · `D2R`, `TAU` · `C` colours (§2.2) · `F` font names
- `clamp(x, a=0, b=1)` · `lerp(a, b, t)` · `inv(a, b, x)` inverse lerp, clamped · `E.*` easings · `P(t, t0, dur, e=E.lin)` progress
- `spring(dt, f, z)` damped spring 0→1 · `ring(dt, f, k)` decaying cosine · `hash(n)` 0..1 · `noise1(x)` smooth -1..1 ·
  `rng(seed)()` seeded random · `money(n, cur)`
- `rr(ctx, x, y, w, h, r)` round-rect path · `fillRR(ctx, x, y, w, h, r, fill)` · `strokeRR(ctx, x, y, w, h, r, col, lw)`
- `card(T, K, x, y, w, h, {r, sh, shade, lw, stroke})` a card with a hard, line-shaded offset shadow
- `circle(ctx, x, y, r, fill, stroke, lw)` · `line(ctx, x1, y1, x2, y2, col, lw, cap)` · `strokeP(ctx, pathFn, len, p, col, lw)` a path
  that draws itself as p goes 0 → 1
- `font(o)` · `text(ctx, str, x, y, {font, weight, size, italic, align='center', base, ls, color, slw, stroke})` · `measure(ctx, str, o)`
- `letters(ctx, str, x, y, o, (i, n, ch) => ({dx, dy, s, sx, sy, r, a, c}))` kinetic type, letter by letter · `slot(ctx, str, x, y, o, p)`
  rolling digits
- `check(ctx, x, y, s, p, col, lw)` a drawn tick · `cross(ctx, x, y, s, p, col, lw)` a drawn X
- `burst(ctx, x, y, dt, {n, r0, r1, color, lw, dur, rot})` radiating lines · `shock(ctx, x, y, dt, {r, color, lw, dur})` a growing ring
- `stamp(K, T, str, x, y, dt, {size, rot, col, pad, font, sub})` a rubber stamp slam with worn ink (its frame fits the wider of `str`
  and the mono `sub` line under it)
- `person(ctx, x, y, s, fill)` glyph · `cursor(ctx, x, y, s, press)` mouse pointer · `envelope(ctx, x, y, w, h, lw, col, fill)` ·
  `warn(ctx, x, y, s, col)` warning triangle
- `Track(defaults).key(t, props, ease).at(t)` keyframe tracks

## 3.2 runtime/ui.js
`uiText(key)` an interface word in the reel's language (`UI` table; reel.json `language` / `ui`) · `pop(dt, f=2.6, z=0.42)` ·
`X(ctxs, x, y, s, rotDeg, fn)` · `HAIR` · `uiCard(T, K, x, y, w, h, {r, shadow, fill, border, lw})` · `uiLabel(K, str, x, y, {size,
color, align})` a "// label" · `uiPill(K, str, cx, cy, w, h, {fill, color, size, press, stroke})` · `uiField(K, x, y, w, h, value,
{label, missing, focus, size})` · `bigFigure(K, str, x, y, size, p, {color, align})` · `seal(K, str, x, y, dt, {size, col, rot})` an
Oswald seal in a double ring ("DONE.") · `iconCheck(K, x, y, s, p, col)` · `iconX(...)`

## 3.3 runtime/media.js
`IMG` · `ASSETS` · `loadImg(key, src)` · `coverImg(ctx, im, x, y, w, h, {fx, fy, zoom, r, gray, bright})` · `containImg(ctx, im, x, y,
w, h)` · `typedStr(str, t, t0, cps=26)` · `typeSeg(t, [[str, t0, t1], ...])` typing that follows the words · `caretAt(K, x, y, h, t,
col)` · `sparkle4(ctx, x, y, r, col)`. Images: `ASSETS.push(['shot', 'assets/shot.png'])` at scene load, then
`coverImg(K, IMG.shot, x, y, w, h, { r: 18, fy: 0 })`.

## 3.4 runtime/words.js and captions.js
See §2.5 and §2.8. Also `captionBottom(t)` · `CAP` (caption settings) · `commentIndex(fromT)` the first "comment" word in any language ·
`isCommentWord(w)` · `isStopWord(w)` · `reelLang()` · `LEX` (per-language stop and comment words).

## 3.5 runtime/acting.js and presenter.js
- `PRESENTER_DOCK` · `act(t, {at, focus, side, beats, faces, gestures, poses, pose, lean, jab, extra})` · `arms(t, [[t0, t1, 'L'|'R'|'LR',
  pose, extra]])` · `expr(t, [[t0, t1, {props}]])` · `win` · `enterY` · `exitY` · `inAt(t, t0, f, z)` · `pulses(t, times, dur)` ·
  `shoulderAt(g, side)` · `aimAt(g, side, tx, ty)` → pointAng · `headAt(g)`
- `PRESENTER.draw(T, K, state)` (low level; scenes return states from `guy` instead) · `PRESENTER.anchors(state, t?)` → `{head, top,
  mouth, handL, handR}` in scene space (§2.6) · `PRESENTER.look(o)` the normalised look · `PRESENTER.DEFAULT`, `SKINS`, `HAIRCOLS`,
  `HAIRSTYLES`. `GUY3D` is another name for it, used by example code.

## 3.6 runtime/engine.js
`SC` (the scene registry) · `cue(t, name, gainDb)` · `kick(t, amp, shake, dur = 0.8)` (kept inside its scene) · `wipe(t, mode, col)` ·
`sceneAt(t)` · `sceneStart(key)` · `sceneEnd(key)` · `DUR_END()` · `guy(T, K, t, state)` draws an extra presenter (a clone) ·
`guyState(t, state)` the normalised state the engine draws · `captionBottomScene(t, withCam)` · `screenToSceneY(y, cam)` /
`sceneToScreenY(y, cam)` · `REEL` (reel.json) · `THEME` · `SAFE_S`, `SAFE_X` · `DUR` (after boot)

## 3.7 parts/fx.js, devices.js, cards.js, charts.js
- **fx** `glow(T, x, y, rx, ry, a, rgb='255,0,0')` · `puff(T, x, y, dt, s, dir)` · `impact(T, K, x, y, dt, s, seed)` · `bez(P, u)` ·
  `bezPath(K, P)` · `cable(K, P, p, col, lw)` · `flow(T, K, P, t, t0, {lead, r, gap, speed, a, s})` energy running along a bezier ·
  `dotShadow(K, x, y, w, h, r, dense)` · `underline(K, x, y, w, p, col, lw)` · `highlight(ctx, x, y, w, h, p, col)` ·
  `scribbleCircle(K, cx, cy, rx, ry, p, col, lw, seed)` · `arrow(K, x0, y0, x1, y1, p, {col, lw, bend, head})` ·
  `confetti(K, x, y, dt, {n, spread, seed, dur})` · `ripple(K, x, y, dt, col)` · `speedLines(K, x, y, angRad, a, {n, len, gap})`
- **devices** `phone(T, K, cx, cy, w, content, {frame, screen, shadow, notch})` → the screen rect · `phoneHeader(K, x, y, w, title)` →
  the y below it · `browser(T, K, x, y, w, h, content, {url, tab, page, r})` · `panel(T, K, x, y, w, h, content, {label, right, dot,
  dark, r, head})` · `terminal(T, K, x, y, w, h, {t, title, lines, input, status, fs})` (line kinds `cmd ai ok warn spin dim blank`) ·
  `TERM` colours · `codeChip(K, str, x, y, {size, fill, color})` · `skeleton(K, x, y, widths, {h, gap, col})`
- **cards** `tag(K, str, x, y, {fill, color, size})` · `avatar(K, x, y, r, {img, fill})` · `toggle(K, x, y, on)` · `progress(K, x, y,
  w, p, {h, fill})` · `checklist(T, K, x, y, w, items, {t, title, row, size, strike, counter})` · `commentSheet(T, K, x, y, {t, w,
  keyword, tType, tSend, replies, cps})` · `dmBubble(T, K, x, y, lines, {t, w, title, tail})` · `toast(T, K, x, y, w, title, body,
  {icon, glyph, time})` · `statCard(T, K, x, y, w, h, label, value, p, {size, delta})`
- **charts** `dotPattern(K, col, rad)` · `barChart(T, K, x, y, w, h, bars, {t, t0, max, fmt, gap})` · `lineChart(T, K, x, y, w, h,
  values, p, {min, max, hotLast})` · `ringChart(T, K, cx, cy, r, p, {label, col, lw})` · `beforeAfter(T, K, x, y, w, h, p, drawBefore,
  drawAfter, {a, b})` · `versus(T, K, x, y, w, rows, {t, tWin, winner})`

## 3.8 parts/mechanics.js: how things move

Always loaded. Every function is a pure function of `t`, takes word times you computed with `wordAt`, puts shadows and glows on T
and ink on K, and returns anchor points in scene space you can hand to `act({ focus })`.

**Physics**

| function | what it gives you |
|---|---|
| `springTo(t, [[t0, v0], [t1, v1], ...], f = 2.2, z = 0.42)` | a value that springs from key to key with overshoot: needles, positions, counters. Lower z = more overshoot (0.28 strains, 0.6 settles calmly) |
| `springObj(t, [[t, {x, y, s, r}], ...], f, z)` | the same for objects (something moving aside on a word) |
| `pendulum(dt, amp = 14, f = 1.2, k = 2)` | a damped swing angle in degrees after a hit (anything hanging, hinged or struck) |
| `gravityFall(t, t0, vx, vy, spin, g = 5200)` | `{dx, dy, r, on}` for things that fall off the stage, shatter or get knocked away |
| `phaseAt(t, [[t, speed], ...])` / `speedAt` | integrated speed (hands, wheels, belts, lists that speed up and brake) |
| `idleSway(t, seed, amp = 1)` | `{dx, dy, r}`, an idle float for anything that has landed |
| `focusTrack(t, [[t, x, y], ...], glide = 0.25)` | a pointing target that glides from focus to focus (x and y may be functions) |
| `morphRect(a, b, p, lift)` | one rect morphing into another along an arc (carry-over transitions) |
| `wrapText(str, font, maxW)` · `spinner(K, x, y, r, t)` · `typingDots(K, x, y, t)` · `liveDot(K, x, y, r, t)` | small live bits |

They combine with the basics from lib, ui and fx: `spring(dt, f, z)`, `pop(dt, f, z)`, `ring(dt, f, k)` (wobble for shakes and
squash), `win(t, t0, t1)`, `noise1`, `rng(seed)`, `burst`, `shock`, `puff`, `impact`, `glow`, `confetti`, `speedLines`, `flow`.

**The build-up stage:** `const ST = buildStage([...elements], { sfx: true, focus: [[t0, t1, target], ...] })` gives you
`ST.draw(T, K, t)`, `ST.focus(t)`, `ST.at(id, t)`, `ST.newest(t)` and `ST.focusOn(target, t0, t1)`.
- An element is `{ id, t, x, y, s, r, draw(T, K, t, e), enter, from, idle, nudge, moves, exit, exitMode, focus, z, sfx, gain, kick, carry }`.
- `enter`: `pop` (spring scale) · `drop` (falls, squashes, dust) · `slide` (`from`: 1 right / -1 left) · `rise` · `swing` · `stamp` · `none`.
  An element is hidden until its entrance starts at `t`; only `drop` shows about 0.2 s early, because it's falling in.
- `draw` gets local coordinates centred on (0, 0) and `e = {age, p, newest, i, x, y, s}`; `e.newest` tells you to accent the focus.
- After landing, elements float (`idle: 0` stops it), jolt when a newer one lands (`nudge`), spring to new spots with
  `moves: [[t, {x, y, s}]]`, and leave with `exit: t, exitMode: 'fall' | 'up' | 'shrink' | 'left' | 'right'`. Entrance sounds are cued
  for you.
- **Carrying an element across a cut:** `carry: true` puts it on stage from the scene's first frame, with no entrance and no sound,
  already idling (`t` is optional; it counts as the oldest element for focus). Use it for the object that continues from the previous
  scene, drawn where that scene left it, and build the new elements around it.
- **Looking somewhere else:** the presenter's point and `stageCam` follow the newest element. To look back at an older one, at a point
  or at nothing, pass `focus: [[t0, t1, target], ...]` or chain `ST.focusOn(target, t0, t1)`; `target` is an element id, `[x, y]`,
  `t => [x, y]` or `null`. It glides in and out over 0.25 s and the camera leans with it. Don't add invisible `draw: null` elements to
  move the focus.
- `stageCam(t, ST, { k = 0.1, z = 0.035, push = 0.006, release, t0 })` is a camera that leans toward each new element or focus override
  and returns to identity from `release`. `t0` is when its 0.6 s zoom-in and slow push start; by default that's the start of the
  scene being drawn, so a late scene starts at z ≈ 1 like an early one. Pass `t0` only to start the push later, e.g. on the first
  build-up word.

**The presenter as hero, and acting presets**

| function | what it does |
|---|---|
| `recFrame(T, K, t, { t0, t1, cx, cy, hw, hh, from = 1.8, tag, tagT, glow, hunt: [t0, t1] })` | viewfinder brackets spring closed on the target, a blinking REC pill with a timer, a tag pill, a red hot-seat glow, a hunting reticle. Call it in `front` |
| `heroAt(t, t0, t1, { x = 540, y = 1990, s = 1.1 })` · `faceBox(g)` | the presenter steps to the centre, big, and back · their face box, for `recFrame` |
| `mood(t, MOODS, actOptions)` → act options | `MOODS = [[name, t0, t1, extra], ...]` with `panic` `shock` `thinking` `celebrate` `lean` `shrug` `facepalm` `wave` `thumbs` `shh` (finger to the lips, mouth shut: for a "secret" or "quietly" line) `no` `nod` `hero`. `extra.side` picks the arm for one-handed moods |
| `moodFx(T, K, t, MOODS, actOptions)` | the effects: a red glow (panic), burst lines (shock), a thought bubble (thinking; `['thinking', t0, t1, { bubble: [x, y] }]` or `bubble: t => [x, y]` puts its centre at a scene point, e.g. right of the head when the left is busy; `actOptions.bubble` works too), confetti (celebrate). Page 5 of the presenter sheet shows the moods |

**Generic live UI** (x, y = top-left; interface pieces, not metaphors)

| function | what it does |
|---|---|
| `promptBox(T, K, x, y, w, h, t, { title, label, text, tType, cps, tSend, reply, blur, size })` | the prompt types in with a caret, send turns accent, a press and a shock ring, the prompt rides up into a sent bubble, the reply streams in |
| `videoPlayer(T, K, x, y, w, h, t, { t0, dur, start, seek: [[t, sec]], markers: [{sec, label}], paused: [[t0, t1]], content(K, x, y, w, h, sec) })` | the playhead runs in real time, seeks jump with an expo ease, markers; the default content is a live waveform |
| `liveStat(T, K, x, y, w, h, t, { label, keys: [[t, value]], prefix, suffix, size, roll, hot, delta: [t, '+12%'], spark })` | a LIVE pill, an odometer rolling between keys (with a motion smear when fast), a live sparkline with a pulsing end dot |
| `odometer(K, value, x, y, { size, prefix, suffix, digits, align, vel })` | mechanical counter digits (a carry rolls the next column) |
| `toastStack(T, K, x, y, w, t, [{t, title, body, glyph, time}], { max, h, from })` | notifications push in; older ones slide down, shrink and fade |
| `paletteFlood(T, K, t, t0, t1, { col, x, y })` (in `back`) + `paletteOn(t, t0, t1)` | a whole section in another colour, revealed in a circle; set the `hl` caption colour from `paletteOn` |

**Example props** (`examples/objects/`; study them, don't paste them): `badgeLine.js` (rope sag, pendulum badges with an echo,
neighbours knocked on each landing) · `flapBoard.js` (split flaps folding through random letters) · `railRoute.js` (track laid on
cues, wheels turned by the distance, steam) · `scoreGauge.js` (needle spring and tremor, a counter that follows it) · `launchBox.js`
(drop and squash, a lid that springs off, a card rising out) · `tubeMail.js` (capsules along a curve with echoes, a note unrolling) ·
`receiptFan.js` (a fan on one pivot, gathered and flipped into a total) · `keyRing.js` (a pendulum ring, keys knocking, falling off).
Each header says what story the prop tells and how it moves. `examples/props-reel` plays all eight; nothing in `examples/` is loaded
by a reel.

---

# Part 4 · Snippets (each one runs as written)

```js
// 1 · STAMP on a word: card + stamp + impact + kick + sound
const T_LATE = wordAt('overdue', S0, 1, S0 + 0.8);
kick(T_LATE + 0.1, 1, 1); cue(T_LATE + 0.1, 'stamp');
// in draw(T, K, t):
uiCard(T, K, 140, 560, 720, 300); uiLabel(K, 'rent', 180, 620);
stamp(K, T, 'OVERDUE', 640, 760, t - T_LATE, { size: 110, rot: -10 });   // driven by dt: a 0.14 s slam, then a ring
impact(T, K, 640, 760, t - T_LATE - 0.1, 1, 7);                           // accent bloom, shock ring, bursts, sparks

// 2 · ROLLING NUMBER (slot-machine digits), p 0..1
bigFigure(K, '$1,920', 500, 790, 150, P(t, T_NUM, 0.9));                  // or slot(ctx, str, x, y, fontOpts, p)
// a plain count-up: text(K, Math.round(1920 * E.outCubic(P(t, T_NUM, 1))).toLocaleString('en-US'), x, y, {font: F.grot, weight: 700, size: 140})

// 3 · CHECKLIST that ticks on its words (rows deal in, each tick pops, draws and flashes)
const ROWS = clauses(S0, S1).slice(0, 5).map(c => ({ txt: cleanWord(c.key), t0: wi(c.key) }));
for (const row of ROWS) cue(row.t0, 'tick', -2);
// in draw: each row reveals with a (0..1)
checklist(T, K, 100, 560, 800, ROWS.map((row, i) => ({ ...row, a: clamp(pop(t - S0 - 0.15 - i * 0.09, 3, 0.55), 0, 1) })), { t, title: 'this week', size: 40 });

// 4 · PHONE with its own screen (springs up from below; the content is clipped to the screen)
const py = 560 + enterY(t, S0, 900);
phone(T, K, 330, py + 380, 380, (K, x, y0, w, h) => {
  const top = phoneHeader(K, x, y0, w, 'Inbox');
  [['Reply to Sam', T1], ['Send invoice', T2]].forEach(([label, at], i) => {
    const ry = top + 50 + i * 80, done = t >= at;
    if (done) fillRR(K, x + 24, ry - 22, 44, 44, 12, C.red); else strokeRR(K, x + 24, ry - 22, 44, 44, 12, '#CFCBC2', 3);
    check(K, x + 46, ry, 26, clamp((t - at) / 0.2), '#FFFFFF', 6);
    text(K, label, x + 88, ry + 11, { font: F.grot, weight: 500, size: 30, color: done ? '#8a8780' : C.ink, align: 'left' });
  });
});

// 5 · BROWSER window (light chrome; the content callback gets the page rect)
browser(T, K, 90, 540, 900, 700, (K, x, y, w, h) => {
  text(K, 'Signups this week', x + 40, y + 70, { font: F.grot, weight: 700, size: 44, color: C.ink, align: 'left', ls: -1 });
}, { url: 'dashboard.example.com', tab: 'Dashboard' });

// 6 · BEFORE / AFTER (the divider wipes across on a word)
beforeAfter(T, K, 90, 520, 900, 420, E.inOutCubic(P(t, T_AFTER, 0.8)),
  (K, x, y, w, h) => skeleton(K, x + 50, y + 120, [600, 420, 520, 300], { gap: 60, h: 22 }),            // before
  (K, x, y, w, h) => text(K, 'Sorted.', x + 50, y + 240, { font: F.voice, size: 140, color: C.red, align: 'left' }));   // after

// 7 · BAR CHART (bars spring up one after another, values roll, one bar is hot)
barChart(T, K, 150, 650, 780, 560, [{ v: 7, label: 'JAN' }, { v: 11, label: 'FEB' }, { v: 6, label: 'MAR' }, { v: 34, label: 'APR', hot: true }],
  { t, t0: wordAt('sales', S0, 1, S0 + 0.3), fmt: v => Math.round(v) + 'k' });

// 8 · TERMINAL: a command types, then a spinner resolves
terminal(T, K, 90, 1000, 640, 300, { t, fs: 22, lines: [
  { t0: T_CMD, kind: 'cmd', txt: 'clean up the imports' },
  { t0: T_CMD + 0.6, kind: 'spin', txt: 'Working', dur: 0.6, done: 'Done in 0.9 s' }] });

// 9 · PRESENTER: point at whatever is the hero (in segments), plus a win
guy: t => act(t, {
  focus: [[S0 + 0.2, T_B - 0.05, 300, 640], [T_B, S1 - 0.1, 540, t => cardY(t) + 200]],   // [t0, t1, x, y]; x and y may be functions
  beats: [[T_WIN - 0.05, T_WIN + 0.7, 'R', 'fist']],
  faces: [[T_WIN, T_WIN + 0.8, { smile: 0.95, brow: 0.6 }]],
}),

// 10 · PEN MARKS: a loop round a word, an underline, an arrow
scribbleCircle(K, cx, cy, 175, 46, P(t, T_LOOP, 0.35));
underline(K, x, y + 14, wordWidth, P(t, T_U, 0.25));
arrow(K, x0, y0, x1, y1, P(t, T_A, 0.4), { bend: 80 });

// 11 · BUILD-UP STAGE: your own props on their words; the presenter points at the newest; the camera leans to it
const ST = buildStage([
  { id: 'jar',   carry: true, x: 300, y: 720, draw: (T, K, t, e) => myJar(T, K, t) },                 // continues from the last scene
  { id: 'coin',  t: wordAt('saved', S0), x: 820, y: 660, enter: 'pop', draw: (T, K, t, e) => myCoin(T, K, t, e) },
  { id: 'crack', t: wordAt('broke', S0), x: 800, y: 1040, s: 0.8, enter: 'slide', from: 1, draw: (T, K, t, e) => myCrack(T, K, t, e) },
  { id: 'stamp', t: T_B, x: 430, y: 840, enter: 'none', idle: 0, sfx: null, draw: (T, K, t) => stamp(K, T, 'TOO LATE', 0, 0, t - T_B, { size: 100, rot: -9 }) },
]).focusOn('jar', T_BACK, T_BACK + 0.8);                                                             // a beat looking back at the jar
kick(T_B + 0.02, 1, 1); cue(T_B, 'stamp');
const MOODS = [['panic', T_M, T_B - 0.05], ['shock', T_B, T_B + 0.5]];
SC.broke = { cam: t => stageCam(t, ST, { release: S1 - 0.3 }), draw: (T, K, t) => { moodFx(T, K, t, MOODS); ST.draw(T, K, t); },
  guy: t => act(t, mood(t, MOODS, { focus: t => ST.focus(t) })) };

// 12 · THE SHAPE OF EVERY PROP YOU WRITE: an entrance, reactions to words, an idle life
function myCoin(T, K, t, e) {
  const hit = ring(t - T_HIT, 5, 9) * 10;                                   // shakes on its word
  const fill = springTo(t, [[0, 0.1], [T_UP, 0.6], [T_MAX, 0.97]], 2.0, 0.3);   // a level that overshoots
  const swing = pendulum(t - e.el.t, 12, 1.3, 2) + Math.sin(t * 2.1) * 1.2;      // swings in, then sways
  X([T, K], hit, 0, 1, swing, () => { /* draw it with uiCard / fillRR / line / text, using fill */ });
}

// 13 · THE PRESENTER AS HERO on a personal line (REC frame + panic), then back to the dock
const MOODS = [['hero', S0, T_BACK, { s: 1.12 }], ['panic', T_SCARED, T_BACK]];
draw: (T, K, t) => moodFx(T, K, t, MOODS),
front: (T, K, t) => { const f = faceBox(mood(t, MOODS).at); recFrame(T, K, t, { t0: T_SCARED, t1: T_BACK - 0.2, ...f, tag: 'camera: off', tagT: T_FACE }); },
guy: t => act(t, mood(t, MOODS, { focus: null })),
```

More kits worth knowing: `toast()` notifications, `commentSheet()` (the CTA), `dmBubble()`, `statCard()`, `ringChart()`,
`lineChart()`, `versus()`, `toggle()`, `progress()`, `tag()`, `avatar()`, `panel()`, `codeChip()`, `flow()` (energy along a bezier),
`cable()`, `confetti()`, `ripple()`, `speedLines()`, `dotShadow()`, `cursor()` (lib).

---

# Part 5 · Checking, traps, answers

## 5.1 Checking your work
1. **Each scene as you finish it:** `frames <project> <t...> --only <key>`. Good times: just after it opens (+0.1), mid-beat for every
   beat, every big word, and just before it closes (-0.1).
2. **The full reel:** `frames <project>` with 0.3, then 0.1 and 0.4 after each cut, the slam words, the CTA keyword and a time in the
   final half-second. Open `stills/sheet.jpg` (and single stills when you need detail) and hold it up against the starter's stills
   and the example strips.
3. The presenter: `frames <project> 0 1 2 3 --only presenter` whenever the look changes (page 4 = pointing poses at up-left targets
   with the `anchors()` rings on the hands, page 5 = moods).
4. A draft: `render <project>`, then pull frames around the transitions (`ffmpeg -ss 4.2 -i build/draft.mp4 -frames:v 1 x.jpg`) and
   look for pops and jumps.
5. `pace <project>` must PASS (motion ≥ 4.8, big/s ≥ 0.65, flat ≤ 27 %). Each flat stretch it lists gets a build-up event, idle
   motion or a camera move on its words; re-render the draft and check again.
6. `effort <project>`: is there enough of your own work? Targets: **lines/s ≥ 40, helpers/s ≥ 2.5, no stock prop carrying the reel**
   (a prop from `examples/objects` used more than once counts as generic). Untouched starter files are ignored, so a reel that only
   kept the starter's scenes fails: replace the "THIS REEL'S METAPHOR" blocks with props invented for the script (`playbook/ideas.md`).
7. Then `render --final` and `export`. The full checklist is `playbook/self-review.md`.

## 5.2 Traps
- A fill on T inside a K card: invisible. Use K (or `dotPattern`) inside cards.
- Paper over paper, faces on T: the back piece's outlines print through. Fill overlapping faces on K (§2.3).
- Painting the background: leave T white; the paper colour comes from the shader.
- Hard-coded seconds (`if (t > 4.2)`): it breaks the moment the voice changes. Use `wordAt` / `wi` / `sentenceAfter`.
- Reading `PHRASE_LIST`, `EMPH_TIMES` or `DUR` at scene load, where they're still empty: use them inside `draw` / `guy`, or use `DUR_END()`.
- The same top-level `const` in two scenes: "Identifier has already been declared". Wrap each scene in an IIFE.
- The presenter not docked at a cut: a visible jump. Start and end every scene at `PRESENTER_DOCK`.
- The presenter pointing at nothing: a target in screen space instead of scene space, or a stale target after the hero moved.
- Competing heroes; accent spread over three things; readable text below 40 px; a hero lower than y 1300, where the presenter and
  Instagram's buttons cover it.
- Effects before the word is heard · kicks on every small event · a sound on every frame.
- `Math.random()` / `Date.now()`: frames differ between renders. Use `rng(seed)`.
- A long scene where nothing changes for more than 1.5 s: add a beat on the next stressed word.
- A card parked in the bottom-left for the whole reel.
- Small heroes in a big empty frame (§2.4 "Fill the frame"). Check every sheet for empty paper.
- One object per beat that pops in and freezes: build a stage (§1.2) where elements pile up and keep an idle life.
- Putting the focus directly over the presenter (x 650-1000 with y below 1000) leaves the arm nowhere to go but straight up. Move the
  focus further left (x under ~640) or higher (y under 900), or raise the presenter with `mood('lean')`.

## 5.3 Answers to questions agents have asked
- **Easings that exist** (`E.*`): `lin, outQuad, inCubic, outCubic, inOutCubic, inQuart, outQuart, outQuint, outExpo, inExpo,
  inOutExpo, inOutQuint, outBack, outBackX, inBack`, plus `inQuad, inOutQuad, inOutBack, inSine, outSine, inOutSine`.
- **The "point" pose** raises the forearm with the index finger along `pointAng` (deg: 0 = out to the side, -90 = straight up,
  90 = down). The presenter sits bottom-right and heroes sit above, so a correct point usually aims up-left (-120..-150). Use
  `act(t, {focus})` and it aims for you; give it the hero's centre in scene space.
- **Shared helper files** (drawing functions several scenes use) go in `SCENE_FILES` before the scenes that use them.
- **`PHRASES` and `swap`** only change the caption text on screen, never the voice.
- **A slam just before a cut** is fine: its `kick` is cut short so the camera is at identity on the cut. If the cut is a shutter
  wipe, though, the slam must land before `cut - 0.3` or the blinds hide it.
- **Word search matches prefixes:** `wordAt('you')` can find "you'll". Pass a start time (`wordAt('you', S0)`) or use `wi(index)` from
  `build/word_index.txt` for an exact word.
- **Errors while drawing:** the engine catches them per scene so the frame still renders, but `kit frames` / `kit render` list them
  at the end ("⚠ ... error while drawing frames") and write `build/render_errors.txt`. Treat every entry as a bug.
- **Motion blur:** `render --final` has none; `--blur 2` adds it (smoother whips, but text doubles during kicks).
