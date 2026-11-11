#!/usr/bin/env node
// Best times to post: a suggestion for brand.json -> posting.times from this brand's own numbers, never a rule of thumb.
//   1. Your own posts: how each post did against its platform's typical post (views divided by that platform's median),
//      grouped by the hour it went out in the brand's timezone. Only posts old enough to have settled (48 hours), and
//      only once there are enough of them (15 posts over 3 weeks); before that it says "not enough data yet".
//   2. Your audience's online hours, which the dashboard already reads from Instagram (lib.mjs load() -> audience.online).
//   3. Optionally, the hours the tracked competitors' winners went out (competitors-model.mjs): weak evidence, small weight.
// It keeps the times you already post at unless a different hour scores clearly better, so one odd week cannot flip a
// schedule. It writes brand/best-times.json (the Planner panel shows it) and changes nothing else on its own.
//
//   node .claude/skills/content-calendar/best-times.mjs [--brand <folder>] suggest            work it out and write best-times.json
//   node .claude/skills/content-calendar/best-times.mjs [--brand <folder>] apply [--yes]      show (or, with --yes, make) the change
//   node .claude/skills/content-calendar/best-times.mjs [--brand <folder>] status
//        [--json] [--today YYYY-MM-DD]
//
// apply (after the owner's yes) sets posting.times and moves the plan rows (brand/plan.md) that are still in the future and
// have no scheduled or posted reel, from each old time to its new one. A reel that is already scheduled is never moved.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { brandRoot, load, readJSON, read, median, num, writeAtomic, isObj } from './lib.mjs';
import { loadCompetitors } from './competitors-model.mjs';

const DAY = 864e5, HOUR = 36e5;
export const MIN_POSTS = 15;            // posts with numbers before the brand's own results count
export const MIN_DAYS = 21;             // ... spread over at least this many days
export const MIN_PER_HOUR = 3;          // posts at one hour before that hour is judged
export const SETTLE_HOURS = 48;         // a post younger than this has not shown what it can do
export const SPACING = 3;               // posts on one day are at least this many hours apart
export const FIRST_HOUR = 6, LAST_HOUR = 22;   // no suggestion outside 06:00 to 22:59
export const GAIN = 0.1;                // a new hour must score this much better than the one it replaces
export const MIN_COMP = 5;              // competitor winners before their hours count
export const RETIME_EVERY_DAYS = 7;     // autopilot.retime applies at most this often
const WEIGHTS = { own: 0.6, online: 0.3, comp: 0.1 };
const WD = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const p2 = (n) => String(n).padStart(2, '0');

const normTime = (t) => { const m = String(t ?? '').trim().match(/^(\d{1,2}):(\d{2})$/); return m && +m[1] < 24 && +m[2] < 60 ? `${p2(+m[1])}:${m[2]}` : ''; };
const timeList = (v) => [...new Set((Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[\s,;]+/) : []).map(normTime).filter(Boolean))].sort();
const hourOf = (t) => +t.slice(0, 2);

// a moment in the brand's timezone: its hour, minute and weekday
export function localParts(ms, tz) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' });
  const q = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { date: `${q.year}-${q.month}-${q.day}`, hour: +q.hour, minute: +q.minute, wd: String(q.weekday).toLowerCase().slice(0, 3) };
}

// every post the brand's connections brought back that has settled and has a view count: [{ at, platform, views }]
export function ownPosts(root, now = Date.now()) {
  const dir = path.join(root, 'brand');
  const out = [];
  const stamp = (v) => Date.parse(String(v || '').replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
  const ig = readJSON(path.join(dir, 'instagram.json'), {});
  for (const m of Array.isArray(ig.media) ? ig.media : []) out.push({ platform: 'instagram', at: stamp(m.timestamp), views: num(m.insights?.views ?? m.insights?.plays) });
  const fb = readJSON(path.join(dir, 'facebook.json'), {});
  for (const m of Array.isArray(fb.posts) ? fb.posts : []) out.push({ platform: 'facebook', at: stamp(m.timestamp), views: num(m.nums?.plays ?? m.nums?.views) });
  const th = readJSON(path.join(dir, 'threads.json'), {});
  for (const m of Array.isArray(th.posts) ? th.posts : []) out.push({ platform: 'threads', at: stamp(m.timestamp), views: num(m.nums?.views) });
  return out.filter((p) => Number.isFinite(p.at) && p.views != null && now - p.at >= SETTLE_HOURS * HOUR);
}

// the suggestion. `own` = ownPosts(), `online` = 24 numbers (audience online by local hour) or null, `winners` = [{ at }] or [].
export function suggest({ own = [], online = null, winners = [], current = [], tz = 'UTC', now = Date.now() } = {}) {
  const cur = timeList(current);
  const out = { at: new Date(now).toISOString(), timezone: tz, current: cur, suggested: cur, moves: [], reasons: [], evidence: {}, weekdays: null };

  // 1. your own posts, as a multiple of the platform's median
  const med = {};
  for (const pl of ['instagram', 'facebook', 'threads']) med[pl] = median(own.filter((p) => p.platform === pl).map((p) => p.views));
  const scored = own.filter((p) => med[p.platform] > 0).map((p) => ({ ...p, ratio: p.views / med[p.platform], ...localParts(p.at, tz) }));
  const days = scored.length ? Math.round((Math.max(...scored.map((p) => p.at)) - Math.min(...scored.map((p) => p.at))) / DAY) : 0;
  const ownEnough = scored.length >= MIN_POSTS && days >= MIN_DAYS;
  const byHour = Array.from({ length: 24 }, (_, h) => { const xs = scored.filter((p) => p.hour === h).map((p) => p.ratio); return { hour: h, n: xs.length, ratio: xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null }; });
  out.evidence.own = { posts: scored.length, days, enough: ownEnough, need: `${MIN_POSTS} posts over ${MIN_DAYS} days` };
  const byDay = WD.map((d) => { const xs = scored.filter((p) => p.wd === d).map((p) => p.ratio); return { day: d, n: xs.length, ratio: xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null }; }).filter((x) => x.n >= MIN_PER_HOUR);
  if (ownEnough && byDay.length >= 2) { const s = [...byDay].sort((a, b) => b.ratio - a.ratio); out.weekdays = { best: s[0], worst: s[s.length - 1] }; }

  // 2. the audience online
  const onlineOk = Array.isArray(online) && online.length === 24 && Math.max(...online) > 0;
  out.evidence.online = onlineOk;
  // 3. the competitors' winners
  const wHours = Array(24).fill(0);
  for (const w of winners) wHours[localParts(w.at, tz).hour]++;
  const compOk = winners.length >= MIN_COMP;
  out.evidence.competitors = { winners: winners.length, enough: compOk };

  if (!ownEnough && !onlineOk && !compOk) {
    return { ...out, status: 'not_enough_data', reasons: [`Not enough data yet: ${scored.length} of ${MIN_POSTS} posts with numbers (spread over ${days} of ${MIN_DAYS} days), and no audience online hours or competitor winners to go on. Posting times stay as they are.`] };
  }

  // a score from 0 to 1 per hour, from the evidence there is (weights renormalised over what exists)
  const maxOn = onlineOk ? Math.max(...online) : 1, maxComp = Math.max(1, ...wHours);
  const part = (h) => {
    const s = [];
    if (ownEnough) s.push([WEIGHTS.own, byHour[h].n >= MIN_PER_HOUR ? Math.min(1, Math.max(0, byHour[h].ratio / 2)) : 0.5]);   // a typical post (1x) scores 0.5, twice typical scores 1; an hour not tried scores 0.5 too
    if (onlineOk) s.push([WEIGHTS.online, online[h] / maxOn]);
    if (compOk) s.push([WEIGHTS.comp, wHours[h] / maxComp]);
    const w = s.reduce((a, [x]) => a + x, 0);
    return s.reduce((a, [x, v]) => a + x * v, 0) / w;
  };
  const score = Array.from({ length: 24 }, (_, h) => (h >= FIRST_HOUR && h <= LAST_HOUR ? part(h) : -1));
  out.byHour = byHour.map((b, h) => ({ hour: h, posts: b.n, ratio: b.ratio == null ? null : Math.round(b.ratio * 100) / 100, online: onlineOk ? Math.round(online[h] / maxOn * 100) / 100 : null, winners: wHours[h], score: Math.round(score[h] * 100) / 100 })).filter((x) => x.posts || x.winners || (x.online ?? 0) > 0);

  // keep today's hours; swap one only for an hour that scores clearly better and fits the spacing
  const keep = cur.length ? cur.map(hourOf) : [];
  const fits = (h, others) => others.every((o) => Math.abs(o - h) >= SPACING);
  let hours = [...keep];
  if (!hours.length) {                                            // no times yet: start from the three best that fit
    const order = [...score.keys()].filter((h) => score[h] >= 0).sort((a, b) => score[b] - score[a]);
    for (const h of order) { if (hours.length < 3 && fits(h, hours)) hours.push(h); }
  } else {
    for (let guard = 0; guard < 24; guard++) {
      const worst = [...hours].sort((a, b) => (score[a] < 0 ? -1 : score[a]) - (score[b] < 0 ? -1 : score[b]))[0];
      const others = hours.filter((h) => h !== worst);
      const best = [...score.keys()].filter((h) => !hours.includes(h) && score[h] >= 0 && fits(h, others)).sort((a, b) => score[b] - score[a])[0];
      if (best == null || score[best] < (score[worst] < 0 ? 0 : score[worst]) + GAIN) break;
      hours[hours.indexOf(worst)] = best;
    }
  }
  hours = [...new Set(hours)].sort((a, b) => a - b);
  const sug = hours.map((h) => cur.find((t) => hourOf(t) === h) || `${p2(h)}:00`);

  // reasons, one per new time, and one for each time that stays
  const why = (h) => [
    ownEnough && byHour[h].n >= MIN_PER_HOUR ? `your posts at ${p2(h)}:00 got ${byHour[h].ratio.toFixed(1)}x a typical post's views (${byHour[h].n} posts)` : '',
    onlineOk && online[h] / maxOn >= 0.7 ? `your audience is online around ${p2(h)}:00` : '',
    compOk && wHours[h] >= 2 ? `${wHours[h]} of ${winners.length} competitor winners went out around ${p2(h)}:00 (weak evidence)` : '',
  ].filter(Boolean);
  const gone = cur.filter((t) => !hours.includes(hourOf(t))), added = sug.filter((t) => !cur.includes(t));
  out.suggested = sug;
  out.moves = gone.map((from, i) => ({ from, to: added[i], reasons: why(hourOf(added[i])).length ? why(hourOf(added[i])) : ['it scores higher than ' + from + ' on the evidence there is'] })).filter((m) => m.to);
  if (!out.moves.length) { out.status = 'same'; out.reasons = [`Your posting times (${cur.join(', ') || 'none set'}) already match what your numbers say. Nothing to change.`]; }
  else {
    out.status = 'suggested';
    out.reasons = out.moves.map((m) => `${m.from} to ${m.to}: ${m.reasons.join('; ')}`);
  }
  if (!ownEnough) out.reasons.push(`Your own results are not used yet (${scored.length} of ${MIN_POSTS} posts, ${days} of ${MIN_DAYS} days): this is from ${[onlineOk ? 'your audience online hours' : '', compOk ? 'competitor winners' : ''].filter(Boolean).join(' and ')} only.`);
  if (out.weekdays) out.reasons.push(`By weekday, ${out.weekdays.best.day} posts did best (${out.weekdays.best.ratio.toFixed(1)}x) and ${out.weekdays.worst.day} worst (${out.weekdays.worst.ratio.toFixed(1)}x); the posting days are not changed.`);
  return out;
}

// ---- reading the brand ----
export function inputs(root, { now = Date.now() } = {}) {
  const brand = readJSON(path.join(root, 'brand', 'brand.json'), {});
  const posting = isObj(brand.posting) ? brand.posting : {};
  let tz = posting.timezone;
  try { if (tz) new Intl.DateTimeFormat('en', { timeZone: tz }); else tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; }
  const current = timeList(posting.times).length ? timeList(posting.times) : timeList(posting.time);
  let online = null;
  try { online = load(root, { today: new Date(now).toISOString().slice(0, 10) })?.audience?.online?.hours || null; } catch { online = null; }
  let winners = [];
  try {
    const c = loadCompetitors(root, { now });
    winners = c.accounts.flatMap((a) => a.posts.filter((p) => p.ratio != null && p.ratio >= 1.5 && p.at > now - 90 * DAY));
  } catch { winners = []; }
  return { own: ownPosts(root, now), online, winners, current, tz, now, brand };
}

export function run(root, { now = Date.now() } = {}) {
  const i = inputs(root, { now });
  const s = suggest(i);
  const file = path.join(root, 'brand', 'best-times.json');
  const before = readJSON(file, {});
  const keep = before.applied_at ? { applied_at: before.applied_at } : {};   // remember when it was last applied
  writeAtomic(file, JSON.stringify({ ...s, ...keep }, null, 2) + '\n');
  return { ...s, ...keep };
}

// ---- apply ----
const scheduledOrPosted = (root, folder) => {
  if (!folder) return false;
  const t = read(path.join(root, 'reels', folder, 'approvals.md'));
  return /\bScheduled on\b|\bPosted (on|as)\b/.test(t);
};
// the plan rows that would move: future, not scheduled or posted, at an old time. Returns [{ line, folder, date, from, to }]
export function planMoves(root, moves, { now = Date.now(), tz = 'UTC' } = {}) {
  const text = read(path.join(root, 'brand', 'plan.md'));
  const map = Object.fromEntries(moves.map((m) => [m.from, m.to]));
  const lines = text.split('\n'), out = [];
  const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
  let head = null;
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim().startsWith('|')) { head = null; continue; }
    if (lines[i + 1] && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1]) && !/^\s*\|?\s*:?-{2,}/.test(lines[i])) { head = cells(lines[i]).map((h) => h.toLowerCase()); i++; continue; }
    if (!head) continue;
    const c = cells(lines[i]), di = head.findIndex((h) => /^(date|when|day)/.test(h)), fi = head.findIndex((h) => /^(reel|folder|slug)/.test(h));
    const m = (c[di] || '').match(/^(\d{4}-\d{2}-\d{2})[ T]+(\d{1,2}):(\d{2})$/);
    if (!m) continue;
    const from = `${p2(+m[2])}:${m[3]}`, to = map[from];
    if (!to) continue;
    const folder = (c[fi] || '').replace(/[`]/g, '').replace(/^reels\//, '').replace(/\/+$/, '').trim();
    if (scheduledOrPosted(root, folder)) continue;
    const nowLocal = localParts(now, tz), dayNow = nowLocal.date, tNow = `${p2(nowLocal.hour)}:${p2(nowLocal.minute)}`;
    if (m[1] < dayNow || (m[1] === dayNow && from <= tNow)) continue;          // already past (the plan's own clock is the brand's timezone): leave it
    out.push({ line: i, folder, date: m[1], from, to });
  }
  return out;
}

export function apply(root, { yes = false, now = Date.now() } = {}) {
  const file = path.join(root, 'brand', 'best-times.json');
  const s = readJSON(file, null);
  if (!s || s.status !== 'suggested' || !s.moves?.length) return { changed: false, reason: 'There is no suggestion to apply: run suggest first (or the times already match).' };
  const brand = readJSON(path.join(root, 'brand', 'brand.json'), {});
  const tz = s.timezone || brand.posting?.timezone || 'UTC';
  const rows = planMoves(root, s.moves, { now, tz });
  if (!yes) return { changed: false, preview: true, times: s.suggested, was: s.current, rows };
  // posting.times
  const b = JSON.parse(fs.readFileSync(path.join(root, 'brand', 'brand.json'), 'utf8'));
  b.posting = isObj(b.posting) ? b.posting : {};
  b.posting.times = s.suggested;
  writeAtomic(path.join(root, 'brand', 'brand.json'), JSON.stringify(b, null, 2) + '\n');
  // the plan rows: only the time inside the date cell changes
  if (rows.length) {
    const pf = path.join(root, 'brand', 'plan.md');
    const lines = fs.readFileSync(pf, 'utf8').split('\n');
    for (const r of rows) lines[r.line] = lines[r.line].replace(new RegExp(`${r.date}[ T]+0?${+r.from.slice(0, 2)}:${r.from.slice(3)}`), `${r.date} ${r.to}`);
    writeAtomic(pf, lines.join('\n'));
  }
  writeAtomic(file, JSON.stringify({ ...s, status: 'applied', applied_at: new Date(now).toISOString(), applied_rows: rows.length }, null, 2) + '\n');
  return { changed: true, times: s.suggested, was: s.current, rows };
}

// the refresh's step: write the suggestion, and (only when autopilot.retime is on) apply it at most once a week
export function retimeStep(root, brand, say = () => {}, { now = Date.now() } = {}) {
  const s = run(root, { now });
  if (s.status === 'not_enough_data') { say('Best times: not enough data yet, posting times unchanged.'); return s; }
  if (s.status !== 'suggested') { say('Best times: your posting times already match your numbers.'); return s; }
  const last = Date.parse(s.applied_at || '');
  if (brand?.autopilot?.retime === true && !(last && now - last < RETIME_EVERY_DAYS * DAY)) {
    const r = apply(root, { yes: true, now });
    say(`Best times: moved ${(s.current || []).join(', ')} to ${r.times.join(', ')}${r.rows.length ? ` and ${r.rows.length} plan row${r.rows.length === 1 ? '' : 's'} not yet scheduled` : ''} (autopilot.retime is on).`);
    return { ...s, applied: true };
  }
  say(`Best times: a change is suggested (${s.moves.map((m) => `${m.from} to ${m.to}`).join(', ')}). Run /content-calendar best-times to see why.`);
  return s;
}

// ---- command line ----
const isMain = () => { try { return !!process.argv[1] && fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(path.resolve(process.argv[1])); } catch { return false; } };
if (isMain()) {
  const args = process.argv.slice(2);
  const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
  const bi = args.indexOf('--brand');
  const cmd = args.filter((a, i) => !a.startsWith('--') && !(bi >= 0 && i === bi + 1) && args[i - 1] !== '--today')[0] || 'suggest';
  const root = brandRoot(flag('--brand'));
  const today = flag('--today');
  const now = today ? Date.parse(`${today}T12:00:00Z`) : Date.now();
  const json = args.includes('--json');
  if (cmd === 'apply') {
    const r = apply(root, { yes: args.includes('--yes'), now });
    if (json) console.log(JSON.stringify(r, null, 2));
    else if (r.reason) console.log(r.reason);
    else {
      console.log(`${r.changed ? 'Changed' : 'Would change'} posting.times: ${r.was.join(', ') || 'none'} -> ${r.times.join(', ')}`);
      console.log(r.rows.length ? `${r.changed ? 'Moved' : 'Would move'} ${r.rows.length} plan row${r.rows.length === 1 ? '' : 's'} (future, not scheduled):` : 'No plan row needs to move.');
      for (const x of r.rows) console.log(`  ${x.date}  ${x.from} -> ${x.to}  ${x.folder || '(idea, no reel yet)'}`);
      if (!r.changed) console.log('Nothing was written. Run again with --yes after the owner says yes.');
    }
  } else {
    const s = cmd === 'status' ? readJSON(path.join(root, 'brand', 'best-times.json'), null) || run(root, { now }) : run(root, { now });
    if (json) console.log(JSON.stringify(s, null, 2));
    else {
      console.log(`Best times (${s.timezone}): ${s.status.replace('_', ' ')}`);
      console.log(`  now: ${s.current.join(', ') || 'none set'}   suggested: ${s.suggested.join(', ') || 'none'}`);
      for (const r of s.reasons) console.log(`  - ${r}`);
      console.log(`  evidence: ${s.evidence.own?.posts ?? 0} own posts over ${s.evidence.own?.days ?? 0} days${s.evidence.own?.enough ? '' : ` (need ${s.evidence.own?.need})`}; audience online hours ${s.evidence.online ? 'yes' : 'no'}; ${s.evidence.competitors?.winners ?? 0} competitor winners`);
      if (s.status === 'suggested') console.log('  To make the change (after the owner says yes): node .claude/skills/content-calendar/best-times.mjs apply --yes');
    }
  }
}
