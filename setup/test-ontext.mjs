#!/usr/bin/env node
// On-screen text, shot list and text boxes work, with no key, no voice and no network (studio/tools/ontext.mjs and the tools that read it):
//  1. the probe's bookkeeping (pure): caption words become a line, a typed text is listed once, a ticking counter by its last value,
//     a blink is marked fleeting, a box is the median over a text's life, a texture string once; kit-written files are replaced and
//     hand-written ones are kept
//  2. kit facts --scope final on a hand-written build/on_screen_text.txt: times never count as numbers, an uncleared number on screen
//     is an error with its own line, a fleeting one a warning, the engine's chapter tag is not a claim, a missing file is SKIPPED
//     (never OK), a file older than the reel's files is a warning, and the fingerprint follows the text, not the times
//  3. kit qa's text check on a small generated video: SKIPPED without boxes, PASS inside the safe zone, FAIL for a box outside it or
//     type under 44 px, chrome and blink boxes not judged, boxes of another length SKIPPED (needs ffmpeg)
//  4. kit lint on a shots.json like the one kit render writes for print (SHOT-LEN on a long scene, clean on good ones)
//  5. with a browser: kit render a print reel, a talking reel and a depth reel (the studio's own browser, or PLAYWRIGHT_DIR; depth also
//     needs three.js in studio/node_modules): build/on_screen_text.txt, build/text_boxes.json, and for print build/shots.json are
//     written by the render, a part of the reel writes none, a hand-written shots.json is kept. Without a browser part 5 says SKIPPED.
//   node setup/test-ontext.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STUDIO = path.join(REPO, 'studio');
const TOOLS = path.join(STUDIO, 'tools');
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ontext-')));
const PY = process.platform === 'win32' ? 'python' : 'python3';
let failures = 0;
const fail = (m) => { failures++; console.error('FAIL: ' + m); };
const ok = (m) => console.log('ok   ' + m);
const check = (cond, m) => (cond ? ok(m) : fail(m));
const out = (r) => (r.stdout || '') + (r.stderr || '');
const ENV = { ...process.env, PYTHONIOENCODING: 'utf-8' };   // the tools print "…" and "·"
const py = (script, ...a) => spawnSync(PY, [path.join(TOOLS, script), ...a], { encoding: 'utf8', env: ENV });
const write = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, typeof s === 'string' ? s : JSON.stringify(s)); };

// ── 1. the probe's bookkeeping ────────────────────────────────────────────────────────────────────────────────────────
const ontext = await import(pathToFileURL(path.join(TOOLS, 'ontext.mjs')).href);
{
  const row = (text, x, y, w, h, extra = {}) => ({ text, src: 'canvas', kind: null, x, y, w, h, fx: x, fy: y - 10, fw: w, fh: h + 20, ...extra });
  const log = new ontext.TextLog();
  const T = (n) => Math.round(n * 10) / 10;
  for (let i = 0; i < 30; i++) {
    const t = T(i / 10), canvas = [];
    // a caption that grows word by word, in one row, from 1.0 s: STOP, STOP LOSING, STOP LOSING 30
    const words = ['STOP', 'LOSING', '30'].filter((_, k) => t >= 1.0 + k * 0.3);
    words.forEach((w, k) => canvas.push(row(w, 120 + k * 200, 300, 150, 60, { kind: 'caption' })));
    // a held statement, from 0.5 s on, whose box drops in for two samples and then rests at y 800
    if (t >= 0.5) canvas.push(row('SAVE 45 %', 200, t < 0.7 ? 700 : 800, 400, 60));
    // a counter that ticks 1..9 every sample from 0.2 s, then holds 10 from 1.2 s
    if (t >= 0.2 && t < 1.1) canvas.push(row(String(Math.round(t * 10) - 1), 500, 1000, 80, 80));
    if (t >= 1.2) canvas.push(row('10', 500, 1000, 80, 80));
    // the engine's tag, a blink, and a texture string drawn twice
    canvas.push(row('01 THE PROBLEM', 140, 133, 300, 38, { kind: 'chrome' }));
    if (t === 1.5) canvas.push(row('99 %', 300, 1200, 100, 60));
    if (t === 0.5 || t === 2.0) canvas.push({ text: 'Hotel Rio', src: 'texture', kind: null });
    log.add(t, { canvas, dom: [] });
  }
  const spans = log.finish(3.0);
  const lines = ontext.linesFor(spans, [], 3.0);
  const has = (re) => lines.some((l) => re.test(l));
  check(has(/^\[1\.60-3\.00s caption\] STOP LOSING 30$/) && !has(/\] STOP$/) && !has(/\] STOP LOSING$/), 'caption words become one line and the typing steps are folded away: ' + lines.find((l) => /caption/.test(l)));
  check(has(/\] 10$/) && !lines.some((l) => /\] [2-8]$/.test(l)), 'a counter ticking 1 to 9 is listed by its last held value (10)');
  check(has(/^\[0\.50-3\.00s text\] SAVE 45 %$/) && !has(/s text fleeting\] SAVE/), 'a held text keeps its times and is not marked fleeting');
  check(has(/^\[1\.50-1\.60s text fleeting\] 99 %$/), 'a text seen for one sample is marked fleeting');
  check(has(/^\[0\.00-3\.00s chrome\] 01 THE PROBLEM$/), 'the engine tag keeps its kind (chrome)');
  check(lines.filter((l) => /Hotel Rio/.test(l)).length === 1 && has(/^\[0\.50-2\.10s in-scene\] Hotel Rio$/), 'a texture string drawn twice is one line, first to last draw');
  const boxes = ontext.boxesFor(spans), save = boxes.find((b) => b.label === 'SAVE 45 %');
  check(save && save.y === 800 && save.x === 200 && save.size === 80 && save.kind === 'text', 'a box is the median over the text\'s life (the drop-in sample does not decide it) and carries the font size');
  check(!boxes.some((b) => b.label === 'Hotel Rio'), 'a texture string has no box (nothing on the screen was measured)');

  // files: written by the kit, replaced by the kit, never over a hand-written one
  const dir = path.join(tmp, 'reelA');
  const notes = ontext.writeAll(dir, log, { seconds: 3.0, shots: [{ id: 'hook', t0: 0, t1: 3, layout: null, face: null, props: null }] });
  const tb = JSON.parse(fs.readFileSync(path.join(dir, 'build', 'text_boxes.json'), 'utf8'));
  check(tb.source === ontext.SOURCE && tb.seconds === 3 && Array.isArray(tb.boxes) && tb.boxes.length === boxes.length, 'build/text_boxes.json: {source, seconds, boxes}');
  check(fs.readFileSync(path.join(dir, 'build', 'on_screen_text.txt'), 'utf8').trim().split('\n').length === lines.length, 'build/on_screen_text.txt has one line per text');
  check(JSON.parse(fs.readFileSync(path.join(dir, 'build', 'shots.json'), 'utf8')).shots[0].id === 'hook' && notes.some((n) => /shot\(s\)/.test(n)), 'build/shots.json holds the page\'s scene list');
  write(path.join(dir, 'build', 'shots.json'), [{ id: 'mine', t0: 0, t1: 2 }]);
  write(path.join(dir, 'build', 'text_boxes.json'), [{ t0: 0, t1: 1, x: 100, y: 400, w: 300, h: 60, label: 'mine' }]);
  const kept = ontext.writeAll(dir, log, { seconds: 3.0, shots: [{ id: 'hook', t0: 0, t1: 3 }] });
  check(JSON.parse(fs.readFileSync(path.join(dir, 'build', 'shots.json'), 'utf8'))[0].id === 'mine' && JSON.parse(fs.readFileSync(path.join(dir, 'build', 'text_boxes.json'), 'utf8'))[0].label === 'mine'
    && kept.filter((n) => /written by hand/.test(n)).length === 2, 'hand-written shots.json and text_boxes.json are kept, and the render says so');
  const none = new ontext.TextLog();
  none.add(0, null);
  check(ontext.writeAll(path.join(tmp, 'reelB'), none, { seconds: 3 }).some((n) => /NOT written/.test(n)) && !fs.existsSync(path.join(tmp, 'reelB', 'build', 'on_screen_text.txt')), 'a page the probe could not read writes no file, and says so');
}

// ── 2. the fact check reads the on-screen text ────────────────────────────────────────────────────────────────────────
{
  const R = path.join(tmp, 'facts', 'reels', 'r');
  const today = new Date().toISOString().slice(0, 10);
  const facts = (extra = '') => `# facts\n\n| Claim (exact wording) | Source | Cleared for public use (date) | Notes / limits |\n|---|---|---|---|\n| 30 clinics use it | https://example.com/a | ${today} | |\n${extra}\n## Never say\n- (none)\n`;
  const FACTS = path.join(tmp, 'facts', 'facts.md');
  write(FACTS, facts());
  write(path.join(R, 'reel.json'), { style: 'print', name: 'r' });
  write(path.join(R, 'script.txt'), 'We help 30 clinics every day.\n');
  const ON = path.join(R, 'build', 'on_screen_text.txt');
  const text = (t) => `[0.00-3.00s caption] WE HELP 30 CLINICS\n[1.00-2.00s text] SAVE 45 %\n[2.00-2.10s text fleeting] 99 %\n[0.00-9.00s chrome] 02 THE PROBLEM\n${t}`;
  write(ON, text(''));
  const run = (...a) => py('facts.py', R, 'check', '--facts', FACTS, ...a);
  let r = run('--scope', 'final'), o = out(r);
  check(r.status === 1 && /ERROR NUMBER-NOT-CLEARED\s+on_screen_text\.txt: "45 %" is not in facts\.md \(…SAVE 45 %…\)/.test(o), 'an uncleared number on screen is an error that shows its own line');
  check(!/"30"/.test(o.replace(/script\.txt[^\n]*/g, '')) && !/"0\.00|"3\.00|"1\.00/.test(o), 'a cleared number passes, and the times in the brackets never count as numbers');
  check(/WARN\s+NUMBER-FLEETING\s+on_screen_text\.txt \(fleeting\): "99 %"/.test(o), 'a number on screen for under 0.3 s is a warning (NUMBER-FLEETING), not an error');
  check(!/"02"/.test(o), 'the engine\'s chapter tag (kind chrome) is not read for numbers');
  const fp1 = spawnSync(PY, ['-c', 'import sys; sys.path.insert(0, sys.argv[1]); import facts; from pathlib import Path; print(facts.fingerprint(Path(sys.argv[2]), "final", Path(sys.argv[3])))', TOOLS, R, FACTS], { encoding: 'utf8', env: ENV }).stdout.trim();
  write(ON, text('').replace('[1.00-2.00s', '[1.50-2.90s').replace('[0.00-3.00s caption]', '[0.10-3.10s caption]'));
  const fp2 = spawnSync(PY, ['-c', 'import sys; sys.path.insert(0, sys.argv[1]); import facts; from pathlib import Path; print(facts.fingerprint(Path(sys.argv[2]), "final", Path(sys.argv[3])))', TOOLS, R, FACTS], { encoding: 'utf8', env: ENV }).stdout.trim();
  write(ON, text('[3.00-4.00s text] NOW 46 % OFF\n'));
  const fp3 = spawnSync(PY, ['-c', 'import sys; sys.path.insert(0, sys.argv[1]); import facts; from pathlib import Path; print(facts.fingerprint(Path(sys.argv[2]), "final", Path(sys.argv[3])))', TOOLS, R, FACTS], { encoding: 'utf8', env: ENV }).stdout.trim();
  check(fp1 && fp1 === fp2 && fp1 !== fp3, 'the fact-check fingerprint covers the on-screen text but not its times');
  write(FACTS, facts(`| Saves 45 % of the time and 46 % of the cost | https://example.com/b | ${today} | |\n`));
  r = run('--scope', 'final'); o = out(r);
  check(r.status === 0 && /FACTS CHECK \(final\): OK/.test(o) && !/SKIPPED/.test(o), 'clear the numbers in facts.md and the final check is OK, with nothing skipped');
  r = run('--scope', 'script'); o = out(r);
  check(!/on_screen_text/.test(o), 'the script scope does not read the on-screen text');
  const later = new Date(Date.now() + 60_000);
  fs.utimesSync(path.join(R, 'reel.json'), later, later);
  check(/WARN\s+STALE-ON-SCREEN/.test(out(run('--scope', 'final'))), 'a reel file newer than build/on_screen_text.txt is a warning: render again');
  fs.rmSync(ON);
  r = run('--scope', 'final'); o = out(r);
  check(r.status === 0 && /SKIP\s+ON-SCREEN-TEXT[^\n]*NOT checked/.test(o) && /FACTS CHECK \(final\): OK[^\n]*SKIPPED: ON-SCREEN-TEXT/.test(o), 'no build/on_screen_text.txt: the final check says SKIPPED, never a plain OK');
  const rec = py('facts.py', R, 'record', '--facts', FACTS, '--scope', 'final', '--result', 'PASS');
  check(rec.status === 0 && /SKIPPED: ON-SCREEN-TEXT/.test(fs.readFileSync(path.join(R, 'approvals.md'), 'utf8')), 'a PASS recorded without on-screen text carries SKIPPED in approvals.md');
}

// ── 3. kit qa's text check ────────────────────────────────────────────────────────────────────────────────────────────
const HAS_FFMPEG = spawnSync('ffmpeg', ['-version']).status === 0;
if (!HAS_FFMPEG) console.log('SKIPPED part 3 (qa text check): ffmpeg is not installed');
else {
  const R = path.join(tmp, 'qa', 'reels', 'r');
  write(path.join(R, 'reel.json'), { style: 'print', name: 'r' });
  const video = path.join(R, 'out', 'r.mp4');
  fs.mkdirSync(path.dirname(video), { recursive: true });
  const made = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=1080x1920:r=30:d=2', '-f', 'lavfi', '-i', 'sine=f=300:d=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', video], { encoding: 'utf8' });
  assert.equal(made.status, 0, made.stderr);
  const BOX = path.join(R, 'build', 'text_boxes.json');
  const row = (name) => (out(py('qa.py', R, video)).match(new RegExp(`^(PASS|FAIL|SKIPPED|WARN)\\s+text\\s+(.*)$`, 'm')) || [])[0] || `(no text row for ${name})`;
  const good = { t0: 0, t1: 1, x: 100, y: 400, w: 500, h: 50, size: 60, label: 'fine', kind: 'text' };
  fs.rmSync(BOX, { force: true });
  check(/^SKIPPED\s+text\s.*NOT checked/.test(row('none')), 'qa text: no build/text_boxes.json is SKIPPED (never PASS): ' + row('none'));
  write(BOX, { source: ontext.SOURCE, seconds: 2, boxes: [good] });
  check(/^PASS\s+text\s+1 text boxes inside the safe zone/.test(row('good')), 'qa text: a box inside the safe zone and tall enough passes: ' + row('good'));
  write(BOX, { source: ontext.SOURCE, seconds: 2, boxes: [good, { ...good, y: 100, label: 'too high' }, { ...good, size: 30, h: 28, label: 'too small' }] });
  const bad = row('bad');
  check(/^FAIL\s+text\s+2 of 3 boxes/.test(bad) && /"too high"[^;]*outside the safe zone/.test(bad) && /"too small" text 30px tall < 44/.test(bad), 'qa text: a box above the safe zone and type under 44 px fail, named: ' + bad);
  write(BOX, { source: ontext.SOURCE, seconds: 2, boxes: [good, { ...good, y: 132, kind: 'chrome', label: 'tag' }, { ...good, y: 132, kind: 'readout', label: 'readout' }, { ...good, y: 1700, t1: 0.2, label: 'blink' }] });
  check(/^PASS\s+text\s+1 text boxes/.test(row('chrome')) && /2 chrome tag box\(es\) not judged/.test(row('chrome')) && /1 box\(es\) on screen under 0\.3s not judged/.test(row('chrome')), 'qa text: the engine tag and a blink are counted, not judged: ' + row('chrome'));
  write(BOX, { source: ontext.SOURCE, seconds: 9, boxes: [good] });
  check(/^SKIPPED\s+text\s.*9\.0s.*2\.0s/.test(row('length')), 'qa text: boxes from a render of another length are SKIPPED: ' + row('length'));
  write(BOX, [good]);
  check(/^PASS\s+text\s+1 text boxes/.test(row('list')), 'qa text: a hand-written list of boxes still works');
  write(path.join(R, 'reel.json'), { style: 'depth', name: 'r' });
  write(BOX, { source: ontext.SOURCE, seconds: 2, boxes: [good] });
  check(/text inside 3D scenes is not measured/.test(row('depth')), 'qa text: a depth reel says text inside 3D scenes is not measured');
}

// ── 4. kit lint on the shot list kit render writes for print ──────────────────────────────────────────────────────────
{
  const R = path.join(tmp, 'lint', 'reels', 'r');
  write(path.join(R, 'reel.json'), { style: 'print', name: 'r' });
  const shots = (rows) => write(path.join(R, 'build', 'shots.json'), { source: ontext.SOURCE, shots: rows.map(([id, t0, t1]) => ({ id, t0, t1, layout: null, face: null, props: null, presenter: true })) });
  shots([['hook', 0, 2], ['middle', 2, 5.1], ['cta', 5.1, 9.4]]);
  let r = py('lint.py', R), o = out(r);
  check(r.status === 0 && /lint \(print · 3 shots from build\/shots\.json\)/.test(o) && !/SHOT-LEN/.test(o), 'kit lint reads the shot list of a print render, no hand-written file needed');
  shots([['hook', 0, 2], ['middle', 2, 14]]);
  r = py('lint.py', R); o = out(r);
  check(r.status === 3 && /SHOT-LEN\s+error\s+2\.00s\s+middle lasts 12\.00 s/.test(o), 'kit lint reports a print scene past 5 s as SHOT-LEN');
}

// ── 5. rendering, with a browser ──────────────────────────────────────────────────────────────────────────────────────
function engineWithBrowser() {
  try { createRequire(path.join(STUDIO, 'package.json')).resolve('playwright'); return STUDIO; } catch { /* not installed in studio */ }
  const dir = process.env.PLAYWRIGHT_DIR;
  if (!dir || !fs.existsSync(path.join(dir, 'node_modules', 'playwright'))) return null;
  const eng = path.join(tmp, 'engine');
  fs.cpSync(STUDIO, eng, { recursive: true, filter: (src) => !src.split(path.sep).includes('node_modules') });
  fs.symlinkSync(path.join(dir, 'node_modules'), path.join(eng, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  return eng;
}
const eng = engineWithBrowser();
if (!eng) console.log('SKIPPED part 5 (kit render writes the text, boxes and shots): no browser. Run npm install and npm run browser inside studio/, or set PLAYWRIGHT_DIR.');
else if (!HAS_FFMPEG) console.log('SKIPPED part 5: ffmpeg is not installed');
else {
  const made = spawnSync('node', [path.join(REPO, 'setup', 'new-brand.mjs'), path.join(tmp, 'brand')], { encoding: 'utf8' });
  assert.equal(made.status, 0, made.stderr);
  const B = path.join(tmp, 'brand-reels'), bj = path.join(B, 'brand', 'brand.json');
  fs.writeFileSync(bj, JSON.stringify({ ...JSON.parse(fs.readFileSync(bj, 'utf8')), name: 'Ontext', handle: '@ontext' }, null, 2));
  const kit = (...a) => spawnSync('node', [path.join(eng, 'tools', 'kit.mjs'), ...a], { cwd: B, encoding: 'utf8' });
  const jread = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
  const textRow = (R) => (out(spawnSync(PY, [path.join(eng, 'tools', 'qa.py'), R, path.join(R, 'build', 'draft.mp4')], { encoding: 'utf8', env: ENV })).match(/^(PASS|FAIL|SKIPPED|WARN)\s+text\s+(.*)$/m) || [])[0] || '(no text row)';

  // print: a three-scene reel, the stand-in pacing the page makes from script.txt
  kit('start', 'reels/p', '--style', 'print');
  const P = path.join(B, 'reels', 'p'), pb = path.join(P, 'build');
  fs.writeFileSync(path.join(P, 'script.txt'), "Stop losing 30 percent of your leads. Only fast replies win. Comment REEL and I'll send you the link.\n");
  const r1 = kit('render', 'reels/p');
  check(r1.status === 0 && fs.existsSync(path.join(pb, 'draft.mp4')), `print: kit render draws the reel${r1.status ? '\n' + out(r1).slice(-500) : ''}`);
  const lines = fs.existsSync(path.join(pb, 'on_screen_text.txt')) ? fs.readFileSync(path.join(pb, 'on_screen_text.txt'), 'utf8').trim().split('\n') : [];
  check(lines.length > 5 && lines.every((l) => /^\[\d+\.\d\d-\d+\.\d\ds [^\]]+\] \S/.test(l)), `print: build/on_screen_text.txt has one "[t0-t1s kind] text" line per text (${lines.length} lines)`);
  check(lines.some((l) => /caption\] STOP LOSING 30 PERCENT/.test(l)) && lines.some((l) => /caption\] .*REEL/.test(l)), 'print: the caption lines are the script\'s words as drawn');
  const tb = jread(path.join(pb, 'text_boxes.json'));
  check(tb.source === ontext.SOURCE && tb.boxes.length > 5 && tb.boxes.every((b) => b.w > 0 && b.h > 0 && b.size > 0 && Number.isFinite(b.x + b.y) && b.x + b.w > 0 && b.y + b.h > 0 && b.x < 1080 && b.y < 1920), 'print: build/text_boxes.json holds measured boxes on the 1080x1920 canvas');
  check(tb.boxes.some((b) => b.kind === 'caption') && tb.boxes.some((b) => b.kind === 'chrome'), 'print: caption boxes and the engine\'s chapter tag are told apart');
  check(Math.abs(tb.seconds - jread(path.join(pb, 'shots.json')).shots.at(-1).t1) < 0.01, 'print: the boxes know the length of the render');
  const sh = jread(path.join(pb, 'shots.json')).shots;
  check(sh.length === 3 && sh[0].t0 === 0 && sh.every((s, i) => i === 0 || Math.abs(s.t0 - sh[i - 1].t1) < 0.002) && sh.map((s) => s.id).join() === 'hook,middle,cta', 'print: build/shots.json is the page\'s scene list (hook, middle, cta), back to back');
  const ln = spawnSync(PY, [path.join(eng, 'tools', 'lint.py'), P], { encoding: 'utf8', env: ENV });
  check(/3 shots from build\/shots\.json/.test(out(ln)), 'print: kit lint works with no hand-written file (' + out(ln).split('\n')[0] + ')');
  const tr = textRow(P);
  check(/^(PASS|FAIL)\s+text/.test(tr) && !/SKIPPED/.test(tr), 'print: kit qa now measures the text instead of skipping it: ' + tr.slice(0, 150));
  const before = fs.readFileSync(path.join(pb, 'on_screen_text.txt'), 'utf8');
  const part = kit('render', 'reels/p', '--from', '0', '--to', '2');
  check(part.status === 0 && /only part of the reel was rendered/.test(out(part)) && fs.readFileSync(path.join(pb, 'on_screen_text.txt'), 'utf8') === before, 'print: a render of part of the reel leaves the text files as they were');
  fs.writeFileSync(path.join(pb, 'shots.json'), JSON.stringify([{ id: 'mine', t0: 0, t1: 3 }]));
  const keep = kit('render', 'reels/p');
  check(/shots\.json was written by hand, so it was kept/.test(out(keep)) && jread(path.join(pb, 'shots.json'))[0].id === 'mine', 'print: a hand-written build/shots.json is kept');

  // talking: the page the talking mode draws in the DOM (placeholder face, stand-in pacing)
  kit('start', 'reels/t', '--style', 'talking');
  const T = path.join(B, 'reels', 't'), tbd = path.join(T, 'build');
  fs.writeFileSync(path.join(T, 'script.txt'), 'Someone just dropped a free tool. It turns one rough take into a finished reel.\n');
  const r2 = kit('render', 'reels/t');
  check(r2.status === 0, `talking: kit render draws the reel${r2.status ? '\n' + out(r2).slice(-500) : ''}`);
  const tl = fs.existsSync(path.join(tbd, 'on_screen_text.txt')) ? fs.readFileSync(path.join(tbd, 'on_screen_text.txt'), 'utf8') : '';
  check(/\] YOUR TAKE GOES HERE/.test(tl) && /\] I'LL SEND YOU THE LINK/.test(tl) && /\] COMMENT/.test(tl), 'talking: the text the page draws in the DOM is in build/on_screen_text.txt');
  const ttb = jread(path.join(tbd, 'text_boxes.json'));
  check(ttb.boxes.length > 3 && ttb.boxes.every((b) => b.size > 0) && !fs.existsSync(path.join(tbd, 'shots.json')), 'talking: boxes measured from the page, and no shots.json (its cuts come from motion_mask.json)');
  check(!/SKIPPED/.test(textRow(T)), 'talking: kit qa measures the text: ' + textRow(T).slice(0, 120));

  // depth: DOM overlay measured; text inside 3D scenes is listed as in-scene strings with no box. Needs three.js.
  let hasThree = true;
  try { createRequire(path.join(eng, 'package.json')).resolve('three'); } catch { hasThree = false; }
  if (!hasThree) console.log('SKIPPED depth: three.js is not installed in studio/node_modules (npm install inside studio/)');
  else {
    kit('start', 'reels/d', '--style', 'depth');
    const D = path.join(B, 'reels', 'd'), db = path.join(D, 'build');
    const r3 = kit('render', 'reels/d');
    check(r3.status === 0, `depth: kit render draws the reel${r3.status ? '\n' + out(r3).slice(-500) : ''}`);
    const dl = fs.existsSync(path.join(db, 'on_screen_text.txt')) ? fs.readFileSync(path.join(db, 'on_screen_text.txt'), 'utf8') : '';
    check(/s text\] SOLD OUT BY 9 AM/.test(dl) && /in-scene/.test(dl), 'depth: the taped title (DOM) and the text drawn on 3D textures (in-scene) are both listed');
    const dtb = jread(path.join(db, 'text_boxes.json'));
    check(dtb.boxes.length > 3 && dtb.boxes.every((b) => b.kind !== 'in-scene'), 'depth: only flat overlay text has boxes');
    check(/text inside 3D scenes is not measured/.test(textRow(D)), 'depth: kit qa says text inside 3D scenes is not measured: ' + textRow(D).slice(0, 160));
  }
}

fs.rmSync(tmp, { recursive: true, force: true });
if (failures) { console.error(`\n${failures} check(s) failed.`); process.exit(1); }
console.log('\nOn-screen text test passed.');
