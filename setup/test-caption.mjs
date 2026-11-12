#!/usr/bin/env node
// Checks the caption layout tool (caption.mjs): a caption in three blocks (text, up to 5 hashtags, a keyword line) with one blank line
// between them passes; every way of getting it wrong is named in plain words; fix only changes spacing; keywords lists candidates from the
// brand's niche setup, the script, researched captions and audience research; a keyword unrelated to the caption, script and niche is noted.
// The fixtures are a made-up home baker, so nothing here belongs to any real brand. No network.
// Run in CI: node setup/test-caption.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const kit = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOOL = path.join(kit, 'template', '.claude', 'skills', 'caption-and-hashtags', 'caption.mjs');
const C = await import(pathToFileURL(TOOL).href);

const EM = String.fromCharCode(0x2014);                // the banned character, written without typing it
const KW = 'sourdough starter for beginners, how to feed a starter, sourdough bread recipe, flour and water ratio, sourdough discard ideas, starter feeding schedule, easy sourdough loaf, sourdough baking tips';
const TAGS = '#sourdough #breadbaking #homebaker #bakingtips #reels';
const BODY = 'How to feed a sourdough starter, in 5 steps.\n\nFlour, water and patience do the work.\nSave this for later.';
const GOOD = `${BODY}\n\n${TAGS}\n\n${KW}\n`;
const probs = (t, o) => C.checkCaption(t, o).problems.join(' | ');

assert.deepEqual(C.checkCaption(GOOD), { problems: [], notes: [] });
// hashtags
assert.match(probs(`${BODY}\n\n${TAGS} #sixth\n\n${KW}\n`), /has 6 hashtags; Instagram allows 5/);
assert.match(probs(`${BODY}\n\n${KW}\n`), /no hashtag line/);
assert.match(probs(`${BODY} #inline\n\n${TAGS}\n\n${KW}\n`), /hashtag inside the caption/);
assert.match(probs(`${BODY}\n\n${TAGS}\n\n${KW}, #oops\n`), /hashtag inside the keyword line/);
assert.match(probs(`${BODY}\n\n#a #a #b\n\n${KW}\n`), /repeated in the hashtag line/);
assert.match(C.checkCaption(`${BODY}\n\n#one #two\n\n${KW}\n`).notes.join(), /only 2 hashtags/);
// keywords
assert.match(probs(`${BODY}\n\n${TAGS}\n`), /no keyword line/);
assert.match(probs(`${BODY}\n\n${TAGS}\n\none, two\n`), /2 phrases; 8 to 15/);
assert.match(probs(`${BODY}\n\n${TAGS}\n\n${Array.from({ length: 21 }, (_, i) => `phrase ${i}`).join(', ')}\n`), /21 phrases.*keyword stuffing/);
assert.match(C.checkCaption(`${BODY}\n\n${TAGS}\n\n${Array.from({ length: 17 }, (_, i) => `starter phrase ${i}`).join(', ')}\n`).notes.join(), /17 keyword phrases/);
assert.match(probs(`${BODY}\n\n${TAGS}\n\n${KW}, Sourdough Starter For Beginners\n`), /phrase is repeated/);
assert.match(probs(`${BODY}\n\n${TAGS}\n\n${KW}, this phrase has far too many words in it\n`), /5 words at most/);
assert.match(probs(`${BODY}\n\n${TAGS}\n\n${KW}\n\nA second block.\n`), /more than one block after the hashtags/);
// tailored means relevant: a phrase sharing no word with the caption, the script or the niche is noted, one from the niche is not
const off = `${BODY}\n\n${TAGS}\n\n${KW}, cryptocurrency trading\n`;
assert.match(C.checkCaption(off).notes.join(), /"cryptocurrency trading" shares no word with the caption, the script or the niche/);
assert.equal(C.checkCaption(`${BODY}\n\n${TAGS}\n\n${KW}, rye loaves\n`).notes.some((n) => /rye loaves/.test(n)), true);
assert.equal(C.checkCaption(`${BODY}\n\n${TAGS}\n\n${KW}, rye loaves\n`, { reference: 'home baking rye bread' }).notes.some((n) => /rye loaves/.test(n)), false);
// spacing
assert.match(probs(`${BODY}\n${TAGS}\n\n${KW}\n`), /hashtag line must have a blank line before it/);
assert.match(probs(`${BODY}\n\n${TAGS}\n${KW}\n`), /blank line between it and the hashtags/);
assert.match(probs(`${BODY}\n\n\n${TAGS}\n\n${KW}\n`), /more than one blank line/);
// length, first line, banned characters, empty
assert.match(probs(`${'x'.repeat(2200)}\n\n${TAGS}\n\n${KW}\n`), /allows 2,200/);
assert.match(C.checkCaption(`${'y'.repeat(130)}\n\n${TAGS}\n\n${KW}\n`).notes.join(), /first line is 130 characters/);
assert.match(probs(`${BODY} ${EM}\n\n${TAGS}\n\n${KW}\n`, { banned: { banned_characters: [EM] } }), /banned character/);
assert.match(probs(`${BODY}\n\n${TAGS}\n\n${KW}\n`, { banned: { banned_words: ['patience'] } }), /banned word "patience"/);
assert.match(probs('  \n'), /empty/);

// fix: spacing only, never a word; the result then passes
const messy = `${BODY}  \n\n\n\n#sourdough   #breadbaking #homebaker #bakingtips   #reels\n${KW.replaceAll(', ', ',')}`;
assert.equal(C.fixCaption(messy), GOOD);
assert.equal(C.fixCaption(GOOD), GOOD);
assert.deepEqual(C.checkCaption(C.fixCaption(messy)), { problems: [], notes: [] });
const words = (t) => t.replace(/[\s,]+/g, ' ').trim();
assert.equal(words(C.fixCaption(messy)), words(messy));

// candidates: counted, stop words never start or end a phrase, a phrase repeated inside one text counts once, a call to action never leads,
// one account's habits never lead
const c = C.candidates({
  script: 'Sourdough starter makes tasty bread.\nSourdough starter makes tasty bread fast. It isn\'t hard.\n# a note\n',
  accounts: { a: ['learn sourdough starter today', 'sourdough starter for beginners', 'comment bread and I\'ll send it'], b: ['the sourdough starter guide', 'unrelated post', 'comment bread now'], c: ['comment bread please'] },
  audience: ['how do I feed a sourdough starter', 'what is a sourdough starter'],
});
assert.ok(c.script.some((x) => x.phrase === 'sourdough starter' && x.n === 2));
assert.ok(c.script.every((x) => !/^(a|the|and|for|to)\b|\b(a|the|and|for|to)$/.test(x.phrase)));
assert.ok(!c.script.some((x) => /\bll\b|isn/.test(x.phrase)), 'contractions leave no junk');
assert.ok(c.researched.some((x) => x.phrase === 'sourdough starter' && x.n === 3 && x.accounts === 2));
assert.ok(!c.researched.some((x) => /comment|send/.test(x.phrase)), 'a call to action is never a keyword candidate');
assert.ok(!c.researched.some((x) => x.phrase === 'unrelated post'));
assert.ok(c.audience.some((x) => x.phrase === 'sourdough starter' && x.n === 2));
const lone = C.candidates({ accounts: { a: ['fresh rye loaf', 'fresh rye loaf', 'fresh rye loaf'] } });
assert.deepEqual(lone.researched, [], 'three posts from ONE account is a habit, not a pattern');

// the commands, on a real folder (found by its slug), tailored by brand.json -> niche
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'caption-test-')));
const root = path.join(tmp, 'b-reels'); const reel = path.join(root, 'reels', 'my-reel');
fs.mkdirSync(path.join(reel, 'out'), { recursive: true }); fs.mkdirSync(path.join(root, 'brand', 'research'), { recursive: true });
const brand = { name: 'B', slug: 'b', writing: { banned_characters: [EM], banned_words: [] }, niche: { topic: 'home baking', audience: 'beginner bakers', keywords: ['sourdough for beginners', 'home baking tips'], tags: ['sourdough', 'homebaker'] } };
fs.writeFileSync(path.join(root, 'brand', 'brand.json'), JSON.stringify(brand));
fs.writeFileSync(path.join(reel, 'script.txt'), 'Make sourdough bread with a starter.\nMake sourdough bread fast.\n');
fs.writeFileSync(path.join(root, 'brand', 'research', 'demand-2026-11-10.md'), 'how do I make sourdough bread\nsourdough bread for beginners\n');
const run = (...a) => spawnSync('node', [TOOL, ...a], { cwd: root, encoding: 'utf8' });
fs.writeFileSync(path.join(reel, 'out', 'caption.txt'), messy);
let r = run('check', 'my-reel'); assert.equal(r.status, 1); assert.match(r.stdout, /more than one blank line/);
r = run('fix', 'my-reel'); assert.equal(r.status, 0); assert.match(r.stdout, /Tidied the spacing/);
assert.equal(fs.readFileSync(path.join(reel, 'out', 'caption.txt'), 'utf8'), GOOD);
r = run('check', 'my-reel'); assert.equal(r.status, 0); assert.match(r.stdout, /Caption layout is right/); assert.ok(!/note:/.test(r.stdout));
assert.match(run('fix', 'my-reel').stdout, /already right/);
fs.writeFileSync(path.join(reel, 'out', 'caption.txt'), off);
r = run('check', 'my-reel'); assert.equal(r.status, 0); assert.match(r.stdout, /note: "cryptocurrency trading" shares no word/);      // a note, not a refusal
r = run('keywords', 'reels/my-reel'); assert.equal(r.status, 0);
assert.match(r.stdout, /niche setup[^\n]*\n\s+sourdough for beginners\n\s+home baking tips/);
assert.match(r.stdout, /From this reel's script:\n\s+sourdough bread/); assert.match(r.stdout, /audience research \(2\+ mentions\):\n\s+sourdough bread/);
// a brand with no niche yet is told where to set it
fs.writeFileSync(path.join(root, 'brand', 'brand.json'), JSON.stringify({ ...brand, niche: undefined }));
assert.match(run('keywords', 'my-reel').stdout, /not set yet: \/caption-and-hashtags asks for the niche/);
assert.notEqual(run('check', 'no-such-reel').status, 0);
assert.notEqual(run('check').status, 0);
fs.rmSync(tmp, { recursive: true, force: true });
console.log('caption ok');
