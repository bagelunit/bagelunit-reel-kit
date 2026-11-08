---
name: kit-update
description: >
  Update this workspace to the newest BagelUnit Reel Kit, step by step, even if the kit was downloaded as a ZIP:
  check the version, show what changed, download it, preview, apply, then update the engine. Use when the user
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
   will be replaced (a `.bak-<date>` copy is kept) and offer to re-apply it afterwards.
3. **Ask** (question block): "Update this workspace (Recommended)", "Not now".
4. **Apply:** `node .claude/skills/kit-update/update.mjs apply`. Report what changed in two or three lines.
5. **The engine** (`/bagelunit-reels`) is updated once per computer, not per workspace. Ask (question block):
   "Update the engine too (Recommended)", "Later". If yes, run the installer command `apply` printed; it shows each
   step and asks before installing any program. Tell the owner to restart Claude Code afterwards so the new skills
   load.
6. **Other workspaces** (other brands on this computer): offer to update each one the same way, one at a time,
   with `--workspace <folder>`.

## If something fails

- Offline or GitHub unreachable: say so; nothing was changed.
- A workspace without `.kit-version` (made before versions existed): `preview` still works; it shows the newest
  changes only.
- To undo: every replaced file sits next to the new one as `<name>.bak-<date>`.
