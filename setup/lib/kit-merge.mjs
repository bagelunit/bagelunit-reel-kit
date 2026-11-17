// BagelUnit Reel Kit: the merge logic that updating a brand workspace uses (setup/sync-template.mjs, which /kit-update runs
// from the downloaded kit, and setup/new-brand.mjs). One module, so the dry run, the apply and the tests agree.
//
// A workspace keeps a pristine copy of every kit-owned TEXT file in `.kit-base/<same path>` plus `.kit-base/.kit-base-version`.
// On update, for each kit file that differs from the workspace:
//   - no saved base (or a binary or big file)  -> replaced, the old file kept as <name>.bak-<stamp>
//   - the workspace file equals the base       -> replaced (no local edit), old file kept as .bak
//   - the kit file equals the base             -> left as it is (only you changed it)
//   - both changed                             -> three-way merge (git merge-file): clean = written (old kept as .bak),
//                                                 conflict = yours untouched, the kit's version beside it as <name>.kit-new
//   - .gitignore                               -> lines the kit added are appended, your own lines are kept
// Nothing is written while planning, so a dry run predicts the apply exactly.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// what the kit owns in a workspace; brand/ and the brand's own reels/ are absent on purpose
const LICENSED_KEEP = ['music', 'sfx', 'stock-video', 'motion-graphic', 'lut'].map((t) => `brand/licensed/${t}/.gitkeep`);
export const KIT_PATHS = ['CLAUDE.md', 'README.md', 'LICENSE', '.gitignore', 'docs', '.claude/skills', '.claude/settings.json', 'reels/_example', 'publisher', 'scripts', 'brand/library/3d', 'brand/library/sfx/sfx_add.py', 'brand/licensed/README.md', ...LICENSED_KEEP];
export const BASE_DIR = '.kit-base';
export const MAX_TEXT = 300 * 1024;

export const posix = (r) => r.split(path.sep).join('/');
export function* walk(root) {
  if (fs.statSync(root).isFile()) { yield root; return; }
  for (const e of fs.readdirSync(root, { withFileTypes: true })) {
    if (e.name === '.DS_Store') continue;
    const p = path.join(root, e.name);
    if (e.isDirectory()) yield* walk(p); else yield p;
  }
}
export const isText = (buf) => buf.length <= MAX_TEXT && !buf.subarray(0, 8000).includes(0);
const norm = (buf) => buf.toString('utf8').replace(/\r\n/g, '\n');           // CRLF-tolerant comparisons and merges
const isGitignore = (rel) => path.basename(rel) === '.gitignore';
// a .gitignore inside .kit-base would act as ignore rules there, and the root one is merged by lines (no base needed)
const baseFile = (dest, rel) => path.join(dest, BASE_DIR, rel);

// every kit-owned file in the kit: [{ rel, file }]
export function kitFiles(src) {
  const out = [];
  for (const p of KIT_PATHS) {
    const from = path.join(src, p);
    if (!fs.existsSync(from)) continue;
    for (const f of walk(from)) out.push({ rel: path.relative(src, f), file: f });
  }
  return out;
}

// git merge-file: exit 0 = clean, >0 = conflicts, <0 or 255 = it could not run. Done in a temp folder; the workspace is not touched.
function threeWay(ours, base, theirs) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-merge-'));
  try {
    const [o, b, t] = ['ours', 'base', 'theirs'].map((n) => path.join(tmp, n));
    fs.writeFileSync(o, ours); fs.writeFileSync(b, base); fs.writeFileSync(t, theirs);
    const r = spawnSync('git', ['merge-file', '-p', o, b, t], { cwd: tmp, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (r.error || r.status === null || r.status < 0 || r.status > 127) return { ok: false, why: r.error ? 'git is not available' : 'git could not merge it' };
    return r.status === 0 ? { ok: true, text: r.stdout } : { ok: false, why: 'the same lines changed on both sides' };
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// .gitignore: keep every line the workspace has, add the kit's lines it lacks (comments and blanks only when a rule follows them)
function gitignoreUnion(ws, kit) {
  const eol = ws.includes('\r\n') ? '\r\n' : '\n';
  const have = new Set(ws.split(/\r?\n/).map((l) => l.trim()));
  const kitLines = new Set(kit.split(/\r?\n/).map((x) => x.trim()));
  const extra = ws.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && !kitLines.has(l));
  const add = kit.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#') && !have.has(l.trim()));
  if (!add.length) return { text: ws, added: 0, extra: extra.length };
  const body = ws.endsWith('\n') || !ws ? ws : ws + eol;
  return { text: `${body}# added by the kit update${eol}${add.join(eol)}${eol}`, added: add.length, extra: extra.length };
}

// Plan an update of `dest` from the kit's template folder `src`. Writes nothing.
// Returns { added, replaced: [{rel, noBase, binary}], merged: [{rel, text, how}], conflicts: [{rel, why}], keptLocal, hasBase }
export function planUpdate(src, dest) {
  const plan = { added: [], replaced: [], merged: [], conflicts: [], keptLocal: [], hasBase: fs.existsSync(path.join(dest, BASE_DIR, '.kit-base-version')) };
  for (const { rel, file: f } of kitFiles(src)) {
    const g = path.join(dest, rel);
    if (!fs.existsSync(g)) { plan.added.push(rel); continue; }
    const kb = fs.readFileSync(f), wb = fs.readFileSync(g);
    if (kb.equals(wb)) continue;
    const text = isText(kb) && isText(wb);
    if (!text) { plan.replaced.push({ rel, binary: true }); continue; }
    const kn = norm(kb), wn = norm(wb);
    if (kn === wn) continue;                                           // only the line endings differ
    if (isGitignore(rel)) {
      const u = gitignoreUnion(wb.toString('utf8'), kn);
      if (u.extra) { if (u.added) plan.merged.push({ rel, text: u.text, how: `${u.added} kit line${u.added === 1 ? '' : 's'} added, your own lines kept` }); else plan.keptLocal.push(rel); }
      else plan.replaced.push({ rel });
      continue;
    }
    const bf = baseFile(dest, rel);
    if (!fs.existsSync(bf) || !isText(fs.readFileSync(bf))) { plan.replaced.push({ rel, noBase: true }); continue; }
    const bn = norm(fs.readFileSync(bf));
    if (wn === bn) { plan.replaced.push({ rel }); continue; }
    if (kn === bn) { plan.keptLocal.push(rel); continue; }
    const m = threeWay(wn, bn, kn);
    if (!m.ok) { plan.conflicts.push({ rel, why: m.why }); continue; }
    if (m.text === wn) { plan.keptLocal.push(rel); continue; }           // the kit's change was already in yours
    plan.merged.push({ rel, text: wb.includes('\r\n') ? m.text.replace(/\n/g, '\r\n') : m.text, how: 'your changes kept' });
  }
  return plan;
}

// Apply a plan. Every file that changes is first kept as <name>.bak-<stamp>; a conflict writes <name>.kit-new.
export function applyPlan(plan, src, dest, S) {
  const bak = (g) => { if (fs.existsSync(g)) fs.copyFileSync(g, `${g}.bak-${S}`); };
  for (const r of [...plan.added, ...plan.replaced.map((x) => x.rel)]) {
    const g = path.join(dest, r); fs.mkdirSync(path.dirname(g), { recursive: true }); bak(g); fs.copyFileSync(path.join(src, r), g);
  }
  for (const m of plan.merged) { const g = path.join(dest, m.rel); bak(g); fs.writeFileSync(g, m.text); }
  for (const c of plan.conflicts) fs.copyFileSync(path.join(src, c.rel), path.join(dest, c.rel) + '.kit-new');
}

// Write the pristine copy of every kit-owned text file (the base for the next update) and the version file.
export function writeBase(src, dest, { version = 'unknown', build = '' } = {}) {
  const root = path.join(dest, BASE_DIR);
  fs.rmSync(root, { recursive: true, force: true });
  let n = 0;
  for (const { rel, file } of kitFiles(src)) {
    if (isGitignore(rel)) continue;
    const b = fs.readFileSync(file);
    if (!isText(b)) continue;
    const to = path.join(root, rel); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.writeFileSync(to, b); n++;
  }
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, '.kit-base-version'), `${version}\n${build || ''}\n`);
  return n;
}

// The report: the same three groups for a dry run (apply = false) and for an apply.
export function report(plan, apply) {
  const L = [], v = (a, b) => (apply ? a : b);
  const G = (h) => L.push('', h);
  const list = (rows, mk) => rows.forEach((r) => L.push('  ' + mk(r)));
  if (plan.added.length) { G(`New files (${v('added', 'would be added')}):`); list(plan.added, (r) => `new       ${posix(r)}`); }
  const plain = plan.replaced.filter((r) => !r.noBase), nob = plan.replaced.filter((r) => r.noBase);
  if (plain.length) { G(`Replaced (${v('no local edit, the old file is kept as .bak', 'no local edit, the old file would be kept as .bak')}):`); list(plain, (r) => `replaced  ${posix(r.rel)}${r.binary ? '  (binary file)' : ''}`); }
  if (nob.length) {
    G(`Replaced, no saved base yet (${nob.length}):`);
    L.push(`  No saved base yet, so local edits in ${nob.length === 1 ? 'this file were' : 'these files were'} ${v('replaced', 'would be replaced')}; ${v('they are', 'they would be')} in the .bak file. From now on updates will merge your edits instead.`);
    list(nob, (r) => `replaced  ${posix(r.rel)}`);
  }
  if (plan.merged.length) { G(`Merged (your changes kept) (${plan.merged.length}):`); list(plan.merged, (r) => `merged    ${posix(r.rel)}  (${r.how}; ${v('the old file is kept as .bak', 'the old file would be kept as .bak')})`); }
  if (plan.conflicts.length) {
    G(`Conflicts (${plan.conflicts.length}):`);
    list(plan.conflicts, (r) => `conflict  ${posix(r.rel)}: yours ${v('kept', 'would be kept')}, the kit's new version ${v('is', 'would be')} in ${posix(r.rel)}.kit-new, merge it by hand (${r.why})`);
  }
  if (plan.keptLocal.length) { G(`Your own edits, left as they are (the kit did not change these) (${plan.keptLocal.length}):`); list(plan.keptLocal, (r) => `yours     ${posix(r)}`); }
  const total = plan.added.length + plan.replaced.length + plan.merged.length + plan.conflicts.length;
  L.push('', `Summary: ${plan.added.length} new, ${plan.replaced.length} replaced, ${plan.merged.length} merged (your changes kept), ${plan.conflicts.length} conflict${plan.conflicts.length === 1 ? '' : 's'}${plan.conflicts.length ? ' (need you)' : ''}, ${plan.keptLocal.length} of your own edits left alone.`);
  if (!total && !plan.keptLocal.length) L.push('All kit files are current.');
  return L;
}
