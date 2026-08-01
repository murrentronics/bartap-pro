// Bartendaz Pro — Service Worker (offline-first, v4)
//
// Cache strategy by request type:
//
//  ┌─────────────────────────────────────────────────┬──────────────────────────────────┐
//  │ Request type                                    │ Strategy                         │
//  ├─────────────────────────────────────────────────┼──────────────────────────────────┤
//  │ Supabase REST / Auth / Realtime (API)           │ Network-only (never cache)       │
//  │ Supabase Storage images (product-images bucket) │ Cache-first, bg refresh          │
//  │ Vite hashed JS/CSS assets (/assets/*.*)         │ Cache-first (immutable)          │
//  │ App shell (HTML, manifest, icons, sw.js)        │ Network-first, stale fallback    │
//  └─────────────────────────────────────────────────┴──────────────────────────────────┘

const VERSION      = "v4";
const SHELL_CACHE  = `bartendaz-shell-${VERSION}`;
const ASSET_CACHE  = `bartendaz-assets-${VERSION}`;
const IMAGE_CACHE  = `bartendaz-images-${VERSION}`;

const SUPABASE_PROJECT      = "vavfsgbrfpvolskscolf";
const SUPABASE_STORAGE_PATH = `/storage/v1/object/public/`;

// ── Shell files to precache on install ───────────────────────────────────────
// These are the minimum set needed to boot the app offline.
// SW will also cache JS/CSS assets the first time they are fetched.
const PRECACHE_SHELL = [
  "/",
  "/index.html",
  "/manifest.json",
];

// ── Install: precache shell + take control immediately ───────────────────────
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      // addAll will throw if any URL 404s — use individual fetch+put so one
      // missing file doesn't abort the entire install.
      Promise.allSettled(
        PRECACHE_SHELL.map((url) =>
          fetch(url, { cache: "reload" })
            .then((res) => { if (res.ok) return cache.put(url, res); })
            .catch(() => {/* ignore — will be cached on first navigation */})
        )
      )
    )
  );
  self.skipWaiting();
});

// ── Activate: delete stale caches from old versions ──────────────────────────
self.addEventListener("activate", (e) => {
  const KEEP = [SHELL_CACHE, ASSET_CACHE, IMAGE_CACHE];
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Message: warm caches from the app ────────────────────────────────────────
self.addEventListener("message", (e) => {
  if (!e.data) return;

  // { type: "CACHE_IMAGES", urls: string[] }
  if (e.data.type === "CACHE_IMAGES" && Array.isArray(e.data.urls)) {
    warmImageCache(e.data.urls);
  }

  // { type: "CACHE_ASSETS", urls: string[] }
  if (e.data.type === "CACHE_ASSETS" && Array.isArray(e.data.urls)) {
    caches.open(ASSET_CACHE).then((cache) => {
      e.data.urls.forEach((url) => {
        cache.match(url).then((hit) => {
          if (!hit) fetch(url).then((r) => { if (r.ok) cache.put(url, r); }).catch(() => {});
        });
      });
    });
  }

  // { type: "SKIP_WAITING" } — sent by UpdateBanner to activate new SW immediately
  if (e.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

async function warmImageCache(urls) {
  const cache = await caches.open(IMAGE_CACHE);
  await Promise.allSettled(
    urls.map(async (url) => {
      if (await cache.match(url)) return; // already warm
      try {
        const res = await fetch(url, { mode: "cors" });
        if (res.ok) await cache.put(url, res);
      } catch { /* offline — skip silently */ }
    })
  );
}

// ── Fetch: routing ────────────────────────────────────────────────────────────
self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // ── Skip: non-http(s) schemes (chrome-extension, etc.) ────────────────────
  if (!url.protocol.startsWith("http")) return;

  const isSupabase = url.hostname.includes(SUPABASE_PROJECT + ".supabase.co");

  // ── Supabase Storage images → stale-while-revalidate ──────────────────────
  if (isSupabase && url.pathname.includes(SUPABASE_STORAGE_PATH)) {
    e.respondWith(
      caches.open(IMAGE_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const fetchPromise = fetch(request)
          .then((res) => { if (res.ok) cache.put(request, res.clone()); return res; })
          .catch(() => cached);
        return cached ?? fetchPromise;
      })
    );
    return;
  }

  // ── All other Supabase requests (REST, auth, realtime) → network-only ─────
  if (isSupabase) return;

  // ── Vite hashed assets → cache-first (content-addressed = immutable) ──────
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

  // ── App shell: network-first with offline fallback ────────────────────────
  // This covers: /index.html, /manifest.json, /logo.png, navigation requests
  e.respondWith(
    fetch(request)
      .then((res) => {
        // Cache every successful shell response (including index.html)
        if (res.ok) {
          caches.open(SHELL_CACHE).then((c) => c.put(request, res.clone()));
        }
        return res;
      })
      .catch(async () => {
        // Network unavailable — serve from cache
        const cached = await caches.match(request);
        if (cached) return cached;

        // SPA fallback: any missed navigation gets the root shell
        // The HashRouter handles all client-side routing so / is always correct.
        if (request.mode === "navigate") {
          const root =
            (await caches.match("/index.html")) ||
            (await caches.match("/"));
          if (root) return root;
        }

        return new Response("Offline — please reload when connected", {
          status: 503,
          statusText: "Service Unavailable",
          headers: { "Content-Type": "text/plain" },
        });
      })
  );
});
