#!/usr/bin/env node
// Approve and schedule an Instagram carousel that belongs to a reel (for example a facts carousel per episode). Run it
// from the brand folder. Node 22, no packages.
//
//   node publisher/scripts/carousel.mjs files <reel folder>
//        lists the carousel's items in order and the checks below, changes nothing
//   node publisher/scripts/carousel.mjs approve <reel folder>
//        after the approver said yes to these exact slides and caption: records them (with one fingerprint over every
//        item and the caption) under "## Carousel" in the reel's approvals.md
//   node publisher/scripts/carousel.mjs schedule <reel folder> --at 2026-11-14T12:00:00-05:00
//        [--collaborators a,b] [--location <id>] [--preview | --yes]
//
// The carousel lives in the reel's out/carousel/: the items (JPEG images, or MP4 videos), posted in file-name order
// (01.jpg, 02.jpg, ...), and caption.txt. Before anything is uploaded, schedule checks on this computer:
//   - 2 to 20 items, JPEG or MP4 only (Instagram's API takes no PNG), each image 8 MB at most and between 4:5 and 1.91:1
//     (Instagram crops every slide to the first one's shape, so they should all match), each video 3 to 60 s;
//   - the caption is there and fits Instagram;
//   - the latest "Carousel approved" line in approvals.md has the fingerprint of the files as they are now (a slide or
//     the caption changed since: approve again);
//   - brand.json -> autopilot.post is true, unless Instagram is in dry run on the publisher (a dry run posts nothing);
//   - the time has a timezone and is in the future, and Instagram is connected on the publisher.
// Then it shows a summary and needs the brand's handle typed (or --yes) before it uploads the items (with their SHA-256,
// which the publisher checks byte for byte) and schedules. If the publisher refuses, the uploaded files are deleted
// again. Last, it adds one line under "## Carousel" in approvals.md. Carousels are Instagram only (the publisher posts
// Facebook, Threads, YouTube and TikTok for reels only), and they never change the reel's own "## Posting" record.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { parseArgs, readJSON, read, sha256File, findBrand, brandSlug, atHandle, stamp, appendUnder, connection, admin, Plain, isMain, CONFIG_DIR } from './lib.mjs';
import { resolveReelArg } from './reels.mjs';
import { checkPublisher } from './schedule.mjs';
import { checkText, LIMITS } from '../src/limits.js';
import { fileSeconds } from '../src/mp4.js';

const ITEM_MAX_BYTES = 95 * 1024 * 1024;   // one request body (Cloudflare takes up to 100 MB)
const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const RATIO = [0.8, 1.91];                 // width / height Instagram accepts for a feed image: 4:5 to 1.91:1
const VIDEO_SECONDS = [3, 60];             // a video inside a carousel
const list = (v) => (v && v !== true ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : []);

// width and height of a JPEG from its first frame header (SOF0 to SOF15, except DHT, JPG and DAC), or null
export function jpegSize(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  return null;
}

// The carousel's files, in posting order, with their fingerprints, and one fingerprint over all of them and the caption.
export function carouselFiles(reelDir) {
  const reel = resolveReelArg(reelDir);
  const dir = path.join(reel, 'out', 'carousel');
  const names = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => !f.startsWith('.') && f !== 'caption.txt' && fs.statSync(path.join(dir, f)).isFile()).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })) : [];
  const items = names.map((name) => ({ name, file: path.join(dir, name), sha256: sha256File(path.join(dir, name)), type: /\.mp4$/i.test(name) ? 'video' : 'image' }));
  const caption = read(path.join(dir, 'caption.txt')).trim();
  const fingerprint = createHash('sha256').update(items.map((it) => `${it.name}:${it.sha256}`).join('\n') + '\ncaption:' + caption).digest('hex').slice(0, 12);
  return { reel, dir, items, caption, fingerprint };
}

// The latest "Carousel approved" line in approvals.md: { fingerprint, count } or null
export function lastCarouselApproval(text) {
  const all = [...String(text || '').matchAll(/^\s*-\s.*Carousel approved\b.*?(\d+) items?.*?fingerprint\s+([0-9a-f]{12})/gim)];
  const m = all.at(-1);
  return m ? { count: Number(m[1]), fingerprint: m[2] } : null;
}

// The checks on the files alone (no approval, no time): a list of problems.
export function itemProblems(f) {
  const problems = [];
  const n = f.items.length;
  if (!fs.existsSync(f.dir)) return [`no out/carousel/ folder in ${path.basename(f.reel)}: put the slides there (01.jpg, 02.jpg, ...) with caption.txt`];
  if (n < LIMITS.instagram.carouselMin || n > LIMITS.instagram.carouselMax) problems.push(`a carousel takes ${LIMITS.instagram.carouselMin} to ${LIMITS.instagram.carouselMax} items (out/carousel/ has ${n})`);
  let first = null;
  for (const it of f.items) {
    const size = fs.statSync(it.file).size;
    if (!/\.(jpe?g|mp4)$/i.test(it.name)) { problems.push(`${it.name}: Instagram's API takes JPEG images and MP4 videos only (export it as .jpg)`); continue; }
    if (size > ITEM_MAX_BYTES) problems.push(`${it.name} is over 95 MB, more than one upload takes`);
    if (it.type === 'image') {
      if (size > IMAGE_MAX_BYTES) problems.push(`${it.name} is over 8 MB; Instagram takes images up to 8 MB`);
      const s = jpegSize(fs.readFileSync(it.file));
      if (!s) { problems.push(`${it.name} is not a readable JPEG`); continue; }
      const r = s.width / s.height;
      if (r < RATIO[0] - 0.005 || r > RATIO[1] + 0.005) problems.push(`${it.name} is ${s.width}x${s.height}; Instagram takes 4:5 (1080x1350) to 1.91:1`);
      if (first && Math.abs(first - r) > 0.01) problems.push(`${it.name} is a different shape from the first slide; Instagram crops every slide to the first one's shape`);
      first = first ?? r;
    } else {
      const sec = fileSeconds(it.file, fs);
      if (sec == null) problems.push(`${it.name}: its length could not be read`);
      else if (sec < VIDEO_SECONDS[0] || sec > VIDEO_SECONDS[1]) problems.push(`${it.name} is ${Math.round(sec * 10) / 10} s; a video in a carousel is ${VIDEO_SECONDS[0]} to ${VIDEO_SECONDS[1]} s`);
    }
  }
  if (!f.caption) problems.push('out/carousel/caption.txt is missing or empty');
  else problems.push(...checkText('instagram', f.caption));
  return problems;
}

export function approveCarousel(reelDir, { now = Date.now(), log = console.log } = {}) {
  const f = carouselFiles(reelDir);
  const problems = itemProblems(f);
  if (problems.length) throw new Plain('Not recorded, fix these first:\n- ' + problems.join('\n- '));
  const line = `- ${stamp(new Date(now))} Carousel approved: ${f.items.length} items (${f.items.map((it) => it.name).join(', ')}), fingerprint ${f.fingerprint}`;
  appendUnder(path.join(f.reel, 'approvals.md'), 'Carousel', line);
  log(`Recorded in approvals.md: ${line.slice(2)}`);
  return { line, fingerprint: f.fingerprint };
}

export function checkCarousel(reelDir, args = {}, now = Date.now()) {
  const f = carouselFiles(reelDir);
  const root = findBrand(f.reel);
  if (!root) return { problems: [`no brand/brand.json above ${f.reel}: run this inside the brand folder`] };
  const brand = readJSON(path.join(root, 'brand', 'brand.json'), {});
  const handle = atHandle(brand.handle);
  const problems = [...itemProblems(f)];
  if (!handle) problems.push('brand.json has no handle');
  const ok = lastCarouselApproval(read(path.join(f.reel, 'approvals.md')));
  if (!ok) problems.push('no "Carousel approved" line in approvals.md: show the approver the slides and caption, then  node publisher/scripts/carousel.mjs approve <reel>');
  else if (ok.fingerprint !== f.fingerprint) problems.push(`the carousel changed since it was approved (approved ${ok.fingerprint}, now ${f.fingerprint}): approve it again`);
  const collaborators = list(args.collaborators).map((c) => c.replace(/^@/, ''));
  if (collaborators.length > LIMITS.instagram.collaborators) problems.push(`up to ${LIMITS.instagram.collaborators} collaborators`);
  if (args.location && !/^\d+$/.test(String(args.location))) problems.push('--location takes the numeric id of a Facebook Page that has a location');
  const atStr = typeof args.at === 'string' ? args.at.trim() : '';
  const at = new Date(atStr);
  if (!atStr || Number.isNaN(at.getTime()) || !/(Z|[+-]\d\d:?\d\d)$/.test(atStr)) problems.push('--at needs a date, time and timezone, e.g. 2026-11-14T12:00:00-05:00');
  else if (at.getTime() <= now) problems.push('--at is in the past');
  return {
    problems: [...new Set(problems)], ...f, root, brand, slug: brandSlug(root, brand), handle, postAllowed: brand?.autopilot?.post === true,
    platforms: ['instagram'], at, atStr,
    options: { ...(collaborators.length ? { collaborators } : {}), ...(args.location ? { location_id: String(args.location) } : {}) },
  };
}

export function carouselSummary(c, mode) {
  const tz = c.brand.posting?.timezone;
  let local = c.at.toString();
  try { if (tz) local = `${c.at.toLocaleString('en-CA', { timeZone: tz, dateStyle: 'full', timeStyle: 'short' })} (${tz})`; } catch {}
  return [
    `About to schedule a carousel on ${c.handle} (${c.slug}):`,
    `  reel        ${path.basename(c.reel)}`,
    `  items       ${c.items.length}: ${c.items.map((it) => it.name).join(', ')}  (fingerprint ${c.fingerprint}, matches the approval)`,
    `  time        ${local}  (${c.at.toISOString()})`,
    '  platforms   instagram',
    `  mode        ${mode === 'live' ? 'LIVE: this really posts' : 'dry run: nothing is posted, the publisher records what it would send'}`,
    ...(c.options.collaborators ? [`  collab      ${c.options.collaborators.map((x) => '@' + x).join(', ')}`] : []),
    ...(c.options.location_id ? [`  location    ${c.options.location_id}`] : []),
    `  caption     ${c.caption.split('\n')[0].slice(0, 90)}`,
  ].join('\n');
}

async function askHandle(handle) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try { return (await rl.question(`Type the handle ${handle} to confirm: `)).trim(); } finally { rl.close(); }
}

export async function scheduleCarousel(reelDir, args, { fetchImpl = fetch, configDir = CONFIG_DIR, confirm = askHandle, log = console.log, now = Date.now() } = {}) {
  const c = checkCarousel(reelDir, args, now);
  if (c.problems.length) throw new Plain('Not scheduled:\n- ' + c.problems.join('\n- '));
  const conn = connection(c.slug, configDir);
  const info = await admin(conn, 'GET', '/admin', { fetchImpl });
  const pc = checkPublisher(info, c);
  if (pc.problems.length) throw new Plain('Not scheduled:\n- ' + pc.problems.join('\n- '));
  log(carouselSummary(c, pc.mode));
  if (args.preview === true) { log('Preview only: nothing was uploaded or scheduled. Run the same command with --yes once the owner says yes to this carousel and time.'); return { preview: true, mode: pc.mode }; }
  if (args.yes !== true) {
    const typed = String(await confirm(c.handle)).trim();
    if (typed.replace(/^@/, '').toLowerCase() !== c.handle.replace(/^@/, '').toLowerCase()) throw new Plain('Not confirmed. Nothing uploaded.');
  }
  const media = [];
  let s;
  try {
    for (const it of c.items) {
      const r = await admin(conn, 'PUT', `/admin/upload?type=${it.type}&name=${encodeURIComponent(it.name)}`, {
        body: fs.readFileSync(it.file), headers: { 'X-Content-SHA256': it.sha256, 'Content-Type': it.type === 'video' ? 'video/mp4' : 'image/jpeg' }, fetchImpl,
      });
      media.push({ key: r.key, sha256: it.sha256, role: 'item' });
    }
    s = await admin(conn, 'POST', '/admin/schedule', {
      body: JSON.stringify({ kind: 'carousel', media, platforms: ['instagram'], text: { instagram: c.caption }, at: c.atStr, options: c.options, reel: path.basename(c.reel) }),
      headers: { 'Content-Type': 'application/json' }, fetchImpl,
    });
  } catch (e) {
    for (const m of media) await admin(conn, 'DELETE', `/admin/upload?key=${encodeURIComponent(m.key)}`, { fetchImpl }).catch(() => null);
    throw e instanceof Plain ? new Plain(`Not scheduled (the uploaded files were deleted again): ${e.message}`) : e;
  }
  const mode = s.mode === 'live' ? 'live' : 'dry_run';
  const line = `- ${stamp(new Date(now))} Carousel scheduled on ${c.handle} for ${c.atStr}: post ${s.id}, ${c.items.length} items, fingerprint ${c.fingerprint}, publisher in ${mode} mode`;
  appendUnder(path.join(c.reel, 'approvals.md'), 'Carousel', line);
  log(`Scheduled: carousel post ${s.id} (${mode === 'live' ? 'live' : 'dry run'}). Recorded under "## Carousel" in approvals.md. Check it with: node publisher/scripts/schedule.mjs status`);
  return { id: s.id, mode, line };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [cmd, reel] = args._;
  if (!['files', 'approve', 'schedule'].includes(cmd) || !reel) throw new Plain('usage: carousel.mjs files|approve|schedule <reel folder> (schedule also takes --at <time with timezone> and --preview or --yes)');
  if (cmd === 'approve') return approveCarousel(reel);
  if (cmd === 'schedule') return scheduleCarousel(reel, args);
  const f = carouselFiles(reel);
  console.log(`out/carousel/ in ${path.basename(f.reel)}: ${f.items.length} items, fingerprint ${f.fingerprint}`);
  for (const it of f.items) console.log(`  ${it.name}  ${it.type}  sha256 ${it.sha256.slice(0, 12)}`);
  const p = itemProblems(f);
  console.log(p.length ? 'Problems:\n- ' + p.join('\n- ') : 'Every check passes.');
  const ok = lastCarouselApproval(read(path.join(f.reel, 'approvals.md')));
  console.log(ok ? (ok.fingerprint === f.fingerprint ? 'Approved as it is now.' : `Changed since the approval (${ok.fingerprint}): approve again.`) : 'Not approved yet.');
}

if (isMain(import.meta.url)) {
  main().catch((e) => { console.error(e instanceof Plain ? e.message : `Unexpected error: ${e?.message || e}`); process.exit(1); });
}
