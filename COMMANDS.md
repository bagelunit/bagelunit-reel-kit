# BagelUnit Reel Kit commands

Every command in the kit (version 1.10.1) and what it does. Also as a [PDF](docs/commands.pdf) and a [spreadsheet](docs/commands.csv) (opens in Excel).

Most of the time you only need four: `/brand-setup`, `/bagelunit-reels` with your topic, `/analytics-readout` with your numbers, and `/kit-update`.

## Get started (once per computer)

Type these in a terminal in the kit folder, or ask Claude Code there to run them.

| Command | What it does |
|---|---|
| `bash setup/install.sh` | Installs the kit on a Mac or Linux computer: checks the programs it needs, installs the reel engine, the sound library and the plugins. Safe to run again; run it after every kit update. |
| `node setup/install.mjs` | The same installer, for Windows (it works on every system). |
| `/brand-setup` | The first command after installing: makes your brand's own folder (named <brand>-reels) and asks about your brand. |
| `node setup/new-brand.mjs <folder>` | Makes a new brand folder from the command line, for example ~/Reels/acme (it becomes acme-reels). |
| `node setup/sync-template.mjs <brand folder>` | Shows what a kit update would change in a brand folder; add --apply to do it. /kit-update does this for you. |

## Set up and keep up to date

Type these in Claude Code inside a brand folder.

| Command | What it does |
|---|---|
| `/brand-setup` | Sets up the brand (name, handle, colours, logo, fonts, presenter, voice, call to action) or changes it later. |
| `/sticker-host` | Makes your sticker host, a cartoon of you or your mascot for Print reels: a base pose from one photo, then a starter 10, then any pose a reel needs (new, add <pose>, check <reel>, status). |
| `/kit-update` | Checks for a newer kit, shows what changed, updates this folder without touching your brand or reels, and offers to update the engine. |

## Make a reel

The main command, plus the steps it uses. Claude picks the right one; you can also type it.

| Command | What it does |
|---|---|
| `/bagelunit-reels` | Makes a reel: type it with your topic. Script, voice, animated shots, self-checks and the final mp4, with three approvals on the way. |
| `/viral-hook-writer` | Writes hooks (the first 1 to 3 seconds) for a reel. |
| `/hook-mining` | Makes new hooks from a file of hooks that already worked, keeping what made them work. |
| `/ab-hook-tester` | A/B tests a reel's hook: two clearly different versions, each approved, posted as Instagram trial reels, compared on one number; add record to save the winner. |
| `/reel-scripter` | Turns an idea or a hook into a full 30 to 45 second script. |
| `/reel-builder` | Turns an idea into a ready-to-shoot plan (lines, on-screen text, scenes), without rendering. |
| `/humanizer` | Rewrites a script, caption or reply so it sounds like you, not like AI, and checks the brand's banned words. |

## Check before you post

Run on every reel; Claude runs them at the approvals.

| Command | What it does |
|---|---|
| `/reel-factcheck` | Checks every claim against its source, before the voice is made and again on the final. |
| `/reel-review` | Reviews a draft or final against the kit's quality bar and writes a one-line verdict. |
| `/reel-predict` | Measures a reel and, once 8 or more posted reels have numbers, estimates where viewers may drop off. |

## Finish and post

| Command | What it does |
|---|---|
| `/caption-and-hashtags` | Writes the caption, hashtags and first comment, using only cleared facts. |
| `/cover-thumbnail-brief` | Writes the cover text and the brief for a cover that stops the scroll. |
| `/reel-repurpose` | Turns an approved reel into its TikTok and YouTube Shorts versions (captions, titles, a check of where each app's buttons sit), a carousel and a blog post. |
| `/reel-posting` | Gets an approved reel posted: a posting card for posting by hand, or scheduling it through the kit's publisher on Instagram, your Facebook Page and Threads (dry run first), and setting that up step by step. |
| `/content-calendar` | Your content calendar and dashboard: every reel from idea to posted, what needs you, the four agents, followers and trends. Add plan to fill the next weeks, days to set your posting days, host to view it on your Wi-Fi or online (Netlify suggested), connect instagram, connect facebook or connect threads for your numbers on each, connect telegram for a phone summary, auto to refresh by itself, all for every brand on one page. Posts nothing. |

## Research and plan

| Command | What it does |
|---|---|
| `/comment-mining` | Reads your comments and DMs for the questions and words your audience uses, and turns them into ideas. |
| `/reel-sources` | Finds reference material: what people in your niche ask, reels to study, the top posts for a hashtag (Meta's API), and a reel downloaded for study. |
| `/account-audit` | Finds the reels that beat an account's own median (yours or a competitor's), by arithmetic. Reads competitors through Meta's official API when Instagram is connected with Unified Login. |
| `/reel-analyzer` | Breaks down a reel you supply: hook, structure, pacing and visuals. |
| `/going-viral` | The strategy: pick the goal, the emotion behind it, then the hook and the angle. |
| `/virality` | Plans or reviews a reel so it gets watched, or explains why a post flopped. |

## After posting

| Command | What it does |
|---|---|
| `/analytics-readout` | Type it with your numbers a day or more after posting: adds them to brand/insights.csv and says in plain words what to make more of. |
| `/comment-responder` | Lists the comments and DMs waiting for you and answers, hides or sends a private reply, one at a time after your yes. Also sets up an automatic keyword reply in your publisher, off until tested. |
| `/content-factory` | The opt-in autopilot that runs the whole loop, one reel at a time, only as far as your permissions allow. |

## Engine commands (Claude runs these for you)

`node ~/.claude/skills/bagelunit-reels/tools/kit.mjs <command> reels/<slug>`

| Command | What it does |
|---|---|
| `kit start` | Starts a new reel folder in a style (print, depth or talking). Only inside a set-up brand folder. |
| `kit host` | Links the brand's sticker host into the reel and names any pose the reel needs that the set does not have (--check). |
| `kit frames` | Takes still frames at chosen moments, plus a contact sheet, to look at before rendering. |
| `kit render` | Renders a half-size draft, or the final 1080x1920 video with --final. |
| `kit pace` | Checks the reel keeps moving and finds still stretches. |
| `kit effort` | Checks the reel was built for this script, not from ready-made pieces. |
| `kit lint` | Checks the shot rules: lengths, cuts on words, rhythm, first-frame motion. |
| `kit qa` | Checks the final file: size, loudness, black or frozen frames, text safe zone, sync. |
| `kit facts` | The mechanical half of the fact check, and records the fact-check verdict. |
| `kit gate` | Records an approval (A, B or C) and checks the final file has not changed since. |
| `kit measure` | Measures a video: cuts, words, loudness, silence, still stretches. |
| `kit calibrate` | Learns from your own Instagram numbers (needs 8 or more reels). |
| `kit predict` | Measured facts, plus a watch-time estimate once calibrated. |
| `kit sound` | Mixes the voice, effects and music. |
| `kit export` | Joins picture and sound into the finished mp4 for Instagram. |
| `kit cover` | Renders the reel's cover to out/cover.jpg at Meta's size, plus a sheet showing how it crops in the grid. |
| `kit live` | Serves the reel so you can watch it play in a browser. |

## Publisher commands (in a brand folder, after you set it up)

`node publisher/scripts/<script>.mjs`

| Command | What it does |
|---|---|
| `setup.mjs` | Writes the publisher's settings for this brand and prints the steps in order; secrets sends the tokens from your token files to Cloudflare without showing them (--dry-run first); --url saves its address; check shows each platform and whether it is live. |
| `schedule.mjs` | Schedules an approved reel on Instagram, the Facebook Page and Threads (--preview checks without uploading); status lists posts and comment replies; cancel <id> stops one. |
| `pull.mjs` | Brings back what went out: links, errors and automatic replies, for the dashboard and the reel's Posting lines. |
| `forget.mjs` | Deletes what the publisher kept about one person, when they ask. |

## From the plugins the installer adds

| Command | What it does |
|---|---|
| `/ig-*` | The instagram-agent plugin: research, hooks, scripts, captions, plans, DMs and audits. |
| `/hyperframes` | The HyperFrames plugin: an optional second engine (HTML scenes rendered to video). |

This file is made by `node setup/make-commands.mjs` from one list; edit the list there, not this file.
