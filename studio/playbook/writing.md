# Writing the script

In a brand folder `/reel-scripter` runs the script steps; this page is the craft it follows. A pasted script is used word for word (fix obvious typos only).

## Short reels

The default is 35 to 45 s (about 110 to 130 words). When they ask for something shorter, keep one idea and cut everything else:

| Ask | Words | Shots | Shape |
|---|---|---|---|
| 10 to 15 s | 40 to 48 | 3 to 5 | hook · one turn (the surprising fact) · ask |
| 20 to 30 s | 80 to 110 | 5 to 8 | hook · problem · one turn · payoff · ask |

The ask still ends the reel (the brand's own ask: save this, follow for more, send this to someone, or "Comment KEYWORD …" only when that keyword is in `cta.tested_keywords` or `cta.keywords`), but keep it to one short sentence. Every shot needs a hero you can read in under a second. Most spoken lines are 6 to 14 words.

## The skeleton (about 110 to 130 words, about 35 to 45 s)

```
1  HOOK      a triple hook in the first one or two sentences: the context in the first 1.5 s, a lean (who it's for, what's at stake, or what's surprising), then a contrarian snapback (`docs/hook-and-review-playbook.md` section 0).
2  LOOP      the snapback is the promise that only pays off at the end ("…and step five is the one nobody does").
3  PAIN      the problem in concrete pictures and numbers.
4  TURN      the answer, tool or method, framed as what it does for the viewer.
5  PROOF     one hard fact the user gave you (a number, a result, a screenshot).
6  CLOSE     one line that restates the takeaway, then the loop pays off.
7  ASK       the brand's one ask ("Save this", "Follow" or, only when tested, "Comment KEYWORD and I'll send you …")
```

The ask is the brand's own: `brand.json` > `cta` (save this, follow, or visit the link). A keyword ask is used only when the keyword is listed in `cta.tested_keywords`; then it also goes into `reel.json` > `cta.keyword`.

## Hooks: pick a shape for the lean, write it new

The shapes below are ways to write the lean of a triple hook. The context comes before it and the snapback after it.

| Shape | Example (fresh topic) |
|---|---|
| Stakes | "If you price by the hour, every skill you learn makes you poorer." |
| Myth flip | "You think airports are expensive because of rent. It's the opposite." |
| How-to without the pain | "How to make reels like this without filming a single frame." |
| Someone built it | "Someone built a folder that turns one sentence into a finished reel." |
| Count + promise | "Five steps, and the last one is why mine hit 250K in a week." |
| Stop doing | "Stop rewriting your bio. Change the first frame instead." |

Skip these: "POV:", "Hot take:", "Quick tip:", "Have you ever…?", clock-time openers ("It's 7 a.m."), and anything that reads like an ad in line one.

## How it should sound

- A friend explaining something over coffee: contractions, full sentences, relaxed.
- One idea per sentence, about 8 to 18 words, so captions read cleanly.
- Concrete beats clever: "you paste the same error four times" beats "debugging is painful".
- Numbers beat adjectives, "you" beats "people".
- Lists: say the count first ("five steps"), then number them out loud ("One… Two…") so viewers know where they are.
- No slogan fragments ("One app. One click. Done."), no three-part punchlines, no "game-changer", "seamless", "leverage", "revolutionize".

## Facts

Only state what you're sure of or what the user told you. Product claims use the product's own wording. When unsure, stay qualitative ("a lot faster", not "73% faster").

## Final check

- [ ] The context lands in the first 1.5 s, and the first one or two sentences are a triple hook.
- [ ] The snapback opens a loop, and the ending closes it.
- [ ] The answer arrives only after the problem is felt.
- [ ] Every sentence can be drawn as one clear picture.
- [ ] About 110 to 130 words (or the short-reel size they asked for), ending on one ask: the brand's `cta.style`, or "Comment KEYWORD …" only when the keyword is tested.
- [ ] Read aloud, it sounds like a person.
