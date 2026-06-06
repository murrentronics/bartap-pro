import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { CreditCard, CheckCircle, Clock, AlertCircle, Copy, Music2, ArrowUpCircle } from "lucide-react";
import type { BillingPlan, BillingPayment, AdminBankDetails } from "@/types/billing";

export default function BillingPage() {
  const { profile } = useAuth();
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [payments, setPayments] = useState<BillingPayment[]>([]);
  const [bankDetails, setBankDetails] = useState<AdminBankDetails | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [musicAddon, setMusicAddon] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "bank" | null>(null);
  const [bankTransferEnabled, setBankTransferEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showRenewalPaymentMethod, setShowRenewalPaymentMethod] = useState(false);
  const [showUpgradePlan, setShowUpgradePlan] = useState(false);
  const [showMusicUpgrade, setShowMusicUpgrade] = useState(false);
  const [upgradeMethod, setUpgradeMethod] = useState<"cash" | "bank" | null>(null);
  const [selectedUpgradePlan, setSelectedUpgradePlan] = useState<string | null>(null);
  const [historyPage, setHistoryPage] = useState(0);
  const [historyTotal, setHistoryTotal] = useState(0);

  const HISTORY_PAGE_SIZE = 100;
  const historyTotalPages = Math.max(1, Math.ceil(historyTotal / HISTORY_PAGE_SIZE));

  useEffect(() => {
    loadPlans();
    loadPayments();
    loadBankDetails();
    loadFeatureFlags();
  }, []);

  useEffect(() => {
    if (profile?.id) loadPayments();
  }, [historyPage]);

  const loadFeatureFlags = async () => {
    const { data } = await supabase
      .from("feature_flags")
      .select("enabled")
      .eq("flag_name", "bank_transfer_enabled")
      .single();
    
    if (data) {
      setBankTransferEnabled(data.enabled);
    }
  };

  const loadPlans = async () => {
    const { data, error } = await supabase
      .from("billing_plans")
      .select("*")
      .order("duration_months");
    
    if (error) {
      toast.error("Failed to load plans");
      return;
    }
    setPlans(data || []);
  };

  const loadPayments = async () => {
    if (!profile?.id) return;
    
    // Get total count
    const { count } = await supabase
      .from("billing_payments")
      .select("*", { count: "exact", head: true })
      .eq("owner_id", profile.id);
    
    setHistoryTotal(count || 0);

    const { data, error } = await supabase
      .from("billing_payments")
      .select("*")
      .eq("owner_id", profile.id)
      .order("created_at", { ascending: false })
      .range(historyPage * HISTORY_PAGE_SIZE, (historyPage + 1) * HISTORY_PAGE_SIZE - 1);
    
    if (error) {
      toast.error("Failed to load payments");
      return;
    }
    setPayments(data || []);
  };

  const loadBankDetails = async () => {
    const { data, error } = await supabase
      .from("admin_bank_details")
      .select("*")
      .eq("is_active", true)
      .single();
    
    if (!error && data) {
      setBankDetails(data);
    }
  };

  const createPayment = async (isRenewal = false, method: "cash" | "bank" = "cash") => {
    if (!isRenewal && !selectedPlan) return;
    if (!profile?.id) return;
    
    setLoading(true);
    
    let plan: BillingPlan | undefined;
    
    if (isRenewal) {
      const lastPaid = payments.find(p => p.status === "paid");
      if (!lastPaid) {
        toast.error("No previous payment found");
        setLoading(false);
        return;
      }
      plan = plans.find(p => p.id === lastPaid.plan_id);
    } else {
      const basePlan = plans.find(p => p.id === selectedPlan);
      if (musicAddon) {
        // Swap to the music addon plan with matching duration — it's the all-inclusive price
        plan = musicAddonPlans.find(p => p.duration_months === basePlan?.duration_months);
      } else {
        plan = basePlan;
      }
    }
    
    if (!plan) {
      setLoading(false);
      return;
    }

    // Generate reference number
    const { data: refData, error: refError } = await supabase
      .rpc("generate_payment_reference");
    
    if (refError) {
      toast.error("Failed to generate reference");
      setLoading(false);
      return;
    }

    // Calculate due date
    let dueDate: Date;
    
    if (isRenewal && profile.subscription_end_date) {
      // For renewals, use the existing subscription end date and add duration
      dueDate = new Date(profile.subscription_end_date);
      dueDate.setMonth(dueDate.getMonth() + plan.duration_months);
    } else {
      // For first payment, calculate from today
      dueDate = new Date();
      dueDate.setMonth(dueDate.getMonth() + plan.duration_months);
    }

    const { error } = await supabase
      .from("billing_payments")
      .insert({
        owner_id: profile.id,
        plan_id: plan.id,
        reference_number: refData,
        amount: plan.amount,
        due_date: dueDate.toISOString(),
        status: "pending",
        payment_method: method
      });

    setLoading(false);

    if (error) {
      toast.error("Failed to create payment");
      return;
    }

    toast.success(method === "cash" ? "Cash payment pending - awaiting admin confirmation" : "Bank transfer pending - awaiting admin confirmation");
    setPaymentMethod(null);
    setMusicAddon(false);
    loadPayments();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const cancelPendingPayment = async () => {
    if (!pendingPayment) return;
    
    setLoading(true);
    const { error } = await supabase
      .from("billing_payments")
      .delete()
      .eq("id", pendingPayment.id)
      .eq("status", "pending"); // Extra safety check
    
    if (error) {
      setLoading(false);
      toast.error("Failed to cancel payment");
      return;
    }
    
    toast.success("Payment cancelled");
    
    // Reload payments and wait for it to complete
    await loadPayments();
    
    // Reset any payment method selection states
    setPaymentMethod(null);
    setShowRenewalPaymentMethod(false);
    setSelectedPlan(null);
    
    setLoading(false);
  };

  const pendingPayment = payments.find(p => p.status === "pending");
  const lastPaidPayment = payments.find(p => p.status === "paid");
  const hasActivePlan = profile?.billing_status === "active";
  const nextDueDate = profile?.subscription_end_date ? new Date(profile.subscription_end_date) : null;
  const isOverdue = nextDueDate && nextDueDate < new Date();
  const daysUntilDue = nextDueDate ? Math.ceil((nextDueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
  const canPayFee = !!isOverdue || (daysUntilDue !== null && daysUntilDue <= 7);

  // Separate base plans from music addon plans
  const basePlans = plans.filter(p => !p.name.toLowerCase().includes("music"));
  const musicAddonPlans = plans.filter(p => p.name.toLowerCase().includes("music addon"));
  const musicUpgradePlans = plans.filter(p => p.name.toLowerCase().includes("music upgrade"));
  const annualBasePlan = basePlans.find(p => p.duration_months === 12);

  // Determine current active plan duration from last paid payment
  const currentPlanDuration = lastPaidPayment
    ? plans.find(p => p.id === lastPaidPayment.plan_id)?.duration_months ?? null
    : null;
  const hasMusicAddon = !!(profile as any)?.music_addon;
  const isOnAnnual = currentPlanDuration === 12;
  const isOnSixMonth = currentPlanDuration === 6;

  // Music upgrade cost depends on current plan
  const musicUpgradePlan = isOnAnnual
    ? musicUpgradePlans.find(p => p.duration_months === 12)
    : musicUpgradePlans.find(p => p.duration_months === 6);

  const createUpgradePayment = async (upgradePlan: BillingPlan, method: "cash" | "bank", removeMusic = false) => {
    if (!profile?.id) return;
    setLoading(true);

    const { data: refData, error: refError } = await supabase.rpc("generate_payment_reference");
    if (refError) { toast.error("Failed to generate reference"); setLoading(false); return; }

    const dueDate = new Date();
    dueDate.setMonth(dueDate.getMonth() + upgradePlan.duration_months);

    const { error } = await supabase.from("billing_payments").insert({
      owner_id: profile.id,
      plan_id: upgradePlan.id,
      reference_number: refData,
      amount: upgradePlan.amount,
      due_date: dueDate.toISOString(),
      status: "pending",
      payment_method: method,
      notes: removeMusic ? "remove_music_addon" : null,
    });

    setLoading(false);
    if (error) { toast.error("Failed to create payment"); return; }

    toast.success("Upgrade payment pending — awaiting admin confirmation");
    setShowMusicUpgrade(false);
    setShowUpgradePlan(false);
    setUpgradeMethod(null);
    setSelectedUpgradePlan(null);
    loadPayments();
  };

  return (
    <div className="min-h-screen p-6 pb-24">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3 mb-6">
          <CreditCard className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-black">Billing</h1>
        </div>

        {/* Current Status */}
        <Card className="p-6">
          <h2 className="text-xl font-bold mb-4">Subscription Status</h2>
          <div className="flex items-center gap-3">
            {profile?.status === "pending" && profile?.billing_status === "expired" ? (
              <>
                <AlertCircle className="h-6 w-6 text-red-500" />
                <div>
                  <p className="font-bold text-red-500">Payment Overdue</p>
                  <p className="text-sm text-muted-foreground">
                    Your subscription has expired. Click "Mark Paid" below after making payment to restore access.
                  </p>
                </div>
              </>
            ) : profile?.status === "pending" ? (
              <>
                <AlertCircle className="h-6 w-6 text-yellow-500" />
                <div>
                  <p className="font-bold text-yellow-500">Pending Admin Approval</p>
                  <p className="text-sm text-muted-foreground">
                    Your account is awaiting admin approval. Choose a plan below to get started.
                  </p>
                </div>
              </>
            ) : hasActivePlan ? (
              <>
                <CheckCircle className="h-6 w-6 text-green-500" />
                <div className="flex-1">
                  <p className="font-bold text-green-500">Active</p>
                  <p className="text-sm text-muted-foreground">
                    Next payment due: {nextDueDate ? nextDueDate.toLocaleDateString() : "N/A"}
                  </p>
                  {hasMusicAddon && (
                    <p className="text-xs text-primary mt-0.5 flex items-center gap-1">
                      <Music2 className="h-3 w-3" /> Music Player included
                    </p>
                  )}
                </div>
                {!pendingPayment && !showRenewalPaymentMethod && !showMusicUpgrade && !showUpgradePlan && (
                  <div className="flex flex-col items-end gap-2">
                    {/* Pay Fee — only when close to due or overdue */}
                    {nextDueDate && (
                      <Button
                        onClick={() => setShowRenewalPaymentMethod(true)}
                        disabled={loading || !canPayFee}
                        variant={isOverdue ? "destructive" : "default"}
                        size="sm"
                        className="font-bold"
                      >
                        {isOverdue ? "Overdue - Pay Fee" : "Pay Fee"}
                      </Button>
                    )}
                    {/* Upgrade plan — only when canPayFee */}
                    {canPayFee && isOnSixMonth && annualBasePlan && (
                      <Button
                        onClick={() => setShowUpgradePlan(true)}
                        disabled={loading}
                        variant="outline"
                        size="sm"
                        className="font-bold gap-1"
                      >
                        <ArrowUpCircle className="h-3.5 w-3.5" /> Upgrade to Annual
                      </Button>
                    )}
                    {/* Music addon upgrade — always available for non-music subscribers */}
                    {!hasMusicAddon && musicUpgradePlan && (
                      <Button
                        onClick={() => setShowMusicUpgrade(true)}
                        disabled={loading}
                        variant="outline"
                        size="sm"
                        className="font-bold gap-1"
                      >
                        <Music2 className="h-3.5 w-3.5" /> Add Music — ${musicUpgradePlan.amount.toFixed(0)} TT
                      </Button>
                    )}
                    {!canPayFee && daysUntilDue !== null && daysUntilDue > 7 && (
                      <p className="text-xs text-muted-foreground text-right">
                        Pay Fee available in {daysUntilDue - 7}d
                      </p>
                    )}
                  </div>
                )}
              </>
            ) : (
              <>
                <AlertCircle className="h-6 w-6 text-yellow-500" />
                <div>
                  <p className="font-bold text-yellow-500">Pending Setup</p>
                  <p className="text-sm text-muted-foreground">Choose a plan to get started</p>
                </div>
              </>
            )}
          </div>
        </Card>

        {/* Pending Payment Details - Cash */}
        {pendingPayment && pendingPayment.payment_method === "cash" && (
          <Card className="p-6 border-yellow-500">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Clock className="h-5 w-5 text-yellow-500" />
              Awaiting Cash Payment Confirmation
            </h2>
            
            <div className="space-y-4">
              <div>
                <Label>Reference Number</Label>
                <div className="flex items-center gap-2 mt-1">
                  <code className="flex-1 bg-muted px-3 py-2 rounded font-mono text-lg font-bold">
                    {pendingPayment.reference_number}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyToClipboard(pendingPayment.reference_number)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Provide this reference when paying cash to admin
                </p>
              </div>

              <div>
                <Label>Amount to Pay</Label>
                <p className="text-2xl font-black text-primary mt-1">
                  ${pendingPayment.amount.toFixed(2)} TT
                </p>
              </div>

              <div className="border-t pt-4">
                <p className="text-sm text-muted-foreground mb-4">
                  💵 Pay cash directly to admin. Your payment is pending admin confirmation.
                </p>
                <Button
                  variant="outline"
                  onClick={cancelPendingPayment}
                  disabled={loading}
                  className="w-full"
                >
                  Cancel Payment
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* Pending Payment Details - Bank Transfer */}
        {pendingPayment && pendingPayment.payment_method === "bank" && bankDetails && (
          <Card className="p-6 border-yellow-500">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Clock className="h-5 w-5 text-yellow-500" />
              Awaiting Bank Transfer Confirmation
            </h2>
            
            <div className="space-y-4">
              <div>
                <Label>Reference Number</Label>
                <div className="flex items-center gap-2 mt-1">
                  <code className="flex-1 bg-muted px-3 py-2 rounded font-mono text-lg font-bold">
                    {pendingPayment.reference_number}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyToClipboard(pendingPayment.reference_number)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Use this reference when making your bank transfer
                </p>
              </div>

              <div>
                <Label>Amount to Pay</Label>
                <p className="text-2xl font-black text-primary mt-1">
                  ${pendingPayment.amount.toFixed(2)} TT
                </p>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-bold mb-3">Bank Transfer Details</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-muted-foreground">Bank:</span>
                    <div className="flex items-center gap-2">
                      <span className="font-bold">{bankDetails.bank_name}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0"
                        onClick={() => copyToClipboard(bankDetails.bank_name)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-muted-foreground">Account Name:</span>
                    <div className="flex items-center gap-2">
                      <span className="font-bold">{bankDetails.account_name}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0"
                        onClick={() => copyToClipboard(bankDetails.account_name)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-muted-foreground">Account Number:</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold">{bankDetails.account_number}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0"
                        onClick={() => copyToClipboard(bankDetails.account_number)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  {bankDetails.branch && (
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-muted-foreground">Branch:</span>
                      <div className="flex items-center gap-2">
                        <span className="font-bold">{bankDetails.branch}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0"
                          onClick={() => copyToClipboard(bankDetails.branch)}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  )}
                  {bankDetails.swift_code && (
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-muted-foreground">SWIFT:</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold">{bankDetails.swift_code}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0"
                          onClick={() => copyToClipboard(bankDetails.swift_code)}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
                {bankDetails.instructions && (
                  <div className="mt-4 p-3 bg-muted rounded text-sm">
                    <p className="font-bold mb-1">Instructions:</p>
                    <p className="whitespace-pre-wrap">{bankDetails.instructions}</p>
                  </div>
                )}
              </div>
              
              <div className="border-t pt-4">
                <Button
                  variant="outline"
                  onClick={cancelPendingPayment}
                  disabled={loading}
                  className="w-full"
                >
                  Cancel Payment
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* Renewal Payment Method Selection */}
        {showRenewalPaymentMethod && !pendingPayment && (
          <Card className="p-6 border-primary">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">Choose Payment Method</h2>
              <Button variant="ghost" size="sm" onClick={() => setShowRenewalPaymentMethod(false)}>
                Cancel
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Cash Payment Option */}
              <button
                onClick={() => {
                  createPayment(true, "cash");
                  setShowRenewalPaymentMethod(false);
                }}
                disabled={loading}
                className="p-6 rounded-xl border-2 border-border hover:border-primary transition text-left disabled:opacity-50"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-12 w-12 rounded-full bg-green-500/20 flex items-center justify-center">
                    <span className="text-2xl">💵</span>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold">Cash Payment</h3>
                    <p className="text-xs text-green-500">Instant submission</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Pay cash directly to admin. Your payment will be marked as pending immediately.
                </p>
              </button>

              {/* Bank Transfer Option */}
              <button
                onClick={() => {
                  if (bankTransferEnabled) {
                    createPayment(true, "bank");
                    setShowRenewalPaymentMethod(false);
                  }
                }}
                disabled={!bankTransferEnabled || loading}
                className={`p-6 rounded-xl border-2 text-left transition ${
                  bankTransferEnabled 
                    ? "border-border hover:border-primary cursor-pointer" 
                    : "border-border bg-muted/30 opacity-50 cursor-not-allowed"
                }`}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-12 w-12 rounded-full bg-blue-500/20 flex items-center justify-center">
                    <span className="text-2xl">🏦</span>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold">Bank Transfer</h3>
                    <p className="text-xs text-muted-foreground">
                      {bankTransferEnabled ? "Transfer to bank account" : "Coming soon"}
                    </p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  {bankTransferEnabled 
                    ? "Transfer to admin's bank account with reference number." 
                    : "Transfer to admin's bank account. Currently unavailable."}
                </p>
              </button>
            </div>
          </Card>
        )}

        {/* Show payment method selection for overdue users who need to renew */}
        {!pendingPayment && profile?.status === "pending" && profile?.billing_status === "expired" && !showRenewalPaymentMethod && (
          <Card className="p-6 border-red-500">
            <h2 className="text-xl font-bold mb-4 text-red-500">Renew Your Subscription</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Your subscription has expired. Choose how you want to pay.
            </p>
            <Button
              onClick={() => setShowRenewalPaymentMethod(true)}
              disabled={loading}
              variant="destructive"
              className="w-full h-12 text-base font-bold"
            >
              Pay Fee
            </Button>
          </Card>
        )}

        {/* ── Music Upgrade Card — active users without music ──────────── */}
        {showMusicUpgrade && !pendingPayment && hasActivePlan && !hasMusicAddon && musicUpgradePlan && (
          <Card className="p-6 border-primary">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Music2 className="h-5 w-5 text-primary" /> Add Music Player
              </h2>
              <button onClick={() => { setShowMusicUpgrade(false); setUpgradeMethod(null); }}
                className="text-sm text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Unlock the in-app music player with YouTube search and local file support.
            </p>
            <div className="flex items-center justify-between mb-5 p-3 rounded-xl bg-primary/10 border border-primary/30">
              <span className="font-bold">Music Player Add-on</span>
              <span className="text-xl font-black text-primary">${musicUpgradePlan.amount.toFixed(2)} TT</span>
            </div>
            {!upgradeMethod ? (
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setUpgradeMethod("cash")}
                  className="p-4 rounded-xl border-2 border-border hover:border-primary transition text-left">
                  <span className="text-2xl block mb-1">💵</span>
                  <p className="font-bold text-sm">Cash</p>
                  <p className="text-xs text-muted-foreground">Pay admin directly</p>
                </button>
                <button onClick={() => bankTransferEnabled && setUpgradeMethod("bank")}
                  disabled={!bankTransferEnabled}
                  className={`p-4 rounded-xl border-2 text-left transition ${bankTransferEnabled ? "border-border hover:border-primary" : "border-border opacity-50 cursor-not-allowed"}`}>
                  <span className="text-2xl block mb-1">🏦</span>
                  <p className="font-bold text-sm">Bank Transfer</p>
                  <p className="text-xs text-muted-foreground">{bankTransferEnabled ? "Transfer to bank" : "Coming soon"}</p>
                </button>
              </div>
            ) : (
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setUpgradeMethod(null)} className="flex-1">Back</Button>
                <Button onClick={() => createUpgradePayment(musicUpgradePlan, upgradeMethod)} disabled={loading} className="flex-1 font-bold">
                  {loading ? "Submitting..." : `Confirm ${upgradeMethod === "cash" ? "Cash" : "Bank"} Payment`}
                </Button>
              </div>
            )}
          </Card>
        )}

        {/* ── Plan Upgrade Card — 6mo → annual, only when canPayFee ────── */}
        {showUpgradePlan && !pendingPayment && hasActivePlan && isOnSixMonth && annualBasePlan && (
          <Card className="p-6 border-primary">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <ArrowUpCircle className="h-5 w-5 text-primary" /> Upgrade to Annual
              </h2>
              <button onClick={() => { setShowUpgradePlan(false); setUpgradeMethod(null); setSelectedUpgradePlan(null); }}
                className="text-sm text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Switch to the annual plan. Your new subscription runs from today for 12 months.
            </p>

            {/* Pick annual plan variant */}
            {!selectedUpgradePlan && (() => {
              const annualMusic = musicAddonPlans.find(p => p.duration_months === 12);
              return (
                <div className="grid grid-cols-1 gap-3 mb-2">
                  <button
                    onClick={() => setSelectedUpgradePlan(annualBasePlan.id)}
                    className="p-4 rounded-xl border-2 border-border hover:border-primary transition text-left"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-bold">Annual Plan</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Bar POS only · 12 months</p>
                      </div>
                      <span className="text-xl font-black text-primary">${annualBasePlan.amount.toFixed(2)} TT</span>
                    </div>
                  </button>
                  {annualMusic && (
                    <button
                      onClick={() => setSelectedUpgradePlan(annualMusic.id)}
                      className="p-4 rounded-xl border-2 border-border hover:border-primary transition text-left"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-bold flex items-center gap-1">Annual + Music <Music2 className="h-3.5 w-3.5 text-primary" /></p>
                          <p className="text-xs text-muted-foreground mt-0.5">Includes music player · 12 months</p>
                        </div>
                        <span className="text-xl font-black text-primary">${annualMusic.amount.toFixed(2)} TT</span>
                      </div>
                    </button>
                  )}
                </div>
              );
            })()}

            {selectedUpgradePlan && (() => {
              const chosenPlan = plans.find(p => p.id === selectedUpgradePlan)!;
              return (
                <>
                  <div className="flex items-center justify-between mb-4 p-3 rounded-xl bg-primary/10 border border-primary/30">
                    <span className="font-bold">{chosenPlan.name}</span>
                    <span className="text-xl font-black text-primary">${chosenPlan.amount.toFixed(2)} TT</span>
                  </div>
                  {!upgradeMethod ? (
                    <div className="grid grid-cols-2 gap-3">
                      <button onClick={() => setUpgradeMethod("cash")}
                        className="p-4 rounded-xl border-2 border-border hover:border-primary transition text-left">
                        <span className="text-2xl block mb-1">💵</span>
                        <p className="font-bold text-sm">Cash</p>
                        <p className="text-xs text-muted-foreground">Pay admin directly</p>
                      </button>
                      <button onClick={() => bankTransferEnabled && setUpgradeMethod("bank")}
                        disabled={!bankTransferEnabled}
                        className={`p-4 rounded-xl border-2 text-left transition ${bankTransferEnabled ? "border-border hover:border-primary" : "border-border opacity-50 cursor-not-allowed"}`}>
                        <span className="text-2xl block mb-1">🏦</span>
                        <p className="font-bold text-sm">Bank Transfer</p>
                        <p className="text-xs text-muted-foreground">{bankTransferEnabled ? "Transfer to bank" : "Coming soon"}</p>
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-3">
                      <Button variant="outline" onClick={() => setUpgradeMethod(null)} className="flex-1">Back</Button>
                      <Button onClick={() => createUpgradePayment(chosenPlan, upgradeMethod, !chosenPlan.name.toLowerCase().includes("music"))} disabled={loading} className="flex-1 font-bold">
                        {loading ? "Submitting..." : `Confirm ${upgradeMethod === "cash" ? "Cash" : "Bank"} Payment`}
                      </Button>
                    </div>
                  )}
                </>
              );
            })()}
          </Card>
        )}

        {/* Choose Plan - only show for new pending users, not overdue */}
        {!pendingPayment && profile?.status === "pending" && profile?.billing_status !== "expired" && (
          <>
            {/* Step 1: Choose Plan */}
            {!selectedPlan && (
              <Card className="p-6">
                <h2 className="text-xl font-bold mb-4">Choose Your Plan</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {basePlans.map((plan) => (
                    <button
                      key={plan.id}
                      onClick={() => setSelectedPlan(plan.id)}
                      className="p-6 rounded-xl border-2 border-border hover:border-primary/50 transition text-left"
                    >
                      <h3 className="text-lg font-bold mb-2">{plan.name}</h3>
                      <p className="text-3xl font-black text-primary mb-2">
                        ${plan.amount.toFixed(2)} <span className="text-sm font-normal text-muted-foreground">{plan.currency}</span>
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Billed every {plan.duration_months} months
                      </p>
                    </button>
                  ))}
                </div>
              </Card>
            )}

            {/* Step 1b: Music Addon toggle — shown after base plan is picked */}
            {selectedPlan && !paymentMethod && (() => {
              const base = basePlans.find(p => p.id === selectedPlan)!;
              const addon = musicAddonPlans.find(p => p.duration_months === base?.duration_months);
              return (
                <Card className="p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-bold">Add-ons</h2>
                    <button onClick={() => { setSelectedPlan(null); setMusicAddon(false); }}
                      className="text-sm text-muted-foreground hover:text-foreground">
                      ← Change plan
                    </button>
                  </div>

                  {/* Music addon toggle */}
                  {addon && (
                    <button
                      onClick={() => setMusicAddon(v => !v)}
                      className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition text-left ${
                        musicAddon ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"
                      }`}
                    >
                      <div className={`h-12 w-12 rounded-xl flex items-center justify-center shrink-0 ${
                        musicAddon ? "bg-primary" : "bg-muted"
                      }`}>
                        <span className="text-2xl">🎵</span>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-bold">Music Player Add-on</p>
                          {musicAddon && <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full font-bold">Added</span>}
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          In-app music player with YouTube & local file support
                        </p>
                        <p className="text-primary font-black mt-1">
                          {addon.duration_months === 12 ? "Annual plan with music: " : "6-month plan with music: "}
                          ${addon.amount.toFixed(2)} TT
                        </p>
                      </div>
                      <div className={`h-6 w-6 rounded-full border-2 flex items-center justify-center shrink-0 ${
                        musicAddon ? "bg-primary border-primary" : "border-muted-foreground"
                      }`}>
                        {musicAddon && <span className="text-primary-foreground text-xs font-black">✓</span>}
                      </div>
                    </button>
                  )}

                  {/* Total */}
                  <div className="flex items-center justify-between pt-2 border-t">
                    <span className="text-muted-foreground font-semibold">Total</span>
                    <span className="text-2xl font-black text-primary">
                      ${(musicAddon && addon ? addon.amount : base?.amount ?? 0).toFixed(2)} TT
                    </span>
                  </div>

                  {/* Continue to payment method */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                    <button
                      onClick={() => setPaymentMethod("cash")}
                      className="p-5 rounded-xl border-2 border-border hover:border-primary transition text-left"
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-2xl">💵</span>
                        <div>
                          <p className="font-bold">Cash Payment</p>
                          <p className="text-xs text-green-500">Instant submission</p>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">Pay cash directly to admin</p>
                    </button>

                    <button
                      onClick={() => bankTransferEnabled && setPaymentMethod("bank")}
                      disabled={!bankTransferEnabled}
                      className={`p-5 rounded-xl border-2 text-left transition ${
                        bankTransferEnabled ? "border-border hover:border-primary cursor-pointer" : "border-border bg-muted/30 opacity-50 cursor-not-allowed"
                      }`}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-2xl">🏦</span>
                        <div>
                          <p className="font-bold">Bank Transfer</p>
                          <p className="text-xs text-muted-foreground">{bankTransferEnabled ? "Transfer to bank account" : "Coming soon"}</p>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">{bankTransferEnabled ? "Transfer with reference number" : "Currently unavailable"}</p>
                    </button>
                  </div>
                </Card>
              );
            })()}

            {/* Step 3: Confirm Payment */}
            {selectedPlan && paymentMethod === "cash" && (
              <Card className="p-6 border-green-500">
                <h2 className="text-xl font-bold mb-4 text-green-500">Confirm Cash Payment</h2>
                {(() => {
                  const base = basePlans.find(p => p.id === selectedPlan);
                  const finalPlan = musicAddon
                    ? musicAddonPlans.find(p => p.duration_months === base?.duration_months)
                    : base;
                  return (
                    <div className="space-y-3 mb-4">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{finalPlan?.name}</span>
                        <span className="font-bold">${finalPlan?.amount.toFixed(2)} TT</span>
                      </div>
                      {musicAddon && (
                        <div className="flex items-center gap-2 text-xs text-primary">
                          <span>🎵</span>
                          <span>Music Player included</span>
                        </div>
                      )}
                      <div className="flex justify-between border-t pt-2">
                        <span className="font-bold">Total</span>
                        <span className="text-xl font-black text-primary">${finalPlan?.amount.toFixed(2)} TT</span>
                      </div>
                    </div>
                  );
                })()}
                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setPaymentMethod(null)} className="flex-1">Back</Button>
                  <Button onClick={() => createPayment(false, "cash")} disabled={loading} className="flex-1 h-12 text-base font-bold">
                    {loading ? "Submitting..." : "Confirm Cash Payment"}
                  </Button>
                </div>
              </Card>
            )}
          </>
        )}

        {/* Payment History */}
        <Card className="p-6">
          <h2 className="text-xl font-bold mb-4">Payment History</h2>
          {payments.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No payments yet</p>
          ) : (
            <>
              <div className="space-y-3">
                {payments.map((payment) => (
                  <div
                    key={payment.id}
                    className="flex items-center justify-between p-4 rounded-lg border"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-sm font-bold">{payment.reference_number}</span>
                        {payment.status === "paid" && <CheckCircle className="h-4 w-4 text-green-500" />}
                        {payment.status === "pending" && <Clock className="h-4 w-4 text-yellow-500" />}
                        {payment.status === "rejected" && <AlertCircle className="h-4 w-4 text-red-500" />}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {new Date(payment.created_at).toLocaleDateString()}
                      </p>
                      {payment.next_due_date && (
                        <p className="text-xs text-muted-foreground">
                          Next due: {new Date(payment.next_due_date).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="font-bold">${payment.amount.toFixed(2)} TT</p>
                      <p className={`text-sm font-bold ${
                        payment.status === "paid" ? "text-green-500" :
                        payment.status === "pending" ? "text-yellow-500" :
                        "text-red-500"
                      }`}>
                        {payment.status.toUpperCase()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {historyTotalPages > 1 && (
                <div className="flex items-center justify-between mt-6 pt-4 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={historyPage === 0}
                    onClick={() => setHistoryPage(p => p - 1)}
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Page {historyPage + 1} of {historyTotalPages} · {historyTotal} total
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={historyPage >= historyTotalPages - 1}
                    onClick={() => setHistoryPage(p => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
