#!/usr/bin/env node
// Checks that /kit-update updates the engine by itself (updateEngine in kit-update/update.mjs): runs the installer without the
// program, plugin and sound steps when the engine is behind, skips when it is current or linked, says so when it is missing or
// the installer fails, and that the installer writes the kit version into its marker. Uses a fake installer and a temp skills
// folder; installs nothing. Run in CI: node setup/test-kit-update-engine.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';

const kit = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { updateEngine } = await import(pathToFileURL(path.join(kit, 'template', '.claude', 'skills', 'kit-update', 'update.mjs')).href);
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'engine-update-test-')));
const skills = path.join(tmp, 'skills'), engine = path.join(skills, 'bagelunit-reels'), fakeKit = path.join(tmp, 'kit');
fs.mkdirSync(path.join(fakeKit, 'setup'), { recursive: true });
fs.writeFileSync(path.join(fakeKit, 'setup', 'install.mjs'), '// fake');
const marker = (v) => { fs.mkdirSync(engine, { recursive: true }); fs.writeFileSync(path.join(engine, '.bagelunit-reel-kit'), `2026-11-01\n${v}\n`); };
const logs = []; const log = (m) => logs.push(m);
let calls = [];
const runner = (status = 0) => (cmd, a, o) => { calls.push({ cmd, a, o }); return { status }; };

// not installed
assert.equal(updateEngine(fakeKit, '1.19.0', { skills, run: runner(), log }), false);
assert.match(logs.pop(), /not installed yet/); assert.equal(calls.length, 0);

// behind: the installer runs, without the program, plugin and sound steps, and without --yes (it never installs a program alone)
marker('1.17.2');
assert.equal(updateEngine(fakeKit, '1.19.0', { skills, run: runner(), log }), true);
assert.equal(calls.length, 1);
assert.deepEqual(calls[0].a.slice(1), ['--skip-packages', '--skip-plugins', '--skip-sound']);
assert.ok(!calls[0].a.includes('--yes'));
assert.match(calls[0].a[0], /setup[\\/]install\.mjs$/);
assert.ok(logs.some((l) => /1\.17\.2 to 1\.19\.0/.test(l))); assert.match(logs.at(-1), /Restart Claude Code/);

// an engine installed before versions were recorded (the marker is only a date): treated as behind
calls = []; fs.writeFileSync(path.join(engine, '.bagelunit-reel-kit'), '2026-11-01\n');
assert.equal(updateEngine(fakeKit, '1.19.0', { skills, run: runner(), log }), true); assert.equal(calls.length, 1);

// current or newer: nothing runs
calls = []; marker('1.19.0');
assert.equal(updateEngine(fakeKit, '1.19.0', { skills, run: runner(), log }), false);
assert.equal(calls.length, 0); assert.match(logs.at(-1), /already on 1\.19\.0/);
marker('1.20.0'); assert.equal(updateEngine(fakeKit, '1.19.0', { skills, run: runner(), log }), false); assert.equal(calls.length, 0);

// the installer fails: say so and show the command
marker('1.17.2');
assert.equal(updateEngine(fakeKit, '1.19.0', { skills, run: runner(1), log }), false);
assert.match(logs.at(-1), /did not finish.*install\.mjs/);

// linked: left alone
fs.rmSync(engine, { recursive: true }); fs.symlinkSync(fakeKit, engine, 'dir'); calls = [];
assert.equal(updateEngine(fakeKit, '1.19.0', { skills, run: runner(), log }), false);
assert.equal(calls.length, 0); assert.match(logs.at(-1), /linked/);

// no installer in the kit
fs.rmSync(path.join(fakeKit, 'setup', 'install.mjs'));
assert.equal(updateEngine(fakeKit, '1.19.0', { skills, run: runner(), log }), false); assert.match(logs.at(-1), /no installer/);

// the real installer writes the kit version into the marker
const src = fs.readFileSync(path.join(kit, 'setup', 'install.mjs'), 'utf8');
assert.match(src, /MARKER\), new Date\(\)\.toISOString\(\)\.slice\(0, 10\) \+ '\\n' \+ KIT_VERSION/);


// ── the session-start version note (versionNote) and engineState ──────────────────────────────────────────────────────
{
  const { versionNote, engineState } = await import(pathToFileURL(path.join(kit, 'template', '.claude', 'skills', 'kit-update', 'update.mjs')).href);
  const ws = path.join(tmp, 'ws'); fs.mkdirSync(path.join(ws, 'brand'), { recursive: true });
  fs.writeFileSync(path.join(ws, 'brand', 'brand.json'), '{}'); fs.writeFileSync(path.join(ws, '.kit-version'), '1.20.0\n');
  const NOW = Date.UTC(2026, 10, 12);
  let fetches = 0; const latest = (v) => async () => { fetches++; return v; };
  const empty = path.join(tmp, 'empty-skills');
  assert.equal(engineState(empty).state, 'missing');

  // engine behind the workspace, and no newer kit
  fs.rmSync(engine, { recursive: true, force: true }); marker('1.19.0');
  let n = await versionNote(ws, { skills, now: NOW, fetchLatest: latest('1.20.0') });
  assert.match(n, /engine \(\/bagelunit-reels\) is on 1\.19\.0, behind this workspace \(1\.20\.0\)/); assert.match(n, /update\.mjs engine/); assert.ok(!/newer BagelUnit/.test(n));
  // an engine with only a date in its marker counts as behind
  fs.writeFileSync(path.join(engine, '.bagelunit-reel-kit'), '2026-11-01\n');
  assert.match(await versionNote(ws, { skills, now: NOW, fetchLatest: latest('1.20.0') }), /an older version/);
  // engine current, kit current: nothing to say (the fetch is cached for a day)
  marker('1.20.0'); fetches = 0;
  assert.equal(await versionNote(ws, { skills, now: NOW + 3600e3, fetchLatest: latest('1.20.0') }), ''); assert.equal(fetches, 0, 'one online check a day');
  // a day later a newer kit is out
  n = await versionNote(ws, { skills, now: NOW + 25 * 3600e3, fetchLatest: latest('1.21.0') });
  assert.match(n, /newer BagelUnit Reel Kit is out: 1\.21\.0 \(this workspace is on 1\.20\.0\).*\/kit-update/); assert.equal(fetches, 1);
  // offline: the last known answer stays, the session is never failed
  n = await versionNote(ws, { skills, now: NOW + 50 * 3600e3, fetchLatest: async () => { throw new Error('offline'); } });
  assert.match(n, /1\.21\.0/);
  // switched off in brand.json: no online check at all
  fs.writeFileSync(path.join(ws, 'brand', 'brand.json'), JSON.stringify({ updates: { check: false } })); fs.rmSync(path.join(ws, '.cache'), { recursive: true, force: true }); fetches = 0;
  assert.equal(await versionNote(ws, { skills, now: NOW + 99 * 3600e3, fetchLatest: latest('9.9.9') }), ''); assert.equal(fetches, 0);
  // a linked engine and a missing engine are never called behind
  fs.rmSync(engine, { recursive: true, force: true }); fs.symlinkSync(fakeKit, engine, 'dir');
  assert.equal(await versionNote(ws, { skills, now: NOW, fetchLatest: latest('1.20.0') }), '');
  assert.equal(await versionNote(ws, { skills: empty, now: NOW, fetchLatest: latest('1.20.0') }), '');
  console.log('ok   session-start version note');
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log('kit update engine: ok');
