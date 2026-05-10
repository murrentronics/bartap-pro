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
  const { error } = await supabase
    .from("profiles")
    .update({ status })
    .eq("id", user_id);
  if (error) throw new Error(error.message);
}

export async function adminDeleteUser(user_id: string): Promise<void> {
  const { error } = await supabase.rpc("admin_delete_user", { _user_id: user_id });
  if (error) throw new Error(error.message);
}
