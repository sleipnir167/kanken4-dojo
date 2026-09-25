// Service Worker：アプリ本体をキャッシュしてオフラインでも使えるようにする
const VERSION = 'kanken4-dojo-v4';
const CORE = [
  './', './index.html', './manifest.webmanifest', './css/style.css',
  './js/app.js', './js/bank.js', './js/store.js', './js/srs.js', './js/sound.js', './js/fx.js',
  './js/pad.js', './js/kanapad.js', './js/ui.js', './js/game.js', './js/mascot.js', './js/question.js',
  './js/recognizer.js', './js/strokes.js', './js/strokeanim.js', './js/checkpoints.js',
  './js/screens/home.js', './js/screens/cats.js', './js/screens/quiz.js', './js/screens/exam.js',
  './js/screens/dict.js', './js/screens/stats.js', './js/screens/settings.js',
  './data/questions.js', './data/kanji.js', './data/strokes.json', './data/strokeinfo.json',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE)));
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return; // 手書き認識API(POST)などはそのまま
  const url = new URL(req.url);

  // Google Fonts：キャッシュ優先で裏で更新
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(staleWhileRevalidate(req, 'fonts'));
    return;
  }
  if (url.origin !== location.origin) return;

  // アプリ本体：ネット優先（すぐ更新が届く）→ つながらなければキャッシュ
  e.respondWith(networkFirst(req));
});

async function networkFirst(req) {
  const cache = await caches.open(VERSION);
  try {
    const res = await Promise.race([
      fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }), // HTTPキャッシュも再検証
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3500)),
    ]);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === 'navigate') return cache.match('./index.html');
    throw new Error('offline');
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  const net = fetch(req).then((res) => {
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
    return res;
  }).catch(() => hit);
  return hit || net;
}
