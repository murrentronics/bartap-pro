import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useChain } from "@/lib/ChainContext";
import { Wine, Gamepad2, Plus, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";

const DEMO_EMAILS = ["isabel@gmail.com"];

export default function SwitchBarPage() {
  const { profile, user } = useAuth();
  const { chainBars, activeBarId, setActiveBarId, barsLoading, isChainOwner, isMultiBarOwner } = useChain();
  const nav = useNavigate();
  const { t } = useTranslation();
  const isDemoAccount = DEMO_EMAILS.includes(user?.email ?? "");

  // Guard: only chain owners or multi-bar addon owners can access this page
  const hasLocalBars = chainBars.length > 0;
  if (!barsLoading && !isChainOwner && !isMultiBarOwner && !hasLocalBars && profile) {
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

  return (
    <div className="px-1 py-4 space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-black">
          {isMachinesOnlyOwner ? t("your_machine_accts", "Your Machine Accounts") : t("your_bars", "Your Bars")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isMachinesOnlyOwner
            ? t("select_acct_manage", "Select an account to manage.")
            : isDemoAccount
              ? t("select_bar_switch", "Select an account to manage.")
              : t("select_bar_manage", "Select a bar to manage, or add a new one.")}
        </p>
      </div>

      {/* Account count badge — shows current count */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-black px-2.5 py-1 rounded-full border border-primary/30 text-primary"
          style={{ background: "rgba(251,146,60,0.08)" }}>
          {chainBars.length} {t("account_number_lbl", "account")}{chainBars.length !== 1 ? "s" : ""}
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

      {/* Add New Account — any multi-account owner (not demo) goes to Billing to upgrade */}
      {!barsLoading && (isChainOwner || isMultiBarOwner) && !isDemoAccount && (
        <div className="pt-2">
          <Button
            onClick={() => nav("/billing")}
            className="w-full h-12 font-black text-sm gap-2"
            style={{ background: "var(--gradient-hero)" }}
          >
            <Plus className="h-4 w-4" />
            {t("add_upgrade_account", "Add New / Upgrade")}
          </Button>
          <p className="text-center text-xs text-muted-foreground mt-2">
            {t("extra_accounts_billing", "Additional accounts are added through your billing plan.")}
          </p>
        </div>
      )}

      {/* ── Delete confirm modal removed ── */}
    </div>
  );
}
