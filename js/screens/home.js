import * as store from '../store.js';
import { QUESTIONS } from '../bank.js';
import { isDue, status } from '../srs.js';
import { levelInfo } from '../game.js';
import { mascot, greeting } from '../mascot.js';
import { ring, actions, esc } from '../ui.js';
import { go } from '../app.js';
import { sfx } from '../sound.js';
import { KANJI4 } from '../../data/kanji.js';
import { openKanji } from './dict.js';

export function daysUntil(dateStr) {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T00:00:00`);
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.round((d - t) / 864e5);
}

export function renderHome(root) {
  const s = store.get();
  const st = s.settings;
  const lv = levelInfo();
  const streak = store.streak();
  const today = store.today();
  let due = 0, weak = 0, learned = 0;
  for (const q of QUESTIONS) {
    const it = s.items[q.id];
    if (!it?.n) continue;
    learned++;
    if (isDue(it)) due++;
    if (status(it) === 'weak') weak++;
  }
  const remainingNew = QUESTIONS.length - learned;
  const examDays = daysUntil(st.examDate);
  const perDay = examDays > 0 ? Math.ceil(remainingNew / examDays) : null;
  const goal = st.dailyGoal;
  const kod = KANJI4[Math.floor(Date.now() / 864e5) % KANJI4.length]; // 今日の漢字
  const bestExam = s.exams.length ? Math.max(...s.exams.map((e) => e.score)) : null;
  const hour = new Date().getHours();
  const hello = hour < 10 ? 'おはよう' : hour < 18 ? 'こんにちは' : 'こんばんは';
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  root.innerHTML = `
  <header class="home-hero">
    <div class="hero-bg" aria-hidden="true"></div>
    <button class="icon-btn gear" data-action="settings" aria-label="設定">
      <svg viewBox="0 0 24 24"><path d="M19.14 12.94a7.07 7.07 0 0 0 0-1.88l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96a7 7 0 0 0-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84a.47.47 0 0 0-.47.41l-.36 2.54a7.3 7.3 0 0 0-1.62.94l-2.39-.96a.48.48 0 0 0-.59.22L2.74 8.87a.47.47 0 0 0 .12.61l2.03 1.58a7.4 7.4 0 0 0 0 1.88l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54a7 7 0 0 0 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.47.47 0 0 0-.12-.61zM12 15.6a3.6 3.6 0 1 1 0-7.2 3.6 3.6 0 0 1 0 7.2z"/></svg>
    </button>
    <div class="hero-inner">
      <div class="hero-mascot" data-action="poke">${mascot(today.n >= goal ? 'happy' : 'normal', 'bob')}</div>
      <div class="hero-text">
        <p class="bubble">${esc(greeting({ due, streak, examDays }))}</p>
        <h1><span class="h1-sub">${hello}${st.name ? `、${esc(st.name)}さん` : ''}</span>漢検4級 道場</h1>
        <div class="hero-stats">
          <div class="lv-chip"><b>Lv.${lv.level}</b><span>${lv.title}</span></div>
          <div class="xp-bar" title="次のレベルまで ${lv.need - lv.into} XP"><i style="width:${(lv.ratio * 100).toFixed(1)}%"></i><small>${lv.into} / ${lv.need} XP</small></div>
          <div class="streak-chip ${streak ? 'on' : ''}"><span class="flame">🔥</span><b>${streak}</b>日連続</div>
        </div>
      </div>
    </div>
  </header>

  <section class="home-grid">
    <article class="card today-card">
      ${ring(today.n / goal, { size: 128, stroke: 13, label: `${today.n}<small>/${goal}</small>`, sub: '今日の問題' })}
      <div class="today-info">
        <h2>今日の学習</h2>
        <ul class="mini-stats">
          <li><b>${today.n ? Math.round((today.c / today.n) * 100) : '--'}<small>%</small></b><span>正答率</span></li>
          <li class="${due ? 'hot' : ''}"><b>${due}</b><span>復習どき</span></li>
          <li class="${weak ? 'warn' : ''}"><b>${weak}</b><span>苦手</span></li>
        </ul>
        <p class="muted small">${today.n >= goal ? '🎉 今日の目標クリア！さらに進めよう' : `目標まであと <b>${goal - today.n}</b> 問`}</p>
      </div>
    </article>

    <article class="card exam-card ${examDays != null && examDays >= 0 ? '' : 'unset'}" data-action="settings">
      ${examDays != null && examDays >= 0 ? `
        <p class="exam-label">本番まで</p>
        <p class="exam-days">あと<b>${examDays}</b>日</p>
        <p class="muted small">${perDay ? `1日 <b>${perDay}</b> 問の新しい問題で、全${QUESTIONS.length}問を一周できるよ` : 'いよいよだね！復習を中心にしよう'}</p>`
      : `<p class="exam-label">受検日を設定しよう</p><p class="muted small">本番までの日数と、1日にやるべき量を計算します</p><span class="link">設定する →</span>`}
    </article>

    <button class="cta" data-action="auto">
      <span class="cta-icon">筆</span>
      <span class="cta-text"><b>おまかせ学習</b><small>忘れかけた問題・苦手・新しい問題をバランスよく ${st.sessionSize}問</small></span>
      <span class="cta-go">はじめる</span>
    </button>

    <button class="card tile tile-weak" data-action="weak" ${weak ? '' : 'disabled'}>
      <span class="tile-ic">苦</span><b>苦手克服</b><small>${weak ? `${weak}問を集中特訓` : 'まだ苦手はありません'}</small>
    </button>
    <button class="card tile tile-cats" data-action="cats">
      <span class="tile-ic">分</span><b>分野別練習</b><small>10分野から選んで練習</small>
    </button>
    <button class="card tile tile-exam" data-action="exam">
      <span class="tile-ic">試</span><b>模擬試験</b><small>${bestExam != null ? `ベスト ${bestExam}点／200` : '本番形式で実力チェック'}</small>
    </button>
    <button class="card tile tile-dict" data-action="dict">
      <span class="tile-ic">典</span><b>漢字辞典</b><small>書き順・なぞり書き</small>
    </button>

    <article class="card kod-card" data-action="kod">
      <div class="kod-k">${kod.k}</div>
      <div>
        <p class="kod-label">今日の漢字</p>
        <p class="kod-read">${[...kod.on, ...kod.kun].slice(0, 4).map(esc).join('・')}</p>
        <p class="muted small">部首「${esc(kod.rf || kod.r)}」・${kod.s}画</p>
      </div>
    </article>

    ${isIOS && !standalone ? `
    <article class="card install-card">
      <b>📲 ホーム画面に追加しよう</b>
      <p class="small">Safari の <b>共有ボタン</b>（□に↑）→「<b>ホーム画面に追加</b>」で、アプリのように全画面で使えます。オフラインでも学習できます。</p>
    </article>` : ''}

    <p class="progress-note muted small">学習した問題 ${learned} / ${QUESTIONS.length}（${Math.round((learned / QUESTIONS.length) * 100)}%）</p>
  </section>`;

  actions(root, {
    settings: () => { sfx.tap(); go('settings'); },
    auto: () => { sfx.select(); go('quiz', { mode: 'auto' }); },
    weak: () => { sfx.select(); go('quiz', { mode: 'weak' }); },
    cats: () => { sfx.tap(); go('cats'); },
    exam: () => { sfx.tap(); go('exam'); },
    dict: () => { sfx.tap(); go('dict'); },
    kod: () => { sfx.tap(); openKanji(kod.k); },
    poke: (t) => {
      sfx.select();
      t.classList.remove('jump'); void t.offsetWidth; t.classList.add('jump');
      t.closest('.hero-inner').querySelector('.bubble').textContent = greeting({ due, streak, examDays });
    },
  });
}
