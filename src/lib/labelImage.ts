/**
 * labelImage.ts
 *
 * Client-side image auto-labeling using @huggingface/transformers.
 * Runs entirely in the browser via ONNX/WebAssembly — NO API key, NO server,
 * NO rate limits, NO credit card. Works on web and mobile WebView.
 *
 * Exactly how Lovable's "Auto-correct all names" works.
 *
 * Model: Xenova/vit-gpt2-image-captioning
 *   - Generates a natural language caption: "a bottle of rum on a white background"
 *   - Model is ~80MB, fetched from HF CDN on first use, then cached by the browser forever
 *   - Subsequent calls are instant (model stays in memory for the session)
 *
 * Usage:
 *   import { labelImage } from "@/lib/labelImage";
 *   const name = await labelImage(file);     // File or blob URL string
 *   const name = await labelImage("https://example.com/product.jpg");
 */

import { pipeline, env } from "@huggingface/transformers";

// Use CDN (jsDelivr) — same as @imgly/background-removal does.
// This avoids bundling the model weights into the app.
env.allowLocalModels = false;
env.useBrowserCache  = true; // cache in browser IndexedDB after first download

// Singleton — pipeline is expensive to init, keep it alive for the session
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let captioner: any = null;
let initPromise: Promise<void> | null = null;

async function getModel() {
  if (captioner) return captioner;
  if (initPromise) { await initPromise; return captioner!; }

  initPromise = (async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    captioner = await (pipeline as any)(
      "image-to-text",
      "Xenova/vit-gpt2-image-captioning",
      { dtype: "q8" },
    );
  })();
  await initPromise;
  return captioner!;
}

// ─── Label cleaner ─────────────────────────────────────────────────────────────

/** Known filler phrases the captioner often prepends */
const FILLER = /^(a photo of|a picture of|an image of|a close up of|a bottle of|a can of|a pack of|a box of|a jar of)\s+/i;

const LOWER_WORDS = new Set(["a","an","the","and","or","of","in","on","at","to","for","with","by"]);

function cleanCaption(raw: string): string {
  let s = raw.trim();
  // Strip filler prefix
  s = s.replace(FILLER, "").trim();
  // Capitalise first letter
  if (s.length > 0) s = s.charAt(0).toUpperCase() + s.slice(1);
  // Title-case remaining words (skip connector words)
  s = s.split(" ").map((w, i) => {
    if (i === 0) return w; // first word already capped above
    if (LOWER_WORDS.has(w.toLowerCase())) return w.toLowerCase();
    if (/^\d+(\.\d+)?(ml|oz|cl|l|g|kg|lb|fl)\b/i.test(w)) return w.toLowerCase();
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  }).join(" ");
  return s.trim() || "Untitled";
}

// ─── Main export ───────────────────────────────────────────────────────────────

/**
 * Auto-label an image — returns a clean product name string.
 *
 * @param input  File object, blob URL ("blob:..."), or any https:// URL
 * @returns      Clean title-cased product name, e.g. "Heineken 330ml Can"
 */
export async function labelImage(input: File | string): Promise<string> {
  const model = await getModel();

  let imageInput: string | File;

  if (typeof input === "string") {
    imageInput = input; // URL or blob URL — transformers.js handles both
  } else {
    // File object — create an object URL
    imageInput = URL.createObjectURL(input);
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const output = await (model as any)(imageInput, { max_new_tokens: 50 });
    const caption: string =
      Array.isArray(output) ? (output[0]?.generated_text ?? "") : (output?.generated_text ?? "");
    return cleanCaption(caption);
  } finally {
    // Clean up object URL if we created one
    if (typeof input !== "string" && typeof imageInput === "string") {
      URL.revokeObjectURL(imageInput);
    }
  }
}
