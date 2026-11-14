# Dusty Archive engine - custom-mode API (`S`)

The scene is an archive desk filmed by a slow camera. Coordinates are **world px**: by default the
world is exactly `V.width × V.height` (at camera zoom 1 a world px is a screen px). Items are placed
with `x,y` (top-left) or `cx,cy` (centre), a width `w` and a small rotation `rot` (degrees). Every
item returns `{ el, x, y, w, h, rot, rect, point(fx, fy) }` - `point` gives the world position of a
fraction of the item (rotation included). All `at` values are seconds (use `V.at("word")`).

## Skeleton

```js
S.desk(root);                                              // wood desk, lamp, grain, dust, vignette
const t1 = V.at("Lincoln"), t2 = V.at("letter", t1);
const ph = S.photo({ subject: "portrait", tone: "sepia", cx: V.width * 0.36, cy: V.height / 2, w: V.s(620), rot: -2, caption: "Springfield, 1860" });
S.place(ph, 0.1, "develop");
const lt = S.letter({ text: "I am not bound to win, but I am bound to be true.", cx: V.width * 0.72, cy: V.height / 2, w: V.s(560), rot: 2, writeAt: t2 });
S.place(lt, t2 - 1.2, "slide");
S.camera.panZoom({ rect: ph.imgRect() }, 0, t2 - 1.2, { from: { fx: 0.5, fy: 0.5, zoom: 1 }, to: { fx: 0.5, fy: 0.35, zoom: 1.3 } });
S.camera.focus(lt, t2 - 1, 1.6, { fill: 0.9 });
S.lowerThird("Abraham Lincoln", { sub: "Illinois, 1860", at: t1 - 0.2 });
```

## Desk & camera

| Call | Does |
|---|---|
| `S.desk(root, { surface, width, height, lamp:{x,y,r}, camera:{x,y,zoom}, drift, grain, flicker, dust, scratches, letterbox })` | Creates the world. surface: `wood` (default), `felt`, `cork` (evidence board), `leather`, `lightbox`, `black`. `width/height` make a bigger world (e.g. a long timeline). Call first. |
| `S.camera.focus(itemOrRect, at, dur, { fill, zoom, cover, anchor:[fx,fy], ease })` | Glide so the item fills `fill` (0.86) of the frame. `dur: 0.01` = cut. |
| `S.camera.panZoom(itemOrRect, at, dur, { from:{fx,fy,zoom}, to:{fx,fy,zoom}, cut })` | Classic pan-and-zoom across an item (zoom 1 = fill the frame). Use `{ rect: photo.imgRect() }` to move over the image only. `cut:false` glides in from the current shot. |
| `S.camera.to(x, y, zoom, at, dur, { ease, rot })` | Free move in world px. |
| `S.camera.wide(at, dur, { fill })` | Show the whole world. |
| `S.camera.track(t => ({ x, y, zoom }), at, blend)` | Follow something moving (e.g. a map route head). |
| `S.camera.shake(at, amp, dur)` | Table thump (stamps, slams). `S.camera.drift(0..2)` handheld amount. |
| `S.place(item, at, style, { from, dur })` | Entrance: `slide` (pushed in from a side, settles), `drop`, `develop` (photo develops from white), `spin` (newspaper), `fade`, `none`. |
| `S.removeItem(item, at)` | Lift an item away. |

## Archival materials

| Call | Returns / notes |
|---|---|
| `S.photo({ subject, tone, cx, cy, w, rot, caption, border, mounts, tape, damage, aspect, seed })` | Print with white/cream/black border, corner mounts, grain, scratches. Subjects: `S.subjectIds` (portrait, portrait-woman, group, crowd, city, street, building, ship, train, factory, landscape, aircraft, bridge). Tones: `sepia`, `silver`, `cyanotype`, `faded`, `modern`. Adds `.focus` (point of interest), `.imgRect()`. |
| `S.document({ header, title, date, to, from, subject, ref, body, redact:[…], classification, typeAt, typeEnd, clip })` | Typewritten page; the text types itself between `typeAt` and `typeEnd`, redaction bars sweep over `redact` phrases. `.lines[i].start`, `.lineFy(line)`, `.typedEnd`. |
| `S.stamp(item, text, { at, color: red\|blue\|black, fx, fy, rot })` | Rubber stamp thump (with camera shake). |
| `S.newspaper({ name, date, headline, subhead, kicker, subject, caption, price, tone })` | Front page. `.headlineAt`, `.headlineRect`, `.photoAt`. |
| `S.map({ title, terrain: continent\|coast\|islands\|inland, places:[{name,date,x,y}], w, h })` | Parchment map. `map.drawPlaces(times)`; `const r = map.route(times, { style: land\|sea\|air\|rail })` → `r.head(t)` for the camera. `map.placeAt(i)`. |
| `S.indexCard({ title, lines, color: white\|manila\|pink\|blue, typed })` | Ruled index card. |
| `S.pin(item, fx, fy)` → world point; `S.string(p1, p2, { at, dur, color })` | Push-pins and red investigation string. |
| `S.letter({ text, salutation, signoff, signature, date, place, writeAt, writeEnd })` | Handwritten letter written line by line in sync with the words. `.end`, `.lineCenter(i)`. |
| `S.ledger({ title, year, lines })` | Ruled ledger. `ledger.row(line, label, value, at, { prefix, suffix, decimals, total })`. `S.inkCircle(item, fx, fy, fw, fh, at)` circles something in red ink. |
| `S.filmstrip({ frames:[{subject,tone}], frameW, x, y })` | 35mm strip; `.frameRect(i)`. Move it with `tl.to(strip.el, { x }, …)`. |
| `S.envelope`, `S.loupe`, `S.pen`, `S.stain`, `S.tape`, `S.paperclip`, `S.clutter(rect)` | Desk props; `S.clutter` scatters old prints/papers around a rect. |
| `S.textCanvas(parent, text, { size, font, style, weight, color, width, maxLines, align })` | Printed text on paper (canvas, crisp under zoom). `S.fonts.serif / times / type`. |

## Screen overlays (not affected by the camera)

| Call | Does |
|---|---|
| `S.lowerThird(title, { sub, kicker, at, end, align })` | Serif small-caps lower-third with a gold rule. |
| `S.dateStamp(text, { sub, at, end, pos: tl\|tr\|bl\|br })` | Typed Courier date stamp. |
| `S.subtitle(text, { at, end })` | Italic documentary subtitle. |
| `S.titleCard(title, { kicker, sub, date, at, titleAt })` | Centred chapter title. |
| `S.fadeIn(at, dur)`, `S.fadeOut(at, dur)` | From / to black. |

`S.stage(root)` also works (desk + a padded flex column on top, for the shared helpers below), but
prefer materials on the desk. Templates from code: e.g. `S.render("photo-pan", root, { subject: "ship" })`.

## Engine additions (dusty-archive engine.js)

Everything above works as written. These extras exist too:

| Call | Does |
|---|---|
| `S.camera.set(x, y, zoom, rot)` | Camera state at t = 0 (before any move). |
| `S.camera.at(t)`, `S.camera.toScreen(x, y, t)`, `S.camera.state(itemOrRect, { fill, cover, anchor, target, lower })` | Read the camera, project a world point, or get the state a `focus` would move to. |
| `S.camera.wide(at, dur, { fill, safe, lower, rect })` | `safe: true` fits the world (or `rect`) into the safe area instead of the full frame; `lower: true` leaves room for a lower-third. |
| `S.place(item, at, "rise")` | Extra entrance: fades in while rising a little. `develop` keeps the print opaque and brings the image up from blank paper. |
| `S.document({ ..., cpl, paper, clip })` | `cpl` characters per line (default: the largest type that fits the page), `paper` (`memo`, `letter`, `news`, `card`, `manila`), `clip: true` adds a paperclip. Returns also `.head(t)` (typing position), `.bars` (redactions) and `.redactAt(t)`. |
| `S.letter(...)` | Returns also `.lines` (with `start`, `dur`) and `.pen(t)` (where the nib is). Lines with spoken words are written while they are said. |
| `ledger.figure(value, at, dur, { prefix, suffix, decimals, fy })` | A big counted number on the first page; returns `{ at, end, rect() }`. `ledger.source(text, at)` writes a source note. |
| `S.newspaper(...)` | Also `.photoRect`, `.headlineLocal`, `.photoLocal`. |
| `S.map(...)` | `.places` (with `lx, ly` page positions). Labels are placed on the side of each dot that crosses the route least. |
| `S.filmstrip({ ..., vertical, tone })` | `vertical: true` stacks upright frames down the strip (tall videos). `.frameLocal(i)`, `.frameCenter(i)`. |
| `S.labelStrip(text, { h, w, maxW, cx, cy, rot, color: white\|manila })` | Typed label strip (case titles, year tags). |
| `item.sub(lx, ly, lw, lh)`, `item.local(lx, ly)` | World rect / point of a part of an item (local px from its top-left, rotation included). |
| `S.paper(parent, w, h, { kind, edge: straight\|deckle\|torn, age, stain, creases, seed })` | Paint an aged sheet into any element. |
| `S.photoImage(subject, tone, w, h, seed)` | The bare toned photograph as a canvas (no border). |
| `S.onFrame(fn)` | Run `fn(t)` every frame after the engine's own updates. |
| `S.safe()`, `S.contentRect({ lower, top })`, `S.tones`, `S.templates` | Layout helpers and lists. |

Kept simple on purpose: photographs are drawn shapes (soft, grainy, toned), not photo-real; faces are generic
studio busts; the "modern" tone is a cool-tinted grey, not full colour; the loupe does not magnify.

## Opening (`enter`, every style)

A scene option, not a template prop. `"enter": "none"` makes the scene open on its built picture: frame 0 already shows the subject and the title instead of an empty build-in, so a reel's hook frame is never blank. Frame 0 shows the scene as it is at 1 s; it then runs at half speed until it meets the real clock at 2 s, so the opening never stands still, and after that time is untouched, so the voice and the word cues stay in sync (a cue in the first 2 s lands up to 1 s early). A number sets that start point in seconds (0 to 3). Give it to `core/build-scene.mjs --enter none`, or as `"enter"` in a scene's props (taken out before the template sees them). In custom code `V.enter` is the hold in seconds (0 for a normal build-in). Use it on the first scene of a reel; later scenes keep their build-in, which reads as the cut.
