import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { useChain } from "@/lib/ChainContext";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, TrendingDown, DollarSign, ShoppingBag, Loader2, Download, CalendarIcon, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { drawHeader, addFootersToAllPages, LM, RM, CONTENT_BOTTOM } from "@/lib/pdfHelpers";
import { downloadPdf } from "@/lib/download";
import { CATEGORIES } from "@/lib/categories";

// ─── Types ────────────────────────────────────────────────────────────────────
type OrderItem = { id?: string; name: string; qty: number; price: number; units_consumed?: number | null };

type Order = {
  id: string;
  total: number;
  paid: number;
  change_given: number;
  items: OrderItem[];
  created_at: string;
};

type Expense = {
  id: string;
  amount: number;
  description: string | null;
  expense_date: string;
  created_at: string;
};

type ProductCost = { id: string; name: string; cost_price: number; units_per_item: number; category: string | null };

type FilterType = "session" | "week" | "month" | "year" | "period";

// A bar_sessions row — opened_at/closed_at are the DB column names
type BarSession = {
  id: string;
  opened_at: string;
  closed_at: string | null;
};

// Per-session loaded data (lazy — loaded when accordion opens)
type SessionData = {
  orders: Order[];
  expenses: Expense[];
  walletIncome: number;
  loaded: boolean;
  loading: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function toISO(d: Date) { return d.toISOString().slice(0, 10); }

function filterLabel(filter: FilterType, from: string, to: string): string {
  const fmt2 = (s: string) => new Date(s + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  if (filter === "session") return fmt2(from);
  if (filter === "week")    return `${fmt2(from)} – ${fmt2(to)}`;
  if (filter === "month") {
    const d = new Date(from + "T00:00:00");
    return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  }
  if (filter === "year") return from.slice(0, 4);
  return `${fmt2(from)} – ${fmt2(to)}`;
}

const TZ = "America/Port_of_Spain";

function fmtTs(iso: string) {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: TZ });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: TZ });
  return `${date} · ${time}`;
}

// Returns YYYY-MM-DD in TT timezone for a UTC ISO string
function isoDateTT(iso: string) {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });
}

// Aggregate item quantities across orders, joining cost_price from products map
function aggregateItems(
  orders: Order[],
  costMap: Map<string, number>,
  nameMap: Map<string, number>,
  categoryMap: Map<string, string>,
): { name: string; qty: number; revenue: number; costTotal: number; category: string }[] {
  const map = new Map<string, { qty: number; revenue: number; costTotal: number; category: string }>();
  for (const o of orders) {
    for (const it of o.items) {
      const existing = map.get(it.name) ?? { qty: 0, revenue: 0, costTotal: 0, category: "miscellaneous" };
      let costEach = 0;
      if (it.id && costMap.has(it.id)) {
        costEach = costMap.get(it.id)!;
      } else if (nameMap.has(it.name)) {
        costEach = nameMap.get(it.name)!;
      } else {
        const SYNTHETIC_PREFIXES = ["Shot", "2oz", "1oz", "Retail", "Pack"];
        const colonIdx = it.name.indexOf(": ");
        const isShotId = (it.id ?? "").startsWith("shot-");
        if (colonIdx !== -1) {
          const prefix = it.name.slice(0, colonIdx).trim();
          const isSyntheticPrefix = SYNTHETIC_PREFIXES.some(p => prefix.toLowerCase().startsWith(p.toLowerCase()));
          if (isSyntheticPrefix || isShotId) {
            const productName = it.name.slice(colonIdx + 2);
            if (nameMap.has(productName)) costEach = nameMap.get(productName)!;
          }
        }
      }
      const cat = categoryMap.get(it.name) ?? ((() => {
        const SYNTHETIC_PREFIXES = ["Shot", "2oz", "1oz", "Retail", "Pack"];
        const colonIdx = it.name.indexOf(": ");
        const isShotId = (it.id ?? "").startsWith("shot-");
        if (colonIdx !== -1) {
          const prefix = it.name.slice(0, colonIdx).trim();
          const isSyntheticPrefix = SYNTHETIC_PREFIXES.some(p => prefix.toLowerCase().startsWith(p.toLowerCase()));
          if (isSyntheticPrefix || isShotId) {
            const productName = it.name.slice(colonIdx + 2);
            return categoryMap.get(productName) ?? existing.category;
          }
        }
        return existing.category;
      })());
      const costUnits = (it.units_consumed != null && it.units_consumed > 0) ? it.units_consumed : it.qty;
      map.set(it.name, {
        qty:       existing.qty + it.qty,
        revenue:   existing.revenue + it.qty * it.price,
        costTotal: existing.costTotal + costUnits * costEach,
        category:  cat,
      });
    }
  }
  return Array.from(map.entries())
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.qty - a.qty);
}

function isoToDate(iso: string): Date { return new Date(iso + "T00:00:00"); }
function dateToIso(d: Date): string { return toISO(d); }

// ─── CalendarPopover ─────────────────────────────────────────────────────────
function CalendarPopover({
  value, onChange, minDate, maxDate, label,
}: {
  value: string; onChange: (iso: string) => void;
  minDate?: string; maxDate?: string; label: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = isoToDate(value);
  const fromMonth = minDate ? isoToDate(minDate) : undefined;
  const toMonth   = maxDate ? isoToDate(maxDate) : undefined;
  return (
    <div className="w-full">
      <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block mb-1">{label}</label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button"
            className="w-full h-11 rounded-xl border border-border bg-background px-3 text-sm font-bold outline-none focus:ring-1 focus:ring-primary flex items-center justify-between gap-2 hover:bg-accent/40 transition-colors">
            <span>{selected.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
            <CalendarIcon className="h-4 w-4 text-muted-foreground shrink-0" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 z-50" align="start" sideOffset={4}>
          <Calendar mode="single" selected={selected}
            onSelect={(day) => { if (day) { onChange(dateToIso(day)); setOpen(false); } }}
            defaultMonth={selected} startMonth={fromMonth} endMonth={toMonth}
            disabled={[
              ...(fromMonth ? [{ before: fromMonth }] : []),
              ...(toMonth   ? [{ after:  toMonth   }] : []),
            ]}
            captionLayout="dropdown" className="rounded-xl border-0" />
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ─── SessionAccordion ─────────────────────────────────────────────────────────
// Renders one bar session as an expandable accordion.
// On first expand it fetches the session's orders + expenses, then shows totals.
function SessionAccordion({
  session,
  products,
  categoryFilter,
  isActive,
}: {
  session: BarSession;
  products: ProductCost[];
  categoryFilter: string;
  isActive: boolean; // true = bar is currently open for this session
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<SessionData>({ orders: [], expenses: [], walletIncome: 0, loaded: false, loading: false });
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const loadedRef = useRef(false);

  const startIso = session.opened_at;
  const endIso   = session.closed_at ?? new Date().toISOString();

  const loadData = useCallback(async () => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    setData(d => ({ ...d, loading: true }));
    const [ordRes, expRes, walletRes] = await Promise.all([
      supabase.from("orders")
        .select("id, total, paid, change_given, items, created_at")
        .gte("created_at", startIso).lte("created_at", endIso)
        .order("created_at", { ascending: false }),
      supabase.from("owner_expenses")
        .select("id, amount, description, expense_date, created_at")
        .gte("created_at", startIso).lte("created_at", endIso)
        .order("created_at", { ascending: false }),
      supabase.from("wallet_transactions")
        .select("amount, type, created_at")
        .in("type", ["transfer_in", "credit_payment"])
        .gt("amount", 0)
        .gte("created_at", startIso).lte("created_at", endIso),
    ]);
    setData({
      orders:       (ordRes.data  ?? []) as Order[],
      expenses:     (expRes.data  ?? []) as Expense[],
      walletIncome: (walletRes.data ?? []).reduce((s: number, t: { amount: number }) => s + Number(t.amount), 0),
      loaded: true,
      loading: false,
    });
  }, [startIso, endIso]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !loadedRef.current) loadData();
  };

  // Recompute totals whenever data or products change
  const costMap = new Map<string, number>(
    products.map(p => [p.id,   p.units_per_item > 0 ? p.cost_price / p.units_per_item : p.cost_price])
  );
  const nameMap = new Map<string, number>(
    products.map(p => [p.name, p.units_per_item > 0 ? p.cost_price / p.units_per_item : p.cost_price])
  );
  const categoryMap = new Map<string, string>(products.map(p => [p.name, p.category ?? "miscellaneous"]));

  const allItems = aggregateItems(data.orders, costMap, nameMap, categoryMap);
  const items    = categoryFilter === "all" ? allItems : allItems.filter(it => it.category === categoryFilter);

  const nonStockExpenses = data.expenses.filter(e => {
    const d = e.description ?? "";
    return d.startsWith("Non-Stock Expense") || d.startsWith("Reverted Stock Expense");
  });
  const totalNonStockExpenses = nonStockExpenses.filter(e => Number(e.amount) > 0).reduce((s, e) => s + Number(e.amount), 0);

  const totalIncome    = items.reduce((s, it) => s + it.revenue, 0) + data.walletIncome;
  const totalCostPrice = items.reduce((s, it) => s + it.costTotal, 0) + totalNonStockExpenses;
  const totalProfit    = totalIncome - totalCostPrice;

  const openedLabel  = fmtTs(session.opened_at);
  const closedLabel  = session.closed_at ? fmtTs(session.closed_at) : null;

  return (
    <div className="rounded-2xl border border-border overflow-hidden" style={{ background: "var(--gradient-card)" }}>
      {/* ── Accordion header ── */}
      <button onClick={handleToggle}
        className="w-full px-4 py-3.5 flex items-center justify-between gap-3 transition active:bg-white/5 text-left">
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          {/* Status pill + opened time */}
          <div className="flex items-center gap-2">
            <span className="text-[10px]">{isActive ? "🟢" : "🔴"}</span>
            <span className="text-xs font-black text-foreground">{openedLabel}</span>
            {isActive && (
              <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full"
                style={{ background: "rgba(134,239,172,0.15)", color: "#86efac", border: "1px solid rgba(134,239,172,0.3)" }}>
                LIVE
              </span>
            )}
          </div>
          {/* Closed time or "Open" */}
          <div className="flex items-center gap-1.5">
            <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
            {closedLabel
              ? <span className="text-[11px] text-muted-foreground">Closed {closedLabel}</span>
              : <span className="text-[11px] font-semibold" style={{ color: "#86efac" }}>Still open</span>
            }
          </div>
        </div>
        {/* Session total — always visible even when collapsed */}
        <div className="flex items-center gap-2 shrink-0">
          {data.loaded
            ? <span className="font-black text-sm" style={{ color: totalIncome > 0 ? "#86efac" : "var(--muted-foreground)" }}>
                {totalIncome > 0 ? `$${fmt(totalIncome)}` : "$0.00"}
              </span>
            : isActive
            ? <span className="text-[10px] text-muted-foreground">tap to load</span>
            : <span className="text-[10px] text-muted-foreground">tap to load</span>
          }
          {data.loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          <svg className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>

      {/* ── Accordion body ── */}
      {open && (
        <div className="border-t border-border/50">
          {data.loading && (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          )}
          {data.loaded && (
            <>
              {/* Mini stat row */}
              <div className="grid grid-cols-3 gap-0 border-b border-border/40">
                {[
                  { label: "Income", value: totalIncome,    color: "#86efac" },
                  { label: "Cost",   value: totalCostPrice, color: "#fca5a5" },
                  { label: "Profit", value: totalProfit,    color: totalProfit >= 0 ? "#86efac" : "#fca5a5" },
                ].map((s, i) => (
                  <div key={i} className="px-3 py-3 text-center" style={i < 2 ? { borderRight: "1px solid var(--border)" } : {}}>
                    <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-0.5">{s.label}</p>
                    <p className="font-black text-xs" style={{ color: s.value !== 0 ? s.color : "var(--muted-foreground)" }}>
                      {s.label === "Profit" && s.value > 0 ? "+" : ""}{s.value !== 0 ? `$${fmt(Math.abs(s.value))}` : "—"}
                    </p>
                  </div>
                ))}
              </div>

              {/* Items sold */}
              {items.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground text-sm">No sales in this session</div>
              ) : (
                <div>
                  <div className="px-4 py-2 border-b border-border/40 flex items-center gap-2">
                    <ShoppingBag className="h-3.5 w-3.5 text-primary" />
                    <span className="text-xs font-black">Items Sold</span>
                    <span className="text-[10px] text-muted-foreground ml-auto">{data.orders.length} order{data.orders.length !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="divide-y divide-border/50">
                    {items.map((it) => {
                      const rowProfit = it.revenue - it.costTotal;
                      return (
                        <div key={it.name} className="px-4 py-2.5 space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-bold text-sm leading-tight flex-1">{it.name}</p>
                            <p className="text-xs text-muted-foreground shrink-0">{it.qty} sold</p>
                          </div>
                          <div className="grid grid-cols-3 gap-2 w-full">
                            <div className="text-right">
                              <p className="font-semibold text-xs" style={{ color: "#86efac" }}>${fmt(it.revenue)}</p>
                            </div>
                            <div className="text-right">
                              <p className="font-semibold text-xs" style={{ color: "#fca5a5" }}>
                                {it.costTotal > 0 ? `$${fmt(it.costTotal)}` : "—"}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="font-black text-xs" style={{ color: rowProfit >= 0 ? "#86efac" : "#fca5a5" }}>
                                {rowProfit >= 0 ? "+" : ""}${fmt(rowProfit)}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {/* Subtotals */}
                    <div className="px-4 py-2.5" style={{ background: "rgba(var(--primary-rgb,251 146 60)/0.06)" }}>
                      <div className="grid grid-cols-3 gap-2 w-full">
                        <div className="text-right">
                          <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-0.5">Income</p>
                          <span className="font-black text-xs" style={{ color: "#86efac" }}>${fmt(totalIncome)}</span>
                        </div>
                        <div className="text-right">
                          <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-0.5">Cost</p>
                          <span className="font-black text-xs" style={{ color: "#fca5a5" }}>
                            {totalCostPrice > 0 ? `$${fmt(totalCostPrice)}` : "—"}
                          </span>
                        </div>
                        <div className="text-right">
                          <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-0.5">Profit</p>
                          <span className="font-black text-xs" style={{ color: totalProfit >= 0 ? "#86efac" : "#fca5a5" }}>
                            {totalProfit >= 0 ? "+" : ""}${fmt(totalProfit)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Order Records */}
              {data.orders.length > 0 && (
                <div className="border-t border-border/40">
                  <div className="px-4 py-2 flex items-center justify-between">
                    <span className="text-xs font-black">Order Records</span>
                    <span className="text-[10px] text-muted-foreground">{data.orders.length}</span>
                  </div>
                  <div className="divide-y divide-border/50">
                    {data.orders.map((o) => {
                      const isExp = expandedOrderId === o.id;
                      const timeStr = new Date(o.created_at).toLocaleString("en-GB", {
                        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: true, timeZone: TZ,
                      });
                      return (
                        <div key={o.id}>
                          <button onClick={() => setExpandedOrderId(isExp ? null : o.id)}
                            className="w-full px-4 py-2.5 flex items-center justify-between gap-3 active:bg-white/5 transition text-left">
                            <div className="flex flex-col gap-0.5 min-w-0">
                              <span className="text-[11px] text-muted-foreground">{timeStr}</span>
                              <span className="text-[10px] text-white/40">
                                {o.items.map(i => `${i.qty}× ${i.name}`).join(" · ")}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="font-black text-xs" style={{ color: "#86efac" }}>${fmt(Number(o.total))}</span>
                              <svg className={`h-3 w-3 text-muted-foreground transition-transform ${isExp ? "rotate-180" : ""}`}
                                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="6 9 12 15 18 9" />
                              </svg>
                            </div>
                          </button>
                          {isExp && (
                            <div className="px-4 pb-3 space-y-1.5 border-t border-border/40" style={{ background: "rgba(0,0,0,0.15)" }}>
                              <div className="pt-2 space-y-1">
                                {o.items.map((item, idx) => (
                                  <div key={idx} className="flex items-center justify-between gap-2">
                                    <div className="flex items-baseline gap-1.5 min-w-0">
                                      <span className="text-xs font-black text-white/70 shrink-0">{item.qty}×</span>
                                      <span className="text-xs font-semibold truncate">{item.name}</span>
                                      <span className="text-[10px] text-white/40 shrink-0">@ ${fmt(Number(item.price))}</span>
                                    </div>
                                    <span className="font-black text-xs shrink-0" style={{ color: "#86efac" }}>
                                      ${fmt(item.qty * Number(item.price))}
                                    </span>
                                  </div>
                                ))}
                              </div>
                              <div className="border-t border-border/40 pt-1.5 space-y-0.5">
                                <div className="flex justify-between text-xs">
                                  <span className="text-white/50">Total</span>
                                  <span className="font-black" style={{ color: "#86efac" }}>${fmt(Number(o.total))}</span>
                                </div>
                                <div className="flex justify-between text-xs">
                                  <span className="text-white/50">Paid</span>
                                  <span className="font-semibold text-white/80">${fmt(Number(o.paid))}</span>
                                </div>
                                <div className="flex justify-between text-xs">
                                  <span className="text-white/50">Change</span>
                                  <span className="font-semibold text-white/60">${fmt(Number(o.change_given))}</span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Expenses */}
              {nonStockExpenses.length > 0 && (
                <div className="border-t border-border/40">
                  <div className="px-4 py-2 flex items-center gap-2">
                    <TrendingDown className="h-3.5 w-3.5 text-red-400" />
                    <span className="text-xs font-black">Expenses</span>
                  </div>
                  <div className="divide-y divide-border/50">
                    {nonStockExpenses.map((e) => {
                      const lines = (e.description ?? "").split("\n").filter(Boolean);
                      const detailLines = lines.slice(1).filter(l => !l.startsWith("[Cashier:"));
                      const isRefund = Number(e.amount) < 0;
                      return (
                        <div key={e.id} className="px-4 py-2.5 flex items-start justify-between gap-3"
                          style={isRefund ? { background: "rgba(134,239,172,0.04)" } : {}}>
                          <div className="flex-1 min-w-0">
                            {detailLines.length > 0
                              ? detailLines.map((line, i) => {
                                  const eqIdx = line.lastIndexOf(" = ");
                                  const left  = eqIdx !== -1 ? line.slice(0, eqIdx) : line;
                                  const right = eqIdx !== -1 ? line.slice(eqIdx + 3) : null;
                                  return (
                                    <div key={i} className="flex items-center justify-between gap-2">
                                      <span className="text-sm font-semibold flex-1">{left}</span>
                                      {right && (() => {
                                        const n = parseFloat(right.replace(/[^0-9.-]/g, ""));
                                        const isRef = !isNaN(n) && n < 0;
                                        return <span className="text-xs font-black" style={{ color: isRef ? "#86efac" : "#fca5a5" }}>
                                          {isRef ? `+$${fmt(Math.abs(n))}` : right}
                                        </span>;
                                      })()}
                                    </div>
                                  );
                                })
                              : <p className="font-bold text-sm">Non-Stock Expense</p>
                            }
                          </div>
                          <p className="font-black text-sm shrink-0 ml-3" style={{ color: isRefund ? "#86efac" : "#fca5a5" }}>
                            {isRefund ? `+$${fmt(Math.abs(Number(e.amount)))}` : `$${fmt(Number(e.amount))}`}
                          </p>
                        </div>
                      );
                    })}
                    <div className="flex items-center justify-between px-4 py-2.5" style={{ background: "rgba(239,68,68,0.06)" }}>
                      <span className="font-black text-xs">Total Expenses</span>
                      <span className="font-black text-xs" style={{ color: "#fca5a5" }}>${fmt(totalNonStockExpenses)}</span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function SummaryPage() {
  const { profile } = useAuth();
  const { effectiveOwnerId } = useChain();

  const tzNow = () => new Date(new Date().toLocaleString("en-US", { timeZone: TZ }));
  const today = new Date().toLocaleDateString("en-CA", { timeZone: TZ });

  const [filter,   setFilter]   = useState<FilterType>("session");
  const [fromDate, setFromDate] = useState(today);
  const [toDate,   setToDate]   = useState(today);
  const [selMonth, setSelMonth] = useState(() => tzNow().getMonth());
  const [selYear,  setSelYear]  = useState(() => tzNow().getFullYear());
  const [earliestDate,   setEarliestDate]   = useState<string>("2020-01-01");
  const [availableYears, setAvailableYears] = useState<number[]>([new Date().getFullYear()]);

  // Bar status (for status pill in non-session tabs)
  const [barIsOpen, setBarIsOpen] = useState(false);

  // All sessions — loaded once, filtered by tab/date
  const [allSessions,    setAllSessions]    = useState<BarSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);

  // Products loaded once — passed into every SessionAccordion
  const [products, setProducts] = useState<ProductCost[]>([]);

  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [downloading, setDownloading] = useState(false);
  const [downloaded,  setDownloaded]  = useState(false);

  const ownerId = profile ? effectiveOwnerId(profile.id) : "";

  // ── Load sessions + products once ─────────────────────────────────────────
  useEffect(() => {
    if (!ownerId) return;
    setLoadingSessions(true);
    Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).from("profiles")
        .select("bar_session_start, bar_closed_at").eq("id", ownerId).single(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).from("bar_sessions")
        .select("id, opened_at, closed_at")
        .eq("owner_id", ownerId)
        .order("opened_at", { ascending: false })
        .limit(200),
      supabase.from("products")
        .select("id, name, cost_price, units_per_item, category")
        .eq("owner_id", ownerId),
    ]).then(([profileRes, sessionsRes, productsRes]: any[]) => {
      const pData = profileRes.data;
      const sessionStart: string | null = pData?.bar_session_start ?? null;
      const closedAt: string | null = pData?.bar_closed_at ?? null;
      setBarIsOpen(!!sessionStart && !closedAt);

      // Build session list — active session (if open) first, then history
      const history: BarSession[] = (sessionsRes.data ?? []).map((s: any) => ({
        id: s.id,
        opened_at: s.opened_at,
        closed_at: s.closed_at,
      }));

      // If bar is currently open and the active session row exists in history, mark it;
      // otherwise prepend a synthetic one from profiles columns
      const activeInHistory = sessionStart
        ? history.find(s => s.opened_at === sessionStart)
        : null;
      if (sessionStart && !activeInHistory) {
        history.unshift({ id: "active", opened_at: sessionStart, closed_at: closedAt });
      }

      setAllSessions(history);
      setProducts((productsRes.data ?? []) as ProductCost[]);
      setLoadingSessions(false);
    });
  }, [ownerId]);

  // ── Fetch earliest record to bound pickers + build year list ──────────────
  useEffect(() => {
    if (!ownerId) return;
    Promise.all([
      supabase.from("orders").select("created_at").eq("owner_id", ownerId)
        .order("created_at", { ascending: true }).limit(1).maybeSingle(),
      supabase.from("owner_expenses").select("expense_date").eq("owner_id", ownerId)
        .order("expense_date", { ascending: true }).limit(1).maybeSingle(),
    ]).then(([ordRes, expRes]) => {
      const candidates: string[] = [];
      if (ordRes.data?.created_at) candidates.push(ordRes.data.created_at.slice(0, 10));
      if (expRes.data?.expense_date) candidates.push(expRes.data.expense_date);
      const earliest = candidates.sort()[0] ?? "2020-01-01";
      setEarliestDate(earliest);
      const startYr = parseInt(earliest.slice(0, 4));
      const endYr   = tzNow().getFullYear();
      const yrs: number[] = [];
      for (let y = endYr; y >= startYr; y--) yrs.push(y);
      setAvailableYears(yrs);
    });
  }, [ownerId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync fromDate/toDate when filter changes ──────────────────────────────
  useEffect(() => {
    const nowTZ   = tzNow();
    const nowDay  = nowTZ.toLocaleDateString("en-CA");
    const nowMon  = nowTZ.getMonth();
    const nowYr   = nowTZ.getFullYear();
    if (filter === "session") {
      setFromDate(nowDay); setToDate(nowDay);
    } else if (filter === "week") {
      setFromDate(nowDay);
      const end = new Date(nowTZ); end.setDate(end.getDate() + 6);
      setToDate(end.toLocaleDateString("en-CA"));
    } else if (filter === "month") {
      setSelMonth(nowMon); setSelYear(nowYr);
      const first = new Date(nowYr, nowMon, 1);
      const last  = new Date(nowYr, nowMon + 1, 0);
      setFromDate(first.toLocaleDateString("en-CA"));
      setToDate(last.toLocaleDateString("en-CA"));
    } else if (filter === "year") {
      setSelYear(nowYr);
      setFromDate(`${nowYr}-01-01`); setToDate(`${nowYr}-12-31`);
    } else {
      setFromDate(nowDay); setToDate(nowDay);
    }
  }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (filter !== "month") return;
    const first = new Date(selYear, selMonth, 1);
    const last  = new Date(selYear, selMonth + 1, 0);
    setFromDate(first.toLocaleDateString("en-CA"));
    setToDate(last.toLocaleDateString("en-CA"));
  }, [selMonth, selYear]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (filter !== "year") return;
    setFromDate(`${selYear}-01-01`); setToDate(`${selYear}-12-31`);
  }, [selYear]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (filter !== "week") return;
    const end = new Date(fromDate + "T00:00:00");
    end.setDate(end.getDate() + 6);
    setToDate(end.toLocaleDateString("en-CA"));
  }, [fromDate]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!profile || profile.role !== "owner") {
    return <div className="text-center text-muted-foreground py-20">Owners only.</div>;
  }

  // ── Filter sessions for current tab ───────────────────────────────────────
  // Session tab: sessions whose opened_at date (in TT) matches the selected day
  // Week/Month/Year/Period: sessions whose opened_at date falls within fromDate–toDate
  const filteredSessions: BarSession[] = (() => {
    if (filter === "session") {
      return allSessions.filter(s => isoDateTT(s.opened_at) === fromDate);
    }
    // For all other tabs: opened_at date >= fromDate and <= toDate (using TT timezone)
    return allSessions.filter(s => {
      const d = isoDateTT(s.opened_at);
      return d >= fromDate && d <= toDate;
    });
  })();

  // Active session = the one with no closed_at (bar is open right now)
  const activeSessionId = allSessions.find(s => !s.closed_at)?.id ?? null;

  const FILTERS: { key: FilterType; label: string }[] = [
    { key: "session", label: "Session" },
    { key: "week",    label: "Week"    },
    { key: "month",   label: "Month"   },
    { key: "year",    label: "Year"    },
    { key: "period",  label: "Period"  },
  ];

  const handleDownloadPdf = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "mm", format: "a4" });
      const businessName = profile.username ?? "Owner";
      const periodLabel  = filterLabel(filter, fromDate, toDate);
      const generated    = new Date().toLocaleString("en-GB", {
        hour: "2-digit", minute: "2-digit", hour12: true,
        day: "numeric", month: "short", year: "numeric",
      });
      let y = await drawHeader(doc, businessName, "Summary Report", periodLabel, generated);
      doc.setFont("helvetica", "italic"); doc.setFontSize(7); doc.setTextColor(150, 100, 30);
      doc.text(`Generated: ${generated}  |  Sessions: ${filteredSessions.length}`, LM, y);
      doc.setTextColor(0, 0, 0); y += 5;
      doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(100, 100, 100);
      doc.text(`Period: ${periodLabel} · ${filteredSessions.length} session(s) shown`, LM, y);
      doc.setTextColor(0, 0, 0); y += 8;
      addFootersToAllPages(doc);
      const safePeriod = periodLabel.replace(/[^a-zA-Z0-9]/g, "-");
      await downloadPdf(`summary-${safePeriod}.pdf`, doc.output("datauristring"));
      toast.success("PDF saved to Downloads folder");
      setDownloaded(true);
      setTimeout(() => setDownloaded(false), 5000);
    } catch (err: any) {
      console.error("Summary PDF error:", err);
      toast.error("Download failed: " + (err?.message ?? "unknown error"));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-5 pb-24">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black">Summary</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {filterLabel(filter, fromDate, toDate)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
            className="h-7 rounded-lg border border-border bg-background px-1.5 text-[10px] font-bold outline-none focus:ring-1 focus:ring-primary max-w-[90px]"
            style={{ color: "var(--foreground)" }}>
            <option value="all">All</option>
            {CATEGORIES.map(c => (
              <option key={c.value} value={c.value}>{c.icon} {c.label}</option>
            ))}
          </select>
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 font-black"
            disabled={downloading || loadingSessions}
            onClick={handleDownloadPdf}
            style={downloaded ? { background: "#16a34a", color: "#fff", borderColor: "#16a34a" } : {}}>
            {downloading
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : downloaded
              ? <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              : <Download className="h-3 w-3" />}
            {downloading ? "…" : downloaded ? "Done" : "PDF"}
          </Button>
        </div>
      </div>

      {/* ── Filter tabs ── */}
      <div className="flex gap-1.5 rounded-2xl p-1" style={{ background: "var(--gradient-card)" }}>
        {FILTERS.map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className="flex-1 h-9 rounded-xl text-xs font-black transition active:scale-[0.97]"
            style={filter === f.key
              ? { background: "var(--gradient-hero)", color: "var(--primary-foreground)" }
              : { color: "var(--muted-foreground)" }}>
            {f.label}
          </button>
        ))}
      </div>

      {/* ── Bar status badge (non-session tabs) ── */}
      {filter !== "session" && (
        <div className="rounded-xl px-4 py-2.5 flex items-center gap-3"
          style={{ background: barIsOpen ? "rgba(134,239,172,0.08)" : "rgba(255,255,255,0.04)", border: `1px solid ${barIsOpen ? "rgba(134,239,172,0.25)" : "rgba(255,255,255,0.08)"}` }}>
          <span className="text-sm shrink-0">{barIsOpen ? "🟢" : "🔴"}</span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-black uppercase tracking-widest" style={{ color: barIsOpen ? "#86efac" : "var(--muted-foreground)" }}>
              {barIsOpen ? "Bar Open" : "Bar Closed"}
            </p>
            <p className="text-[11px] text-muted-foreground leading-tight">
              {filter === "week" && (
                <><span className="font-bold text-foreground">{new Date(fromDate + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                {" → "}
                <span className="font-bold text-foreground">{new Date(toDate + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span></>
              )}
              {filter === "month" && (
                <span className="font-bold text-foreground">{new Date(fromDate + "T00:00:00").toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</span>
              )}
              {filter === "year" && (
                <span className="font-bold text-foreground">{fromDate.slice(0, 4)}</span>
              )}
              {filter === "period" && (
                <><span className="font-bold text-foreground">{new Date(fromDate + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
                {" → "}
                <span className="font-bold text-foreground">{new Date(toDate + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span></>
              )}
            </p>
          </div>
        </div>
      )}

      {/* ── Session tab: day picker ── */}
      {filter === "session" && (
        <div className="rounded-2xl border border-border p-4 space-y-2" style={{ background: "var(--gradient-card)" }}>
          <CalendarPopover
            label="Select Day"
            value={fromDate}
            maxDate={today}
            minDate={earliestDate}
            onChange={(v) => setFromDate(v)}
          />
          {!loadingSessions && filteredSessions.length === 0 && (
            <p className="text-xs text-muted-foreground pt-1">No bar sessions found for this day.</p>
          )}
          {!loadingSessions && filteredSessions.length > 0 && (
            <p className="text-xs text-muted-foreground pt-1">
              {filteredSessions.length} session{filteredSessions.length !== 1 ? "s" : ""} on this day
            </p>
          )}
        </div>
      )}

      {/* ── Week picker ── */}
      {filter === "week" && (
        <div className="rounded-2xl border border-border p-4 space-y-2" style={{ background: "var(--gradient-card)" }}>
          <CalendarPopover label="Select Week Start" value={fromDate} maxDate={today} minDate={earliestDate} onChange={(v) => setFromDate(v)} />
          <p className="text-xs text-muted-foreground">
            Period: <span className="font-black text-foreground">
              {new Date(fromDate + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
              {" → "}
              {new Date(toDate + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
            </span>
          </p>
        </div>
      )}

      {/* ── Month picker ── */}
      {filter === "month" && (
        <div className="rounded-2xl border border-border p-4 space-y-3" style={{ background: "var(--gradient-card)" }}>
          <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Select Month</label>
          <div className="flex gap-3">
            <select value={selMonth} onChange={e => setSelMonth(Number(e.target.value))}
              className="flex-1 h-11 rounded-xl border border-border bg-background px-3 text-sm font-bold outline-none focus:ring-1 focus:ring-primary">
              {["January","February","March","April","May","June","July","August","September","October","November","December"].map((m, i) => (
                <option key={i} value={i}>{m}</option>
              ))}
            </select>
            <select value={selYear} onChange={e => setSelYear(Number(e.target.value))}
              className="w-28 h-11 rounded-xl border border-border bg-background px-3 text-sm font-bold outline-none focus:ring-1 focus:ring-primary">
              {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* ── Year picker ── */}
      {filter === "year" && (
        <div className="rounded-2xl border border-border p-4 space-y-2" style={{ background: "var(--gradient-card)" }}>
          <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Select Year</label>
          <div className="relative">
            <select value={selYear} onChange={e => setSelYear(Number(e.target.value))}
              className="w-full h-11 rounded-xl border border-border bg-background pl-4 pr-10 text-sm font-black outline-none focus:ring-1 focus:ring-primary appearance-none cursor-pointer"
              style={{ color: "var(--primary)" }}>
              {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
              <svg className="h-4 w-4" style={{ color: "var(--primary)" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </div>
        </div>
      )}

      {/* ── Period picker ── */}
      {filter === "period" && (
        <div className="rounded-2xl border border-border p-4 space-y-3" style={{ background: "var(--gradient-card)" }}>
          <div className="grid grid-cols-2 gap-3">
            <CalendarPopover label="From" value={fromDate} minDate={earliestDate} maxDate={toDate} onChange={v => setFromDate(v)} />
            <CalendarPopover label="To"   value={toDate}   minDate={fromDate}     maxDate={today}  onChange={v => setToDate(v)}   />
          </div>
          <p className="text-xs text-muted-foreground">
            Earliest record: <span className="font-black text-foreground">
              {new Date(earliestDate + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
            </span>
          </p>
        </div>
      )}

      {/* ── Session list ── */}
      {loadingSessions ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      ) : filteredSessions.length === 0 ? (
        <div className="rounded-2xl border border-border p-8 text-center" style={{ background: "var(--gradient-card)" }}>
          <div className="text-3xl mb-3">📊</div>
          <p className="font-black text-sm">No sessions found</p>
          <p className="text-xs text-muted-foreground mt-1">
            {filter === "session"
              ? "No bar was opened on this day."
              : `No bar sessions in this ${filter}.`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Session count badge */}
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-black text-muted-foreground uppercase tracking-widest">
              {filteredSessions.length} Session{filteredSessions.length !== 1 ? "s" : ""}
              {filter !== "session" && ` · ${filterLabel(filter, fromDate, toDate)}`}
            </span>
          </div>
          {/* Accordions — newest first */}
          {filteredSessions.map(session => (
            <SessionAccordion
              key={session.id}
              session={session}
              products={products}
              categoryFilter={categoryFilter}
              isActive={session.id === activeSessionId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
