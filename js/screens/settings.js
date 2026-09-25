// 設定
import * as store from '../store.js';
import { STRICTNESS } from '../recognizer.js';
import { actions, esc, toast, confirmDialog } from '../ui.js';
import { applyTheme } from '../app.js';
import { sfx } from '../sound.js';

export function renderSettings(root) {
  const draw = () => {
    const st = store.settings();
    const seg = (key, opts) => `<div class="seg" role="radiogroup">${opts.map(([v, l]) =>
      `<button type="button" class="${String(st[key]) === String(v) ? 'on' : ''}" data-action="set" data-k="${key}" data-v="${v}">${l}</button>`).join('')}</div>`;
    const tog = (key) => `<button type="button" class="toggle ${st[key] ? 'on' : ''}" data-action="toggle" data-k="${key}" role="switch" aria-checked="${!!st[key]}"><i></i></button>`;
    root.innerHTML = `
    <header class="page-head"><h1>設定</h1></header>
    <section class="settings">
      <div class="card set-group">
        <h2>プロフィール</h2>
        <label class="set-row"><span>ニックネーム</span><input class="text-in" data-k="name" value="${esc(st.name)}" maxlength="12" placeholder="なまえ"></label>
        <label class="set-row"><span>受検日<small>本番までの日数と1日の目安を表示</small></span><input class="text-in" type="date" data-k="examDate" value="${esc(st.examDate)}"></label>
        <div class="set-row"><span>1日の目標問題数</span>${seg('dailyGoal', [[10, '10'], [20, '20'], [30, '30'], [50, '50'], [80, '80']])}</div>
        <div class="set-row"><span>1回の問題数</span>${seg('sessionSize', [[5, '5'], [10, '10'], [15, '15'], [20, '20']])}</div>
        <div class="set-row"><span>新しい問題の割合<small>残りは復習・苦手</small></span>${seg('newRatio', [[0.1, '少'], [0.3, 'ふつう'], [0.5, '多']])}</div>
      </div>

      <div class="card set-group">
        <h2>手書き判定</h2>
        <div class="set-row col"><span>判定のしかた</span>${seg('judge', [['auto', '自動（おすすめ）'], ['offline', '端末内のみ'], ['self', '自分で判定']])}
          <small class="muted">自動：オンライン時は Google の手書き認識で判定し、オフライン時は端末内の書き順データと照合して判定します。<br>
          ※ 自動の場合、書いた線の座標データが Google に送信されます。送信したくない場合は「端末内のみ」を選んでください。</small></div>
        <div class="set-row"><span>判定のきびしさ</span>${seg('strict', Object.entries(STRICTNESS).map(([k, v]) => [k, v.label]))}</div>
        <div class="set-row"><span>Apple Pencil だけで書く<small>指やてのひらでは書けなくなります</small></span>${tog('pencilOnly')}</div>
        <div class="set-row"><span>ペンを使ったら指の入力を無視<small>書いているときの手のひらの誤反応を防ぎます</small></span>${tog('autoPalm')}</div>
        <div class="set-row"><span>マス目の十字線<small>答案用紙モードでは表示しません</small></span>${tog('showGuide')}</div>
        <div class="set-row col"><span>答案用紙モード<small>解答欄を本番に近い見た目にし、答え合わせで「とめ・はね・はらい」をチェックします</small></span>${seg('sheetMode', [['exam', '模試だけ'], ['all', '練習でも使う'], ['off', '使わない']])}</div>
        <div class="set-row"><span>ひらがなの答え方<small>読み・送りがなの問題。「自動」はタブレットではマス目、スマホでは1字ずつ大きく書く方式になります</small></span>${seg('kanaInput', [['hand', '手書き（自動）'], ['seq', '手書き（1字ずつ大きく）'], ['pad', 'かな表'], ['keyboard', 'キーボード']])}</div>
      </div>

      <div class="card set-group">
        <h2>音と表示</h2>
        <div class="set-row"><span>効果音</span>${tog('sound')}</div>
        <label class="set-row"><span>音量</span><input type="range" min="0" max="1" step="0.05" value="${st.volume}" data-k="volume" class="range"></label>
        <div class="set-row"><span>答えを読み上げる<small>答え合わせのときに音声で読み上げ</small></span>${tog('speech')}</div>
        <div class="set-row"><span>テーマ</span>${seg('theme', [['auto', '自動'], ['light', 'ライト'], ['dark', 'ダーク']])}</div>
      </div>

      <div class="card set-group">
        <h2>データ</h2>
        <p class="muted small">学習記録はこの端末のブラウザ内に保存されています。Safari の「履歴とWebサイトデータを消去」で消えてしまうので、ときどきバックアップしましょう。</p>
        <div class="set-actions">
          <button class="btn ghost" data-action="export">バックアップを保存</button>
          <label class="btn ghost file-btn">バックアップから復元<input type="file" accept="application/json,.json" hidden></label>
          <button class="btn danger" data-action="reset">記録をすべて消す</button>
        </div>
      </div>

      <div class="card set-group about">
        <h2>このアプリについて</h2>
        <p class="small">漢字検定4級の合格をめざす学習アプリです。問題はすべて本番の出題形式にならったオリジナル問題です（日本漢字能力検定協会とは関係ありません）。</p>
        <p class="small muted">書き順データ：KanjiVG（Ulrich Apel, CC BY-SA 3.0）／ 読み・部首・画数：常用漢字表</p>
      </div>
    </section>`;

    root.querySelectorAll('.text-in').forEach((i) => i.addEventListener('change', () => {
      store.update((s) => { s.settings[i.dataset.k] = i.value.trim(); });
      toast('保存しました', { icon: '✓', ms: 1200 });
    }));
    root.querySelector('.range').addEventListener('change', (e) => {
      store.update((s) => { s.settings.volume = Number(e.target.value); });
      sfx.correct(0);
    });
    root.querySelector('input[type=file]').addEventListener('change', async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        const text = await f.text();
        if (!(await confirmDialog('今の記録をバックアップの内容で上書きします。よろしいですか？', { ok: '復元する', danger: true }))) return;
        store.importJSON(text);
        applyTheme();
        toast('復元しました', { icon: '✓' });
        draw();
      } catch (err) { toast(`復元できませんでした：${esc(err.message)}`, { icon: '⚠️' }); }
    });
  };
  draw();

  actions(root, {
    set: (t) => {
      sfx.select();
      const k = t.dataset.k;
      const cur = store.settings()[k];
      const v = typeof cur === 'number' ? Number(t.dataset.v) : t.dataset.v;
      store.update((s) => { s.settings[k] = v; });
      if (k === 'theme') applyTheme();
      draw();
    },
    toggle: (t) => {
      const k = t.dataset.k;
      store.update((s) => { s.settings[k] = !s.settings[k]; });
      sfx.select();
      draw();
    },
    export: () => {
      const blob = new Blob([store.exportJSON()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `kanken4-backup-${store.dayKey()}.json`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      toast('バックアップを保存しました', { icon: '💾' });
    },
    reset: async () => {
      if (await confirmDialog('学習記録・XP・バッジをすべて消します。<br>この操作は取り消せません。', { ok: 'すべて消す', danger: true })) {
        store.resetAll();
        toast('記録を消しました');
        draw();
      }
    },
  });
}
