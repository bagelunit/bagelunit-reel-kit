# BagelUnit Reel Kit

Make ready-to-post vertical reels (1080x1920, Instagram, TikTok, Shorts) with Claude Code. You give a topic or a script; Claude writes, voices, animates, checks its own frames, adds real sound effects and exports the mp4. You approve at three gates, and a person posts.

Each person runs the kit on their own computer with their own Claude Code account and their own keys. Nothing in this repo holds a key, a photo of anyone or any client data.

> **Quick start.** 1) Download this kit. 2) Open Claude Code in its folder and say "set up the reel kit". 3) Type **`/brand-setup`** to make your brand's folder. 4) Open that folder and ask for a reel. Step by step: [Start here](#start-here-if-you-have-never-done-this-before).

> **License.** Free to use, including for paid client work, under the [BagelUnit Reel Kit License](LICENSE). The videos you make are yours. Please do not resell, re-upload or repackage the kit.

## What you get

**Three styles.** Claude always asks which one before it starts a reel.

| Style | Best for | Look |
|---|---|---|
| **Print** | tips, tools, lists, opinions, news | a riso-print look on warm paper, big condensed captions, a presenter who points and reacts |
| **3D** (`depth`) | "what happens inside" explainers | lit 3D rooms and props, a camera that travels with the story |
| **Talking head** (`talking`) | your own face video | tightened pauses, cut layouts, word-by-word captions and graphics |

**Sticker presenter (add-on, Print style).** Instead of the kit's drawn presenter, a print reel can show your own character as die-cut stickers: 19 poses (idle, point, thumbs, shock, counting one to five, and more) that pop in on the words you choose. You make the poses once per brand; see [docs/avatar.md](docs/avatar.md).

**Real-sound step (add-on).** The engine's built-in effects are synthesised and can sound fake. After export, `realsound.py` swaps them for real CC0 recordings, snaps every hit to the frame where the motion lands, mixes to -14 LUFS with the voice on top, and listens to the result with earshot. See [docs/sound.md](docs/sound.md).

**A brand workspace.** Each brand gets its own folder. Type `/brand-setup` in the kit's folder: it makes the folder and runs a short brand setup (your name, the brand, handle, colours, logo, fonts, presenter, voice, call to action, kit updates, a private history, and how many reels a week), and keeps that brand's rules, voice and cleared facts in its `brand/`. Inside a brand folder, `/brand-setup` changes the answers any time.

**Checks on every reel.** Claude fact checks the script before you approve it (before any voice credits are spent) and again on the final: a fresh reader re-reads every source, and a claim it cannot back up is flagged. `kit qa` checks the finished file (format, loudness, black or frozen stretches, and whether the first word lines up with the first sound), `/reel-review` writes a one-line verdict (meets the bar, close, or not ready), and each approval is tied to the file's fingerprint, so a change after approval shows up.

**Clickable choices.** Every setup question and every approval is a question block: you click an option, or pick "Other" and type your own answer.

**A weekly posting plan.** Setup asks how many reels a week you want to post. Claude plans at most that many in one sitting, and you still approve each reel on its own.

**Posting help.** Once you approve the final, `/reel-posting` gives you a posting card (the file, the cover, the caption ready to copy, the quality setting and a suggested time). It can also help you schedule a reel, or set up automatic posting step by step with [`template/docs/auto-post.md`](template/docs/auto-post.md). Nothing is posted unless you connected a publisher yourself and said yes to that reel's time.

**Comment auto-reply.** `/comment-responder` walks you through connecting a "comment a keyword, get a DM" reply for your brand, one step at a time ([`template/docs/auto-reply.md`](template/docs/auto-reply.md)). It stays off until you have tested it from a second account and turned it on.

**Your numbers after posting.** Tell Claude "add my numbers" and it keeps one row per posted reel in `brand/insights.csv`, then `/analytics-readout` says what to make more of and what to stop, against your own results. Once 8 of your posted reels have numbers, `/reel-predict` can estimate how a new draft will hold viewers before you post it. See [`template/docs/after-posting.md`](template/docs/after-posting.md).

**One-command updates.** Say "update the kit" in a brand workspace: `/kit-update` shows what changed, previews, updates the workspace without touching your brand's files, and offers to update the engine too. It works even if you downloaded the kit as a ZIP.

## Requirements

- **macOS, Windows or Linux.** One installer for all three. It needs [Node.js](https://nodejs.org) 22 or newer to start, and it installs or asks for the rest (ffmpeg, Python 3, git, uv, Whisper) using Homebrew on Mac, winget on Windows, and apt or pacman on Linux. It always shows you a command and asks before installing a program, and never runs anything as administrator by itself.
- **Claude Code** on a paid plan (Pro or Max), signed in with your own account. A reel takes Claude roughly 30 to 80 minutes of work. If your plan's usage limit stops Claude partway, nothing is lost: see "If Claude stops partway" in [`template/docs/first-reel.md`](template/docs/first-reel.md).
- An **ElevenLabs** account and API key of your own for the voice. The free plan is fine for trying the kit, but ElevenLabs allows only non-commercial use on it, with credit to ElevenLabs. For a business's or a client's reels, use a paid plan (Starter or higher; check ElevenLabs' current terms). Your key stays on your computer in `~/.config/bagelunit-reels/elevenlabs.key`; you put it there yourself, and it never goes in a chat or in this repo.
- About 3 GB of disk for the render browser, the sound library and earshot's models.

**What it costs you.** The kit itself is free. You pay for your own Claude plan and, for business use, an ElevenLabs paid plan. A 40-second voiced reel uses about 750 ElevenLabs credits, and Claude shows the number before any are spent. A talking-head reel uses your own voice, so it needs no voice credits. The outlier scan with Apify is optional and paid per result (see [SETUP.md](SETUP.md)); it stays off unless you turn it on.

## Quick start

```bash
git clone https://github.com/bagelunit/bagelunit-reel-kit.git ~/dev/bagelunit-reel-kit
cd ~/dev/bagelunit-reel-kit
bash setup/install.sh          # macOS and Linux. Safe to run again; prints every step
```

On Windows, in PowerShell: `node setup/install.mjs` (it works on every system). Use `python` where this kit says `python3`, and `.\` paths instead of `~/` shortcuts if your shell needs them.

## Start here (if you have never done this before)

You do not need to be technical. You give Claude Code a few messages, and it does the rest. These are the steps, in order.

**Before you begin** (about 15 minutes, once):
1. Install **Node.js** from https://nodejs.org (choose the "LTS" download and accept the defaults).
2. Install **Claude Code** and sign in with your own Claude account (Pro or Max): https://claude.com/claude-code
3. Make an **ElevenLabs** account at https://elevenlabs.io (the free plan is enough to try the kit; for a business or a client you need a paid plan, see Requirements above). It is the voice for your reels. You will save its key later; Claude shows you how.
4. **Download this kit.** On this page click the green **Code** button, then **Download ZIP**, and unzip it somewhere easy (for example your home folder). Or, if you know git: `git clone https://github.com/bagelunit/bagelunit-reel-kit.git`.

**Then send three messages to Claude Code.** The first two go in the kit's folder, the third in your brand's folder (Message 2 makes it). To open Claude Code in a folder: open a terminal there, type `claude` and press Enter (or in VS Code: File, Open Folder, then open Claude Code).
- *Mac:* open Terminal, type `cd ` (with a space), drag the folder from Finder into the window, press Enter, then type `claude`.
- *Windows:* open the folder in File Explorer, click the address bar, type `powershell`, press Enter, then type `claude`.

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
1. Run the installer for my system (bash setup/install.sh on Mac and Linux, node setup/install.mjs on Windows). If it lists a missing program, show me each exact command and ask before running it; only re-run with --yes after I agree.
2. The Kenney sound packs need my own web browser and terminal, so skip them here. At the end, tell me the exact command to run myself to add them, and remind me that reels still work without them.
3. Never ask for, print or search for any key or password. Tell me the exact file location where my ElevenLabs key goes and how to create that file, and let me do it myself.
4. If something needs me to close and reopen the terminal window, say so before moving on.
5. When it finishes, run the checkup and give me two lists in order: what is working, and what I still have to do myself.

Do not make any reel or brand folder yet. End by telling me what to do next.
```

**What goes in each blank**
- **My system:** Apple computer = Mac; Windows laptop or PC = Windows. If you are unsure, Claude can tell from the installer.
- **Node.js installed:** not sure? Say "not sure". Claude checks by running `node --version`; a number like `v22.1.0` (22 or higher) means yes.
- **Claude plan, ElevenLabs:** tells Claude how many credits to expect and whether to walk you through making an account.

### Message 2: set up a brand (once per brand)

In the same kit folder, type **`/brand-setup`** and press Enter. Claude asks the brand's name and where its folder should go (it suggests `~/Reels/<brand>`), makes that folder for you, then asks about the brand with clickable questions: your name, handle, colours, logo, fonts, presenter, voice and call to action. At the end it tells you how to open the new folder.

Every brand gets its own folder, so brands never mix. Run `/brand-setup` again in the kit folder for each new brand. Inside a brand's folder, `/brand-setup` changes that brand's answers. (Doing it by hand also works: copy the `template` folder, open Claude Code in the copy, and paste the "Set up this brand" message from [`template/docs/prompts.md`](template/docs/prompts.md).)

### Message 3: make a reel (every time)

Open Claude Code in the brand folder `/brand-setup` made (in VS Code: File, Open Folder), and paste the "Make a reel" message from the same file. It has blanks for the topic, the one goal, the style, the facts you allow, and something only you can say, plus a filled-in example. Claude asks which style you want, writes hooks and the script, fact checks it, and shows you what the voice will cost. Then it stops three times for your yes (script, visual plan, final video), each time with a clickable approval. It never posts anything for you unless you connected a publisher yourself and approve each reel's time.

When you are ready for results, the same file also has a message for reading your numbers after posting and one for planning a week of reels. A walk-through of the first reel is in [`template/docs/first-reel.md`](template/docs/first-reel.md).

The full process, with its three approval gates, is in [docs/process.md](docs/process.md). It is a technical reference for how Claude runs each reel; you do not need to read it to make one.

### After your first reel

- **Your numbers:** a day or more after posting, say "add my numbers" in the brand folder. Where to find each number in Instagram: [`template/docs/after-posting.md`](template/docs/after-posting.md).
- **Comment auto-reply (optional):** [`template/docs/auto-reply.md`](template/docs/auto-reply.md), or ask Claude to set it up with you (`/comment-responder`).
- **Automatic posting (optional):** [`template/docs/auto-post.md`](template/docs/auto-post.md), or ask Claude (`/reel-posting`).
- **Updates:** say "update the kit" in a brand folder (`/kit-update`).

## What is in the repo

| Path | What it is |
|---|---|
| `studio/` | The reel engine, installed as the Claude Code skill `bagelunit-reels` (`/bagelunit-reels`): three styles, the always-ask-the-style rule, the sticker presenter and the real-sound step. Changes are logged in `studio/LOCAL-CHANGES.md`. |
| `template/` | The generic brand workspace. `/brand-setup` (or `node setup/new-brand.mjs <folder>`) copies it once per brand or project; start Claude Code inside the copy. It is self-contained and carries the licence: `CLAUDE.md` (house rules and first-run setup), `brand/`, `reels/`, `docs/`, and the skills in `.claude/skills/`. |
| `template/docs/` | `first-reel.md` (your first reel, step by step), `prompts.md` (messages to copy and fill in), `after-posting.md` (your numbers), `auto-reply.md` (comment auto-reply and DMs), `auto-post.md` (posting on a schedule), `hook-and-review-playbook.md`, `craft-playbook.md` (what is on screen) and `style-ideas.md` (style concepts not built yet). |
| `template/.claude/skills/` | 23 skills that travel with every copy of the template (nothing global, so brands never mix). Setup and updates: `brand-setup`, `kit-update`. Research and planning: `account-audit` (with the 3x outlier script), `reel-sources`, `reel-analyzer`, `comment-mining`, `going-viral`, `virality`. Hooks and script: `viral-hook-writer`, `hook-mining`, `ab-hook-tester`, `reel-scripter`, `reel-builder`, `humanizer`. Checks: `reel-factcheck`, `reel-review`, `reel-predict`. Finishing and posting: `caption-and-hashtags`, `cover-thumbnail-brief`, `reel-posting`. After posting: `analytics-readout`, `comment-responder`, and the opt-in autopilot `content-factory`. |
| `.claude/skills/brand-setup/` | `/brand-setup` in the kit's folder: the first step after installing. Makes a brand folder with `setup/new-brand.mjs` (a copy of `template/`) and asks the brand questions there. |
| `setup/install.mjs` | The installer (Node, runs on macOS, Windows and Linux). `install.sh` and `install.ps1` are tiny launchers for it. |
| `setup/sync-template.mjs` | Keeps copies current (runs on Mac, Windows and Linux; `sync-template.sh` is a launcher): with no argument it refreshes your generic copy-from folder; with a brand workspace path it shows (then with `--apply` performs) an update of that workspace's kit files without touching its `brand/` or `reels/`. |
| `docs/` | `process.md` (the full loop), `avatar.md` (making sticker poses), `sound.md` (the real-sound step), `reference.md` (what we learned from other reel makers). |
| `setup/scan-repo.mjs` | A safety scan run on every push: keys, private files, banned names, personal paths, em dashes. |
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
  - [instagram-agent-skill](https://github.com/Jakeschincariol/instagram-agent-skill) (MIT) Claude Code plugin,
  - three.js (MIT) and Playwright (Apache-2.0) through `npm install`.

These third-party tools are not ours; we only install and call them.
