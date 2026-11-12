#!/usr/bin/env node
// One-time sign-in for YouTube and TikTok posting. Run from the brand folder. The owner signs in and says Allow in the
// browser; this script catches the answer on this computer only (http://127.0.0.1:<port>), trades it for the long-lived
// refresh token and writes that into a file in ~/.config/bagelunit-reels/, readable by the owner only. It never prints
// a token or a secret, and nothing is typed into a terminal. Node 22, no packages.
//
//   node publisher/scripts/video-login.mjs youtube            YouTube Shorts (scope youtube.upload only)
//   node publisher/scripts/video-login.mjs tiktok [--direct]  TikTok drafts (scope video.upload); --direct also asks
//                                                             for video.publish (a direct post, which needs TikTok's
//                                                             approval of the app for that scope)
//
// Before it can work, the owner's own app has to exist (docs/connect.md steps 6B and 6C) and its client id and secret are
// in the file this script makes if it is missing, youtube-<slug>.json or tiktok-<slug>.json, in place of the PASTE-...
// words (Claude opens the file; the owner pastes; docs/browser.md). A Google "Desktop app" credentials file saved as
// youtube-<slug>.json is read as it is.
//
// YouTube: authorization-code flow with PKCE on a loopback address (Google's "installed app" flow), access_type=offline
//   and prompt=consent so Google returns a refresh token. Google keeps it only while the project is "In production" on
//   the consent screen: in "Testing" it ends after 7 days (the Worker says so when it happens). A token made in Testing
//   keeps its 7 days after the app is published, so sign in again once the app is in production.
// TikTok: the desktop flow of Login Kit (PKCE, and TikTok's code challenge is the HEX of the SHA-256, not base64url).
//   The redirect address has to be registered in the app as  http://127.0.0.1:*/callback/  (wildcard port).
import http from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { parseArgs, readJSON, findBrand, brandSlug, Plain, isMain, CONFIG_DIR } from './lib.mjs';

const writePrivate = (file, data) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 }); try { fs.chmodSync(file, 0o600); } catch {} };
const isPlaceholder = (v) => !v || /^PASTE-/i.test(String(v).trim());

export const PROVIDERS = {
  youtube: {
    label: 'YouTube', fields: ['client_id', 'client_secret'],
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth', tokenUrl: 'https://oauth2.googleapis.com/token',
    redirectPath: '/', scopes: () => ['https://www.googleapis.com/auth/youtube.upload'],
    challenge: (v) => createHash('sha256').update(v).digest('base64url'),
    authParams: (c, p) => ({ client_id: c.client_id, access_type: 'offline', prompt: 'consent', ...p }),
    tokenBody: (c, code, redirect, verifier) => ({ client_id: c.client_id, client_secret: c.client_secret, code, redirect_uri: redirect, grant_type: 'authorization_code', code_verifier: verifier }),
    help: 'In Google Cloud (docs/connect.md step 6B): turn the YouTube Data API v3 on, set up the consent screen as External (add the channel\'s Google account as a test user, or publish it to production for a sign-in that does not end after 7 days), and make an OAuth client of type "Desktop app".',
  },
  tiktok: {
    label: 'TikTok', fields: ['client_key', 'client_secret'],
    authUrl: 'https://www.tiktok.com/v2/auth/authorize/', tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
    redirectPath: '/callback/', scopes: (direct) => (direct ? ['video.upload', 'video.publish'] : ['video.upload']),
    challenge: (v) => createHash('sha256').update(v).digest('hex'),
    authParams: (c, p) => ({ client_key: c.client_key, ...p }),
    tokenBody: (c, code, redirect, verifier) => ({ client_key: c.client_key, client_secret: c.client_secret, code, grant_type: 'authorization_code', redirect_uri: redirect, code_verifier: verifier }),
    help: 'In the TikTok developer portal (docs/connect.md step 6C): make an app, add the Content Posting API (and Login Kit for Desktop), and register  http://127.0.0.1:*/callback/  as a redirect address.',
  },
};

// The credentials file: made with PASTE-... words when missing. A Google credentials download ({"installed": {...}}) is flattened.
export function readCredentials(provider, slug, configDir = CONFIG_DIR) {
  const P = PROVIDERS[provider];
  const file = path.join(configDir, `${provider}-${slug}.json`);
  let cfg = readJSON(file, null);
  if (!cfg) {
    writePrivate(file, Object.fromEntries(P.fields.map((f) => [f, `PASTE-${f.toUpperCase().replace(/_/g, '-')}-HERE`])));
    throw new Plain(`Made ${file} with PASTE-... in place of the ${P.fields.join(' and ')}. ${P.help} Paste them in that file (Claude opens it for you), then run this again.`);
  }
  const inner = cfg.installed || cfg.web;
  if (inner) cfg = { ...cfg, client_id: inner.client_id, client_secret: inner.client_secret, installed: undefined, web: undefined };
  const missing = P.fields.filter((f) => isPlaceholder(cfg[f]));
  if (missing.length) throw new Plain(`${file} still needs ${missing.join(' and ')} (it holds the PASTE-... words or nothing). ${P.help}`);
  return { file, cfg };
}

export function authorizeUrl(provider, cfg, { redirect, state, verifier, direct = false }) {
  const P = PROVIDERS[provider];
  const q = new URLSearchParams(P.authParams(cfg, { redirect_uri: redirect, response_type: 'code', scope: P.scopes(direct).join(provider === 'tiktok' ? ',' : ' '), state, code_challenge: P.challenge(verifier), code_challenge_method: 'S256' }));
  return `${P.authUrl}?${q}`;
}

// Waits for the browser to come back to 127.0.0.1 with ?code=...&state=...; answers the browser with a plain page.
export function waitForCode({ redirectPath, state, timeoutMs = 5 * 60 * 1000, onListening }) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://127.0.0.1');
      if (u.pathname !== redirectPath) { res.writeHead(404).end('not here'); return; }
      const done = (status, text, fn) => { res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end(text); clearTimeout(timer); server.close(); fn(); };
      if (u.searchParams.get('state') !== state) return done(400, 'This did not match the sign-in that was started. Go back to the terminal and try again.', () => reject(new Plain('the answer did not carry the right "state": nothing was saved. Run the sign-in again')));
      if (u.searchParams.get('error')) return done(400, 'The sign-in was not allowed. You can close this tab.', () => reject(new Plain(`the sign-in was refused (${String(u.searchParams.get('error_description') || u.searchParams.get('error')).slice(0, 120)})`)));
      const code = u.searchParams.get('code');
      if (!code) return done(400, 'No code came back.', () => reject(new Plain('no code came back from the sign-in page')));
      done(200, 'Signed in. You can close this tab and go back to the terminal.', () => resolve(code));
    });
    const timer = setTimeout(() => { server.close(); reject(new Plain('nobody signed in within 5 minutes: run it again when you are ready')); }, timeoutMs);
    server.on('error', (e) => { clearTimeout(timer); reject(new Plain(`could not listen on this computer: ${e.message}`)); });
    server.listen(0, '127.0.0.1', () => onListening(server.address().port));
  });
}

const openBrowser = (url) => {
  const [cmd, args] = process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url.replace(/&/g, '^&')]] : ['xdg-open', [url]];
  try { spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref(); } catch {}
};

export async function login(provider, { slug, configDir = CONFIG_DIR, fetchImpl = fetch, open = openBrowser, log = console.log, direct = false, timeoutMs } = {}) {
  const P = PROVIDERS[provider];
  if (!P) throw new Plain('say youtube or tiktok');
  const { file, cfg } = readCredentials(provider, slug, configDir);
  const verifier = randomBytes(48).toString('base64url');
  const state = randomBytes(16).toString('hex');
  let redirect = '';
  const code = await waitForCode({
    redirectPath: P.redirectPath, state, timeoutMs,
    onListening: (port) => {
      redirect = `http://127.0.0.1:${port}${P.redirectPath}`;
      const url = authorizeUrl(provider, cfg, { redirect, state, verifier, direct });
      log(`Opening the ${P.label} sign-in page. Sign in with the account the reels should go to and choose Allow. If no page opens, open this address yourself:\n${url}`);
      open(url);
    },
  });
  let res, data;
  try {
    res = await fetchImpl(P.tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cache-Control': 'no-cache' }, body: new URLSearchParams(P.tokenBody(cfg, code, redirect, verifier)).toString(), signal: AbortSignal.timeout(30000) });
    data = await res.json().catch(() => ({}));
  } catch (e) { throw new Plain(`could not reach ${P.label} to finish the sign-in (${e?.cause?.code || e?.name || 'network error'})`); }
  const hide = (s) => [cfg.client_secret, code, verifier].reduce((t, x) => (x ? String(t).split(String(x)).join('***') : t), String(s));
  if (!res.ok || !data.refresh_token) {
    const why = hide(data.error_description || (typeof data.error === 'string' ? data.error : data.error?.message) || (data.access_token ? `${P.label} sent no refresh token (the sign-in must ask for offline access; remove the app at myaccount.google.com/permissions and try again)` : `HTTP ${res.status}`));
    throw new Plain(`${P.label} did not finish the sign-in: ${why}`);
  }
  const out = { ...cfg, refresh_token: data.refresh_token, scope: data.scope || P.scopes(direct).join(','), signed_in_at: new Date().toISOString() };
  if (provider === 'tiktok' && data.open_id) out.open_id = data.open_id;
  delete out.installed; delete out.web;
  writePrivate(file, out);
  log(`Signed in. The ${P.label} refresh token is saved in ${file} (readable by you only; it is never printed). Next: node publisher/scripts/setup.mjs secrets --only ${provider === 'youtube' ? 'YT_REFRESH_TOKEN,YT_CLIENT_ID,YT_CLIENT_SECRET' : 'TIKTOK_REFRESH_TOKEN,TIKTOK_CLIENT_KEY,TIKTOK_CLIENT_SECRET'}`);
  return { file };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const provider = args._[0];
  const root = findBrand(process.cwd());
  if (!root) throw new Plain('Run this inside the brand folder (where brand/brand.json is).');
  if (!PROVIDERS[provider]) throw new Plain('usage: node publisher/scripts/video-login.mjs youtube | tiktok [--direct]');
  await login(provider, { slug: brandSlug(root), direct: args.direct === true });
}

if (isMain(import.meta.url)) {
  main().catch((e) => { console.error(e instanceof Plain ? e.message : `Unexpected error: ${e?.message || e}`); process.exit(1); });
}
