/**
 * create-addon-bars — called by AdminBillingManagementPage when approving
 * a bar_only_addon, machines_bar_addon, or premium_addon payment.
 *
 * Reads addon_bar_data from the billing_payment row, creates each bar
 * sub-account under the owner, increments addon_bar_count and chain_bar_count,
 * sets is_multi_bar = true, and resets subscription_end_date to now + 12 months.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type BarEntry = { name: string; location: string; type: "bar" | "bar_machines" | "bar_machines_20" | "machines_only" | "machines_only_20" };

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Only callable by admin (verified via service role — caller must be authenticated admin)
    const authHeader = req.headers.get("Authorization") ?? "";
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { data: callerProfile } = await supabase
      .from("profiles").select("role").eq("id", user.id).single();
    if (callerProfile?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Admin only" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { payment_id } = await req.json();
    if (!payment_id) {
      return new Response(JSON.stringify({ error: "payment_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Load the payment with plan info
    const { data: payment } = await supabase
      .from("billing_payments")
      .select("*, billing_plans(plan_type, duration_months)")
      .eq("id", payment_id)
      .single();

    if (!payment) {
      return new Response(JSON.stringify({ error: "Payment not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const ownerId: string = payment.owner_id;
    const barData: BarEntry[] = payment.addon_bar_data ?? [];
    const planType: string = (payment.billing_plans as any)?.plan_type ?? "";
    const paymentNotes: string = payment.notes ?? "";

    // Parse special instructions from notes
    // "target_account_id: <uuid>" → upgrade an existing sub-account instead of creating new
    // "destination: existing" → confirms we are upgrading an existing account
    const targetAccountMatch = paymentNotes.match(/target_account_id:\s*([a-f0-9-]{36})/i);
    const targetAccountId: string | null = targetAccountMatch ? targetAccountMatch[1] : null;
    const isUpgradeSame = paymentNotes.includes("Same-account upgrade");
    const isExistingDestination = paymentNotes.includes("destination: existing");

    // Load owner profile
    const { data: ownerProfile } = await supabase
      .from("profiles")
      .select("plan_type, chain_bar_count, addon_bar_count, subscription_end_date, machines_addon_end_date, premium_subscription_end_date")
      .eq("id", ownerId)
      .single();

    if (!ownerProfile) {
      return new Response(JSON.stringify({ error: "Owner not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Case 1: Same-account upgrade (machines_only → premium/premium_20) ──
    if (isUpgradeSame) {
      const targetPlan = paymentNotes.includes("premium_20") ? "premium_20" : "premium";
      await supabase.from("profiles").update({
        plan_type:             targetPlan,
        bar_addon_active:      true,
        machines_addon_active: true,
        billing_status:        "active",
        status:                "approved",
        music_addon:           true,
      }).eq("id", ownerId);

      return new Response(
        JSON.stringify({ upgraded: true, plan: targetPlan }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Case 2: Upgrade existing sub-account (add screens or add bar) ──
    if (isExistingDestination && targetAccountId) {
      const addonType = barData[0]?.type ?? "";
      const is20Screens   = addonType === "machines_only_20";
      const isBarMachines  = addonType === "bar_machines" || addonType === "bar_machines_20";
      const is20BarMachines = addonType === "bar_machines_20";

      if (is20Screens) {
        // Upgrade machine account from 10 → 20 screens
        await supabase.from("profiles").update({
          plan_type: "machines_only_20",
        }).eq("id", targetAccountId).eq("parent_id", ownerId);
      } else if (isBarMachines) {
        // Add bar to existing machine account
        await supabase.from("profiles").update({
          is_machines_account:   true,
          machines_addon_active: true,
          bar_addon_active:      true,
          plan_type:             is20BarMachines ? "premium_20" : "premium",
        }).eq("id", targetAccountId).eq("parent_id", ownerId);
      }

      // Mark owner as multi-bar and increment addon_bar_count
      const { data: ownerNow } = await supabase
        .from("profiles")
        .select("addon_bar_count")
        .eq("id", ownerId)
        .single();
      await supabase.from("profiles").update({
        is_multi_bar:    true,
        billing_status:  "active",
        status:          "approved",
        addon_bar_count: (ownerNow?.addon_bar_count ?? 0) + 1,
      }).eq("id", ownerId);

      return new Response(
        JSON.stringify({ upgraded: true, target: targetAccountId }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Case 3: Create new sub-accounts ──
    const createdIds: string[] = [];

    for (const bar of barData) {
      const isMachinesType   = bar.type === "machines_only" || bar.type === "machines_only_20";
      const isMachines20     = bar.type === "machines_only_20";
      const hasBarMachines   = bar.type === "bar_machines" || bar.type === "bar_machines_20";
      const isBarMachines20  = bar.type === "bar_machines_20";

      const fakeEmail = `bar-${crypto.randomUUID()}@chain.internal`;
      const { data: authData, error: createError } = await supabase.auth.admin.createUser({
        email: fakeEmail,
        password: crypto.randomUUID(),
        email_confirm: true,
        user_metadata: {
          username: bar.name.trim(),
          role: "owner",
          parent_id: ownerId,
        },
      });

      if (createError || !authData.user) {
        console.error("Failed to create auth user:", createError?.message);
        continue;
      }

      const barId = authData.user.id;

      // Derive plan_type for the sub-account
      const subPlanType =
        hasBarMachines ? (isBarMachines20 ? "premium_20" : "premium") :
        isMachinesType ? (isMachines20 ? "machines_only_20" : "machines_only") :
        (ownerProfile.plan_type === "premium" || planType === "premium_addon") ? "chain" :
        "basic";

      const { error: profileError } = await supabase
        .from("profiles")
        .upsert({
          id:                    barId,
          username:              bar.name.trim(),
          role:                  "owner",
          parent_id:             ownerId,
          wallet_balance:        0,
          status:                "approved",
          address:               bar.location.trim(),
          is_bar_account:        true,
          is_machines_account:   isMachinesType || hasBarMachines,
          machines_addon_active: isMachinesType || hasBarMachines,
          bar_addon_active:      !isMachinesType || hasBarMachines,
          plan_type:             subPlanType,
          chain_addon_active:    false,
          billing_status:        "active",
          music_addon:           true,
        }, { onConflict: "id" });

      if (profileError) {
        console.error("Failed to upsert profile:", profileError.message);
        await supabase.auth.admin.deleteUser(barId);
        continue;
      }

      createdIds.push(barId);
    }

    // ── DO NOT reset subscription_end_date when approving an addon ──────────
    // Addon bars are pro-rated to the remaining time on the owner's current plan.
    // The end date stays as-is so that at renewal time the owner pays full price
    // for all bars (base plan + all addons) in one bulk annual payment.
    // We only update the bar counts and status flags.

    // Re-count actual sub-accounts from DB to avoid stale cached counts
    const { count: actualSubCount } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("parent_id", ownerId)
      .eq("is_bar_account", true);

    const newAddonCount = actualSubCount ?? createdIds.length;

    // Determine which date column(s) to update based on owner plan
    const profileUpdates: Record<string, unknown> = {
      is_multi_bar:    true,
      addon_bar_count: newAddonCount,
      chain_bar_count: (ownerProfile.chain_bar_count ?? 0),
      billing_status:  "active",
      status:          "approved",
    };

    if (planType === "premium_addon") {
      // Premium owner adding bars → flip to chain, but keep existing subscription_end_date
      profileUpdates.plan_type         = "chain";
      profileUpdates.chain_addon_active = true;
      // Note: subscription_end_date intentionally NOT updated here — it aligns to the existing plan expiry
    }
    // For bar_only_addon and machines_bar_addon, no date changes at all —
    // they already have a subscription_end_date / machines_addon_end_date in place.

    await supabase.from("profiles").update(profileUpdates).eq("id", ownerId);

    return new Response(
      JSON.stringify({ created: createdIds.length, ids: createdIds }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: unknown) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
