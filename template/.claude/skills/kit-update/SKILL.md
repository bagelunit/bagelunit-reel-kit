---
name: kit-update
description: >
  Update this workspace to the newest BagelUnit Reel Kit, step by step, even if the kit was downloaded as a ZIP:
  check the version, show what changed, download it, preview, apply, then update the engine by itself. Use when the user
  says "update the kit", "is there a new version", "check for updates", "upgrade", or when the start-of-session
  version check found a newer kit.
user-invokable: true
argument-hint: "[check | preview | apply]"
metadata:
  author: BagelUnit
  version: "1.0.0"
  category: setup
---

# Kit update: newest kit, nothing of yours lost

Ask every choice with a question block (AskUserQuestion). The tool is `.claude/skills/kit-update/update.mjs`
(run with `node`). It reads and downloads only the public kit from GitHub, needs no key, and never changes this
brand's data (`brand/` values, `reels/`): it adds new settings and missing starter files only.

## Steps

One question, one command. The session-start note ("A newer BagelUnit Reel Kit is out" or "the engine is behind")
is what usually brings the owner here.

1. **Check:** `node .claude/skills/kit-update/update.mjs check`. If it says UP TO DATE, say so in one line, run
   `node .claude/skills/kit-update/update.mjs now` anyway if the session-start note said the engine is behind (it
   updates only the engine), and stop.
2. **Ask once** (question block): "Update now (Recommended)", "Show me what changed first", "Not now". On "show me",
   run `preview` (downloads the kit once into `~/.bagelunit-reel-kit/<version>/`, prints the changelog entries since
   this workspace's version and the files that would be added or replaced), summarise it in plain words, then ask
   again.
3. **Update:** `node .claude/skills/kit-update/update.mjs now`. It prints what changed, updates this workspace
   (every replaced file is kept next to the new one as `<name>.bak-<date>`, and `brand/` values and `reels/` are
   never touched), then updates the engine (`/bagelunit-reels`) when it is older than the kit by running the kit's
   installer without the program, plugin and sound-library steps. Report it in two or three lines. If the owner
   changed `CLAUDE.md`, a skill or the publisher's code (`publisher/src`, `publisher/scripts`, `publisher/test`) for this brand only, say that the change was replaced (the `.bak` copy is kept) and
   offer to move it into `CLAUDE.local.md` (rules for this brand only; updates never touch it).
4. **Restart:** if it printed "The engine is updated", tell the owner to restart Claude Code so the new engine and
   skills load. A linked engine (installed with `--link`) follows its kit folder and is left alone. If it says the
   engine update did not finish, show the command it printed and what the installer said. `--no-engine` skips the
   engine; `update.mjs engine` runs only that step.
5. **Other workspaces** (other brands on this computer): offer to update each one the same way, one at a time, with
   `--workspace <folder>`. The engine is already current by then, so only the workspace changes.

The once-a-day check for a newer kit reads one public file on GitHub (the newest version number) and nothing else. To
turn it off, set `"updates": { "check": false }` in `brand/brand.json`.

## If something fails

- Offline or GitHub unreachable: say so; nothing was changed.
- A workspace without `.kit-version` (made before versions existed): `preview` still works; it shows the newest
  changes only.
- To undo: every replaced file sits next to the new one as `<name>.bak-<date>`.
