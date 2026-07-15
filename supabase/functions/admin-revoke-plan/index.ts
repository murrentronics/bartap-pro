import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Verify caller is admin
    const authHeader = req.headers.get("Authorization") ?? "";
    const { data: { user }, error: authErr } = await serviceClient.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: callerProfile } = await serviceClient
      .from("profiles").select("role").eq("id", user.id).single();
    if (callerProfile?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { payment_id } = await req.json();
    if (!payment_id) {
      return new Response(JSON.stringify({ error: "payment_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch payment + plan type
    const { data: payment, error: payErr } = await serviceClient
      .from("billing_payments")
      .select("owner_id, billing_plans(plan_type)")
      .eq("id", payment_id)
      .single();
    if (payErr || !payment) {
      return new Response(JSON.stringify({ error: "Payment not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ownerId: string = payment.owner_id;
    const planType: string = (payment.billing_plans as any)?.plan_type ?? "basic";

    // ── 1. Delete all cashiers belonging to this owner ────────────────────────
    const { data: cashiers } = await serviceClient
      .from("profiles")
      .select("id, wallet_balance, parent_id")
      .eq("parent_id", ownerId)
      .eq("role", "cashier");

    for (const cashier of (cashiers ?? [])) {
      // Reassign credit_transactions to owner so NOT NULL constraint doesn't fail
      await serviceClient
        .from("credit_transactions")
        .update({ cashier_id: ownerId })
        .eq("cashier_id", cashier.id);

      // Delete cashier profile (cascade handles wallet_transactions, orders etc.)
      await serviceClient.from("profiles").delete().eq("id", cashier.id);

      // Delete auth user
      await serviceClient.auth.admin.deleteUser(cashier.id);
    }

    // ── 2. Reset owner profile based on plan being revoked ───────────────────
    if (planType === "basic" || planType === "machines_only") {
      // Full reset — owner goes back to pending with no plan
      await serviceClient.from("profiles").update({
        status:                        "pending",
        billing_status:                "pending_setup",
        plan_type:                     "basic",
        subscription_start_date:       null,
        subscription_end_date:         null,
        machines_addon_active:         false,
        machines_addon_start_date:     null,
        machines_addon_end_date:       null,
        bar_addon_active:              false,
        chain_addon_active:            false,
        music_addon:                   false,
        wallet_balance:                0,
      }).eq("id", ownerId);

    } else if (planType === "premium") {
      await serviceClient.from("profiles").update({
        plan_type:                           "basic",
        premium_subscription_start_date:     null,
        premium_subscription_end_date:       null,
        music_addon:                         false,
      }).eq("id", ownerId);

    } else if (planType === "machines_addon") {
      await serviceClient.from("profiles").update({
        machines_addon_active:     false,
        machines_addon_start_date: null,
        machines_addon_end_date:   null,
      }).eq("id", ownerId);

    } else if (planType === "chain") {
      await serviceClient.from("profiles").update({
        status:             "pending",
        billing_status:     "pending_setup",
        plan_type:          "basic",
        chain_addon_active: false,
        chain_bar_count:    0,
        music_addon:        false,
        wallet_balance:     0,
        subscription_start_date: null,
        subscription_end_date:   null,
      }).eq("id", ownerId);
    }

    // ── 3. Delete the payment record ─────────────────────────────────────────
    await serviceClient.from("billing_payments").delete().eq("id", payment_id);

    return new Response(JSON.stringify({ ok: true, plan_type: planType }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
