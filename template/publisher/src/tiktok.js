// The same reel on TikTok, through the Content Posting API (FILE_UPLOAD: the bytes go from storage to TikTok, so no
// domain has to be verified).
//
// Two ways, picked for each post (options.tiktok_mode; the brand's default is the TIKTOK_POST_MODE var, "draft"):
//   draft   POST /v2/post/publish/inbox/video/init/ (scope video.upload). The video lands in the owner's TikTok inbox
//           and the owner taps the notification, edits and posts it in the app. TikTok then reports SEND_TO_USER_INBOX,
//           which is where the kit calls it done: it is waiting for a person, by TikTok's design.
//   direct  POST /v2/post/publish/video/init/ (scope video.publish) with the caption and who can see it. Until TikTok
//           has audited the app, everything it posts is private (SELF_ONLY): "All content posted by unaudited clients
//           will be restricted to private viewing mode" (Direct Post reference). TIKTOK_AUDITED = "yes" in
//           wrangler.toml says the audit passed; without it the Worker refuses a public direct post when it is scheduled.
//           Before a direct post the Worker asks TikTok what this account may choose (creator_info/query) and refuses
//           a privacy or length the account does not offer.
//
// Flow (Direct Post and Upload references, Media Transfer Guide, Get Post Status, read 2026-11-11):
//   1. init -> publish_id and upload_url (valid one hour; saved at once, never shown by GET /admin)
//   2. PUT the bytes in chunks with Content-Range (one chunk up to 64 MB, else 32 MB chunks and the last takes the rest)
//   3. POST /v2/post/publish/status/fetch/ until PUBLISH_COMPLETE (direct), SEND_TO_USER_INBOX (draft) or FAILED
// A cover cannot be sent: TikTok takes a frame time (video_cover_timestamp_ms, from --thumb-offset), else frame one.
//
// Never twice: an init that was never followed by an upload publishes nothing, so a lost init answer is harmless; the
// publish_id is saved the moment it exists; each chunk is saved when TikTok took it, and a chunk whose answer was lost
// is sent again with the same range (TikTok overwrites the same range).
export const TT_ONE_CHUNK_MAX = 64 * 1024 * 1024;
export const TT_CHUNK = 32 * 1024 * 1024;
const STALE_MS = 60 * 60 * 1000;
const video = (post) => post.media.find((m) => m.role === 'video');
const save = (c) => (c.save ? c.save() : null);

export function chunkPlan(size) {
  if (size <= TT_ONE_CHUNK_MAX) return { chunk_size: size, total: 1 };
  return { chunk_size: TT_CHUNK, total: Math.floor(size / TT_CHUNK) };      // the last chunk takes the remainder
}

export function postInfo(post) {
  const o = post.options || {};
  return {
    title: post.text?.tiktok || '', privacy_level: o.tiktok_privacy || 'SELF_ONLY',
    disable_duet: false, disable_comment: false, disable_stitch: false, brand_content_toggle: false, brand_organic_toggle: false,
    ...(o.thumb_offset !== undefined ? { video_cover_timestamp_ms: o.thumb_offset } : {}),
    ...(o.ai_generated ? { is_aigc: true } : {}),
  };
}

export function describe(post) {
  const o = post.options || {};
  const direct = o.tiktok_mode === 'direct';
  return { mode: direct ? 'direct post' : 'draft in the TikTok inbox', init: direct ? { post_info: postInfo(post), source_info: { source: 'FILE_UPLOAD' } } : { source_info: { source: 'FILE_UPLOAD' } }, upload: 'the approved video, sent in chunks from storage (no public address)' };
}

export async function step(c) {
  const { api, post, t, env } = c;
  const o = post.options || {};
  const direct = o.tiktok_mode === 'direct';
  const vid = video(post);
  if (t.status === 'pending') {
    if (!t.publish_id) {
      const head = await env.MEDIA.head(vid.key);
      if (!head) return c.fail('the video is gone from storage');
      if (direct) {
        const info = (await api.post('/v2/post/publish/creator_info/query/', {})).data || {};
        t.creator_username = info.creator_username || t.creator_username;
        const options = info.privacy_level_options || [];
        if (!options.includes(o.tiktok_privacy)) return c.fail(`TikTok does not offer "${o.tiktok_privacy}" for this account right now (it offers ${options.join(', ') || 'nothing'}): schedule the post again with one of those`);
        if (post.video_seconds != null && info.max_video_post_duration_sec && post.video_seconds > info.max_video_post_duration_sec) return c.fail(`the video is ${Math.round(post.video_seconds)} seconds and this TikTok account can post ${info.max_video_post_duration_sec} seconds at most`);
      }
      const plan = chunkPlan(head.size);
      const source_info = { source: 'FILE_UPLOAD', video_size: head.size, chunk_size: plan.chunk_size, total_chunk_count: plan.total };
      let r;
      try {
        r = await api.post(direct ? '/v2/post/publish/video/init/' : '/v2/post/publish/inbox/video/init/', direct ? { post_info: postInfo(post), source_info } : { source_info });
      } catch (e) {
        if (e.code === 'unaudited_client_can_only_post_to_private_accounts') return c.fail('TikTok has not audited this app, so it can only post to private accounts. Schedule the post as a draft (the owner posts it from the TikTok inbox) or as private, or pass TikTok\'s audit (docs/connect.md)');
        if (e.code === 'spam_risk_too_many_posts') { e.passing = true; throw e; }
        throw e;
      }
      if (!r.data?.publish_id || !r.data?.upload_url) return c.fail('TikTok did not return a publish id and upload address');
      t.publish_id = r.data.publish_id; t.upload_url = r.data.upload_url;
      t.size = head.size; t.chunk_size = plan.chunk_size; t.chunks = plan.total; t.chunk_done = 0; t.phase = 'initialized'; t.started = c.stamp;
      c.log(`${direct ? 'direct post' : 'draft'} started`, { publish_id: t.publish_id, chunks: t.chunks });
      await save(c);
    }
    while (t.chunk_done < t.chunks) {
      if (c.now - Date.parse(t.started) > STALE_MS - 5 * 60 * 1000) return c.fail('the one-hour upload window TikTok gives ran out before the whole video was sent');
      const i = t.chunk_done;
      const start = i * t.chunk_size;
      const end = i === t.chunks - 1 ? t.size - 1 : start + t.chunk_size - 1;
      const obj = await env.MEDIA.get(vid.key, { range: { offset: start, length: end - start + 1 } });
      if (!obj) return c.fail('the video is gone from storage');
      await api.upload(t.upload_url, obj.body, { start, end, total: t.size });
      t.chunk_done = i + 1;
      c.log(`chunk ${t.chunk_done} of ${t.chunks} sent`);
      await save(c);
    }
    delete t.upload_url;
    t.phase = 'uploaded'; t.status = 'processing'; t.processing_since = c.stamp;
    return c.log('video sent to TikTok, waiting for it to be processed');
  }
  if (t.status === 'processing') {
    const s = (await api.post('/v2/post/publish/status/fetch/', { publish_id: t.publish_id })).data || {};
    if (s.status === 'FAILED') return c.fail(`TikTok could not take the video: ${s.fail_reason || 'no reason given'}`);
    if (s.status === 'SEND_TO_USER_INBOX' && !direct) {
      t.status = 'published'; t.draft = true; t.published_at = c.stamp;
      t.note = 'waiting in the TikTok inbox: open the TikTok app, tap the notification, then edit and post it';
      return c.log('draft is in the TikTok inbox: the owner posts it from the app', { publish_id: t.publish_id });
    }
    if (s.status === 'PUBLISH_COMPLETE') {
      const ids = (s.publicaly_available_post_id || []).map(String);
      t.status = 'published'; t.published_at = c.stamp;
      if (direct) { t.private = o.tiktok_privacy === 'SELF_ONLY'; if (ids[0]) { t.media_id = ids[0]; t.permalink = t.creator_username ? `https://www.tiktok.com/@${t.creator_username}/video/${ids[0]}` : `https://www.tiktok.com/video/${ids[0]}`; } }
      else t.note = 'the owner posted the draft from the TikTok app';
      return c.log('published', { publish_id: t.publish_id, post_id: ids[0] || null, privacy: direct ? o.tiktok_privacy : null });
    }
    if (c.now - Date.parse(t.processing_since || t.started) > STALE_MS) return c.fail(`TikTok did not finish after 60 minutes (${s.status || 'no status'})`);
  }
}
