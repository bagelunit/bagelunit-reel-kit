#!/usr/bin/env node
// The kit's build stamp: template/.kit-build, one line such as
//   2026-11-12T21:05Z kit:1a2b3c4d5e6f engine:0a1b2c3d4e5f
// so a brand folder learns about a newer build of the same version (VERSION only changes for a release).
//   kit     a fingerprint of everything a brand gets: template/ (without this file), studio/ and the install and sync scripts
//   engine  a fingerprint of the engine alone: studio/ and the installer (so the engine is reinstalled only when it changed)
// The fingerprints come from git's staged copies of the files (git ls-files -s), so they are the same on every system
// whatever its line endings. The time changes only when the kit fingerprint does.
//
//   node setup/stamp-build.mjs           after `git add`: write the stamp if the files changed, and stage it
//   node setup/stamp-build.mjs --check   fail if the stamp does not match the staged files (CI)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STAMP = 'template/.kit-build';
const INSTALL = ['setup/install.mjs', 'setup/install.sh', 'setup/install.ps1'];
const KIT = ['template', 'studio', ...INSTALL, 'setup/sync-template.mjs', 'setup/sync-template.sh', 'setup/new-brand.mjs'];
const ENGINE = ['studio', ...INSTALL];

function fingerprint(paths) {
  const out = execFileSync('git', ['ls-files', '-s', '--', ...paths], { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const lines = out.split('\n').filter(Boolean).map((l) => { const [meta, file] = l.split('\t'); return `${meta.split(' ')[1]} ${file}`; })
    .filter((l) => !l.endsWith(' ' + STAMP)).sort();
  return crypto.createHash('sha256').update(lines.join('\n')).digest('hex').slice(0, 12);
}
export const parseBuild = (s) => { const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z) kit:([0-9a-f]{12}) engine:([0-9a-f]{12})/.exec(String(s || '').trim()); return m ? { at: m[1], kit: m[2], engine: m[3] } : null; };

const file = path.join(REPO, STAMP);
const now = (() => { try { return parseBuild(fs.readFileSync(file, 'utf8')); } catch { return null; } })();
const kit = fingerprint(KIT), engine = fingerprint(ENGINE);
if (process.argv.includes('--check')) {
  if (!now || now.kit !== kit || now.engine !== engine) {
    console.error(`The build stamp (${STAMP}) does not match the files: git add your changes, run  node setup/stamp-build.mjs  and commit the stamp with them.`);
    process.exit(1);
  }
  console.log(`Build stamp is current: ${now.at} kit:${kit} engine:${engine}`);
} else if (now && now.kit === kit && now.engine === engine) {
  console.log(`Build stamp is current: ${now.at} (nothing changed since).`);
} else {
  const at = new Date().toISOString().slice(0, 16) + 'Z';
  fs.writeFileSync(file, `${at} kit:${kit} engine:${engine}\n`);
  execFileSync('git', ['add', STAMP], { cwd: REPO });
  console.log(`New build stamp: ${at} kit:${kit} engine:${engine} (staged). Commit it with the change.`);
}
