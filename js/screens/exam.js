// 模擬試験（本番形式）
import * as store from '../store.js';
import { CATS, CAT_ORDER, byCat, BY_ID } from '../bank.js';
import { review, shuffle } from '../srs.js';
import { mountAnswer, promptHTML, guideText, grade, answerHTML, inkCompareHTML, kanaCompareHTML, userAnswerText } from '../question.js';
import { checkBadges, levelInfo } from '../game.js';
import { sfx } from '../sound.js';
import { sakuraRain, burst } from '../fx.js';
import { mascot } from '../mascot.js';
import { actions, esc, confirmDialog, fmtTime } from '../ui.js';
import { go, onLeave } from '../app.js';
import { openStrokeOrder } from './dict.js';
import { openCheckModal } from '../checkpoints.js';
import { showLevelUp } from './quiz.js';

const MODES = {
  full: { name: '本番モード', minutes: 60, count: (c) => CATS[c].exam, desc: '全150問・60分・200点満点。本番と同じ問題数と配点です。' },
  mini: { name: 'ミニ模試', minutes: 20, count: (c) => Math.ceil(CATS[c].exam / 3), desc: '約1/3の44問・20分。すきま時間に実力チェック（200点換算）。' },
};
const PASS = 140;
const KANSUJI = '一二三四五六七八九十';

export function renderExam(root, params = {}) {
  if (params.review != null) return renderExamReview(root, Number(params.review));
  const draft = store.loadExamDraft();
  const exams = store.get().exams;
  const best = exams.length ? Math.max(...exams.map((e) => e.score)) : null;
  root.innerHTML = `
    <header class="page-head">
      <h1>模擬試験</h1>
      <p class="muted">本番と同じ10分野・配点で実力をはかります。合格ラインは <b>200点中140点（70%）</b>。</p>
    </header>
    ${draft ? `
    <div class="card resume-card">
      <div><b>とちゅうの模試があります</b><p class="muted small">${MODES[draft.mode].name}・${Object.keys(draft.answers).length}/${draft.qids.length}問 解答済み・残り ${fmtTime(draft.remaining)}</p></div>
      <div class="row"><button class="btn ghost" data-action="discard">破棄</button><button class="btn primary" data-action="resume">つづける</button></div>
    </div>` : ''}
    <section class="exam-modes">
      ${Object.entries(MODES).map(([id, m]) => `
      <button class="card exam-mode m-${id}" data-action="start" data-mode="${id}">
        <span class="em-time"><b>${m.minutes}</b>分</span>
        <b class="em-name">${m.name}</b>
        <span class="muted small">${m.desc}</span>
        <span class="em-go">はじめる →</span>
      </button>`).join('')}
    </section>
    <section class="card exam-rules">
      <h2>本番の出題構成</h2>
      <table class="rules-table">
        <thead><tr><th>大問</th><th>分野</th><th>問題数</th><th>配点</th></tr></thead>
        <tbody>${CAT_ORDER.map((c, i) => `<tr><td>（${KANSUJI[i]}）</td><td><span class="cat-dot" style="--cat:${CATS[c].color}">${CATS[c].icon}</span>${CATS[c].name}</td><td>${CATS[c].exam}</td><td>${CATS[c].exam * CATS[c].points}点</td></tr>`).join('')}</tbody>
      </table>
      <p class="muted small">※ 手書きの答えは提出後にまとめて自動採点します。本番と同じく、とめ・はね・はらいまでていねいに書きましょう。</p>
    </section>
    ${exams.length ? `
    <section class="card exam-history">
      <h2>これまでの記録 ${best != null ? `<small>ベスト ${best}点</small>` : ''}</h2>
      ${historyChart(exams)}
      <ul class="exam-list">
        ${exams.map((e, i) => ({ e, i })).reverse().map(({ e, i }) => {
          const d = new Date(e.date);
          const wrong = e.detail ? e.detail.filter((x) => x.r !== 1).length : null;
          return `<li>
            <span class="el-date">${d.getMonth() + 1}/${d.getDate()}<small>${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}</small></span>
            <span class="el-mode">${MODES[e.mode]?.name || ''}</span>
            <span class="el-score ${e.score >= PASS ? 'pass' : 'fail'}">${e.score}<small>点</small></span>
            <span class="el-wrong muted small">${wrong != null ? `まちがい ${wrong}問` : ''}</span>
            <button class="btn ${e.detail ? 'primary' : 'ghost'} small" data-action="review" data-i="${i}" ${e.detail ? '' : 'disabled'}>見直す</button>
          </li>`;
        }).join('')}
      </ul>
    </section>` : ''}`;

  actions(root, {
    start: async (t) => {
      if (draft && !(await confirmDialog('とちゅうの模試を破棄して、新しく始めますか？', { ok: '新しく始める', danger: true }))) return;
      sfx.taiko(2);
      runExam(root, newExam(t.dataset.mode));
    },
    resume: () => { sfx.taiko(1); runExam(root, draft); },
    review: (t) => { sfx.tap(); go('exam', { review: t.dataset.i }); },
    discard: async () => {
      if (await confirmDialog('とちゅうの模試を破棄しますか？', { ok: '破棄する', danger: true })) { store.clearExamDraft(); go('exam', { t: Date.now() }); }
    },
  });
}

export function historyChart(exams) {
  const list = exams.slice(-12);
  const W = 560, H = 170, pad = 28;
  const x = (i) => pad + (i * (W - pad * 2)) / Math.max(1, list.length - 1);
  const y = (v) => H - pad - (v / 200) * (H - pad * 2);
  const pts = list.map((e, i) => `${x(i)},${y(e.score)}`).join(' ');
  return `<svg class="hist-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="模試の得点の推移">
    <line x1="${pad}" x2="${W - pad}" y1="${y(PASS)}" y2="${y(PASS)}" class="pass-line"/>
    <text x="${W - pad}" y="${y(PASS) - 6}" class="pass-label" text-anchor="end">合格 140</text>
    ${list.length > 1 ? `<polyline points="${pts}" class="hist-line"/>` : ''}
    ${list.map((e, i) => `<circle cx="${x(i)}" cy="${y(e.score)}" r="6" class="${e.score >= PASS ? 'pass' : 'fail'}"/>
      <text x="${x(i)}" y="${y(e.score) - 11}" text-anchor="middle" class="hist-val">${e.score}</text>
      <text x="${x(i)}" y="${H - 6}" text-anchor="middle" class="hist-date">${new Date(e.date).getMonth() + 1}/${new Date(e.date).getDate()}</text>`).join('')}
  </svg>`;
}

function newExam(mode) {
  const qids = [];
  for (const c of CAT_ORDER) qids.push(...shuffle([...byCat(c)]).slice(0, MODES[mode].count(c)).map((q) => q.id));
  return { mode, qids, answers: {}, idx: 0, remaining: MODES[mode].minutes * 60, started: Date.now() };
}

function runExam(root, ex) {
  document.body.classList.add('fullscreen-mode');
  document.querySelector('.tabbar')?.remove();
  const qs = ex.qids.map((id) => BY_ID[id]).filter(Boolean);
  let ctl = null, timer = null, finished = false;
  const sheet = store.settings().sheetMode !== 'off';

  root.innerHTML = `
  <div class="exam${sheet ? ' answer-sheet' : ''}">
    <header class="exam-top">
      <button class="icon-btn" data-action="pause" aria-label="中断">⏸</button>
      <div class="exam-sec"></div>
      <div class="exam-timer"><span class="clock">⏱</span><b></b></div>
      <button class="btn ghost small" data-action="toc">目次</button>
    </header>
    <div class="qprog"><i></i></div>
    <div class="quiz-body">
      <section class="card qcard">
        <div class="qhead"></div>
        <p class="qguide"></p>
        <div class="qprompt"></div>
      </section>
      <section class="qanswer"></section>
    </div>
    <footer class="qactions">
      <button class="btn ghost" data-action="prev">← もどる</button>
      <button class="btn ghost" data-action="undo">1画もどす</button>
      <span class="exam-num"></span>
      <button class="btn primary big" data-action="next">つぎへ →</button>
    </footer>
    <div class="toc" hidden></div>
  </div>`;
  const $ = (s) => root.querySelector(s);

  const save = () => {
    if (ctl) {
      const a = ctl.getAnswer();
      if (!ctl.isEmpty() || a.pads.some((p) => p.length) || a.text || a.pick != null) ex.answers[ex.idx] = a;
      else delete ex.answers[ex.idx];
    }
    store.saveExamDraft(ex);
  };

  function show() {
    ctl?.destroy();
    const q = qs[ex.idx];
    const c = CATS[q.cat];
    const secNo = CAT_ORDER.indexOf(q.cat);
    const inSec = qs.filter((x) => x.cat === q.cat);
    $('.exam-sec').innerHTML = `<b>（${KANSUJI[secNo]}）${c.name}</b><small>${inSec.indexOf(q) + 1} / ${inSec.length}</small>`;
    $('.qcard').style.setProperty('--cat', c.color);
    $('.qhead').innerHTML = `<span class="cat-chip"><i>${c.icon}</i>${c.name}</span><span class="qstat">${c.points}点</span>`;
    $('.qguide').textContent = guideText(q, sheet);
    $('.qprompt').innerHTML = `${sheet ? `<span class="q-no">(${inSec.indexOf(q) + 1})</span>` : ''}${promptHTML(q, { pick: ex.answers[ex.idx]?.pick })}`;
    $('.qanswer').innerHTML = '';
    ctl = mountAnswer(q, $('.qanswer'), {
      saved: ex.answers[ex.idx], promptEl: $('.qprompt'),
      onRemount: () => { save(); show(); },
      onChange: (auto) => {
        if (auto === true && q.type === 'choice') { save(); setTimeout(() => { if (qs[ex.idx] === q && ex.idx < qs.length - 1) move(1); }, 320); }
      },
    });
    $('[data-action="undo"]').hidden = !ctl.hasPads;
    $('[data-action="prev"]').disabled = ex.idx === 0;
    $('[data-action="next"]').textContent = ex.idx === qs.length - 1 ? '提出する' : 'つぎへ →';
    $('.exam-num').textContent = `${ex.idx + 1} / ${qs.length}`;
    $('.qprog i').style.width = `${(Object.keys(ex.answers).length / qs.length) * 100}%`;
  }
  function move(d) {
    save();
    const n = ex.idx + d;
    if (n < 0) return;
    if (n >= qs.length) { submitExam(); return; }
    ex.idx = n;
    sfx.tap();
    show();
  }
  function tick() {
    ex.remaining--;
    const el = $('.exam-timer b');
    if (!el) return;
    el.textContent = fmtTime(Math.max(0, ex.remaining));
    $('.exam-timer').classList.toggle('warn', ex.remaining <= 300);
    if (ex.remaining <= 10 && ex.remaining > 0) sfx.tick();
    if (ex.remaining % 15 === 0) store.saveExamDraft(ex);
    if (ex.remaining <= 0) { save(); finishExam(); }
  }
  async function submitExam() {
    save();
    const blank = qs.length - Object.keys(ex.answers).length;
    const ok = await confirmDialog(blank ? `まだ <b>${blank}問</b> 答えていません。<br>提出しますか？` : 'すべて答えました。提出しますか？', { ok: '提出する' });
    if (ok) finishExam();
  }
  function toc() {
    save();
    const t = $('.toc');
    t.hidden = false;
    t.innerHTML = `<div class="toc-inner card"><div class="toc-head"><b>目次</b><button class="icon-btn" data-action="tocclose">✕</button></div>
      ${CAT_ORDER.map((c, si) => `<div class="toc-sec"><p>（${KANSUJI[si]}）${CATS[c].name}</p><div class="toc-cells">
        ${qs.map((q, i) => (q.cat === c ? `<button class="toc-cell${ex.answers[i] ? ' done' : ''}${i === ex.idx ? ' cur' : ''}" data-action="jump" data-i="${i}">${qs.filter((x, j) => x.cat === c && j <= i).length}</button>` : '')).join('')}
      </div></div>`).join('')}</div>`;
  }

  async function finishExam() {
    if (finished) return;
    finished = true;
    clearInterval(timer);
    ctl?.destroy();
    ctl = null;
    root.innerHTML = `<div class="grading">${mascot('think', 'bob')}<p class="grading-msg">採点中…</p><div class="qprog big"><i></i></div><p class="muted small grading-sub"></p></div>`;
    const results = new Array(qs.length);
    let done = 0;
    const work = qs.map((q, i) => async () => {
      const a = ex.answers[i];
      if (!a) results[i] = { correct: false, blank: true, chars: [] };
      else {
        try { results[i] = await grade(q, a); } catch { results[i] = { correct: null, chars: [] }; }
      }
      done++;
      const bar = root.querySelector('.grading .qprog i');
      if (bar) bar.style.width = `${(done / qs.length) * 100}%`;
      const sub = root.querySelector('.grading-sub');
      if (sub) sub.textContent = `${done} / ${qs.length}`;
    });
    // 4並列で採点
    const runners = Array.from({ length: 4 }, async () => { while (work.length) await work.shift()(); });
    await Promise.all(runners);
    store.clearExamDraft();
    showExamResult(root, ex, qs, results);
  }

  actions(root, {
    next: () => move(1),
    prev: () => move(-1),
    undo: () => { sfx.tap(); ctl?.undo(); },
    toc: () => { sfx.tap(); toc(); },
    tocclose: () => { $('.toc').hidden = true; },
    jump: (t) => { $('.toc').hidden = true; save(); ex.idx = Number(t.dataset.i); sfx.tap(); show(); },
    pause: async () => {
      save();
      clearInterval(timer);
      if (await confirmDialog('模試を中断しますか？<br><small>あとで「つづける」から再開できます（タイマーも止まります）</small>', { ok: '中断する' })) {
        finished = true;
        go('exam');
      } else timer = setInterval(tick, 1000);
    },
  });
  $('.exam-timer b').textContent = fmtTime(ex.remaining);
  timer = setInterval(tick, 1000);
  show();
  const onHide = () => { if (document.hidden && !finished) save(); };
  document.addEventListener('visibilitychange', onHide);
  onLeave(() => {
    if (!finished) save();
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onHide);
  });
}

// ---------- 見直し用の記録 ----------
const KEEP_INK = 10; // 手書きの線を残す模試の数（容量対策）
const compactInk = (strokes) => strokes?.map((st) => st.map((p) => [Math.round(p[0]), Math.round(p[1])]));

function detailOf(q, a, r) {
  return {
    id: q.id,
    r: r.correct === true ? 1 : r.correct === null ? 2 : 0,
    b: r.blank ? 1 : 0,
    a: a ? { text: a.text || undefined, choice: a.choice ?? undefined, pick: a.pick ?? undefined,
      pads: a.pads?.length ? a.pads.map(compactInk) : undefined, kana: a.kana ? a.kana.map(compactInk) : undefined } : null,
    c: r.chars?.length ? r.chars.map((c) => ({ ch: c.ch, ok: c.correct, src: c.source, cand: (c.candidates || []).slice(0, 4) })) : undefined,
    k: r.kana ? { recognized: r.kana.recognized } : undefined,
  };
}
function resultOf(d) {
  return {
    correct: d.r === 1 ? true : d.r === 2 ? null : false,
    blank: !!d.b,
    chars: (d.c || []).map((c) => ({ ch: c.ch, correct: c.ok, source: c.src, candidates: c.cand || [], offline: null })),
    kana: d.k,
  };
}
function pruneInk(exams) {
  exams.slice(0, Math.max(0, exams.length - KEEP_INK)).forEach((e) => e.detail?.forEach((d) => {
    if (d.a) { delete d.a.pads; delete d.a.kana; }
  }));
}

function calcScore(qs, results) {
  const sec = {};
  let raw = 0, max = 0;
  qs.forEach((q, i) => {
    const p = CATS[q.cat].points;
    const s = (sec[q.cat] ||= { got: 0, max: 0, n: 0, c: 0 });
    s.max += p; s.n++; max += p;
    if (results[i].correct === true) { s.got += p; s.c++; raw += p; }
  });
  return { sec, score: Math.round((raw * 200) / max) };
}

/** 1問分の答え合わせ */
function reviewItemHTML(q, i, r, a) {
  const ink = a && r.chars?.length ? inkCompareHTML(q, a, r) : '';
  const kana = a ? kanaCompareHTML(a, r) : '';
  const canFlip = !!(a && (r.chars?.length || a.kana?.some((b) => b?.length)));
  return `<div class="rv-item ${r.correct === true ? 'ok' : 'ng'}">
    <span class="rv-mark">${r.correct === true ? '○' : r.correct === null ? '？' : '×'}</span>
    <div class="rv-body">
      <p class="rv-cat">${CATS[q.cat].name}${r.blank ? '・無回答' : ''}</p>
      <p class="answer-line">${answerHTML(q)}</p>
      ${ink}${kana}
      ${a && !ink && !kana && !r.blank ? `<p class="your-ans">あなたの答え：${esc(userAnswerText(q, a, r))}</p>` : ''}
    </div>
    <div class="rv-btns">
      ${a?.pads?.some((p) => p?.length) ? `<button class="mini-btn" data-action="check" data-i="${i}">とめ・はね・はらい</button>` : ''}
      ${canFlip ? `<button class="mini-btn" data-action="flip" data-i="${i}">判定を修正</button>` : ''}
    </div>
  </div>`;
}

/** 分野別の得点と答え合わせ（結果画面・見直し画面で共通） */
function sectionsHTML(sec, withPractice = true) {
  return `<section class="card er-sections">
    <h2>分野別の得点</h2>
    ${CAT_ORDER.map((c, i) => {
      const s = sec[c];
      if (!s) return '';
      const r = s.got / s.max;
      return `<div class="sec-row">
        <span class="sec-name"><span class="cat-dot" style="--cat:${CATS[c].color}">${CATS[c].icon}</span>（${KANSUJI[i]}）${CATS[c].name}</span>
        <span class="sec-bar"><i style="width:${r * 100}%;background:${r >= 0.7 ? 'var(--matcha)' : r >= 0.5 ? 'var(--yamabuki)' : 'var(--shu)'}"></i></span>
        <span class="sec-val">${s.c}/${s.n}問</span>
        ${withPractice && r < 0.7 ? `<button class="mini-btn" data-action="practice" data-cat="${c}">練習</button>` : '<span></span>'}
      </div>`;
    }).join('')}
  </section>`;
}

function reviewListHTML(qs, results, answers, filter) {
  const items = qs.map((q, i) => {
    const r = results[i];
    if (filter === 'wrong' && r.correct === true) return '';
    if (filter === 'ink' && !answers[i]?.pads?.some((p) => p?.length)) return '';
    return reviewItemHTML(q, i, r, answers[i]);
  }).join('');
  return items || '<p class="muted">まちがえた問題はありません！</p>';
}

function reviewCardHTML(qs, results, answers, filter) {
  const wrong = results.filter((r) => r.correct !== true).length;
  const ink = answers.filter((a) => a?.pads?.some((p) => p?.length)).length;
  return `<section class="card er-review">
    <div class="er-review-head">
      <h2>答え合わせ</h2>
      <div class="filters">
        <button class="chip ${filter === 'wrong' ? 'on' : ''}" data-action="rvfilter" data-f="wrong">まちがい <small>${wrong}</small></button>
        <button class="chip ${filter === 'ink' ? 'on' : ''}" data-action="rvfilter" data-f="ink">✍️ 手書き <small>${ink}</small></button>
        <button class="chip ${filter === 'all' ? 'on' : ''}" data-action="rvfilter" data-f="all">すべて <small>${qs.length}</small></button>
      </div>
    </div>
    <p class="muted small">手書きの判定がおかしいときは「判定を修正」で直せます（得点も直ります）。
      「✍️ 手書き」では、正解した字も「とめ・はね・はらい」をチェックできます。</p>
    <div class="rv-list">${reviewListHTML(qs, results, answers, filter)}</div>
  </section>`;
}

function showExamResult(root, ex, qs, results) {
  const mode = MODES[ex.mode];
  const t = Date.now();
  const snapshot = {};
  const startLv = levelInfo().level;
  qs.forEach((q) => { snapshot[q.id] = store.get().items[q.id]; });
  const answers = qs.map((_, i) => ex.answers[i] || null);
  let filter = 'wrong';

  // 記録（SRS・日別・XP・見直し用の詳細）
  let { score } = calcScore(qs, results);
  const recIdx = store.get().exams.length;
  const xp = Math.round(score / 2);
  store.update((s) => {
    const day = (s.days[store.dayKey()] ||= { n: 0, c: 0, xp: 0 });
    qs.forEach((q, i) => {
      if (results[i].blank) return;
      s.items[q.id] = { ...review(snapshot[q.id], results[i].correct === true, t), star: snapshot[q.id]?.star };
      day.n++;
      if (results[i].correct === true) day.c++;
    });
    day.xp += xp;
    s.xp += xp;
    s.exams.push({
      date: t, mode: ex.mode, score, sections: calcScore(qs, results).sec,
      time: MODES[ex.mode].minutes * 60 - Math.max(0, ex.remaining),
      detail: qs.map((q, i) => detailOf(q, answers[i], results[i])),
    });
    pruneInk(s.exams);
  });
  checkBadges({ exam: score });

  const render = (animate) => {
    const { sec, score: sc } = calcScore(qs, results);
    score = sc;
    const pass = sc >= PASS;
    root.innerHTML = `
    <div class="exam-result">
      <div class="er-hero ${pass ? 'pass' : 'fail'}">
        <div class="er-mascot">${mascot(pass ? 'cheer' : 'sad', 'bob')}</div>
        <div class="er-score">
          <p class="er-mode">${mode.name}${ex.mode === 'mini' ? '（200点換算）' : ''}</p>
          <p class="er-num"><b data-count="${sc}">${animate ? 0 : sc}</b><small>/ 200</small></p>
          <div class="er-bar"><i style="width:${(sc / 200) * 100}%"></i><span class="er-line" style="left:${(PASS / 200) * 100}%"><em>合格 140</em></span></div>
          <p class="er-msg">${pass ? '合格ラインをこえました！この調子！' : `合格まで あと <b>${PASS - sc}</b> 点！苦手分野を練習しよう`}</p>
        </div>
        <div class="hanko ${pass ? 'pass' : 'fail'}"><span>${pass ? '合格' : '再挑戦'}</span></div>
      </div>
      ${sectionsHTML(sec)}
      ${reviewCardHTML(qs, results, answers, filter)}
      <div class="result-actions">
        ${results.some((r) => r.correct !== true) ? '<button class="btn primary big" data-action="drill">まちがえた問題を練習する</button>' : ''}
        <button class="btn ghost big" data-action="again">模試のページへ</button>
        <button class="btn ghost big" data-action="home">ホームへ</button>
      </div>
      <p class="muted small center">この答え合わせは「模試」ページの「これまでの記録」からいつでも見直せます。</p>
    </div>`;
    if (animate) {
      const b = root.querySelector('[data-count]');
      const target = Number(b.dataset.count);
      const t0 = performance.now();
      const step = (now) => {
        const k = Math.min(1, (now - t0) / 1400);
        b.textContent = Math.round(target * (1 - Math.pow(1 - k, 3)));
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
  };
  render(true);
  const pass = score >= PASS;
  setTimeout(() => {
    if (pass) { sfx.pass(); sakuraRain(90); setTimeout(() => burst({ count: 80 }), 900); } else sfx.fail();
  }, 1300);
  const lv = levelInfo();
  if (lv.level > startLv) setTimeout(() => showLevelUp(lv), 3200);

  actions(root, {
    flip: (tEl) => {
      const i = Number(tEl.dataset.i);
      results[i].correct = results[i].correct !== true;
      const q = qs[i];
      store.update((s) => {
        s.items[q.id] = { ...review(snapshot[q.id], results[i].correct, t), star: snapshot[q.id]?.star };
        const rec = s.exams[recIdx];
        const c = calcScore(qs, results);
        if (rec) { rec.score = c.score; rec.sections = c.sec; rec.detail[i].r = results[i].correct ? 1 : 0; }
      });
      sfx.select();
      render(false);
      checkBadges({ exam: calcScore(qs, results).score });
    },
    rvfilter: (tEl) => { sfx.tap(); filter = tEl.dataset.f; render(false); },
    check: (tEl) => {
      const i = Number(tEl.dataset.i);
      openCheckModal(qs[i], answers[i], { correct: results[i].correct === true, onNG: () => root._actions.flip({ dataset: { i: String(i) } }) });
    },
    order: (tEl) => openStrokeOrder(tEl.dataset.ch),
    practice: (tEl) => go('quiz', { mode: 'cat', cat: tEl.dataset.cat }),
    drill: () => go('quiz', { mode: 'ids', t: Date.now() }, { ids: qs.filter((_, i) => results[i].correct !== true).map((q) => q.id) }),
    again: () => go('exam', { t: Date.now() }),
    home: () => go('home'),
  });
}

/** 過去の模試の見直し */
function renderExamReview(root, idx) {
  const rec = store.get().exams[idx];
  if (!rec?.detail) {
    root.innerHTML = `<div class="empty-state">${mascot('think')}<p>この模試は見直し用の記録がありません。<br><small class="muted">（見直し機能を追加する前に受けた模試です）</small></p><button class="btn primary" data-action="back">もどる</button></div>`;
    actions(root, { back: () => go('exam') });
    return;
  }
  const rows = rec.detail.map((d) => ({ q: BY_ID[d.id], d })).filter((x) => x.q);
  const qs = rows.map((x) => x.q);
  const results = rows.map((x) => resultOf(x.d));
  const answers = rows.map((x) => x.d.a);
  let filter = 'wrong';
  const hasInk = answers.some((a) => a?.pads || a?.kana);

  const render = () => {
    const { sec, score } = calcScore(qs, results);
    const d = new Date(rec.date);
    root.innerHTML = `
    <header class="page-head review-head">
      <button class="icon-btn" data-action="back" aria-label="もどる">←</button>
      <div>
        <h1>模試の見直し</h1>
        <p class="muted">${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}・${MODES[rec.mode]?.name || ''}
          ・<b class="${score >= PASS ? 'pass-text' : 'fail-text'}">${score}点</b>（${score >= PASS ? '合格' : '不合格'}）</p>
      </div>
    </header>
    <div class="exam-result">
      ${sectionsHTML(sec)}
      ${!hasInk ? '<p class="muted small">※ 古い記録のため、手書きの字は残っていません（最新の10回分を保存しています）。</p>' : ''}
      ${reviewCardHTML(qs, results, answers, filter)}
      <div class="result-actions">
        ${results.some((r) => r.correct !== true) ? '<button class="btn primary big" data-action="drill">まちがえた問題を練習する</button>' : ''}
        <button class="btn ghost big" data-action="back">模試のページへ</button>
      </div>
    </div>`;
  };
  render();
  actions(root, {
    back: () => go('exam'),
    rvfilter: (t) => { sfx.tap(); filter = t.dataset.f; render(); },
    check: (t) => {
      const i = Number(t.dataset.i);
      openCheckModal(qs[i], answers[i], { correct: results[i].correct === true, onNG: () => root._actions.flip({ dataset: { i: String(i) } }) });
    },
    flip: (t) => {
      const i = Number(t.dataset.i);
      results[i].correct = results[i].correct !== true;
      store.update((s) => {
        const r = s.exams[idx];
        const c = calcScore(qs, results);
        r.score = c.score; r.sections = c.sec; r.detail[i].r = results[i].correct ? 1 : 0;
      });
      sfx.select();
      render();
    },
    order: (t) => openStrokeOrder(t.dataset.ch),
    practice: (t) => go('quiz', { mode: 'cat', cat: t.dataset.cat }),
    drill: () => go('quiz', { mode: 'ids', t: Date.now() }, { ids: qs.filter((_, i) => results[i].correct !== true).map((q) => q.id) }),
  });
}
