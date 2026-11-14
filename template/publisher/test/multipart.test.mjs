// Big files: a video over 95 MB goes up in parts (src/publish.js "big files", scripts/schedule.mjs uploadInParts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import worker from '../src/worker.js';
import { MULTIPART_MAX_BYTES, sha256OfStream } from '../src/publish.js';
import { uploadInParts } from '../scripts/schedule.mjs';
import { env, ctx, auth, schedule, soon, sha, mp4, workerFetch } from './helpers.mjs';

const call = async (e, method, p, { body, headers = {} } = {}) => {
  const res = await worker.fetch(new Request(`https://pub.example${p}`, { method, body, headers: { ...auth, ...headers } }), e, ctx);
  return { status: res.status, json: await res.json().catch(() => ({})) };
};
const start = (e, buf, { hash = sha(buf), size = buf.length, name = 'episode.mp4' } = {}) =>
  call(e, 'POST', `/admin/upload/multipart?type=video&name=${name}`, { headers: { 'X-Content-SHA256': hash, 'X-Content-Length': String(size) } });
async function sendParts(e, id, buf, partBytes) {
  const parts = [];
  for (let n = 1, off = 0; off < buf.length; n++, off += partBytes) {
    const r = await call(e, 'PUT', `/admin/upload/multipart/part?upload=${id}&part=${n}`, { body: buf.subarray(off, off + partBytes) });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    parts.push({ partNumber: r.json.partNumber, etag: r.json.etag });
  }
  return parts;
}
const complete = (e, id, parts) => call(e, 'POST', `/admin/upload/multipart/complete?upload=${id}`, { body: JSON.stringify({ parts }), headers: { 'Content-Type': 'application/json' } });
const VIDEO = mp4(540, { body: 'x'.repeat(5000) });   // a 9-minute "episode" (small bytes, real length header)

test('a video goes up in parts, is joined byte for byte, and can be scheduled for Instagram', async () => {
  const e = env({ IG_USER_ID: '999', IG_TOKEN: 'tok' });
  const s = await start(e, VIDEO);
  assert.equal(s.status, 200, JSON.stringify(s.json));
  assert.match(s.json.upload, /^[0-9a-f]{32}$/);
  const parts = await sendParts(e, s.json.upload, VIDEO, 1500);
  assert.ok(parts.length >= 3);
  const c = await complete(e, s.json.upload, [...parts].reverse());            // order does not matter: sorted by number
  assert.equal(c.status, 200, JSON.stringify(c.json));
  assert.equal(c.json.sha256, sha(VIDEO));
  assert.deepEqual(e.MEDIA.m.get(c.json.key), VIDEO);
  const rec = JSON.parse(await e.KV.get(`upload:${c.json.key}`));
  assert.equal(rec.sha256, sha(VIDEO)); assert.equal(rec.size, VIDEO.length); assert.equal(rec.parts, parts.length);
  assert.equal(await e.KV.get(`mpu:${s.json.upload}`), null);                    // the start record is gone
  const r = await schedule(e, { kind: 'reel', media: [{ key: c.json.key, sha256: c.json.sha256, role: 'video' }], platforms: ['instagram'], text: { instagram: 'Full episode' }, at: soon(), reel: 'ice-full' });
  assert.equal(r.status, 200, JSON.stringify(r.json));
});

test('a joined file that does not match its SHA-256 or size is deleted and never recorded', async () => {
  const e = env();
  const bad = await start(e, VIDEO, { hash: sha(Buffer.from('something else')) });
  const c1 = await complete(e, bad.json.upload, await sendParts(e, bad.json.upload, VIDEO, 2000));
  assert.equal(c1.status, 422); assert.match(c1.json.error, /SHA-256/);
  assert.equal(e.MEDIA.m.size, 0);
  assert.equal((await e.KV.list({ prefix: 'upload:' })).keys.length, 0);
  const short = await start(e, VIDEO, { size: VIDEO.length + 10 });
  const c2 = await complete(e, short.json.upload, await sendParts(e, short.json.upload, VIDEO, 2000));
  assert.equal(c2.status, 422); assert.match(c2.json.error, /bytes/);
  assert.equal(e.MEDIA.m.size, 0);
});

test('limits and checks on the parts path', async () => {
  const e = env();
  assert.equal((await start(e, VIDEO, { size: MULTIPART_MAX_BYTES + 1 })).status, 413);
  assert.equal((await start(e, VIDEO, { hash: 'abc' })).status, 400);
  assert.equal((await call(e, 'POST', '/admin/upload/multipart?type=image&name=a.jpg', { headers: { 'X-Content-SHA256': sha(VIDEO), 'X-Content-Length': '10' } })).status, 400);
  assert.equal((await call(e, 'POST', '/admin/upload/multipart?type=video&name=a.txt', { headers: { 'X-Content-SHA256': sha(VIDEO), 'X-Content-Length': '10' } })).status, 400);
  assert.equal((await call(e, 'PUT', '/admin/upload/multipart/part?upload=nope&part=1', { body: 'x' })).status, 404);
  const s = await start(e, VIDEO);
  assert.equal((await call(e, 'PUT', `/admin/upload/multipart/part?upload=${s.json.upload}&part=0`, { body: 'x' })).status, 400);
  assert.equal((await complete(e, s.json.upload, [{ partNumber: 1 }])).status, 400);
  // without the admin key nothing happens
  const res = await worker.fetch(new Request('https://pub.example/admin/upload/multipart?type=video&name=a.mp4', { method: 'POST', headers: { 'X-Content-SHA256': sha(VIDEO), 'X-Content-Length': '10' } }), e, ctx);
  assert.equal(res.status, 403);
  // giving up frees the parts
  await sendParts(e, s.json.upload, VIDEO, 2000);
  assert.equal(e.MEDIA.uploads.size, 1);
  assert.equal((await call(e, 'DELETE', `/admin/upload/multipart?upload=${s.json.upload}`)).status, 200);
  assert.equal(e.MEDIA.uploads.size, 0);
  assert.equal(await e.KV.get(`mpu:${s.json.upload}`), null);
});

test('the publisher refuses to schedule a stored video over 300 MB', async () => {
  const e = env({ IG_USER_ID: '999', IG_TOKEN: 'tok' });
  const s = await start(e, VIDEO);
  const c = await complete(e, s.json.upload, await sendParts(e, s.json.upload, VIDEO, 2000));
  const head = e.MEDIA.head.bind(e.MEDIA);
  e.MEDIA.head = async (k) => (k === c.json.key ? { size: MULTIPART_MAX_BYTES + 1 } : head(k));
  const r = await schedule(e, { kind: 'reel', media: [{ key: c.json.key, sha256: c.json.sha256, role: 'video' }], platforms: ['instagram'], text: { instagram: 'x' }, at: soon(), reel: 'big' });
  assert.equal(r.status, 400); assert.match(r.json.error, /300 MB/);
});

test('a YouTube Short over 3 minutes is still refused, whatever the upload path', async () => {
  const e = env({ IG_USER_ID: '999', IG_TOKEN: 'tok', YT_CLIENT_ID: 'a', YT_CLIENT_SECRET: 'b', YT_REFRESH_TOKEN: 'c' });
  const s = await start(e, VIDEO);
  const c = await complete(e, s.json.upload, await sendParts(e, s.json.upload, VIDEO, 2000));
  const r = await schedule(e, { kind: 'reel', media: [{ key: c.json.key, sha256: c.json.sha256, role: 'video' }], platforms: ['instagram', 'youtube'], text: { instagram: 'x', youtube: 'x' }, at: soon(), reel: 'ice-full' });
  assert.equal(r.status, 400); assert.match(r.json.error, /YouTube Short/);
});

test('uploadInParts sends a file from disk part by part and the publisher verifies it', async () => {
  const e = env();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bagelunit-mpu-'));
  const file = path.join(dir, 'episode.mp4'); fs.writeFileSync(file, VIDEO);
  const conn = { url: 'https://pub.example', key: 'admin-key-for-tests' };
  const out = [];
  const r = await uploadInParts(conn, file, sha(VIDEO), VIDEO.length, { fetchImpl: workerFetch(e), log: (x) => out.push(x), partBytes: 1500 });
  assert.equal(r.sha256, sha(VIDEO));
  assert.deepEqual(e.MEDIA.m.get(r.key), VIDEO);
  assert.equal(out.length, Math.ceil(VIDEO.length / 1500));
  // a wrong fingerprint: refused, and nothing is left behind
  const e2 = env();
  await assert.rejects(uploadInParts(conn, file, sha(Buffer.from('nope')), VIDEO.length, { fetchImpl: workerFetch(e2), log: () => {}, partBytes: 1500 }), /SHA-256/);
  assert.equal(e2.MEDIA.m.size, 0); assert.equal(e2.MEDIA.uploads.size, 0);
  // a part that keeps failing: the upload is given up (parts freed)
  const e3 = env(); const real = workerFetch(e3);
  const flaky = async (url, init) => (String(url).includes('/part?') && String(url).includes('part=2') ? new Response('{"error":"boom"}', { status: 500 }) : real(url, init));
  await assert.rejects(uploadInParts(conn, file, sha(VIDEO), VIDEO.length, { fetchImpl: flaky, log: () => {}, partBytes: 1500 }), /500/);
  assert.equal(e3.MEDIA.uploads.size, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('sha256OfStream matches a plain hash', async () => {
  assert.equal(await sha256OfStream(new Response(VIDEO).body), sha(VIDEO));
});
