// Instagram posting through Meta's content publishing API (v27.0), for both API setups (see graph.js).
//
// Flow (Content Publishing guide and IG User Media reference, read 2026-11-09):
//   1. POST /<IG_ID>/media creates a container. Meta fetches the file from the public address we give it (our secret
//      /media/<token> address on this Worker).
//      Reel:      media_type=REELS, video_url, caption, share_to_feed, cover_url (or thumb_offset when there is no
//                 approved cover; Meta ignores thumb_offset when cover_url is set), trial_params, collaborators,
//                 location_id, user_tags, audio_name.
//      Image:     image_url, caption, location_id, user_tags (with x and y), collaborators.
//      Carousel:  one container per item first (image_url or media_type=VIDEO + video_url, is_carousel_item=true),
//                 then media_type=CAROUSEL with children (2 to 20 ids), caption, collaborators, location_id.
//      Story:     media_type=STORIES with image_url or video_url, optional user_tags. No caption, no collaborators.
//   2. GET /<CONTAINER_ID>?fields=status_code until FINISHED (ERROR or EXPIRED fail; IN_PROGRESS waits).
//   3. GET /<IG_ID>/content_publishing_limit?fields=quota_usage,config; if the 24-hour quota is used up, wait.
//   4. POST /<IG_ID>/media_publish with creation_id. Then GET /<MEDIA_ID>?fields=permalink for the link.
// One step per run (the cron runs every 5 minutes), so a slow video never holds the run up.
//
// The link: when media_publish timed out but Meta published (the container then says PUBLISHED), or the permalink
// call failed, the target is published with link_pending. The next runs (up to LINK_TRIES) look for the media id
// among the account's newest posts (GET /<IG_ID>/media, matched by caption and time) and then its permalink, so the
// Threads link post and pull.mjs's "Posted on" line still happen.

import { OutOfBudget } from './graph.js';

const STALE_MS = 30 * 60 * 1000;
export const LINK_TRIES = 6;
const metaTime = (s) => Date.parse(String(s || '').replace(/([+-]\d\d)(\d\d)$/, '$1:$2'));

// Find the media id (when missing) and the permalink of a published post. Never fails the post: it is already up.
async function findLink(c) {
  const { api, post, t, env, name } = c;
  try {
    if (!t.media_id) {
      const want = String(post.text?.instagram || '').trim();
      const since = (Date.parse(t.started) || c.now) - 120000;
      const r = await api.get(`${env.IG_USER_ID}/media?fields=id,caption,permalink,timestamp&limit=10`);
      const hit = (r.data || []).find((m) => metaTime(m.timestamp) >= since && (!want || String(m.caption || '').trim() === want));
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

// The bodies sent to POST /<IG_ID>/media. `url(item)` gives the public address of an uploaded file.
export function itemBody(item, url) {
  return item.type === 'video'
    ? { media_type: 'VIDEO', video_url: url(item), is_carousel_item: true }
    : { image_url: url(item), is_carousel_item: true };
}

export function mainBody(post, name, url) {
  const o = post.options || {};
  const caption = post.text?.instagram || '';
  const video = post.media.find((m) => m.role === 'video');
  const cover = post.media.find((m) => m.role === 'cover');
  const tags = (o.user_tags || []).map((u) => (typeof u === 'string' ? { username: u.replace(/^@/, '') } : u));
  const collab = o.collaborators?.length ? { collaborators: o.collaborators.map((c) => c.replace(/^@/, '')) } : {};
  const where = o.location_id ? { location_id: String(o.location_id) } : {};
  if (name === 'instagram_story') {
    return { media_type: 'STORIES', video_url: url(video), ...(tags.length ? { user_tags: tags } : {}) };
  }
  if (post.kind === 'story') {
    const item = post.media[0];
    return { media_type: 'STORIES', [item.type === 'video' ? 'video_url' : 'image_url']: url(item), ...(tags.length ? { user_tags: tags } : {}) };
  }
  if (post.kind === 'image') {
    // an image tag needs x and y (0 to 1); the middle unless the owner gave a spot
    const imgTags = tags.map((t) => ({ username: t.username, x: t.x ?? 0.5, y: t.y ?? 0.5 }));
    return { image_url: url(post.media[0]), caption, ...where, ...collab, ...(imgTags.length ? { user_tags: imgTags } : {}) };
  }
  // a reel
  const body = { media_type: 'REELS', video_url: url(video), caption };
  if (o.trial) body.trial_params = { graduation_strategy: 'MANUAL' };   // shown to non-followers first; the owner shares it to followers in the app
  else body.share_to_feed = o.share_to_feed !== false;
  if (cover) body.cover_url = url(cover);
  else body.thumb_offset = Number(o.thumb_offset || 0);
  if (o.audio_name) body.audio_name = String(o.audio_name);
  if (tags.length) body.user_tags = tags.map((t) => ({ username: t.username }));
  return { ...body, ...where, ...collab };
}

export function carouselBody(post, children) {
  const o = post.options || {};
  return {
    media_type: 'CAROUSEL', caption: post.text?.instagram || '', children: children.join(','),
    ...(o.location_id ? { location_id: String(o.location_id) } : {}),
    ...(o.collaborators?.length ? { collaborators: o.collaborators.map((c) => c.replace(/^@/, '')) } : {}),
  };
}

const isCarousel = (post, name) => post.kind === 'carousel' && name === 'instagram';

// What a dry run records instead of calling Meta.
export function describe(post, name, url) {
  if (isCarousel(post, name)) {
    const items = post.media.filter((m) => m.role === 'item');
    return { items: items.map((m) => itemBody(m, url)), carousel: carouselBody(post, items.map((_, i) => `<item ${i + 1}>`)) };
  }
  return { container: mainBody(post, name, url) };
}

// Is the 24-hour publishing quota used up? An answer we cannot read never blocks (Meta enforces it anyway).
export async function quotaFull(api, igId) {
  const lim = await api.get(`${igId}/content_publishing_limit?fields=quota_usage,config`).catch(() => null);
  const used = lim?.data?.[0]?.quota_usage; const total = lim?.data?.[0]?.config?.quota_total;
  return used != null && total != null && used >= total ? `${used}/${total}` : null;
}

// Move one Instagram target forward by one step. `c` carries the api, the post, the target and helpers.
export async function step(c) {
  const { api, post, t, env, name } = c;
  const ig = env.IG_USER_ID;
  if (t.status === 'published' && t.link_pending) return findLink(c);
  if (t.status === 'pending') {
    if (isCarousel(post, name)) {
      const items = post.media.filter((m) => m.role === 'item');
      t.children = t.children || [];
      while (t.children.length < items.length) {               // one at a time, so a cut-off run resumes where it stopped
        const r = await api.post(`${ig}/media`, itemBody(items[t.children.length], c.url));
        t.children.push(r.id);
      }
      t.status = 'children'; t.started = c.stamp;
      return c.log(`${items.length} carousel item containers created`);
    }
    const r = await api.post(`${ig}/media`, mainBody(post, name, c.url));
    t.container_id = r.id; t.status = 'processing'; t.started = c.stamp;
    return c.log('container created', { container_id: r.id });
  }
  if (t.status === 'children') {
    let waiting = false;
    for (const id of t.children) {
      const s = await api.get(`${id}?fields=status_code,status`);
      if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') return c.fail(`carousel item ${id} is ${s.status_code}${s.status ? ` (${s.status})` : ''}`);
      if (s.status_code !== 'FINISHED') waiting = true;
    }
    if (waiting) {
      if (c.now - Date.parse(t.started) > STALE_MS) return c.fail('carousel items not ready after 30 minutes');
      return;
    }
    const r = await api.post(`${ig}/media`, carouselBody(post, t.children));
    t.container_id = r.id; t.status = 'processing'; t.started = c.stamp;
    return c.log('carousel container created', { container_id: r.id });
  }
  if (t.status === 'processing') {
    const s = await api.get(`${t.container_id}?fields=status_code,status`);
    if (s.status_code === 'FINISHED') {
      const full = await quotaFull(api, ig);
      if (full) return c.wait(`Instagram's 24-hour publishing limit is used up (${full}); trying again next run`);
      const r = await api.post(`${ig}/media_publish`, { creation_id: t.container_id });
      t.media_id = r.id; t.published_at = c.stamp; t.status = 'published';
      if (name === 'instagram') t.link_pending = true;                 // until the link is read (next runs if need be)
      const m = await api.get(`${r.id}?fields=permalink`).catch((e) => { if (e instanceof OutOfBudget) throw e; return null; });
      if (m?.permalink) { t.permalink = m.permalink; delete t.link_pending; }
      return c.log('published', { media_id: r.id, permalink: t.permalink || null });
    }
    if (s.status_code === 'PUBLISHED') {
      // media_publish's answer was lost but Meta published: find the id and link on this and the next runs
      t.status = 'published'; t.published_at = t.published_at || c.stamp;
      c.log('container already published');
      if (name === 'instagram') { t.link_pending = true; return findLink(c); }
      return;
    }
    if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') return c.fail(`container ${s.status_code}${s.status ? ` (${s.status})` : ''}`);
    if (c.now - Date.parse(t.started) > STALE_MS) return c.fail(`container not ready after 30 minutes (${s.status_code || 'no status'})`);
  }
}
