#!/usr/bin/env node
// Safety scan for the public repo. Fails (exit 1) if a tracked file looks like it holds a secret, a private file type,
// or a personal home path; also checks the "no em dashes" rule in our own docs.
// Runs on every push in CI and any time:  node setup/scan-repo.mjs
// Looks at files git tracks plus new files not added yet (so a file is checked before its first commit), never at
// files .gitignore leaves out, so it never reads your keys.
import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = [...new Set(cp.execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: REPO, encoding: 'utf8' }).split('\0').filter(Boolean))].filter((f) => fs.existsSync(path.join(REPO, f)));

const SECRET_PATTERNS = [
  [/\bsk_[A-Za-z0-9]{20,}/, 'looks like a secret key (sk_...)'],
  [/\bsk-[A-Za-z0-9_-]{20,}/, 'looks like an API key (sk-...)'],
  [/\bapify_api_[A-Za-z0-9]{16,}/, 'looks like an Apify token'],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}/, 'looks like a GitHub token'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'looks like an AWS key'],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}/, 'looks like a Slack token'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'contains a private key'],
  [/xi-api-key['"]?\s*[:=]\s*['"][A-Za-z0-9]{20,}['"]/, 'looks like a hard-coded ElevenLabs key'],
];
const BAD_FILES = /(^|\/)(\.env(\..*)?|.*\.(key|pem|p12|pfx)|id_rsa|id_ed25519|\.DS_Store)$/i;
const BIG_MEDIA = /\.(mp4|mov|wav|mp3|m4a|heic|psd)$/i;       // renders, audio, raw photos never belong in the repo
const TEXT = /\.(md|mjs|js|json|py|sh|ps1|yml|yaml|txt|html|css|mdc)$/i;
const EM_CHECKED = (f) => /^(README|SETUP|CLAUDE|CHANGELOG)\.md$/.test(f) || /^(docs|template|setup|\.github)\//.test(f);
const EM_EXEMPT = new Set(['template/brand/brand.json', 'template/.claude/skills/humanizer/humanize_check.py', 'setup/scan-repo.mjs']);
const EM = String.fromCharCode(0x2014);
const HOME_PATH = /\/Users\/[a-z][a-z0-9_-]+\/|C:\\Users\\[A-Za-z][^\\]+\\/;
const HOME_OK = /\/Users\/(runner|runneradmin|you|name|yourname)\b/;   // none expected, kept narrow

const problems = [];
// brand/licensed/ ships only the README, the empty registry and .gitkeep files: no asset (Uppbeat music, clip, LUT...) is ever tracked
const LICENSED_OK = /^template\/brand\/licensed\/(README\.md|assets\.json|(music|sfx|stock-video|motion-graphic|lut|generated-image|generated-video)\/\.gitkeep)$/;
const add = (f, why) => problems.push(`${f}: ${why}`);
for (const f of files) {
  // a documentation or code file that is empty is a mistake (an edit that truncated it); only placeholders like .gitkeep may be empty
  if (/\.(md|mjs|js|py|sh|json|yml|html)$/.test(f) && fs.existsSync(path.join(REPO, f)) && fs.statSync(path.join(REPO, f)).size === 0 && !/(^|\/)(__init__\.py)$/.test(f)) add(f, 'the file is empty (an edit may have truncated it)');
  if (/^template\/brand\/licensed\//.test(f) && !LICENSED_OK.test(f)) add(f, 'a licensed asset must not be tracked (only README.md, an empty assets.json and .gitkeep files ship in brand/licensed/)');
  if (f === 'template/brand/licensed/assets.json') { try { if (JSON.parse(fs.readFileSync(path.join(REPO, f), 'utf8')).assets.length) add(f, 'the shipped registry must be empty ({"assets":[]})'); } catch { add(f, 'is not a valid registry'); } }
  if (BAD_FILES.test(f)) add(f, 'a key, secret or system file must not be tracked');
  const SAMPLE = /^docs\/samples\/[a-z0-9-]+\.mp4$/.test(f) && fs.statSync(path.join(REPO, f)).size < 3 * 1024 * 1024;   // the sample clips, each under 3 MB
  if (BIG_MEDIA.test(f) && !SAMPLE) add(f, 'a render, audio or raw media file must not be tracked');
  if (!TEXT.test(f)) continue;
  let text; try { text = fs.readFileSync(path.join(REPO, f), 'utf8'); } catch { continue; }
  const low = text.toLowerCase();
  if (f !== 'setup/scan-repo.mjs') for (const [re, why] of SECRET_PATTERNS) if (re.test(text)) add(f, why);
  const hp = text.match(HOME_PATH);
  if (hp && !HOME_OK.test(hp[0]) && f !== 'setup/scan-repo.mjs') add(f, `has a personal home path (${hp[0]})`);
  if (EM_CHECKED(f) && !EM_EXEMPT.has(f) && text.includes(EM)) add(f, 'has an em dash (the kit writes none)');
}
if (problems.length) { console.error(`Scan found ${problems.length} problem(s):\n  ` + problems.join('\n  ')); process.exit(1); }
console.log(`Scan clean: ${files.length} files checked (tracked and new).`);
