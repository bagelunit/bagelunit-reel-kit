#!/usr/bin/env node
// BagelUnit Reel Kit: update this workspace to the newest kit, even if the kit was downloaded as a ZIP.
//
//   node .claude/skills/kit-update/update.mjs check              which version is out, and what changed (reads one public file)
//   node .claude/skills/kit-update/update.mjs get                download that kit version into ~/.bagelunit-reel-kit/<version>/
//   node .claude/skills/kit-update/update.mjs preview            show what would change in this workspace (changes nothing)
//   node .claude/skills/kit-update/update.mjs now                everything in one go: what changed, update this workspace, update the engine (what /kit-update runs)
//   node .claude/skills/kit-update/update.mjs apply              update this workspace (old files kept as *.bak-<date>), then the engine
//   node .claude/skills/kit-update/update.mjs engine             update only the engine (the installed /bagelunit-reels), if it is behind
// The engine is updated by `apply` itself when it is older than the kit (once per computer: a second workspace finds it current).
// --no-engine skips that. A linked engine (install.sh --link) follows the kit folder and is left alone.
// Options: --workspace <folder> (default: this folder), --from <kit folder or .tar.gz> (use a local copy instead of
// downloading), --version <x.y.z> (a specific release instead of the newest).
//
// Builds: VERSION changes only for a release, so the kit also carries a build stamp, template/.kit-build (written by the
// kit's setup/stamp-build.mjs): "<time> kit:<fingerprint> engine:<fingerprint>". A workspace keeps the one it was
// updated from in .kit-build, and the engine's marker keeps its own. A newer build of the same version counts as an
// update, and each build is downloaded fresh into ~/.bagelunit-reel-kit/<version>+<kit fingerprint>/.
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

// the build stamp: "<time> kit:<12 hex> engine:<12 hex>", or null
export const parseBuild = (s) => { const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z) kit:([0-9a-f]{12}) engine:([0-9a-f]{12})/.exec(String(s || '').trim()); return m ? { at: m[1], kit: m[2], engine: m[3], line: m[0] } : null; };
const readBuild = (file) => { try { return parseBuild(fs.readFileSync(file, 'utf8')); } catch { return null; } };
// is build `a` newer than build `b` for one part ('kit' or 'engine')? An unknown `b` (made before builds) is older;
// a different fingerprint that is not later in time is a copy ahead of GitHub (the kit's own folder), not behind it.
export const buildNewer = (a, b, part = 'kit') => !!a && (!b || (a[part] !== b[part] && a.at > b.at));
// behind: an older version, or the same version and an older build of that part
export const behind = (remote, mine, part = 'kit') => {
  if (!remote?.version || !mine?.version || mine.version === 'unknown') return !!remote?.version && mine?.version === 'unknown';
  const c = cmp(remote.version, mine.version);
  return c > 0 || (c === 0 && buildNewer(remote.build, mine.build, part));
};
const when = (b) => (b ? b.at.replace('T', ' ').replace('Z', ' UTC') : 'an earlier build');

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

// the newest kit on GitHub: { version, build } (build is null for a tagged release or a kit from before builds)
async function latest() {
  if (opt('version')) return { version: opt('version'), build: null };
  const res = await fetchRetry(`https://raw.githubusercontent.com/${REPO}/main/VERSION`);
  if (!res || !res.ok) fail('Could not read the newest version from GitHub (offline?). Try again later, or use --from <kit folder>.');
  const b = await fetchRetry(`https://raw.githubusercontent.com/${REPO}/main/template/.kit-build`);
  return { version: (await res.text()).trim(), build: b && b.ok ? parseBuild(await b.text()) : null };
}

// Returns the folder of an unpacked kit (it has setup/sync-template.mjs and template/). A tagged release is kept as
// <version>; the newest kit as <version>+<kit fingerprint>, so a newer build of the same version is downloaded fresh.
async function getKit(version, build = null) {
  const from = opt('from');
  if (from) {
    const f = path.resolve(from);
    if (fs.statSync(f).isDirectory()) return f;
    return unpack(f, path.join(HOME_KIT, 'local-' + Date.now()));
  }
  const name = opt('version') ? version : `${version}+${build ? build.kit : 'latest'}`;
  const dest = path.join(HOME_KIT, name);
  if (build && fs.existsSync(path.join(dest, 'setup', 'sync-template.mjs'))) return dest;
  try { for (const d of fs.readdirSync(HOME_KIT)) if (d.startsWith(`${version}+`) && d !== name) fs.rmSync(path.join(HOME_KIT, d), { recursive: true, force: true }); } catch {}   // older builds of it
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
  const blocks = log.split(/^## /m).slice(1);
  const newer = blocks.filter((b) => from === 'unknown' ? false : cmp(b.split(/\s/)[0], from) > 0);
  // a newer build of the same version: its own entry holds what was added since
  return (newer.length ? newer : blocks.filter((b) => b.split(/\s/)[0] === from)).map((b) => '## ' + b.trimEnd());
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
  const kitB = readBuild(path.join(kit, 'template', '.kit-build'));
  const { version: have, build: haveB } = engineState(skills);
  const sameV = kitV && have !== 'unknown' && cmp(kitV, have) === 0;
  if (kitV && have !== 'unknown' && (cmp(kitV, have) < 0 || (sameV && !buildNewer(kitB, haveB, 'engine')))) { log(`The engine is already on ${have}${haveB ? ` (build ${when(haveB)})` : ''}.`); return false; }
  log(`Updating the engine (${have === 'unknown' ? 'an older version' : sameV ? `${have}, ${haveB ? `build ${when(haveB)}` : 'an earlier build'}` : have} to ${kitV || 'the newest'}${sameV && kitB ? `, build ${when(kitB)}` : ''}) with the kit's installer...`);
  // the installer's own report is for a first install ("fix: make an ElevenLabs key...", "Next: type /brand-setup"); an update shows it only when it fails
  const r = run(process.execPath, [installer, '--skip-packages', '--skip-plugins', '--skip-sound'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) {
    const said = `${r.stdout || ''}${r.stderr || ''}`.trim().split('\n').slice(-15).join('\n');
    if (said) log(said);
    log(`The engine update did not finish. Run it yourself and read what it says: node "${installer}"`); return false;
  }
  log('The engine is updated. Restart Claude Code so the new engine and skills load.');
  return true;
}


// Where the installed engine (~/.claude/skills/bagelunit-reels) stands: { state: 'missing' | 'linked' | 'ok', version, build }.
// The marker holds the install date, the kit version and (from builds on) the kit's build stamp. The version is
// 'unknown' for an engine installed before the marker held one. Also used by the session-start notice.
export function engineState(skills = path.join(os.homedir(), '.claude', 'skills')) {
  const target = path.join(skills, 'bagelunit-reels');
  let st = null; try { st = fs.lstatSync(target); } catch {}
  if (!st) return { state: 'missing', version: null, build: null };
  if (st.isSymbolicLink()) return { state: 'linked', version: null, build: null };
  let lines = []; try { lines = fs.readFileSync(path.join(target, '.bagelunit-reel-kit'), 'utf8').split('\n'); } catch {}
  return { state: 'ok', version: lines[1]?.trim() || 'unknown', build: parseBuild(lines[2]) };
}

// What the session-start notice says about versions, or ''. No network for the engine check (the engine against this
// workspace); once a day it reads the public VERSION file on GitHub (3 seconds at most, never fails the session) and
// says when a newer kit is out. Turn the online check off with "updates": { "check_on_start": false } in brand/brand.json
// (what /brand-setup writes for "No, I'll check myself"; the older "check": false is still honoured).
export async function versionNote(root, { skills, now = Date.now(), fetchLatest = null } = {}) {
  const mine = (() => { try { return fs.readFileSync(path.join(root, '.kit-version'), 'utf8').trim(); } catch { return ''; } })();
  if (!mine) return '';
  const mineB = readBuild(path.join(root, '.kit-build'));
  const lines = [];
  const eng = engineState(skills);
  if (eng.state === 'ok' && (eng.version === 'unknown' || behind({ version: mine, build: mineB }, eng, 'engine')))
    lines.push(`The engine (/bagelunit-reels) is on ${eng.version === 'unknown' ? 'an older version' : cmp(mine, eng.version) === 0 ? `${eng.version}, ${eng.build ? `build ${when(eng.build)}` : 'an earlier build'}` : eng.version}, behind this workspace (${mine}${cmp(mine, eng.version || '0') === 0 && mineB ? `, build ${when(mineB)}` : ''}). Fixes in the newer kit do not work until it is updated: tell the owner in one line and offer to run  node .claude/skills/kit-update/update.mjs engine  (then Claude Code must be restarted).`);
  let cfg = {}; try { cfg = JSON.parse(fs.readFileSync(path.join(root, 'brand', 'brand.json'), 'utf8')); } catch {}
  if (cfg.updates?.check_on_start !== false && cfg.updates?.check !== false) {
    const cacheFile = path.join(root, '.cache', 'kit-latest.json');
    let c = null; try { c = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch {}
    if (!c || !(now - c.at < 24 * 3600 * 1000)) {
      let v = null, b = null;
      try {
        if (fetchLatest) { const r = await fetchLatest(); v = typeof r === 'string' ? r : r?.version; b = typeof r === 'string' ? null : r?.build || null; }
        else {
          const raw = (f) => fetch(`https://raw.githubusercontent.com/${REPO}/main/${f}`, { signal: AbortSignal.timeout(3000) }).then((r) => (r.ok ? r.text() : null));
          [v, b] = await Promise.all([raw('VERSION'), raw('template/.kit-build').catch(() => null)]);
          v = (v || '').trim();
        }
        if (!/^\d+\.\d+\.\d+$/.test(v || '')) v = null;
        b = typeof b === 'string' ? parseBuild(b) : b && b.kit ? b : null;
      } catch { v = null; b = null; }
      c = v ? { at: now, version: v, build: b ? b.line || `${b.at} kit:${b.kit} engine:${b.engine}` : null } : { at: now, version: c?.version || null, build: c?.build || null };
      try { fs.mkdirSync(path.dirname(cacheFile), { recursive: true }); fs.writeFileSync(cacheFile, JSON.stringify(c)); } catch {}
    }
    const remote = { version: c.version, build: parseBuild(c.build) };
    if (c.version && cmp(c.version, mine) > 0)
      lines.push(`A newer BagelUnit Reel Kit is out: ${c.version} (this workspace is on ${mine}). Tell the owner in one line to type /kit-update, which shows what changed and updates the workspace and the engine in one go.`);
    else if (c.version && behind(remote, { version: mine, build: mineB }))
      lines.push(`A newer build of BagelUnit Reel Kit ${c.version} is out (${when(remote.build)}; this workspace has ${mineB ? `the build from ${when(mineB)}` : 'an earlier build'}). Tell the owner in one line to type /kit-update, which shows what changed and updates the workspace and the engine in one go.`);
  }
  return lines.join('\n');
}

async function main() {
  if (!fs.existsSync(path.join(WS, 'brand', 'brand.json'))) fail(`Not a reel workspace: ${WS}`);
  const mine = have(), mineB = readBuild(path.join(WS, '.kit-build'));
  const me = { version: mine, build: mineB };
  const label = (v, b) => `${v}${b ? ` (build ${when(b)})` : ''}`;
  if (cmd === 'check') {
    if (opt('from')) { console.log(`NEWER: a local copy was given; this workspace is on ${label(mine, mineB)}.`); return; }
    const r = await latest();
    if (mine !== 'unknown' && !behind(r, me)) { console.log(`UP TO DATE: this workspace is on ${label(mine, mineB)}, the newest is ${label(r.version, r.build)}.`); return; }
    console.log(cmp(r.version, mine) === 0 ? `NEWER: a newer build of ${r.version} is out (${when(r.build)}); this workspace has ${mineB ? `the build from ${when(mineB)}` : 'an earlier build'}.` : `NEWER: ${label(r.version, r.build)} is out; this workspace is on ${mine}.`);
    console.log('Next: "get" downloads it, "preview" shows what would change here, "apply" updates this workspace.');
    return;
  }
  if (cmd === 'now') {
    const r = opt('from') ? { version: 'local', build: null } : await latest();
    const version = r.version;
    const eng = engineState();
    const wsBehind = Boolean(opt('from')) || mine === 'unknown' || behind(r, me);
    const engBehind = eng.state === 'ok' && !args.includes('--no-engine') && (version === 'local' || eng.version === 'unknown' || behind(r, eng, 'engine'));
    if (!wsBehind && !engBehind) { console.log(`UP TO DATE: this workspace is on ${label(mine, mineB)}, the newest is ${label(version, r.build)}${eng.state === 'ok' ? `, the engine is on ${label(eng.version, eng.build)}` : ''}.`); return; }
    const kit = await getKit(version, r.build);
    if (wsBehind) {
      for (const b of whatChanged(kit, mine)) console.log(b + '\n');
      process.stdout.write(sync(kit, true));
      console.log('');
    }
    if (args.includes('--no-engine')) console.log('The engine was not touched (--no-engine). Update it later: node .claude/skills/kit-update/update.mjs engine');
    else updateEngine(kit, version);
    return;
  }
  const r = opt('from') ? { version: 'local', build: null } : await latest();
  const version = r.version;
  const kit = await getKit(version, r.build);
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
  fail(`Unknown command "${cmd}". Use check, get, preview, now, apply or engine.`);
}

import { fileURLToPath } from 'node:url';
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) main().catch((e) => fail(e.message));
