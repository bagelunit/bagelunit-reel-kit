#!/usr/bin/env node
// Read this brand's own Instagram numbers through Meta's official API. Read only: it never posts, comments or sends.
//
//   node .claude/skills/content-calendar/instagram.mjs [brand folder]           pull now
//   node .claude/skills/content-calendar/instagram.mjs [brand folder] --check   test the connection, change nothing
//
// Needs a file the brand owner writes themselves (docs/connect.md, step 2):
//   ~/.config/bagelunit-reels/instagram-<brand slug>.json
//     {"access_token": "..."}                                           Instagram Login (graph.instagram.com)
//     {"access_token": "...", "login": "unified"}                       Unified Login (graph.facebook.com; also "facebook")
//     the first --check finds the Instagram account's id and saves it as "ig_user_id": in instagram-<slug>.json, or, for
//     a token shared by several brands (instagram.json), in instagram-<slug>.ids.json (lib.mjs brandId)
//     optional: "api_version": "v27.0", "online_hours_tz": "America/Los_Angeles"
// What it reads: the account (followers, posts), every post's numbers, account insights for the last 7 and 28 days
// (reach for followers and non-followers, views, accounts engaged, interactions, follows and unfollows, profile taps),
// follower and engaged-audience demographics, the hours followers are online, stories with their numbers, posts the
// account is tagged in, and recent comments. It writes brand/instagram.json, one row a day in brand/followers.csv, and a
// 7-day row in brand/insights.csv for each matched kit reel. It renews an Instagram Login token before it runs out.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { brandRoot, brandSlug, readJSON, read, secretFile, writeSecret, writeStatus, writeAtomic, csv, load, isShared, idsFile, brandId, saveBrandId, CONFIG_DIR } from './lib.mjs';

const REEL_METRICS = ['views', 'reach', 'likes', 'comments', 'saved', 'shares', 'reposts', 'total_interactions', 'ig_reels_avg_watch_time', 'reels_skip_rate'];
const FEED_METRICS = ['views', 'reach', 'likes', 'comments', 'saved', 'shares', 'reposts', 'total_interactions'];
const STORY_METRICS = ['views', 'reach', 'replies', 'shares', 'total_interactions', 'follows', 'profile_visits'];
const FRESH_DAYS = 120;                     // posts younger than this get fresh numbers on every pull; older ones once a week
const RATE = [4, 17, 32, 613];
const API_VERSION = 'v27.0';                // the same version on graph.instagram.com and graph.facebook.com
const BUDGET_MS = 3 * 60e3;                 // a whole pull stops after 3 minutes and keeps what it read
// a network error or a timeout (code 'NET') is treated like the rate limit: stop asking, keep what was read
export const stops = (e) => e.code === 190 || e.code === 'NET' || RATE.includes(e.code);

export class Plain extends Error {}         // an error whose message is safe to show (never holds the token)

// one place that talks to Meta, for every login type (comments.mjs and dms.mjs use it too)
export function connect(root, { findId = false } = {}) {
  const slug = brandSlug(root);
  const file = secretFile('instagram', slug);
  if (!file) throw new Plain(`no Instagram connection for this brand: the owner creates ${path.join(CONFIG_DIR, `instagram-${slug}.json`)} (docs/connect.md)`);
  const cfg = readJSON(file, null);
  if (!cfg?.access_token) throw new Plain(`${file} has no "access_token"`);
  const login = ['unified', 'facebook'].includes(cfg.login) ? cfg.login : 'instagram';
  // the account id is this brand's own: from instagram-<slug>.json, or from instagram-<slug>.ids.json for a shared token
  const igId = brandId('instagram', slug, file, cfg, 'ig_user_id');
  if (login !== 'instagram' && !igId && !findId) throw new Plain('the Instagram account id is not saved yet: run /content-calendar connect instagram (its check finds and saves it)');
  const host = process.env.BAGELUNIT_IG_HOST || (login === 'instagram' ? 'https://graph.instagram.com' : 'https://graph.facebook.com');   // the env setting is for tests only
  const base = `${host}/${cfg.api_version || API_VERSION}`;
  const me = login === 'instagram' ? 'me' : igId || null;
  const hide = (s) => String(s).split(cfg.access_token).join('***');
  async function call(method, p, params = {}) {
    const url = new URL(p.startsWith('http') ? p : `${base}/${p.replace(/^\//, '')}`);
    url.searchParams.delete('access_token');          // Meta's paging links carry the token; it goes in the header instead
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : v);
    // the token travels in the Authorization header (Meta's docs for both hosts); only a call that Meta documents
    // with the token in the address (refresh_access_token) passes it as a parameter
    const headers = url.searchParams.has('access_token') ? {} : { Authorization: `Bearer ${cfg.access_token}` };
    const left = api.deadline ? api.deadline - Date.now() : 30000;
    if (left <= 0) throw Object.assign(new Plain('the time for this pull ran out (Instagram answered slowly): the rest comes next time'), { code: 'NET' });
    let res;
    try { res = await fetch(url, { method, headers, signal: AbortSignal.timeout(Math.min(30000, Math.max(1000, left))) }); }
    catch (e) { throw Object.assign(new Plain(`could not reach Instagram (${hide(e.cause?.code || e.name || 'network error')})`), { code: 'NET' }); }
    const body = await res.json().catch((e) => (/Timeout|Abort/.test(e?.name) ? null : {}));
    if (body === null) throw Object.assign(new Plain('Instagram stopped answering part way (timeout)'), { code: 'NET' });
    if (!res.ok || body.error) {
      const e = body.error || {};
      const why = e.code === 190 ? 'the token is not valid any more (expired or revoked): make a new one, see docs/connect.md'
        : e.code === 10 || e.code === 200 ? `the token is missing a permission for this (${hide(e.message || 'permission')})`
        : RATE.includes(e.code) ? 'Instagram rate limit reached: it will work again later'
        : hide(e.message || `HTTP ${res.status}`);
      throw Object.assign(new Plain(why), { code: e.code, status: res.status });
    }
    return body;
  }
  const api = { cfg, file, slug, login, me, deadline: 0, get: (p, params) => call('GET', p, params), post: (p, params) => call('POST', p, params), del: (p, params) => call('DELETE', p, params) };
  return api;
}

// metrics Meta refused this run (it renames and retires them often), kept per kind of post: a metric refused for a
// feed post may still work for a reel
const refused = new Set();
const readValues = (r, out = {}) => { for (const d of r.data || []) out[d.name] = d.values?.[0]?.value ?? d.total_value?.value ?? null; return out; };
async function metricsFor(api, id, metrics, kind) {
  const list = metrics.filter((m) => !refused.has(`${kind}:${m}`));
  if (!list.length) return {};
  try { return readValues(await api.get(`${id}/insights`, { metric: list.join(',') })); }
  catch (e) {
    if (stops(e) || (e.code !== 100 && e.status !== 400)) throw e;
    const out = {};                          // one was refused: ask for each on its own, keep what works
    for (const m of list) {
      try { readValues(await api.get(`${id}/insights`, { metric: m }), out); }
      catch (e2) { if (stops(e2)) throw e2; refused.add(`${kind}:${m}`); }
    }
    return out;
  }
}

// account insights: one metric at a time (each has its own breakdowns); a refused metric is simply left out
async function accountInsights(api) {
  const now = Math.floor(Date.now() / 1000), day = 86400;
  const totals = async (metric, since, breakdown) => {
    try {
      const r = await api.get(`${api.me}/insights`, { metric, period: 'day', metric_type: 'total_value', since: now - since * day, until: now, ...(breakdown ? { breakdown } : {}) });
      const d = (r.data || [])[0]; if (!d) return null;
      const out = { total: d.total_value?.value ?? null };
      for (const b of d.total_value?.breakdowns || []) for (const x of b.results || []) out[x.dimension_values.join(' ')] = x.value;
      return out;
    } catch (e) { if (stops(e)) throw e; return null; }
  };
  const windows = {};
  for (const [name, days] of [['d7', 7], ['d28', 28]]) {
    windows[name] = {
      reach: await totals('reach', days, 'follow_type'),
      views: await totals('views', days),
      accounts_engaged: await totals('accounts_engaged', days),
      total_interactions: await totals('total_interactions', days),
      saves: await totals('saves', days), shares: await totals('shares', days), reposts: await totals('reposts', days),
      follows: await totals('follows_and_unfollows', days, 'follow_type'),
      profile_taps: await totals('profile_links_taps', days, 'contact_button_type'),
    };
  }
  const demographics = {};
  for (const metric of ['follower_demographics', 'engaged_audience_demographics']) {
    demographics[metric] = {};
    for (const by of ['age', 'gender', 'country', 'city']) {
      try {
        const r = await api.get(`${api.me}/insights`, { metric, period: 'lifetime', timeframe: 'this_month', breakdown: by, metric_type: 'total_value' });
        const rows = (r.data?.[0]?.total_value?.breakdowns?.[0]?.results || []).map((x) => [x.dimension_values.at(-1), x.value]).sort((a, b) => b[1] - a[1]);
        if (rows.length) demographics[metric][by] = rows.slice(0, 12);
      } catch (e) { if (stops(e)) throw e; }
    }
  }
  let online = null;
  try {
    const r = await api.get(`${api.me}/insights`, { metric: 'online_followers', period: 'lifetime', since: now - 29 * day, until: now });
    const days = (r.data?.[0]?.values || []).map((v) => v.value).filter((v) => v && typeof v === 'object' && Object.keys(v).length);
    if (days.length) {
      const avg = Array.from({ length: 24 }, (_, h) => Math.round(days.reduce((t, v) => t + (Number(v[h]) || 0), 0) / days.length));
      online = { hours: avg, days: days.length, tz: api.cfg.online_hours_tz || 'America/Los_Angeles' };
    }
  } catch (e) { if (stops(e)) throw e; }
  return { windows, demographics, online };
}

// Unified or Facebook Login: find the Instagram account this token covers and save its id for this brand, once.
// The id goes in instagram-<slug>.json, or, when the token file is shared by several brands (instagram.json), in
// instagram-<slug>.ids.json, so each brand keeps its own account (lib.mjs brandId).
async function findAccountId(root, api, log) {
  const handle = String(readJSON(path.join(root, 'brand', 'brand.json')).handle || '').replace(/^@/, '').toLowerCase();
  const shared = isShared(api.file, 'instagram');
  const list = api.login === 'unified'
    ? ((await api.get('me/assigned_instagram_accounts', { fields: 'id,username' })).data || [])
    : ((await api.get('me/accounts', { fields: 'instagram_business_account{id,username}', limit: '100' })).data || []).map((p) => p.instagram_business_account).filter(Boolean);
  // a shared token may cover other brands' accounts, so it needs the handle to match; a brand's own token may use its only account
  const pick = list.find((a) => handle && String(a.username || '').toLowerCase() === handle) || (!shared && list.length === 1 ? list[0] : null);
  const own = shared ? idsFile('instagram', api.slug) : api.file;
  if (!pick) throw new Plain(list.length ? `the token covers ${list.map((a) => '@' + a.username).join(', ')}, and none matches the handle in brand/brand.json${shared ? ' (a token shared by several brands needs the handle to match)' : ''}: fix the handle, or write {"ig_user_id": "<the account id>"} in ${own} yourself` : 'the token does not cover any Instagram professional account: when you made it, pick the account (docs/connect.md, step 2B)');
  const where = saveBrandId('instagram', api.slug, api.file, api.cfg, 'ig_user_id', pick.id);
  log(`Found @${pick.username} and saved its account id in ${where}.`);
  return connect(root);
}

// renew an Instagram Login long-lived token (it lasts 60 days). Meta renews only a token at least 24 hours old, so a
// token the kit has not renewed yet is tried on the first run and then once a day until it works; after that every
// 20 days. Each renewal records when the token runs out (expires_at), which the dashboard warns about.
async function renew(api, log) {
  const { cfg, file } = api, now = Date.now();
  const due = !cfg.refreshed_at || now - new Date(cfg.refreshed_at) > 20 * 864e5 || !cfg.expires_at;
  if (!due || (cfg.refresh_tried_at && now - new Date(cfg.refresh_tried_at) < 20 * 3600e3)) return;
  try {
    const host = process.env.BAGELUNIT_IG_HOST || 'https://graph.instagram.com';
    // Meta documents this call with the token as a parameter, so it is sent that way (hide() still masks it in errors)
    const r = await api.get(`${host}/refresh_access_token`, { grant_type: 'ig_refresh_token', access_token: cfg.access_token });
    if (!r.access_token) throw new Plain('Meta returned no token');
    Object.assign(cfg, { access_token: r.access_token, refreshed_at: new Date().toISOString(), expires_at: new Date(now + (Number(r.expires_in) || 60 * 86400) * 1000).toISOString() });
    delete cfg.refresh_tried_at;
    writeSecret(file, cfg);
    log('Renewed the Instagram token (saved in the same file).');
  } catch (e) {                         // a token that is not valid any more shows on the next call, with its own message
    cfg.refresh_tried_at = new Date().toISOString(); writeSecret(file, cfg);
    log(`Could not renew the token yet (Meta renews a token once it is a day old; the next refresh tries again): ${e.message}`);
  }
}

export async function pull(root, { check = false, log = console.log, budgetMs = Number(process.env.BAGELUNIT_IG_BUDGET_MS) || BUDGET_MS } = {}) {
  let api = connect(root, { findId: true });
  if (!api.me) api = await findAccountId(root, api, log);
  const { cfg, file } = api;
  if (!check && api.login === 'instagram') await renew(api, log);

  const account = await api.get(api.me, { fields: `id,${api.login === 'instagram' ? 'user_id,' : ''}username,name,account_type,followers_count,follows_count,media_count` });
  // keep the account id for this brand (Unified Login saves it when it finds it; Instagram Login reads it here), so the
  // publisher's secrets step (publisher/scripts/setup.mjs secrets) never needs it copied by hand. With Instagram Login,
  // /me "id" is an app-scoped id; the professional account id (the one publishing and webhooks use) is "user_id".
  const igId = api.login === 'instagram' ? account?.user_id : account?.id;
  if (igId && brandId('instagram', api.slug, file, cfg, 'ig_user_id') !== String(igId)) {
    const where = saveBrandId('instagram', api.slug, file, cfg, 'ig_user_id', igId);
    log(`Saved the Instagram account id in ${where}.`);
  }
  if (check) return { account, file, login: api.login };

  api.deadline = Date.now() + budgetMs;   // one time budget for the whole pull: a slow or hung API never stretches it to hours
  const outFile = path.join(root, 'brand', 'instagram.json');
  const old = readJSON(outFile, { media: [] });
  const cached = new Map((old.media || []).map((m) => [m.id, m]));
  const media = [];
  let next = null, pages = 0, limited = false, why = '';
  const stop = (e) => { if (e.code === 190) throw e; if (e.code === 'NET' || RATE.includes(e.code)) { limited = true; why = why || (e.code === 'NET' ? 'net' : 'rate'); return true; } return false; };
  do {
    try {
      const page = next ? await api.get(next) : await api.get(`${api.me}/media`, { fields: 'id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count', limit: '50' });
      media.push(...(page.data || []));
      next = page.paging?.next || null;
    } catch (e) {
      if (!pages || !stop(e)) throw e;
      // a later page failed: keep the posts read so far and the older ones from last time
      const seen = new Set(media.map((m) => m.id));
      for (const m of old.media || []) if (!seen.has(m.id)) media.push({ ...m });
      next = null;
    }
  } while (next && ++pages < 40);

  let fetched = 0, failed = 0;
  for (const m of media) {
    const prev = cached.get(m.id);
    const age = Date.now() - new Date(m.timestamp);
    const stale = !prev?.insights || age < FRESH_DAYS * 864e5 || Date.now() - new Date(prev.insights_at || 0) > 7 * 864e5;
    if (!stale || limited) { if (prev?.insights) Object.assign(m, { insights: prev.insights, insights_at: prev.insights_at }); continue; }
    if (m.media_product_type === 'STORY') continue;
    const kind = m.media_product_type === 'REELS' ? 'REELS' : 'FEED';
    try {
      m.insights = await metricsFor(api, m.id, kind === 'REELS' ? REEL_METRICS : FEED_METRICS, kind);
      m.insights_at = new Date().toISOString(); fetched++;
    } catch (e) {
      failed++;
      if (prev?.insights) Object.assign(m, { insights: prev.insights, insights_at: prev.insights_at });
      stop(e);   // a bad token stops the pull; the rate limit, a timeout or the network stops this loop; the rest next time
    }
  }

  // the account as a whole, its audience and its online hours (kept from last time if the pull had to stop)
  let insights = old.account_insights || null;
  if (!limited) { try { insights = { ...(await accountInsights(api)), at: new Date().toISOString() }; } catch (e) { stop(e); } }

  // stories live 24 hours: read today's and keep a history of what they did
  const stories = new Map((old.stories || []).map((s) => [s.id, s]));
  if (!limited) {
    try {
      const r = await api.get(`${api.me}/stories`, { fields: 'id,media_type,permalink,timestamp,caption' });
      for (const s of r.data || []) {
        let numbers = stories.get(s.id)?.insights || null;
        if (!limited) { try { numbers = await metricsFor(api, s.id, STORY_METRICS, 'STORY'); } catch (e) { stop(e); } }
        stories.set(s.id, { ...s, insights: numbers, insights_at: new Date().toISOString() });
      }
    } catch (e) { stop(e); }
  }

  // posts the account is tagged in, and recent comments on its own posts (the newest 25 posts of the last 60 days)
  let tags = old.tags || [];
  if (!limited) { try { tags = (await api.get(`${api.me}/tags`, { fields: 'id,caption,media_type,permalink,timestamp,username', limit: '25' })).data || []; } catch (e) { stop(e); } }
  let comments = old.comments || [];
  if (!limited) {
    const fresh = [];
    let complete = true;
    for (const m of media.filter((x) => Date.now() - new Date(x.timestamp) < 60 * 864e5).slice(0, 25)) {
      try {
        const r = await api.get(`${m.id}/comments`, { fields: 'id,text,timestamp,username,like_count,hidden,replies{id,username,text,timestamp}', limit: '50' });
        for (const c of r.data || []) fresh.push({ ...c, media_id: m.id, permalink: m.permalink, replies: c.replies?.data || [] });
      } catch (e) { if (stop(e)) { complete = false; break; } }
    }
    if (complete) comments = fresh;
  }

  const data = {
    pulled_at: new Date().toISOString(), login: api.login, account, token_expires_at: cfg.expires_at || null, api: cfg.api_version || API_VERSION,
    media, account_insights: insights, stories: [...stories.values()].sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp))).slice(0, 60),
    tags, comments,
  };
  writeAtomic(outFile, JSON.stringify(data, null, 2) + '\n');

  // one follower count a day
  const fFile = path.join(root, 'brand', 'followers.csv');
  const M0 = load(root);
  if (account.followers_count != null) {
    const rows = csv(read(fFile)).rows.filter((r) => r.date && r.date !== M0.today);
    rows.push({ date: M0.today, followers: String(account.followers_count) });
    rows.sort((a, b) => a.date.localeCompare(b.date));
    writeAtomic(fFile, 'date,followers\n' + rows.map((r) => `${r.date},${r.followers}`).join('\n') + '\n');
  }

  // a 7-day row in insights.csv for each matched kit reel that has none yet (stable numbers for /analytics-readout and calibration)
  const M = load(root);
  const iFile = path.join(root, 'brand', 'insights.csv');
  const ins = csv(read(iFile));
  const head = ins.head.length ? ins.head : ['reel', 'date', 'views', 'reach', 'avg_watch_time_s', 'skip_rate', 'likes', 'comments', 'saves', 'shares', 'follows'];
  const have = new Set(ins.rows.map((r) => r.reel));
  const added = [];
  for (const it of M.items) {
    if (!it.media || have.has(it.slug) || have.has(it.name)) continue;
    if (Date.now() - it.media.at < 7 * 864e5) continue;
    const n = it.media.nums;
    const val = { reel: it.slug, date: M.dayKey(it.media.at), views: n.views, reach: n.reach, avg_watch_time_s: n.watch == null ? '' : n.watch.toFixed(1),
      skip_rate: n.skip == null ? '' : `${(n.skip * 100).toFixed(1)}%`, likes: n.likes, comments: n.comments, saves: n.saves, shares: n.shares, follows: '' };
    added.push(head.map((h) => { const v = val[h] ?? ''; return /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v); }).join(','));
  }
  if (added.length) {
    const text = read(iFile);
    writeAtomic(iFile, (text ? (text.endsWith('\n') ? text : text + '\n') : head.join(',') + '\n') + added.join('\n') + '\n');
  }
  const matched = M.items.filter((x) => x.media).length;
  return { account, posts: media.length, fetched, failed, matched, added: added.length, limited, why, stories: data.stories.length, comments: data.comments.length };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const root = brandRoot(args.find((a) => !a.startsWith('--')));
  const check = args.includes('--check');
  try {
    const r = await pull(root, { check });
    if (check) console.log(`Connected (${r.login} login): @${r.account.username} (${r.account.account_type || 'account'}, account id ${r.account.user_id || r.account.id}), ${r.account.followers_count ?? '?'} followers, ${r.account.media_count ?? '?'} posts. Nothing on Instagram was changed.`);
    else {
      console.log(`Pulled @${r.account.username}: ${r.account.followers_count ?? '?'} followers, ${r.posts} posts (${r.fetched} with fresh numbers${r.failed ? `, ${r.failed} could not be read` : ''}${r.limited ? (r.why === 'net' ? '; Instagram was slow or could not be reached, so the pull stopped early and the rest come next time' : '; Instagram\'s rate limit was reached, the rest come next time') : ''}), ${r.stories} stories, ${r.comments} recent comments, ${r.matched} matched to reels here${r.added ? `, ${r.added} new row${r.added === 1 ? '' : 's'} in brand/insights.csv` : ''}.`);
      writeStatus(root, 'instagram', { ok: true, posts: r.posts });
    }
  } catch (e) {
    const msg = e instanceof Plain ? e.message : 'unexpected error (details hidden so no token can show)';
    if (!check) writeStatus(root, 'instagram', { ok: false, error: msg });
    console.error(`Instagram: ${msg}`);
    process.exit(1);
  }
}
