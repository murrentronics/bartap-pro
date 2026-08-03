// Browser-side admin operations using authenticated user + admin RLS/RPCs.
// No service role needed.
import { supabase } from "@/integrations/supabase/client";

export type AdminProfileRow = {
  id: string;
  username: string;
  email: string;
  role: "admin" | "owner" | "cashier";
  status: "pending" | "approved" | "suspended" | "expelled";
  wallet_balance: number;
  created_at: string;
  parent_id: string | null;
  phone: string | null;
  address: string | null;
  plan_type?: string;
  chain_bar_count?: number;
  is_bar_account?: boolean;
};

export async function listAllProfiles(): Promise<AdminProfileRow[]> {
  const { data, error } = await supabase.rpc("admin_list_profiles");
  if (error) throw new Error(error.message);
  return (data ?? []) as AdminProfileRow[];
}

export async function setUserStatus(
  user_id: string,
  status: AdminProfileRow["status"]
): Promise<void> {
  // When sending back to pending, also reset billing_status so the owner's
  // billing page shows the "choose a plan" flow instead of the active dashboard.
  const extraFields: Record<string, unknown> =
    status === "pending"
      ? {
          billing_status:                  "pending_setup",
          plan_type:                       "basic",
          subscription_start_date:         null,
          subscription_end_date:           null,
          premium_subscription_start_date: null,
          premium_subscription_end_date:   null,
          machines_addon_active:           false,
          machines_addon_start_date:       null,
          machines_addon_end_date:         null,
          bar_addon_active:                false,
          chain_addon_active:              false,
          chain_bar_count:                 0,
          addon_bar_count:                 0,
          is_multi_bar:                    false,
          music_addon:                     false,
        }
      : {};

  const { error } = await supabase
    .from("profiles")
    .update({ status, ...extraFields })
    .eq("id", user_id);
  if (error) throw new Error(error.message);
}

export async function adminDeleteUser(user_id: string): Promise<void> {
  const { error } = await supabase.rpc("admin_delete_user", { _user_id: user_id });
  if (error) throw new Error(error.message);
}
