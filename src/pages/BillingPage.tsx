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
  Star, Gamepad2, ChevronRight, ArrowLeft, Check,
} from "lucide-react";
import type { BillingPlan, BillingPayment, AdminBankDetails } from "@/types/billing";

const SETUP_FEE  = 200;
const TABLET_FEE = 600;
const SPECIAL_EMAIL = "renard.sankersingh@gmail.com";

type Step = "status" | "choose" | "addons" | "payment" | "confirm";

export default function BillingPage() {
  const { profile } = useAuth();

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
  const [includeSetup, setIncludeSetup]   = useState(false);
  const [includeTablet, setIncludeTablet] = useState(false);
  const [payMethod, setPayMethod]     = useState<"cash" | "bank" | null>(null);
  const [submitting, setSubmitting]   = useState(false);

  useEffect(() => { loadAll(); }, [profile?.id]);
  useEffect(() => { if (profile?.id) loadPayments(); }, [historyPage]);

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

  const copy = (t: string) => { navigator.clipboard.writeText(t); toast.success("Copied"); };

  const reset = () => {
    setStep("status"); setSelectedPlan(null); setRenewMode(null);
    setIncludeSetup(false); setIncludeTablet(false); setPayMethod(null);
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
    const addons    = (isFirst && includeSetup ? SETUP_FEE : 0) + (!isRenewal && includeTablet ? TABLET_FEE : 0);
    const amount    = selectedPlan.amount + addons;

    const notesParts: string[] = [];
    if (isFirst && includeSetup)  notesParts.push("Includes $200 agent setup & training visit");
    if (!isRenewal && includeTablet) notesParts.push("Includes $600 Android tablet pre-installed");

    let dueDate = new Date();
    if (isRenewal) {
      const base = renewMode === "premium"
        ? profile.premium_subscription_end_date
        : profile.subscription_end_date;
      if (base) dueDate = new Date(base);
    }
    dueDate.setMonth(dueDate.getMonth() + selectedPlan.duration_months);

    const { error } = await supabase.from("billing_payments").insert({
      owner_id: profile.id, plan_id: selectedPlan.id,
      reference_number: ref, amount,
      due_date: dueDate.toISOString(), status: "pending",
      payment_method: payMethod,
      notes: notesParts.join(" • ") || null,
    });
    setSubmitting(false);
    if (error) { toast.error("Failed to submit payment"); return; }
    toast.success("Payment submitted — awaiting admin confirmation");
    reset(); loadPayments();
  };


  // ── Derived ──────────────────────────────────────────────────────────────
  const pendingPayment  = payments.find(p => p.status === "pending");
  const hasActive       = profile?.billing_status === "active";
  const isSpecial       = userEmail === SPECIAL_EMAIL;
  const isBasic         = !profile?.plan_type || profile.plan_type === "basic";
  const isPremium       = profile?.plan_type === "premium";

  const basicPlan         = plans.find(p => p.plan_type === "basic");
  const machinesAddonPlan = plans.find(p => p.plan_type === "machines_addon");
  const premiumPlan       = plans.find(p => p.plan_type === "premium");

  const basicEnd      = profile?.subscription_end_date ? new Date(profile.subscription_end_date) : null;
  const basicDaysLeft = basicEnd ? Math.ceil((basicEnd.getTime() - Date.now()) / 86400000) : null;
  const basicOverdue  = basicEnd ? basicEnd < new Date() : false;
  const basicCanRenew = basicOverdue || (basicDaysLeft !== null && basicDaysLeft <= 7);

  const premEnd       = profile?.premium_subscription_end_date ? new Date(profile.premium_subscription_end_date) : null;
  const premDaysLeft  = premEnd ? Math.ceil((premEnd.getTime() - Date.now()) / 86400000) : null;
  const premOverdue   = premEnd ? premEnd < new Date() : false;
  const premCanRenew  = premOverdue || (premDaysLeft !== null && premDaysLeft <= 7);

  const isNewSignup    = !pendingPayment && profile?.status === "pending" && profile?.billing_status !== "expired";
  const isExpiredRenew = !pendingPayment && profile?.status === "pending" && profile?.billing_status === "expired";

  const addonsTotal = (includeSetup ? SETUP_FEE : 0) + (includeTablet ? TABLET_FEE : 0);
  const totalDue    = (selectedPlan?.amount ?? 0) + (renewMode ? 0 : addonsTotal);
  const histPages   = Math.max(1, Math.ceil(historyTotal / HIST_SIZE));


  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="pb-24 max-w-2xl mx-auto">

      {/* Header */}
      <div className="sticky top-0 z-20 -mx-3 px-3 pt-2 pb-2 bg-background/95 backdrop-blur border-b border-border mb-6">
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
            {(["choose","addons","payment","confirm"] as Step[])
              .filter(s => {
                if (selectedPlan?.plan_type === "machines_addon" || renewMode) {
                  return s !== "addons" && s !== "choose";
                }
                return true;
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
              {/* Basic plan card */}
              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center">
                      <CreditCard className="h-4 w-4 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-black text-gray-900 text-sm">Basic Plan</p>
                      <p className="text-xs text-gray-500">${basicPlan?.amount.toFixed(0) ?? "750"} TT / year</p>
                    </div>
                  </div>
                  <span className={`text-xs font-black px-2.5 py-1 rounded-full ${basicOverdue ? "bg-red-100 text-red-600" : "bg-green-100 text-green-600"}`}>
                    {basicOverdue ? "OVERDUE" : "ACTIVE"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm mb-3">
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
                      {basicOverdue ? "⚠️ Renew Now — $" + (basicPlan?.amount.toFixed(0) ?? "750") + " TT" : "Renew Basic — $" + (basicPlan?.amount.toFixed(0) ?? "750") + " TT"}
                    </button>
                  ) : (
                    <p className="text-xs text-center text-gray-400">Renewal opens {basicDaysLeft !== null ? basicDaysLeft - 7 : 0} days before due date</p>
                  )
                )}
              </div>

              {/* Premium plan card */}
              {isPremium && !isSpecial && (
                <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-lg bg-amber-100 flex items-center justify-center">
                        <Star className="h-4 w-4 text-amber-800" />
                      </div>
                      <div>
                        <p className="font-black text-gray-900 text-sm">Premium Plan</p>
                        <p className="text-xs text-gray-500">${premiumPlan?.amount.toFixed(0) ?? "1300"} TT / year</p>
                      </div>
                    </div>
                    <span className={`text-xs font-black px-2.5 py-1 rounded-full ${premOverdue ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-800"}`}>
                      {premOverdue ? "OVERDUE" : "ACTIVE"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-amber-800 mb-3">
                    <Gamepad2 className="h-3 w-3" /> Machines Tracker included
                  </div>
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
                        {premOverdue ? "⚠️ Renew Now — $" + (premiumPlan?.amount.toFixed(0) ?? "1300") + " TT" : "Renew Premium — $" + (premiumPlan?.amount.toFixed(0) ?? "1300") + " TT"}
                      </button>
                    ) : (
                      <p className="text-xs text-center text-amber-800/60">Renewal opens {premDaysLeft !== null ? premDaysLeft - 7 : 0} days before due date</p>
                    )
                  )}
                </div>
              )}

              {/* Add Machines Tracker — basic users only, not special */}
              {isBasic && !isSpecial && !pendingPayment && (
                <button onClick={() => { setSelectedPlan(machinesAddonPlan ?? null); setRenewMode(null); setStep("payment"); }}
                  disabled={!machinesAddonPlan}
                  className="w-full rounded-2xl border border-gray-200 bg-white p-4 text-left active:scale-[0.98] transition disabled:opacity-50 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Gamepad2 className="h-5 w-5 text-orange-700" />
                      <div>
                        <p className="font-black text-gray-900 text-sm">Add Machines Tracker</p>
                        <p className="text-xs text-gray-900 font-bold mt-0.5">Keep Basic + add Machines — $600 TT/yr separate</p>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-gray-400" />
                  </div>
                </button>
              )}
            </div>
          )}

          {/* Pending setup / expired — go to plan selection */}
          {(isNewSignup || isExpiredRenew) && !pendingPayment && (
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
                        {p.next_due_date && <p className="text-xs text-gray-400 mt-0.5">Due: {new Date(p.next_due_date).toLocaleDateString("en-GB")}</p>}
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
          <p className="text-center text-gray-500 text-sm">Select the plan that works best for your business. Both renew annually.</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Basic plan card */}
            {basicPlan && (
              <div className="rounded-2xl border-2 border-blue-200 bg-white shadow-sm overflow-hidden flex flex-col">
                {/* Color band */}
                <div className="h-2 bg-gradient-to-r from-blue-500 to-blue-400" />
                <div className="p-5 flex-1 flex flex-col">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                      <CreditCard className="h-4 w-4 text-blue-600" />
                    </div>
                    <h3 className="font-black text-gray-900 text-lg">Basic</h3>
                  </div>
                  <p className="text-3xl font-black text-blue-600 mt-2">${basicPlan.amount.toFixed(0)}<span className="text-sm font-normal text-gray-400"> TT/yr</span></p>
                  <p className="text-xs text-gray-400 mt-0.5 mb-4">Billed annually</p>

                  <ul className="space-y-2 flex-1 mb-5">
                    {["Register / POS system", "Credit account management", "Cashier management", "Wallet & sales history", "Music player", "Annual renewal $800 TT"].map(f => (
                      <li key={f} className="flex items-start gap-2 text-sm text-gray-600">
                        <Check className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                        {f}
                      </li>
                    ))}
                  </ul>

                  <button onClick={() => { setSelectedPlan(basicPlan); setStep("addons"); }}
                    className="w-full h-12 rounded-xl font-black text-base text-white bg-blue-600 active:scale-[0.98] transition hover:bg-blue-700">
                    Select Basic
                  </button>
                </div>
              </div>
            )}

            {/* Premium plan card */}
            {premiumPlan && (
              <div className="rounded-2xl border-2 border-amber-300 bg-white shadow-md overflow-hidden flex flex-col relative">
                {/* Popular badge */}
                <div className="absolute top-3 right-3 bg-amber-400 text-white text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Full Access
                </div>
                <div className="h-2 bg-gradient-to-r from-amber-500 to-orange-400" />
                <div className="p-5 flex-1 flex flex-col">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="h-8 w-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                      <Star className="h-4 w-4 text-amber-800" />
                    </div>
                    <h3 className="font-black text-gray-900 text-lg">Premium</h3>
                  </div>
                  <p className="text-3xl font-black text-amber-800 mt-2">${premiumPlan.amount.toFixed(0)}<span className="text-sm font-normal text-gray-400"> TT/yr</span></p>
                  <p className="text-xs text-gray-400 mt-0.5 mb-4">Billed annually</p>

                  <ul className="space-y-2 flex-1 mb-5">
                    {["Everything in Basic", "Machines payout tracker", "Per-screen profit reports", "Float session management", "Full history PDF export", "Annual renewal $1,300 TT"].map(f => (
                      <li key={f} className="flex items-start gap-2 text-sm text-gray-600">
                        <Check className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                        {f}
                      </li>
                    ))}
                  </ul>

                  <button onClick={() => { setSelectedPlan(premiumPlan); setStep("addons"); }}
                    className="w-full h-12 rounded-xl font-black text-base text-white active:scale-[0.98] transition"
                    style={{ background: "linear-gradient(135deg, #f59e0b, #ea580c)" }}>
                    Select Premium
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          STEP 2: ADD-ONS (skipped for renewals)
          ═══════════════════════════════════════════════════════════════════ */}
      {step === "addons" && selectedPlan && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-white border border-gray-200 p-5 shadow-sm">
            <h3 className="font-black text-gray-900 mb-1">
              {selectedPlan.plan_type === "premium" ? "⭐ " : ""}{selectedPlan.name}
            </h3>
            <p className="text-2xl font-black text-orange-700">${selectedPlan.amount.toFixed(0)} <span className="text-sm font-normal text-gray-400">TT/yr</span></p>
          </div>

          <p className="text-sm font-bold text-gray-700">Optional add-ons for your first payment only:</p>

          {/* Setup add-on */}
          <label className="flex items-start gap-4 rounded-2xl border-2 border-gray-200 bg-white p-4 cursor-pointer hover:border-orange-300 transition has-[:checked]:border-orange-400 has-[:checked]:bg-orange-50">
            <input type="checkbox" className="mt-1 h-5 w-5 accent-orange-500 shrink-0" checked={includeSetup} onChange={e => setIncludeSetup(e.target.checked)} />
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <p className="font-black text-gray-900 text-sm">Agent Setup &amp; Training Visit</p>
                <span className="font-black text-orange-700 text-sm">+$200 TT</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">An agent visits your venue to install, configure and train your team on-site.</p>
            </div>
          </label>

          {/* Tablet add-on */}
          <label className="flex items-start gap-4 rounded-2xl border-2 border-gray-200 bg-white p-4 cursor-pointer hover:border-orange-300 transition has-[:checked]:border-orange-400 has-[:checked]:bg-orange-50">
            <input type="checkbox" className="mt-1 h-5 w-5 accent-orange-500 shrink-0" checked={includeTablet} onChange={e => setIncludeTablet(e.target.checked)} />
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <p className="font-black text-gray-900 text-sm">Android Tablet (Pre-installed)</p>
                <span className="font-black text-orange-700 text-sm">+$600 TT</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">Receive a ready-to-use Android tablet with Bartendaz Pro pre-configured.</p>
            </div>
          </label>

          {/* Total */}
          <div className="rounded-2xl bg-white border border-gray-200 p-4 space-y-2 shadow-sm">
            <div className="flex justify-between text-sm text-gray-600"><span>{selectedPlan.name}</span><span className="font-bold">${selectedPlan.amount.toFixed(0)} TT</span></div>
            {includeSetup   && <div className="flex justify-between text-sm text-gray-600"><span>Agent setup &amp; training</span><span className="font-bold">$200 TT</span></div>}
            {includeTablet  && <div className="flex justify-between text-sm text-gray-600"><span>Android tablet</span><span className="font-bold">$600 TT</span></div>}
            <div className="flex justify-between font-black text-base border-t border-gray-100 pt-2"><span>Total due now</span><span className="text-orange-700">${totalDue.toFixed(0)} TT</span></div>
          </div>

          <button onClick={() => setStep("payment")}
            className="w-full h-12 rounded-xl font-black text-base text-white active:scale-[0.98] transition flex items-center justify-center gap-2"
            style={{ background: "linear-gradient(135deg, #f97316, #ea580c)" }}>
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
            <p className="text-2xl font-black text-orange-700 mt-1">${totalDue.toFixed(0)} <span className="text-sm font-normal text-gray-400">TT</span></p>
          </div>

          <p className="text-sm font-black text-gray-900">How would you like to pay?</p>

          {/* Cash */}
          <button onClick={() => { setPayMethod("cash"); setStep("confirm"); }}
            className="w-full rounded-2xl border-2 border-gray-200 bg-white p-5 text-left hover:border-orange-300 transition active:scale-[0.98] flex items-center gap-4 shadow-sm">
            <div className="h-12 w-12 rounded-xl bg-green-100 flex items-center justify-center shrink-0 text-2xl">💵</div>
            <div className="flex-1">
              <p className="font-black text-gray-900">Cash Payment</p>
              <p className="text-xs text-gray-500 mt-0.5">Pay cash directly to admin. You'll receive a reference number.</p>
            </div>
            <ChevronRight className="h-5 w-5 text-gray-300" />
          </button>

          {/* Bank transfer */}
          {bankEnabled && (
            <button onClick={() => { setPayMethod("bank"); setStep("confirm"); }}
              className="w-full rounded-2xl border-2 border-gray-200 bg-white p-5 text-left hover:border-orange-300 transition active:scale-[0.98] flex items-center gap-4 shadow-sm">
              <div className="h-12 w-12 rounded-xl bg-blue-100 flex items-center justify-center shrink-0 text-2xl">🏦</div>
              <div className="flex-1">
                <p className="font-black text-gray-900">Bank Transfer</p>
                <p className="text-xs text-gray-500 mt-0.5">Transfer directly to our bank account and submit your reference.</p>
              </div>
              <ChevronRight className="h-5 w-5 text-gray-300" />
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
              <div className="flex justify-between"><span className="font-black text-gray-900">{selectedPlan.name}</span><span className="font-bold text-gray-900">${selectedPlan.amount.toFixed(0)} TT</span></div>
              {includeSetup  && !renewMode && <div className="flex justify-between"><span className="font-black text-gray-900">Agent setup &amp; training</span><span className="font-bold text-gray-900">$200 TT</span></div>}
              {includeTablet && !renewMode && <div className="flex justify-between"><span className="font-black text-gray-900">Android tablet</span><span className="font-bold text-gray-900">$600 TT</span></div>}
              <div className="flex justify-between border-t border-gray-100 pt-2 font-black text-base">
                <span className="text-gray-900">Total</span><span className="text-orange-700">${totalDue.toFixed(0)} TT</span>
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
