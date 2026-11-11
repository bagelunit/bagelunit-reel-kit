// The follow gate: comment -> ask with a button -> the person answers -> the Worker reads whether they follow ->
// the link, or a short reminder. No network: Meta is a fake (helpers.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { loadRules, handleComment, handleReply, followCheck, forgetUser, extractEvents, DEFAULT_DISCLOSURE } from '../src/worker.js';
import { kv, env as baseEnv, ctx, auth, meta } from './helpers.mjs';

const RULE = { name: 'kit', match_text: ['KIT'], reply: 'Sent! Check your DMs.', dm: 'Here is the kit: https://example.com/kit', require_follow: true, tested: true,
  ask: 'Tap the button and I will send the kit.', follow_nudge: 'Follow the account first, then tap again.', max_nudges: 2 };
const rules = () => loadRules({ rules: [RULE] });
const env = (x = {}) => baseEnv({ KV: kv(), MODE: 'live', ...x });
const comment = (o = {}) => ({ account: '999', id: 'c1', text: 'KIT please', fromId: '123', username: 'fan', mediaId: 'm1', parentId: null, time: Date.now(), ...o });
const msg = (o = {}) => ({ account: '999', mid: `mid${Math.random()}`, from_id: '123', to_id: '999', text: 'Send me the link', echo: false, deleted: false, attachments: [], time: Date.now(), ...o });
const sends = (g) => g.find((c) => c.path.endsWith('/999/messages')).map((c) => c.body);

test('rules: the link may not be in the ask or the reminder; the disclosure goes on all three; nudges are bounded', () => {
  assert.throws(() => loadRules({ rules: [{ ...RULE, ask: 'get it at https://x.co' }] }), /ask contains a link/);
  assert.throws(() => loadRules({ rules: [{ ...RULE, follow_nudge: 'see www.x.com' }] }), /follow_nudge contains a link/);
  const r = rules()[0];
  assert.equal(r.requireFollow, true);
  for (const t of [r.ask, r.nudge, r.dm]) assert.ok(t.endsWith(DEFAULT_DISCLOSURE));
  assert.equal(r.maxNudges, 2);
  assert.equal(loadRules({ rules: [{ ...RULE, max_nudges: 99 }] })[0].maxNudges, 5);
  assert.equal(loadRules({ rules: [{ ...RULE, max_nudges: undefined }] })[0].maxNudges, 3);
  assert.equal(loadRules({ rules: [{ ...RULE, require_follow: undefined }] })[0].requireFollow, false);   // a plain rule is unchanged
});

test('step 1: the comment gets a public reply and an ask with a button, never the link; the person is remembered', async () => {
  const e = env(); const g = meta();
  const out = await handleComment(e, comment(), rules(), g);
  assert.equal(out.action, 'lead'); assert.equal(out.rec.step, 'asked');
  const [dm] = sends(g);
  assert.deepEqual(dm.recipient, { comment_id: 'c1' });
  assert.ok(!/https?:/.test(dm.message.text));
  assert.equal(dm.message.quick_replies[0].title, 'Send me the link');
  assert.equal(g.find((c) => c.path.endsWith('/c1/replies')).length, 1);
  assert.ok(await e.KV.get('pending:123'));
  assert.equal(e.KV.ttl.get('pending:123'), 7 * 24 * 3600);
});

test('step 1: a rule without require_follow still sends the link at once', async () => {
  const e = env(); const g = meta();
  await handleComment(e, comment(), loadRules({ rules: [{ ...RULE, require_follow: false }] }), g);
  assert.match(sends(g)[0].message.text, /https:\/\/example\.com\/kit/);
  assert.equal(await e.KV.get('pending:123'), null);
});

test('step 1: no commenter id means no follow check is possible, so nothing is sent', async () => {
  const e = env(); const g = meta();
  const out = await handleComment(e, comment({ fromId: '' }), rules(), g);
  assert.equal(out.action, 'defer'); assert.equal(g.calls.length, 0);
});

test('step 1: if Meta refuses the button, the same text goes without it', async () => {
  const e = env(); const g = meta({ noButtons: true });
  const out = await handleComment(e, comment(), rules(), g);
  assert.equal(out.action, 'lead');
  const all = sends(g);
  assert.equal(all.length, 2); assert.ok(all[0].message.quick_replies); assert.equal(all[1].message.quick_replies, undefined);
});

test('step 2: a follower who answers gets the link, and is no longer pending', async () => {
  const e = env(); await handleComment(e, comment(), rules(), meta());
  const g = meta({ follows: { 123: true } });
  const out = await handleReply(e, msg(), rules(), g);
  assert.equal(out.action, 'lead'); assert.equal(out.rec.step, 'link'); assert.equal(out.rec.follows, true);
  const dm = sends(g)[0];
  assert.deepEqual(dm.recipient, { id: '123' });
  assert.match(dm.message.text, /https:\/\/example\.com\/kit/); assert.ok(dm.message.text.endsWith(DEFAULT_DISCLOSURE));
  assert.equal(await e.KV.get('pending:123'), null);
  const check = g.find((c) => c.query.fields === 'is_user_follow_business');
  assert.equal(check.length, 1); assert.ok(check[0].path.endsWith('/123'));
});

test('step 2: someone who does not follow gets a reminder with a button, then the link once they do; the limit ends it', async () => {
  const e = env(); await handleComment(e, comment(), rules(), meta());
  const g = meta({ follows: { 123: false } });
  const a = await handleReply(e, msg(), rules(), g);
  assert.equal(a.rec.step, 'nudge'); assert.equal(a.rec.nudges, 1);
  const n = sends(g)[0];
  assert.ok(!/https?:/.test(n.message.text)); assert.equal(n.message.quick_replies[0].title, "I'm following");
  assert.equal(JSON.parse(await e.KV.get('pending:123')).nudges, 1);
  const b = await handleReply(e, msg(), rules(), g);                                         // second reminder (max 2)
  assert.equal(b.rec.nudges, 2);
  const c = await handleReply(e, msg(), rules(), g);                                         // a third: give up, no link
  assert.equal(c.action, 'defer'); assert.match(c.rec.why, /still not following after 2 reminders/);
  assert.equal(await e.KV.get('pending:123'), null);
  assert.ok(!sends(g).some((m) => /example\.com/.test(m.message.text)));
  // a person who follows between reminders gets the link
  const e2 = env(); await handleComment(e2, comment(), rules(), meta());
  await handleReply(e2, msg(), rules(), meta({ follows: { 123: false } }));
  const g2 = meta({ follows: { 123: true } });
  assert.equal((await handleReply(e2, msg(), rules(), g2)).rec.step, 'link');
});

test('step 2: if Meta does not say whether they follow, or the check fails, nothing is sent and they stay pending', async () => {
  const e = env(); await handleComment(e, comment(), rules(), meta());
  const g = meta({ follows: { 123: 'missing' } });
  const a = await handleReply(e, msg(), rules(), g);
  assert.equal(a.action, 'error'); assert.match(a.rec.why, /did not say whether/);
  assert.equal(sends(g).length, 0); assert.ok(await e.KV.get('pending:123'));
  const g2 = meta({ fail: { is_user_follow_business: { message: 'User consent is required', code: 10, status: 403 } } });
  const b = await handleReply(e, msg(), rules(), g2);
  assert.equal(b.action, 'error'); assert.match(b.rec.why, /follow check failed: .*User consent/);
  assert.equal(sends(g2).length, 0);
});

test('step 2: only people who were asked get an answer, and each message is handled once', async () => {
  const e = env(); const g = meta({ follows: { 123: true, 777: true } });
  assert.equal((await handleReply(e, msg({ from_id: '777' }), rules(), g)).why, 'nobody was asked');         // never asked
  await handleComment(e, comment(), rules(), meta());
  assert.equal((await handleReply(e, msg({ echo: true }), rules(), g)).action, 'skip');                         // our own message
  assert.equal((await handleReply(e, msg({ from_id: '999' }), rules(), g)).action, 'skip');                     // our own account
  const m = msg();
  const g2 = meta({ follows: { 123: false } });
  assert.equal((await handleReply(e, m, rules(), g2)).action, 'lead');                                          // a reminder
  assert.equal((await handleReply(e, m, rules(), g2)).why, 'already handled');                                  // Meta retried: no second reminder
  assert.equal(sends(g2).length, 1);
  const done = msg();
  assert.equal((await handleReply(e, done, rules(), g)).rec.step, 'link');                                      // the link, once
  assert.equal((await handleReply(e, done, rules(), g)).action, 'skip');                                        // a retry finds nobody waiting
  assert.equal(sends(g).length, 1);
});

test('step 2: dry run and an untested rule send nothing', async () => {
  const e = env(); await handleComment(e, comment(), rules(), meta());
  const g = meta({ follows: { 123: true } });
  e.MODE = 'dry_run';
  assert.equal((await handleReply(e, msg(), rules(), g)).action, 'dry');
  e.MODE = 'live';
  assert.equal((await handleReply(e, msg(), loadRules({ rules: [{ ...RULE, tested: false }] }), g)).rec.why, 'rule not tested');
  assert.equal(g.calls.length, 0);
});

test('step 2: a rule that no longer asks for a follow ends the wait without sending', async () => {
  const e = env(); await handleComment(e, comment(), rules(), meta());
  const g = meta({ follows: { 123: true } });
  const out = await handleReply(e, msg(), loadRules({ rules: [{ ...RULE, require_follow: false }] }), g);
  assert.equal(out.action, 'defer'); assert.equal(g.calls.length, 0); assert.equal(await e.KV.get('pending:123'), null);
});

test('events: a tapped button arrives as a short reply', () => {
  const ev = extractEvents({ entry: [{ id: '999', time: 1700000000, messaging: [{ sender: { id: '123' }, recipient: { id: '999' }, timestamp: 1700000000123, postback: { mid: 'pb1', title: 'Send me the link', payload: 'FOLLOW_CHECK' } }] }] });
  assert.equal(ev.messages[0].mid, 'pb1'); assert.equal(ev.messages[0].from_id, '123'); assert.equal(ev.messages[0].echo, false);
});

test('the webhook runs both steps end to end', async () => {
  const work = []; const c = { waitUntil: (p) => work.push(p) };
  const e = env({ APP_SECRET: 's3cret', KV: kv({ rules: JSON.stringify({ rules: [RULE] }) }) });
  const sign = async (body) => { const k = await crypto.subtle.importKey('raw', new TextEncoder().encode('s3cret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); return 'sha256=' + [...new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(body)))].map((b) => b.toString(16).padStart(2, '0')).join(''); };
  const post = async (payload) => { const body = JSON.stringify(payload); return worker.fetch(new Request('https://pub.example/webhook', { method: 'POST', body, headers: { 'X-Hub-Signature-256': await sign(body) } }), e, c); };
  const realFetch = globalThis.fetch; const g = meta({ follows: { 123: true } }); globalThis.fetch = g;
  try {
    await post({ entry: [{ id: '999', time: Math.floor(Date.now() / 1000), changes: [{ field: 'comments', value: { id: 'cw1', text: 'kit', from: { id: '123', username: 'fan' }, media: { id: 'm1' } } }] }] });
    await Promise.all(work.splice(0));
    await post({ entry: [{ id: '999', time: Math.floor(Date.now() / 1000), messaging: [{ sender: { id: '123' }, recipient: { id: '999' }, timestamp: Date.now(), message: { mid: 'wm1', text: 'Send me the link', quick_reply: { payload: 'FOLLOW_CHECK' } } }] }] });
    await Promise.all(work.splice(0));
  } finally { globalThis.fetch = realFetch; }
  const dms = sends(g);
  assert.equal(dms.length, 2); assert.ok(!/https?:/.test(dms[0].message.text)); assert.match(dms[1].message.text, /example\.com\/kit/);
});

test('forget removes a pending wait, and the admin follow check answers without a secret', async () => {
  const e = env(); await handleComment(e, comment(), rules(), meta());
  assert.ok(await e.KV.get('pending:123'));
  await forgetUser(e, '@fan');
  assert.equal(await e.KV.get('pending:123'), null);
  assert.deepEqual(await followCheck(e, '123456', meta({ follows: { 123456: true } })), { follows: true });
  assert.equal((await followCheck(e, '123456', meta({ follows: { 123456: 'missing' } }))).follows, null);
  assert.match((await followCheck(e, 'abc')).error, /digits/);
  const r = await worker.fetch(new Request('https://pub.example/admin/follow-check?id=abc', { headers: auth }), e, ctx);
  assert.equal(r.status, 200);
  assert.equal((await worker.fetch(new Request('https://pub.example/admin/follow-check?id=123456'), e, ctx)).status, 403);
});
