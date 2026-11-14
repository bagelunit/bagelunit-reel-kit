---
name: reel-posting
description: >
  Get an approved reel posted: a posting card for posting by hand, scheduling it through the kit's publisher
  on Instagram, the Facebook Page, Threads, YouTube Shorts and TikTok, or setting up automatic posting for this brand step by step.
  Use when the user says "post this", "how do I post it", "schedule this reel", "post it on Tuesday", "post it
  on Facebook / Threads / YouTube / TikTok too", "set up auto-posting", "post automatically", or after Gate C is approved.
user-invokable: true
argument-hint: "[reel folder, e.g. reels/<slug>] [when]"
metadata:
  author: BagelUnit
  version: "2.0.0"
  category: content
---

# Reel posting: from an approved file to a live post

Ask every choice with a question block (AskUserQuestion). Nothing is posted by Claude unless the brand owner
connected a publisher and said yes to that reel's time (CLAUDE.md rule 11).

## Gate (read first)

1. The reel passed Gate C: `approvals.md` has a Gate C record, and `kit gate <reel> check` prints MATCH. If it
   prints CHANGED SINCE APPROVAL, stop: the file was edited after approval and needs Gate C again.
   Its latest review must say "meets the bar" with 90/100 or more too: the scheduler refuses a reel with no review
   or a lower one. Run /reel-review, fix what it names and rebuild; do not edit the number. Only the owner overrides
   it, at Gate C, with `--skip-review "reason"`.
2. `out/caption.txt` exists and passed `/humanizer`; the cover (`out/cover.jpg`) exists.
3. Read `brand/brand.json` -> `autopilot.post` and `posting.method` to know which route this brand uses.

## Route 1: posting by hand (the default)

Give the owner a **posting card** and nothing else to think about:

- **File:** the full path of `out/<name>.mp4` (and how to get it to the phone: AirDrop, Google Drive, a cable).
- **Cover:** `out/cover.jpg` (made by `kit cover`, approved at Gate C). Send it to the phone together with the video (AirDrop both, or one Drive folder). In Instagram: Edit cover, then Add from camera roll. In a scheduling app: upload it as the cover in the post editor. A connected publisher sets it by itself on Instagram and on the Facebook Reel, so nothing to do there.
- **Caption:** the text of `out/caption.txt`, ready to copy.
- **Settings:** Settings and privacy, Media quality, turn on "Upload at highest quality".
- **When:** the reel's date in `brand/plan.md` if it has one, else the next open slot from `/content-calendar`
  (`brand.json` -> `posting.days` and `posting.times`, or the older single `posting.time`), else a time from the brand's own `brand/log.md` (when
  its best reels went out), or say there is no data yet. Instagram's own scheduler (Advanced settings, Schedule this post) can hold it until then.
- **After posting:** ask (question block) "Posted" or "Scheduled in Instagram for <time>", then add the line
  to `approvals.md` under `## Posting` and, once it is live, the reel's row to `brand/log.md` (date, hook
  formula, first line, goal, angle, review verdict). Then run `/content-calendar` so the calendar shows it.
  Write the `## Posting` line in one of these shapes, so the calendar can read it (time in the brand's timezone):
  - `- 2026-11-09 21:05 Posted by hand on @handle: https://www.instagram.com/reel/...` (ask for the post's link,
    "Copy link" in Instagram; it lets the dashboard match the post to this reel. Without it, leave the link out)
  - `- 2026-11-10 09:00 Scheduled in Instagram for 2026-11-12 18:00`
  - `- 2026-11-11 08:00 Cancelled post <id>` (when a scheduled post is cancelled)

## Route 2: setting up automatic posting (once per brand)

Only when the owner asks. Walk it one step at a time and keep a short checklist in the reply.

1. **Pick the route** (question block): "The kit's publisher (Recommended: posts by itself on Instagram, your
   Facebook Page and Threads, free on Cloudflare)", "Instagram's own scheduler (free, a person uploads)",
   "A scheduling app", "Not now". Read `docs/auto-post.md` for the chosen route.
2. **Scheduler or app:** give the exact steps in plain words; the owner connects the account and logs in.
   Record `posting.method` in `brand.json` ("instagram-scheduler", "tool: <name>").
3. **The kit's publisher** (`publisher/` in this folder): walk `docs/connect.md` step 6 with the owner, one step
   at a time, and run each step yourself after the owner's yes. With the browser tool (rule 15 in `CLAUDE.md`, `docs/browser.md`), do the web pages yourself; the owner logs in, copies each secret into the file you opened, and clicks the last Delete. Run
   `node publisher/scripts/setup.mjs` (it reads Instagram Login or Unified Login from `instagram-<slug>.json`; with
   `"login": "facebook"` it stops: the publisher needs `docs/connect.md` step 2A or 2B, so say so and connect that
   first), then the commands it prints, in order: `npx wrangler login` (it opens Cloudflare in the
   browser: the owner logs in, you click Allow), the KV storage (`npx wrangler kv namespace create <slug>-kv`), turning
   on R2 (it needs a checkout with a card even on the free plan: say so, ask, and stop at the payment form for the
   owner; "Not now" ends the publisher setup here), the R2 bucket, `node publisher/scripts/setup.mjs deploy` (it counts the cron triggers other workers already
   use on the Cloudflare account and stops before the free plan's 5; tell the owner its line as it is, and use
   `--anyway` only after the owner says the account is on Workers Paid; it tries once more by itself on "This Worker
   does not exist", code 10007), `setup.mjs --url
   <address>`, `setup.mjs secrets --dry-run`, then `setup.mjs secrets` (it moves every token from the owner's files to
   Cloudflare without showing it; never use `wrangler secret put` with a value yourself, and never ask for a token).
   Then `node publisher/scripts/setup.mjs check`. Record `posting.method` = "publisher". Then ask **once** where every reel
   goes (one question block, multi-select: Instagram first, then the other connected platforms) and save the answer in
   `brand.json` -> `posting.platforms`; route 3 uses it for every reel without asking again.
4. **Test once in dry run** with one approved reel (route 3), before `autopilot.post` is on: with every platform it
   goes to in dry run, `schedule.mjs` allows it without `autopilot.post` (a dry run posts nothing). At its time the
   publisher records what it would send and posts nothing; `node publisher/scripts/schedule.mjs status` and the
   dashboard show it. Question block: "It would have sent the right thing", "Something is wrong".
5. **Turn it on:** only after the owner picks "Turn on automatic posting" in a final question block, set
   `autopilot.post` to `true` and write the date in the `_note`.
6. **Going live**, one platform at a time (`publisher/README.md`, "Dry run and going live", and `docs/connect.md`
   step 6, point 10): only after the owner's yes for that platform in this conversation, you set
   `PUBLISH_MODE_INSTAGRAM` (or `_FACEBOOK`, `_THREADS`, `_YOUTUBE`, `_TIKTOK`) to `"live"` in `publisher/wrangler.toml` and run
   `npx wrangler deploy` in the `publisher` folder, then `node publisher/scripts/setup.mjs check` to show it LIVE. If
   the platform was in dry run for more than about 50 days, first run `setup.mjs secrets --only IG_TOKEN` (or
   `THREADS_TOKEN`): the publisher does not renew tokens in dry run. Tell the owner the dry-run test stays a dry run
   and schedule a new post to post live.

## Trial reels (A/B tests)

If the reel's folder, or its version A's folder, has a `test.json` (see `/ab-hook-tester`), it is one version of an
A/B test and goes out as a **trial reel**: Instagram shows it to non-followers first.
- On the posting card, add: "Post this as a trial reel: turn on the trial option when you share it, and choose to share
  it to your followers yourself later." Post every version of the test within the same hour.
- The posting line says so: `- 2026-11-10 18:02 Posted as a trial reel on @handle: <link>`. The link matters most here:
  it is how the dashboard tells the versions' numbers apart.
- With the kit's publisher, add `--trial`: it sends `trial_params` with `graduation_strategy` `MANUAL`.
- Once the dashboard calls a winner, `/ab-hook-tester record` takes over (sharing the winner to followers happens in the
  Instagram app; Meta's API cannot do that step).

## Route 3: scheduling one reel (after route 2 is set up)

**Once a reel is approved it goes everywhere the brand is connected, with no question per platform.** Platforms:
`brand.json` -> `posting.platforms` when the owner fixed a list, otherwise every platform the publisher shows as
connected (`schedule.mjs` reads that itself and names any it left out). **Where it goes and when are the brand's
standing choices, not a question for every reel.** Time: the reel's row in `brand/plan.md`
(the month is planned ahead, and `/content-calendar best-times` moves the times toward what works). Ask for them
**once**, when route 2 is set up, and save them: the platforms with the owner's yes (only platforms `setup.mjs check`
shows as connected, Instagram first), the times through `/content-calendar plan` or `days`. Never describe the
posting flow as "I pick the time and tick the platforms" in a script or a caption: the brand's real setup is fixed
platforms and planned times.

1. Run the Gate above. Then look for the standing choices:
   - **Both set** (`posting.platforms` is filled in, and the reel has a row in `brand/plan.md` with a date and a
     time): go to step 3 with `--from-plan`, no question yet.
   - **Platforms missing:** the default is every connected platform, so there is nothing to ask. Only if the owner
     wants fewer, ask once (multi-select: "Instagram" first, "Facebook Page", "Threads", "YouTube Shorts", "TikTok",
     only the connected ones) and save the answer in `brand.json` -> `posting.platforms`. For Threads
     the default is the video; "a short text with the reel's link" is a per-reel choice (`--threads text`).
   - **No plan row, or the row has no time:** ask the time (question block with 2 or 3 suggested slots from
     `posting.times`, plus Other; the timezone if `brand.json` has none), then offer to add the row to `plan.md`.
2. If `/reel-repurpose` has not written `out/platforms/facebook.txt`, `threads.txt`, `youtube.txt` or `tiktok.txt`,
   say the caption is used (Threads allows 500 characters; YouTube's title, the caption's first line, must be 100 at
   most, so a YouTube Short wants its own `youtube.txt`: title on the first line, then the description; TikTok allows
   2,200). Run `/reel-repurpose <reel> tiktok shorts` first when they are missing and the platform is connected;
   each text is written and humanized first.
   Two things to say plainly in the summary: a **TikTok draft** is not posted, it waits in the owner's TikTok inbox
   for a tap in the app (a direct post is private until TikTok has audited the app), and YouTube and TikTok have not
   been used live yet, so the first real post is one the owner watches.
3. Run the checks without sending anything:
   `node publisher/scripts/schedule.mjs reels/<slug> --from-plan [--platforms <list>] [--threads text] [--trial] [--tiktok-mode draft|direct] [--youtube-privacy public|unlisted|private] [--ai-generated] --preview`
   (or `--at <ISO time with offset>` when there is no plan row; `--platforms` only overrides the brand's list for
   this one reel). Show its summary (it says DRY RUN or LIVE: this really posts, where the time and platforms came
   from, and the posting card), then ask **one question**: "Schedule it at <the summary's time> on <its platforms>?"
   (question block: "Schedule (Recommended)", "Change something", "Not now"). That one yes is the owner's yes to this
   reel, its time and its platforms (house rule 11). If the preview refuses (Gate C, a changed file or cover, a
   caption too long, a video too long for a platform, mixed modes, a plan row with no time or a time that has passed, or a
   live publisher while `autopilot.post` is off), say why in plain words and stop. In dry run, say that this post
   stays a dry run even if the publisher goes live before its time. A video too long only for Facebook (over 90
   seconds) or a story (over 60) can still go to the other platforms: offer that as a choice, never drop a platform
   without the owner's yes.
4. After the owner's yes, run the same command with `--yes` in place of `--preview`. It uploads the approved video
   and cover, schedules them and writes the "Scheduled" line under `## Posting` itself. Without the publisher,
   schedule it the brand's way and write the line yourself (shapes above).
5. Run `/content-calendar` so the calendar shows it. After its time, the refresh (or
   `node publisher/scripts/pull.mjs`) brings back what went out and writes the "Posted on" lines with links; then
   add the `brand/log.md` row.
6. **Cancel** on the owner's word only: `node publisher/scripts/schedule.mjs status`, then `cancel <post id>`. If it
   answers "too late to cancel", the publisher is posting it or already sent it to Meta: say so, check `status` a
   few minutes later, and if it went out the owner deletes it in the app.

## Route 4: a carousel that goes with a reel (Instagram only)

For example a facts carousel per episode. The slides (JPEG at 1080x1350, or MP4 clips of 3 to 60 s; 2 to 20 items)
go in `reels/<slug>/out/carousel/` named in posting order (`01.jpg`, `02.jpg`, ...), with `caption.txt` next to them
(`/ig-carousel` and `/reel-repurpose <reel> carousel` plan the copy; every claim is in `brand/facts.md`).
1. `node publisher/scripts/carousel.mjs files reels/<slug>` lists the items in order and every check (JPEG or MP4
   only, sizes, one shape for every slide, the caption). Fix what it names.
2. Show the approver every slide (a contact sheet or the files) and the caption, then ask "Approve this carousel?"
   (question block: "Approve (Recommended)", "Change something", "Stop"). After the yes:
   `node publisher/scripts/carousel.mjs approve reels/<slug>` records one fingerprint over every slide and the
   caption under `## Carousel` in `approvals.md`. A slide or the caption changed afterwards needs this step again.
3. `node publisher/scripts/carousel.mjs schedule reels/<slug> --at <ISO time with offset> --preview`, show its summary,
   ask "Schedule it at <time>?" (one question, as in route 3), then the same command with `--yes`. It writes its line
   under `## Carousel`, never under `## Posting`, so the reel's own record and the dashboard are unchanged; `pull.mjs`
   adds the carousel's link there once it is out. `schedule.mjs status` and `cancel` work for carousels too.

## Two things the APIs cannot do (say them, do them by hand)

- **A Short's related video.** YouTube's API cannot set the "related video" link that sends Shorts viewers to the full
  episode. After a Short is up, the owner links it in YouTube Studio (the Short's details, "Related video").
- **Instagram edits.** A posted caption cannot be changed through the API (see `docs/auto-post.md`).

## When Claude Code blocks the command

In auto mode, Claude Code may stop `schedule.mjs ... --yes` (or `carousel.mjs schedule ... --yes`) as an outward
action, even for a dry run. Say so in one line and leave the choice to the owner: they can allow it once when asked,
or add `Bash(node publisher/scripts/schedule.mjs:*)` (and `Bash(node publisher/scripts/carousel.mjs:*)`) in
`/permissions` for this brand folder. The scripts still refuse anything without Gate C (or a carousel approval), and
`--yes` is still only used after the owner's yes in this conversation.

## Never

- Never post or schedule a reel that did not pass Gate C, or a file that changed after it.
- Never type a password, never ask for or print a token or key, and never pass a secret to a command yourself: `setup.mjs secrets` moves them. `wrangler login`, the storage commands and `wrangler deploy` run only during setup or a change the owner said yes to. `npx wrangler delete` is shown to the owner to run, never run by you.
- Never use `--yes` without the owner's yes to that reel, its time and its platforms in this conversation (the one question in step 3 is that yes, because it shows the time and the platforms).
- Never switch a platform from dry run to live without the owner's yes for that platform in this conversation.
- Never change the caption at posting time; a changed caption goes back through `/humanizer` and the owner.
