/**
 * imageUrl.ts
 *
 * Pass-through helper — returns the image URL as-is.
 * New uploads are already compressed at upload time (max 400px, JPEG 82%).
 * The Supabase transform API caused zoom/crop artifacts on bottle images
 * so we serve originals directly from storage/CDN.
 */
export function productImageUrl(
  url: string | null | undefined,
): string | null {
  return url ?? null;
}
