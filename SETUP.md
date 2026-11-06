# Setup

One time per computer, on macOS, Windows or Linux. `bash setup/install.sh` (Mac, Linux) or `.\setup\install.ps1` (Windows PowerShell), or `node setup/install.mjs` anywhere, does all of this and prints each step; this page is the same path written down, so you can do it by hand or fix a step that failed. The script is safe to run again: it skips anything already done.

Installer options: `--link` (symlink `studio/` instead of copying it, handy if you pull updates with git), `--skip-packages` (also `--skip-brew`), `--yes`, `--dry-run`, `--skip-plugins`, `--skip-sound`, `--earshot-mcp`, `--rebuild-sounds`. Run `bash setup/install.sh --help` for the list.

## 1. Programs

Pick your system (the installer does exactly this and asks first; this is for doing it by hand):

| System | Command |
|---|---|
| macOS (Homebrew) | `brew install ffmpeg node python git uv whisper-cpp` |
| Windows (PowerShell) | `winget install OpenJS.NodeJS.LTS Gyan.FFmpeg Python.Python.3.12 Git.Git astral-sh.uv`, then `pip install faster-whisper` |
| Linux (Debian, Ubuntu) | `sudo apt install ffmpeg python3 python3-venv python3-pip git nodejs npm`, then uv from https://docs.astral.sh/uv/ and `pip install --user faster-whisper` |

On Windows and Linux, Whisper (the tool that times every spoken word) comes from `faster-whisper` instead of `whisper-cpp`; the kit uses whichever it finds. Open a new terminal afterwards so the new commands are found. On Windows, where this kit says `python3` use `python`.

Open a new terminal afterwards so the new commands are found.

## 2. The engine (studio)

The engine is a Claude Code skill. Install it as `susanoo-reels`:

```bash
mkdir -p ~/.claude/skills
rsync -a --exclude node_modules studio/ ~/.claude/skills/susanoo-reels/    # or: ln -s "$PWD/studio" ~/.claude/skills/susanoo-reels
# Windows PowerShell: robocopy studio "$HOME\.claude\skills\susanoo-reels" /E /XD node_modules
cd ~/.claude/skills/susanoo-reels
npm install          # three.js and the browser driver
npm run browser      # the headless Chromium used for rendering (about 100 MB)
```

If a copy not installed by this repo is already at `~/.claude/skills/susanoo-reels`, the installer moves it aside to `susanoo-reels.backup-<date>` first.

**Upgrading from the pre-rebrand install:** the installer copies your old settings folder (keys, saved voice, handle, theme) to `~/.config/susanoo-reels/` once and keeps the old folder. It does not touch an old skill folder under its previous name; it prints a note instead. Remove that old skill folder yourself once the new one works, because two installed copies would both answer reel requests.

## 3. Your ElevenLabs key (you do this yourself)

1. Make an account at https://elevenlabs.io and create an API key at https://elevenlabs.io/app/settings/api-keys. Allow **Text to Speech** and **Voices** ("User: read" is optional; it lets the checkup show your credits). Add **Speech to Text** if you want talking-head edits without installing Whisper.
2. Save it, alone on one line, in `~/.config/susanoo-reels/elevenlabs.key`:

   ```bash
   mkdir -p ~/.config/susanoo-reels && chmod 700 ~/.config/susanoo-reels
   touch ~/.config/susanoo-reels/elevenlabs.key && chmod 600 ~/.config/susanoo-reels/elevenlabs.key
   open -e ~/.config/susanoo-reels/elevenlabs.key      # paste the key, save, close
   ```

3. Never paste the key into a Claude chat, a brand file or this repo. Each person uses their own key.

Then ask Claude to **find you a voice**: it searches the ElevenLabs library, plays you samples and saves the one you pick.

## 4. Claude Code plugins

```bash
claude plugin marketplace add heygen-com/hyperframes
claude plugin install hyperframes@hyperframes
claude plugin marketplace add Jakeschincariol/instagram-agent-skill
claude plugin install instagram-agent@instagram-agent-skill
```

Turn off HyperFrames telemetry:

```bash
npx hyperframes telemetry disable
echo 'export HYPERFRAMES_NO_TELEMETRY=1' >> ~/.zshrc
```

## 5. Sound tools (for the real-sound step)

Both are separate open-source projects (MIT). They are downloaded to `~/dev/sound/`, not into this repo.

**opus-sound-layer** (sound library, mixer, sound checks):

```bash
mkdir -p ~/dev/sound
git clone https://github.com/Bodila51/opus-sound-layer ~/dev/sound/opus-sound-layer
```

**The 7 Kenney sound packs (free, CC0): download these in your browser.** Kenney only lets a browser download its zips. A script that tries gets a web page back instead. That is what the build's `skip pack ...: File is not a zip file` message means.

The installer does this part with you. Run it in a terminal and it opens the 7 pages, waits while you download, and takes the zips from your Downloads folder. It also deletes any fake web-page "zips" left from an earlier run. By hand, on each page:

1. Click **Download**.
2. A "Consider a donation" box opens. Click **Continue without donating...** (donating is optional).
3. Move the zip into `~/dev/sound/opus-sound-layer/audio/kit/_raw/` with the name below, replacing any file of that name.

| Pack page | Save as | Sounds it adds |
|---|---|---|
| https://kenney.nl/assets/interface-sounds | `kenney_interface-sounds.zip` | 66 |
| https://kenney.nl/assets/ui-audio | `kenney_ui-audio.zip` | 41 |
| https://kenney.nl/assets/impact-sounds | `kenney_impact-sounds.zip` | 72 |
| https://kenney.nl/assets/sci-fi-sounds | `kenney_sci-fi-sounds.zip` | 31 |
| https://kenney.nl/assets/digital-audio | `kenney_digital-audio.zip` | 62 |
| https://kenney.nl/assets/casino-audio | `kenney_casino-audio.zip` | 27 |
| https://kenney.nl/assets/rpg-audio | `kenney_rpg-audio.zip` | 10 |

A real pack is between 0.4 and 6 MB. A file of about 18 KB is a web page, not the pack: delete it and download it again in the browser. To test one: `unzip -tq kenney_<pack>.zip` says "No errors detected".

Then build the library (it also downloads about 600 Freesound recordings, which a script can fetch, and takes a few minutes):

```bash
cd ~/dev/sound/opus-sound-layer
uv run scripts/sfx.py kit
```

or run `bash setup/install.sh`, which rebuilds when it finds new packs. A complete library has about 1,140 sounds: 309 from Kenney (all 7 packs) and about 830 cuts from the Freesound recordings. The kit checkup shows the count on its "sound library" line. Reels still work without the Kenney packs, but the real-sound step then has no `ui` or `zap` sounds at all and fewer impact and sci-fi sounds. If Claude Code's auto mode blocks running the downloaded build script, run it yourself in a terminal.

**earshot** (lets Claude "listen" to audio):

```bash
git clone https://github.com/Leonxlnx/earshot ~/dev/sound/earshot
cd ~/dev/sound/earshot
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python torch --index-url https://download.pytorch.org/whl/cpu
uv pip install --python .venv/bin/python -e ".[mcp]"
.venv/bin/earshot doctor --fetch        # downloads two open models, about 1.1 GB, once
rsync -a skills/earshot/ ~/.claude/skills/earshot/
rsync -a skills/real-sound/ ~/.claude/skills/real-sound/
```

Optional, so Claude can call earshot as a tool:

```bash
claude mcp add --scope user earshot -- ~/dev/sound/earshot/.venv/bin/earshot mcp
```

## 6. Check

```bash
cd ~/.claude/skills/susanoo-reels && node tools/checkup.mjs
```

Done when it shows only checks (lines marked optional can stay open).

## 7. Your first brand

```bash
cp -R ~/dev/susanoo-reel-kit/template ~/Reels/my-brand
cd ~/Reels/my-brand && claude
```

Claude sees an empty brand and starts the brand setup questions. Run `/brand-setup` any time to change the answers.

Keep brand folders out of iCloud-synced folders (Desktop, Documents) if you can: renders write many frames, and syncing them slows everything down.

## Common snags

- **headless browser fails in the checkup:** in `~/.claude/skills/susanoo-reels`, run `npm run browser` again.
- **ffmpeg not found right after installing:** the terminal was opened before the install; open a new one.
- **ElevenLabs 401:** wrong key or no credits left; make a new key and replace the line in the key file.
- **"opus-sound-layer library missing":** run `uv run scripts/sfx.py kit` in `~/dev/sound/opus-sound-layer`.
- **realsound.py cannot import numpy:** run it with earshot's Python: `~/dev/sound/earshot/.venv/bin/python`.
- **The laptop gets loud:** normal during a final render. Drafts are half size, and renders take turns.

## Optional: Apify (outlier scan)

Only if a brand owner wants `/account-audit` to fetch posts instead of using an export. Make a token at https://console.apify.com/settings/integrations, save it yourself to `~/.config/susanoo-reels/apify.key` (`chmod 600`), and set `autopilot.scrape` to `true` in that brand's `brand/brand.json`. It is paid per result (about $2.70 per 1,000 posts on the free plan); the script prints the estimate first and stops above `--max-cost`. Claude never asks for or prints the token.
