#!/usr/bin/env node
// How often to post: a suggestion from real numbers, never a rule of thumb about a niche.
//   1. Accounts like yours: brand/research/<username>.csv (research.mjs competitor, or any export with a timestamp
//      column) gives how many posts and reels a week each account makes, and brand/research/accounts.json their
//      followers, so the ones doing best for their size can be told apart.
//   2. What you can keep up: the voice credits left (the engine's budget.py --left) and how many reels a week the
//      owner says they can approve (--approve, saved for next time). Talking-head reels use no voice credits.
//   3. Your own numbers: once 8 posted reels have numbers across 4 or more finished weeks, whether the busier weeks
//      got fewer views per reel than the quieter ones.
// Prints the suggestion with its reasons and writes brand/how-often.json, which the dashboard's Planner panel shows.
//
//   node .claude/skills/content-calendar/how-often.mjs [--brand <folder>] [--approve <reels a week>] [--weeks 8]
//        [--voice-left <characters>] [--offline] [--today YYYY-MM-DD] [--json]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { brandRoot, load, readJSON, read, csv, median, num, writeAtomic, isObj, fmt } from './lib.mjs';

const DAY = 864e5;
export const PER_REEL = 800;                    // voice characters for a 45 second reel, when the brand has no log yet
const round1 = (x) => Math.round(x * 10) / 10;
const word = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// one account's pace and how well it does for its size, from its rows (any order)
export function accountPace(rows, { pulledAt, mediaCount, followers, weeks = 8, now = Date.now() } = {}) {
  const posts = rows.map((r) => ({
    at: Date.parse(String(r.timestamp || r.date || r.posted || '').replace(/([+-]\d{2})(\d{2})$/, '$1:$2')),
    reel: /reel|clip/i.test(r.type || r.media_product_type || ''), typed: Boolean(r.type || r.media_product_type),
    views: num(r.views), likes: num(r.likes), comments: num(r.comments),
  })).filter((p) => Number.isFinite(p.at)).sort((a, b) => b.at - a.at);
  if (posts.length < 3) return null;
  const end = Number.isFinite(Date.parse(pulledAt || '')) ? Date.parse(pulledAt) : Math.min(now, posts[0].at + DAY);
  const start = end - weeks * 7 * DAY;
  const inWin = posts.filter((p) => p.at > start && p.at <= end);
  // Meta returns the latest 50 posts or so: a fast poster's read can stop inside the window, so the rate comes from
  // the days the read covers (an account that has fewer posts than were asked for simply started inside the window)
  const oldest = posts[posts.length - 1].at;
  const stopped = mediaCount != null ? mediaCount > posts.length : posts.length >= 25;
  const days = oldest > start && stopped ? Math.max(1, (end - oldest) / DAY) : weeks * 7;
  const typed = posts.some((p) => p.typed);
  const views = median(posts.map((p) => p.views));
  const eng = median(posts.map((p) => (p.likes == null && p.comments == null ? null : (p.likes || 0) + (p.comments || 0))));
  const score = followers ? (views != null ? views / followers : eng != null ? eng / followers : null) : null;
  return {
    perWeek: round1((inWin.length / days) * 7), reelsPerWeek: typed ? round1((inWin.filter((p) => p.reel).length / days) * 7) : null,
    read: posts.length, lastPost: new Date(posts[0].at).toISOString().slice(0, 10), followers: followers ?? null,
    medianViews: views, medianEngaged: eng, score, scoreKind: score == null ? null : views != null ? 'views per follower' : 'likes and comments per follower',
  };
}

// accounts like yours: the range, the median and the median of the better half for their size
export function nichePace(accounts) {
  const withPace = accounts.filter((a) => a.pace);
  if (!withPace.length) return null;
  const reels = withPace.filter((a) => a.pace.reelsPerWeek != null).length >= Math.ceil(withPace.length / 2);
  const rate = (a) => (reels ? a.pace.reelsPerWeek ?? a.pace.perWeek : a.pace.perWeek);
  const rates = withPace.map(rate).sort((a, b) => a - b);
  const scored = withPace.filter((a) => a.pace.score != null).sort((a, b) => b.pace.score - a.pace.score);
  const best = scored.length >= 3 ? scored.slice(0, Math.ceil(scored.length / 2)) : null;
  return {
    unit: reels ? 'reels' : 'posts', n: withPace.length, min: rates[0], max: rates[rates.length - 1], median: round1(median(rates)),
    best: best ? { n: best.length, names: best.map((a) => a.username), median: round1(median(best.map(rate))), by: best[0].pace.scoreKind } : null,
  };
}

// the brand's own numbers: did the busier finished weeks get fewer views per reel than the quieter ones?
export function ownPace(M) {
  const thisWeek = M.weekStart(M.today), weekAgo = M.now - 7 * DAY;
  const posted = M.items.filter((x) => x.postedAt && M.weekStart(M.dayKey(x.postedAt)) < thisWeek);
  const weeks = {};
  for (const x of posted) {
    const w = (weeks[M.weekStart(M.dayKey(x.postedAt))] ||= { posts: 0, views: [] });
    w.posts++;
    if (x.nums?.views != null && x.postedAt < weekAgo) w.views.push(x.nums.views);   // a reel needs a week to gather views
  }
  const last4 = [1, 2, 3, 4].map((n) => M.addDays(thisWeek, -7 * n));
  const current = round1(last4.reduce((t, k) => t + (weeks[k]?.posts || 0), 0) / 4);
  const measured = Object.values(weeks).filter((w) => w.views.length);
  const reels = measured.reduce((t, w) => t + w.views.length, 0);
  const out = { reels, weeks: measured.length, current, signal: 'not enough', ratio: null };
  if (reels < 8 || measured.length < 4) return out;
  const cut = median(measured.map((w) => w.posts));
  const busy = measured.filter((w) => w.posts > cut), quiet = measured.filter((w) => w.posts <= cut);
  if (!busy.length || !quiet.length) return { ...out, signal: 'same every week' };
  const ratio = median(busy.map((w) => median(w.views))) / (median(quiet.map((w) => median(w.views))) || 1);
  return { ...out, ratio: Math.round(ratio * 100) / 100, busyPosts: median(busy.map((w) => w.posts)), quietPosts: median(quiet.map((w) => w.posts)),
    signal: ratio >= 0.9 ? 'holds' : ratio < 0.75 ? 'drops' : 'unclear' };
}

// what the owner can keep up: voice credits and approvals
export function capacity({ voice, perReel = PER_REEL, approve = null, now = Date.now() }) {
  let voiceWeek = null, voiceNote = '';
  if (voice && voice.left != null) {
    const reset = Date.parse(voice.reset || '');
    const payg = /payg|pay.?as/i.test(voice.tier || '');
    const toReset = Number.isFinite(reset) && reset > now ? (reset - now) / (7 * DAY) : null;
    const monthly = !payg && voice.limit ? (voice.limit / perReel) * 12 / 52 : null;          // a plan that refills each month
    const nowWeek = toReset != null && toReset <= 6 ? voice.left / perReel / Math.max(0.5, toReset) : voice.left / perReel / 4;
    voiceWeek = Math.max(0, Math.floor(monthly ?? nowWeek));                // a monthly plan: what it refills; else what is on hand
    voiceNote = monthly != null
      ? `your voice plan covers about ${Math.floor(monthly)} reels a week (${Number(voice.limit).toLocaleString('en-US')} characters a month, about ${perReel} a reel)`
      : `your voice credits cover about ${voiceWeek} reels a week for the next 4 weeks (${Number(voice.left).toLocaleString('en-US')} characters left, about ${perReel} a reel${payg ? ', pay as you go' : ''})`;
  }
  const limits = [voiceWeek, approve].filter((x) => x != null);
  return { perReel, voiceWeek, voiceNote, approve, limit: limits.length ? Math.min(...limits) : null };
}

// the suggestion and why
export function suggest({ niche, own, cap, postedSoFar }) {
  const why = [];
  let base = null;
  const target = niche ? niche.best?.median ?? niche.median : null;
  if (target != null) {
    base = target;
    why.push(niche.best ? `the ${niche.best.n} accounts like yours doing best for their size post a median of ${niche.best.median} ${niche.unit} a week` : `accounts like yours post a median of ${niche.median} ${niche.unit} a week`);
  }
  if (own.signal === 'drops') {
    base = Math.min(base ?? own.current, Math.max(1, own.quietPosts ?? own.current));
    why.push(`your busier weeks (${own.busyPosts} a week) got ${Math.round((1 - own.ratio) * 100)}% fewer views per reel than your quieter ones (${own.quietPosts} a week)`);
  } else if (own.signal === 'holds') {
    if (base == null) base = Math.max(own.current + 1, Math.round(own.current * 1.25));
    why.push(`your busier weeks (${own.busyPosts} a week) kept their views per reel, so posting more has not cost you reach so far`);
  }
  if (base == null) return null;
  let perWeek = Math.max(1, Math.round(base));
  if (cap.limit != null && perWeek > cap.limit) {
    perWeek = Math.max(1, cap.limit);
    why.push(cap.approve != null && cap.limit === cap.approve ? `you can approve about ${cap.approve} a week` : cap.voiceNote);
  }
  let start = null;
  if (postedSoFar < 4 && perWeek > 7) { start = Math.max(3, Math.round(perWeek / 2)); why.push(`start at ${start} a week and build up over the first month, while the approvals settle into a routine`); }
  return { perWeek, perDay: perWeek >= 7 ? round1(perWeek / 7) : null, start, why };
}

function voiceAccount(args) {
  const vi = args.indexOf('--voice-left');
  if (vi >= 0) return { left: Number(args[vi + 1]), limit: null, reset: null, tier: 'given' };
  if (args.includes('--offline')) return null;
  const tool = path.join(os.homedir(), '.claude', 'skills', 'bagelunit-reels', 'tools', 'budget.py');
  if (!fs.existsSync(tool)) return null;
  for (const py of process.platform === 'win32' ? ['python', 'py', 'python3'] : ['python3', 'python']) {
    const r = spawnSync(py, [tool, '--left', '--json'], { encoding: 'utf8', timeout: 30000 });
    if (r.error) continue;
    try { const v = JSON.parse(String(r.stdout).trim().split('\n').pop()); return v && v.left != null ? v : null; } catch { return null; }
  }
  return null;
}

export function readAccounts(root, { weeks, now, own }) {
  const dir = path.join(root, 'brand', 'research');
  const meta = readJSON(path.join(dir, 'accounts.json'), {});
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.csv$/i.test(f) && !/^hashtag-/i.test(f)) : [];
  return files.map((f) => {
    const username = f.replace(/\.csv$/i, '').toLowerCase();
    if (own && username === own) return null;                                      // the brand's own account is not a peer
    const m = isObj(meta[username]) ? meta[username] : {};
    const rows = csv(read(path.join(dir, f))).rows;
    return { username, pace: accountPace(rows, { pulledAt: m.pulled_at, mediaCount: m.media_count, followers: m.followers, weeks, now }) };
  }).filter(Boolean);
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  const root = brandRoot(opt('--brand'));
  const M = load(root, { today: opt('--today') });
  const weeks = Math.min(26, Math.max(2, Number(opt('--weeks')) || 8));
  const saved = readJSON(path.join(root, 'brand', 'how-often.json'), {});
  const approve = opt('--approve') != null ? Math.max(1, Math.round(Number(opt('--approve')))) || null : saved.capacity?.approve ?? null;
  const own = String(M.handle || '').replace(/^@/, '').toLowerCase();

  const accounts = readAccounts(root, { weeks, now: M.now.getTime(), own });
  const niche = nichePace(accounts);
  const mine = ownPace(M);
  const perReel = Math.round(M.costs?.perReel || PER_REEL);
  const voice = voiceAccount(args);
  const cap = capacity({ voice, perReel, approve, now: M.now.getTime() });
  const postedSoFar = M.items.filter((x) => x.postedAt).length;
  const s = suggest({ niche, own: mine, cap, postedSoFar });

  const result = { at: M.now.toISOString(), weeks, accounts: accounts.map((a) => ({ username: a.username, ...(a.pace || { note: 'fewer than 3 dated posts' }) })),
    niche, capacity: { perReel, voice: voice ? { left: voice.left, limit: voice.limit, reset: voice.reset, tier: voice.tier } : null, voiceWeek: cap.voiceWeek, approve, limit: cap.limit },
    own: mine, suggestion: s, target: Number(M.brand.batch?.max_reels) || null };
  writeAtomic(path.join(root, 'brand', 'how-often.json'), JSON.stringify(result, null, 2) + '\n');
  if (args.includes('--json')) { console.log(JSON.stringify(result, null, 2)); return; }

  const out = [`How often to post: ${M.name}`, ''];
  if (niche) {
    out.push(`Accounts like yours (${word(niche.n, 'account')} read, last ${weeks} weeks): ${niche.min} to ${niche.max} ${niche.unit} a week, median ${niche.median}.${niche.best ? ` The ${niche.best.n} doing best for their size (${niche.best.by}) post a median of ${niche.best.median}.` : ' Followers are needed to tell which do best for their size (read them with research.mjs competitor).'}`);
    for (const a of accounts) out.push(a.pace ? `  @${a.username}: ${a.pace.reelsPerWeek ?? a.pace.perWeek} ${a.pace.reelsPerWeek != null ? 'reels' : 'posts'} a week${a.pace.followers != null ? `, ${fmt(a.pace.followers)} followers` : ''}${a.pace.score != null ? `, ${a.pace.scoreKind === 'views per follower' ? `${round1(a.pace.score)} views per follower` : `${(a.pace.score * 100).toFixed(1)}% engaged per post`}` : ''} (last post ${a.pace.lastPost})` : `  @${a.username}: fewer than 3 dated posts, left out`);
  } else out.push('Accounts like yours: none read yet. Read 3 to 5 with  node .claude/skills/content-calendar/research.mjs competitor <username>  (Unified or Facebook Login), or put an export with a timestamp column in brand/research/<username>.csv.');
  out.push(cap.voiceNote ? `What you can keep up: ${cap.voiceNote}${approve != null ? `; you said you can approve about ${approve} a week` : ''}. Talking-head reels use no voice credits.` : approve != null ? `What you can keep up: you said you can approve about ${approve} a week (voice credits not read).` : 'What you can keep up: not known yet (voice credits not read; say how many reels a week you can approve with --approve).');
  out.push(mine.signal === 'not enough' ? `Your own numbers: not enough yet (${word(mine.reels, 'reel')} with numbers across ${word(mine.weeks, 'week')}; 8 reels across 4 weeks are needed).`
    : mine.signal === 'same every week' ? `Your own numbers: you posted the same number every week (${mine.current}), so there is nothing to compare yet.`
    : `Your own numbers: busier weeks (${mine.busyPosts} a week) got ${Math.round(mine.ratio * 100)}% of the views per reel of quieter weeks (${mine.quietPosts} a week): ${mine.signal === 'holds' ? 'more posts have not cost reach' : mine.signal === 'drops' ? 'more posts spread the views thinner' : 'no clear difference'}.`);
  out.push('');
  if (s) {
    out.push(`Suggestion: ${s.perWeek} ${niche?.unit || 'reels'} a week${s.perDay ? ` (about ${s.perDay} a day)` : ''}${s.start ? `, starting at ${s.start}` : ''}.`);
    out.push(`Why: ${s.why.join('; ')}.`);
    if (result.target != null && result.target !== s.perWeek) out.push(`Your plan is set to ${result.target} a week (batch.max_reels).`);
    out.push('Set it: /content-calendar days (posting days and times), and batch.max_reels in brand/brand.json.');
  } else out.push('Suggestion: none yet, so the kit default stays (2 or 3 reels a week to start). Read a few accounts like yours, or post for a month, then run this again.');
  out.push('', `Wrote brand/how-often.json. Run it again about once a month; the numbers move.`);
  console.log(out.join('\n'));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => { console.error(`How often: ${e.message}`); process.exit(1); });
}
