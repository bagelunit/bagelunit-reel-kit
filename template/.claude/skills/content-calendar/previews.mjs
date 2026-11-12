// Watching approved reels on the dashboard: open a reel's card (from the calendar, the pipeline or anywhere else) and its
// approved final plays there; calendar entries that have one carry a play mark. The page is one file with no network
// requests, so a video cannot live inside it; each place that shows the page points the card's player at it its own way:
//   on this computer (brand/dashboard.html opened as a file): the reel's own out/<final>.mp4, by a relative path;
//   on the Wi-Fi view (serve.mjs): <key>/preview/<id>.mp4, streamed from the brand folder by the private address;
//   online (host.mjs): <key>/preview/<id>.mp4 only when brand.json -> dashboard.previews_online is true (off by default:
//   it uploads reels that are not posted yet); the copy is made small with ffmpeg (540 wide) so it fits every host's
//   file limit, and kept in .cache/previews/ until the final changes. Without it the online card says where to watch.
// page.mjs writes  <meta name="bu-previews" content="local">  in the head and each reel's local paths in the page data;
// rewrite() changes only that tag, and client.js builds the player's address from it (cardHtml, pvSrc).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { writeAtomic } from './lib.mjs';

export const INDEX = (root) => path.join(root, '.cache', 'previews.json');
const SMALL_DIR = (root) => path.join(root, '.cache', 'previews');
export const ONLINE_MAX = 24 * 1024 * 1024;   // under Cloudflare Pages' 25 MiB per file; Netlify takes more

// .cache/previews.json: every reel the page can play, with where its files are on this computer (never in the page)
export function writeIndex(root, M) {
  const index = {};
  for (const it of M.items) {
    if (!it.preview || !it.id) continue;
    index[it.id] = { video: it.preview.video, poster: it.preview.poster, size: it.preview.size, at: it.preview.at, ready: ['c', 'scheduled'].includes(it.stage) };
  }
  writeAtomic(INDEX(root), JSON.stringify(index, null, 1) + '\n');
  return index;
}
export function readIndex(root) {
  try { const j = JSON.parse(fs.readFileSync(INDEX(root), 'utf8')); return j && typeof j === 'object' && !Array.isArray(j) ? j : {}; } catch { return {}; }
}

// the file behind preview/<id>.mp4 or preview/<id>.jpg, only if it is listed and inside the brand folder's reels/
export function resolve(root, name) {
  const m = /^(.+)\.(mp4|jpg)$/.exec(String(name || ''));
  if (!m) return null;
  let id; try { id = decodeURIComponent(m[1]); } catch { return null; }
  const e = readIndex(root)[id];
  const file = e && (m[2] === 'mp4' ? e.video : e.poster);
  if (!file) return null;
  try {
    const real = fs.realpathSync(file), reels = fs.realpathSync(path.join(root, 'reels'));
    if (!real.startsWith(reels + path.sep)) return null;
    return { file: real, type: m[2] === 'mp4' ? 'video/mp4' : /\.png$/i.test(real) ? 'image/png' : 'image/jpeg', size: fs.statSync(real).size };
  } catch { return null; }
}

// send a file with HTTP ranges, which phones and Safari need to play a video
export function send(req, res, { file, type, size }) {
  const head = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', 'Referrer-Policy': 'no-referrer' };
  const r = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (r && (r[1] || r[2])) {
    let start = r[1] ? Number(r[1]) : Math.max(0, size - Number(r[2])), end = r[1] && r[2] ? Math.min(Number(r[2]), size - 1) : size - 1;
    if (start > end || start >= size) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); return res.end(); }
    res.writeHead(206, { ...head, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
    if (req.method === 'HEAD') return res.end();
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...head, 'Content-Length': size });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}

// mode: 'local' (as drawn), 'served' (every reel from preview/), or 'online' with the set of reel ids that were uploaded
export function rewrite(html, mode, uploaded = new Set()) {
  if (mode === 'local') return html;
  return html.replace('<meta name="bu-previews" content="local">',
    `<meta name="bu-previews" content="${mode === 'served' ? 'served' : 'online'}" data-ids="${[...uploaded].map(encodeURIComponent).join(' ')}">`);
}

// ffmpeg: on the PATH, or where Homebrew and most Linux systems put it (scheduled jobs have a bare PATH)
function ffmpeg() {
  for (const c of ['ffmpeg', '/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/usr/bin/ffmpeg']) {
    try { if (spawnSync(c, ['-version'], { stdio: 'ignore', timeout: 10000 }).status === 0) return c; } catch {}
  }
  return null;
}

// for the online copy: a small version of each approved, not yet posted reel, made once per final
export function onlineCopies(root, { log = () => {} } = {}) {
  const index = readIndex(root), dir = SMALL_DIR(root), keep = new Set(), out = [];
  const ready = Object.entries(index).filter(([, e]) => e.ready);
  if (!ready.length) { fs.rmSync(dir, { recursive: true, force: true }); return out; }
  fs.mkdirSync(dir, { recursive: true });
  let ff;
  for (const [id, e] of ready) {
    const tag = `${String(id).replace(/[^a-z0-9-]+/gi, '_').slice(0, 60)}-${e.size}-${e.at}`;
    const small = path.join(dir, `${tag}.mp4`);
    if (!fs.existsSync(small)) {
      if (ff === undefined) { ff = ffmpeg(); if (!ff) log('Online previews need ffmpeg (the kit installs it with the engine); none was found, so the online page says where to watch instead.'); }
      if (!ff) continue;
      const tmp = small + '.tmp.mp4';
      const r = spawnSync(ff, ['-y', '-v', 'error', '-i', e.video, '-vf', 'scale=540:-2', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30',
        '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', tmp], { stdio: 'ignore', timeout: 5 * 60 * 1000 });
      if (r.status !== 0 || !fs.existsSync(tmp)) { fs.rmSync(tmp, { force: true }); log(`Could not make the online preview of ${id}.`); continue; }
      fs.renameSync(tmp, small);
    }
    keep.add(path.basename(small));
    if (fs.statSync(small).size > ONLINE_MAX) { log(`The online preview of ${id} is over 24 MB, so it stays off the online page.`); continue; }
    out.push({ id, video: small, poster: e.poster && fs.existsSync(e.poster) ? e.poster : null });
  }
  for (const f of fs.readdirSync(dir)) if (!keep.has(f)) fs.rmSync(path.join(dir, f), { force: true });   // finals that changed or posted
  return out;
}
