// Carousels from a reel folder (scripts/carousel.mjs): the file checks, the approval with its fingerprint, scheduling
// against the real Worker code, posting through a stand-in for Meta, and pull writing under "## Carousel" only.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { carouselFiles, itemProblems, approveCarousel, checkCarousel, scheduleCarousel, jpegSize, lastCarouselApproval } from '../scripts/carousel.mjs';
import { pull } from '../scripts/pull.mjs';
import { runDue } from '../src/publish.js';
import { env, meta, workerFetch } from './helpers.mjs';

const TMP = fs.existsSync('/private/tmp') ? '/private/tmp' : (await import('node:os')).tmpdir();
const ROOT = fs.mkdtempSync(path.join(TMP, 'bagelunit-carousel-test-'));
after(() => fs.rmSync(ROOT, { recursive: true, force: true }));
const future = () => new Date(Date.now() + 3600e3).toISOString().replace('Z', '+00:00');
const quiet = () => {};

// a tiny JPEG: SOI, an APP0 segment, then a baseline frame header (SOF0) with the size, then EOI
function jpeg(width = 1080, height = 1350, tag = 'x') {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 255, width >> 8, width & 255, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof, Buffer.from(tag), Buffer.from([0xff, 0xd9])]);
}

function workspace({ slides = 3, caption = 'Five facts about ice. Save this.', post = true } = {}) {
  const ws = fs.mkdtempSync(path.join(ROOT, 'brand-'));
  fs.mkdirSync(path.join(ws, 'brand'));
  const dir = path.join(ws, 'reels', 'ice', 'out', 'carousel');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(ws, 'brand', 'brand.json'), JSON.stringify({ name: 'Test Brand', slug: 'testbrand', handle: 'testbrand', autopilot: { post }, posting: { timezone: 'America/Toronto' } }));
  fs.writeFileSync(path.join(ws, 'reels', 'ice', 'approvals.md'), '# Approvals\n');
  for (let i = 1; i <= slides; i++) fs.writeFileSync(path.join(dir, `${String(i).padStart(2, '0')}.jpg`), jpeg(1080, 1350, `slide ${i}`));
  if (caption !== null) fs.writeFileSync(path.join(dir, 'caption.txt'), caption);
  const cfg = fs.mkdtempSync(path.join(ROOT, 'cfg-'));
  fs.writeFileSync(path.join(cfg, 'publisher-testbrand.json'), JSON.stringify({ url: 'https://pub.example', admin_key: 'admin-key-for-tests' }));
  return { ws, reel: path.join(ws, 'reels', 'ice'), dir, cfg };
}

test('jpegSize reads the frame header', () => {
  assert.deepEqual(jpegSize(jpeg(1080, 1350)), { width: 1080, height: 1350 });
  assert.equal(jpegSize(Buffer.from('not a jpeg')), null);
});

test('files: posting order by name (10 after 9), the checks on items and caption', () => {
  const { reel, dir } = workspace({ slides: 2 });
  for (const n of ['10', '9']) fs.writeFileSync(path.join(dir, `${n}.jpg`), jpeg());
  assert.deepEqual(carouselFiles(reel).items.map((it) => it.name), ['01.jpg', '02.jpg', '9.jpg', '10.jpg']);
  assert.deepEqual(itemProblems(carouselFiles(reel)), []);
  fs.writeFileSync(path.join(dir, '11.png'), 'png bytes');
  fs.writeFileSync(path.join(dir, '12.jpg'), jpeg(1080, 1920));
  fs.writeFileSync(path.join(dir, '13.jpg'), jpeg(1080, 1080));
  const p = itemProblems(carouselFiles(reel)).join('\n');
  assert.match(p, /11\.png: Instagram's API takes JPEG images and MP4 videos only/);
  assert.match(p, /12\.jpg is 1080x1920; Instagram takes 4:5/);
  assert.match(p, /13\.jpg is a different shape from the first slide/);
  assert.match(itemProblems(carouselFiles(workspace({ slides: 1 }).reel)).join(), /2 to 20 items \(out\/carousel\/ has 1\)/);
  assert.match(itemProblems(carouselFiles(workspace({ caption: null }).reel)).join(), /caption\.txt is missing/);
  assert.match(itemProblems(carouselFiles(workspace({ caption: 'x'.repeat(2201) }).reel)).join(), /2,200/);
});

test('approve records one fingerprint; a changed slide or caption needs approval again', () => {
  const { reel, dir } = workspace();
  assert.match(checkCarousel(reel, { at: future() }).problems.join(), /no "Carousel approved" line/);
  const a = approveCarousel(reel, { log: quiet });
  const text = fs.readFileSync(path.join(reel, 'approvals.md'), 'utf8');
  assert.match(text, /\n## Carousel\n\n- \d{4}-\d\d-\d\d \d\d:\d\d Carousel approved: 3 items \(01\.jpg, 02\.jpg, 03\.jpg\), fingerprint [0-9a-f]{12}\n/);
  assert.equal(lastCarouselApproval(text).fingerprint, a.fingerprint);
  assert.deepEqual(checkCarousel(reel, { at: future() }).problems, []);
  fs.writeFileSync(path.join(dir, 'caption.txt'), 'A different caption.');
  assert.match(checkCarousel(reel, { at: future() }).problems.join(), /changed since it was approved/);
  assert.throws(() => approveCarousel(workspace({ slides: 1 }).reel, { log: quiet }), /Not recorded/);
});

test('time and options are checked', () => {
  const { reel } = workspace();
  approveCarousel(reel, { log: quiet });
  assert.match(checkCarousel(reel, { at: '2026-11-14 12:00' }).problems.join(), /timezone/);
  assert.match(checkCarousel(reel, { at: '2020-01-01T09:00:00-05:00' }).problems.join(), /past/);
  assert.match(checkCarousel(reel, { at: future(), collaborators: 'a,b,c,d' }).problems.join(), /up to 3/);
});

test('schedule: uploads every slide with its SHA-256, a carousel post on Instagram, the line under ## Carousel only', async () => {
  const { reel, cfg } = workspace();
  approveCarousel(reel, { log: quiet });
  const e = env({ PUBLISH_MODE: 'dry_run' });
  const out = [];
  const r = await scheduleCarousel(reel, { at: future() }, { fetchImpl: workerFetch(e), configDir: cfg, confirm: async () => '@testbrand', log: (s) => out.push(s) });
  assert.equal(r.mode, 'dry_run');
  assert.match(out.join('\n'), /About to schedule a carousel on @testbrand/);
  assert.ok(!out.join('\n').includes('admin-key-for-tests'));
  assert.equal(e.MEDIA.m.size, 3);
  const post = JSON.parse(await e.KV.get(`post:${r.id}`));
  assert.equal(post.kind, 'carousel'); assert.deepEqual(post.platforms, ['instagram']);
  assert.equal(post.media.filter((m) => m.role === 'item').length, 3);
  const text = fs.readFileSync(path.join(reel, 'approvals.md'), 'utf8');
  assert.match(text, /- \d{4}-\d\d-\d\d \d\d:\d\d Carousel scheduled on @testbrand for \S+: post [0-9a-f]{12}, 3 items, fingerprint [0-9a-f]{12}, publisher in dry_run mode/);
  assert.ok(!/## Posting/.test(text), 'the reel\'s own Posting record is untouched');
});

test('schedule: the wrong handle uploads nothing; going live needs autopilot.post', async () => {
  const w = workspace();
  approveCarousel(w.reel, { log: quiet });
  const e = env();
  await assert.rejects(scheduleCarousel(w.reel, { at: future() }, { fetchImpl: workerFetch(e), configDir: w.cfg, confirm: async () => '@other', log: quiet }), /Not confirmed/);
  assert.equal(e.MEDIA.m.size, 0);
  const w2 = workspace({ post: false });
  approveCarousel(w2.reel, { log: quiet });
  await assert.rejects(scheduleCarousel(w2.reel, { at: future(), yes: true }, { fetchImpl: workerFetch(env()), configDir: w2.cfg, log: quiet }), /autopilot\.post is not true/);
  const r = await scheduleCarousel(w2.reel, { at: future(), preview: true }, { fetchImpl: workerFetch(env({ PUBLISH_MODE: 'dry_run' })), configDir: w2.cfg, log: quiet });
  assert.equal(r.preview, true);
});

test('live: the carousel goes out as item containers then one CAROUSEL container, and pull writes under ## Carousel', async () => {
  const { ws, reel, cfg } = workspace();
  approveCarousel(reel, { log: quiet });
  const e = env();
  await scheduleCarousel(reel, { at: future(), yes: true }, { fetchImpl: workerFetch(e), configDir: cfg, log: quiet });
  const g = meta(); const t = Date.now() + 2 * 3600e3;
  for (let k = 0; k < 4; k++) await runDue(e, g, t + k * 60000);
  const made = g.find((c) => c.path.endsWith('/999/media') && c.method === 'POST');
  const fields = (c) => c.body || c.query;
  assert.equal(made.filter((c) => String(fields(c).is_carousel_item) === 'true').length, 3);
  assert.equal(made.filter((c) => fields(c).media_type === 'CAROUSEL').length, 1);
  assert.equal(g.find((c) => c.path.endsWith('/999/media_publish')).length, 1);
  await pull({ root: ws, fetchImpl: workerFetch(e), configDir: cfg, log: quiet });
  const text = fs.readFileSync(path.join(reel, 'approvals.md'), 'utf8');
  assert.match(text, /Carousel posted on @testbrand: https:\/\/www\.instagram\.com\//);
  assert.ok(!/## Posting/.test(text), 'a posted carousel does not mark the reel as posted');
});
