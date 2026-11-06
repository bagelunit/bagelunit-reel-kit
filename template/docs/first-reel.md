# Your first reel in about 20 minutes of your time

Claude does the work. You answer a few questions, approve three times, and post it yourself. A first reel takes Claude roughly 30 to 80 minutes in the background.

**Before you start (once)**
- The kit is installed on this computer (`bash setup/install.sh`, or `node setup/install.mjs` on Windows) and your ElevenLabs key is saved.
- You opened Claude Code inside this brand's folder, and the brand setup is done (your name, the brand, handle, colours, logo, voice, call to action). If not, type `/brand-setup`.
- Put at least a few true facts about the brand in `brand/facts.md` (or tell Claude, and confirm them). A reel can only state what is in that file.

**The prompts to send, in order** (each one is in `docs/prompts.md` with blanks to fill in and a plain-words hint for every blank)
1. "Set up this brand", once. It also starts on its own the first time you send anything.
2. "Make a reel", for each reel.
3. "After posting", a day or more later, with your numbers.

**The steps**
1. **Ask for a reel**, with a topic: "Make a reel on how to <something the brand really knows>."
2. **Pick the style** when Claude asks (Print, 3D or Talking head). Take its recommendation if unsure.
3. **Read the script and approve it (Gate A).** It is about 30 seconds. Change anything you do not like. Claude shows the voice cost first. Nothing is spent before you approve.
4. **Approve the visual plan (Gate B)**: a short description of what the screen does on each line, and the handle that will show.
5. **Wait while Claude builds, checks and mixes the real sound.** Then watch the draft on your phone.
6. **Approve the final (Gate C)**, with its cover and caption.
7. **Post it yourself** on Instagram (turn on "Upload at highest quality", set the cover, paste the caption).
8. **Review after a day**: ask for `/analytics-readout` with the numbers.

**If something looks wrong:** say what to change, in plain words. Claude makes the smallest edit and checks again. The pattern for a script, approvals and caption is in `reels/_example/`.
