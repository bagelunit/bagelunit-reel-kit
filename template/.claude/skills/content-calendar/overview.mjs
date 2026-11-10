#!/usr/bin/env node
// All brands on one page: every brand folder on this computer that has drawn its dashboard, with what needs the owner
// in each, the week's numbers and the next 7 days across all of them. For anyone running several brands.
//
//   node .claude/skills/content-calendar/overview.mjs [--open]               draw ~/.config/bagelunit-reels/overview.html
//   node .claude/skills/content-calendar/overview.mjs --scan <folder>        find brand folders under a folder and add them
//   node .claude/skills/content-calendar/overview.mjs --forget <folder>      take one off the list
//
// Brand folders add themselves each time their dashboard is drawn (~/.config/bagelunit-reels/brands.json). The page
// stays on this computer: it reads each brand folder and links to its own dashboard. It posts and sends nothing.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { load, readJSON, REGISTRY, CONFIG_DIR, registerBrand, fmt, clip, stageName, writeAtomic } from './lib.mjs';
import { fontFaces, esc, icon, label, palette } from './page.mjs';
import { openFile } from './calendar.mjs';

const args = process.argv.slice(2);
const val = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const ARCHIVED = /(^|[\\/])_do-not-read([\\/]|$)/i;
const kitTemplate = (d) => path.basename(d) === 'template' && fs.existsSync(path.join(d, '..', 'setup', 'new-brand.mjs'));   // the kit's own blank copy
const isBrand = (d) => !ARCHIVED.test(d) && !kitTemplate(d) && fs.existsSync(path.join(d, 'brand', 'brand.json')) && fs.existsSync(path.join(d, '.kit-version'));

if (val('--scan')) {
  const found = [];
  const walk = (d, depth) => {
    if (depth > 5) return;
    let entries = [];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    if (isBrand(d)) { found.push(d); return; }
    for (const e of entries) if (e.isDirectory() && !e.name.startsWith('.') && !['node_modules', '_do-not-read', 'library'].includes(e.name.toLowerCase())) walk(path.join(d, e.name), depth + 1);
  };
  walk(path.resolve(val('--scan')), 0);
  for (const d of found) registerBrand(d, readJSON(path.join(d, 'brand', 'brand.json')).name);
  console.log(found.length ? `Added ${found.length} brand folder${found.length === 1 ? '' : 's'}:\n  ${found.join('\n  ')}` : 'No brand folders found there.');
}
if (val('--forget')) {
  const reg = readJSON(REGISTRY, { brands: [] }), target = path.resolve(val('--forget'));
  writeAtomic(REGISTRY, JSON.stringify({ brands: (Array.isArray(reg.brands) ? reg.brands : []).filter((b) => b.root !== target) }, null, 2) + '\n');
  console.log(`Took ${target} off the list.`);
}

// read every brand that still exists
const reg = readJSON(REGISTRY, { brands: [] });
const brands = [];
for (const b of Array.isArray(reg.brands) ? reg.brands : []) {
  if (!b || typeof b.root !== 'string') continue;
  if (!isBrand(b.root)) continue;
  try { brands.push(load(b.root)); } catch (e) { brands.push({ broken: true, root: b.root, name: b.name, error: e.message }); }
}
const ok = brands.filter((M) => !M.broken);
const now = new Date();
const score = (M) => M.attention.filter((a) => a.p === 1).length * 100 + M.attention.filter((a) => a.p === 2).length * 10 + M.attention.length;
ok.sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));

const totals = {
  now: ok.reduce((t, M) => t + M.attention.filter((a) => a.p === 1).length, 0),
  all: ok.reduce((t, M) => t + M.attention.length, 0),
  posted7: ok.reduce((t, M) => t + M.stats.last7, 0),
  scheduled: ok.reduce((t, M) => t + M.stats.scheduled, 0),
  working: ok.reduce((t, M) => t + M.stats.inProgress, 0),
};
const href = (M) => pathToFileURL(path.join(M.root, 'brand', 'dashboard.html')).href;

// the next 7 days across every brand
const coming = [];
for (const M of ok) for (let i = 0; i < 7; i++) {
  const k = M.addDays(M.today, i);
  for (const e of M.byDay[k] || []) if (e.kind !== 'posted') coming.push({ M, k, e });
}
coming.sort((a, b) => (a.k + (a.e.time || '99')).localeCompare(b.k + (b.e.time || '99')));

const card = (M) => {
  const P = palette(M.accent), nowItems = M.attention.filter((a) => a.p === 1), rest = M.attention.filter((a) => a.p !== 1);
  return `<article class="brand" style="--b:${P.line};--b-raw:${P.raw}">
<header><span class="sw" aria-hidden="true"></span><div><h2>${esc(M.name)}</h2><p>${esc(M.handle || '')}${M.setupOpen ? ' · setting up' : ''}</p></div>
<a class="open" href="${esc(href(M))}">Open dashboard ${icon('arrow')}</a></header>
<dl class="nums"><div><dt>Needs you now</dt><dd class="${nowItems.length ? 'hot' : ''}">${nowItems.length}</dd></div><div><dt>Posted this week</dt><dd>${M.stats.last7}</dd></div><div><dt>Scheduled</dt><dd>${M.stats.scheduled}</dd></div><div><dt>In progress</dt><dd>${M.stats.inProgress}</dd></div>${M.stats.followers != null ? `<div><dt>Followers</dt><dd>${esc(fmt(M.stats.followers))}</dd></div>` : ''}</dl>
${M.attention.length ? `<ul class="needs">${[...nowItems, ...rest].slice(0, 4).map((a) => `<li><span class="prio p${a.p}">${['', 'Now', 'Soon', 'Later'][a.p]}</span><span><b>${esc(clip(a.it.title, 48))}</b> ${esc(clip(a.what, 110))}</span></li>`).join('')}${M.attention.length > 4 ? `<li class="more">${M.attention.length - 4} more on its dashboard</li>` : ''}</ul>` : M.setupOpen ? `<p class="calm">Setting up. Next: ${esc(M.setup.find((x) => !x.optional && !x.done)?.title || '')} (<code>${esc(M.setup.find((x) => !x.optional && !x.done)?.cmd || '')}</code>)</p>` : '<p class="calm">Nothing needs you here.</p>'}
</article>`;
};

const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow">
<title>All brands · content overview</title>
<style>
${fontFaces()}
:root{--paper:#EFEFEE;--raised:#FBFBFD;--sunken:#E8E8E7;--ink:#16121F;--body:#27222F;--mute:#5C5866;--line:#D5D4DB;--line-strong:#858092;--bad:#B42318;--good:#1A7347;--ease:cubic-bezier(.16,1,.3,1);--sans:'Poppins',ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;--shadow:0 1px 0 rgb(22 18 31 / .04),0 18px 40px -24px rgb(22 18 31 / .35)}
*{box-sizing:border-box} body{margin:0;font:400 15px/1.5 var(--sans);color:var(--body);background:var(--paper)}
.bg{position:fixed;inset:0;z-index:-1;background:linear-gradient(to right,rgb(22 18 31 / .045) 1px,transparent 1px) 0 0/48px 48px,linear-gradient(to bottom,rgb(22 18 31 / .045) 1px,transparent 1px) 0 0/48px 48px}
main{max-width:1240px;margin:0 auto;padding:34px 28px 64px}
.label{display:flex;align-items:center;gap:10px;font:600 12px/1 var(--sans);letter-spacing:.08em;text-transform:uppercase;color:var(--ink)}
.chip{display:grid;place-items:center;width:26px;height:26px;border:1px solid var(--line);background:var(--raised)}
.ic{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
h1{margin:14px 0 0;font:800 clamp(2rem,4.5vw,3.2rem)/1 var(--sans);letter-spacing:-.02em;text-transform:uppercase;color:var(--ink)}
.meta{color:var(--mute);font-size:13px;margin-top:8px}
.strip{display:grid;grid-template-columns:repeat(5,1fr);margin:26px 0 8px;border-top:1px solid var(--line-strong);border-bottom:1px solid var(--line)}
.strip div{padding:18px 18px 16px;border-left:1px solid var(--line)} .strip div:first-child{border-left:0;padding-left:0}
.strip dt{font:600 11px/1 var(--sans);letter-spacing:.08em;text-transform:uppercase;color:var(--mute)} .strip dd{margin:10px 0 0;font:800 34px/1 var(--sans);color:var(--ink)} .strip dd.hot{color:var(--bad)}
h3{margin:34px 0 12px;font:600 12px/1 var(--sans);letter-spacing:.08em;text-transform:uppercase;color:var(--mute)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:16px}
.brand{background:var(--raised);border:1px solid var(--line);padding:18px 20px;box-shadow:var(--shadow);transition:transform 200ms var(--ease)}
.brand:hover{transform:translateY(-2px)}
.brand header{display:flex;align-items:center;gap:12px}
.brand .sw{width:12px;height:36px;background:var(--b-raw);flex:none}
.brand h2{margin:0;font:800 19px/1.1 var(--sans);text-transform:uppercase;color:var(--ink)} .brand header p{margin:2px 0 0;font-size:12.5px;color:var(--mute)}
.open{margin-left:auto;display:inline-flex;align-items:center;gap:6px;font:600 11.5px/1 var(--sans);letter-spacing:.06em;text-transform:uppercase;color:var(--ink);text-decoration:none;border:1px solid var(--line-strong);padding:9px 10px;white-space:nowrap}
.open:hover{border-color:var(--ink)} .open .ic{width:13px;height:13px}
.nums{display:grid;grid-template-columns:repeat(auto-fit,minmax(80px,1fr));gap:0 12px;margin:14px 0 4px}
.nums div{border-top:1px solid var(--line);padding:8px 0} .nums dt{font-size:11px;color:var(--mute)} .nums dd{margin:2px 0 0;font:800 20px/1.1 var(--sans);color:var(--ink)} .nums dd.hot{color:var(--bad)}
.needs{list-style:none;margin:8px 0 0;padding:0} .needs li{display:grid;grid-template-columns:52px 1fr;gap:8px;padding:7px 0;border-top:1px solid var(--line);font-size:13.5px}
.needs b{font-weight:600;color:var(--ink)} .needs .more{display:block;color:var(--mute);font-size:12.5px}
.prio{align-self:start;text-align:center;padding:4px 0;border:1px solid var(--line-strong);font:600 10px/1 var(--sans);letter-spacing:.08em;text-transform:uppercase;color:var(--mute)}
.prio.p1{background:var(--ink);border-color:var(--ink);color:var(--raised)} .prio.p2{border-color:var(--b);color:var(--b)}
.calm{margin:10px 0 0;color:var(--mute);font-size:13.5px} .calm code{font:500 12px ui-monospace,Menlo,Consolas,monospace;background:var(--sunken);padding:2px 5px;color:var(--ink)}
.agenda{list-style:none;margin:0;padding:0;background:var(--raised);border:1px solid var(--line)}
.agenda li{display:grid;grid-template-columns:170px 150px 1fr auto;gap:12px;align-items:center;padding:10px 14px;border-bottom:1px solid var(--line);font-size:14px} .agenda li:last-child{border-bottom:0}
.agenda .d{font-weight:600;color:var(--ink)} .agenda .br{display:flex;align-items:center;gap:8px;color:var(--mute);font-size:13px} .agenda .br i{width:9px;height:9px;background:var(--b-raw)} .agenda em{font-style:normal;color:var(--mute);font-size:12.5px}
.empty{color:var(--mute)}
footer{margin-top:40px;padding-top:14px;border-top:1px solid var(--line);color:var(--mute);font-size:12.5px}
@media (max-width:700px){main{padding:22px 16px 48px}.strip{grid-template-columns:1fr 1fr}.strip div{padding-left:0;border-left:0}.grid{grid-template-columns:1fr}.agenda li{grid-template-columns:1fr;gap:2px}}
</style></head>
<body><div class="bg" aria-hidden="true"></div><main>
${label('grid', 'Content overview')}
<h1>All brands</h1>
<p class="meta">${ok.length} brand${ok.length === 1 ? '' : 's'} on this computer · made ${esc(now.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }))} · refresh: type <b>/content-calendar all</b> in Claude Code</p>
<dl class="strip"><div><dt>Needs you now</dt><dd class="${totals.now ? 'hot' : ''}">${totals.now}</dd></div><div><dt>Needs you in all</dt><dd>${totals.all}</dd></div><div><dt>Posted this week</dt><dd>${totals.posted7}</dd></div><div><dt>Scheduled</dt><dd>${totals.scheduled}</dd></div><div><dt>In progress</dt><dd>${totals.working}</dd></div></dl>
<h3>Brands, most urgent first</h3>
${ok.length ? `<div class="grid">${ok.map(card).join('')}</div>` : '<p class="empty">No brand folders yet. Each brand adds itself when its dashboard is drawn (/content-calendar in that folder), or add a whole folder of brands with --scan.</p>'}
<h3>Next 7 days, every brand</h3>
${coming.length ? `<ol class="agenda">${coming.slice(0, 40).map(({ M, k, e }) => `<li style="--b-raw:${palette(M.accent).raw}"><span class="d">${esc(M.pretty(k))}${e.time ? ` · ${esc(e.time)}` : ''}</span><span class="br"><i aria-hidden="true"></i>${esc(M.name)}</span><span>${esc(clip(e.it.title, 70))}</span><em>${esc(e.kind === 'scheduled' ? 'Scheduled' : `Planned · ${stageName(e.it.stage)}`)}</em></li>`).join('')}</ol>` : '<p class="empty">Nothing planned or scheduled in the next 7 days.</p>'}
${brands.some((b) => b.broken) ? `<h3>Could not read</h3><p class="empty">${brands.filter((b) => b.broken).map((b) => esc(b.root)).join('<br>')}</p>` : ''}
<footer>Read from each brand folder on this computer. This page posts nothing and stays on this computer.</footer>
</main></body></html>
`;
const out = path.join(CONFIG_DIR, 'overview.html');
writeAtomic(out, html);
console.log(`All brands: ${ok.length} brand${ok.length === 1 ? '' : 's'}, ${totals.now} thing${totals.now === 1 ? ' needs' : 's need'} you now, ${totals.all} in all. Wrote ${out}`);
for (const M of ok.slice(0, 6)) { const n = M.attention.filter((a) => a.p === 1).length; if (n) console.log(`  ${M.name}: ${n} now · ${M.attention.find((a) => a.p === 1).it.title}`); }
if (args.includes('--open')) openFile(out);
