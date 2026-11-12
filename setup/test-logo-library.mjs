#!/usr/bin/env node
// Checks the logo library (/logo-library): it starts empty, refuses unclean SVGs, bad ids and an unconfirmed download, records fidelity and rights,
// says ready / stand-in / missing, copies logos into a reel and records them in reel.json, and blocks posting (logos.mjs check) until each logo is
// official or traced and approved. No network. Run in CI: node setup/test-logo-library.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const kit = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'logo-library-test-')));
const B = path.join(tmp, 'brand-reels');
fs.cpSync(path.join(kit, 'template'), B, { recursive: true });
const TOOL = path.join(B, '.claude', 'skills', 'logo-library', 'logos.mjs');
const run = (...a) => spawnSync('node', [TOOL, ...a], { cwd: B, encoding: 'utf8' });
const out = (r) => (r.stdout || '') + (r.stderr || '');
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#123456"/></svg>';
const svgFile = path.join(tmp, 'mark.svg'); fs.writeFileSync(svgFile, SVG);

// the kit ships none
assert.deepEqual(JSON.parse(fs.readFileSync(path.join(B, 'brand', 'library', 'logos', 'index.json'), 'utf8')).logos, [], 'the template ships no logos');
assert.match(out(run('list')), /no logos yet/);

// refusals
const bad = path.join(tmp, 'bad.svg'); fs.writeFileSync(bad, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><script>alert(1)</script></svg>');
assert.notEqual(run('add', 'evil', '--file', bad).status, 0); assert.match(out(run('add', 'evil', '--file', bad)), /not a clean SVG/);
assert.notEqual(run('add', 'Bad Id', '--file', svgFile).status, 0);
assert.notEqual(run('add', 'x', '--file', svgFile, '--fidelity', 'perfect').status, 0);
const dl = run('add', 'remote', '--url', 'https://example.com/logo.svg');
assert.notEqual(dl.status, 0); assert.match(out(dl), /Ask the user first/);                       // a download needs --yes
assert.notEqual(run('add', 'remote', '--url', 'http://example.com/logo.svg', '--yes').status, 0);   // https only
assert.notEqual(run('add', 'both', '--file', svgFile, '--url', 'https://example.com/x.svg', '--yes').status, 0);

// add, list, need
assert.equal(run('add', 'acme', '--file', svgFile, '--name', 'Acme', '--brand', 'Acme Inc', '--fidelity', 'official', '--rights', 'test-only', '--source', 'test').status, 0);
assert.equal(run('add', 'stand-in', '--file', svgFile, '--fidelity', 'approx', '--rights', 'test-only').status, 0);
assert.match(out(run('list')), /acme\s+official\s+test-only/);
assert.equal(run('need', 'acme').status, 0);
let n = run('need', 'stand-in'); assert.equal(n.status, 2); assert.match(out(n), /APPROX/);
n = run('need', 'nothing'); assert.equal(n.status, 2); assert.match(out(n), /MISSING/);

// use in a reel, then the posting check
const reel = path.join(B, 'reels', 'demo'); fs.mkdirSync(reel, { recursive: true }); fs.writeFileSync(path.join(reel, 'reel.json'), JSON.stringify({ style: 'print', name: 'demo' }));
let r = run('use', 'demo', 'acme'); assert.equal(r.status, 0, out(r));
assert.ok(fs.existsSync(path.join(reel, 'assets', 'logos', 'acme.svg')));
assert.deepEqual(JSON.parse(fs.readFileSync(path.join(reel, 'reel.json'), 'utf8')).logos, ['acme']);
r = run('check', 'demo'); assert.equal(r.status, 1); assert.match(out(r), /not approved for posting \(official, rights test-only\)/);   // test-only never posts
run('add', 'acme', '--file', svgFile, '--fidelity', 'official', '--rights', 'approved');
r = run('check', 'demo'); assert.equal(r.status, 0); assert.match(out(r), /Every logo in this reel is approved/);
run('use', 'demo', 'stand-in'); r = run('check', 'demo'); assert.equal(r.status, 1); assert.match(out(r), /stand-in/);   // approx never posts, even when approved
run('add', 'stand-in', '--file', svgFile, '--fidelity', 'approx', '--rights', 'approved'); assert.equal(run('check', 'demo').status, 1);
// a reel that names a logo the library lacks
fs.writeFileSync(path.join(reel, 'reel.json'), JSON.stringify({ style: 'print', logos: ['ghost'] }));
r = run('check', 'demo'); assert.equal(r.status, 1); assert.match(out(r), /"ghost" is not in brand\/library\/logos/);
// a reel with no logos is fine
fs.writeFileSync(path.join(reel, 'reel.json'), JSON.stringify({ style: 'print' }));
r = run('check', 'demo'); assert.equal(r.status, 0); assert.match(out(r), /uses none/);
// outside a brand folder
assert.notEqual(spawnSync('node', [TOOL, 'list'], { cwd: tmp, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: '' } }).status, 0);

fs.rmSync(tmp, { recursive: true, force: true });
console.log('logo library: ok');
