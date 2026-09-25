// 学習記録・分析
import * as store from '../store.js';
import { QUESTIONS, CATS, CAT_ORDER } from '../bank.js';
import { retrievability, forecast, dueSchedule, status, weakness } from '../srs.js';
import { BADGES, levelInfo } from '../game.js';
import { catProgress } from './cats.js';
import { historyChart } from './exam.js';
import { answerHTML } from '../question.js';
import { actions, ring, esc } from '../ui.js';
import { go } from '../app.js';

/** 合格予想点：分野ごとに「今テストしたら正解できる確率」を見積もって配点をかける */
export function predictScore(items = store.get().items) {
  const t = Date.now();
  let total = 0;
  const bySec = {};
  for (const c of CAT_ORDER) {
    const qs = QUESTIONS.filter((q) => q.cat === c);
    let sum = 0;
    for (const q of qs) {
      const st = items[q.id];
      if (!st?.n) { sum += 0.3; continue; } // 未学習は3割程度と仮定
      const acc = (st.c + 1) / (st.n + 2);
      const R = retrievability(st, t);
      sum += Math.min(0.98, acc * (0.35 + 0.65 * R) + (st.h.endsWith('1') ? 0.1 : 0));
    }
    const p = sum / qs.length;
    bySec[c] = p;
    total += p * CATS[c].exam * CATS[c].points;
  }
  return { score: Math.round(total), bySec };
}

function heatmap(days) {
  const weeks = 18;
  const end = new Date(); end.setHours(0, 0, 0, 0);
  const start = new Date(end); start.setDate(start.getDate() - (weeks * 7 - 1) - end.getDay());
  const cells = [];
  const max = Math.max(10, ...Object.values(days).map((d) => d.n));
  for (let i = 0; i < weeks * 7 + end.getDay() + 1; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const key = store.dayKey(d);
    const n = days[key]?.n || 0;
    const lv = n === 0 ? 0 : n < max * 0.25 ? 1 : n < max * 0.5 ? 2 : n < max * 0.8 ? 3 : 4;
    cells.push(`<i class="hm l${lv}" style="grid-column:${Math.floor(i / 7) + 1};grid-row:${(i % 7) + 1}" title="${d.getMonth() + 1}/${d.getDate()}：${n}問"></i>`);
  }
  return `<div class="heatmap">${cells.join('')}</div>
    <div class="hm-legend"><span>少</span><i class="hm l0"></i><i class="hm l1"></i><i class="hm l2"></i><i class="hm l3"></i><i class="hm l4"></i><span>多</span></div>`;
}

function curveChart(fc, schedule) {
  const W = 600, H = 220, L = 40, R = 16, T = 16, B = 30;
  const x = (i) => L + (i * (W - L - R)) / (fc.length - 1);
  const y = (v) => T + (1 - v) * (H - T - B);
  const path = fc.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const area = `${path}L${x(fc.length - 1)},${y(0)}L${x(0)},${y(0)}Z`;
  const maxD = Math.max(1, ...schedule);
  const bw = (W - L - R) / (fc.length - 1);
  return `<svg class="curve-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="忘却曲線の予測">
    ${[0, 0.25, 0.5, 0.75, 1].map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" class="axis">${v * 100}%</text>`).join('')}
    ${schedule.map((n, i) => (n ? `<rect x="${x(i) - bw * 0.3}" y="${y(0) - (n / maxD) * 60}" width="${bw * 0.6}" height="${(n / maxD) * 60}" class="due-bar"><title>${i}日後：${n}問</title></rect>` : '')).join('')}
    <path d="${area}" class="curve-area"/>
    <path d="${path}" class="curve-line"/>
    <line x1="${L}" x2="${W - R}" y1="${y(0.9)}" y2="${y(0.9)}" class="target"/>
    <text x="${W - R}" y="${y(0.9) - 5}" text-anchor="end" class="target-label">復習の目安 90%</text>
    ${[0, 7, 14, 21, 30].filter((d) => d < fc.length).map((d) => `<text x="${x(d)}" y="${H - 8}" text-anchor="middle" class="axis">${d ? `${d}日後` : '今日'}</text>`).join('')}
  </svg>`;
}

export function renderStats(root) {
  const s = store.get();
  const items = s.items;
  const lv = levelInfo();
  const learnedList = Object.values(items).filter((x) => x.n);
  const totalN = learnedList.reduce((a, b) => a + b.n, 0);
  const totalC = learnedList.reduce((a, b) => a + b.c, 0);
  const counts = { new: 0, learning: 0, review: 0, mastered: 0, weak: 0 };
  for (const q of QUESTIONS) counts[status(items[q.id])]++;
  const pred = predictScore(items);
  const fc = forecast(items, 30);
  const sched = dueSchedule(items, 31);
  const weakList = QUESTIONS.filter((q) => items[q.id]?.w > 0)
    .sort((a, b) => weakness(items[b.id]) - weakness(items[a.id])).slice(0, 10);
  const starred = QUESTIONS.filter((q) => items[q.id]?.star);
  const nowR = fc[0] ?? 0;

  root.innerHTML = `
  <header class="page-head"><h1>学習記録</h1></header>
  <section class="stat-tiles">
    <div class="card tile-stat"><b>${store.streak()}</b><span>連続学習日数</span></div>
    <div class="card tile-stat"><b>${totalN}</b><span>総解答数</span></div>
    <div class="card tile-stat"><b>${totalN ? Math.round((totalC / totalN) * 100) : '--'}<small>%</small></b><span>正答率</span></div>
    <div class="card tile-stat"><b>Lv.${lv.level}</b><span>${lv.title}</span></div>
  </section>

  <section class="stats-grid">
    <article class="card predict-card">
      <h2>合格予想スコア</h2>
      <div class="predict">
        ${ring(pred.score / 200, { size: 160, stroke: 16, label: `${pred.score}`, sub: '/ 200点', color: pred.score >= 140 ? 'var(--matcha)' : 'var(--shu)' })}
        <div>
          <p class="predict-msg">${pred.score >= 160 ? '合格圏内！この調子で定着させよう' : pred.score >= 140 ? '合格ライン到達！油断せず復習を' : `合格まであと <b>${140 - pred.score}</b> 点`}</p>
          <p class="muted small">解答の正確さと、忘却曲線から見た「今の記憶の残り具合」から計算した予想です。</p>
        </div>
      </div>
      <div class="sec-list">
        ${CAT_ORDER.map((c) => `<div class="sec-row">
          <span class="sec-name"><span class="cat-dot" style="--cat:${CATS[c].color}">${CATS[c].icon}</span>${CATS[c].name}</span>
          <span class="sec-bar"><i style="width:${pred.bySec[c] * 100}%;background:${CATS[c].color}"></i></span>
          <span class="sec-val">${Math.round(pred.bySec[c] * CATS[c].exam * CATS[c].points)}/${CATS[c].exam * CATS[c].points}</span>
        </div>`).join('')}
      </div>
    </article>

    <article class="card mastery-card">
      <h2>問題の定着状況 <small>${QUESTIONS.length}問</small></h2>
      <div class="stack-bar">
        ${['mastered', 'review', 'learning', 'weak', 'new'].map((k) => `<i class="st-${k}" style="flex:${counts[k]}" title="${counts[k]}"></i>`).join('')}
      </div>
      <ul class="legend">
        <li><i class="st-mastered"></i>習得 <b>${counts.mastered}</b></li>
        <li><i class="st-review"></i>定着中 <b>${counts.review}</b></li>
        <li><i class="st-learning"></i>学習中 <b>${counts.learning}</b></li>
        <li><i class="st-weak"></i>苦手 <b>${counts.weak}</b></li>
        <li><i class="st-new"></i>未学習 <b>${counts.new}</b></li>
      </ul>
      <h3>分野別</h3>
      ${CAT_ORDER.map((c) => { const p = catProgress(c, items); return `<div class="sec-row small">
        <span class="sec-name">${CATS[c].name}</span>
        <span class="sec-bar"><i style="width:${(p.learned / p.total) * 100}%;background:${CATS[c].color};opacity:.35"></i><i style="width:${(p.mastered / p.total) * 100}%;background:${CATS[c].color}"></i></span>
        <span class="sec-val">${p.acc != null ? `${Math.round(p.acc * 100)}%` : '—'}</span></div>`; }).join('')}
    </article>

    <article class="card curve-card">
      <h2>忘却曲線 <small>いま復習しなかったら…</small></h2>
      ${fc.length ? `
        <p class="muted small">学習した問題の平均の記憶の残り具合は <b>${Math.round(nowR * 100)}%</b>。棒グラフは復習の予定数です。<br>
        記憶が 90% を下回るころに出題されるので、<b>おまかせ学習</b>を毎日続けるだけで効率よく覚えられます。</p>
        ${curveChart(fc, sched)}` : '<p class="muted">問題を解くと、記憶の予測グラフが表示されます。</p>'}
    </article>

    <article class="card cal-card">
      <h2>学習カレンダー</h2>
      ${heatmap(s.days)}
    </article>

    ${s.exams.length ? `<article class="card"><h2>模試の記録</h2>${historyChart(s.exams)}</article>` : ''}

    <article class="card weak-card">
      <h2>苦手ランキング ${weakList.length ? '<button class="btn primary small" data-action="weak">まとめて特訓</button>' : ''}</h2>
      ${weakList.length ? `<ol class="weak-list">${weakList.map((q) => `<li><span class="cat-dot" style="--cat:${CATS[q.cat].color}">${CATS[q.cat].icon}</span><span>${answerHTML(q)}</span><small>${items[q.id].c}/${items[q.id].n}</small></li>`).join('')}</ol>` : '<p class="muted">まだまちがえた問題はありません。</p>'}
    </article>

    <article class="card note-card">
      <h2>☆ 苦手ノート <small>${starred.length}問</small> ${starred.length ? '<button class="btn primary small" data-action="note">ノートの問題を解く</button>' : ''}</h2>
      ${starred.length ? `<ul class="weak-list">${starred.map((q) => `<li><span class="cat-dot" style="--cat:${CATS[q.cat].color}">${CATS[q.cat].icon}</span><span>${answerHTML(q)}</span></li>`).join('')}</ul>` : '<p class="muted">答え合わせの画面で「☆ノート」を押すと、ここに集められます。</p>'}
    </article>

    <article class="card badge-card">
      <h2>バッジ <small>${Object.keys(s.badges).length} / ${BADGES.length}</small></h2>
      <div class="badges">
        ${BADGES.map((b) => `<div class="badge ${s.badges[b.id] ? 'got' : ''}" title="${esc(b.desc)}"><span>${s.badges[b.id] ? b.icon : '？'}</span><b>${b.name}</b><small>${b.desc}</small></div>`).join('')}
      </div>
    </article>
  </section>`;

  actions(root, {
    weak: () => go('quiz', { mode: 'weak' }),
    note: () => go('quiz', { mode: 'ids', t: Date.now() }, { ids: starred.map((q) => q.id) }),
  });
}
