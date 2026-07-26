// Bartendaz Pro — Service Worker
// Minimal SW: just enough to make the PWA installable on Android.
// Network-first for all app assets so new builds are always fetched immediately.
// Cache version changes on every deploy — clients pick up the new SW instantly.

const CACHE = "bartendaz-v" + Date.now();
const PRECACHE = ["/", "/manifest.json"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  // Only handle GET requests
  if (e.request.method !== "GET") return;
  // Let Supabase API calls go through the network always
  if (e.request.url.includes("supabase.co")) return;

  // Network-first — always fetch fresh, fall back to cache only when offline.
  // Vite fingerprints JS/CSS filenames so no manual cache busting needed.
  e.respondWith(
    fetch(e.request)
      .catch(() => caches.match(e.request))
  );
});
