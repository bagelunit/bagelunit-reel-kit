#!/usr/bin/env node
// BagelUnit Reel Kit: update this workspace to the newest kit, even if the kit was downloaded as a ZIP.
//
//   node .claude/skills/kit-update/update.mjs check              which version is out, and what changed (reads one public file)
//   node .claude/skills/kit-update/update.mjs get                download that kit version into ~/.bagelunit-reel-kit/<version>/
//   node .claude/skills/kit-update/update.mjs preview            show what would change in this workspace (changes nothing)
//   node .claude/skills/kit-update/update.mjs apply              update this workspace (old files kept as *.bak-<date>), then the engine
//   node .claude/skills/kit-update/update.mjs engine             update only the engine (the installed /bagelunit-reels), if it is behind
// The engine is updated by `apply` itself when it is older than the kit (once per computer: a second workspace finds it current).
// --no-engine skips that. A linked engine (install.sh --link) follows the kit folder and is left alone.
// Options: --workspace <folder> (default: this folder), --from <kit folder or .tar.gz> (use a local copy instead of
// downloading), --version <x.y.z> (a specific release instead of the newest).
//
// It only ever downloads the public kit from GitHub. It never touches brand/ data or reels (sync-template.mjs adds new
// settings and missing starter files only), never needs a key, and never runs as administrator.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const REPO = 'bagelunit/bagelunit-reel-kit';
const HOME_KIT = path.join(os.homedir(), '.bagelunit-reel-kit');

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf('--' + name); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null; };
const cmd = args.find((a) => !a.startsWith('--') && !args[args.indexOf(a) - 1]?.startsWith('--')) || 'check';
const WS = path.resolve(opt('workspace') || process.cwd());

const tup = (v) => (String(v).match(/\d+/g) || ['0']).slice(0, 3).map(Number);
export const cmp = (a, b) => { const x = tup(a), y = tup(b); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0; };
const have = () => { try { return fs.readFileSync(path.join(WS, '.kit-version'), 'utf8').trim() || 'unknown'; } catch { return 'unknown'; } };

function fail(msg) { console.error(msg); process.exit(1); }

// GitHub sometimes drops a single read: up to 3 tries, each with a time limit, a short pause between
async function fetchRetry(url, tries = 3, ms = 20000) {
  let res = null;
  for (let i = 0; i < tries; i++) {
    res = await fetch(url, { signal: AbortSignal.timeout(ms) }).catch(() => null);
    if (res && res.ok) return res;
    if (res && res.status === 404) return res;                       // a missing file or tag will not appear on a retry
    if (i < tries - 1) await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
  }
  return res;
}

async function latest() {
  if (opt('version')) return opt('version');
  const res = await fetchRetry(`https://raw.githubusercontent.com/${REPO}/main/VERSION`);
  if (!res || !res.ok) fail('Could not read the newest version from GitHub (offline?). Try again later, or use --from <kit folder>.');
  return (await res.text()).trim();
}

// Returns the folder of an unpacked kit (it has setup/sync-template.mjs and template/).
async function getKit(version) {
  const from = opt('from');
  if (from) {
    const f = path.resolve(from);
    if (fs.statSync(f).isDirectory()) return f;
    return unpack(f, path.join(HOME_KIT, 'local-' + Date.now()));
  }
  const dest = path.join(HOME_KIT, version);
  if (fs.existsSync(path.join(dest, 'setup', 'sync-template.mjs'))) return dest;
  fs.mkdirSync(HOME_KIT, { recursive: true });
  const ref = opt('version') ? `refs/tags/v${version}` : 'refs/heads/main';
  const url = `https://codeload.github.com/${REPO}/tar.gz/${ref}`;
  const res = await fetchRetry(url, 3, 120000);
  if (!res || !res.ok) fail(`Download failed (${res ? res.status : 'offline'}): ${url}`);
  const tgz = path.join(HOME_KIT, `kit-${version}.tar.gz`);
  fs.writeFileSync(tgz, Buffer.from(await res.arrayBuffer()));
  const out = unpack(tgz, dest);
  fs.rmSync(tgz, { force: true });
  return out;
}

function unpack(tgz, dest) {
  const tmp = dest + '.tmp';
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  execFileSync('tar', ['-xzf', tgz, '-C', tmp]);                    // tar ships with macOS, Linux and Windows 10+
  const inner = fs.readdirSync(tmp).map((d) => path.join(tmp, d)).find((d) => fs.existsSync(path.join(d, 'setup', 'sync-template.mjs')));
  if (!inner) fail('That download is not the kit (no setup/sync-template.mjs inside).');
  fs.rmSync(dest, { recursive: true, force: true });
  fs.renameSync(inner, dest);
  fs.rmSync(tmp, { recursive: true, force: true });
  return dest;
}

function whatChanged(kit, from) {
  let log = '';
  try { log = fs.readFileSync(path.join(kit, 'CHANGELOG.md'), 'utf8'); } catch { return []; }
  return log.split(/^## /m).slice(1).filter((b) => from === 'unknown' ? false : cmp(b.split(/\s/)[0], from) > 0).map((b) => '## ' + b.trimEnd());
}

function sync(kit, apply) {
  const a = [path.join(kit, 'setup', 'sync-template.mjs'), WS];
  if (apply) a.push('--apply');
  return execFileSync(process.execPath, a, { encoding: 'utf8' });
}

// Update the installed engine (~/.claude/skills/bagelunit-reels) with the kit's own installer, when it is behind this kit.
// The installer's marker file holds the kit version it was installed from. It runs the installer without the program,
// plugin and sound-library steps (an update has them already; those steps can ask questions or download gigabytes);
// stdin is not a terminal here, so the installer never installs a program on its own. Returns true when it ran and succeeded.
export function updateEngine(kit, version, { skills = path.join(os.homedir(), '.claude', 'skills'), run = spawnSync, log = console.log } = {}) {
  const target = path.join(skills, 'bagelunit-reels');
  const installer = path.join(kit, 'setup', 'install.mjs');
  if (!fs.existsSync(installer)) { log('The engine was not updated: this kit has no installer.'); return false; }
  let linked = false; try { linked = fs.lstatSync(target).isSymbolicLink(); } catch {}
  if (linked) { log('The engine is linked to a kit folder (install with --link), so it follows that folder. Nothing to update.'); return false; }
  if (!fs.existsSync(target)) { log(`The engine is not installed yet. Install it once: node "${installer}"`); return false; }
  const kitV = version === 'local' ? (() => { try { return fs.readFileSync(path.join(kit, 'VERSION'), 'utf8').trim(); } catch { return ''; } })() : version;
  let have = 'unknown'; try { have = fs.readFileSync(path.join(target, '.bagelunit-reel-kit'), 'utf8').split('\n')[1]?.trim() || 'unknown'; } catch {}
  if (kitV && have !== 'unknown' && cmp(kitV, have) <= 0) { log(`The engine is already on ${have}.`); return false; }
  log(`Updating the engine (${have === 'unknown' ? 'an older version' : have} to ${kitV || 'the newest'}) with the kit's installer...`);
  const r = run(process.execPath, [installer, '--skip-packages', '--skip-plugins', '--skip-sound'], { stdio: 'inherit' });
  if (r.status !== 0) { log(`The engine update did not finish. Run it yourself and read what it says: node "${installer}"`); return false; }
  log('The engine is updated. Restart Claude Code so the new engine and skills load.');
  return true;
}

async function main() {
  if (!fs.existsSync(path.join(WS, 'brand', 'brand.json'))) fail(`Not a reel workspace: ${WS}`);
  const mine = have();
  if (cmd === 'check') {
    const v = opt('from') ? 'local copy' : await latest();
    if (v !== 'local copy' && mine !== 'unknown' && cmp(v, mine) <= 0) { console.log(`UP TO DATE: this workspace is on ${mine}, the newest is ${v}.`); return; }
    console.log(`NEWER: ${v} is out; this workspace is on ${mine}.`);
    console.log('Next: "get" downloads it, "preview" shows what would change here, "apply" updates this workspace.');
    return;
  }
  const version = opt('from') ? 'local' : await latest();
  const kit = await getKit(version);
  if (cmd === 'get') { console.log(`Kit ${version} is in ${kit}`); return; }
  if (cmd === 'preview') {
    for (const b of whatChanged(kit, mine)) console.log(b + '\n');
    process.stdout.write(sync(kit, false));
    return;
  }
  if (cmd === 'apply') {
    process.stdout.write(sync(kit, true));
    console.log('');
    if (args.includes('--no-engine')) console.log(`The engine was not touched (--no-engine). Update it later: node .claude/skills/kit-update/update.mjs engine`);
    else updateEngine(kit, version);
    return;
  }
  if (cmd === 'engine') { updateEngine(kit, version); return; }
  fail(`Unknown command "${cmd}". Use check, get, preview, apply or engine.`);
}

import { fileURLToPath } from 'node:url';
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) main().catch((e) => fail(e.message));
