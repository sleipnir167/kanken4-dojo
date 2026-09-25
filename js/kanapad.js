// 画面上のかなキーボード（読み問題用）
import { sfx } from './sound.js';

const COLS = [
  ['あ', 'い', 'う', 'え', 'お'],
  ['か', 'き', 'く', 'け', 'こ'],
  ['さ', 'し', 'す', 'せ', 'そ'],
  ['た', 'ち', 'つ', 'て', 'と'],
  ['な', 'に', 'ぬ', 'ね', 'の'],
  ['は', 'ひ', 'ふ', 'へ', 'ほ'],
  ['ま', 'み', 'む', 'め', 'も'],
  ['や', '', 'ゆ', '', 'よ'],
  ['ら', 'り', 'る', 'れ', 'ろ'],
  ['わ', '', 'を', 'ー', 'ん'],
];
const DAKU = { か: 'が', き: 'ぎ', く: 'ぐ', け: 'げ', こ: 'ご', さ: 'ざ', し: 'じ', す: 'ず', せ: 'ぜ', そ: 'ぞ',
  た: 'だ', ち: 'ぢ', つ: 'づ', て: 'で', と: 'ど', は: 'ば', ひ: 'び', ふ: 'ぶ', へ: 'べ', ほ: 'ぼ', う: 'ゔ' };
const HANDAKU = { は: 'ぱ', ひ: 'ぴ', ふ: 'ぷ', へ: 'ぺ', ほ: 'ぽ' };
const SMALL = { あ: 'ぁ', い: 'ぃ', う: 'ぅ', え: 'ぇ', お: 'ぉ', つ: 'っ', や: 'ゃ', ゆ: 'ゅ', よ: 'ょ', わ: 'ゎ' };
const inv = (o) => Object.fromEntries(Object.entries(o).map(([a, b]) => [b, a]));
const UNDAKU = inv(DAKU), UNHANDAKU = inv(HANDAKU), UNSMALL = inv(SMALL);

export function createKanaPad(onInput) {
  const el = document.createElement('div');
  el.className = 'kana-pad';
  let html = '<div class="kp-grid">';
  COLS.forEach((col) => {
    html += '<div class="kp-col">';
    col.forEach((ch) => { html += ch ? `<button type="button" data-k="${ch}">${ch}</button>` : '<span></span>'; });
    html += '</div>';
  });
  html += `</div>
    <div class="kp-side">
      <button type="button" data-f="daku">゛</button>
      <button type="button" data-f="handaku">゜</button>
      <button type="button" data-f="small">小</button>
      <button type="button" data-f="bs" class="kp-bs" aria-label="1文字けす">⌫</button>
    </div>`;
  el.innerHTML = html;
  el.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    e.preventDefault();
    sfx.tap();
    b.classList.add('pressed');
    setTimeout(() => b.classList.remove('pressed'), 120);
    if (b.dataset.k) onInput((v) => v + b.dataset.k);
    else onInput((v) => modify(v, b.dataset.f));
  });
  return el;
}

function modify(v, f) {
  if (f === 'bs') return v.slice(0, -1);
  if (!v) return v;
  const last = v.slice(-1), head = v.slice(0, -1);
  if (f === 'daku') {
    if (DAKU[last]) return head + DAKU[last];
    if (UNDAKU[last]) return head + UNDAKU[last];
    if (UNHANDAKU[last]) return head + DAKU[UNHANDAKU[last]];
  }
  if (f === 'handaku') {
    const base = UNDAKU[last] || UNHANDAKU[last] || last;
    if (UNHANDAKU[last]) return head + UNHANDAKU[last];
    if (HANDAKU[base]) return head + HANDAKU[base];
  }
  if (f === 'small') {
    if (SMALL[last]) return head + SMALL[last];
    if (UNSMALL[last]) return head + UNSMALL[last];
  }
  return v;
}

export const toHiragana = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
export const normalizeKana = (s) => toHiragana((s || '').normalize('NFKC')).replace(/[\s　]/g, '');
