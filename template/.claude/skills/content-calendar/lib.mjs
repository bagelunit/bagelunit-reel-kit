// The content calendar's model: reads one brand folder and works out where every reel stands, what needs the
// owner, the numbers and the trends. calendar.mjs draws it, telegram.mjs sends a summary of it, instagram.mjs
// adds the account's own numbers to it. Reading only: nothing here writes, posts or sends.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { loadCompetitors } from './competitors-model.mjs';

/* ── files and settings ────────────────────────────────────────────────────────────────────────────────────── */
export const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } };
// an object fallback means the caller wants an object: a file holding null, a list or a number gives the fallback
export const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
export const readJSON = (p, fallback = {}) => { try { const v = JSON.parse(fs.readFileSync(p, 'utf8')); return isObj(fallback) && !isObj(v) ? fallback : v; } catch { return fallback; } };
const asObj = (v) => (isObj(v) ? v : null);
const objs = (v) => (Array.isArray(v) ? v.filter(isObj) : []);          // a list of records, with anything broken left out
const str = (v) => (v == null ? '' : typeof v === 'object' ? '' : String(v));
export const CONFIG_DIR = path.join(os.homedir(), '.config', 'bagelunit-reels');

export function findBrand(start) {
  for (let d = path.resolve(start || process.cwd()); ; d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, 'brand', 'brand.json'))) return d;
    if (path.dirname(d) === d) return null;
  }
}
export function brandRoot(arg) {
  const root = findBrand(arg);
  if (!root) { console.error('No brand folder here (looked for brand/brand.json). Run it inside your <brand>-reels folder.'); process.exit(1); }
  return root;
}
export const brandSlug = (root, brand = readJSON(path.join(root, 'brand', 'brand.json'))) =>
  String((isObj(brand) && (str(brand.slug) || str(brand.name))) || path.basename(root).replace(/-reels$/, '')).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'brand';

// a per-brand secret file the owner writes: <name>-<slug>.json first, then <name>.json (shared by every brand)
export function secretFile(name, slug) {
  for (const f of [path.join(CONFIG_DIR, `${name}-${slug}.json`), path.join(CONFIG_DIR, `${name}.json`)]) if (fs.existsSync(f)) return f;
  return null;
}
// write a file in one step (a temp file, then a rename), so a hook running at the same time never reads half of it.
// The temp file is hidden and ends in .tmp, so the live server's watcher (serve.mjs) skips it.
export function writeAtomic(file, data, mode) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  try { fs.writeFileSync(tmp, data, mode ? { mode } : undefined); fs.renameSync(tmp, file); }
  catch (e) { fs.rmSync(tmp, { force: true }); throw e; }
}
export function writeSecret(file, data) {                       // keep it readable by this user only
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  writeAtomic(file, JSON.stringify(data, null, 2) + '\n', 0o600);
  try { fs.chmodSync(file, 0o600); } catch {}
}
// Account ids (ig_user_id, user_id) belong to ONE brand. A brand's own <name>-<slug>.json may hold them; the shared
// <name>.json never does (one Unified Login token can cover several brands' accounts), so for a shared token they live
// in <name>-<slug>.ids.json. An id found in a shared file is ignored: it may be another brand's.
export const isShared = (file, name) => path.basename(file) === `${name}.json`;
export const idsFile = (name, slug) => path.join(CONFIG_DIR, `${name}-${slug}.ids.json`);
export function brandId(name, slug, file, cfg, key) {
  if (!isShared(file, name)) return cfg[key] ? String(cfg[key]) : '';
  const v = readJSON(idsFile(name, slug), {})?.[key];
  return v ? String(v) : '';
}
export function saveBrandId(name, slug, file, cfg, key, value) {
  value = String(value);
  if (!isShared(file, name)) { if (cfg[key] !== value) { cfg[key] = value; writeSecret(file, cfg); } return file; }
  const f = idsFile(name, slug), ids = readJSON(f, {}) || {};
  if (ids[key] !== value) { ids[key] = value; writeSecret(f, ids); }
  return f;
}
// every brand folder on this computer that has drawn a dashboard, for the all-brands overview (overview.mjs)
export const REGISTRY = path.join(CONFIG_DIR, 'brands.json');
const ARCHIVED = /(^|[\\/])_do-not-read([\\/]|$)/i;   // archived folders are never read or listed
export function registerBrand(root, name) {
  if (ARCHIVED.test(root)) return;
  try {
    const reg = readJSON(REGISTRY, { brands: [] });
    const list = (Array.isArray(reg.brands) ? reg.brands : []).filter((b) => b && b.root !== root);
    list.push({ root, name: name || path.basename(root), seen: new Date().toISOString() });
    writeAtomic(REGISTRY, JSON.stringify({ brands: list.filter((b) => !ARCHIVED.test(b.root)) }, null, 2) + '\n');
  } catch {}
}
export function statusFile(root) { return path.join(root, '.cache', 'refresh-status.json'); }
// the upload's own status lives apart, so writing it never counts as a change that triggers another upload
const hostStatusFile = (root) => path.join(root, '.cache', 'host-status.json');
export function writeStatus(root, part, value) {
  const f = part === 'host' ? hostStatusFile(root) : statusFile(root);
  const s = readJSON(f, {});
  s[part] = { ...value, at: new Date().toISOString() };
  writeAtomic(f, JSON.stringify(s, null, 2) + '\n');
}
export const readStatus = (root) => ({ ...readJSON(statusFile(root), {}), ...readJSON(hostStatusFile(root), {}) });

/* ── small parsers ─────────────────────────────────────────────────────────────────────────────────────────── */
const norm = (s) => String(s || '').toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
export function mdTable(text) {                                  // the first markdown table -> rows keyed by normalised header
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.startsWith('|'));
  if (lines.length < 2) return [];
  const cells = (l) => l.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
  const head = cells(lines[0]).map(norm);
  return lines.slice(1).filter((l) => !/^\|[\s:|-]+\|?$/.test(l)).map(cells)
    .filter((c) => c.some((x) => x && !/^[-:]+$/.test(x)))
    .map((c) => Object.fromEntries(head.map((h, i) => [h, c[i] || ''])));
}
const pick = (row, ...names) => { for (const n of names) { const k = Object.keys(row).find((h) => h === n || h.startsWith(n)); if (k && row[k]) return row[k]; } return ''; };
export function csv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head = [], ...body] = rows.filter((r) => r.some((x) => x.trim()));
  return { head: head.map((h) => h.trim().toLowerCase()), rows: body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim().toLowerCase(), (r[i] || '').trim()]))) };
}
function sections(text) {                                        // "## Heading" -> body text
  const out = {}; let cur = null;
  for (const line of text.split(/\r?\n/)) {
    const h = line.match(/^##\s+(.+?)\s*$/);
    if (h) { cur = h[1].trim(); out[cur] = out[cur] || ''; } else if (cur) out[cur] += line + '\n';
  }
  return out;
}
export const num = (v) => {                                      // 1,234 · 18.4K · 2.1M · 41% · 9.4s -> number
  const s = String(v ?? '').trim().replace(/,/g, '');
  const m = s.match(/^(-?\d+(?:\.\d+)?)\s*([kKmM]?)/);
  if (!m) return null;
  return Number(m[1]) * (m[2].toLowerCase() === 'k' ? 1e3 : m[2].toLowerCase() === 'm' ? 1e6 : 1);
};
const fraction = (v) => { const n = num(v); return n == null ? null : (String(v).includes('%') || n > 1) ? n / 100 : n; };
export const median = (xs) => { const s = xs.filter((x) => x != null && Number.isFinite(x)).sort((a, b) => a - b); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const shaCache = { file: null, data: {} };
const cachedPath = (k) => k.split('|').slice(0, -2).join('|');   // keys are <file>|<size>|<change time>
const saveShaCache = () => { if (shaCache.file) { try { writeAtomic(shaCache.file, JSON.stringify(shaCache.data)); } catch {} } };
function sha12(file) {                                           // cached by size and change time, so redraws stay fast
  const st = fs.statSync(file);
  if (!st.isFile()) return null;                                 // a folder or something else: not a file that can match
  const k = `${file}|${st.size}|${st.mtimeMs}`;
  if (shaCache.data[k]) return shaCache.data[k];
  const v = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 12);
  for (const old of Object.keys(shaCache.data)) if (cachedPath(old) === file) delete shaCache.data[old];   // the file's older versions
  shaCache.data[k] = v;
  saveShaCache();                                                // saved at once, so a stopped hook never hashes it again
  return v;
}
// drop cached hashes for files that are gone, so the cache does not grow for ever
function pruneShaCache() {
  const gone = Object.keys(shaCache.data).filter((k) => { try { return !fs.statSync(cachedPath(k)).isFile(); } catch { return true; } });
  for (const k of gone) delete shaCache.data[k];
  if (gone.length) saveShaCache();
}
const firstLine = (text) => (text.split(/\r?\n/).map((l) => l.trim()).find((l) => l && !l.startsWith('#')) || '').replace(/^[-*>\d.\s]+/, '');
// a real calendar day written YYYY-MM-DD (2030-02-30 is not one)
export const validDay = (s) => { const m = String(s ?? '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/); if (!m) return false; const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3]; };
export const clip = (s, n = 90) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; };
const capKey = (s) => norm(s).slice(0, 48);
const cleanLink = (u) => String(u || '').replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase();
const mtime = (p) => { try { return fs.statSync(p).mtime; } catch { return null; } };

export const fmt = (n) => n == null ? '–' : Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : Math.abs(n) >= 1e4 ? `${Math.round(n / 1e3)}K` : Math.abs(n) >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(Math.round(n));
export const pct = (x) => x == null ? '–' : `${(x * 100).toFixed(1)}%`;
export const signed = (n) => n == null ? '' : `${n >= 0 ? '+' : ''}${fmt(n)}`;

export const STAGES = [
  ['idea', 'Idea'], ['script', 'Script written'], ['a', 'Script approved'], ['b', 'Visual plan approved'],
  ['c', 'Final approved'], ['scheduled', 'Scheduled'], ['posted', 'Posted'],
];
export const STAGE_INDEX = Object.fromEntries(STAGES.map(([k], i) => [k, i]));
export const stageName = (k) => STAGES[STAGE_INDEX[k]][1];
export const NEXT = {
  idea: 'start it: /bagelunit-reels with this topic', script: 'needs your yes on the script (Gate A)', a: 'needs your yes on the visual plan (Gate B)',
  b: 'being built; needs your yes on the final (Gate C)', c: 'approved: post it or schedule it with /reel-posting', scheduled: '', posted: '',
};

// open posting times in a few words: "09:00, 13:00" or, for many a day, "09:00, 09:45, 10:30 and 17 more"
export const timesText = (list, max = 4) => (list.length > max + 1 ? `${list.slice(0, max).join(', ')} and ${list.length - max} more` : list.join(', '));
// open slots grouped by day: [[day, [times]], ...] in date order
export const slotsByDay = (slots) => Object.entries(slots.reduce((m, x) => ((m[x.key] ||= []).push(x.time), m), {}));

// one reel's numbers, from an insights.csv row or from the Instagram API, in the same shape
function numsFromRow(r) {
  return { views: num(r.views ?? r.plays), reach: num(r.reach), likes: num(r.likes), comments: num(r.comments), saves: num(r.saves ?? r.saved),
    shares: num(r.shares), follows: num(r.follows), watch: num(r.avg_watch_time_s ?? r['avg watch time']), skip: fraction(r.skip_rate), source: 'insights.csv' };
}
export function numsFromMedia(m) {
  const x = m.insights || {};
  return { views: x.views ?? null, reach: x.reach ?? null, likes: x.likes ?? m.like_count ?? null, comments: x.comments ?? m.comments_count ?? null,
    saves: x.saved ?? null, shares: x.shares ?? null, follows: null, interactions: x.total_interactions ?? null,
    watch: x.ig_reels_avg_watch_time != null ? x.ig_reels_avg_watch_time / 1000 : null,
    skip: x.reels_skip_rate != null ? fraction(x.reels_skip_rate) : null, source: 'Instagram' };
}
export const engaged = (n) => n.interactions ?? ['likes', 'comments', 'saves', 'shares'].reduce((t, k) => t + (n[k] || 0), 0);
export const rate = (n) => { const base = n.reach || n.views; return base ? engaged(n) / base : null; };

/* ── the model ─────────────────────────────────────────────────────────────────────────────────────────────── */
export function load(root, { today: todayArg, days = 28 } = {}) {
  const brand = readJSON(path.join(root, 'brand', 'brand.json'));
  const slug = brandSlug(root, brand);
  const TZ = (() => { const tz = str(brand.posting?.timezone); try { if (tz) { new Intl.DateTimeFormat('en', { timeZone: tz }); return tz; } } catch {} return Intl.DateTimeFormat().resolvedOptions().timeZone; })();

  // dates, always in the brand's timezone
  const fmtParts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const partsIn = (date) => Object.fromEntries(fmtParts.formatToParts(date).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
  const dayKey = (date) => { const p = partsIn(date); return `${p.year}-${p.month}-${p.day}`; };
  const timeOf = (date) => { const p = partsIn(date); return `${p.hour}:${p.minute}`; };
  const zoned = (y, m, d, h = 0, mi = 0) => {                     // a wall-clock time there; corrected twice for clock changes
    const want = Date.UTC(y, m - 1, d, h, mi);
    const off = (t) => { const p = partsIn(new Date(t)); return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - t; };
    let t = want - off(want);
    t = want - off(t);
    // a time the clocks skip (02:30 on the night they go forward) moves forward by the jump: 02:30 becomes 03:30
    if (t + off(t) !== want) t = want - Math.min(off(t - 3 * 36e5), off(t + 3 * 36e5));
    return new Date(t);
  };
  const parseWhen = (text) => {
    if (!text) return null;
    const s = String(text).trim();
    if (/\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(s)) { const d = new Date(s.replace(/([+-]\d{2})(\d{2})$/, '$1:$2')); return isNaN(d) ? null : d; }
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?/);
    return m ? zoned(+m[1], +m[2], +m[3], m[4] ? +m[4] : 12, m[5] ? +m[5] : 0) : null;
  };
  const hasTime = (text) => /\d{1,2}:\d{2}/.test(String(text || ''));
  const addDays = (key, n) => { const [y, m, d] = key.split('-').map(Number); return dayKey(zoned(y, m, d + n, 12)); };
  const weekday = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
  const pretty = (key, opts = { weekday: 'short', month: 'short', day: 'numeric' }) => { const [y, m, d] = key.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' }); };
  const weekStart = (key) => addDays(key, -((weekday(key) + 6) % 7));     // Monday

  const now = todayArg ? validDay(todayArg) && parseWhen(todayArg) : new Date();
  if (!now) throw new Error(`--today must be a real date like 2030-01-06 (got "${todayArg}").`);
  const today = dayKey(now);
  const last = addDays(today, days - 1);
  const WD = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const posting = asObj(brand.posting) || {};
  const rawDays = Array.isArray(posting.days) ? posting.days : typeof posting.days === 'string' ? posting.days.split(/[\s,]+/) : [];
  const postDays = rawDays.map((d) => str(d).slice(0, 3).toLowerCase()).filter((d) => WD.includes(d));
  // the posting times, zero-padded (9:30 becomes 09:30) so the day view can read their hours. posting.times is a list
  // (["09:00", "13:00", "19:00"], any number a day); the older posting.time holds one time. Either may be "09:00, 13:00".
  const normTime = (t) => { const m = String(t ?? '').trim().match(/^(\d{1,2}):(\d{2})$/); return m && +m[1] < 24 && +m[2] < 60 ? `${m[1].padStart(2, '0')}:${m[2]}` : ''; };
  const timeList = (v) => (Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[\s,;]+/) : []).map(normTime).filter(Boolean);
  const postTimes = [...new Set(timeList(posting.times).length ? timeList(posting.times) : timeList(posting.time))].sort();
  const postTime = postTimes[0] || '';                                 // the first one, for anything that shows a single time
  const isPostDay = (key) => postDays.includes(WD[weekday(key)]);

  // the brand's files
  const plan = mdTable(read(path.join(root, 'brand', 'plan.md'))).map((r) => ({
    date: pick(r, 'date', 'day', 'when'), topic: pick(r, 'topic', 'idea', 'title'), goal: pick(r, 'goal'), angle: pick(r, 'angle'),
    folder: pick(r, 'reel', 'folder', 'slug').replace(/^reels\//, '').replace(/[`/]/g, ''), notes: pick(r, 'notes'), series: pick(r, 'series'),
  }));
  const log = mdTable(read(path.join(root, 'brand', 'log.md'))).map((r) => ({
    date: pick(r, 'date'), folder: pick(r, 'reel', 'folder').replace(/^reels\//, '').replace(/[`/]/g, ''), hook: pick(r, 'hook'),
    first: pick(r, 'first line'), goal: pick(r, 'goal'), angle: pick(r, 'angle'), verdict: pick(r, 'review', 'verdict'),
  })).filter((r) => r.folder || r.date);
  const insights = csv(read(path.join(root, 'brand', 'insights.csv')));
  const ig = asObj(readJSON(path.join(root, 'brand', 'instagram.json'), null));
  const followerRows = csv(read(path.join(root, 'brand', 'followers.csv'))).rows
    .map((r) => ({ key: r.date, followers: num(r.followers) })).filter((r) => r.key && r.followers != null).sort((a, b) => a.key.localeCompare(b.key));
  const status = readStatus(root);

  // every reel folder
  shaCache.file = path.join(root, '.cache', 'sha-cache.json');
  shaCache.data = readJSON(shaCache.file, {});
  pruneShaCache();
  const reelsDir = path.join(root, 'reels');
  const folders = fs.existsSync(reelsDir) ? fs.readdirSync(reelsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('_') && !e.name.startsWith('.')).map((e) => e.name) : [];
  const items = folders.map((name) => {
    const dir = path.join(reelsDir, name);
    const cfg = readJSON(path.join(dir, 'reel.json'));
    const approvals = read(path.join(dir, 'approvals.md'));
    const sec = sections(approvals);
    const passed = (g) => Object.entries(sec).some(([h, body]) => new RegExp(`^Gate ${g}\\b`, 'i').test(h) && /\S/.test(body));
    const script = read(path.join(dir, 'script.txt'));
    const it = { slug: name, name: str(cfg.name) || name, dir, titleFromName: !str(cfg.title), title: clip(str(cfg.title) || name.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase())),
      hook: clip(firstLine(script)), caption: read(path.join(dir, 'out', 'caption.txt')), scriptAt: mtime(path.join(dir, 'script.txt')) };
    const gc = [...approvals.matchAll(/^- File: (.+?) \| sha256: ([0-9a-f]{12})/gm)].pop();
    const postedAlready = /^\s*-.*\bposted\b/im.test(sec.Posting || '') || log.some((r) => r.folder === name);
    if (gc) {
      const file = path.join(dir, 'out', gc[1].trim());
      it.file = gc[1].trim();
      let sha = null; try { sha = sha12(file); } catch {}            // a missing file, a folder or an unreadable one has no fingerprint
      it.fileState = sha == null ? 'missing' : postedAlready ? 'posted' : sha === gc[2] ? 'match' : 'changed';
    }
    const gateAt = (g) => { const m = Object.entries(sec).find(([h]) => new RegExp(`^Gate ${g}\\b`, 'i').test(h)); const d = m && m[1].match(/(\d{4}-\d{2}-\d{2})/); return d ? parseWhen(d[1]) : null; };
    it.gateA = gateAt('A'); it.gateB = gateAt('B'); it.gateC = gateAt('C');
    it.series = str(cfg.series).trim();
    // when the reel started: the earliest date in its record, else when its folder was made
    const dates = [...approvals.matchAll(/(\d{4}-\d{2}-\d{2})/g)].map((m) => parseWhen(m[1])).filter(Boolean);
    let born = null; try { const st = fs.statSync(dir); born = st.birthtimeMs > 0 ? st.birthtime : st.ctime; } catch {}
    it.startedAt = [...dates, born].filter(Boolean).sort((a, b) => a - b)[0] || null;
    // what its voice cost: the engine's log of paid calls, or an estimate from the script's length
    const vlog = read(path.join(dir, 'build', 'voice-log.jsonl')).split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    const spoken = script.split(/\r?\n/).filter((l) => l.trim() && !/^\s*(#|\/\/|\[)/.test(l)).join(' ').replace(/\s+/g, ' ').trim().length;
    it.voice = vlog.length ? { chars: vlog.reduce((t, e) => t + (e.chars || 0), 0), calls: vlog.length, log: vlog.map((e) => ({ at: e.at, chars: e.chars, model: e.model })), estimated: false }
      : fs.existsSync(path.join(dir, 'audio', 'vo.mp3')) ? { chars: spoken, calls: 1, log: [], estimated: true } : null;
    // ## Posting lines: "- <stamp> Posted ...", "- <stamp> Scheduled ... for <time>", "- <stamp> Cancelled ..."
    it.links = {};
    for (const line of (sec.Posting || '').split(/\r?\n/).filter((l) => /^\s*-\s/.test(l))) {
      const fbLink = line.match(/https?:\/\/(?:www\.|m\.)?facebook\.com\/[^\s)]+/i)?.[0], thLink = line.match(/https?:\/\/(?:www\.)?threads\.(?:com|net)\/[^\s)]+/i)?.[0];
      if (fbLink) it.links.facebook = fbLink;
      if (thLink) it.links.threads = thLink;
      const plats = line.match(/\bplatforms?\s+([a-z, ]+?)(?:,\s*publisher|$)/i)?.[1];
      if (plats && /scheduled/i.test(line)) it.schedPlatforms = plats.split(/[\s,]+/).filter(Boolean);
      const stamp = line.match(/^\s*-\s*(\d{4}-\d{2}-\d{2}(?:[ T]\d{1,2}:\d{2})?)/)?.[1];
      const link = line.match(/https?:\/\/(?:www\.)?instagram\.com\/[^\s)]+/i)?.[0];
      if (link) it.permalink = link;
      if (/\btrial\b/i.test(line)) it.trial = true;
      if (/cancel/i.test(line)) { it.scheduledAt = null; it.scheduledVia = null; continue; }
      const elsewhere = /\b(tiktok|youtube|shorts|facebook|linkedin|threads|pinterest|twitter|x\.com)\b/i.test(line) && !/\binstagram\b|instagram\.com/i.test(line) && !/\bpublisher in\b/i.test(line);
      if (elsewhere) {                                           // a TikTok or Shorts post line, not the Instagram one
        if (/\bposted on (facebook|threads)\b/i.test(line) && !it.postedElsewhereAt) it.postedElsewhereAt = parseWhen(stamp);   // the publisher's line: posted there
        continue;
      }
      if (/\bposted\b/i.test(line) && !/\bnot posted\b/i.test(line)) {
        const at = line.match(/\b(?:on|at)\s+(\d{4}-\d{2}-\d{2}(?:[ T]\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?)/i)?.[1] || stamp;
        it.postedAt = parseWhen(at); it.postedHasTime = hasTime(at); continue;
      }
      const sched = line.match(/scheduled\b.*?\bfor\s+(\d{4}-\d{2}-\d{2}(?:[ T]\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?)/i);
      if (sched) { it.scheduledAt = parseWhen(sched[1]); it.scheduledVia = /publisher/i.test(line) ? 'publisher' : /instagram/i.test(line) ? 'Instagram scheduler' : 'scheduled'; it.dryRun = /dry.?run/i.test(line); }
    }
    if (!it.postedAt && it.postedElsewhereAt) { it.postedAt = it.postedElsewhereAt; it.postedHasTime = true; }
    const logged = log.find((r) => r.folder === name || r.folder === it.name);
    if (logged) {                                // the log's date wins only when the posting line has none or a different day
      const d = parseWhen(logged.date);
      if (d && (!it.postedAt || dayKey(d) !== dayKey(it.postedAt))) { it.postedAt = d; it.postedHasTime = hasTime(logged.date); }
      it.logged = logged; it.goal = logged.goal; it.angle = logged.angle;
    }
    it.stage = it.postedAt ? 'posted' : it.scheduledAt ? 'scheduled' : passed('C') ? 'c' : passed('B') ? 'b' : passed('A') ? 'a' : script.trim() ? 'script' : 'idea';
    // for the reel's card on the dashboard: its record, its words and its files
    it.id = name;
    it.script = script.trim().slice(0, 1600);
    it.history = Object.entries(sec).filter(([h]) => /^(Gate [ABC]|Fact check|Posting|Review)/i.test(h))
      .map(([h, body]) => ({ head: h, lines: body.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !/^#/.test(l)).map((l) => clip(l.replace(/^[-*]\s*/, ''), 260)).slice(0, 12) }))
      .filter((x) => x.lines.length);
    const out = fs.existsSync(path.join(dir, 'out')) ? fs.readdirSync(path.join(dir, 'out')).filter((f) => /\.(mp4|mov|jpg|png|txt)$/i.test(f)).map((f) => `out/${f}`) : [];
    it.files = ['script.txt', 'STORYBOARD.md', 'onscreen.md', 'approvals.md', ...out].filter((f) => fs.existsSync(path.join(dir, f)));
    const pdir = path.join(dir, 'out', 'platforms');      // versions for other platforms, written by /reel-repurpose
    it.platforms = fs.existsSync(pdir) ? fs.readdirSync(pdir).filter((f) => /\.(txt|md|mp4|jpg|png)$/i.test(f)).sort().map((f) => `out/platforms/${f}`) : [];
    const row = insights.rows.find((r) => r.reel === name || r.reel === it.name || r.reel === `reels/${name}`);
    if (row) { it.nums = numsFromRow(row); it.numsDate = row.date; }
    return it;
  });
  // stickers the brand's host library gained for each reel (brand/host/host.json, poses with first_reel)
  const hostPoses = asObj(readJSON(path.join(root, 'brand', 'host', 'host.json'), {}).poses) || {};
  for (const it of items) it.stickers = Object.entries(hostPoses).filter(([, p]) => p && p.first_reel === it.slug).map(([n, p]) => ({ name: n, pose: p.pose || '' }));
  const library = { total: Object.keys(hostPoses).length, fromReels: Object.values(hostPoses).filter((p) => p && p.first_reel).length };
  let planIndex = 0;
  for (const row of plan) {                                      // plan rows: a date for a reel, or an idea with no folder yet
    const when = parseWhen(row.date);
    const it = row.folder && items.find((x) => x.slug === row.folder || x.name === row.folder);
    if (it) { it.plannedAt = when; it.plannedHasTime = hasTime(row.date); it.goal = row.goal; it.angle = row.angle; it.notes = row.notes; if (row.series) it.series = row.series; if (row.topic) it.title = clip(row.topic); continue; }
    items.push({ id: `plan-${++planIndex}`, slug: row.folder || '', name: row.topic || '(untitled idea)', title: clip(row.topic || '(untitled idea)'), topic: row.topic, notes: row.notes, series: row.series, goal: row.goal, angle: row.angle, plannedAt: when, plannedHasTime: hasTime(row.date), stage: 'idea', fromPlan: true });
  }
  for (const r of log) if (r.folder && !items.some((x) => x.slug === r.folder || x.name === r.folder)) {
    const row = insights.rows.find((x) => x.reel === r.folder);
    items.push({ id: r.folder, slug: r.folder, name: r.folder, title: clip(r.first || r.folder), hook: r.first, goal: r.goal, angle: r.angle, postedAt: parseWhen(r.date), postedHasTime: hasTime(r.date), stage: 'posted', logged: r, gone: true, nums: row ? numsFromRow(row) : undefined });
  }

  // the account's own posts from the Instagram API (brand/instagram.json, written by instagram.mjs), matched to reels
  const media = objs(ig?.media).map((m) => ({ ...m, at: m.timestamp ? new Date(String(m.timestamp).replace(/([+-]\d{2})(\d{2})$/, '$1:$2')) : null, nums: numsFromMedia(m) }));
  const free = new Set(media);
  const take = (it, m) => { it.media = m; m.reel = it; free.delete(m); };
  for (const it of items) if (it.permalink) { const m = media.find((x) => free.has(x) && cleanLink(x.permalink) === cleanLink(it.permalink)); if (m) take(it, m); }
  for (const it of items) if (!it.media && it.caption?.trim()) { const k = capKey(it.caption); const m = k.length >= 12 && media.find((x) => free.has(x) && capKey(x.caption).startsWith(k.slice(0, 40))); if (m) take(it, m); }
  for (const it of items) if (!it.media && it.postedAt) {
    const same = media.filter((x) => free.has(x) && x.at && dayKey(x.at) === dayKey(it.postedAt) && (x.media_product_type || 'REELS') === 'REELS');
    if (same.length === 1) take(it, same[0]);
  }
  for (const it of items) if (it.media) {
    it.nums = it.media.nums; it.numsDate = ig?.pulled_at;
    if (!it.postedAt && it.media.at) { it.postedAt = it.media.at; it.postedHasTime = true; it.stage = 'posted'; it.foundOnInstagram = true; }
  }

  // what the brand's publisher really did (brand/publisher.json, written by publisher/scripts/pull.mjs)
  const publisher = asObj(readJSON(path.join(root, 'brand', 'publisher.json'), null));
  for (const p of objs(publisher?.posts)) {
    const it = p.reel && items.find((x) => x.slug === p.reel);
    const targets = Object.fromEntries(Object.entries(asObj(p.targets) || {}).filter(([, t]) => isObj(t)));
    if (it && (!it.pub || String(p.at) > String(it.pub.at))) it.pub = { id: p.id, status: p.status, at: p.at, trial: !!p.trial, targets };
  }

  // the same reels on Facebook and Threads (brand/facebook.json, brand/threads.json, written by platforms.mjs)
  const others = {};
  for (const p of ['facebook', 'threads']) {
    const d = asObj(readJSON(path.join(root, 'brand', `${p}.json`), null));
    if (!d) continue;
    const posts = objs(d.posts).map((m) => ({ ...m, at: m.timestamp ? new Date(String(m.timestamp).replace(/([+-]\d{2})(\d{2})$/, '$1:$2')) : null }));
    const left = new Set(posts);
    const give = (it, m) => { (it.elsewhere ||= {})[p] = { ...m.nums, link: m.permalink }; m.reel = it; left.delete(m); };
    for (const it of items) if (it.links?.[p]) { const m = posts.find((x) => left.has(x) && cleanLink(x.permalink) === cleanLink(it.links[p])); if (m) give(it, m); }
    for (const it of items) if (!it.elsewhere?.[p] && it.caption?.trim()) { const k = capKey(it.caption); const m = k.length >= 12 && posts.find((x) => left.has(x) && capKey(x.caption).startsWith(k.slice(0, 40))); if (m) give(it, m); }
    for (const it of items) if (!it.elsewhere?.[p] && it.postedAt) { const same = posts.filter((x) => left.has(x) && x.at && dayKey(x.at) === dayKey(it.postedAt)); if (same.length === 1) give(it, same[0]); }
    const views = (m) => (p === 'facebook' ? m.nums?.plays : m.nums?.views) ?? null;
    others[p] = { at: d.pulled_at, link: d.page?.link || (d.account?.username ? `https://www.threads.com/@${d.account.username}` : ''), name: d.page?.name || (d.account?.username ? `@${d.account.username}` : ''),
      followers: d.page?.followers ?? d.account?.followers ?? null, window: p === 'facebook' ? { days: 28, views: d.d28?.views, people: d.d28?.viewers } : { days: 7, views: d.d7?.views, likes: d.d7?.likes, replies: d.d7?.replies, reposts: d.d7?.reposts, clicks: d.d7?.clicks },
      posts: posts.map((m) => ({ id: m.id, title: m.reel?.title || clip(m.caption || '(no text)', 60), reelId: m.reel?.id || null, at: m.at, link: m.permalink, views: views(m), likes: m.nums?.likes ?? null, comments: m.nums?.comments ?? m.nums?.replies ?? null, shares: m.nums?.shares ?? m.nums?.reposts ?? null, watch: m.nums?.watch ?? null })),
      medianViews: median(posts.map(views).filter((v) => v != null)) };
  }

  // A/B tests: reels/<slug>/test.json names the versions (each its own reel folder), the variable and the deciding number
  const METRIC = {
    skip: { name: 'skip rate', better: 'lower', get: (n) => n.skip, show: (v) => pct(v) },
    watch: { name: 'average watch time', better: 'higher', get: (n) => n.watch, show: (v) => (v == null ? '–' : v.toFixed(1) + ' s') },
    views: { name: 'views', better: 'higher', get: (n) => n.views, show: fmt },
    saves: { name: 'saves per reach', better: 'higher', get: (n) => (n.reach ? (n.saves || 0) / n.reach : null), show: pct },
    shares: { name: 'shares per reach', better: 'higher', get: (n) => (n.reach ? (n.shares || 0) / n.reach : null), show: pct },
  };
  const medianViews = median(items.filter((x) => x.nums).map((x) => x.nums.views)) || null;
  const tests = [];
  for (const it of items) {
    if (!it.dir) continue;
    const t = asObj(readJSON(path.join(it.dir, 'test.json'), null));
    if (!t || objs(t.variants).length < 2) continue;
    t.variants = objs(t.variants);
    const m = METRIC[t.metric] ? t.metric : 'skip', M = METRIC[m];
    const sample = Number(t.sample) || Math.max(300, Math.round((medianViews || 600) * 0.5));
    const vs = t.variants.map((v) => {
      const r = items.find((x) => x.slug === v.reel) || null;
      if (r) { r.test = { id: it.slug, label: v.label }; if (r !== it && r.titleFromName) r.title = `${t.title || it.title} · ${v.label}`; }
      const n = r?.nums || null;
      return { label: v.label, reel: v.reel, id: r?.id || null, title: r?.title || v.reel, hook: v.hook || r?.hook || '', stage: r?.stage || 'idea', trial: !!r?.trial, views: n?.views ?? null, value: n ? M.get(n) : null };
    });
    let verdict = 'waiting', lead = null, note = 'Waiting for numbers on every version.';
    const have = vs.filter((v) => v.value != null);
    if (t.winner) { verdict = 'decided'; lead = t.winner; note = `${t.winner} won (recorded).`; }
    else if (have.length === vs.length) {
      const best = [...vs].sort((a, b) => (M.better === 'lower' ? a.value - b.value : b.value - a.value))[0];
      const worst = [...vs].sort((a, b) => (M.better === 'lower' ? b.value - a.value : a.value - b.value))[0];
      const gap = Math.abs(best.value - worst.value) / (Math.max(Math.abs(best.value), Math.abs(worst.value)) || 1);
      const enough = vs.every((v) => (v.views || 0) >= sample);
      lead = gap >= 0.1 ? best.label : null;
      verdict = !enough ? 'early' : lead ? 'winner' : 'tie';
      note = verdict === 'early' ? `Too early to call: ${sample.toLocaleString('en-US')} views each are needed.${lead ? ` ${lead} is ahead so far.` : ''}`
        : verdict === 'winner' ? `${lead} wins on ${M.name} (${M.show(best.value)} against ${M.show(worst.value)}).`
        : `No clear winner: the versions are within 10% on ${M.name}.`;
    }
    tests.push({ id: it.slug, title: t.title || it.title, variable: t.variable || 'hook', metric: m, metricName: M.name, better: M.better, sample, trial: t.trial !== false, variants: vs.map((v) => ({ ...v, shown: v.value == null ? '–' : M.show(v.value) })), verdict, lead, note, started: t.started || null });
  }

  // content mix: goals and angles of the last 10 posted reels
  const recentPosted = items.filter((x) => x.postedAt).sort((a, b) => b.postedAt - a.postedAt).slice(0, 10);
  const tally = (key) => { const c = {}; for (const x of recentPosted) { const v = String(x[key] || '').trim().toLowerCase(); if (v) c[v] = (c[v] || 0) + 1; } return Object.entries(c).sort((a, b) => b[1] - a[1]); };
  const ANGLES = ['result first', 'self-proving', 'contrarian', 'pain first', 'something breaks'];
  const GOALS = ['save', 'share', 'follow', 'lead'];
  const angles = tally('angle'), goals = tally('goal');
  const lastAngles = recentPosted.slice(0, 3).map((x) => String(x.angle || '').toLowerCase()).filter(Boolean);
  const mix = {
    count: recentPosted.length, goals, angles,
    unusedAngles: ANGLES.filter((a) => !angles.some(([k]) => k === a)), unusedGoals: GOALS.filter((g) => !goals.some(([k]) => k === g)),
    repeat: lastAngles.length === 3 && new Set(lastAngles).size === 1 ? lastAngles[0] : null,
    heavy: angles.find(([, n]) => recentPosted.length >= 5 && n / recentPosted.length > 0.4)?.[0] || null,
  };

  // series: reels and plan rows that share a series name
  const seriesMap = new Map();
  for (const x of items) if (x.series) {
    const sname = x.series.trim(), e = seriesMap.get(sname) || { name: sname, posted: 0, planned: 0, working: 0, next: null, ids: [] };
    e.ids.push(x.id);
    if (x.stage === 'posted') e.posted++; else if (x.stage === 'idea') e.planned++; else e.working++;
    const when = x.scheduledAt || x.plannedAt;
    if (x.stage !== 'posted' && when && (!e.next || when < e.next.when)) e.next = { when, title: x.title, id: x.id };
    seriesMap.set(sname, e);
  }
  const series = [...seriesMap.values()];

  // time from start to posted, and where reels wait longest
  const STEPS = [['Script', 'startedAt', 'gateA'], ['Visual plan', 'gateA', 'gateB'], ['Build and final', 'gateB', 'gateC'], ['Posting', 'gateC', 'postedAt']];
  const daysBetween = (a, b) => (a && b && b >= a ? (b - a) / 864e5 : null);
  const flow = {
    total: median(items.filter((x) => x.postedAt && x.startedAt).map((x) => daysBetween(x.startedAt, x.postedAt))),
    steps: STEPS.map(([name, a, b]) => ({ name, days: median(items.map((x) => daysBetween(x[a], x[b])).filter((v) => v != null)) })),
  };
  flow.slowest = [...flow.steps].filter((x) => x.days != null).sort((a, b) => b.days - a.days)[0] || null;

  // voice cost: characters sent this month (credits are about one per character on most voices)
  const thisMonth = today.slice(0, 7);
  const costs = { month: 0, monthEstimated: false, reels: [] };
  for (const x of items) if (x.voice) {
    const inMonth = x.voice.estimated ? (x.startedAt && dayKey(x.startedAt).slice(0, 7) === thisMonth ? x.voice.chars : 0)
      : x.voice.log.filter((e) => String(e.at).slice(0, 7) === thisMonth).reduce((t, e) => t + (e.chars || 0), 0);
    costs.month += inMonth; if (inMonth && x.voice.estimated) costs.monthEstimated = true;
    costs.reels.push({ id: x.id, title: x.title, chars: x.voice.chars, calls: x.voice.calls, estimated: x.voice.estimated });
  }
  costs.perReel = median(costs.reels.map((r) => r.chars));

  // the audience, from the Instagram connection: reach, follows, profile taps, who they are, when they are online
  const offsetMin = (tz, at) => { try { const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at).filter((x) => x.type !== 'literal').map((x) => [x.type, x.value])); return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - at.getTime()) / 60000; } catch { return 0; } };
  const ai = asObj(ig?.account_insights);
  let audience = null;
  if (ai) {
    const w = (k) => ai.windows?.[k] || {};
    const pick7 = w('d7'), pick28 = w('d28');
    const online = Array.isArray(ai.online?.hours) ? (() => {
      const shift = Math.round((offsetMin(TZ, now) - offsetMin(ai.online.tz || 'America/Los_Angeles', now)) / 60);   // Meta's hours, moved to the brand's clock
      const local = Array.from({ length: 24 }, (_, h) => ai.online.hours[((h - shift) % 24 + 24) % 24] || 0);
      const best = [...local.keys()].sort((a, b) => local[b] - local[a]).slice(0, 3).sort((a, b) => a - b);
      return { hours: local, best, days: ai.online.days, from: ai.online.tz };
    })() : null;
    const window = (x) => ({
      reach: x.reach?.total ?? null, reachFollowers: x.reach?.FOLLOWER ?? null, reachOthers: x.reach?.NON_FOLLOWER ?? null,
      views: x.views?.total ?? null, engaged: x.accounts_engaged?.total ?? null, interactions: x.total_interactions?.total ?? null,
      follows: x.follows?.FOLLOWER ?? null, unfollows: x.follows?.NON_FOLLOWER ?? null, taps: x.profile_taps?.total ?? null,
      tapsBy: Object.entries(x.profile_taps || {}).filter(([k]) => k !== 'total'), reposts: x.reposts?.total ?? null,
    });
    audience = { d7: window(pick7), d28: window(pick28), demo: ai.demographics?.follower_demographics || {}, engagedDemo: ai.demographics?.engaged_audience_demographics || {}, online, at: ai.at };
  }
  const igStories = objs(ig?.stories).map((s) => ({ ...s, at: s.timestamp ? new Date(String(s.timestamp).replace(/([+-]\d{2})(\d{2})$/, '$1:$2')) : null }));
  const igTags = objs(ig?.tags).map((t) => ({ ...t, at: t.timestamp ? new Date(String(t.timestamp).replace(/([+-]\d{2})(\d{2})$/, '$1:$2')) : null }));
  const own = String(ig?.account?.username || '').toLowerCase();
  const waiting = objs(ig?.comments).filter((c) => !c.hidden && String(c.username || '').toLowerCase() !== own && !objs(c.replies).some((r) => String(r.username || '').toLowerCase() === own))
    .map((c) => ({ ...c, at: c.timestamp ? new Date(String(c.timestamp).replace(/([+-]\d{2})(\d{2})$/, '$1:$2')) : null, reel: media.find((m) => m.id === c.media_id)?.reel || null }))
    .sort((a, b) => (b.at || 0) - (a.at || 0));
  const inbox = { waiting, total: objs(ig?.comments).length, tags: igTags };

  // what needs the owner
  const soon = addDays(today, 7);
  const attention = [];
  const need = (p, it, what) => attention.push({ p, it, what });
  const notStarted = { late: [], soon: [] };                          // planned reels not started yet: grouped below when many
  for (const it of items) {
    const due = it.plannedAt ? dayKey(it.plannedAt) : null;
    if (it.fileState === 'changed' && it.stage !== 'posted') need(1, it, 'the final mp4 changed after Gate C: it needs Gate C again before posting');
    if (it.fileState === 'missing' && it.stage === 'c') need(1, it, `the approved file out/${it.file} is missing`);
    const PN = { instagram: 'Instagram', facebook: 'Facebook', threads: 'Threads' };
    const failed = it.pub ? Object.entries(it.pub.targets).filter(([, t]) => t.status === 'failed') : [];
    if (failed.length) need(1, it, `the publisher could not post it on ${failed.map(([k, t]) => `${PN[k] || k}${t.error ? ` (${clip(t.error, 90)})` : ''}`).join(', ')}: /reel-posting to try again or post it by hand`);
    else if (it.stage === 'scheduled' && it.pub?.status === 'dry_run') need(2, it, 'the dry run went through at its time and nothing was posted: switch the publisher to live (docs/connect.md step 6), then schedule it again');
    else if (it.stage === 'scheduled' && it.scheduledAt < now) need(1, it, `was scheduled for ${pretty(dayKey(it.scheduledAt))} ${timeOf(it.scheduledAt)}: check it went out, then record it with /reel-posting`);
    else if (it.stage === 'scheduled' && it.dryRun) need(2, it, 'scheduled on the publisher in dry run: it will not really post, even if the publisher goes live first');
    if (it.foundOnInstagram) need(2, it, 'found on Instagram but not recorded as posted: record it with /reel-posting');
    if (it.stage === 'posted' && !it.nums && it.postedAt && (now - it.postedAt) > 864e5) need(2, it, ig ? 'posted, but not matched to an Instagram post: add its link to the "Posted" line in approvals.md' : 'posted: add its numbers with /analytics-readout');
    if (it.stage === 'posted' && !it.logged && !it.gone && it.slug) need(3, it, 'posted but not in brand/log.md yet');
    if (!['scheduled', 'posted'].includes(it.stage)) {
      if (due && due < today) { if (it.stage === 'idea') notStarted.late.push(it); else need(1, it, `was planned for ${pretty(due)}: ${NEXT[it.stage]}`); }
      else if (due && due <= soon) { if (it.stage === 'idea') notStarted.soon.push(it); else need(2, it, `planned for ${pretty(due)}: ${NEXT[it.stage]}`); }
      else if (!due && ['script', 'a', 'b', 'c'].includes(it.stage)) need(3, it, NEXT[it.stage]);
    }
  }
  const sys = { title: 'Dashboard', slug: '', fromPlan: false, system: true };
  // a few planned reels not started yet are listed one by one; more (several posts a day) become one line each
  const byDue = (a, b) => a.plannedAt - b.plannedAt;
  for (const [list, p, one, many] of [
    [notStarted.late.sort(byDue), 1, (d) => `was planned for ${pretty(d)}: ${NEXT.idea}`, (n, f, d) => `${n} planned reels have a date that has passed and are not started (the first: ${f}, ${pretty(d)}): start them with /bagelunit-reels, or give them new dates with /content-calendar plan`],
    [notStarted.soon.sort(byDue), 2, (d) => `planned for ${pretty(d)}: ${NEXT.idea}`, (n, f, d) => `${n} reels planned in the next 7 days are not started yet (the first: ${f}, ${pretty(d)}): start them with /bagelunit-reels`],
  ]) {
    if (list.length <= 3) for (const it of list) need(p, it, one(dayKey(it.plannedAt)));
    else need(p, { ...sys, title: 'Planned reels' }, many(list.length, list[0].title, dayKey(list[0].plannedAt)));
  }
  for (const t of tests) {
    const owner = items.find((x) => x.slug === t.id);
    if (t.verdict === 'winner') need(2, owner, `A/B test: ${t.note}${t.trial ? ` Share ${t.lead} to your followers in the Instagram app, then record it with /ab-hook-tester` : ' Record the winner with /ab-hook-tester'}`);
    if (t.verdict === 'tie') need(3, owner, `A/B test: ${t.note} Record it with /ab-hook-tester and keep either one`);
  }
  const fresh = waiting.filter((c) => c.at && now - c.at < 2 * 864e5);
  if (fresh.length) need(2, { ...sys, title: 'Comments' }, `${fresh.length} comment${fresh.length === 1 ? ' is' : 's are'} waiting for a reply (the last 2 days): reply with /comment-responder`);
  if (mix.repeat) need(3, { ...sys, title: 'Content mix' }, `your last 3 posts used the same angle (${mix.repeat}): pick a different one next${mix.unusedAngles.length ? `, for example ${mix.unusedAngles[0]}` : ''}`);
  else if (mix.heavy) need(3, { ...sys, title: 'Content mix' }, `${mix.heavy} is more than 4 in 10 of your recent posts: mix in other angles`);
  const noPaths = (m) => String(m || '').split(root).join('').split(CONFIG_DIR).join('~/.config/bagelunit-reels');
  for (const k of Object.keys(status)) if (status[k] && status[k].error) status[k].error = noPaths(status[k].error);
  if (status.instagram && !status.instagram.ok) need(1, { ...sys, title: 'Instagram numbers' }, `the last pull failed: ${status.instagram.error}. See docs/connect.md`);
  for (const [k, t] of [['facebook', 'Facebook Page numbers'], ['threads', 'Threads numbers'], ['publisher', 'Publisher']]) if (status[k] && !status[k].ok) need(1, { ...sys, title: t }, `the last pull failed: ${status[k].error}. See docs/connect.md`);
  // Instagram Login tokens renew themselves on the refresh; a Unified Login token with an end date (the expires_at the
  // owner read off Meta's configuration preview) does not, so it needs a new token before that day
  if (ig?.token_expires_at && new Date(ig.token_expires_at) - now < 7 * 864e5) need(1, { ...sys, title: 'Instagram numbers' }, ig.login === 'instagram'
    ? 'the Instagram token runs out within a week: run the refresh once (it renews the token), or make a new one (docs/connect.md step 2A)'
    : `the Instagram token runs out on ${String(ig.token_expires_at).slice(0, 10)} and does not renew itself: make a new one before then (docs/connect.md step 2B), and send it to the publisher with  node publisher/scripts/setup.mjs secrets --only IG_TOKEN`);
  if (status.competitors && !status.competitors.ok) need(2, { ...sys, title: 'Competitor numbers' }, `${status.competitors.error}. Give an export or try /content-calendar competitors`);
  if (status.telegram && !status.telegram.ok) need(2, { ...sys, title: 'Telegram summary' }, `the last send failed: ${status.telegram.error}`);
  if (status.host && !status.host.ok) need(2, { ...sys, title: 'Online dashboard' }, `the last upload failed: ${status.host.error}`);
  attention.sort((a, b) => a.p - b.p);

  // the calendar: one entry per reel on its day
  const entryOf = (it) => {
    if (it.postedAt) return { key: dayKey(it.postedAt), kind: 'posted', time: it.postedHasTime ? timeOf(it.postedAt) : '' };
    if (it.scheduledAt) return { key: dayKey(it.scheduledAt), kind: 'scheduled', time: timeOf(it.scheduledAt) };
    if (it.plannedAt) return { key: dayKey(it.plannedAt), kind: dayKey(it.plannedAt) < today ? 'late' : 'planned', time: it.plannedHasTime ? timeOf(it.plannedAt) : '' };
    return null;
  };
  const byDay = {};
  for (const it of items) { const e = entryOf(it); if (e) (byDay[e.key] ||= []).push({ ...e, it }); }
  for (const list of Object.values(byDay)) list.sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
  // open slots: each posting time on a posting day is one slot. A reel with a time takes the nearest free time, a reel
  // without one takes the earliest free time, and today's times that have gone by are not open any more. With no times
  // set, a posting day is one slot.
  const mins = (t) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
  const openTimesOn = (k) => {
    if (k < today || !isPostDay(k)) return [];
    const list = byDay[k] || [];
    if (!postTimes.length) return list.length ? [] : [''];
    const left = [...postTimes];
    for (const e of list.filter((x) => x.time)) {
      if (!left.length) break;
      let at = 0; left.forEach((t, i) => { if (Math.abs(mins(t) - mins(e.time)) < Math.abs(mins(left[at]) - mins(e.time))) at = i; });
      left.splice(at, 1);
    }
    left.splice(0, list.filter((x) => !x.time).length);
    return k === today ? left.filter((t) => t > timeOf(now)) : left;
  };
  const openSlots = [];                                                // { key, time } for each open slot, today to the last day shown
  for (let k = today; k <= last; k = addDays(k, 1)) for (const t of openTimesOn(k)) openSlots.push({ key: k, time: t });

  // numbers: the whole account when the Instagram API is connected, otherwise the kit's own reels
  const posts = ig ? media.map((m) => ({ title: m.reel ? m.reel.title : clip(firstLine(m.caption || '') || m.media_product_type || 'post', 70), at: m.at, nums: m.nums, link: m.permalink, reel: m.reel, kind: m.media_product_type }))
    : items.filter((x) => x.nums).map((x) => ({ title: x.title, at: x.postedAt, nums: x.nums, reel: x, kind: 'REELS' }));
  const ago = (d, days) => d && (now - d) <= days * 864e5 && d <= now;
  const sumOf = (list, k) => list.reduce((t, p) => t + (p.nums[k] || 0), 0);
  const withReach = posts.filter((p) => (p.nums.reach || p.nums.views));
  const reelsPosted = items.filter((x) => x.stage === 'posted');
  const followersNow = ig?.account?.followers_count ?? (followerRows.length ? followerRows.at(-1).followers : null);
  const followersAgo = (n) => { const target = addDays(today, -n); const r = [...followerRows].reverse().find((x) => x.key <= target); return r && followersNow != null ? followersNow - r.followers : null; };
  const stats = {
    source: ig ? 'Instagram' : 'insights.csv',
    followers: followersNow, followers7: followersAgo(7), followers30: followersAgo(30),
    posted: reelsPosted.length, last7: reelsPosted.filter((x) => ago(x.postedAt, 7)).length, last30: reelsPosted.filter((x) => ago(x.postedAt, 30)).length,
    views: posts.length ? sumOf(posts, 'views') : null,
    views30: posts.length ? sumOf(posts.filter((p) => ago(p.at, 30)), 'views') : null,
    views7: posts.length ? sumOf(posts.filter((p) => ago(p.at, 7)), 'views') : null,
    medianViews: median(posts.map((p) => p.nums.views)),
    engagement: withReach.length ? withReach.reduce((t, p) => t + engaged(p.nums), 0) / withReach.reduce((t, p) => t + (p.nums.reach || p.nums.views), 0) : null,
    follows: posts.some((p) => p.nums.follows != null) ? sumOf(posts, 'follows') : null,
    watch: median(posts.map((p) => p.nums.watch)), skip: median(posts.map((p) => p.nums.skip)),
    measured: posts.length,
    scheduled: items.filter((x) => x.stage === 'scheduled').length,
    inProgress: items.filter((x) => ['script', 'a', 'b', 'c'].includes(x.stage)).length,
    ideas: items.filter((x) => x.stage === 'idea').length,
  };
  const top = [...posts].filter((p) => p.nums.views != null).sort((a, b) => b.nums.views - a.nums.views).slice(0, 5);

  // trends: views by the week a post went out, followers by day, watch time and skip rate per recent reel
  const weeks = [];
  for (let i = 7; i >= 0; i--) {
    const start = addDays(weekStart(today), -7 * i);
    const list = posts.filter((p) => p.at && weekStart(dayKey(p.at)) === start);
    weeks.push({ start, posts: list.length, views: list.length ? sumOf(list, 'views') : 0 });
  }
  const recent = [...posts].filter((p) => p.at && (p.nums.watch != null || p.nums.skip != null)).sort((a, b) => b.at - a.at).slice(0, 8);

  // one view per platform, for the dashboard's platform switch (shown once Facebook or Threads is connected). Meta
  // counts differently on each: Facebook gives plays, Threads views; Instagram engagement is of reach, the others of
  // views. "All" adds up what can be added: followers, views and plays, posts, and likes, comments and shares.
  const readFollowers = (file) => csv(read(path.join(root, 'brand', file))).rows
    .map((r) => ({ key: r.date, followers: num(r.followers) })).filter((r) => r.key && r.followers != null).sort((a, b) => a.key.localeCompare(b.key));
  const weeksOf = (list) => Array.from({ length: 8 }, (_, i) => {
    const start = addDays(weekStart(today), -7 * (7 - i)), l = list.filter((p) => p.at && weekStart(dayKey(p.at)) === start);
    return { start, posts: l.length, views: l.length ? sumOf(l, 'views') : 0 };
  });
  const deltaOf = (rows, nowVal, n) => { const target = addDays(today, -n); const r = [...rows].reverse().find((x) => x.key <= target); return r && nowVal != null ? nowVal - r.followers : null; };
  const platformView = (key, name, list, followers, rows, of) => {
    const based = list.map((p) => ({ e: engaged(p.nums), b: (of === 'reach' ? p.nums.reach : null) || p.nums.views || 0 })).filter((x) => x.b);
    const base = based.reduce((t, x) => t + x.b, 0);
    return { key, name, posts: list, followers, followerRows: rows, followers7: deltaOf(rows, followers, 7), followers30: deltaOf(rows, followers, 30),
      views30: list.length ? sumOf(list.filter((p) => ago(p.at, 30)), 'views') : null,
      last7: list.filter((p) => ago(p.at, 7)).length, last30: list.filter((p) => ago(p.at, 30)).length,
      medianViews: median(list.map((p) => p.nums.views)), engagement: base ? based.reduce((t, x) => t + x.e, 0) / base : null, engagementOf: of,
      measured: list.length, weeks: weeksOf(list), top: [...list].filter((p) => p.nums.views != null).sort((a, b) => b.nums.views - a.nums.views).slice(0, 5) };
  };
  let platforms = null;
  if (Object.keys(others).length) {
    const igPosts = posts.map((p) => ({ ...p, platform: 'instagram' }));
    const views = { instagram: platformView('instagram', 'Instagram', igPosts, followersNow, followerRows, 'reach') };
    for (const [k, o] of Object.entries(others)) {
      const list = o.posts.map((x) => ({ title: x.title, at: x.at, link: x.link, platform: k, reel: x.reelId ? items.find((i) => i.id === x.reelId) : null,
        nums: { views: x.views, likes: x.likes, comments: x.comments, shares: x.shares, watch: x.watch } }));
      views[k] = platformView(k, k === 'facebook' ? 'Facebook' : 'Threads', list, o.followers, readFollowers(`followers-${k}.csv`), 'views');
    }
    // all platforms: followers added up from the first day every platform has a count, carrying each one forward
    const series = Object.values(views).map((v) => v.followerRows).filter((r) => r.length);
    const from = series.length ? series.map((r) => r[0].key).sort().at(-1) : null;
    const allRows = from ? [...new Set(series.flatMap((r) => r.map((x) => x.key)))].filter((d) => d >= from).sort()
      .map((d) => ({ key: d, followers: series.reduce((t, r) => t + ([...r].reverse().find((x) => x.key <= d)?.followers || 0), 0) })) : [];
    const known = Object.values(views).map((v) => v.followers).filter((n) => n != null);
    views.all = platformView('all', 'All platforms', Object.values(views).flatMap((v) => v.posts), known.length ? known.reduce((t, n) => t + n, 0) : null, allRows, 'views');
    platforms = views;
  }

  // Honest agent activity. Each agent is judged only by its own outputs, as a set of small keys; it "made something"
  // when a key appears that was not there last time (something only removed or moved does not count):
  //   Ideator:  plan rows with no date yet (ideas) and rows in brand/swipe.md. A dated row is the Planner's work, so
  //             giving an idea a date, or adding a dated row, never moves the Ideator.
  //   Writer:   each reel folder's script (a new or changed script).
  //   Planner:  plan rows with a date (a new row, a new date, a reel folder filled in).
  //   Analyst:  brand/stats.md and the insights.csv rows for reels not matched to an Instagram post. The scheduled
  //             pull adds rows for matched reels by itself and is not the Analyst working, so those rows and the
  //             pull's own time do not count.
  // The first time the dashboard sees an agent it only learns its keys and leaves the time empty (shown as "date not
  // known" when it already has output). It never guesses a time from when a file was saved.
  const evFile = path.join(root, '.cache', 'agent-events.json');
  const events = readJSON(evFile, {});
  const h10 = (v) => crypto.createHash('sha1').update(JSON.stringify(v)).digest('hex').slice(0, 10);
  const matchedReels = new Set(items.filter((x) => x.media).flatMap((x) => [x.slug, x.name, `reels/${x.slug}`]));
  const statsText = read(path.join(root, 'brand', 'stats.md')).trim();
  const KEYS = {
    ideator: [...plan.filter((r) => r.topic && !parseWhen(r.date)).map((r) => h10(['idea', norm(r.topic)])),
      ...mdTable(read(path.join(root, 'brand', 'swipe.md'))).map((r) => h10(['swipe', r]))],
    writer: items.filter((x) => x.dir && x.script).map((x) => h10([x.slug, x.script])),
    planner: plan.filter((r) => parseWhen(r.date)).map((r) => h10([norm(r.topic), r.date, r.folder])),
    analyst: [...(statsText ? [h10(['stats', statsText])] : []), ...insights.rows.filter((r) => r.reel && !matchedReels.has(r.reel)).map((r) => h10(['row', r]))],
  };
  let evDirty = false;
  for (const [k, all] of Object.entries(KEYS)) {
    const keys = all.slice(-2000);
    const before = isObj(events[k]) && Array.isArray(events[k].keys) ? events[k] : null;
    if (!before) { events[k] = { keys, at: null }; evDirty = true; continue; }   // first sight (or the old format, whose time may be a guess): learn only
    const old = new Set(before.keys);
    const fresh = keys.some((x) => !old.has(x));
    if (fresh || keys.length !== before.keys.length || keys.some((x, i) => x !== before.keys[i])) { events[k] = { keys, at: fresh ? now.toISOString() : before.at }; evDirty = true; }
  }
  if (evDirty && !todayArg) { try { writeAtomic(evFile, JSON.stringify(events)); } catch {} }
  const madeAt = (k) => { const at = events[k]?.at ? new Date(events[k].at) : null; return at && !isNaN(at) ? at : null; };

  // the four agents: which kit skills do each job, when they last ran, what they made
  const files = (rel) => path.join(root, rel);
  const newest = (...dates) => dates.filter(Boolean).sort((a, b) => b - a)[0] || null;
  const swipeRows = mdTable(read(files('brand/swipe.md')));
  const ideas = items.filter((x) => x.stage === 'idea');
  const scripts = items.filter((x) => ['script', 'a'].includes(x.stage) && x.slug && !x.fromPlan);
  const planned14 = items.filter((x) => x.plannedAt && !['posted'].includes(x.stage) && dayKey(x.plannedAt) >= today && dayKey(x.plannedAt) <= addDays(today, 13));
  const perWeek = Number(brand.batch?.max_reels) || null;
  const thisWeek = items.filter((x) => { const e = entryOf(x); return e && weekStart(e.key) === weekStart(today); }).length;
  const best = top[0];
  // the posting pace suggested by how-often.mjs (/content-calendar how-often), shown in the Planner panel
  const pace = asObj(readJSON(path.join(root, 'brand', 'how-often.json'), null));
  const paceAt = pace && !isNaN(new Date(pace.at)) ? new Date(pace.at) : null;
  const paceOut = pace?.suggestion?.perWeek && paceAt ? [{
    text: `Suggested: ${pace.suggestion.perWeek} a week${pace.suggestion.start ? `, starting at ${pace.suggestion.start}` : ''}${perWeek && perWeek !== pace.suggestion.perWeek ? ` (your plan: ${perWeek})` : ''}`,
    note: `from ${[pace.niche ? 'accounts like yours' : '', pace.own?.signal && !['not enough', 'same every week'].includes(pace.own.signal) ? 'your own numbers' : ''].filter(Boolean).join(' and ') || 'your numbers'}, ${pretty(dayKey(paceAt))}${now - paceAt > 45 * 864e5 ? ': run /content-calendar how-often again' : ''}`,
    href: 'how-often.json' }] : [];
  const agents = [
    { key: 'ideator', name: 'Ideator', job: 'finds ideas in your comments, your best posts and reels worth studying',
      lastRun: madeAt('ideator'),
      metrics: [[ideas.length, 'ideas waiting'], [swipeRows.length, 'reels in the swipe file']],
      output: ideas.slice(0, 6).map((x) => ({ id: x.id, text: x.title, note: x.plannedAt ? `planned ${pretty(dayKey(x.plannedAt))}` : 'no date', href: 'plan.md' })),
      next: ideas.length ? '/bagelunit-reels with the first idea' : '/comment-mining for new ideas', skills: '/comment-mining, /reel-sources, /account-audit, /going-viral' },
    { key: 'writer', name: 'Hook & Script', job: 'writes hooks and scripts in your voice, fact checked before you see them',
      lastRun: newest(madeAt('writer'), ...items.map((x) => x.gateA)),
      metrics: [[scripts.filter((x) => x.stage === 'script').length, 'waiting for your yes'], [items.filter((x) => x.gateA && ago(x.gateA, 7)).length, 'approved this week']],
      output: scripts.slice(0, 6).map((x) => ({ id: x.id, text: x.hook || x.title, note: `${x.title} · ${stageName(x.stage).toLowerCase()}`, href: `../reels/${x.slug}/script.txt` })),
      next: scripts.some((x) => x.stage === 'script') ? 'approve or change the scripts waiting at Gate A' : '/viral-hook-writer, then /reel-scripter', skills: '/viral-hook-writer, /hook-mining, /reel-scripter, /reel-factcheck' },
    { key: 'planner', name: 'Planner', job: 'puts reels on your posting days and keeps the angles different',
      lastRun: madeAt('planner'),
      metrics: [[planned14.length, 'planned in the next 14 days'], [openSlots.filter((x) => x.key <= addDays(today, 13)).length, 'open slots in 14 days'], ...(perWeek ? [[`${thisWeek}/${perWeek}`, 'this week vs your target']] : [])],
      output: [...paceOut, ...(mix.count >= 3 && (mix.repeat || mix.heavy || mix.unusedAngles.length) ? [{ text: mix.repeat ? `Change the angle: the last 3 were ${mix.repeat}` : mix.unusedAngles.length ? `Try an angle you have not used lately: ${mix.unusedAngles.slice(0, 2).join(', ')}` : `Mix in other angles than ${mix.heavy}`, note: 'from your last ' + mix.count + ' posts', href: null }] : []), ...planned14.slice(0, 6).map((x) => ({ id: x.id, text: x.title, note: `${pretty(dayKey(x.plannedAt))} · ${stageName(x.stage).toLowerCase()}`, href: x.fromPlan ? 'plan.md' : `../reels/${x.slug}/approvals.md` }))],
      next: postDays.length ? '/content-calendar plan' : '/content-calendar days, then plan', skills: '/content-calendar plan, /reel-posting' },
    { key: 'analyst', name: 'Analyst', job: 'reads your real numbers and says what to make more of',
      lastRun: madeAt('analyst'),
      metrics: [[stats.measured, ig ? 'posts with numbers' : 'reels with numbers'], [fmt(stats.medianViews), 'median views'], ...(stats.watch != null ? [[`${stats.watch.toFixed(1)} s`, 'median watch time']] : [])],
      output: [
        ...tests.filter((t) => ['winner', 'decided', 'tie'].includes(t.verdict)).slice(0, 2).map((t) => ({ id: items.find((x) => x.slug === t.id)?.id, text: `Test: ${t.title}`, note: t.note, href: null })),
        ...(best ? [{ id: best.reel?.id, text: `Best: ${best.title}`, note: `${fmt(best.nums.views)} views, ${pct(rate(best.nums))} engagement`, href: best.link || null }] : []),
        ...(stats.skip != null ? [{ text: `Median skip rate ${pct(stats.skip)}`, note: 'people who left in the first 3 seconds', href: null }] : []),
        ...(fs.existsSync(files('brand/stats.md')) ? [{ text: 'stats.md', note: 'the median summary', href: 'stats.md' }] : []),
      ],
      next: ig ? '/analytics-readout to read the numbers' : '/content-calendar connect instagram, or /analytics-readout', skills: '/analytics-readout, /account-audit, /reel-predict' },
  ];
  for (const a of agents) a.undated = !a.lastRun && a.output.length > 0;   // it has output from before the dashboard was watching

  // first run: the steps a new brand takes, each checked off by what is really in the folder
  const dash = asObj(brand.dashboard) || {};
  const reelFolders = items.filter((x) => x.slug && !x.fromPlan && !x.gone).length;
  const dated = plan.filter((r) => parseWhen(r.date)).length;
  const setup = [
    ...(brand.name ? [] : [{ key: 'brand', title: 'Set up your brand', why: 'Name, handle, colours, voice and call to action, so every reel sounds and looks like you.', cmd: '/brand-setup', done: false }]),
    { key: 'days', title: 'Pick your posting days', why: 'Empty posting days show up as open slots, so you can see what to fill.', cmd: '/content-calendar days', done: postDays.length > 0 },
    { key: 'plan', title: 'Plan your first weeks', why: 'Claude suggests topics for your open days, each with one goal and its own angle, and adds them after your yes.', cmd: '/content-calendar plan', done: dated > 0 || reelFolders > 0 },
    { key: 'reel', title: 'Make your first reel', why: 'Claude writes, checks and builds it, and stops three times for your yes.', cmd: '/bagelunit-reels ' + (items.find((x) => x.fromPlan)?.title || 'your topic'), done: reelFolders > 0 },
    { key: 'numbers', title: 'Connect your Instagram numbers', why: 'Followers, views, watch time and skip rate, read straight from your own account.', cmd: '/content-calendar connect instagram', done: !!dash.instagram || insights.rows.length > 0, optional: true },
    { key: 'competitors', title: 'Watch your competitors', why: 'What they post and what beats their own normal, then post ideas drawn from it.', cmd: '/content-calendar competitors add', done: (readJSON(path.join(root, 'brand', 'competitors.json'), {}).accounts || []).length > 0, optional: true },
    { key: 'view', title: 'See it on your phone', why: 'A daily summary on Telegram, and the dashboard on your Wi-Fi or online.', cmd: '/content-calendar connect telegram', alt: '/content-calendar host', done: !!dash.telegram || (dash.host && dash.host !== 'local'), optional: true },
  ];
  const setupOpen = setup.some((x) => !x.optional && !x.done);

  // other accounts: the leaderboard, the posts that beat their own median, the patterns and the ideas drafted from them
  const ownViews = (media.length ? media.map((m) => ({ at: m.at, v: m.nums.views })) : items.filter((x) => x.postedAt && x.nums?.views != null).map((x) => ({ at: x.postedAt, v: x.nums.views })))
    .filter((x) => x.at && x.v != null).sort((a, b) => b.at - a.at);
  const competitors = loadCompetitors(root, {
    now: now.getTime(), windowDays: Math.min(90, Math.max(1, Math.round(Number(brand.dashboard?.competitors_days) || 7))),
    dayName: (t) => pretty(dayKey(new Date(t)), { weekday: 'short' }),
    own: { followers: followersNow, median: median(ownViews.slice(0, 12).map((x) => x.v)), perWeek: ownViews.length >= 3 ? Math.round((ownViews.filter((x) => now - x.at <= 28 * 864e5).length / 4) * 10) / 10 : null },
  });

  return {
    competitors,
    setup, setupOpen, tests, mix, others, publisher, series, flow, costs, library, audience, stories: igStories, inbox,
    root, brand, slug, name: str(brand.name) || path.basename(root).replace(/-reels$/, ''), handle: str(brand.handle),
    accent: /^#[0-9a-f]{3,8}$/i.test(str(brand.colors?.accent)) ? brand.colors.accent : '#E4572E',
    tz: TZ, now, today, last, days, postDays, postTime, postTimes, isPostDay, openTimesOn,
    dayKey, timeOf, pretty, addDays, weekday, weekStart, parseWhen,
    plan, log, insights, ig, media, followerRows, status,
    items, attention, entryOf, byDay, openSlots, stats, top, weeks, recent, agents, platforms,
  };
}
