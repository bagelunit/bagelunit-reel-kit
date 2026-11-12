#!/usr/bin/env node
// Logo library for a brand folder. A reel (or a reference you are rebuilding) shows other companies' logos and app icons; each one is looked up
// here and drawn from a real SVG, never approximated in silence, and the scheduler will not post a reel that uses a logo that is not approved.
// The kit ships no logos: you add the ones you need.
//
//   node .claude/skills/logo-library/logos.mjs list
//   node .claude/skills/logo-library/logos.mjs need <id> [<id> ...]       ready, a stand-in, or missing? (exit 2 when not ready)
//   node .claude/skills/logo-library/logos.mjs add <id> --file x.svg | --url https://... --yes  --name "..." --brand "..."
//                                              --fidelity official|traced|approx --rights approved|test-only|pending --source "where it came from" [--notes "..."]
//   node .claude/skills/logo-library/logos.mjs use <reel> <id> [<id> ...]  copy the SVGs into the reel's assets/logos/ and record them in reel.json "logos"
//   node .claude/skills/logo-library/logos.mjs check <reel>               is every logo this reel uses approved for posting? (what schedule.mjs checks)
//
// --url downloads one small SVG (at most 200 KB, https only) and needs --yes: ask the user first, naming the file and where it comes from.
// In a Print reel, draw a registered logo with:  ASSETS.push(['logo_<id>', 'assets/logos/<id>.svg'])  then  IMG.logo_<id>  (guide: media.js).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const MIN_BYTES = 40, MAX_BYTES = 200 * 1024;
export const FIDELITY = ['official', 'traced', 'approx'], RIGHTS = ['approved', 'test-only', 'pending'];
export const ready = (l) => !!l && l.fidelity !== 'approx' && l.rights === 'approved';

export function findBrand(from) {
  let d = path.resolve(from);
  for (let i = 0; i < 12; i++) { if (fs.existsSync(path.join(d, 'brand', 'brand.json'))) return d; const up = path.dirname(d); if (up === d) break; d = up; }
  return null;
}
const dirOf = (root) => path.join(root, 'brand', 'library', 'logos');
export function loadLogos(root) { try { return JSON.parse(fs.readFileSync(path.join(dirOf(root), 'index.json'), 'utf8')).logos || []; } catch { return []; } }
function saveLogos(root, logos) { fs.mkdirSync(dirOf(root), { recursive: true }); fs.writeFileSync(path.join(dirOf(root), 'index.json'), JSON.stringify({ logos }, null, 2) + '\n'); }
export const cleanSvg = (t) => /<svg[\s>]/i.test(t) && !/<script|<foreignObject|\son[a-z]+\s*=|javascript:|<!ENTITY/i.test(t) && Buffer.byteLength(t) >= MIN_BYTES && Buffer.byteLength(t) <= MAX_BYTES;
const okId = (s) => /^[a-z0-9][a-z0-9-]{0,40}$/.test(s || '');

// the problems that stop a reel being posted because of its logos: [] when fine
export function logoProblems(root, reelJson) {
  const used = Array.isArray(reelJson?.logos) ? reelJson.logos : [];
  const reg = loadLogos(root), out = [];
  for (const id of used) {
    const l = reg.find((x) => x.id === id);
    if (!l) out.push(`logo "${id}" is not in brand/library/logos (add it with /logo-library, then get the mark approved)`);
    else if (!ready(l)) out.push(`logo "${id}" is not approved for posting (${l.fidelity}, rights ${l.rights}): use the brand's own artwork, read its usage terms, then record the owner's approval with /logo-library`);
  }
  return out;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const flag = (n) => { const i = rest.indexOf('--' + n); return i >= 0 && rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[i + 1] : null; };
  const root = findBrand(process.env.CLAUDE_PROJECT_DIR || process.cwd());
  if (!root) { console.error('Run this inside a brand folder (the one holding brand/brand.json).'); process.exit(1); }
  const logos = loadLogos(root);
  const row = (l) => `${l.id.padEnd(18)} ${l.fidelity.padEnd(9)} ${l.rights.padEnd(10)} ${l.brand || ''}`;
  if (cmd === 'list') { console.log(logos.length ? logos.map(row).join('\n') : '(no logos yet: add one with /logo-library)'); return; }
  if (cmd === 'need') {
    let bad = 0;
    for (const id of rest) {
      const l = logos.find((x) => x.id === id);
      if (!l) { bad++; console.log(`MISSING   ${id}: not in the library. Find the brand's own artwork (its press or brand page, the app listing, or a clear crop of the reference), then: logos.mjs add ${id} ...`); }
      else if (l.fidelity === 'approx') { bad++; console.log(`APPROX    ${id}: only a stand-in exists (${l.source || 'no source'}). Replace it before this is posted.`); }
      else console.log(`ok        ${row(l)}${l.rights === 'approved' ? '' : '   (not approved for posting yet)'}`);
    }
    process.exit(bad ? 2 : 0);
  }
  if (cmd === 'add') {
    const id = rest[0];
    if (!okId(id)) { console.error('The id is lowercase letters, digits and dashes, for example: notion'); process.exit(1); }
    const file = flag('file'), url = flag('url');
    if (!!file === !!url) { console.error('Give exactly one of --file x.svg or --url https://... --yes'); process.exit(1); }
    const fidelity = flag('fidelity') || 'approx', rights = flag('rights') || 'pending';
    if (!FIDELITY.includes(fidelity) || !RIGHTS.includes(rights)) { console.error(`fidelity: ${FIDELITY.join('|')}; rights: ${RIGHTS.join('|')}`); process.exit(1); }
    let svg;
    if (file) { if (!fs.existsSync(file)) { console.error(`No such file: ${file}`); process.exit(1); } svg = fs.readFileSync(file, 'utf8'); }
    else {
      if (!/^https:\/\//i.test(url)) { console.error('--url must be https'); process.exit(1); }
      if (!rest.includes('--yes')) { console.error(`This downloads one small SVG from ${url}. Ask the user first (name the file and where it comes from), then add --yes.`); process.exit(1); }
      const res = await fetch(url, { signal: AbortSignal.timeout(20000) }).catch(() => null);
      if (!res || !res.ok) { console.error(`Download failed (${res ? res.status : 'offline'}).`); process.exit(1); }
      svg = await res.text();
    }
    if (!cleanSvg(svg)) { console.error(`That is not a clean SVG (needs an <svg> element, no scripts or handlers, ${MIN_BYTES} bytes to ${MAX_BYTES / 1024} KB).`); process.exit(1); }
    fs.mkdirSync(dirOf(root), { recursive: true }); fs.writeFileSync(path.join(dirOf(root), id + '.svg'), svg);
    const entry = { id, name: flag('name') || id, brand: flag('brand') || '', file: id + '.svg', fidelity, rights, source: flag('source') || (url || ''), notes: flag('notes') || '', added: new Date().toISOString().slice(0, 10) };
    const i = logos.findIndex((x) => x.id === id); if (i >= 0) logos[i] = entry; else logos.push(entry);
    saveLogos(root, logos); console.log(`saved ${row(entry)}`); return;
  }
  if (cmd === 'use' || cmd === 'check') {
    const reelArg = rest[0]; if (!reelArg) { console.error(`usage: logos.mjs ${cmd} <reel> ${cmd === 'use' ? '<id> ...' : ''}`); process.exit(1); }
    const { resolveReelArg } = await import(pathToFileURL(path.join(root, 'publisher', 'scripts', 'reels.mjs')).href);
    const reel = resolveReelArg(reelArg, root);
    const rj = path.join(reel, 'reel.json'); if (!fs.existsSync(rj)) { console.error(`${reel} has no reel.json`); process.exit(1); }
    const data = JSON.parse(fs.readFileSync(rj, 'utf8'));
    if (cmd === 'use') {
      const ids = rest.slice(1); if (!ids.length) { console.error('name at least one logo id'); process.exit(1); }
      for (const id of ids) { const l = logos.find((x) => x.id === id); if (!l) { console.error(`"${id}" is not in the library: add it first`); process.exit(1); } fs.mkdirSync(path.join(reel, 'assets', 'logos'), { recursive: true }); fs.copyFileSync(path.join(dirOf(root), l.file), path.join(reel, 'assets', 'logos', id + '.svg')); }
      data.logos = [...new Set([...(data.logos || []), ...ids])]; fs.writeFileSync(rj, JSON.stringify(data, null, 2) + '\n');
      console.log(`${reel}: logos ${data.logos.join(', ')} (copied to assets/logos/). Draw one with ASSETS.push(['logo_<id>', 'assets/logos/<id>.svg']).`);
    }
    const probs = logoProblems(root, data);
    if (cmd === 'check' || probs.length) console.log(probs.length ? probs.map((p) => 'NOT READY TO POST: ' + p).join('\n') : `Every logo in this reel is approved${(data.logos || []).length ? '' : ' (it uses none)'}.`);
    process.exit(cmd === 'check' && probs.length ? 1 : 0);
  }
  console.error('commands: list, need, add, use, check'); process.exit(1);
}
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) main().catch((e) => { console.error(e.message); process.exit(1); });
