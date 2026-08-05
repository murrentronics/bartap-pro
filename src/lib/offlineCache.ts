/**
 * offlineCache.ts
 *
 * IndexedDB-backed cache for data that needs to be available offline:
 *   - products        (register grid)
 *   - bar_session     (open/closed state)
 *   - credit_accounts (customer list in checkout)
 *
 * Strategy: always write to cache on a successful network fetch.
 *           read from cache when the network request fails / device is offline.
 *
 * All cache entries are keyed by ownerId so multi-owner chains work correctly.
 */

import { openDB, type IDBPDatabase } from "idb";

const DB_NAME    = "bartap-data-cache";
const DB_VERSION = 2;

// ── Typed records ─────────────────────────────────────────────────────────────

export interface CachedProduct {
  id: string;
  owner_id: string;
  name: string;
  category: string | null;
  price: number | string;
  cost_price?: number | string | null;
  image_url: string | null;
  stock?: number | null;
  is_pack?: boolean | null;
  pack_units?: number | null;
  pack_unit_price?: number | string | null;
  is_bottle?: boolean | null;
  shots_per_bottle?: number | null;
  shot_price?: number | string | null;
  is_out_of_stock?: boolean | null;
  [key: string]: unknown;
}

export interface CachedBarSession {
  bar_session_start: string | null;
  bar_closed_at: string | null;
}

export interface CachedCreditAccount {
  id: string;
  full_name: string;
  contact_number: string | null;
  balance_owed: number;
  status: string;
}

// ── DB setup ──────────────────────────────────────────────────────────────────

let _db: IDBPDatabase | null = null;

async function getDb(): Promise<IDBPDatabase> {
  if (_db) return _db;
  _db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Each store uses ownerId as the key — one record per owner
      if (!db.objectStoreNames.contains("products")) {
        db.createObjectStore("products"); // key = ownerId
      }
      if (!db.objectStoreNames.contains("bar_session")) {
        db.createObjectStore("bar_session"); // key = ownerId
      }
      if (!db.objectStoreNames.contains("credit_accounts")) {
        db.createObjectStore("credit_accounts"); // key = ownerId
      }
      // v2: image blobs keyed by image URL for instant local rendering
      if (!db.objectStoreNames.contains("image_blobs")) {
        db.createObjectStore("image_blobs"); // key = image URL
      }
    },
  });
  return _db;
}

// ── Products ──────────────────────────────────────────────────────────────────

/** Save the latest product list for an owner. */
export async function cacheProducts(ownerId: string, products: CachedProduct[]): Promise<void> {
  try {
    const db = await getDb();
    await db.put("products", products, ownerId);
  } catch (err) {
    console.warn("[offlineCache] Failed to cache products:", err);
  }
}

/** Return the cached product list, or [] if nothing is stored. */
export async function getCachedProducts(ownerId: string): Promise<CachedProduct[]> {
  try {
    const db = await getDb();
    return (await db.get("products", ownerId)) ?? [];
  } catch (err) {
    console.warn("[offlineCache] Failed to read cached products:", err);
    return [];
  }
}

// ── Bar session ───────────────────────────────────────────────────────────────

/** Save the latest bar open/close state. */
export async function cacheBarSession(ownerId: string, session: CachedBarSession): Promise<void> {
  try {
    const db = await getDb();
    await db.put("bar_session", session, ownerId);
  } catch (err) {
    console.warn("[offlineCache] Failed to cache bar session:", err);
  }
}

/** Return the cached bar session, or null if nothing is stored. */
export async function getCachedBarSession(ownerId: string): Promise<CachedBarSession | null> {
  try {
    const db = await getDb();
    return (await db.get("bar_session", ownerId)) ?? null;
  } catch (err) {
    console.warn("[offlineCache] Failed to read cached bar session:", err);
    return null;
  }
}

// ── Credit accounts ───────────────────────────────────────────────────────────

/** Save the latest customer list. */
export async function cacheCreditAccounts(ownerId: string, accounts: CachedCreditAccount[]): Promise<void> {
  try {
    const db = await getDb();
    await db.put("credit_accounts", accounts, ownerId);
  } catch (err) {
    console.warn("[offlineCache] Failed to cache credit accounts:", err);
  }
}

/** Return the cached customer list, or [] if nothing is stored. */
export async function getCachedCreditAccounts(ownerId: string): Promise<CachedCreditAccount[]> {
  try {
    const db = await getDb();
    return (await db.get("credit_accounts", ownerId)) ?? [];
  } catch (err) {
    console.warn("[offlineCache] Failed to read cached credit accounts:", err);
    return [];
  }
}

// ── Image blobs ───────────────────────────────────────────────────────────────
// Store image data as Blobs keyed by the original URL.
// On load we convert each stored Blob to an objectURL so the <img> renders
// instantly from IndexedDB — zero network latency, works offline.

/** Persist a fetched image blob for a given URL. */
export async function cacheImageBlob(url: string, blob: Blob): Promise<void> {
  try {
    const db = await getDb();
    await db.put("image_blobs", blob, url);
  } catch (err) {
    console.warn("[offlineCache] Failed to cache image blob:", err);
  }
}

/** Retrieve a cached blob for a URL, or null if not stored. */
export async function getCachedImageBlob(url: string): Promise<Blob | null> {
  try {
    const db = await getDb();
    return (await db.get("image_blobs", url)) ?? null;
  } catch (err) {
    console.warn("[offlineCache] Failed to get cached image blob:", err);
    return null;
  }
}

/**
 * Load all cached blobs for the given URLs and return a Map of
 * url → objectURL. The caller is responsible for revoking objectURLs
 * when they are no longer needed.
 */
export async function loadCachedImageObjectUrls(
  urls: string[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (urls.length === 0) return result;
  try {
    const db = await getDb();
    await Promise.all(
      urls.map(async (url) => {
        if (!url) return;
        const blob: Blob | undefined = await db.get("image_blobs", url);
        if (blob) result.set(url, URL.createObjectURL(blob));
      })
    );
  } catch (err) {
    console.warn("[offlineCache] Failed to load cached image blobs:", err);
  }
  return result;
}

/** Remove blobs for URLs that are no longer in the product list (cleanup). */
export async function pruneImageBlobCache(activeUrls: Set<string>): Promise<void> {
  try {
    const db = await getDb();
    const tx = db.transaction("image_blobs", "readwrite");
    const keys = await tx.store.getAllKeys();
    await Promise.all(
      (keys as string[])
        .filter((k) => !activeUrls.has(k))
        .map((k) => tx.store.delete(k))
    );
    await tx.done;
  } catch {
    // Non-critical — old blobs will just sit until next cleanup
  }
}
