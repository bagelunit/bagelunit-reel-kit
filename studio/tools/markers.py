"""Reuse markers: never pay twice for the same paid call (shared by voice.py and take.py).

Before a paid call (text-to-speech, speech-to-text) the tool hashes everything that decides the result and looks for
build/.markers/<stage>.json. The marker is written after a success and holds:
  status   "ok" | "maybe-billed"
  hash     SHA-256 of the request (script text, provider, model, voice, settings; for a take: the source file's fingerprint)
  outputs  {relative path: {"size": bytes, "sha256": digest}} of the files the call produced
  at       when it was written (UTC)

Next run:
  hash equal + status ok + every output still there with the same size   → "reused (no credits spent)", the call is skipped
  status maybe-billed + hash equal                                       → refused: the earlier request may have been billed
  anything else                                                          → the call goes ahead
--force on the tool bypasses both of the first two (use it when you accept paying again).

"maybe-billed" is written BEFORE the request is sent and replaced by "ok" on success, so a timeout, a dropped connection,
a 5xx answer, Ctrl-C or a crash all leave it behind. A request the provider clearly turned down (a 4xx answer, a missing
key or voice) removes it again, because nothing was charged. Keys are never read here and never written to a marker.
"""
import hashlib, json, socket, sys, time, urllib.error
from pathlib import Path

MB = 1 << 20


class MaybeBilled(Exception):
    """Raised by a tool when the provider's answer leaves it unclear whether the request was charged (5xx, 408)."""


def digest(obj):
    return hashlib.sha256(json.dumps(obj, sort_keys=True, ensure_ascii=False, default=str).encode('utf-8')).hexdigest()


def file_sha(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for block in iter(lambda: f.read(MB), b''):
            h.update(block)
    return h.hexdigest()


def source_fingerprint(path):
    """Size, modified time and a digest of the first and last megabyte: cheap, even for a big video."""
    path = Path(path)
    st = path.stat()
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        h.update(f.read(MB))
        if st.st_size > MB:
            f.seek(max(MB, st.st_size - MB))
            h.update(f.read(MB))
    return {'size': st.st_size, 'mtime_ns': st.st_mtime_ns, 'edges': h.hexdigest()}


def maybe_billed(exc):
    """After the request was sent, could this failure still have been charged?"""
    if isinstance(exc, MaybeBilled):
        return True
    if isinstance(exc, urllib.error.HTTPError):
        return exc.code >= 500 or exc.code == 408
    if isinstance(exc, urllib.error.URLError):
        return not isinstance(exc.reason, (socket.gaierror, ConnectionRefusedError))   # those two mean it never left
    return True       # a timeout, a dropped connection or an unreadable answer: sent, outcome unknown


class Markers:
    def __init__(self, project, tool):
        self.root, self.tool = Path(project), tool
        self.dir = self.root / 'build' / '.markers'

    def path(self, stage):
        return self.dir / f'{stage}.json'

    def read(self, stage):
        try:
            return json.loads(self.path(stage).read_text(encoding='utf-8'))
        except (OSError, ValueError):
            return None

    def _write(self, stage, status, h, outputs=()):
        self.dir.mkdir(parents=True, exist_ok=True)
        info = {}
        for p in outputs:
            p = Path(p)
            if p.is_file():
                info[str(p.resolve().relative_to(self.root.resolve()))] = {'size': p.stat().st_size, 'sha256': file_sha(p)}
        self.path(stage).write_text(json.dumps({'status': status, 'hash': h, 'outputs': info,
                                                 'at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}, indent=1), encoding='utf-8')

    def state(self, stage, h, force=False):
        """'run' (go ahead), 'reuse' (skip the paid call) or 'blocked' (an earlier identical request may have been billed)."""
        if force:
            return 'run'
        m = self.read(stage)
        if not m or m.get('hash') != h:
            return 'run'
        if m.get('status') == 'maybe-billed':
            return 'blocked'
        outs = m.get('outputs') or {}
        if m.get('status') == 'ok' and outs and all((self.root / rel).is_file() and (self.root / rel).stat().st_size == o.get('size')
                                                    for rel, o in outs.items()):
            return 'reuse'
        return 'run'

    def reused(self):
        print(f'{self.tool}: reused (no credits spent)')

    def blocked(self, stage):
        sys.exit(f'{self.tool}: an earlier request for exactly this input was sent but never confirmed (it timed out or broke after '
                 f'sending), so it may already have been billed. Nothing was sent now. If you accept paying again, re-run with --force. '
                 f'(marker: build/.markers/{stage}.json)')

    def begin(self, stage, h):
        self._write(stage, 'maybe-billed', h)

    def done(self, stage, h, outputs):
        self._write(stage, 'ok', h, outputs)

    def abort(self, stage, h):
        m = self.read(stage)
        if m and m.get('status') == 'maybe-billed' and m.get('hash') == h:
            self.path(stage).unlink(missing_ok=True)

    def paid(self, stage, h, send, what):
        """Run send() (the paid request) under a marker. Returns what send returns."""
        self.begin(stage, h)
        try:
            return send()
        except SystemExit:                       # the tool's own plain-words refusal (no key, 4xx answer): nothing was charged
            self.abort(stage, h)
            raise
        except KeyboardInterrupt:
            raise                                # the marker stays: the request may have gone out
        except Exception as exc:
            if not maybe_billed(exc):
                self.abort(stage, h)
                if isinstance(exc, urllib.error.HTTPError):
                    raise                        # the tool reads the provider's refusal itself
                sys.exit(f'{self.tool}: could not reach the {what} service ({getattr(exc, "reason", exc)}). Nothing was sent or charged; check the connection and run again.')
            sys.exit(f'{self.tool}: the {what} request was sent but no clear answer came back ({type(exc).__name__}: {str(exc)[:200]}). '
                     f'It may already have been billed, so nothing was retried. If you accept paying again, re-run with --force.')
