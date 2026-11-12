#!/usr/bin/env node
// Checks the hashtag evidence (hashtags.mjs): tags are read from captions, own posts are compared with the brand's own median, other
// accounts' posts with their own account's median, a tag needs 3 posts from 2 accounts to be ranked, thin tags are listed apart, posts
// with no views are left out, and brand/hashtags.md is written. Also that the publisher refuses a sixth Instagram hashtag. No network.
// Run in CI: node setup/test-hashtags.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';

const kit = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const H = await import(pathToFileURL(path.join(kit, 'template', '.claude', 'skills', 'content-calendar', 'hashtags.mjs')).href);
const { checkText, LIMITS } = await import(pathToFileURL(path.join(kit, 'template', 'publisher', 'src', 'limits.js')).href);

// tags: lowercase, de-duplicated, letters needed, numbers alone ignored, punctuation stops a tag
assert.deepEqual(H.tagsOf('Hello #AI #ai #Claude_Code, and #2026 #123 #n8n.'), ['ai', 'claude_code', 'n8n']);
assert.deepEqual(H.tagsOf(''), []); assert.deepEqual(H.tagsOf(null), []);
// csv with quotes, commas and a newline inside a cell
assert.deepEqual(H.parseCsv('url,views,caption\nu1,10,"a, b ""q"" #x"\nu2,,"line1\nline2 #y"\n'), [{ url: 'u1', views: '10', caption: 'a, b "q" #x' }, { url: 'u2', views: '', caption: 'line1\nline2 #y' }]);

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hashtags-test-')));
const root = path.join(tmp, 'b-reels');
fs.mkdirSync(path.join(root, 'brand', 'research'), { recursive: true });
fs.writeFileSync(path.join(root, 'brand', 'brand.json'), '{"name":"B","slug":"b","niche":{"tags":["alpha","#gamma"]}}');
const media = [
  { caption: 'one #alpha #beta', insights: { views: 100 } }, { caption: 'two #alpha', insights: { views: 300 } },
  { caption: 'three #beta', insights: { views: 100 } }, { caption: 'four', insights: { views: 100 } }, { caption: 'no views #alpha', insights: {} },
];
fs.writeFileSync(path.join(root, 'brand', 'instagram.json'), JSON.stringify({ media }));
// two accounts, 6 posts each, median 100; #hot is on 3 posts that did 400 (4x) in both accounts; #solo only ever on one account; #thin on 2 posts
const row = (v, c) => `u,2026-11-01,${v},1,1,"${c}",REELS`;
const acct = (rows) => 'url,timestamp,views,likes,comments,caption,type\n' + rows.join('\n') + '\n';
fs.writeFileSync(path.join(root, 'brand', 'research', 'acc_a.csv'), acct([row(400, 'x #hot #flat'), row(400, 'x #hot'), row(100, 'x #flat'), row(100, 'y #flat'), row(100, 'z'), row(90, 'w #solo'), row(110, 'v #solo'), row(100, 'u #solo')]));
fs.writeFileSync(path.join(root, 'brand', 'research', 'acc_b.csv'), acct([row(400, 'x #hot #thin'), row(100, 'x #flat'), row(100, 'y'), row(100, 'z #thin'), row(100, 'w'), row(100, 'v')]));
fs.writeFileSync(path.join(root, 'brand', 'research', 'tiny.csv'), acct([row(9999, 'x #hot'), row(1, 'y')]));         // fewer than 5 posts: not used
fs.writeFileSync(path.join(root, 'brand', 'research', 'hashtag-ai.csv'), 'url,timestamp,views,likes,comments,caption,type\nu,2026-11-01,,5,0,"#ai #hot",VIDEO\n');   // no views: not used
fs.writeFileSync(path.join(root, 'brand', 'research', 'history.csv'), 'date,account,followers\n');

const a = H.run(root);
assert.equal(a.ownPosts, 4); assert.equal(a.ownMedian, 100);
const own = Object.fromEntries(a.ownRows.map((r) => [r.tag, r]));
assert.equal(own.alpha.posts, 2); assert.equal(own.alpha.median, 200); assert.equal(own.alpha.lift, 2);   // the post with no views is left out
assert.equal(own.beta.posts, 2); assert.equal(own.beta.lift, 1);
assert.equal(a.accountsRead, 3); assert.equal(a.theirPosts, 14);                                          // the tiny account is counted as read but adds no posts
const ranked = Object.fromEntries(a.ranked.map((r) => [r.tag, r]));
assert.equal(ranked.hot.posts, 3); assert.equal(ranked.hot.accounts, 2); assert.equal(ranked.hot.lift, 4);   // 3 posts from 2 accounts, 4x each
assert.ok(ranked.flat && ranked.flat.lift === 1);
assert.ok(!ranked.solo, 'one account only is not enough');
assert.ok(!ranked.thin, '2 posts is not enough');
assert.deepEqual(a.ranked.map((r) => r.tag)[0], 'hot');
assert.ok(a.thin.some((r) => r.tag === 'solo') && a.thin.some((r) => r.tag === 'thin'));

const md = fs.readFileSync(path.join(root, 'brand', 'hashtags.md'), 'utf8');
assert.match(md, /Instagram allows 5 hashtags/); assert.match(md, /\| #hot \| 3 \| 2 \| 4x \|/); assert.match(md, /\| #alpha \| 2 \| 200 \| 2x \|/);
assert.match(md, /Steady tags from the brand's niche setup \(brand.json -> niche\): #alpha #gamma/);
assert.match(md, /Too few to say/); assert.match(md, /not that a tag caused it/);

// an empty brand says so plainly instead of failing
const empty = path.join(tmp, 'e-reels'); fs.mkdirSync(path.join(empty, 'brand'), { recursive: true }); fs.writeFileSync(path.join(empty, 'brand', 'brand.json'), '{}');
H.run(empty);
assert.match(fs.readFileSync(path.join(empty, 'brand', 'hashtags.md'), 'utf8'), /No own posts with views yet/);
assert.match(fs.readFileSync(path.join(empty, 'brand', 'hashtags.md'), 'utf8'), /No steady tags set yet: \/caption-and-hashtags asks/);

// the publisher holds to 5 hashtags in an Instagram caption
assert.equal(LIMITS.instagram.hashtags, 5);
assert.deepEqual(checkText('instagram', 'Hello #a #b #c #d #e'), []);
assert.match(checkText('instagram', 'Hello #a #b #c #d #e #f')[0], /has 6 hashtags; Instagram allows 5 in a caption/);
assert.deepEqual(checkText('threads', 'Hello #a #b #c #d #e #f #g'), []);                              // the cap is Instagram's

fs.rmSync(tmp, { recursive: true, force: true });
console.log('hashtags ok');
