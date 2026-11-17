# Suggested tools (we use them; none are required)

Everything in the kit works with the kit's own parts. These outside tools are ones we use ourselves and suggest. You can use them, use others that do the same job, or use none. Anything you connect is your choice and your account. Before you use any of them, check the tool's own site for its current price, plan and licence terms: this page does not state any.

Three ways a tool joins the kit:

- **By hand.** You make or download a file in the tool, then record it with `kit licensed add` (see `/licensed-assets`). The kit stores the file's hash and where it came from.
- **A connector.** If you have the tool's connector in Claude, Claude can search or generate through it for you, and you still record the result the same way.
- **An API key.** A few tools take a key. Claude makes the empty file the kit names, opens it, and you paste the key yourself. Never paste a key into the chat.

Other tools work the same way. If you prefer a different voice, music, 3D, image or video tool, download from it and record it with `kit licensed add`, and give the source and plan so the licence can be shown later.

## Voice: ElevenLabs

- **For:** the voice-over of a reel.
- **Connects:** an API key in `~/.config/bagelunit-reels/elevenlabs.key` (see `SETUP.md`).
- **Check:** that your plan allows commercial use, and that any cloned voice is your own or you have written permission.

## Music and sound effects: Uppbeat, Epidemic Sound

- **For:** a music bed under the voice and sound effects.
- **Connects:** by hand (download the file, then `kit licensed add <file> --type music|sfx ...`). Epidemic Sound also has a Claude connector if you have it. Uppbeat has no API.
- **Check:** your plan covers the channel you post on (for YouTube Shorts, also the safelist step), and write down the credit line the site asks for. See `/licensed-assets`.

## 3D: Blender

- **For:** a product, a label, a phone mock-up or a 3D title as a short transparent clip, or a still for a cover.
- **Connects:** Blender is free (blender.org). The kit's `/blender-shot` runs it from the command line. The Blender Lab MCP is optional: it lets Claude open a `.blend` and take screenshots, and the scripts do not need it.
- **Check:** models, textures and fonts you bring in carry their own licences; keep them in your brand folder and record them.

## Generated shots: Higgsfield, or any provider

- **For:** a short atmosphere or b-roll shot, or a still, that you could not film.
- **Connects:** make it in the tool (or through your connector), download it, then `kit licensed add <file> --type generated-video|generated-image --tool "..."`. See `/generated-shots`.
- **Check:** the provider's terms for commercial use and for what you may show; always label a re-creation as generated on screen; generated shots never carry the story and never show a real person.

## Thumbnails and graphics: Canva, Adobe Firefly, Adobe Express

- **For:** a cover or thumbnail image, a graphic, a background plate.
- **Connects:** by hand (export a JPG or PNG into your brand folder), or through the Canva connector or the Adobe connector for Claude if you have one. Then `kit cover --image <file>`. See `/thumbnail-design`.
- **Check:** the licence of any stock or template element you use, and the platform's rules on generated images. No other brand's logos, no real people.

## Editing finish: any editor

- **For:** a final touch in the editor you like (colour, a transition, a cut).
- **Connects:** export an mp4 and put it in the reel folder.
- **Check:** a file finished by hand is a new file: run `kit gate <reel> hash` and the checks again, and it goes back through Gate C. The review line names the exact file reviewed.

## Research and growth: already in the kit

No outside account is needed for these. `/account-audit`, `/comment-mining`, `/hook-mining`, `/reel-analyzer`, `/analytics-readout` and the content calendar's competitor board read your own numbers and public pages. `kit licensed check <reel>` and `python3 ~/.claude/skills/bagelunit-reels/tools/mixcheck.py <reel>` check your files without any outside tool.
