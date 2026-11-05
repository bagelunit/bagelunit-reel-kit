# Craft for 3D reels

The 3D companion of `playbook/ideas.md`. Read it before the concept card of any `depth` reel, and paste section 2 into every shot builder's brief.

**The trap.** Each 3D mode ships with stock parts (sets, gadgets, people, signs) in `modes/<mode>/parts/`. They are backdrop and building blocks. A reel assembled only from them comes out correct and flat: a lone model in a void, the same effect repeated, ideas pasted on as paper cards. The job is to invent a **world** for this script, in new code.

---

## 1 · How a `depth` explainer holds attention

1. **One world, several scales.** Pick one place and travel through 3–5 sizes of it: inside the object → hand-sized → room or street → city or planet. The jump between sizes is the most reliable "wow" you have.
2. **The invisible thing gets a substance and one colour.** Data becomes glass capsules, heat becomes amber haze, attention becomes light, money becomes coins in a tube. Pick it once, introduce it on the word that names it, and keep it for the whole reel. Failure or absence gets a second colour.
3. **Abstractions get a body.** "History" can be translucent copies of the scene stacked behind it, "time" a stack of blocks whose height is minutes, "a decision" a fork in a rail track with a switch you can see flip.
4. **Agents do the work.** Not arrows: a courier carries the packet, cars actually brake, drops actually land. Each agent acts on a word.
5. **X-ray and exploded views.** Shells turn to glass, lids lift off, layers rise apart so the mechanism is visible.
6. **Contrast pairs** carry the hook and the catch: works vs fails, before vs after, alone vs many.
7. **New idea, new grammar.** When the explanation changes level (real → inside, now → future, our view → the machine's view), change the light and the visual language with it.
8. **Ride the token.** The camera travels with the thing that moves, from start to destination.
9. **Count, stack, reframe.** Numbers roll on the word; the last beat restates the idea in the widest shot with a change of light.

**Camera:** wide (where are we) → close (how it works) → wide (how big it is), repeated inside each explanation. A camera key every 0.7–1.4 s, 2–5 framings per beat, and the camera never parks (it drifts on holds). Location jumps hide inside a burst, an iris or a whip.

**Light:** every beat sets a mood (an empty bright hall for "alone", dusk lamps for the payoff, a dark veil for abstract layers). Keep plain whites just under the bloom threshold so only meaningful emitters glow. Impacts get anticipation, a slam, a flex, a shake and a flash. Depth of field and contact shadows sell scale on small props.

---

## 2 · From "how it works" to a world (the method)

Fill this block at the top of `STORYBOARD.md` before any code:

```
WORLD (top of STORYBOARD.md)
chain       : verb → verb → verb → verb            (3–6 steps; each becomes a beat)
substance   : <what flows> = <how it looks>, colour <x>; failure = colour <y>
place       : <where>; sizes: <inside> ↔ <hand> ↔ <street/city>   (jumps on "<word>", "<word>")
agents      : <who carries it>, acting on <words>
contrast    : <works> vs <fails> (hook) · <the catch>
level shifts: "<word>": real → inside / future / machine view, light: <mood>
wows        : "<word>" size jump · "<word>" one → thousands · "<word>" transformation
new props   : buildA (moves) · buildB (moves) · buildC (moves) …   stock parts used only as backdrop: <list>
```

Steps:
1. **Write the mechanism as 3–6 verbs** (who does what to what).
2. **Name the hidden quantity** and give it a substance and one colour, plus a failure colour.
3. **Choose the place and its sizes.** Where would this happen if you could shrink or fly? Mark which words jump sizes.
4. **Cast the agents** and give each one a word.
5. **Find the contrast pair** for the hook and for the catch.
6. **Mark the level shifts,** each with its own light.
7. **Plan one wow every 10–15 s** and name the exact word it lands on.
8. **Plan the camera** per section: wide → close → wide, a key per stressed word.
9. **List the props you'll build** (at least 3 heroes, usually 8–15 builders in total) with their motion hooks, e.g. `open(k)`, `fill(k)`, `split(k)`, `stack(k)`.
10. **Generic check:** could this frame belong to another reel? Is a stock part carrying the idea? Is anything a diagram floating in a void instead of a place? If yes, go back to step 2.

---

## 3 · Worked worlds (method only: never reuse these)

**depth · "Why airport water costs $5."** Chain: you pass security → the gate area is sealed → shops pay rent per passenger → prices rise to match. Substance: footfall as a stream of tiny glowing dots, colour amber; empty space grey. Place: a cutaway terminal; sizes: one bottle on a shelf ↔ the gate lounge ↔ the whole airport from above. Wow on "sealed": the camera pulls up and a glass dome closes over the gate area. Wow on "per passenger": the stream of dots pours into the shop and its price tag climbs with every dot.

**depth · "How a phone knows it's in your pocket."** Chain: light falls → the proximity sensor sees dark → the screen sleeps → a touch is ignored. Substance: light as soft white rays, darkness as violet; a missed touch red. Place: inside the phone's top edge ↔ the phone ↔ a person walking. Wow on "dark": the camera dives into the sensor and the rays go out one by one.

**depth · "How noise-cancelling works."** Avoid the obvious wave-lines-in-a-void. Chain: sound arrives → mics catch it → the chip builds a mirror wave → the two cancel → silence. Substance: sound as ripples on a pond surface inside the ear cup (blue); the mirror wave orange; silence as perfectly still water. Wow on "cancel": the two ripple sets meet and the water goes glassy, reflecting the listener's face.

---

## 4 · The effort budget

| Measure | Strong | Accept |
|---|---|---|
| Beat length | 4–6 s | 2–8 s |
| Your own shot code | 50–80 lines per second of video | ≥ 35 |
| Helpers written for this reel | 2.5–6 per second | ≥ 1.5 |
| Named builders (props, effects, sets) | 20–45 | 8–15 |
| Camera | a key every 0.7–1.4 s | |
| Wows | one per 10–15 s | |

`kit effort` checks the code numbers and `kit pace` the motion; both must pass before the final. Stock parts may appear at most once each, and only when the script is literally about them. Backdrop sets (streets, shops, cities) are fine.

---

## 5 · Five questions before code

1. Can you say the central visual in one sentence that names a place and a substance ("a sealed glass dome over the gate, with footfall pouring into the shop")?
2. Is there a size jump, and on which word?
3. Does every verb of the mechanism have an agent that performs it on screen?
4. Which 3+ props are you building from scratch, and which stock parts are only backdrop?
5. Put a still of yours next to the mode's reference frames: is it as full, as lit and as specific to this script? If it could belong to any reel, invent again.

---

## 6 · The worlds the kit already gives you (use them as stages, not as ideas)

**depth** ships lit rooms (`parts/rooms.js`): shop, board, desk, monitor, machine, mapTable, street, calendar, tanks and the workbench, each with named camera views, a light preset and a `frame()`. Bix is the host (`parts/buddy.js`, outfit and colours in `k.LOOK`), and small recoloured Bixes (`k.crowd`) are customers or a team. The finish (depth of field, soft bloom on lamps and screens, grain) is automatic.

**The rule:** the room or the table is WHERE the idea happens. The idea itself is a prop or a gag you build for this script. A reel that is only "Bix stands in the shop, then Bix stands at the desk" has a stage and no play.

---

## 7 · Hooks in 3D (the first 1.5 s)

3D hooks are slower to read than flat ones, so they need one bold, simple action.

| Shape | In a depth reel |
|---|---|
| **Caught in the act** | the camera is already pushing in on Bix as he slams a stamp on an invoice |
| **Scale shock** | one tiny object, then a hard pull back reveals thousands of them |
| **Before it breaks** | a machine already overheating, a gauge in the red, steam on the word |
| **The impossible fact** | a number rolling on a wall screen behind Bix, landing on the word |

Rules: the hero object is big in frame (40–60 % of the height) at frame 0; one action, not three; the stressed word lands with a visible physical change (a slam, a drop, a light coming on).

---

## 8 · Breaking down a 3D reel you admire

Same method as `ideas.md` section 7, with three extra columns:

```
#  | time    | words (CAPS = stressed) | job   | device              | set / room       | camera move          | light / mood
1  | 0–2.4   | the pizza is FIVE minutes AWAY | hook | caught in the act | street (dusk)    | low push on Bix      | warm lamps, wet road
2  | 2.4–6.8 | it LEFT the oven at …   | setup | ride the token      | workbench → map  | follow the box, crane up | kitchen orange → map cool
…
```

Look hardest at three things in the reel you're studying: how often the camera changes framing (every 0.7–1.4 s), where the size jumps are, and which single object the camera rides.

---

## 9 · Two whole 3D reels, beat by beat (method only: never reuse these props)

**A · depth · "How a pizza reaches you in 20 minutes" (35 s).** Chain: order lands → oven fires → rider picks up → route is solved → doorbell. Substance: the order as a glowing paper ticket (warm yellow); a delay as a red clock.
- *Hook (0–3 s):* street at dusk, a pizza box on a doorstep with a timer badge rolling down from 20:00 to 0:00 on "twenty"; Bix opens the door, grinning.
- *Beat 2 (3–10 s):* rewind. Workbench room: a ticket slides out of a printer on "order", Bix slaps it onto a rail; the camera rides the ticket along the rail into a brick oven glowing orange.
- *Beat 3 (10–18 s):* mapTable from above: the box becomes a token; three possible routes draw; two turn red with tiny traffic jams on "traffic", one stays yellow and the token runs it.
- *Beat 4 (18–28 s):* monitor room: a light dashboard with four tiles (ordered, baked, out, delivered) ticking on their words; the last tile flips on "doorbell".
- *Ask (28–35 s):* back to the doorstep, the comment box CTA with keyword PIZZA.
- Size jumps: ticket ↔ kitchen ↔ whole town. Wow on "solved": the map lifts off the table in layers.

**B · depth · "Why your inbox never feels empty" (30 s).** Chain: mail arrives → you answer → answers create replies → the pile grows. Substance: emails as paper envelopes (cream); replies as orange envelopes.
- *Hook:* desk at night, Bix answers one envelope and two orange ones pop out of the laptop on "two".
- *Beat 2:* tanks room: envelopes pour into a glass tank labelled INBOX; every answer pipes two envelopes back in. The level rises on each stressed word.
- *Turn:* "batch them" — a valve with two notches closes; the tank stops filling.
- *Payoff:* the tank drains into one tray on "eleven", again on "four"; Bix leans back.
- *Ask:* keyword INBOX.

---

## 10 · Directing the host in 3D

- **Bix (depth):** in most shots, acting on a word: pressing the button that starts the machine, pointing at the dashboard tile that just changed, stepping back when something explodes. In a wide shot he can be small at the edge (a peek), in a close shot he holds the frame with the prop. Give him a prop that fits the script (an apron in a kitchen, a headset in support) through `k.LOOK`.
- **Never let the host hide the idea.** If the host covers the hero object, move the camera, not the prop.

---

## 11 · Camera and light recipes

| Moment | depth camera | light |
|---|---|---|
| hook | low push-in on the hero, 1.0 → 1.15 scale | warm practical lamps on |
| explaining a mechanism | close, slow drift sideways | neutral, readable |
| size jump | hard pull back or crane up on the word | the light changes with the scale (kitchen orange → map cool) |
| problem | slight Dutch tilt, tighter | cooler fill, one red accent |
| payoff | slow orbit, wide | warm, brighter |
| ask | locked-off, centred | evenly lit so the keyword reads |

Keep plain white surfaces under the bloom threshold so only lamps, neon and screens glow. Signs and labels never sit in the top 330 px (that's where the taped title and the caption tiles live).

---

## 12 · What makes a 3D reel look cheap

| Looks cheap | Do this instead |
|---|---|
| the host standing in an empty room for a whole beat | the host acting on a prop built for the script |
| a diagram floating in a void | the diagram painted on a wall screen, a map table or a blackboard inside a room |
| the same camera angle for 4 s | a new framing on each stressed word |
| tiny objects in a wide shot | push in so the hero fills 40–60 % of the frame |
| everything evenly lit | one key light and one meaningful emitter per shot |
| a label covering the room's own sign | titles and labels in their bands, signs below them |
| dark screens with dark text | light screens with dark ink, or bright text at ≥ 40 px |
| ten small props of equal weight | one hero, three to five supporting props idling |

---

## 13 · Short 3D reels (10–30 s)

- **10–15 s:** one room or one table spot, two or three framings, one wow on the stressed word, the ask folded into the last line.
- **20–30 s:** two or three rooms (or two table spots), one size jump, one wow, the comment box CTA.
- GPU renders are slow: plan short reels with fewer, stronger shots rather than many quick ones.

---

## 14 · From the line's relation to a library shot

Start from a example shots shot when the relation matches, then re-dress it (new words, new labels, new props for this script). Never ship one unchanged.

**depth (`modes/depth/examples/SHOTS.md`, 25 shots):**

| The line is about… | Start from |
|---|---|
| a brief, an input, "tell it X" | `b01-board-brief` |
| finding and picking the best few | `b02-map-picks`, `b13-crater-lock` |
| a machine that turns input into output | `b03-machine-out` |
| live numbers, a dashboard | `b04-dashboard`, `b18-past-slabs` |
| a pipeline, stages, flow | `b05-tanks-flow`, `b19-queue-ripple` |
| scheduling, booking, time | `b06-calendar` |
| waking up, turning on, the first tap | `b09-wake-tap` |
| opening up how something works inside | `b10-lid-lift`, `b11-one-then-all` |
| pulling, attracting, gathering | `b12-pull-lines` |
| many small signals or events | `b14-rain-pings`, `b17-car-pings`, `b22-beacon-rings` |
| following, subscribing, the ask | `b15-follow-card` and the starter's storefront ask |
| a route, steps across a place | `b16-route-tiles` |
| a network, things talking to each other | `b20-glow-network` |
| adding up, stacking to a total | `b21-stack-tower` |
| privacy, sealing, sending safely | `b23-sealed-note` |
| one becomes millions, scale | `b24-pull-back` |
| finding something exactly | `b25-close-in` |

---

## 15 · More worked worlds (method only)

**depth · "Why your phone battery dies faster in the cold."** Chain: cold slows the chemistry → fewer ions move → voltage sags → the phone shuts down early. Substance: ions as small copper beads; a stall as blue frost. Place: the workbench with a phone opened like a book ↔ a glass cell the size of a room ↔ a snowy street. Wow on "fewer": the camera dives into the cell and the beads slow to a crawl as frost creeps over the glass.

**depth · "How a group chat decides where to eat."** Chain: someone suggests → three people react → nobody commits → the loudest wins. Substance: opinions as coloured paper cards; indecision as grey fog. Place: a monitor room with a big chat on the screen ↔ a map table of the town with restaurant pins. Wow on "loudest": one card grows until it fills the screen and the map pin it names lights up.

---

## 16 · Common mistakes in 3D reels (and the fix)

1. **A set with no action.** Every shot needs one thing that moves because of a word.
2. **The camera sits still.** Drift on every hold; a new framing on every stressed word.
3. **Two wows in one beat.** Spread them, one per 10–15 s.
4. **Text too small inside the 3D scene.** Readable text goes in the overlay (titles, tiles, counters), or on big signs pushed close.
5. **Bix missing for three shots.** Bring the host back, even as a peek.
6. **Blown-out highlights.** Lamps and screens may glow; white cards and paper must not.
7. **Slow renders blamed on the GPU.** Fewer, longer shots render faster than many short ones with heavy sets.
