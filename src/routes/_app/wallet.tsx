import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Wallet as WalletIcon, Receipt, ChevronLeft, ChevronRight, ArrowDownLeft, RotateCcw, Loader2, FileText, Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { downloadPdf } from "@/lib/download";
import { drawHeader, addFootersToAllPages, LM, RM, CONTENT_BOTTOM } from "@/lib/pdfHelpers";

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
      {/* Sticky page title */}
      <div className="sticky top-[44px] z-20 -mx-3 px-3 pt-2 pb-2 bg-background/95 backdrop-blur border-b border-border">
        <h1 className="text-xl font-black leading-tight">Wallet</h1>
      </div>

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
  const [downloadingMonth, setDownloadingMonth] = useState<string | null>(null);

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
    if (downloadingMonth) return;
    setDownloadingMonth(month);
    try {
      const monthRecords = getRecordsForMonth(month);
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "mm", format: "a4" });

      const businessName = profile.username ?? "Owner";
      const generated = new Date().toLocaleString();

      // ── Calculate summary figures ──────────────────────────────────────────
      const orders = monthRecords.filter((r) => r.kind === "order");
      const txs    = monthRecords.filter((r) => r.kind === "tx");

      const totalSales    = orders.reduce((s, r) => s + Number((r.data as Order).total), 0);
      const totalCleared  = txs
        .filter((r) => (r.data as WalletTx).type === "transfer_in")
        .reduce((s, r) => s + Math.abs(Number((r.data as WalletTx).amount)), 0);
      const totalResets   = txs
        .filter((r) => (r.data as WalletTx).type === "wallet_reset")
        .reduce((s, r) => s + Math.abs(Number((r.data as WalletTx).amount)), 0);
      // Opening balance = total sales for the period (before any clears/resets)
      // Closing balance = what remains after clears and resets
      const openingBalance = totalSales;
      const closingBalance = totalSales - totalCleared - totalResets;

      // Draw header and get starting Y
      let y = await drawHeader(doc, businessName, "Wallet Statement", month, generated);

      // ── Summary box ───────────────────────────────────────────────────────
      const boxX = LM;
      const boxW = RM - LM;
      const boxH = 28;
      doc.setFillColor(245, 240, 230);
      doc.roundedRect(boxX, y, boxW, boxH, 2, 2, "F");
      doc.setDrawColor(232, 146, 42);
      doc.setLineWidth(0.4);
      doc.roundedRect(boxX, y, boxW, boxH, 2, 2, "S");

      // Summary title
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(100, 70, 10);
      doc.text("PERIOD SUMMARY", boxX + 3, y + 5);

      // Four columns: Opening Balance | Total Sales | Total Cleared | Closing Balance
      const cols = [
        { label: "Opening Balance", value: "$" + openingBalance.toFixed(2) },
        { label: "Total Cleared",   value: "$" + totalCleared.toFixed(2) },
        { label: "Total Resets",    value: "$" + totalResets.toFixed(2) },
        { label: "Closing Balance", value: "$" + closingBalance.toFixed(2) },
      ];
      const colW = boxW / cols.length;
      cols.forEach((col, i) => {
        const cx = boxX + i * colW + colW / 2;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.5);
        doc.setTextColor(100, 100, 100);
        doc.text(col.label, cx, y + 13, { align: "center" });
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        // Closing balance green if positive, red if negative
        if (col.label === "Closing Balance") {
          doc.setTextColor(closingBalance >= 0 ? 40 : 180, closingBalance >= 0 ? 140 : 40, 40);
        } else {
          doc.setTextColor(30, 30, 30);
        }
        doc.text(col.value, cx, y + 21, { align: "center" });
      });

      doc.setTextColor(0, 0, 0);
      y += boxH + 5;

      // ── Column headers ────────────────────────────────────────────────────
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(130, 130, 130);
      doc.text("DATE / ITEMS", LM, y);
      doc.text("AMOUNT", RM, y, { align: "right" });
      y += 3;
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.2);
      doc.line(LM, y, RM, y);
      y += 4;

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(0, 0, 0);

      monthRecords.forEach((rec) => {
        if (y > CONTENT_BOTTOM) { doc.addPage(); y = 20; }
        if (rec.kind === "order") {
          const o = rec.data as Order;
          doc.setFont("helvetica", "bold");
          doc.text(new Date(o.created_at).toLocaleString(), LM, y);
          doc.text("$" + Number(o.total).toFixed(2), RM, y, { align: "right" });
          y += 5;
          doc.setFont("helvetica", "normal");
          const items = (o.items || []).map((i) => i.qty + "x " + i.name).join(", ");
          const wrapped = doc.splitTextToSize("  " + items, 155);
          doc.text(wrapped, LM, y);
          y += wrapped.length * 4.5 + 1;
          doc.setTextColor(100, 100, 100);
          doc.text("  Paid $" + Number(o.paid).toFixed(2) + "   Change $" + Number(o.change_given).toFixed(2), LM, y);
          doc.setTextColor(0, 0, 0);
          y += 4;
          doc.setDrawColor(220, 220, 220);
          doc.setLineWidth(0.1);
          doc.line(LM, y, RM, y);
          y += 4;
        } else {
          const tx = rec.data as WalletTx;
          const isReset = tx.type === "wallet_reset";
          const label = tx.note ?? (isReset ? "Wallet reset" : "Cleared from cashier");
          const sign = isReset ? "-" : "+";
          doc.setFont("helvetica", "bold");
          doc.setTextColor(isReset ? 200 : 40, isReset ? 80 : 140, isReset ? 40 : 80);
          doc.text(new Date(tx.created_at).toLocaleString(), LM, y);
          doc.text(label, LM + 55, y);
          doc.text(sign + "$" + Math.abs(Number(tx.amount)).toFixed(2), RM, y, { align: "right" });
          doc.setTextColor(0, 0, 0);
          doc.setFont("helvetica", "normal");
          y += 4;
          doc.setDrawColor(220, 220, 220);
          doc.setLineWidth(0.1);
          doc.line(LM, y, RM, y);
          y += 4;
        }
      });

      addFootersToAllPages(doc);

      const filename = "wallet-statement-" + businessName + "-" + month.replace(/\s/g, "-") + ".pdf";
      await downloadPdf(filename, doc.output("datauristring"));
      toast.success("PDF saved to Downloads folder");
    } catch (err: any) {
      console.error("PDF download error:", err);
      toast.error("Download failed: " + (err?.message ?? "unknown error"));
    } finally {
      setDownloadingMonth(null);
    }
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
                          type="button"
                          disabled={downloadingMonth === month}
                          onClick={(e) => { e.stopPropagation(); handleDownload(month); }}
                        >
                          {downloadingMonth === month
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : <Download className="h-3 w-3" />}
                          {downloadingMonth === month ? "…" : "PDF"}
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
      {/* Sticky page title */}
      <div className="sticky top-[44px] z-20 -mx-3 px-3 pt-2 pb-2 bg-background/95 backdrop-blur border-b border-border">
        <h1 className="text-xl font-black leading-tight">Wallet</h1>
      </div>

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
