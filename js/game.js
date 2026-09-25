// やる気を引き出す仕組み：XP・レベル・称号・バッジ
import * as store from './store.js';
import { QUESTIONS, CAT_ORDER } from './bank.js';
import { status } from './srs.js';
import { sfx } from './sound.js';
import { toast } from './ui.js';

// レベル L に到達するのに必要な累計XP
export const xpFor = (L) => 80 * (L - 1) + 20 * (L - 1) * (L - 2);
export function levelInfo(xp = store.get().xp) {
  let L = 1;
  while (xp >= xpFor(L + 1)) L++;
  const cur = xpFor(L), next = xpFor(L + 1);
  return { level: L, into: xp - cur, need: next - cur, ratio: (xp - cur) / (next - cur), title: titleFor(L) };
}
const TITLES = [
  [1, '入門生'], [3, '見習い'], [5, '初段'], [8, '二段'], [11, '三段'], [14, '漢字ファイター'],
  [18, '漢字名人'], [22, '漢字師範'], [27, '漢字マスター'], [33, '漢字王'], [40, '漢字の神'],
];
export const titleFor = (L) => TITLES.filter(([l]) => L >= l).pop()[1];

export const xpForAnswer = (correct, combo) => (correct ? 10 + Math.min(combo, 10) * 2 : 2);

export const BADGES = [
  { id: 'first',    icon: '🌱', name: 'はじめの一歩',   desc: '初めて問題に答えた' },
  { id: 'combo10',  icon: '🔥', name: '10連続正解',     desc: '10問続けて正解した' },
  { id: 'combo30',  icon: '💥', name: '30連続正解',     desc: '30問続けて正解した' },
  { id: 'n100',     icon: '📗', name: '100問達成',      desc: '合計100問に答えた' },
  { id: 'n500',     icon: '📘', name: '500問達成',      desc: '合計500問に答えた' },
  { id: 'n1000',    icon: '📕', name: '1000問達成',     desc: '合計1000問に答えた' },
  { id: 'streak3',  icon: '📅', name: '三日坊主こえ',   desc: '3日連続で学習した' },
  { id: 'streak7',  icon: '🗓️', name: '一週間皆勤',     desc: '7日連続で学習した' },
  { id: 'streak30', icon: '🏯', name: '一か月皆勤',     desc: '30日連続で学習した' },
  { id: 'goal',     icon: '🎯', name: '目標達成',       desc: '1日の目標問題数をクリアした' },
  { id: 'perfect',  icon: '💮', name: 'パーフェクト',   desc: '練習で全問正解した' },
  { id: 'allcats',  icon: '🧭', name: '全分野制覇',     desc: '10分野すべてに挑戦した' },
  { id: 'master50', icon: '⭐', name: '習得50',         desc: '50問を「習得」した' },
  { id: 'master200',icon: '🌟', name: '習得200',        desc: '200問を「習得」した' },
  { id: 'exam',     icon: '📝', name: '模試デビュー',   desc: '模擬試験を受けた' },
  { id: 'pass',     icon: '🌸', name: 'サクラサク',     desc: '模擬試験で合格ライン（140点）をこえた' },
  { id: 'exam180',  icon: '👑', name: '180点の壁',      desc: '模擬試験で180点以上をとった' },
  { id: 'trace30',  icon: '🖌️', name: '書き順マスター', desc: '辞典で30字をなぞり書きした' },
  { id: 'early',    icon: '🌅', name: '早起き学習',     desc: '朝6時前に学習した' },
];

function unlock(id) {
  const s = store.get();
  if (s.badges[id]) return false;
  store.update((st) => { st.badges[id] = Date.now(); });
  const b = BADGES.find((x) => x.id === id);
  setTimeout(() => {
    sfx.badge();
    toast(`<b>バッジ獲得！</b> ${b.name}`, { icon: b.icon, ms: 3500, cls: 'badge-toast' });
  }, 600);
  return true;
}

/** 状況に応じてバッジを判定する */
export function checkBadges(ctx = {}) {
  const s = store.get();
  const items = Object.values(s.items);
  const total = items.reduce((a, b) => a + b.n, 0);
  if (total >= 1) unlock('first');
  if (total >= 100) unlock('n100');
  if (total >= 500) unlock('n500');
  if (total >= 1000) unlock('n1000');
  if (ctx.combo >= 10) unlock('combo10');
  if (ctx.combo >= 30) unlock('combo30');
  const sk = store.streak();
  if (sk >= 3) unlock('streak3');
  if (sk >= 7) unlock('streak7');
  if (sk >= 30) unlock('streak30');
  if (store.today().n >= s.settings.dailyGoal) unlock('goal');
  if (ctx.perfect) unlock('perfect');
  const cats = new Set(QUESTIONS.filter((q) => s.items[q.id]?.n).map((q) => q.cat));
  if (CAT_ORDER.every((c) => cats.has(c))) unlock('allcats');
  const mastered = items.filter((st) => status(st) === 'mastered').length;
  if (mastered >= 50) unlock('master50');
  if (mastered >= 200) unlock('master200');
  if (ctx.exam != null) {
    unlock('exam');
    if (ctx.exam >= 140) unlock('pass');
    if (ctx.exam >= 180) unlock('exam180');
  }
  if (Object.keys(s.traced).length >= 30) unlock('trace30');
  if (total > 0 && new Date().getHours() < 6 && new Date().getHours() >= 4) unlock('early');
}
