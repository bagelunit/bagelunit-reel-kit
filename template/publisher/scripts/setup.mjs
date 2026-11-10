#!/usr/bin/env node
// Guided setup for this brand's publisher. Run from the brand folder. It writes publisher/wrangler.toml, prints the
// steps in order, and moves the secrets from the kit's token files into Cloudflare without showing them. It never logs
// in to Cloudflare or Meta (the owner logs in) and never prints a token.
//
//   node publisher/scripts/setup.mjs [--api-setup instagram|unified]   write wrangler.toml (once) and show the steps
//   node publisher/scripts/setup.mjs --kv-id <id>                       put the KV namespace id into wrangler.toml
//   node publisher/scripts/setup.mjs secrets [--dry-run] [--only A,B]   send the secrets to Cloudflare (see below)
//   node publisher/scripts/setup.mjs --url <https://...workers.dev>     save the publisher's address for the kit
//   node publisher/scripts/setup.mjs check                              ask the deployed publisher if it is working
//
// secrets: every value comes from a file in ~/.config/bagelunit-reels/ that the connection checks wrote, or that the
// owner pasted into, so no token is ever copied by hand into a terminal:
//   ADMIN_KEY, VERIFY_TOKEN   made here once (random) and kept in publisher-<slug>.json
//   APP_SECRET                publisher-<slug>.json "app_secret" (the owner pastes it; removed once it is sent)
//   IG_TOKEN                  "access_token" from instagram-<slug>.json, or from the shared instagram.json when the
//                             brand has no file of its own (the same rule as the dashboard, content-calendar lib.mjs)
//   IG_USER_ID                "ig_user_id": from instagram-<slug>.json when that is the token file; with the shared
//                             instagram.json, from instagram-<slug>.ids.json instead. An id inside the shared file is
//                             ignored (it may be another brand's). The Instagram check saves it in the right place.
//   THREADS_TOKEN, THREADS_USER_ID   the same rule with threads-<slug>.json / threads.json, "user_id" and
//                             threads-<slug>.ids.json (the Threads check saves the id)
//   FB_PAGE_ID, FB_PAGE_TOKEN facebook-<slug>.json "page_id", "access_token" (after the Facebook check). Only the
//                             brand's own file: a Page token posts to one Page, so a shared facebook.json is not used.
// Each value goes to `npx wrangler secret put <NAME>` on its standard input; wrangler's output is shown with the
// value blanked out.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, readJSON, findBrand, brandSlug, connection, admin, Plain, isMain, CONFIG_DIR } from './lib.mjs';

const writePrivate = (file, data) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 }); try { fs.chmodSync(file, 0o600); } catch {} };

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUB = path.resolve(HERE, '..');
const PLACEHOLDER = 'REPLACE_WITH_KV_ID';

export const names = (slug) => ({ worker: `${slug}-publisher`.slice(0, 63), bucket: `${slug}-reels`.slice(0, 63) });

// Fill the template. An existing wrangler.toml is never overwritten (it may hold your live switches); only the KV id
// placeholder is replaced when you pass --kv-id.
export function writeToml({ slug, pubDir = PUB, apiSetup = 'instagram', kvId = null }) {
  const file = path.join(pubDir, 'wrangler.toml');
  if (kvId && !/^[0-9a-f]{32}$/.test(kvId)) throw new Plain('--kv-id is the 32-character id wrangler printed when it made the namespace');
  if (!['instagram', 'unified'].includes(apiSetup)) throw new Plain('--api-setup is instagram or unified');
  if (fs.existsSync(file)) {
    const text = fs.readFileSync(file, 'utf8');
    if (kvId && text.includes(PLACEHOLDER)) { fs.writeFileSync(file, text.replace(PLACEHOLDER, kvId)); return { file, wrote: 'kv id' }; }
    return { file, wrote: null };
  }
  const n = names(slug);
  const text = fs.readFileSync(path.join(pubDir, 'wrangler.template.toml'), 'utf8')
    .replaceAll('{{WORKER}}', n.worker).replaceAll('{{SLUG}}', slug).replaceAll('{{API_SETUP}}', apiSetup)
    .replaceAll('{{KV_ID}}', kvId || PLACEHOLDER).replaceAll('{{BUCKET}}', n.bucket);
  fs.writeFileSync(file, text);
  return { file, wrote: 'wrangler.toml' };
}

export function steps({ slug, apiSetup = 'instagram', kvReady = false, configDir = CONFIG_DIR }) {
  const n = names(slug);
  const file = path.join(configDir, `publisher-${slug}.json`);
  const s = [];
  const step = (title, ...cmds) => s.push(`${s.length + 1}. ${title}${cmds.map((c) => `\n     ${c}`).join('')}`);
  step('Every command below runs in the publisher folder:', 'cd publisher');
  step('Log in to Cloudflare (a free account is enough). It opens the browser: the owner logs in, Claude (with the browser tool) or the owner clicks Allow:', 'npx wrangler login');
  if (!kvReady) step('Make the storage for posts and replies, then put the id it prints into wrangler.toml:', 'npx wrangler kv namespace create KV', 'node scripts/setup.mjs --kv-id <the id it printed>');
  step('Make the storage for the video files:', `npx wrangler r2 bucket create ${n.bucket}`);
  step('Put the publisher online (it needs to exist before it can hold secrets). It prints its address (https://...workers.dev):', 'npx wrangler deploy');
  step(`Save that address for the kit (it goes into ${file} next to the admin key):`, 'node scripts/setup.mjs --url <the address deploy printed>');
  step(`Only for keyword replies: the owner pastes the Meta app secret into ${file} as "app_secret" (App settings, Basic, App secret, Show). The browser tool opens that page and stops before Show.`);
  step(`Send the secrets to Cloudflare. It reads them from the token files in ${configDir}, makes ADMIN_KEY and VERIFY_TOKEN once (kept in ${file}), and never shows a value. Run it with --dry-run first to see what it will send:`,
    'node scripts/setup.mjs secrets --dry-run', 'node scripts/setup.mjs secrets',
    `(it runs npx wrangler secret put ADMIN_KEY, VERIFY_TOKEN, APP_SECRET, IG_USER_ID, IG_TOKEN (${apiSetup === 'unified' ? 'the never-expiring Unified Login token' : 'the Instagram Login token'}), and FB_PAGE_ID, FB_PAGE_TOKEN, THREADS_USER_ID, THREADS_TOKEN when those are connected)`);
  step('Check it works (it shows each platform and its mode, never the key):', 'node scripts/setup.mjs check');
  step('Optional, keyword replies: the webhook in the Meta app (docs/connect.md step 7) and the rules:',
    'cp rules.example.json rules.json      (then /comment-responder fills it)', 'npx wrangler kv key put rules --path rules.json --binding KV --remote');
  return `Setting up the publisher for ${slug} (worker ${n.worker}, files in ${n.bucket}). Everything starts in dry run.\n\n${s.join('\n\n')}\n\nGoing live is a separate step for each platform: see "Going live" in publisher/README.md.`;
}

// ---------- secrets ----------
// Which secrets can be sent and from where. Values are only read here, never returned to a caller that prints.
export function secretPlan({ slug, configDir = CONFIG_DIR, make = true }) {
  const f = (name) => path.join(configDir, `${name}-${slug}.json`);
  const pubFile = f('publisher');
  const pub = readJSON(pubFile, {}) || {};
  let made = [];
  if (make) {
    for (const k of ['admin_key', 'verify_token']) if (!pub[k]) { pub[k] = randomBytes(32).toString('hex'); made.push(k); }
    if (made.length) writePrivate(pubFile, pub);
  }
  // the token file: the brand's own <name>-<slug>.json first, then the shared <name>.json
  const tokenFile = (name) => [f(name), path.join(configDir, `${name}.json`)].find((x) => fs.existsSync(x)) || f(name);
  const shared = (name, file) => path.basename(file) === `${name}.json`;
  const idsFile = (name) => path.join(configDir, `${name}-${slug}.ids.json`);
  const account = (name, key) => {
    const file = tokenFile(name); const cfg = readJSON(file, {}) || {};
    const own = !shared(name, file);
    const idFrom = own ? file : idsFile(name);
    const id = own ? cfg[key] : (readJSON(idFrom, {}) || {})[key];        // an id inside the shared file is never used
    return { file, cfg, id, idFrom };
  };
  const ig = account('instagram', 'ig_user_id'); const th = account('threads', 'user_id');
  const fb = readJSON(f('facebook'), {}) || {};
  const row = (name, value, from, why) => ({ name, value: value ? String(value) : '', from, why });
  return {
    made, pubFile,
    rows: [
      row('ADMIN_KEY', pub.admin_key, pubFile, 'made by this script'),
      row('VERIFY_TOKEN', pub.verify_token, pubFile, 'made by this script; the same value goes in the Meta webhook settings'),
      row('APP_SECRET', pub.app_secret, pubFile, 'paste "app_secret" there; only needed for keyword replies'),
      row('IG_USER_ID', ig.id, ig.idFrom, `run the Instagram check first (/content-calendar connect instagram): it saves the id in ${ig.idFrom}`),
      row('IG_TOKEN', ig.cfg.access_token, ig.file, 'docs/connect.md step 2'),
      row('FB_PAGE_ID', fb.access_token && !fb.user_token ? fb.page_id : '', f('facebook'), 'only for Facebook; run the Facebook check first'),
      row('FB_PAGE_TOKEN', fb.user_token ? '' : fb.access_token, f('facebook'), 'only for Facebook; run the Facebook check first'),
      row('THREADS_USER_ID', th.id, th.idFrom, `only for Threads; run the Threads check first (/content-calendar connect threads): it saves the id in ${th.idFrom}`),
      row('THREADS_TOKEN', th.cfg.app_secret ? '' : th.cfg.access_token, th.file, 'only for Threads; run the Threads check first'),
    ],
  };
}

const runWrangler = (name, value, cwd) => spawnSync('npx', ['wrangler', 'secret', 'put', name], { cwd, input: value, encoding: 'utf8', shell: process.platform === 'win32' });

// Send each available secret through wrangler's standard input. `run` is replaceable for tests.
export function sendSecrets({ slug, configDir = CONFIG_DIR, pubDir = PUB, only = null, dryRun = false, run = runWrangler, log = console.log }) {
  const plan = secretPlan({ slug, configDir, make: !dryRun });
  const want = only ? new Set(only) : null;
  for (const k of plan.made) log(`Made ${k.toUpperCase()} and kept it in ${plan.pubFile} (readable by you only).`);
  const sent = [], skipped = [], failed = [];
  for (const r of plan.rows) {
    if (want && !want.has(r.name)) continue;
    if (!r.value) { skipped.push(r.name); log(`  ${r.name.padEnd(16)} skipped: nothing in ${r.from} yet (${r.why})`); continue; }
    if (dryRun) { log(`  ${r.name.padEnd(16)} would be sent, from ${r.from}`); continue; }
    const res = run(r.name, r.value, pubDir);
    const out = `${res.stdout || ''}${res.stderr || ''}`.split(r.value).join('***').trim().split('\n').filter(Boolean).slice(-2).join(' / ');
    if (res.status === 0) { sent.push(r.name); log(`  ${r.name.padEnd(16)} sent to Cloudflare`); }
    else { failed.push(r.name); log(`  ${r.name.padEnd(16)} NOT sent: ${out || res.error?.message || 'wrangler failed'}`); }
  }
  // the app secret has done its job once Cloudflare holds it: take it off this computer
  if (!dryRun && sent.includes('APP_SECRET')) {
    const pub = readJSON(plan.pubFile, {}); delete pub.app_secret; writePrivate(plan.pubFile, pub);
    log(`Removed the app secret from ${plan.pubFile}: Cloudflare has it now.`);
  }
  return { sent, skipped, failed };
}

export function saveUrl({ slug, url, configDir = CONFIG_DIR }) {
  if (!/^https:\/\/[^\s/]+\.[^\s/]+\/?$/.test(String(url || ''))) throw new Plain('--url takes the address wrangler deploy printed, e.g. https://brand-publisher.you.workers.dev');
  const file = path.join(configDir, `publisher-${slug}.json`);
  const pub = readJSON(file, {}) || {};
  pub.url = String(url).replace(/\/+$/, '');
  writePrivate(file, pub);
  return file;
}

export async function check({ root, fetchImpl = fetch, configDir = CONFIG_DIR, log = console.log }) {
  const conn = connection(brandSlug(root), configDir);
  const a = await admin(conn, 'GET', '/admin', { fetchImpl });
  log(`The publisher at ${conn.url} answers. Brand ${a.brand || '(not set)'}, ${a.api_setup} login, Graph ${a.graph_version}.`);
  for (const [p, v] of Object.entries(a.platforms || {})) log(`  ${p.padEnd(10)} ${v.configured ? 'connected' : 'not connected (its id or token secret is missing)'}, ${v.mode === 'live' ? 'LIVE' : 'dry run'}`);
  log(`  comments   auto-replies ${a.mode === 'live' ? 'LIVE' : 'dry run'}, ${a.rules?.length || 0} rule(s)${a.rules_error ? `, rules problem: ${a.rules_error}` : ''}`);
  return a;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = findBrand(process.cwd());
  if (!root) throw new Plain('Run this inside the brand folder (where brand/brand.json is).');
  const slug = brandSlug(root, readJSON(path.join(root, 'brand', 'brand.json'), {}));
  if (args._[0] === 'check') return check({ root });
  if (args._[0] === 'secrets') {
    const only = typeof args.only === 'string' ? args.only.split(',').map((x) => x.trim().toUpperCase()).filter(Boolean) : null;
    const r = sendSecrets({ slug, only, dryRun: args['dry-run'] === true });
    if (args['dry-run'] !== true) console.log(`${r.sent.length} sent${r.skipped.length ? `, ${r.skipped.length} skipped` : ''}${r.failed.length ? `, ${r.failed.length} NOT sent (run npx wrangler login, then this again)` : ''}. Each secret is live as soon as it is sent.`);
    if (r.failed.length) process.exitCode = 1;
    return;
  }
  if (typeof args.url === 'string') { console.log(`Saved the publisher's address in ${saveUrl({ slug, url: args.url })}.`); return; }
  const r = writeToml({ slug, apiSetup: args['api-setup'] === 'unified' ? 'unified' : (args['api-setup'] && args['api-setup'] !== true ? args['api-setup'] : 'instagram'), kvId: typeof args['kv-id'] === 'string' ? args['kv-id'] : null });
  if (r.wrote) console.log(`Wrote ${r.wrote === 'kv id' ? 'the KV id into ' : ''}${r.file}`);
  const toml = fs.readFileSync(r.file, 'utf8');
  if (args['kv-id']) return;
  console.log('\n' + steps({ slug, apiSetup: /API_SETUP = "unified"/.test(toml) ? 'unified' : 'instagram', kvReady: !toml.includes(PLACEHOLDER) }));
}

if (isMain(import.meta.url)) {
  main().catch((e) => { console.error(e instanceof Plain ? e.message : `Unexpected error: ${e?.message || e}`); process.exit(1); });
}
