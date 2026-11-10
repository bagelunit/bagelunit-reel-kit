// Tests for the fixes from the publisher audit: Facebook never posts twice, the saved dry-run mode, the token
// fingerprint, the index that heals itself, uploads that expire, the inbox and forget in pages, links found later,
// cancel against a running cron, constant-time compares, no refresh in dry run, and the 64-bit mp4 length.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { sameSecret, recordMeta, forgetUser } from '../src/worker.js';
import { runDue, healIndex, sweepUploads, takeLease, listPosts, UPLOAD_TTL_S, LEASE_MS } from '../src/publish.js';
import { igToken, threadsToken, refreshTokens, secretHash } from '../src/graph.js';
import { mp4SecondsSync } from '../src/mp4.js';
import { env, ctx, auth, meta, upload, schedule, soon, mp4 } from './helpers.mjs';

const VIDEO = mp4(30);
const LATER = () => Date.now() + 120000;
const idOf = (e) => JSON.parse(e.KV.m.get('posts:index'))[0].id;
const post = (e, id = idOf(e)) => JSON.parse(e.KV.m.get(`post:${id}`));

async function reel(e, { platforms = ['instagram'], options = {}, text } = {}) {
  const v = (await upload(e, VIDEO)).json;
  return schedule(e, { kind: 'reel', media: [{ key: v.key, sha256: v.sha256, role: 'video' }], platforms, text: text || { instagram: 'Save this', facebook: 'Save this on Facebook', threads: 'Save this on Threads' }, at: soon(), options, reel: 'my-reel' });
}
const isFinish = (c) => c.body?.upload_phase === 'finish';
const isStart = (c) => c.body?.upload_phase === 'start';
const timeoutError = () => Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
const json = (b) => new Response(JSON.stringify(b));
const bodyOf = (init) => { try { return JSON.parse(init?.body || 'null'); } catch { return null; } };

// ---------- blocker 1: a Facebook Reel is never posted twice ----------
test('Facebook: the finish answer is lost but Facebook took it: the status is checked, nothing is sent again', async () => {
  const e = env(); await reel(e, { platforms: ['facebook'] });
  const g = meta(); let lose = true;
  const f = async (url, init = {}) => {
    const r = await g(url, init);
    if (lose && bodyOf(init)?.upload_phase === 'finish') { lose = false; throw timeoutError(); }
    return r;
  };
  const t = LATER();
  await runDue(e, f, t);
  let p = post(e);
  assert.equal(p.targets.facebook.phase, 'finish_sent'); assert.equal(p.targets.facebook.status, 'pending');
  assert.match(p.history.map((h) => h.event).join('|'), /passing problem.*did not answer within 25 seconds/);
  await runDue(e, f, t + 300000);                                                         // status check: taken
  await runDue(e, f, t + 600000);                                                         // ready
  p = post(e);
  assert.equal(p.targets.facebook.status, 'published');
  assert.equal(g.find(isStart).length, 1); assert.equal(g.find(isFinish).length, 1);
  assert.equal(g.find((c) => c.host === 'rupload.facebook.com').length, 1);
  assert.ok(p.history.some((h) => /had taken the publish step/.test(h.event)));
  assert.equal(JSON.parse(e.KV.m.get('fb_publishes')).length, 1);
});

test('Facebook: the finish answer is lost and publishing never started: the finish is sent again for the same video', async () => {
  const e = env(); await reel(e, { platforms: ['facebook'] });
  const g = meta(); let lose = true; let checked = false;
  const f = async (url, init = {}) => {
    if (!lose && !checked && url.includes('fields=status')) { checked = true; return json({ status: { video_status: 'processing', publishing_phase: { status: 'not_started' } } }); }
    const r = await g(url, init);
    if (lose && bodyOf(init)?.upload_phase === 'finish') { lose = false; throw timeoutError(); }
    return r;
  };
  const t = LATER();
  await runDue(e, f, t); await runDue(e, f, t + 300000); await runDue(e, f, t + 600000);
  assert.equal(post(e).targets.facebook.status, 'published');
  assert.equal(g.find(isStart).length, 1);                                               // never a new upload session
  const fins = g.find(isFinish);
  assert.equal(fins.length, 2); assert.ok(fins.every((c) => c.body.video_id === 'V1'));
});

test('Facebook: a run cut off after the start is resumed from the saved video_id; a second run meanwhile keeps off', async () => {
  const e = env(); await reel(e, { platforms: ['facebook'] });
  const g = meta(); let hang = true;
  const f = async (url, init = {}) => {
    if (hang && url.includes('rupload.facebook.com')) { hang = false; return new Promise(() => {}); }   // the run dies here
    return g(url, init);
  };
  const t = LATER();
  runDue(e, f, t);                                                                        // never finishes
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(post(e).targets.facebook.video_id, 'V1');                                  // saved right after the start
  assert.equal(post(e).targets.facebook.phase, 'started');
  assert.deepEqual(await runDue(e, f, t + 60000), []);                                    // the first run still holds it
  assert.equal(g.find(isStart).length, 1);
  await runDue(e, f, t + LEASE_MS + 120000);                                              // the lease ran out: carry on
  await runDue(e, f, t + LEASE_MS + 420000);
  assert.equal(post(e).targets.facebook.status, 'published');
  assert.equal(g.find(isStart).length, 1); assert.equal(g.find(isFinish).length, 1);
});

test('Facebook: two runs at the same moment post the reel once', async () => {
  const e = env(); await reel(e, { platforms: ['facebook'] });
  const g = meta(); const t = LATER();
  await Promise.all([runDue(e, g, t), runDue(e, g, t)]);
  assert.equal(g.find(isStart).length, 1); assert.equal(g.find(isFinish).length, 1);
  await Promise.all([runDue(e, g, t + 300000), runDue(e, g, t + 300000)]);
  assert.equal(post(e).targets.facebook.status, 'published');
  assert.equal(g.find(isFinish).length, 1);
});

test('every call to Meta has a time limit; a call that hangs is a passing problem', async () => {
  const e = env(); await reel(e);
  const g = meta();
  await runDue(e, g, LATER());
  assert.ok(g.calls.length && g.calls.every((c) => c.signal === undefined));            // the fake does not keep it...
  const seen = [];
  const f = (url, init = {}) => { seen.push(init.signal); return new Promise((_, no) => init.signal.addEventListener('abort', () => no(init.signal.reason))); };
  const e2 = env({ FETCH_TIMEOUT_MS: '1000' }); await reel(e2);
  const keep = setInterval(() => {}, 100);                                                // the abort timer alone does not hold the test open
  const [r] = await runDue(e2, f, LATER()).finally(() => clearInterval(keep));
  assert.ok(seen[0] instanceof AbortSignal);
  assert.equal(r.targets.instagram, 'pending');
  assert.match(post(e2).history.at(-1).event, /passing problem, will retry \(1\/5\): Meta did not answer within 1 seconds/);
});

// ---------- blocker 2: the mode saved at scheduling time ----------
test('a post scheduled in dry run stays a dry run after the publisher goes live; one scheduled live stops when switched back', async () => {
  const e = env({ PUBLISH_MODE: 'dry_run' });
  const { json: s } = await reel(e, { platforms: ['instagram', 'facebook'] });
  assert.equal(s.mode, 'dry_run');
  e.PUBLISH_MODE = 'live';
  const g = meta();
  const [r] = await runDue(e, g, LATER());
  assert.equal(r.status, 'dry_run'); assert.equal(g.calls.length, 0);
  assert.match(post(e, s.id).history.find((h) => h.platform === 'instagram').event, /scheduled in dry run; schedule a new post to post live/);
  const e2 = env();
  const { json: s2 } = await reel(e2);
  assert.equal(s2.mode, 'live');
  e2.PUBLISH_MODE = 'dry_run';
  const [r2] = await runDue(e2, g, LATER());
  assert.equal(r2.status, 'dry_run'); assert.equal(g.calls.length, 0);
});

// ---------- 3: a new token secret wins over the refreshed one ----------
test('token: the refreshed KV token is used only while the secret it came from is unchanged', async () => {
  const e = env({ IG_TOKEN: 'FIRST_SECRET' });
  await e.KV.put('token', 'REFRESHED'); await e.KV.put('token_src', await secretHash('FIRST_SECRET'));
  assert.equal(await igToken(e), 'REFRESHED');
  e.IG_TOKEN = 'NEW_SECRET';                                                              // setup.mjs secrets sent a new one
  assert.equal(await igToken(e), 'NEW_SECRET');
  const g = meta(); await reel(e);
  await runDue(e, g, LATER());
  assert.equal(g.calls[0].headers.Authorization, 'Bearer NEW_SECRET');
  await refreshTokens(e, g, Date.now());                                                  // the refresh starts from it
  assert.equal(g.find((c) => c.query.grant_type === 'ig_refresh_token')[0].query.access_token, 'NEW_SECRET');
  assert.equal(await igToken(e), 'NEWIG');
  const legacy = env();                                                                   // a KV token from before the fingerprint
  await legacy.KV.put('threads_token', 'OLDKV');
  assert.equal(await threadsToken(legacy), 'OLDKV');
  assert.equal(await legacy.KV.get('threads_token_src'), await secretHash('THTOKEN123'));
  legacy.THREADS_TOKEN = 'RESENT';
  assert.equal(await threadsToken(legacy), 'RESENT');
  assert.ok(![...e.KV.m.values()].some((v) => String(v).includes('NEW_SECRET')));         // only its fingerprint is kept
});

// ---------- 5: the index heals itself ----------
test('index: a post the index lost comes back (hourly run, and GET /admin); parallel schedules all stay listed', async () => {
  const e = env();
  const { json: s } = await reel(e);
  await e.KV.put('posts:index', '[]');                                                    // a parallel write dropped it
  assert.deepEqual(await runDue(e, meta(), LATER(), undefined, { housekeeping: false }), []);
  const [r] = await runDue(e, meta(), LATER(), undefined, { housekeeping: true });
  assert.equal(r.id, s.id); assert.equal(r.status, 'processing');
  await e.KV.put('posts:index', '[]');
  assert.equal((await listPosts(e)).length, 1);
  assert.equal(JSON.parse(await e.KV.get('posts:index'))[0].id, s.id);
  assert.deepEqual(await healIndex(e), { added: 0 });
  const e2 = env();
  const ups = [];
  for (let i = 0; i < 3; i++) ups.push((await upload(e2, mp4(30, { body: `v${i}` }))).json);
  await Promise.all(ups.map((v) => schedule(e2, { kind: 'reel', media: [{ key: v.key, sha256: v.sha256, role: 'video' }], text: { instagram: 'x' }, at: soon() })));
  assert.equal(JSON.parse(await e2.KV.get('posts:index')).length, 3);
});

// ---------- 8: uploads that are never scheduled do not stay ----------
test('uploads: the record expires, the sweep deletes files nothing needs, and keeps a scheduled post\'s files', async () => {
  const e = env();
  const lone = (await upload(e, mp4(30, { body: 'never scheduled' }))).json;
  assert.equal(e.KV.ttl.get(`upload:${lone.key}`), UPLOAD_TTL_S);
  const { json: s } = await reel(e);
  const p = post(e, s.id);
  const key = p.media[0].key;
  assert.equal(e.KV.ttl.get(`upload:${key}`), undefined);                                 // scheduled: no expiry now
  assert.equal(JSON.parse(await e.KV.get(`upload:${key}`)).post, s.id);
  // a day later the lone record is gone; even with the scheduled one's record lost, its post keeps the file
  await e.KV.delete(`upload:${lone.key}`); await e.KV.delete(`upload:${key}`);
  const r = await sweepUploads(e, Date.now() + 2 * 3600e3);
  assert.deepEqual(r.deleted, [lone.key]);
  assert.ok(e.MEDIA.m.has(key));
  // a file younger than an hour is left alone
  const fresh = (await upload(e, mp4(30, { body: 'just now' }))).json;
  await e.KV.delete(`upload:${fresh.key}`);
  assert.deepEqual((await sweepUploads(e, Date.now() + 60000)).deleted, []);
  // DELETE /admin/upload takes back an upload, never a scheduled post's file
  const del = (k) => worker.fetch(new Request(`https://pub.example/admin/upload?key=${encodeURIComponent(k)}`, { method: 'DELETE', headers: auth }), e, ctx);
  const other = (await upload(e, mp4(30, { body: 'refused' }))).json;
  assert.equal((await del(other.key)).status, 200); assert.ok(!e.MEDIA.m.has(other.key));
  await e.KV.put(`upload:${key}`, JSON.stringify({ post: s.id }));
  assert.equal((await del(key)).status, 409); assert.ok(e.MEDIA.m.has(key));
});

// ---------- 4: the inbox and forget stay under the KV limit ----------
test('inbox: thousands of records are read from list metadata, newest first, capped; forget works in pages', async () => {
  const e = env();
  for (let i = 0; i < 2500; i++) {
    const rec = { kind: 'lead', comment_id: `c${i}`, username: i % 2 ? 'fan' : `user${i}`, from_id: i % 2 ? '123' : `9${i}`, text: 'GUIDE '.repeat(60), at: new Date(1700000000000 + i * 1000).toISOString(), rule: 'guide', reply: 'sent', dm: 'sent' };
    await e.KV.put(`lead:c${i}`, JSON.stringify(rec), { metadata: recordMeta(rec) });
  }
  for (let i = 0; i < 300; i++) await e.KV.put(`message:m${i}`, JSON.stringify({ kind: 'message' }), { metadata: { kind: 'message', mid: `m${i}`, from_id: i % 3 ? '555' : '123', to_id: '999', at: new Date(1700000000000 + i).toISOString() } });
  await e.KV.put('lead:old', JSON.stringify({ kind: 'lead', comment_id: 'old', username: 'legacy', at: '2030-01-01T00:00:00.000Z' }));   // no metadata
  e.KV.ops = 0;
  const box = await (await worker.fetch(new Request('https://pub.example/admin/inbox', { headers: auth }), e, ctx)).json();
  assert.ok(e.KV.ops < 1000, `${e.KV.ops} KV operations`);
  assert.equal(box.replies.sent.length, 200); assert.equal(box.more, true);
  assert.equal(box.replies.sent[0].comment_id, 'old');                                    // newest first, old records too
  assert.equal(box.replies.sent[1].comment_id, 'c2499');
  assert.ok(new TextEncoder().encode(JSON.stringify(recordMeta({ text: 'x'.repeat(5000), would_dm: '\u{1F600}'.repeat(900) }))).length <= 1024);
  // forget: every request stays under the limit, the caller asks again until done
  let next = null, removed = 0, calls = 0, ids = [];
  do {
    e.KV.ops = 0;
    const r = await forgetUser(e, 'fan', next);
    assert.ok(e.KV.ops < 1000, `${e.KV.ops} KV operations in one forget call`);
    removed += r.removed; next = r.next; calls++; ids = r.ids || ids;
    if (r.done) break;
  } while (calls < 50);
  assert.ok(calls > 1);
  assert.equal(removed, 1250 + 100);                                                     // their comments and their messages
  assert.deepEqual(ids, ['123']);
  assert.equal([...e.KV.m.keys()].filter((k) => k.startsWith('message:')).length, 200);
});

// ---------- 9: the link is found on a later run ----------
test('Instagram: publish timed out but Meta published: the id and link are found later, the Threads link post follows', async () => {
  const e = env();
  await reel(e, { platforms: ['instagram', 'threads'], options: { threads_mode: 'text' } });
  const g = meta({ igStatus: ['FINISHED', 'PUBLISHED'] }); let lose = true; const t = LATER();
  const f = async (url, init = {}) => {
    const u = new URL(url);
    if (init.method === 'GET' && u.pathname.endsWith('/999/media')) return json({ data: [{ id: 'OLD', caption: 'another post', timestamp: '2020-01-01T00:00:00+0000' }, { id: 'MEDIA1', caption: 'Save this', permalink: 'https://www.instagram.com/reel/ABC123/', timestamp: new Date(t).toISOString().replace('Z', '+0000') }] });
    const r = await g(url, init);
    if (lose && u.pathname.endsWith('/media_publish')) { lose = false; throw timeoutError(); }
    return r;
  };
  await runDue(e, f, t);                       // container
  await runDue(e, f, t + 300000);              // publish: the answer is lost
  assert.equal(post(e).targets.instagram.status, 'processing');
  await runDue(e, f, t + 600000);              // PUBLISHED: id and link found, Threads starts with the link
  const ig = post(e).targets.instagram;
  assert.equal(ig.status, 'published'); assert.equal(ig.media_id, 'MEDIA1'); assert.equal(ig.permalink, 'https://www.instagram.com/reel/ABC123/');
  assert.equal(ig.link_pending, undefined);
  assert.equal(g.find((c) => c.path.endsWith('/media_publish')).length, 1);
  assert.equal(g.find((c) => c.path === '/v1.0/TH1/threads')[0].body.link_attachment, 'https://www.instagram.com/reel/ABC123/');
  assert.equal((await runDue(e, f, t + 900000))[0].status, 'published');
});

test('Instagram: a permalink call that fails is tried again on the next run; the post stays open until then', async () => {
  const e = env(); await reel(e);
  const g = meta(); let fails = 1;
  const f = async (url, init = {}) => {
    if (fails && url.includes('fields=permalink')) { fails--; return new Response(JSON.stringify({ error: { message: 'try later', code: 2 } }), { status: 500 }); }
    return g(url, init);
  };
  const t = LATER();
  await runDue(e, f, t);
  const [r] = await runDue(e, f, t + 300000);
  assert.equal(r.status, 'processing'); assert.equal(post(e).targets.instagram.link_pending, true);
  assert.equal(e.MEDIA.m.size, 1, 'the files stay until the post settles');
  const [r2] = await runDue(e, f, t + 600000);
  assert.equal(r2.status, 'published'); assert.equal(post(e).targets.instagram.permalink, 'https://www.instagram.com/reel/ABC123/');
});

// ---------- 10: a cancel and a running cron ----------
test('cancel: too late while a run holds the post; a cancel that holds it makes the run keep off', async () => {
  const e = env();
  const { json: s } = await reel(e);
  assert.ok(await takeLease(e, s.id, 'run-other', Date.now()));
  const r = await worker.fetch(new Request(`https://pub.example/admin/cancel/${s.id}`, { method: 'POST', headers: auth }), e, ctx);
  assert.equal(r.status, 409); assert.match((await r.json()).error, /too late to cancel: the publisher is posting it right now/);
  await e.KV.delete(`lease:${s.id}`);
  assert.ok(await takeLease(e, s.id, 'cancel-x', LATER()));
  const g = meta();
  assert.deepEqual(await runDue(e, g, LATER()), []); assert.equal(g.calls.length, 0);
  await e.KV.delete(`lease:${s.id}`);
  await runDue(e, g, LATER());                                                            // the container is made
  const late = await worker.fetch(new Request(`https://pub.example/admin/cancel/${s.id}`, { method: 'POST', headers: auth }), e, ctx);
  assert.equal(late.status, 409); assert.match((await late.json()).error, /too late to cancel: the post is processing/);
});

// ---------- 11, 12, 13 ----------
test('the admin key and the verify token are compared in constant time', async () => {
  assert.equal(await sameSecret('abc', 'abc'), true);
  assert.equal(await sameSecret('abd', 'abc'), false);
  assert.equal(await sameSecret('ab', 'abc'), false);
  assert.equal(await sameSecret('', ''), false);
  const e = env({ VERIFY_TOKEN: 'vt' });
  const ok = await worker.fetch(new Request('https://pub.example/webhook?hub.mode=subscribe&hub.verify_token=vt&hub.challenge=42'), e, ctx);
  assert.equal(await ok.text(), '42');
  assert.equal((await worker.fetch(new Request('https://pub.example/webhook?hub.mode=subscribe&hub.verify_token=v&hub.challenge=42'), e, ctx)).status, 403);
  assert.equal((await worker.fetch(new Request('https://pub.example/admin', { headers: { Authorization: 'Bearer admin-key-for-test' } }), e, ctx)).status, 403);
  assert.equal((await worker.fetch(new Request('https://pub.example/admin', { headers: auth }), e, ctx)).status, 200);
});

test('dry run sends nothing to Meta, not even the token refresh', async () => {
  const g = meta();
  assert.deepEqual(await refreshTokens(env({ PUBLISH_MODE: 'dry_run' }), g, Date.now()), {});
  assert.equal(g.calls.length, 0);
  const r = await refreshTokens(env({ PUBLISH_MODE: 'dry_run', MODE: 'live' }), g, Date.now());     // comment replies live
  assert.deepEqual(Object.keys(r), ['token']);
  const r2 = await refreshTokens(env({ PUBLISH_MODE: 'dry_run', PUBLISH_MODE_THREADS: 'live' }), meta(), Date.now());
  assert.deepEqual(Object.keys(r2), ['threads_token']);
});

test('mp4: an all-ones 64-bit length (version 1 header) means the length was not recorded', () => {
  const buf = mp4(30, { v1: true });
  const at = buf.indexOf('mvhd') + 4;
  const read = (b) => (o, l) => b.subarray(o, o + l);
  assert.equal(mp4SecondsSync(read(buf), buf.length), 30);
  buf.fill(0xff, at + 24, at + 32);
  assert.equal(mp4SecondsSync(read(buf), buf.length), null);
});
