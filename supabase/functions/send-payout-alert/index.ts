/**
 * send-payout-alert
 *
 * Triggered via Supabase Database Webhook on INSERT into machine_entries.
 * Uses FCM V1 API (Legacy API is disabled).
 *
 * Required secrets in Supabase Edge Functions:
 *   FIREBASE_SERVICE_ACCOUNT_JSON  — full JSON of the Firebase service account key
 *   SUPABASE_URL                   — auto-provided
 *   SUPABASE_SERVICE_ROLE_KEY      — auto-provided
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SERVICE_ACCOUNT_JSON = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON")!;

const PROJECT_ID = "bartendazpro";
const FCM_ENDPOINT = `https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Get a short-lived OAuth2 access token from the service account ─────────
async function getAccessToken(serviceAccountJson: string): Promise<string> {
  const sa = JSON.parse(serviceAccountJson);
  const now = Math.floor(Date.now() / 1000);

  const header  = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const encode = (obj: object) =>
    btoa(JSON.stringify(obj)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const signingInput = `${encode(header)}.${encode(payload)}`;

  // Import the private key
  const pemKey = sa.private_key as string;
  const pemBody = pemKey
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\n/g, "");

  const keyData = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureBuffer = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const jwt = `${signingInput}.${signature}`;

  // Exchange JWT for OAuth2 access token
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const tokenData = await tokenRes.json() as { access_token: string };
  return tokenData.access_token;
}

// ── Send FCM V1 message to a single token ─────────────────────────────────
async function sendFcmV1(
  accessToken: string,
  fcmToken: string,
  title: string,
  body: string,
  data: Record<string, string>
): Promise<void> {
  await fetch(FCM_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      message: {
        token: fcmToken,
        notification: { title, body },
        android: {
          priority: "high",
          notification: {
            channel_id: "payout_alerts",
            sound: "default",
            notification_priority: "PRIORITY_HIGH",
            visibility: "PUBLIC",
          },
        },
        data,
      },
    }),
  });
}

// ── Main handler ───────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const record  = payload.record;

    if (!record || record.type !== "payout") {
      return new Response("Not a payout", { status: 200 });
    }

    const ownerId  = record.owner_id as string;
    const cashierId = record.cashier_id as string;
    const amount   = Number(record.amount);

    // Only alert for cashier payouts — not owner's own entries
    if (cashierId === ownerId) {
      return new Response("Owner payout — skipping", { status: 200 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Get machine name
    const { data: machine } = await supabase
      .from("machines").select("name").eq("id", record.machine_id).single();
    const machineName = machine?.name ?? "Machine";

    // Get alert settings
    const { data: alertSettings } = await supabase
      .from("machine_alert_settings")
      .select("enabled, threshold").eq("owner_id", ownerId).single();

    if (!alertSettings?.enabled) return new Response("Alerts disabled", { status: 200 });
    if (amount < Number(alertSettings.threshold)) return new Response("Below threshold", { status: 200 });

    // Get cashier name
    const { data: cashier } = await supabase
      .from("profiles").select("username").eq("id", cashierId).single();
    const cashierName = cashier?.username ?? "Cashier";

    // Get owner's device tokens
    const { data: tokens } = await supabase
      .from("device_tokens").select("token").eq("owner_id", ownerId);
    if (!tokens?.length) return new Response("No tokens", { status: 200 });

    const title = `⚠️ Payout Alert — ${machineName}`;
    const body  = `${cashierName} paid out $${amount.toFixed(2)} TT — exceeds your $${Number(alertSettings.threshold).toLocaleString()} TT alert.`;
    const data  = {
      type: "payout_alert",
      machine_name: machineName,
      amount: String(amount),
      threshold: String(alertSettings.threshold),
    };

    // Get FCM V1 access token once
    const accessToken = await getAccessToken(SERVICE_ACCOUNT_JSON);

    // Send to all owner devices in parallel
    await Promise.allSettled(
      tokens.map((t: { token: string }) => sendFcmV1(accessToken, t.token, title, body, data))
    );

    return new Response(
      JSON.stringify({ sent: tokens.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("send-payout-alert error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
