// 書き順アニメーション（KanjiVG）
import { strokePaths, pathToPoints } from './strokes.js';
import { sfx } from './sound.js';

export function strokeOrderView(ch, { size = 260, autoplay = true, numbers = true } = {}) {
  const paths = strokePaths(ch);
  const wrap = document.createElement('div');
  wrap.className = 'stroke-view';
  if (!paths) {
    wrap.innerHTML = `<div class="stroke-missing">${ch}</div><p class="muted">書き順データがありません</p>`;
    return { el: wrap, play() {}, destroy() {} };
  }
  const nums = numbers ? paths.map((d, i) => {
    const p = pathToPoints(d)[0];
    return `<text x="${(p[0] - 4).toFixed(1)}" y="${(p[1] - 2).toFixed(1)}" data-n="${i}">${i + 1}</text>`;
  }).join('') : '';
  wrap.innerHTML = `
    <div class="stroke-stage" style="width:${size}px;height:${size}px">
      <svg viewBox="0 0 109 109" class="stroke-svg">
        <g class="guide-lines"><line x1="54.5" y1="0" x2="54.5" y2="109"/><line x1="0" y1="54.5" x2="109" y2="54.5"/></g>
        <g class="ghost">${paths.map((d) => `<path d="${d}"/>`).join('')}</g>
        <g class="ink">${paths.map((d) => `<path d="${d}"/>`).join('')}</g>
        <g class="nums">${nums}</g>
      </svg>
    </div>
    <div class="stroke-ctrl">
      <button type="button" class="mini-btn" data-s="prev" aria-label="1画もどる">◀</button>
      <button type="button" class="mini-btn primary" data-s="play">▶ 再生</button>
      <button type="button" class="mini-btn" data-s="next" aria-label="1画すすむ">▶︎|</button>
      <span class="stroke-count"><b>0</b> / ${paths.length}画</span>
    </div>`;
  const inks = [...wrap.querySelectorAll('.ink path')];
  const numEls = [...wrap.querySelectorAll('.nums text')];
  const counter = wrap.querySelector('.stroke-count b');
  const lens = inks.map((p) => { try { return p.getTotalLength(); } catch { return 150; } });
  inks.forEach((p, i) => { p.style.strokeDasharray = lens[i]; p.style.strokeDashoffset = lens[i]; });
  let shown = 0, timer = null;

  const setShown = (n, animateLast = false) => {
    shown = Math.max(0, Math.min(paths.length, n));
    inks.forEach((p, i) => {
      p.style.transition = 'none';
      p.classList.toggle('current', i === shown - 1);
      if (i < shown - (animateLast ? 1 : 0)) p.style.strokeDashoffset = 0;
      else p.style.strokeDashoffset = lens[i];
    });
    numEls.forEach((t, i) => t.classList.toggle('on', i < shown));
    if (animateLast && shown > 0) {
      const p = inks[shown - 1];
      void p.getBoundingClientRect();
      p.style.transition = `stroke-dashoffset ${Math.max(0.25, lens[shown - 1] / 110)}s ease-in-out`;
      p.style.strokeDashoffset = 0;
    }
    counter.textContent = shown;
  };
  const stop = () => { clearTimeout(timer); timer = null; wrap.querySelector('[data-s="play"]').textContent = '▶ 再生'; };
  const play = () => {
    stop();
    setShown(0);
    wrap.querySelector('[data-s="play"]').textContent = '■ 停止';
    const step = () => {
      if (shown >= paths.length) { stop(); return; }
      setShown(shown + 1, true);
      sfx.pen();
      timer = setTimeout(step, Math.max(380, lens[shown - 1] * 9) + 120);
    };
    timer = setTimeout(step, 250);
  };
  wrap.querySelector('.stroke-ctrl').addEventListener('click', (e) => {
    const b = e.target.closest('[data-s]');
    if (!b) return;
    const s = b.dataset.s;
    if (s === 'play') { timer ? stop() : play(); }
    if (s === 'next') { stop(); setShown(shown + 1, true); sfx.pen(); }
    if (s === 'prev') { stop(); setShown(shown - 1); }
  });
  setShown(autoplay ? 0 : paths.length);
  if (autoplay) requestAnimationFrame(play);
  return { el: wrap, play, destroy: stop };
}
