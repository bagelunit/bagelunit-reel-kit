# Auto-reply to comments and send DMs (optional)

A reel that ends on "comment WORD and I'll send it" needs something that answers those comments: a short public reply and a DM with the resource. The kit's publisher (`publisher/`) can do it once you set it up and test it; `/comment-responder` writes the rule (the keyword, the public reply, the DM) with you. This page lists the ways to connect it for this brand. It is set up once per brand, per Instagram handle, with the brand owner's own accounts.

**Be clear about the limit.** Automatic replies need Meta's approval of your app, which takes days to weeks and which nothing in the kit can speed up or skip (the Tech Provider step and the "Allowed usage" certification are legal clicks only you can make). Until then they stay in dry run, and you send each DM by hand or use a no-code tool (route B below).

## Before anything goes live

These rules from `CLAUDE.md` still apply, whichever way you connect it:

- `brand.json` -> `autopilot.dm_replies` is `true`, turned on by the brand owner with the date (section 3b). It starts `false`.
- The keyword is listed in `brand.json` -> `cta.tested_keywords`, which means it was tested by commenting from a second account (rule 4).
- The public reply never contains a link. The link goes in the DM only (rule 12).
- Replies and DMs only state what is in `brand/facts.md` (rule 1). A comment about price or a comparison with no cleared fact is left for a person.
- DMs go only to people who commented, or who write back to the private message that answered their comment. No cold DMs (rule 6).
- A comment that matches no keyword is left for a person, never guessed at.
- Claude never logs in, never handles a token or password, and never starts a scheduled job by itself.

## Link only for followers (optional)

Some brands give the link only to people who follow. The publisher can do it (`"require_follow": true` in the rule, `publisher/README.md`): the comment gets a public reply and a private message with a button, the person taps it or writes back, the publisher reads whether they follow through Meta, and then sends the link, or a short reminder to follow (a few times at most). It is two steps because Meta allows one private message in answer to a comment and only lets the follow status be read once the person has messaged you. If Meta does not say, no link is sent. Test it with `node publisher/scripts/setup.mjs follow-check` before turning it on. Expect some people to comment and never tap: that is the cost of the gate. The no-code tools in B below offer the same gate in their own way. With `"cards": true` the messages carry real buttons (Follow me, I'm following, Open the link) instead of plain text; see `publisher/rules.example.json` and `docs/connect.md` step 7, point 6c.

## Two ways to connect it

### A. The kit's publisher (recommended)

The same publisher that posts your reels (`docs/connect.md` step 6) answers keyword comments: one public reply without a link, one private message with the link, each comment once, within Meta's 7 days, at most 30 an hour, never to your own comments. Every automatic message ends with "(This is an automated reply.)" (some places require it by law; you can reword it, not remove it). It answers only rules marked tested, and only while its comment mode is live. Set it up with `docs/connect.md` step 7 and `publisher/README.md`, "Comment replies". It works with Instagram Login or Unified Login (`docs/connect.md` 2A or 2B), not with the older Facebook Page setup.

Meta's side, and it takes days to weeks: Meta sends comment notifications only to an app that is **Live** with **Advanced Access** to the comments permission, which means passing **App Review** (a description and a screen recording for each permission), and production access needs **Business Verification**. In development mode Meta sends none, so nothing can be tested before that, and the account must be public. Before the permissions can even go into App Review, Meta asks the app's owner to become a **Tech Provider** (it cannot be undone), and a new review bundles every permission on the app into one submission, so remove the ones you do not need first (`docs/connect.md` step 7, point 4b). Claude does each of these in your browser and asks before sending anything to Meta: `docs/connect.md` step 7 has the order. Plan for it before you promise a keyword in a reel.

### B. A no-code tool

A no-code comment-to-DM tool connects to an Instagram professional account and runs a "comment keyword, reply, then DM" automation on its own servers. You connect the account and paste in the rule from `/comment-responder`. Check the tool's current price and terms first: such tools typically cost about $15 to $40 a month, billed per contact or per message, and which features are paid differs (some charge for the public reply). This route skips your own App Review, because the tool uses its own approved Meta app. There are reports of Instagram restricting accounts after one of these tools is connected, so turn it on for one low-stakes reel first and test it from a second account.

## Test, then go live

0. `node publisher/scripts/setup.mjs subscribe` has turned on the account's notifications (`docs/connect.md` step 7, point 2), and Meta has approved the app and it is Live (points 3 to 5). Before that, no comment reaches the publisher.
1. With the comment mode in dry run, comment the keyword from a second (public) account. Check (`node publisher/scripts/schedule.mjs status`, or the tool's log) it would send the right reply and DM.
2. Mark the rule tested, add the keyword to `cta.tested_keywords`, set `autopilot.dm_replies` to `true` with the date, and switch the comment mode to live.
3. Comment again from the second account and confirm the reply and the DM arrive.
4. Only then post a reel that asks people to comment that word.
