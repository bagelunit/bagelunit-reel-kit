# Your first reel in about 20 minutes of your time

Claude does the work. You answer a few questions, approve three times, and post it yourself. A first reel takes Claude roughly 30 to 80 minutes in the background. Every choice and every approval comes as a question block: click an option, or pick "Other" and type.

**Before you start (once)**
- The kit is installed on this computer (`bash setup/install.sh`, or `node setup/install.mjs` on Windows) and your ElevenLabs key is saved.
- You opened Claude Code inside this brand's folder, and the brand setup is done. If not, type `/brand-setup`.
- Put at least a few true facts about the brand in `brand/facts.md` (or tell Claude, and confirm them). A reel can only state what is in that file.

**The prompts to send, in order** (each one is in `docs/prompts.md` with blanks to fill in and a plain-words hint for every blank)
1. "Set up this brand", once. It also starts on its own the first time you send anything.
2. "Make a reel", for each reel.
3. "After posting", a day or more later, with your numbers.

**The steps**
1. **Ask for a reel**, with a topic: "Make a reel on how to <something the brand really knows>."
2. **Pick the style** (Print, 3D or Talking head). Take the recommended one if unsure.
3. **Claude writes hooks and the script.** Then it fact checks the script: it re-reads every source, and a claim it cannot back up is flagged before anything is spent. It also shows what the voice will cost.
4. **Approve the script (Gate A).** Click Approve, or "Change something" and say what. Nothing is spent before you approve.
5. **Claude makes the voice and the visual plan**: a short description of what the screen does on each line, and the handle that will show.
6. **Approve the visual plan (Gate B).**
7. **Wait while Claude builds, checks and mixes the real sound.** Then it makes the final, the cover and the caption, fact checks again, and gives a review verdict (meets the bar, close, or not ready). Watch it on your phone.
8. **Approve the final (Gate C).**
9. **Post it yourself.** `/reel-posting` gives you a posting card: the file, the cover, the caption ready to copy and the quality setting. Or schedule it in Instagram.
10. **A day later, say "add my numbers"** (where to find them: `docs/after-posting.md`).

**If something looks wrong:** say what to change, in plain words. Claude makes the smallest edit and checks again. The pattern for a script, approvals and caption is in `reels/_example/`.
