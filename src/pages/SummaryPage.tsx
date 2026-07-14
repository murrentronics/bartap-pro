import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { useChain } from "@/lib/ChainContext";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, TrendingDown, DollarSign, ShoppingBag, Loader2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { drawHeader, addFootersToAllPages, LM, RM, CONTENT_BOTTOM } from "@/lib/pdfHelpers";
import { downloadPdf } from "@/lib/download";

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

function toISO(d: Date) { return d.toISOString().slice(0, 10); }

function addDays(date: string, days: number): string {
  const d = new Date(date + "T00:00:00");
  d.setDate(d.getDate() + days);
  return toISO(d);
}

function filterLabel(filter: FilterType, from: string, to: string): string {
  const fmt2 = (s: string) => new Date(s + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  if (filter === "day")    return fmt2(from);
  if (filter === "week")   return `${fmt2(from)} – ${fmt2(to)}`;
  if (filter === "month") {
    const d = new Date(from + "T00:00:00");
    return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  }
  if (filter === "year")   return from.slice(0, 4);
  return `${fmt2(from)} – ${fmt2(to)}`;
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

  const today = new Date().toISOString().slice(0, 10);
  const [filter,    setFilter]   = useState<FilterType>("day");
  const [fromDate,  setFromDate] = useState(today);
  const [toDate,    setToDate]   = useState(today);
  const [selMonth,  setSelMonth] = useState(() => new Date().getMonth());
  const [selYear,   setSelYear]  = useState(() => new Date().getFullYear());
  const [earliestDate,   setEarliestDate]   = useState<string>("2020-01-01");
  const [availableYears, setAvailableYears] = useState<number[]>([new Date().getFullYear()]);

  const [orders,   setOrders]   = useState<Order[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [downloaded,  setDownloaded]  = useState(false);

  const ownerId = profile ? effectiveOwnerId(profile.id) : "";

  // Fetch earliest record once to bound pickers + build year list
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
      const endYr   = new Date().getFullYear();
      const yrs: number[] = [];
      for (let y = endYr; y >= startYr; y--) yrs.push(y);
      setAvailableYears(yrs);
    });
  }, [ownerId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync fromDate/toDate when filter or selMonth/selYear change
  useEffect(() => {
    if (filter === "day") {
      setToDate(fromDate);
    } else if (filter === "week") {
      const end = new Date(fromDate + "T00:00:00");
      end.setDate(end.getDate() + 6);
      setToDate(end.toISOString().slice(0, 10));
    } else if (filter === "month") {
      const first = new Date(selYear, selMonth, 1);
      const last  = new Date(selYear, selMonth + 1, 0);
      setFromDate(first.toISOString().slice(0, 10));
      setToDate(last.toISOString().slice(0, 10));
    } else if (filter === "year") {
      setFromDate(`${selYear}-01-01`);
      setToDate(`${selYear}-12-31`);
    }
    // period: fromDate/toDate set directly by calendar inputs
  }, [filter, fromDate, selMonth, selYear]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
    if (!ownerId) return;
    setLoading(true);
    const startIso = new Date(fromDate + "T00:00:00").toISOString();
    const endIso   = new Date(toDate   + "T23:59:59").toISOString();

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
        .gte("expense_date", fromDate)
        .lte("expense_date", toDate)
        .order("expense_date", { ascending: false }),
    ]);

    setOrders((ordersRes.data ?? []) as Order[]);
    setExpenses((expensesRes.data ?? []) as Expense[]);
    setLoading(false);
  }, [ownerId, fromDate, toDate]);

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

      // Generated line
      doc.setFont("helvetica", "italic"); doc.setFontSize(7); doc.setTextColor(150, 100, 30);
      doc.text("Generated: " + generated + "  |  Filter: " + filter.toUpperCase() + (filter === "period" ? " (" + fromDate + " → " + toDate + ")" : ""), LM, y);
      doc.setTextColor(0, 0, 0); y += 5;

      // Summary box
      const boxH = 28;
      doc.setFillColor(245, 240, 230);
      doc.roundedRect(LM, y, RM - LM, boxH, 2, 2, "F");
      doc.setDrawColor(232, 146, 42); doc.setLineWidth(0.4);
      doc.roundedRect(LM, y, RM - LM, boxH, 2, 2, "S");
      doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(100, 70, 10);
      doc.text("SUMMARY — " + periodLabel.toUpperCase(), LM + 3, y + 5);

      const colW = (RM - LM) / 3;
      const summCols = [
        { label: "Income",  value: "$" + fmt(totalIncome),   color: [40, 140, 40]  as [number,number,number] },
        { label: "Expense", value: "$" + fmt(totalExpenses), color: [180, 40, 40]  as [number,number,number] },
        { label: "Profit",  value: (totalProfit >= 0 ? "+" : "") + "$" + fmt(totalProfit), color: (totalProfit >= 0 ? [40,140,40] : [180,40,40]) as [number,number,number] },
      ];
      summCols.forEach((col, i) => {
        const cx = LM + i * colW + colW / 2;
        doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(100, 100, 100);
        doc.text(col.label, cx, y + 13, { align: "center" });
        doc.setFont("helvetica", "bold"); doc.setFontSize(9);
        doc.setTextColor(col.color[0], col.color[1], col.color[2]);
        doc.text(col.value, cx, y + 21, { align: "center" });
      });
      doc.setTextColor(0, 0, 0); y += boxH + 6;

      // Items sold section
      if (items.length > 0) {
        doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(130, 130, 130);
        doc.text("ITEMS SOLD", LM, y);
        doc.text("QTY", LM + 100, y, { align: "right" });
        doc.text("REVENUE", RM, y, { align: "right" }); y += 3;
        doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.2); doc.line(LM, y, RM, y); y += 4;
        doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(0, 0, 0);

        items.forEach((it) => {
          if (y > CONTENT_BOTTOM) { doc.addPage(); y = 20; }
          doc.text(it.name, LM, y);
          doc.setTextColor(100, 100, 100);
          doc.text(String(it.qty), LM + 100, y, { align: "right" });
          doc.setFont("helvetica", "bold"); doc.setTextColor(40, 140, 40);
          doc.text("$" + fmt(it.revenue), RM, y, { align: "right" });
          doc.setFont("helvetica", "normal"); doc.setTextColor(0, 0, 0);
          y += 5;
          doc.setDrawColor(230, 230, 230); doc.setLineWidth(0.1); doc.line(LM, y, RM, y); y += 3;
        });

        // Total row
        if (y > CONTENT_BOTTOM) { doc.addPage(); y = 20; }
        doc.setDrawColor(232, 146, 42); doc.setLineWidth(0.4); doc.line(LM, y, RM, y); y += 4;
        doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(100, 70, 10);
        doc.text("TOTAL INCOME", LM, y);
        doc.setTextColor(40, 140, 40);
        doc.text("$" + fmt(totalIncome), RM, y, { align: "right" });
        doc.setTextColor(0, 0, 0); y += 8;
      }

      // Expenses section
      if (expenses.length > 0) {
        if (y > CONTENT_BOTTOM) { doc.addPage(); y = 20; }
        doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(130, 130, 130);
        doc.text("EXPENSES", LM, y);
        doc.text("DATE", LM + 100, y, { align: "right" });
        doc.text("AMOUNT", RM, y, { align: "right" }); y += 3;
        doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.2); doc.line(LM, y, RM, y); y += 4;
        doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(0, 0, 0);

        expenses.forEach((e) => {
          if (y > CONTENT_BOTTOM) { doc.addPage(); y = 20; }
          const dateStr = new Date(e.expense_date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
          doc.text(e.description || "Expense", LM, y);
          doc.setTextColor(100, 100, 100);
          doc.text(dateStr, LM + 100, y, { align: "right" });
          doc.setFont("helvetica", "bold"); doc.setTextColor(180, 40, 40);
          doc.text("$" + fmt(Number(e.amount)), RM, y, { align: "right" });
          doc.setFont("helvetica", "normal"); doc.setTextColor(0, 0, 0);
          y += 5;
          doc.setDrawColor(230, 230, 230); doc.setLineWidth(0.1); doc.line(LM, y, RM, y); y += 3;
        });

        // Total row
        if (y > CONTENT_BOTTOM) { doc.addPage(); y = 20; }
        doc.setDrawColor(232, 146, 42); doc.setLineWidth(0.4); doc.line(LM, y, RM, y); y += 4;
        doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(100, 70, 10);
        doc.text("TOTAL EXPENSES", LM, y);
        doc.setTextColor(180, 40, 40);
        doc.text("$" + fmt(totalExpenses), RM, y, { align: "right" });
        doc.setTextColor(0, 0, 0); y += 8;
      }

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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black">Summary</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {filterLabel(filter, fromDate, toDate)}
          </p>
        </div>
        <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 font-black"
          disabled={downloading || loading}
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

      {/* Filter tabs */}
      <div className="flex gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className="flex-1 h-9 rounded-xl text-xs font-black transition active:scale-[0.97]"
            style={filter === f.key
              ? { background: "var(--gradient-hero)", color: "var(--primary-foreground)" }
              : { background: "var(--gradient-card)", border: "1px solid var(--border)", color: "var(--muted-foreground)" }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* ── Day picker — calendar ── */}
      {filter === "day" && (
        <div className="rounded-2xl border border-border p-4 space-y-2" style={{ background: "var(--gradient-card)" }}>
          <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Select Day</label>
          <input type="date" value={fromDate} max={today} min={earliestDate}
            onChange={(e) => { if (e.target.value) setFromDate(e.target.value); }}
            className="w-full h-11 rounded-xl border border-border bg-background px-3 text-sm font-bold outline-none focus:ring-1 focus:ring-primary" />
          <p className="text-xs text-muted-foreground">Showing data for: <span className="font-black text-foreground">{new Date(fromDate + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span></p>
        </div>
      )}

      {/* ── Week picker — pick start day, shows +6 days ── */}
      {filter === "week" && (
        <div className="rounded-2xl border border-border p-4 space-y-2" style={{ background: "var(--gradient-card)" }}>
          <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Select Week Start</label>
          <input type="date" value={fromDate} max={today} min={earliestDate}
            onChange={(e) => { if (e.target.value) setFromDate(e.target.value); }}
            className="w-full h-11 rounded-xl border border-border bg-background px-3 text-sm font-bold outline-none focus:ring-1 focus:ring-primary" />
          <p className="text-xs text-muted-foreground">
            Period: <span className="font-black text-foreground">
              {new Date(fromDate + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
              {" → "}
              {new Date(toDate + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
            </span>
          </p>
        </div>
      )}

      {/* ── Month picker — month + year dropdowns ── */}
      {filter === "month" && (
        <div className="rounded-2xl border border-border p-4 space-y-3" style={{ background: "var(--gradient-card)" }}>
          <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Select Month</label>
          <div className="flex gap-3">
            <select value={selMonth} onChange={(e) => setSelMonth(Number(e.target.value))}
              className="flex-1 h-11 rounded-xl border border-border bg-background px-3 text-sm font-bold outline-none focus:ring-1 focus:ring-primary">
              {["January","February","March","April","May","June","July","August","September","October","November","December"].map((m, i) => (
                <option key={i} value={i}>{m}</option>
              ))}
            </select>
            <select value={selYear} onChange={(e) => setSelYear(Number(e.target.value))}
              className="w-28 h-11 rounded-xl border border-border bg-background px-3 text-sm font-bold outline-none focus:ring-1 focus:ring-primary">
              {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* ── Year picker — only years with data ── */}
      {filter === "year" && (
        <div className="rounded-2xl border border-border p-4 space-y-2" style={{ background: "var(--gradient-card)" }}>
          <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Select Year</label>
          <div className="flex flex-wrap gap-2">
            {availableYears.map((y) => (
              <button key={y} onClick={() => setSelYear(y)}
                className="h-11 px-6 rounded-xl text-sm font-black transition active:scale-95"
                style={selYear === y
                  ? { background: "var(--gradient-hero)", color: "var(--primary-foreground)" }
                  : { background: "var(--gradient-card)", border: "1px solid var(--border)", color: "var(--muted-foreground)" }}>
                {y}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Period picker — two calendars ── */}
      {filter === "period" && (
        <div className="rounded-2xl border border-border p-4 space-y-3" style={{ background: "var(--gradient-card)" }}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">From</label>
              <input type="date" value={fromDate} min={earliestDate} max={toDate}
                onChange={(e) => { if (e.target.value) setFromDate(e.target.value); }}
                className="mt-1 w-full h-11 rounded-xl border border-border bg-background px-3 text-sm font-bold outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div>
              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">To</label>
              <input type="date" value={toDate} min={fromDate} max={today}
                onChange={(e) => { if (e.target.value) setToDate(e.target.value); }}
                className="mt-1 w-full h-11 rounded-xl border border-border bg-background px-3 text-sm font-bold outline-none focus:ring-1 focus:ring-primary" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Earliest record: <span className="font-black text-foreground">{new Date(earliestDate + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span></p>
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
