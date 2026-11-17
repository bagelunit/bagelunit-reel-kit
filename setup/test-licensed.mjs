#!/usr/bin/env node
// Licensed assets (Uppbeat) work, in temp folders, with no key and no network (studio/tools/licensed.mjs, kit licensed):
//   1. the registry: add / list / remove, a duplicate id, a path-traversal id, a missing file, a wrong type or extension, a changed file
//   2. kit licensed check <reel>: PASS, an unrecorded id, a wrong type, a changed file (sha mismatch), a path outside brand/licensed/
//   3. a LUT must be a complete .cube file
//   4. planOf: a clip scene and an overlay (valid, and every refusal)
//   5. with ffmpeg: a clip scene and overlays composited into a real build/video.mp4 (fixtures made by lavfi), unchanged scenes reused,
//      a changed overlay drawn again; the LUT grade at strength 1 and 0.5; and with numpy a licensed music bed ducked under the voice
//      through kit export (build/music.json, out/<name>.mp4)
//   6. Gate C refuses a reel whose assets fail the check and writes the credits into approvals.md when they pass
//   7. the brand folder: .gitignore keeps media out and assets.json in, the template ships an empty registry, sync-template never
//      touches a brand's assets.json or media (and adds the README and empty folders), scan-repo refuses a tracked asset
// Run in CI: node setup/test-licensed.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tools = path.join(REPO, 'studio', 'tools');
const KIT = path.join(tools, 'kit.mjs');
const PY = process.platform === 'win32' ? 'python' : 'python3';
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'licensed-test-')));
const home = path.join(tmp, 'home');
fs.mkdirSync(path.join(home, '.config', 'bagelunit-reels'), { recursive: true });
const env = { ...process.env, HOME: home, USERPROFILE: home };
delete env.ELEVENLABS_API_KEY;
const out = (r) => `${r.stdout || ''}${r.stderr || ''}`;
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', env, ...opts });
const has = (cmd) => spawnSync(cmd, ['-version'], { encoding: 'utf8' }).status === 0;
const W = (f, body) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, body); };
const sha = (f) => createHash('sha256').update(fs.readFileSync(f)).digest('hex');
let passed = 0;
const ok = (m) => { passed++; console.log('ok   ' + m); };

// a brand folder (the nearest folder with brand/brand.json) and a reel in it
const brand = path.join(tmp, 'acme-reels');
W(path.join(brand, 'brand', 'brand.json'), '{"name":"Acme"}');
W(path.join(brand, 'brand', 'licensed', 'assets.json'), '{"assets":[]}\n');
const reel = path.join(brand, 'reels', 'r1');
W(path.join(reel, 'reel.json'), JSON.stringify({ style: 'print', name: 'r1', duration: 4 }));
const dl = path.join(tmp, 'downloads');
fs.mkdirSync(dl, { recursive: true });
const licensed = (...a) => run('node', [KIT, 'licensed', ...a], { cwd: brand });
const registry = () => JSON.parse(fs.readFileSync(path.join(brand, 'brand', 'licensed', 'assets.json'), 'utf8')).assets;
const setReel = (o) => W(path.join(reel, 'reel.json'), JSON.stringify({ style: 'print', name: 'r1', duration: 4, ...o }));
const CUBE_ID = ['LUT_3D_SIZE 2', ...[0, 1].flatMap((b) => [0, 1].flatMap((g) => [0, 1].map((r) => `${r} ${g} ${b}`)))].join('\n') + '\n';
const CUBE_INV = ['TITLE "invert"', 'LUT_3D_SIZE 2', ...[0, 1].flatMap((b) => [0, 1].flatMap((g) => [0, 1].map((r) => `${1 - r} ${1 - g} ${1 - b}`)))].join('\n') + '\n';

/* ── 1. the registry ──────────────────────────────────────────────────────────────────────────────────────────────── */
W(path.join(dl, 'clear-skies.wav'), 'pretend wav bytes');
let r = licensed('add', path.join(dl, 'clear-skies.wav'), '--type', 'music', '--title', 'Clear Skies', '--artist', 'A. Artist', '--url', 'https://uppbeat.io/track/x',
  '--source', 'uppbeat', '--plan', 'business', '--channels', 'my-channel, other', '--credit', 'Music: Clear Skies by A. Artist via Uppbeat');
assert.equal(r.status, 0, out(r));
let reg = registry();
assert.equal(reg.length, 1);
const a = reg[0];
assert.equal(a.id, 'clear-skies'); assert.equal(a.type, 'music'); assert.equal(a.source, 'uppbeat'); assert.equal(a.plan, 'business');   // given with --source and --plan; with neither they stay empty (any site works)
assert.deepEqual(a.channels, ['my-channel', 'other']); assert.equal(a.file, 'brand/licensed/music/clear-skies.wav');
assert.equal(a.sha256, sha(path.join(brand, a.file))); assert.equal(a.credit, 'Music: Clear Skies by A. Artist via Uppbeat');
assert.match(a.downloaded, /^\d{4}-\d{2}-\d{2}$/);
assert.ok(fs.existsSync(path.join(dl, 'clear-skies.wav')), 'add copies by default');
ok('add records the asset with its hash, channels and credit, and copies the file into brand/licensed/music/');

r = licensed('list');
assert.equal(r.status, 0); assert.match(r.stdout, /clear-skies\s+music\s+Clear Skies by A\. Artist/);
assert.equal(licensed('list', '--type', 'lut').stdout.includes('clear-skies'), false);
ok('list shows it, and --type filters');

r = licensed('add', path.join(dl, 'clear-skies.wav'), '--type', 'music', '--title', 'Clear Skies');
assert.notEqual(r.status, 0); assert.match(out(r), /already recorded/);
assert.equal(registry().length, 1);
for (const bad of ['../evil', 'a/b', '..', 'Up Per', '.hidden']) {
  r = licensed('add', path.join(dl, 'clear-skies.wav'), '--type', 'music', '--title', 'T', '--id', bad);
  assert.notEqual(r.status, 0, `id "${bad}" must be refused`); assert.match(out(r), /not allowed/);
}
assert.equal(fs.existsSync(path.join(brand, 'brand', 'evil.wav')), false);
r = licensed('add', path.join(dl, 'nope.wav'), '--type', 'music', '--title', 'T');
assert.notEqual(r.status, 0); assert.match(out(r), /is not a file/);
r = licensed('add', path.join(dl, 'clear-skies.wav'), '--type', 'sparkles', '--title', 'T', '--id', 'x1');
assert.notEqual(r.status, 0); assert.match(out(r), /--type must be one of/);
r = licensed('add', path.join(dl, 'clear-skies.wav'), '--type', 'stock-video', '--title', 'T', '--id', 'x2');
assert.notEqual(r.status, 0); assert.match(out(r), /stock-video is one of/);
r = licensed('add', path.join(dl, 'clear-skies.wav'), '--type', 'music');
assert.notEqual(r.status, 0); assert.match(out(r), /--title is needed/);
assert.equal(registry().length, 1);
ok('refuses a duplicate id, a traversal id, a missing file, a wrong type, a wrong extension and a missing title');

W(path.join(dl, 'loop.mp3'), 'mp3 bytes');
r = licensed('add', path.join(dl, 'loop.mp3'), '--type', 'music', '--title', 'Loop One', '--move');
assert.equal(r.status, 0, out(r)); assert.match(r.stdout, /WAV/);
assert.equal(fs.existsSync(path.join(dl, 'loop.mp3')), false, '--move removes the download');
r = licensed('remove', 'loop-one');
assert.equal(r.status, 0, out(r));
assert.equal(fs.existsSync(path.join(brand, 'brand', 'licensed', 'music', 'loop-one.mp3')), false);
assert.equal(registry().length, 1);
assert.notEqual(licensed('remove', 'loop-one').status, 0);
ok('--move moves, remove deletes the entry and its file, an unknown id is refused');

/* ── 2. kit licensed check ───────────────────────────────────────────────────────────────────────────────────────── */
r = licensed('check', reel);
assert.equal(r.status, 0, out(r)); assert.match(r.stdout, /PASS: this reel uses no licensed assets/);
setReel({ music: [{ asset: 'clear-skies', from: 0, fade: 1, gain_db: -18 }] });
r = licensed('check', reel);
assert.equal(r.status, 0, out(r)); assert.match(r.stdout, /PASS: clear-skies \(reel\.json music\[1\]\)/); assert.match(r.stdout, /LICENSED: PASS/);
setReel({ music: [{ asset: 'ghost' }] });
r = licensed('check', reel);
assert.equal(r.status, 1); assert.match(r.stdout, /FAIL: ghost \(reel\.json music\[1\]\) is not in brand\/licensed\/assets\.json/);
setReel({ look: { lut: 'clear-skies' } });
r = licensed('check', reel);
assert.equal(r.status, 1); assert.match(r.stdout, /FAIL: clear-skies .* is a music, but a lut is needed here/);
setReel({ music: [{ asset: 'clear-skies' }] });
fs.appendFileSync(path.join(brand, a.file), 'tampered');
r = licensed('check', reel);
assert.equal(r.status, 1); assert.match(r.stdout, /FAIL: clear-skies .* changed since it was recorded/);
assert.equal(licensed('check').status, 1, 'check with no reel checks every recorded asset too');
fs.writeFileSync(path.join(brand, a.file), 'pretend wav bytes');
assert.equal(licensed('check', reel).status, 0);
fs.rmSync(path.join(brand, a.file));
r = licensed('check', reel);
assert.equal(r.status, 1); assert.match(r.stdout, /file is missing/);
fs.writeFileSync(path.join(brand, a.file), 'pretend wav bytes');
const regFile = path.join(brand, 'brand', 'licensed', 'assets.json');
const saved = fs.readFileSync(regFile, 'utf8');
W(regFile, JSON.stringify({ assets: [{ ...a, file: '../brand.json' }] }));
r = licensed('check', reel);
assert.equal(r.status, 1); assert.match(r.stdout, /points outside brand\/licensed\//);
W(regFile, saved);
assert.equal(licensed('check', reel).status, 0);
ok('check: PASS, unrecorded id, wrong type, sha mismatch, missing file and a file path outside brand/licensed/ (exit 1)');

/* ── 3. LUT validation ───────────────────────────────────────────────────────────────────────────────────────────── */
W(path.join(dl, 'warm.cube'), CUBE_ID);
r = licensed('add', path.join(dl, 'warm.cube'), '--type', 'lut', '--title', 'Warm', '--source', 'uppbeat', '--plan', 'business');
assert.equal(r.status, 0, out(r));
for (const [name, body, why] of [['short.cube', 'LUT_3D_SIZE 2\n0 0 0\n1 1 1\n', /needs 8 rows/], ['nosize.cube', '0 0 0\n1 1 1\n', /no LUT_3D_SIZE/],
  ['text.cube', 'LUT_3D_SIZE 2\nhello there\n', /not a \.cube file/], ['huge.cube', 'LUT_3D_SIZE 999\n', /outside 2 to 256/]]) {
  W(path.join(dl, name), body);
  r = licensed('add', path.join(dl, name), '--type', 'lut', '--title', name);
  assert.notEqual(r.status, 0, name); assert.match(out(r), why);
}
W(path.join(dl, 'not-a-lut.png'), 'x');
assert.notEqual(licensed('add', path.join(dl, 'not-a-lut.png'), '--type', 'lut', '--title', 'p').status, 0);
assert.equal(registry().filter((x) => x.type === 'lut').length, 1);
ok('a .cube must be complete (3D size, N^3 rows); bad files are refused and not recorded');

/* ── 4. planOf: clip and overlay ─────────────────────────────────────────────────────────────────────────────────── */
const scenesLib = await import(pathToFileURL(path.join(tools, 'scenes.mjs')).href);
const plan = (scenes) => { W(path.join(reel, 'scenes.json'), JSON.stringify({ scenes })); return scenesLib.planOf(reel, 'no-such-style'); };
{
  const { scenes } = plan([{ clip: { asset: 'city', start: 2, duration: 5 }, narration: 'a cutaway' }, { clip: { asset: 'city' }, overlay: { asset: 'leak', blend: 'screen', opacity: 0.5, at: 1, duration: 2 }, narration: 'b' }]);
  assert.deepEqual(scenes[0].clip, { asset: 'city', start: 2, duration: 5, mute: true });
  assert.equal(scenes[0].overlay, null); assert.equal(scenes[0].template, null); assert.match(scenes[0].id, /clip$/);
  assert.deepEqual(scenes[1].clip, { asset: 'city', start: 0, duration: null, mute: true });
  assert.deepEqual(scenes[1].overlay, { asset: 'leak', blend: 'screen', opacity: 0.5, at: 1, duration: 2 });
  assert.equal(plan([{ clip: { asset: 'c', mute: false }, narration: 'x' }]).scenes[0].clip.mute, false);
  for (const [bad, why] of [[{ clip: {}, narration: 'x' }, /clip" needs/], [{ clip: { asset: 'c', start: -1 }, narration: 'x' }, /clip\.start/], [{ clip: { asset: 'c', duration: 0 }, narration: 'x' }, /clip\.duration/],
    [{ clip: { asset: 'c' }, template: 'foo', narration: 'x' }, /cannot also have/], [{ clip: { asset: 'c' }, overlay: { asset: 'o', blend: 'multiply' }, narration: 'x' }, /blend must be normal or screen/],
    [{ clip: { asset: 'c' }, overlay: { asset: 'o', opacity: 2 }, narration: 'x' }, /overlay\.opacity/], [{ clip: { asset: 'c' }, overlay: {}, narration: 'x' }, /overlay" needs/]]) {
    assert.throws(() => plan([bad]), why);
  }
}
ok('planOf reads a clip scene and an overlay, with defaults, and refuses every malformed one');

/* ── 5. real ffmpeg ──────────────────────────────────────────────────────────────────────────────────────────────── */
if (!has('ffmpeg') || !has('ffprobe')) console.log('SKIPPED: ffmpeg or ffprobe is not installed, so the composite, grade and mix checks did not run');
else {
  const ff = (...args) => { const x = run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]); assert.equal(x.status, 0, out(x)); };
  const pixel = (file, t, x = 540, y = 960) => {
    const x2 = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-ss', String(t), '-i', file, '-frames:v', '1', '-vf', `crop=1:1:${x}:${y},format=rgb24`, '-f', 'rawvideo', '-'], { encoding: 'buffer' });
    assert.equal(x2.status, 0); return [...x2.stdout];
  };
  const near = (p, want, tol = 30) => p.every((v, i) => Math.abs(v - want[i]) <= tol);
  const probe = (file, entry) => run('ffprobe', ['-v', 'error', '-show_entries', entry, '-of', 'csv=p=0', file]).stdout.trim();
  // fixtures: a blue stock clip (landscape, 2 s, with a sound), a red PNG, a white light-leak clip, an alpha .mov
  ff('-f', 'lavfi', '-i', 'color=c=0x0000ff:s=640x360:r=30:d=2', '-f', 'lavfi', '-i', 'sine=frequency=300:d=2', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', path.join(dl, 'city.mp4'));
  ff('-f', 'lavfi', '-i', 'color=c=red:s=64x64', '-frames:v', '1', path.join(dl, 'red.png'));
  ff('-f', 'lavfi', '-i', 'color=c=white:s=320x180:r=30:d=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(dl, 'leak.mp4'));
  ff('-f', 'lavfi', '-i', 'color=c=green@0.0:s=320x180:r=30:d=1,format=rgba', '-c:v', 'qtrle', path.join(dl, 'clear.mov'));
  for (const [file, type, id] of [['city.mp4', 'stock-video', 'city'], ['red.png', 'motion-graphic', 'red-card'], ['leak.mp4', 'motion-graphic', 'light-leak'], ['clear.mov', 'motion-graphic', 'clear-glass']]) {
    const x = licensed('add', path.join(dl, file), '--type', type, '--title', id, '--id', id);
    assert.equal(x.status, 0, out(x));
  }
  W(path.join(dl, 'invert.cube'), CUBE_INV);
  assert.equal(licensed('add', path.join(dl, 'invert.cube'), '--type', 'lut', '--title', 'Invert', '--id', 'invert').status, 0);

  // a reel of clip scenes: 1 plain clip, 2 clip with a screen overlay (white leak), 3 clip with a normal PNG overlay at 50 %, 4 a transparent .mov overlay
  const scenesPath = path.join(reel, 'scenes.json');
  const sceneList = (o2 = 1) => [
    { clip: { asset: 'city', start: 0.2, duration: 1 }, narration: 'one' },
    { clip: { asset: 'city' }, overlay: { asset: 'light-leak', blend: 'screen', opacity: 1, at: 0 }, narration: 'two' },
    { clip: { asset: 'city', mute: false }, overlay: { asset: 'red-card', blend: 'normal', opacity: o2, at: 0 }, narration: 'three' },
    { clip: { asset: 'city' }, overlay: { asset: 'clear-glass', blend: 'normal' }, narration: 'four' }];
  setReel({ style: 'print', duration: 8 });
  W(scenesPath, JSON.stringify({ scenes: sceneList() }));
  fs.mkdirSync(path.join(reel, 'build'), { recursive: true });
  const rcfg = { dir: reel, cfg: JSON.parse(fs.readFileSync(path.join(reel, 'reel.json'), 'utf8')) };
  const render = async () => { const lines = []; const orig = console.log; console.log = (...x) => lines.push(x.join(' ')); try { await scenesLib.renderScenes(rcfg, {}); } finally { console.log = orig; } return lines.join('\n'); };
  let log = await render();
  assert.match(log, /4 scenes: 4 rendered, 0 reused/, log);
  const video = path.join(reel, 'build', 'video.mp4');
  assert.equal(probe(video, 'stream=width,height').replace(/\n/g, ','), '1080,1920', 'video is 1080x1920');
  assert.ok(Math.abs(Number(probe(video, 'format=duration')) - 8) < 0.25, `duration ${probe(video, 'format=duration')}`);
  // scenes sit at 0-2, 2-4, 4-6, 6-8
  assert.ok(near(pixel(video, 1), [0, 0, 255]), `scene 1 is the blue clip, filling the frame (${pixel(video, 1)})`);
  assert.ok(near(pixel(video, 1, 5, 5), [0, 0, 255]) && near(pixel(video, 1, 1070, 1910), [0, 0, 255]), 'the 16:9 clip is cropped to fill 1080x1920 (corners are the clip too)');
  assert.ok(near(pixel(video, 3), [255, 255, 255]), `scene 2: a screen overlay of white lights the picture (${pixel(video, 3)})`);
  assert.ok(near(pixel(video, 5), [255, 0, 0]), `scene 3: an opaque normal overlay covers the clip with red (${pixel(video, 5)})`);
  assert.ok(near(pixel(video, 7), [0, 0, 255]), `scene 4: a fully transparent .mov overlay keeps the clip (${pixel(video, 7)})`);
  const mans = [1, 2, 3, 4].map((n) => JSON.parse(fs.readFileSync(path.join(reel, 'build', 'scenes', `00${n}.json`), 'utf8')));
  assert.ok(mans.every((m) => m.errors.length === 0 && m.inspect === false && m.texts.length === 0), 'a clip or overlay adds no text and no boxes');
  assert.equal(fs.readFileSync(path.join(reel, 'build', 'on_screen_text.txt'), 'utf8').trim(), '', 'an overlay is never counted as on-screen text');
  const sceneFile = path.join(reel, 'build', 'scenes', '001.mp4');
  const vcodec = run('ffprobe', ['-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=codec_name,profile,pix_fmt,r_frame_rate,time_base', '-of', 'csv=p=0', sceneFile]).stdout.trim();
  const vcodec4 = run('ffprobe', ['-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=codec_name,profile,pix_fmt,r_frame_rate,time_base', '-of', 'csv=p=0', path.join(reel, 'build', 'scenes', '004.mp4')]).stdout.trim();
  assert.equal(vcodec, vcodec4, 'every scene has the same codec settings, so the join needs no new encode');
  ok('a clip scene and overlays render through the real pipeline: 1080x1920, cropped to fill, screen and normal blends, alpha kept, no text, same codec for every scene');

  log = await render();
  assert.match(log, /4 scenes: 0 rendered, 4 reused/, 'nothing changed: every scene reused');
  W(scenesPath, JSON.stringify({ scenes: sceneList(0) }));
  log = await render();
  assert.match(log, /4 scenes: 1 rendered, 3 reused/, `changing one overlay draws only that scene again: ${log}`);
  assert.ok(near(pixel(video, 5), [0, 0, 255]), 'opacity 0 leaves the clip');
  W(scenesPath, JSON.stringify({ scenes: sceneList(0.5) }));
  await render();
  assert.ok(near(pixel(video, 5), [128, 0, 128], 40), `opacity 0.5 mixes red over blue (${pixel(video, 5)})`);
  // a changed asset file is caught before it is used
  fs.appendFileSync(path.join(brand, 'brand', 'licensed', 'stock-video', 'city.mp4'), 'x');
  await assert.rejects(render(), /changed since it was recorded/);
  fs.writeFileSync(path.join(brand, 'brand', 'licensed', 'stock-video', 'city.mp4'), fs.readFileSync(path.join(dl, 'city.mp4')));
  ok('unchanged scenes are reused, a changed overlay redraws only its scene, and a tampered asset stops the render');

  // the LUT grade
  setReel({ look: { lut: 'invert', strength: 1 } });
  const g1 = scenesLib && (await import(pathToFileURL(path.join(tools, 'licensed.mjs')).href)).gradeFor(reel, JSON.parse(fs.readFileSync(path.join(reel, 'reel.json'), 'utf8')), brand);
  assert.match(g1.note, /licensed LUT "invert" at strength 1/); assert.doesNotMatch(g1.note, /look\.cube/);
  const gradeTo = (filter, file) => ff('-i', video, '-t', '1', '-filter_complex', filter, '-map', '[v]', '-pix_fmt', 'yuv420p', file);
  gradeTo(g1.filter, path.join(tmp, 'g1.mp4'));
  assert.ok(near(pixel(path.join(tmp, 'g1.mp4'), 0.5), [255, 255, 0], 40), `strength 1 inverts the blue clip to yellow (${pixel(path.join(tmp, 'g1.mp4'), 0.5)})`);
  W(path.join(brand, 'scripts', 'fx', 'look.cube'), CUBE_ID);
  setReel({ look: { lut: 'invert', strength: 0.5 } });
  const g2 = (await import(pathToFileURL(path.join(tools, 'licensed.mjs')).href)).gradeFor(reel, JSON.parse(fs.readFileSync(path.join(reel, 'reel.json'), 'utf8')), brand);
  assert.match(g2.note, /wins over the brand's scripts\/fx\/look\.cube slot/);
  gradeTo(g2.filter, path.join(tmp, 'g2.mp4'));
  assert.ok(near(pixel(path.join(tmp, 'g2.mp4'), 0.5), [128, 128, 128], 45), `strength 0.5 is the middle (${pixel(path.join(tmp, 'g2.mp4'), 0.5)})`);
  const gm = await import(pathToFileURL(path.join(tools, 'licensed.mjs')).href);
  assert.throws(() => gm.gradeFor(reel, { look: { lut: 'invert', strength: 3 } }, brand), /strength must be a number from 0 to 1/);
  assert.throws(() => gm.gradeFor(reel, { look: { lut: 'clear-skies' } }, brand), /is a music, but a lut is needed/);
  assert.equal(gm.gradeFor(reel, {}, brand), null);
  ok('look.lut: strength 1 applies the LUT, 0.5 blends halfway, the brand look.cube slot is overridden and said so, bad strength or type refused');

  // music under the voice, through kit export (needs numpy for the mix)
  const numpy = run(PY, ['-c', 'import numpy']).status === 0;
  if (!numpy) console.log('SKIPPED: numpy is not installed, so the licensed music bed and kit export were not run');
  else {
    // voice: 1000 Hz for 2 s then silence for 2 s; bed: 440 Hz for 4 s
    ff('-f', 'lavfi', '-i', 'sine=frequency=440:d=4', '-ar', '48000', path.join(dl, 'bed.wav'));
    assert.equal(licensed('add', path.join(dl, 'bed.wav'), '--type', 'music', '--title', 'Bed', '--id', 'bed').status, 0);
    fs.mkdirSync(path.join(reel, 'audio'), { recursive: true });
    ff('-f', 'lavfi', '-i', 'sine=frequency=1000:d=2', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-filter_complex', '[1:a]atrim=0:2[s];[0:a][s]concat=n=2:v=0:a=1[a]', '-map', '[a]', path.join(reel, 'audio', 'vo.mp3'));
    W(scenesPath, JSON.stringify({ scenes: [{ clip: { asset: 'city' }, narration: 'one' }, { clip: { asset: 'city' }, narration: 'two' }] }));
    setReel({ duration: 4, music: [{ asset: 'bed', from: 0, fade: 0.2, gain_db: -12 }] });
    rcfg.cfg = JSON.parse(fs.readFileSync(path.join(reel, 'reel.json'), 'utf8'));
    await render();
    r = run('node', [KIT, 'export', reel], { cwd: brand });
    assert.equal(r.status, 0, out(r));
    const rec = JSON.parse(fs.readFileSync(path.join(reel, 'build', 'music.json'), 'utf8'));
    assert.equal(rec.length, 1); assert.equal(rec[0].asset, 'bed'); assert.equal(rec[0].sha256, sha(path.join(brand, 'brand', 'licensed', 'music', 'bed.wav'))); assert.equal(rec[0].gain_db, -12);
    const mp4 = path.join(reel, 'out', 'r1.mp4');
    assert.ok(fs.existsSync(mp4), 'out/r1.mp4 exists');
    const band = (t0, t1) => { const x = run('ffmpeg', ['-hide_banner', '-nostats', '-ss', String(t0), '-t', String(t1 - t0), '-i', mp4, '-af', 'bandpass=f=440:width_type=h:w=60,astats=metadata=0', '-f', 'null', '-']); const m = /Overall[\s\S]*?RMS level dB: (-?[\d.]+|-inf)/.exec(out(x)); return m ? Number(m[1]) : -120; };
    const withVoice = band(0.6, 1.8), voiceFree = band(2.6, 3.8);
    assert.ok(voiceFree > -90, `the bed is audible without the voice (${voiceFree} dB)`);
    assert.ok(withVoice < voiceFree - 3, `the bed is ducked under the voice: ${withVoice.toFixed(1)} dB with it, ${voiceFree.toFixed(1)} dB without`);
    // a bad asset stops the mix with the reason
    setReel({ duration: 4, music: [{ asset: 'ghost' }] });
    r = run(PY, [path.join(tools, 'sound.py'), reel], { cwd: brand });
    assert.notEqual(r.status, 0); assert.match(out(r), /no licensed asset "ghost"/);
    setReel({ duration: 4, music: [{ asset: 'city' }] });
    r = run(PY, [path.join(tools, 'sound.py'), reel], { cwd: brand });
    assert.notEqual(r.status, 0); assert.match(out(r), /is a stock-video, not music/);
    ok('kit export mixes a licensed music bed under the voice (ducked, recorded with its hash in build/music.json) and refuses an unrecorded or wrong-type asset');
  }
}

/* ── 6. Gate C ───────────────────────────────────────────────────────────────────────────────────────────────────── */
{
  const gate = (...a) => run(PY, [path.join(tools, 'gate.py'), reel, ...a]);
  const skips = ['--skip-order', 't', '--skip-facts', 't', '--skip-qa', 't', '--skip-review', 't'];
  setReel({ look: { lut: 'warm' }, music: [{ asset: 'clear-skies' }] });
  fs.rmSync(path.join(reel, 'scenes.json'), { force: true });   // earlier groups leave a plan behind; this group is about look and music only
  W(path.join(reel, 'out', 'r1.mp4'), 'a pretend final video');
  W(path.join(reel, 'approvals.md'), '# Approvals\n');
  fs.writeFileSync(path.join(brand, a.file), 'changed bytes');
  let g = gate('record', '--gate', 'C', ...skips);
  assert.notEqual(g.status, 0, 'Gate C must refuse a reel whose licensed asset changed');
  assert.match(out(g), /licensed asset this reel uses is not in order: clear-skies .* changed since it was recorded/);
  assert.doesNotMatch(fs.readFileSync(path.join(reel, 'approvals.md'), 'utf8'), /Gate C/);
  g = gate('record', '--gate', 'C', ...skips, '--skip-licensed', 'x');
  assert.notEqual(g.status, 0, 'there is no override for the licence check');
  fs.writeFileSync(path.join(brand, a.file), 'pretend wav bytes');
  g = gate('record', '--gate', 'C', ...skips);
  assert.equal(g.status, 0, out(g));
  const text = fs.readFileSync(path.join(reel, 'approvals.md'), 'utf8');
  assert.match(text, /- Licensed asset: clear-skies: "Clear Skies" by A\. Artist \(uppbeat, business plan, https:\/\/uppbeat\.io\/track\/x\) credit: Music: Clear Skies by A\. Artist via Uppbeat/);
  assert.match(text, /- Licensed asset: warm: "Warm" \(uppbeat, business plan\)/);
  setReel({});
  fs.rmSync(path.join(reel, 'scenes.json'), { force: true });
  W(path.join(reel, 'approvals.md'), '# Approvals\n');
  g = gate('record', '--gate', 'C', ...skips);
  assert.equal(g.status, 0, out(g)); assert.match(fs.readFileSync(path.join(reel, 'approvals.md'), 'utf8'), /- Licensed assets: none used/);
  // the brand folder's hook refuses too (the hook needs the engine installed as ~/.claude/skills/bagelunit-reels; a temp HOME gets a link to this one)
  const engine = path.join(home, '.claude', 'skills', 'bagelunit-reels');
  fs.mkdirSync(path.dirname(engine), { recursive: true });
  fs.symlinkSync(path.join(REPO, 'studio'), engine, 'dir');
  W(path.join(brand, 'scripts', 'qa', 'gate_hook.py'), fs.readFileSync(path.join(REPO, 'template', 'scripts', 'qa', 'gate_hook.py'), 'utf8'));
  setReel({ music: [{ asset: 'ghost' }] });
  const hook = run(PY, [path.join(brand, 'scripts', 'qa', 'gate_hook.py')], { input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'node kit.mjs gate r1 record --gate C' } }) });
  assert.equal(hook.status, 2, out(hook)); assert.match(out(hook), /licensed asset this reel uses is not in order/);
  ok('Gate C refuses a failing licensed check (no override), writes each asset\'s credit into approvals.md, says "none used" otherwise, and the QA hook blocks it too');
}

/* ── 7. the brand folder, sync and scan ──────────────────────────────────────────────────────────────────────────── */
{
  const tpl = path.join(REPO, 'template');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(tpl, 'brand', 'licensed', 'assets.json'), 'utf8')), { assets: [] });
  for (const t of ['music', 'sfx', 'stock-video', 'motion-graphic', 'lut']) assert.ok(fs.existsSync(path.join(tpl, 'brand', 'licensed', t, '.gitkeep')), `${t}/.gitkeep ships`);
  assert.ok(fs.existsSync(path.join(tpl, 'brand', 'licensed', 'README.md')));
  const ignored = (p) => spawnSync('git', ['check-ignore', '-q', '--no-index', p], { cwd: REPO }).status === 0;
  if (spawnSync('git', ['--version']).status !== 0) console.log('SKIPPED: git is not installed, so the .gitignore check did not run');
  else {
    for (const f of ['music/x.wav', 'music/x.mp3', 'lut/x.cube', 'stock-video/x.mp4', 'motion-graphic/x.mov', 'motion-graphic/x.png', 'sfx/x.wav']) assert.ok(ignored(`template/brand/licensed/${f}`), `${f} is ignored`);
    for (const f of ['assets.json', 'README.md', 'music/.gitkeep', 'lut/.gitkeep']) assert.ok(!ignored(`template/brand/licensed/${f}`), `${f} stays tracked`);
  }
  // sync: a brand with its own registry and media is not touched; its README and folders are added; a missing assets.json is created
  const made = run('node', [path.join(REPO, 'setup', 'new-brand.mjs'), path.join(tmp, 'syncbrand')]);
  assert.equal(made.status, 0, out(made));
  const sb = path.join(tmp, 'syncbrand-reels');
  const mine = JSON.stringify({ assets: [{ id: 'mine', type: 'music', file: 'brand/licensed/music/mine.wav' }] });
  W(path.join(sb, 'brand', 'licensed', 'assets.json'), mine);
  W(path.join(sb, 'brand', 'licensed', 'music', 'mine.wav'), 'my media');
  fs.rmSync(path.join(sb, 'brand', 'licensed', 'README.md'));
  fs.rmSync(path.join(sb, 'brand', 'licensed', 'lut'), { recursive: true });
  let s = run('node', [path.join(REPO, 'setup', 'sync-template.mjs'), sb, '--apply']);
  assert.equal(s.status, 0, out(s));
  assert.equal(fs.readFileSync(path.join(sb, 'brand', 'licensed', 'assets.json'), 'utf8'), mine, 'assets.json untouched');
  assert.equal(fs.readFileSync(path.join(sb, 'brand', 'licensed', 'music', 'mine.wav'), 'utf8'), 'my media', 'media untouched');
  assert.ok(fs.existsSync(path.join(sb, 'brand', 'licensed', 'README.md')) && fs.existsSync(path.join(sb, 'brand', 'licensed', 'lut', '.gitkeep')), 'README and empty folders restored');
  assert.equal(fs.readdirSync(path.join(sb, 'brand', 'licensed')).filter((f) => f.includes('.bak')).length, 0);
  fs.rmSync(path.join(sb, 'brand', 'licensed', 'assets.json'));
  s = run('node', [path.join(REPO, 'setup', 'sync-template.mjs'), sb, '--apply']);
  assert.equal(s.status, 0, out(s));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(sb, 'brand', 'licensed', 'assets.json'), 'utf8')), { assets: [] }, 'a missing assets.json is created empty');
  ok('the template ships an empty registry, README and .gitkeep folders; .gitignore keeps media out; sync never touches assets.json or media');
  // scan: a tracked asset in template/brand/licensed fails
  const bad = path.join(REPO, 'template', 'brand', 'licensed', 'leaked.cube');
  fs.writeFileSync(bad, CUBE_ID);
  try { const sc = run('node', [path.join(REPO, 'setup', 'scan-repo.mjs')]); assert.notEqual(sc.status, 0); assert.match(out(sc), /licensed asset must not be tracked/); } finally { fs.rmSync(bad, { force: true }); }
  ok('scan-repo refuses a licensed asset left in template/brand/licensed');
}

console.log(`\nlicensed-assets test: ${passed} groups passed`);
fs.rmSync(tmp, { recursive: true, force: true });
