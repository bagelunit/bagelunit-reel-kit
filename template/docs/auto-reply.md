# Auto-reply to comments and send DMs (optional)

A reel that ends on "comment WORD and I'll send it" needs something that answers those comments: a short public reply and a DM with the resource. The kit does **not** include that piece. `/comment-responder` drafts the rule (the keyword, the public reply, the DM); this page explains how to connect it for this brand. It is set up once per brand, per Instagram handle, with the brand owner's own accounts.

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

### A. A no-code tool (fastest)

Tools such as ManyChat connect to an Instagram professional account and run a "comment keyword, reply, then DM" automation on their own servers. You connect the account and paste in the rule from `/comment-responder`. Check the tool's current price and terms first. Turn it on for one reel and test it from a second account.

### B. Your own small service (Meta's API)

Build it yourself if you want to own the whole thing and pay nothing per month. The shape that works:

1. **A web address that is always on**, on HTTPS with a valid certificate. A Cloudflare Worker or a serverless function works. Use one deployment per brand, each with its own token, storage and rules, so brands never mix.
2. **A Meta app** with the Instagram product, "Instagram API with Instagram Login" (Business Login for Instagram), and the permissions `instagram_business_basic`, `instagram_business_manage_comments` and `instagram_business_manage_messages`. The Instagram account must be a public professional account. Meta's webhook setup page says the app must be Live, the `comments` webhook needs Advanced Access, and production access needs business verification, so plan for App Review.
3. **The webhook:** Meta first sends a GET request with `hub.mode`, `hub.verify_token` and `hub.challenge`; answer with the challenge when the token matches yours. After that every new comment arrives as a POST. Check the `X-Hub-Signature-256` header (a SHA-256 signature made with your app secret) before trusting it, answer 200 at once, and do the work after. Subscribe the app to the `comments` field, then enable it for the account with `POST https://graph.instagram.com/<version>/<account id>/subscribed_apps?subscribed_fields=comments`.
4. **For a matching comment:**
   - public reply: `POST https://graph.instagram.com/<version>/<comment id>/replies` with `message`;
   - DM (a "private reply"): `POST https://graph.instagram.com/<version>/<account id>/messages` with `recipient.comment_id` and `message.text`.
   Meta allows one private reply per comment, within 7 days of the comment. A follow-up is only possible if the person writes back, within 24 hours.
5. **Safety in the service itself:** start in a dry-run mode that only logs what it would send; remember every comment it handled (Meta retries, so the same comment can arrive twice); ignore the brand's own comments; cap sends per hour; refuse a public reply that contains a link; keep a list of comments left for a person.
6. **The token:** use a long-lived Instagram User access token and refresh it before it expires (about 60 days), for example with a weekly scheduled job.

Meta changes these pages often. Read the current ones (private replies, comment moderation, webhooks) before you build, and note the API version you used.

## Test, then go live

1. Run it in dry run and comment the keyword from a second account. Check it would send the right reply and DM.
2. Add the keyword to `cta.tested_keywords`, set `autopilot.dm_replies` to `true` with the date, and switch the service to live.
3. Comment again from the second account and confirm the reply and the DM arrive.
4. Only then post a reel that asks people to comment that word.
