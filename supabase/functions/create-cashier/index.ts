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

    const { username, password } = await req.json();

    if (!username || !password) {
      return new Response(
        JSON.stringify({ error: "Username and password are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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

    // Create the cashier user in auth.users
    // The trigger will automatically create the profile
    const { data: authData, error: createError } = await supabaseClient.auth.admin.createUser({
      email: `${username}@cashier.local`,
      password: password,
      email_confirm: true,
      user_metadata: {
        username: username,
        role: "cashier",
        parent_id: user.id,
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
