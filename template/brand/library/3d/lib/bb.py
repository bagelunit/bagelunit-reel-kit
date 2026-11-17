# bb.py: helpers for Blender shots (runs inside Blender: blender -b -P shot.py -- --out dir ...).
# Import it from a shot script:
#     import sys, os; sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lib')); import bb
# It does the parts every shot repeats and that go wrong: brand colours in linear space (or everything looks washed out), a transparent
# render, a soft studio light rig, a camera that tracks a target, a contact shadow that works with a transparent background, easing,
# and the output (a still, or a numbered PNG sequence f_0001.png ...). Blender's Python has no PIL; use numpy if you need arrays.
import bpy, bmesh, math, os, sys, json, re, pathlib
from mathutils import Vector

HERE = pathlib.Path(__file__).resolve().parent                      # .../brand/library/3d/lib
BRAND_JSON = HERE.parents[2] / 'brand.json'                         # .../brand/brand.json
ENGINE_FONTS = pathlib.Path.home() / '.claude/skills/bagelunit-reels/fonts'


# ---- arguments ----------------------------------------------------------------------------------------------------------------------
ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def opt(name, default=None, cast=str):
    """--name value from the command line after --, cast to the type of default if none is given."""
    if name in ARGV:
        v = ARGV[ARGV.index(name) + 1]
        return cast(v) if cast is not str or default is None else type(default)(v)
    return default


def flag(name):
    return name in ARGV


# ---- colour ---------------------------------------------------------------------------------------------------------------------------
def lin(c):
    return ((c + 0.055) / 1.055) ** 2.4 if c > 0.04045 else c / 12.92


def rgba(hexstr, a=1.0):
    """'#E23B2E' or 'E23B2E' -> linear (r, g, b, a). Blender wants linear: sRGB hexes straight in look washed out."""
    h = str(hexstr).lstrip('#')
    return (lin(int(h[0:2], 16) / 255), lin(int(h[2:4], 16) / 255), lin(int(h[4:6], 16) / 255), a)


def brand_colors():
    """The brand's own colours (brand/brand.json -> colors), else the kit's Print look. Hex strings without #."""
    d = {'paper': 'FBF5E6', 'ink': '15110E', 'accent': 'E23B2E'}
    try:
        c = json.loads(BRAND_JSON.read_text()).get('colors', {})
        for k, src in (('paper', 'background'), ('ink', 'ink'), ('accent', 'accent')):
            h = str(c.get(src) or '').lstrip('#')
            if re.fullmatch(r'[0-9A-Fa-f]{6}', h):
                d[k] = h.upper()
    except Exception:
        pass
    return d


# ---- scene ---------------------------------------------------------------------------------------------------------------------------
def setup(width=1080, height=1080, frames=90, fps=30, transparent=True, samples=48, world_strength=0.5, world_hex='C8CCD2'):
    """A clean empty scene with EEVEE, a transparent film and a soft world (only seen in reflections when transparent)."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    engines = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
    sc.render.engine = next(e for e in engines if e.startswith('BLENDER_EEVEE'))
    try:
        sc.eevee.taa_render_samples = samples
    except Exception:
        pass
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = int(width), int(height), 100
    sc.render.film_transparent = bool(transparent)
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.frame_start, sc.frame_end, sc.render.fps = 1, int(frames), int(fps)
    sc.view_settings.view_transform = 'Standard'                    # Filmic/AgX wash out brand colours
    w = bpy.data.worlds.new('world')
    w.use_nodes = True
    bg = w.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = rgba(world_hex)
    bg.inputs['Strength'].default_value = world_strength
    sc.world = w
    return sc


def collection_objects():
    return [o for o in bpy.context.scene.objects]


# ---- materials ------------------------------------------------------------------------------------------------------------------------
def mat(name, hexstr, rough=0.4, metal=0.0, emit=0.0, coat=0.0, alpha=1.0):
    """A Principled material in a brand hex. emit > 0 keeps the colour true under any light (good for UI and printed colour)."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    c = rgba(hexstr)
    b.inputs['Base Color'].default_value = c
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if emit:
        b.inputs['Emission Color'].default_value = c
        b.inputs['Emission Strength'].default_value = emit
    if coat:
        try:
            b.inputs['Coat Weight'].default_value = coat
            b.inputs['Coat Roughness'].default_value = 0.1
        except Exception:
            pass
    if alpha < 1:
        b.inputs['Alpha'].default_value = alpha
    return m


def mat_image(name, path, rough=0.5, emit=0.0, metal=0.0):
    """A material whose colour is an image (a label, a screen capture). emit 1.0 shows the picture at its own brightness."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = bpy.data.images.load(os.path.abspath(path))
    tex.image.colorspace_settings.name = 'sRGB'
    nt.links.new(tex.outputs['Color'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if emit:
        nt.links.new(tex.outputs['Color'], b.inputs['Emission Color'])
        b.inputs['Emission Strength'].default_value = emit
    return m


def solid_image(path, width, height, hexstr):
    """Write a flat colour PNG (a stand-in screen or label when none is given). Returns the path."""
    img = bpy.data.images.new(os.path.basename(path), width, height, alpha=True)
    c = rgba(hexstr)
    img.pixels[:] = [c[0], c[1], c[2], 1.0] * (width * height)
    img.filepath_raw = os.path.abspath(path)
    img.file_format = 'PNG'
    img.save()
    return path


# ---- objects --------------------------------------------------------------------------------------------------------------------------
def _smooth(o):
    for p in o.data.polygons:
        p.use_smooth = True


def rounded_box(name, w, d, h, radius=0.2, material=None, loc=(0, 0, 0), segments=6):
    """A box w (x) by d (y) by h (z) with rounded edges. radius is capped to a third of the thinnest side."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.scale = (w, d, h)
    bpy.ops.object.transform_apply(scale=True)
    r = min(radius, min(w, d, h) / 3)
    bv = o.modifiers.new('bevel', 'BEVEL')
    bv.width, bv.segments, bv.limit_method = r, segments, 'NONE'
    bpy.ops.object.modifier_apply(modifier='bevel')
    _smooth(o)
    if material:
        o.data.materials.append(material)
    return o


def cylinder(name, radius, height, material=None, loc=(0, 0, 0), bevel=0.05, verts=64):
    bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=height, vertices=verts, location=loc)
    o = bpy.context.active_object
    o.name = name
    if bevel:
        bv = o.modifiers.new('bevel', 'BEVEL')
        bv.width, bv.segments = bevel, 3
        bpy.ops.object.modifier_apply(modifier='bevel')
    _smooth(o)
    if material:
        o.data.materials.append(material)
    return o


def plane(name, w, h, material=None, loc=(0, 0, 0), rot=(0, 0, 0)):
    """A flat w by h plane (faces +Z; rotate it to stand up: rot=(90deg,0,0) faces -Y, toward a camera at -Y)."""
    bpy.ops.mesh.primitive_plane_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.scale = (w, h, 1)
    if material:
        o.data.materials.append(material)
    return o


def text3d(text, size=1.0, extrude=0.08, material=None, loc=(0, 0, 0), rot=(math.radians(90), 0, 0), font=None, align='CENTER', bevel=0.01):
    """3D text standing up, facing -Y (toward a camera at -Y). font: a .ttf path; default is the engine's Anton."""
    bpy.ops.object.text_add(location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = 'text_' + re.sub(r'\W+', '_', text)[:20]
    o.data.body = text
    o.data.size = size
    o.data.extrude = extrude
    o.data.bevel_depth = bevel
    o.data.align_x = align
    o.data.align_y = 'CENTER'
    f = font or str(ENGINE_FONTS / 'Anton-Regular.ttf')
    if os.path.exists(f):
        o.data.font = bpy.data.fonts.load(f)
    if material:
        o.data.materials.append(material)
    return o


def import_model(path, scale_to=None, loc=(0, 0, 0)):
    """Bring in a .glb/.gltf/.obj/.fbx/.blend-free model, centre it, optionally scale its longest side to scale_to. Returns the root empty.
    Only use models whose licence allows it (CC0 or your own) and record the source in brand/library/INDEX.md."""
    ext = pathlib.Path(path).suffix.lower()
    before = set(bpy.data.objects)
    if ext in ('.glb', '.gltf'):
        bpy.ops.import_scene.gltf(filepath=os.path.abspath(path))
    elif ext == '.obj':
        bpy.ops.wm.obj_import(filepath=os.path.abspath(path))
    elif ext == '.fbx':
        bpy.ops.import_scene.fbx(filepath=os.path.abspath(path))
    else:
        raise SystemExit(f'import_model: {ext} is not supported (use .glb, .obj or .fbx)')
    new = [o for o in bpy.data.objects if o not in before]
    root = bpy.data.objects.new('model', None)
    bpy.context.scene.collection.objects.link(root)
    for o in new:
        if o.parent is None:
            o.parent = root
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ Vector(c) for o in new if o.type == 'MESH' for c in o.bound_box]
    if pts:
        lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
        hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
        mid = (lo + hi) / 2
        for o in new:
            if o.parent is root:
                o.location -= mid
        if scale_to:
            k = scale_to / max((hi - lo).x, (hi - lo).y, (hi - lo).z)
            root.scale = (k, k, k)
    root.location = loc
    return root


def blob_shadow(loc=(0, 0, 0), w=4.0, h=2.0, strength=0.55, name='shadow'):
    """A soft contact shadow that works on a transparent background: a black ellipse that fades to nothing at its edge."""
    bpy.ops.mesh.primitive_plane_add(size=1, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.scale = (w, h, 1)
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    gr = nt.nodes.new('ShaderNodeTexGradient')
    gr.gradient_type = 'SPHERICAL'
    mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Location'].default_value = (-0.5, -0.5, 0)
    mp.inputs['Scale'].default_value = (2, 2, 2)                        # the gradient reaches 0 at the middle of each edge of the plane
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.interpolation = 'EASE'
    ramp.color_ramp.elements[0].position = 0.0                         # the gradient is 1 at the centre, 0 at the rim
    ramp.color_ramp.elements[0].color = (0, 0, 0, 0)
    ramp.color_ramp.elements[1].position = 1.0
    ramp.color_ramp.elements[1].color = (0, 0, 0, strength)
    bs = nt.nodes.new('ShaderNodeBsdfTransparent')
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = (0, 0, 0, 1)
    mix = nt.nodes.new('ShaderNodeMixShader')
    inv = nt.nodes.new('ShaderNodeMath')
    inv.operation = 'SUBTRACT'
    inv.inputs[0].default_value = 1.0
    nt.links.new(tc.outputs['UV'], mp.inputs['Vector'])
    nt.links.new(mp.outputs['Vector'], gr.inputs['Vector'])
    nt.links.new(gr.outputs['Fac'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Alpha'], mix.inputs['Fac'])
    nt.links.new(bs.outputs['BSDF'], mix.inputs[1])
    nt.links.new(em.outputs['Emission'], mix.inputs[2])
    nt.links.new(mix.outputs['Shader'], out.inputs['Surface'])
    for attr, val in (('surface_render_method', 'BLENDED'), ('blend_method', 'BLEND')):
        try:
            setattr(m, attr, val)
        except Exception:
            pass
    try:
        m.use_backface_culling = False
    except Exception:
        pass
    o.data.materials.append(m)
    return o


# ---- light and camera -----------------------------------------------------------------------------------------------------------------
def studio_lights(key=900, fill=350, rim=500, size=6.0, center=(0, 0, 0), warm=True):
    """A soft three-light rig around center: a big key from the front-left and above, a fill from the right, a rim from behind."""
    cx, cy, cz = center
    rig = []
    for name, loc, energy, tint in (('key', (-6, -8, 7), key, (1.0, 0.96, 0.9) if warm else (1, 1, 1)),
                                    ('fill', (8, -6, 2), fill, (0.9, 0.95, 1.0)),
                                    ('rim', (4, 7, 6), rim, (1, 1, 1))):
        bpy.ops.object.light_add(type='AREA', location=(cx + loc[0], cy + loc[1], cz + loc[2]))
        L = bpy.context.active_object
        L.name = name
        L.data.energy, L.data.size = energy, size
        L.data.color = tint
        t = L.constraints.new('TRACK_TO')
        t.target = target_empty(center, 'lightaim_' + name)
        t.track_axis, t.up_axis = 'TRACK_NEGATIVE_Z', 'UP_Y'
        rig.append(L)
    return rig


def target_empty(loc=(0, 0, 0), name='target'):
    e = bpy.data.objects.new(name, None)
    e.location = loc
    bpy.context.scene.collection.objects.link(e)
    return e


def camera(loc=(0, -14, 1.5), look_at=(0, 0, 0), lens=55, name='camera'):
    """A camera at loc that always looks at a target empty (returned as .target so a move can animate it)."""
    bpy.ops.object.camera_add(location=loc)
    c = bpy.context.active_object
    c.name = name
    c.data.lens = lens
    tgt = target_empty(look_at, 'camera_target')
    t = c.constraints.new('TRACK_TO')
    t.target, t.track_axis, t.up_axis = tgt, 'TRACK_NEGATIVE_Z', 'UP_Y'
    bpy.context.scene.camera = c
    return c, tgt


def smooth(t):
    """Ease in and out, 0..1 -> 0..1."""
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def key(obj, frame, **props):
    """Set properties (location=(x,y,z), rotation_euler=(...), scale=(...)) on obj and keyframe them at frame."""
    for k, v in props.items():
        setattr(obj, k, v)
        obj.keyframe_insert(k, frame=frame)


def orbit(cam, center=(0, 0, 0), radius=14.0, height=1.5, start_deg=-100, end_deg=-80, frames=None, ease=True):
    """Move the camera on an arc around center from start_deg to end_deg (degrees; -90 is straight in front, looking along +Y)."""
    n = frames or bpy.context.scene.frame_end
    for f in range(1, n + 1):
        t = (f - 1) / max(1, n - 1)
        a = math.radians(start_deg + (end_deg - start_deg) * (smooth(t) if ease else t))
        key(cam, f, location=(center[0] + radius * math.cos(a), center[1] + radius * math.sin(a), center[2] + height))


def push_in(cam, start, end, frames=None, ease=True):
    """Dolly the camera from the start location to the end location."""
    n = frames or bpy.context.scene.frame_end
    for f in range(1, n + 1):
        t = (f - 1) / max(1, n - 1)
        t = smooth(t) if ease else t
        key(cam, f, location=tuple(start[i] + (end[i] - start[i]) * t for i in range(3)))


# ---- output ---------------------------------------------------------------------------------------------------------------------------
def render(out_dir, still=None, name='f_'):
    """still=N renders frame N to out_dir/still.png; otherwise the whole range to out_dir/f_0001.png ... (RGBA PNGs)."""
    sc = bpy.context.scene
    os.makedirs(out_dir, exist_ok=True)
    if still:
        sc.frame_set(int(still))
        sc.render.filepath = os.path.join(out_dir, 'still.png')
        bpy.ops.render.render(write_still=True)
        print('STILL', sc.render.filepath)
    else:
        sc.render.filepath = os.path.join(out_dir, name)
        bpy.ops.render.render(animation=True)
        print('FRAMES', out_dir, sc.frame_end)
