// Browser-compatible version — calls Supabase directly (no server functions)
import { supabase } from "@/integrations/supabase/client";
import { friendlyError } from "@/lib/network-error";

export const createCashier = async (data: { username: string; password: string }) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

  let res: Response;
  try {
    res = await fetch(`${supabaseUrl}/functions/v1/create-cashier`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session.access_token}`,
        "apikey": supabaseKey,
      },
      body: JSON.stringify({ username: data.username, password: data.password }),
    });
  } catch (err) {
    throw new Error(friendlyError(err));
  }

  const json = await res.json() as { id?: string; username?: string; error?: string };
  if (!res.ok) throw new Error(json.error ?? "Failed to create cashier");
  return json;
};

export const resetCashierPassword = async (data: { cashier_id: string; new_password: string }) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

  let res: Response;
  try {
    res = await fetch(`${supabaseUrl}/functions/v1/reset-cashier-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session.access_token}`,
        "apikey": supabaseKey,
      },
      body: JSON.stringify({ cashier_id: data.cashier_id, new_password: data.new_password }),
    });
  } catch (err) {
    throw new Error(friendlyError(err));
  }

  const json = await res.json() as { ok?: boolean; error?: string };
  if (!res.ok) throw new Error(json.error ?? "Failed to reset password");
  return json;
};

export const deleteCashier = async (data: { cashier_id: string }) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

  let res: Response;
  try {
    res = await fetch(`${supabaseUrl}/functions/v1/delete-cashier`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session.access_token}`,
        "apikey": supabaseKey,
      },
      body: JSON.stringify({ cashier_id: data.cashier_id }),
    });
  } catch (err) {
    throw new Error(friendlyError(err));
  }

  const json = await res.json() as { ok?: boolean; error?: string };
  if (!res.ok) throw new Error(json.error ?? "Failed to delete cashier");
  return json;
};
