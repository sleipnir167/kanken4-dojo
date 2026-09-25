// 手書きパッド（Apple Pencil の筆圧対応・パームリジェクション付き）
import { settings } from './store.js';
import { strokePaths } from './strokes.js';

export const UNIT = 300; // ストロークは 300×300 の座標系で保存する
let penSeen = false;     // 一度でもペンが使われたら指の入力は無視する（手のひら対策）

export class Pad {
  constructor({ model = null, showModel = false, onChange = null, onStrokeEnd = null, onStrokeStart = null, label = '' } = {}) {
    this.strokes = [];
    this.onChange = onChange;
    this.onStrokeEnd = onStrokeEnd;
    this.onStrokeStart = onStrokeStart;
    this.locked = false;
    this.el = document.createElement('div');
    this.el.className = 'pad' + (settings().showGuide ? ' guide' : '');
    this.el.innerHTML = `
      <svg class="pad-model" viewBox="0 0 109 109" aria-hidden="true"></svg>
      <canvas></canvas>
      <button class="pad-clear" type="button" aria-label="この字を消す">消</button>
      ${label ? `<span class="pad-label">${label}</span>` : ''}`;
    this.canvas = this.el.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.modelSvg = this.el.querySelector('.pad-model');
    this.el.querySelector('.pad-clear').addEventListener('click', (e) => { e.stopPropagation(); this.clear(); });
    if (model) this.setModel(model, showModel);
    this.bind();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.el);
  }

  setModel(ch, visible = true) {
    const paths = strokePaths(ch) || [];
    this.modelSvg.innerHTML = paths.map((d) => `<path d="${d}"/>`).join('');
    this.el.classList.toggle('show-model', visible);
  }
  showModel(v) { this.el.classList.toggle('show-model', v); }

  resize() {
    const r = this.el.getBoundingClientRect();
    if (!r.width) return;
    const dpr = Math.min(devicePixelRatio || 1, 3);
    this.size = r.width;
    this.canvas.width = r.width * dpr;
    this.canvas.height = r.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.redraw();
  }

  bind() {
    const c = this.canvas;
    let active = null;
    let last = 0;
    const pos = (e) => {
      const r = c.getBoundingClientRect();
      const s = UNIT / r.width;
      return [(e.clientX - r.left) * s, (e.clientY - r.top) * s, Math.round(e.timeStamp)];
    };
    const width = (e, p, prev) => {
      const base = UNIT * 0.028;
      if (e.pointerType === 'pen' && e.pressure > 0) return base * (0.55 + e.pressure * 0.9);
      if (!prev) return base * 1.1;
      // 指やマウスは速さで太さを変える（ゆっくり＝太く）
      const dt = Math.max(1, p[2] - prev[2]);
      const v = Math.hypot(p[0] - prev[0], p[1] - prev[1]) / dt;
      return base * Math.max(0.6, Math.min(1.25, 1.3 - v * 0.9));
    };
    const allowed = (e) => {
      if (this.locked) return false;
      if (e.pointerType === 'pen') penSeen = true;
      const st = settings();
      if (e.pointerType === 'touch' && (st.pencilOnly || (st.autoPalm && penSeen))) return false;
      return e.isPrimary !== false || e.pointerType === 'pen';
    };
    c.addEventListener('pointerdown', (e) => {
      if (active !== null || !allowed(e)) return;
      e.preventDefault();
      active = e.pointerId;
      try { c.setPointerCapture(e.pointerId); } catch { /* 合成イベントなど */ }
      this.onStrokeStart?.(this);
      const p = pos(e);
      p.push(width(e, p, null));
      this.strokes.push([p]);
      this.el.classList.add('has-ink');
      this.drawDot(p);
      last = p[2];
    });
    c.addEventListener('pointermove', (e) => {
      if (e.pointerId !== active) return;
      e.preventDefault();
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      const s = this.strokes[this.strokes.length - 1];
      for (const ev of evs.length ? evs : [e]) {
        const prev = s[s.length - 1];
        const p = pos(ev);
        if (Math.hypot(p[0] - prev[0], p[1] - prev[1]) < 0.8) continue;
        const w = width(ev, p, prev);
        p.push(prev[3] * 0.6 + w * 0.4); // 太さをなめらかに
        s.push(p);
        this.drawSeg(prev, p, s.length > 2 ? s[s.length - 3] : null);
        last = p[2];
      }
    });
    const end = (e) => {
      if (e.pointerId !== active) return;
      active = null;
      const s = this.strokes[this.strokes.length - 1];
      if (s && s.length === 1) { const p = s[0]; s.push([p[0] + 0.5, p[1] + 0.5, last + 1, p[3]]); }
      // はらい：最後を細く
      if (s && s.length > 3) { s[s.length - 1][3] *= 0.55; s[s.length - 2][3] *= 0.8; this.redraw(); }
      this.onStrokeEnd?.(this);
      this.onChange?.(this);
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    // iOS の拡大鏡・スクロール・長押しメニューを防ぐ
    c.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    c.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  }

  inkColor() { return getComputedStyle(this.el).getPropertyValue('--pad-ink').trim() || '#1c1a18'; }
  k() { return (this.size || UNIT) / UNIT; }

  drawDot(p) {
    const k = this.k();
    this.ctx.fillStyle = this.inkColor();
    this.ctx.beginPath();
    this.ctx.arc(p[0] * k, p[1] * k, (p[3] * k) / 2, 0, Math.PI * 2);
    this.ctx.fill();
  }
  drawSeg(a, b, before) {
    const k = this.k();
    const ctx = this.ctx;
    ctx.strokeStyle = this.inkColor();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = ((a[3] + b[3]) / 2) * k;
    ctx.beginPath();
    if (before) {
      // 中点をつないだ2次ベジェでなめらかに
      const m1 = [(before[0] + a[0]) / 2, (before[1] + a[1]) / 2];
      const m2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      ctx.moveTo(m1[0] * k, m1[1] * k);
      ctx.quadraticCurveTo(a[0] * k, a[1] * k, m2[0] * k, m2[1] * k);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(m2[0] * k, m2[1] * k);
    } else {
      ctx.moveTo(a[0] * k, a[1] * k);
    }
    ctx.lineTo(b[0] * k, b[1] * k);
    ctx.stroke();
  }
  redraw() {
    this.el.classList.toggle('has-ink', this.strokes.length > 0);
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.restore();
    for (const s of this.strokes) {
      this.drawDot(s[0]);
      for (let i = 1; i < s.length; i++) this.drawSeg(s[i - 1], s[i], i > 1 ? s[i - 2] : null);
    }
  }

  clear() { if (this.locked) return; this.strokes = []; this.redraw(); this.onChange?.(this); }
  undo() { if (this.locked) return; this.strokes.pop(); this.redraw(); this.onChange?.(this); }
  isEmpty() { return this.strokes.length === 0; }
  getStrokes() { return this.strokes.map((s) => s.map((p) => [p[0], p[1], p[2]])); }
  setStrokes(strokes) {
    this.strokes = (strokes || []).map((s) => s.map((p) => [p[0], p[1], p[2], p[3] ?? UNIT * 0.034]));
    this.redraw();
  }
  lock(v = true) { this.locked = v; this.el.classList.toggle('locked', v); }
  mark(state) { this.el.dataset.mark = state || ''; }
  destroy() { this.ro.disconnect(); }
}

/** ストロークを小さな SVG に変換（見直し用のサムネイル） */
export function strokesToSVG(strokes, cls = 'ink-thumb') {
  const paths = (strokes || []).map((s) => {
    if (!s.length) return '';
    return `<path d="M${s.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('L')}"/>`;
  }).join('');
  return `<svg class="${cls}" viewBox="0 0 ${UNIT} ${UNIT}" aria-hidden="true">${paths}</svg>`;
}
