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
    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || profile.role !== "owner") {
      return new Response(
        JSON.stringify({ error: "Only owners can delete cashiers" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { cashier_id } = await req.json();

    if (!cashier_id) {
      return new Response(
        JSON.stringify({ error: "Cashier ID is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify the cashier belongs to this owner
    const { data: cashierProfile } = await supabaseClient
      .from("profiles")
      .select("parent_id, wallet_balance")
      .eq("id", cashier_id)
      .eq("role", "cashier")
      .single();

    if (!cashierProfile || cashierProfile.parent_id !== user.id) {
      return new Response(
        JSON.stringify({ error: "Cashier not found or does not belong to you" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Transfer cashier balance to owner before deletion
    if (cashierProfile.wallet_balance > 0) {
      const { error: transferError } = await supabaseClient.rpc("transfer_cashier_to_owner", {
        _cashier_id: cashier_id,
      });

      if (transferError) {
        return new Response(
          JSON.stringify({ error: `Failed to transfer balance: ${transferError.message}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Delete the cashier profile (cascade will handle related records)
    const { error: deleteProfileError } = await supabaseClient
      .from("profiles")
      .delete()
      .eq("id", cashier_id);

    if (deleteProfileError) {
      return new Response(
        JSON.stringify({ error: deleteProfileError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Delete the auth user
    const { error: deleteAuthError } = await supabaseClient.auth.admin.deleteUser(cashier_id);

    if (deleteAuthError) {
      // Profile is already deleted, but log the auth deletion error
      console.error("Failed to delete auth user:", deleteAuthError);
    }

    return new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
