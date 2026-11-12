#!/usr/bin/env node
// Checks the dashboard's watch section and the approved-reel previews in a throwaway brand folder: brand/watch.json
// with its own title, an approved and a scheduled reel with a final and a cover, the page's players and card data, the
// preview index, the Wi-Fi server's file lookup and ranges, and the online copy with previews off and on. The reel plays in
// its card (opened from the calendar or anywhere else); the page data carries its local paths.
// Touches nothing outside a temp folder. Run in CI: node setup/test-watch-previews.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const kit = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-previews-test-'));
fs.cpSync(path.join(kit, 'template'), root, { recursive: true });
const K = (f) => pathToFileURL(path.join(root, '.claude', 'skills', 'content-calendar', f)).href;
const lib = await import(K('lib.mjs'));
const cal = await import(K('calendar.mjs'));
const pv = await import(K('previews.mjs'));
const host = await import(K('host.mjs'));
const { loadWatch } = await import(K('watch-model.mjs'));

const day = 864e5, iso = (t) => new Date(t).toISOString().slice(0, 10);
const brandFile = path.join(root, 'brand', 'brand.json');
const brand = JSON.parse(fs.readFileSync(brandFile, 'utf8'));
brand.name = 'Test Bakery'; brand.posting = { ...(brand.posting || {}), timezone: 'UTC', days: ['mon', 'wed', 'fri'], times: ['18:00'] };
fs.writeFileSync(brandFile, JSON.stringify(brand, null, 2));

// a real little mp4 when ffmpeg is here (the online copy needs one), else bytes that stand in for it
const ff = ['ffmpeg', '/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg'].find((c) => { try { return spawnSync(c, ['-version'], { stdio: 'ignore' }).status === 0; } catch { return false; } });
function reel(slug, { schedule } = {}) {
  const dir = path.join(root, 'reels', slug), out = path.join(dir, 'out');
  fs.mkdirSync(out, { recursive: true });
  const video = path.join(out, `${slug}.mp4`);
  if (ff) spawnSync(ff, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=orange:s=1080x1920:d=1', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', '1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', video], { stdio: 'ignore' });
  else fs.writeFileSync(video, crypto.randomBytes(4096));
  fs.writeFileSync(path.join(out, 'cover.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  const sha = crypto.createHash('sha256').update(fs.readFileSync(video)).digest('hex').slice(0, 12);
  const when = new Date(Date.now() + 3 * day).toISOString().replace(/\.\d+Z$/, 'Z');
  fs.writeFileSync(path.join(dir, 'script.txt'), `Hook line for ${slug}\nSecond line.\n`);
  fs.writeFileSync(path.join(dir, 'approvals.md'), `## Gate A\n\n- ${iso(Date.now())} Gate A (script) approved\n\n## Gate B\n\n- ${iso(Date.now())} Gate B approved\n\n## Gate C\n\n### ${iso(Date.now())} 10:00\n- File: ${slug}.mp4 | sha256: ${sha}\n\n## Posting\n\n${schedule ? `- ${iso(Date.now())} 10:05 Scheduled on @test for ${when}: platforms instagram, publisher in live mode\n` : ''}`);
  return video;
}
reel('approved-reel');
reel('scheduled-reel', { schedule: true });

// the watch file, with the brand's own name for the section and the older "platforms" key
fs.writeFileSync(path.join(root, 'brand', 'watch.json'), JSON.stringify({
  title: 'Market watch', group_word: 'supplier', updated: iso(Date.now()),
  platforms: [{ id: 'mill', name: 'The Mill', sources: [{ label: 'News', url: 'https://example.com/news' }, { label: 'Bad', url: 'javascript:alert(1)' }],
    items: [{ date: iso(Date.now() - day), title: 'Flour prices <b>up</b>', url: 'https://example.com/a', status: 'new' }, { date: iso(Date.now() - 60 * day), title: 'Old item', status: 'used' }, { title: '' }] }],
}));
const W = loadWatch(root);
assert.equal(W.title, 'Market watch'); assert.equal(W.words, 'suppliers');
assert.equal(W.groups[0].sources.length, 1, 'a non-https source is dropped');
assert.equal(W.fresh.length, 1); assert.equal(W.counts.items, 2);
assert.equal(loadWatch(path.join(root, 'nowhere')).title, 'News watch');

// the page: the watch section, and each approved reel's final in the card data, with the scheduled one on the calendar
const M = cal.build(root);
assert.deepEqual(M.items.filter((x) => x.preview).map((x) => x.id).sort(), ['approved-reel', 'scheduled-reel']);
const html = fs.readFileSync(path.join(root, 'brand', 'dashboard.html'), 'utf8');
assert.match(html, /<meta name="bu-previews" content="local">/);
assert.match(html, /MARKET WATCH|Market watch/); assert.match(html, /Flour prices &lt;b&gt;up&lt;\/b&gt;/);
assert.ok(!html.includes(root), 'no path on this computer in the page');
const data = JSON.parse(html.match(/<script type="application\/json" id="dash-data">([\s\S]*?)<\/script>/)[1].replace(/\\u003c/g, '<'));
assert.deepEqual(data.items.find((x) => x.id === 'approved-reel').preview, { local: '../reels/approved-reel/out/approved-reel.mp4', poster: '../reels/approved-reel/out/cover.jpg' });
assert.ok(data.entries.some((e) => e.id === 'scheduled-reel' && e.k === 'scheduled'), 'the scheduled reel is on the calendar, and its entry opens the card');
assert.equal(data.items.find((x) => x.id === 'approved-reel').stage, 'c');

// the index and the Wi-Fi server's lookup: listed reels only, nothing outside reels/
const index = pv.readIndex(root);
assert.equal(index['approved-reel'].ready, true);
assert.ok(pv.resolve(root, 'approved-reel.mp4')); assert.ok(pv.resolve(root, 'approved-reel.jpg'));
assert.equal(pv.resolve(root, 'nope.mp4'), null); assert.equal(pv.resolve(root, '..%2F..%2Fbrand%2Fbrand.json.mp4'), null); assert.equal(pv.resolve(root, 'approved-reel.txt'), null);
const served = pv.rewrite(html, 'served');
assert.match(served, /<meta name="bu-previews" content="served"/);
const server = http.createServer((req, res) => { const f = pv.resolve(root, req.url.slice(1)); if (f) return pv.send(req, res, f); res.writeHead(404); res.end(); });
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const get = (p, headers = {}) => new Promise((ok, no) => http.get({ host: '127.0.0.1', port: server.address().port, path: p, headers }, (r) => { const b = []; r.on('data', (c) => b.push(c)); r.on('end', () => ok({ status: r.statusCode, headers: r.headers, body: Buffer.concat(b) })); }).on('error', no));
const size = fs.statSync(index['approved-reel'].video).size;
const whole = await get('/approved-reel.mp4');
assert.equal(whole.status, 200); assert.equal(whole.body.length, size); assert.equal(whole.headers['content-type'], 'video/mp4');
const part = await get('/approved-reel.mp4', { Range: 'bytes=0-99' });
assert.equal(part.status, 206); assert.equal(part.body.length, 100); assert.equal(part.headers['content-range'], `bytes 0-99/${size}`);
assert.equal((await get('/approved-reel.mp4', { Range: `bytes=${size + 10}-` })).status, 416);
assert.equal((await get('/other.mp4')).status, 404);
server.close();

// the online copy: off by default (players say where to watch), on with dashboard.previews_online
let out = host.site(root);
let page = fs.readFileSync(path.join(out, host.pathKey(root), 'index.html'), 'utf8');
assert.match(page, /<meta name="bu-previews" content="online" data-ids="">/); assert.ok(!fs.existsSync(path.join(out, host.pathKey(root), 'preview')));
if (ff) {
  brand.dashboard = { ...(brand.dashboard || {}), previews_online: true };
  fs.writeFileSync(brandFile, JSON.stringify(brand, null, 2));
  out = host.site(root);
  page = fs.readFileSync(path.join(out, host.pathKey(root), 'index.html'), 'utf8');
  assert.match(page, /<meta name="bu-previews" content="online" data-ids="[^"]*approved-reel[^"]*">/);
  assert.ok(fs.statSync(path.join(out, host.pathKey(root), 'preview', 'approved-reel.mp4')).size > 0);
  assert.ok(fs.existsSync(path.join(out, host.pathKey(root), 'preview', 'scheduled-reel.jpg')));
} else console.log('ffmpeg not found: the online preview copy was not checked.');

fs.rmSync(root, { recursive: true, force: true });
console.log('watch section and approved-reel previews: all checks passed');
