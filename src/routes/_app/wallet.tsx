import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { useChain } from "@/lib/ChainContext";
import { useTranslation } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import {
  Wallet as WalletIcon, Receipt, ChevronLeft, ChevronRight,
  ArrowDownLeft, RotateCcw, Loader2, FileText, Download, X,
  TrendingUp, TrendingDown, DollarSign, ChevronDown,
  BarChart3, List, Trash2,
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
  updated_at?: string;
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
  page, totalPages, total, pageCount, onPrev, onNext,
}: {
  page: number; totalPages: number; total: number; pageCount?: number; onPrev: () => void; onNext: () => void;
}) {
  if (total <= 100) return null;
  return (
    <div className="flex flex-col gap-1 rounded-xl px-3 py-2.5 border border-border"
      style={{ background: "var(--gradient-card)" }}>
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" className="h-9 font-bold" disabled={page === 0} onClick={onPrev}>
          <ChevronLeft className="h-4 w-4 mr-1" /> Prev
        </Button>
        <span className="text-sm font-semibold text-muted-foreground">
          Page {page + 1} of {totalPages} · <span className="text-foreground font-black">{total}</span> records
        </span>
        <Button variant="outline" size="sm" className="h-9 font-bold" disabled={page >= totalPages - 1} onClick={onNext}>
          Next <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
      {pageCount !== undefined && (
        <p className="text-center text-xs text-muted-foreground">
          Showing <span className="font-black text-foreground">{pageCount}</span> records on this page
        </p>
      )}
    </div>
  );
}

// ─── Cashier Wallet ───────────────────────────────────────────────────────────
function CashierWallet({ profile }: { profile: { id: string; wallet_balance: number; role: string } }) {
  const { t } = useTranslation();
  const { refreshProfile } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [txs, setTxs] = useState<WalletTx[]>([]);
  const [page, setPage] = useState(0);
  const [totalOrders, setTotalOrders] = useState(0);
  const [totalTxs, setTotalTxs] = useState(0);
  const [loading, setLoading] = useState(true);
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);
  // The id of the order that qualifies for the delete button (null = none)
  const [deletableOrderId, setDeletableOrderId] = useState<string | null>(null);

  const totalRecords = totalOrders + totalTxs;
  const totalPages = Math.max(1, Math.ceil(totalRecords / ORDERS_PAGE_SIZE));

  const handlePrev = () => { setPage((p) => p - 1); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const handleNext = () => { setPage((p) => p + 1); window.scrollTo({ top: 0, behavior: "smooth" }); };

  // Resolve which order (if any) qualifies for the delete button.
  // Rules:
  //   1. Must be the most recent order for this cashier.
  //   2. Must have been created no more than 2 seconds before the last delete
  //      — if the record is older than 2s before the delete, it's a different sale, no button.
  const resolveDeletable = async (newestOrder: Order | null) => {
    if (!newestOrder) { setDeletableOrderId(null); return; }

    // Block delete if a wallet clear (transfer_out) happened after this order was created.
    // That means the sale's money already moved to the owner — deleting would cause a negative balance.
    const { data: clearData } = await supabase
      .from("wallet_transactions")
      .select("created_at")
      .eq("profile_id", profile.id)
      .eq("type", "transfer_out")
      .gt("created_at", newestOrder.created_at)
      .limit(1)
      .maybeSingle();

    if (clearData) { setDeletableOrderId(null); return; }

    const { data } = await supabase
      .from("cashier_last_delete")
      .select("deleted_at")
      .eq("cashier_id", profile.id)
      .maybeSingle();

    if (data?.deleted_at) {
      const orderTime   = new Date(newestOrder.created_at).getTime();
      const deletedTime = new Date(data.deleted_at).getTime();
      // Hide button if order is older than 2 seconds before the last delete
      if (orderTime < deletedTime - 2000) { setDeletableOrderId(null); return; }
    }

    setDeletableOrderId(newestOrder.id);
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([
      supabase.from("orders").select("id", { count: "exact", head: true })
        .eq("cashier_id", profile.id)
        .then(({ count }) => setTotalOrders(count ?? 0)),
      supabase.from("orders").select("*")
        .eq("cashier_id", profile.id)
        .order("created_at", { ascending: false })
        .range(page * ORDERS_PAGE_SIZE, page * ORDERS_PAGE_SIZE + ORDERS_PAGE_SIZE - 1)
        .then(({ data }) => {
          const o = (data ?? []) as unknown as Order[];
          setOrders(o);
          resolveDeletable(o[0] ?? null);
        }),
      supabase.from("wallet_transactions").select("id", { count: "exact", head: true })
        .eq("profile_id", profile.id)
        .in("type", ["transfer_in", "transfer_out", "bottle_finished", "pack_finished", "credit_payment", "credit_charge"])
        .then(({ count }) => setTotalTxs(count ?? 0)),
      supabase.from("wallet_transactions").select("*")
        .eq("profile_id", profile.id)
        .in("type", ["transfer_in", "transfer_out", "bottle_finished", "pack_finished", "credit_payment", "credit_charge"])
        .order("created_at", { ascending: false })
        .range(page * ORDERS_PAGE_SIZE, page * ORDERS_PAGE_SIZE + ORDERS_PAGE_SIZE - 1)
        .then(({ data }) => setTxs((data ?? []) as WalletTx[])),
    ]).finally(() => setLoading(false));
  }, [profile.id, page]); // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime — stable channel
  const fetchRef = useRef<() => void>(() => {});
  useEffect(() => {
    fetchRef.current = () => {
      setLoading(true);
      Promise.all([
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("cashier_id", profile.id).then(({ count }) => setTotalOrders(count ?? 0)),
        supabase.from("orders").select("*").eq("cashier_id", profile.id).order("created_at", { ascending: false }).range(page * ORDERS_PAGE_SIZE, page * ORDERS_PAGE_SIZE + ORDERS_PAGE_SIZE - 1).then(({ data }) => {
          const o = (data ?? []) as unknown as Order[];
          setOrders(o);
          resolveDeletable(o[0] ?? null);
        }),
        supabase.from("wallet_transactions").select("id", { count: "exact", head: true }).eq("profile_id", profile.id).in("type", ["transfer_in", "transfer_out", "bottle_finished", "pack_finished", "credit_payment", "credit_charge"]).then(({ count }) => setTotalTxs(count ?? 0)),
        supabase.from("wallet_transactions").select("*").eq("profile_id", profile.id).in("type", ["transfer_in", "transfer_out", "bottle_finished", "pack_finished", "credit_payment", "credit_charge"]).order("created_at", { ascending: false }).range(page * ORDERS_PAGE_SIZE, page * ORDERS_PAGE_SIZE + ORDERS_PAGE_SIZE - 1).then(({ data }) => setTxs((data ?? []) as WalletTx[])),
      ]).finally(() => setLoading(false));
    };
  }); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const ch = supabase
      .channel(`cashier-wallet-${profile.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `cashier_id=eq.${profile.id}` }, () => fetchRef.current())
      .on("postgres_changes", { event: "*", schema: "public", table: "wallet_transactions", filter: `profile_id=eq.${profile.id}` }, () => fetchRef.current())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile.id]);

  const deleteLatestCashierOrder = async (order: Order) => {
    setDeletableOrderId(null);
    setDeletingOrderId(order.id);

    const items = Array.isArray(order.items) ? order.items : [];

    const hasShotOrPack = items.some((i: any) => i.id?.startsWith("shot-") || i.id?.startsWith("pack-"));
    if (hasShotOrPack) {
      await supabase.rpc("reverse_order_shot_pack", { p_items: items });
    }

    const restorableItems = items.filter((i: any) => !i.id?.startsWith("shot-") && !i.id?.startsWith("pack-"));
    if (restorableItems.length > 0) {
      await supabase.rpc("restore_stock_item", {
        p_items: restorableItems.map((i: any) => ({ id: i.id, qty: i.qty })),
      });
    }

    // Delete ALL wallet_transactions for this order (cashier 'sale' row + owner 'cashier_sale' row)
    // The DB trigger (migration 20260628000003) also does this server-side once applied.
    await supabase.from("wallet_transactions").delete().eq("order_id", order.id);

    const { error } = await supabase.from("orders").delete().eq("id", order.id);
    setDeletingOrderId(null);
    if (error) { toast.error(error.message); return; }

    // Persist delete timestamp in DB — survives refresh, prevents button jumping
    await supabase.from("cashier_last_delete").upsert(
      { cashier_id: profile.id, deleted_at: new Date().toISOString() },
      { onConflict: "cashier_id" }
    );

    toast.success("Sale deleted — stock restored");
    setTimeout(() => refreshProfile(), 800);
    fetchRef.current();
  };


  // Merge orders and txs into flat list sorted by date, capped at page size
  const flatRecords: Array<{ kind: "order"; data: Order; ts: number } | { kind: "tx"; data: WalletTx; ts: number }> = [
    ...orders.map((o) => ({ kind: "order" as const, data: o, ts: new Date(o.created_at).getTime() })),
    ...txs.map((tx) => ({ kind: "tx" as const, data: tx, ts: new Date(tx.created_at).getTime() })),
  ].sort((a, b) => b.ts - a.ts).slice(0, ORDERS_PAGE_SIZE);

  return (
    <div className="space-y-5">
      <div className="sticky top-0 z-20 -mx-3 px-3 pt-2 pb-2 bg-background/95 backdrop-blur border-b border-border">
        <h1 className="text-xl font-black leading-tight">{t("wallet", "Wallet")}</h1>
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
          <h2 className="font-black text-xl">{t("records", "Records")}</h2>
          <span className="text-sm text-muted-foreground">{totalRecords} records</span>
        </div>
        <PaginationBar page={page} totalPages={totalPages} total={totalRecords} onPrev={handlePrev} onNext={handleNext} />
        {loading ? (
          <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="rounded-xl h-20 bg-muted/30 animate-pulse" />)}</div>
        ) : flatRecords.length === 0 ? (
          <div className="text-muted-foreground text-sm py-8 text-center">No records yet.</div>
        ) : (
          <div className="space-y-2">
            {flatRecords.map((rec) => {
              if (rec.kind === "tx") {
                const tx = rec.data;
                const isTransferIn = tx.type === "transfer_in";
                const isTransferOut = tx.type === "transfer_out";
                const isBottlePack = tx.type === "bottle_finished" || tx.type === "pack_finished";
                const isCreditPay  = tx.type === "credit_payment";
                const isCreditCharge = tx.type === "credit_charge";

                if (isTransferOut) {
                  return (
                    <div key={tx.id} className="rounded-xl p-4 border border-red-500/30 flex items-center gap-3"
                      style={{ background: "oklch(0.20 0.05 27 / 0.35)" }}>
                      <div className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 border bg-red-500/20 border-red-500/30">
                        <ArrowDownLeft className="h-4 w-4 text-red-400 rotate-180" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-muted-foreground">{new Date(tx.created_at).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true, day: "numeric", month: "short", year: "numeric" })}</div>
                        <div className="text-sm font-semibold text-red-300 break-words whitespace-normal">{tx.note ?? "Cleared to owner"}</div>
                      </div>
                      <div className="font-black text-lg shrink-0 text-red-400">${fmt(Math.abs(Number(tx.amount)))}</div>
                    </div>
                  );
                }

                if (isTransferIn) {
                  return (
                    <div key={tx.id} className="rounded-xl p-4 border border-green-500/30 flex items-center gap-3"
                      style={{ background: "oklch(0.22 0.06 145 / 0.3)" }}>
                      <div className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 border bg-green-500/20 border-green-500/30">
                        <ArrowDownLeft className="h-4 w-4 text-green-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-muted-foreground">{new Date(tx.created_at).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true, day: "numeric", month: "short", year: "numeric" })}</div>
                        <div className="text-sm font-semibold text-green-300 break-words whitespace-normal">{tx.note ?? "Cleared from cashier"}</div>
                      </div>
                      <div className="font-black text-lg shrink-0 text-green-400">+${fmt(Number(tx.amount))}</div>
                    </div>
                  );
                }
                if (isBottlePack) {
                  const isPack = tx.type === "pack_finished";
                  const bpParts = (tx.note ?? "").split(" | ");
                  const bpTitle = bpParts[0] ?? (isPack ? "Pack sold out" : "Bottle closed");
                  const bpSub1  = bpParts[1] ?? ""; // price
                  const bpSub2  = bpParts[2] ?? ""; // units/shots sold
                  const bpSub3  = bpParts[3] ?? ""; // revenue
                  const bpGainLoss = bpParts[4] ?? ""; // Gain/Loss
                  const bpPrice   = parseFloat((bpSub1.match(/\$([\d.]+)/) ?? [])[1] ?? "0");
                  const bpRev     = parseFloat((bpSub3.match(/\$([\d.]+)/) ?? [])[1] ?? "0");
                  const bpDiff    = bpRev - bpPrice;
                  const bpHasNums = !isNaN(bpPrice) && !isNaN(bpRev) && (bpPrice > 0 || bpRev > 0);
                  return (
                    <div key={tx.id} className={`rounded-xl p-4 border flex items-start gap-3 ${isPack ? "border-green-500/30" : "border-amber-500/30"}`}
                      style={{ background: isPack ? "oklch(0.20 0.05 145 / 0.35)" : "oklch(0.20 0.06 80 / 0.35)" }}>
                      <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 border text-lg ${isPack ? "bg-green-500/20 border-green-500/30" : "bg-amber-500/20 border-amber-500/30"}`}>
                        {isPack ? "🚬" : "🍾"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-muted-foreground">{new Date(tx.created_at).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true, day: "numeric", month: "short", year: "numeric" })}</div>
                        <div className={`text-sm font-black mt-0.5 ${isPack ? "text-green-300" : "text-amber-300"}`}>{bpTitle}</div>
                        {bpSub1 && <div className="text-xs text-muted-foreground mt-0.5">{bpSub1}</div>}
                        {bpSub2 && <div className="text-xs text-muted-foreground mt-0.5">{bpSub2}</div>}
                        {bpSub3 && <div className={`text-xs font-semibold mt-0.5 ${isPack ? "text-green-400" : "text-amber-400"}`}>{bpSub3}</div>}
                        {bpHasNums && (
                          <div className="text-xs font-black mt-1" style={{ color: bpDiff >= 0 ? "#86efac" : "#fca5a5" }}>
                            {bpDiff >= 0 ? `Gain: +$${bpDiff.toFixed(2)}` : `Loss: -$${Math.abs(bpDiff).toFixed(2)}`}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }
                if (isCreditPay) {
                  const cpParts     = (tx.note ?? "").split(" | ");
                  const cpTitle     = cpParts[0] ?? "Credit payment";
                  const cpPaid      = cpParts.find(p => p.startsWith("Paid:")) ?? "";
                  const cpRemain    = cpParts.find(p => p.startsWith("Remaining:") || p.startsWith("Balance remaining:")) ?? "";
                  return (
                    <div key={tx.id} className="rounded-xl p-4 border border-green-500/30 flex items-start gap-3"
                      style={{ background: "oklch(0.20 0.06 145 / 0.25)" }}>
                      <div className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 border bg-green-500/15 border-green-500/30 text-lg">💳</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-muted-foreground">{new Date(tx.created_at).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true, day: "numeric", month: "short", year: "numeric" })}</div>
                        <div className="text-sm font-black text-green-300 mt-0.5">{cpTitle}</div>
                        {(cpPaid || cpRemain) && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {[cpPaid, cpRemain].filter(Boolean).join(" · ")}
                          </div>
                        )}
                      </div>
                      {Number(tx.amount) > 0 && (
                        <div className="font-black text-lg shrink-0 text-green-400 mt-1">+${fmt(Number(tx.amount))}</div>
                      )}
                    </div>
                  );
                }
                if (isCreditCharge) {
                  const ccParts    = (tx.note ?? "").split(" | ");
                  const ccTitle    = ccParts[0] ?? "Credit charge";
                  const ccAmount   = ccParts.find(p => p.startsWith("$")) ?? "";
                  const ccBal      = ccParts.find(p => p.startsWith("Balance owed:")) ?? "";
                  const ccItems    = ccParts.find(p => p.startsWith("Items:"))?.replace("Items: ", "") ?? "";
                  return (
                    <div key={tx.id} className="rounded-xl p-4 border border-orange-500/30 flex items-start gap-3"
                      style={{ background: "oklch(0.20 0.04 45 / 0.30)" }}>
                      <div className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 border bg-orange-500/15 border-orange-500/30 text-lg">🪙</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-muted-foreground">{new Date(tx.created_at).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true, day: "numeric", month: "short", year: "numeric" })}</div>
                        <div className="text-sm font-black mt-0.5" style={{ color: "var(--primary)" }}>{ccTitle}</div>
                        {ccItems && <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed break-words whitespace-normal">{ccItems}</div>}
                        {ccAmount && <div className="text-sm font-black text-green-400 mt-0.5">{ccAmount}</div>}
                        {ccBal && <div className="text-xs font-semibold mt-0.5" style={{ color: "var(--primary)" }}>{ccBal}</div>}
                      </div>
                      {/* credit_charge is always read-only — no amount shown */}
                    </div>
                  );
                }
                return null;
              }
              const o = rec.data as Order;
              return (
                <div key={o.id} className="rounded-xl p-4 border border-green-500/20 flex items-start gap-3"
                  style={{ background: "oklch(0.20 0.05 145 / 0.20)" }}>
                  <div className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 border bg-green-500/15 border-green-500/25 text-base">💵</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true, day: "numeric", month: "short", year: "numeric" })}</div>
                    <div className="text-sm font-black mt-0.5" style={{ color: "var(--primary)" }}>Cash: Sale</div>
                    <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed break-words whitespace-normal">
                      {(o.items || []).map((i) => `${i.qty}× ${i.name}`).join(", ")}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Paid ${fmt(Number(o.paid))} · Change ${fmt(Number(o.change_given))}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <span className="font-black text-sm text-green-400">+${fmt(Number(o.total))}</span>
                    {o.id === deletableOrderId && (
                      <button
                        onClick={() => deleteLatestCashierOrder(o)}
                        disabled={deletingOrderId === o.id}
                        className="h-8 w-8 rounded-full flex items-center justify-center bg-red-600 active:scale-95 transition disabled:opacity-50"
                        title="Delete this sale"
                      >
                        {deletingOrderId === o.id
                          ? <Loader2 className="h-3.5 w-3.5 text-white animate-spin" />
                          : <Trash2 className="h-3.5 w-3.5 text-white" />}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <PaginationBar page={page} totalPages={totalPages} total={totalRecords} onPrev={handlePrev} onNext={handleNext} />
      </section>
    </div>
  );
}

// ─── Owner Statement Modal ────────────────────────────────────────────────────
type OwnerFlatRecord =
  | { kind: "order"; data: Order; ts: number }
  | { kind: "tx"; data: WalletTx; ts: number };

function OwnerStatement({ profile, onClose }: { profile: { id: string; username?: string }; onClose: () => void }) {
  const { t } = useTranslation();
  const [orders, setOrders] = useState<Order[]>([]);
  const [txs, setTxs] = useState<WalletTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [downloadingMonth, setDownloadingMonth] = useState<string | null>(null);
  const [downloadedMonth, setDownloadedMonth] = useState<string | null>(null);

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
        .in("type", ["transfer_in", "cashier_sale", "bottle_finished", "pack_finished", "credit_payment", "credit_charge"])
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
      const totalTransfersIn = txsR.filter((r) => (r.data as WalletTx).type === "transfer_in")
        .reduce((s, r) => s + Number((r.data as WalletTx).amount), 0);
      const openingBalance = 0;
      const closingBalance = totalSales + totalTransfersIn;
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
      setDownloadedMonth(month);
      setTimeout(() => setDownloadedMonth(null), 5000);
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
            <h2 className="text-xl font-black">{t("statement", "Owner Statement")}</h2>
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
                const monthTotal = monthRecords.reduce((s, r) => {
                  if (r.kind === "order") return s + Number((r.data as Order).total);
                  if (r.kind === "tx" && (r.data as WalletTx).type === "transfer_in") return s + Number((r.data as WalletTx).amount);
                  return s;
                }, 0);
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
                          onClick={(e) => { e.stopPropagation(); handleDownload(month); }}
                          style={downloadedMonth === month ? { background: "#16a34a", color: "#fff", borderColor: "#16a34a" } : {}}>
                          {downloadingMonth === month
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : downloadedMonth === month
                            ? <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                            : <Download className="h-3 w-3" />}
                          {downloadingMonth === month ? "…" : downloadedMonth === month ? "Done" : "PDF"}
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
                            const isCreditTx    = tx.type === "credit_payment" || tx.type === "credit_charge";

                            if (isCashierSale) {
                              const parts = (tx.note ?? "").split(" | ");
                              const cashierLabel = parts[0] ?? "Cashier sale";
                              const totalStr     = parts[1] ?? "";
                              const rawItems = parts.slice(2).join(", ");
                              const itemsStr = rawItems.replace(/├ù/g, "x").replace(/\u00d7/g, "x");
                              return (
                                <div key={tx.id} className="px-4 py-3 bg-blue-500/5 flex items-start gap-3">
                                  <div className="h-3.5 w-3.5 mt-0.5 shrink-0 text-blue-400">🧾</div>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-xs text-blue-400 font-bold">{cashierLabel}{totalStr ? " — " + totalStr : ""}</div>
                                    {itemsStr && <div className="text-xs text-muted-foreground mt-0.5 break-words whitespace-normal">{itemsStr}</div>}
                                    <div className="text-xs text-muted-foreground mt-0.5">{new Date(tx.created_at).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true, day: "numeric", month: "short", year: "numeric" })}</div>
                                  </div>
                                </div>
                              );
                            }
                            if (isTransferIn) {
                              return (
                                <div key={tx.id} className="px-4 py-3 flex items-center gap-3 bg-green-500/5">
                                  <ArrowDownLeft className="h-3.5 w-3.5 text-green-400 shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <div className="text-xs text-green-400 font-bold break-words whitespace-normal">{tx.note ?? "Cleared from cashier"}</div>
                                    <div className="text-xs text-muted-foreground mt-0.5">{new Date(tx.created_at).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true, day: "numeric", month: "short", year: "numeric" })}</div>
                                  </div>
                                  <span className="font-black text-sm text-green-400">
                                    +${Number(tx.amount).toFixed(2)}
                                  </span>
                                </div>
                              );
                            }
                            if (isBottlePack) {
                              const isPack = tx.type === "pack_finished";
                              return (
                                <div key={tx.id} className={`px-4 py-3 flex items-start gap-3 ${isPack ? "bg-green-500/5" : "bg-amber-500/5"}`}>
                                  <span className="text-base shrink-0">{isPack ? "🚬" : "🍾"}</span>
                                  <div className="flex-1 min-w-0">
                                    <div className={`text-xs font-bold break-words whitespace-normal ${isPack ? "text-green-400" : "text-amber-400"}`}>{tx.note}</div>
                                    <div className="text-xs text-muted-foreground mt-0.5">{new Date(tx.created_at).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true, day: "numeric", month: "short", year: "numeric" })}</div>
                                  </div>
                                </div>
                              );
                            }
                            if (isCreditTx) {
                              const isPayment   = tx.type === "credit_payment";
                              const isReadOnly  = isPayment && Number(tx.amount) === 0;
                              const noteParts   = (tx.note ?? "").split(" | ");
                              const titlePart   = noteParts[0] ?? (isPayment ? "Credit payment" : "Credit charge");
                              const paidPart    = noteParts.find(p => p.startsWith("Paid:")) ?? "";
                              const remainPart  = noteParts.find(p => p.startsWith("Remaining:") || p.startsWith("Balance remaining:")) ?? "";
                              const cashierPart = noteParts.find(p => p.startsWith("Cashier:")) ?? "";
                              const amountPart  = !isPayment ? (noteParts.find(p => p.startsWith("$")) ?? "") : "";
                              const itemsPart   = noteParts.find(p => p.startsWith("Items:"))?.replace("Items: ", "") ?? "";
                              return (
                                <div key={tx.id} className={`px-4 py-3 flex items-start gap-3 ${isPayment ? "bg-green-500/5" : "bg-orange-500/5"}`}>
                                  <span className="text-base shrink-0">{isPayment ? "💳" : "🪙"}</span>
                                  <div className="flex-1 min-w-0">
                                    <div className={`text-xs font-bold leading-snug ${isPayment ? "text-green-400" : "text-primary"}`}>
                                      {titlePart}
                                    </div>
                                    {(paidPart || remainPart) && (
                                      <div className="text-xs text-muted-foreground mt-0.5">
                                        {[paidPart, remainPart].filter(Boolean).join(" · ")}
                                      </div>
                                    )}
                                    {itemsPart && (
                                      <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed break-words whitespace-normal">{itemsPart}</div>
                                    )}
                                    {cashierPart && (
                                      <div className="text-xs text-muted-foreground mt-0.5">{cashierPart}</div>
                                    )}
                                    <div className="text-xs text-muted-foreground mt-0.5">{new Date(tx.created_at).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true, day: "numeric", month: "short", year: "numeric" })}</div>
                                  </div>
                                  {isPayment && (
                                    !isReadOnly ? (
                                      <span className="font-black text-lg shrink-0 text-green-400">
                                        +${Number(tx.amount).toFixed(2)}
                                      </span>
                                    ) : cashierPart ? (
                                      <span className="text-xs shrink-0 px-1.5 py-0.5 rounded-full font-semibold"
                                        style={{ background: "rgba(34,197,94,0.12)", color: "#86efac" }}>
                                        with cashier
                                      </span>
                                    ) : null
                                  )}
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
                              <div className="mt-1 text-xs text-muted-foreground break-words whitespace-normal">
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
  const [expenses, setExpenses] = useState<OwnerExpense[]>([]);
  const [monthlyIncome, setMonthlyIncome] = useState<Record<string, number>>({});
  const [loadingData, setLoadingData] = useState(true);
  const [downloadingMonth, setDownloadingMonth] = useState<string | null>(null);
  const [downloadedMonth, setDownloadedMonth] = useState<string | null>(null);

  // Accordion
  const [openMonth, setOpenMonth] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoadingData(true);
    const [expRes, ownerOrdRes, transfersRes, creditRes] = await Promise.all([
      sb.from("owner_expenses").select("*").eq("owner_id", ownerId).order("created_at", { ascending: false }),
      // Only owner's OWN direct orders (not cashier orders — cash still with cashier until cleared)
      supabase.from("orders").select("total, created_at").eq("owner_id", ownerId).eq("cashier_id", ownerId),
      // Transfer-in: cashier balances cleared to owner
      supabase.from("wallet_transactions").select("amount, created_at").eq("profile_id", ownerId).eq("type", "transfer_in"),
      // Credit payments collected directly by the owner
      supabase.from("wallet_transactions").select("amount, created_at").eq("profile_id", ownerId).eq("type", "credit_payment").gt("amount", 0),
    ]);
    setExpenses((expRes.data ?? []) as OwnerExpense[]);
    // Build per-month income map: owner direct sales + transfers in + credit payments
    const incomeMap: Record<string, number> = {};
    for (const o of (ownerOrdRes.data ?? []) as { total: number; created_at: string }[]) {
      const mk = monthKey(o.created_at);
      incomeMap[mk] = (incomeMap[mk] ?? 0) + Number(o.total);
    }
    for (const t of (transfersRes.data ?? []) as { amount: number; created_at: string }[]) {
      const mk = monthKey(t.created_at);
      incomeMap[mk] = (incomeMap[mk] ?? 0) + Number(t.amount);
    }
    for (const t of (creditRes.data ?? []) as { amount: number; created_at: string }[]) {
      const mk = monthKey(t.created_at);
      incomeMap[mk] = (incomeMap[mk] ?? 0) + Number(t.amount);
    }
    setMonthlyIncome(incomeMap);
    setLoadingData(false);
  }, [ownerId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Realtime — refresh financials when orders or expenses change
  useEffect(() => {
    const ch = supabase
      .channel(`wallet-financials-${ownerId}`)
      // All orders for this owner (cashier + direct)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `owner_id=eq.${ownerId}` }, () => loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "owner_expenses", filter: `owner_id=eq.${ownerId}` }, () => loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "wallet_transactions", filter: `profile_id=eq.${ownerId}` }, () => loadData())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [ownerId, loadData]);

  // ── Derived totals ────────────────────────────────────────────────────────
  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const netProfit = totalIncome - totalExpenses;

  // ── Group expenses by month ───────────────────────────────────────────────
  const expensesByMonth: Record<string, OwnerExpense[]> = {};
  expenses.forEach((e) => {
    const key = monthKey(e.expense_date);
    if (!expensesByMonth[key]) expensesByMonth[key] = [];
    expensesByMonth[key].push(e);
  });
  const expenseMonths = Object.keys(expensesByMonth).sort((a, b) => b.localeCompare(a));

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
      const allTimeExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);
      const allTimeNet      = allTimeIncome - allTimeExpenses;

      let y = await drawHeader(doc, "Owner Financials", "Expense Report", label, generated);

      // ── Generated timestamp ───────────────────────────────────────────────
      doc.setFont("helvetica", "italic"); doc.setFontSize(7); doc.setTextColor(150, 100, 30);
      doc.text("Generated: " + generated + "  |  This document is system-generated and tamper-evident.", LM, y);
      doc.setTextColor(0, 0, 0); y += 5;

      // ── Summary box ──────────────────────────────────────────────────────
      const boxX = LM; const boxW = RM - LM; const boxH = 28;
      doc.setFillColor(245, 240, 230);
      doc.roundedRect(boxX, y, boxW, boxH, 2, 2, "F");
      doc.setDrawColor(232, 146, 42); doc.setLineWidth(0.4);
      doc.roundedRect(boxX, y, boxW, boxH, 2, 2, "S");
      doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(100, 70, 10);
      doc.text("SUMMARY (ALL TIME TO " + label.toUpperCase() + ")", boxX + 3, y + 5);

      const cols = [
        { label: "This Month Income",  value: "$" + fmt(mIncome),        color: [40, 140, 40]  as [number,number,number] },
        { label: "Total Expenses",     value: "$" + fmt(allTimeExpenses), color: [180, 40, 40]  as [number,number,number] },
        { label: "Net Profit",         value: (allTimeNet >= 0 ? "+" : "") + "$" + fmt(allTimeNet), color: (allTimeNet >= 0 ? [40,140,40] : [180,40,40]) as [number,number,number] },
      ];
      const colW = boxW / cols.length;
      cols.forEach((col, i) => {
        const cx = boxX + i * colW + colW / 2;
        doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(100, 100, 100);
        doc.text(col.label, cx, y + 13, { align: "center" });
        doc.setFont("helvetica", "bold"); doc.setFontSize(9);
        doc.setTextColor(col.color[0], col.color[1], col.color[2]);
        doc.text(col.value, cx, y + 21, { align: "center" });
      });
      doc.setTextColor(0, 0, 0); y += boxH + 5;

      // ── Column headers ────────────────────────────────────────────────────
      doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(130, 130, 130);
      doc.text("DATE / DESCRIPTION", LM, y);
      doc.text("AMOUNT", RM, y, { align: "right" }); y += 3;
      doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.2); doc.line(LM, y, RM, y); y += 5;
      doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(0, 0, 0);

      // ── Rows — monthly expenses only ──────────────────────────────────────
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

      // ── This month subtotal ───────────────────────────────────────────────
      if (mExpenses.length > 0) {
        if (y > CONTENT_BOTTOM) { doc.addPage(); y = 20; }
        doc.setFont("helvetica", "bold"); doc.setFontSize(9);
        doc.setDrawColor(232, 146, 42); doc.setLineWidth(0.4); doc.line(LM, y, RM, y); y += 4;
        doc.setTextColor(100, 70, 10);
        doc.text("THIS MONTH'S EXPENSES", LM, y);
        doc.setTextColor(180, 40, 40);
        doc.text("$" + fmt(mExpTotal), RM, y, { align: "right" });
        doc.setTextColor(0, 0, 0); y += 4;
      }

      addFootersToAllPages(doc);
      const filename = `expense-report-${label.replace(/\s/g, "-")}.pdf`;
      await downloadPdf(filename, doc.output("datauristring"));
      toast.success("PDF saved to Downloads folder");
      setDownloadedMonth(mk);
      setTimeout(() => setDownloadedMonth(null), 5000);
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

  return (
    <div className="space-y-5 pt-2 pb-24">

      {/* ── Expense History by Month ──────────────────────────────────────── */}
      {expenseMonths.length > 0 ? (
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
            const allExpenses = totalExpenses;
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
                      <div className="text-xs text-red-400 font-bold">${fmt(mTotal)}</div>
                    </div>
                    <Button
                      size="sm" variant="outline"
                      className="h-7 text-xs gap-1"
                      type="button"
                      disabled={downloadingMonth === mk}
                      onClick={(e) => { e.stopPropagation(); handleDownloadExpenseSheet(mk); }}
                      style={downloadedMonth === mk ? { background: "#16a34a", color: "#fff", borderColor: "#16a34a" } : {}}>
                      {downloadingMonth === mk
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : downloadedMonth === mk
                        ? <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                        : <Download className="h-3 w-3" />}
                      {downloadingMonth === mk ? "…" : downloadedMonth === mk ? "Done" : "PDF"}
                    </Button>
                    <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  </div>
                </button>
                {isOpen && (
                  <div className="border-t border-border divide-y divide-border/50">
                    {mExpenses.map((e) => {
                      const raw = e.description ?? "Stock expense";
                      const isBulk = raw.startsWith("Bulk Stock Update\n");

                      if (isBulk) {
                        // Split into title + item lines
                        const lines = raw.split("\n").filter(Boolean);
                        const title = lines[0]; // "Bulk Stock Update"
                        const itemLines = lines.slice(1); // each "Name ×qty @ $x = $y"
                        return (
                          <div key={e.id} className="px-4 py-3 flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="font-black text-sm">{title}</div>
                              <div className="mt-1 space-y-0.5">
                                {itemLines.map((line, i) => {
                                  // Split "Name ×qty @ $cp each = $total" at " = "
                                  const eqIdx = line.lastIndexOf(" = ");
                                  const left = eqIdx !== -1 ? line.slice(0, eqIdx) : line;
                                  const right = eqIdx !== -1 ? line.slice(eqIdx + 3) : null;
                                  return (
                                    <div key={i} className="flex items-center justify-between gap-2">
                                      <span className="text-xs text-muted-foreground flex-1">{left}</span>
                                      {right && <span className="text-xs font-black text-red-400 shrink-0">{right}</span>}
                                    </div>
                                  );
                                })}
                              </div>
                              <div className="text-xs text-muted-foreground mt-1.5">
                                {new Date(e.created_at).toLocaleString("en-GB", {
                                  day: "numeric", month: "short", year: "numeric",
                                  hour: "2-digit", minute: "2-digit", hour12: true,
                                })}
                              </div>
                            </div>
                            <span className="font-black text-sm text-red-400 shrink-0">
                              -${fmt(Number(e.amount))}
                            </span>
                          </div>
                        );
                      }

                      // Single-item expense: "Name ×12 @ $5.00 each"
                      const atIdx = raw.indexOf(" ×");
                      const hasDetail = atIdx !== -1;
                      const title = hasDetail ? raw.slice(0, atIdx).trim() : raw;
                      const detail = hasDetail ? raw.slice(atIdx + 1).trim() : null;

                      return (
                        <div key={e.id} className="px-4 py-3 flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="font-black text-sm">{title}</div>
                            {detail && (
                              <div className="text-xs text-muted-foreground mt-0.5 break-words whitespace-normal">
                                {detail}
                              </div>
                            )}
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {new Date(e.created_at).toLocaleString("en-GB", {
                                day: "numeric", month: "short", year: "numeric",
                                hour: "2-digit", minute: "2-digit", hour12: true,
                              })}
                            </div>
                          </div>
                          <span className="font-black text-sm text-red-400 shrink-0">
                            -${fmt(Number(e.amount))}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-center text-sm text-muted-foreground py-8">
          No expenses yet. Expenses are auto-generated when you add stock to items with a Cost Price set.
        </p>
      )}

      {/* empty bottom spacer */}
    </div>
  );
}

// ─── Transactions Tab ─────────────────────────────────────────────────────────
type FlatRecord =
  | { kind: "order"; data: Order; ts: number }
  | { kind: "tx"; data: WalletTx; ts: number };

function CashierBadge() {
  return (
    <span className="text-xs shrink-0 px-2 py-0.5 rounded-full font-semibold self-start mt-0.5"
      style={{ background: "rgba(99,102,241,0.15)", color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.3)" }}>
      Cashier
    </span>
  );
}

function TransactionsTab({ profile, onDeleted }: { profile: { id: string }; onDeleted?: () => void }) {
  const { refreshProfile } = useAuth();
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [allTxs, setAllTxs] = useState<WalletTx[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);
  // The id of the owner-direct order that qualifies for the delete button
  const [deletableOrderId, setDeletableOrderId] = useState<string | null>(null);

  // Resolve which owner-direct order (if any) shows the delete button.
  // Same rules as cashier: newest, within 10 seconds, after last delete timestamp.
  const resolveDeletable = async (ownerOrders: Order[]) => {
    if (ownerOrders.length === 0) { setDeletableOrderId(null); return; }
    const newest = ownerOrders.reduce((a, b) =>
      new Date(a.created_at) > new Date(b.created_at) ? a : b
    );

    const { data } = await supabase
      .from("cashier_last_delete")
      .select("deleted_at")
      .eq("cashier_id", profile.id)
      .maybeSingle();

    if (data?.deleted_at) {
      const orderTime   = new Date(newest.created_at).getTime();
      const deletedTime = new Date(data.deleted_at).getTime();
      // Hide button if order is older than 2 seconds before the last delete
      if (orderTime < deletedTime - 2000) { setDeletableOrderId(null); return; }
    }
    setDeletableOrderId(newest.id);
  };

  const fetchData = useCallback(() => {
    setLoading(true);
    Promise.all([
      supabase.from("orders").select("*")
        .eq("owner_id", profile.id)
        .order("created_at", { ascending: false })
        .then(({ data }) => {
          const orders = (data ?? []) as unknown as Order[];
          const ownerOrders = orders.filter((o: any) => o.cashier_id === profile.id);
          setAllOrders(orders);
          resolveDeletable(ownerOrders);
        }),
      // Fetch ALL wallet txs (no range limit)
      supabase.from("wallet_transactions").select("*")
        .eq("profile_id", profile.id)
        .in("type", ["transfer_in", "bottle_finished", "cashier_sale", "pack_finished", "credit_payment", "credit_charge"])
        .order("created_at", { ascending: false })
        .then(({ data }) => setAllTxs((data ?? []) as WalletTx[])),
    ]).finally(() => setLoading(false));
  }, [profile.id]);

  // Keep a stable ref to fetchData so the realtime channel never needs to be recreated
  const fetchDataRef = useRef(fetchData);
  useEffect(() => { fetchDataRef.current = fetchData; }, [fetchData]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Clear stale data immediately when switching bars
  useEffect(() => {
    setAllOrders([]);
    setAllTxs([]);
    setLoading(true);
  }, [profile.id]);

  // Realtime — one stable channel per owner, never torn down on data refresh
  useEffect(() => {
    const ch = supabase
      .channel(`wallet-tx-${profile.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `owner_id=eq.${profile.id}` }, () => fetchDataRef.current())
      .on("postgres_changes", { event: "*", schema: "public", table: "wallet_transactions", filter: `profile_id=eq.${profile.id}` }, () => fetchDataRef.current())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile.id]);

  // Merge ALL records sorted by date, then paginate client-side
  const allFlat: FlatRecord[] = [
    ...allOrders.map((o): FlatRecord => ({ kind: "order", data: o, ts: new Date(o.created_at).getTime() })),
    ...allTxs.map((tx): FlatRecord => ({ kind: "tx", data: tx, ts: new Date(tx.created_at).getTime() })),
  ].sort((a, b) => b.ts - a.ts);

  // Cashier orders are displayed via their cashier_sale wallet_transaction — exclude them
  // from the count so each sale only counts once, not twice.
  const allFlatVisible = allFlat.filter((rec) => {
    if (rec.kind === "order") {
      return (rec.data as any).cashier_id === profile.id;
    }
    return true;
  });

  const total = allFlatVisible.length;
  const totalPages = Math.max(1, Math.ceil(total / TX_PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const flatRecords = allFlat.slice(safePage * TX_PAGE_SIZE, safePage * TX_PAGE_SIZE + TX_PAGE_SIZE);
  const pageRecordCount = flatRecords.length;

  const deleteLatestOrder = async (order: Order) => {
    setDeletingOrderId(order.id);

    const items = Array.isArray(order.items) ? order.items as { id: string; qty: number; price?: number }[] : [];

    // 1. Reverse shots_sold / units_sold / revenue on any opened bottles or packs.
    //    Also reopens any bottle/pack that was subsequently marked empty (finished),
    //    removing the bottle_finished / pack_finished wallet entry in the process.
    const hasShotOrPack = items.some(i => i.id.startsWith("shot-") || i.id.startsWith("pack-"));
    if (hasShotOrPack) {
      await supabase.rpc("reverse_order_shot_pack", { p_items: items });
    }

    // 2. Restore stock for every real product in the order (skip shot-xxx and pack-xxx)
    const restorableItems = items.filter(i => !i.id.startsWith("shot-") && !i.id.startsWith("pack-"));
    if (restorableItems.length > 0) {
      await supabase.rpc("restore_stock_item", {
        p_items: restorableItems.map(i => ({ id: i.id, qty: i.qty })),
      });
    }

    // 3. DB trigger on_order_delete handles deleting ALL wallet_transactions
    //    for this order (owner + cashier rows) and deducting wallet_balance.

    // 4. Delete the order itself
    const { error } = await supabase.from("orders").delete().eq("id", order.id);
    if (error) { toast.error(error.message); setDeletingOrderId(null); return; }

    toast.success("Sale removed — stock restored");
    setDeletingOrderId(null);
    setDeletableOrderId(null);

    // Persist delete timestamp so button never reappears on refresh
    await supabase.from("cashier_last_delete").upsert(
      { cashier_id: profile.id, deleted_at: new Date().toISOString() },
      { onConflict: "cashier_id" }
    );

    setTimeout(() => refreshProfile(), 800);
    fetchData();
    onDeleted?.();
  };

  const handlePrev = () => { setPage((p) => Math.max(0, p - 1)); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const handleNext = () => { setPage((p) => Math.min(totalPages - 1, p + 1)); window.scrollTo({ top: 0, behavior: "smooth" }); };

  // Use the locked snapshot — never moves after first load
  const newestOrderId = deletableOrderId;

  return (
    <div className="space-y-3 pt-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{total} total records</span>
      </div>

      <PaginationBar page={safePage} totalPages={totalPages} total={total} pageCount={pageRecordCount} onPrev={handlePrev} onNext={handleNext} />

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="rounded-xl h-16 bg-muted/30 animate-pulse" />)}</div>
      ) : flatRecords.length === 0 ? (
        <div className="text-muted-foreground text-sm py-8 text-center">No records yet.</div>
      ) : (
        <div className="space-y-2">
          {flatRecords.map((rec) => {
            if (rec.kind === "tx") {
              const tx = rec.data;
              const isBottle = tx.type === "bottle_finished";
              const isCashierSale = tx.type === "cashier_sale";

              if (isCashierSale) {
                const parts = (tx.note ?? "").split(" | ");
                const cashierLabel = parts[0] ?? "Cashier";
                const totalStr     = parts[1] ?? "";
                // Clean up garbled × characters from old stored records
                const rawItems = parts.slice(2).join(", ") ?? "";
                const itemsStr = rawItems.replace(/├ù/g, "x").replace(/\u00d7/g, "x");
                // Parse paid/change from totalStr e.g. "Total: $X · Paid: $Y · Change: $Z"
                const paidMatch   = totalStr.match(/Paid:\s*\$([\d.]+)/);
                const changeMatch = totalStr.match(/Change:\s*\$([\d.]+)/);
                const totalMatch  = totalStr.match(/Total:\s*\$([\d.]+)/);
                const paidStr     = paidMatch   ? `Paid $${fmt(parseFloat(paidMatch[1]))}` : "";
                const changeStr   = changeMatch ? `Change $${fmt(parseFloat(changeMatch[1]))}` : "";
                const saleTotal   = totalMatch  ? `+$${fmt(parseFloat(totalMatch[1]))}` : "";
                return (
                  <div key={tx.id} className="rounded-xl p-4 border border-blue-500/20 flex items-start gap-3"
                    style={{ background: "oklch(0.20 0.04 240 / 0.30)" }}>
                    <div className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 border bg-blue-500/15 border-blue-500/25 text-base">🧾</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-muted-foreground">{new Date(tx.created_at).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true, day: "numeric", month: "short", year: "numeric" })}</div>
                      <div className="text-sm font-black text-blue-300 mt-0.5">{cashierLabel}</div>
                      {saleTotal && <div className="text-sm font-black text-green-400 mt-0.5">{saleTotal}</div>}
                      {itemsStr && <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{itemsStr}</div>}
                      {(paidStr || changeStr) && (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {[paidStr, changeStr].filter(Boolean).join(" · ")}
                        </div>
                      )}
                    </div>
                    <CashierBadge />
                  </div>
                );
              }

              // ── Credit payment / credit charge card ─────────────────────
              const isCreditTx = tx.type === "credit_payment" || tx.type === "credit_charge";
              if (isCreditTx) {
                const isPayment  = tx.type === "credit_payment";
                const isReadOnly = isPayment && Number(tx.amount) === 0;
                const noteParts  = (tx.note ?? "").split(" | ");
                const titlePart   = noteParts[0] ?? (isPayment ? "Credit payment" : "Credit charge");
                const paidPart    = noteParts.find(p => p.startsWith("Paid:")) ?? "";
                const remainPart  = noteParts.find(p => p.startsWith("Remaining:") || p.startsWith("Balance remaining:")) ?? "";
                const cashierPart = noteParts.find(p => p.startsWith("Cashier:")) ?? "";
                // Charge records: amount shown as "$X" part, items listed after "Items:"
                const amountPart  = !isPayment ? (noteParts.find(p => p.startsWith("$")) ?? "") : "";
                const itemsPart   = noteParts.find(p => p.startsWith("Items:"))?.replace("Items: ", "") ?? "";
                const balOwedPart = noteParts.find(p => p.startsWith("Balance owed:")) ?? "";                return (
                  <div key={tx.id} className="rounded-xl p-4 border flex items-start gap-3"
                    style={{
                      borderColor: isPayment ? "rgba(34,197,94,0.3)" : "rgba(251,146,60,0.25)",
                      background: isPayment ? "oklch(0.20 0.06 145 / 0.25)" : "oklch(0.20 0.04 45 / 0.30)",
                    }}>
                    <div className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 border text-base"
                      style={{
                        background: isPayment ? "rgba(34,197,94,0.15)" : "rgba(251,146,60,0.12)",
                        borderColor: isPayment ? "rgba(34,197,94,0.3)" : "rgba(251,146,60,0.25)",
                      }}>
                      {isPayment ? "💳" : "🪙"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-muted-foreground">{new Date(tx.created_at).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true, day: "numeric", month: "short", year: "numeric" })}</div>
                      <div className="text-sm font-black mt-0.5" style={{ color: isPayment ? "#86efac" : "var(--primary)" }}>
                        {titlePart}
                      </div>
                      {/* Payment sub-lines */}
                      {(paidPart || remainPart) && (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {[paidPart, remainPart].filter(Boolean).join(" · ")}
                        </div>
                      )}
                      {/* Charge: items list + order cost in green + balance owed */}
                      {itemsPart && (
                        <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{itemsPart}</div>
                      )}
                      {!isPayment && amountPart && (
                        <div className="text-sm font-black text-green-400 mt-0.5">{amountPart}</div>
                      )}
                      {balOwedPart && (
                        <div className="text-xs mt-0.5 font-semibold" style={{ color: "var(--primary)" }}>{balOwedPart}</div>
                      )}
                      {cashierPart && (
                        <div className="text-xs text-muted-foreground mt-0.5">{cashierPart}</div>
                      )}
                    </div>
                    {/* Credit payment: +$X if owner collected, "Cashier" badge if cashier collected */}
                    {/* Credit charge: only show Cashier badge if a cashier did it */}
                    {!isPayment ? (
                      cashierPart ? <CashierBadge /> : null
                    ) : isReadOnly && cashierPart ? (
                      <CashierBadge />
                    ) : !isReadOnly ? (
                      <span className="font-black text-lg shrink-0" style={{ color: "#86efac" }}>
                        +${fmt(Number(tx.amount))}
                      </span>
                    ) : null}
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
                const bottlePrice = parseFloat((sub1.match(/\$([\d.]+)/) ?? [])[1] ?? "0");
                const shotsRevenue = parseFloat((sub2.match(/\$([\d.]+)/) ?? [])[1] ?? "0");
                const diff = shotsRevenue - bottlePrice;
                const hasNumbers = !isNaN(bottlePrice) && !isNaN(shotsRevenue) && (bottlePrice > 0 || shotsRevenue > 0);
                const bottleByPart = noteParts.find(p => p.startsWith("By:") || p.startsWith("Cashier:")) ?? "";
                const bottleCashierName = bottleByPart.replace(/^(By:|Cashier:)\s*/, "").trim();
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
                          {diff >= 0 ? `Gain: +$${fmt(diff)}` : `Loss: -$${Math.abs(diff).toFixed(2)}`}
                        </div>
                      )}
                      {bottleCashierName && (
                        <div className="text-[10px] text-muted-foreground mt-0.5">Closed by: {bottleCashierName}</div>
                      )}
                    </div>
                    {bottleCashierName && <CashierBadge />}
                  </div>
                );
              }

              const isPack = tx.type === "pack_finished";
              if (isPack) {
                const noteParts = (tx.note ?? "").split(" | ");
                const title      = noteParts[0] ?? "Pack sold out";
                const sub1       = noteParts[1] ?? "";
                const sub2       = noteParts[2] ?? "";
                const sub3       = noteParts[3] ?? "";
                const packPrice    = parseFloat((sub1.match(/\$([\d.]+)/) ?? [])[1] ?? "0");
                const packRevenue  = parseFloat((sub3.match(/\$([\d.]+)/) ?? [])[1] ?? "0");
                const diff       = packRevenue - packPrice;
                const hasNumbers = !isNaN(packPrice) && !isNaN(packRevenue) && (packPrice > 0 || packRevenue > 0);
                const packCashierPart = noteParts.find(p => p.startsWith("By:") || p.startsWith("Cashier:")) ?? "";
                const packCashierName = packCashierPart.replace(/^(By:|Cashier:)\s*/, "").trim();
                return (
                  <div key={tx.id} className="rounded-xl p-4 border border-green-500/30 flex items-start gap-3"
                    style={{ background: "oklch(0.20 0.05 145 / 0.35)" }}>
                    <div className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 border bg-green-500/20 border-green-500/30 text-lg">🚬</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-muted-foreground">{new Date(tx.created_at).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true, day: "numeric", month: "short", year: "numeric" })}</div>
                      <div className="text-sm font-black text-green-300 mt-0.5">{title}</div>
                      {sub1 && <div className="text-xs text-muted-foreground mt-0.5">{sub1}</div>}
                      {sub2 && <div className="text-xs text-muted-foreground mt-0.5">{sub2}</div>}
                      {sub3 && <div className="text-xs text-green-400 font-semibold mt-0.5">{sub3}</div>}
                      {hasNumbers && (
                        <div className="text-xs font-black mt-1" style={{ color: diff >= 0 ? "#86efac" : "#fca5a5" }}>
                          {diff >= 0 ? `Gain: +$${fmt(diff)}` : `Loss: -$${Math.abs(diff).toFixed(2)}`}
                        </div>
                      )}
                      {packCashierName && (
                        <div className="text-[10px] text-muted-foreground mt-0.5">Closed by: {packCashierName}</div>
                      )}
                    </div>
                    {packCashierName && <CashierBadge />}
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
            // Cashier orders are already shown via cashier_sale wallet_transaction — skip them here
            if ((o as any).cashier_id !== profile.id) return null;
            const isNewest = o.id === newestOrderId;
            return (
              <div key={o.id} className="rounded-xl p-4 border border-green-500/20 flex items-start gap-3"
                style={{ background: "oklch(0.20 0.05 145 / 0.20)" }}>
                <div className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 border bg-green-500/15 border-green-500/25 text-base">💵</div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true, day: "numeric", month: "short", year: "numeric" })}</div>
                  <div className="text-sm font-black mt-0.5" style={{ color: "var(--primary)" }}>Cash: Sale</div>
                  <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    {(o.items || []).map((i) => `${i.qty}× ${i.name}`).join(", ")}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Paid ${fmt(Number(o.paid))} · Change ${fmt(Number(o.change_given))}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <span className="font-black text-lg text-green-400">+${fmt(Number(o.total))}</span>
                  {isNewest && (
                    <button
                      onClick={() => deleteLatestOrder(o)}
                      disabled={deletingOrderId === o.id}
                      className="h-8 w-8 rounded-full flex items-center justify-center bg-red-600 active:scale-95 transition disabled:opacity-50"
                      title="Delete this sale"
                    >
                      {deletingOrderId === o.id
                        ? <Loader2 className="h-3.5 w-3.5 text-white animate-spin" />
                        : <Trash2 className="h-3.5 w-3.5 text-white" />}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <PaginationBar page={safePage} totalPages={totalPages} total={total} pageCount={pageRecordCount} onPrev={handlePrev} onNext={handleNext} />
    </div>
  );
}

// ─── Owner Wallet ─────────────────────────────────────────────────────────────
function OwnerWallet({ profile }: { profile: { id: string; wallet_balance: number; role: string; username?: string } }) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<"transactions" | "financials">("transactions");
  const [showStatement, setShowStatement] = useState(false);
  // Derive balance directly from the prop so it updates when refreshProfile() runs
  const balance = Number(profile.wallet_balance);

  // Financial summary state (loaded for hero display)
  const [financialSummary, setFinancialSummary] = useState<{
    initialExpense: number;
    monthlyExpenses: number;
    totalIncome: number;
    stockResaleValue: number;
    stockExpectedProfit: number;
  } | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);

  const loadSummary = useCallback(async () => {
    setLoadingSummary(true);
    const [finRes, expRes, transfersRes, ownerOrdersRes, cashierOrdersRes, creditPaymentsRes, productsRes, openBottlesRes] = await Promise.all([
      sb.from("owner_financials").select("initial_expense").eq("owner_id", profile.id).maybeSingle(),
      sb.from("owner_expenses").select("amount").eq("owner_id", profile.id),
      // Transfer-in: cashier balances cleared to owner
      supabase.from("wallet_transactions").select("amount").eq("profile_id", profile.id).eq("type", "transfer_in"),
      // Owner's own direct orders (where owner is also cashier)
      supabase.from("orders").select("total").eq("owner_id", profile.id).eq("cashier_id", profile.id),
      // Cashier orders — all orders under this owner where a cashier (not the owner) made the sale
      supabase.from("orders").select("total").eq("owner_id", profile.id).neq("cashier_id", profile.id),
      // Credit payments collected directly by the owner (amount > 0 = owner took the cash, not a cashier)
      supabase.from("wallet_transactions").select("amount").eq("profile_id", profile.id).eq("type", "credit_payment").gt("amount", 0),
      // All products with stock: price × qty and cost_price × qty
      supabase.from("products").select("price, cost_price, stock_qty").eq("owner_id", profile.id),
      // Currently open bottles
      sb.from("opened_bottles")
        .select("revenue, product_id, products(price)")
        .eq("owner_id", profile.id)
        .eq("status", "open"),
    ]);

    const initialExpense = finRes.data ? Number(finRes.data.initial_expense) : 0;
    const monthlyExpenses = (expRes.data ?? []).reduce((s: number, e: { amount: number }) => s + Number(e.amount), 0);
    // Income = only money the owner has actually received in hand:
    // - transfers_in: cashier balances cleared to owner
    // - owner's own direct orders (owner rang the sale themselves)
    // - credit payments collected directly by the owner
    // Cashier orders are NOT counted here — that cash is still with the cashier until cleared
    const transfersIncome = (transfersRes.data ?? []).reduce((s: number, t: { amount: number }) => s + Number(t.amount), 0);
    const ownerOrdersIncome = (ownerOrdersRes.data ?? []).reduce((s: number, o: { total: number }) => s + Number(o.total), 0);
    const creditPaymentsIncome = (creditPaymentsRes.data ?? []).reduce((s: number, t: { amount: number }) => s + Number(t.amount), 0);
    const totalIncome = transfersIncome + ownerOrdersIncome + creditPaymentsIncome;

    // Closed stock: sum of price × stock_qty (resale) and cost_price × stock_qty (cost)
    const closedStockValue = (productsRes.data ?? []).reduce(
      (s: number, p: { price: number; cost_price: number; stock_qty: number }) => s + Number(p.price) * Number(p.stock_qty),
      0
    );
    const closedStockCost = (productsRes.data ?? []).reduce(
      (s: number, p: { price: number; cost_price: number; stock_qty: number }) => s + Number(p.cost_price) * Number(p.stock_qty),
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
    // Expected profit = what you'd make selling all stock at retail minus what it cost to buy
    const stockExpectedProfit = stockResaleValue - closedStockCost;

    setFinancialSummary({ initialExpense, monthlyExpenses, totalIncome, stockResaleValue, stockExpectedProfit });
    setLoadingSummary(false);
  }, [profile.id]);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  // Clear stale data immediately when switching bars so old bar's data doesn't flash
  useEffect(() => {
    setFinancialSummary(null);
    setLoadingSummary(true);
  }, [profile.id]);

  // Stable ref so the realtime channel never needs to be recreated when loadSummary re-runs
  const loadSummaryRef = useRef(loadSummary);
  useEffect(() => { loadSummaryRef.current = loadSummary; }, [loadSummary]);

  // Realtime — one stable channel, never torn down on data refresh
  useEffect(() => {
    const ch = supabase
      .channel(`wallet-summary-${profile.id}`)
      // Any order (owner or cashier sale) → income + stock changes
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `owner_id=eq.${profile.id}` }, () => loadSummaryRef.current())
      // Wallet transactions: transfers_in, credit_payments → income changes
      .on("postgres_changes", { event: "*", schema: "public", table: "wallet_transactions", filter: `profile_id=eq.${profile.id}` }, () => loadSummaryRef.current())
      // Expenses added/removed → expenses + net profit cards
      .on("postgres_changes", { event: "*", schema: "public", table: "owner_expenses", filter: `owner_id=eq.${profile.id}` }, () => loadSummaryRef.current())
      // Stock added/removed/updated → stock resale + expected profit cards
      .on("postgres_changes", { event: "*", schema: "public", table: "products", filter: `owner_id=eq.${profile.id}` }, () => loadSummaryRef.current())
      // Opened/finished bottles → stock resale value changes
      .on("postgres_changes", { event: "*", schema: "public", table: "opened_bottles", filter: `owner_id=eq.${profile.id}` }, () => loadSummaryRef.current())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile.id]);

  const totalExpenses = financialSummary ? financialSummary.monthlyExpenses : 0;
  const totalIncome = financialSummary ? financialSummary.totalIncome : balance;
  const netProfit = totalIncome - totalExpenses;
  const stockResaleValue = financialSummary ? financialSummary.stockResaleValue : 0;
  const stockExpectedProfit = financialSummary ? financialSummary.stockExpectedProfit : 0;
  const hasFinancials = financialSummary !== null && financialSummary.monthlyExpenses > 0;

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

          {/* Stock Resale + Expected Profit — 2 cards */}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col items-center justify-center gap-1 text-center rounded-2xl px-3 py-2.5" style={{ background: "oklch(0.18 0.02 60)" }}>
              <div className="flex items-center gap-1 text-[10px] font-semibold" style={{ color: "rgba(255,255,255,0.55)" }}>
                <BarChart3 className="h-3 w-3" /> Stock Resale Cost
              </div>
              <span className="font-black text-sm" style={{ color: "#eab308" }}>
                ${fmt(stockResaleValue)}
              </span>
            </div>
            <div className="flex flex-col items-center justify-center gap-1 text-center rounded-2xl px-3 py-2.5" style={{ background: "oklch(0.18 0.02 60)" }}>
              <div className="flex items-center gap-1 text-[10px] font-semibold" style={{ color: "rgba(255,255,255,0.55)" }}>
                <TrendingUp className="h-3 w-3" /> Expected Profit
              </div>
              <span className="font-black text-sm" style={{
                color: stockExpectedProfit >= 0 ? "#86efac" : "#fca5a5"
              }}>
                {stockExpectedProfit >= 0 ? "+" : ""}${fmt(stockExpectedProfit)}
              </span>
            </div>
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
        <TransactionsTab profile={profile} onDeleted={loadSummary} />
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
  const { effectiveOwnerId, activeBar } = useChain();
  if (!profile) return null;
  // For chain owners, use the active bar's id AND bar name so PDFs/queries are scoped to that bar
  const walletProfile = profile.role === "owner"
    ? { ...profile, id: effectiveOwnerId(profile.id), username: activeBar?.bar_name ?? profile.username }
    : profile;
  if (walletProfile.role === "owner") return <OwnerWallet profile={walletProfile} />;
  return <CashierWallet profile={walletProfile} />;
}

