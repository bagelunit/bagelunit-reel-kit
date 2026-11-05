# Print examples

What's here, and when to open it. Nothing in this folder is loaded by a normal reel: these files are for reading. Find the one
closest to your beat, see how its motion is built, then write your own version for your script. Pasting a prop or scene as it is
makes every reel look alike, and `kit effort` flags it.

## Props (`objects/`), with a reel that plays them

Eight self-contained props. Each one is a single drawing function `name(T, K, x, y, t, o)` that draws around its own origin and
takes its cue times in `o`, so a scene just calls it from its `draw`. Each file's header says what story it tells, how it moves and
what keeps it alive while it holds. `props-reel/` is a short reel that cues every one of them on spoken words: render it
(`kit frames modes/print/examples/props-reel 2 6 10 …`) to see them move, and read `props-reel/scenes/showcase.js` for the calls.

| file | what it is | the motion worth learning |
|---|---|---|
| `badgeLine.js` | a clothesline of lanyard ID badges, one per job | rope that sags more with each landing; badges that grow from their pin and swing as a damped pendulum with an echo; neighbours knocked on each landing; photos clipped into a window |
| `flapBoard.js` | a split-flap departure board | every flap folds through random letters before landing, staggered left to right; the housing jolts; a lamp that blinks while flaps run |
| `railRoute.js` | a model railway on a wooden plinth | track segments dropping in on cues; stations popping up; wheels turned by the distance travelled; a cranking side rod; steam puffs that rise and spread |
| `scoreGauge.js` | a big riveted dial | a spring sweep with overshoot, then a tremor that dies out; a counter that always reads the needle; flags popping in under it |
| `launchBox.js` | a premium white product box | drop + squash + dust; a pill that slams; a lid that springs off and flies away; a card rising out, overshooting and settling (clipped to the opening) |
| `tubeMail.js` | two terminals joined by a glass tube | capsules along a bezier with echoes; a counter that ticks as they pass; the receiving terminal jolts and flashes; a note that unrolls |
| `receiptFan.js` | receipts fanning out, then one total | a fan on one shared pivot; each receipt springs in with an echo; gather + flip edge-on into a big rolling total |
| `keyRing.js` | keys on a ring on a short string | a ring that drops and swings; keys knocking their neighbours; a key turning red when named and falling off under gravity |

Layering note, learned building these: the crisp layer (K) always prints over the tone layer (T). When paper overlaps paper
(receipts, badges), fill its face on K, or the back one's outlines show through the front one.

## A whole reel (`casinos/`)

"Casinos have no clocks…" (15 s): five chapters, one object per chapter (the casino front, the dark room, the slot, the card table,
the comment), each cut on the first word of a sentence, cues on words throughout. Read `timeline.js` first for the cuts, then
`scenes/props.js` for the shared props and one scene at a time. The strips in `frames/` (`look_01`–`look_03`) are 1 fps frames of
this reel's render.

## Scenes (`p*.js`)

Five longer scenes, each a full stretch of a reel. Their word indices and timings belong to the reel they came from: re-cue
everything on your own `words.json`. They lean on the small kits in `parts/` (`kit_a.js`: the learning card and the presenter's dock;
`kit_b.js` + `kit_c.js`: a coding-session window, a README card and a power strip, used by `p14_tools`). Some kit names collide with engine globals, so copy
the functions you need into your own scene file with your own prefix instead of loading the kits. `owi()` in these files is an old
voice clock: use `wi()` / `wordAt()`.

| file | what happens | the technique worth learning |
|---|---|---|
| `p04_hook.js` | a coding window streams code while a skills card loses its chips one by one; a plug flies in on its cable and jams into a socket, and the falling chip freezes in mid-air; the card flips into the next card | slipping out of a slot and tumbling; freezing motion on the one big hit; code scrambling under a camera punch; a flip (squash through zero) that swaps one object for another |
| `p07_name.js` | a repo page flies in as a browser window; the camera punches in on the title, whips to the star button, then scrolls to a README line that gets highlighted and circled; a terminal types the install command | a camera inside a page (zoom out, travel, zoom in); whip-pans between points; underline, highlight and loop-circle marks; a dashed leader tying a typed word to the circled one |
| `p08_tradeoffs.js` | a fulcrum rises, a beam lands on it, two option cards are tossed on and each landing tips the beam; a walker hops between pro and cost rows; an unknown word bursts into a card | a balance beam driven by its loads; a walker hopping between items; a card bursting out of a word with a kick |
| `p03_decide.js` | your cursor clicks a chip, a choice card springs out, the pick fills with the accent from the click point while the other option is struck and drops; a stamp; a token dragged into a padlock opens it and a scan wakes the code | a fill wipe that starts where you clicked; stamp slam; drag into a lock; a scan that brings dim rows to life; rows inserting and pushing the rest down |
| `p14_tools.js` | a browser window powers up from a cable, the address bar goes to an app, an eye docks into the toolbar and a dev-tools panel slides up with console, network and screenshot panes | a radial power-on of a whole window; an eye with a lid that looks around; typed rows and a network waterfall; a shutter flash with a thumbnail |
