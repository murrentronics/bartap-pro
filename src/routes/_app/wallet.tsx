import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import {
  Wallet as WalletIcon, Receipt, ChevronLeft, ChevronRight,
  ArrowDownLeft, RotateCcw, Loader2, FileText, Download, X,
  TrendingUp, TrendingDown, DollarSign, PlusCircle, ChevronDown,
  BarChart3, List, Calculator, Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { downloadPdf } from "@/lib/download";
import { drawHeader, addFootersToAllPages, LM, RM, CONTENT_BOTTOM } from "@/lib/pdfHelpers";

// ─── Typed supabase helpers for new tables ────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

// ─── Types ────────────────────────────────────────────────────────────────────
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

type OwnerFinancials = {
  id: string;
  initial_expense: number;
};

type OwnerExpense = {
  id: string;
  amount: number;
  description: string | null;
  expense_date: string;
  created_at: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────
const TX_PAGE_SIZE = 100;
const ORDERS_PAGE_SIZE = 200;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmt(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function monthKey(date: string) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(key: string) {
  const [y, m] = key.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-GB", {
    year: "numeric", month: "long",
  });
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// ─── Pagination Bar ──────────────────────────────────────────────────────────
function PaginationBar({
  page, totalPages, total, onPrev, onNext,
}: {
  page: number; totalPages: number; total: number; onPrev: () => void; onNext: () => void;
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

// ─── Cashier Wallet ───────────────────────────────────────────────────────────
function CashierWallet({ profile }: { profile: { id: string; wallet_balance: number; role: string } }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const totalPages = Math.max(1, Math.ceil(total / ORDERS_PAGE_SIZE));

  useEffect(() => {
    setLoading(true);
    supabase.from("orders").select("id", { count: "exact", head: true })
      .eq("cashier_id", profile.id)
      .then(({ count }) => setTotal(count ?? 0));
    supabase.from("orders").select("*")
      .eq("cashier_id", profile.id)
      .order("created_at", { ascending: false })
      .range(page * ORDERS_PAGE_SIZE, page * ORDERS_PAGE_SIZE + ORDERS_PAGE_SIZE - 1)
      .then(({ data }) => { setOrders((data ?? []) as unknown as Order[]); setLoading(false); });
  }, [profile.id, page]);

  const handlePrev = () => { setPage((p) => p - 1); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const handleNext = () => { setPage((p) => p + 1); window.scrollTo({ top: 0, behavior: "smooth" }); };

  return (
    <div className="space-y-5">
      <div className="sticky top-0 z-20 -mx-3 px-3 pt-2 pb-2 bg-background/95 backdrop-blur border-b border-border">
        <h1 className="text-xl font-black leading-tight">Wallet</h1>
      </div>
      <section className="rounded-3xl p-6 relative overflow-hidden"
        style={{ background: "var(--gradient-hero)", boxShadow: "var(--shadow-glow)" }}>
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="relative">
          <div className="flex items-center gap-2 text-primary-foreground/80 text-sm font-medium">
            <WalletIcon className="h-4 w-4" /> Wallet Balance
          </div>
          <div className="text-4xl sm:text-6xl font-black text-primary-foreground mt-2 tracking-tight">
            ${fmt(Number(profile.wallet_balance))}
          </div>
          <div className="mt-3 text-primary-foreground/80 text-sm">Cashier — clears to owner</div>
        </div>
      </section>
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-black text-xl">Orders</h2>
          <span className="text-sm text-muted-foreground">{total} total</span>
        </div>
        <PaginationBar page={page} totalPages={totalPages} total={total} onPrev={handlePrev} onNext={handleNext} />
        {loading ? (
          <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="rounded-xl h-20 bg-muted/30 animate-pulse" />)}</div>
        ) : orders.length === 0 ? (
          <div className="text-muted-foreground text-sm py-8 text-center">No orders yet.</div>
        ) : (
          <div className="space-y-2">
            {orders.map((o) => (
              <div key={o.id} className="rounded-xl p-4 border border-border" style={{ background: "var(--gradient-card)" }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <Receipt className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-xs text-muted-foreground truncate">{new Date(o.created_at).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true, day: "numeric", month: "short", year: "numeric" })}</span>
                  </div>
                  <div className="font-black text-primary text-lg shrink-0 ml-2">${fmt(Number(o.total))}</div>
                </div>
                <div className="mt-1.5 text-sm text-muted-foreground line-clamp-2">
                  {(o.items || []).map((i) => `${i.qty}× ${i.name}`).join(" · ")}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Paid ${fmt(Number(o.paid))} · Change ${fmt(Number(o.change_given))}
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
      // Only owner's own direct sales (cashier_id = owner_id)
      supabase.from("orders").select("*")
        .eq("owner_id", profile.id)
        .eq("cashier_id", profile.id)
        .order("created_at", { ascending: false })
        .then(({ data }) => setOrders((data ?? []) as unknown as Order[])),
      supabase.from("wallet_transactions").select("*").eq("profile_id", profile.id)
        .in("type", ["transfer_in", "cashier_sale", "bottle_finished", "pack_finished"])
        .order("created_at", { ascending: false })
        .then(({ data }) => setTxs((data ?? []) as WalletTx[])),
    ]).finally(() => setLoading(false));
  }, [profile.id]);

  const allRecords: OwnerFlatRecord[] = [
    ...orders.map((o): OwnerFlatRecord => ({ kind: "order", data: o, ts: new Date(o.created_at).getTime() })),
    ...txs.map((tx): OwnerFlatRecord => ({ kind: "tx", data: tx, ts: new Date(tx.created_at).getTime() })),
  ].sort((a, b) => b.ts - a.ts);

  const months = Array.from(new Set(allRecords.map((r) =>
    new Date(r.data.created_at).toLocaleDateString("en-GB", { year: "numeric", month: "long" })
  )));

  const getRecordsForMonth = (month: string) =>
    allRecords.filter((r) =>
      new Date(r.data.created_at).toLocaleDateString("en-GB", { year: "numeric", month: "long" }) === month
    );

  const handleDownload = async (month: string) => {
    if (downloadingMonth) return;
    setDownloadingMonth(month);
    try {
      const monthRecords = getRecordsForMonth(month);
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "mm", format: "a4" });
      const businessName = profile.username ?? "Owner";
      const generated = new Date().toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true, day: "numeric", month: "short", year: "numeric" });
      const ordersR = monthRecords.filter((r) => r.kind === "order");
      const txsR = monthRecords.filter((r) => r.kind === "tx");
      const totalSales = ordersR.reduce((s, r) => s + Number((r.data as Order).total), 0);
      const openingBalance = 0;
      const closingBalance = totalSales;
      let y = await drawHeader(doc, businessName, "Wallet Statement", month, generated);
      const boxX = LM; const boxW = RM - LM; const boxH = 28;
      doc.setFillColor(245, 240, 230);
      doc.roundedRect(boxX, y, boxW, boxH, 2, 2, "F");
      doc.setDrawColor(232, 146, 42); doc.setLineWidth(0.4);
      doc.roundedRect(boxX, y, boxW, boxH, 2, 2, "S");
      doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(100, 70, 10);
      doc.text("PERIOD SUMMARY", boxX + 3, y + 5);
      const cols = [
        { label: "Opening Balance", value: "$" + fmt(openingBalance) },
        { label: "Closing Balance", value: "$" + fmt(closingBalance) },
      ];
      const colW = boxW / cols.length;
      cols.forEach((col, i) => {
        const cx = boxX + i * colW + colW / 2;
        doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(100, 100, 100);
        doc.text(col.label, cx, y + 13, { align: "center" });
        doc.setFont("helvetica", "bold"); doc.setFontSize(9);
        if (col.label === "Closing Balance") {
          doc.setTextColor(closingBalance >= 0 ? 40 : 180, closingBalance >= 0 ? 140 : 40, 40);
        } else { doc.setTextColor(30, 30, 30); }
        doc.text(col.value, cx, y + 21, { align: "center" });
      });
      doc.setTextColor(0, 0, 0); y += boxH + 5;
      doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(130, 130, 130);
      doc.text("DATE / ITEMS", LM, y); doc.text("AMOUNT", RM, y, { align: "right" }); y += 3;
      doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.2); doc.line(LM, y, RM, y); y += 4;
      doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(0, 0, 0);
      monthRecords.forEach((rec) => {
        if (y > CONTENT_BOTTOM) { doc.addPage(); y = 20; }
        if (rec.kind === "order") {
          const o = rec.data as Order;
          doc.setFont("helvetica", "bold");
          doc.text(new Date(o.created_at).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true, day: "numeric", month: "short", year: "numeric" }), LM, y);
          doc.text("$" + Number(o.total).toFixed(2), RM, y, { align: "right" }); y += 5;
          doc.setFont("helvetica", "normal");
          const items = (o.items || []).map((i) => i.qty + "x " + i.name).join(", ");
          const wrapped = doc.splitTextToSize("  " + items, 155);
          doc.text(wrapped, LM, y); y += wrapped.length * 4.5 + 1;
          doc.setTextColor(100, 100, 100);
          doc.text("  Paid $" + Number(o.paid).toFixed(2) + "   Change $" + Number(o.change_given).toFixed(2), LM, y);
          doc.setTextColor(0, 0, 0); y += 4;
          doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.1); doc.line(LM, y, RM, y); y += 4;
        } else {
          const tx = rec.data as WalletTx;
          const isCashierSale = tx.type === "cashier_sale";
          const isTransferIn  = tx.type === "transfer_in";
          const isBottlePack  = tx.type === "bottle_finished" || tx.type === "pack_finished";

          doc.setFont("helvetica", "bold");
          if (isCashierSale) {
            // Blue read-only — show inline, no amount column
            doc.setTextColor(60, 100, 200);
            const parts = (tx.note ?? "").split(" | ");
            const cashierLabel = parts[0] ?? "Cashier sale";
            const totalStr     = parts[1] ?? "";
            const itemsStr     = parts.slice(2).join(", ");
            doc.text(new Date(tx.created_at).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true, day: "numeric", month: "short", year: "numeric" }), LM, y);
            doc.text(cashierLabel + (totalStr ? " — " + totalStr : ""), LM + 45, y);
            doc.setTextColor(0, 0, 0); doc.setFont("helvetica", "normal");
            if (itemsStr) {
              y += 4;
              doc.setFontSize(8); doc.setTextColor(100, 100, 100);
              const wrapped = doc.splitTextToSize("  " + itemsStr, 155);
              doc.text(wrapped, LM, y); y += wrapped.length * 3.5;
              doc.setFontSize(9); doc.setTextColor(0, 0, 0);
            }
          } else if (isTransferIn) {
            doc.setTextColor(40, 140, 40);
            const label = tx.note ?? "Cleared from cashier";
            doc.text(new Date(tx.created_at).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true, day: "numeric", month: "short", year: "numeric" }), LM, y);
            doc.text(label, LM + 45, y);
            doc.text("+$" + Number(tx.amount).toFixed(2), RM, y, { align: "right" });
            doc.setTextColor(0, 0, 0); doc.setFont("helvetica", "normal");
          } else if (isBottlePack) {
            doc.setTextColor(180, 120, 30);
            const label = tx.note ?? "Pack/Bottle closed";
            doc.text(new Date(tx.created_at).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true, day: "numeric", month: "short", year: "numeric" }), LM, y);
            const wrapped = doc.splitTextToSize(label, 140);
            doc.text(wrapped, LM + 45, y);
            doc.setTextColor(0, 0, 0); doc.setFont("helvetica", "normal");
            y += (wrapped.length - 1) * 4.5;
          } else {
            doc.setTextColor(100, 100, 100);
            const label = tx.note ?? tx.type;
            doc.text(new Date(tx.created_at).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true, day: "numeric", month: "short", year: "numeric" }), LM, y);
            doc.text(label, LM + 45, y);
            if (Number(tx.amount) !== 0) doc.text("$" + Math.abs(Number(tx.amount)).toFixed(2), RM, y, { align: "right" });
            doc.setTextColor(0, 0, 0); doc.setFont("helvetica", "normal");
          }
          y += 4;
          doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.1); doc.line(LM, y, RM, y); y += 4;
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
      <div className="relative w-full max-w-lg rounded-3xl border border-border shadow-2xl mt-4 mb-8"
        style={{ background: "var(--gradient-card)" }}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border">
          <div>
            <h2 className="text-xl font-black">Owner Statement</h2>
            <p className="text-sm text-muted-foreground">Your wallet records</p>
          </div>
          <button onClick={onClose}
            className="h-9 w-9 rounded-full flex items-center justify-center bg-muted hover:bg-muted/80 transition">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="rounded-xl h-16 bg-muted/30 animate-pulse" />)}</div>
          ) : months.length === 0 ? (
            <div className="text-muted-foreground text-sm py-8 text-center">No records yet.</div>
          ) : (
            <div className="space-y-4">
              {months.map((month) => {
                const monthRecords = getRecordsForMonth(month);
                const monthTotal = monthRecords.filter((r) => r.kind === "order")
                  .reduce((s, r) => s + Number((r.data as Order).total), 0);
                const isOpen = selectedMonth === month;
                return (
                  <div key={month} className="rounded-2xl border border-border overflow-hidden">
                    <button className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition"
                      onClick={() => setSelectedMonth(isOpen ? null : month)}>
                      <span className="font-black text-sm">{month}</span>
                      <div className="flex items-center gap-3">
                        <span className="font-black text-primary">${fmt(monthTotal)}</span>
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" type="button"
                          disabled={downloadingMonth === month}
                          onClick={(e) => { e.stopPropagation(); handleDownload(month); }}>
                          {downloadingMonth === month ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                          {downloadingMonth === month ? "…" : "PDF"}
                        </Button>
                        <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`} />
                      </div>
                    </button>
                    {isOpen && (
                      <div className="border-t border-border divide-y divide-border/50">
                        {monthRecords.map((rec) => {
                          if (rec.kind === "tx") {
                            const tx = rec.data;
                            const isCashierSale = tx.type === "cashier_sale";
                            const isTransferIn  = tx.type === "transfer_in";
                            const isBottlePack  = tx.type === "bottle_finished" || tx.type === "pack_finished";

                            if (isCashierSale) {
                              const parts = (tx.note ?? "").split(" | ");
                              const cashierLabel = parts[0] ?? "Cashier sale";
                              const totalStr     = parts[1] ?? "";
                              const itemsStr     = parts.slice(2).join(", ");
                              return (
                                <div key={tx.id} className="px-4 py-3 bg-blue-500/5 flex items-start gap-3">
                                  <div className="h-3.5 w-3.5 mt-0.5 shrink-0 text-blue-400">🧾</div>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-xs text-blue-400 font-bold">{cashierLabel}{totalStr ? " — " + totalStr : ""}</div>
                                    {itemsStr && <div className="text-xs text-muted-foreground mt-0.5">{itemsStr}</div>}
                                    <div className="text-xs text-muted-foreground mt-0.5">{new Date(tx.created_at).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true, day: "numeric", month: "short", year: "numeric" })}</div>
                                  </div>
                                </div>
                              );
                            }
                            if (isTransferIn) {
                              return (
                                <div key={tx.id} className="px-4 py-3 flex items-center gap-3 bg-green-500/5">
                                  <ArrowDownLeft className="h-3.5 w-3.5 text-green-400 shrink-0" />
                                  <div className="flex-1 text-xs text-green-400">
                                    {tx.note ?? "Cleared from cashier"}
                                    {" · "}{new Date(tx.created_at).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true, day: "numeric", month: "short", year: "numeric" })}
                                  </div>
                                  <span className="font-black text-sm text-green-400">
                                    +${Number(tx.amount).toFixed(2)}
                                  </span>
                                </div>
                              );
                            }
                            if (isBottlePack) {
                              return (
                                <div key={tx.id} className="px-4 py-3 flex items-start gap-3 bg-amber-500/5">
                                  <span className="text-base shrink-0">🍾</span>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-xs text-amber-400 font-bold line-clamp-2">{tx.note}</div>
                                    <div className="text-xs text-muted-foreground mt-0.5">{new Date(tx.created_at).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true, day: "numeric", month: "short", year: "numeric" })}</div>
                                  </div>
                                </div>
                              );
                            }
                            return null;
                          }
                          const o = rec.data as Order;
                          return (
                            <div key={o.id} className="px-4 py-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 min-w-0">
                                  <Receipt className="h-3.5 w-3.5 text-primary shrink-0" />
                                  <span className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true, day: "numeric", month: "short", year: "numeric" })}</span>
                                </div>
                                <span className="font-black text-primary text-sm ml-2">${fmt(Number(o.total))}</span>
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground line-clamp-2">
                                {(o.items || []).map((i) => `${i.qty}× ${i.name}`).join(" · ")}
                              </div>
                              <div className="mt-0.5 text-xs text-muted-foreground">
                                Paid ${fmt(Number(o.paid))} · Change ${fmt(Number(o.change_given))}
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

// ─── In-App Number Pad ────────────────────────────────────────────────────────
function NumPad({
  value,
  onChange,
  onDone,
  onCancel,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  onDone: () => void;
  onCancel: () => void;
  label?: string;
}) {
  const press = (key: string) => {
    if (key === "⌫") {
      onChange(value.slice(0, -1));
    } else if (key === ".") {
      if (!value.includes(".")) onChange(value + ".");
    } else {
      // Prevent more than 2 decimal places
      const parts = value.split(".");
      if (parts[1] !== undefined && parts[1].length >= 2) return;
      onChange(value + key);
    }
  };

  const display = value === "" ? "0" : value;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={onCancel}>
      <div
        className="w-full max-w-sm rounded-t-3xl pb-8 pt-4 px-4 space-y-3"
        style={{ background: "oklch(0.13 0.03 60)", border: "1px solid oklch(0.3 0.08 60)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Label */}
        {label && (
          <p className="text-center text-xs font-semibold" style={{ color: "oklch(0.65 0.15 65)" }}>{label}</p>
        )}

        {/* Display */}
        <div className="rounded-2xl px-5 py-4 text-right"
          style={{ background: "oklch(0.18 0.04 60)", border: "1px solid oklch(0.28 0.08 60)" }}>
          <span className="font-black text-4xl" style={{ color: "oklch(0.82 0.18 65)" }}>
            ${display}
          </span>
        </div>

        {/* Keys */}
        <div className="grid grid-cols-3 gap-2">
          {["7","8","9","4","5","6","1","2","3"].map(k => (
            <button key={k} onClick={() => press(k)}
              className="rounded-2xl py-4 text-xl font-black active:scale-95 transition"
              style={{ background: "oklch(0.20 0.05 60)", color: "#fff" }}>
              {k}
            </button>
          ))}
          <button onClick={() => press(".")}
            className="rounded-2xl py-4 text-xl font-black active:scale-95 transition"
            style={{ background: "oklch(0.20 0.05 60)", color: "#fff" }}>
            .
          </button>
          <button onClick={() => press("0")}
            className="rounded-2xl py-4 text-xl font-black active:scale-95 transition"
            style={{ background: "oklch(0.20 0.05 60)", color: "#fff" }}>
            0
          </button>
          <button onClick={() => press("⌫")}
            className="rounded-2xl py-4 text-xl font-black active:scale-95 transition"
            style={{ background: "oklch(0.20 0.05 60)", color: "oklch(0.75 0.15 65)" }}>
            ⌫
          </button>
        </div>

        {/* Done */}
        <button onClick={onDone}
          className="w-full py-4 rounded-2xl text-base font-black active:scale-95 transition"
          style={{ background: "oklch(0.60 0.18 65)", color: "#000" }}>
          Done
        </button>
      </div>
    </div>
  );
}

// ─── Financials Tab ───────────────────────────────────────────────────────────
function FinancialsTab({ ownerId, totalIncome, onDataChange }: { ownerId: string; totalIncome: number; onDataChange?: () => void }) {
  const [financials, setFinancials] = useState<OwnerFinancials | null>(null);
  const [expenses, setExpenses] = useState<OwnerExpense[]>([]);
  const [monthlyIncome, setMonthlyIncome] = useState<Record<string, number>>({});
  const [loadingData, setLoadingData] = useState(true);
  const [downloadingMonth, setDownloadingMonth] = useState<string | null>(null);

  // Initial expense
  const [editingInitial, setEditingInitial] = useState(false);
  const [initialInput, setInitialInput] = useState("");
  const [showInitialPad, setShowInitialPad] = useState(false);
  const [savingInitial, setSavingInitial] = useState(false);

  // Monthly expense form
  const [expAmount, setExpAmount] = useState("");
  const [expDesc, setExpDesc] = useState("");
  const [expDate, setExpDate] = useState(todayISO());
  const [showExpPad, setShowExpPad] = useState(false);
  const [savingExp, setSavingExp] = useState(false);

  // Add expense form open/closed
  const [expFormOpen, setExpFormOpen] = useState(false);

  // Accordion
  const [openMonth, setOpenMonth] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoadingData(true);
    const [finRes, expRes, ordRes] = await Promise.all([
      sb.from("owner_financials").select("*").eq("owner_id", ownerId).maybeSingle(),
      sb.from("owner_expenses").select("*").eq("owner_id", ownerId).order("expense_date", { ascending: false }),
      // Fetch ALL orders for this owner (owner's own + all cashiers) — for monthly income breakdown
      supabase.from("orders").select("total, created_at").eq("owner_id", ownerId),
    ]);
    setFinancials(finRes.data as OwnerFinancials | null);
    setExpenses((expRes.data ?? []) as OwnerExpense[]);
    // Build per-month income map from all owner orders
    const incomeMap: Record<string, number> = {};
    for (const o of (ordRes.data ?? []) as { total: number; created_at: string }[]) {
      const mk = monthKey(o.created_at);
      incomeMap[mk] = (incomeMap[mk] ?? 0) + Number(o.total);
    }
    setMonthlyIncome(incomeMap);
    setLoadingData(false);
  }, [ownerId]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Derived totals ────────────────────────────────────────────────────────
  const initialExpense = financials ? Number(financials.initial_expense) : 0;
  const monthlyExpensesTotal = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const totalExpenses = initialExpense + monthlyExpensesTotal;
  const netProfit = totalIncome - totalExpenses;

  // ── Group expenses by month ───────────────────────────────────────────────
  const expensesByMonth: Record<string, OwnerExpense[]> = {};
  expenses.forEach((e) => {
    const key = monthKey(e.expense_date);
    if (!expensesByMonth[key]) expensesByMonth[key] = [];
    expensesByMonth[key].push(e);
  });
  const expenseMonths = Object.keys(expensesByMonth).sort((a, b) => b.localeCompare(a));

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleSaveInitial = async () => {
    const val = parseFloat(initialInput);
    if (isNaN(val) || val < 0) { toast.error("Enter a valid amount"); return; }
    setSavingInitial(true);
    if (financials) {
      const { error } = await sb.from("owner_financials")
        .update({ initial_expense: val }).eq("id", financials.id);
      if (error) { toast.error(error.message); setSavingInitial(false); return; }
    } else {
      const { error } = await sb.from("owner_financials")
        .insert({ owner_id: ownerId, initial_expense: val });
      if (error) { toast.error(error.message); setSavingInitial(false); return; }
    }
    setSavingInitial(false);
    setInitialInput("");
    setEditingInitial(false);
    toast.success("Initial expense saved");
    await loadData();
    onDataChange?.();
  };

  const handleSaveExpense = async () => {
    const val = parseFloat(expAmount);
    if (isNaN(val) || val <= 0) { toast.error("Enter a valid amount"); return; }
    if (!expDate) { toast.error("Select a date"); return; }
    setSavingExp(true);
    const { error } = await sb.from("owner_expenses").insert({
      owner_id: ownerId,
      amount: val,
      description: expDesc.trim() || null,
      expense_date: expDate,
    });
    if (error) { toast.error(error.message); setSavingExp(false); return; }
    setSavingExp(false);
    setExpAmount("");
    setExpDesc("");
    setExpDate(todayISO());
    toast.success("Expense recorded");
    setOpenMonth(monthKey(expDate));
    await loadData();
    onDataChange?.();
  };

  const handleDeleteExpense = async (id: string) => {
    const { error } = await sb.from("owner_expenses").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Expense removed");
    await loadData();
    onDataChange?.();
  };

  const handleDownloadExpenseSheet = async (mk: string) => {
    if (downloadingMonth) return;
    setDownloadingMonth(mk);
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "mm", format: "a4" });
      const label = monthLabel(mk);
      const generated = new Date().toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true, day: "numeric", month: "short", year: "numeric" });

      const mExpenses = expensesByMonth[mk] ?? [];
      const mExpTotal = mExpenses.reduce((s, e) => s + Number(e.amount), 0);
      const mIncome   = monthlyIncome[mk] ?? 0;
      // All-time totals for net profit
      const allTimeIncome   = Object.values(monthlyIncome).reduce((s, v) => s + v, 0);
      const allTimeExpenses = initialExpense + monthlyExpensesTotal;
      const allTimeNet      = allTimeIncome - allTimeExpenses;

      let y = await drawHeader(doc, "Owner Financials", "Expense Report", label, generated);

      // ── Summary box ──────────────────────────────────────────────────────
      const boxX = LM; const boxW = RM - LM; const boxH = 28;
      doc.setFillColor(245, 240, 230);
      doc.roundedRect(boxX, y, boxW, boxH, 2, 2, "F");
      doc.setDrawColor(232, 146, 42); doc.setLineWidth(0.4);
      doc.roundedRect(boxX, y, boxW, boxH, 2, 2, "S");
      doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(100, 70, 10);
      doc.text("SUMMARY (ALL TIME TO " + label.toUpperCase() + ")", boxX + 3, y + 5);

      const cols = [
        { label: "This Month Income",  value: "$" + fmt(mIncome)       },
        { label: "Total Expenses",     value: "$" + fmt(allTimeExpenses) },
        { label: "Net Profit",         value: (allTimeNet >= 0 ? "+" : "") + "$" + fmt(allTimeNet) },
      ];
      const colW = boxW / cols.length;
      cols.forEach((col, i) => {
        const cx = boxX + i * colW + colW / 2;
        doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(100, 100, 100);
        doc.text(col.label, cx, y + 13, { align: "center" });
        doc.setFont("helvetica", "bold"); doc.setFontSize(9);
        if (col.label === "Net Profit") {
          doc.setTextColor(allTimeNet >= 0 ? 40 : 180, allTimeNet >= 0 ? 140 : 40, 40);
        } else if (col.label === "Total Expenses") {
          doc.setTextColor(180, 40, 40);
        } else {
          doc.setTextColor(30, 30, 30);
        }
        doc.text(col.value, cx, y + 21, { align: "center" });
      });
      doc.setTextColor(0, 0, 0); y += boxH + 5;

      // ── Column headers ────────────────────────────────────────────────────
      doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(130, 130, 130);
      doc.text("DATE / DESCRIPTION", LM, y);
      doc.text("AMOUNT", RM, y, { align: "right" }); y += 3;
      doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.2); doc.line(LM, y, RM, y); y += 5;
      doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(0, 0, 0);

      // ── Rows ─────────────────────────────────────────────────────────────
      mExpenses.forEach((e) => {
        if (y > CONTENT_BOTTOM) { doc.addPage(); y = 20; }
        const dateStr = new Date(e.expense_date + "T00:00:00").toLocaleDateString("en-GB", {
          day: "numeric", month: "short", year: "numeric",
        });
        doc.setFont("helvetica", "bold");
        doc.text(dateStr, LM, y);
        doc.setTextColor(180, 40, 40);
        doc.text("$" + Number(e.amount).toFixed(2), RM, y, { align: "right" });
        doc.setTextColor(0, 0, 0); doc.setFont("helvetica", "normal"); y += 5;
        if (e.description) {
          doc.setTextColor(100, 100, 100); doc.setFontSize(8);
          doc.text("  " + e.description, LM, y);
          doc.setTextColor(0, 0, 0); doc.setFontSize(9); y += 4;
        }
        doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.1); doc.line(LM, y, RM, y); y += 4;
      });

      // ── Totals footer ─────────────────────────────────────────────────────
      y += 2;
      doc.setFont("helvetica", "bold"); doc.setFontSize(9);
      doc.setDrawColor(232, 146, 42); doc.setLineWidth(0.5); doc.line(LM, y, RM, y); y += 5;
      doc.setTextColor(100, 70, 10);
      doc.text("THIS MONTH INCOME", LM, y);
      doc.setTextColor(40, 140, 40);
      doc.text("$" + fmt(mIncome), RM, y, { align: "right" }); y += 6;
      doc.setTextColor(100, 70, 10);
      doc.text("TOTAL EXPENSES (ALL TIME)", LM, y);
      doc.setTextColor(180, 40, 40);
      doc.text("$" + fmt(allTimeExpenses), RM, y, { align: "right" }); y += 6;
      doc.setTextColor(100, 70, 10);
      doc.text("NET PROFIT (ALL TIME)", LM, y);
      doc.setTextColor(allTimeNet >= 0 ? 40 : 180, allTimeNet >= 0 ? 140 : 40, 40);
      doc.text((allTimeNet >= 0 ? "+" : "") + "$" + fmt(allTimeNet), RM, y, { align: "right" });

      addFootersToAllPages(doc);
      const filename = `expense-report-${label.replace(/\s/g, "-")}.pdf`;
      await downloadPdf(filename, doc.output("datauristring"));
      toast.success("PDF saved to Downloads folder");
    } catch (err: any) {
      console.error("Expense PDF error:", err);
      toast.error("Download failed: " + (err?.message ?? "unknown error"));
    } finally {
      setDownloadingMonth(null);
    }
  };

  if (loadingData) {
    return (
      <div className="space-y-3 pt-2">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="rounded-xl h-16 bg-muted/30 animate-pulse" />)}
      </div>
    );
  }

  const currentMonthKey = monthKey(todayISO());
  const currentMonthExpenses = expensesByMonth[currentMonthKey] ?? [];
  const currentMonthTotal = currentMonthExpenses.reduce((s, e) => s + Number(e.amount), 0);

  return (
    <div className="space-y-5 pt-2 pb-24">

      {/* ── Setup / Initial Expense ───────────────────────────────────────── */}
      <div className="rounded-2xl border border-border p-4 space-y-3"
        style={{ background: "var(--gradient-card)" }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calculator className="h-4 w-4 text-primary" />
            <h3 className="font-black text-sm">Initial Bar Setup Cost</h3>
          </div>
        </div>

        {/* Show current value with Edit button — no edit form by default */}
        <div className="flex items-center justify-between rounded-xl bg-muted/30 px-4 py-3">
          <span className="text-sm text-muted-foreground">Initial expense</span>
          <div className="flex items-center gap-2">
            <span className="font-black text-primary text-base">
              {financials && Number(financials.initial_expense) > 0
                ? `$${fmt(Number(financials.initial_expense))}`
                : "Not set"}
            </span>
            <button
              onClick={() => {
                setInitialInput(financials ? String(financials.initial_expense) : "");
                setEditingInitial(true);
                setShowInitialPad(true);
              }}
              className="h-7 w-7 rounded-lg flex items-center justify-center bg-primary/15 hover:bg-primary/25 transition active:scale-95"
              title="Edit initial expense">
              <Pencil className="h-3.5 w-3.5 text-primary" />
            </button>
          </div>
        </div>

        {!financials && (
          <p className="text-xs text-muted-foreground">
            Tap the edit button to enter the total cost of all items currently stocked in your bar.
          </p>
        )}

        {/* Inline edit form — only shows when editing */}
        {editingInitial && (
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-bold">$</span>
              <input
                readOnly
                value={initialInput}
                onFocus={() => setShowInitialPad(true)}
                onClick={() => setShowInitialPad(true)}
                placeholder="0.00"
                className="w-full pl-7 pr-3 py-2.5 rounded-xl border border-border bg-background text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer"
              />
            </div>
            <Button onClick={handleSaveInitial} disabled={savingInitial || !initialInput} className="shrink-0">
              {savingInitial ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
            <Button variant="ghost" onClick={() => { setEditingInitial(false); setInitialInput(""); }} className="shrink-0 px-2">
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* ── This Month's Summary ─────────────────────────────────────────── */}
      {financials !== null && (() => {
        const currentMk = monthKey(todayISO());
        const curIncome = monthlyIncome[currentMk] ?? 0;
        const allTimeIncome = Object.values(monthlyIncome).reduce((s, v) => s + v, 0);
        const allTimeExpenses = initialExpense + monthlyExpensesTotal;
        const allTimeNet = allTimeIncome - allTimeExpenses;
        return (
          <div className="rounded-2xl border border-border p-4 space-y-3" style={{ background: "var(--gradient-card)" }}>
            <h3 className="font-black text-sm flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              {new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" })} — All Time
            </h3>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl p-2.5 text-center" style={{ background: "rgba(34,197,94,0.1)" }}>
                <div className="text-[10px] text-muted-foreground mb-0.5">This Month</div>
                <div className="font-black text-sm text-green-400">${fmt(curIncome)}</div>
              </div>
              <div className="rounded-xl p-2.5 text-center" style={{ background: "rgba(239,68,68,0.1)" }}>
                <div className="text-[10px] text-muted-foreground mb-0.5">Total Expenses</div>
                <div className="font-black text-sm text-red-400">${fmt(allTimeExpenses)}</div>
              </div>
              <div className="rounded-xl p-2.5 text-center" style={{ background: allTimeNet >= 0 ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)" }}>
                <div className="text-[10px] text-muted-foreground mb-0.5">Net Profit</div>
                <div className={`font-black text-sm ${allTimeNet >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {allTimeNet >= 0 ? "+" : ""}${fmt(allTimeNet)}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── This Month's Expenses ─────────────────────────────────────────── */}
      {financials !== null && (
        <div className="rounded-2xl border border-border overflow-hidden"
          style={{ background: "var(--gradient-card)" }}>
          {/* Header row — always visible, click to toggle form */}
          <button
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition"
            onClick={() => setExpFormOpen(o => !o)}>
            <div className="flex items-center gap-2">
              <PlusCircle className="h-4 w-4 text-primary" />
              <h3 className="font-black text-sm">Add Expense</h3>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                {new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
              </span>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expFormOpen ? "rotate-180" : ""}`} />
            </div>
          </button>

          {/* Collapsible form body */}
          {expFormOpen && (
            <div className="border-t border-border px-4 pb-4 pt-3 space-y-3">
              {currentMonthTotal > 0 && (
                <div className="flex items-center justify-between rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-2.5">
                  <span className="text-sm text-red-300">This month's expenses</span>
                  <span className="font-black text-red-400">${fmt(currentMonthTotal)}</span>
                </div>
              )}
              <div className="space-y-2">
                {/* Amount — taps open numpad */}
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-bold pointer-events-none">$</span>
                  <input
                    readOnly
                    value={expAmount}
                    onClick={() => setShowExpPad(true)}
                    placeholder="Total purchase amount"
                    className="w-full pl-7 pr-3 py-2.5 rounded-xl border border-border bg-background text-sm font-semibold focus:outline-none cursor-pointer"
                    style={{ caretColor: "transparent" }}
                  />
                </div>
                <input
                  type="text"
                  placeholder="Description (optional)"
                  value={expDesc}
                  onChange={(e) => setExpDesc(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                <input
                  type="date"
                  value={expDate}
                  onChange={(e) => setExpDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <Button onClick={handleSaveExpense} disabled={savingExp || !expAmount} className="w-full">
                {savingExp ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <PlusCircle className="h-4 w-4 mr-2" />}
                Record Expense
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ── Expense History by Month ──────────────────────────────────────── */}
      {expenseMonths.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-black text-sm text-muted-foreground uppercase tracking-wider px-1">Expense History</h3>
          {expenseMonths.map((mk) => {
            const mExpenses = expensesByMonth[mk];
            const mTotal = mExpenses.reduce((s, e) => s + Number(e.amount), 0);
            const mIncome = monthlyIncome[mk] ?? 0;
            // All-time income up to and including this month
            const allIncomeToMonth = Object.entries(monthlyIncome)
              .filter(([k]) => k <= mk)
              .reduce((s, [, v]) => s + v, 0);
            const allExpenses = initialExpense + monthlyExpensesTotal;
            const runningNet = allIncomeToMonth - allExpenses;
            const isOpen = openMonth === mk;
            return (
              <div key={mk} className="rounded-2xl border border-border overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition"
                  onClick={() => setOpenMonth(isOpen ? null : mk)}>
                  <div className="flex items-center gap-3">
                    <span className="font-black text-sm">{monthLabel(mk)}</span>
                    <span className="text-xs text-muted-foreground">{mExpenses.length} {mExpenses.length === 1 ? "entry" : "entries"}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-xs text-green-400 font-bold">Inc: ${fmt(mIncome)}</div>
                      <div className={`text-xs font-bold ${runningNet >= 0 ? "text-green-400" : "text-red-400"}`}>
                        Net: {runningNet >= 0 ? "+" : ""}${fmt(runningNet)}
                      </div>
                    </div>
                    <Button
                      size="sm" variant="outline"
                      className="h-7 text-xs gap-1"
                      type="button"
                      disabled={downloadingMonth === mk}
                      onClick={(e) => { e.stopPropagation(); handleDownloadExpenseSheet(mk); }}>
                      {downloadingMonth === mk
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <Download className="h-3 w-3" />}
                      {downloadingMonth === mk ? "…" : "PDF"}
                    </Button>
                    <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  </div>
                </button>
                {isOpen && (
                  <div className="border-t border-border divide-y divide-border/50">
                    {mExpenses.map((e) => (
                      <div key={e.id} className="px-4 py-3 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm">${fmt(Number(e.amount))}</span>
                            {e.description && (
                              <span className="text-xs text-muted-foreground truncate">· {e.description}</span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {new Date(e.expense_date + "T00:00:00").toLocaleDateString("en-GB", {
                              day: "numeric", month: "short", year: "numeric",
                            })}
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteExpense(e.id)}
                          className="h-7 w-7 rounded-lg flex items-center justify-center bg-red-500/10 hover:bg-red-500/20 text-red-400 transition shrink-0"
                          title="Remove expense">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {financials === null && (
        <p className="text-center text-sm text-muted-foreground py-4">
          Tap the edit button on Initial Bar Setup Cost to start tracking your financials.
        </p>
      )}

      {/* ── Number Pads ──────────────────────────────────────────────────── */}
      {showInitialPad && (
        <NumPad
          label="Initial Bar Setup Cost"
          value={initialInput}
          onChange={setInitialInput}
          onDone={() => setShowInitialPad(false)}
          onCancel={() => setShowInitialPad(false)}
        />
      )}
      {showExpPad && (
        <NumPad
          label="Expense Amount"
          value={expAmount}
          onChange={setExpAmount}
          onDone={() => setShowExpPad(false)}
          onCancel={() => setShowExpPad(false)}
        />
      )}
    </div>
  );
}

// ─── Transactions Tab ─────────────────────────────────────────────────────────
type FlatRecord =
  | { kind: "order"; data: Order; ts: number }
  | { kind: "tx"; data: WalletTx; ts: number };

function TransactionsTab({ profile }: { profile: { id: string } }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [txs, setTxs] = useState<WalletTx[]>([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const totalPages = Math.max(1, Math.ceil(total / TX_PAGE_SIZE));

  const fetchData = useCallback(() => {
    setLoading(true);
    supabase.from("orders").select("id", { count: "exact", head: true })
      .eq("owner_id", profile.id)
      .then(({ count }) => setTotal(count ?? 0));
    supabase.from("orders").select("*")
      .eq("owner_id", profile.id)
      .order("created_at", { ascending: false })
      .range(page * TX_PAGE_SIZE, page * TX_PAGE_SIZE + TX_PAGE_SIZE - 1)
      .then(({ data }) => { setOrders((data ?? []) as unknown as Order[]); setLoading(false); });
    supabase.from("wallet_transactions").select("*")
      .eq("profile_id", profile.id)
      .in("type", ["transfer_in", "bottle_finished", "cashier_sale", "pack_finished"])
      .order("created_at", { ascending: false })
      .then(({ data }) => setTxs((data ?? []) as WalletTx[]));
  }, [profile.id, page]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handlePrev = () => { setPage((p) => p - 1); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const handleNext = () => { setPage((p) => p + 1); window.scrollTo({ top: 0, behavior: "smooth" }); };

  // Merge orders and txs for the current page's date range
  const flatRecords: FlatRecord[] = [
    ...orders.map((o): FlatRecord => ({ kind: "order", data: o, ts: new Date(o.created_at).getTime() })),
    ...txs.map((tx): FlatRecord => ({ kind: "tx", data: tx, ts: new Date(tx.created_at).getTime() })),
  ].sort((a, b) => b.ts - a.ts);

  return (
    <div className="space-y-3 pt-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{total} orders total</span>
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
              const isBottle = tx.type === "bottle_finished";
              const isCashierSale = tx.type === "cashier_sale";

              if (isCashierSale) {
                const parts = (tx.note ?? "").split(" | ");
                const cashierLabel = parts[0] ?? "Cashier";
                const totalStr     = parts[1] ?? "";
                const itemsStr     = parts.slice(2).join(", ") ?? "";
                return (
                  <div key={tx.id} className="rounded-xl p-4 border border-blue-500/20 flex items-start gap-3"
                    style={{ background: "oklch(0.20 0.04 240 / 0.30)" }}>
                    <div className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 border bg-blue-500/15 border-blue-500/25 text-base">🧾</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-muted-foreground">{new Date(tx.created_at).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true, day: "numeric", month: "short", year: "numeric" })}</div>
                      <div className="text-sm font-black text-blue-300 mt-0.5">{cashierLabel}</div>
                      {totalStr && <div className="text-xs font-bold text-blue-200 mt-0.5">Sale: {totalStr}</div>}
                      {itemsStr && <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{itemsStr}</div>}
                    </div>
                  </div>
                );
              }

              const isTransferIn = tx.type === "transfer_in";
              if (isTransferIn) {
                return (
                  <div key={tx.id} className="rounded-xl p-4 border border-green-500/30 flex items-center gap-3"
                    style={{ background: "oklch(0.22 0.06 145 / 0.3)" }}>
                    <div className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 border bg-green-500/20 border-green-500/30">
                      <ArrowDownLeft className="h-4 w-4 text-green-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-muted-foreground">{new Date(tx.created_at).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true, day: "numeric", month: "short", year: "numeric" })}</div>
                      <div className="text-sm font-semibold text-green-300">
                        {tx.note ?? "Cleared from cashier"}
                      </div>
                    </div>
                    <div className="font-black text-lg shrink-0 text-green-400">
                      +${fmt(Number(tx.amount))}
                    </div>
                  </div>
                );
              }

              if (isBottle) {
                const noteParts = (tx.note ?? "").split(" | ");
                const title = noteParts[0] ?? tx.note ?? "Bottle closed";
                const sub1 = noteParts[1] ?? ""; // "Bottle price: $X"
                const sub2 = noteParts[2] ?? ""; // "Shots revenue: $X"
                // Parse bottle cost and shots revenue to compute gain/loss
                const bottlePrice = parseFloat((sub1.match(/\$([\d.]+)/) ?? [])[1] ?? "0");
                const shotsRevenue = parseFloat((sub2.match(/\$([\d.]+)/) ?? [])[1] ?? "0");
                const diff = shotsRevenue - bottlePrice;
                const hasNumbers = !isNaN(bottlePrice) && !isNaN(shotsRevenue) && (bottlePrice > 0 || shotsRevenue > 0);
                return (
                  <div key={tx.id} className="rounded-xl p-4 border border-amber-500/30 flex items-start gap-3"
                    style={{ background: "oklch(0.20 0.06 80 / 0.35)" }}>
                    <div className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 border bg-amber-500/20 border-amber-500/30 text-lg">🍾</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-muted-foreground">{new Date(tx.created_at).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true, day: "numeric", month: "short", year: "numeric" })}</div>
                      <div className="text-sm font-black text-amber-300 mt-0.5">{title}</div>
                      {sub1 && <div className="text-xs text-muted-foreground mt-0.5">{sub1}</div>}
                      {sub2 && <div className="text-xs text-amber-400 font-semibold mt-0.5">{sub2}</div>}
                      {hasNumbers && (
                        <div className="text-xs font-black mt-1" style={{ color: diff >= 0 ? "#86efac" : "#fca5a5" }}>
                          {diff >= 0
                            ? `Gain: +$${fmt(diff)}`
                            : `Loss: -$${Math.abs(diff).toFixed(2)}`}
                        </div>
                      )}
                    </div>
                  </div>
                );
              }
              return (
                <div key={tx.id}
                  className={`rounded-xl p-4 border flex items-center gap-3 ${isReset ? "border-orange-500/30" : "border-green-500/30"}`}
                  style={{ background: isReset ? "oklch(0.22 0.06 50 / 0.3)" : "oklch(0.22 0.06 145 / 0.3)" }}>
                  <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 border ${isReset ? "bg-orange-500/20 border-orange-500/30" : "bg-green-500/20 border-green-500/30"}`}>
                    {isReset ? <RotateCcw className="h-4 w-4 text-orange-400" /> : <ArrowDownLeft className="h-4 w-4 text-green-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground">{new Date(tx.created_at).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true, day: "numeric", month: "short", year: "numeric" })}</div>
                    <div className={`text-sm font-semibold ${isReset ? "text-orange-300" : "text-green-300"}`}>
                      {tx.note ?? (isReset ? "Wallet reset" : "Cleared from cashier")}
                    </div>
                  </div>
                  <div className={`font-black text-lg shrink-0 ${isReset ? "text-orange-400" : "text-green-400"}`}>
                    {isReset ? `-$${Math.abs(Number(tx.amount)).toFixed(2)}` : `+$${fmt(Number(tx.amount))}`}
                  </div>
                </div>
              );
            }
            const o = rec.data as Order;
            return (
              <div key={o.id} className="rounded-xl p-4 border border-border" style={{ background: "var(--gradient-card)" }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <Receipt className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-xs text-muted-foreground truncate">{new Date(o.created_at).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true, day: "numeric", month: "short", year: "numeric" })}</span>
                  </div>
                  <div className="font-black text-primary text-lg shrink-0 ml-2">${fmt(Number(o.total))}</div>
                </div>
                <div className="mt-1.5 text-sm text-muted-foreground line-clamp-2">
                  {(o.items || []).map((i) => `${i.qty}× ${i.name}`).join(" · ")}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Paid ${fmt(Number(o.paid))} · Change ${fmt(Number(o.change_given))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <PaginationBar page={page} totalPages={totalPages} total={total} onPrev={handlePrev} onNext={handleNext} />
    </div>
  );
}

// ─── Owner Wallet ─────────────────────────────────────────────────────────────
function OwnerWallet({ profile }: { profile: { id: string; wallet_balance: number; role: string; username?: string } }) {
  const [activeTab, setActiveTab] = useState<"transactions" | "financials">("transactions");
  const [showStatement, setShowStatement] = useState(false);
  const [balance] = useState(Number(profile.wallet_balance));

  // Financial summary state (loaded for hero display)
  const [financialSummary, setFinancialSummary] = useState<{
    initialExpense: number;
    monthlyExpenses: number;
    totalIncome: number;
    stockResaleValue: number;
  } | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);

  const loadSummary = useCallback(async () => {
    setLoadingSummary(true);
    const [finRes, expRes, transfersRes, ownerOrdersRes, productsRes, openBottlesRes] = await Promise.all([
      sb.from("owner_financials").select("initial_expense").eq("owner_id", profile.id).maybeSingle(),
      sb.from("owner_expenses").select("amount").eq("owner_id", profile.id),
      // Transfer-in: cashier balances cleared to owner
      supabase.from("wallet_transactions").select("amount").eq("profile_id", profile.id).eq("type", "transfer_in"),
      // Owner's own direct orders (where owner is also cashier)
      supabase.from("orders").select("total").eq("owner_id", profile.id).eq("cashier_id", profile.id),
      // All products with stock: price × qty
      supabase.from("products").select("price, stock_qty"),
      // Currently open bottles
      sb.from("opened_bottles")
        .select("revenue, product_id, products(price)")
        .eq("owner_id", profile.id)
        .eq("status", "open"),
    ]);

    const initialExpense = finRes.data ? Number(finRes.data.initial_expense) : 0;
    const monthlyExpenses = (expRes.data ?? []).reduce((s: number, e: { amount: number }) => s + Number(e.amount), 0);
    // Income = all transfers in + owner's own sales
    const transfersIncome = (transfersRes.data ?? []).reduce((s: number, t: { amount: number }) => s + Number(t.amount), 0);
    const ownerOrdersIncome = (ownerOrdersRes.data ?? []).reduce((s: number, o: { total: number }) => s + Number(o.total), 0);
    const totalIncome = transfersIncome + ownerOrdersIncome;

    // Closed stock: sum of price × stock_qty for all products
    const closedStockValue = (productsRes.data ?? []).reduce(
      (s: number, p: { price: number; stock_qty: number }) => s + Number(p.price) * Number(p.stock_qty),
      0
    );
    // Opened bottles: base cost (product price) minus shots revenue already collected
    const openBottles = (openBottlesRes.data ?? []) as { revenue: number; products: { price: number } | null }[];
    const openedBottlesNetValue = openBottles.reduce((s, b) => {
      const bottlePrice = b.products ? Number(b.products.price) : 0;
      const soldRevenue = Number(b.revenue);
      return s + bottlePrice - soldRevenue;
    }, 0);

    const stockResaleValue = closedStockValue + openedBottlesNetValue;

    setFinancialSummary({ initialExpense, monthlyExpenses, totalIncome, stockResaleValue });
    setLoadingSummary(false);
  }, [profile.id]);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  const totalExpenses = financialSummary ? financialSummary.initialExpense + financialSummary.monthlyExpenses : 0;
  const totalIncome = financialSummary ? financialSummary.totalIncome : balance;
  const netProfit = totalIncome - totalExpenses;
  const stockResaleValue = financialSummary ? financialSummary.stockResaleValue : 0;
  const hasFinancials = financialSummary !== null && (financialSummary.initialExpense > 0 || financialSummary.monthlyExpenses > 0);

  return (
    <div className="space-y-5">

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="rounded-3xl p-5 relative overflow-hidden"
        style={{ background: "var(--gradient-hero)", boxShadow: "var(--shadow-glow)" }}>
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="relative space-y-4">
          {/* Title row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium" style={{ color: "rgba(0,0,0,0.75)" }}>
              <WalletIcon className="h-4 w-4" /> Owner Wallet
            </div>
            <button onClick={() => setShowStatement(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl active:scale-95 transition text-xs font-black"
              style={{ background: "oklch(0.18 0.02 60)", color: "oklch(0.78 0.17 65)" }}>
              <FileText className="h-3.5 w-3.5" /> Statement
            </button>
          </div>

          {/* Mini stat cards */}
          {loadingSummary ? (
            <div className="grid grid-cols-2 gap-2">
              {[0, 1].map((i) => <div key={i} className="rounded-2xl h-20 bg-white/10 animate-pulse" />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {/* Total Expenses */}
              <div className="rounded-2xl p-3 flex flex-col items-center justify-center gap-1 text-center" style={{ background: "oklch(0.18 0.02 60)" }}>
                <div className="flex items-center gap-1 text-[10px] font-semibold" style={{ color: "rgba(255,255,255,0.55)" }}>
                  <TrendingDown className="h-3 w-3" /> Expenses
                </div>
                <div className="font-black text-sm leading-tight" style={{ color: hasFinancials ? "#fca5a5" : "rgba(255,255,255,0.3)" }}>
                  {hasFinancials ? `$${fmt(totalExpenses)}` : "—"}
                </div>
              </div>

              {/* Net Profit */}
              <div className="rounded-2xl p-3 flex flex-col items-center justify-center gap-1 text-center" style={{ background: "oklch(0.18 0.02 60)" }}>
                <div className="flex items-center gap-1 text-[10px] font-semibold" style={{ color: "rgba(255,255,255,0.55)" }}>
                  <TrendingUp className="h-3 w-3" /> Net Profit
                </div>
                <div className="font-black text-sm leading-tight" style={{
                  color: !hasFinancials ? "rgba(255,255,255,0.3)"
                    : netProfit >= 0 ? "#86efac"
                    : "#fca5a5"
                }}>
                  {hasFinancials
                    ? `${netProfit >= 0 ? "+" : ""}$${fmt(netProfit)}`
                    : "—"}
                </div>
              </div>
            </div>
          )}

          {/* Stock Resale Value — full width row */}
          <div className="flex items-center justify-between rounded-2xl px-4 py-2.5" style={{ background: "oklch(0.18 0.02 60)" }}>
            <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: "rgba(255,255,255,0.6)" }}>
              <BarChart3 className="h-3.5 w-3.5" /> Total Stock Resale Value
            </div>
            <span className="font-black text-sm" style={{ color: "#eab308" }}>
              ${fmt(stockResaleValue)}
            </span>
          </div>

          {/* Income — full width row (replaces Available Balance) */}
          <div className="flex items-center justify-between rounded-2xl px-4 py-2.5" style={{ background: "oklch(0.18 0.02 60)" }}>
            <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: "rgba(255,255,255,0.6)" }}>
              <DollarSign className="h-3.5 w-3.5" /> Income
            </div>
            <span className="font-black text-sm" style={{ color: "#86efac" }}>${fmt(totalIncome)}</span>
          </div>
        </div>
      </section>

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <div className="flex rounded-2xl border border-border overflow-hidden" style={{ background: "var(--gradient-card)" }}>
        <button
          onClick={() => setActiveTab("transactions")}
          className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-black transition ${
            activeTab === "transactions"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}>
          <List className="h-4 w-4" /> Transactions
        </button>
        <button
          onClick={() => setActiveTab("financials")}
          className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-black transition ${
            activeTab === "financials"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}>
          <BarChart3 className="h-4 w-4" /> Financials
        </button>
      </div>

      {/* ── Tab content ──────────────────────────────────────────────────── */}
      {activeTab === "transactions" ? (
        <TransactionsTab profile={profile} />
      ) : (
        <FinancialsTab
          ownerId={profile.id}
          totalIncome={totalIncome}
          onDataChange={loadSummary}
        />
      )}

      {showStatement && (
        <OwnerStatement profile={profile} onClose={() => setShowStatement(false)} />
      )}
    </div>
  );
}

// ─── Page Entry Point ─────────────────────────────────────────────────────────
export default function WalletPage() {
  const { profile } = useAuth();
  if (!profile) return null;
  if (profile.role === "owner") return <OwnerWallet profile={profile} />;
  return <CashierWallet profile={profile} />;
}

