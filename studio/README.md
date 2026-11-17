# BagelUnit Reel Kit · studio

The engine room of the kit. It is installed once as the `bagelunit-reels` skill (`~/.claude/skills/bagelunit-reels`); you do not make reels in this folder.

**What it makes:** finished 1080×1920 reels. It writes the script or uses yours, records the voice, builds and animates every shot, reviews its own frames and exports an mp4. Or it edits a video of you talking.

**Where reels are made:** in a brand folder, which `/brand-setup` creates from the kit's `template/`. Open Claude Code in that folder and type `/bagelunit-reels` with your topic.

| Style | Use it for |
|---|---|
| Print (`print`) | tips, tools, lists and takes in a riso-print look (engraved shading, one accent ink), with a sticker host you can make look like you (`/sticker-host` in a brand folder) |
| 3D (`depth`) | 3D explainers of what goes on inside things, in lit rooms with Bix the boxy host |
| Talking head (`talking`) | your own face take, cut and captioned with graphics on top |
| Scene styles | drawn looks from `styles/` (stick figure, map, comic book and more); `kit scene list` names them |

- **Your brand everywhere:** four themes (studio, harbor, ochre, ink) or any accent colour, plus your handle.
- **Any language:** fonts for other scripts download when needed.
- **Checks before you see it:** a motion check, a craft check, a file check and three approval gates (script, plan, final video).
- **Runs on your machine:** no extra subscriptions beyond your AI plan and ElevenLabs.

**Start:** from the kit's repo, run `bash setup/install.sh` (Windows: `node setup/install.mjs`) to install the engine, then type `/brand-setup`.

**Map:**

| Folder / file | What it is |
|---|---|
| `KIT.md` | the workflow your AI follows, start to finish |
| `playbook/` | the craft that applies to every style: writing, staging, ideas, self-review, host, delivery |
| `modes/<mode>/` | one self-contained mode each (print, depth, talking): its GUIDE.md, runtime, parts, starter and example shots (listed in each `examples/SHOTS.md`) |
| `styles/` | the scene styles, synced from the styles repo |
| `tools/` | voice, render, checks, gates, mixing, export |
| `SETUP.md` | what each line of the checkup means, and how to fix it |
