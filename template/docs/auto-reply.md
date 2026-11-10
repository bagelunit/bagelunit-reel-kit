# Auto-reply to comments and send DMs (optional)

A reel that ends on "comment WORD and I'll send it" needs something that answers those comments: a short public reply and a DM with the resource. The kit's publisher (`publisher/`) can do it once you set it up and test it; `/comment-responder` writes the rule (the keyword, the public reply, the DM) with you. This page lists the ways to connect it for this brand. It is set up once per brand, per Instagram handle, with the brand owner's own accounts.

## Before anything goes live

These rules from `CLAUDE.md` still apply, whichever way you connect it:

- `brand.json` -> `autopilot.dm_replies` is `true`, turned on by the brand owner with the date (section 3b). It starts `false`.
- The keyword is listed in `brand.json` -> `cta.tested_keywords`, which means it was tested by commenting from a second account (rule 4).
- The public reply never contains a link. The link goes in the DM only (rule 12).
- Replies and DMs only state what is in `brand/facts.md` (rule 1). A comment about price or a comparison with no cleared fact is left for a person.
- DMs go only to people who commented. No cold DMs (rule 6).
- A comment that matches no keyword is left for a person, never guessed at.
- Claude never logs in, never handles a token or password, and never starts a scheduled job by itself.

## Two ways to connect it

### A. The kit's publisher (recommended)

The same publisher that posts your reels (`docs/connect.md` step 6) answers keyword comments: one public reply without a link, one private message with the link, each comment once, within Meta's 7 days, at most 30 an hour, never to your own comments. Every automatic message ends with "(This is an automated reply.)" (some places require it by law; you can reword it, not remove it). It answers only rules marked tested, and only while its comment mode is live. Set it up with `docs/connect.md` step 7 and `publisher/README.md`, "Comment replies".

Meta's side, and it takes days to weeks: Meta sends comment notifications only to an app that is **Live** with **Advanced Access** to the comments permission, which means passing **App Review** (a description and a screen recording for each permission), and production access needs **Business Verification**. In development mode Meta sends none, so nothing can be tested before that, and the account must be public. Claude does each of these in your browser and asks before sending anything to Meta: `docs/connect.md` step 7 has the order. Plan for it before you promise a keyword in a reel.

### B. A no-code tool

A no-code comment-to-DM tool connects to an Instagram professional account and run a "comment keyword, reply, then DM" automation on their own servers. You connect the account and paste in the rule from `/comment-responder`. Check the tool's current price and terms first. Turn it on for one reel and test it from a second account.

## Test, then go live

0. Meta has approved the app and it is Live (`docs/connect.md` step 7, points 3 to 5). Before that, no comment reaches the publisher.
1. With the comment mode in dry run, comment the keyword from a second (public) account. Check (`node publisher/scripts/schedule.mjs status`, or the tool's log) it would send the right reply and DM.
2. Mark the rule tested, add the keyword to `cta.tested_keywords`, set `autopilot.dm_replies` to `true` with the date, and switch the comment mode to live.
3. Comment again from the second account and confirm the reply and the DM arrive.
4. Only then post a reel that asks people to comment that word.
