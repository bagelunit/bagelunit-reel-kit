#!/usr/bin/env node
// licensed.mjs · the brand's registry of material that came from somewhere else (music, sound effects, stock video, motion graphics, LUTs, and
// AI-generated images and video) and what a reel may use from it. Any source works: a licensed site, a generator, a purchase. The kit ships only this
// mechanism, never an asset: the owner gets the file by hand and records each one here with `kit licensed add`. (Your OWN renders, from Blender or code,
// are not recorded here: a scene's {"file": ...} uses them directly and they are never treated as licensed.)
//
//   kit licensed add <file> --type music|sfx|stock-video|motion-graphic|lut|generated-image|generated-video --title "..." [--artist ..] [--url ..]
//                          [--channels a,b] [--credit "..."] [--id slug] [--notes ..] [--licence ..] [--plan business] [--move]
//                          generated types also need --tool "<what made it>" and take [--prompt ".."] [--onscreen-label ".."] [--no-label "reason"]
//   kit licensed list [--type T]
//   kit licensed check [<reel>]         every asset the reel references exists in the registry, sits inside brand/licensed/,
//                                       and still has its recorded SHA-256, and every generated asset's on-screen label is shown;
//                                       PASS/FAIL lines, exit 1 on any FAIL
//   kit licensed remove <id> [--keep-file]
//
// Registry: <brand>/brand/licensed/assets.json  {"assets":[{id,type,title,artist,source,url,plan,licence,channels,file,sha256,credit,
// downloaded,notes}]}; media in <brand>/brand/licensed/<type>/ (never committed: the brand's .gitignore ignores it, the registry stays).
// A reel uses an asset by id (reel.json "look.lut", "music": [{"asset"}], scenes.json "clip" and "overlay"; see studio/KIT.md).
// Node 22, no packages. The same design is used by the BagelUnit Video Kit, so keep names in step.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findBrand, resolveReelArg } from './folders.mjs';

export const TYPES = ['music', 'sfx', 'stock-video', 'motion-graphic', 'lut', 'generated-image', 'generated-video'];
export const GENERATED = ['generated-image', 'generated-video'];
export const isGenerated = (a) => Boolean(a) && GENERATED.includes(a.type);
export const DEFAULT_LABEL = { 'generated-video': 'Re-creation', 'generated-image': 'AI-generated' };
// what a scene's "clip" and "overlay" may point at by asset id
export const CLIP_TYPES = ['stock-video', 'generated-video'];
export const OVERLAY_TYPES = ['motion-graphic', 'generated-video', 'generated-image'];
const EXT = {
  music: ['.wav', '.mp3', '.m4a', '.flac', '.aiff', '.aif', '.ogg'],
  sfx: ['.wav', '.mp3', '.m4a', '.flac', '.aiff', '.aif', '.ogg'],
  'stock-video': ['.mp4', '.mov', '.m4v', '.webm'],
  'motion-graphic': ['.mov', '.webm', '.mp4', '.png', '.gif', '.webp', '.jpg', '.jpeg'],
  lut: ['.cube'],
  'generated-video': ['.mp4', '.mov', '.m4v', '.webm'],
  'generated-image': ['.png', '.jpg', '.jpeg', '.webp', '.gif'],
};
const ID = /^[a-z0-9][a-z0-9-]*$/;
export const registryFile = (brand) => path.join(brand, 'brand', 'licensed', 'assets.json');
export const licensedDir = (brand) => path.join(brand, 'brand', 'licensed');

const readJSON = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
export const sha256File = (file) => {
  const h = crypto.createHash('sha256'), fd = fs.openSync(file, 'r'), buf = Buffer.allocUnsafe(1 << 20);
  try { for (let n; (n = fs.readSync(fd, buf, 0, buf.length, null)) > 0;) h.update(buf.subarray(0, n)); } finally { fs.closeSync(fd); }
  return h.digest('hex');
};
const inside = (parent, child) => { const r = path.relative(parent, child); return r !== '' && !r.startsWith('..') && !path.isAbsolute(r); };

export function loadRegistry(brand) {
  const raw = readJSON(registryFile(brand), null);
  if (raw === null) return { assets: [] };
  if (!raw || !Array.isArray(raw.assets)) throw new Error(`${registryFile(brand)} is not a licensed-assets registry (want {"assets": [...]})`);
  return raw;
}
function saveRegistry(brand, reg) {
  const f = registryFile(brand);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(`${f}.part`, JSON.stringify(reg, null, 2) + '\n');
  fs.renameSync(`${f}.part`, f);
}
export const assetFile = (brand, asset) => path.resolve(brand, asset.file);
export const findAsset = (brand, id) => loadRegistry(brand).assets.find((a) => a.id === id) || null;

/* ── a real .cube file: LUT_3D_SIZE N with N^3 rows of three numbers (or LUT_1D_SIZE N with N rows) ────────────────────── */
export function validateCube(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) { return `cannot read ${file}: ${e.message}`; }
  let size = 0, dim = 0, rows = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    let m;
    if ((m = /^LUT_3D_SIZE\s+(\d+)$/i.exec(line))) { dim = 3; size = Number(m[1]); continue; }
    if ((m = /^LUT_1D_SIZE\s+(\d+)$/i.exec(line))) { dim = 1; size = Number(m[1]); continue; }
    if (/^(TITLE|DOMAIN_MIN|DOMAIN_MAX|LUT_3D_INPUT_RANGE|LUT_1D_INPUT_RANGE)\b/i.test(line)) continue;
    if (/^-?\d*\.?\d+(e[-+]?\d+)?\s+-?\d*\.?\d+(e[-+]?\d+)?\s+-?\d*\.?\d+(e[-+]?\d+)?$/i.test(line)) { rows++; continue; }
    return `not a .cube file: line "${line.slice(0, 40)}" is neither a header nor three numbers`;
  }
  if (!dim) return 'not a .cube file: no LUT_3D_SIZE (or LUT_1D_SIZE) line';
  if (size < 2 || size > 256) return `not a usable .cube file: LUT size ${size} is outside 2 to 256`;
  const want = dim === 3 ? size ** 3 : size;
  if (rows !== want) return `not a complete .cube file: LUT size ${size} needs ${want} rows of three numbers, found ${rows}`;
  return null;
}

/* ── add / list / remove ─────────────────────────────────────────────────────────────────────────────────────────────────── */
const slug = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const today = () => new Date().toISOString().slice(0, 10);

export function addAsset(brand, o) {
  if (!o.file) throw new Error('give the downloaded file: kit licensed add <file> --type ... --title ...');
  const src = path.resolve(o.file);
  if (!fs.existsSync(src) || !fs.statSync(src).isFile()) throw new Error(`${src} is not a file (download it first, from wherever you license it)`);
  if (!TYPES.includes(o.type)) throw new Error(`--type must be one of: ${TYPES.join(', ')}`);
  if (!String(o.title || '').trim()) throw new Error('--title is needed (the name the site shows)');
  const ext = path.extname(src).toLowerCase();
  if (!EXT[o.type].includes(ext)) throw new Error(`a ${o.type} is one of ${EXT[o.type].join(' ')}, not ${ext || 'a file without an extension'}`);
  const id = o.id != null ? String(o.id) : slug(o.title);
  if (!ID.test(id)) throw new Error(`id "${id}" is not allowed: lower-case letters, digits and hyphens only (no slashes or dots)`);
  const reg = loadRegistry(brand);
  if (reg.assets.some((a) => a.id === id)) throw new Error(`an asset with id "${id}" is already recorded (pick another --id, or remove the old one)`);
  if (o.type === 'lut') { const bad = validateCube(src); if (bad) throw new Error(bad); }
  const gen = GENERATED.includes(o.type), noLabel = o.noLabel == null || o.noLabel === false ? null : o.noLabel;
  let label = '', noLabelReason = '';
  if (gen) {
    if (!String(o.tool || '').trim()) throw new Error(`a ${o.type} needs --tool "<what made it>" (free text: any generator, so the record is honest)`);
    if (noLabel !== null && (noLabel === true || !String(noLabel).trim())) throw new Error('--no-label needs the reason it is recorded with: --no-label "why no on-screen label is needed"');
    if (noLabel !== null) {
      if (o.onscreenLabel != null && String(o.onscreenLabel).trim()) throw new Error('give either --onscreen-label "text" or --no-label "reason", not both');
      noLabelReason = String(noLabel).trim();
    } else if (o.onscreenLabel != null) {
      label = String(o.onscreenLabel).trim();
      if (!label) throw new Error('an empty --onscreen-label is only allowed with --no-label "reason" (it is recorded); otherwise leave it out for the default "' + DEFAULT_LABEL[o.type] + '"');
    } else label = DEFAULT_LABEL[o.type];
  } else if (o.tool || o.prompt || o.onscreenLabel != null || noLabel !== null) throw new Error(`--tool, --prompt, --onscreen-label and --no-label are for generated-image and generated-video, not ${o.type}`);
  const dir = path.join(licensedDir(brand), o.type), dest = path.join(dir, `${id}${ext}`);
  if (!inside(dir, dest)) throw new Error('the file would land outside brand/licensed/ (refused)');
  if (fs.existsSync(dest)) throw new Error(`${path.relative(brand, dest)} already exists (refused to overwrite)`);
  fs.mkdirSync(dir, { recursive: true });
  const hash = sha256File(src);
  if (o.move) { try { fs.renameSync(src, dest); } catch { fs.copyFileSync(src, dest); fs.rmSync(src); } } else fs.copyFileSync(src, dest);
  if (sha256File(dest) !== hash) { fs.rmSync(dest, { force: true }); throw new Error('the copy does not match the original (disk problem?); nothing was recorded'); }
  const channels = Array.isArray(o.channels) ? o.channels : String(o.channels || '').split(',').map((s) => s.trim()).filter(Boolean);
  const asset = {
    id, type: o.type, title: String(o.title).trim(), artist: String(o.artist || ''), source: String(o.source || ''), url: String(o.url || ''),
    plan: String(o.plan || ''), licence: String(o.licence || ''), channels, file: path.relative(brand, dest).split(path.sep).join('/'), sha256: hash,
    credit: String(o.credit || ''), downloaded: String(o.downloaded || today()), notes: String(o.notes || ''),
  };
  if (gen) Object.assign(asset, { generated: true, tool: String(o.tool).trim(), prompt: String(o.prompt || ''), onscreen_label: label, ...(noLabelReason ? { no_label_reason: noLabelReason } : {}) });
  reg.assets.push(asset);
  saveRegistry(brand, reg);
  const warn = [];
  if (o.type === 'music' && ext !== '.wav') warn.push('music is best as WAV: choose WAV when downloading if the site offers it (an MP3 works but is lossier)');
  if (!asset.url && !gen) warn.push('no --url: record where you got it so the licence can be shown later; add --source and --plan too');
  if (gen && noLabelReason) warn.push(`recorded WITHOUT an on-screen label: "${noLabelReason}". Make sure that is honest where the reel is posted`);
  if (gen && label) warn.push(`a reel that uses it must show the text "${label}" on screen (Gate C refuses otherwise)`);
  return { asset, warn };
}

export function listAssets(brand, type) {
  if (type && !TYPES.includes(type)) throw new Error(`--type must be one of: ${TYPES.join(', ')}`);
  return loadRegistry(brand).assets.filter((a) => !type || a.type === type);
}

export function removeAsset(brand, id, { keepFile = false } = {}) {
  const reg = loadRegistry(brand), k = reg.assets.findIndex((a) => a.id === id);
  if (k < 0) throw new Error(`no asset "${id}" in the registry (kit licensed list)`);
  const [a] = reg.assets.splice(k, 1);
  let note = 'file kept';
  if (!keepFile) {
    const f = assetFile(brand, a);
    if (inside(licensedDir(brand), f) && fs.existsSync(f)) { fs.rmSync(f); note = 'file deleted'; } else note = 'file not found or outside brand/licensed/, left alone';
  }
  saveRegistry(brand, reg);
  return { asset: a, note };
}

/* ── what a reel references ─────────────────────────────────────────────────────────────────────────────────────────────── */
// [{id, where, type (one type or a list of allowed types)}] from reel.json ("look.lut", "music": [{asset}]) and scenes.json (a scene's "clip" and "overlay")
export function referencedAssets(reelDir) {
  const out = [], cfg = readJSON(path.join(reelDir, 'reel.json'), {}) || {};
  if (cfg.look && typeof cfg.look === 'object' && cfg.look.lut != null) out.push({ id: String(cfg.look.lut), where: 'reel.json look.lut', type: 'lut' });
  if (Array.isArray(cfg.music)) cfg.music.forEach((m, i) => { if (m && m.asset != null) out.push({ id: String(m.asset), where: `reel.json music[${i + 1}]`, type: 'music' }); });
  const raw = readJSON(path.join(reelDir, 'scenes.json'), null);
  const list = Array.isArray(raw) ? raw : raw && Array.isArray(raw.scenes) ? raw.scenes : [];
  list.forEach((s, i) => {
    // a clip or overlay with a "file" is the owner's own render: it is never recorded, so it is never listed here
    if (s && s.clip && s.clip.asset != null) out.push({ id: String(s.clip.asset), where: `scene ${i + 1} clip`, type: CLIP_TYPES });
    if (s && s.overlay && s.overlay.asset != null) out.push({ id: String(s.overlay.asset), where: `scene ${i + 1} overlay`, type: OVERLAY_TYPES });
  });
  return out;
}

// the asset (registry entry + file) a reel may use for a purpose; throws a plain-words reason when it may not
export function resolveAsset(brand, id, type, where = 'the reel') {
  if (!brand) throw new Error(`${where} uses licensed asset "${id}" but this reel is not inside a brand folder (no brand/brand.json above it)`);
  const a = findAsset(brand, id);
  if (!a) throw new Error(`${where}: no licensed asset "${id}" in brand/licensed/assets.json (record it: kit licensed add <file> --type ${[].concat(type)[0]} --title ...)`);
  const want = [].concat(type);
  if (!want.includes(a.type)) throw new Error(`${where}: asset "${id}" is a ${a.type}, but a ${want.join(' or ')} is needed here`);
  const f = assetFile(brand, a);
  if (!inside(licensedDir(brand), f)) throw new Error(`${where}: asset "${id}" points outside brand/licensed/ (${a.file}); refused`);
  if (!fs.existsSync(f)) throw new Error(`${where}: the file of asset "${id}" is missing (${a.file}); download it again and re-add it`);
  return { asset: a, file: f };
}

/* ── your OWN files (Blender renders, code output): never recorded, never licensed ──────────────────────────────────────────── */
export const OWN_VIDEO = ['.mp4', '.mov', '.m4v', '.webm'];
export const OWN_IMAGE = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
const ABSOLUTE = /^([a-zA-Z]:|[\\/])/;
// the wording-level checks that need no disk: a string, not absolute, no ".." step. Returns the reason or null.
export function ownPathProblem(p, { allowAbsolute = false } = {}) {
  if (typeof p !== 'string' || !p.trim()) return 'the path must be a non-empty text';
  if (!allowAbsolute && (path.isAbsolute(p) || ABSOLUTE.test(p))) return `"${p}" is an absolute path; give it relative to the reel folder or to brand/library/`;
  if (p.split(/[\\/]+/).includes('..')) return `"${p}" has a ".." step; a path may not climb out of its folder`;
  return null;
}
// the real file for an own path: relative to the reel folder first, then to <brand>/brand/library/; it must exist, have one of `exts`, and its REAL path
// (symlinks followed) must stay inside the brand folder (or the reel folder when the reel is not in a brand). Throws a plain-words reason.
export function resolveOwnFile(brand, reelDir, p, { where = 'the reel', exts = null, allowAbsolute = false } = {}) {
  const bad = ownPathProblem(p, { allowAbsolute });
  if (bad) throw new Error(`${where}: ${bad}`);
  const root = fs.realpathSync.native(brand || reelDir);
  const tries = allowAbsolute && (path.isAbsolute(p) || ABSOLUTE.test(p)) ? [path.resolve(p)]
    : [path.resolve(reelDir, p), ...(brand ? [path.resolve(brand, 'brand', 'library', p)] : []), ...(allowAbsolute ? [path.resolve(brand || reelDir, p)] : [])];
  const found = tries.find((f) => { try { return fs.statSync(f).isFile(); } catch { return false; } });
  if (!found) throw new Error(`${where}: your file "${p}" does not exist (looked in the reel folder${brand ? ' and brand/library/' : ''}); render or copy it there first`);
  const real = fs.realpathSync.native(found);
  if (!inside(root, real)) throw new Error(`${where}: "${p}" resolves outside the brand folder (${brand ? 'a link or path that leaves it' : 'the reel folder'}); refused. Copy the file inside the brand folder`);
  const ext = path.extname(real).toLowerCase();
  if (exts && !exts.includes(ext)) throw new Error(`${where}: "${p}" is a ${ext || 'file without an extension'}, but one of ${exts.join(' ')} is needed here`);
  return real;
}

/* ── generated assets: the on-screen label ──────────────────────────────────────────────────────────────────────────────── */
const fold = (t) => String(t).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const strings = (v, out = []) => { if (typeof v === 'string') out.push(v); else if (Array.isArray(v)) v.forEach((x) => strings(x, out)); else if (v && typeof v === 'object') Object.values(v).forEach((x) => strings(x, out)); return out; };
// the text the reel shows: build/on_screen_text.txt when the engine wrote it, else every text in the props of the drawn scenes in scenes.json (a clip scene draws no props); null when neither can be read
export function onScreenText(reelDir) {
  try { return { text: fs.readFileSync(path.join(reelDir, 'build', 'on_screen_text.txt'), 'utf8'), source: 'build/on_screen_text.txt' }; } catch { /* not rendered yet */ }
  const raw = readJSON(path.join(reelDir, 'scenes.json'), null);
  const list = Array.isArray(raw) ? raw : raw && Array.isArray(raw.scenes) ? raw.scenes : null;
  if (!list) return null;
  return { text: list.flatMap((sc) => (sc && !sc.clip ? strings(sc.props) : [])).join('\n'), source: 'the scene props in scenes.json' };
}
// for the generated assets a reel uses: { problems: [line], skipped: [line], pass: [line] }
export function labelCheck(reelDir, used) {
  const res = { problems: [], skipped: [], pass: [] }, gens = used.filter(isGenerated);
  if (!gens.length) return res;
  let seen;
  for (const a of gens) {
    const label = String(a.onscreen_label || '').trim();
    if (!label) {
      if (String(a.no_label_reason || '').trim()) res.pass.push(`PASS: ${a.id} is ${a.type} made with ${a.tool || 'an unnamed tool'}, recorded without an on-screen label (${a.no_label_reason})`);
      else res.problems.push(`FAIL: ${a.id} is ${a.type} with no on-screen label and no recorded reason (re-add it with --onscreen-label "text" or --no-label "reason")`);
      continue;
    }
    if (seen === undefined) seen = onScreenText(reelDir);
    if (!seen) { res.skipped.push(`SKIPPED: the label "${label}" for ${a.id} was NOT checked: no build/on_screen_text.txt and no readable scenes.json (render the reel, then check again)`); continue; }
    if (fold(seen.text).includes(fold(label))) res.pass.push(`PASS: ${a.id} (${a.type}, made with ${a.tool || 'an unnamed tool'}) shows its label "${label}" on screen (read from ${seen.source})`);
    else res.problems.push(`FAIL: ${a.id} is ${a.type}${a.tool ? ` made with ${a.tool}` : ''} and the reel must show the text "${label}" on screen, but it is not in ${seen.source}. Add it to a scene's text`);
  }
  return res;
}

/* ── check ───────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
function checkOne(brand, a, where, wantType) {
  const tag = `${a.id}${where ? ` (${where})` : ''}`;
  const want = wantType ? [].concat(wantType) : null;
  if (want && !want.includes(a.type)) return { ok: false, line: `FAIL: ${tag} is a ${a.type}, but a ${want.join(' or ')} is needed here` };
  const f = assetFile(brand, a);
  if (!a.file || !inside(licensedDir(brand), f)) return { ok: false, line: `FAIL: ${tag} points outside brand/licensed/ (${a.file || 'no file'})` };
  if (!fs.existsSync(f)) return { ok: false, line: `FAIL: ${tag} file is missing: ${a.file}` };
  if (!a.sha256) return { ok: false, line: `FAIL: ${tag} has no recorded SHA-256` };
  const now = sha256File(f);
  if (now !== a.sha256) return { ok: false, line: `FAIL: ${tag} changed since it was recorded (${a.file}: recorded ${a.sha256.slice(0, 12)}, now ${now.slice(0, 12)})` };
  return { ok: true, line: `PASS: ${tag} ${a.type} "${a.title}" ${a.source}${a.licence ? `, ${a.licence}` : ''}, hash ${now.slice(0, 12)} matches` };
}

export function checkAssets(brand, reelDir = null) {
  const lines = [], used = [];
  let labels = { problems: [], skipped: [], pass: [] };
  let ok = true;
  const reg = loadRegistry(brand);
  if (reelDir) {
    const refs = referencedAssets(reelDir);
    if (!refs.length) return { ok: true, lines: ['PASS: this reel uses no licensed assets'], used };
    for (const r of refs) {
      const a = reg.assets.find((x) => x.id === r.id);
      if (!a) { ok = false; lines.push(`FAIL: ${r.id} (${r.where}) is not in brand/licensed/assets.json`); continue; }
      const res = checkOne(brand, a, r.where, r.type);
      if (!res.ok) ok = false;
      lines.push(res.line);
      if (!used.some((u) => u.id === a.id)) used.push(a);
    }
    labels = labelCheck(reelDir, used);
    if (labels.problems.length) ok = false;
    lines.push(...labels.pass, ...labels.problems, ...labels.skipped);
  } else {
    if (!reg.assets.length) return { ok: true, lines: ['PASS: no licensed assets recorded'], used };
    for (const a of reg.assets) { const res = checkOne(brand, a, '', null); if (!res.ok) ok = false; lines.push(res.line); }
  }
  return { ok, lines, used, labelProblems: labels.problems, labelSkipped: labels.skipped };
}

// "Licensed assets" lines for approvals.md (Gate C): who made it, where it came from, under what plan, the credit text; a generated asset also says which tool
// made it and which label the reel shows (or why it has none)
export function creditLines(used) {
  return used.map((a) => {
    const from = [a.source, a.plan ? `${a.plan} plan` : '', a.licence, a.url].filter(Boolean).join(', ');
    const gen = isGenerated(a) ? ` [generated with ${a.tool || 'an unnamed tool'}; ${a.onscreen_label ? `on-screen label "${a.onscreen_label}"` : `no on-screen label: ${a.no_label_reason || 'none recorded'}`}]` : '';
    return `${a.id}: "${a.title}"${a.artist ? ` by ${a.artist}` : ''}${from ? ` (${from})` : ''}${a.credit ? ` credit: ${a.credit}` : ''}${gen}`;
  });
}

/* ── the colour grade for kit export ────────────────────────────────────────────────────────────────────────────────────── */
// escape a path for use inside an ffmpeg filter argument
export const ffPath = (p) => p.split(path.sep).join('/').replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
// reel.json "look": {"lut": "<id>", "strength": 0-1}  ->  { filter (a filter_complex on [0:v] giving [v]), note } or null when no LUT is asked for
export function gradeFor(reelDir, cfg, brand) {
  const look = cfg && cfg.look;
  if (!look || look.lut == null) return null;
  const strength = look.strength == null ? 1 : Number(look.strength);
  if (!Number.isFinite(strength) || strength < 0 || strength > 1) throw new Error(`reel.json look.strength must be a number from 0 to 1 (got ${JSON.stringify(look.strength)})`);
  const { asset, file } = resolveAsset(brand, String(look.lut), 'lut', 'reel.json look.lut');
  const bad = validateCube(file);
  if (bad) throw new Error(`look.lut "${asset.id}": ${bad}`);
  const sha = sha256File(file);
  if (sha !== asset.sha256) throw new Error(`look.lut "${asset.id}" changed since it was recorded (kit licensed check)`);
  const lut = `lut3d=file='${ffPath(file)}':interp=tetrahedral`;
  const filter = strength >= 1 ? `[0:v]${lut}[v]` : `[0:v]split[a][b];[b]${lut}[g];[a][g]blend=all_expr='A*(1-${strength})+B*${strength}'[v]`;
  const slot = path.join(brand || '', 'scripts', 'fx', 'look.cube');
  const note = `grade: licensed LUT "${asset.id}" at strength ${strength}` + (brand && fs.existsSync(slot) ? ' (it wins over the brand\'s scripts/fx/look.cube slot, which is not used for this reel)' : '');
  return { filter, note, asset };
}

/* ── command line ───────────────────────────────────────────────────────────────────────────────────────────────────────── */
const COLS = (a) => `${a.id.padEnd(22)} ${a.type.padEnd(15)} ${a.title}${a.artist ? ` by ${a.artist}` : ''}  [${a.source || 'no source'}, ${a.downloaded}]` +
  (isGenerated(a) ? `  [generated with ${a.tool || '?'}; ${a.onscreen_label ? `label "${a.onscreen_label}"` : `no label: ${a.no_label_reason || 'none recorded'}`}]` : '');

// action, positional words, flags (as kit.mjs parses them) -> prints and returns the exit code
export function cli(action, loose, flags, cwd = process.cwd()) {
  const text = (n) => (typeof flags[n] === 'string' ? flags[n] : undefined);
  const reelArg = action === 'check' ? loose[0] : null;
  return run(reelArg ? resolveReelArg(reelArg, cwd) : null);

  function run(reel) {
    const brand = text('brand') ? path.resolve(text('brand')) : findBrand(reel || cwd);
    if (!brand && action === 'check' && reel && !referencedAssets(reel).length) {   // the engine on its own: a reel with no licensed asset has nothing to check
      if (flags.json) console.log(JSON.stringify({ ok: true, lines: ['PASS: this reel uses no licensed assets'], credits: [] })); else console.log('PASS: this reel uses no licensed assets\nLICENSED: PASS');
      return 0;
    }
    if (!brand) { console.error('kit licensed: no brand folder found here (a folder holding brand/brand.json). Open Claude Code in the brand folder, or add --brand <folder>.'); return 1; }
    try {
      if (action === 'add') {
        const { asset, warn } = addAsset(brand, { file: loose[0], type: text('type'), title: text('title'), artist: text('artist'), url: text('url'), channels: text('channels'),
          credit: text('credit'), id: text('id'), notes: text('notes'), licence: text('licence') ?? text('license'), plan: text('plan'), source: text('source'), move: Boolean(flags.move),
          tool: text('tool'), prompt: text('prompt'), onscreenLabel: text('onscreen-label') ?? undefined, noLabel: 'no-label' in flags ? flags['no-label'] : undefined });
        console.log(`recorded ${asset.id} (${asset.type}) in brand/licensed/assets.json, file ${asset.file}, sha256 ${asset.sha256.slice(0, 12)}`);
        for (const w of warn) console.log(`note: ${w}`);
        return 0;
      }
      if (action === 'list') {
        const rows = listAssets(brand, text('type'));
        if (!rows.length) console.log('no licensed assets recorded' + (text('type') ? ` for type ${text('type')}` : '') + ' (download one, then: kit licensed add <file> --type ... --title ...)');
        for (const a of rows) console.log(COLS(a));
        return 0;
      }
      if (action === 'remove') {
        if (!loose[0]) throw new Error('which asset? kit licensed remove <id>');
        const r = removeAsset(brand, loose[0], { keepFile: Boolean(flags['keep-file']) });
        console.log(`removed ${r.asset.id} from the registry (${r.note})`);
        return 0;
      }
      if (action === 'check') {
        const res = checkAssets(brand, reel);
        if (flags.json) { console.log(JSON.stringify({ ok: res.ok, lines: res.lines, credits: creditLines(res.used), label_problems: res.labelProblems || [], label_skipped: res.labelSkipped || [] })); return res.ok ? 0 : 1; }
        for (const l of res.lines) console.log(l);
        const bad = res.lines.filter((l) => l.startsWith('FAIL')).length;
        console.log(res.ok ? 'LICENSED: PASS' : `LICENSED: FAIL (${bad} problem${bad === 1 ? '' : 's'}; fix them, then kit licensed check ${reelArg || ''})`.trim());
        return res.ok ? 0 : 1;
      }
      throw new Error(`kit licensed takes add, list, check or remove (not "${action ?? ''}")`);
    } catch (e) { console.error(`kit licensed: ${e.message}`); return 1; }
  }
}

if (process.argv[1] && (() => { try { return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } })()) {   // realpath: a linked engine install is a symlink
  // direct use (gate.py calls it): node licensed.mjs check <reel>
  const argv = process.argv.slice(2), flags = {}, loose = [];
  for (let i = 1; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) { loose.push(argv[i]); continue; }
    const next = argv[i + 1], takes = next !== undefined && !next.startsWith('--');
    flags[argv[i].slice(2)] = takes ? next : true; if (takes) i++;
  }
  process.exitCode = await cli(argv[0], loose, flags);
}
