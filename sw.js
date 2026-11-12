// TXpro service worker. The cache name carries the app version, so a new
// release fetches everything fresh and the old cache is dropped on activate.
const VERSION = "1.17.0";
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
  "./trenes.json",
  "./mapa-madrid.json",
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
  if (/\/(eventos|trenes)\.json$/.test(new URL(request.url).pathname)) {
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

// AVISOS AL MÓVIL. El servidor manda, la tarde antes, lo que hay en Madrid al
// día siguiente. Aquí solo se enseña el aviso y, al tocarlo, se abre la app en
// el Calendario. Del aviso se acepta lo justo: un título, un texto y poco más.
self.addEventListener("push", (event) => {
  let a = {};
  try { a = event.data ? event.data.json() : {}; } catch { a = {}; }
  const titulo = typeof a.titulo === "string" && a.titulo ? a.titulo.slice(0, 120) : "TXpro";
  event.waitUntil(
    self.registration.showNotification(titulo, {
      body: typeof a.cuerpo === "string" ? a.cuerpo.slice(0, 400) : "",
      icon: "./icons/icon-192.png",
      badge: "./icons/icon-192.png",
      tag: typeof a.etiqueta === "string" ? a.etiqueta.slice(0, 40) : "txpro",
      lang: "es",
      data: { url: a.url === "./#calendario" ? a.url : "./" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destino = (event.notification.data && event.notification.data.url) || "./";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((abiertas) => {
      for (const c of abiertas) {
        if ("focus" in c) {
          if (destino !== "./") c.postMessage({ type: "IR_A", vista: "calendario" });
          return c.focus();
        }
      }
      return self.clients.openWindow(new URL(destino, self.registration.scope).href);
    })
  );
});
