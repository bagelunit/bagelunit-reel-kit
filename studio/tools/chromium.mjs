// Headless Chromium for every mode. Playwright's own build (installed once with `npm run browser`), or your Chrome via CHROME_PATH.
// The flags give WebGL on every platform, so the 3D modes render the same on a Mac, a Windows laptop or a Linux box.
import os from 'node:os';

const ANGLE = { darwin: 'metal', win32: 'd3d11' };   // anything else (Linux, no GPU) falls back to software GL: slower, same pixels

export function chromeArgs() {
  return ['--allow-file-access-from-files', '--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader',
    `--use-angle=${ANGLE[os.platform()] || 'swiftshader'}`];
}

export async function launch() {
  let playwright;
  try { playwright = await import('playwright'); }
  catch { throw new Error('Playwright is missing: run `npm install` inside the studio folder (SETUP.md).'); }
  const options = { args: chromeArgs(), ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) };
  try { return await playwright.chromium.launch(options); }
  catch (err) {
    const first = String(err.message).split('\n')[0];
    if (/Executable doesn't exist|browserType\.launch/.test(err.message))
      throw new Error(`The headless browser isn't installed yet: run \`npm run browser\` inside the studio folder (one time, about 100 MB).\n${first}`);
    throw err;
  }
}
