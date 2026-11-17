#!/usr/bin/env node
// The kit's small checks, with no key and no network:
//  1. keyword call to action: the brand's keyword and line go into a new reel's reel.json (studio/tools/ctafill.mjs), the starters read
//     cta.keyword and cta.text, and scriptlint warns when the last sentence does not say cta.keyword
//  2. A/B winner rule (template/scripts/abtest.py): known probabilities, 95 percent bar, 300 views each, "keep testing, need about N more"
//  3. caption reading speed (studio/tools/captions.py): characters per second, words per minute, times of what is flagged
//  4. cover check (template/scripts/qa/cover_check.py): size, safe centre 1010x1350, text height, near-black and near-white
// Python parts need python3; the cover picture parts need ffmpeg and numpy and say SKIPPED without them.
//   node setup/test-checks.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PY = process.platform === 'win32' ? 'python' : 'python3';
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kit-checks-')));
const ok = (m) => console.log('ok   ' + m);
const py = (file, args, o = {}) => spawnSync(PY, [path.join(REPO, ...file.split('/')), ...args], { encoding: 'utf8', ...o });
const has = (cmd) => spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { stdio: 'ignore' }).status === 0;

// ── 1. keyword call to action ─────────────────────────────────────────────────────────────────────────────────────────
const C = await import(pathToFileURL(path.join(REPO, 'studio', 'tools', 'ctafill.mjs')).href);
assert.deepEqual(C.brandCta({ cta: { tested_keywords: ['bake!', 'LINK'], default: "I'll send you the setup" } }), { keyword: 'BAKE', text: "I'll send you the setup" });
assert.deepEqual(C.brandCta({ cta: { tested_keywords: [], default: 'Comment REEL for the whole kit, the template and the free checklist too' } }), { keyword: '', text: '' });   // too long for the line
assert.deepEqual(C.brandCta({ cta: { tested_keywords: ['two words', 'ABCDEFGHIJKLMNOPQRSTU', 'SETUP'] } }), { keyword: 'TWOWORDS', text: '' });
assert.deepEqual(C.brandCta(null), { keyword: '', text: '' });
ok('the brand keyword is the first tested one, cleaned to one upper-case word; a long default sentence is not squeezed under it');

let reel = { style: 'depth', cta: { keyword: 'BAKE', text: 'old line' }, tiles: { keys: ['sells', 'BAKE'] } };
let notes = C.applyBrandCta(reel, { cta: { tested_keywords: ['SETUP'], default: 'Free setup in your DMs' } });
assert.equal(reel.cta.keyword, 'SETUP'); assert.equal(reel.cta.text, 'Free setup in your DMs'); assert.deepEqual(reel.tiles.keys, ['sells', 'SETUP']);
assert.match(notes[0], /SETUP/);
reel = { style: 'print', cta: { keyword: 'REEL', text: '', counter: 12 } };
notes = C.applyBrandCta(reel, { cta: { tested_keywords: [], default: '' } });
assert.equal(reel.cta.keyword, 'REEL'); assert.equal(reel.cta.counter, 12); assert.match(notes[0], /tested_keywords is empty/);
reel = { style: 'print', cta: { keyword: 'REEL', counter: 12 } };
C.applyBrandCta(reel, { cta: { tested_keywords: ['KIT'] } });
assert.deepEqual(reel.cta, { keyword: 'KIT', counter: 12 });
ok('applyBrandCta sets keyword and line, moves the depth tile, keeps other cta settings, leaves the sample keyword when none is tested');

const sty = path.join(REPO, 'studio', 'styles');
const ids = JSON.parse(fs.readFileSync(path.join(sty, 'STYLES.json'), 'utf8')).styles.map((s) => s.id);
for (const id of ids) {
  const defs = JSON.parse(fs.readFileSync(path.join(sty, id, 'templates.json'), 'utf8'));
  const sc = C.ctaScene(defs, { keyword: 'bake', text: 'Free setup' });
  assert.ok(sc, `${id}: no closing scene could be made`);
  assert.ok(defs.some((t) => t.id === sc.template), `${id}: ${sc.template} is not one of its templates`);
  assert.ok(Object.values(sc.props).includes('BAKE'), `${id}: the keyword is not in the scene`);
  assert.match(sc.narration, /Comment BAKE/);
}
assert.equal(C.ctaScene([], { keyword: 'BAKE' }), null); assert.equal(C.ctaScene([{ id: 'x', propsSchema: {} }], { keyword: '' }), null);
ok(`a closing keyword scene can be made for all ${ids.length} scene styles, from each style's own template`);

for (const mode of ['print', 'depth', 'talking']) {
  const j = JSON.parse(fs.readFileSync(path.join(REPO, 'studio', 'modes', mode, 'starter', 'reel.json'), 'utf8'));
  assert.ok(j.cta && typeof j.cta.keyword === 'string' && 'text' in j.cta, `${mode} starter reel.json needs cta.keyword and cta.text`);
}
const printCta = fs.readFileSync(path.join(REPO, 'studio', 'modes', 'print', 'starter', 'scenes', 'cta.js'), 'utf8');
assert.match(printCta, /REEL\.cta\.text/); assert.match(fs.readFileSync(path.join(REPO, 'studio', 'modes', 'depth', 'starter', 'shots', '05-ask.js'), 'utf8'), /cta\.text/);
assert.match(fs.readFileSync(path.join(REPO, 'studio', 'modes', 'talking', 'starter', 'scenes.js'), 'utf8'), /REEL\.cta\.text/);
new Function(printCta);   // the scene file parses
ok('the print, depth and talking starters carry cta.keyword and cta.text and read both');

// scriptlint reads reel.json cta.keyword
const reelDir = path.join(tmp, 'reel'); fs.mkdirSync(reelDir);
const script = "Three checks before you launch a bakery.\nDo them in this order, every time.\nComment BAKE and I'll send you the whole setup.\n";
fs.writeFileSync(path.join(reelDir, 'script.txt'), script);
const lint = () => py('studio/tools/scriptlint.py', [reelDir]).stdout;
assert.doesNotMatch(lint(), /cta\.keyword/);                                              // no reel.json: no keyword check
fs.writeFileSync(path.join(reelDir, 'reel.json'), JSON.stringify({ cta: { keyword: 'BAKE' } }));
assert.doesNotMatch(lint(), /cta\.keyword/);
fs.writeFileSync(path.join(reelDir, 'reel.json'), JSON.stringify({ cta: { keyword: 'LINK' } }));
assert.match(lint(), /WARN.*cta\.keyword is "LINK" but the last sentence does not say it/);
fs.writeFileSync(path.join(reelDir, 'reel.json'), '{ not json');
assert.doesNotMatch(lint(), /cta\.keyword/);
fs.writeFileSync(path.join(reelDir, 'reel.json'), JSON.stringify({ style: 'print' }));
assert.doesNotMatch(lint(), /cta\.keyword/);
ok('scriptlint warns only when reel.json cta.keyword is not said in the last sentence');
assert.equal(py('studio/tools/scriptlint.py', ['--selftest']).status, 0);

// ── 2. A/B winner rule ────────────────────────────────────────────────────────────────────────────────────────────────
const ab = (args) => py('template/scripts/abtest.py', args);
assert.equal(ab(['--selftest']).status, 0, ab(['--selftest']).stderr);
let r = JSON.parse(ab(['--a', '90', '1000', '--b', '60', '1000', '--metric', 'saves', '--json']).stdout);
assert.equal(r.verdict, 'A wins'); assert.ok(r.p_a_better > 0.95 && r.p_a_better < 0.999);
r = JSON.parse(ab(['--a', '55', '1000', '--b', '45', '1000', '--json']).stdout);
assert.equal(r.verdict, 'keep testing'); assert.ok(r.more_views_each > 500 && r.more_views_each < 4000, r.more_views_each); assert.ok(Math.abs(r.p_a_better - 0.846) < 0.01, r.p_a_better);
assert.match(ab(['--a', '55', '1000', '--b', '45', '1000']).stdout, /Keep testing: A is ahead at 84\.\d%, short of the 95% bar\. Need about [\d,]+ more views each/);
r = JSON.parse(ab(['--a', '30', '100', '--b', '5', '100', '--json']).stdout);
assert.equal(r.verdict, 'keep testing'); assert.equal(r.more_views_each, 200);                // a huge gap on 100 views is still not a call
r = JSON.parse(ab(['--a', '300', '1000', '--b', '400', '1000', '--lower-better', '--metric', 'skips', '--json']).stdout);
assert.equal(r.verdict, 'A wins');
assert.notEqual(ab(['--a', '5', '0', '--b', '1', '10']).status, 0);                         // bad numbers are refused
ok('A/B rule: 95 percent and 300 views each to call a winner, otherwise how many more; lower-is-better works; bad numbers refused');

// ── 3. caption reading speed ──────────────────────────────────────────────────────────────────────────────────────────
assert.equal(py('studio/tools/captions.py', ['--selftest']).status, 0);
const capDir = path.join(tmp, 'cap'); fs.mkdirSync(path.join(capDir, 'build'), { recursive: true });
const mk = (text, per, gap = 0.02) => { let t = 0; return text.split(' ').map((w) => { const o = { w, s: +t.toFixed(3), e: +(t + per).toFixed(3) }; t += per + gap; return o; }); };
fs.writeFileSync(path.join(capDir, 'build', 'words.json'), JSON.stringify(mk('Save this for later. Then come back and read it slowly.', 0.45, 0.05)));
let c = py('studio/tools/captions.py', [capDir, '--json']);
assert.equal(c.status, 0, c.stdout);
fs.writeFileSync(path.join(capDir, 'build', 'words.json'), JSON.stringify(mk('Most people feed their starter wrong, and it costs them a loaf every single week.', 0.2)));
c = py('studio/tools/captions.py', [capDir, '--json']);
assert.equal(c.status, 1);
const rows = JSON.parse(c.stdout).groups;
assert.ok(rows.length >= 2 && rows[0].flags.includes('FAST') && rows[0].start === 0 && rows[0].cps > 17, JSON.stringify(rows[0]));
assert.match(py('studio/tools/captions.py', [capDir]).stdout, /FAST\s+0\.00-/);
fs.writeFileSync(path.join(tmp, 'a.srt'), "1\n00:00:01,000 --> 00:00:01,800\nThis caption holds far too many letters\n\n2\n00:00:02,000 --> 00:00:05,000\nEasy to read.\n");
c = py('studio/tools/captions.py', ['--srt', path.join(tmp, 'a.srt')]);
assert.equal(c.status, 1); assert.match(c.stdout, /FAST\+SHORT\s+1\.00-/);
assert.equal(py('studio/tools/captions.py', [path.join(tmp, 'nothing-here')]).status, 1);   // no words.json: a plain-words stop
ok('captions: fast and short groups flagged with their times, a slow script passes, SRT works, exit codes 0 and 1');

// ── 4. cover check ────────────────────────────────────────────────────────────────────────────────────────────────────
assert.equal(py('template/scripts/qa/cover_check.py', ['--selftest']).status, 0);
const numpy = spawnSync(PY, ['-c', 'import numpy'], { stdio: 'ignore' }).status === 0;
if (!has('ffmpeg') || !has('ffprobe') || !numpy) console.log('SKIPPED cover pictures: needs ffmpeg, ffprobe and numpy');
else {
  const img = (name, size, vf) => {
    const f = path.join(tmp, name);
    const a = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `${vf}`, '-frames:v', '1', '-s', size, f], { encoding: 'utf8' });
    assert.equal(a.status, 0, a.stderr);
    return f;
  };
  const cov = (f, extra = []) => py('template/scripts/qa/cover_check.py', [f, '--json', ...extra]);
  const lvl = (res, key) => JSON.parse(res.stdout).results.find((x) => x.message.startsWith(key));
  const gradient = 'gradients=s=1080x1920:c0=0x203a6b:c1=0xf2c14e:x0=0:y0=0:x1=1080:y1=1920:d=1';
  let f = img('good.png', '1080x1920', gradient);
  let res = cov(f);
  assert.equal(lvl(res, 'SIZE').level, 'PASS'); assert.equal(lvl(res, 'LIGHT').level, 'PASS');
  f = img('black.png', '1080x1920', 'color=c=0x050505:s=1080x1920:d=1');
  assert.equal(lvl(cov(f), 'LIGHT').level, 'FAIL'); assert.match(lvl(cov(f), 'LIGHT').message, /near-black/);
  f = img('white.png', '1080x1920', 'color=c=0xfafafa:s=1080x1920:d=1');
  assert.match(lvl(cov(f), 'LIGHT').message, /near-white/);
  f = img('navy.png', '1080x1920', 'color=c=0x1b2a55:s=1080x1920:d=1');
  assert.equal(lvl(cov(f), 'LIGHT').level, 'PASS');                                           // a dark brand colour is not near-black
  f = img('small.png', '720x1280', gradient.replace('1080x1920', '720x1280').replace('x1=1080:y1=1920', 'x1=720:y1=1280'));
  assert.equal(lvl(cov(f), 'SIZE').level, 'WARN');
  f = img('wide.png', '1920x1080', 'color=c=0x336699:s=1920x1080:d=1');
  assert.equal(lvl(cov(f), 'SIZE').level, 'FAIL'); assert.equal(cov(f).status, 1);
  ok('cover pictures: 1080x1920 passes, another 9:16 size warns, a landscape picture fails, near-black and near-white are named, a dark brand colour passes');
  // text: only where a text reader exists (Apple Vision on a Mac, or Tesseract) and ffmpeg can draw text
  const reader = (process.platform === 'darwin' && has('swiftc')) || has('tesseract');
  const pil = spawnSync(PY, ['-c', 'import PIL'], { stdio: 'ignore' }).status === 0;
  const font = ['/System/Library/Fonts/Supplemental/Arial Bold.ttf', '/Library/Fonts/Arial Bold.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 'C:/Windows/Fonts/arialbd.ttf'].find(fs.existsSync);
  if (!pil || !reader || !font) console.log('SKIPPED cover text with a real reader: needs Pillow, a bold font and a text reader (Xcode command line tools on a Mac, or Tesseract)');
  else {
    const draw = (name, y, size) => {
      const code = `import sys\nfrom PIL import Image, ImageDraw, ImageFont\nim = Image.new('RGB', (1080, 1920), (32, 58, 107))\nImageDraw.Draw(im).text((540, int(sys.argv[2])), 'FEED THE STARTER', font=ImageFont.truetype(sys.argv[4], int(sys.argv[3])), fill='white', anchor='mm')\nim.save(sys.argv[1])`;
      const f = path.join(tmp, name);
      assert.equal(spawnSync(PY, ['-c', code, f, String(y), String(size), font], { encoding: 'utf8' }).status, 0);
      return f;
    };
    const good = cov(draw('t-good.png', 900, 84));
    assert.equal(lvl(good, 'SAFE').level, 'PASS', good.stdout); assert.equal(lvl(good, 'TEXT').level, 'PASS', good.stdout); assert.equal(good.status, 0, good.stdout);
    const low = cov(draw('t-low.png', 1760, 84));
    assert.equal(lvl(low, 'SAFE').level, 'FAIL', low.stdout); assert.equal(low.status, 1);
    const tiny = cov(draw('t-tiny.png', 900, 40));
    assert.equal(lvl(tiny, 'TEXT').level, 'FAIL', tiny.stdout);
    const wide = cov(draw('t-wide.png', 900, 130));                                              // 16 letters at 130 px run past x 1045
    assert.equal(lvl(wide, 'SAFE').level, 'FAIL', wide.stdout);
    ok('cover text with a real reader: inside the safe centre passes, in the bottom 300 px fails, a small title fails, a title wider than the centre fails');
  }
}
// the text path through the same code the real reader feeds: a stand-in reader returns lines, so this runs on every computer
if (has('ffmpeg') && has('ffprobe') && numpy) {
  const f = path.join(tmp, 'good.png');
  const script = `
import sys, json
sys.path.insert(0, ${JSON.stringify(path.join(REPO, 'template', 'scripts', 'qa'))})
import cover_check as c
lines = json.loads(sys.argv[2])
c.read_text = lambda p: lines
print(json.dumps(c.check(sys.argv[1])))
`;
  const run = (lines) => JSON.parse(spawnSync(PY, ['-c', script, f, JSON.stringify(lines)], { encoding: 'utf8' }).stdout);
  const L = (o) => ({ text: 'FEED THE STARTER', x: 120, y: 800, w: 840, h: 130, conf: 0.9, ...o });
  const lv = (res, k) => res.find(([, m]) => m.startsWith(k))[0];
  assert.equal(lv(run([L({})]), 'SAFE'), 'PASS'); assert.equal(lv(run([L({})]), 'TEXT'), 'PASS');
  assert.equal(lv(run([L({ y: 1700 })]), 'SAFE'), 'FAIL');                                    // bottom 300 px
  assert.equal(lv(run([L({ x: 20 })]), 'SAFE'), 'FAIL');                                      // left of x 35
  assert.equal(lv(run([L({ h: 50 })]), 'TEXT'), 'FAIL');
  assert.equal(lv(run([]), 'TEXT'), 'FAIL');
  const none = spawnSync(PY, ['-c', script.replace('c.read_text = lambda p: lines', 'c.read_text = lambda p: None'), f, '[]'], { encoding: 'utf8' });
  assert.ok(JSON.parse(none.stdout).some(([l]) => l === 'NOTRUN'));                           // no reader: said, never a silent pass
  ok('cover text path (stand-in reader): safe centre, bottom 300 px, left edge, text height, no text, no reader');
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log('checks: ok');
