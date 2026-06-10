// Service Worker do módulo Entregas.
// Estratégia simples: cache-first pros assets estáticos (Next chunks, CSS, fonts),
// network-only pro restante (HTML, APIs). Permite que a tela do motorista
// continue renderizando mesmo offline depois da primeira visita.
//
// IMPORTANTE: este SW NÃO cacheia respostas de Server Actions (POST) — quem
// cuida disso é o client via IndexedDB + fila de sync (src/lib/offline/db.ts).

const CACHE_NAME = "panas-entregas-v1";
const STATIC_PATHS = [
  "/manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(STATIC_PATHS).catch(() => undefined)
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Pular métodos que não são GET (POST/PUT/DELETE — Server Actions e API)
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Pula requests externos (mapas, etc) e Supabase
  if (url.origin !== self.location.origin) return;

  // Cache-first pros estáticos do Next
  const isStatic =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/static/") ||
    /\.(css|js|woff2?|ttf|otf|png|jpg|jpeg|svg|ico|webp)$/.test(url.pathname);

  if (isStatic) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request)
          .then((resp) => {
            const cloned = resp.clone();
            caches.open(CACHE_NAME).then((c) => c.put(request, cloned));
            return resp;
          })
          .catch(() => cached || Response.error());
      })
    );
    return;
  }

  // Pras páginas HTML: network-first com fallback ao cache
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((resp) => {
          const cloned = resp.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, cloned));
          return resp;
        })
        .catch(() => caches.match(request).then((c) => c || caches.match("/motorista")))
    );
    return;
  }
});
