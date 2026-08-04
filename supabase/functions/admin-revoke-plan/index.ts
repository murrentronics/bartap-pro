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

    const body = await req.json();
    const payment_id: string | undefined = body.payment_id;
    // force=true means admin acknowledged the addon warning and wants the full wipe
    const force: boolean = body.force === true;

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

    // ── Addon guard for base/main plan revokes ───────────────────────────────
    // If revoking a main plan (full reset), check whether the owner has addons.
    // - If they asked admin to remove the base and KEEP addons → block entirely
    //   (they must close their account and re-register for the plan they want).
    // - If they want everything wiped (force=true) → proceed with full reset.
    // - If addons are active but force is not set → return has_addons so the UI
    //   can show a warning confirmation before proceeding.
    const fullResetTypes = [
      "basic", "machines_only", "machines_only_20", "chain", "premium", "premium_20",
    ];

    if (fullResetTypes.includes(planType) && !force) {
      const { data: ownerRow } = await serviceClient
        .from("profiles")
        .select("machines_addon_active, bar_addon_active, chain_addon_active, music_addon")
        .eq("id", ownerId)
        .single();

      const activeAddons: string[] = [];
      if (ownerRow?.machines_addon_active) activeAddons.push("Machines");
      if (ownerRow?.bar_addon_active)       activeAddons.push("Bar add-on");
      if (ownerRow?.chain_addon_active)     activeAddons.push("Chain add-on");
      if (ownerRow?.music_addon)            activeAddons.push("Music add-on");

      if (activeAddons.length > 0) {
        // Return a special response — UI uses this to show the right warning
        return new Response(
          JSON.stringify({ has_addons: true, addons: activeAddons }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ── 1. Delete all cashiers AND managers belonging to this owner ──────────
    const { data: subAccounts } = await serviceClient
      .from("profiles")
      .select("id")
      .eq("parent_id", ownerId)
      .in("role", ["cashier", "manager"]);

    for (const account of (subAccounts ?? [])) {
      await serviceClient
        .from("credit_transactions")
        .update({ cashier_id: ownerId })
        .eq("cashier_id", account.id);
      await serviceClient.from("profiles").delete().eq("id", account.id);
      await serviceClient.auth.admin.deleteUser(account.id);
    }

    // ── 2. Reset owner profile based on plan being revoked ───────────────────
    //
    // FULL RESET plans — owner returns to pending with no active plan
    // Covers: basic, machines_only, machines_only_20, chain, premium, premium_20
    //
    // PARTIAL RESET plans — only strip the specific addon; base plan stays
    // Covers: bar_only_addon, machines_bar_addon, machines_bar_addon_20,
    //         premium_addon, premium_addon_20, machines_addon

    if (fullResetTypes.includes(planType)) {
      await serviceClient.from("profiles").update({
        status:                              "pending",
        billing_status:                      "pending_setup",
        plan_type:                           "basic",
        subscription_start_date:             null,
        subscription_end_date:               null,
        premium_subscription_start_date:     null,
        premium_subscription_end_date:       null,
        machines_addon_active:               false,
        machines_addon_start_date:           null,
        machines_addon_end_date:             null,
        bar_addon_active:                    false,
        chain_addon_active:                  false,
        chain_bar_count:                     0,
        addon_bar_count:                     0,
        is_multi_bar:                        false,
        music_addon:                         false,
        wallet_balance:                      0,
      }).eq("id", ownerId);

    } else if (planType === "machines_addon") {
      // Legacy addon type — just strip machines
      await serviceClient.from("profiles").update({
        machines_addon_active:     false,
        machines_addon_start_date: null,
        machines_addon_end_date:   null,
      }).eq("id", ownerId);

    } else if (
      planType === "bar_only_addon" ||
      planType === "machines_bar_addon" ||
      planType === "machines_bar_addon_20" ||
      planType === "premium_addon" ||
      planType === "premium_addon_20"
    ) {
      // Extra account addon — decrement addon_bar_count by 1 (min 0)
      const { data: ownerRow } = await serviceClient
        .from("profiles")
        .select("addon_bar_count")
        .eq("id", ownerId)
        .single();
      const newCount = Math.max(0, (ownerRow?.addon_bar_count ?? 1) - 1);
      await serviceClient.from("profiles").update({
        addon_bar_count: newCount,
        is_multi_bar:    newCount > 0,
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
