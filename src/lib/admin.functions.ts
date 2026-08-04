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
  // Only reset billing fields when sending an OWNER back to pending.
  // Managers and cashiers have parent_id set — never touch billing fields on them.
  let extraFields: Record<string, unknown> = {};
  if (status === "pending") {
    // Fetch role first to guard against non-owner profiles
    const { data: target } = await supabase
      .from("profiles")
      .select("role, parent_id")
      .eq("id", user_id)
      .single();
    const isOwner = target?.role === "owner" && !target?.parent_id;
    if (isOwner) {
      extraFields = {
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
      };
    }
  }

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

// ─── Revoke Subscription ──────────────────────────────────────────────────────
//
// Rules:
//  • If the owner has ANY addon active (machines, bar_addon, chain, music) they
//    CANNOT revoke the base plan — they must close the account and re-register.
//  • If no addons are active, revoke wipes all billing fields, sets status back
//    to "pending", deletes all billing_payments records for that owner, and
//    removes all cashier/manager sub-accounts.
//
export type RevokeResult =
  | { ok: true }
  | { ok: false; reason: "has_addons"; addons: string[] }
  | { ok: false; reason: "error"; message: string };

export async function revokeSubscription(owner_id: string): Promise<RevokeResult> {
  // 1. Fetch full profile to check addon state
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select(
      "role, parent_id, plan_type, machines_addon_active, bar_addon_active, chain_addon_active, music_addon"
    )
    .eq("id", owner_id)
    .single();

  if (profileErr || !profile) {
    return { ok: false, reason: "error", message: profileErr?.message ?? "Profile not found" };
  }

  // Guard: only apply to real owner accounts (no parent)
  if (profile.role !== "owner" || profile.parent_id) {
    return { ok: false, reason: "error", message: "Can only revoke subscriptions for owner accounts" };
  }

  // Guard: block if any addon is active — user must close account and re-register
  const activeAddons: string[] = [];
  if (profile.machines_addon_active) activeAddons.push("Machines addon");
  if (profile.bar_addon_active)       activeAddons.push("Bar addon");
  if (profile.chain_addon_active)     activeAddons.push("Chain addon");
  if (profile.music_addon)            activeAddons.push("Music addon");

  if (activeAddons.length > 0) {
    return { ok: false, reason: "has_addons", addons: activeAddons };
  }

  // 2. Remove all cashier + manager sub-accounts for this owner
  const { data: subAccounts } = await supabase
    .from("profiles")
    .select("id")
    .eq("parent_id", owner_id)
    .in("role", ["cashier", "manager"]);

  for (const sub of subAccounts ?? []) {
    // Reassign any credit transactions so FK constraint doesn't block delete
    await supabase
      .from("credit_transactions")
      .update({ cashier_id: owner_id })
      .eq("cashier_id", sub.id);
    await supabase.from("profiles").delete().eq("id", sub.id);
  }

  // 3. Delete all billing_payments for this owner
  const { error: paymentsErr } = await supabase
    .from("billing_payments")
    .delete()
    .eq("owner_id", owner_id);

  if (paymentsErr) {
    return { ok: false, reason: "error", message: "Failed to delete payments: " + paymentsErr.message };
  }

  // 4. Full profile reset — status → pending, all billing fields cleared
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateErr } = await (supabase as any)
    .from("profiles")
    .update({
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
    })
    .eq("id", owner_id);

  if (updateErr) {
    return { ok: false, reason: "error", message: "Failed to reset profile: " + updateErr.message };
  }

  return { ok: true };
}
