#!/usr/bin/env node
// Put the dashboard online, privately, on a host the brand owner picks. Netlify is the kit's suggestion; Cloudflare
// Pages and any other static host work too. The owner logs into the host themselves; this script never does.
//
//   node .claude/skills/content-calendar/host.mjs [brand folder] folder       write the site folder only (upload it anywhere)
//   node .claude/skills/content-calendar/host.mjs [brand folder] netlify      publish with the Netlify CLI
//   node .claude/skills/content-calendar/host.mjs [brand folder] cloudflare   publish with Cloudflare's wrangler CLI
//   node .claude/skills/content-calendar/host.mjs [brand folder]              use brand.json -> dashboard.host
//
// Settings in brand/brand.json -> dashboard: "host" (local, wifi, netlify, cloudflare, folder), "site" (the Netlify
// site id or the Cloudflare Pages project name), "url" (the site's address) and "path_key" (made once: the page lives at
// <url>/<path_key>/, and the site's front page is empty, so the dashboard is not at an address anyone could guess).
// The key is made by this script when run by hand (/content-calendar host) and saved in brand.json; a background upload
// never edits brand.json (if no key is there yet it keeps one in .cache/path-key, which the next run by hand moves over).
// The page tells search engines to stay away, and links to files on this computer are removed from the online copy.
// Reel videos go online only with dashboard.previews_online true: small copies of the approved, not yet posted reels
// (previews.mjs), so each card plays its reel there too.
//
// Keeping it current: after each redraw (sync.mjs, serve.mjs) queuePublish() checks whether the page really changed
// (its clock is ignored), and if so starts at most one quiet background waiter, which uploads no more often than
// dashboard.publish_every minutes (default 15) and once more after the last change. A failed upload waits 30 minutes
// before the next try. Set publish_every to 0 to upload only on the scheduled refresh.
// One upload at a time: the waiter and the scheduled refresh both hold .cache/publish-wait.json while they work. A lock
// whose process is alive is held, however long the waiter has waited (it touches the lock on every turn); only a lock
// whose process is gone, or one untouched for far longer than any wait, is taken over. Only its owner removes it.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { brandRoot, readJSON, writeStatus, writeAtomic } from './lib.mjs';
import { build } from './calendar.mjs';
import { readIndex, onlineCopies, rewrite as previewsFor } from './previews.mjs';

const ONLINE = ['netlify', 'cloudflare', 'folder'];
const WIN = process.platform === 'win32';
const NODE_DIR = path.dirname(process.execPath);
const cache = (root, f) => path.join(root, '.cache', f);
const brandFile = (root) => path.join(root, 'brand', 'brand.json');
const settings = (root) => readJSON(brandFile(root)).dashboard || {};
const ageOf = (file) => { try { return Date.now() - fs.statSync(file).mtimeMs; } catch { return Infinity; } };

// the secret path the page lives under: brand.json -> dashboard.path_key, else the one kept in .cache/path-key.
// save: true (only from the command run by hand) makes it if needed and writes it into brand.json.
const KEY_OK = /^[A-Za-z0-9_-]{8,}$/;
function knownKey(root) {
  const fromBrand = String(settings(root).path_key || '');
  if (KEY_OK.test(fromBrand)) return { key: fromBrand, inBrand: true };
  let key = ''; try { key = fs.readFileSync(cache(root, 'path-key'), 'utf8').trim(); } catch {}
  return { key: KEY_OK.test(key) ? key : '', inBrand: false };
}
export function pathKey(root, { save = false } = {}) {
  const known = knownKey(root);
  if (known.inBrand) return known.key;
  const keyFile = cache(root, 'path-key');
  let key = known.key;
  if (!key) {
    key = crypto.randomBytes(12).toString('base64url');
    fs.mkdirSync(path.dirname(keyFile), { recursive: true });
    try { fs.writeFileSync(keyFile, key + '\n', { flag: 'wx', mode: 0o600 }); } catch { key = fs.readFileSync(keyFile, 'utf8').trim(); }   // another run made it first
  }
  if (save) {
    const b = readJSON(brandFile(root), null);
    if (b) { b.dashboard = { ...(b.dashboard || {}), path_key: key }; writeAtomic(brandFile(root), JSON.stringify(b, null, 2) + '\n'); fs.rmSync(keyFile, { force: true }); }
  }
  return key;
}
export function privateUrl(root) {
  const d = settings(root);
  const { key } = knownKey(root);   // only a key that exists: one that was never uploaded has no page behind it
  return d.url && /^https:\/\//.test(d.url) && key ? `${d.url.replace(/\/+$/, '')}/${key}/` : null;
}

// the page as it would be uploaded, without its clock, so an unchanged page is not uploaded again
function fingerprint(root) {
  try {
    const html = fs.readFileSync(path.join(root, 'brand', 'dashboard.html'), 'utf8').replace(/<time\b[^>]*>[\s\S]*?<\/time>/g, '');
    // with online previews on, a new final (same page, other video) is a change too
    const videos = settings(root).previews_online === true ? JSON.stringify(Object.entries(readIndex(root)).filter(([, e]) => e.ready).map(([id, e]) => [id, e.size, e.at])) : '';
    return crypto.createHash('sha256').update(html).update(videos).digest('hex');
  } catch { return null; }
}

export function site(root) {
  const out = path.join(root, '.cache', 'site'), key = pathKey(root);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(path.join(out, key), { recursive: true });
  // approved reels to watch: small copies, only with dashboard.previews_online on (they are not posted yet)
  const uploaded = new Set();
  if (settings(root).previews_online === true) {
    const pdir = path.join(out, key, 'preview');
    fs.mkdirSync(pdir, { recursive: true });
    for (const p of onlineCopies(root, { log: (m) => console.log(m) })) {
      const name = encodeURIComponent(p.id);
      fs.copyFileSync(p.video, path.join(pdir, `${name}.mp4`));
      if (p.poster) fs.copyFileSync(p.poster, path.join(pdir, `${name}.jpg`));
      uploaded.add(p.id);
    }
  }
  const html = previewsFor(fs.readFileSync(path.join(root, 'brand', 'dashboard.html'), 'utf8').replace(/<a href="(?!https?:)[^"]*">([^<]*)<\/a>/g, '$1'), 'online', uploaded);
  fs.writeFileSync(path.join(out, key, 'index.html'), html);
  fs.writeFileSync(path.join(out, 'index.html'), '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex, nofollow"><title>Nothing here</title></head><body></body></html>\n');
  fs.writeFileSync(path.join(out, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
  // Netlify and Cloudflare Pages both read _headers
  fs.writeFileSync(path.join(out, '_headers'), '/*\n  X-Robots-Tag: noindex, nofollow\n  Referrer-Policy: no-referrer\n  X-Content-Type-Options: nosniff\n  Cache-Control: no-store\n');
  return out;
}

// the host's CLI: next to this Node first (scheduled jobs have a bare PATH), then on the PATH, then through npx
function cli(name, pkg) {
  const exe = (n) => (WIN ? `${n}.cmd` : n);
  if (fs.existsSync(path.join(NODE_DIR, exe(name)))) return [path.join(NODE_DIR, exe(name)), []];
  const which = spawnSync(WIN ? 'where' : 'which', [name], { encoding: 'utf8', env: { ...process.env, PATH: NODE_DIR + path.delimiter + (process.env.PATH || '') } });
  if (which.status === 0) return [name, []];
  const npx = fs.existsSync(path.join(NODE_DIR, exe('npx'))) ? path.join(NODE_DIR, exe('npx')) : exe('npx');
  return [npx, ['--yes', pkg]];
}
let STDIO = 'inherit';                          // the background waiter sends the host's output to .cache/publish.log
function run([cmd, pre], args) {
  const env = { ...process.env, PATH: NODE_DIR + path.delimiter + (process.env.PATH || '') };
  // Windows runs .cmd files through cmd.exe, which needs every argument quoted by hand (spaces, &, and the like)
  const r = WIN
    ? spawnSync([cmd, ...pre, ...args].map((a) => `"${String(a).replace(/"/g, '""')}"`).join(' '), { stdio: STDIO, shell: true, env, timeout: 10 * 60 * 1000 })
    : spawnSync(cmd, [...pre, ...args], { stdio: STDIO, env, timeout: 10 * 60 * 1000 });
  return r.status === 0;
}

export function publish(root, where) {
  const r = publishNow(root, where);
  if (r.done) {
    writeAtomic(cache(root, 'last-publish'), String(Date.now()));
    writeAtomic(cache(root, 'last-publish-hash'), fingerprint(root) || '');
    fs.rmSync(cache(root, 'publish-fail'), { force: true });
  } else if (ONLINE.includes(r.host)) writeAtomic(cache(root, 'publish-fail'), String(Date.now()));
  return r;
}
function publishNow(root, where) {
  const dash = settings(root);
  const host = where || dash.host || 'local';
  if (host === 'local' || host === 'wifi') return { host, done: false, note: host === 'wifi' ? 'Wi-Fi viewing runs with serve.mjs, nothing to publish.' : 'Local only: nothing to publish.' };
  const out = site(root), key = pathKey(root);
  const where2 = privateUrl(root) || `<your site's address>/${key}/`;
  if (host === 'folder') return { host, done: true, note: `The site is in ${out}. Upload that folder to your host; the dashboard will be at ${where2}. Keep that address private.` };
  if (host === 'netlify') {
    // --no-build: the folder is already the finished site, so the Netlify CLI must not look for a build to run
    const args = ['deploy', '--prod', '--no-build', '--dir', out, '--message', 'content dashboard'];
    if (dash.site) args.push('--site', dash.site);
    const ok = run(cli('netlify', 'netlify-cli'), args);
    return { host, done: ok, note: ok ? `Published to Netlify. Your dashboard: ${where2}` : 'Netlify did not publish. Log in first with  npx netlify-cli login  and check dashboard.site (docs/dashboard.md).' };
  }
  if (host === 'cloudflare') {
    if (!dash.site) return { host, done: false, note: 'Set brand.json -> dashboard.site to your Cloudflare Pages project name first; make the project with  npx wrangler pages project create <name> --production-branch main  (docs/dashboard.md).' };
    // --branch main is the production branch the project was made with (pages project create --production-branch main),
    // so the upload lands on <project>.pages.dev, the address the Access application protects (docs/dashboard.md)
    const ok = run(cli('wrangler', 'wrangler'), ['pages', 'deploy', out, '--project-name', dash.site, '--branch', 'main', '--commit-dirty=true']);
    return { host, done: ok, note: ok ? `Published to Cloudflare Pages. Your dashboard: ${where2}` : 'Cloudflare did not publish. Log in first with  npx wrangler login, and check the project was made with  npx wrangler pages project create <name> --production-branch main  (docs/dashboard.md).' };
  }
  return { host, done: false, note: `Unknown host "${host}": use local, wifi, netlify, cloudflare or folder.` };
}

/* ── the publish lock ───────────────────────────────────────────────────────────────────────────────────────── */
const LOCK = (root) => cache(root, 'publish-wait.json');
const every = (root) => Math.max(0, Number(settings(root).publish_every ?? 15)) || 0;
const alive = (pid) => { if (!Number.isInteger(pid) || pid <= 0) return false; try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const readLock = (root) => { try { return fs.readFileSync(LOCK(root), 'utf8'); } catch { return null; } };
// held: its process is alive and it was touched within publish_every + 30 minutes (a waiter touches it on each turn,
// so only a number reused by another program after a restart looks older); a lock being written right now is held too
function heldBy(root, text) {
  let lock = null; try { lock = JSON.parse(text); } catch {}
  const age = ageOf(LOCK(root));
  if (!lock?.pid) return age < 60 * 1000;
  return alive(lock.pid) && age < (every(root) + 30) * 60 * 1000;
}
// take the lock (an open file to write the owner into), or null when someone holds it
function takeLock(root) {
  fs.mkdirSync(path.join(root, '.cache'), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    try { return fs.openSync(LOCK(root), 'wx'); }   // only one caller can create the lock
    catch {
      const text = readLock(root);
      if (text == null) continue;                    // removed just now: try again
      if (heldBy(root, text)) return null;
      // stale: move it aside, and put it back if what was moved is not the lock judged stale (someone took over meanwhile)
      const aside = `${LOCK(root)}.${process.pid}.stale`;
      try { fs.renameSync(LOCK(root), aside); } catch { continue; }
      let moved = null; try { moved = fs.readFileSync(aside, 'utf8'); } catch {}
      if (moved !== text) { try { fs.linkSync(aside, LOCK(root)); } catch {} fs.rmSync(aside, { force: true }); return null; }
      fs.rmSync(aside, { force: true });
    }
  }
  return null;
}
const ownsLock = (root, pid = process.pid) => { try { return JSON.parse(readLock(root)).pid === pid; } catch { return false; } };
const touchLock = (root) => { if (ownsLock(root)) { const t = new Date(); try { fs.utimesSync(LOCK(root), t, t); } catch {} } };
const releaseLock = (root) => { if (ownsLock(root)) fs.rmSync(LOCK(root), { force: true }); };   // only the owner removes it

// after a redraw: upload only if the page really changed, and keep exactly one waiter on its way
export function queuePublish(root) {
  const dash = settings(root);
  if (!ONLINE.includes(dash.host) || !(every(root) > 0)) return 'off';
  if (ageOf(cache(root, 'publish-fail')) < 30 * 60 * 1000) return 'backoff';
  let last = ''; try { last = fs.readFileSync(cache(root, 'last-publish-hash'), 'utf8').trim(); } catch {}
  if (last && last === fingerprint(root)) return 'same';
  fs.mkdirSync(path.join(root, '.cache'), { recursive: true });
  writeAtomic(cache(root, 'publish-pending'), String(Date.now()));
  const fd = takeLock(root);
  if (fd == null) return 'queued';                   // a waiter (or the refresh) is on it and sees the pending change
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), root, '--later'], { detached: true, stdio: 'ignore', windowsHide: true });
  fs.writeSync(fd, JSON.stringify({ pid: child.pid, at: new Date().toISOString(), by: 'waiter' }));
  fs.closeSync(fd);
  child.unref();
  return 'queued';
}

// an upload now (the scheduled refresh, or host.mjs by hand), holding the same lock as the waiter
export function publishLocked(root, where) {
  const host = where || settings(root).host || 'local';
  if (!ONLINE.includes(host)) return publish(root, where);
  const fd = takeLock(root);
  if (fd == null) {
    writeAtomic(cache(root, 'publish-pending'), String(Date.now()));
    return { host, done: false, queued: true, note: 'An upload is already on its way in the background; it will take this page too.' };
  }
  fs.writeSync(fd, JSON.stringify({ pid: process.pid, at: new Date().toISOString(), by: 'refresh' }));
  fs.closeSync(fd);
  let r;
  try { r = publish(root, where); }
  finally { releaseLock(root); }
  if (fs.existsSync(cache(root, 'publish-pending')) && queuePublish(root) === 'same') fs.rmSync(cache(root, 'publish-pending'), { force: true });   // a change that came in meanwhile gets its own upload
  return r;
}

// the waiter: sleeps until the next upload is allowed, uploads the newest page, and repeats while changes keep coming
async function later(root) {
  const logFd = fs.openSync(cache(root, 'publish.log'), 'a');
  STDIO = ['ignore', logFd, logFd];
  const log = (s) => fs.writeSync(logFd, `${new Date().toISOString()}  ${s}\n`);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    // the caller writes this waiter's number into the lock just after starting it: wait a moment for it
    let mine = false;
    for (let i = 0; i < 25 && !(mine = ownsLock(root)); i++) await sleep(200);
    if (!mine) { log('another upload holds the lock; this waiter stops'); return; }
    for (;;) {
      touchLock(root);
      if (!fs.existsSync(cache(root, 'publish-pending'))) break;
      const gap = every(root) * 60 * 1000;
      const lastAt = Number(readJSON(cache(root, 'last-publish'), 0)) || 0;
      const wait = Math.max(0, lastAt + gap - Date.now());
      if (wait > 0) { log(`next upload in ${Math.round(wait / 60000)} min`); await sleep(wait); }
      if (!ownsLock(root)) { log('another upload took over; this waiter stops'); return; }
      touchLock(root);
      const changedAt = fs.readFileSync(cache(root, 'publish-pending'), 'utf8');
      let last = ''; try { last = fs.readFileSync(cache(root, 'last-publish-hash'), 'utf8').trim(); } catch {}
      if (last && last === fingerprint(root)) { log('no real change since the last upload'); }
      else {
        const r = publish(root);
        log(r.note);
        writeStatus(root, 'host', { ok: r.done, error: r.done ? undefined : r.note });
        if (!r.done) { fs.rmSync(cache(root, 'publish-pending'), { force: true }); break; }
      }
      if (fs.readFileSync(cache(root, 'publish-pending'), 'utf8') === changedAt) fs.rmSync(cache(root, 'publish-pending'), { force: true });
    }
  } finally {
    releaseLock(root);
    fs.closeSync(logFd);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  if (args.includes('--later')) { await later(brandRoot(args.find((a) => !a.startsWith('--')))); process.exit(0); }
  const hosts = ['folder', 'netlify', 'cloudflare', 'local', 'wifi'];
  const where = args.find((a) => hosts.includes(a));
  const root = brandRoot(args.find((a) => !a.startsWith('--') && !hosts.includes(a)));
  build(root);
  if (ONLINE.includes(where || settings(root).host)) pathKey(root, { save: true });   // run by hand: the key is made here and kept in brand.json
  const r = publishLocked(root, where);
  console.log(r.note);
  if (!r.done && !r.queued && !['local', 'wifi'].includes(r.host)) process.exit(1);
}
