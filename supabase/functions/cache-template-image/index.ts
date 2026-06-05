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

  try {
    const { url } = await req.json() as { url: string };
    if (!url || !url.startsWith("http")) {
      return new Response(JSON.stringify({ error: "Invalid URL" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // If it's already a Supabase storage URL for this project, return as-is
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    if (url.startsWith(supabaseUrl)) {
      return new Response(JSON.stringify({ storedUrl: url, cached: false }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Fetch the image
    const imgRes = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Referer": new URL(url).origin,
        "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });

    if (!imgRes.ok) {
      return new Response(JSON.stringify({ error: `Image fetch failed: ${imgRes.status}`, originalUrl: url }), {
        status: 200, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const contentType = imgRes.headers.get("content-type") ?? "image/jpeg";
    // Only accept actual images
    if (!contentType.startsWith("image/")) {
      return new Response(JSON.stringify({ error: "Not an image", originalUrl: url }), {
        status: 200, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Determine file extension from content-type or URL
    const extMap: Record<string, string> = {
      "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png",
      "image/webp": "webp", "image/gif": "gif", "image/avif": "avif",
    };
    const ext = extMap[contentType.split(";")[0].trim()] ??
      url.split(".").pop()?.split("?")[0]?.toLowerCase() ?? "jpg";

    const imageBytes = await imgRes.arrayBuffer();

    // Use a stable filename based on a hash of the URL so duplicates don't re-upload
    const urlHash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(url));
    const hashHex = Array.from(new Uint8Array(urlHash)).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
    const storagePath = `${TEMPLATE_FOLDER}/${hashHex}.${ext}`;

    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Upload — skip if already exists (upsert: false, check error code)
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, imageBytes, {
        contentType,
        upsert: false, // don't re-upload if same hash already stored
      });

    if (uploadError && !uploadError.message.includes("already exists") && uploadError.message !== "The resource already exists") {
      console.error("Upload error:", uploadError.message);
      return new Response(JSON.stringify({ error: uploadError.message, originalUrl: url }), {
        status: 200, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const { data: { publicUrl: storedUrl } } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);

    return new Response(JSON.stringify({ storedUrl, cached: true }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
