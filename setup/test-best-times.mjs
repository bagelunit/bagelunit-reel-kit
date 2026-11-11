#!/usr/bin/env node
// Checks the best-times step end to end in a throwaway brand folder: not enough data, the brand's own hours, the
// audience's online hours, keeping times that already work, the spacing rule, the plan rows that move (and the ones that
// never do), the owner's yes, autopilot.retime and the Planner panel. Touches nothing outside a temp folder.
// Run in CI: node setup/test-best-times.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';

const kit = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'best-times-test-'));
fs.cpSync(path.join(kit, 'template'), root, { recursive: true });
const K = (f) => pathToFileURL(path.join(root, '.claude', 'skills', 'content-calendar', f)).href;
const bt = await import(K('best-times.mjs'));
const lib = await import(K('lib.mjs'));

const DAY = 864e5, HOUR = 36e5, now = Date.parse('2026-11-11T12:00:00Z');
const write = (f, v) => { fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); fs.writeFileSync(path.join(root, f), typeof v === 'string' ? v : JSON.stringify(v, null, 2)); };
const brand = (patch = {}) => write('brand/brand.json', { name: 'Test', slug: 'test', handle: '@test', posting: { timezone: 'UTC', times: ['08:00', '13:00', '19:00'] }, ...patch });
brand();

// --- 1. not enough data: nothing changes, and it says how far off it is
let s = bt.suggest({ own: [], online: null, winners: [], current: ['08:00', '13:00', '19:00'], tz: 'UTC', now });
assert.equal(s.status, 'not_enough_data'); assert.deepEqual(s.suggested, ['08:00', '13:00', '19:00']);
assert.match(s.reasons[0], /0 of 15 posts/);
const few = Array.from({ length: 6 }, (_, i) => ({ platform: 'instagram', at: now - (i + 3) * DAY, views: 1000 }));
assert.equal(bt.suggest({ own: few, current: ['08:00'], now }).status, 'not_enough_data');   // 6 posts is not 15

// --- 2. a brand with 24 settled posts over 4 weeks at 08:00, 13:00 and 19:00: 13:00 is good, 08:00 is poor; the audience is online at 16:00
const post = (daysAgo, hour, views) => ({ platform: 'instagram', at: Date.UTC(2026, 10, 11, hour, 0) - daysAgo * DAY, views });
const own = [];
for (let d = 3; d < 31; d += 3.5) { own.push(post(Math.floor(d), 8, 400)); own.push(post(Math.floor(d), 13, 1600)); own.push(post(Math.floor(d), 19, 1100)); }
const online = Array(24).fill(0.1); online[16] = 1; online[17] = 0.8; online[13] = 0.5; online[19] = 0.6; online[8] = 0.1;
s = bt.suggest({ own, online, winners: [], current: ['08:00', '13:00', '19:00'], tz: 'UTC', now });
assert.equal(s.status, 'suggested');
assert.deepEqual(s.suggested, ['13:00', '16:00', '19:00']);              // 08:00 swapped for 16:00; the two that work stay exactly as they were
assert.equal(s.moves.length, 1); assert.equal(s.moves[0].from, '08:00'); assert.equal(s.moves[0].to, '16:00');
assert.match(s.moves[0].reasons.join(), /audience is online around 16:00/);
assert.ok(s.evidence.own.enough);
const gaps = s.suggested.map((t) => +t.slice(0, 2)); for (let i = 1; i < gaps.length; i++) assert.ok(gaps[i] - gaps[i - 1] >= bt.SPACING);   // never two posts within 3 hours
assert.ok(s.suggested.every((t) => +t.slice(0, 2) >= bt.FIRST_HOUR && +t.slice(0, 2) <= bt.LAST_HOUR));

// --- 3. a young post does not count, and an hour with too few posts is not judged
assert.equal(bt.suggest({ own: [...own.slice(0, 3), { platform: 'instagram', at: now - 10 * HOUR, views: 99999 }], current: ['08:00'], now }).status, 'not_enough_data');

// --- 4. the times already match: nothing to change, no flapping on a small difference
const flat = bt.suggest({ own, online: Array(24).fill(0).map((_, h) => ([8, 13, 19].includes(h) ? 1 : 0.2)), current: ['13:00', '19:00', '08:00'], tz: 'UTC', now });
assert.ok(['same', 'suggested'].includes(flat.status));
const calm = bt.suggest({ own: own.filter((p) => new Date(p.at).getUTCHours() !== 8), online: null, winners: [], current: ['13:00', '19:00'], tz: 'UTC', now });
assert.equal(calm.status, 'same'); assert.deepEqual(calm.suggested, ['13:00', '19:00']);

// --- 5. competitors' winners are weak evidence: under 5 winners they are ignored
assert.equal(bt.suggest({ own: [], online: null, winners: [{ at: now - DAY }, { at: now - 2 * DAY }], current: ['08:00'], now }).status, 'not_enough_data');
const wins = Array.from({ length: 6 }, (_, i) => ({ at: Date.UTC(2026, 10, 1 + i, 17, 0) }));
const w = bt.suggest({ own: [], online: null, winners: wins, current: ['08:00', '13:00'], tz: 'UTC', now });
assert.equal(w.status, 'suggested'); assert.ok(w.suggested.includes('17:00')); assert.match(w.reasons.join(' '), /weak evidence/); assert.match(w.reasons.join(' '), /Your own results are not used yet/);

// --- 6. from real files: the brand's connection files, the plan, apply with and without the owner's yes
const posts = own.map((p) => ({ id: String(p.at), timestamp: new Date(p.at).toISOString().replace('Z', '+0000'), insights: { views: p.views } }));
write('brand/instagram.json', { pulled_at: new Date(now).toISOString(), media: posts, account_insights: { online: { tz: 'UTC', hours: online }, windows: {} } });
const future = (d) => new Date(now + d * DAY).toISOString().slice(0, 10);
write('brand/plan.md', `# plan\n\n## Week\n\n| Date | Topic | Reel (folder) |\n|---|---|---|\n| ${future(1)} 08:00 | first | free-one |\n| ${future(1)} 13:00 | second | |\n| ${future(2)} 08:00 | third | already-scheduled |\n| ${future(3)} 8:00 | fourth | |\n| 2026-11-10 08:00 | past | old |\n| ${future(4)} 19:00 | fifth | |\n`);
write('reels/free-one/approvals.md', '# Approvals\n\n## Gate C\n\n- ok\n');
write('reels/already-scheduled/approvals.md', '# Approvals\n\n## Posting\n\n- 2026-11-10 09:00 Scheduled on @test for 2026-11-12T08:00:00+00:00: post abc, platforms instagram\n');
write('reels/old/approvals.md', '# Approvals\n');
const ran = bt.run(root, { now });
assert.equal(ran.status, 'suggested'); assert.deepEqual(ran.suggested, ['13:00', '16:00', '19:00']);
assert.ok(fs.existsSync(path.join(root, 'brand', 'best-times.json')));
const before = fs.readFileSync(path.join(root, 'brand', 'plan.md'), 'utf8');
const preview = bt.apply(root, { now });                                  // no yes: shows, writes nothing
assert.equal(preview.changed, false); assert.equal(preview.preview, true);
assert.equal(fs.readFileSync(path.join(root, 'brand', 'plan.md'), 'utf8'), before);
assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'brand', 'brand.json'), 'utf8')).posting.times, ['08:00', '13:00', '19:00']);
assert.deepEqual(preview.rows.map((r) => r.folder).sort(), ['', 'free-one']);     // only 08:00 rows move: the unscheduled reel and the idea row with no reel yet; not already-scheduled, not the past row
const done = bt.apply(root, { yes: true, now });
assert.equal(done.changed, true);
assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'brand', 'brand.json'), 'utf8')).posting.times, ['13:00', '16:00', '19:00']);
const after = fs.readFileSync(path.join(root, 'brand', 'plan.md'), 'utf8');
assert.match(after, new RegExp(`${future(1)} 16:00 \\| first`));          // moved
assert.match(after, new RegExp(`${future(3)} 16:00 \\| fourth`));         // "8:00" written without a zero moves too
assert.match(after, new RegExp(`${future(2)} 08:00 \\| third \\| already-scheduled`));   // a scheduled reel is never moved
assert.match(after, /2026-11-10 08:00 \| past/);                           // a time that has passed is left alone
assert.match(after, new RegExp(`${future(1)} 13:00 \\| second`));          // a time that stays is untouched
assert.match(after, new RegExp(`${future(4)} 19:00 \\| fifth`));
assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'brand', 'best-times.json'), 'utf8')).status, 'applied');
assert.equal(bt.apply(root, { yes: true, now }).changed, false);           // nothing left to apply

// --- 7. autopilot.retime: off, it only suggests; on, it applies, and not twice in a week
brand({ posting: { timezone: 'UTC', times: ['08:00', '13:00', '19:00'] } });
fs.rmSync(path.join(root, 'brand', 'best-times.json'));
const said = [];
let r = bt.retimeStep(root, { autopilot: {} }, (x) => said.push(x), { now });
assert.equal(r.status, 'suggested'); assert.match(said.join('\n'), /a change is suggested \(08:00 to 16:00\)/);
assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'brand', 'brand.json'), 'utf8')).posting.times, ['08:00', '13:00', '19:00']);   // unchanged
r = bt.retimeStep(root, { autopilot: { retime: true } }, (x) => said.push(x), { now });
assert.equal(r.applied, true); assert.match(said.join('\n'), /moved 08:00, 13:00, 19:00 to 13:00, 16:00, 19:00/);
brand({ posting: { timezone: 'UTC', times: ['08:00', '13:00', '19:00'] } });       // set back by hand: it must wait a week
r = bt.retimeStep(root, { autopilot: { retime: true } }, (x) => said.push(x), { now: now + DAY });
assert.notEqual(r.applied, true);

// --- 8. the Planner panel shows it
brand({ posting: { timezone: 'UTC', times: ['08:00', '13:00', '19:00'] } });
bt.run(root, { now });
const model = lib.load(root, { today: '2026-11-11' });
const planner = model.agents.find((a) => /planner/i.test(a.key || a.name));
assert.ok(planner, 'a Planner panel');
assert.match(JSON.stringify(planner.output), /Suggested posting times: 13:00, 16:00, 19:00 \(now 08:00, 13:00, 19:00\)/);

fs.rmSync(root, { recursive: true, force: true });
console.log('best times: OK');
