// Hero: the name is an obstacle. A 32-antenna base station (right edge) cannot
// reach you directly behind it, so it aims at a 32-tile reconfigurable surface
// (RIS, top) which re-phases its tiles to bend the signal around the name and
// focus it on your pointer. Every pixel sums both arrays' waves on the GPU and
// is shadowed by the actual letters of the name.
const glc = document.getElementById('field');
const ov = document.getElementById('overlay');
const octx = ov.getContext('2d');
const hero = glc.parentElement;
const nameEl = document.getElementById('name');
const textEl = document.querySelector('.hero-sub');
const roLos = document.getElementById('ro-los');
const roRoute = document.getElementById('ro-route');
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

const N = 32;                      // base-station antennas, and RIS tiles
const LAMBDA = 30;                 // wavelength in CSS px
const K = (2 * Math.PI) / LAMBDA;
const DISPLAY = '"IBM Plex Sans Condensed", "Arial Narrow", sans-serif';

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;
const FRAG = `
precision highp float;
uniform vec2 uRes, uT, uBc, uRc, uBF;
uniform vec2 uB[${N}], uR[${N}];
uniform float uK, uNB, uNR, uTime, uSoft, uRis;
uniform vec4 uDim;
uniform sampler2D uMask;
vec3 ramp(float v){
  vec3 c0=vec3(.039,.059,.110), c1=vec3(.075,.14,.38), c2=vec3(.184,.357,1.), c3=vec3(.247,.816,.878), c4=vec3(1.,.906,.639);
  if (v < .3) return mix(c0, c1, v / .3);
  if (v < .55) return mix(c1, c2, (v - .3) / .25);
  if (v < .8) return mix(c2, c3, (v - .55) / .25);
  return mix(c3, c4, (v - .8) / .2);
}
float hash(vec2 q){ return fract(sin(dot(q, vec2(12.9898, 78.233))) * 43758.5453); }
// how much of the straight path from p to the source s is free of letters
float vis(vec2 p, vec2 s){
  float v = 1.;
  for (int i = 0; i < 40; i++) {
    vec2 q = mix(p, s, (float(i) + .5) / 40.) / uRes;
    v *= 1. - texture2D(uMask, q).a;
  }
  return v;
}
float look(float re, float im, float c, float s){
  float m = length(vec2(re, im)), inst = re * c + im * s;
  return m * m * .62 + max(inst, 0.) * m * .7 + inst * inst * .06;
}
void main(){
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  float bre = 0., bim = 0., rre = 0., rim = 0.;
  for (int i = 0; i < ${N}; i++) {          // base station, focused on you or on the RIS
    float d = distance(p, uB[i]);
    float x = uK * (d - distance(uBF, uB[i]));
    float a = inversesqrt(d + uSoft);
    bre += cos(x) * a; bim += sin(x) * a;
  }
  for (int i = 0; i < ${N}; i++) {          // RIS tiles, focused on you
    float d = distance(p, uR[i]);
    float x = uK * (d - distance(uT, uR[i]));
    float a = inversesqrt(d + uSoft);
    rre += cos(x) * a; rim += sin(x) * a;
  }
  float gb = vis(p, uBc) * (1. - smoothstep(uBc.x - 24., uBc.x + 4., p.x)) / uNB;  // radiates left only
  float gr = uRis * vis(p, uRc) * smoothstep(uRc.y - 4., uRc.y + 24., p.y) / uNR;  // reflects downward only
  float c = cos(uTime), s = sin(uTime);
  float v = mix(1., .5, uRis) * look(bre * gb, bim * gb, c, s) + look(rre * gr, rim * gr, c, s);
  vec2 q = p / uRes;                       // calm the field behind the small text
  float inside = smoothstep(uDim.x - .04, uDim.x, q.x) * (1. - smoothstep(uDim.z, uDim.z + .04, q.x))
               * smoothstep(uDim.y - .04, uDim.y, q.y) * (1. - smoothstep(uDim.w, uDim.w + .04, q.y));
  v = clamp(v * mix(1., .3, inside), 0., 1.);
  vec3 col = ramp(v) + (hash(gl_FragCoord.xy + fract(uTime)) - .5) * (2. / 255.);
  gl_FragColor = vec4(col, 1.);
}`;

const gl = glc.getContext('webgl', { antialias: false, alpha: false });
let U = {}, tex;
if (gl) {
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  for (const n of ['uRes', 'uT', 'uBc', 'uRc', 'uBF', 'uRis', 'uB', 'uR', 'uK', 'uNB', 'uNR', 'uTime', 'uSoft', 'uDim', 'uMask'])
    U[n] = gl.getUniformLocation(prog, n);
  tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]])
    gl.texParameteri(gl.TEXTURE_2D, k, v);
  gl.uniform1i(U.uMask, 0);
} else {
  glc.hidden = true; // no WebGL: the plain ground colour shows instead
}

let W = 0, H = 0, s = 1, wide = true, maskData = null, dim = [0, 0, 0, 0], nameMid = 0;
const bx = new Float32Array(N), by = new Float32Array(N), rx = new Float32Array(N), ry = new Float32Array(N);
const bc = { x: 0, y: 0 }, rc = { x: 0, y: 0 }, tilePhase = new Float32Array(N), antPhase = new Float32Array(N);
const target = { x: 0, y: 0, user: false };
let los = true, ris = 0; // direct line of sight; RIS share eases between 0 and 1
const mask = document.createElement('canvas');

// Rasterise the name exactly where the page draws it: this is the obstacle.
function buildMask(hr) {
  mask.width = glc.width; mask.height = glc.height;
  const m = mask.getContext('2d', { willReadFrequently: true });
  m.clearRect(0, 0, mask.width, mask.height);
  const r = nameEl.getBoundingClientRect();
  const fs = parseFloat(getComputedStyle(nameEl).fontSize);
  m.font = `700 ${fs}px ${DISPLAY}`;
  const t = m.measureText(nameEl.textContent);
  const asc = t.fontBoundingBoxAscent ?? fs * 0.8, desc = t.fontBoundingBoxDescent ?? fs * 0.2;
  const left = r.left - hr.left, top = r.top - hr.top;
  const base = top + (r.height - (asc + desc)) / 2 + asc;
  m.setTransform(s * (r.width / t.width), 0, 0, s, s * left, s * base); // stretch to the real width (letter-spacing)
  m.fillStyle = '#000'; m.strokeStyle = '#000'; m.lineWidth = 3;
  m.fillText(nameEl.textContent, 0, 0); m.strokeText(nameEl.textContent, 0, 0);
  m.setTransform(1, 0, 0, 1, 0, 0);
  maskData = m.getImageData(0, 0, mask.width, mask.height).data;
  nameMid = top + r.height / 2;
  if (gl) {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, mask);
  }
  const d = textEl.getBoundingClientRect();
  dim = [(d.left - hr.left) / W, (d.top - hr.top) / H, (d.right - hr.left) / W, (d.bottom - hr.top) / H];
}

function blocked(ax, ay, tx, ty) {
  if (!maskData) return false;
  for (let i = 1; i < 80; i++) {
    const x = Math.round((ax + (tx - ax) * i / 80) * s), y = Math.round((ay + (ty - ay) * i / 80) * s);
    if (x < 0 || y < 0 || x >= mask.width || y >= mask.height) continue;
    if (maskData[(y * mask.width + x) * 4 + 3] > 128) return true;
  }
  return false;
}

function resize() {
  const hr = hero.getBoundingClientRect();
  W = hr.width; H = hr.height; wide = W >= 820;
  s = Math.min(Math.min(devicePixelRatio || 1, wide ? 1 : 1.5), 1600 / W); // ponytail: caps GPU work on big screens
  glc.width = Math.round(W * s); glc.height = Math.round(H * s);
  const d = Math.min(devicePixelRatio || 1, 2);
  ov.width = W * d; ov.height = H * d; octx.setTransform(d, 0, 0, d, 0, 0);

  const topH = document.querySelector('.top')?.getBoundingClientRect().height || 0;
  const nr = nameEl.getBoundingClientRect();
  nameMid = nr.top - hr.top + nr.height / 2;
  const gapB = Math.min(LAMBDA / 2, (H * (wide ? 0.4 : 0.2)) / (N - 1));
  const gapR = Math.min(LAMBDA / 2, (W * (wide ? 0.3 : 0.36)) / (N - 1));
  if (wide) {
    bc.x = W - 56; bc.y = H * 0.33; rc.x = W * 0.2; rc.y = Math.max(topH + 34, H * 0.12);
  } else {
    bc.x = W - 16;
    rc.x = W * 0.2;
    rc.y = Math.max(128, topH + 34);
    const minBcY = topH + 28 + ((N - 1) / 2) * gapB;
    bc.y = Math.max(nameMid, minBcY); // phones: keep Base station label clear of fixed header
  }
  for (let i = 0; i < N; i++) {
    const o = i - (N - 1) / 2;
    bx[i] = bc.x; by[i] = bc.y + o * gapB;
    rx[i] = rc.x + o * gapR; ry[i] = rc.y;
  }
  buildMask(hr);
  if (!target.user) idle(performance.now());
}

function idle(t) {
  target.x = wide ? W * (0.11 + 0.04 * Math.sin(t * 0.00023)) : 26 + 6 * Math.sin(t * 0.00023);
  target.y = nameMid + (wide ? H * 0.05 : 14) * Math.sin(t * 0.00031);
}

const norm = (px, py, xs, ys) => { let f = 0; for (let i = 0; i < N; i++) f += 1 / Math.sqrt(Math.hypot(px - xs[i], py - ys[i]) * s + 8 * s); return f; };
const elB = new Float32Array(N * 2), elR = new Float32Array(N * 2);

let frame = 0, lastT = 0;
function draw(t) {
  los = !blocked(bc.x, bc.y, target.x, target.y);
  const ease = still ? 1 : Math.min(1, Math.max(0, t - lastT) / 160); lastT = t; // ~0.2 s hand-over
  ris += ((los ? 0 : 1) - ris) * ease;
  const f = los ? target : rc;   // with a clear line of sight the base station serves you directly
  for (let i = 0; i < N; i++) {
    antPhase[i] = (-K * Math.hypot(f.x - bx[i], f.y - by[i])) % (2 * Math.PI);
    tilePhase[i] = (-K * Math.hypot(target.x - rx[i], target.y - ry[i])) % (2 * Math.PI);
  }
  if (gl) {
    gl.viewport(0, 0, glc.width, glc.height);
    gl.uniform2f(U.uRes, glc.width, glc.height);
    gl.uniform2f(U.uT, target.x * s, target.y * s);
    gl.uniform2f(U.uBc, bc.x * s, bc.y * s);
    gl.uniform2f(U.uRc, rc.x * s, rc.y * s);
    for (let i = 0; i < N; i++) {
      elB[2 * i] = bx[i] * s; elB[2 * i + 1] = by[i] * s;
      elR[2 * i] = rx[i] * s; elR[2 * i + 1] = ry[i] * s;
    }
    gl.uniform2fv(U.uB, elB); gl.uniform2fv(U.uR, elR);
    gl.uniform1f(U.uK, K / s);
    gl.uniform2f(U.uBF, f.x * s, f.y * s);
    gl.uniform1f(U.uRis, ris);
    gl.uniform1f(U.uNB, norm(f.x, f.y, bx, by));
    gl.uniform1f(U.uNR, norm(target.x, target.y, rx, ry));
    gl.uniform1f(U.uSoft, 8 * s);
    gl.uniform1f(U.uTime, t * 0.004);
    gl.uniform4f(U.uDim, ...dim);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  drawOverlay();
  if (frame++ % 6 === 0) readout();
}

function dial(cx, cy, r, ph) {
  octx.strokeStyle = 'rgba(232,236,244,.35)';
  octx.beginPath(); octx.arc(cx, cy, r, 0, Math.PI * 2); octx.stroke();
  octx.strokeStyle = '#3fd0e0';
  octx.beginPath(); octx.moveTo(cx, cy); octx.lineTo(cx + r * Math.cos(ph), cy + r * Math.sin(ph)); octx.stroke();
}

function drawOverlay() {
  octx.clearRect(0, 0, W, H);
  octx.lineWidth = 1.25;
  const gB = by[1] - by[0], gR = rx[1] - rx[0];
  for (let i = 0; i < N; i++) {
    octx.fillStyle = '#e8ecf4';
    octx.fillRect(bx[i] - 2, by[i] - 2, 4, 4);
    if (gB >= 8) dial(bx[i] + 12, by[i], Math.min(5, gB * 0.38), antPhase[i]);
    // RIS tile: brightness shows the phase it applies
    const a = 0.25 + 0.75 * (0.5 + 0.5 * Math.cos(tilePhase[i]));
    octx.fillStyle = `rgba(63,208,224,${a.toFixed(3)})`;
    const w = Math.max(3, gR * 0.78);
    octx.fillRect(rx[i] - w / 2, ry[i] - w - 2, w, w);
  }
  octx.fillStyle = 'rgba(232,236,244,.8)';
  octx.fillRect(rx[0] - gR / 2, ry[0] - 1, rx[N - 1] - rx[0] + gR, 2);

  octx.font = '12px "IBM Plex Sans", system-ui, sans-serif';
  octx.fillStyle = '#9aa6ba';
  octx.textAlign = 'left';
  octx.fillText(wide ? 'Reconfigurable surface (RIS)' : 'RIS', rx[N - 1] + gR + 4, ry[0] - 2);
  octx.textAlign = 'right';
  if (wide) octx.fillText('Base station', bx[0] + 16, by[0] - 16);
  else octx.fillText('Base station', bx[0] + 6, by[0] - 10);

  const { x, y } = target;
  octx.strokeStyle = '#e8ecf4';
  octx.beginPath(); octx.arc(x, y, 16, 0, Math.PI * 2); octx.stroke();
  octx.beginPath();
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { octx.moveTo(x + dx * 20, y + dy * 20); octx.lineTo(x + dx * 28, y + dy * 28); }
  octx.stroke();
  octx.textAlign = 'center'; octx.fillStyle = '#e8ecf4';
  octx.fillText('You', x, y - 34);
}

function readout() {
  roLos.textContent = los ? 'Clear' : 'Blocked by the name';
  roRoute.textContent = los ? 'Direct from the base station'
    : blocked(rc.x, rc.y, target.x, target.y) ? 'None here, try another spot' : 'Bent around by the surface';
}

let visible = true, running = false;
function loop(t) {
  if (!visible) { running = false; return; }
  if (!target.user) idle(t);
  draw(t);
  requestAnimationFrame(loop);
}
function start() { if (!running && !still) { running = true; requestAnimationFrame(loop); } }

let holding = false;
function aim(e) {
  const r = ov.getBoundingClientRect();
  target.x = Math.max(0, Math.min(W, e.clientX - r.left));
  target.y = Math.max(0, Math.min(H, e.clientY - r.top));
  target.user = true;
  if (still) draw(0);
}
function release(e) {
  if (!holding) return;
  holding = false;
  ov.classList.remove('dragging');
  try { ov.releasePointerCapture(e.pointerId); } catch {}
}
ov.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  holding = true;
  ov.classList.add('dragging');
  try { ov.setPointerCapture(e.pointerId); } catch {}
  aim(e);
});
ov.addEventListener('pointermove', (e) => {
  if (!holding) return;
  aim(e);
});
ov.addEventListener('pointerup', release);
ov.addEventListener('pointercancel', release);

// the obstacle must match the real glyphs, so wait for the display font
document.fonts.load(`700 100px ${DISPLAY}`).catch(() => {}).finally(() => {
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) start(); }).observe(hero);
  new ResizeObserver(() => { resize(); draw(performance.now()); }).observe(hero);
});
