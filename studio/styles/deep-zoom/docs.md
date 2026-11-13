# Deep Zoom - engine API (`S` in custom mode)

A small 3D renderer drawn to one Canvas 2D per scene: a perspective camera, meshes and sphere impostors
with real shading (key, rim, fill, specular, fresnel, studio reflections for metal), depth of field,
bokeh dust, film grain and a vignette, plus a 2D overlay for labels and type. Every frame is repainted
from t, so any seek gives the same pixels. No libraries, no WebGL.

## Units and coordinates

- **World units** for 3D: objects are about 1 unit in radius. Y is up. Lattices and molecules are in
  angstroms times a scale (see `S.lattice`).
- **Pixels** for the overlay: `ctx.W x ctx.H` is 1920x1080, 1080x1920 or 1080x1080. Use `S.u(px)` for
  sizes (1 in both main formats). Keep text inside `ctx.safe = { x0, y0, x1, y1, w, h, cx, cy }`.
- Times are seconds from the scene start. Use `S.when("word", frac)` rather than hard-coded numbers.

## Skeleton

```js
var ctx = S.scene(root, { floor: -0.8 });          // stage, main view and camera
ctx.view.reflect = true;                             // glossy floor reflection for nodes with .reflect
var t1 = S.when("ice", 0.2);                         // when "ice" is spoken, or 20 % of the scene
var cube = ctx.add(S.object("ice-cube", { material: "ice" }));
cube.reflect = true; cube.shadow = true; cube.subject = true;
cube.spin(10).enter(0, "rise", 1.1);                 // slow turntable, smooth entrance
ctx.camera.set({ pitch: 13, yaw: -12, fov: 28 });
S.frameSubject(ctx.camera, cube.r, { x: ctx.safe.x0, y: ctx.safe.y0, w: ctx.safe.w, h: ctx.safe.h * 0.75 }, 0.8);
ctx.camera.move("push-in", { from: 0, to: V.duration });
S.label("Frozen water", { target: cube, offset: [0, cube.top, 0], at: t1 });
S.lowerThird("Why is ice *slippery*?", "Start with something you can hold", { at: 0.5 });
```

No timers, no `Math.random` (use `V.makeRand`), no CSS animation. Everything is drawn by the engine.

## `S.scene(root, opts)` -> ctx

Clears `root`, makes the canvas and the main view. opts: `floor` (world y of the studio floor, or
null for none), `dof` (depth of field strength for sphere impostors, 0 = off), `camera` (initial camera
parameters), `grain` (0 to 2, default 1), `vignette` (default true), `dust` (false, or
`{ count, alpha, aperture, seed }`).

ctx: `W, H, safe, view, camera, add(node), portrait, landscape, square, stage`.

opts also: `transitions` (default true: a 0.45 s push-through and light sweep at the start of the scene
and a soft light sweep in the last 0.4 s; false for stills).

`ctx.view` (a View) has `floor`, `reflect` (true or an alpha, default 0.26), `dof`, `alpha` (number or
`fn(t)`), `rect`, `clip`, `floorGlow`, and `add(node)`.
`S.view({ rect, clip, camera, floor, dof, alpha, order })` adds another view (split screens, layers).

## Camera (`ctx.camera`, `S.camera(view)`)

Orbit parameters: `target [x, y, z]`, `dist`, `yaw`, `pitch`, `roll` (degrees), `fov` (degrees, default
30), `sx`, `sy` (screen offset of the target as a fraction of the view).

| Method | Effect |
|---|---|
| `.set(params)` | Base state |
| `.to(t, params, dur = 1.6, ease = "sine")` | Keyed move; distance interpolates in log space |
| `.move(kind, { from, to, amount, speed })` | Preset over a time span: `orbit`, `push-in`, `pull-out`, `dolly-left`, `dolly-right`, `rise` |
| `.drift({ yaw, pitch, roll, dist, sway, period, until })` | Continuous motion per second (`sway` = degrees of yaw oscillation over `period` s) |
| `.hook(fn(t, state))` | Edit the state each frame (pure in t) |
| `.state(t)`, `.moving(t)` | Read the state; true during large keyed moves |
| `.life` | Continuous life added on top of everything: `{ push: 0.08, yaw: 7, pitch: 1.2 }` by default (an 8 % push and a 7 degree yaw sweep across the scene, a slight breathing pitch). Set your own object, or `false` for a locked-off camera (thumbnails). |

`S.frameSubject(cam, R, region, fill, rect)` places a sphere of radius R at the target so it fills
`fill` of the region's short side, centred in the region (`rect` = the view rect, default full frame).

Eases (`S.ease`): `linear out in inOut sine outSine quart outQuart expo inOutExpo`. None overshoot.

## Nodes

Every 3D thing is a node. Methods (chainable unless noted):

| Method | Effect |
|---|---|
| `.to(t, { pos, rot, scale, opacity }, dur = 1, ease = "inOut")` | Keyed transform (rot in degrees, scale a number or [x, y, z]) |
| `.enter(t, kind = "rise", dur = 0.9)` | `rise` (fade in from slightly below), `fade`, `grow` (from 82 %) |
| `.exit(t, dur = 0.8)` | Fade out |
| `.spin(degPerSec, axis = "y")` | Continuous rotation |
| `.hook(fn(t, state, node))` | Edit pos / rot / scale / op each frame |
| `.add(child)` | Parent a node (returns the child) |
| `.point(t, local)` | World position of a local point (returns [x, y, z]) |
| `.screen(t)` | `{ x, y, r, z, a }`: screen centre and projected radius |

Flags: `.subject` (reported by `S.inspect`), `.shadow` (contact shadow on the floor), `.reflect`
(mirrored in a glossy floor when the view has `reflect`), `.label`, `.r` (bounding radius).

## Materials

`ice`, `glass`, `water` (translucent: fresnel, bright edges, caustic crescent), `metal` (studio
reflections), `matte`, `rubber`. Any material takes a `color` (hex or palette name). Atoms use a
glossy ceramic `gloss`. `S.materials` lists them.

## `S.mesh(kind, opts)` primitives

Kinds: `sphere`, `drop` (impostors with per-pixel shading and baked bloom; `radius`), `box`, `rbox`
(bevelled; `dims [w, h, d]`, `bevel`), `cylinder` (`radius`, `height`, `segments`), `hexprism`,
`disc`, `plane` (`dims [w, d]`, two-sided), `cone`, `crystal` (hexagonal column with pointed ends;
`radius`, `height`, `tip`), `gem` (brilliant cut), `bond` (a shaded stick `from` [x, y, z] `to` [x, y, z],
`radius`). Common opts: `material`, `color`, `pos`, `rot`, `scale`, `opacity`.

## `S.object(name, opts)`

Named studio objects (radius about 1): `ice-cube` (bevelled, inner bubbles and a frosted core),
`glass-cube`, `sphere`, `drop`, `crystal`, `gem`, `coin` (engraved rings and a hexagon), `cylinder`,
`skate-blade` (steel blade in a holder), `boot-sole` (rubber sole with treads), `snowflake` (six
branched arms). opts: `material`, `color`, `pos`, `rot`, `scale`, `rest` (rest tilt in degrees, applied
under the spin), `seed`. Returns a node with `r`, `top` (height of the top on the spin axis, for
labels) and `lo` (lowest point, for the floor). `S.objects` lists the names.

## `S.lattice(opts)` - hexagonal ice

Ball-and-stick water molecules in ice Ih bilayers; every oxygen has four neighbours and two hydrogens
(ice rules), hydrogen bonds are dashed ice-blue lines. opts: `layers` (1 to 5 bilayers, default 3),
`radius` (patch radius in hexagon cells, default 2.6), `scale` (world units per angstrom, default
0.28), `highlight` (`top` | `bottom`), `disorder` (0 to 1), `disorderAt` (s), `disorderLayers`,
`disorderDur`, `buildFrom` / `buildTo` (molecules appear layer by layer, bottom first), `hbonds`
(default true), `dof`, `oxygenRadius`, `hydrogenRadius`, `seed`, plus node opts.
Returns a node with `.anchor(name)` -> `fn(t)` world point for `molecule`, `oxygen`, `hydrogen`,
`bond`, `hydrogen-bond`, `top-layer`, `bottom-layer`, `surface`, `liquid-layer`; and `topY`,
`bottomY`, `radiusXZ` (world units).

## `S.molecule(opts)`

opts: `preset` (`water`, `carbon-dioxide`, `methane`, `ammonia`, `oxygen`, `hydrogen`) or `atoms`
(`[{ element, x, y, z }]` in angstroms; without coordinates the first atom is the centre and the rest
are placed around it), `bonds` (`[[i, j]]`, default by distance), `atomScale`, `bondRadius`, `dof`,
plus node opts. Returns a node with `atoms`, `bonds`, `atomWorld(t, i)`. Set `mol.charge =
function (t) { return 0..1; }` to show partial-charge glows (coral on O, N, F, Cl; ice on H).

## `S.particles(opts)`

Many small glossy spheres or tiny water molecules. opts: `behaviour` (`roll`, `jitter`, `flow`,
`settle`, `scatter`), `at` (when the behaviour starts or speeds up), `particle` (`sphere` | `water`),
`count` (6 to 260), `radius`, `extent` (half width of the field), `material`, `color`, `dof`, `seed`,
plus node opts. Returns a node with `.anchorAt(which)` for `particles`, `surface`, `left`, `right`, `top`.

## Subatomic levels

`S.atom()` (a stippled electron cloud around a bright nucleus), `S.nucleus()` (16 packed nucleons,
protons warm, neutrons grey), `S.quarks()` (a glassy proton with three quarks and flux tubes). All are
nodes of radius about 1.

## `S.dive(levels, opts)` - the scale dive

`levels`: `[{ kind, object, material, label, note, keyword }]`, outermost first; kinds `object`,
`crystal-lattice`, `molecule`, `atom`, `nucleus`, `quarks`, `surface-layer`. Each level gets its own
view and camera; the camera dives into the focus point of the current level while the next one grows
from it, with a soft flash, streaming dust and light streaks. opts: `reverse` (zoom out, innermost
first), `center` ([x, y] screen point of the dive), `fill` (0.6), `K` (scale step per level, 6),
`dur` (dive length, 2.1 s), `times` (arrival times, else from the spoken labels), `rect`.
Returns `{ levels, lands, arrive, trans, visit, s(t), sv(t), n, reverse }`: `visit[j]` is the level
index visited j-th, `arrive[j]` when it settles, `trans[j]` the dive length into it. Add your own
`S.lowerThird` per level (see `examples/custom-zoom-out.js`).

## Type, labels and sources (2D overlay)

All type is **bold documentary caps**: heavy upper case in white (Inter 900 for display, 800 for labels,
700 for body lines; any lighter weight you pass is raised to these), tight tracking at large sizes and
readable tracking at small ones. Emphasis is size and weight, never colour: in a headline or title,
`*words*` in asterisks become the bigger, heaviest line of the block and the rest is set smaller around
it. Lines build in with a left-to-right wipe and a short slide. No accent lines or bars are ever drawn
next to text. Pass `upper: false` to keep case (symbols like the partial charge signs).

- `S.label(text, opts)`: a dot on the target, a fine leader line with one elbow, then the text in small
  bold caps and an optional `sub` line (ice blue) or `kicker` line above. opts: `target` (a node,
  `[x, y, z]`, or `fn(t)` -> world point), `view`, `offset` (local point on a node target), `edge`
  ([fx, fy] point on the node's screen circle), or fixed `x, y`; `at`, `until`, `side`
  (`auto` | `left` | `right`), `dir` (`up` | `down`), `len`, `stem` (vertical leader, text centred),
  `line` (false = no leader), `size`, `maxWidth`, `upper`, `color`, `subColor`, `restAt`. Labels are
  kept in the safe area and pushed apart when they would overlap.
- `S.say(text, opts)`: the one headline (heavy caps; `*words*` become the big line). opts: `x, y`
  (top), `align`, `valign` (`top` | `middle` | `bottom`), `size`, `maxWidth`, `maxLines`, `at`,
  `until`, `color`. Returns `{ w, h, y, ... }`.
- `S.lowerThird(title, subtitle, opts)`: optional ice `kicker`, heavy caps title, subtitle in bold caps.
  No accent line. opts: `at`, `until`, `x`, `bottom`, `size`, `maxWidth`. Returns `{ h, w, top, box(t) }`.
- `S.number(opts)`: a big heavy numeral counting to `value` (smooth, no overshoot), sliding up as it
  counts. opts: `value`, `from`, `decimals`, `prefix` (a lone "-" becomes a true minus; negative values
  get one automatically), `suffix` (a unit stays large in ice blue; a word is set smaller), `x`, `y`
  (centre), `size`, `weight`, `maxWidth`, `at`, `dur`, `until`. Returns `{ top, bottom, w }`.
- `S.text(text, opts)`: a text block in bold caps. opts: `x, y`, `align`, `valign`, `size`, `weight`,
  `color`, `upper` (default true), `track`, `maxWidth`, `maxLines`, `lh`, `at`, `until`, `stack`
  (false: no emphasis stack), or attached: `target`, `view`, `dx`, `dy`, `clamp`.
- `S.source(opts)`: an on-screen citation. opts: `text` (the citation, e.g. "Physical Review Letters,
  2025"), `sub` (optional second line, e.g. the authors), `keyword` (appears when spoken; default 30 %
  into the scene), `at`, `corner` (`auto` (default) | `bottom-right` | `bottom-left` | `top-right` |
  `top-left`), `size`, `maxWidth`. A dark panel with a thin outline, a small bold SOURCE tag and the
  citation, wiping in and staying to the end of the scene. With `auto` the corner is chosen after
  layout so it collides least with the scene's other text and subjects. Every template also takes
  `source: { text, sub, keyword, corner }` as a prop (except `thumbnail`).
- `S.rule(x1, y1, x2, y2, opts)`: a thin line that draws on, for structural dividers only (never as
  an accent next to text). opts: `at`, `dur`, `until`, `color`, `alpha`, `width`.

## Custom drawing

`S.node(fn(t, d), opts)` makes a node whose `fn` is called every frame with `d = { C, items, X,
project(p), line(a, b, { color, width, alpha, dash }), glow(p, size, color, alpha) }` (world points;
depth-sorted with everything else).

## Helpers

`S.when(word, frac)`, `S.syncTimes(words)`, `S.lands(items, { start, end, gap })` (spoken times for a
list of labels), `S.measureBlock(text, { size, weight, maxWidth, maxLines })`, `S.measureText(text,
size, weight)`, `S.safe()`, `S.u(px)`, `S.palette`, `S.colorOf(c)`, `S.objects`, `S.levels`,
`S.presets`, `S.templates`, `S.inspect(t)` (screen boxes of subjects and overlays for the tester),
`S.stage()` (the internal stage, for debugging).

## Thumbnail

The `thumbnail` template makes a single still: render one frame at 1280x720 from wide (build the page
with `--width 1280 --height 720` and screenshot any time after 0.1 s). Props: `hero` (an object,
`crystal-lattice` or `molecule`), `material`, `slider` (`boot-sole` | `skate-blade` pressing on a
lattice hero), `preset` (molecule), `text` (2 to 4 words, `*word*` becomes the biggest line), `side`
(`left` | `right`), `mark` (`{ type: "x" | "arrow", target: "word" | "object", word }`). The camera is
locked off, the hero gets a strong backlight and rim, the words a thick dark outline and a dark backing
so they read at 320 px wide.

## Engine notes

- Lights travel with the camera (a studio rig), so a turntable spin shows the object's faces turning
  through the light.
- Spheres, drops and atoms are impostors rendered once per material, size tier and blur level, so a
  lattice of hundreds of atoms stays cheap. Meshes are painter-sorted faces with gradient fills.
- Continuous motion: camera life (above), dust drifting toward the lens, a softbox reflection that
  sweeps across glossy faces, vibrating molecules (`molecule({ vibrate })`, default 1), a breathing
  ice lattice, and the scene transitions.
- Frame cost (2026-11-13, this machine): see the report; the browser capture adds about 34 ms a frame.
- Square frames use the wide layouts; the tall layouts are written separately where rows would be
  cramped (split stacks, cause chain becomes a column, timeline rail runs into depth).
