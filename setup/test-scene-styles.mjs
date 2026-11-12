#!/usr/bin/env node
// Scene styles in the Reel Kit work, with no key and no network (studio/styles, studio/tools/scenes.mjs):
//  1. the synced copy is untouched: every file in studio/styles matches its fingerprint in STYLES.json, nothing but code and
//     text is there, and no em dash
//  2. scene timing: narration matched to build/words.json (exact, a word changed, a scene missing from the voice, no words
//     at all), cuts on frames, lengths that add up
//  3. the commands in a new brand folder: kit start --style <scene style>, kit scene list|plan|stand-in, refusals, and that
//     print still starts as before
//  4. with a browser: kit render (scene by scene, unchanged scenes reused, one scene alone), kit qa on the result, kit scene
//     check, kit frames. The browser is the studio's own (studio/node_modules after npm install and npm run browser), or
//     the playwright folder in PLAYWRIGHT_DIR (the engine is then copied to a temp folder, the way the installer copies it).
//     Without either, part 4 says SKIPPED.
// The voice is the stand-in (a tone and fake word times), never ElevenLabs. Nothing leaves a temp folder.
//   node setup/test-scene-styles.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STUDIO = path.join(REPO, 'studio');
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scene-styles-')));
const PY = process.platform === 'win32' ? 'python' : 'python3';
let failures = 0;
const fail = (m) => { failures++; console.error('FAIL: ' + m); };
const ok = (m) => console.log('ok   ' + m);
const check = (cond, m) => (cond ? ok(m) : fail(m));
const sha16 = (f) => createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 16);

// ── 1. the synced copy ────────────────────────────────────────────────────────────────────────────────────────────────
const STY = path.join(STUDIO, 'styles');
const reg = JSON.parse(fs.readFileSync(path.join(STY, 'STYLES.json'), 'utf8'));
check(reg.format === 'tall' && reg.size[0] === 1080 && reg.size[1] === 1920, `STYLES.json is for tall video (${reg.styles.length} styles, styles repo ${reg.version}, synced ${reg.synced})`);
const changed = [];
for (const [f, h] of Object.entries(reg.core.files)) if (sha16(path.join(STY, '_core', f)) !== h) changed.push(`_core/${f}`);
for (const s of reg.styles) for (const [f, h] of Object.entries(s.files)) if (!fs.existsSync(path.join(STY, s.id, f)) || sha16(path.join(STY, s.id, f)) !== h) changed.push(`${s.id}/${f}`);
check(!changed.length, changed.length ? `copies edited here (edit in the styles repo and sync again): ${changed.join(', ')}` : 'every synced file matches its fingerprint in STYLES.json');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const all = walk(STY);
const odd = all.filter((f) => !/\.(js|mjs|css|json|md|sh)$/.test(f));
check(!odd.length, odd.length ? `files that are not code or text in studio/styles: ${odd.join(', ')}` : `studio/styles holds only code and text (${all.length} files)`);
const EM = String.fromCharCode(0x2014);
const dashed = all.filter((f) => fs.readFileSync(f, 'utf8').includes(EM));
check(!dashed.length, dashed.length ? `em dash in ${dashed.join(', ')}` : 'no em dash in studio/styles');

// ── 2. scene timing (pure functions) ──────────────────────────────────────────────────────────────────────────────────
const scenesLib = await import(pathToFileURL(path.join(STUDIO, 'tools', 'scenes.mjs')).href);
const { timeScenes, fakeWords } = scenesLib;
const plan = [
  { n: 1, id: 'a', narration: 'Sunlight looks white, but it is every colour.' },
  { n: 2, id: 'b', narration: 'Blue scatters the most, so we see blue.' },
  { n: 3, id: 'c', narration: 'Red mostly goes straight through.' },
];
const words = fakeWords(plan.map((s) => s.narration).join(' '));
const onFrames = (ts) => ts.every((t) => Math.abs(t.t0 * 30 - Math.round(t.t0 * 30)) < 1e-6 && Math.abs(t.t1 * 30 - Math.round(t.t1 * 30)) < 1e-6);
const contiguous = (ts) => ts.every((t, i) => i === 0 ? t.t0 === 0 : t.t0 === ts[i - 1].t1) && ts.every((t) => t.frames === Math.round((t.t1 - t.t0) * 30));
{
  const ts = timeScenes(plan, words, { voLength: words.at(-1).e + 0.3 });
  check(ts.every((t) => t.source === 'words'), 'every scene anchored to its words');
  check(onFrames(ts) && contiguous(ts), 'cuts on frames, scenes back to back, frame counts add up');
  const firstB = words.find((w) => w.w === 'Blue'), lastA = words.find((w) => w.w === 'colour.');
  check(ts[1].t0 > lastA.e - 1 / 30 && ts[1].t0 < firstB.s + 1 / 30, `the cut into scene 2 (${ts[1].t0.toFixed(3)}s) falls between "colour." and "Blue"`);
  check(ts.at(-1).t1 >= words.at(-1).e, 'the last scene runs past the last word');
}
{
  const edited = words.map((w) => (w.w === 'every' ? { ...w, w: 'each' } : w)).filter((w) => w.w !== 'so');
  const ts = timeScenes(plan, edited, {});
  check(ts.every((t) => t.source === 'words'), 'a changed and a dropped word still anchor every scene');
}
{
  const ts = timeScenes([plan[0], { n: 2, id: 'x', narration: 'Words that were never spoken at all here.' }, plan[2]], words, {});
  check(ts[0].source === 'words' && ts[1].source === 'even' && ts[2].source === 'words' && ts[1].t1 - ts[1].t0 > 0.5, 'a scene missing from the voice gets the time between its neighbours');
}
{
  const ts = timeScenes(plan, [], { fallbackLength: 12 });
  check(ts.every((t) => t.source === 'even') && Math.abs(ts.at(-1).t1 - 12) < 1e-9 && Math.abs((ts[0].t1 - ts[0].t0) - 4) < 0.05, 'no words.json: an even split over the length');
}

// ── 3. the commands in a new brand folder ─────────────────────────────────────────────────────────────────────────────
function brand(name, studio) {
  const made = spawnSync('node', [path.join(REPO, 'setup', 'new-brand.mjs'), path.join(tmp, name)], { encoding: 'utf8' });
  assert.equal(made.status, 0, made.stderr);
  const B = path.join(tmp, `${name}-reels`), bj = path.join(B, 'brand', 'brand.json');
  fs.writeFileSync(bj, JSON.stringify({ ...JSON.parse(fs.readFileSync(bj, 'utf8')), name: 'Scenes', handle: '@scenes' }, null, 2));
  const kit = (...a) => spawnSync('node', [path.join(studio, 'tools', 'kit.mjs'), ...a], { cwd: B, encoding: 'utf8' });
  return { B, kit };
}
const { B, kit } = brand('cmd', STUDIO);
const out = (r) => (r.stdout || '') + (r.stderr || '');
{
  const r = kit('scene', 'list');
  check(r.status === 0 && (out(r).match(/^ {2}[a-z-]+ /gm) || []).length === reg.styles.length, `kit scene list shows all ${reg.styles.length} styles`);
  const one = kit('scene', 'list', 'map');
  check(one.status === 0 && /templates:/.test(out(one)) && /SKILL\.md/.test(out(one)), 'kit scene list <id> shows the templates and what to read');
  const s = kit('start', 'reels/demo', '--style', 'stick-figure-folk');
  const R = path.join(B, 'reels', 'demo');
  check(s.status === 0 && ['reel.json', 'script.txt', 'scenes.json'].every((f) => fs.existsSync(path.join(R, f))), 'kit start --style stick-figure-folk writes reel.json, script.txt and scenes.json');
  const rj = JSON.parse(fs.readFileSync(path.join(R, 'reel.json'), 'utf8'));
  check(rj.style === 'stick-figure-folk' && rj.name === 'demo' && rj.cta?.keyword, 'reel.json names the style, the reel and a CTA keyword');
  const sj = JSON.parse(fs.readFileSync(path.join(R, 'scenes.json'), 'utf8'));
  check(sj.scenes.length === 3 && sj.scenes.every((x) => x.template && x.props && x.narration), 'the sample plan has 3 scenes with template, props and narration');
  check(kit('start', 'reels/nope', '--style', 'no-such-style').status !== 0, 'kit start refuses an unknown style');
  check(kit('start', 'reels/plain', '--style', 'print').status === 0 && fs.existsSync(path.join(B, 'reels', 'plain', 'index.html')), 'kit start --style print still makes a print reel');
  const p = kit('scene', 'reels/plain', 'plan');
  check(p.status !== 0 && /is a print reel/.test(out(p)), 'kit scene refuses a print reel in plain words');
  const v = kit('scene', 'reels/demo', 'stand-in');
  check(v.status === 0 && fs.existsSync(path.join(R, 'audio', 'vo.mp3')) && fs.existsSync(path.join(R, 'build', 'words.json')) && fs.existsSync(path.join(R, 'build', 'word_index.txt')), 'kit scene stand-in writes audio/vo.mp3, build/words.json and build/word_index.txt (no key)');
  const wj = JSON.parse(fs.readFileSync(path.join(R, 'build', 'words.json'), 'utf8'));
  check(Array.isArray(wj) && wj.length > 20 && ['w', 's', 'e'].every((k) => k in wj[0]), 'words.json has the voice.py format [{w, s, e}]');
  const pl = kit('scene', 'reels/demo', 'plan');
  check(pl.status === 0 && (out(pl).match(/words (\d+)\/\1:/g) || []).length === 3, 'kit scene plan anchors all 3 sample scenes to their words');
  // a voice that is not a stand-in is never replaced
  fs.copyFileSync(path.join(R, 'audio', 'vo.mp3'), path.join(tmp, 'vo-copy.mp3'));
  spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=d=1', path.join(R, 'audio', 'vo.mp3')]);
  const again = kit('scene', 'reels/demo', 'stand-in');
  check(again.status !== 0 && /not a stand-in/.test(out(again)), 'kit scene stand-in refuses to replace a real voice take');
  fs.copyFileSync(path.join(tmp, 'vo-copy.mp3'), path.join(R, 'audio', 'vo.mp3'));
  const fx = spawnSync(PY, [path.join(STUDIO, 'tools', 'effort.py'), R], { encoding: 'utf8' });
  check(fx.status === 0 && /SKIPPED/.test(out(fx)), 'kit effort says it does not apply to a scene style (no false FAIL)');
  const ln = spawnSync(PY, [path.join(STUDIO, 'tools', 'lint.py'), R], { encoding: 'utf8' });
  check(ln.status === 0 && /no shot data/.test(out(ln)), 'kit lint runs on a scene-style reel (no shot data, nothing checked)');
}

// ── 4. rendering, with a browser ──────────────────────────────────────────────────────────────────────────────────────
function engineWithBrowser() {
  try { createRequire(path.join(STUDIO, 'package.json')).resolve('playwright'); return STUDIO; } catch { /* not installed in studio */ }
  const dir = process.env.PLAYWRIGHT_DIR;
  if (!dir || !fs.existsSync(path.join(dir, 'node_modules', 'playwright'))) return null;
  const eng = path.join(tmp, 'engine');
  fs.cpSync(STUDIO, eng, { recursive: true, filter: (src) => !src.split(path.sep).includes('node_modules') });
  fs.symlinkSync(path.join(dir, 'node_modules'), path.join(eng, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  return eng;
}
const eng = engineWithBrowser();
if (!eng) console.log('SKIPPED part 4 (render, qa, check): no browser. Run npm install and npm run browser inside studio/, or set PLAYWRIGHT_DIR.');
else {
  const { B: B2, kit: k2 } = brand('render', eng);
  k2('start', 'reels/short', '--style', 'stick-figure-folk');
  const R = path.join(B2, 'reels', 'short');
  const tpl = JSON.parse(fs.readFileSync(path.join(eng, 'styles', 'stick-figure-folk', 'templates.json'), 'utf8'));
  const props = (id) => tpl.find((t) => t.id === id).exampleProps;
  const short = [
    { template: 'title-card', props: props('title-card'), narration: 'Chapter one. The universe, briefly.' },
    { template: 'figure-explains', props: props('figure-explains'), narration: 'Sunlight looks white, but blue scatters the most.' },
    { template: 'versus', props: props('versus'), narration: 'Cats or dogs? Science has no answer.' },
  ];
  fs.writeFileSync(path.join(R, 'scenes.json'), JSON.stringify({ scenes: short }, null, 2));
  fs.writeFileSync(path.join(R, 'script.txt'), short.map((s) => s.narration).join(' ') + '\n');
  check(k2('scene', 'reels/short', 'stand-in').status === 0, 'stand-in voice for the short reel');
  const r1 = k2('render', 'reels/short');
  check(r1.status === 0 && /3 rendered, 0 reused/.test(out(r1)), `kit render draws all 3 scenes${r1.status ? ': ' + out(r1).slice(-400) : ''}`);
  const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', path.join(R, 'build', 'video.mp4')], { encoding: 'utf8' }).stdout.trim().replace(/,+$/, '');
  const probeD = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', path.join(R, 'build', 'draft.mp4')], { encoding: 'utf8' }).stdout.trim().replace(/,+$/, '');
  check(probe === '1080,1920' && probeD === '540,960', `build/video.mp4 is 1080x1920 and build/draft.mp4 is 540x960 (${probe} / ${probeD})`);
  check(/0 rendered, 3 reused/.test(out(k2('render', 'reels/short'))), 'a second render reuses every unchanged scene');
  short[1].props = { ...short[1].props, label: 'all colours, mixed' };
  fs.writeFileSync(path.join(R, 'scenes.json'), JSON.stringify({ scenes: short }, null, 2));
  check(/1 rendered, 2 reused/.test(out(k2('render', 'reels/short'))), 'changing one scene re-renders only that scene');
  const one = k2('render', 'reels/short', '--scene', '3');
  check(one.status === 0 && /scene 3: build\/scenes\/003\.mp4/.test(out(one).replace(/\\/g, '/')), 'kit render --scene 3 renders that scene alone');
  const qa = spawnSync(PY, [path.join(eng, 'tools', 'qa.py'), R, path.join(R, 'build', 'video.mp4')], { encoding: 'utf8' });
  const qaOut = out(qa);
  check(/QA: PASS/.test(qaOut) && /PASS\s+spec/.test(qaOut) && /PASS\s+sync/.test(qaOut) && /PASS\s+text\s+\d+ resting boxes/.test(qaOut), `kit qa passes on the render (spec, sync, safe zone from S.inspect)${/QA: PASS/.test(qaOut) ? '' : '\n' + qaOut}`);
  const ck = k2('scene', 'reels/short', 'check');
  check(ck.status === 0 && fs.readdirSync(path.join(R, 'build', 'scenes', 'check')).filter((f) => f.endsWith('.sheet.jpg')).length === 3, `kit scene check passes and writes a sheet per scene${ck.status ? '\n' + out(ck).slice(-600) : ''}`);
  const fr = k2('frames', 'reels/short', '0.5', '4');
  check(fr.status === 0 && fs.existsSync(path.join(R, 'stills', 't0.50.jpg')) && fs.existsSync(path.join(R, 'stills', 'sheet.jpg')), 'kit frames works on a scene-style reel');
  const pc = spawnSync(PY, [path.join(eng, 'tools', 'pace.py'), R], { encoding: 'utf8' });
  check(/pace check \(stick-figure-folk/.test(out(pc)), 'kit pace runs on a scene-style reel (the print bar)');
}

fs.rmSync(tmp, { recursive: true, force: true });
if (failures) { console.error(`\n${failures} check(s) failed.`); process.exit(1); }
console.log('\nScene styles test passed.');
