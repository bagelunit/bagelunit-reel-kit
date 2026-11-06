# Reel workspace (Susanoo Reel Kit template)

This folder is generic. It holds no brand until you set one up inside the copy you make.

**To use it for a brand or project:**
1. Copy this whole folder once per brand or project, for example `cp -R template ~/Reels/<brand>`.
2. Start Claude Code inside the copy. With an empty `brand/brand.json` it runs the first-run brand setup (or run `/brand-setup`).
3. Make reels from there. Everything this copy needs travels with it: the house rules (`CLAUDE.md`), the reel skills (`.claude/skills/`), the playbook (`docs/`), and this brand's own files (`brand/`, `reels/`).

Copies never share state, so brands do not mix. The reel engine itself (`/susanoo-reels`) is installed once per computer by the kit's `setup/install.sh`; it keeps no brand data.

This folder is exactly what the Git repo ships in `template/`. The Susanoo Reel Kit licence (`LICENSE`) travels with every copy; keep it in place. Never commit keys, `.env` files, photos of people, avatar poses, client data, renders or audio from a copy back to the kit.

## Updating this copy to a newer kit

This copy records the kit version it is on in `.kit-version`. The kit's changes are listed in its `CHANGELOG.md` and announced as GitHub Releases (on the kit's GitHub page: Watch, then Custom, then Releases, to get an email). To have Claude tell you about a newer version at the start of a session, set `updates.check_on_start` to `true` in `brand/brand.json` (it is off by default).

A copy does not update itself. When the kit gets newer rules or skills, update this copy from the kit's repo folder (where `setup/sync-template.sh` lives; ask the kit's owner for it):

1. See what would change, changing nothing: `bash <kit repo>/setup/sync-template.sh <this folder>`
2. Apply it: `bash <kit repo>/setup/sync-template.sh <this folder> --apply`

It replaces only the kit's own files (`CLAUDE.md`, `README.md`, `LICENSE`, `docs/`, `.claude/skills/`). It never touches `brand/` or `reels/`, except that `brand/brand.json` gains any new setting without changing yours. Any file it replaces is saved next to it as `<name>.bak-<date>`. If you changed the rules or a skill for this brand only, re-apply that change from the backup afterwards.
