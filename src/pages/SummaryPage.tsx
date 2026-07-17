import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { useChain } from "@/lib/ChainContext";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, TrendingDown, DollarSign, ShoppingBag, Loader2, Download, CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { drawHeader, addFootersToAllPages, LM, RM, CONTENT_BOTTOM } from "@/lib/pdfHelpers";
import { downloadPdf } from "@/lib/download";

// ─── Types ────────────────────────────────────────────────────────────────────
type OrderItem = { id?: string; name: string; qty: number; price: number };

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

type ProductCost = { id: string; name: string; cost_price: number };

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

// Aggregate item quantities across orders, joining cost_price from products map
function aggregateItems(
  orders: Order[],
  costMap: Map<string, number>,
): { name: string; qty: number; revenue: number; costTotal: number }[] {
  const map = new Map<string, { qty: number; revenue: number; costTotal: number }>();
  for (const o of orders) {
    for (const it of o.items) {
      const existing = map.get(it.name) ?? { qty: 0, revenue: 0, costTotal: 0 };
      const costEach = it.id ? (costMap.get(it.id) ?? 0) : 0;
      map.set(it.name, {
        qty:       existing.qty + it.qty,
        revenue:   existing.revenue + it.qty * it.price,
        costTotal: existing.costTotal + it.qty * costEach,
      });
    }
  }
  return Array.from(map.entries())
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.qty - a.qty);
}

// ─── Date helpers ─────────────────────────────────────────────────────────────
function isoToDate(iso: string): Date {
  return new Date(iso + "T00:00:00");
}
function dateToIso(d: Date): string {
  return toISO(d);
}

// ─── CalendarPopover ─────────────────────────────────────────────────────────
function CalendarPopover({
  value,
  onChange,
  minDate,
  maxDate,
  label,
}: {
  value: string;
  onChange: (iso: string) => void;
  minDate?: string;
  maxDate?: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = isoToDate(value);
  const fromMonth = minDate ? isoToDate(minDate) : undefined;
  const toMonth = maxDate ? isoToDate(maxDate) : undefined;

  return (
    <div className="w-full">
      <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block mb-1">
        {label}
      </label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="w-full h-11 rounded-xl border border-border bg-background px-3 text-sm font-bold outline-none focus:ring-1 focus:ring-primary flex items-center justify-between gap-2 hover:bg-accent/40 transition-colors"
          >
            <span>
              {selected.toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </span>
            <CalendarIcon className="h-4 w-4 text-muted-foreground shrink-0" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto p-0 z-50"
          align="start"
          sideOffset={4}
        >
          <Calendar
            mode="single"
            selected={selected}
            onSelect={(day) => {
              if (day) {
                onChange(dateToIso(day));
                setOpen(false);
              }
            }}
            defaultMonth={selected}
            startMonth={fromMonth}
            endMonth={toMonth}
            disabled={[
              ...(fromMonth ? [{ before: fromMonth }] : []),
              ...(toMonth ? [{ after: toMonth }] : []),
            ]}
            captionLayout="dropdown"
            className="rounded-xl border-0"
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function SummaryPage() {
  const { profile } = useAuth();
  const { effectiveOwnerId } = useChain();

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Port_of_Spain" });
  const [filter,    setFilter]   = useState<FilterType>("day");
  const [fromDate,  setFromDate] = useState(today);
  const [toDate,    setToDate]   = useState(today);
  const [selMonth,  setSelMonth] = useState(() => new Date().getMonth());
  const [selYear,   setSelYear]  = useState(() => new Date().getFullYear());
  const [earliestDate,   setEarliestDate]   = useState<string>("2020-01-01");
  const [availableYears, setAvailableYears] = useState<number[]>([new Date().getFullYear()]);

  const [orders,   setOrders]   = useState<Order[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [products, setProducts] = useState<ProductCost[]>([]);
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
  // When switching filter tabs, always reset to today
  useEffect(() => {
    const nowToday = new Date().toISOString().slice(0, 10);
    const nowMonth = new Date().getMonth();
    const nowYear  = new Date().getFullYear();

    if (filter === "day") {
      setFromDate(nowToday);
      setToDate(nowToday);
    } else if (filter === "week") {
      setFromDate(nowToday);
      const end = new Date();
      end.setDate(end.getDate() + 6);
      setToDate(end.toISOString().slice(0, 10));
    } else if (filter === "month") {
      setSelMonth(nowMonth);
      setSelYear(nowYear);
      const first = new Date(nowYear, nowMonth, 1);
      const last  = new Date(nowYear, nowMonth + 1, 0);
      setFromDate(first.toISOString().slice(0, 10));
      setToDate(last.toISOString().slice(0, 10));
    } else if (filter === "year") {
      setSelYear(nowYear);
      setFromDate(`${nowYear}-01-01`);
      setToDate(`${nowYear}-12-31`);
    } else if (filter === "period") {
      setFromDate(nowToday);
      setToDate(nowToday);
    }
  }, [filter]); // only fire when filter tab changes

  // When user changes the month/year dropdowns, update fromDate/toDate
  useEffect(() => {
    if (filter !== "month") return;
    const first = new Date(selYear, selMonth, 1);
    const last  = new Date(selYear, selMonth + 1, 0);
    setFromDate(first.toISOString().slice(0, 10));
    setToDate(last.toISOString().slice(0, 10));
  }, [selMonth, selYear]); // eslint-disable-line react-hooks/exhaustive-deps

  // When user changes year button, update fromDate/toDate
  useEffect(() => {
    if (filter !== "year") return;
    setFromDate(`${selYear}-01-01`);
    setToDate(`${selYear}-12-31`);
  }, [selYear]); // eslint-disable-line react-hooks/exhaustive-deps

  // When user picks a day, keep toDate = fromDate
  useEffect(() => {
    if (filter !== "day") return;
    setToDate(fromDate);
  }, [fromDate]); // eslint-disable-line react-hooks/exhaustive-deps

  // When user picks a week start, recalc toDate
  useEffect(() => {
    if (filter !== "week") return;
    const end = new Date(fromDate + "T00:00:00");
    end.setDate(end.getDate() + 6);
    setToDate(end.toISOString().slice(0, 10));
  }, [fromDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
    if (!ownerId) return;
    setLoading(true);
    const startIso = new Date(fromDate + "T00:00:00").toISOString();
    const endIso   = new Date(toDate   + "T23:59:59").toISOString();

    const [ordersRes, expensesRes, productsRes] = await Promise.all([
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
      supabase
        .from("products")
        .select("id, name, cost_price")
        .eq("owner_id", ownerId),
    ]);

    setOrders((ordersRes.data ?? []) as Order[]);
    setExpenses((expensesRes.data ?? []) as Expense[]);
    setProducts((productsRes.data ?? []) as ProductCost[]);
    setLoading(false);
  }, [ownerId, fromDate, toDate]);

  useEffect(() => { load(); }, [load]);

  if (!profile || profile.role !== "owner") {
    return <div className="text-center text-muted-foreground py-20">Owners only.</div>;
  }

  // Build cost map: product id → cost_price
  const costMap = new Map<string, number>(products.map((p) => [p.id, p.cost_price]));

  // Non-stock expenses only (description starts with "Non-Stock Expense")
  const nonStockExpenses = expenses.filter((e) =>
    (e.description ?? "").startsWith("Non-Stock Expense"),
  );
  const totalNonStockExpenses = nonStockExpenses.reduce((s, e) => s + Number(e.amount), 0);

  const items         = aggregateItems(orders, costMap);
  const totalIncome   = items.reduce((s, it) => s + it.revenue, 0);
  const totalCostPrice = items.reduce((s, it) => s + it.costTotal, 0) + totalNonStockExpenses;
  const totalProfit   = totalIncome - totalCostPrice;

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
        { label: "Cost Price", value: "$" + fmt(totalCostPrice), color: [180, 40, 40]  as [number,number,number] },
        { label: "Income",     value: "$" + fmt(totalIncome),    color: [40, 140, 40]  as [number,number,number] },
        { label: "Profit",     value: (totalProfit >= 0 ? "+" : "") + "$" + fmt(totalProfit), color: (totalProfit >= 0 ? [40,140,40] : [180,40,40]) as [number,number,number] },
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
        doc.text("COST", LM + 80, y, { align: "right" });
        doc.text("INCOME", LM + 120, y, { align: "right" });
        doc.text("PROFIT", RM, y, { align: "right" }); y += 3;
        doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.2); doc.line(LM, y, RM, y); y += 4;
        doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(0, 0, 0);

        items.forEach((it) => {
          if (y > CONTENT_BOTTOM) { doc.addPage(); y = 20; }
          const rowProfit = it.revenue - it.costTotal;
          doc.text(it.name + " ×" + it.qty, LM, y);
          doc.setTextColor(180, 40, 40);
          doc.text("$" + fmt(it.costTotal), LM + 80, y, { align: "right" });
          doc.setTextColor(40, 140, 40);
          doc.text("$" + fmt(it.revenue), LM + 120, y, { align: "right" });
          doc.setFont("helvetica", "bold");
          doc.setTextColor(rowProfit >= 0 ? 40 : 180, rowProfit >= 0 ? 140 : 40, 40);
          doc.text((rowProfit >= 0 ? "+" : "") + "$" + fmt(rowProfit), RM, y, { align: "right" });
          doc.setFont("helvetica", "normal"); doc.setTextColor(0, 0, 0);
          y += 5;
          doc.setDrawColor(230, 230, 230); doc.setLineWidth(0.1); doc.line(LM, y, RM, y); y += 3;
        });

        // Total row
        if (y > CONTENT_BOTTOM) { doc.addPage(); y = 20; }
        doc.setDrawColor(232, 146, 42); doc.setLineWidth(0.4); doc.line(LM, y, RM, y); y += 4;
        doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(100, 70, 10);
        doc.text("SUBTOTALS", LM, y);
        doc.setTextColor(180, 40, 40);
        doc.text("$" + fmt(items.reduce((s,i)=>s+i.costTotal,0)), LM + 80, y, { align: "right" });
        doc.setTextColor(40, 140, 40);
        doc.text("$" + fmt(totalIncome), LM + 120, y, { align: "right" });
        doc.setTextColor(totalProfit >= 0 ? 40 : 180, totalProfit >= 0 ? 140 : 40, 40);
        doc.text((totalProfit >= 0 ? "+" : "") + "$" + fmt(totalProfit), RM, y, { align: "right" });
        doc.setTextColor(0, 0, 0); y += 8;
      }

      // Non-stock expenses section
      if (nonStockExpenses.length > 0) {
        if (y > CONTENT_BOTTOM) { doc.addPage(); y = 20; }
        doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(130, 130, 130);
        doc.text("NON-STOCK EXPENSES", LM, y);
        doc.text("DATE", LM + 100, y, { align: "right" });
        doc.text("AMOUNT", RM, y, { align: "right" }); y += 3;
        doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.2); doc.line(LM, y, RM, y); y += 4;
        doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(0, 0, 0);

        nonStockExpenses.forEach((e) => {
          if (y > CONTENT_BOTTOM) { doc.addPage(); y = 20; }
          const dateStr = new Date(e.expense_date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
          const lines = (e.description ?? "").split("\n").filter(Boolean);
          const label = lines.slice(1).join(", ") || "Non-Stock Expense";
          doc.text(label.slice(0, 50), LM, y);
          doc.setTextColor(100, 100, 100);
          doc.text(dateStr, LM + 100, y, { align: "right" });
          doc.setFont("helvetica", "bold"); doc.setTextColor(180, 40, 40);
          doc.text("$" + fmt(Number(e.amount)), RM, y, { align: "right" });
          doc.setFont("helvetica", "normal"); doc.setTextColor(0, 0, 0);
          y += 5;
          doc.setDrawColor(230, 230, 230); doc.setLineWidth(0.1); doc.line(LM, y, RM, y); y += 3;
        });

        if (y > CONTENT_BOTTOM) { doc.addPage(); y = 20; }
        doc.setDrawColor(232, 146, 42); doc.setLineWidth(0.4); doc.line(LM, y, RM, y); y += 4;
        doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(100, 70, 10);
        doc.text("TOTAL NON-STOCK EXPENSES", LM, y);
        doc.setTextColor(180, 40, 40);
        doc.text("$" + fmt(totalNonStockExpenses), RM, y, { align: "right" });
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
          {downloading ? "…" : downloaded ? "Done" : `${filter.charAt(0).toUpperCase() + filter.slice(1)} PDF`}
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

      {/* ── Day picker — calendar popover ── */}
      {filter === "day" && (
        <div className="rounded-2xl border border-border p-4 space-y-2" style={{ background: "var(--gradient-card)" }}>
          <CalendarPopover
            label="Select Day"
            value={fromDate}
            maxDate={today}
            minDate={earliestDate}
            onChange={(v) => setFromDate(v)}
          />
          <p className="text-xs text-muted-foreground">Showing data for: <span className="font-black text-foreground">{new Date(fromDate + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span></p>
        </div>
      )}

      {/* ── Week picker — calendar popover for start day, shows +6 days ── */}
      {filter === "week" && (
        <div className="rounded-2xl border border-border p-4 space-y-2" style={{ background: "var(--gradient-card)" }}>
          <CalendarPopover
            label="Select Week Start"
            value={fromDate}
            maxDate={today}
            minDate={earliestDate}
            onChange={(v) => setFromDate(v)}
          />
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

      {/* ── Year picker — dropdown showing current year + chevron ── */}
      {filter === "year" && (
        <div className="rounded-2xl border border-border p-4 space-y-2" style={{ background: "var(--gradient-card)" }}>
          <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Select Year</label>
          <div className="relative">
            <select
              value={selYear}
              onChange={(e) => setSelYear(Number(e.target.value))}
              className="w-full h-11 rounded-xl border border-border bg-background pl-4 pr-10 text-sm font-black outline-none focus:ring-1 focus:ring-primary appearance-none cursor-pointer"
              style={{ color: "var(--primary)" }}>
              {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
              <svg className="h-4 w-4" style={{ color: "var(--primary)" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </div>
        </div>
      )}

      {/* ── Period picker — two calendar popovers ── */}
      {filter === "period" && (
        <div className="rounded-2xl border border-border p-4 space-y-3" style={{ background: "var(--gradient-card)" }}>
          <div className="grid grid-cols-2 gap-3">
            <CalendarPopover
              label="From"
              value={fromDate}
              minDate={earliestDate}
              maxDate={toDate}
              onChange={(v) => setFromDate(v)}
            />
            <CalendarPopover
              label="To"
              value={toDate}
              minDate={fromDate}
              maxDate={today}
              onChange={(v) => setToDate(v)}
            />
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
          {/* ── Header stat cards ── */}
          <div className="grid grid-cols-3 gap-2">
            {/* Cost Price */}
            <div className="rounded-2xl p-3 flex flex-col gap-1 text-center"
              style={{ background: "var(--gradient-card)", border: "1px solid var(--border)" }}>
              <div className="flex items-center justify-center gap-1 text-[10px] font-semibold text-muted-foreground">
                <TrendingDown className="h-3 w-3" /> Cost
              </div>
              <div className="font-black text-sm" style={{ color: totalCostPrice > 0 ? "#fca5a5" : "var(--muted-foreground)" }}>
                {totalCostPrice > 0 ? `$${fmt(totalCostPrice)}` : "—"}
              </div>
            </div>

            {/* Income */}
            <div className="rounded-2xl p-3 flex flex-col gap-1 text-center"
              style={{ background: "var(--gradient-card)", border: "1px solid var(--border)" }}>
              <div className="flex items-center justify-center gap-1 text-[10px] font-semibold text-muted-foreground">
                <DollarSign className="h-3 w-3" /> Income
              </div>
              <div className="font-black text-sm" style={{ color: "#86efac" }}>
                {totalIncome > 0 ? `$${fmt(totalIncome)}` : "—"}
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
                {totalIncome > 0 || totalCostPrice > 0
                  ? `${totalProfit >= 0 ? "+" : ""}$${fmt(totalProfit)}`
                  : "—"}
              </div>
            </div>
          </div>

          {/* ── Items sold table ── */}
          <div className="rounded-2xl border border-border overflow-hidden"
            style={{ background: "var(--gradient-card)" }}>
            {/* Table header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <ShoppingBag className="h-4 w-4 text-primary" />
                <span className="font-black text-sm">Items Sold</span>
              </div>
              <span className="text-xs text-muted-foreground font-semibold">
                {orders.length} order{orders.length !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Column labels */}
            {items.length > 0 && (
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 px-4 py-2 border-b border-border/60">
                <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Item</span>
                <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest text-right w-20">Cost</span>
                <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest text-right w-20">Income</span>
                <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest text-right w-20">Profit</span>
              </div>
            )}

            {items.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-sm">
                No sales in this period
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {items.map((it) => {
                  const rowProfit = it.revenue - it.costTotal;
                  return (
                    <div key={it.name} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 items-center px-4 py-3">
                      <div className="min-w-0">
                        <p className="font-bold text-sm truncate">{it.name}</p>
                        <p className="text-xs text-muted-foreground">{it.qty} sold</p>
                      </div>
                      <div className="text-right w-20">
                        <p className="font-semibold text-xs" style={{ color: "#fca5a5" }}>
                          {it.costTotal > 0 ? `$${fmt(it.costTotal)}` : "—"}
                        </p>
                      </div>
                      <div className="text-right w-20">
                        <p className="font-semibold text-xs" style={{ color: "#86efac" }}>
                          ${fmt(it.revenue)}
                        </p>
                      </div>
                      <div className="text-right w-20">
                        <p className="font-black text-xs" style={{
                          color: rowProfit > 0 ? "#86efac" : rowProfit < 0 ? "#fca5a5" : "var(--muted-foreground)"
                        }}>
                          {rowProfit >= 0 ? "+" : ""}${fmt(rowProfit)}
                        </p>
                      </div>
                    </div>
                  );
                })}

                {/* Subtotals row */}
                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 items-center px-4 py-3"
                  style={{ background: "rgba(var(--primary-rgb,251 146 60)/0.08)" }}>
                  <span className="font-black text-sm">Subtotals</span>
                  <div className="text-right w-20">
                    <span className="font-black text-sm" style={{ color: "#fca5a5" }}>
                      {items.reduce((s,i)=>s+i.costTotal,0) > 0
                        ? `$${fmt(items.reduce((s,i)=>s+i.costTotal,0))}`
                        : "—"}
                    </span>
                  </div>
                  <div className="text-right w-20">
                    <span className="font-black text-sm" style={{ color: "#86efac" }}>
                      ${fmt(totalIncome)}
                    </span>
                  </div>
                  <div className="text-right w-20">
                    <span className="font-black text-sm" style={{
                      color: (totalIncome - items.reduce((s,i)=>s+i.costTotal,0)) >= 0 ? "#86efac" : "#fca5a5"
                    }}>
                      {(totalIncome - items.reduce((s,i)=>s+i.costTotal,0)) >= 0 ? "+" : ""}${fmt(totalIncome - items.reduce((s,i)=>s+i.costTotal,0))}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Non-stock expenses ── */}
          {nonStockExpenses.length > 0 && (
            <div className="rounded-2xl border border-border overflow-hidden"
              style={{ background: "var(--gradient-card)" }}>
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                <TrendingDown className="h-4 w-4 text-red-400" />
                <span className="font-black text-sm">Non-Stock Expenses</span>
              </div>
              <div className="divide-y divide-border/50">
                {nonStockExpenses.map((e) => {
                  const lines = (e.description ?? "").split("\n").filter(Boolean);
                  // lines[0] = "Non-Stock Expense", rest = detail lines
                  const detailLines = lines.slice(1).filter((l) => !l.startsWith("[Cashier:"));
                  const dateStr = new Date(e.expense_date + "T00:00:00").toLocaleDateString("en-GB", {
                    day: "numeric", month: "short", year: "numeric",
                  });
                  return (
                    <div key={e.id} className="px-4 py-3 flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        {detailLines.length > 0 ? (
                          <div className="space-y-0.5">
                            {detailLines.map((line, i) => {
                              const eqIdx = line.lastIndexOf(" = ");
                              const left  = eqIdx !== -1 ? line.slice(0, eqIdx) : line;
                              const right = eqIdx !== -1 ? line.slice(eqIdx + 3) : null;
                              return (
                                <div key={i} className="flex items-center justify-between gap-2">
                                  <span className="text-sm font-semibold flex-1 truncate">{left}</span>
                                  {right && <span className="text-xs font-black" style={{ color: "#fca5a5" }}>{right}</span>}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="font-bold text-sm">Non-Stock Expense</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">{dateStr}</p>
                      </div>
                      <p className="font-black text-sm shrink-0 ml-3" style={{ color: "#fca5a5" }}>
                        ${fmt(Number(e.amount))}
                      </p>
                    </div>
                  );
                })}
                {/* Total */}
                <div className="flex items-center justify-between px-4 py-3"
                  style={{ background: "rgba(239,68,68,0.06)" }}>
                  <span className="font-black text-sm">Total</span>
                  <span className="font-black text-sm" style={{ color: "#fca5a5" }}>
                    ${fmt(totalNonStockExpenses)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
