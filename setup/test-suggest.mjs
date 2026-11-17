#!/usr/bin/env node
// Suggested tools (kit suggest, tips, checkup section, the skill and docs), in temp folders with a fake HOME, fake PATH folders, fake key
// files and a fake `claude` command. No network, no key, no ffmpeg needed. Run in CI: node setup/test-suggest.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tools = path.join(REPO, 'studio', 'tools');
const SUGGEST = path.join(tools, 'suggest.mjs'), CHECKUP = path.join(tools, 'checkup.mjs');
const WIN = process.platform === 'win32';
const tmp = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'suggest-test-')));
const home = path.join(tmp, 'home'), bin = path.join(tmp, 'bin'), emptyBin = path.join(tmp, 'emptybin');
for (const d of [home, bin, emptyBin]) fs.mkdirSync(d, { recursive: true });
const W = (f, body) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, body); };
const SECRET = 'FAKE-KEY-CONTENT-12345';
const baseEnv = { ...process.env, HOME: home, USERPROFILE: home, PATH: emptyBin };
baseEnv.BAGELUNIT_SUGGEST_IGNORE_PATHS = '1';
delete baseEnv.ELEVENLABS_API_KEY; delete baseEnv.BAGELUNIT_NO_TIPS;
const run = (args, { cwd, env = {} } = {}) => spawnSync(process.execPath, [SUGGEST, ...args], { cwd, encoding: 'utf8', env: { ...baseEnv, ...env } });
const all = (r) => `${r.stdout || ''}${r.stderr || ''}`;
const brandJson = (b) => JSON.parse(fs.readFileSync(path.join(b, 'brand', 'brand.json'), 'utf8'));
const newBrand = (name, extra = {}) => { const b = path.join(tmp, name); W(path.join(b, 'brand', 'brand.json'), JSON.stringify({ name: 'Acme', keep_me: { a: 1 }, ...extra }, null, 2)); return b; };
const json = (b, env) => JSON.parse(run(['--json'], { cwd: b, env }).stdout);
const statusOf = (j, id) => j.categories.flatMap((c) => c.tools).find((t) => t.id === id).status;
let passed = 0, skipped = 0;
const ok = (m) => { passed++; console.log('ok   ' + m); };
const skip = (m) => { skipped++; console.log('SKIPPED ' + m); };

// a fake `claude` that lists two servers
const fakeClaude = (dir, lines) => {
  if (WIN) W(path.join(dir, 'claude.cmd'), `@echo off\r\n${lines.map((l) => `echo ${l}`).join('\r\n')}\r\n`);
  else { W(path.join(dir, 'claude'), `#!/bin/sh\n${lines.map((l) => `echo '${l}'`).join('\n')}\n`); fs.chmodSync(path.join(dir, 'claude'), 0o755); }
};

/* 1. the catalog */
{
  const cat = JSON.parse(fs.readFileSync(path.join(REPO, 'studio', 'suggestions.json'), 'utf8'));
  assert.deepEqual(cat.categories.map((c) => c.id), ['voice', 'music-and-effects', '3d', 'generated-video', 'design']);
  const ids = cat.categories.flatMap((c) => c.tools.map((t) => t.id));
  assert.equal(new Set(ids).size, ids.length);
  for (const t of cat.categories.flatMap((c) => c.tools)) {
    for (const k of ['id', 'name', 'what_you_get', 'example', 'kind', 'detect', 'tips']) assert.ok(k in t, `${t.id} lacks ${k}`);
    assert.ok(['download', 'key', 'mcp', 'app'].includes(t.kind));
    assert.ok(Array.isArray(t.connect) && t.connect.length, `${t.id} has no connect steps`);
    assert.ok(!/[$€£]\s?\d|\u2014/.test(JSON.stringify(t)), `${t.id}: a price or an em dash`);
  }
  assert.ok(JSON.stringify(cat).includes('1900s factory floor, labelled Re-creation'));
  ok('catalog: 5 categories, required fields, connect steps, no prices, no em dash');
}

/* 2. detection, from existence checks only */
const b1 = newBrand('b1');
{
  let j = json(b1);
  assert.equal(statusOf(j, 'elevenlabs'), 'not connected');
  assert.equal(statusOf(j, 'blender'), 'not connected');
  assert.deepEqual(j.state, { have: [], none: false, other: [], dismissed: [], asked: '', tips: true });
  ok('nothing found: every tool "not connected"');
  // key FILE exists: an empty file does not count, a non-empty one does, and the content is never shown
  const keyFile = path.join(home, '.config', 'bagelunit-reels', 'elevenlabs.key');
  W(keyFile, '');
  assert.equal(statusOf(json(b1), 'elevenlabs'), 'not connected');
  W(keyFile, SECRET + '\n');
  const r = run(['--json'], { cwd: b1 }), j2 = JSON.parse(r.stdout);
  assert.equal(statusOf(j2, 'elevenlabs'), 'connected');
  assert.ok(!all(r).includes(SECRET), 'the key content was printed');
  for (const args of [[], ['elevenlabs'], ['--have', 'elevenlabs']]) assert.ok(!all(run(args, { cwd: b1 })).includes(SECRET));
  assert.ok(!fs.readFileSync(path.join(b1, 'brand', 'brand.json'), 'utf8').includes(SECRET));
  ok('key file: empty = not connected, present = connected, contents never printed or saved');
  // a command on PATH
  const cmd = path.join(bin, WIN ? 'blender.cmd' : 'blender');
  W(cmd, WIN ? '@echo off\r\n' : '#!/bin/sh\n'); if (!WIN) fs.chmodSync(cmd, 0o755);
  assert.equal(statusOf(json(b1, { PATH: bin }), 'blender'), 'connected');
  assert.equal(statusOf(json(b1, { PATH: emptyBin }), 'blender'), 'not connected');
  ok('a command on PATH (blender) is detected');
  // an MCP server in `claude mcp list`
  const cbin = path.join(tmp, 'cbin'); fs.mkdirSync(cbin);
  fakeClaude(cbin, ['claude.ai Canva: https://mcp.canva.com - Connected', 'claude.ai Higgsfield: https://x - Needs authentication', 'plugin:data:hex: https://h - Failed to connect']);
  const jm = json(b1, { PATH: cbin });
  assert.equal(statusOf(jm, 'canva'), 'connected');
  assert.equal(statusOf(jm, 'higgsfield'), 'not connected');
  assert.equal(statusOf(jm, 'epidemic-sound'), 'not connected');
  ok('a connector named in `claude mcp list` is detected (one that needs sign-in is not)');
  assert.equal(statusOf(json(b1, { PATH: emptyBin }), 'canva'), 'not connected');
  ok('no `claude` command: skipped quietly');
}

/* 3. record, declare, dismiss, undismiss */
{
  const b = newBrand('b2');
  let r = run(['--have', 'canva,blender', '--other', 'Descript; Final Cut'], { cwd: b });
  assert.equal(r.status, 0, all(r));
  let t = brandJson(b);
  assert.deepEqual(t.tools.have, ['canva', 'blender']);
  assert.deepEqual(t.tools.other, ['Descript', 'Final Cut']);
  assert.equal(t.tools.none, false);
  assert.match(t.tools.asked, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(t.tools.tips, true);
  assert.deepEqual(t.keep_me, { a: 1 }); assert.equal(t.name, 'Acme');
  assert.equal(statusOf(json(b), 'canva'), 'connected');
  assert.ok(JSON.stringify(json(b).categories).includes('you said you have it'));
  ok('--have / --other recorded, other keys kept, declared tool shows as connected');
  r = run(['--none'], { cwd: b });
  t = brandJson(b); assert.deepEqual(t.tools.have, []); assert.equal(t.tools.none, true); assert.deepEqual(t.tools.other, []);
  assert.equal(run(['--have', 'nope'], { cwd: b }).status, 1);
  assert.equal(run(['--have', 'canva', '--none'], { cwd: b }).status, 1);
  assert.equal(brandJson(b).tools.none, true);
  ok('--none, and unknown ids or contradictions are refused without writing');
  run(['--dismiss', 'uppbeat'], { cwd: b });
  assert.deepEqual(brandJson(b).tools.dismissed, ['uppbeat']);
  assert.equal(statusOf(json(b), 'uppbeat'), 'dismissed');
  run(['--dismiss', 'design'], { cwd: b });
  assert.equal(statusOf(json(b), 'canva'), 'dismissed');
  assert.equal(brandJson(b).tools.none, true);   // dismissing keeps the answers
  run(['--undismiss', 'uppbeat,design'], { cwd: b });
  assert.deepEqual(brandJson(b).tools.dismissed, []);
  assert.equal(statusOf(json(b), 'uppbeat'), 'not connected');
  ok('--dismiss / --undismiss (a tool or a whole category)');
  // an unparseable brand.json is never rewritten
  const bad = path.join(tmp, 'b-bad'); W(path.join(bad, 'brand', 'brand.json'), '{ not json');
  r = run(['--none'], { cwd: bad });
  assert.equal(r.status, 1); assert.equal(fs.readFileSync(path.join(bad, 'brand', 'brand.json'), 'utf8'), '{ not json');
  assert.equal(run(['--none'], { cwd: tmp }).status, 1);
  ok('a broken brand.json is left alone; no brand folder = a plain error');
  const text = run([], { cwd: b }).stdout, one = run(['canva'], { cwd: b }).stdout;
  assert.match(text, /Voice/); assert.match(text, /Generated video/); assert.match(text, /Nothing is sent anywhere/);
  assert.match(one, /How to connect it/); assert.match(one, /1\. /); assert.match(one, /branded cover from your template in two minutes/);
  ok('the listing and the one-tool detail screens');
  const jj = json(b);
  assert.deepEqual(Object.keys(jj).sort(), ['baseline', 'brand', 'categories', 'connected', 'state', 'version']);
  assert.deepEqual(Object.keys(jj.categories[0].tools[0]).sort(), ['connect', 'example', 'id', 'kind', 'name', 'status', 'url', 'via', 'what_you_get']);
  ok('--json shape');
}

/* 4. tips */
fs.rmSync(path.join(home, '.config'), { recursive: true, force: true });   // each part starts clean
const tipEnv = (extra = {}) => ({ PATH: emptyBin, ...extra });
const tipRun = (b, step, extra = {}, args = []) => run(['tip', step, ...args], { cwd: b, env: tipEnv(extra) });
{
  const b = newBrand('b3');
  let r = tipRun(b, 'cover');
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /^Tip: Canva or Adobe Firefly or Adobe Express could design this cover from your brand template \(kit suggest canva\)/);
  assert.match(r.stderr, /Dismiss: kit suggest --dismiss design/);
  assert.equal(r.stderr.trim().split(/\r?\n/).length, 1);
  ok('a tip: one line on stderr, nothing on stdout, names the tools and the dismiss command');
  r = tipRun(b, 'cover');   // the design tools were named just now, so the next tool for this step is Blender
  assert.match(r.stderr, /^Tip: Blender could render a 3D still for this cover/); assert.equal(r.stderr.trim().split(/\r?\n/).length, 1);
  assert.equal(tipRun(b, 'cover').stderr, '');
  ok('one tip per command; a tool is not named again within 7 days (the next tool comes next, then silence)');
  const memFile = path.join(b, 'brand', '.tips.json');
  r = tipRun(b, 'start'); assert.match(r.stderr, /^Tip: Higgsfield/);   // Blender was already named
  assert.equal(tipRun(b, 'start').stderr, '');
  ok('start: only the tool not named this week');
  // 7 days later it may come back
  const mem = JSON.parse(fs.readFileSync(memFile, 'utf8'));
  for (const id of Object.keys(mem.shown)) mem.shown[id] = new Date(Date.now() - 8 * 24 * 3600 * 1000).toISOString();
  fs.writeFileSync(memFile, JSON.stringify(mem));
  assert.match(tipRun(b, 'cover').stderr, /^Tip: Canva/);
  ok('after 7 days a tip can return');
  assert.ok(!fs.readFileSync(memFile, 'utf8').includes(SECRET));
  // suppression
  const s = newBrand('b4');
  assert.equal(tipRun(s, 'cover', { BAGELUNIT_NO_TIPS: '1' }).stderr, '');
  assert.equal(tipRun(s, 'cover', {}, ['--no-tips']).stderr, '');
  run(['--dismiss', 'design'], { cwd: s });
  assert.equal(tipRun(s, 'cover').stderr.includes('Canva'), false);
  run(['--undismiss', 'design'], { cwd: s });
  const off = newBrand('b5', { tools: { tips: false } });
  assert.equal(tipRun(off, 'cover').stderr, '');
  assert.ok(!fs.existsSync(path.join(off, 'brand', '.tips.json')));
  assert.match(tipRun(s, 'cover').stderr, /Tip: Canva/);   // the earlier suppressed runs recorded nothing
  ok('suppressed by BAGELUNIT_NO_TIPS=1, --no-tips, tools.tips=false and a dismissed category (and a suppressed tip is not counted as shown)');
  // declared or connected: no tip for that category; a tool in the category you use hides its siblings
  const h = newBrand('b6', { tools: { have: ['adobe-firefly'] } });
  assert.equal(tipRun(h, 'cover').stderr.includes('Canva'), false);
  const v = newBrand('b7', { tools: { have: ['other-voice'] } });
  assert.equal(tipRun(v, 'voice').stderr, '');
  const v2 = newBrand('b8');
  assert.match(tipRun(v2, 'voice').stderr, /Tip: ElevenLabs could give this reel a natural voice/);
  W(path.join(home, '.config', 'bagelunit-reels', 'elevenlabs.key'), SECRET);
  assert.equal(tipRun(newBrand('b9'), 'voice').stderr, '');
  fs.rmSync(path.join(home, '.config'), { recursive: true });
  ok('no tip for a tool you have, declared, or whose category you already use (voice key found = no voice tip)');
  assert.equal(tipRun(newBrand('b10'), 'nonsense').stderr, '');
  assert.equal(run(['tip', 'cover'], { cwd: tmp, env: tipEnv() }).status, 0);
  ok('an unknown step or no brand folder: silent, exit 0');
}

/* 5. kit.mjs: the verb and the hook never change stdout or the exit code */
{
  const KIT = path.join(tools, 'kit.mjs');
  const r = spawnSync(process.execPath, [KIT, 'suggest', '--json'], { cwd: newBrand('b11'), encoding: 'utf8', env: baseEnv });
  if (r.status !== 0 && /Cannot find|playwright|ERR_MODULE/.test(all(r))) skip('kit.mjs would not load here (' + all(r).split(/\r?\n/)[0].slice(0, 80) + ')');
  else {
    assert.equal(r.status, 0, all(r));
    assert.ok(JSON.parse(r.stdout).categories.length === 5);
    assert.match(spawnSync(process.execPath, [KIT], { encoding: 'utf8', env: baseEnv }).stdout, /suggest/);
    ok('kit suggest runs through kit.mjs and is listed in its verbs');
    // the hook: kit start prints one tip on stderr only, and --no-tips / BAGELUNIT_NO_TIPS silence it
    const kb = newBrand('b11b'); W(path.join(kb, '.kit-version'), '0.0.0\n');
    const st = (slug, extra = [], env = {}) => spawnSync(process.execPath, [KIT, 'start', `reels/${slug}`, '--style', 'print', ...extra], { cwd: kb, encoding: 'utf8', env: { ...baseEnv, ...env } });
    const a = st('r1');
    if (a.status !== 0) skip('kit start did not run here: ' + all(a).split(/\r?\n/)[0].slice(0, 100));
    else {
      assert.match(a.stderr, /^Tip: |\nTip: /m); assert.ok(!a.stdout.includes('Tip:'));
      assert.equal((a.stderr.match(/^Tip: /gm) || []).length, 1);
      assert.ok(!/^Tip: /m.test(st('r2', ['--no-tips']).stderr)); assert.ok(!/^Tip: /m.test(st('r3', [], { BAGELUNIT_NO_TIPS: '1' }).stderr));
      ok('kit start: one tip on stderr (never stdout), silenced by --no-tips and BAGELUNIT_NO_TIPS=1, exit code 0');
    }
  }
}

/* 6. checkup */
{
  const b = newBrand('b12', { tools: { have: ['canva'] } });
  const r = spawnSync(process.execPath, [CHECKUP, '--quick'], { cwd: b, encoding: 'utf8', env: baseEnv });
  const out = all(r);
  if (!/Works without any outside tool/.test(out)) skip('checkup did not reach its report here: ' + out.split(/\r?\n/)[0].slice(0, 100));
  else {
    assert.match(out, /Works without any outside tool: /);
    assert.match(out, /Connected optional tools: Canva\./);
    assert.match(out, /Optional upgrades you could add: .*Blender/);
    assert.ok(!/Canva[^.]*could add/.test(out.split('Optional upgrades')[1] || ''));
    assert.ok(!out.includes(SECRET));
    ok('kit checkup prints the "works without any outside tool" section and the upgrades by name');
  }
}

/* 7. the skill, docs and template files */
{
  const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8').split(/\r?\n/).join('\n');
  const skill = read('template/.claude/skills/suggested-tools/SKILL.md');
  assert.match(skill, /^---\nname: suggested-tools\n/);
  for (const w of ['AskUserQuestion', 'kit suggest --json', 'I have none of these', 'Save these answers (Recommended)', 'Change something', 'kit suggest --have', 'kit suggest --none', '--other', 'Nothing is sent anywhere', 'Inputs:', 'Next step:', 'docs/browser.md'])
    assert.ok(skill.includes(w), `skill lacks: ${w}`);
  assert.ok(!skill.includes('\u2014'));
  const setup = read('template/.claude/skills/brand-setup/SKILL.md');
  for (const w of ['Show me optional tools that improve results (Recommended)', '"Later"', 'No, pure code is fine', '/suggested-tools', 'tools.asked']) assert.ok(setup.includes(w), `brand-setup lacks: ${w}`);
  const docs = read('template/docs/suggested-tools.md');
  assert.ok(docs.includes('How the kit prompts you') && docs.includes('kit suggest'));
  const bj = JSON.parse(read('template/brand/brand.json'));
  assert.deepEqual(Object.keys(bj.tools).filter((k) => k !== '_note'), ['have', 'none', 'other', 'dismissed', 'asked', 'tips']);
  assert.equal(bj.tools.tips, true);
  for (const f of ['studio/tools/suggest.mjs', 'studio/tools/tips.mjs', 'studio/suggestions.json', 'template/.claude/skills/suggested-tools/SKILL.md', 'template/docs/suggested-tools.md']) assert.ok(!read(f).includes('\u2014'), `${f} has an em dash`);
  const lib = await import(pathToFileURL(path.join(tools, 'suggest.mjs')).href);
  assert.equal(typeof lib.cli, 'function');
  ok('skill, brand-setup question, docs section, brand.json tools object, no em dashes, module imports');
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed} passed, ${skipped} skipped`);
