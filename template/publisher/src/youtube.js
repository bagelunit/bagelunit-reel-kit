// The same reel as a YouTube Short, through the YouTube Data API (videos.insert, resumable upload).
//
// Flow (Data API "Upload a Video" guide and videos.insert reference, read 2026-11-11):
//   1. POST upload/youtube/v3/videos?uploadType=resumable&part=snippet,status with the title, description and
//      privacy: the answer's Location header is the address to send the bytes to (the "session").
//   2. PUT the video's bytes to it (streamed from storage). 200 or 201 answers with the new video, so its id and link.
//   3. If that answer is lost (a time-out), ask the session how far it got (PUT with Content-Range: bytes */<size>):
//      complete means the video exists (take its id), 308 means send the rest from where it stopped.
// A Short is a vertical or square video up to 3 minutes: there is no flag to set. The text file's first line is the
// title, the rest the description, and #Shorts is added to the description when it is missing (limits.js youtubeParts).
// Needs the youtube.upload scope only. The project's default quota allows 100 uploads a day; the Worker counts its own
// and waits rather than going over. A custom thumbnail is not set (YouTube picks the frame; the cover is for Instagram
// and Facebook).
//
// Never twice: the session address is saved the moment it exists, "upload_sent" is saved BEFORE the bytes go out, and a
// run that finds "upload_sent" first asks the session what it has. A session that YouTube forgot is a failure to read
// (check the channel before posting it again), never a silent second upload.
import { youtubeParts } from './limits.js';

export const YT_DAILY = 100;
const video = (post) => post.media.find((m) => m.role === 'video');
const save = (c) => (c.save ? c.save() : null);

export function metadata(post, env = {}) {
  const { title, description } = youtubeParts(post.text?.youtube || '');
  const o = post.options || {};
  return {
    snippet: { title, description, categoryId: String(env.YT_CATEGORY_ID || '22') },
    status: { privacyStatus: o.youtube_privacy || 'public', selfDeclaredMadeForKids: false, ...(o.ai_generated ? { containsSyntheticMedia: true } : {}) },
  };
}

export function describe(post, name, url, env) {
  return { insert: metadata(post, env), upload: 'the approved video, sent from storage (no public address)' };
}

async function recent(env, now) {
  let list = [];
  try { list = JSON.parse((await env.KV.get('yt_publishes')) || '[]'); } catch {}
  return list.filter((x) => now - x < 864e5);
}

async function published(c, resource) {
  const { t, env } = c;
  const id = resource?.id;
  if (!id) return c.fail('YouTube took the upload but did not return the video id: check the channel before posting it again');
  await env.KV.put('yt_publishes', JSON.stringify([...(await recent(env, c.now)), c.now]));
  t.video_id = id; t.media_id = id; t.status = 'published'; t.published_at = c.stamp; t.phase = 'published';
  t.permalink = `https://www.youtube.com/shorts/${id}`;
  delete t.session_uri;
  c.log('published', { video_id: id, permalink: t.permalink, privacy: resource?.status?.privacyStatus || null });
}

export async function step(c) {
  const { api, post, t, env } = c;
  if (t.status !== 'pending') return;
  const vid = video(post);
  if ((await recent(env, c.now)).length >= YT_DAILY) return c.wait(`YouTube's ${YT_DAILY} uploads a day for this project are used up; trying again next run`);
  const head = await env.MEDIA.head(vid.key);
  if (!head) return c.fail('the video is gone from storage');
  const size = head.size;
  if (!t.session_uri) {
    t.session_uri = await api.startUpload(metadata(post, env), size);
    t.phase = 'session';
    c.log('upload session started');
    await save(c);
  }
  let offset = 0;
  if (t.phase === 'upload_sent') {
    let q;
    try { q = await api.queryUpload(t.session_uri, size); }
    catch (e) {
      if (e.status === 404 || e.status === 410) return c.fail('YouTube forgot the upload session: check the channel for the video before posting it again');
      throw e;
    }
    if (q.complete) return published(c, q.resource);
    offset = q.received;
    c.log(offset ? `YouTube has the first ${offset} bytes; sending the rest` : 'YouTube has no bytes yet; sending the video');
  }
  t.phase = 'upload_sent'; t.upload_sent_at = c.stamp;
  await save(c);                                           // before the bytes: a lost answer is checked, not resent blindly
  const obj = offset ? await env.MEDIA.get(vid.key, { range: { offset, length: size - offset } }) : await env.MEDIA.get(vid.key);
  if (!obj) return c.fail('the video is gone from storage');
  const resource = await api.putVideo(t.session_uri, obj.body, size, offset);
  return published(c, resource);
}
