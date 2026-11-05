---
name: brand-setup
description: Sets up (or redoes) this reel workspace's brand. Asks the user's name, the company or client name, Instagram handle, accent colour, logo path, fonts, sticker avatar or no host, voice and call-to-action style, then fills brand/brand.json, brand/voice.md and brand/facts.md. Use on /brand-setup, when brand/brand.json has an empty "name", or when the user wants to change the brand's identity, presenter, voice or CTA.
---

# Brand setup for this reel workspace

Run this in the workspace root (the folder holding `brand/` and `reels/`). It is the same questionnaire as section 0 of the workspace `CLAUDE.md`.

## Before asking

1. Read `brand/brand.json`, `brand/voice.md` and `brand/facts.md`.
2. If `"name"` is already filled, show the current values in a short list and ask (multiple choice): "Change some fields", "Start over", "Cancel". For "Change some fields", ask only about the fields they pick.

## The questions

Use multiple-choice questions wherever the answer can be a choice, recommended option first, at most four questions at once. Free text only where a choice makes no sense (names, handles, paths). Never guess, never fill a field the user did not confirm.

1. **You:** your name; are you the person who approves reels? (Yes / No, the approver is ...).
2. **Brand:** company or client name; folder slug (suggest one: lowercase, dashes).
3. **Instagram handle:** `@yourhandle`, or "no account yet".
4. **Colours:** accent hex. Choices: studio (warm white + vermilion), harbor (deep blue), ochre (warm gold), ink (black and white), "my own accent: #......". Offer to read colours from a logo or brand guide path. Background and ink hex are optional.
5. **Logo:** path to the logo file. Check it exists (`ls`); if not, ask again or leave empty.
6. **Fonts:** "Use the kit's fonts" or "My brand fonts: display ..., body ...".
7. **Presenter:** "Sticker avatar (I have a pose folder)", "Sticker avatar (make one later, see docs/avatar.md in the kit repo)", "No host", "The kit's drawn presenter".
   - For a pose folder: ask the path, list the PNGs, and report which of the 19 pose names are present and which are missing: idle, point, guns, thumbs, shock, shrug, think, wave, magnifier, open, tshirt, one, two, three, four, five, celebrate, facepalm, raise. Missing poses are fine; the presenter falls back to idle.
8. **Voice:** "Pick an ElevenLabs voice together now" (then follow the kit's `KIT.md` voice steps with `voicebank.py`), "Use the voice already saved in the kit", "My own recorded voice", "Decide later". Then: words the generated voice must never say, and how to spell tricky names by sound.
9. **Call to action:** "Save this" (recommended until a DM auto-reply is tested), "Follow for more", "Comment a keyword for a DM", "Visit the link in bio". A keyword goes in `cta.tested_keywords` only after the user confirms the auto-reply was tested from a second account.

## Writing the answers

- `brand/brand.json`: `name`, `slug`, `handle`, `people.operator_name`, `people.approver_name`, `identity.logo` (plus other identity paths given), `colors`, `fonts`, `host.enabled`, `host.type` (`stickers`, `drawn` or `none`), `host.poses_dir`, `voice.style`, `voice.voice_id` and `voice.voice_name` (once chosen), `voice.never_say`, `voice.pronunciation`, `cta.style`, `cta.default`. Keep the file valid JSON (check with `python3 -m json.tool brand/brand.json`). Leave `work_dir` unless asked.
- `brand/voice.md`: fill the "Who I am" lines (name, handle, what the brand does if they said it). Leave the rest for the user, or offer to draft it from three of their own captions or reels.
- `brand/facts.md`: add only facts the user states and confirms here, each with its source and today's date. If none, leave the table empty and say so. Never add a number, result, price or client name from your own knowledge or the web.

## Limits

- Change nothing outside this workspace folder. Do not rename or move any file.
- Never ask for, print or store an API key. The ElevenLabs key lives in `~/.config/susanoo-reels/elevenlabs.key` and the user puts it there.
- No em dashes in anything you write.

Finish with a short summary: what was written to each file, and which fields are still empty.
