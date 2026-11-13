# BagelUnit Reel Kit

Make ready-to-post vertical reels (1080x1920, Instagram, TikTok, Shorts) with Claude Code. You give a topic or a script; Claude writes, voices, animates, checks its own frames, adds real sound effects and exports the mp4. You approve at three gates, and a person posts.

Each person runs the kit on their own computer with their own Claude Code account and their own keys. Nothing in this repo holds a key, a photo of anyone or any client data.

> **Quick start** (when Node.js 22 or newer, Claude Code and, on a Mac, Homebrew are already installed; new to all this? begin at [Start here](#start-here-if-you-have-never-done-this-before)). 1) Download this kit. 2) In its folder run **`bash setup/install.sh`** (Windows: `node setup/install.mjs`), or let Claude Code run it with Message 1 below. 3) Open Claude Code there and type **`/brand-setup`** to make your brand's folder. 4) Open that folder and type **`/bagelunit-reels`** with your topic. Step by step: [Start here](#start-here-if-you-have-never-done-this-before).

> **See what it makes:** [23 sample clips, 10 seconds each](docs/samples/README.md), one for every look: Print, 3D, Talking head and 20 scene styles.

> **Every command in one place:** [COMMANDS.md](COMMANDS.md), also as a [PDF](docs/commands.pdf) and a [spreadsheet](docs/commands.csv).

> **License.** Free to use, including for paid client work, under the [BagelUnit Reel Kit License](LICENSE). The videos you make are yours. Please do not resell, re-upload or repackage the kit.

## What you get

**Three styles.** Claude always asks which one before it starts a reel.

| Style | Best for | Look |
|---|---|---|
| **Print** | tips, tools, lists, opinions, news | a riso-print look on warm paper, big condensed captions, a presenter who points and reacts |
| **3D** (`depth`) | "what happens inside" explainers | lit 3D rooms and props, a camera that travels with the story |
| **Talking head** (`talking`) | your own face video | tightened pauses, cut layouts, word-by-word captions and graphics |

**Sticker host (add-on, Print style).** Instead of the kit's drawn presenter, a print reel can show a cartoon of you (or your mascot) as die-cut stickers that react on the words you choose. Type `/sticker-host` in a brand folder: from one photo it makes a base pose for your approval, then a starter pack of 10 poses, and later any new pose a reel needs, so the set grows with your reels. Image tools: ChatGPT, Gemini, the OpenAI or Gemini API, or Higgsfield (ours was made with Higgsfield). See [docs/avatar.md](docs/avatar.md).

**Real-sound step (add-on).** The engine's built-in effects are synthesised and can sound fake. After export, `realsound.py` swaps them for real CC0 recordings, snaps every hit to the frame where the motion lands, mixes to -14 LUFS with the voice on top, and listens to the result with earshot. See [docs/sound.md](docs/sound.md).

**A brand workspace.** Each brand gets its own folder. Type `/brand-setup` in the kit's folder: it makes the folder and runs a short brand setup (your name, the brand, handle, colours, logo, fonts, presenter, voice, call to action, kit updates, a private history, and how often you want to post), and keeps that brand's rules, voice and cleared facts in its `brand/`. Inside a brand folder, `/brand-setup` changes the answers any time.

**Checks on every reel.** Claude fact checks the script before you approve it (before any voice credits are spent) and again on the final: a fresh reader re-reads every source, and a claim it cannot back up is flagged. `kit qa` checks the finished file (format, loudness, black or frozen stretches, and whether the first word lines up with the first sound), `/reel-review` writes a one-line verdict (meets the bar, close, or not ready), and each approval is tied to the file's fingerprint, so a change after approval shows up.

**Clickable choices.** Every setup question and every approval is a question block: you click an option, or pick "Other" and type your own answer.

**A posting plan.** Setup asks how often you want to post: a few a week, one a day, or several a day (any number, each at its own time). Not sure? `/content-calendar how-often` suggests a number from accounts like yours, what you can keep up and your own results. Claude plans at most that many in one sitting, and you still approve each reel on its own.

**Posting help.** Once you approve the final, `/reel-posting` gives you a posting card (the file, the cover, the caption ready to copy, the quality setting and a suggested time). It can also schedule it through the kit's own publisher (a free Cloudflare Worker in each brand folder) on Instagram, your Facebook Page and Threads, with the approved cover, dry run first. Nothing is posted unless you set up the publisher yourself and said yes to that reel's time; the steps are in [`template/docs/connect.md`](template/docs/connect.md).

**Comment auto-reply.** `/comment-responder` walks you through connecting a "comment a keyword, get a DM" reply for your brand, one step at a time ([`template/docs/auto-reply.md`](template/docs/auto-reply.md)). It stays off until you have tested it from a second account and turned it on.

**Content calendar and dashboard.** Type `/content-calendar` in a brand folder for one page: every reel from idea to posted on a calendar, what needs you next, four agent panels (Ideator, Hook & Script, Planner, Analyst) showing what each made and its next command, followers and trends, and your top posts. `/content-calendar plan` fills the next weeks after your yes. Optional, each off until you turn it on: your own Instagram, Facebook Page and Threads numbers through Meta's official APIs (read only), your audience and the best time to post, comments and DMs waiting for you, a daily summary on your phone through your own Telegram bot, viewing it live on your Wi-Fi or online on the host you choose (Netlify suggested, Cloudflare or any other), and a refresh that runs by itself on Mac, Windows or Linux. Click a reel on the calendar and its card plays the approved video, so you can watch what goes out that day. A watch section you name yourself ("News watch" until you rename it) lists what is new on the news pages, release notes and changelogs you follow (`/content-calendar watch`). It also runs A/B tests of your hooks as Instagram trial reels and calls the winner, shows your content mix, series, and the time and voice cost of each reel, and `/content-calendar all` puts every brand on this computer on one page. See [`template/docs/dashboard.md`](template/docs/dashboard.md), and [`template/docs/connect.md`](template/docs/connect.md) to connect everything step by step. It never posts.

**Your numbers after posting.** Type `/analytics-readout` with your numbers: it keeps one row per posted reel in `brand/insights.csv` and says what to make more of and what to stop, against your own results. Once 8 of your posted reels have numbers, `/reel-predict` can estimate how a new draft will hold viewers before you post it. See [`template/docs/after-posting.md`](template/docs/after-posting.md).

**One-command updates.** Type `/kit-update` in a brand folder: it shows what changed, previews, updates the workspace without touching your brand's files, and updates the engine too. It works even if you downloaded the kit as a ZIP.

## Requirements

- **macOS, Windows or Linux.** One installer for all three. It needs [Node.js](https://nodejs.org) 22 or newer to start, and it installs or asks for the rest (ffmpeg, Python 3, git, uv, Whisper) using Homebrew on Mac, winget on Windows, and apt or pacman on Linux. It always shows you a command and asks before installing a program, and never runs anything as administrator by itself.
- **Claude Code** on a paid plan (Pro, Max, Ultra, Team or Enterprise), signed in with your own account. A reel takes Claude roughly 30 to 80 minutes of work. If your plan's usage limit stops Claude partway, nothing is lost: see "If Claude stops partway" in [`template/docs/first-reel.md`](template/docs/first-reel.md).
- An **ElevenLabs** account and API key of your own for the voice. The free plan is fine for trying the kit, but ElevenLabs allows only non-commercial use on it, with credit to ElevenLabs. For a business's or a client's reels, use a paid plan (Starter or higher; check ElevenLabs' current terms). Your key stays on your computer in `~/.config/bagelunit-reels/elevenlabs.key`; you put it there yourself, and it never goes in a chat or in this repo.
- About 3 GB of disk for the render browser, the sound library and earshot's models.
- **Recommended:** Google Chrome, Microsoft Edge, Brave, Arc, Vivaldi or Opera with the Claude extension, so Claude can do the website steps for you (see "Before you begin", step 6). Safari and Firefox work for reading, but then you do those steps by hand.

**What it costs you.** The kit itself is free. You pay for your own Claude plan and, for business use, an ElevenLabs paid plan. A 45-second voiced reel uses about 800 ElevenLabs characters, and Claude shows the number before any are spent. A talking-head reel uses your own voice, so it needs no voice credits. Optional and paid, each off unless you turn it on: the sticker host's image tool when you use an API (paid per image; ChatGPT or Gemini in the browser use your own plan), the outlier scan with Apify (paid per result) and Runway video clips (see [SETUP.md](SETUP.md)). Connecting Instagram, Facebook and Threads, the publisher on Cloudflare's free plan and the Telegram summary cost nothing.

**Where everything goes on your computer.**

| Folder | What is in it |
|---|---|
| the kit folder you downloaded (for example `~/dev/bagelunit-reel-kit`) | the kit itself; you set it up and make brand folders from here, never reels |
| `~/.claude/skills/bagelunit-reels` | the reel engine, copied there by the installer |
| `~/dev/sound` | the sound tools and their models (about 1.5 GB) |
| `~/.config/bagelunit-reels` | your keys and settings, only on this computer |
| `~/Reels/<brand>-reels` (or where you choose) | one folder per brand: its rules, facts, plans and reels |

`~` means your home folder (on Windows, `C:\Users\<you>`). Keep brand folders out of iCloud Drive, OneDrive and Dropbox: renders are large and syncing them slows everything down.

## Quick start

For people who already have Node.js 22 or newer, Claude Code and (on a Mac) Homebrew. Everyone else: start at [Start here](#start-here-if-you-have-never-done-this-before) below, which installs those first.

```bash
git clone https://github.com/bagelunit/bagelunit-reel-kit.git ~/dev/bagelunit-reel-kit
cd ~/dev/bagelunit-reel-kit
bash setup/install.sh          # macOS and Linux. Safe to run again; prints every step
```

On Windows, in PowerShell: `node setup/install.mjs` (it works on every system). Use `python` where this kit says `python3`, and `$HOME\` where a path starts with `~/` (for example `$HOME\.config\bagelunit-reels`).

## Start here (if you have never done this before)

You do not need to be technical. You give Claude Code a few messages, and it does the rest. These are the steps, in order.

**Before you begin** (about 15 minutes, once; the install after it takes another 20 to 40 minutes, mostly downloads):
1. **Mac only: install Homebrew** (the kit uses it to install programs). Open Terminal, paste the one-line command from https://brew.sh and press Enter. It asks for your Mac password (typing shows nothing; that is normal). When it finishes it prints "Next steps" with two or three lines that start with `echo` or `eval`: paste those too, then close and reopen Terminal.
   **Windows only: install Git** from https://git-scm.com/downloads/win (accept the defaults). Claude Code then uses Git Bash, which the kit's commands are written for.
2. Install **Node.js** from https://nodejs.org (choose the "LTS" download and accept the defaults). On Linux, use the nodejs.org instructions for your system; most systems' own `nodejs` package is too old.
3. Install **Claude Code** and sign in with your own Claude account (Pro, Max, Ultra, Team or Enterprise): https://claude.com/claude-code
4. Make an **ElevenLabs** account at https://elevenlabs.io (the free plan is enough to try the kit; for a business or a client you need a paid plan, see Requirements above). It is the voice for your reels. You will save its key later; Claude shows you how.
5. **Download this kit.** On this page click the green **Code** button, then **Download ZIP**, and unzip it somewhere easy (for example your home folder). Unzipping can make a folder inside a folder with the same name: use the inner one, the folder that holds `README.md` and `setup`. Or, if you know git: `git clone https://github.com/bagelunit/bagelunit-reel-kit.git`.
6. **Turn on the browser tool (recommended).** In Chrome (or Edge, Brave, Arc, Vivaldi, Opera), install the Claude extension and sign in (SETUP.md, section 0). Later, in Claude Code, type `/chrome` and turn it on. Then Claude does the website steps for you (the ElevenLabs key page, the sound packs, and later Instagram and the rest) while you watch; you only log in, copy a key into a file Claude opens for you, and click any final Delete. Without it, every step is written out for you to do by hand.

**Then send three messages to Claude Code.** The first two go in the kit's folder, the third in your brand's folder (Message 2 makes it). To open Claude Code in a folder: open a terminal there, type `claude` and press Enter (or in VS Code: File, Open Folder, then open Claude Code).
- *Mac:* open Terminal, type `cd ` (with a space), drag the folder from Finder into the window, press Enter, then type `claude`.
- *Windows:* open the folder in File Explorer, click the address bar, type `powershell`, press Enter, then type `claude`.
- *Linux:* open the folder in your file manager, right-click an empty spot and choose "Open in Terminal", then type `claude`.

### Message 1: set up the kit (once per computer)

Open Claude Code in the kit folder you downloaded, then paste this. Replace every part in [SQUARE BRACKETS] (brackets included) with your own answer. Not sure about one? Delete that line and Claude will ask.

```
Set up the BagelUnit Reel Kit on this computer. Follow CLAUDE.md and SETUP.md in this folder.

ABOUT MY COMPUTER
- My system: [Mac / Windows / Linux]
- Node.js is already installed: [yes / no / not sure]
- My Claude plan: [Pro / Max / other]
- My ElevenLabs account: [I have one / I need to make one]

WHAT TO DO
1. Run the installer for my system (bash setup/install.sh on Mac and Linux, node setup/install.mjs on Windows). If it lists a missing program, show me each exact command and ask before running it; only re-run with --yes after I agree. A command that needs my password (sudo on Linux, the Homebrew installer on Mac) I run myself in my own terminal: give me the exact line to paste.
2. Check whether the browser tool (Claude in Chrome) is on. If it is, do the website steps in my browser (the ElevenLabs key page and the Kenney sound packs). If it is not, explain in one line what it does and ask whether I want to turn it on (/chrome) or do those steps by hand; reels still work without the sound packs.
3. Never ask for, print or search for any key or password. Make the empty file where my ElevenLabs key goes, open it for me, and let me paste the key in myself.
4. If something needs me to close and reopen the terminal window, say so before moving on.
5. When it finishes, run the checkup and give me two lists in order: what is working, and what I still have to do myself.

Do not make any reel or brand folder yet. End by telling me what to do next.
```

**What goes in each blank**
- **My system:** Apple computer = Mac; Windows laptop or PC = Windows. If you are unsure, Claude can tell from the installer.
- **Node.js installed:** not sure? Say "not sure". Claude checks by running `node --version`; a number like `v22.1.0` (22 or higher) means yes.
- **Claude plan, ElevenLabs:** tells Claude how many credits to expect and whether to walk you through making an account.

### Message 2: set up a brand (once per brand)

In the same kit folder, type **`/brand-setup`** and press Enter. Claude asks the brand's name and where its folder should go (it suggests `~/Reels/<brand>-reels`), makes that folder for you, then asks about the brand with clickable questions: your name, handle, colours, logo, fonts, presenter, voice and call to action. At the end it tells you how to open the new folder.

Every brand gets its own folder, so brands never mix. Run `/brand-setup` again in the kit folder for each new brand. Inside a brand's folder, `/brand-setup` changes that brand's answers. (Doing it by hand also works: copy the `template` folder, open Claude Code in the copy, and paste the "Set up this brand" message from [`template/docs/prompts.md`](template/docs/prompts.md).)

### Message 3: make a reel (every time)

Every reel is made in the brand's `<brand>-reels` folder, never in the kit's folder or another folder. The kit refuses to start a reel anywhere else, so each brand's reels, facts and voice stay together.

Open Claude Code in the brand folder `/brand-setup` made, the one named `<brand>-reels` (in VS Code: File, Open Folder), and type **`/bagelunit-reels`** with your topic, for example `/bagelunit-reels why most budgets fail in March`. For more control, paste the "Make a reel" message from `docs/prompts.md` in your brand folder instead. It has blanks for the topic, the one goal, the style, the facts you allow, and something only you can say, plus a filled-in example. Claude asks which style you want, writes hooks and the script, fact checks it, and shows you what the voice will cost. Then it stops three times for your yes (script, visual plan, final video), each time with a clickable approval. It never posts anything for you unless you connected a publisher yourself and approve each reel's time.

When you are ready for results, the same file also has a message for reading your numbers after posting and one for planning a week of reels. A walk-through of the first reel is in [`template/docs/first-reel.md`](template/docs/first-reel.md).

The full process, with its three approval gates, is in [docs/process.md](docs/process.md). It is a technical reference for how Claude runs each reel; you do not need to read it to make one.

### After your first reel

- **Your numbers:** a day or more after posting, type `/analytics-readout` in the brand folder with the numbers. Where to find each number in Instagram: [`template/docs/after-posting.md`](template/docs/after-posting.md).
- **Connect your accounts (optional):** [`template/docs/connect.md`](template/docs/connect.md) walks through Instagram, your Facebook Page, Threads, the publisher and keyword replies, step by step.
- **Comments and DMs:** `/comment-responder` lists what waits for you and answers with your yes ([`template/docs/auto-reply.md`](template/docs/auto-reply.md) for automatic keyword replies).
- **Automatic posting (optional):** `/reel-posting` with the kit's publisher ([`template/docs/auto-post.md`](template/docs/auto-post.md)).
- **Updates:** type `/kit-update` in a brand folder.

## What is in the repo

| Path | What it is |
|---|---|
| `studio/` | The reel engine, installed as the Claude Code skill `bagelunit-reels` (`/bagelunit-reels`): three styles, the always-ask-the-style rule, the sticker host and the real-sound step. Changes are logged in `studio/LOCAL-CHANGES.md`. |
| `template/` | The generic brand workspace. `/brand-setup` (or `node setup/new-brand.mjs <folder>`) copies it once per brand or project; start Claude Code inside the copy. It is self-contained and carries the licence: `CLAUDE.md` (house rules and first-run setup), `brand/`, `reels/`, `docs/`, and the skills in `.claude/skills/`. |
| `template/docs/` | `first-reel.md` (your first reel, step by step), `prompts.md` (messages to copy and fill in), `after-posting.md` (your numbers), `connect.md` (connect Instagram, Facebook, Threads and the publisher, step by step), `dashboard.md` (the content dashboard), `auto-reply.md` (comment auto-reply and DMs), `auto-post.md` (posting on a schedule), `hook-and-review-playbook.md`, `craft-playbook.md` (what is on screen) and `style-ideas.md` (style concepts not built yet). |
| `template/publisher/` | The brand's own publisher: a Cloudflare Worker (free tier) that posts approved reels on Instagram, the Facebook Page and Threads at the approved time, runs keyword replies, and reports back to the dashboard. Dry run first; set up by the owner with `node publisher/scripts/setup.mjs`. |
| `template/.claude/skills/` | 27 skills that travel with every copy of the template (nothing global, so brands never mix). Setup and updates: `brand-setup`, `sticker-host`, `kit-update`. Research and planning: `account-audit` (with the 3x outlier script), `reel-sources`, `reel-analyzer`, `comment-mining`, `going-viral`, `virality`. Hooks and script: `viral-hook-writer`, `hook-mining`, `ab-hook-tester`, `reel-scripter`, `reel-builder`, `humanizer`. Checks: `reel-factcheck`, `reel-review`, `reel-predict`. Finishing and posting: `caption-and-hashtags`, `cover-thumbnail-brief`, `reel-posting`, `reel-repurpose` (TikTok, Shorts, carousel, blog), `content-calendar` (calendar and dashboard), `reel-loop` (reads trial-reel numbers and makes the next reel from them). After posting: `analytics-readout`, `comment-responder`, and the opt-in autopilot `content-factory`. |
| `.claude/skills/brand-setup/` | `/brand-setup` in the kit's folder: the first step after installing. Makes a brand folder with `setup/new-brand.mjs` (a copy of `template/`) and asks the brand questions there. |
| `setup/install.mjs` | The installer (Node, runs on macOS, Windows and Linux). `install.sh` is a tiny launcher for it; `install.ps1` is one for PowerShell, which may block scripts by default (then run `powershell -ExecutionPolicy Bypass -File setup\install.ps1`, or simply `node setup/install.mjs`). |
| `setup/sync-template.mjs` | Keeps copies current (runs on Mac, Windows and Linux; `sync-template.sh` is a launcher): with no argument it refreshes a generic copy-from folder if you keep one (set its path in `REEL_TEMPLATE_HOME`; otherwise it does nothing); with a brand workspace path it shows (then with `--apply` performs) an update of that workspace's kit files without touching its `brand/` or `reels/`. |
| `docs/` | `process.md` (the full loop), `avatar.md` (the sticker host), `sound.md` (the real-sound step), `reference.md` (the kit's method: what to post, how a reel is made, the rules). |
| `COMMANDS.md`, `docs/commands.pdf`, `docs/commands.csv` | Every command and what it does, made from one list by `setup/make-commands.mjs`. |
| `setup/scan-repo.mjs` | A safety scan run on every push: keys, private files, personal paths, em dashes. |
| `SETUP.md` | Setup by hand, step by step, and common snags. |

**Settings and keys** live in `~/.config/bagelunit-reels/` on each computer, never in the repo. Upgrading from an install made before the rename? `setup/install.sh` copies your old settings folder over once and tells you which old skill folder to remove.

## License

Copyright (c) 2026 Susanoo Inc. See [LICENSE](LICENSE): use it, change it for your own use, make content for yourself and your clients; do not resell or redistribute it.

## Credits

- **Fonts** in `studio/fonts/` are under the SIL Open Font License 1.1 (see `studio/fonts/FONTS.md` and `OFL.txt`).
- **Installed by the setup script, not included here** (each under its own licence, made by its own authors):
  - [opus-sound-layer](https://github.com/Bodila51/opus-sound-layer) (MIT), which downloads CC0 sounds from [Kenney](https://kenney.nl) and Freesound,
  - [earshot](https://github.com/Leonxlnx/earshot) (MIT),
  - [HyperFrames](https://github.com/heygen-com/hyperframes) (Apache-2.0) Claude Code plugin,
  - three.js (MIT) and Playwright (Apache-2.0) through `npm install`.

These third-party tools are not ours; we only install and call them.
