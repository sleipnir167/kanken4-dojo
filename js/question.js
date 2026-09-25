// 問題の表示・解答入力・採点（練習と模擬試験で共通）
import { CATS, KOUSEI_TYPES, SHEET_GUIDE, splitTarget } from './bank.js';
import { Pad, strokesToSVG, UNIT } from './pad.js';
import { createKanaPad, normalizeKana } from './kanapad.js';
import { judgeChar, judgeKana } from './recognizer.js';
import { shuffle } from './srs.js';
import { esc } from './ui.js';
import { settings, update as updateStore } from './store.js';
import { sfx } from './sound.js';
import { KANJI4 } from '../data/kanji.js';

const K4 = new Set(KANJI4.map((k) => k.k));
const LETTERS = ['ア', 'イ', 'ウ', 'エ', 'オ', 'カ', 'キ', 'ク', 'ケ', 'コ'];

// ---------- 問題文 ----------
function sentence(text, cls) {
  const { before, target, after } = splitTarget(text);
  return `${esc(before)}<span class="${cls}">${esc(target)}</span>${esc(after)}`;
}

export function promptHTML(q, view = {}) {
  switch (q.cat) {
    case 'yomi': return `<p class="q-sentence">${sentence(q.text, 'bousen')}</p>`;
    case 'kaki':
    case 'okuri':
    case 'douon': return `<p class="q-sentence">${sentence(q.text, 'bousen kata')}</p>`;
    case 'shikibetsu':
      return `<div class="q-words">${q.words.map((w) => `<span>${esc(w).replace('□', '<i class="blank">□</i>')}</span>`).join('<em>・</em>')}</div>`;
    case 'kousei': return `<div class="q-big">${esc(q.word)}</div>`;
    case 'bushu': return `<div class="q-big q-bushu">${esc(q.word)}</div>`;
    case 'taigi':
      return `<div class="q-pair"><span class="pair-kind ${q.kind === '対' ? 'k-tai' : 'k-rui'}">${q.kind === '対' ? '対義語' : '類義語'}</span>
        <span class="pair-w">${esc(q.left)}</span><span class="pair-sep">${q.kind === '対' ? '⇔' : '≒'}</span>
        <span class="pair-w">${esc(q.right).replace('□', `<i class="blank">□<small>${esc(q.kana)}</small></i>`)}</span></div>`;
    case 'yoji':
      return `<div class="q-yoji">${[...q.word].map((c, i) => i === q.pos
        ? `<span class="blank"><small>${esc(q.kana)}</small></span>` : `<span>${esc(c)}</span>`).join('')}</div>`;
    case 'goji':
      return `<p class="q-sentence goji-sentence">${[...q.text].map((c, i) => /[㐀-鿿]/.test(c)
        ? `<button type="button" class="goji-ch${view.pick === i ? ' picked' : ''}" data-i="${i}">${esc(c)}</button>` : esc(c)).join('')}</p>`;
    default: return '';
  }
}

export const guideText = (q, sheet = false) => (sheet ? SHEET_GUIDE[q.cat] : CATS[q.cat].guide);

// ---------- 解答エリア ----------
/**
 * @returns コントローラー { el, getAnswer(), isEmpty(), lock(), undo(), clear(), destroy() }
 */
export function mountAnswer(q, container, { saved = null, onChange = () => {}, promptEl = null, onRemount = null } = {}) {
  const ctl = { pads: [], kpads: [], text: saved?.text || '', choice: saved?.choice ?? null, pick: saved?.pick ?? null, locked: false };
  const area = document.createElement('div');
  area.className = `answer answer-${q.type}`;
  container.appendChild(area);
  ctl.el = area;

  const makePads = (chars, labelFn) => {
    const row = document.createElement('div');
    row.className = `pad-row n${chars.length}`;
    chars.forEach((ch, i) => {
      const pad = new Pad({ model: ch, onChange: () => onChange(), onStrokeEnd: () => sfx.pen(), label: labelFn?.(i) || '' });
      if (saved?.pads?.[i]) pad.setStrokes(saved.pads[i]);
      ctl.pads.push(pad);
      row.appendChild(pad.el);
    });
    return row;
  };

  // ひらがなを1マス1字で手書きする
  const kanaWriter = (n, hint) => {
    const wrap = document.createElement('div');
    wrap.className = 'kana-write';
    const row = document.createElement('div');
    row.className = 'pad-row kana-row';
    row.style.setProperty('--n', n);
    for (let i = 0; i < n; i++) {
      const pad = new Pad({ onChange: () => onChange(), onStrokeEnd: () => sfx.pen() });
      pad.el.classList.add('kana-pad-box');
      if (saved?.kana?.[i]) pad.setStrokes(saved.kana[i]);
      ctl.kpads.push(pad);
      row.appendChild(pad.el);
    }
    wrap.innerHTML = `<p class="kana-hint">${hint}</p>`;
    wrap.appendChild(row);
    return wrap;
  };

  // スマホ向け：大きなマス2つに交互に書く。となりのマスに書きはじめると前の字が確定する
  const kanaSequencer = (n) => {
    const wrap = document.createElement('div');
    wrap.className = 'kana-seq';
    wrap.innerHTML = `
      <p class="kana-hint">1字ずつ大きく書こう。となりのマスに書きはじめると、前の字が確定するよ</p>
      <div class="seq-strip" aria-label="書いた字"></div>
      <div class="seq-pads"></div>
      <div class="seq-tools"><button type="button" class="mini-btn" data-seq="bs">⌫ 1字けす</button></div>`;
    const chars = (saved?.kana || []).filter((b) => b && b.length);
    const strip = wrap.querySelector('.seq-strip');
    let active = null;
    const pads = [0, 1].map(() => new Pad({
      onStrokeStart: (p) => {
        const other = pads.find((x) => x !== p);
        if (!other.isEmpty()) commit(other);
        active = p;
        pads.forEach((x) => x.el.classList.toggle('active', x === p));
      },
      onStrokeEnd: () => sfx.pen(),
      onChange: () => { renderStrip(); onChange(); },
    }));
    pads.forEach((p) => { p.el.dataset.ph = 'ここに書く'; wrap.querySelector('.seq-pads').appendChild(p.el); });
    const pending = () => {
      const other = pads.find((x) => x !== active);
      return [other, active].filter((x) => x && !x.isEmpty());
    };
    function commit(p) {
      chars.push(p.getStrokes());
      p.clear();
      renderStrip();
    }
    function renderStrip() {
      const count = Math.max(n, chars.length + 1);
      strip.innerHTML = Array.from({ length: count }, (_, i) => (i < chars.length
        ? `<button type="button" class="seq-cell" data-del="${i}" aria-label="${i + 1}字目（タップでけす）">${strokesToSVG(chars[i])}</button>`
        : `<span class="seq-cell${i === chars.length ? ' cur' : ''}"></span>`)).join('');
    }
    const backspace = () => {
      const p = pending().pop();
      if (p) p.clear(); else chars.pop();
      renderStrip();
      onChange();
    };
    wrap.addEventListener('click', (e) => {
      if (ctl.locked) return;
      if (e.target.closest('[data-seq="bs"]')) { sfx.tap(); backspace(); }
      const del = e.target.closest('[data-del]');
      if (del) { sfx.tap(); chars.splice(Number(del.dataset.del), 1); renderStrip(); onChange(); }
    });
    renderStrip();
    ctl.seqPads = pads;
    ctl.kanaSeq = {
      getKana: () => [...chars, ...pending().map((p) => p.getStrokes())],
      isEmpty: () => !chars.length && !pending().length,
      clear: () => { chars.length = 0; pads.forEach((p) => p.clear()); renderStrip(); },
      pop: backspace,
    };
    return wrap;
  };

  // 入力方法のワンタップ切りかえ
  const switcher = (to, label) => {
    if (!onRemount) return null;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mini-btn kmode-switch';
    b.textContent = label;
    b.addEventListener('click', () => {
      if (ctl.locked) return;
      sfx.select();
      updateStore((st) => { st.settings.kanaInput = to; });
      onRemount();
    });
    return b;
  };

  const kanaBox = (placeholder, boxes) => {
    const mode = settings().kanaInput || 'hand';
    const narrow = (container.clientWidth || innerWidth) < 600;
    if (mode === 'seq' || mode === 'hand') {
      const w = mode === 'seq' || narrow ? kanaSequencer(boxes) : kanaWriter(boxes, placeholder);
      const sw = switcher('pad', '⌨ かな表で入力');
      if (sw) w.appendChild(sw);
      return w;
    }
    const wrap = document.createElement('div');
    wrap.className = 'kana-input';
    const sw = switcher('hand', '✍ 手書きで入力');
    const useNative = mode === 'keyboard';
    const ph = placeholder.split('（')[0]; // 手書き用の説明（かっこ内）は省く
    wrap.innerHTML = useNative
      ? `<input class="kana-field" lang="ja" inputmode="text" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="${ph}">`
      : `<div class="kana-field kana-display" data-ph="${ph}"></div>`;
    const field = wrap.querySelector('.kana-field');
    const render = () => { if (!useNative) { field.textContent = ctl.text; field.classList.toggle('empty', !ctl.text); } else field.value = ctl.text; };
    if (useNative) field.addEventListener('input', () => { ctl.text = field.value; onChange(); });
    else wrap.appendChild(createKanaPad((fn) => { if (ctl.locked) return; ctl.text = fn(ctl.text).slice(0, 12); render(); onChange(); }));
    render();
    if (sw) wrap.appendChild(sw);
    ctl.focusText = () => useNative && field.focus();
    return wrap;
  };

  switch (q.type) {
    case 'read': {
      const longest = Math.max(...q.answers.map((a) => a.length));
      area.appendChild(kanaBox('ひらがなで答えよう（左のマスから1マスに1字。「ゃ」「っ」は小さく）', Math.min(8, Math.max(6, longest + 2))));
      break;
    }
    case 'choice': {
      let opts;
      if (q.cat === 'shikibetsu') opts = shuffle([q.answer, ...shuffle(q.pool.filter((a) => a !== q.answer)).slice(0, 4)]);
      else if (q.cat === 'kousei') opts = q.options;
      else opts = shuffle([...q.options]);
      if (saved?.opts) opts = saved.opts;
      ctl.opts = opts;
      const grid = document.createElement('div');
      grid.className = `choices c-${q.cat}`;
      grid.innerHTML = opts.map((o, i) => {
        if (q.cat === 'kousei') {
          const t = KOUSEI_TYPES.find((k) => k[0] === o);
          return `<button type="button" class="choice kousei-choice" data-v="${o}"><b>${o}</b><span>${t[1]}<small>（例：${t[2]}）</small></span></button>`;
        }
        return `<button type="button" class="choice" data-v="${esc(o)}"><small>${LETTERS[i]}</small><b>${esc(o)}</b></button>`;
      }).join('');
      const sync = () => grid.querySelectorAll('.choice').forEach((b) => b.classList.toggle('selected', b.dataset.v === ctl.choice));
      grid.addEventListener('click', (e) => {
        const b = e.target.closest('.choice');
        if (!b || ctl.locked) return;
        sfx.select();
        ctl.choice = b.dataset.v;
        sync();
        onChange(true);
      });
      sync();
      area.appendChild(grid);
      break;
    }
    case 'write':
      area.appendChild(makePads([...q.write]));
      break;
    case 'okuri': {
      const box = document.createElement('div');
      box.className = 'okuri-box';
      box.appendChild(makePads([q.write], () => '漢字'));
      const kb = kanaBox('送りがな', Math.max(4, q.okuri.length + 1));
      kb.classList.add('okuri-kana');
      box.appendChild(kb);
      area.appendChild(box);
      break;
    }
    case 'goji': {
      const hint = document.createElement('p');
      hint.className = 'goji-hint';
      const upd = () => {
        hint.innerHTML = ctl.pick == null ? '① 文の中のまちがっている漢字をタップ'
          : `① <b class="goji-picked">${esc(q.text[ctl.pick])}</b> を選択中 → ② 正しい漢字を書こう`;
      };
      upd();
      area.appendChild(hint);
      area.appendChild(makePads([q.write], () => '正'));
      const host = promptEl || container;
      const onPick = (e) => {
        const b = e.target.closest('.goji-ch');
        if (!b || ctl.locked) return;
        sfx.select();
        ctl.pick = Number(b.dataset.i);
        host.querySelectorAll('.goji-ch').forEach((x) => x.classList.toggle('picked', x === b));
        upd();
        onChange();
      };
      host.addEventListener('click', onPick);
      ctl.offPick = () => host.removeEventListener('click', onPick);
      break;
    }
  }

  ctl.getAnswer = () => ({
    text: ctl.text, choice: ctl.choice, pick: ctl.pick, opts: ctl.opts,
    pads: ctl.pads.map((p) => p.getStrokes()),
    kana: ctl.kanaSeq ? ctl.kanaSeq.getKana() : ctl.kpads.length ? ctl.kpads.map((p) => p.getStrokes()) : undefined,
  });
  const kanaEmpty = () => (ctl.kanaSeq ? ctl.kanaSeq.isEmpty() : ctl.kpads.length ? ctl.kpads.every((p) => p.isEmpty()) : !ctl.text);
  ctl.isEmpty = () => {
    if (q.type === 'read') return kanaEmpty();
    if (q.type === 'choice') return ctl.choice == null;
    if (q.type === 'okuri') return ctl.pads[0].isEmpty() || kanaEmpty();
    if (q.type === 'goji') return ctl.pick == null || ctl.pads[0].isEmpty();
    return ctl.pads.some((p) => p.isEmpty());
  };
  const allPads = () => [...ctl.pads, ...ctl.kpads, ...(ctl.seqPads || [])];
  ctl.lock = () => { ctl.locked = true; allPads().forEach((p) => p.lock()); area.classList.add('locked'); };
  ctl.undo = () => {
    // 最後に書いたパッドの1画を消す
    const last = allPads().filter((p) => !p.isEmpty()).sort((a, b) => lastT(b) - lastT(a))[0];
    if (last) last.undo(); else ctl.kanaSeq?.pop();
  };
  ctl.clear = () => { allPads().forEach((p) => p.clear()); ctl.kanaSeq?.clear(); };
  ctl.destroy = () => { allPads().forEach((p) => p.destroy()); ctl.offPick?.(); };
  ctl.hasPads = allPads().length > 0;
  return ctl;
}
const lastT = (pad) => { const s = pad.strokes[pad.strokes.length - 1]; return s ? s[s.length - 1][2] : 0; };

// ---------- 採点 ----------
/** @returns {Promise<{correct:boolean|null, chars:Array}>} */
export async function grade(q, ans) {
  const st = settings();
  const opt = { mode: st.judge, strictness: st.strict };
  if (q.type === 'read') {
    // 送りがなまで書いても正解にする（例：[隠]す → 「かく」「かくす」）
    const { after } = splitTarget(q.text);
    const okuri = (after.match(/^[ぁ-ゖ]+/) || [''])[0];
    const variants = q.answers.flatMap((a) => [a, ...[...okuri].map((_, i) => a + okuri.slice(0, i + 1))]);
    if (ans.kana) {
      const kana = await judgeKana(ans.kana, variants, UNIT, opt);
      return { correct: kana.correct, chars: [], kana };
    }
    const t = normalizeKana(ans.text);
    return { correct: variants.includes(t), chars: [] };
  }
  if (q.type === 'choice') return { correct: ans.choice === q.answer, chars: [] };

  const chars = [...q.write];
  const results = await Promise.all(chars.map((ch, i) =>
    judgeChar(ans.pads[i] || [], UNIT, UNIT, ch, opt).then((r) => ({ ...r, ch }))));
  let kana;
  if (q.type === 'okuri' && ans.kana) {
    kana = await judgeKana(ans.kana, [q.okuri], UNIT, opt);
    results.push({ correct: kana.correct }); // 送りがなの結果もまとめて判定
  }
  let correct = results.every((r) => r.correct === true);
  if (results.some((r) => r.correct === null) && results.every((r) => r.correct !== false)) correct = null;
  if (kana) results.pop();
  if (q.type === 'okuri' && !ans.kana && normalizeKana(ans.text) !== q.okuri) correct = false;
  if (q.type === 'goji' && q.text[ans.pick] !== q.wrong) correct = false;
  return { correct, chars: results, kana };
}

// ---------- 解説 ----------
function filled(q) {
  const { before, target, after } = splitTarget(q.text || '');
  switch (q.cat) {
    case 'yomi': return `${esc(before)}<ruby class="ans">${esc(target)}<rt>${esc(q.answers[0])}</rt></ruby>${esc(after)}`;
    case 'kaki': return `${esc(before)}<ruby class="ans">${esc(q.write)}<rt>${esc(target)}</rt></ruby>${esc(after)}`;
    case 'okuri': return `${esc(before)}<ruby class="ans">${esc(q.write + q.okuri)}<rt>${esc(target)}</rt></ruby>${esc(after)}`;
    case 'douon': return `${esc(before)}<ruby class="ans">${esc(q.answer)}<rt>${esc(target)}</rt></ruby>${esc(after)}`;
    case 'shikibetsu': return q.words.map((w) => esc(w).replace('□', `<b class="ans">${esc(q.answer)}</b>`)).join('・');
    case 'kousei': {
      const t = KOUSEI_TYPES.find((k) => k[0] === q.answer);
      return `<b class="ans">${esc(q.word)}</b> は <b class="ans">${t[0]}</b>：${t[1]}`;
    }
    case 'bushu': return `<b>${esc(q.word)}</b> の部首は <b class="ans big">${esc(q.answer)}</b>`;
    case 'taigi': return `${esc(q.left)} ${q.kind === '対' ? '⇔' : '≒'} ${esc(q.right).replace('□', `<b class="ans">${esc(q.write)}</b>`)}`;
    case 'yoji': return `<b class="yoji-ans">${[...q.word].map((c, i) => (i === q.pos ? `<b class="ans">${esc(c)}</b>` : esc(c))).join('')}</b><br><small class="meaning">意味：${esc(q.meaning)}</small>`;
    case 'goji': return esc(q.text).replace(esc(q.wrong), `<s class="wrong">${esc(q.wrong)}</s><b class="ans">${esc(q.write)}</b>`);
    default: return '';
  }
}
export const answerHTML = filled;

/** 読み上げ用の文 */
export function speechText(q) {
  const { before, target, after } = splitTarget(q.text || '');
  switch (q.cat) {
    case 'yomi': return before + q.answers[0] + after;
    case 'kaki': case 'douon': return before + target + after;
    case 'okuri': return before + target + after;
    case 'yoji': return q.word;
    case 'taigi': return `${q.left}、${q.right.replace('□', q.write)}`;
    case 'goji': return q.text.replace(q.wrong, q.write);
    default: return q.word || '';
  }
}

/** 手書きの結果（自分の字と正しい字を並べる） */
export function inkCompareHTML(q, ans, res) {
  if (!res?.chars?.length) return '';
  return `<div class="ink-compare">${res.chars.map((r, i) => {
    const off = r.offline;
    const notes = [];
    if (r.source === 'google' && r.candidates.length) notes.push(`認識：${r.candidates.slice(0, 4).map(esc).join(' ')}`);
    if (r.source === 'offline' && off) notes.push(`手本との一致度 ${Math.max(0, Math.round((1 - off.score / 0.3) * 100))}%`);
    if (off && off.userStrokes !== off.refStrokes) notes.push(`画数：あなた${off.userStrokes}画／正しくは${off.refStrokes}画`);
    else if (off && off.orderErrors >= 2 && r.correct) notes.push('書き順がちがうかも？');
    return `<div class="ink-pair ${r.correct === true ? 'ok' : r.correct === false ? 'ng' : ''}">
      <div class="ink-box">${strokesToSVG(ans.pads[i])}<span>あなた</span></div>
      <div class="ink-box model"><b>${esc(r.ch)}</b><span>正解</span></div>
      <button type="button" class="mini-btn" data-action="order" data-ch="${esc(r.ch)}">書き順</button>
      ${notes.length ? `<p class="ink-note">${notes.join('<br>')}</p>` : ''}
    </div>`;
  }).join('')}</div>`;
}

/** 手書きのひらがなの結果 */
export function kanaCompareHTML(ans, res) {
  const boxes = (ans?.kana || []).filter((b) => b && b.length);
  if (!boxes.length) return '';
  return `<div class="kana-compare">
    <div class="kana-thumbs">${boxes.map((b) => `<span class="ink-box small">${strokesToSVG(b)}</span>`).join('')}</div>
    ${res?.kana?.recognized ? `<p class="ink-note">認識：<b>${esc(res.kana.recognized)}</b></p>` : ''}
  </div>`;
}

export function kanjiChips(q) {
  const ks = (q.kanji || []).filter((k) => K4.has(k));
  if (!ks.length) return '';
  return `<div class="kanji-chips"><span>4級漢字：</span>${ks.map((k) => `<button type="button" class="kchip" data-action="kanji" data-k="${esc(k)}">${esc(k)}</button>`).join('')}</div>`;
}

export function userAnswerText(q, ans, res) {
  if (q.type === 'read') return ans.kana ? res?.kana?.recognized || '（手書き）' : ans.text || '（無回答）';
  if (q.type === 'choice') return ans.choice ?? '（無回答）';
  if (q.type === 'okuri') return `（手書き）＋${ans.kana ? res?.kana?.recognized || '？' : ans.text || '？'}`;
  if (q.type === 'goji') return ans.pick != null ? `「${q.text[ans.pick]}」を選択` : '（未選択）';
  return '（手書き）';
}
