// 練習セッション
import * as store from '../store.js';
import { QUESTIONS, CATS, byCat, BY_ID } from '../bank.js';
import { pickQuestions, review, status, weakness, shuffle, STATUS_LABEL } from '../srs.js';
import { mountAnswer, promptHTML, guideText, grade, answerHTML, inkCompareHTML, kanaCompareHTML, kanjiChips, speechText, userAnswerText } from '../question.js';
import { levelInfo, xpForAnswer, checkBadges } from '../game.js';
import { sfx } from '../sound.js';
import { burst, floatText, shake, HANAMARU_SVG, BATSU_SVG } from '../fx.js';
import { mascot } from '../mascot.js';
import { actions, esc, modal, ring, speak, confirmDialog, fmtTime } from '../ui.js';
import { go, takeTransient } from '../app.js';
import { openKanji, openStrokeOrder } from './dict.js';
import { checkPanelHTML, bindCheckToggles } from '../checkpoints.js';

function buildQueue(params) {
  const s = store.get();
  const size = s.settings.sessionSize;
  const opt = { newRatio: s.settings.newRatio };
  switch (params.mode) {
    case 'cat': return { title: CATS[params.cat].name, qs: pickQuestions(byCat(params.cat), s.items, size, opt) };
    case 'weak': {
      const weak = QUESTIONS.filter((q) => s.items[q.id]?.n && (status(s.items[q.id]) === 'weak' || s.items[q.id].w > 0))
        .sort((a, b) => weakness(s.items[b.id]) - weakness(s.items[a.id]));
      return { title: '苦手克服', qs: shuffle(weak.slice(0, size)) };
    }
    case 'kanji': {
      const pool = QUESTIONS.filter((q) => q.kanji?.includes(params.k));
      return { title: `「${params.k}」の問題`, qs: pickQuestions(pool, s.items, Math.min(size, pool.length), { newRatio: 1 }) };
    }
    case 'ids': {
      const ids = takeTransient()?.ids || [];
      return { title: 'まちがえた問題', qs: shuffle(ids.map((id) => BY_ID[id]).filter(Boolean)) };
    }
    default: return { title: 'おまかせ学習', qs: pickQuestions(QUESTIONS, s.items, size, opt) };
  }
}

export function renderQuiz(root, params) {
  const { title, qs } = buildQueue(params);
  if (!qs.length) {
    root.innerHTML = `<div class="empty-state">${mascot('think')}<p>出題できる問題がありません。</p><button class="btn primary" data-action="home">ホームへ</button></div>`;
    actions(root, { home: () => go('home') });
    return;
  }
  const queue = qs.map((q) => ({ q, retry: false }));
  const log = [];          // 初回の解答結果
  let idx = 0, combo = 0, maxCombo = 0, xpGained = 0;
  let ctl = null, pending = null, busy = false;
  const startLv = levelInfo().level;
  const t0 = Date.now();
  const sheetMode = store.settings().sheetMode === 'all';

  root.innerHTML = `
  <div class="quiz${sheetMode ? ' answer-sheet' : ''}">
    <header class="quiz-top">
      <button class="icon-btn" data-action="quit" aria-label="やめる">✕</button>
      <div class="quiz-title">${esc(title)}</div>
      <div class="qprog" role="progressbar"><i></i></div>
      <span class="qcount"></span>
      <span class="combo" aria-live="polite"></span>
    </header>
    <div class="quiz-body">
      <section class="card qcard">
        <div class="qhead"></div>
        <p class="qguide"></p>
        <div class="qprompt"></div>
        <div class="stamp-layer" aria-hidden="true"></div>
      </section>
      <section class="qanswer"></section>
    </div>
    <footer class="qactions">
      <button class="btn ghost" data-action="giveup">わからない</button>
      <button class="btn ghost" data-action="undo" hidden>1画もどす</button>
      <button class="btn ghost" data-action="clear" hidden>全部けす</button>
      <button class="btn primary big" data-action="submit" disabled>こたえる</button>
    </footer>
    <div class="sheet" hidden></div>
  </div>`;
  const $ = (s) => root.querySelector(s);
  const card = $('.qcard'), sheet = $('.sheet');

  function updateTop() {
    const done = Math.min(idx, queue.length);
    $('.qprog i').style.width = `${(done / queue.length) * 100}%`;
    $('.qcount').textContent = `${Math.min(idx + 1, queue.length)} / ${queue.length}`;
    const cb = $('.combo');
    cb.innerHTML = combo >= 2 ? `<span class="combo-n">${combo}</span><small>COMBO</small>` : '';
    cb.classList.toggle('hot', combo >= 5);
  }

  function show() {
    ctl?.destroy();
    pending = null;
    busy = false;
    sheet.hidden = true;
    sheet.className = 'sheet';
    root.querySelector('.quiz').classList.remove('answered');
    const { q, retry } = queue[idx];
    const st = store.get().items[q.id];
    const stat = retry ? 'retry' : status(st);
    const c = CATS[q.cat];
    card.style.setProperty('--cat', c.color);
    card.classList.remove('enter'); void card.offsetWidth; card.classList.add('enter');
    $('.qhead').innerHTML = `
      <span class="cat-chip"><i>${c.icon}</i>${c.name}</span>
      <span class="qstat s-${stat}">${retry ? 'もう一度！' : STATUS_LABEL[stat]}</span>`;
    $('.qguide').textContent = guideText(q, sheetMode);
    $('.qprompt').innerHTML = `${sheetMode ? `<span class="q-no">(${idx + 1})</span>` : ''}${promptHTML(q)}`;
    $('.stamp-layer').innerHTML = '';
    const ans = $('.qanswer');
    ans.innerHTML = '';
    ctl = mountAnswer(q, ans, {
      promptEl: $('.qprompt'),
      onChange: (auto) => {
        $('[data-action="submit"]').disabled = ctl.isEmpty();
        if (auto === true && q.type === 'choice') submit();
      },
    });
    $('[data-action="undo"]').hidden = !ctl.hasPads;
    $('[data-action="clear"]').hidden = !ctl.hasPads;
    $('[data-action="submit"]').hidden = q.type === 'choice';
    $('[data-action="submit"]').disabled = true;
    updateTop();
  }

  async function submit() {
    if (busy || pending || !ctl || ctl.isEmpty()) return;
    busy = true;
    ctl.lock();
    const { q } = queue[idx];
    const ans = ctl.getAnswer();
    const btn = $('[data-action="submit"]');
    if (ctl.hasPads) { btn.classList.add('loading'); btn.textContent = '判定中…'; }
    let res;
    try { res = await grade(q, ans); } catch (e) { console.error(e); res = { correct: null, chars: [] }; }
    btn.classList.remove('loading'); btn.textContent = 'こたえる';
    if (res.correct === null) selfJudge(q, ans, res);
    else resolve(res.correct, ans, res);
  }

  function selfJudge(q, ans, res) {
    sheet.hidden = false;
    sheet.className = 'sheet self in';
    sheet.innerHTML = `
      <div class="sheet-inner">
        <p class="sheet-title">自分で答え合わせしよう</p>
        <p class="muted small">自動判定が使えないため、お手本と見比べて判定してください。</p>
        <p class="answer-line">${answerHTML(q)}</p>
        ${inkCompareHTML(q, ans, res)}
        ${kanaCompareHTML(ans, res)}
        <div class="self-btns">
          <button class="btn ok big" data-action="self" data-v="1">○ 書けた</button>
          <button class="btn ng big" data-action="self" data-v="0">× まちがえた</button>
        </div>
      </div>`;
    pending = { self: true, q, ans, res };
  }

  function resolve(correct, ans, res) {
    const { q, retry } = queue[idx];
    root.querySelector('.quiz').classList.add('answered');
    const prev = combo;
    if (correct) { combo++; maxCombo = Math.max(maxCombo, combo); } else combo = 0;
    const xp = retry ? (correct ? 3 : 0) : xpForAnswer(correct, combo - 1);
    pending = { q, ans, res, correct, retry, xp, combo, prev };
    // 演出
    const layer = $('.stamp-layer');
    layer.innerHTML = correct ? HANAMARU_SVG : BATSU_SVG;
    if (correct) {
      sfx.correct(combo - 1);
      setTimeout(() => sfx.stamp(), 60);
      if (combo >= 3 && combo % 5 === 0) { setTimeout(() => sfx.combo(combo), 250); burst({ count: 60, kind: 'confetti', y: innerHeight * 0.3 }); }
      else burst({ count: 18, kind: 'sakura', y: card.getBoundingClientRect().top + 80, spread: 0.6 });
      if (xp) setTimeout(() => { floatText(`+${xp} XP`, $('.qcount'), 'xp'); sfx.xp(); }, 350);
    } else {
      sfx.wrong();
      shake(card);
    }
    ctl?.pads.forEach((p, i) => p.mark(res.chars?.[i]?.correct === false ? 'ng' : res.chars?.[i]?.correct ? 'ok' : ''));
    if (q.type === 'choice') {
      $('.qanswer').querySelectorAll('.choice').forEach((b) => {
        if (b.dataset.v === q.answer) b.classList.add('right');
        else if (b.dataset.v === ans.choice) b.classList.add('wrong');
      });
    }
    renderSheet();
    updateTop();
    if (store.settings().speech) speak(speechText(q));
  }

  function renderSheet() {
    const { q, ans, res, correct } = pending;
    const starred = store.get().items[q.id]?.star;
    const canFlip = !!(ctl?.hasPads);
    sheet.hidden = false;
    sheet.className = `sheet in ${correct ? 'is-ok' : 'is-ng'}`;
    sheet.innerHTML = `
      <div class="sheet-inner">
        <div class="sheet-head">
          <span class="verdict">${correct ? (pending.combo >= 3 ? `すばらしい！ ${pending.combo}連続` : 'せいかい！') : 'ざんねん…'}</span>
          <span class="sheet-tools">
            <button class="mini-btn" data-action="speak" aria-label="読み上げ">🔊</button>
            <button class="mini-btn ${starred ? 'on' : ''}" data-action="star" aria-label="苦手ノート">${starred ? '★' : '☆'} ノート</button>
          </span>
        </div>
        <p class="answer-line">${answerHTML(q)}</p>
        ${!correct && q.type !== 'choice' && !ctl?.hasPads ? `<p class="your-ans">あなたの答え：${esc(userAnswerText(q, ans, res))}</p>` : ''}
        ${sheetMode && ans.pads?.some((p) => p.length) ? checkPanelHTML(q, ans, { correct }) + orderLinks(res) : inkCompareHTML(q, ans, res)}
        ${kanaCompareHTML(ans, res)}
        ${pending.checkedNG ? '<p class="check-ng-note">本番では×になるので、もう一度練習しよう。少しあとでまた出題します。</p>' : ''}
        ${kanjiChips(q)}
        <div class="sheet-actions">
          ${canFlip ? `<button class="btn ghost small" data-action="flip">${correct ? '判定を× に修正' : '正しく書けていた（○に修正）'}</button>` : '<span></span>'}
          <button class="btn primary big" data-action="next">${idx + 1 >= queue.length && (correct || pending.retry) ? '結果を見る' : 'つぎへ'} →</button>
        </div>
      </div>`;
  }

  // 答案用紙モード：認識結果と書き順ボタンだけを小さく出す
  function orderLinks(res) {
    if (!res?.chars?.length) return '';
    return `<div class="check-extra">${res.chars.map((r) => `
      <button type="button" class="mini-btn" data-action="order" data-ch="${esc(r.ch)}">「${esc(r.ch)}」の書き順</button>
      ${r.source === 'google' && r.candidates?.length ? `<span class="ink-note">認識：${r.candidates.slice(0, 3).map(esc).join(' ')}</span>` : ''}`).join('')}</div>`;
  }

  function commit() {
    const p = pending;
    if (!p || p.self) return;
    store.update((s) => {
      const day = (s.days[store.dayKey()] ||= { n: 0, c: 0, xp: 0 });
      if (!p.retry) {
        s.items[p.q.id] = { ...review(s.items[p.q.id], p.correct), star: s.items[p.q.id]?.star };
        day.n++;
        if (p.correct) day.c++;
      }
      day.xp += p.xp;
      s.xp += p.xp;
      s.bestCombo = Math.max(s.bestCombo || 0, maxCombo);
    });
    xpGained += p.xp;
    if (!p.retry) log.push({ id: p.q.id, correct: p.correct });
    // まちがえた問題は少しあとでもう一度出す
    if (!p.correct && !p.retry) {
      const at = Math.min(queue.length, idx + 3);
      queue.splice(at, 0, { q: p.q, retry: true });
    }
    checkBadges({ combo });
  }

  function next() {
    commit();
    idx++;
    const lv = levelInfo();
    if (idx >= queue.length) return finish(lv.level > startLv ? lv : null);
    show();
  }

  function finish(levelUp) {
    ctl?.destroy();
    ctl = null;
    const n = log.length, c = log.filter((l) => l.correct).length;
    const rate = n ? c / n : 0;
    const perfect = n >= 5 && c === n;
    checkBadges({ perfect, combo: maxCombo });
    const wrong = log.filter((l) => !l.correct).map((l) => BY_ID[l.id]);
    const [stampText, mood] = rate >= 0.9 ? ['たいへん<br>よく<br>できました', 'happy'] : rate >= 0.7 ? ['よく<br>できました', 'happy'] : rate >= 0.4 ? ['がんばり<br>ました', 'normal'] : ['つぎは<br>できる！', 'sad'];
    const sec = Math.round((Date.now() - t0) / 1000);
    root.innerHTML = `
    <div class="result">
      <div class="result-hero">
        <div class="result-mascot">${mascot(mood, 'bob')}</div>
        <div class="big-stamp ${rate >= 0.7 ? 'good' : ''}"><span>${stampText}</span></div>
      </div>
      <div class="card result-card">
        ${ring(rate, { size: 150, stroke: 14, label: `${c}<small>/${n}</small>`, sub: '正解', color: rate >= 0.7 ? 'var(--matcha)' : 'var(--shu)' })}
        <ul class="result-stats">
          <li><b>+${xpGained}</b><span>XP</span></li>
          <li><b>${maxCombo}</b><span>最大コンボ</span></li>
          <li><b>${fmtTime(sec)}</b><span>タイム</span></li>
          <li><b>${Math.round(rate * 100)}%</b><span>正答率</span></li>
        </ul>
      </div>
      ${wrong.length ? `
      <div class="card wrong-list">
        <h2>まちがえた問題 <small>（忘却曲線にあわせて、また出題されます）</small></h2>
        <ul>${wrong.map((q) => `<li><span class="cat-dot" style="--cat:${CATS[q.cat].color}">${CATS[q.cat].icon}</span><span class="wl-ans">${answerHTML(q)}</span></li>`).join('')}</ul>
      </div>` : ''}
      <div class="result-actions">
        ${wrong.length ? '<button class="btn primary big" data-action="retry">まちがえた問題をもう一度</button>' : ''}
        <button class="btn ${wrong.length ? 'ghost' : 'primary'} big" data-action="again">つづけて${esc(title === 'まちがえた問題' ? 'おまかせ学習' : title)}</button>
        <button class="btn ghost big" data-action="home">ホームへ</button>
      </div>
    </div>`;
    sfx.finish();
    if (rate >= 0.7) setTimeout(() => burst({ count: 90, kind: rate >= 0.9 ? 'confetti' : 'sakura' }), 300);
    if (levelUp) setTimeout(() => showLevelUp(levelUp), 900);
    actions(root, {
      retry: () => go('quiz', { mode: 'ids', t: Date.now() }, { ids: wrong.map((q) => q.id) }),
      again: () => go('quiz', params.mode === 'ids' ? { mode: 'auto' } : { ...params, t: Date.now() }),
      home: () => go('home'),
    });
  }

  actions(root, {
    quit: async () => {
      sfx.tap();
      if (log.length === 0 || await confirmDialog('練習を終了しますか？<br><small>ここまでの結果は記録されます</small>', { ok: '終了する' })) {
        if (pending && !pending.self) commit();
        go('home');
      }
    },
    submit: () => submit(),
    giveup: () => {
      if (pending || busy) return;
      sfx.tap();
      ctl.lock();
      resolve(false, ctl.getAnswer(), { correct: false, chars: [] });
    },
    undo: () => { sfx.tap(); ctl?.undo(); $('[data-action="submit"]').disabled = ctl.isEmpty(); },
    clear: () => { sfx.tap(); ctl?.clear(); $('[data-action="submit"]').disabled = true; },
    next: () => { sfx.tap(); next(); },
    self: (t) => {
      const { ans, res } = pending;
      pending = null;
      resolve(t.dataset.v === '1', ans, res);
    },
    flip: () => {
      // 手書き判定の修正（認識ミスの救済）
      const p = pending;
      p.checkedNG = false;
      p.correct = !p.correct;
      combo = p.correct ? p.prev + 1 : 0;
      maxCombo = Math.max(maxCombo, combo);
      p.combo = combo;
      p.xp = p.retry ? (p.correct ? 3 : 0) : xpForAnswer(p.correct, Math.max(0, combo - 1));
      $('.stamp-layer').innerHTML = p.correct ? HANAMARU_SVG : BATSU_SVG;
      p.correct ? sfx.correct(0) : sfx.wrong();
      renderSheet();
      updateTop();
    },
    'chk-ng': () => {
      // とめ・はね・はらいに直すところがあった → 本番と同じく×にする
      if (!pending?.correct) return;
      root._actions.flip();
      pending.checkedNG = true;
      renderSheet();
    },
    speak: () => speak(speechText(pending.q)),
    star: () => {
      const id = pending.q.id;
      store.update((s) => { if (s.items[id]) s.items[id].star = !s.items[id].star; else s.items[id] = { n: 0, c: 0, w: 0, s: 0, d: 5, last: 0, due: 0, streak: 0, h: '', star: true }; });
      sfx.select();
      renderSheet();
    },
    order: (t) => openStrokeOrder(t.dataset.ch),
    kanji: (t) => openKanji(t.dataset.k),
  });

  const onKey = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (pending && !pending.self) next(); else submit();
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'z') ctl?.undo();
  };
  addEventListener('keydown', onKey);
  bindCheckToggles(root);
  show();
  return () => { removeEventListener('keydown', onKey); ctl?.destroy(); };
}

export function showLevelUp(lv) {
  sfx.levelup();
  burst({ count: 120, kind: 'confetti' });
  modal(`
    <div class="levelup">
      <div class="lu-rays" aria-hidden="true"></div>
      ${mascot('cheer', 'bob')}
      <p class="lu-label">LEVEL UP!</p>
      <p class="lu-level">Lv.<b>${lv.level}</b></p>
      <p class="lu-title">称号「${lv.title}」</p>
      <button class="btn primary big" data-close>やったね！</button>
    </div>`, { cls: 'modal-levelup' });
}
