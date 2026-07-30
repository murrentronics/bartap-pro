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

type BarEntry = { name: string; location: string; type: "bar" | "bar_machines" | "machines_only" };

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
    const durationMonths: number = (payment.billing_plans as any)?.duration_months ?? 12;

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

    const createdIds: string[] = [];

    for (const bar of barData) {
      const isMachinesType = bar.type === "machines_only";
      const hasBarMachines = bar.type === "bar_machines";

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

      // Derive plan_type for the sub-account based on the owner's plan
      const subPlanType =
        (ownerProfile.plan_type === "premium" || planType === "premium_addon") ? "chain" :
        ownerProfile.plan_type === "machines_only" ? "machines_only" :
        "basic"; // bar_only_addon owners are basic

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
          is_machines_account:   isMachinesType,
          machines_addon_active: isMachinesType || hasBarMachines,
          bar_addon_active:      !isMachinesType,
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

    // New subscription end date = now + 12 months (fresh renewal for entire plan)
    const newEndDate = new Date();
    newEndDate.setMonth(newEndDate.getMonth() + durationMonths);
    const newEndISO = newEndDate.toISOString();

    // Determine which date column(s) to update based on owner plan
    const profileUpdates: Record<string, unknown> = {
      is_multi_bar:    true,
      addon_bar_count: (ownerProfile.addon_bar_count ?? 0) + barData.length,
      chain_bar_count: (ownerProfile.chain_bar_count ?? 1) + createdIds.length,
      billing_status:  "active",
      status:          "approved",
    };

    if (planType === "premium_addon") {
      // Premium owner adding bars → flip to chain, update subscription_end_date
      profileUpdates.plan_type         = "chain";
      profileUpdates.chain_addon_active = true;
      profileUpdates.subscription_end_date = newEndISO;
    } else if (ownerProfile.plan_type === "premium") {
      profileUpdates.premium_subscription_end_date = newEndISO;
    } else if (ownerProfile.plan_type === "machines_only") {
      profileUpdates.machines_addon_end_date = newEndISO;
    } else {
      // basic (bar_only_addon)
      profileUpdates.subscription_end_date = newEndISO;
    }

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
