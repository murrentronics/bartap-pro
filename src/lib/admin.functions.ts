import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("profiles").select("role").eq("id", userId).maybeSingle();
  if (!data || (data as { role: string }).role !== "admin") {
    throw new Error("Admin only");
  }
}

const idSchema = z.object({ user_id: z.string().uuid() });

export const listAllProfiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await (supabaseAdmin
      .from("profiles") as any)
      .select("id, username, role, status, created_at, wallet_balance")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const { data: users } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    const emailMap = new Map(users.users.map((u) => [u.id, u.email ?? ""]));
    return ((data ?? []) as Array<{ id: string; username: string; role: string; status: string; wallet_balance: number; created_at: string }>)
      .map((p) => ({ ...p, email: emailMap.get(p.id) ?? "" }));
  });

export const setUserStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    idSchema.extend({
      status: z.enum(["pending", "approved", "suspended", "expelled"]),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await (supabaseAdmin
      .from("profiles") as any)
      .update({ status: data.status })
      .eq("id", data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
