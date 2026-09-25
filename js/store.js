// 学習データの保存（localStorage）
const KEY = 'kanken4-dojo-v1';

export const DEFAULT_SETTINGS = {
  name: '',
  sound: true,
  volume: 0.7,
  judge: 'auto',        // auto | offline | self
  strict: 'normal',     // easy | normal | strict
  pencilOnly: false,    // Apple Pencil のみで書く
  autoPalm: true,       // ペンを検出したら指の入力を無視
  dailyGoal: 30,
  sessionSize: 10,
  newRatio: 0.3,
  examDate: '',
  theme: 'auto',        // auto | light | dark
  kanaInput: 'hand',    // ひらがなの入力：hand（手書き）| pad（かなパッド）| keyboard
  speech: false,        // 答えを読み上げる
  showGuide: true,      // マス目の十字線
  sheetMode: 'exam',    // 答案用紙モード：exam（模試だけ）| all（練習でも）| off
};

const fresh = () => ({
  v: 1,
  created: Date.now(),
  settings: { ...DEFAULT_SETTINGS },
  items: {},      // 問題ID → 記憶の状態
  days: {},       // 'YYYY-MM-DD' → { n, c, xp }
  xp: 0,
  bestCombo: 0,
  badges: {},     // バッジID → 獲得日時
  exams: [],      // 模試の記録
  kanjiSeen: {},  // 辞典で学んだ漢字
  traced: {},     // なぞり書きした漢字
});

let state = load();
let saveTimer = null;
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw);
      const base = fresh();
      return { ...base, ...d, settings: { ...base.settings, ...(d.settings || {}) } };
    }
  } catch (e) { console.warn('load failed', e); }
  return fresh();
}

export const get = () => state;
export const settings = () => state.settings;

export function update(fn) {
  fn(state);
  scheduleSave();
  listeners.forEach((l) => l(state));
}
export const subscribe = (fn) => (listeners.add(fn), () => listeners.delete(fn));

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 250);
}
export function saveNow() {
  clearTimeout(saveTimer);
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) { console.warn('save failed', e); }
}
addEventListener('pagehide', saveNow);
document.addEventListener('visibilitychange', () => document.hidden && saveNow());

// ストレージを「永続」扱いにしてもらう（Safari が勝手に消すのを防ぐ）
export async function requestPersist() {
  try { if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist(); }
  catch { /* 非対応 */ }
}

export function exportJSON() {
  return JSON.stringify({ app: 'kanken4-dojo', exported: new Date().toISOString(), data: state }, null, 1);
}
export function importJSON(text) {
  const obj = JSON.parse(text);
  const d = obj.data || obj;
  if (!d || typeof d !== 'object' || !d.items) throw new Error('バックアップファイルの形式が違います');
  const base = fresh();
  state = { ...base, ...d, settings: { ...base.settings, ...(d.settings || {}) } };
  saveNow();
  listeners.forEach((l) => l(state));
}
export function resetAll() {
  const keepSettings = state.settings;
  state = fresh();
  state.settings = keepSettings;
  saveNow();
  listeners.forEach((l) => l(state));
}

// ---- 日付ヘルパー ----
export const dayKey = (t = Date.now()) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export function streak() {
  let n = 0;
  const d = new Date();
  if (!state.days[dayKey(d)]) d.setDate(d.getDate() - 1); // 今日まだなら昨日から数える
  while (state.days[dayKey(d)]?.n > 0) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
export const today = () => state.days[dayKey()] || { n: 0, c: 0, xp: 0 };

// ---- 模試の途中保存 ----
const EXAM_KEY = 'kanken4-dojo-exam';
export const saveExamDraft = (d) => { try { localStorage.setItem(EXAM_KEY, JSON.stringify(d)); } catch { /* 容量不足 */ } };
export const loadExamDraft = () => { try { return JSON.parse(localStorage.getItem(EXAM_KEY)); } catch { return null; } };
export const clearExamDraft = () => localStorage.removeItem(EXAM_KEY);
