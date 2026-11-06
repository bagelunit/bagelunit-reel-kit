# Susanoo Reel Kit (repo)

This folder is the kit's source, not a place to make reels.

- **"Set up the reel kit" / first time on this computer:** run `bash setup/install.sh` (Mac, Linux) or `node setup/install.mjs` (any system, including Windows) and walk the user through anything it marks as NOTE, using `SETUP.md`. Never ask for, print or store an API key; the user puts their ElevenLabs key in `~/.config/susanoo-reels/elevenlabs.key` themselves.
- **Making a reel:** reels are made in a copy of `template/` (one copy per brand), not here. Offer to copy it (for example `cp -R template ~/Reels/<brand>`), then tell the user to start Claude Code inside the copy, where the first-run brand setup begins.
- **Changing the template:** after any change under `template/`, run `bash setup/sync-template.sh` to refresh the generic copy-from folder, and tell the user that each existing brand workspace needs `bash setup/sync-template.sh <workspace>` (dry run) then `--apply`. Never run it on a brand workspace without showing the dry run first.
- **Changing the engine:** `studio/` is the engine installed as `~/.claude/skills/susanoo-reels`. Record every change to it in `studio/LOCAL-CHANGES.md`. After a change, the user re-runs `bash setup/install.sh` (or used `--link`).
- **Docs:** `docs/process.md`, `docs/avatar.md`, `docs/sound.md`, `docs/reference.md`. No em dashes in anything written here.
- **Never commit** keys, `.env` files, photos of people, avatar poses, client data, renders, audio or `node_modules`. Never change this repo's visibility.
