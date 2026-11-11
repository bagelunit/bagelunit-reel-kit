#!/usr/bin/env node
// One refresh of the brand's dashboard: pull the Instagram, Facebook Page and Threads numbers (each if connected), redraw the calendar and
// dashboard, send the Telegram summary (if connected). This is what the scheduled job runs; you can run it by hand.
// No AI runs here, so it costs nothing. It posts nothing and approves nothing.
//
//   node .claude/skills/content-calendar/refresh.mjs [brand folder] [--no-instagram] [--no-telegram]
//
// Each part runs only when the brand owner turned it on in brand/brand.json -> dashboard (instagram, telegram, competitors).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { brandRoot, brandSlug, readJSON, writeStatus, CONFIG_DIR } from './lib.mjs';
import { build } from './calendar.mjs';
import { pull, Plain as IgError } from './instagram.mjs';
import { send, Plain as TgError } from './telegram.mjs';
import { publishLocked } from './host.mjs';
import { connected, pullFacebook, pullThreads } from './platforms.mjs';
import { due as competitorsDue, syncAll as syncCompetitors } from './competitors.mjs';

export async function refresh(root, { instagram = true, telegram = true } = {}) {
  const dash = readJSON(path.join(root, 'brand', 'brand.json')).dashboard || {};
  const lines = [];
  const say = (s) => { lines.push(s); console.log(s); };
  if (instagram && dash.instagram) {
    try {
      const r = await pull(root, { log: say });
      writeStatus(root, 'instagram', { ok: true, posts: r.posts });
      say(`Instagram: ${r.account.followers_count ?? '?'} followers, ${r.posts} posts, ${r.matched} matched to reels${r.added ? `, ${r.added} new insights row${r.added === 1 ? '' : 's'}` : ''}.`);
    } catch (e) {
      const msg = e instanceof IgError ? e.message : 'unexpected error (details hidden so no token can show)';
      writeStatus(root, 'instagram', { ok: false, error: msg });
      say(`Instagram: ${msg}`);
    }
  }
  const pubScript = path.join(root, 'publisher', 'scripts', 'pull.mjs');   // what the brand's publisher really did, if one is connected
  if (fs.existsSync(pubScript)) {
    try {
      const { pull: pullPublisher } = await import(pathToFileURL(pubScript).href);
      const conn = path.join(CONFIG_DIR, `publisher-${brandSlug(root)}.json`);
      if (fs.existsSync(conn)) { const r = await pullPublisher({ root, log: () => {} }); writeStatus(root, 'publisher', { ok: true }); say(`Publisher: ${r.posts} post${r.posts === 1 ? '' : 's'} read${r.added ? `, ${r.added} posting line${r.added === 1 ? '' : 's'} added` : ''}.`); }
    } catch (e) { const msg = e?.constructor?.name === 'Plain' ? e.message : 'unexpected error (details hidden so no key can show)'; writeStatus(root, 'publisher', { ok: false, error: msg }); say(`Publisher: ${msg}`); }
  }
  for (const [p, on] of Object.entries(connected(root))) {        // Facebook Page and Threads numbers: the token file, and the owner's yes (dashboard.facebook / .threads)
    if (!on || !dash[p]) continue;
    try {
      const r = p === 'facebook' ? await pullFacebook(root) : await pullThreads(root);
      writeStatus(root, p, { ok: true, posts: r.posts.length });
      say(`${p === 'facebook' ? 'Facebook' : 'Threads'}: ${(r.page || r.account).followers ?? '?'} followers, ${r.posts.length} post${r.posts.length === 1 ? '' : 's'} read.`);
    } catch (e) {
      const msg = e instanceof IgError ? e.message : 'unexpected error (details hidden so no token can show)';
      writeStatus(root, p, { ok: false, error: msg });
      say(`${p === 'facebook' ? 'Facebook' : 'Threads'}: ${msg}`);
    }
  }
  if (dash.competitors) {                                          // other accounts' public posts, through Meta only (never Apify: that costs money and is run by hand)
    try {
      if (!competitorsDue(root, Number(dash.competitors_every) || 7)) say('Competitors: read recently, nothing due.');
      else {
        const res = await syncCompetitors(root, { useApify: false });
        const ok = res.filter((r) => r.source).length;
        writeStatus(root, 'competitors', { ok: ok === res.length, error: ok === res.length ? undefined : `${res.length - ok} account${res.length - ok === 1 ? '' : 's'} could not be read` });
        say(`Competitors: ${ok} of ${res.length} account${res.length === 1 ? '' : 's'} read${ok < res.length ? ` (${res.filter((r) => !r.source).map((r) => '@' + r.handle).join(', ')} need an export, /content-calendar competitors)` : ''}.`);
      }
    } catch (e) { const msg = e instanceof IgError ? e.message : 'unexpected error (details hidden so no token can show)'; writeStatus(root, 'competitors', { ok: false, error: msg }); say(`Competitors: ${msg}`); }
  }
  if (['netlify', 'cloudflare', 'folder'].includes(dash.host)) {   // put the fresh page online before the summary links to it
    build(root);
    // the same lock as the background waiter, so two uploads never run at once
    try { const r = publishLocked(root); if (!r.queued) writeStatus(root, 'host', { ok: r.done, error: r.done ? undefined : r.note }); say(`Host: ${r.note}`); }
    catch (e) { writeStatus(root, 'host', { ok: false, error: e.message }); say(`Host: ${e.message}`); }
  }
  if (telegram && dash.telegram) {
    try { await send(root); writeStatus(root, 'telegram', { ok: true }); say('Telegram: summary sent.'); }
    catch (e) {
      const msg = e instanceof TgError ? e.message : 'unexpected error (details hidden so no token can show)';
      writeStatus(root, 'telegram', { ok: false, error: msg });
      say(`Telegram: ${msg}`);
    }
  }
  const M = build(root);                       // last, so the dashboard shows how the pull and the send went
  say(`Dashboard: ${M.stats.posted} posted, ${M.stats.scheduled} scheduled, ${M.attention.length} thing${M.attention.length === 1 ? '' : 's'} need you.`);
  const log = path.join(root, '.cache', 'refresh.log');
  fs.mkdirSync(path.dirname(log), { recursive: true });
  fs.appendFileSync(log, `${new Date().toISOString()}\n${lines.map((l) => `  ${l}`).join('\n')}\n`);
  return M;
}

const isMain = () => { try { return !!process.argv[1] && fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(path.resolve(process.argv[1])); } catch { return false; } };   // realpaths: a symlinked folder still runs
if (isMain()) {
  const args = process.argv.slice(2);
  const root = brandRoot(args.find((a) => !a.startsWith('--')));
  await refresh(root, { instagram: !args.includes('--no-instagram'), telegram: !args.includes('--no-telegram') });
}
