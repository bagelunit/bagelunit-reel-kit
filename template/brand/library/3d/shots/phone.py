# A phone showing a screen image (a screen capture, a mock-up), tilting slowly with a push-in and a soft contact shadow.
#   blender -b -P shots/phone.py -- --out out/phone --screen capture.png [--color 15110E] [--move tilt|orbit|push] [--size 1080] [--frames 90] [--still 30]
# The screen is emissive, so the picture shows at its own colours and brightness. With no --screen a flat brand-coloured screen is used.
# Phone proportions are 9:19.5. A real product screen is first-party evidence: still clear each claim in brand/facts.md.
import sys, os, math
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'lib'))
import bb

SIZE, N = bb.opt('--size', 1080, int), bb.opt('--frames', 90, int)
MOVE = bb.opt('--move', 'tilt')
col = bb.brand_colors()
OUT = bb.opt('--out', 'out/phone')
SCREEN = bb.opt('--screen', None)
sc = bb.setup(SIZE, SIZE, N, transparent=not bb.opt('--opaque', 0, int))
W, Hh, T = 3.0, 6.5, 0.36                                           # width, height, thickness (9:19.5)
if not SCREEN:
    os.makedirs(OUT, exist_ok=True)
    SCREEN = bb.solid_image(os.path.join(OUT, '_screen.png'), 540, 1170, col['paper'])
frame_m = bb.mat('frame', bb.opt('--color', col['ink']), rough=0.28, metal=0.6, coat=0.2)
body = bb.rounded_box('body', W, T, Hh, 0.38, frame_m, loc=(0, 0, 0))
scr = bb.plane('screen', W - 0.2, Hh - 0.22, bb.mat_image('screen', SCREEN, rough=0.15, emit=1.0), loc=(0, -T / 2 - 0.004, 0), rot=(math.radians(90), 0, 0))
scr.scale = (W - 0.2, Hh - 0.22, 1)
import bpy
dot = bb.cylinder('island', 0.11, 0.05, bb.mat('island', '050505', rough=0.3), loc=(0, -T / 2 - 0.01, Hh / 2 - 0.34), bevel=0.01, verts=24)
dot.rotation_euler = (math.radians(90), 0, 0)
root = bb.target_empty((0, 0, 0), 'root'); body.parent = root; scr.parent = root; dot.parent = root
root.location = (0, 0, Hh / 2 + 0.03)                             # stands on the ground, so the shadow touches it
bb.blob_shadow((0, 0, 0.01), 4.6, 2.6, 0.45)
bb.studio_lights(center=(0, 0, Hh / 2), key=700, fill=300, rim=450)
cam, tgt = bb.camera((0, -17, 3.9), (0, 0, Hh / 2), lens=60)
if MOVE == 'orbit':
    bb.orbit(cam, (0, 0, 0), 17, 3.9, -104, -76, N)
elif MOVE == 'push':
    bb.push_in(cam, (0, -20, 3.9), (0, -12.5, 3.9), N)
else:
    for f in range(1, N + 1):
        t = (f - 1) / max(1, N - 1); e = bb.smooth(t)
        root.rotation_euler = (math.radians(4 - 4 * e), 0, math.radians(-22 + 22 * e))
        root.keyframe_insert('rotation_euler', frame=f)
    bb.push_in(cam, (0, -18.5, 3.9), (0, -14.5, 3.9), N)
bb.render(OUT, bb.opt('--still', None, int))
