# The publisher: posting your approved reels on a schedule

This folder is your brand's own publisher. It is a small program that runs on Cloudflare (a "Worker") and, at the time you choose, posts an approved reel on Instagram, and if you want also on your Facebook Page and on Threads. It can also answer comments that ask for something by keyword, with a public reply and a private message.

Nothing is posted until you say yes to that reel and its time, it starts in **dry run** (it pretends, and writes down what it would have sent), and only the exact files you approved at Gate C go out.

## What it does

- **Posts at the time you pick.** You run one command for an approved reel. It checks the reel, shows you a summary, and asks you to type your handle. Then it uploads the video and the approved cover and schedules them.
- **Only the approved files.** Gate C writes down a fingerprint (SHA-256) of the final video and its cover. The command refuses if either file changed since. The publisher checks the fingerprint again when the file arrives, byte for byte.
- **Instagram:** reels (with your approved cover, or a frame of the video when there is no cover), trial reels, collaborators, a location, tagged people, an audio name, and also the same reel as a story. The publisher can also post single images, carousels (2 to 20 images and videos) and stories.
- **Facebook Page:** the same reel as a Facebook Reel, with its own description.
- **Threads:** a post for each reel, either the video itself or a short text with the link to the Instagram reel. You pick for each reel.
- **Comment replies (optional):** when someone comments a keyword you set up, it posts one public reply (never with a link) and sends one private message with the link. Every automatic message ends with a short line saying it is automated (see below).
- **Mentions and messages:** it keeps a copy of mentions and messages for 90 days so the dashboard can show them. It never answers a message by itself.
- **Back to the dashboard:** one command brings back what really went out (links, ids, errors), so the dashboard shows it.

## What it costs

Nothing for a normal brand, within Cloudflare's free amounts. One catch: Cloudflare turns R2 (the file storage) on only through a checkout with a card, even on the free plan, and bills any use above the free amount to it. Claude stops at that payment form for you (`docs/connect.md` step 6, point 4).

- Workers free plan: 100,000 requests a day. The publisher wakes up every 5 minutes (288 times a day) plus Meta's visits.
- Storage (KV) free: 100,000 reads and 1,000 writes a day. A reel uses a few dozen.
- File storage (R2) free: 10 GB a month. A reel is stored only until it is posted, then deleted.
- Free plan limits worth knowing: files up to 100 MB each (the command stops at 95 MB), and 5 scheduled triggers per Cloudflare account. Each brand's publisher uses one, so one free account runs up to 5 brands.

Meta charges nothing for these APIs.

## What each platform needs from Meta

You make one Meta app (developers.facebook.com) and give it these permissions. Each token goes into a file on your computer (`~/.config/bagelunit-reels/`, `docs/connect.md` steps 2 to 4), and `node publisher/scripts/setup.mjs secrets` moves it into Cloudflare without showing it. Nobody types a token into Cloudflare or a terminal, and Claude never sees one.

| Platform | Permissions | Secrets (sent by `setup.mjs secrets`) |
| --- | --- | --- |
| Instagram (Instagram Login) | instagram_business_basic, instagram_business_content_publish, plus for comment replies and messages instagram_business_manage_comments and instagram_business_manage_messages, and for numbers instagram_business_manage_insights | IG_USER_ID, IG_TOKEN (a long-lived Instagram user token; the publisher renews it about once a week) |
| Instagram (Unified Login) | the same with Unified Login's names: instagram_basic, instagram_content_publish, instagram_manage_comments, instagram_manage_messages, instagram_manage_insights | IG_USER_ID, IG_TOKEN (the token from `docs/connect.md` step 2B, which Meta calls a system-user access token; pick "Never" for its end date there, because the publisher never renews it), and `API_SETUP = "unified"` in wrangler.toml |
| Facebook Page | pages_manage_posts and pages_read_engagement (and pages_show_list), from someone who can create content on the Page | FB_PAGE_ID, FB_PAGE_TOKEN |
| Threads | threads_basic and threads_content_publish | THREADS_USER_ID, THREADS_TOKEN (long-lived; renewed about once a week) |

The older Facebook Page setup (`"login": "facebook"` in the Instagram file) is not supported: its 60-day Facebook token is never renewed, so `setup.mjs` stops and asks for Instagram Login or Unified Login.

For every brand: ADMIN_KEY (a long random string only you and the kit know), and for comment replies APP_SECRET (from the Meta app) and VERIFY_TOKEN (another random string).

Things to know:

- **Collaborators** work only with Unified Login (`API_SETUP = "unified"`). Up to 3, not on stories.
- **Trial reels** are shown to people who do not follow you first. You decide in the Instagram app whether to share it with your followers. Facebook and Threads posts are always shown to followers.
- **Video lengths:** an Instagram reel 3 seconds to 15 minutes, a story (or a reel shared to the story) 3 to 60 seconds, a Facebook Reel 3 to 90 seconds, a Threads video up to 5 minutes. The schedule script reads the video's length on your computer and the publisher reads it again from the uploaded copy, so a reel too long for a platform is refused before anything is scheduled, with the platform it is too long for. A Threads text post only links to the reel, so the length does not matter there.
- **Covers:** the approved cover (a JPEG of 8 MB at most) is the Instagram cover and, once the Facebook Reel is ready, the Facebook cover too. If Facebook refuses the cover, the reel stays posted with Facebook's own frame and `status` shows why.
- **Limits Meta sets:** Instagram counts posts in a 24-hour window (the publisher asks Instagram how many are left before each post and waits if none are), Facebook allows 30 reels a day per Page, and Threads 250 posts a day. When a limit is reached the post waits for the next run instead of failing.
- Until your Meta app passes Meta's review, it can only post for people with a role on the app (admins and testers). That is fine for your own accounts: `docs/connect.md` steps 2 to 4 add them.

## Setting it up

Claude runs these from your brand folder (`/reel-posting`, "The kit's publisher"), and does the Cloudflare pages in your browser with the browser tool (`docs/browser.md`). You log in to Cloudflare; no token is copied by hand. The full walk-through is `docs/connect.md` step 6.

```
node publisher/scripts/setup.mjs
```

It reads from your Instagram file whether this brand uses Instagram Login or Unified Login (or take `--api-setup instagram|unified`, which must match the file), writes `publisher/wrangler.toml` and prints the steps, in order: log in to Cloudflare (`npx wrangler login`), make the storage (`npx wrangler kv namespace create <brand>-kv`, then `node scripts/setup.mjs --kv-id <id>`; turn on R2 in the dashboard, Storage & databases, R2, Overview, the checkout with a card; then `npx wrangler r2 bucket create <brand>-reels`), put it online (`npx wrangler deploy`), save its address (`node scripts/setup.mjs --url <address>`), then send the secrets:

```
node publisher/scripts/setup.mjs secrets --dry-run     (lists what it would send and from which file, no values)
node publisher/scripts/setup.mjs secrets
```

`secrets` takes each value from the token files the connection checks wrote in `~/.config/bagelunit-reels/` (the brand's own `instagram-<brand slug>.json` and `threads-<brand slug>.json`, or a shared `instagram.json` / `threads.json`; with a shared file the account id comes from `instagram-<brand slug>.ids.json` or `threads-<brand slug>.ids.json`, never from the shared file, which may hold another brand's id; the Facebook Page token only from `facebook-<brand slug>.json`), makes `ADMIN_KEY` and `VERIFY_TOKEN` once (kept in `publisher-<brand slug>.json`, which the kit uses to reach the publisher), and hands each one to `npx wrangler secret put` without showing it. The Meta app secret (only for comment replies) is the one value you paste: into `publisher-<brand slug>.json` as `"app_secret"`; the script removes it from there once Cloudflare has it. Use `--only IG_TOKEN,THREADS_TOKEN` to send just some. A value that still reads `PASTE-...` is skipped and named, never sent.

The KV namespace is named per brand (`<brand>-kv`) so several brands fit in one Cloudflare account. The binding in `wrangler.toml` stays `KV`, so a publisher set up earlier with a namespace called `KV` keeps working unchanged.

Then check it:

```
node publisher/scripts/setup.mjs check
```

It shows each platform, whether it is connected, and whether it is in dry run or live.

## Scheduling a reel

The reel needs Gate C first. A live post also needs `"autopilot": {"post": true}` in `brand/brand.json` (only the brand owner turns that on); a dry run can be scheduled without it, so you can test before turning posting on.

```
node publisher/scripts/schedule.mjs reels/<slug> --at 2026-11-10T09:00:00-05:00
```

Options:

- `--platforms instagram,facebook,threads` (default: instagram)
- `--threads text` or `--threads video` (default video). Text posts the Threads text with the link to the Instagram reel, once Instagram has it.
- `--trial` a trial reel on Instagram
- `--story` also share the reel to your Instagram story
- `--collaborators name1,name2` (Unified Login only)
- `--location <id>` the id of a Facebook Page that has a location
- `--thumb-offset <ms>` which frame Instagram uses when there is no approved cover
- `--preview` run every check and show the summary, then stop (nothing is uploaded); Claude shows you this before asking
- `--yes` skip typing the handle (only when you already said yes to this reel and time)

If the publisher refuses the post after the files were uploaded, the command deletes them again. A file that is uploaded but never scheduled is deleted by the publisher within a day.

The texts: Instagram uses `out/caption.txt`. Facebook and Threads use `out/platforms/facebook.txt` and `out/platforms/threads.txt` when they exist, and the caption otherwise. Threads allows 500 characters (an emoji counts as several), so a long caption needs its own `threads.txt`.

It writes one line under "## Posting" in the reel's `approvals.md`, which the dashboard reads:

```
- 2026-11-09 14:02 Scheduled on @yourhandle for 2026-11-10T09:00:00-05:00: post 1a2b3c4d5e6f, file my-reel.mp4 sha256 0123456789ab, platforms instagram,threads, publisher in dry_run mode
```

Check and cancel:

```
node publisher/scripts/schedule.mjs status
node publisher/scripts/schedule.mjs cancel <post id>
```

A cancel works until the publisher starts sending the post to Meta. If it is too late (the publisher is posting it at that moment, or already sent it), the cancel says so: check `status` a few minutes later and, if it went out, delete it in the app.

## Bringing back what went out

```
node publisher/scripts/pull.mjs
```

It writes `brand/publisher.json` (every post, its status on each platform, ids, links and errors, plus mentions, messages and automatic replies) for the dashboard. For each post that went out it adds a line to the reel's `approvals.md`, once:

```
- 2026-11-10 09:05 Posted on @yourhandle: https://www.instagram.com/reel/...
- 2026-11-10 09:10 Posted on Facebook: https://www.facebook.com/reel/...
- 2026-11-10 09:05 Posted on Threads: https://www.threads.com/@yourhandle/post/...
```

Each automatic comment reply it sent goes in `brand/inbox-log.md`, once.

## Dry run and going live

Everything starts in dry run. In dry run a due post is marked "dry_run", the publisher writes down exactly what it would have sent (you can see it with `status` or in `brand/publisher.json`), its files are deleted, and nothing reaches Meta. That includes the weekly token renewal: it runs only while a platform that uses the token is live (Instagram posting or comment replies for the Instagram token, Threads posting for the Threads token).

**The mode is saved with each post.** A post goes out live only when it was scheduled live AND that platform is still live at its time. A post scheduled in dry run stays a dry run, even if you switch the platform to live before its time: after going live, schedule a new post.

Each platform has its own switch in `publisher/wrangler.toml`:

```
PUBLISH_MODE_INSTAGRAM = "dry_run"
PUBLISH_MODE_FACEBOOK = "dry_run"
PUBLISH_MODE_THREADS = "dry_run"
MODE = "dry_run"          (comment replies)
```

To go live on one platform:

1. Schedule one reel in dry run (no `autopilot.post` needed yet) and check with `status`, after its time, that it would have sent the right thing.
2. The brand owner turns on `autopilot.post` in `brand/brand.json`.
3. If the platform has been in dry run for more than about 50 days, send its token again first (`node publisher/scripts/setup.mjs secrets --only IG_TOKEN`, or `THREADS_TOKEN`): the publisher does not renew tokens in dry run, and a new token you send always replaces the one it renewed.
4. Change that platform's line to `"live"` and run `npx wrangler deploy` in the publisher folder (Claude does both after your yes, `docs/connect.md` step 6).
5. `node publisher/scripts/setup.mjs check` shows it as LIVE.
6. Schedule a new reel (the dry-run test stays a dry run). The summary says "LIVE: this really posts" before you type your handle.

The schedule command refuses a reel whose platforms are in different modes (for example Instagram live and Threads in dry run), so the `approvals.md` line is never wrong: schedule them separately with `--platforms`.

To stop at once, set the line back to `"dry_run"` and deploy again. Posts not yet sent will then only be recorded, even the ones scheduled live.

## Comment replies

Meta sends comment notifications only to an app that is Live with Advanced Access to the comments permission (App Review) and, for production, Business Verification; in development mode it sends none, and only public accounts get them. `docs/connect.md` step 7 has the whole order. In short:

1. Copy `rules.example.json` to `rules.json` and write your keyword, the public reply (no link) and the private message (with the link) (`/comment-responder` does this with you).
2. Upload it: `npx wrangler kv key put rules --path rules.json --binding KV --remote` (in the publisher folder).
3. Send the app secret (`setup.mjs secrets --only APP_SECRET`), then in the Meta app set the webhook address to `<your publisher address>/webhook` with the `"verify_token"` from `publisher-<brand slug>.json`, and pick the fields `comments` and `messages` (plus `mentions` with Unified Login; with Instagram Login mentions come inside `comments`).
4. Turn the notifications on for the brand's Instagram account, which Meta needs on top of the webhook:

   ```
   node publisher/scripts/setup.mjs subscribe --dry-run     (shows what it would ask Meta, sends nothing)
   node publisher/scripts/setup.mjs subscribe
   ```

   It sends `POST /<account id>/subscribed_apps` with those fields (graph.facebook.com for Unified Login, graph.instagram.com for Instagram Login), using the token in your Instagram file, in the Authorization header only, and never prints it.
5. App Review for Advanced Access to the comments and messages permissions, Business Verification, then switch the app to Live.
6. Comment the keyword from a second, public account while `MODE` is `"dry_run"`, check `status` and `/admin` show what it would send, then set `"tested": true` for that rule and `MODE = "live"`.

Safety rules that always apply: a rule sends only when it is tested and `MODE` is live; one public reply and one private message per comment; only within 7 days of the comment (Meta's rule); at most 30 an hour (`MAX_PER_HOUR`); never a reply to your own comments; never a link in a public reply.

**Every automatic message says it is automated.** Some places require this by law (for example California and Germany), and Meta's policy follows the law. The publisher adds the line `(This is an automated reply.)` to the end of every automatic private message. You can change the words with `"disclosure"` in `rules.json` or `DM_DISCLOSURE` in `wrangler.toml` (for example in another language), but you cannot turn it off: an empty setting uses the default.

If someone asks you to delete their data: `node publisher/scripts/forget.mjs <username>`. It removes their comment records and, through the id in those, their messages (messages carry only ids), then their lines in `brand/inbox-log.md` and their entries in `brand/publisher.json`. Remove anything you keep about them elsewhere yourself.

## Safety, in short

- Dry run by default, a separate switch for each platform.
- The admin key guards every admin address; the kit reads it from your own file and never prints it.
- Each file has its own secret, unguessable address while it waits, deleted after posting or cancelling.
- At most 5 posts per run (`MAX_PER_RUN`), and a limit on calls per run.
- A post Meta has not finished preparing in 30 minutes (60 for Facebook) is marked failed. A passing problem at Meta is retried up to 5 times, and every call to Meta gives up after 25 seconds.
- Never twice: each post is worked on by one run at a time, and a Facebook Reel is saved after each step at Meta. If Meta's answer to the last step is lost, the next run reads the video's status before doing anything again, and never starts a second upload.
- A post that went out but whose link could not be read yet is looked up again on the next runs, so the "Posted on" line and the Threads link post still happen.
- Each post keeps a full history of what happened, visible with `status`.

## For developers

`src/worker.js` (webhooks, admin, cron), `src/publish.js` (uploads, scheduling, the cron's steps), `src/instagram.js`, `src/facebook.js`, `src/threads.js` (one file per platform, each naming the Meta pages it follows), `src/graph.js` (every outside call), `src/limits.js` (text limits, shared with the scripts). Tests: `npm test` in this folder (Node 22, no packages, no network).
