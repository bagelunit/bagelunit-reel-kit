# Hook and review playbook

Added November 2026, with the reel skills in this folder's `.claude/skills/`. These are ideas and checklists that sharpen steps 1, 2, 5, 7, 12 and 14 of the kit's [reel process](https://github.com/bagelunit/bagelunit-reel-kit/blob/main/docs/process.md) (in the kit's own folder, not in this copy). The skills' numbers come from one account in one niche, so treat every number below as a hypothesis to test against the brand's own median, not as a law.

## 0. The triple hook: how every hook is written (step 5)

The hook is the first one or two sentences of a reel. BagelUnit's triple hook builds them in three beats, always in this order: the viewer buys into the topic at once, leans in out of curiosity, and is then snapped back in another direction. Do all three and the hook is very hard to scroll past. Every hook the kit writes (`/viral-hook-writer`, `/reel-scripter`, the engine's script step) uses it, and `/reel-review` checks it.

**1. Context: say what the video is about, immediately.** This is the basic step, and many people still get it wrong. Viewers only watch content they have a stake in, so the first line must make clear what the video is about. Set the context in all three places if you can: say it in the voice, show it in the picture, and write it on screen or in the caption. It must land at once: in our data, even moving the context to the back half of the first sentence raises the skip rate sharply. Priority number one is immediate context.

**2. The lean: make them curious in one direction.** This is where most people go wrong. The goal is to make the viewer lean in on the context and actively want more, instead of opting out. Ways to do it:

- **Proof or a number** that backs the claim that is coming (only from `brand/facts.md`; `{{needs cleared fact}}` until it is there).
- **A specific pain** the viewer has, or a **benefit** they want.
- **Something interesting, shocking or unexpected.**

Whichever you pick, the viewer must lean in, not opt out. Context plus lean is the **context lean**: it opens the curiosity loop.

**3. The contrarian snapback: pull them another way.** This is where the hook really earns, and very few people do it. To catch a fish you get the hook in its mouth while it swims one way, then pull the line the other way. Storytelling works the same. Once the viewer leans in one direction, say something that pulls them away from it and snaps them onto another path. The snapback must be true, and the rest of the reel pays it off.

**The read-back test.** Read the first one or two sentences on their own and ask:

1. Is the context clear immediately (said, shown and written)?
2. Is there something that makes the viewer lean in for more?
3. Does it then snap them back in a direction they did not expect?

Three yeses, or rewrite it.

**Example** (a meal-prep account):

- Context: "Meal prep for the whole week in 20 minutes." Said in the voice, the first frame shows a week of filled containers, and the screen reads "WEEK OF MEALS: 20 MIN".
- Lean (a benefit they want): "No more losing your Sunday to the kitchen."
- Contrarian snapback: "And the trick isn't cooking faster. It's cooking less."

**Test it on your own numbers.** `/ab-hook-tester` can run the same context and lean with and without the snapback, so the brand's own skip rate shows what the snapback adds for this audience.

## 1. Frame-0 hook checklist (step 5 and step 7)

The triple hook (section 0) is checked on the script; this checklist then checks the hook on the draft's real frames.

A hook passes only if all eight are true. Check it on the draft's real frames at 0 s, 0.5 s, 1 s, 2 s and 3 s, never on the script alone.

1. Frame 0 is already moving. No fade from black, no empty frame, no slow logo build.
2. Frame 0 shows something the viewer recognises (the app, the platform, their problem), not abstract art.
3. The biggest element fills at least 40 percent of the frame and moves from frame 1.
4. Something clearly happens before 3 s (it builds itself, breaks, a number races and locks).
5. The claim lands at about 1.2 to 1.6 s, word by word, large and high contrast. Never at 0 s, never after 3 s.
6. The first spoken word is within 0.5 s and is the subject, not filler.
7. It works on mute (most people watch without sound).
8. It is about the viewer's own account, work or problem, not about us or about AI in general.

Loser patterns to reject: abstract background with no brand the viewer knows, a static card whose 0.5 s and 3 s frames look the same, a black or empty frame 0, small low-contrast text, a topic about "the future" or "me".

Same words can win or flop: what happens on screen decides it. Show the real product or screen doing the thing, not text on a card.

## 2. Pick ONE goal before scripting (step 2)

| Goal | Feeling to trigger | Build it |
| --- | --- | --- |
| Save | relief, fear of forgetting | a finite numbered system that assembles on one frame; depth goes in the caption |
| Share | awe, indignation, status | open on the finished result, then reveal how; something the sender looks smart for sending |
| Follow | fear of falling behind | show the gap, a real number, a look people recognise every post |
| Lead | curiosity plus a free thing | show the value, name the free deliverable, one keyword (only with a tested auto-reply) |

Write the goal into `reels/<slug>/approvals.md` next to Gate A. One goal per reel, one ask.

## 3. Rotate the angle (step 2)

Check `brand/log.md` for the last two angles and do not repeat the most recent one. Angles: result first, self-proving (the reel proves its own claim), contrarian, pain first, something breaks. Add an `angle` and a `goal` column to the log rows.

## 4. Hold them after the hook (step 5 and step 7)

- Every spoken line gets its own visual. No plain text card for a demo line.
- Nothing static: if two frames a second apart look the same, add motion (the `pace` gate finds these).
- Re-hook at the dips, around 4 s, 9 s and 15 s, with a short micro-loop ("and it gets better", "wait for the last one").
- Series or countdown format (optional): promise a payoff in the hook, number the beats so the finish line is visible, save the best beat for last, then pay it off for real. A promised payoff that never arrives is forbidden. This does not replace the rule that the hook gives value up front; it is a format for numbered series reels only.

## 5. Hook mining (step 5)

When the brand has a swipe file of proven hooks (`brand/swipe.md`), run `.claude/skills/hook-mining/mine_hooks.py` on a CSV of them, or use the `/hook-mining` skill. It buckets hooks by psychological pattern and flags the charged power words. The remix rule: keep the pattern, clause order, specificity and rhythm; swap only the charged words. Never ship a mined hook verbatim, and a number in the source stays a number only if it is ours and cleared in `facts.md`.

## 6. Teardown of a reference reel (step 1)

Keeps the existing rule: reels are read in the browser at human speed, no scraping services unless `autopilot.scrape` is on, no logging in with a brand's password. For a reel worth studying, the owner supplies the file (own screen recording or download), or `/reel-sources` fetches it when scraping is on. Claude then pulls frames with ffmpeg and a transcript with whisper-cpp and writes a teardown with `/reel-analyzer`:

1. Hook: exact on-screen text and spoken line, and why it stops the scroll.
2. Beat structure with rough timestamps.
3. Pacing and total length.
4. Visual technique per beat.
5. Two or three reusable moves (the technique, never the words).
6. A one-line remake in our own brand and words.

Save the teardown in `brand/swipe.md`. Study the brand's own best reels the same way once it has some.

## 7. Comment mining (step 2)

Once a brand has 30 or more real comments or DMs, paste them in and run `/comment-mining`: recurring questions with counts, objections, the audience's exact phrases, misreads. Each idea must trace to a real comment. Use their words in hooks and captions.

## 8. Cover check (step 12)

In addition to the centre 1080x1440 rule: cover text of 3 to 5 words, legible when the cover is shrunk to 150 px wide (if it is not, simplify), a family resemblance to the last 8 covers without disappearing next to them. `/cover-thumbnail-brief` writes the options.

## 9. A/B hook test (step 14)

Optional, once a brand has steady views. Two hooks with different mechanisms (not one reworded), one variable only: same cover, length, caption and posting time. State the hypothesis first (what we learn if A wins, if B wins), decide on 3-second hold rather than likes, and note roughly how many views are needed before the result means anything. `/ab-hook-tester`. If more than the hook changed, it is two different reels, not a test.

## 10. Review readout (step 14)

Use `/analytics-readout`: judge every figure against the brand's own median, name the one metric that matters for the reel's goal, and diagnose where it broke. A drop at about 3 s is a hook problem, around 12 s a middle problem, at the end a CTA problem. Give two actions, not twelve, and say plainly what the data cannot tell. Never use an outside benchmark as if it were our data.

## 10b. Reel review before Gate C (step 10 and step 12)

`/reel-review` checks a built reel on its real frames and numbers: seven must-pass checks (facts, words match, frame 0 and the hook, safe zones and size, handle and payoffs, sound, honesty) and eight scored checks from 1 to 5. It ends in one verdict line: meets the bar (every must-pass passes and the average is 4.0 or more), close (3.5 to 3.9), or not ready. The verdict goes in `approvals.md` next to Gate C and the scores go in `brand/log.md`, so after a few reels you can see which check keeps scoring lowest for the brand. A reel that is not ready still goes to the approver with the line attached.

## 11. Comment replies and links

A public comment reply never contains a link. The link goes in the DM only, and only after the keyword auto-reply is tested (see the house rules in `template/CLAUDE.md`).

## Autopilot skills (optional, opt-in per brand)

The kit is for any brand and any person, so it also ships four skills that do more than write text. They are installed but off by default for a brand, and a brand turns each one on through the `autopilot` permissions in its `brand/brand.json` (see section 3b of the template `CLAUDE.md`):

- `/content-factory`: runs the whole loop (research, hook, script, build, caption, post, DM loop) and repeats it. It calls Apify (reel teardown), Composio (posting and DMs) and Remotion (render), and stops to ask when a tool is not connected.
- `/reel-builder`: beat-by-beat build table, plus a render harness. It uses Remotion for free and Seedance on Runway (about $6 to $12 per reel) for character acting.
- `/comment-responder`: a keyword rule that replies publicly (never with a link) and sends the DM, around the clock.
- `/account-audit` and `/reel-sources`: audit an account and find the reels that beat its median (an Apify token, paid per result), mine real questions, and fetch a reel with frames and a transcript.

Know before you turn them on:
- Posting, DMs and scraping act on a real account and can break a platform's rules or get an account limited. The brand owner decides, per brand.
- Paid services (Apify, Composio, Runway) cost money; check the plan first.
- Keep the honesty rules the skills themselves carry: a keyword call to action must really deliver, no links in public replies, no invented numbers, never search the computer for someone's API key.
- Our gated build (`/bagelunit-reels`, Gates A to C, a person posts) is the default and is still the better route when quality matters more than volume.

Not part of the kit: any hosted connector that would send an account's data to a third party we cannot inspect.

Not needed: word-synced timing, safe zones and real sound. Our kit already does these better.

## Craft after the hook

Once the hook works, what is on screen follows `docs/craft-playbook.md` (world, through-line, line-to-picture table, no repeats). Real media lives in `brand/library/`.
