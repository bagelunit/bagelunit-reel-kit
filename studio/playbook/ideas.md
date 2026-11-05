# Craft for flat reels (print, talking graphics)

Read this before you write the concept card in `STORYBOARD.md`. It teaches how a sentence turns into a moving object. It does not hand you props: the examples here are worked once and never reused. Your script gets its own.

---

## 1 · The bar, in numbers

What a strong 35–60 s print reel looks like when you measure it. `kit pace` and `kit effort` check the important ones. The per-second numbers hold for short reels too (10–30 s); only the shot count shrinks (`writing.md`, "Short reels").

| Measure | Strong | Accept | Too thin |
|---|---|---|---|
| Shot length | 2.5–4.5 s | 2–6 s | > 7 s |
| Custom shot code | 60–100 lines per second of video | ≥ 40 (the effort gate's bar) | < 30 |
| Helpers written for this reel (draw/motion functions) | 3–5 per second | ≥ 2.5 (the effort gate's bar) | < 1.5 |
| Word-cued moments | 2.5–3 per second | ≥ 2 | < 1 |
| Visible events | 5–7 per second | ≥ 3 | < 2 |
| Big moments (a large part of the frame changes) | 0.7–1.2 per second | ≥ 0.6 | < 0.4 |
| Camera punches | one per shot | one per shot | several per shot |
| Objects on stage by second 3 of a shot | 4–6 | ≥ 3 | 1 |
| Frames with visible change (0.1 s steps) | 98 % | ≥ 95 % | < 90 % |
| Host acts (gesture, face, gaze) | about 2 per second | ≥ 1 per phrase | one pose per shot |
| Sound cues | one per meaningful event, about one per 1–1.5 s | | bursts of three in a row |

---

## 2 · Twelve moves that make a flat reel feel expensive

1. **Open mid-action.** At 0.0 s the problem's everyday object is already on screen and doing something: a terminal mid-print, a phone mid-buzz, a receipt mid-feed. No fade-in, no title card.
2. **The hook verb is a physical change.** In "Stop paying for tools you never open", the subscription cards start sliding on "paying" and the unopened app icons grey out one by one on "never".
3. **Build, push, break.** Inside a shot, something speeds up or piles up (a meter fills, items stack, a queue grows) and the punch word breaks it: a crack, a freeze, a stamp, a snap. That break gets the shot's one camera punch.
4. **Lists are slots.** Say "five steps" and draw five empty slots with a counter (0/5). Each item fills its slot on its own word, and each one arrives in a different way (dropped, typed, poured, stamped, plugged in).
5. **Problem and answer live in different worlds.** The problem side is cramped, red, chaotic, heavy. The answer side is ordered and powered. Flip between them on the turn word ("Instead…", "Now…"), with a wipe or a power-on.
6. **Numbers ride objects.** A price tag flips, a counter rolls on an odometer, a receipt total prints. Let it land on the spoken number, then send it into a running total in the corner.
7. **Draw the thing you're saying no to.** "Not by an AI video model": first show the model's prompt box, then strike it out and stamp it. A red X over nothing says nothing.
8. **Time is an object.** Calendar pages tear one per stressed word, a clock rolls through the night, a day counter stamps empty days.
9. **Real artifacts first, invented machines second.** Most props should be real objects from the script's world (the terminal, the receipt, the comment sheet, the dashboard). Invent a machine only for abstract verbs, and give it a visible limit.
10. **Texture of reality.** Tiny mono labels (`// status`, `step 2/5`), timestamps that count, IDs, masked handles, real numbers from the brief. They make a drawing feel like a screenshot of a world.
11. **The host reacts every phrase** (print). It points by default, re-aims with the focus, jabs on list items, gasps on money, covers its mouth on a fear, and gives a thumbs-up on the CTA.
12. **The CTA is an object, not a sentence.** A comment sheet rises, the keyword types in and posts as a big pill, replies stack up, then a DM arrives carrying what was promised. Hold the last frame.

---

## 3 · Inventing the visual for a line

Do this on paper, per beat, before any code.

1. **Name the relation, not the topic.** Is the sentence about overload, leaking, blocking, choosing, piling up, comparing, unlocking, turning chaos into order, or something waiting?
2. **Look for the literal object first.** Does the script's world already contain something that shows that relation (an inbox, an invoice, a timeline, a code window)? Use it and make it physical: it slams, prints, tears, overflows.
3. **For abstract lines, pick a machine with a limit.** A dam can overflow, a fuse can blow, a queue can jam, a scale can tip, a battery can drain. The limit is where the punch word lands.
4. **Give every stressed word its own state.** Write the list: word → state (appears, rises, maxes, breaks, freezes, snaps back, lights up). If two words would do the same thing, the idea is too thin: pick another.
5. **Label it for silent viewers.** One small mono label turns a machine into a sentence (`// focus`, `your weekend`, `budget left`).
6. **Give each part an idle.** What does it do when nothing is happening? It drips, ticks, flickers or scrolls.
7. **Plan its exit.** Does it morph into the next shot's object, get absorbed, or fall away?
8. **Uniqueness check.** If the prop exists in another reel or in a kit and this script doesn't literally name it, it's a costume. Invent again.

### Worked examples (method only: never reuse these props)

| Line | Relation | Visual | Per stressed word |
|---|---|---|---|
| "Airports are expensive because you can't leave." | trapped buyer | a departures board and two shop price tags behind a gate | airports: board flaps cascade · expensive: tags flip $4 → $19, the frame thuds · leave: the gate arm drops shut |
| "Casinos have no clocks for a reason." | hiding time | a casino façade whose wall clock pops off | casinos: façade builds up · no clocks: the clock pops off and is struck through · reason: the door's lights chase inward |
| "My reels got 72K, 42K and 36K views." | proof, three times | three phones playing the real reels, each with a counter | each number: its counter rolls and lands on the word, a crowd cheers in |
| "If you price by the hour, getting faster makes you poorer." | effort vs pay inverted | a stopwatch wired to a coin slot | hour: the slot pays per tick · faster: the stopwatch speeds up, coins slow to a trickle · poorer: the slot jams, a "−$" chip flies off |
| "Your phone knows you're tired before you do." | hidden signal | a sleep meter glowing behind the lock screen | phone: screen lights · tired: the meter dips red under the wallpaper · before you do: the user's face still smiles, a step behind |
| "Most notes apps fail because capture is slower than forgetting." | race | two runners on a track: a thought and a sticky note | notes apps: the note runner trips on menus · capture: it fumbles a keyboard · forgetting: the thought crosses the finish and vanishes |
| "Batch your emails at 11 and 4." | order from chaos | a mail slot that only opens at two times on a dial | batch: letters pile behind the slot · 11: the dial hits 11, the slot opens, letters pour into one tray · 4: same again, the tray empties |
| "One good thumbnail beats ten average ones." | quality vs quantity | a wall of grey tiles, one tile lifts with real colour | ten: tiles pop in grey · one: a single tile lifts and gains colour · beats: an outline wave runs from it across the grey tiles |

---

## 4 · What makes a reel look like a template

| Looks templated | Do this instead |
|---|---|
| The same prop family every reel (a gauge, a meter, because the kit has one) | a prop from this sentence's relation; kit props only when the script names them |
| One object alone in empty space for a whole shot | 3–6 objects by second 3, one focus, the rest idling |
| Everything pops in with the same spring on a grid | timing follows the voice: slams on stressed words, idles in between, staggers of 0.05–0.09 s in lists |
| The caption does the work ("COST ↑" written on a card) | the word becomes an object's state; captions only repeat the voice |
| A number typed as plain text | a number that rolls on an object and lands on the word |
| The old object vanishes and a new one pops in centred | the old one steps aside or turns into the new one |
| The stage freezes after the event | every landed thing keeps idling |
| A host stuck in one pose | a new act every phrase, aim follows the focus |
| Problem and answer look the same | change the world on the turn word |
| A CTA card with the keyword as plain text | the keyword is typed, posted, multiplies, and a DM delivers |
| Clutter mistaken for density | full stage, one loud focus; must-read text ≥ 40 px, held ≥ 0.4 s |
| Made-up stats, real people's names, fake view counts | real numbers from the brief, masked handles, relative bars when no number exists |

---

## 5 · Seven questions per beat, before code

1. What's the relation, and which real object or invented machine shows it, with a limit?
2. Which state does each stressed word trigger? All different?
3. What's already on stage, and what does each thing do while idle?
4. Which word gets the break and the camera punch?
5. Where does the host point on each phrase, and what does it do?
6. How does the stage leave, and what does the next shot start with?
7. Is any prop borrowed without the script naming it? If so, invent again.

---

## 6 · Building the hook (the first 1.5 s)

Most viewers decide in the first second and a half. The hook is a sentence AND a picture, and they have to land together.

**The four hook shapes that work for explainers** (pick one per reel, don't stack them):

| Shape | Sentence pattern | The picture at 0.0 s |
|---|---|---|
| **The hidden cost** | "Your gym is betting you won't show up." | the everyday object, already caught in the act: a member tag that says "last visit: 47 days ago" |
| **The flip** | "Getting faster is making you poorer." | the expected thing, then its reverse on the stressed word: a stopwatch speeds up while a coin slot slows down |
| **The number** | "250,000 views in 7 days, from one folder." | the number already rolling on a real object (a counter on a phone, a dashboard tile) |
| **The direct order** | "Stop paying for apps you never open." | the verb happening: cards slide out of a wallet on "paying", icons grey out on "never" |

**Rules for the hook line:**
1. 7–12 words. One idea. No "In this video…", no "Did you know…", no greeting.
2. The stressed word lands before 1.2 s, and something on screen changes ON it.
3. Concrete nouns beat categories: "your gym" beats "subscription businesses".
4. A small gap the viewer needs closed ("…for a reason.", "…before you do.") keeps them for the next line.
5. The first frame is never empty and never a title card. Something is already moving at frame 0.

**Hook drill.** Write five hook lines for the same script, one per shape plus a wild card. Read each out loud at reel speed. Keep the one where the picture is obvious the moment you hear it. If you can't say what's on screen at 0.0 s, the hook isn't finished.

**Worked hooks (method only):**

| Topic | Weak | Strong | Frame 0 |
|---|---|---|---|
| gym memberships | "Let's talk about how gyms make money." | "Your gym is betting you won't show up." | a member tag stamped NO-SHOW at a front desk |
| airport prices | "Airport food is expensive, here's why." | "That $5 water is a ticket you can't refuse." | a price tag flipping from $1 to $5 behind a gate arm |
| freelancing | "Hourly pricing has some downsides." | "The faster you work, the less you earn." | a stopwatch wired to a coin slot, coins slowing |
| note apps | "Note apps can be hard to use." | "You forget it before your notes app opens." | a thought bubble popping while a loading spinner turns |

---

## 7 · Breaking down a reel you admire (the method)

When the buyer sends a reel they like ("make one like this"), don't copy its pictures. Copy its **shape**. Do this before writing a single shot:

1. **Get the words.** Transcribe it (`take.py` or any transcript) and split it into sentences.
2. **Time the beats.** For each sentence write start → end in seconds. Note where the cuts fall and how long the longest hold is.
3. **Name each beat's job.** Hook · setup · proof · turn · payoff · ask. Most good 40 s reels run hook (1 line) → setup (2–3 lines) → turn (1 line) → proof or payoff (2–3 lines) → ask (1 line).
4. **Name each beat's device, not its prop.** "A list filling slots", "a number rolling on an object", "problem world flips to answer world", "a machine with a limit that breaks on the punch word". Devices are reusable; props aren't.
5. **Count the events.** Over 5 s of the reel, how many separate things change? That's the density to match (section 1).
6. **Mark the big moments.** Where does a large part of the frame change at once? Those are where your camera punches go.
7. **Write your own beat table** with the same jobs and devices but YOUR script's objects.

**Beat table (copy into `STORYBOARD.md`):**

```
#  | time      | words (stressed in CAPS)        | job     | device                    | our object                         | big moment?
1  | 0.0–2.1   | your gym is BETTING you WON'T…  | hook    | real artifact caught      | member tag + NO-SHOW stamp         | stamp
2  | 2.1–5.4   | it SELLS way more MEMBERSHIPS   | setup   | pile-up past a limit      | key tags piling over 4 treadmills  | —
3  | 5.4–7.6   | if EVERYONE came, it'd BREAK    | turn    | build, push, break        | crowd floods, sign flips to FULL   | crack
4  | 7.6–9.9   | the NO-SHOWS pay for the REGULARS | payoff | flow from A to B          | ghost tags drop coins into AUTOPAY | —
5  | 9.9–11.4  | comment GYM …                   | ask     | CTA as an object          | comment sheet, keyword posts, DM   | post
```

---

## 8 · Three whole reels, beat by beat (method only: never reuse these props)

**A · "Why airport water costs $5" (print, 40 s).** Relation: a sealed market.
- *Hook (0–3 s):* a water bottle with a $1 tag sits behind a gate arm; on "five" the tag flips to $5 and the gate arm drops. Host gasps.
- *Setup (3–14 s):* a cutaway of the terminal as three paper layers: landside, security, airside. "Once you pass security" — a passenger token slides through the scanner and the scanner closes behind it. "You can't leave" — the exit door gets a big paper padlock.
- *Turn (14–20 s):* "So shops pay rent per passenger" — a turnstile counter rolls on an odometer as tokens pass; each tick drops a coin into a landlord's jar.
- *Payoff (20–33 s):* the jar's level drives the price tag: three products (water, coffee, sandwich) each flip their price on their own word. A versus card: CITY $1 · AIRPORT $5, airport wins in the worst way, struck through in red.
- *Ask (33–40 s):* comment sheet, keyword WATER types and posts, a DM card with "the 3 tricks to pay city prices".

**B · "Your notes app is too slow to beat forgetting" (print, 30 s).** Relation: a race.
- *Hook:* a thought bubble floats up from the host; a phone beside it shows a loading spinner. On "forget" the bubble pops before the spinner finishes.
- *Setup:* a race track drawn on the paper: lane 1 a thought, lane 2 a sticky note. The note trips over three hurdles that are real UI steps (unlock, find app, new note), each a different gag (a keypad, a search bar, a blank page).
- *Turn:* "Capture has to be faster than forgetting" — the track shortens to one step; a single hotkey card slams down.
- *Payoff:* replay the race; the note wins by a hair, a seal stamps "CAUGHT".
- *Ask:* keyword NOTE.

**C · "Batch your email at 11 and 4" (print, 15 s, short).** Relation: chaos into order.
- *Hook:* letters pour through a mail slot nonstop; a focus meter drains.
- *Turn:* a dial with only two notches, 11 and 4; the slot shuts.
- *Payoff:* on "11" the slot opens and every letter lands in one tray; the meter refills. On "4", same again, faster.
- *Ask:* keyword INBOX, folded into the last line.

---

## 9 · The shape of a whole reel

**Where the big moments go.** One in the hook (within 1.5 s), one on the turn, one on the payoff, one on the ask. In between, smaller events every 0.5–1 s keep the frame alive.

**Energy curve.** Start high (the hook), dip slightly for setup (more reading, calmer moves), rise into the turn, peak on the payoff, then settle into a clean, readable ask. A flat curve feels like a slideshow; a curve that peaks at the hook and never again feels like a trailer with nothing behind it.

**Worlds per reel.** Two worlds work well: the problem world (cramped, heavier, more red or ink) and the answer world (ordered, more white space, the accent used as light). Flip on the turn word with the sweep transition.

**Continuity.** Pick one object that travels the whole reel (a member tag, a passenger token, a coin). It appears in the hook, gets transformed in the middle, and arrives somewhere in the payoff. Viewers follow objects better than they follow sentences.

---

## 10 · Directing the host (print)

- **Every phrase gets an act.** Point at the newest thing, present an open palm at a card, lean in on a secret, shrug on a "no", thumbs-up on a win. Never two identical gestures back to back.
- **The host looks where the viewer should look.** Aim at the object that just changed, not at the caption.
- **Faces carry the turn.** Calm on setup, worry or shock on the problem, a grin on the payoff, a wink on the ask.
- **Keep it off the words.** The host moves between its left, right and peek spots so it never covers card text (the stage checks this, but plan for it: leave a slot free).
- **One big host moment per reel** at most: a lean that fills the frame on the punch line, or a peek from the edge on a secret. More than one and it stops being special.

---

## 11 · The ask (CTA) patterns

| Pattern | When | How it moves |
|---|---|---|
| **Comment sheet** | default | the sheet rises, the keyword types in letter by letter and posts as a big pill, replies stack, a DM card lands with what was promised |
| **Folded into the last line** | short reels (10–20 s) | the payoff object turns into the keyword: the last stamp reads the keyword, then the DM card slides in |
| **The callback** | when a continuity object exists | the object from the hook comes back and delivers the DM (the passenger token walks into an inbox) |

Always: say exactly what they get ("my cancel checklist", "the 3 tricks"), hold the final frame for at least 0.6 s, and keep the keyword huge and readable on mute.

---

## 12 · Short reels (10–30 s)

- **10–15 s:** hook → one turn → ask. 3–5 shots, 40–48 words. One continuity object. The ask can be the last line, not a separate beat.
- **20–30 s:** hook → setup → turn → payoff → ask. 5–8 shots, 80–110 words.
- Density per second stays the same as a long reel; only the number of shots drops. Don't slow down to "fill" a short reel and don't cram a long script into it: cut lines until each beat has room for its one big moment.
- The hook matters even more: a 12 s reel has no second chance.

---

## 13 · From the line's relation to a library shot

The print examples (`modes/print/examples/SHOTS.md`) are 5 worked scenes, 8 props with a showcase reel that plays them, and one full reel (casinos). When a line's relation matches one, start from its technique and re-dress it for your script (new labels, new numbers, new objects). Never ship one unchanged.

| The line is about… | Start from | Re-dress it as |
|---|---|---|
| something slipping away, then the fix | `p04_hook` | what leaks (skills, time, money) falling out of its slots, frozen mid-air when the fix lands |
| old way vs new way, a trade-off | `p08_tradeoffs` | the two real options on a beam that tips on each landing |
| a website, an app screen, a repo | `p07_name`, `p14_tools` | a real screenshot in a browser window, whip-pans and circles on the words |
| choosing between options | `p03_decide` | the two real options, the pick filling with the accent, a stamp |
| a score, a rating, a level | `objects/scoreGauge` | the real metric on the dial, the real problems as flags |
| a number that proves it | `objects/receiptFan` (the total), `liveStat`, `odometer`, `statCard` (kits) | the real number rolling and landing on the word |
| costs or items adding up | `objects/receiptFan` | the real bills fanning in, then the sum |
| one person, many jobs | `objects/badgeLine` | the real jobs as ID badges dropping onto a line |
| the next one, a status that keeps changing | `objects/flapBoard` | the real roles, steps or places flipping in |
| people did it by hand, now it runs itself | `objects/railRoute` | the real steps as stations, the tool as the train |
| a handoff between two people, apps or sessions | `objects/tubeMail` | the real messages as capsules, the real result as the note |
| a launch, a release, what's inside | `objects/launchBox` | the real product name on the box, its real parts on the card |
| access handed out, things piling on one owner | `objects/keyRing` | the real apps as keys, the risky one turning red and coming off |
| a whole reel's story, hook to CTA | `casinos/` | one object per chapter, each cut on the first word of a sentence |
| the ask | the starter `cta` scene, `casinos/scenes/cta.js` | the keyword and what they get, by name |

---

## 14 · More worked lines (method only)

| Line | Relation | Visual | Per stressed word |
|---|---|---|---|
| "Free trials are designed for you to forget." | a trap with a timer | a calendar page with a tiny hook hidden in day 30 | free: a gift box opens · forget: pages tear by on their own · designed: the hook glints, a charge slip prints |
| "Your camera roll is a hard drive you never back up." | one failure point | a phone as a single glass jar holding photos | camera roll: photos drop in · never: a crack runs up the jar · back up: a second jar appears and a copy streams across |
| "Restaurants make money on drinks, not food." | hidden margin | two price tags with a profit bar behind each | food: the bar barely fills · drinks: the bar overflows its card |
| "Posting daily matters less than posting the same idea better." | quality vs volume | seven weak cards vs one card that grows | daily: seven grey cards stack · same idea: one card gets rewritten three times, each version crisper · better: its view counter rolls past all seven combined |
| "A meeting with no decision is a meeting about a meeting." | loop | a calendar block that spawns a copy of itself | meeting: a block lands · no decision: a "?" stamp · about a meeting: the block duplicates into next week, and again |
| "Raise prices on new clients first." | safe test | two doors, one marked NEW, one marked CURRENT | new: the NEW door's price tag flips up · first: CURRENT stays locked, a little shield on it · clients: new tokens still walk through |

---

## 15 · Common mistakes in print reels (and the fix)

1. **A shot that starts empty.** Bring the first object in 0.3 s before the cut so the incoming sheet already shows it.
2. **Three things land on the same word.** Spread them: one per stressed word, the rest idle.
3. **Captions repeated on cards.** A card should show the object or the number, not the sentence.
4. **The host points at nothing.** Aim it at the box a part returned.
5. **Every card the same size.** One hero card per beat, smaller supporting ones.
6. **Numbers typed as text.** Use `odometer`, `counter`, `statCard` or a flipping price tag.
7. **The ask buried.** The keyword is huge, posted, and the last frame holds.
