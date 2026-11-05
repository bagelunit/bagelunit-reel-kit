# Reel workspace (Susanoo Reel Kit template)

This folder makes Instagram reels for ONE brand. It is a copy of the `template/` folder from the Susanoo Reel Kit: copy the whole folder once per brand (for example `~/Reels/<brand>/`), then start Claude Code inside the copy. The kit itself is installed once per computer by the repo's `setup/install.sh`.

It uses one skill of its own and the installed skills and plugins, as their authors ship them:
- `/brand-setup` (in this folder's `.claude/skills/`): the first-run brand questionnaire below, on demand,
- `/susanoo-reels`, the reel engine installed at `~/.claude/skills/susanoo-reels` (script, voice, animated shots, self-check, export, plus the sticker presenter and the real-sound step),
- `/ig-*` from the **instagram-agent** plugin (research, hooks, scripts, captions, plans, DMs, audits),
- `/hyperframes` from the **hyperframes** plugin (HTML scenes rendered to MP4, optional second engine).

## 0. First-run brand setup (do this before anything else)

At the start of every session, read `brand/brand.json`. If `"name"` is empty, this copy has not been set up yet: before any script, caption, plan or DM, run the questionnaire below (the same steps as `/brand-setup`). If the user asks for a reel first, say in one line that the brand comes first and start the questions.

Ask with multiple-choice questions wherever the answer can be a choice (put a recommended option first), a few questions at a time, never more than four at once. Free-text answers are fine where a choice makes no sense (names, handles, paths). Never guess an answer and never fill a field the user did not confirm.

1. **You:** the user's own name, and whether they are the person who approves reels (if not, the approver's name).
2. **The brand:** company or client name, and a short slug for folders (suggest one from the name, lowercase with dashes).
3. **Instagram handle:** for example `@yourhandle` (offer "no account yet" as a choice).
4. **Colours:** the accent colour as a hex code (offer to read it from a logo or brand guide if they give a path), plus background and ink if they have them. Offer the kit's ready themes as choices: studio (warm white + vermilion), harbor (deep blue), ochre (warm gold), ink (black and white), or "my own accent".
5. **Logo:** the path to the logo file (PNG or SVG). Check the file exists; if it does not, ask again or leave it empty.
6. **Fonts:** display and body fonts (choices: "use the kit's fonts", "my brand fonts: ...").
7. **Presenter:** sticker avatar or no host. Choices: "Sticker avatar (I have a pose folder)", "Sticker avatar (make one later, see the kit's docs/avatar.md)", "No host", "The kit's drawn presenter". For a pose folder, ask for its path and check which of the 19 pose names it holds (idle, point, guns, thumbs, shock, shrug, think, wave, magnifier, open, tshirt, one, two, three, four, five, celebrate, facepalm, raise); list any missing ones.
8. **Voice:** choices: "Pick an ElevenLabs voice together now", "Use the voice already saved in the kit", "My own recorded voice", "Decide later". Also ask for words the generated voice must never say (for example a brand name it mispronounces) and how to spell any tricky name by sound.
9. **Call to action:** choices: "Save this" (recommended until a DM auto-reply is tested), "Follow for more", "Comment a keyword for a DM" (only listed in `cta.tested_keywords` once the auto-reply has been tested from a second account), "Visit the link in bio".

Then write the answers:
- `brand/brand.json`: name, slug, handle, `people`, `identity.logo` (and the other identity paths if given), `colors`, `fonts`, `host` (`enabled`, `type` = `stickers`, `drawn` or `none`, `poses_dir`), `voice` (`style`, `never_say`, `pronunciation`, and `voice_id`/`voice_name` once a voice is chosen), `cta.style`. Leave `engine_dir` and `work_dir` as they are unless the user asks.
- `brand/voice.md`: fill the "Who I am" lines from the answers. Leave the rest for the user (or offer to draft it from three of their own captions).
- `brand/facts.md`: only facts the user states and confirms in this conversation, each with its source. If they give none, leave the table empty and say so. Never add a number, result, price or client name from your own knowledge or from the web.
- If the user wants the handle and accent colour as the kit's defaults for every new reel, the kit stores them in `~/.config/susanoo-reels/config.json` through its own setup; otherwise set them per reel in `reel.json`.

Rename, move or create nothing outside this folder. Never ask for, print or store an API key; keys go in `~/.config/susanoo-reels/` and the user puts them there themselves. Finish with a short summary of what was written and anything still empty.

## 1. The brand

- Everything this copy makes is for the brand described in `brand/`. Never use another brand's facts, voice, swipe file or log.
- If `brand/brand.json` is still empty (`"name": ""`), run section 0 first.
- `brand.json` → `identity` points at the brand's own identity files (logo, brand guide, colours, fonts, photos) wherever they live. Read them from there; do not copy them in unless the owner asks.
- The `/ig-*` skills read and write `~/.claude/instagram/` (voice.md, swipe.md, plan.md, log.md). In this copy, use `brand/` instead, so each brand keeps its own files.

| File in `brand/` | What it holds | Written by |
| --- | --- | --- |
| `brand.json` | name, handle, people, identity paths, colours, fonts, host (sticker poses or none), voice settings, CTA style and tested keywords, work folder | user + Claude at first-run setup |
| `voice.md` | who we talk to, how we sound, positions, off limits | user + Claude at setup |
| `facts.md` | the ONLY claims, numbers and results allowed on screen, in the voice or in captions | owner only (Claude may propose, owner confirms) |
| `swipe.md` | research outliers (3x rule) | `/ig-viral` |
| `plan.md` | this week's posts | `/ig-plan` |
| `log.md` | what was posted, with hook formula and first line | `/ig-reel` after the owner confirms |

## 2. Where files go

- **Light files** (scripts, plans, approvals, captions, the finished mp4) live in this copy: `reels/<slug>/`.
- **Heavy files** (frames, drafts, renders, node_modules) should stay out of iCloud-synced folders (Desktop and Documents sync). HyperFrames projects go in `brand.json` → `work_dir` (default `~/dev/reel-work/<slug>/`), using the pinned CLI at `engine_dir` (`~/dev/reel-engine/`). The Susanoo Reel Kit writes its build files inside `reels/<slug>/`: if this copy sits in an iCloud folder, tell the owner before the first render.

## The render engines

- **Always ask the style first.** Before starting any reel, ask the owner which style to use: Print, 3D, or Talking head (only if there is a video of them). One multiple-choice question, recommendation first. Never pick a style silently.
- `/susanoo-reels` builds reels into `reels/<slug>/` of the folder Claude was started in, and keeps its own settings in `~/.config/susanoo-reels/`. Follow its `KIT.md`; its approval points come in addition to the gates below.
- `/hyperframes`: run the CLI with `HYPERFRAMES_NO_TELEMETRY=1`. Local only: never use `hyperframes publish`, cloud rendering, HeyGen sign-in or paid HeyGen models without the owner's explicit OK for that reel.
- **Sticker presenter (print only):** when `brand.json` → `host.type` is `stickers`, set the reel's `reel.json` `"presenter": {"type": "stickers", "dir": "host", "cues": [[word, pose, nth], ...]}` and link or copy `host.poses_dir` to the reel's `host/` folder. Check each cue's occurrence number against `build/word_index.txt`. With `host.type` `none`, turn the presenter off.
- **Real sound:** after `kit export`, run the kit's real-sound step (`KIT.md` section G step 5) so the effects are real recordings, not synthesised ones. Report its numbers honestly.
- **Cover:** every reel gets a dedicated cover: a still-only cover scene with a big topic title, a prop that shows the subject, the presenter if any and the handle, kept inside the centre 1080x1440 grid band. Never a frame grabbed from the hook.
- Before any final render the approver has seen the stills (Gate B). The finished mp4 ends up in `reels/<slug>/out/`.

## 3. House rules (they override the skills)

1. **Facts.** Every number, result, price, client name or claim in a script, on-screen text, caption, comment or DM must be in `brand/facts.md`. If it is not there, write `{{needs cleared fact}}` and flag it. Never invent, estimate or round up a claim.
2. **No price or offer claims** unless `facts.md` marks them as cleared for public use.
3. **Banned characters and words** from `brand.json` → `writing` (by default no em dashes). Run `/ig-human`'s detector on any text before handing it over.
4. **Keyword CTA** ("Comment WORD") only when WORD is listed in `brand.json` → `cta.tested_keywords`, meaning the DM auto-reply was tested from a second account. Otherwise end on a save or follow ask, and say why.
5. **Generated voices** never say any word in `brand.json` → `voice.never_say`; show it as on-screen text instead. Spell tricky words by sound using `voice.pronunciation`.
6. **DMs.** `/ig-dm` writes replies to people who raised their hand (commented a keyword, messaged the brand, replied to a story). No cold DMs to strangers.
7. **Research.** `/ig-viral` reads reels in the browser at human speed, with the owner present. No scraping services, and Claude never logs in with the brand's password.
8. **Copy formulas, never videos.** Hook shape, structure and length only. Never another creator's script, colours, mascot, characters or prompts.
9. **Rights.** No other company's logos, footage, music or characters unless the brand owns the rights.
10. **Approval gates (the approver in `brand.json` → `people` approves, usually the workspace owner, also for client brands):**
    - Gate A: script. No voice credits are spent before this.
    - Gate B: visual plan (concept card + shot cards).
    - Gate C: the final video.
    Record each approval with the date in `reels/<slug>/approvals.md`.
11. **Nothing is posted, scheduled or sent by Claude.** A person posts.

## 4. Map

- `brand/`: this brand's identity, voice, cleared facts, research and log.
- `reels/<slug>/`: one folder per reel (script, plan, approvals, caption, `out/` with the final mp4).
