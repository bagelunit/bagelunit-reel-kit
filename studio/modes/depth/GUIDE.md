# depth · lit rooms

Read this whole page before writing a single shot.

## What it is

A depth reel is a run of small, warmly lit 3D sets: a shop at night, a desk by a window, a machine room, a street with
a neon sign. Each cut is a new set. The camera glides slowly through every shot and springs in on the cut. Bix, the
kit's boxy host (mustard, denim overalls, red cap), acts on the words: he points, waves, types, hops and pulls levers. The film finish does the rest:
depth of field, a soft bloom on lamps, screens and neon, grain, a vignette, a hint of lens fringe, and a one-frame jolt
on every cut.

On top of the 3D sits a flat layer:
- a **taped title** per shot (top);
- **caption tiles** with the spoken words (big serif tiles on a soft dark band at the bottom, key words inverted);
- optional: a **counter badge**, a **typing command chip** and the **comment box** for the ask.

**Use it for:** anything with a process or a place in it: how a tool works, what happens overnight, where leads come
from, what a dashboard shows, why something sells out. If the script is pure opinion with nothing to show, use print.

## The look (house rules)

- **Every shot is a lit room.** Start each shot from a set builder in `k.rooms` (below), never from an empty scene. The
  sets already carry the floor, walls, practical lights, window, props and a light preset.
- **Change the wall from shot to shot.** The kit's own warm plasters are `clay`, `sage`, `butter`, `oat`, `denim` and `moss`
  (mid tones that stay readable under the lamps); the deep `indigo`, `teal`, `slate`, `plum`, `night`, `wine`, `ocean`,
  `midnight`, `olive` are there for a night mood. Every room also has two warm wall sconces, so no frame goes muddy.
- **Bix is the host.** Put him in most shots, acting on a word. Small recoloured Bixes (`k.crowd`) are customers, a team,
  an audience.
- **One idea per shot,** shown by objects doing something on the word: a pin drops, a card lands, a screen fills, a
  machine starts, a sign lights.
- **Text on objects** is painted on canvas (signs, cards, screens), short, and big enough to read on a phone. The tiles
  already carry the spoken words; don't repeat a whole line on a prop.
- **No real brands or logos** on signs, screens or cards. Invent names (BAKERY, CAFE 12, BAKE BOT).
- **Keep signs out of the top 330 px** (the taped title lives there) and screens bright: dashboards are light boards with
  dark ink, big numbers and full-colour bars, never dark on dark.
- **Keep it readable at phone size:** the portrait frame is narrow (about 2 m wide at 6 m away). Frame one subject and
  let the rest of the room sit soft in the background.

## Files a reel owns

```
reel.json      style "depth", theme, cta { keyword, sub }, tiles { keys, perTile, chars, off }, tape, tail, bloom, grain, lift, exposure
script.txt     the voiceover
cuts.js        which shot plays when (by spoken word) and its taped title
shots/<id>.js  one file per shot
```

You never edit `index.html` or anything in the kit's `modes/depth/`.

## cuts.js

```js
export default ({ lines, at, when, nthWord, end, words, reel }) => [
  { id: '01-shop', from: 0, title: 'SOLD OUT BY 9 AM' },
  { id: '02-desk', from: 'Every order', title: 'ORDERS COME IN OVERNIGHT' },   // a phrase is looked up after the previous cut
  { id: '03-machine', from: 'A little', title: 'IT WRITES THE BAKE LIST' },
  { id: '04-ask', from: { s: lines.at(-1).t0 }, title: 'COMMENT “BAKE”' },     // exact seconds, taken from the words
];
```

- **`from`:** a word, a phrase, a whole-number word index, or `{ s: seconds }`. Use a phrase when the word appears earlier
  in the script too ("Every order", not "Every").
- **`title`:** the taped title for that shot: 2–5 words, the point of the shot, not the spoken line. `reel.json` "tape":
  false turns all titles off.
- **`turn`:** `'cut'` (default: a hard cut with a one-frame jolt), `'soft'` (no jolt, for two shots in the same set),
  `'whip'` (a fast pan through the cut with speed lines and an automatic whoosh) or `'swoop'` (a fast tilt with a swoosh).
  `dir: -1` flips a whip or swoop; `sound: false` keeps it silent. Use one or two per reel, on a change of place.
- You can also return `{ cuts, length, keys }`. `keys` are extra words shown as inverted tiles.

A new shot every 2–4 s.

## A shot file

```js
export default {
  build(k, shot) {                        // once: build the set, place Bix, read the word times, queue sounds
    shot.set = k.rooms.shop(shot.root, { wall: 'clay', neonWord: 'BAKERY' });
    shot.set.wordAt = shot.at('bakery', 0.3);
    shot.s = { bix: k.buddy({ ...k.LOOK }, shot.root), tSells: shot.at('sells', 0.5) };
    shot.s.bix.root.position.copy(shot.set.host);
    shot.badge = ['LOAVES SOLD', (t) => Math.round(120 * k.ease.out((t - shot.s.tSells) / 1.4))];
    k.sound(shot.s.tSells, 'pop', -6);
  },
  frame(k, t, shot) {                     // every frame: a pure function of t
    shot.set.frame(t);                    // the set's own life: clock, neon, steam, belts
    const b = shot.s.bix;
    b.idle(t); b.talk(t, shot.words); b.wave(t, shot.s.tSells);
  },
  view: () => 'wide',                     // a named view of the set, or your own move (below)
};
```

What `shot` gives you:
- `shot.root`: the group to build into. Each shot lives in its own corner of the world; only the live one is drawn.
- `shot.t0`, `shot.t1`, `shot.len`, `shot.words` (the words said in it), `shot.line`.
- `shot.at('word', fallback 0..1, nth)`: when that word is said in this shot, else a time inside the shot. `shot.w(i)` is
  the i-th word of the shot (negative counts from the end). `shot.u(t)` is 0..1 across the shot.
- `shot.toWorld(x, y, z)`: a set point in world space.
- What you set on `shot`: `shot.set` (the room), `shot.title`, `shot.badge`, `shot.chip`, `shot.cta`, `shot.tiles = false`.

What `k` gives you:
- `k.rooms.*`: the set builders. `k.buddy(options, parent)`, `k.crowd(n, parent, scale)`.
- `k.kit`: the toolbox: `box`, `tube`, `ball`, `sheet`, `put`, `group`, `contact`, `paint(color)`, `lit(r, g, b)` (self-lit,
  above 1 blooms), `mat.*` (wood, woodDark, brass, steel, ink, paper, glass …), `label(text)`, `neon(text)`, `card({...})`,
  `screen(w, h)`, `canvasTex(w, h, draw)`, `icons.*`, `tex.*` (planks, brick, cork, nightSky …).
- Motion: `k.ease.{in,out,both,soft,back}`, `k.settle(u, f, z)` (a landing with overshoot), `k.jolt(u)` (a punch that rings
  out), `k.grow(u)` (scale-in, never 0), `k.hopAt(u, h)`, `k.spring`, `k.bump`, `k.lerp`, `k.clamp`, `k.wander(t, ch)`,
  `k.noise01(n)`, `k.TAU`.
- `k.sound(t, name, db)`, `k.punch(t, amount)` (the camera leans in), `k.shake(t, amount)`.
- `k.at('word', nth)`, `k.words`, `k.lines`, `k.length`, `k.reel`, `k.swatch` (the theme: accent colours the tiles and badge).

## The camera

`view(k, t, shot)` returns one of:
- a **view name** from the set (`shot.set.views`): `'wide'`, `'screen'`, `'line'` …;
- your own **move** `{ from: [x, y, z], to: [x, y, z], look0, look1, fov, ap, focus, kick }` in set coordinates (metres, floor
  at y 0, the lens looks toward −z). The camera eases from `from` to `to` across the whole shot and never stops dead.
  `ap` is the depth-of-field aperture (0.0015–0.0035), `focus` the point held sharp, `kick` where it springs in from at
  the cut (default `[0, 0.3, 0.6]`);
- a **fixed pose** `{ pos, look, fov, ap }`;
- a **spline**: `{ path: [[x, y, z], …], look: [x, y, z] | lookPath: [[…], …], roll: 4 | [-4, 3], fov, ap }`. The lens
  runs along the path across the shot (eased); `roll` tilts the horizon in degrees. `look` can be computed from a moving
  thing (frame() runs before view(), so `shot.set.jet.g.position` is already where it is at t).

Don't switch views inside a shot: that's a jump without a cut. Make two cuts instead.

## The sets (`k.rooms`)

Each takes `(shot.root, options)` and returns the set: `.views`, `.light(rig, at)` (applied for you), `.focus`,
`.frame(t)` (call it in your frame) and handles.

| Builder | What it is | Options | Handles you animate |
|---|---|---|---|
| `shop` | a shop interior at night: lit doorway, OPEN/CLOSED sign that flips, window with stars, a neon word on the wall beside the door, clock, hanging lamp, desk with mug + plant | `wall`, `neonWord`, `openSign` | `host` (Bix's spot), `door`, `signAt`, `wordAt`, views `wide` `host` `desk` |
| `board` | a corkboard with 1–3 pinned cards that fly in on cue and a red string | `wall`, `cards: [{ title, lines, icon }]`, `x`, `y` | `cards[i].at`, `yarnAt`, view `board` |
| `desk` | a desk by a big window with a laptop you paint live, a mug, a plant, an optional neon | `wall`, `sky: 'night'\|'day'\|'cycle'`, `neonWord`, `laptopFaces: 'lens'\|'host'` | `screen.draw(fn)`, `dawn = [t0, t1]`, `cycleFrom`, `signAt`, `host`, `peek` (a small Bix beside the laptop), view `screen` |
| `monitor` | a tall screen on a desk, painted live; `screen` fills the frame, `wide` shows the desk | `wall`, `sw`, `sh`, `glow` | `screen.draw(fn)`, `peek` (Bix at the screen's corner), views `screen` `wide` |
| `machine` | a sage press on a production line: copper hood with vent pipes, gauge, pull lever, indicator bulbs, a ticket slot, belts in and out, labelled trays | `wall`, `name`, `body`, `hood`, `inLabel/inSub`, `outLabel/outSub` | `line` (add your items to it), `beltX`, `startAt`, `toSet(x, y, z)`, view `line` |
| `mapTable` | a little town on a table with named blocks | `wall`, `names` (12), `streets` | `pin(name, t0, { pickAt } \| { greyAt })`, `blocks`, view `table`; call `frame(t, k.camera)` |
| `street` | a shopfront at dusk: clapboard facade, lit window with goods and gold lettering, scalloped canopy, round blade sign, string lights, chalkboard A-frame, stoop | `sign` (or `neonWord`), `facade`, `trim`, `canopy`, `board` | `host`, `queueFrom`, `stoop`, `wordAt`, view `front` |
| `calendar` | a week planner on the wall | `wall`, `title`, `days`, `hours` | `add(day, row, time, text, colour, t0, stamp)`, view `wall` |
| `bench` | a maker's workbench under a hanging lamp, a pegboard of tools, a stool: close-up object stories (open it, light it, stack it) | `wall`, `board`, `top` | `centre` (build on the top), `TOP`, `peek` + `peekYaw` (a small Bix on the bench, in frame in every view), `host` (beside it, wide only), `lampAt`; views `top` `close` `wide` |
| `tanks` | three glass tanks joined by pipes with flowing tokens | `wall`, `names`, `colours` | `flowAt`, view `wall` |
| `studio` | a warm product table: walnut top, felt mat, brass gooseneck lamp with a light pool, pencil cup, plant; for close-ups with `k.gear` | `wall`, `mat`, `top` | `centre` (put the product here), `TOP`, `peek` + `peekYaw` (a small Bix on the table); views `hero` `top` `macro` `wide` |
| `city` | a model city at dusk: road grid with lane marks and crossings, plaster blocks with lit windows, a park, a clock-tower landmark, an airport with runway and control tower, cars driving the lanes, a jet | `mood` (`dusk` `day` `night`), `blocks` (12 names), `trafficLanes`, `landmark`, `airport` | `spot(name)` (`airport` `runway` `tower` `park` `landmark` `centre` or a block), `route(points, t0, len)` (a route that draws itself, with pins), `cars.carAt(t, lane, i)`, `jet` + `takeoffAt` / `takeoffLen`; views `high` `street` `runway` `tower` `aerial` (a spline) |

Also `k.rooms.room(parent, { wall })` (the bare shell), `plant`, `mug`, `table`, `laptop`, `windowFrame`, `neonSign` for
building your own set. To see them all: `node modes/depth/tools/props-sheet.mjs <any depth reel>` → `stills/props_sheet.jpg`.

## Gear (`k.gear`): props a story is told with

- `k.gear.phone(root, { face: 'up' | 'front' })`: a phone with a live screen (`p.screen.draw(fn)`), `p.wake(t, t0)`,
  `p.xray(t, t0)` (the shell goes ghostly, a scan line sweeps, the insides lift apart), `p.spot(u, v)` (a point on the
  glass), `p.marks.battery | chip | camera | antenna` (pin labels on them).
- `k.gear.hand(root, { dir: 'down' | 'forward', sleeve })`: the origin is the fingertip. `h.tap(t, t0, point, { from })`,
  `h.press(t, t0, point, { hold })`, `h.swipe(t, t0, a, b)`, `h.at(point)`; each returns the contact 0..1 for that frame.
- `k.gear.pen(root)` (`pen.write(t, t0, len, path)`), `k.gear.field(root, { from, to, lines })` (curved field lines that
  draw, with charges riding them: `f.frame(t, tDraw)`), `k.gear.trail(root, points, { color })` (a glowing line that draws
  itself: `r.reveal(u)`).
- `k.gear.car(root, { color })`, `k.gear.traffic(root, lanes)` (`lanes = [{ pts: [[x, z], …], speed, cars }]`,
  `cars.frame(t)`), `k.gear.jet(root)` (`j.fly(t, path, t0, t1)` with a contrail and banking).

## Callouts (`k.label`)

`k.label(key, point, 'Text', { at, until, sub, side, dx, dy })` inside a shot's `build()`: a card-stock label pinned to a 3D
point with a leader line, re-projected every frame so it sticks to the thing while the camera moves. `point` is an
Object3D (it follows it), `[x, y, z]` in set coordinates, or `(t) => point` (a moving car). Labels keep out of the caption
band, the title and the right-hand buttons, and step aside from each other. Two or three per shot at most, each on its word.

## Bix (`k.buddy`)

```js
const b = k.buddy({ ...k.LOOK }, shot.root);   // the kit's host: mustard Bix in denim overalls and a red cap
// or dress him yourself:
const c = k.buddy({ color: 0xf2b544, overalls: 0x3f6390, shirt: 0xf3ecdd, hat: 'cap' | 'fedora', hatColor: 0xd9653b, chef: true,
                    suit: true, suitColor, tie, beanie: 0x2f6fb0, glasses: true, apron: 0x2f6fb0, bow: 0xd9342b, headset: true, scale: 1 }, shot.root);
b.root.position.copy(shot.set.host);
```

In `frame()`, call one idle first, then layer the rest:
- `b.idle(t, seed)` breathing and sway · `b.walk(t, seed, pace)` for walking
- `b.talk(t, shot.words)` a small bob on every spoken word
- `b.hop(t - tWord, height)` a jump with squash · `b.blink(t, [times])`
- arms: `b.point(t, t0, 'left' | 'right')`, `b.wave(t, t0)`, `b.cheer(t, t0)`, `b.type(t)`, `b.rest(t)`, or `b.arm(side, angle)`
- `b.body.rotation.y` to turn him toward something; `b.shadow.visible = false` when he stands on a box or sits.

He is about 1 m tall at scale 1. A crowd: `k.crowd(8, shot.root, 0.32)` returns small Bixes in a friendly palette.

## The flat layer

- **Taped title:** from the cut's `title` (or `shot.title`). 2–5 words, uppercase is applied for you.
- **Caption tiles:** automatic, from the words: up to 3 words (14 characters) per group, broken at punctuation, on a fixed
  soft band at y 1360–1610. Key words (from
  `reel.json` "tiles.keys" and `cuts.js` keys) are inverted. `tiles: { off: true }` hides them.
- **Badge:** `shot.badge = ['LABEL', (t) => number]`: pops in at the cut, punches each time the number changes.
- **Chip:** `shot.chip = 'command'` or `{ text, at }`: a terminal line that types itself in, then shows "● running".
- **Comment box:** `shot.cta = { keyword, at, sub }`: rises at the cut, the keyword types on the spoken word, Post presses,
  hearts float up, and `sub` pops under it. Use it in the last shot only.

## Timing and motion

- Every beat lands on a word: `shot.at('word')`. Never type seconds.
- Something changes every 0.5–1 s: a pin, a card, a counter tick, a hop, a sign letter.
- Landings use `k.settle` (overshoot), punches `k.jolt`, appearances `k.grow`. Never linear moves.
- One `k.punch` on the shot's biggest word. A `k.shake` only for a slam.

## Sound

`k.sound(t, name, db)` with names from the kit's synthesizer: pop, click, tick, thud, stamp, whoosh, swoosh, shimmer, type,
cash, riser, boom. Whip and swoop cuts add their own whoosh/swoosh. Keep it sparse: one or two per shot, on the beat that matters.

## Render

- Preview: `node studio/tools/kit.mjs frames <reel> 1 4 8` and LOOK at `stills/sheet.jpg`.
- Draft: `kit.mjs render <reel>` (half size; a 20 s reel takes about a minute and a half on a laptop GPU).
- Export: `kit.mjs export <reel>`.
- It needs WebGL (the GPU). If frames come out black, run `node studio/tools/checkup.mjs`.

## Self-check before you show it

- Every shot is a lit room with one clear subject, and the wall changes between cuts.
- Bix is in most shots and does something on a word.
- Titles say the point, tiles carry the words, nothing important sits under the taped title or the tiles.
- No real brand names on signs or screens; text on objects is short and readable on a phone.
- The last shot is the ask: the comment box with the keyword, Bix waving.
