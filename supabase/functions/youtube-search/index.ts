/**
 * Supabase Edge Function: youtube-search
 *
 * Simple mode (recommended to start):
 *   supabase secrets set YOUTUBE_API_KEY=AIzaSy...
 *   Searches use that single key. 10,000 units/day free.
 *
 * Multi-key rotation mode (when you have multiple keys):
 *   supabase secrets set YOUTUBE_API_KEY_1=AIzaSy...
 *   supabase secrets set YOUTUBE_API_KEY_2=AIzaSy...
 *   Enable slots in Admin → YouTube tab.
 *
 * The function tries YOUTUBE_API_KEY first (simple), then falls back
 * to the slot rotation system if that's not set.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  const url        = new URL(req.url);
  const q          = url.searchParams.get("q")?.trim();
  const type       = url.searchParams.get("type") || "video";
  const maxResults = url.searchParams.get("maxResults") || "12";

  if (!q) return json({ error: "Missing query parameter: q" }, 400);

  // ── Try simple single-key mode first ─────────────────────────────────────
  const simpleKey = Deno.env.get("YOUTUBE_API_KEY") || Deno.env.get("YOUTUBE_API_KEY_1");

  if (simpleKey) {
    const result = await callYouTube(simpleKey, q, type, maxResults);
    if (result.ok) return json({ items: result.items });
    if (result.quotaExceeded) {
      return json({ error: "YouTube search quota reached for today. Resets at midnight Pacific time.", code: "QUOTA_EXHAUSTED" }, 503);
    }
    return json({ error: result.error }, 500);
  }

  // ── Multi-key rotation mode ───────────────────────────────────────────────
  // Check if any numbered keys exist
  let anyKeyFound = false;
  for (let s = 1; s <= 25; s++) {
    if (Deno.env.get(`YOUTUBE_API_KEY_${s}`)) { anyKeyFound = true; break; }
  }

  if (!anyKeyFound) {
    return json({
      error: "YouTube search is not set up yet. Add YOUTUBE_API_KEY in Supabase secrets to enable search.",
      code: "NOT_CONFIGURED",
    }, 503);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // Get caller user_id for logging
  let userId: string | null = null;
  try {
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    if (token) {
      const { data } = await db.auth.getUser(token);
      userId = data?.user?.id ?? null;
    }
  } catch { /* ignore */ }

  // Try each enabled slot in order
  for (let attempt = 0; attempt < 26; attempt++) {
    const { data: slot } = await db.rpc("yt_claim_key_slot");
    if (!slot) {
      await logSearch(db, userId, q, type, null, false, "ALL_KEYS_EXHAUSTED");
      return json({ error: "All YouTube search quota used today. Resets at midnight UTC.", code: "QUOTA_EXHAUSTED" }, 503);
    }

    const apiKey = Deno.env.get(`YOUTUBE_API_KEY_${slot}`);
    if (!apiKey) {
      await db.rpc("yt_exhaust_key_slot", { p_slot: slot });
      continue;
    }

    const result = await callYouTube(apiKey, q, type, maxResults);
    if (result.ok) {
      await logSearch(db, userId, q, type, slot, true, null);
      return json({ items: result.items });
    }
    if (result.quotaExceeded) {
      await db.rpc("yt_exhaust_key_slot", { p_slot: slot });
      await logSearch(db, userId, q, type, slot, false, "quotaExceeded");
      continue;
    }
    await logSearch(db, userId, q, type, slot, false, result.error ?? "unknown");
    return json({ error: result.error }, 500);
  }

  return json({ error: "All YouTube search quota used today. Resets at midnight UTC.", code: "QUOTA_EXHAUSTED" }, 503);
});

// ── Call YouTube Data API v3 ──────────────────────────────────────────────────
async function callYouTube(apiKey: string, q: string, type: string, maxResults: string) {
  const ytUrl = new URL("https://www.googleapis.com/youtube/v3/search");
  ytUrl.searchParams.set("key",        apiKey);
  ytUrl.searchParams.set("q",          q);
  ytUrl.searchParams.set("part",       "snippet");
  ytUrl.searchParams.set("type",       type);
  ytUrl.searchParams.set("maxResults", maxResults);
  ytUrl.searchParams.set("safeSearch", "none");
  if (type === "video") ytUrl.searchParams.set("videoCategoryId", "10");

  try {
    const res  = await fetch(ytUrl.toString());
    const data = await res.json();

    if (!res.ok) {
      const reason = data?.error?.errors?.[0]?.reason ?? `HTTP_${res.status}`;
      const isQuota = res.status === 403 &&
        ["quotaExceeded", "dailyLimitExceeded", "rateLimitExceeded"].includes(reason);
      return { ok: false, quotaExceeded: isQuota, error: reason };
    }

    const rawItems = (data.items ?? []).map((item: any) => ({
      id:        item.id?.videoId ?? item.id?.playlistId,
      kind:      item.id?.kind,
      title:     decodeHtml(item.snippet?.title ?? ""),
      channel:   decodeHtml(item.snippet?.channelTitle ?? ""),
      thumbnail: item.snippet?.thumbnails?.medium?.url ?? item.snippet?.thumbnails?.default?.url,
      duration:  null as string | null,
    }));

    // Batch-fetch durations for video results (one extra API call, costs 1 unit)
    const videoIds = rawItems
      .filter(i => i.kind === "youtube#video" && i.id)
      .map(i => i.id)
      .join(",");

    if (videoIds) {
      try {
        const detailsUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
        detailsUrl.searchParams.set("key",  apiKey);
        detailsUrl.searchParams.set("id",   videoIds);
        detailsUrl.searchParams.set("part", "contentDetails");
        const dRes  = await fetch(detailsUrl.toString());
        const dData = await dRes.json();
        if (dRes.ok && dData.items) {
          const durMap: Record<string, string> = {};
          for (const v of dData.items) {
            durMap[v.id] = parseDuration(v.contentDetails?.duration ?? "");
          }
          for (const item of rawItems) {
            if (item.id && durMap[item.id]) item.duration = durMap[item.id];
          }
        }
      } catch { /* duration is optional — don't fail the whole search */ }
    }

    return { ok: true, items: rawItems };
  } catch (e) {
    return { ok: false, quotaExceeded: false, error: String(e) };
  }
}

// Decode HTML entities in YouTube titles (e.g. &amp; → &, &#39; → ')
function decodeHtml(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&apos;/g, "'");
}

// Converts ISO 8601 duration (PT1H2M3S) → "1:02:03" or "2:03"
function parseDuration(iso: string): string {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return "";
  const h = parseInt(m[1] ?? "0");
  const min = parseInt(m[2] ?? "0");
  const s = parseInt(m[3] ?? "0");
  if (h > 0) return `${h}:${String(min).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  return `${min}:${String(s).padStart(2,"0")}`;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

async function logSearch(
  db: ReturnType<typeof createClient>,
  userId: string | null, query: string, type: string,
  slot: number | null, success: boolean, error: string | null,
) {
  try {
    await db.rpc("yt_log_search", {
      p_user_id: userId, p_query: query, p_type: type,
      p_slot: slot, p_success: success, p_error: error,
    });
  } catch { /* never crash on logging */ }
}
