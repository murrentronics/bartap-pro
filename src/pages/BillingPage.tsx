import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { CreditCard, CheckCircle, Clock, AlertCircle, Copy, Music2 } from "lucide-react";
import type { BillingPlan, BillingPayment, AdminBankDetails } from "@/types/billing";

const SETUP_FEE = 250; // First year only — total first payment = $750 + $250 = $1,000 TT (includes training & installation)
const TABLET_FEE = 600;

export default function BillingPage() {
  const { profile } = useAuth();
  const [plans, setPlans]               = useState<BillingPlan[]>([]);
  const [payments, setPayments]         = useState<BillingPayment[]>([]);
  const [bankDetails, setBankDetails]   = useState<AdminBankDetails | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "bank" | null>(null);
  const [bankTransferEnabled, setBankTransferEnabled] = useState(false);
  const [loading, setLoading]           = useState(false);
  const [showRenewal, setShowRenewal]   = useState(false);
  const [includeTablet, setIncludeTablet] = useState(false);
  const [historyPage, setHistoryPage]   = useState(0);
  const [historyTotal, setHistoryTotal] = useState(0);

  const HISTORY_PAGE_SIZE = 100;
  const historyTotalPages = Math.max(1, Math.ceil(historyTotal / HISTORY_PAGE_SIZE));

  useEffect(() => {
    loadPlans();
    loadPayments();
    loadBankDetails();
    loadFeatureFlags();
  }, []);

  useEffect(() => { if (profile?.id) loadPayments(); }, [historyPage]);

  const loadFeatureFlags = async () => {
    const { data } = await supabase
      .from("feature_flags").select("enabled")
      .eq("flag_name", "bank_transfer_enabled").single();
    if (data) setBankTransferEnabled(data.enabled);
  };

  const loadPlans = async () => {
    const { data, error } = await supabase
      .from("billing_plans").select("*")
      .not("name", "ilike", "[Archived]%")
      .order("duration_months");
    if (error) { toast.error("Failed to load plans"); return; }
    setPlans(data || []);
  };

  const loadPayments = async () => {
    if (!profile?.id) return;
    const { count } = await supabase
      .from("billing_payments").select("*", { count: "exact", head: true })
      .eq("owner_id", profile.id);
    setHistoryTotal(count || 0);
    const { data, error } = await supabase
      .from("billing_payments").select("*").eq("owner_id", profile.id)
      .order("created_at", { ascending: false })
      .range(historyPage * HISTORY_PAGE_SIZE, (historyPage + 1) * HISTORY_PAGE_SIZE - 1);
    if (error) { toast.error("Failed to load payments"); return; }
    setPayments(data || []);
  };

  const loadBankDetails = async () => {
    const { data, error } = await supabase
      .from("admin_bank_details").select("*").eq("is_active", true).single();
    if (!error && data) setBankDetails(data);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const cancelPendingPayment = async () => {
    if (!pendingPayment) return;
    setLoading(true);
    const { error } = await supabase.from("billing_payments")
      .delete().eq("id", pendingPayment.id).eq("status", "pending");
    setLoading(false);
    if (error) { toast.error("Failed to cancel payment"); return; }
    toast.success("Payment cancelled");
    setPaymentMethod(null);
    setShowRenewal(false);
    setSelectedPlan(null);
    await loadPayments();
  };

  /** Create a payment record. isRenewal = true uses last paid plan. */
  const createPayment = async (isRenewal = false, method: "cash" | "bank" = "cash") => {
    if (!isRenewal && !selectedPlan) return;
    if (!profile?.id) return;
    setLoading(true);

    let plan: BillingPlan | undefined;
    if (isRenewal) {
      const lastPaid = payments.find(p => p.status === "paid");
      if (!lastPaid) { toast.error("No previous payment found"); setLoading(false); return; }
      plan = plans.find(p => p.id === lastPaid.plan_id);
    } else {
      plan = plans.find(p => p.id === selectedPlan);
    }
    if (!plan) { setLoading(false); return; }

    const { data: refData, error: refError } = await supabase.rpc("generate_payment_reference");
    if (refError) { toast.error("Failed to generate reference"); setLoading(false); return; }

    // New signup = plan + setup fee. Renewal = plan only.
    const isFirstPayment = !isRenewal && payments.filter(p => p.status === "paid").length === 0;
    const tabletAddon = !isRenewal && includeTablet ? TABLET_FEE : 0;
    const amount = (isFirstPayment ? plan.amount + SETUP_FEE : plan.amount) + tabletAddon;

    let notesParts: string[] = [];
    if (isFirstPayment) notesParts.push("Includes $250 one-time setup & training fee");
    if (!isRenewal && includeTablet) notesParts.push("Includes $600 Android tablet with app pre-installed");

    let dueDate: Date;
    if (isRenewal && profile.subscription_end_date) {
      dueDate = new Date(profile.subscription_end_date);
      dueDate.setMonth(dueDate.getMonth() + plan.duration_months);
    } else {
      dueDate = new Date();
      dueDate.setMonth(dueDate.getMonth() + plan.duration_months);
    }

    const { error } = await supabase.from("billing_payments").insert({
      owner_id: profile.id,
      plan_id: plan.id,
      reference_number: refData,
      amount,
      due_date: dueDate.toISOString(),
      status: "pending",
      payment_method: method,
      notes: notesParts.length > 0 ? notesParts.join(" • ") : null,
    });

    setLoading(false);
    if (error) { toast.error("Failed to create payment"); return; }
    toast.success("Payment pending — awaiting admin confirmation");
    setPaymentMethod(null);
    setSelectedPlan(null);
    setShowRenewal(false);
    setIncludeTablet(false);
    loadPayments();
  };

  // ── Derived state ──────────────────────────────────────────────────────────
  const pendingPayment  = payments.find(p => p.status === "pending");
  const lastPaidPayment = payments.find(p => p.status === "paid");
  const hasActivePlan   = profile?.billing_status === "active";

  const nextDueDate = lastPaidPayment?.next_due_date
    ? new Date(lastPaidPayment.next_due_date)
    : profile?.subscription_end_date
    ? new Date(profile.subscription_end_date)
    : null;

  const isOverdue    = nextDueDate && nextDueDate < new Date();
  const daysUntilDue = nextDueDate
    ? Math.ceil((nextDueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;
  const canRenew = !!isOverdue || (daysUntilDue !== null && daysUntilDue <= 7);

  const isNewSignup = !pendingPayment && profile?.status === "pending" && profile?.billing_status !== "expired";
  const isOverdueRenew = !pendingPayment && profile?.status === "pending" && profile?.billing_status === "expired";

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="pb-24">
      <div className="sticky top-0 z-20 -mx-3 px-3 pt-2 pb-2 bg-background/95 backdrop-blur border-b border-border mb-4">
        <div className="flex items-center gap-3">
          <CreditCard className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-black">Billing</h1>
        </div>
      </div>
      <div className="max-w-4xl mx-auto space-y-6">

        {/* ── Status card ── */}
        <Card className="p-6">
          <h2 className="text-xl font-bold mb-4">Subscription Status</h2>

          {isOverdueRenew ? (
            <div className="flex items-start gap-3">
              <AlertCircle className="h-6 w-6 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-red-500">Payment Overdue</p>
                <p className="text-sm text-muted-foreground">Your subscription has expired. Pay below to restore access.</p>
                <Button onClick={() => setShowRenewal(true)} variant="destructive" className="mt-3 font-bold w-full">⚠️ Pay Now</Button>
              </div>
            </div>
          ) : profile?.status === "pending" ? (
            <div className="flex items-start gap-3">
              <AlertCircle className="h-6 w-6 text-yellow-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-yellow-500">Pending Admin Approval</p>
                <p className="text-sm text-muted-foreground">Choose a plan below to get started.</p>
              </div>
            </div>
          ) : hasActivePlan ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />
                <span className="font-bold text-green-500">Active</span>
              </div>

              {/* Current plan summary */}
              {lastPaidPayment && (() => {
                const plan = plans.find(p => p.id === lastPaidPayment.plan_id);
                return plan ? (
                  <div className="rounded-xl p-3 space-y-1.5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{plan.name}</span>
                      <span className="font-semibold">${plan.amount.toFixed(2)} TT</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-primary">
                      <Music2 className="h-3 w-3" /> Music Player included
                    </div>
                  </div>
                ) : null;
              })()}

              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Next due</span>
                <span className={`font-semibold ${isOverdue ? "text-red-400" : daysUntilDue !== null && daysUntilDue <= 7 ? "text-yellow-400" : ""}`}>
                  {nextDueDate ? nextDueDate.toLocaleDateString("en-GB") : "N/A"}
                  {daysUntilDue !== null && daysUntilDue > 0 && daysUntilDue <= 30 && (
                    <span className="text-muted-foreground font-normal ml-1">({daysUntilDue}d)</span>
                  )}
                  {isOverdue && <span className="text-red-400 ml-1">Overdue</span>}
                </span>
              </div>

              {!pendingPayment && !showRenewal && (
                <div className="space-y-2 pt-1">
                  <Button
                    onClick={() => setShowRenewal(true)}
                    disabled={loading || !canRenew}
                    variant={isOverdue ? "destructive" : "default"}
                    className="w-full font-bold"
                  >
                    {isOverdue ? "⚠️ Overdue — Pay Now" : "Pay Renewal Fee"}
                  </Button>
                  {!canRenew && daysUntilDue !== null && daysUntilDue > 7 && (
                    <p className="text-xs text-muted-foreground text-center">
                      Renewal available {daysUntilDue - 7} days before due date
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-start gap-3">
              <AlertCircle className="h-6 w-6 text-yellow-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-yellow-500">Pending Setup</p>
                <p className="text-sm text-muted-foreground">Choose a plan below to get started.</p>
              </div>
            </div>
          )}
        </Card>

        {/* ── Pending payment — Cash ── */}
        {pendingPayment && pendingPayment.payment_method === "cash" && (
          <PendingCashCard
            payment={pendingPayment}
            onCopy={copyToClipboard}
            onCancel={cancelPendingPayment}
            loading={loading}
          />
        )}

        {/* ── Pending payment — Bank ── */}
        {pendingPayment && pendingPayment.payment_method === "bank" && bankDetails && (
          <PendingBankCard
            payment={pendingPayment}
            bankDetails={bankDetails}
            onCopy={copyToClipboard}
            onCancel={cancelPendingPayment}
            loading={loading}
          />
        )}

        {/* ── Renewal payment method picker ── */}
        {showRenewal && !pendingPayment && (
          <PaymentMethodCard
            title="Renew Subscription"
            onCancel={() => setShowRenewal(false)}
            onCash={() => { createPayment(true, "cash"); setShowRenewal(false); }}
            onBank={() => { createPayment(true, "bank"); setShowRenewal(false); }}
            bankEnabled={bankTransferEnabled}
            loading={loading}
          />
        )}

        {/* ── New signup: choose plan ── */}
        {isNewSignup && !selectedPlan && (
          <Card className="p-6">
            <h2 className="text-xl font-bold mb-2">Choose Your Plan</h2>
            <p className="text-sm text-muted-foreground mb-5">
              Annual subscription — <span className="font-bold text-primary">$750 TT/year</span>. First year is <span className="font-bold text-primary">$1,000 TT</span> and includes installation, setup &amp; training.
            </p>
            {/* Tablet add-on */}
            <label className="flex items-start gap-3 mb-5 p-3 rounded-xl border border-border cursor-pointer hover:border-primary/60 transition">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-orange-500"
                checked={includeTablet}
                onChange={(e) => setIncludeTablet(e.target.checked)}
              />
              <div>
                <p className="font-bold text-sm">Add Android Tablet with App Pre-Installed <span className="text-primary">+$600 TT</span></p>
                <p className="text-xs text-muted-foreground mt-0.5">Receive a ready-to-use Android tablet with Bartendaz Pro pre-installed and configured.</p>
              </div>
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {plans.map((plan) => (
                <div
                  key={plan.id}
                  className="p-6 rounded-xl border-2 border-border text-left space-y-2"
                >
                  <h3 className="text-lg font-bold">{plan.name}</h3>

                  <div>
                    <p className="text-3xl font-black text-primary">
                      ${plan.amount.toFixed(0)} <span className="text-sm font-normal text-muted-foreground">TT</span>
                    </p>
                    <p className="text-xs text-muted-foreground">Billed every {plan.duration_months} months</p>
                  </div>

                  {/* Setup fee line */}
                  <div className="rounded-lg p-2 text-xs space-y-1" style={{ background: "rgba(var(--primary-rgb,251 146 60)/0.08)" }}>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Plan</span>
                      <span className="font-semibold">${plan.amount.toFixed(0)} TT</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Installation, setup &amp; training (first year only)</span>
                      <span className="font-semibold">$250 TT</span>
                    </div>
                    {includeTablet && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Android tablet (pre-installed)</span>
                        <span className="font-semibold">$600 TT</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t pt-1 font-bold">
                      <span>Total first payment</span>
                      <span className="text-primary">${(plan.amount + SETUP_FEE + (includeTablet ? TABLET_FEE : 0)).toFixed(0)} TT</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 text-xs text-primary font-semibold">
                    <Music2 className="h-3 w-3" /> Includes Music Player
                  </div>

                  <button
                    onClick={() => setSelectedPlan(plan.id)}
                    className="w-full h-10 rounded-xl font-black text-sm mt-1 transition active:scale-95"
                    style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}
                  >
                    Select Plan
                  </button>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* ── New signup: payment method ── */}
        {isNewSignup && selectedPlan && !paymentMethod && (() => {
          const plan = plans.find(p => p.id === selectedPlan)!;
          const total = plan.amount + SETUP_FEE + (includeTablet ? TABLET_FEE : 0);
          return (
            <Card className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold">Pay for {plan.name}</h2>
                <button onClick={() => setSelectedPlan(null)} className="text-sm text-muted-foreground hover:text-foreground">← Change</button>
              </div>

              <div className="rounded-xl p-4 space-y-2 text-sm" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{plan.name}</span>
                  <span className="font-semibold">${plan.amount.toFixed(0)} TT</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Setup & training (one-time)</span>
                  <span className="font-semibold">$250 TT</span>
                </div>
                {includeTablet && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Android tablet (pre-installed)</span>
                    <span className="font-semibold">$600 TT</span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-2 font-black text-base">
                  <span>Total due now</span>
                  <span className="text-primary">${total.toFixed(0)} TT</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-5 rounded-xl border-2 border-border flex items-center justify-between gap-4">
                  <div>
                    <span className="text-2xl block mb-1">💵</span>
                    <p className="font-bold">Cash Payment</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Pay cash directly to admin</p>
                  </div>
                  <button
                    onClick={() => setPaymentMethod("cash")}
                    className="shrink-0 h-9 px-4 rounded-xl font-black text-sm transition active:scale-95"
                    style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}
                  >
                    Select
                  </button>
                </div>
                {bankTransferEnabled && (
                  <div className="p-5 rounded-xl border-2 border-border flex items-center justify-between gap-4">
                    <div>
                      <span className="text-2xl block mb-1">🏦</span>
                      <p className="font-bold">Bank Transfer</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Transfer to bank account</p>
                    </div>
                    <button
                      onClick={() => setPaymentMethod("bank")}
                      className="shrink-0 h-9 px-4 rounded-xl font-black text-sm transition active:scale-95"
                      style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}
                    >
                      Select
                    </button>
                  </div>
                )}
              </div>
            </Card>
          );
        })()}

        {/* ── New signup: confirm ── */}
        {isNewSignup && selectedPlan && paymentMethod && (() => {
          const plan = plans.find(p => p.id === selectedPlan)!;
          const total = plan.amount + SETUP_FEE + (includeTablet ? TABLET_FEE : 0);
          return (
            <Card className="p-6 border-primary space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold">Confirm {paymentMethod === "cash" ? "Cash" : "Bank"} Payment</h2>
                <button onClick={() => setPaymentMethod(null)} className="text-sm text-muted-foreground hover:text-foreground">← Back</button>
              </div>
              <div className="rounded-xl p-4 space-y-2 text-sm" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{plan.name}</span>
                  <span className="font-semibold">${plan.amount.toFixed(0)} TT</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Setup & training (one-time)</span>
                  <span className="font-semibold">$250 TT</span>
                </div>
                {includeTablet && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Android tablet (pre-installed)</span>
                    <span className="font-semibold">$600 TT</span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-2 font-black text-base">
                  <span>Total</span>
                  <span className="text-primary">${total.toFixed(0)} TT</span>
                </div>
              </div>
              <Button
                onClick={() => createPayment(false, paymentMethod)}
                disabled={loading}
                className="w-full h-12 text-base font-black"
                style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}
              >
                {loading ? "Submitting…" : `Confirm — $${total.toFixed(0)} TT`}
              </Button>
            </Card>
          );
        })()}

        {/* ── Overdue renew card ── */}
        {isOverdueRenew && !showRenewal && !pendingPayment && (
          <Card className="p-6 border-red-500">
            <h2 className="text-xl font-bold mb-3 text-red-500">Renew Your Subscription</h2>
            <p className="text-sm text-muted-foreground mb-4">Your subscription has expired. Renewing uses your existing plan.</p>
            <Button onClick={() => setShowRenewal(true)} variant="destructive" className="w-full h-12 font-bold">
              Pay Renewal Fee
            </Button>
          </Card>
        )}

        {/* ── Payment History ── */}
        <Card className="p-4">
          <h2 className="text-lg font-bold mb-3">Payment History</h2>
          {payments.length === 0 ? (
            <p className="text-muted-foreground text-center py-8 text-sm">No payments yet</p>
          ) : (
            <>
              <div className="space-y-2">
                {payments.map((payment) => {
                  const plan = plans.find(p => p.id === payment.plan_id);
                  return (
                    <div key={payment.id} className="rounded-xl border p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-sm truncate">{plan?.name ?? "Plan"}</p>
                          <p className="font-mono text-xs text-muted-foreground mt-0.5">{payment.reference_number}</p>
                          {payment.notes && (
                            <p className="text-xs text-primary mt-0.5">{payment.notes}</p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-black text-base">${payment.amount.toFixed(2)} TT</p>
                          <div className="flex items-center justify-end gap-1 mt-0.5">
                            {payment.status === "paid"     && <CheckCircle className="h-3.5 w-3.5 text-green-500" />}
                            {payment.status === "pending"  && <Clock       className="h-3.5 w-3.5 text-yellow-500" />}
                            {payment.status === "rejected" && <AlertCircle className="h-3.5 w-3.5 text-red-500" />}
                            <span className={`text-xs font-bold ${
                              payment.status === "paid"     ? "text-green-500" :
                              payment.status === "pending"  ? "text-yellow-500" : "text-red-500"
                            }`}>{payment.status.toUpperCase()}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground border-t pt-2">
                        <span>Submitted: {new Date(payment.created_at).toLocaleDateString("en-GB")}</span>
                        {payment.next_due_date && (
                          <span>Next due: {new Date(payment.next_due_date).toLocaleDateString("en-GB")}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {historyTotalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-3 border-t">
                  <Button variant="outline" size="sm" disabled={historyPage === 0}
                    onClick={() => setHistoryPage(p => p - 1)}>Previous</Button>
                  <span className="text-xs text-muted-foreground">{historyPage + 1} / {historyTotalPages}</span>
                  <Button variant="outline" size="sm" disabled={historyPage >= historyTotalPages - 1}
                    onClick={() => setHistoryPage(p => p + 1)}>Next</Button>
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function PaymentMethodCard({ title, onCancel, onCash, onBank, bankEnabled, loading }: {
  title: string; onCancel: () => void;
  onCash: () => void; onBank: () => void;
  bankEnabled: boolean; loading: boolean;
}) {
  return (
    <Card className="p-6 border-primary">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">{title}</h2>
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-5 rounded-xl border-2 border-border flex items-center justify-between gap-4">
          <div>
            <span className="text-2xl block mb-1">💵</span>
            <p className="font-bold">Cash Payment</p>
            <p className="text-xs text-muted-foreground mt-0.5">Pay cash directly to admin</p>
          </div>
          <button onClick={onCash} disabled={loading}
            className="shrink-0 h-9 px-4 rounded-xl font-black text-sm transition active:scale-95 disabled:opacity-50"
            style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}
          >
            Select
          </button>
        </div>
        {bankEnabled && (
          <div className="p-5 rounded-xl border-2 border-border flex items-center justify-between gap-4">
            <div>
              <span className="text-2xl block mb-1">🏦</span>
              <p className="font-bold">Bank Transfer</p>
              <p className="text-xs text-muted-foreground mt-0.5">Transfer to bank account</p>
            </div>
            <button onClick={onBank} disabled={loading}
              className="shrink-0 h-9 px-4 rounded-xl font-black text-sm transition active:scale-95 disabled:opacity-50"
              style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}
            >
              Select
            </button>
          </div>
        )}
      </div>
    </Card>
  );
}

function PendingCashCard({ payment, onCopy, onCancel, loading }: {
  payment: BillingPayment; onCopy: (s: string) => void;
  onCancel: () => void; loading: boolean;
}) {
  return (
    <Card className="p-6 border-yellow-500">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
        <Clock className="h-5 w-5 text-yellow-500" /> Awaiting Cash Payment Confirmation
      </h2>
      <div className="space-y-4">
        <div>
          <Label>Reference Number</Label>
          <div className="flex items-center gap-2 mt-1">
            <code className="flex-1 bg-muted px-3 py-2 rounded font-mono text-lg font-bold">{payment.reference_number}</code>
            <Button size="sm" variant="outline" onClick={() => onCopy(payment.reference_number)}><Copy className="h-4 w-4" /></Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Provide this reference when paying cash to admin</p>
        </div>
        <div>
          <Label>Amount to Pay</Label>
          <p className="text-2xl font-black text-primary mt-1">${payment.amount.toFixed(2)} TT</p>
          {payment.notes && <p className="text-xs text-primary mt-1">{payment.notes}</p>}
        </div>
        <div className="border-t pt-4">
          <p className="text-sm text-muted-foreground mb-4">💵 Pay cash directly to admin. Pending admin confirmation.</p>
          <Button variant="outline" onClick={onCancel} disabled={loading} className="w-full">Cancel Payment</Button>
        </div>
      </div>
    </Card>
  );
}

function PendingBankCard({ payment, bankDetails, onCopy, onCancel, loading }: {
  payment: BillingPayment; bankDetails: AdminBankDetails;
  onCopy: (s: string) => void; onCancel: () => void; loading: boolean;
}) {
  return (
    <Card className="p-6 border-yellow-500">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
        <Clock className="h-5 w-5 text-yellow-500" /> Awaiting Bank Transfer Confirmation
      </h2>
      <div className="space-y-4">
        <div>
          <Label>Reference Number</Label>
          <div className="flex items-center gap-2 mt-1">
            <code className="flex-1 bg-muted px-3 py-2 rounded font-mono text-lg font-bold">{payment.reference_number}</code>
            <Button size="sm" variant="outline" onClick={() => onCopy(payment.reference_number)}><Copy className="h-4 w-4" /></Button>
          </div>
        </div>
        <div>
          <Label>Amount to Pay</Label>
          <p className="text-2xl font-black text-primary mt-1">${payment.amount.toFixed(2)} TT</p>
          {payment.notes && <p className="text-xs text-primary mt-1">{payment.notes}</p>}
        </div>
        <div className="border-t pt-4 space-y-2 text-sm">
          <h3 className="font-bold mb-2">Bank Transfer Details</h3>
          {[
            { label: "Bank",           value: bankDetails.bank_name },
            { label: "Account Name",   value: bankDetails.account_name },
            { label: "Account Number", value: bankDetails.account_number },
            ...(bankDetails.branch     ? [{ label: "Branch", value: bankDetails.branch }]     : []),
            ...(bankDetails.swift_code ? [{ label: "SWIFT",  value: bankDetails.swift_code }] : []),
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between items-center gap-2">
              <span className="text-muted-foreground">{label}:</span>
              <div className="flex items-center gap-1">
                <span className="font-bold font-mono text-xs">{value}</span>
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => onCopy(value)}><Copy className="h-3 w-3" /></Button>
              </div>
            </div>
          ))}
          {bankDetails.instructions && (
            <div className="mt-3 p-3 bg-muted rounded text-sm">
              <p className="font-bold mb-1">Instructions:</p>
              <p className="whitespace-pre-wrap">{bankDetails.instructions}</p>
            </div>
          )}
        </div>
        <div className="border-t pt-4">
          <Button variant="outline" onClick={onCancel} disabled={loading} className="w-full">Cancel Payment</Button>
        </div>
      </div>
    </Card>
  );
}

