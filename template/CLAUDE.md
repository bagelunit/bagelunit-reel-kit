# Reel workspace (BagelUnit Reel Kit template)

This folder makes Instagram reels for ONE brand. It is a copy of the `template/` folder from the BagelUnit Reel Kit: each brand gets its own copy (made by `/brand-setup` in the kit's folder, or by copying this folder, for example to `~/Reels/<brand>-reels/`), and Claude Code is started inside the copy. The kit itself is installed once per computer by the repo's `setup/install.sh`.

On Windows, wherever a command says `python3` use `python`; paths written with `~` mean your home folder.

**Point to the command.** When telling the owner a next step that has a command (`/brand-setup`, `/sticker-host`, `/bagelunit-reels`, `/kit-update`, `/analytics-readout`, `/reel-posting` and the rest in the table below), name the command first. A plain-words request also works, but the command is the recommended way.

**Start with what needs the owner.** When a session opens here, the kit's startup hook (`.claude/skills/content-calendar/notice.mjs`) redraws the dashboard and tells you what needs the owner now and soon, and the next setup step for a new brand. Say the "now" items (and the setup step) in one or two lines at the start of your first reply, each with its command, then do what the owner asked. Say it once per session. Point to `brand/dashboard.html` (`/content-calendar`) for the full view; for several brands, `/content-calendar all`.

**Rules for this brand only go in `CLAUDE.local.md`** in this folder (create it if it is missing), and Claude Code settings for this brand only in `.claude/settings.local.json` (`.claude/settings.json` belongs to the kit and is updated by merging: your edit to it is kept unless it clashes with the kit's change). Claude Code reads it automatically, next to this file, and kit updates never touch it, while this `CLAUDE.md` is updated by each kit update (a local edit to it is kept by a merge, or, when the same lines changed, left as it is with the kit's version beside it as `CLAUDE.md.kit-new`). `.kit-base/` holds the kit's pristine copies that the merge compares against: never edit it, and commit it with the rest. When the owner gives a standing rule for this brand (for example "you pick the style for each reel"), write it in `CLAUDE.local.md`, never here. Where it differs from a default in this file, the owner's rule there wins, except the safety rules in section 3 that say they always stay on.

It uses its own skills (in this folder's `.claude/skills/`; `COMMANDS.md` in the kit lists every one, the table "Which skill for which step" says when each one runs, and `/brand-setup` runs the first-run questionnaire below) and the installed skills and plugins, as their authors ship them:
- `/bagelunit-reels`, the reel engine installed at `~/.claude/skills/bagelunit-reels` (script, voice, animated shots, self-check, export, plus the sticker host and the real-sound step),
- `/ig-*`, the Instagram skills in this folder's `.claude/skills/` (research, hooks, scripts, captions, plans, DMs, audits),
- `/hyperframes` from the **hyperframes** plugin (HTML scenes rendered to MP4, optional second engine).

## 0. First run: brand setup

At the start of every session, read `brand/brand.json` first. If `"name"` is empty, this copy has not been set up: run `/brand-setup` before any script, caption, plan or DM. If the owner asks for a reel first, say in one line that the brand comes first, then run it. `/brand-setup` holds the questions; it can pre-fill from the brand's website (`prefill.py` proposes only and writes nothing). These safety rules stay here:

- Every setup question is a question block (AskUserQuestion): up to four per block, two to four options each, the recommended option first. For typed answers, offer the best guesses as options and let the owner type the real answer under Other. Only without the tool, ask a numbered list.
- Never guess an answer and never fill a field the owner did not confirm. If they skip a question, leave the field empty and say so.
- `brand/facts.md` gets only facts the owner states and confirms in this conversation, each with its source. Never add a number, result, price or client name from your own knowledge or from the web, and never take facts from a website.
- Never ask for, print or store an API key. Keys go in `~/.config/bagelunit-reels/` and the owner puts them there.
- Rename, move or create nothing outside this folder.
- Every new reel's `reel.json` gets `"theme": {"preset": <colors.theme or "studio">, "accent": <colors.accent>}` and the handle from `brand.json`.

## 1. The brand

- Everything this copy makes is for the brand described in `brand/`. Never use another brand's facts, voice, swipe file or log.
- If `brand/brand.json` is still empty (`"name": ""`), run section 0 first.
- `brand.json` → `identity` points at the brand's own identity files (logo, brand guide, colours, fonts, photos) wherever they live. Read them from there; do not copy them in unless the owner asks.
- The `/ig-*` skills read and write `brand/` (voice.md, swipe.md, plan.md, log.md), so each brand keeps its own files.

| File in `brand/` | What it holds | Written by |
| --- | --- | --- |
| `brand.json` | name, handle, people, identity paths, colours, fonts, host (sticker poses or none), voice settings, CTA style and tested keywords, work folder | user + Claude at first-run setup |
| `voice.md` | who we talk to, how we sound, positions, off limits | user + Claude at setup |
| `facts.md` | the ONLY claims, numbers and results allowed on screen, in the voice or in captions | owner only (Claude may propose, owner confirms) |
| `swipe.md` | research outliers (3x rule) | `/ig-viral` |
| `plan.md` | the planned reels: Date, Topic, Goal, Angle, Reel (folder), Series, Notes | `/content-calendar plan` (after the owner's yes), `/ig-plan`, or the owner |
| `calendar.md`, `dashboard.html` | the content calendar and dashboard, remade from the files above on each run (not kept in history) | `/content-calendar` |
| `instagram.json`, `followers.csv` | the brand's own Instagram numbers (latest per post, not kept in history) and one follower count a day (kept: the only growth record), once the owner connects Instagram (`docs/connect.md`) | `/content-calendar` |
| `facebook.json`, `threads.json`, `followers-facebook.csv`, `followers-threads.csv` | the same for the brand's Facebook Page and Threads, once connected | `/content-calendar` |
| `publisher.json` | what the brand's publisher scheduled and posted, with each post's status and link | `publisher/scripts/pull.mjs` (run by the refresh) |
| `inbox-log.md` | every comment reply, private reply, hide, delete and DM sent, after the owner's yes | `/comment-responder` |
| `research/` | other accounts' posts and hashtag top posts read through Meta's API, Apify or an export, as CSV for `/account-audit` and the dashboard's Competitors section; `history.csv` keeps one line a day per account | `research.mjs`, `competitors.mjs` |
| `competitors.json` | the accounts this brand watches: handle and tag (niche, adjacent, big) | `/content-calendar competitors` |
| `watch.json` | the dashboard's watch section (its own name, "News watch" by default): the pages the brand follows and what is new there, each a lead until cleared in `facts.md` | `/content-calendar watch` |
| `ideas.md` | post ideas drafted from the competitors' winners, each with its source and a status (suggested, planned, rejected) | `/content-calendar ideas` (after the owner's yes) |
| `loop.md`, `loop.json` | what the posted reels did (skip rate, watch time, views), what to change in the next one, and whether a reel broke out | `loop.mjs` (`/reel-loop`) |
| `best-times.json` | the suggested posting times and why (the brand's own hours, the audience's online hours, optionally the competitors' winners), with the plan rows it would move | `best-times.mjs` (`/content-calendar best-times`; the refresh runs it, and applies it only with `autopilot.retime`) |
| `log.md` | what was posted, with hook formula, first line, goal, angle and review verdict (posted reels only; scores are not kept here) | `/reel-posting` after the owner confirms it went out |
| `tests.md` | one row per finished A/B test (what was tested, the result, the lesson); read it before writing hooks or planning | `/ab-hook-tester record` |
| `hashtags.md` | which hashtags went with good numbers on the brand's own posts and the researched accounts (counts shown; Instagram allows 5 in a caption) | `hashtags.mjs` (`/caption-and-hashtags` runs it) |
| `stats.md` | the brand's median summary, written by `/account-audit --all` from `insights.csv` | `/account-audit` |
| `insights.csv` | the raw numbers, one row per posted reel: views, reach, average watch time, skip rate, likes, comments, saves, shares, follows (see `docs/after-posting.md`) | the Instagram refresh (each reel's 7-day row), or `/analytics-readout` from numbers the owner gives |

## 2. Where files go

- **Every reel for this brand is made in this folder** (its name ends in `-reels`), never in the brand's project folder, the kit's folder or another brand's folder. If the owner asks for this brand's reel in a session started elsewhere, the reel still goes here: tell them to open Claude Code in this folder.
- **Light files** (scripts, plans, approvals, captions, the finished mp4) live in this copy, in `reels/<slug>/`. With `brand.json` -> `reels.layout` set to `dated`, they live in `reels/<year>/<month>/<day>/<slug>/` (the day the reel is planned to post), for example `reels/2026/11 November/November 12/<slug>/`.
- A reel's name is always its slug (plan, log, insights, publisher). Write `reels/<slug>` or the slug in commands, never the dated path: every kit script and engine command finds the reel in either place, and `kit start reels/<slug>` files a new one by the setting.
- To move existing reels, run `kit organize --layout dated` (then `--apply`). To free disk space in posted reels, run `kit tidy --all` (then `--apply`). Never move a reel folder by hand while a post of it is scheduled.
- **Heavy files** (frames, drafts, renders, node_modules) should stay out of iCloud-synced folders (Desktop and Documents sync). HyperFrames projects go in `brand.json` → `work_dir` (default `~/dev/reel-work/<slug>/`). The BagelUnit Reel Kit writes its build files inside `reels/<slug>/`: if this copy sits in an iCloud folder, tell the owner before the first render.
- **Library** (`brand/library/`: `broll/`, `product-images/`, `components/`, `screens/`, plus `INDEX.md`): the brand's own real footage, images, pieces and screenshots. Use these before inventing anything, only rows marked rights OK, and add a row to `INDEX.md` for every file added. The media itself stays out of git.

## The render engines

- **Always ask the style first.** Before starting any reel, ask the owner which style to use: Print, 3D, Talking head (only if there is a video of them), or one of the 20 scene styles (`kit scene list` names them with what each is for; offer the two or three that fit the brand's niche, and "see all"). One question block (AskUserQuestion), recommendation first. Never pick a style silently.
- `/bagelunit-reels` builds reels into `reels/<slug>/` of the folder Claude was started in, and keeps its own settings in `~/.config/bagelunit-reels/`. Follow its `KIT.md`; its approval points come in addition to the gates below.
- `/hyperframes`: run the CLI with `HYPERFRAMES_NO_TELEMETRY=1`. Local only: never use `hyperframes publish`, cloud rendering, HeyGen sign-in or paid HeyGen models without the owner's explicit OK for that reel.
- **Sticker host (print only).** When `brand.json` -> `host.type` is `stickers`:
  1. Write the reel's cues in `reel.json`: `"presenter": {"type": "stickers", "dir": "host", "cues": [[word, pose, nth], ...]}`. Cue the pose that acts out what each line says (counting money for a cost, pointing at a chart for a number), never idle for a line that needs an action. Check each occurrence number against `build/word_index.txt`.
  2. Run `kit host reels/<slug>`. It links the brand's pose set into the reel and lists every pose.
  3. At Gate B run `kit host reels/<slug> --check`. List every MISSING pose in the visual plan under "New stickers for this reel" (name, what it shows, the line it acts) with what the image tool will cost. The owner's yes to Gate B covers making them, and they can strike any.
  4. After the yes, run `/sticker-host add <pose> --reel <slug>` for each, show them together on one sheet, then run `kit host reels/<slug>` again. Until a pose exists the host shows idle there.

  The library grows with the reels (`docs/avatar.md` in the kit explains why). With `host.type` `none`, turn the presenter off.
- **Real sound:** after `kit export`, run the kit's real-sound step (`KIT.md` section G step 5) so the effects are real recordings, not synthesised ones. Report its numbers honestly. The step leaves the final as `out/<slug>.mp4` and keeps the kit-sound original in `build/pre-real/<slug>-kitsound.mp4` (the steps are in the kit's `docs/sound.md`).
- **Cover:** every reel gets a dedicated cover: a still-only cover scene with a big topic title, a prop that shows the subject, the presenter if any and the handle, kept inside the centre 1080x1440 grid band (`python3 scripts/qa/cover_check.py out/cover.jpg` checks the stricter core that both the 3:4 and 4:5 grid crops keep, x 35 to 1045 and y 285 to 1635, plus title size and brightness). Never a frame grabbed from the hook. Make it with `kit cover reels/<slug>` (from the reel's `cover.html`, or `reel.json` > `cover` > `at`): it writes `out/cover.jpg` to Meta's cover rules and `build/cover-crops.jpg`; look at the crops before Gate C (the title inside the white box). Gate C records the cover's fingerprint with the video's, so a connected publisher sets this exact cover automatically and a changed cover needs Gate C again.
- Before any final render the approver has seen the stills (Gate B). The finished mp4 ends up in `reels/<slug>/out/`.

## Which skill for which step

When a request matches a row, load that skill with the Skill tool first and follow it, even for a quick answer ("10 hooks", "plan a reel", "turn this idea into a reel plan"). Do not do that job from memory: the skill carries this kit's format and checks. Then carry on with the loop.

| Step | Skill |
|---|---|
| Brand setup | `/brand-setup` |
| Sticker host: make it, add a pose a reel needs | `/sticker-host` (`new`, `add <pose>`, `check <reel>`) |
| Licensed music, stock video, motion graphics, sound effects or a colour look (any source, downloaded by the owner; we suggest Uppbeat): record it, use it in a reel, check it | `/licensed-assets` (`kit licensed add`, `list`, `check <reel>`, `remove`) |
| Research: what the audience asks, reels to model, best reels | `/comment-mining`, `/reel-sources`, `/account-audit`, `/reel-analyzer` (a file the person supplies) |
| Content calendar and dashboard: what is planned, scheduled and posted, what needs the owner, agents, numbers and trends; plan the next weeks; connect Instagram, Facebook Page and Threads numbers or a Telegram summary; refresh by itself | `/content-calendar` (`/db` opens the dashboard; `plan`, `days`, `how-often` for how often to post, `competitors` to track other accounts, `ideas` for post ideas from what is working for them, `watch` for the news pages and release notes the brand follows, `host`, `connect instagram`, `connect facebook`, `connect threads`, `connect telegram`, `auto`, `all` for every brand on this computer) |
| Plan: goal, angle, why a post flopped | `/going-viral`, `/virality` |
| Hooks before Gate A | `/viral-hook-writer` (from nothing), `/hook-mining` (from a CSV of real hooks) |
| Start a reel folder | `kit start reels/<slug> --style <style>` (it fills a new folder with a sample `script.txt` and keeps one already there). If the reel comes from a row in `brand/plan.md`, write its folder name into that row's "Reel (folder)" cell (`schedule.mjs --from-plan` needs it) |
| Plan and write the script before Gate A | `/reel-scripter` runs the staged flow and writes the real `reels/<slug>/script.txt`: `/script-plan` (one viewer, one promise, a beat outline; it writes the Goal and Angle lines into `approvals.md`), the draft, `kit script` (checks), `/script-coldread` (a fresh reader), the fact check and the human score, then `/script-score` (90 or more). `/reel-builder` for a shoot plan without rendering; `/ig-reel` only for a script the owner films themselves |
| A 3D shot of anything (a product, a phone with a screen, 3D text, a model) | `/blender-shot` |
| An AI-generated shot (any tool; Higgsfield is one we suggest), recorded and labelled | `/generated-shots` |
| A cover or thumbnail designed in Canva, Adobe or any tool, or a Blender still | `/thumbnail-design` |
| Check the mix of a finished reel (loudness, peak, clipping, silence, ducking) | `python3 ~/.claude/skills/bagelunit-reels/tools/mixcheck.py <reel>` (`/reel-review` runs it) |
| Which outside tools help, and how each connects (none required) | `docs/suggested-tools.md` |
| Which optional outside tools (voice, music, 3D, generated video, design) to connect, or turning the tips off | `/suggested-tools` (or `kit suggest`) |
| Talking head: the person's own video | `kit start reels/<slug> --style talking`, then the engine's `take.py` with the file the person gives (any phone video, filmed upright). No voice credits |
| Carry on with a reel after a break ("carry on with the reel about ...") | Read `reels/<slug>/approvals.md` and the folder to find the last finished step, say which step that is, and continue from there. Never re-record a gate that is already recorded, and never re-run a paid step with `--force` without asking. If the last finished step is unclear, list what is in the folder and ask which step to resume |
| Fact check before Gate A and Gate C | `/reel-factcheck` |
| Voice, visual plan, build, render, export | `/bagelunit-reels` (the engine) |
| A scene style (for example `stick-figure-folk`, `comic`, `map`): list, plan the scenes, check | `kit scene list`, then `kit start reels/<slug> --style <id>` |
| Review of every draft and final | `/reel-review`, then `/reel-predict` for measurements. Its caption check: `python3 ~/.claude/skills/bagelunit-reels/tools/captions.py reels/<slug>` (characters per second and words per minute of each caption group; flags over 17 chars/s or under 1.0 s) |
| Caption (the caption, up to 5 hashtags, then a keyword line; saved as `out/caption.txt`; `caption.mjs check` before Gate C), cover | `/caption-and-hashtags`, `/cover-thumbnail-brief` (after `kit cover`: `python3 scripts/qa/cover_check.py reels/<slug>/out/cover.jpg` checks size, the safe centre 1010x1350, text height and brightness) |
| Any text before it is handed over | `/humanizer` |
| A/B test of a reel's hook: two versions, trial reels, the winner | `/ab-hook-tester` (and `record` once the dashboard calls it); the winner is called by `python3 scripts/abtest.py --a <hits> <views> --b <hits> <views>` (95% bar, 300 views each) |
| The same reel for TikTok, YouTube Shorts, a carousel and a blog post (the TikTok and Shorts texts are what the publisher posts) | `/reel-repurpose` (after Gate C) |
| The loop: read what the trial reels did, change one thing, make the next reel, until one breaks out (the owner still approves every reel) | `/reel-loop` (`node .claude/skills/content-calendar/loop.mjs` writes `brand/loop.md`) |
| After posting: add the numbers to `brand/insights.csv`, then read them | `/analytics-readout`, `/account-audit`; `kit calibrate brand/insights.csv --project-root reels` once 8 or more reels have numbers |
| Posting an approved reel, scheduling, setting up automatic posting | `/reel-posting` |
| Comment auto-reply and DMs (set up step by step, then off by default until tested) | `/comment-responder` |
| Opt-in autopilot (off by default, section 3b) | `/content-factory` |
| Updating this workspace to a newer kit | `/kit-update` |

## 3. House rules (they override the skills)

1. **Facts.** Every number, result, price, client name or claim in a script, on-screen text, caption, comment or DM must be in `brand/facts.md`. If it is not there, write `{{needs cleared fact}}` and flag it. Never invent, estimate or round up a claim.
2. **No price or offer claims** unless `facts.md` marks them as cleared for public use.
3. **Banned characters and words** from `brand.json` → `writing` (by default no em dashes). Run `/ig-human`'s detector on any text before handing it over. The human score must reach `brand.json` -> `writing.human_score_min` (default 90): below it, run `/humanizer` and score again. This is the one place the human score's bar is stated.
4. **Keyword CTA** ("Comment WORD") only when WORD is listed in `brand.json` → `cta.tested_keywords`, meaning the DM auto-reply was tested from a second account. Otherwise end on a save or follow ask, and say why.
5. **Generated voices** never say any word in `brand.json` → `voice.never_say`; show it as on-screen text instead. Spell tricky words by sound using `voice.pronunciation`.
6. **DMs.** `/ig-dm` writes replies to people who raised their hand (commented a keyword, messaged the brand, replied to a story). No cold DMs to strangers: the only DMs are to people who raised their hand, including a person who writes back to the private message that answered their comment (a follow-gated rule, `publisher/README.md`).
7. **Research.** `/ig-viral` reads reels in the browser at human speed, with the owner present. Meta's official API is not scraping: with the brand's Instagram connected through Unified Login, `/account-audit` and `/reel-sources` may read business and creator accounts (business discovery) and hashtag top posts through it (`research.mjs`). No scraping services unless the brand owner has turned on `autopilot.scrape` (then `/account-audit` and `/reel-sources` may use Apify, with the cost shown first). Claude never logs in with the brand's password and never handles an API key.
8. **Copy formulas, never videos.** Hook shape, structure and length only. Never another creator's script, colours, mascot, characters or prompts.
9. **Rights.** No other company's logos, footage, music or characters unless the brand owns the rights. **Licensed material (music, sound effects, stock video, motion graphics, LUTs) may come from any source the brand has rights to (we suggest Uppbeat)**, downloaded by the owner, and every asset is recorded with `kit licensed add` (`/licensed-assets`, `brand/licensed/README.md`) and used by its id. Never commit the media; `kit gate <reel> record --gate C` refuses a reel whose assets are not recorded or have changed. A logo or app icon a reel does show is kept in `brand/library/logos/` and added, rights-checked and used through `/logo-library`: the owner approves each mark, and the scheduler refuses a reel whose logos are not official or traced and approved.
10. **Approval gates.** The approver in `brand.json` -> `people` approves (usually the workspace owner, also for client brands). `kit gate` refuses to record a gate unless its checks are in `approvals.md`. Only the owner overrides a check, and each override is written into the record with a reason.
    - **Fact check:** `/reel-factcheck` on the script (scope `script`) before Gate A, and on the final (scope `final`) before Gate C. Override: `--skip-facts "reason"`.
    - **Gate A (script).** It needs the script fact check PASS and, under Gate A, a `Script review: meets the bar (NN/100; weakest: ...) [script <12 hex>]` line of 90 or more for these exact words, written by `/script-score` after `/reel-scripter`'s stages. Any later change to the spoken words, a fact-check fix included, needs a new review. Override: `--skip-script-review "reason"`. No voice credits are spent before Gate A. Before showing the script, run `python3 ~/.claude/skills/bagelunit-reels/tools/budget.py reels/<slug>/script.txt` (on Windows `python`) and tell the approver the credits it needs against what is left; if it says NOT ENOUGH, say so before they approve.
    - **Gate B (visual plan).** The concept card and shot cards, with "Tools per scene" and "Names on screen" filled in (`docs/craft-playbook.md`). It needs Gate A recorded. Run `python3 scripts/qa/gate_qa.py <slug> --gate B` on the draft first.
    - **Gate C (final video).** It needs Gates A and B recorded, the final fact check PASS, and a `Review: meets the bar (NN/100; weakest: ...) [video <12 hex>]` line of 90 or more from `/reel-review`. The 12 hex is the first 12 characters of the sha256 of the newest `out/*.mp4`: `node ~/.claude/skills/bagelunit-reels/tools/kit.mjs gate <reel> hash` prints it. It also needs `kit licensed check <reel>` to pass (every licensed asset the reel uses is recorded and unchanged; no override; the credits go into `approvals.md`), and the `kit qa` result PASS for that exact file, and the brand QA hook passed for it: `python3 scripts/qa/gate_qa.py <slug>` reads the pixels for the frame-0 hook, text in the bottom 300 px or right 120 px, and text size, and writes `build/qa-gate.json`. A hook in `.claude/settings.json` refuses `kit gate <reel> record --gate C` until that record passed for the file on disk. If no text reader is installed on this computer, the hook cannot check: tell the owner. Overrides: `--skip-review`, `--skip-qa`, and `gate_qa.py <slug> --skip "reason"`; `--skip-order` skips the A, B, C order.
    - **Score bar (owner rule): anything scored must reach 90 or more.** Below 90 you redo what the review named, rebuild and review again, never raising a score to get there. The human score's bar is in rule 3.
    Ask for each gate with a question block (AskUserQuestion): show what is being approved first (the script text, the visual plan, or the final video's path and how to watch it on a phone), then ask "Gate A: approve this script?" (or B, C) with the options "Approve (Recommended)" when every check passed, "Change something" (they say what under Other or next), and "Stop this reel". Never treat silence or a vague reply as a yes.
    Record each approval with the date in `reels/<slug>/approvals.md` (`kit gate <reel> record --gate A|B|C`), and the dashboard redraws by itself (the kit's hook in `.claude/settings.json` runs `.claude/skills/content-calendar/sync.mjs` after each step; run it with `--force` if the page looks stale).
11. **Nothing is posted, scheduled or sent by Claude.** A person posts. There are two exceptions.
    - **Posting.** With the brand's publisher connected (`publisher/`, `docs/connect.md` step 6) and `autopilot.post` on, Claude may schedule a reel after Gate C. It schedules only the approved file and cover (`kit gate <reel> check` prints MATCH).
    - Ask one question after Gate C that shows the time and the platforms. The time comes from the reel's row in `brand/plan.md`. The platforms are every platform the publisher has connected (Instagram, Facebook Page, Threads, YouTube Shorts, TikTok), unless `brand.json` -> `posting.platforms` fixes a shorter list. The owner is not asked to pick them again for every reel.
    - A dry-run test may be scheduled before `autopilot.post` is on. It posts nothing, and it stays a dry run even if the publisher goes live before its time.
    - **Replies.** With Instagram connected, `/comment-responder` may send one reply, private reply or DM at a time, only after the owner says yes to that exact text.
12. **No links in public comment replies.** A link goes in the DM only, and only once the keyword auto-reply is tested (rule 4).
13. **Hook checklist and review.**
    - 13a. Every hook is a triple hook: context at once, then a lean, then a contrarian snapback (`docs/hook-and-review-playbook.md` section 0). Before Gate A, run its read-back test on the script.
    - 13b. The eight-point frame-0 hook checklist (section 1 of the same file) is checked on real frames, never on the script: on the Gate B stills, on the draft and on the final. Run `/reel-review` on every draft and every final, and put its verdict line in `approvals.md`.
    - 13c. Pick one goal and one angle per reel. The research skills in this folder's `.claude/skills/` (`/reel-analyzer`, `/virality`, `/going-viral`, `/hook-mining`, `/comment-mining`, `/ab-hook-tester`, `/cover-thumbnail-brief`, `/analytics-readout`) give structure only: their numbers are one account's data, so test them against the brand's own median.
14. **Teardowns use files the person supplies** unless autopilot is on (below). `/reel-analyzer` works on a file or transcript the person gives.
15. **Web setup goes through the browser tool** (`docs/browser.md`). Every setup step on a website (switching Instagram to professional, the Meta app, Facebook Page and Threads, a Google Cloud project for YouTube, a TikTok developer app, Cloudflare, Telegram, a host, the sticker host's image tool, Apify, Runway) is done by Claude in the owner's browser with Claude in Chrome. If it is off, say in one line what it does and how to turn it on (`/chrome`; Chrome, Edge, Brave, Arc, Vivaldi or Opera, not Safari or Firefox), offer once to help install Chrome or Edge, and otherwise walk the owner through the written steps. Claude does everything on the page except three things, which are the owner's: logging in (passwords, codes, payment details), copying a secret (make the file it goes into with `PASTE-...` where it belongs, open it in the owner's editor, stop one click before the secret shows, name that button, and do not read or capture the tab until the owner says "done"), and the last click of anything that deletes (stop at the final Delete, Remove or Confirm; for a command that deletes, show it and let the owner run it). Ask before anything that costs money, makes something public or speaks for the owner to a company (a paid plan, App Review, Business Verification, switching a Meta app to Live, agreeing to terms). Never type a token or password into a page, and never put a secret in the chat; the kit's scripts move secrets on (for the publisher, `node publisher/scripts/setup.mjs secrets`).

16. **Outside tools are only ever suggested, never required.** The kit works on its own code without them. Show them with `/suggested-tools` or `kit suggest`, ask which the owner has as question blocks (one per category, always with "I have none of these"), never push a tool, never claim a price or plan (say "check the site"), never read or print a key. `/brand-setup` asks once near the end. Tips: one short line at most per command, never repeated for a tool within 7 days, silenced by `tools.tips: false`, `--no-tips` or `BAGELUNIT_NO_TIPS=1`.
17. **The voice needs no outside tool.** With no ElevenLabs key, `tools/voice.py` speaks with the free built-in voice (basic quality). Say so, and offer `kit suggest elevenlabs` as the upgrade; never present the built-in voice as a problem to fix first. `brand/brand.json` `voice.provider` is `elevenlabs`, `local`, `command` or `auto`; any other text-to-speech service connects with `voice.command` (see `docs/sound.md`); never store its key in the kit. If `build/voice_source.json` says `"timings": "estimated"`, word times are approximate: tell the user and leave extra room on cuts and captions.

## 3b. Autopilot (OFF by default, the brand owner turns it on)

By default Claude never posts, scrapes, sends replies or pays for renders. Rules 4, 7, 10 and 11 and the local-renders-only rule can be relaxed only by the brand owner, one permission at a time, in `brand/brand.json` -> `autopilot`: `post`, `dm_replies`, `scrape`, `paid_renders` and `retime`. Each starts false. Record the owner's answer and the date. Ask which ones with a question block (AskUserQuestion, one option per permission, multi-select). Never turn one on yourself.

`retime` lets the daily refresh move `posting.times`, and the plan rows not yet scheduled, to the hours the brand's own numbers favour (`/content-calendar best-times`, at most once a week, never a reel that is already scheduled).

When a permission is on, these installed skills may be used for it:
- `post` or `dm_replies`: `/reel-posting` (scheduling approved reels), `/content-factory` (post, keyword rule), `/comment-responder` (public reply plus DM). Automatic keyword replies run in the brand's publisher once the owner tested them and switched them from dry run to live (`docs/connect.md` step 7, `docs/auto-reply.md`). Posting still needs the owner's yes for each reel and its time (rule 11); it is never a standing permission. The kit's publisher posts only what was scheduled that way (`docs/auto-post.md`).
- The dashboard's connections (`brand.json` -> `dashboard`): `instagram`, `facebook` and `threads` read the brand's own numbers through Meta's official APIs (read only), `telegram` sends the owner a summary, `refresh` runs them all on a schedule on this computer. Each starts off and is turned on only after the owner's yes in `/content-calendar` (`connect instagram`, `connect facebook`, `connect threads`, `connect telegram`, `auto`). They report; they never post, approve or schedule a reel. Claude does the setup in the owner's browser and the owner copies each token into the file Claude opens in `~/.config/bagelunit-reels/` (rule 15, `docs/connect.md`).
- `scrape`: `/account-audit` (outliers via Apify, or from an export), `/reel-sources` (fetch a reel, mine demand), and `/content-factory`.
- `paid_renders`: Seedance on Runway through `/reel-builder` (about $6 to $12 per reel).
- `retime`: `/content-calendar best-times` (the refresh applies the suggested times).

These stay on even in autopilot: rule 1 (only cleared facts, no invented numbers), no links in public comment replies (rule 12), a keyword CTA must really deliver, never search the computer for or print an API key (the person connects tools themselves), and nothing is sent or posted to a brand the permission was not given for.

## 3b1. Private history (only if this folder is a git repo)

If this folder has a `.git` folder, it is this brand's private, local history. After each approved gate, commit what changed with a short message such as `Gate A: <slug>` (add `-c user.name="Reel workspace" -c user.email="reels@localhost"` if git has no name set). Never add a remote, never push, and never commit anything `.gitignore` leaves out (keys, renders, audio). If there is no `.git` folder, do nothing; never create one without being asked.

## 3b2. Kit updates (ON by default, the owner can turn it off)

This copy records the kit version it is on in `.kit-version`, and the kit build in `.kit-build` (the version changes only for a release; small changes come as newer builds of the same version). If `brand/brand.json` -> `updates.check_on_start` is `true`, then once at the start of a session the kit's startup note says whether a newer kit is out (it reads two public files on GitHub, `VERSION` and `template/.kit-build`, at most once a day). If it is, say once, in one or two lines: "Kit <new> is out (this workspace is on <old>)" or "A newer build of kit <version> is out", then "Type `/kit-update` and I will show what changed and update it step by step." If the note says nothing, say nothing; `node .claude/skills/kit-update/update.mjs check` asks GitHub directly. Never update anything yourself, and never ask more than once per session. With the setting `false` or missing, do not check.

## 3c. Weekly batch (optional)

To make a week's reels in one sitting: use `/content-calendar plan` (or `/ig-plan`) to pick up to `brand.json` -> `batch.max_reels` topics (3 if the setting is missing; the owner can change it any time). Each reel gets one goal (goals may repeat in a batch) and one angle. In a batch of up to five, no two reels share an angle; in a bigger one (several posts a day), use every angle in turn so no two reels next to each other share one. Write all the scripts, then take them to Gate A together, but record each reel's approval separately in its own `approvals.md`. Voice credits are spent only for scripts that were approved. After that every reel runs the normal loop one at a time (visual plan, Gate B, build, verify, Gate C), and a problem in one does not block the others. Update `brand/plan.md` and `brand/log.md` per reel. With several posting times a day (`posting.times`), give each planned reel its time in the plan's Date column (`2026-11-12 13:00`) so it takes that slot. If the owner asks for more reels than `batch.max_reels`, say so and ask before going over: every reel still needs a proper review.

## 4. Map

- `reels/_example/`: a blank pattern for a script, approvals and caption. Never treat it as a real reel. `docs/first-reel.md` walks a new user through the first reel.

- `brand/`: this brand's identity, voice, cleared facts, research and log. `brand/library/` holds its real media (see `INDEX.md`). `brand/licensed/` holds the licensed assets recorded from Uppbeat (`assets.json` is tracked, the media never is; see its `README.md`).
- `docs/auto-reply.md`: how to connect a comment auto-reply and DM for this brand (optional, owner's accounts).
- `docs/auto-post.md`: how to post approved reels on a schedule for this brand (optional, owner's accounts).
- `docs/browser.md`: how Claude does the web setup in the owner's browser (Claude in Chrome): turning it on, and the three things the owner does (log in, copy a secret into the file Claude opens, click the last Delete).
- `docs/connect.md`: how to connect everything, step by step: Instagram (Unified or Instagram Login), the Facebook Page, Threads, the publisher, keyword replies, and how it all stays in sync (optional).
- `docs/dashboard.md`: the content dashboard, a Telegram summary, where to view it and the daily refresh (optional).
- `publisher/`: the brand's own publisher (a free Cloudflare Worker) that posts approved reels on Instagram, the Facebook Page, Threads, YouTube Shorts and TikTok at the approved time, dry run first. `publisher/README.md` and `docs/connect.md` step 6.
- `docs/craft-playbook.md`: what is on screen (one world, a through-line, a line-to-picture table, no repeats). Read it before writing the storyboard. `docs/style-ideas.md` lists style concepts that are not built yet.
- `reels/<slug>/`: one folder per reel (script, plan, approvals, and `out/` with the final mp4, the cover and `caption.txt`).
- `scripts/`: the reel QA gate (`scripts/qa/gate_qa.py`, `reel_qa.py`), page capture, colour grade, kinetic captions, music bed and upscale tools. `brand/library/3d/`: Blender and Manim shots (`/blender-shot`), with `lib/bb.py` and the shot templates; `brand/library/sfx/`: sound effects with their licence on record. `COMMANDS.md` in the kit lists every command.
