#!/usr/bin/env node
// Send the brand's daily summary to the owner's phone through their own Telegram bot. It only reports: no command
// sent to the bot does anything, and every approval stays in Claude Code.
//
//   node .claude/skills/content-calendar/telegram.mjs [brand folder] link   after you message your bot once: shows who wrote to it
//   node .claude/skills/content-calendar/telegram.mjs [brand folder] link --yes=<chat id>   saves that chat, once you confirmed it is you
//   node .claude/skills/content-calendar/telegram.mjs [brand folder] test   sends one test message
//   node .claude/skills/content-calendar/telegram.mjs [brand folder] send   sends the summary now
//   node .claude/skills/content-calendar/telegram.mjs [brand folder] show   prints the summary here, sends nothing
//
// Needs a file the brand owner writes themselves (docs/dashboard.md):
//   ~/.config/bagelunit-reels/telegram-<brand slug>.json  (or telegram.json for every brand)   {"token": "..."}
// `link --yes=<chat id>` adds "chat_id" to that file. The token is never printed.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { brandRoot, brandSlug, readJSON, secretFile, writeSecret, writeStatus, load, fmt, pct, signed, clip, stageName, CONFIG_DIR } from './lib.mjs';

class Plain extends Error {}
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

function config(root) {
  const slug = brandSlug(root);
  const file = secretFile('telegram', slug);
  if (!file) throw new Plain(`no Telegram bot for this brand: the owner creates ${path.join(CONFIG_DIR, `telegram-${slug}.json`)} with the bot's token (docs/dashboard.md)`);
  const cfg = readJSON(file, null);
  if (!cfg?.token) throw new Plain(`${file} has no "token"`);
  return { file, cfg };
}
async function call(cfg, method, body) {
  let res;
  try {
    res = await fetch(`${process.env.BAGELUNIT_TG_HOST || 'https://api.telegram.org'}/bot${cfg.token}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}), signal: AbortSignal.timeout(20000) });
  } catch (e) { throw new Plain(`could not reach Telegram (${e.cause?.code || e.name})`); }
  const r = await res.json().catch(() => ({}));
  if (!r.ok) throw new Plain(res.status === 401 ? 'Telegram does not accept the bot token (check it in the file, or make a new one with @BotFather)'
    : res.status === 403 ? 'the bot cannot message you: open the bot in Telegram and press Start' : String(r.description || `HTTP ${res.status}`).split(cfg.token).join('***'));
  return r.result;
}

// Telegram allows 4096 characters. Each part is trimmed before it is joined (whole lines only, each line built from
// escaped text), so a cut never falls inside a tag or an entity. A part is a string, or [heading, ...lines].
const LIMIT = 4000;
function fit(parts) {
  let out = '';
  for (const p of parts) {
    const lines = Array.isArray(p) ? p : [p];
    let block = '';
    for (const l of lines) {
      const next = block ? `${block}\n${l}` : l;
      if ((out ? out.length + 2 : 0) + next.length > LIMIT) break;
      block = next;
    }
    if (!block || (Array.isArray(p) && block === lines[0] && lines.length > 1)) continue;   // never a heading alone
    out = out ? `${out}\n\n${block}` : block;
  }
  return out;
}

// the summary: short enough to read on a lock screen
export function digest(M) {
  const S = M.stats, out = [];
  out.push(`<b>${esc(clip(M.name, 80))}</b> · ${esc(M.pretty(M.today, { weekday: 'short', month: 'short', day: 'numeric' }))}`);
  const nums = [];
  if (S.followers != null) nums.push(`${S.followers.toLocaleString('en-US')} followers${S.followers7 != null ? ` (${signed(S.followers7)} this week)` : ''}`);
  if (S.measured) nums.push(`${fmt(S.views7)} views on this week's posts · ${pct(S.engagement)} engagement`);
  nums.push(`${S.last7} posted this week · ${S.scheduled} scheduled · ${S.inProgress} in progress`);
  out.push(nums.join('\n'));
  const needs = M.attention.filter((a) => a.it.title !== 'Telegram summary');   // it is being sent, so it works
  if (needs.length) out.push(['<b>Needs you</b>', ...needs.slice(0, 5).map((a) => `• ${esc(clip(a.it.title, 50))}: ${esc(clip(a.what, 300))}`), ...(needs.length > 5 ? [`…and ${needs.length - 5} more`] : [])]);
  const up = [];
  for (let k = M.today; k <= M.addDays(M.today, 6); k = M.addDays(k, 1)) for (const e of M.byDay[k] || [])
    if (e.kind !== 'posted') up.push(`• ${esc(M.pretty(k))}${e.time ? ` ${e.time}` : ''}: ${esc(clip(e.it.title, 50))} (${e.kind === 'scheduled' ? 'scheduled' : stageName(e.it.stage).toLowerCase()})`);
  if (up.length) out.push(['<b>Next 7 days</b>', ...up.slice(0, 6)]);
  const open = M.openSlots.filter((k) => k <= M.addDays(M.today, 6));
  if (open.length) out.push(`Open slots: ${open.map((k) => esc(M.pretty(k))).join('; ')}. Type /content-calendar plan in Claude Code to fill them.`);
  const best = M.top.find((p) => p.at && M.now - p.at <= 7 * 864e5) || null;
  if (best) out.push(`Best this week: ${esc(clip(best.title, 50))}, ${fmt(best.nums.views)} views`);
  const idea = M.agents.find((a) => a.key === 'ideator')?.output[0];
  if (idea) out.push(`Next idea: ${esc(clip(idea.text, 70))}`);
  const d = M.brand.dashboard || {};
  const url = d.url && /^https:\/\//.test(d.url) && d.path_key ? `${d.url.replace(/\/+$/, '')}/${d.path_key}/` : null;
  if (url) out.push(`Dashboard: ${esc(url)}`);
  return fit(out);
}

export async function send(root, opts = {}) {
  const { cfg } = config(root);
  if (!cfg.chat_id) throw new Plain('no chat yet: message your bot once in Telegram, then run  telegram.mjs link');
  await call(cfg, 'sendMessage', { chat_id: cfg.chat_id, text: digest(load(root, opts)), parse_mode: 'HTML', disable_web_page_preview: true });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const verbs = ['link', 'test', 'send', 'show'];
  const verb = args.find((a) => verbs.includes(a)) || 'show';
  const root = brandRoot(args.find((a) => !a.startsWith('--') && !verbs.includes(a)));
  try {
    if (verb === 'show') { console.log(digest(load(root)).replace(/<\/?b>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')); process.exit(0); }
    const { file, cfg } = config(root);
    if (verb === 'link') {
      // anyone can message a bot, so the kit shows who did and saves a chat only after the owner confirmed it is theirs
      const updates = await call(cfg, 'getUpdates', { limit: 50 });
      const chats = new Map();
      for (const m of [...updates].reverse().map((u) => u.message || u.edited_message)) if (m?.chat?.type === 'private' && !chats.has(String(m.chat.id))) chats.set(String(m.chat.id), m.chat);
      const label = (c) => `${[c.first_name, c.last_name].filter(Boolean).join(' ') || 'no name'}${c.username ? ` (@${c.username})` : ''}, chat ${c.id}`;
      const pick = args.find((a) => a.startsWith('--yes='))?.slice(6);
      if (!chats.size) throw new Plain('no message found: open your bot in Telegram, press Start or send "hi", then run link again');
      if (!pick) {
        console.log(`${chats.size === 1 ? 'This person has' : 'These people have'} messaged the bot (newest first):`);
        for (const c of chats.values()) console.log(`  ${label(c)}`);
        console.log('Nothing was saved. If one of them is you, run: telegram.mjs link --yes=<your chat id>. If you do not know someone here, do not pick them.');
      } else {
        const c = chats.get(pick);
        if (!c) throw new Plain(`chat ${pick} has not messaged the bot recently: run telegram.mjs link to see who has`);
        cfg.chat_id = c.id;
        writeSecret(file, cfg);
        console.log(`Linked to ${label(c)}. Now run: telegram.mjs test`);
      }
    } else if (verb === 'test') {
      if (!cfg.chat_id) throw new Plain('no chat yet: message your bot once, then run  telegram.mjs link');
      await call(cfg, 'sendMessage', { chat_id: cfg.chat_id, text: `Test from the BagelUnit Reel Kit: summaries for ${load(root).name} will come here.` });
      console.log('Sent a test message. Check your phone.');
    } else {
      await send(root);
      writeStatus(root, 'telegram', { ok: true });
      console.log('Sent the summary to Telegram.');
    }
  } catch (e) {
    const msg = e instanceof Plain ? e.message : 'unexpected error (details hidden so no token can show)';
    if (verb === 'send') writeStatus(root, 'telegram', { ok: false, error: msg });
    console.error(`Telegram: ${msg}`);
    process.exit(1);
  }
}

export { Plain };
