#!/usr/bin/env node
// licensed.mjs · the brand's licensed-assets registry (music, sound effects, stock video, motion graphics, LUTs from any source; we suggest Uppbeat) and what
// a reel may use from it. The kit ships only this mechanism, never an asset: the owner downloads by hand from any site (Uppbeat is what we use; there is
// no API) and records each download here with `kit licensed add`.
//
//   kit licensed add <file> --type music|sfx|stock-video|motion-graphic|lut --title "..." [--artist ..] [--url ..]
//                          [--channels a,b] [--credit "..."] [--id slug] [--notes ..] [--licence ..] [--plan business] [--move]
//   kit licensed list [--type T]
//   kit licensed check [<reel>]         every asset the reel references exists in the registry, sits inside brand/licensed/,
//                                       and still has its recorded SHA-256; PASS/FAIL lines, exit 1 on any FAIL
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

export const TYPES = ['music', 'sfx', 'stock-video', 'motion-graphic', 'lut'];
const EXT = {
  music: ['.wav', '.mp3', '.m4a', '.flac', '.aiff', '.aif', '.ogg'],
  sfx: ['.wav', '.mp3', '.m4a', '.flac', '.aiff', '.aif', '.ogg'],
  'stock-video': ['.mp4', '.mov', '.m4v', '.webm'],
  'motion-graphic': ['.mov', '.webm', '.mp4', '.png', '.gif', '.webp', '.jpg', '.jpeg'],
  lut: ['.cube'],
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
  reg.assets.push(asset);
  saveRegistry(brand, reg);
  const warn = [];
  if (o.type === 'music' && ext !== '.wav') warn.push('music is best as WAV: choose WAV when downloading if the site offers it (an MP3 works but is lossier)');
  if (!asset.url) warn.push('no --url: record the page you got it from so the licence can be shown later; add --source and --plan too');
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
// [{id, where, type}] from reel.json ("look.lut", "music": [{asset}]) and scenes.json (a scene's "clip" and "overlay")
export function referencedAssets(reelDir) {
  const out = [], cfg = readJSON(path.join(reelDir, 'reel.json'), {}) || {};
  if (cfg.look && typeof cfg.look === 'object' && cfg.look.lut != null) out.push({ id: String(cfg.look.lut), where: 'reel.json look.lut', type: 'lut' });
  if (Array.isArray(cfg.music)) cfg.music.forEach((m, i) => { if (m && m.asset != null) out.push({ id: String(m.asset), where: `reel.json music[${i + 1}]`, type: 'music' }); });
  const raw = readJSON(path.join(reelDir, 'scenes.json'), null);
  const list = Array.isArray(raw) ? raw : raw && Array.isArray(raw.scenes) ? raw.scenes : [];
  list.forEach((s, i) => {
    if (s && s.clip && s.clip.asset != null) out.push({ id: String(s.clip.asset), where: `scene ${i + 1} clip`, type: 'stock-video' });
    if (s && s.overlay && s.overlay.asset != null) out.push({ id: String(s.overlay.asset), where: `scene ${i + 1} overlay`, type: 'motion-graphic' });
  });
  return out;
}

// the asset (registry entry + file) a reel may use for a purpose; throws a plain-words reason when it may not
export function resolveAsset(brand, id, type, where = 'the reel') {
  if (!brand) throw new Error(`${where} uses licensed asset "${id}" but this reel is not inside a brand folder (no brand/brand.json above it)`);
  const a = findAsset(brand, id);
  if (!a) throw new Error(`${where}: no licensed asset "${id}" in brand/licensed/assets.json (record it: kit licensed add <file> --type ${type} --title ...)`);
  if (a.type !== type) throw new Error(`${where}: asset "${id}" is a ${a.type}, but a ${type} is needed here`);
  const f = assetFile(brand, a);
  if (!inside(licensedDir(brand), f)) throw new Error(`${where}: asset "${id}" points outside brand/licensed/ (${a.file}); refused`);
  if (!fs.existsSync(f)) throw new Error(`${where}: the file of asset "${id}" is missing (${a.file}); download it again and re-add it`);
  return { asset: a, file: f };
}

/* ── check ───────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
function checkOne(brand, a, where, wantType) {
  const tag = `${a.id}${where ? ` (${where})` : ''}`;
  if (wantType && a.type !== wantType) return { ok: false, line: `FAIL: ${tag} is a ${a.type}, but a ${wantType} is needed here` };
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
  } else {
    if (!reg.assets.length) return { ok: true, lines: ['PASS: no licensed assets recorded'], used };
    for (const a of reg.assets) { const res = checkOne(brand, a, '', null); if (!res.ok) ok = false; lines.push(res.line); }
  }
  return { ok, lines, used };
}

// "Licensed assets" lines for approvals.md (Gate C): who made it, where it came from, under what plan, the credit text
export function creditLines(used) {
  return used.map((a) => { const from = [a.source, a.plan ? `${a.plan} plan` : '', a.licence, a.url].filter(Boolean).join(', '); return `${a.id}: "${a.title}"${a.artist ? ` by ${a.artist}` : ''}${from ? ` (${from})` : ''}${a.credit ? ` credit: ${a.credit}` : ''}`; });
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
const COLS = (a) => `${a.id.padEnd(22)} ${a.type.padEnd(14)} ${a.title}${a.artist ? ` by ${a.artist}` : ''}  [${a.source}, ${a.downloaded}]`;

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
          credit: text('credit'), id: text('id'), notes: text('notes'), licence: text('licence') ?? text('license'), plan: text('plan'), source: text('source'), move: Boolean(flags.move) });
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
        if (flags.json) { console.log(JSON.stringify({ ok: res.ok, lines: res.lines, credits: creditLines(res.used) })); return res.ok ? 0 : 1; }
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
