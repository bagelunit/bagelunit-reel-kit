# Licensed assets

Music, sound effects, stock video, motion graphics and LUTs can come from any source you have the rights to use: connect whatever you like. We suggest **Uppbeat** (uppbeat.io) because it is what we use: human-made, rights-cleared, and it has no API, so you download by hand. The kit ships no assets, only this folder and the commands. Record each download (`--source` and `--plan` say where it came from; add them for any site, not only Uppbeat); the kit then uses it in reels and checks it before Gate C.

AI-generated shots (from Higgsfield or any other tool) are recorded the same way with `--type generated-video` or `generated-image` and `--tool`; the reel must show their on-screen label ("Re-creation" or "AI-generated"), or Gate C refuses it. Your own renders (Blender, code) need no record: use them with `"file"` in a scene.

## Download and record

1. On uppbeat.io, find the asset and download it.
   - **Music: set the download type to WAV** before you download (the account's download settings; WAV keeps the quality, MP3 works but is lossier).
   - Sound effects, stock video, motion graphics and LUTs download as they are.
2. In this brand folder, record it (the file is copied into `brand/licensed/<type>/`; add `--move` to move it instead):

   ```
   node ~/.claude/skills/bagelunit-reels/tools/kit.mjs licensed add ~/Downloads/clear-skies.wav --type music \
     --title "Clear Skies" --artist "Artist Name" --url https://uppbeat.io/track/... \
     --channels "my-youtube-channel" --credit "Music: Clear Skies by Artist Name via Uppbeat"
   ```

   Or ask Claude: `/licensed-assets`. Types: `music`, `sfx`, `stock-video`, `motion-graphic`, `lut`.
3. `kit licensed list` shows what is recorded; `kit licensed check` re-hashes every file; `kit licensed check <reel>` checks one reel.

## YouTube channel safelist (YouTube Shorts only)

For music on **YouTube Shorts**, add the channel in Uppbeat under **Account > Safelist**, or YouTube's copyright system can flag the track. Instagram and TikTok are covered by the licence and need no safelist, but still record the asset (and the channels it is cleared for) so the licence can be shown later.

## What is here

- `assets.json` is the registry (tracked in git). One entry per asset: id, type, title, artist, source, url, plan, licence, channels, file, sha256, credit, downloaded, notes.
- `music/`, `sfx/`, `stock-video/`, `motion-graphic/`, `lut/`, `generated-image/`, `generated-video/` hold the media. **The media is never committed** (`.gitignore` keeps it out; back it up yourself, or download it again from where you got it).
- `/kit-update` adds this README and the empty folders; it never changes your `assets.json` or your media.

## Using an asset in a reel

- Colour grade: `reel.json` `"look": {"lut": "<id>", "strength": 1}`. It wins over the brand's `scripts/fx/look.cube` slot and the export says so.
- Music under the voice: `"music": [{"asset": "<id>", "from": 0, "fade": 1.5, "gain_db": -18}]` (ducked under the voice; recorded in `build/music.json`).
- Stock-video cutaway (scene-style reels, `scenes.json`): `{"clip": {"asset": "<id>", "start": 2, "duration": 5, "mute": true}, "narration": "..."}`.
- Motion graphic over any scene: `"overlay": {"asset": "<id>", "blend": "screen", "opacity": 0.8, "at": 0, "duration": 3}`.
- Gate C refuses a reel whose assets are not recorded or whose files changed, and writes each asset's credit details into `approvals.md`.
