/**
 * labelImage.ts
 *
 * Auto-labels a product image by calling the `label-image` Supabase edge
 * function, which runs a 3-API waterfall (Imagga → Clarifai → HuggingFace BLIP)
 * server-side — no WASM, no model downloads, works on mobile WebView.
 *
 * Usage:
 *   import { labelImage } from "@/lib/labelImage";
 *   const name = await labelImage(file);                        // File object
 *   const name = await labelImage("https://example.com/img");  // URL
 *   const name = await labelImage("blob:...", dataUri);         // blob: + pre-computed dataUri
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("FileReader failed"));
    reader.readAsDataURL(file);
  });
}

async function blobUrlToDataUri(blobUrl: string): Promise<string> {
  const res = await fetch(blobUrl);
  const blob = await res.blob();
  return fileToDataUri(new File([blob], "image.png", { type: blob.type || "image/png" }));
}

/** Title-case a raw string, preserving size tokens and connector words. */
function titleCase(raw: string): string {
  const LOWER = new Set(["a","an","the","and","or","of","in","on","at","to","for","with","by"]);
  return raw
    .split(" ")
    .map((w, i) => {
      if (/^\d+(\.\d+)?(ml|oz|cl|l|g|kg|lb|fl)\b/i.test(w)) return w.toLowerCase();
      if (i > 0 && LOWER.has(w.toLowerCase())) return w.toLowerCase();
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(" ")
    .trim() || "Untitled";
}

// ─── Main export ───────────────────────────────────────────────────────────────

/**
 * Auto-label an image via the label-image edge function.
 *
 * @param input    File object, blob URL ("blob:..."), or any https:// URL
 * @param dataUri  Optional pre-computed base64 data URI (avoids re-fetching blob: URLs)
 * @returns        Clean title-cased product name, e.g. "Heineken 330ml Can"
 */
export async function labelImage(input: File | string, dataUri?: string): Promise<string> {
  let imageUrl: string;

  if (input instanceof File) {
    // Convert file to base64 data URI — edge function accepts both
    imageUrl = await fileToDataUri(input);
  } else if (dataUri) {
    // Use pre-computed data URI directly — avoids re-fetching the blob
    imageUrl = dataUri;
  } else if (input.startsWith("blob:")) {
    // Fall back to converting blob URL to data URI
    imageUrl = await blobUrlToDataUri(input);
  } else {
    // Public https:// URL — send as-is
    imageUrl = input;
  }

  const res = await fetch(`${SUPABASE_URL}/functions/v1/label-image`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "apikey": SUPABASE_KEY,
    },
    body: JSON.stringify({ imageUrl }),
    signal: AbortSignal.timeout(45000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`label-image returned ${res.status}${body ? ": " + body.slice(0, 120) : ""}`);
  }

  const data = await res.json() as { label?: string; confidence?: number; source?: string; error?: string };

  if (data.error) throw new Error(data.error);
  if (!data.label) throw new Error("No label returned from any provider");

  return titleCase(data.label);
}
