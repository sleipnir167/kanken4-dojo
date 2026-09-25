import * as store from '../store.js';
import { CATS, CAT_ORDER, byCat } from '../bank.js';
import { status } from '../srs.js';
import { actions } from '../ui.js';
import { go } from '../app.js';
import { sfx } from '../sound.js';

export function catProgress(cat, items = store.get().items) {
  const qs = byCat(cat);
  let learned = 0, mastered = 0, weak = 0, n = 0, c = 0;
  for (const q of qs) {
    const st = items[q.id];
    if (!st?.n) continue;
    learned++; n += st.n; c += st.c;
    const s = status(st);
    if (s === 'mastered') mastered++;
    if (s === 'weak') weak++;
  }
  return { total: qs.length, learned, mastered, weak, acc: n ? c / n : null };
}

export function renderCats(root) {
  root.innerHTML = `
    <header class="page-head">
      <h1>分野別練習</h1>
      <p class="muted">本番の10分野。<b>配点</b>が大きい分野から攻略するのが合格への近道です。</p>
    </header>
    <section class="cat-grid">
      ${CAT_ORDER.map((id, i) => {
        const c = CATS[id];
        const p = catProgress(id);
        const pct = Math.round((p.learned / p.total) * 100);
        return `
        <button class="card cat-card" data-action="go" data-cat="${id}" style="--cat:${c.color}">
          <span class="cat-no">（${'一二三四五六七八九十'[i]}）</span>
          <span class="cat-ic">${c.icon}</span>
          <b class="cat-name">${c.name}</b>
          <span class="cat-meta">本番 ${c.exam}問 × ${c.points}点 = <b>${c.exam * c.points}点</b></span>
          <span class="cat-bar"><i style="width:${pct}%"></i><i class="m" style="width:${Math.round((p.mastered / p.total) * 100)}%"></i></span>
          <span class="cat-foot">
            <span>学習 ${p.learned}/${p.total}</span>
            <span>${p.acc != null ? `正答率 ${Math.round(p.acc * 100)}%` : '未挑戦'}</span>
            ${p.weak ? `<span class="weak-badge">苦手 ${p.weak}</span>` : ''}
          </span>
        </button>`;
      }).join('')}
    </section>`;
  actions(root, {
    go: (t) => { sfx.select(); go('quiz', { mode: 'cat', cat: t.dataset.cat }); },
  });
}
