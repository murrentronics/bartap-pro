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
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Get the authorization header from the request
    const authHeader = req.headers.get("Authorization")!;
    
    // Verify the caller is authenticated and is an owner
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user is an owner
    const { data: ownerProfile } = await supabaseClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!ownerProfile || ownerProfile.role !== "owner") {
      return new Response(
        JSON.stringify({ error: "Only owners can create cashiers" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { username, password, bar_owner_id, role } = await req.json();

    if (!username || !password) {
      return new Response(
        JSON.stringify({ error: "Username and password are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Only allow valid login roles via this function (manager or cashier)
    const effectiveRole = role === "manager" ? "manager" : "cashier";

    // Determine the effective parent_id:
    // - Chain owners pass bar_owner_id (the active bar sub-account's id)
    // - Regular owners use their own id
    let parentId = user.id;
    if (bar_owner_id && bar_owner_id !== user.id) {
      // Verify the bar actually belongs to this chain owner (parent_id = user.id)
      const { data: barProfile } = await supabaseClient
        .from("profiles")
        .select("id, parent_id, is_bar_account")
        .eq("id", bar_owner_id)
        .single();
      if (barProfile?.parent_id === user.id && barProfile?.is_bar_account === true) {
        parentId = bar_owner_id;
      }
    }

    // Check if username already exists
    const { data: existingProfile } = await supabaseClient
      .from("profiles")
      .select("username")
      .eq("username", username)
      .single();

    if (existingProfile) {
      return new Response(
        JSON.stringify({ error: `Username "${username}" is already taken` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create the cashier/manager user in auth.users
    // The trigger will automatically create the profile
    const { data: authData, error: createError } = await supabaseClient.auth.admin.createUser({
      email: `${username}@bartendaz.cashier`,
      password: password,
      email_confirm: true,
      user_metadata: {
        username: username,
        role: effectiveRole,
        parent_id: parentId,
      },
    });

    if (createError) {
      // Check if it's a duplicate email error
      if (createError.message.includes("already") || createError.message.includes("duplicate")) {
        return new Response(
          JSON.stringify({ error: `Username "${username}" is already taken` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ error: createError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Profile is automatically created by the trigger, just verify it exists
    // Then explicitly set parent_id in case the trigger didn't pick it up correctly
    const { data: cashierProfile, error: profileError } = await supabaseClient
      .from("profiles")
      .select("id, username")
      .eq("id", authData.user.id)
      .single();

    if (profileError || !cashierProfile) {
      // Rollback: delete the auth user
      await supabaseClient.auth.admin.deleteUser(authData.user.id);
      return new Response(
        JSON.stringify({ error: "Failed to create profile" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Force-set parent_id and role — don't rely solely on the trigger
    await supabaseClient
      .from("profiles")
      .update({ parent_id: parentId, role: effectiveRole })
      .eq("id", authData.user.id);

    return new Response(
      JSON.stringify({ id: authData.user.id, username: username }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
