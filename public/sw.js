// Offline support: cache the app shell, always fetch live data from the network.
const CACHE = "botfolio-v1";
const SHELL = [
  "/", "/league", "/battle", "/pro", "/bot.html", "/styles.css", "/manifest.webmanifest",
  "/js/common.js", "/js/chart.js", "/js/describe.js", "/js/home.js", "/js/bot.js", "/js/battle.js",
  "/icons/icon.svg", "/icons/icon-192.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  // Network first so updates show up immediately; fall back to the cache offline.
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(event.request).then((hit) => hit || (url.pathname.startsWith("/bot/") ? caches.match("/bot.html") : caches.match("/"))),
      ),
  );
});
