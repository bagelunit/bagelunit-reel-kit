# Post reels automatically (optional)

By default a person posts every reel (house rule 11). If the brand owner wants approved reels to go out on a schedule, this page explains how to connect a publisher for this brand. The kit itself never posts. It is set up once per brand, per Instagram handle, with the brand owner's own accounts.

## Before anything goes out

These rules from `CLAUDE.md` still apply, whichever way you connect it:

- `brand.json` -> `autopilot.post` is `true`, turned on by the brand owner with the date (section 3b). It starts `false`.
- Only a reel that passed Gate C goes out, and only the exact file that was approved. `kit gate <reel> check` must print MATCH: a file changed after approval is not posted.
- The owner says yes to each reel's time slot. Scheduling is a yes per reel, not a standing permission.
- The caption is the approved `out/caption.txt`, with only cleared facts (rule 1).
- Claude never logs in, never handles a token or password, and never starts a scheduled job by itself.

## Three ways to do it

### A. Instagram's own scheduler (simplest, free)

In the Instagram app or Meta Business Suite, upload the approved mp4 from `reels/<slug>/out/`, paste `out/caption.txt`, set the cover and pick a time. A person still uploads, but not at the posting moment.

### B. A scheduling tool

Tools such as Buffer or Later connect to an Instagram professional account and post at a set time. You upload the approved file once. Check the tool's current price and terms first.

### C. Your own publisher (Meta's API)

Build it yourself if you want it to run on its own and pay nothing per month. The shape that works:

1. **An always-on service** (a Cloudflare Worker or a serverless function), one per brand, with its own token, storage and schedule.
2. **A Meta app** with "Instagram API with Instagram Login" and the permissions `instagram_business_basic` and `instagram_business_content_publish`. The account must be a professional account.
3. **The video must be at a public web address** when Meta fetches it. Keep it at a secret, unguessable address only until the post is published, then delete it.
4. **Publishing a reel is three calls** (on `graph.instagram.com`): create a container with `POST /<account id>/media` and `media_type=REELS`, `video_url` and `caption`; check `GET /<container id>?fields=status_code` until it says `FINISHED` (about once a minute, a few minutes at most); then `POST /<account id>/media_publish` with `creation_id`. A container that is not published within 24 hours expires.
5. **Limits:** 100 posts through the API per account in 24 hours (`GET /<account id>/content_publishing_limit`). Meta has no scheduling of its own, so your service keeps the schedule.
6. **Safety in the service itself:** start in a dry-run mode that only logs what it would post; before uploading, check the file's fingerprint against the Gate C record in `approvals.md`; check `autopilot.post`; ask for a typed confirmation per reel; record each scheduled post under `## Posting` in the reel's `approvals.md`; refresh the token before it expires (about 60 days).

Meta changes these pages often. Read the current content publishing page before you build, and note the API version you used.

## Test, then go live

1. Run it in dry run and schedule one approved reel a few minutes ahead. Check it would post the right file and caption.
2. Set `autopilot.post` to `true` with the date, switch the service to live, and post one reel. Check it on Instagram: video, caption, cover.
3. After posting, add the reel's row to `brand/log.md` as usual.
