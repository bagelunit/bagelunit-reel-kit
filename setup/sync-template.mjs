#!/usr/bin/env node
// Susanoo Reel Kit: keep the template copies up to date. Runs on macOS, Windows and Linux.
//
//   node setup/sync-template.mjs
//       Refresh the generic folder you copy from (~/Documents/Claude/Reel Template, or $REEL_TEMPLATE_HOME)
//       from this repo's template/. It is a plain mirror: it holds no brand, so nothing is lost.
//
//   node setup/sync-template.mjs <brand-workspace>            shows what would change, changes nothing
//   node setup/sync-template.mjs <brand-workspace> --apply    does it
//       Updates ONE brand workspace (a copy you already set up) with the newer kit files.
//       It updates only what the kit owns: CLAUDE.md, README.md, LICENSE, .gitignore, docs/, .claude/skills/, reels/_example/.
//       It NEVER touches brand/ or reels/ (the brand's own data), except that brand/brand.json gains any NEW
//       top-level setting the template added (existing values are never changed).
//       Files it overwrites are first saved next to them as <name>.bak-<date>.
//       A brand-specific edit you made to CLAUDE.md or a skill WILL be replaced (the .bak keeps it): re-apply it after.
//       The dry run also says which kit version the workspace is on, which is current, and what changed in between.
//
// Never run it on the repo itself. (setup/sync-template.sh is a launcher for this file.)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(REPO, 'template');
const GENERIC = process.env.REEL_TEMPLATE_HOME || path.join(os.homedir(), 'Documents', 'Claude', 'Reel Template');
const PATHS = ['CLAUDE.md', 'README.md', 'LICENSE', '.gitignore', 'docs', '.claude/skills', 'reels/_example'];   // kit-owned; brand/ and the brand's own reels/ are absent on purpose
const stamp = () => new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const bytes = (f) => fs.readFileSync(f);
const same = (a, b) => bytes(a).equals(bytes(b));
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const target = args.find((a) => !a.startsWith('--'));
const kitVersion = (() => { try { return fs.readFileSync(path.join(REPO, 'VERSION'), 'utf8').trim(); } catch { return 'unknown'; } })();

if (!fs.existsSync(path.join(SRC, 'CLAUDE.md'))) { console.error('Cannot find template/ next to this script.'); process.exit(1); }
for (const a of args) if (a.startsWith('--') && a !== '--apply') { console.error(`Unknown option: ${a} (use --apply)`); process.exit(1); }

function* walk(root) {
  if (fs.statSync(root).isFile()) { yield root; return; }
  for (const e of fs.readdirSync(root, { withFileTypes: true })) {
    if (e.name === '.DS_Store') continue;
    const p = path.join(root, e.name);
    if (e.isDirectory()) yield* walk(p); else yield p;
  }
}
function mirror(src, dst) {                      // make dst match src exactly (generic folder only)
  fs.mkdirSync(dst, { recursive: true });
  const want = new Set();
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (e.name === '.DS_Store') continue;
    want.add(e.name);
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) mirror(s, d); else fs.copyFileSync(s, d);
  }
  for (const e of fs.readdirSync(dst, { withFileTypes: true })) if (!want.has(e.name)) fs.rmSync(path.join(dst, e.name), { recursive: true, force: true });
}

if (!target) {
  mirror(SRC, GENERIC);
  console.log(`Refreshed the generic folder: ${GENERIC}`);
  console.log('Brand copies already made are NOT changed. Update each with:  node setup/sync-template.mjs <workspace> --apply');
  process.exit(0);
}

const DEST = path.resolve(target);
if (!fs.existsSync(DEST) || !fs.statSync(DEST).isDirectory()) { console.error(`Not a folder: ${DEST}`); process.exit(1); }
const rel = path.relative(REPO, DEST);
if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) { console.error('Refusing: that is inside the kit repo.'); process.exit(1); }
if (!fs.existsSync(path.join(DEST, 'CLAUDE.md')) || !fs.existsSync(path.join(DEST, 'brand', 'brand.json'))) {
  console.error(`Not a reel workspace (no CLAUDE.md or brand/brand.json): ${DEST}`); process.exit(1);
}

// what differs
const added = [], changed = [];
for (const p of PATHS) {
  const from = path.join(SRC, p);
  if (!fs.existsSync(from)) continue;
  for (const f of walk(from)) {
    const r = path.relative(SRC, f), g = path.join(DEST, r);
    if (!fs.existsSync(g)) added.push(r); else if (!same(f, g)) changed.push(r);
  }
}
const newBrand = JSON.parse(fs.readFileSync(path.join(SRC, 'brand', 'brand.json'), 'utf8'));
const oldBrandPath = path.join(DEST, 'brand', 'brand.json');
const oldBrand = JSON.parse(fs.readFileSync(oldBrandPath, 'utf8'));
const missing = Object.keys(newBrand).filter((k) => !(k in oldBrand));

if (!apply) {
  console.log(`DRY RUN for: ${DEST}   (nothing changed; add --apply to do it)`);
  const vf = path.join(DEST, '.kit-version');
  const have = fs.existsSync(vf) ? fs.readFileSync(vf, 'utf8').trim() || 'unknown' : 'unknown';
  console.log(`  kit version: ${kitVersion}   this workspace: ${have}`);
  const tup = (v) => (v.match(/\d+/g) || ['0']).slice(0, 3).map(Number);
  const cmp = (a, b) => { const x = tup(a), y = tup(b); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); } return 0; };
  let log = ''; try { log = fs.readFileSync(path.join(REPO, 'CHANGELOG.md'), 'utf8'); } catch { /* none */ }
  const blocks = log.split(/^## /m).slice(1);
  if (have !== 'unknown' && cmp(have, kitVersion) >= 0) console.log('  (this workspace is already on the newest kit version)');
  const news = have === 'unknown' ? blocks.slice(0, 1) : blocks.filter((b) => cmp(b.split(/\s/)[0], have) > 0);
  for (const b of news) console.log(`\n  What changed in ${b.trimEnd().replace(/\n/g, '\n  ')}\n`);
  for (const r of added) console.log(`  new       ${r}`);
  for (const r of changed) console.log(`  replaced  ${r}`);
  if (!added.length && !changed.length) console.log('  all kit files are current');
  console.log(`  brand.json would gain: ${missing.length ? missing.join(', ') : 'nothing'}`);
  process.exit(0);
}

const S = stamp();
for (const r of [...added, ...changed]) {
  const g = path.join(DEST, r);
  fs.mkdirSync(path.dirname(g), { recursive: true });
  if (fs.existsSync(g)) fs.copyFileSync(g, `${g}.bak-${S}`);
  fs.copyFileSync(path.join(SRC, r), g);
}
if (missing.length) {
  fs.copyFileSync(oldBrandPath, `${oldBrandPath}.bak-${S}`);
  for (const k of missing) oldBrand[k] = newBrand[k];
  fs.writeFileSync(oldBrandPath, JSON.stringify(oldBrand, null, 2) + '\n');
}
console.log(`brand.json gained: ${missing.length ? missing.join(', ') : 'nothing (already current)'}`);
fs.writeFileSync(path.join(DEST, '.kit-synced'), new Date().toISOString().slice(0, 10) + '\n');
fs.writeFileSync(path.join(DEST, '.kit-version'), kitVersion + '\n');
console.log(`Updated ${DEST} to kit version ${kitVersion}. Replaced files were saved as *.bak-${S}. brand/ and reels/ were not touched.`);
