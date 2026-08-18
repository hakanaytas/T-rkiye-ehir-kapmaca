// sw.js
// ÖNEMLİ: Her deploy'da CACHE_VERSION'ı artırın, aksi halde kullanıcılar
// eski (cache'lenmiş) sürümü görmeye devam eder.
const CACHE_VERSION = "fetih-v3";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./style.css",
  "./main.js",
  "./map.js",
  "./attack.js",
  "./chat.js",
  "./reactions.js",
  "./notifications.js",
  "./provinces-data.js",
  "./firebase-config.js",
  "./icon-192.png",
  "./icon-512.png",
  "./events.js",
  "./bubbles.js",
  "./provinceAlliances.js",
  "./minigame.js",
  "./challenge.js",
  "./finale.js",
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
  // Firebase/uzak istekleri her zaman ağdan al; sadece kendi statik dosyalarımızı cache'le.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, clone));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
