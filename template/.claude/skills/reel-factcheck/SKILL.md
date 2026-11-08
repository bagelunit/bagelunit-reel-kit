---
name: reel-factcheck
description: >
  Double-check every claim in a reel against its sources, fresh, before voice credits are spent
  (before Gate A) and again on the final (before Gate C). Use when the user asks to "fact check this
  reel", "double check the facts", "are these claims right", or by name (/reel-factcheck). It does not
  write scripts or add facts; it checks what is already written and records a PASS or FAIL.
user-invokable: true
argument-hint: "[reel folder, e.g. reels/<slug>] [script|final]"
metadata:
  author: BagelUnit
  version: "1.0.0"
  category: content
---

# Reel fact check: a second look at every claim

`brand/facts.md` says a claim was cleared. This skill asks a different question: **is it still true,
does the reel say no more than the source says, and does the reel imply anything the source does not?**
It is the one place the kit reads the sources again instead of trusting the earlier read.

It runs twice per reel:
1. **Scope `script`, before Gate A**, so a wrong claim is caught before it is voiced (a new take costs credits).
2. **Scope `final`, before Gate C**, on the script, the caption and every word on screen.

Run it again whenever the script, the caption or a facts row changes: `kit gate` refuses Gate A or C
if the last recorded check no longer matches the words (the fingerprint changed).

## Step 1: the mechanical half
```
node ~/.claude/skills/bagelunit-reels/tools/kit.mjs facts reels/<slug> check --scope script   # or final
```
It needs no network. It checks that every facts row has a source and a cleared date, that every digit in the
words is in `facts.md`, that no `{{needs cleared fact}}` is left, and it lists absolute or comparative
wording (only, never, best, faster, free, every ...). It writes `reels/<slug>/build/factcheck.md`, a worksheet
pairing each script sentence with its nearest cleared row. Fix every ERROR first. Warnings are for you to
judge in step 2. The pairing is a hint, not a proof, and you can ignore it for hooks.

If `kit.mjs` cannot resolve the path, run `python3 ~/.claude/skills/bagelunit-reels/tools/facts.py <reel folder> check|record` instead (same arguments).

## Step 2: the fresh re-read (this is the real check)
Use a reader that has not seen the earlier conclusions: start a fresh subagent (Agent tool) and give it only
the worksheet, the list of source URLs and the rules below. It may read the script, caption and storyboard, but not the `facts.md` Notes column or earlier conclusions. Do not hand it your own view
of what the sources say. If you cannot start a subagent, do it yourself and say so in the note.

For every sentence of the reel that states something about the world (skip hooks and asks like "Save this for later"):
1. Read the source page now, with the project's web tool (a scrape tool or WebFetch, never from memory). If a source URL redirects, note the final URL in the note. Prefer the
   official page or the repository itself. A blog or a news story is not a source for a vendor's own feature.
2. Give one verdict: **SUPPORTED**, **OVERSTATED** (the reel says more than the page: dropped a "most" or an
   "except", turned "can" into "does", turned a sample into the full list), **NOT FOUND**, **CHANGED** (the
   page now says something else) or **UNSOURCED** (no facts row covers it), or **N/A** for hooks, advice and asks that state nothing about the world (exempt from PASS).
3. Write the page's own wording in a short quote (a few words) or a close paraphrase, the URL and the date read.
4. Check what the reel **implies**: a comparison, a missing feature, "all", "only", a winner. Something shown on
   one side and not the other can claim an absence. A "differences" list built from one tool's docs claims absence on the other side. Check the other product's page for the same feature, and reword the framing ("what's different in the details") if either side has it. Check against the facts file's "Never say" list.
5. For a claim about how a tool behaves (a flag, a command, a file name), where the tool is installed here and
   the check is read-only, run its `--help` or version command and note it. Never run anything that costs money
   or changes the user's files.
6. Scope `final` only: also read the text in `scenes/*.js` (if the folder exists) and the cover, caption and storyboard "Names on screen".
   Picture claims count (a chart, a logo, a product screen, an address that carries a real brand name).

Public pages can themselves be wrong or out of date. If a source looks stale, contradicts another official
page, or is only a marketing line, say so and mark the claim OVERSTATED or NOT FOUND rather than SUPPORTED.

## Step 3: the verdict
- **PASS** only when every claim is SUPPORTED (N/A claims do not count against it) and nothing is implied that no source supports.
- **FAIL** otherwise. List each problem with the sentence, what the source says, and the smallest change in
  wording. Never edit `brand/facts.md` or the script yourself: the owner decides. If the fix changes a spoken
  line after the voice was made, say it needs a new take and how many characters (credits) that is.

Record it:
```
node ~/.claude/skills/bagelunit-reels/tools/kit.mjs facts reels/<slug> record --scope script --result PASS --note "re-read 2026-11-07, 12 of 12 supported, fresh subagent"
```
`record` refuses PASS while the mechanical check has errors. A FAIL is recorded too; fix, re-run, record again.

## Report to the owner
Short and plain: how many claims, how many SUPPORTED, then each problem with the sentence and the fix.
End with what was **not** checked (a source behind a login, a claim about behaviour you could not test, a
picture you could not judge). Never say "100% accurate". Say "every claim matched its source on <date>".
A source can change tomorrow; the caption should tell people to check the docs for anything that moves.
