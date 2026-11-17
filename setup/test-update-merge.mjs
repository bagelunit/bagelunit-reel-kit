#!/usr/bin/env node
// Checks that updating a brand workspace MERGES local edits instead of replacing them (setup/lib/kit-merge.mjs, run by
// setup/sync-template.mjs, which /kit-update runs from the downloaded kit). Uses a small fake kit and a temp workspace;
// touches nothing else. Cases: an untouched file is replaced; a locally edited file is merged cleanly (both changes, .bak
// kept, CRLF kept); a conflicting edit stays yours with <name>.kit-new; no saved base falls back to replace + .bak with a
// clear message; the base is written after an apply (and by new-brand.mjs); the dry run predicts the same groups and changes
// nothing; .gitignore keeps extra lines; a binary file is replaced; a second update merges once a base exists.
// Run in CI: node setup/test-update-merge.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const real = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'update-merge-test-')));
const kit = path.join(tmp, 'kit');
const T = path.join(kit, 'template');
fs.cpSync(path.join(real, 'setup'), path.join(kit, 'setup'), { recursive: true, filter: (s) => !path.basename(s).startsWith('test-') });
const w = (root, rel, text) => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
const r = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const lines = (n, tag) => Array.from({ length: n }, (_, i) => `${tag} line ${i + 1}`).join('\n') + '\n';
const run = (...a) => { const p = spawnSync(process.execPath, a, { encoding: 'utf8' }); assert.equal(p.status, 0, `${a.join(' ')}\n${p.stdout}${p.stderr}`); return p.stdout; };
const sync = (ws, ...f) => run(path.join(kit, 'setup', 'sync-template.mjs'), ws, ...f);
const snapshot = (root) => { const o = {}; const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else o[path.relative(root, p)] = crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex'); } }; walk(root); return o; };

// ---- the kit, version 1 ----
const v1 = {
  'CLAUDE.md': lines(12, 'rule'), 'README.md': 'readme\n', '.gitignore': 'node_modules/\n*.key\n',
  'docs/a.md': lines(8, 'doc a'), 'docs/b.md': lines(10, 'doc b'), 'docs/c.md': lines(6, 'doc c'),
  'publisher/src/x.js': lines(10, 'code'), 'scripts/s.py': lines(5, 'py'),
  'brand/brand.json': JSON.stringify({ name: '' }, null, 2) + '\n', '.kit-version': '1.0.0\n',
};
for (const [k, v] of Object.entries(v1)) w(T, k, v);
fs.writeFileSync(path.join(T, 'publisher', 'img.bin'), Buffer.from([0, 1, 2, 3, 0, 9]));
w(kit, 'VERSION', '1.0.0\n');

// ---- a workspace from new-brand.mjs: the base is written ----
run(path.join(kit, 'setup', 'new-brand.mjs'), path.join(tmp, 'ws'));
const ws = path.join(tmp, 'ws-reels');
assert.ok(fs.existsSync(path.join(ws, '.kit-base', '.kit-base-version')), 'new-brand.mjs writes .kit-base');
assert.match(r(ws, '.kit-base/.kit-base-version'), /^1\.0\.0/);
assert.equal(r(ws, '.kit-base/CLAUDE.md'), v1['CLAUDE.md']);
assert.ok(!fs.existsSync(path.join(ws, '.kit-base', '.gitignore')), 'no .gitignore inside .kit-base (it would act as ignore rules there)');
assert.ok(!fs.existsSync(path.join(ws, '.kit-base', 'publisher', 'img.bin')), 'a binary file is not kept in the base');
console.log('ok   new-brand.mjs saves the base (text files only, no .gitignore, no binaries)');

// ---- local edits in the workspace ----
w(ws, 'CLAUDE.md', r(ws, 'CLAUDE.md') + 'my brand rule\n');                                     // clean merge (kit edits the top)
w(ws, 'publisher/src/x.js', r(ws, 'publisher/src/x.js').replace('code line 3', 'code line 3 MINE'));   // conflict (kit edits the same line)
w(ws, 'docs/b.md', (r(ws, 'docs/b.md') + 'my note\n').replace(/\n/g, '\r\n'));                     // CRLF checkout with a local edit
w(ws, '.gitignore', r(ws, '.gitignore') + 'mine/\n');
w(ws, 'reels/mine.txt', 'keep me\n');
// ---- the kit, version 2 ----
w(T, 'CLAUDE.md', v1['CLAUDE.md'].replace('rule line 1', 'rule line 1 NEW'));
w(T, 'publisher/src/x.js', v1['publisher/src/x.js'].replace('code line 3', 'code line 3 KIT'));
w(T, 'docs/a.md', v1['docs/a.md'] + 'doc a added\n');
w(T, 'docs/b.md', v1['docs/b.md'].replace('doc b line 1\n', 'doc b line 1 NEW\n'));
w(T, 'scripts/s.py', v1['scripts/s.py'] + 'more\n');
w(T, '.gitignore', v1['.gitignore'] + '.cache/\n');
fs.writeFileSync(path.join(T, 'publisher', 'img.bin'), Buffer.from([0, 1, 2, 3, 0, 9, 9]));
w(T, 'docs/new.md', 'new file\n');
w(kit, 'VERSION', '1.1.0\n'); w(T, '.kit-version', '1.1.0\n');

// ---- dry run: predicts, changes nothing ----
const before = snapshot(ws);
const dry = sync(ws);
assert.deepEqual(snapshot(ws), before, 'the dry run changed the workspace');
const grp = (out, label) => out.split('\n').map((l) => new RegExp(`^  ${label.trim()}\\s{2,}(\\S+)`).exec(l)).filter(Boolean).map((m) => m[1].replace(/:$/, ''));
const expectGroups = (out) => {
  assert.deepEqual(grp(out, 'new ').sort(), ['docs/new.md']);
  assert.deepEqual(grp(out, 'replaced ').sort(), ['docs/a.md', 'publisher/img.bin', 'scripts/s.py']);
  assert.deepEqual(grp(out, 'merged ').sort(), ['.gitignore', 'CLAUDE.md', 'docs/b.md']);
  assert.deepEqual(grp(out, 'conflict ').sort(), ['publisher/src/x.js']);
  assert.match(out, /Summary: 1 new, 3 replaced, 3 merged \(your changes kept\), 1 conflict \(need you\)/);
  assert.ok(!/\\/.test(out.split('\n').filter((l) => /^(new|replaced|merged|conflict)\s/.test(l)).join('\n')), 'paths in the output use forward slashes');
};
expectGroups(dry);
assert.match(dry, /would be/);
assert.ok(!/No saved base yet/.test(dry), 'there is a base, so no fallback message');
console.log('ok   dry run predicts replaced / merged / conflicts and changes nothing');

// ---- apply ----
const out = sync(ws, '--apply');
expectGroups(out);
// replaced: untouched file equals the kit, old copy kept
assert.equal(r(ws, 'docs/a.md'), r(T, 'docs/a.md'));
assert.ok(fs.readdirSync(path.join(ws, 'docs')).some((f) => f.startsWith('a.md.bak-')), 'the replaced file is kept as .bak');
assert.deepEqual(fs.readFileSync(path.join(ws, 'publisher', 'img.bin')), fs.readFileSync(path.join(T, 'publisher', 'img.bin')));
// merged: both changes, .bak kept
const cm = r(ws, 'CLAUDE.md');
assert.ok(cm.includes('rule line 1 NEW') && cm.includes('my brand rule'), 'merge keeps the kit change and the local edit');
assert.ok(!/<<<<<<<|>>>>>>>/.test(cm), 'no conflict markers in a live file');
assert.ok(fs.readdirSync(ws).some((f) => f.startsWith('CLAUDE.md.bak-') && r(ws, f).includes('my brand rule') && !r(ws, f).includes('NEW')), 'the old file is kept as .bak');
// merged with CRLF
const bm = r(ws, 'docs/b.md');
assert.ok(bm.includes('doc b line 1 NEW') && bm.includes('my note'), 'CRLF file: both changes present');
assert.ok(!/[^\r]\n/.test(bm), 'CRLF file stays CRLF');
// .gitignore keeps the extra line and gains the kit's
const gi = r(ws, '.gitignore');
assert.ok(gi.includes('mine/') && gi.includes('.cache/') && gi.includes('node_modules/'), '.gitignore keeps your lines and gains the kit lines');
// conflict: yours untouched, the kit's version beside it
assert.ok(r(ws, 'publisher/src/x.js').includes('code line 3 MINE') && !/<<<<<<<|KIT/.test(r(ws, 'publisher/src/x.js')), 'a conflicting file keeps your version, no markers');
assert.equal(r(ws, 'publisher/src/x.js.kit-new'), r(T, 'publisher/src/x.js'));
// data untouched, new file added
assert.equal(r(ws, 'reels/mine.txt'), 'keep me\n'); assert.equal(r(ws, 'docs/new.md'), 'new file\n');
// base written after apply = the new kit
assert.equal(r(ws, '.kit-base/CLAUDE.md'), r(T, 'CLAUDE.md')); assert.equal(r(ws, '.kit-base/docs/new.md'), 'new file\n');
assert.match(r(ws, '.kit-base/.kit-base-version'), /^1\.1\.0/); assert.equal(r(ws, '.kit-version').trim(), '1.1.0');
assert.ok(!fs.existsSync(path.join(ws, '.kit-base', 'publisher', 'img.bin')));
console.log('ok   apply: untouched replaced, edited merged (CRLF kept, .bak kept), conflict kept as yours + .kit-new, .gitignore lines kept, binary replaced, base rewritten');

// ---- nothing left to do ----
const again = sync(ws);
assert.deepEqual(grp(again, 'replaced '), []); assert.deepEqual(grp(again, 'merged '), []);
assert.deepEqual(grp(again, 'conflict '), []);
assert.ok(grp(again, 'yours ').includes('publisher/src/x.js'), 'the unresolved file is yours, left alone, and not a new conflict');
console.log('ok   a second run has nothing to replace or merge');

// ---- no saved base: replace + .bak with the clear message ----
fs.rmSync(path.join(ws, '.kit-base'), { recursive: true });
w(ws, 'docs/c.md', r(ws, 'docs/c.md') + 'local c edit\n');
w(T, 'docs/c.md', v1['docs/c.md'] + 'kit c line\n');
const nb = sync(ws);
assert.match(nb, /No saved base yet, so local edits in .* replaced/); assert.match(nb, /From now on updates will merge/);
assert.ok(grp(nb, 'replaced ').includes('docs/c.md'));
const nbApply = sync(ws, '--apply');
assert.equal(r(ws, 'docs/c.md'), r(T, 'docs/c.md'));
assert.ok(fs.readdirSync(path.join(ws, 'docs')).some((f) => f.startsWith('c.md.bak-') && r(ws, 'docs/' + f).includes('local c edit')), 'the .bak holds the local edit');
assert.ok(/No saved base yet/.test(nbApply)); assert.ok(fs.existsSync(path.join(ws, '.kit-base', '.kit-base-version')), 'base written after the fallback');
console.log('ok   no saved base: replaced + .bak with the clear message, base written');

// ---- from now on it merges ----
w(ws, 'docs/c.md', r(ws, 'docs/c.md').replace('doc c line 6', 'doc c line 6 MINE2'));
w(T, 'docs/c.md', r(T, 'docs/c.md').replace('doc c line 1\n', 'doc c line 1 KIT2\n'));
const m2 = sync(ws, '--apply');
assert.ok(grp(m2, 'merged ').includes('docs/c.md'));
assert.ok(r(ws, 'docs/c.md').includes('MINE2') && r(ws, 'docs/c.md').includes('KIT2'));
console.log('ok   after the base exists, the next update merges');

fs.rmSync(tmp, { recursive: true, force: true });
console.log('update merge: all checks passed');
