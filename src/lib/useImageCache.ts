/**
 * useImageCache.ts
 *
 * Warms product images so they load instantly on tab switches and are
 * available offline after the first visit.
 *
 * Two-layer approach:
 *  1. Service Worker cache — tells the SW to fetch & store each image URL
 *     in the IMAGE_CACHE so future requests are served from disk instantly.
 *  2. Browser in-memory preload — creates off-screen Image() objects so the
 *     browser's own memory cache is primed; tab switches hit L1 cache with
 *     zero network latency.
 *
 * Both layers are idempotent — calling this multiple times with the same
 * URLs is a no-op once they're cached.
 */

import { useEffect, useRef } from "react";

// Keep a module-level set so we never send the same URL twice across remounts
const warmedUrls = new Set<string>();

/** Send a batch of image URLs to the service worker for background caching. */
function sendToSW(urls: string[]): void {
  if (!("serviceWorker" in navigator) || !navigator.serviceWorker.controller) return;
  const fresh = urls.filter((u) => u && !warmedUrls.has(u));
  if (fresh.length === 0) return;
  fresh.forEach((u) => warmedUrls.add(u));
  navigator.serviceWorker.controller.postMessage({ type: "CACHE_IMAGES", urls: fresh });
}

/**
 * Preload images in the browser's own memory cache via hidden Image() objects.
 * This is the fastest path for same-session tab switches — no disk read needed.
 */
function preloadInMemory(urls: string[]): void {
  const fresh = urls.filter((u) => u && !warmedUrls.has(u));
  if (fresh.length === 0) return;
  fresh.forEach((u) => {
    warmedUrls.add(u);
    const img = new Image();
    img.src = u; // browser fetches and caches in memory; no DOM insertion needed
  });
}

/**
 * Also tells the SW to warm the hashed JS/CSS asset bundle so offline
 * tab switches don't hit uncached chunks.
 */
function warmAssets(): void {
  if (!("serviceWorker" in navigator) || !navigator.serviceWorker.controller) return;
  // Collect all hashed <script> and <link rel=stylesheet> src/href values
  const assetUrls: string[] = [];
  document.querySelectorAll<HTMLScriptElement>("script[src]").forEach((s) => {
    if (s.src && s.src.includes("/assets/")) assetUrls.push(s.src);
  });
  document.querySelectorAll<HTMLLinkElement>("link[rel=stylesheet][href]").forEach((l) => {
    if (l.href && l.href.includes("/assets/")) assetUrls.push(l.href);
  });
  if (assetUrls.length > 0) {
    navigator.serviceWorker.controller.postMessage({ type: "CACHE_ASSETS", urls: assetUrls });
  }
}

/**
 * Hook — pass it an array of image_url strings from your products list.
 * Call it whenever the products array changes (new fetch, realtime update, etc.)
 *
 * @example
 *   useImageCache(products.map(p => p.image_url).filter(Boolean))
 */
export function useImageCache(imageUrls: (string | null | undefined)[]): void {
  const assetsWarmedRef = useRef(false);

  useEffect(() => {
    const valid = imageUrls.filter((u): u is string => !!u);
    if (valid.length === 0) return;

    // Warm SW disk cache
    sendToSW(valid);
    // Warm browser memory cache
    preloadInMemory(valid);
  }, [imageUrls]);

  // Warm JS/CSS assets once per session when SW is ready
  useEffect(() => {
    if (assetsWarmedRef.current) return;

    const doWarm = () => {
      warmAssets();
      assetsWarmedRef.current = true;
    };

    if (navigator.serviceWorker?.controller) {
      doWarm();
    } else if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready.then(doWarm).catch(() => {});
    }
  }, []);
}
