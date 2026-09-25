// 演出：桜吹雪・花丸・ポップアップ
const canvas = () => document.getElementById('fx-canvas');
let particles = [];
let raf = 0;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function resize() {
  const c = canvas();
  const dpr = Math.min(devicePixelRatio || 1, 2);
  c.width = innerWidth * dpr; c.height = innerHeight * dpr;
  c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener('resize', () => canvas() && resize());

const COLORS = ['#f7b6c8', '#f39bb3', '#ffd6e0', '#fbe3a1', '#ffffff', '#f5a3a3'];
const CONFETTI = ['#d9442e', '#f0a500', '#5d9b3a', '#2c4f86', '#8a5cc2', '#f39bb3'];

/** 桜吹雪（kind='sakura'）または紙吹雪（kind='confetti'） */
export function burst({ count = 80, kind = 'sakura', x = innerWidth / 2, y = innerHeight * 0.35, spread = 1 } = {}) {
  if (reduced()) return;
  const c = canvas();
  if (!c.width) resize();
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = (4 + Math.random() * 9) * spread;
    particles.push({
      kind, x, y,
      vx: Math.cos(a) * v, vy: Math.sin(a) * v - 6,
      r: kind === 'sakura' ? 7 + Math.random() * 7 : 5 + Math.random() * 5,
      rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.3,
      sway: Math.random() * 6.28,
      color: (kind === 'sakura' ? COLORS : CONFETTI)[i % 6],
      life: 0, max: 140 + Math.random() * 90,
    });
  }
  if (!raf) raf = requestAnimationFrame(loop);
}

/** 画面上から桜が舞い落ちる */
export function sakuraRain(count = 60) {
  if (reduced()) return;
  if (!canvas().width) resize();
  for (let i = 0; i < count; i++) {
    particles.push({
      kind: 'sakura', x: Math.random() * innerWidth, y: -20 - Math.random() * innerHeight * 0.8,
      vx: (Math.random() - 0.3) * 1.5, vy: 1 + Math.random() * 2,
      r: 7 + Math.random() * 8, rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.08,
      sway: Math.random() * 6.28, color: COLORS[i % 6], life: 0, max: 420, rain: true,
    });
  }
  if (!raf) raf = requestAnimationFrame(loop);
}

function petal(ctx, r) {
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.bezierCurveTo(r * 0.9, -r * 0.7, r * 0.8, r * 0.5, 0, r);
  ctx.bezierCurveTo(-r * 0.8, r * 0.5, -r * 0.9, -r * 0.7, 0, -r);
  ctx.moveTo(0, -r);
  ctx.lineTo(r * 0.18, -r * 0.62);
  ctx.lineTo(-r * 0.18, -r * 0.62);
  ctx.closePath();
  ctx.fill();
}

function loop() {
  const c = canvas();
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  particles = particles.filter((p) => p.life < p.max && p.y < innerHeight + 40);
  for (const p of particles) {
    p.life++;
    p.sway += 0.05;
    if (p.rain) { p.x += p.vx + Math.sin(p.sway) * 0.8; p.y += p.vy; }
    else {
      p.vx *= 0.96; p.vy = p.vy * 0.96 + 0.32;
      p.x += p.vx + Math.sin(p.sway) * (p.kind === 'sakura' ? 1.2 : 0.5); p.y += p.vy;
    }
    p.rot += p.vr;
    const alpha = Math.min(1, (p.max - p.life) / 40);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = p.color;
    if (p.kind === 'sakura') {
      ctx.scale(1, 0.6 + 0.4 * Math.abs(Math.sin(p.sway)));
      petal(ctx, p.r);
    } else {
      ctx.scale(1, Math.abs(Math.sin(p.sway * 2)) + 0.1);
      ctx.fillRect(-p.r / 2, -p.r / 3, p.r, p.r * 0.66);
    }
    ctx.restore();
  }
  raf = particles.length ? requestAnimationFrame(loop) : 0;
  if (!raf) ctx.clearRect(0, 0, c.width, c.height);
}

/** 要素の上に「+10」などを浮かび上がらせる */
export function floatText(text, el, cls = '') {
  const r = el?.getBoundingClientRect?.() || { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
  const d = document.createElement('div');
  d.className = `float-text ${cls}`;
  d.textContent = text;
  d.style.left = `${r.left + r.width / 2}px`;
  d.style.top = `${r.top + r.height / 2}px`;
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 1400);
}

export function shake(el) {
  if (!el || reduced()) return;
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
}

// 花丸（先生が赤ペンで書くぐるぐるの丸）
export const HANAMARU_SVG = `
<svg class="hanamaru" viewBox="0 0 200 200" aria-hidden="true">
  <path class="hm-petals" d="M100 22 C 128 10, 150 34, 140 56 C 168 50, 186 80, 164 100 C 188 118, 170 150, 142 144 C 150 172, 118 190, 100 168 C 82 190, 50 172, 58 144 C 30 150, 12 118, 36 100 C 14 80, 32 50, 60 56 C 50 34, 72 10, 100 22 Z"/>
  <path class="hm-spiral" d="M104 100 C 104 92, 92 90, 88 98 C 82 110, 98 122, 110 114 C 126 104, 118 80, 98 78 C 74 76, 66 102, 76 118 C 90 140, 128 134, 134 108 C 140 80, 116 62, 94 64"/>
</svg>`;
export const BATSU_SVG = `
<svg class="batsu" viewBox="0 0 200 200" aria-hidden="true">
  <path d="M50 48 C 90 90, 120 120, 152 156"/>
  <path d="M150 46 C 112 84, 84 116, 48 154"/>
</svg>`;
