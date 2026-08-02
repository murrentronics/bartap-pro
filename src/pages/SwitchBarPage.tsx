import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useChain } from "@/lib/ChainContext";
import { supabase } from "@/integrations/supabase/client";
import { Wine, Gamepad2, Plus, CheckCircle2, Loader2, Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useTranslation } from "@/lib/i18n";

export default function SwitchBarPage() {
  const { profile } = useAuth();
  const { chainBars, activeBarId, setActiveBarId, barsLoading, isChainOwner, isMultiBarOwner, refreshBars } = useChain();
  const nav = useNavigate();
  const { t } = useTranslation();

  // Delete confirm state
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Guard: only chain owners or multi-bar addon owners can access this page
  if (!isChainOwner && !isMultiBarOwner && profile) {
    return (
      <div className="text-center text-muted-foreground py-20">
        {t("multibar_only", "This page is only available for multi-bar plan owners.")}
      </div>
    );
  }

  const isMachinesOnlyOwner = profile?.plan_type === "machines_only";

  const handleSelect = (barId: string) => {
    setActiveBarId(barId);
    nav(isMachinesOnlyOwner ? "/machines" : "/register");
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget || !profile?.id) return;
    setDeleting(true);
    try {
      const { error } = await (supabase as any).rpc("delete_bar_account", {
        p_bar_id:   deleteTarget.id,
        p_owner_id: profile.id,
      });
      if (error) throw error;
      if (activeBarId === deleteTarget.id) setActiveBarId(null);
      await refreshBars();
      toast.success(`"${deleteTarget.name}" deleted`);
      setDeleteTarget(null);
    } catch (err: any) {
      toast.error("Failed to delete bar: " + (err?.message ?? "unknown error"));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="px-1 py-4 space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-black">
          {isMachinesOnlyOwner ? t("your_machine_accts", "Your Machine Accounts") : t("your_bars", "Your Bars")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isMachinesOnlyOwner
            ? t("select_acct_manage", "Select an account to manage, or add a new one.")
            : t("select_bar_manage", "Select a bar to manage, or add a new one.")}
        </p>
      </div>

      {/* Bar count badge — shows current count only, no cap */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-black px-2.5 py-1 rounded-full border border-primary/30 text-primary"
          style={{ background: "rgba(251,146,60,0.08)" }}>
          {chainBars.length} {isMachinesOnlyOwner ? t("account_number_lbl", "account") : t("bar_number_lbl", "bar")}{chainBars.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Loading state */}
      {barsLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {/* Bar cards */}
      {!barsLoading && (
        <div className="space-y-3">
          {chainBars.length === 0 && (
            <div className="text-center py-16 space-y-3">
              <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl border border-border"
                style={{ background: "var(--gradient-card)" }}>
                {isMachinesOnlyOwner
                  ? <Gamepad2 className="h-8 w-8 text-muted-foreground" />
                  : <Wine className="h-8 w-8 text-muted-foreground" />
                }
              </div>
              <p className="text-muted-foreground text-sm font-semibold">
                {isMachinesOnlyOwner ? t("no_machine_accts", "No machine accounts yet") : t("no_bars_yet", "No bars yet")}
              </p>
              <p className="text-xs text-muted-foreground">
                {isMachinesOnlyOwner ? t("add_first_acct", "Add your first account to get started.") : t("add_first_bar", "Add your first bar to get started.")}
              </p>
            </div>
          )}

          {chainBars.map((bar, idx) => {
            const isActive = bar.id === activeBarId;
            // Bar 1 (master's own profile) cannot be deleted — it IS the master account
            const isDeletable = idx > 0;

            return (
              <div
                key={bar.id}
                className="relative w-full rounded-2xl border overflow-hidden transition active:scale-[0.98]"
                style={{
                  background: isActive ? "rgba(251,146,60,0.10)" : "var(--gradient-card)",
                  borderColor: isActive ? "var(--primary)" : "var(--border)",
                }}
              >
                {/* ── Clickable main area (everything except trash) ── */}
                <button
                  onClick={() => handleSelect(bar.id)}
                  className="w-full flex items-center gap-4 px-5 pt-5 pb-3 text-left"
                >
                  {/* Bar number badge */}
                  <div
                    className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0 font-black text-base"
                    style={{
                      background: isActive ? "var(--gradient-hero)" : "rgba(255,255,255,0.08)",
                      color: isActive ? "var(--primary-foreground)" : "var(--muted-foreground)",
                    }}
                  >
                    {idx + 1}
                  </div>

                  {/* Bar info */}
                  <div className="flex-1 min-w-0 pr-10">
                    <div className="flex items-center gap-2">
                      <span className="font-black text-base truncate">{bar.bar_name}</span>
                      {isActive && <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground truncate">{bar.bar_location}</span>
                      <span className="shrink-0">
                        {bar.is_machines_account
                          ? <span className="flex items-center gap-1 text-xs font-bold text-primary"><Gamepad2 className="h-3 w-3" />{t("machines_only_lbl", "Machines only")}</span>
                          : bar.has_machines
                            ? <span className="flex items-center gap-1 text-xs font-bold text-amber-400"><Gamepad2 className="h-3 w-3" />{t("bar_machines_lbl", "Bar + Machines")}</span>
                            : <span className="flex items-center gap-1 text-xs font-bold text-muted-foreground"><Wine className="h-3 w-3" />{t("bar_only_lbl", "Bar only")}</span>
                        }
                      </span>
                    </div>
                  </div>
                </button>

                {/* ── Delete button — top-right, outside the main click zone ── */}
                {isDeletable && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: bar.id, name: bar.bar_name }); }}
                    className="absolute top-3 right-3 h-9 w-9 rounded-xl flex items-center justify-center transition active:scale-90"
                    style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.25)" }}
                    title="Delete bar"
                  >
                    <Trash2 className="h-4 w-4 text-red-400" />
                  </button>
                )}

                {/* ── Switch / Active badge centered at bottom ── */}
                <button
                  onClick={() => handleSelect(bar.id)}
                  className="w-full flex justify-center pb-3 pt-1"
                >
                  <span
                    className="px-4 py-1 rounded-full text-xs font-black tracking-wide transition"
                    style={{
                      background: isActive ? "var(--gradient-hero)" : "rgba(255,255,255,0.07)",
                      color: isActive ? "var(--primary-foreground)" : "var(--muted-foreground)",
                      border: isActive ? "none" : "1px solid var(--border)",
                    }}
                  >
                    {isActive ? t("active_badge", "● Active") : t("switch_btn", "Switch")}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Add new bar button — chain owners only; addon owners manage via Billing */}
      {!barsLoading && isChainOwner && (
        <div className="pt-2">
          <Button
            onClick={() => nav("/create-bar")}
            className="w-full h-12 font-black text-sm gap-2"
            style={{ background: "var(--gradient-hero)" }}
          >
            <Plus className="h-4 w-4" />
            {isMachinesOnlyOwner ? t("add_new_machine_acct", "Add New Machine Account") : t("add_new_bar", "Add New Bar")}
          </Button>
        </div>
      )}

      {/* Addon owners — go to Billing to add more */}
      {!barsLoading && isMultiBarOwner && (
        <div className="pt-2">
          <Button
            onClick={() => nav("/billing")}
            className="w-full h-12 font-black text-sm gap-2"
            style={{ background: "var(--gradient-hero)" }}
          >
            <Plus className="h-4 w-4" />
            {isMachinesOnlyOwner ? t("add_more_machines_billing", "Add More Machines via Billing") : t("add_more_bars_billing", "Add More Bars via Billing")}
          </Button>
          <p className="text-center text-xs text-muted-foreground mt-2">
            {isMachinesOnlyOwner
              ? t("extra_machines_billing", "Additional machine accounts are added through your billing plan.")
              : t("extra_bars_billing", "Additional bars are added through your billing plan.")}
          </p>
        </div>
      )}

      {/* ── Delete confirm modal ── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-red-500/40 shadow-2xl overflow-hidden"
            style={{ background: "var(--gradient-card)" }}>
            <div className="px-6 pt-6 pb-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-xl flex items-center justify-center bg-red-500/15 border border-red-500/30 shrink-0">
                  <AlertTriangle className="h-5 w-5 text-red-400" />
                </div>
                <h2 className="font-black text-lg text-red-400">{t("delete_bar_title", "Delete Bar?")}</h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                <span className="font-black text-foreground">"{deleteTarget.name}"</span> {t("delete_bar_msg", "and all its data — items, orders, wallet, cashiers, credit — will be permanently deleted. This cannot be undone.")}
              </p>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <Button
                variant="outline"
                className="flex-1 h-12 font-black"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
              >
                {t("cancel", "Cancel")}
              </Button>
              <Button
                className="flex-1 h-12 font-black bg-red-600 hover:bg-red-700 text-white"
                onClick={handleDeleteConfirm}
                disabled={deleting}
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : t("delete", "Delete")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
