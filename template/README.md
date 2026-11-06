# Reel workspace (Susanoo Reel Kit template)

This folder is generic. It holds no brand until you set one up inside the copy you make.

**To use it for a brand or project:**
1. Copy this whole folder once per brand or project, for example `cp -R template ~/Reels/<brand>`.
2. Start Claude Code inside the copy. With an empty `brand/brand.json` it runs the first-run brand setup (or run `/brand-setup`).
3. Make reels from there. Everything this copy needs travels with it: the house rules (`CLAUDE.md`), the reel skills (`.claude/skills/`), the playbook (`docs/`), and this brand's own files (`brand/`, `reels/`).

Copies never share state, so brands do not mix. The reel engine itself (`/susanoo-reels`) is installed once per computer by the kit's `setup/install.sh`; it keeps no brand data.

This folder is exactly what the Git repo ships in `template/`. The Susanoo Reel Kit licence (`LICENSE`) travels with every copy; keep it in place. Never commit keys, `.env` files, photos of people, avatar poses, client data, renders or audio from a copy back to the kit.
