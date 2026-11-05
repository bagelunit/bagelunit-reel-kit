// server.mjs · the local HTTP server reel pages are opened from (renders, stills, the live preview). Files stream straight from disk.
// URL → folder, first match wins:
//   /mode/…     studio/modes/<style>/…   the mode's runtime, parts and helpers
//   /fonts/…    studio/fonts/…           bundled fonts plus anything glyphs.py fetched
//   /studio/…   studio/…                 the rest of the kit (three.js sits in studio/node_modules)
//   /…          the reel folder           shots, build/, audio/, assets/
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { dirname, extname, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SKILL = resolve(dirname(fileURLToPath(import.meta.url)), '..');   // the studio/ folder

const CONTENT = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.txt': 'text/plain',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.mp4': 'video/mp4',
};

// the route table as [regex, folder]; the regex captures the rest of the path
function routes(projectDir, style) {
  return [[/^\/mode\/(.*)$/, `${SKILL}/modes/${style}`], [/^\/fonts\/(.*)$/, `${SKILL}/fonts`], [/^\/studio\/(.*)$/, SKILL], [/^\/(.*)$/, resolve(projectDir)]]
    .map(([re, folder]) => [re, resolve(folder)]);
}

// the file for a URL path, or null when no route fits or the path would leave its folder
function fileFor(table, urlPath) {
  for (const [re, folder] of table) {
    const m = urlPath.match(re);
    if (!m) continue;
    const file = normalize(`${folder}${sep}${m[1] || 'index.html'}`);
    return file === folder || file.startsWith(folder + sep) ? file : null;
  }
  return null;
}

export function serve(projectDir, style, port = 0) {
  const table = routes(projectDir, style);
  const server = createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://local').pathname);
    const file = fileFor(table, urlPath);
    let size = -1;
    try { if (file && statSync(file).isFile()) size = statSync(file).size; } catch {}
    if (size < 0) { res.statusCode = 404; res.end(file ? `missing: ${urlPath}` : ''); return; }
    res.setHeader('Content-Type', CONTENT[extname(file).toLowerCase()] || 'application/octet-stream');
    res.setHeader('Content-Length', size);
    res.setHeader('Cache-Control', 'no-store');
    createReadStream(file).on('error', () => res.destroy()).pipe(res);
  });
  return new Promise((done) => {
    server.once('listening', () => done({ server, url: `http://127.0.0.1:${server.address().port}` }));
    server.listen({ port, host: '127.0.0.1' });
  });
}
