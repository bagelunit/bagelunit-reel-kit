# Susanoo Reel Kit

Make ready-to-post vertical reels (1080x1920, Instagram, TikTok, Shorts) with Claude Code. You give a topic or a script; Claude writes, voices, animates, checks its own frames, adds real sound effects and exports the mp4. You approve at three gates, and a person posts.

Each person runs the kit on their own computer with their own Claude Code account and their own keys. Nothing in this repo holds a key, a photo of anyone or any client data.

> **License.** Free to use, including for paid client work, under the [Susanoo Reel Kit License](LICENSE). The videos you make are yours. Please do not resell, re-upload or repackage the kit.

## What you get

**Three styles.** Claude always asks which one before it starts a reel.

| Style | Best for | Look |
|---|---|---|
| **Print** | tips, tools, lists, opinions, news | a riso-print look on warm paper, big condensed captions, a presenter who points and reacts |
| **3D** (`depth`) | "what happens inside" explainers | lit 3D rooms and props, a camera that travels with the story |
| **Talking head** (`talking`) | your own face video | tightened pauses, cut layouts, word-by-word captions and graphics |

**Sticker presenter (add-on, Print style).** Instead of the kit's drawn presenter, a print reel can show your own character as die-cut stickers: 19 poses (idle, point, thumbs, shock, counting one to five, and more) that pop in on the words you choose. You make the poses once per brand; see [docs/avatar.md](docs/avatar.md).

**Real-sound step (add-on).** The engine's built-in effects are synthesised and can sound fake. After export, `realsound.py` swaps them for real CC0 recordings, snaps every hit to the frame where the motion lands, mixes to -14 LUFS with the voice on top, and listens to the result with earshot. See [docs/sound.md](docs/sound.md).

**A brand workspace.** `template/` is copied once per brand. On first use Claude runs a short brand setup (your name, the brand, handle, colours, logo, fonts, presenter, voice, call to action) and keeps that brand's rules, voice and cleared facts in `brand/`. Run it again any time with `/brand-setup`.

## Requirements

- **macOS, Windows or Linux.** One installer for all three. It needs [Node.js](https://nodejs.org) 18 or newer to start, and it installs or asks for the rest (ffmpeg, Python 3, git, uv, Whisper) using Homebrew on Mac, winget on Windows, and apt or pacman on Linux. It always shows you a command and asks before installing a program, and never runs anything as administrator by itself.
- **Claude Code** on a paid plan (Pro or Max), signed in with your own account. A reel takes Claude roughly 30 to 80 minutes of work.
- An **ElevenLabs** account and API key of your own for the voice (the free plan covers a few reels a month). Your key stays on your computer in `~/.config/susanoo-reels/elevenlabs.key`; you put it there yourself, and it never goes in a chat or in this repo.
- About 3 GB of disk for the render browser, the sound library and earshot's models.

## Quick start

```bash
git clone https://github.com/bagelunit/susanoo-reel-kit.git ~/dev/susanoo-reel-kit
cd ~/dev/susanoo-reel-kit
bash setup/install.sh          # macOS and Linux. Safe to run again; prints every step
```

On Windows, in PowerShell: `.\setup\install.ps1` (or `node setup/install.mjs` on any system). Use `python` where this kit says `python3`, and `.\` paths instead of `~/` shortcuts if your shell needs them.

## The first prompts to send

You only ever type three things to Claude Code. Each goes in a different folder.

| Where you open Claude Code | Send this | What happens |
|---|---|---|
| In this repo folder (`cd ~/dev/susanoo-reel-kit && claude`) | `Set up the reel kit on this computer.` | Claude runs the installer, explains anything it marks as a NOTE, and tells you where to put your ElevenLabs key. You can skip this and run the installer yourself (above). |
| In a copy of `template/` for one brand (`cp -R template ~/Reels/my-brand`, then `cd ~/Reels/my-brand && claude`) | `Set up this brand.` (or type `/brand-setup`) | A short set of questions: your name, the brand, handle, colours, logo, fonts, voice and call to action. It starts on its own the first time, whatever you send. |
| In that same brand folder, once it is set up | `Make a reel on <your topic>.` for example `Make a reel on why hotels put mints on the pillow.` | Claude asks the style, writes the script, and stops at three approval gates. You post it yourself. |

Before the first reel, put your ElevenLabs key in `~/.config/susanoo-reels/elevenlabs.key` (one line; [SETUP.md](SETUP.md) shows how) and keep the copy outside iCloud if you can. New to it? `template/docs/first-reel.md` walks through the first reel.

The full process, with its three approval gates, is in [docs/process.md](docs/process.md).

## What is in the repo

| Path | What it is |
|---|---|
| `studio/` | The reel engine, installed as the Claude Code skill `susanoo-reels` (`/susanoo-reels`): three styles, the always-ask-the-style rule, the sticker presenter and the real-sound step. Changes are logged in `studio/LOCAL-CHANGES.md`. |
| `template/` | The generic brand workspace. Copy it once per brand or project and start Claude Code inside the copy. It is self-contained and carries the licence: `CLAUDE.md` (house rules and first-run setup), `brand/`, `reels/`, `docs/` (the hook and review playbook), and the reel skills in `.claude/skills/`. |
| `template/.claude/skills/` | 17 reel skills that travel with every copy of the template (nothing global, so brands never mix): hook writer, script, caption, teardown, account audit with the 3x outlier script, hook mining, comment mining, A/B test, cover brief, readout, and the opt-in autopilot skills. |
| `setup/install.mjs` | The installer (Node, runs on macOS, Windows and Linux). `install.sh` and `install.ps1` are tiny launchers for it. |
| `setup/sync-template.mjs` | Keeps copies current (runs on Mac, Windows and Linux; `sync-template.sh` is a launcher): with no argument it refreshes your generic copy-from folder; with a brand workspace path it shows (then with `--apply` performs) an update of that workspace's kit files without touching its `brand/` or `reels/`. |
| `docs/` | `process.md` (the full loop), `avatar.md` (making sticker poses), `sound.md` (the real-sound step), `reference.md` (what we learned from other reel makers). |
| `setup/scan-repo.mjs` | A safety scan run on every push: keys, private files, banned names, personal paths, em dashes. |
| `SETUP.md` | Setup by hand, step by step, and common snags. |

**Settings and keys** live in `~/.config/susanoo-reels/` on each computer, never in the repo. Upgrading from an install made before the rename? `setup/install.sh` copies your old settings folder over once and tells you which old skill folder to remove.

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
