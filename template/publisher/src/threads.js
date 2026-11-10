// A Threads post for each reel, through the Threads API (graph.threads.com, v1.0).
//
// Flow (Threads Posts guide, publishing reference and troubleshooting page, read 2026-11-09):
//   1. POST /<THREADS_USER_ID>/threads creates a container:
//        video: media_type=VIDEO, video_url (our secret address), text
//        text:  media_type=TEXT, text, link_attachment (the reel's Instagram link; the link preview card)
//   2. GET /<CONTAINER_ID>?fields=status,error_message until FINISHED (Meta suggests waiting about 30 seconds).
//   3. GET /<THREADS_USER_ID>/threads_publishing_limit?fields=quota_usage,config (250 posts in 24 hours).
//   4. POST /<THREADS_USER_ID>/threads_publish with creation_id. Then GET /<MEDIA_ID>?fields=permalink.
// Text is limited to 500 characters (emojis count as their UTF-8 bytes); see limits.js.
// Needs threads_basic and threads_content_publish. The owner picks video or text per post (--threads text|video).

import { OutOfBudget } from './graph.js';

const STALE_MS = 30 * 60 * 1000;
export const LINK_TRIES = 6;
const metaTime = (x) => Date.parse(String(x || '').replace(/([+-]\d\d)(\d\d)$/, '$1:$2'));

// Like instagram.js: a published post whose id or link is missing is looked up on the next runs (never fails it).
async function findLink(c) {
  const { api, post, t, env } = c;
  try {
    if (!t.media_id) {
      const want = String(post.text?.threads || '').trim();
      const since = (Date.parse(t.started) || c.now) - 120000;
      const r = await api.get(`${env.THREADS_USER_ID}/threads?fields=id,text,permalink,timestamp&limit=10`);
      const hit = (r.data || []).find((m) => metaTime(m.timestamp) >= since && (!want || String(m.text || '').trim() === want));
      if (hit) { t.media_id = String(hit.id); if (hit.permalink) t.permalink = hit.permalink; }
    }
    if (t.media_id && !t.permalink) {
      const m = await api.get(`${t.media_id}?fields=permalink`);
      if (m?.permalink) t.permalink = m.permalink;
    }
  } catch (e) {
    if (e instanceof OutOfBudget) throw e;
    c.log(`could not read the link yet: ${e.message}`);
  }
  if (t.permalink && t.media_id) { delete t.link_pending; delete t.link_tries; return c.log('link found', { media_id: t.media_id, permalink: t.permalink }); }
  t.link_tries = (t.link_tries || 0) + 1;
  if (t.link_tries >= LINK_TRIES) { delete t.link_pending; return c.log(`published, but its link could not be read after ${LINK_TRIES} tries`); }
}

export function containerBody(post, url, link) {
  const text = post.text?.threads || '';
  if ((post.options?.threads_mode || 'video') === 'text') return { media_type: 'TEXT', text, link_attachment: link || '<the Instagram link, once it is published>' };
  return { media_type: 'VIDEO', video_url: url(post.media.find((m) => m.role === 'video')), text };
}

export function describe(post, name, url) {
  return { container: containerBody(post, url, post.options?.link) };
}

export async function step(c) {
  const { api, post, t, env } = c;
  const uid = env.THREADS_USER_ID;
  if (t.status === 'published' && t.link_pending) return findLink(c);
  if (t.status === 'pending') {
    let link;
    if ((post.options?.threads_mode || 'video') === 'text') {
      link = post.options?.link;
      if (!link) {
        const ig = post.targets.instagram;
        if (!ig) return c.fail('a text post needs a link and there is no Instagram post to link to');
        if (ig.link_pending) return;                           // Instagram is up; its link is still being read
        if (ig.status === 'published' && ig.permalink) link = ig.permalink;
        else if (['failed', 'dry_run', 'cancelled'].includes(ig.status) || (ig.status === 'published' && !ig.permalink)) return c.fail(`no Instagram link to share (the Instagram post is ${ig.status})`);
        else return;                                           // wait for Instagram to publish first
      }
    }
    const r = await api.post(`${uid}/threads`, containerBody(post, c.url, link));
    t.container_id = r.id; t.status = 'processing'; t.started = c.stamp;
    return c.log('container created', { container_id: r.id, link: link || null });
  }
  if (t.status === 'processing') {
    const s = await api.get(`${t.container_id}?fields=status,error_message`);
    if (s.status === 'FINISHED') {
      const lim = await api.get(`${uid}/threads_publishing_limit?fields=quota_usage,config`).catch(() => null);
      const used = lim?.data?.[0]?.quota_usage; const total = lim?.data?.[0]?.config?.quota_total;
      if (used != null && total != null && used >= total) return c.wait(`Threads' 24-hour posting limit is used up (${used}/${total}); trying again next run`);
      const r = await api.post(`${uid}/threads_publish`, { creation_id: t.container_id });
      t.media_id = r.id; t.status = 'published'; t.published_at = c.stamp;
      t.link_pending = true;                                            // until the link is read (next runs if need be)
      const m = await api.get(`${r.id}?fields=permalink`).catch((e) => { if (e instanceof OutOfBudget) throw e; return null; });
      if (m?.permalink) { t.permalink = m.permalink; delete t.link_pending; }
      return c.log('published', { media_id: r.id, permalink: t.permalink || null });
    }
    if (s.status === 'PUBLISHED') {
      t.status = 'published'; t.published_at = t.published_at || c.stamp; t.link_pending = true;
      c.log('container already published');
      return findLink(c);
    }
    if (s.status === 'ERROR' || s.status === 'EXPIRED') return c.fail(`container ${s.status}${s.error_message ? ` (${s.error_message})` : ''}`);
    if (c.now - Date.parse(t.started) > STALE_MS) return c.fail(`container not ready after 30 minutes (${s.status || 'no status'})`);
  }
}
