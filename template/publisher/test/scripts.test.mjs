import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { checkReel, scheduleReel, postingLine, cancel, status } from '../scripts/schedule.mjs';
import { pull } from '../scripts/pull.mjs';
import { followCheck, writeToml, steps, check, names, sendSecrets, saveUrl, secretPlan, subscribe, loginOf } from '../scripts/setup.mjs';
import { lastGateC, appendUnder, parseArgs, sha256File, connection, Plain, isMain, zonedIso, planRows, planSlot } from '../scripts/lib.mjs';
import { forget } from '../scripts/forget.mjs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runDue } from '../src/publish.js';
import { env, meta, workerFetch, kv, mp4 } from './helpers.mjs';

const TMP = fs.existsSync('/private/tmp') ? '/private/tmp' : (await import('node:os')).tmpdir();
const ROOT = fs.mkdtempSync(path.join(TMP, 'bagelunit-publisher-test-'));      // everything the tests write, removed at the end
after(() => fs.rmSync(ROOT, { recursive: true, force: true }));
const tmp = (p) => fs.mkdtempSync(path.join(ROOT, p));
const future = () => new Date(Date.now() + 3600e3).toISOString().replace('Z', '+00:00');
const KEY = 'admin-key-for-tests';

// A brand folder with one approved reel.
function workspace({ post = true, approve = true, tamper = false, coverTamper = false, cover = true, caption = 'Save this for later. #reels', threads = null, handle = 'testbrand', seconds = 30 } = {}) {
  const ws = tmp('brand-');
  fs.mkdirSync(path.join(ws, 'brand')); fs.mkdirSync(path.join(ws, 'reels', 'r', 'out', 'platforms'), { recursive: true });
  fs.writeFileSync(path.join(ws, 'brand', 'brand.json'), JSON.stringify({ name: 'Test Brand', slug: 'testbrand', handle, autopilot: { post }, posting: { timezone: 'America/Toronto' } }));
  const out = path.join(ws, 'reels', 'r', 'out');
  fs.writeFileSync(path.join(out, 'r.mp4'), mp4(seconds));
  if (cover) fs.writeFileSync(path.join(out, 'cover.jpg'), 'cover bytes');
  const v = sha256File(path.join(out, 'r.mp4')).slice(0, 12);
  const c = cover ? sha256File(path.join(out, 'cover.jpg')).slice(0, 12) : null;
  fs.writeFileSync(path.join(ws, 'reels', 'r', 'approvals.md'), approve
    ? `# Approvals\n\n## Gate A\n\n- 2026-11-01 10:00 Gate A (script) approved\n\n## Gate C\n\n### 2026-11-08 10:00\n- File: r.mp4 | sha256: ${v}\n${c ? `- Cover: cover.jpg | sha256: ${c}\n` : ''}- QA: PASS\n`
    : '# Approvals\n');
  if (caption !== null) fs.writeFileSync(path.join(out, 'caption.txt'), caption);
  if (threads) fs.writeFileSync(path.join(out, 'platforms', 'threads.txt'), threads);
  if (tamper) fs.writeFileSync(path.join(out, 'r.mp4'), mp4(seconds, { body: 'edited after approval' }));
  if (coverTamper) fs.writeFileSync(path.join(out, 'cover.jpg'), 'a different cover');
  const cfg = tmp('cfg-');
  fs.writeFileSync(path.join(cfg, 'publisher-testbrand.json'), JSON.stringify({ url: 'https://pub.example', admin_key: KEY }));
  return { ws, reel: path.join(ws, 'reels', 'r'), cfg };
}
const quiet = () => {};

// ---------- the offline checks ----------
test('a good reel passes, with its cover', () => {
  const { reel } = workspace();
  const c = checkReel(reel, { at: future() });
  assert.deepEqual(c.problems, []);
  assert.ok(c.cover.endsWith('cover.jpg')); assert.equal(c.handle, '@testbrand');
});
test('refusals: no Gate C, video changed, cover changed (autopilot.post is checked against the mode, below)', () => {
  assert.equal(checkReel(workspace({ post: false }).reel, { at: future() }).postAllowed, false);
  assert.match(checkReel(workspace({ approve: false }).reel, { at: future() }).problems.join(), /no Gate C/);
  assert.match(checkReel(workspace({ tamper: true }).reel, { at: future() }).problems.join(), /r\.mp4 changed since Gate C/);
  assert.match(checkReel(workspace({ coverTamper: true }).reel, { at: future() }).problems.join(), /cover\.jpg changed since Gate C/);
});
test('a cover that was not approved is not used', () => {
  const { reel } = workspace({ cover: false });
  fs.writeFileSync(path.join(reel, 'out', 'cover.jpg'), 'made after Gate C');
  const c = checkReel(reel, { at: future() });
  assert.deepEqual(c.problems, []); assert.equal(c.cover, null);
});
test('captions per platform, time, options', () => {
  assert.match(checkReel(workspace({ caption: null }).reel, { at: future() }).problems.join(), /caption\.txt/);
  assert.match(checkReel(workspace({ caption: 'x'.repeat(2201) }).reel, { at: future() }).problems.join(), /2,200/);
  assert.match(checkReel(workspace({ caption: 'x'.repeat(600) }).reel, { at: future(), platforms: 'instagram,threads' }).problems.join(), /Threads allows 500.*platforms\/threads\.txt/);
  assert.deepEqual(checkReel(workspace({ caption: 'x'.repeat(600), threads: 'Short one' }).reel, { at: future(), platforms: 'instagram,threads' }).problems, []);
  assert.match(checkReel(workspace().reel, { at: '2026-11-10 09:00' }).problems.join(), /timezone/);
  assert.match(checkReel(workspace().reel, { at: '2020-01-01T09:00:00-05:00' }).problems.join(), /past/);
  assert.match(checkReel(workspace().reel, { at: future(), platforms: 'threads', threads: 'text' }).problems.join(), /links to the Instagram post/);
  assert.match(checkReel(workspace().reel, { at: future(), collaborators: 'a,b,c,d' }).problems.join(), /up to 3/);
  assert.match(checkReel(workspace().reel, { at: future(), platforms: 'tiktok' }).problems.join(), /unknown platform/);
});

test('the video length is checked for every place it goes', () => {
  const at = future();
  const long = workspace({ seconds: 120 }).reel;
  assert.deepEqual(checkReel(long, { at }).problems, []);                                            // Instagram takes 2 minutes
  assert.match(checkReel(long, { at, platforms: 'instagram,facebook' }).problems.join(), /out\/r\.mp4 is 120 seconds; a Facebook Reel must be 3 to 90 seconds \(leave facebook out/);
  assert.match(checkReel(long, { at, story: true }).problems.join(), /an Instagram story must be 3 to 60 seconds/);
  assert.deepEqual(checkReel(long, { at, platforms: 'instagram,threads', threads: 'text' }).problems, []);
  assert.match(checkReel(workspace({ seconds: 2 }).reel, { at }).problems.join(), /an Instagram reel must be 3 seconds to 15 minutes/);
  const c = checkReel(workspace({ seconds: 42.5 }).reel, { at, platforms: 'instagram,facebook' });
  assert.deepEqual(c.problems, []); assert.equal(c.seconds, 42.5);
});
test('Gate C parsing: the latest record and its own cover', () => {
  const t = '## Gate C\n\n### 1\n- File: a.mp4 | sha256: aaaaaaaaaaaa\n- Cover: cover.jpg | sha256: cccccccccccc\n\n### 2\n- File: b.mp4 | sha256: bbbbbbbbbbbb\n- QA: PASS\n';
  assert.deepEqual(lastGateC(t), { file: 'b.mp4', sha12: 'bbbbbbbbbbbb', cover: null });
  assert.deepEqual(lastGateC(t + '- Cover: cover.jpg | sha256: dddddddddddd\n').cover, { file: 'cover.jpg', sha12: 'dddddddddddd' });
});
test('appendUnder adds to the end of the section, before the next one', () => {
  const f = path.join(tmp('ap-'), 'approvals.md');
  fs.writeFileSync(f, '# A\n\n## Gate C\n\n- x\n');
  appendUnder(f, 'Posting', '- one'); appendUnder(f, 'Posting', '- two');
  fs.appendFileSync(f, '\n## Notes\n\n- n\n');
  appendUnder(f, 'Posting', '- three');
  assert.equal(fs.readFileSync(f, 'utf8'), '# A\n\n## Gate C\n\n- x\n\n## Posting\n\n- one\n- two\n- three\n\n## Notes\n\n- n\n');
});
test('args and the connection file', () => {
  assert.deepEqual(parseArgs(['reels/x', '--at', 'T', '--trial', '--threads=text']), { _: ['reels/x'], at: 'T', trial: true, threads: 'text' });
  assert.throws(() => connection('nobody', tmp('none-')), Plain);
});

// ---------- the whole flow against the real Worker code ----------
test('schedule: summary, handle typed, video and cover uploaded with SHA-256, Posting line written in the exact shape', async () => {
  const { reel, cfg } = workspace();
  const e = env({ PUBLISH_MODE: 'dry_run' });
  const out = [];
  const r = await scheduleReel(reel, { at: future(), platforms: 'instagram,threads', threads: 'text' }, { fetchImpl: workerFetch(e), configDir: cfg, confirm: async () => '@testbrand', log: (s) => out.push(s) });
  assert.equal(r.mode, 'dry_run');
  assert.match(out.join('\n'), /About to schedule on @testbrand/);
  assert.ok(!out.join('\n').includes(KEY));
  assert.equal(e.MEDIA.m.size, 2);                                                       // video and cover
  const text = fs.readFileSync(path.join(reel, 'approvals.md'), 'utf8');
  const line = text.split('\n').find((l) => l.includes('Scheduled on'));
  assert.match(line, /^- \d{4}-\d\d-\d\d \d\d:\d\d Scheduled on @testbrand for \S+: post [0-9a-f]{12}, file r\.mp4 sha256 [0-9a-f]{12}, platforms instagram,threads, publisher in dry_run mode$/);
  assert.match(text, /\n## Posting\n\n- /);
  const post = JSON.parse(await e.KV.get(`post:${r.id}`));
  assert.equal(post.media.find((m) => m.role === 'cover').type, 'image');
  assert.equal(post.options.threads_mode, 'text');
});
test('schedule: the wrong handle or a changed file uploads nothing', async () => {
  const { reel, cfg } = workspace();
  const e = env();
  await assert.rejects(scheduleReel(reel, { at: future() }, { fetchImpl: workerFetch(e), configDir: cfg, confirm: async () => '@other', log: quiet }), /Not confirmed/);
  assert.equal(e.MEDIA.m.size, 0);
  const w2 = workspace({ tamper: true });
  await assert.rejects(scheduleReel(w2.reel, { at: future(), yes: true }, { fetchImpl: workerFetch(e), configDir: w2.cfg, log: quiet }), /changed since Gate C/);
  assert.equal(e.MEDIA.m.size, 0);
});
test('schedule --preview: checks and summary, nothing uploaded, no Posting line', async () => {
  const { reel, cfg } = workspace();
  const e = env();
  const calls = [];
  const f = async (url, init) => { calls.push(`${init?.method || 'GET'} ${new URL(url).pathname}`); return workerFetch(e)(url, init); };
  const out = [];
  const r = await scheduleReel(reel, { at: future(), preview: true }, { fetchImpl: f, configDir: cfg, confirm: async () => { throw new Error('must not ask'); }, log: (s) => out.push(s) });
  assert.equal(r.preview, true);
  assert.equal(e.MEDIA.m.size, 0);
  assert.ok(calls.every((c) => c.startsWith('GET ')), calls.join(', '));
  assert.match(out.join('\n'), /Preview only/);
  assert.doesNotMatch(fs.readFileSync(path.join(reel, 'approvals.md'), 'utf8'), /Scheduled on/);
});

test('schedule: refuses mixed modes and unconnected platforms before uploading', async () => {
  const { reel, cfg } = workspace();
  const mixed = env({ PUBLISH_MODE: 'dry_run', PUBLISH_MODE_INSTAGRAM: 'live' });
  await assert.rejects(scheduleReel(reel, { at: future(), platforms: 'instagram,facebook', yes: true }, { fetchImpl: workerFetch(mixed), configDir: cfg, log: quiet }), /different modes/);
  const noTh = env({ THREADS_TOKEN: undefined });
  await assert.rejects(scheduleReel(reel, { at: future(), platforms: 'threads', yes: true }, { fetchImpl: workerFetch(noTh), configDir: cfg, log: quiet }), /threads is not connected/);
  const ig = env();
  await assert.rejects(scheduleReel(reel, { at: future(), collaborators: 'pal', yes: true }, { fetchImpl: workerFetch(ig), configDir: cfg, log: quiet }), /Unified Login/);
  assert.equal(mixed.MEDIA.m.size + noTh.MEDIA.m.size + ig.MEDIA.m.size, 0);
});
test('a trial reel line has the word trial; live mode is recorded', async () => {
  const { reel, cfg } = workspace();
  const e = env();
  const r = await scheduleReel(reel, { at: future(), trial: true, yes: true }, { fetchImpl: workerFetch(e), configDir: cfg, log: quiet });
  assert.match(r.line, /publisher in live mode, trial$/);
  assert.match(postingLine({ platforms: ['instagram'], options: { story: true }, handle: '@b', atStr: 'T', gate: { file: 'f.mp4' }, sha: 'a'.repeat(64) }, 'id', 'dry_run'), /platforms instagram,instagram story, publisher in dry_run mode$/);
});

// ---------- pull ----------
test('pull: brand/publisher.json, Posted on lines once per link, automatic replies in inbox-log.md once', async () => {
  const { ws, reel, cfg } = workspace();
  const e = env();
  const { id } = await scheduleReel(reel, { at: future(), platforms: 'instagram,facebook,threads', yes: true }, { fetchImpl: workerFetch(e), configDir: cfg, log: quiet });
  const g = meta(); const t = Date.now() + 2 * 3600e3;
  await runDue(e, g, t); await runDue(e, g, t + 60000); await runDue(e, g, t + 120000);
  await e.KV.put('lead:c77', JSON.stringify({ kind: 'lead', comment_id: 'c77', username: 'fan', at: '2026-11-09T15:30:00.000Z', rule: 'guide', reply: 'sent', dm: 'sent' }));
  await e.KV.put('dry:c78', JSON.stringify({ kind: 'dry', comment_id: 'c78', username: 'x', at: '2026-11-09T15:31:00.000Z', rule: 'guide' }));
  await e.KV.put('mention:mc1', JSON.stringify({ kind: 'mention', comment_id: 'mc1', media_id: 'mm1', at: '2026-11-09T15:00:00.000Z' }));
  const r1 = await pull({ root: ws, fetchImpl: workerFetch(e), configDir: cfg, log: quiet });
  assert.equal(r1.added, 3); assert.equal(r1.logged, 1);
  const pj = JSON.parse(fs.readFileSync(path.join(ws, 'brand', 'publisher.json'), 'utf8'));
  const p = pj.posts.find((x) => x.id === id);
  assert.equal(p.status, 'published');
  assert.equal(p.targets.instagram.permalink, 'https://www.instagram.com/reel/ABC123/');
  assert.equal(p.targets.facebook.media_id, 'V1');
  assert.equal(pj.inbox.mentions[0].comment_id, 'mc1');
  assert.ok(!JSON.stringify(pj).includes(KEY) && !JSON.stringify(pj).includes('/media/'));
  const ap = fs.readFileSync(path.join(reel, 'approvals.md'), 'utf8');
  assert.match(ap, /\n- \d{4}-\d\d-\d\d \d\d:\d\d Posted on @testbrand: https:\/\/www\.instagram\.com\/reel\/ABC123\/\n/);
  assert.match(ap, /Posted on Facebook: https:\/\/www\.facebook\.com\/reel\/V1/);
  assert.match(ap, /Posted on Threads: https:\/\/www\.threads\.com\/@testbrand\/post\/xyz/);
  const log = fs.readFileSync(path.join(ws, 'brand', 'inbox-log.md'), 'utf8');
  assert.match(log, /\n- \d{4}-\d\d-\d\d \d\d:\d\d Automatic reply to @fan on comment c77 \(rule guide\): public reply and DM sent by the publisher\n/);
  const r2 = await pull({ root: ws, fetchImpl: workerFetch(e), configDir: cfg, log: quiet });
  assert.equal(r2.added, 0); assert.equal(r2.logged, 0);
  assert.equal(fs.readFileSync(path.join(reel, 'approvals.md'), 'utf8'), ap);
});

test('status shows the comment rules and what a dry run would have sent', async () => {
  const { ws: root, cfg } = workspace();
  const e = env();
  await e.KV.put('rules', fs.readFileSync(new URL('../rules.example.json', import.meta.url), 'utf8'));
  await e.KV.put('dry:c1', JSON.stringify({ kind: 'dry', comment_id: 'c1', username: 'fan', text: 'GUIDE please', at: new Date().toISOString(), why: 'dry run', rule: 'guide', would_reply: 'Sent! Check your DMs.', would_dm: 'Here is the guide' }));
  const out = [];
  await status({ root, fetchImpl: workerFetch(e), configDir: cfg, log: (x) => out.push(x) });
  const text = out.join('\n');
  assert.match(text, /Comment rules: guide \(guide\), not tested yet/i);
  assert.match(text, /@fan: "GUIDE please"  would have sent \(rule guide\), dry run: reply "Sent! Check your DMs\.", DM "Here is the guide"/);
  assert.doesNotMatch(text, /admin-key-for-tests/);
});

test('cancel writes a Cancelled line the dashboard reads', async () => {
  const { ws, reel, cfg } = workspace();
  const e = env();
  const { id } = await scheduleReel(reel, { at: future(), yes: true }, { fetchImpl: workerFetch(e), configDir: cfg, log: quiet });
  await cancel(id, { root: ws, fetchImpl: workerFetch(e), configDir: cfg, log: quiet });
  assert.match(fs.readFileSync(path.join(reel, 'approvals.md'), 'utf8'), new RegExp(`Cancelled post ${id} on the publisher`));
});

// ---------- setup ----------
test('setup: writes wrangler.toml once from the template, fills the KV id, prints the owner\'s steps', () => {
  const pub = tmp('pub-');
  fs.copyFileSync(new URL('../wrangler.template.toml', import.meta.url), path.join(pub, 'wrangler.template.toml'));
  const r = writeToml({ slug: 'my-brand', pubDir: pub, apiSetup: 'unified' });
  assert.equal(r.wrote, 'wrangler.toml');
  let toml = fs.readFileSync(r.file, 'utf8');
  assert.match(toml, /^name = "my-brand-publisher"$/m); assert.match(toml, /bucket_name = "my-brand-reels"/);
  assert.match(toml, /API_SETUP = "unified"/); assert.match(toml, /PUBLISH_MODE_INSTAGRAM = "dry_run"/); assert.match(toml, /MODE = "dry_run"/);
  assert.match(toml, /crons = \["\*\/5 \* \* \* \*"\]/);
  assert.ok(!toml.includes('{{'));
  assert.throws(() => writeToml({ slug: 'my-brand', pubDir: pub, kvId: 'nope' }), /32-character/);
  assert.equal(writeToml({ slug: 'my-brand', pubDir: pub, kvId: 'a'.repeat(32) }).wrote, 'kv id');
  toml = fs.readFileSync(r.file, 'utf8');
  assert.match(toml, /id = "a{32}"/);
  fs.writeFileSync(r.file, toml.replace('PUBLISH_MODE_INSTAGRAM = "dry_run"', 'PUBLISH_MODE_INSTAGRAM = "live"'));
  assert.equal(writeToml({ slug: 'my-brand', pubDir: pub }).wrote, null);                // never overwritten
  assert.match(fs.readFileSync(r.file, 'utf8'), /PUBLISH_MODE_INSTAGRAM = "live"/);
  const s = steps({ slug: 'my-brand', configDir: '/cfg' });
  for (const cmd of ['npx wrangler login', 'npx wrangler kv namespace create my-brand-kv', 'Storage & databases, R2, Overview', 'npx wrangler r2 bucket create my-brand-reels', 'node scripts/setup.mjs subscribe', 'node scripts/setup.mjs secrets --dry-run', 'node scripts/setup.mjs secrets', 'npx wrangler deploy', 'node scripts/setup.mjs --url', path.join('/cfg', 'publisher-my-brand.json'), 'node scripts/setup.mjs check']) assert.ok(s.includes(cmd), cmd);
  assert.ok(s.indexOf('npx wrangler deploy') < s.indexOf('setup.mjs secrets'), 'the Worker exists before secrets are sent');
  assert.ok(!/\n\s*\n\s*\n/.test(s), 'no stray blank lines');
  assert.ok(!steps({ slug: 'b', kvReady: true }).includes('kv namespace create'));
  assert.equal(names('x').worker, 'x-publisher'); assert.equal(names('x').kv, 'x-kv');
  assert.ok(s.indexOf('R2, Overview') < s.indexOf('r2 bucket create'), 'R2 is turned on before the bucket is made');
  assert.match(fs.readFileSync(r.file, 'utf8'), /binding = "KV"/);                        // the binding stays KV for older setups
  assert.throws(() => writeToml({ slug: 'fb', pubDir: tmp('pub-'), apiSetup: 'facebook' }), /needs Instagram Login .* or Unified Login/);
  assert.ok(!/\u2014/.test(s));
});
test('setup check: asks again once when Cloudflare has not picked up a new secret yet', async () => {
  const { ws, cfg } = workspace();
  const answers = [{ brand: 'testbrand', platforms: { threads: { configured: false, mode: 'dry_run' } } }, { brand: 'testbrand', platforms: { threads: { configured: true, mode: 'dry_run' } } }];
  let calls = 0;
  const fetchImpl = async () => new Response(JSON.stringify(answers[Math.min(calls++, 1)]), { status: 200, headers: { 'content-type': 'application/json' } });
  const out = [];
  await check({ root: ws, fetchImpl, configDir: cfg, log: (l) => out.push(l), settle: 5 });
  assert.equal(calls, 2);
  assert.match(out.join('\n'), /can take a few seconds to pick up new secrets/);
  assert.match(out.join('\n'), /threads\s+connected, dry run/);
  calls = 0; await check({ root: ws, fetchImpl, configDir: cfg, log: quiet });                // without settle (tests, scripts) it asks once
  assert.equal(calls, 1);
});
test('setup check: asks GET /admin with the key and prints no secret', async () => {
  const { ws, cfg } = workspace();
  const out = [];
  const e = env({ KV: kv() });
  const a = await check({ root: ws, fetchImpl: workerFetch(e), configDir: cfg, log: (s) => out.push(s) });
  assert.equal(a.brand, 'testbrand');
  assert.match(out.join('\n'), /instagram\s+connected, LIVE/);
  assert.ok(!out.join('\n').includes(KEY));
  const bad = tmp('cfg-');
  fs.writeFileSync(path.join(bad, 'publisher-testbrand.json'), JSON.stringify({ url: 'https://pub.example', admin_key: 'wrong' }));
  await assert.rejects(check({ root: ws, fetchImpl: workerFetch(e), configDir: bad, log: quiet }), /refused the admin key/);
});

test('setup follow-check: uses the newest person who messaged, or an id, and says plainly what Meta answered', async () => {
  const { ws, cfg } = workspace();
  const e = env({ KV: kv() }); const out = []; const log = (s) => out.push(s);
  await assert.rejects(followCheck({ root: ws, fetchImpl: workerFetch(e), configDir: cfg, log }), /nobody has messaged/);
  await e.KV.put('message:m1', JSON.stringify({ kind: 'message', direction: 'received', from_id: '123456', at: '2026-11-11T10:00:00Z' }), { metadata: { kind: 'message', direction: 'received', from_id: '123456', at: '2026-11-11T10:00:00Z' } });
  const real = globalThis.fetch;
  try {
    globalThis.fetch = meta({ follows: { 123456: true } });
    let r = await followCheck({ root: ws, fetchImpl: workerFetch(e), configDir: cfg, log });
    assert.equal(r.follows, true); assert.match(out.join('\n'), /ending 3456/); assert.match(out.join('\n'), /follows the account/);
    globalThis.fetch = meta({ follows: { 123456: false } });
    out.length = 0; r = await followCheck({ root: ws, id: '123456', fetchImpl: workerFetch(e), configDir: cfg, log });
    assert.equal(r.follows, false); assert.match(out.join('\n'), /does NOT follow/);
    globalThis.fetch = meta({ follows: { 123456: 'missing' } });
    out.length = 0; r = await followCheck({ root: ws, id: '123456', fetchImpl: workerFetch(e), configDir: cfg, log });
    assert.equal(r.follows, null); assert.match(out.join('\n'), /did not answer/);
  } finally { globalThis.fetch = real; }
  assert.ok(!out.join('\n').includes('IGTOKEN123'));
});

test('setup secrets: read from the token files, sent on stdin, never printed, app secret removed after', () => {
  const cfg = tmp('cfg-');
  const w = (n, d) => fs.writeFileSync(path.join(cfg, `${n}-sb.json`), JSON.stringify(d));
  w('instagram', { access_token: 'IGSECRETTOKEN1', ig_user_id: '1784' });
  w('facebook', { page_id: '55', user_token: 'SHORTLIVED', app_id: '1', app_secret: 'x' });    // check not run yet
  w('threads', { access_token: 'THSECRETTOKEN1', user_id: '77' });
  w('publisher', { url: 'https://sb-publisher.me.workers.dev', app_secret: 'APPSECRET123' });
  const out = []; const calls = [];
  const run = (name, value, cwd) => { calls.push({ name, value, cwd }); return { status: 0, stdout: `Success! Uploaded secret ${name} (${value})`, stderr: '' }; };
  // a dry run sends nothing and makes nothing
  const dry = sendSecrets({ slug: 'sb', configDir: cfg, dryRun: true, run, log: (l) => out.push(l), pubDir: '/pub' });
  assert.equal(calls.length, 0); assert.equal(dry.sent.length, 0);
  assert.equal(JSON.parse(fs.readFileSync(path.join(cfg, 'publisher-sb.json'), 'utf8')).admin_key, undefined);
  assert.match(out.join('\n'), /ADMIN_KEY\s+would be made now .* and sent/);                 // not "skipped": the real run makes and sends it
  assert.deepEqual(dry.skipped.filter((n) => ['ADMIN_KEY', 'VERIFY_TOKEN'].includes(n)), []);
  const r = sendSecrets({ slug: 'sb', configDir: cfg, run, log: (l) => out.push(l), pubDir: '/pub' });
  assert.deepEqual(r.sent, ['ADMIN_KEY', 'VERIFY_TOKEN', 'APP_SECRET', 'IG_USER_ID', 'IG_TOKEN', 'THREADS_USER_ID', 'THREADS_TOKEN']);
  assert.deepEqual(r.skipped, ['FB_PAGE_ID', 'FB_PAGE_TOKEN']);                                // the Facebook check has not swapped the token yet
  assert.equal(calls.find((c) => c.name === 'IG_TOKEN').value, 'IGSECRETTOKEN1'); assert.equal(calls[0].cwd, '/pub');
  const pub = JSON.parse(fs.readFileSync(path.join(cfg, 'publisher-sb.json'), 'utf8'));
  assert.match(pub.admin_key, /^[0-9a-f]{64}$/); assert.match(pub.verify_token, /^[0-9a-f]{64}$/);
  assert.equal(pub.app_secret, undefined); assert.equal(pub.url, 'https://sb-publisher.me.workers.dev');
  if (process.platform !== 'win32') assert.equal(fs.statSync(path.join(cfg, 'publisher-sb.json')).mode & 0o777, 0o600);
  const text = out.join('\n');
  for (const secret of ['IGSECRETTOKEN1', 'THSECRETTOKEN1', 'APPSECRET123', pub.admin_key, pub.verify_token]) assert.ok(!text.includes(secret), 'a value was printed');
  // the same keys are kept on a second run; --only sends just those
  calls.length = 0;
  sendSecrets({ slug: 'sb', configDir: cfg, run, only: ['ADMIN_KEY'], log: quiet, pubDir: '/pub' });
  assert.deepEqual(calls.map((c) => c.name), ['ADMIN_KEY']); assert.equal(calls[0].value, pub.admin_key);
  // a wrangler failure is reported without the value
  const bad = []; sendSecrets({ slug: 'sb', configDir: cfg, only: ['IG_TOKEN'], run: (n, v) => ({ status: 1, stdout: '', stderr: `not logged in, value ${v}` }), log: (l) => bad.push(l), pubDir: '/pub' });
  assert.match(bad.join(), /IG_TOKEN\s+NOT sent: not logged in, value \*\*\*/);
  assert.equal(secretPlan({ slug: 'sb', configDir: cfg, make: false }).rows.length, 9);
});

test('setup --url saves the address next to the admin key', () => {
  const cfg = tmp('cfg-');
  fs.writeFileSync(path.join(cfg, 'publisher-u.json'), JSON.stringify({ admin_key: 'k' }));
  saveUrl({ slug: 'u', url: 'https://u-publisher.me.workers.dev/', configDir: cfg });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(cfg, 'publisher-u.json'), 'utf8')), { admin_key: 'k', url: 'https://u-publisher.me.workers.dev' });
  assert.throws(() => saveUrl({ slug: 'u', url: 'not a url', configDir: cfg }), /--url takes/);
  assert.deepEqual(connection('u', cfg), { file: path.join(cfg, 'publisher-u.json'), url: 'https://u-publisher.me.workers.dev', key: 'k' });
});

// ---------- audit fixes ----------
test('dry run first: a reel can be scheduled in dry run before autopilot.post is on; live still needs it', async () => {
  const w = workspace({ post: false });
  const dry = env({ PUBLISH_MODE: 'dry_run' });
  const out = [];
  const r = await scheduleReel(w.reel, { at: future(), yes: true }, { fetchImpl: workerFetch(dry), configDir: w.cfg, log: (l) => out.push(l) });
  assert.equal(r.mode, 'dry_run');
  assert.match(out.join('\n'), /stays a dry run, even if the publisher goes live/);
  const live = env();
  await assert.rejects(scheduleReel(workspace({ post: false }).reel, { at: future(), yes: true }, { fetchImpl: workerFetch(live), configDir: w.cfg, log: quiet }), /autopilot\.post is not true.*a dry run can be scheduled without it/);
  await assert.rejects(scheduleReel(workspace({ post: false }).reel, { at: future(), preview: true }, { fetchImpl: workerFetch(live), configDir: w.cfg, log: quiet }), /autopilot\.post/);
  assert.equal(live.MEDIA.m.size, 0);
});

test('schedule: when the publisher refuses the post, the files just uploaded are deleted again', async () => {
  const { reel, cfg } = workspace();
  const e = env();
  const wf = workerFetch(e);
  const f = async (url, init = {}) => (new URL(url).pathname === '/admin/schedule' ? new Response(JSON.stringify({ error: 'refused for the test' }), { status: 400 }) : wf(url, init));
  await assert.rejects(scheduleReel(reel, { at: future(), yes: true }, { fetchImpl: f, configDir: cfg, log: quiet }), /Not scheduled \(the uploaded files were deleted again\): POST \/admin\/schedule: 400 refused for the test/);
  assert.equal(e.MEDIA.m.size, 0);
  assert.equal([...e.KV.m.keys()].filter((k) => k.startsWith('upload:')).length, 0);
  assert.doesNotMatch(fs.readFileSync(path.join(reel, 'approvals.md'), 'utf8'), /Scheduled on/);
});

test('forget.mjs: asks until done, then removes the person from inbox-log.md and publisher.json', async () => {
  const { ws, cfg } = workspace();
  const e = env();
  await e.KV.put('lead:c1', JSON.stringify({ kind: 'lead', username: 'fan', from_id: '123', at: '2026-11-09T15:30:00.000Z' }));
  await e.KV.put('message:m1', JSON.stringify({ kind: 'message', from_id: '123', to_id: '999', at: '2026-11-09T15:31:00.000Z' }));
  fs.writeFileSync(path.join(ws, 'brand', 'inbox-log.md'), '# inbox-log.md\n\n- 2026-11-09 15:30 Automatic reply to @fan on comment c1 (rule guide): public reply and DM sent by the publisher\n- 2026-11-09 15:40 Replied to @fanatic: "hi" (reply 1)\n- 2026-11-09 15:41 DM to @123: "hi"\n');
  fs.writeFileSync(path.join(ws, 'brand', 'publisher.json'), JSON.stringify({ inbox: { messages: [{ from_id: '123' }, { from_id: '5' }], replies: { sent: [{ username: 'fan' }], errors: [] } } }));
  const out = [];
  const r = await forget('@fan', { root: ws, fetchImpl: workerFetch(e), configDir: cfg, log: (l) => out.push(l) });
  assert.equal(r.removed, 2); assert.deepEqual(r.ids, ['123']); assert.equal(r.lines, 2); assert.equal(r.entries, 2);
  const log = fs.readFileSync(path.join(ws, 'brand', 'inbox-log.md'), 'utf8');
  assert.doesNotMatch(log, /@fan /); assert.doesNotMatch(log, /@123/); assert.match(log, /@fanatic/);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(ws, 'brand', 'publisher.json'), 'utf8')).inbox.messages, [{ from_id: '5' }]);
  assert.match(out.join('\n'), /Removed 2 line\(s\) about them from brand\/inbox-log\.md/);
});

test('the scripts run when reached through a symlink', () => {
  const dir = tmp('link-');
  const scripts = path.dirname(fileURLToPath(new URL('../scripts/forget.mjs', import.meta.url)));
  fs.symlinkSync(scripts, path.join(dir, 'scripts'), 'dir');
  const linked = path.join(dir, 'scripts', 'forget.mjs');
  assert.equal(isMain(new URL('../scripts/forget.mjs', import.meta.url).href, linked), true);
  assert.equal(isMain(new URL('../scripts/pull.mjs', import.meta.url).href, linked), false);
  const r = spawnSync(process.execPath, [linked], { cwd: dir, encoding: 'utf8' });          // no brand folder here: main() ran
  assert.match(r.stderr, /Run this inside the brand folder/);
});

test('setup secrets: a shared token file is used, its ids are not; the brand\'s ids file is', () => {
  const cfg = tmp('cfg-');
  fs.writeFileSync(path.join(cfg, 'instagram.json'), JSON.stringify({ access_token: 'SHAREDIG', ig_user_id: 'OTHER_BRANDS_ID' }));
  fs.writeFileSync(path.join(cfg, 'threads.json'), JSON.stringify({ access_token: 'SHAREDTH', user_id: 'OTHER_TH' }));
  fs.writeFileSync(path.join(cfg, 'facebook.json'), JSON.stringify({ access_token: 'SHAREDFB', page_id: 'OTHER_PAGE' }));
  const plan = () => Object.fromEntries(secretPlan({ slug: 'sb', configDir: cfg, make: false }).rows.map((r) => [r.name, r]));
  let p = plan();
  assert.equal(p.IG_TOKEN.value, 'SHAREDIG'); assert.equal(p.IG_USER_ID.value, '');           // never the shared file's id
  assert.equal(p.IG_USER_ID.from, path.join(cfg, 'instagram-sb.ids.json'));
  assert.match(p.IG_USER_ID.why, /instagram-sb\.ids\.json/);
  assert.equal(p.THREADS_TOKEN.value, 'SHAREDTH'); assert.equal(p.THREADS_USER_ID.value, '');
  assert.equal(p.FB_PAGE_TOKEN.value, ''); assert.equal(p.FB_PAGE_ID.value, '');              // a Page token is per brand only
  fs.writeFileSync(path.join(cfg, 'instagram-sb.ids.json'), JSON.stringify({ ig_user_id: '1784' }));
  fs.writeFileSync(path.join(cfg, 'threads-sb.ids.json'), JSON.stringify({ user_id: '77' }));
  p = plan();
  assert.equal(p.IG_USER_ID.value, '1784'); assert.equal(p.THREADS_USER_ID.value, '77');
  fs.writeFileSync(path.join(cfg, 'instagram-sb.json'), JSON.stringify({ access_token: 'OWNIG', ig_user_id: '42' }));   // the brand's own file wins
  p = plan();
  assert.equal(p.IG_TOKEN.value, 'OWNIG'); assert.equal(p.IG_USER_ID.value, '42'); assert.equal(p.IG_USER_ID.from, path.join(cfg, 'instagram-sb.json'));
});

test('setup secrets: a PASTE- placeholder is skipped and named, never sent', () => {
  const cfg = tmp('cfg-');
  fs.writeFileSync(path.join(cfg, 'instagram-ph.json'), JSON.stringify({ access_token: 'PASTE-YOUR-TOKEN-HERE', ig_user_id: '1784' }));
  fs.writeFileSync(path.join(cfg, 'publisher-ph.json'), JSON.stringify({ app_secret: 'PASTE-THE-APP-SECRET' }));
  const calls = []; const out = [];
  const r = sendSecrets({ slug: 'ph', configDir: cfg, run: (n, v) => { calls.push(n); return { status: 0, stdout: '', stderr: '' }; }, log: (l) => out.push(l), pubDir: '/pub' });
  assert.ok(r.skipped.includes('IG_TOKEN') && r.skipped.includes('APP_SECRET'));
  assert.ok(!calls.includes('IG_TOKEN') && !calls.includes('APP_SECRET'));
  assert.match(out.join('\n'), /IG_TOKEN\s+skipped: .*PASTE-\.\.\. placeholder/);
});

test('setup subscribe: turns on the account\'s notifications on the right host, token only in the header', async () => {
  const cfg = tmp('cfg-');
  const calls = [];
  const ok = async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200, json: async () => ({ success: true }) }; };
  // Instagram Login: graph.instagram.com, comments and messages
  fs.writeFileSync(path.join(cfg, 'instagram-ig.json'), JSON.stringify({ access_token: 'IGTOKENSECRET', ig_user_id: '1784' }));
  const out = [];
  const a = await subscribe({ slug: 'ig', configDir: cfg, fetchImpl: ok, log: (l) => out.push(l) });
  assert.equal(calls[0].url, 'https://graph.instagram.com/v27.0/1784/subscribed_apps');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer IGTOKENSECRET');
  assert.equal(new URLSearchParams(calls[0].init.body).get('subscribed_fields'), 'comments,messages');
  assert.ok(!calls[0].url.includes('IGTOKENSECRET') && !calls[0].init.body.includes('IGTOKENSECRET'));
  assert.deepEqual(a.fields, ['comments', 'messages']);
  assert.ok(!out.join('\n').includes('IGTOKENSECRET'));
  // Unified Login, shared token file: graph.facebook.com, the brand's own id, mentions too
  fs.writeFileSync(path.join(cfg, 'instagram.json'), JSON.stringify({ access_token: 'SUATSECRET', login: 'unified', ig_user_id: '999' }));
  fs.writeFileSync(path.join(cfg, 'instagram-un.ids.json'), JSON.stringify({ ig_user_id: '1785' }));
  await subscribe({ slug: 'un', configDir: cfg, fetchImpl: ok, log: quiet });
  assert.equal(calls[1].url, 'https://graph.facebook.com/v27.0/1785/subscribed_apps');
  assert.equal(new URLSearchParams(calls[1].init.body).get('subscribed_fields'), 'comments,mentions,messages');
  // a dry run sends nothing
  const before = calls.length;
  const d = await subscribe({ slug: 'un', configDir: cfg, fetchImpl: ok, dryRun: true, log: quiet });
  assert.equal(calls.length, before); assert.equal(d.dryRun, true);
  // Meta's refusal is shown without the token
  const bad = async () => ({ ok: false, status: 400, json: async () => ({ error: { code: 100, message: 'Invalid token IGTOKENSECRET here' } }) });
  await assert.rejects(subscribe({ slug: 'ig', configDir: cfg, fetchImpl: bad, log: quiet }), (e) => e instanceof Plain && !e.message.includes('IGTOKENSECRET') && /did not turn the notifications on/.test(e.message));
  // the older Facebook Login setup, a placeholder, or no account id yet: refused plainly
  fs.writeFileSync(path.join(cfg, 'instagram-fb.json'), JSON.stringify({ access_token: 'X', login: 'facebook', ig_user_id: '1' }));
  await assert.rejects(subscribe({ slug: 'fb', configDir: cfg, fetchImpl: ok, log: quiet }), /needs Instagram Login .* or Unified Login/);
  assert.equal(loginOf('fb', cfg).login, 'facebook');
  fs.writeFileSync(path.join(cfg, 'instagram-ph.json'), JSON.stringify({ access_token: 'PASTE-YOUR-TOKEN-HERE', ig_user_id: '1' }));
  await assert.rejects(subscribe({ slug: 'ph', configDir: cfg, fetchImpl: ok, log: quiet }), /has no token yet/);
  fs.writeFileSync(path.join(cfg, 'instagram-noid.json'), JSON.stringify({ access_token: 'T' }));
  await assert.rejects(subscribe({ slug: 'noid', configDir: cfg, fetchImpl: ok, log: quiet }), /account id is not saved yet/);
});

// ---------- the brand's fixed platforms and the plan's time (1.16.0) ----------
function withBrand(ws, patch) {
  const f = path.join(ws, 'brand', 'brand.json');
  const b = JSON.parse(fs.readFileSync(f, 'utf8'));
  fs.writeFileSync(f, JSON.stringify({ ...b, ...patch, posting: { ...b.posting, ...(patch.posting || {}) } }));
}
const planMd = (rows) => `# plan.md\n\n## Week of 2026-11-30\n\n| Date | Topic | Goal | Angle | Reel (folder) | Notes |\n|---|---|---|---|---|---|\n${rows.join('\n')}\n\n## Week of 2026-12-07\n\n| Date | Topic | Reel (folder) |\n|---|---|---|\n| 2026-12-07 08:00 | later | other |\n`;

test('zonedIso gives the offset of that zone on that day, daylight saving included', () => {
  assert.equal(zonedIso('2026-11-12', '13:00', 'America/Toronto'), '2026-11-12T13:00:00-05:00');
  assert.equal(zonedIso('2026-07-12', '08:30', 'America/Toronto'), '2026-07-12T08:30:00-04:00');
  assert.equal(zonedIso('2026-03-08', '08:00', 'America/Toronto'), '2026-03-08T08:00:00-04:00');     // the morning clocks went forward
  assert.equal(zonedIso('2026-11-12', '9:05', 'UTC'), '2026-11-12T09:05:00+00:00');
  assert.equal(zonedIso('2026-11-12', '25:00', 'UTC'), null);
  assert.equal(zonedIso('2026-11-12', '09:00', 'Not/AZone'), null);
});

test('plan rows are read across weekly tables, and a reel finds its own row', () => {
  const { ws, reel } = workspace();
  const day = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10);
  fs.writeFileSync(path.join(ws, 'brand', 'plan.md'), planMd([`| ${day} 13:00 | topic | save | x | r | note |`, `| ${day} 16:00 | other topic | save | x | \`reels/zz\` | |`]));
  assert.equal(planRows(fs.readFileSync(path.join(ws, 'brand', 'plan.md'), 'utf8')).length, 3);
  const slot = planSlot(ws, reel);
  assert.equal(slot.date, day); assert.equal(slot.time, '13:00');
  assert.match(planSlot(ws, path.join(ws, 'reels', 'nope')).problem, /no row for nope/);
});

test('posting.platforms is the default, --platforms overrides it, and a bad name is named', () => {
  const { ws, reel } = workspace();
  assert.deepEqual(checkReel(reel, { at: future() }).platforms, ['instagram']);                       // no setting: Instagram only, as before
  withBrand(ws, { posting: { platforms: ['instagram', 'facebook', 'threads'] } });
  const c = checkReel(reel, { at: future() });
  assert.deepEqual(c.platforms, ['instagram', 'facebook', 'threads']); assert.equal(c.platformsFrom, 'brand');
  assert.deepEqual(checkReel(reel, { at: future(), platforms: 'instagram' }).platforms, ['instagram']);
  assert.equal(checkReel(reel, { at: future(), platforms: 'instagram' }).platformsFrom, 'flag');
  withBrand(ws, { posting: { platforms: ['instagram', 'tiktok'] } });
  assert.match(checkReel(reel, { at: future() }).problems.join(), /unknown platform "tiktok" in brand.json -> posting.platforms/);
});

test('--from-plan takes the time from the reel\'s plan row, and refuses without one', () => {
  const { ws, reel } = workspace();
  const day = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10);
  fs.writeFileSync(path.join(ws, 'brand', 'plan.md'), planMd([`| ${day} 13:00 | topic | save | x | r | |`]));
  const c = checkReel(reel, { 'from-plan': true });
  assert.deepEqual(c.problems, []);
  assert.match(c.atStr, new RegExp(`^${day}T13:00:00-0[45]:00$`)); assert.equal(c.fromPlan.time, '13:00');
  assert.match(checkReel(reel, { 'from-plan': true, at: future() }).problems.join(), /--at or --from-plan, not both/);
  fs.writeFileSync(path.join(ws, 'brand', 'plan.md'), planMd([`| ${day} | topic | save | x | r | |`]));
  assert.match(checkReel(reel, { 'from-plan': true }).problems.join(), /date \(.*\) but no time/);
  fs.writeFileSync(path.join(ws, 'brand', 'plan.md'), planMd(['| 2020-01-02 09:00 | topic | save | x | r | |']));
  assert.match(checkReel(reel, { 'from-plan': true }).problems.join(), /already passed/);
  fs.writeFileSync(path.join(ws, 'brand', 'plan.md'), planMd([`| ${day} 13:00 | topic | save | x | someone-else | |`]));
  assert.match(checkReel(reel, { 'from-plan': true }).problems.join(), /no row for r/);
  withBrand(ws, { posting: { timezone: '' } });
  assert.match(checkReel(reel, { 'from-plan': true }).problems.join(), /posting.timezone is not set/);
  assert.match(checkReel(reel, {}).problems.join(), /--at needs a date.*--from-plan/);                  // neither flag
});

test('scheduling with --from-plan and the brand platforms posts them, and the preview says where they came from', async () => {
  const { ws, reel, cfg } = workspace();
  const day = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10);
  fs.writeFileSync(path.join(ws, 'brand', 'plan.md'), planMd([`| ${day} 16:00 | topic | save | x | r | |`]));
  withBrand(ws, { posting: { platforms: ['instagram', 'facebook', 'threads'] } });
  const sent = [], logs = [];
  const fetchImpl = async (url, o = {}) => {
    const u = new URL(url);
    if (u.pathname === '/admin') return Response.json({ platforms: { instagram: { configured: true, mode: 'dry_run' }, facebook: { configured: true, mode: 'dry_run' }, threads: { configured: true, mode: 'dry_run' } }, api_setup: 'unified' });
    if (u.pathname === '/admin/upload') return Response.json({ key: `k${sent.length}` });
    if (u.pathname === '/admin/schedule') { sent.push(JSON.parse(o.body)); return Response.json({ id: 'abcdef012345', mode: 'dry_run' }); }
    return Response.json({});
  };
  const r = await scheduleReel(reel, { 'from-plan': true, preview: true }, { fetchImpl, configDir: cfg, log: (x) => logs.push(x) });
  assert.equal(r.preview, true);
  const text = logs.join('\n');
  assert.match(text, /\[from brand\/plan.md: .* 16:00\]/); assert.match(text, /instagram, facebook, threads {2}\[from brand.json -> posting.platforms\]/);
  await scheduleReel(reel, { 'from-plan': true, yes: true }, { fetchImpl, configDir: cfg, log: quiet });
  assert.deepEqual(sent[0].platforms, ['instagram', 'facebook', 'threads']);
  assert.match(sent[0].at, new RegExp(`^${day}T16:00:00-0[45]:00$`));
});
