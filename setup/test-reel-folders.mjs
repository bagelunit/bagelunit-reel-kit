#!/usr/bin/env node
// Checks that reel folders can be filed by date (reels/2026/11 November/November 12/<slug>) and are still found: the shared
// lookup (template publisher/scripts/reels.mjs), the engine's copy (studio/tools/folders.mjs), the Python find_reel, the
// dashboard model, schedule's reel lookup, `kit organize` (dry run, apply, back to flat), `kit start` and `kit tidy`.
// Touches nothing outside a temp folder. Run in CI: node setup/test-reel-folders.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const kit = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.join(fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'reel-folders-test-'))), 'test-reels');
fs.cpSync(path.join(kit, 'template'), root, { recursive: true });
fs.rmSync(path.join(root, 'reels', '_example'), { recursive: true, force: true });
const W = (f, v) => { fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); fs.writeFileSync(path.join(root, f), v); };
const brand = (reels) => W('brand/brand.json', JSON.stringify({ name: 'Test', slug: 'test', handle: '@test', posting: { timezone: 'UTC' }, ...(reels ? { reels } : {}) }, null, 2));
brand();
fs.writeFileSync(path.join(root, '.kit-version'), '1.17.0\n');

const T = await import(pathToFileURL(path.join(root, 'publisher', 'scripts', 'reels.mjs')).href);
const E = await import(pathToFileURL(path.join(kit, 'studio', 'tools', 'folders.mjs')).href);
const lib = await import(pathToFileURL(path.join(root, '.claude', 'skills', 'content-calendar', 'lib.mjs')).href);
const KIT = path.join(kit, 'studio', 'tools', 'kit.mjs');
const run = (...a) => spawnSync('node', [KIT, ...a], { cwd: root, encoding: 'utf8' });

// 1. names
assert.equal(T.datedFolder('2026-11-12'), '2026/11 November/November 12');
assert.equal(E.datedFolder('2026-11-02'), '2026/11 November/November 2');
assert.equal(T.datedFolder('2026-13-01'), null);
for (const v of ['reels/x', 'reels/2026/11 November/November 12/x/', '`reels/x`', 'x']) assert.equal(T.folderSlug(v), 'x'), assert.equal(E.folderSlug(v), 'x');

// 2. a flat reel, a dated reel, an empty new reel folder, the example and a hidden folder
W('reels/flat-one/script.txt', 'Flat hook.\nmore');
W('reels/2026/11 November/November 12/dated-one/script.txt', 'Dated hook.\nmore');
W('reels/2026/11 November/November 12/dated-one/approvals.md', '# Approvals\n\n## Gate C\n\n### t\n- File: dated-one.mp4 | sha256: 0123456789ab\n\n## Posting\n\n- 2026-11-12 09:00 Posted on @test: https://example.com/p/1\n');
fs.mkdirSync(path.join(root, 'reels', 'brand-new-empty'), { recursive: true });
fs.mkdirSync(path.join(root, 'reels', '_example'), { recursive: true });
fs.mkdirSync(path.join(root, 'reels', '.hidden'), { recursive: true });
const slugs = (l) => l.map((r) => r.slug).sort();
assert.deepEqual(slugs(T.listReels(root)), ['brand-new-empty', 'dated-one', 'flat-one']);
assert.deepEqual(T.listReels(root).map((r) => r.rel), E.listReels(root).map((r) => r.rel), 'template and engine lookups agree');
assert.equal(T.findReel(root, 'dated-one'), path.join(root, 'reels', '2026', '11 November', 'November 12', 'dated-one'));
assert.equal(T.findReel(root, 'reels/dated-one'), T.findReel(root, 'dated-one'));
assert.equal(E.findReel(root, 'dated-one'), T.findReel(root, 'dated-one'));
assert.equal(T.findReel(root, 'nope'), null);
assert.equal(T.findReel(root, '_example'), null);
assert.equal(T.resolveReelArg('dated-one', root), T.findReel(root, 'dated-one'));
assert.equal(T.resolveReelArg('reels/flat-one', root), path.join(root, 'reels', 'flat-one'));
const py = spawnSync('python3', ['-c', `import sys; sys.path.insert(0, ${JSON.stringify(path.join(kit, 'studio', 'tools'))}); from kitcore import find_reel, list_reels; import json; print(json.dumps([str(find_reel(${JSON.stringify(root)}, 'dated-one')), [n for n,_ in list_reels(${JSON.stringify(root)})]]))`], { encoding: 'utf8' });
assert.equal(py.status, 0, py.stderr);
const [pyDir, pyNames] = JSON.parse(py.stdout);
assert.equal(pyDir, T.findReel(root, 'dated-one'));
assert.deepEqual(pyNames.sort(), slugs(T.listReels(root)), 'python lookup agrees');

// 3. the dashboard sees both, and links to the dated path
const model = lib.load(root, { today: '2026-11-12' });
const bySlug = Object.fromEntries(model.items.filter((i) => i.slug).map((i) => [i.slug, i]));
assert.ok(bySlug['flat-one'] && bySlug['dated-one'], 'dashboard lists flat and dated reels');
assert.equal(bySlug['dated-one'].rel, '2026/11 November/November 12/dated-one');
assert.equal(bySlug['dated-one'].stage, 'posted');

// 4. organize: a dry run changes nothing, apply moves by the plan's date, a plan cell may hold a dated path
W('brand/plan.md', '| Date | Topic | Goal | Angle | Reel (folder) | Notes |\n|---|---|---|---|---|---|\n| 2026-11-13 09:00 | t | save | x | `reels/flat-one` | |\n');
let r = E.organize(root, { layout: 'dated' });
assert.equal(r.moves.length, 2, 'flat-one and brand-new-empty would move');
assert.ok(fs.existsSync(path.join(root, 'reels', 'flat-one')), 'dry run moved nothing');
const out1 = run('organize', '--layout', 'dated');
assert.match(out1.stdout, /would move\s+reels\/flat-one\s+->\s+reels\/2026\/11 November\/November 13\/flat-one\s+\(date from the plan\)/);
assert.match(out1.stdout, /Nothing was changed/);
const out2 = run('organize', '--layout', 'dated', '--apply');
assert.equal(out2.status, 0, out2.stderr);
assert.ok(fs.existsSync(path.join(root, 'reels', '2026', '11 November', 'November 13', 'flat-one', 'script.txt')));
assert.ok(!fs.existsSync(path.join(root, 'reels', 'flat-one')));
assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'brand', 'brand.json'), 'utf8')).reels.layout, 'dated', '--apply with --layout saves the setting');
assert.equal(T.reelsLayout(root), 'dated');
assert.equal(E.organize(root).moves.length, 0, 'second run: nothing to move');
assert.equal(T.findReel(root, 'flat-one'), path.join(root, 'reels', '2026', '11 November', 'November 13', 'flat-one'));

// 5. the publisher's reel lookups follow a moved reel
const sch = await import(pathToFileURL(path.join(root, 'publisher', 'scripts', 'schedule.mjs')).href);
process.chdir(root);                                                   // the scripts run from the brand folder
const c = sch.checkReel('reels/dated-one', {}, Date.parse('2026-11-12T12:00:00Z'));
assert.ok(!c.problems.some((p) => /no brand\/brand\.json/.test(p)), 'schedule finds a reel by reels/<slug> after it moved');
assert.equal(fs.realpathSync(c.reel ?? T.findReel(root, 'dated-one')), fs.realpathSync(T.findReel(root, 'dated-one')));

// 5b. the engine's commands find a dated reel by its slug or reels/<slug>, from the brand folder and from inside another folder
W('reels/2026/11 November/November 12/dated-one/reel.json', JSON.stringify({ style: 'print', name: 'dated-one' }));
const notFound = /has no reel\.json|isn't a reel|not a reel project|no such file/i;
for (const arg of ['dated-one', 'reels/dated-one']) {
  for (const cmd of ['gate', 'facts', 'qa', 'host', 'pace', 'measure']) {
    const o = run(cmd, arg, ...(cmd === 'gate' ? ['check'] : []));
    assert.ok(!notFound.test(o.stdout + o.stderr), `kit ${cmd} ${arg}: ${o.stdout}${o.stderr}`);
  }
}
const gate = run('gate', 'dated-one', 'check');
assert.match(gate.stdout + gate.stderr, /Gate C|approv|MATCH|file/i, 'gate reads the dated reel\'s approvals.md');
const sub = path.join(root, 'brand'); // run from another folder inside the brand
const fromBrand = spawnSync('node', [KIT, 'gate', 'dated-one', 'check'], { cwd: sub, encoding: 'utf8' });
assert.ok(!notFound.test(fromBrand.stdout + fromBrand.stderr), 'found from brand/ too');
const tools = path.join(kit, 'studio', 'tools');
const bud = spawnSync('python3', [path.join(tools, 'budget.py'), 'reels/dated-one/script.txt'], { cwd: root, encoding: 'utf8' });
assert.match(bud.stdout, /script: \d+ characters/, `budget.py reads reels/<slug>/script.txt of a dated reel: ${bud.stdout}${bud.stderr}`);
const rs = spawnSync('python3', [path.join(tools, 'realsound.py'), 'dated-one'], { cwd: root, encoding: 'utf8' });
assert.ok(!/No such file|FileNotFound/.test(rs.stderr.split('\n').filter((l) => /dated-one/.test(l) && /reels\/dated-one\b(?!\/)/.test(l)).join('')), 'realsound resolved the slug');
for (const t of ['voice', 'sound', 'lint', 'effort', 'predict', 'take']) {
  const o = spawnSync('python3', [path.join(tools, `${t}.py`), 'dated-one'], { cwd: root, encoding: 'utf8' });
  assert.ok(!/reels\/dated-one is not|no such file or directory: 'dated-one'/i.test(o.stdout + o.stderr) && !/\/test-reels\/dated-one\b/.test(o.stderr.replace(/November 12\/dated-one/g, '')), `${t}.py resolves the slug: ${o.stderr.slice(0, 200)}`);
}

// 6. kit start puts a new reel under its planned day; a reel already filed is carried on there
W('brand/plan.md', '| Date | Topic | Goal | Angle | Reel (folder) | Notes |\n|---|---|---|---|---|---|\n| 2026-12-03 09:00 | t | save | x | `reels/new-one` | |\n');
let st = run('start', 'reels/new-one', '--style', 'print');
assert.equal(st.status, 0, st.stdout + st.stderr);
assert.ok(fs.existsSync(path.join(root, 'reels', '2026', '12 December', 'December 3', 'new-one', 'reel.json')), 'new reel filed by its plan date');
st = run('start', 'reels/other', '--style', 'print', '--date', '2026-12-25');
assert.ok(fs.existsSync(path.join(root, 'reels', '2026', '12 December', 'December 25', 'other', 'reel.json')), '--date sets the day');
st = run('start', 'reels/dated-one', '--style', 'print');
assert.match(st.stdout + st.stderr, /already holds a reel|new print reel/);
assert.ok(!fs.existsSync(path.join(root, 'reels', 'dated-one')), 'no second dated-one is made at the top');

// 7. tidy: a posted reel only; keeps words and the approved file; removes build, stills and unapproved out files
const d1 = T.findReel(root, 'dated-one');
for (const f of ['build/v.mp4', 'stills/a.jpg', 'out/dated-one.mp4', 'out/dated-one-old.mp4', 'out/caption.txt', 'audio/vo.mp3']) { fs.mkdirSync(path.dirname(path.join(d1, f)), { recursive: true }); fs.writeFileSync(path.join(d1, f), 'x'.repeat(2000)); }
const dry = run('tidy', 'dated-one');
assert.match(dry.stdout, /would remove\s+build/); assert.match(dry.stdout, /would remove\s+out\/dated-one-old\.mp4/);
assert.ok(!/out\/dated-one\.mp4|caption|audio/.test(dry.stdout.replace(/Kept:.*/, '')), 'keeps the approved file, caption and (by default) the voice take');
assert.ok(fs.existsSync(path.join(d1, 'build')), 'dry run deletes nothing');
const unposted = run('tidy', 'flat-one');
assert.match(unposted.stdout, /skipped flat-one: not posted yet/);
const done = run('tidy', '--all', '--apply');
assert.equal(done.status, 0, done.stderr);
assert.ok(!fs.existsSync(path.join(d1, 'build')) && !fs.existsSync(path.join(d1, 'stills')) && !fs.existsSync(path.join(d1, 'out', 'dated-one-old.mp4')));
for (const f of ['script.txt', 'approvals.md', 'out/dated-one.mp4', 'out/caption.txt', 'audio/vo.mp3']) assert.ok(fs.existsSync(path.join(d1, f)), `${f} kept`);
run('tidy', 'dated-one', '--audio', '--apply');
assert.ok(!fs.existsSync(path.join(d1, 'audio')), '--audio removes the voice take');

// 8. back to flat: reels return to reels/<slug> and the empty date folders go
const back = run('organize', '--layout', 'flat', '--apply');
assert.equal(back.status, 0, back.stderr);
assert.ok(fs.existsSync(path.join(root, 'reels', 'dated-one', 'script.txt')) && fs.existsSync(path.join(root, 'reels', 'flat-one', 'script.txt')));
assert.ok(!fs.existsSync(path.join(root, 'reels', '2026')), 'empty date folders removed');
assert.equal(T.reelsLayout(root), 'flat');

fs.rmSync(path.dirname(root), { recursive: true, force: true });
console.log('reel folders: ok');
