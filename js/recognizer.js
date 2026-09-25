// 手書き文字の判定
//  1) オンライン: Google 手書き入力 API の候補に正解が含まれるか
//  2) オフライン: KanjiVG の書き順データとストローク単位で照合（端末内で完結）
import { refStrokes, allStrokeChars, hasStrokes } from './strokes.js';

const API = 'https://inputtools.google.com/request?ime=handwriting&app=mobilesearch&cs=1&oe=UTF-8';

// 形が似ていて認識エンジンが取り違えやすい文字（カタカナ・記号 ⇔ 漢字）
const LOOKALIKE = {
  '口': 'ロ□', '力': 'カ', '工': 'エ', '二': 'ニ', '八': 'ハ', '夕': 'タ', '一': 'ー―－', '卜': 'ト',
  '才': 'オ', '千': 'チ', '于': 'チ', '三': '≡', '土': '士', '士': '土', '人': '入', '入': '人',
  '乙': 'Z', '了': 'ア', '已': '己巳', '己': '已巳',
};
const same = (cand, expected) => cand === expected || (LOOKALIKE[expected] || '').includes(cand);

export const STRICTNESS = {
  easy:   { label: 'やさしい', topN: 10, rankMax: 5, maxScore: 0.16 },
  normal: { label: 'ふつう',   topN: 5,  rankMax: 3, maxScore: 0.13 },
  strict: { label: 'きびしい', topN: 2,  rankMax: 1, maxScore: 0.10 },
};

export async function googleRecognize(strokes, w, h, timeoutMs = 4000) {
  const ink = strokes.map((s) => [s.map((p) => Math.round(p[0])), s.map((p) => Math.round(p[1])), s.map((p) => Math.round(p[2] || 0))]);
  const body = {
    options: 'enable_pre_space',
    requests: [{ writing_guide: { writing_area_width: Math.round(w), writing_area_height: Math.round(h) }, ink, language: 'ja' }],
  };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(API, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: ctl.signal,
    });
    const data = await res.json();
    if (data[0] !== 'SUCCESS') throw new Error('recognition failed');
    return data[1][0][1] || [];
  } finally {
    clearTimeout(timer);
  }
}

// ---------- オフライン照合 ----------
const K = 12;          // 1画あたりの点数
const MISS = 0.42;     // 画が足りない／多いときのコスト
const REV = 0.06;      // 逆向きに書いたときの追加コスト

export function resample(pts, n = K) {
  if (pts.length === 0) return [];
  if (pts.length === 1) return Array.from({ length: n }, () => [pts[0][0], pts[0][1]]);
  const d = [0];
  for (let i = 1; i < pts.length; i++) d.push(d[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = d[d.length - 1] || 1e-9;
  const out = [];
  let j = 1;
  for (let k = 0; k < n; k++) {
    const t = (total * k) / (n - 1);
    while (j < d.length - 1 && d[j] < t) j++;
    const seg = d[j] - d[j - 1] || 1e-9;
    const r = Math.min(1, Math.max(0, (t - d[j - 1]) / seg));
    out.push([pts[j - 1][0] + (pts[j][0] - pts[j - 1][0]) * r, pts[j - 1][1] + (pts[j][1] - pts[j - 1][1]) * r]);
  }
  return out;
}

// 全体の外接矩形で正規化（縦横比は保つ）
function normalize(strokes) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of strokes) for (const [x, y] of s) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const size = Math.max(maxX - minX, maxY - minY, 1e-6);
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  return strokes.map((s) => resample(s).map(([x, y]) => [(x - cx) / size + 0.5, (y - cy) / size + 0.5]));
}

function strokeCost(a, b) {
  let f = 0, r = 0;
  for (let i = 0; i < K; i++) {
    f += Math.hypot(a[i][0] - b[i][0], a[i][1] - b[i][1]);
    r += Math.hypot(a[i][0] - b[K - 1 - i][0], a[i][1] - b[K - 1 - i][1]);
  }
  f /= K; r /= K;
  return f <= r + REV ? { c: f, rev: false } : { c: r + REV, rev: true };
}

// ハンガリアン法（最小コスト割り当て）
function hungarian(cost) {
  const n = cost.length;
  const u = new Array(n + 1).fill(0), v = new Array(n + 1).fill(0);
  const p = new Array(n + 1).fill(0), way = new Array(n + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(n + 1).fill(Infinity), used = new Array(n + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity, j1 = 0;
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue;
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const assign = new Array(n).fill(-1);
  for (let j = 1; j <= n; j++) if (p[j]) assign[p[j] - 1] = j - 1;
  return assign;
}

const refNormCache = new Map();
function refNorm(ch) {
  if (!refNormCache.has(ch)) {
    const r = refStrokes(ch);
    refNormCache.set(ch, r ? normalize(r) : null);
  }
  return refNormCache.get(ch);
}

function compare(user, ref) {
  const n = Math.max(user.length, ref.length);
  const cost = Array.from({ length: n }, () => new Array(n).fill(MISS));
  const info = Array.from({ length: n }, () => new Array(n).fill(null));
  for (let i = 0; i < user.length; i++) for (let j = 0; j < ref.length; j++) {
    const r = strokeCost(user[i], ref[j]);
    cost[i][j] = r.c; info[i][j] = r;
  }
  const a = hungarian(cost);
  let total = 0, reversed = 0;
  const pairs = [];
  for (let i = 0; i < n; i++) {
    total += cost[i][a[i]];
    if (i < user.length && a[i] < ref.length) {
      pairs.push([i, a[i]]);
      if (info[i][a[i]].rev) reversed++;
    }
  }
  // 書き順：ユーザーの i 画目が手本の何画目に対応したか
  let orderErrors = 0;
  for (const [i, j] of pairs) if (i !== j) orderErrors++;
  return { score: total / n, pairs, reversed, orderErrors };
}

/** 手本との照合。strokes: [[ [x,y,t], ... ], ...]  pool: 比較相手にする文字（省略時は全文字） */
export function offlineMatch(strokes, expected, pool = null) {
  const ref = refNorm(expected);
  if (!ref || strokes.length === 0) return null;
  const user = normalize(strokes.map((s) => s.map((p) => [p[0], p[1]])));
  const target = compare(user, ref);
  // ストローク数が近い文字を「ライバル」として比較し、順位を出す
  let rank = 1;
  const rivals = [];
  for (const ch of pool || allStrokeChars()) {
    if (ch === expected || same(ch, expected)) continue;
    const r = refNorm(ch);
    if (!r || Math.abs(r.length - strokes.length) > 2) continue;
    const s = compare(user, r).score;
    if (s < target.score) { rank++; rivals.push([ch, s]); }
  }
  rivals.sort((x, y) => x[1] - y[1]);
  return {
    score: target.score, rank, rivals: rivals.slice(0, 5).map((r) => r[0]),
    userStrokes: strokes.length, refStrokes: ref.length,
    orderErrors: target.orderErrors, reversed: target.reversed,
  };
}

/**
 * 1文字を判定する
 * @returns {Promise<{correct:boolean|null, source:string, candidates:string[], offline:object|null}>}
 *  correct が null のときは自動判定できなかった（自己判定が必要）
 */
export async function judgeChar(strokes, w, h, expected, { mode = 'auto', strictness = 'normal' } = {}) {
  const S = STRICTNESS[strictness] || STRICTNESS.normal;
  if (!strokes.length) return { correct: false, source: 'empty', candidates: [], offline: null };
  if (mode === 'self') return { correct: null, source: 'self', candidates: [], offline: null };

  const offline = hasStrokes(expected) ? offlineMatch(strokes, expected) : null;
  const offlineOk = offline ? offline.score <= S.maxScore && offline.rank <= S.rankMax : null;

  let candidates = [];
  let online = false;
  if (mode !== 'offline' && navigator.onLine !== false) {
    try {
      candidates = await googleRecognize(strokes, w, h);
      online = true;
    } catch { /* オフライン判定にフォールバック */ }
  }
  if (online) {
    const idx = candidates.findIndex((c) => same(c, expected));
    const hit = idx >= 0 && idx < S.topN;
    // Google が見落としても、手本とほぼ一致していれば正解にする
    const strong = offline && offline.rank === 1 && offline.score <= S.maxScore * 0.7;
    return { correct: hit || !!strong, source: hit ? 'google' : strong ? 'offline' : 'google', candidates, offline };
  }
  if (offlineOk === null) return { correct: null, source: 'self', candidates: [], offline: null };
  return { correct: offlineOk, source: 'offline', candidates: offline.rivals, offline };
}

// ---------- ひらがな（読み・送りがな） ----------
const SMALL = 'ぁぃぅぇぉっゃゅょゎ', LARGE = 'あいうえおつやゆよわ';
const toLarge = (c) => { const i = SMALL.indexOf(c); return i >= 0 ? LARGE[i] : c; };
const toHira = (s) => (s || '').normalize('NFKC').replace(/[\u30a1-\u30f6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
let kanaPool = null;
const KANA_POOL = () => (kanaPool ||= allStrokeChars().filter((c) => /^[ぁ-ゖ]$/.test(c)));

// マスに対する字の大きさ（0〜1）。小さい「ゃ」「っ」の判定に使う
function inkSize(strokes, unit) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of strokes) for (const [x, y] of s) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  return Math.max(maxX - minX, maxY - minY) / unit;
}
function sizeOk(ch, size) {
  if (SMALL.includes(ch)) return size < 0.62;
  if (LARGE.includes(ch)) return size > 0.38;
  return true;
}

/** オフラインで一番近いひらがな */
function offlineBestKana(strokes, unit) {
  const user = normalize(strokes.map((s) => s.map((p) => [p[0], p[1]])));
  let best = null, bestS = Infinity;
  for (const ch of KANA_POOL()) {
    const r = refNorm(ch);
    if (!r || Math.abs(r.length - strokes.length) > 2) continue;
    const sc = compare(user, r).score;
    if (sc < bestS) { bestS = sc; best = ch; }
  }
  return best ? bySize(best, inkSize(strokes, unit)) : '？';
}
// 書いた大きさに合わせて「や／ゃ」などを選ぶ（表示用）
function bySize(ch, size) {
  const i = LARGE.indexOf(toLarge(ch));
  if (i < 0) return ch;
  return size < 0.5 ? SMALL[i] : LARGE[i];
}

/**
 * ひらがなのマス目（1マス1字）を判定する
 * @param boxes   マスごとのストローク（空のマスは無視）
 * @param answers 正解として認める文字列の一覧
 * @returns {Promise<{correct:boolean|null, recognized:string, source:string}>}
 */
export async function judgeKana(boxes, answers, unit, { mode = 'auto', strictness = 'normal' } = {}) {
  const S = STRICTNESS[strictness] || STRICTNESS.normal;
  const filled = (boxes || []).filter((b) => b && b.length);
  if (!filled.length) return { correct: false, recognized: '', source: 'empty' };
  if (mode === 'self') return { correct: null, recognized: '', source: 'self' };

  let cands = null;
  if (mode !== 'offline' && navigator.onLine !== false) {
    try { cands = (await Promise.all(filled.map((s) => googleRecognize(s, unit, unit)))).map((l) => l.map(toHira)); }
    catch { cands = null; }
  }
  const sizes = filled.map((s) => inkSize(s, unit));
  const boxOk = (i, ch) => {
    if (!sizeOk(ch, sizes[i])) return false;
    if (cands) {
      const idx = cands[i].findIndex((c) => toLarge(c) === toLarge(ch));
      if (idx >= 0 && idx < S.topN) return true;
    }
    if (!hasStrokes(ch)) return cands ? false : null;
    const off = offlineMatch(filled[i], ch, KANA_POOL());
    // Google が見落としても手本とほぼ一致なら正解。オフライン時は少しゆるめ（ひらがなは曲線が多いため）
    return cands ? off.rank === 1 && off.score <= S.maxScore * 0.8 : off.score <= S.maxScore * 1.15 && off.rank <= S.rankMax;
  };
  let correct = false;
  for (const a of answers) {
    if ([...a].length !== filled.length) continue;
    const rs = [...a].map((ch, i) => boxOk(i, ch));
    if (rs.every((r) => r === true)) { correct = true; break; }
    if (rs.every((r) => r !== false)) correct = null;
  }
  const recognized = filled.map((s, i) => (cands ? (cands[i][0] ? bySize(cands[i][0], sizes[i]) : '？') : offlineBestKana(s, unit))).join('');
  return { correct, recognized, source: cands ? 'google' : 'offline' };
}
