---
name: hook-mining
description: >
  Mine a CSV of real top-performing hooks and generate alternatives that keep what made them work:
  hold the storytelling psychology and structure fixed, swap only the power words. Use when the user
  says "mine hooks", "remix hooks", "hook variations", "make hooks from this CSV", "mine my top
  performers" or "give me hook options from what's working". If no hook data is in the workspace yet,
  the skill says exactly what file to bring. NOT for inventing hooks from nothing (that is
  viral-hook-writer).
user-invokable: true
argument-hint: "[path to your hooks CSV]"
metadata:
  author: BagelUnit
  version: "1.0.0"
---

# Hook mining

Most AI hook writing is slop for one of two reasons: it copy-pastes a hook that worked for someone
else, or it "rewrites" it until the English is flat and the psychology is gone.

This does neither. It keeps the **data for what worked** - the structure, the psychological
mechanism, the rhythm - and swaps only the **power words**. Proven skeleton stays, skin changes.

## 1. Get real hooks in

You cannot mine what you do not have. The input is a CSV of hooks that **actually performed**:

- a **Sandcastles** (sandcastles.ai) export - it analyses the top videos in your niche and ranks the
  best hooks; export that tab to CSV
- any social-analytics export with a hook/title/caption column and a views/likes/score column
- competitor hooks found with **account-audit**, or breakdowns from **reel-analyzer**

Column names are never predictable, so don't hand-parse.

## 2. Mine it

```bash
python3 ./.claude/skills/hook-mining/mine_hooks.py hooks.csv [--top 40] [--metric Saves]
```

Auto-detects the hook column and the performance column, ranks, buckets by pattern, and flags the
power words already present. Writes `hooks.mined.json`. Run `--selftest` to verify the parsing.

`--metric <column>` ranks by the named column instead of the first metric it finds (case does not matter). If the goal is save, rank by the saves column: `--metric Saves`. `--top` larger than the number of rows is fine; you just get every row. Rows or files marked SYNTHETIC are flagged in the output.

Patterns it sorts into: `result-proof` · `time-bound` · `contrarian` · `secret-gap` · `listicle` ·
`how-to` · `warning-fear` (this is where "Stop ..." lines go) · `newsjack` · `comparison` · `question` · `curiosity-tease` ·
`number-led` (has a number but fits no other pattern) · `plain-statement`.

## 3. Remix - the part that matters

For each hook worth reusing, produce 3–5 alternatives under one rule:

> **Keep the psychology. Swap the power words.**

Label each mined hook by the triple hook beats it has (context, lean, contrarian snapback; `docs/hook-and-review-playbook.md` section 0), and when a variant is missing a beat, add it rather than dropping it.

Hold **fixed**: the pattern, the clause order, the specificity (a number stays a number), the rhythm
and syllable shape, the tension and where it resolves, the point of view.

Swap **only**: the charged words - the verb, the intensifier, the noun carrying the emotion.
`power_word_frequency` in the mined JSON tells you which ones are earning their keep in *your* niche.
Pull replacements from there, not from a thesaurus.

```
proven:   "You're kneading your dough wrong"           [contrarian · you're + wrong]
  ✅      "You're proofing your dough backwards"       swapped the verb + the charge word
  ✅      "You're baking your bread the slow way"      same skeleton, same tension
  ❌      "Many people knead dough incorrectly"        psychology gone, flat English → slop
  ❌      "You're kneading your dough wrong"           verbatim copy → plagiarism, the platform buries it
```

Then hand the winners to **viral-hook-writer** to rank, or straight into **reel-scripter**.

## Hard rules

- **Never ship a mined hook verbatim.** It is someone else's line. Instagram's originality systems
  bury copies, and it's plagiarism. Model the technique, write your own words.
- **Never remix the structure.** Change the clause order or drop the number and you have thrown away
  the only thing the data proved.
- **A number in the source stays a number in the remix - and it must be YOURS and real.** Swapping in
  a stat you cannot defend is the fastest way to lose an audience. In a reel workspace the number must be in brand/facts.md; otherwise drop it or write {{needs cleared fact}}.
- **Data marked SYNTHETIC must never be presented as real hooks.** Say it is sample data, and do not quote it as proof of what works.
- **Rank before you mine.** Remixing a hook that did not perform just launders a bad idea.
- **Small buckets are signal.** A pattern with two entries that both went viral beats one with forty
  mediocre ones. Weight by performance, not by count.

## Failure modes

| Symptom | Cause | Fix |
|---|---|---|
| Variants read flat / corporate | rewrote the sentence instead of swapping words | restore the original skeleton, change only the charged words |
| All variants sound identical | swapped one word in one slot | vary the slot - verb, intensifier, or emotional noun |
| Variants lost the tension | resolved the curiosity gap inside the hook | the gap stays open; the payoff belongs after the hook |
| Nothing outperforms | mining unranked or off-niche data | re-export ranked, filter to the actual niche |

## Where it sits

`account-audit` / `reel-analyzer` find what's working → **hook-mining** turns that data into your own
hooks → `viral-hook-writer` ranks → `reel-scripter` writes the script → `reel-builder` builds it.
