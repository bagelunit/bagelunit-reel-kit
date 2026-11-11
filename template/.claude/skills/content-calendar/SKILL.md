---
name: content-calendar
description: >
  The brand's content calendar and dashboard: every reel from idea to posted, what needs the owner next, open
  posting slots, four agent panels (Ideator, Hook & Script, Planner, Analyst), followers and trends, and the
  account's own numbers. Plans the next weeks into brand/plan.md, connects the brand's Instagram, Facebook Page
  and Threads numbers and a Telegram summary, and sets up a daily refresh on Mac, Windows or Linux. Use on /content-calendar, or when the
  user says "content calendar", "dashboard", "what's scheduled", "what's next", "plan my posts", "show my
  pipeline", "how are my reels doing", "connect my Instagram stats", "connect Facebook", "connect Threads", "send it to my phone", "refresh every day",
  "put the dashboard online", "host my dashboard", "see it on my phone", "how often should I post", "how many
  reels a week", "posting frequency", "track my competitors", "what are my competitors posting", "competitor
  dashboard", "what's working for them" or "post ideas from my competitors".
user-invokable: true
argument-hint: "[plan | days | how-often | competitors | ideas | host | connect instagram | connect facebook | connect threads | connect telegram | auto | all | off]"
metadata:
  author: BagelUnit
  version: "2.0.0"
  category: content
---

# Content calendar and dashboard

One view of this brand's content, built from the files in this folder (and, once connected, the brand's own
Instagram numbers). It reads and reports. It never posts, schedules a reel or approves anything: scheduling stays
with `/reel-posting` and the owner's yes for each reel (CLAUDE.md rule 11). Every part that leaves this computer
(the Instagram pull, the Telegram summary, the daily job) is off until the owner turns it on.

Ask every choice with a question block (AskUserQuestion), the recommended option first. The scripts are in
`.claude/skills/content-calendar/`; run them from this brand folder. The owner's guide is `docs/dashboard.md`.

## What it reads and writes

| File | Role |
|---|---|
| `brand/plan.md` | planned reels: Date, Topic, Goal, Angle, Reel (folder), Notes |
| `reels/<slug>/approvals.md` | gates A, B, C, the Gate C fingerprint, and the `## Posting` lines |
| `reels/<slug>/script.txt`, `out/caption.txt`, `reel.json` | the hook line, the caption (to match Instagram posts), the name |
| `brand/log.md`, `brand/insights.csv`, `brand/swipe.md`, `brand/stats.md` | posted reels, numbers, research |
| `brand/instagram.json` | written by `instagram.mjs`: the account and every post's latest numbers (not kept in history) |
| `brand/followers.csv` | written by `instagram.mjs`: one follower count a day (kept: it is the only record of growth) |
| `brand/research/<username>.csv`, `brand/research/accounts.json` | other accounts' posts and their followers, written by `research.mjs competitor` (read by `how-often.mjs` and `/account-audit`) |
| `brand/competitors.json` | the accounts the owner watches: handle and tag (`niche`, `adjacent`, `big`), written by `competitors.mjs add` |
| `brand/research/history.csv` | one line a day per competitor from `competitors.mjs sync` (date, handle, followers, posts read, median views, source): the only record of their growth |
| `brand/ideas.md` | post ideas drafted from the competitors' winners: Date, Idea, Hook, Based on, Goal, Angle, Status (`suggested`, `planned`, `rejected`); written by `/content-calendar ideas` |
| `brand/how-often.json` | written by `how-often.mjs`: the suggested posting pace and why; the Planner panel shows it |
| `brand/calendar.md`, `brand/dashboard.html` | written by `calendar.mjs` each run (the page itself is drawn by `page.mjs`; fonts in `fonts/`) |
| `brand/brand.json` | `posting.timezone`, `posting.days`, `posting.times` (or the older single `posting.time`), `batch.max_reels`, and `dashboard`: `instagram`, `facebook`, `threads`, `telegram`, `competitors` (each on only after the owner's yes; `competitors_every` is the days between reads, default 7; `competitors_days` is how many recent days "What is working for them" covers, default 7), `refresh` (with `time` and `day`, written by `schedule.mjs`), `host` (`local`, `wifi`, `netlify`, `cloudflare` or `folder`), `site` (the Netlify site id or Cloudflare Pages project), `url` (the site's https address), `path_key` (the private path, made by `host.mjs` run by hand) and `publish_every` (minutes between background uploads, default 15, 0 for the scheduled refresh only) |

Stages, in order: Idea, Script written, Script approved (Gate A), Visual plan approved (Gate B), Final approved
(Gate C), Scheduled, Posted. The four agent panels map the kit's skills: Ideator (`/comment-mining`,
`/reel-sources`, `/account-audit`, `/going-viral`), Hook & Script (`/viral-hook-writer`, `/hook-mining`,
`/reel-scripter`, `/reel-factcheck`), Planner (`/content-calendar plan`, `/reel-posting`), Analyst
(`/analytics-readout`, `/account-audit`, `/reel-predict`). Each shows when it last produced something, what it
made, and its next command. They run only when the owner starts them; nothing on the page pretends otherwise.

## The page

A brand that has not done the main steps (brand set up, posting days, a plan, a first reel) sees a "Get started" panel
at the top with each step, its command and a Copy button; it ticks steps off from the folder's own files and goes away
when they are done. When someone is new, walk them through it in that order.

Calendar in month, week and day views. Pipeline cards show the title only; a click opens the reel's full card (stage,
next step and its command to copy, dates, goal, angle, hook, script, caption, final-file check, numbers, approval history,
files). The calendar and "Needs you" open the same card. The page never changes a stage: stages come from the gates.
One filter bar (find, needs you, stage) applies to every section; a reel lights up everywhere it appears. The kit's hook
(`.claude/settings.json` -> `sync.mjs`) redraws the page after each step that changed a file it reads, so there is no need
to run `calendar.mjs` by hand after a gate or a posting line; run `sync.mjs --force` if the page looks stale.
When the owner asks how to use it, say this in two lines and point to `docs/dashboard.md`.

## What else the page shows

- **Platform switch:** with Facebook or Threads connected, All, Instagram, Facebook and Threads in the filter bar
  change the number strip, the follower and views charts and Top posts (`M.platforms` in `lib.mjs`). "All" adds up
  followers, views and plays, posts and interactions; engagement there and on Facebook and Threads is of views
  (Instagram's is of reach). Audience, comments and A/B tests are Instagram only and show on All and Instagram.

- **A/B tests:** each reel with a `test.json` (made by `/ab-hook-tester`) shows its versions side by side on the deciding
  number, with the views each still needs, and calls a winner once both have enough and they differ by 10% or more.
  A winner shows under "Needs you": share it to followers in the Instagram app, then `/ab-hook-tester record`.
- **Content mix:** the goals and angles of the last 10 posts, the angles not used lately, and a warning when one angle
  repeats. Read it (and `brand/tests.md`) in `plan` before proposing angles.
- **Series:** reels and plan rows with the same `Series` (plan column, or `reel.json` -> `series`) are grouped.
- **Time and cost:** median days from start to posted, which step reels wait longest at, and voice credits this
  month (from the engine's `build/voice-log.jsonl`; older reels are estimated from the script and marked so).
- **The reel card:** also its series, A/B version, timeline, voice cost, new stickers and other-platform versions.
- **Agent lights** go by real changes (`.cache/agent-events.json`), not by when a file was saved.
- **Colours:** the brand's accent is darkened where needed so text and lines stay readable, whatever colour it is.

## /content-calendar all: every brand on one page

`node .claude/skills/content-calendar/overview.mjs --open` draws `~/.config/bagelunit-reels/overview.html`: every brand
folder on this computer that has drawn its dashboard, most urgent first, with what needs the owner in each, the week's
numbers, the next 7 days across all of them and a link to each brand's dashboard. To add brand folders that never drew
one, `overview.mjs --scan <folder>`; to drop one, `--forget <folder>`. It stays on this computer.

## /content-calendar (no argument): refresh and report

1. If any of `dashboard.instagram`, `dashboard.facebook` or `dashboard.threads` is true, run
   `node .claude/skills/content-calendar/refresh.mjs --no-telegram` (pulls the numbers, then draws the page);
   otherwise `node .claude/skills/content-calendar/calendar.mjs`. Then open
   `brand/dashboard.html` (`calendar.mjs --open` does it).
2. In chat, a short report: the "Needs you" items first, each with its command (`/bagelunit-reels`,
   `/reel-posting`, `/analytics-readout`), then the next 7 days, then open slots. A few lines; the page has the rest.
3. If nothing is dated, offer `/content-calendar plan`. If `posting.days` is empty, offer `/content-calendar days`.

## /content-calendar days: posting days and time

Ask which days the brand posts (multi-select, Monday to Sunday; suggest as many as `batch.max_reels`), how many
posts a day ("1", "2", "3", Other: any number, 20 a day works) and when: for one a day the time ("6 pm", "12 pm",
"9 am", Other); for several, "Spread evenly from 9 am to 9 pm (Recommended)" or their own times. Ask the timezone if
`posting.timezone` is empty. Write `posting.days` (`["tue", "thu", "sat"]`), `posting.times` (`["18:00"]`, or for
several a day every time, sorted, 24-hour: `["09:00", "15:00", "21:00"]`; spread evenly means equal steps from the
first time to the last, rounded to 5 minutes) and `posting.timezone` in `brand/brand.json`, and clear the older
`posting.time`. Each time on each posting day is one slot on the calendar. If `batch.max_reels` is below the posts a
week this makes, offer to raise it to match.

Several a day: a day shows its reels and its open times; the 14-day list shows six reels a day and links to the
rest in the calendar's day view. Say once what the pace takes: every reel still needs Gate A, B and C, each voiced
reel uses about 800 voice characters (`python3 ~/.claude/skills/bagelunit-reels/tools/budget.py` shows what is
left), and Meta caps automatic posting (the publisher checks: Instagram's 24-hour publishing limit, 30 Facebook
reels a day, 250 Threads posts a day).

## /content-calendar how-often: how often to post

A suggestion from real numbers, never a rule of thumb about a niche ("food accounts post X a week" is guesswork,
and house rule 1 bans numbers the kit cannot back). Three sources, each optional:
1. **Accounts like yours.** Ask for 3 to 5 accounts in the brand's niche, about its size or a bit ahead (a question
   block: the owner's own picks under Other, or "Find some for me", then suggest from `brand/swipe.md` and what the
   owner says about the niche, and confirm each). With Instagram connected through Unified or Facebook Login, run
   `node .claude/skills/content-calendar/research.mjs competitor <username>` for each (free, Meta's official API,
   business and creator accounts only). Without it, say once what connecting gives (`docs/connect.md`), or take an
   export the owner has (a CSV with a timestamp column, saved as `brand/research/<username>.csv`). Never scrape
   unless `autopilot.scrape` is on (house rule 7).
2. **What the owner can keep up.** Ask "How many reels a week can you review and approve?" (choices "Up to 3",
   "Up to 7", "Up to 20", Other). The script reads the voice credits itself (the engine's `budget.py --left`).
3. **The brand's own numbers**, read from this folder once 8 posted reels have numbers across 4 finished weeks.

Then run `node .claude/skills/content-calendar/how-often.mjs --approve <their answer>` and show what it prints: the
accounts' paces (and which do best for their size), what the owner can keep up, what the brand's own numbers say,
and the suggestion with its reasons. Say plainly that it is a starting point: how often accounts post is not proof
that posting that often is why they do well. Then ask "Use <N> a week (Recommended)", "Keep <current>", "Pick my
own". On a number, run the days step below with it (days and times that add up to it, and `batch.max_reels`).
Run it again about once a month; the Planner panel shows the latest suggestion and its date.

## /content-calendar competitors: who the brand watches

Fills the dashboard's Competitors section: a leaderboard (followers and their change, posts a week, median views,
views per follower, you in the same table), the posts that beat their own account's median (the 3x rule: STUDY at 3x or
more, NOTE at 1.5x), what those winners share (hook shape and day, guessed from the caption's first line, so a small
sample proves little), what each account posted this week, and the ideas drafted from it (below). It reads and saves
public data; it never posts, follows, likes or comments.

1. **Pick the accounts** with a question block. Suggest 6 to 12: about 4 in the niche and a bit ahead, 4 next door, 2 to
   4 big ones for format ideas only (stay within about 10x of the brand's followers for the others). Suggest from
   `brand/swipe.md`, the owner's niche and what they name; confirm each handle. Save with
   `node .claude/skills/content-calendar/competitors.mjs add <handle> ... --tag niche|adjacent|big` (up to 30).
2. **Read them, best source first.** `node .claude/skills/content-calendar/competitors.mjs sync` tries each account in
   turn and the dashboard says which source it used:
   - **Meta's official API** (free, no scraping): needs the Unified or Facebook Login connection
     (`docs/connect.md` step 2B) and works for business and creator accounts only. Without that connection, say once
     what connecting gives and offer `/content-calendar connect instagram`.
   - **Apify**, only for an account Meta will not show, and only when `autopilot.scrape` is true and the owner's token is
     saved: `competitors.mjs sync <handle> --apify`. Say the cost first (`outliers.py --dry-run`), and tell the owner it
     is logged in `brand/spend.csv`. Never run it from the scheduled refresh and never without the owner's yes for that
     run. Never ask for or print the token.
   - **A file the owner has**: an Insights export, a scraper export or a CSV saved from anywhere:
     `competitors.mjs import <handle> <file.csv|file.json>` (a date column, and a views column for the outlier check).
     This is also the way in for any account the other two cannot read.
   Say plainly what no source gives: another account's retention, saves and shares. Views, likes and comments only.
3. **Keep it fresh.** Turn on the weekly read (`brand.json` -> `dashboard.competitors: true`, after the owner's yes):
   the daily refresh then reads the accounts through Meta whenever the oldest read is more than 7 days old
   (`dashboard.competitors_every`). Each read adds a line to `brand/research/history.csv`, so follower growth and median
   views over time show up after the second week. `competitors.mjs remove <handle>` drops an account for good (its saved posts stay in `brand/research`, but it does not come back; adding it again does) and `list` shows
   what is read and how.
4. Run the calendar (`calendar.mjs`) and point the owner at the Competitors section. If an account says "not read", offer
   the export route for it.

## /content-calendar ideas: post ideas from what is working for them

Claude's step (no script writes ideas). It turns the competitors' winners into this brand's own post ideas.
1. Read the winners: each `brand/research/<handle>.csv` (url, timestamp, views, likes, comments, caption), **only posts from
   the last `dashboard.competitors_days` days (default 7)**, with a post's ratio being its views over that account's
   median of its last 12 posts (3x or more is STUDY, 1.5x NOTE; the dashboard shows the same list). Older posts are judged
   against today's median, so they are not "working now". If fewer than 3 recent posts qualify, say so and ask whether to
   widen the window instead of reaching back quietly. Then read
   `brand/voice.md`, `brand/facts.md`, `brand/tests.md`, `brand/log.md` (so no idea repeats a recent angle) and
   `brand/swipe.md`. If fewer than 3 accounts have a median yet, say so and stop: ideas from nothing are guesses.
2. Draft 5 to 8 ideas. Each takes the **shape** of a winner (hook shape, structure, length, the question it answers), never
   the words, footage, colours, characters or prompts (house rule 8), in this brand's voice. One goal and one angle per
   idea (rule 13), a hook written as a triple hook where it fits, and any number only from `brand/facts.md` (rule 1;
   otherwise `{{needs cleared fact}}`). Run the text through `/humanizer`'s checks before showing it.
3. Show them as a table first. After the owner's yes, append the kept ones to `brand/ideas.md` (create it with the
   header `| Date | Idea | Hook | Based on | Goal | Angle | Status |` if missing), Status `suggested`, "Based on" naming the
   account and the post's link so the owner can watch it.
4. `/content-calendar ideas accept <n>` moves idea n into `brand/plan.md` (the next open slot, after the owner's yes) and
   sets its Status to `planned`; `/content-calendar ideas reject <n>` sets `rejected` with the owner's reason in
   "Idea" so the next draft learns from it. Accepting never starts a reel: that is `/bagelunit-reels`.

## /content-calendar plan: fill the next weeks

The Planner. It fills `brand/plan.md`; it never starts, schedules or posts a reel.
1. Run the calendar to see the open slots ("days" first if `posting.days` is empty).
2. Topics, best first: the owner's own ideas, `brand/swipe.md`, `/comment-mining`, and what worked in the
   numbers (the Analyst panel, `brand/stats.md`). Read `brand/log.md` so no angle repeats the last post; one goal
   and one angle per reel (house rule 13); claims only from `brand/facts.md` (rule 1).
3. Propose at most `batch.max_reels` a week, each with a date from an open slot, a topic, a goal and an angle, as
   a short table. With several posting times a day, each row takes one open time and the Date column holds both
   (`2026-11-12 13:00`). With more than five reels, the angles take turns so no two reels next to each other share
   one. Ask: "Add these to the plan (Recommended)", "Change some", "Not now".
4. On yes, add the rows to `brand/plan.md` (never delete or rewrite the owner's rows), refresh, and name the next
   step: `/bagelunit-reels` with the first topic.

## /content-calendar host: where the owner views it

Everyone hosts differently, so the owner picks (question block, one choice; walk `docs/dashboard.md` section 4):
"Netlify (Recommended)", "Cloudflare Pages", "Another host (a folder to upload)", "Live on my Wi-Fi", "Just this computer".
Say first that the page holds the brand's plans and numbers, so an online copy belongs behind the host's login.

- **Just this computer:** `dashboard.host` = `local`. Nothing else.
- **Live on my Wi-Fi:** `node .claude/skills/content-calendar/serve.mjs`. It prints a private address for this computer
  and one for a phone on the same network, redraws when files change, and stops with Ctrl+C. `dashboard.host` = `wifi`.
  Say plainly that it is plain HTTP on every network this computer is on (Wi-Fi and any VPN), so it is for a trusted
  network only.
- **Netlify:** run `npx netlify-cli login` (it opens Netlify in the browser: the owner logs in, then you or the owner
  click Authorize). Read the team's short name from `npx netlify-cli status` (not a secret), then run
  `npx netlify-cli sites:create --name <slug>-dashboard --account-slug <team> --disable-linking --json` (no
  questions, nothing written in this folder) and read the site id and address it prints (not a token). Write
  `dashboard.host` = `netlify`, `dashboard.site`, `dashboard.url`, then run `node .claude/skills/content-calendar/host.mjs`
  (it deploys with `--no-build`). Then, after the owner's yes, make the site Private with the browser tool (the site,
  Project configuration, General, Visitor access, Project visibility, Edit visibility, Private, production and
  previews, Save): free, and the page then opens only for the owner, logged in to Netlify. Say so plainly. If the team's
  plan has no Project visibility (older plans), say the page is only as private as its address (never listed in search).
- **Cloudflare Pages:** run `npx wrangler login` (the owner logs in) and
  `npx wrangler pages project create <slug>-dashboard --production-branch main` (host.mjs uploads to `main`, so the
  page lands on `https://<slug>-dashboard.pages.dev`). Write `dashboard.host` = `cloudflare`, `dashboard.site` (project
  name), `dashboard.url`, then run `host.mjs`. For a login, Cloudflare Access: say first that opening Zero Trust asks
  for a card even on its free plan, ask, and stop at the payment form for the owner. The project's "Enable access
  policy" covers only preview copies, so then protect the `pages.dev` address too (`docs/dashboard.md` section 4 has
  Cloudflare's steps: Manage the policy, Configure, delete the `*` from Subdomain, Save).
- **Another host:** `host.mjs folder` writes `.cache/site/` (the page, `robots.txt`, `_headers`); the owner uploads it.

The page goes online at `<dashboard.url>/<dashboard.path_key>/` (the key is made once by `host.mjs` run by hand and saved in brand.json; the site's front page is empty), so give the owner that full address and say to keep it private. With a host set, every refresh (`refresh.mjs`, the scheduled job) uploads the new page, and between refreshes the
online copy follows changes: after each redraw the hook queues a background upload, at most every
`dashboard.publish_every` minutes (default 15, 0 = only on the refresh). Ask the owner (question block) "Keep the online
copy current as you work (Recommended)" or "Only with the daily refresh" and set `publish_every` to 15 or 0. The
Telegram summary links to `dashboard.url`. The online copy drops links to files on this computer, but it holds each reel's hook, script and caption and, with Instagram connected, other people's waiting comments (usernames and text) and tagged posts: say so when the owner picks a host.

## /content-calendar connect instagram: the brand's own numbers

Read-only numbers through Meta's official API: followers, and per post views, reach, likes, comments, saves,
shares, average watch time and skip rate. Walk `docs/connect.md` (steps 1 and 2) with the owner one step at a time.
First ask which connection with a question block, in this order: "Unified Login (Recommended)" (everything,
including competitor and hashtag research; needs a Meta business portfolio) and "Instagram Login" (simplest,
no research).
1. Tell the owner what it reads (their own account's profile and post numbers, nothing else) and that Meta's
   terms apply. Ask: "Connect it (Recommended)", "Not now".
2. Make the Meta app and the token with the owner, following `docs/connect.md` steps 2A or 2B. With the browser tool (rule 15 in `CLAUDE.md`, `docs/browser.md`), do the web pages yourself; the owner logs in, copies each secret into the file you opened, and clicks the last Delete.
   Before the token step, write `~/.config/bagelunit-reels/instagram-<slug>.json` with
   `{"access_token": "PASTE-YOUR-TOKEN-HERE"}` (Instagram Login) or `{"access_token": "PASTE-YOUR-TOKEN-HERE",
   "login": "unified"}`, make it readable by the owner only (`chmod 600`), and open it in their editor; stop at
   Generate token. With Unified Login, pick **Never** for the token's end date in the configuration preview. If Meta
   offers no Never, ask the owner for the end date the preview shows and add it to the file you write as
   `"expires_at": "YYYY-MM-DD"` (a date, not a secret), so the dashboard warns a week ahead; that token does not
   renew itself. Never ask for the token, never read the file once the owner has pasted into it, never print
   it. `<slug>` is `brand.json` -> `slug`. Without the browser tool, give the written steps one at a time.
3. Run `node .claude/skills/content-calendar/instagram.mjs --check`. It prints the handle and follower count
   (and saves the account's id in the owner's file, which the publisher's `setup.mjs secrets` uses). Ask the owner to
   confirm it is the right account.
4. Set `dashboard.instagram` to `true` in `brand/brand.json`, run `refresh.mjs --no-telegram`, and report what
   it found (posts, how many matched this folder's reels). For a reel it could not match, the fix is the post's
   link in its "Posted" line: `- 2026-11-09 21:05 Posted by hand on @handle: https://www.instagram.com/reel/...`.

## /content-calendar connect facebook | connect threads: the same reels on the other accounts

Read-only numbers for the brand's Facebook Page (followers, 28-day views, each reel's plays, reach, average watch,
likes, comments, shares, follows) and Threads profile (followers, 7-day profile views, likes, replies, reposts,
clicks, each post's views and replies). Walk `docs/connect.md` step 3 (Facebook) or step 4 (Threads).
1. Say what it reads and that Meta's terms apply. Ask: "Connect it (Recommended)", "Not now".
2. Make the token in Meta's Graph API Explorer with the owner (`docs/connect.md` step 3 or 4). With the browser tool (rule 15 in `CLAUDE.md`, `docs/browser.md`), do the web pages yourself; the owner logs in, copies each secret into the file you opened, and clicks the last Delete.
   Write `~/.config/bagelunit-reels/facebook-<slug>.json` (or `threads-<slug>.json`) first with the lines from the
   guide, ids filled in and `PASTE-...` where the token and app secret go, `chmod 600`, and open it. Never ask for,
   read or print a token or app secret. The first check trades the short token for a lasting one and removes the app secret from the file.
3. Run `node .claude/skills/content-calendar/platforms.mjs facebook --check` (or `threads`). A Threads token from
   the Explorer lasts one hour, so the check must run within the hour. Ask the owner to confirm the Page or handle.
4. Set `dashboard.facebook` (or `dashboard.threads`) to `true` in `brand/brand.json`, run `refresh.mjs --no-telegram`,
   and report the followers and how many posts matched this folder's reels. A post that did not match gets its link
   in the reel's "Posting" lines: `- 2026-11-09 21:05 Posted on Facebook: https://www.facebook.com/reel/...`.

## /content-calendar connect telegram: the summary on the phone

A short daily message: followers, views, what needs the owner, the next 7 days, open slots, the next idea. The
bot only reports; nothing sent to it does anything. Walk `docs/dashboard.md` section 3.
1. Say that the summary passes through Telegram's servers. Ask: "Set it up (Recommended)", "Not now".
2. Make the bot with @BotFather on web.telegram.org (`docs/dashboard.md` section 3). With the browser tool (rule 15 in `CLAUDE.md`, `docs/browser.md`), do the web pages yourself; the owner logs in, copies each secret into the file you opened, and clicks the last Delete. First write
   `~/.config/bagelunit-reels/telegram-<slug>.json` (or `telegram.json` for every brand) with
   `{"token": "PASTE-YOUR-TOKEN-HERE"}`, `chmod 600`, and open it; type the bot's username in BotFather but let the
   owner press Enter, because the reply holds the token. Never ask for, read or print the token.
   BotFather's username cannot be changed later: confirm it with the owner before they press Enter.
3. Open the bot and press Start (or the owner does). Run `telegram.mjs link`: it lists who has messaged the bot and
   saves nothing. Ask the owner (question block, one option per chat it listed, plus "None of these is me") which one
   is them; never pick for them. Then run `telegram.mjs link --yes=<that chat id>`, then `telegram.mjs test`. Ask
   (question block) "It arrived", "Nothing came".
4. Run `telegram.mjs show` to show the summary here, set `dashboard.telegram` to `true`, then `telegram.mjs send`.

## /content-calendar auto: refresh by itself

Ask how often ("Every day (Recommended)", "Once a week", "Not now") and the time (the computer's own clock), then
run `node .claude/skills/content-calendar/schedule.mjs install --daily 08:00` (or `--weekly mon 08:00`). It uses
launchd on a Mac, Task Scheduler on Windows and cron on Linux, and records the choice in `brand.json` ->
`dashboard.refresh`. Then `schedule.mjs run-now` and, a few seconds later, `schedule.mjs status` to show it ran.
Tell the owner it only runs while the computer is on. On a Mac, if the status shows "Operation not permitted",
follow `docs/dashboard.md` section 5 (Full Disk Access for node). The job runs no AI, so it costs nothing.

`/content-calendar off`: `schedule.mjs remove`, and on the owner's yes set `dashboard.instagram`,
`dashboard.facebook`, `dashboard.threads` and `dashboard.telegram` to `false` and `dashboard.host` to `local`.

## How the other steps feed it

- After any gate is recorded (`kit gate <reel> record`) or a reel is posted, the kit's hook redraws the page by itself
  (`sync.mjs`); run `calendar.mjs` (no `--open`) only if the page looks stale.
- When a reel is started from the plan, put its folder name in that row's "Reel (folder)" cell.
- `/reel-posting` writes the `## Posting` line (shapes in its skill); add the post's Instagram link when known.
- After a reel is live, its row goes in `brand/log.md`. Numbers: the Instagram pull fills them (and adds a 7-day
  row to `brand/insights.csv`), or `/analytics-readout` takes them by hand.

## Never

- Never post, schedule, upload or cancel a reel from here; that is `/reel-posting`, with the owner's yes.
- Never ask for, read, print or store a token. Make the file with `PASTE-...` and open it; the owner pastes the token.
- Never type a password or log in for the owner; the owner logs in to Meta, Netlify, Cloudflare and Telegram, and the browser tool does the rest of each page (`docs/browser.md`). Deleting a token file or revoking access is the owner's last click. Never make the page public on purpose.
- Never turn on `dashboard.instagram`, `dashboard.facebook`, `dashboard.threads`, `dashboard.telegram` or the
  scheduled job without the owner's yes.
- Never invent numbers. Only the Meta pulls (Instagram, Facebook, Threads), the publisher's record and
  `brand/insights.csv` feed the dashboard.
- Never edit a reel's `approvals.md` from here.
