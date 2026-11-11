#!/usr/bin/env node
// Research through Meta's official API: other business and creator accounts' public posts (business discovery), and
// the top or recent posts for a hashtag (hashtag search). Read only. Both need the Unified or Facebook Login connection
// (docs/connect.md, step 2B); hashtag search also needs Meta's "Instagram Public Content Access" approval.
//
//   node .claude/skills/content-calendar/research.mjs competitor <username> [--posts 50]
//       writes brand/research/<username>.csv (url, timestamp, views, likes, comments, caption) for
//       python3 .claude/skills/account-audit/outliers.py --csv brand/research/<username>.csv --owner <username>
//   node .claude/skills/content-calendar/research.mjs hashtag <tag> [--recent]
//       writes brand/research/hashtag-<tag>.csv the same way (top posts by default; Meta allows 30 hashtags a week)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { brandRoot, writeAtomic, readJSON } from './lib.mjs';
import { connect, Plain } from './instagram.mjs';

const FIELDS = 'id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count';
// hashtag top_media and recent_media do not offer media_product_type, so they get their own list
const HASHTAG_FIELDS = 'id,caption,media_type,permalink,timestamp,like_count,comments_count';
const USERNAME = /^[A-Za-z0-9._]{1,30}$/;        // Instagram's own rule for a username
const csvCell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
function writeCsv(root, name, rows) {
  const file = path.join(root, 'brand', 'research', `${name.replace(/[^a-z0-9._-]/gi, '_')}.csv`);
  writeAtomic(file, 'url,timestamp,views,likes,comments,caption,type\n' + rows.map((r) => [r.permalink, r.timestamp, r.view_count ?? '', r.like_count ?? '', r.comments_count ?? '', String(r.caption || '').replace(/\s+/g, ' ').slice(0, 300), r.media_product_type || r.media_type || ''].map(csvCell).join(',')).join('\n') + '\n');
  return path.relative(root, file);
}

async function main() {
  const args = process.argv.slice(2);
  const bi = args.indexOf('--brand'), pi = args.indexOf('--posts');
  const root = brandRoot(bi >= 0 ? args[bi + 1] : undefined);
  const [what, name] = args.filter((a, i) => !a.startsWith('--') && !(bi >= 0 && i === bi + 1) && !(pi >= 0 && i === pi + 1));
  if (!what || !name) throw new Plain('usage: research.mjs competitor <username> | hashtag <tag> [--recent]');
  const api = connect(root);
  if (api.login === 'instagram') throw new Plain(`${what === 'hashtag' ? 'hashtag search' : 'business discovery'} works through the Unified or Facebook Login connection, not Instagram Login (Meta's rule). Connect with "login": "unified" (docs/connect.md, step 2B)`);
  fs.mkdirSync(path.join(root, 'brand', 'research'), { recursive: true });

  if (what === 'competitor') {
    const user = name.replace(/^@/, '');
    if (!USERNAME.test(user)) throw new Plain(`"${name}" is not an Instagram username (letters, numbers, dots and underscores, up to 30)`);
    const n = Math.min(100, Math.max(5, Number(pi >= 0 ? args[pi + 1] : 50) || 50));
    const r = await api.get(api.me, { fields: `business_discovery.username(${user}){username,followers_count,media_count,media.limit(${n}){${FIELDS},view_count}}` });
    const bd = r.business_discovery;
    if (!bd) throw new Plain(`no public data for @${user}: it must be a business or creator account (and not age-gated)`);
    const posts = bd.media?.data || [];
    const file = writeCsv(root, user, posts);
    // the account itself, for /content-calendar how-often: followers, how many posts it has, how many were read and when
    const accFile = path.join(root, 'brand', 'research', 'accounts.json');
    const accounts = readJSON(accFile, {});
    accounts[(bd.username || user).toLowerCase()] = { followers: bd.followers_count ?? null, media_count: bd.media_count ?? null, read: posts.length, pulled_at: new Date().toISOString() };
    writeAtomic(accFile, JSON.stringify(accounts, null, 2) + '\n');
    const views = posts.map((p) => p.view_count).filter((v) => v != null).sort((a, b) => a - b);
    const med = views.length ? views[views.length >> 1] : null;
    console.log(`@${bd.username || user}: ${bd.followers_count ?? '?'} followers, ${bd.media_count ?? '?'} posts; read ${posts.length} recent ones${med != null ? `, median ${med} views` : ''}. Wrote ${file}.`);
    if (views.length) console.log(`Next: python3 .claude/skills/account-audit/outliers.py --csv ${file} --owner ${user}`);
    else console.log('Meta gave no view counts for these posts, so the outlier check (views against the median) cannot run on them; compare likes and comments in the file instead.');
  } else if (what === 'hashtag') {
    const tag = name.replace(/^#/, '');
    const id = (await api.get('ig_hashtag_search', { user_id: api.me, q: tag })).data?.[0]?.id;
    if (!id) throw new Plain(`Meta returned no hashtag for #${tag} (it may be one Meta marks as sensitive)`);
    const edge = args.includes('--recent') ? 'recent_media' : 'top_media';
    const posts = (await api.get(`${id}/${edge}`, { user_id: api.me, fields: HASHTAG_FIELDS, limit: '50' })).data || [];
    const file = writeCsv(root, `hashtag-${tag}`, posts);
    console.log(`#${tag}: ${posts.length} ${edge === 'top_media' ? 'top' : 'recent'} posts. Wrote ${file}. Meta allows 30 different hashtags a week per account.`);
  } else throw new Plain(`unknown "${what}": competitor or hashtag`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => {
    const hint = e.code === 10 || e.code === 200 ? ' (hashtag search needs Meta to approve the "Instagram Public Content Access" feature for your app, docs/connect.md step 2B)' : '';
    console.error(`Research: ${e instanceof Plain ? e.message : 'unexpected error (details hidden so no token can show)'}${e instanceof Plain ? hint : ''}`); process.exit(1);
  });
}
