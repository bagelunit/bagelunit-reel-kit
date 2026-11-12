// Every call this Worker makes to YouTube and TikTok goes through here (Meta's are in graph.js). The same four rules:
//   1. A token, client secret or upload address never appears in an error message, a log line or the admin view.
//   2. Each run has a budget of outside calls (the one graph.js makes); a step that runs out carries on next run.
//   3. An answer that is a refusal becomes a GraphError with the platform's own code, marked "passing" when the
//      platform says try later (rate limit, server trouble), so callers retry it and fail the real refusals.
//   4. Every call has a time limit. A video upload gets a longer one (UPLOAD_TIMEOUT_MS, 5 minutes); a call that runs
//      out of time is a passing problem and the caller treats it as "may have happened" (youtube.js, tiktok.js).
//
// YouTube (Data API v3, read 2026-11-11): OAuth with a refresh token that does not rotate; the Worker trades it for an
//   access token (about an hour) and keeps that in KV. Uploads are "resumable": POST starts a session and answers
//   with an address, PUT sends the bytes, and a PUT with "Content-Range: bytes */<size>" asks how far it got.
//   Scope youtube.upload only. videos.insert costs a quota of 1,600 units, and the default project quota allows 100
//   uploads a day (Quota and Compliance Audits page).
// TikTok (Content Posting API, read 2026-11-11): a user access token lasts 2 hours and its refresh token 180 days,
//   and a refresh may return a NEW refresh token ("refresh token rotation"), so the newest one is kept in KV before
//   anything else happens, and used until the owner sends a new secret (the same rule as graph.js currentToken).
import { GraphError, OutOfBudget, secretHash, FETCH_TIMEOUT_MS } from './graph.js';

export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const YT_UPLOAD_URL = 'https://www.googleapis.com/upload/youtube/v3/videos';
export const TIKTOK_HOST = 'https://open.tiktokapis.com';
export const UPLOAD_TIMEOUT_MS = 5 * 60 * 1000;

const timeoutMs = (env) => Math.max(1000, Number(env?.FETCH_TIMEOUT_MS) || FETCH_TIMEOUT_MS);
const uploadMs = (env) => Math.max(5000, Number(env?.UPLOAD_TIMEOUT_MS) || UPLOAD_TIMEOUT_MS);

function hide(text, secrets) {
  let s = String(text ?? '');
  for (const t of secrets) if (t && String(t).length > 4) s = s.split(String(t)).join('***');
  return s;
}

// One HTTP call: budget, time limit, JSON read. Network trouble and time-outs are passing GraphErrors.
async function http(fetchImpl, budget, url, init, secrets, ms, who) {
  if (budget) { if (budget.left <= 0) throw new OutOfBudget(); budget.left--; }
  try {
    const res = await fetchImpl(url, { redirect: 'manual', ...init, signal: AbortSignal.timeout(ms) });
    const text = await res.text().catch((e) => { if (e?.name === 'TimeoutError' || e?.name === 'AbortError') throw e; return ''; });
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
    return { res, data };
  } catch (e) {
    const timedOut = e?.name === 'TimeoutError' || e?.name === 'AbortError';
    throw new GraphError(timedOut ? `${who} did not answer within ${Math.round(ms / 1000)} seconds` : `could not reach ${who} (${hide(e?.cause?.code || e?.name || 'network error', secrets)})`, { passing: true, timeout: timedOut });
  }
}

// ---------- YouTube ----------
const YT_PASSING = new Set(['rateLimitExceeded', 'userRateLimitExceeded', 'backendError', 'internalError', 'serviceUnavailable']);
function ytError(res, data, secrets, what) {
  const e = data?.error || {};
  const reason = e.errors?.[0]?.reason || e.status || null;
  const msg = hide(e.message || data?.error_description || (typeof data?.error === 'string' ? data.error : '') || `HTTP ${res.status}`, secrets);
  const hint = reason === 'quotaExceeded' ? ' (this Google project\'s daily YouTube quota is used up; it resets at midnight Pacific time)' : '';
  return new GraphError(`${what} ${res.status}: ${msg}${hint}`, { code: reason, status: res.status, passing: YT_PASSING.has(reason) || res.status >= 500 || res.status === 429 });
}

async function youtubeAccessToken(env, fetchImpl, budget) {
  const src = await secretHash(env.YT_REFRESH_TOKEN);
  let cached = null; try { cached = JSON.parse((await env.KV.get('yt_access')) || 'null'); } catch {}
  if (cached?.token && cached.src === src && cached.exp > Date.now() + 60000) return cached.token;
  const form = new URLSearchParams({ client_id: env.YT_CLIENT_ID, client_secret: env.YT_CLIENT_SECRET, refresh_token: env.YT_REFRESH_TOKEN, grant_type: 'refresh_token' });
  const secrets = [env.YT_CLIENT_SECRET, env.YT_REFRESH_TOKEN];
  const { res, data } = await http(fetchImpl, budget, GOOGLE_TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString() }, secrets, timeoutMs(env), 'Google');
  if (!res.ok || !data.access_token) {
    const why = hide(data.error_description || data.error || `HTTP ${res.status}`, secrets);
    const grant = data.error === 'invalid_grant' ? ' The YouTube sign-in was taken back or has run out (a Google project left in "Testing" loses it after 7 days): run the YouTube sign-in again (docs/connect.md).' : '';
    throw new GraphError(`Google refused the YouTube sign-in: ${why}.${grant}`, { status: res.status, passing: res.status >= 500 || res.status === 429 });
  }
  await env.KV.put('yt_access', JSON.stringify({ token: data.access_token, exp: Date.now() + (Number(data.expires_in) || 3600) * 1000, src }));
  return data.access_token;
}

export function youtubeApi(env, fetchImpl = fetch, budget = null) {
  let tokP = null;
  const token = () => (tokP ||= youtubeAccessToken(env, fetchImpl, budget));
  const secrets = () => [env.YT_CLIENT_SECRET, env.YT_REFRESH_TOKEN];
  return {
    // Starts a resumable upload: the answer's Location header is the (secret) address to send the bytes to.
    async startUpload(meta, size) {
      const tok = await token();
      const { res, data } = await http(fetchImpl, budget, `${YT_UPLOAD_URL}?uploadType=resumable&part=snippet,status`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Length': String(size), 'X-Upload-Content-Type': 'video/mp4' },
        body: JSON.stringify(meta),
      }, [tok, ...secrets()], timeoutMs(env), 'YouTube');
      if (!res.ok) throw ytError(res, data, [tok, ...secrets()], 'POST videos');
      const uri = res.headers.get('location');
      if (!uri) throw new GraphError('YouTube did not return an upload address', { passing: false });
      return uri;
    },
    // Sends the bytes from `offset` to the end. 200 or 201 carries the new video.
    async putVideo(uri, body, size, offset = 0) {
      const { res, data } = await http(fetchImpl, budget, uri, {
        method: 'PUT',
        headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(size - offset), ...(offset ? { 'Content-Range': `bytes ${offset}-${size - 1}/${size}` } : {}) },
        body,
      }, [uri, ...secrets()], uploadMs(env), 'YouTube');
      if (res.status === 200 || res.status === 201) return data;
      throw ytError(res, data, [uri, ...secrets()], 'PUT video');
    },
    // Asks how far an upload got: { complete: true, resource } when YouTube has the whole video, else { received }.
    async queryUpload(uri, size) {
      const { res, data } = await http(fetchImpl, budget, uri, { method: 'PUT', headers: { 'Content-Length': '0', 'Content-Range': `bytes */${size}` } }, [uri, ...secrets()], timeoutMs(env), 'YouTube');
      if (res.status === 200 || res.status === 201) return { complete: true, resource: data };
      if (res.status === 308) {
        const m = /bytes=0-(\d+)/.exec(res.headers.get('range') || '');
        return { complete: false, received: m ? Number(m[1]) + 1 : 0 };
      }
      throw ytError(res, data, [uri, ...secrets()], 'PUT upload status');
    },
  };
}

// ---------- TikTok ----------
const TT_PASSING = new Set(['rate_limit_exceeded', 'internal_error', 'spam_risk_too_many_posts', 'access_token_invalid']);

async function tiktokAccessToken(env, fetchImpl, budget) {
  const src = await secretHash(env.TIKTOK_REFRESH_TOKEN);
  let st = null; try { st = JSON.parse((await env.KV.get('tt_token')) || 'null'); } catch {}
  const mine = st && st.src === src;
  if (mine && st.access && st.exp > Date.now() + 120000) return st.access;
  const refresh = mine && st.refresh ? st.refresh : env.TIKTOK_REFRESH_TOKEN;
  const secrets = [env.TIKTOK_CLIENT_SECRET, env.TIKTOK_REFRESH_TOKEN, refresh];
  const form = new URLSearchParams({ client_key: env.TIKTOK_CLIENT_KEY, client_secret: env.TIKTOK_CLIENT_SECRET, grant_type: 'refresh_token', refresh_token: refresh });
  const { res, data } = await http(fetchImpl, budget, `${TIKTOK_HOST}/v2/oauth/token/`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cache-Control': 'no-cache' }, body: form.toString() }, secrets, timeoutMs(env), 'TikTok');
  if (!res.ok || !data.access_token) {
    const why = hide(data.error_description || (typeof data.error === 'string' ? data.error : data.error?.message) || `HTTP ${res.status}`, secrets);
    const grant = /invalid_grant|expired|invalid/i.test(String(data.error || '')) ? ' The TikTok sign-in has run out or was taken back: run the TikTok sign-in again (docs/connect.md).' : '';
    throw new GraphError(`TikTok refused the sign-in: ${why}.${grant}`, { status: res.status, passing: res.status >= 500 || res.status === 429 });
  }
  // The newest refresh token is saved first: a refresh may have retired the one used.
  await env.KV.put('tt_token', JSON.stringify({ access: data.access_token, exp: Date.now() + (Number(data.expires_in) || 7200) * 1000, refresh: data.refresh_token || refresh, src }));
  return data.access_token;
}

export function tiktokApi(env, fetchImpl = fetch, budget = null) {
  let tokP = null;
  const token = () => (tokP ||= tiktokAccessToken(env, fetchImpl, budget));
  const secrets = () => [env.TIKTOK_CLIENT_SECRET, env.TIKTOK_REFRESH_TOKEN];
  return {
    // POST <path> with a JSON body. The answer's "error.code" is "ok" on success, so every other code is a refusal.
    async post(path, body = {}) {
      const tok = await token();
      const { res, data } = await http(fetchImpl, budget, `${TIKTOK_HOST}${path}`, {
        method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json; charset=UTF-8' }, body: JSON.stringify(body),
      }, [tok, ...secrets()], timeoutMs(env), 'TikTok');
      const code = data?.error?.code;
      if (!res.ok || (code && code !== 'ok')) {
        if (code === 'access_token_invalid') await env.KV.delete('tt_token');
        throw new GraphError(`POST ${path} ${res.status}: ${hide(data?.error?.message || `HTTP ${res.status}`, [tok, ...secrets()])}`, { code: code || null, status: res.status, passing: TT_PASSING.has(code) || res.status >= 500 || res.status === 429 });
      }
      return data;
    },
    // One chunk of the video to the address TikTok gave (the whole URL, query included).
    async upload(url, body, { start, end, total }) {
      const { res, data } = await http(fetchImpl, budget, url, {
        method: 'PUT', headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${total}` }, body,
      }, [url, ...secrets()], uploadMs(env), 'TikTok');
      if ([200, 201, 206].includes(res.status)) return true;
      throw new GraphError(`PUT video chunk ${res.status}: ${hide(data?.error?.message || `HTTP ${res.status}`, [url, ...secrets()])}`, { code: data?.error?.code || null, status: res.status, passing: res.status >= 500 || res.status === 429 });
    },
  };
}
