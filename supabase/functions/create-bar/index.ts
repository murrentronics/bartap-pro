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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Verify caller is authenticated
    const authHeader = req.headers.get("Authorization") ?? "";
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Verify caller is a chain owner
    const { data: ownerProfile } = await supabase
      .from("profiles")
      .select("role, plan_type, chain_bar_count, chain_addon_active")
      .eq("id", user.id)
      .single();

    if (!ownerProfile || ownerProfile.role !== "owner" || ownerProfile.plan_type !== "chain") {
      return new Response(JSON.stringify({ error: "Chain plan required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Count existing sub-accounts
    const { count: subCount } = await supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("parent_id", user.id)
      .eq("is_bar_account", true);

    if ((subCount ?? 0) >= 9) {
      return new Response(JSON.stringify({ error: "Maximum 10 bars reached" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { p_name, p_location, p_has_machines, p_copy_items } = await req.json();
    if (!p_name?.trim() || !p_location?.trim()) {
      return new Response(JSON.stringify({ error: "Name and location required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Create auth user for the bar (fake email, never logs in directly)
    const fakeEmail = `bar-${crypto.randomUUID()}@chain.internal`;
    const { data: authData, error: createError } = await supabase.auth.admin.createUser({
      email: fakeEmail,
      password: crypto.randomUUID(), // random password — account is never logged into
      email_confirm: true,
      user_metadata: {
        username: p_name.trim(),
        role: "owner",
        parent_id: user.id,
      },
    });

    if (createError || !authData.user) {
      return new Response(JSON.stringify({ error: createError?.message ?? "Failed to create bar" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const barId = authData.user.id;

    // Upsert profile row (trigger may have already created a stub)
    const { error: profileError } = await supabase
      .from("profiles")
      .upsert({
        id:                   barId,
        username:             p_name.trim(),
        role:                 "owner",
        parent_id:            user.id,
        wallet_balance:       0,
        status:               "approved",
        address:              p_location.trim(),
        is_bar_account:       true,
        machines_addon_active: p_has_machines ?? false,
        plan_type:            "chain",
        chain_addon_active:   false,
        billing_status:       "active",
      }, { onConflict: "id" });

    if (profileError) {
      // Rollback auth user
      await supabase.auth.admin.deleteUser(barId);
      return new Response(JSON.stringify({ error: profileError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Increment chain_bar_count on master
    await supabase
      .from("profiles")
      .update({ chain_bar_count: (ownerProfile.chain_bar_count ?? 1) + 1 })
      .eq("id", user.id);

    // Copy products from the master's own bar (bar 1 = master profile) if requested
    if (p_copy_items === true) {
      const { data: sourceProducts } = await supabase
        .from("products")
        .select("name, price, category, is_available, description, image_url")
        .eq("owner_id", user.id);

      if (sourceProducts && sourceProducts.length > 0) {
        const copies = sourceProducts.map((p) => ({ ...p, owner_id: barId }));
        for (let i = 0; i < copies.length; i += 100) {
          await supabase.from("products").insert(copies.slice(i, i + 100));
        }
      }
    }

    return new Response(JSON.stringify({ bar_id: barId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
