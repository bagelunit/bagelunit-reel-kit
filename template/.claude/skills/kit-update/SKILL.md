---
name: kit-update
description: >
  Update this workspace to the newest BagelUnit Reel Kit, step by step, even if the kit was downloaded as a ZIP:
  check the version, show what changed, download it, preview, apply, then update the engine by itself. Use when the user
  says "update the kit", "is there a new version", "check for updates", "upgrade", or when the start-of-session
  version check found a newer kit or a newer build of the same version.
user-invokable: true
argument-hint: "[check | preview | apply]"
metadata:
  author: BagelUnit
  version: "1.0.0"
  category: setup
---

# Kit update: newest kit, nothing of yours lost

Trigger: "update the kit" or the start-of-session notice. Inputs: none. Outputs: this workspace and the engine on the newest build. Next step: carry on with the reel you were making.

The kit's version (`.kit-version`) changes only for a release; smaller changes come as newer builds of the same version
(`.kit-build`, a time and a fingerprint). `update.mjs` treats a newer build as an update: `check` says "a newer build of
<version> is out", `now` downloads that build fresh (`~/.bagelunit-reel-kit/<version>+<fingerprint>/`), shows the
version's changelog entry, updates this workspace, and updates the engine only when the engine itself changed.

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
   this workspace's version and the files that would be added, replaced, merged or in conflict), summarise it in plain words, then ask
   again.
3. **Update:** `node .claude/skills/kit-update/update.mjs now`. It prints what changed, updates this workspace, then
   updates the engine (`/bagelunit-reels`) when it is older than the kit by running the kit's installer without the
   program, plugin and sound-library steps. `brand/` values and `reels/` are never touched. Your edits to kit files
   are **merged, not lost**: the workspace keeps a pristine copy of every kit file in `.kit-base/` (tracked in git,
   never edited by hand), and an update compares your file, that copy and the new kit file. The output has three
   groups; report them in plain words, two or three lines:
   - **Replaced:** you had not edited the file, so it is now the kit's new one (the old one is kept as
     `<name>.bak-<date>`).
   - **Merged (your changes kept):** you edited a file and the kit changed it too, in different places, so both
     changes are in it (the old one is kept as `.bak`). Offer to open one if the owner wants to look.
   - **Conflicts:** you and the kit changed the same lines. Your file is **left exactly as it was**, and the kit's new
     version is written next to it as `<name>.kit-new`. Show both files, merge them with the owner (keep their edit,
     take the kit's change), then delete the `.kit-new` file. Until then the file works as before but misses the kit's
     change. `.gitignore` keeps your own lines and gains the kit's new ones.
   - **No saved base yet** (the first update after the kit started saving it, or a workspace made before): that run
     cannot merge, so a file you edited was replaced (the `.bak` copy has your edit). It lists those files; offer to
     re-apply the edit from the `.bak` (or move a brand-only rule into `CLAUDE.local.md`). From the next update on,
     your edits merge. Commit `.kit-base/` with the rest if this folder is a git repo.
   The preview shows the same three groups and predicts merges and conflicts exactly.
4. **Restart:** if it printed "The engine is updated", tell the owner to restart Claude Code so the new engine and
   skills load. A linked engine (installed with `--link`) follows its kit folder and is left alone. If it says the
   engine update did not finish, show the command it printed and what the installer said. `--no-engine` skips the
   engine; `update.mjs engine` runs only that step.
5. **Other workspaces** (other brands on this computer): offer to update each one the same way, one at a time, with
   `--workspace <folder>`. The engine is already current by then, so only the workspace changes.

The once-a-day check for a newer kit reads two small public files on GitHub (the newest version number and the build stamp) and nothing else. To
turn it off, set `"updates": { "check_on_start": false }` in `brand/brand.json` (`/brand-setup` asks this).

## If something fails

- Offline or GitHub unreachable: say so; nothing was changed.
- A workspace without `.kit-version` (made before versions existed): `preview` still works; it shows the newest
  changes only.
- To undo: every file an update replaced or merged sits next to the new one as `<name>.bak-<date>`.
- A `.kit-new` file left over from an earlier conflict is only the kit's version of that file at the time; delete it once merged.
