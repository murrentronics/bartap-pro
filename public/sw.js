// Bartendaz Pro — Service Worker (offline-first, v3)
//
// Cache strategy by request type:
//
//  ┌─────────────────────────────────────────────────┬──────────────────────────────────┐
//  │ Request type                                    │ Strategy                         │
//  ├─────────────────────────────────────────────────┼──────────────────────────────────┤
//  │ Supabase REST / Auth / Realtime (API)           │ Network-only (never cache)       │
//  │ Supabase Storage images (product-images bucket) │ Cache-first, bg refresh          │
//  │ Vite hashed JS/CSS assets (/assets/*.*)         │ Cache-first (immutable)          │
//  │ App shell (HTML, manifest, icons, sw.js)        │ Network-first, cache fallback    │
//  └─────────────────────────────────────────────────┴──────────────────────────────────┘

const SHELL_CACHE  = "bartendaz-shell-v3";
const ASSET_CACHE  = "bartendaz-assets-v3";
const IMAGE_CACHE  = "bartendaz-images-v3";

// Supabase project — storage URLs contain this
const SUPABASE_PROJECT = "vavfsgbrfpvolskscolf";
const SUPABASE_STORAGE_PATH = `/storage/v1/object/public/`;

// ── Install: take over immediately ───────────────────────────────────────────
self.addEventListener("install", (e) => {
  // Precache the bare minimum shell so the app opens offline after install
  e.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      cache.addAll(["/", "/manifest.json"]).catch(() => {})
    )
  );
  self.skipWaiting();
});

// ── Activate: delete old caches ──────────────────────────────────────────────
self.addEventListener("activate", (e) => {
  const KEEP = [SHELL_CACHE, ASSET_CACHE, IMAGE_CACHE];
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Message: app sends image URLs to warm the cache ──────────────────────────
self.addEventListener("message", (e) => {
  if (!e.data) return;

  // { type: "CACHE_IMAGES", urls: string[] }
  if (e.data.type === "CACHE_IMAGES" && Array.isArray(e.data.urls)) {
    warmImageCache(e.data.urls);
  }

  // { type: "CACHE_ASSETS", urls: string[] }  — called after app shell loads
  if (e.data.type === "CACHE_ASSETS" && Array.isArray(e.data.urls)) {
    caches.open(ASSET_CACHE).then((cache) => {
      e.data.urls.forEach((url) => {
        cache.match(url).then((hit) => {
          if (!hit) fetch(url).then((r) => { if (r.ok) cache.put(url, r); }).catch(() => {});
        });
      });
    });
  }
});

/** Fetch and store each image URL that isn't already cached. */
async function warmImageCache(urls) {
  const cache = await caches.open(IMAGE_CACHE);
  await Promise.allSettled(
    urls.map(async (url) => {
      const hit = await cache.match(url);
      if (hit) return; // already warm
      try {
        const res = await fetch(url, { mode: "cors" });
        if (res.ok) await cache.put(url, res);
      } catch {
        // Network unavailable — silently skip
      }
    })
  );
}

// ── Fetch: routing ────────────────────────────────────────────────────────────
self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const isSupabase = url.hostname.includes(SUPABASE_PROJECT + ".supabase.co");

  // ── Supabase Storage images → cache-first, stale-while-revalidate ─────────
  // These are public CDN-style URLs — safe to serve from cache, refresh in bg.
  if (isSupabase && url.pathname.includes(SUPABASE_STORAGE_PATH)) {
    e.respondWith(
      caches.open(IMAGE_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        // Background refresh so next visit gets the latest image
        const fetchPromise = fetch(request)
          .then((res) => {
            if (res.ok) cache.put(request, res.clone());
            return res;
          })
          .catch(() => cached); // offline: swallow error, fall back to cached below
        // Serve cache immediately if available; otherwise wait for network
        return cached ?? fetchPromise;
      })
    );
    return;
  }

  // ── Supabase REST / Auth / Realtime API → network-only ────────────────────
  if (isSupabase) return;

  // ── Vite hashed assets (/assets/…-[hash].js/css/etc.) → cache-first ───────
  // Filenames are content-addressed so cache entries are immutable.
  const isHashedAsset =
    url.pathname.startsWith("/assets/") &&
    /[.-][a-zA-Z0-9_-]{7,}\.(js|css|woff2?|png|jpg|jpeg|svg|webp|ico)(\?.*)?$/.test(url.pathname);

  if (isHashedAsset) {
    e.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const fresh = await fetch(request);
        if (fresh.ok) cache.put(request, fresh.clone());
        return fresh;
      })
    );
    return;
  }

  // ── App shell: network-first, offline fallback ────────────────────────────
  e.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok) {
          caches.open(SHELL_CACHE).then((c) => c.put(request, res.clone()));
        }
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        // SPA fallback — any navigation that missed cache gets the root shell
        if (request.mode === "navigate") {
          const root = await caches.match("/") || await caches.match("/index.html");
          if (root) return root;
        }
        return new Response("Offline", { status: 503, statusText: "Service Unavailable" });
      })
  );
});
