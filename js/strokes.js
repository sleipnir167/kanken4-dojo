// 書き順データ（KanjiVG）の読み込みとパス→点列変換
let DATA = null;
let loading = null;

export function setStrokeData(d) { DATA = d; }

export function loadStrokes() {
  if (DATA) return Promise.resolve(DATA);
  if (!loading) {
    loading = fetch(new URL('../data/strokes.json', import.meta.url))
      .then((r) => r.json())
      .then((d) => (DATA = d));
  }
  return loading;
}
export const strokePaths = (ch) => DATA?.[ch] || null;
export const hasStrokes = (ch) => !!DATA?.[ch];
export const allStrokeChars = () => (DATA ? Object.keys(DATA) : []);

// SVG パス（KanjiVG は M/m/C/c/S/s/L/l のみ使用）を折れ線に変換
export function pathToPoints(d, seg = 8) {
  const tok = d.match(/[MmCcSsLlZz]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) || [];
  const pts = [];
  let i = 0, cmd = '', x = 0, y = 0, cx2 = 0, cy2 = 0, prevCubic = false;
  const num = () => Number(tok[i++]);
  const cubic = (x1, y1, x2, y2, ex, ey) => {
    for (let s = 1; s <= seg; s++) {
      const t = s / seg, u = 1 - t;
      pts.push([
        u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * ex,
        u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * ey,
      ]);
    }
    cx2 = x2; cy2 = y2; x = ex; y = ey; prevCubic = true;
  };
  while (i < tok.length) {
    if (/[A-Za-z]/.test(tok[i])) cmd = tok[i++];
    const rel = cmd === cmd.toLowerCase();
    const ox = rel ? x : 0, oy = rel ? y : 0;
    switch (cmd.toUpperCase()) {
      case 'M': x = ox + num(); y = oy + num(); pts.push([x, y]); prevCubic = false; cmd = rel ? 'l' : 'L'; break;
      case 'L': x = ox + num(); y = oy + num(); pts.push([x, y]); prevCubic = false; break;
      case 'C': { const a = [num(), num(), num(), num(), num(), num()];
        cubic(ox + a[0], oy + a[1], ox + a[2], oy + a[3], ox + a[4], oy + a[5]); break; }
      case 'S': { const a = [num(), num(), num(), num()];
        const x1 = prevCubic ? 2 * x - cx2 : x, y1 = prevCubic ? 2 * y - cy2 : y;
        cubic(x1, y1, ox + a[0], oy + a[1], ox + a[2], oy + a[3]); break; }
      case 'Z': i++; break;
      default: i++;
    }
  }
  return pts;
}

// 文字の参照ストローク（点列）。KanjiVG は 109x109 座標系
const refCache = new Map();
export function refStrokes(ch) {
  if (refCache.has(ch)) return refCache.get(ch);
  const paths = strokePaths(ch);
  const r = paths ? paths.map((p) => pathToPoints(p)) : null;
  refCache.set(ch, r);
  return r;
}
