/**
 * labelImage.ts
 *
 * Auto-labels a product image by calling the `label-image` Supabase edge
 * function, which runs a 3-API waterfall (Imagga → Clarifai → HuggingFace BLIP)
 * server-side — no WASM, no model downloads, works on mobile WebView.
 *
 * Usage:
 *   import { labelImage } from "@/lib/labelImage";
 *   const name = await labelImage(file);     // File object
 *   const name = await labelImage("https://example.com/product.jpg");  // URL
 *   const name = await labelImage("blob:...");  // object URL (converted to dataUri)
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
 * @param input  File object, blob URL ("blob:..."), or any https:// URL
 * @returns      Clean title-cased product name, e.g. "Heineken 330ml Can"
 */
export async function labelImage(input: File | string): Promise<string> {
  let imageUrl: string;

  if (input instanceof File) {
    // Convert file to base64 data URI — edge function accepts both
    imageUrl = await fileToDataUri(input);
  } else if (input.startsWith("blob:")) {
    // Convert blob URL to data URI so the server can receive it
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
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) throw new Error(`label-image edge function returned ${res.status}`);

  const data = await res.json() as { label?: string; confidence?: number; source?: string };

  if (!data.label) throw new Error("No label returned");

  return titleCase(data.label);
}
