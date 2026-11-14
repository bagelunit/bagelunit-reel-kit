// Test fakes: KV, R2 and a stand-in for Meta. No test touches the network.
import { createHash } from 'node:crypto';
import worker from '../src/worker.js';

// KV: values, metadata, list pages with cursors (sorted by key, like Cloudflare), and a count of operations so a test
// can check one request stays under Cloudflare's 1,000 KV operations.
export function kv(init = {}) {
  const m = new Map(Object.entries(init));
  const meta = new Map(); const ttl = new Map();
  const store = {
    m, meta, ttl, ops: 0,
    async get(k) { store.ops++; return m.has(k) ? m.get(k) : null; },
    async put(k, v, o = {}) {
      store.ops++; m.set(k, v);
      if (o.metadata !== undefined) meta.set(k, JSON.parse(JSON.stringify(o.metadata))); else meta.delete(k);
      if (o.expirationTtl) ttl.set(k, o.expirationTtl); else ttl.delete(k);
    },
    async delete(k) { store.ops++; m.delete(k); meta.delete(k); },
    async list({ prefix = '', cursor, limit = 1000 } = {}) {
      store.ops++;
      const all = [...m.keys()].filter((k) => k.startsWith(prefix)).sort();
      const from = cursor ? Number(cursor) : 0;
      const keys = all.slice(from, from + limit).map((name) => (meta.has(name) ? { name, metadata: meta.get(name) } : { name }));
      const end = from + limit >= all.length;
      return { keys, list_complete: end, ...(end ? {} : { cursor: String(from + limit) }) };
    },
  };
  return store;
}

export function r2() {
  const m = new Map(); const when = new Map(); const uploads = new Map();
  // R2 multipart, like the Workers binding: parts are kept per upload id and joined in partNumber order on complete.
  const resume = (key, uploadId) => ({
    key, uploadId,
    async uploadPart(n, body) {
      const u = uploads.get(uploadId); if (!u || u.key !== key) throw new Error('no such upload');
      const buf = Buffer.from(await new Response(body).arrayBuffer());
      const etag = createHash('md5').update(buf).digest('hex'); u.parts.set(n, { buf, etag });
      return { partNumber: n, etag };
    },
    async complete(parts) {
      const u = uploads.get(uploadId); if (!u || u.key !== key) throw new Error('no such upload');
      const bufs = parts.map((p) => { const got = u.parts.get(p.partNumber); if (!got || got.etag !== p.etag) throw new Error(`part ${p.partNumber} missing or wrong etag`); return got.buf; });
      const all = Buffer.concat(bufs); m.set(key, all); when.set(key, new Date()); uploads.delete(uploadId);
      return { key, size: all.length };
    },
    async abort() { uploads.delete(uploadId); },
  });
  return {
    m, when, uploads,
    async createMultipartUpload(key) { const uploadId = `u${uploads.size + 1}-${Date.now()}`; uploads.set(uploadId, { key, parts: new Map() }); return resume(key, uploadId); },
    resumeMultipartUpload: resume,
    async put(key, body, opts = {}) {
      const buf = Buffer.from(await new Response(body).arrayBuffer());
      if (opts.sha256 && createHash('sha256').update(buf).digest('hex') !== opts.sha256) throw new Error('sha256 mismatch');
      m.set(key, buf); when.set(key, new Date()); return { key, size: buf.length };
    },
    async head(key) { return m.has(key) ? { size: m.get(key).length } : null; },
    async get(key, opts = {}) {
      if (!m.has(key)) return null;
      let b = m.get(key);
      if (opts.range) b = b.subarray(opts.range.offset, opts.range.offset + opts.range.length);
      return { body: new Response(b).body, size: m.get(key).length };
    },
    async delete(key) { m.delete(key); when.delete(key); },
    async list({ prefix = '', cursor, limit = 1000 } = {}) {
      const all = [...m.keys()].filter((k) => k.startsWith(prefix)).sort();
      const from = cursor ? Number(cursor) : 0;
      const objects = all.slice(from, from + limit).map((key) => ({ key, size: m.get(key).length, uploaded: when.get(key) }));
      const truncated = from + limit < all.length;
      return { objects, truncated, ...(truncated ? { cursor: String(from + limit) } : {}) };
    },
  };
}

export const env = (x = {}) => ({
  KV: kv(), MEDIA: r2(), ADMIN_KEY: 'admin-key-for-tests', BRAND: 'testbrand',
  IG_USER_ID: '999', IG_TOKEN: 'IGTOKEN123', FB_PAGE_ID: 'PAGE1', FB_PAGE_TOKEN: 'FBTOKEN123', THREADS_USER_ID: 'TH1', THREADS_TOKEN: 'THTOKEN123',
  PUBLISH_MODE: 'live', ...x,
});
export const ctx = { waitUntil() {} };
export const auth = { Authorization: 'Bearer admin-key-for-tests' };
export const sha = (buf) => createHash('sha256').update(buf).digest('hex');

// A stand-in for Meta's APIs. `opts` changes answers: igStatus / thStatus / fbStatus are sequences, quotas, failures.
export function meta(opts = {}) {
  const calls = []; let n = 0;
  const counters = {};
  const next = (name, list) => { counters[name] = (counters[name] ?? -1) + 1; return list[Math.min(counters[name], list.length - 1)]; };
  const ok = (b) => new Response(JSON.stringify(b));
  const f = async (url, init = {}) => {
    const u = new URL(url);
    let body = null;
    if (init.body && /json/.test(init.headers?.['Content-Type'] || '')) body = JSON.parse(init.body);
    else if (init.body && /urlencoded/.test(init.headers?.['Content-Type'] || '')) body = Object.fromEntries(new URLSearchParams(init.body));
    else if (init.body instanceof FormData) body = Object.fromEntries([...init.body].map(([k, v]) => [k, typeof v === 'string' ? v : { file: v.name, size: v.size, type: v.type }]));
    calls.push({ url, host: u.host, path: u.pathname, query: Object.fromEntries(u.searchParams), method: init.method || 'GET', body, headers: init.headers || {} });
    const p = u.pathname; const fields = u.searchParams.get('fields') || '';
    if (opts.fail && Object.keys(opts.fail).some((k) => url.includes(k))) {
      const k = Object.keys(opts.fail).find((x) => url.includes(x));
      return new Response(JSON.stringify({ error: { message: opts.fail[k].message || 'refused', code: opts.fail[k].code ?? 100 } }), { status: opts.fail[k].status || 400 });
    }
    // Instagram
    if (/graph\.(instagram|facebook)\.com$/.test(u.host)) {
      if (p.endsWith('/999/media') && init.method === 'POST') return ok({ id: `C${++n}` });
      if (p.endsWith('/999/media_publish')) return ok({ id: 'MEDIA1' });
      if (p.endsWith('/999/content_publishing_limit')) return ok({ data: [{ quota_usage: opts.igQuota ?? 3, config: { quota_total: 50, quota_duration: 86400 } }] });
      if (fields.startsWith('status_code')) return ok({ status_code: next(`ig${p}`, opts.igStatus || ['FINISHED']) });
      if (fields === 'permalink') return ok({ permalink: 'https://www.instagram.com/reel/ABC123/' });
      if (fields === 'is_user_follow_business') {                    // Meta's User Profile API: opts.follows is { <id>: true|false|'missing' }
        const id = p.split('/').pop(); const v = opts.follows?.[id] ?? opts.follow;
        return v === 'missing' || v === undefined ? ok({ name: 'x' }) : ok({ is_user_follow_business: v });
      }
      if (p.endsWith('/messages') && opts.noCards && body?.message?.attachment) return new Response(JSON.stringify({ error: { message: 'templates not allowed here', code: 100 } }), { status: 400 });
      if (p.endsWith('/messages') && opts.noButtons && body?.message?.quick_replies) return new Response(JSON.stringify({ error: { message: 'quick replies not allowed here', code: 100 } }), { status: 400 });
      if (p.endsWith('/messages') || p.endsWith('/replies')) return ok({ id: 'x', message_id: 'm' });
      // Facebook Page
      if (p.endsWith('/PAGE1/video_reels') && body?.upload_phase === 'start') return ok({ video_id: 'V1', upload_url: 'https://rupload.facebook.com/video-upload/V1' });
      if (p.endsWith('/PAGE1/video_reels') && body?.upload_phase === 'finish') return ok({ success: true });
      if (fields === 'status') { const vs = next('fb', opts.fbStatus || ['ready']); return ok({ status: { video_status: vs, publishing_phase: { status: vs === 'ready' ? 'complete' : 'not_started' } } }); }
      if (fields === 'permalink_url') return ok({ permalink_url: '/reel/V1' });
      if (p.endsWith('/V1/thumbnails') && init.method === 'POST') return ok({ success: true });
    }
    if (u.host === 'rupload.facebook.com') return ok({ success: true });
    if (u.host === 'graph.threads.com') {
      if (p.endsWith('/refresh_access_token')) return ok({ access_token: 'NEWTHREADS', expires_in: 5183944 });
      if (p.endsWith('/TH1/threads') && init.method === 'POST') return ok({ id: 'T1' });
      if (p.endsWith('/TH1/threads_publish')) return ok({ id: 'TM1' });
      if (p.endsWith('/TH1/threads_publishing_limit')) return ok({ data: [{ quota_usage: opts.thQuota ?? 1, config: { quota_total: 250, quota_duration: 86400 } }] });
      if (fields.startsWith('status')) return ok({ status: next('th', opts.thStatus || ['FINISHED']) });
      if (fields === 'permalink') return ok({ permalink: 'https://www.threads.com/@testbrand/post/xyz' });
    }
    if (u.host === 'graph.instagram.com' && p.endsWith('/refresh_access_token')) return ok({ access_token: 'NEWIG', expires_in: 5183944 });
    return new Response(JSON.stringify({ error: { message: `fake meta has no answer for ${init.method || 'GET'} ${p}` } }), { status: 404 });
  };
  f.calls = calls;
  f.find = (pred) => calls.filter(pred);
  return f;
}

// The scripts talk to the real Worker code through this fetch (no network): the CLI's requests go to worker.fetch.
export function workerFetch(e) {
  const f = async (url, init = {}) => worker.fetch(new Request(url, init), e, ctx);
  return f;
}

export async function upload(e, buf, { type = 'video', name = type === 'video' ? 'reel.mp4' : 'cover.jpg', hash = sha(buf) } = {}) {
  const res = await worker.fetch(new Request(`https://pub.example/admin/upload?type=${type}&name=${name}`, { method: 'PUT', body: buf, headers: { ...auth, 'X-Content-SHA256': hash } }), e, ctx);
  return { status: res.status, json: await res.json() };
}
export async function schedule(e, data) {
  const res = await worker.fetch(new Request('https://pub.example/admin/schedule', { method: 'POST', body: JSON.stringify(data), headers: { ...auth, 'Content-Type': 'application/json' } }), e, ctx);
  return { status: res.status, json: await res.json() };
}
export const soon = (ms = 60000) => new Date(Date.now() + ms).toISOString();

// A small but real MP4: ftyp, moov with a movie header (mvhd) of the given length, and some media bytes.
// moovLast puts moov after the media (a file exported without +faststart); v1 uses the 64-bit header version.
export function mp4(seconds = 30, { moovLast = false, v1 = false, scale = 1000, body = 'fake mp4 media bytes' } = {}) {
  const box = (type, ...parts) => { const b = Buffer.concat(parts); const h = Buffer.alloc(8); h.writeUInt32BE(8 + b.length, 0); h.write(type, 4, 'latin1'); return Buffer.concat([h, b]); };
  const units = Math.round(seconds * scale);
  let mvhd;
  if (v1) { mvhd = Buffer.alloc(112); mvhd[0] = 1; mvhd.writeUInt32BE(scale, 20); mvhd.writeBigUInt64BE(BigInt(units), 24); }
  else { mvhd = Buffer.alloc(100); mvhd.writeUInt32BE(scale, 12); mvhd.writeUInt32BE(units, 16); }
  const moov = box('moov', box('free', Buffer.alloc(4)), box('mvhd', mvhd));
  const ftyp = box('ftyp', Buffer.from('isom\0\0\x02\0isomiso2avc1mp41', 'latin1'));
  const mdat = box('mdat', Buffer.from(body));
  return moovLast ? Buffer.concat([ftyp, mdat, moov]) : Buffer.concat([ftyp, moov, mdat]);
}
