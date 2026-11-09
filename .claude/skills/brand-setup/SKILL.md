---
name: brand-setup
description: The first step after installing the BagelUnit Reel Kit, run from the kit's own folder. Makes a new brand folder (a copy of template/) where the person chooses, then asks the brand questions and fills in that folder, so it is ready to make reels. Use on /brand-setup in the kit folder, or when the person says "set up my brand", "set up a brand", "make a brand folder", "new brand", "I want to make a reel" or "what do I do next" after the kit is installed.
---

# Brand setup, started from the kit's folder

This folder is the kit itself. Reels are never made here: each brand gets its own folder, a copy of `template/`. This skill makes that folder and then sets up the brand inside it, in one go.

## 1. Check the kit is installed

Check that `~/.claude/skills/bagelunit-reels/KIT.md` exists. If it does not, the kit is not installed on this computer yet: say so in one line, and offer to run the installer first (`bash setup/install.sh` on Mac and Linux, `node setup/install.mjs` on Windows), following this folder's `CLAUDE.md` and `SETUP.md`. Come back to step 2 when it is done.

## 2. Make the brand folder

Ask with one question block (AskUserQuestion), never as plain text:

1. **Brand name:** "What is the brand or company called?" Offer "Skip for now (call the folder my-brand-reels)" as an option; the person types the real name under Other.
2. **Where:** "Where should the brand's folder go?" Options: `~/Reels/<slug>-reels` (Recommended; `<slug>` is the name in lowercase with dashes, so "Bagel Unit" becomes `bagel-unit-reels`; the person can type their own spelling under Other, and the folder name always ends in `-reels`), "Somewhere else (type the full path under Other)". Say in the option text that a folder outside iCloud Drive, OneDrive or Dropbox is best, because renders are large.

Then run, from this kit folder:

```
node setup/new-brand.mjs "<folder>"
```

It copies `template/` there and prints `OK: made a new brand folder at ...`. If the name did not end in `-reels`, it adds it and says so: use the folder it printed from here on. If it says the folder already exists, ask for another name or offer to open that existing folder instead (it may be a brand already set up). Never copy into this kit folder, and never fill in `template/` itself.

## 3. Set up the brand in that folder

Read `<folder>/.claude/skills/brand-setup/SKILL.md` and follow it from "Before asking" to the end, with these changes:

- "This folder" and "this workspace" mean the new brand folder, not the kit folder. Run every command from inside it (for example `cd "<folder>" && python3 ./.claude/skills/brand-setup/prefill.py <url>`), and write only to files inside it.
- The brand name from step 2 is already known: offer it as the recommended answer to the brand question instead of asking from scratch.
- On Windows use `python` where it says `python3`.

## 4. Hand over

Finish with:
- the short summary the brand setup asks for (what was written, which fields are still empty);
- how to open the brand folder for making reels, in plain words:
  - **VS Code:** File, then Open Folder, then pick `<folder>`. Open Claude Code there.
  - **Terminal:** `cd "<folder>"` then `claude`.
- the first command there: `/bagelunit-reels` followed by the topic (for example `/bagelunit-reels a reel about our new menu`). The "Make a reel" prompt in `<folder>/docs/prompts.md` is the longer form with every blank. In that folder, `/brand-setup` changes the brand's answers later, and "update the kit" updates it.

## Limits

- Never ask for, print or store an API key. The ElevenLabs key goes in `~/.config/bagelunit-reels/elevenlabs.key` and the person puts it there.
- Change nothing in this kit folder. No em dashes in anything you write.
