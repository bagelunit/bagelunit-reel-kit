#!/usr/bin/env node
// page_capture.mjs: a smooth, crisp phone-sized screen recording of a public web page for a reel.
//   node scripts/capture/page_capture.mjs <url> <out.mp4> [--seconds 6] [--scroll 1400] [--wait 1500] [--hide "css,selectors"] [--click "text"]
// Uses your installed Chrome through playwright-core (no browser download). Output 1080x1920 at 30 fps, no audio: place it in a Print
// scene (a phone frame, a headline above) and cue the narration to what it shows. Only public pages; never log in or capture private data.
// Real product screens are first-party evidence: still re-read the page and clear each claim in brand/facts.md before a script uses it.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const require = createRequire(path.join(os.homedir(), '.claude/skills/bagelunit-reels/'));   // playwright comes with the engine
let chromium; try { ({ chromium } = require('playwright-core')); } catch { console.error('playwright-core is missing: run the kit installer again (bash setup/install.sh).'); process.exit(1); }
const [url, out] = process.argv.slice(2);
const flag = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
if (!url || !out) { console.log('usage: node scripts/capture/page_capture.mjs <url> <out.mp4> [--seconds 6] [--scroll 1400] [--wait 1500] [--hide css] [--click text]'); process.exit(1); }
const SECONDS = Number(flag('--seconds', 6)), SCROLL = Number(flag('--scroll', 1400)), WAIT = Number(flag('--wait', 1500)), FPS = 30;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capture-'));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 693 }, deviceScaleFactor: 1080 / 390, isMobile: true, hasTouch: true, colorScheme: 'light' });
const page = await ctx.newPage();
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(WAIT);
const hide = flag('--hide', ''); if (hide) await page.addStyleTag({ content: `${hide}{display:none !important}` });
await page.addStyleTag({ content: 'html{scroll-behavior:auto !important}' });
const click = flag('--click', ''); if (click) { await page.getByText(click, { exact: false }).first().click({ timeout: 4000 }).catch(() => {}); await page.waitForTimeout(500); }
const n = Math.round(SECONDS * FPS);
for (let i = 0; i < n; i++) {
  const t = i / (n - 1); const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;     // ease in and out
  await page.evaluate((y) => window.scrollTo(0, y), SCROLL * ease);
  await page.screenshot({ path: path.join(dir, `f_${String(i).padStart(5, '0')}.png`), type: 'png' });
}
await browser.close();
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', path.join(dir, 'f_%05d.png'), '-vf', 'scale=1080:1920:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-crf', '17', out]);
fs.rmSync(dir, { recursive: true, force: true });
console.log(`captured ${url} -> ${out} (${SECONDS}s)`);
