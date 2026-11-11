// Where a reel folder is. One lookup for every script that reads a reel (the dashboard, pull.mjs, schedule.mjs,
// best-times.mjs). Node 22, no packages.
//
// A reel's NAME is its slug (the kebab-case folder name). The plan, the log, the insights and the publisher all use the
// slug, never a path, so a reel can sit anywhere under reels/:
//   flat   (default)  reels/<slug>/
//   dated             reels/2026/11 November/November 12/<slug>/     (set "reels": {"layout": "dated"} in brand/brand.json)
// Reading finds a reel in either place, whatever the setting says. The setting only decides where NEW reels go and what
// `kit organize` moves reels to.
//
// The engine's tools/folders.mjs and tools/kitcore.py (find_reel) follow the same rules; setup/test-reel-folders.mjs
// checks that they agree.
import fs from 'node:fs';
import path from 'node:path';

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// a reel folder holds at least one of these (a brand-new reel has reel.json; a script written first has script.txt)
export const REEL_MARKERS = ['reel.json', 'approvals.md', 'script.txt', 'STORYBOARD.md'];
// the folders that only group reels by date: 2026, "11 November", "November 12"
export const isDateFolderName = (n) => /^\d{4}$/.test(n) || /^\d{2} [A-Za-z]+$/.test(n) || /^[A-Za-z]+ \d{1,2}$/.test(n);

const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const skipName = (n) => n.startsWith('_') || n.startsWith('.');
export const isReelDir = (d) => REEL_MARKERS.some((m) => fs.existsSync(path.join(d, m)));

// "2026-11-12" -> "2026/11 November/November 12" (null for anything else)
export function datedFolder(date) {
  const m = String(date || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m || +m[2] < 1 || +m[2] > 12 || +m[3] < 1 || +m[3] > 31) return null;
  const month = MONTHS[+m[2] - 1];
  return `${m[1]}/${m[2]} ${month}/${month} ${+m[3]}`;
}

// a plan or log cell, a path or a slug -> the slug: `reels/x`, `reels/2026/11 November/November 12/x/` and `x` all give x
export const folderSlug = (v) => String(v ?? '').replace(/[`]/g, '').replace(/\\/g, '/').split('/').map((s) => s.trim()).filter(Boolean).pop() || '';

// brand/brand.json "reels": {"layout": "flat" | "dated"}; anything else is flat
export function reelsLayout(root) {
  try { return JSON.parse(fs.readFileSync(path.join(root, 'brand', 'brand.json'), 'utf8'))?.reels?.layout === 'dated' ? 'dated' : 'flat'; } catch { return 'flat'; }
}

// every reel folder under reels/: [{ slug, dir, rel }] (rel = the path under reels/, with forward slashes), sorted by rel.
// Folders starting with _ or . are skipped (reels/_example). A reel folder is never searched inside.
export function listReels(root) {
  const base = path.join(root, 'reels'), out = [];
  const walk = (dir, depth) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (!e.isDirectory() || skipName(e.name)) continue;
      const full = path.join(dir, e.name);
      if (depth < 4 && isDateFolderName(e.name) && !isReelDir(full)) walk(full, depth + 1);
      else out.push({ slug: e.name, dir: full, rel: path.relative(base, full).split(path.sep).join('/') });
    }
  };
  if (isDir(base)) walk(base, 0);
  return out.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
}

// slugs that sit in more than one place: { slug: [rel, rel] }
export function duplicateReels(list) {
  const by = {};
  for (const r of list) (by[r.slug] ||= []).push(r.rel);
  return Object.fromEntries(Object.entries(by).filter(([, v]) => v.length > 1));
}

// the folder of the reel called `slug`, or null. reels/<slug> first (the flat layout, and the fast path); otherwise a
// search of the dated folders. A slug in two places gives the newest date (the last rel).
export function findReel(root, slug) {
  const s = folderSlug(slug);
  if (!s || skipName(s)) return null;
  const flat = path.join(root, 'reels', s);
  if (isDir(flat)) return flat;
  const hits = listReels(root).filter((r) => r.slug === s);
  return hits.length ? hits[hits.length - 1].dir : null;
}

// what a person typed for a reel (a folder, reels/<slug>, or a slug) -> its folder. A path that exists is used as it is;
// otherwise the slug is looked up in the nearest brand folder above `cwd`. Falls back to the path as typed.
export function resolveReelArg(arg, cwd = process.cwd()) {
  const typed = path.resolve(cwd, String(arg ?? ''));
  if (isDir(typed)) return typed;
  for (let d = path.resolve(cwd); ; d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, 'brand', 'brand.json'))) return findReel(d, arg) || typed;
    if (path.dirname(d) === d) return typed;
  }
}

// where a new reel called `slug` goes under reels/: the dated folder when the layout is dated and a date is known
export function newReelDir(root, slug, date) {
  const dated = reelsLayout(root) === 'dated' ? datedFolder(date) : null;
  return path.join(root, 'reels', ...(dated ? dated.split('/') : []), slug);
}
