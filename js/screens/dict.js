// 漢字辞典・書き順・なぞり書き
import * as store from '../store.js';
import { QUESTIONS } from '../bank.js';
import { status } from '../srs.js';
import { KANJI4 } from '../../data/kanji.js';
import { strokeOrderView } from '../strokeanim.js';
import { Pad, UNIT } from '../pad.js';
import { refStrokes } from '../strokes.js';
import { resample, offlineMatch } from '../recognizer.js';
import { actions, esc, modal, toast } from '../ui.js';
import { sfx } from '../sound.js';
import { burst, floatText } from '../fx.js';
import { go } from '../app.js';
import { toHiragana } from '../kanapad.js';
import { checkBadges } from '../game.js';

const BY_K = Object.fromEntries(KANJI4.map((k) => [k.k, k]));
const MASTERY_LABEL = { new: '未学習', learning: '学習中', good: '習得', weak: '苦手' };

/** 漢字ごとの習熟度（その漢字を含む問題の成績から計算） */
export function kanjiMastery(items = store.get().items) {
  const acc = {};
  for (const q of QUESTIONS) {
    for (const k of q.kanji || []) {
      if (!BY_K[k]) continue;
      const a = (acc[k] ||= { total: 0, learned: 0, good: 0, weak: 0 });
      a.total++;
      const st = items[q.id];
      if (!st?.n) continue;
      a.learned++;
      const s = status(st);
      if (s === 'weak') a.weak++;
      if (s === 'mastered' || s === 'review') a.good++;
    }
  }
  const out = {};
  for (const k of KANJI4) {
    const a = acc[k.k] || { total: 0, learned: 0, good: 0, weak: 0 };
    let m = 'new';
    if (a.weak) m = 'weak';
    else if (a.learned && a.good / Math.max(1, a.total) >= 0.6) m = 'good';
    else if (a.learned) m = 'learning';
    out[k.k] = { ...a, m };
  }
  return out;
}

export function renderDict(root) {
  const mastery = kanjiMastery();
  const counts = { all: KANJI4.length, new: 0, learning: 0, good: 0, weak: 0 };
  Object.values(mastery).forEach((m) => counts[m.m]++);
  let filter = 'all', query = '';
  root.innerHTML = `
    <header class="page-head">
      <h1>漢字辞典 <small>4級配当漢字 ${KANJI4.length}字</small></h1>
      <p class="muted">タップすると書き順アニメ・読み・部首が見られます。色は習熟度です。</p>
    </header>
    <div class="dict-tools">
      <input class="search" type="search" placeholder="漢字や読みでさがす（例：あく、にぎる）" autocomplete="off">
      <div class="filters">
        ${['all', 'new', 'learning', 'good', 'weak'].map((f) => `<button class="chip f-${f}${f === 'all' ? ' on' : ''}" data-action="filter" data-f="${f}">${f === 'all' ? 'すべて' : MASTERY_LABEL[f]}<small>${counts[f]}</small></button>`).join('')}
      </div>
    </div>
    <div class="kanji-grid"></div>
    <p class="muted small credit">書き順データ：<a href="https://kanjivg.tagaini.net/" target="_blank" rel="noopener">KanjiVG</a>（CC BY-SA 3.0）</p>`;
  const grid = root.querySelector('.kanji-grid');
  const draw = () => {
    const q = toHiragana(query.trim());
    const list = KANJI4.filter((k) => {
      if (filter !== 'all' && mastery[k.k].m !== filter) return false;
      if (!q) return true;
      return k.k === q || [...k.on, ...k.kun].some((r) => toHiragana(r).replace(/[-()]/g, '').startsWith(q.replace(/-/g, '')));
    });
    grid.innerHTML = list.length ? list.map((k) => `
      <button class="ktile m-${mastery[k.k].m}${store.get().traced[k.k] ? ' traced' : ''}" data-action="open" data-k="${k.k}">
        <b>${k.k}</b><small>${k.s}画</small>
      </button>`).join('') : '<p class="muted">見つかりませんでした</p>';
  };
  draw();
  root.querySelector('.search').addEventListener('input', (e) => { query = e.target.value; draw(); });
  actions(root, {
    filter: (t) => {
      sfx.tap();
      filter = t.dataset.f;
      root.querySelectorAll('.filters .chip').forEach((c) => c.classList.toggle('on', c === t));
      draw();
    },
    open: (t) => { sfx.tap(); openKanji(t.dataset.k, () => draw()); },
  });
}

function relatedWords(k) {
  const words = new Map();
  for (const q of QUESTIONS) {
    if (!q.kanji?.includes(k)) continue;
    let w = q.word, r = '';
    if (q.cat === 'yomi') r = q.answers[0];
    if (q.cat === 'kaki') r = toHiragana(q.text.match(/\[(.+?)\]/)[1]);
    if (w && w.length >= 2 && w.includes(k) && !words.has(w)) words.set(w, r);
  }
  return [...words].slice(0, 12);
}

export function openKanji(k, onClose) {
  const d = BY_K[k];
  if (!d) return openStrokeOrder(k);
  store.update((s) => { s.kanjiSeen[k] = Date.now(); });
  const m = kanjiMastery()[k];
  const qn = QUESTIONS.filter((q) => q.kanji?.includes(k)).length;
  const view = strokeOrderView(k, { size: 230 });
  const words = relatedWords(k);
  const md = modal(`
    <div class="kanji-detail">
      <button class="icon-btn modal-x" data-close aria-label="閉じる">✕</button>
      <div class="kd-anim"></div>
      <div class="kd-info">
        <div class="kd-head"><span class="kd-k">${esc(k)}</span><span class="mbadge m-${m.m}">${MASTERY_LABEL[m.m]}</span></div>
        <dl class="kd-dl">
          <dt>音読み</dt><dd>${d.on.length ? d.on.map(esc).join('・') : '－'}</dd>
          <dt>訓読み</dt><dd>${d.kun.length ? d.kun.map((r) => esc(r).replace(/-(.+)$/, '<span class="okuri">$1</span>')).join('・') : '－'}</dd>
          <dt>部首</dt><dd><b class="kd-rad">${esc(d.rf || d.r)}</b>${d.rf ? `<small>（${esc(d.r)}）</small>` : ''}</dd>
          <dt>画数</dt><dd>${d.s}画</dd>
        </dl>
        ${words.length ? `<div class="kd-words"><p class="muted small">この漢字を使う言葉</p>${words.map(([w, r]) => `<span class="word">${esc(w)}${r ? `<small>${esc(r)}</small>` : ''}</span>`).join('')}</div>` : ''}
        <p class="muted small">（ ）は特別な読み・<span class="okuri">色つき</span>は送りがな</p>
        <div class="kd-actions">
          <button class="btn primary" data-act="trace">🖌️ なぞり書き</button>
          <button class="btn ghost" data-act="quiz" ${qn ? '' : 'disabled'}>この字の問題（${qn}）</button>
        </div>
      </div>
    </div>`, { cls: 'modal-wide', onClose: () => { view.destroy(); onClose?.(); } });
  md.el.querySelector('.kd-anim').appendChild(view.el);
  md.el.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'trace') { md.close(); openTrace(k); }
    if (a === 'quiz') { md.close(); go('quiz', { mode: 'kanji', k, t: Date.now() }); }
  });
}

export function openStrokeOrder(ch) {
  const view = strokeOrderView(ch, { size: 260 });
  const md = modal(`<div class="stroke-modal"><button class="icon-btn modal-x" data-close aria-label="閉じる">✕</button><h2>「${esc(ch)}」の書き順</h2><div class="so-host"></div>
    <div class="modal-actions"><button class="btn ghost" data-act="trace">🖌️ なぞり書きで練習</button></div></div>`,
  { onClose: () => view.destroy() });
  md.el.querySelector('.so-host').appendChild(view.el);
  md.el.querySelector('[data-act="trace"]').addEventListener('click', () => { md.close(); openTrace(ch); });
}

/** なぞり書き練習：1画ごとに書き順と形をチェック */
export function openTrace(ch) {
  const ref = refStrokes(ch);
  if (!ref) { toast('この字の書き順データがありません'); return; }
  let showModel = true;
  const md = modal(`
    <div class="trace">
      <button class="icon-btn modal-x" data-close aria-label="閉じる">✕</button>
      <h2>なぞり書き <span class="trace-k">${esc(ch)}</span></h2>
      <p class="trace-msg">うすい字をなぞって、<b>1画目</b>から書こう</p>
      <div class="trace-pad"></div>
      <div class="trace-dots">${ref.map((_, i) => `<i data-i="${i}">${i + 1}</i>`).join('')}</div>
      <div class="modal-actions">
        <button class="btn ghost" data-t="toggle">お手本をかくす</button>
        <button class="btn ghost" data-t="undo">1画もどす</button>
        <button class="btn ghost" data-t="reset">やりなおし</button>
      </div>
    </div>`, { cls: 'modal-trace' });
  const msg = md.el.querySelector('.trace-msg');
  const dots = [...md.el.querySelectorAll('.trace-dots i')];
  const refPts = ref.map((s) => resample(s.map(([x, y]) => [x, y]), 16));
  let marks = [];

  const pad = new Pad({
    model: ch, showModel: true,
    onStrokeEnd: (p) => {
      const i = p.strokes.length - 1;
      if (i >= ref.length) { msg.innerHTML = `画数が多いよ！この字は <b>${ref.length}画</b>`; sfx.wrong(); return; }
      const user = resample(p.strokes[i].map((q) => [(q[0] * 109) / UNIT, (q[1] * 109) / UNIT]), 16);
      const dist = (a, b, rev = false) => a.reduce((s, pt, k) => s + Math.hypot(pt[0] - b[rev ? 15 - k : k][0], pt[1] - b[rev ? 15 - k : k][1]), 0) / 16;
      const tol = showModel ? 11 : 16;
      const dHere = dist(user, refPts[i]);
      let result;
      if (dHere < tol) result = 'ok';
      else if (dist(user, refPts[i], true) < tol) result = 'rev';
      else {
        const j = refPts.findIndex((r, jj) => jj !== i && dist(user, r) < tol);
        result = j >= 0 ? `order:${j}` : 'shape';
      }
      marks[i] = result;
      dots[i].className = result === 'ok' ? 'ok' : 'ng';
      if (result === 'ok') { msg.innerHTML = i + 1 < ref.length ? `いいね！つぎは <b>${i + 2}画目</b>` : ''; sfx.select(); }
      else if (result === 'rev') { msg.innerHTML = `${i + 1}画目は<b>書く向きが反対</b>だよ`; sfx.wrong(); }
      else if (result.startsWith('order')) { msg.innerHTML = `それは <b>${Number(result.slice(6)) + 1}画目</b> だよ。${i + 1}画目を先に書こう`; sfx.wrong(); }
      else { msg.innerHTML = `${i + 1}画目の<b>形や位置</b>がずれているよ`; sfx.wrong(); }
      if (p.strokes.length === ref.length) finish(p);
    },
  });
  md.el.querySelector('.trace-pad').appendChild(pad.el);

  function finish(p) {
    const good = marks.filter((m) => m === 'ok').length;
    const off = offlineMatch(p.getStrokes(), ch);
    const perfect = good === ref.length;
    if (perfect) {
      msg.innerHTML = `💮 <b>かんぺき！</b>書き順も形もばっちり`;
      sfx.correct(4); setTimeout(() => sfx.stamp(), 80);
      burst({ count: 50, kind: 'sakura' });
      const first = !store.get().traced[ch];
      store.update((s) => { s.traced[ch] = Date.now(); s.xp += first ? 5 : 1; });
      floatText(first ? '+5 XP' : '+1 XP', msg, 'xp');
      checkBadges();
    } else {
      msg.innerHTML = `${ref.length}画中 <b>${good}画</b> 正しく書けたよ。${off && off.rank === 1 ? '字の形はOK！' : ''}「やりなおし」でもう一度！`;
      sfx.wrong();
    }
  }
  md.el.addEventListener('click', (e) => {
    const t = e.target.closest('[data-t]')?.dataset.t;
    if (!t) return;
    sfx.tap();
    if (t === 'toggle') {
      showModel = !showModel;
      pad.showModel(showModel);
      e.target.textContent = showModel ? 'お手本をかくす' : 'お手本を見せる';
    }
    if (t === 'undo') { pad.undo(); marks = marks.slice(0, pad.strokes.length); dots.forEach((d, i) => { if (i >= pad.strokes.length) d.className = ''; }); }
    if (t === 'reset') { pad.clear(); marks = []; dots.forEach((d) => (d.className = '')); msg.innerHTML = 'うすい字をなぞって、<b>1画目</b>から書こう'; }
  });
}
