#!/usr/bin/env node
// Which hashtags have actually gone with good numbers: reads this brand's own posts (brand/instagram.json) and the
// other accounts' posts it has researched (brand/research/*.csv), and writes brand/hashtags.md. Reading and arithmetic
// only: nothing is posted, sent or looked up online, and no number is invented.
//
//   node .claude/skills/content-calendar/hashtags.mjs            write brand/hashtags.md and print the best few
//
// Instagram allows 5 hashtags in a caption, so /caption-and-hashtags picks from this list, 3 to 5 of them, in the
// caption only (never in a comment).
//
// How it ranks (so nothing here looks more certain than it is):
//   - Own posts: a tag's median views against the median views of ALL this brand's posts with views.
//   - Other accounts: each post's views against that account's own median (so a big account does not drown a small
//     one), then a tag's median of those ratios. A tag needs 3 posts from at least 2 accounts to be ranked; fewer is
//     listed apart as "too few to say".
//   - This shows what went WITH good posts, not that the tag caused it. Small samples are loud: read the counts.
// Posts with no views (hashtag-search files have likes only, and some accounts hide views) are left out of the maths.
import fs from 'node:fs';
import path from 'node:path';
import { brandRoot, readJSON, writeAtomic } from './lib.mjs';

export const tagsOf = (caption) => [...new Set((String(caption || '').match(/#[\p{L}\p{N}_]+/gu) || []).map((t) => t.slice(1).toLowerCase()).filter((t) => /\p{L}/u.test(t)))];
const median = (a) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// A CSV with quoted cells (research.mjs writes them), no packages.
export function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some((x) => x !== '')) rows.push(row); row = []; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); if (row.some((x) => x !== '')) rows.push(row); }
  const head = rows.shift() || [];
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), r[i] ?? ''])));
}

// own: [{caption, views}], accounts: { name: [{caption, views}] }
export function analyze({ own = [], accounts = {} }) {
  const ownViews = own.map((p) => p.views).filter(Number.isFinite);
  const ownMedian = median(ownViews);
  const mine = new Map();
  for (const p of own) if (Number.isFinite(p.views)) for (const t of tagsOf(p.caption)) (mine.get(t) || mine.set(t, []).get(t)).push(p.views);
  const ownRows = [...mine].map(([tag, v]) => ({ tag, posts: v.length, median: median(v), lift: ownMedian ? median(v) / ownMedian : null }));
  const theirs = new Map();
  let read = 0;
  for (const [name, posts] of Object.entries(accounts)) {
    const withViews = posts.filter((p) => Number.isFinite(p.views) && p.views > 0);
    const m = median(withViews.map((p) => p.views));
    if (withViews.length < 5 || !m) continue;                 // too few posts to know what is normal for this account
    read += withViews.length;
    for (const p of withViews) for (const t of tagsOf(p.caption)) {
      const e = theirs.get(t) || theirs.set(t, { ratios: [], accounts: new Set() }).get(t);
      e.ratios.push(p.views / m); e.accounts.add(name);
    }
  }
  const theirRows = [...theirs].map(([tag, e]) => ({ tag, posts: e.ratios.length, accounts: e.accounts.size, lift: median(e.ratios) }));
  const ranked = theirRows.filter((r) => r.posts >= 3 && r.accounts >= 2).sort((a, b) => b.lift - a.lift || b.posts - a.posts);
  const thin = theirRows.filter((r) => !(r.posts >= 3 && r.accounts >= 2)).sort((a, b) => b.posts - a.posts);
  return { ownPosts: ownViews.length, ownMedian, ownRows: ownRows.sort((a, b) => b.posts - a.posts || (b.lift || 0) - (a.lift || 0)), theirPosts: read, accountsRead: Object.keys(accounts).length, ranked, thin };
}

export function load(root) {
  const ig = readJSON(path.join(root, 'brand', 'instagram.json'), {});
  const own = (Array.isArray(ig.media) ? ig.media : []).map((p) => ({ caption: p.caption, views: Number(p.insights?.views ?? p.insights?.plays) })).map((p) => ({ ...p, views: Number.isFinite(p.views) ? p.views : NaN }));
  const dir = path.join(root, 'brand', 'research');
  const accounts = {};
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    if (!f.endsWith('.csv') || f === 'history.csv' || f.startsWith('hashtag-')) continue;
    try { accounts[f.replace(/\.csv$/, '')] = parseCsv(fs.readFileSync(path.join(dir, f), 'utf8')).map((r) => ({ caption: r.caption, views: r.views === '' ? NaN : Number(r.views) })); } catch {}
  }
  return { own, accounts };
}

const x = (n) => (n == null ? '?' : `${n >= 10 ? Math.round(n) : Math.round(n * 10) / 10}x`);
export function report(a, niche = {}) {
  const L = ['# Hashtags: what has gone with good numbers', '', '_Made by `hashtags.mjs` from this brand\'s own posts and the researched accounts. It shows what went WITH good posts, not that a tag caused it. Instagram allows 5 hashtags in a caption: pick 3 to 5, caption only._', ''];
  const steady = (niche.tags || []).map((t) => `#${String(t).replace(/^#/, '')}`);
  L.push(steady.length ? `Steady tags from the brand's niche setup (brand.json -> niche): ${steady.join(' ')}. Keep one or two of these on every reel and rotate the rest.` : "No steady tags set yet: /caption-and-hashtags asks for the brand's niche on first use (brand.json -> niche).", '');
  L.push(`Read: ${a.ownPosts} of this brand's own posts with views (median ${a.ownMedian == null ? 'none yet' : Math.round(a.ownMedian)} views), and ${a.theirPosts} posts from ${a.accountsRead} researched account${a.accountsRead === 1 ? '' : 's'}.`, '');
  L.push('## On this brand\'s own posts', '');
  const own = a.ownRows.filter((r) => r.posts >= 2);
  if (!own.length) L.push(a.ownPosts ? 'No tag has been used on 2 or more of this brand\'s posts yet, so there is nothing to compare. Using the same few tags on several reels is how this fills in.' : 'No own posts with views yet (they come from the Instagram connection, `docs/connect.md`).');
  else L.push('| Tag | Posts | Median views | Against all own posts |', '| --- | --- | --- | --- |', ...own.slice(0, 15).map((r) => `| #${r.tag} | ${r.posts} | ${Math.round(r.median)} | ${x(r.lift)} |`));
  L.push('', '## On other accounts\' posts (each post against its own account\'s median)', '');
  if (!a.ranked.length) L.push(a.theirPosts ? 'No tag appears on 3 or more posts from 2 or more accounts yet.' : 'No researched accounts with views yet (`/content-calendar competitors`, or `research.mjs competitor <username>`).');
  else L.push('| Tag | Posts | Accounts | Typical post against its account\'s median |', '| --- | --- | --- | --- |', ...a.ranked.slice(0, 25).map((r) => `| #${r.tag} | ${r.posts} | ${r.accounts} | ${x(r.lift)} |`));
  if (a.thin.length) L.push('', `<details><summary>Too few to say (${a.thin.length} tags on fewer than 3 posts or 1 account)</summary>`, '', a.thin.slice(0, 40).map((r) => `#${r.tag} (${r.posts})`).join(', '), '', '</details>');
  return L.join('\n') + '\n';
}

export function run(root) {
  const a = analyze(load(root));
  writeAtomic(path.join(root, 'brand', 'hashtags.md'), report(a, readJSON(path.join(root, 'brand', 'brand.json'), {})?.niche || {}));
  return a;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const root = brandRoot(process.cwd());
  const a = run(root);
  const best = [...a.ranked.slice(0, 5).map((r) => `#${r.tag} (${x(r.lift)}, ${r.posts} posts)`)];
  console.log(`Wrote brand/hashtags.md: ${a.ownPosts} own posts and ${a.theirPosts} posts from ${a.accountsRead} accounts read.${best.length ? ` Strongest on other accounts: ${best.join(', ')}.` : ' Not enough data to rank any tag yet.'}`);
}
