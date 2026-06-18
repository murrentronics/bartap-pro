import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  UserPlus, X, ChevronRight, CheckCircle2,
  ClipboardList, Trash2,
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
  const ownerId = profile?.role === "owner" ? profile.id : profile?.parent_id;
  const ownerIdRef = useRef(ownerId);
  useEffect(() => { ownerIdRef.current = ownerId; }, [ownerId]);

  const [tab, setTab]       = useState<"opened" | "closed" | "create">("opened");
  const [opened, setOpened] = useState<CreditAccount[]>([]);
  const [closed, setClosed] = useState<CreditAccount[]>([]);
  const [loading, setLoading] = useState(true);

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
          onRefresh={fetchAccounts}
        />
      )}
      {tab === "closed" && <ClosedTab accounts={closed} loading={loading} onRefresh={fetchAccounts} />}
      {tab === "create" && <CreateTab ownerId={ownerId!} onCreated={handleCreated} />}
    </div>
  );
}

// ── Opened Tab ─────────────────────────────────────────────────────────────────
function OpenedTab({ accounts, loading, onRefresh }: {
  accounts: CreditAccount[];
  loading: boolean;
  onRefresh: () => void;
}) {
  const { profile } = useAuth();
  const [expanded, setExpanded]     = useState<string | null>(null);
  const [txs, setTxs]               = useState<CreditTx[]>([]);
  const [txLoading, setTxLoading]   = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteTx, setConfirmDeleteTx] = useState<CreditTx | null>(null);
  // Inline payment
  const [payAmount, setPayAmount]   = useState("");
  const [padOpen, setPadOpen]       = useState(false);
  const [paying, setPaying]         = useState(false);

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
      setPayAmount("");
      setPadOpen(false);
    } else {
      setExpanded(accountId);
      loadTxs(accountId);
      setPayAmount("");
      setPadOpen(false);
    }
  };

  const submitPayment = async (account: CreditAccount) => {
    const amt = parseFloat(payAmount);
    if (!amt || amt <= 0) { toast.error("Enter a valid amount"); return; }
    if (amt > Number(account.balance_owed)) { toast.error(`Cannot exceed balance owed ($${Number(account.balance_owed).toFixed(2)})`); return; }
    if (!profile) return;
    setPaying(true);
    const { error } = await supabase.rpc("record_credit_payment", {
      p_credit_account_id: account.id,
      p_cashier_id: profile.id,
      p_amount: amt,
    });
    setPaying(false);
    if (error) { toast.error(error.message); return; }
    toast.success(amt >= Number(account.balance_owed) ? `${account.full_name}'s tab fully settled!` : `Payment of $${amt.toFixed(2)} recorded`);
    setPayAmount("");
    loadTxs(account.id);
    onRefresh();
  };

  const deleteCharge = async (tx: CreditTx) => {
    setDeletingId(tx.id);
    const { error } = await supabase
      .from("credit_transactions")
      .delete()
      .eq("id", tx.id);
    if (error) { toast.error(error.message); setDeletingId(null); return; }

    const { error: balErr } = await supabase.rpc("reduce_credit_balance", {
      p_credit_account_id: tx.credit_account_id,
      p_amount: tx.amount,
    });
    if (balErr) { toast.error("Transaction deleted but balance update failed"); setDeletingId(null); return; }

    setDeletingId(null);
    toast.success("Record removed");

    // Check new balance — if zero, account moved to closed, collapse it
    const { data: acc } = await supabase
      .from("credit_accounts")
      .select("balance_owed, status")
      .eq("id", tx.credit_account_id)
      .single();

    if (acc && Number(acc.balance_owed) <= 0) {
      // Collapse — it will disappear from Opened after refresh
      setExpanded(null);
      setTxs([]);
      toast.success("Bill cleared — account moved to Closed tab");
    } else {
      loadTxs(tx.credit_account_id);
    }
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
          {/* Account row — tap anywhere to expand */}
          <button
            className="w-full flex items-center justify-between p-4 text-left"
            onClick={() => toggleExpand(a.id)}
          >
            <div>
              <p className="font-black text-base">{a.full_name}</p>
              {a.contact_number && <p className="text-xs text-muted-foreground mt-0.5">{a.contact_number}</p>}
              {a.id_number && <p className="text-xs text-muted-foreground mt-0.5">{a.id_number}</p>}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-base font-black text-red-400">${Number(a.balance_owed).toFixed(2)}</span>
              <ChevronRight
                className={`h-4 w-4 text-muted-foreground transition-transform ${expanded === a.id ? "rotate-90" : ""}`}
              />
            </div>
          </button>

          {/* Expanded section */}
          {expanded === a.id && (
            <div className="border-t border-border/50 px-4 pb-3 space-y-1">

              {/* ── Inline payment input ── */}
              <div className="py-3 border-b border-border/40 mb-2">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Record Payment</p>
                <div className="flex gap-2">
                  {/* Tappable amount display — opens numpad */}
                  <button
                    onClick={() => setPadOpen((o) => !o)}
                    className="flex items-center flex-1 h-10 rounded-lg border border-input bg-background px-3 gap-1 text-left"
                  >
                    <span className="text-sm font-bold text-muted-foreground">$</span>
                    <span className={`text-base font-black flex-1 ${payAmount ? "text-foreground" : "text-muted-foreground"}`}>
                      {payAmount || `0.00`}
                    </span>
                    <span className="text-[10px] text-muted-foreground">max ${Number(a.balance_owed).toFixed(2)}</span>
                  </button>
                  <Button
                    className="h-10 px-4 font-black text-sm shrink-0"
                    disabled={paying || !payAmount}
                    onClick={() => { setPadOpen(false); submitPayment(a); }}
                    style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}
                  >
                    {paying ? <div className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" /> : "Pay"}
                  </Button>
                </div>

                {/* Numpad */}
                {padOpen && (
                  <div className="grid grid-cols-3 gap-1.5 mt-3">
                    {["1","2","3","4","5","6","7","8","9",".","0","⌫"].map((k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => {
                          if (k === "⌫") {
                            setPayAmount((v) => v.slice(0, -1));
                          } else if (k === ".") {
                            if (!payAmount.includes(".")) setPayAmount((v) => v + ".");
                          } else {
                            const dotIdx = payAmount.indexOf(".");
                            if (dotIdx !== -1 && payAmount.length - dotIdx > 2) return;
                            setPayAmount((v) => (v === "0" ? k : v + k));
                          }
                        }}
                        className={`h-12 rounded-xl font-black text-xl transition active:scale-95 ${
                          k === "⌫"
                            ? "bg-destructive/20 text-destructive"
                            : "bg-muted text-foreground"
                        }`}
                      >
                        {k}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Transaction records ── */}
              {txLoading ? (
                <div className="py-4 flex justify-center">
                  <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                </div>
              ) : txs.length === 0 ? (
                <p className="text-xs text-muted-foreground py-3 text-center">No records found</p>
              ) : (
                (() => {
                  // Find the index of the most recent payment (txs are newest-first).
                  // Only charge rows ABOVE (newer than) that index are deletable —
                  // they belong to the current open session.
                  const lastPaymentIdx = txs.findIndex((t) => t.type === "payment");
                  return txs.map((tx, idx) => {
                  const dt = new Date(tx.created_at);
                  const date = dt.toLocaleDateString("en-GB");
                  const time = dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
                  const isCharge = tx.type === "charge";
                  // Deletable only if it's a charge AND it's newer than the last payment
                  const canDelete = isCharge && (lastPaymentIdx === -1 || idx < lastPaymentIdx);
                  return (
                    <div
                      key={tx.id}
                      className="flex items-start justify-between py-2.5 border-b border-border/30 last:border-0"
                    >
                      <div className="flex-1 min-w-0 pr-2">
                        <p className="text-xs font-bold leading-snug">
                          {tx.note ?? (isCharge ? "Credit charge" : "Payment received")}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{date} · {time}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 mt-0.5">
                        <span className={`text-sm font-black ${isCharge ? "text-red-400" : "text-green-400"}`}>
                          {isCharge ? "+" : "-"}${Number(tx.amount).toFixed(2)}
                        </span>
                        {canDelete && (
                          <button
                            onClick={() => setConfirmDeleteTx(tx)}
                            disabled={deletingId === tx.id}
                            className="h-7 w-7 rounded-lg flex items-center justify-center text-destructive hover:bg-destructive/10 transition disabled:opacity-40"
                          >
                            {deletingId === tx.id
                              ? <div className="h-3.5 w-3.5 rounded-full border-2 border-destructive border-t-transparent animate-spin" />
                              : <Trash2 className="h-3.5 w-3.5" />
                            }
                          </button>
                        )}
                        {!canDelete && <div className="h-7 w-7" />}
                      </div>
                    </div>
                  );
                  });
                })()
              )}
            </div>
          )}
        </div>
      ))}

      {/* ── Confirm delete modal ── */}
      {confirmDeleteTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-xs rounded-3xl border border-border shadow-2xl overflow-hidden" style={{ background: "var(--gradient-card)" }}>
            <div className="px-6 pt-6 pb-2 text-center">
              <div className="h-12 w-12 rounded-full bg-destructive/10 border border-destructive/30 flex items-center justify-center mx-auto mb-3">
                <Trash2 className="h-6 w-6 text-destructive" />
              </div>
              <h3 className="font-black text-base">Delete Record?</h3>
              <p className="text-xs text-muted-foreground mt-1 leading-snug">
                {confirmDeleteTx.note ?? "This charge"}<br />
                <span className="font-bold text-red-400">${Number(confirmDeleteTx.amount).toFixed(2)}</span> will be removed from the balance.
              </p>
            </div>
            <div className="px-6 pb-6 pt-4 flex gap-3">
              <Button variant="outline" className="flex-1 h-11" onClick={() => setConfirmDeleteTx(null)}>
                Cancel
              </Button>
              <Button
                className="flex-1 h-11 font-black bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deletingId === confirmDeleteTx.id}
                onClick={() => { const tx = confirmDeleteTx; setConfirmDeleteTx(null); deleteCharge(tx); }}
              >
                {deletingId === confirmDeleteTx.id
                  ? <div className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Closed Tab ─────────────────────────────────────────────────────────────────
function ClosedTab({ accounts, loading, onRefresh }: { accounts: CreditAccount[]; loading: boolean; onRefresh: () => void }) {
  const [expanded, setExpanded]   = useState<string | null>(null);
  const [txs, setTxs]             = useState<CreditTx[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<CreditAccount | null>(null);
  const [deleting, setDeleting]   = useState(false);

  const toggleExpand = async (accountId: string) => {
    if (expanded === accountId) { setExpanded(null); setTxs([]); return; }
    setExpanded(accountId);
    setTxLoading(true);
    const { data } = await supabase
      .from("credit_transactions")
      .select("id, credit_account_id, type, amount, note, created_at")
      .eq("credit_account_id", accountId)
      .order("created_at", { ascending: false });
    setTxs((data ?? []) as CreditTx[]);
    setTxLoading(false);
  };

  const deleteAccount = async (account: CreditAccount) => {
    setDeleting(true);
    const { error } = await supabase
      .from("credit_accounts")
      .delete()
      .eq("id", account.id);
    setDeleting(false);
    setConfirmDelete(null);
    if (error) { toast.error(error.message); return; }
    toast.success(`${account.full_name} removed`);
    onRefresh();
  };

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
          className="rounded-2xl border border-border overflow-hidden"
          style={{ background: "var(--gradient-card)" }}
        >
          <div className="flex items-center justify-between p-4">
            <button
              onClick={() => toggleExpand(a.id)}
              className="flex-1 text-left"
            >
              <p className="font-black text-base">{a.full_name}</p>
              {a.contact_number && <p className="text-xs text-muted-foreground mt-0.5">{a.contact_number}</p>}
              {a.id_number && <p className="text-xs text-muted-foreground mt-0.5">{a.id_number}</p>}
            </button>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-green-500 px-2 py-1 rounded-lg bg-green-500/10">SETTLED</span>
              <button
                onClick={(e) => { e.stopPropagation(); setConfirmDelete(a); }}
                className="h-7 w-7 rounded-lg flex items-center justify-center text-destructive hover:bg-destructive/10 transition"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              <ChevronRight
                onClick={() => toggleExpand(a.id)}
                className={`h-4 w-4 text-muted-foreground transition-transform cursor-pointer ${expanded === a.id ? "rotate-90" : ""}`}
              />
            </div>
          </div>

          {expanded === a.id && (
            <div className="border-t border-border/50 px-4 pb-3 space-y-1">
              {txLoading ? (
                <div className="py-4 flex justify-center">
                  <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                </div>
              ) : txs.length === 0 ? (
                <p className="text-xs text-muted-foreground py-3 text-center">No records</p>
              ) : (
                txs.map((tx) => {
                  const dt   = new Date(tx.created_at);
                  const date = dt.toLocaleDateString("en-GB");
                  const time = dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
                  const isCharge = tx.type === "charge";
                  return (
                    <div key={tx.id} className="flex items-start justify-between py-2.5 border-b border-border/30 last:border-0">
                      <div className="flex-1 min-w-0 pr-2">
                        <p className="text-xs font-bold leading-snug">
                          {tx.note ?? (isCharge ? "Credit charge" : "Payment received")}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{date} · {time}</p>
                      </div>
                      <span className={`text-sm font-black shrink-0 mt-0.5 ${isCharge ? "text-red-400" : "text-green-400"}`}>
                        {isCharge ? "+" : "-"}${Number(tx.amount).toFixed(2)}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      ))}

      {/* ── Confirm delete customer modal ── */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-xs rounded-3xl border border-border shadow-2xl overflow-hidden" style={{ background: "var(--gradient-card)" }}>
            <div className="px-6 pt-6 pb-2 text-center">
              <div className="h-12 w-12 rounded-full bg-destructive/10 border border-destructive/30 flex items-center justify-center mx-auto mb-3">
                <Trash2 className="h-6 w-6 text-destructive" />
              </div>
              <h3 className="font-black text-base">Delete Customer?</h3>
              <p className="text-sm text-muted-foreground mt-1">
                <span className="font-bold text-foreground">{confirmDelete.full_name}</span> and all their records will be permanently removed.
              </p>
            </div>
            <div className="px-6 pb-6 pt-4 flex gap-3">
              <Button variant="outline" className="flex-1 h-11" onClick={() => setConfirmDelete(null)}>
                Cancel
              </Button>
              <Button
                className="flex-1 h-11 font-black bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deleting}
                onClick={() => deleteAccount(confirmDelete)}
              >
                {deleting
                  ? <div className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Create Tab ─────────────────────────────────────────────────────────────────
type ActiveField = null | "name" | "idNumber" | "contact";

function CreateTab({ ownerId, onCreated }: { ownerId: string; onCreated: (a: CreditAccount) => void }) {
  const [name, setName]         = useState("");
  const [contact, setContact]   = useState("");
  const [idType, setIdType]     = useState<"drivers_permit" | "national_id">("national_id");
  const [idNumber, setIdNumber] = useState("");
  const [busy, setBusy]         = useState(false);
  const [done, setDone]         = useState(false);
  const [activeField, setActiveField] = useState<ActiveField>(null);

  const toggle = (f: ActiveField) => setActiveField((cur) => cur === f ? null : f);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setActiveField(null);
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
        {/* Full Name */}
        <div>
          <Label>Full Name *</Label>
          <button type="button" onClick={() => { setDone(false); toggle("name"); }}
            className="w-full h-10 rounded-md border border-input bg-background px-3 text-left mt-1">
            <span className={`text-sm font-black ${name ? "text-foreground" : "text-muted-foreground"}`}>
              {name || "e.g. John Smith"}
            </span>
          </button>
          {activeField === "name" && <AlphaKeyboard value={name} onChange={setName} onDone={() => setActiveField(null)} />}
        </div>

        {/* ID Type */}
        <div>
          <Label htmlFor="credit-idtype">ID Type</Label>
          <select id="credit-idtype" value={idType}
            onChange={(e) => setIdType(e.target.value as "drivers_permit" | "national_id")}
            className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm font-semibold mt-1">
            <option value="drivers_permit">Driver's Permit</option>
            <option value="national_id">National ID</option>
          </select>
        </div>

        {/* ID Number */}
        <div>
          <Label>ID Number</Label>
          <button type="button" onClick={() => toggle("idNumber")}
            className="w-full h-10 rounded-md border border-input bg-background px-3 text-left mt-1">
            <span className={`text-sm font-black ${idNumber ? "text-foreground" : "text-muted-foreground"}`}>
              {idNumber || "e.g. 00000000"}
            </span>
          </button>
          {activeField === "idNumber" && (
            <NumPad value={idNumber} onChange={setIdNumber} maxLen={20} onDone={() => setActiveField(null)} />
          )}
        </div>

        {/* Contact Number */}
        <div>
          <Label>Contact Number</Label>
          <div className="flex items-center mt-1">
            <span className="h-10 px-3 flex items-center rounded-l-md border border-r-0 border-input bg-muted text-sm font-bold text-muted-foreground select-none">868</span>
            <button type="button" onClick={() => toggle("contact")}
              className="flex-1 h-10 rounded-r-md border border-input bg-background px-3 text-left">
              <span className={`text-sm font-black ${contact ? "text-foreground" : "text-muted-foreground"}`}>
                {contact || "XXX-XXXX"}
              </span>
            </button>
          </div>
          {activeField === "contact" && (
            <ContactNumPad value={contact} onChange={setContact} onDone={() => setActiveField(null)} />
          )}
        </div>

        <Button type="submit" disabled={busy || !name.trim()} className="w-full h-12 font-black text-base"
          style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}>
          {busy ? "Creating…" : "Create Account"}
        </Button>
      </form>
    </div>
  );
}

// ── Shared keyboard helpers ────────────────────────────────────────────────────
function NumPad({ value, onChange, maxLen = 20, onDone }: {
  value: string; onChange: (v: string) => void; maxLen?: number; onDone: () => void;
}) {
  return (
    <div className="mt-2 space-y-1.5">
      <div className="grid grid-cols-3 gap-1.5">
        {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((k, i) =>
          k === "" ? <div key={i} /> :
          <button key={k} type="button"
            onClick={() => {
              if (k === "⌫") onChange(value.slice(0, -1));
              else if (value.length < maxLen) onChange(value + k);
            }}
            className={`h-12 rounded-xl font-black text-xl transition active:scale-95 ${k === "⌫" ? "bg-destructive/20 text-destructive" : "bg-muted text-foreground"}`}
          >{k}</button>
        )}
      </div>
      <button type="button" onClick={onDone}
        className="w-full h-9 rounded-xl text-xs font-bold text-muted-foreground bg-muted/50 active:scale-95 transition">
        Done
      </button>
    </div>
  );
}

function ContactNumPad({ value, onChange, onDone }: {
  value: string; onChange: (v: string) => void; onDone: () => void;
}) {
  const handle = (k: string) => {
    if (k === "⌫") {
      const digits = value.replace("-", "").slice(0, -1);
      onChange(digits.length > 3 ? digits.slice(0, 3) + "-" + digits.slice(3) : digits);
    } else {
      const digits = (value.replace("-", "") + k).slice(0, 7);
      onChange(digits.length > 3 ? digits.slice(0, 3) + "-" + digits.slice(3) : digits);
    }
  };
  return (
    <div className="mt-2 space-y-1.5">
      <div className="grid grid-cols-3 gap-1.5">
        {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((k, i) =>
          k === "" ? <div key={i} /> :
          <button key={k} type="button" onClick={() => handle(k)}
            className={`h-12 rounded-xl font-black text-xl transition active:scale-95 ${k === "⌫" ? "bg-destructive/20 text-destructive" : "bg-muted text-foreground"}`}
          >{k}</button>
        )}
      </div>
      <button type="button" onClick={onDone}
        className="w-full h-9 rounded-xl text-xs font-bold text-muted-foreground bg-muted/50 active:scale-95 transition">
        Done
      </button>
    </div>
  );
}

const ALPHA_ROWS = [
  ["Q","W","E","R","T","Y","U","I","O","P"],
  ["A","S","D","F","G","H","J","K","L"],
  ["Z","X","C","V","B","N","M","⌫"],
];

function AlphaKeyboard({ value, onChange, onDone }: {
  value: string; onChange: (v: string) => void; onDone: () => void;
}) {
  return (
    <div className="mt-2 space-y-1.5">
      {ALPHA_ROWS.map((row, ri) => (
        <div key={ri} className="flex gap-1 justify-center">
          {row.map((k) => (
            <button key={k} type="button"
              onClick={() => {
                if (k === "⌫") onChange(value.slice(0, -1));
                else onChange(value + k);
              }}
              className={`flex-1 h-10 rounded-lg font-bold text-sm transition active:scale-95 max-w-[38px] ${
                k === "⌫" ? "bg-destructive/20 text-destructive" : "bg-muted text-foreground"
              }`}
            >{k}</button>
          ))}
        </div>
      ))}
      <div className="flex gap-1.5">
        <button type="button" onClick={() => onChange(value + " ")}
          className="flex-1 h-10 rounded-lg bg-muted text-foreground font-bold text-sm active:scale-95 transition">
          SPACE
        </button>
        <button type="button" onClick={onDone}
          className="w-20 h-10 rounded-lg bg-primary text-primary-foreground font-bold text-sm active:scale-95 transition">
          Done
        </button>
      </div>
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