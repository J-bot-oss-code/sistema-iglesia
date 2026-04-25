/* Simple service worker: offline + auto-update on fetch */

const CACHE_VERSION = "v1";
const CACHE_NAME = `sistema-iglesia-${CACHE_VERSION}`;

// Rutas esenciales (relativas al origen donde se hospeda)
const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./styles.css",
  "./script.js",
  "./manifest.json",
  "./service-worker.js",
  "./icons/icon-192.svg",
  "./icons/icon-512.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(PRECACHE_URLS);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navegación (HTML): network-first para “actualizar cuando cambie”
  if (req.mode === "navigate" || (req.destination === "document" && req.headers.get("accept")?.includes("text/html"))) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(CACHE_NAME);
          cache.put("./index.html", fresh.clone());
          return fresh;
        } catch {
          const cached = await caches.match("./index.html");
          return cached || new Response("Sin conexión.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
        }
      })()
    );
    return;
  }

  // Assets: cache-first + actualización en segundo plano (stale-while-revalidate simple)
  event.respondWith(
    (async () => {
      const cached = await caches.match(req, { ignoreSearch: true });
      const fetchPromise = fetch(req)
        .then(async (fresh) => {
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, fresh.clone());
          return fresh;
        })
        .catch(() => null);

      return cached || (await fetchPromise) || new Response("Sin conexión.", { status: 503 });
    })()
  );
});

