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
  DollarSign, ClipboardList,
} from "lucide-react";

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

// ── Main page ──────────────────────────────────────────────────────────────────
function CreditPage() {
  const { profile } = useAuth();
  const ownerId = profile?.role === "owner" ? profile.id : profile?.parent_id;
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
    setOpened(all.filter((a) => a.status === "open"));
    setClosed(all.filter((a) => a.status === "closed"));
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
          onSelect={setPayAccount}
        />
      )}
      {tab === "closed" && (
        <ClosedTab accounts={closed} loading={loading} />
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
  accounts, loading, onSelect,
}: {
  accounts: CreditAccount[];
  loading: boolean;
  onSelect: (a: CreditAccount) => void;
}) {
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
        <button
          key={a.id}
          onClick={() => onSelect(a)}
          className="w-full flex items-center justify-between p-4 rounded-2xl border border-border hover:border-primary/50 active:scale-[0.98] transition text-left"
          style={{ background: "var(--gradient-card)" }}
        >
          <div>
            <p className="font-black text-base">{a.full_name}</p>
            {a.contact_number && (
              <p className="text-xs text-muted-foreground mt-0.5">{a.contact_number}</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-lg font-black text-red-400">${Number(a.balance_owed).toFixed(2)}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </button>
      ))}
    </div>
  );
}

// ── Closed Tab ─────────────────────────────────────────────────────────────────
function ClosedTab({ accounts, loading }: { accounts: CreditAccount[]; loading: boolean }) {
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
          <div>
            <p className="font-black text-base">{a.full_name}</p>
            {a.contact_number && (
              <p className="text-xs text-muted-foreground mt-0.5">{a.contact_number}</p>
            )}
          </div>
          <span className="text-xs font-bold text-green-500 px-2 py-1 rounded-lg bg-green-500/10">
            SETTLED
          </span>
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
  const amountNum = parseFloat(amount) || 0;
  const owed = Number(account.balance_owed);
  const tooMuch = amountNum > owed;
  const valid = amountNum > 0 && !tooMuch;

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
        className="w-full max-w-md rounded-3xl border border-border shadow-2xl overflow-hidden"
        style={{ background: "var(--gradient-card)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4">
          <div>
            <h2 className="text-xl font-black">{account.full_name}</h2>
            <p className="text-sm text-muted-foreground">Record payment toward balance</p>
          </div>
          <button
            onClick={onClose}
            className="h-9 w-9 rounded-full flex items-center justify-center bg-muted hover:bg-muted/80 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 pb-5 space-y-4">
          {/* Balance owed */}
          <div
            className="rounded-2xl p-4 text-center"
            style={{ background: "var(--gradient-hero)" }}
          >
            <p className="text-xs font-semibold text-primary-foreground/70 uppercase tracking-widest">Balance Owed</p>
            <p className="text-4xl font-black text-primary-foreground">${owed.toFixed(2)}</p>
          </div>

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
                autoFocus
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
