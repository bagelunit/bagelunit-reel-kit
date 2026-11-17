# After the export: what the user gets

Hand over the approved file `reels/<slug>/out/<name>.mp4` (1080×1920, 30 fps, H.264 + AAC). It goes up exactly as it is; on Instagram, "Upload at highest quality" (Settings → Data usage and media quality) should be on first.

- **Caption:** `/caption-and-hashtags` (the caption, up to 5 hashtags, a line of search keywords), saved as `out/caption.txt`. It is written before the final fact check.
- **Cover:** a dedicated cover, never a frame grabbed from the hook: `kit cover reels/<slug>`.
- **Ask:** the brand's own (`brand.json` > `cta`). A keyword ask ("Comment WORD") needs a DM auto-reply tested for that exact word before the reel goes live (`docs/connect.md` step 7).
- **Posting:** `/reel-posting`. Never post by yourself; in a brand folder follow its rule 11.
- **One round of changes:** voice faster or slower (`voice.py --speed`, then re-cue), another voice, a shot replaced, a shorter version (cut a beat, re-voice). A changed video needs a new QA, review and Gate C.
