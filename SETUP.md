# Setup

One time per computer, on macOS, Windows or Linux. `bash setup/install.sh` (Mac, Linux) or `node setup/install.mjs` (Windows, or any system) does all of this and prints each step; this page is the same path written down, so you can do it by hand or fix a step that failed. The script is safe to run again: it skips anything already done.

When Claude runs setup for you (the kit's setup here, or a brand's setup in a workspace), it asks every question as a clickable question block: pick an option, or pick "Other" and type your own answer.

Installer options: `--link` (symlink `studio/` instead of copying it, handy if you pull updates with git), `--skip-packages` (also `--skip-brew`), `--yes`, `--dry-run`, `--skip-plugins`, `--skip-sound`, `--earshot-mcp`, `--rebuild-sounds`. Run `bash setup/install.sh --help` for the list.

## 0. The browser tool (so Claude can do the web steps for you)

Every step on a website, here and in each brand's setup (your ElevenLabs key, the sound packs, the Meta app, Cloudflare, Telegram, a host), is done by Claude in your own browser with the browser tool, Claude in Chrome. You watch; you only log in, copy a key into the file Claude opens for you, and click the last Delete when something is removed. Turn it on once, before the steps below:

1. Use Google Chrome, Microsoft Edge, Brave, Arc, Vivaldi or Opera (not Safari or Firefox, and not Windows inside WSL).
2. Install the Claude extension: https://chromewebstore.google.com/detail/claude/fcoeoabgfenejglbffodgkkbkcdhcgfn and sign in with your Claude account.
3. In Claude Code, type `/chrome` and turn it on, with "Enable by default" (in a terminal, `claude --chrome` also works). It needs a Pro, Max, Ultra, Team or Enterprise plan, signed in with `/login`.

The installer checks for it near the end. The full rules (who clicks what) are in `template/docs/browser.md`. Without the browser tool every step below is still written out for you to do by hand.

## 1. Programs

Pick your system (the installer does exactly this and asks first; this is for doing it by hand):

| System | Command |
|---|---|
| macOS (Homebrew) | `brew install ffmpeg node python git uv whisper-cpp` |
| Windows (PowerShell) | `winget install OpenJS.NodeJS.LTS Gyan.FFmpeg Python.Python.3.12 Git.Git astral-sh.uv`, then `pip install faster-whisper` |
| Linux (Debian, Ubuntu) | Node.js 22 or newer from https://nodejs.org (the `nodejs` package from apt is too old on most versions), then `sudo apt install ffmpeg python3 python3-venv python3-pip git`, uv from https://docs.astral.sh/uv/, and optionally Whisper with `pipx install faster-whisper` (newer Debian and Ubuntu refuse `pip install --user`) |

On Windows and Linux, Whisper (the tool that times every spoken word) comes from `faster-whisper` instead of `whisper-cpp`; the kit uses whichever it finds. Whisper is optional: ElevenLabs voices come with their own word timings, so it is needed only for your own recordings, talking-head takes without ElevenLabs speech-to-text, and OpenAI voices (the checkup marks it optional). On Windows, where this kit says `python3` use `python`.

**Mac: Homebrew first.** If `brew` is not found, open Terminal, paste the one-line command from https://brew.sh (it asks for your Mac password, which shows nothing as you type), then paste the "Next steps" lines it prints and open a new Terminal window. **Linux:** commands that start with `sudo` ask for your password, so run them yourself in your own terminal, not through Claude.

Open a new terminal afterwards so the new commands are found.

## 2. The engine (studio)

The engine is a Claude Code skill. Install it as `bagelunit-reels`:

```bash
mkdir -p ~/.claude/skills
rsync -a --exclude node_modules studio/ ~/.claude/skills/bagelunit-reels/    # or: ln -s "$PWD/studio" ~/.claude/skills/bagelunit-reels
# Windows PowerShell: robocopy studio "$HOME\.claude\skills\bagelunit-reels" /E /XD node_modules
cd ~/.claude/skills/bagelunit-reels
npm install          # three.js and the browser driver
npm run browser      # the headless Chromium used for rendering (about 100 MB)
```

If a copy not installed by this repo is already at `~/.claude/skills/bagelunit-reels`, the installer moves it aside to `bagelunit-reels.backup-<date>` first.

**Only if you used the kit before it was renamed BagelUnit Reel Kit** (new users skip this): the installer copies your old settings folder (keys, saved voice, handle, theme) to `~/.config/bagelunit-reels/` once and keeps the old folder. It does not touch an old skill folder under its previous name; it prints a note instead. Remove that old skill folder yourself once the new one works, because two installed copies would both answer reel requests.

## 3. Your ElevenLabs key

**With the browser tool:** Claude makes the key file (step 2 below, empty), opens it in your editor, and opens elevenlabs.io. You sign up or log in; Claude picks the plan you choose (it asks before a paid one), opens the API keys page, names a new key and ticks the permissions below, and stops at **Create**. You click it, copy the key into the open file, save, and say "done". Claude never sees the key. Then it closes that tab. **By hand:**

1. Make an account at https://elevenlabs.io and create an API key at https://elevenlabs.io/app/settings/api-keys. Allow **Text to Speech** and **Voices** ("User: read" is optional; it lets the checkup show your credits). Add **Speech to Text** if you want talking-head edits without installing Whisper. The free plan is fine for trying the kit, but ElevenLabs allows only non-commercial use on it, with credit to ElevenLabs; for a business's or a client's reels use a paid plan (Starter or higher).
2. Save it, alone on one line, in `~/.config/bagelunit-reels/elevenlabs.key` (on Windows that is `C:\Users\<you>\.config\bagelunit-reels\elevenlabs.key`):

   Mac:

   ```bash
   mkdir -p ~/.config/bagelunit-reels && chmod 700 ~/.config/bagelunit-reels
   touch ~/.config/bagelunit-reels/elevenlabs.key && chmod 600 ~/.config/bagelunit-reels/elevenlabs.key
   open -e ~/.config/bagelunit-reels/elevenlabs.key      # paste the key, save, close
   ```

   Linux: the same first two lines, then `nano ~/.config/bagelunit-reels/elevenlabs.key` (paste the key, press Ctrl+O, Enter, then Ctrl+X).

   Windows (PowerShell):

   ```powershell
   New-Item -ItemType Directory -Force "$HOME\.config\bagelunit-reels" | Out-Null
   notepad "$HOME\.config\bagelunit-reels\elevenlabs.key"    # click Yes to create it, paste the key, save, close
   ```

3. Never paste the key into a Claude chat, a brand file or this repo. Each person uses their own key.

Then ask Claude to **find you a voice**: it searches the ElevenLabs library, plays you samples and saves the one you pick.

## 4. Claude Code plugin

```bash
claude plugin marketplace add heygen-com/hyperframes
claude plugin install hyperframes@hyperframes
```

Turn off HyperFrames telemetry:

```bash
npx hyperframes telemetry disable
echo 'export HYPERFRAMES_NO_TELEMETRY=1' >> ~/.zshrc     # Mac; on Linux use ~/.bashrc
```

On Windows (PowerShell): `npx hyperframes telemetry disable`, then `setx HYPERFRAMES_NO_TELEMETRY 1` and open a new window.

## 5. Sound tools (for the real-sound step)

Both are separate open-source projects (MIT). They are downloaded to `~/dev/sound/`, not into this repo.

**opus-sound-layer** (sound library, mixer, sound checks):

```bash
mkdir -p ~/dev/sound
git clone https://github.com/Bodila51/opus-sound-layer ~/dev/sound/opus-sound-layer
```

**The 7 Kenney sound packs (free, CC0): download these in your browser.** Kenney only lets a browser download its zips. A script that tries gets a web page back instead. That is what the build's `skip pack ...: File is not a zip file` message means.

**With the browser tool**, Claude opens each page, clicks **Download** and **Continue without donating...**, and the zips land in your Downloads folder; then it runs `bash setup/install.sh` again, which takes them from there. Without it, the installer does this part with you: run it in a terminal and it opens the 7 pages, waits while you download, and takes the zips from your Downloads folder. It also deletes any fake web-page "zips" left from an earlier run. By hand, on each page:

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

A real pack is between 0.4 and 6 MB. A file of about 18 KB is a web page, not the pack: delete it and download it again in the browser. To test one: `unzip -tq kenney_<pack>.zip` says "No errors detected" (Mac, Linux; on Windows, a real pack opens in File Explorer and shows folders of .ogg files).

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

On Windows (PowerShell), the same steps with Windows paths:

```powershell
git clone https://github.com/Leonxlnx/earshot $HOME\dev\sound\earshot
cd $HOME\dev\sound\earshot
uv venv --python 3.12 .venv
uv pip install --python .venv\Scripts\python.exe torch --index-url https://download.pytorch.org/whl/cpu
uv pip install --python .venv\Scripts\python.exe -e ".[mcp]"
.venv\Scripts\earshot.exe doctor --fetch
robocopy skills\earshot $HOME\.claude\skills\earshot /E
robocopy skills\real-sound $HOME\.claude\skills\real-sound /E
```

`node setup/install.mjs` does all of this for you on every system.

Optional, so Claude can call earshot as a tool:

```bash
claude mcp add --scope user earshot -- ~/dev/sound/earshot/.venv/bin/earshot mcp
```

## 6. Check

```bash
cd ~/.claude/skills/bagelunit-reels && node tools/checkup.mjs
```

Done when it shows only checks (lines marked optional can stay open).

## 7. Your first brand

Open Claude Code in the kit's folder and type `/brand-setup`. It asks the brand's name and where its folder goes (it suggests `~/Reels/<brand>-reels`), makes the folder, asks the brand questions, and tells you how to open the folder to make reels.

By hand, from the kit's folder (works on every system):

```bash
node setup/new-brand.mjs ~/Reels/my-brand-reels
cd ~/Reels/my-brand-reels && claude
```

You can also copy the `template` folder in Finder or File Explorer and rename the copy. Claude sees an empty brand and starts the brand setup questions. Inside a brand folder, run `/brand-setup` any time to change the answers.

Keep brand folders out of iCloud-synced folders (Desktop, Documents) if you can: renders write many frames, and syncing them slows everything down.

## Common snags

- **headless browser fails in the checkup:** in `~/.claude/skills/bagelunit-reels`, run `npm run browser` again.
- **ffmpeg not found right after installing:** the terminal was opened before the install; open a new one.
- **ElevenLabs 401:** wrong key or no credits left; make a new key and replace the line in the key file.
- **"opus-sound-layer library missing":** run `uv run scripts/sfx.py kit` in `~/dev/sound/opus-sound-layer`.
- **realsound.py cannot import numpy:** run it with earshot's Python: `~/dev/sound/earshot/.venv/bin/python`.
- **The laptop gets loud:** normal during a final render. Drafts are half size, and renders take turns.
- **"Operation not permitted" when a tool writes into Documents (Mac):** a security program's ransomware protection (for example Bitdefender's Safe Files) is blocking programs it does not trust. It is per program, so allowing your editor does not cover the commands it runs. Allow the shell (`zsh`, `bash`), `git`, `node`, `python3`, `ffmpeg`, `ffprobe`, `whisper-cli` and the basic file tools (`cp`, `mv`, `mkdir`, `rm`, `touch`) in the program's application-access list. Homebrew's version folders change on an upgrade, so the block can come back after one.

## Optional: Apify (outlier scan)

Only if a brand owner wants `/account-audit` to fetch posts instead of using an export. With the browser tool, Claude makes `~/.config/bagelunit-reels/apify.key` (empty, readable by you only) and opens it, then opens Apify: you sign up or log in, and Claude goes to https://console.apify.com/settings/integrations and stops at the token's copy button; you copy it into the file and save. By hand: make a token there and save it yourself to `~/.config/bagelunit-reels/apify.key` (`chmod 600`). Then set `autopilot.scrape` to `true` in that brand's `brand/brand.json`. It is paid per result (about $2.70 per 1,000 posts on the free plan); the script prints the estimate first and stops above `--max-cost`. Claude never asks for or prints the token.

## Optional: Runway (paid video clips)

Only if a brand owner turns on `autopilot.paid_renders` for Seedance clips (`/reel-builder`, about $6 to $12 per reel). With the browser tool, Claude opens the Runway developer portal (https://dev.runwayml.com): you sign up or log in and add credits (payment details are yours; Claude asks before any purchase), and Claude goes to API keys, names a new key and stops at **Create**. You copy the key. Runway's SDK reads it from the `RUNWAYML_API_SECRET` environment variable: Claude opens your shell's settings file (`~/.zshrc` on a Mac, `~/.bashrc` on Linux; on Windows, Settings, System, About, Advanced system settings, Environment Variables) at a new line `export RUNWAYML_API_SECRET="PASTE-HERE"`, and you paste it in and save. Open a new terminal afterwards. Claude never asks for or prints the key.
