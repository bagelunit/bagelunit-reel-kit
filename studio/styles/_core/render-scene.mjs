// Renders one scene page to one MP4, frame by frame. It seeks the page to each frame's time,
// takes a screenshot and pipes it to ffmpeg, so a slow machine still gets every frame.
//
//   node core/render-scene.mjs --html scenes/001.html --audio scenes/001.mp3 \
//     --duration 12.4 --out scenes/001.mp4
//
// No --audio gives a silent track. Every scene gets the same codec settings, so the assemble
// step can join them without encoding the video again.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { getChromium } from './playwright.mjs';

const chromium = await getChromium();

const { values: a } = parseArgs({
  options: {
    html: { type: 'string' },
    audio: { type: 'string' },
    out: { type: 'string' },
    duration: { type: 'string' },
    width: { type: 'string' },
    height: { type: 'string' },
    fps: { type: 'string', default: '30' },
    crf: { type: 'string', default: '20' },
    preset: { type: 'string', default: 'veryfast' },
    // Longest opening hold in seconds (0 turns it off). See "opening hold" below.
    lead: { type: 'string', default: '0.35' },
  },
});
if (!a.html || !a.out || !a.duration) {
  console.error('Need --html, --out and --duration');
  process.exit(1);
}

const fps = Number(a.fps);
// The page knows its own size (build-scene writes data-width / data-height); flags override it.
const page0 = readFileSync(a.html, 'utf8');
const attr = (name, d) => Number((new RegExp(`data-${name}="(\\d+)"`).exec(page0) || [])[1] || d);
const width = Number(a.width || attr('width', 1920));
const height = Number(a.height || attr('height', 1080));
// Rounds up to the next whole frame, so the end of the voice is never cut.
const frames = Math.max(1, Math.ceil(Number(a.duration) * fps - 1e-6));
const seconds = (frames / fps).toFixed(6);
const samples = Math.round((frames / fps) * 48000);

const audioIn = a.audio ? ['-i', a.audio] : ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo'];
const audioFilter = a.audio
  ? `[1:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad=whole_len=${samples},atrim=end_sample=${samples},asetpts=N/SR/TB[a]`
  : `[1:a]atrim=end_sample=${samples},asetpts=N/SR/TB[a]`;

const ffmpeg = spawn('ffmpeg', [
  '-hide_banner', '-loglevel', 'error', '-y',
  '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(fps), '-i', 'pipe:0',
  ...audioIn,
  '-filter_complex', audioFilter,
  '-map', '0:v', '-map', '[a]',
  '-c:v', 'libx264', '-preset', a.preset, '-crf', a.crf, '-profile:v', 'high', '-pix_fmt', 'yuv420p',
  '-r', String(fps), '-g', String(fps * 2), '-video_track_timescale', '90000',
  '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
  '-t', seconds, '-movflags', '+faststart',
  a.out,
], { stdio: ['pipe', 'inherit', 'inherit'] });
const encoderDone = new Promise((resolve, reject) => {
  ffmpeg.on('error', reject);
  ffmpeg.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}`))));
});

const browser = await chromium.launch();

// Opening hold: many scenes build their first picture in the first 0.1 to 0.3 s, so a cut to them
// flashes empty. The first frames would show nothing, and frame 0 is the hook. This finds the first
// moment the scene has real content (at least half of what it shows 0.35 s in) and, for the frames
// before it, shows that moment instead of the blank. Time after that is untouched, so the voice and
// the cues stay in sync. A scene that already opens with content gets no hold. The probe runs in its
// own page so the render page is only ever seeked forward.
async function openingHold(maxLead) {
  if (!(maxLead > 0)) return 0;
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  try {
    await ctx.route('**/*', (route) => route.abort('blockedbyclient'));
    const page = await ctx.newPage();
    await page.setContent(page0, { waitUntil: 'load' });
    await page.evaluate(() => window.__scene.ready);
    const helper = await ctx.newPage();
    await helper.setContent('<canvas id="c"></canvas>');
    const cdp = await ctx.newCDPSession(page);
    const step = 1 / fps;
    const times = [];
    for (let t = 0; t <= maxLead + 1e-9; t += step) times.push(t);
    const inks = [];
    for (const t of times) {
      await cdp.send('Runtime.evaluate', { expression: `window.__scene.seek(${t})` });
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width, height, scale: 0.2 } });
      // Share of pixels that differ from the top-left corner colour (the background).
      inks.push(await helper.evaluate(async (b64) => {
        const img = new Image();
        img.src = 'data:image/png;base64,' + b64;
        await img.decode();
        const c = document.getElementById('c');
        c.width = img.width; c.height = img.height;
        const g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, c.width, c.height).data;
        const r0 = d[0], g0 = d[1], b0 = d[2];
        let n = 0;
        for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - r0) + Math.abs(d[i + 1] - g0) + Math.abs(d[i + 2] - b0) > 60) n++;
        return n / (d.length / 4);
      }, shot.data));
    }
    const top = inks[inks.length - 1];
    if (top < 0.0003) return 0;                       // nothing to show yet: leave the scene alone
    const first = inks.findIndex((v) => v >= top * 0.5);
    return first <= 0 ? 0 : times[first];
  } finally {
    await ctx.close();
  }
}
const hold = await openingHold(Number(a.lead));
if (hold > 0) console.log(`opening hold: frames before ${hold.toFixed(2)} s show the scene at ${hold.toFixed(2)} s`);

try {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  // A scene may not touch the network. Anything it asks for is blocked and reported.
  await context.route('**/*', (route) => {
    console.warn(`blocked: ${route.request().url().slice(0, 120)}`);
    return route.abort('blockedbyclient');
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.warn(`page error: ${e.message}`));
  await page.setContent(page0, { waitUntil: 'load' });
  await page.evaluate(() => window.__scene.ready);
  const cdp = await context.newCDPSession(page);

  for (let i = 0; i < frames; i++) {
    const r = await cdp.send('Runtime.evaluate', { expression: `window.__scene.seek(${Math.max(i / fps, hold)})` });
    if (r.exceptionDetails) throw new Error(`seek(${Math.max(i / fps, hold)}) failed: ${r.exceptionDetails.text}`);
    const shot = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 90, fromSurface: true, optimizeForSpeed: true });
    const jpg = Buffer.from(shot.data, 'base64');
    if (!ffmpeg.stdin.write(jpg)) await new Promise((res) => ffmpeg.stdin.once('drain', res));
  }
  const errors = await page.evaluate(() => window.__scene.errors || []);
  if (errors.length) console.warn(`scene errors: ${JSON.stringify(errors).slice(0, 800)}`);
} finally {
  ffmpeg.stdin.end();
  await browser.close();
}
await encoderDone;
console.log(`rendered ${a.out}: ${frames} frames, ${seconds} s`);
