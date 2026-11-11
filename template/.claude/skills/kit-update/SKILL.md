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

1. **Check:** `node .claude/skills/kit-update/update.mjs check`. If it says UP TO DATE, say so in one line and stop.
2. **Show what changed:** run `preview`. It downloads the kit (into `~/.bagelunit-reel-kit/<version>/`, once) and
   prints the changelog entries since this workspace's version, then the list of files that would be added or
   replaced and the settings `brand.json` would gain. Summarise in plain words: what is new for this brand, and
   which files get replaced. If the owner changed `CLAUDE.md` or a skill for this brand only, warn that the change
   will be replaced (a `.bak-<date>` copy is kept) and offer to move it into `CLAUDE.local.md` (rules for this
   brand only; Claude Code reads it automatically and updates never touch it) instead of re-applying it.
3. **Ask** (question block): "Update this workspace (Recommended)", "Not now".
4. **Apply:** `node .claude/skills/kit-update/update.mjs apply`. Report what changed in two or three lines.
5. **The engine** (`/bagelunit-reels`) is updated once per computer, and `apply` does it by itself when it is older
   than the kit: it runs the kit's installer (without the program, plugin and sound-library steps) and prints
   "The engine is updated" or why it did not. Do not ask the owner a question about it. Report the line, and tell
   the owner to restart Claude Code so the new engine and skills load. A linked engine (installed with `--link`)
   follows its kit folder and is left alone. If it says the update did not finish, show the owner the command it
   printed and what the installer said. `--no-engine` skips it; `update.mjs engine` runs only this step.
6. **Other workspaces** (other brands on this computer): offer to update each one the same way, one at a time,
   with `--workspace <folder>`.

## If something fails

- Offline or GitHub unreachable: say so; nothing was changed.
- A workspace without `.kit-version` (made before versions existed): `preview` still works; it shows the newest
  changes only.
- To undo: every replaced file sits next to the new one as `<name>.bak-<date>`.
