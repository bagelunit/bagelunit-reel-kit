import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { loadRules, matchRule, verifySignature, extractEvents, handleComment, forgetUser, DEFAULT_DISCLOSURE } from '../src/worker.js';
import { kv, env as baseEnv, ctx, auth, meta } from './helpers.mjs';

const RULES = { rules: [
  { name: 'guide', match_text: ['SETUP'], reply: 'Sent! Check your DMs.', dm: 'Here it is: https://example.com/guide', tested: true },
  { name: 'untested', match_text: ['DEMO'], reply: 'On its way.', dm: 'Demo: https://example.com/d', tested: false },
] };
const env = (x = {}) => baseEnv({ KV: kv({ rules: JSON.stringify(RULES) }), MODE: 'live', APP_SECRET: 's3cret', VERIFY_TOKEN: 'vt', ...x });
const comment = (o = {}) => ({ account: '999', id: 'c1', text: 'setup please', fromId: '123', username: 'fan', mediaId: 'm1', parentId: null, time: Date.now(), ...o });

async function sign(body, secret) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
  return 'sha256=' + [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------- rules ----------
test('rules: a link in the public reply is refused; no rules means none', () => {
  assert.throws(() => loadRules({ rules: [{ match_text: ['A'], reply: 'see www.site.com', dm: 'x' }] }), /link/);
  assert.throws(() => loadRules({ rules: [{ match_text: ['A'], reply: 'go to site.io', dm: 'x' }] }), /link/);
  assert.deepEqual(loadRules(null), []);
});
test('match: whole word, any case, punctuation fine, media scope', () => {
  const r = loadRules(RULES);
  assert.equal(matchRule(r, 'SETUP!!', 'm')?.name, 'guide');
  assert.equal(matchRule(r, 'can I get the setup?', 'm')?.name, 'guide');
  assert.equal(matchRule(r, 'setups are cool', 'm'), null);
  const s = loadRules({ rules: [{ match_text: ['A'], match_media_id: ['m9'], reply: 'ok', dm: 'x' }] });
  assert.equal(matchRule(s, 'a', 'm1'), null); assert.ok(matchRule(s, 'a', 'm9'));
});

// ---------- disclosure ----------
test('every automatic DM says it is automated: default line, own words, never twice, never empty', () => {
  assert.equal(loadRules(RULES)[0].dm, `Here it is: https://example.com/guide\n\n${DEFAULT_DISCLOSURE}`);
  assert.equal(DEFAULT_DISCLOSURE, '(This is an automated reply.)');
  assert.match(loadRules({ ...RULES, disclosure: '(Automatische Antwort.)' })[0].dm, /\(Automatische Antwort\.\)$/);
  assert.match(loadRules(RULES, { DM_DISCLOSURE: '(Sent automatically.)' })[0].dm, /\(Sent automatically\.\)$/);
  assert.match(loadRules({ ...RULES, disclosure: '   ' })[0].dm, /\(This is an automated reply\.\)$/);
  const already = loadRules({ rules: [{ match_text: ['A'], reply: 'ok', dm: `Link: https://x.co\n\n${DEFAULT_DISCLOSURE}` }] })[0].dm;
  assert.equal(already.split(DEFAULT_DISCLOSURE).length, 2);
});
test('live: the DM that is sent ends with the disclosure', async () => {
  const e = env(); const g = meta();
  const out = await handleComment(e, comment(), loadRules(RULES), g);
  assert.equal(out.action, 'lead');
  const dm = g.find((c) => c.path.endsWith('/999/messages'))[0].body;
  assert.deepEqual(dm.recipient, { comment_id: 'c1' });
  assert.ok(dm.message.text.endsWith(DEFAULT_DISCLOSURE));
  const reply = g.find((c) => c.path.endsWith('/c1/replies'))[0].body;
  assert.equal(reply.message, 'Sent! Check your DMs.');
});

// ---------- signature ----------
test('signature: valid passes; tampered, wrong secret and missing fail', async () => {
  const body = '{"a":1}'; const sig = await sign(body, 's3cret');
  assert.equal(await verifySignature(body, sig, 's3cret'), true);
  assert.equal(await verifySignature(body + ' ', sig, 's3cret'), false);
  assert.equal(await verifySignature(body, sig, 'other'), false);
  assert.equal(await verifySignature(body, null, 's3cret'), false);
  assert.equal(await verifySignature(body, sig, ''), false);
});
test('webhook: bad signature is 401; verify handshake needs the token', async () => {
  const e = env();
  const r = await worker.fetch(new Request('https://pub.example/webhook', { method: 'POST', body: '{}', headers: { 'X-Hub-Signature-256': 'sha256=00' } }), e, ctx);
  assert.equal(r.status, 401);
  const ok = await worker.fetch(new Request('https://pub.example/webhook?hub.mode=subscribe&hub.verify_token=vt&hub.challenge=42'), e, ctx);
  assert.equal(await ok.text(), '42');
  const no = await worker.fetch(new Request('https://pub.example/webhook?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=42'), e, ctx);
  assert.equal(no.status, 403);
});

// ---------- the decisions ----------
test('dry run, untested rule, own account, old comment, no match, retries', async () => {
  const rules = loadRules(RULES);
  const g = meta();
  assert.equal((await handleComment(env({ MODE: 'dry_run' }), comment(), rules, g)).action, 'dry');
  assert.equal((await handleComment(env(), comment({ text: 'demo pls' }), rules, g)).rec.why, 'rule not tested');
  assert.equal((await handleComment(env(), comment({ fromId: '999' }), rules, g)).why, 'own account');
  assert.equal((await handleComment(env(), comment({ time: Date.now() - 8 * 864e5 }), rules, g)).rec.why, 'older than 7 days');
  assert.equal((await handleComment(env(), comment({ text: 'hello' }), rules, g)).action, 'defer');
  const e = env();
  await handleComment(e, comment(), rules, g);
  assert.equal((await handleComment(e, comment(), rules, g)).why, 'already handled');
  assert.equal(g.find((c) => c.path.endsWith('/messages')).length, 1);
});
test('hourly cap', async () => {
  const e = env({ MAX_PER_HOUR: '1' }); const rules = loadRules(RULES); const g = meta();
  assert.equal((await handleComment(e, comment({ id: 'a' }), rules, g)).action, 'lead');
  assert.equal((await handleComment(e, comment({ id: 'b' }), rules, g)).rec.why, 'hourly cap reached');
});

// ---------- mentions and messages ----------
const MENTION = { object: 'instagram', entry: [{ id: '999', time: 1700000000, changes: [{ field: 'mentions', value: { comment_id: 'mc1', media_id: 'mm1' } }] }] };
const MESSAGE = { object: 'instagram', entry: [{ id: '999', time: 1700000000, messaging: [{ sender: { id: '555' }, recipient: { id: '999' }, timestamp: 1700000000123, message: { mid: 'mid1', text: 'Do you ship to Canada?' } }] }] };
test('extract: comments (both shapes), mentions and messages', () => {
  const a = extractEvents({ entry: [{ id: '999', time: 1700000000, changes: [{ field: 'comments', value: { id: 'c1', text: 'hi', from: { id: '1', username: 'u' }, media: { id: 'm1' } } }] }] });
  const b = extractEvents({ entry: [{ id: '999', time: 1700000000, field: 'comments', value: { id: 'c2', text: 'yo', from: { id: '2', username: 'v' }, media: { id: 'm2' } } }] });
  assert.equal(a.comments[0].id, 'c1'); assert.equal(a.comments[0].time, 1700000000000); assert.equal(b.comments[0].username, 'v');
  assert.deepEqual(extractEvents(MENTION).mentions[0], { account: '999', media_id: 'mm1', comment_id: 'mc1', time: 1700000000000 });
  const m = extractEvents(MESSAGE).messages[0];
  assert.equal(m.mid, 'mid1'); assert.equal(m.from_id, '555'); assert.equal(m.echo, false); assert.equal(m.time, 1700000000123);
});
test('webhook stores mentions and messages, and GET /admin/inbox shows them', async () => {
  const e = env(); const work = [];
  const c = { waitUntil: (p) => work.push(p) };
  for (const payload of [MENTION, MESSAGE]) {
    const body = JSON.stringify(payload);
    const r = await worker.fetch(new Request('https://pub.example/webhook', { method: 'POST', body, headers: { 'X-Hub-Signature-256': await sign(body, 's3cret') } }), e, c);
    assert.equal(r.status, 200);
  }
  await Promise.all(work);
  const inbox = await (await worker.fetch(new Request('https://pub.example/admin/inbox', { headers: auth }), e, ctx)).json();
  assert.equal(inbox.mentions[0].comment_id, 'mc1');
  assert.equal(inbox.messages[0].text, 'Do you ship to Canada?'); assert.equal(inbox.messages[0].direction, 'received');
  assert.equal((await worker.fetch(new Request('https://pub.example/admin/inbox'), e, ctx)).status, 403);
  // a deleted message removes our copy
  const del = JSON.parse(JSON.stringify(MESSAGE)); del.entry[0].messaging[0].message = { mid: 'mid1', is_deleted: true };
  const body = JSON.stringify(del); work.length = 0;
  await worker.fetch(new Request('https://pub.example/webhook', { method: 'POST', body, headers: { 'X-Hub-Signature-256': await sign(body, 's3cret') } }), e, c);
  await Promise.all(work);
  assert.equal(await e.KV.get('message:mid1'), null);
});

test('forget removes a person\'s comment records, and their messages through the id in those comments', async () => {
  const e = env();
  await e.KV.put('lead:c1', JSON.stringify({ username: 'Fan', from_id: '123' }));
  await e.KV.put('message:m1', JSON.stringify({ from_id: '123', to_id: '999' }));       // they wrote to the brand
  await e.KV.put('message:m2', JSON.stringify({ from_id: '999', to_id: '123' }));       // the brand wrote back
  await e.KV.put('message:m3', JSON.stringify({ from_id: '555', to_id: '999' }));       // someone else
  await e.KV.put('lead:c2', JSON.stringify({ username: 'other', from_id: '9' }));
  const r = await forgetUser(e, '@fan');
  assert.equal(r.removed, 3); assert.equal(r.done, true); assert.deepEqual(r.ids, ['123']);
  assert.ok(await e.KV.get('lead:c2')); assert.ok(await e.KV.get('message:m3'));
  await e.KV.put('message:m4', JSON.stringify({ from_id: '123' }));
  assert.equal((await forgetUser(e, '123')).removed, 1);                               // an id works directly
});

test('GET /admin shows modes, platforms and the disclosure, never a secret', async () => {
  const e = env();
  const a = await (await worker.fetch(new Request('https://pub.example/admin', { headers: auth }), e, ctx)).json();
  assert.equal(a.mode, 'live'); assert.equal(a.api_setup, 'instagram'); assert.equal(a.disclosure, DEFAULT_DISCLOSURE);
  assert.deepEqual(a.platforms.facebook, { configured: true, mode: 'live' });
  for (const s of ['IGTOKEN123', 'FBTOKEN123', 'THTOKEN123', 'admin-key-for-tests', 's3cret']) assert.ok(!JSON.stringify(a).includes(s));
});
