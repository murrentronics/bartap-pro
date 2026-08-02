/**
 * imageUrl.ts
 *
 * Rewrites Supabase Storage public URLs to use the built-in image
 * transformation API, which serves a compressed, resized JPEG/WebP
 * directly from the CDN — no re-upload needed.
 *
 * Original:  https://<project>.supabase.co/storage/v1/object/public/product-images/...
 * Transformed: https://<project>.supabase.co/storage/v1/render/image/public/product-images/...?width=400&quality=80
 *
 * Falls back to the original URL for non-Supabase hosts (e.g. external URLs).
 */

const STORAGE_OBJECT_PATH = "/storage/v1/object/public/";
const STORAGE_RENDER_PATH = "/storage/v1/render/image/public/";

/**
 * Returns a Supabase image-transform URL for product card thumbnails.
 * @param url  The raw image_url from the products table (can be null).
 * @param width  Max width in px (default 400 — enough for a 3-col grid card).
 * @param quality  JPEG quality 1-100 (default 80).
 */
export function productImageUrl(
  url: string | null | undefined,
  width = 400,
  quality = 80,
): string | null {
  if (!url) return null;
  if (!url.includes(STORAGE_OBJECT_PATH)) return url; // external URL — leave as-is
  const transformed = url.replace(STORAGE_OBJECT_PATH, STORAGE_RENDER_PATH);
  const sep = transformed.includes("?") ? "&" : "?";
  return `${transformed}${sep}width=${width}&quality=${quality}`;
}
