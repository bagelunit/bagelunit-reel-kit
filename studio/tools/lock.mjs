// lock.mjs · one render at a time per machine. The lock is a small file in the temp folder created with the 'wx' flag
// (fails if it exists) holding the owner's pid and start time; a lock whose owner process is gone is taken over.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const FILE = path.join(os.tmpdir(), 'susanoo-reels-render.lock.json');

function owner() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')).pid || 0; } catch { return 0; }
}
function alive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch (err) { return err.code === 'EPERM'; }
}
function claim() {
  try {
    const fd = fs.openSync(FILE, 'wx');
    fs.writeSync(fd, JSON.stringify({ pid: process.pid, since: new Date().toISOString() }));
    fs.closeSync(fd);
    return true;
  } catch { return false; }
}
function release() {
  if (owner() === process.pid) fs.rmSync(FILE, { force: true });
}

// withRenderLock(job, { quiet }): waits for the machine to be free, runs job, and frees it again whatever happens
export async function withRenderLock(job, { quiet = false } = {}) {
  for (let said = false; !claim();) {
    if (!alive(owner())) { fs.rmSync(FILE, { force: true }); continue; }   // left behind by a crashed render
    if (!said && !quiet) { console.log('another render is busy; waiting for it to finish...'); said = true; }
    await new Promise((r) => setTimeout(r, 2000));
  }
  const bail = (code) => () => { release(); process.exit(code); };
  process.once('exit', release);
  process.once('SIGINT', bail(130));
  process.once('SIGTERM', bail(143));
  try { return await job(); } finally { release(); }
}
