// Offline support: cache the app shell, always fetch live data from the network.
const CACHE = "clutch-v1";
const SHELL = [
  "/", "/bots", "/leaders", "/pro", "/me", "/privacy", "/game.html", "/bot.html", "/styles.css", "/manifest.webmanifest",
  "/js/common.js", "/js/chart.js", "/js/today.js", "/js/game.js", "/js/bots.js", "/js/bot-stats.js", "/js/rules.js",
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
        caches.match(event.request).then((hit) => {
          if (hit) return hit;
          if (url.pathname.startsWith("/game/")) return caches.match("/game.html");
          if (url.pathname.startsWith("/bot/")) return caches.match("/bot.html");
          return caches.match("/");
        }),
      ),
  );
});
