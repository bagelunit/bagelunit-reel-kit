// Finds Playwright's Chromium without installing anything into this repo.
// Order: a normal `import('playwright')`, then the folder in PLAYWRIGHT_DIR, then the current folder.
//
//   mkdir -p /tmp/pw && cd /tmp/pw && npm init -y && npm i playwright && npx playwright install chromium
//   PLAYWRIGHT_DIR=/tmp/pw node core/render-scene.mjs ...
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function getChromium() {
  try {
    const m = await import('playwright');
    return m.chromium || m.default.chromium;
  } catch {}
  const dirs = [process.env.PLAYWRIGHT_DIR, process.cwd()].filter(Boolean);
  for (const dir of dirs) {
    try {
      const req = createRequire(join(dir, 'package.json'));
      const p = req.resolve('playwright');
      const m = await import(pathToFileURL(p).href);
      return m.chromium || m.default.chromium;
    } catch {}
  }
  throw new Error('Playwright not found. Install it in a temp folder (never in this repo) and set PLAYWRIGHT_DIR to that folder. See the header of core/playwright.mjs.');
}
