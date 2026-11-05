#!/usr/bin/env node
// props-sheet.mjs · a contact sheet of every set builder in parts/rooms.js, each with Bix standing in it.
//   node modes/depth/tools/props-sheet.mjs <project> [--scale 0.5]
// Writes <project>/stills/props_N.jpg and props_sheet.jpg. Any depth reel folder works as <project>: it is only the served root and
// the place for stills/. It opens a throwaway page through the kit's own session (tools/session.mjs), so it queues behind renders.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { exclusive, openReel } from '../../../tools/session.mjs';

const COLS = 5, CELL_W = 360, CELL_H = 640, PAGE = 'props.html';
const args = process.argv.slice(2);
const project = path.resolve(args[0] || '.');
const scale = args.includes('--scale') ? Number(args[args.indexOf('--scale') + 1]) : 0.5;
const stills = path.join(project, 'stills');

// the page: the room catalogue becomes the depth stage's preview list (one room per second)
const IMPORTS = { imports: { three: '/studio/node_modules/three/build/three.module.js', 'three/addons/': '/studio/node_modules/three/examples/jsm/' } };
const html = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/fonts/fonts.css">
<script type="importmap">${JSON.stringify(IMPORTS)}</script></head><body>
<script type="module">import { catalogue } from '/mode/parts/catalogue.js'; window.DEPTH_PREVIEW = catalogue(); await import('/mode/runtime/stage.js');</script>
</body></html>`;

// tile the photos 5 across on white
function contactSheet(files, out) {
  const scaled = files.map((_, k) => `[${k}]scale=${CELL_W}:-1[s${k}]`).join(';');
  const layout = files.map((_, k) => `${(k % COLS) * CELL_W}_${Math.floor(k / COLS) * CELL_H}`).join('|');
  const graph = `${scaled};${files.map((_, k) => `[s${k}]`).join('')}xstack=inputs=${files.length}:layout=${layout}:fill=white`;
  spawnSync('ffmpeg', ['-v', 'error', '-y', ...files.flatMap((f) => ['-i', f]), '-filter_complex', graph, out]);
}

await exclusive(async () => {
  const page = path.join(project, PAGE);
  fs.writeFileSync(page, html);
  fs.mkdirSync(stills, { recursive: true });
  const files = [];
  try {
    const view = await openReel({ dir: project, cfg: { style: 'depth' } }, { scale, page: PAGE, fail: (m) => { throw new Error(m); } });
    for (let k = 0; k < Math.round(view.info.seconds); k++) {
      const file = path.join(stills, `props_${k}.jpg`);
      fs.writeFileSync(file, await view.frameAt(k + 0.6, 0.88));
      files.push(file);
    }
    await view.close();
  } finally { fs.rmSync(page, { force: true }); }
  const sheet = path.join(stills, 'props_sheet.jpg');
  contactSheet(files, sheet);
  console.log(`props: ${files.length} → ${sheet}`);
});
