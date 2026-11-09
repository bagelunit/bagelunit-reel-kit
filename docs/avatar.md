# The sticker host

Print-style reels can show a cartoon of you (or your mascot) as die-cut stickers that react to the words: pointing at the newest thing on screen, a thumbs-up on "save this", a shocked face on the surprise. That character is your **sticker host**. Each brand has its own set of poses, kept in the brand folder and never in this repo (it is your likeness).

**The command:** type `/sticker-host` in a brand folder. It does everything below with you, step by step.

## How it works

1. **One photo.** You give one clear, front-facing photo of yourself (head and shoulders, good light), or of whoever the host is, with their permission. You pick a plain outfit (a hoodie in your brand colour works well) and, if you want, your logo.
2. **The base pose.** The kit writes the prompt in its house style and the image tool draws the base pose (`idle`). You approve it before anything else is made. Every other pose is drawn from this one, so it decides the look.
3. **The starter 10.** idle, point, raise, thumbs, shock, think, shrug, wave, open, celebrate. You see them side by side on one sheet and approve them, or pick the ones to redo.
4. **Your logo, printed on.** Image tools misspell and reshape logos, so the kit never asks them to draw it. Your real logo file is painted onto the chest of every pose so it looks printed on the fabric, not pasted on.
5. **It grows with your reels.** The set is not fixed. When a reel's script needs a pose the set does not have (counting to three, a magnifying glass, a facepalm, anything), the kit says so at the visual-plan approval (Gate B), and after your yes it makes that pose from your base pose and adds it to the set for every future reel.

The pose recipe (style description, the starter 10, extra poses and the rule for new ones) is in [`template/.claude/skills/sticker-host/pack.json`](../template/.claude/skills/sticker-host/pack.json), and each starter pose has a simple outline in [`diagrams/`](../template/.claude/skills/sticker-host/diagrams/).

## The image tools

Only the drawing needs an outside image tool. Everything else (removing the background, the white sticker border, lining every pose up at the same size, the logo, the contact sheet) runs on your computer for free with the kit's `host.py`.

| Tool | How | Cost |
|---|---|---|
| **ChatGPT** | by hand: the kit gives you each prompt, you paste it into ChatGPT with the reference image attached and save the result into the brand folder | your ChatGPT plan |
| **Gemini app** | by hand, the same way | your Gemini plan |
| **OpenAI API** | automatic, with your own key saved in `~/.config/bagelunit-reels/openai.key` | paid per image |
| **Gemini API** | automatic, with your own key saved in `~/.config/bagelunit-reels/gemini.key` | paid per image |
| **Higgsfield** | through the Higgsfield connector in Claude | your Higgsfield credits |

BagelUnit's own sticker host was made with **Higgsfield**. A new host takes 11 images (the base and 10 poses), plus any you redo. You save keys yourself; the kit never asks for a key in chat and never prints one. Image models change often: if one is retired, `host.py generate` takes `--model <newer name>`.

## What the engine expects

- One folder of transparent PNGs, one file per pose, any names (`idle.png` is required). `/sticker-host` makes them 896x1120 with the bust on the bottom edge, so switching poses never makes the host jump.
- Each pose carries its own white die-cut sticker border.
- `brand/brand.json` > `host`: `type` `stickers` and `poses_dir` pointing at the folder (`brand/host/poses`).
- In a reel, `kit host reels/<slug>` links the set into the reel and lists every pose; `kit host reels/<slug> --check` names any pose the cues need that the set lacks.

## Already have poses?

Put them in one folder as transparent PNGs named by pose, with an `idle.png`, and answer "I already have a pose folder" in `/brand-setup`. To tidy a set made elsewhere (background, border, same size), save them as `brand/host/raw/<pose>.png` and run `uv run .claude/skills/sticker-host/host.py process`.

## Keep it private

Photos and poses stay in the brand folder (its `.gitignore` keeps them out of its history) and never go in a public place. Only make a sticker host of yourself, or of someone who has agreed.
