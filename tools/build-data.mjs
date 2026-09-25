// データ生成スクリプト
//   node tools/build-data.mjs <kanjivg.xml> <joyo.txt>
//
// - kanjivg.xml : https://github.com/KanjiVG/kanjivg/releases の kanjivg-YYYYMMDD.xml(.gz を展開)
// - joyo.txt    : https://ja.wikipedia.org/w/index.php?title=常用漢字一覧&action=raw
//
// 出力:
//   data/kanji.js     … 4級配当漢字の辞典データ（読み・部首・画数）
//   data/strokes.json … 書き順（KanjiVG のストロークパス）
import fs from 'node:fs';
import { QUESTIONS, WRITE_CHARS } from '../js/bank.js';
import { BUSHU } from '../data/questions.js';

const [kvgPath, joyoPath] = process.argv.slice(2);
if (!kvgPath || !joyoPath) {
  console.error('usage: node tools/build-data.mjs <kanjivg.xml> <joyo.txt>');
  process.exit(1);
}

// 漢検4級 配当漢字（2020年度以降の配当表をもとに作成）
const LIST4 = [...'亜哀握扱依威為偉違維緯壱芋陰隠影鋭越援煙鉛縁汚押奥憶菓暇箇雅介戒皆壊較獲刈甘汗乾勧歓監環鑑含奇祈鬼幾輝儀戯詰却脚及丘朽巨拠距御凶叫狂況狭恐響驚仰駆屈掘繰恵傾継迎撃肩兼剣軒圏堅遣玄枯誇鼓互抗攻更恒荒項稿豪込婚鎖彩歳載剤咲惨旨伺刺脂紫雌執芝斜煮釈寂朱狩趣需舟秀襲柔獣瞬旬巡盾召床沼称紹詳丈畳殖飾触侵振浸寝慎震薪尽陣尋吹是姓征跡占扇鮮訴僧燥騒贈即俗耐替沢拓濁脱丹淡嘆端弾恥致遅蓄跳徴澄沈珍抵堤摘滴添殿吐途渡奴怒到逃倒唐桃透盗塔稲踏闘胴峠突鈍曇弐悩濃杯輩拍泊迫薄爆髪抜罰般販搬範繁盤彼疲被避尾微匹描浜敏怖浮普腐敷膚賦舞幅払噴柄壁捕舗抱峰砲忙坊肪冒傍帽凡盆漫妙眠矛霧娘茂猛網黙紋躍雄与誉溶腰踊謡翼雷頼絡欄離粒慮療隣涙隷齢麗暦劣烈恋露郎惑腕'];

// ---------- 常用漢字表（読み・部首・画数） ----------
const joyo = {};
for (const row of fs.readFileSync(joyoPath, 'utf8').split('\n')) {
  if (!/^\| (\{\{0[|}]|\d)/.test(row)) continue;
  const cols = row.split('||').map((c) => c.trim());
  const k = cols[1].match(/\[\[wikt:[^|]+\|(.)\]\]/)?.[1];
  if (!k) continue;
  const rad = cols[3].match(/\|([^|\]]+)\]\]\s*$/)?.[1];
  const strokes = Number(cols[4].replace(/<[^>]+>[^<]*<\/span>/g, '').trim());
  const readings = cols[8]
    .replace(/<ref[^>]*\/>|<ref[^>]*>.*?<\/ref>/g, '')
    .replace(/<br\s*\/?>/g, '、')
    .replace(/<[^>]+>/g, '')
    .split(/[、,]/).map((s) => s.trim()).filter(Boolean);
  const on = [], kun = [];
  for (const r of readings) {
    const special = /^[（(]/.test(r);
    const clean = r.replace(/[（）()]/g, '');
    if (!clean) continue;
    (/[ァ-ヶ]/.test(clean) ? on : kun).push(special ? `(${clean})` : clean);
  }
  joyo[k] = { rad, strokes, on, kun };
}

// ---------- KanjiVG ----------
const kvgText = fs.readFileSync(kvgPath, 'utf8');
const kvg = {};
const kanjiRe = /<kanji id="kvg:kanji_([0-9a-f]{5})">([\s\S]*?)<\/kanji>/g;
for (let m; (m = kanjiRe.exec(kvgText)); ) {
  const ch = String.fromCodePoint(parseInt(m[1], 16));
  const body = m[2];
  const paths = [...body.matchAll(/<path [^>]*d="([^"]+)"/g)].map((p) => compactPath(p[1]));
  // 部首の字形（例: 水 → 氵）
  const forms = {};
  for (const g of body.matchAll(/<g [^>]*kvg:radical="[^"]+"[^>]*>/g)) {
    const el = g[0].match(/kvg:element="([^"]+)"/)?.[1];
    const orig = g[0].match(/kvg:original="([^"]+)"/)?.[1];
    if (el && orig) forms[orig] = el;
  }
  kvg[ch] = { paths, forms };
}
function compactPath(d) {
  // 小数点以下1桁に丸めてサイズを削減
  // （-0.01 → 0 のように符号が消える場合は区切りの空白を補う）
  return d.replace(/-?\d+\.\d+/g, (n) => {
    const v = String(Math.round(Number(n) * 10) / 10);
    return n[0] === '-' && v[0] !== '-' ? ' ' + v : v;
  })
    .replace(/\s+/g, ' ').replace(/,\s*/g, ',').replace(/\s*([A-Za-z])\s*/g, '$1').replace(/,-/g, '-');
}

// ---------- 検証 ----------
const errors = [];
const bushuOverride = Object.fromEntries(BUSHU.trim().split('\n').map((l) => l.split('|')).map((a) => [a[0], a[1]]));
for (const k of LIST4) if (!joyo[k]) errors.push(`常用漢字表に無い: ${k}`);
for (const q of QUESTIONS) {
  if (q.cat === 'goji') {
    const n = q.text.split(q.wrong).length - 1;
    if (n !== 1) errors.push(`誤字が文中に${n}回: ${q.text}`);
  }
  if (q.options && !q.options.includes(q.answer)) errors.push(`選択肢に答えが無い: ${q.id} ${q.answer}`);
  if (q.type === 'read' && !/^[ぁ-ゖー]+$/.test(q.answers.join(''))) errors.push(`読みがひらがなでない: ${q.text}`);
  if ((q.cat === 'kaki' || q.cat === 'okuri') && !/\[[ァ-ヶー]+\]/.test(q.text)) errors.push(`カタカナ指定が無い: ${q.text}`);
}
const ids = new Set();
for (const q of QUESTIONS) { if (ids.has(q.id)) errors.push(`ID重複: ${q.id}`); ids.add(q.id); }
for (const ch of WRITE_CHARS) if (!kvg[ch]) errors.push(`書き順データが無い: ${ch}`);

// ---------- 出力 ----------
const dict = LIST4.map((k) => {
  const j = joyo[k] || {};
  const base = bushuOverride[k] || j.rad || '';
  const form = kvg[k]?.forms[base];
  return {
    k, s: j.strokes, on: j.on || [], kun: j.kun || [],
    r: base, rf: form && form !== base ? form : undefined,
  };
});
fs.writeFileSync('data/kanji.js',
  '// 自動生成: tools/build-data.mjs（出典: 常用漢字表 / KanjiVG）\nexport const KANJI4 = ' +
  JSON.stringify(dict).replace(/\},\{/g, '},\n{') + ';\n');

// ひらがな（読み・送りがなの手書き判定用）
const HIRAGANA = [...'ぁあぃいぅうぇえぉおかがきぎくぐけげこごさざしじすずせぜそぞただちぢっつづてでとどなにぬねのはばぱひびぴふぶぷへべぺほぼぽまみむめもゃやゅゆょよらりるれろゎわをん'];
for (const ch of HIRAGANA) if (!kvg[ch]) errors.push(`ひらがなの書き順データが無い: ${ch}`);
const strokeChars = [...new Set([...LIST4, ...WRITE_CHARS, ...HIRAGANA])].filter((c) => kvg[c]);
const strokes = Object.fromEntries(strokeChars.map((c) => [c, kvg[c].paths]));
fs.writeFileSync('data/strokes.json', JSON.stringify(strokes));

const counts = {};
for (const q of QUESTIONS) counts[q.cat] = (counts[q.cat] || 0) + 1;
console.log('questions:', QUESTIONS.length, counts);
console.log('kanji4:', LIST4.length, ' stroke chars:', strokeChars.length,
  ' strokes.json:', (fs.statSync('data/strokes.json').size / 1024).toFixed(0) + 'KB');
if (errors.length) { console.log('\n警告:\n' + errors.join('\n')); process.exitCode = 1; }
