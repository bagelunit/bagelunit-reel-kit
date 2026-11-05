/* Susanoo Reel Kit print · compositor (WebGL)
   Prints the two 2D layers into the output canvas like a riso print on warm stock:
     T (tone) → an engraved line screen: grey / black = key-ink lines at 45°, pure #FF0000 = accent-ink lines at -45° (a touch
                mis-registered, like a second drum), pure #00FF00 = second-ink lines at 0°. Overlapping inks crosshatch; white = paper.
                One line per 6 px cell, its thickness carries the tone.
     K (ink)  → laid on top exactly as drawn (type, outlines, the presenter).
   The paper is the theme colour with an accent-tinted glow in two corners and a fixed fibre mottle, plus grain re-seeded 24 times a
   second. Between scenes a blind wipe runs: diagonal slats close over the old scene and open on the new one. */
const PRINT_SHADER = `
precision highp float;
uniform sampler2D toneLayer, inkLayer;
uniform vec2 frameSize;
uniform float clock, wipeT, wipeMode, cellPx, keyAngle, accentAngle, secondAngle, squareness, grainAmount, glowAmount;
uniform vec2 accentShift;
uniform vec3 wipeInk, paperInk, glowInk, accentInk, secondInk, keyInk;
// how much of one ink a tone pixel asks for: key = 1 - max(rgb), accent = r - max(g, b), second ink = g - max(r, b)
float inkAmount(vec4 px, float inkId) {
  return inkId < 0.5 ? 1.0 - max(px.r, max(px.g, px.b)) : inkId < 1.5 ? px.r - max(px.g, px.b) : px.g - max(px.r, px.b);
}
// the engraved line screen: parallel lines at angle ang, one per cell, a hairline where the tone is light and solid where it is
// dark, with a slight wobble along each line like a burin cut
float engrave(vec2 p, float ang, float cell, float inkId) {
  float c = cos(ang), s = sin(ang);
  vec2 q = vec2(c*p.x + s*p.y, -s*p.x + c*p.y) / cell;
  float coverage = 0.0;
  for (int j = -1; j <= 1; j++) {
    float lineY = floor(q.y) + float(j) + 0.5;
    vec2 onLine = vec2(q.x, lineY) * cell;
    vec2 back = vec2(c*onLine.x - s*onLine.y, s*onLine.x + c*onLine.y);
    float tone = clamp(inkAmount(texture2D(toneLayer, back / frameSize), inkId), 0.0, 1.0);
    tone = smoothstep(0.04, 0.96, tone);
    float wobble = sin(q.x * 0.9 + lineY * 1.7) * 0.05 * tone;
    float halfWidth = tone * 0.56 + wobble;
    float off = abs(q.y - lineY);
    coverage = max(coverage, clamp((halfWidth - off) * cell + 0.5, 0.0, 1.0) * step(0.02, tone));
  }
  return coverage;
}
// the order the wipe's slats run in: 0 diagonal, 1 from the centre, 2 bottom-up, 3 left to right
float wipeOrder(vec2 uv) {
  if (wipeMode < 0.5) return (uv.x * 0.55 + uv.y * 0.9) / 1.45;
  if (wipeMode < 1.5) return length((uv - 0.5) * vec2(0.5625, 1.0)) * 1.75;
  if (wipeMode < 2.5) return 1.0 - uv.y;
  return uv.x;
}
float grainAt(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float mottle(vec2 p) {
  vec2 cell = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(grainAt(cell), grainAt(cell + vec2(1.0, 0.0)), f.x), mix(grainAt(cell + vec2(0.0, 1.0)), grainAt(cell + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  vec2 p = vec2(gl_FragCoord.x, frameSize.y - gl_FragCoord.y);
  vec2 uv = p / frameSize;
  // the stock: a glow top-right and bottom-left, and a fixed fibre mottle
  vec2 toCornerA = (uv - vec2(0.9, 0.04)) * vec2(1.0, 1.7778), toCornerB = (uv - vec2(0.06, 0.96)) * vec2(1.0, 1.7778);
  float glow = max(1.0 - smoothstep(0.0, 0.62, length(toCornerA)), 0.8 * (1.0 - smoothstep(0.0, 0.52, length(toCornerB)))) * glowAmount;
  vec3 colour = mix(paperInk, glowInk, glow);
  float fibre = mottle(p / 140.0) * 0.6 + mottle(p / 38.0) * 0.4;
  colour *= 1.0 - (fibre - 0.5) * 0.035;
  colour = mix(colour, accentInk, engrave(p + accentShift, accentAngle, cellPx, 1.0));
  colour = mix(colour, secondInk, engrave(p, secondAngle, cellPx, 2.0));
  colour = mix(colour, keyInk, engrave(p, keyAngle, cellPx, 0.0));
  vec4 ink = texture2D(inkLayer, uv);
  colour = mix(colour, ink.rgb, ink.a);
  if (wipeT > 0.0 && wipeT < 2.0) {
    // the blind wipe: diagonal slats, each closing from its upper edge, staggered by wipeOrder; then opening on the new scene
    float slat = frameSize.y / 7.0;
    float along = (p.x * 0.5 + p.y) / slat;
    float slatIndex = floor(along), inSlat = fract(along);
    vec2 slatUv = vec2(uv.x, clamp((slatIndex + 0.5) * slat / frameSize.y, 0.0, 1.0));
    float order = clamp(wipeOrder(mix(uv, slatUv, 0.65)), 0.0, 1.0);
    float shut = wipeT <= 1.0 ? clamp(wipeT * 2.0 - order * 0.68, 0.0, 1.0) : 1.0 - clamp((wipeT - 1.0) * 2.0 - order * 0.68, 0.0, 1.0);
    float soft = 1.5 / slat;
    float covered = wipeT <= 1.0 ? 1.0 - smoothstep(shut - soft, shut + soft, inSlat) : smoothstep(1.0 - shut - soft, 1.0 - shut + soft, inSlat);
    colour = mix(colour, wipeInk, covered);
  }
  colour += (grainAt(p + fract(clock * 7.13) * 100.0) - 0.5) * grainAmount;
  gl_FragColor = vec4(colour, 1.0);
}`;
// '#rrggbb' → [r, g, b] in 0..1
const unitRgb = hex => {
  const n = parseInt(hex.slice(1), 16);
  return [16, 8, 0].map(shift => (n >> shift & 255) / 255);
};
function makeHalftone(out, toneC, inkC) {
  const gl = out.getContext('webgl', { preserveDrawingBuffer: true, antialias: false, premultipliedAlpha: false });
  if (!gl) throw new Error('WebGL is not available in this browser');
  const shaderFrom = (kind, source) => {
    const shader = gl.createShader(kind);
    runOps(gl, [['shaderSource', shader, source], ['compileShader', shader]]);
    if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
    throw new Error(gl.getShaderInfoLog(shader));
  };
  const program = gl.createProgram();
  const quad = gl.createBuffer();
  runOps(gl, [
    ['attachShader', program, shaderFrom(gl.VERTEX_SHADER, 'attribute vec2 corner; void main(){ gl_Position = vec4(corner,0.,1.); }')],
    ['attachShader', program, shaderFrom(gl.FRAGMENT_SHADER, PRINT_SHADER)],
    ['linkProgram', program], ['useProgram', program],
    ['bindBuffer', gl.ARRAY_BUFFER, quad],                                   // one full-frame quad
    ['bufferData', gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW],
  ]);
  const corner = gl.getAttribLocation(program, 'corner');
  runOps(gl, [['enableVertexAttribArray', corner], ['vertexAttribPointer', corner, 2, gl.FLOAT, false, 0, 0]]);
  const where = new Map();
  const at = name => {
    if (!where.has(name)) where.set(name, gl.getUniformLocation(program, name));
    return where.get(name);
  };
  // the two layers arrive as textures on units 0 and 1, sampled smoothly and clamped at the edges
  const layers = [toneC, inkC].map((source, unit) => {
    const texture = gl.createTexture();
    const param = (key, value) => ['texParameteri', gl.TEXTURE_2D, key, value];
    runOps(gl, [['activeTexture', gl.TEXTURE0 + unit], ['bindTexture', gl.TEXTURE_2D, texture],
      param(gl.TEXTURE_MIN_FILTER, gl.LINEAR), param(gl.TEXTURE_MAG_FILTER, gl.LINEAR), param(gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE), param(gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)]);
    return [texture, source];
  });
  runOps(gl, [['uniform1i', at('toneLayer'), 0], ['uniform1i', at('inkLayer'), 1], ['uniform2f', at('frameSize'), out.width, out.height],
    ['viewport', 0, 0, out.width, out.height]]);
  const setters = { 1: 'uniform1f', 2: 'uniform2f', 3: 'uniform3f' };
  // o: { t, paper, accent, ink2, ink, wipe: {p, mode, col}, cell, angK, angR, ang2, sq, grain, bloom, mis: [dx, dy] }
  return function draw(o) {
    runOps(gl, layers.flatMap(([texture, source], unit) => [['activeTexture', gl.TEXTURE0 + unit], ['bindTexture', gl.TEXTURE_2D, texture],
      ['texImage2D', gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source]]));
    const paper = unitRgb(o.paper), accent = unitRgb(o.accent);
    const values = {
      paperInk: paper, accentInk: accent, glowInk: paper.map((v, i) => v + (accent[i] - v) * 0.08), glowAmount: o.bloom ?? 1,
      accentShift: o.mis || [1.6, -1.2], secondInk: unitRgb(o.ink2), keyInk: unitRgb(o.ink || '#111111'),
      wipeT: o.wipe ? o.wipe.p : 0, wipeMode: o.wipe ? o.wipe.mode : 0, wipeInk: unitRgb(o.wipe ? o.wipe.col : '#111111'),
      clock: Math.floor(o.t * 24) / 24, cellPx: o.cell ?? 6, keyAngle: o.angK ?? 0.785, accentAngle: o.angR ?? -0.785,
      secondAngle: o.ang2 ?? 0.0, squareness: o.sq ?? 0.45, grainAmount: o.grain ?? 0.03,
    };
    for (const name in values) {
      const v = [].concat(values[name]);
      gl[setters[v.length]](at(name), ...v);
    }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);   // the quad, as two triangles
  };
}
