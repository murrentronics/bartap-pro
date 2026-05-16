import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { CheckCircle, XCircle, Clock, Search, DollarSign } from "lucide-react";
import type { BillingPayment } from "@/types/billing";

type PaymentWithOwner = BillingPayment & {
  profiles: { username: string } | null;
};

export default function AdminBillingManagementPage() {
  const { profile } = useAuth();
  const [payments, setPayments] = useState<PaymentWithOwner[]>([]);
  const [filteredPayments, setFilteredPayments] = useState<PaymentWithOwner[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPayment, setSelectedPayment] = useState<PaymentWithOwner | null>(null);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"pending" | "paid" | "rejected">("pending");

  useEffect(() => {
    if (profile?.role === "admin") {
      loadPayments();
    }
  }, [profile]);

  useEffect(() => {
    filterPayments();
  }, [payments, searchTerm, filter]);

  const loadPayments = async () => {
    // First check if we're admin
    if (!profile?.id || profile.role !== 'admin') {
      toast.error("Admin access required");
      return;
    }

    const { data, error } = await supabase
      .from("billing_payments")
      .select(`
        *,
        profiles:owner_id (username)
      `)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to load payments:", error);
      toast.error(`Failed to load payments: ${error.message}`);
      return;
    }

    setPayments(data || []);
  };

  const filterPayments = () => {
    let filtered = payments.filter(p => p.status === filter);

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(p =>
        p.reference_number.toLowerCase().includes(term) ||
        p.profiles?.username.toLowerCase().includes(term)
      );
    }

    setFilteredPayments(filtered);
  };

  const updatePaymentStatus = async (status: "paid" | "rejected") => {
    if (!selectedPayment || !profile?.id) return;

    setLoading(true);

    const updates: any = {
      status,
      notes: notes || null,
      approved_by: profile.id,
      approved_at: new Date().toISOString(),
    };

    if (status === "paid") {
      updates.payment_date = new Date().toISOString();
      
      // Also update the owner's profile status to approved and set subscription dates
      const { data: plan } = await supabase
        .from("billing_plans")
        .select("duration_months")
        .eq("id", selectedPayment.plan_id)
        .single();
      
      if (plan) {
        // Get owner's current subscription end date
        const { data: ownerProfile } = await supabase
          .from("profiles")
          .select("subscription_end_date")
          .eq("id", selectedPayment.owner_id)
          .single();
        
        const startDate = new Date();
        let endDate: Date;
        
        // If owner has an existing subscription_end_date, use it as the base
        if (ownerProfile?.subscription_end_date) {
          endDate = new Date(ownerProfile.subscription_end_date);
          // Add the plan duration to the existing end date
          endDate.setMonth(endDate.getMonth() + plan.duration_months);
        } else {
          // First payment - calculate from today
          endDate = new Date();
          endDate.setMonth(endDate.getMonth() + plan.duration_months);
        }
        
        await supabase
          .from("profiles")
          .update({
            status: "approved",
            billing_status: "active",
            subscription_start_date: startDate.toISOString(),
            subscription_end_date: endDate.toISOString(),
          })
          .eq("id", selectedPayment.owner_id);
        
        // Set next due date in payment record
        updates.next_due_date = endDate.toISOString();
      }
    } else if (status === "rejected") {
      // Set owner status to suspended when payment is rejected
      await supabase
        .from("profiles")
        .update({ status: "suspended" })
        .eq("id", selectedPayment.owner_id);
    }

    const { error } = await supabase
      .from("billing_payments")
      .update(updates)
      .eq("id", selectedPayment.id);

    setLoading(false);

    if (error) {
      toast.error("Failed to update payment");
      return;
    }

    toast.success(`Payment ${status === "paid" ? "approved" : "rejected"}`);
    setSelectedPayment(null);
    setNotes("");
    loadPayments();
  };

  const openPaymentDialog = (payment: PaymentWithOwner) => {
    setSelectedPayment(payment);
    setNotes(payment.notes || "");
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "paid": return "text-green-500";
      case "pending": return "text-yellow-500";
      case "rejected": return "text-red-500";
      default: return "text-muted-foreground";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "paid": return <CheckCircle className="h-5 w-5 text-green-500" />;
      case "pending": return <Clock className="h-5 w-5 text-yellow-500" />;
      case "rejected": return <XCircle className="h-5 w-5 text-red-500" />;
      default: return null;
    }
  };

  const totalPending = payments.filter(p => p.status === "pending").length;
  const totalPaid = payments.filter(p => p.status === "paid").length;
  const totalRevenue = payments
    .filter(p => p.status === "paid")
    .reduce((sum, p) => sum + Number(p.amount), 0);

  return (
    <div className="min-h-screen p-6 pb-24">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-3 mb-6">
          <DollarSign className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-black">Billing Management</h1>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-4">
            <p className="text-sm text-muted-foreground mb-1">Pending Payments</p>
            <p className="text-3xl font-black text-yellow-500">{totalPending}</p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-muted-foreground mb-1">Approved Payments</p>
            <p className="text-3xl font-black text-green-500">{totalPaid}</p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-muted-foreground mb-1">Total Revenue</p>
            <p className="text-3xl font-black text-primary">${totalRevenue.toFixed(2)}</p>
          </Card>
        </div>

        {/* Filters */}
        <Card className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by reference, username, or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              {(["pending", "paid", "rejected"] as const).map((f) => (
                <Button
                  key={f}
                  variant={filter === f ? "default" : "outline"}
                  onClick={() => setFilter(f)}
                  className="capitalize"
                >
                  {f}
                </Button>
              ))}
            </div>
          </div>
        </Card>

        {/* Payments List */}
        <Card className="p-6">
          {filteredPayments.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No payments found</p>
          ) : (
            <div className="space-y-3">
              {filteredPayments.map((payment) => (
                <div
                  key={payment.id}
                  className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition cursor-pointer"
                  onClick={() => openPaymentDialog(payment)}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {getStatusIcon(payment.status)}
                      <span className="font-mono text-sm font-bold">{payment.reference_number}</span>
                    </div>
                    <p className="text-sm font-bold">{payment.profiles?.username || "Unknown"}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Created: {new Date(payment.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-black">${payment.amount.toFixed(2)}</p>
                    <p className={`text-sm font-bold ${getStatusColor(payment.status)}`}>
                      {payment.status.toUpperCase()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Payment Details Dialog */}
        <Dialog open={!!selectedPayment} onOpenChange={() => setSelectedPayment(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Payment Details</DialogTitle>
            </DialogHeader>

            {selectedPayment && (
              <div className="space-y-4">
                <div>
                  <Label>Reference Number</Label>
                  <p className="font-mono font-bold text-lg">{selectedPayment.reference_number}</p>
                </div>

                <div>
                  <Label>Owner</Label>
                  <p className="font-bold">{selectedPayment.profiles?.username}</p>
                </div>

                <div>
                  <Label>Amount</Label>
                  <p className="text-2xl font-black text-primary">${selectedPayment.amount.toFixed(2)} TT</p>
                </div>

                <div>
                  <Label>Status</Label>
                  <div className="flex items-center gap-2">
                    {getStatusIcon(selectedPayment.status)}
                    <span className={`font-bold ${getStatusColor(selectedPayment.status)}`}>
                      {selectedPayment.status.toUpperCase()}
                    </span>
                  </div>
                </div>

                <div>
                  <Label>Due Date</Label>
                  <p>{new Date(selectedPayment.due_date).toLocaleDateString()}</p>
                </div>

                {selectedPayment.status === "pending" && (
                  <>
                    <div>
                      <Label htmlFor="notes">Notes (Optional)</Label>
                      <Textarea
                        id="notes"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Add any notes about this payment..."
                        rows={3}
                        autoFocus={false}
                      />
                    </div>

                    <DialogFooter className="gap-2">
                      <Button
                        variant="destructive"
                        onClick={() => updatePaymentStatus("rejected")}
                        disabled={loading}
                        className="flex-1"
                      >
                        <XCircle className="h-4 w-4 mr-2" />
                        Reject
                      </Button>
                      <Button
                        onClick={() => updatePaymentStatus("paid")}
                        disabled={loading}
                        className="flex-1"
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Approve
                      </Button>
                    </DialogFooter>
                  </>
                )}

                {selectedPayment.notes && (
                  <div>
                    <Label>Admin Notes</Label>
                    <p className="text-sm whitespace-pre-wrap p-3 bg-muted rounded">
                      {selectedPayment.notes}
                    </p>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
