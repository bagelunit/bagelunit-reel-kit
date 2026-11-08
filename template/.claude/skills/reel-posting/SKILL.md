---
name: reel-posting
description: >
  Get an approved reel posted: a posting card for posting by hand, scheduling it, or setting up automatic
  posting for this brand step by step. Use when the user says "post this", "how do I post it", "schedule
  this reel", "post it on Tuesday", "set up auto-posting", "post automatically", or after Gate C is approved.
user-invokable: true
argument-hint: "[reel folder, e.g. reels/<slug>] [when]"
metadata:
  author: BagelUnit
  version: "1.0.0"
  category: content
---

# Reel posting: from an approved file to a live post

Ask every choice with a question block (AskUserQuestion). Nothing is posted by Claude unless the brand owner
connected a publisher and said yes to that reel's time (CLAUDE.md rule 11).

## Gate (read first)

1. The reel passed Gate C: `approvals.md` has a Gate C record, and `kit gate <reel> check` prints MATCH. If it
   prints CHANGED SINCE APPROVAL, stop: the file was edited after approval and needs Gate C again.
2. `out/caption.txt` exists and passed `/humanizer`; the cover (`out/cover.jpg`) exists.
3. Read `brand/brand.json` -> `autopilot.post` and `posting.method` to know which route this brand uses.

## Route 1: posting by hand (the default)

Give the owner a **posting card** and nothing else to think about:

- **File:** the full path of `out/<name>.mp4` (and how to get it to the phone: AirDrop, Google Drive, a cable).
- **Cover:** `out/cover.jpg`. In Instagram: Edit cover, then Add from camera roll.
- **Caption:** the text of `out/caption.txt`, ready to copy.
- **Settings:** Settings and privacy, Media quality, turn on "Upload at highest quality".
- **When:** suggest a time from the brand's own `brand/log.md` (when its best reels went out), or say there is
  no data yet. Instagram's own scheduler (Advanced settings, Schedule this post) can hold it until then.
- **After posting:** ask (question block) "Posted" or "Scheduled in Instagram for <time>", then add the line
  to `approvals.md` under `## Posting` and the reel's row to `brand/log.md` (date, hook formula, first line,
  goal, angle, review verdict).

## Route 2: setting up automatic posting (once per brand)

Only when the owner asks. Walk it one step at a time and keep a short checklist in the reply.

1. **Pick the route** (question block): "Instagram's own scheduler (Recommended, free, a person uploads)",
   "A scheduling tool such as Buffer or Later", "My own publisher on Meta's API (for developers)", "Not now".
   Read `docs/auto-post.md` for the chosen route.
2. **Scheduler or tool:** give the exact steps in plain words; the owner connects the account and logs in.
   Record `posting.method` in `brand.json` ("instagram-scheduler", "tool: <name>").
3. **Own publisher:** follow `docs/auto-post.md` section C with them. Any code goes in a folder outside this
   workspace; tokens and keys are typed by the owner into the service's own settings, never into chat. It
   must refuse a file whose fingerprint does not match Gate C, and start in dry run. Record
   `posting.method` = "own publisher".
4. **Test once** with one approved reel (question block: "It posted correctly", "Something went wrong").
5. **Turn it on:** only after the owner picks "Turn on automatic posting" in a final question block, set
   `autopilot.post` to `true` and write the date in the `_note`.

## Route 3: scheduling one reel (after route 2 is set up)

1. Run the Gate above. Then ask the time (question block with 2 or 3 suggested slots plus Other) and the
   timezone if `brand.json` has none.
2. Show the posting card (file, fingerprint, caption first line, time) and ask "Schedule it?" (question
   block: "Schedule (Recommended)", "Change something", "Not now").
3. Schedule it the brand's way, record the line under `## Posting` in `approvals.md`, and later add the
   `brand/log.md` row once it is live.

## Never

- Never post or schedule a reel that did not pass Gate C, or a file that changed after it.
- Never log in, never ask for or print a password, token or key.
- Never change the caption at posting time; a changed caption goes back through `/humanizer` and the owner.
