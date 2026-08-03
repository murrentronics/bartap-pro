/**
 * BillingPage — multi-step plan selection with light/white theme
 *
 * Steps for new signup / upgrade:
 *   1. "choose"  — two plan cards side by side
 *   2. "addons"  — setup visit + tablet add-ons (new signups only)
 *   3. "payment" — cash vs bank transfer
 *   4. "confirm" — summary + confirm button
 *
 * Active subscribers see their subscription status with separate
 * Basic and Premium renewal buttons (each with own countdown).
 */
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  CreditCard, CheckCircle, Clock, AlertCircle, Copy,
  Star, Gamepad2, ChevronRight, ArrowLeft, Check, GitBranch, Wine,
  Plus, Minus, ArrowUpCircle,
} from "lucide-react";
import type { BillingPlan, BillingPayment, AdminBankDetails } from "@/types/billing";

const SPECIAL_EMAIL = "renard.sankersingh@gmail.com";

// ── Addon pricing constants ───────────────────────────────────────────────
const PRICE_BAR_ONLY        = 1000;  // extra bar only /yr
const PRICE_MACHINES_10     = 1200;  // extra machines 10 screens /yr
const PRICE_MACHINES_20     = 1800;  // extra machines 20 screens /yr
const PRICE_BAR_MACHINES_10 = 3000;  // extra bar + 10 machines /yr
const PRICE_BAR_MACHINES_20 = 3500;  // extra bar + 20 machines /yr
const PRICE_BASE_BASIC      = 1200;  // bar only base plan
const PRICE_BASE_MACHINES   = 2400;  // machines only base plan
const PRICE_BASE_PREMIUM    = 3000;  // bar + 10 machines base plan
const PRICE_BASE_PREMIUM_20 = 3500;  // bar + 20 machines base plan

type Step = "status" | "choose" | "addons" | "addon-bars" | "addon-ask" | "payment" | "confirm";

export default function BillingPage() {
  const { profile, refreshProfile } = useAuth();

  // ── Remote data ──────────────────────────────────────────────────────────
  const [plans, setPlans]             = useState<BillingPlan[]>([]);
  const [payments, setPayments]       = useState<BillingPayment[]>([]);
  const [bankDetails, setBankDetails] = useState<AdminBankDetails | null>(null);
  const [bankEnabled, setBankEnabled] = useState(false);
  const [userEmail, setUserEmail]     = useState("");
  const [historyPage, setHistoryPage] = useState(0);
  const [historyTotal, setHistoryTotal] = useState(0);
  const HIST_SIZE = 50;

  // ── Wizard state ─────────────────────────────────────────────────────────
  const [step, setStep]               = useState<Step>("status");
  const [selectedPlan, setSelectedPlan] = useState<BillingPlan | null>(null);
  const [renewMode, setRenewMode]     = useState<"basic" | "premium" | null>(null);
  const [payMethod, setPayMethod]     = useState<"cash" | "bank" | null>(null);
  const [submitting, setSubmitting]   = useState(false);

  // ── Addon bar state ──────────────────────────────────────────────────────
  type BarEntry = { name: string; location: string; type: "bar" | "bar_machines" | "bar_machines_20" | "machines_only" | "machines_only_20" };
  const [addonBarCount, setAddonBarCount] = useState(1);
  const [addonBars, setAddonBars]         = useState<BarEntry[]>([{ name: "", location: "", type: "bar" }]);

  // ── New addon ask flow ───────────────────────────────────────────────────
  // What kind of addon the user picked before the "same bar or new?" question
  type AddonAskType = "machines_10" | "machines_20" | "bar_only" | "bar_machines_10" | "bar_machines_20" | "upgrade_same_premium" | "upgrade_same_premium_20";
  const [addonAskType, setAddonAskType]       = useState<AddonAskType | null>(null);
  // "new" = always new account; "existing" = upgrade an existing sub-account
  const [addonDestination, setAddonDestination] = useState<"new" | "existing" | null>(null);
  // Sub-accounts eligible for upgrade (machines accounts with <20 screens, or any machine acct for bar upgrade)
  type SubAccount = { id: string; username: string; address: string; plan_type: string; screen_count: number };
  const [eligibleBars, setEligibleBars]       = useState<SubAccount[]>([]);
  const [selectedBarId, setSelectedBarId]     = useState<string | null>(null);
  // The manual amount to charge (overrides plan amount when doing diff-based upgrades)
  const [overrideAmount, setOverrideAmount]   = useState<number | null>(null);

  useEffect(() => { loadAll(); }, [profile?.id]);
  useEffect(() => { if (profile?.id) loadPayments(); }, [historyPage]);

  // ── Realtime: refresh when admin approves/rejects a payment or updates the profile ──
  useEffect(() => {
    if (!profile?.id) return;
    const ch = supabase
      .channel(`billing-realtime-${profile.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "billing_payments", filter: `owner_id=eq.${profile.id}` },
        async (payload: any) => {
          await Promise.all([refreshProfile(), loadPayments()]);
          // DELETE = payment was revoked; INSERT = new payment submitted; UPDATE = approved/rejected
          if (payload.eventType === "DELETE") {
            // Revoke — let the profile update handler drive the step via billing_status
            return;
          }
          const newStatus = payload.new?.status;
          if (newStatus === "paid") {
            setStep("status"); // approved — show active dashboard
          } else if (newStatus === "pending") {
            setStep("status"); // new submission — show status with pending banner
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${profile.id}` },
        async (payload: any) => {
          await Promise.all([refreshProfile(), loadPayments()]);
          const newBillingStatus = payload.new?.billing_status;
          const newStatus        = payload.new?.status;
          if (newBillingStatus === "active" || newStatus === "approved") {
            // Admin approved — show the active dashboard
            setStep("status");
          } else if (
            newBillingStatus === "pending_setup" ||
            newStatus === "pending"
          ) {
            // Admin revoked or sent back to pending — show the choose-a-plan flow
            setStep("choose");
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  // ── Handle ?upgrade=premium|machines_only etc. from other pages ─────────
  useEffect(() => {
    if (plans.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const upgrade = params.get("upgrade");
    if (!upgrade) return;
    const plan = plans.find(p => p.plan_type === upgrade);
    if (plan) {
      setSelectedPlan(plan);
      setRenewMode(null);
      setStep("payment");
      // Clean the URL so back-nav doesn't re-trigger
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [plans]);

  const loadAll = async () => {
    const [, , , ] = await Promise.all([loadPlans(), loadPayments(), loadBankDetails(), loadFlags()]);
    const { data } = await supabase.auth.getUser();
    setUserEmail(data?.user?.email ?? "");
  };

  const loadPlans = async () => {
    const { data } = await supabase.from("billing_plans").select("*")
      .not("name", "ilike", "[Archived]%").order("amount");
    setPlans((data ?? []) as BillingPlan[]);
  };

  const loadPayments = async () => {
    if (!profile?.id) return;
    const { count } = await supabase.from("billing_payments")
      .select("*", { count: "exact", head: true }).eq("owner_id", profile.id);
    setHistoryTotal(count ?? 0);
    const { data } = await supabase.from("billing_payments").select("*")
      .eq("owner_id", profile.id).order("created_at", { ascending: false })
      .range(historyPage * HIST_SIZE, (historyPage + 1) * HIST_SIZE - 1);
    setPayments((data ?? []) as BillingPayment[]);
  };

  const loadBankDetails = async () => {
    const { data } = await supabase.from("admin_bank_details").select("*")
      .eq("is_active", true).single();
    if (data) setBankDetails(data as AdminBankDetails);
  };

  const loadFlags = async () => {
    const { data } = await supabase.from("feature_flags").select("enabled")
      .eq("flag_name", "bank_transfer_enabled").single();
    if (data) setBankEnabled(data.enabled);
  };

  // Load sub-accounts eligible for a given upgrade
  // type "machines_upgrade" = machine accounts with 10 screens (can go to 20)
  // type "bar_upgrade" = machine accounts (can have bar added)
  const loadEligibleBars = async (upgradeType: "machines_upgrade" | "bar_upgrade") => {
    if (!profile?.id) return;
    const { data } = await (supabase as any)
      .from("profiles")
      .select("id, username, address, plan_type")
      .eq("parent_id", profile.id)
      .eq("is_machines_account", true);
    const subs: SubAccount[] = (data ?? []).map((d: any) => ({
      id: d.id,
      username: d.username,
      address: d.address ?? "",
      plan_type: d.plan_type,
      screen_count: (d.plan_type as string) === "machines_only_20" ? 20 : 10,
    }));
    if (upgradeType === "machines_upgrade") {
      // Only show accounts with 10 screens (can accept +10 to reach max 20)
      setEligibleBars(subs.filter(s => s.screen_count < 20));
    } else {
      // bar_upgrade: all machine accounts (adding bar to them)
      setEligibleBars(subs);
    }
  };

  const copy = (t: string) => { navigator.clipboard.writeText(t); toast.success("Copied"); };

  const reset = () => {
    setStep("status"); setSelectedPlan(null); setRenewMode(null);
    setPayMethod(null);
    setAddonBarCount(1); setAddonBars([{ name: "", location: "", type: "bar" }]);
    setAddonAskType(null); setAddonDestination(null);
    setEligibleBars([]); setSelectedBarId(null); setOverrideAmount(null);
  };

  const cancelPending = async () => {
    if (!pendingPayment) return;
    setSubmitting(true);
    await supabase.from("billing_payments").delete()
      .eq("id", pendingPayment.id).eq("status", "pending");
    setSubmitting(false);
    toast.success("Payment cancelled");
    reset(); loadPayments();
  };

  const submitPayment = async () => {
    if (!profile?.id || !selectedPlan || !payMethod) return;
    setSubmitting(true);
    const { data: ref, error: refErr } = await supabase.rpc("generate_payment_reference");
    if (refErr) { toast.error("Failed to generate reference"); setSubmitting(false); return; }

    const isRenewal = !!renewMode;
    const isFirst   = !isRenewal && payments.filter(p => p.status === "paid").length === 0;

    // For addon plans, amount = pro-rated unit price × number of bars
    // Also treat upgrade flows as "addon" for amount calculation
    const isUpgradeSame = addonAskType === "upgrade_same_premium" || addonAskType === "upgrade_same_premium_20";
    const isAddonPlan = isUpgradeSame || ["bar_only_addon", "machines_bar_addon", "machines_bar_addon_20", "premium_addon", "premium_addon_20"].includes(selectedPlan.plan_type ?? "");
    const amount = isAddonPlan
      ? totalDue   // already pro-rated in derived state above
      : selectedPlan.amount;

    const notesParts: string[] = [];
    if (isUpgradeSame) {
      const targetPlan = addonAskType === "upgrade_same_premium_20" ? "premium_20" : "premium";
      notesParts.push(
        `Same-account upgrade → ${targetPlan}` +
        (planEndDate && daysRemaining < 365
          ? ` (prorated $${proRataUnitPrice} TT, ${daysRemaining}d remaining, full diff $${overrideAmount} TT/yr)`
          : ` — $${overrideAmount} TT`)
      );
    } else if (isAddonPlan) {
      const baseNote = addonAskType
        ? `type: ${addonAskType}`
        : `${addonBarCount} extra bar${addonBarCount > 1 ? "s" : ""}`;
      if (planEndDate && daysRemaining < 365) {
        notesParts.push(
          `${baseNote} @ $${proRataUnitPrice} TT each ` +
          `(pro-rated: ${daysRemaining}d remaining of 365d, full price $${overrideAmount ?? selectedPlan.amount} TT/yr)`
        );
      } else {
        notesParts.push(`${baseNote} @ $${overrideAmount ?? selectedPlan.amount} TT each`);
      }
    }
    // If upgrading an existing machine account (add 10 screens or add bar)
    if (selectedBarId) {
      notesParts.push(`target_account_id: ${selectedBarId}`);
    }
    if (addonDestination) {
      notesParts.push(`destination: ${addonDestination}`);
    }

    let dueDate = new Date();
    if (isRenewal) {
      const base = renewMode === "premium"
        ? profile.premium_subscription_end_date
        : profile.subscription_end_date;
      if (base) dueDate = new Date(base);
    }
    dueDate.setMonth(dueDate.getMonth() + selectedPlan.duration_months);

    const insertData: Record<string, unknown> = {
      owner_id: profile.id, plan_id: selectedPlan.id,
      reference_number: ref, amount,
      due_date: dueDate.toISOString(), status: "pending",
      payment_method: payMethod,
      notes: notesParts.join(" • ") || null,
    };

    // Attach bar names/locations for addon plans so admin approval can auto-create them
    if (isAddonPlan && !isUpgradeSame && addonBars.length > 0) {
      insertData.addon_bar_count = addonBarCount;
      insertData.addon_bar_data  = addonBars.slice(0, addonBarCount);
    }

    const { error } = await supabase.from("billing_payments").insert(insertData as any);
    setSubmitting(false);
    if (error) { toast.error("Failed to submit payment"); return; }
    toast.success("Payment submitted — awaiting admin confirmation");
    reset(); loadPayments();
  };


  // ── Derived ──────────────────────────────────────────────────────────────
  const pendingPayment  = payments.find(p => p.status === "pending");
  const hasActive       = profile?.billing_status === "active" ||
    ((profile?.plan_type === "machines_only" || (profile?.plan_type as string) === "machines_only_20") && !!profile?.machines_addon_active);
  const isSpecial       = userEmail === SPECIAL_EMAIL;
  const isBasic         = profile?.plan_type === "basic";
  const isPremium       = profile?.plan_type === "premium" || (profile?.plan_type as string) === "premium_20";
  const isChain         = false; // chain plan retired — premium handles multi-bar
  const isMachinesOnly  = profile?.plan_type === "machines_only" || (profile?.plan_type as string) === "machines_only_20";

  const basicPlan             = plans.find(p => p.plan_type === "basic");
  const premiumPlan           = plans.find(p => p.plan_type === "premium");
  const premiumPlan20         = plans.find(p => p.plan_type === "premium_20");
  const machinesOnlyPlan      = plans.find(p => p.plan_type === "machines_only");
  const machinesOnlyPlan20    = plans.find(p => p.plan_type === "machines_only_20");
  // Multi-bar / multi-account addon plans
  const barOnlyAddonPlan         = plans.find(p => p.plan_type === "bar_only_addon");
  const machinesBarAddonPlan     = plans.find(p => p.plan_type === "machines_bar_addon");
  const machinesBarAddonPlan20   = plans.find(p => p.plan_type === "machines_bar_addon_20");
  const premiumAddonPlan         = plans.find(p => p.plan_type === "premium_addon");
  const premiumAddonPlan20       = plans.find(p => p.plan_type === "premium_addon_20");

  // Detect 20-screen variant for current machines-only owner
  const isMachinesOnly20 = (profile?.plan_type as string) === "machines_only_20";

  // Total machine screens across all accounts
  const baseScreens = (isPremium || (profile?.plan_type as string) === "premium_20")
    ? ((profile?.plan_type as string) === "premium_20" ? 20 : 10)
    : isMachinesOnly ? (isMachinesOnly20 ? 20 : 10)
    : 0;
  const addonScreensPerAccount = isMachinesOnly
    ? (machinesBarAddonPlan20 && profile?.addon_bar_count ? 20 : 10)
    : 10;
  const totalMachineScreens = baseScreens + (profile?.addon_bar_count ?? 0) * addonScreensPerAccount;

  // Current bar count for capacity checks
  const currentBarCount = (profile?.addon_bar_count ?? 0) + 1;

  const basicEnd      = profile?.subscription_end_date ? new Date(profile.subscription_end_date) : null;
  const basicDaysLeft = basicEnd ? Math.ceil((basicEnd.getTime() - Date.now()) / 86400000) : null;
  const basicOverdue  = basicEnd ? basicEnd < new Date() : false;
  const basicCanRenew = basicOverdue || (basicDaysLeft !== null && basicDaysLeft <= 7);

  const premEnd       = profile?.premium_subscription_end_date ? new Date(profile.premium_subscription_end_date) : null;
  const premDaysLeft  = premEnd ? Math.ceil((premEnd.getTime() - Date.now()) / 86400000) : null;
  const premOverdue   = premEnd ? premEnd < new Date() : false;
  const premCanRenew  = premOverdue || (premDaysLeft !== null && premDaysLeft <= 7);

  const addonEnd      = profile?.machines_addon_end_date ? new Date(profile.machines_addon_end_date) : null;
  const addonDaysLeft = addonEnd ? Math.ceil((addonEnd.getTime() - Date.now()) / 86400000) : null;
  const addonOverdue  = addonEnd ? addonEnd < new Date() : false;
  const addonCanRenew = addonOverdue || (addonDaysLeft !== null && addonDaysLeft <= 7);

  // Chain plan retired — premium is now the multi-bar plan
  // keeping these as null so nothing breaks if old chain profile rows exist
  const chainEnd      = null;
  const chainDaysLeft = null;
  const chainOverdue  = false;
  const chainCanRenew = false;

  const isNewSignup    = !pendingPayment && profile?.status === "pending" && profile?.billing_status !== "expired";
  const isExpiredRenew = !pendingPayment && profile?.status === "pending" && profile?.billing_status === "expired";

  const isAddonPlanSelected = !!(addonAskType) || ["bar_only_addon", "machines_bar_addon", "machines_bar_addon_20", "premium_addon", "premium_addon_20"].includes(selectedPlan?.plan_type ?? "");

  // ── Total renewal amount (base plan + all active addons at full annual price) ──
  // Pro-rata only applies at the time of purchasing a new addon — never at renewal.
  const addonBarQty = profile?.addon_bar_count ?? 0;

  const basePlanPrice = isBasic        ? (basicPlan?.amount       ?? 1200)
                      : isPremium      ? (premiumPlan?.amount      ?? 3000)
                      : isMachinesOnly ? (machinesOnlyPlan?.amount ?? 2400)
                      : 0;

  // Bar Only extra bars renew at $800 each; Premium addon at $2,000 each; Machines addon at $1,200 each
  const perBarFullPrice = isBasic        ? (barOnlyAddonPlan?.amount    ?? 800)
                        : isPremium      ? (premiumAddonPlan?.amount     ?? 2000)
                        : isMachinesOnly ? (machinesBarAddonPlan?.amount ?? 1200)
                        : 0;
  const extraBarPrice = addonBarQty * perBarFullPrice;

  const totalRenewalAmount = basePlanPrice + extraBarPrice;

  // Breakdown shown only when addon bars exist
  const renewalBreakdown = (() => {
    if (addonBarQty === 0) return "";
    return `$${basePlanPrice.toLocaleString()} plan + ${addonBarQty}×$${perBarFullPrice.toLocaleString()} extra bar${addonBarQty > 1 ? "s" : ""}`;
  })();



  // ── Pro-rata calculation for addon plans ────────────────────────────────
  // Addons must align to the owner's existing plan expiry so that at renewal
  // time everything is paid together in one bulk payment. We charge only for
  // the fraction of the year remaining on the current plan.
  const planEndDate: Date | null = (() => {
    if (!isAddonPlanSelected) return null;
    if ((profile?.plan_type === "premium" || (profile?.plan_type as string) === "premium_20") && profile?.premium_subscription_end_date)
      return new Date(profile.premium_subscription_end_date);
    if (profile?.plan_type === "machines_only" && profile?.machines_addon_end_date)
      return new Date(profile.machines_addon_end_date);
    if (profile?.subscription_end_date)
      return new Date(profile.subscription_end_date);
    // machines_only uses machines_addon_end_date — also check it as fallback
    if ((profile as any)?.machines_addon_end_date)
      return new Date((profile as any).machines_addon_end_date);
    return null;
  })();

  // days remaining on the plan (capped between 0 and 365)
  const daysRemaining: number = planEndDate
    ? Math.min(365, Math.max(0, Math.ceil((planEndDate.getTime() - Date.now()) / 86400000)))
    : 365;

  // pro-rata fraction: days_remaining / 365
  const proRataFraction: number = planEndDate ? daysRemaining / 365 : 1;

  // unit price after pro-rating — use overrideAmount (diff-based upgrades) when set
  const baseAmount: number = overrideAmount ?? (selectedPlan?.amount ?? 0);
  const proRataUnitPrice: number = isAddonPlanSelected
    ? Math.round(baseAmount * proRataFraction)
    : baseAmount;

  const totalDue: number = isAddonPlanSelected
    ? proRataUnitPrice * addonBarCount
    : selectedPlan?.amount ?? 0;

  const histPages   = Math.max(1, Math.ceil(historyTotal / HIST_SIZE));


  // ── Demo account — permanent free access, no billing ─────────────────────
  const DEMO_EMAILS = ["isabel@gmail.com"];
  const MASTER_EMAILS = ["renard.sankersingh@gmail.com"];
  if (DEMO_EMAILS.includes(userEmail)) {
    return (
      <div className="pb-24 max-w-2xl mx-auto">
      <div className="-mx-3 px-3 pt-2 pb-2 bg-background border-b border-border mb-6">
          <div className="flex items-center gap-3">
            <CreditCard className="h-5 w-5 text-orange-700" />
            <h1 className="text-lg font-black">Billing</h1>
          </div>
        </div>
        <div className="rounded-2xl border border-emerald-500/30 p-6 text-center space-y-3" style={{ background: "linear-gradient(135deg, rgba(16,185,129,0.12), rgba(16,185,129,0.04))" }}>
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 border border-emerald-500/40 mx-auto">
            <CheckCircle className="h-8 w-8 text-emerald-400" />
          </div>
          <h2 className="text-xl font-black text-emerald-400">Free Demo Account</h2>
          <p className="text-sm text-muted-foreground">This is a permanent demo account with full access. No billing or payments required.</p>
        </div>
      </div>
    );
  }
  if (MASTER_EMAILS.includes(userEmail)) {
    return (
      <div className="pb-24 max-w-2xl mx-auto">
      <div className="-mx-3 px-3 pt-2 pb-2 bg-background border-b border-border mb-6">
          <div className="flex items-center gap-3">
            <CreditCard className="h-5 w-5 text-orange-700" />
            <h1 className="text-lg font-black">Billing</h1>
          </div>
        </div>
        <div className="rounded-2xl border border-amber-500/30 p-6 text-center space-y-3" style={{ background: "linear-gradient(135deg, rgba(251,146,60,0.12), rgba(251,146,60,0.04))" }}>
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/20 border border-amber-500/40 mx-auto">
            <CheckCircle className="h-8 w-8 text-amber-400" />
          </div>
          <h2 className="text-xl font-black text-amber-400">Master Account with Free Access</h2>
          <p className="text-sm text-muted-foreground">This account has permanent free access. No billing or payments required.</p>
        </div>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="pb-24 max-w-2xl mx-auto">

      {/* Header */}
      <div className="-mx-3 px-3 pt-2 pb-2 bg-background border-b border-border mb-6">
        <div className="flex items-center gap-3">
          {step !== "status" && (
            <button onClick={reset} className="h-8 w-8 rounded-full flex items-center justify-center bg-muted active:scale-90 transition">
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <CreditCard className="h-5 w-5 text-orange-700" />
          <h1 className="text-lg font-black">
            {step === "status"  ? "Billing"
            : step === "choose"  ? "Choose Your Plan"
            : step === "addons"  ? "Add-ons"
            : step === "payment" ? "Payment Method"
            : "Confirm Payment"}
          </h1>
        </div>

        {/* Step dots for wizard */}
        {step !== "status" && (
          <div className="flex items-center gap-1.5 mt-2 ml-10">
            {(["choose","addons","addon-bars","payment","confirm"] as Step[])
              .filter(s => {
                const isAddonFlow = ["bar_only_addon","machines_bar_addon","machines_bar_addon_20","premium_addon","premium_addon_20"].includes(selectedPlan?.plan_type ?? "");
                if (selectedPlan?.plan_type === "machines_addon" || renewMode) {
                  return s !== "addons" && s !== "choose" && s !== "addon-bars";
                }
                if (isAddonFlow) {
                  return s !== "addons" && s !== "choose";
                }
                return s !== "addon-bars";
              })
              .map((s, i, arr) => (
              <div key={s} className="flex items-center gap-1.5">
                <div className={`h-2 w-2 rounded-full transition-all ${
                  s === step ? "w-6 bg-orange-500" : 
                  arr.indexOf(s) < arr.indexOf(step) ? "bg-orange-300" : "bg-gray-300"
                }`} />
              </div>
            ))}
          </div>
        )}
      </div>


      {/* ═══════════════════════════════════════════════════════════════════
          STEP: STATUS — active subscriber dashboard
          ═══════════════════════════════════════════════════════════════════ */}
      {step === "status" && (
        <div className="space-y-4">

          {/* Pending payment banner */}
          {pendingPayment && (
            <div className="rounded-2xl border border-yellow-400/50 bg-yellow-50 p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-yellow-600 shrink-0" />
                <div>
                  <p className="font-black text-yellow-800">Payment Pending</p>
                  <p className="text-xs text-yellow-700 mt-0.5">
                    {plans.find(p => p.id === pendingPayment.plan_id)?.name ?? "Plan"} — ${pendingPayment.amount.toFixed(0)} TT
                  </p>
                </div>
              </div>
              <div className="bg-white rounded-xl p-3 flex items-center justify-between gap-3 border border-yellow-200">
                <div>
                  <p className="text-xs text-gray-500">Reference number</p>
                  <p className="font-black font-mono text-base text-gray-900">{pendingPayment.reference_number}</p>
                </div>
                <button onClick={() => copy(pendingPayment.reference_number)}
                  className="h-9 w-9 rounded-xl bg-orange-100 flex items-center justify-center active:scale-90 transition">
                  <Copy className="h-4 w-4 text-orange-700" />
                </button>
              </div>
              {pendingPayment.payment_method === "bank" && bankDetails && (
                <div className="bg-white rounded-xl p-3 border border-yellow-200 text-xs space-y-1">
                  {[["Bank", bankDetails.bank_name],["Account", bankDetails.account_name],["Number", bankDetails.account_number]].map(([l,v]) => (
                    <div key={l} className="flex justify-between">
                      <span className="text-gray-500">{l}</span>
                      <span className="font-bold text-gray-800">{v}</span>
                    </div>
                  ))}
                </div>
              )}
              <button onClick={cancelPending} disabled={submitting}
                className="w-full h-10 rounded-xl text-sm font-bold text-red-600 bg-red-50 border border-red-200 active:scale-[0.98] transition disabled:opacity-50">
                Cancel Payment
              </button>
            </div>
          )}

          {/* Active subscription cards */}
          {hasActive && (
            <div className="space-y-3">

              {/* Bar Only, Premium + their add-on cards */}
              {!isMachinesOnly && (
                <>
                  {/* Basic Plan card — only shown to basic plan owners */}
                  {isBasic && (
                  <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center">
                          <CreditCard className="h-4 w-4 text-blue-600" />
                        </div>
                        <div>
                          <p className="font-black text-gray-900 text-sm">Bar Only</p>
                          <p className="text-xs text-gray-500">${totalRenewalAmount.toLocaleString()} TT / year</p>
                        </div>
                      </div>
                      <span className={`text-xs font-black px-2.5 py-1 rounded-full ${basicOverdue ? "bg-red-100 text-red-600" : "bg-green-100 text-green-600"}`}>
                        {basicOverdue ? "OVERDUE" : "ACTIVE"}
                      </span>
                    </div>
                    {renewalBreakdown && (
                      <p className="text-xs text-gray-400">{renewalBreakdown}</p>
                    )}
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Renews</span>
                      <span className={`font-bold ${basicOverdue ? "text-red-500" : basicDaysLeft !== null && basicDaysLeft <= 30 ? "text-orange-700" : "text-gray-800"}`}>
                        {basicEnd ? basicEnd.toLocaleDateString("en-GB") : "—"}
                        {basicDaysLeft !== null && !basicOverdue && basicDaysLeft <= 30 && ` (${basicDaysLeft}d)`}
                      </span>
                    </div>
                    {!pendingPayment && !isSpecial && (
                      basicCanRenew ? (
                        <button onClick={() => { setSelectedPlan(basicPlan!); setRenewMode("basic"); setStep("payment"); }}
                          className={`w-full h-11 rounded-xl font-black text-sm active:scale-[0.98] transition ${basicOverdue ? "bg-red-500 text-white" : "bg-blue-600 text-white"}`}>
                          {basicOverdue ? "⚠️ Renew Now — $" + totalRenewalAmount.toLocaleString() + " TT" : "Renew Bar Only — $" + totalRenewalAmount.toLocaleString() + " TT"}
                        </button>
                      ) : (
                        <p className="text-xs text-center text-gray-400">Renewal opens {basicDaysLeft !== null ? basicDaysLeft - 7 : 0} days before due date</p>
                      )
                    )}
                  </div>
                  )} {/* end isBasic */}

                  {/* Premium plan card */}
                  {isPremium && !isSpecial && (
                    <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-5 shadow-sm">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-lg bg-amber-100 flex items-center justify-center">
                            <Star className="h-4 w-4 text-amber-800" />
                          </div>
                          <div>
                            <p className="font-black text-gray-900 text-sm">Bar with Machines</p>
                            <p className="text-xs text-gray-500">${totalRenewalAmount.toLocaleString()} TT / year</p>
                          </div>
                        </div>
                        <span className={`text-xs font-black px-2.5 py-1 rounded-full ${premOverdue ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-800"}`}>
                          {premOverdue ? "OVERDUE" : "ACTIVE"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-amber-800 mb-1">
                        <Gamepad2 className="h-3 w-3" /> Machines Tracker included · <span className="font-black">{totalMachineScreens} screen{totalMachineScreens !== 1 ? "s" : ""}</span>
                      </div>
                      {renewalBreakdown && (
                        <p className="text-xs text-amber-700/70 mb-3">{renewalBreakdown}</p>
                      )}
                      {!renewalBreakdown && <div className="mb-3" />}
                      <div className="flex items-center justify-between text-sm mb-3">
                        <span className="text-gray-500">Renews</span>
                        <span className={`font-bold ${premOverdue ? "text-red-500" : premDaysLeft !== null && premDaysLeft <= 30 ? "text-orange-700" : "text-gray-800"}`}>
                          {premEnd ? premEnd.toLocaleDateString("en-GB") : "—"}
                          {premDaysLeft !== null && !premOverdue && premDaysLeft <= 30 && ` (${premDaysLeft}d)`}
                        </span>
                      </div>
                      {!pendingPayment && (
                        premCanRenew ? (
                          <button onClick={() => { setSelectedPlan(premiumPlan!); setRenewMode("premium"); setStep("payment"); }}
                            className={`w-full h-11 rounded-xl font-black text-sm active:scale-[0.98] transition ${premOverdue ? "bg-red-500 text-white" : "bg-amber-500 text-white"}`}>
                            {premOverdue ? "⚠️ Renew Now — $" + totalRenewalAmount.toLocaleString() + " TT" : "Renew Bar with Machines — $" + totalRenewalAmount.toLocaleString() + " TT"}
                          </button>
                        ) : (
                          <p className="text-xs text-center text-amber-800/60">Renewal opens {premDaysLeft !== null ? premDaysLeft - 7 : 0} days before due date</p>
                        )
                      )}
                    </div>
                  )}


                </>
              )} {/* end !isMachinesOnly */}

              {/* ── Addon + upgrade cards shown when no pending payment ── */}
              {!pendingPayment && (
                <>
              {isMachinesOnly && (
                <>
                  {/* Machines Only plan status card */}
                  <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-lg bg-orange-100 flex items-center justify-center">
                          <Gamepad2 className="h-4 w-4 text-orange-700" />
                        </div>
                        <div>
                          <p className="font-black text-gray-900 text-sm">Machines Only Plan</p>
                          <p className="text-xs text-gray-500">${totalRenewalAmount.toLocaleString()} TT / year</p>
                          <div className="flex items-center gap-1 text-xs text-orange-700 mt-0.5">
                            <Gamepad2 className="h-3 w-3" /> <span className="font-black">{totalMachineScreens} screen{totalMachineScreens !== 1 ? "s" : ""}</span>
                            {(profile?.addon_bar_count ?? 0) > 0 && <span className="text-gray-400">across {currentBarCount} accounts</span>}
                          </div>
                        </div>
                      </div>
                      <span className={`text-xs font-black px-2.5 py-1 rounded-full ${addonOverdue ? "bg-red-100 text-red-600" : "bg-green-100 text-green-600"}`}>
                        {addonOverdue ? "OVERDUE" : "ACTIVE"}
                      </span>
                    </div>
                    {renewalBreakdown && (
                      <p className="text-xs text-gray-400 mb-2">{renewalBreakdown}</p>
                    )}
                    <div className="flex items-center justify-between text-sm mb-3">
                      <span className="text-gray-500">Renews</span>
                      <span className={`font-bold ${addonOverdue ? "text-red-500" : addonDaysLeft !== null && addonDaysLeft <= 30 ? "text-orange-700" : "text-gray-800"}`}>
                        {addonEnd ? addonEnd.toLocaleDateString("en-GB") : "—"}
                        {addonDaysLeft !== null && !addonOverdue && addonDaysLeft <= 30 && ` (${addonDaysLeft}d)`}
                      </span>
                    </div>
                    {!pendingPayment && (
                      addonCanRenew ? (
                        <button onClick={() => { setSelectedPlan(isMachinesOnly20 ? (machinesOnlyPlan20 ?? machinesOnlyPlan ?? null) : (machinesOnlyPlan ?? null)); setRenewMode(null); setStep("payment"); }}
                          disabled={!machinesOnlyPlan}
                          className={`w-full h-11 rounded-xl font-black text-sm active:scale-[0.98] transition text-white disabled:opacity-50 ${addonOverdue ? "bg-red-500" : ""}`}
                          style={!addonOverdue ? { background: "linear-gradient(135deg,#ea580c,#f59e0b)" } : {}}>
                          {addonOverdue ? "⚠️ Renew Now — $" + totalRenewalAmount.toLocaleString() + " TT" : "Renew Machines Only — $" + totalRenewalAmount.toLocaleString() + " TT"}
                        </button>
                      ) : (
                        <p className="text-xs text-center text-gray-400">Renewal opens {addonDaysLeft !== null ? addonDaysLeft - 7 : 0} days before due date</p>
                      )
                    )}
                  </div>

                </>
              )} {/* end isMachinesOnly */}
                </>
              )} {/* end !pendingPayment (machines only section) */}

              {/* ── Addon + upgrade cards shown when no pending payment ── */}
              {!pendingPayment && (
                <>
                  {/* ── Add More Bars (Bar Only owners) ── */}
                  {isBasic && barOnlyAddonPlan && (
                    <div className="rounded-2xl border-2 border-blue-200 bg-white p-5 shadow-sm">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                          <Plus className="h-4 w-4 text-blue-600" />
                        </div>
                        <div>
                          <p className="font-black text-gray-900 text-sm">Add More Bars</p>
                          <p className="text-xs text-gray-500">${barOnlyAddonPlan.amount.toFixed(0)} TT per extra bar / year</p>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 mb-3">
                        You have {currentBarCount} bar{currentBarCount !== 1 ? "s" : ""}. Each extra bar gets its own wallet, cashiers and items. Your plan upgrades to Chain so all bars are kept separate and visible in Switch Account.
                      </p>
                      <button
                        onClick={() => {
                          setSelectedPlan(barOnlyAddonPlan);
                          setAddonBarCount(1);
                          setAddonBars([{ name: "", location: "", type: "bar" }]);
                          setStep("addon-bars");
                        }}
                        className="w-full h-11 rounded-xl font-black text-sm text-white bg-blue-600 active:scale-[0.98] transition"
                      >
                        Add Extra Bar — ${barOnlyAddonPlan.amount.toFixed(0)} TT/yr each
                      </button>
                    </div>
                  )}

                  {/* ── Add More Machine Accounts (Machines Only owners) ── */}
                  {isMachinesOnly && (
                    <div className="rounded-2xl border-2 border-orange-200 bg-white p-5 shadow-sm">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="h-8 w-8 rounded-lg bg-orange-100 flex items-center justify-center shrink-0">
                          <Plus className="h-4 w-4 text-orange-700" />
                        </div>
                        <div>
                          <p className="font-black text-gray-900 text-sm">Add More Machine Accounts</p>
                          <p className="text-xs text-gray-500">10 screens ${PRICE_MACHINES_10} · 20 screens ${PRICE_MACHINES_20} TT/yr · prorated to your renewal date</p>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 mb-3">
                        You have {currentBarCount} account{currentBarCount !== 1 ? "s" : ""}. Max 20 screens per bar (Trinidad law). Each extra account is prorated to your renewal date.
                      </p>
                      <div className="flex gap-2">
                        {/* +10 Screens — ask same bar or new bar */}
                        <button
                          onClick={() => {
                            setAddonAskType("machines_10");
                            setAddonDestination(null);
                            setSelectedBarId(null);
                            setOverrideAmount(PRICE_MACHINES_10);
                            // find a fake plan to hold plan_type — use machinesBarAddonPlan or fallback
                            setSelectedPlan(machinesBarAddonPlan ?? null);
                            setAddonBarCount(1);
                            setAddonBars([{ name: "", location: "", type: "machines_only" }]);
                            setStep("addon-ask");
                          }}
                          className="flex-1 h-11 rounded-xl font-black text-xs text-white active:scale-[0.98] transition"
                          style={{ background: "linear-gradient(135deg,#ea580c,#f59e0b)" }}
                        >
                          + 10 Screens<br />${PRICE_MACHINES_10} TT/yr
                        </button>
                        {/* +20 Screens — always new account (max 20 per bar) */}
                        <button
                          onClick={() => {
                            setAddonAskType("machines_20");
                            setAddonDestination("new");
                            setOverrideAmount(PRICE_MACHINES_20);
                            setSelectedPlan(machinesBarAddonPlan20 ?? machinesBarAddonPlan ?? null);
                            setAddonBarCount(1);
                            setAddonBars([{ name: "", location: "", type: "machines_only_20" }]);
                            setStep("addon-bars");
                          }}
                          className="flex-1 h-11 rounded-xl font-black text-xs text-white active:scale-[0.98] transition"
                          style={{ background: "linear-gradient(135deg,#c2410c,#ea580c)" }}
                        >
                          + 20 Screens<br />${PRICE_MACHINES_20} TT/yr
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ── Add More Accounts (Premium / premium_20 owners) ── */}
                  {isPremium && (
                    <div className="rounded-2xl border-2 border-amber-200 bg-white p-5 shadow-sm">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="h-8 w-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                          <Plus className="h-4 w-4 text-amber-700" />
                        </div>
                        <div>
                          <p className="font-black text-gray-900 text-sm">Add Another Account</p>
                          <p className="text-xs text-gray-500">All prorated to your renewal date</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => {
                            setAddonAskType("bar_only");
                            setAddonDestination("new");
                            setOverrideAmount(PRICE_BAR_ONLY);
                            setSelectedPlan(barOnlyAddonPlan ?? null);
                            setAddonBarCount(1);
                            setAddonBars([{ name: "", location: "", type: "bar" }]);
                            setStep("addon-bars");
                          }}
                          className="h-12 rounded-xl font-black text-xs text-white active:scale-[0.98] transition bg-blue-600"
                        >
                          Bar Only<br />${PRICE_BAR_ONLY} TT/yr
                        </button>
                        <button
                          onClick={() => {
                            setAddonAskType("machines_10");
                            setAddonDestination(null);
                            setOverrideAmount(PRICE_MACHINES_10);
                            setSelectedPlan(machinesBarAddonPlan ?? null);
                            setAddonBarCount(1);
                            setAddonBars([{ name: "", location: "", type: "machines_only" }]);
                            setStep("addon-ask");
                          }}
                          className="h-12 rounded-xl font-black text-xs text-white active:scale-[0.98] transition"
                          style={{ background: "linear-gradient(135deg,#ea580c,#f59e0b)" }}
                        >
                          Machines 10<br />${PRICE_MACHINES_10} TT/yr
                        </button>
                        <button
                          onClick={() => {
                            setAddonAskType("machines_20");
                            setAddonDestination(null);
                            setOverrideAmount(PRICE_MACHINES_20);
                            setSelectedPlan(machinesBarAddonPlan20 ?? machinesBarAddonPlan ?? null);
                            setAddonBarCount(1);
                            setAddonBars([{ name: "", location: "", type: "machines_only_20" }]);
                            setStep("addon-ask");
                          }}
                          className="h-12 rounded-xl font-black text-xs text-white active:scale-[0.98] transition"
                          style={{ background: "linear-gradient(135deg,#c2410c,#ea580c)" }}
                        >
                          Machines 20<br />${PRICE_MACHINES_20} TT/yr
                        </button>
                        <button
                          onClick={() => {
                            setAddonAskType("bar_machines_10");
                            setAddonDestination(null);
                            setOverrideAmount(PRICE_BAR_MACHINES_10);
                            setSelectedPlan(premiumAddonPlan ?? premiumPlan ?? null);
                            setAddonBarCount(1);
                            setAddonBars([{ name: "", location: "", type: "bar_machines" }]);
                            setStep("addon-ask");
                          }}
                          className="h-12 rounded-xl font-black text-xs text-white active:scale-[0.98] transition"
                          style={{ background: "linear-gradient(135deg,#f59e0b,#ea580c)" }}
                        >
                          Bar+10 Machines<br />${PRICE_BAR_MACHINES_10} TT/yr
                        </button>
                        <button
                          onClick={() => {
                            setAddonAskType("bar_machines_20");
                            setAddonDestination(null);
                            setOverrideAmount(PRICE_BAR_MACHINES_20);
                            setSelectedPlan(premiumAddonPlan20 ?? premiumPlan ?? null);
                            setAddonBarCount(1);
                            setAddonBars([{ name: "", location: "", type: "bar_machines_20" }]);
                            setStep("addon-ask");
                          }}
                          className="h-12 rounded-xl font-black text-xs text-white active:scale-[0.98] transition col-span-2"
                          style={{ background: "linear-gradient(135deg,#ea580c,#dc2626)" }}
                        >
                          Bar + 20 Machines<br />${PRICE_BAR_MACHINES_20} TT/yr
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ── Upgrade to Bar with Machines (Basic or Machines Only owners) ── */}
                  {(isBasic || isMachinesOnly) && !isSpecial && (
                    <div className="rounded-2xl border-2 border-amber-300 bg-white p-5 shadow-sm overflow-hidden relative">
                      <div className="absolute top-3 right-3 bg-amber-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                        Upgrade
                      </div>
                      <div className="flex items-center gap-2 mb-2">
                        <div className="h-8 w-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                          <ArrowUpCircle className="h-4 w-4 text-amber-700" />
                        </div>
                        <div>
                          <p className="font-black text-gray-900 text-sm">Upgrade to Bar with Machines</p>
                          <p className="text-xs text-gray-500">Add bar to your account — prorated to renewal</p>
                        </div>
                      </div>
                      <ul className="space-y-1 mb-4">
                        {["Full Bar POS + Machines tracker", "Per-screen profit reports", "Float sessions & PDF export"].map(f => (
                          <li key={f} className="flex items-center gap-2 text-xs text-gray-600">
                            <CheckCircle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                            {f}
                          </li>
                        ))}
                      </ul>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            const diff = isMachinesOnly ? 600 : PRICE_BASE_PREMIUM - PRICE_BASE_BASIC;
                            setOverrideAmount(diff);
                            setAddonAskType("upgrade_same_premium");
                            setSelectedPlan(premiumPlan ?? null);
                            setAddonDestination("existing");
                            setStep("payment");
                          }}
                          className="flex-1 h-11 rounded-xl font-black text-sm text-white active:scale-[0.98] transition"
                          style={{ background: "linear-gradient(135deg,#f59e0b,#ea580c)" }}
                        >
                          Bar + 10 Machines<br /><span className="text-xs font-normal">${isMachinesOnly ? 600 : PRICE_BASE_PREMIUM - PRICE_BASE_BASIC} TT prorated</span>
                        </button>
                        {premiumPlan20 && (
                          <button
                            onClick={() => {
                              const diff = isMachinesOnly ? 600 : PRICE_BASE_PREMIUM_20 - PRICE_BASE_BASIC;
                              setOverrideAmount(diff);
                              setAddonAskType("upgrade_same_premium_20");
                              setSelectedPlan(premiumPlan20 ?? null);
                              setAddonDestination("existing");
                              setStep("payment");
                            }}
                            className="flex-1 h-11 rounded-xl font-black text-sm text-white active:scale-[0.98] transition"
                            style={{ background: "linear-gradient(135deg,#ea580c,#dc2626)" }}
                          >
                            Bar + 20 Machines<br /><span className="text-xs font-normal">${isMachinesOnly ? 600 : PRICE_BASE_PREMIUM_20 - PRICE_BASE_BASIC} TT prorated</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                </>
              )}

            </div>
          )} {/* end hasActive */}

          {/* Pending setup / expired — go to plan selection */}
          {(isNewSignup || isExpiredRenew) && !pendingPayment && !hasActive && (
            <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center space-y-4 shadow-sm">
              <div className="h-14 w-14 rounded-full bg-orange-100 flex items-center justify-center mx-auto">
                <CreditCard className="h-7 w-7 text-orange-700" />
              </div>
              <div>
                <h2 className="font-black text-gray-900 text-lg">
                  {isExpiredRenew ? "Subscription Expired" : "Get Started"}
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  {isExpiredRenew ? "Renew your subscription to restore full access." : "Choose a plan to activate your account."}
                </p>
              </div>
              <button onClick={() => setStep("choose")}
                className="w-full h-12 rounded-xl font-black text-base text-white active:scale-[0.98] transition"
                style={{ background: "linear-gradient(135deg, #f97316, #ea580c)" }}>
                {isExpiredRenew ? "Renew Subscription →" : "View Plans →"}
              </button>
            </div>
          )}


          {/* Payment history */}
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-black text-gray-900">Payment History</h3>
            </div>
            {payments.length === 0 ? (
              <p className="text-center text-gray-400 py-8 text-sm">No payments yet</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {payments.map((p) => {
                  const plan = plans.find(x => x.id === p.plan_id);
                  return (
                    <div key={p.id} className="px-5 py-4 flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-gray-900">{plan?.name ?? "Plan"}</p>
                        <p className="font-mono text-xs text-gray-400 mt-0.5">{p.reference_number}</p>
                        {p.notes && <p className="text-xs text-orange-700 mt-0.5">{p.notes}</p>}
                        <p className="text-xs text-gray-400 mt-0.5">{new Date(p.created_at).toLocaleDateString("en-GB")}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-black text-gray-900">${p.amount.toFixed(0)} TT</p>
                        <span className={`text-xs font-bold ${p.status === "paid" ? "text-green-600" : p.status === "pending" ? "text-yellow-600" : "text-red-500"}`}>
                          {p.status.toUpperCase()}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {histPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
                <button disabled={historyPage === 0} onClick={() => setHistoryPage(p => p - 1)}
                  className="text-xs font-bold text-orange-700 disabled:text-gray-300">← Prev</button>
                <span className="text-xs text-gray-400">{historyPage + 1} / {histPages}</span>
                <button disabled={historyPage >= histPages - 1} onClick={() => setHistoryPage(p => p + 1)}
                  className="text-xs font-bold text-orange-700 disabled:text-gray-300">Next →</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          STEP 1: CHOOSE — two plan cards side by side
          ═══════════════════════════════════════════════════════════════════ */}
      {step === "choose" && (
        <div className="space-y-6">
          <p className="text-center text-gray-500 text-sm">Select the plan that works best for your business. All plans renew annually.</p>

          {/* ── Card 1: Bar Only ── */}
          {basicPlan && (
            <div className="rounded-2xl border-2 border-blue-200 bg-white shadow-sm overflow-hidden">
              <div className="h-2 bg-gradient-to-r from-blue-500 to-blue-400" />
              <div className="p-5">
                <div className="flex items-center gap-2 mb-1">
                  <div className="h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                    <Wine className="h-4 w-4 text-blue-600" />
                  </div>
                  <h3 className="font-black text-gray-900 text-lg">Bar Only</h3>
                </div>
                <p className="text-3xl font-black text-blue-600 mt-2">${basicPlan.amount.toFixed(0)}<span className="text-sm font-normal text-gray-400"> TT/yr</span></p>
                <p className="text-xs text-gray-400 mt-0.5 mb-4">Billed annually</p>

                <ul className="space-y-2 mb-5">
                  {["Register / POS system", "Credit account management", "Cashier management", "Wallet & sales history", "Music player"].map(f => (
                    <li key={f} className="flex items-start gap-2 text-sm text-gray-600">
                      <Check className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>

                <button onClick={() => { setSelectedPlan(basicPlan); setStep("payment"); }}
                  className="w-full h-12 rounded-xl font-black text-base text-white bg-blue-600 active:scale-[0.98] transition hover:bg-blue-700">
                  Select Bar Only
                </button>
              </div>
            </div>
          )}

          {/* ── Card 2: Machines Only — 10 and 20 screen ── */}
          {machinesOnlyPlan && (
            <div className="rounded-2xl border-2 border-orange-300 bg-white shadow-md overflow-hidden relative">
              <div className="absolute top-3 right-3 bg-orange-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                Machines
              </div>
              <div className="h-2 bg-gradient-to-r from-orange-600 to-amber-400" />
              <div className="p-5">
                <div className="flex items-center gap-2 mb-1">
                  <div className="h-8 w-8 rounded-lg bg-orange-100 flex items-center justify-center shrink-0">
                    <Gamepad2 className="h-4 w-4 text-orange-700" />
                  </div>
                  <h3 className="font-black text-gray-900 text-lg">Machines Only</h3>
                </div>
                <p className="text-xs text-gray-400 mt-1 mb-4">Payout & income tracking for gaming machines</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 mb-5">
                  {[
                    "Machines payout tracker",
                    "Per-screen profit reports",
                    "Float session management",
                    "Full history PDF export",
                    "Add extra accounts via billing",
                    "Upgrade to Bar with Machines",
                  ].map(f => (
                    <div key={f} className="flex items-start gap-2 text-sm text-gray-600">
                      <Check className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
                      {f}
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setSelectedPlan(machinesOnlyPlan); setStep("payment"); }}
                    className="flex-1 h-12 rounded-xl font-black text-sm text-white active:scale-[0.98] transition"
                    style={{ background: "linear-gradient(135deg, #ea580c, #f59e0b)" }}
                  >
                    10 Screens<br />
                    <span className="text-base font-black">${machinesOnlyPlan.amount.toFixed(0)}</span> <span className="text-xs font-normal">TT/yr</span>
                  </button>
                  {machinesOnlyPlan20 && (
                    <button
                      onClick={() => { setSelectedPlan(machinesOnlyPlan20); setStep("payment"); }}
                      className="flex-1 h-12 rounded-xl font-black text-sm text-white active:scale-[0.98] transition"
                      style={{ background: "linear-gradient(135deg, #c2410c, #ea580c)" }}
                    >
                      20 Screens<br />
                      <span className="text-base font-black">${machinesOnlyPlan20.amount.toFixed(0)}</span> <span className="text-xs font-normal">TT/yr</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Card 3: Bar with Machines — 10 and 20 screen ── */}
          {premiumPlan && (
            <div className="rounded-2xl border-2 border-amber-300 bg-white shadow-md overflow-hidden relative">
              <div className="absolute top-3 right-3 bg-amber-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                Full Access
              </div>
              <div className="h-2 bg-gradient-to-r from-amber-500 to-orange-400" />
              <div className="p-5">
                <div className="flex items-center gap-2 mb-1">
                  <div className="h-8 w-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                    <Star className="h-4 w-4 text-amber-800" />
                  </div>
                  <h3 className="font-black text-gray-900 text-lg">Bar with Machines</h3>
                </div>
                <p className="text-xs text-gray-400 mt-0.5 mb-4">Complete bar & machines management in one plan</p>

                <div className="grid grid-cols-2 gap-x-6 gap-y-2 mb-5">
                  {[
                    "Register / POS system",
                    "Credit account management",
                    "Cashier management",
                    "Wallet & sales history",
                    "Machines payout tracker",
                    "Per-screen profit reports",
                    "Float session management",
                    "Full history PDF export",
                  ].map(f => (
                    <div key={f} className="flex items-start gap-2 text-sm text-gray-600">
                      <Check className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                      {f}
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <button onClick={() => { setSelectedPlan(premiumPlan); setStep("payment"); }}
                    className="flex-1 h-12 rounded-xl font-black text-sm text-white active:scale-[0.98] transition"
                    style={{ background: "linear-gradient(135deg, #f59e0b, #ea580c)" }}>
                    10 Screens<br />
                    <span className="text-base font-black">${premiumPlan.amount.toFixed(0)}</span> <span className="text-xs font-normal">TT/yr</span>
                  </button>
                  {premiumPlan20 && (
                    <button onClick={() => { setSelectedPlan(premiumPlan20); setStep("payment"); }}
                      className="flex-1 h-12 rounded-xl font-black text-sm text-white active:scale-[0.98] transition"
                      style={{ background: "linear-gradient(135deg, #d97706, #c2410c)" }}>
                      20 Screens<br />
                      <span className="text-base font-black">${premiumPlan20.amount.toFixed(0)}</span> <span className="text-xs font-normal">TT/yr</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          STEP: ADDON-BARS — name/location for each extra bar
          ═══════════════════════════════════════════════════════════════════ */}
      {/* ═══════════════════════════════════════════════════════════════════
          STEP: ADDON-ASK — same bar or new bar?
          ═══════════════════════════════════════════════════════════════════ */}
      {step === "addon-ask" && addonAskType && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-border p-5 text-center" style={{ background: "var(--gradient-card)" }}>
            <div className="h-14 w-14 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: "rgba(251,146,60,0.15)", border: "1.5px solid rgba(251,146,60,0.4)" }}>
              <Gamepad2 className="h-7 w-7" style={{ color: "var(--primary)" }} />
            </div>
            <h3 className="font-black text-foreground text-lg mb-1">
              {addonAskType === "machines_10" ? "+ 10 Screens" :
               addonAskType === "machines_20" ? "+ 20 Screens" :
               addonAskType === "bar_machines_10" ? "Bar + 10 Machines" :
               addonAskType === "bar_machines_20" ? "Bar + 20 Machines" : "New Account"}
            </h3>
            <p className="text-sm text-muted-foreground">
              {addonAskType === "machines_10"
                ? "Do you want to add 10 more screens to an existing account (making it 20), or create a new account with 10 screens?"
                : addonAskType === "machines_20"
                ? "Do you want to upgrade an existing 10-screen account to 20 screens, or create a brand new 20-screen account?"
                : "Do you want to add this to an existing machine account, or create a brand new account?"}
            </p>
          </div>

          {/* Existing bar option */}
          <button
            onClick={async () => {
              setAddonDestination("existing");
              if (addonAskType === "machines_10" || addonAskType === "machines_20") {
                await loadEligibleBars("machines_upgrade");
              } else {
                await loadEligibleBars("bar_upgrade");
              }
            }}
            className="w-full rounded-2xl border-2 p-4 text-left active:scale-[0.98] transition flex items-center gap-3"
            style={{ background: "var(--gradient-card)", borderColor: "var(--primary)" }}
          >
            <div className="flex-1">
              <p className="font-black text-sm" style={{ color: "var(--primary)" }}>
                {addonAskType === "machines_10" ? "Add to existing account (→ 20 screens)" :
                 addonAskType === "machines_20" ? "Upgrade existing 10-screen account to 20" :
                 "Add to existing machine account"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {addonAskType === "machines_10"
                  ? "Upgrade an account from 10 to 20 screens — prorated $" + PRICE_MACHINES_10 + " TT"
                  : addonAskType === "machines_20"
                  ? "Upgrade an account from 10 to 20 screens — prorated $" + PRICE_MACHINES_20 + " TT"
                  : "Add bar features to an existing machine account — prorated $" + (overrideAmount ?? 0) + " TT"}
              </p>
            </div>
            <span className="text-xs font-black px-3 py-1 rounded-full text-black shrink-0" style={{ background: "var(--gradient-hero)" }}>Select →</span>
          </button>

          {/* New account option */}
          <button
            onClick={() => {
              setAddonDestination("new");
              setSelectedBarId(null);
              setStep("addon-bars");
            }}
            className="w-full rounded-2xl border-2 border-border p-4 text-left active:scale-[0.98] transition flex items-center gap-3"
            style={{ background: "var(--gradient-card)" }}
          >
            <div className="flex-1">
              <p className="font-black text-sm text-foreground">Create a new account</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                New separate account — prorated ${overrideAmount ?? 0} TT
              </p>
            </div>
            <span className="text-xs font-black px-3 py-1 rounded-full text-black shrink-0" style={{ background: "var(--gradient-hero)" }}>Select →</span>
          </button>
        </div>
      )}

      {/* ── Bar picker — shown after choosing "existing bar" ── */}
      {step === "addon-ask" && addonAskType && addonDestination === "existing" && eligibleBars.length > 0 && (
        <div className="space-y-3 mt-4">
          <p className="font-black text-gray-900 text-sm px-1">Select the account to upgrade:</p>
          {eligibleBars.map(bar => (
            <button
              key={bar.id}
              onClick={() => {
                setSelectedBarId(bar.id);
                setStep("payment");
              }}
              className="w-full rounded-2xl border-2 p-4 text-left active:scale-[0.98] transition flex items-center gap-3"
              style={{
                background: "var(--gradient-card)",
                borderColor: selectedBarId === bar.id ? "var(--primary)" : "var(--border)",
              }}
            >
              <div className="flex-1">
                <p className="font-black text-sm text-foreground">{bar.username}</p>
                <p className="text-xs text-muted-foreground">{bar.address} · {bar.screen_count} screens currently</p>
              </div>
              <span className="text-xs font-black px-3 py-1 rounded-full text-black shrink-0" style={{ background: "var(--gradient-hero)" }}>
                {selectedBarId === bar.id ? "Selected ✓" : "Select →"}
              </span>
            </button>
          ))}
        </div>
      )}

      {step === "addon-bars" && selectedPlan && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-white border border-gray-200 p-5 shadow-sm">
            <h3 className="font-black text-gray-900 mb-1">{selectedPlan.name}</h3>
            <p className="text-2xl font-black text-orange-700">
              ${totalDue.toFixed(0)} <span className="text-sm font-normal text-gray-400">TT due now</span>
            </p>
            {planEndDate && daysRemaining < 365 ? (
              <div className="mt-1 space-y-0.5">
                <p className="text-xs text-gray-400">
                  ${proRataUnitPrice.toFixed(0)} × {addonBarCount} bar{addonBarCount > 1 ? "s" : ""} — pro-rated for {daysRemaining} days remaining
                </p>
                <p className="text-xs text-orange-600 font-bold">
                  At renewal ({planEndDate.toLocaleDateString("en-GB")}) you'll pay full price: ${selectedPlan.amount.toFixed(0)} TT/yr per bar
                </p>
              </div>
            ) : (
              <p className="text-xs text-gray-400 mt-0.5">${selectedPlan.amount.toFixed(0)} × {addonBarCount} bar{addonBarCount > 1 ? "s" : ""}</p>
            )}
          </div>

          {/* How many bars */}
          <div className="rounded-2xl bg-white border border-gray-200 p-5 shadow-sm space-y-3">
            <p className="font-black text-gray-900 text-sm">How many extra bars do you want?</p>
            <p className="text-xs text-gray-500">You currently have {currentBarCount} bar{currentBarCount !== 1 ? "s" : ""}.</p>
            <div className="flex items-center gap-4">
              <button
                onClick={() => {
                  const n = Math.max(1, addonBarCount - 1);
                  setAddonBarCount(n);
                  setAddonBars(prev => {
                    const type = prev[0]?.type ?? "bar";
                    const next = [...prev];
                    while (next.length > n) next.pop();
                    while (next.length < n) next.push({ name: "", location: "", type });
                    return next;
                  });
                }}
                className="h-10 w-10 rounded-xl bg-gray-100 flex items-center justify-center font-black text-xl active:scale-90 transition"
              ><Minus className="h-4 w-4 text-black" /></button>
              <span className="text-3xl font-black text-gray-900 w-10 text-center">{addonBarCount}</span>
              <button
                onClick={() => {
                  const n = addonBarCount + 1;
                  setAddonBarCount(n);
                  setAddonBars(prev => {
                    const type = prev[0]?.type ?? "bar";
                    const next = [...prev];
                    while (next.length < n) next.push({ name: "", location: "", type });
                    return next;
                  });
                }}
                className="h-10 w-10 rounded-xl bg-gray-100 flex items-center justify-center font-black text-xl active:scale-90 transition"
              ><Plus className="h-4 w-4 text-black" /></button>
            </div>
          </div>

          {/* Name & location for each bar */}
          <div className="space-y-3">
            <p className="font-black text-gray-900 text-sm">Name and location for each bar</p>
            {addonBars.slice(0, addonBarCount).map((bar, i) => (
              <div key={i} className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm space-y-3">
                <p className="text-xs font-black text-gray-500 uppercase tracking-widest">Bar {i + 1}</p>
                <input
                  type="text"
                  placeholder="Bar name (e.g. The Rusty Nail)"
                  value={bar.name}
                  maxLength={60}
                  onChange={e => setAddonBars(prev => prev.map((b, idx) => idx === i ? { ...b, name: e.target.value } : b))}
                  className="w-full h-11 px-4 rounded-xl border border-gray-200 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
                <input
                  type="text"
                  placeholder="District / location (e.g. Port of Spain)"
                  value={bar.location}
                  maxLength={60}
                  onChange={e => setAddonBars(prev => prev.map((b, idx) => idx === i ? { ...b, location: e.target.value } : b))}
                  className="w-full h-11 px-4 rounded-xl border border-gray-200 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
              </div>
            ))}
          </div>

          <button
            onClick={() => setStep("payment")}
            disabled={addonBars.slice(0, addonBarCount).some(b => !b.name.trim() || !b.location.trim())}
            className="w-full h-12 rounded-xl font-black text-base text-white active:scale-[0.98] transition flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #f97316, #ea580c)" }}
          >
            Continue <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          STEP 3: PAYMENT METHOD
          ═══════════════════════════════════════════════════════════════════ */}
      {step === "payment" && selectedPlan && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm">
            <p className="text-xs text-gray-500 mb-1">{renewMode ? "Renewing" : "Subscribing to"}</p>
            <p className="font-black text-gray-900">{selectedPlan.name}</p>
            <p className="text-2xl font-black text-orange-700 mt-1">${totalDue.toFixed(0)} <span className="text-sm font-normal text-gray-400">TT due now</span></p>
            {isAddonPlanSelected && planEndDate && daysRemaining < 365 && (
              <p className="text-xs text-orange-600 font-bold mt-1">
                Pro-rated for {daysRemaining} days — aligns to your plan renewal on {planEndDate.toLocaleDateString("en-GB")}
              </p>
            )}
          </div>

          <p className="text-sm font-black text-gray-900">How would you like to pay?</p>

          {/* Cash */}
          <button onClick={() => { setPayMethod("cash"); setStep("confirm"); }}
            className="w-full rounded-2xl border-2 border-border p-5 text-left active:scale-[0.98] transition flex items-center gap-4"
            style={{ background: "var(--gradient-card)" }}>
            <div className="h-12 w-12 rounded-xl bg-green-500/15 border border-green-500/30 flex items-center justify-center shrink-0 text-2xl">💵</div>
            <div className="flex-1">
              <p className="font-black text-foreground">Cash Payment</p>
              <p className="text-xs text-muted-foreground mt-0.5">Pay cash directly to admin. You'll receive a reference number.</p>
            </div>
            <span className="text-xs font-black px-3 py-1 rounded-full text-black shrink-0" style={{ background: "var(--gradient-hero)" }}>Select →</span>
          </button>

          {/* Bank transfer */}
          {bankEnabled && (
            <button onClick={() => { setPayMethod("bank"); setStep("confirm"); }}
              className="w-full rounded-2xl border-2 border-border p-5 text-left active:scale-[0.98] transition flex items-center gap-4"
              style={{ background: "var(--gradient-card)" }}>
              <div className="h-12 w-12 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center shrink-0 text-2xl">🏦</div>
              <div className="flex-1">
                <p className="font-black text-foreground">Bank Transfer</p>
                <p className="text-xs text-muted-foreground mt-0.5">Transfer directly to our bank account and submit your reference.</p>
              </div>
              <span className="text-xs font-black px-3 py-1 rounded-full text-black shrink-0" style={{ background: "var(--gradient-hero)" }}>Select →</span>
            </button>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          STEP 4: CONFIRM
          ═══════════════════════════════════════════════════════════════════ */}
      {step === "confirm" && selectedPlan && payMethod && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-white border border-gray-200 p-5 space-y-3 shadow-sm">
            <h3 className="font-black text-gray-900">Order Summary</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="font-black text-gray-900">{selectedPlan.name}</span>
                <span className="font-bold text-gray-900">
                  {isAddonPlanSelected
                    ? `$${proRataUnitPrice.toFixed(0)} × ${addonBarCount}`
                    : `$${selectedPlan.amount.toFixed(0)} TT`}
                </span>
              </div>
              {isAddonPlanSelected && planEndDate && daysRemaining < 365 && (
                <div className="text-xs text-orange-600 font-bold bg-orange-50 rounded-lg px-3 py-2">
                  Pro-rated for {daysRemaining} of 365 days ({Math.round(proRataFraction * 100)}%).
                  Full price is ${selectedPlan.amount.toFixed(0)} TT/yr per bar. At renewal on {planEndDate.toLocaleDateString("en-GB")} you'll pay full price for all bars together.
                </div>
              )}
              <div className="flex justify-between border-t border-gray-100 pt-2 font-black text-base">
                <span className="text-gray-900">Total due now</span><span className="text-orange-700">${totalDue.toFixed(0)} TT</span>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-gray-50 p-3 text-sm">
              <span className="text-xl">{payMethod === "cash" ? "💵" : "🏦"}</span>
              <span className="font-bold text-gray-700">{payMethod === "cash" ? "Cash payment to admin" : "Bank transfer"}</span>
            </div>
          </div>

          <button onClick={submitPayment} disabled={submitting}
            className="w-full h-14 rounded-xl font-black text-base text-white active:scale-[0.98] transition disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ background: "linear-gradient(135deg, #f97316, #ea580c)" }}>
            {submitting ? "Submitting…" : `Confirm — $${totalDue.toFixed(0)} TT`}
          </button>
          <p className="text-xs text-center text-gray-400">Your subscription activates once admin confirms receipt.</p>
        </div>
      )}

    </div>
  );
}

