#!/usr/bin/env node
// Checks the score bar: Gate C refuses a /reel-review verdict under 90/100 (or with no score), accepts 90 or more, reads the older
// 4.5/5 scale, and records the owner's override. Touches nothing outside a temp folder. Run in CI: node setup/test-score-bar.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const kit = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tools = path.join(kit, 'studio', 'tools');
const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'score-bar-test-')));
const reel = path.join(dir, 'r');
fs.mkdirSync(path.join(reel, 'out'), { recursive: true });
fs.writeFileSync(path.join(reel, 'out', 'r.mp4'), 'not a real video');
fs.writeFileSync(path.join(reel, 'reel.json'), '{"style":"print"}');
const approvals = path.join(reel, 'approvals.md');
const gate = (...a) => spawnSync('python3', [path.join(tools, 'gate.py'), reel, 'record', '--gate', 'C', '--skip-facts', 'test', ...a], { encoding: 'utf8' });
const out = (r) => r.stdout + r.stderr;
const say = (line) => fs.writeFileSync(approvals, `# Approvals\n\n## Gate C\n\n- ${line}\n`);

fs.writeFileSync(approvals, '# Approvals\n');
let r = gate();
assert.notEqual(r.status, 0); assert.match(out(r), /needs a review of 90\/100 or more.*no "Review:" line/s);

say('Review: not ready (84/100; weakest: hook has no snapback).');
r = gate(); assert.notEqual(r.status, 0); assert.match(out(r), /scores 84\/100/);

say('Review: meets the bar (4.3/5; weakest: ending drags).');          // the older scale: 4.3 is 86
r = gate(); assert.notEqual(r.status, 0); assert.match(out(r), /scores 86\/100/);

say('Review: meets the bar.');
r = gate(); assert.notEqual(r.status, 0); assert.match(out(r), /has no score/);

say('Review: not ready (92/100; must-pass 1 failed: handle hidden).');   // a must-pass failure is not "meets the bar", whatever the number
r = gate(); assert.notEqual(r.status, 0);

say('Review: meets the bar (89.9/100; weakest: ending).');
r = gate(); assert.notEqual(r.status, 0, 'under 90 by a decimal is still under');

// redo and review again: only the LAST line counts, and the old ones stay as the history
fs.writeFileSync(approvals, '# Approvals\n\n- Review: not ready (84/100; weakest: hook).\n- Review: meets the bar (92/100; weakest: ending drags after 27 s).\n');
r = gate(); assert.equal(r.status, 0, out(r));
assert.match(fs.readFileSync(approvals, 'utf8'), /Review: meets the bar \(92\/100/);
assert.ok(!/REVIEW BELOW THE BAR/.test(fs.readFileSync(approvals, 'utf8')));

say('Review: meets the bar (4.5/5; weakest: ending).');                 // 4.5 out of 5 is exactly 90
r = gate(); assert.equal(r.status, 0, out(r));

// the owner's override is written into the record
say('Review: not ready (80/100; weakest: hook).');
r = gate('--skip-review'); assert.notEqual(r.status, 0, 'an override needs a reason');
r = gate('--skip-review', 'owner wants it out today');
assert.equal(r.status, 0, out(r));
assert.match(fs.readFileSync(approvals, 'utf8'), /REVIEW BELOW THE BAR: owner wants it out today/);

// gates A and B do not need a review
fs.writeFileSync(approvals, '# Approvals\n');
r = spawnSync('python3', [path.join(tools, 'gate.py'), reel, 'record', '--gate', 'B'], { encoding: 'utf8' });
assert.equal(r.status, 0, out(r));

fs.rmSync(dir, { recursive: true, force: true });
console.log('score bar: ok');
