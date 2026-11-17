#!/usr/bin/env node
// Watch the dashboard live on this computer or a phone on the same Wi-Fi. Free, and nothing leaves your network.
//
//   node .claude/skills/content-calendar/serve.mjs [brand folder] [--port 4321]
//
// It redraws the dashboard whenever a file in brand/ or reels/ changes and the open page reloads by itself.
// It is plain HTTP (not encrypted) and listens on every network this computer is on (Wi-Fi, a VPN, a wired network),
// so use it only on a network you trust. The address has a private key in it, so another person on the same network
// cannot just guess it. Stop with Ctrl+C.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { brandRoot } from './lib.mjs';
import { build } from './calendar.mjs';
import { queuePublish } from './host.mjs';
import { edit as editIdea, remove as removeIdea } from './ideas-store.mjs';
import { resolve as previewFile, send as sendFile, rewrite as previewsFor } from './previews.mjs';

const args = process.argv.slice(2);
const root = brandRoot(args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--port'));
const port = Number(args[args.indexOf('--port') + 1]) || 4321;
const keyFile = path.join(root, '.cache', 'serve-key');
fs.mkdirSync(path.dirname(keyFile), { recursive: true });
const key = fs.existsSync(keyFile) ? fs.readFileSync(keyFile, 'utf8').trim() : crypto.randomBytes(9).toString('base64url');
fs.writeFileSync(keyFile, key + '\n', { mode: 0o600 });

const page = path.join(root, 'brand', 'dashboard.html');
const clients = new Set();
let timer = null, building = false;
function rebuild(why) {
  if (building) return;
  building = true;
  try { build(root); queuePublish(root); console.log(`${new Date().toLocaleTimeString()}  redrawn${why ? ` (${why})` : ''}`); for (const c of clients) c.write('data: reload\n\n'); }
  catch (e) { console.error(`Could not redraw: ${e.message}`); }
  finally { building = false; }
}
rebuild();

// the redraw's own files, and the hidden temp files it writes them through (lib.mjs writeAtomic), never start a redraw
const own = [path.join(root, 'brand', 'calendar.md'), path.join(root, 'brand', 'dashboard.html')];
const ours = (f) => /\.tmp$/i.test(f) || own.some((o) => f === o || f.startsWith(o + '.'));
for (const dir of ['brand', 'reels', '.cache']) {
  const full = path.join(root, dir);
  if (!fs.existsSync(full)) continue;
  try {
    fs.watch(full, { recursive: true }, (_e, file) => {
      if (!file) return;
      const f = path.join(full, file.toString());
      if (ours(f) || /[/\\](build|audio|stills|scenes|node_modules|vo_raw|host)[/\\]/.test(f)) return;
      if (dir === '.cache' && !/refresh-status\.json$/.test(f)) return;   // only a pull or send result matters here
      clearTimeout(timer); timer = setTimeout(() => rebuild(path.relative(root, f)), 700);
    });
  } catch { console.log(`Live redraw is not available for ${dir}/ on this system; refresh the page by hand.`); }
}

const live = `<script>(()=>{const r=document.documentElement,s=new EventSource(location.pathname.replace(/\\/?$/,'/')+'events');s.onopen=()=>{r.dataset.live='1'};s.onerror=()=>{delete r.dataset.live};s.onmessage=()=>location.reload();})();</script>`;   // the page keeps its place across reloads (client.js)
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const base = `/${key}`;
  if (url.pathname === base) { res.writeHead(302, { Location: base + '/' }); return res.end(); }
  if (url.pathname === `${base}/events`) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    res.write(': hi\n\n'); clients.add(res); req.on('close', () => clients.delete(res)); return;
  }
  if (url.pathname === `${base}/`) {
    let html;
    try { html = fs.readFileSync(page, 'utf8'); }
    catch { res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': '5' }); return res.end('The dashboard is being drawn. Reload in a few seconds.'); }
    html = previewsFor(html.replace(/<a href="(?!https?:)[^"]*">([^<]*)<\/a>/g, '$1'), 'served').replace('</body>', `${live}</body>`);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', 'Referrer-Policy': 'no-referrer' });
    return res.end(html);
  }
  // the post ideas: edit or remove one row of brand/ideas.md (the page's Edit and Remove buttons). The private key in the address
  // is the gate; a request from another web page (a different Origin) is refused as well.
  if (url.pathname === `${base}/ideas` && req.method === 'POST') {
    const reply = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) return reply(403, { error: 'Not allowed from another page.' });
    if (!String(req.headers['content-type'] || '').startsWith('application/json')) return reply(415, { error: 'JSON only.' });
    let raw = ''; let big = false;
    req.on('data', (c) => { raw += c; if (raw.length > 20000) { big = true; req.destroy(); } });
    req.on('end', () => {
      if (big) return;
      try {
        const b = JSON.parse(raw || '{}');
        if (b.action === 'remove') removeIdea(root, String(b.id));
        else if (b.action === 'edit') editIdea(root, String(b.id), b.changes);
        else return reply(400, { error: 'Unknown action.' });
        rebuild('ideas'); return reply(200, { ok: true });
      } catch (e) { return reply(400, { error: e.message }); }
    });
    return;
  }
  // an approved reel's final and cover, for the page's players (only reels listed in .cache/previews.json)
  if (url.pathname.startsWith(`${base}/preview/`) && ['GET', 'HEAD'].includes(req.method)) {
    const f = previewFile(root, url.pathname.slice(base.length + 9));
    if (f) return sendFile(req, res, f);
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not here.');
}).listen(port, '0.0.0.0', () => {
  const lan = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  console.log(`Dashboard is live. Keep this window open; Ctrl+C stops it.\n  On this computer:  http://localhost:${port}/${key}/`);
  for (const ip of lan) console.log(`  On your phone (same Wi-Fi):  http://${ip}:${port}/${key}/`);
  console.log('The address is private to you: do not share it. It redraws when your files change.');
  console.log('It is plain HTTP on every network this computer is on (Wi-Fi and any VPN): use it only on a network you trust.');
}).on('error', (e) => { console.error(e.code === 'EADDRINUSE' ? `Port ${port} is busy: add --port 4322` : e.message); process.exit(1); });
