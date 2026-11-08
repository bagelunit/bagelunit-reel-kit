# Craft playbook: what is on screen

The hook playbook decides whether someone stops. This one decides what they see once they have. Read it before the storyboard (Gate B) and again before you call a build done. The gates it leans on: `kit pace` (does it keep moving), `kit effort` (was it built for this script), `kit lint` (shot length, repeats, cuts on words) and `kit qa` (the final file's format, loudness, black frames and sync). The table near the end says exactly what each one flags.

## A. One world per reel

Pick one place or object that the whole reel lives in, and name it in the storyboard concept card in a single line ("a kitchen counter", "a fuel gauge", "a wall of drawers"). Every prop belongs to that world. If a prop could sit in any reel, it is decoration: cut it or make it part of the world.

- The world is chosen for the argument, not for looks. A reel about slow replies lives in a waiting room; a reel about hidden fees lives in a receipt.
- Switch ground (light to dark, or a zoom into the object) on big beats, but do not switch worlds.
- Brand colours colour the world. They do not replace it with a logo wall.
- If you cannot name the world in one line, the reel does not have one yet. Go back and choose.

## B. The through-line

One device that builds as the script advances: a tally that climbs, a stack that grows, a path with a marker moving along it, a board that fills, a gauge that rises. Name it next to the world in the storyboard.

- At least one shot in three carries it, visibly changed from the last time. It carries the argument, so when it moves, the script has just said something that changes the count.
- It never resets. At the end it shows the result, and the closing shot is the device in its final state.
- Its numbers come from the script or from `brand/facts.md`. A sample number gets a small "example" tag.

## C. Line to picture

When you write a shot card, find the kind of spoken line, then choose from its row. Two shots in a row never use the same object. The right-hand cells are suggestions; invent better ones from the reel's world.

| The line says | Print mode (flat, layered) | Depth mode (3D) | Talking mode (person on camera) |
|---|---|---|---|
| A number | huge figure counting up in a ticket stub | digits as chunky blocks that rise from the floor | figure punched in beside the shoulder, face stays |
| Before / after | one card torn along a seam, old on the left | same object, camera swings from the worn side to the clean side | split frame, same pose, light and framing change |
| A list of three | three tabs slide in one per stressed word | three plinths, camera steps along them | three fingers up, a word lands per finger |
| A warning | stamp slams, the card shakes, red edge | object tilts toward the lens, a shadow slides across it | lean in, music drops out, one word of text |
| A step | a path marker hops to the next stop | camera pushes through a doorway to the next room | hands do the step, captions number it |
| A comparison | two scales, the heavier side sinks | two objects side by side, one is lit and one is not | cut between two spots in the room, one per side |
| A quote | the words typed into a speech bubble, author tag below | quote engraved on a slab, light rakes across | the person pauses, quote appears over a tight crop |
| A price | label tag swings in, digits flip like a shop sign | coin or bill stack at true height, label on the side | hold up a card, price on it |
| A definition | word on a dictionary strip, the meaning draws under it | word as a standing sign, the meaning unfolds from behind it | a pointing hand to an underlined caption |
| A mistake | a tick box gets crossed, the page crumples | one block pulled from a tower, the tower wobbles | head shake and a hard cut to the fix |
| A result | the through-line device lands on its final state | camera pulls back to show the full build | a smile held a beat longer, device shown beside |
| An ask | one clean card with the action word and a hand pointing at it | the object turns to face the lens, the button glows | direct look, text on the lower third, no motion behind |

Rule of thumb: if two rows would get the same picture, the line is not specific enough yet. Rewrite the line, not the picture.

## D. The no-repeat rule

- Never the same card or layout for three shots running, and no single layout for more than a third of the reel. `kit lint` warns on both.
- The hero (the one thing the shot is about) is on screen and already moving from frame 0, including the first shot. No shot opens on an empty background and fills in.
- Adjacent shots differ in at least two of: layout, scale, direction of motion, light or dark ground.
- **The swap test.** Take any frame. Could it sit in another brand's reel and still make sense? If yes it is generic. Change the object, the sample content or the angle until the frame could only come from this reel. Run it on the first and last shot in particular.

## E. A detail standard

- **Believable content, not empty boxes.** Cards, lists, screens and tables hold sample content that fits the world: real-sounding names, plausible times, a believable receipt. No grey bars standing in for text. Keep one set of sample people and records for the whole reel so it feels like one place.
- **Honest samples.** A made-up figure gets an "example" tag and never contradicts `facts.md`. Real screens only come from the brand's own product or a public logged-out page (see `brand/library/screens/`).
- **Depth layers.** Three at least: something soft behind (light, grain, dust, a faint shape), the hero in the middle, a small annotation or foreground piece in front. A slow camera drift or push on every shot.
- **One thing moving in every shot.** If the hero is still, something else moves: a marker, a counter, a light, a hand. `kit pace` lists every stretch of about 1.5 seconds or more where almost nothing changes.
- **Use the library first.** Real product images, b-roll and components from `brand/library/` beat anything invented. Log what you used in the shot card.

## F. Rhythm

- Shot lengths vary. Mix a short hit (1.0 to 1.5 s) with longer holds (3 to 4.5 s). Never three shots of nearly the same length in a row. Nothing runs past about 5 s.
- Cut on a stressed word of the script, not between words. Check cut times against `build/word_index.txt`; `kit pace` flags cuts that land late.
- About a third of cuts are fast (a whip or a slide); the rest are plain cuts. Do not use a different transition for every cut.
- Motion rules: one dominant direction per shot, ease out on arrival (never a hard stop), and nothing travels the whole screen in under 6 frames. A re-hook (a change of ground, a zoom, a new device) near 4 s, 9 s and 15 s.
- Small text stays on screen long enough to be read at speaking pace, about 3 words a second at most.

## G. Colour with intent

- Give each colour a job and keep it: the accent marks what matters (the through-line, the key word), the ink carries text, the ground holds everything else. If the accent is on more than one thing per shot, nothing is marked.
- A warning colour (red or amber) appears for warnings only. If the brand accent is already red, mark warnings with shape (stamp, shake) instead.
- Two grounds per reel, light and dark, swapped on big beats, so numbers and reveals pop. Text keeps at least 4.5:1 contrast on its ground.
- Photos and library images get the brand's tone: tint them or sit them on a brand-coloured card rather than leaving a stray palette in frame.

## Order of work

1. Read the approved script and mark each line with its kind from table C (a number, a step, a mistake and so on). Write the kind beside the line.
2. Choose the world and the through-line so that most of the lines can be shown with them.
3. Fill the shot cards: for each, one object from the row, the word that triggers the move, what keeps moving, the camera.
4. Run the swap test and the repeat check on the cards, before anything is built.
5. Pull library items for any shot that wants a real product, screen or clip. Note the file name on the card.
6. After the build, run the four gates and fix what they flag. A warning is not a veto, but explain why you kept it in the plan.

## What the gates look at

| Gate | What it flags |
|---|---|
| `kit pace` | reads the rendered draft and lists every stretch where almost nothing changes (about 1.5 s or more), with the words spoken there, against the mode's movement bar |
| `kit effort` | whether the reel was built for its own script: the amount of its own scene code and its own prop makers per second, against how much leans on the mode's ready-made props |
| `kit lint` | shot grammar: shot length (1 to 5 s), how long a face stays on screen, the same layout twice in a row, cuts that fall in the middle of a word, three shots of the same length in a row, no movement in the first second, one prop carrying three shots. It needs shot data, so print reels print "nothing checked" until the print page publishes its shots |
| `kit qa` | the finished file: size and format, loudness and peak, black or frozen stretches, and whether the first word lines up with the first sound. The text-size and safe-area check is skipped until the render writes text boxes, so check those by eye in `/reel-review` |
| `kit measure` and `kit predict` | facts about the video (cuts, pauses, loudness, still stretches, contact sheets). With a calibrated model, `predict` adds a watch-time and skip-rate estimate; without one it says so and gives no estimate |
| `kit facts` | the mechanical half of the fact check: digits not in `facts.md`, rows without a source or cleared date, clearances older than 30 days, leftover `{{needs cleared fact}}`, absolute wording (only, never, best, faster ...). It cannot tell if a source is true: `/reel-factcheck` re-reads the sources for that, and `kit gate` needs its PASS at Gates A and C |
| `kit gate` | records each approval and, at Gate C, the final file's fingerprint, so a change after approval shows up |

## H. Worked example (invented, for shape only)

Script idea: "Three reasons a quote gets ignored." Brand: a small roofing company.

- **World:** a clipboard on a truck bonnet, drawn flat with a soft shadow.
- **Through-line:** a stack of paper quotes on the clipboard that grows one sheet per reason, with the top sheet going from blank to stamped.
- **Shot 1 (0.0 to 1.6 s):** the clipboard is already sliding in with the first sheet. The hook line sits in the caption band. Hero moving from frame 0.
- **Shot 2 (list of three):** three tabs on the sheet edge, one slides out per stressed word. The stack grows by one.
- **Shot 3 (a number):** a ticket stub with the figure counting up. Only if the figure is in `facts.md`; otherwise the line is rewritten without it.
- **Shot 4 (a mistake):** a tick box on the top sheet is crossed, the sheet crumples. The stack keeps the crumpled sheet, so the device has changed.
- **Shot 5 (a result):** camera pulls back, the final sheet is stamped, the stack is fully built.
- **Shot 6 (an ask):** one clean card, the save prompt, nothing else moving except the glow on the button.

Check: six shots, the stack in five of them, no layout twice running, lengths 1.6 / 2.4 / 3.1 / 1.2 / 3.8 / 2.0 s, one moving thing per shot.

## I. Common failures and the fix

- **One card, six times.** A single text card re-used for each point. Fix: go back to table C, pick a different object for each line type.
- **The empty frame at the start.** The first 10 frames show a background while things fade in. Fix: start with the hero partway through its move.
- **Decoration, not meaning.** Floating shapes with no link to the words. Fix: delete them, or tie each to a word in the script.
- **Skeleton screens.** Grey bars where text should be. Fix: write believable sample content, or use a real screenshot from the library.
- **Metronome cuts.** Every shot lasts 2.5 s. Fix: shorten two, lengthen one, and re-cut on stressed words.
- **Everything is the accent colour.** Fix: pick the one thing that matters in that shot and mute the rest.
- **Invented proof.** A sample number that sounds like a result. Fix: tag it as an example or remove it.

## J. Per-mode notes

- **Print:** flat layered paper-like pieces. Depth comes from shadow, overlap and parallax, so lay pieces in at least three planes. Props are drawn, so keep them to the world.
- **Depth (3D):** objects are lit and the camera moves. Vary the camera view (low, high, side, close) and never hold the same wide view twice. Text stays flat on a plane in front of the object, never baked into the 3D shape.
- **Talking:** the person is the hero. Overlays are short and sit in the lower thirds or beside the shoulder, and a cutaway shot never runs longer than the point it makes. Do not cover the face for long stretches.

## Storyboard checklist (paste into the concept card)

```
World:
Through-line device:
Shots carrying it (count, at least a third):
Hook shot moving on frame 0: yes / no
Swap test passed on first and last shot: yes / no
Library items used (file names):
Colour jobs (accent / ink / ground / warning):
```

## Before you hand over

Walk the storyboard once: world named, through-line named and in at least a third of shots, no layout three times running, hero moving on frame 0, every shot has one moving thing, cuts on stressed words, colours with jobs. Then run `kit pace`, `kit effort`, `kit lint` and, on the render, `kit qa`.
