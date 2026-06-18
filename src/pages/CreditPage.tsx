import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  UserPlus, X, ChevronRight, CheckCircle2, DollarSign,
  ClipboardList, Trash2, AlertTriangle,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
export type CreditAccount = {
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

type CreditTx = {
  id: string;
  credit_account_id: string;
  type: "charge" | "payment";
  amount: number;
  note: string | null;
  created_at: string;
};

// ── Main page ──────────────────────────────────────────────────────────────────
export default function CreditPage() {
  const { profile } = useAuth();
  const nav = useNavigate();
  const ownerId = profile?.role === "owner" ? profile.id : profile?.parent_id;
  const ownerIdRef = useRef(ownerId);
  useEffect(() => { ownerIdRef.current = ownerId; }, [ownerId]);

  const [tab, setTab]       = useState<"opened" | "closed" | "create">("opened");
  const [opened, setOpened] = useState<CreditAccount[]>([]);
  const [closed, setClosed] = useState<CreditAccount[]>([]);
  const [loading, setLoading] = useState(true);

  // Confirm modal before navigating to bar
  const [confirmAccount, setConfirmAccount] = useState<CreditAccount | null>(null);

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
              tab === t ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
            style={tab === t ? { background: "var(--gradient-hero)" } : {}}
          >
            {t === "opened"
              ? `Opened${opened.length ? ` (${opened.length})` : ""}`
              : t === "closed" ? "Closed" : "Create"}
          </button>
        ))}
      </div>

      {tab === "opened" && (
        <OpenedTab
          accounts={opened}
          loading={loading}
          onSelect={setConfirmAccount}
          onRefresh={fetchAccounts}
        />
      )}
      {tab === "closed" && <ClosedTab accounts={closed} loading={loading} />}
      {tab === "create" && <CreateTab ownerId={ownerId!} onCreated={handleCreated} />}

      {/* ── Confirm modal ── */}
      {confirmAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/70 backdrop-blur-sm">
          <div
            className="w-full max-w-sm rounded-3xl border border-border shadow-2xl overflow-hidden"
            style={{ background: "var(--gradient-card)" }}
          >
            <div className="px-6 pt-6 pb-2 text-center">
              <div className="h-14 w-14 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="h-7 w-7 text-primary" />
              </div>
              <h2 className="text-xl font-black">Record Payment?</h2>
              <p className="text-muted-foreground text-sm mt-1">
                You are about to record a payment for
              </p>
              <p className="font-black text-lg mt-1">{confirmAccount.full_name}</p>
              <p className="text-red-400 font-black text-2xl mt-1">
                Balance: ${Number(confirmAccount.balance_owed).toFixed(2)}
              </p>
            </div>
            <div className="px-6 pb-6 pt-4 flex gap-3">
              <Button
                variant="outline"
                className="flex-1 h-12"
                onClick={() => setConfirmAccount(null)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 h-12 font-black text-base"
                onClick={() => {
                  setConfirmAccount(null);
                  nav("/register");
                }}
                style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}
              >
                Yes, Proceed
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// ── Opened Tab ─────────────────────────────────────────────────────────────────
function OpenedTab({ accounts, loading, onSelect, onRefresh }: {
  accounts: CreditAccount[];
  loading: boolean;
  onSelect: (a: CreditAccount) => void;
  onRefresh: () => void;
}) {
  // Which account's transactions are expanded
  const [expanded, setExpanded] = useState<string | null>(null);
  const [txs, setTxs]           = useState<CreditTx[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadTxs = async (accountId: string) => {
    setTxLoading(true);
    const { data } = await supabase
      .from("credit_transactions")
      .select("id, credit_account_id, type, amount, note, created_at")
      .eq("credit_account_id", accountId)
      .order("created_at", { ascending: false });
    setTxs((data ?? []) as CreditTx[]);
    setTxLoading(false);
  };

  const toggleExpand = (accountId: string) => {
    if (expanded === accountId) {
      setExpanded(null);
      setTxs([]);
    } else {
      setExpanded(accountId);
      loadTxs(accountId);
    }
  };

  const deleteCharge = async (tx: CreditTx) => {
    setDeletingId(tx.id);
    // Delete the transaction
    const { error } = await supabase
      .from("credit_transactions")
      .delete()
      .eq("id", tx.id);
    if (error) { toast.error(error.message); setDeletingId(null); return; }
    // Reduce balance_owed on the account
    const { error: balErr } = await supabase.rpc("reduce_credit_balance", {
      p_credit_account_id: tx.credit_account_id,
      p_amount: tx.amount,
    });
    if (balErr) toast.error("Transaction deleted but balance update failed");
    setDeletingId(null);
    toast.success("Record removed");
    loadTxs(tx.credit_account_id);
    onRefresh();
  };

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
          className="rounded-2xl border border-border overflow-hidden"
          style={{ background: "var(--gradient-card)" }}
        >
          {/* Account row — tap to expand transactions, tap amount to pay */}
          <div className="flex items-center justify-between p-4">
            <button
              className="flex-1 text-left"
              onClick={() => toggleExpand(a.id)}
            >
              <p className="font-black text-base">{a.full_name}</p>
              {a.contact_number && <p className="text-xs text-muted-foreground mt-0.5">{a.contact_number}</p>}
            </button>
            <div className="flex items-center gap-2">
              {/* Tap balance to trigger payment confirm */}
              <button
                onClick={() => onSelect(a)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl active:scale-95 transition"
                style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)" }}
              >
                <span className="text-base font-black text-red-400">${Number(a.balance_owed).toFixed(2)}</span>
                <DollarSign className="h-3.5 w-3.5 text-red-400" />
              </button>
              <ChevronRight
                className={`h-4 w-4 text-muted-foreground transition-transform ${expanded === a.id ? "rotate-90" : ""}`}
              />
            </div>
          </div>

          {/* Expanded transactions */}
          {expanded === a.id && (
            <div className="border-t border-border/50 px-4 pb-3 space-y-1">
              {txLoading ? (
                <div className="py-4 flex justify-center">
                  <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                </div>
              ) : txs.length === 0 ? (
                <p className="text-xs text-muted-foreground py-3 text-center">No records found</p>
              ) : (
                txs.map((tx) => {
                  const dt = new Date(tx.created_at);
                  const date = dt.toLocaleDateString("en-GB");
                  const time = dt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
                  const isCharge = tx.type === "charge";
                  return (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between py-2.5 border-b border-border/30 last:border-0"
                    >
                      <div className="flex-1 min-w-0 pr-2">
                        <p className="text-xs font-bold truncate">
                          {tx.note ?? (isCharge ? "Credit charge" : "Payment received")}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{date} · {time}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-sm font-black ${isCharge ? "text-red-400" : "text-green-400"}`}>
                          {isCharge ? "+" : "-"}${Number(tx.amount).toFixed(2)}
                        </span>
                        {/* Only show delete for charge records — payments settled the debt */}
                        {isCharge && (
                          <button
                            onClick={() => deleteCharge(tx)}
                            disabled={deletingId === tx.id}
                            className="h-7 w-7 rounded-lg flex items-center justify-center text-destructive hover:bg-destructive/10 transition disabled:opacity-40"
                          >
                            {deletingId === tx.id
                              ? <div className="h-3.5 w-3.5 rounded-full border-2 border-destructive border-t-transparent animate-spin" />
                              : <Trash2 className="h-3.5 w-3.5" />
                            }
                          </button>
                        )}
                        {/* Payment records — no delete, show lock icon area for spacing */}
                        {!isCharge && <div className="h-7 w-7" />}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
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
            {a.contact_number && <p className="text-xs text-muted-foreground mt-0.5">{a.contact_number}</p>}
          </div>
          <span className="text-xs font-bold text-green-500 px-2 py-1 rounded-lg bg-green-500/10">SETTLED</span>
        </div>
      ))}
    </div>
  );
}

// ── Create Tab ─────────────────────────────────────────────────────────────────
function CreateTab({ ownerId, onCreated }: { ownerId: string; onCreated: (a: CreditAccount) => void }) {
  const [name, setName]         = useState("");
  const [contact, setContact]   = useState("");
  const [idType, setIdType]     = useState<"drivers_permit" | "national_id">("national_id");
  const [idNumber, setIdNumber] = useState("");
  const [busy, setBusy]         = useState(false);
  const [done, setDone]         = useState(false);

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
    setName(""); setContact(""); setIdNumber(""); setIdType("national_id");
  };

  return (
    <div className="rounded-2xl p-5 space-y-4" style={{ background: "var(--gradient-card)" }}>
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
        <div>
          <Label htmlFor="credit-name">Full Name *</Label>
          <Input id="credit-name" value={name} onChange={(e) => { setName(e.target.value); setDone(false); }} placeholder="e.g. John Smith" required />
        </div>
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
        <div>
          <Label htmlFor="credit-idnum">ID Number</Label>
          <Input id="credit-idnum" value={idNumber} onChange={(e) => setIdNumber(e.target.value)} placeholder="e.g. 00000000" />
        </div>
        <div>
          <Label htmlFor="credit-contact">Contact Number</Label>
          <div className="flex items-center mt-1">
            <span className="h-10 px-3 flex items-center rounded-l-md border border-r-0 border-input bg-muted text-sm font-bold text-muted-foreground select-none">868</span>
            <Input
              id="credit-contact"
              className="rounded-l-none"
              value={contact}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "").slice(0, 7);
                setContact(digits.length > 3 ? digits.slice(0, 3) + "-" + digits.slice(3) : digits);
              }}
              placeholder="XXX-XXXX"
              maxLength={8}
              inputMode="numeric"
            />
          </div>
        </div>
        <Button type="submit" disabled={busy || !name.trim()} className="w-full h-12 font-black text-base" style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}>
          {busy ? "Creating…" : "Create Account"}
        </Button>
      </form>
    </div>
  );
}

// ── Payment Overlay ────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <div className="flex justify-center py-12">
      <div className="h-7 w-7 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  );
}