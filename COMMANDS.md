# BagelUnit Reel Kit commands

Every command in the kit (version 1.9.0) and what it does. Also as a [PDF](docs/commands.pdf) and a [spreadsheet](docs/commands.csv) (opens in Excel).

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
| `/ab-hook-tester` | Writes two clearly different hooks for the same reel, to test which one wins. |
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
| `/reel-posting` | Gets an approved reel posted: a posting card for posting by hand, scheduling, or setting up automatic posting. |

## Research and plan

| Command | What it does |
|---|---|
| `/comment-mining` | Reads your comments and DMs for the questions and words your audience uses, and turns them into ideas. |
| `/reel-sources` | Finds reference material: what people in your niche ask, reels to study, and a reel downloaded for study. |
| `/account-audit` | Finds the reels that beat an account's own median (yours or a competitor's), by arithmetic. |
| `/reel-analyzer` | Breaks down a reel you supply: hook, structure, pacing and visuals. |
| `/going-viral` | The strategy: pick the goal, the emotion behind it, then the hook and the angle. |
| `/virality` | Plans or reviews a reel so it gets watched, or explains why a post flopped. |

## After posting

| Command | What it does |
|---|---|
| `/analytics-readout` | Type it with your numbers a day or more after posting: adds them to brand/insights.csv and says in plain words what to make more of. |
| `/comment-responder` | Sets up a comment-to-DM reply for a keyword, with a person in the loop. Sends nothing unless you turn it on. |
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
| `kit live` | Serves the reel so you can watch it play in a browser. |

## From the plugins the installer adds

| Command | What it does |
|---|---|
| `/ig-*` | The instagram-agent plugin: research, hooks, scripts, captions, plans, DMs and audits. |
| `/hyperframes` | The HyperFrames plugin: an optional second engine (HTML scenes rendered to video). |

This file is made by `node setup/make-commands.mjs` from one list; edit the list there, not this file.
