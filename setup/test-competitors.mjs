#!/usr/bin/env node
// Checks the competitor tracking end to end in a throwaway brand folder, with a fake Meta connection:
// add and validate handles, read through Meta, fall back to a file import, the 3x rule, the history line, the model
// and the dashboard section. Touches nothing outside a temp folder. Run in CI: node setup/test-competitors.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';

const kit = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'competitors-test-'));
fs.cpSync(path.join(kit, 'template'), root, { recursive: true });
const K = (f) => pathToFileURL(path.join(root, '.claude', 'skills', 'content-calendar', f)).href;
const c = await import(K('competitors.mjs'));
const m = await import(K('competitors-model.mjs'));
const lib = await import(K('lib.mjs'));
const page = await import(K('calendar.mjs'));

const r = c.add(root, ['@rival_one', 'https://instagram.com/rival_two/', 'bad name!', 'rival_one'], 'niche');
assert.deepEqual(r.added, ['rival_one', 'rival_two']);
assert.equal(r.skipped.length, 2);
assert.throws(() => c.add(root, ['x'], 'bogus'));

const day = 864e5, now = Date.now();
const views = [1000, 1100, 900, 5200, 1000, 950, 1050, 3100, 1000, 980];
const fake = { login: 'unified', me: '1', get: async (_m, { fields }) => {
  const user = /username\((.+?)\)/.exec(fields)[1];
  return { business_discovery: { username: user, followers_count: 20000, media_count: 200, media: { data: views.map((v, i) => ({
    permalink: `https://www.instagram.com/p/${i}/`, timestamp: new Date(now - i * 2 * day).toISOString(), view_count: v, like_count: 10, comments_count: 2, media_product_type: 'REELS',
    caption: i === 3 ? '5 mistakes killing your reach' : i === 7 ? 'Stop posting at noon' : `Plain caption ${i}` })) } } };
} };
const a = await c.syncOne(root, 'rival_one', { api: fake });
assert.equal(a.source, 'meta'); assert.equal(a.median, 1000);
const b = await c.syncOne(root, 'rival_two', { api: { login: 'instagram' } });          // Instagram Login cannot read others
assert.equal(b.source, null); assert.match(b.error, /Instagram Login/);

fs.writeFileSync(path.join(root, 'exp.csv'), 'Date,Views,Caption\n' + [1000, 1100, 900, 5200, 1000, 950].map((v, i) => `2026-11-0${i + 1},${v},hello ${i}`).join('\n'));
const imp = c.importFile(root, 'rival_two', path.join(root, 'exp.csv'));
assert.equal(imp.posts, 6); assert.ok(imp.hasViews);
fs.writeFileSync(path.join(root, 'exp.json'), JSON.stringify([{ ownerUsername: 'x', videoPlayCount: 7, timestamp: '2026-11-01T00:00:00Z', caption: 'c', url: 'u', ownerFollowersCount: 55 }]));
assert.equal(c.importFile(root, 'third_acct', path.join(root, 'exp.json')).posts, 1);   // a scraper export, and the account joins the list
assert.ok(lib.read(path.join(root, 'brand', 'research', 'history.csv')).includes('rival_one'));
assert.equal(c.due(root, 7), false);
assert.equal(c.due(root, 7, now + 10 * day), true);

assert.equal(m.hookShape('5 mistakes killing your reach'), 'number or list');
assert.equal(m.hookShape('Stop posting at noon'), 'contrarian');
assert.equal(m.hookShape('Why do reels flop?'), 'question');

const rank = m.rankPosts([{ timestamp: '2026-11-01', views: '1000' }, ...[2, 3, 4, 5, 6].map((d) => ({ timestamp: `2026-10-0${d}`, views: '1000' })), { timestamp: '2026-11-02', views: '5000' }]);
assert.equal(rank.posts[0].tier, 'STUDY');
assert.equal(m.rankPosts([{ timestamp: '2026-11-01', views: '5' }]).posts[0].tier, null);   // under 5 posts: no median, no ranking

const M = lib.load(root);
assert.equal(M.competitors.accounts.length, 3);
assert.ok(M.competitors.outliers.some((o) => o.handle === 'rival_one' && o.tier === 'STUDY'));
assert.ok(M.setup.find((x) => x.key === 'competitors').done);
page.build(root);
const html = fs.readFileSync(path.join(root, 'brand', 'dashboard.html'), 'utf8');
assert.ok(html.includes('id="competitors"') && html.includes('@rival_one'));
fs.writeFileSync(path.join(root, 'brand', 'ideas.md'), '| Date | Idea | Hook | Based on | Goal | Angle | Status |\n|---|---|---|---|---|---|---|\n| 2026-11-10 | A | h | @rival_one | saves | list | suggested |\n');
assert.equal(lib.load(root).competitors.ideas[0].status, 'suggested');
// the winners list is recent posts only: rival_one's 5.2x post is 6 days old, its 3.1x post is 14 days old
const W = lib.load(root).competitors;
assert.equal(W.windowDays, 7);
assert.ok(W.outliers.every((o) => o.at > now - 7 * day), 'only posts from the last 7 days');
assert.ok(W.outliers.some((o) => o.handle === 'rival_one' && o.ratio > 5) && !W.outliers.some((o) => Math.abs(o.ratio - 3.1) < 0.01), 'the 14-day-old 3.1x post is left out');
assert.ok(W.olderWinners >= 1);
const bj = path.join(root, 'brand', 'brand.json');
fs.writeFileSync(bj, JSON.stringify({ ...JSON.parse(fs.readFileSync(bj, 'utf8')), dashboard: { competitors_days: 30 } }));
assert.ok(lib.load(root).competitors.outliers.some((o) => Math.abs(o.ratio - 3.1) < 0.01), 'competitors_days widens the window');
// patterns look back further than the winners list, and say so
assert.equal(W.patterns.windowDays, 90);
// a removed account stays removed, even with its saved file still in brand/research
c.remove(root, 'third_acct');
assert.equal(lib.load(root).competitors.configured, 2);
assert.ok(!lib.load(root).competitors.accounts.some((a) => a.handle === 'third_acct'), 'removed account does not come back as Other');
c.add(root, ['third_acct'], 'adjacent');
assert.ok(lib.load(root).competitors.accounts.some((a) => a.handle === 'third_acct' && a.tag === 'adjacent'), 'adding it again brings it back');
fs.rmSync(root, { recursive: true, force: true });
console.log('competitors: OK');
