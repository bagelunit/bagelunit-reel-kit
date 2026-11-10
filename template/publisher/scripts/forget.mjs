#!/usr/bin/env node
// Handle a "delete my data" request: removes every comment, reply and message record the publisher keeps for one
// Instagram username (or Instagram-scoped id), then the same person's lines in this brand folder. Run from the brand
// folder:
//
//   node publisher/scripts/forget.mjs <username>
//
// On the publisher: comment records match by username or id; message records hold only ids, so the publisher first
// finds the person's id(s) in their comment records and then removes every message to or from those ids. It works in
// pages (a request may make only so many storage calls), so this script asks again until the publisher says done.
// In the brand folder: the lines about the person in brand/inbox-log.md (written by pull.mjs and /comment-responder)
// and their entries in brand/publisher.json's inbox copy are removed too.
import fs from 'node:fs';
import path from 'node:path';
import { findBrand, brandSlug, connection, admin, read, readJSON, Plain, isMain, CONFIG_DIR } from './lib.mjs';

const MAX_CALLS = 200;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Lines in brand/inbox-log.md that name the person: "@<username>" or "@<id>" (pull.mjs writes the id when there is
// no username), as a whole name. Returns how many lines were removed.
export function forgetLocally(root, who, ids = []) {
  const names = [who, ...ids].map((x) => String(x || '').trim().replace(/^@/, '')).filter(Boolean);
  const re = new RegExp(`@(${names.map(esc).join('|')})(?![A-Za-z0-9._])`, 'i');
  let lines = 0, entries = 0;
  const logFile = path.join(root, 'brand', 'inbox-log.md');
  const text = read(logFile);
  if (text) {
    const keep = text.split('\n').filter((l) => !(l.startsWith('- ') && re.test(l)));
    lines = text.split('\n').length - keep.length;
    if (lines) fs.writeFileSync(logFile, keep.join('\n'));
  }
  const pubFile = path.join(root, 'brand', 'publisher.json');
  const pub = readJSON(pubFile, null);
  if (pub?.inbox) {
    const want = new Set(names.map((x) => x.toLowerCase()));
    const theirs = (r) => [r.username, r.from_id, r.to_id].some((x) => x && want.has(String(x).toLowerCase()));
    const drop = (list) => { const out = (list || []).filter((r) => !theirs(r)); entries += (list || []).length - out.length; return out; };
    pub.inbox.messages = drop(pub.inbox.messages);
    for (const k of Object.keys(pub.inbox.replies || {})) pub.inbox.replies[k] = drop(pub.inbox.replies[k]);
    if (entries) fs.writeFileSync(pubFile, JSON.stringify(pub, null, 2) + '\n');
  }
  return { lines, entries };
}

export async function forget(who, { root, fetchImpl = fetch, configDir = CONFIG_DIR, log = console.log } = {}) {
  if (!who) throw new Plain('usage: node publisher/scripts/forget.mjs <username>');
  const conn = connection(brandSlug(root), configDir);
  let removed = 0, next = null, r = null;
  for (let i = 0; i < MAX_CALLS; i++) {
    r = await admin(conn, 'POST', `/admin/forget?who=${encodeURIComponent(who)}${next ? `&next=${encodeURIComponent(next)}` : ''}`, { fetchImpl });
    removed += r.removed || 0;
    if (r.done !== false) break;
    next = r.next;
  }
  if (r?.done === false) throw new Plain(`Removed ${removed} record(s) for ${who} so far, but the publisher is not done yet: run the same command again.`);
  const ids = r?.ids || [];
  const local = forgetLocally(root, who, ids);
  log(`Removed ${removed} record(s) for ${who} from the publisher${ids.length ? ` (comments, and messages to or from their id${ids.length > 1 ? 's' : ''})` : ''}.`);
  log(`Removed ${local.lines} line(s) about them from brand/inbox-log.md${local.entries ? ` and ${local.entries} entr${local.entries === 1 ? 'y' : 'ies'} from brand/publisher.json` : ''}. If you keep notes about them anywhere else (a CRM, a spreadsheet), remove those too.`);
  log('Reply to the person to confirm it is done.');
  return { removed, ids, ...local };
}

if (isMain(import.meta.url)) {
  const root = findBrand(process.cwd());
  if (!root) { console.error('Run this inside the brand folder (where brand/brand.json is).'); process.exit(1); }
  forget(process.argv[2], { root }).catch((e) => { console.error(e instanceof Plain ? e.message : `Unexpected error: ${e?.message || e}`); process.exit(1); });
}
