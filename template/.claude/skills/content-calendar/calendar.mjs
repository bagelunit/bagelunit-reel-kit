#!/usr/bin/env node
// Content calendar and dashboard for one brand folder (a <brand>-reels copy of the kit's template).
//
//   node .claude/skills/content-calendar/calendar.mjs [brand folder] [--open] [--days 28] [--today YYYY-MM-DD]
//
// Reads the brand's own files (see lib.mjs) and writes brand/calendar.md and brand/dashboard.html, a snapshot you
// open in a browser. It posts, schedules, uploads and sends nothing, and it reads no account and no key.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { load, brandRoot, stageName, STAGES, NEXT, fmt, pct, signed, rate, registerBrand, writeAtomic, validDay, timesText, slotsByDay } from './lib.mjs';
import { html } from './page.mjs';
export { html };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LABEL = { posted: 'posted', scheduled: 'scheduled', planned: 'planned', late: 'planned, late' };
const ref = (it) => (it.system ? 'dashboard' : it.slug && !it.fromPlan ? `reels/${it.slug}` : 'brand/plan.md');
function ago(M, d, undated) {
  if (!d) return undated ? 'date not known' : 'not run yet';
  const days = Math.floor((M.now - d) / 864e5);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : days < 30 ? `${days} days ago` : M.pretty(M.dayKey(d));
}

/* ── brand/calendar.md ─────────────────────────────────────────────────────────────────────────────────────── */
export function markdown(M) {
  const { stats: S } = M, md = [];
  md.push(`# Content calendar: ${M.name}${M.handle ? ` (${M.handle})` : ''}`, '');
  md.push(`Made ${M.today} ${M.timeOf(M.now)} (${M.tz}) by /content-calendar from this folder's files. It is a snapshot: run /content-calendar again to refresh it. The dashboard is brand/dashboard.html.`, '');
  md.push('## Numbers', '');
  if (S.followers != null) md.push(`- Followers: ${fmt(S.followers)}${S.followers7 != null ? ` (${signed(S.followers7)} in 7 days)` : ''}`);
  md.push(`- Posted: ${S.posted} reel${S.posted === 1 ? '' : 's'} (${S.last7} in the last 7 days, ${S.last30} in the last 30)`);
  md.push(`- Scheduled: ${S.scheduled} · in progress: ${S.inProgress} · ideas: ${S.ideas}`);
  if (S.measured) md.push(`- From ${S.measured} ${S.source === 'Instagram' ? 'posts (Instagram)' : 'reels with numbers'}: ${fmt(S.views)} views in all, ${fmt(S.views30)} on posts from the last 30 days, median ${fmt(S.medianViews)} a post, engagement ${pct(S.engagement)} of reach${S.watch != null ? `, median watch ${S.watch.toFixed(1)} s` : ''}${S.skip != null ? `, median skip rate ${pct(S.skip)}` : ''}`);
  else md.push('- No numbers yet: connect Instagram (docs/dashboard.md) or add them with /analytics-readout.');
  md.push('', '## Needs you', '');
  if (M.attention.length) for (const a of M.attention) md.push(`- **${a.it.title}** (${ref(a.it)}): ${a.what}`);
  else md.push('- Nothing right now.');
  md.push('', '## Agents', '');
  for (const a of M.agents) md.push(`- **${a.name}** (${a.skills}): last ran ${ago(M, a.lastRun, a.undated)}; ${a.metrics.map(([v, l]) => `${v} ${l}`).join(', ')}. Next: ${a.next}`);
  md.push('', `## Last 7 days and next ${M.days}`, '');
  let any = false;
  for (let k = M.addDays(M.today, -7); k <= M.last; k = M.addDays(k, 1)) {
    const list = M.byDay[k] || [];
    const open = M.openTimesOn(k);
    if (!list.length && !open.length) continue;
    any = true;
    const head = `- ${M.pretty(k)}${k === M.today ? ' (today)' : ''}:`;
    const openText = open.length ? `${open.length === 1 ? 'open posting slot' : `${open.length} open posting slots`}${open[0] ? ` (${timesText(open, 8)})` : ''}` : '';
    md.push(`${head} ${[...list.map((e) => `${e.time ? e.time + ' ' : ''}${e.it.title} [${['posted', 'scheduled'].includes(e.kind) ? LABEL[e.kind] : `${LABEL[e.kind]}, ${stageName(e.it.stage).toLowerCase()}`}]`), ...(openText ? [openText] : [])].join('; ')}`);
  }
  if (!any) md.push('- Nothing dated yet. Add dates in brand/plan.md, or type /content-calendar plan.');
  md.push('', '## Every reel', '', '| Reel | Stage | Planned | Scheduled or posted | Views | Next step |', '|---|---|---|---|---|---|');
  for (const it of sorted(M)) {
    const when = it.postedAt ? `posted ${M.pretty(M.dayKey(it.postedAt))}` : it.scheduledAt ? `${M.pretty(M.dayKey(it.scheduledAt))} ${M.timeOf(it.scheduledAt)} (${it.scheduledVia})` : '';
    md.push(`| ${it.title.replace(/\|/g, '/')} (${ref(it)}) | ${stageName(it.stage)} | ${it.plannedAt ? M.pretty(M.dayKey(it.plannedAt)) : ''} | ${when} | ${it.nums ? fmt(it.nums.views) : ''} | ${NEXT[it.stage]} |`);
  }
  if (M.top.length) {
    md.push('', '## Top posts by views', '', '| Post | Posted | Views | Engagement | Saves | Shares | Avg watch |', '|---|---|---|---|---|---|---|');
    for (const p of M.top) md.push(`| ${p.title.replace(/\|/g, '/')} | ${p.at ? M.pretty(M.dayKey(p.at)) : ''} | ${fmt(p.nums.views)} | ${pct(rate(p.nums))} | ${fmt(p.nums.saves)} | ${fmt(p.nums.shares)} | ${p.nums.watch == null ? '–' : p.nums.watch.toFixed(1) + ' s'} |`);
  }
  return md.join('\n') + '\n';
}
function sorted(M) {
  const order = (it) => { const e = M.entryOf(it); return -STAGES.findIndex(([k]) => k === it.stage) * 1e13 + (e ? M.parseWhen(e.key) - 0 : 9e12); };
  return [...M.items].sort((a, b) => order(a) - order(b));
}

/* ── run ───────────────────────────────────────────────────────────────────────────────────────────────────── */
// A redraw that fails (a brand file with a value of the wrong kind, say) leaves one line in .cache/sync-error.log, which
// the session notice (notice.mjs) reports once; the next good redraw removes it. The hooks stay quiet either way.
export const ERROR_LOG = (root) => path.join(root, '.cache', 'sync-error.log');
export const FIX_HINT = 'look for a broken value in brand/brand.json, the other brand/*.json files and each reel\'s reel.json, test.json and approvals.md, then run  node .claude/skills/content-calendar/calendar.mjs  to see the error';
export function build(root, opts = {}) {
  let M;
  try {
    M = load(root, opts);
    writeAtomic(path.join(root, 'brand', 'calendar.md'), markdown(M));
    writeAtomic(path.join(root, 'brand', 'dashboard.html'), html(M));
  } catch (e) {
    const msg = String(e?.message || e).split(root).join('<brand folder>').replace(/\s+/g, ' ').slice(0, 300);
    if (!opts.today) { try { writeAtomic(ERROR_LOG(root), `${new Date().toISOString()} ${msg}\n`); } catch {} }
    throw e;
  }
  if (!opts.today) { fs.rmSync(ERROR_LOG(root), { force: true }); registerBrand(root, M.name); }   // listed in the all-brands overview
  return M;
}
export function openFile(file) {
  const win = process.platform === 'win32';
  const [cmd, args] = process.platform === 'darwin' ? ['open', [file]] : win ? ['cmd', ['/c', 'start', '""', `"${file}"`]] : ['xdg-open', [file]];
  try { spawn(cmd, args, { stdio: 'ignore', detached: true, windowsVerbatimArguments: win }).unref(); } catch {}
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const value = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
  const loose = args.filter((a, i) => !a.startsWith('--') && !['--days', '--today'].includes(args[i - 1]));
  const root = brandRoot(loose[0]);
  const days = Math.max(7, Math.min(120, Number(value('days')) || 28));
  if (args.includes('--today') && !validDay(value('today'))) { console.error(`--today must be a real date like 2030-01-06 (got "${value('today') ?? ''}").`); process.exit(1); }
  let M;
  try { M = build(root, { today: value('today'), days }); }
  catch (e) { console.error(`Could not draw the dashboard: ${e.message}\nTo fix it, ${FIX_HINT.replace(/, then run.*$/, '')}.`); process.exit(1); }
  const S = M.stats;
  console.log(`Content calendar for ${M.name}: ${S.posted} posted, ${S.scheduled} scheduled, ${S.inProgress} in progress, ${S.ideas} ideas${S.followers != null ? `, ${fmt(S.followers)} followers` : ''}.`);
  if (M.attention.length) { console.log('Needs you:'); for (const a of M.attention.slice(0, 8)) console.log(`  - ${a.it.title} (${ref(a.it)}): ${a.what}`); }
  if (M.postDays.length) console.log(`Open posting slots in the next ${M.days} days: ${M.openSlots.length ? `${M.openSlots.length}${M.postTimes.length > 1 ? `, on ${slotsByDay(M.openSlots).map(([k, t]) => `${M.pretty(k)} (${t.length})`).join(', ')}` : `: ${M.openSlots.map((x) => M.pretty(x.key)).join(', ')}`}` : 'none'}`);
  const out = path.join(root, 'brand', 'dashboard.html');
  console.log(`Wrote brand/calendar.md and ${out}`);
  if (args.includes('--open')) openFile(out);
}
