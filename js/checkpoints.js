// 答案用紙モード：「とめ・はね・はらい」のチェックポイント
import { strokePaths, strokeKinds, pathToPoints } from './strokes.js';
import { strokesToSVG } from './pad.js';
import { esc, modal } from './ui.js';
import { sfx } from './sound.js';

const KIND = {
  h: { label: 'はね', cls: 'k-hane', tip: 'はねるところは、しっかりはねる' },
  r: { label: 'はらい', cls: 'k-harai', tip: 'はらうところは、先を細くはらう' },
  t: { label: 'とめ', cls: 'k-tome', tip: 'とめるところは、ぴたっと止める' },
  d: { label: '点', cls: 'k-ten', tip: '点の数と向き' },
};

/** 画の種類ごとの画番号（1始まり） */
export function kindSummary(ch) {
  const kinds = strokeKinds(ch);
  if (!kinds) return null;
  const out = { h: [], r: [], t: [], d: [] };
  [...kinds].forEach((k, i) => out[k]?.push(i + 1));
  return out;
}

/** 画の種類で色分けしたお手本（はね・はらいの終わりに印をつける） */
export function kindModelSVG(ch) {
  const paths = strokePaths(ch);
  if (!paths) return `<b class="kind-fallback">${esc(ch)}</b>`;
  const kinds = strokeKinds(ch) || '';
  const marks = paths.map((d, i) => {
    const k = kinds[i];
    if (k !== 'h' && k !== 'r') return '';
    const pts = pathToPoints(d);
    const [x, y] = pts[pts.length - 1];
    return `<circle class="end ${KIND[k].cls}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.2"/>`;
  }).join('');
  return `<svg class="kind-model" viewBox="0 0 109 109" aria-label="${esc(ch)}のお手本">
    ${paths.map((d, i) => `<path class="${KIND[kinds[i]]?.cls || 'k-tome'}" d="${d}"/>`).join('')}${marks}
  </svg>`;
}

function checkRows(sum) {
  const rows = [];
  const where = (list) => (list.length ? `（${list.slice(0, 6).join('・')}${list.length > 6 ? '…' : ''}画目）` : '');
  if (sum?.h.length) rows.push(['h', `はね <b>${sum.h.length}か所</b>${where(sum.h)}をはねた`]);
  if (sum?.r.length) rows.push(['r', `はらい <b>${sum.r.length}か所</b>${where(sum.r)}をはらった`]);
  rows.push(['t', 'とめるところで、ぴたっと止めた']);
  rows.push(['x', '点や画の数・長さ・つき出しが正しい']);
  return rows;
}

/**
 * 1文字分のチェックパネル
 * @param strokes 自分が書いた線（UNIT座標）
 */
export function checkCardHTML(ch, strokes, i = 0) {
  const sum = kindSummary(ch);
  return `<div class="check-card" data-ci="${i}">
    <div class="check-pair">
      <figure class="check-ink">${strokesToSVG(strokes)}<figcaption>あなた</figcaption></figure>
      <figure class="check-model">${kindModelSVG(ch)}<figcaption>お手本</figcaption></figure>
    </div>
    <div class="check-legend">
      <span class="lg k-hane">はね</span><span class="lg k-harai">はらい</span><span class="lg k-tome">とめ・点</span>
    </div>
    <ul class="check-list">
      ${checkRows(sum).map(([k, text]) => `<li><button type="button" class="check-row" data-action="chk-toggle" aria-pressed="false">
        <span class="cbox" aria-hidden="true"></span><span class="ctext">${text}</span></button></li>`).join('')}
    </ul>
  </div>`;
}

/** 答え合わせ用：書いた字すべてのチェックパネル */
export function checkPanelHTML(q, ans, { buttons = true, correct = true } = {}) {
  const chars = q.write ? [...q.write] : [];
  const cards = chars.map((ch, i) => (ans?.pads?.[i]?.length ? checkCardHTML(ch, ans.pads[i], i) : '')).join('');
  if (!cards) return '';
  return `<section class="check-panel">
    <p class="check-title">✍️ とめ・はね・はらい チェック <small>本番は細かいところまで採点されます。お手本と見くらべよう</small></p>
    <div class="check-cards">${cards}</div>
    ${buttons && correct ? `<div class="check-actions">
      <button type="button" class="btn ghost" data-action="chk-ng">直すところがあった（×にする）</button>
    </div>` : ''}
  </section>`;
}

/** チェックの行をタップで切りかえる（どの画面でも共通） */
export function bindCheckToggles(root) {
  root.addEventListener('click', (e) => {
    const b = e.target.closest('.check-row');
    if (!b || !root.contains(b)) return;
    const on = b.getAttribute('aria-pressed') !== 'true';
    b.setAttribute('aria-pressed', on);
    b.classList.toggle('on', on);
    sfx.tap();
  });
}

/** 模試の見直しなどで使うモーダル版。onNG が渡されれば「×にする」ボタンを出す */
export function openCheckModal(q, ans, { correct, onNG } = {}) {
  const m = modal(`
    <div class="check-modal">
      <button class="icon-btn modal-x" data-close aria-label="閉じる">✕</button>
      ${checkPanelHTML(q, ans, { buttons: false })}
      <div class="modal-actions">
        ${onNG && correct ? '<button class="btn ghost" data-ng>直すところがあった（×にする）</button>' : ''}
        <button class="btn primary" data-close>OK</button>
      </div>
    </div>`, { cls: 'modal-wide' });
  bindCheckToggles(m.el);
  m.el.querySelector('[data-ng]')?.addEventListener('click', () => { m.close(); onNG(); });
  return m;
}

export const KIND_INFO = KIND;
