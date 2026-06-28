import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { deleteCashier } from "@/lib/cashiers.functions";
import { toast } from "sonner";
import { AlertTriangle, Trash2, Loader2, Gamepad2, Wine } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_app/factory-reset")({
  component: FactoryResetPage,
});

type ResetTarget = "bar" | "bar_financials" | "machines" | "both" | null;

export default function FactoryResetPage() {
  const { profile } = useAuth();
  const nav = useNavigate();

  // Step 1 — choose what to reset
  const [target, setTarget] = useState<ResetTarget>(null);
  // Step 2 — confirm
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);

  // Check if owner has machines access (premium or machines addon)
  const [hasMachines, setHasMachines] = useState(false);
  useEffect(() => {
    if (!profile?.id) return;
    (supabase as any)
      .from("profiles")
      .select("plan_type, machines_addon_active")
      .eq("id", profile.id)
      .single()
      .then(({ data }: { data: { plan_type: string; machines_addon_active: boolean } | null }) => {
        setHasMachines(data?.plan_type === "premium" || !!data?.machines_addon_active);
      });
  }, [profile?.id]);

  if (profile?.role !== "owner") {
    return <div className="text-center text-muted-foreground py-20">Only owners can access this page.</div>;
  }

  const resetBarFinancials = async (ownerId: string) => {
    // Keeps all products and their stock quantities intact.
    // Wipes all financial history so the owner can start fresh
    // by entering cost prices on existing items.

    // 1. Zero cashier wallets + clear their transaction history + orders (keep cashier accounts)
    const { data: cashiers } = await supabase
      .from("profiles").select("id").eq("parent_id", ownerId);
    if (cashiers?.length) {
      for (const c of cashiers as { id: string }[]) {
        await supabase.from("orders").delete().eq("cashier_id", c.id);
        await supabase.from("wallet_transactions").delete().eq("profile_id", c.id);
        await supabase.from("profiles").update({ wallet_balance: 0 }).eq("id", c.id);
      }
    }

    // 2. Delete owner wallet transactions
    await supabase.from("wallet_transactions").delete().eq("profile_id", ownerId);

    // 3. Delete all orders for this owner (covers owner-direct sales)
    await supabase.from("orders").delete().eq("owner_id", ownerId);

    // 4. Delete credit transactions and accounts
    const { data: creditAccounts } = await supabase
      .from("credit_accounts").select("id").eq("owner_id", ownerId);
    if (creditAccounts?.length) {
      const ids = creditAccounts.map((a: { id: string }) => a.id);
      await supabase.from("credit_transactions").delete().in("credit_account_id", ids);
      await supabase.from("credit_accounts").delete().eq("owner_id", ownerId);
    }

    // 5. Delete expense history + financials opening balance
    await supabase.from("owner_expenses").delete().eq("owner_id", ownerId);
    await (supabase as any).from("owner_financials").delete().eq("owner_id", ownerId);

    // 6. Reset owner wallet balance to 0
    await supabase.from("profiles").update({ wallet_balance: 0 }).eq("id", ownerId);

    // 7. Clear cost_price on all products so owner re-enters them fresh
    //    (stock_qty and selling price are kept)
    await supabase.from("products").update({ cost_price: 0, stock_last_expense_id: null }).eq("owner_id", ownerId);
  };

  const resetBar = async (ownerId: string) => {
    // 1. Delete cashiers FIRST — before touching owner wallet
    //    Wipe cashier wallet/orders first so the edge function doesn't
    //    try to transfer their balance (which would create new owner wallet records)
    const { data: cashiers } = await supabase
      .from("profiles").select("id").eq("parent_id", ownerId);
    if (cashiers?.length) {
      for (const c of cashiers as { id: string }[]) {
        // Zero out cashier balance so deleteCashier doesn't transfer anything
        await supabase.from("profiles").update({ wallet_balance: 0 }).eq("id", c.id);
        await supabase.from("wallet_transactions").delete().eq("profile_id", c.id);
        await supabase.from("orders").delete().eq("cashier_id", c.id);
        // Now delete profile + auth user via edge function (no balance to transfer)
        try {
          await deleteCashier({ cashier_id: c.id });
        } catch {
          await supabase.from("profiles").delete().eq("id", c.id);
        }
      }
    }

    // 2. Now wipe ALL owner wallet transactions (including any transfer_in records)
    await supabase.from("wallet_transactions").delete().eq("profile_id", ownerId);

    // 3. Orders
    await supabase.from("orders").delete().eq("owner_id", ownerId);

    // 4. Credit
    const { data: creditAccounts } = await supabase
      .from("credit_accounts").select("id").eq("owner_id", ownerId);
    if (creditAccounts?.length) {
      const ids = creditAccounts.map((a: { id: string }) => a.id);
      await supabase.from("credit_transactions").delete().in("credit_account_id", ids);
      await supabase.from("credit_accounts").delete().eq("owner_id", ownerId);
    }

    // 5. Products / items
    await supabase.from("products").delete().eq("owner_id", ownerId);

    // 6. Expenses & financials
    await supabase.from("owner_expenses").delete().eq("owner_id", ownerId);
    await (supabase as any).from("owner_financials").delete().eq("owner_id", ownerId);

    // 7. Reset owner wallet balance to 0
    await supabase.from("profiles").update({ wallet_balance: 0 }).eq("id", ownerId);
  };

  const resetMachines = async (ownerId: string) => {
    // Float sessions
    await (supabase as any).from("machine_float_sessions").delete().eq("owner_id", ownerId);
    // Machine entries (cascade from machines, but do it explicitly)
    await (supabase as any).from("machine_entries").delete().eq("owner_id", ownerId);
    // Machines
    await (supabase as any).from("machines").delete().eq("owner_id", ownerId);
  };

  const handleReset = async () => {
    if (!profile || !target) return;
    setBusy(true);
    try {
      const ownerId = profile.id;
      if (target === "bar" || target === "both") await resetBar(ownerId);
      if (target === "bar_financials") await resetBarFinancials(ownerId);
      if (target === "machines" || target === "both") await resetMachines(ownerId);

      toast.success(
        target === "both"           ? "Full reset complete."
        : target === "bar"          ? "Bar fully reset."
        : target === "bar_financials" ? "Financials cleared — items and stock kept."
        : "Machines data reset."
      );
      setBusy(false);
      setShowConfirm(false);

      if (target === "machines") {
        nav("/machines");
      } else {
        nav("/register");
      }
    } catch (err: any) {
      toast.error("Reset failed: " + (err?.message ?? "unknown error"));
      setBusy(false);
    }
  };

  const targetLabel = target === "bar" ? "Bar (Full)" : target === "bar_financials" ? "Bar Financials" : target === "machines" ? "Machines" : "Everything";
  const targetItems: Record<NonNullable<ResetTarget>, string[]> = {
    bar_financials: [
      "All sales orders and transaction history",
      "All wallet and statement records",
      "All credit accounts and bills",
      "All financial expense records",
      "All cost prices (re-enter to rebuild financials)",
      "✓ Items and stock quantities are KEPT",
    ],
    bar: [
      "All sales orders and transaction history",
      "All cashier accounts and their records",
      "All wallet and statement records",
      "All bar items and products",
      "All credit accounts and bills",
      "All financial expenses",
    ],
    machines: [
      "All machine entries (payouts & income)",
      "All machine float sessions",
      "All machine records",
    ],
    both: [
      "All of the above — bar AND machines",
    ],
  };

  return (
    <div className="py-6 space-y-6 max-w-lg mx-auto">

      {/* Warning header */}
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-2xl flex items-center justify-center shrink-0 bg-red-500/15 border border-red-500/30">
          <AlertTriangle className="h-6 w-6 text-red-400" />
        </div>
        <div>
          <h1 className="text-xl font-black text-red-400">Factory Reset</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Choose which database to wipe</p>
        </div>
      </div>

      {/* Step 1 — pick target */}
      <div className="space-y-3">
        {[
          { value: "bar_financials" as ResetTarget, icon: Wine,     label: "Clear Bar Financials", desc: "Keep items & stock — wipe orders, wallet, expenses, credit. Re-enter cost prices to rebuild.", machinesOnly: false },
          { value: "bar" as ResetTarget,            icon: Trash2,   label: "Full Bar Reset",        desc: "Wipe everything: items, cashiers, orders, wallet, credit, financials",                         machinesOnly: false },
          { value: "machines" as ResetTarget,       icon: Gamepad2, label: "Machines",              desc: "Machine entries, payouts, floats",                                                             machinesOnly: true  },
          { value: "both" as ResetTarget,           icon: Trash2,   label: "Everything",            desc: "Wipe both bar and machines completely",                                                        machinesOnly: true  },
        ]
        .filter(opt => !opt.machinesOnly || hasMachines)
        .map(({ value, icon: Icon, label, desc }) => (
          <button key={value} onClick={() => setTarget(value)}
            className={`w-full flex items-center gap-4 rounded-2xl p-4 border text-left transition active:scale-[0.98] ${
              target === value
                ? "border-red-500/60 bg-red-500/10"
                : "border-border hover:bg-muted/30"
            }`}>
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${
              target === value ? "bg-red-500/20 border border-red-500/40" : "bg-muted/40"
            }`}>
              <Icon className={`h-5 w-5 ${target === value ? "text-red-400" : "text-muted-foreground"}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className={`font-black text-sm ${target === value ? "text-red-400" : "text-foreground"}`}>{label}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
            </div>
            <div className={`h-5 w-5 rounded-full border-2 shrink-0 flex items-center justify-center ${
              target === value ? "border-red-400 bg-red-400" : "border-muted-foreground"
            }`}>
              {target === value && <div className="h-2 w-2 rounded-full bg-white" />}
            </div>
          </button>
        ))}
      </div>

      {/* What will be deleted */}
      {target && (
        <div className="rounded-2xl border border-red-500/30 p-4 space-y-2"
          style={{ background: "rgba(239,68,68,0.05)" }}>
          <p className="text-xs font-black text-red-400 uppercase tracking-wider">This will permanently delete:</p>
          <ul className="space-y-1.5">
            {targetItems[target].map((item) => {
              const isKept = item.startsWith("✓");
              return (
                <li key={item} className={`flex items-start gap-2 text-sm ${isKept ? "text-green-400 font-bold" : "text-muted-foreground"}`}>
                  <span className={`mt-0.5 shrink-0 ${isKept ? "text-green-400" : "text-red-400"}`}>{isKept ? "✓" : "✕"}</span>
                  {isKept ? item.replace("✓ ", "") : item}
                </li>
              );
            })}
          </ul>
          <p className="text-xs font-black text-red-400 pt-1">This cannot be undone.</p>
        </div>
      )}

      {/* Proceed button */}
      <Button
        onClick={() => { setConfirmText(""); setShowConfirm(true); }}
        disabled={!target}
        className="w-full h-14 text-base font-black bg-red-600 hover:bg-red-700 text-white disabled:opacity-40"
      >
        <Trash2 className="h-5 w-5 mr-2" />
        Reset {target ? targetLabel : "…"}
      </Button>

      {/* Confirm modal */}
      {showConfirm && target && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-red-500/40 shadow-2xl overflow-hidden"
            style={{ background: "var(--gradient-card)" }}>
            <div className="px-6 pt-6 pb-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-xl flex items-center justify-center bg-red-500/15 border border-red-500/30 shrink-0">
                  <AlertTriangle className="h-5 w-5 text-red-400" />
                </div>
                <h2 className="font-black text-lg text-red-400">Reset {targetLabel}?</h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                All <span className="font-black text-foreground">{targetLabel}</span> data will be permanently deleted.
                Type <span className="font-black text-foreground">RESET</span> to confirm.
              </p>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="Type RESET to confirm"
                className="w-full px-4 py-3 rounded-xl border border-border bg-background text-sm font-bold focus:outline-none focus:ring-2 focus:ring-red-500/40"
                autoCapitalize="characters"
              />
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <Button variant="outline" className="flex-1 h-14 text-base font-black"
                onClick={() => { setShowConfirm(false); setConfirmText(""); }}
                disabled={busy}>
                Cancel
              </Button>
              <Button className="flex-1 h-14 text-base font-black bg-red-600 hover:bg-red-700 text-white"
                disabled={busy || confirmText !== "RESET"}
                onClick={handleReset}>
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : "Reset"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
