#!/usr/bin/env node
// Makes a two-page placeholder website (a home page and a privacy policy) for a brand that has no website yet. Google
// will not move the YouTube sign-in out of "Testing" (where it ends after 7 days) until the OAuth consent screen has a
// homepage URL and a privacy policy URL, so this gives a brand something real to point at until its own site exists.
//
//   node publisher/scripts/placeholder-site.mjs <new folder> --email <contact email> [--name "Brand name"]
//
// It writes plain HTML, one stylesheet and the files Cloudflare needs, into a NEW or EMPTY folder (keep it outside the
// brand workspace, with your other code, for example ~/dev/<slug>-site). The brand's name comes from brand/brand.json
// (run inside the brand folder) or --name. The privacy text says what the publisher really does (one upload permission,
// a stored sign-in token, no viewer data); it is plain language, not legal advice: the owner reads it first, and the
// pages go public only when the owner says yes (docs/connect.md step 6B). Nothing is deployed or sent from here.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, readJSON, findBrand, Plain, isMain } from './lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, '..', 'placeholder-site');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slugOf = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'brand';

export function makeSite({ out, name, email, now = new Date() }) {
  if (!String(name || '').trim()) throw new Plain('the brand needs a name: run this inside the brand folder (brand/brand.json -> name) or give --name "Brand name"');
  if (!/^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(String(email || ''))) throw new Plain('--email takes the contact address the privacy page will show (it will be public), e.g. hello@yourbrand.com');
  const dir = path.resolve(out);
  if (fs.existsSync(dir) && fs.readdirSync(dir).length) throw new Plain(`${dir} is not empty: give a new or empty folder (nothing was written)`);
  const date = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const fill = (t) => t.replaceAll('{{BRAND}}', esc(name.trim())).replaceAll('{{EMAIL}}', esc(email)).replaceAll('{{DATE}}', date);
  const slug = slugOf(name);
  const write = (rel, text) => { const f = path.join(dir, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
  for (const rel of ['index.html', 'privacy/index.html', 'style.css']) write(rel, fill(fs.readFileSync(path.join(SRC, rel), 'utf8')));
  write('wrangler.jsonc', JSON.stringify({ name: `${slug}-site`, compatibility_date: '2026-11-10', assets: { directory: '.' } }, null, 2) + '\n');
  write('.assetsignore', 'wrangler.jsonc\nREADME.md\n.assetsignore\n.git\n.wrangler\nnode_modules\n');
  write('README.md', `# ${name.trim()} site (placeholder)\n\nA home page and a privacy policy, plain HTML. It exists so Google's OAuth consent screen has a homepage URL and a privacy\npolicy URL for the YouTube sign-in. Replace it with the real site when there is one, and change the two URLs on Google's\nBranding page (Google Cloud, Google Auth Platform, Branding).\n\nDeploy to Cloudflare (free): \`npx wrangler deploy\`. It prints the address.\n`);
  return { dir, files: ['index.html', 'privacy/index.html', 'style.css', 'wrangler.jsonc', '.assetsignore', 'README.md'] };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const out = args._[0];
  if (!out) throw new Plain('usage: node publisher/scripts/placeholder-site.mjs <new folder> --email <contact email> [--name "Brand name"]');
  const root = findBrand(process.cwd());
  const name = typeof args.name === 'string' ? args.name : root ? readJSON(path.join(root, 'brand', 'brand.json'), {})?.name : '';
  const r = makeSite({ out, name, email: args.email });
  console.log(`Wrote ${r.files.length} files in ${r.dir}. Read index.html and privacy/index.html first: they go public once deployed.\nThen, with the owner's yes: cd "${r.dir}" && npx wrangler deploy. Use the two addresses it serves (the home page and /privacy/) on Google's Branding page, with the address's domain under Authorized domains (docs/connect.md step 6B).`);
}

if (isMain(import.meta.url)) {
  main().catch((e) => { console.error(e instanceof Plain ? e.message : `Unexpected error: ${e?.message || e}`); process.exit(1); });
}
