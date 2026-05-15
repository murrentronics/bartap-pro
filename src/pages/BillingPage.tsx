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
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadPlans();
    loadPayments();
    loadBankDetails();
  }, []);

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

  const createPayment = async () => {
    if (!selectedPlan || !profile?.id) return;
    
    setLoading(true);
    const plan = plans.find(p => p.id === selectedPlan);
    if (!plan) return;

    // Generate reference number
    const { data: refData, error: refError } = await supabase
      .rpc("generate_payment_reference");
    
    if (refError) {
      toast.error("Failed to generate reference");
      setLoading(false);
      return;
    }

    const dueDate = new Date();
    dueDate.setMonth(dueDate.getMonth() + plan.duration_months);

    const { error } = await supabase
      .from("billing_payments")
      .insert({
        owner_id: profile.id,
        plan_id: plan.id,
        reference_number: refData,
        amount: plan.amount,
        due_date: dueDate.toISOString(),
        status: "pending"
      });

    setLoading(false);

    if (error) {
      toast.error("Failed to create payment");
      return;
    }

    toast.success("Payment request created");
    loadPayments();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const pendingPayment = payments.find(p => p.status === "pending");
  const hasActivePlan = profile?.billing_status === "active";

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
            {profile?.status === "pending" ? (
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
                <div>
                  <p className="font-bold text-green-500">Active</p>
                  <p className="text-sm text-muted-foreground">
                    Expires: {profile.subscription_end_date ? new Date(profile.subscription_end_date).toLocaleDateString() : "N/A"}
                  </p>
                </div>
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
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Bank:</span>
                    <span className="font-bold">{bankDetails.bank_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Account Name:</span>
                    <span className="font-bold">{bankDetails.account_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Account Number:</span>
                    <span className="font-mono font-bold">{bankDetails.account_number}</span>
                  </div>
                  {bankDetails.branch && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Branch:</span>
                      <span className="font-bold">{bankDetails.branch}</span>
                    </div>
                  )}
                  {bankDetails.swift_code && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">SWIFT:</span>
                      <span className="font-mono font-bold">{bankDetails.swift_code}</span>
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

        {/* Choose Plan */}
        {!pendingPayment && (
          <Card className="p-6">
            <h2 className="text-xl font-bold mb-4">Choose Your Plan</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {plans.map((plan) => (
                <button
                  key={plan.id}
                  onClick={() => setSelectedPlan(plan.id)}
                  className={`p-6 rounded-xl border-2 transition text-left ${
                    selectedPlan === plan.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
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
            <Button
              onClick={createPayment}
              disabled={!selectedPlan || loading}
              className="w-full h-12 text-base font-bold"
            >
              {loading ? "Creating..." : "Continue to Payment"}
            </Button>
          </Card>
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
