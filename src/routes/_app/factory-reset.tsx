import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AlertTriangle, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_app/factory-reset")({
  component: FactoryResetPage,
});

export default function FactoryResetPage() {
  const { profile, signOut } = useAuth();
  const nav = useNavigate();
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  if (profile?.role !== "owner") {
    return <div className="text-center text-muted-foreground py-20">Only owners can access this page.</div>;
  }

  const handleReset = async () => {
    if (!profile) return;
    setBusy(true);
    try {
      const ownerId = profile.id;

      // 1. Delete all orders for this owner
      await supabase.from("orders").delete().eq("owner_id", ownerId);

      // 2. Delete all wallet transactions for this owner
      await supabase.from("wallet_transactions").delete().eq("profile_id", ownerId);

      // 3. Delete all credit transactions + accounts
      const { data: creditAccounts } = await supabase
        .from("credit_accounts").select("id").eq("owner_id", ownerId);
      if (creditAccounts?.length) {
        const ids = creditAccounts.map((a: { id: string }) => a.id);
        await supabase.from("credit_transactions").delete().in("credit_account_id", ids);
        await supabase.from("credit_accounts").delete().eq("owner_id", ownerId);
      }

      // 4. Delete all products / items
      await supabase.from("products").delete().eq("owner_id", ownerId);

      // 5. Delete owner expenses & financials
      await supabase.from("owner_expenses").delete().eq("owner_id", ownerId);
      await (supabase as any).from("owner_financials").delete().eq("owner_id", ownerId);

      // 6. Delete all cashier profiles (children)
      const { data: cashiers } = await supabase
        .from("profiles").select("id").eq("parent_id", ownerId);
      if (cashiers?.length) {
        // Their wallet txs and orders cascade, but clean up explicitly
        for (const c of cashiers as { id: string }[]) {
          await supabase.from("wallet_transactions").delete().eq("profile_id", c.id);
          await supabase.from("orders").delete().eq("cashier_id", c.id);
        }
        await supabase.from("profiles").delete().eq("parent_id", ownerId);
      }

      // 7. Reset owner wallet balance
      await supabase.from("profiles")
        .update({ wallet_balance: 0 })
        .eq("id", ownerId);

      toast.success("Account reset to factory defaults.");
      setBusy(false);
      setShowConfirm(false);

      // Sign out so they start fresh
      await signOut();
      nav("/login");
    } catch (err: any) {
      toast.error("Reset failed: " + (err?.message ?? "unknown error"));
      setBusy(false);
    }
  };

  return (
    <div className="py-6 space-y-6 max-w-lg mx-auto">

      {/* Warning card */}
      <div className="rounded-3xl p-6 space-y-4 border border-red-500/40"
        style={{ background: "rgba(239,68,68,0.06)" }}>
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl flex items-center justify-center shrink-0 bg-red-500/15 border border-red-500/30">
            <AlertTriangle className="h-6 w-6 text-red-400" />
          </div>
          <div>
            <h1 className="text-xl font-black text-red-400">Factory Reset</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Restore account back to default</p>
          </div>
        </div>

        <p className="text-sm text-foreground leading-relaxed">
          This will permanently wipe <span className="font-black text-red-400">all your data</span> including:
        </p>

        <ul className="space-y-2 text-sm text-muted-foreground">
          {[
            "All sales orders and transaction history",
            "All cashier accounts and their records",
            "All wallet and statement records",
            "All bar items and products",
            "All credit accounts and bills",
            "All financial expenses and setup cost",
          ].map((item) => (
            <li key={item} className="flex items-start gap-2">
              <span className="text-red-400 mt-0.5 shrink-0">✕</span>
              {item}
            </li>
          ))}
        </ul>

        <p className="text-sm font-black text-red-400">
          This cannot be undone. Your account stays active but all data is gone forever.
        </p>
      </div>

      {/* Reset button */}
      <Button
        onClick={() => setShowConfirm(true)}
        className="w-full h-14 text-base font-black bg-red-600 hover:bg-red-700 text-white"
      >
        <Trash2 className="h-5 w-5 mr-2" />
        Reset Account to Factory Default
      </Button>

      {/* Confirm modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-red-500/40 shadow-2xl overflow-hidden space-y-0"
            style={{ background: "var(--gradient-card)" }}>
            <div className="px-6 pt-6 pb-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-xl flex items-center justify-center bg-red-500/15 border border-red-500/30 shrink-0">
                  <AlertTriangle className="h-5 w-5 text-red-400" />
                </div>
                <h2 className="font-black text-lg text-red-400">Confirm Reset</h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                All your data will be permanently deleted. Type <span className="font-black text-foreground">RESET</span> below to confirm.
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
