#!/usr/bin/env node
// Bring what the publisher really did back into the brand folder, so the dashboard shows it. Run from the brand folder:
//
//   node publisher/scripts/pull.mjs [brand folder]
//
// It reads GET /admin (posts, their status per platform, media ids, links, errors) and GET /admin/inbox (mentions,
// messages, automatic replies) and writes:
//   - brand/publisher.json: all of that, without any secret address or key;
//   - for each post that went out with a link, one line under "## Posting" in that reel's approvals.md, written once:
//       - <YYYY-MM-DD HH:MM> Posted on @<handle>: <instagram link>
//       - <YYYY-MM-DD HH:MM> Posted on Facebook: <link>
//       - <YYYY-MM-DD HH:MM> Posted on Threads: <link>
//       - <YYYY-MM-DD HH:MM> Posted on YouTube: <link>   (TikTok: a link when it is public; a draft says it is waiting in the inbox)
//   - for each automatic comment reply the Worker sent, one line in brand/inbox-log.md (the same shape the
//     dashboard's comments.mjs writes), written once.
// It only reads from the publisher; it never schedules, posts or sends anything.
import fs from 'node:fs';
import path from 'node:path';
import { readJSON, read, findBrand, brandSlug, atHandle, stamp, appendUnder, connection, admin, Plain, isMain, CONFIG_DIR } from './lib.mjs';
import { findReel } from './reels.mjs';

function inboxLog(root, line, mark) {
  const f = path.join(root, 'brand', 'inbox-log.md');
  if (!fs.existsSync(f)) fs.writeFileSync(f, '# inbox-log.md: what was done with comments and DMs\n\nOne line per action, written by comments.mjs and dms.mjs after the owner said yes.\n\n');
  if (read(f).includes(mark)) return false;
  fs.appendFileSync(f, `${line}\n`);
  return true;
}

export async function pull({ root, fetchImpl = fetch, configDir = CONFIG_DIR, log = console.log } = {}) {
  const brand = readJSON(path.join(root, 'brand', 'brand.json'), {});
  const handle = atHandle(brand.handle) || '@(no handle)';
  const conn = connection(brandSlug(root, brand), configDir);
  const a = await admin(conn, 'GET', '/admin', { fetchImpl });
  const inbox = await admin(conn, 'GET', '/admin/inbox', { fetchImpl });

  const posts = (a.posts || []).map((p) => ({
    id: p.id, reel: p.reel || null, kind: p.kind, at: p.at, status: p.status, platforms: p.platforms,
    trial: Boolean(p.options?.trial),
    targets: Object.fromEntries(Object.entries(p.targets || {}).map(([k, t]) => [k, {
      status: t.status, mode: t.mode, media_id: t.media_id || null, permalink: t.permalink || null,
      published_at: t.published_at || null, error: t.error || null,
    }])),
    last_event: p.history?.at(-1)?.event || null,
  }));
  const out = {
    pulled_at: new Date().toISOString(), brand: a.brand, api_setup: a.api_setup, comment_replies: a.mode,
    platforms: a.platforms, posts,
    inbox: { mentions: inbox.mentions || [], messages: inbox.messages || [], replies: inbox.replies || {} },
  };
  fs.writeFileSync(path.join(root, 'brand', 'publisher.json'), JSON.stringify(out, null, 2) + '\n');

  // "Posted on" lines, once per link
  let added = 0;
  for (const p of posts) {
    const reelDir = p.reel ? findReel(root, p.reel) : null;
    const ap = reelDir ? path.join(reelDir, 'approvals.md') : null;
    if (!ap || !fs.existsSync(ap)) continue;
    for (const [name, label] of [['instagram', `Posted on ${handle}`], ['facebook', 'Posted on Facebook'], ['threads', 'Posted on Threads'], ['youtube', 'Posted on YouTube'], ['tiktok', 'Posted on TikTok']]) {
      const t = p.targets[name];
      if (name === 'tiktok' && t?.status === 'published' && t.draft && !read(ap).includes('TikTok inbox')) {
        appendUnder(ap, 'Posting', `- ${stamp(t.published_at ? new Date(t.published_at) : new Date())} Sent to the TikTok inbox as a draft: waiting for the owner to post it from the TikTok app`);
        added++; continue;
      }
      if (t?.status !== 'published' || !t.permalink) continue;
      if (read(ap).includes(t.permalink)) continue;
      const when = t.published_at ? new Date(t.published_at) : new Date();
      appendUnder(ap, 'Posting', `- ${stamp(when)} ${label}: ${t.permalink}`);
      added++;
    }
  }

  // automatic replies the Worker sent (a public reply, a DM, or both)
  let logged = 0;
  for (const r of [...(inbox.replies?.sent || []), ...(inbox.replies?.errors || [])].sort((x, y) => (x.at < y.at ? -1 : 1))) {
    const sent = [r.reply === 'sent' && 'public reply', r.dm === 'sent' && 'DM'].filter(Boolean);
    if (!sent.length) continue;
    const mark = `comment ${r.comment_id}`;
    const line = `- ${stamp(new Date(r.at))} Automatic reply to @${r.username || r.from_id} on ${mark} (rule ${r.rule}): ${sent.join(' and ')} sent by the publisher`;
    if (inboxLog(root, line, mark)) logged++;
  }
  log(`Pulled ${posts.length} post(s) into brand/publisher.json; ${added} posting line(s) added; ${logged} automatic repl${logged === 1 ? 'y' : 'ies'} logged.`);
  return { posts: posts.length, added, logged };
}

if (isMain(import.meta.url)) {
  const root = findBrand(process.argv[2] || process.cwd());
  if (!root) { console.error('Run this inside the brand folder (where brand/brand.json is).'); process.exit(1); }
  // a brand with no publisher connected is not an error (the dashboard's refresh may call this for every brand)
  if (!fs.existsSync(path.join(CONFIG_DIR, `publisher-${brandSlug(root)}.json`))) { console.log('No publisher connected for this brand: nothing to pull.'); process.exit(0); }
  pull({ root }).catch((e) => { console.error(e instanceof Plain ? e.message : `Unexpected error: ${e?.message || e}`); process.exit(1); });
}
