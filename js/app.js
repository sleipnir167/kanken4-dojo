// アプリ本体：画面の切りかえ・テーマ・Service Worker
import * as store from './store.js';
import { loadStrokes } from './strokes.js';
import { sfx } from './sound.js';
import { toast } from './ui.js';
import { renderHome } from './screens/home.js';
import { renderCats } from './screens/cats.js';
import { renderQuiz } from './screens/quiz.js';
import { renderExam } from './screens/exam.js';
import { renderDict } from './screens/dict.js';
import { renderStats } from './screens/stats.js';
import { renderSettings } from './screens/settings.js';

const SCREENS = {
  home: { render: renderHome, tab: 'home' },
  cats: { render: renderCats, tab: 'cats' },
  quiz: { render: renderQuiz, full: true },
  exam: { render: renderExam, tab: 'exam' },
  dict: { render: renderDict, tab: 'dict' },
  stats: { render: renderStats, tab: 'stats' },
  settings: { render: renderSettings, tab: 'settings' },
};
const TABS = [
  ['home', 'ホーム', '<path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z"/>'],
  ['cats', '練習', '<path d="M5 4h10l4 4v12H5z M15 4v4h4 M8 12h8 M8 16h6"/>'],
  ['exam', '模試', '<path d="M12 3l2.6 5.6 6 .6-4.5 4 1.3 6L12 16.3 6.6 19.2l1.3-6-4.5-4 6-.6z"/>'],
  ['dict', '辞典', '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z M4 21V5 M8 7h7 M8 11h5"/>'],
  ['stats', '記録', '<path d="M4 20V10 M10 20V4 M16 20v-7 M22 20H2"/>'],
];

let cleanup = null;
let leaveHooks = [];
/** 画面を離れるときに呼ばれる処理を登録 */
export const onLeave = (fn) => leaveHooks.push(fn);
let transient = null; // 画面間で受け渡す一時データ

export function go(name, params = {}, data = null) {
  transient = data;
  const qs = new URLSearchParams(params).toString();
  const hash = `#/${name}${qs ? `?${qs}` : ''}`;
  if (location.hash === hash) route(); else location.hash = hash;
}
export const takeTransient = () => { const d = transient; transient = null; return d; };

function parse() {
  const h = location.hash.replace(/^#\/?/, '');
  const [name, qs] = h.split('?');
  return { name: SCREENS[name] ? name : 'home', params: Object.fromEntries(new URLSearchParams(qs || '')) };
}

function route() {
  const { name, params } = parse();
  const scr = SCREENS[name];
  cleanup?.();
  cleanup = null;
  leaveHooks.forEach((f) => f());
  leaveHooks = [];
  const app = document.getElementById('app');
  app.innerHTML = '';
  const main = document.createElement('main');
  main.className = `screen screen-${name}`;
  app.appendChild(main);
  if (!scr.full) app.appendChild(tabbar(scr.tab));
  document.body.classList.toggle('fullscreen-mode', !!scr.full);
  window.scrollTo(0, 0);
  cleanup = scr.render(main, params) || null;
}

function tabbar(active) {
  const nav = document.createElement('nav');
  nav.className = 'tabbar';
  nav.innerHTML = TABS.map(([id, label, icon]) => `
    <a href="#/${id}" class="tab${id === active ? ' active' : ''}" aria-label="${label}">
      <svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg><span>${label}</span></a>`).join('');
  nav.addEventListener('click', () => sfx.tap());
  return nav;
}

export function applyTheme() {
  const t = store.settings().theme;
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]').content = dark ? '#16151c' : '#d9442e';
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);

async function registerSW() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  try {
    const reg = await navigator.serviceWorker.register('sw.js');
    const offer = (w) => {
      window.__applyUpdate = () => w.postMessage('skipWaiting');
      toast('新しいバージョンがあります。<button class="toast-btn" onclick="__applyUpdate()">更新</button>', { icon: '✨', ms: 12000 });
    };
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw?.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) offer(nw);
      });
    });
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return;
      reloaded = true;
      store.saveNow();
      location.reload();
    });
  } catch (e) { console.warn('SW registration failed', e); }
}

async function start() {
  applyTheme();
  await loadStrokes().catch((e) => console.warn('stroke data', e));
  addEventListener('hashchange', route);
  route();
  registerSW();
  store.requestPersist();
}
start();
