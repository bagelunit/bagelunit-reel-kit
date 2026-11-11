#!/usr/bin/env node
// The brand's Facebook Page and Threads numbers, through Meta's official APIs. Read only: nothing is posted here
// (posting is the publisher's job, publisher/README.md). Each part runs only when the owner wrote its token file:
//
//   ~/.config/bagelunit-reels/facebook-<slug>.json   {"page_id": "...", "access_token": "<Page access token>"}
//   ~/.config/bagelunit-reels/threads-<slug>.json    {"access_token": "<long-lived Threads token>"}
// First time, the owner may write the short token from Meta's Graph API Explorer instead, with the app's id and secret:
//   facebook: {"page_id": "...", "user_token": "...", "app_id": "...", "app_secret": "..."}
//   threads:  {"access_token": "<the 1-hour token>", "app_secret": "<Threads app secret>"}
// The first run trades it for a lasting token (a Page token that does not expire; a 60-day Threads token). The app
// secret is removed from the file after that one exchange, whether it worked or not. For Facebook the long-lived user
// token from the exchange stays in the file until the Page token is found, so a retry needs no secret. Nothing is printed.
// The Threads user id is saved for this brand: in threads-<slug>.json, or for a shared threads.json in
// threads-<slug>.ids.json (lib.mjs brandId).
//
//   node .claude/skills/content-calendar/platforms.mjs [facebook|threads] [--check]
//       --check only tests the connection. Writes brand/facebook.json and brand/threads.json (latest numbers, not
//       kept in history) and one follower count a day per platform in brand/followers-<platform>.csv.
// The Threads token lasts 60 days; this script renews it once a week (Meta allows it after 24 hours), so a daily
// refresh keeps it alive. A Facebook Page token from a long-lived user token, or a system user token, does not expire.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { brandRoot, brandSlug, readJSON, read, secretFile, writeSecret, writeAtomic, brandId, saveBrandId, CONFIG_DIR } from './lib.mjs';
import { Plain } from './instagram.mjs';

const RATE = [4, 17, 32, 613, 80001];
const FB_REEL = ['blue_reels_play_count', 'fb_reels_total_plays', 'fb_reels_replay_count', 'post_impressions_unique', 'post_video_avg_time_watched', 'post_video_view_time', 'post_video_followers', 'post_video_social_actions', 'post_video_likes_by_reaction_type'];
const FB_PAGE = ['page_media_view', 'page_total_media_view_unique'];
const TH_POST = ['views', 'likes', 'replies', 'reposts', 'quotes', 'shares'];
const TH_USER = ['views', 'likes', 'replies', 'reposts', 'quotes', 'clicks'];
const NAME = { facebook: 'Facebook', threads: 'Threads' };

// one safe caller per platform: the token never shows in an error, a refused metric is left out
export function client(platform, root) {
  const slug = brandSlug(root);
  const file = secretFile(platform, slug);
  if (!file) throw new Plain(`no ${NAME[platform]} connection for this brand: the owner creates ${path.join(CONFIG_DIR, `${platform}-${slug}.json`)} (docs/connect.md)`);
  const cfg = readJSON(file, null);
  if (!cfg?.access_token && !cfg?.user_token) throw new Plain(`${file} has no "access_token"`);
  if (platform === 'facebook' && !cfg.page_id) throw new Plain(`${file} also needs "page_id" (your Facebook Page's id)`);
  const test = process.env.BAGELUNIT_IG_HOST;                     // tests only
  const base = platform === 'facebook' ? `${test || 'https://graph.facebook.com'}/${cfg.api_version || 'v27.0'}` : `${test || 'https://graph.threads.com'}/v1.0`;
  const root0 = platform === 'facebook' ? base : test || 'https://graph.threads.com';
  const hide = (s) => [cfg.access_token, cfg.user_token, cfg.app_secret].filter(Boolean).reduce((t, k) => t.split(k).join('***'), String(s));
  // Facebook: the token goes in the Authorization header (Meta's Graph API docs). Threads: Meta documents only the
  // access_token parameter, so it stays there. The token exchanges are sent the way Meta documents them (a GET with
  // the secret as a parameter), and hide() masks every secret in any error.
  async function get(p, params = {}, { bare = false, auth = true } = {}) {
    const url = new URL(`${bare ? root0 : base}/${p.replace(/^\//, '')}`);
    const { access_token: token = auth ? cfg.access_token : null, ...rest } = params;
    for (const [k, v] of Object.entries(rest)) url.searchParams.set(k, v);
    const headers = {};
    if (token && platform === 'facebook') headers.Authorization = `Bearer ${token}`;
    else if (token) url.searchParams.set('access_token', token);
    let res;
    try { res = await fetch(url, { headers, signal: AbortSignal.timeout(30000) }); }
    catch (e) { throw Object.assign(new Plain(`could not reach ${NAME[platform]} (${hide(e.cause?.code || e.name || 'network error')})`), { code: 'NET' }); }
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.error) {
      const e = body.error || {};
      const why = e.code === 190 ? `the ${NAME[platform]} token is not valid any more (expired or revoked): make a new one, see docs/connect.md`
        : e.code === 10 || e.code === 200 || e.code === 283 ? `the ${NAME[platform]} token is missing a permission (${hide(e.message || 'permission')})`
        : RATE.includes(e.code) ? `${NAME[platform]} rate limit reached: it will work again later`
        : hide(e.message || `HTTP ${res.status}`);
      throw Object.assign(new Plain(why), { code: e.code, status: res.status });
    }
    return body;
  }
  // the one-time swap of a short Graph API Explorer token for a lasting one (see the top of this file)
  // After the exchange, success or failure, the app secret leaves the file at once (it is used only this one time).
  async function settle() {
    if (platform === 'facebook' && cfg.user_token) {
      if (!cfg.user_token_long) {                                   // step 1: the short Explorer token -> a long-lived user token
        if (!cfg.app_id || !cfg.app_secret) throw new Plain(`${file}: with "user_token" also write "app_id" and "app_secret" (App settings, Basic), or write the Page token as "access_token"`);
        let long;
        try { long = await get('oauth/access_token', { grant_type: 'fb_exchange_token', client_id: cfg.app_id, client_secret: cfg.app_secret, fb_exchange_token: cfg.user_token }, { auth: false }); }
        catch (e) { delete cfg.app_secret; writeSecret(file, cfg); throw Object.assign(new Plain(`the token swap failed (${e.message}). The app secret was removed from the file: make a new Explorer token and copy the app secret in again (docs/connect.md step 3)`), { code: e.code }); }
        delete cfg.app_secret;
        if (!long?.access_token) { writeSecret(file, cfg); throw new Plain('Facebook did not return a lasting token. The app secret was removed from the file: make a new Explorer token and copy the app secret in again (docs/connect.md step 3)'); }
        cfg.user_token = long.access_token; cfg.user_token_long = true;
        writeSecret(file, cfg);
      }
      // step 2: the long-lived user token -> the Page token (a retry starts here, without the secret)
      const pages = await get('me/accounts', { fields: 'id,name,access_token', limit: '100', access_token: cfg.user_token });
      const page = (pages.data || []).find((x) => String(x.id) === String(cfg.page_id));
      if (!page?.access_token) throw new Plain(`the token does not manage the Page ${cfg.page_id}: check "page_id" and that you picked this Page when you made the token`);
      cfg.access_token = page.access_token; delete cfg.user_token; delete cfg.user_token_long; cfg.refreshed_at = new Date().toISOString();
      writeSecret(file, cfg);
    }
    if (platform === 'threads' && cfg.app_secret) {
      const secret = cfg.app_secret;
      delete cfg.app_secret; writeSecret(file, cfg);                 // gone from the file before the exchange is even sent
      let r;
      try { r = await get('access_token', { grant_type: 'th_exchange_token', client_secret: secret }, { bare: true }); }
      catch (e) { throw Object.assign(new Plain(`the Threads token swap failed (${e.message.split(secret).join('***')}). The app secret was removed from the file: make a new token in the Graph API Explorer (it lasts one hour), copy it and the Threads app secret in again, and run the check (docs/connect.md step 4)`), { code: e.code }); }
      if (!r.access_token) throw new Plain('Threads did not return a lasting token. The app secret was removed from the file: make a new token in the Graph API Explorer (it lasts one hour), copy it and the Threads app secret in again (docs/connect.md step 4)');
      cfg.access_token = r.access_token; cfg.refreshed_at = new Date().toISOString();
      if (r.expires_in) cfg.expires_at = new Date(Date.now() + Number(r.expires_in) * 1000).toISOString();
      writeSecret(file, cfg);
    }
  }
  return { cfg, file, get, settle };
}

const refused = new Set();
const values = (r, out = {}) => { for (const d of r.data || []) out[d.name] = d.values?.[0]?.value ?? d.total_value?.value ?? null; return out; };
async function metrics(api, edge, list, extra = {}) {
  const ask = list.filter((m) => !refused.has(`${edge}:${m}`));
  try { return values(await api.get(edge, { metric: ask.join(','), ...extra })); }
  catch (e) {
    if (e.code === 190 || RATE.includes(e.code) || (e.code !== 100 && e.status !== 400)) throw e;
    const out = {};
    for (const m of ask) {
      try { values(await api.get(edge, { metric: m, ...extra }), out); }
      catch (e2) { if (e2.code === 190 || RATE.includes(e2.code)) throw e2; refused.add(`${edge}:${m}`); }
    }
    return out;
  }
}
const total = (v) => (v && typeof v === 'object' ? Object.values(v).reduce((t, x) => t + (Number(x) || 0), 0) : v ?? null);
function followerRow(root, platform, n) {
  if (n == null) return;
  const f = path.join(root, 'brand', `followers-${platform}.csv`), day = new Date().toISOString().slice(0, 10);
  const text = read(f) || 'date,followers\n';
  if (text.includes(`\n${day},`)) return;
  writeAtomic(f, text + `${day},${n}\n`);
}

export async function pullFacebook(root, { check = false } = {}) {
  const api = client('facebook', root), id = api.cfg.page_id;
  await api.settle();
  const page = await api.get(id, { fields: 'id,name,link,followers_count,fan_count' });
  if (check) return { page };
  const d28 = await metrics(api, `${id}/insights`, FB_PAGE, { period: 'days_28' });
  const reels = (await api.get(`${id}/video_reels`, { fields: 'id,description,created_time,permalink_url,length', limit: '25' })).data || [];
  for (const r of reels) {
    const m = await metrics(api, `${r.id}/video_insights`, FB_REEL);
    const social = m.post_video_social_actions || {};
    r.nums = { plays: m.blue_reels_play_count ?? null, totalPlays: m.fb_reels_total_plays ?? null, reach: m.post_impressions_unique ?? null,
      watch: m.post_video_avg_time_watched != null ? m.post_video_avg_time_watched / 1000 : null, follows: m.post_video_followers ?? null,
      likes: total(m.post_video_likes_by_reaction_type), comments: social.COMMENT ?? social.comment ?? null, shares: social.SHARE ?? social.share ?? null };
    if (r.permalink_url && !/^https?:/.test(r.permalink_url)) r.permalink_url = `https://www.facebook.com${r.permalink_url}`;
  }
  const out = { pulled_at: new Date().toISOString(), page: { id: page.id, name: page.name, link: page.link, followers: page.followers_count ?? page.fan_count ?? null },
    d28: { views: d28.page_media_view ?? null, viewers: d28.page_total_media_view_unique ?? null },
    posts: reels.map((r) => ({ id: r.id, caption: r.description || '', timestamp: r.created_time, permalink: r.permalink_url || '', nums: r.nums })) };
  writeAtomic(path.join(root, 'brand', 'facebook.json'), JSON.stringify(out, null, 2) + '\n');
  followerRow(root, 'facebook', out.page.followers);
  return out;
}

export async function pullThreads(root, { check = false, log = console.log } = {}) {
  const api = client('threads', root);
  await api.settle();
  const age = Date.now() - new Date(api.cfg.refreshed_at || 0).getTime();
  if (!api.cfg.refreshed_at) { api.cfg.refreshed_at = new Date().toISOString(); writeSecret(api.file, api.cfg); }
  else if (age > 7 * 864e5) {                                       // renew weekly: 60-day tokens, Meta allows it after 24 h
    try {
      const r = await api.get('refresh_access_token', { grant_type: 'th_refresh_token' }, { bare: true });
      if (r.access_token) {
        Object.assign(api.cfg, { access_token: r.access_token, refreshed_at: new Date().toISOString() });
        if (r.expires_in) api.cfg.expires_at = new Date(Date.now() + Number(r.expires_in) * 1000).toISOString();
        writeSecret(api.file, api.cfg);
      }
    } catch (e) { log(`Threads: could not renew the token yet (${e.message}); the next refresh tries again.`); }   // never fails the pull
  }
  const me = await api.get('me', { fields: 'id,username' });
  // keep the Threads user id for this brand: the publisher's secrets step (publisher/scripts/setup.mjs secrets) reads it
  const slug = brandSlug(root);
  if (me?.id && brandId('threads', slug, api.file, api.cfg, 'user_id') !== String(me.id)) {
    const where = saveBrandId('threads', slug, api.file, api.cfg, 'user_id', me.id);
    log(`Threads: saved the user id in ${where}.`);
  }
  if (check) return { me };
  const since = Math.floor((Date.now() - 7 * 864e5) / 1000), until = Math.floor(Date.now() / 1000);
  const d7 = await metrics(api, 'me/threads_insights', TH_USER, { since: String(since), until: String(until) });
  const fol = await metrics(api, 'me/threads_insights', ['followers_count']);
  const sum = (v) => (Array.isArray(v) ? v.reduce((t, x) => t + (Number(x.value) || 0), 0) : v);
  const posts = ((await api.get('me/threads', { fields: 'id,media_type,permalink,text,timestamp,is_quote_post', limit: '25' })).data || []).filter((p) => p.media_type !== 'REPOST_FACADE');
  for (const p of posts) p.nums = await metrics(api, `${p.id}/insights`, TH_POST);
  const out = { pulled_at: new Date().toISOString(), account: { id: me.id, username: me.username, followers: fol.followers_count ?? null },
    d7: Object.fromEntries(TH_USER.map((m) => [m, sum(d7[m]) ?? null])),
    posts: posts.map((p) => ({ id: p.id, caption: p.text || '', timestamp: p.timestamp, permalink: p.permalink || '', type: p.media_type, nums: p.nums })) };
  // the Time Series "views" comes back as one value per day; values() keeps the first, so read it again in full
  try { const r = await api.get('me/threads_insights', { metric: 'views', since: String(since), until: String(until) }); out.d7.views = (r.data?.[0]?.values || []).reduce((t, x) => t + (Number(x.value) || 0), 0); } catch {}
  writeAtomic(path.join(root, 'brand', 'threads.json'), JSON.stringify(out, null, 2) + '\n');
  followerRow(root, 'threads', out.account.followers);
  return out;
}

export const connected = (root) => ({ facebook: !!secretFile('facebook', brandSlug(root)), threads: !!secretFile('threads', brandSlug(root)) });

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2), check = args.includes('--check');
  const root = brandRoot(args.find((a) => !a.startsWith('--') && !['facebook', 'threads'].includes(a)));
  const only = args.find((a) => ['facebook', 'threads'].includes(a));
  const which = only ? [only] : Object.entries(connected(root)).filter(([, on]) => on).map(([k]) => k);
  if (!which.length) { console.log('Neither Facebook nor Threads is connected for this brand (docs/connect.md, steps 3 and 4).'); process.exit(0); }
  let bad = 0;
  for (const p of which) {
    try {
      if (p === 'facebook') { const r = await pullFacebook(root, { check }); console.log(check ? `Facebook: connected to the Page "${r.page.name}" (Page id ${r.page.id}).` : `Facebook: ${r.page.followers ?? '?'} followers, ${r.posts.length} reel${r.posts.length === 1 ? '' : 's'} read.`); }
      else { const r = await pullThreads(root, { check }); console.log(check ? `Threads: connected as @${r.me.username} (Threads user id ${r.me.id}).` : `Threads: ${r.account.followers ?? '?'} followers, ${r.posts.length} post${r.posts.length === 1 ? '' : 's'} read.`); }
    } catch (e) { bad++; console.error(`${NAME[p]}: ${e instanceof Plain ? e.message : 'unexpected error (details hidden so no token can show)'}`); }
  }
  process.exit(bad ? 1 : 0);
}
