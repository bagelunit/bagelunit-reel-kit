// The competitor model: reads what competitors.mjs saved (brand/competitors.json, brand/research/<handle>.csv,
// accounts.json, history.csv) and works out the leaderboard, the posts that beat each account's own median, what the
// winners have in common, this week's feed and the ideas drafted from them. Reading only: nothing here writes, pulls
// or posts. lib.mjs load() attaches the result as M.competitors; page.mjs draws it.
import fs from 'node:fs';
import path from 'node:path';
import { read, readJSON, csv, num, median, mdTable, isObj } from './lib.mjs';
import { accountPace } from './how-often.mjs';

export const TAGS = { niche: 'In your niche', adjacent: 'Adjacent', big: 'Big (format ideas)', other: 'Other' };
export const MIN_POSTS = 5;                       // fewer than this and an account has no trustworthy median
export const WINDOW = 12;                         // posts used for the median
const DAY = 864e5;
const STALE_DAYS = 14;
export const USERNAME = /^[A-Za-z0-9._]{1,30}$/;  // Instagram's own rule for a username

const tsOf = (r) => Date.parse(String(r.timestamp || r.date || r.posted || '').replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));

// the first line of a caption, and a guess at the kind of hook it is: a guess, the page says so
export const firstLine = (caption) => String(caption || '').replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s|\n/)[0].slice(0, 140);
export function hookShape(caption) {
  const t = firstLine(caption).toLowerCase();
  if (!t) return 'no caption';
  if (/^\d+\s|^\d+[.)]|\b\d+\s+(things|ways|tips|mistakes|reasons|rules|signs|steps|ideas|tools|hacks)\b/.test(t)) return 'number or list';
  if (/^(stop|never|don'?t|dont|quit|forget)\b|\b(myth|wrong|lying|nobody tells|no one tells|actually|unpopular|overrated|mistake)/.test(t)) return 'contrarian';
  if (/^(how to|here'?s how|the (easiest|fastest|simplest)|learn how)\b/.test(t)) return 'how to';
  if (/\?\s*$|^(why|what|who|when|where|did|do|does|are|is|can|should|would|have)\b/.test(t)) return 'question';
  if (/^(pov|if you|you |your |when you|tell me)\b/.test(t)) return 'call-out to the viewer';
  if (/^(i|we|my|our|last|when i|today i|yesterday)\b/.test(t)) return 'story';
  return 'statement';
}

// one account's posts, newest first, with each post's ratio to the account's own median (the 3x rule)
export function rankPosts(rows, { window = WINDOW } = {}) {
  const posts = rows.map((r) => ({
    at: tsOf(r), url: r.url || r.permalink || '', views: num(r.views), likes: num(r.likes), comments: num(r.comments),
    caption: String(r.caption || ''), type: r.type || '',
  })).filter((p) => Number.isFinite(p.at)).sort((a, b) => b.at - a.at);
  const withViews = posts.filter((p) => p.views != null);
  const base = withViews.slice(0, window).map((p) => p.views);
  const med = withViews.length >= MIN_POSTS ? median(base) : null;
  for (const p of posts) {
    p.ratio = med && p.views != null ? p.views / med : null;
    p.tier = p.ratio == null ? null : p.ratio >= 3 ? 'STUDY' : p.ratio >= 1.5 ? 'NOTE' : 'ignore';
    p.shape = hookShape(p.caption);
  }
  return { posts, median: med, withViews: withViews.length };
}

// followers from the daily history, for the change over 7 and 30 days
function history(root) {
  const by = {};
  for (const r of csv(read(path.join(root, 'brand', 'research', 'history.csv'))).rows) {
    const f = num(r.followers);
    if (r.handle && r.date && f != null) (by[r.handle.toLowerCase()] ||= []).push({ date: r.date, followers: f, median: num(r.median_views) });
  }
  for (const k of Object.keys(by)) by[k].sort((a, b) => a.date.localeCompare(b.date));
  return by;
}
const deltaAt = (rows, now, days) => {
  if (rows.length < 2) return null;
  const cut = new Date(now - days * DAY).toISOString().slice(0, 10);
  const last = rows[rows.length - 1];
  const then = [...rows].reverse().find((r) => r.date <= cut);
  return then && then !== last ? last.followers - then.followers : null;
};

export function configOf(root) {
  const cfg = readJSON(path.join(root, 'brand', 'competitors.json'), {});
  const list = (Array.isArray(cfg.accounts) ? cfg.accounts : []).filter((a) => isObj(a) && USERNAME.test(String(a.handle || '').replace(/^@/, '')))
    .map((a) => ({ handle: String(a.handle).replace(/^@/, ''), tag: TAGS[a.tag] ? a.tag : 'other', added: a.added || '', source: a.source || 'auto' }));
  return { list, cfg };
}

export function loadCompetitors(root, { now = Date.now(), own = {}, dayName = (t) => new Date(t).toUTCString().slice(0, 3) } = {}) {
  const { list } = configOf(root);
  const dir = path.join(root, 'brand', 'research');
  const meta = readJSON(path.join(dir, 'accounts.json'), {});
  const hist = history(root);
  const handles = [...list];
  if (fs.existsSync(dir)) {                      // research the owner did before the list existed still counts
    for (const f of fs.readdirSync(dir)) {
      const m = f.match(/^(.+)\.csv$/i);
      if (!m || /^(hashtag-|history$)/i.test(m[1]) || !USERNAME.test(m[1])) continue;
      if (!handles.some((h) => h.handle.toLowerCase() === m[1].toLowerCase())) handles.push({ handle: m[1], tag: 'other', added: '', source: 'file' });
    }
  }
  const accounts = [];
  for (const h of handles) {
    const key = h.handle.toLowerCase();
    const rows = csv(read(path.join(dir, `${h.handle}.csv`))).rows;
    const m = meta[key] || {};
    const ranked = rankPosts(rows);
    const followers = m.followers ?? hist[key]?.at(-1)?.followers ?? null;
    const pace = ranked.posts.length >= 3 ? accountPace(rows, { pulledAt: m.pulled_at, mediaCount: m.media_count, followers, now }) : null;
    const pulledAt = Date.parse(m.pulled_at || '') || null;
    const recent = ranked.posts.filter((p) => p.at > now - 30 * DAY);
    accounts.push({
      handle: h.handle, tag: h.tag, source: m.source || h.source, followers, pace, posts: ranked.posts, median: ranked.median,
      readPosts: ranked.posts.length, hasViews: ranked.withViews > 0, pulledAt, stale: pulledAt ? now - pulledAt > STALE_DAYS * DAY : true,
      pending: !rows.length, note: m.note || '',
      delta7: deltaAt(hist[key] || [], now, 7), delta30: deltaAt(hist[key] || [], now, 30),
      outliers30: recent.filter((p) => p.tier === 'STUDY' || p.tier === 'NOTE').length,
      score: followers && ranked.median != null ? ranked.median / followers : null,
    });
  }
  accounts.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || (b.followers ?? 0) - (a.followers ?? 0));

  // the posts that beat their own account's median: study first, then by ratio
  const outliers = accounts.flatMap((a) => a.posts.filter((p) => p.tier === 'STUDY' || p.tier === 'NOTE').map((p) => ({ ...p, handle: a.handle, tag: a.tag })))
    .sort((a, b) => (b.tier === 'STUDY') - (a.tier === 'STUDY') || b.ratio - a.ratio);

  // what the winners have in common: for each hook shape, how many of the ranked posts beat their median
  const ranked = accounts.flatMap((a) => a.posts.filter((p) => p.ratio != null));
  const shapes = {};
  for (const p of ranked) { const s = (shapes[p.shape] ||= { shape: p.shape, posts: 0, hits: 0 }); s.posts++; if (p.ratio >= 1.5) s.hits++; }
  const base = ranked.length ? ranked.filter((p) => p.ratio >= 1.5).length / ranked.length : 0;
  const shapeRows = Object.values(shapes).filter((s) => s.posts >= 3 && s.shape !== 'no caption')
    .map((s) => ({ ...s, rate: s.hits / s.posts, lift: base ? s.hits / s.posts / base : null })).sort((a, b) => b.rate - a.rate);
  const days = {};
  for (const p of outliers.filter((x) => x.tier === 'STUDY' || x.ratio >= 1.5)) days[dayName(p.at)] = (days[dayName(p.at)] || 0) + 1;
  const patterns = { n: ranked.length, hits: ranked.filter((p) => p.ratio >= 1.5).length, base, shapes: shapeRows, days: Object.entries(days).sort((a, b) => b[1] - a[1]) };

  // what they posted this week
  const feed = accounts.flatMap((a) => a.posts.filter((p) => p.at > now - 7 * DAY).map((p) => ({ ...p, handle: a.handle, tag: a.tag })))
    .sort((a, b) => b.at - a.at);

  // the brand's own row, to compare against
  const ownRow = own.followers != null || own.median != null ? { followers: own.followers ?? null, median: own.median ?? null, perWeek: own.perWeek ?? null, score: own.followers && own.median != null ? own.median / own.followers : null } : null;

  // ideas drafted from the winners (brand/ideas.md)
  const key = (r, ...names) => { for (const n of names) { const k = Object.keys(r).find((h) => h === n || h.startsWith(n)); if (k && r[k]) return r[k]; } return ''; };
  const ideas = mdTable(read(path.join(root, 'brand', 'ideas.md'))).map((r) => ({
    date: key(r, 'date'), idea: key(r, 'idea', 'topic', 'title'), hook: key(r, 'hook'), basedOn: key(r, 'based on', 'source', 'from'),
    goal: key(r, 'goal'), angle: key(r, 'angle'), status: (key(r, 'status') || 'suggested').toLowerCase(),
  })).filter((i) => i.idea);

  const out = { accounts, outliers, patterns, feed, own: ownRow, ideas, configured: list.length, any: accounts.length > 0, withData: accounts.filter((a) => a.readPosts).length };
  return out;
}
