#!/usr/bin/env node
// Susanoo Reel Kit installer: macOS, Windows and Linux, one script.
//
// Safe to run again: every step checks what is already there and skips it.
// It never asks for, reads or stores an API key. Your ElevenLabs key is yours to put in
// ~/.config/susanoo-reels/elevenlabs.key yourself (see SETUP.md).
// It never runs a command with administrator rights by itself: when a program has to be installed it
// shows you the exact command and asks first (or run with --yes to say yes to those questions).
//
// Usage:
//   node setup/install.mjs [--link] [--skip-packages] [--skip-plugins] [--skip-sound] [--earshot-mcp]
//                          [--rebuild-sounds] [--yes] [--dry-run]
//
//   --link            link studio/ into ~/.claude/skills/susanoo-reels instead of copying it
//                     (good if you will edit the kit or pull updates with git)
//   --skip-packages   do not install ffmpeg, Python, git, uv and Whisper (--skip-brew is the same)
//   --skip-plugins    do not add the Claude Code plugins (hyperframes, instagram-agent)
//   --skip-sound      do not set up opus-sound-layer and earshot (the real-sound step will not work)
//   --earshot-mcp     also register earshot as a user-level MCP server in Claude Code
//   --rebuild-sounds  rebuild the opus-sound-layer library even if it already exists
//   --yes             answer yes to "install this program?" questions
//   --dry-run         print what would be done, change nothing
//
// Kenney sound packs: Kenney only lets a browser download them. The script opens the 7 pack pages,
// you click Download (then "Continue without donating...") on each, and it takes the zips from your
// Downloads folder. Run it in a terminal so it can wait for you.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import cp from 'node:child_process';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const IS_WIN = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';
const F = { link: false, skipPackages: false, skipPlugins: false, skipSound: false, earshotMcp: false, rebuildSounds: false, yes: false, dryRun: false };
for (const a of process.argv.slice(2)) {
  if (a === '--link') F.link = true;
  else if (a === '--skip-packages' || a === '--skip-brew') F.skipPackages = true;
  else if (a === '--skip-plugins') F.skipPlugins = true;
  else if (a === '--skip-sound') F.skipSound = true;
  else if (a === '--earshot-mcp') F.earshotMcp = true;
  else if (a === '--rebuild-sounds') F.rebuildSounds = true;
  else if (a === '--yes') F.yes = true;
  else if (a === '--dry-run') F.dryRun = true;
  else if (a === '-h' || a === '--help') {
    const src = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n');
    console.log(src.slice(1, src.findIndex((l, i) => i > 0 && !l.startsWith('//'))).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
    process.exit(0);
  } else { console.error(`Unknown option: ${a} (try --help)`); process.exit(2); }
}

const HOME = os.homedir();
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STUDIO = path.join(REPO, 'studio');
const SKILLS = path.join(HOME, '.claude', 'skills');
const TARGET = path.join(SKILLS, 'susanoo-reels');
const CONFIG = path.join(HOME, '.config', 'susanoo-reels');
const SOUND = path.join(HOME, 'dev', 'sound');
const OPUS = path.join(SOUND, 'opus-sound-layer');
const EARSHOT = path.join(SOUND, 'earshot');
const MARKER = '.susanoo-reel-kit';
const PACKS = ['interface-sounds', 'ui-audio', 'impact-sounds', 'sci-fi-sounds', 'digital-audio', 'casino-audio', 'rpg-audio'];
const DL = path.join(HOME, 'Downloads');
const VENV_BIN = (name) => path.join(EARSHOT, '.venv', IS_WIN ? 'Scripts' : 'bin', IS_WIN ? `${name}.exe` : name);

// ---------------------------------------------------------------- helpers
let STEP = 0;
const step = (t) => console.log(`\n==> Step ${++STEP}: ${t}`);
const info = (t) => console.log(`    ${t}`);
const ok = (t) => console.log(`    OK: ${t}`);
const warn = (t) => console.log(`    NOTE: ${t}`);
const exists = (p) => fs.existsSync(p);

function have(cmd) {
  return cp.spawnSync(IS_WIN ? 'where' : 'which', [cmd], { stdio: 'ignore' }).status === 0;
}
/** Run a command. Prints instead of running with --dry-run. capture:true returns {status,out}. */
function sh(cmd, argv = [], o = {}) {
  if (F.dryRun && !o.always) { info(`[dry run] ${cmd} ${argv.join(' ')}`); return { status: 0, out: '' }; }
  const q = (s) => (IS_WIN && !o.noShell && /[\s&|<>^"();]/.test(s) ? `"${String(s).replace(/"/g, '\\"')}"` : s);   // Windows shell: quote paths with spaces
  const r = cp.spawnSync(q(cmd), argv.map(q), {
    cwd: o.cwd, env: o.env || process.env, encoding: 'utf8',
    stdio: o.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit', shell: IS_WIN && !o.noShell,
  });
  return { status: r.status ?? 1, out: `${r.stdout || ''}${r.stderr || ''}` };
}
let PY = null;
function python() {
  if (PY) return PY;
  for (const c of IS_WIN ? ['python', 'py'] : ['python3', 'python']) {
    const r = cp.spawnSync(c, ['-c', 'import sys;print(sys.version_info[0])'], { encoding: 'utf8' });
    if (r.status === 0 && r.stdout.trim() === '3') return (PY = c);
  }
  return null;
}
async function confirm(q) {
  if (F.yes) return true;
  if (!process.stdin.isTTY || !process.stdout.isTTY) return false;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const a = await rl.question(`    ${q} [y/N] `);
  rl.close();
  return /^y/i.test(a.trim());
}
async function ask(q) {
  if (!process.stdin.isTTY) return 's';
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const a = await rl.question(q);
  rl.close();
  return a.trim();
}
const EXCLUDE = (n) => n === 'node_modules' || n === '__pycache__' || n === MARKER || n === '.DS_Store' || n.includes('.orig-');
/** Make dst match src (like rsync -a --delete), leaving node_modules and the marker alone. */
function mirror(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  const want = new Set();
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (EXCLUDE(e.name)) continue;
    want.add(e.name);
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) mirror(s, d); else fs.copyFileSync(s, d);
  }
  for (const e of fs.readdirSync(dst, { withFileTypes: true })) {
    if (want.has(e.name) || e.name === 'node_modules' || e.name === MARKER) continue;
    fs.rmSync(path.join(dst, e.name), { recursive: true, force: true });
  }
}
const stamp = () => new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
function openUrl(u) {
  if (IS_MAC) sh('open', [u], { noShell: true }); else if (IS_WIN) sh('cmd', ['/c', 'start', '', u], { noShell: true }); else sh('xdg-open', [u], { noShell: true });
}

// ---------------------------------------------------------------- start
if (!exists(path.join(STUDIO, 'KIT.md'))) { console.error('Cannot find studio/KIT.md next to this script. Run it from a clone of the repo.'); process.exit(1); }
console.log(`Susanoo Reel Kit installer\nRepo: ${REPO}\nSystem: ${process.platform} (${os.arch()}), Node ${process.versions.node}${F.dryRun ? '\nDRY RUN: nothing will be changed' : ''}`);
if (Number(process.versions.node.split('.')[0]) < 18) { console.error('Node 18 or newer is needed. Install the current LTS from https://nodejs.org and run this again.'); process.exit(1); }

// ---------------------------------------------------------------- 1. programs
step('Programs: ffmpeg, Python 3, git, uv, speech-to-text (Whisper)');
let missingAfter = [];
if (F.skipPackages) warn('skipped (--skip-packages)');
else {
  const need = [];
  if (!have('ffmpeg')) need.push('ffmpeg'); else ok('ffmpeg found');
  if (!python()) need.push('python'); else ok(`Python 3 found (${python()})`);
  if (!have('git')) need.push('git'); else ok('git found');
  if (!have('uv')) need.push('uv'); else ok('uv found');
  const whisperOk = have('whisper-cli') || (python() && cp.spawnSync(python(), ['-c', 'import faster_whisper'], { stdio: 'ignore' }).status === 0);
  if (!whisperOk) need.push('whisper'); else ok('Whisper (word timing) found');

  if (need.length) {
    const cmds = []; const manual = [];
    const want = (n) => need.includes(n);
    if (IS_MAC) {
      if (!have('brew')) manual.push('Homebrew is not installed. Install it from https://brew.sh, open a new terminal, then run this again.');
      else {
        const map = { ffmpeg: 'ffmpeg', python: 'python', git: 'git', uv: 'uv', whisper: 'whisper-cpp' };
        cmds.push(['brew', 'install', ...need.map((n) => map[n])]);
      }
    } else if (IS_WIN) {
      if (!have('winget')) manual.push('winget was not found. Install: ffmpeg (https://www.gyan.dev/ffmpeg/builds/), Python 3 (https://python.org, tick "Add to PATH"), Git (https://git-scm.com), uv (https://docs.astral.sh/uv/).');
      else {
        const ids = { ffmpeg: 'Gyan.FFmpeg', python: 'Python.Python.3.12', git: 'Git.Git', uv: 'astral-sh.uv' };
        for (const n of need) if (ids[n]) cmds.push(['winget', 'install', '--id', ids[n], '-e', '--accept-package-agreements', '--accept-source-agreements']);
      }
    } else if (have('apt-get')) {
      const pk = [];
      if (want('ffmpeg')) pk.push('ffmpeg'); if (want('python')) pk.push('python3', 'python3-venv', 'python3-pip'); if (want('git')) pk.push('git');
      if (pk.length) cmds.push(['sudo', 'apt-get', 'install', '-y', ...pk]);
      if (want('uv')) manual.push('uv: run  curl -LsSf https://astral.sh/uv/install.sh | sh  (or pipx install uv), then open a new terminal.');
    } else if (have('pacman')) {
      const pk = [];
      if (want('ffmpeg')) pk.push('ffmpeg'); if (want('python')) pk.push('python', 'python-pip'); if (want('git')) pk.push('git'); if (want('uv')) pk.push('uv');
      if (pk.length) cmds.push(['sudo', 'pacman', '-S', '--needed', ...pk]);
    } else {
      manual.push(`Install with your package manager: ${need.filter((n) => n !== 'whisper').join(', ')} (Fedora and others: ffmpeg comes from RPM Fusion). uv: https://docs.astral.sh/uv/`);
    }
    // Whisper on Windows and Linux: faster-whisper through pip (no compiler needed). The engine falls back to it.
    if (want('whisper') && !IS_MAC) manual.push('__whisper__');

    for (const c of cmds) {
      info(`needs: ${c.join(' ')}`);
      if (await confirm('Run this command now?')) {
        const r = sh(c[0], c.slice(1));
        if (r.status !== 0) warn(`that command did not finish (exit ${r.status}); install the program by hand and run this again`);
      } else info('(not run) copy the command above into a terminal yourself, then run this installer again');
    }
    for (const m of manual) {
      if (m === '__whisper__') {
        const py = python();
        if (!py) { warn('Whisper: install Python 3 first, then run: pip install faster-whisper'); continue; }
        info('needs: pip install --user faster-whisper   (word timing; the model downloads on first use)');
        if (await confirm('Run this command now?')) {
          const r = sh(py, ['-m', 'pip', 'install', '--user', 'faster-whisper']);
          if (r.status !== 0) warn('pip could not install it (some Linux systems block system pip). Use  pipx  or a virtual environment, or  sudo apt install python3-venv  and try again. See SETUP.md.');
        } else info('(not run) later: pip install faster-whisper');
      } else warn(m);
    }
  }
  // re-check what is required to continue
  PY = null;
  for (const [n, ok2] of [['ffmpeg', have('ffmpeg')], ['python 3', !!python()], ['git', have('git')]]) if (!ok2) missingAfter.push(n);
  if (missingAfter.length && !F.dryRun) {
    console.log(`\nStill missing: ${missingAfter.join(', ')}. Install them (the commands above), open a NEW terminal, and run this again.`);
    process.exit(1);
  }
}
for (const c of ['node', 'npm']) if (!have(c) && !F.dryRun) { warn(`${c} not found on PATH. Open a new terminal and run this again.`); process.exit(1); }

// ---------------------------------------------------------------- 1b. whisper model
step('Whisper model (word timing for voices and reel teardowns)');
{
  const MODELS = [path.join(CONFIG, 'ggml-base.bin'), path.join(HOME, '.cache', 'whisper-cpp', 'ggml-base.bin'), path.join(HOME, '.cache', 'whisper-cpp', 'ggml-base.en.bin')];
  const hasFaster = !!python() && cp.spawnSync(python(), ['-c', 'import faster_whisper'], { stdio: 'ignore' }).status === 0;
  if (hasFaster) ok('faster-whisper is installed; it needs no separate model file');
  else if (!have('whisper-cli')) warn('no Whisper found. Install one: pip install faster-whisper');
  else if (MODELS.some(exists)) ok('whisper-cli has a model file');
  else {
    warn('whisper-cli is installed but has no model file, so word timing would fail.');
    const dest = MODELS[0], url = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin';
    info(`needs: download ${url} (about 142 MB) to ${dest}`);
    if (F.dryRun) info('[dry run] not downloaded');
    else if (await confirm('Download it now?')) {
      try {
        fs.mkdirSync(CONFIG, { recursive: true, mode: 0o700 });
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(`${dest}.part`));
        if (fs.statSync(`${dest}.part`).size < 100e6) throw new Error('the file is too small, so it is not the model');
        fs.renameSync(`${dest}.part`, dest);
        ok(`model saved to ${dest}`);
      } catch (e) { fs.rmSync(`${dest}.part`, { force: true }); warn(`could not download the model (${e.message}). Do it by hand: save ${url} as ${dest}, or pip install faster-whisper`); }
    } else info(`(not downloaded) save ${url} as ${dest}, or pip install faster-whisper`);
  }
}

// ---------------------------------------------------------------- 2. studio
step(`Install the studio as the Claude Code skill at ${TARGET}`);
if (!F.dryRun) fs.mkdirSync(SKILLS, { recursive: true });
const isLink = () => { try { return fs.lstatSync(TARGET).isSymbolicLink(); } catch { return false; } };
if (exists(TARGET) && !isLink() && !exists(path.join(TARGET, MARKER))) {
  const b = `${TARGET}.backup-${stamp()}`;
  info(`an older copy not installed by this repo is there; moving it to ${b}`);
  if (!F.dryRun) fs.renameSync(TARGET, b);
}
if (F.link) {
  if (exists(TARGET) && !isLink()) {
    const b = `${TARGET}.backup-${stamp()}`;
    info(`switching from a copy to a link; moving the copy to ${b}`);
    if (!F.dryRun) fs.renameSync(TARGET, b);
  }
  if (!F.dryRun) {
    if (isLink()) fs.unlinkSync(TARGET);
    fs.symlinkSync(STUDIO, TARGET, IS_WIN ? 'junction' : 'dir');
  }
  ok(`linked ${TARGET} -> ${STUDIO}`);
} else {
  if (isLink() && !F.dryRun) { fs.unlinkSync(TARGET); info('replacing the old link with a copy'); }
  if (!F.dryRun) mirror(STUDIO, TARGET);
  ok(`copied studio/ to ${TARGET}`);
}
if (!F.dryRun) { try { fs.writeFileSync(path.join(TARGET, MARKER), new Date().toISOString().slice(0, 10) + '\n'); } catch { /* linked */ } }

step('Kit packages (npm install) and the render browser (npm run browser)');
{
  const cwd = F.dryRun && !exists(TARGET) ? REPO : TARGET;
  const a = sh('npm', ['install', '--no-fund', '--no-audit'], { cwd });
  const b = a.status === 0 ? sh('npm', ['run', 'browser'], { cwd }) : a;
  if (b.status !== 0) { warn('npm install or the browser download failed; see the messages above, then run this again'); process.exit(1); }
  ok('packages and headless Chromium ready');
}

// ---------------------------------------------------------------- 3. settings folder + key
step('Settings folder for your own keys');
if (!F.dryRun) fs.mkdirSync(CONFIG, { recursive: true, mode: 0o700 });
const keyFile = path.join(CONFIG, 'elevenlabs.key');
if (exists(keyFile) && fs.statSync(keyFile).size > 0) ok('an ElevenLabs key file exists (not read by this script)');
else {
  warn('no ElevenLabs key yet. Make a key at https://elevenlabs.io/app/settings/api-keys');
  info('(allow Text to Speech and Voices), then put it on ONE line in this file:');
  info(`  ${keyFile}`);
  info('Create the file in any text editor (Notepad on Windows). Never paste the key into a Claude chat.');
}

// ---------------------------------------------------------------- 4. plugins + telemetry
step('Claude Code plugins (hyperframes, instagram-agent)');
if (F.skipPlugins) warn('skipped (--skip-plugins)');
else if (!have('claude')) warn('the claude command was not found. Install Claude Code, then run this again (or add the plugins by hand, see SETUP.md).');
else {
  const listed = sh('claude', ['plugin', 'list'], { capture: true, always: true }).out;
  const addPlugin = (market, plugin) => {
    const name = plugin.split('@')[0];
    if (listed.includes(name)) { ok(`${name} already installed`); return; }
    if (sh('claude', ['plugin', 'marketplace', 'add', market]).status !== 0) warn(`marketplace ${market} may already be added`);
    if (sh('claude', ['plugin', 'install', plugin]).status !== 0) warn(`could not install ${plugin}; add it by hand (see SETUP.md)`);
  };
  addPlugin('heygen-com/hyperframes', 'hyperframes@hyperframes');
  addPlugin('Jakeschincariol/instagram-agent-skill', 'instagram-agent@instagram-agent-skill');
}

step('HyperFrames telemetry off');
if (IS_WIN) {
  if (process.env.HYPERFRAMES_NO_TELEMETRY === '1') ok('already set');
  else { sh('setx', ['HYPERFRAMES_NO_TELEMETRY', '1']); ok('set HYPERFRAMES_NO_TELEMETRY=1 for your user (new terminals pick it up)'); }
} else {
  for (const rc of [path.join(HOME, '.zshrc'), path.join(HOME, '.bashrc')]) {
    if (!exists(rc)) continue;
    if (fs.readFileSync(rc, 'utf8').includes('HYPERFRAMES_NO_TELEMETRY')) ok(`already set in ${rc}`);
    else { if (!F.dryRun) fs.appendFileSync(rc, '\n# Susanoo Reel Kit: no HyperFrames telemetry\nexport HYPERFRAMES_NO_TELEMETRY=1\n'); ok(`added HYPERFRAMES_NO_TELEMETRY=1 to ${rc}`); }
  }
}
process.env.HYPERFRAMES_NO_TELEMETRY = '1';
if (sh('npx', ['--yes', 'hyperframes', 'telemetry', 'disable'], { capture: true }).status === 0) ok('hyperframes telemetry disabled');
else warn("could not run 'npx hyperframes telemetry disable'; the environment variable still turns it off");

// ---------------------------------------------------------------- 5. sound tools
let MISSING = [];
if (F.skipSound) { step('Sound tools'); warn('skipped (--skip-sound). The real-sound step needs them.'); }
else {
  const py = python() || 'python3';
  const zipOk = (f) => exists(f) && fs.statSync(f).size > 0 &&
    cp.spawnSync(py, ['-c', 'import sys,zipfile;sys.exit(1 if zipfile.ZipFile(sys.argv[1]).testzip() else 0)', f], { stdio: 'ignore' }).status === 0;
  const zipDir = (dir, dst) => cp.spawnSync(py, ['-c', 'import sys,shutil;shutil.make_archive(sys.argv[2][:-4],"zip",sys.argv[1])', dir, dst], { stdio: 'ignore' }).status === 0;
  if (!F.dryRun) fs.mkdirSync(SOUND, { recursive: true });

  step(`opus-sound-layer (MIT) at ${OPUS}`);
  if (exists(path.join(OPUS, '.git'))) ok('already cloned'); else sh('git', ['clone', 'https://github.com/Bodila51/opus-sound-layer', OPUS]);
  const RAW = path.join(OPUS, 'audio', 'kit', '_raw');
  const CATALOG = path.join(OPUS, 'audio', 'kit', 'catalog.json');
  if (!F.dryRun) fs.mkdirSync(RAW, { recursive: true });

  step('Kenney sound packs (7 free CC0 packs, downloaded in your browser)');
  // Kenney only serves its zips to a browser; a script gets a web page back that would be saved under the
  // zip's name. So: never trust a file because it exists, test it as a zip, and fetch the real packs by browser.
  let imported = false;
  const rawZip = (p) => path.join(RAW, `kenney_${p}.zip`);
  const dropFake = (quiet) => { if (F.dryRun) return; for (const p of PACKS) if (exists(rawZip(p)) && !zipOk(rawZip(p))) { fs.rmSync(rawZip(p), { force: true }); if (!quiet) warn(`removed kenney_${p}.zip: it was a web page, not the sound pack`); } };
  const downloads = () => (exists(DL) ? fs.readdirSync(DL, { withFileTypes: true }) : []);
  const importPack = (p) => {
    const zips = downloads().filter((e) => e.isFile() && e.name.toLowerCase().includes(p) && e.name.toLowerCase().endsWith('.zip'))
      .map((e) => path.join(DL, e.name)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    for (const z of zips) if (zipOk(z)) { fs.copyFileSync(z, rawZip(p)); ok(`kenney_${p}.zip taken from Downloads`); imported = true; return true; }
    for (const e of downloads().filter((x) => x.isDirectory() && x.name.toLowerCase().includes(p))) {   // Safari unzips by itself
      const d = path.join(DL, e.name);
      const hasAudio = (dir) => fs.readdirSync(dir, { withFileTypes: true }).some((x) => (x.isDirectory() ? hasAudio(path.join(dir, x.name)) : /\.(ogg|wav)$/i.test(x.name)));
      if (hasAudio(d)) { fs.rmSync(rawZip(p), { force: true }); if (zipDir(d, rawZip(p))) { ok(`kenney_${p}.zip made from the unzipped folder in Downloads`); imported = true; return true; } }
    }
    return false;
  };
  const libName = (p) => ({ 'interface-sounds': 'interface', 'impact-sounds': 'impact', 'sci-fi-sounds': 'scifi', 'digital-audio': 'digital', 'casino-audio': 'casino', 'rpg-audio': 'rpg' }[p] || p);

  dropFake(false);
  for (const p of PACKS) if (!zipOk(rawZip(p)) && !importPack(p)) MISSING.push(p);
  if (MISSING.length && process.stdin.isTTY && process.stdout.isTTY && !F.dryRun) {
    warn(`${MISSING.length} of 7 packs still needed. Kenney only allows downloads from a browser, so this part is by hand (about 2 minutes).`);
    info('Opening each pack page in your browser now. On each page:');
    info('  1. click Download');
    info("  2. a 'Consider a donation' box opens: click 'Continue without donating...' (the packs are free)");
    info('  3. leave the zip in your Downloads folder; this script picks it up from there');
    for (const p of MISSING) { info(`  https://kenney.nl/assets/${p}`); openUrl(`https://kenney.nl/assets/${p}`); }
    while (MISSING.length) {
      const reply = await ask('    Press Enter when the downloads have finished (or type s then Enter to skip for now): ');
      MISSING = MISSING.filter((p) => !importPack(p));
      if (reply.toLowerCase() === 's') break;
      if (MISSING.length) warn(`not in Downloads yet: ${MISSING.join(' ')}`);
    }
  }
  if (MISSING.length) {
    warn(`Kenney packs missing: ${MISSING.join(' ')}`);
    info('Reels still work, but the real-sound step has no ui or zap sounds and fewer impact and sci-fi sounds. To add them:');
    info("  open each page below, click Download, then 'Continue without donating...', leave the zip in Downloads");
    for (const p of MISSING) info(`  https://kenney.nl/assets/${p}`);
    info('  then run: node setup/install.mjs --rebuild-sounds');
  } else ok('all 7 Kenney packs present and valid');

  step('Sound library (opus-sound-layer, about 1,140 CC0 sounds)');
  let needBuild = F.rebuildSounds || !exists(CATALOG) || imported;
  if (!needBuild) {
    const cat = fs.readFileSync(CATALOG, 'utf8');
    for (const p of PACKS) if (zipOk(rawZip(p)) && !cat.includes(`/kenney-${libName(p)}-`)) { info(`the library was built without the ${p} pack; rebuilding it`); needBuild = true; break; }
  }
  if (needBuild) {
    info('building the sound library (uv run scripts/sfx.py kit); this downloads CC0 recordings and takes a few minutes');
    if (MISSING.length) info("the missing Kenney packs will show as 'skip pack ...: File is not a zip file'; that is expected");
    if (sh('uv', ['run', 'scripts/sfx.py', 'kit'], { cwd: OPUS }).status !== 0) warn('library build reported errors; run: node setup/install.mjs --rebuild-sounds');
    dropFake(true);
  } else ok('sound library already built with every Kenney pack you have (use --rebuild-sounds to rebuild)');
  if (exists(CATALOG)) {
    const cat = fs.readFileSync(CATALOG, 'utf8');
    const kn = (cat.match(/"id": "[a-z]*\/kenney-/g) || []).length, all = (cat.match(/"id": /g) || []).length;
    if (!MISSING.length) ok(`library: ${all} sounds, ${kn} of them from Kenney (complete: about 1,140 sounds, 309 from Kenney)`);
    else warn(`library: ${all} sounds, ${kn} of them from Kenney (complete: about 1,140, 309 from Kenney). Until the packs are in, the ui and zap sound types are empty.`);
  }

  step(`earshot (MIT) at ${EARSHOT}`);
  if (exists(path.join(EARSHOT, '.git'))) ok('already cloned'); else sh('git', ['clone', 'https://github.com/Leonxlnx/earshot', EARSHOT]);
  const venvPy = VENV_BIN('python');
  if (exists(venvPy)) ok('.venv exists'); else sh('uv', ['venv', '--python', '3.12', '.venv'], { cwd: EARSHOT });
  if (exists(venvPy) && sh(venvPy, ['-c', 'import torch'], { capture: true, always: true }).status === 0) ok('torch installed');
  else { info('installing CPU-only torch'); sh('uv', ['pip', 'install', '--python', venvPy, 'torch', '--index-url', 'https://download.pytorch.org/whl/cpu']); }
  if (exists(VENV_BIN('earshot'))) ok('earshot installed'); else sh('uv', ['pip', 'install', '--python', venvPy, '-e', '.[mcp]'], { cwd: EARSHOT });
  info('checking earshot and fetching its two open models (about 1.1 GB, first time only)');
  if (sh(VENV_BIN('earshot'), ['doctor', '--fetch']).status !== 0) warn(`earshot doctor reported a problem; run it again: ${VENV_BIN('earshot')} doctor --fetch`);

  step(`earshot skills (earshot, real-sound) into ${SKILLS}`);
  for (const s of ['earshot', 'real-sound']) {
    const from = path.join(EARSHOT, 'skills', s);
    if (exists(from)) { if (!F.dryRun) mirror(from, path.join(SKILLS, s)); ok(`skill ${s}`); } else warn(`skill ${s} not found in the earshot repo`);
  }

  step('earshot MCP server (optional)');
  if (F.earshotMcp && have('claude')) {
    if (sh('claude', ['mcp', 'get', 'earshot'], { capture: true, always: true }).status === 0) ok('already registered');
    else if (sh('claude', ['mcp', 'add', '--scope', 'user', 'earshot', '--', VENV_BIN('earshot'), 'mcp']).status === 0) ok('registered');
  } else info(`not registered. To add it later: claude mcp add --scope user earshot -- ${VENV_BIN('earshot')} mcp`);
}

// ---------------------------------------------------------------- 6. checkup
step('Kit checkup (node tools/checkup.mjs)');
if (sh('node', ['tools/checkup.mjs'], { cwd: exists(TARGET) ? TARGET : STUDIO }).status !== 0) warn('the checkup lists items to fix above; SETUP.md explains each one');

console.log('\nDone. Next: copy template/ to a folder for your brand, open Claude Code in that copy and run /brand-setup.');
if (MISSING.length) console.log(`Still to do: the Kenney packs ${MISSING.join(' ')} (see the "Kenney sound packs" step above). Reels work without them.`);
