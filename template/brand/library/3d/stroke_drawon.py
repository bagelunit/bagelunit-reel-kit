# Hand-drawn stroke draw-on (underline, circle, arrow) rendered in Blender with a transparent background.
#   blender -b -P stroke_drawon.py -- --shape circle|underline|arrow --out strokes/circle --color E23B2E --frames 36 --size 1080
# A bevelled curve whose bevel_factor_end runs 0 -> 1 draws it on; a little noise on the points keeps it hand-drawn.
# Composite over a Print scene with ffmpeg (format=rgba on the clip first).
import bpy, sys, os, math, random
import json, re
def _brand_accent():   # the brand's accent colour (brand/brand.json), else the kit's red
    try:
        h = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'brand.json')))['colors']['accent'].lstrip('#')
        return h if re.fullmatch(r'[0-9A-Fa-f]{6}', h) else 'E23B2E'
    except Exception: return 'E23B2E'
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def opt(n, d): return argv[argv.index(n) + 1] if n in argv else d
SHAPE = opt('--shape', 'circle'); OUT = os.path.abspath(opt('--out', f'strokes/{SHAPE}')); HEX = opt('--color', _brand_accent()); N = int(opt('--frames', 36)); SIZE = int(opt('--size', 1080))
lin = lambda c: ((c + 0.055) / 1.055) ** 2.4 if c > 0.04045 else c / 12.92
col = [lin(int(HEX[i:i + 2], 16) / 255) for i in (0, 2, 4)] + [1]
random.seed(7)
bpy.ops.wm.read_factory_settings(use_empty=True); sc = bpy.context.scene
sc.render.engine = next(e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items if e.identifier.startswith('BLENDER_EEVEE'))
sc.render.resolution_x = sc.render.resolution_y = SIZE; sc.render.film_transparent = True
sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'; sc.frame_start, sc.frame_end = 1, N
sc.view_settings.view_transform = 'Standard'
j = lambda: random.uniform(-0.05, 0.05)
pts = {
    'circle': [(math.cos(a) * 2.2 + j(), math.sin(a) * 1.5 + j()) for a in [i * 2 * math.pi / 24 * 1.08 + 0.4 for i in range(25)]],
    'underline': [(-3 + i * 0.5 + j(), -0.2 * math.sin(i * 0.9) + j()) for i in range(13)],
    'arrow': [(-3 + i * 0.4, 0.6 * math.sin(i * 0.28) + j()) for i in range(16)] + [(2.6, 0.55), (2.0, 1.0), (2.65, 0.6), (2.2, 0.0)],
}[SHAPE]
cu = bpy.data.curves.new('s', 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = 0.09; cu.bevel_resolution = 3; cu.use_fill_caps = True
sp = cu.splines.new('POLY'); sp.points.add(len(pts) - 1)
for p, (x, y) in zip(sp.points, pts): p.co = (x, 0, y, 1)
ob = bpy.data.objects.new('s', cu); sc.collection.objects.link(ob)
m = bpy.data.materials.new('m'); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
b.inputs['Base Color'].default_value = col; b.inputs['Emission Color'].default_value = col; b.inputs['Emission Strength'].default_value = 1.0; b.inputs['Specular IOR Level'].default_value = 0
cu.materials.append(m)
for f in range(1, N + 1):
    t = min(1, (f - 1) / (N * 0.7)); cu.bevel_factor_end = 1 - (1 - t) ** 3; cu.keyframe_insert('bevel_factor_end', frame=f)
bpy.ops.object.camera_add(location=(0, -10, 0), rotation=(math.radians(90), 0, 0)); cam = bpy.context.active_object; cam.data.type = 'ORTHO'; cam.data.ortho_scale = 8; sc.camera = cam
world = bpy.data.worlds.new('w'); world.use_nodes = True; world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0; sc.world = world
os.makedirs(OUT, exist_ok=True); sc.render.filepath = os.path.join(OUT, 'f_'); bpy.ops.render.render(animation=True)
