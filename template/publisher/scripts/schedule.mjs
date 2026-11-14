#!/usr/bin/env node
// Schedule an approved reel on this brand's publisher, or check and cancel what is scheduled. Run it from the brand
// folder. Node 22, no packages.
//
//   node publisher/scripts/schedule.mjs <reel folder> --at 2026-11-10T09:00:00-05:00
//        (or --from-plan: the date and time come from the reel's row in brand/plan.md, in brand.json -> posting.timezone)
//        [--platforms instagram,facebook,threads,youtube,tiktok] [--trial] [--threads text|video] [--collaborators a,b]
//        [--location <id>] [--story] [--thumb-offset <ms>] [--no-feed] [--preview | --yes]
//        [--youtube-privacy public|unlisted|private] [--tiktok-mode draft|direct] [--tiktok-privacy <level>] [--ai-generated]
//        --preview runs every check and shows the summary, then stops: nothing is uploaded or scheduled.
//   node publisher/scripts/schedule.mjs status
//   node publisher/scripts/schedule.mjs cancel <post id>
//
// Before anything is uploaded it checks, on this computer:
//   - brand/brand.json -> autopilot.post is true (the brand owner allows posting for this brand), unless every
//     platform the reel goes to is in dry run on the publisher: a dry run posts nothing, so it is the test the owner
//     runs before turning posting on (docs/auto-post.md);
//   - the reel has a Gate C record in approvals.md, and out/<file>.mp4 AND the approved cover (when Gate C recorded
//     one) still have the fingerprints recorded there; it refuses otherwise;
//   - the latest "Review:" line in approvals.md says "meets the bar" with 90/100 or more (the same bar as Gate C); it refuses
//     a reel with no review or a lower score, unless the owner's override (--skip-review at Gate C) is on record;
//   - every logo listed in the reel's reel.json "logos" is in brand/library/logos and is official or traced with approved rights
//     (house rule 9: another company's mark is posted only once the owner has approved it);
//   - the video's length fits every place it goes (Instagram reel 3 s to 15 min, story 3 to 60 s, Facebook Reel 3 to
//     90 s, Threads video up to 5 min, YouTube Short up to 3 min, TikTok 3 s to 10 min) and the cover is a JPEG of 8 MB at most;
//   - the caption is there and fits each platform (out/caption.txt; out/platforms/facebook.txt, threads.txt, youtube.txt
//     and tiktok.txt are used for those platforms when they exist; youtube.txt is the title on its first line, then the
//     description, and without it the caption's first line is the title);
//   - the time has a timezone and is in the future (with --from-plan: the plan row has a date and a time);
//   - the platforms are --platforms, else brand.json -> posting.platforms (the brand's fixed list), else EVERY platform
//     the publisher has connected: an approved reel goes everywhere the brand is connected, without being asked again
//     for each reel (a platform that is not connected is left out and named in the summary);
//   - the publisher has each platform connected, and they are all in the same mode (all dry run or all live).
// Then it shows a summary and needs the brand's handle typed (or --yes) before it uploads the video and cover (with
// their SHA-256, which the publisher checks byte for byte) and schedules. If the publisher refuses the post, the
// files it just uploaded are deleted again. Last, it adds one line under "## Posting" in the reel's approvals.md,
// which the kit's dashboard reads.
import fs from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { parseArgs, readJSON, read, sha256File, findBrand, brandSlug, atHandle, stamp, lastGateC, reviewProblem, appendUnder, connection, admin, Plain, isMain, CONFIG_DIR, planSlot, zonedIso } from './lib.mjs';
import { findReel, resolveReelArg } from './reels.mjs';
import { logoProblems } from '../../.claude/skills/logo-library/logos.mjs';
import { checkText, checkLength, videoTargets, LIMITS } from '../src/limits.js';
import { fileSeconds } from '../src/mp4.js';

const MAX_BYTES = 95 * 1024 * 1024;            // one request body: Cloudflare takes up to 100 MB
const MULTIPART_MAX_BYTES = 300 * 1024 * 1024; // a bigger video goes up in parts, up to Instagram's 300 MB reel limit
export const PART_BYTES = 64 * 1024 * 1024;    // every part but the last the same size (R2), well under one request body
const PLATFORMS = ['instagram', 'facebook', 'threads', 'youtube', 'tiktok'];

const list = (v) => (v && v !== true ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : []);

// All the checks that need no network. Returns { problems, ...what the upload needs }.
export function checkReel(reelDir, args = {}, now = Date.now()) {
  const problems = [];
  const reel = resolveReelArg(reelDir);                                // a folder, reels/<slug> or a slug; dated folders too
  const root = findBrand(reel);
  if (!root) return { problems: [`no brand/brand.json above ${reel}: run this inside the brand folder`] };
  const brand = readJSON(path.join(root, 'brand', 'brand.json'), {});
  const postAllowed = brand?.autopilot?.post === true;                 // checked against the mode in checkPublisher
  const handle = atHandle(brand.handle);
  if (!handle) problems.push('brand.json has no handle');

  // the approved files
  const gate = lastGateC(read(path.join(reel, 'approvals.md')));
  let video = null, sha = null, cover = null, coverSha = null;
  if (!gate) problems.push('no Gate C record in approvals.md: the final needs the approver\'s yes first (kit gate <reel> record --gate C)');
  else {
    const rp = reviewProblem(read(path.join(reel, 'approvals.md')));
    if (rp) problems.push(rp);
    for (const lp of logoProblems(root, readJSON(path.join(reel, 'reel.json'), {}))) problems.push(lp);
    video = path.join(reel, 'out', gate.file);
    if (!fs.existsSync(video)) problems.push(`the approved file out/${gate.file} is missing`);
    else {
      sha = sha256File(video);
      if (sha.slice(0, 12) !== gate.sha12) problems.push(`out/${gate.file} changed since Gate C (approved ${gate.sha12}, now ${sha.slice(0, 12)}): it needs Gate C again`);
      if (fs.statSync(video).size > MULTIPART_MAX_BYTES) problems.push(`out/${gate.file} is over 300 MB, Instagram's limit for a reel file; export a smaller file and approve it again`);
    }
    if (gate.cover) {
      cover = path.join(reel, 'out', gate.cover.file);
      if (!/\.jpe?g$/i.test(gate.cover.file)) problems.push(`the approved cover ${gate.cover.file} is not a JPEG (Instagram takes JPEG covers only)`);
      if (!fs.existsSync(cover)) problems.push(`the approved cover out/${gate.cover.file} is missing`);
      else {
        coverSha = sha256File(cover);
        if (coverSha.slice(0, 12) !== gate.cover.sha12) problems.push(`out/${gate.cover.file} changed since Gate C (approved ${gate.cover.sha12}, now ${coverSha.slice(0, 12)}): it needs Gate C again`);
        if (fs.statSync(cover).size > LIMITS.instagram.coverBytes) problems.push(`out/${gate.cover.file} is over 8 MB; Instagram takes covers up to 8 MB (kit cover writes one that fits)`);
      }
    }
  }

  // where and how
  const given = list(args.platforms).map((x) => x.toLowerCase()), brandList = Array.isArray(brand?.posting?.platforms) ? brand.posting.platforms.map((x) => String(x).trim().toLowerCase()).filter(Boolean) : [];
  const platformsFrom = given.length ? 'flag' : brandList.length ? 'brand' : 'all';
  // With nothing chosen the reel goes to every platform the publisher has connected (args._connected, read from the publisher by scheduleReel)
  const wanted = given.length ? given : brandList.length ? [...new Set(brandList)] : PLATFORMS;
  const platforms = platformsFrom === 'all' && Array.isArray(args._connected) ? wanted.filter((p) => args._connected.includes(p)) : wanted;
  const skipped = platformsFrom === 'all' && Array.isArray(args._connected) ? wanted.filter((p) => !args._connected.includes(p)) : [];
  if (platformsFrom === 'all' && Array.isArray(args._connected) && !platforms.length) problems.push('the publisher has no platform connected yet (see publisher/README.md)');
  for (const p of platforms) if (!PLATFORMS.includes(p)) problems.push(`unknown platform "${p}"${platformsFrom === 'brand' ? ' in brand.json -> posting.platforms' : ''} (use ${PLATFORMS.join(', ')})`);
  const threadsMode = args.threads === 'text' ? 'text' : 'video';
  if (args.threads && !['text', 'video'].includes(args.threads)) problems.push('--threads takes text or video');
  if (platforms.includes('threads') && threadsMode === 'text' && !platforms.includes('instagram')) problems.push('a Threads text post links to the Instagram post: add instagram to --platforms or use --threads video');
  if (args.trial && !platforms.includes('instagram')) problems.push('--trial is for Instagram');
  if (args.story && !platforms.includes('instagram')) problems.push('--story is for Instagram');
  const collaborators = list(args.collaborators).map((c) => c.replace(/^@/, ''));
  if (collaborators.length > LIMITS.instagram.collaborators) problems.push(`up to ${LIMITS.instagram.collaborators} collaborators`);
  if (args.location && !/^\d+$/.test(String(args.location))) problems.push('--location takes the numeric id of a Facebook Page that has a location');
  if (args['thumb-offset'] !== undefined && !/^\d+$/.test(String(args['thumb-offset']))) problems.push('--thumb-offset takes milliseconds, e.g. 1500');
  if (args['youtube-privacy'] !== undefined && !['public', 'unlisted', 'private'].includes(args['youtube-privacy'])) problems.push('--youtube-privacy takes public, unlisted or private');
  if (args['tiktok-mode'] !== undefined && !['draft', 'direct'].includes(args['tiktok-mode'])) problems.push('--tiktok-mode takes draft or direct');
  if (args['tiktok-privacy'] !== undefined && !['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY'].includes(args['tiktok-privacy'])) problems.push('--tiktok-privacy takes PUBLIC_TO_EVERYONE, MUTUAL_FOLLOW_FRIENDS, FOLLOWER_OF_CREATOR or SELF_ONLY');

  // the video's length, for every place it goes
  let seconds = null;
  if (video && fs.existsSync(video)) {
    seconds = fileSeconds(video, fs);
    const targets = videoTargets({ kind: 'reel', platforms: platforms.filter((p) => PLATFORMS.includes(p)), story: args.story === true, threadsMode });
    problems.push(...checkLength(seconds, targets, `out/${gate.file}`).map((m) => (/Facebook/.test(m) ? `${m} (leave facebook out of --platforms, or cut a shorter version and approve it)` : m)));
  }

  // the texts
  const caption = read(path.join(reel, 'out', 'caption.txt')).trim();
  const own = (p) => read(path.join(reel, 'out', 'platforms', `${p}.txt`)).trim();
  const text = {};
  if (!caption) problems.push('out/caption.txt is missing or empty');
  for (const p of platforms.filter((x) => PLATFORMS.includes(x))) {
    text[p] = p === 'instagram' ? caption : (own(p) || caption);
    if (caption || p !== 'instagram') problems.push(...checkText(p, text[p]).map((m) => (p !== 'instagram' && !own(p) ? `${m} (it uses out/caption.txt; write out/platforms/${p}.txt for ${p}, or /reel-repurpose)` : m)));
  }

  // the time
  let atStr = typeof args.at === 'string' ? args.at.trim() : '';
  let fromPlan = null;
  if (args['from-plan']) {
    const tz = brand?.posting?.timezone;
    if (atStr) problems.push('give --at or --from-plan, not both');
    else if (!tz) problems.push('brand.json -> posting.timezone is not set (for example America/Toronto): --from-plan needs it');
    else {
      const slot = planSlot(root, reel);
      if (slot.problem) problems.push(slot.problem);
      else {
        const iso = zonedIso(slot.date, slot.time, tz);
        if (!iso) problems.push(`posting.timezone "${tz}" or the plan time ${slot.date} ${slot.time} could not be read`);
        else { atStr = iso; fromPlan = { date: slot.date, time: slot.time, tz }; }
      }
    }
  }
  const at = new Date(atStr);
  const badAt = !atStr || Number.isNaN(at.getTime()) || !/(Z|[+-]\d\d:?\d\d)$/.test(atStr);
  if (badAt) { if (!args['from-plan']) problems.push('--at needs a date, time and timezone, e.g. 2026-11-10T09:00:00-05:00 (or --from-plan to use the reel\'s row in brand/plan.md)'); }   // with --from-plan the reason is already listed
  else if (at.getTime() <= now) problems.push(fromPlan ? `the plan time ${fromPlan.date} ${fromPlan.time} has already passed: move the row in brand/plan.md, or give --at` : '--at is in the past');

  return {
    problems: [...new Set(problems)], reel, root, brand, slug: brandSlug(root, brand), handle, postAllowed, gate, video, sha, cover, coverSha, seconds,
    text, platforms, platformsFrom, skipped, fromPlan, at, atStr,
    options: {
      trial: args.trial === true, story: args.story === true, share_to_feed: args['no-feed'] !== true, threads_mode: threadsMode,
      ...(collaborators.length ? { collaborators } : {}), ...(args.location ? { location_id: String(args.location) } : {}),
      ...(args['thumb-offset'] !== undefined ? { thumb_offset: Number(args['thumb-offset']) } : {}),
      ...(platforms.includes('youtube') && args['youtube-privacy'] ? { youtube_privacy: args['youtube-privacy'] } : {}),
      ...(platforms.includes('tiktok') && args['tiktok-mode'] ? { tiktok_mode: args['tiktok-mode'] } : {}),
      ...(platforms.includes('tiktok') && args['tiktok-privacy'] ? { tiktok_privacy: args['tiktok-privacy'] } : {}),
      ...(args['ai-generated'] === true ? { ai_generated: true } : {}),
    },
  };
}

// The checks that need the publisher's answer (GET /admin).
export function checkPublisher(info, c) {
  const problems = [];
  const targets = [...c.platforms];
  for (const p of targets) if (!info.platforms?.[p]?.configured) problems.push(`${p} is not connected on the publisher yet (its id and token secrets are missing; see publisher/README.md)`);
  const modes = [...new Set(targets.map((p) => info.platforms?.[p]?.mode || 'dry_run'))];
  if (modes.length > 1) problems.push(`the platforms are in different modes (${targets.map((p) => `${p} ${info.platforms?.[p]?.mode}`).join(', ')}): schedule them separately with --platforms, or switch them to the same mode`);
  if (c.options.collaborators?.length && info.api_setup !== 'unified') problems.push('collaborators need the Unified Login setup (API_SETUP = "unified" in publisher/wrangler.toml)');
  const mode = modes.length === 1 ? modes[0] : 'mixed';
  if (mode !== 'dry_run' && c.postAllowed !== true) problems.push('brand.json -> autopilot.post is not true: the brand owner has not allowed posting for this brand (a dry run can be scheduled without it; going live needs it)');
  return { problems, mode };
}

// What the TikTok post will be, in words: a draft the owner posts from the app, or a direct post and who can see it.
export function tiktokLine(c, info) {
  const direct = (c.options.tiktok_mode || info?.tiktok_post_mode || 'draft') === 'direct';
  if (!direct) return 'a draft in the TikTok inbox: you tap the notification in the TikTok app to post it';
  const audited = info?.tiktok_audited === true;
  return `a direct post, ${c.options.tiktok_privacy || (audited ? 'PUBLIC_TO_EVERYONE' : 'SELF_ONLY (private until TikTok has audited the app)')}`;
}

export function summary(c, info, mode) {
  const tz = c.brand.posting?.timezone;
  let local = c.at.toString();
  try { if (tz) local = `${c.at.toLocaleString('en-CA', { timeZone: tz, dateStyle: 'full', timeStyle: 'short' })} (${tz})`; } catch {}
  const lines = [
    `About to schedule on ${c.handle} (${c.slug}):`,
    `  reel        ${path.basename(c.reel)}`,
    `  video       out/${c.gate.file}  sha256 ${c.sha.slice(0, 12)} (matches Gate C)${c.seconds != null ? `, ${Math.round(c.seconds * 10) / 10} seconds` : ''}`,
    `  cover       ${c.cover ? `out/${c.gate.cover.file}  sha256 ${c.coverSha.slice(0, 12)} (matches Gate C)${c.platforms.includes('facebook') ? ', also set as the Facebook cover' : ''}` : `none approved: Instagram uses the frame at ${c.options.thumb_offset || 0} ms${c.platforms.includes('facebook') ? ', Facebook picks its own' : ''}`}`,
    `  time        ${local}  (${c.at.toISOString()})${c.fromPlan ? `  [from brand/plan.md: ${c.fromPlan.date} ${c.fromPlan.time}]` : ''}`,
    `  platforms   ${c.platforms.join(', ')}${c.platformsFrom === 'brand' ? '  [from brand.json -> posting.platforms]' : c.platformsFrom === 'all' ? '  [every platform the publisher has connected]' : ''}${c.options.story ? ', and the reel as an Instagram story' : ''}`,
    `  mode        ${mode === 'live' ? 'LIVE: this really posts' : 'dry run: nothing is posted, the publisher records what it would send (it stays a dry run even if the publisher goes live before then)'}`,
  ];
  if (c.options.trial) lines.push('  trial       yes: Instagram shows it to non-followers first; you share it to followers in the app');
  if (c.options.trial && c.platforms.some((p) => p !== 'instagram')) lines.push('              (Facebook and Threads posts are shown to followers as usual)');
  if (c.options.collaborators) lines.push(`  collab      ${c.options.collaborators.map((x) => '@' + x).join(', ')}`);
  if (c.options.location_id) lines.push(`  location    ${c.options.location_id}`);
  if (c.skipped?.length) lines.push(`  not connected  ${c.skipped.join(', ')} (left out: connect them in docs/connect.md to post there too)`);
  if (c.platforms.includes('youtube')) lines.push(`  youtube     a Short, ${c.options.youtube_privacy || 'public'}; title: ${String(c.text.youtube || '').split('\n')[0].slice(0, 70)}`);
  if (c.platforms.includes('tiktok')) lines.push(`  tiktok      ${tiktokLine(c, info)}`);
  if (c.platforms.includes('threads')) lines.push(`  threads     ${c.options.threads_mode === 'text' ? 'a text post with the Instagram link' : 'the video'}`);
  for (const p of c.platforms) lines.push(`  ${(p + ' text').padEnd(11)} ${c.text[p].split('\n')[0].slice(0, 90)}`);
  return lines.join('\n');
}

export function postingLine(c, id, mode, when = new Date()) {
  const plat = [...c.platforms, ...(c.options.story ? ['instagram story'] : [])].join(',');
  return `- ${stamp(when)} Scheduled on ${c.handle} for ${c.atStr}: post ${id}, file ${c.gate.file} sha256 ${c.sha.slice(0, 12)}, platforms ${plat}, publisher in ${mode} mode${c.options.trial ? ', trial' : ''}`;
}

async function askHandle(handle) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try { return (await rl.question(`Type the handle ${handle} to confirm: `)).trim(); } finally { rl.close(); }
}

// The whole flow. `confirm(handle)` returns what the person typed; tests pass their own, plus fetchImpl and configDir.
// A video over 95 MB (a full episode) goes up in parts of PART_BYTES (src/publish.js, "big files"): start, each part
// (read from disk one at a time, never the whole file in memory; a part that fails is sent again up to twice), then
// complete, where the publisher reads the joined file back and refuses it unless its size and SHA-256 match. If anything
// fails, the unfinished upload is given up so its parts are freed.
export async function uploadInParts(conn, file, sha, size, { fetchImpl = fetch, log = console.log, partBytes = PART_BYTES } = {}) {
  const s = await admin(conn, 'POST', `/admin/upload/multipart?type=video&name=${encodeURIComponent(path.basename(file))}`, {
    headers: { 'X-Content-SHA256': sha, 'X-Content-Length': String(size) }, fetchImpl,
  });
  const fd = fs.openSync(file, 'r');
  try {
    const parts = [];
    const count = Math.ceil(size / partBytes);
    for (let n = 1, off = 0; off < size; n++, off += partBytes) {
      const buf = Buffer.alloc(Math.min(partBytes, size - off));
      fs.readSync(fd, buf, 0, buf.length, off);
      let r, tries = 0;
      for (;;) {
        try { r = await admin(conn, 'PUT', `/admin/upload/multipart/part?upload=${s.upload}&part=${n}`, { body: buf, headers: { 'Content-Type': 'application/octet-stream' }, fetchImpl }); break; }
        catch (e) { if (++tries > 2) throw e; }
      }
      parts.push({ partNumber: r.partNumber, etag: r.etag });
      log(`  uploaded part ${n} of ${count}`);
    }
    return await admin(conn, 'POST', `/admin/upload/multipart/complete?upload=${s.upload}`, {
      body: JSON.stringify({ parts }), headers: { 'Content-Type': 'application/json' }, fetchImpl,
    });
  } catch (e) {
    await admin(conn, 'DELETE', `/admin/upload/multipart?upload=${s.upload}`, { fetchImpl }).catch(() => null);
    throw e;
  } finally { fs.closeSync(fd); }
}

export async function scheduleReel(reelDir, args, { fetchImpl = fetch, configDir = CONFIG_DIR, confirm = askHandle, log = console.log, now = Date.now() } = {}) {
  let c = checkReel(reelDir, args, now);
  const implicit = !list(args.platforms).length && !(Array.isArray(c.brand?.posting?.platforms) && c.brand.posting.platforms.length);
  const conn = c.slug ? connection(c.slug, configDir) : null;
  let info = null;
  if (implicit && conn) {                                              // nothing chosen: every connected platform, so ask the publisher first
    info = await admin(conn, 'GET', '/admin', { fetchImpl });
    c = checkReel(reelDir, { ...args, _connected: Object.entries(info.platforms || {}).filter(([, v]) => v.configured).map(([k]) => k) }, now);
  }
  if (c.problems.length) throw new Plain('Not scheduled:\n- ' + c.problems.join('\n- '));
  info = info || await admin(conn, 'GET', '/admin', { fetchImpl });
  const pc = checkPublisher(info, c);
  if (pc.problems.length) throw new Plain('Not scheduled:\n- ' + pc.problems.join('\n- '));
  log(summary(c, info, pc.mode));
  if (args.preview === true) { log('Preview only: nothing was uploaded or scheduled. Run the same command with --yes once the owner says yes to this reel and time.'); return { preview: true, mode: pc.mode }; }
  if (args.yes !== true) {
    const typed = String(await confirm(c.handle)).trim();
    if (typed.replace(/^@/, '').toLowerCase() !== c.handle.replace(/^@/, '').toLowerCase()) throw new Plain('Not confirmed. Nothing uploaded.');
  }
  const media = [];
  const up = async (file, sha, type, role) => {
    const size = fs.statSync(file).size;
    const r = type === 'video' && size > MAX_BYTES
      ? await uploadInParts(conn, file, sha, size, { fetchImpl, log })
      : await admin(conn, 'PUT', `/admin/upload?type=${type}&name=${encodeURIComponent(path.basename(file))}`, {
        body: fs.readFileSync(file), headers: { 'X-Content-SHA256': sha, 'Content-Type': type === 'video' ? 'video/mp4' : 'image/jpeg' }, fetchImpl,
      });
    media.push({ key: r.key, sha256: sha, role });
  };
  let s;
  try {
    await up(c.video, c.sha, 'video', 'video');
    if (c.cover) await up(c.cover, c.coverSha, 'image', 'cover');
    s = await admin(conn, 'POST', '/admin/schedule', {
      body: JSON.stringify({ kind: 'reel', media, platforms: c.platforms, text: c.text, at: c.atStr, options: c.options, reel: path.basename(c.reel) }),
      headers: { 'Content-Type': 'application/json' }, fetchImpl,
    });
  } catch (e) {
    // not scheduled: take back what was uploaded (the publisher would delete it within a day anyway)
    for (const m of media) await admin(conn, 'DELETE', `/admin/upload?key=${encodeURIComponent(m.key)}`, { fetchImpl }).catch(() => null);
    throw e instanceof Plain ? new Plain(`Not scheduled (the uploaded files were deleted again): ${e.message}`) : e;
  }
  const mode = s.mode === 'live' ? 'live' : 'dry_run';
  const line = postingLine(c, s.id, mode, new Date(now));
  appendUnder(path.join(c.reel, 'approvals.md'), 'Posting', line);
  log(`Scheduled: post ${s.id} (${mode === 'live' ? 'live' : 'dry run'}). Recorded in approvals.md. Check it with: node publisher/scripts/schedule.mjs status`);
  if (mode !== 'live') log('A post scheduled in dry run stays a dry run, even if the publisher goes live before its time: after going live, schedule a new post.');
  return { id: s.id, mode, line };
}

export async function status({ root, fetchImpl = fetch, configDir = CONFIG_DIR, log = console.log } = {}) {
  const conn = connection(brandSlug(root), configDir);
  const a = await admin(conn, 'GET', '/admin', { fetchImpl });
  log(`Publisher for ${a.brand || brandSlug(root)} (${a.api_setup} login). Comment replies: ${a.mode}.`);
  for (const [p, v] of Object.entries(a.platforms || {})) log(`  ${p.padEnd(10)} ${v.configured ? 'connected' : 'not connected'}, ${v.mode === 'live' ? 'LIVE' : 'dry run'}`);
  if (!(a.posts || []).length) log('No posts yet.');
  for (const p of a.posts || []) {
    const each = Object.entries(p.targets || {}).map(([k, t]) => `${k} ${t.status}${t.permalink ? ` ${t.permalink}` : ''}${t.error ? ` (${t.error})` : ''}`).join('; ');
    log(`${p.id}  ${p.status.padEnd(10)}  ${p.at}  ${p.reel || p.kind}  ${each}`);
  }
  // comment replies: the rules, and the latest replies sent or (in dry run, or for an untested rule) only written down
  if ((a.rules || []).length || a.rules_error) {
    log(`Comment rules: ${a.rules_error ? `could not be read (${a.rules_error})` : a.rules.map((r) => `${r.name} (${(r.keywords || []).join(', ')})${r.require_follow ? ', asks for a follow first' : ''}${r.tested ? '' : ', not tested yet'}`).join('; ')}`);
    const inbox = await admin(conn, 'GET', '/admin/inbox', { fetchImpl });
    const R = inbox.replies || {};
    const rows = [...(R.dry_run || []).map((x) => ['would have sent', x]), ...(R.sent || []).map((x) => ['sent', x]), ...(R.left_for_a_person || []).map((x) => ['left for you', x]), ...(R.errors || []).map((x) => ['error', x])]
      .sort((x, y) => (x[1].at < y[1].at ? 1 : -1)).slice(0, 10);
    for (const [what, x] of rows) log(`  ${String(x.at || '').slice(0, 16).replace('T', ' ')}  @${x.username || x.from_id || '?'}: "${String(x.text || '').slice(0, 60)}"  ${what}${x.rule ? ` (rule ${x.rule})` : ''}${x.why && what !== 'sent' ? `, ${x.why}` : ''}${what === 'would have sent' ? `: reply "${String(x.would_reply || '').slice(0, 60)}", DM "${String(x.would_dm || '').slice(0, 60)}"` : ''}`);
    if (!rows.length) log('  No comment has matched a rule yet.');
  }
  return a;
}

export async function cancel(id, { root, fetchImpl = fetch, configDir = CONFIG_DIR, log = console.log, now = Date.now() } = {}) {
  if (!/^[0-9a-f]{12}$/.test(String(id || ''))) throw new Plain('cancel needs the post id (12 letters and digits, from status)');
  const conn = connection(brandSlug(root), configDir);
  const r = await admin(conn, 'POST', `/admin/cancel/${id}`, { fetchImpl });
  const reelDir = r.reel ? findReel(root, r.reel) : null;
  const ap = reelDir ? path.join(reelDir, 'approvals.md') : null;
  if (ap && fs.existsSync(ap)) appendUnder(ap, 'Posting', `- ${stamp(new Date(now))} Cancelled post ${id} on the publisher`);
  log(`Post ${id}: ${r.status}.${ap && fs.existsSync(ap) ? ' Recorded in approvals.md.' : ''}`);
  return r;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [cmd, arg] = args._;
  if (!cmd) throw new Plain('give a reel folder (reels/<slug>), or status, or cancel <post id>');
  if (cmd === 'status' || cmd === 'cancel') {
    const root = findBrand(process.cwd());
    if (!root) throw new Plain('run this inside the brand folder (where brand/brand.json is)');
    return cmd === 'status' ? status({ root }) : cancel(arg, { root });
  }
  return scheduleReel(cmd, args);
}

if (isMain(import.meta.url)) {
  main().catch((e) => { console.error(e instanceof Plain ? e.message : `Unexpected error: ${e?.message || e}`); process.exit(1); });
}
