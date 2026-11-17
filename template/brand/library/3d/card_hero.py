# A generic payment card as a 3D hero, rendered headless in Blender (owner pilot 2026-11-16, the depth pilot reel chatgpt-wallet-shop-owner).
#   blender -b -P card_hero.py -- --out card/frames --mode float|flip --frames 90 --size 720 [--still 30]
# NO logos, NO card numbers, NO text: it is a plain card (a chip and a band) so it names no bank or network (house rule 9); labels are
# added in the Print layer. Colours are the Harbor theme (accent #1F5EFF front, ink #12161D back, amber #F2A93B chip), sRGB -> linear.
#   float: a slow bob and a 3/4 sway, loops.   flip: the card turns over once (front -> back) with a small lift, then holds.
# Transparent background so it sits inside a Print scene (composite with ffmpeg, format=rgba).
import bpy, sys, math, os
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def opt(name, default):
    return argv[argv.index(name) + 1] if name in argv else default
OUT = os.path.abspath(opt('--out', 'card/frames')); N = int(opt('--frames', 90)); SIZE = int(opt('--size', 720)); STILL = opt('--still', None); MODE = opt('--mode', 'float')
FRONT = opt('--front', '#1F5EFF'); BACK = opt('--back', '#12161D'); CHIP = opt('--chip', '#F2A93B'); EMIT = float(opt('--emit', 0.8))
def hexlin(h):
    h = h.lstrip('#'); lin = lambda c: ((c + 0.055) / 1.055) ** 2.4 if c > 0.04045 else c / 12.92
    return (lin(int(h[0:2], 16) / 255), lin(int(h[2:4], 16) / 255), lin(int(h[4:6], 16) / 255), 1)

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
engines = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
sc.render.engine = next(e for e in engines if e.startswith('BLENDER_EEVEE'))
sc.render.resolution_x = sc.render.resolution_y = SIZE
sc.render.film_transparent = True
sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
sc.frame_start, sc.frame_end = 1, N; sc.render.fps = 30

def mat(name, rgba, rough=0.35, emit=True, metal=0.0, grad=None, ek=1.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes['Principled BSDF']; b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal; b.inputs['Specular IOR Level'].default_value = 0.6
    try: b.inputs['Coat Weight'].default_value = 0.2; b.inputs['Coat Roughness'].default_value = 0.12   # a clear glossy coat, like a printed card
    except Exception: pass
    if grad:   # a soft diagonal gradient (lighter top-left to the true colour), driven by object-space coordinates
        tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ'); mul = nt.nodes.new('ShaderNodeMath'); ramp = nt.nodes.new('ShaderNodeValToRGB')
        nt.links.new(tc.outputs['Object'], sep.inputs[0]); mul.operation = 'ADD'
        nt.links.new(sep.outputs['X'], mul.inputs[0]); nt.links.new(sep.outputs['Z'], mul.inputs[1])
        ramp.color_ramp.elements[0].position = 0.0; ramp.color_ramp.elements[0].color = rgba
        ramp.color_ramp.elements[1].position = 1.0; ramp.color_ramp.elements[1].color = grad
        mp = nt.nodes.new('ShaderNodeMapRange'); mp.inputs['From Min'].default_value = 4.5; mp.inputs['From Max'].default_value = -4.5
        nt.links.new(mul.outputs[0], mp.inputs['Value']); nt.links.new(mp.outputs['Result'], ramp.inputs['Fac'])
        nt.links.new(ramp.outputs['Color'], b.inputs['Base Color'])
        if emit: nt.links.new(ramp.outputs['Color'], b.inputs['Emission Color']); b.inputs['Emission Strength'].default_value = EMIT * ek
    else:
        b.inputs['Base Color'].default_value = rgba
        if emit: b.inputs['Emission Color'].default_value = rgba; b.inputs['Emission Strength'].default_value = EMIT * ek   # keeps the theme colour true under any light
    return m
def lighten(c, k): return (c[0] + (1 - c[0]) * k, c[1] + (1 - c[1]) * k, c[2] + (1 - c[2]) * k, 1)
M_FRONT = mat('front', hexlin(FRONT), 0.28, True, 0.0, lighten(hexlin(FRONT), 0.10)); M_BACK = mat('back', hexlin(BACK), 0.5, True, 0.0, lighten(hexlin(BACK), 0.03), 0.25)
M_CHIP = mat('chip', hexlin(CHIP), 0.22, True, 0.7); M_BAND = mat('band', hexlin('#EDF0F2'), 0.5, True); M_ARC = mat('arc', (1, 1, 1, 1), 0.3, True)

import bmesh
root = bpy.data.objects.new('card', None); sc.collection.objects.link(root)
W, H, T, R = 8.56, 5.40, 0.10, 0.55           # ID-1 proportions, corner radius R, thickness T
def rounded_card():
    pts = []
    for cx, cz, a0 in ((W / 2 - R, H / 2 - R, 0), (-W / 2 + R, H / 2 - R, 90), (-W / 2 + R, -H / 2 + R, 180), (W / 2 - R, -H / 2 + R, 270)):
        for i in range(0, 13):
            a = math.radians(a0 + i * 90 / 12); pts.append((cx + R * math.cos(a), 0, cz + R * math.sin(a)))
    me = bpy.data.meshes.new('cardmesh'); bm = bmesh.new()
    vs = [bm.verts.new((x, -T / 2, z)) for x, _, z in pts]; f = bm.faces.new(vs)
    ex = bmesh.ops.extrude_face_region(bm, geom=[f]); mv = [e for e in ex['geom'] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=mv, vec=(0, T, 0)); bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for fc in bm.faces:   # front (-Y) takes the front material, back (+Y) the back material, the thin rim the back colour
        n = fc.normal; fc.material_index = 0 if n.y < -0.5 else (1 if n.y > 0.5 else 1)
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new('card', me); sc.collection.objects.link(o); o.parent = root
    me.materials.append(M_FRONT); me.materials.append(M_BACK)
    bv = o.modifiers.new('b', 'BEVEL'); bv.width = 0.018; bv.segments = 2   # a hairline edge so it catches the rim light
    for fc in me.polygons: fc.use_smooth = True
    return o
rounded_card()
def box(name, loc, scale, m, bevel=0.0, seg=2):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc); o = bpy.context.active_object
    o.name = name; o.scale = scale; o.data.materials.append(m); o.parent = root
    if bevel: b = o.modifiers.new('b', 'BEVEL'); b.width = bevel; b.segments = seg
    return o
box('chip', (-2.75, -T / 2 - 0.014, 0.5), (1.25, 0.03, 0.95), M_CHIP, 0.1, 3)
box('chipline1', (-2.75, -T / 2 - 0.032, 0.5), (1.25, 0.012, 0.045), M_FRONT, 0, 1); box('chipline2', (-2.75, -T / 2 - 0.032, 0.5), (0.045, 0.012, 0.95), M_FRONT, 0, 1)
box('band', (0, T / 2 + 0.012, 1.45), (W - 0.9, 0.025, 0.9), M_BAND, 0.04, 2)
box('band2', (1.4, T / 2 + 0.012, -1.4), (3.6, 0.025, 0.5), M_FRONT, 0.04, 2)
def arc(name, r, a0, a1, cx, cz, y, depth=0.06):   # a thin contactless arc (an unbranded wave symbol, drawn as a bevelled curve)
    cu = bpy.data.curves.new(name, 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = depth; cu.bevel_resolution = 3
    sp = cu.splines.new('POLY'); n = 16; sp.points.add(n)
    for i in range(n + 1):
        a = math.radians(a0 + (a1 - a0) * i / n); sp.points[i].co = (cx + r * math.cos(a), y, cz + r * math.sin(a), 1)
    o = bpy.data.objects.new(name, cu); sc.collection.objects.link(o); o.parent = root; o.data.materials.append(M_ARC)
for k, r in enumerate((0.55, 0.95, 1.35)): arc(f'arc{k}', r, -42, 42, 2.4, -1.35 + 1.55, -T / 2 - 0.03)

# a soft translucent shadow far below (a radial falloff, so no hard edge), while the background stays transparent
sm = bpy.data.materials.new('shadow'); sm.use_nodes = True; nt = sm.node_tree; sb = nt.nodes['Principled BSDF']; sb.inputs['Base Color'].default_value = (0, 0, 0, 1)
tc = nt.nodes.new('ShaderNodeTexCoord'); gr = nt.nodes.new('ShaderNodeTexGradient'); gr.gradient_type = 'QUADRATIC_SPHERE'
mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Location'].default_value = (0.5, 0.5, 0); mp.inputs['Scale'].default_value = (1, 1, 1)
mu = nt.nodes.new('ShaderNodeMath'); mu.operation = 'MULTIPLY'; mu.inputs[1].default_value = 0.34
nt.links.new(tc.outputs['Generated'], gr.inputs['Vector']); nt.links.new(gr.outputs['Fac'], mu.inputs[0]); nt.links.new(mu.outputs[0], sb.inputs['Alpha'])
try: sm.surface_render_method = 'BLENDED'
except Exception: sm.blend_method = 'BLEND'
bpy.ops.mesh.primitive_plane_add(size=2, location=(0, 0.6, -4.5), rotation=(0, 0, 0)); sh = bpy.context.active_object
sh.rotation_euler = (0, 0, 0); sh.scale = (4.8, 1.6, 1); sh.data.materials.append(sm)
sh.rotation_euler = (0, 0, 0)
# the plane lies in XY; turn it to lie flat under the card (XY is the floor in Blender, so no turn is needed) and mirror Generated coords
bpy.ops.object.light_add(type='SUN', location=(5, -8, 10)); sun = bpy.context.active_object; sun.data.energy = 1.6; sun.rotation_euler = (math.radians(48), math.radians(10), math.radians(30))
bpy.ops.object.light_add(type='AREA', location=(-9, -9, 5)); fill = bpy.context.active_object; fill.data.energy = 900; fill.data.size = 9
bpy.ops.object.light_add(type='AREA', location=(8, 4, 6)); rim = bpy.context.active_object; rim.data.energy = 500; rim.data.size = 6   # a rim so the edge catches light
bpy.ops.object.empty_add(location=(0, 0, 0)); tgt = bpy.context.active_object
bpy.ops.object.camera_add(location=(0, -24, 1.2)); cam = bpy.context.active_object
cam.data.lens = 55; sc.camera = cam
tc = cam.constraints.new('TRACK_TO'); tc.target = tgt; tc.track_axis = 'TRACK_NEGATIVE_Z'; tc.up_axis = 'UP_Y'
sc.view_settings.view_transform = 'Standard'
world = bpy.data.worlds.new('w'); world.use_nodes = True; world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.0; sc.world = world

ease = lambda x: x * x * (3 - 2 * x)
for f in range(1, N + 1):
    t = (f - 1) / N
    if MODE == 'float':
        w = math.sin(t * 2 * math.pi)
        root.location = (0, 0, w * 0.45)
        root.rotation_euler = (math.radians(8 + w * 4), math.radians(-6 + w * 3), math.radians(-22 + math.sin(t * 2 * math.pi + 1.2) * 12))
    else:   # flip: turn over about the vertical (Z) axis, front -> back, a lift in the middle, then hold with a small settle
        q = min(1, t / 0.55); p = ease(q); lift = math.sin(q * math.pi) * 1.3; after = max(0, t - 0.55)
        root.rotation_euler = (math.radians(6), math.radians(-6), math.radians(-22 * (1 - p) + 158 * p))
        root.location = (0, 0, lift + math.sin(after * 40) * 0.05 * math.exp(-after * 6))
    root.keyframe_insert('location', frame=f); root.keyframe_insert('rotation_euler', frame=f)
    s = 1 - 0.18 * (root.location.z / 1.3 if MODE == 'flip' else root.location.z / 0.45 * 0.3)
    sh.scale = (4.6 * s, 1.5 * s, 1); sh.keyframe_insert('scale', frame=f)

if STILL:
    sc.frame_set(int(STILL)); sc.render.filepath = os.path.join(OUT, 'still.png'); os.makedirs(OUT, exist_ok=True)
    bpy.ops.render.render(write_still=True)
else:
    os.makedirs(OUT, exist_ok=True); sc.render.filepath = os.path.join(OUT, 'f_'); bpy.ops.render.render(animation=True)
