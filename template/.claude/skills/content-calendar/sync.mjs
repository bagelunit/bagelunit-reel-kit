#!/usr/bin/env node
// Keep the dashboard in step with the brand folder. Claude Code runs this after each step it takes in this folder
// (the hook in .claude/settings.json). It redraws brand/dashboard.html and brand/calendar.md only when a file the
// dashboard reads has changed since the last redraw, so it costs next to nothing. If the brand put its dashboard online
// (brand.json -> dashboard.host), it queues an upload in the background (host.mjs, at most every publish_every minutes).
// It never posts or sends anything, never fails the step it follows, and prints nothing. A redraw that fails leaves one
// line in .cache/sync-error.log (calendar.mjs), which the next session's notice reports once.
//
//   node .claude/skills/content-calendar/sync.mjs            (what the hook runs)
//   node .claude/skills/content-calendar/sync.mjs --force    redraw now
import fs from 'node:fs';
import path from 'node:path';
import { findBrand } from './lib.mjs';

const quietExit = () => process.exit(0);
process.on('uncaughtException', quietExit);
process.on('unhandledRejection', quietExit);

const root = findBrand(process.env.CLAUDE_PROJECT_DIR || process.cwd());
if (!root) quietExit();

// what the dashboard reads: brand files and, per reel, its record, words, settings and finished files
function stamp() {
  let newest = 0, count = 0;
  const look = (f) => { try { const st = fs.statSync(f); count++; if (st.mtimeMs > newest) newest = st.mtimeMs; } catch {} };
  const brand = path.join(root, 'brand');
  for (const f of ['brand.json', 'plan.md', 'log.md', 'insights.csv', 'swipe.md', 'stats.md', 'instagram.json', 'followers.csv', 'tests.md', 'host/host.json', 'facebook.json', 'threads.json', 'publisher.json', 'inbox-log.md']) look(path.join(brand, f));
  look(path.join(root, '.cache', 'refresh-status.json'));
  const reels = path.join(root, 'reels');
  let names = [];
  try { names = fs.readdirSync(reels, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('_') && !e.name.startsWith('.')).map((e) => e.name); } catch {}
  for (const n of names) {
    const d = path.join(reels, n);
    look(d);
    for (const f of ['approvals.md', 'script.txt', 'reel.json', 'STORYBOARD.md', 'onscreen.md', 'test.json', 'out', 'out/platforms', 'build/voice-log.jsonl']) look(path.join(d, f));
    try { for (const f of fs.readdirSync(path.join(d, 'out'))) look(path.join(d, 'out', f)); } catch {}
  }
  return `${names.length}:${count}:${Math.round(newest)}`;
}

const stampFile = path.join(root, '.cache', 'dashboard-stamp');
const now = stamp();
let before = '';
try { before = fs.readFileSync(stampFile, 'utf8').trim(); } catch {}
const pageMissing = !fs.existsSync(path.join(root, 'brand', 'dashboard.html'));
if (now === before && !pageMissing && !process.argv.includes('--force')) quietExit();

const { build } = await import('./calendar.mjs');
build(root);
try { const { queuePublish } = await import('./host.mjs'); queuePublish(root); } catch {}   // an online copy follows, at most every few minutes
fs.mkdirSync(path.dirname(stampFile), { recursive: true });
fs.writeFileSync(stampFile, stamp() + '\n');
quietExit();
