// BagelUnit Reel Kit publisher: one Cloudflare Worker per brand.
//
// It does two jobs:
//   1. Posting (publish.js): approved reels, images, carousels and stories go out at their scheduled time on
//      Instagram, and reels also on the brand's Facebook Page and Threads when the owner asks.
//   2. Comment auto-replies (this file): Meta sends each new comment on the brand's posts to POST /webhook. A comment
//      that matches a rule's keyword gets one link-free public reply and one private reply (a DM) with the resource.
//      Comments that match no rule are left for a person. Mentions and messages are stored so the kit's dashboard
//      can show them (GET /admin/inbox); the Worker never answers a message by itself.
//
// Safety for auto-replies, in order:
//   MODE        "dry_run" (default) logs what it would send and sends nothing. Only "live" sends.
//   rule.tested a rule sends only when tested is true (the keyword was tried from a second account). Untested = logged.
//   disclosure  every automatic DM ends with a short line saying it is automated (default "(This is an automated
//               reply.)"; set "disclosure" in rules.json or the DM_DISCLOSURE var to change the words). Some places
//               require it by law, and Meta's policy follows the law.
//   dedupe      a comment is claimed in KV before anything is sent, so Meta's retries never send twice.
//   own account comments by the brand's own account are ignored (no reply loops).
//   7 days      Meta allows one private reply only within 7 days of the comment; older ones are left for a person.
//   rate cap    at most MAX_PER_HOUR sends an hour; the rest are left for a person.
//   no links    a public reply containing a link is refused when the rules load (links go in the DM only).
//
// Bindings (wrangler.toml and secrets): KV, MEDIA (R2), APP_SECRET, VERIFY_TOKEN, ADMIN_KEY, IG_USER_ID, IG_TOKEN,
// FB_PAGE_ID, FB_PAGE_TOKEN, THREADS_USER_ID, THREADS_TOKEN, and the vars BRAND, API_SETUP, MODE, PUBLISH_MODE,
// PUBLISH_MODE_INSTAGRAM, PUBLISH_MODE_FACEBOOK, PUBLISH_MODE_THREADS, MAX_PER_HOUR, MAX_PER_RUN, GRAPH_VERSION,
// DM_DISCLOSURE, and optionally FETCH_TIMEOUT_MS (25000) and INBOX_MAX (200). Secrets are never logged or shown.

import { instagramApi, isUnified, refreshTokens } from './graph.js';
import { handleUpload, deleteUpload, schedulePost, cancelPost, serveMedia, runDue, listPosts, publicPost, platformsView } from './publish.js';

const DAY = 24 * 3600 * 1000;
const KEEP = 90 * 24 * 3600;                 // comment, mention and message records are kept 90 days
const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|ca|io|ai|co|net|org|dev|app|link|ly)\b)/i;
export const DEFAULT_DISCLOSURE = '(This is an automated reply.)';

// ---------- rules ----------
// The disclosure line always goes on: an empty or missing setting means the default words.
export function disclosureLine(raw, env = {}) {
  const d = String(raw?.disclosure ?? env.DM_DISCLOSURE ?? '').trim();
  return d || DEFAULT_DISCLOSURE;
}
export function withDisclosure(dm, line) {
  const text = String(dm).trimEnd();
  return text.endsWith(line) ? text : `${text}\n\n${line}`;
}

export function loadRules(raw, env = {}) {
  if (!raw) return [];
  const line = disclosureLine(raw, env);
  return (raw.rules || []).map((r, i) => {
    const name = r.name || `rule ${i + 1}`;
    if (!Array.isArray(r.match_text) || !r.match_text.length) throw new Error(`${name}: match_text must list at least one keyword`);
    if (!r.reply || !r.dm) throw new Error(`${name}: needs both reply (public, no link) and dm`);
    if (LINK.test(r.reply)) throw new Error(`${name}: the public reply contains a link; links go in the dm only`);
    return {
      name,
      words: r.match_text.map((w) => String(w).trim().toLowerCase()).filter(Boolean),
      media: Array.isArray(r.match_media_id) ? r.match_media_id.map(String) : null,
      reply: r.reply,
      dm: withDisclosure(r.dm, line),
      tested: r.tested === true,
    };
  });
}

export function matchRule(rules, text, mediaId) {
  const t = ` ${String(text || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ')} `;
  for (const r of rules) {
    if (r.media && !r.media.includes(String(mediaId))) continue;
    if (r.words.some((w) => t.includes(` ${w.replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `))) return r;
  }
  return null;
}

// ---------- webhook plumbing ----------
// Meta signs each webhook with the app secret (X-Hub-Signature-256: sha256=<hex HMAC of the raw body>).
export async function verifySignature(rawBody, header, secret) {
  if (!header || !header.startsWith('sha256=') || !secret) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody)));
  const hex = [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');
  const given = header.slice(7).toLowerCase();
  if (given.length !== hex.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

const ms = (t) => (t ? Number(t) * (String(t).length <= 10 ? 1000 : 1) : Date.now());

// Two strings compared in constant time (their SHA-256 digests, so even the length does not show): the admin key and
// the webhook's verify token.
export async function sameSecret(given, want) {
  if (!want || typeof given !== 'string') return false;
  const d = async (x) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(x)));
  const [a, b] = await Promise.all([d(given), d(String(want))]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// Every event the Worker cares about, from both payload shapes Meta documents:
// entry[].changes[] (Unified and Facebook Login) and entry[].field + value (Instagram Login), plus entry[].messaging[].
export function extractEvents(payload) {
  const comments = []; const mentions = []; const messages = [];
  for (const entry of payload?.entry || []) {
    const items = Array.isArray(entry.changes) ? entry.changes : (entry.field ? [{ field: entry.field, value: entry.value }] : []);
    for (const ch of items) {
      const v = ch?.value;
      if (!v) continue;
      if (ch.field === 'comments') {
        comments.push({
          account: String(entry.id || ''), id: String(v.id || v.comment_id || ''), text: v.text || '',
          fromId: String(v.from?.id || ''), username: v.from?.username || '', mediaId: String(v.media?.id || ''),
          parentId: v.parent_id ? String(v.parent_id) : null, time: ms(entry.time),
        });
      } else if (ch.field === 'mentions') {
        mentions.push({ account: String(entry.id || ''), media_id: String(v.media_id || ''), comment_id: v.comment_id ? String(v.comment_id) : null, time: ms(entry.time) });
      }
    }
    for (const m of entry.messaging || []) {
      if (!m?.message?.mid) continue;
      messages.push({
        account: String(entry.id || ''), mid: String(m.message.mid), from_id: String(m.sender?.id || ''), to_id: String(m.recipient?.id || ''),
        text: m.message.text || '', echo: m.message.is_echo === true, deleted: m.message.is_deleted === true,
        attachments: (m.message.attachments || []).map((a) => a?.type).filter(Boolean), time: ms(m.timestamp || entry.time),
      });
    }
  }
  return { comments: comments.filter((c) => c.id), mentions: mentions.filter((x) => x.media_id || x.comment_id), messages };
}
export const extractComments = (payload) => extractEvents(payload).comments;

export async function rulesFromKV(env) {
  const raw = await env.KV.get('rules');
  return raw ? loadRules(JSON.parse(raw), env) : [];
}

// ---------- records and their list metadata ----------
// Each comment, mention and message record also carries its fields (trimmed to fit KV's 1,024 bytes of metadata) in
// the key's metadata, so GET /admin/inbox and forget read one list call per 1,000 records instead of one read per
// record (a request may make at most 1,000 KV operations).
const META_MAX = 1000;
const SHORTEN = ['would_dm', 'would_reply', 'text', 'why', 'reply', 'dm'];
export function recordMeta(rec) {
  const m = { ...rec };
  const size = () => new TextEncoder().encode(JSON.stringify(m)).length;
  for (const k of SHORTEN) {
    while (size() > META_MAX && typeof m[k] === 'string' && m[k].length) { m[k] = m[k].slice(0, Math.floor(m[k].length / 2)); m.cut = true; }
  }
  return size() > META_MAX ? { kind: rec.kind, at: rec.at, username: rec.username, from_id: rec.from_id, to_id: rec.to_id, cut: true } : m;
}
const putRecord = (env, key, rec) => env.KV.put(key, JSON.stringify(rec), { expirationTtl: KEEP, metadata: recordMeta(rec) });

// ---------- the decision for one comment ----------
async function log(env, kind, c, extra = {}) {
  const rec = { kind, comment_id: c.id, username: c.username, from_id: c.fromId, media_id: c.mediaId, text: c.text.slice(0, 300), at: new Date().toISOString(), ...extra };
  await putRecord(env, `${kind}:${c.id}`, rec);
  return rec;
}

async function underRateCap(env) {
  const key = `rate:${new Date().toISOString().slice(0, 13)}`;
  const n = Number((await env.KV.get(key)) || 0);
  if (n >= Number(env.MAX_PER_HOUR || 30)) return false;
  await env.KV.put(key, String(n + 1), { expirationTtl: 7200 });
  return true;
}

export async function handleComment(env, c, rules, fetchImpl = fetch) {
  const own = env.IG_USER_ID || c.account;
  if (c.fromId && (c.fromId === own || c.fromId === c.account)) return { action: 'skip', why: 'own account' };
  if (await env.KV.get(`done:${c.id}`)) return { action: 'skip', why: 'already handled' };
  await env.KV.put(`done:${c.id}`, '1', { expirationTtl: 30 * 24 * 3600 });   // claim first: retries never send twice

  const rule = matchRule(rules, c.text, c.mediaId);
  if (!rule) return { action: 'defer', rec: await log(env, 'defer', c, { why: 'no rule matched' }) };
  if (Date.now() - c.time > 7 * DAY) return { action: 'defer', rec: await log(env, 'defer', c, { why: 'older than 7 days', rule: rule.name }) };

  const live = env.MODE === 'live' && rule.tested;
  if (!live) {
    const why = env.MODE !== 'live' ? 'dry run' : 'rule not tested';
    return { action: 'dry', rec: await log(env, 'dry', c, { why, rule: rule.name, would_reply: rule.reply, would_dm: rule.dm }) };
  }
  if (!(await underRateCap(env))) return { action: 'defer', rec: await log(env, 'defer', c, { why: 'hourly cap reached', rule: rule.name }) };

  const api = instagramApi(env, fetchImpl);
  const result = { rule: rule.name };
  try { await api.post(`${c.id}/replies`, { message: rule.reply }); result.reply = 'sent'; }
  catch (e) { result.reply = `failed: ${e.message}`; }
  try { await api.post(`${env.IG_USER_ID || c.account}/messages`, { recipient: { comment_id: c.id }, message: { text: rule.dm } }); result.dm = 'sent'; }
  catch (e) { result.dm = `failed: ${e.message}`; }
  const kind = result.dm === 'sent' ? 'lead' : 'error';
  return { action: kind, rec: await log(env, kind, c, result) };
}

// Mentions and messages are only stored, for the dashboard. A deleted message removes our copy too.
export async function storeMention(env, m) {
  const id = m.comment_id || m.media_id;
  const rec = { kind: 'mention', media_id: m.media_id || null, comment_id: m.comment_id, at: new Date(m.time).toISOString() };
  await putRecord(env, `mention:${id}`, rec);
  return rec;
}
export async function storeMessage(env, m) {
  if (m.deleted) { await env.KV.delete(`message:${m.mid}`); return null; }
  const rec = { kind: 'message', mid: m.mid, direction: m.echo ? 'sent' : 'received', from_id: m.from_id, to_id: m.to_id, text: m.text.slice(0, 500), attachments: m.attachments, at: new Date(m.time).toISOString() };
  await putRecord(env, `message:${m.mid}`, rec);
  return rec;
}

// ---------- admin view ----------
// The newest `cap` records of one kind. Pages through every key with cursors (one list call per 1,000 keys) and uses
// the metadata; only a record written before metadata existed is read, within the request's shared read budget.
export const INBOX_MAX = 200;
export const opsBudget = (n = 900) => ({ left: n });
export async function listKind(env, kind, { cap = INBOX_MAX, ops = opsBudget() } = {}) {
  const rows = []; const old = [];
  let cursor; let complete = true;
  do {
    if (ops.left <= 0) { complete = false; break; }
    ops.left--;
    const page = await env.KV.list({ prefix: `${kind}:`, cursor });
    for (const k of page.keys) (k.metadata ? rows.push(k.metadata) : old.push(k.name));
    cursor = page.list_complete === false ? page.cursor : undefined;
  } while (cursor);
  for (const name of old) {
    if (ops.left <= 0) { complete = false; break; }
    ops.left--;
    const raw = await env.KV.get(name);
    if (raw) try { rows.push(JSON.parse(raw)); } catch {}
  }
  rows.sort((a, b) => (a.at < b.at ? 1 : -1));
  return { rows: rows.slice(0, cap), more: rows.length > cap || !complete };
}

export async function inbox(env, cap = Number(env.INBOX_MAX) || INBOX_MAX) {
  const ops = opsBudget();
  const kinds = ['mention', 'message', 'lead', 'dry', 'defer', 'error'];
  const got = {}; let more = false;
  for (const k of kinds) { const r = await listKind(env, k, { cap, ops }); got[k] = r.rows; more ||= r.more; }
  return {
    brand: env.BRAND || null, mode: env.MODE === 'live' ? 'live' : 'dry_run', newest: cap, more,
    mentions: got.mention, messages: got.message,
    replies: { sent: got.lead, dry_run: got.dry, left_for_a_person: got.defer, errors: got.error },
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: { 'Content-Type': 'application/json' } });
}

// ---------- data deletion ----------
// The brand's privacy and data-deletion page is stored in KV under "privacy_html" and served at /privacy and
// /data-deletion for Meta's app settings (when the brand has its own website, point Meta there instead).
const PERSONAL_KINDS = ['lead', 'defer', 'dry', 'error', 'message'];

// Deletes every record of one person: comment records whose username or Instagram-scoped id matches, and message
// records (which hold only ids) whose sender or recipient is one of that person's ids, found in their comment records
// first. A request may make at most 1,000 KV operations, so this works in pages: an answer with done: false carries
// a `next` token, and the caller (forget.mjs) asks again with it until done. The last answer lists the ids it matched,
// so the kit can remove the same person from brand/inbox-log.md.
const COMMENT_KINDS = ['lead', 'defer', 'dry', 'error'];
const enc = (o) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const dec = (s) => { try { return JSON.parse(atob(String(s).replace(/-/g, '+').replace(/_/g, '/'))); } catch { return null; } };
export async function forgetUser(env, who, next = null, ops = opsBudget()) {
  const want = String(who || '').trim().replace(/^@/, '').toLowerCase();
  if (!want) return { removed: 0, error: 'username or id required' };
  const state = (next && dec(next)) || { k: 0, c: null, ids: [] };
  const ids = new Set(state.ids || []);
  if (/^\d+$/.test(want)) ids.add(want);
  const own = String(env.IG_USER_ID || '');
  const deleted = new Set();                              // a list may still show a key deleted a moment ago
  let removed = 0;
  for (let k = state.k; k < PERSONAL_KINDS.length; k++) {
    const kind = PERSONAL_KINDS[k];
    let cursor = k === state.k ? state.c : null;
    do {
      if (ops.left < 520) return { removed, done: false, next: enc({ k, c: cursor, ids: [...ids] }) };   // room for a full page
      ops.left--;
      const page = await env.KV.list({ prefix: `${kind}:`, cursor: cursor || undefined, limit: 250 });
      let gone = 0;
      for (const key of page.keys) {
        if (deleted.has(key.name)) continue;
        let rec = key.metadata;
        if (!rec) { ops.left--; const raw = await env.KV.get(key.name); if (!raw) continue; try { rec = JSON.parse(raw); } catch { continue; } }
        const user = String(rec.username || '').toLowerCase(), from = String(rec.from_id || ''), to = String(rec.to_id || '');
        const hit = COMMENT_KINDS.includes(kind)
          ? user === want || from.toLowerCase() === want
          : ids.has(from) || ids.has(to) || from.toLowerCase() === want || to.toLowerCase() === want;
        if (!hit) continue;
        if (COMMENT_KINDS.includes(kind) && from && from !== own) ids.add(from);
        ops.left--; await env.KV.delete(key.name); deleted.add(key.name); removed++; gone++;
      }
      // After deleting, read the same page again (from the same cursor), so no key moves past the cursor unseen;
      // each pass deletes something or moves on, so it ends.
      if (gone) continue;
      cursor = page.list_complete === false ? page.cursor : null;
      if (!cursor) break;
    } while (true);
  }
  ids.delete(own);
  return { removed, done: true, ids: [...ids] };
}

// ---------- entry points ----------
// Meta's fetchers (facebookexternalhit for the Facebook upload) obey robots.txt: the media addresses stay allowed.
const ROBOTS = 'User-agent: *\nAllow: /media/\nDisallow: /admin\nDisallow: /webhook\n';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/robots.txt') return new Response(ROBOTS, { headers: { 'Content-Type': 'text/plain' } });
    if (url.pathname === '/webhook' && request.method === 'GET') {
      const ok = url.searchParams.get('hub.mode') === 'subscribe' && (await sameSecret(url.searchParams.get('hub.verify_token'), env.VERIFY_TOKEN));
      return ok ? new Response(url.searchParams.get('hub.challenge') || '', { status: 200 }) : new Response('forbidden', { status: 403 });
    }
    if (url.pathname === '/webhook' && request.method === 'POST') {
      const raw = await request.text();
      if (!(await verifySignature(raw, request.headers.get('X-Hub-Signature-256'), env.APP_SECRET))) return new Response('bad signature', { status: 401 });
      let payload;
      try { payload = JSON.parse(raw); } catch { return new Response('ok', { status: 200 }); }
      const ev = extractEvents(payload);
      const rules = ev.comments.length ? await rulesFromKV(env).catch((e) => { console.log('rules error', e.message); return []; }) : [];
      const work = [
        ...ev.comments.map((c) => handleComment(env, c, rules).catch((e) => console.log('comment error', c.id, e.message))),
        ...ev.mentions.map((m) => storeMention(env, m).catch((e) => console.log('mention error', e.message))),
        ...ev.messages.map((m) => storeMessage(env, m).catch((e) => console.log('message error', e.message))),
      ];
      ctx.waitUntil(Promise.all(work));      // answer Meta at once; do the work after
      return new Response('ok', { status: 200 });
    }
    if ((url.pathname === '/privacy' || url.pathname === '/data-deletion') && request.method === 'GET') {
      const html = await env.KV.get('privacy_html');
      return html ? new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }) : new Response('not found', { status: 404 });
    }
    const media = url.pathname.match(/^\/media\/([0-9a-f]{64})\.(mp4|jpg)$/);
    if (media && (request.method === 'GET' || request.method === 'HEAD')) return serveMedia(env, media[1], request);

    if (!url.pathname.startsWith('/admin')) return new Response('not found', { status: 404 });
    if (!env.ADMIN_KEY || !(await sameSecret(request.headers.get('Authorization') || '', `Bearer ${env.ADMIN_KEY}`))) return new Response('forbidden', { status: 403 });
    if (url.pathname === '/admin/forget' && request.method === 'POST') return json(await forgetUser(env, url.searchParams.get('who'), url.searchParams.get('next')));
    if (url.pathname === '/admin/upload' && request.method === 'PUT') { const r = await handleUpload(request, env, url); return json(r.body, r.status); }
    if (url.pathname === '/admin/upload' && request.method === 'DELETE') { const r = await deleteUpload(env, url.searchParams.get('key') || ''); return json(r.body, r.status); }
    if (url.pathname === '/admin/schedule' && request.method === 'POST') {
      let data; try { data = await request.json(); } catch { return json({ error: 'send JSON' }, 400); }
      const r = await schedulePost(env, data, url.origin); return json(r.body, r.status);
    }
    const cancel = url.pathname.match(/^\/admin\/cancel\/([0-9a-f]{12})$/);
    if (cancel && request.method === 'POST') { const r = await cancelPost(env, cancel[1]); return json(r.body, r.status); }
    if (url.pathname === '/admin/inbox' && request.method === 'GET') return json(await inbox(env));
    if (url.pathname === '/admin' && request.method === 'GET') {
      let rules = [], rulesError = null;
      try { rules = await rulesFromKV(env); } catch (e) { rulesError = e.message; }
      return json({
        brand: env.BRAND || null,
        api_setup: isUnified(env) ? 'unified' : 'instagram',
        graph_version: env.GRAPH_VERSION || 'v27.0',
        mode: env.MODE === 'live' ? 'live' : 'dry_run',
        rules_error: rulesError,
        rules: rules.map((r) => ({ name: r.name, keywords: r.words, tested: r.tested, scoped_to_media: r.media })),
        disclosure: disclosureLine(await env.KV.get('rules').then((r) => JSON.parse(r || 'null')).catch(() => null), env),
        platforms: platformsView(env),
        token_refreshed_at: await env.KV.get('token_refreshed_at'),
        threads_token_refreshed_at: await env.KV.get('threads_token_refreshed_at'),
        posts: (await listPosts(env)).map(publicPost),
      });
    }
    return new Response('not found', { status: 404 });
  },

  // One cron (every 5 minutes): due posts, then the token refresh when one is due (about weekly, at most one try a
  // day, and never while the platforms that use the token are all in dry run; graph.js). One trigger per brand keeps
  // within the free plan's 5 cron triggers per account.
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      const r = await runDue(env).catch((e) => { console.log('publish error', e.message); return []; });
      if (r.length) console.log('publish', JSON.stringify(r));
      const t = await refreshTokens(env).catch((e) => ({ error: e.message }));
      if (Object.keys(t).length) console.log('token refresh', JSON.stringify(t));
    })());
  },
};
