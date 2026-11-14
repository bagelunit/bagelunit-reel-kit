# Map engine - custom-mode API (`S`)

The scene is a satellite relief map in a tilted "world" that a camera pans and zooms. **World px = screen px
at zoom 1** (the region is laid out to fit the frame). Places are given as an anchor name of the region
(`"sydney"`), `[lon, lat]`, `"lon,lat"`, normalised `[x, y]` (0..1 of the region box) or `{ x, y }`.
All `at` values are seconds (use `V.at("word")`). Overlay items return `{ g, x, y, at, p, rect, ... }`;
sizes `r` are a fraction (≤ 1.5) of the region's smaller side, or px when larger.

## Skeleton

```js
const m = S.map(root, { region: "australia" });              // terrain, clouds, tilt, camera
const t1 = V.at("Pilbara"), t2 = V.at("billion", t1);
S.kicker("FACT #1", { at: 0.2 });
S.zone("pilbara", { at: t1 - 0.6, r: 0.1, color: "red" });
S.ring("pilbara", { at: t1 - 0.3, r: 0.06 });
S.arrow("auto", "pilbara", { at: t1 - 0.5 });
S.label("pilbara", "The Pilbara", { at: t1, box: true, sub: "WESTERN AUSTRALIA" });
S.headline("HIDDEN FOR *3 BILLION* YEARS", { at: t2 - 0.1, pos: V.isPortrait ? "bottom" : "top" });
S.camera.push(1.06, 0, t1);
S.camera.fly("pilbara", 1.8, t1 - 0.6, 1.8);
```

## World & camera

| Call | Does |
|---|---|
| `S.map(root, { region, fit, tilt, biome, features, clouds, vignette, drift, anchorY, resolution, camera })` | Builds the world. `region`: see `S.regionIds` (`world, australia, usa, europe, africa, south-america, india, china, japan, uk, egypt-nile, middle-east, antarctica, mediterranean, island, archipelago, continent, peninsula`). `biome`: `arid | temperate | tropical | desert | mixed | polar` override. `features`: extra terrain hints `[{ t: "mtn", pts:[[lon,lat]…], r, h }, { t: "desert"|"forest"|"ice"|"plateau"|"lake", c:[lon,lat], r:[rx,ry] }, { t: "river"|"valley", pts }]`. Returns `m` with `m.R` (region data), `m.box` (region box px), `m.land` (land rect), `m.T.elev(x,y)`, `m.T.land(x,y)`. Call first. |
| `S.pt(place)` | → `{ x, y, nx, ny }` world px of a place. `S.rad(r)` → px. `S.region(id)` → region data (`anchors`, `kmW`, `name`). |
| `S.camera.fly(place, zoom, at, dur, { ease })` | Glide to a place; `zoom` multiplies the whole-map zoom (1 = whole region, 2–4 = close). |
| `S.camera.push(mul, at, dur)` | Slow push-in from the camera's state at `at` (keeps the centre). Use on every scene. |
| `S.camera.focus(rectOrItem, at, dur, { fill, zoom })` | Frame a rect / item (`item.rect`). |
| `S.camera.wide(at, dur, { fill })` | Back to the whole region. `S.camera.to(x, y, zoom, at, dur)` free move. |
| `S.camera.track(t => ({ x, y, zoom }), at, blend)` | Follow something moving (e.g. `route.head(t)`). |
| `S.camera.shake(at, amp, dur)`, `S.camera.drift(0..2)`, `S.camera.state(t)` | Impact shake; idle drift amount; camera state at t. |

## Overlays on the map (world coordinates, counter-scaled so they stay readable when zoomed)

| Call | Does |
|---|---|
| `S.arrow(from, to, { at, dur, color, width, bend, end })` | Bold curved red arrow drawing itself from `from` (a place, or `"auto" \| "left" \| "right" \| "top" \| "bottom"`) to `to`. `.end_` = time it lands. |
| `S.ring(place, { at, r, color, rings, end })` | Pulsing target rings with ripples and a rotating crosshair. |
| `S.zone(place, { at, r, rx, ry, color, lava, pulse, end })` / `S.zone(null, { pts: [places…], … })` | Glowing highlight ellipse or polygon; `lava: true` for a hot orange-yellow core. `.rect` for the camera. |
| `S.pin(place, { at, color, size, label, labelPos, end })` | Map pin dropping in (bounce). |
| `S.label(place, text, { at, size, color, pos: above\|below\|left\|right\|center, dx, dy, box, bar, sub, maxWidth, end })` | Thick outlined caps label; `box: true` puts it on a dark card with a coloured bar. |
| `S.marker(place, n, { at, color, label, sub, pos, end })` | Numbered disc (countdowns) with pulsing halo + boxed label. |
| `S.route(places, { at, dur, style: dotted\|dashed\|solid, head: dot\|plane\|ship\|car\|none, color, width, stops, hideHead, end })` | Route drawing itself through places. Returns `.head(t)` → `{x,y,ang}`, `.times[i]` (arrival at each stop), `.end_`. |
| `S.badge(place, { at, value, prefix, suffix, decimals, caption, color, pos, countDur, end })` | Stat badge pinned to a place with a dashed stem; numbers count up. |
| `S.silhouette(regionId, place, { at, color, label, rot, scale, enter, end })` | Another region's outline at true relative size (uses `kmW`). `.w .h .rect`. |
| `S.grid({ step })` | Faint blueprint grid under the overlays. |

Colours: `red | yellow | cyan | green | orange | white | blue | purple | pink` or any hex.

## HUD (screen space, not affected by the camera)

| Call | Does |
|---|---|
| `S.headline(text, { at, pos: top\|bottom\|center, color: white\|yellow, em, size, maxLines, sync, stagger, end })` | Giant outlined headline; words pop in one by one (`sync: true` lands each word on its narration time). `*stars*` colour words yellow. Returns `.land` (time the last word lands). |
| `S.kicker(text, { at, pos: tl\|tr, color, end })` | Small skewed red tag. |
| `S.banner(text, { at, color, sub, end })` | Bottom red strip, white caps. |
| `S.stat({ at, value, prefix, suffix, decimals, caption, color, pos: tl\|tr\|bl\|br\|center, countDur, end })` | Big corner stat card that counts up. |
| `S.legend(items, { at, title, pos, end })` | Legend `[{ label, color }]`. `S.versus({ at, text })` big VS. |
| `S.caption(text, { at, end })` | Outlined caption at the bottom (subtitles). |
| `S.crossSection({ at, kind, label, depth, title, pos: right\|bottom, depthFrac, end })` | Underground panel: strata, scan line, drill, glowing deposit (`gold, oil, water, lava, crystal, gas, diamond, fossil, cave, ore, iron, lithium, copper, uranium, coal, salt, aquifer, magma`). Returns `.reveal` (time the deposit lights up). |
| `S.globe(root, { target, at, spinDur, holdDur, zoomDur, color })` | Spinning globe layer on top that dives into `target` (world anchor or `[lon,lat]`) and dissolves. Build the map first. Returns `.arrive .zoom .done`. |
| `S.fadeIn(at, dur)`, `S.fadeOut(at, dur)`, `S.flash(at, dur)` | Black fades, white impact flash. |

`S.stage(root)` (shared helpers) also works - it paints a dim world map background - but prefer `S.map`.
Templates from code: e.g. `S.render("map-focus", root, { region: "usa", place: "texas", headline: "BIGGER THAN *FRANCE*", keyword: "Texas" })`.
`S.guessGeo(text)` → `{ region, place }` guessed from narration (what the fallback uses).

## Engine notes (added with the engine build)

### Simplified geography: what can be drawn and how rough it is
All outlines are hand-made lon/lat rings inside `engine.js` (no outside data). They are deliberately
rough, clean shapes for a stylised relief map: not accurate coastlines and not political borders.
- Land: Africa, Eurasia (one ring with the Baltic, Gulfs and Red Sea cut in), Great Britain, Ireland,
  small Scottish isles, Iceland, Sicily, Sardinia, Corsica, Crete, Cyprus, Zealand, Mallorca,
  Novaya Zemlya, Svalbard, Japan (Honshu, Hokkaido, Kyushu, Shikoku), Sakhalin, Taiwan, Hainan,
  Philippines (3 shapes), Borneo, Sumatra, Java, Sulawesi, New Guinea, Sri Lanka, Madagascar,
  North America plus Alaska, Canadian arctic islands, Greenland, Newfoundland, Vancouver Island,
  Cuba, Hispaniola, Jamaica, Puerto Rico, Hawaii, South America, Falklands, Australia, Tasmania,
  New Zealand (2), Antarctica.
- Water cut out of land: Caspian, Black Sea, Azov, Marmara, the five Great Lakes, Winnipeg,
  Great Slave, Great Bear, Victoria, Tanganyika, Malawi, Chad, Nasser, Baikal, Balkhash, Ladoga,
  Onega, Titicaca.
- Detail: about 1 to 2 degrees between points on big coasts; about 0.2 to 0.5 degrees where a
  regional map needs it (UK, Japan, Nile delta and Suez, Red Sea and the Gulfs, Mediterranean).
  Coasts get a seeded wiggle at build time so they read as natural at any zoom.
- Terrain hints: about 100 ridge lines, 70 biome areas (desert, red desert, steppe, forest, ice,
  salt, wet, plateau), 60 rivers (the Nile, Indus, Tigris, Euphrates, Colorado, Niger, Orange,
  Rio Grande and Yellow River paint a green strip through deserts), and about 600 named places.
- Silhouettes (`S.silhouette`, compare-size): rough country shapes for usa (lower 48), india, china,
  egypt, uk (Great Britain plus Northern Ireland), europe, middle-east (Arabian peninsula) and the
  Mediterranean sea; other regions use their land rings.
- To add more: append a ring to `LAND` or `WATER`, a ridge to `MTN` ("h w|lon,lat ..."), an area to
  `AREAS` ("kind s|lon,lat rx,ry" or a polygon), a river to `RIVERS`, a place to `PLACES`
  ("name:lon,lat"), or a region to `REGION_DEFS` (a lon/lat box plus optional local `anchors`).

### Regions
- Real regions are lon/lat windows on the same data, so a coast or river looks the same everywhere.
  Antarctica uses a polar projection; the rest use equirectangular with a cos(latitude) squeeze.
- Region-local anchors override global places where the meaning changes, for example in
  `egypt-nile` "mediterranean" is the coast north of Qattara and "red-sea" is the Egyptian coast;
  most regions also define center, north, south, east and west.
- `usa` draws Alaska and Hawaii as dashed insets in the south-west corner; their anchors
  (alaska, anchorage, juneau, denali, fairbanks, nome, hawaii) land in the insets.
- `island`, `archipelago`, `continent`, `peninsula` are seeded generic shapes. Anchors: center,
  north, south, east, west, northeast, northwest, southeast, southwest, peak, interior, bay, harbor,
  capital, coast, cape, lake; archipelago adds island-1 to island-6 and lagoon; continent adds
  desert, forest, mountains, river-mouth, gulf; peninsula adds tip, neck, isthmus, island.
- Coordinates outside the valid range (for example latitude 99) fall back to the map centre.

### Options and helpers added
- `S.camera.fly(place, zoom, at, dur, { screen: [fx, fy] })` lands the place at that screen point
  (0..1), so a headline does not cover it. `S.camera.focus(r, at, dur, { fill, area, min, max })`
  frames inside `area` (a screen rect). `S.camera.track(fn, at, blend, until)` stops following at
  `until`. `S.camera.project(x, y, t)` gives the screen point of a world point.
- `S.label`: `pos` also takes `auto` (default for boxed labels; scored against the HUD, the safe area
  and other labels over the time it is visible) and far slots `right+ left+ above+ below+` drawn with
  a leader line; `hide: [a, b]` hides it between two times; `gap`, `textColor`, `prefer`.
- `S.badge`: `stem: false`, `size`, `gap`; `pos: auto` like labels.
- `S.route`: `times: [...]` (arrival time per place), legs follow a river when both stops sit on one
  (`river: false` turns that off), `hop` (ease at each stop, default true), `bend`, `hideHead`.
- `S.zone`: `dashed`. `S.silhouette`: `ghost` (dashed outline copy), `scale`, `labelSize`.
- `S.headline`: `x`, `y` (top), `cy` (centre), `maxWidth`. `*em*` groups never break across lines.
- `S.stat`, `S.legend`, `S.banner`: `x`, `y`. `S.versus`: `x`, `y`, `color`, or `pos: t => [x, y]`.
- `S.crossSection`: `rect: {x, y, w, h}` and `site` (draws a dashed callout from the map site).
- `S.region(id)` returns `{ id, name, anchors, kmW, generic }`; `S.places(id)` the anchor list.
- `S.stage(root, { region, dim, clouds })` is a dimmed map for scenes that are mostly HUD.
- `S.inspect(t)` lists screen boxes (labels, badges, markers, rings, pins, HUD); `S.safe()`.
- Fades: the latest started `S.fadeIn` / `S.fadeOut` sets the black level, so a dip to black is
  `S.fadeOut(t, 0.2); S.fadeIn(t + 0.2, 0.3)`.

## Opening (`enter`, every style)

A scene option, not a template prop. `"enter": "none"` makes the scene open on its built picture: frame 0 already shows the subject and the title instead of an empty build-in, so a reel's hook frame is never blank. Frame 0 shows the scene as it is at 1 s; it then runs at half speed until it meets the real clock at 2 s, so the opening never stands still, and after that time is untouched, so the voice and the word cues stay in sync (a cue in the first 2 s lands up to 1 s early). A number sets that start point in seconds (0 to 3). Give it to `core/build-scene.mjs --enter none`, or as `"enter"` in a scene's props (taken out before the template sees them). In custom code `V.enter` is the hold in seconds (0 for a normal build-in). Use it on the first scene of a reel; later scenes keep their build-in, which reads as the cut.
