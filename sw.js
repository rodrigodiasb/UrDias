const CACHE = "triagem-gu-static-v11";
const ASSETS = [
  "./",
  "./index.html?v=11",
  "./styles.css?v=11",
  "./app.js?v=11",
  "./db.js",
  "./manifest.webmanifest",
  "./pwa-192.png",
  "./pwa-512.png",
  "./favicon.ico"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  const isVersioned = url.searchParams.has("v");

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);

      if (isVersioned) {
        try {
          const fresh = await fetch(req);
          cache.put(req, fresh.clone());
          return fresh;
        } catch {
          const cached = await cache.match(req);
          if (cached) return cached;
          return caches.match("./");
        }
      }

      const cached = await caches.match(req);
      if (cached) return cached;

      try {
        const fresh = await fetch(req);
        cache.put(req, fresh.clone());
        return fresh;
      } catch {
        return cached || caches.match("./");
      }
    })()
  );
});
