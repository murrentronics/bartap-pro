import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BUCKET = "product-images";
const TEMPLATE_FOLDER = "templates";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Fetch all templates that still point to external URLs (not already in our storage)
  const { data: templates, error: fetchError } = await supabase
    .from("template_images")
    .select("id, url")
    .not("url", "like", `${supabaseUrl}%`);

  if (fetchError) {
    return new Response(JSON.stringify({ error: fetchError.message }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  // Also fetch products with external image_url values
  const { data: productRows } = await supabase
    .from("products")
    .select("id, image_url")
    .not("image_url", "is", null)
    .not("image_url", "like", `${supabaseUrl}%`);

  const rows = (templates ?? []) as { id: string; url: string }[];
  const productUrlRows = (productRows ?? []) as { id: string; image_url: string }[];
  console.log(`Backfilling ${rows.length} template images + ${productUrlRows.length} product images...`);

  let success = 0;
  let failed = 0;
  const errors: { id: string; url: string; error: string }[] = [];

  for (const row of rows) {
    try {
      const imgRes = await fetch(row.url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(15000),
      });

      if (!imgRes.ok) {
        failed++;
        errors.push({ id: row.id, url: row.url, error: `HTTP ${imgRes.status}` });
        continue;
      }

      const contentType = imgRes.headers.get("content-type") ?? "image/jpeg";
      if (!contentType.startsWith("image/")) {
        failed++;
        errors.push({ id: row.id, url: row.url, error: "Not an image" });
        continue;
      }

      const extMap: Record<string, string> = {
        "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png",
        "image/webp": "webp", "image/gif": "gif", "image/avif": "avif",
      };
      const ext = extMap[contentType.split(";")[0].trim()] ??
        row.url.split(".").pop()?.split("?")[0]?.toLowerCase() ?? "jpg";

      const imageBytes = await imgRes.arrayBuffer();

      const urlHash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(row.url));
      const hashHex = Array.from(new Uint8Array(urlHash)).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
      const storagePath = `${TEMPLATE_FOLDER}/${hashHex}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, imageBytes, { contentType, upsert: true });

      if (uploadError) {
        failed++;
        errors.push({ id: row.id, url: row.url, error: uploadError.message });
        continue;
      }

      const { data: { publicUrl: storedUrl } } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);

      // Update the template row with the new Supabase storage URL
      const { error: updateError } = await supabase
        .from("template_images")
        .update({ url: storedUrl })
        .eq("id", row.id);

      if (updateError) {
        failed++;
        errors.push({ id: row.id, url: row.url, error: updateError.message });
      } else {
        success++;
      }
    } catch (err) {
      failed++;
      errors.push({ id: row.id, url: row.url, error: (err as Error).message });
    }
  }

  console.log(`Done: ${success} success, ${failed} failed`);

  // ── Also backfill product image_url rows ──────────────────────────────────
  let productSuccess = 0;
  let productFailed = 0;

  const cacheUrl = async (originalUrl: string): Promise<string | null> => {
    try {
      const imgRes = await fetch(originalUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(15000),
      });
      if (!imgRes.ok) return null;
      const contentType = imgRes.headers.get("content-type") ?? "image/jpeg";
      if (!contentType.startsWith("image/")) return null;
      const extMap: Record<string, string> = {
        "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png",
        "image/webp": "webp", "image/gif": "gif", "image/avif": "avif",
      };
      const ext = extMap[contentType.split(";")[0].trim()] ?? "jpg";
      const imageBytes = await imgRes.arrayBuffer();
      const urlHash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(originalUrl));
      const hashHex = Array.from(new Uint8Array(urlHash)).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
      const storagePath = `${TEMPLATE_FOLDER}/${hashHex}.${ext}`;
      await supabase.storage.from(BUCKET).upload(storagePath, imageBytes, { contentType, upsert: true });
      const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
      return publicUrl;
    } catch { return null; }
  };

  for (const row of productUrlRows) {
    const storedUrl = await cacheUrl(row.image_url);
    if (storedUrl) {
      await supabase.from("products").update({ image_url: storedUrl }).eq("id", row.id);
      productSuccess++;
    } else {
      productFailed++;
    }
  }

  console.log(`Products: ${productSuccess} success, ${productFailed} failed`);

  return new Response(JSON.stringify({
    templates: { total: rows.length, success, failed, errors: errors.slice(0, 20) },
    products:  { total: productUrlRows.length, success: productSuccess, failed: productFailed },
  }), {
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});
