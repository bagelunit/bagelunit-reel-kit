# Talking-head mode (`talking`)

The user's own face take drives everything: no TTS and no presenter. You cut their take tight, then build hard-cut layouts, per-word captions and graphics around it. The engine is `modes/talking/runtime` (`th.js` holds the API, `tween.js` is a scrubbed timeline). Every frame is a pure function of `t`, so frames render identically in any order.

Read this whole file before writing `scenes.js`. The template (`modes/talking/starter/scenes.js`) is a working example that uses every layout once. Start from it and replace it beat by beat.

---

## 1. Workflow

1. **Project:** `node "$KIT_DIR/tools/kit.mjs" start <REELS>/<slug> --style talking`
2. **The take:** `python3 "$KIT_DIR/tools/take.py" <REELS>/<slug> --video <their take>`. It:
   - trims the head and tail;
   - tightens pauses of 0.22 s and longer down to 0.15 s (`--keep`, `--min-pause`; `--no-cut` keeps the timing untouched);
   - polishes the voice into `audio/vo.mp3`;
   - writes the face frames (`frames/face/`, `build/face.json`, including the jump-cut times);
   - writes `build/words.json` and `build/word_index.txt` (ElevenLabs Scribe when a key exists, else local Whisper).

   Tell the user the tightened length. If they asked to review the edit, get their OK on the cut before building visuals.
3. **Script beats:** open `build/word_index.txt` and split the take into beats of 1.5–3 s. One beat = one `TH.scene`.
4. **Write `scenes.js`** (section 4), then run the review loop from KIT.md section 6: stills → `kit render` → `kit pace` + `kit effort` both PASS → `--final` → `export`.

Never speed the take up. The user's natural pace is the pace. Only pauses get cut.

---

## 2. Layouts: hard cuts, no transitions (`TH.LAY`)

| Layout | What it looks like | Graphics | Caption |
|---|---|---|---|
| `SPLIT` | paper top, the take in a framed window (ink border, rounded top) from y 900 | `s.el`, authored at 1080 wide, shown at 0.8× from (540, 90) | above the window (baseline y 866) |
| `SEAM` | grid paper above a hard ink + accent double rule at y 960, the take below | `s.el`, above the seam | above the seam (y 928) |
| `FACE` | the take full frame, punched in 1.22× | overlays only, in **`s.ov`** | on the chest (y 1330), with a text shadow |
| `PAPER` | full paper canvas, one hero graphic | `s.el` | y 1300; a lone long word is set big in Anton |
| `TINT` | the same as PAPER on the accent-tinted paper | `s.el` | y 1300 |
| `DARK` | ink background; put `TH.blurClone()` behind a sharp `TH.glowCard()` | `s.el` | y 1440, in paper colour |

**Rules:**
- Cut every 1.5–3 s, on a spoken word.
- Never use one layout more than twice in a row.
- The face is on screen from frame 0 (SPLIT, SEAM or FACE), unless the hook is a pure graphic.
- Every layout change gets a whoosh automatically (`TH.finalize`). Pass `{ quiet: true }` to skip it.
- On every jump cut in the take, the face gets a small alternating zoom, and each scene has a slow push-in. So a cut never looks like a glitch, and no frame sits dead.
- Scene options: `TH.scene(id, t0, LAYOUT, { noCap, face: { s, x, y }, k, cap, voice })`.
  - `noCap` hides the captions; the CTA uses it.
  - `face` re-frames the take for this scene.
  - `cap` moves the caption baseline.

---

## 3. Captions: the main source of pace

`TH.captions(KEY, { hot, max, swap })` must be called at the end of `scenes.js`.

**How chunks work:**
- Chunks are 1–2 words, swapped on every word, popping in on `back.out`.
- A chunk breaks:
  - at punctuation;
  - at a pause longer than 0.18 s;
  - before and after every KEY word.

**How words look:**
- **KEY words** (names, nouns, numbers, the promise) are set in **Anton CAPS on the accent tape**, wiping on with the word.
  - `hot` words sit on the second ink colour instead. Use it for the 2–3 biggest words (a price, "free", the result).
  - Pick about one KEY word per sentence. If everything is KEY, nothing is.
- **Everything else** is Figtree 800: ink on paper layouts, paper with a shadow on the face.
- **Numbers count up inside the caption** over the spoken word.
  - `swap: { 'twelve thousand': '12,000' }` shows a spoken number as digits so it can count.

---

## 4. Writing `scenes.js`

Shorthand globals:
- `T('word', after)`: the start time of a word or phrase.
- `Tend`: its end time.
- `mk(parent, html)`
- `pop(el, at, o)`
- `C`: the theme colours.
- `REEL`: `reel.json`.

Rules:
- Every time comes from `T()`, never from typed seconds.
- Put each beat in its own `{ }` block.

```js
{ const s = TH.scene('proof', T("it's called") - 0.03, 'PAPER'), p = s.el, tN = T('12,000');
  const w = mk(p, `<div class="ab" style="left:140px;top:300px;width:800px">${TH.paperCard(`<div style="padding:56px 40px">${TH.repoWidget('you', 'reel-kit')}</div>`)}</div>`);
  pop(w, s.t0, { dy: 80, s0: 0.92 }); TH.drift(w, s.t0 + 0.35, s.t1, { to: 1.05 });
  TH.count(w.querySelector('.rwN'), tN - 0.1, tN + 0.5, 0, 12000, { sound: 'pop' }); }
```

- Graphics go in `s.el` (under the face). On FACE beats, overlays go in **`s.ov`** (above the face). `s.el` is hidden on FACE.
- Anything whose position you need to measure goes inside `TH.later(() => …)` with `TH.rectOf(el, root)`. Layout only exists once fonts are ready.

### Components (all on the master timeline, at word times)

- **Motion:**
  - `TH.pop(el, at, o)` (back.out pop);
  - `TH.slam(el, at, o)` (big-to-normal impact);
  - `TH.fade`, `TH.out`, `TH.drift` (a slow push across a beat);
  - `TH.wipe` (reveals left to right);
  - `TH.draw(path, at)` (an SVG stroke draws on).
- **The sliding highlight frame:** `TH.slider(parent, [{ x, y, w, h, at }…])`. One frame slides to each item as it is named. It's the signature move for lists and steps.
- **Marks:**
  - `TH.strike(parent, x, y, w, h, at)`: a hand-drawn strike;
  - `TH.handNums(parent, ['1','2','3'], [x, y], [t1, t2, t3])`: handwritten numbers with arrows;
  - `TH.line(parent, pts, at)`: a connector that draws on;
  - `TH.sparks(parent, x, y, at)`: a star burst.
- **Live values:**
  - `TH.count(el, t0, t1, from, to)`
  - `TH.type(el, text, t0, { cps, caret })`
  - `TH.meter` / `TH.setMeter` (a ring gauge)
  - `TH.on(s, t => …)`: per-frame code while scene `s` is on screen.
- **Pieces (HTML strings):**
  - `TH.tape(text)`, `TH.tag(text, { kind: 'acc' | 'line' | 'ink2' })`;
  - `TH.paperCard(inner)`, `TH.glowCard(inner)` with `TH.blurClone(parent, sameHtml)` for DARK;
  - `TH.device(inner, w, h)` (a monitor for screenshots and real screens);
  - `TH.repoWidget(owner, repo)`, `TH.statusCard(label, body)`;
  - `TH.cursor(parent)` + `TH.click(el, at)`;
  - `TH.world(s, { blobs, grid, vignette })` (backdrop);
  - `TH.seq(parent, dir, n, t0)` (an image sequence).
- **CTA:** `TH.cta(s.ov, KEYWORD, T(KEYWORD) - 0.05, { preAt, sub: "I'll send you the link", subAt })` on a FACE scene with `{ noCap: true }`.
- **Sound:** `TH.sound(t, name, gain)`. Pops, slams, sliders, strikes, counts and layout cuts already add their own. Names: pop, impact, stamp, swoosh, whoosh, tick, click, shimmer, thud, riser, type, cash, boom.

**Real material first.** When the take talks about a product, a page, an app or a number, show the real thing: a screenshot the user gives you, inside `TH.device()` or a card. Rebuild UI as HTML only when no capture can show the moment.

---

## 5. Pacing bar (`kit pace` checks it)

| | target |
|---|---|
| a change every | ≤ 0.47 s |
| frames in motion | ≥ 92 % |
| changes on a spoken word | ≥ 78 % |
| holds ≥ 0.8 s | 0 |

The face moving by itself doesn't count. The engine writes `build/motion_mask.json` (the face region per scene, minus the captions and `s.ov` overlays), and the gate ignores those pixels. Your graphics, captions and cuts carry the pace.

`motion` lists every hold together with the words spoken there. Add a beat on one of those words: a pop, a slider move, a count, a new card, or a layout cut.

---

## 6. Traps

- **Overlays on FACE beats go in `s.ov`.** `s.el` is hidden there, and anything put in it silently disappears.
- **Measure inside `TH.later`.** `rectOf` returns zeros before layout.
- **Don't scale the take down in SPLIT/SEAM** (`face.s` stays 1). It leaves bars at the sides. Re-frame with `x` / `y`, or with reel.json `"face": { "dx", "dy", "zoom" }` for the whole reel.
- **A cue word that isn't in the take** makes `T()` fall back and logs it as missing (`TH.missing`, printed as a warning by `kit frames`). Read the warnings: a missing cue means a beat fires at the wrong time.
- **Captions on the face need contrast.** Keep FACE captions on the chest (y 1330), never across the eyes or mouth.
- **Themes:** reel.json `"theme": "studio" | "harbor" | "ochre" | "ink"` (v1.0 names clay / cobalt / forest / mono still work), or `{ "preset": "studio", "accent": "#…" }`. Colours come from `C.*` / `var(--accent)` etc., never hard-coded, so a theme switch restyles everything.
