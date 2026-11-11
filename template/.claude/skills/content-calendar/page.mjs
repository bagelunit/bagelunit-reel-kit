// The content dashboard page: one self-contained HTML file (fonts, styles, motion and data inside), so the same file
// works offline, on the local Wi-Fi server and on any host. Drawn from the model in lib.mjs.
//
// Look: paper and a faint grid, heavy capitals for titles, spaced capital labels with square icons, big numbers with
// a short bar in the brand's colour, a navy band for the agents, corner-bracket frames, sharp corners, fine lines.
// Motion: sections rise in, numbers count up, charts draw, cards respond; the agents' loop always moves.
// Everything holds still for anyone whose system asks for reduced motion.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stageName, STAGES, fmt, pct, signed, rate, clip, median, timesText } from './lib.mjs';
import { TAGS, firstLine } from './competitors-model.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLIENT = fs.readFileSync(path.join(HERE, 'client.js'), 'utf8');   // the calendar views, the pipeline and the reel card
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// a link to a post from Meta's API, the publisher or approvals.md: only an https address is kept, anything else
// (javascript:, data:, a file path) is dropped and the text shows without a link. client.js checks the same.
const safeUrl = (u) => { const s = String(u ?? '').trim(); return /^https:\/\/[^\s"'<>\\]+$/i.test(s) ? s : ''; };
const agentHref = (h) => (/^[a-z][a-z0-9+.-]*:/i.test(String(h ?? '')) ? safeUrl(h) : String(h ?? ''));   // a file next to the page, or an https link
const font = (w) => { try { return `data:font/woff2;base64,${fs.readFileSync(path.join(HERE, 'fonts', `poppins-${w}.woff2`)).toString('base64')}`; } catch { return null; } };
const LABEL = { posted: 'Posted', scheduled: 'Scheduled', planned: 'Planned', late: 'Date passed' };
const ref = (it) => (it.system ? 'dashboard' : it.slug && !it.fromPlan ? `reels/${it.slug}` : 'brand/plan.md');
const withCommands = (s) => esc(s).replace(/(\/[a-z][a-z-]+(?: (?:plan|days|connect instagram|connect telegram|auto))?)/g, '<code>$1</code>');

/* ── icons: one line style, 24 px grid, drawn here so the page needs nothing from the web ───────────────────── */
const ICON = {
  bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z',
  pen: 'M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3zM14 8l3 3',
  cal: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  chart: 'M4 20h16M7 16v-5M12 16V7M17 16v-8',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  trend: 'M4 17l6-6 4 4 6-7M15 8h5v5',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
  loop: 'M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
};
const icon = (name, cls = 'ic') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON[name]}"/></svg>`;
const label = (name, text, extra = '') => `<div class="label${extra}"><span class="chip">${icon(name)}</span>${esc(text)}</div>`;

function ago(M, d) {
  if (!d) return 'Not run yet';
  const days = Math.floor((M.now - d) / 864e5);
  return days <= 0 ? 'Today' : days === 1 ? 'Yesterday' : days < 30 ? `${days} days ago` : M.pretty(M.dayKey(d));
}
const agentState = (M, d) => (!d ? 'idle' : M.now - d < 864e5 ? 'live' : M.now - d < 7 * 864e5 ? 'recent' : 'idle');

/* ── small charts ──────────────────────────────────────────────────────────────────────────────────────────── */
function spark(values, w = 120, h = 30) {
  const v = values.filter((x) => x != null);
  if (v.length < 2) return '';
  const lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || 1;
  const pts = v.map((x, i) => `${((i * w) / (v.length - 1)).toFixed(1)},${(h - 3 - ((x - lo) * (h - 6)) / span).toFixed(1)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true" data-draw><polyline pathLength="1" points="${pts}"/></svg>`;
}
function minibars(values, w = 120, h = 30) {
  if (!values.some((x) => x)) return '';
  const hi = Math.max(...values), bw = w / values.length;
  return `<svg class="minibars" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true" data-draw>${values.map((x, i) => `<rect x="${(i * bw + 1.5).toFixed(1)}" y="${(h - (x / hi) * h).toFixed(1)}" width="${(bw - 3).toFixed(1)}" height="${((x / hi) * h).toFixed(1)}" style="--i:${i}"/>`).join('')}</svg>`;
}
function followerChart(M, all = M.followerRows, connected = Boolean(M.ig)) {
  const rows = all.slice(-90);
  if (rows.length < 2) return `<p class="empty">${connected ? 'The line starts once there are two days of counts. Each refresh adds one.' : 'Connect Instagram to record a follower count each day (docs/dashboard.md).'}</p>`;
  const W = 640, H = 200, P = 28, ys = rows.map((r) => r.followers), lo = Math.min(...ys), hi = Math.max(...ys), span = hi - lo || 1;
  const x = (i) => P + (i * (W - 2 * P)) / (rows.length - 1), y = (v) => H - P - ((v - lo) * (H - 2 * P)) / span;
  const pts = rows.map((r, i) => `${x(i).toFixed(1)},${y(r.followers).toFixed(1)}`).join(' ');
  const gl = [0.25, 0.5, 0.75].map((f) => `<line x1="${P}" x2="${W - P}" y1="${(P + f * (H - 2 * P)).toFixed(1)}" y2="${(P + f * (H - 2 * P)).toFixed(1)}" class="gl"/>`).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Followers from ${esc(fmt(rows[0].followers))} on ${esc(M.pretty(rows[0].key))} to ${esc(fmt(rows.at(-1).followers))} on ${esc(M.pretty(rows.at(-1).key))}" data-draw>
${gl}<polygon class="area" points="${P},${H - P} ${pts} ${x(rows.length - 1)},${H - P}"/><polyline class="line" pathLength="1" points="${pts}"/>
<circle class="end" cx="${x(rows.length - 1).toFixed(1)}" cy="${y(rows.at(-1).followers).toFixed(1)}" r="4.5"/>
<text x="${P}" y="${H - 6}" class="axis">${esc(M.pretty(rows[0].key, { month: 'short', day: 'numeric' }))}</text><text x="${W - P}" y="${H - 6}" class="axis" text-anchor="end">${esc(M.pretty(rows.at(-1).key, { month: 'short', day: 'numeric' }))}</text>
<text x="${x(rows.length - 1) - 10}" y="${y(rows.at(-1).followers) - 12}" class="val" text-anchor="end">${esc(rows.at(-1).followers.toLocaleString('en-US'))}</text></svg>`;
}
function weekChart(M, weeks = M.weeks) {
  if (!weeks.some((w) => w.views)) return '<p class="empty">Views by week show here once posts have numbers.</p>';
  const W = 640, H = 200, P = 24, n = weeks.length, bw = (W - 2 * P) / n, hi = Math.max(1, ...weeks.map((w) => w.views)), now = M.weekStart(M.today);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Views by the week posts went out, last 8 weeks" data-draw>${weeks.map((w, i) => {
    const h = (w.views / hi) * (H - 2 * P - 16), x = P + i * bw + 8, y = H - P - h, cw = bw - 16;
    return `<g style="--i:${i}"><rect class="bar${w.start === now ? ' now' : ''}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${cw.toFixed(1)}" height="${Math.max(h, w.views ? 2 : 0).toFixed(1)}"><title>${esc(`Week of ${M.pretty(w.start)}: ${w.posts} post${w.posts === 1 ? '' : 's'}, ${fmt(w.views)} views`)}</title></rect>
${w.views ? `<text x="${(x + cw / 2).toFixed(1)}" y="${(y - 6).toFixed(1)}" class="val" text-anchor="middle">${esc(fmt(w.views))}</text>` : ''}<text x="${(x + cw / 2).toFixed(1)}" y="${H - 6}" class="axis" text-anchor="middle">${esc(M.pretty(w.start, { month: 'short', day: 'numeric' }))}</text></g>`;
  }).join('')}<line x1="${P}" x2="${W - P}" y1="${H - P}" y2="${H - P}" class="base"/></svg>`;
}
function retention(M) {
  if (!M.recent.length) return '<p class="empty">Watch time and skip rate show here once reels have them. Connecting Instagram fills both; <code>/analytics-readout</code> takes them by hand.</p>';
  const mw = median(M.recent.map((p) => p.nums.watch)), ms = median(M.recent.map((p) => p.nums.skip));
  const vs = (v, m, up) => v == null || m == null ? '' : v === m ? '<span class="eq" title="Same as median">=</span>' : (up ? v > m : v < m) ? '<span class="up" title="Better than median">▲</span>' : '<span class="down" title="Worse than median">▼</span>';
  return `<div class="scroll"><table><thead><tr><th>Reel</th><th class="hide-sm">Posted</th><th class="r">Avg watch</th><th class="r">Skip rate</th><th class="r">Views</th></tr></thead><tbody>${M.recent.map((p) => `<tr><td>${esc(clip(p.title, 56))}</td><td class="nowrap hide-sm">${esc(M.pretty(M.dayKey(p.at)))}</td><td class="r">${p.nums.watch == null ? '–' : esc(p.nums.watch.toFixed(1) + ' s')} ${vs(p.nums.watch, mw, true)}</td><td class="r">${esc(pct(p.nums.skip))} ${vs(p.nums.skip, ms, false)}</td><td class="r">${esc(fmt(p.nums.views))}</td></tr>`).join('')}</tbody></table></div><p class="foot">▲ better than the median of these reels, ▼ worse. Median watch ${mw == null ? '–' : mw.toFixed(1) + ' s'}, skip ${pct(ms)}.</p>`;
}

/* ── the agents: a loop that always moves, and a little picture of each job ─────────────────────────────────── */
const AGENT_ICON = { ideator: 'bulb', writer: 'pen', planner: 'cal', analyst: 'chart' };
function loopGraph(M) {
  const pos = { ideator: [80, 70], writer: [320, 70], planner: [320, 250], analyst: [80, 250] };
  const inLoop = M.stats.inProgress + M.stats.scheduled;
  const dots = [0, 1, 2, 3, 4, 5].map((i) => `<circle r="${i % 2 ? 2.6 : 3.6}" class="dot${i % 2 ? ' small' : ''}"><animateMotion dur="9s" begin="${(-i * 1.5).toFixed(1)}s" repeatCount="indefinite" rotate="auto"><mpath href="#loop-path"/></animateMotion></circle>`).join('');
  const nodes = M.agents.map((a) => {
    const [x, y] = pos[a.key], st = agentState(M, a.lastRun);
    return `<a href="#agent-${a.key}" aria-label="${esc(a.name)}"><g class="node ${st}" transform="translate(${x} ${y})"><g class="breathe"><rect x="-34" y="-34" width="68" height="68" class="box"/><g transform="translate(-14 -14) scale(1.1667)"><path d="${ICON[AGENT_ICON[a.key]]}" class="nic"/></g></g>
<circle cx="34" cy="-34" r="5" class="light"/><circle cx="34" cy="-34" r="5" class="ring"/>
<text y="${y < 160 ? -48 : 56}" text-anchor="middle" class="nlabel">${esc(a.name.toUpperCase())}</text></g></a>`;
  }).join('');
  return `<svg class="loop" viewBox="0 0 400 320" role="img" aria-label="The four agents in a loop: Ideator, Hook and Script, Planner, Analyst, then back to the Ideator">
<path id="loop-path" d="M80 70 H320 V250 H80 Z" class="track"/>${dots}
<g class="center"><text x="200" y="152" text-anchor="middle" class="cnum" data-count="${inLoop}" data-fmt="int">${inLoop}</text><text x="200" y="178" text-anchor="middle" class="clabel">REELS IN THE LOOP</text></g>
${nodes}</svg>`;
}
function scene(key) {
  if (key === 'ideator') return `<svg class="scene" viewBox="0 0 160 70" aria-hidden="true">${[0, 1, 2].map((i) => `<g class="idea" style="--i:${i}"><rect x="${18 + i * 44}" y="18" width="36" height="34" class="card"/><path d="M${26 + i * 44} 30h20M${26 + i * 44} 38h14" class="ln"/></g>`).join('')}</svg>`;
  if (key === 'writer') return `<svg class="scene" viewBox="0 0 160 70" aria-hidden="true"><rect x="14" y="12" width="132" height="46" class="card"/>${[0, 1, 2].map((i) => `<rect x="24" y="${21 + i * 11}" width="${[100, 84, 58][i]}" height="4" class="type" style="--i:${i}"/>`).join('')}<rect x="84" y="41" width="2" height="9" class="caret"/></svg>`;
  if (key === 'planner') return `<svg class="scene" viewBox="0 0 160 70" aria-hidden="true">${Array.from({ length: 14 }, (_, i) => `<rect x="${17 + (i % 7) * 18.5}" y="${14 + Math.floor(i / 7) * 22}" width="15" height="18" class="cell"/>`).join('')}<rect x="17" y="14" width="15" height="18" class="drop"/></svg>`;
  return `<svg class="scene" viewBox="0 0 160 70" aria-hidden="true"><path d="M14 60h132" class="ln"/>${[0, 1, 2, 3, 4].map((i) => `<rect x="${24 + i * 24}" y="14" width="14" height="46" class="rise" style="--i:${i}"/>`).join('')}</svg>`;
}

export const fontFaces = () => [400, 500, 600, 800].map((w) => [w, font(w)]).filter(([, u]) => u).map(([w, u]) => `@font-face{font-family:'Poppins';font-style:normal;font-weight:${w};font-display:swap;src:url(${u}) format('woff2')}`).join('');
export { esc, icon, label };

/* ── colours that stay readable whatever the brand's accent is ────────────────────────────────────────────────── */
// WCAG contrast: lines and marks need 3:1 on the paper, text needs 4.5:1 on the paper and on the light accent tint,
// and accent text in the navy band needs 4.5:1 on navy. A colour that falls short is stepped toward ink (or white).
const rgbOf = (hex) => { let h = hex.replace('#', ''); if (h.length === 3) h = [...h].map((c) => c + c).join(''); const n = parseInt(h.slice(0, 6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
export const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const mixRgb = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const hexOf = (rgb) => '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('');
function stepTo(base, grounds, target, toward) {
  for (let t = 0; t <= 1.0001; t += 0.02) { const c = mixRgb(base, toward, t); if (grounds.every((g) => contrast(c, g) >= target)) return hexOf(c); }
  return hexOf(toward);
}
export function palette(accent) {
  const a = rgbOf(accent), paper = rgbOf('#EFEFEE'), raised = rgbOf('#FBFBFD'), ink = rgbOf('#16121F'), navy = rgbOf('#14142B');
  const soft = mixRgb(raised, a, 0.12);
  return { raw: accent, line: stepTo(a, [paper, raised], 3, ink), text: stepTo(a, [paper, raised, soft], 4.5, ink), onNavy: stepTo(a, [navy, rgbOf('#1C1C3A')], 4.5, raised), soft: hexOf(soft) };
}

/* ── the page ──────────────────────────────────────────────────────────────────────────────────────────────── */
export function html(M) {
  const S = M.stats, P = palette(M.accent);
  const fonts = fontFaces();
  const updated = M.ig?.pulled_at && new Date(M.ig.pulled_at) > M.now - 864e5 ? new Date(M.ig.pulled_at) : M.now;

  // the number strip: each number with a short bar, its change and a tiny trend
  const fr = M.followerRows.slice(-30).map((r) => r.followers);
  const GO = { Followers: ['#trends'], Views: ['#trends'], Engagement: ['#top'], Posted: ['#pipeline', 'posted'], 'In the works': ['#pipeline'] };
  const metric = (lab, value, f, raw, sub, chart = '') => `<a class="metric" href="${GO[lab][0]}"${GO[lab][1] ? ` data-stage-pick="${GO[lab][1]}"` : ''}><div class="mlabel">${esc(lab)}</div><div class="mnum"${raw != null ? ` data-count="${raw}" data-fmt="${f}"` : ''}>${esc(value)}</div><span class="mbar" aria-hidden="true"></span><div class="msub">${sub}</div>${chart}</a>`;
  const delta = (n, unit) => n == null ? '' : `<span class="${n > 0 ? 'up' : n < 0 ? 'down' : 'eq'}">${n > 0 ? '▲' : n < 0 ? '▼' : '='} ${esc(signed(n).replace(/^\+/, ''))}</span> ${esc(unit)}`;
  const strip = [
    metric('Followers', S.followers == null ? '–' : fmt(S.followers), 'k', S.followers, S.followers == null ? 'Connect Instagram to see them' : `${delta(S.followers7, 'in 7 days')}`, spark(fr)),
    metric('Views', fmt(S.views30), 'k', S.views30, S.measured ? `on posts from the last 30 days` : 'No numbers yet', minibars(M.weeks.map((w) => w.views))),
    metric('Engagement', pct(S.engagement), 'pct', S.engagement, 'likes, comments, saves and shares, of reach'),
    metric('Posted', String(S.last7), 'int', S.last7, `this week · ${S.last30} in 30 days`, minibars(M.weeks.map((w) => w.posts))),
    metric('In the works', String(S.inProgress + S.scheduled), 'int', S.inProgress + S.scheduled, `${S.scheduled} scheduled · ${S.ideas} idea${S.ideas === 1 ? '' : 's'} waiting`),
  ].join('');

  // with Facebook or Threads connected: a platform switch (All, Instagram, Facebook, Threads) and, for each platform,
  // its own number strip, trends and top posts. Sections that exist only for Instagram say so on the other platforms.
  const PFS = M.platforms ? ['all', 'instagram', ...Object.keys(M.others)] : [];
  const PF_DEFAULT = 'all';
  const pfAttr = (k) => (PFS.length ? ` data-pf="${k}"${k === PF_DEFAULT ? '' : ' hidden'}` : '');
  const pfIn = (list) => (PFS.length ? ` data-pf-in="${list}"${list.split(' ').includes(PF_DEFAULT) ? '' : ' hidden'}` : '');
  const VIEW_WORD = { all: 'views and plays', facebook: 'plays', threads: 'views' };
  const platformStrip = (V) => [
    metric('Followers', V.followers == null ? '–' : fmt(V.followers), 'k', V.followers, V.followers == null ? 'Not read yet' : delta(V.followers7, 'in 7 days') || (V.key === 'all' ? 'on every connected platform' : ''), spark(V.followerRows.slice(-30).map((r) => r.followers))),
    metric('Views', fmt(V.views30), 'k', V.views30, V.measured ? `${VIEW_WORD[V.key]} on posts from the last 30 days` : 'No numbers yet', minibars(V.weeks.map((w) => w.views))),
    metric('Engagement', pct(V.engagement), 'pct', V.engagement, 'likes, comments and shares, of views'),
    metric('Posted', String(V.last7), 'int', V.last7, `posts this week · ${V.last30} in 30 days`, minibars(V.weeks.map((w) => w.posts))),
    metric('In the works', String(S.inProgress + S.scheduled), 'int', S.inProgress + S.scheduled, `${S.scheduled} scheduled · ${S.ideas} idea${S.ideas === 1 ? '' : 's'} waiting`),
  ].join('');
  const stripHtml = PFS.length ? PFS.map((k) => `<div class="strip"${pfAttr(k)} data-reveal-group>${k === 'instagram' ? strip : platformStrip(M.platforms[k])}</div>`).join('')
    : `<div class="strip" data-reveal-group>${strip}</div>`;

  const PRIO = { 1: ['Now', 'now'], 2: ['Soon', 'soon'], 3: ['Later', 'later'] };
  const needs = M.attention.length ? `<ol class="needs">${M.attention.map((a, i) => `<li${a.it.id ? ` data-id="${esc(a.it.id)}"` : ''}><span class="n">${String(i + 1).padStart(2, '0')}</span><div class="nb"><div class="nt">${a.it.id ? `<button type="button" class="link" data-open="${esc(a.it.id)}">${esc(a.it.title)}</button>` : `<b>${esc(a.it.title)}</b>`}<span class="prio ${PRIO[a.p][1]}">${PRIO[a.p][0]}</span></div><div class="nw">${withCommands(a.what)}</div></div></li>`).join('')}</ol>`
    : '<p class="empty">Nothing needs you right now.</p>';

  // the next 14 days: up to AG_MAX reels a day (several posts a day would make it endless), then a link to the day
  const AG_MAX = 6;
  const openLine = (open) => (open.length ? `<div class="ag open"><i class="sw slot" aria-hidden="true"></i><span>${open.length === 1 ? 'Open posting slot' : `${open.length} open posting slots`}${open[0] ? ` · ${esc(timesText(open))}` : ''}</span></div>` : '');
  const agenda = [];
  for (let k = M.today; k <= M.addDays(M.today, 13); k = M.addDays(k, 1)) {
    const list = M.byDay[k] || [], open = M.openTimesOn(k);
    if (!list.length && !open.length && !M.isPostDay(k)) continue;
    const more = list.length - AG_MAX;
    agenda.push(`<li class="${k === M.today ? 'today' : ''}"><div class="when"><span>${esc(M.pretty(k, { weekday: 'short' }))}</span><b>${esc(M.pretty(k, { month: 'short', day: 'numeric' }))}</b></div><div class="what">${list.slice(0, more > 1 ? AG_MAX : list.length).map((e) => `<div class="ag" data-id="${esc(e.it.id)}"><i class="sw ${e.kind}" aria-hidden="true"></i><span>${e.time ? `<b>${esc(e.time)}</b> ` : ''}<button type="button" class="link" data-open="${esc(e.it.id)}">${esc(e.it.title)}</button></span><em>${esc(LABEL[e.kind])}</em></div>`).join('')}${more > 1 ? `<div class="ag ag-more"><i aria-hidden="true"></i><span><button type="button" class="link" data-goto-day="${k}">${more} more on this day</button></span></div>` : ''}${openLine(open)}${!list.length && !open.length ? '<div class="ag open"><i class="sw" aria-hidden="true"></i><span class="quiet">Every slot has gone by</span></div>' : ''}</div></li>`);
  }
  const open14 = M.openSlots.filter((x) => x.key <= M.addDays(M.today, 13)).length;
  const agendaHtml = agenda.length ? `<ol class="agenda">${agenda.join('')}</ol>` : '<p class="empty">Nothing dated yet. <code>/content-calendar days</code> sets your posting days, then <code>/content-calendar plan</code> fills them.</p>';

  const agents = M.agents.map((a) => {
    const st = agentState(M, a.lastRun);
    return `<article class="agent ${st}" id="agent-${a.key}"><span class="c tl"></span><span class="c tr"></span><span class="c bl"></span><span class="c br"></span>
<header><span class="aicon">${icon(AGENT_ICON[a.key])}<i class="light" aria-hidden="true"></i></span><div><h3>${esc(a.name)}</h3><p class="when">${st === 'live' ? 'Made something today' : esc(`Last made something: ${a.undated ? 'date not known' : ago(M, a.lastRun).toLowerCase()}`)}</p></div></header>
${scene(a.key)}
<p class="job">${esc(a.job.replace(/^./, (c) => c.toUpperCase()))}.</p>
<dl class="am">${a.metrics.map(([v, l]) => `<div><dt>${esc(l)}</dt><dd>${esc(String(v))}</dd></div>`).join('')}</dl>
<details${a.output.length ? '' : ' class="none"'}><summary>${a.output.length ? `What it made <span>${a.output.length}</span>` : 'Nothing made yet'}</summary><ul>${a.output.map((o) => `<li${o.id ? ` data-id="${esc(o.id)}"` : ''}>${o.id ? `<button type="button" class="link" data-open="${esc(o.id)}">${esc(clip(o.text, 80))}</button>` : agentHref(o.href) ? `<a href="${esc(agentHref(o.href))}">${esc(clip(o.text, 80))}</a>` : esc(clip(o.text, 80))}<span>${esc(o.note)}</span></li>`).join('')}</ul></details>
<footer><span>Next</span><code>${esc(a.next)}</code><small>${esc(a.skills)}</small></footer></article>`;
  }).join('');

  const month = (key) => {
    const [y, m] = key.split('-').map(Number), mm = String(m).padStart(2, '0');
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate(), lead = (M.weekday(`${y}-${mm}-01`) + 6) % 7;
    let cells = '<div class="day blank"></div>'.repeat(lead);
    for (let d = 1; d <= days; d++) {
      const k = `${y}-${mm}-${String(d).padStart(2, '0')}`, list = M.byDay[k] || [];
      const open = k <= M.last ? M.openTimesOn(k) : [], slot = open.length > 0, extra = list.length > 4 ? list.length - 3 : 0;
      cells += `<div class="day${k === M.today ? ' today' : ''}${k < M.today ? ' past' : ''}${slot ? ' slot' : ''}"><span class="dn">${d}</span>${(extra ? list.slice(0, 3) : list).map((e) => `<div class="ev ${e.kind}" title="${esc(`${e.it.title} · ${stageName(e.it.stage)} · ${ref(e.it)}`)}">${e.time ? `<b>${esc(e.time)}</b> ` : ''}<span>${esc(clip(e.it.title, 42))}</span></div>`).join('')}${extra ? `<div class="ev-more">+${extra} more</div>` : ''}${slot ? `<div class="open">${open.length > 1 ? `${open.length} open` : `Open${open[0] ? ` · ${esc(open[0])}` : ''}`}</div>` : ''}</div>`;
    }
    const title = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    return { title, grid: `<div class="month-grid">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((w) => `<div class="wd">${w}</div>`).join('')}${cells}</div>` };
  };
  const months = [M.today];
  for (let i = 1, [y, m] = M.today.split('-').map(Number); i < 4; i++) { const k = new Date(Date.UTC(y, m - 1 + i, 1)).toISOString().slice(0, 10); if (k <= M.last) months.push(k); }
  const fallbackMonth = (() => { const mo = month(months[0]); return `<h3 class="cal-fallback-title">${esc(mo.title)}</h3>${mo.grid}`; })();

  const needIds = new Set(M.attention.map((a) => a.it.id).filter(Boolean));
  const GATE = { a: 'Gate A', b: 'Gate B', c: 'Gate C' };
  const EMPTY = {
    idea: 'Ideas from your plan. Add some with /content-calendar plan.', script: 'Scripts waiting for your yes land here.',
    a: 'Approved scripts on their way to a visual plan.', b: 'Reels being built, before the final check.',
    c: 'Approved finals, ready to post or schedule.', scheduled: 'Reels with a posting time.', posted: 'Reels that went out.',
  };
  const board = STAGES.map(([k, lab], i) => {
    const list = M.items.filter((x) => x.stage === k);
    return `<section class="col" data-stage="${k}" aria-label="${esc(lab)}" title="${esc(EMPTY[k].replace(/\/content-calendar plan/, 'the plan'))}">
${GATE[k] ? `<span class="gate-mark" title="${esc(GATE[k])}: you approve here">${GATE[k].slice(-1)}<span class="sr">${esc(GATE[k])}</span></span>` : ''}
<header class="col-h"><button type="button" class="col-btn" data-stage-pick="${k}" aria-label="Focus the ${esc(lab)} stage"><span class="num">${String(i + 1).padStart(2, '0')}</span><span class="name">${esc(lab)}</span></button><span class="cnt">${list.length}</span></header>
<ul>${list.map((it) => `<li data-id="${esc(it.id)}"><button type="button" class="card-btn" data-open="${esc(it.id)}">${esc(it.title)}${needIds.has(it.id) ? '<i class="needs-dot" title="Needs you"><span class="sr">Needs you</span></i>' : ''}</button></li>`).join('')}</ul>
<button type="button" class="more" hidden></button>
<p class="none"${list.length ? ' hidden' : ''}>Nothing here</p></section>`;
  }).join('');

  // everything the calendar views and the reel cards need, as data inside the page
  const keyOf = (d) => (d ? M.dayKey(d) : null);
  const CMD = (it) => it.stage === 'idea' ? `/bagelunit-reels ${it.topic || it.title}`
    : ['script', 'a', 'b'].includes(it.stage) ? `/bagelunit-reels carry on with reels/${it.slug}`
    : ['c', 'scheduled'].includes(it.stage) ? `/reel-posting reels/${it.slug}`
    : it.nums ? '/analytics-readout' : `/analytics-readout ${it.slug}`;
  const NEXT_FULL = {
    idea: 'Start this reel. Claude asks the style, writes hooks and the script, fact checks it, then stops for your yes.',
    script: 'The script is written and waits for your yes (Gate A). Read it below, then approve or ask for changes.',
    a: 'Script approved. Next: the voice and the visual plan, which waits for your yes (Gate B).',
    b: 'Visual plan approved. Claude builds, checks its frames and exports; the final waits for your yes (Gate C).',
    c: 'Final approved. Post it by hand with the posting card, or schedule it.',
    scheduled: 'Scheduled. Check it went out at its time; change or cancel it with the posting step.',
    posted: 'Posted. Add or read its numbers to learn what to make next.',
  };
  const data = {
    today: M.today, postDays: M.postDays, postTime: M.postTime, postTimes: M.postTimes, nowTime: M.timeOf(M.now), tz: M.tz, series: M.series.map((x) => x.name),
    stages: STAGES.map(([k, n]) => ({ k, n })),
    entries: M.items.map((it) => { const e = M.entryOf(it); return e && it.id ? { d: e.key, t: e.time || '', k: e.kind, id: it.id } : null; }).filter(Boolean),
    items: M.items.filter((it) => it.id).map((it) => ({
      id: it.id, title: it.title, stage: it.stage, ref: ref(it), fromPlan: !!it.fromPlan, slug: it.slug || '',
      goal: it.goal || '', angle: it.angle || '', notes: it.notes || '', hook: it.hook || '', script: it.script || '', caption: (it.caption || '').trim().slice(0, 2200),
      planned: keyOf(it.plannedAt), scheduled: it.scheduledAt ? { d: keyOf(it.scheduledAt), t: M.timeOf(it.scheduledAt), via: it.scheduledVia, dry: !!it.dryRun } : null,
      posted: it.postedAt ? { d: keyOf(it.postedAt), t: it.postedHasTime ? M.timeOf(it.postedAt) : '', link: safeUrl(it.media?.permalink) || safeUrl(it.permalink) } : null,
      file: it.file ? { name: it.file, state: it.fileState } : null,
      nums: it.nums ? { views: it.nums.views, reach: it.nums.reach, eng: rate(it.nums), watch: it.nums.watch, skip: it.nums.skip, likes: it.nums.likes, comments: it.nums.comments, saves: it.nums.saves, shares: it.nums.shares, source: it.nums.source } : null,
      needs: M.attention.filter((a) => a.it === it).map((a) => ({ p: a.p, what: a.what })),
      next: NEXT_FULL[it.stage], cmd: CMD(it), files: it.files || [], history: it.history || [],
      series: it.series || '', platforms: it.platforms || [], stickers: it.stickers || [], trial: !!it.trial,
      test: it.test ? { ...it.test, others: (M.tests.find((t) => t.id === it.test.id)?.variants || []).filter((v) => v.label !== it.test.label && v.id).map((v) => ({ label: v.label, id: v.id })), title: M.tests.find((t) => t.id === it.test.id)?.title || '' } : null,
      timeline: [['Started', it.startedAt], ['Script approved', it.gateA], ['Visual plan approved', it.gateB], ['Final approved', it.gateC], ['Posted', it.postedAt]].filter(([, d]) => d).map(([n, d]) => ({ n, d: keyOf(d) })),
      pub: it.pub ? { status: it.pub.status, targets: Object.fromEntries(Object.entries(it.pub.targets).map(([k, t]) => [k, { status: t.status, link: safeUrl(t.permalink), error: t.error ? clip(String(t.error), 300) : '' }])) } : null,
      elsewhere: it.elsewhere ? Object.fromEntries(Object.entries(it.elsewhere).map(([k, e]) => [k, { ...e, link: safeUrl(e.link) }])) : null,
      links: Object.fromEntries(Object.entries(it.links || {}).map(([k, u]) => [k, safeUrl(u)]).filter(([, u]) => u)), schedPlatforms: it.schedPlatforms || null,
      voice: it.voice ? { chars: it.voice.chars, calls: it.voice.calls, estimated: it.voice.estimated } : null,
    })),
  };
  const dataJson = JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

  // top posts, for one platform or all of them (then with a Platform column)
  const PF_NAME = { instagram: 'Instagram', facebook: 'Facebook', threads: 'Threads' };
  const topTable = (list, all = false) => (list.length ? `<div class="scroll"><table><thead><tr><th>Post</th>${all ? '<th>Platform</th>' : ''}<th class="hide-sm">Posted</th><th class="r">Views</th><th class="r">Engagement</th><th class="r">Saves</th><th class="r">Shares</th><th class="r">Avg watch</th></tr></thead><tbody>${list.map((p, i) => `<tr${p.reel?.id ? ` data-id="${esc(p.reel.id)}"` : ''}><td><span class="rank">${String(i + 1).padStart(2, '0')}</span>${p.reel?.id ? `<button type="button" class="link" data-open="${esc(p.reel.id)}">${esc(clip(p.title, 56))}</button>` : esc(clip(p.title, 56))}${safeUrl(p.link) ? ` <a class="ig" href="${esc(safeUrl(p.link))}" target="_blank" rel="noopener" aria-label="Open on ${esc(PF_NAME[p.platform] || 'Instagram')}">${icon('arrow', 'ic')}</a>` : ''}</td>${all ? `<td>${esc(PF_NAME[p.platform] || '')}</td>` : ''}<td class="nowrap hide-sm">${esc(p.at ? M.pretty(M.dayKey(p.at)) : '')}</td><td class="r">${esc(fmt(p.nums.views))}</td><td class="r">${esc(pct(rate(p.nums)))}</td><td class="r">${esc(fmt(p.nums.saves))}</td><td class="r">${esc(fmt(p.nums.shares))}</td><td class="r">${p.nums.watch == null ? '–' : esc(p.nums.watch.toFixed(1) + ' s')}</td></tr>`).join('')}</tbody></table></div>`
    : '<p class="empty">No numbers yet. Connect Instagram (docs/dashboard.md), or a day after a reel goes out type <code>/analytics-readout</code> with its numbers.</p>');
  const top = topTable(M.top);

  const source = M.ig ? 'Instagram numbers' : 'Numbers from brand/insights.csv';

  // a line at the top when something needs you now
  const now = M.attention.filter((a) => a.p === 1);
  const alertHtml = now.length ? `<div class="wrap"><a class="alert" href="#today" data-reveal><i class="alert-dot" aria-hidden="true"></i><b>${now.length} thing${now.length === 1 ? '' : 's'} need${now.length === 1 ? 's' : ''} you now</b><span>${esc(now.slice(0, 2).map((a) => a.it.title).join(' · '))}${now.length > 2 ? ` · ${now.length - 2} more` : ''}</span><em>See them</em></a></div>` : '';

  // content mix: goals and angles of the last 10 posts
  const bars = (list, total) => list.map(([k, n]) => `<div class="mrow"><span>${esc(k)}</span><i style="--w:${Math.round((n / total) * 100)}%"></i><b>${n}</b></div>`).join('');
  const mixHtml = M.mix.count >= 3 ? `<div class="mixgrid"><div><h4>Goals</h4>${bars(M.mix.goals, M.mix.count)}</div><div><h4>Angles</h4>${bars(M.mix.angles, M.mix.count)}</div></div>
${M.mix.unusedAngles.length ? `<p class="foot">Not used lately: ${M.mix.unusedAngles.map(esc).join(', ')}.</p>` : ''}${M.mix.repeat ? `<p class="warn">The last 3 posts used the same angle. Pick a different one next.</p>` : M.mix.heavy ? `<p class="warn">${esc(M.mix.heavy)} is more than 4 in 10 of your recent posts.</p>` : ''}`
    : '<p class="empty">The mix shows once 3 posted reels have a goal and an angle (brand/log.md, filled by /reel-posting).</p>';

  // time from start to posted, and voice cost
  const dd = (d) => (d == null ? '–' : d < 1 ? 'under a day' : `${Math.round(d)} day${Math.round(d) === 1 ? '' : 's'}`);
  const maxStep = Math.max(1, ...M.flow.steps.map((x) => x.days || 0));
  const timeHtml = `<div class="tc"><div><div class="tc-big">${esc(dd(M.flow.total))}</div><div class="foot">median from start to posted</div></div>
<div class="tc-big-r"><div class="tc-big">${M.costs.month ? `${esc(fmt(M.costs.month))}` : '–'}</div><div class="foot">voice credits this month${M.costs.monthEstimated ? ' (some estimated)' : ''}${M.costs.perReel ? ` · about ${esc(fmt(M.costs.perReel))} a reel` : ''}</div></div></div>
<div class="steps-t">${M.flow.steps.map((x) => `<div class="mrow${M.flow.slowest && x.name === M.flow.slowest.name ? ' slow' : ''}"><span>${esc(x.name)}</span><i style="--w:${x.days == null ? 0 : Math.max(4, Math.round((x.days / maxStep) * 100))}%"></i><b>${esc(dd(x.days))}</b></div>`).join('')}</div>
${M.flow.slowest && M.flow.slowest.days >= 1 ? `<p class="foot">Reels wait longest at <b>${esc(M.flow.slowest.name.toLowerCase())}</b>.</p>` : '<p class="foot">Times fill in as reels move through the approvals.</p>'}`;

  // the audience (Instagram connected): reach, follows, profile taps, online hours, who follows, stories
  const A = M.audience, hourName = (h) => (h === 0 ? '12 am' : h < 12 ? `${h} am` : h === 12 ? '12 pm' : `${h - 12} pm`);
  const pctOf = (a, b) => (a != null && b ? Math.round((a / b) * 100) : null);
  const GENDER = { M: 'Men', F: 'Women', U: 'Not given' };
  const demoList = (rows, map) => (Array.isArray(rows) ? rows : rows && typeof rows === 'object' ? Object.entries(rows).sort((a, b) => b[1] - a[1]) : [])
    .filter((r) => Array.isArray(r) && Number.isFinite(+r[1])).slice(0, 5).map(([k, v]) => [map ? map[k] || k : k, +v]);
  const demoBars = (title, rows) => { const tot = rows.reduce((t, [, v]) => t + v, 0) || 1; return rows.length ? `<div><h4>${esc(title)}</h4>${rows.map(([k, v]) => `<div class="mrow"><span>${esc(k)}</span><i style="--w:${Math.round((v / tot) * 100)}%"></i><b>${Math.round((v / tot) * 100)}%</b></div>`).join('')}</div>` : ''; };
  const audienceHtml = A ? `<section class="wrap" id="audience" aria-label="Audience"${pfIn('all instagram')}>
  <div class="sec-head" data-reveal>${label('trend', 'Audience')}<span class="aside">From your Instagram account · updated ${esc(ago(M, A.at ? new Date(A.at) : null).toLowerCase())}</span></div>
  <div class="aud" data-reveal-group>
    <div class="panel"><h3>Last 7 days</h3>
      <div class="tc"><div><div class="tc-big">${esc(fmt(A.d7.reach))}</div><div class="foot">accounts reached</div></div><div class="tc-big-r"><div class="tc-big">${A.d7.follows == null ? '–' : esc(signed((A.d7.follows || 0) - (A.d7.unfollows || 0)))}</div><div class="foot">followers (${esc(fmt(A.d7.follows))} new, ${esc(fmt(A.d7.unfollows))} left)</div></div></div>
      ${A.d7.reach ? `<div class="reachbar"><i style="--w:${pctOf(A.d7.reachFollowers, A.d7.reach) || 0}%"></i></div><p class="foot">${esc(String(pctOf(A.d7.reachOthers, A.d7.reach) ?? '–'))}% of the people reached do not follow you yet (${esc(String(pctOf(A.d7.reachFollowers, A.d7.reach) ?? '–'))}% do).</p>` : ''}
      <dl class="am paper">${[['Views', A.d7.views], ['Accounts engaged', A.d7.engaged], ['Interactions', A.d7.interactions], ['Profile taps', A.d7.taps], ['Reposts', A.d7.reposts]].filter(([, v]) => v != null).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(fmt(v))}</dd></div>`).join('')}</dl>
      ${A.d28.reach != null ? `<p class="foot">Last 28 days: ${esc(fmt(A.d28.reach))} reached, ${esc(fmt(A.d28.views))} views, ${A.d28.follows == null ? '' : `${esc(signed((A.d28.follows || 0) - (A.d28.unfollows || 0)))} followers`}.</p>` : ''}
    </div>
    <div class="panel"><h3>When your followers are online</h3>
      ${A.online ? `<div class="hours" role="img" aria-label="Followers online by hour">${A.online.hours.map((v, h) => { const hi = Math.max(1, ...A.online.hours); return `<i class="${A.online.best.includes(h) ? 'best' : ''}" style="--h:${Math.round((v / hi) * 100)}%" title="${esc(`${hourName(h)}: about ${v}`)}"></i>`; }).join('')}</div>
      <div class="hours-axis"><span>12 am</span><span>6 am</span><span>12 pm</span><span>6 pm</span><span>11 pm</span></div>
      <p class="tnote">Best time to post: <b>${esc(A.online.best.map(hourName).join(', '))}</b> (${esc(M.tz)}).</p><p class="foot">Average of the last ${A.online.days} days. Meta's hours, moved from ${esc(A.online.from)} to your time.${M.postTime ? '' : ' Set your posting time with /content-calendar days.'}</p>`
      : '<p class="empty">Shows once the account has 100 followers (Meta\'s rule).</p>'}
    </div>
    <div class="panel"><h3>Who follows you</h3>${Object.keys(A.demo).length ? `<div class="mixgrid">${demoBars('Age', demoList(A.demo.age))}${demoBars('Gender', demoList(A.demo.gender, GENDER))}${demoBars('Countries', demoList(A.demo.country))}${demoBars('Cities', demoList(A.demo.city).map(([k, v]) => [String(k).split(',')[0], v]))}</div>` : '<p class="empty">Shows once the account has 100 followers (Meta\'s rule).</p>'}</div>
  </div>
  ${M.stories.length ? `<div class="panel" style="margin-top:20px" data-reveal><h3>Stories</h3><div class="scroll"><table><thead><tr><th>Posted</th><th class="r">Views</th><th class="r">Reach</th><th class="r">Replies</th><th class="r">Shares</th><th class="r">Profile visits</th></tr></thead><tbody>${M.stories.slice(0, 8).map((x) => `<tr><td>${safeUrl(x.permalink) ? `<a href="${esc(safeUrl(x.permalink))}" target="_blank" rel="noopener">${esc(x.at ? M.pretty(M.dayKey(x.at)) + ' ' + M.timeOf(x.at) : 'story')}</a>` : esc(x.at ? M.pretty(M.dayKey(x.at)) : 'story')}</td>${['views', 'reach', 'replies', 'shares', 'profile_visits'].map((k) => `<td class="r">${esc(fmt(x.insights?.[k] ?? null))}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>` : ''}
</section>` : '';

  // the same reels on Facebook and Threads (platforms.mjs)
  const PLAT = { facebook: ['Facebook Page', 'plays', 'Comments', 'Shares'], threads: ['Threads', 'views', 'Replies', 'Reposts'] };
  const otherKeys = Object.keys(M.others || {});
  const othersHtml = otherKeys.length ? `<section class="wrap" id="elsewhere" aria-label="Facebook and Threads"${pfIn(['all', ...otherKeys].join(' '))}>
  <div class="sec-head" data-reveal>${label('trend', otherKeys.length > 1 ? 'Facebook and Threads' : PLAT[otherKeys[0]][0])}<span class="aside">The same reels on your other accounts</span></div>
  <div class="twin" data-reveal-group>${otherKeys.map((k) => { const o = M.others[k], [title, verb, c3, c4] = PLAT[k], w = o.window || {};
    return `<div class="panel"${pfIn(`all ${k}`)}><h3>${safeUrl(o.link) ? `<a href="${esc(safeUrl(o.link))}" target="_blank" rel="noopener">${esc(title)}</a>` : esc(title)} <span class="foot">${esc(o.name)} · updated ${esc(ago(M, o.at ? new Date(o.at) : null).toLowerCase())}</span></h3>
      <div class="tc"><div><div class="tc-big">${esc(fmt(o.followers))}</div><div class="foot">followers</div></div><div class="tc-big-r"><div class="tc-big">${esc(fmt(w.views))}</div><div class="foot">${k === 'facebook' ? 'views' : 'profile views'}, last ${w.days} days${w.people != null ? ` (${esc(fmt(w.people))} people)` : ''}</div></div></div>
      ${o.medianViews != null ? `<p class="foot">Median ${esc(verb)} per post: ${esc(fmt(o.medianViews))}${M.stats.medianViews ? ` (Instagram: ${esc(fmt(M.stats.medianViews))} views)` : ''}.</p>` : ''}
      ${o.posts.length ? `<div class="scroll"><table><thead><tr><th>Post</th><th class="r">${esc(verb[0].toUpperCase() + verb.slice(1))}</th><th class="r">Likes</th><th class="r">${esc(c3)}</th><th class="r">${esc(c4)}</th></tr></thead><tbody>${o.posts.slice(0, 8).map((x) => `<tr${x.reelId ? ` data-id="${esc(x.reelId)}"` : ''}><td>${x.reelId ? `<button type="button" class="linkish" data-open="${esc(x.reelId)}">${esc(clip(x.title, 48))}</button>` : safeUrl(x.link) ? `<a href="${esc(safeUrl(x.link))}" target="_blank" rel="noopener">${esc(clip(x.title, 48))}</a>` : esc(clip(x.title, 48))}</td><td class="r">${esc(fmt(x.views))}</td><td class="r">${esc(fmt(x.likes))}</td><td class="r">${esc(fmt(x.comments))}</td><td class="r">${esc(fmt(x.shares))}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">No posts read yet.</p>'}
    </div>`; }).join('')}</div>
</section>` : '';

  // comments waiting for a reply, and posts the account is tagged in
  const I = M.inbox, sinceText = (d) => { if (!d) return ''; const hrs = Math.round((M.now - d) / 36e5); return hrs < 1 ? 'just now' : hrs < 24 ? `${hrs} h ago` : `${Math.round(hrs / 24)} d ago`; };
  const commentsHtml = M.ig ? `<section class="wrap" id="comments" aria-label="Comments and mentions"${pfIn('all instagram')}>
  <div class="sec-head" data-reveal>${label('bell', 'Comments and mentions')}<span class="aside">${I.waiting.length} waiting for a reply · ${I.tags.length} tagged post${I.tags.length === 1 ? '' : 's'}</span></div>
  <div class="twin" data-reveal-group>
    <div class="panel"><h3>Waiting for a reply</h3>${I.waiting.length ? `<ul class="cmts">${I.waiting.slice(0, 8).map((c) => `<li${c.reel?.id ? ` data-id="${esc(c.reel.id)}"` : ''}><div><b>@${esc(c.username)}</b> <span class="foot">${esc(sinceText(c.at))}${c.reel ? ` · on ${esc(clip(c.reel.title, 40))}` : ''}</span></div><p>${esc(clip(c.text, 220))}</p><div class="cmd-line"><code>/comment-responder reply ${esc(c.id)}</code><button type="button" class="copy" data-copy="/comment-responder reply ${esc(c.id)}">Copy</button>${safeUrl(c.permalink) ? `<a class="ig" href="${esc(safeUrl(c.permalink))}" target="_blank" rel="noopener" aria-label="Open the post on Instagram">${icon('arrow')}</a>` : ''}</div></li>`).join('')}</ul>${I.waiting.length > 8 ? `<p class="foot">${I.waiting.length - 8} more: /comment-responder list</p>` : ''}` : '<p class="empty">Nothing waiting. Every recent comment has your reply.</p>'}</div>
    <div class="panel"><h3>Posts you are tagged in</h3>${I.tags.length ? `<ul class="cmts">${I.tags.slice(0, 8).map((t) => `<li><div><b>@${esc(t.username || 'someone')}</b> <span class="foot">${esc(sinceText(t.at))}</span></div><p>${esc(clip(t.caption || '(no caption)', 180))}</p>${safeUrl(t.permalink) ? `<a href="${esc(safeUrl(t.permalink))}" target="_blank" rel="noopener">Open on Instagram</a>` : ''}</li>`).join('')}</ul>` : '<p class="empty">No one has tagged the account lately.</p>'}</div>
  </div>
</section>` : '';

  // A/B tests (trial reels)
  const VERDICT = { early: 'Too early', winner: 'Winner', tie: 'No clear winner', waiting: 'Waiting for numbers', decided: 'Decided' };
  const testsHtml = M.tests.length ? `<section class="wrap" id="tests" aria-label="A/B tests"${pfIn('all instagram')}>
  <div class="sec-head" data-reveal>${label('trend', 'A/B tests')}<span class="aside">Trial reels show each version to non-followers first</span></div>
  <div class="tests" data-reveal-group>${M.tests.map((t) => `<article class="test v-${t.verdict}">
<header><div><h3>${esc(t.title)}</h3><p class="foot">Testing the ${esc(t.variable)} · decided by ${esc(t.metricName)} (${esc(t.better)} is better) · ${esc(t.sample.toLocaleString('en-US'))} views each</p></div><span class="verdict">${esc(VERDICT[t.verdict])}</span></header>
<ol class="variants">${t.variants.map((v) => `<li class="${t.lead === v.label ? 'lead' : ''}"${v.id ? ` data-id="${esc(v.id)}"` : ''}><span class="vl">${esc(v.label)}</span><div class="vb">${v.id ? `<button type="button" class="link" data-open="${esc(v.id)}">${esc(clip(v.hook || v.title, 90))}</button>` : esc(clip(v.hook || v.title, 90))}<span class="vbar"><i style="--w:${Math.min(100, Math.round(((v.views || 0) / t.sample) * 100))}%"></i></span><span class="foot">${v.views == null ? 'no numbers yet' : `${esc(fmt(v.views))} views`}${v.trial ? ' · trial reel' : ''} · ${esc(stageName(v.stage).toLowerCase())}</span></div><b class="vv">${esc(v.shown)}</b></li>`).join('')}</ol>
<p class="tnote">${esc(t.note)}</p></article>`).join('')}</div>
</section>` : '';

  // series
  const seriesHtml = M.series.length ? `<section class="wrap" id="series" aria-label="Series">
  <div class="sec-head" data-reveal>${label('layers', 'Series')}<span class="aside">${M.series.length} series · click one to focus it</span></div>
  <div class="series" data-reveal-group>${M.series.map((x) => `<button type="button" class="ser" data-series-pick="${esc(x.name)}"><b>${esc(x.name)}</b><span>${x.posted} posted · ${x.working} in progress · ${x.planned} planned</span>${x.next ? `<span class="foot">Next: ${esc(M.pretty(M.dayKey(x.next.when)))} · ${esc(clip(x.next.title, 40))}</span>` : ''}</button>`).join('')}</div>
</section>` : '';

  // competitors: who we watch, what is working for them, what they have in common, and the ideas drafted from it
  const CP = M.competitors;
  const SRC = { meta: 'Meta', apify: 'Apify', file: 'A file' };
  const cmdLine = (c) => `<div class="cmd-line"><code>${esc(c)}</code><button type="button" class="copy" data-copy="${esc(c)}">Copy</button></div>`;
  const igLink = (h) => `<a class="ig" href="https://www.instagram.com/${encodeURIComponent(h)}/" target="_blank" rel="noopener" aria-label="Open @${esc(h)} on Instagram">${icon('arrow')}</a>`;
  const competitorsHtml = (() => {
    if (!CP || !CP.any) return `<section class="wrap" id="competitors" aria-label="Competitors"${pfIn('all instagram')}>
  <div class="sec-head" data-reveal>${label('grid', 'Competitors')}<span class="aside">Who you watch, and what is working for them</span></div>
  <div class="panel" data-reveal><p class="empty">No competitors yet. Add 6 to 12 accounts: about 4 in your niche and a bit ahead, 4 next door, 2 to 4 big ones for format ideas. Claude reads their public posts and shows what beats their own normal.</p>${cmdLine('/content-calendar competitors add')}</div>
</section>`;
    const withData = CP.accounts.filter((a) => a.readPosts);
    const last = Math.max(0, ...CP.accounts.map((a) => a.pulledAt || 0));
    const you = CP.own;
    const trow = (a) => `<tr><td><b>@${esc(a.handle)}</b> ${igLink(a.handle)}<span class="foot sub">${esc(TAGS[a.tag])}</span></td>
<td class="r">${esc(fmt(a.followers))}${a.delta7 != null ? `<span class="foot sub ${a.delta7 > 0 ? 'up' : a.delta7 < 0 ? 'down' : 'eq'}">${esc(signed(a.delta7))} in 7 days</span>` : ''}</td>
<td class="r">${a.pace ? esc(String(a.pace.perWeek)) : '–'}</td><td class="r">${esc(fmt(a.median))}</td><td class="r">${a.score == null ? '–' : esc(a.score.toFixed(2))}</td><td class="r hide-sm">${a.median == null ? '–' : esc(String(a.outliers30))}</td>
<td class="hide-sm nowrap">${a.pending ? `<span class="foot sub">Not read yet</span>` : `${esc(SRC[a.source] || '')}${a.stale ? ' <span class="prio soon">Stale</span>' : ''}<span class="foot sub">${a.pulledAt ? esc(M.pretty(M.dayKey(new Date(a.pulledAt)))) : ''}</span>`}</td></tr>`;
    const board = withData.length || you ? `<div class="scroll"><table class="comp"><thead><tr><th>Account</th><th class="r">Followers</th><th class="r">Posts a week</th><th class="r">Median views</th><th class="r" title="Median views divided by followers: how well it does for its size">Views per follower</th><th class="r hide-sm" title="Posts in the last 30 days at 1.5 times its own median or more">Beat their median, 30 days</th><th class="hide-sm">Read</th></tr></thead><tbody>
${you ? `<tr class="you"><td><b>You</b>${M.handle ? ` <span class="foot sub">${esc(M.handle)}</span>` : ''}</td><td class="r">${esc(fmt(you.followers))}</td><td class="r">${you.perWeek == null ? '–' : esc(String(you.perWeek))}</td><td class="r">${esc(fmt(you.median))}</td><td class="r">${you.score == null ? '–' : esc(you.score.toFixed(2))}</td><td class="r hide-sm">–</td><td class="hide-sm"><span class="foot sub">Your account</span></td></tr>` : ''}
${CP.accounts.map(trow).join('')}</tbody></table></div>` : '<p class="empty">Nothing read yet. Run the sync.</p>';
    const out = CP.outliers.slice(0, 8);
    const worked = out.length ? `<ol class="wins">${out.map((o, i) => `<li><span class="n">${String(i + 1).padStart(2, '0')}</span><div class="wb"><div class="wt"><b class="ratio">${esc(o.ratio.toFixed(1))}x</b> <span class="prio ${o.tier === 'STUDY' ? 'now' : 'soon'}">${o.tier === 'STUDY' ? 'Study' : 'Note'}</span> <span>@${esc(o.handle)}</span>${safeUrl(o.url) ? ` <a class="ig" href="${esc(safeUrl(o.url))}" target="_blank" rel="noopener" aria-label="Open the post">${icon('arrow')}</a>` : ''}</div>
<p>${esc(clip(firstLine(o.caption) || 'No caption', 110))}</p><span class="foot">${esc(fmt(o.views))} views · ${esc(o.shape)} · ${esc(M.pretty(M.dayKey(new Date(o.at))))}</span></div></li>`).join('')}</ol>${CP.outliers.length > out.length ? `<p class="foot">${CP.outliers.length - out.length} more at 1.5x or above in the last ${CP.windowDays} days.</p>` : `<p class="foot">${CP.outliers.length} post${CP.outliers.length === 1 ? '' : 's'} beat their own median in the last ${CP.windowDays} days.</p>`}`
      : `<p class="empty">${CP.olderWinners ? `Nothing from the last ${CP.windowDays} days beat its own median (${CP.olderWinners} older post${CP.olderWinners === 1 ? ' did' : 's did'}, not shown: they are judged against today's median). ` : 'Nothing is beating its own median yet. That needs at least 5 posts with views for an account.'}</p>`;
    const pt = CP.patterns;
    const shapes = pt.shapes.length ? `<div class="scroll"><table><thead><tr><th>Hook shape</th><th class="r">Posts</th><th class="r">Beat their median</th></tr></thead><tbody>${pt.shapes.map((x) => `<tr><td>${esc(x.shape)}</td><td class="r">${x.posts}</td><td class="r">${esc(pct(x.rate))}${x.lift != null && x.lift >= 1.3 ? ' <span class="prio soon">Above average</span>' : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">Not enough posts yet to compare hook shapes (it needs 3 or more of a shape).</p>';
    const patterns = `${shapes}<p class="foot">${pt.n ? `Of ${pt.n} posts compared, ${pt.hits} beat their own median (${esc(pct(pt.base))}). ` : ''}${pt.days.length ? `Most winners went out on ${esc(pt.days.slice(0, 2).map(([d, n]) => `${d} (${n})`).join(' and '))}. ` : ''}Hook shape is guessed from the first line of the caption; a small sample proves little. Each post is compared with its account's median over its latest 12 posts.</p>`;
    const feed = CP.feed.slice(0, 8);
    const feedHtml = feed.length ? `<ul class="feed">${feed.map((f) => `<li><div><b>@${esc(f.handle)}</b> <span class="foot">${esc(M.pretty(M.dayKey(new Date(f.at))))}${f.views != null ? ` · ${esc(fmt(f.views))} views` : ''}${f.ratio != null ? ` · ${esc(f.ratio.toFixed(1))}x their median` : ''}</span>${safeUrl(f.url) ? ` <a class="ig" href="${esc(safeUrl(f.url))}" target="_blank" rel="noopener" aria-label="Open the post">${icon('arrow')}</a>` : ''}</div><p>${esc(clip(firstLine(f.caption) || 'No caption', 120))}</p></li>`).join('')}</ul>` : '<p class="empty">Nothing from the accounts you watch in the last 7 days.</p>';
    const IDEA_OPEN = CP.ideas.filter((i) => !/^(planned|made|rejected|skipped)/.test(i.status));
    const ideasHtml = `<div class="panel" data-reveal><h3>Post ideas from what is working</h3>${CP.ideas.length ? `<ol class="ideas">${CP.ideas.slice(0, 10).map((i, n) => `<li><span class="n">${String(n + 1).padStart(2, '0')}</span><div class="wb"><div class="wt"><b>${esc(clip(i.idea, 90))}</b> <span class="prio ${/^suggest/.test(i.status) ? 'soon' : ''}">${esc(i.status)}</span></div>${i.hook ? `<p>Hook: ${esc(clip(i.hook, 140))}</p>` : ''}<span class="foot">${[i.goal && `goal ${esc(i.goal)}`, i.angle && `angle ${esc(i.angle)}`, i.basedOn && `from ${esc(clip(i.basedOn, 60))}`].filter(Boolean).join(' · ')}</span>${/^suggest/.test(i.status) ? cmdLine(`/content-calendar ideas accept ${n + 1}`) : ''}</div></li>`).join('')}</ol>${CP.ideas.length > 10 ? `<p class="foot">${CP.ideas.length - 10} more in brand/ideas.md.</p>` : ''}` : `<p class="empty">${out.length ? 'No ideas drafted yet. Claude turns the winners above into reel ideas in your voice, from your cleared facts only.' : 'Ideas come from the posts that beat their own median. They appear here once an account has enough posts with views.'}</p>`}${out.length ? cmdLine('/content-calendar ideas') : ''}</div>`;
    const missing = CP.accounts.filter((a) => a.pending || a.note);
    const gaps = missing.length ? `<div class="panel" data-reveal><h3>Accounts that need attention</h3><ul class="gaps">${missing.map((a) => `<li><b>@${esc(a.handle)}</b> <span class="foot">${esc(a.note || 'Not read yet')}</span></li>`).join('')}</ul><p class="foot">Meta shows business and creator accounts only. For any other, give an export: <code>competitors.mjs import &lt;handle&gt; &lt;file&gt;</code>, or let Apify read it (costs money, off until you turn scraping on).</p></div>` : '';
    return `<section class="wrap" id="competitors" aria-label="Competitors"${pfIn('all instagram')}>
  <div class="sec-head" data-reveal>${label('grid', 'Competitors')}<span class="aside">${CP.accounts.length} account${CP.accounts.length === 1 ? '' : 's'}${last ? ` · read ${esc(M.pretty(M.dayKey(new Date(last))))}` : ''} · views only, public posts</span></div>
  <div class="panel" data-reveal>${board}</div>
  <div class="twin" style="margin-top:20px" data-reveal-group>
    <div class="panel"><h3>What is working for them · last ${CP.windowDays} days</h3>${worked}</div>
    <div class="panel"><h3>What the winners share · last ${pt.windowDays} days</h3>${patterns}</div>
  </div>
  <div class="twin" style="margin-top:20px" data-reveal-group>
    <div class="panel"><h3>Posted in the last 7 days</h3>${feedHtml}</div>
    ${ideasHtml}
  </div>
  ${gaps ? `<div style="margin-top:20px">${gaps}</div>` : ''}
</section>`;
  })();

  // first run: the steps in order, checked off by what is really in the folder; gone once the core steps are done
  const core = M.setup.filter((x) => !x.optional), opt = M.setup.filter((x) => x.optional), nextKey = core.find((x) => !x.done)?.key;
  const step = (x, i) => `<li class="step${x.done ? ' done' : ''}${x.key === nextKey ? ' next' : ''}"><span class="mark" aria-hidden="true">${x.done ? icon('check') : i + 1}</span><div class="st"><b>${esc(x.title)}</b><p>${esc(x.why)}</p></div><div class="sc">${x.done ? '<span class="done-tag">Done</span>' : `<code>${esc(x.cmd)}</code><button type="button" class="copy" data-copy="${esc(x.cmd)}">Copy</button>`}</div></li>`;
  const doneCore = core.filter((x) => x.done).length;
  const setupHtml = M.setupOpen ? `<section class="wrap setup" id="setup" aria-labelledby="setup-title" data-reveal><div class="setup-in">
<div class="setup-head"><div>${label('flag', 'Get started')}<h2 id="setup-title">Set up your content dashboard</h2><p class="lead">Paste each command into Claude Code in this folder. Steps tick themselves off, and this panel goes away once the first ${core.length} are done.</p></div>
<div class="setup-prog"><b>${doneCore} of ${core.length}</b> done<span class="bar" aria-hidden="true"><i style="width:${Math.round((doneCore / core.length) * 100)}%"></i></span></div></div>
<ol class="steps">${core.map(step).join('')}</ol>
${opt.length ? `<p class="opt-label">Optional</p><ol class="steps opt">${opt.map((x, i) => step(x, core.length + i)).join('')}</ol>` : ''}
</div></section>` : '';
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow">
<title>${esc(M.name)} · content dashboard</title>
<style>
${fonts}
:root{
  --accent:${P.line};
  --accent-raw:${P.raw};
  --accent-text:${P.text};
  --accent-soft:${P.soft};
  --accent-glow:color-mix(in oklch, var(--accent-raw) 20%, transparent);
  --accent-on-navy:${P.onNavy};
  --paper:#EFEFEE; --raised:#FBFBFD; --sunken:#E8E8E7; --ink:#16121F; --body:#27222F; --mute:#5C5866; --line:#D5D4DB; --line-strong:#858092;
  --navy:#14142B; --navy-raised:#1C1C3A; --navy-line:#3A3350; --navy-body:#E4E1EC; --navy-mute:#B4AFC4;
  --good:#1A7347; --bad:#B42318; --good-on-navy:#74D9A4;
  --ease:cubic-bezier(.16,1,.3,1); --dur:480ms; --step:70ms; --rise:14px;
  --shadow:0 1px 0 rgb(22 18 31 / .04), 0 18px 40px -24px rgb(22 18 31 / .35);
  --sans:'Poppins', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;scroll-padding-top:76px}
body{margin:0;font:400 15px/1.5 var(--sans);color:var(--body);background:var(--paper);overflow-x:hidden;overflow-wrap:break-word}
.bg{position:fixed;inset:0;z-index:-1;pointer-events:none;
  background:radial-gradient(60rem 28rem at 50% -6rem, var(--accent-glow), transparent 70%),
  linear-gradient(to right, rgb(22 18 31 / .045) 1px, transparent 1px) 0 0/48px 48px,
  linear-gradient(to bottom, rgb(22 18 31 / .045) 1px, transparent 1px) 0 0/48px 48px}
a{color:var(--accent-text);text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:3px}
a:hover{text-decoration-thickness:2px}
a:focus-visible,summary:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
code{font:500 .86em/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:var(--accent-soft);color:var(--ink);padding:.18em .42em;white-space:nowrap}
.wrap{max-width:1240px;margin:0 auto;padding-inline:28px}
section{padding:44px 0 0}
.label{display:flex;align-items:center;gap:10px;font:600 12px/1 var(--sans);letter-spacing:.08em;text-transform:uppercase;color:var(--ink)}
.chip{display:grid;place-items:center;width:26px;height:26px;border:1px solid var(--line);background:var(--raised)}
.ic{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
.sec-head{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:16px}
.sec-head .aside{font-size:13px;color:var(--mute)}
.empty{color:var(--mute);font-size:14px;margin:4px 0}

/* top */
.top{padding-top:34px}
.top .row{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;flex-wrap:wrap}
h1{margin:14px 0 0;font:800 clamp(2.1rem,5vw,3.6rem)/.95 var(--sans);letter-spacing:-.02em;text-transform:uppercase;color:var(--ink)}
h1 .dot{color:var(--accent-raw)}
.meta{font-size:13px;color:var(--mute);text-align:right;line-height:1.6}
.meta b{color:var(--ink);font-weight:600}
.live-dot{display:none;width:8px;height:8px;border-radius:50%;background:var(--good);margin-right:6px;vertical-align:1px;box-shadow:0 0 0 0 color-mix(in oklch, var(--good) 50%, transparent);animation:ping 2.4s var(--ease) infinite}

/* number strip */
.strip{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));margin-top:30px;border-top:1px solid var(--line-strong);border-bottom:1px solid var(--line)}
.metric{position:relative;padding:22px 22px 20px;border-left:1px solid var(--line)}
.metric:first-child{border-left:0;padding-left:0}
.mlabel{font:600 11.5px/1 var(--sans);letter-spacing:.08em;text-transform:uppercase;color:var(--mute)}
.mnum{font:800 clamp(2rem,3.4vw,2.9rem)/1.05 var(--sans);letter-spacing:-.02em;color:var(--ink);margin-top:12px;font-variant-numeric:tabular-nums}
.mbar{display:block;width:34px;height:3px;background:var(--accent);margin:10px 0 10px;transform-origin:left}
.msub{font-size:12.5px;color:var(--mute);min-height:1.5em}
.msub .up{color:var(--good);font-weight:600}.msub .down{color:var(--bad);font-weight:600}.msub .eq{color:var(--mute)}
.spark,.minibars{display:block;width:100%;max-width:150px;height:30px;margin-top:10px;overflow:visible}
.spark polyline{fill:none;stroke:var(--accent);stroke-width:2;vector-effect:non-scaling-stroke;stroke-dasharray:1;stroke-dashoffset:0}
.minibars rect{fill:color-mix(in oklch, var(--accent) 45%, var(--paper));transform-box:fill-box;transform-origin:bottom}

/* needs you + agenda */
.split{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:40px}
.needs{list-style:none;margin:0;padding:0;border-top:1px solid var(--line-strong)}
.needs li{display:grid;grid-template-columns:44px minmax(0,1fr);gap:6px;padding:14px 0;border-bottom:1px solid var(--line)}
.needs .n{font:600 13px/1.6 var(--sans);color:var(--line-strong);letter-spacing:.04em}
.nt{display:flex;align-items:baseline;justify-content:space-between;gap:12px}
.nt b{color:var(--ink);font-weight:600;font-size:15px}
.nw{font-size:14px;margin-top:2px}
.nref{font-size:12px;color:var(--mute);margin-top:4px}
.prio{flex:none;font:600 10.5px/1 var(--sans);letter-spacing:.08em;text-transform:uppercase;padding:5px 7px;border:1px solid var(--line-strong);color:var(--mute)}
.prio.now{background:var(--ink);border-color:var(--ink);color:var(--raised)}
.prio.soon{border-color:var(--accent);color:var(--accent-text)}
.agenda{list-style:none;margin:0;padding:0;border-top:1px solid var(--line-strong)}
.agenda li{display:grid;grid-template-columns:86px minmax(0,1fr);gap:12px;padding:12px 0;border-bottom:1px solid var(--line)}
.agenda li.today .when b{color:var(--accent-text)}
.when span{display:block;font:600 11px/1.3 var(--sans);letter-spacing:.08em;text-transform:uppercase;color:var(--mute)}
.when b{font:600 14px/1.3 var(--sans);color:var(--ink)}
.ag{display:grid;grid-template-columns:10px minmax(0,1fr) auto;align-items:baseline;gap:10px;font-size:14px;padding:2px 0}
.ag em{font-style:normal;font-size:12px;color:var(--mute);text-align:right}
.ag.open span{color:var(--accent-text);font-size:13px}
.ag.ag-more .link{font-size:13px;font-weight:500;color:var(--accent-text)} .ag.open .quiet{color:var(--mute)}
.day .ev-more{display:block;margin-top:4px;padding:0;border:0;background:none;cursor:pointer;text-align:left;font:500 11px/1.3 var(--sans);color:var(--accent-text)}
.sw{width:10px;height:10px;display:inline-block;transform:translateY(1px);background:var(--line)}
.sw.posted{background:color-mix(in oklch, var(--good) 55%, var(--raised))}.sw.scheduled{background:var(--accent)}.sw.planned{background:var(--line-strong)}.sw.late{background:transparent;border:1.5px dashed var(--bad)}.sw.slot{background:transparent;border:1.5px dashed var(--accent)}

/* agents: the navy band */
.band{margin-top:56px;background:var(--navy);color:var(--navy-body);padding:56px 0 60px;position:relative;overflow:hidden}
.band::before{content:"";position:absolute;inset:0;pointer-events:none;background:
  radial-gradient(40rem 22rem at 18% 30%, color-mix(in oklch, var(--accent-raw) 22%, transparent), transparent 70%),
  linear-gradient(to right, rgb(251 251 253 / .045) 1px, transparent 1px) 0 0/48px 48px,
  linear-gradient(to bottom, rgb(251 251 253 / .045) 1px, transparent 1px) 0 0/48px 48px}
.band .wrap{position:relative}
.band + section{padding-top:64px}
.band .label{color:var(--navy-body)} .band .chip{background:var(--navy-raised);border-color:var(--navy-line)}
.band-top{display:grid;grid-template-columns:minmax(0,1fr) minmax(300px,440px);gap:40px;align-items:center}
h2{margin:16px 0 14px;font:800 clamp(1.8rem,3.6vw,2.7rem)/1 var(--sans);letter-spacing:-.01em;text-transform:uppercase;color:var(--raised)}
.band p.lead{max-width:52ch;color:var(--navy-mute);margin:0}
.loop{width:100%;height:auto;display:block;overflow:visible}
.loop .track{fill:none;stroke:var(--navy-line);stroke-width:1.5;stroke-dasharray:2 7;stroke-linecap:round}
.loop .dot{fill:var(--accent-on-navy)} .loop .dot.small{fill:var(--navy-mute);opacity:.8}
.loop .box{fill:var(--navy-raised);stroke:var(--navy-line);stroke-width:1.2}
.loop .node.live .box,.loop .node.recent .box{stroke:var(--accent-on-navy)}
.loop .nic{fill:none;stroke:var(--raised);stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
.loop .light{fill:var(--navy-mute)} .loop .ring{fill:none;stroke:var(--accent-on-navy);stroke-width:1.5;opacity:0}
.loop .node.live .light{fill:var(--good-on-navy)} .loop .node.recent .light{fill:var(--accent-on-navy)}
.loop .nlabel{font:600 11px var(--sans);letter-spacing:.1em;fill:var(--navy-body)}
.loop .cnum{font:800 46px var(--sans);fill:var(--raised)} .loop .clabel{font:600 10.5px var(--sans);letter-spacing:.12em;fill:var(--navy-mute)}
.breathe{transform-box:fill-box;transform-origin:center}
.agents{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px;margin-top:40px}
.agent{position:relative;padding:20px 18px 18px;background:var(--navy-raised);border:1px solid var(--navy-line);display:flex;flex-direction:column;gap:12px;transition:transform 220ms var(--ease),border-color 220ms var(--ease)}
.agent:hover{transform:translateY(-3px);border-color:color-mix(in oklch, var(--accent-on-navy) 60%, var(--navy-line))}
.agent .c{position:absolute;width:12px;height:12px;border:0 solid var(--navy-mute)}
.agent .tl{top:-7px;left:-7px;border-top-width:1.5px;border-left-width:1.5px}.agent .tr{top:-7px;right:-7px;border-top-width:1.5px;border-right-width:1.5px}
.agent .bl{bottom:-7px;left:-7px;border-bottom-width:1.5px;border-left-width:1.5px}.agent .br{bottom:-7px;right:-7px;border-bottom-width:1.5px;border-right-width:1.5px}
.agent header{display:flex;gap:12px;align-items:center}
.aicon{position:relative;display:grid;place-items:center;width:42px;height:42px;flex:none;border:1px solid var(--navy-line);background:var(--navy)}
.aicon .ic{width:20px;height:20px;color:var(--raised)}
.aicon .light{position:absolute;top:-4px;right:-4px;width:8px;height:8px;border-radius:50%;background:var(--navy-mute)}
.agent.live .aicon .light{background:var(--good-on-navy);animation:ping 2.4s var(--ease) infinite}
.agent.recent .aicon .light{background:var(--accent-on-navy)}
.agent h3{margin:0;font:700 16px/1.2 var(--sans);color:var(--raised);font-weight:800;text-transform:uppercase;letter-spacing:.02em}
.agent .when{margin:2px 0 0;font-size:12px;color:var(--navy-mute)}
.agent .job{margin:0;font-size:13px;color:var(--navy-mute);line-height:1.5}
.scene{width:100%;height:auto;display:block;background:var(--navy);border:1px solid var(--navy-line)}
.scene .card,.scene .cell{fill:var(--navy-raised);stroke:var(--navy-line)}
.scene .ln{fill:none;stroke:var(--navy-mute);stroke-width:2;stroke-linecap:round}
.scene .type{fill:var(--navy-mute);transform-box:fill-box;transform-origin:left}
.scene .caret{fill:var(--accent-on-navy)}
.scene .drop{fill:var(--accent-on-navy)}
.scene .rise{fill:var(--accent-on-navy);transform-box:fill-box;transform-origin:bottom}
.scene .idea{transform-box:fill-box}
.am{display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:8px 12px;margin:0}
.am div{border-top:1px solid var(--navy-line);padding-top:8px}
.am dt{font-size:11px;color:var(--navy-mute);line-height:1.3}
.am dd{margin:2px 0 0;font:800 20px/1.1 var(--sans);color:var(--raised);font-variant-numeric:tabular-nums}
.agent details{border-top:1px solid var(--navy-line);padding-top:10px}
.agent summary{cursor:pointer;list-style:none;font:600 12px/1 var(--sans);letter-spacing:.08em;text-transform:uppercase;color:var(--navy-body);display:flex;justify-content:space-between;align-items:center}
.agent summary::-webkit-details-marker{display:none}
.agent summary::after{content:"+";font-size:16px;color:var(--accent-on-navy);transition:transform 220ms var(--ease)}
.agent details[open] summary::after{transform:rotate(45deg)}
.agent summary span{margin-left:auto;margin-right:10px;color:var(--navy-mute)}
.agent details.none summary{cursor:default;color:var(--navy-mute)} .agent details.none summary::after{content:""}
.agent ul{list-style:none;margin:10px 0 0;padding:0;font-size:13px}
.agent li{padding:6px 0;border-bottom:1px dashed var(--navy-line)} .agent li:last-child{border-bottom:0}
.agent li a{color:var(--raised);text-decoration-color:var(--accent-on-navy)} .agent li span{display:block;font-size:11.5px;color:var(--navy-mute)}
.agent details[open] ul{animation:open 260ms var(--ease)}
.agent footer{margin-top:auto;padding-top:10px;border-top:1px solid var(--navy-line);font-size:12.5px}
.agent footer span{display:block;font:600 10.5px/1.6 var(--sans);letter-spacing:.1em;text-transform:uppercase;color:var(--navy-mute)}
.agent footer code{background:transparent;color:var(--accent-on-navy);padding:0;white-space:normal;font-size:12.5px}
.agent footer small{display:block;margin-top:6px;color:var(--navy-mute);font-size:11px}

/* panels on paper */
.panel{position:relative;background:var(--raised);border:1px solid var(--line);padding:20px 22px;box-shadow:var(--shadow);transition:transform 220ms var(--ease)}
.panel h3{margin:0 0 12px;font:600 12px/1 var(--sans);letter-spacing:.08em;text-transform:uppercase;color:var(--ink)}
.twin{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:20px}
.chart{width:100%;height:auto;display:block;overflow:visible}
.chart .gl{stroke:var(--line);stroke-dasharray:2 5}.chart .base{stroke:var(--line-strong)}
.chart .area{fill:var(--accent-soft)}
.chart .line{fill:none;stroke:var(--accent);stroke-width:2.5;stroke-linejoin:round;stroke-linecap:round;stroke-dasharray:1;stroke-dashoffset:0}
.chart .end{fill:var(--raised);stroke:var(--accent);stroke-width:2.5}
.chart .bar{fill:color-mix(in oklch, var(--accent) 38%, var(--raised));transform-box:fill-box;transform-origin:bottom}.chart .bar.now{fill:var(--accent)}
.chart .axis{font:500 11px var(--sans);fill:var(--mute)}.chart .val{font:600 11.5px var(--sans);fill:var(--ink)}
.scroll{overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:14px}
th{font:600 11px/1 var(--sans);letter-spacing:.08em;text-transform:uppercase;color:var(--mute);text-align:left;padding:10px 12px;border-bottom:1px solid var(--line-strong)}
td{padding:11px 12px;border-bottom:1px solid var(--line)} tr:last-child td{border-bottom:0}
tbody tr{transition:background 160ms var(--ease)} tbody tr:hover{background:var(--accent-soft)}
.r{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.nowrap{white-space:nowrap}
.up{color:var(--good)}.down{color:var(--bad)}.eq{color:var(--mute)}
.foot{font-size:12.5px;color:var(--mute);margin:10px 0 0}
.rank{display:inline-block;width:30px;font-weight:600;color:var(--line-strong)}

/* competitors */
table.comp .sub{display:block;margin:3px 0 0;font-size:11.5px;font-weight:400} table.comp tr.you td{background:var(--accent-soft)}
.wins,.ideas{list-style:none;margin:0;padding:0;display:grid;gap:14px} .wins li,.ideas li{display:grid;grid-template-columns:30px minmax(0,1fr);gap:8px;align-items:start}
.wins .n,.ideas .n{font-weight:600;color:var(--line-strong);font-size:13px;padding-top:2px} .wb p{margin:4px 0 4px;font-size:14px;color:var(--ink)}
.wt{display:flex;flex-wrap:wrap;align-items:center;gap:8px;font-size:14px} .wt .ratio{font:800 20px/1 var(--sans);color:var(--accent-text)}
.feed,.gaps{list-style:none;margin:0;padding:0;display:grid;gap:12px} .feed p{margin:3px 0 0;font-size:14px} .feed .foot{display:inline;margin:0} .gaps .foot{display:inline;margin:0 0 0 6px}
.ideas .cmd-line{margin-top:8px}

/* calendar */
.legend{display:flex;gap:16px;flex-wrap:wrap;font-size:12.5px;color:var(--mute);margin:0 0 14px}
.legend span{display:inline-flex;align-items:center;gap:7px}
.month{margin-bottom:22px}
.month h3,.month summary{font:800 18px/1 var(--sans);text-transform:uppercase;letter-spacing:.01em;color:var(--ink);margin:0 0 12px;cursor:pointer}
.month-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px}
.wd{font:600 11px/1 var(--sans);letter-spacing:.08em;text-transform:uppercase;color:var(--mute);padding:0 6px 6px}
.day{min-height:92px;background:var(--raised);border:1px solid var(--line);padding:6px;transition:border-color 160ms var(--ease)}
.day:hover{border-color:var(--line-strong)}
.day.blank{background:transparent;border:0}.day.past{background:color-mix(in oklch, var(--raised) 55%, var(--paper));color:var(--mute)}
.day.today{outline:2px solid var(--ink);outline-offset:-1px}.day.slot{border:1px dashed color-mix(in oklch, var(--accent) 45%, var(--line))}
.dn{font:600 12px/1 var(--sans);color:var(--mute)} .day.today .dn{color:var(--ink)}
.ev{margin-top:5px;padding:4px 6px;font-size:11.5px;line-height:1.3;background:var(--sunken);color:var(--ink)}
.ev b{font-weight:600}
.ev.posted{background:color-mix(in oklch, var(--good) 12%, var(--raised));color:color-mix(in oklch, var(--good) 70%, var(--ink))}
.ev.scheduled{background:var(--accent-soft);color:var(--accent-text)}
.ev.planned{background:var(--sunken);color:var(--ink)}
.ev.late{background:transparent;border:1px dashed var(--bad);color:var(--bad)}
.day .open{display:none}
.wk-list .open,.dayview .open{padding:6px 8px;border:1.5px dashed var(--accent);font-size:12.5px;line-height:1.35;color:var(--accent-text)}

footer.page{margin:56px 0 40px;padding-top:16px;border-top:1px solid var(--line);font-size:12.5px;color:var(--mute);display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}

/* shared controls */
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
button{font:inherit;color:inherit}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.link{min-width:0;max-width:100%;overflow-wrap:anywhere;background:none;border:0;padding:0;font:inherit;font-weight:600;color:var(--ink);cursor:pointer;text-align:left;text-decoration:none;text-decoration-color:var(--accent);text-decoration-thickness:1.5px;text-underline-offset:4px}
.link:hover,.link:focus-visible{text-decoration-line:underline}
.needs .nt .link{font-size:15px}.ag .link{font-weight:400}
.quiet{font-size:12.5px;color:var(--mute)}

/* calendar views */
.cal-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px}
.cal-bar h3{margin:0;flex:1;text-align:center;font:800 18px/1.2 var(--sans);text-transform:uppercase;color:var(--ink)}
.seg{display:inline-flex;border:1px solid var(--line-strong);background:var(--raised)}
.seg button{border:0;background:transparent;padding:0 14px;height:36px;font:600 11.5px/1 var(--sans);letter-spacing:.08em;text-transform:uppercase;color:var(--mute);cursor:pointer;transition:background 180ms var(--ease),color 180ms var(--ease)}
.seg button+button{border-left:1px solid var(--line-strong)}
.seg button[aria-pressed=true]{background:var(--ink);color:var(--raised)}
.seg button:hover:not([aria-pressed=true]){background:var(--sunken);color:var(--ink)}
[data-pf][hidden],[data-pf-in][hidden]{display:none!important}
.twin:has(> [hidden]){grid-template-columns:minmax(0,1fr)}
.pf-note{margin-top:28px}
.cal-nav{display:inline-flex;gap:6px}
.cal-nav button{min-width:38px;height:36px;padding:0 12px;display:grid;place-items:center;border:1px solid var(--line-strong);background:var(--raised);color:var(--ink);cursor:pointer;font:600 11.5px/1 var(--sans);letter-spacing:.08em;text-transform:uppercase;transition:background 180ms var(--ease)}
.cal-nav button:hover{background:var(--sunken)}
.ic.flip{transform:scaleX(-1)} .ic.hide{display:none}
html.js .cal-fallback-title{display:none}
#cal-body.swap{animation:open 280ms var(--ease)}
.day.out{background:transparent;border-style:dashed;opacity:.55}
button.dn{background:none;border:0;padding:3px 5px;margin:-3px -5px;cursor:pointer;font:600 12px/1 var(--sans);color:var(--mute)}
button.dn:hover{background:var(--sunken);color:var(--ink)}
button.ev{display:block;width:100%;text-align:left;border:0;cursor:pointer;transition:transform 160ms var(--ease),filter 160ms var(--ease)}
button.ev:hover{transform:translateY(-1px);filter:brightness(1.06)}
.week{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px}
.wk-day{display:flex;flex-direction:column;min-height:280px;background:var(--raised);border:1px solid var(--line)}
.wk-day.today{outline:2px solid var(--ink);outline-offset:-1px}
.wk-day.past{background:color-mix(in oklch, var(--raised) 55%, var(--paper))}
.wk-day.slot{border:1px dashed var(--accent)}
.wk-head{display:flex;justify-content:space-between;align-items:baseline;gap:8px;padding:10px 10px 8px;border:0;border-bottom:1px solid var(--line);background:none;cursor:pointer;text-align:left}
.wk-head:hover{background:var(--sunken)}
.wk-head span{font:600 11px/1 var(--sans);letter-spacing:.08em;text-transform:uppercase;color:var(--mute)}
.wk-head b{font:800 22px/1 var(--sans);color:var(--ink)} .wk-day.today .wk-head b{color:var(--accent-text)}
.wk-list{display:flex;flex-direction:column;gap:6px;padding:8px}
.calcard{display:flex;flex-direction:column;gap:3px;text-align:left;padding:8px 9px;border:1px solid var(--line);background:var(--paper);cursor:pointer;transition:transform 160ms var(--ease),box-shadow 160ms var(--ease)}
.calcard:hover{transform:translateY(-2px);box-shadow:var(--shadow)}
.calcard b{font-size:13px;font-weight:600;line-height:1.3;color:var(--ink)}
.cc-time{font:600 11px/1.2 var(--sans);letter-spacing:.04em;color:var(--mute)}
.cc-kind{display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--mute)}
.calcard.scheduled{border-color:var(--accent)} .calcard.late{border-style:dashed;border-color:var(--bad)}
.calcard.posted{background:color-mix(in oklch, var(--good) 8%, var(--raised))}
.dayview{background:var(--raised);border:1px solid var(--line)}
.dv-any,.dv-row{display:grid;grid-template-columns:96px minmax(0,1fr);gap:12px;padding:12px 14px;border-bottom:1px solid var(--line)}
.dv-row:last-child{border-bottom:0} .dv-any{background:var(--sunken)}
.dv-h{padding-top:3px;font:600 12px/1.2 var(--sans);letter-spacing:.06em;color:var(--mute)}
.dv-row:not(.has) .dv-h{opacity:.55}
.dv-any>div,.dv-row>div{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-start}
.dayview .calcard{min-width:240px}

/* number cards are links to their sections */
a.metric{display:block;color:inherit;text-decoration:none;transition:background 200ms var(--ease)}
a.metric:hover{background:color-mix(in oklch, var(--raised) 60%, transparent)}
a.metric:hover .mbar{width:52px} .mbar{transition:width 260ms var(--ease)}

/* one filter bar for the whole page */
.focus-bar{position:sticky;top:0;z-index:20;margin-top:22px;background:color-mix(in oklch, var(--paper) 94%, transparent);border-bottom:1px solid var(--line)}
.focus{display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding-top:10px;padding-bottom:10px}
.find{flex:1;min-width:180px;max-width:320px}
.find input,.pick select{width:100%;height:38px;padding:0 12px;border:1px solid var(--line-strong);background:var(--raised);font:400 14px var(--sans);color:var(--ink);border-radius:0}
.pick select{padding-right:30px;appearance:none;background-image:linear-gradient(45deg,transparent 50%,var(--ink) 50%),linear-gradient(135deg,var(--ink) 50%,transparent 50%);background-position:calc(100% - 16px) 17px,calc(100% - 11px) 17px;background-size:5px 5px;background-repeat:no-repeat;cursor:pointer}
.find input:focus,.pick select:focus{outline:2px solid var(--accent);outline-offset:1px}
.toggle{display:inline-flex;align-items:center;gap:8px;height:38px;padding:0 12px;border:1px solid var(--line-strong);background:var(--raised);color:var(--ink);cursor:pointer;font:600 11.5px/1 var(--sans);letter-spacing:.08em;text-transform:uppercase;transition:background 180ms var(--ease)}
.toggle[aria-pressed=true]{background:var(--ink);border-color:var(--ink);color:var(--raised)}
.clear{height:38px;padding:0 10px;border:0;background:none;cursor:pointer;font:600 11.5px/1 var(--sans);letter-spacing:.08em;text-transform:uppercase;color:var(--accent-text);text-decoration:underline;text-underline-offset:3px}
.f-count{font-size:13px;color:var(--mute)}
.status{margin-left:auto;display:inline-flex;align-items:center;gap:7px;font:600 11px/1 var(--sans);letter-spacing:.08em;text-transform:uppercase;color:var(--mute)}
.status i{width:8px;height:8px;border-radius:50%;background:var(--line-strong)}
.status .live{display:none}
html[data-live] .live-dot{display:inline-block} html[data-live] .status{color:var(--good)} html[data-live] .status i{background:var(--good);animation:ping 2.4s var(--ease) infinite}
html[data-live] .status .live{display:inline} html[data-live] .status .snap{display:none}
.needs-dot{flex:none;display:inline-block;width:8px;height:8px;margin-top:5px;border-radius:50%;background:var(--accent)}
.toggle .needs-dot{margin-top:0} .toggle[aria-pressed=true] .needs-dot{background:var(--accent-on-navy)}
[hidden]{display:none!important}

/* the same reel, lit up everywhere it appears */
.needs li,.agenda .ag,tbody tr,.agent li{transition:background 160ms var(--ease),opacity 200ms var(--ease)}
.needs li.is-hl,.needs li.is-sel{background:var(--accent-soft)}
.agenda .ag.is-hl,.agenda .ag.is-sel{background:var(--accent-soft);box-shadow:-6px 0 0 var(--accent-soft),6px 0 0 var(--accent-soft)}
tbody tr.is-hl,tbody tr.is-sel{background:var(--accent-soft)}
.agent li.is-hl,.agent li.is-sel{background:color-mix(in oklch, var(--accent) 16%, var(--navy-raised))}
button.ev.is-hl,button.ev.is-sel,.calcard.is-hl,.calcard.is-sel{outline:2px solid var(--accent);outline-offset:1px}
.is-dim{opacity:.22} button.ev.is-dim,.calcard.is-dim{filter:grayscale(1)}
a.ig{display:inline-grid;place-items:center;vertical-align:-2px;margin-left:6px;width:20px;height:20px;color:var(--mute)} a.ig .ic{width:13px;height:13px;transform:rotate(-45deg)} a.ig:hover{color:var(--accent-text)}

/* pipeline: Plan, Make, Ship; seven quiet columns; a lettered mark where you approve */
.flow{overflow-x:auto;padding-bottom:8px}
.flow-in{min-width:980px}
.phases{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));margin-bottom:6px}
.ph{padding:8px 18px 0;border-top:1px solid var(--line-strong);font:600 10.5px/1 var(--sans);letter-spacing:.12em;text-transform:uppercase;color:var(--mute)}
.ph.plan{grid-column:1 / 2}.ph.make{grid-column:2 / 5}.ph.ship{grid-column:5 / 8}
.ph.ship{border-top-color:var(--accent)}
.board{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));align-items:stretch}
.col{position:relative;display:flex;flex-direction:column;gap:8px;min-height:150px;padding:10px 18px 14px;border-left:1px solid var(--line);transition:opacity 220ms var(--ease),background 220ms var(--ease)}
.col:first-child{border-left:0}
.col.is-focus{background:color-mix(in oklch, var(--raised) 70%, transparent)}
.col.is-dim{opacity:.35}
.gate-mark{position:absolute;top:9px;left:-8px;width:16px;height:16px;display:grid;place-items:center;border-radius:50%;background:var(--paper);border:1px solid var(--ink);font:700 9px/1 var(--sans);color:var(--ink);z-index:1}
.col-h{display:flex;justify-content:space-between;align-items:baseline;gap:8px;min-height:30px}
.col-btn{display:flex;align-items:baseline;gap:7px;padding:0;border:0;background:none;cursor:pointer;text-align:left}
.col-btn .num{font:600 11px/1 var(--sans);color:var(--line-strong);font-variant-numeric:tabular-nums}
.col-btn .name{font:600 11px/1.35 var(--sans);letter-spacing:.08em;text-transform:uppercase;color:var(--ink)}
.col-btn:hover .name,.col.is-focus .col-btn .name{color:var(--accent-text)}
.col .cnt{font:500 12px/1 var(--sans);color:var(--mute);font-variant-numeric:tabular-nums}
.col ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.card-btn{min-width:0;max-width:100%;overflow-wrap:anywhere;display:flex;justify-content:space-between;align-items:flex-start;gap:8px;width:100%;padding:9px 10px;text-align:left;background:var(--raised);border:1px solid var(--line);font:500 13.5px/1.35 var(--sans);color:var(--ink);cursor:pointer;transition:transform 180ms var(--ease),box-shadow 180ms var(--ease),border-color 180ms var(--ease)}
.card-btn:hover,.card-btn.is-hl{transform:translateY(-1px);box-shadow:var(--shadow);border-color:var(--line-strong)}
.card-btn.is-sel{border-color:var(--ink);background:var(--accent-soft)}
.more{align-self:flex-start;padding:2px 0;border:0;background:none;cursor:pointer;font:500 12px/1 var(--sans);color:var(--accent-text);text-decoration:underline;text-underline-offset:3px}
.col .none{margin:2px 0 0;font-size:12.5px;color:var(--line-strong)}
@media (max-width:620px){.focus{gap:8px}.find{max-width:none;flex-basis:100%}.status{margin-left:0}.flow-in{min-width:900px}}

/* first run */
.setup{padding-top:28px}
.setup-in{position:relative;padding:24px 26px 18px;background:var(--raised);border:1px solid var(--line);box-shadow:var(--shadow)}
.setup-head{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;flex-wrap:wrap;margin-bottom:14px}
.setup h2{margin:12px 0 6px;font:800 26px/1.1 var(--sans);letter-spacing:-.01em;text-transform:uppercase;color:var(--ink)}
.setup .lead{margin:0;max-width:60ch;font-size:14px;color:var(--mute)}
.setup-prog{min-width:220px;font-size:13px;color:var(--mute)} .setup-prog b{color:var(--ink);font-weight:600}
.setup-prog .bar{display:block;height:4px;margin-top:8px;background:var(--line)} .setup-prog .bar i{display:block;height:100%;background:var(--accent);transition:width 600ms var(--ease)}
.steps{list-style:none;margin:0;padding:0;border-top:1px solid var(--line-strong)}
.step{display:grid;grid-template-columns:44px minmax(0,1fr) auto;gap:14px;align-items:center;padding:14px 0;border-bottom:1px solid var(--line)}
.step .mark{width:28px;height:28px;display:grid;place-items:center;border-radius:50%;border:1.5px solid var(--line-strong);font:600 12px/1 var(--sans);color:var(--mute)}
.step .mark .ic{width:15px;height:15px;stroke-width:2.2}
.step.next .mark{background:var(--ink);border-color:var(--ink);color:var(--raised)}
.step.done .mark{background:color-mix(in oklch, var(--good) 14%, var(--raised));border-color:var(--good);color:var(--good)}
.step b{font-size:15px;font-weight:600;color:var(--ink)} .step p{margin:2px 0 0;max-width:62ch;font-size:13.5px;color:var(--mute)}
.step.done b{color:var(--mute);font-weight:500}
.sc{display:flex;align-items:center;gap:8px}
.sc code{padding:8px 10px;background:var(--paper);border:1px solid var(--line);font-size:12.5px}
.sc .copy{min-height:34px}
.step:not(.next) .sc .copy{background:var(--raised);border-color:var(--line-strong);color:var(--ink)} .step:not(.next) .sc .copy:hover{background:var(--sunken)}
.done-tag{font:600 11px/1 var(--sans);letter-spacing:.08em;text-transform:uppercase;color:var(--good)}
.opt-label{margin:18px 0 6px;font:600 11px/1 var(--sans);letter-spacing:.1em;text-transform:uppercase;color:var(--mute)}
.steps.opt .step{padding:11px 0}
@media (max-width:620px){.setup-in{padding:18px 16px 12px}.step{grid-template-columns:34px minmax(0,1fr)}.sc{grid-column:2;flex-wrap:wrap}.sc code{white-space:normal;word-break:break-word}}

/* alert, mix, time and cost, tests, series */
.alert{display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px;margin-top:20px;padding:12px 16px;background:var(--raised);border:1px solid var(--ink);color:var(--ink);text-decoration:none;transition:background 180ms var(--ease)}
.alert:hover{background:var(--sunken)} .alert b{font-weight:600} .alert span{color:var(--mute);font-size:14px} .alert em{margin-left:auto;font:600 11.5px/1 var(--sans);font-style:normal;letter-spacing:.08em;text-transform:uppercase;color:var(--accent-text)}
.alert-dot{width:9px;height:9px;border-radius:50%;background:var(--bad);box-shadow:0 0 0 0 rgb(180 35 24 / .5);animation:ping-bad 2.2s var(--ease) infinite}
@keyframes ping-bad{0%{box-shadow:0 0 0 0 rgb(180 35 24 / .5)}80%,100%{box-shadow:0 0 0 9px rgb(180 35 24 / 0)}}
.mixgrid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:18px}
.mixgrid h4{margin:0 0 8px;font:600 11px/1 var(--sans);letter-spacing:.08em;text-transform:uppercase;color:var(--mute)}
.mrow{display:grid;grid-template-columns:minmax(90px,auto) minmax(0,1fr) auto;align-items:center;gap:10px;margin:6px 0;font-size:13px}
.mrow i{display:block;height:8px;background:var(--sunken);position:relative} .mrow i::after{content:"";position:absolute;inset:0 auto 0 0;width:var(--w);background:color-mix(in oklch, var(--accent) 55%, var(--raised))}
.mrow b{min-width:28px;font-weight:600;text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums} .mrow.slow i::after{background:var(--accent)} .mrow.slow span{font-weight:600;color:var(--ink)}
.warn{margin:10px 0 0;font-size:13px;font-weight:500;color:var(--accent-text)}
.tc{display:flex;justify-content:space-between;gap:16px;margin-bottom:12px} .tc-big{font:800 26px/1.1 var(--sans);color:var(--ink)} .tc-big-r{text-align:right}
.steps-t{margin-top:4px}
.tests{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(360px,100%),1fr));gap:16px}
.test{background:var(--raised);border:1px solid var(--line);padding:18px 20px;box-shadow:var(--shadow)}
.test header{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
.test h3{margin:0;font:700 16px/1.3 var(--sans);color:var(--ink)}
.verdict{flex:none;padding:5px 8px;border:1px solid var(--line-strong);font:600 10.5px/1 var(--sans);letter-spacing:.08em;text-transform:uppercase;color:var(--mute)}
.v-winner .verdict{background:var(--good);border-color:var(--good);color:var(--raised)} .v-early .verdict{border-color:var(--accent);color:var(--accent-text)}
.variants{list-style:none;margin:14px 0 0;padding:0}
.variants li{display:grid;grid-template-columns:34px minmax(0,1fr) auto;gap:12px;align-items:center;padding:10px 0;border-top:1px solid var(--line)}
.vl{width:28px;height:28px;display:grid;place-items:center;border:1.5px solid var(--line-strong);font:800 13px/1 var(--sans);color:var(--ink)}
.variants li.lead .vl{background:var(--ink);border-color:var(--ink);color:var(--raised)}
.vb{display:flex;flex-direction:column;gap:5px;min-width:0} .vb .link{font-weight:500}
.vbar{display:block;height:4px;background:var(--sunken)} .vbar i{display:block;height:100%;width:var(--w);background:var(--accent)}
.vv{font:800 18px/1 var(--sans);color:var(--ink);font-variant-numeric:tabular-nums}
.tnote{margin:12px 0 0;font-size:13.5px;color:var(--ink)}
.series{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(260px,100%),1fr));gap:12px}
.ser{display:flex;flex-direction:column;gap:4px;text-align:left;padding:14px 16px;background:var(--raised);border:1px solid var(--line);cursor:pointer;transition:transform 180ms var(--ease),box-shadow 180ms var(--ease)}
.ser:hover,.ser[aria-pressed=true]{transform:translateY(-2px);box-shadow:var(--shadow);border-color:var(--line-strong)} .ser[aria-pressed=true]{border-color:var(--ink)}
.ser b{font:700 15px/1.3 var(--sans);color:var(--ink)} .ser span{font-size:13px;color:var(--mute)}
.timeline{list-style:none;margin:8px 0 0;padding:0} .timeline li{display:grid;grid-template-columns:150px minmax(0,1fr) auto;gap:10px;padding:6px 0;border-bottom:1px dashed var(--line);font-size:13px} .timeline em{font-style:normal;color:var(--mute)}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px} .chips span,.chips button{padding:4px 8px;border:1px solid var(--line);background:var(--paper);font-size:12.5px;color:var(--ink)} .chips button{cursor:pointer} .chips button:hover{border-color:var(--ink)}
@media (max-width:620px){.mixgrid{grid-template-columns:minmax(0,1fr)}.tests{grid-template-columns:minmax(0,1fr)}}

/* audience and comments */
.aud{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr));gap:20px}
.reachbar{height:10px;background:color-mix(in oklch, var(--accent) 55%, var(--raised));position:relative;margin:4px 0 8px} .reachbar i{position:absolute;inset:0 auto 0 0;width:var(--w);background:var(--ink)}
.am.paper div{border-top:1px solid var(--line)} .am.paper dt{color:var(--mute)} .am.paper dd{color:var(--ink);font-size:18px}
.hours{display:grid;grid-template-columns:repeat(24,minmax(0,1fr));align-items:end;gap:3px;height:110px;margin-top:6px}
.hours i{display:block;height:var(--h);min-height:3px;background:color-mix(in oklch, var(--accent) 35%, var(--raised))} .hours i.best{background:var(--accent)}
.hours-axis{display:flex;justify-content:space-between;font-size:11px;color:var(--mute);margin-top:4px}
.cmts{list-style:none;margin:0;padding:0} .cmts li{padding:10px 0;border-top:1px solid var(--line)} .cmts li:first-child{border-top:0}
.cmts p{margin:4px 0 6px;font-size:14px;color:var(--ink)} .cmd-line{display:flex;align-items:center;gap:8px} .cmd-line code{font-size:12px} .cmd-line .copy{min-height:30px;padding:0 10px;font-size:10.5px}

#elsewhere .panel{min-width:0} #elsewhere td:first-child{min-width:11em}
.linkish{all:unset;cursor:pointer;color:var(--ink);text-decoration:underline;text-decoration-color:var(--line);text-underline-offset:3px} .linkish:hover,.linkish:focus-visible{text-decoration-color:var(--accent)} .linkish:focus-visible{outline:2px solid var(--accent);outline-offset:2px}

/* the reel card */
dialog.drawer{position:fixed;inset:0 0 0 auto;margin:0;width:min(580px,100vw);max-width:100vw;height:100dvh;max-height:100dvh;padding:0;border:0;border-left:1px solid var(--line-strong);background:var(--raised);color:var(--body);box-shadow:-24px 0 60px -30px rgb(22 18 31 / .45)}
dialog.drawer::backdrop{background:rgb(22 18 31 / .4)}
dialog.drawer[open]{animation:drawer 320ms var(--ease)}
@keyframes drawer{from{transform:translateX(36px);opacity:0}to{transform:none;opacity:1}}
.dr{height:100%;overflow-y:auto;padding:0 26px 40px;overscroll-behavior:contain}
.dr-head{position:sticky;top:0;z-index:1;display:flex;justify-content:space-between;align-items:center;padding:16px 0 12px;background:var(--raised);border-bottom:1px solid var(--line)}
.stage-chip{padding:6px 8px;background:var(--ink);color:var(--raised);font:600 11px/1 var(--sans);letter-spacing:.08em;text-transform:uppercase}
.dr-nav{display:flex;gap:6px}
.dr-nav button{width:38px;height:38px;display:grid;place-items:center;border:1px solid var(--line-strong);background:var(--raised);color:var(--ink);cursor:pointer;transition:background 160ms var(--ease)} .dr-nav .ic{width:17px;height:17px}
.dr-nav button:hover:not(:disabled){background:var(--sunken)} .dr-nav button:disabled{opacity:.35;cursor:default}
.dr h2{margin:18px 0 4px;font:800 26px/1.1 var(--sans);letter-spacing:-.01em;text-transform:uppercase;color:var(--ink)}
.dr-ref{margin:0 0 18px;font-size:12.5px;color:var(--mute)}
.track{list-style:none;display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px;margin:0 0 18px;padding:0}
.track-label{margin:0 0 6px;font:600 11px/1.3 var(--sans);letter-spacing:.08em;text-transform:uppercase;color:var(--mute)} .track-label b{color:var(--ink)}
.track span{display:none}
.track li{display:flex;flex-direction:column;gap:6px;font-size:10.5px;line-height:1.25;color:var(--mute)}
.track i{height:4px;background:var(--line)} .track .done i{background:var(--ink)} .track .now i{background:var(--accent)}
.track .now span{font-weight:600;color:var(--ink)}
.dr-needs{margin-bottom:14px;padding:8px 12px;border:1px solid var(--line-strong)}
.dr-needs p{display:flex;gap:10px;align-items:baseline;margin:6px 0;font-size:13.5px}
.dr-next{margin-bottom:16px;padding:14px;background:var(--accent-soft);border:1px solid color-mix(in oklch, var(--accent) 35%, var(--line))}
.kicker{display:block;margin-bottom:6px;font:600 11px/1.4 var(--sans);letter-spacing:.08em;text-transform:uppercase;color:var(--mute)}
.dr-next p{margin:0 0 10px;font-size:14px;color:var(--ink)}
.cmdrow{display:flex;gap:8px;align-items:stretch}
.cmdrow code{flex:1;display:flex;align-items:center;padding:8px 10px;background:var(--raised);border:1px solid var(--line);white-space:normal;word-break:break-word;font-size:12.5px;line-height:1.45}
.copy{min-height:38px;padding:0 14px;border:1px solid var(--ink);background:var(--ink);color:var(--raised);cursor:pointer;font:600 11.5px/1 var(--sans);letter-spacing:.08em;text-transform:uppercase;transition:background 160ms var(--ease),border-color 160ms var(--ease)}
.copy:hover{background:var(--body)} .copy.ok{background:var(--good);border-color:var(--good)}
.dr-sec .copy{margin-top:4px}
.dr-next small{display:block;margin-top:8px;font-size:12px;color:var(--mute)}
.facts{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:0 18px;margin:0 0 6px}
.facts div{padding:9px 0;border-top:1px solid var(--line)}
.facts dt{font:600 10.5px/1.4 var(--sans);letter-spacing:.08em;text-transform:uppercase;color:var(--mute)}
.facts dd{margin:2px 0 0;font-size:14px;color:var(--ink)}
.dr-sec{margin-top:6px;padding:14px 0 4px;border-top:1px solid var(--line)}
.dr-sec summary{display:flex;justify-content:space-between;align-items:center;list-style:none;cursor:pointer}
.dr-sec summary::-webkit-details-marker{display:none}
.dr-sec summary::after{content:"+";font-size:18px;color:var(--accent-text);transition:transform 200ms var(--ease)}
.dr-sec[open] summary::after{transform:rotate(45deg)} .dr-sec summary .kicker{margin:0}
.dr-sec[open]>:not(summary){animation:open 240ms var(--ease)}
.dr-sec pre{max-height:340px;overflow:auto;margin:10px 0;padding:12px;white-space:pre-wrap;background:var(--paper);border:1px solid var(--line);font:400 13.5px/1.6 var(--sans);color:var(--body)}
.dr-sec blockquote{margin:2px 0 6px;font:600 16px/1.45 var(--sans);color:var(--ink)}
.dr-sec h4{margin:12px 0 4px;font:600 12px var(--sans);color:var(--ink)}
.dr-sec ul{margin:0;padding-left:18px;font-size:13px} .dr-sec li{margin:3px 0}
.nums{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:0 14px}
.nums div{padding:8px 0;border-top:1px solid var(--line)} .nums dt{font-size:11px;color:var(--mute)}
.nums dd{margin:2px 0 0;font:800 18px/1.1 var(--sans);color:var(--ink);font-variant-numeric:tabular-nums}
.files{list-style:none;padding:0!important} .files li{padding:5px 0;border-bottom:1px dashed var(--line);font-size:13px}
@media (max-width:620px){
  .cal-bar h3{order:-1;flex-basis:100%;text-align:left}
  .week{grid-template-columns:minmax(0,1fr)} .wk-day{min-height:0}
  .wk-head{justify-content:flex-start;gap:12px}
  .dv-any,.dv-row{grid-template-columns:58px minmax(0,1fr)} .dayview .calcard{min-width:0;flex:1 1 100%}
  .dr{padding:0 16px 32px} .track span{display:none} .nums{grid-template-columns:minmax(0,1fr) minmax(0,1fr)} .facts{grid-template-columns:minmax(0,1fr)}
}
@media (prefers-reduced-motion: reduce){dialog.drawer[open],#cal-body.swap,.dr-sec[open]>:not(summary),.agent details[open] ul{animation:none}*{transition-duration:0s!important}}

/* motion */
@keyframes ping{0%{box-shadow:0 0 0 0 rgb(116 217 164 / .6)}80%,100%{box-shadow:0 0 0 9px rgb(116 217 164 / 0)}}
@keyframes open{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
@keyframes breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.045)}}
@keyframes ring{0%{opacity:.9;transform:scale(1)}100%{opacity:0;transform:scale(2.6)}}
@keyframes idea{0%{opacity:0;transform:translateY(14px)}18%,62%{opacity:1;transform:none}82%,100%{opacity:0;transform:translateY(-8px)}}
@keyframes type{0%{transform:scaleX(0)}35%,80%{transform:scaleX(1)}100%{transform:scaleX(1);opacity:0}}
@keyframes blink{0%,49%{opacity:1}50%,100%{opacity:0}}
@keyframes drop{0%{transform:translate(0,0)}14%{transform:translate(37px,0)}28%{transform:translate(74px,22px)}42%{transform:translate(18.5px,22px)}56%{transform:translate(92.5px,0)}70%{transform:translate(55.5px,22px)}84%{transform:translate(111px,0)}100%{transform:translate(0,0)}}
@keyframes rise{0%,100%{transform:scaleY(.25)}50%{transform:scaleY(1)}}
@media (prefers-reduced-motion: no-preference){
  .loop .breathe{animation:breathe 3.6s ease-in-out infinite}
  .loop .node:nth-of-type(2) .breathe{animation-delay:-.9s}.loop .node:nth-of-type(3) .breathe{animation-delay:-1.8s}.loop .node:nth-of-type(4) .breathe{animation-delay:-2.7s}
  .loop .node.live .ring{transform-box:fill-box;transform-origin:center;animation:ring 2.4s var(--ease) infinite}
  .scene .idea{animation:idea 3.6s var(--ease) infinite;animation-delay:calc(var(--i) * .5s)}
  .scene .type{animation:type 3.2s var(--ease) infinite;animation-delay:calc(var(--i) * .35s)}
  .scene .caret{animation:blink 1s steps(1) infinite}
  .scene .drop{animation:drop 7s var(--ease) infinite}
  .scene .rise{animation:rise 2.8s var(--ease) infinite;animation-delay:calc(var(--i) * -.45s)}
}
@media (scripting: enabled) and (prefers-reduced-motion: no-preference){
  html.js [data-reveal]{opacity:0;transform:translateY(var(--rise));transition:opacity var(--dur) var(--ease),transform var(--dur) var(--ease)}
  html.js [data-reveal].is-in{opacity:1;transform:none}
  html.js [data-reveal-group]>*{opacity:0;transform:translateY(var(--rise));transition:opacity var(--dur) var(--ease),transform var(--dur) var(--ease)}
  html.js [data-reveal-group].is-in>*{opacity:1;transform:none}
  ${[2, 3, 4, 5, 6, 7, 8].map((n) => `html.js [data-reveal-group].is-in>:nth-child(${n}){transition-delay:calc(var(--step) * ${n - 1})}`).join('')}
  html.js [data-reveal-group].is-in>:nth-child(n+9){transition-delay:calc(var(--step) * 8)}
  html.js .mbar{transform:scaleX(0);transition:transform 700ms var(--ease) 200ms} html.js .is-in .mbar{transform:none}
  html.js [data-draw] polyline,html.js [data-draw] .line{stroke-dashoffset:1;transition:stroke-dashoffset 1400ms var(--ease) 150ms}
  html.js [data-draw].is-in polyline,html.js [data-draw].is-in .line{stroke-dashoffset:0}
  html.js [data-draw] rect,html.js [data-draw] .bar{transform:scaleY(0);transition:transform 800ms var(--ease);transition-delay:calc(var(--i, 0) * 60ms + 150ms)}
  html.js [data-draw].is-in rect,html.js [data-draw].is-in .bar{transform:none}
  html.js [data-draw] .area,html.js [data-draw] .end,html.js [data-draw] .val{opacity:0;transition:opacity 600ms var(--ease) 900ms}
  html.js [data-draw].is-in .area,html.js [data-draw].is-in .end,html.js [data-draw].is-in .val{opacity:1}
  html:not(.reveal-ready) [data-reveal],html:not(.reveal-ready) [data-reveal-group]>*{animation:net 0s 2.5s forwards}
  @keyframes net{to{opacity:1;transform:none}}
}
@media (prefers-reduced-motion: reduce){.loop .dot{display:none}.live-dot,.alert-dot{animation:none}}

/* small screens: compose, not shrink */
@media (max-width:980px){
  .strip{grid-template-columns:repeat(3,minmax(0,1fr))} .metric:nth-child(4){border-left:0;padding-left:0}
  .metric:nth-child(n+4){border-top:1px solid var(--line)}
  .agents{grid-template-columns:repeat(2,minmax(0,1fr))} .band-top{grid-template-columns:minmax(0,1fr)} .loop{max-width:420px;margin:0 auto}
  .split,.twin{grid-template-columns:minmax(0,1fr)}
}
@media (max-width:620px){
  .wrap{padding-inline:16px} section{padding-top:36px}
  .meta{text-align:left}
  .strip{grid-template-columns:minmax(0,1fr) minmax(0,1fr)} .metric{padding:16px 0 16px 14px} .metric:nth-child(odd){border-left:0;padding-left:0} .metric:nth-child(4){border-left:1px solid var(--line);padding-left:14px}
  .metric:nth-child(n+3){border-top:1px solid var(--line)} .metric:last-child{grid-column:1 / -1}
  .agents{grid-template-columns:minmax(0,1fr)}
  .band{padding:44px 0 48px}
  .agenda li{grid-template-columns:minmax(0,1fr);gap:4px} .when span,.when b{display:inline;margin-right:6px}
  .ag{grid-template-columns:10px minmax(0,1fr)} .ag em{grid-column:2;text-align:left}
  .day{min-height:44px;padding:3px} .ev{height:6px;padding:0;margin-top:4px} .ev b,.ev span{display:none} .day .open{font-size:9px}
  .wd{padding:0 0 4px;text-align:center;font-size:10px}
  td,th{padding:9px 8px;font-size:13px} .hide-sm{display:none}
  .chart .axis{font-size:20px} .chart .val{font-size:21px}
  .panel{padding:16px}
}
</style></head>
<body><div class="bg" aria-hidden="true"></div>
<header class="top wrap" data-reveal-group>
  ${label('grid', `Content dashboard${M.handle ? ` · ${M.handle}` : ''}`)}
  <div class="row"><h1>${esc(M.name)}<span class="dot">.</span></h1>
  <div class="meta"><span class="live-dot" aria-hidden="true"></span>Updated <b><time datetime="${updated.toISOString()}" data-rel>${esc(M.pretty(M.dayKey(updated), { month: 'short', day: 'numeric' }))}, ${esc(M.timeOf(updated))}</time></b> · ${esc(source)}<br>Refresh: type <b>/content-calendar</b> in Claude Code</div></div>
</header>

${alertHtml}
${setupHtml}
${M.setupOpen && !S.measured && !S.posted && !PFS.length ? '' : `<div class="wrap">${stripHtml}</div>`}

<div class="focus-bar" id="focus"><div class="wrap focus">
  <label class="find"><span class="sr">Find a reel or idea</span><input type="search" id="f-q" placeholder="Find a reel or idea" autocomplete="off"></label>
  <button type="button" id="f-needs" class="toggle" aria-pressed="false"><i class="needs-dot" aria-hidden="true"></i>Needs you</button>
  ${PFS.length ? `<div class="seg pf" role="group" aria-label="Platform">${PFS.map((k) => `<button type="button" data-pf-pick="${k}" aria-pressed="${k === PF_DEFAULT}">${k === 'all' ? 'All' : PF_NAME[k]}</button>`).join('')}</div>` : ''}
  <label class="pick"><span class="sr">Stage</span><select id="f-stage"><option value="">All stages</option>${STAGES.map(([k, n]) => `<option value="${k}">${esc(n)}</option>`).join('')}</select></label>
  ${M.series.length ? `<label class="pick"><span class="sr">Series</span><select id="f-series"><option value="">All series</option>${M.series.map((x) => `<option value="${esc(x.name)}">${esc(x.name)}</option>`).join('')}</select></label>` : ''}
  <button type="button" id="f-clear" class="clear" hidden>Clear</button>
  <span class="f-count" id="f-count" aria-live="polite"></span>
  <span class="status"><i aria-hidden="true"></i><span class="snap">Snapshot</span><span class="live">Live</span></span>
</div></div>

<section class="wrap" id="today"><div class="split">
  <div data-reveal><div class="sec-head">${label('bell', 'Needs you')}<span class="aside">${M.attention.length} item${M.attention.length === 1 ? '' : 's'}</span></div>${needs}</div>
  <div data-reveal><div class="sec-head">${label('clock', 'Next 14 days')}<span class="aside">${open14} open slot${open14 === 1 ? '' : 's'} in these 14 days</span></div>${agendaHtml}</div>
</div></section>

<section class="band" id="agents" aria-labelledby="agents-title"><div class="wrap">
  <div class="band-top">
    <div data-reveal>${label('loop', 'Your agents')}<h2 id="agents-title">Your content team</h2>
    <p class="lead">Four jobs, one loop. The Ideator finds what to make, Hook &amp; Script writes it, the Planner puts it on your days, the Analyst reads how it did, and that feeds the next idea. Each one works when you start it with its command.</p></div>
    <div data-reveal>${loopGraph(M)}</div>
  </div>
  <div class="agents" data-reveal-group>${agents}</div>
</div></section>

<section class="wrap" id="trends" aria-label="Trends">
  <div class="sec-head" data-reveal>${label('trend', 'Trends')}<span class="aside">${PFS.length ? 'From your connected accounts' : M.ig ? 'From your Instagram account' : 'From brand/insights.csv'}</span></div>
  ${PFS.length ? PFS.map((k) => k === 'instagram' ? `<div class="twin"${pfAttr(k)} data-reveal-group>
    <div class="panel"><h3>Followers</h3>${followerChart(M)}</div>
    <div class="panel"><h3>Views by the week posts went out</h3>${weekChart(M)}</div>
  </div>` : `<div class="twin"${pfAttr(k)} data-reveal-group>
    <div class="panel"><h3>Followers${k === 'all' ? ', all platforms' : ''}</h3>${followerChart(M, M.platforms[k].followerRows, true)}</div>
    <div class="panel"><h3>${k === 'facebook' ? 'Plays' : k === 'all' ? 'Views and plays' : 'Views'} by the week posts went out</h3>${weekChart(M, M.platforms[k].weeks)}</div>
  </div>`).join('') : `<div class="twin" data-reveal-group>
    <div class="panel"><h3>Followers</h3>${followerChart(M)}</div>
    <div class="panel"><h3>Views by the week posts went out</h3>${weekChart(M)}</div>
  </div>`}
  <div class="panel" style="margin-top:20px" data-reveal${pfIn('all instagram')}><h3>Watch time and skip rate, latest reels${PFS.length ? ' (Instagram)' : ''}</h3>${retention(M)}</div>
  ${PFS.length ? `<div class="panel" style="margin-top:20px"${pfIn('facebook threads')}><h3>Watch time and skip rate</h3><p class="empty">Instagram only. Facebook gives an average watch time per reel (in Top posts below); Threads gives none.</p></div>` : ''}
  <div class="twin" style="margin-top:20px" data-reveal-group>
    <div class="panel"><h3>Content mix${M.mix.count ? ` · last ${M.mix.count} posts` : ''}</h3>${mixHtml}</div>
    <div class="panel"><h3>Time and cost</h3>${timeHtml}</div>
  </div>
</section>

${competitorsHtml}

<section class="wrap" id="calendar" aria-label="Calendar">
  <div class="sec-head" data-reveal>${label('cal', 'Calendar')}<span class="aside">${M.postDays.length ? `Posting days: ${esc(M.postDays.map((d) => d[0].toUpperCase() + d.slice(1)).join(', '))}${M.postTimes.length > 1 ? `, ${M.postTimes.length} times a day (${esc(timesText(M.postTimes))})` : M.postTime ? ` at ${esc(M.postTime)}` : ''}` : 'Set posting days with /content-calendar days'}</span></div>
  <div class="legend" data-reveal><span><i class="sw planned"></i>Planned</span><span><i class="sw scheduled"></i>Scheduled</span><span><i class="sw posted"></i>Posted</span><span><i class="sw late"></i>Date passed</span><span><i class="sw slot"></i>Open slot</span></div>
  <div class="cal" id="cal" data-reveal>
    <div class="cal-bar"><div class="seg" role="group" aria-label="Calendar view"><button type="button" data-view="month" aria-pressed="true">Month</button><button type="button" data-view="week" aria-pressed="false">Week</button><button type="button" data-view="day" aria-pressed="false">Day</button></div>
    <h3 id="cal-title" aria-live="polite"></h3>
    <div class="cal-nav"><button type="button" data-nav="-1" aria-label="Back">${icon('arrow', 'ic flip')}</button><button type="button" data-nav="0">Today</button><button type="button" data-nav="1" aria-label="Forward">${icon('arrow')}</button></div></div>
    <div id="cal-body">${fallbackMonth}</div>
  </div>
</section>

<section class="wrap" id="pipeline" aria-label="Pipeline">
  <div class="sec-head" data-reveal>${label('layers', 'Pipeline')}<span class="aside">${M.items.length} reel${M.items.length === 1 ? '' : 's'} and ideas · click a card to open it</span></div>
  <div class="flow" data-reveal><div class="flow-in">
    <div class="phases" aria-hidden="true"><span class="ph plan">Plan</span><span class="ph make">Make</span><span class="ph ship">Ship</span></div>
    <div class="board">${board}</div>
  </div></div>
</section>

${commentsHtml}
${testsHtml}
${seriesHtml}
${audienceHtml}
${PFS.length && (A || M.ig || M.tests.length) ? `<section class="wrap pf-note"${pfIn('facebook threads')}><p class="empty">Your audience and best time to post, comments and hook tests come from Instagram only: switch to All or Instagram to see them.</p></section>` : ''}
${othersHtml}
<section class="wrap" id="top" aria-label="Top posts">
  <div class="sec-head" data-reveal>${label('star', 'Top posts')}<span class="aside">By views${PFS.includes('facebook') ? ' (plays on Facebook)' : ''}</span></div>
  ${PFS.length ? PFS.map((k) => `<div class="panel"${pfAttr(k)} data-reveal>${k === 'instagram' ? top : topTable(M.platforms[k].top, k === 'all')}</div>`).join('') : `<div class="panel" data-reveal>${top}</div>`}
</section>

<footer class="page wrap"><span>Made from this brand folder's files${(() => { const n = [M.ig && 'Instagram', M.others?.facebook && 'Facebook', M.others?.threads && 'Threads'].filter(Boolean); return n.length ? ` and its ${n.length > 1 ? n.slice(0, -1).join(', ') + ' and ' + n.at(-1) : n[0]} numbers` : ''; })()}. This page posts nothing.</span><span>BagelUnit Reel Kit</span></footer>

<dialog id="card" class="drawer" aria-labelledby="card-title"><div class="dr" id="card-body"></div></dialog>
<script type="application/json" id="dash-data">${dataJson}</script>
<script>${CLIENT}</script>
<script>
(() => {
  const root = document.documentElement, reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  root.classList.add('js');
  const k = (n) => Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : Math.abs(n) >= 1e4 ? Math.round(n / 1e3) + 'K' : Math.abs(n) >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(Math.round(n));
  const show = { k, int: (n) => String(Math.round(n)), pct: (n) => (n * 100).toFixed(1) + '%' };
  const count = (el) => {
    const to = Number(el.dataset.count), f = show[el.dataset.fmt] || show.int;
    if (!Number.isFinite(to) || reduce) return;
    const t0 = performance.now(), dur = 1100;
    const tick = (t) => { const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(2, -10 * p); el.textContent = f(to * (p === 1 ? 1 : e)); if (p < 1) requestAnimationFrame(tick); };
    el.textContent = f(0); requestAnimationFrame(tick);
  };
  const io = new IntersectionObserver((list) => list.forEach((e) => {
    if (!e.isIntersecting) return;
    e.target.classList.add('is-in');
    e.target.querySelectorAll('[data-count]').forEach(count);
    if (e.target.matches('[data-draw]')) e.target.classList.add('is-in');
    io.unobserve(e.target);
  }), { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  document.querySelectorAll('[data-reveal],[data-reveal-group],[data-draw]').forEach((el) => io.observe(el));
  root.classList.add('reveal-ready');
  if (reduce) document.querySelectorAll('svg').forEach((s) => s.pauseAnimations && s.pauseAnimations());
  const rel = () => document.querySelectorAll('time[data-rel]').forEach((t) => {
    const s = (Date.now() - new Date(t.dateTime)) / 1000;
    t.textContent = s < 60 ? 'just now' : s < 3600 ? Math.floor(s / 60) + ' min ago' : s < 86400 ? Math.floor(s / 3600) + ' h ago' : Math.floor(s / 86400) + ' days ago';
  });
  rel(); setInterval(rel, 30000);
})();
</script>
</body></html>
`;
}
