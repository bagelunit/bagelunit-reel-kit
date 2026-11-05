# Checking your own work

Nobody should see a reel you haven't inspected. You can't play video, so inspect it the way an editor scrubs a timeline: still by still, then strip by strip, then with the numbers. Four rounds, in this order, on every reel.

## Round 1 · Look at stills

```
node "$KIT_DIR/tools/kit.mjs" frames <project> <t1> <t2> …
```

Which moments: the very first frame and 0.8 s in; the middle of each shot; just after each cut (0.1 s and 0.4 s); every word the script leans on (times in `build/word_index.txt`); and the final half second. The grid lands in `<project>/stills/sheet.jpg`, with each still beside it at full size.

Ask these questions of the grid. Every "no" has a fix.

| Question | When the answer is no |
|---|---|
| Does frame zero already show something worth stopping for? | the hook's picture starts at t = 0, not after it |
| Can you tell in half a second what to look at? | everything except the one hero gets smaller, stiller or loses the accent |
| Is the middle of each shot busy enough (three to six things), not a lone prop on a blank set? | earlier props stay on stage; the hero grows |
| Do two stills 0.6 s apart differ? | give the props an idle loop: a tick, a sway, typing, a float |
| Is every word you must read at least 40 px, whole and free of overlaps? | resize, re-wrap or move it |
| Is anything sliced by the frame edge by accident? | pull the lens back, shrink it or slide it in |
| Is the bottom 300 px and the right 120 px free of anything that matters? | Instagram covers that strip: move it up or left |
| Do the captions stay off the hero, with the right word emphasised? | move the caption zone or change the emphasis |
| Do rings and boxes sit exactly on what they mark? | check at full size (`--scale 1`) and nudge |
| Is the host (in a mode with one) pointing at the hero rather than empty space? | aim it again |
| Is the accent colour on one thing only? | mute the rest |
| Does it look like its mode (compare with the mode guide)? | go back to that guide's tokens |
| Is there any placeholder text, "undefined", NaN or an empty grey image box? | fix the data or the asset path |

## Round 2 · Watch the draft as strips

```
node "$KIT_DIR/tools/kit.mjs" render <project>        # → build/draft.mp4, half size and quick
```

Pull single frames around each cut and big moment (`ffmpeg -v error -ss 4.2 -i build/draft.mp4 -frames:v 1 stills/at_4.2.jpg`) or a strip of a whole stretch (`-vf "fps=4,scale=270:-1,tile=6x2" -frames:v 1`). You are hunting for:
- things that appear or vanish without moving;
- hand-offs that don't match (a shot ends one way, the next starts another);
- any stretch longer than 1.2 s where nothing changes;
- motion too quick to follow;
- a payoff that is gone again in under a second;
- a hit buried under a transition.

## Round 3 · Run the gates

```
node "$KIT_DIR/tools/kit.mjs" pace <project>
node "$KIT_DIR/tools/kit.mjs" effort <project>
```

The final render waits until both say PASS.
- `pace` names every flat stretch and the words over it. Open that shot's card and give the stretch something: an event on the word that carries the line, idle motion on props already there, a camera move or a host gesture. Draft again, check again.
- `effort` rejects reels that are thin or built from stock pieces. More of the same won't fix it; objects invented for this script will.

## Round 4 · Sound, final, hand-over

- `kit export` mixes the sound and joins it to the picture. Read `build/sfx.json` first and keep cues for moments that deserve one; the export allows about one cue per 0.75 s and keeps cuts, stamps and slams first.
- If the voice mangles a word, spell it the way it sounds in `script.txt` ("Supa-base"), make the voice again and re-cue the shots, because `words.json` will have moved.
- Once stills, draft and gates are clean: `kit render <project> --final`, then `kit export <project>`, then pull three frames of `out/<name>.mp4` at full size and look at them.

Close with one or two lines to the user about what you caught and changed, for example: "CTA moved above Instagram's bottom bar; text in shot 3 no longer overlaps."
