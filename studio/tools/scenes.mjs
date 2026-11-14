// scenes.mjs · scene styles in the Reel Kit (local addition). A scene style is not a mode: a reel in a scene style is an
// ordered list of scenes (scenes.json), each one a self-contained page that styles/_core/build-scene.mjs makes from the
// shared runtime, the style's engine and one template with props. Each scene is rendered to its own mp4 (seeking the
// page's window.__scene frame by frame), the scenes are joined without encoding the picture again, and the reel's own
// voice goes under the whole thing. modes/MODE-RULES.md, section "Scene styles", is the agreement.
//
// Everything here reads only this kit: styles/STYLES.json (the registry the styles repo's sync writes) and styles/<id>/.
// The browser is the kit's own (tools/chromium.mjs), so no new dependency.
//
// What a scene-style reel folder holds and what this writes:
//   reel.json, script.txt, scenes.json        the plan (see planOf below for the format)
//   audio/vo.mp3, build/words.json            from tools/voice.py (or `kit scene <dir> stand-in` for a no-key preview)
//   build/scene_times.json                    each scene's start and end on the reel's clock, and how it was found
//   build/scenes/NNN.html|.props.json|.words.json   the built scene pages
//   build/scenes/NNN.mp4 + NNN.json           each rendered scene and its manifest (content hash, errors, S.inspect boxes)
//   build/video.mp4, build/draft.mp4          the reel at 1080x1920 and half size, where kit render writes them for modes
//   build/scene_boxes.json                    resting S.inspect boxes on the reel's clock (tools/qa.py checks the safe zone)
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SKILL } from './server.mjs';
import { launch } from './chromium.mjs';

export const STYLES_DIR = path.join(SKILL, 'styles');
const CORE = path.join(STYLES_DIR, '_core');
const W = 1080, H = 1920, FPS = 30;
const SAFE = { top: 250, bottom: 450, side: 60 };      // the same numbers as tools/qa.py
const SAFE_BOX = [SAFE.side, SAFE.top, W - SAFE.side, H - SAFE.bottom];
const TOL = 6;                                          // px of slack on the safe area, as in the styles repo's tester
const RENDER_VERSION = 'scenes-1';                      // change it when the frame loop or the codec settings change
const MIN_SCENE = 0.5;                                  // s; a scene shorter than this is squeezed out of its neighbours

const readJSON = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const sha = (...parts) => { const h = createHash('sha256'); for (const p of parts) h.update(p); return h.digest('hex'); };
const pad = (n) => String(n).padStart(3, '0');
const r3 = (x) => Math.round(x * 1000) / 1000;

/* ── the registry ───────────────────────────────────────────────────────────────────────────────────────────────────── */
export function registry() { return readJSON(path.join(STYLES_DIR, 'STYLES.json'), null); }

// the scene styles this kit can make: in the registry, made for tall video, and with an engine on disk
export function sceneStyleIds() {
  const reg = registry();
  if (!reg || !Array.isArray(reg.styles)) return [];
  return reg.styles.filter((s) => (s.formats || []).includes('tall') && fs.existsSync(path.join(STYLES_DIR, s.id, 'engine.js'))).map((s) => s.id);
}
export const isSceneStyle = (id) => typeof id === 'string' && sceneStyleIds().includes(id);

export function styleInfo(id) {
  const entry = (registry()?.styles || []).find((s) => s.id === id);
  if (!entry) return null;
  return { ...entry, dir: path.join(STYLES_DIR, id), templateDefs: readJSON(path.join(STYLES_DIR, id, 'templates.json'), []) };
}

/* ── words ──────────────────────────────────────────────────────────────────────────────────────────────────────────── */
// the same folding as the runtime's V.find: lower case, accents dropped, only letters and digits
export const normWord = (s) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]+/gu, '');
const tokens = (text) => String(text ?? '').split(/\s+/).map(normWord).filter(Boolean);
const same = (a, b) => a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a)));

// build/words.json and build/word_index.txt in the format tools/voice.py and tools/take.py write (kitcore.write_words)
export function writeWords(dir, words) {
  const build = path.join(dir, 'build');
  fs.mkdirSync(build, { recursive: true });
  fs.writeFileSync(path.join(build, 'words.json'), '[\n' + words.map((w) => JSON.stringify({ w: w.w, s: w.s, e: w.e })).join(',\n') + '\n]');
  const f = (x) => x.toFixed(2).padStart(7);
  fs.writeFileSync(path.join(build, 'word_index.txt'), words.map((w, n) => `${String(n).padStart(4)} ${f(w.s)} ${f(w.e)}  ${w.w}`).join('\n'));
}

// speech-like fake word times (longer words take longer, pauses after commas and full stops): the styles repo's
// make-examples rule, so a stand-in voice paces like the examples the engines were tested with
export function fakeWords(text, pace = 0.38, start = 0.35) {
  let t = start;
  return String(text).split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).map((w) => {
    const letters = w.replace(/[^\p{L}\p{N}]/gu, '').length;
    const len = pace * (0.55 + 0.12 * Math.min(letters, 9));
    const s = r3(t), e = r3(s + len * 0.8);
    t += len + (/[.!?]["')]*$/.test(w) ? 0.55 : /[,;:]["')]*$/.test(w) ? 0.28 : 0);
    return { w, s, e };
  });
}

/* ── the plan ───────────────────────────────────────────────────────────────────────────────────────────────────────── */
// scenes.json: {"scenes": [{"template": "<id>", "props": {...}, "narration": "the words this scene covers"}, ...]}
// (a bare list works too). Optional per scene: "id", "seed", or "code": "scenes/02.js" (the body of scene(V, S, root),
// the style's docs.md API) instead of "template". Times are never typed: they come from build/words.json.
export function planOf(dir, style) {
  const file = path.join(dir, 'scenes.json');
  if (!fs.existsSync(file)) throw new Error(`no scenes.json in ${dir}: write the scene plan first (modes/MODE-RULES.md, "Scene styles")`);
  let raw;
  try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { throw new Error(`scenes.json is not valid JSON: ${e.message}`); }
  const list = Array.isArray(raw) ? raw : raw?.scenes;
  if (!Array.isArray(list) || !list.length) throw new Error('scenes.json has no scenes (want {"scenes": [{"template", "props", "narration"}, ...]})');
  const info = styleInfo(style);
  const known = new Set(info?.templates || []);
  const notes = [];
  const scenes = list.map((s, k) => {
    if (!s || typeof s !== 'object') throw new Error(`scene ${k + 1} in scenes.json is not an object`);
    if (!s.template && !s.code) throw new Error(`scene ${k + 1} has no "template" (or "code")`);
    if (s.template && !known.has(s.template)) throw new Error(`scene ${k + 1}: ${style} has no template "${s.template}". It has: ${[...known].join(', ')}`);
    if (s.code && !fs.existsSync(path.join(dir, s.code))) throw new Error(`scene ${k + 1}: its code file ${s.code} does not exist`);
    if (s.props != null && (typeof s.props !== 'object' || Array.isArray(s.props))) throw new Error(`scene ${k + 1}: "props" must be an object`);
    const def = info?.templateDefs?.find((t) => t.id === s.template);
    const allowed = Object.keys(def?.propsSchema?.properties || {});
    const extra = allowed.length ? Object.keys(s.props || {}).filter((p) => !allowed.includes(p)) : [];
    if (extra.length) notes.push(`scene ${k + 1} (${s.template}): props the template does not know, ignored by the engine: ${extra.join(', ')}`);
    if (!String(s.narration || '').trim()) notes.push(`scene ${k + 1}: no "narration", so its time can only be guessed (even split)`);
    return { n: k + 1, file: pad(k + 1), id: String(s.id || `${String(k + 1).padStart(2, '0')}-${s.template || 'custom'}`),
      template: s.template || null, code: s.code || null, props: s.props || {}, narration: String(s.narration || ''), seed: s.seed, sfx: s.sfx ?? null, enter: s.enter ?? null };
  });
  return { scenes, notes };
}

// Each scene's [t0, t1] on the reel's clock. The narration of every scene is aligned with build/words.json (longest common
// subsequence of the folded words); a scene with at least half its words found is anchored to them, and the cut between two
// scenes falls in the middle of the gap between the last word of one and the first word of the next. Scenes that cannot be
// anchored (no words.json yet, or narration that is not in the voice) share the time between their neighbours evenly.
// Every cut is put on a frame, so the scene lengths add up to the reel exactly.
export function timeScenes(scenes, words, { voLength = null, tail = 0.6, fallbackLength = null } = {}) {
  const N = scenes.length;
  const A = [];                                                  // [token, scene index]
  scenes.forEach((s, k) => tokens(s.narration).forEach((t) => A.push([t, k])));
  const B = (words || []).map((w) => normWord(w.w));
  const n = A.length, m = B.length;
  const span = scenes.map(() => ({ a: null, b: null, hits: 0 }));
  if (n && m) {
    const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
      dp[i][j] = B[j] && same(A[i][0], B[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    for (let i = 0, j = 0; i < n && j < m;) {
      if (B[j] && same(A[i][0], B[j]) && dp[i][j] === dp[i + 1][j + 1] + 1) {
        const sp = span[A[i][1]];
        sp.a = sp.a ?? j; sp.b = j; sp.hits++; i++; j++;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++;
    }
  }
  const counts = scenes.map((s) => tokens(s.narration).length);
  const anchored = span.map((sp, k) => counts[k] > 0 && sp.hits >= Math.max(1, Math.ceil(counts[k] * 0.5)));
  const lastEnd = m ? words[m - 1].e : 0;
  const end = m ? Math.max(voLength || 0, lastEnd + tail) : (voLength || fallbackLength || Math.max(3, n * 0.42 + 1));

  const bnd = new Array(N + 1).fill(null);
  bnd[0] = 0; bnd[N] = end;
  for (let k = 1; k < N; k++) {
    const prev = anchored[k - 1] ? words[span[k - 1].b].e : null, next = anchored[k] ? words[span[k].a].s : null;
    if (prev != null && next != null) bnd[k] = next >= prev ? (prev + next) / 2 : next;
    else if (next != null) bnd[k] = Math.max(0, next - 0.15);
    else if (prev != null) bnd[k] = prev + 0.15;
  }
  // unknown cuts: even split between the known ones around them
  for (let k = 1; k < N; k++) {
    if (bnd[k] != null) continue;
    let j = k; while (bnd[j] == null) j++;
    const a = bnd[k - 1], b = bnd[j], steps = j - (k - 1);
    for (let x = k; x < j; x++) bnd[x] = a + ((b - a) * (x - (k - 1))) / steps;
  }
  // on frames, in order, no scene under MIN_SCENE where room allows
  const minF = Math.round(MIN_SCENE * FPS);
  const f = bnd.map((t) => Math.round(t * FPS));
  for (let k = 1; k <= N; k++) if (f[k] < f[k - 1] + minF) f[k] = f[k - 1] + minF;
  for (let k = N - 1; k >= 1; k--) if (f[k] > f[k + 1] - minF) f[k] = Math.max(f[k - 1] + 1, f[k + 1] - minF);
  return scenes.map((s, k) => ({
    n: s.n, id: s.id, template: s.template, t0: f[k] / FPS, t1: f[k + 1] / FPS, frames: f[k + 1] - f[k],
    source: anchored[k] ? 'words' : 'even', found: span[k].hits, of: counts[k],
    first: anchored[k] ? words[span[k].a].w : null, last: anchored[k] ? words[span[k].b].w : null,
  }));
}

function mediaLength(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' });
  const v = parseFloat(r.stdout);
  return Number.isFinite(v) ? v : null;
}

// plan + times + words, without building anything
export function prepare(reel) {
  const { scenes, notes } = planOf(reel.dir, reel.cfg.style);
  const words = readJSON(path.join(reel.dir, 'build', 'words.json'), []) || [];
  const vo = path.join(reel.dir, 'audio', 'vo.mp3');
  const voLength = fs.existsSync(vo) ? mediaLength(vo) : null;
  const times = timeScenes(scenes, words, { voLength, tail: Number(reel.cfg.tail ?? 0.6), fallbackLength: Number(reel.cfg.duration) || null });
  if (!words.length) notes.push('no build/words.json yet: scene times are an even split (voice the script first, or kit scene <dir> stand-in)');
  for (const t of times) {
    if (t.source === 'even' && words.length) notes.push(`scene ${t.n}: only ${t.found} of ${t.of} narration words were found in build/words.json, so its time is shared evenly with its neighbours`);
    const d = t.t1 - t.t0;
    if (d < 2) notes.push(`scene ${t.n} lasts only ${d.toFixed(2)} s: the engine needs time to draw; give it more narration or merge it`);
    if (d > 16) notes.push(`scene ${t.n} lasts ${d.toFixed(1)} s: split it, a scene this long sits still`);
  }
  return { scenes, times, words, notes, vo: voLength ? vo : null, voLength, length: times.length ? times.at(-1).t1 : 0 };
}

/* ── building scene pages ───────────────────────────────────────────────────────────────────────────────────────────── */
function buildPages(reel, prep) {
  const out = path.join(reel.dir, 'build', 'scenes');
  fs.mkdirSync(out, { recursive: true });
  const seed = Number(reel.cfg.seed ?? 1);
  const voHash = prep.vo ? sha(fs.readFileSync(prep.vo)) : 'silent';
  return prep.scenes.map((s, k) => {
    const t = prep.times[k], dur = t.frames / FPS;
    const base = path.join(out, s.file);
    const words = prep.words.filter((w) => w.s >= t.t0 - 1e-6 && w.s < t.t1 - 1e-6).map((w) => ({ word: w.w, start: r3(w.s - t.t0), end: r3(Math.min(w.e, t.t1) - t.t0) }));
    fs.writeFileSync(`${base}.words.json`, JSON.stringify(words));
    const args = [path.join(CORE, 'build-scene.mjs'), '--style', path.join(STYLES_DIR, reel.cfg.style), '--out', `${base}.html`,
      '--duration', dur.toFixed(6), '--width', String(W), '--height', String(H), '--seed', String(s.seed ?? seed),
      '--narration', s.narration, '--words', `${base}.words.json`];
    // "enter": the first scene opens on its finished picture (frame 0 is checked), unless it sets its own; 0 keeps the build-in
    const enter = s.enter ?? (s.n === 1 ? 'none' : null);
    if (enter != null && enter !== 0 && enter !== '0') args.push('--enter', String(enter));
    if (s.template) { fs.writeFileSync(`${base}.props.json`, JSON.stringify(s.props)); args.push('--template', s.template, '--props', `${base}.props.json`); }
    else args.push('--code', path.join(reel.dir, s.code));
    const b = spawnSync(process.execPath, args, { encoding: 'utf8' });
    if (b.status !== 0) throw new Error(`building scene ${s.n} failed: ${(b.stderr || b.stdout).trim().slice(0, 600)}`);
    const html = fs.readFileSync(`${base}.html`);
    // the page holds everything the picture depends on (runtime, engine, props, words, length, size, seed); the sound adds the voice slice
    const hash = sha(RENDER_VERSION, html, voHash, `${t.t0}|${dur}`);
    return { scene: s, time: t, dur, base, html: html.toString('utf8'), hash };
  });
}

/* ── one browser page per scene ─────────────────────────────────────────────────────────────────────────────────────── */
async function openScene(browser, html, scale = 1) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: scale });
  const blocked = [], pageErrors = [];
  await ctx.route('**/*', (r) => { blocked.push(r.request().url().slice(0, 120)); return r.abort('blockedbyclient'); });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => window.__scene.ready);
  return {
    ctx, page, blocked, pageErrors,
    seek: (t) => page.evaluate((tt) => window.__scene.seek(tt), t),
    inspect: (t) => page.evaluate((tt) => (window.SceneStyle && typeof window.SceneStyle.inspect === 'function' ? window.SceneStyle.inspect(tt) : null), t),
    errors: () => page.evaluate(() => (window.__scene.errors || []).slice()),
  };
}

// resting boxes only: entrances, exits and camera moves are marked moving; boxes fully off camera are there on purpose
const resting = (boxes) => (boxes || []).filter((b) => b && !b.moving && b.w > 0 && b.h > 0 && !(b.x > W || b.y > H || b.x + b.w < 0 || b.y + b.h < 0));
const outside = (b) => b.x < SAFE_BOX[0] - TOL || b.y < SAFE_BOX[1] - TOL || b.x + b.w > SAFE_BOX[2] + TOL || b.y + b.h > SAFE_BOX[3] + TOL;

// samples [{t, boxes}] → [{t0, t1, kind, label, x, y, w, h}]: a box that stays put (within a few px: line boil, breathing)
// is one entry over all its samples, grown to cover every sample
function mergeBoxes(samples) {
  const open = [], out = [];
  const near = (a, b) => Math.abs(a.x - b.x) <= 8 && Math.abs(a.y - b.y) <= 8 && Math.abs(a.x + a.w - b.x - b.w) <= 8 && Math.abs(a.y + a.h - b.y - b.h) <= 8;
  for (const { t, boxes } of samples) {
    const still = new Set();
    for (const raw of resting(boxes)) {
      const b = { kind: String(raw.kind ?? ''), label: String(raw.label ?? '').slice(0, 60), x: raw.x, y: raw.y, w: raw.w, h: raw.h };
      const hit = open.find((o) => !still.has(o) && o.kind === b.kind && o.label === b.label && near(o, b));
      if (hit) {
        const x1 = Math.max(hit.x + hit.w, b.x + b.w), y1 = Math.max(hit.y + hit.h, b.y + b.h);
        hit.x = Math.min(hit.x, b.x); hit.y = Math.min(hit.y, b.y); hit.w = x1 - hit.x; hit.h = y1 - hit.y; hit.t1 = t;
        still.add(hit);
      } else { const o = { t0: t, t1: t, ...b }; open.push(o); still.add(o); }
    }
    for (let i = open.length - 1; i >= 0; i--) if (!still.has(open[i])) out.push(...open.splice(i, 1));
  }
  return [...out, ...open].sort((a, b) => a.t0 - b.t0)
    .map((b) => ({ ...b, t0: r3(b.t0), t1: r3(b.t1), x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) }));
}

function encoder(out, audio, t0, dur, frames) {
  const samples = Math.round((frames / FPS) * 48000);
  const audioIn = audio ? ['-ss', t0.toFixed(6), '-t', dur.toFixed(6), '-i', audio] : ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo'];
  const filter = audio
    ? `[1:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad=whole_len=${samples},atrim=end_sample=${samples},asetpts=N/SR/TB[a]`
    : `[1:a]atrim=end_sample=${samples},asetpts=N/SR/TB[a]`;
  // the same settings for every scene (the styles repo's render-scene.mjs), so the scenes join without encoding again
  const ff = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(FPS), '-i', 'pipe:0',
    ...audioIn, '-filter_complex', filter, '-map', '0:v', '-map', '[a]',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
    '-r', String(FPS), '-g', String(FPS * 2), '-video_track_timescale', '90000',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-t', (frames / FPS).toFixed(6), '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((resolve, reject) => { ff.on('error', reject); ff.on('close', (c) => (c === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${c}`)))); });
  return { ff, done };
}

async function renderOne(browser, item, vo) {
  const { scene, time, base, html, hash } = item, frames = time.frames;
  const mp4 = `${base}.mp4`, tmp = `${base}.part.mp4`;
  const view = await openScene(browser, html, 1);
  const cdp = await view.ctx.newCDPSession(view.page);
  const { ff, done } = encoder(tmp, vo, time.t0, item.dur, frames);
  const samples = [];
  try {
    for (let i = 0; i < frames; i++) {
      const t = i / FPS;
      const r = await cdp.send('Runtime.evaluate', { expression: `window.__scene.seek(${t})` });
      if (r.exceptionDetails) throw new Error(`scene ${scene.n}: seek(${t}) failed: ${r.exceptionDetails.text}`);
      if (i % 15 === 0 || i === frames - 1) samples.push({ t, boxes: await view.inspect(t) });
      const shot = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 90, fromSurface: true, optimizeForSpeed: true });
      if (!ff.stdin.write(Buffer.from(shot.data, 'base64'))) await new Promise((res) => ff.stdin.once('drain', res));
    }
  } finally { ff.stdin.end(); }
  await done;
  const errors = [...(await view.errors()), ...view.pageErrors, ...view.blocked.map((u) => `network blocked: ${u}`)];
  await view.ctx.close();
  fs.renameSync(tmp, mp4);
  const inspected = samples.some((s) => Array.isArray(s.boxes));
  const manifest = { hash, n: scene.n, id: scene.id, template: scene.template, t0: time.t0, t1: time.t1, frames, errors, inspect: inspected, boxes: inspected ? mergeBoxes(samples) : [] };
  fs.writeFileSync(`${base}.json`, JSON.stringify(manifest, null, 1));
  return manifest;
}

const freshManifest = (item) => {
  const m = readJSON(`${item.base}.json`, null);
  return m && m.hash === item.hash && fs.existsSync(`${item.base}.mp4`) ? m : null;
};

function ffmpeg(args) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${(r.stderr || '').trim().slice(-600)}`);
}

// the stand-in voice leaves a note with the fingerprint of the vo.mp3 it made; a real voice take replaces the file
function standInActive(dir) {
  const note = readJSON(path.join(dir, 'build', 'voice-stand-in.json'), null), vo = path.join(dir, 'audio', 'vo.mp3');
  return Boolean(note && fs.existsSync(vo) && note.sha === sha(fs.readFileSync(vo)));
}

/* ── sound cues for a scene-style reel ─────────────────────────────────────────────────────────────────────────────── */
// reel.json "sfx": "scenes" (default: a soft swoosh on every cut, none on frame 0) or "off". A scene can ask for its own:
// "sfx": "pop" (at its start) or [{"at": 1.2, "name": "pop", "gain": -3}] (seconds into the scene). The names are the
// sound bank's (the ones tools/sound.py and tools/realsound.py know). Field report from Susanoo Studio, 2026-11-13: a
// scene-style reel had no cues at all, so the real-sound step had nothing to hang sounds on.
export const SFX_NAMES = ['whoosh', 'swoosh', 'pop', 'click', 'tick', 'thud', 'stamp', 'boom', 'riser', 'shimmer', 'type', 'cash'];
export function sfxCues(items, cfg = {}) {
  const mode = cfg.sfx === false ? 'off' : String(cfg.sfx ?? 'scenes');
  const list = [], unknown = [];
  if (mode === 'off') return { list, unknown };
  items.forEach((it, i) => {
    const t0 = it.time.t0;
    if (i > 0 && mode === 'scenes') list.push({ t: r3(Math.max(0, t0 - 0.08)), name: 'swoosh', gain: -6 });
    const own = typeof it.scene.sfx === 'string' ? [{ at: 0, name: it.scene.sfx }] : Array.isArray(it.scene.sfx) ? it.scene.sfx : [];
    for (const c of own) {
      if (!c || !c.name) continue;
      if (!SFX_NAMES.includes(String(c.name))) { unknown.push({ scene: it.scene.n, name: String(c.name) }); continue; }
      list.push({ t: r3(t0 + Math.max(0, Number(c.at) || 0)), name: String(c.name), gain: Math.min(0, Number(c.gain) || 0) });
    }
  });
  list.sort((a, b) => a.t - b.t);
  return { list, unknown };
}

/* ── kit render <dir> for a scene style ─────────────────────────────────────────────────────────────────────────────── */
export async function renderScenes(reel, { only = null, force = false } = {}) {
  const began = Date.now();
  const prep = prepare(reel);
  for (const n of prep.notes) console.log(`note: ${n}`);
  const build = path.join(reel.dir, 'build');
  fs.writeFileSync(path.join(build, 'scene_times.json'), JSON.stringify(prep.times, null, 1));
  const items = buildPages(reel, prep);
  // the sound cues: build/sfx.json, the same [{t, name, gain}] list a mode's page writes, for kit export and the real-sound step
  const cues = sfxCues(items, reel.cfg);
  for (const n of cues.unknown) console.log(`note: scene ${n.scene} asks for sound "${n.name}", which the kit has no sound for (use one of: ${SFX_NAMES.join(' ')})`);
  fs.writeFileSync(path.join(build, 'sfx.json'), JSON.stringify(cues.list, null, 1));
  // files of scenes no longer in the plan
  for (const f of fs.readdirSync(path.join(build, 'scenes'))) {
    const m = /^(\d{3})\./.exec(f);
    if (m && Number(m[1]) > items.length) fs.rmSync(path.join(build, 'scenes', f), { force: true });
  }
  let pick = items;
  if (only != null) {
    pick = items.filter((it) => String(it.scene.n) === String(only) || it.scene.id === String(only));
    if (!pick.length) throw new Error(`no scene "${only}" in scenes.json (give its number, 1 to ${items.length}, or its id)`);
  }
  const todo = pick.filter((it) => force || only != null || !freshManifest(it));
  const manifests = new Map(items.map((it) => [it.scene.n, freshManifest(it)]));
  if (todo.length) {
    const browser = await launch();
    try {
      for (const it of todo) {
        process.stdout.write(`scene ${it.scene.n}/${items.length} ${it.scene.id} (${it.dur.toFixed(2)} s, ${it.time.frames} frames)... `);
        const t = Date.now();
        const m = await renderOne(browser, it, prep.vo);
        manifests.set(it.scene.n, m);
        console.log(`${((Date.now() - t) / 1000).toFixed(1)} s${m.errors.length ? `  ${m.errors.length} error(s)` : ''}`);
      }
    } finally { await browser.close().catch(() => {}); }
  }
  const reused = pick.length - todo.length;
  const all = items.map((it) => manifests.get(it.scene.n));
  const errs = all.filter(Boolean).flatMap((m) => m.errors.map((e) => `scene ${m.n} (${m.id}): ${e}`));
  const errFile = path.join(build, 'render_errors.txt');
  if (errs.length) {
    fs.writeFileSync(errFile, errs.join('\n') + '\n');
    process.exitCode = 2;
    console.error(`\n${errs.length} error(s) while drawing scenes: those frames may be INCOMPLETE. Fix them first (also in build/render_errors.txt):\n  ${errs.slice(0, 12).join('\n  ')}`);
  } else fs.rmSync(errFile, { force: true });
  if (only != null) {
    console.log(`scene ${pick[0].scene.n}: ${path.relative(reel.dir, pick[0].base + '.mp4')} (with its slice of the voice). Run kit render <dir> to join the reel; the other scenes are reused when unchanged.`);
    return;
  }

  // join the scenes without encoding the picture again, then put the whole voice (and music) under it at -14 LUFS
  const list = path.join(build, 'scenes', 'join.txt'), joined = path.join(build, 'scenes', 'joined.mp4');
  fs.writeFileSync(list, items.map((it) => `file '${(it.base + '.mp4').split(path.sep).join('/').replace(/'/g, "'\\''")}'`).join('\n') + '\n');
  ffmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-map', '0:v', '-c', 'copy', joined]);
  const seconds = items.reduce((n, it) => n + it.time.frames, 0) / FPS;
  const video = path.join(build, 'video.mp4'), draft = path.join(build, 'draft.mp4');
  const norm = 'loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo';
  const voice = '[1:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad';
  const music = reel.cfg.music ? path.resolve(reel.dir, String(reel.cfg.music)) : null;
  if (music && !fs.existsSync(music)) throw new Error(`reel.json "music" points at ${music}, which does not exist`);
  const vol = Number(reel.cfg.music_volume ?? 0.18);
  if (!prep.vo) ffmpeg(['-i', joined, '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', seconds.toFixed(6), '-movflags', '+faststart', video]);
  else if (music) ffmpeg(['-i', joined, '-i', prep.vo, '-stream_loop', '-1', '-i', music, '-filter_complex',
    `${voice},asplit=2[voice][sc];[2:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${vol}[music];[music][sc]sidechaincompress=threshold=0.03:ratio=6:attack=15:release=350:makeup=1[ducked];[voice][ducked]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,${norm}[a]`,
    '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', seconds.toFixed(6), '-movflags', '+faststart', video]);
  else ffmpeg(['-i', joined, '-i', prep.vo, '-filter_complex', `${voice},${norm}[a]`, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
    '-t', seconds.toFixed(6), '-movflags', '+faststart', video]);
  ffmpeg(['-i', video, '-vf', 'scale=540:960:flags=lanczos', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart', draft]);
  fs.rmSync(joined, { force: true }); fs.rmSync(list, { force: true });

  // resting boxes on the reel's clock, for tools/qa.py (safe zone)
  const boxes = all.flatMap((m) => (m?.boxes || []).map((b) => ({ ...b, t0: r3(b.t0 + m.t0), t1: r3(b.t1 + m.t0), scene: m.n })));
  const boxFile = path.join(build, 'scene_boxes.json');
  if (all.some((m) => m?.inspect)) fs.writeFileSync(boxFile, JSON.stringify(boxes)); else fs.rmSync(boxFile, { force: true });

  console.log(`render: build/video.mp4 (1080x1920) and build/draft.mp4 (540x960), ${seconds.toFixed(2)} s, ${items.length} scenes: ${todo.length} rendered, ${reused} reused unchanged, ${Math.round((Date.now() - began) / 1000)} s`);
  if (!prep.vo) console.log('note: no audio/vo.mp3 yet, so the video is silent');
  else if (Math.abs(seconds - prep.voLength) > 1) console.log(`note: the video (${seconds.toFixed(2)} s) and the voice (${prep.voLength.toFixed(2)} s) differ by more than 1 s`);
  if (standInActive(reel.dir)) console.log('WARNING: audio/vo.mp3 is the STAND-IN tone from kit scene stand-in, not a voice. Voice the script (tools/voice.py) before anything is approved or posted.');
}

/* ── kit frames / kit cover on a scene-style reel: the same {info, frameAt, close} as session.mjs openReel ─────────── */
export async function openScenes(reel, { scale = 0.5 } = {}) {
  const prep = prepare(reel);
  const items = buildPages(reel, prep);
  const browser = await launch();
  const views = new Map(), problems = new Set();
  async function frameAt(t, quality = 0.92) {
    const k = items.findIndex((it) => t < it.time.t1 - 1e-9);
    const it = k === -1 ? items.at(-1) : items[k];
    if (!views.has(it.scene.n)) views.set(it.scene.n, await openScene(browser, it.html, scale));
    const view = views.get(it.scene.n);
    await view.seek(Math.min(Math.max(0, t - it.time.t0), it.dur - 1 / FPS));
    return view.page.screenshot({ type: 'jpeg', quality: Math.round(quality * 100) });
  }
  async function close() {
    for (const [n, v] of views) for (const e of [...(await v.errors()), ...v.pageErrors]) problems.add(`scene ${n}: ${String(e).slice(0, 200)}`);
    await browser.close().catch(() => {});
    if (problems.size) { process.exitCode = 2; console.error(`\n${problems.size} error(s) while drawing scenes:\n  ${[...problems].slice(0, 12).join('\n  ')}`); }
  }
  return { info: { seconds: prep.length }, frameAt, close };
}

/* ── kit scene <dir> check: every scene's errors, safe area and seeking, with stills to look at ─────────────────────── */
export async function checkScenes(reel, { only = null, times = null } = {}) {
  const prep = prepare(reel);
  for (const n of prep.notes) console.log(`note: ${n}`);
  let items = buildPages(reel, prep);
  if (only != null) items = items.filter((it) => String(it.scene.n) === String(only) || it.scene.id === String(only));
  const out = path.join(reel.dir, 'build', 'scenes', 'check');
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const report = [], sheets = [];
  const browser = await launch();
  try {
    for (const it of items) {
      const { scene, dur } = it, name = `${scene.file}`;
      const view = await openScene(browser, it.html, 1);
      const at = (times || ['20%', '45%', '70%', 'end']).map((x) => {
        x = String(x).trim();
        if (x === 'end') return dur - 0.04;
        if (x.endsWith('%')) return (Number(x.slice(0, -1)) / 100) * dur;
        return Math.min(Number(x), dur - 0.04);
      });
      const shots = [];
      let inspected = false;
      for (const t of at) {
        await view.seek(t);
        const boxes = await view.inspect(t);
        if (Array.isArray(boxes)) inspected = true;
        for (const b of resting(boxes)) if (outside(b))
          report.push(`scene ${scene.n} (${scene.id}) @${t.toFixed(2)}s: ${b.kind} "${String(b.label).slice(0, 30)}" outside the safe area [${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.w)}x${Math.round(b.h)}]`);
        await view.page.evaluate(([x0, y0, x1, y1]) => {
          let g = document.getElementById('__guides');
          if (!g) { g = document.createElement('div'); g.id = '__guides'; document.body.appendChild(g); }
          g.style.cssText = `position:fixed;left:${x0}px;top:${y0}px;width:${x1 - x0}px;height:${y1 - y0}px;outline:3px dashed rgba(255,0,200,.55);pointer-events:none;z-index:99999`;
        }, SAFE_BOX);
        const png = path.join(out, `${name}.${t.toFixed(2)}s.png`);
        await view.page.screenshot({ path: png });
        await view.page.evaluate(() => document.getElementById('__guides')?.remove());
        shots.push(png);
      }
      if (!inspected) report.push(`scene ${scene.n} (${scene.id}): the engine has no S.inspect, so the safe area was NOT checked (look at the stills)`);
      // seeking: the same time must give the same pixels after jumping elsewhere first
      const mid = dur * 0.55;
      await view.seek(mid); const a = await view.page.screenshot();
      await view.seek(0.05); await view.seek(mid); const b = await view.page.screenshot();
      if (!a.equals(b)) {
        const pa = path.join(out, `${name}.seekA.png`), pb = path.join(out, `${name}.seekB.png`);
        fs.writeFileSync(pa, a); fs.writeFileSync(pb, b);
        const q = spawnSync('ffmpeg', ['-hide_banner', '-i', pa, '-i', pb, '-lavfi', 'psnr', '-f', 'null', '-'], { encoding: 'utf8' });
        const mm = /average:(\S+)/.exec(q.stderr || ''), psnr = mm ? Number(mm[1]) : 0;
        if (!(psnr >= 50)) report.push(`scene ${scene.n} (${scene.id}): NOT SEEKABLE, the frame at ${mid.toFixed(2)}s differs after seeking away and back (PSNR ${psnr})`);
        else { fs.rmSync(pa); fs.rmSync(pb); }
      }
      for (const e of [...(await view.errors()), ...view.pageErrors]) report.push(`scene ${scene.n} (${scene.id}): ERROR ${String(e).slice(0, 300)}`);
      for (const u of view.blocked) report.push(`scene ${scene.n} (${scene.id}): network blocked ${u}`);
      await view.ctx.close();
      const sheet = path.join(out, `${name}.sheet.jpg`);
      const graph = shots.map((_, i) => `[${i}:v]scale=${W / 2}:${H / 2}[s${i}]`).join(';') + ';' + shots.map((_, i) => `[s${i}]`).join('') + `hstack=inputs=${shots.length}`;
      const f = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...shots.flatMap((s) => ['-i', s]), '-filter_complex', shots.length > 1 ? graph : `[0:v]scale=${W / 2}:${H / 2}`, '-q:v', '3', sheet]);
      if (f.status === 0) sheets.push(`${path.relative(reel.dir, sheet)}  (scene ${scene.n}, t = ${at.map((t) => t.toFixed(2)).join(', ')})`);
    }
  } finally { await browser.close().catch(() => {}); }
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ problems: report }, null, 1));
  console.log(`scene check (${reel.cfg.style}, ${items.length} scene(s), safe area x ${SAFE_BOX[0]}..${SAFE_BOX[2]}, y ${SAFE_BOX[1]}..${SAFE_BOX[3]})`);
  for (const s of sheets) console.log(`  sheet ${s}`);
  console.log('  LOOK at every sheet (the magenta box is the safe area): "no problems" is necessary, not sufficient.');
  console.log(report.length ? `\nPROBLEMS (${report.length}):\n  ${report.join('\n  ')}` : '\nscene check: no errors, nothing outside the safe area, every scene seekable');
  if (report.some((r) => !/was NOT checked/.test(r))) process.exitCode = 2;
}

/* ── kit scene <dir> plan ───────────────────────────────────────────────────────────────────────────────────────────── */
export function printPlan(reel) {
  const prep = prepare(reel);
  console.log(`scene plan (${reel.cfg.style}, ${prep.scenes.length} scenes, ${prep.length.toFixed(2)} s${prep.voLength ? `, voice ${prep.voLength.toFixed(2)} s` : ''})`);
  for (const t of prep.times) {
    const s = prep.scenes[t.n - 1];
    console.log(`  ${String(t.n).padStart(2)}  ${t.t0.toFixed(2).padStart(6)}-${t.t1.toFixed(2).padStart(6)}s  ${(t.t1 - t.t0).toFixed(2).padStart(5)} s  ${(s.template || `code ${s.code}`).padEnd(20)} ` +
      (t.source === 'words' ? `words ${t.found}/${t.of}: "${t.first}" .. "${t.last}"` : `even split (${t.found}/${t.of} words found)`));
  }
  for (const n of prep.notes) console.log(`note: ${n}`);
  fs.mkdirSync(path.join(reel.dir, 'build'), { recursive: true });
  fs.writeFileSync(path.join(reel.dir, 'build', 'scene_times.json'), JSON.stringify(prep.times, null, 1));
}

/* ── kit scene list [<style>] ───────────────────────────────────────────────────────────────────────────────────────── */
export function listStyles(id) {
  const reg = registry();
  if (!reg) { console.log('no scene styles in this kit (styles/STYLES.json is missing)'); return; }
  const first = (s) => String(s || '').split(/(?<=\.)\s/)[0].slice(0, 150);
  if (!id) {
    console.log(`scene styles (${sceneStyleIds().length}, from the styles repo at ${reg.version}, synced ${reg.synced}):`);
    for (const s of reg.styles.filter((x) => isSceneStyle(x.id))) console.log(`  ${s.id.padEnd(17)} ${s.name}: ${first(s.description)} (${s.templates.length} templates)`);
    console.log('\nstart one:  kit start reels/<slug> --style <id>     details:  kit scene list <id>');
    return;
  }
  const info = styleInfo(id);
  if (!info) throw new Error(`no scene style "${id}". The kit has: ${sceneStyleIds().join(', ')}`);
  console.log(`${info.name} (${info.id})\n${info.description}\npalette: ${Object.entries(info.palette).map(([k, v]) => `${k} ${v}`).join(', ')}\ntemplates:`);
  for (const t of info.templateDefs) console.log(`  ${t.id.padEnd(22)} ${first(t.description)}`);
  console.log(`\nread before planning: ${path.join(info.dir, 'SKILL.md')} (art direction), ${path.join(info.dir, 'templates.json')} (props of each template), ${path.join(info.dir, 'docs.md')} (the API for a custom "code" scene)`);
}

/* ── kit start <dir> --style <scene style> ──────────────────────────────────────────────────────────────────────────── */
// ASCII only in what the starter writes, the way the styles repo writes its examples
const plain = (v) => typeof v === 'string' ? v.replace(/[\u2014\u2013]/g, ' - ').replace(/\u2026/g, '...').replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/ {2,}/g, ' ')
  : Array.isArray(v) ? v.map(plain) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)])) : v;

export function starterFiles(style) {
  const info = styleInfo(style);
  const picks = info.templateDefs.slice(0, 3);
  const scenes = picks.map((t) => ({ template: t.id, props: plain(t.exampleProps || {}), narration: plain(t.exampleNarration || '') }));
  return {
    'reel.json': { style, name: '', cta: { keyword: 'REEL' }, brand: { handle: '' }, seed: 1 },
    'script.txt': scenes.map((s) => s.narration).join('\n\n') + '\n',
    'scenes.json': { _note: `A sample plan from the first three ${style} templates. Replace it: one scene per idea, "narration" = the exact words of script.txt that scene covers, in order. Templates and their props: kit scene list ${style}. Times come from build/words.json.`, scenes },
  };
}

/* ── kit scene <dir> stand-in: a no-key, no-credit voice for previews and tests ─────────────────────────────────────── */
export function standIn(reel, { pace = 0.38, force = false } = {}) {
  const vo = path.join(reel.dir, 'audio', 'vo.mp3');
  if (fs.existsSync(vo) && !standInActive(reel.dir) && !force)
    throw new Error('audio/vo.mp3 is already there and is not a stand-in (it may be a paid voice take). Refusing to replace it; --force does, if you are sure.');
  const scriptFile = path.join(reel.dir, 'script.txt');
  let text = fs.existsSync(scriptFile) ? fs.readFileSync(scriptFile, 'utf8') : '';
  if (!text.trim()) text = planOf(reel.dir, reel.cfg.style).scenes.map((s) => s.narration).join(' ');
  const words = fakeWords(plain(text), pace);
  if (!words.length) throw new Error('nothing to say: script.txt and the scene narration are empty');
  // a soft two-tone hum on each word, silence between them, so loudness, length and first-word sync can all be measured
  const rate = 48000, length = words.at(-1).e + 0.3, pcm = new Int16Array(Math.ceil(length * rate));
  words.forEach((w, i) => {
    const a = Math.floor(w.s * rate), b = Math.min(pcm.length, Math.floor(w.e * rate)), f = 170 + 25 * (i % 5);
    for (let x = a; x < b; x++) {
      const t = (x - a) / rate, env = Math.min(1, t / 0.015, (b - x) / rate / 0.015);
      pcm[x] = Math.round(9000 * env * (0.7 * Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(4 * Math.PI * f * t)));
    }
  });
  const wav = Buffer.alloc(44 + pcm.length * 2);
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + pcm.length * 2, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22); wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(pcm.length * 2, 40);
  Buffer.from(pcm.buffer).copy(wav, 44);
  fs.mkdirSync(path.join(reel.dir, 'audio'), { recursive: true });
  const tmp = path.join(os.tmpdir(), `bagelunit-stand-in-${process.pid}.wav`);
  fs.writeFileSync(tmp, wav);
  // the level voice.py gives a real take (-14 LUFS), so qa reads the stand-in the way it reads a voice
  try { ffmpeg(['-i', tmp, '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11,aresample=44100', '-ac', '1', '-b:a', '192k', vo]); } finally { fs.rmSync(tmp, { force: true }); }
  writeWords(reel.dir, words);
  fs.writeFileSync(path.join(reel.dir, 'build', 'voice-stand-in.json'), JSON.stringify({ note: 'audio/vo.mp3 is a stand-in tone made by kit scene stand-in, not a voice', sha: sha(fs.readFileSync(vo)), words: words.length }, null, 1));
  console.log(`stand-in voice: audio/vo.mp3 ${mediaLength(vo)?.toFixed(2)} s (a tone on each word, no key, no credits) · ${words.length} fake word times → build/words.json + build/word_index.txt`);
  console.log('This is for previews and tests only. Voice the script with tools/voice.py before anything is approved or posted.');
}
