# Connect everything: Instagram, Facebook, Threads, the dashboard and the publisher

This guide connects your brand's accounts to the kit, step by step. Every part is optional: the kit makes reels without any of it. Do the parts you want, in this order, because the later steps reuse the earlier ones.

Set aside about an hour the first time. **Claude does the web steps in your browser** with the browser tool (Claude in Chrome): it opens each page, clicks through Meta's and Cloudflare's menus, fills in names and permissions, and runs the kit's commands. You log in, copy each token into the file Claude opens for you, and click the last button when something is deleted. Turn the browser tool on first: `docs/browser.md` (it takes two minutes). Claude never asks for a token, never reads one and never prints one. Without the browser tool, do the same steps by hand: each one is written out below.

## What connects to what

| Part | What it does | You need | Cost | Step |
| --- | --- | --- | --- | --- |
| Instagram numbers | Followers, every post's views, reach, watch time, skip rate, saves, shares; your audience; comments and DMs waiting for you | An Instagram professional account and a Meta app | Free | 1 and 2 |
| Research | Other business and creator accounts' posts with their views, and the top posts for a hashtag | Step 2B (Unified Login) | Free | 2B |
| Facebook Page numbers | Your Page's followers and views, and each reel's plays, reach, watch time, likes, comments, shares | A Facebook Page | Free | 3 |
| Threads numbers | Your Threads followers and profile views, and each post's views, likes, replies and reposts | A Threads profile | Free | 4 |
| The dashboard sees it all | The numbers above on `brand/dashboard.html`, matched to each reel | Steps 2 to 4 | Free | 5 |
| The publisher | Posts your approved reels at the time you chose, on Instagram, your Facebook Page and Threads, and answers keyword comments | A free Cloudflare account | Free plan | 6 and 7 |
| Phone, online copy, daily refresh | A Telegram summary, the dashboard online, everything refreshed each morning | See `docs/dashboard.md` | Free | 8 |

## How it all stays in sync

```
 your reel folder ──(Gate C: you approve the final)──> /reel-posting ──> the publisher (Cloudflare)
        ▲                                                                   │ posts at your time
        │ "Posted on ..." lines                                             ▼
        └──────────── publisher/scripts/pull.mjs <──────────── Instagram, Facebook Page, Threads
                                                                            │ numbers, comments, DMs
 brand/dashboard.html <── instagram.mjs, platforms.mjs (read only) <────────┘
```

- **After every step Claude takes in the brand folder**, the kit's hook redraws the dashboard by itself.
- **The scheduled refresh** (step 8) reads Instagram, Facebook and Threads, reads the publisher's record, redraws the dashboard, puts it online if you chose that, and sends the phone summary.
- **The publisher** writes back what really went out: each reel's "Posted on ..." line with its link, so the dashboard moves the reel to Posted and matches its numbers on every platform.
- **Nothing posts without your yes.** The publisher only takes a reel you approved at Gate C, only the exact file you approved (its fingerprint is checked), and only after you said yes to its time. It starts in dry run, where it logs what it would do and sends nothing.

## Before you start

0. **The browser tool**, turned on (`docs/browser.md`). Then type `/content-calendar connect instagram` and Claude starts at the first step below.
1. **An Instagram professional account.** Personal accounts cannot use Meta's API. Claude opens instagram.com (you log in), then More (the three lines at the bottom left), Settings, and under "For professionals" **Switch to professional account**. It asks you Business or Creator (both work with the kit; Business if it is a company) and picks the category you name. Instagram moves these menus now and then, so Claude follows what the page shows. Keep the account public: Meta sends comment notifications only for public accounts. By hand, the same on instagram.com or in the app (your profile, the three lines, Account type and tools, Switch to professional account). To go back to a personal account later, the last Switch is your click.
2. **A Meta developer account.** Claude opens developers.facebook.com; you log in with your Facebook account, and Claude registers you as a developer (free). Meta may text you a code: that part is yours.
3. **For Unified Login, the Facebook Page and research: a business portfolio.** Claude opens business.facebook.com, creates one if you do not have one (free), and adds your Instagram account and Facebook Page to it (Settings, Accounts).
4. **The kit's folder for tokens.** All tokens live in one folder on your computer, outside every brand folder, so they never end up in a brand's history or online. Claude makes it:
   - Mac or Linux: `~/.config/bagelunit-reels/`
   - Windows: `C:\Users\<you>\.config\bagelunit-reels\`

### How a token gets into its file (used in every step)

Each file is a tiny piece of text in curly brackets. `<slug>` is your brand's short name, from `brand/brand.json` -> `slug` (for example `bagelunit`).

**With the browser tool:** before the step that shows a token, Claude makes the file with everything filled in except the token (`PASTE-...` marks the spot), makes it readable by you only, and opens it in your text editor. Then it stops one click before Meta shows the token and names that button. You click it, copy the token, paste it over `PASTE-...`, save, and say "done". Claude does not look at that tab while the token shows. Ids that are not secret (a Page id, an app id) Claude fills in itself.

**By hand**, the same file:

- **Mac or Linux**, in the Terminal app:
  ```
  mkdir -p ~/.config/bagelunit-reels
  nano ~/.config/bagelunit-reels/instagram-<slug>.json
  ```
  Paste the line the step gives you, with your token in place of `PASTE-...`. Save with Ctrl+O, Enter, then Ctrl+X. Then make it readable by you only: `chmod 600 ~/.config/bagelunit-reels/instagram-<slug>.json`
- **Windows**, in PowerShell:
  ```
  mkdir -Force $HOME\.config\bagelunit-reels
  notepad $HOME\.config\bagelunit-reels\instagram-<slug>.json
  ```
  Paste the line, save and close. If Notepad offers to add `.txt`, choose "All files" so the name stays `.json`.

Keep the quotes and the curly brackets exactly as shown. A token is one long line with no spaces.

## Step 1. Pick your Instagram connection

Meta offers two ways in. Both are free and both are read and write for your own account only.

| | Unified Login (recommended) | Instagram Login (simplest) |
| --- | --- | --- |
| Meta's advice | Recommended for new setups | For existing setups |
| You log in with | Instagram or Facebook | Instagram |
| Needs a business portfolio | Yes | No |
| Numbers, audience, comments, DMs, posting | Yes | Yes |
| Competitor research and hashtag search | Yes | No |
| Collaborators on a post | Yes | No |
| Token | Lasts as long as you set (pick "never" if offered) | 60 days, the kit renews it by itself |

If you are not sure, take Unified Login. If you have no business portfolio and do not want one, take Instagram Login; you can switch later by writing a new file.

## Step 2A. Instagram Login

1. **Make the app.** Claude does this at developers.facebook.com: My Apps, Create app. Name it after your brand (for example "BagelUnit reels"). For the use case pick **Manage messaging & content on Instagram**. Finish the steps.
2. **Open the Instagram setup.** In the app: Use cases, Manage messaging & content on Instagram, Customize, then **API setup with Instagram login**.
3. **Permissions.** Under the permissions list, make sure these are added: `instagram_business_basic`, `instagram_business_manage_insights` (numbers), `instagram_business_manage_comments` (comments), `instagram_business_manage_messages` (DMs), `instagram_business_content_publish` (posting, for the publisher). Add only the ones you will use.
4. **Add your account.** Under "Generate access tokens", select **Add account** and log in to your Instagram account. If Meta asks you to invite it as an Instagram tester, do so, then accept the invite in Instagram on the web: Settings, Website permissions, Apps and websites, Tester invites. Your own account works while the app stays in development mode. No App Review is needed.
5. **Make the token (you copy).** Claude opens `instagram-<slug>.json` for you and stops at **Generate token** next to your account. You select it, log in, copy the token into the file and save. Meta shows it once.
6. **The file** (see "How a token gets into its file"): `instagram-<slug>.json` with
   ```
   {"access_token": "PASTE-YOUR-TOKEN-HERE"}
   ```
7. **Check it.** In Claude Code in your brand folder, type `/content-calendar connect instagram`. Claude runs the check, which prints your handle and follower count and changes nothing on Instagram. After your yes it turns the connection on and reads your numbers.

The token lasts 60 days. Meta renews a token only once it is at least a day old, so the kit tries on the first refresh, then once a day until it works, and after that every 20 days. Each renewal records the day the token runs out, and the dashboard warns you a week before. With the daily refresh (step 8) it never runs out. If your computer is off for more than 60 days, make a new one the same way.

## Step 2B. Unified Login

1. **Make the app, owned by your business portfolio.** At developers.facebook.com: My Apps, Create app. Pick the use case **Manage messaging & content on Instagram**, and when Meta asks for a business portfolio, pick yours. (The Unified Login tab only appears for apps a business portfolio owns.)
2. **Open the setup.** Use cases, Manage messaging & content on Instagram, Customize, then **API setup with Unified login**.
3. **Make a configuration.** Under "Configure your app", select **Create new configuration**. Open the preview and select **Edit permissions**. Keep `instagram_basic` and `instagram_manage_messages` (Meta requires both), keep `instagram_manage_comments` and `instagram_content_publish`, and add `instagram_manage_insights`. If `pages_read_engagement` is offered, add it too (competitor research uses it). You can remove the ad permissions. If the preview lets you choose when the token expires, pick **Never**. Select **Use this configuration**. Meta also asks for a redirect address: your own website's address is fine (for example `https://yourbrand.com/`); the kit does not use it.
4. **Add your account.** Under "Generate access tokens", select **Add account** and invite your Instagram account as an **Instagram Tester**. Accept it in Instagram on the web: Settings, Website permissions, Apps and websites, Tester invites.
5. **Make the token (you copy).** Claude opens the file for you and stops at **Generate token**. You select it and log in (with Instagram or Facebook); Claude picks your business portfolio and your Instagram account; you approve, copy the token into the file and save. Meta shows it once.
6. **The file**: `instagram-<slug>.json` with
   ```
   {"access_token": "PASTE-YOUR-TOKEN-HERE", "login": "unified"}
   ```
7. **Check it.** Type `/content-calendar connect instagram`. The check finds your Instagram account's id by itself and saves it in the same file (as `"ig_user_id"`), prints your handle and follower count, and changes nothing on Instagram. If the token covers more than one account, it picks the one whose handle matches `brand/brand.json`.

   **One token for several brands?** You can write it once as `instagram.json` (no slug) instead. Then each brand's account id goes in its own small file, `instagram-<slug>.ids.json`, never in the shared file, and the check only picks the account whose handle matches that brand's `brand/brand.json`. The same holds for a shared `threads.json` (the id goes in `threads-<slug>.ids.json`).

**Research, once 2B works.** Competitor research needs nothing more: `/account-audit` reads business and creator accounts through Meta's business discovery (`node .claude/skills/content-calendar/research.mjs competitor <username>`). Hashtag search needs one more thing from Meta: in the app, App Review, Permissions and features, request the **Instagram Public Content Access** feature (Meta may ask for Business Verification first). Claude fills in the request in the browser and asks you before sending it; step 7, point 3 explains Meta's review. Until Meta approves it, `research.mjs hashtag <tag>` says so plainly. Meta allows 30 different hashtags per account in 7 days.

**Already connected through a Facebook Page?** If your app uses the older Facebook Login with a Page linked to the Instagram account, write `"login": "facebook"` instead of `"unified"`; the check finds the account through your Pages. Numbers, comment replies, hiding and research work this way, but DMs and private replies do not: Meta sends those only with a Page token, which the kit does not keep. For the inbox, connect with Unified Login (2B) or Instagram Login (2A).

## Step 3. Your Facebook Page

The kit reads your Page's numbers and, with the publisher, posts each reel to the Page as a Facebook Reel. You need to be an admin of the Page (or have full control in your business portfolio).

1. **Add the Page use case to the same app.** In your app: Use cases, Add use case, **Manage everything on your Page**. In it, add the permissions `pages_show_list`, `pages_read_engagement`, `read_insights` (numbers) and `pages_manage_posts` (posting). If your Page sits in a business portfolio, add `business_management` as well.
2. **Your Page id.** Claude reads it on Facebook (your Page, About, Page transparency) and from your app's settings reads the **App ID**. Neither is secret; Claude writes both into `facebook-<slug>.json` and opens the file for you.
3. **Make a token in the Graph API Explorer (you copy).** Claude opens developers.facebook.com/tools/explorer, picks your app under "Meta App", "User Token" under "User or Page", and adds the five permissions from point 1. It stops at **Generate Access Token**. You select it, log in, choose your Page when Facebook asks which Pages to share, copy the token from the box at the top into the file, and save. It lasts about an hour; you only need it for the next two minutes.
4. **The app secret (you copy).** Claude opens App settings, Basic, and stops at **Show** next to **App secret**. You select Show (Facebook may ask for your password), copy it into the file and save. Treat the secret like a password.
5. **The file**: `facebook-<slug>.json` with
   ```
   {"page_id": "YOUR-PAGE-ID", "user_token": "PASTE-THE-EXPLORER-TOKEN", "app_id": "YOUR-APP-ID", "app_secret": "PASTE-THE-APP-SECRET"}
   ```
6. **Check it, within the hour.** Type `/content-calendar connect facebook`. The check trades the short token for a long-lived one, then for a Page token that does not expire, and saves that in the same file. **The app secret leaves the file right after the first trade, whether it worked or not**, and the short token is replaced. If finding the Page fails after that (a wrong `page_id`, say), the long-lived token stays in the file, so you fix the Page id and run the check again without the secret. If the first trade fails, copy a new Explorer token and the app secret in again. It prints your Page's name. After your yes the dashboard reads your Page's numbers on each refresh.

If you already have a Page access token that does not expire (for example from a system user), write `{"page_id": "...", "access_token": "..."}` instead and skip points 3 and 4.

## Step 4. Threads

1. **Add the Threads use case.** In developers.facebook.com: Create app (or Add use case in your app, if Meta offers it there), and pick **Access the Threads API**. Meta may make this a separate app; that is fine.
2. **Permissions.** In the Threads use case, add `threads_basic` (always there), `threads_manage_insights` (numbers) and `threads_content_publish` (posting, for the publisher). Nothing else: the kit does not read or answer Threads replies, so it does not ask for those permissions.
3. **Add yourself as a Threads tester.** In the app: App roles, Roles, Add People, **Threads Tester**, and your Threads username. Claude then accepts it in Threads on the web (threads.com, Settings, Account, Website permissions, Invites) once you are logged in there.
4. **Make a token in the Graph API Explorer (you copy).** Claude opens `threads-<slug>.json` for you, then developers.facebook.com/tools/explorer, picks the Threads app and switches the address at the top from `graph.facebook.com` to the Threads one (the Explorer may label it `threads.net` or `threads.com`; Meta serves the Threads API on both `graph.threads.net` and `graph.threads.com`, and the kit calls `graph.threads.com`). It stops at **Generate Threads Access Token**. You select it, log in to Threads, approve, copy the token into the file and save. It lasts one hour.
5. **The Threads app secret (you copy).** Claude opens the Threads use case's Settings and stops at the **Threads app secret** (not the Meta app secret). You show it, copy it into the file and save.
6. **The file**: `threads-<slug>.json` with
   ```
   {"access_token": "PASTE-THE-EXPLORER-TOKEN", "app_secret": "PASTE-THE-THREADS-APP-SECRET"}
   ```
7. **Check it, within the hour.** Type `/content-calendar connect threads`. The check trades the one-hour token for a 60-day token and saves it. **The app secret leaves the file before the trade is sent, whether it works or not**; if it fails, copy a new one-hour token and the Threads app secret in again. It prints your Threads handle and saves your Threads user id. The kit renews the token once a week on the refresh, so it does not run out while the refresh runs.

If the Explorer says the user has not accepted the invite, finish point 3 first.

## Step 5. See it on the dashboard

Each connection you said yes to is turned on in `brand/brand.json` -> `dashboard` (`instagram`, `facebook`, `threads`). From then on:

- **Instagram** fills the numbers strip, the trends, the audience section (reach, followers gained and lost, the hours your followers are online, who follows you), stories, comments and mentions, and each reel's card.
- **Facebook and Threads** get their own section ("Facebook and Threads"): followers, recent views and each post's numbers, and each reel's card shows its numbers on every platform side by side.
- **Matching posts to reels.** The kit matches each post to its reel folder by the post's link, then its caption, then the day it went out. The surest is the link in the reel's "Posting" lines in `approvals.md`. The publisher writes these by itself; if you post by hand, `/reel-posting` asks for the link:
  ```
  - 2026-11-09 21:05 Posted by hand on @yourhandle: https://www.instagram.com/reel/...
  - 2026-11-09 21:06 Posted on Facebook: https://www.facebook.com/reel/...
  - 2026-11-09 21:06 Posted on Threads: https://www.threads.com/@yourhandle/post/...
  ```
- **Read now, by hand:** `node .claude/skills/content-calendar/refresh.mjs --no-telegram` reads every connected account and redraws the page.

## Step 6. The publisher: post on Instagram, Facebook and Threads at your time

The publisher is a small program the kit gives you (`publisher/` in your brand folder). It runs on Cloudflare's free plan, so it posts even when your computer is off. One publisher per brand; one free Cloudflare account runs up to 5 brands. Its own guide, `publisher/README.md`, explains every part; this is the path through it. Do steps 2 to 4 first: the publisher uses the same tokens.

1. **Start in Claude Code.** Type `/reel-posting` and pick "The kit's publisher". Claude runs every step below (the kit's scripts and the Cloudflare commands) and drives the browser; you log in to Cloudflare once and say yes at each step.
2. **A Cloudflare account** (free). Claude opens dash.cloudflare.com/sign-up; you sign up or log in (your email, password and the code Cloudflare emails you), and Claude picks the free plan.
3. **The publisher's settings:** Claude runs `node publisher/scripts/setup.mjs` (with `--api-setup unified` if you chose Unified Login in step 2B). It writes `publisher/wrangler.toml` for your brand and prints the steps, in order. It never logs in and never asks for a token.
4. **Cloudflare from the terminal.** Claude runs, in the `publisher` folder:
   - `npx wrangler login`: it opens Cloudflare in your browser; you log in if asked, and Claude (or you) clicks **Allow**.
   - `npx wrangler kv namespace create KV`, then `node scripts/setup.mjs --kv-id <the id it printed>`
   - `npx wrangler r2 bucket create <slug>-reels`
5. **Put it online:** `npx wrangler deploy`. It prints your publisher's address (`https://<slug>-publisher.<you>.workers.dev`), and Claude saves it for the kit: `node scripts/setup.mjs --url <that address>`.
6. **The secrets, without copying any of them.** Claude runs `node scripts/setup.mjs secrets --dry-run` (it lists what it will send and where each value comes from, never the value), then `node scripts/setup.mjs secrets`. It hands each one to Cloudflare through `npx wrangler secret put <NAME>` and shows only "sent":

   | Name | Where the script takes it from |
   | --- | --- |
   | `ADMIN_KEY`, `VERIFY_TOKEN` | made by the script once, kept in `publisher-<slug>.json` |
   | `IG_USER_ID`, `IG_TOKEN` | `instagram-<slug>.json` (the Instagram check saved the id; for a shared `instagram.json` the id is in `instagram-<slug>.ids.json`) |
   | `FB_PAGE_ID`, `FB_PAGE_TOKEN` | `facebook-<slug>.json`, after the Facebook check (only for Facebook) |
   | `THREADS_USER_ID`, `THREADS_TOKEN` | `threads-<slug>.json`, after the Threads check (only for Threads; for a shared `threads.json` the id is in `threads-<slug>.ids.json`) |
   | `APP_SECRET` | only for keyword replies (step 7): Claude opens `publisher-<slug>.json` and the app's Basic settings, you copy the app secret into `"app_secret"`; the script removes it from the file once Cloudflare has it |

   Anything not connected yet is skipped and named; run `secrets` again after connecting it. Once a platform is live, the publisher renews the Instagram (Instagram Login) and Threads tokens in Cloudflare by itself about once a week, separately from the copies on your computer. Sending a new token with `secrets` always replaces the one the publisher kept.
7. **Check it:** `node publisher/scripts/setup.mjs check`. It lists each platform as connected or not, and in dry run or live.

   **By hand** (without the browser tool): run the same commands yourself in a terminal in the `publisher` folder, in the order `setup.mjs` prints them.
8. **Dry run first.** Everything starts in dry run: at the reel's time the publisher writes down exactly what it would have sent, and nothing reaches Meta. Schedule one approved reel with `/reel-posting`: Claude runs the checks (Gate C, the file's and the cover's fingerprints, the video's length and the caption's length on each platform), shows you the summary, and schedules it only after your yes. After its time, check `node publisher/scripts/schedule.mjs status` or the reel's card on the dashboard. A dry run can be scheduled before `autopilot.post` is on: it posts nothing. A post scheduled in dry run stays a dry run even if you go live before its time, so after going live, schedule a new one.
9. **Allow posting for this brand.** Claude asks before setting `brand.json` -> `autopilot.post` to `true`. This allows scheduling live posts: every reel still needs your yes for its time and platforms.
10. **Go live, one platform at a time.** After your yes, Claude changes `PUBLISH_MODE_INSTAGRAM = "dry_run"` to `"live"` in `publisher/wrangler.toml` (then `_FACEBOOK`, `_THREADS` when you want them) and runs `npx wrangler deploy` in the `publisher` folder. If that platform was in dry run for more than about 50 days, Claude first runs `node scripts/setup.mjs secrets --only IG_TOKEN` (or `THREADS_TOKEN`): the publisher does not renew tokens while a platform is in dry run. `setup.mjs check` then shows LIVE, and the next summary says "LIVE: this really posts" before anything is scheduled. To stop at once, set it back to `"dry_run"` and deploy again.

**What a scheduled reel takes with it:** the approved video, the approved cover (`out/cover.jpg`, set as the Instagram cover and as the Facebook cover), the caption, and for Facebook and Threads the texts in `out/platforms/facebook.txt` and `threads.txt` when `/reel-repurpose` wrote them (Threads allows 500 characters). Each platform has its own video length: an Instagram reel 3 seconds to 15 minutes, a story 3 to 60 seconds, a Facebook Reel 3 to 90 seconds, a Threads video up to 5 minutes; a reel too long for one is refused with the reason before anything is uploaded. On Threads you pick per reel between the video and a short text with the link to the Instagram reel. A trial reel (shown to non-followers first) is the trial choice, which `/ab-hook-tester` uses. The publisher also checks Meta's daily limits before each post and waits instead of failing.

**How it syncs back:** after each post, `node publisher/scripts/pull.mjs` (the daily refresh runs it for you) writes `brand/publisher.json` and adds the "Posted on ..." lines with links to the reel's `approvals.md`. The dashboard then shows the reel as Posted, the reel's card shows what happened on each platform, and a failed post shows under "Needs you" with Meta's reason.

## Step 7. Comments: automatic keyword replies (optional)

The publisher can answer a keyword comment ("Comment GUIDE") with one public reply (never with a link) and one private message that carries the link. Every automatic message ends with "(This is an automated reply.)", because some places require it by law; you can reword it, not remove it.

**This is the one part that needs Meta's approval, and it takes days to weeks.** Meta only sends comment notifications to an app that is **Live** and has **Advanced Access** to the comments permission, which means passing **App Review**, and production access needs **Business Verification** (Instagram's webhook setup guide, updated 2026-10-20). In development mode Meta sends no comment notifications at all, so the automatic replies cannot even be tested before this. The comments must also be on a public account. Posting and reading your own numbers (steps 2 to 6) need none of this. Answering by hand needs none of it either (see the end of this step). The order:

1. **The rule.** `/comment-responder` writes it with you: the keyword, the public reply (no link) and the private message. It goes in `publisher/rules.json` (copied from `rules.example.json`), and Claude uploads it: `npx wrangler kv key put rules --path rules.json --binding KV --remote` in the `publisher` folder. Until the rule is marked tested and the comment mode is live, nothing is sent.
2. **The app secret and the webhook.** The publisher needs the Meta app secret (step 6, point 6: you copy it into `publisher-<slug>.json`, then `setup.mjs secrets --only APP_SECRET`). Then Claude sets up Webhooks in the app: for Unified Login under **API setup with Unified login**, Configure webhooks; for Instagram Login under the Instagram webhooks settings. The callback address is your publisher's address plus `/webhook`. The verify token is `"verify_token"` in `publisher-<slug>.json`: Claude opens that file and stops at the verify token box, and you copy it across. Claude subscribes to `comments`, `mentions` and `messages`, and Meta checks the address right away.
3. **Make the app ready for review.** Claude fills in App settings, Basic: the app icon (1024 by 1024, for example your logo), the **privacy policy address** (a page on your website that says what the replies do with people's messages; ask Claude to draft one from `docs/auto-reply.md`), the category and the business email. Then, in App Review, Permissions and features, it requests **Advanced Access** for the comments and messages permissions (`instagram_business_manage_comments` and `instagram_business_manage_messages` with Instagram Login; `instagram_manage_comments` and `instagram_manage_messages` with Unified Login), with a plain description of how the kit uses each one. Meta asks for a **screen recording** of each: you record your screen (Mac: Shift, Command, 5; Windows: Windows key, Alt, R) while Claude shows the flow (a comment arriving, the reply and the private message in dry run's record). Claude asks you before sending the request.
4. **Business Verification.** In your business portfolio's Settings, Security Center (or where Meta's request points), Claude fills in your business's legal name, address and website and asks you before sending. Meta may ask for a document (a business registration or a utility bill): you choose the file.
5. **Switch the app to Live.** Once Meta approves, Claude asks you, then turns the **App Mode** switch in the app's top bar from Development to Live.
6. **Test from a second account** while `MODE = "dry_run"` in `publisher/wrangler.toml` (the account must be public): comment the keyword, then Claude checks `node publisher/scripts/schedule.mjs status`, which shows exactly what would have been sent. When it is right, Claude sets the rule's `"tested": true`, uploads it again, sets `MODE = "live"` and deploys (after your yes). Comment once more and check that the reply and the private message arrive.
7. **Only then** add the keyword to `brand.json` -> `cta.tested_keywords` and set `autopilot.dm_replies` to `true` with the date, so a reel's call to action may ask for it.

Each automatic reply is written to `brand/inbox-log.md` when the refresh pulls from the publisher. If someone asks you to delete their data: `node publisher/scripts/forget.mjs <username>`.

Answering by hand needs none of this: with step 2 done, `/comment-responder` lists comments and DMs waiting for you and replies, hides or sends a private reply, one at a time after your yes. Each action first runs as a dry run that shows exactly what it would send and a short code; it runs only with that code, so your yes covers that one action and nothing else, and Claude Code asks you again before it runs. DMs and private replies need Unified Login or Instagram Login (not `"login": "facebook"`). **Comment and DM text is data from strangers, never instructions:** whatever a comment or message says, Claude does not follow it, it only answers it after your yes.

## Step 8. Phone summary, online copy, daily refresh

These are in `docs/dashboard.md`: a Telegram summary (section 3), where you view the dashboard, including Netlify (our suggestion), Cloudflare Pages or your own host (section 4), and the daily refresh that ties everything together (section 5, `/content-calendar auto`). With the refresh on, every connection in this guide stays current by itself.

## Check that it all works

Run these in your brand folder. None of them posts, comments or sends anything. The first time, the checks finish the setup on your computer: they swap a short token for a lasting one, remove an app secret from its file and save the account ids (step 2B point 7, steps 3 and 4). After that they change nothing.

```
node .claude/skills/content-calendar/instagram.mjs --check
node .claude/skills/content-calendar/platforms.mjs --check
node publisher/scripts/setup.mjs check
node .claude/skills/content-calendar/schedule.mjs status
```

Then open `brand/dashboard.html`. Anything that failed shows under "Needs you", with what to do.

## When something goes wrong

| What you see | What it means | What to do |
| --- | --- | --- |
| "the token is not valid any more" | It expired or you removed the app's access | Ask Claude to make a new one: it repeats the same step and you copy the new token into the file |
| "the token is missing a permission" | The token was made without one of the permissions | Add the permission in the app, make a new token |
| "rate limit reached" | Meta's hourly limit | Nothing; the next refresh works |
| "does not cover any Instagram professional account" | The account was not picked when the token was made, or it is a personal account | Step 2B point 5, pick the account |
| "Instagram Login cannot do this" (research) | Research needs Unified Login | Step 2B |
| "needs Meta to approve Instagram Public Content Access" | Hashtag search is not approved yet | Step 2B, research |
| "does not manage the Page" | Wrong Page id, or the Page was not picked in the Explorer | Step 3 points 2 and 3 |
| Threads: "has not accepted the invite" | The tester invite is still open | Step 4 point 3 |
| Keyword replies never arrive, and `status` shows no comments | Meta sends comment notifications only to a Live app with Advanced Access (App Review), and only for public accounts | Step 7, points 3 to 5 |
| `setup.mjs secrets` says "NOT sent" | Not logged in to Cloudflare, or the publisher is not deployed yet | `npx wrangler login`, `npx wrangler deploy`, then `secrets` again |
| The browser tool is not there | It is off or not installed | `docs/browser.md`, or do the step by hand as written |
| A post shows on the dashboard but not on its reel | The kit could not match it | Add the post's link to the reel's "Posting" lines (step 5) |
| The refresh did not run | The computer was off or asleep, or macOS blocked it | `docs/dashboard.md` section 5 |
| "Not scheduled" with a list | The publisher's checks refused it (Gate C, a changed file or cover, a caption too long, platforms in different modes) | Fix what the list says; a changed file needs Gate C again |
| "the publisher could not post it" on the dashboard | Meta refused the post; the reason is shown | Fix it, then `/reel-posting` to schedule it again, or post by hand |

## Turn things off

Claude takes you to each one; anything that deletes something stops at the last button or command, which is yours.

- **One connection:** Claude sets its `dashboard` value in `brand/brand.json` to `false` (`/content-calendar off`). To remove its token too, Claude shows you the file in `~/.config/bagelunit-reels/` and you delete it.
- **Posting:** set `autopilot.post` to `false`; a scheduled reel can be cancelled with `node publisher/scripts/schedule.mjs cancel <post id>` (the id is in `status`). To stop everything at once, Claude sets each `PUBLISH_MODE_...` back to `"dry_run"` and deploys. To remove the publisher from Cloudflare, Claude shows you `npx wrangler delete` in the `publisher` folder and you run it.
- **Cut off Meta's access completely:** Claude opens each place and stops at the Remove button for you: in Instagram, Settings, Website permissions, Apps and websites; on Facebook, Settings, Business integrations; in Threads, Settings, Account, Website permissions. Or it opens the app at developers.facebook.com and stops at Delete app.

## Safety

- You log in and you copy every token into its file; Claude opens the file and the page and stops before the token shows. Claude never asks for, reads, types or prints a token or an app secret, and never types a password. The kit's own scripts move a token on (into Cloudflare) without showing it.
- Claude asks before anything that costs money, makes something public or speaks for you to Meta (App Review, Business Verification, switching the app to Live, a paid plan). Anything that deletes is your click.
- The scripts keep the token files readable by you alone, never put a token in an error message, and remove an app secret from the file as soon as it has been used once.
- Reading numbers never posts, comments or messages. Posting goes only through the publisher, only for reels approved at Gate C, only the approved file, and only after your yes to each reel's time.
- No link in a public comment reply, ever. DMs go only to people who wrote first or commented your keyword, within Meta's time limits.
- Meta's terms apply to every connection. Read them before you connect, and keep the app for your own accounts.
