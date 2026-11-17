# Product on a surface: a box or a can, optionally with a label image, turning slowly or orbited, with a soft contact shadow.
#   blender -b -P shots/product.py -- --out out/product [--shape box|can] [--label label.png] [--color E23B2E] [--move turn|orbit|float]
#                                     [--size 1080] [--frames 90] [--still 30] [--opaque 1]
# Camera options (all optional, see README): --dof 1 --fstop 2.0 | --rack-focus 1 | --motion-blur 1 | --handheld 1.0 --seed 7 | --move-preset push|pull|orbit
# Transparent background by default: overlay it on a Print scene (format=rgba first). Colours default to the brand's (brand/brand.json).
import sys, os, math
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'lib'))
import bb

SIZE, N = bb.opt('--size', 1080, int), bb.opt('--frames', 90, int)
SHAPE, MOVE = bb.opt('--shape', 'box'), bb.opt('--move', 'turn')
col = bb.brand_colors()
COLOR = bb.opt('--color', col['accent'])
LABEL = bb.opt('--label', None)
sc = bb.setup(SIZE, SIZE, N, transparent=not bb.opt('--opaque', 0, int))
body = bb.mat_image('label', LABEL, rough=0.45, emit=0.15) if LABEL else bb.mat('body', COLOR, rough=0.32, coat=0.35, emit=0.1)
trim = bb.mat('trim', col['ink'], rough=0.4)
if SHAPE == 'can':
    obj = bb.cylinder('can', 1.6, 4.4, body, loc=(0, 0, 2.2), bevel=0.12)
    lid = bb.cylinder('lid', 1.62, 0.18, bb.mat('lid', 'D8DADF', rough=0.25, metal=0.9), loc=(0, 0, 4.45), bevel=0.05)
    lid.parent = obj
    H = 4.5
else:
    obj = bb.rounded_box('box', 3.4, 2.4, 4.4, 0.35, body, loc=(0, 0, 2.2))
    H = 4.4
root = bb.target_empty((0, 0, 0), 'root'); obj.parent = root
bb.blob_shadow((0, 0, 0.01), 5.2, 3.2, 0.5)
bb.studio_lights(center=(0, 0, 2))
cam, tgt = bb.camera((0, -15, 5.2), (0, 0, H / 2), lens=60)
if MOVE == 'orbit':
    bb.orbit(cam, (0, 0, 0), 15, 5.2, -118, -62, N)
else:
    for f in range(1, N + 1):
        t = (f - 1) / max(1, N - 1)
        if MOVE == 'float':
            root.location = (0, 0, 0.35 * math.sin(t * 2 * math.pi)); root.rotation_euler = (0, 0, math.radians(-14 + 8 * math.sin(t * 2 * math.pi)))
        else:                                                      # turn: a smooth half turn that settles facing the camera
            root.rotation_euler = (0, 0, math.radians(-70 + 70 * bb.smooth(t)))
        root.keyframe_insert('location', frame=f); root.keyframe_insert('rotation_euler', frame=f)
bb.camera_flags(cam, tgt, subject=obj)                             # --dof --fstop --rack-focus --motion-blur --handheld --move-preset
bb.render(bb.opt('--out', 'out/product'), bb.opt('--still', None, int))
