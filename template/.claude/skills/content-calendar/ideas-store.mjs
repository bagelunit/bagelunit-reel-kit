#!/usr/bin/env node
// Edit or remove the post ideas in brand/ideas.md (the table the dashboard's "Post ideas from what is working" reads).
// Used by the live dashboard (serve.mjs: Edit and Remove buttons) and from the command line:
//   node .claude/skills/content-calendar/ideas-store.mjs [brand folder] list
//   node .claude/skills/content-calendar/ideas-store.mjs [brand folder] remove <number|id>
//   node .claude/skills/content-calendar/ideas-store.mjs [brand folder] edit <number|id> --idea "..." [--hook ...] [--goal ...] [--angle ...] [--status ...] [--basedon ...]
// A removed idea is not lost: its row moves to brand/ideas-removed.md (with the date), so it can be put back by hand and the
// Ideator knows not to suggest it again. Only this idea's row changes; every other line of the file stays as it was.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { brandRoot, writeAtomic } from './lib.mjs';

const FIELDS = { idea: ['idea', 'topic', 'title'], hook: ['hook'], goal: ['goal'], angle: ['angle'], status: ['status'], basedon: ['based on', 'source', 'from'], date: ['date'] };
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
const cells = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
export const ideaId = (date, idea) => crypto.createHash('sha1').update(`${String(date || '').trim()}|${String(idea || '').trim()}`).digest('hex').slice(0, 8);
const clean = (v, max = 600) => String(v == null ? '' : v).replace(/[\r\n]+/g, ' ').replace(/\|/g, '/').replace(/\s+/g, ' ').trim().slice(0, max);   // a "|" would split the table cell

function load(root) {
  const file = path.join(root, 'brand', 'ideas.md');
  if (!fs.existsSync(file)) return { file, lines: [], head: [], rows: [] };
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const tbl = lines.map((l, i) => [l, i]).filter(([l]) => l.trim().startsWith('|'));
  if (tbl.length < 2) return { file, lines, head: [], rows: [] };
  const head = cells(tbl[0][0]).map(norm);
  const col = (names) => head.findIndex((h) => names.some((n) => h === n || h.startsWith(n)));
  const idx = Object.fromEntries(Object.entries(FIELDS).map(([k, names]) => [k, col(names)]));
  const rows = [];
  for (const [l, i] of tbl.slice(1)) {
    if (/^\|[\s:|-]+\|?$/.test(l.trim())) continue;
    const c = cells(l);
    if (!c.some((x) => x && !/^[-:]+$/.test(x))) continue;
    const get = (k) => (idx[k] >= 0 ? c[idx[k]] || '' : '');
    if (!get('idea')) continue;
    rows.push({ line: i, cells: c, idea: get('idea'), hook: get('hook'), goal: get('goal'), angle: get('angle'), status: (get('status') || 'suggested').toLowerCase(), basedon: get('basedon'), date: get('date'), id: ideaId(get('date'), get('idea')) });
  }
  return { file, lines, head, rows, idx };
}

export function list(root) { return load(root).rows; }

function find(db, ref) {
  const n = Number(ref);
  const byNum = Number.isInteger(n) && n >= 1 && String(n) === String(ref).trim() ? db.rows[n - 1] : null;   // the dashboard's numbering
  return byNum || db.rows.find((r) => r.id === String(ref).trim()) || null;
}

export function remove(root, ref) {
  const db = load(root); const row = find(db, ref);
  if (!row) throw new Error('No idea matches that number or id.');
  const logFile = path.join(root, 'brand', 'ideas-removed.md');
  const origHead = cells(db.lines.find((l) => l.trim().startsWith('|')));
  let log = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : `# Removed post ideas\n\nRows taken off the dashboard (brand/ideas.md). To put one back, paste its row (without the first date) into brand/ideas.md. The Ideator does not suggest these again.\n\n| Removed | ${origHead.join(' | ')} |\n|${'---|'.repeat(origHead.length + 1)}\n`;
  if (!log.endsWith('\n')) log += '\n';
  log += `| ${new Date().toISOString().slice(0, 10)} | ${row.cells.join(' | ')} |\n`;
  writeAtomic(logFile, log);
  const lines = db.lines.slice(); lines.splice(row.line, 1);
  writeAtomic(db.file, lines.join('\n'));
  return { removed: row.idea };
}

export function edit(root, ref, changes) {
  const db = load(root); const row = find(db, ref);
  if (!row) throw new Error('No idea matches that number or id.');
  const c = row.cells.slice();
  while (c.length < db.head.length) c.push('');
  let did = 0;
  for (const [k, v] of Object.entries(changes || {})) {
    if (!(k in FIELDS) || k === 'date' || db.idx[k] < 0) continue;
    const val = clean(v, k === 'idea' ? 300 : 600);
    if (k === 'idea' && !val) throw new Error('An idea needs some words.');
    if (k === 'status' && !/^[a-z][a-z -]{0,24}$/i.test(val)) throw new Error('Status is one or two plain words, such as suggested, planned or rejected.');
    c[db.idx[k]] = val; did++;
  }
  if (!did) throw new Error('Nothing to change.');
  const lines = db.lines.slice(); lines[row.line] = `| ${c.join(' | ')} |`;
  writeAtomic(db.file, lines.join('\n'));
  return { id: ideaId(c[db.idx.date] ?? '', c[db.idx.idea]), idea: c[db.idx.idea] };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const cmdAt = a.findIndex((x) => ['list', 'remove', 'edit'].includes(x));
  const root = brandRoot(a.slice(0, Math.max(cmdAt, 0)).find((x) => !x.startsWith('--')));
  const [cmd, ref] = [a[cmdAt], a[cmdAt + 1]];
  try {
    if (cmd === 'list') list(root).forEach((r, i) => console.log(`${String(i + 1).padStart(2)}  ${r.id}  [${r.status}]  ${r.idea}`));
    else if (cmd === 'remove' && ref) console.log(`Removed: ${remove(root, ref).removed} (kept in brand/ideas-removed.md)`);
    else if (cmd === 'edit' && ref) {
      const ch = {}; for (const k of Object.keys(FIELDS)) { const i = a.indexOf(`--${k}`); if (i > 0) ch[k] = a[i + 1]; }
      console.log(`Saved: ${edit(root, ref, ch).idea}`);
    } else console.log('usage: ideas-store.mjs [brand folder] list | remove <number|id> | edit <number|id> --idea "..." [--hook ..] [--goal ..] [--angle ..] [--status ..] [--basedon ..]');
  } catch (e) { console.error(e.message); process.exit(1); }
}
