import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useChain } from "@/lib/ChainContext";
import { supabase } from "@/integrations/supabase/client";
import { deleteCashier } from "@/lib/cashiers.functions";
import { toast } from "sonner";
import { AlertTriangle, Trash2, Loader2, Gamepad2, Wine, GitBranch, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_app/factory-reset")({
  component: FactoryResetPage,
});

type ResetTarget = "bar" | "bar_financials" | "machines" | "both" | null;
type BarScope = string | "all" | null;

export default function FactoryResetPage() {
  const { profile } = useAuth();
  const { isChainOwner, chainBars, effectiveOwnerId } = useChain();
  const nav = useNavigate();

  const [barScope, setBarScope] = useState<BarScope>(null);
  const [target, setTarget] = useState<ResetTarget>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [hasMachines, setHasMachines] = useState(false);
  const [isMachinesOnlyPlan, setIsMachinesOnlyPlan] = useState(false);

  useEffect(() => {
    if (!profile?.id) return;
    (supabase as any)
      .from("profiles")
      .select("plan_type, machines_addon_active")
      .eq("id", profile.id)
      .single()
      .then(({ data }: { data: { plan_type: string; machines_addon_active: boolean } | null }) => {
        const machOnly = data?.plan_type === "machines_only";
        setIsMachinesOnlyPlan(machOnly);
        setHasMachines(data?.plan_type === "premium" || machOnly || !!data?.machines_addon_active);
      });
  }, [profile?.id]);

  if (profile?.role !== "owner") {
    return (
      <div className="text-center text-muted-foreground py-20">
        Only owners can access this page.
      </div>
    );
  }

  // ── Reset helpers ─────────────────────────────────────────────────────────

  const resetBarFinancials = async (ownerId: string) => {
    const { data: cashiers } = await supabase
      .from("profiles").select("id").eq("parent_id", ownerId);
    if (cashiers?.length) {
      for (const c of cashiers as { id: string }[]) {
        await supabase.from("orders").delete().eq("cashier_id", c.id);
        await supabase.from("wallet_transactions").delete().eq("profile_id", c.id);
      }
    }
    await supabase.rpc("reset_cashier_wallets", { _owner_id: ownerId });
    await supabase.from("wallet_transactions").delete().eq("profile_id", ownerId);
    await supabase.from("orders").delete().eq("owner_id", ownerId);
    const { data: creditAccounts } = await supabase
      .from("credit_accounts").select("id").eq("owner_id", ownerId);
    if (creditAccounts?.length) {
      const ids = creditAccounts.map((a: { id: string }) => a.id);
      await supabase.from("credit_transactions").delete().in("credit_account_id", ids);
      await supabase.from("credit_accounts").delete().eq("owner_id", ownerId);
    }
    await supabase.from("owner_expenses").delete().eq("owner_id", ownerId);
    await (supabase as any).from("owner_financials").delete().eq("owner_id", ownerId);
    await supabase.from("profiles").update({ wallet_balance: 0 }).eq("id", ownerId);
    await supabase.from("products").update({
      cost_price: 0,
      stock_qty: 0,
      stock_qty_undo: null,
      stock_qty_undo_saved: null,
      stock_last_expense_id: null,
    }).eq("owner_id", ownerId);
  };

  const resetBar = async (ownerId: string) => {
    const { data: cashiers } = await supabase
      .from("profiles").select("id").eq("parent_id", ownerId);
    if (cashiers?.length) {
      for (const c of cashiers as { id: string }[]) {
        await supabase.from("profiles").update({ wallet_balance: 0 }).eq("id", c.id);
        await supabase.from("wallet_transactions").delete().eq("profile_id", c.id);
        await supabase.from("orders").delete().eq("cashier_id", c.id);
        try {
          await deleteCashier({ cashier_id: c.id });
        } catch {
          await supabase.from("profiles").delete().eq("id", c.id);
        }
      }
    }
    await supabase.from("wallet_transactions").delete().eq("profile_id", ownerId);
    await supabase.from("orders").delete().eq("owner_id", ownerId);
    const { data: creditAccounts } = await supabase
      .from("credit_accounts").select("id").eq("owner_id", ownerId);
    if (creditAccounts?.length) {
      const ids = creditAccounts.map((a: { id: string }) => a.id);
      await supabase.from("credit_transactions").delete().in("credit_account_id", ids);
      await supabase.from("credit_accounts").delete().eq("owner_id", ownerId);
    }
    await supabase.from("products").delete().eq("owner_id", ownerId);
    await supabase.from("owner_expenses").delete().eq("owner_id", ownerId);
    await (supabase as any).from("owner_financials").delete().eq("owner_id", ownerId);
    await supabase.from("profiles").update({ wallet_balance: 0 }).eq("id", ownerId);
  };

  const resetMachines = async (ownerId: string) => {
    await (supabase as any).from("machine_float_sessions").delete().eq("owner_id", ownerId);
    await (supabase as any).from("machine_entries").delete().eq("owner_id", ownerId);
    await (supabase as any).from("machines").delete().eq("owner_id", ownerId);
  };

  // ── Handle reset ──────────────────────────────────────────────────────────

  const handleReset = async () => {
    if (!profile || !target) return;
    setBusy(true);
    try {
      let ownerIds: string[];
      if (isChainOwner && barScope === "all") {
        ownerIds = chainBars.map((b) => b.id);
      } else if (isChainOwner && barScope && barScope !== "all") {
        ownerIds = [barScope];
      } else {
        ownerIds = [effectiveOwnerId(profile.id)];
      }

      for (const ownerId of ownerIds) {
        if (target === "bar" || target === "both") await resetBar(ownerId);
        if (target === "bar_financials") await resetBarFinancials(ownerId);
        if (target === "machines" || target === "both") await resetMachines(ownerId);
      }

      const toastScope =
        isChainOwner && barScope === "all" ? "All bars"
        : isChainOwner && barScope ? chainBars.find((b) => b.id === barScope)?.bar_name ?? "Bar"
        : null;

      const toastMsg =
        target === "both"             ? "Full reset complete."
        : target === "bar"            ? "Bar fully reset."
        : target === "bar_financials" ? "Financials cleared — items and stock kept."
        : "Machines data reset.";

      toast.success(toastScope ? `${toastScope} — ${toastMsg}` : toastMsg);
      setBusy(false);
      setShowConfirm(false);
      nav(target === "machines" ? "/machines" : "/register");
    } catch (err: any) {
      toast.error("Reset failed: " + (err?.message ?? "unknown error"));
      setBusy(false);
    }
  };

  // ── Derived display values ────────────────────────────────────────────────

  const targetLabel =
    target === "bar"             ? "Bar (Full)"
    : target === "bar_financials" ? "Bar Financials"
    : target === "machines"       ? "Machines"
    : "Everything";

  const scopeLabel =
    isChainOwner && barScope === "all" ? "All Bars"
    : isChainOwner && barScope ? chainBars.find((b) => b.id === barScope)?.bar_name ?? "Selected Bar"
    : null;

  const targetItems: Record<NonNullable<ResetTarget>, string[]> = {
    bar_financials: [
      "All sales orders and transaction history",
      "All wallet and statement records",
      "All credit accounts and bills",
      "All financial expense records",
      "All cost prices (re-enter to rebuild financials)",
      "All stock quantities (reset to zero)",
      "✓ Items (products list) are KEPT",
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

  // ── Render ────────────────────────────────────────────────────────────────

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

      {/* ── Step 0: Bar selection (chain owners only) ── */}
      {isChainOwner && (
        <div className="space-y-3">
          <p className="text-xs font-black text-muted-foreground uppercase tracking-widest">
            Step 1 — Which bar?
          </p>

          {chainBars.map((bar) => (
            <button
              key={bar.id}
              onClick={() => { setBarScope(bar.id); setTarget(null); }}
              className={`w-full flex items-center gap-4 rounded-2xl p-4 border text-left transition active:scale-[0.98] ${
                barScope === bar.id
                  ? "border-red-500/60 bg-red-500/10"
                  : "border-border hover:bg-muted/30"
              }`}
            >
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 font-black text-base ${
                barScope === bar.id
                  ? "bg-red-500/20 border border-red-500/40 text-red-400"
                  : "bg-muted/40 text-muted-foreground"
              }`}>
                {bar.bar_number}
              </div>
              <div className="flex-1 min-w-0">
                <div className={`font-black text-sm ${barScope === bar.id ? "text-red-400" : "text-foreground"}`}>
                  {bar.bar_name}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">{bar.bar_location}</div>
              </div>
              <ChevronRight className={`h-4 w-4 shrink-0 ${barScope === bar.id ? "text-red-400" : "text-muted-foreground"}`} />
            </button>
          ))}

          {/* All bars */}
          <button
            onClick={() => { setBarScope("all"); setTarget(null); }}
            className={`w-full flex items-center gap-4 rounded-2xl p-4 border text-left transition active:scale-[0.98] ${
              barScope === "all"
                ? "border-red-500/60 bg-red-500/10"
                : "border-border hover:bg-muted/30"
            }`}
          >
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${
              barScope === "all" ? "bg-red-500/20 border border-red-500/40" : "bg-muted/40"
            }`}>
              <GitBranch className={`h-5 w-5 ${barScope === "all" ? "text-red-400" : "text-muted-foreground"}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className={`font-black text-sm ${barScope === "all" ? "text-red-400" : "text-foreground"}`}>
                All Bars
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Apply the same reset to all {chainBars.length} bars at once
              </div>
            </div>
            <ChevronRight className={`h-4 w-4 shrink-0 ${barScope === "all" ? "text-red-400" : "text-muted-foreground"}`} />
          </button>
        </div>
      )}

      {/* ── Step 1 / Step 2 for chain owners: pick what to reset ── */}
      {(!isChainOwner || barScope !== null) && (
        <>
          {isChainOwner && (
            <p className="text-xs font-black text-muted-foreground uppercase tracking-widest">
              Step 2 — What to reset?
            </p>
          )}

          <div className="space-y-3">
            {([
              { value: "bar_financials" as ResetTarget, icon: Wine,     label: "Clear Bar Financials", desc: "Keep items — wipe orders, wallet, expenses, credit & stock quantities.", machinesOnly: false, barOnly: true  },
              { value: "bar"            as ResetTarget, icon: Trash2,   label: "Full Bar Reset",        desc: "Wipe everything: items, cashiers, orders, wallet, credit, financials",  machinesOnly: false, barOnly: true  },
              { value: "machines"       as ResetTarget, icon: Gamepad2, label: "Machines Reset",        desc: "Wipe machine entries, payouts and floats",                               machinesOnly: true,  barOnly: false },
              { value: "both"           as ResetTarget, icon: Trash2,   label: "Everything",            desc: "Wipe both bar and machines completely",                                  machinesOnly: true,  barOnly: false },
            ] as { value: ResetTarget; icon: React.ElementType; label: string; desc: string; machinesOnly: boolean; barOnly: boolean }[])
              .filter((opt) => (!opt.machinesOnly || hasMachines) && (!opt.barOnly || !isMachinesOnlyPlan))
              .map(({ value, icon: Icon, label, desc }) => (
                <button
                  key={String(value)}
                  onClick={() => setTarget(value)}
                  className={`w-full flex items-center gap-4 rounded-2xl p-4 border text-left transition active:scale-[0.98] ${
                    target === value
                      ? "border-red-500/60 bg-red-500/10"
                      : "border-border hover:bg-muted/30"
                  }`}
                >
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
                      <span className={`mt-0.5 shrink-0 ${isKept ? "text-green-400" : "text-red-400"}`}>
                        {isKept ? "✓" : "✕"}
                      </span>
                      {isKept ? item.replace("✓ ", "") : item}
                    </li>
                  );
                })}
              </ul>
              {isChainOwner && barScope === "all" && (
                <p className="text-xs font-black text-red-400 pt-1">
                  ⚠ This will run on all {chainBars.length} bars.
                </p>
              )}
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
        </>
      )}

      {/* ── Confirm modal ── */}
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
                {isChainOwner && scopeLabel && (
                  <span>Scope: <span className="font-black text-foreground">{scopeLabel}</span> · </span>
                )}
                All <span className="font-black text-foreground">{targetLabel}</span> data will be
                permanently deleted. Type <span className="font-black text-foreground">RESET</span> to confirm.
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
              <Button
                variant="outline"
                className="flex-1 h-14 text-base font-black"
                onClick={() => { setShowConfirm(false); setConfirmText(""); }}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 h-14 text-base font-black bg-red-600 hover:bg-red-700 text-white"
                disabled={busy || confirmText !== "RESET"}
                onClick={handleReset}
              >
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : "Reset"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
