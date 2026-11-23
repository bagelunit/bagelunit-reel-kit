# The reel process

> A technical reference for how Claude runs each reel. You do not need it to make a reel: start with the [README](../README.md) and [your first reel](../template/docs/first-reel.md).

One loop, the same for every brand. It runs inside a brand workspace (a copy of `template/`). Claude does the work; a person approves at three gates and, by default, a person posts. Claude posts, schedules or sends nothing unless the brand owner connected a publisher or an auto-reply and turned it on (sections 13 and 15).

```
brand setup (once) > research > topic > STYLE QUESTION > facts > hook + script > FACT CHECK (script) > GATE A
  > voice > visual plan > GATE B > build > verify > real sound > final + cover + caption > FACT CHECK (final) > GATE C > posting card > a person posts (or a connected publisher, owner says yes per reel) > numbers > review
```

Every gate is asked as a question block (Approve, Change something, or Stop this reel) and recorded with the date in `reels/<slug>/approvals.md` (`kit gate <reel> record`). At Gate C the record also holds the final file's fingerprint, so a change after approval shows up.

## 0. Brand setup (once per workspace)

Type `/brand-setup` in the kit's folder: it copies `template/` to a new brand folder and asks the brand questions there. Or copy `template/` yourself and open Claude Code in the copy: with an empty `brand/brand.json` Claude runs the brand questions (or run `/brand-setup`): your name, the brand, handle, colours, logo, fonts, presenter (sticker host, drawn or none), voice, call-to-action style, kit update notices, a private local history, and how often to post (a few a week, one a day, several a day at set times, or a suggestion from `/content-calendar how-often`; saved as `posting.times`, `posting.days` and `batch.max_reels`). Every question is a clickable question block: pick an option, or pick "Other" and type. `brand/facts.md` holds the only claims allowed on screen, in the voice or in a caption, and only the user adds or confirms them.

## 1. Research (monthly)

- Pick 6 to 12 accounts: about 4 in your niche and a bit ahead of you, 4 adjacent (same audience, other topic), 2 to 4 big ones for format ideas only. Stay within about 10x of your own follower count.
- Read reels in the browser at human speed, with the person present. No scraping services unless the brand owner turned on `autopilot.scrape`: then `/account-audit` computes the 3x rule from Apify data (cost shown first, token in `~/.config/bagelunit-reels/apify.key`). Claude never logs in with the brand's password.
- **The 3x rule:** for each reel, views divided by that account's median views over its last 12 reels. Under 1.5x ignore, 1.5x to 3x note, 3x and up is a formula worth studying. By hand in the browser, `/ig-viral` does this; from an export or Apify data, `/account-audit` does. Either way the outliers go in `brand/swipe.md`.
- Copy the shape (hook, structure, length), never the video, its script, colours or characters.
- **Teardown:** for a reel worth studying (an outlier, or the brand's own best), the person supplies the file; Claude pulls frames and a transcript and runs `/reel-analyzer` (hook, beats, pacing, visual technique, reusable moves, one-line remake). Save it in `brand/swipe.md`. See [hook-and-review-playbook.md](../template/docs/hook-and-review-playbook.md).
- **Comment mining:** with 30 or more real comments or DMs, run `/comment-mining`; every idea must trace to a real comment.

## 2. Topic

The person gives a topic or a finished script. A pasted script is used word for word (obvious typos only). Confirm which brand it is for.

Pick ONE goal (save, share, follow or lead) and an angle (result first, self-proving, contrarian, pain first, something breaks) that differs from the brand's last post in `brand/log.md`. `/script-plan` writes both into `approvals.md` next to Gate A.

## 3. Style question (always)

Before anything else, Claude asks one question block: **Print**, **3D**, **Talking head** (only if there is a video of the person talking: any phone video, filmed upright; `take.py` cuts the pauses, never speeds the person up, and spends no voice credits) or one of the 20 scene styles (`kit scene list` names them and what each is for; Claude offers the two or three that fit the brand's niche, plus "see all"), with a recommendation first and why. It never picks a style silently. Print is the only style that uses the sticker presenter.

## 4. Facts

Read the official source for every claim the reel makes (for a how-to, the product's own setup page). Every number, result, price, client name or claim must be in `brand/facts.md`. If it is not, the draft shows `{{needs cleared fact}}` and Claude flags it. No invented stats, no price or offer claims unless cleared, no other company's logos.

## 5. Hook and script

- Start the reel folder first: `kit start <reel> --style <style>`, always inside the brand's `<brand>-reels` folder (it refuses anywhere else). It fills a new folder with a sample `script.txt` (a script already in the folder is kept).
- The script is written by `/reel-scripter`, in stages, each saving its output in the reel folder: `/script-plan` (one viewer, one promise, a beat outline: `script-brief.md`, `script-plan.json`), the hooks (`/viral-hook-writer`: triple hooks that open the loop the outline closes; score the line with `hookscore.py`), the draft, `kit script` (a no-model check: announced count against the items, long sentences, jargon, spoken menu paths, loops that must be paid off, seconds at the brand's pace), `/script-coldread` (a fresh reader who sees only the spoken words), the fact check (hard pass or fail) and the human floor, `kit score`, then `/script-score` (the retention rubric, judged by a fresh agent; 90 or more). The word band, the shape and the rules for each stage are in `/script-plan` and `/reel-scripter`; this file does not repeat them.
- The hook is a triple hook (context, lean, contrarian snapback: [hook-and-review-playbook.md](../template/docs/hook-and-review-playbook.md) section 0). The eight-point frame-0 checklist in the same file is checked on frames, never on the script alone: on the Gate B stills, the draft and the final.
- Write for the ear. Commands, URLs, menu paths and codes go on screen, not in the voice. Spell tricky names by sound. The generated voice never says a word in `brand.json` > `voice.never_say`; show it as text instead. No em dashes.
- The human score (`/ig-human`) must meet its floor, default 70 (`brand.json` > `writing.human_score_min`). It is not the 90 bar. `/humanizer` rewrites what it flags. End with "Save this", "follow for more", or "send this to the person who..." unless a comment keyword has a DM auto-reply that was tested from a second account.

Before the approver sees the script, run the credit check (`python3 ~/.claude/skills/bagelunit-reels/tools/budget.py reels/<slug>/script.txt`): it counts the script's characters and compares them with the ElevenLabs credits left.

**Fact check, before the approver sees the script.** Run `/reel-factcheck` (scope `script`). A mechanical pass (`kit facts <dir> check`) catches uncleared numbers, missing sources, old clearances and absolute wording. Then a fresh reader re-reads every source and gives each claim a verdict: supported, overstated, not found, changed or unsourced. Only a PASS is recorded (`kit facts <dir> record --scope script --result PASS`). Gate A will not record without a current PASS. A wrong claim is far cheaper to fix here than after the voice is made.

**GATE A: the approver approves the script** (a question block: Approve, Change something, or Stop this reel). `kit gate <reel> record --gate A` refuses without a current fact check, a human score at its floor, and a `Script review: meets the bar (NN/100; ...) [script <fingerprint>]` line of 90 or more for these exact words. That 90 is the retention score (hook 25, open loop and payoff 20, pace 15, payoff 15, one viewer 10, clear aloud 10, call to action 5). The owner alone overrides a miss, with `--skip-script-review "reason"` or `--skip-human "reason"`. No voice credits are spent before this: `voice.py` refuses until Gate A is recorded. An outside writer can run the same mechanical checks first with `kit score <file>` (exit 1 on fail). `kit score` does not replace the fresh read or the fact-check re-read.

## 6. Voice

Run the kit's `voice.py` on the approved `script.txt` (the folder was started in step 5). It cuts long pauses, speeds the take up slightly, sets loudness and writes `build/words.json`: a time for every spoken word. Every animation, caption and sound is cued on words, never on seconds. A 40-second script (about 120 words) uses roughly 750 ElevenLabs credits, one per character. The same request again reuses the take and spends nothing. The person's own recording works too.

**Picking up after a break.** If a session ends partway (a usage limit, a closed window), the person says "carry on with the reel about [topic]". Claude reads `reels/<slug>/approvals.md` and the folder to find the last finished step and continues from there; it never redoes a gate that is recorded.

## 7. Visual plan

Write `STORYBOARD.md`:
- **Concept card:** one world or object whose behaviour IS the argument, 3 to 6 props invented from this script, one wow moment per section, and the swap test (could this frame sit in someone else's reel? then it is generic, redo it).
- **Shot cards:** one per 1.5 to 5 seconds, cued to word indices: what is on stage, what changes on each stressed word, what keeps moving, the camera, the presenter's action, the hits. The hook shot must already be moving on frame 0, and a small re-hook ("and it gets better") sits near 4 s, 9 s and 15 s.
- **Hand-off block:** names, ids, colours, the hero item and each shot's end state, so parallel builders agree.

Craft rules for this step are in `template/docs/craft-playbook.md` (one world, a through-line, a picture for each kind of line); real media comes from `brand/library/`.

**GATE B: the approver approves the plan** (also confirm the handle that will show on screen).

## 8. Reel settings

In `reel.json`: the theme or the brand's accent colour, `brand.handle`, and the presenter. For a sticker host, write the cues, then run `kit host <reel>`: it links the brand's pose set into the reel, lists every pose in `reel.json`, and names any pose the cues need that the set does not have yet (make it with `/sticker-host add <pose>` after the owner's yes):

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
- text size (aim for 40 px or more on screen); no em dash reaches the screen;
- the hook on frames at 0, 0.5, 1, 2 and 3 s of the draft: moving on frame 0, biggest element at least 40 percent of the frame, claim landing about 1.2 to 1.6 s, readable on mute (checklist in the playbook).

Run the reel QA on the draft (`python3 scripts/qa/gate_qa.py <slug> --gate B`: it reads the pixels for the frame-0 hook, text in the bottom 300 px or right 120 px, and text size) and fix what it names; the same check on the final is what unlocks Gate C. Then run `/reel-review` on the draft: seven must-pass checks, eight scored checks and a one-line verdict with a score out of 100. Under 90 you redo what it named and review again until it reaches 90; Gate C refuses less. Give the person the draft (with real sound, step 11) to watch on a phone. Apply changes as the smallest possible edits and verify again.

## 11. Real sound

After `kit export`, run the real-sound step (see [sound.md](sound.md)). It replaces the synthesised effects with real recordings snapped to the picture. Read `build/realsound/report.txt` and report the numbers honestly; the person's ears decide. The step leaves the final as `out/<name>.mp4` and keeps the kit-sound original in `build/pre-real/`: the final is always that one name.

## 12. Final, cover and caption

- `kit render <reel> --final`, `kit export <reel>`, then the real-sound step on `out/<name>.mp4`.
- **Caption:** `/caption-and-hashtags` writes `out/caption.txt` and checks it with `node .claude/skills/caption-and-hashtags/caption.mjs check`. Its rules (layout, hashtag count, keyword line) live in that skill.
- **Cover rule:** every reel gets a dedicated cover, never a frame grabbed from the hook. Run `kit cover reels/<slug>`: it makes `out/cover.jpg` from the reel's `cover.html` (a big topic title, a prop that shows the subject, the presenter if the brand has one, and the handle). Keep the title, prop and face inside the centre 1080x1440 band, which is what the profile grid shows. Title of 3 to 5 words; shrink the cover to 150 px wide and simplify if it is unreadable; it should look like family next to the last 8 covers without disappearing (`/cover-thumbnail-brief`).

Run `/reel-review` again on the final and put its verdict line in `approvals.md`.

**Fact check on the final.** Run `/reel-factcheck` again with scope `final`: it covers the script, the caption and every word on screen, and `/reel-review` check 1 needs its PASS. Changing a word or a facts row afterwards makes the PASS out of date.

**GATE C: the approver approves the final.** `kit gate <reel> record --gate C` needs Gates A and B recorded, the final fact check PASS, a `Review: meets the bar (NN/100; ...) [video <12 hex>]` line of 90 or more (the 12 hex is the first 12 characters of the sha256 of the newest `out/*.mp4`: `node ~/.claude/skills/bagelunit-reels/tools/kit.mjs gate <reel> hash` prints it), a `kit qa` PASS for that exact file, and the reel QA passed for it (`python3 scripts/qa/gate_qa.py <slug>`). Only the owner overrides a check, each with a reason written into the record: `--skip-facts`, `--skip-script-review`, `--skip-review`, `--skip-qa`, `--skip-order`. The full rule is house rule 10 in the template's `CLAUDE.md`. File the mp4, caption, cover, script, storyboard and approvals in the brand's reels folder. The reel's row in `brand/log.md` is added once it is posted (step 13).

## 13. Posting (a person by default)

Run `/reel-posting`. It first checks the reel passed Gate C and that the file is the one approved (`kit gate <reel> check` prints MATCH), then gives a **posting card**: the file and how to get it to the phone, the cover, the caption ready to copy, the quality setting and a suggested time from `brand/log.md`.

On Instagram: turn on "Upload at highest quality", upload `cover.jpg` as the cover (Edit cover > Add from camera roll), paste the caption, post. Instagram's own scheduler (Advanced settings, Schedule this post) can hold it until the chosen time. Afterwards Claude adds the line under `## Posting` in `approvals.md` and the reel's row to `brand/log.md` (the log holds posted reels only, with the goal, the angle and the review verdict).

**A connected publisher (optional).** A brand owner who wants approved reels to go out on a schedule sets up the kit's own publisher with `/reel-posting`, step by step (`template/docs/auto-post.md`, `template/docs/connect.md` step 6). It posts to every platform the brand connected: Instagram, the Facebook Page, Threads, YouTube Shorts and TikTok. Claude may schedule a reel only when `autopilot.post` is on, only the exact file approved at Gate C, and only after the owner says yes to that reel's time.

## 14. Review

A day or more after posting, the person types `/analytics-readout` with the numbers (where to find each one in Instagram: `template/docs/after-posting.md`). Claude adds one row per posted reel to `brand/insights.csv` (views, reach, average watch time, skip rate, likes, comments, saves, shares, follows) and reads it back. Weekly: each reel's views against your own median, 3-second hold, reach to non-followers, sends and saves. Lessons go back into the swipe file and the next plan.

Run `/analytics-readout` on the numbers: judge against the brand's own median, name the one metric that matters for the reel's goal, and locate the break (about 3 s = hook, about 12 s = middle, the end = CTA). Two actions, not twelve, and say what the data cannot show. To test two hooks, use `/ab-hook-tester` (one variable only). The goal and angle are already in the reel's `brand/log.md` row, written when it was posted.

Once 8 or more posted reels have numbers in `brand/insights.csv`, `kit calibrate` learns how this brand's reels hold viewers, and `/reel-predict` can then estimate a new draft's watch time and skip rate before it is posted. Under 8 reels it gives measurements only, never a guess.

## 15. Comment auto-reply (optional)

A reel that ends on "Comment WORD" needs something that answers those comments. The kit sends nothing itself. `/comment-responder` has a guided setup: it drafts the keyword, the public reply (never a link) and the DM, then walks the owner through connecting the kit's own publisher (`template/docs/auto-reply.md`, route A; route B is a no-code tool), with the owner doing every login. Only after a test from a second account does the keyword go in `cta.tested_keywords`, and only after the owner says so is `autopilot.dm_replies` turned on.

## Weekly batch (optional)

For a week's reels in one sitting: plan up to the brand's `batch.max_reels` topics (default 3, set per brand in `brand.json`), each with one goal (goals may repeat) and a different angle (more than five reels, for several posts a day: the angles take turns so no two neighbours share one); write all the scripts; take them to Gate A together but record each approval separately; spend voice credits only on approved scripts; then run each reel through Gates B and C one at a time. A problem in one reel does not block the others. After posting, `/account-audit --all` fills `brand/stats.md` so the review (step 14) uses the brand's own numbers.

## Updating the kit

In a brand workspace, type `/kit-update`. It checks for a newer version, shows what changed, previews, updates the workspace without touching the brand's files (your edits to kit files are merged with the kit's changes, using the pristine copies in `.kit-base/`; a clash keeps your file and writes the kit's version beside it as `<name>.kit-new`; changed files are also kept as `.bak-<date>`), and updates the engine too. It works even if the kit was downloaded as a ZIP. The manual way is `node setup/sync-template.mjs <workspace>` (dry run), then `--apply`, from the kit's folder.

## Lessons from the first reels

- The engine's built-in sound reads as fake; real recordings read as real. Always run the real-sound step.
- With a deep voice, low whooshes and thumps can hide under it; the sound checks flag them, and a person listens.
- A typed command once never finished typing before the cut. Check every typed line completes and holds.
- Kenney sound packs only download in a browser (a script gets a web page, "File is not a zip file"). The installer opens the pages and takes the zips from Downloads; see SETUP.md.
- Claude Code's auto mode may block running downloaded build scripts; run those yourself in a terminal.
