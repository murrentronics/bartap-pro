import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { SmtpClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ADMIN_EMAIL = "theronmurren@gmail.com";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    // Called via Supabase Database Webhook on INSERT to billing_payments
    const record = body.record ?? body;

    if (!record || record.status !== "pending") {
      return new Response(
        JSON.stringify({ skipped: true, reason: "Not a pending payment" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch owner details
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: ownerProfile } = await supabaseClient
      .from("profiles")
      .select("username, phone, address")
      .eq("id", record.owner_id)
      .maybeSingle();

    const ownerName    = ownerProfile?.username ?? record.owner_id;
    const ownerPhone   = ownerProfile?.phone    ?? "Not provided";
    const ownerAddress = ownerProfile?.address  ?? "Not provided";
    const amount       = Number(record.amount).toFixed(2);
    const reference    = record.reference_number ?? "N/A";
    const createdAt    = new Date(record.created_at).toLocaleString("en-US", {
      timeZone: "America/Port_of_Spain",
      dateStyle: "medium",
      timeStyle: "short",
    });

    // SMTP credentials from secrets
    const smtpHost = Deno.env.get("SMTP_HOSTNAME") ?? "";
    const smtpPort = parseInt(Deno.env.get("SMTP_PORT") ?? "465");
    const smtpUser = Deno.env.get("SMTP_USERNAME") ?? "";
    const smtpPass = Deno.env.get("SMTP_PASSWORD") ?? "";
    const smtpFrom = Deno.env.get("SMTP_FROM")     ?? smtpUser;

    if (!smtpHost || !smtpUser || !smtpPass) {
      console.error("SMTP secrets not configured");
      return new Response(
        JSON.stringify({ error: "SMTP not configured. Set SMTP_HOSTNAME, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD, SMTP_FROM secrets." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const subject = `💳 New Pending Payment — ${ownerName} ($${amount} TT)`;

    const htmlBody = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <h2 style="color:#1a1a1a;margin-bottom:4px;">💳 New Pending Payment</h2>
        <p style="color:#666;margin-top:0;">A new billing payment is awaiting your approval on Bartendaz Pro.</p>

        <table style="width:100%;border-collapse:collapse;margin:24px 0;background:#f9f9f9;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="padding:12px 16px;font-weight:bold;color:#555;width:40%;">Owner</td>
            <td style="padding:12px 16px;color:#1a1a1a;">${ownerName}</td>
          </tr>
          <tr style="background:#fff;">
            <td style="padding:12px 16px;font-weight:bold;color:#555;">Phone</td>
            <td style="padding:12px 16px;color:#1a1a1a;">${ownerPhone}</td>
          </tr>
          <tr>
            <td style="padding:12px 16px;font-weight:bold;color:#555;">Address</td>
            <td style="padding:12px 16px;color:#1a1a1a;">${ownerAddress}</td>
          </tr>
          <tr style="background:#fff;">
            <td style="padding:12px 16px;font-weight:bold;color:#555;">Amount</td>
            <td style="padding:12px 16px;color:#1a1a1a;font-size:18px;font-weight:bold;">$${amount} TT</td>
          </tr>
          <tr>
            <td style="padding:12px 16px;font-weight:bold;color:#555;">Reference #</td>
            <td style="padding:12px 16px;color:#1a1a1a;font-family:monospace;">${reference}</td>
          </tr>
          <tr style="background:#fff;">
            <td style="padding:12px 16px;font-weight:bold;color:#555;">Submitted</td>
            <td style="padding:12px 16px;color:#1a1a1a;">${createdAt}</td>
          </tr>
        </table>

        <p style="color:#666;font-size:14px;">
          Log in to the Bartendaz Pro admin panel and go to <strong>Billing Management → Pending</strong> to approve or reject this payment.
        </p>

        <hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />
        <p style="color:#aaa;font-size:12px;">Bartendaz Pro · Automated notification</p>
      </div>
    `;

    // Connect via SMTP (port 465 = TLS, port 587 = STARTTLS — Deno blocks 587, use 465)
    const client = new SmtpClient();
    await client.connectTLS({
      hostname: smtpHost,
      port: smtpPort,
      username: smtpUser,
      password: smtpPass,
    });

    await client.send({
      from: smtpFrom,
      to: ADMIN_EMAIL,
      subject,
      html: htmlBody,
    });

    await client.close();

    console.log(`Email sent to ${ADMIN_EMAIL} for payment ${reference}`);

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
