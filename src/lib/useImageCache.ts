/**
 * useImageCache.ts
 *
 * Three-layer image caching strategy for instant, lag-free rendering:
 *
 *  Layer 1 — IndexedDB blob cache (fastest for returning visits)
 *    On every mount we pull stored Blobs out of IndexedDB and convert them
 *    to objectURLs. The <img src> is swapped to the objectURL immediately,
 *    so images render from local storage with zero network latency.
 *
 *  Layer 2 — Background fetch + img.decode() pre-decode
 *    For any URL not yet in IndexedDB we fetch the image, force-decode it
 *    with img.decode() (guarantees the pixel data is in GPU memory before
 *    the first paint), then store the Blob in IndexedDB for next time.
 *    The returned objectURL map is updated so React re-renders with the
 *    freshly fetched image.
 *
 *  Layer 3 — Service Worker disk cache
 *    Every fetched URL is also sent to the SW IMAGE_CACHE so subsequent
 *    network requests are served from disk (stale-while-revalidate).
 *    We handle the common case where the SW is not yet active on first
 *    page load by waiting for navigator.serviceWorker.ready.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import {
  cacheImageBlob,
  loadCachedImageObjectUrls,
  pruneImageBlobCache,
} from "@/lib/offlineCache";

// Module-level set: tracks URLs we have already fetched this session so
// background work is never duplicated across component re-mounts.
const fetchedThisSession = new Set<string>();

// ── Service Worker helpers ────────────────────────────────────────────────────

function sendToSW(urls: string[]): void {
  const dispatch = (ctrl: ServiceWorker) =>
    ctrl.postMessage({ type: "CACHE_IMAGES", urls });

  if (!("serviceWorker" in navigator)) return;
  if (navigator.serviceWorker.controller) {
    dispatch(navigator.serviceWorker.controller);
  } else {
    // SW not yet controlling this page (first install) — wait until it is
    navigator.serviceWorker.ready
      .then((reg) => { if (reg.active) dispatch(reg.active); })
      .catch(() => {});
  }
}

function warmAssets(): void {
  const dispatch = (ctrl: ServiceWorker) => {
    const urls: string[] = [];
    document.querySelectorAll<HTMLScriptElement>("script[src]").forEach((s) => {
      if (s.src?.includes("/assets/")) urls.push(s.src);
    });
    document.querySelectorAll<HTMLLinkElement>("link[rel=stylesheet][href]").forEach((l) => {
      if (l.href?.includes("/assets/")) urls.push(l.href);
    });
    if (urls.length) ctrl.postMessage({ type: "CACHE_ASSETS", urls });
  };

  if (!("serviceWorker" in navigator)) return;
  if (navigator.serviceWorker.controller) {
    dispatch(navigator.serviceWorker.controller);
  } else {
    navigator.serviceWorker.ready
      .then((reg) => { if (reg.active) dispatch(reg.active); })
      .catch(() => {});
  }
}

// ── Core fetch + decode + store ───────────────────────────────────────────────

/**
 * Fetch a single image URL, force-decode it so it is in GPU memory,
 * store the Blob in IndexedDB, and return a fresh objectURL.
 * Returns null on any failure (network error, bad response, etc.)
 */
async function fetchDecodeAndStore(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { mode: "cors", cache: "force-cache" });
    if (!res.ok) return null;
    const blob = await res.blob();

    // Force the browser to fully decode the image before we call it "ready".
    // This eliminates the "blank until interaction" issue caused by deferred decoding.
    const objectUrl = URL.createObjectURL(blob);
    const img = new Image();
    img.src = objectUrl;
    await img.decode(); // throws if decode fails — caught below

    // Persist the blob so next visit serves from IndexedDB (zero network)
    await cacheImageBlob(url, blob);

    return objectUrl;
  } catch {
    return null;
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * useImageCache
 *
 * Pass the raw image_url strings from your product list.
 * Returns a helper function `imgSrc(url)` that returns the best available
 * source for that URL:
 *   - an objectURL backed by a local Blob  (instant, from IndexedDB)
 *   - the original URL                     (network, while blob is loading)
 *   - null                                 (no URL provided)
 *
 * The returned `imgSrc` reference is stable — it only changes when new
 * objectURLs become available, triggering a targeted re-render.
 */
export function useImageCache(
  imageUrls: (string | null | undefined)[]
): (url: string | null | undefined) => string | null {
  // Render-trigger counter — incremented whenever new objectURLs are stored.
  // Consumers that memoize derived data (e.g. resolvedImgMap) will re-compute
  // when this bumps, picking up fresh values from objectUrlMapRef.
  const [, setVersion] = useState(0);
  const objectUrlMapRef = useRef<Map<string, string>>(new Map());
  const assetsWarmedRef = useRef(false);
  // Track which objectURLs we created so we can revoke them on unmount
  const ownedObjectUrls = useRef<Set<string>>(new Set());

  // Stable helper: returns objectURL if available, else original URL.
  // Reads directly from the ref (always current) so the callback reference
  // never changes — React.memo'd consumers (ProductCard) won't re-render just
  // because a background image finished loading for a different product.
  const imgSrc = useCallback(
    (url: string | null | undefined): string | null => {
      if (!url) return null;
      return objectUrlMapRef.current.get(url) ?? url;
    },
    [] // stable forever — ref reads are always fresh without a new closure
  );

  useEffect(() => {
    const valid = imageUrls.filter((u): u is string => !!u);
    if (valid.length === 0) return;

    let cancelled = false;

    const run = async () => {
      // ── Layer 1: load all blobs already in IndexedDB ──────────────────────
      const cached = await loadCachedImageObjectUrls(valid);
      if (cancelled) {
        // Revoke any objectURLs we just created since we won't use them
        cached.forEach((oUrl) => URL.revokeObjectURL(oUrl));
        return;
      }

      if (cached.size > 0) {
        cached.forEach((oUrl, url) => {
          objectUrlMapRef.current.set(url, oUrl);
          ownedObjectUrls.current.add(oUrl);
        });
        setVersion((v) => v + 1);
      }

      // ── Layer 2: background-fetch URLs not yet in IndexedDB ──────────────
      const missing = valid.filter(
        (u) => !cached.has(u) && !fetchedThisSession.has(u)
      );

      if (missing.length === 0) return;

      // Tell SW to cache these too
      sendToSW(missing);

      // Fetch, decode, store — one at a time to avoid hammering the network
      // but still make progress quickly. We do them concurrently in small
      // batches of 3 to balance speed vs. memory pressure.
      const BATCH = 3;
      for (let i = 0; i < missing.length; i += BATCH) {
        if (cancelled) return;
        const batch = missing.slice(i, i + BATCH);
        const results = await Promise.all(
          batch.map(async (url) => {
            fetchedThisSession.add(url); // mark early so parallel calls skip it
            const oUrl = await fetchDecodeAndStore(url);
            return { url, oUrl };
          })
        );
        if (cancelled) {
          results.forEach(({ oUrl }) => { if (oUrl) URL.revokeObjectURL(oUrl); });
          return;
        }
        let changed = false;
        results.forEach(({ url, oUrl }) => {
          if (oUrl) {
            // Revoke old objectURL for this url if we had one
            const prev = objectUrlMapRef.current.get(url);
            if (prev && prev !== oUrl) {
              URL.revokeObjectURL(prev);
              ownedObjectUrls.current.delete(prev);
            }
            objectUrlMapRef.current.set(url, oUrl);
            ownedObjectUrls.current.add(oUrl);
            changed = true;
          }
        });
        if (changed) setVersion((v) => v + 1);
      }

      // ── Cleanup: prune blobs for images no longer in the product list ─────
      pruneImageBlobCache(new Set(valid)).catch(() => {});
    };

    run();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrls]);

  // Warm JS/CSS assets once per session
  useEffect(() => {
    if (assetsWarmedRef.current) return;
    assetsWarmedRef.current = true;
    warmAssets();
  }, []);

  // Revoke all owned objectURLs on full unmount (page navigation)
  useEffect(() => {
    return () => {
      ownedObjectUrls.current.forEach((u) => URL.revokeObjectURL(u));
      ownedObjectUrls.current.clear();
      objectUrlMapRef.current.clear();
    };
  }, []);

  return imgSrc;
}
