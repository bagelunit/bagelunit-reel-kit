---
name: logo-library
description: >
  Add and manage the logos and app icons this brand's reels show (other companies' marks), and make a reel use them faithfully.
  Use when a reel, a screenshot or a reference you are rebuilding shows a logo, app icon or brand mark, when the user says "add a
  logo", "use the Notion logo", "rebuild this from a reference", or before posting a reel that shows another company's mark.
  The kit ships no logos: this finds, adds, records the rights of and checks the ones you need.
user-invokable: true
argument-hint: "[list | need <id> | add <id> | use <reel> <id> | check <reel>]"
metadata:
  author: BagelUnit
  version: "1.0.0"
  category: brand
---

# Logo library: faithful marks, with the rights on record

Every logo a reel shows comes from `brand/library/logos/` (one SVG each, listed in `index.json`), never drawn from memory.
The tool is `.claude/skills/logo-library/logos.mjs` (run with `node`). Ask every choice with a question block (AskUserQuestion).

## When a reel or a reference shows a logo

1. **Identify every brand and app in it** from the full-size picture, not a thumbnail. If a mark cannot be named, say so and ask.
2. **Look each one up:** `logos.mjs need <id> ...`. `ok` means use it; `APPROX` means only a stand-in exists; `MISSING` means find it.
3. **Find the brand's own artwork** (its press or brand page, the app's store listing, a public icon set, or a clear crop of the
   reference to trace). **Ask the user before downloading any file**, naming the file and where it comes from. Then add it:
   `logos.mjs add <id> --file x.svg | --url https://... --yes --name "..." --brand "..." --fidelity official|traced|approx --rights approved|test-only|pending --source "..."`.
   An SVG only (no scripts, 200 KB at most). An `approx` stand-in is allowed in a test and never in a post.
4. **Rights (house rule 9).** Another company's mark is posted only after the owner reads its usage terms and approves that one
   mark. Until then set `--rights test-only` (or `pending`). When the owner approves it, run `add` again with `--rights approved`
   and note the decision in `CLAUDE.local.md`. A mark may never be recoloured or redesigned, and a reel must not imply the company
   sponsors or endorses it.
5. **Use it in a reel:** `logos.mjs use <reel> <id> ...` copies the SVGs into the reel's `assets/logos/` and records them in
   `reel.json` > `logos`. In a Print reel draw one with `ASSETS.push(['logo_<id>', 'assets/logos/<id>.svg'])` and `IMG.logo_<id>`.
6. **Before posting:** `logos.mjs check <reel>` must print that every logo is approved. `schedule.mjs` runs the same check and
   refuses to schedule a reel whose logos are not official or traced and approved.

`logos.mjs list` shows what is in the library. The library starts empty; nothing here is a license, only a record of what the owner decided.
