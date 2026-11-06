# Susanoo Reel Kit: what changed

Newest first. The reel engine has its own, older log in `studio/CHANGELOG.md`. To update a brand workspace to the latest kit, see "Updating" in `template/README.md`.

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
