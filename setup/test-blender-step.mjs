#!/usr/bin/env node
// The installer's optional Blender step (setup/install.mjs, "Blender (free 3D for /blender-shot, optional)"), with no network and nothing
// installed: it runs the installer as a dry run with a fake `blender` on PATH and checks what it says.
//   found and new enough    -> "OK: Blender 5.2.0 found"
//   found but older than 5.1 -> a NOTE that says to update, with the command
//   not found               -> a NOTE that says it is optional and prints how to get it (never installs it)
// The step must never ask a question or run an install command, so the dry run must finish without one.
// Run in CI: node setup/test-blender-step.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WIN = process.platform === 'win32', MAC = process.platform === 'darwin';
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'blender-step-')));
const home = path.join(tmp, 'home'); fs.mkdirSync(home);

// a PATH that holds node (linked, so its own folder's other programs are not on PATH) and the system's `which` or `where`, nothing else
const bin = path.join(tmp, 'bin'); fs.mkdirSync(bin);
if (WIN) fs.copyFileSync(process.execPath, path.join(bin, 'node.exe')); else fs.symlinkSync(process.execPath, path.join(bin, 'node'));
const system = WIN ? [path.join(process.env.SystemRoot || 'C:\\Windows', 'System32')] : ['/usr/bin', '/bin'];
const fake = (dir, version) => {
  fs.mkdirSync(dir, { recursive: true });
  if (WIN) fs.writeFileSync(path.join(dir, 'blender.cmd'), `@echo off\r\necho Blender ${version}\r\n`);
  else { fs.writeFileSync(path.join(dir, 'blender'), `#!/bin/sh\necho "Blender ${version}"\necho "  build date: today"\n`); fs.chmodSync(path.join(dir, 'blender'), 0o755); }
};
const run = (extra) => {
  const r = spawnSync(process.execPath, [path.join(REPO, 'setup', 'install.mjs'), '--dry-run', '--skip-plugins', '--skip-sound', '--skip-packages'], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000,
    env: { ...process.env, BAGELUNIT_BLENDER_PATHS: '', HOME: home, USERPROFILE: home, PATH: [...extra, bin, ...system].join(path.delimiter), ProgramFiles: path.join(tmp, 'nopf'), 'ProgramFiles(x86)': path.join(tmp, 'nopf') },
  });
  assert.equal(r.status, 0, `installer dry run failed:\n${r.stdout}\n${r.stderr}`);
  const out = r.stdout.split(/\r?\n/), at = out.findIndex((l) => l.includes('Blender (free 3D for /blender-shot, optional)'));
  assert.ok(at >= 0, 'the Blender step is missing from the installer output');
  const end = out.findIndex((l, i) => i > at && l.startsWith('==> Step'));
  return out.slice(at, end < 0 ? undefined : end).join('\n');
};

const modern = path.join(tmp, 'new'); fake(modern, '5.2.0');
let o = run([modern]);
assert.match(o, /OK: Blender 5\.2\.0 found/, o);
console.log('ok   Blender 5.2.0 on PATH is reported as found');

const old = path.join(tmp, 'old'); fake(old, '4.2.1');
o = run([old]);
assert.match(o, /NOTE: Blender 4\.2 found.*needs 5\.1 or newer/, o);
assert.match(o, MAC ? /brew upgrade --cask blender/ : WIN ? /winget upgrade BlenderFoundation\.Blender/ : /blender\.org/, o);
console.log('ok   Blender 4.2 is reported as too old, with the update command');

o = run([]);
assert.match(o, /NOTE: Blender is not installed\. It is optional/, o);
assert.match(o, MAC ? /brew install --cask blender/ : WIN ? /winget install BlenderFoundation\.Blender/ : /snap install blender|apt install blender|blender\.org/, o);
assert.doesNotMatch(o, /\[y\/N\]/, 'the step must not ask to install');
console.log('ok   no Blender prints the NOTE with how to get it and asks nothing');

// a Blender in a standard place (not on PATH) is found, and the step says it is not on PATH
const place = path.join(tmp, 'apps', WIN ? 'blender.exe' : 'Blender');
fs.mkdirSync(path.dirname(place), { recursive: true });
if (WIN) fs.copyFileSync(path.join(modern, 'blender.cmd'), place.replace(/\.exe$/, '.cmd'));
if (!WIN) { fs.copyFileSync(path.join(modern, 'blender'), place); fs.chmodSync(place, 0o755); }
if (!WIN) {
  const r = spawnSync(process.execPath, [path.join(REPO, 'setup', 'install.mjs'), '--dry-run', '--skip-plugins', '--skip-sound', '--skip-packages'], { encoding: 'utf8', env: { ...process.env, BAGELUNIT_BLENDER_PATHS: place, HOME: home, USERPROFILE: home, PATH: [bin, ...system].join(path.delimiter) } });
  assert.match(r.stdout, /OK: Blender 5\.2\.0 found/, r.stdout);
  assert.match(r.stdout, /not on PATH/, r.stdout);
  console.log('ok   Blender in a standard place, off PATH, is found and the step says so');
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log('blender step: ok');
