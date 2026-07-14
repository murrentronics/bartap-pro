import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { useChain } from "@/lib/ChainContext";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, TrendingDown, DollarSign, ShoppingBag, Loader2, ChevronDown } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type OrderItem = { name: string; qty: number; price: number };

type Order = {
  id: string;
  total: number;
  items: OrderItem[];
  created_at: string;
};

type Expense = {
  id: string;
  amount: number;
  description: string | null;
  expense_date: string;
};

type FilterType = "day" | "week" | "month" | "year" | "period";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function startOf(filter: FilterType, from?: string): Date {
  const now = from ? new Date(from) : new Date();
  const d = new Date(now);
  if (filter === "day")   { d.setHours(0, 0, 0, 0); }
  if (filter === "week")  { d.setDate(d.getDate() - d.getDay()); d.setHours(0, 0, 0, 0); }
  if (filter === "month") { d.setDate(1); d.setHours(0, 0, 0, 0); }
  if (filter === "year")  { d.setMonth(0, 1); d.setHours(0, 0, 0, 0); }
  return d;
}

function endOf(filter: FilterType, to?: string): Date {
  const now = to ? new Date(to) : new Date();
  const d = new Date(now);
  d.setHours(23, 59, 59, 999);
  return d;
}

function filterLabel(filter: FilterType, from: string, to: string): string {
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };
  if (filter === "day")   return new Date().toLocaleDateString("en-GB", opts);
  if (filter === "week")  return "This Week";
  if (filter === "month") return new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  if (filter === "year")  return new Date().getFullYear().toString();
  return `${new Date(from).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${new Date(to).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
}

// Aggregate item quantities across orders
function aggregateItems(orders: Order[]): { name: string; qty: number; revenue: number }[] {
  const map = new Map<string, { qty: number; revenue: number }>();
  for (const o of orders) {
    for (const it of o.items) {
      const existing = map.get(it.name) ?? { qty: 0, revenue: 0 };
      map.set(it.name, {
        qty: existing.qty + it.qty,
        revenue: existing.revenue + it.qty * it.price,
      });
    }
  }
  return Array.from(map.entries())
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.qty - a.qty);
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function SummaryPage() {
  const { profile } = useAuth();
  const { effectiveOwnerId } = useChain();

  const [filter, setFilter] = useState<FilterType>("day");
  const [fromDate, setFromDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [toDate,   setToDate]   = useState(() => new Date().toISOString().slice(0, 10));
  const [showPeriod, setShowPeriod] = useState(false);

  const [orders,   setOrders]   = useState<Order[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading,  setLoading]  = useState(true);

  const ownerId = profile ? effectiveOwnerId(profile.id) : "";

  const load = useCallback(async () => {
    if (!ownerId) return;
    setLoading(true);

    let start: Date, end: Date;
    if (filter === "period") {
      start = new Date(fromDate + "T00:00:00");
      end   = new Date(toDate   + "T23:59:59");
    } else {
      start = startOf(filter);
      end   = endOf(filter);
    }

    const startIso = start.toISOString();
    const endIso   = end.toISOString();

    const [ordersRes, expensesRes] = await Promise.all([
      supabase
        .from("orders")
        .select("id, total, items, created_at")
        .eq("owner_id", ownerId)
        .gte("created_at", startIso)
        .lte("created_at", endIso)
        .order("created_at", { ascending: false }),
      supabase
        .from("owner_expenses")
        .select("id, amount, description, expense_date")
        .eq("owner_id", ownerId)
        .gte("expense_date", start.toISOString().slice(0, 10))
        .lte("expense_date", end.toISOString().slice(0, 10))
        .order("expense_date", { ascending: false }),
    ]);

    setOrders((ordersRes.data ?? []) as Order[]);
    setExpenses((expensesRes.data ?? []) as Expense[]);
    setLoading(false);
  }, [ownerId, filter, fromDate, toDate]);

  useEffect(() => { load(); }, [load]);

  if (!profile || profile.role !== "owner") {
    return <div className="text-center text-muted-foreground py-20">Owners only.</div>;
  }

  const totalIncome   = orders.reduce((s, o) => s + Number(o.total), 0);
  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const totalProfit   = totalIncome - totalExpenses;
  const items         = aggregateItems(orders);

  const FILTERS: { key: FilterType; label: string }[] = [
    { key: "day",    label: "Day"    },
    { key: "week",   label: "Week"   },
    { key: "month",  label: "Month"  },
    { key: "year",   label: "Year"   },
    { key: "period", label: "Period" },
  ];

  return (
    <div className="space-y-5 pb-24">
      {/* Header */}
      <div>
        <h1 className="text-xl font-black">Summary</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {filterLabel(filter, fromDate, toDate)}
        </p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => { setFilter(f.key); if (f.key === "period") setShowPeriod(true); else setShowPeriod(false); }}
            className="flex-1 h-9 rounded-xl text-xs font-black transition active:scale-[0.97]"
            style={filter === f.key
              ? { background: "var(--gradient-hero)", color: "var(--primary-foreground)" }
              : { background: "var(--gradient-card)", border: "1px solid var(--border)", color: "var(--muted-foreground)" }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Period date pickers */}
      {filter === "period" && (
        <div className="flex gap-3 items-center">
          <div className="flex-1">
            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">From</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="mt-1 w-full h-9 rounded-xl border border-border bg-muted px-3 text-sm font-bold outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="flex-1">
            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">To</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="mt-1 w-full h-9 rounded-xl border border-border bg-muted px-3 text-sm font-bold outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-3 gap-2">
            {/* Income */}
            <div className="rounded-2xl p-3 flex flex-col gap-1 text-center"
              style={{ background: "var(--gradient-card)", border: "1px solid var(--border)" }}>
              <div className="flex items-center justify-center gap-1 text-[10px] font-semibold text-muted-foreground">
                <DollarSign className="h-3 w-3" /> Income
              </div>
              <div className="font-black text-sm" style={{ color: "#86efac" }}>
                ${fmt(totalIncome)}
              </div>
            </div>

            {/* Expense */}
            <div className="rounded-2xl p-3 flex flex-col gap-1 text-center"
              style={{ background: "var(--gradient-card)", border: "1px solid var(--border)" }}>
              <div className="flex items-center justify-center gap-1 text-[10px] font-semibold text-muted-foreground">
                <TrendingDown className="h-3 w-3" /> Expense
              </div>
              <div className="font-black text-sm" style={{ color: totalExpenses > 0 ? "#fca5a5" : "var(--muted-foreground)" }}>
                {totalExpenses > 0 ? `$${fmt(totalExpenses)}` : "—"}
              </div>
            </div>

            {/* Profit */}
            <div className="rounded-2xl p-3 flex flex-col gap-1 text-center"
              style={{ background: "var(--gradient-card)", border: "1px solid var(--border)" }}>
              <div className="flex items-center justify-center gap-1 text-[10px] font-semibold text-muted-foreground">
                <TrendingUp className="h-3 w-3" /> Profit
              </div>
              <div className="font-black text-sm" style={{
                color: totalProfit > 0 ? "#86efac" : totalProfit < 0 ? "#fca5a5" : "var(--muted-foreground)"
              }}>
                {totalIncome > 0 || totalExpenses > 0
                  ? `${totalProfit >= 0 ? "+" : ""}$${fmt(totalProfit)}`
                  : "—"}
              </div>
            </div>
          </div>

          {/* Items sold */}
          <div className="rounded-2xl border border-border overflow-hidden"
            style={{ background: "var(--gradient-card)" }}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <ShoppingBag className="h-4 w-4 text-primary" />
                <span className="font-black text-sm">Items Sold</span>
              </div>
              <span className="text-xs text-muted-foreground font-semibold">
                {orders.length} order{orders.length !== 1 ? "s" : ""}
              </span>
            </div>

            {items.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-sm">
                No sales in this period
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {items.map((it) => (
                  <div key={it.name} className="flex items-center justify-between px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-sm truncate">{it.name}</p>
                      <p className="text-xs text-muted-foreground">{it.qty} sold</p>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className="font-black text-sm" style={{ color: "#86efac" }}>${fmt(it.revenue)}</p>
                    </div>
                  </div>
                ))}
                {/* Total row */}
                <div className="flex items-center justify-between px-4 py-3"
                  style={{ background: "rgba(var(--primary-rgb,251 146 60)/0.08)" }}>
                  <span className="font-black text-sm">Total</span>
                  <span className="font-black text-sm" style={{ color: "#86efac" }}>${fmt(totalIncome)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Expenses list */}
          {expenses.length > 0 && (
            <div className="rounded-2xl border border-border overflow-hidden"
              style={{ background: "var(--gradient-card)" }}>
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                <TrendingDown className="h-4 w-4 text-red-400" />
                <span className="font-black text-sm">Expenses</span>
              </div>
              <div className="divide-y divide-border/50">
                {expenses.map((e) => (
                  <div key={e.id} className="flex items-center justify-between px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-sm truncate">{e.description || "Expense"}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(e.expense_date + "T00:00:00").toLocaleDateString("en-GB", {
                          day: "numeric", month: "short", year: "numeric",
                        })}
                      </p>
                    </div>
                    <p className="font-black text-sm shrink-0 ml-3" style={{ color: "#fca5a5" }}>
                      ${fmt(Number(e.amount))}
                    </p>
                  </div>
                ))}
                <div className="flex items-center justify-between px-4 py-3"
                  style={{ background: "rgba(239,68,68,0.06)" }}>
                  <span className="font-black text-sm">Total</span>
                  <span className="font-black text-sm" style={{ color: "#fca5a5" }}>${fmt(totalExpenses)}</span>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
