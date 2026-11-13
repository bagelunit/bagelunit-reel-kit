#!/usr/bin/env node
// Guided setup for this brand's publisher. Run from the brand folder. It writes publisher/wrangler.toml, prints the
// steps in order, and moves the secrets from the kit's token files into Cloudflare without showing them. It never logs
// in to Cloudflare or Meta (the owner logs in) and never prints a token.
//
//   node publisher/scripts/setup.mjs [--api-setup instagram|unified]   write wrangler.toml (once) and show the steps
//   node publisher/scripts/setup.mjs --kv-id <id>                       put the KV namespace id into wrangler.toml
//   node publisher/scripts/setup.mjs secrets [--dry-run] [--only A,B]   send the secrets to Cloudflare (see below)
//   node publisher/scripts/setup.mjs deploy [--anyway]                  put the publisher online (npx wrangler deploy): counts
//                                                                       the cron triggers already on the Cloudflare account
//                                                                       first, and tries once more on "This Worker does not exist"
//   node publisher/scripts/setup.mjs --url <https://...workers.dev>     save the publisher's address for the kit
//   node publisher/scripts/setup.mjs check                              ask the deployed publisher if it is working
//   node publisher/scripts/setup.mjs subscribe [--dry-run]              turn on Meta's comment and message notifications
//   node publisher/scripts/setup.mjs follow-check [<id>]                 ask Meta whether a person who messaged the account follows it
//                                                                        (no id: the newest person who messaged); the test before a require_follow rule goes live
//                                                                       for this brand's Instagram account (keyword replies)
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
//   YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN   youtube-<slug>.json "client_id", "client_secret", "refresh_token"
//                             (the owner pastes the first two, video-login.mjs youtube writes the third). When the
//                             brand's own file is missing or has no token yet, the BagelUnit Video Kit's
//                             ~/.config/bagelunit-video/youtube-<slug>.json is used, but only when its "scope" is
//                             youtube.upload alone. A file (either folder) that holds youtube.force-ssl or any other
//                             scope beyond upload is never sent: Cloudflare only ever holds a token that can upload.
//   TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, TIKTOK_REFRESH_TOKEN   tiktok-<slug>.json "client_key", "client_secret",
//                             "refresh_token" (video-login.mjs tiktok writes the last)
// Each value goes to `npx wrangler secret put <NAME>` on its standard input; wrangler's output is shown with the
// value blanked out. A value that is still the PASTE-... placeholder of docs/connect.md is skipped, never sent.
//
// The publisher needs Instagram Login (docs/connect.md 2A) or Unified Login (2B). An instagram-<slug>.json with
// "login": "facebook" (the older Page-linked setup) is refused: its 60-day Facebook user token is never renewed.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, readJSON, findBrand, brandSlug, connection, admin, Plain, isMain, CONFIG_DIR, videoConfigFor, youtubeCredentials } from './lib.mjs';

const writePrivate = (file, data) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 }); try { fs.chmodSync(file, 0o600); } catch {} };

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUB = path.resolve(HERE, '..');
const PLACEHOLDER = 'REPLACE_WITH_KV_ID';

// The KV namespace is named per brand (<slug>-kv), so several brands fit in one Cloudflare account. The binding in
// wrangler.toml stays "KV", so a publisher set up earlier with a namespace called KV keeps working unchanged.
export const names = (slug) => ({ worker: `${slug}-publisher`.slice(0, 63), bucket: `${slug}-reels`.slice(0, 63), kv: `${slug}-kv`.slice(0, 63) });

// The Instagram token file the dashboard and the publisher share: the brand's own first, then the shared one.
const igFile = (slug, configDir) => [path.join(configDir, `instagram-${slug}.json`), path.join(configDir, 'instagram.json')].find((x) => fs.existsSync(x)) || null;
// Which Instagram setup the token file says, so the publisher is set up to match it
export function loginOf(slug, configDir = CONFIG_DIR) {
  const f = igFile(slug, configDir);
  const login = f ? String((readJSON(f, {}) || {}).login || 'instagram') : null;
  return { file: f, login: ['unified', 'facebook'].includes(login) ? login : (f ? 'instagram' : null) };
}
const FB_REFUSED = 'the publisher needs Instagram Login (docs/connect.md step 2A) or Unified Login (step 2B). This brand\'s Instagram file says "login": "facebook" (the older Page-linked setup): its token is a 60-day Facebook user token that nothing renews, so the publisher would stop without warning. Connect with 2A or 2B, then run this again';
export const isPlaceholder = (v) => /^PASTE-/i.test(String(v || '').trim());

// Fill the template. An existing wrangler.toml is never overwritten (it may hold your live switches); only the KV id
// placeholder is replaced when you pass --kv-id.
export function writeToml({ slug, pubDir = PUB, apiSetup = 'instagram', kvId = null }) {
  const file = path.join(pubDir, 'wrangler.toml');
  if (kvId && !/^[0-9a-f]{32}$/.test(kvId)) throw new Plain('--kv-id is the 32-character id wrangler printed when it made the namespace');
  if (apiSetup === 'facebook') throw new Plain(FB_REFUSED);
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
  if (!kvReady) step('Make the storage for posts and replies, then put the id it prints into wrangler.toml:', `npx wrangler kv namespace create ${n.kv}`, 'node scripts/setup.mjs --kv-id <the id it printed>');
  step('Turn on R2, the file storage, once per Cloudflare account (free up to 10 GB a month, but Cloudflare asks for a card and bills use above the free amount). In the Cloudflare dashboard: Storage & databases, R2, Overview. Claude (with the browser tool) opens it and stops at the payment form; the owner enters the card and confirms, or stops here.');
  step('Make the storage for the video files:', `npx wrangler r2 bucket create ${n.bucket}`);
  step('Put the publisher online (it needs to exist before it can hold secrets). It first counts the cron triggers already used on the Cloudflare account (the free plan allows 5 for all its workers together, and this publisher needs 1), then runs npx wrangler deploy and prints the address (https://...workers.dev):', 'node scripts/setup.mjs deploy');
  step(`Save that address for the kit (it goes into ${file} next to the admin key):`, 'node scripts/setup.mjs --url <the address deploy printed>');
  step(`Only for keyword replies: the owner pastes the Meta app secret into ${file} as "app_secret" (App settings, Basic, App secret, Show). The browser tool opens that page and stops before Show.`);
  step(`Send the secrets to Cloudflare. It reads them from the token files in ${configDir}, makes ADMIN_KEY and VERIFY_TOKEN once (kept in ${file}), and never shows a value. Run it with --dry-run first to see what it will send:`,
    'node scripts/setup.mjs secrets --dry-run', 'node scripts/setup.mjs secrets',
    `(it runs npx wrangler secret put ADMIN_KEY, VERIFY_TOKEN, APP_SECRET, IG_USER_ID, IG_TOKEN (${apiSetup === 'unified' ? 'the never-expiring Unified Login token' : 'the Instagram Login token'}), and FB_PAGE_ID, FB_PAGE_TOKEN, THREADS_USER_ID, THREADS_TOKEN, YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN, TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, TIKTOK_REFRESH_TOKEN when those are connected)`);
  step('Only for YouTube Shorts and TikTok: the one-time sign-in (docs/connect.md steps 6B and 6C). The owner signs in and says Allow in the browser; the refresh token goes into a file, never onto the screen, and the secrets command above sends it:',
    'node scripts/video-login.mjs youtube', 'node scripts/video-login.mjs tiktok');
  step('Check it works (it shows each platform and its mode, never the key):', 'node scripts/setup.mjs check');
  step('Optional, keyword replies: the webhook in the Meta app (docs/connect.md step 7), turning on the notifications for this brand\'s Instagram account, and the rules:',
    'node scripts/setup.mjs subscribe --dry-run', 'node scripts/setup.mjs subscribe',
    'cp rules.example.json rules.json      (then /comment-responder fills it)', 'npx wrangler kv key put rules --path rules.json --binding KV --remote');
  return `Setting up the publisher for ${slug} (worker ${n.worker}, files in ${n.bucket}). Everything starts in dry run.\n\n${s.join('\n\n')}\n\nGoing live is a separate step for each platform: see "Going live" in publisher/README.md.`;
}

// ---------- secrets ----------
// Which secrets can be sent and from where. Values are only read here, never returned to a caller that prints.
export function secretPlan({ slug, configDir = CONFIG_DIR, videoDir = videoConfigFor(configDir), make = true }) {
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
  // YouTube: the brand's own file, or the Video Kit's when it is upload-only (lib.mjs youtubeCredentials)
  const ytc = youtubeCredentials(slug, configDir, videoDir); const yt = ytc.cfg || {};
  const tt = readJSON(f('tiktok'), {}) || {};
  // a value still holding the PASTE-... placeholder is not a token: it is skipped and named, never sent
  const row = (name, value, from, why) => (isPlaceholder(value)
    ? { name, value: '', from, why: `it still holds the PASTE-... placeholder: paste the real value in ${from} first` }
    : { name, value: value ? String(value) : '', from, why });
  // a YouTube file that can do more than upload is refused: none of its three values goes to Cloudflare
  const ytRow = (name, value, why) => (ytc.refused && value && !isPlaceholder(value)
    ? { name, value: '', from: ytc.file, why, refused: ytc.refused }
    : row(name, value, ytc.file, why));
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
      ytRow('YT_CLIENT_ID', yt.client_id, 'only for YouTube; docs/connect.md step 6B'),
      ytRow('YT_CLIENT_SECRET', yt.client_secret, 'only for YouTube; docs/connect.md step 6B'),
      ytRow('YT_REFRESH_TOKEN', yt.refresh_token, 'only for YouTube; run  node publisher/scripts/video-login.mjs youtube  first'),
      row('TIKTOK_CLIENT_KEY', tt.client_key, f('tiktok'), 'only for TikTok; docs/connect.md step 6C'),
      row('TIKTOK_CLIENT_SECRET', tt.client_secret, f('tiktok'), 'only for TikTok; docs/connect.md step 6C'),
      row('TIKTOK_REFRESH_TOKEN', tt.refresh_token, f('tiktok'), 'only for TikTok; run  node publisher/scripts/video-login.mjs tiktok  first'),
    ],
  };
}

const runWrangler = (name, value, cwd) => spawnSync('npx', ['wrangler', 'secret', 'put', name], { cwd, input: value, encoding: 'utf8', shell: process.platform === 'win32' });

// Send each available secret through wrangler's standard input. `run` is replaceable for tests.
export function sendSecrets({ slug, configDir = CONFIG_DIR, videoDir = videoConfigFor(configDir), pubDir = PUB, only = null, dryRun = false, run = runWrangler, log = console.log }) {
  const plan = secretPlan({ slug, configDir, videoDir, make: !dryRun });
  const want = only ? new Set(only) : null;
  for (const k of plan.made) log(`Made ${k.toUpperCase()} and kept it in ${plan.pubFile} (readable by you only).`);
  const sent = [], skipped = [], failed = [], refused = [];
  let refusedSaid = false;
  for (const r of plan.rows) {
    if (want && !want.has(r.name)) continue;
    if (r.refused) {
      refused.push(r.name);
      log(`  ${r.name.padEnd(16)} ${dryRun ? 'would NOT be sent' : 'NOT sent'}: ${refusedSaid ? 'the same YouTube file' : r.refused}`);
      refusedSaid = true; continue;
    }
    if (!r.value && dryRun && /^made by this script/.test(r.why)) { log(`  ${r.name.padEnd(16)} would be made now (kept in ${r.from}) and sent`); continue; }
    if (!r.value) { skipped.push(r.name); log(`  ${r.name.padEnd(16)} skipped: nothing in ${r.from} yet (${r.why})`); continue; }
    if (dryRun) { log(`  ${r.name.padEnd(16)} would be sent, from ${r.from}`); continue; }
    if (r.name === 'YT_REFRESH_TOKEN' && path.dirname(r.from) !== configDir) log(`  (YouTube: this brand has no sign-in of its own, so the Video Kit's upload-only ${r.from} is used)`);
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
  return { sent, skipped, failed, refused };
}

// ---------- deploy: count the account's cron triggers, then npx wrangler deploy ----------
// Cloudflare's free plan allows 5 cron triggers per account, for all its workers together (not 5 per brand: other
// workers on the same account use them too). Before deploying, this counts the triggers already in use with the
// Cloudflare login wrangler already has (wrangler whoami --json for the account, wrangler auth token --json for the
// token, then Cloudflare's API: the account's workers and each one's schedules). The token stays in this process, goes
// in the Authorization header only and is blanked from any message; nothing new is asked of the owner. When it cannot
// count (not logged in, several accounts, no answer), it says so and deploys anyway, so a cron limit error is explained.
// The first deploy of a new worker can fail with "This Worker does not exist" (code 10007) while Cloudflare is still
// making it; a second deploy works, so that one error is tried once more after a short wait.
export const FREE_CRON_LIMIT = 5;
const CF_API = 'https://api.cloudflare.com/client/v4';
export const cronsIn = (toml) => { const m = /^\s*crons\s*=\s*\[([^\]]*)\]/m.exec(toml || ''); return m ? (m[1].match(/"[^"]*"|'[^']*'/g) || []).length : 0; };
const tomlValue = (toml, key) => (new RegExp(`^\\s*${key}\\s*=\\s*"([^"]+)"`, 'm').exec(toml || '') || [])[1] || null;
const jsonIn = (text) => { const s = String(text || ''); const i = s.indexOf('{'); if (i < 0) return null; try { return JSON.parse(s.slice(i, s.lastIndexOf('}') + 1)); } catch { return null; } };
const runWranglerArgs = (args, cwd) => spawnSync('npx', ['wrangler', ...args], { cwd, encoding: 'utf8', shell: process.platform === 'win32' });
export const DOES_NOT_EXIST = /\b10007\b|This Worker does not exist/i;

export async function countCrons({ pubDir = PUB, toml, run = runWranglerArgs, fetchImpl = fetch, env = process.env }) {
  const mine = tomlValue(toml, 'name');
  const who = jsonIn(run(['whoami', '--json'], pubDir).stdout);
  if (!who || who.loggedIn === false) return { known: false, why: 'not logged in to Cloudflare yet (npx wrangler login)' };
  const accounts = Array.isArray(who.accounts) ? who.accounts : [];
  const accountId = env.CLOUDFLARE_ACCOUNT_ID || tomlValue(toml, 'account_id') || (accounts.length === 1 ? accounts[0].id : null);
  if (!accountId) return { known: false, why: `this Cloudflare login has ${accounts.length} accounts and wrangler.toml does not say which one (account_id)` };
  const auth = jsonIn(run(['auth', 'token', '--json'], pubDir).stdout) || {};
  const secret = String(auth.token || auth.key || '');
  if (!secret) return { known: false, why: 'wrangler did not hand over its Cloudflare login' };
  const headers = auth.type === 'api_key' ? { 'X-Auth-Key': secret, 'X-Auth-Email': String(auth.email || '') } : { Authorization: `Bearer ${secret}` };
  const hide = (s) => String(s).split(secret).join('***');
  const get = async (p) => {
    const res = await fetchImpl(`${CF_API}${p}`, { headers, signal: AbortSignal.timeout(20000) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.success === false) throw new Error(hide(body.errors?.[0]?.message || `HTTP ${res.status}`));
    return body.result;
  };
  try {
    const scripts = (await get(`/accounts/${accountId}/workers/scripts`)) || [];
    const byWorker = [];
    for (const s of scripts) {
      const name = s.id || s.name; if (!name) continue;
      const r = await get(`/accounts/${accountId}/workers/scripts/${encodeURIComponent(name)}/schedules`);
      const n = (r?.schedules || []).length;
      if (n) byWorker.push({ name, crons: n });
    }
    const others = byWorker.filter((w) => w.name !== mine);
    return { known: true, accountId, byWorker, others, used: others.reduce((t, w) => t + w.crons, 0), mine: byWorker.find((w) => w.name === mine)?.crons || 0 };
  } catch (e) { return { known: false, why: `Cloudflare did not answer (${hide(e?.cause?.code || e?.message || 'network error')})` }; }
}

export async function deploy({ pubDir = PUB, run = runWranglerArgs, fetchImpl = fetch, env = process.env, anyway = false, log = console.log, retryWait = 5000 }) {
  const file = path.join(pubDir, 'wrangler.toml');
  if (!fs.existsSync(file)) throw new Plain('there is no publisher/wrangler.toml yet: run  node publisher/scripts/setup.mjs  first (it writes it)');
  const toml = fs.readFileSync(file, 'utf8');
  if (toml.includes(PLACEHOLDER)) throw new Plain('wrangler.toml still has no KV id: make the storage first (npx wrangler kv namespace create <slug>-kv, then node scripts/setup.mjs --kv-id <id>)');
  const need = cronsIn(toml);
  const c = await countCrons({ pubDir, toml, run, fetchImpl, env });
  if (c.known) {
    const total = c.used + need;
    const list = c.others.length ? ` (${c.others.map((w) => `${w.name} ${w.crons}`).join(', ')})` : '';
    log(`Cron triggers on this Cloudflare account: ${c.used} in use by other workers${list}; this publisher needs ${need}. That makes ${total} of the free plan's ${FREE_CRON_LIMIT}.`);
    if (total > FREE_CRON_LIMIT && !anyway) {
      log(`That is over the free plan's ${FREE_CRON_LIMIT} cron triggers per account, so Cloudflare would refuse this deploy on the free plan. Nothing was deployed. Free a trigger (take the cron off a worker you no longer need, or delete that worker in the Cloudflare dashboard), or move the account to Workers Paid. On Workers Paid, run  node scripts/setup.mjs deploy --anyway.`);
      return { deployed: false, capped: true, crons: c };
    }
  } else {
    log(`Could not count the cron triggers already on this Cloudflare account: ${c.why}. The free plan allows ${FREE_CRON_LIMIT} for all the account's workers together and this publisher needs ${need}; if the deploy fails with a cron trigger limit, that is why.`);
  }
  const once = () => { const r = run(['deploy'], pubDir); return { ...r, out: `${r.stdout || ''}${r.stderr || ''}`.trim() }; };
  let res = once(); let tries = 1;
  if (res.status !== 0 && DOES_NOT_EXIST.test(res.out)) {
    log(`Cloudflare answered "This Worker does not exist" (code 10007). That happens on the first deploy of a new worker while Cloudflare is still making it: trying once more in ${Math.round(retryWait / 1000)} seconds.`);
    await new Promise((r) => setTimeout(r, retryWait));
    res = once(); tries = 2;
  }
  if (res.out) log(res.out);
  if (res.status !== 0) {
    const last = res.out.split('\n').filter(Boolean).slice(-3).join(' / ') || res.error?.message || 'wrangler failed';
    if (/cron/i.test(res.out) && /limit|exceed|maximum/i.test(res.out)) throw new Plain(`the deploy was refused: the account has no cron trigger left (the free plan allows ${FREE_CRON_LIMIT} for all its workers together). Free one or move to Workers Paid, then run this again. Cloudflare said: ${last}`);
    throw new Plain(`npx wrangler deploy did not finish${tries > 1 ? ' (tried twice)' : ''}: ${last}`);
  }
  const url = (/https:\/\/[^\s"']+\.workers\.dev/.exec(res.out) || [])[0] || null;
  log(url ? `The publisher is online at ${url}. Next: node scripts/setup.mjs --url ${url}` : 'The publisher is online. Next: node scripts/setup.mjs --url <the address deploy printed>');
  return { deployed: true, tries, url, crons: c };
}

// ---------- subscribe: Meta's notifications for this brand's Instagram account ----------
// The webhook in the Meta app (callback address and verify token, docs/connect.md step 7) is only half of it: Meta
// also needs each Instagram account subscribed to the app, with a POST to the account's /subscribed_apps edge
// (Meta's "Set up Instagram Webhooks" guide). Unified Login: graph.facebook.com, fields comments, mentions, messages.
// Instagram Login: graph.instagram.com, fields comments and messages (mentions arrive inside comments there). The
// token comes from the token file, goes in the Authorization header only, and is blanked from any error.
export const SUBSCRIBE_FIELDS = { unified: ['comments', 'mentions', 'messages', 'messaging_postbacks'], instagram: ['comments', 'messages', 'messaging_postbacks'] };
export async function subscribe({ slug, configDir = CONFIG_DIR, fetchImpl = fetch, dryRun = false, log = console.log, apiVersion = 'v27.0' }) {
  const { file, login } = loginOf(slug, configDir);
  if (!file) throw new Plain(`no Instagram connection for this brand yet: docs/connect.md step 2A or 2B makes ${path.join(configDir, `instagram-${slug}.json`)}`);
  if (login === 'facebook') throw new Plain(FB_REFUSED);
  const cfg = readJSON(file, {}) || {};
  const token = String(cfg.access_token || '');
  if (!token || isPlaceholder(token)) throw new Plain(`${file} has no token yet (paste it over PASTE-..., docs/connect.md step 2)`);
  const shared = path.basename(file) === 'instagram.json';
  const idFile = shared ? path.join(configDir, `instagram-${slug}.ids.json`) : file;
  const igId = String((shared ? (readJSON(idFile, {}) || {}).ig_user_id : cfg.ig_user_id) || '');
  if (!/^\d+$/.test(igId)) throw new Plain(`the Instagram account id is not saved yet (in ${idFile}): run /content-calendar connect instagram first (its check saves it)`);
  const host = login === 'unified' ? 'https://graph.facebook.com' : 'https://graph.instagram.com';
  const fields = SUBSCRIBE_FIELDS[login === 'unified' ? 'unified' : 'instagram'];
  const where = `${host}/${cfg.api_version || apiVersion}/${igId}/subscribed_apps`;
  if (dryRun) { log(`Would ask Meta (${login === 'unified' ? 'Unified Login' : 'Instagram Login'}) to send ${fields.join(', ')} notifications for account ${igId} to this app: POST ${where}. Nothing was sent.`); return { dryRun: true, fields, url: where }; }
  const hide = (s) => String(s).split(token).join('***');
  let res, body;
  try {
    res = await fetchImpl(where, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ subscribed_fields: fields.join(',') }).toString(), signal: AbortSignal.timeout(30000) });
    body = await res.json().catch(() => ({}));
  } catch (e) { throw new Plain(`could not reach Meta (${hide(e?.cause?.code || e?.message || 'network error')})`); }
  if (!res.ok || body.error || body.success !== true) {
    const e = body.error || {};
    const why = e.code === 190 ? 'the token is not valid any more: make a new one (docs/connect.md step 2A or 2B)'
      : e.code === 10 || e.code === 200 ? `the token is missing a permission for this (${hide(e.message || 'permission')}): the comments and messages permissions must be on the token`
      : hide(e.message || `HTTP ${res.status}`);
    throw new Plain(`Meta did not turn the notifications on: ${why}`);
  }
  log(`Meta will now send ${fields.join(', ')} notifications for account ${igId} to this app's webhook. They only arrive once the app is Live with Advanced Access (docs/connect.md step 7).`);
  return { ok: true, fields, url: where };
}

export function saveUrl({ slug, url, configDir = CONFIG_DIR }) {
  if (!/^https:\/\/[^\s/]+\.[^\s/]+\/?$/.test(String(url || ''))) throw new Plain('--url takes the address wrangler deploy printed, e.g. https://brand-publisher.you.workers.dev');
  const file = path.join(configDir, `publisher-${slug}.json`);
  const pub = readJSON(file, {}) || {};
  pub.url = String(url).replace(/\/+$/, '');
  writePrivate(file, pub);
  return file;
}

export async function check({ root, fetchImpl = fetch, configDir = CONFIG_DIR, log = console.log, settle = 0 }) {
  const conn = connection(brandSlug(root), configDir);
  let a = await admin(conn, 'GET', '/admin', { fetchImpl });
  // Cloudflare takes a few seconds to give a running Worker the secrets just sent: ask once more before saying so
  if (settle && Object.values(a.platforms || {}).some((v) => !v.configured)) {
    log(`A platform shows as not connected yet. Cloudflare can take a few seconds to pick up new secrets: asking again in ${Math.round(settle / 1000)} seconds.`);
    await new Promise((r) => setTimeout(r, settle));
    a = await admin(conn, 'GET', '/admin', { fetchImpl });
  }
  log(`The publisher at ${conn.url} answers. Brand ${a.brand || '(not set)'}, ${a.api_setup} login, Graph ${a.graph_version}.`);
  for (const [p, v] of Object.entries(a.platforms || {})) log(`  ${p.padEnd(10)} ${v.configured ? 'connected' : 'not connected (its id or token secret is missing)'}, ${v.mode === 'live' ? 'LIVE' : 'dry run'}`);
  log(`  comments   auto-replies ${a.mode === 'live' ? 'LIVE' : 'dry run'}, ${a.rules?.length || 0} rule(s)${a.rules_error ? `, rules problem: ${a.rules_error}` : ''}`);
  return a;
}

// Meta's follow field for one person who has messaged the account (the field only answers after they have). With no id,
// the newest received message in the publisher's inbox supplies one. Prints the answer; sends nothing to the person.
export async function followCheck({ root, id = null, fetchImpl = fetch, configDir = CONFIG_DIR, log = console.log }) {
  const conn = connection(brandSlug(root), configDir);
  let who = id ? String(id) : null;
  if (!who) {
    const box = await admin(conn, 'GET', '/admin/inbox', { fetchImpl });
    const last = (box.messages || []).find((m) => m.direction === 'received' && m.from_id);
    if (!last) throw new Plain('nobody has messaged the account yet: send it a message from a second account (it must be public or follow-able), then run this again');
    who = last.from_id;
    log(`Checking the newest person who messaged (id ending ${who.slice(-4)}).`);
  }
  const r = await admin(conn, 'GET', `/admin/follow-check?id=${encodeURIComponent(who)}`, { fetchImpl });
  if (r.error && r.follows == null) { log(`Meta did not answer the follow check: ${r.error}`); log('A follow gate cannot work until this answers. Likely causes: the account is on the Facebook Page login (use Instagram or Unified Login), the messages permission is missing, or the person has not messaged the account.'); return r; }
  log(r.follows ? 'Meta says this person follows the account: the follow gate would send the link.' : 'Meta says this person does NOT follow the account: the follow gate would send a reminder. Follow the account from that second account, message again, and run this once more: it should now say they follow.');
  return r;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = findBrand(process.cwd());
  if (!root) throw new Plain('Run this inside the brand folder (where brand/brand.json is).');
  const slug = brandSlug(root, readJSON(path.join(root, 'brand', 'brand.json'), {}));
  if (args._[0] === 'check') return check({ root, settle: 15000 });
  if (args._[0] === 'follow-check') { await followCheck({ root, id: args._[1] || null }); return; }
  if (args._[0] === 'deploy') { const r = await deploy({ anyway: args.anyway === true }); if (!r.deployed) process.exitCode = 1; return; }
  if (args._[0] === 'subscribe') { await subscribe({ slug, dryRun: args['dry-run'] === true }); return; }
  if (args._[0] === 'secrets') {
    const only = typeof args.only === 'string' ? args.only.split(',').map((x) => x.trim().toUpperCase()).filter(Boolean) : null;
    const r = sendSecrets({ slug, only, dryRun: args['dry-run'] === true });
    if (args['dry-run'] !== true) console.log(`${r.sent.length} sent${r.skipped.length ? `, ${r.skipped.length} skipped` : ''}${r.failed.length ? `, ${r.failed.length} NOT sent (run npx wrangler login, then this again)` : ''}${r.refused.length ? `, ${r.refused.length} refused (YouTube: the sign-in can do more than upload)` : ''}. Each secret is live as soon as it is sent.`);
    if (r.failed.length || r.refused.length) process.exitCode = 1;
    return;
  }
  if (typeof args.url === 'string') { console.log(`Saved the publisher's address in ${saveUrl({ slug, url: args.url })}.`); return; }
  // the Instagram setup: --api-setup when given, else what the brand's token file says (Unified or Instagram Login)
  const fromFile = loginOf(slug).login;
  if (fromFile === 'facebook') throw new Plain(FB_REFUSED);
  const asked = typeof args['api-setup'] === 'string' ? args['api-setup'] : null;
  if (asked && fromFile && asked !== fromFile && ['instagram', 'unified'].includes(asked)) throw new Plain(`--api-setup ${asked} does not match the brand's Instagram file, which says ${fromFile === 'unified' ? '"login": "unified"' : 'Instagram Login'}: use --api-setup ${fromFile}, or leave it out`);
  const r = writeToml({ slug, apiSetup: asked || fromFile || 'instagram', kvId: typeof args['kv-id'] === 'string' ? args['kv-id'] : null });
  if (r.wrote) console.log(`Wrote ${r.wrote === 'kv id' ? 'the KV id into ' : ''}${r.file}`);
  const toml = fs.readFileSync(r.file, 'utf8');
  if (args['kv-id']) return;
  console.log('\n' + steps({ slug, apiSetup: /API_SETUP = "unified"/.test(toml) ? 'unified' : 'instagram', kvReady: !toml.includes(PLACEHOLDER) }));
}

if (isMain(import.meta.url)) {
  main().catch((e) => { console.error(e instanceof Plain ? e.message : `Unexpected error: ${e?.message || e}`); process.exit(1); });
}
