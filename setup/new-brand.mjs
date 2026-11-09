#!/usr/bin/env node
// BagelUnit Reel Kit: make a new brand folder (a copy of template/). Runs on macOS, Windows and Linux.
//
//   node setup/new-brand.mjs <folder>
//       Copies this repo's template/ to <folder> (for example ~/Reels/my-brand-reels) and prints the next step.
//       The folder name always ends in -reels: "~/Reels/acme" becomes ~/Reels/acme-reels.
//       It refuses a folder that already exists and is not empty, and a folder inside this repo.
//       It changes nothing else. /brand-setup in the kit's folder runs this for you.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(REPO, 'template');
const SKIP = new Set(['.DS_Store', 'node_modules', 'build', 'audio']);   // never copy junk or render output

const arg = process.argv[2];
if (!arg || arg.startsWith('--')) {
  console.error('Usage: node setup/new-brand.mjs <folder>   (for example ~/Reels/my-brand-reels)');
  process.exit(1);
}
if (!fs.existsSync(path.join(SRC, 'CLAUDE.md'))) { console.error('Cannot find template/ next to this script.'); process.exit(1); }

const expanded = arg === '~' || arg.startsWith('~/') || arg.startsWith('~\\') ? path.join(os.homedir(), arg.slice(1)) : arg;
let target = path.resolve(expanded);
// Brand folders are always named <brand>-reels, so they never look like the brand's other folders.
if (!/-reels$/i.test(path.basename(target))) {
  const named = path.join(path.dirname(target), `${path.basename(target)}-reels`);
  console.log(`Brand folders end in -reels: using ${named}`);
  target = named;
}
const inside = (child, parent) => { const r = path.relative(parent, child); return r === '' || (!r.startsWith('..') && !path.isAbsolute(r)); };

if (inside(target, REPO)) { console.error(`A brand folder cannot go inside the kit's own folder (${REPO}). Pick a folder elsewhere, for example ~/Reels/<brand>-reels.`); process.exit(1); }
if (fs.existsSync(target) && fs.readdirSync(target).filter((f) => f !== '.DS_Store').length) {
  console.error(`${target} already exists and is not empty. Pick another name, or update that folder with: node setup/sync-template.mjs "${target}"`);
  process.exit(1);
}

fs.mkdirSync(target, { recursive: true });
fs.cpSync(SRC, target, { recursive: true, filter: (src) => !SKIP.has(path.basename(src)) });
const version = (() => { try { return fs.readFileSync(path.join(target, '.kit-version'), 'utf8').trim(); } catch { return 'unknown'; } })();

console.log(`OK: made a new brand folder at ${target} (kit ${version})`);
console.log('Next: open Claude Code in that folder. It sees the empty brand and asks the brand questions (or type /brand-setup there).');
