#!/usr/bin/env node
// Tests for the Blender library in template/brand/library/3d: the terrain helper (terrain.py), the camera helpers in lib/bb.py and the shot scripts.
//   1. every .py there compiles (python -m py_compile)
//   2. terrain.py with a stubbed fetch and synthetic tiles: decode maths, PNG filters, bbox to tile coordinates, zoom and tile caps,
//      stitching and cropping, the tile cache, retries, clear errors, the attribution files. No network.
//   3. lib/bb.py with a fake bpy: easing, camera paths, handheld noise (seeded), depth of field, rack focus, camera moves
//   4. a real headless Blender render of a tiny terrain (only when Blender is installed; skipped, never failed, when it is not)
// Needs Python 3 (skipped with a SKIPPED line when there is none). Never spawns .sh. Run in CI: node setup/test-blender3d.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const D3 = path.join(REPO, 'template', 'brand', 'library', '3d');
const tmp = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'blender3d-')));
const fwd = (p) => p.replace(/\\/g, '/');
process.on('exit', () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} });

const py = ['python3', 'python', 'py'].find((c) => { const r = spawnSync(c, ['-c', 'import sys; print(sys.version_info[0])'], { encoding: 'utf8' }); return r.status === 0 && r.stdout.trim() === '3'; });
if (!py) { console.log('SKIPPED: Python 3 was not found, so the Blender library tests did not run'); process.exit(0); }
const runPy = (args, input) => spawnSync(py, ['-I', ...args], { encoding: 'utf8', input, timeout: 120000, env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });

// 1. compile
const files = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== '__pycache__') walk(p); } else if (e.name.endsWith('.py')) files.push(p); } })(D3);
const comp = runPy(['-c', 'import sys\nfor f in sys.argv[1:]:\n    compile(open(f, encoding="utf-8").read(), f, "exec")', ...files]);
assert.equal(comp.status, 0, `a .py file in brand/library/3d does not compile:\n${comp.stderr}`);
console.log(`ok   ${files.length} Python files compile`);

// 2. terrain.py
const terrainTest = String.raw`
import sys, os, math, json, struct, zlib, array, tempfile, urllib.error
sys.path.insert(0, sys.argv[1])
import terrain as T

# decode maths
assert T.terrarium_height(128, 0, 0) == 0
assert T.terrarium_height(128, 1, 128) == 1.5
assert T.terrarium_height(0, 0, 0) == -32768
for m in (-100.0, 0.0, 12.5, 2999.25, 8848.0):
    assert abs(T.terrarium_height(*T.height_to_terrarium(m)) - m) <= 1 / 256, m

# bbox -> tiles
x, y = T.lonlat_to_tile_f(0, 0, 1); assert abs(x - 1) < 1e-9 and abs(y - 1) < 1e-9
x, y = T.lonlat_to_tile_f(-180, 85.05112878, 2); assert abs(x) < 1e-9 and abs(y) < 1e-6
assert T.bbox_tiles((-80, -179.9, 80, 179.9), 2) == (0, 3, 0, 3)
x0, x1, y0, y1 = T.bbox_tiles((46.5, 7.5, 46.7, 7.9), 8); assert x0 <= x1 and y0 <= y1
assert (x1 - x0 + 1) * (y1 - y0 + 1) <= 4
def lonlat_of(fx, fy, z):
    n = 2 ** z
    return fx / n * 360 - 180, math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * fy / n))))
for bad in ('1,2,3', 'a,b,c,d', '50,0,40,10', '0,10,5,5', '0,-200,5,5', '-90,0,90,10'):
    try: T.parse_bbox(bad); raise SystemExit('bbox accepted: ' + bad)
    except T.TerrainError: pass
assert T.parse_bbox('46.5, 7.5, 46.7, 7.9') == (46.5, 7.5, 46.7, 7.9)

# caps
for z in (0, 13, 99):
    try: T.plan((46.5, 7.5, 46.7, 7.9), z); raise SystemExit('zoom accepted: %d' % z)
    except T.TerrainError as e: assert 'zoom' in str(e)
try: T.plan((-60, -170, 60, 170), 6); raise SystemExit('tile cap not enforced')
except T.TerrainError as e: assert 'cap' in str(e) and 'Lower --zoom' in str(e)
try: T.plan((46.5, 7.5, 46.7, 7.9), 8, 99); raise SystemExit('max-tiles above the hard limit accepted')
except T.TerrainError: pass
assert len(T.plan((46.5, 7.5, 46.7, 7.9), 8)) >= 1

# PNG decoding with every filter type
def png(w, h, rows, ft):
    prev = bytearray(w * 3); raw = bytearray()
    for r in rows:
        cur = bytearray(r); out = bytearray()
        for i in range(len(cur)):
            a = cur[i - 3] if i >= 3 else 0; b = prev[i]; c = prev[i - 3] if i >= 3 else 0
            if ft == 0: p = 0
            elif ft == 1: p = a
            elif ft == 2: p = b
            elif ft == 3: p = (a + b) >> 1
            else:
                q = a + b - c; pa, pb, pc = abs(q - a), abs(q - b), abs(q - c)
                p = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
            out.append((cur[i] - p) & 255)
        raw.append(ft); raw += out; prev = cur
    def ch(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + ch(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + ch(b'IDAT', zlib.compress(bytes(raw))) + ch(b'IEND', b'')
import random
rng = random.Random(4)
rows = [bytes(rng.randrange(256) for _ in range(5 * 3)) for _ in range(4)]
for ft in range(5):
    w, h, c, px = T.decode_png_rgb(png(5, 4, rows, ft))
    assert (w, h, c) == (5, 4, 3) and bytes(px) == b''.join(rows), 'filter %d' % ft
try: T.decode_png_rgb(b'<html>not found</html>'); raise SystemExit('html accepted as png')
except T.TerrainError: pass

# 16-bit preview png round trips through the decoder's chunk reader
g = T.encode_png_gray16(3, 2, [0, 1000, 65535, 5, 6, 7]); assert g[:8] == b'\x89PNG\r\n\x1a\n' and b'IEND' in g

# synthetic tiles: height = global pixel x + 0.5 * global pixel y (metres), so stitching and cropping are checkable
Z = 2
def tile_png(tx, ty):
    rgb = bytearray()
    for r in range(256):
        for c in range(256):
            rgb += bytes(T.height_to_terrarium((tx * 256 + c) + 0.5 * (ty * 256 + r)))
    return T.encode_png_rgb(256, 256, bytes(rgb))
calls = []
def stub(url):
    calls.append(url)
    z, x, y = [int(p) for p in url.replace('.png', '').split('/')[-3:]]
    return tile_png(x, y)
sleeps = []
logs = []
tmpd = tempfile.mkdtemp()
fx0, fx1, fy0, fy1 = 1.25, 2.5, 1.25, 2.0
n_lon, n_lat = lonlat_of(fx0, fy0, Z); s_lon, s_lat = lonlat_of(fx1, fy1, Z)
bbox = (s_lat, n_lon, n_lat, s_lon)
out = os.path.join(tmpd, 'data'); cache = os.path.join(tmpd, 'cache')
meta = T.build(bbox, Z, out, cache, fetch=stub, sleep=sleeps.append, log=logs.append)
assert len(calls) == 2, calls
assert all(u.startswith('https://s3.amazonaws.com/elevation-tiles-prod/terrarium/2/') for u in calls)
assert meta['width'] == 320 and meta['height'] == 192, (meta['width'], meta['height'])
a = array.array('f'); a.frombytes(open(os.path.join(out, 'height.f32'), 'rb').read()); assert len(a) == 320 * 192
for (i, j) in ((0, 0), (319, 0), (10, 100), (319, 191), (160, 96)):
    px, py = fx0 * 256 + i + 0.5 - 0.5 - 256, fy0 * 256 + j + 0.5 - 0.5 - 256
    exp = (1 * 256 + px) + 0.5 * (1 * 256 + py)
    assert abs(a[j * 320 + i] - exp) < 0.2, (i, j, a[j * 320 + i], exp)
assert abs(meta['min_m'] - min(a)) < 1e-3 and abs(meta['max_m'] - max(a)) < 1e-3
for f in ('heightmap.png', 'meta.json', 'ATTRIBUTION.txt', 'height.f32'): assert os.path.exists(os.path.join(out, f)), f
att = open(os.path.join(out, 'ATTRIBUTION.txt'), encoding='utf-8').read()
assert 'U.S. Geological Survey' in att and 'Copernicus' in att and 'For a caption' in att
assert 'Terrain data' in json.load(open(os.path.join(out, 'meta.json')))['attribution_short']
# cache: a second run fetches nothing
build_calls = len(calls)
T.build(bbox, Z, out, cache, fetch=stub, sleep=sleeps.append, log=logs.append)
assert len(calls) == build_calls, 'the tile cache was not used'
# a downsample cap
m2 = T.build(bbox, Z, os.path.join(tmpd, 'small'), cache, fetch=stub, max_out=100, sleep=sleeps.append, log=logs.append)
assert max(m2['width'], m2['height']) <= 100, m2

# retries and clear errors
state = {'n': 0}
def flaky(url):
    state['n'] += 1
    if state['n'] < 3: raise urllib.error.URLError('connection reset')
    return tile_png(0, 0)
d = T.get_tile(2, 0, 0, os.path.join(tmpd, 'c2'), fetch=flaky, sleep=sleeps.append, log=logs.append)
assert state['n'] == 3 and d[:4] == b'\x89PNG'
nf = {'n': 0}
def gone(url):
    nf['n'] += 1; raise urllib.error.HTTPError(url, 404, 'Not Found', {}, None)
try: T.get_tile(2, 0, 1, os.path.join(tmpd, 'c3'), fetch=gone, sleep=sleeps.append, log=logs.append); raise SystemExit('404 accepted')
except T.TerrainError as e: assert 'tile 2/0/1' in str(e) and 'HTTP 404' in str(e)
assert nf['n'] == 1, 'a 404 must not be retried'
def htmlpage(url): return b'<html>blocked</html>'
try: T.get_tile(2, 1, 1, os.path.join(tmpd, 'c4'), fetch=htmlpage, retries=2, sleep=sleeps.append, log=logs.append); raise SystemExit('html accepted')
except T.TerrainError as e: assert 'could not get tile' in str(e)
assert T.USER_AGENT and '@' not in T.USER_AGENT and 'http' not in T.USER_AGENT

# synthetic landscape needs no network and says so
sd = os.path.join(tmpd, 'syn'); sm = T.synthetic(sd)
assert sm['source'] == 'synthetic' and 'no data credit' in sm['attribution_short']
# the plan command and the exit codes of the command line
assert T.main(['plan', '--bbox', '46.5,7.5,46.7,7.9', '--zoom', '8']) == 0
assert T.main(['plan', '--bbox', '46.5,7.5,46.7,7.9', '--zoom', '30']) == 1
print('terrain ok')
`;
const t = runPy(['-', D3], terrainTest);
assert.equal(t.status, 0, `terrain.py tests failed:\n${t.stdout}\n${t.stderr}`);
assert.match(t.stdout, /terrain ok/);
console.log('ok   terrain.py: decode maths, PNG filters, bbox to tiles, caps, stitching, cache, retries, attribution');

// 3. bb.py with a fake bpy
const bbTest = String.raw`
import sys, types, math
sys.path.insert(0, sys.argv[1] + '/lib')
class V(tuple):
    def __new__(cls, *a): return tuple.__new__(cls, a[0] if len(a) == 1 and not isinstance(a[0], (int, float)) else a)
    x = property(lambda s: s[0]); y = property(lambda s: s[1]); z = property(lambda s: s[2])
class Anim:
    def __init__(self): self.keys = []; self.location = (0, 0, 0)
    def keyframe_insert(self, prop, frame=None): self.keys.append((prop, frame, tuple(getattr(self, prop)) if prop == 'location' else getattr(self, prop)))
class Dof:
    use_dof = False; aperture_fstop = 0; focus_object = 'x'; focus_distance = 0
    def __init__(self): self.keys = []
    def keyframe_insert(self, prop, frame=None): self.keys.append((frame, getattr(self, prop)))
class Cam(Anim):
    def __init__(self):
        super().__init__(); self.data = types.SimpleNamespace(dof=Dof()); self.location = (0, -14.0, 3.0)
        self.matrix_world = types.SimpleNamespace(translation=types.SimpleNamespace(__sub__=None))
class Render: fps = 30; use_motion_blur = False; motion_blur_shutter = 0
class Scene:
    frame_end = 30; render = Render(); frame = 1
    def frame_set(self, f): self.frame = f
sc = Scene()
bpy = types.ModuleType('bpy'); bpy.context = types.SimpleNamespace(scene=sc, view_layer=types.SimpleNamespace(update=lambda: None))
bpy.data = types.SimpleNamespace(); bpy.types = types.SimpleNamespace()
bm = types.ModuleType('bmesh'); mu = types.ModuleType('mathutils'); mu.Vector = lambda v: V(*tuple(v))
sys.modules.update({'bpy': bpy, 'bmesh': bm, 'mathutils': mu})
import bb

# existing helpers still there
for n in ('setup', 'mat', 'mat_image', 'rounded_box', 'cylinder', 'plane', 'text3d', 'import_model', 'blob_shadow', 'studio_lights', 'camera', 'smooth', 'key', 'orbit', 'push_in', 'render', 'rgba', 'brand_colors', 'opt', 'flag'):
    assert callable(getattr(bb, n)), n
assert bb.smooth(0) == 0 and bb.smooth(1) == 1 and abs(bb.smooth(.5) - .5) < 1e-9
for k in ('linear', 'smooth', 'smoother', 'in', 'out'):
    assert bb.ease(0, k) == 0 and abs(bb.ease(1, k) - 1) < 1e-9, k
assert bb.ease(.1, 'smoother') < bb.ease(.1, 'linear') < bb.ease(.1, 'out')

# paths ease in and out and hit both ends
pts = bb.line_points((0, -20, 3), (0, -12, 3), 31)
assert pts[0] == (0, -20, 3) and abs(pts[-1][1] + 12) < 1e-9
assert abs(pts[1][1] - pts[0][1]) < abs(pts[15][1] - pts[14][1]) > abs(pts[-1][1] - pts[-2][1])
arc = bb.orbit_points((0, 0, 0), 10, 2, -100, -80, 21)
assert all(abs(math.hypot(p[0], p[1]) - 10) < 1e-9 for p in arc) and arc[0][0] < 0 < arc[-1][0]

# handheld: repeatable, seed-dependent, scaled, zero when off, small and smooth
a = bb.handheld_offsets(60, 1.0, 7); b = bb.handheld_offsets(60, 1.0, 7); c = bb.handheld_offsets(60, 1.0, 8)
assert a == b and a != c
assert all(v == 0 for v in bb.handheld_offsets(5, 0.0, 7)[2])
big = bb.handheld_offsets(60, 2.0, 7)
assert abs(big[10][0]) > 0 and abs(big[10][0] / a[10][0] - 2) < 1e-9
assert max(abs(v) for row in a for v in row) < 0.2
assert max(abs(a[i + 1][0] - a[i][0]) for i in range(59)) < 0.02, 'handheld is jumpy'

# dof, motion blur, rack focus, camera moves with a fake camera
cam = Cam()
d = bb.dof(cam, distance=12, fstop=1.8)
assert d.use_dof and d.aperture_fstop == 1.8 and d.focus_distance == 12
obj = object(); bb.dof(cam, focus=obj, fstop=4); assert cam.data.dof.focus_object is obj
bb.motion_blur(True, 0.4); assert sc.render.use_motion_blur and sc.render.motion_blur_shutter == 0.4
bb.rack_focus(cam, 5, 14, 1, 30, 2.0)
assert cam.data.dof.keys == [(1, 5.0), (30, 14.0)] and cam.data.dof.focus_object is None
cam = Cam(); bb.camera_move(cam, 'push', (0, 0, 0), 0.25, frames=10)
ys = [k[2][1] for k in cam.keys]; assert len(ys) == 10 and ys[0] == -14 and abs(ys[-1] + 10.5) < 1e-9
cam = Cam(); bb.camera_move(cam, 'pull', (0, 0, 0), 0.5, frames=10); assert abs(cam.keys[-1][2][1] + 21) < 1e-9
cam = Cam(); bb.camera_move(cam, 'orbit', (0, 0, 0), sweep=40, frames=10)
r = [math.hypot(k[2][0], k[2][1]) for k in cam.keys]; assert max(r) - min(r) < 1e-9 and abs(r[0] - math.hypot(14, 0)) < 1e-9
cam = Cam(); bb.camera_move(cam, 'static', frames=10); assert cam.keys == []
try: bb.camera_move(Cam(), 'spin'); raise AssertionError('bad preset accepted')
except SystemExit: pass
print('bb ok')
`;
const b = runPy(['-', D3], bbTest);
assert.equal(b.status, 0, `lib/bb.py fake-bpy tests failed:\n${b.stdout}\n${b.stderr}`);
assert.match(b.stdout, /bb ok/);
console.log('ok   lib/bb.py with a fake bpy: old helpers present, easing, camera paths, handheld, depth of field, rack focus, moves');

// 4. a real Blender render (optional)
const candidates = [process.env.BLENDER_PATH, '/opt/homebrew/bin/blender', '/usr/local/bin/blender', '/Applications/Blender.app/Contents/MacOS/Blender', '/usr/bin/blender'].filter(Boolean);
const blender = candidates.find((c) => fs.existsSync(c)) || (spawnSync('blender', ['--version'], { encoding: 'utf8' }).status === 0 ? 'blender' : null);
if (!blender || process.env.CI) {
  console.log('SKIPPED: ' + (blender ? 'CI run' : 'Blender is not installed') + ', so the headless terrain render was not tried (Blender is an optional free tool)');
} else {
  const data = path.join(tmp, 'syn'), out = path.join(tmp, 'render');
  assert.equal(runPy([path.join(D3, 'terrain.py'), 'synthetic', '--out', data]).status, 0);
  const r = spawnSync(blender, ['-b', '--factory-startup', '-P', path.join(D3, 'shots', 'terrain.py'), '--', '--out', out, '--data', data, '--size', '320', '--height', '180', '--grid', '48', '--still', '1', '--handheld', '1', '--dof', '1'], { encoding: 'utf8', timeout: 180000 });
  assert.ok(fs.existsSync(path.join(out, 'still.png')), `terrain render made no still:\n${r.stdout}\n${r.stderr}`);
  assert.ok(fs.statSync(path.join(out, 'still.png')).size > 1000);
  console.log('ok   Blender rendered a tiny terrain still: ' + fwd(path.join(out, 'still.png')).split('/').slice(-2).join('/'));
}
console.log('test-blender3d: all checks passed');
