import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { CreditCard, CheckCircle, Clock, AlertCircle, Copy } from "lucide-react";
import type { BillingPlan, BillingPayment, AdminBankDetails } from "@/types/billing";

export default function BillingPage() {
  const { profile } = useAuth();
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [payments, setPayments] = useState<BillingPayment[]>([]);
  const [bankDetails, setBankDetails] = useState<AdminBankDetails | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "bank" | null>(null);
  const [bankTransferEnabled, setBankTransferEnabled] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadPlans();
    loadPayments();
    loadBankDetails();
    loadFeatureFlags();
  }, []);

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
    
    const { data, error } = await supabase
      .from("billing_payments")
      .select("*")
      .eq("owner_id", profile.id)
      .order("created_at", { ascending: false });
    
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
      // For renewal, use the last paid payment's plan
      const lastPaid = payments.find(p => p.status === "paid");
      if (!lastPaid) {
        toast.error("No previous payment found");
        setLoading(false);
        return;
      }
      plan = plans.find(p => p.id === lastPaid.plan_id);
    } else {
      plan = plans.find(p => p.id === selectedPlan);
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
    const dueDate = new Date();
    dueDate.setMonth(dueDate.getMonth() + plan.duration_months);
    
    // For renewals (2nd payment onwards), subtract one day
    if (isRenewal) {
      // Check if this is truly a renewal by counting previous paid payments
      const { data: previousPayments } = await supabase
        .from("billing_payments")
        .select("id")
        .eq("owner_id", profile.id)
        .eq("status", "paid");
      
      // If there's at least one paid payment, this is a renewal
      if (previousPayments && previousPayments.length > 0) {
        dueDate.setDate(dueDate.getDate() - 1);
      }
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
    loadPayments();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const pendingPayment = payments.find(p => p.status === "pending");
  const lastPaidPayment = payments.find(p => p.status === "paid");
  const hasActivePlan = profile?.billing_status === "active";
  const nextDueDate = profile?.subscription_end_date ? new Date(profile.subscription_end_date) : null;
  const isOverdue = nextDueDate && nextDueDate < new Date();

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
                </div>
                {/* Show Mark Paid button if no pending payment and has next due date */}
                {!pendingPayment && nextDueDate && (
                  <Button
                    onClick={() => createPayment(true)}
                    disabled={loading}
                    variant={isOverdue ? "destructive" : "default"}
                    className="font-bold"
                  >
                    {loading ? "Creating..." : isOverdue ? "Overdue - Mark Paid" : "Mark Paid"}
                  </Button>
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

        {/* Pending Payment Details */}
        {pendingPayment && bankDetails && (
          <Card className="p-6 border-yellow-500">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Clock className="h-5 w-5 text-yellow-500" />
              Awaiting Payment Confirmation
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
            </div>
          </Card>
        )}

        {/* Show Mark Paid button for overdue users who need to renew */}
        {!pendingPayment && profile?.status === "pending" && profile?.billing_status === "expired" && (
          <Card className="p-6 border-red-500">
            <h2 className="text-xl font-bold mb-4 text-red-500">Renew Your Subscription</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Your subscription has expired. Make your payment and click the button below to notify admin.
            </p>
            <Button
              onClick={() => createPayment(true)}
              disabled={loading}
              variant="destructive"
              className="w-full h-12 text-base font-bold"
            >
              {loading ? "Creating..." : "I've Made Payment - Notify Admin"}
            </Button>
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
                  {plans.map((plan) => (
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

            {/* Step 2: Choose Payment Method */}
            {selectedPlan && !paymentMethod && (
              <Card className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold">Choose Payment Method</h2>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedPlan(null)}>
                    Change Plan
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Cash Payment Option */}
                  <button
                    onClick={() => setPaymentMethod("cash")}
                    className="p-6 rounded-xl border-2 border-border hover:border-primary transition text-left"
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

                  {/* Bank Transfer Option - Enabled/Disabled based on feature flag */}
                  <button
                    onClick={() => bankTransferEnabled && setPaymentMethod("bank")}
                    disabled={!bankTransferEnabled}
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

            {/* Step 3: Confirm Payment */}
            {selectedPlan && paymentMethod === "cash" && (
              <Card className="p-6 border-green-500">
                <h2 className="text-xl font-bold mb-4 text-green-500">Confirm Cash Payment</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  You've selected to pay <span className="font-bold text-foreground">${plans.find(p => p.id === selectedPlan)?.amount.toFixed(2)} TT</span> in cash.
                  Click below to notify the admin that you'll be paying in cash.
                </p>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setPaymentMethod(null)}
                    className="flex-1"
                  >
                    Back
                  </Button>
                  <Button
                    onClick={() => createPayment(false, "cash")}
                    disabled={loading}
                    className="flex-1 h-12 text-base font-bold"
                  >
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
          )}
        </Card>
      </div>
    </div>
  );
}
