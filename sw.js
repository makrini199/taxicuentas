// TXpro service worker. The cache name carries the app version, so a new
// release fetches everything fresh and the old cache is dropped on activate.
const VERSION = "1.7.2";
const CACHE = `txpro-${VERSION}`;
const SHELL = [
  "./",
  "./index.html",
  "./privacidad.html",
  "./app.js",
  "./vendor/react.production.min.js",
  "./vendor/react-dom.production.min.js",
  "./manifest.webmanifest",
  "./eventos.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon.png",
  "./fonts/dmsans.css",
  "./fonts/dmsans-latin.woff2",
  "./fonts/dmsans-latin-ext.woff2",
];

self.addEventListener("install", (event) => {
  // No skipWaiting here: a driver mid-entry should never be reloaded from under
  // them. The page offers the update and calls SKIP_WAITING when they accept.
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  // Pages come from the network when there is one, so a fresh deploy is picked
  // up on the next open; the cache is the offline fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(request).then((hit) => hit || caches.match("./index.html")))
    );
    return;
  }

  // El calendario de días fuertes cambia sin que cambie la versión de la app,
  // así que aquí la caché va detrás: primero la red, y lo guardado solo como
  // red de seguridad para el que esté sin cobertura.
  if (new URL(request.url).pathname.endsWith("/eventos.json")) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(request).then((hit) => hit || Response.json({ eventos: [] })))
    );
    return;
  }

  // Everything else is versioned by the cache name, so serving from cache is safe.
  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ||
        fetch(request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
          }
          return res;
        })
    )
  );
});
