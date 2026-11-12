// The watch section of the dashboard: the sources a brand keeps an eye on (news pages, release notes, changelogs, trade
// press, a regulator, a supplier) and the newest items seen there. Read only: Claude fills brand/watch.json when the
// owner asks (/content-calendar watch); the daily refresh only redraws it. Nothing in it is a cleared fact: an item
// reaches a script only after it is checked on the source's own page and added to brand/facts.md (house rule 1).
//
// brand/watch.json:
// { "title": "News watch",            the section's name on the page; the owner renames it ("AI watch", "Market watch")
//   "group_word": "source",           what one group is called ("platform", "company", "regulator"), default "source"
//   "fresh_days": 14,                 how far back "Newest" goes
//   "updated": "2026-11-12",          when Claude last read the sources
//   "groups": [ { "id": "acme", "name": "Acme",
//     "sources": [ { "label": "News", "url": "https://...", "kind": "news|notes|github|feed|other", "checked": "2026-11-12", "note": "" } ],
//     "items":   [ { "date": "2026-11-09", "title": "...", "url": "https://...", "status": "new|checked|cleared|planned|used|skip",
//                    "reel": "<slug or empty>", "note": "..." } ] } ] }
// "platforms" is read as another name for "groups".
import fs from 'node:fs';
import path from 'node:path';

export const WATCH_FILE = (root) => path.join(root, 'brand', 'watch.json');
export const STATUSES = ['new', 'checked', 'cleared', 'planned', 'used', 'skip'];
export const DEFAULT_TITLE = 'News watch';
const str = (v) => (typeof v === 'string' ? v.trim() : '');
const https = (u) => (/^https:\/\/[^\s"'<>\\]+$/i.test(str(u)) ? str(u) : '');
const day = (v) => (/^\d{4}-\d{2}-\d{2}/.test(str(v)) ? str(v).slice(0, 10) : '');

export function loadWatch(root, { now = Date.now() } = {}) {
  let raw = null;
  try { raw = JSON.parse(fs.readFileSync(WATCH_FILE(root), 'utf8')); } catch { /* none yet, or not valid JSON */ }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) raw = {};
  const list = Array.isArray(raw.groups) ? raw.groups : Array.isArray(raw.platforms) ? raw.platforms : [];
  const groups = list.filter((g) => g && typeof g === 'object').map((g) => {
    const items = (Array.isArray(g.items) ? g.items : []).filter((i) => i && typeof i === 'object').map((i) => ({
      date: day(i.date), title: str(i.title), url: https(i.url), reel: str(i.reel), note: str(i.note),
      status: STATUSES.includes(str(i.status)) ? str(i.status) : 'new',
    })).filter((i) => i.title).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const sources = (Array.isArray(g.sources) ? g.sources : []).filter((s) => s && typeof s === 'object').map((s) => ({
      label: str(s.label) || 'Source', url: https(s.url), kind: str(s.kind), checked: day(s.checked), note: str(s.note),
    })).filter((s) => s.url);
    const name = str(g.name) || str(g.id);
    return { id: str(g.id) || name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name, sources, items };
  }).filter((g) => g.name);
  const freshDays = Math.min(90, Math.max(1, Math.round(Number(raw.fresh_days) || 14)));
  const cutoff = now - freshDays * 864e5;
  const all = groups.flatMap((g) => g.items.map((i) => ({ ...i, group: g.name })));
  const fresh = all.filter((i) => i.date && Date.parse(i.date) >= cutoff).sort((a, b) => b.date.localeCompare(a.date));
  const open = all.filter((i) => ['new', 'checked', 'cleared'].includes(i.status));
  const word = str(raw.group_word).toLowerCase() || 'source';
  return {
    any: groups.length > 0, title: str(raw.title).slice(0, 40) || DEFAULT_TITLE, word, words: word.endsWith('s') ? word : `${word}s`,
    updated: day(raw.updated), groups, fresh, freshDays,
    counts: { groups: groups.length, sources: groups.reduce((n, g) => n + g.sources.length, 0), items: all.length, fresh: fresh.length, open: open.length },
  };
}
