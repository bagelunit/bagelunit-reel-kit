# BagelUnit Reel Kit: what changed

Newest first. The reel engine has its own, older log in `studio/CHANGELOG.md`. To update a brand workspace to the latest kit, see "Updating" in `template/README.md`.

## 1.17.0 (2026-11-11)

**Reel folders can be filed by date.** Feedback from a brand posting three reels a day: they wanted `reels/2026/11 November/November 12/<slug>/` but held off, because the dashboard, `pull.mjs`, `schedule.mjs`, `best-times.mjs` and `kit calibrate` only looked in `reels/<slug>`, and moving a reel would have stopped its "Posted" lines being recorded.

- **One lookup everywhere.** A reel's name is still its slug: the plan, the log, the insights and the publisher already use the slug, never a path. All of those scripts now find a reel wherever it sits under `reels/` (flat or in dated folders), so moving a reel changes nothing else. `schedule.mjs` also takes `reels/<slug>` or just the slug for a reel that moved.
- **A setting for it.** `brand.json` -> `reels.layout` is `"flat"` (the default, `reels/<slug>`) or `"dated"` (`reels/2026/11 November/November 12/<slug>`). The date is the day the reel is planned to post, from its row in `brand/plan.md`.
- **`kit start` follows the setting.** With the dated layout, `kit start reels/<slug> --style print` files the new reel under its planned day (or `--date 2026-11-12`, or today when there is no plan row). A reel already filed somewhere under `reels/` is carried on there, never started a second time.
- **`kit organize`.** Shows where every reel would move (`kit organize --layout dated`), then `--apply` does it and saves the setting. It takes the date from the plan, else the scheduled or posted time, else the day the folder was made. `--layout flat` moves them back. Links inside a reel that pointed by a relative path are kept working; empty date folders are removed.
- **`kit tidy`.** Frees disk space in reels that are posted: `kit tidy <reel>` or `kit tidy --all` lists what it would delete (the `build/` and `stills/` folders and any file in `out/` that Gate C did not approve), and `--apply` deletes it. It keeps the script, approvals, caption, `reel.json` and the approved video and cover. The paid voice take (`audio/`) stays unless you add `--audio`. A reel that is not posted yet is skipped unless you add `--force`.
- **One final in `out/`.** `realsound.py` used to leave two files in `out/` (the plain export and the `-real` one). It now moves the plain one to `build/pre-real/` (still there to redo the step), so `out/` holds one final. Giving `--out` yourself keeps both.

To update an existing brand: `/kit-update`, and the engine with `bash setup/install.sh`. Nothing moves until you run `kit organize --apply`.

## 1.16.0 (2026-11-11)

**Posting follows your plan, and the times follow your numbers.** Feedback from a brand posting three reels a day to Instagram, its Facebook Page and Threads: platforms and times are decided once, ahead of time, so the kit should not ask for them on every reel.

- **Platforms are a brand setting.** `brand.json` -> `posting.platforms` (for example `["instagram", "facebook", "threads"]`) is where every reel goes. `schedule.mjs` uses it when `--platforms` is not given (the flag still overrides it for one reel; with nothing set it is Instagram only, as before). `/reel-posting` asks about it once, when the publisher is set up.
- **The time comes from the plan.** `schedule.mjs <reel> --from-plan` reads the date and time from the reel's row in `brand/plan.md` and reads them in `posting.timezone`, daylight saving included. It refuses when the reel has no row, the row has no time, or the time has passed. `--at` still works; use one or the other.
- **One question after Gate C.** When both are set, `/reel-posting` asks only "Schedule it at (time) on (platforms)?". That one yes still counts as the owner's yes to this reel, its time and its platforms (house rule 11), because the question shows both.
- **Best times.** New `/content-calendar best-times` (`best-times.mjs`, also run by the daily refresh). It suggests new `posting.times` from three sources: your own posts (views against each platform's median, by the hour they went out; it waits for 15 posts over 3 weeks and says "not enough data yet" before that), when your audience is online (the Audience panel's data), and, as weak evidence, the hours the tracked competitors' winners went out. It keeps every time that already works, swaps one only for an hour that scores clearly better, keeps posts 3 hours apart and stays between 06:00 and 22:59. The Planner panel shows the suggestion with its reasons. On your yes, `best-times.mjs apply --yes` sets `posting.times` and moves the plan rows that are still in the future and have no scheduled or posted reel. A reel that is already scheduled is never moved. Honest limit: Instagram gives lifetime views, not the first 24 hours, so a recent post can look weaker than it will be.
- **Optional autopilot.** `brand.json` -> `autopilot.retime` (off by default). When you turn it on, the refresh applies the suggestion by itself, at most once a week, never touching a scheduled reel, and says what it changed in its summary.
- **Scripts about posting.** `/reel-scripter` now says to describe the brand's real setup (fixed platforms, planned times), not the questions the posting skill asks.

**Two engine fixes** (also in `studio/LOCAL-CHANGES.md`):
- `kit export` no longer reuses a stale `build/mix.wav`. If the voice take, the word timings or the sound cues are newer than the mix, it mixes again and says so. Before, a new voice take could ship the old voice, the wrong length and no end hold unless you added `--remix`.
- `realsound.py` looks up a relative `--video` or `--out` in the reel folder first, so it works from the brand folder as well as from inside the reel folder.

**What to do.** After updating: `node setup/sync-template.mjs <workspace>` (dry run), then `--apply`; re-run `bash setup/install.sh` (Windows `node setup/install.mjs`) for the engine fixes. To use the new posting flow, set `posting.platforms` in `brand/brand.json` and give each plan row a date and time. **Not tried on a live account yet:** the best-times suggestion is tested on made-up data and has not seen a real brand's numbers; read its reasons before you say yes.

## 1.15.0 (2026-11-11)

**Send the link only to people who follow you.** A comment-to-DM rule can now ask for a follow first. In the rule (`publisher/rules.json`) add `"require_follow": true`:

1. Someone comments the keyword. They get the public reply (no link) and a private message with a button ("Send me the link").
2. They tap the button or write back. The publisher asks Meta whether they follow the account (Meta's User Profile API, `is_user_follow_business`).
3. A follower gets the link. Someone who does not follow gets a short reminder with an "I'm following" button, up to 3 times (you can set 1 to 5), then it stops and leaves them for you.

It is two steps because Meta allows one private message in answer to a comment, and only lets the follow status be read once the person has messaged the account. **It fails closed:** if Meta does not say whether the person follows, or the check errors, no link is sent and `schedule.mjs status` shows why. Neither the first message nor the reminder may contain a link, every message carries the automated-reply line, and a person who was never asked is never answered. The same safety gates apply as before (live mode, a tested rule, the hourly cap, each message handled once). Forgetting a person (`forget.mjs`) also ends their wait.

- **Test before you rely on it:** `node publisher/scripts/setup.mjs follow-check` asks Meta about the newest person who messaged the account and says whether they count as a follower. It works only once Meta's app is Live with the messages permission, and Meta's follow field has not been tried against a real account yet: run the test first and leave `require_follow` off if it does not answer.
- `/comment-responder` asks whether the link is for followers only and writes the extra texts. `docs/auto-reply.md`, `docs/connect.md` step 7 and `publisher/README.md` explain it. 15 new tests (100 in all).
- Update a brand workspace with `node setup/sync-template.mjs <workspace>` (dry run, then `--apply`), then deploy the publisher again (`npx wrangler deploy` in its folder) so the Worker has the new code.

## 1.14.2 (2026-11-11)

- **A winner now needs real views too.** "What is working for them" ranked by ratio to each account's own median, so one hit on a small account (179 times a median of 3,000) outranked steadier signals at scale. A post must now also have at least 5,000 views (`dashboard.competitors_min_views` in `brand/brand.json`, 0 turns it off), and the panel says how many recent winners the floor left out.
- **The base is visible.** Each row shows the account's median beside the ratio ("179x of 3.0K").
- **No account fills the list.** At most 2 rows from one account are shown.
- `/content-calendar ideas` uses the same floor and cap.

## 1.14.1 (2026-11-10)

Fixes from a first real run of the competitor dashboard.

- **"What is working for them" shows recent posts only.** It listed every winning post the kit had ever read, so most of the top 8 were weeks old. It now covers the last 7 days (`dashboard.competitors_days` in `brand/brand.json` changes it, up to 90), the panel says so, and when nothing recent qualifies it says how many older posts did instead of quietly showing them. Older posts are not shown because each is judged against the account's median today.
- **The patterns say how far back they look.** "What the winners share" uses the last 90 days (a week holds too few posts to compare hook shapes) and is labelled. The leaderboard column is now "Beat their median, 30 days", and the feed is "Posted in the last 7 days", so each panel names its own range.
- **A removed account stays removed.** Its saved file in `brand/research` brought it back as "Other". Removing now records it, and adding the account again brings it back.
- `/content-calendar ideas` reads the same recent window and asks before reaching further back.

## 1.14.0 (2026-11-10)

**A competitor dashboard.** The content dashboard has a new Competitors section: who you watch, what they post, what is working for them, and post ideas drawn from it.

- **The table.** Each account's followers (and how they changed over 7 days), posts a week, median views and views per follower, with your own account in the same table, so you can see who does well for their size.
- **What is working for them.** Posts that beat their own account's normal, by the same 3x rule as `/account-audit` (3x their median is "Study", 1.5x is "Note"), with a link to each. Then what the winners share: which hook shapes and which days beat the average most. The shape is guessed from the first line of the caption, and the page says a small sample proves little.
- **Posted this week.** What every account you watch put out in the last 7 days.
- **Post ideas.** `/content-calendar ideas` turns the winners into ideas in your voice. They copy a winner's shape, never its words, footage or characters, and use only your cleared facts. They wait in `brand/ideas.md` as "suggested" until you accept one (`/content-calendar ideas accept <number>` puts it in your plan). Nothing is made or posted for you.
- **Every way to track.** Each account uses the best source that works, and the table says which: Meta's official API (free, no scraping, business and creator accounts), Apify (for an account Meta will not show; only when you turned scraping on, with the cost shown first, and never from the scheduled refresh), or a file you have (`competitors.mjs import`, any Insights or scraper export). An account no source can read is listed with the reason and the way to fix it.
- **Fresh by itself.** With `dashboard.competitors` on, the daily refresh reads the accounts through Meta once a week and keeps a line a day per account in `brand/research/history.csv`, so growth over time shows after two weeks.
- New: `/content-calendar competitors` (add, remove, list, sync, import) and `/content-calendar ideas`; `competitors.mjs`, `competitors-model.mjs`, `brand/competitors.json`, `brand/ideas.md`. `outliers.py` can save the accounts it fetches for the dashboard (`--save-research`). Update a brand workspace with `node setup/sync-template.mjs <workspace>`, then `--apply`.

## 1.13.0 (2026-11-10)

Two fresh reviews walked the kit as a stranger would, from the GitHub page to the first reel and through every connection, and checked each outside step against Meta's, Cloudflare's, Netlify's, Telegram's and Anthropic's current official pages. This release fixes what they found.

**The triple hook, built into every hook the kit writes.** BagelUnit's own method for the first one or two sentences, written out in full in `docs/hook-and-review-playbook.md` (section 0): **context** at once (said, shown and written on screen), then the **lean** (proof from your facts, a specific pain or benefit, or something unexpected), then the **contrarian snapback** that pulls the viewer onto another path. `/viral-hook-writer` labels every hook's three beats and drops any that fail the read-back test, `/reel-scripter` opens every script with one, `/reel-review` checks it on the draft, `/hook-mining` labels mined hooks by their beats, the engine's script step and the house rules use it, and `/ab-hook-tester` suggests testing the same hook with and without the snapback.

**Switch between platforms on the dashboard.** Once Facebook or Threads is connected, a switch in the filter bar (All, Instagram, Facebook, Threads) shows each platform's own followers, views (plays on Facebook), engagement, posts, follower chart, views by week and top posts; All adds them up, and the page remembers your choice. Sections only Instagram has (audience, best time to post, comments, hook tests) say so on the other platforms.

**Getting started**
- **The README walks a new person through every prerequisite.** Homebrew on a Mac (with the "Next steps" lines it prints), Git on Windows, Node.js on Linux, which ZIP folder to open, a terminal on Linux, and the browser tool as a "before you begin" step. There is also a table of what goes where on your computer, and the install time (20 to 40 minutes, mostly downloads).
- **Message 1 and the browser tool now agree.** With the browser tool on, Claude does the website steps (the key page, the sound packs). It makes the empty key file and opens it for you, and it hands you any command that needs your password instead of failing at it.
- **The installer is friendlier.**
  - It finds a Homebrew that is installed but not yet on your path and tells you the two lines to fix it.
  - On Linux it gives you any `sudo` command to run in your own terminal instead of failing without one.
  - It makes the empty ElevenLabs key file and says exactly how to open it on your system (no hidden `.txt`).
  - It now detects the browser tool on Windows too.
- **The checkup no longer counts missing sound packs as a problem.** Reels work without them, so they show as optional, with the right command for Windows.
- **The first reel no longer asks again** for the handle, theme, voice and presenter `/brand-setup` already saved.
- **Brand files stay in the brand folder.** `/brand-setup` in the kit folder leaves the sticker host and other brand files for the brand's own folder. The kit refuses to start a reel in its own `template/`, and ignores a stray `brand/` or `reels/` folder at its top level.
- **The dashboard's hooks work on Windows without Git Bash.** The hook path is now filled in by Claude Code itself, and the hooks also run after PowerShell commands.
- **The template sync no longer creates a folder you did not ask for.** Run with no arguments, it refreshes a copy-from folder only when you keep one (`REEL_TEMPLATE_HOME`).
- **Everything reads in the order you do it.** The README's quick start says it is for people who already have the prerequisites. The installer checks for the browser tool before the key and sound-pack steps it helps with. Keyword replies start Business Verification before App Review, since it takes longest. The dashboard guide puts several brands last. The first reel starts with `/bagelunit-reels`.
- SETUP.md has the Windows and Linux lines for the steps that were Mac only, and says when Whisper is needed. The posting question reads the same everywhere. The costs list every optional paid part.

**Connecting your accounts**
- **The publisher can be finished.** Cloudflare asks for a card before R2 storage works, even within its free limits. The guide and `setup.mjs` now include that step: Claude stops at the payment form and you enter the card. The storage space is named per brand (`<slug>-kv`), so several brands fit on one Cloudflare account.
- **Keyword replies can actually arrive.** NEW `node publisher/scripts/setup.mjs subscribe` asks Meta to send your account's comments and messages to your publisher, the step Meta requires after the webhook (`--dry-run` first; the token is never shown).
- **The publisher reads the login type from your Instagram file** and says plainly that it needs Instagram Login or Unified Login; a Facebook Login setup is refused instead of failing later. `secrets` skips any value you have not pasted yet.
- **Unified Login tokens.** Pick "Never" when Meta offers it; if it does not, the end date goes in the file and the dashboard warns a week ahead.
- **Dashboard hosting:**
  - Netlify's free Private visibility is the default, and the site is created without prompts or linking.
  - Cloudflare Pages is created with the right production branch. The guide says Cloudflare asks for a card for Zero Trust, and shows how to protect the real address, not only previews.
- **Telegram:** the steps now include confirming your own chat (`link --yes=<id>`) before `test`, that a bot's username cannot change, and `/token` for a new token.
- **Meta details brought up to date:**
  - Hashtag search needs two approvals.
  - Mentions arrive with comments on Instagram Login.
  - The Threads app secret is under App settings, Basic.
  - Meta allows one Instagram setup per app.
  - What to record for App Review.
  - Nine new rows of troubleshooting.
- The dashboard's refresh now runs when only Facebook or Threads is connected. The Instagram check no longer asks for a field that exists only with Instagram Login, which broke the first check for Unified Login.
- **From a real brand's setup (all three platforms and the publisher):**
  - `setup.mjs check` waits and asks again once when Cloudflare has not picked up new secrets yet.
  - The secrets dry run says the admin key "would be made now and sent" instead of "skipped".
  - `/kit-update` tries GitHub up to three times, with a time limit, before giving up.
  - The guide now covers: adding the insights permission to an app that already exists (a new configuration, without the ad permissions), what to do when `pages_read_engagement` is not offered, where the Page id really is, choosing "current only" when Facebook offers every Page and business, that the Explorer shows the old token until Generate, Threads in the same app with no permission picker, that accepting the Threads tester invite needs your yes, and running a second publisher next to an old one.
- **Engine changes** (`/kit-update` updates the engine too, or run the installer again): the checkup, the first-run questions, and `kit start` refusing the kit's own template.

## 1.12.0 (2026-11-10)

- **How often should you post? Ask the kit.** Type `/content-calendar how-often` in a brand folder. It suggests how many reels a week to post from real numbers, not a rule of thumb about your niche:
  - **Accounts like yours.** You name 3 to 5 accounts in your niche (or Claude suggests some for you to confirm). With Instagram connected through Unified or Facebook Login, the kit reads each one through Meta's official API: how many posts and reels a week they make, and which do best for their size (views or likes and comments per follower). It also reads an export you already have.
  - **What you can keep up.** How many reels a week you say you can approve, and how far your voice credits go (talking-head reels use none).
  - **Your own numbers.** Once 8 posted reels have numbers across 4 weeks, whether your busier weeks got fewer views per reel than your quieter ones.
- It prints the suggestion with every reason, says plainly that it is a starting point, and offers to set your posting days, times and weekly plan to match. A new brand in a fast niche is told to start lower and build up over the first month. The Planner panel on the dashboard shows the latest suggestion and its date.
- **"Suggest a number for me" in `/brand-setup`.** The posting question now offers it. Without Instagram connected yet, it says so, starts at 3 a week, and points to `/content-calendar how-often` for later.
- **Competitor reads keep the account's followers** (`brand/research/accounts.json`), so `/account-audit` and the suggestion can compare accounts of different sizes.
- **The engine's voice budget can report the account alone**: `budget.py --left` prints the characters left, the monthly allowance and the reset date. Run `/kit-update` (it updates the engine too) to get it.
- The prompts guide (`docs/prompts.md`) offers the same posting choices as setup, including several a day.

## 1.11.0 (2026-11-10)

- **Post as often as you like, up to 20 a day or more.** A brand can now have any number of posting times a day (`brand.json` -> `posting.times`, for example `["09:00", "13:00", "19:00"]`). Each time on each posting day is one slot. `/brand-setup` asks "Several a day" with how many and when (spread evenly, or your own times), and `/content-calendar days` does the same. Brands with one posting time keep working as before.
- **Open slots per time, not per day.** A day used to count as full as soon as one reel was on it. Now a reel with a time takes that slot, a reel without one takes the earliest free time, and the rest of the day's times show as open on the dashboard, in `calendar.md`, in the Telegram summary and in the summary after each refresh. Times that have already gone by today no longer count as open.
- **A plan row can carry its time.** Write `2026-11-12 13:00` in the Date column of `brand/plan.md` and the reel takes the 13:00 slot. `/content-calendar plan` fills every open time this way.
- **A busy calendar stays readable.** The next 14 days show six reels a day and a link to the rest; month cells show three and "+N more", which opens that day; the week and day views list every reel and every open time. "Needs you" groups many reels that are not started yet into one line instead of one line each.
- **Angles at high volume.** With more than five reels in a batch, the angles take turns so no two reels next to each other share one (there are five angles, so a big batch cannot keep them all different).

## 1.10.1 (2026-11-10)

- **Dashboard layout fixed.** The "Needs you" and "Next 14 days" lists were drawn over by the "Your content team" band and everything below it, because a small bar in the audience section shared their layout's style name. The bar has its own name now, and the lists show in full.
- **Long titles no longer break the page.** A long title or reel folder name with no spaces could stretch its column past the window, squeeze the column next to it to one word per line, and make the page scroll sideways. Every column now keeps to its share of the width, long words wrap, and small cards fit a phone screen.
- **Odd data no longer blanks the dashboard.** Audience numbers saved in a different shape (for example by hand) are read instead of stopping the whole page from drawing.
- **A check so it stays fixed.** The kit's checks now fail if two styles in the dashboard share one name by mistake.

## 1.10.0 (2026-11-09)

- **Content calendar and dashboard.** Type `/content-calendar` in a brand folder. It makes one page, `brand/dashboard.html`, that works on a computer and a phone: your numbers up top, what needs you next (each with its command), the next 14 days, a calendar of planned, scheduled and posted reels with your open posting days, a board of where each reel is (idea, script, each approval, scheduled, posted), and your top posts. A plain-text copy goes in `brand/calendar.md`.
- **Designed to feel alive.** Paper and a faint grid, big numbers in heavy capitals, your brand's own colour, and a navy band for your content team. Sections rise in, numbers count up, charts draw themselves, and the agents' loop always moves, with a small looping picture of each agent's job. It all holds still if your system asks for reduced motion. The fonts are inside the page, so it looks the same offline and online.
- **Month, week and day views.** The calendar switches between the three, with arrows and a Today button; click a date to open that day.
- **A pipeline you can work from.** Cards show just the title. Click one and the full card opens: its stage, the next step with the command to copy into Claude Code, dates, goal and angle, hook, script, caption, whether the final file still matches what you approved, numbers, approval history and files. Find a reel by name, show only what needs you, and step through a stage with the arrows. The calendar and "Needs you" open the same card. Stages only change when you approve in Claude Code.
- **A pipeline that shows the whole road.** Seven numbered stages under Plan, Make and Ship, kept quiet: plain columns, Gate A, B and C as small marks on the lines where you approve, a dot on each reel that needs you, and folding for long stages. Click a stage's title to focus it.
- **Everything connects.** One filter bar (find, needs you, stage) stays at the top and applies to every section at once. Point at a reel and it lights up wherever it appears; every reel opens the same card from anywhere, and the card can take you to its day in the calendar.
- **Always in sync.** A small hook in each brand folder redraws the dashboard after any step that changed an approval, script, posting line, the plan or the numbers. A redraw keeps your filters, view, date, open card and scroll. The live Wi-Fi view reloads by itself and shows Live.
- **A first-run page.** A new brand's dashboard opens with "Get started": the steps in order (brand setup, posting days, a plan, a first reel, then optionally Instagram numbers and your phone), each with its command and a Copy button. Steps tick themselves off and the panel goes away when the main ones are done.
- **The online copy keeps up.** With a host set, the page is uploaded again in the background after Claude changes something, at most every 15 minutes and once more after the last change. Set `dashboard.publish_every` to change the 15, or 0 to upload only with the daily refresh.
- **A/B tests with trial reels.** `/ab-hook-tester` now runs the whole test: two hooks, each built and approved as its own version, both posted as Instagram trial reels (shown to non-followers first), compared on skip rate (or another number you pick), and the winner called on the dashboard once each has enough views. You share the winner to your followers in the Instagram app; the lesson is kept in `brand/tests.md` for the next reels. A connected publisher sends Meta's `trial_params`.
- **Your sticker host grows with your reels.** When Claude plans a Print reel, it picks the pose each line acts out (counting money for a cost, a magnifier for a detail) instead of the nearest pose you already have. The visual plan lists the new stickers and their cost, your yes to it covers making them, and each joins your sticker library with the reel it was made for, ready for later reels.
- **One reel, every platform.** `/reel-repurpose` turns an approved reel into its TikTok and YouTube Shorts versions (caption, title, description, and a check that no text hides under each app's buttons), an Instagram carousel plan and a blog post.
- **Content mix, series, time and cost.** The dashboard shows the goals and angles of your last 10 posts and warns when one repeats, groups reels into series, shows how long a reel takes from start to posted and where it waits longest, and counts the voice credits each reel used.
- **All your brands on one page.** `/content-calendar all` lists every brand folder on the computer, most urgent first, with the next 7 days across all of them.
- **Told when something needs you.** A line at the top of the dashboard, and Claude says it in its first reply when you open Claude Code in the brand folder.
- **Readable in any brand colour, honest agent lights.** A light brand colour (yellow, pale green) is darkened where it is used for text and lines. Agent lights now go by what each agent really made, not by when a file was saved.
- **Four agent panels.** Ideator, Hook & Script, Planner and Analyst, each mapped to the kit's own skills: when it last made something, what it made (click to open the file) and the command to run it next. They work when you start them; the light on each one shows whether it made something today.
- **Followers and trends.** Your follower line, views by the week posts went out, and each recent reel's watch time and skip rate against your own median.
- **Plan the next weeks.** `/content-calendar plan` suggests topics for your open posting days, each with one goal and its own angle, and adds them to the new `brand/plan.md` after your yes. `/content-calendar days` sets the days and time you usually post.
- **Your Instagram numbers, read only (optional).** `/content-calendar connect instagram` reads your own account through Meta's official API: followers, and per post views, reach, likes, comments, saves, shares, average watch time and skip rate. It matches posts to your reel folders, keeps a daily follower count in `brand/followers.csv`, adds each reel's 7-day row to `brand/insights.csv`, and renews its token by itself. Both of Meta's ways in work: Unified Login (Meta's advice for new setups, and the one that allows research) and Instagram Login. With Unified Login the check finds your account's id by itself. You make the token and put it in a file yourself; Claude never sees it.
- **Your audience.** With Instagram connected, the dashboard shows the last 7 and 28 days (accounts reached, how many of them do not follow you yet, followers gained and lost, views, profile taps, reposts), the hours your followers are online with the best time to post in your own time zone, who follows you (age, gender, countries, cities), and your stories' numbers.
- **Comments and DMs, answered with you.** The dashboard lists comments waiting for your reply and posts you are tagged in. `/comment-responder` reads them and, one at a time after your yes, replies in public (never with a link), sends a private reply, hides, unhides or deletes a comment, or turns a post's comments off. It also lists your DMs and answers people who wrote first, within Meta's 24-hour window. Every action is written to `brand/inbox-log.md`.
- **Facebook Page and Threads numbers (optional).** `/content-calendar connect facebook` and `connect threads` read your Page's followers and views and each reel's plays, reach, watch time, likes, comments and shares, and your Threads followers, profile views and each post's views, likes, replies and reposts. A new "Facebook and Threads" section shows them, and each reel's card shows its numbers on every platform side by side. You make the token in Meta's Graph API Explorer; the first check trades it for a lasting one and removes the app secret from your file. The Threads token renews itself weekly.
- **Research through Meta's official API.** With Unified Login, `/account-audit` reads other business and creator accounts' recent posts with their views (Meta's business discovery) and ranks their outliers, no scraping and no cost. `/reel-sources` can read the top or newest posts for a hashtag once Meta approves the Instagram Public Content Access feature for your app (30 hashtags a week).
- **Covers made for you.** `kit cover reels/<slug>` renders the reel's cover scene to `out/cover.jpg` at Meta's size and limits, plus `build/cover-crops.jpg` that shows how it sits in the grid (3:4) and in square crops. Gate C records the cover's fingerprint next to the video's, so the approved cover is the one that goes out and a changed cover needs Gate C again.
- **The kit now posts for you, on Instagram, Facebook and Threads (optional).** Each brand folder has its own publisher (`publisher/`), a small program on Cloudflare's free plan that posts at the time you approved, even with your computer off: the reel on Instagram with its approved cover (or as a trial reel), the same reel as a Facebook Reel on your Page, and a Threads post (the video, or a short text with the reel's link). `/reel-posting` checks Gate C and the fingerprints of the video and the cover, shows you a preview, and schedules only after your yes. The approved cover goes on Instagram and on the Facebook Reel. A reel too long for a platform (a Facebook Reel is 3 to 90 seconds, a story up to 60, a Threads video up to 5 minutes) is refused before anything is uploaded, with the reason. Everything starts in dry run, each platform goes live on its own switch, Meta's daily limits are checked before each post, and each file is deleted once posted. What went out comes back by itself: the reel's "Posted on" lines with links, its status on each platform on the reel's card, and a failed post under "Needs you" with Meta's reason.
- **Keyword comment replies in the publisher (optional).** Once you have tested a keyword from a second account, the publisher answers it with one public reply (never a link) and one private message with the link, and every automatic message says it is automated. `publisher/scripts/schedule.mjs status` shows what a test would have sent.
- **Claude does the web setup in your browser.** With the browser tool (Claude in Chrome, in Chrome, Edge, Brave, Arc, Vivaldi or Opera), Claude opens each site, clicks through the menus and fills in the settings for switching Instagram to a professional account, the Meta app, your Facebook Page and Threads, Cloudflare, Telegram, Netlify, ElevenLabs, the sound packs, Apify and Runway. For the sticker host it connects Higgsfield to Claude with you, makes an OpenAI or Gemini key, or makes each pose in ChatGPT or the Gemini app and saves it into the brand folder. You do three things: log in, copy each key into the file Claude opens for you (Claude stops one click before a key shows and does not look at it), and click the last button whenever something is deleted. Claude asks before anything that costs money or goes to Meta. `docs/browser.md` explains how to turn it on, the installer checks for it, and every guide still has the steps written out if you would rather click yourself. `/brand-setup` also reads your website and Instagram profile in the browser to suggest answers.
- **No more pasting tokens into the terminal.** `node publisher/scripts/setup.mjs secrets` moves every token from your token files to Cloudflare without showing it, and makes the publisher's own keys itself. The connection checks now save each account id they find, so nothing is copied by hand but the tokens themselves.
- **Keyword replies: what Meta really asks for.** The guide now says it plainly and in order: Meta sends comment notifications only to an approved, Live app (App Review for the comments permission, then Business Verification), and not at all before, so the test comes after approval. `/comment-responder` now offers the kit's publisher as the first choice, and the guide no longer asks for two Threads permissions the kit never uses.
- **One guide to connect everything.** `docs/connect.md` walks you through every connection in order, for Mac, Windows and Linux: which Instagram login to pick, making the Meta app and each token, your Facebook Page, Threads, the publisher, keyword replies, the phone summary, the online copy and the daily refresh, how it all stays in sync, a check list, and what to do when something goes wrong.
- **A summary on your phone (optional).** `/content-calendar connect telegram` sends a short daily message through your own Telegram bot: followers, views, what needs you, the next 7 days, open slots and your next idea. It only reports.
- **View it your way (optional).** `/content-calendar host`: just this computer, live on your Wi-Fi (your phone opens a private address and the page redraws when your files change), Netlify (our suggestion), Cloudflare Pages, or a ready folder for any other host. You log into the host yourself, the page keeps search engines out, and the Telegram summary links to it.
- **Refresh by itself (optional).** `/content-calendar auto` runs the refresh daily or weekly on a Mac (launchd), Windows (Task Scheduler) or Linux (cron). It also puts the page online if you chose a host. No AI runs in it, so it costs nothing.
- **Posting lines the calendar can read.** `/reel-posting` now writes "Posted", "Scheduled" and "Cancelled" lines in a fixed shape (with the post's link when you have it), suggests the reel's planned date or the next open slot, and refreshes the calendar. The calendar also refreshes after each approval, and a session that starts without a task opens with what needs you.
- **Checked before release.** A full review of the dashboard, the connections and the publisher, with these fixes: one token shared by several brands no longer mixes up their accounts (each brand's account id is kept in its own `<name>-<slug>.ids.json`); with Instagram Login the kit saves the account id Meta uses for posting and replies; a post scheduled as a dry run stays a dry run, even if the publisher goes live before its time, and a dry run can be tested before posting is allowed; a Facebook Reel can no longer be posted twice when a run is cut off or two runs overlap; a new token sent with `setup.mjs secrets` always replaces the one the publisher kept; the Wi-Fi page no longer reloads by itself; agent lights on a new brand start dark, and only move when that agent made something; a comment or DM action needs the one-time code its preview printed (`--yes=<code>`), and Claude Code asks before running it; `/content-calendar off` turns off Facebook and Threads too; the app secret leaves its file after the first token trade, even a failed one; a slow Meta API stops the refresh after 3 minutes with what it already read; one broken brand file no longer stops the page from redrawing, and the session notice says which; the daily refresh keeps working after a Node upgrade; post links on the page must be https; the publisher's inbox and data deletion keep working with many records, and unused uploads are removed. The safety scan now also checks files not yet added to git.
- Guides: `docs/connect.md` and `docs/dashboard.md`. Existing brand folders: `/kit-update` adds `/content-calendar`, the dashboard hook in `.claude/settings.json` (your own settings belong in `.claude/settings.local.json`), `brand/plan.md`, the guide, and the new `posting.days`, `posting.time` and `dashboard` settings (all off, including `facebook` and `threads`), and the `publisher/` folder (it does nothing until you set it up). Nothing in your reels changes. Run `bash setup/install.sh` again (Windows: `node setup/install.mjs`) so the reel engine records what each reel's voice cost.

## 1.9.0 (2026-11-09)

- **The sticker host.** The sticker presenter is now the **sticker host**, and you can make your own: type `/sticker-host` in a brand folder. From one photo it makes a base pose for your approval, then a starter pack of 10 poses (idle, point, raise, thumbs, shock, think, shrug, wave, open, celebrate), each checked on one sheet. Your real logo is printed on the chest, never drawn by the image tool. Backgrounds, the white sticker border and lining every pose up at the same size all run on your computer for free.
- **Any number of poses.** A set is no longer a fixed 19: it grows with your reels. At the visual-plan approval the kit checks the reel's poses (`kit host reels/<slug> --check`), names any the set does not have, and after your yes makes it from your base pose. `kit host` links the set into a reel and lists every pose, whatever its name.
- **Pick your image tool.** ChatGPT or the Gemini app (by hand, no key), the OpenAI or Gemini API (automatic, your own key), or Higgsfield (ours was made with Higgsfield). The pose recipe and simple outline diagrams of each starter pose ship with the kit; no one's photo or poses do.
- **Every command in one place.** `COMMANDS.md` lists every command and what it does, also as a PDF and a spreadsheet you can open in Excel.
- **The method page** (`docs/reference.md`) now describes the kit's own method only.
- Existing brand folders: `/kit-update` adds `/sticker-host`. Run `bash setup/install.sh` again so the engine gets `kit host`. A pose folder you already have keeps working.

## 1.8.4 (2026-11-09)

- **Update notices are on by default.** `/brand-setup` now recommends "Tell me when a newer kit version is out": once per session Claude reads one public file from GitHub and tells you if a newer kit is out, then `/kit-update` updates it. It never updates anything by itself. New brand folders start with it on; existing brand folders keep the choice they made.

## 1.8.3 (2026-11-09)

- **Every step names its command.** The guides and Claude's own instructions now lead with the command for each step: `bash setup/install.sh`, `/brand-setup`, `/bagelunit-reels` with your topic, `/analytics-readout` with your numbers, `/kit-update`. The longer prompts in `docs/prompts.md` are still there for anyone who wants every blank explained.

## 1.8.2 (2026-11-09)

- **Reels are only made in the brand's `<brand>-reels` folder.** The engine now refuses to start a reel anywhere else (the brand's project folder, the kit's folder, a home folder) and says which folder to open instead. It also refuses a brand folder whose brand is not set up yet, so the kit's blank `template` can never fill up with reels. Brand folders with an older name still work, with a note.
- The README, the brand folder's rules and the engine's steps say the same thing.
- Run `bash setup/install.sh` again (or "update the kit" in a brand folder, then let it update the engine) so the engine gets the new check.

## 1.8.1 (2026-11-09)

- **Brand folders are named `<brand>-reels`.** `/brand-setup` now suggests `~/Reels/<brand>-reels` (for example `bagel-unit-reels`), and every example in the guides uses that name, so a brand's reel folder never looks like the brand's other folders. `setup/new-brand.mjs` always adds `-reels` if the name does not end in it, so `~/Reels/acme` becomes `~/Reels/acme-reels`. Existing brand folders keep their names.

## 1.8.0 (2026-11-08)

- **One first command after installing: `/brand-setup`.** Type it in Claude Code in the kit's folder. It asks the brand's name and where its folder should go (it suggests `~/Reels/<brand>`), makes the folder, asks the brand questions there, and tells you how to open it to make reels. No more copying the `template` folder by hand. The installer now ends by pointing at it.
- **`setup/new-brand.mjs`** makes a new brand folder from the command line on Mac, Windows and Linux: `node setup/new-brand.mjs ~/Reels/my-brand`. It never overwrites a folder that already has files, and never puts a brand inside the kit's own folder.
- **The kit's own folders stay blank.** `/brand-setup` now refuses to fill in the kit's `template/` folder or the generic `Reel Template` folder, and makes a brand folder first.
- **A safe place for your own rules: `CLAUDE.local.md`.** Rules for one brand only (for example "you pick the style for each reel") go in `CLAUDE.local.md` in that brand's folder. Claude Code reads it automatically, and kit updates never touch it, while the workspace's `CLAUDE.md` is replaced by each update. "Update the kit" now offers to move a brand-only change there.
- Existing brand workspaces update with "update the kit" (or `node setup/sync-template.mjs <workspace>` as a dry run, then `--apply`). To get `/brand-setup` in the kit's folder, download the new kit (or `git pull`).

## 1.7.1 (2026-11-08)

- **The ElevenLabs free plan is for trying the kit only.** ElevenLabs allows only non-commercial use on it, with credit to ElevenLabs, so reels for a business or a client need a paid plan. The README has a new "What it costs you" note.
- **Clearer docs for new users.** Every guide was read as a brand-new customer would read it. Copying the template, saving the key on Windows and Linux, and handing over a talking-head video now work as written. A stopped reel picks up again with "carry on with the reel about ...", and brand folders link to guides they can actually open. One name for the presenter and the same reel lengths everywhere.
- **Your approved script is safe.** `kit start` used to replace a `script.txt` already in the reel folder with the sample script. It now keeps it and tells you so.
- **Node.js 22 or newer.** Node 20 reached end of life in April 2026. On Linux, install Node from nodejs.org, because the `nodejs` package from apt is too old on most versions.
- **GitHub checks updated.** The kit's own checks on GitHub moved off the GitHub Actions that ran on Node 20, which GitHub had marked as deprecated, and now test on Node 22.
- Existing brand workspaces update with "update the kit" (or `node setup/sync-template.mjs <workspace>` as a dry run, then `--apply`). Run `bash setup/install.sh` again so the engine gets the script fix.

## 1.7.0 (2026-11-07)

- **New name: BagelUnit Reel Kit** (formerly Susanoo Reel Kit). The engine command is now `/bagelunit-reels`, installed in `~/.claude/skills/bagelunit-reels`, with settings in `~/.config/bagelunit-reels/`. Run the installer again: it copies your old settings and keys over once and tells you which old folder to remove. The licence is now the BagelUnit Reel Kit License; its terms did not change.
- **A review before every final.** New `/reel-review` skill: seven must-pass checks (facts, words, hook, safe areas, handle, sound, honesty), eight scored checks, and one verdict line (meets the bar, close, or not ready) saved with the approval.
- **File checks.** `kit qa` checks the finished file: format, loudness, black or frozen stretches and whether the first word lines up with the first sound. It says plainly which checks it skipped. `kit lint` checks shot grammar (shot length, face time, repeated layouts, cuts in the middle of a word, rhythm, movement in the first second).
- **A second look at the facts.** New `/reel-factcheck` step, twice per reel: on the script before Gate A (before any voice credits) and on the final before Gate C. `kit facts` does the mechanical half (uncleared numbers, missing sources, old clearances, leftover placeholders, absolute wording such as "only", "best" or "faster") and writes a worksheet. Then a fresh reader re-reads every source and rules each claim supported, overstated, not found, changed or unsourced. `kit gate` will not record Gate A or C without a current PASS, and a PASS goes out of date if the script, caption or a facts row changes. The owner can override with `--skip-facts "reason"`, which is written into the record.
- **Every skill tested, and fixed.** All 21 workspace skills were run on a test brand (two more were added after: `/reel-posting` and `/kit-update`, 23 in total). The two that could post, DM, scrape or spend (`/comment-responder`, `/content-factory`) now read the brand's autopilot permissions first and only draft when a permission is off. Other fixes: a keyword call to action only when the keyword was tested, no third-party logos, no unsourced stats or seller prices inside skills, the style question, fact check and credit check before Gate A, a 110 to 125 word script length, the real cover safe area, small-sample warnings, facts-only replies to comments, `hook-mining --metric`, `account-audit --csv`, and clearer paths for `/reel-predict` and `/reel-analyzer`. New empty `brand/log.md` and `brand/swipe.md`. Skills now load from plain requests (tested in live Claude Code sessions: 19 of 20 on the first try), and the workspace rules have a "which skill for which step" table. Brand setup now saves the chosen theme.
- **Posting plan and question blocks.** Brand setup now asks how many reels a week to post and saves it as the brand's weekly batch size (`batch.max_reels`, default 3); goals may repeat in a batch, angles may not. Every setup question, the style question and the autopilot question are asked as clickable question blocks with an "Other" box, never as plain text.
- **Auto-post guide.** `docs/auto-post.md` explains three ways to post approved reels on a schedule (Instagram's own scheduler, a scheduling tool, or your own publisher on Meta's API), with the rule that only the exact file approved at Gate C can go out.
- **Auto-reply guide.** `docs/auto-reply.md` explains how to connect a comment auto-reply and DM for one brand: a no-code tool, or your own small service on Meta's API (one per Instagram handle), with the safety rules that apply either way. The kit itself still sends nothing.
- **Approvals tied to the file.** `kit gate` records each approval and, at Gate C, the final file's fingerprint, so a change after approval shows up.
- **Voice credits protected.** The voice and take tools now remember every paid request. The same request again costs nothing, and a request that may already have been billed is refused until you say so.
- **Estimate before posting, honestly.** `kit measure` gives facts about a video. `kit predict` adds a watch-time and skip-rate estimate only after `kit calibrate` has learned from at least 8 of your own reels' Instagram numbers. Until then it gives measurements and never a prediction. New `/reel-predict` skill explains the results.
- **Craft playbook and ideas.** `docs/craft-playbook.md` covers one world per reel, a through-line that builds, a table of which picture shows which kind of line, and a no-repeat rule. `docs/style-ideas.md` has eight new style concepts to build and test one at a time (concepts only, not modes).
- **Library folders.** `brand/library/` has places for B-roll, product images, components and screens, with an index. The media files stay out of git.
- Existing brand workspaces update with `node setup/sync-template.mjs <workspace>` (dry run), then `--apply`. The engine needs `bash setup/install.sh` again to pick up the new tools.

## 1.6.1 (2026-11-06)

- **A beginner-friendly start, with copy-and-paste prompts.** The README now has a "Start here" guide (what to install, how to open a terminal in a folder) and the first prompt, with every blank explained in plain words. `template/docs/prompts.md` has the set-up-this-brand, make-a-reel (with a filled-in example), after-posting and weekly-batch prompts. A blank you delete becomes a question Claude asks you instead.

## 1.6.0 (2026-11-06)

- **The update script now runs on Windows too** (`setup/sync-template.mjs`; the old `.sh` still works as a launcher). It also keeps each workspace's `.gitignore` current.
- **A first-reel guide and a blank example.** `docs/first-reel.md` walks a new user through a reel in plain steps; `reels/_example/` is a blank pattern for a script, approvals and caption.
- **Voice credit check before Gate A.** `tools/budget.py` counts the script's characters and compares them with the ElevenLabs credits left, so you know before approving.
- **Apify spend log.** Every paid outlier fetch is recorded in `brand/spend.csv`, and the next plan shows the running total.
- **Private history per workspace (optional).** Brand setup can start a local-only history of the brand's files, with a `.gitignore` that keeps keys, renders and audio out. Claude commits after each approved gate and never uploads it.
- **`yt-dlp` help.** The installer now offers it, and a failed download says how to update it.
- **Safer public repo.** A scan on every push checks for keys, private files, banned names, personal paths and em dashes.
- **Releases publish themselves.** Changing `VERSION` on main now creates the GitHub Release from this file.

## 1.5.0 (2026-11-06)

First numbered release of the whole kit.

- **Works on Mac, Windows and Linux.** One installer (`setup/install.mjs`, with `install.sh` and `install.ps1` launchers) asks before installing anything and never runs as administrator by itself. It also downloads the Whisper model when a computer has the tool but no model, which word timing needs.
- **Reel skills now live in the template.** Every brand copy carries its own 17 skills, so brands never mix: hook, script and caption writers, reel teardown, hook and comment mining, A/B hook test, cover brief, readout, humanizer, account audit and reel fetch.
- **Account audit.** Finds the reels that beat an account's own median (the 3x rule) from an export or from Apify. Off unless the brand owner turns on `autopilot.scrape`; the cost is shown first.
- **Reel teardown with eyes and ears.** `reel_fetch.py` turns a video into frames, a timestamped transcript and a `timeline.md` of what is shown and said each second.
- **Hook and review playbook** with the eight-point first-frame hook checklist, one goal and one angle per reel, and a review that finds where viewers drop off.
- **Weekly batch mode** for planning up to three reels at once, each approved separately.
- **Brand setup can read your website** and suggest a name, colours, fonts and handle. Nothing is written until you confirm it.
- **Update tools.** `setup/sync-template.sh` refreshes the generic folder and updates a brand workspace without touching its `brand/` or `reels/`. Each workspace now records the kit version it is on, and can optionally tell you when a newer one is out.
