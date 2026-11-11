#!/usr/bin/env node
// kit.mjs · the one command for making a reel. `node tools/kit.mjs` alone prints the verbs (from the COMMANDS table below).
// What a mode's page has to publish is in tools/session.mjs and modes/MODE-RULES.md. Renders queue: one at a time per machine.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { serve, SKILL } from './server.mjs';
import { exclusive, openReel } from './session.mjs';

const MODES_DIR = path.join(SKILL, 'modes');
const MODES = fs.readdirSync(MODES_DIR).filter((m) => fs.existsSync(path.join(MODES_DIR, m, 'starter')));
const PY = os.platform() === 'win32' ? 'python' : 'python3';
const NUMBER = /^-?\d+(\.\d+)?$/;

/* ── the command line: verb, reel folder, then --flags (a flag takes the next word as its value unless that is a flag too) ── */
const [verb, target, ...rest] = process.argv.slice(2);
const flags = {}, loose = [];
for (let i = 0; i < rest.length; i++) {
  if (!rest[i].startsWith('--')) { loose.push(rest[i]); continue; }
  const next = rest[i + 1], takesValue = next !== undefined && !next.startsWith('--');
  flags[rest[i].slice(2)] = takesValue ? next : true;
  if (takesValue) i++;
}
const text = (name) => (typeof flags[name] === 'string' ? flags[name] : null);
const num = (name, fallback) => (name in flags ? Number(flags[name]) : fallback);

const die = (message) => { console.error(`kit: ${message}`); process.exit(1); };
const readJSON = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } };
const rel = (reel, file) => path.relative(reel.dir, file);

function ffmpeg(args) {
  if (spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' }).status !== 0) die(`ffmpeg failed: ${args.join(' ').slice(0, 300)}`);
}
function runPython(tool, args, required = false) {
  const status = spawnSync(PY, [path.join(SKILL, 'tools', tool), ...args], { stdio: 'inherit' }).status;
  if (required && status !== 0) die(`${tool} failed`);
  process.exitCode = status ?? 1;
}

// the reel in <dir>: its folder, its reel.json and its name; stops with a plain-words reason when it isn't one
function reelAt(dir) {
  if (!dir) die('which reel? give its folder');
  const full = path.resolve(dir), cfg = readJSON(path.join(full, 'reel.json'));
  if (!cfg) die(`${full} has no reel.json, so it isn't a reel yet. Start one: node tools/kit.mjs start ${dir} --style print`);
  if (!MODES.includes(cfg.style)) die(`reel.json asks for style "${cfg.style}", but the kit has: ${MODES.join(', ')}`);
  return { dir: full, cfg, name: cfg.name || path.basename(full) };
}

// the saved look (host, theme, brand) from ~/.config/bagelunit-reels/config.json, laid over a new reel's reel.json
function applySavedLook(reel, style) {
  const cfgDir = [path.join(os.homedir(), '.config', 'bagelunit-reels'), path.join(os.homedir(), '.config', 'susanoo-reels')]   // second = migration fallback
    .find((d) => fs.existsSync(d)) || path.join(os.homedir(), '.config', 'bagelunit-reels');
  const saved = readJSON(path.join(cfgDir, 'config.json'), {});
  const host = saved.host ?? saved.presenter;
  if (host !== undefined && ('host' in reel || 'presenter' in reel || style === 'print')) reel['host' in reel ? 'host' : 'presenter'] = host;
  if (saved.theme && (style === 'print' || style === 'talking'))
    reel.theme = typeof saved.theme === 'string' ? saved.theme : { ...(typeof reel.theme === 'string' ? { preset: reel.theme } : reel.theme || {}), ...saved.theme };
  if (saved.brand && !reel.brand?.handle) reel.brand = { ...reel.brand, ...saved.brand };
  return reel;
}

// the brand folder a reel folder sits in: the nearest folder above it holding brand/brand.json and .kit-version
function brandFolderOf(dir) {
  for (let d = path.dirname(dir); ; d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, 'brand', 'brand.json')) && fs.existsSync(path.join(d, '.kit-version'))) return d;
    if (path.dirname(d) === d) return null;
  }
}

/* ── verbs ──────────────────────────────────────────────────────────────────────────────────────────────────────────── */
function start() {
  const style = text('style') ?? 'print';
  if (!MODES.includes(style)) die(`--style takes one of: ${MODES.join(', ')}`);
  if (!target) die('usage: kit start <dir> --style <style>');
  const dir = path.resolve(target);
  if (fs.existsSync(path.join(dir, 'reel.json'))) die(`${dir} already holds a reel (reel.json is there)`);
  // local addition: reels are made only inside a set-up brand folder (<brand>-reels, holding brand/brand.json and .kit-version)
  if (!flags.anywhere) {
    const home = brandFolderOf(dir);
    if (!home) die(`${dir} is not inside a brand folder. Reels are made only in a brand's <brand>-reels folder (the one holding brand/ and .kit-version), so each brand's reels, facts and voice stay together. Open Claude Code in that folder and start the reel there. No brand folder yet? Type /brand-setup in the kit's folder. (--anywhere skips this check, for tests only.)`);
    if (fs.existsSync(path.join(path.dirname(home), 'studio', 'KIT.md'))) die(`${home} is the kit's own template, which every new brand is copied from. Make a brand folder with /brand-setup in the kit folder, open Claude Code there, and start the reel in that folder.`);
    if (!readJSON(path.join(home, 'brand', 'brand.json'), {}).name) die(`the brand in ${home} is not set up yet (brand.json has no name). Run /brand-setup in that folder first.`);
    if (!/-reels$/i.test(path.basename(home))) console.log(`note: brand folders are named <brand>-reels; this one is ${path.basename(home)}.`);
  }
  // local addition: never overwrite a file already in the folder (a script written before Gate A must survive)
  const starter = path.join(MODES_DIR, style, 'starter');
  const kept = fs.readdirSync(starter).filter(f => fs.existsSync(path.join(dir, f)));
  fs.cpSync(starter, dir, { recursive: true, force: false, errorOnExist: false });
  for (const sub of ['build', 'audio', 'stills', 'out', 'assets']) fs.mkdirSync(path.join(dir, sub), { recursive: true });
  const reel = applySavedLook({ ...readJSON(path.join(dir, 'reel.json'), {}), style, name: text('name') ?? path.basename(dir) }, style);
  fs.writeFileSync(path.join(dir, 'reel.json'), JSON.stringify(reel, null, 2));
  const hasScript = kept.includes('script.txt');
  const next = style === 'talking'
    ? `record your take, then  ${PY} ${path.join(SKILL, 'tools', 'take.py')} ${dir} --video <your-take.mov>`
    : `${hasScript ? 'check' : 'write'} script.txt, then  ${PY} ${path.join(SKILL, 'tools', 'voice.py')} ${dir}`;
  console.log(`new ${style} reel: ${dir}`);
  if (kept.length) console.log(`kept what was already there (not replaced by the sample): ${kept.join(', ')}`);
  console.log(`next: ${next}`);
}

// a grid of stills, 4 across, for looking at before any video exists
function stillSheet(reel, files, folder) {
  const cols = Math.min(4, files.length), rows = Math.ceil(files.length / cols);
  const list = path.join(folder, '.list.txt'), sheet = path.join(folder, 'sheet.jpg');
  fs.writeFileSync(list, files.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'));
  ffmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-vf', `scale=360:640,tile=${cols}x${rows}:padding=6:color=white`, '-frames:v', '1', sheet]);
  fs.rmSync(list);
  console.log(`sheet: ${rel(reel, sheet)}   (open it and LOOK before rendering video)`);
}

async function frames() {
  const reel = reelAt(target);
  const moments = loose.filter((x) => NUMBER.test(x)).map(Number);
  if (!moments.length) die('which moments? e.g.  kit frames <dir> 0.5 2 4.5');
  const folder = path.join(reel.dir, 'stills', text('out') ?? '');   // a builder may ask for its own folder, so nobody overwrites anybody
  fs.mkdirSync(folder, { recursive: true });
  await exclusive(async () => {
    const view = await openReel(reel, { scale: num('scale', 0.5), query: flags.only ? `?only=${flags.only}` : '', page: text('page') ?? 'index.html', fail: die });
    const files = [];
    for (const t of moments) {
      const file = path.join(folder, `t${t.toFixed(2)}.jpg`);
      fs.writeFileSync(file, await view.frameAt(t));
      files.push(file);
    }
    await view.close();
    console.log('frames:', files.map((f) => rel(reel, f)).join(' '));
    if (files.length > 1 || flags.sheet) stillSheet(reel, files, folder);
  });
}

// the ffmpeg process that turns piped JPEG frames into an H.264 file
function encoder({ fps, sub, w, h, final, out }) {
  const blend = sub > 1 ? `tmix=frames=${sub},select='not(mod(n\\,${sub}))',setpts=N/(${fps}*TB),` : '';
  return spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(fps * sub), '-i', '-',
    '-vf', `${blend}scale=${w}:${h}:flags=lanczos,format=yuv420p`, '-r', String(fps), '-c:v', 'libx264',
    '-preset', final ? 'medium' : 'veryfast', '-crf', String(final ? 16 : 22), '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
}

async function render() {
  const reel = reelAt(target);
  const final = Boolean(flags.final), scale = num('scale', final ? 1 : 0.5), fps = num('fps', 30);
  const sub = num('blur', 1);   // --blur 2 blends two sub-frames: smoother pans, but text can double on punches
  const out = path.resolve(reel.dir, text('out') ?? (final ? 'build/video.mp4' : 'build/draft.mp4'));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await exclusive(async () => {
    const view = await openReel(reel, { scale, fail: die });
    const from = num('from', 0), to = Math.min(num('to', view.info.seconds), view.info.seconds);
    const w = Math.round((1080 * scale) / 2) * 2, h = Math.round((1920 * scale) / 2) * 2;
    const pipe = encoder({ fps, sub, w, h, final, out }), count = Math.round((to - from) * fps) * sub, began = Date.now();
    const elapsed = () => Math.round((Date.now() - began) / 1000);
    for (let k = 0; k < count; k++) {
      const jpg = await view.frameAt(from + k / (fps * sub), final ? 0.95 : 0.88);
      if (!pipe.stdin.write(jpg)) await new Promise((r) => pipe.stdin.once('drain', r));
      if (k % 30 === 0) process.stdout.write(`\r${Math.round((100 * k) / count)}%  ${elapsed()}s `);
    }
    pipe.stdin.end();
    await new Promise((r) => pipe.on('close', r));
    await view.close();
    console.log(`\nrender: ${rel(reel, out)}  (${(to - from).toFixed(2)} s, ${w}x${h}, ${fps} fps, ${elapsed()} s)`);
  });
}

function sound() { runPython('sound.py', [reelAt(target).dir, ...rest], true); }

function exportReel() {
  const reel = reelAt(target);
  const picture = ['build/video.mp4', 'build/draft.mp4'].map((f) => path.join(reel.dir, f)).find((f) => fs.existsSync(f));
  if (!picture) die('nothing rendered yet: run  kit render <dir> --final');
  const mix = path.join(reel.dir, 'build', 'mix.wav');
  if (flags.remix || !fs.existsSync(mix)) sound();
  const out = path.join(reel.dir, 'out', `${reel.name}.mp4`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  ffmpeg(['-i', picture, '-i', mix, '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-maxrate', '12M', '-bufsize', '24M',
    '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-shortest', '-movflags', '+faststart', out]);
  console.log('export:', path.relative(process.cwd(), out));
}

// local addition: link the brand's sticker host into a reel, list every pose in reel.json, and report poses a reel needs
// the reel's cover: its cover scene (cover.html, or a moment set in reel.json "cover") as out/cover.jpg, made to Meta's
// cover rules (JPEG, sRGB, 9:16 at 1080x1920, under 8 MB), plus build/cover-crops.jpg to look at what the profile grid
// (the middle 3:4) and a feed post (the middle square) will show. Gate C records the cover's fingerprint with the video.
async function cover() {
  const reel = reelAt(target);
  const set = reel.cfg.cover && typeof reel.cfg.cover === 'object' ? reel.cfg.cover : {};
  const page = text('page') ?? set.page ?? (fs.existsSync(path.join(reel.dir, 'cover.html')) ? 'cover.html' : null);
  const at = 'at' in flags ? num('at', 0) : set.at ?? (page ? 0 : null);
  if (page == null && at == null) die('no cover scene yet. Make cover.html (this reel\'s page showing only the cover: a big title, the subject, the host if any, the handle; keep words inside the middle 1080x1440), or set reel.json "cover": {"at": <seconds>} to use a still moment of the reel. Then run kit cover again.');
  fs.mkdirSync(path.join(reel.dir, 'out'), { recursive: true });
  fs.mkdirSync(path.join(reel.dir, 'build'), { recursive: true });
  const raw = path.join(reel.dir, 'build', 'cover-raw.jpg'), file = path.join(reel.dir, 'out', 'cover.jpg'), crops = path.join(reel.dir, 'build', 'cover-crops.jpg');
  await exclusive(async () => {
    const view = await openReel(reel, { scale: 1, page: page ?? 'index.html', fail: die });
    fs.writeFileSync(raw, await view.frameAt(at ?? 0, 0.95));
    await view.close();
  });
  const fit = 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=white,format=yuvj420p';
  ffmpeg(['-i', raw, '-vf', fit, '-q:v', '3', file]);
  if (fs.statSync(file).size > 7.5 * 1024 * 1024) ffmpeg(['-i', raw, '-vf', fit, '-q:v', '8', file]);
  const shade = 'color=black@0.55:t=fill';
  ffmpeg(['-i', file, '-vf', `drawbox=x=0:y=0:w=1080:h=240:${shade},drawbox=x=0:y=1680:w=1080:h=240:${shade},drawbox=x=0:y=240:w=1080:h=1440:color=white@0.95:t=5,drawbox=x=0:y=420:w=1080:h=1080:color=yellow@0.95:t=5,scale=540:960`, '-q:v', '3', crops]);
  console.log(`cover: ${rel(reel, file)} (1080x1920, ${Math.round(fs.statSync(file).size / 1024)} KB, from ${page ? page : `the frame at ${at}s`})`);
  console.log(`check: ${rel(reel, crops)}  white box = what the profile grid shows (middle 3:4), yellow box = a feed post (middle square). The title must sit inside the white box.`);
}

function host() {
  if (!target) die('usage: kit host <reel dir> [--dir <poses folder>] [--check]');
  const dir = path.resolve(target);
  const cfgPath = path.join(dir, 'reel.json');
  if (!fs.existsSync(cfgPath)) die(`${dir} has no reel.json. Start the reel first: kit start ${target} --style print`);
  const home = brandFolderOf(dir);
  const brand = home ? readJSON(path.join(home, 'brand', 'brand.json'), {}) : {};
  let posesDir = text('dir') ?? brand.host?.poses_dir ?? '';
  if (!posesDir) die('no sticker host for this brand yet: brand.json has no host.poses_dir. Make one with /sticker-host.');
  if (!path.isAbsolute(posesDir)) posesDir = path.resolve(home ?? process.cwd(), posesDir.replace(/^~(?=$|[\\/])/, os.homedir()));
  if (!fs.existsSync(posesDir)) die(`the pose folder ${posesDir} does not exist. Make the set with /sticker-host.`);
  const have = fs.readdirSync(posesDir).filter((f) => f.toLowerCase().endsWith('.png')).map((f) => f.slice(0, -4)).sort();
  if (!have.includes('idle')) die(`${posesDir} has no idle.png. Every sticker host needs its base pose (idle).`);
  const reel = readJSON(cfgPath, {});
  const cues = Array.isArray(reel.presenter?.cues) ? reel.presenter.cues : [];
  const used = [...new Set(cues.map((c) => c[1]).filter(Boolean))];
  const missing = used.filter((p) => !have.includes(p));
  console.log(`sticker host: ${have.length} poses in ${posesDir}`);
  console.log(`cues use: ${used.length ? used.join(', ') : 'no cues yet'}`);
  if (missing.length) {
    for (const p of missing) {
      const at = cues.filter((c) => c[1] === p).map((c) => `"${c[0]}"`).join(', ');
      console.log(`MISSING: ${p} (cued at ${at}). Make it with /sticker-host add ${p}, or cue an existing pose; until then the host shows idle there.`);
    }
  } else if (used.length) console.log('every pose the cues use is in the set');
  if (flags.check) { process.exitCode = missing.length ? 2 : 0; return; }
  const link = path.join(dir, 'host');
  let linked = false;
  try {
    const st = fs.lstatSync(link);
    if (st.isSymbolicLink()) fs.rmSync(link);
    else die(`${link} is a real folder; move it away (or delete it) so the brand's set can be linked there`);
  } catch (e) { if (e.code !== 'ENOENT') throw e; }
  try { fs.symlinkSync(posesDir, link, 'dir'); linked = true; } catch { fs.cpSync(posesDir, link, { recursive: true }); }
  reel.presenter = { ...(reel.presenter ?? {}), type: 'stickers', dir: 'host', poses: have, cues };
  fs.writeFileSync(cfgPath, JSON.stringify(reel, null, 2));
  console.log(`${linked ? 'linked' : 'copied'} the set to ${link}; reel.json lists all ${have.length} poses`);
  if (missing.length) process.exitCode = 2;
}

async function live() {
  const reel = reelAt(target);
  const { url } = await serve(reel.dir, reel.cfg.style, num('port', 0));
  console.log(`live: ${url}/index.html?play     one frame: ${url}/index.html?t=3.5     (Ctrl+C to stop)`);
}

const COMMANDS = {
  start: [start, '<dir> --style print|depth|talking [--name n]', 'a new reel from that mode\'s starter'],
  frames: [frames, '<dir> 1.2 3.4 … [--scale 0.5] [--only <shot>] [--out <folder>] [--page other.html]',
    'stills → <dir>/stills[/<folder>]/ + sheet.jpg (--only presenter: the print presenter sheet)'],
  render: [render, '<dir> [--final] [--from s --to s] [--fps 30] [--blur 2] [--out file]', 'half-size draft → build/draft.mp4 · --final (1080x1920) → build/video.mp4'],
  pace: [() => runPython('pace.py', [reelAt(target).dir, ...rest]), '<dir>', 'does it keep moving? a score and the still stretches'],
  effort: [() => runPython('effort.py', [reelAt(target).dir]), '<dir>', 'built for THIS script, or from ready-made pieces?'],
  lint: [() => runPython('lint.py', [reelAt(target).dir, ...rest]), '<dir> [video.mp4]', 'shot grammar: lengths, adjacent layouts, cuts on words, rhythm, first-frame motion'],
  qa: [() => runPython('qa.py', [reelAt(target).dir, ...rest]), '<dir> [video.mp4]', 'final file checks: spec, loudness, black/frozen frames, text safe zone, A/V sync; writes build/qa.json'],
  facts: [() => runPython('facts.py', [reelAt(target).dir, ...rest]), '<dir> [check] [--scope script|final]  |  <dir> record --scope script|final --result PASS|FAIL', 'fact check: mechanical check of the reel against brand/facts.md (writes build/factcheck.md), then record the fresh re-read verdict (/reel-factcheck)'],
  gate: [() => runPython('gate.py', [reelAt(target).dir, ...rest]), '<dir> record|check [--gate A|B|C] [--note "text"] [--skip-facts "reason"]', 'record an approval (gate C also hashes the final mp4) or check it is unchanged'],
  measure: [() => runPython('measure.py', [reelAt(target).dir, ...rest]), '<dir> [video]', 'facts only: cuts, words, loudness, silence, still stretches; contact sheets in build/measure'],
  calibrate: [() => runPython('calibrate.py', [target, ...rest]), '<insights.csv> [--project-root <reels>]', 'fit the estimator on this brand\'s own Instagram Insights (needs 8+ measured reels)'],
  predict: [() => runPython('predict.py', [reelAt(target).dir, ...rest]), '<dir>', 'measured facts, plus a watch-time and skip-rate estimate once calibrated'],
  sound: [sound, '<dir>', 'voice + effects (+ music) → build/mix.wav'],
  export: [exportReel, '<dir> [--remix]', 'picture + sound → out/<name>.mp4, ready for Instagram'],
  live: [live, '<dir> [--port n]', 'serve the reel and print a link to watch it play'],
  cover: [cover, '<dir> [--page cover.html] [--at <seconds>]', 'the reel cover: out/cover.jpg (1080x1920 JPEG to Meta\'s cover rules) and build/cover-crops.jpg showing what the grid and a feed post crop'],
  host: [host, '<dir> [--dir <poses folder>] [--check]', 'sticker host: link the brand\'s pose set into the reel, list every pose in reel.json, and name any pose the cues need that the set lacks'],
};

if (!COMMANDS[verb]) {
  console.log('kit · start a reel, look at it, render it, check it, ship it\n');
  for (const [name, [, usage, what]] of Object.entries(COMMANDS)) console.log(`  node tools/kit.mjs ${name} ${usage}\n      ${what}`);
  process.exit(verb ? 1 : 0);
}
await COMMANDS[verb][0]();
