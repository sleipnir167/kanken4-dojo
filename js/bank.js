// 問題バンクを読み込み、アプリで使う共通フォーマットに変換する
import * as Q from '../data/questions.js';

export const CATS = {
  yomi:       { name: '読み',           icon: '読', points: 1, exam: 30, color: '#3f7fbf',
                guide: '――線の漢字の読みをひらがなで答えよう' },
  douon:      { name: '同音・同訓異字', icon: '同', points: 2, exam: 15, color: '#8a5cc2',
                guide: 'カタカナにあてはまる漢字を選ぼう' },
  shikibetsu: { name: '漢字識別',       icon: '識', points: 2, exam: 5,  color: '#c2548a',
                guide: '三つの□に共通して入る漢字を選ぼう' },
  kousei:     { name: '熟語の構成',     icon: '構', points: 2, exam: 10, color: '#2f9c8f',
                guide: '熟語の組み立てをア〜オから選ぼう' },
  bushu:      { name: '部首',           icon: '部', points: 1, exam: 10, color: '#b8862b',
                guide: '漢字の部首を選ぼう' },
  taigi:      { name: '対義語・類義語', icon: '対', points: 2, exam: 10, color: '#d06a2c',
                guide: 'ひらがなを漢字に直して□に書こう' },
  okuri:      { name: '送りがな',       icon: '送', points: 2, exam: 5,  color: '#4f9a3c',
                guide: 'カタカナを漢字一字と送りがなに直そう' },
  yoji:       { name: '四字熟語',       icon: '四', points: 2, exam: 10, color: '#5467c9',
                guide: 'カタカナを漢字一字に直そう' },
  goji:       { name: '誤字訂正',       icon: '誤', points: 2, exam: 5,  color: '#c7433a',
                guide: 'まちがっている漢字を見つけて、正しく書き直そう' },
  kaki:       { name: '書き取り',       icon: '書', points: 2, exam: 20, color: '#1f2d4d',
                guide: 'カタカナを漢字に直そう' },
};
export const CAT_ORDER = ['yomi', 'douon', 'shikibetsu', 'kousei', 'bushu', 'taigi', 'okuri', 'yoji', 'goji', 'kaki'];

export const KOUSEI_TYPES = [
  ['ア', '同じような意味の漢字を重ねたもの', '岩石'],
  ['イ', '反対または対応の意味を表す字を重ねたもの', '高低'],
  ['ウ', '前の字が後の字を修飾しているもの', '洋画'],
  ['エ', '後の字が前の字の目的語・補語になっているもの', '着席'],
  ['オ', '前の字が後の字の意味を打ち消しているもの', '非常'],
];

function hash(s) {
  let h = 5381;
  for (const ch of s) h = ((h * 33) ^ ch.codePointAt(0)) >>> 0;
  return h.toString(36);
}
const lines = (s) => s.split('\n').map((l) => l.trim()).filter(Boolean);
const KANJI_RE = /[㐀-鿿々]/g;
const kanjiIn = (s) => [...new Set(s.match(KANJI_RE) || [])];

// "文[対象]文" を {before, target, after} に分割
export function splitTarget(text) {
  const m = text.match(/^(.*?)\[(.+?)\](.*)$/);
  return m ? { before: m[1], target: m[2], after: m[3] } : { before: text, target: '', after: '' };
}

function build() {
  const out = [];
  const add = (cat, key, q) => out.push({ id: `${cat}:${hash(key)}`, cat, ...q });

  for (const l of lines(Q.YOMI)) {
    const [text, ans] = l.split('|');
    const { target } = splitTarget(text);
    add('yomi', text, { type: 'read', text, answers: ans.split('/'), kanji: kanjiIn(target), word: target });
  }
  for (const l of lines(Q.KAKI)) {
    const [text, ans] = l.split('|');
    add('kaki', text, { type: 'write', text, write: ans, kanji: kanjiIn(ans), word: ans });
  }
  for (const g of Q.DOUON) {
    for (const [text, ans] of g.items) {
      add('douon', text, { type: 'choice', text, options: g.options, answer: ans, kanji: [ans], word: ans });
    }
  }
  const shiki = lines(Q.SHIKIBETSU).map((l) => l.split('|'));
  const shikiAnswers = shiki.map((s) => s[1]);
  for (const [words, ans] of shiki) {
    add('shikibetsu', words, {
      type: 'choice', words: words.split('・'), answer: ans, pool: shikiAnswers, kanji: [ans], word: ans,
    });
  }
  for (const tok of Q.KOUSEI.split(/\s+/).filter(Boolean)) {
    const word = tok.slice(0, 2), t = tok.slice(2);
    add('kousei', word, {
      type: 'choice', word, options: KOUSEI_TYPES.map((k) => k[0]), answer: t, kanji: kanjiIn(word),
    });
  }
  for (const l of lines(Q.BUSHU)) {
    const [k, ans, opts] = l.split('|');
    add('bushu', k, { type: 'choice', word: k, answer: ans, options: opts.split(','), kanji: [k] });
  }
  for (const l of lines(Q.TAIGI)) {
    const [left, right, kana, ans, kind] = l.split('|');
    add('taigi', left + right, {
      type: 'write', left, right, kana, write: ans, kind, kanji: kanjiIn(left + right.replace('□', ans)),
      word: right.replace('□', ans),
    });
  }
  for (const l of lines(Q.OKURI)) {
    const [text, k, okuri] = l.split('|');
    add('okuri', text, { type: 'okuri', text, write: k, okuri, kanji: [k], word: k + okuri });
  }
  for (const l of lines(Q.YOJI)) {
    const [word, pos, kana, meaning] = l.split('|');
    const i = Number(pos);
    add('yoji', word + i, { type: 'write', word, pos: i, kana, meaning, write: word[i], kanji: kanjiIn(word) });
  }
  for (const l of lines(Q.GOJI)) {
    const [text, wrong, right] = l.split('|');
    add('goji', text, { type: 'goji', text, wrong, write: right, kanji: [right], word: right });
  }
  return out;
}

export const QUESTIONS = build();
export const BY_ID = Object.fromEntries(QUESTIONS.map((q) => [q.id, q]));
export const byCat = (cat) => QUESTIONS.filter((q) => q.cat === cat);

// 手書きで書く文字（ストロークデータが必要な文字）
export const WRITE_CHARS = [...new Set(QUESTIONS.flatMap((q) => (q.write ? [...q.write] : [])))];
