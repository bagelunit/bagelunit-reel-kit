// folders.mjs · where a brand's reel folders sit, and housekeeping for them: `kit organize` and `kit tidy`.
// Both show what they would do and change nothing until you add --apply. Node 22, no packages.
//
// A reel's name is its slug; the plan, log, insights and publisher all use the slug, never a path. So a reel can sit in
// reels/<slug>/ (flat) or reels/2026/11 November/November 12/<slug>/ (dated, by the day it is planned to post), and moving
// it changes nothing else. The lookup rules match the template's publisher/scripts/reels.mjs and tools/kitcore.py
// (find_reel); setup/test-reel-folders.mjs in the kit repo checks that they agree.
import fs from 'node:fs';
import path from 'node:path';

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MARKERS = ['reel.json', 'approvals.md', 'script.txt', 'STORYBOARD.md'];
export const isDateFolderName = (n) => /^\d{4}$/.test(n) || /^\d{2} [A-Za-z]+$/.test(n) || /^[A-Za-z]+ \d{1,2}$/.test(n);
const read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
const readJSON = (f, d = {}) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const hasMarker = (d) => MARKERS.some((m) => fs.existsSync(path.join(d, m)));
export const folderSlug = (v) => String(v ?? '').replace(/[`]/g, '').replace(/\\/g, '/').split('/').map((s) => s.trim()).filter(Boolean).pop() || '';

export function datedFolder(date) {
  const m = String(date || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m || +m[2] < 1 || +m[2] > 12 || +m[3] < 1 || +m[3] > 31) return null;
  return `${m[1]}/${m[2]} ${MONTHS[+m[2] - 1]}/${MONTHS[+m[2] - 1]} ${+m[3]}`;
}

export function findBrand(start) {
  for (let d = path.resolve(start || process.cwd()); ; d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, 'brand', 'brand.json'))) return d;
    if (path.dirname(d) === d) return null;
  }
}

export function listReels(root) {
  const base = path.join(root, 'reels'), out = [];
  const walk = (dir, depth) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('_') || e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      if (depth < 4 && isDateFolderName(e.name) && !hasMarker(full)) walk(full, depth + 1);
      else out.push({ slug: e.name, dir: full, rel: path.relative(base, full).split(path.sep).join('/') });
    }
  };
  if (isDir(base)) walk(base, 0);
  return out.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
}

export function findReel(root, slug) {
  const s = folderSlug(slug);
  if (!s || s.startsWith('_') || s.startsWith('.')) return null;
  const flat = path.join(root, 'reels', s);
  if (isDir(flat)) return flat;
  const hits = listReels(root).filter((r) => r.slug === s);
  return hits.length ? hits[hits.length - 1].dir : null;
}

// what a person typed for a reel (a folder, reels/<slug> or the slug) -> its folder; a path that exists is used as it is, else the
// slug is looked up in the nearest brand folder above `cwd`; falls back to the path as typed
export function resolveReelArg(arg, cwd = process.cwd()) {
  const typed = path.resolve(cwd, String(arg ?? ''));
  if (isDir(typed)) return typed;
  const root = findBrand(cwd);
  return (root && findReel(root, arg)) || typed;
}

export const layoutOf = (root) => (readJSON(path.join(root, 'brand', 'brand.json')).reels?.layout === 'dated' ? 'dated' : 'flat');

// where a new reel goes: reels/<slug>, or under its post date's folders in the dated layout
export const newReelDir = (root, slug, date) => {
  const dated = layoutOf(root) === 'dated' ? datedFolder(date) : null;
  return path.join(root, 'reels', ...(dated ? dated.split('/') : []), slug);
};

/* ── the date a reel is planned to post ─────────────────────────────────────────────────────────────────────────── */
function planRows(root) {
  const lines = read(path.join(root, 'brand', 'plan.md')).split('\n'), rows = [];
  const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
  const sep = (l) => /^\s*\|?\s*:?-{2,}/.test(l || '');
  let head = null;
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim().startsWith('|')) { head = null; continue; }
    if (sep(lines[i + 1]) && !sep(lines[i])) { head = cells(lines[i]).map((h) => h.toLowerCase()); i++; continue; }
    if (!head) continue;
    const c = cells(lines[i]);
    const di = head.findIndex((h) => /^(date|when|day)/.test(h)), fi = head.findIndex((h) => /^(reel|folder|slug)/.test(h));
    if (di >= 0 && fi >= 0) rows.push({ date: (c[di] || '').match(/\d{4}-\d{2}-\d{2}/)?.[0] || '', slug: folderSlug(c[fi]) });
  }
  return rows;
}

// { date: 'YYYY-MM-DD', from: 'the plan' | 'the scheduled time' | 'the posted time' | 'the day the folder was made' }
export function reelDate(root, reel, plan = planRows(root)) {
  const row = plan.find((r) => r.slug === reel.slug && r.date);
  if (row) return { date: row.date, from: 'the plan' };
  const ap = read(path.join(reel.dir, 'approvals.md'));
  const sch = [...ap.matchAll(/Scheduled .*? for (\d{4}-\d{2}-\d{2})/g)].pop();
  if (sch) return { date: sch[1], from: 'the scheduled time' };
  const posted = [...ap.matchAll(/^\s*-\s*(\d{4}-\d{2}-\d{2})[ T]\d{2}:\d{2}\s+Posted\b/gm)].pop();
  if (posted) return { date: posted[1], from: 'the posted time' };
  let born = null;
  try { const st = fs.statSync(reel.dir); born = st.birthtimeMs > 0 ? st.birthtime : st.mtime; } catch {}
  const p = (n) => String(n).padStart(2, '0');
  return born ? { date: `${born.getFullYear()}-${p(born.getMonth() + 1)}-${p(born.getDate())}`, from: 'the day the folder was made' } : { date: '', from: '' };
}

// the date the plan gives a slug, or '' (used by kit start to place a new reel in the dated layout)
export const plannedDate = (root, slug) => planRows(root).find((r) => r.slug === slug && r.date)?.date || '';

/* ── kit organize ───────────────────────────────────────────────────────────────────────────────────────────────── */
// Moves each reel to where the layout says. Returns { layout, moves, kept, problems }. `apply` moves; otherwise a dry run.
export function organize(root, { layout, apply = false } = {}) {
  const want = layout || layoutOf(root);
  const plan = planRows(root), all = listReels(root);
  const taken = new Set(all.map((r) => r.dir));
  const moves = [], kept = [], problems = [];
  const seen = {};
  for (const r of all) (seen[r.slug] ||= []).push(r.rel);
  for (const [slug, rels] of Object.entries(seen)) if (rels.length > 1) problems.push(`${slug} is in ${rels.length} places (${rels.join(', ')}): the newest date is used; keep one and delete the other`);
  for (const r of all) {
    let to;
    let why = '';
    if (want === 'flat') to = path.join(root, 'reels', r.slug);
    else {
      const d = reelDate(root, r, plan);
      const dated = datedFolder(d.date);
      if (!dated) { problems.push(`${r.slug}: no date found, left where it is`); continue; }
      to = path.join(root, 'reels', ...dated.split('/'), r.slug);
      why = d.from;
    }
    if (to === r.dir) { kept.push(r.rel); continue; }
    if (taken.has(to) || fs.existsSync(to)) { problems.push(`${r.slug}: ${path.relative(path.join(root, 'reels'), to)} already exists, left where it is`); continue; }
    moves.push({ slug: r.slug, from: r.dir, to, fromRel: r.rel, toRel: path.relative(path.join(root, 'reels'), to).split(path.sep).join('/'), why });
    taken.add(to);
  }
  if (apply) {
    for (const m of moves) {
      // a link inside the reel that points by a relative path would break when the folder moves: point it at the same place absolutely
      const links = [];
      for (const e of fs.readdirSync(m.from, { withFileTypes: true })) {
        if (!e.isSymbolicLink()) continue;
        const l = path.join(m.from, e.name), t = fs.readlinkSync(l);
        if (!path.isAbsolute(t)) links.push([e.name, path.resolve(m.from, t)]);
      }
      fs.mkdirSync(path.dirname(m.to), { recursive: true });
      fs.renameSync(m.from, m.to);
      for (const [name, target] of links) { fs.rmSync(path.join(m.to, name)); fs.symlinkSync(target, path.join(m.to, name), 'dir'); }
    }
    pruneEmpty(path.join(root, 'reels'));
    const bf = path.join(root, 'brand', 'brand.json');
    if (layout && layout !== layoutOf(root) && fs.existsSync(bf)) {
      const b = readJSON(bf);
      b.reels = { ...(b.reels && typeof b.reels === 'object' ? b.reels : {}), layout };
      fs.writeFileSync(bf, JSON.stringify(b, null, 2) + '\n');
    }
  }
  return { layout: want, moves, kept, problems };
}

// remove empty date folders (and a .DS_Store inside them) left behind by a move; never reels/ itself or a _folder
function pruneEmpty(dir, top = true) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) if (e.isDirectory() && isDateFolderName(e.name) && !hasMarker(path.join(dir, e.name))) pruneEmpty(path.join(dir, e.name), false);
  if (top) return;
  const left = fs.readdirSync(dir).filter((n) => n !== '.DS_Store');
  if (!left.length) fs.rmSync(dir, { recursive: true, force: true });
}

/* ── kit tidy ───────────────────────────────────────────────────────────────────────────────────────────────────── */
const sizeOf = (p) => {
  try {
    const st = fs.lstatSync(p);
    if (!st.isDirectory()) return st.size;
    return fs.readdirSync(p).reduce((t, n) => t + sizeOf(path.join(p, n)), 0);
  } catch { return 0; }
};
export const human = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${Math.round(b / 1e6)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);

export const isPosted = (reelDir) => /^\s*-.*\bPosted (on|as)\b/im.test(read(path.join(reelDir, 'approvals.md')));

// what to keep in out/: the approved video and cover (Gate C), caption.txt, platforms/ and the Posting record's files
function keepInOut(reelDir) {
  const ap = read(path.join(reelDir, 'approvals.md'));
  const keep = new Set(['caption.txt', 'platforms']);
  for (const m of ap.matchAll(/^- (?:File|Cover): (.+?) \| sha256:/gm)) keep.add(m[1].trim());
  return keep;
}

// What tidy would delete from one finished reel: [{ path, bytes }]. Keeps the words (script, approvals, caption), reel.json,
// the approved video and cover. Removes build/, stills/ and out/ files that were not approved. audio/ (the paid voice take)
// goes only with { audio: true }.
export function tidyReel(reelDir, { audio = false } = {}) {
  const out = [];
  const add = (p) => { if (fs.existsSync(p) || fs.lstatSync(p, { throwIfNoEntry: false })) out.push({ path: p, bytes: sizeOf(p) }); };
  for (const d of ['build', 'stills', ...(audio ? ['audio'] : [])]) add(path.join(reelDir, d));
  const outDir = path.join(reelDir, 'out'), keep = keepInOut(reelDir);
  if (isDir(outDir)) for (const n of fs.readdirSync(outDir)) if (!keep.has(n) && n !== '.DS_Store') add(path.join(outDir, n));
  return out;
}

// Which reels to tidy: one (a slug or folder) or every finished one. Only a posted reel is tidied unless force.
// Returns { reels: [{ slug, rel, items, bytes }], skipped: [{ slug, why }], freed, applied }.
export function tidy(root, { target, all = false, audio = false, apply = false, force = false } = {}) {
  const list = listReels(root);
  const picked = all ? list : [list.find((r) => r.dir === path.resolve(target || '') || r.slug === folderSlug(target))].filter(Boolean);
  const result = { reels: [], skipped: [], freed: 0, applied: apply };
  if (!all && !picked.length) result.skipped.push({ slug: String(target || ''), why: 'no such reel' });
  for (const r of picked) {
    if (!isPosted(r.dir) && !force) { if (!all) result.skipped.push({ slug: r.slug, why: 'not posted yet (a reel in progress keeps its build files; --force tidies it anyway)' }); continue; }
    const items = tidyReel(r.dir, { audio });
    const bytes = items.reduce((t, i) => t + i.bytes, 0);
    if (!items.length) continue;
    result.reels.push({ slug: r.slug, rel: r.rel, items, bytes });
    result.freed += bytes;
    if (apply) for (const i of items) fs.rmSync(i.path, { recursive: true, force: true });
  }
  return result;
}
