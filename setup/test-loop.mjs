#!/usr/bin/env node
// Checks the learning step of the reel loop (loop.mjs): no numbers yet, too few reels, waiting for fresh reels, what holds people
// best, the weak hook and the weak middle, a breakout (and that it needs real views and a good skip rate), a stalled run, and that
// it writes only brand/loop.md and brand/loop.json. Touches nothing outside a temp folder. Run in CI: node setup/test-loop.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const kit = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.join(fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'loop-test-'))), 'test-reels');
fs.cpSync(path.join(kit, 'template'), root, { recursive: true });
fs.rmSync(path.join(root, 'reels', '_example'), { recursive: true, force: true });
const W = (f, v) => { fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); fs.writeFileSync(path.join(root, f), typeof v === 'string' ? v : JSON.stringify(v, null, 2)); };
const brand = (loop) => W('brand/brand.json', { name: 'Test', slug: 'test', handle: '@test', posting: { timezone: 'UTC' }, ...(loop ? { loop } : {}) });
brand();
const L = await import(pathToFileURL(path.join(root, '.claude', 'skills', 'content-calendar', 'loop.mjs')).href);
const now = Date.parse('2026-11-20T12:00:00Z'), DAY = 864e5;
const day = (n) => new Date(now - n * DAY).toISOString().slice(0, 10);

// rows: [slug, daysAgo, views, skip, watch, angle, trial]
const seed = (rows) => {
  W('brand/log.md', '| Date | Reel | Hook | First line | Goal | Angle | Review |\n|---|---|---|---|---|---|---|\n' + rows.map(([s, d, , , , a]) => `| ${day(d)} 09:00 | ${s} | h | line of ${s} | save | ${a} | meets the bar |`).join('\n') + '\n');
  W('brand/insights.csv', 'reel,date,views,reach,saves,shares,avg_watch_time_s,skip_rate\n' + rows.map(([s, d, v, k, w]) => `${s},${day(d)},${v},${Math.round(v * 0.8)},${Math.round(v * 0.02)},${Math.round(v * 0.01)},${w},${k}`).join('\n') + '\n');
  for (const [s, d, , , , , t] of rows) W(`reels/${s}/approvals.md`, `# A\n\n## Posting\n\n- ${day(d)} 09:00 Posted on @test: https://instagram.com/reel/${s}${t ? ' (trial)' : ''}\n`), W(`reels/${s}/script.txt`, `line of ${s}\n`);
};

// 1. no numbers at all
let r = L.run(root, { now, write: false });
assert.equal(r.state.status, 'needs-numbers'); assert.match(r.next.text, /no reel numbers yet/);

// 2. two reels: too few to say anything; the next step is one variable, the hook
seed([['a', 10, 1000, 0.4, 6, 'pain first', true], ['b', 9, 1200, 0.35, 7, 'contrarian', true]]);
r = L.run(root, { now, write: false });
assert.equal(r.state.judged, 2); assert.equal(r.state.next_variable, 'hook'); assert.match(r.next.text, /too few/);

// 3. a fresh reel is waiting, not judged
seed([['a', 10, 1000, 0.4, 6, 'pain first', true], ['b', 9, 1200, 0.35, 7, 'contrarian', true], ['fresh', 1, 80, 0.9, 1, 'pain first', true]]);
r = L.run(root, { now, write: false });
assert.equal(r.state.judged, 2); assert.equal(r.state.waiting, 1); assert.match(r.analysis.waiting[0].why, /judged after 72 h/);

// 4. six reels: the better angle is named from 2+ reels each, a weak hook and a weak middle are told apart
seed([
  ['r1', 30, 1000, 0.30, 8, 'contrarian'], ['r2', 28, 1100, 0.32, 8, 'contrarian'], ['r3', 26, 900, 0.55, 8, 'pain first'],
  ['r4', 24, 950, 0.58, 8, 'pain first'], ['r5', 22, 1000, 0.31, 3, 'contrarian'], ['r6', 20, 1050, 0.30, 8, 'something breaks'],
]);
r = L.run(root, { now, write: false });
assert.equal(r.state.judged, 6);
assert.equal(r.analysis.byAngle[0].name, 'contrarian'); assert.equal(r.analysis.byAngle.at(-1).name, 'pain first');
assert.ok(!r.analysis.byAngle.some((g) => g.name === 'something breaks'), 'a single reel is not a group');
const dx = Object.fromEntries(r.analysis.judged.map((x) => [x.slug, x.diagnosis]));
assert.match(dx.r3, /first 3 seconds: the hook/); assert.match(dx.r5, /leave in the middle/); assert.match(dx.r1, /at least as well/);
assert.match(r.next.text, /"contrarian" holds people best/);
assert.equal(r.state.status, 'running');

// 5. breakout: needs 5x the median and 5,000 views and a skip rate no worse than the median
seed([['r1', 30, 1000, 0.40, 8, 'a'], ['r2', 28, 1000, 0.40, 8, 'a'], ['r3', 26, 1000, 0.40, 8, 'b'], ['big', 5, 20000, 0.30, 12, 'b']]);
r = L.run(root, { now, write: false });
assert.deepEqual(r.state.breakouts, ['big']); assert.equal(r.state.status, 'found'); assert.equal(r.next.variable, 'repeat');
seed([['r1', 30, 1000, 0.40, 8, 'a'], ['r2', 28, 1000, 0.40, 8, 'a'], ['r3', 26, 1000, 0.40, 8, 'b'], ['big', 5, 20000, 0.80, 12, 'b']]);
assert.deepEqual(L.run(root, { now, write: false }).state.breakouts, [], 'lots of views with a terrible skip rate is not a breakout');
seed([['r1', 30, 100, 0.40, 8, 'a'], ['r2', 28, 100, 0.40, 8, 'a'], ['r3', 26, 100, 0.40, 8, 'b'], ['big', 5, 900, 0.30, 12, 'b']]);
assert.deepEqual(L.run(root, { now, write: false }).state.breakouts, [], '9x the median but under the 5,000-view floor is not a breakout');
brand({ viral_min_views: 500 });
seed([['r1', 30, 100, 0.40, 8, 'a'], ['r2', 28, 100, 0.40, 8, 'a'], ['r3', 26, 100, 0.40, 8, 'b'], ['big', 5, 900, 0.30, 12, 'b']]);
assert.deepEqual(L.run(root, { now, write: false }).state.breakouts, ['big'], 'the floor is a setting');
brand();

// 6. stalled: eight reels, the last six never beat the best skip rate before them
seed([['s1', 40, 1000, 0.20, 8, 'a'], ['s2', 38, 1000, 0.45, 8, 'a'], ['s3', 36, 1000, 0.44, 8, 'b'], ['s4', 34, 1000, 0.46, 8, 'b'],
  ['s5', 32, 1000, 0.45, 8, 'a'], ['s6', 30, 1000, 0.47, 8, 'b'], ['s7', 28, 1000, 0.45, 8, 'a'], ['s8', 26, 1000, 0.46, 8, 'b']]);
r = L.run(root, { now, write: false });
assert.equal(r.state.status, 'stalled'); assert.equal(r.next.variable, 'format'); assert.match(r.next.text, /bigger thing/);

// 7. it writes the brief and the state, and nothing else changes
const before = fs.readFileSync(path.join(root, 'brand', 'log.md'), 'utf8');
const files = (d) => fs.readdirSync(d, { recursive: true }).filter((f) => fs.statSync(path.join(d, f)).isFile()).sort();
const beforeFiles = files(path.join(root, 'reels'));
r = L.run(root, { now });
assert.ok(fs.existsSync(path.join(root, 'brand', 'loop.md')) && fs.existsSync(path.join(root, 'brand', 'loop.json')));
const md = fs.readFileSync(path.join(root, 'brand', 'loop.md'), 'utf8');
assert.match(md, /Nothing posts by itself/); assert.match(md, /\| s1 /); assert.ok(!/\u2014/.test(md), 'no em dashes');
assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'brand', 'loop.json'), 'utf8')).status, 'stalled');
assert.equal(fs.readFileSync(path.join(root, 'brand', 'log.md'), 'utf8'), before);
assert.deepEqual(files(path.join(root, 'reels')), beforeFiles, 'no reel file was touched');
const cli = spawnSync('node', [path.join(root, '.claude', 'skills', 'content-calendar', 'loop.mjs'), '--no-write'], { cwd: root, encoding: 'utf8' });
assert.equal(cli.status, 0, cli.stderr); assert.match(cli.stdout, /Reel loop: /);

fs.rmSync(path.dirname(root), { recursive: true, force: true });
console.log('loop: ok');
