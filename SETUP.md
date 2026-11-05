# Setup

One time per computer. `bash setup/install.sh` does all of this and prints each step; this page is the same path written down, so you can do it by hand or fix a step that failed. The script is safe to run again: it skips anything already done.

Installer options: `--link` (symlink `studio/` instead of copying it, handy if you pull updates with git), `--skip-brew`, `--skip-plugins`, `--skip-sound`, `--earshot-mcp`, `--rebuild-sounds`. Run `bash setup/install.sh --help` for the list.

## 1. Programs

```bash
brew install ffmpeg node uv whisper-cpp numpy
```

Open a new terminal afterwards so the new commands are found.

## 2. The engine (studio)

The engine is a Claude Code skill. Install it as `susanoo-reels`:

```bash
mkdir -p ~/.claude/skills
rsync -a --exclude node_modules studio/ ~/.claude/skills/susanoo-reels/    # or: ln -s "$PWD/studio" ~/.claude/skills/susanoo-reels
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
cd ~/dev/sound/opus-sound-layer
uv run scripts/sfx.py kit
```

Seven Kenney packs (CC0) have signed download links, so you download them in a browser. Open each page, download the zip and save it in `~/dev/sound/opus-sound-layer/audio/kit/_raw/` named `kenney_<pack>.zip`:

| Pack page | Save as |
|---|---|
| https://kenney.nl/assets/interface-sounds | `kenney_interface-sounds.zip` |
| https://kenney.nl/assets/ui-audio | `kenney_ui-audio.zip` |
| https://kenney.nl/assets/impact-sounds | `kenney_impact-sounds.zip` |
| https://kenney.nl/assets/sci-fi-sounds | `kenney_sci-fi-sounds.zip` |
| https://kenney.nl/assets/digital-audio | `kenney_digital-audio.zip` |
| https://kenney.nl/assets/casino-audio | `kenney_casino-audio.zip` |
| https://kenney.nl/assets/rpg-audio | `kenney_rpg-audio.zip` |

Then rebuild the library: `uv run scripts/sfx.py kit` again (or `bash setup/install.sh --rebuild-sounds`). If Claude Code's auto mode blocks running the downloaded build script, run it yourself in a terminal.

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
