import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Wallet as WalletIcon, Receipt, ChevronLeft, ChevronRight, ArrowDownLeft, RotateCcw, Loader2, FileText, Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { downloadPdf } from "@/lib/download";

type Order = {
  id: string;
  total: number;
  paid: number;
  change_given: number;
  items: { name: string; qty: number; price: number }[];
  created_at: string;
};

type WalletTx = {
  id: string;
  amount: number;
  type: string;
  note: string | null;
  created_at: string;
};

const PAGE_SIZE = 200;

function PaginationBar({
  page,
  totalPages,
  total,
  onPrev,
  onNext,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between">
      <Button variant="outline" size="sm" disabled={page === 0} onClick={onPrev}>
        <ChevronLeft className="h-4 w-4 mr-1" /> Prev
      </Button>
      <span className="text-sm text-muted-foreground">
        Page {page + 1} of {totalPages} · {total} records
      </span>
      <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={onNext}>
        Next <ChevronRight className="h-4 w-4 ml-1" />
      </Button>
    </div>
  );
}

// ─── Cashier wallet: shows their own orders in chronological order ────────────
function CashierWallet({ profile }: { profile: { id: string; wallet_balance: number; role: string } }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    setLoading(true);
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("cashier_id", profile.id)
      .then(({ count }) => setTotal(count ?? 0));

    supabase
      .from("orders")
      .select("*")
      .eq("cashier_id", profile.id)
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
      .then(({ data }) => {
        setOrders((data ?? []) as unknown as Order[]);
        setLoading(false);
      });
  }, [profile.id, page]);

  const handlePrev = () => { setPage((p) => p - 1); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const handleNext = () => { setPage((p) => p + 1); window.scrollTo({ top: 0, behavior: "smooth" }); };

  return (
    <div className="space-y-5">
      {/* Balance card */}
      <section
        className="rounded-3xl p-6 relative overflow-hidden"
        style={{ background: "var(--gradient-hero)", boxShadow: "var(--shadow-glow)" }}
      >
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="relative">
          <div className="flex items-center gap-2 text-primary-foreground/80 text-sm font-medium">
            <WalletIcon className="h-4 w-4" /> Wallet Balance
          </div>
          <div className="text-4xl sm:text-6xl font-black text-primary-foreground mt-2 tracking-tight">
            ${Number(profile.wallet_balance).toFixed(2)}
          </div>
          <div className="mt-3 text-primary-foreground/80 text-sm">
            Cashier — clears to owner
          </div>
        </div>
      </section>

      {/* Orders */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-black text-xl">Orders</h2>
          <span className="text-sm text-muted-foreground">{total} total</span>
        </div>

        <PaginationBar page={page} totalPages={totalPages} total={total} onPrev={handlePrev} onNext={handleNext} />

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-xl h-20 bg-muted/30 animate-pulse" />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="text-muted-foreground text-sm py-8 text-center">No orders yet.</div>
        ) : (
          <div className="space-y-2">
            {orders.map((o) => (
              <div
                key={o.id}
                className="rounded-xl p-4 border border-border"
                style={{ background: "var(--gradient-card)" }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <Receipt className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-xs text-muted-foreground truncate">
                      {new Date(o.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div className="font-black text-primary text-lg shrink-0 ml-2">
                    ${Number(o.total).toFixed(2)}
                  </div>
                </div>
                <div className="mt-1.5 text-sm text-muted-foreground line-clamp-2">
                  {(o.items || []).map((i) => `${i.qty}× ${i.name}`).join(" · ")}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Paid ${Number(o.paid).toFixed(2)} · Change ${Number(o.change_given).toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        )}

        <PaginationBar page={page} totalPages={totalPages} total={total} onPrev={handlePrev} onNext={handleNext} />
      </section>
    </div>
  );
}

// ─── Owner Statement Modal ────────────────────────────────────────────────────
type OwnerFlatRecord =
  | { kind: "order"; data: Order; ts: number }
  | { kind: "tx"; data: WalletTx; ts: number };

function OwnerStatement({ profile, onClose }: { profile: { id: string; username?: string }; onClose: () => void }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [txs, setTxs] = useState<WalletTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      supabase
        .from("orders")
        .select("*")
        .eq("cashier_id", profile.id)
        .order("created_at", { ascending: false })
        .then(({ data }) => setOrders((data ?? []) as unknown as Order[])),
      supabase
        .from("wallet_transactions")
        .select("*")
        .eq("profile_id", profile.id)
        .in("type", ["transfer_in", "wallet_reset"])
        .order("created_at", { ascending: false })
        .then(({ data }) => setTxs((data ?? []) as WalletTx[])),
    ]).finally(() => setLoading(false));
  }, [profile.id]);

  // Build flat merged list newest-first
  const allRecords: OwnerFlatRecord[] = [
    ...orders.map((o): OwnerFlatRecord => ({ kind: "order", data: o, ts: new Date(o.created_at).getTime() })),
    ...txs.map((tx): OwnerFlatRecord => ({ kind: "tx", data: tx, ts: new Date(tx.created_at).getTime() })),
  ].sort((a, b) => b.ts - a.ts);

  // Derive unique months for the accordion rows
  const months = Array.from(
    new Set(
      allRecords.map((r) =>
        new Date(r.data.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long" })
      )
    )
  );

  const getRecordsForMonth = (month: string) =>
    allRecords.filter((r) =>
      new Date(r.data.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long" }) === month
    );

  const handleDownload = async (month: string) => {
    const monthRecords = getRecordsForMonth(month);
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const lm = 15;
    let y = 20;

    const ownerName = profile.username ?? "owner";
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("Bartendaz Pro", lm, y); y += 8;
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text("Owner Wallet Statement", lm, y); y += 6;
    doc.text("Period: " + month, lm, y); y += 6;
    doc.text("Generated: " + new Date().toLocaleString(), lm, y); y += 10;

    doc.setDrawColor(180, 120, 40);
    doc.line(lm, y, 195, y); y += 6;

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");

    monthRecords.forEach((rec) => {
      if (y > 270) { doc.addPage(); y = 20; }
      if (rec.kind === "order") {
        const o = rec.data;
        doc.text(new Date(o.created_at).toLocaleString(), lm, y);
        doc.text("$" + Number(o.total).toFixed(2), 175, y, { align: "right" });
        y += 5;
        const items = (o.items || []).map((i) => i.qty + "x " + i.name).join(", ");
        const wrapped = doc.splitTextToSize("  " + items, 155);
        doc.text(wrapped, lm, y);
        y += wrapped.length * 4.5 + 1;
        doc.text("  Paid $" + Number(o.paid).toFixed(2) + "  Change $" + Number(o.change_given).toFixed(2), lm, y);
        y += 7;
      } else {
        const tx = rec.data;
        const isReset = tx.type === "wallet_reset";
        const label = tx.note ?? (isReset ? "Wallet reset" : "Cleared from cashier");
        const sign = isReset ? "-" : "+";
        doc.text(new Date(tx.created_at).toLocaleString(), lm, y);
        doc.text(label, lm + 55, y);
        doc.text(sign + "$" + Math.abs(Number(tx.amount)).toFixed(2), 175, y, { align: "right" });
        y += 7;
      }
    });

    const filename = "owner-statement-" + ownerName + "-" + month.replace(/\s/g, "-") + ".pdf";
    await downloadPdf(filename, doc.output("datauristring"));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto">
      <div
        className="relative w-full max-w-lg rounded-3xl border border-border shadow-2xl mt-4 mb-8"
        style={{ background: "var(--gradient-card)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border">
          <div>
            <h2 className="text-xl font-black">Owner Statement</h2>
            <p className="text-sm text-muted-foreground">Your wallet records</p>
          </div>
          <button
            onClick={onClose}
            className="h-9 w-9 rounded-full flex items-center justify-center bg-muted hover:bg-muted/80 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-xl h-16 bg-muted/30 animate-pulse" />
              ))}
            </div>
          ) : months.length === 0 ? (
            <div className="text-muted-foreground text-sm py-8 text-center">No records yet.</div>
          ) : (
            <div className="space-y-4">
              {months.map((month) => {
                const monthRecords = getRecordsForMonth(month);
                const monthTotal = monthRecords
                  .filter((r) => r.kind === "order")
                  .reduce((s, r) => s + Number((r.data as Order).total), 0);
                const isOpen = selectedMonth === month;

                return (
                  <div key={month} className="rounded-2xl border border-border overflow-hidden">
                    <button
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition"
                      onClick={() => setSelectedMonth(isOpen ? null : month)}
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-black text-sm">{month}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-black text-primary">${monthTotal.toFixed(2)}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1"
                          onClick={(e) => { e.stopPropagation(); handleDownload(month); }}
                        >
                          <Download className="h-3 w-3" /> PDF
                        </Button>
                        <ChevronRight
                          className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`}
                        />
                      </div>
                    </button>

                    {isOpen && (
                      <div className="border-t border-border divide-y divide-border/50">
                        {monthRecords.map((rec) => {
                          if (rec.kind === "tx") {
                            const tx = rec.data;
                            const isReset = tx.type === "wallet_reset";
                            return (
                              <div
                                key={tx.id}
                                className={`px-4 py-3 flex items-center gap-3 ${isReset ? "bg-orange-500/5" : "bg-green-500/5"}`}
                              >
                                {isReset
                                  ? <RotateCcw className="h-3.5 w-3.5 text-orange-400 shrink-0" />
                                  : <ArrowDownLeft className="h-3.5 w-3.5 text-green-400 shrink-0" />}
                                <div className={`flex-1 text-xs ${isReset ? "text-orange-400" : "text-green-400"}`}>
                                  {tx.note ?? (isReset ? "Wallet reset" : "Cleared from cashier")}
                                  {" · "}{new Date(tx.created_at).toLocaleString()}
                                </div>
                                <span className={`font-black text-sm ${isReset ? "text-orange-400" : "text-green-400"}`}>
                                  {isReset ? "-" : "+"}${Math.abs(Number(tx.amount)).toFixed(2)}
                                </span>
                              </div>
                            );
                          }
                          const o = rec.data as Order;
                          return (
                            <div key={o.id} className="px-4 py-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 min-w-0">
                                  <Receipt className="h-3.5 w-3.5 text-primary shrink-0" />
                                  <span className="text-xs text-muted-foreground">
                                    {new Date(o.created_at).toLocaleString()}
                                  </span>
                                </div>
                                <span className="font-black text-primary text-sm ml-2">
                                  ${Number(o.total).toFixed(2)}
                                </span>
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground line-clamp-2">
                                {(o.items || []).map((i) => `${i.qty}× ${i.name}`).join(" · ")}
                              </div>
                              <div className="mt-0.5 text-xs text-muted-foreground">
                                Paid ${Number(o.paid).toFixed(2)} · Change ${Number(o.change_given).toFixed(2)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Owner wallet: all records flat in chronological order ───────────────────
type FlatRecord =
  | { kind: "order"; data: Order; ts: number }
  | { kind: "tx"; data: WalletTx; ts: number };

function OwnerWallet({ profile }: { profile: { id: string; wallet_balance: number; role: string } }) {
  const { refreshProfile } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [txs, setTxs] = useState<WalletTx[]>([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [balance, setBalance] = useState(Number(profile.wallet_balance));
  const [showStatement, setShowStatement] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const fetchData = () => {
    setLoading(true);
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("cashier_id", profile.id)
      .then(({ count }) => setTotal(count ?? 0));

    supabase
      .from("orders")
      .select("*")
      .eq("cashier_id", profile.id)
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
      .then(({ data }) => {
        setOrders((data ?? []) as unknown as Order[]);
        setLoading(false);
      });

    // transfer_in (cleared from cashier) + wallet_reset records
    supabase
      .from("wallet_transactions")
      .select("*")
      .eq("profile_id", profile.id)
      .in("type", ["transfer_in", "wallet_reset"])
      .order("created_at", { ascending: false })
      .then(({ data }) => setTxs((data ?? []) as WalletTx[]));
  };

  useEffect(() => {
    fetchData();
  }, [profile.id, page]);

  // Keep local balance in sync with profile
  useEffect(() => { setBalance(Number(profile.wallet_balance)); }, [profile.wallet_balance]);

  const handleReset = async () => {
    if (balance === 0) { toast.error("Balance is already $0.00"); return; }
    setResetting(true);
    const prevBalance = balance;

    // Use the DB function so it runs as SECURITY DEFINER (bypasses RLS)
    const { error } = await supabase.rpc("owner_reset_wallet", {
      _owner_id: profile.id,
      _prev_balance: prevBalance,
    });
    if (error) { toast.error(error.message); setResetting(false); return; }

    setBalance(0);
    setResetting(false);
    toast.success("Wallet reset to $0.00");
    refreshProfile();
    fetchData();
  };

  const handlePrev = () => { setPage((p) => p - 1); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const handleNext = () => { setPage((p) => p + 1); window.scrollTo({ top: 0, behavior: "smooth" }); };

  // Merge orders + txs into a single flat list sorted newest first
  const flatRecords: FlatRecord[] = [
    ...orders.map((o): FlatRecord => ({ kind: "order", data: o, ts: new Date(o.created_at).getTime() })),
    ...txs.map((tx): FlatRecord => ({ kind: "tx", data: tx, ts: new Date(tx.created_at).getTime() })),
  ].sort((a, b) => b.ts - a.ts);

  return (
    <div className="space-y-5">
      <section className="rounded-3xl p-6 relative overflow-hidden" style={{ background: "var(--gradient-hero)", boxShadow: "var(--shadow-glow)" }}>
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-primary-foreground/80 text-sm font-medium">
              <WalletIcon className="h-4 w-4" /> Wallet Balance
            </div>
            {/* Reset button */}
            <button
              onClick={handleReset}
              disabled={resetting || balance === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 active:scale-95 transition text-primary-foreground text-xs font-black disabled:opacity-40"
              title="Reset wallet balance to $0.00"
            >
              {resetting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
              Reset
            </button>
          </div>
          <div className="text-4xl sm:text-6xl font-black text-primary-foreground mt-2 tracking-tight">
            ${balance.toFixed(2)}
          </div>
          <div className="mt-3 text-primary-foreground/80 text-sm">Owner account</div>
          <button
            onClick={() => setShowStatement(true)}
            className="mt-4 flex items-center gap-1.5 px-3 py-1.5 rounded-xl active:scale-95 transition text-xs font-black"
            style={{ background: "oklch(0.18 0.02 60)", color: "oklch(0.78 0.17 65)" }}
          >
            <FileText className="h-3.5 w-3.5" />
            View Statement
          </button>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-black text-xl">Records</h2>
          <span className="text-sm text-muted-foreground">{total} orders</span>
        </div>
        <PaginationBar page={page} totalPages={totalPages} total={total} onPrev={handlePrev} onNext={handleNext} />

        {loading ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="rounded-xl h-16 bg-muted/30 animate-pulse" />)}</div>
        ) : flatRecords.length === 0 ? (
          <div className="text-muted-foreground text-sm py-8 text-center">No records yet.</div>
        ) : (
          <div className="space-y-2">
            {flatRecords.map((rec) => {
              if (rec.kind === "tx") {
                const tx = rec.data;
                const isReset = tx.type === "wallet_reset";
                return (
                  <div
                    key={tx.id}
                    className={`rounded-xl p-4 border flex items-center gap-3 ${
                      isReset ? "border-orange-500/30" : "border-green-500/30"
                    }`}
                    style={{
                      background: isReset
                        ? "oklch(0.22 0.06 50 / 0.3)"
                        : "oklch(0.22 0.06 145 / 0.3)",
                    }}
                  >
                    <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 border ${
                      isReset
                        ? "bg-orange-500/20 border-orange-500/30"
                        : "bg-green-500/20 border-green-500/30"
                    }`}>
                      {isReset
                        ? <RotateCcw className="h-4 w-4 text-orange-400" />
                        : <ArrowDownLeft className="h-4 w-4 text-green-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-muted-foreground">{new Date(tx.created_at).toLocaleString()}</div>
                      <div className={`text-sm font-semibold ${isReset ? "text-orange-300" : "text-green-300"}`}>
                        {tx.note ?? (isReset ? "Wallet reset" : "Cleared from cashier")}
                      </div>
                    </div>
                    <div className={`font-black text-lg shrink-0 ${isReset ? "text-orange-400" : "text-green-400"}`}>
                      {isReset
                        ? `-$${Math.abs(Number(tx.amount)).toFixed(2)}`
                        : `+$${Number(tx.amount).toFixed(2)}`}
                    </div>
                  </div>
                );
              }

              const o = rec.data;
              return (
                <div key={o.id} className="rounded-xl p-4 border border-border" style={{ background: "var(--gradient-card)" }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <Receipt className="h-4 w-4 text-primary shrink-0" />
                      <span className="text-xs text-muted-foreground truncate">{new Date(o.created_at).toLocaleString()}</span>
                    </div>
                    <div className="font-black text-primary text-lg shrink-0 ml-2">${Number(o.total).toFixed(2)}</div>
                  </div>
                  <div className="mt-1.5 text-sm text-muted-foreground line-clamp-2">
                    {(o.items || []).map((i) => `${i.qty}× ${i.name}`).join(" · ")}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Paid ${Number(o.paid).toFixed(2)} · Change ${Number(o.change_given).toFixed(2)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <PaginationBar page={page} totalPages={totalPages} total={total} onPrev={handlePrev} onNext={handleNext} />
      </section>

      {showStatement && (
        <OwnerStatement profile={profile} onClose={() => setShowStatement(false)} />
      )}
    </div>
  );
}

export default function WalletPage() {
  const { profile } = useAuth();
  if (!profile) return null;
  if (profile.role === "owner") return <OwnerWallet profile={profile} />;
  return <CashierWallet profile={profile} />;
}
