# Reel workspace (BagelUnit Reel Kit template)

A brand workspace: one folder per brand. The `template` folder in the kit stays generic; each copy you make holds one brand once you set it up.

**The commands, in order:** open Claude Code in this folder and type `/brand-setup` (once). Then `/bagelunit-reels` with your topic for each reel, and `/analytics-readout` with your numbers after posting. `docs/prompts.md` has longer versions with every blank explained, if you want them. Claude asks every setup choice and every approval as a question block: click an option, or pick "Other" and type.

**To use it for a brand or project:**
1. Make one copy of this folder per brand or project. The easy way: open Claude Code in the kit's folder and type `/brand-setup`; it makes the copy and sets up the brand in one go. By hand: copy this whole folder in Finder or File Explorer, or in a terminal from the kit's folder with `node setup/new-brand.mjs ~/Reels/<brand>-reels`.
2. Start Claude Code inside the copy. With an empty `brand/brand.json` it runs the first-run brand setup (or run `/brand-setup`).
3. Make reels from there. Everything this copy needs travels with it: the house rules (`CLAUDE.md`), the skills (`.claude/skills/`), the guides (`docs/`), and this brand's own files (`brand/`, `reels/`).

Copies never share state, so brands do not mix. The reel engine itself (`/bagelunit-reels`) is installed once per computer by the kit's `setup/install.sh`; it keeps no brand data.

New here? Read `docs/first-reel.md`, a walk through your first reel. `reels/_example/` is a blank pattern for a script, approvals and caption.

The BagelUnit Reel Kit licence (`LICENSE`) travels with every copy; keep it in place. If you share or upload this folder anywhere, leave out keys, `.env` files, photos of people, sticker poses, client data, renders and audio.

Two kit guides live in the kit's own folder, not in this copy: [the sticker host](https://github.com/bagelunit/bagelunit-reel-kit/blob/main/docs/avatar.md) and [the full reel process](https://github.com/bagelunit/bagelunit-reel-kit/blob/main/docs/process.md) (a technical reference; you do not need it to make a reel).

## What is in this folder

**`brand/`: this brand's own files**

| File | What it holds |
|---|---|
| `brand.json` | name, handle, people, colours, fonts, presenter, voice, call to action, posting plan (`batch.max_reels`, posting days and times, any number a day), posting method, autopilot permissions (all off to start), update notices |
| `voice.md` | who the brand talks to and how it sounds |
| `facts.md` | the only claims, numbers and results a reel may state (the owner confirms each one) |
| `plan.md` | the planned reels, one row each with a date (`/content-calendar plan` fills it after your yes) |
| `calendar.md`, `dashboard.html` | your content calendar and dashboard, remade each time you type `/content-calendar` |
| `followers.csv`, `instagram.json` | once you connect Instagram: one follower count a day (your growth history) and every post's latest numbers |
| `log.md` | one row per posted reel: hook, first line, goal, angle, review verdict |
| `tests.md` | one row per finished A/B test: what won and the lesson |
| `swipe.md` | reels worth studying (the 3x rule) and teardowns, formulas only |
| `insights.csv` | one row of Instagram numbers per posted reel (see `docs/after-posting.md`) |
| `library/` | the brand's own B-roll, product images, components and screens, listed in `INDEX.md` |

**`docs/`: guides**

| File | What it is |
|---|---|
| `first-reel.md` | your first reel, step by step |
| `prompts.md` | ready-made messages to copy, fill in and send |
| `after-posting.md` | where to find your numbers in Instagram and what the kit does with them |
| `auto-reply.md` | how to connect a comment auto-reply and DM for this brand (optional) |
| `auto-post.md` | how to post approved reels on a schedule for this brand (optional) |
| `connect.md` | how to connect everything, step by step: Instagram, your Facebook Page, Threads, the publisher and keyword replies (optional) |
| `dashboard.md` | your content dashboard, a Telegram summary, where to view it and a daily refresh (optional) |
| `hook-and-review-playbook.md` | the first-frame hook checklist and the review after posting |
| `craft-playbook.md` | what goes on screen: one world, a through-line, a picture for each kind of line |
| `style-ideas.md` | style concepts that are not built yet |

**`.claude/skills/`: 26 skills** (Claude loads the right one for each step; you can also type its name)

| Skill | What it does |
|---|---|
| `/brand-setup` | sets up or changes this brand |
| `/sticker-host` | makes the brand's sticker host (a cartoon of you or a mascot) from one photo, then adds any pose a reel needs |
| `/kit-update` | updates this workspace to the newest kit |
| `/account-audit` | finds the reels that beat an account's own median (the 3x rule), from an export or Apify data; `/ig-viral` from the Instagram plugin does the same by hand in the browser |
| `/reel-sources` | finds what your audience asks and reels to model |
| `/reel-analyzer` | breaks down why a reel works: hook, beats, pacing, visuals |
| `/comment-mining` | turns your comments and DMs into content ideas |
| `/going-viral` | picks the goal and the emotion behind a reel |
| `/virality` | plans a reel so it gets watched, or explains why one flopped |
| `/viral-hook-writer` | writes hook options |
| `/hook-mining` | makes new hooks from a CSV of real top hooks |
| `/ab-hook-tester` | an A/B test of a reel's hook: two versions, each approved, posted as trial reels, compared on one number, the winner remembered in `brand/tests.md` |
| `/reel-repurpose` | the same approved reel for TikTok and YouTube Shorts (captions, titles, a check of where each app's buttons sit), plus a carousel and a blog post |
| `/reel-scripter` | writes the script |
| `/reel-builder` | turns an idea into a shoot plan without rendering |
| `/humanizer` | makes text sound like you, not like AI (after the Instagram plugin's `/ig-human` detector flags it) |
| `/reel-factcheck` | re-reads every source, before the script is approved and again on the final |
| `/reel-review` | checks a draft or final and gives one verdict line |
| `/reel-predict` | measures a reel, and estimates how it will hold viewers once 8 posted reels have numbers |
| `/caption-and-hashtags` | caption, hashtags and first comment |
| `/cover-thumbnail-brief` | the cover text and look |
| `/reel-posting` | a posting card, scheduling, or setting up automatic posting step by step |
| `/content-calendar` | your content calendar and dashboard: every reel from idea to posted, what needs you, the four agents, followers and trends; `plan` fills the next weeks after your yes, `days` sets your posting days, `host` lets you view it on your Wi-Fi or online (Netlify suggested), `connect instagram` and `connect telegram` add your numbers and a phone summary, `auto` refreshes it by itself (Mac, Windows, Linux) |
| `/analytics-readout` | explains your numbers in plain words |
| `/comment-responder` | sets up a comment auto-reply and DM step by step (off until tested) |
| `/content-factory` | the opt-in autopilot that runs the whole loop (off by default) |

## Updating this copy to a newer kit

This copy records the kit version it is on in `.kit-version`. The kit's changes are listed in its `CHANGELOG.md` and announced as GitHub Releases (on the kit's GitHub page: Watch, then Custom, then Releases, to get an email). Claude tells you about a newer version once at the start of a session (`updates.check_on_start` in `brand/brand.json`, on by default; set it to `false` to stop the check).

**The normal way:** open Claude Code in this folder and type `/kit-update`. The `/kit-update` skill downloads the newest public kit (it works even if you first downloaded the kit as a ZIP), shows what changed, previews which files would change, asks you, applies the update, and then offers to update the engine too. It never needs a key and never changes your brand's data or reels.

**The manual way** (if you have the kit's folder on this computer):

1. See what would change, changing nothing: `node <kit folder>/setup/sync-template.mjs <this folder>`
2. Apply it: `node <kit folder>/setup/sync-template.mjs <this folder> --apply`

Either way, only the kit's own files are replaced (`CLAUDE.md`, `README.md`, `LICENSE`, `.gitignore`, `docs/`, `.claude/skills/`, `reels/_example/`). `brand/` and `reels/` are never touched, except that `brand/brand.json` gains any new setting without changing yours. Any file that is replaced is saved next to it as `<name>.bak-<date>`. If you changed the rules or a skill for this brand only, re-apply that change from the backup afterwards. Better: keep rules for just this brand in `CLAUDE.local.md` in this folder. Claude Code reads it automatically and updates never touch it.
