import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const createSchema = z.object({
  username: z.string().trim().min(3).max(30).regex(/^[a-z0-9_]+$/i, "letters, numbers, underscore"),
  password: z.string().min(6).max(72),
});

export const createCashier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    // verify caller is owner
    const { data: caller } = await supabaseAdmin
      .from("profiles").select("role").eq("id", userId).maybeSingle();
    if (!caller || caller.role !== "owner") throw new Error("Only owners can create cashiers");

    const email = `${data.username.toLowerCase()}@bartendaz.cashier`;
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { username: data.username, role: "cashier", parent_id: userId },
    });
    if (error) throw new Error(error.message);
    return { id: created.user?.id, username: data.username };
  });

export const deleteCashier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ cashier_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: cashier } = await supabaseAdmin
      .from("profiles").select("parent_id, wallet_balance").eq("id", data.cashier_id).maybeSingle();
    if (!cashier || cashier.parent_id !== userId) throw new Error("Not authorized");

    // Always clear wallet to owner first (no-op if balance is 0)
    if (Number(cashier.wallet_balance) > 0) {
      const { error: rpcErr } = await supabaseAdmin.rpc("transfer_cashier_to_owner", { _cashier_id: data.cashier_id });
      if (rpcErr) throw new Error(rpcErr.message);
    }
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.cashier_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
