#!/usr/bin/env node
// BagelUnit Reel Kit: build the commands reference from one list.
//
//   node setup/make-commands.mjs            writes COMMANDS.md and docs/commands.csv (opens in Excel)
//   node setup/make-commands.mjs --pdf      also writes docs/commands.pdf (needs the kit installed: it uses its browser)
//   node setup/make-commands.mjs --check    fails if a skill or engine command has no entry, or COMMANDS.md is stale (CI)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = fs.readFileSync(path.join(REPO, 'VERSION'), 'utf8').trim();

// [command, what it does, where you type it]
const GROUPS = [
  ['Get started (once per computer)', 'Type these in a terminal in the kit folder, or ask Claude Code there to run them.', [
    ['bash setup/install.sh', 'Installs the kit on a Mac or Linux computer: checks the programs it needs, installs the reel engine, the sound library and the plugins. Safe to run again; run it after every kit update.', 'terminal, kit folder'],
    ['node setup/install.mjs', 'The same installer, for Windows (it works on every system).', 'terminal, kit folder'],
    ['/brand-setup', 'The first command after installing: makes your brand\'s own folder (named <brand>-reels) and asks about your brand.', 'Claude Code, kit folder'],
    ['node setup/new-brand.mjs <folder>', 'Makes a new brand folder from the command line, for example ~/Reels/acme (it becomes acme-reels).', 'terminal, kit folder'],
    ['node setup/sync-template.mjs <brand folder>', 'Shows what a kit update would change in a brand folder; add --apply to do it. /kit-update does this for you.', 'terminal, kit folder'],
  ]],
  ['Set up and keep up to date', 'Type these in Claude Code inside a brand folder.', [
    ['/brand-setup', 'Sets up the brand (name, handle, colours, logo, fonts, presenter, voice, call to action) or changes it later.', 'brand folder'],
    ['/sticker-host', 'Makes your sticker host, a cartoon of you or your mascot for Print reels: a base pose from one photo, then a starter 10, then any pose a reel needs (new, add <pose>, check <reel>, status).', 'brand folder'],
    ['/logo-library', 'Adds and checks the logos and app icons your reels show: finds the brand\'s own artwork (it asks before downloading anything), records the rights, puts the SVG in a reel, and blocks posting a reel whose logos are not approved. The kit ships no logos.', 'brand folder'],
    ['/kit-update', 'Checks for a newer kit, shows what changed, updates this folder without touching your brand or reels, and updates the engine too.', 'brand folder'],
  ]],
  ['Instagram skills (research, writing, planning)', 'Ready-made Instagram skills in every brand folder.', [
    ['/ig-audit', 'Post-mortem on what you posted: which reels worked, why, and what to stop making.', 'brand folder'],
    ['/ig-caption', 'Writes the Instagram caption (first line, body, one ask, search terms, hashtags) and lints it.', 'brand folder'],
    ['/ig-carousel', 'Builds a carousel: the cover, slide-by-slide copy and the 1080x1350 files.', 'brand folder'],
    ['/ig-comment', 'Writes comments on other people\'s posts that read as a person with an opinion.', 'brand folder'],
    ['/ig-dm', 'Writes DMs that get replies: keyword delivery, first message, collab pitch and follow-ups.', 'brand folder'],
    ['/ig-human', 'Strips the machine fingerprint out of a draft (dashes, AI words) and scores how human it reads.', 'brand folder'],
    ['/ig-plan', 'Builds the week: what to post, which format, when, and who to engage with.', 'brand folder'],
    ['/ig-profile', 'Scores an Instagram profile out of 100 and rewrites the parts that lose points.', 'brand folder'],
    ['/ig-reel', 'Writes a reel from a raw idea: hook options off 26 formulas, script, on-screen text and a timed beat sheet.', 'brand folder'],
    ['/ig-repurpose', 'Turns one long asset (video, podcast, newsletter, call) into a week of reels and carousels.', 'brand folder'],
    ['/ig-reply', 'Drafts replies to the comments under your own posts, worth-answering first.', 'brand folder'],
    ['/ig-story', 'Writes the day\'s Stories: the frame-by-frame sequence and the one that moves people to DMs.', 'brand folder'],
    ['/ig-viral', 'Finds the reels working in your niche, ranks them by how far each beat its own account, and builds a swipe file.', 'brand folder'],
  ]],
  ['Make a reel', 'The main command, plus the steps it uses. Claude picks the right one; you can also type it.', [
    ['/bagelunit-reels', 'Makes a reel: type it with your topic. Script, voice, animated shots, self-checks and the final mp4, with three approvals on the way.', 'brand folder'],
    ['/viral-hook-writer', 'Writes hooks (the first 1 to 3 seconds) for a reel.', 'brand folder'],
    ['/hook-mining', 'Makes new hooks from a file of hooks that already worked, keeping what made them work.', 'brand folder'],
    ['/ab-hook-tester', 'A/B tests a reel\'s hook: two clearly different versions, each approved, posted as Instagram trial reels, compared on one number; add record to save the winner.', 'brand folder'],
    ['/reel-scripter', 'Turns an idea or a hook into a full 30 to 45 second script.', 'brand folder'],
    ['/reel-builder', 'Turns an idea into a ready-to-shoot plan (lines, on-screen text, scenes), without rendering.', 'brand folder'],
    ['/humanizer', 'Rewrites a script, caption or reply so it sounds like you, not like AI, and checks the brand\'s banned words.', 'brand folder'],
  ]],
  ['Check before you post', 'Run on every reel; Claude runs them at the approvals.', [
    ['/reel-factcheck', 'Checks every claim against its source, before the voice is made and again on the final.', 'brand folder'],
    ['/reel-review', 'Reviews a draft or final against the kit\'s quality bar and writes a one-line verdict.', 'brand folder'],
    ['/reel-predict', 'Measures a reel and, once 8 or more posted reels have numbers, estimates where viewers may drop off.', 'brand folder'],
  ]],
  ['Finish and post', '', [
    ['/caption-and-hashtags', 'Writes the caption in three blocks: the caption, up to 5 hashtags picked from what has worked for you, and a line of search keywords. Uses only cleared facts.', 'brand folder'],
    ['/reel-loop', 'The self-improving loop: reads what your trial reels did (skip rate, watch time), says what to change, makes the next reel from it and takes it to you for approval, until one breaks out. Never posts by itself.', 'brand folder'],
    ['/cover-thumbnail-brief', 'Writes the cover text and the brief for a cover that stops the scroll.', 'brand folder'],
    ['/reel-repurpose', 'Turns an approved reel into its TikTok and YouTube Shorts versions (captions, titles, a check of where each app\'s buttons sit), a carousel and a blog post.', 'brand folder'],
    ['/reel-posting', 'Gets an approved reel posted: a posting card for posting by hand, or scheduling it through the kit\'s publisher on Instagram, your Facebook Page, Threads, YouTube Shorts and TikTok (dry run first), and setting that up step by step.', 'brand folder'],
    ['/content-calendar', 'Your content calendar and dashboard: every reel from idea to posted, what needs you, the four agents, followers and trends. Add plan to fill the next weeks, days to set your posting days and times (any number a day), how-often for a suggestion of how often to post from accounts like yours, what you can keep up and your own numbers, best-times for the hours to post at (from your own posts, when your audience is online and, as weak evidence, the winners of the accounts you track; it moves the times in the plan on your yes), competitors to track other accounts (what they post, what beats their own normal, what the winners share), ideas for post ideas drawn from what is working for them, host to view it on your Wi-Fi or online (Netlify suggested), connect instagram, connect facebook or connect threads for your numbers on each, connect telegram for a phone summary, auto to refresh by itself, all for every brand on one page. Posts nothing.', 'brand folder'],
  ]],
  ['Research and plan', '', [
    ['/comment-mining', 'Reads your comments and DMs for the questions and words your audience uses, and turns them into ideas.', 'brand folder'],
    ['/reel-sources', 'Finds reference material: what people in your niche ask, reels to study, the top posts for a hashtag (Meta\'s API), and a reel downloaded for study.', 'brand folder'],
    ['/account-audit', 'Finds the reels that beat an account\'s own median (yours or a competitor\'s), by arithmetic. Reads competitors through Meta\'s official API when Instagram is connected with Unified Login.', 'brand folder'],
    ['/reel-analyzer', 'Breaks down a reel you supply: hook, structure, pacing and visuals.', 'brand folder'],
    ['/going-viral', 'The strategy: pick the goal, the emotion behind it, then the hook and the angle.', 'brand folder'],
    ['/virality', 'Plans or reviews a reel so it gets watched, or explains why a post flopped.', 'brand folder'],
  ]],
  ['After posting', '', [
    ['/analytics-readout', 'Type it with your numbers a day or more after posting: adds them to brand/insights.csv and says in plain words what to make more of.', 'brand folder'],
    ['/comment-responder', 'Lists the comments and DMs waiting for you and answers, hides or sends a private reply, one at a time after your yes. Also sets up an automatic keyword reply in your publisher, off until tested.', 'brand folder'],
    ['/content-factory', 'The opt-in autopilot that runs the whole loop, one reel at a time, only as far as your permissions allow.', 'brand folder'],
  ]],
  ['Engine commands (Claude runs these for you)', 'node ~/.claude/skills/bagelunit-reels/tools/kit.mjs <command> reels/<slug>', [
    ['kit start', 'Starts a new reel folder in a style (print, depth, talking, or one of the 19 scene styles). Only inside a set-up brand folder.', 'engine'],
    ['kit host', 'Links the brand\'s sticker host into the reel and names any pose the reel needs that the set does not have (--check).', 'engine'],
    ['kit frames', 'Takes still frames at chosen moments, plus a contact sheet, to look at before rendering.', 'engine'],
    ['kit render', 'Renders a half-size draft, or the final 1080x1920 video with --final.', 'engine'],
    ['kit pace', 'Checks the reel keeps moving and finds still stretches.', 'engine'],
    ['kit effort', 'Checks the reel was built for this script, not from ready-made pieces.', 'engine'],
    ['kit lint', 'Checks the shot rules: lengths, cuts on words, rhythm, first-frame motion.', 'engine'],
    ['kit qa', 'Checks the final file: size, loudness, black or frozen frames, text safe zone, sync.', 'engine'],
    ['kit facts', 'The mechanical half of the fact check, and records the fact-check verdict.', 'engine'],
    ['kit gate', 'Records an approval (A, B or C) and checks the final file has not changed since.', 'engine'],
    ['kit measure', 'Measures a video: cuts, words, loudness, silence, still stretches.', 'engine'],
    ['kit calibrate', 'Learns from your own Instagram numbers (needs 8 or more reels).', 'engine'],
    ['kit predict', 'Measured facts, plus a watch-time estimate once calibrated.', 'engine'],
    ['kit sound', 'Mixes the voice, effects and music.', 'engine'],
    ['kit export', 'Joins picture and sound into the finished mp4 for Instagram.', 'engine'],
    ['kit scene', 'Scene styles (the 19 looks, for example stick-figure-folk, comic, map): list them, plan the scenes of a reel, check them, or make a preview voice that needs no key (list, plan, check, stand-in).', 'engine'],
    ['kit cover', 'Renders the reel\'s cover to out/cover.jpg at Meta\'s size, plus a sheet showing how it crops in the grid.', 'engine'],
    ['kit organize', 'Files your reel folders by post date (reels/2026/11 November/November 12/<slug>) or back to reels/<slug>. Shows the moves first; --apply does them.', 'engine'],
    ['kit tidy', 'Frees disk space in posted reels: removes build files and unapproved exports, keeps the words and the approved video. Shows the list first; --apply deletes.', 'engine'],
    ['kit live', 'Serves the reel so you can watch it play in a browser.', 'engine'],
  ]],
  ['Publisher commands (in a brand folder, after you set it up)', 'node publisher/scripts/<script>.mjs', [
    ['setup.mjs', 'Writes the publisher\'s settings for this brand and prints the steps in order; secrets sends the tokens from your token files to Cloudflare without showing them (--dry-run first); subscribe asks Meta to send this account\'s comments and messages to the publisher, for keyword replies (--dry-run first); --url saves its address; check shows each platform and whether it is live.', 'publisher'],
    ['schedule.mjs', 'Schedules an approved reel on the platforms in brand.json posting.platforms (Instagram only when empty; --platforms overrides it for one reel), at --at or, with --from-plan, at the time in the reel\'s plan.md row (--preview checks without uploading); status lists posts and comment replies; cancel <id> stops one.', 'publisher'],
    ['pull.mjs', 'Brings back what went out: links, errors and automatic replies, for the dashboard and the reel\'s Posting lines.', 'publisher'],
    ['forget.mjs', 'Deletes what the publisher kept about one person, when they ask.', 'publisher'],
  ]],
  ['From the plugin the installer adds', '', [
    ['/hyperframes', 'The HyperFrames plugin: an optional second engine (HTML scenes rendered to video).', 'brand folder'],
  ]],
];

const rows = GROUPS.flatMap(([g, , items]) => items.map(([c, w, where]) => ({ group: g, cmd: c, what: w, where })));

function markdown() {
  const out = [`# BagelUnit Reel Kit commands`, '',
    `Every command in the kit (version ${version}) and what it does. Also as a [PDF](docs/commands.pdf) and a [spreadsheet](docs/commands.csv) (opens in Excel).`, '',
    'Most of the time you only need four: `/brand-setup`, `/bagelunit-reels` with your topic, `/analytics-readout` with your numbers, and `/kit-update`.', ''];
  for (const [g, note, items] of GROUPS) {
    out.push(`## ${g}`, '');
    if (note) out.push(note.startsWith('node ') ? `\`${note}\`` : note, '');
    out.push('| Command | What it does |', '|---|---|');
    for (const [c, w] of items) out.push(`| \`${c}\` | ${w.replace(/\|/g, '\\|')} |`);
    out.push('');
  }
  out.push('This file is made by `node setup/make-commands.mjs` from one list; edit the list there, not this file.', '');
  return out.join('\n');
}

function csv() {
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  return ['Group,Command,What it does,Where you type it', ...rows.map((r) => [r.group, r.cmd, r.what, r.where].map(q).join(','))].join('\r\n') + '\r\n';
}

function html() {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const body = GROUPS.map(([g, note, items]) => `<h2>${esc(g)}</h2>${note ? `<p class="note">${esc(note)}</p>` : ''}<table>${items.map(([c, w]) => `<tr><td class="c"><code>${esc(c)}</code></td><td>${esc(w)}</td></tr>`).join('')}</table>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:-apple-system,Helvetica,Arial,sans-serif;color:#222;margin:0;font-size:10.5pt;line-height:1.35}
    h1{font-size:20pt;margin:0 0 4px} .sub{color:#666;margin:0 0 14px}
    h2{font-size:12.5pt;margin:16px 0 4px;border-bottom:2px solid #e4572e;padding-bottom:2px;break-after:avoid}
    .note{color:#555;margin:2px 0 6px;font-size:9.5pt} table{width:100%;border-collapse:collapse;break-inside:auto}
    tr{break-inside:avoid} td{border-bottom:1px solid #e6e2d8;padding:5px 6px;vertical-align:top}
    td.c{width:34%} code{font-family:Menlo,Consolas,monospace;font-size:9.5pt;background:#f4f1ea;padding:1px 4px;border-radius:3px}
    .top{background:#f4f1ea;padding:8px 10px;border-radius:6px;margin-bottom:6px}
  </style></head><body><h1>BagelUnit Reel Kit commands</h1><p class="sub">Version ${version}. Every command and what it does.</p>
  <p class="top">Most of the time you only need four: <code>/brand-setup</code>, <code>/bagelunit-reels</code> with your topic, <code>/analytics-readout</code> with your numbers, and <code>/kit-update</code>.</p>${body}</body></html>`;
}

async function pdf() {
  const where = [path.join(REPO, 'studio'), path.join(os.homedir(), '.claude', 'skills', 'bagelunit-reels')]
    .find((d) => fs.existsSync(path.join(d, 'node_modules', 'playwright')));
  if (!where) { console.error('PDF skipped: the kit\'s browser is not installed (run bash setup/install.sh first).'); process.exit(1); }
  const { chromium } = createRequire(path.join(where, 'package.json'))('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(html(), { waitUntil: 'load' });
  await page.pdf({ path: path.join(REPO, 'docs', 'commands.pdf'), format: 'A4', margin: { top: '16mm', bottom: '16mm', left: '14mm', right: '14mm' },
    displayHeaderFooter: true, headerTemplate: '<span></span>',
    footerTemplate: `<div style="font-size:8px;color:#888;width:100%;text-align:center">BagelUnit Reel Kit ${version} · page <span class="pageNumber"></span> of <span class="totalPages"></span></div>` });
  await browser.close();
  console.log('wrote docs/commands.pdf');
}

// Windows checkouts may turn line endings into CRLF; compare the text, not the line endings.
const lf = (t) => t.replace(/\r\n/g, '\n');

function check() {
  const problems = [];
  const listed = new Set(rows.map((r) => r.cmd));
  for (const dir of ['template/.claude/skills', '.claude/skills']) {
    for (const s of fs.readdirSync(path.join(REPO, dir))) if (!listed.has(`/${s}`)) problems.push(`skill ${dir}/${s} has no entry`);
  }
  const kit = fs.readFileSync(path.join(REPO, 'studio', 'tools', 'kit.mjs'), 'utf8');
  const block = kit.slice(kit.indexOf('const COMMANDS = {'));
  for (const m of block.matchAll(/^\s{2}([a-z]+): \[/gm)) if (!listed.has(`kit ${m[1]}`)) problems.push(`engine command kit ${m[1]} has no entry`);
  const now = fs.existsSync(path.join(REPO, 'COMMANDS.md')) ? fs.readFileSync(path.join(REPO, 'COMMANDS.md'), 'utf8') : '';
  if (lf(now) !== lf(markdown())) problems.push('COMMANDS.md is out of date: run node setup/make-commands.mjs');
  const csvNow = fs.existsSync(path.join(REPO, 'docs', 'commands.csv')) ? fs.readFileSync(path.join(REPO, 'docs', 'commands.csv'), 'utf8') : '';
  if (lf(csvNow) !== lf(csv())) problems.push('docs/commands.csv is out of date: run node setup/make-commands.mjs');
  if (problems.length) { console.error('Commands reference:\n  ' + problems.join('\n  ')); process.exit(1); }
  console.log(`Commands reference is complete (${rows.length} commands).`);
}

if (process.argv.includes('--check')) check();
else {
  fs.writeFileSync(path.join(REPO, 'COMMANDS.md'), markdown());
  fs.writeFileSync(path.join(REPO, 'docs', 'commands.csv'), csv());
  console.log(`wrote COMMANDS.md and docs/commands.csv (${rows.length} commands)`);
  if (process.argv.includes('--pdf')) await pdf();
}
