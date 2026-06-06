/**
 * Supabase Edge Function: youtube-search
 *
 * Features:
 *  - Rotates through up to 10 YouTube API keys automatically
 *  - Keys are stored as Supabase secrets: YOUTUBE_API_KEY_1 … YOUTUBE_API_KEY_10
 *  - Each key slot has a daily counter tracked in the youtube_api_keys table
 *  - When a key hits its daily limit (or Google returns 403/quota), the function
 *    automatically tries the next available slot — transparent to the caller
 *  - Every search is logged to youtube_search_log for admin reporting
 *
 * Deploy:
 *   supabase functions deploy youtube-search
 *
 * Set secrets (one command per key you have):
 *   supabase secrets set YOUTUBE_API_KEY_1=AIzaSy...
 *   supabase secrets set YOUTUBE_API_KEY_2=AIzaSy...
 *   ...up to YOUTUBE_API_KEY_10
 *
 * Then enable the slots in the admin panel (or via SQL):
 *   UPDATE youtube_api_keys SET enabled = true WHERE slot IN (1, 2, 3);
 *
 * GET /youtube-search?q=soca+mix&type=video&maxResults=12
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_RETRIES = 10; // max number of key slots to try

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  // ── Parse request ────────────────────────────────────────────────────────
  const url        = new URL(req.url);
  const q          = url.searchParams.get("q")?.trim();
  const type       = url.searchParams.get("type") || "video";
  const maxResults = url.searchParams.get("maxResults") || "12";

  if (!q) {
    return json({ error: "Missing query parameter: q" }, 400);
  }

  // ── Get caller identity (for logging) ────────────────────────────────────
  const authHeader = req.headers.get("Authorization") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Use service-role client so we can write logs and use atomic SQL functions
  const db = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // Resolve caller user_id from the JWT (best-effort — null if anonymous)
  let userId: string | null = null;
  try {
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (token) {
      const { data } = await db.auth.getUser(token);
      userId = data?.user?.id ?? null;
    }
  } catch { /* ignore */ }

  // ── Key rotation loop ─────────────────────────────────────────────────────
  let lastError: string | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {

    // 1. Atomically claim the next available slot
    const { data: slotData, error: slotErr } = await db.rpc("yt_claim_key_slot");
    const slot: number | null = slotData ?? null;

    if (slotErr || slot === null) {
      // No keys available at all
      await logSearch(db, userId, q, type, null, false, "ALL_KEYS_EXHAUSTED");
      return json({
        error: "All YouTube search quota for today has been used. Searches will resume at midnight UTC.",
        code: "QUOTA_EXHAUSTED",
      }, 503);
    }

    // 2. Look up the actual API key from Deno secrets
    const apiKey = Deno.env.get(`YOUTUBE_API_KEY_${slot}`);
    if (!apiKey) {
      // Secret not set for this slot — mark it exhausted and try next
      await db.rpc("yt_exhaust_key_slot", { p_slot: slot });
      continue;
    }

    // 3. Call YouTube Data API v3
    const ytUrl = new URL("https://www.googleapis.com/youtube/v3/search");
    ytUrl.searchParams.set("key",        apiKey);
    ytUrl.searchParams.set("q",          q);
    ytUrl.searchParams.set("part",       "snippet");
    ytUrl.searchParams.set("type",       type);
    ytUrl.searchParams.set("maxResults", maxResults);
    ytUrl.searchParams.set("safeSearch", "none");
    if (type === "video") {
      ytUrl.searchParams.set("videoCategoryId", "10"); // Music
    }

    let ytRes: Response;
    try {
      ytRes = await fetch(ytUrl.toString());
    } catch (fetchErr) {
      lastError = String(fetchErr);
      await logSearch(db, userId, q, type, slot, false, "FETCH_ERROR");
      return json({ error: "Network error reaching YouTube API" }, 502);
    }

    const ytData = await ytRes.json();

    // 4. Handle quota / auth errors — rotate to next key
    if (!ytRes.ok) {
      const errCode = ytData?.error?.errors?.[0]?.reason ?? `HTTP_${ytRes.status}`;
      const isQuotaError = ytRes.status === 403 &&
        (errCode === "quotaExceeded" || errCode === "dailyLimitExceeded" || errCode === "rateLimitExceeded");

      if (isQuotaError) {
        // Mark this slot as exhausted immediately and try the next key
        await db.rpc("yt_exhaust_key_slot", { p_slot: slot });
        await logSearch(db, userId, q, type, slot, false, errCode);
        lastError = errCode;
        continue; // ← key rotation happens here
      }

      // Non-quota error (bad key, API disabled, etc.)
      await logSearch(db, userId, q, type, slot, false, errCode);
      return json(ytData, ytRes.status);
    }

    // 5. Success — slim the payload and log it
    const items = (ytData.items ?? []).map((item: any) => ({
      id:        item.id?.videoId ?? item.id?.playlistId,
      kind:      item.id?.kind,
      title:     item.snippet?.title,
      channel:   item.snippet?.channelTitle,
      thumbnail: item.snippet?.thumbnails?.medium?.url ?? item.snippet?.thumbnails?.default?.url,
    }));

    await logSearch(db, userId, q, type, slot, true, null);

    return json({ items });
  }

  // Fell through all retries
  await logSearch(db, userId, q, type, null, false, "ALL_KEYS_EXHAUSTED");
  return json({
    error: "All YouTube search quota for today has been used. Searches will resume at midnight UTC.",
    code: "QUOTA_EXHAUSTED",
    lastError,
  }, 503);
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

async function logSearch(
  db: ReturnType<typeof createClient>,
  userId: string | null,
  query: string,
  type: string,
  slot: number | null,
  success: boolean,
  error: string | null,
) {
  try {
    await db.rpc("yt_log_search", {
      p_user_id: userId,
      p_query:   query,
      p_type:    type,
      p_slot:    slot,
      p_success: success,
      p_error:   error,
    });
  } catch { /* logging should never crash the response */ }
}
