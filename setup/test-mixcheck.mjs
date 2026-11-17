#!/usr/bin/env node
// mixcheck (studio/tools/mixcheck.py), with no key and no network; needs only ffmpeg and ffprobe:
//  1. the tool's own --selftest (loudness, a silence gap, clipping, ducking on a made-up reel)
//  2. a reel folder end to end: build/mix.json is written with a loudness number, a bare mp4 writes <name>.mix.json beside it,
//     a folder with no video exits 2
// Without ffmpeg or ffprobe (or python) it prints SKIPPED and passes.
//   node setup/test-mixcheck.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOOL = path.join(REPO, 'studio', 'tools', 'mixcheck.py');
const PY = process.platform === 'win32' ? 'python' : 'python3';
let failures = 0;
const fail = (m) => { failures++; console.error('FAIL: ' + m); };
const ok = (m) => console.log('ok: ' + m);
const has = (cmd, args) => { const r = spawnSync(cmd, args, { encoding: 'utf8' }); return !r.error && r.status === 0; };

if (!has(PY, ['--version'])) { console.log('SKIPPED mixcheck test: ' + PY + ' not found'); process.exit(0); }
if (!has('ffmpeg', ['-version']) || !has('ffprobe', ['-version'])) { console.log('SKIPPED mixcheck test: ffmpeg or ffprobe not found'); process.exit(0); }

const run = (args) => spawnSync(PY, [TOOL, ...args], { encoding: 'utf8' });
const lines = (r) => (r.stdout + r.stderr).split(/\r?\n/);

// 1. selftest
{
  const r = run(['--selftest']);
  const out = r.stdout + r.stderr;
  if (/SKIPPED mixcheck selftest/.test(out)) { console.log('SKIPPED mixcheck selftest: ' + out.trim().split(/\r?\n/).pop()); }
  else if (r.status === 0 && /mixcheck selftest: OK/.test(out)) ok('selftest passes');
  else fail('selftest: ' + out.slice(-600));
}

// 2. a reel folder and a bare mp4
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mixcheck-')));
try {
  const reel = path.join(tmp, 'reel');
  fs.mkdirSync(path.join(reel, 'out'), { recursive: true });
  fs.mkdirSync(path.join(reel, 'build'), { recursive: true });
  const mp4 = path.join(reel, 'out', 'final.mp4');
  const mk = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=300:sample_rate=48000:duration=4',
    '-af', 'volume=10dB', '-c:a', 'aac', mp4], { encoding: 'utf8' });
  if (mk.status !== 0) { console.log('SKIPPED mixcheck reel test: this ffmpeg could not make a test file'); }
  else {
    const r = run([reel]);
    const mj = path.join(reel, 'build', 'mix.json');
    if (r.status !== 0 && r.status !== 1) fail('reel folder run exit ' + r.status + ': ' + (r.stdout + r.stderr).slice(-400));
    else if (!fs.existsSync(mj)) fail('build/mix.json was not written');
    else {
      const j = JSON.parse(fs.readFileSync(mj, 'utf8'));
      const loud = (j.checks || []).find((c) => c.check === 'loudness');
      if (!loud || typeof loud.lufs !== 'number') fail('mix.json has no loudness number');
      else ok('reel folder writes build/mix.json (' + loud.lufs.toFixed(1) + ' LUFS)');
      if (!lines(r).some((l) => /^(PASS|WARN|FAIL|SKIPPED|INFO)\s+ducking/.test(l))) fail('no ducking line printed');
      else ok('prints a ducking line');
    }
    const bare = run([mp4]);
    if (!fs.existsSync(path.join(reel, 'out', 'final.mix.json'))) fail('bare mp4 did not write final.mix.json beside it: ' + (bare.stdout + bare.stderr).slice(-300));
    else ok('bare mp4 writes <name>.mix.json');
    const empty = path.join(tmp, 'empty');
    fs.mkdirSync(empty);
    const e = run([empty]);
    if (e.status !== 2) fail('a folder with no video should exit 2, got ' + e.status);
    else ok('no video exits 2');
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

if (failures) { console.error(failures + ' failure(s)'); process.exit(1); }
console.log('mixcheck test: all passed');
