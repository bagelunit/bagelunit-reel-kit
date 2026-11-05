// session.mjs · opens a reel page in headless Chromium and draws any moment of it, plus the machine-wide render lock
// (one render at a time, so a laptop never melts).
//
// Every mode's page fills ONE object, window.studio (modes/MODE-RULES.md):
//   ready    a Promise that resolves once fonts, assets, words and shots are loaded (the rest is read after it)
//   length   the reel's length in seconds
//   show(t)  draws moment t (it may return a Promise) and never looks at the wall clock
//   grab     'canvas' (the frame is <canvas id="c">) or 'screen' (WebGL with HTML layers on top: take a screenshot)
//   cues     optional [{t, name, gain}] sound cues, saved as build/sfx.json
//   quiet    optional regions the pace check should ignore, saved as build/motion_mask.json
import fs from 'node:fs';
import path from 'node:path';
import { launch } from './chromium.mjs';
import { serve } from './server.mjs';
import { withRenderLock } from './lock.mjs';

// exclusive(job): runs job while holding the machine-wide render lock (tools/lock.mjs)
export const exclusive = (job) => withRenderLock(job);

/* ── what the page complains about ──────────────────────────────────────────────────────────────────────────────────── */
const OPTIONAL_MISSING = /404|Not Found/i;          // optional files may be absent
const HINT = /^\s*(\[warn\]|warning:)/i;            // a mode's own "[warn] …" / "warning: …" notes are advice, not failures
// group repeats of one error across frames: drop times from the text
const errorKey = (text) => text.split('\n')[0].replace(/@\s*-?\d+(\.\d+)?/g, '').replace(/\bt=\s*-?\d+(\.\d+)?/g, '').slice(0, 220);

function complaints() {
  const loading = [], hints = new Set(), drawing = new Map();
  let at = null;
  const error = (text) => {
    if (at === null) { loading.push(text); return; }
    const key = errorKey(text);
    drawing.set(key, [...(drawing.get(key) || []), at]);
  };
  const consoleMessage = (msg) => {
    const text = msg.text();
    if (msg.type() !== 'error' || OPTIONAL_MISSING.test(text)) return;
    if (HINT.test(text)) hints.add(text.split('\n')[0].slice(0, 240));
    else error(text);
  };
  const report = (buildDir) => {
    if (hints.size) console.warn(`\nhints from the page (not errors, still worth a look):\n  ${[...hints].slice(0, 10).join('\n  ')}`);
    const file = path.join(buildDir, 'render_errors.txt');
    if (!drawing.size) { fs.rmSync(file, { force: true }); return; }
    process.exitCode = 2;
    const rows = [...drawing].map(([msg, times]) => `  ${times.length}x  t=${times[0].toFixed(2)}${times.length > 1 ? '..' + times.at(-1).toFixed(2) : ''}  ${msg}`);
    fs.writeFileSync(file, rows.join('\n') + '\n');
    console.error(`\n⚠ ${drawing.size} kind(s) of error while drawing: those frames are INCOMPLETE. Fix them first (also in build/render_errors.txt):\n${rows.slice(0, 12).join('\n')}`);
  };
  return { error, consoleMessage, report, loading, drawingAt: (t) => { at = t; } };
}

/* ── open a reel ────────────────────────────────────────────────────────────────────────────────────────────────────── */
export async function openReel(reel, { scale = 0.5, query = '', page: pageFile = 'index.html', fail }) {
  const { server, url } = await serve(reel.dir, reel.cfg.style);
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: scale });
  const log = complaints();
  page.on('pageerror', (err) => log.error(err.message));
  page.on('console', log.consoleMessage);
  await page.goto(`${url}/${pageFile}${query}`, { timeout: 60000 });
  try {
    await page.waitForFunction(() => Boolean(window.studio && window.studio.ready), null, { timeout: 30000 });
    await page.evaluate(() => window.studio.ready);
  } catch (err) { fail(`the page never finished loading (window.studio.ready).\n${log.loading.slice(0, 8).join('\n')}\n${err.message}`); }
  const broken = log.loading.filter((e) => e && e.trim());
  if (broken.length) {
    process.exitCode = 2;
    console.error(`\n⚠ ${broken.length} error(s) while LOADING the page: a shot or part file failed, so everything it draws is missing. Fix first:\n  ${broken.slice(0, 8).join('\n  ')}`);
  }

  const info = await page.evaluate(() => { const s = window.studio; return { seconds: s.length, capture: s.grab || 'canvas', cues: s.cues || null, mask: s.quiet || null }; });
  if (!(info.seconds > 0)) fail('the page did not set window.studio.length');
  const build = path.join(reel.dir, 'build');
  fs.mkdirSync(build, { recursive: true });
  if (info.cues) fs.writeFileSync(path.join(build, 'sfx.json'), JSON.stringify(info.cues, null, 1));
  if (info.mask) fs.writeFileSync(path.join(build, 'motion_mask.json'), JSON.stringify(info.mask));

  // one frame as JPEG bytes: a screenshot for WebGL + HTML pages, the canvas pixels otherwise
  const grabCanvas = (q) => page.evaluate((quality) => (document.getElementById('c') || document.querySelector('canvas')).toDataURL('image/jpeg', quality).split(',')[1], q);
  async function frameAt(t, quality = 0.92) {
    log.drawingAt(t);
    await page.evaluate(async (when) => { await window.studio.show(when); }, t);
    return info.capture === 'screen' ? page.screenshot({ type: 'jpeg', quality: Math.round(quality * 100) }) : Buffer.from(await grabCanvas(quality), 'base64');
  }
  async function close() {
    log.report(build);
    await browser.close().catch(() => {});
    server.close();
  }
  return { page, info, frameAt, close };
}
