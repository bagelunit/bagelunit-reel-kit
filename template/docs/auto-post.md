# Post reels automatically (optional)

By default a person posts every reel (house rule 11). If the brand owner wants approved reels to go out on a schedule, this page lists the ways to do it. The kit comes with its own publisher (`publisher/` in this folder), which posts on Instagram, the Facebook Page and Threads, but only once the owner has set it up on their own Cloudflare account and said yes to each reel. It is set up once per brand, with the brand owner's own accounts.

## Before anything goes out

These rules from `CLAUDE.md` still apply, whichever way you connect it:

- `brand.json` -> `autopilot.post` is `true`, turned on by the brand owner with the date (section 3b), before anything is posted live. It starts `false`. The one exception is the test: with the kit's publisher in dry run on every platform the reel goes to, a reel can be scheduled without it, because a dry run posts nothing.
- Only a reel that passed Gate C goes out, and only the exact file that was approved. `kit gate <reel> check` must print MATCH: a file changed after approval is not posted. The latest review in `approvals.md` must also say "meets the bar" with 90/100 or more (the same bar as Gate C): the scheduler refuses a reel with no review or a lower score. Only the owner's `--skip-review "reason"` at Gate C, which is written into the record, gets past it.
- The owner says yes to each reel's time slot. Scheduling is a yes per reel, not a standing permission.
- The caption is the approved `out/caption.txt`, with only cleared facts (rule 1).
- Claude never logs in, never handles a token or password, and never starts a scheduled job by itself.

## Three ways to do it

### A. The kit's publisher (recommended)

A small program in `publisher/` that runs on Cloudflare's free plan (R2, its file storage, needs a card on file even when free) and posts at the time you approved, even when your computer is off: the reel on Instagram (with the approved cover, as a trial reel when it is an A/B test), the same reel as a Facebook Reel on your Page, a Threads post (the video, or a short text with the reel's link), a YouTube Short and a TikTok (a draft in your TikTok inbox, or a direct post that TikTok keeps private until it has audited the app). Once a reel is approved it goes to every platform the brand has connected, without asking again for each one. It refuses a file or cover that changed after Gate C, starts in dry run on every platform, checks Meta's daily limits, deletes each file once it is posted, and reports back to the dashboard with each post's link.

Set it up with `docs/connect.md` (steps 2A or 2B and 3 to 4 for the tokens, step 6 for the publisher, 6B for YouTube Shorts and 6C for TikTok; the older Facebook Page setup is not supported), or type `/reel-posting` and pick "The kit's publisher". Every command and setting is in `publisher/README.md`.

**Already have a publisher?** If the brand already posts through another scheduler or a Worker of its own, set the kit's publisher up next to it (its own Worker, storage and files on the same Cloudflare account are fine) and test it in dry run. Only one of them may schedule a given reel, or it posts twice: from the day the kit's publisher is set up, schedule every reel through it alone. Meta sends comment webhooks to one address per app, so point the webhook (`docs/connect.md` step 7) at the publisher that answers keyword replies. Retire the old one after the kit's publisher has posted live once.

### B. Instagram's own scheduler (free, a person uploads)

In the Instagram app or Meta Business Suite, upload the approved mp4 from `reels/<slug>/out/`, paste `out/caption.txt`, set the cover from `out/cover.jpg` and pick a time. A person still uploads, but not at the posting moment.

### C. A scheduling app

A scheduling app connects to an Instagram professional account and posts at a set time. You upload the approved file and cover once. Check the app's current price and terms first.

## Test, then go live

1. With the publisher in dry run, schedule one approved reel a few minutes ahead (`/reel-posting`). `autopilot.post` can still be `false` for this: a dry run posts nothing. After its time, check with `node publisher/scripts/schedule.mjs status` that it would have posted the right file, cover and caption on each platform.
2. Only then, with the owner's yes, set `autopilot.post` to `true` with the date, and switch Instagram to live (`docs/connect.md` step 6, point 10).
3. Schedule a new reel and check it on Instagram: video, caption, cover. The test from step 1 does not post: a post scheduled in dry run stays a dry run, even after the publisher goes live. Then Facebook, Threads, YouTube and TikTok the same way, one at a time (YouTube and TikTok have not been used live by the kit yet: watch the first real post).
4. After posting, add the reel's row to `brand/log.md` as usual.
