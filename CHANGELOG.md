# BagelUnit Reel Kit: what changed

Newest first. The reel engine has its own, older log in `studio/CHANGELOG.md`. To update a brand workspace to the latest kit, see "Updating" in `template/README.md`.

## 1.8.4 (2026-11-09)

- **Update notices are on by default.** `/brand-setup` now recommends "Tell me when a newer kit version is out": once per session Claude reads one public file from GitHub and tells you if a newer kit is out, then `/kit-update` updates it. It never updates anything by itself. New brand folders start with it on; existing brand folders keep the choice they made.

## 1.8.3 (2026-11-09)

- **Every step names its command.** The guides and Claude's own instructions now lead with the command for each step: `bash setup/install.sh`, `/brand-setup`, `/bagelunit-reels` with your topic, `/analytics-readout` with your numbers, `/kit-update`. The longer prompts in `docs/prompts.md` are still there for anyone who wants every blank explained.

## 1.8.2 (2026-11-09)

- **Reels are only made in the brand's `<brand>-reels` folder.** The engine now refuses to start a reel anywhere else (the brand's project folder, the kit's folder, a home folder) and says which folder to open instead. It also refuses a brand folder whose brand is not set up yet, so the kit's blank `template` can never fill up with reels. Brand folders with an older name still work, with a note.
- The README, the brand folder's rules and the engine's steps say the same thing.
- Run `bash setup/install.sh` again (or "update the kit" in a brand folder, then let it update the engine) so the engine gets the new check.

## 1.8.1 (2026-11-09)

- **Brand folders are named `<brand>-reels`.** `/brand-setup` now suggests `~/Reels/<brand>-reels` (for example `bagel-unit-reels`), and every example in the guides uses that name, so a brand's reel folder never looks like the brand's other folders. `setup/new-brand.mjs` always adds `-reels` if the name does not end in it, so `~/Reels/acme` becomes `~/Reels/acme-reels`. Existing brand folders keep their names.

## 1.8.0 (2026-11-08)

- **One first command after installing: `/brand-setup`.** Type it in Claude Code in the kit's folder. It asks the brand's name and where its folder should go (it suggests `~/Reels/<brand>`), makes the folder, asks the brand questions there, and tells you how to open it to make reels. No more copying the `template` folder by hand. The installer now ends by pointing at it.
- **`setup/new-brand.mjs`** makes a new brand folder from the command line on Mac, Windows and Linux: `node setup/new-brand.mjs ~/Reels/my-brand`. It never overwrites a folder that already has files, and never puts a brand inside the kit's own folder.
- **The kit's own folders stay blank.** `/brand-setup` now refuses to fill in the kit's `template/` folder or the generic `Reel Template` folder, and makes a brand folder first.
- **A safe place for your own rules: `CLAUDE.local.md`.** Rules for one brand only (for example "you pick the style for each reel") go in `CLAUDE.local.md` in that brand's folder. Claude Code reads it automatically, and kit updates never touch it, while the workspace's `CLAUDE.md` is replaced by each update. "Update the kit" now offers to move a brand-only change there.
- Existing brand workspaces update with "update the kit" (or `node setup/sync-template.mjs <workspace>` as a dry run, then `--apply`). To get `/brand-setup` in the kit's folder, download the new kit (or `git pull`).

## 1.7.1 (2026-11-08)

- **The ElevenLabs free plan is for trying the kit only.** ElevenLabs allows only non-commercial use on it, with credit to ElevenLabs, so reels for a business or a client need a paid plan. The README has a new "What it costs you" note.
- **Clearer docs for new users.** Every guide was read as a brand-new customer would read it. Copying the template, saving the key on Windows and Linux, and handing over a talking-head video now work as written. A stopped reel picks up again with "carry on with the reel about ...", and brand folders link to guides they can actually open. One name for the presenter and the same reel lengths everywhere.
- **Your approved script is safe.** `kit start` used to replace a `script.txt` already in the reel folder with the sample script. It now keeps it and tells you so.
- **Node.js 22 or newer.** Node 20 reached end of life in April 2026. On Linux, install Node from nodejs.org, because the `nodejs` package from apt is too old on most versions.
- **GitHub checks updated.** The kit's own checks on GitHub moved off the GitHub Actions that ran on Node 20, which GitHub had marked as deprecated, and now test on Node 22.
- Existing brand workspaces update with "update the kit" (or `node setup/sync-template.mjs <workspace>` as a dry run, then `--apply`). Run `bash setup/install.sh` again so the engine gets the script fix.

## 1.7.0 (2026-11-07)

- **New name: BagelUnit Reel Kit** (formerly Susanoo Reel Kit). The engine command is now `/bagelunit-reels`, installed in `~/.claude/skills/bagelunit-reels`, with settings in `~/.config/bagelunit-reels/`. Run the installer again: it copies your old settings and keys over once and tells you which old folder to remove. The licence is now the BagelUnit Reel Kit License; its terms did not change.
- **A review before every final.** New `/reel-review` skill: seven must-pass checks (facts, words, hook, safe areas, handle, sound, honesty), eight scored checks, and one verdict line (meets the bar, close, or not ready) saved with the approval.
- **File checks.** `kit qa` checks the finished file: format, loudness, black or frozen stretches and whether the first word lines up with the first sound. It says plainly which checks it skipped. `kit lint` checks shot grammar (shot length, face time, repeated layouts, cuts in the middle of a word, rhythm, movement in the first second).
- **A second look at the facts.** New `/reel-factcheck` step, twice per reel: on the script before Gate A (before any voice credits) and on the final before Gate C. `kit facts` does the mechanical half (uncleared numbers, missing sources, old clearances, leftover placeholders, absolute wording such as "only", "best" or "faster") and writes a worksheet. Then a fresh reader re-reads every source and rules each claim supported, overstated, not found, changed or unsourced. `kit gate` will not record Gate A or C without a current PASS, and a PASS goes out of date if the script, caption or a facts row changes. The owner can override with `--skip-facts "reason"`, which is written into the record.
- **Every skill tested, and fixed.** All 21 workspace skills were run on a test brand (two more were added after: `/reel-posting` and `/kit-update`, 23 in total). The two that could post, DM, scrape or spend (`/comment-responder`, `/content-factory`) now read the brand's autopilot permissions first and only draft when a permission is off. Other fixes: a keyword call to action only when the keyword was tested, no third-party logos, no unsourced stats or seller prices inside skills, the style question, fact check and credit check before Gate A, a 110 to 125 word script length, the real cover safe area, small-sample warnings, facts-only replies to comments, `hook-mining --metric`, `account-audit --csv`, and clearer paths for `/reel-predict` and `/reel-analyzer`. New empty `brand/log.md` and `brand/swipe.md`. Skills now load from plain requests (tested in live Claude Code sessions: 19 of 20 on the first try), and the workspace rules have a "which skill for which step" table. Brand setup now saves the chosen theme.
- **Posting plan and question blocks.** Brand setup now asks how many reels a week to post and saves it as the brand's weekly batch size (`batch.max_reels`, default 3); goals may repeat in a batch, angles may not. Every setup question, the style question and the autopilot question are asked as clickable question blocks with an "Other" box, never as plain text.
- **Auto-post guide.** `docs/auto-post.md` explains three ways to post approved reels on a schedule (Instagram's own scheduler, a scheduling tool, or your own publisher on Meta's API), with the rule that only the exact file approved at Gate C can go out.
- **Auto-reply guide.** `docs/auto-reply.md` explains how to connect a comment auto-reply and DM for one brand: a no-code tool, or your own small service on Meta's API (one per Instagram handle), with the safety rules that apply either way. The kit itself still sends nothing.
- **Approvals tied to the file.** `kit gate` records each approval and, at Gate C, the final file's fingerprint, so a change after approval shows up.
- **Voice credits protected.** The voice and take tools now remember every paid request. The same request again costs nothing, and a request that may already have been billed is refused until you say so.
- **Estimate before posting, honestly.** `kit measure` gives facts about a video. `kit predict` adds a watch-time and skip-rate estimate only after `kit calibrate` has learned from at least 8 of your own reels' Instagram numbers. Until then it gives measurements and never a prediction. New `/reel-predict` skill explains the results.
- **Craft playbook and ideas.** `docs/craft-playbook.md` covers one world per reel, a through-line that builds, a table of which picture shows which kind of line, and a no-repeat rule. `docs/style-ideas.md` has eight new style concepts to build and test one at a time (concepts only, not modes).
- **Library folders.** `brand/library/` has places for B-roll, product images, components and screens, with an index. The media files stay out of git.
- Existing brand workspaces update with `node setup/sync-template.mjs <workspace>` (dry run), then `--apply`. The engine needs `bash setup/install.sh` again to pick up the new tools.

## 1.6.1 (2026-11-06)

- **A beginner-friendly start, with copy-and-paste prompts.** The README now has a "Start here" guide (what to install, how to open a terminal in a folder) and the first prompt, with every blank explained in plain words. `template/docs/prompts.md` has the set-up-this-brand, make-a-reel (with a filled-in example), after-posting and weekly-batch prompts. A blank you delete becomes a question Claude asks you instead.

## 1.6.0 (2026-11-06)

- **The update script now runs on Windows too** (`setup/sync-template.mjs`; the old `.sh` still works as a launcher). It also keeps each workspace's `.gitignore` current.
- **A first-reel guide and a blank example.** `docs/first-reel.md` walks a new user through a reel in plain steps; `reels/_example/` is a blank pattern for a script, approvals and caption.
- **Voice credit check before Gate A.** `tools/budget.py` counts the script's characters and compares them with the ElevenLabs credits left, so you know before approving.
- **Apify spend log.** Every paid outlier fetch is recorded in `brand/spend.csv`, and the next plan shows the running total.
- **Private history per workspace (optional).** Brand setup can start a local-only history of the brand's files, with a `.gitignore` that keeps keys, renders and audio out. Claude commits after each approved gate and never uploads it.
- **`yt-dlp` help.** The installer now offers it, and a failed download says how to update it.
- **Safer public repo.** A scan on every push checks for keys, private files, banned names, personal paths and em dashes.
- **Releases publish themselves.** Changing `VERSION` on main now creates the GitHub Release from this file.

## 1.5.0 (2026-11-06)

First numbered release of the whole kit.

- **Works on Mac, Windows and Linux.** One installer (`setup/install.mjs`, with `install.sh` and `install.ps1` launchers) asks before installing anything and never runs as administrator by itself. It also downloads the Whisper model when a computer has the tool but no model, which word timing needs.
- **Reel skills now live in the template.** Every brand copy carries its own 17 skills, so brands never mix: hook, script and caption writers, reel teardown, hook and comment mining, A/B hook test, cover brief, readout, humanizer, account audit and reel fetch.
- **Account audit.** Finds the reels that beat an account's own median (the 3x rule) from an export or from Apify. Off unless the brand owner turns on `autopilot.scrape`; the cost is shown first.
- **Reel teardown with eyes and ears.** `reel_fetch.py` turns a video into frames, a timestamped transcript and a `timeline.md` of what is shown and said each second.
- **Hook and review playbook** with the eight-point first-frame hook checklist, one goal and one angle per reel, and a review that finds where viewers drop off.
- **Weekly batch mode** for planning up to three reels at once, each approved separately.
- **Brand setup can read your website** and suggest a name, colours, fonts and handle. Nothing is written until you confirm it.
- **Update tools.** `setup/sync-template.sh` refreshes the generic folder and updates a brand workspace without touching its `brand/` or `reels/`. Each workspace now records the kit version it is on, and can optionally tell you when a newer one is out.
