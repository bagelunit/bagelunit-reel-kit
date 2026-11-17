#!/usr/bin/env node
// Checks the engine's gates and the fixes from the engine audit (2026-11-17), all in temp folders, no keys, no network:
//   1. gate order: Gate B needs Gate A, Gate C needs A and B; --skip-order "reason" is recorded
//   2. Gate C needs kit qa PASS for the very file approved (build/qa.json "sha256"); --skip-qa "reason" is recorded
//   3. Gate C needs a Review line that ends with [video <12 hex>] of the newest out/*.mp4; gate.py <reel> hash and kit gate <reel> hash
//   4. kit start writes the brand folder's handle, theme, accent, voice and host into reel.json (the global config is the fallback)
//   5. calibrate/predict keep the model per brand (brand/predict-model.json)
//   6. realsound: every cue name mapped or reported, no build/sfx.json is no cues, the final keeps the name out/<slug>.mp4
//   7. kit budget; the final fact check of a talking reel reads the words said on camera (build/words.json)
//   8. kit qa writes the file's sha256 and does not count the end hold as a frozen stretch (needs ffmpeg)
// Run in CI: node setup/test-gates.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const kit = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tools = path.join(kit, 'studio', 'tools');
const KIT = path.join(tools, 'kit.mjs');
const PY = process.platform === 'win32' ? 'python' : 'python3';
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gates-test-')));
const home = path.join(tmp, 'home');
fs.mkdirSync(path.join(home, '.config', 'bagelunit-reels'), { recursive: true });
const env = { ...process.env, HOME: home, USERPROFILE: home };
delete env.ELEVENLABS_API_KEY;
const out = (r) => `${r.stdout || ''}${r.stderr || ''}`;
const py = (args, opts = {}) => spawnSync(PY, args, { encoding: 'utf8', env, ...opts });
const node = (args, opts = {}) => spawnSync('node', args, { encoding: 'utf8', env, ...opts });
const has = (cmd) => spawnSync(cmd, ['-version'], { encoding: 'utf8' }).status === 0;
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const W = (f, body) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, body); };

/* ── 1 to 3: the gates, on a reel outside any brand folder (the engine on its own is a gate user too) ───────────────── */
const reel = path.join(tmp, 'loose', 'r');
W(path.join(reel, 'reel.json'), '{"style":"print","name":"r"}');
W(path.join(reel, 'out', 'r.mp4'), 'not a real video, version 1');
const approvals = path.join(reel, 'approvals.md');
W(approvals, '# Approvals\n');
const gate = (...a) => py([path.join(tools, 'gate.py'), reel, ...a]);
const rec = (g, ...a) => gate('record', '--gate', g, ...a);
const text = () => fs.readFileSync(approvals, 'utf8');

let r = rec('B');
assert.notEqual(r.status, 0, 'Gate B without Gate A is refused');
assert.match(out(r), /Gate A \(script\) is not recorded/);
r = rec('C', '--skip-facts', 'test');
assert.notEqual(r.status, 0);
assert.match(out(r), /Gate A \(script\) and Gate B \(visual plan\) are not recorded/);
r = rec('B', '--skip-order');
assert.notEqual(r.status, 0, '--skip-order needs a reason');
r = rec('B', '--skip-order', 'owner approved the plan before the script');
assert.equal(r.status, 0, out(r));
assert.match(text(), /Gate B \(visual plan\) approved \[GATE ORDER SKIPPED: owner approved the plan before the script \(missing: Gate A\)\]/);
r = rec('A', '--skip-facts', 'test', '--skip-script-review', 'test');
assert.equal(r.status, 0, out(r));
assert.match(text(), /Gate A \(script\) approved/);
r = rec('B');
assert.equal(r.status, 0, `Gate B after Gate A: ${out(r)}`);

// hash: gate.py and kit gate print the first 12 hex of the newest out/*.mp4
const video = path.join(reel, 'out', 'r.mp4');
r = gate('hash');
assert.equal(r.status, 0, out(r));
assert.equal(r.stdout.trim(), sha(video).slice(0, 12));
const viaKit = node([KIT, 'gate', reel, 'hash']);
assert.equal(viaKit.stdout.trim(), sha(video).slice(0, 12), out(viaKit));
const h12 = r.stdout.trim();

// QA: none, FAIL, PASS for another file, PASS for this file (SKIPPED checks are fine)
const qa = (o) => W(path.join(reel, 'build', 'qa.json'), JSON.stringify({ video: 'r.mp4', file: 'out/r.mp4', ...o }));
const review = (line) => fs.appendFileSync(approvals, `\n- ${line}\n`);
review(`Review: meets the bar (92/100; weakest: ending) [video ${h12}]`);
r = rec('C', '--skip-facts', 'test');
assert.notEqual(r.status, 0); assert.match(out(r), /kit qa has not been run on it/);
qa({ result: 'FAIL', sha256: sha(video), checks: [{ check: 'loudness', status: 'FAIL' }] });
r = rec('C', '--skip-facts', 'test');
assert.notEqual(r.status, 0); assert.match(out(r), /kit qa says FAIL \(failed: loudness\)/);
qa({ result: 'PASS', sha256: 'a'.repeat(64), checks: [{ check: 'spec', status: 'PASS' }] });
r = rec('C', '--skip-facts', 'test');
assert.notEqual(r.status, 0); assert.match(out(r), /kit qa checked an earlier version of out\/r\.mp4/);
qa({ result: 'PASS', checks: [] });
r = rec('C', '--skip-facts', 'test');
assert.notEqual(r.status, 0); assert.match(out(r), /no fingerprint of the file it checked/);
qa({ result: 'PASS', sha256: sha(video), checks: [{ check: 'spec', status: 'PASS' }, { check: 'text', status: 'SKIPPED' }] });
r = rec('C', '--skip-facts', 'test');
assert.equal(r.status, 0, `QA PASS for this file, review of this file: ${out(r)}`);
assert.match(text(), new RegExp(`- File: r\\.mp4 \\| sha256: ${h12}`));
assert.match(text(), /- QA: PASS \(out\/r\.mp4; skipped: text\)/);
assert.equal(gate('check').status, 0, 'check after a good record');

// a rebuild: the old review and the old QA no longer count
W(video, 'not a real video, version 2');
const h12b = gate('hash').stdout.trim();
assert.notEqual(h12b, h12);
r = rec('C', '--skip-facts', 'test');
assert.notEqual(r.status, 0);
assert.match(out(r), /kit qa checked an earlier version of out\/r\.mp4/);
assert.match(out(r), new RegExp(`the latest review was of another file \\(\\[video ${h12}\\]; the newest out/ file is ${h12b}\\)\\. Run /reel-review again on this file`));
review('Review: meets the bar (94/100; weakest: ending)');                      // no fingerprint at all
qa({ result: 'PASS', sha256: sha(video), checks: [] });
r = rec('C', '--skip-facts', 'test');
assert.notEqual(r.status, 0);
assert.match(out(r), /has no \[video <hash>\]\. Run \/reel-review again on this file/);
r = rec('C', '--skip-facts', 'test', '--skip-review', 'owner watched it on the phone');
assert.equal(r.status, 0, out(r));
assert.match(text(), /REVIEW BELOW THE BAR: owner watched it on the phone/);
// --skip-qa is the owner's override, written into the record
W(path.join(reel, 'build', 'qa.json'), JSON.stringify({ result: 'FAIL', checks: [{ check: 'sync', status: 'FAIL' }] }));
review(`Review: meets the bar (93/100; weakest: ending) [video ${h12b}]`);
r = rec('C', '--skip-facts', 'test', '--skip-qa');
assert.notEqual(r.status, 0, '--skip-qa needs a reason');
r = rec('C', '--skip-facts', 'test', '--skip-qa', 'sync is off by a breath on purpose');
assert.equal(r.status, 0, out(r));
assert.match(text(), /QA NOT PASSED: sync is off by a breath on purpose \(kit qa says FAIL \(failed: sync\)\)/);
console.log('gates: order, qa, review fingerprint, hash: ok');

/* ── 4: kit start takes the brand's own settings ─────────────────────────────────────────────────────────────────────── */
const made = node([path.join(kit, 'setup', 'new-brand.mjs'), path.join(tmp, 'acme')]);
assert.equal(made.status, 0, out(made));
const brand = path.join(tmp, 'acme-reels');
const bj = path.join(brand, 'brand', 'brand.json');
const b = JSON.parse(fs.readFileSync(bj, 'utf8'));
Object.assign(b, { name: 'Acme', slug: 'acme', handle: '@acme' });
b.colors = { ...b.colors, theme: 'harbor', accent: '#FF5500' };
b.voice = { ...b.voice, voice_id: 'brandvoice123', voice_name: 'Brand Voice', style: 'warm and quick' };
b.host = { ...b.host, enabled: false, type: 'none' };
W(bj, JSON.stringify(b, null, 2));
// the computer-wide file belongs to another brand: it must not win
W(path.join(home, '.config', 'bagelunit-reels', 'config.json'), JSON.stringify({ theme: 'ink', brand: { handle: '@otherbrand' }, voice: { voice_id: 'globalvoice' } }));
r = node([KIT, 'start', path.join(brand, 'reels', 'one'), '--style', 'print']);
assert.equal(r.status, 0, out(r));
let rj = JSON.parse(fs.readFileSync(path.join(brand, 'reels', 'one', 'reel.json'), 'utf8'));
assert.equal(rj.brand.handle, '@acme');
assert.deepEqual({ preset: rj.theme.preset, accent: rj.theme.accent }, { preset: 'harbor', accent: '#FF5500' });
assert.equal(rj.voice.voice_id, 'brandvoice123');
assert.equal(rj.voice.voice_name, 'Brand Voice');
assert.equal(rj.voice.description, 'warm and quick');
assert.ok(!('style' in rj.voice), 'the owner\'s words for the voice are never sent as ElevenLabs\' style number');
assert.equal(rj.presenter, false, 'host.type none turns the presenter off');
r = py(['-c', 'import sys; sys.path.insert(0, sys.argv[1]); import kitcore; o = kitcore.voice_settings(sys.argv[2]); print(o["voice_id"], o["style"])', tools, path.join(brand, 'reels', 'one')]);
assert.equal(r.stdout.trim(), 'brandvoice123 0.2', `the reel's own voice wins over the global file: ${out(r)}`);
// a sticker host is linked at the start
W(path.join(brand, 'brand', 'host', 'poses', 'idle.png'), 'png');
W(path.join(brand, 'brand', 'host', 'poses', 'point.png'), 'png');
b.host = { enabled: true, type: 'stickers', poses_dir: 'brand/host/poses', logo_text: '', notes: '' };
W(bj, JSON.stringify(b, null, 2));
r = node([KIT, 'start', path.join(brand, 'reels', 'two'), '--style', 'print']);
assert.equal(r.status, 0, out(r));
assert.match(out(r), /sticker host is linked \(2 poses\)/);
rj = JSON.parse(fs.readFileSync(path.join(brand, 'reels', 'two', 'reel.json'), 'utf8'));
assert.equal(rj.presenter.type, 'stickers'); assert.deepEqual(rj.presenter.poses, ['idle', 'point']);
assert.ok(fs.existsSync(path.join(brand, 'reels', 'two', 'host', 'idle.png')));
// an empty brand.json field leaves the global file as the fallback
b.handle = ''; b.colors = { ...b.colors, theme: '', accent: '' }; b.voice = { ...b.voice, voice_id: '', voice_name: '', style: '' };
W(bj, JSON.stringify(b, null, 2));
r = node([KIT, 'start', path.join(brand, 'reels', 'three'), '--style', 'talking']);
assert.equal(r.status, 0, out(r));
rj = JSON.parse(fs.readFileSync(path.join(brand, 'reels', 'three', 'reel.json'), 'utf8'));
assert.equal(rj.brand?.handle, '@otherbrand'); assert.equal(rj.theme, 'ink'); assert.equal(rj.voice, undefined);
console.log('kit start: brand settings first, global fallback: ok');

/* ── 5: the watch-time model belongs to the brand ────────────────────────────────────────────────────────────────────── */
const pick = (place) => py(['-c', 'import sys; sys.path.insert(0, sys.argv[1]); import calibrate; print(calibrate.model_file(sys.argv[2]))', tools, place]);
const hasNumpy = py(['-c', 'import numpy']).status === 0;
if (hasNumpy) {
  assert.equal(fs.realpathSync.native(path.dirname(pick(path.join(brand, 'reels')).stdout.trim())), fs.realpathSync.native(path.join(brand, 'brand')));   // .native: Windows temp folders have an 8.3 short name (RUNNER~1) and a long one
  assert.equal(path.basename(pick(path.join(brand, 'reels')).stdout.trim()), 'predict-model.json');
  assert.match(pick(path.join(tmp, 'loose')).stdout.trim(), /bagelunit-reels[\\/]predict-model\.json$/);
  console.log('calibrate: model per brand: ok');
} else console.log('calibrate: skipped (no numpy)');

/* ── 6: real sound ──────────────────────────────────────────────────────────────────────────────────────────────────── */
const rsPy = (code, ...a) => py(['-c', `import sys; sys.path.insert(0, sys.argv[1]); sys.argv = sys.argv[1:]; import realsound as R\n${code}`, tools, ...a]);
r = rsPy('p, s = R.map_cues([{"t": 1, "name": "impact"}, {"t": 2, "name": "slam_big"}, {"t": 3, "name": "zzz"}, {"t": 4, "name": "whoosh"}])\nprint([c["name"] for c in p], s)');
assert.equal(r.status, 0, out(r));
assert.equal(r.stdout.trim(), "['impact', 'stamp', 'whoosh'] ['zzz']", 'impact is mapped, slam by keyword, an unknown name is reported');
const rr = path.join(tmp, 'loose', 'snd');
fs.mkdirSync(rr, { recursive: true });                                  // a relative --out is looked up in the reel folder
r = rsPy('import os\nreel = sys.argv[1]\nfor v, o in ((os.path.join(reel, "out", "snd.mp4"), None), (os.path.join(reel, "build", "pre-real", "snd-kitsound.mp4"), None), (os.path.join(reel, "build", "draft.mp4"), None), (os.path.join(reel, "out", "snd.mp4"), "mine.mp4")):\n    f, k = R.plan_output(reel, v, o)\n    print(os.path.relpath(f, reel), k and os.path.relpath(k, reel))', rr);
assert.equal(r.status, 0, out(r));
assert.deepEqual(r.stdout.trim().split('\n').map((l) => l.replace(/\\/g, '/')), [
  'out/snd.mp4 build/pre-real/snd-kitsound.mp4', 'out/snd.mp4 None', 'build/draft-real.mp4 None', 'mine.mp4 None']);
const earshot = path.join(os.homedir(), 'dev', 'sound', 'earshot', '.venv', process.platform === 'win32' ? 'Scripts' : 'bin', process.platform === 'win32' ? 'python.exe' : 'python');
const opus = path.join(os.homedir(), 'dev', 'sound', 'opus-sound-layer', 'audio', 'kit', 'catalog.json');
const ffmpegOK = has('ffmpeg');
if (fs.existsSync(earshot) && fs.existsSync(opus) && ffmpegOK && spawnSync('uv', ['--version']).status === 0) {
  W(path.join(rr, 'reel.json'), '{"style":"print","name":"snd"}');
  fs.mkdirSync(path.join(rr, 'out'), { recursive: true }); fs.mkdirSync(path.join(rr, 'audio'), { recursive: true });
  const mk = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=360x640:rate=30:duration=2', '-f', 'lavfi', '-i', 'sine=frequency=300:duration=2',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path.join(rr, 'out', 'snd.mp4')]);
  assert.equal(mk.status, 0, String(mk.stderr));
  spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=200:duration=2', path.join(rr, 'audio', 'vo.mp3')]);
  const original = sha(path.join(rr, 'out', 'snd.mp4'));
  const real = (...a) => spawnSync(earshot, [path.join(tools, 'realsound.py'), rr, '--no-listen', ...a], { encoding: 'utf8', env: { ...process.env } });
  r = real();                                                            // no build/sfx.json: no cues, no crash
  assert.equal(r.status, 0, out(r));
  assert.match(out(r), /no build\/sfx\.json: no sound cues/);
  assert.match(out(r), /final: out[\\/]snd\.mp4; the kit-sound original is now build[\\/]pre-real[\\/]snd-kitsound\.mp4/);
  assert.ok(!fs.existsSync(path.join(rr, 'out', 'snd-real.mp4')), 'no -real file in out/');
  assert.equal(sha(path.join(rr, 'build', 'pre-real', 'snd-kitsound.mp4')), original, 'the original is kept untouched');
  assert.deepEqual(fs.readdirSync(path.join(rr, 'out')).sort(), ['snd.mp4']);
  W(path.join(rr, 'build', 'sfx.json'), JSON.stringify([{ t: 0.5, name: 'impact' }, { t: 1.2, name: 'mystery' }]));
  r = real();                                                            // a redo: mixes the kept original again, never the mixed file
  assert.equal(r.status, 0, out(r));
  assert.match(out(r), /video: .*pre-real[\\/]snd-kitsound\.mp4/);
  assert.match(out(r), /skipped 1 cue\(s\) with a name this step does not know: mystery/);
  assert.equal(sha(path.join(rr, 'build', 'pre-real', 'snd-kitsound.mp4')), original);
  assert.deepEqual(fs.readdirSync(path.join(rr, 'out')).sort(), ['snd.mp4']);
  console.log('realsound: names, no cues file, final keeps its name: ok');
} else console.log('realsound: mapping and naming ok; full run skipped (needs ffmpeg, uv, the earshot venv and the opus-sound-layer library)');

/* ── 7: kit budget, and the spoken words of a talking reel ───────────────────────────────────────────────────────────── */
W(path.join(rr, 'reel.json'), '{"style":"print","name":"snd"}');
W(path.join(rr, 'script.txt'), 'Three steps to a better hook.\nSave this for later.\n');
r = node([KIT, 'budget', rr]);
assert.match(out(r), /script: \d+ characters/, out(r));
const talk = path.join(tmp, 'tb', 'reels', 'talk');
W(path.join(tmp, 'tb', 'brand', 'facts.md'), '# Facts\n\n| Claim | Source | Cleared | Notes |\n|---|---|---|---|\n| We answer in a day | site | 2026-11-17 | |\n');
W(path.join(talk, 'reel.json'), '{"style":"talking","name":"talk"}');
W(path.join(talk, 'script.txt'), 'We answer in a day.\n');
const facts = (...a) => py([path.join(tools, 'facts.py'), talk, ...a]);
r = facts('check', '--scope', 'final');
assert.equal(r.status, 0, out(r));
W(path.join(talk, 'build', 'words.json'), JSON.stringify([{ w: 'We', s: 0, e: 0.2 }, { w: 'answer', s: 0.2, e: 0.5 }, { w: 'in', s: 0.5, e: 0.6 }, { w: '37', s: 0.6, e: 0.9 }, { w: 'minutes.', s: 0.9, e: 1.2 }]));
r = facts('check', '--scope', 'final');
assert.notEqual(r.status, 0, 'a number said on camera that is not in facts.md is an error');
assert.match(fs.readFileSync(path.join(talk, 'build', 'factcheck.md'), 'utf8') + out(r), /words\.json[^\n]*37/);
r = facts('check', '--scope', 'script');
assert.equal(r.status, 0, 'the script scope is unchanged');
console.log('kit budget and the talking reel\'s spoken words: ok');

/* ── 8: kit qa: the file's fingerprint, and the end hold ─────────────────────────────────────────────────────────────── */
if (ffmpegOK && hasNumpy) {
  const q = path.join(tmp, 'loose', 'hold');
  W(path.join(q, 'reel.json'), '{"style":"depth","name":"hold","tail":1.0}');
  fs.mkdirSync(path.join(q, 'out'), { recursive: true });
  // 2 s of moving picture, then a still end hold of 0.8 s
  const mk = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=1080x1920:rate=30:duration=2', '-f', 'lavfi', '-i', 'sine=frequency=300:duration=2.8',
    '-vf', 'tpad=stop_mode=clone:stop_duration=0.8', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', path.join(q, 'out', 'hold.mp4')]);
  assert.equal(mk.status, 0, String(mk.stderr));
  const frozen = () => JSON.parse(fs.readFileSync(path.join(q, 'build', 'qa.json'), 'utf8'));
  py([path.join(tools, 'qa.py'), q]);
  let j = frozen();
  assert.equal(j.sha256, sha(path.join(q, 'out', 'hold.mp4')), 'qa.json carries the sha256 of the file it checked');
  assert.equal(j.file, 'out/hold.mp4');
  assert.equal(j.checks.find((c) => c.check === 'frozen').status, 'PASS', 'a 0.8 s end hold inside a 1.0 s tail is not a frozen stretch');
  W(path.join(q, 'reel.json'), '{"style":"depth","name":"hold","tail":0}');
  py([path.join(tools, 'qa.py'), q]);
  assert.equal(frozen().checks.find((c) => c.check === 'frozen').status, 'FAIL', 'with no tail the same hold is reported');
  console.log('kit qa: fingerprint and end hold: ok');
} else console.log('kit qa: skipped (needs ffmpeg and numpy)');

fs.rmSync(tmp, { recursive: true, force: true });
console.log('gates and audit fixes: ok');
