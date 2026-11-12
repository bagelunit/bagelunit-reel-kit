import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import { runDue } from '../src/publish.js';
import { checkText, checkLength, youtubeParts } from '../src/limits.js';
import { chunkPlan, TT_CHUNK } from '../src/tiktok.js';
import { env as baseEnv, ctx, auth, meta, upload, schedule, soon, mp4 } from './helpers.mjs';

const VIDEO = mp4(30);
const LATER = () => Date.now() + 120000;
const env = (x = {}) => baseEnv({
  YT_CLIENT_ID: 'ytclient', YT_CLIENT_SECRET: 'ytsecret123', YT_REFRESH_TOKEN: 'ytrefresh123',
  TIKTOK_CLIENT_KEY: 'ttkey', TIKTOK_CLIENT_SECRET: 'ttsecret123', TIKTOK_REFRESH_TOKEN: 'ttrefresh123', ...x,
});

// A stand-in for Google and TikTok. Every call is written down; a PUT's body is read so its bytes are counted.
function fake(opts = {}) {
  const calls = []; const counters = {};
  const next = (name, list) => { counters[name] = (counters[name] ?? -1) + 1; return list[Math.min(counters[name], list.length - 1)]; };
  const json = (b, status = 200, headers = {}) => new Response(JSON.stringify(b), { status, headers });
  const ttOk = (data) => json({ data, error: { code: 'ok', message: '', log_id: 'L' } });
  const f = async (url, init = {}) => {
    const u = new URL(url); const method = init.method || 'GET';
    let body = null; let bytes = null;
    if (typeof init.body === 'string') { try { body = JSON.parse(init.body); } catch { body = Object.fromEntries(new URLSearchParams(init.body)); } }
    else if (init.body) bytes = Buffer.from(await new Response(init.body).arrayBuffer());
    calls.push({ url, host: u.host, path: u.pathname, method, body, bytes, headers: init.headers || {} });
    // Google / YouTube
    if (u.host === 'oauth2.googleapis.com') return opts.googleRefuses ? json({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }, 400) : json({ access_token: 'YTACCESS1', expires_in: 3600 });
    if (u.host === 'www.googleapis.com' && u.pathname === '/upload/youtube/v3/videos') {
      if (opts.ytFail) return json({ error: { code: 403, message: 'quota used up', errors: [{ reason: opts.ytFail }] } }, 403);
      return new Response('{}', { status: 200, headers: { location: 'https://upload.example/yt-session?upload_id=SECRETSESSION' } });
    }
    if (u.host === 'upload.example') {
      if (/^bytes \*\//.test(init.headers['Content-Range'] || '')) {
        const q = opts.ytQuery || { received: 0 };
        if (q === 'complete') return json({ id: 'YTVID1' });
        if (q === 'forgot') return json({ error: { code: 404, message: 'gone' } }, 404);
        return new Response('', { status: 308, headers: q.received ? { range: `bytes=0-${q.received - 1}` } : {} });
      }
      if (opts.ytLoseFirst && !counters.lost) { counters.lost = 1; const e = new Error('slow'); e.name = 'TimeoutError'; throw e; }
      return json({ id: 'YTVID1', status: { privacyStatus: 'public', uploadStatus: 'uploaded' } });
    }
    // TikTok
    if (u.host === 'open.tiktokapis.com') {
      const p = u.pathname;
      if (p === '/v2/oauth/token/') return json({ access_token: 'TTACCESS1', expires_in: 7200, refresh_token: 'TTREFRESH2', refresh_expires_in: 15552000, open_id: 'o' });
      if (p === '/v2/post/publish/creator_info/query/') return ttOk({ creator_username: 'testbrand', privacy_level_options: opts.ttPrivacy || ['PUBLIC_TO_EVERYONE', 'SELF_ONLY'], max_video_post_duration_sec: opts.ttMax || 300 });
      if (p === '/v2/post/publish/video/init/' || p === '/v2/post/publish/inbox/video/init/') {
        if (opts.ttInitFail) return json({ data: {}, error: { code: opts.ttInitFail, message: 'refused', log_id: 'L' } }, 403);
        return ttOk({ publish_id: 'v_pub_file~1', upload_url: 'https://open-upload.tiktokapis.com/video/?upload_id=1&upload_token=SECRETTOK' });
      }
      if (p === '/v2/post/publish/status/fetch/') return ttOk({ status: next('tt', opts.ttStatus || ['PUBLISH_COMPLETE']), publicaly_available_post_id: opts.ttPostIds ?? ['7300000000000000001'] });
    }
    if (u.host === 'open-upload.tiktokapis.com') return new Response('', { status: opts.ttPartial ? 206 : 201 });
    return json({ error: { message: `fake has no answer for ${method} ${u.host}${u.pathname}` } }, 404);
  };
  f.calls = calls; f.find = (pred) => calls.filter(pred);
  return f;
}

async function reel(e, { platforms, options = {}, text, video = VIDEO } = {}) {
  const v = (await upload(e, video)).json;
  return schedule(e, { kind: 'reel', media: [{ key: v.key, sha256: v.sha256, role: 'video' }], platforms, text: text || { youtube: 'Why your hook fails\n\nThree fixes.', tiktok: 'Why your hook fails #reels' }, at: soon(), options, reel: 'my-reel' });
}
const adminView = async (e) => (await (await worker.fetch(new Request('https://pub.example/admin', { headers: auth }), e, ctx)).json());

// ---------- text, length and options ----------
test('YouTube text: the first line is the title, #Shorts is added, limits are checked', () => {
  assert.deepEqual(youtubeParts('Title here\n\nBody line'), { title: 'Title here', description: 'Body line\n\n#Shorts' });
  assert.deepEqual(youtubeParts('Only a title #shorts'), { title: 'Only a title #shorts', description: 'Only a title #shorts' });
  assert.deepEqual(checkText('youtube', 'Fine title\n\nBody'), []);
  assert.match(checkText('youtube', 'x'.repeat(101))[0], /101 characters; YouTube allows 100/);
  assert.match(checkText('youtube', 'a <b> title')[0], /cannot contain/);
  assert.match(checkText('youtube', 'Title\n\n' + 'é'.repeat(2600))[0], /bytes/);
  assert.match(checkText('youtube', '')[0], /title is empty/);
  assert.match(checkText('tiktok', 'x'.repeat(2201))[0], /2,200/);
  assert.match(checkText('tiktok', '  ')[0], /empty/);
  assert.deepEqual(checkLength(181, ['youtube']).length, 1);
  assert.deepEqual(checkLength(120, ['youtube', 'tiktok']), []);
  assert.match(checkLength(2, ['tiktok'])[0], /TikTok must be 3 seconds to 10 minutes/);
});

test('schedule: YouTube and TikTok are checked when scheduled', async () => {
  const e = env({ TIKTOK_AUDITED: undefined });
  const v = (await upload(e, VIDEO)).json; const media = [{ key: v.key, sha256: v.sha256, role: 'video' }];
  const s = (x) => schedule(e, { kind: 'reel', media, platforms: ['youtube'], text: { youtube: 'T\n\nD', tiktok: 'c' }, at: soon(), ...x });
  assert.match((await s({ text: { youtube: 'x'.repeat(101) } })).json.error, /100/);
  assert.match((await s({ options: { youtube_privacy: 'secret' } })).json.error, /youtube_privacy/);
  assert.match((await s({ platforms: ['tiktok'], options: { tiktok_mode: 'maybe' } })).json.error, /draft or direct/);
  assert.match((await s({ platforms: ['tiktok'], options: { tiktok_mode: 'direct', tiktok_privacy: 'PUBLIC_TO_EVERYONE' } })).json.error, /not audited/);
  assert.match((await s({ platforms: ['tiktok'], options: { tiktok_mode: 'direct', tiktok_privacy: 'NOBODY' } })).json.error, /tiktok_privacy/);
  const long = env(); const lv = (await upload(long, mp4(200))).json;
  const r = await schedule(long, { kind: 'reel', media: [{ key: lv.key, sha256: lv.sha256, role: 'video' }], platforms: ['youtube'], text: { youtube: 'T' }, at: soon() });
  assert.match(r.json.error, /YouTube Short must be up to 3 minutes/);
  const none = baseEnv(); const nv = (await upload(none, VIDEO)).json;
  assert.match((await schedule(none, { kind: 'reel', media: [{ key: nv.key, sha256: nv.sha256, role: 'video' }], platforms: ['tiktok'], text: { tiktok: 'c' }, at: soon() })).json.error, /tiktok is not connected/);
  assert.equal((await s({})).status, 200);
  assert.deepEqual(Object.keys((await adminView(e)).platforms), ['instagram', 'facebook', 'threads', 'youtube', 'tiktok']);
  assert.equal((await adminView(e)).platforms.youtube.configured, true);
});

// ---------- YouTube ----------
test('YouTube Short: session -> bytes streamed from storage -> link; no secret in the admin view or history', async () => {
  const e = env();
  const { json: s } = await reel(e, { platforms: ['youtube'], options: { ai_generated: true } });
  const g = fake();
  const [r] = await runDue(e, g, LATER());
  assert.equal(r.status, 'published');
  const tok = g.find((c) => c.host === 'oauth2.googleapis.com')[0];
  assert.equal(tok.body.grant_type, 'refresh_token'); assert.equal(tok.body.refresh_token, 'ytrefresh123');
  const start = g.find((c) => c.method === 'POST' && c.path === '/upload/youtube/v3/videos')[0];
  assert.equal(start.headers.Authorization, 'Bearer YTACCESS1');
  assert.equal(start.headers['X-Upload-Content-Length'], String(VIDEO.length));
  assert.deepEqual(start.body, { snippet: { title: 'Why your hook fails', description: 'Three fixes.\n\n#Shorts', categoryId: '22' }, status: { privacyStatus: 'public', selfDeclaredMadeForKids: false, containsSyntheticMedia: true } });
  const put = g.find((c) => c.host === 'upload.example')[0];
  assert.equal(put.method, 'PUT'); assert.deepEqual(put.bytes, VIDEO); assert.equal(put.headers['Content-Length'], String(VIDEO.length));
  const post = (await adminView(e)).posts.find((p) => p.id === s.id);
  assert.equal(post.targets.youtube.permalink, 'https://www.youtube.com/shorts/YTVID1');
  assert.equal(post.targets.youtube.session_uri, undefined);
  const text = JSON.stringify(post) + JSON.stringify(await adminView(e));
  for (const secret of ['SECRETSESSION', 'ytsecret123', 'ytrefresh123', 'YTACCESS1']) assert.ok(!text.includes(secret), `${secret} must not show`);
  assert.equal(e.MEDIA.m.size, 0);                                                      // the file is deleted afterwards
  assert.equal(JSON.parse(e.KV.m.get('yt_publishes')).length, 1);
});

test('YouTube: the access token is kept and reused; a new refresh token secret is picked up', async () => {
  const e = env();
  await reel(e, { platforms: ['youtube'] }); await reel(e, { platforms: ['youtube'] });
  const g = fake();
  await runDue(e, g, LATER());
  assert.equal(g.find((c) => c.host === 'oauth2.googleapis.com').length, 1);           // two posts, one sign-in
  const e2 = env({ YT_REFRESH_TOKEN: 'another-refresh-token' });
  e2.KV.m.set('yt_access', e.KV.m.get('yt_access'));
  await reel(e2, { platforms: ['youtube'] });
  const g2 = fake(); await runDue(e2, g2, LATER());
  assert.equal(g2.find((c) => c.host === 'oauth2.googleapis.com').length, 1);           // the kept token belonged to the old secret
});

test('YouTube: a lost answer is never an upload twice (the session is asked first); a partial upload resumes', async () => {
  const e = env();
  const { json: s } = await reel(e, { platforms: ['youtube'] });
  const g = fake({ ytLoseFirst: true, ytQuery: 'complete' });
  assert.equal((await runDue(e, g, LATER()))[0].status, 'processing');                  // the answer never came: a passing problem
  assert.equal(g.find((c) => c.host === 'upload.example' && c.bytes?.length).length, 1);
  const [r] = await runDue(e, g, LATER() + 300000);
  assert.equal(r.status, 'published');
  const puts = g.find((c) => c.host === 'upload.example');
  assert.equal(puts.filter((c) => c.bytes?.length).length, 1, 'the video was sent once');
  assert.match(puts.at(-1).headers['Content-Range'], /^bytes \*\//);
  assert.equal(g.find((c) => c.method === 'POST' && c.path === '/upload/youtube/v3/videos').length, 1, 'one session');

  const e2 = env();
  await reel(e2, { platforms: ['youtube'] });
  const g2 = fake({ ytLoseFirst: true, ytQuery: { received: 10 } });
  await runDue(e2, g2, LATER());
  await runDue(e2, g2, LATER() + 300000);
  const resumed = g2.find((c) => c.host === 'upload.example' && c.bytes?.length).at(-1);
  assert.equal(resumed.headers['Content-Range'], `bytes 10-${VIDEO.length - 1}/${VIDEO.length}`);
  assert.deepEqual(resumed.bytes, VIDEO.subarray(10));
  assert.ok(s.id);
});

test('YouTube: a forgotten session fails plainly; quota and sign-in problems are explained, never with a secret', async () => {
  const e = env();
  await reel(e, { platforms: ['youtube'] });
  await runDue(e, fake({ ytLoseFirst: true, ytQuery: 'forgot' }), LATER());
  const [r] = await runDue(e, fake({ ytQuery: 'forgot' }), LATER() + 300000);
  assert.equal(r.status, 'failed');
  assert.match((await adminView(e)).posts[0].targets.youtube.error, /forgot the upload session/);

  const q = env(); await reel(q, { platforms: ['youtube'] });
  assert.equal((await runDue(q, fake({ ytFail: 'quotaExceeded' }), LATER()))[0].status, 'failed');
  assert.match((await adminView(q)).posts[0].targets.youtube.error, /quota is used up/);

  const a = env(); await reel(a, { platforms: ['youtube'] });
  await runDue(a, fake({ googleRefuses: true }), LATER());
  const err = (await adminView(a)).posts[0].history.map((h) => h.event).join(' ');
  assert.match(err, /sign-in/); assert.ok(!/ytsecret123|ytrefresh123/.test(JSON.stringify(await adminView(a))));
});

test('YouTube dry run: records what it would send, nothing leaves', async () => {
  const e = env({ PUBLISH_MODE: 'dry_run' });
  await reel(e, { platforms: ['youtube'] });
  const g = fake();
  const [r] = await runDue(e, g, LATER());
  assert.equal(r.status, 'dry_run'); assert.equal(g.calls.length, 0);
  const h = (await adminView(e)).posts[0].history.find((x) => x.would_send);
  assert.equal(h.would_send.insert.snippet.title, 'Why your hook fails');
});

// ---------- TikTok ----------
test('TikTok chunks: one chunk up to 64 MB, else 32 MB chunks and the last takes the rest', () => {
  assert.deepEqual(chunkPlan(10_000_000), { chunk_size: 10_000_000, total: 1 });
  assert.deepEqual(chunkPlan(64 * 1024 * 1024), { chunk_size: 64 * 1024 * 1024, total: 1 });
  const big = 95 * 1024 * 1024; const p = chunkPlan(big);
  assert.deepEqual(p, { chunk_size: TT_CHUNK, total: 2 });
  assert.ok(big - (p.total - 1) * p.chunk_size <= 64 * 1024 * 1024);
});

test('TikTok draft (the default): inbox init, the bytes with Content-Range, done when it is in the inbox', async () => {
  const e = env();
  const { json: s } = await reel(e, { platforms: ['tiktok'] });
  const g = fake({ ttStatus: ['PROCESSING_UPLOAD', 'SEND_TO_USER_INBOX'] });
  assert.equal((await runDue(e, g, LATER()))[0].status, 'processing');
  const init = g.find((c) => c.path === '/v2/post/publish/inbox/video/init/')[0];
  assert.equal(init.headers.Authorization, 'Bearer TTACCESS1');
  assert.deepEqual(init.body, { source_info: { source: 'FILE_UPLOAD', video_size: VIDEO.length, chunk_size: VIDEO.length, total_chunk_count: 1 } });
  assert.equal(g.find((c) => c.path === '/v2/post/publish/creator_info/query/').length, 0);   // a draft has no privacy to pick
  const up = g.find((c) => c.host === 'open-upload.tiktokapis.com')[0];
  assert.equal(up.method, 'PUT'); assert.equal(up.headers['Content-Range'], `bytes 0-${VIDEO.length - 1}/${VIDEO.length}`); assert.deepEqual(up.bytes, VIDEO);
  assert.equal((await runDue(e, g, LATER() + 60000))[0].status, 'processing');
  assert.equal((await runDue(e, g, LATER() + 120000))[0].status, 'published');
  const t = (await adminView(e)).posts.find((p) => p.id === s.id).targets.tiktok;
  assert.equal(t.draft, true); assert.match(t.note, /TikTok inbox/); assert.equal(t.upload_url, undefined);
  assert.ok(!JSON.stringify(await adminView(e)).includes('SECRETTOK'));
});

test('TikTok direct post: creator info, caption and privacy, a link when it is public; the refresh token is rotated', async () => {
  const e = env({ TIKTOK_AUDITED: 'yes' });
  const { json: s } = await reel(e, { platforms: ['tiktok'], options: { tiktok_mode: 'direct', thumb_offset: 1500, ai_generated: true } });
  const g = fake();
  assert.equal((await runDue(e, g, LATER()))[0].status, 'processing');
  const init = g.find((c) => c.path === '/v2/post/publish/video/init/')[0];
  assert.equal(init.body.post_info.title, 'Why your hook fails #reels');
  assert.equal(init.body.post_info.privacy_level, 'PUBLIC_TO_EVERYONE');                  // audited: public is the default
  assert.equal(init.body.post_info.video_cover_timestamp_ms, 1500); assert.equal(init.body.post_info.is_aigc, true);
  assert.equal(init.body.source_info.source, 'FILE_UPLOAD');
  const [r] = await runDue(e, g, LATER() + 60000);
  assert.equal(r.status, 'published');
  const t = (await adminView(e)).posts.find((p) => p.id === s.id).targets.tiktok;
  assert.equal(t.permalink, 'https://www.tiktok.com/@testbrand/video/7300000000000000001'); assert.equal(t.private, false);
  assert.equal(JSON.parse(e.KV.m.get('tt_token')).refresh, 'TTREFRESH2');                // the newest refresh token is kept
  assert.equal(g.find((c) => c.path === '/v2/oauth/token/').length, 1);
  assert.ok(!/ttsecret123|ttrefresh123|TTREFRESH2|TTACCESS1/.test(JSON.stringify(await adminView(e))));
  // the next sign-in uses the rotated token, not the original secret
  e.KV.m.set('tt_token', JSON.stringify({ ...JSON.parse(e.KV.m.get('tt_token')), exp: 0 }));
  await reel(e, { platforms: ['tiktok'], options: { tiktok_mode: 'direct' } });
  const g2 = fake(); await runDue(e, g2, LATER() + 600000);
  assert.equal(g2.find((c) => c.path === '/v2/oauth/token/')[0].body.refresh_token, 'TTREFRESH2');
});

test('TikTok direct post: unaudited means private; refused privacy, length and the audit error fail in plain words', async () => {
  const e = env();
  await reel(e, { platforms: ['tiktok'], options: { tiktok_mode: 'direct' } });
  const g = fake({ ttPostIds: [] });
  await runDue(e, g, LATER());
  assert.equal(g.find((c) => c.path === '/v2/post/publish/video/init/')[0].body.post_info.privacy_level, 'SELF_ONLY');
  assert.equal((await runDue(e, g, LATER() + 60000))[0].status, 'published');
  const t = (await adminView(e)).posts[0].targets.tiktok;
  assert.equal(t.private, true); assert.equal(t.permalink, undefined);

  const m = env({ TIKTOK_AUDITED: 'yes' }); await reel(m, { platforms: ['tiktok'], options: { tiktok_mode: 'direct', tiktok_privacy: 'PUBLIC_TO_EVERYONE' } });
  await runDue(m, fake({ ttPrivacy: ['SELF_ONLY'] }), LATER());
  assert.match((await adminView(m)).posts[0].targets.tiktok.error, /does not offer "PUBLIC_TO_EVERYONE".*SELF_ONLY/);

  const l = env(); await reel(l, { platforms: ['tiktok'], options: { tiktok_mode: 'direct' } });
  await runDue(l, fake({ ttMax: 20 }), LATER());
  assert.match((await adminView(l)).posts[0].targets.tiktok.error, /30 seconds and this TikTok account can post 20/);

  const u = env({ TIKTOK_AUDITED: 'yes' }); await reel(u, { platforms: ['tiktok'], options: { tiktok_mode: 'direct' } });
  await runDue(u, fake({ ttInitFail: 'unaudited_client_can_only_post_to_private_accounts' }), LATER());
  assert.match((await adminView(u)).posts[0].targets.tiktok.error, /has not audited this app/);
});

test('TikTok: a failed post says why; a daily cap is waited out, not failed at once', async () => {
  const e = env();
  await reel(e, { platforms: ['tiktok'] });
  const g = fake({ ttStatus: ['FAILED'] });
  await runDue(e, g, LATER());
  assert.equal((await runDue(e, g, LATER() + 60000))[0].status, 'failed');
  const e2 = env(); await reel(e2, { platforms: ['tiktok'] });
  assert.equal((await runDue(e2, fake({ ttInitFail: 'spam_risk_too_many_posts' }), LATER()))[0].status, 'processing');
});

test('all five platforms from one approved reel, each in its own way', async () => {
  const e = env();
  const { json: s } = await reel(e, { platforms: ['instagram', 'facebook', 'threads', 'youtube', 'tiktok'], text: { instagram: 'ig', facebook: 'fb', threads: 'th', youtube: 'Title\n\nbody', tiktok: 'tt' } });
  assert.equal(s.mode, 'live');
  const g = fake({ ttStatus: ['SEND_TO_USER_INBOX'] }); const m = meta({ fbStatus: ['ready'] });
  const both = async (url, init) => (/googleapis|upload\.example|tiktok/.test(url) ? g(url, init) : m(url, init));
  let last;
  for (let i = 0; i < 6; i++) last = await runDue(e, both, LATER() + i * 60000);
  const post = (await adminView(e)).posts.find((p) => p.id === s.id);
  assert.deepEqual(Object.fromEntries(Object.entries(post.targets).map(([k, v]) => [k, v.status])), { instagram: 'published', facebook: 'published', threads: 'published', youtube: 'published', tiktok: 'published' });
  assert.equal(post.status, 'published'); assert.ok(last);
  assert.equal(e.MEDIA.m.size, 0);
});

test('modes are per platform: YouTube live, TikTok still dry run', async () => {
  const e = env({ PUBLISH_MODE: 'live', PUBLISH_MODE_TIKTOK: 'dry_run' });
  const { json: s } = await reel(e, { platforms: ['youtube', 'tiktok'] });
  assert.equal(s.mode, 'mixed');
  const g = fake();
  await runDue(e, g, LATER());
  const t = (await adminView(e)).posts[0].targets;
  assert.equal(t.youtube.status, 'published'); assert.equal(t.tiktok.status, 'dry_run');
  assert.equal(g.find((c) => /tiktok/.test(c.host)).length, 0);
});
