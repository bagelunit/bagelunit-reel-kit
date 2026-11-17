# Any pixel sprite / mascot PNG -> a voxel hero clip in Blender. Run:
#   blender -b -P sprite_voxel.py -- --png path/to/sprite.png --out out/dir [--grid 40] [--depth 4] [--frames 60] [--size 960] [--cam wide]
# The PNG is cropped to its opaque pixels, shrunk to --grid blocks on its long side (box average), colours reduced to 12, and every
# opaque pixel becomes one block of that colour. Colours go through sRGB -> linear so brand hexes render true. Transparent
# background. Each new mascot rendered this way is shown to the brand owner before first use (the brand's CLAUDE.md).
import bpy, bmesh, sys, math, os
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def opt(n, d): return argv[argv.index(n) + 1] if n in argv else d
PNG = opt('--png', None); OUT = os.path.abspath(opt('--out', 'sprite/frames')); GRID = int(opt('--grid', 40)); DEPTH = float(opt('--depth', 4)); DEPTH = float(opt('--depth', 1.4)) if '--assemble' in argv else DEPTH
ASM = '--assemble' in argv
N = int(opt('--frames', 60)); SIZE = int(opt('--size', 960)); CAM = opt('--cam', 'wide')
EMIT, SUN, FILL = 0.8, 1.0, 0 if '--assemble' in argv else 40
lin = lambda c: ((c + 0.055) / 1.055) ** 2.4 if c > 0.04045 else c / 12.92

import numpy as np
_img = bpy.data.images.load(os.path.abspath(PNG)); _w, _h = _img.size
_a = np.empty(_w * _h * 4, dtype=np.float32); _img.pixels.foreach_get(_a); _a = _a.reshape(_h, _w, 4)[::-1]   # top row first
def _srgb(v): return np.where(v <= 0.0031308, v * 12.92, 1.055 * np.power(np.maximum(v, 0), 1 / 2.4) - 0.055)
_rgb = (np.clip(_a[..., :3], 0, 1) * 255).astype(np.float32); _al = _a[..., 3]
_ys, _xs = np.where(_al > 0.5); _rgb = _rgb[_ys.min():_ys.max() + 1, _xs.min():_xs.max() + 1]; _al = _al[_ys.min():_ys.max() + 1, _xs.min():_xs.max() + 1]
_f = max(1, int(round(max(_al.shape) / GRID))); _H = _al.shape[0] // _f; _W = _al.shape[1] // _f
_rgb = _rgb[:_H * _f, :_W * _f].reshape(_H, _f, _W, _f, 3).mean(axis=(1, 3)); _al = _al[:_H * _f, :_W * _f].reshape(_H, _f, _W, _f).mean(axis=(1, 3))
_q = (np.round(_rgb / 32) * 32).clip(0, 255).astype(int)                       # 8 levels per channel, then keep the 12 most used
_keys, _cnt = np.unique(_q.reshape(-1, 3)[(_al > 0.5).reshape(-1)], axis=0, return_counts=True)
_pal = _keys[np.argsort(-_cnt)[:12]]
def _nearest(c): return tuple(int(v) for v in _pal[np.argmin(((_pal - c) ** 2).sum(axis=1))])
W, H = _W, _H
px = {(x, y): _nearest(_rgb[y, x]) for y in range(H) for x in range(W)}
al = {(x, y): 255 if _al[y, x] > 0.5 else 0 for y in range(H) for x in range(W)}
colors = sorted({px[k] for k in px if al[k] > 128})

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = next(e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items if e.identifier.startswith('BLENDER_EEVEE'))
sc.render.resolution_x = sc.render.resolution_y = SIZE; sc.render.film_transparent = True
sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'; sc.frame_start, sc.frame_end = 1, N; sc.render.fps = 30
sc.view_settings.view_transform = 'Standard'

mats = {}
for c in colors:
    m = bpy.data.materials.new(f'c{c}'); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    rgba = (lin(c[0] / 255), lin(c[1] / 255), lin(c[2] / 255), 1)
    b.inputs['Base Color'].default_value = rgba; b.inputs['Roughness'].default_value = 0.55; b.inputs['Specular IOR Level'].default_value = 0.1
    b.inputs['Emission Color'].default_value = rgba; b.inputs['Emission Strength'].default_value = EMIT
    mats[c] = m
import random
random.seed(11)
if ASM:
    # assemble intro: every block flies in from a random spot, staggered over the first 45% of the clip, then it hops and turns as usual
    ob = bpy.data.objects.new('sprite', None); sc.collection.objects.link(ob)
    blocks = [(x, y) for y in range(H) for x in range(W) if al[(x, y)] > 128]
    for (x, y) in sorted(blocks, key=lambda k: (k[1], random.random())):
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0)); c = bpy.context.active_object; c.parent = ob
        c.scale = (1, DEPTH, 1); c.data.materials.append(mats[px[(x, y)]])
        end = (x - W / 2, 0, (H - 1 - y)); start = (end[0] + random.uniform(-1.6, 1.6) * W, random.uniform(-1, 1) * W, end[2] + random.uniform(0.6, 2.2) * H)
        t0 = 1 + int(N * 0.35 * (1 - y / H) * random.uniform(0.7, 1.0)); t1 = t0 + int(N * 0.18)
        for fr, loc, scl in ((1, start, 0.01), (t0, start, 0.01), (t1, end, 1.0)):
            c.location = loc; c.scale = (scl, scl * DEPTH, scl); c.keyframe_insert('location', frame=fr); c.keyframe_insert('scale', frame=fr)
else:
    me = bpy.data.meshes.new('sprite'); ob = bpy.data.objects.new('sprite', me); sc.collection.objects.link(ob)
    for m in mats.values(): me.materials.append(m)
    idx = {c: i for i, c in enumerate(mats)}
    bm = bmesh.new()
    for y in range(H):
        for x in range(W):
            if al[(x, y)] <= 128: continue
            r = bmesh.ops.create_cube(bm, size=1.0); verts = r['verts']
            bmesh.ops.translate(bm, vec=(x - W / 2, 0, (H - 1 - y)), verts=verts)
            bmesh.ops.scale(bm, vec=(1, DEPTH, 1), verts=verts, space=__import__('mathutils').Matrix.Translation((-(x - W / 2), 0, -(H - 1 - y))))
            for f in {f for v in verts for f in v.link_faces}: f.material_index = idx[px[(x, y)]]
    bm.to_mesh(me); bm.free()
root = ob
H_PX = H
# shadow, lights, camera (one key light, a fill and a shadow plane, scaled to the sprite)
scale = H_PX / 9.0
sm = bpy.data.materials.new('shadow'); sm.use_nodes = True; sb = sm.node_tree.nodes['Principled BSDF']; sb.inputs['Base Color'].default_value = (0, 0, 0, 1); sb.inputs['Alpha'].default_value = 0.28
try: sm.surface_render_method = 'BLENDED'
except Exception: sm.blend_method = 'BLEND'
bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=1, depth=0.02, location=(0, 0, -0.5)); sh = bpy.context.active_object; sh.scale = (W * 0.55, DEPTH * 1.4 + 2, 1); sh.data.materials.append(sm)
bpy.ops.object.light_add(type='SUN', location=(6, -8, 12)); sun = bpy.context.active_object; sun.data.energy = SUN; sun.rotation_euler = (math.radians(50), 0, math.radians(35))
bpy.ops.object.light_add(type='AREA', location=(-8 * scale, -6 * scale, 6 * scale)); fl = bpy.context.active_object; fl.data.energy = FILL * scale * scale; fl.data.size = 8 * scale
CAMS = {'wide': (0, -34, 9, 0, 0, 4.6), 'close': (0, -29, 7.5, 0, 0, 5.0), 'angle': (16, -26, 14, 0, 0, 4.2)}
cx, cy, cz, tx, ty, tz = CAMS[CAM]
bpy.ops.object.empty_add(location=(tx * scale, ty * scale, (H_PX / 2) if tz else 0)); tgt = bpy.context.active_object
bpy.ops.object.camera_add(location=(cx * scale, cy * scale, cz * scale)); cam = bpy.context.active_object; cam.data.lens = 55; sc.camera = cam
cam.data.clip_end = 1000
tc = cam.constraints.new('TRACK_TO'); tc.target = tgt; tc.track_axis = 'TRACK_NEGATIVE_Z'; tc.up_axis = 'UP_Y'
world = bpy.data.worlds.new('w'); world.use_nodes = True; world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.0; sc.world = world

for f in range(1, N + 1):
    t = (f - 1) / N
    hop = max(0.0, math.sin(t * 4 * math.pi)) ** 0.9 * H_PX * 0.3 * (1 if not ASM else (0 if t < 0.55 else 1))
    air = hop > 0.05 * H_PX * 0.3
    squash = 1 - 0.18 * (1 - min(1, hop / (H_PX * 0.06))) if not air else 1 + 0.10 * min(1, hop / (H_PX * 0.12))
    ob.rotation_euler = (0, 0, math.sin(t * 2 * math.pi) * math.radians(28)); ob.location = (0, 0, hop)
    ob.scale = (1 / math.sqrt(squash), 1 / math.sqrt(squash), squash)
    ob.keyframe_insert('location', frame=f); ob.keyframe_insert('rotation_euler', frame=f); ob.keyframe_insert('scale', frame=f)
    k = 1 / (1 + hop / H_PX * 1.2); sh.scale = (W * 0.55 * k, (DEPTH * 1.4 + 2) * k, 1); sh.keyframe_insert('scale', frame=f)
os.makedirs(OUT, exist_ok=True); sc.render.filepath = os.path.join(OUT, 'f_')
if '--still' in argv: sc.frame_set(int(opt('--still', 12))); sc.render.filepath = os.path.join(OUT, 'still.png'); bpy.ops.render.render(write_still=True)
else: bpy.ops.render.render(animation=True)
