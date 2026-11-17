#!/usr/bin/env node
// Checks the free built-in voice (studio/tools/localvoice.py, studio/tools/voice.py) with NO network and NO real speech engine:
//   1. the pure parts: which provider speaks, splitting a user's command safely (no shell), cutting the script into pieces,
//      timing the words (estimated from syllables; aligned to what Whisper heard)
//   2. voice.py end to end with fake `say` / `espeak-ng` programs that write a tone (needs ffmpeg; skipped on Windows and
//      without ffmpeg): provider rules, build/voice_source.json, pieces made once, Gate A still guarding a paid voice, a user's
//      command run with no shell, the key never printed
// A real run with this computer's own engine (never in CI):  REAL_LOCAL_VOICE=1 node setup/test-localvoice.mjs
// Run in CI: node setup/test-localvoice.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const kit = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tools = path.join(kit, 'studio', 'tools');
const WIN = process.platform === 'win32';
const PY = WIN ? 'python' : 'python3';
const tmp = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'localvoice-test-')));
const home = path.join(tmp, 'home');
fs.mkdirSync(path.join(home, '.config', 'bagelunit-reels'), { recursive: true });
const SECRET = 'sk_TEST_SECRET_KEY_do_not_print_9f3a';
const baseEnv = { ...process.env, HOME: home, USERPROFILE: home, BAGELUNIT_VOICE_TIMINGS: 'estimated' };
delete baseEnv.ELEVENLABS_API_KEY;
const out = (r) => `${r.stdout || ''}${r.stderr || ''}`;
const W = (f, body) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, typeof body === 'string' ? body : JSON.stringify(body, null, 1)); };
const has = (cmd) => spawnSync(cmd, ['-version'], { encoding: 'utf8' }).status === 0;
const keyFile = path.join(home, '.config', 'bagelunit-reels', 'elevenlabs.key');
let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };
const eq = (a, b, msg) => { assert.deepEqual(a, b, msg); checks++; };

/* ── 1. the pure parts, through python ───────────────────────────────────────────────────────────────────────────────── */
const probe = `
import json, sys
sys.path.insert(0, ${JSON.stringify(tools)})
import localvoice as L
r = {}
r['split'] = L.split_command('my-tts --in {text_file} --out {audio_file}', posix=True)
r['quotes'] = L.split_command('say "a b" \\'c d\\' e\\\\ f "q\\\\"x"', posix=True)
r['noshell'] = L.split_command('echo $HOME ~ ; rm -rf * | cat > /tmp/x $(whoami) \`id\`', posix=True)
r['win'] = L.split_command('"C:\\\\Program Files\\\\tts\\\\tts.exe" --in {text_file} C:\\\\a\\\\b', posix=False)
r['empty_quote'] = L.split_command('a "" b', posix=True)
try: L.split_command('a "b', posix=True); r['unclosed'] = 'no error'
except ValueError as e: r['unclosed'] = str(e)
r['argv'] = L.command_argv('python3 "/my dir/t.py" --in {text_file} --out={audio_file} --keep {unknown}', '/tmp/in; rm -rf x/t.txt', '/tmp/o ut/a.mp3', posix=True)
for bad in ('my-tts --in {text_file}', 'my-tts --out {audio_file}', '   '):
    try: L.command_argv(bad, 'a', 'b', posix=True); r['bad:' + bad] = 'no error'
    except ValueError as e: r['bad:' + bad] = 'error'
O = lambda **k: dict(k)
r['sel'] = {
  'default_key': L.choose_provider(O(), None, True, True)[0],
  'default_nokey_engine': L.choose_provider(O(), None, False, True),
  'default_nokey_noengine': L.choose_provider(O(), None, False, False)[0],
  'auto_key': L.choose_provider(O(provider='auto'), None, True, True)[0],
  'eleven_nokey': L.choose_provider(O(provider='elevenlabs'), None, False, True)[0],
  'flag_eleven_nokey': L.choose_provider(O(), 'elevenlabs', False, True)[0],
  'local_key': L.choose_provider(O(provider='local'), None, True, True)[0],
  'flag_local': L.choose_provider(O(provider='elevenlabs'), 'local', True, True)[0],
  'command': L.choose_provider(O(provider='command'), None, True, True)[0],
  'openai': L.choose_provider(O(provider='openai'), None, False, False)[0],
  'file': L.choose_provider(O(), 'file', False, False)[0],
  'flag_auto': L.choose_provider(O(provider='local'), 'auto', False, True)[0],
}
text = ' '.join(['This is sentence number %d, and it has some words in it.' % i for i in range(40)]) + ' ' + 'long, ' * 200
chunks = L.chunk_text(text, 300)
r['chunks'] = {'n': len(chunks), 'max': max(len(c) for c in chunks), 'joined': ' '.join(chunks) == ' '.join(text.split())}
r['chunk_short'] = L.chunk_text('One short line.  \\n ok', 500)
r['chunk_empty'] = L.chunk_text('   ', 500)
r['words'] = L.script_words('Hello, world -- 今日は good.')
est = L.estimate_words(['I', 'understand', 'the', 'situation.', 'Okay'], 1.0, 6.0)
r['est'] = est
ws = L.script_words('Hello there, world. It is 2026 now.')
heard = [['Hello', 0.5, 0.9], ['there', 0.9, 1.2], ['world', 1.3, 1.8], ['It', 2.2, 2.3], ['is', 2.3, 2.5], ['twenty', 2.6, 2.9], ['twenty', 2.9, 3.1], ['six', 3.1, 3.4], ['now', 3.6, 4.0]]
al, share = L.align_words(ws, heard, 4.2)
r['align'] = {'words': al, 'share': share}
al2, share2 = L.align_words(ws, [['zebra', 0.0, 1.0], ['quartz', 1.0, 2.0]], 5.0)
r['nomatch'] = {'share': share2, 'n': len(al2), 'first': al2[0], 'last': al2[-1]}
print(json.dumps(r))
`;
const pr = spawnSync(PY, ['-c', probe], { encoding: 'utf8', env: baseEnv });
if (pr.status !== 0) { console.error(out(pr)); process.exit(1); }
const R = JSON.parse(pr.stdout);

eq(R.split, ['my-tts', '--in', '{text_file}', '--out', '{audio_file}'], 'split: plain command');
eq(R.quotes, ['say', 'a b', 'c d', 'e f', 'q"x'], 'split: quotes group and a backslash escapes (posix)');
eq(R.noshell, ['echo', '$HOME', '~', ';', 'rm', '-rf', '*', '|', 'cat', '>', '/tmp/x', '$(whoami)', '`id`'], 'split: nothing is expanded or treated as an operator');
eq(R.win, ['C:\\Program Files\\tts\\tts.exe', '--in', '{text_file}', 'C:\\a\\b'], 'split: Windows keeps backslashes');
eq(R.empty_quote, ['a', '', 'b'], 'split: an empty quoted word stays');
ok(/unclosed quote/.test(R.unclosed), 'split: an unclosed quote is refused');
eq(R.argv, ['python3', '/my dir/t.py', '--in', '/tmp/in; rm -rf x/t.txt', '--out=/tmp/o ut/a.mp3', '--keep', '{unknown}'],
   'argv: only the two placeholders are replaced, in any word; a value with spaces or ; stays one argument');
for (const k of ['bad:my-tts --in {text_file}', 'bad:my-tts --out {audio_file}', 'bad:   ']) eq(R[k], 'error', `argv: refuses "${k}"`);
eq(R.sel, {
  default_key: 'elevenlabs', default_nokey_engine: ['local', R.sel.default_nokey_engine[1]], default_nokey_noengine: 'standin', auto_key: 'elevenlabs',
  eleven_nokey: 'local', flag_eleven_nokey: 'elevenlabs', local_key: 'local', flag_local: 'local', command: 'command', openai: 'openai', file: 'file', flag_auto: 'local',
}, 'provider selection rules');
ok(/no ElevenLabs key/.test(R.sel.default_nokey_engine[1]), 'selection explains the switch to the built-in voice');
ok(R.chunks.n >= 5 && R.chunks.max <= 300 && R.chunks.joined, `chunks: ${R.chunks.n} pieces, longest ${R.chunks.max}, nothing lost`);
eq(R.chunk_short, ['One short line. ok'], 'chunks: a short script is one piece');
eq(R.chunk_empty, [], 'chunks: no words, no pieces');
eq(R.words, ['Hello,', 'world--', '今', '日', 'は', 'good.'], 'script words: punctuation glued, CJK one by one');

const est = R.est;
ok(est[0][1] === 1.0 && est.at(-1)[2] <= 6.0001, 'estimate: stays inside the clip');
ok(est.every((w, i) => w[2] > w[1] && (i === 0 || w[1] >= est[i - 1][2])), 'estimate: in order, no overlap');
ok(est[1][2] - est[1][1] > est[0][2] - est[0][1] && est[1][2] - est[1][1] > est[2][2] - est[2][1], 'estimate: a long word gets more time than a short one');
ok(est[4][1] - est[3][2] > est[1][1] - est[0][2], 'estimate: a full stop leaves a longer pause than none');

const al = R.align.words;
eq(al.map((w) => w[0]), ['Hello', 'there,', 'world.', 'It', 'is', '2026', 'now.'], 'align: the script words are kept (not Whisper\'s)');
eq(al[0].slice(1), [0.5, 0.9], 'align: a matched word takes Whisper\'s time');
eq(al[6].slice(1), [3.6, 4.0], 'align: the last matched word too');
ok(al[5][1] >= 2.5 - 1e-9 && al[5][2] <= 3.6 + 1e-9 && al[5][2] > al[5][1], 'align: "2026" (heard as words) sits between its neighbours');
ok(Math.abs(R.align.share - 6 / 7) < 1e-9, 'align: share matched');
ok(R.nomatch.share === 0 && R.nomatch.n === 7 && R.nomatch.first[1] === 0 && R.nomatch.last[2] <= 5.0001, 'align: nothing heard means all estimated across the audio');

/* ── 2. voice.py end to end with fake engines ────────────────────────────────────────────────────────────────────────── */
if (WIN || !has('ffmpeg')) {
  console.log(`SKIPPED fake-engine checks: ${WIN ? 'they use shell scripts (not run on Windows)' : 'ffmpeg is not installed'}`);
} else {
  const which = (c) => spawnSync(WIN ? 'where' : 'which', [c], { encoding: 'utf8' }).stdout.split(/\r?\n/)[0].trim();
  const pyExe = spawnSync(PY, ['-c', 'import sys; print(sys.executable)'], { encoding: 'utf8' }).stdout.trim();
  const fake = path.join(tmp, 'fakebin');           // a fake `say` (0.3 s of tone per word) that logs each call
  const only = path.join(tmp, 'onlybin');           // PATH with ffmpeg and a fake espeak-ng only, so no real `say` is found
  const log = path.join(tmp, 'calls.log');
  const toneScript = (name, argsParse, fmt) => `#!/bin/sh
out=""; file=""
${argsParse}
n=$(wc -w < "$file" | tr -d ' ')
echo "${name} $n" >> "${log}"
ffmpeg -hide_banner -loglevel error -y -f lavfi -i "sine=frequency=220:duration=$(awk "BEGIN{print $n*0.3}")" -f ${fmt} "$out"
`;
  const sayParse = 'while [ $# -gt 0 ]; do case "$1" in -o) out="$2"; shift 2;; -f) file="$2"; shift 2;; -v|-r) shift 2;; *) shift;; esac; done';
  const espParse = 'while [ $# -gt 0 ]; do case "$1" in -w) out="$2"; shift 2;; -f) file="$2"; shift 2;; -v|-s) shift 2;; *) shift;; esac; done';
  for (const [dir, name, parse, fmt] of [[fake, 'say', sayParse, 'aiff'], [only, 'espeak-ng', espParse, 'wav']]) {
    W(path.join(dir, name), toneScript(name, parse, fmt)); fs.chmodSync(path.join(dir, name), 0o755);
  }
  for (const c of ['ffmpeg', 'ffprobe', 'wc', 'awk', 'tr']) fs.symlinkSync(which(c), path.join(only, c));
  const withFake = { ...baseEnv, PATH: `${fake}${path.delimiter}${process.env.PATH}` };
  const onlyEnv = { ...baseEnv, PATH: only };
  const noEngine = path.join(tmp, 'noengine');
  fs.mkdirSync(noEngine);
  for (const c of ['ffmpeg', 'ffprobe']) fs.symlinkSync(which(c), path.join(noEngine, c));
  const noEngineEnv = { ...baseEnv, PATH: noEngine };
  const voice = (reel, args, env) => spawnSync(pyExe, [path.join(tools, 'voice.py'), reel, ...args], { encoding: 'utf8', env });
  const calls = () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split(/\r?\n/).filter(Boolean) : []);
  const mkReel = (dir, script, voiceCfg) => { W(path.join(dir, 'reel.json'), { style: 'print', name: 'r', ...(voiceCfg ? { voice: voiceCfg } : {}) }); W(path.join(dir, 'script.txt'), script + '\n'); return dir; };
  const readJSON = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
  const secs = (f) => Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }).stdout);
  const NOTE = 'built-in voice (free, basic quality). A natural voice service such as ElevenLabs is a suggested upgrade: kit suggest elevenlabs';

  // a. no key, nothing chosen: the built-in voice speaks, as a real voice
  const sentence = 'Money habits matter more than money tricks. Start small, and keep going.';       // 12 words
  const a = mkReel(path.join(tmp, 'a'), sentence);
  W(path.join(a, 'build', 'voice-stand-in.json'), '{"note":"old stand-in"}');
  const ra = voice(a, [], withFake);
  ok(ra.status === 0, 'no key: voice.py succeeds with the built-in voice\n' + out(ra));
  ok(ra.stderr.includes(NOTE), 'the honest note goes to stderr');
  ok(!ra.stdout.includes('built-in voice (free'), 'stdout is the same line as before (no note)');
  ok(/^voice: audio\/vo\.mp3 [\d.]+ s \(take [\d.]+ s, \d+ pauses shortened, tempo x1\.0\) · 12 words → build\/words\.json \+ build\/word_index\.txt$/m.test(ra.stdout), 'stdout line keeps its shape\n' + ra.stdout);
  ok(/no ElevenLabs key saved/.test(ra.stderr) && /estimated timings/.test(ra.stderr), 'stderr names the switch and the estimated timings');
  const src = readJSON(path.join(a, 'build', 'voice_source.json'));
  eq([src.provider, src.engine, src.timings], ['local', 'say', 'estimated'], 'voice_source.json: provider, engine, timings');
  ok(/^\d{4}-\d\d-\d\dT[\d:]+Z$/.test(src.at) && src.voice === 'default', 'voice_source.json: time and voice');
  ok(!fs.existsSync(path.join(a, 'build', 'voice-stand-in.json')), 'a real voice removes the stand-in note');
  const words = readJSON(path.join(a, 'build', 'words.json'));
  eq(words.map((w) => w.w).join(' '), sentence, 'words.json holds the script words');
  const length = secs(path.join(a, 'audio', 'vo.mp3'));
  ok(Math.abs(length - 12 * 0.3) < 0.5, `vo.mp3 is the voice (${length.toFixed(2)} s, 12 words at 0.3 s)`);
  ok(words.every((w, i) => w.e > w.s && (i === 0 || w.s >= words[i - 1].e - 1e-6)) && words.at(-1).e <= length + 0.05, 'words.json is an ordered clock inside the audio');
  ok(fs.existsSync(path.join(a, 'build', 'word_index.txt')) && fs.existsSync(path.join(a, 'vo_raw', 'raw.mp3')), 'word_index.txt and the take exist');

  // b. pieces are made once; a missing piece alone is made again; --force makes all again
  fs.rmSync(log, { force: true });
  const long = Array.from({ length: 12 }, (_, i) => `Sentence number ${i + 1} says something about saving money every single month.`).join(' ');
  const b = mkReel(path.join(tmp, 'b'), long, { chunk_chars: 200 });
  const rb = voice(b, [], withFake);
  ok(rb.status === 0, 'long script voices\n' + out(rb));
  const made = calls().length;
  ok(made >= 3, `the long script is cut into pieces (${made})`);
  ok(readJSON(path.join(b, 'build', 'words.json')).length === long.split(/\s+/).length, 'every word of the long script is on the clock');
  ok(secs(path.join(b, 'audio', 'vo.mp3')) > made * 1.0, 'the pieces are joined into one voice');
  voice(b, [], withFake);
  eq(calls().length, made, 'a second run makes no piece again');
  const wavs = fs.readdirSync(path.join(b, 'vo_raw', 'local')).filter((f) => /^\d{3}-.*\.wav$/.test(f)).sort();
  fs.rmSync(path.join(b, 'vo_raw', 'local', wavs[1]));
  voice(b, [], withFake);
  eq(calls().length, made + 1, 'only the missing piece is made again (resumable)');
  voice(b, ['--force'], withFake);
  eq(calls().length, made + 1 + made, '--force makes every piece again');
  fs.writeFileSync(path.join(b, 'script.txt'), long.replace('Sentence number 12', 'Sentence number twelve') + '\n');
  voice(b, [], withFake);
  eq(calls().length, made + 1 + made + 1, 'a changed sentence remakes only its piece');

  // c. the brand folder: a brand that chose "local" overrides the "elevenlabs" the kit copies into reel.json; Gate A guards a paid voice only
  const brand = path.join(tmp, 'brandfolder');
  W(path.join(brand, 'brand', 'brand.json'), { name: 'T', voice: { provider: 'local', voice_id: '', local_voice: 'Samantha', local_rate: 170 } });
  const c = mkReel(path.join(brand, 'reels', 'c'), sentence, { provider: 'elevenlabs', voice_id: 'abc' });
  fs.rmSync(log, { force: true });
  W(keyFile, SECRET);                                                  // a key is saved, yet the brand's choice (local) wins over the copied default
  const rc = voice(c, [], withFake);
  ok(rc.status === 0 && readJSON(path.join(c, 'build', 'voice_source.json')).provider === 'local', 'brand.json provider local wins over a copied "elevenlabs"\n' + out(rc));
  ok(readJSON(path.join(c, 'build', 'voice_source.json')).voice === 'Samantha', 'brand.json local_voice is used');
  ok(!out(rc).includes(SECRET), 'the key is never printed (local run)');
  // and a paid ElevenLabs voice in a brand folder still waits for Gate A (no network is reached)
  const d = mkReel(path.join(brand, 'reels', 'd'), sentence);
  const rd = voice(d, ['--provider', 'elevenlabs'], withFake);
  ok(rd.status !== 0 && /Gate A \(the script\) is not recorded/.test(out(rd)), 'a paid voice before Gate A is refused in a brand folder\n' + out(rd));
  ok(!out(rd).includes(SECRET) && !fs.existsSync(path.join(d, 'audio', 'vo.mp3')), 'the refusal prints no key and writes no voice');
  const e = mkReel(path.join(tmp, 'plainbrand2', 'reels', 'e'), sentence);
  W(path.join(tmp, 'plainbrand2', 'brand', 'brand.json'), { name: 'T2' });          // default provider "elevenlabs" and a key: elevenlabs, so Gate A guards it
  const re = voice(e, [], withFake);
  ok(re.status !== 0 && /Gate A/.test(out(re)) && !out(re).includes(SECRET), 'default provider with a key is ElevenLabs and waits for Gate A');

  // d. an empty key file (what setup leaves to fill in) is no key
  W(keyFile, '');
  const f = mkReel(path.join(tmp, 'f'), sentence);
  const rf = voice(f, [], withFake);
  ok(rf.status === 0 && readJSON(path.join(f, 'build', 'voice_source.json')).provider === 'local', 'an empty key file means no key: the built-in voice speaks\n' + out(rf));
  fs.rmSync(keyFile);

  // e. no key and no engine: stops with a clear way forward, writes no voice
  const g = mkReel(path.join(tmp, 'g'), sentence);
  const rg = voice(g, [], noEngineEnv);
  ok(rg.status !== 0 && /no real voice is possible yet/.test(out(rg)) && /command/.test(out(rg)) && /stand-in/.test(out(rg)), 'no key, no engine: a clear message\n' + out(rg));
  ok(!fs.existsSync(path.join(g, 'audio', 'vo.mp3')), 'and no voice file');

  // f. espeak-ng is found when `say` is not
  const h = mkReel(path.join(tmp, 'h'), sentence);
  const rh = voice(h, [], onlyEnv);
  ok(rh.status === 0 && readJSON(path.join(h, 'build', 'voice_source.json')).engine === 'espeak-ng', 'espeak-ng speaks when there is no say\n' + out(rh));
  // a forced engine that is not installed is said so
  const hh = mkReel(path.join(tmp, 'hh'), sentence, { provider: 'local', local_engine: 'piper' });
  const rhh = voice(hh, [], onlyEnv);
  ok(rhh.status !== 0 && /piper/.test(out(rhh)), 'a forced engine that is missing is reported');

  // g. your own command: run without a shell, only the two placeholders replaced
  const cmdDir = path.join(tmp, 'my tts');
  W(path.join(cmdDir, 'tts.py'), `import sys, wave, math, struct
a = sys.argv
text = open(a[a.index('--in') + 1], encoding='utf-8').read()
n = len(text.split())
w = wave.open(a[a.index('--out') + 1], 'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(22050)
w.writeframes(b''.join(struct.pack('<h', int(8000 * math.sin(i / 20))) for i in range(int(22050 * 0.25 * n))))
w.close()
open(${JSON.stringify(path.join(tmp, 'cmd-saw.txt').replace(/\\/g, '/'))}, 'a').write(repr(a[1:]) + '\\n')
`);
  const pwn = path.join(tmp, 'PWNED').replace(/\\/g, '/');
  const template = `"${pyExe.replace(/\\/g, '/')}" "${path.join(cmdDir, 'tts.py').replace(/\\/g, '/')}" --in {text_file} --out {audio_file} --note "$(touch ${pwn}1)" ; touch ${pwn}2 && touch ${pwn}3 > ${pwn}4`;
  const k = mkReel(path.join(tmp, 'k'), sentence, { provider: 'command', command: template });
  const rk = voice(k, [], onlyEnv);
  ok(rk.status === 0, 'provider command runs the user\'s command\n' + out(rk));
  const srcK = readJSON(path.join(k, 'build', 'voice_source.json'));
  eq([srcK.provider, srcK.timings], ['command', 'estimated'], 'voice_source.json for a command voice');
  ok([1, 2, 3, 4].every((n) => !fs.existsSync(pwn + n)), 'no shell ran: $(...), ; && and > did nothing');
  const saw = fs.readFileSync(path.join(tmp, 'cmd-saw.txt'), 'utf8');
  ok(saw.includes('$(touch') && saw.includes("';'") && saw.includes('&&'), 'the shell words reached the command as plain arguments');
  eq(readJSON(path.join(k, 'build', 'words.json')).map((w) => w.w).join(' '), sentence, 'a command voice has the script words on the clock');
  ok(/voiced by your own command/.test(rk.stderr) && !rk.stderr.includes(NOTE), 'a command voice does not claim to be the built-in one');
  // a command may call a paid service: it waits for Gate A in a brand folder
  const m = mkReel(path.join(brand, 'reels', 'm'), sentence, { provider: 'command', command: template });
  const rm = voice(m, [], onlyEnv);
  ok(rm.status !== 0 && /Gate A/.test(out(rm)), 'provider command waits for Gate A in a brand folder');
  // a command without both placeholders is refused before anything runs
  const n = mkReel(path.join(tmp, 'n'), sentence, { provider: 'command', command: 'echo hello' });
  ok(voice(n, [], onlyEnv).status !== 0, 'a command without {text_file} and {audio_file} is refused');

  // h. budget.py: no credits to check for the built-in voice
  const bud = spawnSync(pyExe, [path.join(tools, 'budget.py'), path.join(a, 'script.txt')], { encoding: 'utf8', env: withFake });
  ok(bud.status === 0 && /credits: not needed/.test(bud.stdout) && /verdict: OK/.test(bud.stdout), 'budget.py: the built-in voice has no credits to run out of\n' + out(bud));
  W(keyFile, SECRET);
  const bud2 = spawnSync(pyExe, [path.join(tools, 'budget.py'), path.join(brand, 'reels', 'c', 'script.txt')], { encoding: 'utf8', env: withFake });
  ok(/not needed/.test(bud2.stdout) && !out(bud2).includes(SECRET), 'budget.py: a brand that chose local needs no credits even with a key saved');
  fs.rmSync(keyFile);

  // i. optional real run with this computer's own engine, never in CI
  if (process.env.REAL_LOCAL_VOICE) {
    const real = mkReel(path.join(tmp, 'real'), 'Most people save money the hard way. Here is a simpler trick, and it takes two minutes.');
    const rr = voice(real, ['--provider', 'local'], { ...process.env, HOME: home, USERPROFILE: home, BAGELUNIT_VOICE_TIMINGS: process.env.REAL_TIMINGS || '' });
    console.log(out(rr));
    console.log(fs.readFileSync(path.join(real, 'build', 'voice_source.json'), 'utf8'));
    console.log(fs.readFileSync(path.join(real, 'build', 'word_index.txt'), 'utf8'));
    ok(rr.status === 0, 'the real built-in voice speaks');
  }
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`test-localvoice: ${checks} checks passed`);
