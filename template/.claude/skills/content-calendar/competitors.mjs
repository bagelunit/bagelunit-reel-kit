#!/usr/bin/env node
// The competitor list and its numbers. Reads and saves public data about other accounts; posts and sends nothing.
//
//   node .claude/skills/content-calendar/competitors.mjs list
//   node .claude/skills/content-calendar/competitors.mjs add <handle> [<handle> ...] [--tag niche|adjacent|big]
//   node .claude/skills/content-calendar/competitors.mjs remove <handle>
//   node .claude/skills/content-calendar/competitors.mjs sync [<handle>] [--apify] [--max-cost 1.00]
//   node .claude/skills/content-calendar/competitors.mjs import <handle> <file.csv|file.json>
//   node .claude/skills/content-calendar/competitors.mjs due                (exit 0 if a sync is due, for the refresh)
//
// Where the numbers come from, best first. Each account uses the first that works and the dashboard says which:
//   1. Meta's official API (business discovery): free, no scraping, business and creator accounts only.
//      Needs the Unified or Facebook Login connection (docs/connect.md step 2B).
//   2. Apify, only with --apify and only when brand.json -> autopilot.scrape is true: for accounts Meta will not
//      show (personal accounts) or when there is no Meta connection. Costs money (the cost is printed first and
//      logged in brand/spend.csv). The scheduled refresh never uses it.
//   3. A file you have: an Insights export, a scraper export or a CSV from anywhere (`import`). Works offline.
// Every successful pull adds one line a day per account to brand/research/history.csv, which is how follower
// growth over time is known.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { brandRoot, readJSON, read, csv, num, median, writeAtomic, CONFIG_DIR } from './lib.mjs';
import { connect, Plain } from './instagram.mjs';
import { pullCompetitor } from './research.mjs';
import { USERNAME, TAGS, configOf } from './competitors-model.mjs';

const MAX_ACCOUNTS = 30;
const csvCell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clean = (h) => String(h || '').trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/[/?#].*$/, '');
const file = (root) => path.join(root, 'brand', 'competitors.json');

export function save(root, cfg) { writeAtomic(file(root), JSON.stringify(cfg, null, 2) + '\n'); }
function loadCfg(root) { const { list, cfg, removed } = configOf(root); return { ...cfg, removed: [...removed], accounts: list.map(({ handle, tag, added, source }) => ({ handle, tag, added, source })) }; }

export function add(root, handles, tag = 'niche') {
  if (!TAGS[tag] || tag === 'other') throw new Plain(`the tag is niche, adjacent or big (got "${tag}")`);
  const cfg = loadCfg(root);
  const added = [], skipped = [];
  for (const raw of handles) {
    const h = clean(raw);
    if (!USERNAME.test(h)) { skipped.push(`${raw} (not an Instagram username)`); continue; }
    if (cfg.accounts.some((a) => a.handle.toLowerCase() === h.toLowerCase())) { skipped.push(`@${h} (already on the list)`); continue; }
    if (cfg.accounts.length >= MAX_ACCOUNTS) { skipped.push(`@${h} (the list holds ${MAX_ACCOUNTS} accounts)`); continue; }
    cfg.removed = cfg.removed.filter((x) => x !== h.toLowerCase());    // adding it again brings it back
    cfg.accounts.push({ handle: h, tag, added: new Date().toISOString().slice(0, 10), source: 'auto' });
    added.push(h);
  }
  if (added.length) save(root, cfg);
  return { added, skipped };
}
export function remove(root, handle) {
  const cfg = loadCfg(root), h = clean(handle).toLowerCase();
  const n = cfg.accounts.length;
  cfg.accounts = cfg.accounts.filter((a) => a.handle.toLowerCase() !== h);
  if (cfg.accounts.length === n) throw new Plain(`@${clean(handle)} is not on the list`);
  if (!cfg.removed.includes(h)) cfg.removed.push(h);         // so the saved file in brand/research does not bring it back as "Other"
  save(root, cfg);                                           // the saved posts stay in brand/research, the owner can delete them
}

// one line a day per account, replaced if the same day is pulled again
function writeHistory(root, handle, { followers, mediaCount, posts, median: med, source }) {
  const f = path.join(root, 'brand', 'research', 'history.csv');
  const head = 'date,handle,followers,media_count,read,median_views,source';
  const today = new Date().toISOString().slice(0, 10);
  const lines = read(f).split(/\r?\n/).filter((l) => l && l !== head && !(l.startsWith(`${today},${handle.toLowerCase()},`)));
  lines.push([today, handle.toLowerCase(), followers ?? '', mediaCount ?? '', posts, med ?? '', source].map(csvCell).join(','));
  writeAtomic(f, `${head}\n${lines.join('\n')}\n`);
}
function setAccount(root, handle, patch) {                   // accounts.json holds followers and when/how each was pulled
  const f = path.join(root, 'brand', 'research', 'accounts.json');
  const all = readJSON(f, {}), k = handle.toLowerCase();
  all[k] = { ...(all[k] || {}), ...patch };
  writeAtomic(f, JSON.stringify(all, null, 2) + '\n');
}

/* ── source 3: a file you have ─────────────────────────────────────────────────────────────────────────────── */
const VIEW_KEYS = ['videoPlayCount', 'videoViewCount', 'igPlayCount', 'playsCount', 'viewsCount', 'views', 'plays'];
function rowsFromFile(p) {
  const text = read(p);
  if (!text.trim()) throw new Plain(`${p} is empty or missing`);
  if (/\.json$/i.test(p)) {                                   // a scraper export: a list of posts
    let data; try { data = JSON.parse(text); } catch { throw new Plain(`${p} is not valid JSON`); }
    const list = Array.isArray(data) ? data : data.items || [];
    const rows = list.map((it) => ({
      url: it.url || it.permalink || '', timestamp: it.timestamp || it.takenAt || it.date || '',
      views: VIEW_KEYS.map((k) => it[k]).find((v) => typeof v === 'number') ?? '', likes: it.likesCount ?? it.like_count ?? it.likes ?? '',
      comments: it.commentsCount ?? it.comments_count ?? it.comments ?? '', caption: it.caption || '', type: it.productType === 'clips' || it.type === 'Video' ? 'REELS' : it.type || '',
    }));
    return { rows, followers: list.map((it) => it.ownerFollowersCount).find((v) => typeof v === 'number') ?? null };
  }
  const { head, rows } = csv(text);                           // a CSV: any capitalisation, a views column and a date column
  const col = (...n) => n.find((x) => head.includes(x));
  const v = col('views', 'plays', 'video views'), d = col('timestamp', 'date', 'publish time', 'publish date', 'posted');
  if (!d) throw new Plain(`the CSV needs a date or timestamp column (found: ${head.join(', ')})`);
  const c = col('caption', 'title', 'description'), u = col('url', 'permalink', 'link'), l = col('likes', 'like_count'), m = col('comments', 'comments_count'), t = col('type', 'media_product_type');
  return { rows: rows.map((r) => ({ url: r[u] || '', timestamp: r[d] || '', views: v ? r[v] : '', likes: l ? r[l] : '', comments: m ? r[m] : '', caption: r[c] || '', type: r[t] || '' })), followers: null };
}
export function importFile(root, handle, p) {
  const h = clean(handle);
  if (!USERNAME.test(h)) throw new Plain(`"${handle}" is not an Instagram username`);
  const { rows, followers } = rowsFromFile(path.resolve(p));
  const usable = rows.filter((r) => Number.isFinite(Date.parse(r.timestamp)));
  if (!usable.length) throw new Plain('no row had a readable date, so nothing was saved');
  const out = path.join(root, 'brand', 'research', `${h}.csv`);
  writeAtomic(out, 'url,timestamp,views,likes,comments,caption,type\n' + usable.map((r) => [r.url, r.timestamp, r.views, r.likes, r.comments, String(r.caption).replace(/\s+/g, ' ').slice(0, 300), r.type].map(csvCell).join(',')).join('\n') + '\n');
  const views = usable.map((r) => num(r.views)).filter((x) => x != null);
  const prev = readJSON(path.join(root, 'brand', 'research', 'accounts.json'), {})[h.toLowerCase()] || {};
  const fol = followers ?? prev.followers ?? null;
  setAccount(root, h, { followers: fol, read: usable.length, pulled_at: new Date().toISOString(), source: 'file', note: '' });
  writeHistory(root, h, { followers: fol, mediaCount: prev.media_count, posts: usable.length, median: median(views), source: 'file' });
  if (!loadCfg(root).accounts.some((a) => a.handle.toLowerCase() === h.toLowerCase())) add(root, [h], 'niche');
  return { handle: h, posts: usable.length, hasViews: views.length > 0, file: path.relative(root, out) };
}

/* ── sources 1 and 2: Meta, then Apify ─────────────────────────────────────────────────────────────────────── */
function apify(root, handle, { maxCost }) {
  const brand = readJSON(path.join(root, 'brand', 'brand.json'));
  if (brand.autopilot?.scrape !== true) return { ok: false, why: 'scraping is off (brand.json -> autopilot.scrape), so Apify was not used' };
  if (!fs.existsSync(path.join(CONFIG_DIR, 'apify.key'))) return { ok: false, why: `no Apify token yet (${path.join(CONFIG_DIR, 'apify.key')})` };
  const py = process.platform === 'win32' ? 'python' : 'python3';
  const r = spawnSync(py, [path.join(root, '.claude', 'skills', 'account-audit', 'outliers.py'), '--handles', handle, '--limit', '30', '--max-cost', String(maxCost), '--save-research', path.join(root, 'brand', 'research'), '--all'],
    { cwd: root, encoding: 'utf8', timeout: 360000 });
  if (r.status !== 0) return { ok: false, why: (r.stderr || r.stdout || 'Apify did not answer').trim().split('\n').pop() };
  return { ok: true };
}

export async function syncOne(root, handle, { useApify = false, maxCost = 1, api = undefined } = {}) {
  const h = clean(handle);
  let metaWhy = '';
  let client = api;
  if (client === undefined) { try { client = connect(root); } catch (e) { metaWhy = e instanceof Plain ? e.message : 'no Meta connection'; client = null; } }
  if (client && client.login === 'instagram') { metaWhy = 'the Instagram Login connection cannot read other accounts (Meta\'s rule): connect with "login": "unified"'; client = null; }
  if (client) {
    try {
      const r = await pullCompetitor(root, client, h, 50);
      writeHistory(root, h, { followers: r.followers, mediaCount: r.mediaCount, posts: r.posts, median: r.median, source: 'meta' });
      setAccount(root, h, { note: r.median == null ? 'Meta gave no view counts for this account, so only likes and comments can be compared' : '' });
      return { handle: h, source: 'meta', posts: r.posts, followers: r.followers, median: r.median };
    } catch (e) {
      if (!(e instanceof Plain)) throw e;
      metaWhy = e.message;
    }
  }
  if (useApify) {
    const a = apify(root, h, { maxCost });
    if (a.ok) {
      const acc = readJSON(path.join(root, 'brand', 'research', 'accounts.json'), {})[h.toLowerCase()] || {};
      const rows = csv(read(path.join(root, 'brand', 'research', `${h}.csv`))).rows;
      writeHistory(root, h, { followers: acc.followers, mediaCount: acc.media_count, posts: rows.length, median: median(rows.map((r) => num(r.views)).filter((x) => x != null)), source: 'apify' });
      return { handle: h, source: 'apify', posts: rows.length, followers: acc.followers ?? null };
    }
    metaWhy = `${metaWhy ? metaWhy + '; ' : ''}${a.why}`;
  }
  const hint = useApify ? 'give an export with `competitors.mjs import`' : 'try --apify (needs autopilot.scrape and costs money) or give an export with `competitors.mjs import`';
  setAccount(root, h, { note: `not read: ${metaWhy || 'no source worked'}` });
  return { handle: h, source: null, error: `${metaWhy || 'no source worked'}. To get it anyway: ${hint}` };
}

export async function syncAll(root, opts = {}) {
  const only = opts.only ? clean(opts.only).toLowerCase() : null;
  const list = loadCfg(root).accounts.filter((a) => !only || a.handle.toLowerCase() === only);
  if (only && !list.length) throw new Plain(`@${only} is not on the list: add it first`);
  let api; try { api = connect(root); } catch { api = null; }
  const results = [];
  for (const a of list) {
    results.push(await syncOne(root, a.handle, { ...opts, api }));
    if (api) await sleep(350);                                // be gentle with Meta's rate limit
  }
  return results;
}

// is a sync due? the oldest pull is older than `every` days (or an account has never been pulled)
export function due(root, every = 7, now = Date.now()) {
  const list = loadCfg(root).accounts;
  if (!list.length) return false;
  const meta = readJSON(path.join(root, 'brand', 'research', 'accounts.json'), {});
  return list.some((a) => { const t = Date.parse(meta[a.handle.toLowerCase()]?.pulled_at || ''); return !Number.isFinite(t) || now - t > every * 864e5; });
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
  const bi = args.indexOf('--brand'), ti = args.indexOf('--tag'), mi = args.indexOf('--max-cost');
  const skip = new Set([bi, ti, mi].filter((i) => i >= 0).flatMap((i) => [i, i + 1]));
  const pos = args.filter((a, i) => !a.startsWith('--') && !skip.has(i));
  const [cmd, ...rest] = pos;
  const root = brandRoot(bi >= 0 ? args[bi + 1] : undefined);
  if (cmd === 'list' || !cmd) {
    const { accounts } = loadCfg(root);
    if (!accounts.length) return console.log('No competitors yet. Add some: node .claude/skills/content-calendar/competitors.mjs add <handle> --tag niche');
    const meta = readJSON(path.join(root, 'brand', 'research', 'accounts.json'), {});
    for (const a of accounts) { const m = meta[a.handle.toLowerCase()] || {}; console.log(`@${a.handle}  ${TAGS[a.tag]}  ${m.pulled_at ? `read ${m.pulled_at.slice(0, 10)} via ${m.source || '?'}` : 'not read yet'}${m.note ? `  (${m.note})` : ''}`); }
  } else if (cmd === 'add') {
    if (!rest.length) throw new Plain('usage: competitors.mjs add <handle> [<handle> ...] [--tag niche|adjacent|big]');
    const r = add(root, rest, ti >= 0 ? args[ti + 1] : 'niche');
    if (r.added.length) console.log(`Added: ${r.added.map((h) => '@' + h).join(', ')}. Next: node .claude/skills/content-calendar/competitors.mjs sync`);
    for (const s of r.skipped) console.log(`Skipped ${s}`);
  } else if (cmd === 'remove') {
    if (!rest[0]) throw new Plain('usage: competitors.mjs remove <handle>');
    remove(root, rest[0]);
    console.log(`Removed @${clean(rest[0])} from the list (its saved posts stay in brand/research/).`);
  } else if (cmd === 'sync') {
    const res = await syncAll(root, { only: rest[0], useApify: args.includes('--apify'), maxCost: Number(mi >= 0 ? args[mi + 1] : 1) || 1 });
    if (!res.length) return console.log('No competitors yet: add some with `competitors.mjs add <handle>`.');
    for (const r of res) console.log(r.source ? `@${r.handle}: ${r.posts} posts via ${r.source === 'meta' ? 'Meta' : r.source === 'apify' ? 'Apify' : 'a file'}${r.followers != null ? `, ${r.followers} followers` : ''}${r.median != null ? `, median ${r.median} views` : ''}.` : `@${r.handle}: ${r.error}`);
    const failed = res.filter((r) => !r.source).length;
    if (failed) process.exitCode = 2;
  } else if (cmd === 'import') {
    if (rest.length < 2) throw new Plain('usage: competitors.mjs import <handle> <file.csv|file.json>');
    const r = importFile(root, rest[0], rest[1]);
    console.log(`@${r.handle}: ${r.posts} posts saved to ${r.file}${r.hasViews ? '' : ' (the file had no views column, so only likes and comments can be compared)'}.`);
  } else if (cmd === 'due') {
    process.exit(due(root, Number(flag('--every')) || 7) ? 0 : 1);
  } else throw new Plain('commands: list, add, remove, sync, import, due');
}

const isMain = () => { try { return !!process.argv[1] && fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(path.resolve(process.argv[1])); } catch { return false; } };
if (isMain()) main().catch((e) => { console.error(`Competitors: ${e instanceof Plain ? e.message : 'unexpected error (details hidden so no token can show)'}`); process.exit(1); });
