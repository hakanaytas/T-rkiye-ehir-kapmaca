// sw.js
// ÖNEMLİ: Her deploy'da CACHE_VERSION'ı artırın, aksi halde kullanıcılar
// eski (cache'lenmiş) sürümü görmeye devam eder.
const CACHE_VERSION = "fetih-v2";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./style.css",
  "./main.js",
  "./map.js",
  "./economy.js",
  "./war.js",
  "./alliance.js",
  "./chat.js",
  "./notifications.js",
  "./leaderboard.js",
  "./provinces-data.js",
  "./firebase-config.js",
  "./icon-192.png",
  "./icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // Firebase / dış API çağrılarına dokunma; sadece kendi statik dosyalarımızı cache'le.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((res) => {
        const clone = res.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, clone));
        return res;
      }).catch(() => cached);
    })
  );
});
