#!/usr/bin/env node
// The learning step of the reel loop (/reel-loop): reads what this brand's posted reels (trial reels first) actually did and
// writes what to change in the next one. Reading and writing brand/loop.md and brand/loop.json only: it never posts, schedules,
// approves or sends anything, and every reel it leads to still goes through Gates A, B and C and the owner's yes.
//
//   node .claude/skills/content-calendar/loop.mjs [--brand <folder>] [--json] [--no-write]
//
// What it uses (all numbers come from brand/instagram.json when Instagram is connected, else brand/insights.csv):
//   views, skip rate (people who left in the first 3 seconds: the hook), average watch time (how long the rest stay: the middle),
//   saves and shares per reach. Settings in brand.json -> "loop" (all optional):
//     viral_views_multiple  how many times the brand's median views counts as a breakout (default 5)
//     viral_min_views       and at least this many views (default 5000)
//     min_hours             hours a reel must have been out before it is judged (default 72)
//     min_views_to_judge    views needed before its skip rate and watch time mean anything (default 500)
//     stall_after           judged reels in a row with no better skip rate before it says "stalled" (default 6)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { brandRoot, load, median, writeAtomic, isObj } from './lib.mjs';

const HOUR = 36e5;
const num = (v, d) => (Number.isFinite(Number(v)) && v !== '' && v !== null ? Number(v) : d);
const pct = (v) => (v == null ? 'n/a' : `${Math.round(v * 100)}%`);
const fmt = (n) => (n == null ? 'n/a' : Math.round(n).toLocaleString('en-US'));
const sec = (v) => (v == null ? 'n/a' : `${v.toFixed(1)} s`);
const med = (list) => { const l = list.filter((v) => v != null && Number.isFinite(v)); return l.length ? median(l) : null; };

export function settings(brand) {
  const s = isObj(brand?.loop) ? brand.loop : {};
  return {
    viralMultiple: num(s.viral_views_multiple, 5), viralMinViews: num(s.viral_min_views, 5000), minHours: num(s.min_hours, 72),
    minViews: num(s.min_views_to_judge, 500), stallAfter: Math.max(3, num(s.stall_after, 6)),
  };
}

// Judge every posted reel with numbers. Pure: takes the dashboard model (lib.load) and a clock.
export function analyse(M, { now = Date.now() } = {}) {
  const S = settings(M.brand);
  const posted = M.items.filter((x) => x.slug && x.postedAt && x.nums && x.nums.views != null);
  const all = posted.map((x) => ({
    slug: x.slug, title: x.title, hook: x.hook || '', goal: (x.goal || '').toLowerCase(), angle: (x.angle || '').toLowerCase(), trial: !!x.trial,
    at: x.postedAt, hours: (now - +x.postedAt) / HOUR, views: x.nums.views, skip: x.nums.skip ?? null, watch: x.nums.watch ?? null,
    saves: x.nums.reach ? (x.nums.saves || 0) / x.nums.reach : null, shares: x.nums.reach ? (x.nums.shares || 0) / x.nums.reach : null,
  }));
  const medViews = med(all.map((r) => r.views));
  const judged = all.filter((r) => r.hours >= S.minHours && r.views >= S.minViews).sort((a, b) => a.at - b.at);
  const waiting = all.filter((r) => !judged.includes(r)).map((r) => ({
    slug: r.slug, why: r.hours < S.minHours ? `out ${Math.max(0, Math.round(r.hours))} h, judged after ${S.minHours} h` : `${fmt(r.views)} views, judged from ${fmt(S.minViews)}`,
  }));
  const medSkip = med(judged.map((r) => r.skip)), medWatch = med(judged.map((r) => r.watch));

  // each judged reel: where it loses people
  for (const r of judged) {
    const hookWeak = r.skip != null && medSkip != null && r.skip > medSkip * 1.15;
    const midWeak = r.watch != null && medWatch != null && r.watch < medWatch * 0.85;
    r.diagnosis = hookWeak && midWeak ? 'loses people at the start and again in the middle'
      : hookWeak ? 'loses people in the first 3 seconds: the hook'
      : midWeak ? 'people stay past the hook, then leave in the middle: tighten the middle, cut the slowest stretch'
      : r.skip != null || r.watch != null ? 'holds people at least as well as the brand\'s middle reel' : 'no skip rate or watch time yet';
    r.ratio = medViews ? r.views / medViews : null;
    r.viral = r.views >= Math.max(S.viralMinViews, S.viralMultiple * (medViews || 0)) && (r.skip == null || medSkip == null || r.skip <= medSkip);
  }

  // what is working: groups need 2 or more reels, or it says there is not enough
  const groups = (key) => {
    const g = {};
    for (const r of judged) if (r[key]) (g[r[key]] ||= []).push(r);
    return Object.entries(g).filter(([, l]) => l.length >= 2).map(([name, l]) => ({ name, n: l.length, skip: med(l.map((r) => r.skip)), watch: med(l.map((r) => r.watch)), views: med(l.map((r) => r.views)) }))
      .sort((a, b) => (a.skip ?? 9) - (b.skip ?? 9));
  };
  const byAngle = groups('angle'), byGoal = groups('goal');

  // is it still improving: the best skip rate in the last `stallAfter` judged reels against the best before them
  const skips = judged.map((r) => r.skip).filter((v) => v != null);
  let trend = 'not enough';
  if (skips.length >= S.stallAfter + 2) {
    const recent = skips.slice(-S.stallAfter), before = skips.slice(0, -S.stallAfter);
    trend = Math.min(...recent) < Math.min(...before) - 0.005 ? 'improving' : 'stalled';
  } else if (skips.length >= 3) trend = 'early';

  const viral = judged.filter((r) => r.viral).sort((a, b) => b.views - a.views);
  const connected = M.items.some((x) => x.nums) || !!M.ig;
  const status = !connected || !all.length ? 'needs-numbers' : viral.length ? 'found' : trend === 'stalled' ? 'stalled' : waiting.length && !judged.length ? 'waiting' : 'running';
  return { S, status, medViews, medSkip, medWatch, all, judged, waiting, viral, byAngle, byGoal, trend };
}

// the next experiment: one variable, with the reason. Never a number the data does not support.
export function nextStep(A) {
  const { S, status, judged, byAngle, medSkip, medWatch, trend } = A;
  if (status === 'needs-numbers') return { variable: null, text: 'There are no reel numbers yet. Connect Instagram (`/content-calendar connect instagram`) or add rows to brand/insights.csv, then post the first trial reel. Until then the loop has nothing to learn from.' };
  if (status === 'found') return { variable: 'repeat', text: `A reel broke out (${A.viral.map((r) => r.slug).join(', ')}). Do not change everything: make the next reel in the same format on a new topic, keep its hook shape and angle, and compare its skip rate with the breakout's.` };
  if (judged.length < 3) return { variable: 'hook', text: `Only ${judged.length} reel${judged.length === 1 ? '' : 's'} judged so far, too few to say what works. Keep the format the same and change one thing, the hook, so each trial reel teaches something: post two versions of one reel as trial reels (/ab-hook-tester).` };
  const worst = [...judged].filter((r) => r.skip != null).sort((a, b) => b.skip - a.skip)[0];
  const hookWeak = worst && medSkip != null && worst.skip > medSkip * 1.15;
  const lines = [];
  if (byAngle.length >= 2) lines.push(`Angle: "${byAngle[0].name}" holds people best (skip ${pct(byAngle[0].skip)} over ${byAngle[0].n} reels), "${byAngle.at(-1).name}" worst (${pct(byAngle.at(-1).skip)} over ${byAngle.at(-1).n}). Use the first.`);
  else lines.push('Angle: not enough reels per angle yet (needs 2 or more of each), so no angle is called best.');
  if (trend === 'stalled') lines.push(`The last ${S.stallAfter} reels did not beat the best skip rate before them. Change a bigger thing: a new format, a new goal, or a topic from /comment-mining.`);
  const variable = trend === 'stalled' ? 'format' : hookWeak ? 'hook' : (medWatch != null && judged.some((r) => r.watch != null && r.watch < medWatch * 0.85)) ? 'middle' : 'topic';
  lines.push(variable === 'hook' ? `Variable: the hook. The weakest start was ${worst.slug} (skip ${pct(worst.skip)} against a median of ${pct(medSkip)}).`
    : variable === 'middle' ? 'Variable: the middle. Skip rates are fine but average watch time is low: shorter, a new beat every 2 to 4 seconds, cut the slowest stretch.'
    : variable === 'format' ? 'Variable: the format.' : 'Variable: the topic. Hooks hold people, so find what they ask for next.');
  return { variable, text: lines.join(' ') };
}

export function brief(M, A, N) {
  const L = [];
  const name = M.name || 'this brand';
  L.push(`# Reel loop: ${name}`, '', `Updated ${M.today || new Date().toISOString().slice(0, 10)}. Status: **${A.status}**${A.trend !== 'not enough' ? `, skip-rate trend: ${A.trend}` : ''}.`, '');
  L.push(`Breakout means ${fmt(Math.max(A.S.viralMinViews, A.S.viralMultiple * (A.medViews || 0)))} views or more (${A.S.viralMultiple}x the median of ${fmt(A.medViews)}, at least ${fmt(A.S.viralMinViews)}) with a skip rate no worse than the median (${pct(A.medSkip)}). A reel is judged ${A.S.minHours} hours after it goes out and from ${fmt(A.S.minViews)} views.`, '');
  L.push('## Next reel', '', N.text, '', 'It still goes through the fact check, Gates A, B and C, a `/reel-review` of 90 or more, and the owner\'s yes to its time and platforms. Nothing posts by itself.', '');
  L.push('## Judged reels', '');
  if (!A.judged.length) L.push('None yet.', '');
  else {
    L.push('| Reel | Out | Views | x median | Skip (first 3 s) | Avg watch | Angle | Where it loses people |', '|---|---|---|---|---|---|---|---|');
    for (const r of [...A.judged].reverse().slice(0, 15)) L.push(`| ${r.slug}${r.trial ? ' (trial)' : ''}${r.viral ? ' **breakout**' : ''} | ${new Date(r.at).toISOString().slice(0, 10)} | ${fmt(r.views)} | ${r.ratio == null ? 'n/a' : r.ratio.toFixed(1) + 'x'} | ${pct(r.skip)} | ${sec(r.watch)} | ${r.angle || '-'} | ${r.diagnosis} |`);
    L.push('');
  }
  if (A.waiting.length) L.push('## Waiting', '', ...A.waiting.map((w) => `- ${w.slug}: ${w.why}`), '');
  L.push('## Reading the numbers', '', '- **Skip rate** is the share who left in the first 3 seconds: it measures the hook. Lower is better.', '- **Average watch time** is how long viewers stay: low watch with a normal skip rate means they leave in the middle.', '- Trial reels go to non-followers first, so these numbers are a cold audience, which is the honest test of a hook.', '');
  return L.join('\n');
}

export function run(root, { now = Date.now(), write = true } = {}) {
  const M = load(root);
  const A = analyse(M, { now });
  const N = nextStep(A);
  const state = {
    updated_at: new Date(now).toISOString(), status: A.status, trend: A.trend, next_variable: N.variable,
    judged: A.judged.length, waiting: A.waiting.length, breakouts: A.viral.map((r) => r.slug), median_views: A.medViews, median_skip: A.medSkip, median_watch_s: A.medWatch,
    settings: A.S,
  };
  if (write) {
    writeAtomic(path.join(root, 'brand', 'loop.md'), brief(M, A, N) + '\n');
    writeAtomic(path.join(root, 'brand', 'loop.json'), JSON.stringify(state, null, 2) + '\n');
  }
  return { state, analysis: A, next: N };
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  const argv = process.argv.slice(2);
  const bi = argv.indexOf('--brand');
  const root = brandRoot(bi >= 0 ? argv[bi + 1] : undefined);
  const r = run(root, { write: !argv.includes('--no-write') });
  if (argv.includes('--json')) console.log(JSON.stringify(r.state, null, 2));
  else console.log(`Reel loop: ${r.state.status}. ${r.state.judged} judged, ${r.state.waiting} waiting${r.state.breakouts.length ? `, breakout: ${r.state.breakouts.join(', ')}` : ''}.\nNext: ${r.next.text}${argv.includes('--no-write') ? '' : '\nWrote brand/loop.md and brand/loop.json.'}`);
}
