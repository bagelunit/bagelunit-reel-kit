import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import { runDue, modeFor } from '../src/publish.js';
import { makeBudget, refreshTokens } from '../src/graph.js';
import { threadsLength, checkText } from '../src/limits.js';
import { env, ctx, auth, meta, upload, schedule, soon, sha, mp4 } from './helpers.mjs';

const VIDEO = mp4(30);
const COVER = Buffer.from('fake jpeg cover bytes');
const LATER = () => Date.now() + 120000;

async function reel(e, { cover = true, platforms = ['instagram'], options = {}, text, video = VIDEO } = {}) {
  const v = (await upload(e, video)).json;
  const media = [{ key: v.key, sha256: v.sha256, role: 'video' }];
  if (cover) { const c = (await upload(e, COVER, { type: 'image' })).json; media.push({ key: c.key, sha256: c.sha256, role: 'cover' }); }
  return schedule(e, { kind: 'reel', media, platforms, text: text || { instagram: 'Save this', facebook: 'Save this on Facebook', threads: 'Save this on Threads' }, at: soon(), options, reel: 'my-reel' });
}
const igCreate = (g) => g.find((c) => c.method === 'POST' && c.path.endsWith('/999/media'));

// ---------- the admin key and uploads ----------
test('admin routes need the key', async () => {
  const r = await worker.fetch(new Request('https://pub.example/admin', {}), env(), ctx);
  assert.equal(r.status, 403);
  const r2 = await worker.fetch(new Request('https://pub.example/admin', { headers: { Authorization: 'Bearer wrong' } }), env(), ctx);
  assert.equal(r2.status, 403);
});

test('upload: a wrong SHA-256 is refused, the right one is stored; images must be JPEG', async () => {
  const e = env();
  assert.equal((await upload(e, VIDEO, { hash: 'a'.repeat(64) })).status, 422);
  assert.equal(e.MEDIA.m.size, 0);
  const ok = await upload(e, VIDEO);
  assert.equal(ok.status, 200); assert.ok(e.MEDIA.m.has(ok.json.key));
  assert.equal((await upload(e, COVER, { type: 'image', name: 'cover.png' })).status, 400);
});

test('schedule: the fingerprint must match the uploaded file', async () => {
  const e = env();
  const v = (await upload(e, VIDEO)).json;
  const r = await schedule(e, { kind: 'reel', media: [{ key: v.key, sha256: 'b'.repeat(64), role: 'video' }], text: { instagram: 'x' }, at: soon() });
  assert.equal(r.status, 400); assert.match(r.json.error, /fingerprint/);
});

test('schedule: time, caption limits, trial, collaborators and platform checks', async () => {
  const e = env();
  const v = (await upload(e, VIDEO)).json;
  const media = [{ key: v.key, sha256: v.sha256, role: 'video' }];
  const s = (x) => schedule(e, { kind: 'reel', media, text: { instagram: 'ok', threads: 'ok', facebook: 'ok' }, at: soon(), ...x });
  assert.match((await s({ at: '2020-01-01T00:00:00Z' })).json.error, /past/);
  assert.match((await s({ at: '2026-12-01 09:00' })).json.error, /timezone/);
  assert.match((await s({ text: { instagram: 'x'.repeat(2201) } })).json.error, /2,200/);
  assert.match((await s({ text: { instagram: Array.from({ length: 31 }, (_, i) => `#t${i}`).join(' ') } })).json.error, /hashtags/);
  assert.match((await s({ platforms: ['threads'], text: { threads: 'x'.repeat(501) } })).json.error, /500/);
  assert.match((await s({ options: { collaborators: ['a'] } })).json.error, /Unified Login/);
  assert.match((await s({ options: { trial: true }, platforms: ['facebook'] })).json.error, /trial/);
  assert.match((await s({ platforms: ['threads'], options: { threads_mode: 'text' } })).json.error, /links to the Instagram post/);
  const noFb = env({ FB_PAGE_TOKEN: undefined }); const v2 = (await upload(noFb, VIDEO)).json;
  assert.match((await schedule(noFb, { kind: 'reel', media: [{ key: v2.key, sha256: v2.sha256, role: 'video' }], platforms: ['facebook'], text: { facebook: 'x' }, at: soon() })).json.error, /not connected/);
  const ok = await s({});
  assert.equal(ok.status, 200); assert.equal(ok.json.mode, 'live');
});

// ---------- Instagram reel, live ----------
test('live reel with cover: container with cover_url -> wait -> limit check -> publish -> permalink -> files deleted', async () => {
  const e = env();
  const { json: s } = await reel(e);
  const g = meta({ igStatus: ['IN_PROGRESS', 'FINISHED'] });
  assert.deepEqual(await runDue(e, g, Date.now()), []);                                // not due yet
  assert.equal((await runDue(e, g, LATER()))[0].status, 'processing');
  const create = igCreate(g)[0];
  assert.equal(create.host, 'graph.instagram.com');
  assert.equal(create.headers.Authorization, 'Bearer IGTOKEN123');
  assert.equal(create.body.media_type, 'REELS'); assert.equal(create.body.caption, 'Save this'); assert.equal(create.body.share_to_feed, true);
  assert.match(create.body.video_url, /^https:\/\/pub\.example\/media\/[0-9a-f]{64}\.mp4$/);
  assert.match(create.body.cover_url, /^https:\/\/pub\.example\/media\/[0-9a-f]{64}\.jpg$/);
  assert.equal(create.body.thumb_offset, undefined);                                     // cover wins
  // Meta can fetch both files while the post is in progress, each at its own secret address
  const vid = await worker.fetch(new Request(create.body.video_url), e, ctx);
  assert.equal(Buffer.from(await vid.arrayBuffer()).toString(), VIDEO.toString());
  const cov = await worker.fetch(new Request(create.body.cover_url), e, ctx);
  assert.equal(cov.headers.get('Content-Type'), 'image/jpeg'); assert.equal(Buffer.from(await cov.arrayBuffer()).toString(), COVER.toString());
  const part = await worker.fetch(new Request(create.body.video_url, { headers: { Range: 'bytes=0-3' } }), e, ctx);
  assert.equal(part.status, 206); assert.deepEqual(Buffer.from(await part.arrayBuffer()), VIDEO.subarray(0, 4));
  assert.equal((await runDue(e, g, LATER() + 60000))[0].status, 'processing');          // IN_PROGRESS
  assert.equal((await runDue(e, g, LATER() + 120000))[0].status, 'published');          // FINISHED -> publish
  assert.ok(g.calls.some((c) => c.path.endsWith('/999/content_publishing_limit')));
  assert.ok(g.calls.some((c) => c.path.endsWith('/999/media_publish') && c.body.creation_id === 'C1'));
  assert.equal(e.MEDIA.m.size, 0);
  assert.equal((await worker.fetch(new Request(create.body.video_url), e, ctx)).status, 404);
  assert.equal((await worker.fetch(new Request(create.body.cover_url), e, ctx)).status, 404);
  const admin = await (await worker.fetch(new Request('https://pub.example/admin', { headers: auth }), e, ctx)).json();
  const post = admin.posts.find((p) => p.id === s.id);
  assert.equal(post.targets.instagram.media_id, 'MEDIA1');
  assert.equal(post.targets.instagram.permalink, 'https://www.instagram.com/reel/ABC123/');
  assert.ok(post.media.every((m) => m.token === undefined && m.key === undefined));      // no secret addresses
  assert.ok(!JSON.stringify(admin).includes('IGTOKEN123'));
});

test('reel without an approved cover falls back to thumb_offset', async () => {
  const e = env();
  await reel(e, { cover: false, options: { thumb_offset: 1500 } });
  const g = meta();
  await runDue(e, g, LATER());
  const body = igCreate(g)[0].body;
  assert.equal(body.cover_url, undefined); assert.equal(body.thumb_offset, 1500);
});

test('trial reel sends trial_params MANUAL and no share_to_feed; options pass through', async () => {
  const e = env({ API_SETUP: 'unified' });
  await reel(e, { options: { trial: true, location_id: '123456', audio_name: 'Original sound', collaborators: ['@friend'], user_tags: ['@someone'] } });
  const g = meta();
  await runDue(e, g, LATER());
  const c = igCreate(g)[0];
  assert.equal(c.host, 'graph.facebook.com');                                            // Unified Login host
  assert.match(c.path, /^\/v27\.0\/999\/media$/);
  assert.deepEqual(c.body.trial_params, { graduation_strategy: 'MANUAL' });
  assert.equal(c.body.share_to_feed, undefined);
  assert.equal(c.body.location_id, '123456'); assert.equal(c.body.audio_name, 'Original sound');
  assert.deepEqual(c.body.collaborators, ['friend']); assert.deepEqual(c.body.user_tags, [{ username: 'someone' }]);
});

test('--story adds a STORIES container for the same video', async () => {
  const e = env();
  await reel(e, { options: { story: true } });
  const g = meta();
  await runDue(e, g, LATER());
  const bodies = igCreate(g).map((c) => c.body);
  assert.ok(bodies.some((b) => b.media_type === 'REELS'));
  const st = bodies.find((b) => b.media_type === 'STORIES');
  assert.ok(st && st.video_url && st.caption === undefined);
});

// ---------- dry run ----------
test('dry run (the default): a due post records what it would send, Meta is never called, files deleted', async () => {
  const e = env({ PUBLISH_MODE: undefined });
  const { json: s } = await reel(e, { platforms: ['instagram', 'facebook', 'threads'] });
  assert.equal(s.mode, 'dry_run');
  const g = meta();
  const [r] = await runDue(e, g, LATER());
  assert.equal(r.status, 'dry_run');
  assert.equal(g.calls.length, 0);
  const admin = await (await worker.fetch(new Request('https://pub.example/admin', { headers: auth }), e, ctx)).json();
  const post = admin.posts[0];
  const ig = post.history.find((h) => h.platform === 'instagram');
  assert.match(ig.would_send.container.video_url, /<secret>/);
  assert.equal(e.MEDIA.m.size, 0);
});

test('modes are per platform: Instagram live, Threads still dry run', async () => {
  const e = env({ PUBLISH_MODE: 'dry_run', PUBLISH_MODE_INSTAGRAM: 'live' });
  assert.equal(modeFor(e, 'instagram'), 'live'); assert.equal(modeFor(e, 'threads'), 'dry_run'); assert.equal(modeFor(e, 'instagram_story'), 'live');
  const { json: s } = await reel(e, { platforms: ['instagram', 'threads'] });
  assert.equal(s.mode, 'mixed');
  const g = meta();
  await runDue(e, g, LATER());
  assert.ok(g.calls.every((c) => c.host !== 'graph.threads.com'));
  assert.ok(igCreate(g).length === 1);
});

// ---------- failures, stale containers, limits ----------
test('container ERROR fails; a container stuck for 30 minutes fails', async () => {
  const e = env(); await reel(e);
  const g = meta({ igStatus: ['ERROR'] }); const t = LATER();
  await runDue(e, g, t);
  assert.equal((await runDue(e, g, t + 60000))[0].status, 'failed');
  const e2 = env(); await reel(e2);
  const g2 = meta({ igStatus: ['IN_PROGRESS'] });
  await runDue(e2, g2, t);
  assert.equal((await runDue(e2, g2, t + 10 * 60000))[0].status, 'processing');
  const [r] = await runDue(e2, g2, t + 31 * 60000);
  assert.equal(r.status, 'failed');
  assert.equal(e2.MEDIA.m.size, 0);
});

test('Instagram 24-hour limit reached: waits instead of publishing', async () => {
  const e = env(); await reel(e);
  const g = meta({ igQuota: 50 }); const t = LATER();
  await runDue(e, g, t);
  assert.equal((await runDue(e, g, t + 60000))[0].status, 'processing');
  assert.ok(!g.calls.some((c) => c.path.endsWith('/media_publish')));
  assert.equal(e.MEDIA.m.size, 2);                                                       // files kept while waiting
});

test('a passing Meta problem is retried, a refusal fails at once; tokens never show in errors', async () => {
  const e = env(); await reel(e);
  const g = meta({ fail: { '/999/media': { code: 4, message: 'rate limit for IGTOKEN123' } } });
  const [r] = await runDue(e, g, LATER());
  assert.equal(r.status, 'processing');
  const e2 = env(); await reel(e2);
  const g2 = meta({ fail: { '/999/media': { code: 100, message: 'bad video IGTOKEN123' } } });
  assert.equal((await runDue(e2, g2, LATER()))[0].status, 'failed');
  const admin = await (await worker.fetch(new Request('https://pub.example/admin', { headers: auth }), e2, ctx)).json();
  assert.ok(!JSON.stringify(admin).includes('IGTOKEN123'));
  assert.match(admin.posts[0].targets.instagram.error, /bad video \*\*\*/);
});

test('cancel removes the files and their addresses; nothing runs after', async () => {
  const e = env();
  const { json: s } = await reel(e);
  const r = await worker.fetch(new Request(`https://pub.example/admin/cancel/${s.id}`, { method: 'POST', headers: auth }), e, ctx);
  const body = await r.json();
  assert.equal(body.status, 'cancelled'); assert.equal(body.reel, 'my-reel'); assert.equal(e.MEDIA.m.size, 0);
  assert.deepEqual(await runDue(e, meta(), LATER()), []);
});

test('max posts per run and the call budget', async () => {
  const e = env({ MAX_PER_RUN: '2' });
  for (let i = 0; i < 3; i++) await reel(e);
  assert.equal((await runDue(e, meta(), LATER())).length, 2);
  const e2 = env(); await reel(e2);
  const budget = makeBudget(0);
  const [r] = await runDue(e2, meta(), LATER(), budget);
  assert.equal(r.targets.instagram, 'pending');                                          // carried on next run, not failed
});

// ---------- carousels, images, stories ----------
test('carousel: item containers, then CAROUSEL with children, then publish', async () => {
  const e = env();
  const items = [];
  for (const [buf, type] of [[Buffer.from('img1'), 'image'], [mp4(20, { body: 'vid1' }), 'video'], [Buffer.from('img2'), 'image']]) {
    const u = (await upload(e, buf, { type, name: type === 'video' ? 'v.mp4' : 'i.jpg' })).json;
    items.push({ key: u.key, sha256: u.sha256, role: 'item' });
  }
  assert.equal((await schedule(e, { kind: 'carousel', media: items.slice(0, 1), text: { instagram: 'x' }, at: soon() })).status, 400);   // needs 2+
  const { status } = await schedule(e, { kind: 'carousel', media: items, text: { instagram: 'Three things' }, at: soon(), options: { location_id: '77' } });
  assert.equal(status, 200);
  const g = meta(); const t = LATER();
  await runDue(e, g, t);
  const kids = igCreate(g).map((c) => c.body);
  assert.equal(kids.length, 3);
  assert.ok(kids.every((k) => k.is_carousel_item === true));
  assert.equal(kids[1].media_type, 'VIDEO'); assert.ok(kids[1].video_url); assert.ok(kids[0].image_url);
  await runDue(e, g, t + 60000);
  const parent = igCreate(g).at(-1).body;
  assert.equal(parent.media_type, 'CAROUSEL'); assert.equal(parent.children, 'C1,C2,C3'); assert.equal(parent.caption, 'Three things'); assert.equal(parent.location_id, '77');
  assert.equal((await runDue(e, g, t + 120000))[0].status, 'published');
});

test('single image and image story', async () => {
  const e = env();
  const u = (await upload(e, Buffer.from('jpg'), { type: 'image', name: 'p.jpg' })).json;
  await schedule(e, { kind: 'image', media: [{ key: u.key, sha256: u.sha256 }], text: { instagram: 'A photo' }, at: soon(), options: { user_tags: ['pal'] } });
  const u2 = (await upload(e, Buffer.from('jpg2'), { type: 'image', name: 's.jpg' })).json;
  await schedule(e, { kind: 'story', media: [{ key: u2.key, sha256: u2.sha256 }], at: soon() });
  const g = meta();
  await runDue(e, g, LATER());
  const [img, story] = igCreate(g).map((c) => c.body);
  assert.ok(img.image_url && img.caption === 'A photo' && !img.media_type);
  assert.deepEqual(img.user_tags, [{ username: 'pal', x: 0.5, y: 0.5 }]);
  assert.equal(story.media_type, 'STORIES'); assert.ok(story.image_url); assert.equal(story.caption, undefined);
});

// ---------- Facebook ----------
test('Facebook Reel: start -> upload by file_url -> finish with description -> ready -> permalink', async () => {
  const e = env();
  await reel(e, { platforms: ['facebook'] });
  const g = meta({ fbStatus: ['processing', 'ready'] }); const t = LATER();
  await runDue(e, g, t);
  const start = g.find((c) => c.path === '/v27.0/PAGE1/video_reels' && c.body.upload_phase === 'start');
  assert.equal(start.length, 1); assert.equal(start[0].headers.Authorization, 'Bearer FBTOKEN123');
  const up = g.find((c) => c.host === 'rupload.facebook.com')[0];
  assert.equal(up.path, '/video-upload/v27.0/V1'); assert.equal(up.headers.Authorization, 'OAuth FBTOKEN123');
  assert.match(up.headers.file_url, /^https:\/\/pub\.example\/media\/[0-9a-f]{64}\.mp4$/);
  const fin = g.find((c) => c.body?.upload_phase === 'finish')[0].body;
  assert.deepEqual(fin, { upload_phase: 'finish', video_id: 'V1', video_state: 'PUBLISHED', description: 'Save this on Facebook' });
  // the video must stay reachable while Facebook processes it
  assert.equal((await worker.fetch(new Request(up.headers.file_url), e, ctx)).status, 200);
  const robots = await (await worker.fetch(new Request('https://pub.example/robots.txt'), e, ctx)).text();
  assert.match(robots, /Allow: \/media\//);
  await runDue(e, g, t + 60000);                       // processing
  const [r] = await runDue(e, g, t + 120000);          // ready
  assert.equal(r.status, 'published');
  const p = JSON.parse(e.KV.m.get(`post:${JSON.parse(e.KV.m.get('posts:index'))[0].id}`));
  assert.equal(p.targets.facebook.permalink, 'https://www.facebook.com/reel/V1');
  assert.equal(g.find((c) => c.query.fields === 'permalink_url').length, 1);              // the link in its own call
  assert.equal(g.find((c) => /permalink/.test(c.query.fields || '') && /status/.test(c.query.fields || '')).length, 0);
  // the approved cover went up as the Facebook cover, as a file (multipart), once
  const th = g.find((c) => c.path === '/v27.0/V1/thumbnails');
  assert.equal(th.length, 1); assert.equal(th[0].method, 'POST'); assert.equal(th[0].headers.Authorization, 'Bearer FBTOKEN123');
  assert.equal(th[0].body.is_preferred, 'true');
  assert.deepEqual(th[0].body.source, { file: 'cover.jpg', size: COVER.length, type: 'image/jpeg' });
  assert.equal(p.targets.facebook.cover, 'set');
  assert.ok(p.history.some((h) => h.event === 'cover set'));
});

test('Facebook: no approved cover means no thumbnails call', async () => {
  const e = env();
  await reel(e, { platforms: ['facebook'], cover: false });
  const g = meta();
  await runDue(e, g, LATER());
  const [r] = await runDue(e, g, LATER() + 60000);
  assert.equal(r.status, 'published');
  assert.equal(g.find((c) => c.path.endsWith('/thumbnails')).length, 0);
});

test('Facebook: a refused cover or link never fails a reel that is up', async () => {
  const e = env();
  await reel(e, { platforms: ['facebook'] });
  const g = meta({ fail: { '/thumbnails': { message: 'Invalid image', code: 100 }, 'fields=permalink_url': { message: 'nonexisting field (permalink_url)', code: 100 } } });
  await runDue(e, g, LATER());
  const [r] = await runDue(e, g, LATER() + 60000);
  assert.equal(r.status, 'published');
  const p = JSON.parse(e.KV.m.get(`post:${JSON.parse(e.KV.m.get('posts:index'))[0].id}`));
  const t = p.targets.facebook;
  assert.equal(t.status, 'published'); assert.equal(t.cover, 'not set'); assert.match(t.cover_error, /Invalid image/);
  assert.equal(t.permalink, 'https://www.facebook.com/reel/V1');                         // the fallback link
  assert.ok(p.history.some((h) => /cover not set, Facebook shows its own frame/.test(h.event)));
  assert.equal(g.find((c) => c.path.endsWith('/thumbnails')).length, 1);                 // tried once, not every run
});

test('Facebook dry run records the cover it would set', async () => {
  const e = env({ PUBLISH_MODE: 'dry_run' });
  await reel(e, { platforms: ['facebook'] });
  await runDue(e, meta(), LATER());
  const p = JSON.parse(e.KV.m.get(`post:${JSON.parse(e.KV.m.get('posts:index'))[0].id}`));
  const w = p.history.find((h) => h.platform === 'facebook').would_send;
  assert.equal(w.cover.thumbnails.is_preferred, true); assert.match(w.cover.thumbnails.source, /\/media\/<secret>\.jpg$/);
});

// ---------- video length and cover size ----------
test('the Worker reads the video length and refuses what a platform would refuse', async () => {
  const e = env();
  const err = async (o) => (await reel(e, o)).json.error;
  assert.match(await err({ platforms: ['facebook'], video: mp4(120) }), /is 120 seconds; a Facebook Reel must be 3 to 90 seconds/);
  assert.equal((await reel(e, { platforms: ['instagram'], video: mp4(120) })).status, 200);       // 2 minutes is fine on Instagram
  assert.match(await err({ options: { story: true }, video: mp4(75) }), /an Instagram story must be 3 to 60 seconds/);
  assert.match(await err({ video: mp4(2) }), /is 2 seconds; an Instagram reel must be 3 seconds to 15 minutes/);
  assert.match(await err({ video: mp4(16 * 60) }), /an Instagram reel must be 3 seconds to 15 minutes/);
  assert.match(await err({ platforms: ['threads'], video: mp4(400) }), /a Threads video must be up to 5 minutes/);
  // a Threads text post only links to the reel, so the video's length does not matter there
  assert.equal((await reel(e, { platforms: ['instagram', 'threads'], options: { threads_mode: 'text' }, video: mp4(400) })).status, 200);
  assert.match(await err({ platforms: ['facebook'], video: mp4(90.03) }), /is 90.03 seconds/);     // never rounded down to 90
  assert.equal((await reel(e, { platforms: ['facebook'], video: mp4(90) })).status, 200);
  assert.match(await err({ video: Buffer.from('not an mp4 at all') }), /could not read how long/);
  // moov after the media, and the 64-bit header, are read too
  assert.equal((await reel(e, { platforms: ['facebook'], video: mp4(45, { moovLast: true, v1: true }) })).status, 200);
  assert.match(await err({ platforms: ['facebook'], video: mp4(95, { moovLast: true }) }), /95 seconds/);
});

test('a cover over 8 MB is refused', async () => {
  const e = env();
  const v = (await upload(e, VIDEO)).json;
  const c = (await upload(e, Buffer.alloc(8 * 1024 * 1024 + 1, 1), { type: 'image' })).json;
  const r = await schedule(e, { kind: 'reel', media: [{ key: v.key, sha256: v.sha256, role: 'video' }, { key: c.key, sha256: c.sha256, role: 'cover' }], text: { instagram: 'ok' }, at: soon() });
  assert.equal(r.status, 400); assert.match(r.json.error, /over 8 MB/);
});

test('Facebook: 30 reels in 24 hours means wait', async () => {
  const e = env();
  await e.KV.put('fb_publishes', JSON.stringify(Array.from({ length: 30 }, () => Date.now())));
  await reel(e, { platforms: ['facebook'] });
  const g = meta();
  const [r] = await runDue(e, g, LATER());
  assert.equal(r.targets.facebook, 'pending'); assert.equal(g.calls.length, 0);
});

// ---------- Threads ----------
test('Threads video: VIDEO container with video_url and text, then publish with the limit check', async () => {
  const e = env();
  await reel(e, { platforms: ['threads'] });
  const g = meta(); const t = LATER();
  await runDue(e, g, t);
  const c = g.find((x) => x.path === '/v1.0/TH1/threads')[0];
  assert.equal(c.host, 'graph.threads.com');
  assert.equal(c.body.media_type, 'VIDEO'); assert.equal(c.body.text, 'Save this on Threads'); assert.match(c.body.video_url, /\/media\/[0-9a-f]{64}\.mp4$/);
  assert.equal(c.body.access_token, 'THTOKEN123');
  const [r] = await runDue(e, g, t + 60000);
  assert.equal(r.status, 'published');
  assert.ok(g.calls.some((x) => x.path === '/v1.0/TH1/threads_publishing_limit'));
  assert.ok(g.calls.some((x) => x.path === '/v1.0/TH1/threads_publish' && x.body.creation_id === 'T1'));
});

test('Threads text: waits for the Instagram link, then a TEXT post with link_attachment', async () => {
  const e = env();
  await reel(e, { platforms: ['instagram', 'threads'], options: { threads_mode: 'text' } });
  const g = meta({ igStatus: ['IN_PROGRESS', 'FINISHED'] }); const t = LATER();
  await runDue(e, g, t);
  assert.equal(g.find((x) => x.path === '/v1.0/TH1/threads').length, 0);                // no link yet
  await runDue(e, g, t + 60000);
  await runDue(e, g, t + 120000);                                                        // Instagram publishes, then Threads starts
  const c = g.find((x) => x.path === '/v1.0/TH1/threads')[0];
  assert.equal(c.body.media_type, 'TEXT'); assert.equal(c.body.link_attachment, 'https://www.instagram.com/reel/ABC123/');
  assert.equal((await runDue(e, g, t + 180000))[0].status, 'published');
});

test('Threads limit reached: waits', async () => {
  const e = env(); await reel(e, { platforms: ['threads'] });
  const g = meta({ thQuota: 250 }); const t = LATER();
  await runDue(e, g, t);
  assert.equal((await runDue(e, g, t + 60000))[0].status, 'processing');
  assert.ok(!g.calls.some((x) => x.path.endsWith('/threads_publish')));
});

test('Threads counts emojis as their bytes', () => {
  assert.equal(threadsLength('abc'), 3);
  assert.equal(threadsLength('\u{1F600}'), 4);
  assert.deepEqual(checkText('threads', 'a'.repeat(498) + '\u{1F600}').length, 1);
});

// ---------- token refresh ----------
test('token refresh: Instagram Login and Threads refresh weekly; Unified Login is skipped', async () => {
  const e = env();
  const g = meta();
  const r = await refreshTokens(e, g, Date.now());
  assert.ok(r.token.ok && r.threads_token.ok);
  assert.equal(await e.KV.get('token'), 'NEWIG'); assert.equal(await e.KV.get('threads_token'), 'NEWTHREADS');
  assert.ok(g.calls.some((c) => c.query.grant_type === 'ig_refresh_token'));
  assert.ok(g.calls.some((c) => c.query.grant_type === 'th_refresh_token'));
  assert.deepEqual(await refreshTokens(e, g, Date.now() + 3600e3), {});                  // not due again for a week
  const u = env({ API_SETUP: 'unified', THREADS_USER_ID: undefined });
  assert.deepEqual(await refreshTokens(u, meta(), Date.now()), {});
});
