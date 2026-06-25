import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  UserPlus, X, ChevronRight, Camera, CheckCircle2,
  DollarSign, ClipboardList, FileDown, Loader2, Trash2,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { downloadPdf } from "@/lib/download";
import { drawHeader, addFootersToAllPages, LM, RM, CONTENT_BOTTOM } from "@/lib/pdfHelpers";

export const Route = createFileRoute("/_app/credit")({
  component: CreditPage,
});

// ── Types ──────────────────────────────────────────────────────────────────────
type CreditAccount = {
  id: string;
  owner_id: string;
  full_name: string;
  contact_number: string | null;
  id_image_url: string | null;
  id_number: string | null;
  balance_owed: number;
  status: "open" | "closed";
  created_at: string;
};

// ── Print Bill ─────────────────────────────────────────────────────────────────
async function printBill(account: CreditAccount, ownerName: string) {
  const { data: txs, error } = await supabase
    .from("credit_transactions")
    .select("id, type, amount, note, items, created_at")
    .eq("credit_account_id", account.id)
    .order("created_at", { ascending: true });

  if (error) { toast.error("Failed to load transactions"); return; }

  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const generated = new Date().toLocaleString("en-GB", {
    hour: "2-digit", minute: "2-digit", hour12: true,
    day: "2-digit", month: "2-digit", year: "numeric",
  });

  let y = await drawHeader(doc, ownerName, "Credit Bill", "Full History", generated);

  // ── Customer info block ───────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.text("Customer:", LM, y);
  doc.setFont("helvetica", "normal");
  doc.text(account.full_name, LM + 24, y);
  y += 5;
  if (account.contact_number) {
    doc.text("Contact: " + account.contact_number, LM, y); y += 5;
  }
  if (account.id_number) {
    doc.text("ID: " + account.id_number, LM, y); y += 5;
  }
  doc.text("Account opened: " + new Date(account.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }), LM, y);
  y += 5;

  // ── Balance summary box ────────────────────────────────────────────────────
  const ORANGE = [232, 146, 42] as const;
  const totalCharged = (txs ?? []).filter(t => t.type === "charge").reduce((s, t) => s + Number(t.amount), 0);
  const totalPaid    = (txs ?? []).filter(t => t.type === "payment").reduce((s, t) => s + Number(t.amount), 0);
  const balance      = Number(account.balance_owed);

  doc.setFillColor(245, 240, 230);
  doc.roundedRect(LM, y, RM - LM, 22, 2, 2, "F");
  doc.setDrawColor(...ORANGE);
  doc.setLineWidth(0.4);
  doc.roundedRect(LM, y, RM - LM, 22, 2, 2, "S");

  const cols = [
    { label: "Total Charged", value: "$" + totalCharged.toFixed(2) },
    { label: "Total Paid",    value: "$" + totalPaid.toFixed(2) },
    { label: "Balance Remaining", value: "$" + balance.toFixed(2) },
  ];
  const colW = (RM - LM) / 3;
  cols.forEach((col, i) => {
    const cx = LM + i * colW + colW / 2;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(100, 100, 100);
    doc.text(col.label, cx, y + 7, { align: "center" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    if (col.label === "Balance Remaining") {
      doc.setTextColor(balance <= 0 ? 40 : 200, balance <= 0 ? 140 : 40, 40);
    } else {
      doc.setTextColor(30, 30, 30);
    }
    doc.text(col.value, cx, y + 17, { align: "center" });
  });
  doc.setTextColor(0, 0, 0);
  y += 27;

  // ── Column headers ────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(130, 130, 130);
  doc.text("DATE / DETAILS", LM, y);
  doc.text("AMOUNT", RM, y, { align: "right" });
  y += 3;
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.2);
  doc.line(LM, y, RM, y);
  y += 5;

  // ── Transaction rows ──────────────────────────────────────────────────────
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(0, 0, 0);

  for (const tx of txs ?? []) {
    if (y > CONTENT_BOTTOM) { doc.addPage(); y = 20; }

    const isCharge = tx.type === "charge";
    const dateStr  = new Date(tx.created_at).toLocaleString("en-GB", {
      hour: "2-digit", minute: "2-digit", hour12: true,
      day: "2-digit", month: "short", year: "numeric",
    });

    doc.setFont("helvetica", "bold");
    doc.setTextColor(isCharge ? 200 : 40, isCharge ? 60 : 140, 40);
    doc.text(isCharge ? "CHARGE" : "PAYMENT", LM, y);
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");
    doc.text(dateStr, LM + 22, y);

    const amtStr = (isCharge ? "+" : "-") + "$" + Number(tx.amount).toFixed(2);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(isCharge ? 200 : 40, isCharge ? 60 : 140, 40);
    doc.text(amtStr, RM, y, { align: "right" });
    doc.setTextColor(0, 0, 0);
    y += 5;

    // Items for charges
    if (isCharge && tx.items && Array.isArray(tx.items) && tx.items.length > 0) {
      const itemStr = tx.items.map((it: any) => `${it.qty}× ${it.name}`).join(", ");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(80, 80, 80);
      const wrapped = doc.splitTextToSize("  " + itemStr, RM - LM - 4);
      doc.text(wrapped, LM, y);
      y += wrapped.length * 4 + 1;
      doc.setFontSize(8.5);
      doc.setTextColor(0, 0, 0);
    }

    // Note
    if (tx.note) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(7.5);
      doc.setTextColor(120, 120, 120);
      doc.text("  " + tx.note, LM, y);
      y += 4;
      doc.setFontSize(8.5);
      doc.setTextColor(0, 0, 0);
    }

    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.1);
    doc.line(LM, y, RM, y);
    y += 4;
  }

  // ── Footer balance line ────────────────────────────────────────────────────
  if (y > CONTENT_BOTTOM - 10) { doc.addPage(); y = 20; }
  y += 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...ORANGE);
  doc.text("Balance Remaining:", LM, y);
  doc.setTextColor(balance <= 0 ? 40 : 200, balance <= 0 ? 140 : 40, 40);
  doc.text("$" + balance.toFixed(2), RM, y, { align: "right" });

  addFootersToAllPages(doc);

  const safeName = account.full_name.replace(/\s+/g, "-").toLowerCase();
  await downloadPdf(`credit-bill-${safeName}.pdf`, doc.output("datauristring"));
  toast.success("Bill saved");
}

// ── Main page ──────────────────────────────────────────────────────────────────
function CreditPage() {
  const { profile } = useAuth();
  const ownerId = profile?.role === "owner" ? profile.id : profile?.parent_id;
  const ownerName = profile?.username ?? "Bar";
  const ownerIdRef = useRef(ownerId);
  useEffect(() => { ownerIdRef.current = ownerId; }, [ownerId]);

  const [tab, setTab] = useState<"opened" | "closed" | "create">("opened");
  const [opened, setOpened] = useState<CreditAccount[]>([]);
  const [closed, setClosed] = useState<CreditAccount[]>([]);
  const [loading, setLoading] = useState(true);

  // Payment card state
  const [payAccount, setPayAccount] = useState<CreditAccount | null>(null);

  const fetchAccounts = useCallback(async () => {
    const id = ownerIdRef.current;
    if (!id) return;
    setLoading(true);
    const { data } = await supabase
      .from("credit_accounts")
      .select("*")
      .eq("owner_id", id)
      .order("updated_at", { ascending: false });
    const all = (data ?? []) as CreditAccount[];
    setOpened(all.filter((a) => a.status === "open").sort((a, b) => a.full_name.localeCompare(b.full_name)));
    setClosed(all.filter((a) => a.status === "closed").sort((a, b) => a.full_name.localeCompare(b.full_name)));
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!ownerId) return;
    fetchAccounts();
  }, [ownerId, fetchAccounts]);

  const handleCreated = (account: CreditAccount) => {
    setClosed((prev) => [account, ...prev]);
    setTab("closed");
  };

  const handlePaymentDone = () => {
    setPayAccount(null);
    fetchAccounts();
  };

  return (
    <div className="py-3 space-y-4">
      <h1 className="text-2xl font-black">Credit</h1>

      {/* Tab bar */}
      <div className="flex gap-1 rounded-2xl p-1" style={{ background: "var(--gradient-card)" }}>
        {(["opened", "closed", "create"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-black capitalize transition ${
              tab === t
                ? "text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
            style={tab === t ? { background: "var(--gradient-hero)" } : {}}
          >
            {t === "opened" ? `Opened${opened.length ? ` (${opened.length})` : ""}` : t === "closed" ? "Closed" : "Create"}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "opened" && (
        <OpenedTab
          accounts={opened}
          loading={loading}
          ownerName={ownerName}
          onSelect={setPayAccount}
        />
      )}
      {tab === "closed" && (
        <ClosedTab accounts={closed} loading={loading} ownerName={ownerName} />
      )}
      {tab === "create" && (
        <CreateTab ownerId={ownerId!} onCreated={handleCreated} />
      )}

      {/* Payment overlay */}
      {payAccount && (
        <PaymentOverlay
          account={payAccount}
          onClose={() => setPayAccount(null)}
          onDone={handlePaymentDone}
        />
      )}
    </div>
  );
}

// ── Opened Tab ─────────────────────────────────────────────────────────────────
function OpenedTab({
  accounts, loading, ownerName, onSelect,
}: {
  accounts: CreditAccount[];
  loading: boolean;
  ownerName: string;
  onSelect: (a: CreditAccount) => void;
}) {
  const [printing, setPrinting] = useState<string | null>(null);

  if (loading) return <Spinner />;
  if (accounts.length === 0)
    return (
      <div className="text-center py-16 text-muted-foreground">
        <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-30" />
        <p className="font-semibold">No open tabs</p>
      </div>
    );

  return (
    <div className="space-y-2">
      {accounts.map((a) => (
        <div
          key={a.id}
          className="w-full flex items-center justify-between p-4 rounded-2xl border border-border text-left"
          style={{ background: "var(--gradient-card)" }}
        >
          {/* Left — tap to pay */}
          <button className="flex-1 min-w-0 text-left active:scale-[0.98] transition" onClick={() => onSelect(a)}>
            <p className="font-black text-base">{a.full_name}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{new Date(a.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</p>
            {a.contact_number && <p className="text-xs text-muted-foreground mt-0.5">{a.contact_number}</p>}
            {a.id_number && <p className="text-xs text-muted-foreground mt-0.5">{a.id_number}</p>}
          </button>

          {/* Right — balance + print bill */}
          <div className="flex flex-col items-end gap-2 ml-3 shrink-0">
            <button className="flex items-center gap-1.5 active:scale-95 transition" onClick={() => onSelect(a)}>
              <span className="text-lg font-black text-red-400">${Number(a.balance_owed).toFixed(2)}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
            <button
              onClick={async () => { setPrinting(a.id); await printBill(a, ownerName); setPrinting(null); }}
              disabled={printing === a.id}
              className="flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg transition active:scale-95 disabled:opacity-50"
              style={{ background: "rgba(251,146,60,0.12)", color: "var(--primary)", border: "1px solid rgba(251,146,60,0.25)" }}
            >
              {printing === a.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileDown className="h-3 w-3" />}
              Bill
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Closed Tab ─────────────────────────────────────────────────────────────────
function ClosedTab({ accounts, loading, ownerName }: { accounts: CreditAccount[]; loading: boolean; ownerName: string }) {
  const [printing, setPrinting] = useState<string | null>(null);

  if (loading) return <Spinner />;
  if (accounts.length === 0)
    return (
      <div className="text-center py-16 text-muted-foreground">
        <CheckCircle2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
        <p className="font-semibold">No closed accounts yet</p>
      </div>
    );

  return (
    <div className="space-y-2">
      {accounts.map((a) => (
        <div
          key={a.id}
          className="flex items-center justify-between p-4 rounded-2xl border border-border"
          style={{ background: "var(--gradient-card)" }}
        >
          <div className="flex-1 min-w-0">
            <p className="font-black text-base">{a.full_name}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{new Date(a.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</p>
            {a.contact_number && <p className="text-xs text-muted-foreground mt-0.5">{a.contact_number}</p>}
            {a.id_number && <p className="text-xs text-muted-foreground mt-0.5">{a.id_number}</p>}
          </div>
          <div className="flex flex-col items-end gap-2 ml-3 shrink-0">
            <span className="text-xs font-bold text-green-500 px-2 py-1 rounded-lg bg-green-500/10">SETTLED</span>
            <button
              onClick={async () => { setPrinting(a.id); await printBill(a, ownerName); setPrinting(null); }}
              disabled={printing === a.id}
              className="flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg transition active:scale-95 disabled:opacity-50"
              style={{ background: "rgba(251,146,60,0.12)", color: "var(--primary)", border: "1px solid rgba(251,146,60,0.25)" }}
            >
              {printing === a.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileDown className="h-3 w-3" />}
              Bill
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Create Tab ─────────────────────────────────────────────────────────────────
function CreateTab({
  ownerId,
  onCreated,
}: {
  ownerId: string;
  onCreated: (a: CreditAccount) => void;
}) {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [idType, setIdType] = useState<"drivers_permit" | "national_id">("national_id");
  const [idNumber, setIdNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    const { data, error } = await supabase
      .from("credit_accounts")
      .insert({
        owner_id: ownerId,
        full_name: name.trim(),
        contact_number: contact.trim() ? "868-" + contact.trim() : null,
        id_number: idNumber.trim() ? `${idType === "drivers_permit" ? "DP" : "NID"}: ${idNumber.trim()}` : null,
        status: "closed",
      })
      .select()
      .single();
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setDone(true);
    onCreated(data as CreditAccount);
    setName("");
    setContact("");
    setIdNumber("");
    setIdType("national_id");
  };

  return (
    <div
      className="rounded-2xl p-5 space-y-4"
      style={{ background: "var(--gradient-card)" }}
    >
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "var(--gradient-hero)" }}>
          <UserPlus className="h-5 w-5 text-primary-foreground" />
        </div>
        <div>
          <h2 className="font-black text-base">New Credit Account</h2>
          <p className="text-xs text-muted-foreground">Customer will be added to the Closed tab</p>
        </div>
      </div>

      {done && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-green-500/10 border border-green-500/30 text-sm text-green-400 font-semibold">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Customer created. View in Closed tab.
        </div>
      )}

      <form onSubmit={submit} className="space-y-3">
        {/* Full Name */}
        <div>
          <Label htmlFor="credit-name">Full Name *</Label>
          <Input
            id="credit-name"
            value={name}
            onChange={(e) => { setName(e.target.value); setDone(false); }}
            placeholder="e.g. John Smith"
            required
          />
        </div>

        {/* ID Type */}
        <div>
          <Label htmlFor="credit-idtype">ID Type</Label>
          <select
            id="credit-idtype"
            value={idType}
            onChange={(e) => setIdType(e.target.value as "drivers_permit" | "national_id")}
            className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm font-semibold mt-1"
          >
            <option value="drivers_permit">Driver's Permit</option>
            <option value="national_id">National ID</option>
          </select>
        </div>

        {/* ID Number */}
        <div>
          <Label htmlFor="credit-idnum">ID Number</Label>
          <Input
            id="credit-idnum"
            value={idNumber}
            onChange={(e) => setIdNumber(e.target.value)}
            placeholder="e.g. 00000000"
          />
        </div>

        {/* Contact — 868 prefix, auto-hyphen after 3rd digit, 7 digits max */}
        <div>
          <Label htmlFor="credit-contact">Contact Number</Label>
          <div className="flex items-center gap-0 mt-1">
            <span className="h-10 px-3 flex items-center rounded-l-md border border-r-0 border-input bg-muted text-sm font-bold text-muted-foreground select-none">
              868
            </span>
            <Input
              id="credit-contact"
              className="rounded-l-none"
              value={contact}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "").slice(0, 7);
                const formatted = digits.length > 3 ? digits.slice(0, 3) + "-" + digits.slice(3) : digits;
                setContact(formatted);
              }}
              placeholder="XXX-XXXX"
              maxLength={8}
              inputMode="numeric"
            />
          </div>
        </div>

        <Button
          type="submit"
          disabled={busy || !name.trim()}
          className="w-full h-12 font-black text-base"
          style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}
        >
          {busy ? "Creating…" : "Create Account"}
        </Button>
      </form>
    </div>
  );
}

// ── Payment Overlay ────────────────────────────────────────────────────────────
function PaymentOverlay({
  account,
  onClose,
  onDone,
}: {
  account: CreditAccount;
  onClose: () => void;
  onDone: () => void;
}) {
  const { profile } = useAuth();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [charges, setCharges] = useState<{ id: string; amount: number; items: { id: string; name: string; qty: number }[] | null; created_at: string; cashier_id: string | null }[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const ownerName = profile?.username ?? "Bar";
  const amountNum = parseFloat(amount) || 0;
  const owed = Number(account.balance_owed);
  const tooMuch = amountNum > owed;
  const valid = amountNum > 0 && !tooMuch;

  const loadCharges = useCallback(async () => {
    const { data } = await supabase
      .from("credit_transactions")
      .select("id, amount, items, created_at, cashier_id")
      .eq("credit_account_id", account.id)
      .eq("type", "charge")
      .order("created_at", { ascending: false });
    setCharges((data ?? []) as any);
  }, [account.id]);

  useEffect(() => { loadCharges(); }, [loadCharges]);

  const deleteCharge = async (chargeId: string) => {
    if (!profile) return;
    setDeletingId(chargeId);
    const { error } = await supabase.rpc("delete_credit_charge", {
      p_credit_tx_id: chargeId,
      p_cashier_id: profile.id,
    });
    setDeletingId(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Charge removed — stock restored");
    await loadCharges();
    onDone();
  };

  const submit = async () => {
    if (!valid || !profile) return;
    setBusy(true);
    const { error } = await supabase.rpc("record_credit_payment", {
      p_credit_account_id: account.id,
      p_cashier_id: profile.id,
      p_amount: amountNum,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    if (amountNum >= owed) {
      toast.success(`${account.full_name}'s tab is fully settled!`);
    } else {
      toast.success(`Payment of $${amountNum.toFixed(2)} recorded`);
    }
    onDone();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div
        className="w-full max-w-md rounded-3xl border border-border shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
        style={{ background: "var(--gradient-card)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 shrink-0">
          <div>
            <h2 className="text-xl font-black">{account.full_name}</h2>
            <p className="text-sm text-muted-foreground">Record payment toward balance</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={async () => { setPrinting(true); await printBill(account, ownerName); setPrinting(false); }}
              disabled={printing}
              className="flex items-center gap-1.5 px-3 h-9 rounded-xl font-bold text-xs transition active:scale-95 disabled:opacity-50"
              style={{ background: "rgba(251,146,60,0.15)", color: "var(--primary)", border: "1px solid rgba(251,146,60,0.3)" }}
            >
              {printing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
              Bill
            </button>
            <button
              onClick={onClose}
              className="h-9 w-9 rounded-full flex items-center justify-center bg-muted hover:bg-muted/80 transition"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="px-5 pb-5 space-y-4 overflow-y-auto flex-1">
          {/* Balance owed */}
          <div
            className="rounded-2xl p-4 text-center"
            style={{ background: "var(--gradient-hero)" }}
          >
            <p className="text-xs font-semibold text-primary-foreground/70 uppercase tracking-widest">Balance Owed</p>
            <p className="text-4xl font-black text-primary-foreground">${owed.toFixed(2)}</p>
          </div>

          {/* Charge history with delete */}
          {charges.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-black text-muted-foreground uppercase tracking-wider">Charges</p>
              {charges.map((c) => {
                const itemsArr = Array.isArray(c.items) ? c.items : [];
                const isNewest = c.id === charges[0].id;
                return (
                  <div key={c.id} className="flex items-start gap-3 rounded-xl px-3 py-2.5 border border-border"
                    style={{ background: "oklch(0.20 0.04 45 / 0.30)" }}>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-muted-foreground">
                        {new Date(c.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true })}
                      </div>
                      <div className="text-sm font-black mt-0.5" style={{ color: "var(--primary)" }}>
                        +${Number(c.amount).toFixed(2)}
                      </div>
                      {itemsArr.length > 0 && (
                        <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                          {itemsArr.map((i: any) => `${i.qty}x ${i.name}`).join(", ")}
                        </div>
                      )}
                    </div>
                    {isNewest && (
                      <button
                        onClick={() => deleteCharge(c.id)}
                        disabled={!!deletingId}
                        className="h-8 w-8 rounded-full flex items-center justify-center bg-red-600 active:scale-95 transition shrink-0 disabled:opacity-50"
                      >
                        {deletingId === c.id
                          ? <Loader2 className="h-3.5 w-3.5 text-white animate-spin" />
                          : <Trash2 className="h-3.5 w-3.5 text-white" />}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Amount input */}
          <div>
            <Label htmlFor="pay-amount">Amount Paying</Label>
            <div className="relative mt-1">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="pay-amount"
                type="number"
                min="0.01"
                step="0.01"
                className="pl-8 text-xl font-black h-14"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            {tooMuch && (
              <p className="text-destructive text-sm font-semibold mt-1.5">
                Cannot exceed balance owed (${owed.toFixed(2)})
              </p>
            )}
            {valid && amountNum < owed && (
              <p className="text-muted-foreground text-xs mt-1.5">
                Remaining after payment: ${(owed - amountNum).toFixed(2)}
              </p>
            )}
            {valid && amountNum >= owed && (
              <p className="text-green-500 text-sm font-semibold mt-1.5 flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4" /> Fully settles this account
              </p>
            )}
          </div>

          {/* Buttons */}
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1 h-12" onClick={onClose}>
              Cancel
            </Button>
            <Button
              className="flex-1 h-12 font-black text-base"
              disabled={!valid || busy}
              onClick={submit}
              style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}
            >
              {busy ? "Saving…" : "Confirm Payment"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <div className="flex justify-center py-12">
      <div className="h-7 w-7 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  );
}

// ── Export types for use in register ──────────────────────────────────────────
export type { CreditAccount };
