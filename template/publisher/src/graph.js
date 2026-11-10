// Every call this Worker makes to Meta goes through here: Instagram, the Facebook Page and Threads.
//
// API_SETUP (wrangler.toml) picks how Instagram is reached:
//   "instagram" (default): Instagram API with Instagram Login. Host graph.instagram.com, an Instagram User token that
//                          the Worker refreshes about once a week (ig_refresh_token).
//   "unified":             Instagram API with Unified Login (or Facebook Login). Host graph.facebook.com, a Business
//                          Integration System User token set to never expire, so it is never refreshed.
// The Facebook Page always uses graph.facebook.com with a Page access token (FB_PAGE_TOKEN), and uploads the video
// through rupload.facebook.com. Threads uses graph.threads.com with a Threads user token, refreshed weekly
// (th_refresh_token).
//
// Four rules hold for every call:
//   1. A token never appears in an error message, a log line or the admin view (hide()).
//   2. Each run has a budget of outside calls (Cloudflare's free plan allows 50 per run). When it runs out the step
//      stops cleanly and carries on at the next run, so a big carousel never half-fails.
//   3. Meta's answer is read as JSON; any error becomes a GraphError with Meta's code, so callers can tell a passing
//      problem (rate limit, Meta down) from a real refusal.
//   4. Every call has a time limit (FETCH_TIMEOUT_MS, 25 seconds unless the var says otherwise). A call that runs out
//      of time is a passing problem: the caller must treat it as "may have happened" (see facebook.js).

export const HOST = {
  instagram: 'https://graph.instagram.com',
  facebook: 'https://graph.facebook.com',
  rupload: 'https://rupload.facebook.com',
  threads: 'https://graph.threads.com',
};
export const isUnified = (env) => env.API_SETUP === 'unified' || env.API_SETUP === 'facebook';
export const igHost = (env) => (isUnified(env) ? HOST.facebook : HOST.instagram);
export const graphVersion = (env) => env.GRAPH_VERSION || 'v27.0';
export const threadsVersion = (env) => env.THREADS_VERSION || 'v1.0';

// Meta's codes for "too many calls, try later" plus server-side trouble: these are retried, not failed.
const PASSING = new Set([1, 2, 4, 17, 32, 341, 613, 80001, 80002]);

export class GraphError extends Error {
  constructor(message, { code = null, status = 0, passing = false, timeout = false } = {}) {
    super(message);
    this.code = code; this.status = status; this.passing = passing; this.timeout = timeout;
  }
}
export class OutOfBudget extends Error {
  constructor() { super('call budget for this run used up; carrying on at the next run'); }
}

// A per-run call budget. 40 leaves room under Cloudflare's 50 for the token refresh and anything else.
export const makeBudget = (n = 40) => ({ left: n });

export const FETCH_TIMEOUT_MS = 25000;
const timeoutMs = (env) => Math.max(1000, Number(env?.FETCH_TIMEOUT_MS) || FETCH_TIMEOUT_MS);

// A short fingerprint of a secret (never the secret itself), so the Worker can tell when the owner sent a new one.
export async function secretHash(value) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value || ''))));
  return [...d].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// The token to use: the one the Worker refreshed and keeps in KV, but only while the secret it was refreshed from is
// still the secret Cloudflare holds. When the owner sends a new token (setup.mjs secrets), its fingerprint no longer
// matches <name>_src and the new secret wins; the next refresh starts from it. A KV token from before this rule (no
// <name>_src yet) is kept and given the current secret's fingerprint once.
async function currentToken(env, name, secret) {
  const kvTok = await env.KV.get(name);
  if (!secret) return kvTok || '';
  if (!kvTok) return secret;
  const src = await env.KV.get(`${name}_src`);
  const now = await secretHash(secret);
  if (!src) { await env.KV.put(`${name}_src`, now); return kvTok; }
  return src === now ? kvTok : secret;
}
export async function igToken(env) { return currentToken(env, 'token', env.IG_TOKEN); }
export async function threadsToken(env) { return currentToken(env, 'threads_token', env.THREADS_TOKEN); }

function hideAll(text, secrets) {
  let s = String(text ?? '');
  for (const t of secrets) if (t && t.length > 4) s = s.split(t).join('***');
  return s;
}

// One HTTP call. `secrets` are blanked out of anything that could end up in an error.
async function send(fetchImpl, budget, url, init, secrets, ms = FETCH_TIMEOUT_MS) {
  if (budget) { if (budget.left <= 0) throw new OutOfBudget(); budget.left--; }
  let res, data;
  try {
    res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(ms) });
    data = await res.json().catch((e) => { if (e?.name === 'TimeoutError' || e?.name === 'AbortError') throw e; return {}; });
  } catch (e) {
    const timedOut = e?.name === 'TimeoutError' || e?.name === 'AbortError';
    throw new GraphError(timedOut ? `Meta did not answer within ${Math.round(ms / 1000)} seconds` : `could not reach Meta (${hideAll(e?.cause?.code || e?.name || 'network error', secrets)})`, { passing: true, timeout: timedOut });
  }
  if (!res.ok || data?.error) {
    const err = data?.error || {};
    const where = `${init.method || 'GET'} ${new URL(url).pathname}`;
    const msg = hideAll(err.message || err.error_user_msg || `HTTP ${res.status}`, secrets);
    throw new GraphError(`${where} ${res.status}: ${msg}`, { code: err.code ?? null, status: res.status, passing: PASSING.has(err.code) || res.status >= 500 || res.status === 429 });
  }
  return data;
}

// Instagram (both setups): JSON body, token in the Authorization header, as Meta's content publishing guide shows.
export function instagramApi(env, fetchImpl = fetch, budget = null) {
  const base = `${igHost(env)}/${graphVersion(env)}`;
  let tokP = null;                                    // read once per run
  const call = async (method, path, body) => {
    const tok = await (tokP ||= igToken(env));
    return send(fetchImpl, budget, `${base}/${path}`, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), Authorization: `Bearer ${tok}` },
      body: body ? JSON.stringify(body) : undefined,
    }, [tok], timeoutMs(env));
  };
  return { get: (p) => call('GET', p), post: (p, b) => call('POST', p, b) };
}

// Facebook Page: graph.facebook.com with the Page token, plus the rupload host for the hosted-file upload
// ("Authorization: OAuth <token>" and a "file_url" header, per the Reels Publishing API guide), and a multipart upload
// for the reel's cover (POST /<video_id>/thumbnails).
export function facebookApi(env, fetchImpl = fetch, budget = null) {
  const tok = env.FB_PAGE_TOKEN || '';
  const base = `${HOST.facebook}/${graphVersion(env)}`;
  const call = (method, path, body) => send(fetchImpl, budget, `${base}/${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), Authorization: `Bearer ${tok}` },
    body: body ? JSON.stringify(body) : undefined,
  }, [tok], timeoutMs(env));
  const uploadFromUrl = (videoId, fileUrl) => send(fetchImpl, budget, `${HOST.rupload}/video-upload/${graphVersion(env)}/${videoId}`, {
    method: 'POST', headers: { Authorization: `OAuth ${tok}`, file_url: fileUrl },
  }, [tok], timeoutMs(env));
  // A file sent as multipart form data (the video thumbnails edge takes the image itself as "source", not a URL).
  // No Content-Type header: fetch writes it with the form's boundary.
  const postFile = (path, fields, file, filename, type) => {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.set(k, String(v));
    form.set('source', new Blob([file], { type }), filename);
    return send(fetchImpl, budget, `${base}/${path}`, { method: 'POST', headers: { Authorization: `Bearer ${tok}` }, body: form }, [tok], timeoutMs(env));
  };
  return { get: (p) => call('GET', p), post: (p, b) => call('POST', p, b), uploadFromUrl, postFile };
}

// Threads: the docs show form fields with access_token, so that is what is sent (never JSON).
export function threadsApi(env, fetchImpl = fetch, budget = null) {
  const base = `${HOST.threads}/${threadsVersion(env)}`;
  let tokP = null;
  const call = async (method, path, params = {}) => {
    const tok = await (tokP ||= threadsToken(env));
    const form = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) form.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    form.set('access_token', tok);
    const url = method === 'GET' ? `${base}/${path}${path.includes('?') ? '&' : '?'}${form}` : `${base}/${path}`;
    return send(fetchImpl, budget, url, method === 'GET' ? { method } : {
      method, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString(),
    }, [tok], timeoutMs(env));
  };
  return { get: (p) => call('GET', p), post: (p, params) => call('POST', p, params) };
}

// ---------- token refresh ----------
// Instagram Login tokens and Threads tokens live 60 days and can be refreshed once they are a day old. The Worker
// refreshes each about once a week and keeps the new one in KV with the fingerprint of the secret it came from, so
// it is used until the owner sends a new secret (currentToken above).
// Unified Login uses a system user token that does not expire, so it is skipped. A Page token is not refreshed.
// In dry run nothing is sent to Meta, the refresh included: Instagram is refreshed only while Instagram posting or the
// comment replies (MODE) are live, Threads only while Threads posting is live. A token left in dry run for more than
// about 50 days is sent again (setup.mjs secrets --only IG_TOKEN) before going live (publisher/README.md).
const liveMode = (env, p) => ((env[`PUBLISH_MODE_${p}`] ?? env.PUBLISH_MODE) === 'live');
export async function refreshTokens(env, fetchImpl = fetch, now = Date.now()) {
  const out = {};
  const due = async (name) => {
    const last = Date.parse((await env.KV.get(`${name}_refreshed_at`)) || '') || 0;
    const tried = (await env.KV.get(`${name}_refresh_tried`)) || '';
    return now - last > 6 * 864e5 && tried !== new Date(now).toISOString().slice(0, 10);
  };
  const run = async (name, url, tok, secret) => {
    await env.KV.put(`${name}_refresh_tried`, new Date(now).toISOString().slice(0, 10), { expirationTtl: 3 * 86400 });
    try {
      const data = await send(fetchImpl, null, url, { method: 'GET' }, [tok, secret], timeoutMs(env));
      if (!data.access_token) throw new GraphError('no token in the answer');
      await env.KV.put(name, data.access_token);
      await env.KV.put(`${name}_src`, await secretHash(secret));
      await env.KV.put(`${name}_refreshed_at`, new Date(now).toISOString());
      out[name] = { ok: true, expires_in: data.expires_in };
    } catch (e) { out[name] = { ok: false, error: e.message }; }
  };
  const igLive = liveMode(env, 'INSTAGRAM') || env.MODE === 'live';
  if (igLive && !isUnified(env) && env.IG_USER_ID && env.IG_TOKEN && (await due('token'))) {
    const tok = await igToken(env);
    await run('token', `${HOST.instagram}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(tok)}`, tok, env.IG_TOKEN);
  }
  if (liveMode(env, 'THREADS') && env.THREADS_USER_ID && env.THREADS_TOKEN && (await due('threads_token'))) {
    const tok = await threadsToken(env);
    await run('threads_token', `${HOST.threads}/refresh_access_token?grant_type=th_refresh_token&access_token=${encodeURIComponent(tok)}`, tok, env.THREADS_TOKEN);
  }
  return out;
}
