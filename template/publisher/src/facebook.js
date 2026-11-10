// The same reel as a Facebook Reel on the brand's Page, through the Page video_reels flow.
//
// Flow (Reels Publishing API guide, developers.facebook.com/docs/video-api/guides/reels-publishing, read 2026-11-09):
//   1. POST /<PAGE_ID>/video_reels {upload_phase: "start"}                        -> video_id
//   2. POST rupload.facebook.com/video-upload/v27.0/<video_id>
//        headers "Authorization: OAuth <page token>" and "file_url: <our secret address>"   -> {success: true}
//      (Meta refuses files on hosts whose robots.txt blocks facebookexternalhit; this Worker's robots.txt allows /media/.)
//   3. POST /<PAGE_ID>/video_reels {upload_phase: "finish", video_id, video_state: "PUBLISHED", description}
//   4. GET /<video_id>?fields=status until video_status is "ready" (or publishing is complete).
//   5. With an approved cover: POST /<video_id>/thumbnails, multipart, source = the cover JPEG, is_preferred = true
//      (Video Thumbnails reference, read 2026-11-10: up to 10 MB, only on a video that belongs to a Page). A cover
//      Facebook refuses does not undo the post: the reel stays published with Facebook's own frame, and the reason is
//      written in the post's history and on the target (cover_error).
//   6. GET /<video_id>?fields=permalink_url for the link, in its own call: Meta's Video reference page does not list
//      the field (its Business SDK does), so a refusal there never fails a reel that is already up. Without it the
//      link is https://www.facebook.com/reel/<video_id>.
// Needs a Page access token from someone who can do CREATE_CONTENT on the Page, with pages_show_list,
// pages_read_engagement and pages_manage_posts. Meta allows 30 API-published reels per Page in 24 hours; the Worker
// counts its own and waits rather than going over.
//
// Never twice: steps 1 to 3 each change something at Meta, so the post is saved right after each one (t.phase goes
// "started" -> "uploaded" -> "finish_sent"), and a run that is cut off carries on from the saved phase next time. Once
// there is a video_id no new upload session is ever started for this post. "finish_sent" is saved BEFORE the finish
// call: if the answer never arrives (a time-out, Meta down), the next run first reads the video's status, and sends
// the finish again (for the same video, which cannot make a second reel) only when publishing has clearly not started.
import { OutOfBudget } from './graph.js';

const STALE_MS = 60 * 60 * 1000;          // Facebook can take longer than Instagram to process a reel
export const FB_DAILY = 30;

const cover = (post) => post.media.find((m) => m.role === 'cover');

export function describe(post, name, url) {
  const video = post.media.find((m) => m.role === 'video');
  return {
    start: { upload_phase: 'start' },
    upload: { file_url: url(video) },
    finish: { upload_phase: 'finish', video_id: '<from start>', video_state: 'PUBLISHED', description: post.text?.facebook || '' },
    ...(cover(post) ? { cover: { thumbnails: { is_preferred: true, source: url(cover(post)) } } } : {}),
  };
}

async function recent(env, now) {
  let list = [];
  try { list = JSON.parse((await env.KV.get('fb_publishes')) || '[]'); } catch {}
  return list.filter((t) => now - t < 864e5);
}

const save = (c) => (c.save ? c.save() : null);
const finishBody = (post, t) => ({ upload_phase: 'finish', video_id: t.video_id, video_state: 'PUBLISHED', description: post.text?.facebook || '' });
const statusError = (st) => [st.uploading_phase, st.processing_phase, st.publishing_phase].map((p) => p?.error?.message).find(Boolean);

// Facebook took the finish: count it against the 30 a day and wait for the reel to be ready.
async function finished(c, how) {
  const { t, env } = c;
  await env.KV.put('fb_publishes', JSON.stringify([...(await recent(env, c.now)), c.now]));
  t.phase = 'finished'; t.status = 'processing'; t.started = c.stamp;
  c.log(how, { video_id: t.video_id });
  await save(c);
}

export async function step(c) {
  const { api, post, t, env } = c;
  const page = env.FB_PAGE_ID;
  const video = post.media.find((m) => m.role === 'video');
  if (t.status === 'pending') {
    if (t.phase === 'finish_sent') return checkFinish(c);
    const done = await recent(env, c.now);
    if (done.length >= FB_DAILY) return c.wait(`Facebook's 30 reels a day for this Page are used up; trying again next run`);
    if (!t.video_id) {
      const s = await api.post(`${page}/video_reels`, { upload_phase: 'start' });
      if (!s.video_id) return c.fail('Facebook did not return a video_id');
      t.video_id = s.video_id; t.uploaded = false; t.phase = 'started';
      c.log('upload session started', { video_id: s.video_id });
      await save(c);
    }
    if (!t.uploaded) {
      const u = await api.uploadFromUrl(t.video_id, c.url(video));
      if (u.success !== true) return c.fail('Facebook did not accept the video upload');
      t.uploaded = true; t.phase = 'uploaded';
      c.log('video uploaded', { video_id: t.video_id });
      await save(c);
    }
    t.phase = 'finish_sent'; t.finish_sent_at = c.stamp;
    await save(c);                                           // before the call: a lost answer is checked, not resent blindly
    const f = await api.post(`${page}/video_reels`, finishBody(post, t));
    if (f.success !== true) return c.fail('Facebook did not accept the publish step');
    return finished(c, 'reel sent to the Page, processing');
  }
  if (t.status === 'processing') {
    const s = await api.get(`${t.video_id}?fields=status`);
    const st = s.status || {};
    const err = statusError(st);
    if (err || st.video_status === 'error') return c.fail(`Facebook could not process the reel: ${err || 'error'}`);
    if (st.video_status === 'ready' || st.publishing_phase?.status === 'complete') {
      await setCover(c);
      t.status = 'published'; t.media_id = t.video_id; t.published_at = c.stamp;
      const l = await api.get(`${t.video_id}?fields=permalink_url`).catch((e) => { if (e instanceof OutOfBudget) throw e; return null; });
      const link = l?.permalink_url || '';
      t.permalink = link ? (link.startsWith('http') ? link : `https://www.facebook.com${link.startsWith('/') ? '' : '/'}${link}`) : `https://www.facebook.com/reel/${t.video_id}`;
      return c.log('published', { video_id: t.video_id, permalink: t.permalink, cover: t.cover || 'Facebook picked the frame' });
    }
    if (c.now - Date.parse(t.started) > STALE_MS) return c.fail(`not ready after 60 minutes (${st.video_status || 'no status'})`);
  }
}

// The finish was sent but its answer was lost. Read the video's status first: if publishing started (or finished),
// Facebook took it. Only when publishing has clearly not started is the finish sent again, for the same video.
async function checkFinish(c) {
  const { api, post, t, env } = c;
  const s = await api.get(`${t.video_id}?fields=status`);
  const st = s.status || {};
  const err = statusError(st);
  if (err || st.video_status === 'error') return c.fail(`Facebook could not process the reel: ${err || 'error'}`);
  const pub = st.publishing_phase?.status;
  if (pub === 'in_progress' || pub === 'complete') return finished(c, 'Facebook had taken the publish step (checked its status); processing');
  if (pub !== 'not_started') {
    if (c.now - Date.parse(t.finish_sent_at) > STALE_MS) return c.fail('Facebook never showed whether it took the publish step: check the Page before posting it again');
    return c.wait('waiting for Facebook to show whether it took the publish step');
  }
  const done = await recent(env, c.now);
  if (done.length >= FB_DAILY) return c.wait(`Facebook's 30 reels a day for this Page are used up; trying again next run`);
  c.log('Facebook had not started publishing: sending the publish step again for the same video', { video_id: t.video_id });
  const f = await api.post(`${env.FB_PAGE_ID}/video_reels`, finishBody(post, t));
  if (f.success !== true) return c.fail('Facebook did not accept the publish step');
  return finished(c, 'reel sent to the Page, processing');
}

// The approved cover as the Facebook Reel's cover. Done once (t.cover), never fatal; out of budget carries on next run.
async function setCover(c) {
  const { api, post, t, env } = c;
  const img = cover(post);
  if (!img || t.cover) return;
  try {
    const obj = await env.MEDIA.get(img.key);
    if (!obj) throw new Error('the cover file is gone from storage');
    const bytes = await new Response(obj.body).arrayBuffer();
    const r = await api.postFile(`${t.video_id}/thumbnails`, { is_preferred: 'true' }, bytes, img.name || 'cover.jpg', 'image/jpeg');
    if (r.success === false) throw new Error('Facebook did not accept the cover');
    t.cover = 'set'; delete t.cover_error;
    c.log('cover set', { video_id: t.video_id });
  } catch (e) {
    if (e instanceof OutOfBudget) throw e;
    t.cover = 'not set'; t.cover_error = e.message;
    c.log(`cover not set, Facebook shows its own frame: ${e.message}`);
  }
}
