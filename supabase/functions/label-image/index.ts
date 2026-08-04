/**
 * label-image — Supabase Edge Function
 *
 * Auto-labels a product image using a 3-API waterfall — all free tiers,
 * no credit card required for the first two, unlimited (rate-limited) for HF.
 *
 * Waterfall order:
 *  1. Imagga        — 1,000 free requests/month (no card) · best product tags
 *     Sign up: https://imagga.com/auth/signup
 *     Secrets: IMAGGA_API_KEY, IMAGGA_API_SECRET
 *
 *  2. Clarifai      — 1,000 free requests/month (community plan) · strong general model
 *     Sign up: https://clarifai.com/signup
 *     Secret:  CLARIFAI_PAT  (Personal Access Token)
 *
 *  3. Hugging Face  — free, unlimited (rate-limited) · BLIP image-captioning model
 *     Sign up: https://huggingface.co/join
 *     Secret:  HF_TOKEN  (optional — raises rate limit; works without it too)
 *
 * Request body:  { imageUrl: string }
 *   imageUrl can be https://... (public URL) or data:image/...;base64,...
 *
 * Response: { label: string; confidence: number; source: "imagga"|"clarifai"|"huggingface"|"fallback" }
 *
 * Combined free quota: ~2,000 labelled calls/month before HF kicks in as
 * unlimited fallback — more than enough for 100 relabels per admin session.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Label cleaner ────────────────────────────────────────────────────────────

function cleanLabel(raw: string): string {
  let s = raw.trim();
  // Remove trailing punctuation artifacts
  s = s.replace(/[.,;:!?]+$/, "").trim();
  // Strip content after site-name separators
  s = s.replace(/\s*[-–|]\s*[A-Z][^|–\-]{2,}$/, "").trim();
  // Collapse whitespace
  s = s.replace(/\s+/g, " ").trim();
  // Title-case
  const LOWER = new Set(["a","an","the","and","or","of","in","on","at","to","for","with","by"]);
  s = s.split(" ").map((w, i) => {
    if (/^\d+(\.\d+)?(ml|oz|cl|l|g|kg|lb|fl)\b/i.test(w)) return w.toLowerCase();
    if (i > 0 && LOWER.has(w.toLowerCase())) return w.toLowerCase();
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  }).join(" ");
  return s || "Untitled";
}

// ─── Beverage / tobacco relevance scorer ─────────────────────────────────────

const PRODUCT_HINTS = [
  "beer","lager","ale","stout","rum","vodka","whiskey","whisky","gin","brandy",
  "tequila","wine","champagne","cognac","bourbon","scotch","liquor","spirit",
  "drink","soda","cola","juice","energy","malt","heineken","carib","stag",
  "angostura","absolut","smirnoff","bacardi","johnnie","jack","baileys","corona",
  "budweiser","guinness","amstel","carlsberg","tiger","red bull","sprite","pepsi",
  "cigarette","cigar","tobacco","marlboro","camel","benson","dunhill","lucky",
  "winston","newport","pall","rolling","raw","rizla","lighter","bic",
  "chip","crisp","snack","peanut","nut","biscuit","cookie","cracker","doritos",
  "lays","pringles","popcorn","pretzel","cheez",
];

function scoreTag(tag: string): number {
  const l = tag.toLowerCase();
  if (PRODUCT_HINTS.some((h) => l.includes(h))) return 3;
  if (/bottle|can|pack|box|tin|carton|label|brand/.test(l)) return 2;
  if (/^[A-Z]/.test(tag) && tag.includes(" ")) return 1;
  return 0;
}

// ─── 1. Imagga ────────────────────────────────────────────────────────────────
// Docs: https://docs.imagga.com/#tags
// Free: 1,000 API calls/month, no credit card required

async function tryImagga(
  imageUrl: string,
  apiKey: string,
  apiSecret: string,
): Promise<{ label: string; confidence: number } | null> {
  const isBase64 = imageUrl.startsWith("data:");

  let res: Response;

  if (isBase64) {
    // POST with multipart form — send the raw base64 content as a file
    const b64 = imageUrl.split(",")[1] ?? "";
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const form = new FormData();
    form.append("image", new Blob([bytes], { type: "image/png" }), "image.png");
    res = await fetch("https://api.imagga.com/v2/tags", {
      method: "POST",
      headers: { Authorization: "Basic " + btoa(`${apiKey}:${apiSecret}`) },
      body: form,
      signal: AbortSignal.timeout(15000),
    });
  } else {
    // GET with image_url param — faster for public URLs
    const url = `https://api.imagga.com/v2/tags?image_url=${encodeURIComponent(imageUrl)}`;
    res = await fetch(url, {
      headers: { Authorization: "Basic " + btoa(`${apiKey}:${apiSecret}`) },
      signal: AbortSignal.timeout(15000),
    });
  }

  if (!res.ok) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await res.json() as any;
  const tags: { tag: { en: string }; confidence: number }[] = data?.result?.tags ?? [];
  if (tags.length === 0) return null;

  // Pick the highest-confidence tag that matches bar products, fall back to top tag
  const scored = tags
    .filter((t) => t.tag?.en)
    .map((t) => ({ label: t.tag.en, confidence: t.confidence / 100, score: scoreTag(t.tag.en) }))
    .sort((a, b) => b.score - a.score || b.confidence - a.confidence);

  const best = scored[0];
  return best ? { label: cleanLabel(best.label), confidence: best.confidence } : null;
}

// ─── 2. Clarifai ──────────────────────────────────────────────────────────────
// Docs: https://docs.clarifai.com/api-guide/predict/images
// Free: 1,000 operations/month on community plan, no card required
// Model: general-image-recognition (clarifai/main/models/general-image-recognition)

async function tryClarifai(
  imageUrl: string,
  pat: string,
): Promise<{ label: string; confidence: number } | null> {
  const isBase64 = imageUrl.startsWith("data:");
  const b64 = isBase64 ? imageUrl.split(",")[1] ?? "" : null;

  const body = {
    user_app_id: { user_id: "clarifai", app_id: "main" },
    inputs: [{
      data: b64
        ? { image: { base64: b64 } }
        : { image: { url: imageUrl } },
    }],
  };

  const res = await fetch(
    "https://api.clarifai.com/v2/models/general-image-recognition/outputs",
    {
      method: "POST",
      headers: {
        "Authorization": `Key ${pat}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    },
  );

  if (!res.ok) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await res.json() as any;
  const concepts: { name: string; value: number }[] =
    data?.outputs?.[0]?.data?.concepts ?? [];

  if (concepts.length === 0) return null;

  const scored = concepts
    .filter((c) => c.name)
    .map((c) => ({ label: c.name, confidence: c.value, score: scoreTag(c.name) }))
    .sort((a, b) => b.score - a.score || b.confidence - a.confidence);

  const best = scored[0];
  return best ? { label: cleanLabel(best.label), confidence: best.confidence } : null;
}

// ─── 3. Hugging Face — BLIP image captioning ─────────────────────────────────
// Docs: https://huggingface.co/docs/api-inference
// Model: Salesforce/blip-image-captioning-base (generates a natural language caption)
// Free: unlimited, rate-limited (works without token; token raises limit)
// Sign up (free): https://huggingface.co/join

async function tryHuggingFace(
  imageUrl: string,
  hfToken?: string,
): Promise<{ label: string; confidence: number } | null> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (hfToken) headers["Authorization"] = `Bearer ${hfToken}`;

  let bodyBytes: Uint8Array;

  if (imageUrl.startsWith("data:")) {
    // HF Inference API accepts raw binary image bytes
    const b64 = imageUrl.split(",")[1] ?? "";
    bodyBytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    headers["Content-Type"] = "image/png";
  } else {
    // Fetch the remote image and forward its bytes
    const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(10000) });
    if (!imgRes.ok) return null;
    const imgBuf = await imgRes.arrayBuffer();
    bodyBytes = new Uint8Array(imgBuf);
    headers["Content-Type"] = imgRes.headers.get("content-type") || "image/jpeg";
  }

  const res = await fetch(
    "https://api-inference.huggingface.co/models/Salesforce/blip-image-captioning-base",
    {
      method: "POST",
      headers,
      body: bodyBytes,
      signal: AbortSignal.timeout(20000),
    },
  );

  if (!res.ok) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await res.json() as any;
  // Response shape: [{ generated_text: "a bottle of..." }]
  const caption: string = Array.isArray(data) ? (data[0]?.generated_text ?? "") : (data?.generated_text ?? "");
  if (!caption) return null;

  // Strip leading "a photo of", "a picture of" boilerplate
  const cleaned = caption
    .replace(/^(a photo of|a picture of|an image of|a bottle of|a can of)\s+/i, "")
    .trim();

  return { label: cleanLabel(cleaned), confidence: 0.75 };
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const { imageUrl } = await req.json() as { imageUrl: string };
    if (!imageUrl) {
      return new Response(JSON.stringify({ error: "imageUrl required" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Read secrets — any missing secret simply skips that provider
    const imaggaKey    = Deno.env.get("IMAGGA_API_KEY") ?? "";
    const imaggaSecret = Deno.env.get("IMAGGA_API_SECRET") ?? "";
    const clarifaiPat  = Deno.env.get("CLARIFAI_PAT") ?? "";
    const hfToken      = Deno.env.get("HF_TOKEN"); // optional — works without it

    // ── 1. Try Imagga ──────────────────────────────────────────────────────
    if (imaggaKey && imaggaSecret) {
      try {
        const result = await tryImagga(imageUrl, imaggaKey, imaggaSecret);
        if (result) {
          return new Response(
            JSON.stringify({ ...result, source: "imagga" }),
            { headers: { ...CORS, "Content-Type": "application/json" } },
          );
        }
      } catch { /* fall through to next provider */ }
    }

    // ── 2. Try Clarifai ────────────────────────────────────────────────────
    if (clarifaiPat) {
      try {
        const result = await tryClarifai(imageUrl, clarifaiPat);
        if (result) {
          return new Response(
            JSON.stringify({ ...result, source: "clarifai" }),
            { headers: { ...CORS, "Content-Type": "application/json" } },
          );
        }
      } catch { /* fall through */ }
    }

    // ── 3. Hugging Face (always available — no key required) ───────────────
    try {
      const result = await tryHuggingFace(imageUrl, hfToken);
      if (result) {
        return new Response(
          JSON.stringify({ ...result, source: "huggingface" }),
          { headers: { ...CORS, "Content-Type": "application/json" } },
        );
      }
    } catch { /* fall through */ }

    // ── All providers failed — return empty so client keeps existing label ─
    return new Response(
      JSON.stringify({ label: "", confidence: 0, source: "fallback" }),
      { headers: { ...CORS, "Content-Type": "application/json" } },
    );

  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }
});
