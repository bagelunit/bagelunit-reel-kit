#!/usr/bin/env python3
"""terrain.py: a latitude/longitude box -> a heightmap for the Blender terrain shot (shots/terrain.py). Plain Python 3, no Blender.

  python3 brand/library/3d/terrain.py fetch --bbox SOUTH,WEST,NORTH,EAST [--zoom 10] --out reels/<slug>/build/3d/terrain-data
  python3 brand/library/3d/terrain.py plan  --bbox SOUTH,WEST,NORTH,EAST [--zoom 10]     (no network: says which tiles it would need)
  python3 brand/library/3d/terrain.py synthetic --out DIR                                (no network: a made-up hill, to try the shot)

Network use is ONLY `fetch`, and only when you run it. It downloads free open elevation tiles (Terrarium PNG tiles from the AWS Open Data
"Terrain Tiles", no key) one at a time, with a polite generic User-Agent, retries, and a tile cache (default <out>/../tile-cache) so a tile is
never fetched twice. Caps: zoom 1..12 and at most 16 tiles (--max-tiles up to 36). Output in --out:
  height.f32      raw little-endian float32 metres, row-major, north row first (what shots/terrain.py reads)
  heightmap.png   16-bit grayscale preview (0 = lowest, 65535 = highest)
  meta.json       width, height, min/max metres, bbox, zoom, metres per pixel, tiles used, attribution
  ATTRIBUTION.txt the data credit to put in the caption (also printed)
Pure Python: it decodes the PNG tiles itself (zlib), so numpy is not needed.
"""
import argparse, json, math, os, struct, sys, time, zlib, array
import urllib.request, urllib.error

TILE_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
USER_AGENT = 'bagelunit-reel-kit-terrain/1.0 (open-data tile helper)'
MAX_ZOOM, MIN_ZOOM = 12, 1
DEFAULT_MAX_TILES, HARD_MAX_TILES = 16, 36
MAX_OUT = 1024                                                 # longest side of the heightmap in samples

# Wording checked 2026-11-17 against https://github.com/tilezen/joerd/blob/master/docs/attribution.md ("Required attribution").
ATTRIBUTION_FULL = """Terrain data (AWS Open Data Terrain Tiles, built with Tilezen Joerd):
* ArcticDEM terrain data DEM(s) were created from DigitalGlobe, Inc., imagery and funded under National Science Foundation awards 1043681, 1559691, and 1542736;
* Australia terrain data © Commonwealth of Australia (Geoscience Australia) 2017;
* Austria terrain data © offene Daten Österreichs – Digitales Geländemodell (DGM) Österreich;
* Canada terrain data contains information licensed under the Open Government Licence – Canada;
* Europe terrain data produced using Copernicus data and information funded by the European Union - EU-DEM layers;
* Global ETOPO1 terrain data U.S. National Oceanic and Atmospheric Administration;
* Mexico terrain data source: INEGI, Continental relief, 2016;
* New Zealand terrain data Copyright 2011 Crown copyright (c) Land Information New Zealand and the New Zealand Government (All rights reserved);
* Norway terrain data © Kartverket;
* United Kingdom terrain data © Environment Agency copyright and/or database right 2015. All rights reserved;
* United States 3DEP (formerly NED) and global GMTED2010 and SRTM terrain data courtesy of the U.S. Geological Survey."""
ATTRIBUTION_SHORT = ('Terrain data: AWS Open Data Terrain Tiles (Tilezen Joerd), including USGS 3DEP, SRTM, GMTED2010 and Copernicus EU-DEM. '
                     'Full credits in ATTRIBUTION.txt.')


class TerrainError(Exception):
    pass


# ---- tile maths ----------------------------------------------------------------------------------------------------------------------
def lonlat_to_tile_f(lon, lat, z):
    """Fractional slippy-map tile coordinates (x, y) of a longitude/latitude at zoom z (y grows southward)."""
    lat = max(-85.05112878, min(85.05112878, lat))
    n = 2 ** z
    x = (lon + 180.0) / 360.0 * n
    y = (1.0 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2.0 * n
    return x, y


def parse_bbox(text):
    """'south,west,north,east' -> a validated tuple of floats."""
    try:
        s, w, n, e = [float(p) for p in str(text).replace(' ', '').split(',')]
    except ValueError:
        raise TerrainError('bbox must be four numbers: south,west,north,east (for example 46.5,7.5,46.7,7.9)')
    if not (-85 <= s < n <= 85):
        raise TerrainError('bbox: need -85 <= south < north <= 85 (got south=%s north=%s)' % (s, n))
    if not (-180 <= w < e <= 180):
        raise TerrainError('bbox: need -180 <= west < east <= 180 (got west=%s east=%s); a box across the date line is not supported' % (w, e))
    return s, w, n, e


def bbox_tiles(bbox, z):
    """Tile column and row ranges covering the box: (x0, x1, y0, y1) inclusive."""
    s, w, n, e = bbox
    x0f, y0f = lonlat_to_tile_f(w, n, z)
    x1f, y1f = lonlat_to_tile_f(e, s, z)
    last = 2 ** z - 1
    x0, x1 = int(math.floor(x0f)), int(math.ceil(x1f) - 1)
    y0, y1 = int(math.floor(y0f)), int(math.ceil(y1f) - 1)
    return max(0, x0), min(last, max(x0, x1)), max(0, y0), min(last, max(y0, y1))


def plan(bbox, z, max_tiles=DEFAULT_MAX_TILES):
    """Check the caps and return the list of (z, x, y) tiles. Raises TerrainError with what to change."""
    if not (MIN_ZOOM <= z <= MAX_ZOOM):
        raise TerrainError('zoom %s is outside the allowed %d to %d' % (z, MIN_ZOOM, MAX_ZOOM))
    if not (1 <= max_tiles <= HARD_MAX_TILES):
        raise TerrainError('--max-tiles must be 1 to %d' % HARD_MAX_TILES)
    x0, x1, y0, y1 = bbox_tiles(bbox, z)
    count = (x1 - x0 + 1) * (y1 - y0 + 1)
    if count > max_tiles:
        raise TerrainError('this box at zoom %d needs %d tiles, more than the cap of %d. Lower --zoom by 1 (each step needs about a quarter '
                           'as many tiles), shrink the box, or raise --max-tiles (hard limit %d).' % (z, count, max_tiles, HARD_MAX_TILES))
    return [(z, x, y) for y in range(y0, y1 + 1) for x in range(x0, x1 + 1)]


# ---- decoding ------------------------------------------------------------------------------------------------------------------------
def terrarium_height(r, g, b):
    """Metres from a Terrarium pixel: (R*256 + G + B/256) - 32768."""
    return (r * 256 + g + b / 256.0) - 32768.0


def _unfilter(raw, w, h, bpp):
    stride = w * bpp
    out = bytearray(stride * h)
    pos = 0
    for row in range(h):
        ft = raw[pos]; pos += 1
        cur = bytearray(raw[pos:pos + stride]); pos += stride
        prev = out[(row - 1) * stride:row * stride] if row else bytearray(stride)
        if ft == 0:
            pass
        elif ft == 1:
            for i in range(bpp, stride):
                cur[i] = (cur[i] + cur[i - bpp]) & 255
        elif ft == 2:
            for i in range(stride):
                cur[i] = (cur[i] + prev[i]) & 255
        elif ft == 3:
            for i in range(stride):
                left = cur[i - bpp] if i >= bpp else 0
                cur[i] = (cur[i] + ((left + prev[i]) >> 1)) & 255
        elif ft == 4:
            for i in range(stride):
                a = cur[i - bpp] if i >= bpp else 0
                b = prev[i]
                c = prev[i - bpp] if i >= bpp else 0
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                cur[i] = (cur[i] + pr) & 255
        else:
            raise TerrainError('PNG tile has an unknown filter type %d' % ft)
        out[row * stride:(row + 1) * stride] = cur
    return out


def decode_png_rgb(data):
    """A non-interlaced 8-bit PNG (RGB, RGBA or palette-free grey) -> (width, height, channels, bytes). Enough for Terrarium tiles."""
    if data[:8] != b'\x89PNG\r\n\x1a\n':
        raise TerrainError('a tile is not a PNG (the server may have sent an error page)')
    pos, idat, hdr = 8, b'', None
    while pos < len(data):
        ln, typ = struct.unpack('>I4s', data[pos:pos + 8])
        body = data[pos + 8:pos + 8 + ln]
        pos += 12 + ln
        if typ == b'IHDR':
            hdr = struct.unpack('>IIBBBBB', body)
        elif typ == b'IDAT':
            idat += body
        elif typ == b'IEND':
            break
    if not hdr:
        raise TerrainError('PNG tile has no header')
    w, h, depth, ctype, _, _, interlace = hdr
    if depth != 8 or ctype not in (0, 2, 6) or interlace:
        raise TerrainError('PNG tile format not supported (need 8-bit RGB/RGBA, not interlaced)')
    ch = {0: 1, 2: 3, 6: 4}[ctype]
    return w, h, ch, _unfilter(zlib.decompress(idat), w, h, ch)


def decode_tile(data):
    """PNG bytes of a Terrarium tile -> (size, array('f') of metres, row-major)."""
    w, h, ch, px = decode_png_rgb(data)
    if ch < 3:
        raise TerrainError('a Terrarium tile needs RGB colour')
    out = array.array('f', bytes(4 * w * h))
    for i in range(w * h):
        o = i * ch
        out[i] = (px[o] * 256 + px[o + 1] + px[o + 2] / 256.0) - 32768.0
    return w, out


def encode_png_gray16(width, height, values):
    """16-bit grayscale PNG bytes from a flat list of ints 0..65535 (row-major)."""
    raw = bytearray()
    for y in range(height):
        raw.append(0)
        row = values[y * width:(y + 1) * width]
        raw += struct.pack('>%dH' % width, *row)
    def chunk(t, b):
        c = struct.pack('>I', len(b)) + t + b
        return c + struct.pack('>I', zlib.crc32(t + b) & 0xffffffff)
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 16, 0, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(bytes(raw), 6)) + chunk(b'IEND', b''))


def encode_png_rgb(width, height, rgb_bytes):
    """8-bit RGB PNG bytes (used by the tests to build synthetic Terrarium tiles)."""
    raw = bytearray()
    for y in range(height):
        raw.append(0)
        raw += rgb_bytes[y * width * 3:(y + 1) * width * 3]
    def chunk(t, b):
        c = struct.pack('>I', len(b)) + t + b
        return c + struct.pack('>I', zlib.crc32(t + b) & 0xffffffff)
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(bytes(raw), 6)) + chunk(b'IEND', b''))


def height_to_terrarium(m):
    """Inverse of terrarium_height, for synthetic tiles: metres -> (r, g, b)."""
    v = int(round((m + 32768.0) * 256))
    v = max(0, min(256 * 256 * 256 - 1, v))
    return v >> 16, (v >> 8) & 255, v & 255


# ---- fetching ------------------------------------------------------------------------------------------------------------------------
def default_fetch(url, timeout=30):
    req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def get_tile(z, x, y, cache_dir, fetch=default_fetch, retries=3, pause=0.4, sleep=time.sleep, log=print):
    """One tile's PNG bytes: from the cache if there, else fetched (with retries) and cached."""
    path = os.path.join(cache_dir, str(z), str(x), '%d.png' % y)
    if os.path.exists(path):
        with open(path, 'rb') as f:
            data = f.read()
        if data[:8] == b'\x89PNG\r\n\x1a\n':
            return data
    url = TILE_URL.format(z=z, x=x, y=y)
    last = None
    for attempt in range(1, retries + 1):
        try:
            data = fetch(url)
            if data[:8] != b'\x89PNG\r\n\x1a\n':
                raise TerrainError('not a PNG')
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, 'wb') as f:
                f.write(data)
            sleep(pause)                                       # be polite: one tile at a time with a short pause
            return data
        except urllib.error.HTTPError as e:
            last = 'HTTP %s' % e.code
            if e.code in (400, 401, 403, 404):
                break                                          # retrying will not help
        except (urllib.error.URLError, OSError, TerrainError) as e:
            last = str(getattr(e, 'reason', e))
        log('tile %d/%d/%d: attempt %d of %d failed (%s)' % (z, x, y, attempt, retries, last))
        sleep(1.5 * attempt)
    raise TerrainError('could not get tile %d/%d/%d (%s). Check the connection, or try again later. Tiles already fetched stay in the cache.' % (z, x, y, last))


# ---- stitching -----------------------------------------------------------------------------------------------------------------------
def stitch(tiles_by_xy, x0, x1, y0, y1, size=256):
    """Tile heights {(x, y): array} -> one big grid (width, height, array('f')) for the whole tile block."""
    W, H = (x1 - x0 + 1) * size, (y1 - y0 + 1) * size
    big = array.array('f', bytes(4 * W * H))
    for (tx, ty), arr in tiles_by_xy.items():
        ox, oy = (tx - x0) * size, (ty - y0) * size
        for r in range(size):
            big[(oy + r) * W + ox:(oy + r) * W + ox + size] = arr[r * size:(r + 1) * size]
    return W, H, big


def crop_resample(W, H, big, bbox, z, x0, y0, max_out=MAX_OUT):
    """Cut the stitched block to the bbox and resample (bilinear) to at most max_out samples on the long side. Returns (w, h, array)."""
    s, w, n, e = bbox
    fx0, fy0 = lonlat_to_tile_f(w, n, z)
    fx1, fy1 = lonlat_to_tile_f(e, s, z)
    px0, py0 = (fx0 - x0) * 256, (fy0 - y0) * 256
    px1, py1 = (fx1 - x0) * 256, (fy1 - y0) * 256
    cw, ch = max(2.0, px1 - px0), max(2.0, py1 - py0)
    k = min(1.0, max_out / max(cw, ch))
    ow, oh = max(2, int(round(cw * k))), max(2, int(round(ch * k)))
    out = array.array('f', bytes(4 * ow * oh))
    for j in range(oh):
        sy = min(H - 1.001, max(0.0, py0 + (j + 0.5) * ch / oh - 0.5))
        iy = int(sy); fy = sy - iy
        for i in range(ow):
            sx = min(W - 1.001, max(0.0, px0 + (i + 0.5) * cw / ow - 0.5))
            ix = int(sx); fx = sx - ix
            a = big[iy * W + ix]; b = big[iy * W + ix + 1]; c = big[(iy + 1) * W + ix]; d = big[(iy + 1) * W + ix + 1]
            out[j * ow + i] = (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy
    return ow, oh, out, cw / ow


def metres_per_sample(bbox, width):
    """Ground metres covered by one output sample along east-west, at the box's middle latitude."""
    s, w, n, e = bbox
    return (e - w) / max(1, width) * 111320.0 * math.cos(math.radians((s + n) / 2))


# ---- writing -------------------------------------------------------------------------------------------------------------------------
def write_dataset(out_dir, width, height, heights, bbox, z, tiles, source='terrarium'):
    os.makedirs(out_dir, exist_ok=True)
    lo, hi = min(heights), max(heights)
    with open(os.path.join(out_dir, 'height.f32'), 'wb') as f:
        a = array.array('f', heights)
        if sys.byteorder == 'big':
            a.byteswap()
        a.tofile(f)
    span = (hi - lo) or 1.0
    with open(os.path.join(out_dir, 'heightmap.png'), 'wb') as f:
        f.write(encode_png_gray16(width, height, [int((v - lo) / span * 65535) for v in heights]))
    mps = metres_per_sample(bbox, width)
    synth = source == 'synthetic'
    short = 'Made-up terrain: no data credit needed.' if synth else ATTRIBUTION_SHORT
    meta = {'width': width, 'height': height, 'min_m': lo, 'max_m': hi, 'bbox': list(bbox), 'zoom': z, 'tiles': len(tiles),
            'metres_per_sample_x': mps, 'metres_per_sample_y': mps, 'source': source, 'attribution_short': short}
    with open(os.path.join(out_dir, 'meta.json'), 'w') as f:
        json.dump(meta, f, indent=2)
    with open(os.path.join(out_dir, 'ATTRIBUTION.txt'), 'w', encoding='utf-8') as f:
        f.write(short + '\n' if synth else ATTRIBUTION_FULL + '\n\nFor a caption: ' + short + '\n')
    return meta


def build(bbox, z, out_dir, cache_dir=None, max_tiles=DEFAULT_MAX_TILES, fetch=default_fetch, max_out=MAX_OUT, sleep=time.sleep, log=print):
    tiles = plan(bbox, z, max_tiles)
    cache_dir = cache_dir or os.path.join(os.path.dirname(os.path.abspath(out_dir)), 'tile-cache')
    xs, ys = sorted({t[1] for t in tiles}), sorted({t[2] for t in tiles})
    got = {}
    for n, (zz, x, y) in enumerate(tiles, 1):
        log('tile %d of %d (%d/%d/%d)' % (n, len(tiles), zz, x, y))
        size, arr = decode_tile(get_tile(zz, x, y, cache_dir, fetch=fetch, sleep=sleep, log=log))
        if size != 256:
            raise TerrainError('unexpected tile size %d' % size)
        got[(x, y)] = arr
    W, H, big = stitch(got, xs[0], xs[-1], ys[0], ys[-1])
    ow, oh, heights, _ = crop_resample(W, H, big, bbox, z, xs[0], ys[0], max_out)
    meta = write_dataset(out_dir, ow, oh, heights, bbox, z, tiles)
    return meta


def synthetic(out_dir, width=160, height=160):
    """A made-up landscape (two hills and a ridge), no network: to try the shot or test the pipeline."""
    h = array.array('f', bytes(4 * width * height))
    for j in range(height):
        for i in range(width):
            x, y = i / (width - 1), j / (height - 1)
            h[j * width + i] = (900 * math.exp(-(((x - .35) ** 2 + (y - .45) ** 2) / .03)) + 600 * math.exp(-(((x - .72) ** 2 + (y - .6) ** 2) / .02))
                                + 120 * math.sin(x * 14) * math.cos(y * 11) + 200 * x)
    return write_dataset(out_dir, width, height, h, (46.5, 7.5, 46.7, 7.9), 0, [], source='synthetic')


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    sub = ap.add_subparsers(dest='cmd', required=True)
    for name in ('fetch', 'plan'):
        p = sub.add_parser(name)
        p.add_argument('--bbox', required=True, help='south,west,north,east in degrees')
        p.add_argument('--zoom', type=int, default=10)
        p.add_argument('--max-tiles', type=int, default=DEFAULT_MAX_TILES)
        if name == 'fetch':
            p.add_argument('--out', required=True)
            p.add_argument('--cache', default=None)
            p.add_argument('--max-size', type=int, default=MAX_OUT)
    ps = sub.add_parser('synthetic')
    ps.add_argument('--out', required=True)
    a = ap.parse_args(argv)
    try:
        if a.cmd == 'synthetic':
            meta = synthetic(a.out)
        elif a.cmd == 'plan':
            t = plan(parse_bbox(a.bbox), a.zoom, a.max_tiles)
            print('%d tile(s) at zoom %d: %s' % (len(t), a.zoom, ' '.join('%d/%d/%d' % x for x in t)))
            return 0
        else:
            meta = build(parse_bbox(a.bbox), a.zoom, a.out, a.cache, a.max_tiles, max_out=min(a.max_size, MAX_OUT))
    except TerrainError as e:
        print('terrain: ' + str(e), file=sys.stderr)
        return 1
    print('heightmap %dx%d, %.0f to %.0f m, written to %s' % (meta['width'], meta['height'], meta['min_m'], meta['max_m'], a.out.replace('\\', '/')))
    print('Put this in the caption:\n' + meta['attribution_short'] + '\n(full wording: ATTRIBUTION.txt next to the data)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
