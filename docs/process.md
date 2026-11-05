# The reel process

One loop, the same for every brand. It runs inside a brand workspace (a copy of `template/`). Claude does the work; a person approves at three gates and a person posts. Nothing in this process posts, schedules or sends anything.

```
brand setup (once) > research > topic > STYLE QUESTION > facts > hook + script > GATE A
  > voice > visual plan > GATE B > build > verify > real sound > final + cover + caption > GATE C > a person posts > review
```

Record every gate with the date in `reels/<slug>/approvals.md`.

## 0. Brand setup (once per workspace)

Copy `template/` for the brand and open Claude Code in the copy. With an empty `brand/brand.json` Claude runs the brand questions (or run `/brand-setup`): your name, the brand, handle, colours, logo, fonts, sticker avatar or no host, voice and call-to-action style. `brand/facts.md` holds the only claims allowed on screen, in the voice or in a caption, and only the user adds or confirms them.

## 1. Research (monthly)

- Pick 6 to 12 accounts: about 4 in your niche and a bit ahead of you, 4 adjacent (same audience, other topic), 2 to 4 big ones for format ideas only. Stay within about 10x of your own follower count.
- Read reels in the browser at human speed, with the person present. No scraping services, and Claude never logs in with the brand's password.
- **The 3x rule:** for each reel, views divided by that account's median views over its last 12 reels. Under 1.5x ignore, 1.5x to 3x note, 3x and up is a formula worth studying. `/ig-viral` does this and saves outliers to `brand/swipe.md`.
- Copy the shape (hook, structure, length), never the video, its script, colours or characters.

## 2. Topic

The person gives a topic or a finished script. A pasted script is used word for word (obvious typos only). Confirm which brand it is for.

## 3. Style question (always)

Before anything else, Claude asks one multiple-choice question: **Print**, **3D** or **Talking head** (only if there is a video of the person talking), with a recommendation first and why. It never picks a style silently. Print is the only style that uses the sticker presenter.

## 4. Facts

Read the official source for every claim the reel makes (for a how-to, the product's own setup page). Every number, result, price, client name or claim must be in `brand/facts.md`. If it is not, the draft shows `{{needs cleared fact}}` and Claude flags it. No invented stats, no price or offer claims unless cleared, no other company's logos.

## 5. Hook and script

- Write 3 or 4 hooks, score them with the Instagram plugin's hook scorer, keep one scoring 75 or more. The hook gives the value in the first 1.5 to 3 seconds; it does not tease.
- Script: about 85 to 110 words for 30 seconds. Shape: hook > proof (a name, a number from facts.md) > 3 or 4 steps > your own proof or twist > one ask.
- Write for the ear. Commands, URLs and codes go on screen, not in the voice. Spell tricky names by sound. The generated voice never says a word in `brand.json` > `voice.never_say`; show it as text instead.
- No em dashes. Run `/ig-human`'s detector on the script.
- End with "Save this" (or follow) unless a comment keyword has a DM auto-reply that was tested from a second account.

**GATE A: the approver approves the script.** No voice credits are spent before this.

## 6. Voice

`kit start <reel> --style <style>`, write `script.txt`, run the kit's `voice.py`. It cuts long pauses, speeds the take up slightly, sets loudness and writes `build/words.json`: a time for every spoken word. Every animation, caption and sound is cued on words, never on seconds. A 30-second reel uses roughly 800 ElevenLabs characters. The person's own recording works too.

## 7. Visual plan

Write `STORYBOARD.md`:
- **Concept card:** one world or object whose behaviour IS the argument, 3 to 6 props invented from this script, one wow moment per section, and the swap test (could this frame sit in someone else's reel? then it is generic, redo it).
- **Shot cards:** one per 1.5 to 5 seconds, cued to word indices: what is on stage, what changes on each stressed word, what keeps moving, the camera, the presenter's action, the hits.
- **Hand-off block:** names, ids, colours, the hero item and each shot's end state, so parallel builders agree.

**GATE B: the approver approves the plan** (also confirm the handle that will show on screen).

## 8. Reel settings

In `reel.json`: the theme or the brand's accent colour, `brand.handle`, and the presenter. For a sticker presenter:

```json
"presenter": { "type": "stickers", "dir": "host", "cues": [["three", "three", 1], ["save", "thumbs"]] }
```

Link or copy the brand's pose folder (`brand.json` > `host.poses_dir`) to the reel's `host/` folder. A cue is `[word, pose, nth occurrence]`; check each occurrence number against `build/word_index.txt`. See [avatar.md](avatar.md).

## 9. Build

One lead build agent gets the full brief: which kit guides to read, the hard rules and the exact on-screen text. It writes the shared props file, `timeline.js` and one scene per shot (long reels: one sub-agent per 1 or 2 shots, all reading the hand-off block). Then it runs `kit frames`, `kit render` (draft), `kit pace` and `kit effort` until both gates print PASS, and stops at the draft.

## 10. Verify (yourself)

Pull frames from the CURRENT `build/draft.mp4`, not the stills folder (it can hold frames from older passes). Check:
- exact commands and text, and that every typed line finishes and is held on screen before the cut;
- the handle is visible; nothing is cut off; payoffs stay on screen at least a second before the cut;
- safe zones: nothing important in the bottom 300 px or right 120 px (Instagram covers them);
- text size (aim for 40 px or more on screen); no em dash reaches the screen.

Give the person the draft (with real sound, step 11) to watch on a phone. Apply changes as the smallest possible edits and verify again.

## 11. Real sound

After `kit export`, run the real-sound step (see [sound.md](sound.md)). It replaces the synthesised effects with real recordings snapped to the picture. Read `build/realsound/report.txt` and report the numbers honestly; the person's ears decide. Keep the kit-sound file as `<name>-kitsound.mp4` and make the real-sound file the final.

## 12. Final, cover and caption

- `kit render <reel> --final`, `kit export <reel>`, then the real-sound step on `out/<name>.mp4`.
- **Caption:** `out/caption.txt`. The first line is under 125 characters, one ask, 3 to 5 hashtags, no em dashes. Lint it with the Instagram plugin's caption checker.
- **Cover rule:** every reel gets a dedicated cover, never a frame grabbed from the hook. Make a still-only `scenes/cover.js` with a big topic title, a prop that shows the subject, the presenter (if the brand has one) and the handle. Render it with `kit frames <reel> 0 --only cover` to `out/cover.jpg`. Keep the title, prop and face inside the centre 1080x1440 band, which is what the profile grid shows.

**GATE C: the approver approves the final.** File the mp4, caption, cover, script, storyboard and approvals in the brand's reels folder and add a row to `brand/log.md`.

## 13. Posting (a person, never Claude)

On Instagram: turn on "Upload at highest quality", upload `cover.jpg` as the cover (Edit cover > Add from camera roll), paste the caption, post.

## 14. Review

After 24 hours: skip rate, saves, keyword comments. Weekly: each reel's views against your own median, 3-second hold, reach to non-followers, sends and saves. Lessons go back into the swipe file and the next plan.

## Lessons from the first reels

- The engine's built-in sound reads as fake; real recordings read as real. Always run the real-sound step.
- With a deep voice, low whooshes and thumps can hide under it; the sound checks flag them, and a person listens.
- A typed command once never finished typing before the cut. Check every typed line completes and holds.
- Kenney sound packs need a browser download (signed links); see SETUP.md.
- Claude Code's auto mode may block running downloaded build scripts; run those yourself in a terminal.
