#!/usr/bin/env node
// Run refresh.mjs on its own, daily or weekly, on macOS (launchd), Windows (Task Scheduler) or Linux (cron).
// Only the brand owner turns it on. The job runs when the computer is on; the time is the computer's own clock.
//
//   node .claude/skills/content-calendar/schedule.mjs [brand folder] install [--daily 08:00 | --weekly mon 08:00]
//   node .claude/skills/content-calendar/schedule.mjs [brand folder] status
//   node .claude/skills/content-calendar/schedule.mjs [brand folder] run-now     runs it the way the job will
//   node .claude/skills/content-calendar/schedule.mjs [brand folder] remove
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { brandRoot, brandSlug, read, readJSON, writeAtomic } from './lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REFRESH = path.join(HERE, 'refresh.mjs');
// Node from Homebrew, nvm, fnm, Volta, asdf or mise lives in a versioned folder that an upgrade removes. Use a stable
// path when there is one: the link or shim of the same tool first, then a system node, each checked to really run
// Node 18 or newer with the job's bare PATH. Otherwise the versioned path stays, and `status` warns once it is gone.
const NODE = (() => {
  const p = process.execPath, home = os.homedir(), env = process.env;
  const versioned = /[\\/](Cellar[\\/]node|\.nvm[\\/]versions|nvm[\\/]v\d|fnm[^\\/]*[\\/]node-versions|fnm_multishells|\.volta[\\/]tools|\.asdf[\\/]installs|mise[\\/]installs|\.local[\\/]share[\\/]mise)[\\/]/i;
  if (!versioned.test(p)) return p;
  const exe = process.platform === 'win32' ? 'node.exe' : 'node';
  const same = (c) => { try { return fs.realpathSync(c) === fs.realpathSync(p); } catch { return false; } };
  const tool = [
    ...(/Cellar/.test(p) ? ['/opt/homebrew/bin/node', '/usr/local/bin/node'].filter(same) : []),
    ...(/\.volta/i.test(p) ? [path.join(env.VOLTA_HOME || path.join(home, '.volta'), 'bin', exe)] : []),
    ...(/fnm/i.test(p) ? [env.FNM_DIR, path.join(home, '.local', 'share', 'fnm'), path.join(home, 'Library', 'Application Support', 'fnm'), path.join(home, '.fnm'), env.APPDATA && path.join(env.APPDATA, 'fnm')].filter(Boolean).map((d) => path.join(d, 'aliases', 'default', ...(process.platform === 'win32' ? [] : ['bin']), exe)) : []),
    ...(/nvm/i.test(p) ? [env.NVM_SYMLINK && path.join(env.NVM_SYMLINK, exe), path.join(env.NVM_DIR || path.join(home, '.nvm'), 'current', 'bin', exe)].filter(Boolean) : []),
    ...(/\.asdf/i.test(p) ? [path.join(env.ASDF_DATA_DIR || path.join(home, '.asdf'), 'shims', exe)] : []),
    ...(/mise/i.test(p) ? [path.join(home, '.local', 'share', 'mise', 'shims', exe)] : []),
  ];
  const system = process.platform === 'win32' ? [path.join(env.ProgramFiles || 'C:\\Program Files', 'nodejs', exe)] : ['/opt/homebrew/bin/node', '/usr/local/bin/node', '/usr/bin/node'];
  const works = (c) => {
    if (!fs.existsSync(c)) return false;
    const r = spawnSync(c, ['-e', 'process.stdout.write(process.versions.node)'], { encoding: 'utf8', timeout: 10000, env: { PATH: [path.dirname(c), '/usr/bin', '/bin'].join(path.delimiter), HOME: home, SYSTEMROOT: env.SYSTEMROOT || '' } });
    return r.status === 0 && Number(String(r.stdout).split('.')[0]) >= 18;
  };
  return [...tool, ...system].find(works) || p;
})();
const NODE_DIR = path.dirname(NODE);
const PATH_FOR_JOB = [NODE_DIR, '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin'].filter((v, i, a) => a.indexOf(v) === i).join(':');
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', ...opts });
const die = (m) => { console.error(m); process.exit(1); };

const args = process.argv.slice(2);
const verbs = ['install', 'status', 'run-now', 'remove'];
const verb = args.find((a) => verbs.includes(a)) || 'status';
const root = brandRoot(args.find((a, i) => !a.startsWith('--') && !verbs.includes(a) && !['--daily', '--weekly'].includes(args[i - 1]) && !(args[i - 2] === '--weekly')));
const slug = brandSlug(root);
const outLog = path.join(root, '.cache', 'refresh.out.log');
fs.mkdirSync(path.dirname(outLog), { recursive: true });

// when: --daily HH:MM (default 08:00) or --weekly <day> HH:MM
let when = { every: 'daily', time: '08:00', day: null };
{
  const d = args.indexOf('--daily'), w = args.indexOf('--weekly');
  if (w >= 0) when = { every: 'weekly', day: String(args[w + 1] || 'mon').slice(0, 3).toLowerCase(), time: args[w + 2] && /^\d/.test(args[w + 2]) ? args[w + 2] : '08:00' };
  else if (d >= 0 && args[d + 1] && /^\d/.test(args[d + 1])) when.time = args[d + 1];
  const t = String(when.time).match(/^(\d{1,2}):(\d{2})$/);
  if (!t || +t[1] > 23 || +t[2] > 59) die(`The time must be a clock time from 00:00 to 23:59, like 08:00 (got ${when.time}).`);
  if (when.every === 'weekly' && !DAYS.includes(when.day)) die(`The day must be one of ${DAYS.join(', ')}.`);
}
const [hh, mm] = when.time.split(':').map(Number);
const describe = () => `${when.every === 'daily' ? 'every day' : `every ${when.day}`} at ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} (this computer's clock)`;

function record(on) {                         // note the setting in brand.json -> dashboard, keeping everything else
  const file = path.join(root, 'brand', 'brand.json');
  const b = readJSON(file, null);
  if (!b) return;
  b.dashboard = { ...(b.dashboard || {}), refresh: on ? when.every : 'off', time: on ? when.time : (b.dashboard?.time || ''), day: on && when.day ? when.day : (b.dashboard?.day || '') };
  writeAtomic(file, JSON.stringify(b, null, 2) + '\n');
}

/* ── macOS: a LaunchAgent ───────────────────────────────────────────────────────────────────────────────────── */
const mac = {
  label: `com.bagelunit.reels.${slug}`,
  get plist() { return path.join(os.homedir(), 'Library', 'LaunchAgents', `${this.label}.plist`); },
  get domain() { return `gui/${process.getuid()}`; },
  install() {
    const x = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const cal = `<key>Hour</key><integer>${hh}</integer><key>Minute</key><integer>${mm}</integer>${when.day ? `<key>Weekday</key><integer>${DAYS.indexOf(when.day)}</integer>` : ''}`;
    fs.mkdirSync(path.dirname(this.plist), { recursive: true });
    fs.writeFileSync(this.plist, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${x(this.label)}</string>
<key>ProgramArguments</key><array><string>${x(NODE)}</string><string>${x(REFRESH)}</string><string>${x(root)}</string></array>
<key>WorkingDirectory</key><string>${x(root)}</string>
<key>EnvironmentVariables</key><dict><key>PATH</key><string>${x(PATH_FOR_JOB)}</string></dict>
<key>StartCalendarInterval</key><dict>${cal}</dict>
<key>StandardOutPath</key><string>${x(outLog)}</string><key>StandardErrorPath</key><string>${x(outLog)}</string>
</dict></plist>
`);
    run('launchctl', ['bootout', this.domain, this.plist]);
    const r = run('launchctl', ['bootstrap', this.domain, this.plist]);
    if (r.status !== 0) die(`launchctl could not load the job: ${(r.stderr || '').trim()}`);
    const protectedDir = ['Documents', 'Desktop', 'Downloads'].map((d) => path.join(os.homedir(), d)).find((d) => root.startsWith(d + path.sep));
    if (protectedDir) console.log(`Note: this brand folder is inside ${path.basename(protectedDir)}, which macOS guards. If the first run says "Operation not permitted", open System Settings > Privacy & Security > Full Disk Access, press +, and add ${NODE} (docs/dashboard.md).`);
  },
  status() { return run('launchctl', ['print', `${this.domain}/${this.label}`]).status === 0; },
  nodePath() { const m = read(this.plist).match(/<key>ProgramArguments<\/key>\s*<array>\s*<string>([^<]*)<\/string>/); return m ? m[1].replace(/&lt;/g, '<').replace(/&amp;/g, '&') : null; },
  runNow() { return run('launchctl', ['kickstart', `${this.domain}/${this.label}`]).status === 0; },
  remove() { run('launchctl', ['bootout', this.domain, this.plist]); try { fs.unlinkSync(this.plist); } catch {} },
};

/* ── Windows: Task Scheduler, through a small .cmd (schtasks limits the command length) ─────────────────────── */
const win = {
  name: `BagelUnitReels-${slug}`,   // no spaces, so it needs no quoting
  cmd: path.join(root, '.cache', 'refresh-task.cmd'),
  install() {
    const pc = (s) => String(s).replace(/%/g, '%%');   // a % in a path would otherwise be read as a variable
    fs.writeFileSync(this.cmd, `@echo off\r\nchcp 65001>nul\r\nset "PATH=${pc(NODE_DIR)};%PATH%"\r\ncd /d "${pc(root)}"\r\n"${pc(NODE)}" "${pc(REFRESH)}" "${pc(root)}" >> "${pc(outLog)}" 2>&1\r\n`);
    const sc = when.every === 'daily' ? ['/SC', 'DAILY'] : ['/SC', 'WEEKLY', '/D', when.day.toUpperCase()];
    // the command line is passed exactly as written, so the path keeps its quotes: /TR "\"C:\My Folder\x.cmd\""
    const r = run('schtasks', ['/Create', '/F', '/TN', this.name, ...sc, '/ST', `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, '/TR', `"\\"${this.cmd}\\""`], { windowsVerbatimArguments: true });
    if (r.status !== 0) die(`Task Scheduler could not add the job: ${(r.stderr || r.stdout || r.error?.message || '').trim()}`);
  },
  status() { return run('schtasks', ['/Query', '/TN', this.name]).status === 0; },
  nodePath() { const m = read(this.cmd).match(/^"([^"]+)" "/m); return m ? m[1].replace(/%%/g, '%') : null; },
  runNow() { return run('schtasks', ['/Run', '/TN', this.name]).status === 0; },
  remove() { run('schtasks', ['/Delete', '/F', '/TN', this.name]); try { fs.unlinkSync(this.cmd); } catch {} },
};

/* ── Linux and others: one line in the user's crontab ──────────────────────────────────────────────────────── */
const cron = {
  mark: `# bagelunit-reels:${slug}`,
  current() {
    const r = run('crontab', ['-l']);
    if (r.status === 0) return r.stdout;
    if (/no crontab/i.test(r.stderr || '')) return '';
    die(`Could not read your crontab, so it was left alone: ${(r.stderr || r.error?.message || 'is cron installed?').trim()}`);
  },
  mine(l) { return l.trimEnd().endsWith(this.mark); },   // exactly this brand's line, not one whose name starts the same
  write(text) { const r = run('crontab', ['-'], { input: text }); if (r.status !== 0) die(`crontab could not be written: ${(r.stderr || r.error?.message || 'is cron installed?').trim()}`); },
  install() {
    const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
    // cron reads a bare % as the end of the command, so each one is written \%
    const line = `${mm} ${hh} * * ${when.day ? DAYS.indexOf(when.day) : '*'} cd ${q(root)} && PATH=${q(PATH_FOR_JOB)} ${q(NODE)} ${q(REFRESH)} ${q(root)} >> ${q(outLog)} 2>&1 ${this.mark}`.replace(/%/g, '\\%');
    const keep = this.current().split('\n').filter((l) => l.trim() && !this.mine(l));
    this.write([...keep, line].join('\n') + '\n');
  },
  status() { return this.current().split('\n').some((l) => this.mine(l)); },
  nodePath() {
    const l = this.current().split('\n').find((x) => this.mine(x)) || '';
    const m = l.replace(/\\%/g, '%').match(/ PATH='(?:[^']|'\\'')*' '((?:[^']|'\\'')*)'/);
    return m ? m[1].replace(/'\\''/g, "'") : null;
  },
  runNow() { return run(NODE, [REFRESH, root], { stdio: 'inherit' }).status === 0; },
  remove() { const keep = this.current().split('\n').filter((l) => l.trim() && !this.mine(l)); this.write(keep.length ? keep.join('\n') + '\n' : ''); },
};

const job = process.platform === 'darwin' ? mac : process.platform === 'win32' ? win : cron;
const where = process.platform === 'darwin' ? 'launchd' : process.platform === 'win32' ? 'Task Scheduler' : 'cron';

if (verb === 'install') {
  if (!fs.existsSync(REFRESH)) die(`Cannot find ${REFRESH}.`);
  job.install(); record(true);
  console.log(`Scheduled: the dashboard refreshes ${describe()} through ${where}. Output goes to .cache/refresh.out.log. Try it now: schedule.mjs run-now`);
} else if (verb === 'remove') {
  job.remove(); record(false);
  console.log(`Removed the scheduled refresh for ${slug}.`);
} else if (verb === 'run-now') {
  if (!job.status()) die('No scheduled refresh for this brand yet: run  schedule.mjs install  first.');
  const ok = job.runNow();
  console.log(ok ? `Started. Check .cache/refresh.out.log and .cache/refresh.log in a few seconds.` : 'Could not start the job.');
} else {
  const on = job.status();
  const b = readJSON(path.join(root, 'brand', 'brand.json')).dashboard || {};
  const node = on ? job.nodePath() : null;
  if (on && node && !fs.existsSync(node)) console.log(`Broken (${where}): the job runs Node at ${node}, which is no longer there (Node was upgraded or moved), so the refresh does not run. Run  schedule.mjs install  again to fix it.`);
  else console.log(on ? `On (${where}): ${b.refresh || 'scheduled'}${b.day ? ` ${b.day}` : ''}${b.time ? ` at ${b.time}` : ''}.` : 'Off: no scheduled refresh for this brand.');
  const tail = read(outLog).trim().split('\n').slice(-6).join('\n');
  if (tail) console.log(`Last output:\n${tail}`);
  if (/operation not permitted|EPERM/i.test(tail) && process.platform === 'darwin') console.log(`macOS blocked the job from this folder: System Settings > Privacy & Security > Full Disk Access, press +, add ${NODE}.`);
}
