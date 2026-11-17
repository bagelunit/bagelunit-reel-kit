#!/usr/bin/env node
// suggest.mjs · the optional outside tools the kit suggests, and which of them this brand has. The kit works on its own code with
// none of them; this only shows the catalog (studio/suggestions.json), records the owner's answers in brand/brand.json "tools", and
// powers the one-line tips (tools/tips.mjs). Existence checks only: a command on PATH, an app path, a non-empty key FILE (its
// contents are never read), an MCP server named by `claude mcp list` (skipped quietly when `claude` is not there), and what the
// owner declared. No network, no telemetry, nothing is sent anywhere.
//   kit suggest                       the catalog by category, with each tool's status and what it adds
//   kit suggest <id>                  one tool: what you get, an example, how to connect it step by step
//   kit suggest --have a,b | --none | --other "text"     record the answers (they replace the earlier answers)
//   kit suggest --dismiss <id|category> | --undismiss <id|category>
//   kit suggest --json                the same as data, for the /suggested-tools skill
//   node tools/suggest.mjs tip <step>   print the tip for a step (start, cover, sound, export, render, voice), for other tools to call
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const CATALOG_FILE = path.join(HERE, '..', 'suggestions.json');

export const loadCatalog = () => JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf8'));
export const allTools = (catalog) => catalog.categories.flatMap((c) => c.tools.map((t) => ({ ...t, category: c.id })));

// the brand folder: the nearest folder above `start` holding brand/brand.json
export function findBrandDir(start) {
  for (let d = path.resolve(start || process.cwd()); ; d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, 'brand', 'brand.json'))) return d;
    if (path.dirname(d) === d) return null;
  }
}

const today = () => { const t = new Date(), p = (n) => String(n).padStart(2, '0'); return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`; };
const strings = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()) : []);
const uniq = (a) => [...new Set(a)];

/* ── the saved answers: brand/brand.json "tools" ─────────────────────────────────────────────────────────────────────── */
export function readBrandJson(brandDir) {
  const file = path.join(brandDir, 'brand', 'brand.json');
  const raw = fs.readFileSync(file, 'utf8');
  const data = JSON.parse(raw);   // a file that does not parse is never rewritten
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('brand/brand.json is not a JSON object');
  return { file, data };
}

export function stateOf(data) {
  const t = data && typeof data.tools === 'object' && data.tools && !Array.isArray(data.tools) ? data.tools : {};
  return {
    have: strings(t.have), none: t.none === true, other: strings(t.other), dismissed: strings(t.dismissed),
    asked: typeof t.asked === 'string' ? t.asked : '', tips: t.tips !== false,
  };
}

export function writeBrandTools(brandDir, change) {
  const { file, data } = readBrandJson(brandDir);
  const now = stateOf(data), prev = data.tools && typeof data.tools === 'object' && !Array.isArray(data.tools) ? data.tools : {};
  data.tools = { ...prev, ...now, ...change };
  const body = JSON.stringify(data, null, 2) + '\n';
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, body);
  fs.renameSync(tmp, file);
  if (!fs.readFileSync(file, 'utf8').trim()) throw new Error('brand/brand.json came out empty');   // read it back
  return data.tools;
}

/* ── detection: existence only ───────────────────────────────────────────────────────────────────────────────────────── */
const expand = (p) => path.normalize(String(p).replace(/^~(?=$|[\\/])/, os.homedir()));

export function onPath(cmd, env = process.env) {
  const exts = process.platform === 'win32' ? ['', ...String(env.PATHEXT || '.EXE;.CMD;.BAT').split(';')] : [''];
  for (const dir of String(env.PATH || env.Path || '').split(path.delimiter).filter(Boolean))
    for (const ext of exts) {
      try { if (fs.statSync(path.join(dir, cmd + ext)).isFile()) return true; } catch { /* not here */ }
    }
  return false;
}

// the MCP server names `claude mcp list` prints, as { name, ok }, or null when the command is missing or fails (skipped quietly)
export function mcpServers(timeoutMs = 8000) {
  if (!onPath('claude')) return null;
  const r = spawnSync('claude', ['mcp', 'list'], { encoding: 'utf8', timeout: timeoutMs, shell: process.platform === 'win32', stdio: ['ignore', 'pipe', 'ignore'] });
  if (r.error || r.status !== 0) return null;
  const out = [];
  for (const line of String(r.stdout || '').split(/\r?\n/)) {
    const m = line.match(/^(.*?):\s+(\S.*)$/);
    if (m) out.push({ name: m[1].trim().toLowerCase(), ok: !/needs authentication|failed|error/i.test(m[2]) });
  }
  return out;
}

// what shows a tool is here: a list of reasons ([] = nothing found). mcp = the list from mcpServers() (null = unknown)
export function detectTool(tool, mcp = null) {
  const d = tool.detect || {}, found = [];
  if (d.command && onPath(d.command)) found.push(`command ${d.command}`);
  // BAGELUNIT_SUGGEST_IGNORE_PATHS=1 skips the app-path check (the tests use it so a real install on the machine does not matter)
  if (process.env.BAGELUNIT_SUGGEST_IGNORE_PATHS !== '1') for (const p of [].concat(d.paths || [])) { if (fs.existsSync(expand(p))) { found.push('app installed'); break; } }
  for (const f of [].concat(d.file || [])) {
    try { if (fs.statSync(expand(f)).size > 0) { found.push('key file saved'); break; } } catch { /* absent */ }   // size only: the contents are never read
  }
  if (d.mcp && mcp) {
    const hit = mcp.find((s) => s.name.split(/[^a-z0-9]+/).includes(d.mcp) || s.name.includes(d.mcp));
    if (hit && hit.ok) found.push('connector in Claude');
  }
  return found;
}

// every tool with its status: connected (found here, or declared by the owner), dismissed, or not connected
export function statusAll(catalog, state, mcp = null) {
  return allTools(catalog).map((t) => {
    const via = detectTool(t, mcp);
    if (state.have.includes(t.id)) via.push('you said you have it');
    const status = via.length ? 'connected' : state.dismissed.includes(t.id) || state.dismissed.includes(t.category) ? 'dismissed' : 'not connected';
    return { ...t, status, via };
  });
}

/* ── the screens ─────────────────────────────────────────────────────────────────────────────────────────────────────── */
const mark = { connected: '[connected]    ', dismissed: '[dismissed]    ', 'not connected': '[not connected]' };

function listing(catalog, rows, state) {
  const lines = ['Optional tools: the kit works on its own code without any of them. These only add things.',
    'Nothing is sent anywhere; your answers are saved only in this brand folder (brand/brand.json).', ''];
  for (const c of catalog.categories) {
    lines.push(`${c.title}  (${c.question})`);
    for (const t of rows.filter((r) => r.category === c.id)) {
      lines.push(`  ${mark[t.status]} ${t.name}: ${t.example}`);
      lines.push(`                  kit suggest ${t.id}${t.via.length ? `   (${t.via.join(', ')})` : ''}`);
    }
    lines.push('');
  }
  lines.push(state.asked ? `Last asked ${state.asked}${state.none ? ' (you said none of these)' : ''}${state.other.length ? `; you also use: ${state.other.join(', ')}` : ''}.`
    : 'Not asked yet: run /suggested-tools, or  kit suggest --have a,b  /  --none  /  --other "what you use".');
  lines.push('Dismiss one: kit suggest --dismiss <id>. Tips off: set tools.tips to false in brand/brand.json, or BAGELUNIT_NO_TIPS=1.');
  return lines.join('\n');
}

function detail(t) {
  const lines = [`${t.name}  [${t.status}${t.via.length ? `: ${t.via.join(', ')}` : ''}]`, '',
    `What you get: ${t.what_you_get}`, `For example: ${t.example}`, `Kind: ${{ key: 'an API key in a file', mcp: 'a connector in Claude', download: 'download by hand', app: 'an app or account' }[t.kind] || t.kind}`];
  if (t.url) lines.push(`Site: ${t.url} (check it for the current price, plan and licence terms)`);
  lines.push('', 'How to connect it:', ...t.connect.map((s, i) => `  ${i + 1}. ${s}`), '',
    'It is optional: the kit works without it. Nothing is sent anywhere. Not for you? kit suggest --dismiss ' + t.id);
  return lines.join('\n');
}

/* ── the command ─────────────────────────────────────────────────────────────────────────────────────────────────────── */
function parse(args) {
  const flags = {}, loose = [];
  for (let i = 0; i < args.length; i++) {
    if (!args[i].startsWith('--')) { loose.push(args[i]); continue; }
    const next = args[i + 1], takes = next !== undefined && !next.startsWith('--');
    flags[args[i].slice(2)] = takes ? next : true;
    if (takes) i++;
  }
  return { flags, loose };
}

export async function cli(args, { cwd = process.cwd(), out = (s) => console.log(s), err = (s) => console.error(s) } = {}) {
  const { flags, loose } = parse(args);
  const catalog = loadCatalog(), tools = allTools(catalog);
  const brandDir = typeof flags.brand === 'string' ? path.resolve(flags.brand) : findBrandDir(cwd);
  const fail = (m) => { err(`kit suggest: ${m}`); return 1; };
  const known = (id) => tools.some((t) => t.id === id) || catalog.categories.some((c) => c.id === id);
  const idsOf = (v) => String(v === true ? '' : v).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

  if (loose[0] === 'tip') {   // node tools/suggest.mjs tip voice
    const { printTip } = await import(pathToFileURL(path.join(HERE, 'tips.mjs')).href);
    if (!loose[1]) return fail('usage: tip <start|cover|sound|export|render|voice>');
    printTip(loose[1], { brandDir, flags });
    return 0;
  }

  const writes = ['have', 'none', 'other', 'dismiss', 'undismiss'].filter((k) => k in flags);
  let state = { have: [], none: false, other: [], dismissed: [], asked: '', tips: true };
  if (brandDir) { try { state = stateOf(readBrandJson(brandDir).data); } catch (e) { if (writes.length) return fail(e.message); } }

  if (writes.length) {
    if (!brandDir) return fail('run it inside a brand folder (the one holding brand/brand.json)');
    const change = {};
    if ('have' in flags || 'none' in flags || 'other' in flags) {
      const have = 'have' in flags ? idsOf(flags.have) : [];
      const bad = have.filter((id) => !tools.some((t) => t.id === id));
      if (bad.length) return fail(`unknown tool id: ${bad.join(', ')}. Known: ${tools.map((t) => t.id).join(', ')}`);
      if ('have' in flags && 'none' in flags) return fail('--have and --none together make no sense: pick one');
      change.have = uniq(have);
      change.none = 'none' in flags;
      change.other = 'other' in flags ? uniq(String(flags.other === true ? '' : flags.other).split(/[,;]/).map((s) => s.trim()).filter(Boolean)) : [];
      change.asked = today();
    }
    for (const [flag, adding] of [['dismiss', true], ['undismiss', false]]) {
      if (!(flag in flags)) continue;
      const ids = idsOf(flags[flag]);
      if (!ids.length) return fail(`--${flag} takes a tool id or a category id`);
      const bad = ids.filter((id) => !known(id));
      if (bad.length) return fail(`unknown id: ${bad.join(', ')}`);
      const current = change.dismissed || state.dismissed;
      change.dismissed = adding ? uniq([...current, ...ids]) : current.filter((x) => !ids.includes(x));
    }
    let saved;
    try { saved = writeBrandTools(brandDir, change); } catch (e) { return fail(e.message); }
    state = stateOf({ tools: saved });
    out(`saved in brand/brand.json (nothing is sent anywhere): have ${state.have.join(', ') || 'none'}${state.none ? ' (none of these)' : ''}${state.other.length ? `; other: ${state.other.join(', ')}` : ''}${state.dismissed.length ? `; dismissed: ${state.dismissed.join(', ')}` : ''}`);
    return 0;
  }

  const rows = statusAll(catalog, state, mcpServers());
  if (flags.json) {
    out(JSON.stringify({
      version: catalog.version, brand: brandDir ? 'found' : 'none', state, baseline: catalog.baseline,
      connected: rows.filter((r) => r.status === 'connected').map((r) => r.id),
      categories: catalog.categories.map((c) => ({
        id: c.id, title: c.title, question: c.question,
        tools: rows.filter((r) => r.category === c.id).map((r) => ({ id: r.id, name: r.name, status: r.status, via: r.via, kind: r.kind, url: r.url, what_you_get: r.what_you_get, example: r.example, connect: r.connect })),
      })),
    }, null, 2));
    return 0;
  }
  if (loose[0]) {
    const t = rows.find((r) => r.id === loose[0].toLowerCase());
    if (!t) return fail(`no tool "${loose[0]}". Known: ${tools.map((x) => x.id).join(', ')}`);
    out(detail(t));
    return 0;
  }
  out(listing(catalog, rows, state));
  return 0;
}

const isMain = (() => {
  try { return fs.realpathSync.native(process.argv[1]) === fs.realpathSync.native(fileURLToPath(import.meta.url)); } catch { return false; }
})();
if (isMain) cli(process.argv.slice(2)).then((code) => { process.exitCode = code; });   // no top-level await: tips.mjs imports this file
