---
name: suggested-tools
description: >
  Shows the optional outside tools the kit suggests (a voice service, music and effects, 3D, generated video, design, research and competitors), asks which ones the
  user already has with clickable questions, saves the answers in brand/brand.json, and walks through connecting each tool they have.
  Use on /suggested-tools, when /brand-setup offers it, or when the user asks "what tools can I connect", "does the kit work with Canva /
  Blender / Higgsfield / ElevenLabs / Uppbeat / Epidemic Sound", "what else can improve my reels" or "turn the tips off". Nothing here is
  required: the kit works on its own code with none of them.
user-invokable: true
argument-hint: "[a tool name, or nothing to see them all]"
metadata:
  author: BagelUnit
  version: "1.0.0"
  category: setup
---

# Suggested tools: which of these do you have? (all optional)

Inputs: nothing, or a tool name. Outputs: the answers saved in `brand/brand.json` under `tools`, and, for each tool the owner has, a connected and checked tool. Next step: carry on with the reel (`/reel-builder`), or `kit suggest` any time to see the list again.

Say this plainly at the start: **the kit works on its own code with none of these.** They are suggestions, never requirements. **Nothing is sent anywhere**: the check only looks whether a program, a file or a connector exists on this computer (it never opens a key), and the answers are saved only in this brand folder.

## The flow

Every question below is a question block (AskUserQuestion): up to four questions per block, two to four options each, the recommended option first. Never ask any of it as plain text. The harness adds "Other" for typing something not listed.

1. **Look first.** Run `kit suggest --json` (in this brand folder). Show the catalog as one short list, a line per tool: its name, its status (connected / not connected / dismissed) and what it adds, with its example in a few words. If the user named a tool (`/suggested-tools canva`), run `kit suggest <id>` instead, show it, and skip to step 5 for that tool.
2. **Ask which they have, one question per category,** in one or two blocks (up to four questions each): voice, music and effects, 3D, generated video, design, research and competitors. Each question is multi-select. Options: the category's tools (tools already shown as connected are pre-noted: "ElevenLabs (found on this computer)"), plus "I have none of these". With more than three tools in a category, put the extra tool in the question text and let "Other" carry it. Voice options: ElevenLabs, another voice service, none. Music and effects: Uppbeat, Epidemic Sound, none. 3D: Blender, none. Generated video: Higgsfield, another generated-video tool, none. Design: Canva, Adobe Firefly or Express, Adobe connector for Claude, none (if that is five options, ask the Adobe pair as one option "Adobe (Firefly, Express or the connector)" and sort out which after).
3. **Confirm.** Show what you understood in one line per category, then ask one block: "Save these answers (Recommended)" / "Change something". On "Change something", ask which category and redo only that one.
4. **Save.** Run exactly one of:
   - `kit suggest --have <id>,<id>` plus `--other "<what they typed under Other>"` when they typed one,
   - `kit suggest --none` when every answer was none (add `--other "..."` if they typed one).
   It replaces any earlier answers and writes the date. Tell the user where it was saved.
5. **For each tool they HAVE,** walk through connecting it one step at a time, using that tool's `connect` steps from `kit suggest <id>`. Do browser steps yourself with the browser tool (Claude in Chrome) by the rules in `docs/browser.md`: the user logs in, copies any secret into the file you made and opened, and clicks the last Delete. Never ask for a password, a token or a key in the chat; never print or open a key file's contents. Ask before anything paid or public. After each, check it: `kit checkup` for the voice key, `kit suggest <id>` shows "connected" once the kit finds it. A tool that cannot be detected (a download by hand) is simply recorded as declared. If a step fails, say what failed and offer to skip it: a tool left unconnected costs nothing.
6. **For the ones they do NOT have,** say it once, one line each: what it would add, with its example (for instance, Higgsfield: "a 5 second establishing shot of a 1900s factory floor, labelled Re-creation"; Canva: "a branded cover from your template in two minutes"; Blender: "a 3D product shot or a shaded-relief terrain map"; Uppbeat: "a music bed that ducks under your voice, recorded with its licence"; ElevenLabs: "a natural voice for the whole reel instead of the built-in basic voice"). Never push, never repeat it, never say a tool is needed. Tell them the site shows the current price and plan: "check the site".
7. **Tips.** Say that the kit may show one short tip at the step where a tool would help (at most one per command, a tool at most once a week), and how to stop them: `kit suggest --dismiss <id>` for one tool or a whole category, or ask here and set `tools.tips` to `false` in `brand/brand.json`, or run with `--no-tips`. If they want them off, ask with a question block ("Keep the tips (Recommended)" / "Turn the tips off") and make the change they pick.

## Rules

- Never claim a price, a plan or a licence term. Point to the tool's site.
- A tool they connect is recorded like any other asset when used (`kit licensed add`, `/licensed-assets`); generated shots are labelled on screen (`/generated-shots`).
- Never read, print or store an API key. The user pastes it into the file you opened.
- No em dashes in anything you write.
