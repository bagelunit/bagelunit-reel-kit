---
name: generated-shots
description: >
  Make and record an AI-generated shot (a short video clip or a still) for a reel, with any provider (Higgsfield is the one we use and suggest),
  and use it by id in a scene. Use when the user asks for a generated shot, AI b-roll, an "AI video", a re-creation of something that cannot be
  filmed, or says they made something in Higgsfield or another generator.
user-invokable: true
argument-hint: "[what the shot shows, or the file already made]"
metadata:
  author: BagelUnit
  version: "1.0.0"
  category: content
---

# Generated shots: make it anywhere, record it, label it, never let it carry the story

Inputs: what the shot should show (or a file the owner already made). Outputs: an entry in `brand/licensed/assets.json`, the file in the brand folder, a scene in the reel that uses it by id, and a label on screen. Next step: `kit scene check <reel>`, then the gates and `/reel-review`.

Any generator works; Higgsfield is what we use and suggest, and nothing here needs it. A provider's connector, if the owner has one, can make the shot for them. Never spend credits or start a paid generation without the owner saying yes to that exact job, and never ask for a password or key in the chat.

## Rules (the reel fails review without these)

1. **Label it.** A shot that re-creates something (a place, an event, a product in use, a scene that did not happen on camera) shows a short on-screen label such as "AI-generated re-creation". The label text is recorded with the asset (`--onscreen-label`) and the reel must show that text while the shot is on screen.
2. **It never carries the story.** The claim, the proof and the payoff are told by the voice, the facts and the kit's own scenes. A generated shot is atmosphere or illustration, never the evidence for a claim.
3. **No real people.** Do not generate or show a real person, a lookalike of one, or anyone's voice or likeness without their written permission. No other brand's logos or products.
4. **Rights.** Check the provider's terms for commercial use on the plan the owner is on (check the site; do not assume). Record the tool and, if you have it, the prompt.

## Steps

1. **Brief.** One shot, one sentence: subject, motion, length (3 to 5 seconds is plenty), vertical 9:16. Say which scene of the reel it serves and why it earns its place (list it in the "Tools per scene" line of `STORYBOARD.md` at Gate B).
2. **Make it** in the provider, or through the owner's connector. Look at the result. Reject anything with garbled text, wrong hands, a face that resembles a real person, or a logo.
3. **Download it** by hand (or through the connector) into a scratch place, not the repo.
4. **Record it:**

   ```
   kit licensed add <file> --type generated-video --title "..." --tool "Higgsfield" --prompt "..." --onscreen-label "AI-generated re-creation" --source "..." --plan "..."
   ```

   Use `--type generated-image` for a still. This is the way to record a generated file; the engine's `kit licensed add` is the command that knows these types and fields. If the command refuses a type or flag, say so and update the kit with `/kit-update` rather than working around it.
5. **Use it by id** in `scenes.json`: a clip `{"clip": {"asset": "<id>", "start": 0, "duration": 4, "mute": true}, "narration": "..."}`, or an overlay `{"overlay": {"asset": "<id>", "blend": "normal", "opacity": 1}}` on a scene of your own. Put the label text in that scene's on-screen text so it shows while the shot is up.
6. **Check:** `kit scene check <reel>`, `kit licensed check <reel>`, then the gates as normal (`/reel-review`, Gate C). A hand-edited generated file is a new file: record it again.

## Honesty
Say plainly what is generated. If you are unsure whether a shot could be taken as real footage, label it or cut it.

**Next:** `/reel-review`, then Gate C.
