#!/usr/bin/env node
// checkup.mjs · walks through everything the kit depends on and prints ✓ / ✗ / ○ with the exact fix. Keys are tested, never shown.
//   node tools/checkup.mjs                 the full check (opens the headless browser once to test WebGL)
//   node tools/checkup.mjs --quick         the same without the browser test
//   node tools/checkup.mjs --set-plan max  remember the AI plan (max | pro | api | team | codex | cursor | other)
//   node tools/checkup.mjs --set-brand @name --set-theme studio   remember the handle and/or theme (studio | harbor | ochre | ink, or a #hex accent)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { SKILL } from './server.mjs';

const NEW_CONFIG_DIR = path.join(os.homedir(), '.config', 'susanoo-reels');
const OLD_CONFIG_DIR = path.join(os.homedir(), '.config', 'susanoo-reels');   // migration fallback: same folder (kept for compatibility)
const CONFIG_DIR = fs.existsSync(NEW_CONFIG_DIR) || !fs.existsSync(OLD_CONFIG_DIR) ? NEW_CONFIG_DIR : OLD_CONFIG_DIR;
const CONFIG = path.join(CONFIG_DIR, 'config.json');
const PLATFORM = os.platform();
const PY = PLATFORM === 'win32' ? 'python' : 'python3';
const PLANS = { max: true, api: true, team: true, pro: false, codex: false, cursor: false, other: false };   // true = builds shots in parallel
const THEMES = ['studio', 'harbor', 'ochre', 'ink', 'clay', 'cobalt', 'forest', 'mono'];
const args = process.argv.slice(2);
const valueOf = (flag) => (args.includes(flag) ? String(args[args.indexOf(flag) + 1] || '').trim() : null);

const loadConfig = () => { try { return JSON.parse(fs.readFileSync(CONFIG, 'utf8')); } catch { return {}; } };
const saveConfig = (cfg) => { fs.mkdirSync(CONFIG_DIR, { recursive: true }); fs.writeFileSync(CONFIG, JSON.stringify(cfg, null, 2)); };
const effortWords = (plan, long = false) => (PLANS[plan] ? 'full effort (shots built in parallel)' : long ? 'lean effort (one shot at a time, fits usage limits)' : 'lean effort (one shot at a time)');
// a command's output when it succeeds, else null
const output = (cmd, cmdArgs) => { const r = spawnSync(cmd, cmdArgs, { encoding: 'utf8' }); return r.status === 0 ? String(r.stdout || r.stderr || '').trim() : null; };
const perOS = ({ mac, win, linux }) => (PLATFORM === 'darwin' ? mac : PLATFORM === 'win32' ? win : linux);
const installed = (pkg) => fs.existsSync(path.join(SKILL, 'node_modules', pkg, 'package.json'));

/* ── the "remember this" switches: save and stop ─────────────────────────────────────────────────────────────────────── */
if (args.includes('--set-plan')) {
  const plan = valueOf('--set-plan').toLowerCase();
  if (!(plan in PLANS)) { console.error(`--set-plan takes one of: ${Object.keys(PLANS).join(', ')}`); process.exit(1); }
  saveConfig({ ...loadConfig(), agent_plan: plan });
  console.log(`saved: AI plan ${plan} → ${effortWords(plan)}`);
  process.exit(0);
}
if (args.includes('--set-brand') || args.includes('--set-theme')) {
  const handle = valueOf('--set-brand'), theme = valueOf('--set-theme');
  if (handle !== null && !/^@?[\w.]{1,30}$/.test(handle)) { console.error('--set-brand takes a handle like @name'); process.exit(1); }
  if (theme !== null && !THEMES.includes(theme.toLowerCase()) && !/^#[0-9a-f]{6}$/i.test(theme)) { console.error('--set-theme takes studio | harbor | ochre | ink, or an accent like #1E6BFF'); process.exit(1); }
  const cfg = loadConfig(), said = [];
  if (handle !== null) { cfg.brand = { ...(cfg.brand || {}), handle: handle.startsWith('@') ? handle : '@' + handle }; said.push('handle ' + cfg.brand.handle); }
  if (theme !== null) { cfg.theme = theme.startsWith('#') ? { accent: theme.toUpperCase() } : theme.toLowerCase(); said.push('theme ' + (typeof cfg.theme === 'string' ? cfg.theme : 'accent ' + cfg.theme.accent)); }
  saveConfig(cfg);
  console.log(`saved: ${said.join(' · ')}`);
  process.exit(0);
}

/* ── the report ─────────────────────────────────────────────────────────────────────────────────────────────────────── */
const report = [];
let toFix = 0;
const ok = (what, note = '') => report.push(`  ✓ ${what}${note ? '  ' + note : ''}`);
const bad = (what, fix) => { toFix++; report.push(`  ✗ ${what}\n      fix: ${fix}`); };
const maybe = (what, fix) => report.push(`  ○ ${what}\n      fix: ${fix}`);   // optional: does not count as a problem
const cfg = loadConfig();

function tools() {
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  nodeMajor >= 18 ? ok('Node.js', `v${process.versions.node}`) : bad('Node.js 18 or newer', 'install the LTS from https://nodejs.org, then reopen the terminal');
  installed('playwright') && installed('three') ? ok('npm packages', 'playwright, three') : bad('npm packages', `cd "${SKILL}" && npm install`);
  const ff = output('ffmpeg', ['-version']);
  if (!ff) bad('ffmpeg', perOS({ mac: 'brew install ffmpeg   (no Homebrew yet? https://brew.sh)', win: 'winget install Gyan.FFmpeg   (then reopen the terminal)', linux: 'sudo apt install ffmpeg' }));
  else {
    ok('ffmpeg', ff.split('\n')[0].split(' ').slice(0, 3).join(' '));
    if (!output('ffprobe', ['-version'])) bad('ffprobe', 'it ships with ffmpeg: reinstall ffmpeg');
  }
  const py = output(PY, ['--version']);
  if (!py) bad('Python 3', perOS({ mac: 'brew install python', win: 'install from https://python.org and tick "Add to PATH"', linux: 'sudo apt install python3 python3-pip' }));
  else {
    ok('Python', py.replace('Python ', 'v'));
    output(PY, ['-c', 'import numpy']) !== null ? ok('numpy') : bad('numpy (used by the sound mix)', `${PY} -m pip install numpy`);
  }
  return Boolean(py);
}

async function browser() {
  if (!installed('playwright') || args.includes('--quick')) return;
  try {
    const { launch } = await import('./chromium.mjs');
    const b = await launch();
    const webgl = await (await b.newPage()).evaluate(() => Boolean(document.createElement('canvas').getContext('webgl2')));
    await b.close();
    webgl ? ok('headless browser', 'Chromium with WebGL') : bad('WebGL in the headless browser', 'the 3D modes need it: update your graphics driver, or point CHROME_PATH at an installed Chrome');
  } catch (err) { bad('headless browser', `cd "${SKILL}" && npm run browser   (${String(err.message).split('\n')[0].slice(0, 120)})`); }
}

async function elevenlabsKey() {
  const file = [path.join(CONFIG_DIR, 'elevenlabs.key'), path.join(os.homedir(), '.config', 'elevenlabs', 'key')].find((f) => fs.existsSync(f));
  const key = process.env.ELEVENLABS_API_KEY || (file ? fs.readFileSync(file, 'utf8').trim() : '');
  if (!key) {
    return bad('ElevenLabs API key', `make one at https://elevenlabs.io/app/settings/api-keys (the free plan works) and save it as ONE line in\n           ${path.join(CONFIG_DIR, 'elevenlabs.key')}\n           (or set ELEVENLABS_API_KEY). Never paste a key into the chat.`);
  }
  let res;
  try { res = await fetch('https://api.elevenlabs.io/v1/user/subscription', { headers: { 'xi-api-key': key } }); }
  catch { return ok('ElevenLabs key', 'saved (offline right now, not verified)'); }
  if (res.status === 401) {
    return /missing_permissions|user_read/.test(await res.text())
      ? ok('ElevenLabs key', 'saved (it lacks the "User: read" permission, so credits can\'t be shown; that\'s fine)')
      : bad('ElevenLabs API key', 'the saved key was refused: make a new one and replace the file content');
  }
  if (!res.ok) return ok('ElevenLabs key', `saved (status check answered ${res.status})`);
  const sub = await res.json(), left = (sub.character_limit ?? 0) - (sub.character_count ?? 0);
  ok('ElevenLabs key', `plan ${sub.tier}, about ${left.toLocaleString()} characters left (a 45 s reel uses about 800)`);
  if (left < 900) maybe('ElevenLabs credits', 'not enough for one reel: top up or wait for the monthly reset');
}

async function voice() {
  const provider = cfg.voice?.provider || 'elevenlabs';
  if (provider === 'elevenlabs') await elevenlabsKey();
  else if (provider === 'openai') {
    process.env.OPENAI_API_KEY || fs.existsSync(path.join(CONFIG_DIR, 'openai.key')) ? ok('OpenAI API key') : bad('OpenAI API key', `save it as one line in ${path.join(CONFIG_DIR, 'openai.key')}`);
  }
  if (cfg.voice?.voice_id || provider !== 'elevenlabs') ok('voice', cfg.voice?.name || cfg.voice?.voice_id || provider);
  else bad('no voice picked yet', 'ask Claude "help me pick a voice" (python3 tools/voicebank.py search "...")');
}

// the AI can't see the user's subscription, so it asks once and saves the answer
function plan() {
  if (cfg.agent_plan) ok('AI plan', `${cfg.agent_plan} → ${effortWords(cfg.agent_plan, true)}`);
  else bad('AI plan not set', 'ask which plan is in use (Claude Pro, Claude Max, API, Team, Codex, Cursor), then: node tools/checkup.mjs --set-plan <max|pro|api|team|codex|cursor|other>');
}

function whisper(hasPython) {
  const cpp = output('whisper-cli', ['--help']) !== null;
  const faster = hasPython && output(PY, ['-c', 'import faster_whisper']) !== null;
  const multilingual = [path.join(CONFIG_DIR, 'ggml-base.bin'), path.join(os.homedir(), '.cache/whisper-cpp/ggml-base.bin')].some((f) => fs.existsSync(f));
  if (cpp) ok('Whisper (optional)', `whisper.cpp${multilingual || faster ? '' : ' (English-only model; for other languages pip install faster-whisper)'}`);
  else if (faster) ok('Whisper (optional)', 'faster-whisper');
  else maybe('Whisper (optional: talking-head takes without ElevenLabs speech-to-text, your own recordings, OpenAI voices)', `${PY} -m pip install faster-whisper`);
}

function look() {
  const theme = typeof cfg.theme === 'string' ? cfg.theme : cfg.theme ? 'custom' : 'studio (default)';
  ok('brand', `${cfg.brand?.handle || 'no handle saved'} · theme ${theme}  (change: checkup.mjs --set-brand @name --set-theme studio)`);
  const host = cfg.host ?? cfg.presenter;
  ok('host (print style)', host === false ? 'off' : host ? 'your own look, saved' : 'default look (say "make my host from this photo" to get your own)');
}

// the real-sound step's library (opus-sound-layer): built, with all 7 Kenney packs in it.
// Kenney only serves its zips to a browser, so a library built by a script alone is missing them.
function soundLibrary() {
  const catalog = path.join(os.homedir(), 'dev', 'sound', 'opus-sound-layer', 'audio', 'kit', 'catalog.json');
  const rerun = 'run the installer again from your susanoo-reel-kit folder: bash setup/install.sh\n           (it opens the Kenney pages; on each click Download, then "Continue without donating...", and it takes the zips from Downloads)';
  let sounds;
  try { sounds = JSON.parse(fs.readFileSync(catalog, 'utf8')).sounds || []; }
  catch { return maybe('sound library (optional: the real-sound step)', rerun); }
  const packs = ['interface', 'ui-audio', 'impact', 'scifi', 'digital', 'casino', 'rpg'];   // pack names inside the library
  const missing = packs.filter((p) => !sounds.some((s) => String(s.id).includes(`/kenney-${p}-`)));
  const kenney = sounds.filter((s) => String(s.id).includes('/kenney-')).length;
  if (!missing.length) ok('sound library', `${sounds.length} sounds, ${kenney} from Kenney (all 7 packs)`);
  else bad(`sound library is missing ${missing.length} of 7 Kenney packs (${sounds.length} sounds; complete is about 1,140)`, rerun);
}

const hasPython = tools();
await browser();
await voice();
plan();
whisper(hasPython);
soundLibrary();
look();
console.log(`Susanoo Reel Kit · setup check  (${SKILL})\n${report.join('\n')}`);
console.log(toFix ? `\n${toFix} thing(s) to fix. Work top to bottom, then run this again.` : '\nAll set. Ask for a reel!');
process.exit(toFix ? 1 : 0);
