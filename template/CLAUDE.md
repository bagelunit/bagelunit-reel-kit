# Reel workspace (BagelUnit Reel Kit template)

This folder makes Instagram reels for ONE brand. It is a copy of the `template/` folder from the BagelUnit Reel Kit: each brand gets its own copy (made by `/brand-setup` in the kit's folder, or by copying this folder, for example to `~/Reels/<brand>-reels/`), and Claude Code is started inside the copy. The kit itself is installed once per computer by the repo's `setup/install.sh`.

On Windows, wherever a command says `python3` use `python`; paths written with `~` mean your home folder.

**Point to the command.** When telling the owner a next step that has a command (`/brand-setup`, `/sticker-host`, `/bagelunit-reels`, `/kit-update`, `/analytics-readout`, `/reel-posting` and the rest in the table below), name the command first. A plain-words request also works, but the command is the recommended way.

**Start with what needs the owner.** When a session opens here, the kit's startup hook (`.claude/skills/content-calendar/notice.mjs`) redraws the dashboard and tells you what needs the owner now and soon, and the next setup step for a new brand. Say the "now" items (and the setup step) in one or two lines at the start of your first reply, each with its command, then do what the owner asked. Say it once per session. Point to `brand/dashboard.html` (`/content-calendar`) for the full view; for several brands, `/content-calendar all`.

**Rules for this brand only go in `CLAUDE.local.md`** in this folder (create it if it is missing), and Claude Code settings for this brand only in `.claude/settings.local.json` (`.claude/settings.json` belongs to the kit and is replaced by updates). Claude Code reads it automatically, next to this file, and kit updates never touch it, while this `CLAUDE.md` is replaced by each update. When the owner gives a standing rule for this brand (for example "you pick the style for each reel"), write it in `CLAUDE.local.md`, never here. Where it differs from a default in this file, the owner's rule there wins, except the safety rules in section 3 that say they always stay on.

It uses its own skills (26, in this folder's `.claude/skills/`; the table "Which skill for which step" says when each one runs, and `/brand-setup` runs the first-run questionnaire below) and the installed skills and plugins, as their authors ship them:
- `/bagelunit-reels`, the reel engine installed at `~/.claude/skills/bagelunit-reels` (script, voice, animated shots, self-check, export, plus the sticker host and the real-sound step),
- `/ig-*` from the **instagram-agent** plugin (research, hooks, scripts, captions, plans, DMs, audits),
- `/hyperframes` from the **hyperframes** plugin (HTML scenes rendered to MP4, optional second engine).

## 0. First-run brand setup (do this before anything else)

At the start of every session, read `brand/brand.json`. If `"name"` is empty, this copy has not been set up yet: before any script, caption, plan or DM, run the questionnaire below (the same steps as `/brand-setup`). If the user asks for a reel first, say in one line that the brand comes first and start the questions.

Offer first to pre-fill from the brand's website: `python3 ./.claude/skills/brand-setup/prefill.py <url>` prints proposals only (nothing is written), and each one still needs the user's confirmation. Never take facts from a website.

**Every question is a question block.** Ask each setup question with the AskUserQuestion tool (the block where the person clicks an option or picks "Other" and types). Never ask a setup question as plain text. Up to four questions per block, two to four options each, the recommended option first with "(Recommended)" after its label. For answers that are typed (names, handle, file paths, a colour code), still use a block: offer the best guesses as options (from the website pre-fill, the folder name, `git config user.name`, "No account yet", "None yet", "Skip for now") and the person types the real answer under Other. Only if the AskUserQuestion tool is not available (for example a run without a person at the keyboard), ask the same questions as a numbered list with the options written out. Never guess an answer and never fill a field the user did not confirm.

1. **You:** the user's own name, and whether they are the person who approves reels (if not, the approver's name).
2. **The brand:** company or client name, and a short slug for folders (suggest one from the name, lowercase with dashes).
3. **Instagram handle:** for example `@yourhandle` (offer "no account yet" as a choice).
4. **Colours:** the accent colour as a hex code (offer to read it from a logo or brand guide if they give a path), plus background and ink if they have them. Offer the kit's ready themes as choices: studio (warm white + vermilion), harbor (deep blue), ochre (warm gold), ink (black and white), or "my own accent".
5. **Logo:** the path to the logo file (PNG or SVG). Check the file exists; if it does not, ask again or leave it empty.
6. **Fonts:** display and body fonts (choices: "use the kit's fonts", "my brand fonts: ...").
7. **Presenter** (Print style only): a sticker host (a cartoon of the owner or a mascot), the kit's drawn presenter, or none. Choices: "Make my sticker host now with /sticker-host", "I already have a pose folder", "The kit's drawn presenter", "No presenter". For "now", run `/sticker-host new` after these questions. For a pose folder, ask for its path (it needs `idle.png`; any other pose names are fine) and say which of the starter 10 it holds (idle, point, raise, thumbs, shock, think, shrug, wave, open, celebrate).
8. **Voice:** choices: "Pick an ElevenLabs voice together now", "Use the voice already saved in the kit", "My own recorded voice", "Decide later". Also ask for words the generated voice must never say (for example a brand name it mispronounces) and how to spell any tricky name by sound.
9. **Call to action:** choices: "Save this" (recommended until a DM auto-reply is tested), "Follow for more", "Comment a keyword for a DM" (only listed in `cta.tested_keywords` once the auto-reply has been tested from a second account), "Visit the link in bio".
10. **Kit updates:** "Tell me when a newer kit version is out (Recommended)" (sets `brand.json` -> `updates.check_on_start` to `true`, one check per session) or "No, I'll check myself" (`false`). See section 3b2.
11. **History:** "Keep a private history of this brand's files (local only, never uploaded)" (recommended) or "No". If yes and this folder is not already a git repo: `git init`, `git add -A`, `git commit -m "Brand workspace set up"` (add `-c user.name="Reel workspace" -c user.email="reels@localhost"` if git has no name set). Never add a remote and never push. See section 3b1.
12. **Posting plan:** "How often do you want to post?" Choices: "2 or 3 a week" (recommended to start), "One a day", "Several a day", "Suggest a number for me" (a typed answer such as "1 a week", "5 a week" or "20 a day" works too). For "Suggest a number for me", run the `/content-calendar how-often` steps (accounts like this brand, how many reels a week the owner can approve, the voice credits) and use the number they pick; if no accounts can be read yet (Instagram not connected, no export), say so, save 3 for now, and tell them `/content-calendar how-often` will suggest one once Instagram is connected or after a month of posting. For "Several a day", ask how many a day (choices "2", "3", "5", typed answers up to any number, 20 is fine) and when: "Spread evenly from 9 am to 9 pm (Recommended)", "My own times" (typed, for example 8:00, 12:30, 19:00). Write the times as `brand.json` -> `posting.times` (`["09:00", "15:00", "21:00"]`, sorted, 24-hour), the days as `posting.days` (every day unless they say otherwise) and the timezone as `posting.timezone`. Save the reels a week in `batch.max_reels` (for "2 or 3 a week" save 3, for "One a day" 7, for several a day the number a day times the posting days, for example 20 a day every day is 140). It caps how many reels Claude plans in one sitting; each reel is still approved on its own, and the owner can change it any time. From 2 a day up, say once what it takes: every reel still needs Gate A, B and C, and each voiced reel uses about 800 voice characters (`python3 ~/.claude/skills/bagelunit-reels/tools/budget.py` shows what is left).

Then write the answers:
- `brand/brand.json`: name, slug, handle, `people`, `identity.logo` (and the other identity paths if given), `colors` (`theme` is the theme name they picked, or empty for "my own accent"), `fonts`, `host` (`enabled`, `type` = `stickers`, `drawn` or `none`, `poses_dir`), `voice` (`style`, `never_say`, `pronunciation`, and `voice_id`/`voice_name` once a voice is chosen), `cta.style` and `cta.default` (set `cta.default` to the same value as `cta.style`), `batch.max_reels`, and `posting.days`, `posting.times` and `posting.timezone` when the posting plan gave them. If the owner skips a question, leave the field empty and say it is empty. Leave `work_dir` as it is unless the user asks.
- `brand/voice.md`: fill the "Who I am" lines from the answers. Leave the rest for the user (or offer to draft it from three of their own captions).
- `brand/facts.md`: only facts the user states and confirms in this conversation, each with its source. If they give none, leave the table empty and say so. Never add a number, result, price or client name from your own knowledge or from the web.
- Every new reel's `reel.json` gets `"theme": {"preset": <colors.theme or "studio">, "accent": <colors.accent>}` and the handle from `brand.json`.
- If the user wants the handle and accent colour as the kit's defaults for every new reel, the kit stores them in `~/.config/bagelunit-reels/config.json` through its own setup; otherwise set them per reel in `reel.json`.

Rename, move or create nothing outside this folder. Never ask for, print or store an API key; keys go in `~/.config/bagelunit-reels/` and the user puts them there themselves. Finish with a short summary of what was written and anything still empty.

## 1. The brand

- Everything this copy makes is for the brand described in `brand/`. Never use another brand's facts, voice, swipe file or log.
- If `brand/brand.json` is still empty (`"name": ""`), run section 0 first.
- `brand.json` → `identity` points at the brand's own identity files (logo, brand guide, colours, fonts, photos) wherever they live. Read them from there; do not copy them in unless the owner asks.
- The `/ig-*` skills read and write `~/.claude/instagram/` (voice.md, swipe.md, plan.md, log.md). In this copy, use `brand/` instead, so each brand keeps its own files.

| File in `brand/` | What it holds | Written by |
| --- | --- | --- |
| `brand.json` | name, handle, people, identity paths, colours, fonts, host (sticker poses or none), voice settings, CTA style and tested keywords, work folder | user + Claude at first-run setup |
| `voice.md` | who we talk to, how we sound, positions, off limits | user + Claude at setup |
| `facts.md` | the ONLY claims, numbers and results allowed on screen, in the voice or in captions | owner only (Claude may propose, owner confirms) |
| `swipe.md` | research outliers (3x rule) | `/ig-viral` |
| `plan.md` | the planned reels: Date, Topic, Goal, Angle, Reel (folder), Notes | `/content-calendar plan` (after the owner's yes), `/ig-plan`, or the owner |
| `calendar.md`, `dashboard.html` | the content calendar and dashboard, remade from the files above on each run (not kept in history) | `/content-calendar` |
| `instagram.json`, `followers.csv` | the brand's own Instagram numbers (latest per post, not kept in history) and one follower count a day (kept: the only growth record), once the owner connects Instagram (`docs/connect.md`) | `/content-calendar` |
| `facebook.json`, `threads.json`, `followers-facebook.csv`, `followers-threads.csv` | the same for the brand's Facebook Page and Threads, once connected | `/content-calendar` |
| `publisher.json` | what the brand's publisher scheduled and posted, with each post's status and link | `publisher/scripts/pull.mjs` (run by the refresh) |
| `inbox-log.md` | every comment reply, private reply, hide, delete and DM sent, after the owner's yes | `/comment-responder` |
| `research/` | other accounts' posts and hashtag top posts read through Meta's API, Apify or an export, as CSV for `/account-audit` and the dashboard's Competitors section; `history.csv` keeps one line a day per account | `research.mjs`, `competitors.mjs` |
| `competitors.json` | the accounts this brand watches: handle and tag (niche, adjacent, big) | `/content-calendar competitors` |
| `ideas.md` | post ideas drafted from the competitors' winners, each with its source and a status (suggested, planned, rejected) | `/content-calendar ideas` (after the owner's yes) |
| `log.md` | what was posted, with hook formula, first line, goal and angle | `/ig-reel` or `/reel-posting` after the owner confirms |
| `tests.md` | one row per finished A/B test (what was tested, the result, the lesson); read it before writing hooks or planning | `/ab-hook-tester record` |
| `stats.md` | the brand's median summary, written by `/account-audit --all` from `insights.csv` | `/account-audit` |
| `insights.csv` | the raw numbers, one row per posted reel: views, reach, average watch time, skip rate, likes, comments, saves, shares, follows (see `docs/after-posting.md`) | Claude, from numbers the owner gives |

## 2. Where files go

- **Every reel for this brand is made in this folder** (its name ends in `-reels`), never in the brand's project folder, the kit's folder or another brand's folder. If the owner asks for this brand's reel in a session started elsewhere, the reel still goes here: tell them to open Claude Code in this folder.
- **Light files** (scripts, plans, approvals, captions, the finished mp4) live in this copy: `reels/<slug>/`.
- **Heavy files** (frames, drafts, renders, node_modules) should stay out of iCloud-synced folders (Desktop and Documents sync). HyperFrames projects go in `brand.json` → `work_dir` (default `~/dev/reel-work/<slug>/`). The BagelUnit Reel Kit writes its build files inside `reels/<slug>/`: if this copy sits in an iCloud folder, tell the owner before the first render.
- **Library** (`brand/library/`: `broll/`, `product-images/`, `components/`, `screens/`, plus `INDEX.md`): the brand's own real footage, images, pieces and screenshots. Use these before inventing anything, only rows marked rights OK, and add a row to `INDEX.md` for every file added. The media itself stays out of git.

## The render engines

- **Always ask the style first.** Before starting any reel, ask the owner which style to use: Print, 3D, or Talking head (only if there is a video of them). One question block (AskUserQuestion), recommendation first. Never pick a style silently.
- `/bagelunit-reels` builds reels into `reels/<slug>/` of the folder Claude was started in, and keeps its own settings in `~/.config/bagelunit-reels/`. Follow its `KIT.md`; its approval points come in addition to the gates below.
- `/hyperframes`: run the CLI with `HYPERFRAMES_NO_TELEMETRY=1`. Local only: never use `hyperframes publish`, cloud rendering, HeyGen sign-in or paid HeyGen models without the owner's explicit OK for that reel.
- **Sticker host (print only):** when `brand.json` → `host.type` is `stickers`, write the reel's cues in `reel.json` `"presenter": {"type": "stickers", "dir": "host", "cues": [[word, pose, nth], ...]}` (check each occurrence number against `build/word_index.txt`), then run `kit host reels/<slug>`: it links the brand's pose set into the reel and lists every pose. **The library grows with the reels.** The base pose and the starter set are only the start: for each line, cue the pose that acts out what this reel says (counting money for a cost, pointing at a chart for a number, a magnifier for a detail), not the nearest pose the set already has, and never fall back to idle for a line that needs an action. **At Gate B**, run `kit host reels/<slug> --check` and put every MISSING pose in the visual plan under "New stickers for this reel" (name, what it shows, the line it acts), with what the image tool will cost. The owner's yes to Gate B covers making them (they can strike any); there is no separate question per pose. Right after Gate B, make them with `/sticker-host add <pose> --reel <slug>` (each drawn from the approved base pose, checked against it, and added to the library with what it is for and the reel it was first made for), show them together on one sheet, then run `kit host reels/<slug>` again. Later reels reuse them. Until a pose exists the host shows idle there. With `host.type` `none`, turn the presenter off.
- **Real sound:** after `kit export`, run the kit's real-sound step (`KIT.md` section G step 5) so the effects are real recordings, not synthesised ones. Report its numbers honestly.
- **Cover:** every reel gets a dedicated cover: a still-only cover scene with a big topic title, a prop that shows the subject, the presenter if any and the handle, kept inside the centre 1080x1440 grid band. Never a frame grabbed from the hook. Make it with `kit cover reels/<slug>` (from the reel's `cover.html`, or `reel.json` > `cover` > `at`): it writes `out/cover.jpg` to Meta's cover rules and `build/cover-crops.jpg`; look at the crops before Gate C (the title inside the white box). Gate C records the cover's fingerprint with the video's, so a connected publisher sets this exact cover automatically and a changed cover needs Gate C again.
- Before any final render the approver has seen the stills (Gate B). The finished mp4 ends up in `reels/<slug>/out/`.

## Which skill for which step

When a request matches a row, load that skill with the Skill tool first and follow it, even for a quick answer ("10 hooks", "plan a reel", "turn this idea into a reel plan"). Do not do that job from memory: the skill carries this kit's format and checks. Then carry on with the loop.

| Step | Skill |
|---|---|
| Brand setup | `/brand-setup` |
| Sticker host: make it, add a pose a reel needs | `/sticker-host` (`new`, `add <pose>`, `check <reel>`) |
| Research: what the audience asks, reels to model, best reels | `/comment-mining`, `/reel-sources`, `/account-audit`, `/reel-analyzer` (a file the person supplies) |
| Content calendar and dashboard: what is planned, scheduled and posted, what needs the owner, agents, numbers and trends; plan the next weeks; connect Instagram, Facebook Page and Threads numbers or a Telegram summary; refresh by itself | `/content-calendar` (`plan`, `days`, `how-often` for how often to post, `competitors` to track other accounts, `ideas` for post ideas from what is working for them, `host`, `connect instagram`, `connect facebook`, `connect threads`, `connect telegram`, `auto`, `all` for every brand on this computer) |
| Plan: goal, angle, why a post flopped | `/going-viral`, `/virality` |
| Hooks before Gate A | `/viral-hook-writer` (from nothing), `/hook-mining` (from a CSV of real hooks) |
| Script before Gate A | Start the reel folder first (`kit start reels/<slug> --style <style>`: it fills a new folder with a sample `script.txt` and keeps one already there), then `/reel-scripter` writes the real `reels/<slug>/script.txt`; `/reel-builder` for a shoot plan without rendering |
| Talking head: the person's own video | `kit start reels/<slug> --style talking`, then the engine's `take.py` with the file the person gives (any phone video, filmed upright). No voice credits |
| Carry on with a reel after a break ("carry on with the reel about ...") | Read `reels/<slug>/approvals.md` and the folder to find the last finished step, say which step that is, and continue from there. Never re-record a gate that is already recorded, and never re-run a paid step with `--force` without asking |
| Fact check before Gate A and Gate C | `/reel-factcheck` |
| Voice, visual plan, build, render, export | `/bagelunit-reels` (the engine) |
| Review of every draft and final | `/reel-review`, then `/reel-predict` for measurements |
| Caption, hashtags, first comment, cover before Gate C | `/caption-and-hashtags`, `/cover-thumbnail-brief` |
| Any text before it is handed over | `/humanizer` |
| A/B test of a reel's hook: two versions, trial reels, the winner | `/ab-hook-tester` (and `record` once the dashboard calls it) |
| The same reel for TikTok, YouTube Shorts, a carousel and a blog post | `/reel-repurpose` (after Gate C) |
| After posting: add the numbers to `brand/insights.csv`, then read them | `/analytics-readout`, `/account-audit`; `kit calibrate brand/insights.csv --project-root reels` once 8 or more reels have numbers |
| Posting an approved reel, scheduling, setting up automatic posting | `/reel-posting` |
| Comment auto-reply and DMs (set up step by step, then off by default until tested) | `/comment-responder` |
| Opt-in autopilot (off by default, section 3b) | `/content-factory` |
| Updating this workspace to a newer kit | `/kit-update` |

## 3. House rules (they override the skills)

1. **Facts.** Every number, result, price, client name or claim in a script, on-screen text, caption, comment or DM must be in `brand/facts.md`. If it is not there, write `{{needs cleared fact}}` and flag it. Never invent, estimate or round up a claim.
2. **No price or offer claims** unless `facts.md` marks them as cleared for public use.
3. **Banned characters and words** from `brand.json` → `writing` (by default no em dashes). Run `/ig-human`'s detector on any text before handing it over.
4. **Keyword CTA** ("Comment WORD") only when WORD is listed in `brand.json` → `cta.tested_keywords`, meaning the DM auto-reply was tested from a second account. Otherwise end on a save or follow ask, and say why.
5. **Generated voices** never say any word in `brand.json` → `voice.never_say`; show it as on-screen text instead. Spell tricky words by sound using `voice.pronunciation`.
6. **DMs.** `/ig-dm` writes replies to people who raised their hand (commented a keyword, messaged the brand, replied to a story). No cold DMs to strangers.
7. **Research.** `/ig-viral` reads reels in the browser at human speed, with the owner present. Meta's official API is not scraping: with the brand's Instagram connected through Unified Login, `/account-audit` and `/reel-sources` may read business and creator accounts (business discovery) and hashtag top posts through it (`research.mjs`). No scraping services unless the brand owner has turned on `autopilot.scrape` (then `/account-audit` and `/reel-sources` may use Apify, with the cost shown first). Claude never logs in with the brand's password and never handles an API key.
8. **Copy formulas, never videos.** Hook shape, structure and length only. Never another creator's script, colours, mascot, characters or prompts.
9. **Rights.** No other company's logos, footage, music or characters unless the brand owns the rights.
10. **Approval gates (the approver in `brand.json` → `people` approves, usually the workspace owner, also for client brands):**
    - Fact check first: run `/reel-factcheck` on the script (scope `script`) before showing it for Gate A, and again on the final (scope `final`) before Gate C. `kit gate` refuses to record A or C without a current PASS (`--skip-facts "reason"` is the owner's override and is written into the record).
    - Gate A: script. No voice credits are spent before this. Before showing the script for approval, run `python3 ~/.claude/skills/bagelunit-reels/tools/budget.py reels/<slug>/script.txt` (on Windows `python`) and tell the approver the credits it needs against what is left; if it says NOT ENOUGH, say so before they approve.
    - Gate B: visual plan (concept card + shot cards).
    - Gate C: the final video.
    Ask for each gate with a question block (AskUserQuestion): show what is being approved first (the script text, the visual plan, or the final video's path and how to watch it on a phone), then ask "Gate A: approve this script?" (or B, C) with the options "Approve (Recommended)" when every check passed, "Change something" (they say what under Other or next), and "Stop this reel". Never treat silence or a vague reply as a yes.
    Record each approval with the date in `reels/<slug>/approvals.md` (`kit gate <reel> record --gate A|B|C`), and the dashboard redraws by itself (the kit's hook in `.claude/settings.json` runs `.claude/skills/content-calendar/sync.mjs` after each step; run it with `--force` if the page looks stale).
11. **Nothing is posted, scheduled or sent by Claude.** A person posts. Two exceptions. Posting: with the brand's publisher connected (`publisher/`, `docs/connect.md` step 6) and `autopilot.post` on, Claude may schedule a reel only after Gate C, only the approved file and cover (`kit gate <reel> check` prints MATCH), and only after the owner says yes to that reel's time and platforms. A dry-run test may be scheduled before `autopilot.post` is on (it posts nothing, and it stays a dry run even if the publisher goes live before its time). Answers: with Instagram connected, `/comment-responder` may send one reply, private reply or DM at a time, only after the owner says yes to that exact text.
12. **No links in public comment replies.** A link goes in the DM only, and only once the keyword auto-reply is tested (rule 4).
13. **Hook checklist and review.** Every hook is a triple hook: context at once, then a lean, then a contrarian snapback (`docs/hook-and-review-playbook.md` section 0; run its read-back test on the script). Before Gate A and again on the draft, check the eight-point frame-0 hook checklist in the same file. Pick one goal and one angle per reel. The reel skills in this folder's `.claude/skills/` (`/reel-analyzer`, `/virality`, `/going-viral`, `/hook-mining`, `/comment-mining`, `/ab-hook-tester`, `/cover-thumbnail-brief`, `/analytics-readout`) give structure only (`/reel-review` is the exception: run it on every draft and every final, and put its verdict line in `approvals.md`): their numbers are one account's data, so test them against the brand's own median.
14. **Teardowns use files the person supplies** unless autopilot is on (below). `/reel-analyzer` works on a file or transcript the person gives.
15. **Web setup goes through the browser tool** (`docs/browser.md`). Every setup step on a website (switching Instagram to professional, the Meta app, Facebook Page and Threads, Cloudflare, Telegram, a host, the sticker host's image tool, Apify, Runway) is done by Claude in the owner's browser with Claude in Chrome. If it is off, say in one line what it does and how to turn it on (`/chrome`; Chrome, Edge, Brave, Arc, Vivaldi or Opera, not Safari or Firefox), offer once to help install Chrome or Edge, and otherwise walk the owner through the written steps. Claude does everything on the page except three things, which are the owner's: logging in (passwords, codes, payment details), copying a secret (make the file it goes into with `PASTE-...` where it belongs, open it in the owner's editor, stop one click before the secret shows, name that button, and do not read or capture the tab until the owner says "done"), and the last click of anything that deletes (stop at the final Delete, Remove or Confirm; for a command that deletes, show it and let the owner run it). Ask before anything that costs money, makes something public or speaks for the owner to a company (a paid plan, App Review, Business Verification, switching a Meta app to Live, agreeing to terms). Never type a token or password into a page, and never put a secret in the chat; the kit's scripts move secrets on (for the publisher, `node publisher/scripts/setup.mjs secrets`).

## 3b. Autopilot (OFF by default, the brand owner turns it on)

The kit works for any brand and person, so rules 4, 7, 10 and 11 and the local-renders-only rule are the safe defaults, not laws. The brand owner can relax them for this brand by writing "Autopilot: ON" with the exact permissions in `brand/brand.json` (`"autopilot": {"post": false, "dm_replies": false, "scrape": false, "paid_renders": false}`; each starts false). Ask which ones with a question block (AskUserQuestion, one option per permission, multi-select), and record the answer and the date. Never turn one on yourself.

When a permission is on, these installed skills may be used for it:
- `post` or `dm_replies`: `/reel-posting` (scheduling approved reels), `/content-factory` (post, keyword rule), `/comment-responder` (public reply plus DM). Automatic keyword replies run in the brand's publisher once the owner tested them and switched them from dry run to live (`docs/connect.md` step 7, `docs/auto-reply.md`). Posting still needs the owner's yes for each reel and its time (rule 11); it is never a standing permission. The kit's publisher posts only what was scheduled that way (`docs/auto-post.md`).
- The dashboard's connections (`brand.json` -> `dashboard`): `instagram`, `facebook` and `threads` read the brand's own numbers through Meta's official APIs (read only), `telegram` sends the owner a summary, `refresh` runs them all on a schedule on this computer. Each starts off and is turned on only after the owner's yes in `/content-calendar` (`connect instagram`, `connect facebook`, `connect threads`, `connect telegram`, `auto`). They report; they never post, approve or schedule a reel. Claude does the setup in the owner's browser and the owner copies each token into the file Claude opens in `~/.config/bagelunit-reels/` (rule 15, `docs/connect.md`).
- `scrape`: `/account-audit` (outliers via Apify, or from an export), `/reel-sources` (fetch a reel, mine demand), and `/content-factory`.
- `paid_renders`: Seedance on Runway through `/reel-builder` (about $6 to $12 per reel).

These stay on even in autopilot: rule 1 (only cleared facts, no invented numbers), no links in public comment replies (rule 12), a keyword CTA must really deliver, never search the computer for or print an API key (the person connects tools themselves), and nothing is sent or posted to a brand the permission was not given for.

## 3b1. Private history (only if this folder is a git repo)

If this folder has a `.git` folder, it is this brand's private, local history. After each approved gate, commit what changed with a short message such as `Gate A: <slug>` (add `-c user.name="Reel workspace" -c user.email="reels@localhost"` if git has no name set). Never add a remote, never push, and never commit anything `.gitignore` leaves out (keys, renders, audio). If there is no `.git` folder, do nothing; never create one without being asked.

## 3b2. Kit updates (ON by default, the owner can turn it off)

This copy records the kit version it is on in `.kit-version`. If `brand/brand.json` -> `updates.check_on_start` is `true`, then once at the start of a session, read `.kit-version` and read the one public file `https://raw.githubusercontent.com/bagelunit/bagelunit-reel-kit/main/VERSION` (with the project's web tool or `curl -s`; one read, nothing else). If the number there is higher, say once, in one or two lines: "Kit <new> is out (this workspace is on <old>). Type `/kit-update` and I will show what changed and update it step by step." If the check fails, is offline, or the numbers match, say nothing. Never update anything yourself, and never ask more than once per session. With the setting `false` or missing, do not check.

## 3c. Weekly batch (optional)

To make a week's reels in one sitting: use `/content-calendar plan` (or `/ig-plan`) to pick up to `brand.json` -> `batch.max_reels` topics (3 if the setting is missing; the owner can change it any time). Each reel gets one goal (goals may repeat in a batch) and one angle. In a batch of up to five, no two reels share an angle; in a bigger one (several posts a day), use every angle in turn so no two reels next to each other share one. Write all the scripts, then take them to Gate A together, but record each reel's approval separately in its own `approvals.md`. Voice credits are spent only for scripts that were approved. After that every reel runs the normal loop one at a time (visual plan, Gate B, build, verify, Gate C), and a problem in one does not block the others. Update `brand/plan.md` and `brand/log.md` per reel. With several posting times a day (`posting.times`), give each planned reel its time in the plan's Date column (`2026-11-12 13:00`) so it takes that slot. If the owner asks for more reels than `batch.max_reels`, say so and ask before going over: every reel still needs a proper review.

## 4. Map

- `reels/_example/`: a blank pattern for a script, approvals and caption. Never treat it as a real reel. `docs/first-reel.md` walks a new user through the first reel.

- `brand/`: this brand's identity, voice, cleared facts, research and log. `brand/library/` holds its real media (see `INDEX.md`).
- `docs/auto-reply.md`: how to connect a comment auto-reply and DM for this brand (optional, owner's accounts).
- `docs/auto-post.md`: how to post approved reels on a schedule for this brand (optional, owner's accounts).
- `docs/browser.md`: how Claude does the web setup in the owner's browser (Claude in Chrome): turning it on, and the three things the owner does (log in, copy a secret into the file Claude opens, click the last Delete).
- `docs/connect.md`: how to connect everything, step by step: Instagram (Unified or Instagram Login), the Facebook Page, Threads, the publisher, keyword replies, and how it all stays in sync (optional).
- `docs/dashboard.md`: the content dashboard, a Telegram summary, where to view it and the daily refresh (optional).
- `publisher/`: the brand's own publisher (a free Cloudflare Worker) that posts approved reels on Instagram, the Facebook Page and Threads at the approved time, dry run first. `publisher/README.md` and `docs/connect.md` step 6.
- `docs/craft-playbook.md`: what is on screen (one world, a through-line, a line-to-picture table, no repeats). Read it before writing the storyboard. `docs/style-ideas.md` lists style concepts that are not built yet.
- `reels/<slug>/`: one folder per reel (script, plan, approvals, caption, `out/` with the final mp4).
