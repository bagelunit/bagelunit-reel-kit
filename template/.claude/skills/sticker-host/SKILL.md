---
name: sticker-host
description: Makes and grows this brand's sticker host, the cartoon stand-in of a person (or a mascot) that reacts on screen in Print reels. From one reference photo it makes a base pose for approval, then the starter 10-pack, then any new pose a reel needs. Use on /sticker-host, "make my sticker host", "make my poses", "add a pose", "this reel needs a new pose", or when kit host reports a missing pose.
argument-hint: "[new | add <pose> | check <reel> | status]"
---

# Sticker host

The sticker host is a cartoon version of a person (or a mascot) drawn as die-cut stickers: one transparent PNG per pose, white border, same size and framing in every pose. Print reels show it reacting to the words. The set is never fixed: the base pose and the starter 10 are only the start. Every reel adds the poses its own lines need (counting money for a reel about cost, a magnifier for a detail), so the library grows with the brand's content and later reels reuse what earlier ones made.

Everything lives in this brand folder, under `brand/host/`:
- `photo/`: the reference photo (the person's own, or one they have permission to use). Private, never shared.
- `raw/<pose>.png`: images straight from the image tool.
- `poses/<pose>.png`: finished poses (896x1120, transparent, bordered). `brand/brand.json` > `host.poses_dir` points here.
- `poses-plain/`: logo-free copies, kept when a logo is printed on.
- `host.json`: the outfit, background colour, tool, logo and every pose with its description and approval date.
- `sheet.jpg`: all finished poses side by side.

Run the tools from this brand folder with uv (it fetches the two Python libraries for this script only):
`uv run .claude/skills/sticker-host/host.py <command>` (`status`, `prompt`, `add`, `process`, `logo`, `sheet`, `generate`; `--help` lists them). On Windows the same command works in PowerShell.

The recipe (our style description, the starter 10 and the extra poses) is `pack.json` in this folder, and `diagrams/` shows each starter pose as a simple outline. Never put anyone's photo or poses in the kit's public repo.

## 1. Which job

Read `brand/brand.json` > `host` and run `host.py status`. Then, from the argument or the request:
- **new** (no base pose yet, or the owner wants to start over): sections 2 to 5.
- **add <pose>**: section 6.
- **check <reel>**: section 7.
- **status**: show the status output in plain words and stop.

## 2. Tool, photo and outfit (one question block)

Ask with AskUserQuestion:
1. **Image tool** (say "the kit makes everything else on your computer; only the drawing needs an image tool", and that BagelUnit's own sticker host was made with Higgsfield):
   - "ChatGPT (by hand)": I write each prompt; with the browser tool I put it into ChatGPT with the reference image and save the result, otherwise you do. No key needed.
   - "Gemini app (by hand)": the same, in the Gemini app.
   - "OpenAI API (automatic)": uses your own key in `~/.config/bagelunit-reels/openai.key`. Paid per image.
   - "Gemini API (automatic)": uses your own key in `~/.config/bagelunit-reels/gemini.key`. Paid per image.
   - "Higgsfield": uses the Higgsfield connector in Claude and your Higgsfield credits. If it is not connected yet, I connect it with you in the browser (section 2b).
   (Four options fit in one question: put the two "by hand" choices together as "ChatGPT or Gemini app (by hand)" and ask which app after.)
2. **Reference photo:** the path to one clear, front-facing photo of the person, head and shoulders, good light. Only their own photo or one they have permission to use. Copy it into `brand/host/photo/`.
3. **Outfit:** "A plain hoodie in the brand colour (Recommended)", "A plain t-shirt", "What they wear in the photo", Other. Keep it plain: a logo is printed on later, never drawn by the image tool.
4. **Logo on the chest:** "Yes, print our logo (give the file)", "No logo".

Save `outfit` (for example "a plain black hoodie"), `tool` and `logo` in `brand/host/host.json` (create it with `host.py status` first if missing, then edit). Keep the default background (`solid bright green (#00B140), like a green screen`) unless the outfit is green; then use a solid magenta.

Before a paid tool runs, say what it will cost in plain words: 11 images for a new host (1 base + 10), more if some are redone. Wait for a yes.


## 2b. Connecting the tool (with the browser tool)

Right after the owner picks a tool that is not ready, connect it in their browser with the browser tool (Claude in Chrome, `docs/browser.md`, rule 15 in `CLAUDE.md`). The owner logs in, copies a key into the file you opened, and pays (ask before any purchase); you do the rest of each page. If the browser tool is off, say in one line that `/chrome` turns it on, then give the same steps in words.

- **Higgsfield** (if no Higgsfield tools are available in this session):
  1. Say what connecting does: Claude can make images with the owner's Higgsfield account and spend its credits, one pose at a time after the cost is shown.
  2. Open claude.ai/customize/connectors (the owner logs in to claude.ai if asked), find **Higgsfield**, and select **Connect**. On Higgsfield's sign-in page the owner signs up or logs in; then select **Allow** for them once they have read it. On a Team or Enterprise plan only an admin can add a connector: say so and stop.
  3. Credits: open Higgsfield's plans page with the owner if they have none. Choosing a plan and paying are theirs; ask before opening the checkout.
  4. Back in Claude Code the connector shows in `/mcp` as "claude.ai Higgsfield". It needs Claude Code signed in with a claude.ai plan (the same as the browser tool). If its tools do not appear here yet, ask the owner to open `/mcp` and reconnect it, or to start a new session and say "carry on with the sticker host".
  5. Check the credit balance with the connector before the first image.
- **OpenAI API:** write `~/.config/bagelunit-reels/openai.key` (empty, `chmod 600`) and open it in the owner's editor. Open platform.openai.com/api-keys (the owner logs in), select **Create new secret key**, fill in a name ("BagelUnit sticker host") and stop at **Create secret key**. The owner selects it, copies the key into the open file, saves and says "done"; do not look at the tab until then. Paid per image: open Billing with them if the account has no credit, and leave the payment to them.
- **Gemini API:** the same with `~/.config/bagelunit-reels/gemini.key` at aistudio.google.com/apikey: stop at **Create API key**.
- **ChatGPT or the Gemini app:** nothing to connect; the owner logs in to chatgpt.com or gemini.google.com when section 8 opens it.

## 3. The base pose (approve before anything else)

1. Get the prompt: `host.py prompt idle --base`.
2. Make `brand/host/raw/idle.png` with the chosen tool (section 8), with the reference photo attached.
3. `host.py process idle`, then show `brand/host/poses/idle.png` (open it with the Read tool and describe it honestly).
4. Ask with AskUserQuestion: "Approve this base pose (Recommended)", "Redo it", "Change something (say what)". A change goes into the outfit or a short added line in the prompt, then make it again. Nothing else is made until the base is approved. Record `"idle": {"approved": "<today>"}` under `poses` in `host.json`.

## 4. The starter 10

For each starter pose in `pack.json` after `idle` (point, raise, thumbs, shock, think, shrug, wave, open, celebrate): `host.py prompt <pose>`, then make `brand/host/raw/<pose>.png` with the approved base pose (`brand/host/raw/idle.png`) attached as the reference. Then `host.py process` (all of them) and `host.py sheet`.

If the owner gave a logo: `host.py logo --logo <file>` (optionally `--ink #RRGGBB`), then `host.py sheet` again. If a logo sits wrong on one pose, nudge it: `host.py logo --logo <file> point=10,-20,0.9,5` (right, down, size, turn).

Show `brand/host/sheet.jpg` and ask with AskUserQuestion (multi-select): "All approved (Recommended)", or the poses to redo. Check yourself before asking: same face and outfit in every pose, fingers count right (three means three), nothing cut off, the border reads on the paper background. Redo only the ones picked, then show the sheet again.

## 5. Switch it on

When the set is approved: in `brand/brand.json` set `host.enabled` to `true`, `host.type` to `stickers`, `host.poses_dir` to `brand/host/poses`, and a short `notes` line (tool, date, how many poses). Record each pose's approval date in `host.json`. Tell the owner, by command, what happens next: in a Print reel the engine links this set with `kit host reels/<slug>`, and `/sticker-host check <reel>` finds poses a reel still needs.

## 6. Add a pose

1. If the name is in `pack.json` > `extra` (guns, magnifier, facepalm, tshirt, one to five), use it. Otherwise register it: `host.py add <name> --pose "what the body, hands and face do" --use "when a reel uses it" --reel <slug>` (follow `pack.json` > `new_pose_rule`; `--reel` records the reel it was first made for).
2. Cost: when the pose comes from a reel's Gate B, the owner's yes to Gate B already covered it (the plan showed the new stickers and their cost). Otherwise ask before a paid tool runs (1 image).
3. `host.py prompt <name>`, make `brand/host/raw/<name>.png` with `raw/idle.png` attached, `host.py process <name>`, then `host.py logo --logo <file>` if the brand has a logo.
4. Check it against the base pose yourself (same face, hair, outfit, border and size; the action reads at a glance). Redo it once if it drifts. For poses made after a Gate B, show all of the reel's new poses together on one sheet (`host.py sheet`) and let the owner strike or redo any; for a pose asked for on its own, ask: approve, redo, change.
5. It is in `host.json` with what it shows, when to use it and its first reel. It is now part of the library for every future reel: before inventing a pose for a new reel, read `host.py status` and reuse one that fits.

## 7. Check a reel (run at Gate B)

Cue first, then check. When writing the reel's cues, pick for each line the pose that acts out what it says, from the library if one fits, otherwise a new one named for the action; never settle for idle or a near miss because the set lacks the right pose.

`node ~/.claude/skills/bagelunit-reels/tools/kit.mjs host reels/<slug> --check` lists every pose the reel's cues use and which are missing from the library. Put the missing ones in the visual plan under "New stickers for this reel" (name, what it shows, the line it acts) with the image tool's cost, so the Gate B question covers them; the owner can strike any. After the yes, make them all with section 6 (`--reel <slug>`), show them on one sheet, and run `kit host reels/<slug>` again. Until a pose exists the host shows `idle` at that moment.

## 8. Making one image with each tool

- **ChatGPT or Gemini app:** with the browser tool, open chatgpt.com (or gemini.google.com; the owner logs in), start a new chat, attach the image (the reference photo for the base, `brand/host/raw/idle.png` for every other pose), paste the prompt from `host.py prompt <pose>`, send it, wait for the image, download it and move it to `brand/host/raw/<pose>.png`. Without the browser tool: show the prompt in a code block, say which image to attach, and ask the owner to save the result as `brand/host/raw/<pose>.png`. Either way, check the file exists before going on.
- **OpenAI or Gemini API:** `host.py generate <pose> --tool openai` (or `--tool gemini`). Add `--model <name>` if the default model is retired or a newer one is out; `--dry-run` shows the request without sending it. The key is read from its file and never printed. If the key file is missing, make it with the owner (section 2b); never ask for the key in chat.
- **Higgsfield:** if the Higgsfield connector's tools are available, upload the reference image, generate one image with the prompt and that image as the reference (a portrait size), wait for it, and download the result to `brand/host/raw/<pose>.png`. Check the credit balance first and say what it will cost. If the connector is not connected, connect it with the owner (section 2b) or let them pick another tool.

## Limits

- Only a photo of the owner, or one they have permission to use. Never make a sticker host of a real person who has not agreed.
- Never let the image tool draw the logo: it is always printed on with `host.py logo` from the real file.
- Never put photos or poses in a public place. The brand folder's `.gitignore` keeps them out of its history too.
- No em dashes in anything written.
