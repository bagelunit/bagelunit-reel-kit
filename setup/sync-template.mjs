#!/usr/bin/env node
// BagelUnit Reel Kit: keep the template copies up to date. Runs on macOS, Windows and Linux.
//
//   node setup/sync-template.mjs
//       Refresh a generic folder you copy from, if you keep one: the folder in $REEL_TEMPLATE_HOME, or an existing
//       ~/Documents/Claude/Reel Template. Without either it does nothing (/brand-setup copies template/ directly,
//       so most people need no generic folder). It is a plain mirror: it holds no brand, so nothing is lost.
//
//   node setup/sync-template.mjs <brand-workspace>            shows what would change, changes nothing
//   node setup/sync-template.mjs <brand-workspace> --apply    does it
//       Updates ONE brand workspace (a copy you already set up) with the newer kit files.
//       It updates only what the kit owns: CLAUDE.md, README.md, LICENSE, .gitignore, docs/, .claude/skills/,
//       .claude/settings.json (the kit's hooks; scripts/, brand/library/3d and brand/library/sfx/sfx_add.py (the reel QA, effects, Blender and Manim tools); a brand's own settings go in .claude/settings.local.json), reels/_example/.
//       It NEVER touches brand/ or reels/ (the brand's own data; brand/licensed/ gets its README and empty folders, never assets.json or media), except that brand/brand.json gains any NEW
//       setting (at any depth, existing values are never changed) and brand starter files that do not exist yet
//       (log.md, swipe.md, insights.csv) are added.
//       Files it changes are first saved next to them as <name>.bak-<date>.
//       Local edits are MERGED, not lost: the workspace keeps a pristine copy of every kit file in .kit-base/ (written by each
//       update and by new-brand.mjs). A file you edited and the kit also changed is three-way merged (git merge-file); if the
//       same lines changed on both sides, your file stays as it is and the kit's version is written beside it as <name>.kit-new
//       to merge by hand. A file with no saved base yet (the first update after this feature) is replaced and the .bak keeps
//       your edits; from then on updates merge. The output shows replaced, merged and conflicts, in the dry run and the apply.
//       .gitignore keeps your own lines and gains the kit's new ones. The merge code is setup/lib/kit-merge.mjs.
//       Rules for one brand belong in its CLAUDE.local.md, which this script never touches.
//       The dry run also says which kit version the workspace is on, which is current, and what changed in between.
//
// Never run it on the repo itself. (setup/sync-template.sh is a launcher for this file.)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { planUpdate, applyPlan, writeBase, report } from './lib/kit-merge.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(REPO, 'template');
// a generic copy-from folder only when one is wanted: never create one in a synced Documents folder by default
const LEGACY = path.join(os.homedir(), 'Documents', 'Claude', 'Reel Template');
const GENERIC = process.env.REEL_TEMPLATE_HOME || (fs.existsSync(path.join(LEGACY, 'CLAUDE.md')) ? LEGACY : null);
const stamp = () => new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const target = args.find((a) => !a.startsWith('--'));
const kitVersion = (() => { try { return fs.readFileSync(path.join(REPO, 'VERSION'), 'utf8').trim(); } catch { return 'unknown'; } })();
// the build stamp (setup/stamp-build.mjs): a newer build of the same version is an update too; the workspace keeps it in .kit-build
const buildOf = (f) => { try { const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z) kit:([0-9a-f]{12})/.exec(fs.readFileSync(f, 'utf8').trim()); return m ? { at: m[1], kit: m[2], line: fs.readFileSync(f, 'utf8').trim() } : null; } catch { return null; } };
const kitBuild = buildOf(path.join(SRC, '.kit-build'));
const buildText = (b) => (b ? `build ${b.at.replace('T', ' ').replace('Z', ' UTC')}` : 'no build stamp');

if (!fs.existsSync(path.join(SRC, 'CLAUDE.md'))) { console.error('Cannot find template/ next to this script.'); process.exit(1); }
for (const a of args) if (a.startsWith('--') && a !== '--apply') { console.error(`Unknown option: ${a} (use --apply)`); process.exit(1); }

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
  if (!GENERIC) {
    console.log('No generic copy-from folder to refresh (set REEL_TEMPLATE_HOME to keep one). Nothing changed.');
    console.log('To update a brand folder:  node setup/sync-template.mjs <workspace>  (dry run), then add --apply. /kit-update in the brand folder does this for you.');
    process.exit(0);
  }
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

// what differs (nothing is written while planning: the dry run and the apply use the same plan)
const plan = planUpdate(SRC, DEST);
const newBrand = JSON.parse(fs.readFileSync(path.join(SRC, 'brand', 'brand.json'), 'utf8'));
const oldBrandPath = path.join(DEST, 'brand', 'brand.json');
const oldBrand = JSON.parse(fs.readFileSync(oldBrandPath, 'utf8'));
// settings the template added, at any depth; existing values are never changed
function missingKeys(src, dst, prefix = '') {
  const out = [];
  for (const k of Object.keys(src)) {
    if (!(k in dst)) out.push(prefix + k);
    else if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k]) && dst[k] && typeof dst[k] === 'object' && !Array.isArray(dst[k])) out.push(...missingKeys(src[k], dst[k], prefix + k + '.'));
  }
  return out;
}
function addKey(dst, src, dotted) {
  const parts = dotted.split('.'); let d = dst, s = src;
  for (const p of parts.slice(0, -1)) { d = d[p]; s = s[p]; }
  d[parts.at(-1)] = s[parts.at(-1)];
}
const missing = missingKeys(newBrand, oldBrand).filter((k) => !k.split('.').pop().startsWith('_note') || !k.includes('.'));
// brand starter files the template added (log, swipe, insights...): created only when absent, never overwritten
const BRAND_STARTERS = fs.readdirSync(path.join(SRC, 'brand')).filter((f) => f !== 'brand.json' && fs.statSync(path.join(SRC, 'brand', f)).isFile());
const newStarters = BRAND_STARTERS.filter((f) => !fs.existsSync(path.join(DEST, 'brand', f)));
const LICENSED_REGISTRY = 'brand/licensed/assets.json';
if (fs.existsSync(path.join(SRC, LICENSED_REGISTRY)) && !fs.existsSync(path.join(DEST, LICENSED_REGISTRY))) newStarters.push('licensed/assets.json');

if (!apply) {
  console.log(`DRY RUN for: ${DEST}   (nothing changed; add --apply to do it)`);
  const vf = path.join(DEST, '.kit-version');
  const have = fs.existsSync(vf) ? fs.readFileSync(vf, 'utf8').trim() || 'unknown' : 'unknown';
  const haveBuild = buildOf(path.join(DEST, '.kit-build'));
  console.log(`  kit version: ${kitVersion}   this workspace: ${have}`);
  console.log(`  kit ${buildText(kitBuild)}   this workspace: ${buildText(haveBuild)}`);
  const tup = (v) => (v.match(/\d+/g) || ['0']).slice(0, 3).map(Number);
  const cmp = (a, b) => { const x = tup(a), y = tup(b); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); } return 0; };
  let log = ''; try { log = fs.readFileSync(path.join(REPO, 'CHANGELOG.md'), 'utf8'); } catch { /* none */ }
  const blocks = log.split(/^## /m).slice(1);
  const sameBuild = !kitBuild || (haveBuild && haveBuild.kit === kitBuild.kit);
  if (have !== 'unknown' && cmp(have, kitVersion) >= 0) console.log(sameBuild ? '  (this workspace is already on the newest kit version and build)' : `  (same version; the kit has a different build, ${buildText(kitBuild)})`);
  const news = have === 'unknown' ? blocks.slice(0, 1) : blocks.filter((b) => cmp(b.split(/\s/)[0], have) > 0);
  for (const b of news) console.log(`\n  What changed in ${b.trimEnd().replace(/\n/g, '\n  ')}\n`);
  for (const line of report(plan, false)) console.log(line);
  console.log('');
  console.log(`  brand.json would gain: ${missing.length ? missing.join(', ') : 'nothing'}`);
  console.log(`  new brand files (created empty, nothing overwritten): ${newStarters.length ? newStarters.map((f) => 'brand/' + f).join(', ') : 'none'}`);
  process.exit(0);
}

const S = stamp();
applyPlan(plan, SRC, DEST, S);
for (const line of report(plan, true)) console.log(line);
console.log('');
if (missing.length) {
  fs.copyFileSync(oldBrandPath, `${oldBrandPath}.bak-${S}`);
  for (const k of missing) addKey(oldBrand, newBrand, k);
  fs.writeFileSync(oldBrandPath, JSON.stringify(oldBrand, null, 2) + '\n');
}
console.log(`brand.json gained: ${missing.length ? missing.join(', ') : 'nothing (already current)'}`);
for (const f of newStarters) { fs.mkdirSync(path.dirname(path.join(DEST, 'brand', f)), { recursive: true }); fs.copyFileSync(path.join(SRC, 'brand', f), path.join(DEST, 'brand', f)); }
if (newStarters.length) console.log(`new brand files: ${newStarters.map((f) => 'brand/' + f).join(', ')}`);
fs.writeFileSync(path.join(DEST, '.kit-synced'), new Date().toISOString().slice(0, 10) + '\n');
fs.writeFileSync(path.join(DEST, '.kit-version'), kitVersion + '\n');
if (kitBuild) fs.writeFileSync(path.join(DEST, '.kit-build'), kitBuild.line + '\n');
const nBase = writeBase(SRC, DEST, { version: kitVersion, build: kitBuild ? kitBuild.line : '' });   // the pristine copy the next update merges against
console.log(`Updated ${DEST} to kit version ${kitVersion}${kitBuild ? ` (${buildText(kitBuild)})` : ''}. Changed files were saved as *.bak-${S}; ${nBase} kit files were saved in .kit-base/ so the next update can merge your edits (commit .kit-base with the rest, never edit it)${plan.conflicts.length ? `. ${plan.conflicts.length} file${plan.conflicts.length === 1 ? ' has a conflict' : 's have conflicts'}: yours ${plan.conflicts.length === 1 ? 'was' : 'were'} kept and the kit's version is in <name>.kit-new, merge it by hand` : ''}. Your brand data and reels were not changed (only new settings and missing starter files were added). Rules for this brand only belong in CLAUDE.local.md, which updates never touch.`);
