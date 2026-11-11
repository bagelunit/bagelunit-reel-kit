# Your content dashboard

Type `/content-calendar` in Claude Code in this folder. It makes one page, `brand/dashboard.html`, and opens it in your browser:

- **Numbers:** followers (once Instagram is connected), views, engagement, what you posted this week and month.
- **Needs you:** each reel waiting for your yes or a next step, with the command for it.
- **Next 14 days:** what is planned, scheduled and posted, and your open posting days.
- **Your content team:** the four agents in a loop. The Ideator finds ideas, Hook & Script writes them, the Planner puts them on your days, and the Analyst reads your numbers. Each panel shows when it last made something, a small picture of its job, what it made (click to open it), and the command to run it next. The loop always moves, but the agents only work when you start them; the light on each one shows whether it made something today. Each agent is judged only by its own work: new ideas or swipe rows for the Ideator, a new or changed script for Hook & Script, dated plan rows for the Planner, and `brand/stats.md` or numbers you added by hand for the Analyst (the scheduled Instagram pull does not count as the Analyst working). A new brand folder shows every agent as not run yet, and work from before the dashboard started watching shows as "date not known".
- **Trends:** your follower line, views by the week posts went out, and each recent reel's watch time and skip rate against your median.
- **Calendar:** month, week and day views. Use the arrows and Today to move, and click a date to open that day.
- **Pipeline:** every reel and idea in seven numbered stages, grouped as Plan, Make and Ship, with small A, B and C marks on the lines where you approve (Gate A, B and C). Each card shows just its title, and a dot means it needs you. Click a stage's title to focus it everywhere; long stages fold after six. Click a card and it opens in full: where it stands in the seven stages, the next step with its command to copy into Claude Code, the planned, scheduled and posted dates, goal and angle, the hook, the script and caption, whether the final file still matches what you approved, its numbers, its approval history and its files. The arrows step through the reels at the same stage. Entries in the calendar and in "Needs you" open the same card. Cards never move a reel to another stage by themselves: a stage changes only when you approve it in Claude Code.
- **Top posts.**

**A/B tests.** Run `/ab-hook-tester` on a reel to test two hooks. Each version is its own approved reel, both go out as Instagram trial reels (shown to non-followers first), and the dashboard's A/B tests section puts them side by side on the number that decides it (skip rate by default), with the views each still needs. Once both have enough and they differ by 10% or more, it calls the winner and tells you to share that one to your followers in the Instagram app. `/ab-hook-tester record` saves the result in `brand/tests.md`, which the Planner and the hook writers read next time. The 10% rule is a rule of thumb, not statistics.

**Content mix, series, time and cost.** The Trends section shows the goals and angles of your last 10 posts and warns when one angle repeats; how many days a reel takes from start to posted and which step it waits longest at; and how many voice credits you used this month (counted by the reel engine; reels made before this version are estimated from their script). Give plan rows a Series name to see a series grouped, with what is next in it.

**When something needs you.** A line at the top of the dashboard says how many things need you now. When you open Claude Code in this folder, Claude tells you the same in a line or two at the start, with the commands.

**Everything is connected.** One bar stays at the top as you scroll: find a reel by name, show only what needs you, or pick a stage, and it applies to "Needs you", the next 14 days, the calendar, the pipeline and top posts at once. Point at a reel anywhere and it lights up everywhere it appears; the reel whose card is open stays lit. Every reel opens the same card, whether you click it in the pipeline, the calendar, "Needs you", an agent's list or top posts, and the card's "See the day" button takes you to its day in the calendar. The number cards at the top jump to their sections.

**It stays in sync.** The brand folder carries a small Claude Code hook (`.claude/settings.json`) that redraws the dashboard whenever a file it reads changes: an approval, a new script, a posting line, the plan, the numbers. It takes a fraction of a second, only runs when something changed, and never posts anything. If you put the dashboard online (section 4), it also queues an upload of the new page in the background, at most every 15 minutes. If a redraw ever fails (a broken value in a brand file, say), Claude tells you once at the start of the next session, with how to fix it. When the page redraws, it keeps your filters, calendar view and date, open card and scroll position. With the live Wi-Fi view the open page reloads itself and the top bar says Live; a file you opened by hand says Snapshot until you reload it. Settings of your own for this folder go in `.claude/settings.local.json`, which kit updates never touch.

**The first time**, a "Get started" panel at the top lists the steps in order (set up the brand if it is not yet, pick your posting days, plan your first weeks, make your first reel, then optionally connect Instagram and your phone), each with its command and a Copy button. Steps tick themselves off as you do them, and the panel goes away once the main ones are done.

The page works on a phone screen too, and holds still if your system asks for reduced motion. Everything below is optional and off until you turn it on.

## All your brands on one page

Running several brands? Type `/content-calendar all` in any brand folder. It draws one page with every brand folder on this computer (each adds itself when its dashboard is drawn), most urgent first: what needs you in each, the week's numbers, the next 7 days across all of them, and a link to each brand's own dashboard. It stays on your computer.

## 1. Plan your weeks

- `/content-calendar days` asks which days and at what time you usually post. Empty posting days show as open slots.
- `/content-calendar plan` suggests topics for those slots, each with one goal and its own angle, and adds them to `brand/plan.md` after your yes. You can also edit that file yourself.

## 2. Connect your numbers: Instagram, Facebook, Threads (read only)

This reads your own accounts through Meta's official APIs. On Instagram: your followers, and for each post its views, reach, likes, comments, saves, shares, average watch time and skip rate, plus your audience (reach, follows, the hours your followers are online, who follows you), stories, mentions and comments waiting for you. On your Facebook Page and Threads: followers, recent views, and each post's numbers. Reading never posts, comments or messages.

**`docs/connect.md` walks you through every connection, step by step** (Instagram with Unified Login or Instagram Login, your Facebook Page, Threads, and the publisher that posts for you). In short: Claude makes the Meta app in your browser (`docs/browser.md`), you log in and copy the token into the file Claude opens in `~/.config/bagelunit-reels/`, then type `/content-calendar connect instagram` (or `connect facebook`, `connect threads`). Claude runs a check that prints the account and changes nothing, and turns the connection on after your yes.

Each pull saves the account and every post's numbers in `brand/instagram.json` (and `brand/facebook.json`, `brand/threads.json`), adds today's follower count to `brand/followers.csv` (that file is your growth history, keep it), and, once a reel is 7 days old, adds its row to `brand/insights.csv`. `/analytics-readout` and `/reel-predict` already use that file.

**One platform at a time.** Once Facebook or Threads is connected, a switch in the filter bar (All, Instagram, Facebook, Threads) changes the numbers at the top, the follower and views charts and Top posts to that platform; the page remembers your choice. "All" adds up what can be added: followers, views and plays, posts, and likes, comments and shares. Meta counts differently on each (Facebook gives plays, Threads gives views and no watch time), and your audience, best time to post, comments and hook tests come from Instagram only, so those show on All and Instagram.

**Matching posts to reels.** The kit matches each post (Instagram, Facebook, Threads) to its reel folder by the post's link, then the caption, then the day it went out. To be sure, add the link to the reel's "Posted" line in `approvals.md`: `- 2026-11-09 21:05 Posted by hand on @handle: https://www.instagram.com/reel/...`. `/reel-posting` asks for it.

## 3. A summary on your phone (Telegram)

Once a day (or when you ask), a short message: followers and their change, this week's views, what needs you, the next 7 days, open slots, and your next idea. The bot only reports. Nothing you send it does anything, and every approval stays in Claude Code. The message passes through Telegram's servers.

With the browser tool (`docs/browser.md`), Claude does this in Telegram on the web; you log in and copy the token:

1. **Log in.** Claude opens web.telegram.org; you log in (scan the code with Telegram on your phone).
2. **Make the bot (you copy).** Claude makes `~/.config/bagelunit-reels/telegram-<slug>.json` (or `telegram.json` to use one bot for all your brands) with `{"token": "PASTE-YOUR-TOKEN-HERE"}` and opens it in your editor. Then it opens **@BotFather**, sends `/newbot` and the bot's name, and types a username ending in `bot` without sending it (5 to 32 letters, numbers or underscores). The username cannot be changed later, so Claude checks it with you first. You press Enter: BotFather answers with the token. Copy it into the file, save, and say "done".
3. **Start the bot.** Claude opens your new bot and presses **Start**.
4. **Link it.** Type `/content-calendar connect telegram`. Anyone can message a bot, so the kit asks you before it saves a chat:
   - Claude runs `node .claude/skills/content-calendar/telegram.mjs link`. It lists who has messaged the bot and saves nothing.
   - You confirm which one is you (your name and your Telegram username).
   - Claude runs `node .claude/skills/content-calendar/telegram.mjs link --yes=<your chat id>`, which saves your chat number in the same file.
   - Claude runs `node .claude/skills/content-calendar/telegram.mjs test` and you say whether it arrived. After your yes the daily summary is on.

By hand: the same steps in the Telegram app (BotFather, `/newbot`, name, username), then write the file yourself.

## 4. Where you view it

Everyone hosts differently, so you choose. Type `/content-calendar host`. Whatever you pick, the page holds your plans and numbers, so keep any online copy behind a login. The page always tells search engines to stay away.

- **Just this computer.** `brand/dashboard.html`, the default.
- **Live on your Wi-Fi.** `node .claude/skills/content-calendar/serve.mjs` prints a private address for this computer and one for your phone on the same network. The page redraws when your files change. Free, and nothing leaves your network. Keep the window open, and press Ctrl+C to stop. It is plain HTTP (not encrypted) and answers on every network this computer is on, Wi-Fi and any VPN, so use it only on a network you trust, such as your home Wi-Fi, not a cafe or office network.
- **Netlify (our suggestion, free, no card).** Claude runs `npx netlify-cli login`, which opens Netlify in your browser: you sign up or log in, and Claude (or you) clicks **Authorize**. Claude reads your team's short name (shown by `npx netlify-cli status`, not a secret) and runs `npx netlify-cli sites:create --name <slug>-dashboard --account-slug <team> --disable-linking --json`, which asks nothing and prints the site id and address; Claude saves those. Then, with your yes, Claude makes the site **Private**: in Netlify, the site, Project configuration, General, Visitor access, Project visibility, Edit visibility, Private, for production and previews, Save. On the free plan a private site opens only for you, after you log in to Netlify (on your phone too). If your team is on an older Netlify plan without Project visibility, the page is only as private as its address, so treat the address like a password. Each refresh uploads the new page.
- **Cloudflare Pages (asks for a card for the login).** Claude runs `npx wrangler login` (you log in, it clicks Allow) and `npx wrangler pages project create <slug>-dashboard --production-branch main`, then saves the project name and its `https://<slug>-dashboard.pages.dev` address. For a login in front of it, Cloudflare Access: its free plan still asks for a card when you first open Zero Trust (Cloudflare does not charge the free plan), so Claude asks you first and stops at the payment form for you. The project's own "Enable access policy" switch covers only preview copies, not the `pages.dev` address the kit uploads to. So Claude then follows Cloudflare's steps for the `pages.dev` address: in the project, Settings, Enable access policy, Manage, then under Access, Applications, your project, Configure, and in Public hostname delete the `*` from Subdomain and Save. The default login is your Cloudflare account; Claude can add a sign-in code by email as a second way in. Without Access, the page is only as private as its address.
- **Any other host.** `node .claude/skills/content-calendar/host.mjs folder` writes a ready site in `.cache/site/` (the page, plus files that keep search engines out). Upload that folder wherever you like.

The online page lives at a private address: your site's address plus a long random code (made once when you set up the host with `/content-calendar host`, and kept in `brand/brand.json` -> `dashboard.path_key`), and the site's front page is empty, so nobody finds the dashboard by guessing. Treat that address like a password. With a host set, the online copy follows your changes: after Claude changes something in this folder the page is uploaded again in the background, at most every 15 minutes, and once more after the last change, so it is never left behind. A page that has not really changed is not uploaded again, and a failed upload waits half an hour before it tries again. Change the 15 in `brand/brand.json` -> `dashboard.publish_every`, or set it to 0 to upload only with the scheduled refresh. The Telegram summary links to your dashboard. The online copy leaves out links to files on your computer, but it does include each reel's hook, script and caption, and, once Instagram is connected, other people's comments waiting for a reply (their usernames and what they wrote) and the posts you are tagged in. Choose a host with a login if any of that is private.

## 5. Refresh by itself

`/content-calendar auto` sets a job on your computer that runs the refresh daily or weekly: it pulls the Instagram numbers, redraws the dashboard, puts it online if you chose a host, and sends the summary. No AI runs in it, so it costs nothing. It runs only while the computer is on and awake, and the time is your computer's clock. Behind the scenes:

```
node .claude/skills/content-calendar/schedule.mjs install --daily 08:00     (or --weekly mon 08:00)
node .claude/skills/content-calendar/schedule.mjs status
node .claude/skills/content-calendar/schedule.mjs run-now
node .claude/skills/content-calendar/schedule.mjs remove
```

- **Mac:** a launchd job (`~/Library/LaunchAgents/com.bagelunit.reels.<slug>.plist`). A job missed while the Mac slept runs when it wakes. If this folder is inside Documents, Desktop or Downloads, macOS may block the job. `schedule.mjs status` then shows "Operation not permitted". Fix it in System Settings, Privacy & Security, Full Disk Access: press +, add the `node` program (the status line prints its path), and turn it on.
- **Windows:** a Task Scheduler task named `BagelUnitReels-<slug>`, which you can see and change in Task Scheduler. The computer must be on at that time.
- **Linux:** one line in your crontab, marked `# bagelunit-reels:<slug>`.

What each run did is in `.cache/refresh.log` in this folder. A failed pull or send shows on the dashboard under "Needs you".

## 6. Safety

- You log in to Netlify, Cloudflare, Telegram and every other site; Claude never types a password. With the browser tool Claude does the rest of each page (`docs/browser.md`).
- Claude never asks for, reads or prints a token. It opens the file in `~/.config/bagelunit-reels/` and you paste the token in. Only the scripts read them, and they keep them readable by you alone.
- The Instagram connection is read only. Posting stays with `/reel-posting` and your yes for each reel.
- To stop everything: `/content-calendar off`. Claude can show you the files in `~/.config/bagelunit-reels/`; deleting them is your click. To cut off access completely, Claude opens Instagram (Settings, Website permissions, Apps and websites) and stops at Remove, and opens @BotFather with `/token` typed for your bot, for you to send (it makes a new token, which stops the old one; do not paste the new one anywhere unless you want the summary back).
