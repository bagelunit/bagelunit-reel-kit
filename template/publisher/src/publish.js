// Publisher: posts an approved reel (or an image, carousel or story) at its scheduled time, on Instagram and, when
// the owner asks, the brand's Facebook Page and Threads.
//
// How a post travels:
//   1. scripts/schedule.mjs on the owner's computer checks the reel (Gate C fingerprints, autopilot.post for a live
//      post, captions, time) and uploads each file with PUT /admin/upload and its full SHA-256 in a header. R2 refuses a file whose
//      bytes do not match, so what is stored is byte for byte the approved file.
//   2. POST /admin/schedule records the post. Each file gets its own secret, unguessable address
//      (/media/<64 hex>.mp4 or .jpg) that exists only until the post is finished or cancelled: Meta fetches the files
//      from there.
//   3. The cron (every 5 minutes) moves each due post forward one step per platform (see instagram.js, facebook.js,
//      threads.js). When every platform is done, the files and their addresses are deleted.
//
// Safety:
//   - Dry run by default for each platform: a platform posts only when its PUBLISH_MODE_<PLATFORM> var is "live"
//     (or, with that var missing, when PUBLISH_MODE is "live"). The mode is saved with the post when it is scheduled,
//     and a platform posts only when BOTH that saved mode and the mode at the posting time are live: a post scheduled
//     in dry run stays a dry run (schedule a new one after going live), and switching back to dry run stops a post
//     that was scheduled live. In dry run a due post records what it would have sent and nothing goes to Meta.
//   - Each due post is held by one run at a time (a short lease in KV, lease:<id>), so two runs that overlap never
//     both work on it, and a cancel waits for (or reports) a run that is posting it. A step that changes something at
//     Meta saves the post right away, so a run cut off half way carries on from there next time (facebook.js).
//   - At most MAX_PER_RUN posts are handled per run, and each run has a budget of outside calls (graph.js).
//   - A container that is not ready in 30 minutes fails (60 for Facebook). Meta's publishing limits are checked first.
//   - A passing problem (rate limit, Meta down) is retried on the next runs; after 5 tries the platform fails.
//   - Every step is written to the post's history, which GET /admin shows (without the secret addresses).
import { instagramApi, facebookApi, threadsApi, makeBudget, OutOfBudget, GraphError, isUnified } from './graph.js';
import { youtubeApi, tiktokApi } from './video-apis.js';
import { LIMITS, checkText, checkLength, videoTargets } from './limits.js';
import { r2Seconds } from './mp4.js';
import * as instagram from './instagram.js';
import * as facebook from './facebook.js';
import * as threads from './threads.js';
import * as youtube from './youtube.js';
import * as tiktok from './tiktok.js';

export const PLATFORMS = ['instagram', 'facebook', 'threads', 'youtube', 'tiktok'];
const MODULES = { instagram, instagram_story: instagram, facebook, threads, youtube, tiktok };
const FINAL = new Set(['published', 'failed', 'dry_run', 'cancelled']);
const MAX_TRIES = 5;

const hex = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, '0')).join('');
const base = (name) => (name === 'instagram_story' ? 'instagram' : name);

// ---------- modes ----------
export function modeFor(env, platform) {
  const own = env[`PUBLISH_MODE_${base(platform).toUpperCase()}`];
  return (own ?? env.PUBLISH_MODE) === 'live' ? 'live' : 'dry_run';
}
export function configured(env, platform) {
  const p = base(platform);
  if (p === 'instagram') return Boolean(env.IG_USER_ID && env.IG_TOKEN);
  if (p === 'facebook') return Boolean(env.FB_PAGE_ID && env.FB_PAGE_TOKEN);
  if (p === 'threads') return Boolean(env.THREADS_USER_ID && env.THREADS_TOKEN);
  if (p === 'youtube') return Boolean(env.YT_CLIENT_ID && env.YT_CLIENT_SECRET && env.YT_REFRESH_TOKEN);
  if (p === 'tiktok') return Boolean(env.TIKTOK_CLIENT_KEY && env.TIKTOK_CLIENT_SECRET && env.TIKTOK_REFRESH_TOKEN);
  return false;
}
export function platformsView(env) {
  return Object.fromEntries(PLATFORMS.map((p) => [p, { configured: configured(env, p), mode: modeFor(env, p) }]));
}

// ---------- storage ----------
// Posts live under post:<id> (with their time and status in the key's metadata). A small index (posts:index) lists
// every post with its time and status, so the cron reads one key to find what is due instead of listing KV (the free
// plan allows 1,000 lists a day). KV has no transactions, so two writers can drop each other's row from the index:
// savePost checks its row is there after writing, and healIndex puts back any post:<id> the index lost (the first
// run of each hour, and every GET /admin).
const getPost = async (env, id) => { const r = await env.KV.get(`post:${id}`); return r ? JSON.parse(r) : null; };
async function readIndex(env) { try { return JSON.parse((await env.KV.get('posts:index')) || '[]'); } catch { return []; } }
const rowOf = (p) => ({ id: p.id, at: p.at, status: p.status });
// The post only (a step's intermediate save): one write.
export const putPost = (env, p) => env.KV.put(`post:${p.id}`, JSON.stringify(p), { metadata: rowOf(p) });
async function putRow(env, row) {
  const idx = await readIndex(env);                       // read again just before writing, so a parallel change is kept
  const i = idx.findIndex((r) => r.id === row.id);
  if (i >= 0) idx[i] = row; else idx.push(row);
  await env.KV.put('posts:index', JSON.stringify(idx));
}
async function savePost(env, p) {
  await putPost(env, p);
  const row = rowOf(p);
  await putRow(env, row);
  const back = (await readIndex(env)).find((r) => r.id === p.id);
  if (!back || back.status !== row.status) await putRow(env, row);   // lost to a parallel write: once more
}

// Put back every post the index lost. Lists post:<id> keys (one list per 1,000 posts) and reads only the missing ones.
export async function healIndex(env) {
  const idx = await readIndex(env);
  const have = new Set(idx.map((r) => r.id));
  const add = [];
  let cursor;
  do {
    const page = await env.KV.list({ prefix: 'post:', cursor });
    for (const k of page.keys) {
      const id = k.name.slice(5);
      if (have.has(id)) continue;
      const m = k.metadata;
      if (m?.at && m?.status) { add.push({ id, at: m.at, status: m.status }); continue; }
      const p = await getPost(env, id);
      if (p) add.push(rowOf(p));
    }
    cursor = page.list_complete === false ? page.cursor : undefined;
  } while (cursor);
  if (!add.length) return { added: 0 };
  const now = await readIndex(env);                       // merge with what is there now, never overwrite it
  const ids = new Set(now.map((r) => r.id));
  await env.KV.put('posts:index', JSON.stringify([...now, ...add.filter((r) => !ids.has(r.id))]));
  return { added: add.length, ids: add.map((r) => r.id) };
}

export async function listPosts(env) {
  await healIndex(env).catch(() => null);
  const idx = await readIndex(env);
  const rows = await Promise.all(idx.map((r) => getPost(env, r.id)));
  return rows.filter(Boolean).sort((a, b) => (a.at < b.at ? -1 : 1));
}

// ---------- the lease: one run per post at a time ----------
// KV has no locks, so this is a lease with a read-back: write our name, read it back, and go on only when it is ours.
// It ends when the run lets it go, or by itself after LEASE_MS (a run that died). Ten minutes is longer than any run.
export const LEASE_MS = 10 * 60 * 1000;
export async function takeLease(env, id, owner, now = Date.now()) {
  const k = `lease:${id}`;
  let cur = null; try { cur = JSON.parse((await env.KV.get(k)) || 'null'); } catch {}
  if (cur && cur.owner !== owner && cur.until > now) return false;
  await env.KV.put(k, JSON.stringify({ owner, until: now + LEASE_MS }), { expirationTtl: Math.ceil(LEASE_MS / 1000) });
  let back = null; try { back = JSON.parse((await env.KV.get(k)) || 'null'); } catch {}
  return back?.owner === owner;
}
export async function dropLease(env, id, owner) {
  const k = `lease:${id}`;
  let cur = null; try { cur = JSON.parse((await env.KV.get(k)) || 'null'); } catch {}
  if (cur?.owner === owner) await env.KV.delete(k);
}

// What GET /admin shows: never the secret media addresses.
export function publicPost(p) {
  const { media, base: _b, targets, ...rest } = p;
  const hidden = ({ session_uri: _s, upload_url: _u, ...t }) => t;      // YouTube's and TikTok's upload addresses are secrets
  return { ...rest, targets: Object.fromEntries(Object.entries(targets || {}).map(([k, t]) => [k, hidden(t)])), media: (media || []).map(({ token: _t, key: _k, ...m }) => m) };
}

// ---------- upload ----------
// PUT /admin/upload?name=<file>&type=video|image   header X-Content-SHA256: <64 hex>   body: the file
const TYPES = { video: { ext: /\.(mp4|mov)$/i, mime: 'video/mp4' }, image: { ext: /\.(jpe?g)$/i, mime: 'image/jpeg' } };
export async function handleUpload(request, env, url) {
  const sha = (request.headers.get('X-Content-SHA256') || '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(sha)) return { status: 400, body: { error: 'X-Content-SHA256 must be the full SHA-256 of the file' } };
  if (!request.body) return { status: 400, body: { error: 'no file' } };
  const type = url.searchParams.get('type') || 'video';
  if (!TYPES[type]) return { status: 400, body: { error: 'type must be video or image' } };
  const name = (url.searchParams.get('name') || (type === 'video' ? 'reel.mp4' : 'image.jpg')).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80);
  if (!TYPES[type].ext.test(name)) return { status: 400, body: { error: type === 'video' ? 'a video must be .mp4 or .mov' : 'Instagram takes JPEG images only (.jpg)' } };
  const key = `media/${Date.now()}-${hex(4)}-${name}`;
  let obj;
  try {
    obj = await env.MEDIA.put(key, request.body, { sha256: sha, httpMetadata: { contentType: TYPES[type].mime } });
  } catch (e) {
    return { status: 422, body: { error: `upload refused: the file does not match its SHA-256 (${e.message})` } };
  }
  // An upload that is never scheduled expires: its record goes after UPLOAD_TTL_S and the hourly sweep (sweepUploads)
  // deletes the file. Scheduling it writes the record again without an expiry, naming the post.
  await env.KV.put(`upload:${key}`, JSON.stringify({ sha256: sha, type, name, size: obj?.size ?? null, at: new Date().toISOString() }), { expirationTtl: UPLOAD_TTL_S });
  return { status: 200, body: { key, sha256: sha, type } };
}
export const UPLOAD_TTL_S = 24 * 3600;

// DELETE /admin/upload?key=<key>: schedule.mjs takes back its upload when scheduling is refused. Only a file that is
// not part of a post can be deleted this way.
export async function deleteUpload(env, key) {
  let rec = null; try { rec = JSON.parse((await env.KV.get(`upload:${key}`)) || 'null'); } catch {}
  if (!rec) return { status: 404, body: { error: 'no such upload' } };
  if (rec.post) return { status: 409, body: { error: `that file belongs to post ${rec.post}; cancel the post instead` } };
  await env.MEDIA.delete(key);
  await env.KV.delete(`upload:${key}`);
  return { status: 200, body: { deleted: key } };
}

// Delete stored files nothing needs: no upload record (it expired, or was never written) and no post still waiting
// to use them. A file younger than an hour is left alone (its record may still be on its way).
export async function sweepUploads(env, now = Date.now()) {
  let active = null;                                    // the files of posts not finished yet, read only when needed
  const needed = async () => {
    if (active) return active;
    active = new Set();
    for (const r of (await readIndex(env)).filter((x) => !FINAL.has(x.status) && x.status !== 'partial')) {
      const p = await getPost(env, r.id);
      if (p && !p.files_deleted) for (const m of p.media || []) active.add(m.key);
    }
    return active;
  };
  const deleted = [];
  let cursor;
  do {
    const page = await env.MEDIA.list({ prefix: 'media/', cursor });
    for (const o of page.objects || []) {
      const at = o.uploaded ? new Date(o.uploaded).getTime() : Number(o.key.slice(6).split('-')[0]) || now;
      if (now - at < 3600e3) continue;
      if (await env.KV.get(`upload:${o.key}`)) continue;
      if ((await needed()).has(o.key)) continue;
      await env.MEDIA.delete(o.key);
      deleted.push(o.key);
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return { deleted };
}

// ---------- schedule ----------
// POST /admin/schedule  JSON:
//   { kind: "reel" | "image" | "carousel" | "story",
//     media: [{ key, sha256, role: "video" | "cover" | "item" }],      (from /admin/upload)
//     platforms: ["instagram", "facebook", "threads", "youtube", "tiktok"],
//     text: { instagram, facebook, threads, youtube (title on the first line, then the description), tiktok },
//     at: "2026-11-10T09:00:00-05:00",
//     options: { share_to_feed, trial, collaborators, location_id, user_tags, audio_name, thumb_offset,
//                story, threads_mode: "video" | "text", link,
//                youtube_privacy: "public" | "unlisted" | "private", tiktok_mode: "draft" | "direct",
//                tiktok_privacy: "PUBLIC_TO_EVERYONE" | "MUTUAL_FOLLOW_FRIENDS" | "FOLLOWER_OF_CREATOR" | "SELF_ONLY",
//                ai_generated (YouTube's synthetic-media flag and TikTok's AI label) },
//     reel, note }
export async function schedulePost(env, data, origin, now = Date.now()) {
  const bad = (error) => ({ status: 400, body: { error } });
  const kind = data?.kind || 'reel';
  if (!['reel', 'image', 'carousel', 'story'].includes(kind)) return bad('kind must be reel, image, carousel or story');
  const at = new Date(data?.at);
  if (Number.isNaN(at.getTime()) || !/(Z|[+-]\d\d:?\d\d)$/.test(String(data?.at || ''))) return bad('at must be a date and time with a timezone, e.g. 2026-11-10T09:00:00-05:00');
  if (at.getTime() < now - 10 * 60 * 1000) return bad('that time is in the past');
  const o = { ...(data.options || {}) };

  // the files: every one uploaded here, with the fingerprint it was uploaded with
  const media = [];
  for (const m of Array.isArray(data.media) ? data.media : []) {
    const rec = m?.key ? JSON.parse((await env.KV.get(`upload:${m.key}`)) || 'null') : null;
    if (!rec || !(await env.MEDIA.head(m.key))) return bad(`upload the file first (unknown key ${m?.key || ''})`);
    if (rec.sha256 !== String(m.sha256 || '').toLowerCase()) return bad(`the fingerprint for ${rec.name} does not match the uploaded file`);
    media.push({ key: m.key, sha256: rec.sha256, type: rec.type, role: m.role || 'item', name: rec.name, token: hex(32) });
  }
  const videos = media.filter((m) => m.role === 'video'); const covers = media.filter((m) => m.role === 'cover'); const items = media.filter((m) => m.role === 'item');
  if (kind === 'reel') {
    if (videos.length !== 1 || videos[0].type !== 'video') return bad('a reel needs exactly one video');
    if (covers.length > 1 || covers.some((c) => c.type !== 'image') || items.length) return bad('a reel takes one video and at most one JPEG cover');
  } else if (kind === 'carousel') {
    if (items.length < LIMITS.instagram.carouselMin || items.length > LIMITS.instagram.carouselMax || videos.length || covers.length) return bad(`a carousel takes ${LIMITS.instagram.carouselMin} to ${LIMITS.instagram.carouselMax} items`);
  } else if (kind === 'image') {
    if (media.length !== 1 || media[0].type !== 'image') return bad('an image post takes exactly one JPEG');
  } else if (media.length !== 1) return bad('a story takes exactly one image or video');

  // the platforms
  const platforms = [...new Set(Array.isArray(data.platforms) && data.platforms.length ? data.platforms : ['instagram'])];
  for (const p of platforms) if (!PLATFORMS.includes(p)) return bad(`unknown platform ${p}`);
  if (kind !== 'reel' && platforms.some((p) => p !== 'instagram')) return bad('Facebook, Threads, YouTube and TikTok posting is for reels only');
  if (o.story && kind !== 'reel') return bad('--story shares a reel to the story; for a story on its own use kind "story"');
  if (o.story && !platforms.includes('instagram')) return bad('--story needs Instagram');
  const targets = [...platforms, ...(o.story ? ['instagram_story'] : [])];
  for (const p of targets) if (!configured(env, p)) return bad(`${base(p)} is not connected on this publisher (its id or token secret is missing)`);

  // options that only some setups or kinds allow
  if (o.trial && (kind !== 'reel' || !platforms.includes('instagram'))) return bad('a trial is for an Instagram reel only');
  if (o.collaborators?.length) {
    if (!Array.isArray(o.collaborators) || o.collaborators.length > LIMITS.instagram.collaborators) return bad(`up to ${LIMITS.instagram.collaborators} collaborators`);
    if (kind === 'story') return bad('stories take no collaborators');
    if (!isUnified(env)) return bad('collaborators need the Unified Login setup (API_SETUP = "unified")');
  }
  if (o.location_id && !/^\d+$/.test(String(o.location_id))) return bad('location must be the numeric id of a Facebook Page with a location');
  o.threads_mode = o.threads_mode === 'text' ? 'text' : 'video';
  if (platforms.includes('threads') && o.threads_mode === 'text' && !o.link && !platforms.includes('instagram')) return bad('a Threads text post links to the Instagram post: add instagram, give a link, or use video');

  if (platforms.includes('youtube')) {
    o.youtube_privacy = o.youtube_privacy || 'public';
    if (!['public', 'unlisted', 'private'].includes(o.youtube_privacy)) return bad('youtube_privacy must be public, unlisted or private');
  }
  if (platforms.includes('tiktok')) {
    o.tiktok_mode = o.tiktok_mode || (env.TIKTOK_POST_MODE === 'direct' ? 'direct' : 'draft');
    if (!['draft', 'direct'].includes(o.tiktok_mode)) return bad('tiktok_mode must be draft or direct');
    if (o.tiktok_mode === 'direct') {
      const audited = env.TIKTOK_AUDITED === 'yes';
      o.tiktok_privacy = o.tiktok_privacy || (audited ? 'PUBLIC_TO_EVERYONE' : 'SELF_ONLY');
      if (!['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY'].includes(o.tiktok_privacy)) return bad('tiktok_privacy must be PUBLIC_TO_EVERYONE, MUTUAL_FOLLOW_FRIENDS, FOLLOWER_OF_CREATOR or SELF_ONLY');
      if (o.tiktok_privacy !== 'SELF_ONLY' && !audited) return bad('TikTok has not audited this app, so a direct post can only be private (SELF_ONLY). Use tiktok_mode "draft" (the owner posts it from the TikTok inbox), post it private, or set TIKTOK_AUDITED = "yes" in wrangler.toml once TikTok has passed the audit');
    }
    if (o.thumb_offset !== undefined && !Number.isInteger(Number(o.thumb_offset))) return bad('thumb_offset must be a whole number of milliseconds');
  }

  // the video's length for every place it goes, and the cover's size (read from the stored copy, not taken on trust)
  const video = kind === 'story' ? media.find((m) => m.type === 'video') : videos[0];
  let videoSeconds = null;
  if (video) {
    videoSeconds = await r2Seconds(env.MEDIA, video.key);
    const lengthProblems = checkLength(videoSeconds, videoTargets({ kind, platforms, story: o.story, threadsMode: o.threads_mode }), video.name);
    if (lengthProblems.length) return bad(lengthProblems.join('; '));
  }
  for (const c of covers) {
    const h = await env.MEDIA.head(c.key);
    if (h && h.size > LIMITS.instagram.coverBytes) return bad(`the cover ${c.name} is over 8 MB; Instagram takes covers up to 8 MB`);
  }

  // the texts, each within its platform's limit
  const text = {};
  for (const p of platforms) {
    text[p] = String(data.text?.[p] ?? data.caption ?? '');
    const problems = checkText(p, text[p], { story: kind === 'story' });
    if (problems.length) return bad(problems.join('; '));
  }

  const modes = Object.fromEntries(targets.map((p) => [p, modeFor(env, p)]));
  const all = new Set(Object.values(modes));
  const post = {
    id: hex(6), kind, status: 'scheduled', at: at.toISOString(), at_given: String(data.at), base: origin,
    media, text, options: o, platforms, video_seconds: videoSeconds, reel: String(data.reel || ''), note: String(data.note || ''),
    targets: Object.fromEntries(targets.map((p) => [p, { status: 'pending', mode: modes[p], tries: 0 }])),
    created: new Date(now).toISOString(), history: [],
  };
  for (const m of media) {
    await env.KV.put(`media:${m.token}`, JSON.stringify({ key: m.key, type: m.type }));
    const rec = JSON.parse((await env.KV.get(`upload:${m.key}`)) || '{}');
    await env.KV.put(`upload:${m.key}`, JSON.stringify({ ...rec, post: post.id }));   // no expiry now: the post needs it
  }
  await savePost(env, post);
  return { status: 200, body: { id: post.id, at: post.at, status: post.status, mode: all.size === 1 ? [...all][0] : 'mixed', modes } };
}

// ---------- cancel and clean up ----------
async function cleanup(env, p) {
  for (const m of p.media || []) {
    await env.KV.delete(`media:${m.token}`);
    await env.KV.delete(`upload:${m.key}`);
    await env.MEDIA.delete(m.key);
  }
  p.files_deleted = true;
}

// A cancel takes the post's lease first, so it either wins (the cron skips the post, then finds it cancelled) or is
// told plainly that it is too late (a run is posting it right now, or already started it).
export async function cancelPost(env, id, now = Date.now()) {
  if (!(await getPost(env, id))) return { status: 404, body: { error: 'no such post' } };
  const owner = `cancel-${hex(4)}`;
  if (!(await takeLease(env, id, owner, now))) return { status: 409, body: { error: 'too late to cancel: the publisher is posting it right now. Check with status in a few minutes; if it went out, delete it in the app' } };
  try {
    const p = await getPost(env, id);
    const started = Object.values(p.targets || {}).some((t) => !['pending', 'dry_run'].includes(t.status) || t.video_id || t.container_id || t.publish_id || t.session_uri || t.children?.length);
    if (!['scheduled', 'dry_run'].includes(p.status) || started) return { status: 409, body: { error: `too late to cancel: the post is ${p.status}${started ? ' and was already sent to a platform' : ''}. If it went out, delete it in the app` } };
    if (!p.files_deleted) await cleanup(env, p);
    p.status = 'cancelled'; p.history.push({ at: new Date(now).toISOString(), event: 'cancelled' });
    for (const t of Object.values(p.targets)) if (t.status === 'pending') t.status = 'cancelled';
    await savePost(env, p);
    return { status: 200, body: { id, status: p.status, reel: p.reel } };
  } finally { await dropLease(env, id, owner); }
}

// ---------- serving files to Meta ----------
// GET /media/<token>.mp4|.jpg. Supports one byte range (video players and Meta's fetcher ask for ranges).
export async function serveMedia(env, tokenStr, request) {
  let rec = null;
  try { rec = JSON.parse((await env.KV.get(`media:${tokenStr}`)) || 'null'); } catch {}
  if (!rec) return new Response('not found', { status: 404 });
  const type = rec.type === 'image' ? 'image/jpeg' : 'video/mp4';
  const range = request.headers.get('Range');
  const m = range && /^bytes=(\d+)-(\d*)$/.exec(range);
  if (m) {
    const head = await env.MEDIA.head(rec.key);
    if (!head) return new Response('not found', { status: 404 });
    const start = Number(m[1]); const end = m[2] ? Math.min(Number(m[2]), head.size - 1) : head.size - 1;
    if (start > end) return new Response('bad range', { status: 416 });
    const obj = await env.MEDIA.get(rec.key, { range: { offset: start, length: end - start + 1 } });
    return new Response(obj.body, { status: 206, headers: { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${head.size}`, 'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes' } });
  }
  const obj = await env.MEDIA.get(rec.key);
  if (!obj) return new Response('not found', { status: 404 });
  const body = request.method === 'HEAD' ? null : obj.body;
  return new Response(body, { headers: { 'Content-Type': type, 'Content-Length': String(obj.size), 'Accept-Ranges': 'bytes' } });
}

// ---------- the cron ----------
// A target that is published but still looking for its link (link_pending, instagram.js and threads.js) keeps the
// post processing, so the next runs can find the link.
const settled = (t) => FINAL.has(t.status) && !t.link_pending;
function overall(p) {
  const s = Object.values(p.targets).map((t) => t.status);
  if (!Object.values(p.targets).every(settled)) return 'processing';
  if (s.every((x) => x === 'published')) return 'published';
  if (s.every((x) => x === 'dry_run')) return 'dry_run';
  if (s.includes('published')) return 'partial';
  return 'failed';
}

// `housekeeping` (the first run of each hour by default): put lost posts back in the index, then delete stored files
// nothing needs.
export async function runDue(env, fetchImpl = fetch, now = Date.now(), budget = makeBudget(), { housekeeping = new Date(now).getUTCMinutes() < 5 } = {}) {
  const max = Math.max(1, Number(env.MAX_PER_RUN || 5));
  if (housekeeping) {
    const healed = await healIndex(env).catch((e) => ({ error: e.message }));
    if (!healed.error) await sweepUploads(env, now).catch((e) => console.log('sweep error', e.message));
  }
  const idx = await readIndex(env);
  const due = idx.filter((r) => (r.status === 'scheduled' && Date.parse(r.at) <= now) || r.status === 'processing')
    .sort((a, b) => (a.at < b.at ? -1 : 1)).slice(0, max);
  const apis = { instagram: instagramApi(env, fetchImpl, budget), facebook: facebookApi(env, fetchImpl, budget), threads: threadsApi(env, fetchImpl, budget), youtube: youtubeApi(env, fetchImpl, budget), tiktok: tiktokApi(env, fetchImpl, budget) };
  const runId = `run-${hex(4)}`;
  const done = [];
  for (const row of due) {
    if (!(await takeLease(env, row.id, runId, now))) continue;          // another run (or a cancel) holds it
    let outOfBudget = false;
    try {
      const p = await getPost(env, row.id);                             // read after the lease: the latest state
      if (!p || !['scheduled', 'processing'].includes(p.status)) continue;
      if (p.status === 'scheduled' && Date.parse(p.at) > now) continue;
      const stamp = new Date(now).toISOString();
      if (p.status === 'scheduled') { p.status = 'processing'; p.history.push({ at: stamp, event: 'due' }); }
      // Instagram first, so a Threads text post can link to the Instagram post in the same run.
      for (const name of ['instagram', 'instagram_story', 'facebook', 'threads', 'youtube', 'tiktok']) {
        const t = p.targets[name];
        if (!t || settled(t)) continue;
        const log = (event, extra = {}) => { p.history.push({ at: stamp, platform: name, event, ...extra }); };
        if (!(t.mode === 'live' && modeFor(env, name) === 'live')) {
          const fake = (m) => `${p.base}/media/<secret>.${m.type === 'image' ? 'jpg' : 'mp4'}`;
          const why = t.mode !== 'live' ? 'it was scheduled in dry run; schedule a new post to post live' : 'the publisher is in dry run now';
          t.status = 'dry_run'; t.mode = 'dry_run';
          log(`due in dry run (${why}): nothing sent`, { would_send: MODULES[name].describe(p, name, fake, env) });
          continue;
        }
        const c = {
          env, post: p, t, name, now, stamp, api: apis[base(name)], log,
          url: (m) => `${p.base}/media/${m.token}.${m.type === 'image' ? 'jpg' : 'mp4'}`,
          fail: (why) => { t.status = 'failed'; t.error = why; log(`failed: ${why}`); },
          wait: (why) => { if (p.history.at(-1)?.event !== why) log(why); },
          save: () => putPost(env, p),                                  // right after a change at Meta
        };
        try {
          await MODULES[name].step(c);
        } catch (e) {
          if (e instanceof OutOfBudget) { log(e.message); outOfBudget = true; break; }
          t.tries = (t.tries || 0) + 1;
          const passing = e.passing || !(e instanceof GraphError);     // storage trouble is retried too
          if (passing && t.tries < MAX_TRIES) log(`passing problem, will retry (${t.tries}/${MAX_TRIES}): ${e.message}`);
          else c.fail(e.message);
        }
      }
      p.status = overall(p);
      if (['published', 'partial', 'failed', 'dry_run'].includes(p.status) && !p.files_deleted) {
        await cleanup(env, p);
        p.history.push({ at: stamp, event: 'files and their addresses deleted' });
      }
      await savePost(env, p);
      done.push({ id: p.id, status: p.status, targets: Object.fromEntries(Object.entries(p.targets).map(([k, v]) => [k, v.status])) });
    } catch (e) {
      console.log('post error', row.id, e.message);                     // this post carries on next run
    } finally {
      await dropLease(env, row.id, runId).catch(() => {});
    }
    if (outOfBudget) break;
  }
  return done;
}
