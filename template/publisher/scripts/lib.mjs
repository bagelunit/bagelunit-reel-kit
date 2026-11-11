// Shared helpers for the publisher's scripts (schedule.mjs, pull.mjs, setup.mjs, forget.mjs). Node 22, no packages.
//
// The scripts run from the brand folder (the copy of the kit's template with brand/brand.json in it), for example
//   node publisher/scripts/schedule.mjs reels/my-reel --at 2026-11-10T09:00:00-05:00
// They reach the brand's Worker with ~/.config/bagelunit-reels/publisher-<slug>.json, which the owner writes:
//   {"url": "https://<worker>.workers.dev", "admin_key": "<the ADMIN_KEY secret>"}
// The admin key is sent only in the Authorization header and never printed.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const CONFIG_DIR = path.join(os.homedir(), '.config', 'bagelunit-reels');

export class Plain extends Error {}           // an error whose message is safe to show (never holds the key)

// Is this file the script node was asked to run? Both paths are resolved through symlinks first, so a script run
// through a linked folder (or a path with a symlink in it) still runs.
export function isMain(metaUrl, argv1 = process.argv[1]) {
  if (!argv1) return false;
  try { return fs.realpathSync(fileURLToPath(metaUrl)) === fs.realpathSync(path.resolve(argv1)); } catch { return false; }
}

export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 0) { out[a.slice(2, eq)] = a.slice(eq + 1); continue; }
      const n = argv[i + 1];
      if (n === undefined || n.startsWith('--')) out[a.slice(2)] = true; else { out[a.slice(2)] = n; i++; }
    } else out._.push(a);
  }
  return out;
}

export const readJSON = (f, fallback = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fallback; } };
export const read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
export const sha256File = (f) => createHash('sha256').update(fs.readFileSync(f)).digest('hex');

// The brand folder: the nearest folder above `start` with brand/brand.json.
export function findBrand(start) {
  for (let d = path.resolve(start || process.cwd()); ; d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, 'brand', 'brand.json'))) return d;
    if (path.dirname(d) === d) return null;
  }
}
// The same slug rule as the rest of the kit (content-calendar lib.mjs).
export const brandSlug = (root, brand = readJSON(path.join(root, 'brand', 'brand.json'), {})) =>
  (brand.slug || brand.name || path.basename(root).replace(/-reels$/, '')).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'brand';
export const atHandle = (h) => (h ? `@${String(h).trim().replace(/^@/, '')}` : '');

// Local time as "YYYY-MM-DD HH:MM", the stamp the kit uses in approvals.md and brand/inbox-log.md.
export function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ---------- approvals.md ----------
// The approved files from the latest Gate C record, as studio/tools/gate.py writes them:
//   - File: <name>.mp4 | sha256: <12 hex>
//   - Cover: cover.jpg | sha256: <12 hex>      (only when out/cover.jpg existed at approval)
export function lastGateC(text) {
  const files = [...text.matchAll(/^- File: (.+?) \| sha256: ([0-9a-f]{12})/gm)];
  if (!files.length) return null;
  const last = files.at(-1);
  const after = text.slice(last.index);
  const nextGate = after.search(/\n### |\n## /);
  const block = nextGate > 0 ? after.slice(0, nextGate) : after;
  const cover = [...block.matchAll(/^- Cover: (.+?) \| sha256: ([0-9a-f]{12})/gm)].at(-1);
  return { file: last[1].trim(), sha12: last[2], cover: cover ? { file: cover[1].trim(), sha12: cover[2] } : null };
}

// Add one line at the end of a "## <heading>" section, making the section when it is missing.
export function appendUnder(file, heading, line) {
  const text = read(file);
  const lines = text ? text.replace(/\s+$/, '').split('\n') : [];
  const h = `## ${heading}`;
  const i = lines.findIndex((l) => l.trim() === h);
  if (i < 0) {
    const out = [...lines, ...(lines.length ? [''] : []), h, '', line];
    fs.writeFileSync(file, out.join('\n') + '\n');
    return;
  }
  let end = lines.findIndex((l, j) => j > i && /^## /.test(l));
  if (end < 0) end = lines.length;
  let k = end; while (k > i + 1 && !lines[k - 1].trim()) k--;      // after the section's last line, before blank lines
  lines.splice(k, 0, ...(k === i + 1 ? ['', line] : [line]));
  fs.writeFileSync(file, lines.join('\n') + '\n');
}

// ---------- the Worker connection ----------
export function connection(slug, dir = CONFIG_DIR) {
  const file = path.join(dir, `publisher-${slug}.json`);
  if (!fs.existsSync(file)) throw new Plain(`no ${file} yet: it is made by the publisher setup (node publisher/scripts/setup.mjs secrets, then --url <address>; see docs/connect.md step 6)`);
  const c = readJSON(file, null);
  if (!c?.url || !c?.admin_key) throw new Plain(`${file} needs "url" and "admin_key": run node publisher/scripts/setup.mjs secrets (makes the key) and --url <address> (saves the address)`);
  return { file, url: String(c.url).replace(/\/+$/, ''), key: String(c.admin_key) };
}

// One call to the Worker's admin API. The key goes in the header only and is blanked from any error.
export async function admin(conn, method, p, { body, headers = {}, fetchImpl = fetch } = {}) {
  const hide = (s) => String(s).split(conn.key).join('***');
  let res;
  try { res = await fetchImpl(conn.url + p, { method, body, headers: { Authorization: `Bearer ${conn.key}`, ...headers } }); }
  catch (e) { throw new Plain(`could not reach the publisher at ${conn.url} (${hide(e?.cause?.code || e?.message || 'network error')})`); }
  const data = await res.json().catch(() => ({}));
  if (res.status === 403) throw new Plain('the publisher refused the admin key: check "admin_key" in your publisher file matches the ADMIN_KEY secret');
  if (!res.ok) throw new Plain(`${method} ${p.split('?')[0]}: ${res.status} ${hide(data.error || '')}`.trim());
  return data;
}

// ---- the plan: brand/plan.md rows, and a local date and time turned into an ISO time with the timezone's offset ----
// "2026-11-12", "13:00", "America/Toronto" -> "2026-11-12T13:00:00-05:00" (null for a bad date, time or zone).
export function zonedIso(date, time, tz) {
  const d = String(date).match(/^(\d{4})-(\d{2})-(\d{2})$/), t = String(time).match(/^(\d{1,2}):(\d{2})$/);
  if (!d || !t || +t[1] > 23 || +t[2] > 59) return null;
  const want = Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2]);
  const offsetAt = (ms) => {
    const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const q = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
    return Date.UTC(+q.year, +q.month - 1, +q.day, +q.hour, +q.minute) - ms;
  };
  try {
    let utc = want - offsetAt(want);
    utc = want - offsetAt(utc);                                   // once more: the offset can change on the day (daylight saving)
    const off = offsetAt(utc) / 60000, a = Math.abs(off), p2 = (n) => String(n).padStart(2, '0');
    return `${date}T${p2(+t[1])}:${t[2]}:00${off < 0 ? '-' : '+'}${p2(Math.floor(a / 60))}:${p2(a % 60)}`;
  } catch { return null; }
}

// The rows of every table in plan.md: [{ cells: {header: value}, line }], where line is the 0-based line in the file.
// A header row is one followed by a |---| row; each weekly section may have its own.
export function planRows(text) {
  const lines = String(text || '').split('\n'), rows = [];
  const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
  let head = null;
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim().startsWith('|')) { head = null; continue; }
    if (lines[i + 1] && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1]) && !/^\s*\|?\s*:?-{2,}/.test(lines[i])) { head = cells(lines[i]).map((h) => h.toLowerCase()); i++; continue; }
    if (!head) continue;
    const c = cells(lines[i]), o = {};
    head.forEach((h, k) => { o[h] = c[k] ?? ''; });
    rows.push({ cells: o, line: i });
  }
  return rows;
}
const firstKey = (o, names) => Object.keys(o).find((k) => names.some((n) => k === n || k.startsWith(n)));
export const planDate = (cells) => cells[firstKey(cells, ['date', 'when', 'day'])] || '';
export const planFolder = (cells) => (cells[firstKey(cells, ['reel', 'folder', 'slug'])] || '').replace(/[`]/g, '').replace(/^reels\//, '').replace(/\/+$/, '').trim();

// The date and time the plan gives one reel: { row, date, time } or { problem }.
export function planSlot(root, reelDir) {
  const name = path.basename(path.resolve(reelDir));
  const hit = planRows(read(path.join(root, 'brand', 'plan.md'))).find((r) => planFolder(r.cells) === name);
  if (!hit) return { problem: `brand/plan.md has no row for ${name} (its "Reel (folder)" column must say ${name}): add the row, or give --at` };
  const m = planDate(hit.cells).match(/(\d{4}-\d{2}-\d{2})(?:[ T]+(\d{1,2}:\d{2}))?/);
  if (!m) return { problem: `the plan row for ${name} has no date: add one to brand/plan.md, or give --at` };
  if (!m[2]) return { problem: `the plan row for ${name} has a date (${m[1]}) but no time: add one (for example ${m[1]} 13:00), or give --at` };
  return { row: hit, date: m[1], time: m[2].padStart(5, '0') };
}
