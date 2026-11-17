# A 3D shaded-relief map of a real place (or a made-up one): a displaced grid in soft sun light, optional label boxes, a slow camera move.
#   python3 brand/library/3d/terrain.py fetch --bbox S,W,N,E --zoom 10 --out reels/<slug>/build/3d/terrain-data     (the only step that uses the network)
#   blender -b -P shots/terrain.py -- --data reels/<slug>/build/3d/terrain-data --out reels/<slug>/build/3d/terrain [options]
#   (or: bash blender_shot.sh shots/terrain.py <out-dir> --data <data-dir> --still 45 | --clip terrain.mov)
# Options: --data DIR (height.f32 + meta.json from terrain.py; without it a made-up landscape is made)  --ramp earth|mono|snow|heat|brand
#   --style ramp|hillshade (coloured by height, or plain grey relief)  --exaggeration 1.6 (height boost)  --sun-az 315 --sun-el 28 (degrees; low sun = long shadows)
#   --labels labels.json ([{"text": "Matterhorn", "u": 0.4, "v": 0.5}] u = 0 west..1 east, v = 0 north..1 south; or {"text", "lon", "lat"})
#   --grid 256 (mesh samples on the long side)  --move orbit|push|static  --transparent 1 (alpha background; default is the brand's paper colour)
#   --size 1080 --height 1920 --frames 90 --still 45, and the shared camera flags (--dof --fstop --motion-blur --handheld --move-preset ...).
# Colours come from brand/brand.json. The data credit is copied next to the render as ATTRIBUTION.txt and printed: put it in the caption.
import sys, os, math, json, array, shutil
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'lib'))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import bpy
import bb

OUT = bb.opt('--out', 'out/terrain')
DATA = bb.opt('--data', None)
W_PX, H_PX, N = bb.opt('--size', 1080, int), bb.opt('--height', 1920, int), bb.opt('--frames', 90, int)
col = bb.brand_colors()


def load_heights(d):
    if not d:
        import terrain
        d = os.path.join(OUT, '_synthetic')
        terrain.synthetic(d)
    meta = json.load(open(os.path.join(d, 'meta.json')))
    a = array.array('f')
    with open(os.path.join(d, 'height.f32'), 'rb') as f:
        a.fromfile(f, meta['width'] * meta['height'])
    if sys.byteorder == 'big':
        a.byteswap()
    return d, meta, a


def ramp_colors(name):
    """Stops (position 0..1, hex) for a height colour ramp."""
    if name == 'mono':
        return [(0, '2B2B2B'), (1, 'F2F2F2')]
    if name == 'snow':
        return [(0, '2F5D3A'), (0.45, '8C9A6B'), (0.7, '9A8B7A'), (0.88, 'E8E8EC'), (1, 'FFFFFF')]
    if name == 'heat':
        return [(0, '2A3A8F'), (0.35, '3FA7A0'), (0.6, 'F2D45C'), (1, 'D6342C')]
    if name == 'brand':
        return [(0, col['ink']), (0.55, col['accent']), (1, col['paper'])]
    return [(0, '3F6B45'), (0.35, '8FA36A'), (0.6, 'B79F7A'), (0.82, '8A7566'), (1, 'F4F1EA')]   # earth


def ramp_at(stops, t):
    for (p0, c0), (p1, c1) in zip(stops, stops[1:]):
        if t <= p1:
            k = 0 if p1 == p0 else (t - p0) / (p1 - p0)
            a, b = bb.rgba(c0), bb.rgba(c1)
            return tuple(a[i] + (b[i] - a[i]) * k for i in range(3)) + (1.0,)
    return bb.rgba(stops[-1][1])


dd, meta, hts = load_heights(DATA)
sw, sh = meta['width'], meta['height']
grid = max(8, bb.opt('--grid', 256, int))
step = max(1, int(math.ceil(max(sw, sh) / grid)))
cols, rows = list(range(0, sw, step)), list(range(0, sh, step))
if cols[-1] != sw - 1: cols.append(sw - 1)
if rows[-1] != sh - 1: rows.append(sh - 1)
SPAN = 10.0                                                         # scene units for the long side
longest_m = max(sw, sh) * meta['metres_per_sample_x']
upm = SPAN / max(1.0, longest_m)                                     # scene units per metre
exag = bb.opt('--exaggeration', 1.6, float)
lo, hi = meta['min_m'], meta['max_m']
sx, sy = SPAN * sw / max(sw, sh), SPAN * sh / max(sw, sh)
# keep the relief readable even for flat or tiny areas: at least 0.6 units tall
zk = max(upm * exag, 0.6 / max(1.0, hi - lo))

sc = bb.setup(W_PX, H_PX, N, transparent=bool(bb.opt('--transparent', 0, int)), world_strength=1.0, world_hex=col['paper'])
verts, faces, vcols = [], [], []
stops = ramp_colors(bb.opt('--ramp', 'earth'))
hillshade = bb.opt('--style', 'ramp') == 'hillshade'
for j in rows:
    for i in cols:
        h = hts[j * sw + i]
        verts.append(((i / (sw - 1) - 0.5) * sx, (0.5 - j / (sh - 1)) * sy, (h - lo) * zk))
        t = (h - lo) / max(1e-6, hi - lo)
        vcols.append((0.72, 0.72, 0.72, 1.0) if hillshade else ramp_at(stops, t))
nc = len(cols)
for r in range(len(rows) - 1):
    for c in range(nc - 1):
        faces.append((r * nc + c, r * nc + c + 1, (r + 1) * nc + c + 1, (r + 1) * nc + c))
mesh = bpy.data.meshes.new('terrain')
mesh.from_pydata(verts, [], faces)
mesh.update()
for p in mesh.polygons:
    p.use_smooth = True
ca = mesh.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
for k, v in enumerate(vcols):
    ca.data[k].color = v
land = bpy.data.objects.new('terrain', mesh)
bpy.context.scene.collection.objects.link(land)
m = bpy.data.materials.new('terrain')
m.use_nodes = True
b = m.node_tree.nodes['Principled BSDF']
attr = m.node_tree.nodes.new('ShaderNodeAttribute')
attr.attribute_name = 'Col'
m.node_tree.links.new(attr.outputs['Color'], b.inputs['Base Color'])
b.inputs['Roughness'].default_value = 0.92
mesh.materials.append(m)

# soft sun: low and warm gives the relief its shadows
az, el = math.radians(bb.opt('--sun-az', 315.0, float)), math.radians(bb.opt('--sun-el', 28.0, float))
relief_h = (hi - lo) * zk
mid = (0, 0, relief_h * 0.35)
bpy.ops.object.light_add(type='SUN', location=(math.sin(az) * 40, math.cos(az) * 40, math.sin(el) * 40))
sun = bpy.context.active_object
sun.data.energy, sun.data.angle, sun.data.color = 3.2, math.radians(6), (1.0, 0.96, 0.9)
tc = sun.constraints.new('TRACK_TO')
tc.target, tc.track_axis, tc.up_axis = bb.target_empty(mid, 'sunaim'), 'TRACK_NEGATIVE_Z', 'UP_Y'

# camera: in front of the map (south), above, looking at the middle; a vertical frame wants it closer than the map is wide
dist = SPAN * 1.15
cam, tgt = bb.camera((0, -dist * 0.9, dist * 0.75 + relief_h * 0.4), mid, lens=bb.opt('--lens', 50, int))
mv = bb.opt('--move', 'orbit')
if mv == 'orbit':
    bb.orbit(cam, mid, math.hypot(0, dist * 0.9), dist * 0.75 + relief_h * 0.4 - mid[2], -118, -62, N, 'smoother')
elif mv == 'push':
    bb.push_in(cam, tuple(cam.location), (0, -dist * 0.6, dist * 0.5 + relief_h * 0.3), N, 'smoother')
else:
    bb.key(cam, 1, location=tuple(cam.location))

# labels: a paper-coloured box with the text, standing on a thin pin above the point, facing the camera
lab = bb.opt('--labels', None)
if lab:
    labels = json.load(open(lab))
    bx = meta['bbox']
    for k, L in enumerate(labels):
        if 'u' in L:
            u, v = float(L['u']), float(L['v'])
        else:
            u = (float(L['lon']) - bx[1]) / (bx[3] - bx[1]); v = (bx[2] - float(L['lat'])) / (bx[2] - bx[0])
        u, v = min(1, max(0, u)), min(1, max(0, v))
        gi, gj = int(round(u * (sw - 1))), int(round(v * (sh - 1)))
        z0 = (hts[gj * sw + gi] - lo) * zk
        x, y = (u - 0.5) * sx, (0.5 - v) * sy
        top = z0 + 0.9 + relief_h * 0.08
        pin = bb.cylinder('pin%d' % k, 0.012, top - z0, bb.mat('pin', col['ink'], rough=0.6), loc=(x, y, (z0 + top) / 2), bevel=0, verts=8)
        piv = bb.target_empty((x, y, top + 0.28), 'labelpivot%d' % k)
        c = piv.constraints.new('TRACK_TO'); c.target, c.track_axis, c.up_axis = cam, 'TRACK_NEGATIVE_Y', 'UP_Z'
        txt = bb.text3d(str(L['text']), 0.34, 0.02, bb.mat('lt', col['ink'], rough=0.5), loc=(0, -0.05, 0), bevel=0.0)
        box = bb.rounded_box('lb%d' % k, 0.34 * 0.62 * len(str(L['text'])) + 0.4, 0.04, 0.62, 0.12, bb.mat('lb', col['paper'], rough=0.7, emit=0.6), loc=(0, 0, 0))
        txt.parent, box.parent = piv, piv

bb.camera_flags(cam, tgt, subject=land)
os.makedirs(OUT, exist_ok=True)
att = os.path.join(dd, 'ATTRIBUTION.txt')
if meta.get('source') == 'synthetic':
    print('ATTRIBUTION none needed (made-up terrain)')
else:
    shutil.copyfile(att, os.path.join(OUT, 'ATTRIBUTION.txt'))
    print('ATTRIBUTION ' + meta['attribution_short'] + ' (full text: ' + os.path.join(OUT, 'ATTRIBUTION.txt').replace('\\', '/') + ')')
bb.render(OUT, bb.opt('--still', None, int))
