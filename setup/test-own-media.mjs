#!/usr/bin/env node
// Own media (your Blender renders and code output) in a scene-style reel, and a cover from your own image, in temp folders, no key, no network:
//   1. planOf: {"file": ...} on a clip and an overlay, exactly one of asset or file, and every refusal (absolute path, "..", bad type)
//   2. resolveOwnFile: the reel folder, then brand/library/; a missing file, a wrong extension, a link that leaves the brand folder
//   3. kit scene check reports a missing own file as a problem before rendering (when the kit has a scene style)
//   4. with ffmpeg: own clips and overlays render through the real pipeline (fill/crop, normal and screen blends, alpha .mov), a changed file redraws only
//      its scene, and an own file is never treated as licensed (no registry entry, kit licensed check ignores it, Gate C lists no credit for it)
//   5. with ffmpeg: kit cover --image (fit cover and contain, an image outside the brand folder refused, Gate C records the cover fingerprint)
// Every ffmpeg part skips cleanly (a SKIPPED line) when ffmpeg is not installed. Run in CI: node setup/test-own-media.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tools = path.join(REPO, 'studio', 'tools');
const KIT = path.join(tools, 'kit.mjs');
const PY = process.platform === 'win32' ? 'python' : 'python3';
const tmp = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'own-media-test-')));
const home = path.join(tmp, 'home');
fs.mkdirSync(path.join(home, '.config', 'bagelunit-reels'), { recursive: true });
const env = { ...process.env, HOME: home, USERPROFILE: home };
delete env.ELEVENLABS_API_KEY;
const out = (r) => `${r.stdout || ''}${r.stderr || ''}`;
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', env, ...opts });
const has = (cmd) => spawnSync(cmd, ['-version'], { encoding: 'utf8' }).status === 0;
const W = (f, body) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, body); };
let passed = 0;
const ok = (m) => { passed++; console.log('ok   ' + m); };

const brand = path.join(tmp, 'acme-reels');
W(path.join(brand, 'brand', 'brand.json'), '{"name":"Acme"}');
W(path.join(brand, 'brand', 'licensed', 'assets.json'), '{"assets":[]}\n');
const reel = path.join(brand, 'reels', 'r1');
const setReel = (o) => W(path.join(reel, 'reel.json'), JSON.stringify({ style: 'print', name: 'r1', duration: 8, ...o }));
setReel({});
const scenesLib = await import(pathToFileURL(path.join(tools, 'scenes.mjs')).href);
const lic = await import(pathToFileURL(path.join(tools, 'licensed.mjs')).href);
const scenesPath = path.join(reel, 'scenes.json');
const plan = (scenes) => { W(scenesPath, JSON.stringify({ scenes })); return scenesLib.planOf(reel, 'no-such-style'); };
const registryText = () => fs.readFileSync(path.join(brand, 'brand', 'licensed', 'assets.json'), 'utf8');

/* ── 1. planOf ────────────────────────────────────────────────────────────────────────────────────────────────── */
{
  const { scenes } = plan([{ clip: { file: 'renders/orbit.mp4', start: 1, duration: 3, mute: false }, narration: 'a' },
    { clip: { asset: 'city' }, overlay: { file: 'glow.mov', blend: 'screen', opacity: 0.5, at: 1, duration: 2 }, narration: 'b' },
    { clip: { file: 'renders\\back.mp4' }, narration: 'c' }]);
  assert.deepEqual(scenes[0].clip, { file: 'renders/orbit.mp4', start: 1, duration: 3, mute: false });
  assert.deepEqual(scenes[1].overlay, { file: 'glow.mov', blend: 'screen', opacity: 0.5, at: 1, duration: 2 });
  assert.equal(scenes[2].clip.file, 'renders/back.mp4', 'backslashes are normalised');
  for (const [bad, why] of [
    [{ clip: { asset: 'c', file: 'x.mp4' }, narration: 'x' }, /exactly one of "asset".*"file".*not both/],
    [{ clip: { start: 1 }, narration: 'x' }, /clip" needs either \{"asset".*\{"file"/],
    [{ clip: { file: '/etc/movie.mp4' }, narration: 'x' }, /absolute path/],
    [{ clip: { file: 'C:\\renders\\a.mp4' }, narration: 'x' }, /absolute path/],
    [{ clip: { file: '../outside.mp4' }, narration: 'x' }, /"\.\." step/],
    [{ clip: { file: 'a/../../b.mp4' }, narration: 'x' }, /"\.\." step/],
    [{ clip: { file: 5 }, narration: 'x' }, /clip\.file must be a path/],
    [{ clip: { asset: 'c' }, overlay: { asset: 'o', file: 'o.png' }, narration: 'x' }, /overlay" takes exactly one/],
    [{ clip: { asset: 'c' }, overlay: { file: '..\\o.png' }, narration: 'x' }, /"\.\." step/],
    [{ clip: { file: 'a.mp4', duration: 0 }, narration: 'x' }, /clip\.duration/]]) assert.throws(() => plan([bad]), why);
}
ok('planOf reads {"file"} on a clip and an overlay, needs exactly one of asset or file, and refuses absolute paths, ".." and bad types');

/* ── 2. resolveOwnFile ────────────────────────────────────────────────────────────────────────────────────────── */
{
  W(path.join(brand, 'brand', 'library', 'orbit.mp4'), 'lib');
  W(path.join(reel, 'renders', 'orbit.mp4'), 'reel');
  W(path.join(reel, 'notes.txt'), 'x');
  const ro = (p, o = {}) => lic.resolveOwnFile(brand, reel, p, { where: 'scene 1 clip', exts: lic.OWN_VIDEO, ...o });
  assert.equal(fs.readFileSync(ro('renders/orbit.mp4'), 'utf8'), 'reel', 'the reel folder first');
  assert.equal(fs.readFileSync(ro('orbit.mp4'), 'utf8'), 'lib', 'then brand/library/');
  assert.throws(() => ro('nothing.mp4'), /does not exist/);
  assert.throws(() => ro('notes.txt'), /needs here|is needed here/);
  assert.throws(() => ro('../x.mp4'), /"\.\." step/);
  assert.throws(() => ro(path.join(tmp, 'x.mp4')), /absolute path/);
  // a link that leaves the brand folder is refused (symlinks need rights on Windows: skip that part if they cannot be made)
  W(path.join(tmp, 'elsewhere', 'secret.mp4'), 'secret');
  let linked = true;
  try { fs.symlinkSync(path.join(tmp, 'elsewhere', 'secret.mp4'), path.join(reel, 'renders', 'link.mp4')); } catch { linked = false; console.log('SKIPPED: this system cannot make symlinks, so the escaping-link check did not run'); }
  if (linked) assert.throws(() => ro('renders/link.mp4'), /outside the brand folder/);
  if (linked) {
    fs.symlinkSync(path.join(tmp, 'elsewhere'), path.join(reel, 'dirlink'), process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => ro('dirlink/secret.mp4'), /outside the brand folder/);
  }
  assert.deepEqual(scenesLib.ownFileProblems(reel, plan([{ clip: { file: 'orbit.mp4' }, narration: 'a' }, { clip: { file: 'gone.mp4' }, overlay: { file: 'nope.png' }, narration: 'b' }]).scenes).length, 2);
}
ok('own files: the reel folder first, then brand/library/; missing, wrong type, ".." and links that leave the brand folder are refused');

/* ── 3. kit scene check reports a missing file before rendering ───────────────────────────────────────────────── */
{
  const style = scenesLib.sceneStyleIds()[0];
  if (!style) console.log('SKIPPED: the kit has no scene style installed, so kit scene check was not run');
  else {
    setReel({ style });
    plan([{ clip: { file: 'renders/not-made-yet.mp4' }, narration: 'a cutaway' }]);
    const r = run('node', [KIT, 'scene', reel, 'check'], { cwd: brand });
    assert.notEqual(r.status, 0, out(r));
    assert.match(out(r), /PROBLEMS \(1\)/); assert.match(out(r), /your file "renders\/not-made-yet\.mp4" does not exist/);
    assert.doesNotMatch(out(r), /Error|at async/, 'a plain report, not a stack trace');
    setReel({});
  }
}
ok('kit scene check names a missing own file as a problem before anything renders');

/* ── 4. real ffmpeg: render, cache, never licensed ────────────────────────────────────────────────────────────── */
if (!has('ffmpeg') || !has('ffprobe')) console.log('SKIPPED: ffmpeg or ffprobe is not installed, so the own-media render and cover checks did not run');
else {
  const ff = (...args) => { const x = run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]); assert.equal(x.status, 0, out(x)); };
  const pixel = (file, t, x = 540, y = 960) => {
    const q = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-ss', String(t), '-i', file, '-frames:v', '1', '-vf', `crop=1:1:${x}:${y},format=rgb24`, '-f', 'rawvideo', '-'], { encoding: 'buffer' });
    assert.equal(q.status, 0); return [...q.stdout];
  };
  const near = (p, want, tol = 30) => p.every((v, i) => Math.abs(v - want[i]) <= tol);
  const probe = (file, entry) => run('ffprobe', ['-v', 'error', '-show_entries', entry, '-of', 'csv=p=0', file]).stdout.trim();
  const lib = path.join(brand, 'brand', 'library');
  ff('-f', 'lavfi', '-i', 'color=c=0x0000ff:s=640x360:r=30:d=2', '-f', 'lavfi', '-i', 'sine=frequency=300:d=2', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', path.join(lib, 'orbit.mp4'));
  ff('-f', 'lavfi', '-i', 'color=c=white:s=320x180:r=30:d=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(reel, 'renders', 'glow.mp4'));
  ff('-f', 'lavfi', '-i', 'color=c=red:s=64x64', '-frames:v', '1', path.join(reel, 'renders', 'red.png'));
  ff('-f', 'lavfi', '-i', 'color=c=green@0.0:s=320x180:r=30:d=1,format=rgba', '-c:v', 'qtrle', path.join(reel, 'renders', 'clear.mov'));
  const sceneList = (o3 = 1) => [
    { clip: { file: 'orbit.mp4', start: 0.2, duration: 1 }, narration: 'one' },
    { clip: { file: 'orbit.mp4' }, overlay: { file: 'renders/glow.mp4', blend: 'screen', opacity: 1, at: 0 }, narration: 'two' },
    { clip: { file: 'orbit.mp4', mute: false }, overlay: { file: 'renders/red.png', blend: 'normal', opacity: o3, at: 0 }, narration: 'three' },
    { clip: { file: 'orbit.mp4' }, overlay: { file: 'renders/clear.mov', blend: 'normal' }, narration: 'four' }];
  setReel({});
  W(scenesPath, JSON.stringify({ scenes: sceneList() }));
  fs.mkdirSync(path.join(reel, 'build'), { recursive: true });
  const rcfg = { dir: reel, cfg: JSON.parse(fs.readFileSync(path.join(reel, 'reel.json'), 'utf8')) };
  const render = async () => { const lines = []; const orig = console.log; console.log = (...x) => lines.push(x.join(' ')); try { await scenesLib.renderScenes(rcfg, {}); } finally { console.log = orig; } return lines.join('\n'); };
  let log = await render();
  assert.match(log, /4 scenes: 4 rendered, 0 reused/, log);
  const video = path.join(reel, 'build', 'video.mp4');
  assert.equal(probe(video, 'stream=width,height').replace(/\r?\n/g, ','), '1080,1920');
  assert.ok(Math.abs(Number(probe(video, 'format=duration')) - 8) < 0.25, `duration ${probe(video, 'format=duration')}`);
  assert.ok(near(pixel(video, 1), [0, 0, 255]) && near(pixel(video, 1, 5, 5), [0, 0, 255]) && near(pixel(video, 1, 1070, 1910), [0, 0, 255]), 'own 16:9 clip fills and is cropped to 1080x1920');
  assert.ok(near(pixel(video, 3), [255, 255, 255]), `screen overlay of an own white clip (${pixel(video, 3)})`);
  assert.ok(near(pixel(video, 5), [255, 0, 0]), `opaque own PNG overlay (${pixel(video, 5)})`);
  assert.ok(near(pixel(video, 7), [0, 0, 255]), `transparent own .mov overlay keeps the clip (${pixel(video, 7)})`);
  const mans = [1, 2, 3, 4].map((n) => JSON.parse(fs.readFileSync(path.join(reel, 'build', 'scenes', `00${n}.json`), 'utf8')));
  assert.match(mans[0].clip, /^file orbit\.mp4$/);
  assert.equal(fs.readFileSync(path.join(reel, 'build', 'on_screen_text.txt'), 'utf8').trim(), '', 'an overlay is never on-screen text');
  const codec = (n) => run('ffprobe', ['-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=codec_name,profile,pix_fmt,r_frame_rate,time_base', '-of', 'csv=p=0', path.join(reel, 'build', 'scenes', `00${n}.mp4`)]).stdout.trim();
  assert.equal(codec(1), codec(4), 'same codec settings for every scene');
  ok('own clips and overlays render: filled and cropped to 1080x1920, screen and normal blends, alpha .mov kept, no text, same codec');

  log = await render();
  assert.match(log, /4 scenes: 0 rendered, 4 reused/, 'nothing changed: all reused');
  W(scenesPath, JSON.stringify({ scenes: sceneList(0) }));
  assert.match(await render(), /4 scenes: 1 rendered, 3 reused/, 'a changed setting redraws one scene');
  // a changed FILE: the same bytes length-wise different content in the red overlay (a green PNG) redraws only scene 3
  ff('-f', 'lavfi', '-i', 'color=c=green:s=64x64', '-frames:v', '1', path.join(reel, 'renders', 'red.png'));
  W(scenesPath, JSON.stringify({ scenes: sceneList(1) }));
  assert.match(await render(), /4 scenes: 1 rendered, 3 reused/, 'a changed own file redraws only its scene');
  assert.ok(near(pixel(video, 5), [0, 128, 0], 40), `scene 3 now shows the new file (${pixel(video, 5)})`);
  // the reel folder wins over brand/library/, so a new render next to the reel replaces the library copy for that reel
  ff('-f', 'lavfi', '-i', 'color=c=yellow:s=640x360:r=30:d=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(reel, 'orbit.mp4'));
  assert.match(await render(), /4 scenes: 4 rendered, 0 reused/, 'orbit.mp4 in the reel folder replaces the library file in all four scenes');
  assert.ok(near(pixel(video, 1), [255, 255, 0], 40), `scene 1 is the yellow reel-folder clip (${pixel(video, 1)})`);
  fs.rmSync(path.join(reel, 'orbit.mp4'));
  ok('a changed own file (or a reel-folder copy over the library one) redraws only the scenes that use it');

  // never licensed
  assert.equal(registryText(), '{"assets":[]}\n', 'nothing was recorded');
  let r = run('node', [KIT, 'licensed', 'check', reel], { cwd: brand });
  assert.equal(r.status, 0, out(r)); assert.match(out(r), /this reel uses no licensed assets/);
  const skips = ['--skip-order', 't', '--skip-facts', 't', '--skip-qa', 't', '--skip-review', 't'];
  W(path.join(reel, 'out', 'r1.mp4'), 'a pretend final video');
  W(path.join(reel, 'approvals.md'), '# Approvals\n');
  r = run(PY, [path.join(tools, 'gate.py'), reel, 'record', '--gate', 'C', ...skips]);
  assert.equal(r.status, 0, out(r));
  const text = fs.readFileSync(path.join(reel, 'approvals.md'), 'utf8');
  assert.match(text, /- Licensed assets: none used/); assert.doesNotMatch(text, /orbit|glow|red\.png/, 'own files are not in the credits');
  ok('own files are never licensed: no registry entry, kit licensed check ignores them, Gate C lists no credit for them');

  /* ── 5. kit cover --image ───────────────────────────────────────────────────────────────────────────────────── */
  ff('-f', 'lavfi', '-i', 'color=c=0x0000ff:s=1600x800', '-frames:v', '1', path.join(lib, 'still.png'));
  const cover = path.join(reel, 'out', 'cover.jpg'), crops = path.join(reel, 'build', 'cover-crops.jpg');
  r = run('node', [KIT, 'cover', reel, '--image', 'brand/library/still.png'], { cwd: brand });
  assert.equal(r.status, 0, out(r)); assert.match(out(r), /cover: out\/cover\.jpg \(1080x1920/); assert.match(out(r), /from the image brand\/library\/still\.png, fit cover/);
  assert.equal(probe(cover, 'stream=width,height').replace(/\r?\n/g, ','), '1080,1920');
  assert.equal(probe(cover, 'stream=codec_name'), 'mjpeg');
  assert.ok(near(pixel(cover, 0, 5, 5), [0, 0, 255], 40) && near(pixel(cover, 0, 540, 960), [0, 0, 255], 40) && near(pixel(cover, 0, 1070, 1910), [0, 0, 255], 40), 'fit cover fills the whole 1080x1920 page');
  assert.ok(fs.existsSync(crops) && probe(crops, 'stream=width,height').replace(/\r?\n/g, ',') === '540,960', 'build/cover-crops.jpg is written');
  assert.ok(fs.statSync(cover).size < 8 * 1024 * 1024);
  r = run('node', [KIT, 'cover', reel, '--image', path.join(lib, 'still.png'), '--fit', 'contain'], { cwd: brand });
  assert.equal(r.status, 0, out(r)); assert.match(out(r), /fit contain/);
  assert.ok(near(pixel(cover, 0, 540, 10), [255, 255, 255], 40), 'contain keeps the whole picture on a white page (bar at the top)');
  assert.ok(near(pixel(cover, 0, 540, 960), [0, 0, 255], 40), 'contain: the picture is in the middle');
  // refused: outside the brand folder, a missing file, a wrong type, a bad --fit
  const outside = path.join(tmp, 'elsewhere', 'photo.png');
  ff('-f', 'lavfi', '-i', 'color=c=red:s=100x100', '-frames:v', '1', outside);
  const bad = (args, why) => { const x = run('node', [KIT, 'cover', reel, ...args], { cwd: brand }); assert.notEqual(x.status, 0, out(x)); assert.match(out(x), why); };
  bad(['--image', outside], /outside the brand folder/);
  bad(['--image', '../../../elsewhere/photo.png'], /"\.\." step/);
  bad(['--image', 'brand/library/missing.png'], /does not exist/);
  bad(['--image', 'brand/brand.json'], /needed here/);
  bad(['--image', 'brand/library/still.png', '--fit', 'stretch'], /--fit must be cover or contain/);
  bad(['--image'], /--image needs a file/);
  // reel.json "cover": {"image": ...} works too, and Gate C records the fingerprint of out/cover.jpg
  setReel({ cover: { image: 'brand/library/still.png' } });
  r = run('node', [KIT, 'cover', reel], { cwd: brand });
  assert.equal(r.status, 0, out(r)); assert.match(out(r), /from the image/);
  W(path.join(reel, 'approvals.md'), '# Approvals\n');
  r = run(PY, [path.join(tools, 'gate.py'), reel, 'record', '--gate', 'C', ...skips]);
  assert.equal(r.status, 0, out(r));
  assert.match(fs.readFileSync(path.join(reel, 'approvals.md'), 'utf8'), /- Cover: cover\.jpg \| sha256: [0-9a-f]{12}/);
  ok('kit cover --image: fills 1080x1920 (cover) or keeps it whole on white (contain), writes cover-crops.jpg, refuses an image outside the brand folder, and Gate C records the cover fingerprint');
}

console.log(`\nown-media test: ${passed} groups passed`);
fs.rmSync(tmp, { recursive: true, force: true });
