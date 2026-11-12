#!/usr/bin/env node
// The caption layout and its checks. A reel's caption (reels/<slug>/out/caption.txt) is three blocks with ONE blank line
// between them, and nothing else:
//
//   <the caption: a first line that earns the "more" tap, a few short lines, one ask>
//
//   #tag #tag #tag #tag #tag                      <- 3 to 5 hashtags, on their own line (Instagram allows 5 at most)
//
//   keyword phrase, another phrase, a third one   <- 8 to 15 plain search phrases, comma separated, no # signs
//
// Hashtags live only in that line, never inside the caption and never in a comment. The keyword line is what people
// type into Instagram's search (for a home baker, "sourdough starter for beginners"); it sits last because the first line and the first lines of
// the caption are what a viewer reads before "more".
//
//   node .claude/skills/caption-and-hashtags/caption.mjs check <reel>      says what is wrong (exit 1 when something is)
//   node .claude/skills/caption-and-hashtags/caption.mjs fix <reel>        tidies the spacing only (never changes a word)
//   node .claude/skills/caption-and-hashtags/caption.mjs keywords <reel>   candidate phrases from the reel's script, the
//                                                                          researched captions and the audience research
// <reel> is a folder, reels/<slug> or a slug; --file <path> checks another text file (out/platforms/tiktok.txt).
// Candidate phrases are counts, not advice: pick only phrases that describe THIS reel, and never one it does not cover.
// Everything is tailored to the brand: brand.json -> niche (topic, audience, keywords, tags) is where the steady phrases and tags
// come from, and check notes any keyword that shares no word with the caption, the script or the niche.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { resolveReelArg } from '../../../publisher/scripts/reels.mjs';
import { findBrand, readJSON, parseArgs, Plain } from '../../../publisher/scripts/lib.mjs';
import { tagsOf, load as loadResearch } from '../content-calendar/hashtags.mjs';

export const MAX_TAGS = 5, MIN_TAGS = 3, MIN_KEYWORDS = 8, MAX_KEYWORDS = 15, HARD_MAX_KEYWORDS = 20, MAX_CHARS = 2200;
const TAG = '#[\\p{L}\\p{N}_]+';
const tagLine = new RegExp(`^${TAG}(?:[ \\t]+${TAG})*$`, 'u');

// Splits a caption into its blocks: the paragraphs before the hashtag line, the hashtag line, and what follows it.
export function parseCaption(text) {
  // a hashtag-only line is always its own block, even when it was typed straight under (or over) another line
  const spaced = String(text ?? '').replace(/\r\n?/g, '\n').split('\n').map((l) => (tagLine.test(l.trim()) ? `\n${l.trim()}\n` : l)).join('\n');
  const paras = spaced.split(/\n[ \t]*\n/).map((p) => p.split('\n').map((l) => l.trimEnd()).join('\n').trim()).filter(Boolean);
  const ti = paras.findIndex((p) => tagLine.test(p));
  return ti < 0 ? { body: paras, tags: null, after: [] } : { body: paras.slice(0, ti), tags: paras[ti], after: paras.slice(ti + 1) };
}
export const phrases = (p) => String(p || '').split(',').map((x) => x.trim()).filter(Boolean);

// Plain-words problems (empty means the layout is right) and softer notes.
export function checkCaption(text, { banned = {}, reference = '' } = {}) {
  const problems = [], notes = [];
  const raw = String(text ?? '').replace(/\r\n?/g, '\n');
  if (!raw.trim()) return { problems: ['the caption is empty'], notes };
  const { body, tags, after } = parseCaption(raw);
  if (!body.length) problems.push(tags ? 'the caption has no text before the hashtags' : 'the caption has no text');
  if (!tags) problems.push('there is no hashtag line: put 3 to 5 hashtags on their own line after the caption, with a blank line before it');
  else {
    const n = tags.split(/\s+/).length;
    if (n > MAX_TAGS) problems.push(`the hashtag line has ${n} hashtags; Instagram allows ${MAX_TAGS} (pick the ${MIN_TAGS} to ${MAX_TAGS} that fit best)`);
    else if (n < MIN_TAGS) notes.push(`only ${n} hashtag${n === 1 ? '' : 's'}: ${MIN_TAGS} to ${MAX_TAGS} is the plan`);
    if (new Set(tagsOf(tags)).size !== n) problems.push('a hashtag is repeated in the hashtag line');
    for (const [where, ps] of [['the caption', body], ['the keyword line', after]]) if (ps.some((p) => new RegExp(TAG, 'u').test(p))) problems.push(`there is a hashtag inside ${where}: hashtags go only in the hashtag line`);
    if (!after.length) problems.push(`there is no keyword line: add ${MIN_KEYWORDS} to ${MAX_KEYWORDS} search phrases, comma separated, in a block after the hashtags (blank line between)`);
    else if (after.length > 1) problems.push('more than one block after the hashtags: the keywords are ONE comma-separated block, last in the caption');
    else {
      const ks = phrases(after[0]);
      const lower = ks.map((k) => k.toLowerCase());
      if (ks.length < MIN_KEYWORDS) problems.push(`the keyword line has ${ks.length} phrase${ks.length === 1 ? '' : 's'}; ${MIN_KEYWORDS} to ${MAX_KEYWORDS} is the plan`);
      if (ks.length > HARD_MAX_KEYWORDS) problems.push(`the keyword line has ${ks.length} phrases; more than ${HARD_MAX_KEYWORDS} reads as keyword stuffing, keep it to ${MAX_KEYWORDS} at most`);
      else if (ks.length > MAX_KEYWORDS) notes.push(`${ks.length} keyword phrases: ${MAX_KEYWORDS} or fewer reads better`);
      if (new Set(lower).size !== lower.length) problems.push('a keyword phrase is repeated');
      const long = ks.filter((k) => k.split(/\s+/).length > 5); if (long.length) problems.push(`keyword phrases are short search terms (5 words at most): "${long[0]}"`);
      if (ks.some((k) => k.length < 3)) problems.push('a keyword phrase is too short to be a search term');
      // tailored means relevant: a phrase with no word in common with the caption, the script or the niche is probably not about this reel
      const known = new Set(contentWords(`${body.join(' ')} ${reference}`));
      if (known.size) for (const k of ks) { const w = contentWords(k); if (w.length && !w.some((x) => known.has(x))) notes.push(`"${k}" shares no word with the caption, the script or the niche: does it describe this reel?`); }
      if (/[.!?]\s*$/.test(after[0]) || /\n/.test(after[0])) notes.push('the keyword line reads like a sentence or spans lines: it should be one line of phrases separated by commas');
    }
  }
  // spacing: one blank line between blocks, nothing more
  if (/\n[ \t]*\n[ \t]*\n/.test(raw.trim())) problems.push('more than one blank line in a row: use exactly one blank line between blocks (the fix command tidies it)');
  if (/[ \t]+\n/.test(raw) || /[ \t]+$/.test(raw.replace(/\n$/, ''))) notes.push('spaces at the end of a line (the fix command removes them)');
  if (tags) {
    const lines = raw.split('\n'); const i = lines.findIndex((l) => l.trim() === tags.split('\n')[0].trim());
    if (i > 0 && lines[i - 1].trim() !== '') problems.push('the hashtag line must have a blank line before it (the fix command adds it)');
    if (i >= 0 && i + 1 < lines.length && lines[i + 1].trim() !== '') problems.push('the keyword line must have a blank line between it and the hashtags (the fix command adds it)');
  }
  if (/ {2,}#/.test(raw) || /#[\p{L}\p{N}_]+ {2,}#/u.test(raw)) notes.push('extra spaces between hashtags: one space each');
  if ([...raw.trim()].length > MAX_CHARS) problems.push(`the caption is ${[...raw.trim()].length} characters; Instagram allows ${MAX_CHARS.toLocaleString('en-US')}`);
  const first = (body[0] || '').split('\n')[0]; if ([...first].length > 125) notes.push(`the first line is ${[...first].length} characters; under 125 shows in full before "more"`);
  for (const c of banned.banned_characters || []) if (raw.includes(c)) problems.push(`the caption has the banned character "${c}" (brand.json -> writing)`);
  for (const w of banned.banned_words || []) if (w && new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(raw)) problems.push(`the caption has the banned word "${w}" (brand.json -> writing)`);
  if (!raw.endsWith('\n')) notes.push('the file should end with one newline (the fix command adds it)');
  return { problems, notes };
}

// Spacing only: one blank line between blocks, single spaces in the hashtag line and after commas in the keyword line.
export function fixCaption(text) {
  const { body, tags, after } = parseCaption(text);
  const out = [...body];
  if (tags) out.push(tags.split(/\s+/).join(' '));
  for (const a of after) out.push(a.includes(',') && !a.includes('\n') ? phrases(a).join(', ') : a);
  return out.join('\n\n') + '\n';
}

// ---------- candidate keyword phrases ----------
function contentWords(t) { return clauses(t).flat().filter((w) => !STOP.has(w) && !CTA.has(w) && w.length > 2 && !/^\d+$/.test(w)); }
const STOP = new Set('a an and are as at be been but by can could do does for from had has have how i if in into is it its just like me more most my no not of on or our out so than that the their them then there these they this to up us was we were what when where which who why will with you your about after all also any because get got here make makes made need needs one only other over same some such too very want way while within without would isn don didn doesn wasn aren couldn wouldn shouldn won hasn haven ll ve re d s t m'.split(' '));
// words that belong to a call to action, not to what a reel is about: a phrase holding one is never a keyword candidate
const CTA = new Set('comment comments dm dms follow followed following link bio send sent reply subscribe save share like likes tap click'.split(' '));
// clauses first (a phrase never crosses a full stop, comma or line break), then words; contractions drop their ending (i'll -> i)
const clauses = (t) => String(t || '').toLowerCase().replace(/https?:\/\/\S+/g, ' ').replace(/#[\p{L}\p{N}_]+/gu, ' ').replace(/['\u2019][a-z]+/g, '').split(/[.!?,;:()"\u201c\u201d|\n\u2013\u2014]+/).map((c) => c.replace(/[^\p{L}\p{N}\s-]/gu, ' ').split(/\s+/).filter(Boolean)).filter((c) => c.length);
function ngrams(text, sizes = [2, 3]) {
  const seen = new Set();
  for (const w of clauses(text)) for (const n of sizes) for (let i = 0; i + n <= w.length; i++) {
    const g = w.slice(i, i + n);
    if (STOP.has(g[0]) || STOP.has(g[n - 1]) || g.some((x) => x.length < 2 || /^\d+$/.test(x) || CTA.has(x))) continue;
    seen.add(g.join(' '));
  }
  return seen;                                        // one count per text, however often it repeats inside it
}
// script: [text lines]; accounts: { name: [captions] }; audience: [lines]
export function candidates({ script = '', accounts = {}, audience = [] }, { top = 15 } = {}) {
  const lines = String(script).split(/\n/).filter((l) => l.trim() && !/^\s*(#|\/\/|\[)/.test(l));
  const freq = new Map(); for (const l of lines) for (const c of clauses(l)) for (const w of c) if (!STOP.has(w) && !CTA.has(w) && w.length > 2) freq.set(w, (freq.get(w) || 0) + 1);
  const weight = (g) => g.split(' ').reduce((t, w) => t + (freq.get(w) || 0), 0);   // phrases made of the words the script keeps coming back to rank first
  const count = (texts) => { const c = new Map(); for (const t of texts) for (const g of ngrams(t)) c.set(g, (c.get(g) || 0) + 1); return c; };
  const sc = count(lines);
  const script_ = [...sc].sort((a, b) => b[1] - a[1] || weight(b[0]) - weight(a[0]) || a[0].length - b[0].length).slice(0, top).map(([phrase, n]) => ({ phrase, n }));
  // researched captions: 3 or more posts from 2 or more accounts, so one account's habits (and its call to action) never lead
  const posts = new Map(), who = new Map();
  for (const [name, texts] of Object.entries(accounts)) for (const t of texts) for (const g of ngrams(t)) { posts.set(g, (posts.get(g) || 0) + 1); (who.get(g) || who.set(g, new Set()).get(g)).add(name); }
  const researched = [...posts].filter(([g, n]) => n >= 3 && who.get(g).size >= 2).sort((a, b) => b[1] - a[1] || b[0].length - a[0].length).slice(0, top).map(([phrase, n]) => ({ phrase, n, accounts: who.get(phrase).size }));
  const ac = count(audience);
  const audience_ = [...ac].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1] || b[0].length - a[0].length).slice(0, top).map(([phrase, n]) => ({ phrase, n }));
  return { script: script_, researched, audience: audience_ };
}

function reelFile(reelArg, args) {
  const reel = resolveReelArg(reelArg);
  if (!fs.existsSync(reel)) throw new Plain(`no reel folder "${reelArg}"`);
  return { reel, file: typeof args.file === 'string' ? path.resolve(args.file) : path.join(reel, 'out', 'caption.txt') };
}

const nicheText = (n) => [n?.topic, n?.audience, ...(n?.keywords || []), ...(n?.tags || [])].filter(Boolean).join(' ');

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [cmd, reelArg] = args._;
  if (!['check', 'fix', 'keywords'].includes(cmd) || !reelArg) throw new Plain('usage: caption.mjs check|fix|keywords <reel folder, reels/<slug> or slug> [--file <path>]');
  const { reel, file } = reelFile(reelArg, args);
  const root = findBrand(reel);
  const read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
  if (cmd === 'keywords') {
    const script = read(path.join(reel, 'script.txt'));
    const research = root ? loadResearch(root) : { accounts: {} };
    const accounts = Object.fromEntries(Object.entries(research.accounts).map(([k, v]) => [k, v.map((p) => p.caption).filter(Boolean)]));
    const dir = root ? path.join(root, 'brand', 'research') : '';
    const audience = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^demand.*\.md$/.test(f)).flatMap((f) => read(path.join(dir, f)).split(/\n+/)) : [];
    const c = candidates({ script, accounts, audience });
    const niche = (root ? readJSON(path.join(root, 'brand', 'brand.json'), {}) : {}).niche || {};
    console.log('Candidate keyword phrases (counts of how many posts, lines or questions they appear in). Pick only phrases that describe THIS reel.\n');
    console.log("From the brand's niche setup (its steady phrases; use the ones that fit this reel):"); console.log((niche.keywords || []).length ? niche.keywords.map((k) => `  ${k}`).join('\n') : '  not set yet: /caption-and-hashtags asks for the niche on first use (brand.json -> niche)'); console.log('');
    for (const [label, list] of [['From this reel\'s script', c.script], ['On researched accounts\' captions (3+ posts from 2+ accounts)', c.researched], ['In the audience research (2+ mentions)', c.audience]]) {
      console.log(`${label}:`); console.log(list.length ? list.map((x) => `  ${x.phrase}  (${x.n}${x.accounts ? `, ${x.accounts} accounts` : ''})`).join('\n') : '  none yet'); console.log('');
    }
    return;
  }
  if (!fs.existsSync(file)) throw new Plain(`${path.relative(process.cwd(), file) || file} does not exist yet: write the caption first (/caption-and-hashtags)`);
  const text = read(file);
  if (cmd === 'fix') {
    const fixed = fixCaption(text);
    if (fixed === text) console.log('The spacing is already right. Nothing changed.'); else { fs.writeFileSync(file, fixed); console.log(`Tidied the spacing in ${path.relative(process.cwd(), file) || file} (no word changed).`); }
    return;
  }
  const brand = root ? readJSON(path.join(root, 'brand', 'brand.json'), {}) : {};
  const reference = `${read(path.join(reel, 'script.txt'))} ${nicheText(brand.niche)}`;
  const { problems, notes } = checkCaption(text, { banned: brand?.writing || {}, reference });
  for (const p of problems) console.log(`- ${p}`);
  for (const n of notes) console.log(`  note: ${n}`);
  if (problems.length) { console.log(`\nCaption layout: ${problems.length} problem${problems.length === 1 ? '' : 's'}.`); process.exitCode = 1; }
  else console.log('Caption layout is right: caption, hashtags, keywords, one blank line between each.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch((e) => { console.error(e instanceof Plain ? e.message : `Unexpected error: ${e?.message || e}`); process.exit(1); });
}
