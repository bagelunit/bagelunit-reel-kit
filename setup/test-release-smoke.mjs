#!/usr/bin/env node
// Release smoke test: the checks that would have caught the 1.17.1 and 1.17.2 fix-ups before they shipped.
//  1. A new brand folder from template/ works end to end in BOTH folder layouts (flat reels/<slug>, dated reels/2026/11 November/November 12/<slug>):
//     every engine command that takes a reel is run by its slug and must find the reel (never "not found", never a crash).
//  2. No tool builds a reel path by hand (path.join(root, 'reels', ...)): everything goes through the shared lookup, so a new
//     layout cannot be missed by one command. The few allowed places are listed below.
//  3. Every command in the engine's help text is on the list of commands this test knows, so a new command must be added here
//     (and so get a layout check) before CI passes.
// Nothing leaves a temp folder. Run in CI: node setup/test-release-smoke.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const kit = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KIT = path.join(kit, 'studio', 'tools', 'kit.mjs');
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'release-smoke-')));
let failures = 0;
const fail = (m) => { failures++; console.error('FAIL: ' + m); };
const ok = (m) => console.log('ok   ' + m);

// ── 3. the engine's commands, each one named here ─────────────────────────────────────────────────────────────────────
// takesReel: run by slug in both layouts and must find the reel. The rest need no reel folder (or need a render, a network or a key).
const takesReel = {
  pace: [], effort: [], lint: [], facts: [], gate: ['check'], measure: [], predict: [], qa: [], host: ['--check'],
  scene: ['plan'],   // on the smoke reel (print) it finds the reel, then says it is not a scene-style reel; setup/test-scene-styles.mjs tests the rest
};
const needsMore = ['start', 'frames', 'render', 'calibrate', 'sound', 'export', 'live', 'cover', 'organize', 'tidy'];   // covered by test-reel-folders.mjs, the sticker-host CI step, or need a render
const help = spawnSync('node', [KIT], { encoding: 'utf8' }).stdout;
const listed = [...help.matchAll(/^  node tools\/kit\.mjs (\w+)/gm)].map((m) => m[1]);
assert.ok(listed.length > 10, 'could not read the command list from kit.mjs help');
const unknown = listed.filter((c) => !(c in takesReel) && !needsMore.includes(c));
if (unknown.length) fail(`kit.mjs has command(s) this test does not know: ${unknown.join(', ')}. Add each to takesReel (if it takes a reel folder) or needsMore in setup/test-release-smoke.mjs so it gets a layout check.`);
else ok(`all ${listed.length} engine commands are known to the smoke test`);

// ── 1. a new brand in each layout ─────────────────────────────────────────────────────────────────────────────────────
// what a command says when it cannot find the reel (a missing Python package is a different problem and is not counted here)
const NOT_FOUND = /has no reel\.json|isn't a reel yet|is not a folder|not inside a brand folder|No such file or directory|FileNotFoundError|no reel (named|found)|could not find (the |a )?reel/i;
for (const layout of ['flat', 'dated']) {
  const made = spawnSync('node', [path.join(kit, 'setup', 'new-brand.mjs'), path.join(tmp, 'smoke-' + layout)], { encoding: 'utf8' });
  const B = path.join(tmp, 'smoke-' + layout + '-reels');
  if (made.status !== 0 || !fs.existsSync(path.join(B, 'brand', 'brand.json'))) { fail(`${layout}: new-brand.mjs failed: ${made.stderr || made.stdout}`); continue; }
  const bj = path.join(B, 'brand', 'brand.json'), d = JSON.parse(fs.readFileSync(bj, 'utf8'));
  Object.assign(d, { name: 'Smoke', slug: 'smoke', handle: '@smoke', reels: { layout } });
  fs.writeFileSync(bj, JSON.stringify(d, null, 2));
  const kitRun = (...a) => spawnSync('node', [KIT, ...a], { cwd: B, encoding: 'utf8' });
  const start = kitRun('start', 'reels/smoke-reel', '--style', 'print', '--date', '2026-11-12');
  if (start.status !== 0) { fail(`${layout}: kit start failed: ${start.stderr || start.stdout}`); continue; }
  const want = layout === 'dated' ? path.join(B, 'reels', '2026', '11 November', 'November 12', 'smoke-reel') : path.join(B, 'reels', 'smoke-reel');
  if (!fs.existsSync(path.join(want, 'reel.json'))) { fail(`${layout}: kit start did not put the reel at ${path.relative(B, want)}`); continue; }
  ok(`${layout}: kit start filed the reel at ${path.relative(B, want)}`);
  for (const [cmd, extra] of Object.entries(takesReel)) {
    for (const ref of ['smoke-reel', 'reels/smoke-reel']) {
      const r = kitRun(cmd, ref, ...extra), out = (r.stdout || '') + (r.stderr || '');
      if (NOT_FOUND.test(out)) fail(`${layout}: kit ${cmd} ${ref} could not find the reel: ${out.trim().split('\n')[0]}`);
    }
  }
  ok(`${layout}: every reel command found the reel by its slug`);
}

// ── 2. no hand-built reel paths ───────────────────────────────────────────────────────────────────────────────────────
const allowed = [   // [file, why]: the lookup itself, the organizer, and one fallback that already tries the shared lookup first
  ['studio/tools/folders.mjs', 'the engine copy of the shared lookup and organizer'],
  ['template/publisher/scripts/reels.mjs', 'the shared lookup'],
  ['studio/tools/kit.mjs', 'start (refuses a folder outside reels/) and the tidy printout'],
  ['template/.claude/skills/content-calendar/best-times.mjs', 'fallback after findReel'],
];
const roots = ['studio/tools', 'template/.claude', 'template/publisher/src', 'template/publisher/scripts'];
const skip = new Set(['node_modules', '__pycache__', 'test']);
const files = [];
const walk = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { if (skip.has(e.name)) continue; const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else if (/\.(mjs|js|py)$/.test(e.name)) files.push(p); } };
for (const r of roots) if (fs.existsSync(path.join(kit, r))) walk(path.join(kit, r));
const HAND = /(?:join|resolve)\([^)\n]*['"]reels['"]\s*,/;       // path.join(root, 'reels', slug)
const PYHAND = /['"]reels['"]\s*,\s*[A-Za-z_]/;                  // os.path.join(root, 'reels', slug)
const bad = [];
for (const f of files) {
  const rel = path.relative(kit, f).split(path.sep).join('/');
  if (allowed.some(([a]) => a === rel)) continue;
  fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => { if ((HAND.test(line) || (f.endsWith('.py') && PYHAND.test(line))) && !/^\s*(\/\/|#)/.test(line)) bad.push(`${rel}:${i + 1}: ${line.trim().slice(0, 110)}`); });
}
if (bad.length) fail('reel paths built by hand (use findReel / resolveReelArg from publisher/scripts/reels.mjs, studio/tools/folders.mjs or kitcore.find_reel so dated folders are found):\n  ' + bad.join('\n  '));
else ok('no tool builds a reel path by hand');

fs.rmSync(tmp, { recursive: true, force: true });
if (failures) { console.error(`\n${failures} check(s) failed.`); process.exit(1); }
console.log('\nRelease smoke test passed.');
