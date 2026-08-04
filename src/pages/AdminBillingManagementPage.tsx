import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
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
import { CheckCircle, XCircle, Clock, Search, DollarSign, Trash2, AlertCircle } from "lucide-react";
import type { BillingPayment } from "@/types/billing";

type PaymentWithOwner = BillingPayment & {
  profiles: { username: string } | null;
  billing_plans: { name: string; plan_type?: string } | null;
};

export default function AdminBillingManagementPage() {
  const { profile } = useAuth();
  const [payments, setPayments] = useState<PaymentWithOwner[]>([]);
  const [filteredPayments, setFilteredPayments] = useState<PaymentWithOwner[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPayment, setSelectedPayment] = useState<PaymentWithOwner | null>(null);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"pending" | "paid" | "rejected" | "due">("pending");
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState({ pending: 0, paid: 0, revenue: 0, dueSoonCount: 0, dueSoonTotal: 0 });
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [revokeAddonWarning, setRevokeAddonWarning] = useState<string[] | null>(null); // active addons on the account
  const [dueSoonList, setDueSoonList] = useState<{ username: string; amount: number; dueDate: string; daysLeft: number }[]>([]);
  
  const PAGE_SIZE = 100;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  useEffect(() => {
    if (profile?.role === "admin") {
      loadPayments();
      loadStats();
    }
  }, [profile, filter, page]);

  // ── Realtime: refresh list + stats whenever any billing_payment changes ──
  useEffect(() => {
    if (profile?.role !== "admin") return;
    const ch = supabase
      .channel("admin-billing-payments-rt")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "billing_payments" },
        () => {
          loadPayments();
          loadStats();
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.role]);

  useEffect(() => {
    let filtered = payments;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(p =>
        p.reference_number.toLowerCase().includes(term) ||
        (p.profiles?.username ?? "").toLowerCase().includes(term)
      );
    }
    setFilteredPayments(filtered);
  }, [payments, searchTerm]);

  const loadPayments = async () => {
    // First check if we're admin
    if (!profile?.id || profile.role !== 'admin') {
      toast.error("Admin access required");
      return;
    }

    // Get total count for pagination
    if (filter === "due") return; // due list is handled by loadStats
    const { count } = await supabase
      .from("billing_payments")
      .select("*", { count: "exact", head: true })
      .eq("status", filter);
    
    setTotalCount(count || 0);

    // Get paginated data
    const { data, error } = await supabase
      .from("billing_payments")
      .select(`
        *,
        profiles:owner_id (username),
        billing_plans:plan_id (name, plan_type)
      `)
      .eq("status", filter)
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (error) {
      console.error("Failed to load payments:", error);
      toast.error(`Failed to load payments: ${error.message}`);
      return;
    }

    // Exclude master account (renard.sankersingh@gmail.com) from billing records
    // Master account has no billing payments so no filtering needed
    const masterId: string | undefined = undefined;
    const filtered = (data || []).filter((p: any) => !masterId || p.owner_id !== masterId);

    setPayments(filtered as PaymentWithOwner[]);
  };

  const loadStats = async () => {
    const [{ count: pendingCount }, { count: paidCount }, { data: paidData }] = await Promise.all([
      supabase.from("billing_payments").select("*", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("billing_payments").select("*", { count: "exact", head: true }).eq("status", "paid"),
      supabase.from("billing_payments").select("amount").eq("status", "paid"),
    ]);
    const revenue = (paidData ?? []).reduce((sum, p) => sum + Number(p.amount), 0);

    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    const now = new Date().toISOString();
    const soon = sevenDaysFromNow.toISOString();

    // Fetch all approved owners with enough columns to handle every plan type
    const { data: allOwners } = await supabase
      .from("profiles")
      .select("id, username, plan_type, subscription_end_date, machines_addon_end_date, premium_subscription_end_date")
      .eq("status", "approved")
      .eq("role", "owner");

    // Pick the relevant expiry column per plan type
    type DueRow = { id: string; username: string; endDate: Date };
    const dueRows: DueRow[] = [];
    for (const owner of allOwners ?? []) {
      const pt = owner.plan_type ?? "basic";
      let endDateStr: string | null = null;
      if (pt === "machines_only" || pt === "machines_only_20") {
        endDateStr = owner.machines_addon_end_date ?? null;
      } else if (pt === "premium" || pt === "premium_20") {
        endDateStr = owner.premium_subscription_end_date ?? owner.subscription_end_date ?? null;
      } else {
        // basic, chain, bar_only and everything else uses subscription_end_date
        endDateStr = owner.subscription_end_date ?? null;
      }
      if (!endDateStr) continue;
      if (endDateStr >= now && endDateStr <= soon) {
        dueRows.push({ id: owner.id, username: owner.username ?? "Unknown", endDate: new Date(endDateStr) });
      }
    }

    // Build due-soon list with last-paid amount per owner
    let dueSoonTotal = 0;
    const list: { username: string; amount: number; dueDate: string; daysLeft: number }[] = [];
    for (const row of dueRows) {
      const { data: lastPayment } = await supabase
        .from("billing_payments")
        .select("amount")
        .eq("owner_id", row.id)
        .eq("status", "paid")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const amount = lastPayment ? Number(lastPayment.amount) : 0;
      dueSoonTotal += amount;
      const daysLeft = Math.ceil((row.endDate.getTime() - Date.now()) / 86400000);
      list.push({
        username: row.username,
        amount,
        dueDate: row.endDate.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
        daysLeft,
      });
    }
    list.sort((a, b) => a.daysLeft - b.daysLeft);

    setStats({ pending: pendingCount ?? 0, paid: paidCount ?? 0, revenue, dueSoonCount: dueRows.length, dueSoonTotal });
    setDueSoonList(list);
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
      
      const { data: plan } = await supabase
        .from("billing_plans")
        .select("duration_months, name, plan_type")
        .eq("id", selectedPayment.plan_id)
        .single();
      
      if (plan) {
        const { data: ownerProfile } = await supabase
          .from("profiles")
          .select("subscription_end_date, billing_status, premium_subscription_end_date, machines_addon_end_date")
          .eq("id", selectedPayment.owner_id)
          .single();
        
        const startDate = new Date();
        const isPremium = (plan as any).plan_type === "premium" || (plan as any).plan_type === "premium_20";
        const isChainPlan = (plan as any).plan_type === "chain";
        const isMachinesOnly = (plan as any).plan_type === "machines_only" || (plan as any).plan_type === "machines_only_20";
        const isBarOnlyAddon     = (plan as any).plan_type === "bar_only_addon";
        const isMachinesBarAddon = (plan as any).plan_type === "machines_bar_addon" || (plan as any).plan_type === "machines_bar_addon_20";
        const isPremiumAddon     = (plan as any).plan_type === "premium_addon" || (plan as any).plan_type === "premium_addon_20";
        const isAnyBarAddon      = isBarOnlyAddon || isMachinesBarAddon || isPremiumAddon;
        if (isChainPlan) {
          // Chain plan: set plan_type = "chain", chain_addon_active = true,
          // subscription_end_date = now + duration_months, chain_bar_count = 0
          const chainEnd = new Date(startDate);
          chainEnd.setMonth(chainEnd.getMonth() + plan.duration_months);

          await supabase.from("profiles").update({
            status: "approved",
            billing_status: "active",
            plan_type: "chain",
            chain_addon_active: true,
            chain_bar_count: 1,  // their existing bar is automatically bar 1
            subscription_start_date: startDate.toISOString(),
            subscription_end_date: chainEnd.toISOString(),
            music_addon: true,
          }).eq("id", selectedPayment.owner_id);

          updates.next_due_date = chainEnd.toISOString();

        } else if (isMachinesOnly) {
          // Machines Only: activate machines, hide bar features
          // Preserve the exact variant (machines_only or machines_only_20)
          const endDate = new Date(startDate);
          endDate.setMonth(endDate.getMonth() + plan.duration_months);

          await supabase.from("profiles").update({
            status: "approved",
            billing_status: "active",
            plan_type: (plan as any).plan_type, // "machines_only" or "machines_only_20"
            machines_addon_active: true,
            machines_addon_start_date: startDate.toISOString(),
            machines_addon_end_date: endDate.toISOString(),
            bar_addon_active: false,
            music_addon: true,
          }).eq("id", selectedPayment.owner_id);

          updates.next_due_date = endDate.toISOString();

        } else if (isPremium) {
          // Premium: extend premium_subscription_end_date independently
          const premiumBase = ownerProfile?.premium_subscription_end_date
            && new Date(ownerProfile.premium_subscription_end_date) > startDate
            ? new Date(ownerProfile.premium_subscription_end_date)
            : startDate;
          const premiumEnd = new Date(premiumBase);
          premiumEnd.setMonth(premiumEnd.getMonth() + plan.duration_months);

          await supabase.from("profiles").update({
            status: "approved",
            billing_status: "active",
            plan_type: (plan as any).plan_type, // "premium" or "premium_20"
            premium_subscription_start_date: startDate.toISOString(),
            premium_subscription_end_date: premiumEnd.toISOString(),
            music_addon: true,
          }).eq("id", selectedPayment.owner_id);

          updates.next_due_date = premiumEnd.toISOString();

        } else if (isAnyBarAddon) {
          // Multi-bar addon: call create-addon-bars edge function to bulk-create bars
          // and reset the subscription end date to now + 12 months
          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
          const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
          const { data: { session: adminSession } } = await supabase.auth.getSession();

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 30_000); // 30s timeout

          let res: Response;
          try {
            res = await fetch(`${supabaseUrl}/functions/v1/create-addon-bars`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${adminSession?.access_token}`,
                "apikey": supabaseKey,
              },
              body: JSON.stringify({ payment_id: selectedPayment.id }),
              signal: controller.signal,
            });
          } catch (fetchErr: unknown) {
            clearTimeout(timeoutId);
            const msg = fetchErr instanceof Error && fetchErr.name === "AbortError"
              ? "Request timed out — please try again"
              : "Network error reaching bar creation service";
            toast.error(msg);
            setLoading(false);
            return;
          }
          clearTimeout(timeoutId);

          const json = await res.json();
          if (!res.ok) {
            toast.error("Bar creation failed: " + (json.error ?? "unknown error"));
            setLoading(false);
            return;
          }

          // next_due_date = owner's existing plan end date (NOT now + 12 months)
          // Addon bars are pro-rated to the remaining time on the base plan.
          // The edge function does NOT move the subscription_end_date, so the
          // owner's renewal date stays intact and they pay full price at renewal.
          const existingEnd = ownerProfile?.subscription_end_date
            ?? ownerProfile?.premium_subscription_end_date
            ?? ownerProfile?.machines_addon_end_date;
          const addonEnd = existingEnd ? new Date(existingEnd) : (() => {
            const d = new Date();
            d.setMonth(d.getMonth() + plan.duration_months);
            return d;
          })();
          updates.next_due_date = addonEnd.toISOString();

        } else {
          // Basic: extend the main subscription dates
          const isActiveRenewal =
            ownerProfile?.subscription_end_date &&
            ownerProfile?.billing_status === "active" &&
            new Date(ownerProfile.subscription_end_date) > startDate;

          const endDate = isActiveRenewal
            ? (() => { const d = new Date(ownerProfile!.subscription_end_date!); d.setMonth(d.getMonth() + plan.duration_months); return d; })()
            : (() => { const d = new Date(); d.setMonth(d.getMonth() + plan.duration_months); return d; })();

          await supabase.from("profiles").update({
            status: "approved",
            billing_status: "active",
            music_addon: true,
            plan_type: "basic",
            ...(isActiveRenewal ? {} : { subscription_start_date: startDate.toISOString() }),
            subscription_end_date: endDate.toISOString(),
          }).eq("id", selectedPayment.owner_id);

          updates.next_due_date = endDate.toISOString();
        }
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
    setConfirmRevoke(false);
    setRevokeAddonWarning(null);
    loadPayments();
    loadStats();
  };

  const openPaymentDialog = (payment: PaymentWithOwner) => {
    setSelectedPayment(payment);
    setNotes(payment.notes || "");
    setConfirmRevoke(false);
    setRevokeAddonWarning(null);
  };

  const revokePayment = async (force = false) => {
    if (!selectedPayment) return;
    setLoading(true);

    // Call the admin-revoke-plan edge function — handles cashier deletion + profile reset
    const { data: { session } } = await supabase.auth.getSession();
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

    const res = await fetch(`${supabaseUrl}/functions/v1/admin-revoke-plan`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session?.access_token}`,
        "apikey": supabaseKey,
      },
      body: JSON.stringify({ payment_id: selectedPayment.id, force }),
    });

    setLoading(false);
    const json = await res.json();

    // ── Addon warning: base plan has addons active ───────────────────────────
    // The edge function returns has_addons=true when a main plan revoke would
    // also wipe addons. Show a second confirmation so admin can acknowledge.
    if (res.ok && json.has_addons) {
      setRevokeAddonWarning(json.addons as string[]);
      return;
    }

    if (!res.ok) { toast.error("Revoke failed: " + (json.error ?? "unknown error")); return; }

    const planType = selectedPayment.billing_plans?.plan_type ?? "basic";
    toast.success(
      planType === "chain"                ? `${selectedPayment.profiles?.username} Chain plan revoked — reset to pending` :
      planType === "basic"                ? `${selectedPayment.profiles?.username} reset to pending — subscription removed` :
      planType === "machines_only"        ? `${selectedPayment.profiles?.username} machines plan revoked — reset to pending` :
      planType === "machines_only_20"     ? `${selectedPayment.profiles?.username} machines (20-screen) plan revoked — reset to pending` :
      planType === "premium"              ? `${selectedPayment.profiles?.username} downgraded to Basic` :
      planType === "premium_20"           ? `${selectedPayment.profiles?.username} Bar+Machines 20-screen plan revoked` :
      planType === "bar_only_addon"       ? `${selectedPayment.profiles?.username} extra bar revoked` :
      planType === "machines_bar_addon"   ? `${selectedPayment.profiles?.username} extra machines account (10-screen) revoked` :
      planType === "machines_bar_addon_20"? `${selectedPayment.profiles?.username} extra machines account (20-screen) revoked` :
      planType === "premium_addon"        ? `${selectedPayment.profiles?.username} extra bar+machines (10-screen) revoked` :
      planType === "premium_addon_20"     ? `${selectedPayment.profiles?.username} extra bar+machines (20-screen) revoked` :
      "Subscription revoked"
    );
    setSelectedPayment(null);
    setConfirmRevoke(false);
    setRevokeAddonWarning(null);
    loadPayments();
    loadStats();
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

  const totalPending = stats.pending;
  const totalPaid    = stats.paid;

  return (
    <div className="pb-24">
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <DollarSign className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-black text-muted-foreground uppercase tracking-widest">Billing</h2>
        </div>

        {/* Filters */}
        <div className="rounded-xl border border-border p-4" style={{ background: "var(--gradient-card)" }}>
          {/* Search — full width row */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by reference or username..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          {/* Tabs — full width row below search */}
          <div className="flex gap-2 w-full">
            {(["pending", "due", "paid", "rejected"] as const).map((f) => (
                <Button
                  key={f}
                  variant={filter === f ? "default" : "outline"}
                  onClick={() => { setFilter(f); setPage(0); }}
                  className="flex-1 flex flex-col items-center gap-0.5 h-auto py-2 px-1 min-w-0"
                  style={f === "due" && filter === f ? { background: "linear-gradient(135deg,#ea580c,#f59e0b)" } : {}}
                >
                  {f === "pending"  && <Clock       className="h-4 w-4 text-yellow-500 shrink-0" />}
                  {f === "due"      && <AlertCircle className="h-4 w-4 text-orange-400 shrink-0" />}
                  {f === "paid"     && <CheckCircle className="h-4 w-4 text-green-500  shrink-0" />}
                  {f === "rejected" && <XCircle     className="h-4 w-4 text-red-500    shrink-0" />}
                  <span className="text-[10px] font-black leading-none capitalize">{f}</span>
                  {f === "pending"  && stats.pending  > 0 && <span className="text-[10px] font-black text-yellow-500">{stats.pending}</span>}
                  {f === "due"      && stats.dueSoonCount > 0 && <span className="text-[10px] font-black text-orange-400">{stats.dueSoonCount}</span>}
                  {f === "paid"     && stats.paid     > 0 && <span className="text-[10px] font-black text-green-500">{stats.paid}</span>}
                </Button>
              ))}
          </div>
        </div>

        {/* Payments List */}
        <div className="rounded-xl border border-border p-4" style={{ background: "var(--gradient-card)" }}>
          {filter === "due" ? (
            dueSoonList.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No payments due within 7 days</p>
            ) : (
              <div className="space-y-3">
                {dueSoonList.map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-4 rounded-lg border border-orange-500/30 bg-orange-500/5">
                    <div>
                      <p className="font-black text-base">{item.username}</p>
                      <p className="text-xs text-orange-400 font-bold mt-0.5">
                        Due {item.dueDate} · {item.daysLeft === 0 ? "Today" : `${item.daysLeft}d`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-black text-orange-400">${item.amount.toFixed(0)}</p>
                      <p className="text-xs text-muted-foreground">TT / yr</p>
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-3 border-t border-border mt-3">
                  <p className="text-sm font-black text-muted-foreground">Total Due</p>
                  <p className="text-2xl font-black text-orange-400">${stats.dueSoonTotal.toFixed(0)} TT</p>
                </div>
              </div>
            )
          ) : filteredPayments.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No payments found</p>
          ) : (
            <>
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
                    <p className="text-xs text-primary font-semibold mt-0.5">
                      {payment.billing_plans?.name || "Unknown Plan"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Created: {new Date(payment.created_at).toLocaleString("en-GB")}
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
            
            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-6 pt-4 border-t">
                <Button 
                  variant="outline" 
                  size="sm" 
                  disabled={page === 0} 
                  onClick={() => { setPage(p => p - 1); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {page + 1} of {totalPages} · {totalCount} total
                </span>
                <Button 
                  variant="outline" 
                  size="sm" 
                  disabled={page >= totalPages - 1} 
                  onClick={() => { setPage(p => p + 1); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                >
                  Next
                </Button>
              </div>
            )}
          </>
          )}
        </div>

        {/* Payment Details Dialog */}
        <Dialog open={!!selectedPayment} onOpenChange={() => { setSelectedPayment(null); setConfirmRevoke(false); setRevokeAddonWarning(null); }}>
          <DialogContent className="max-w-md flex flex-col max-h-[90vh]" onOpenAutoFocus={(e) => e.preventDefault()}>
            <DialogHeader>
              <DialogTitle>Payment Details</DialogTitle>
            </DialogHeader>

            {selectedPayment && (
              <div className="overflow-y-auto flex-1 space-y-4 pr-1">
                <div>
                  <Label>Reference Number</Label>
                  <p className="font-mono font-bold text-lg">{selectedPayment.reference_number}</p>
                </div>

                <div>
                  <Label>Owner</Label>
                  <p className="font-bold">{selectedPayment.profiles?.username}</p>
                </div>

                <div>
                  <Label>Plan</Label>
                  <p className="font-bold text-primary">{selectedPayment.billing_plans?.name || "Unknown Plan"}</p>
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
                  <p>{new Date(selectedPayment.due_date).toLocaleDateString("en-GB")}</p>
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

                    <DialogFooter className="gap-2 pt-2 border-t border-border mt-2">
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

                {selectedPayment.status === "paid" && (
                  <div className="space-y-3 pt-2 border-t border-border">
                    {/* ── Step 1: initial revoke button ── */}
                    {!confirmRevoke && !revokeAddonWarning && (
                      <Button
                        variant="destructive"
                        className="w-full"
                        disabled={loading}
                        onClick={() => setConfirmRevoke(true)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Revoke &amp; Reset Subscription
                      </Button>
                    )}

                    {/* ── Step 2: standard confirm (no addons) ── */}
                    {confirmRevoke && !revokeAddonWarning && (
                      <div className="space-y-2">
                        <p className="text-sm text-destructive font-bold text-center">
                          This will delete this payment and reset {selectedPayment.profiles?.username ?? "this user"} back to pending. They must re-subscribe. Cannot be undone.
                        </p>
                        <div className="flex gap-2">
                          <Button variant="outline" className="flex-1" disabled={loading}
                            onClick={() => setConfirmRevoke(false)}>
                            Cancel
                          </Button>
                          <Button variant="destructive" className="flex-1" disabled={loading}
                            onClick={() => revokePayment(false)}>
                            {loading ? "Checking…" : "Yes, Revoke"}
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* ── Step 3: addon warning — shown when base plan has active addons ── */}
                    {revokeAddonWarning && (
                      <div className="space-y-3 rounded-xl border border-destructive/40 bg-destructive/10 p-3">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                          <div className="space-y-1">
                            <p className="text-sm font-black text-destructive">
                              This account has active addons
                            </p>
                            <p className="text-xs text-destructive/80">
                              Active: {revokeAddonWarning.join(", ")}
                            </p>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          <strong>If the user wants to keep their addons</strong> — this is not possible. They must close their account and re-register for the plan they want instead.
                        </p>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          <strong>If they want everything removed</strong> — confirm below. This will clear the main plan AND all addons, remove all staff accounts, and set the account back to Pending.
                        </p>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            className="flex-1 text-xs"
                            disabled={loading}
                            onClick={() => { setRevokeAddonWarning(null); setConfirmRevoke(false); }}
                          >
                            Cancel
                          </Button>
                          <Button
                            variant="destructive"
                            className="flex-1 text-xs"
                            disabled={loading}
                            onClick={() => revokePayment(true)}
                          >
                            {loading ? "Revoking…" : "Wipe Everything"}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
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
