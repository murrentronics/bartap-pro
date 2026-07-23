import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useChain } from "@/lib/ChainContext";
import { useTranslation } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { createCashier, deleteCashier, resetCashierPassword } from "@/lib/cashiers.functions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Trash2, Eraser, UserPlus, User, Loader2, FileText, ChevronDown,
  Receipt, ArrowDownLeft, ArrowLeft, X, Download, KeyRound, Eye, EyeOff, DollarSign, CheckCircle2,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { downloadPdf } from "@/lib/download";
import { drawHeader, addFootersToAllPages, LM, RM, CONTENT_BOTTOM } from "@/lib/pdfHelpers";

type Cashier = { id: string; username: string; wallet_balance: number };

type SalaryRecord = {
  id: string;
  cashier_id: string;
  amount: number;
  frequency: "daily" | "weekly" | "biweekly" | "monthly" | null;
  pay_day: number | null;
  pay_time: string | null;
  next_pay_at: string | null;
  last_paid_at: string | null;
  active: boolean;
};

const DAYS_OF_WEEK = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const FREQ_LABELS: Record<string, string> = {
  daily: "Daily", weekly: "Weekly", biweekly: "Bi-Weekly", monthly: "Monthly",
};

function ordSuffix(n: number) {
  if (n === 11 || n === 12 || n === 13) return "th";
  return (["th","st","nd","rd"] as const)[n % 10] ?? "th";
}
function tzNow() {
  // Returns current time as a Date whose .getFullYear()/.getMonth() etc.
  // reflect Trinidad wall-clock time (UTC-4, no DST)
  const now = new Date();
  // Get Trinidad components
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Port_of_Spain",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parseInt(parts.find(p => p.type === t)!.value);
  // Build a Date in UTC that matches Trinidad's wall-clock values
  return new Date(Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")));
}

// Compute next_pay_at as a proper UTC ISO string for Trinidad local time
// includeThisWeek: for weekly/biweekly, allow the day to fall within the current week
function computeNextPayAt(
  frequency: "daily" | "weekly" | "biweekly" | "monthly",
  payDay: number,
  payTime: string, // "HH:MM" 24h in Trinidad local time
  includeThisWeek = false,
): string {
  const [hh, mm] = payTime.split(":").map(Number);
  const now = tzNow();
  const c = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hh, mm, 0, 0));

  if (frequency === "daily") {
    if (c <= now) c.setUTCDate(c.getUTCDate() + 1);
  } else if (frequency === "weekly" || frequency === "biweekly") {
    const todayDow = now.getUTCDay();
    let diff = (payDay - todayDow + 7) % 7;
    if (!includeThisWeek && diff === 0) diff = 7; // force next week if same day and not including this week
    if (includeThisWeek && diff === 0 && c <= now) diff = 7; // same day but time passed — still next week
    c.setUTCDate(c.getUTCDate() + diff);
    if (frequency === "biweekly") c.setUTCDate(c.getUTCDate() + 7);
  } else {
    c.setUTCDate(payDay);
    if (c <= now) c.setUTCMonth(c.getUTCMonth() + 1);
  }

  return new Date(c.getTime() + 4 * 60 * 60 * 1000).toISOString();
}

// ─── Salary History ───────────────────────────────────────────────────────────
function SalaryHistory({ cashier, ownerId, onClose }: {
  cashier: Cashier;
  ownerId: string;
  onClose: () => void;
}) {
  const [payments, setPayments] = useState<{ id: string; amount: number; description: string | null; expense_date: string; created_at: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [openMonth, setOpenMonth] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    supabase
      .from("owner_expenses")
      .select("id, amount, description, expense_date, created_at")
      .eq("owner_id", ownerId)
      .ilike("description", `%Cashier Salary: ${cashier.username}%`)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setPayments(data ?? []);
        setLoading(false);
      });
  }, [cashier.id, ownerId]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = payments.reduce((s, p) => s + Number(p.amount), 0);

  // Group by "Month Year" label
  const months = Array.from(new Set(payments.map((p) =>
    new Date(p.created_at).toLocaleDateString("en-GB", { timeZone: "America/Port_of_Spain", month: "long", year: "numeric" })
  )));

  const getMonthPayments = (month: string) =>
    payments.filter((p) =>
      new Date(p.created_at).toLocaleDateString("en-GB", { timeZone: "America/Port_of_Spain", month: "long", year: "numeric" }) === month
    );

  return (
    <div className="fixed inset-0 z-[70] flex flex-col" style={{ background: "var(--background)" }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-5 pb-3 border-b border-border">
        <button type="button" onClick={onClose}
          className="h-9 w-9 rounded-full flex items-center justify-center bg-muted hover:bg-muted/80 transition shrink-0">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="font-black text-base">{cashier.username} — Salary History</h2>
          <p className="text-xs text-muted-foreground">
            {payments.length} payment{payments.length !== 1 ? "s" : ""} · Total{" "}
            <span className="font-black" style={{ color: "#86efac" }}>${total.toFixed(2)}</span>
          </p>
        </div>
      </div>

      {/* Month accordion list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : months.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm py-16">No salary payments recorded yet.</div>
        ) : (
          months.map((month) => {
            const monthPayments = getMonthPayments(month);
            const monthTotal = monthPayments.reduce((s, p) => s + Number(p.amount), 0);
            const isOpen = openMonth === month;

            return (
              <div key={month} className="rounded-2xl border border-border overflow-hidden" style={{ background: "var(--gradient-card)" }}>
                {/* Month header */}
                <button
                  type="button"
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition"
                  onClick={() => setOpenMonth(isOpen ? null : month)}
                >
                  <div className="flex items-center gap-3">
                    <span className="font-black text-sm">{month}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                      style={{ background: "rgba(134,239,172,0.12)", color: "#86efac", border: "1px solid rgba(134,239,172,0.25)" }}>
                      {monthPayments.length} payment{monthPayments.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-black text-sm" style={{ color: "#86efac" }}>${monthTotal.toFixed(2)}</span>
                    <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  </div>
                </button>

                {/* Payment rows */}
                {isOpen && (
                  <div className="border-t border-border divide-y divide-border/50">
                    {monthPayments.map((p) => {
                      const dateStr = new Date(p.created_at).toLocaleDateString("en-GB", {
                        timeZone: "America/Port_of_Spain", weekday: "short", day: "numeric", month: "short",
                      });
                      const timeStr = new Date(p.created_at).toLocaleTimeString("en-US", {
                        timeZone: "America/Port_of_Spain", hour: "numeric", minute: "2-digit", hour12: true,
                      });
                      return (
                        <div key={p.id} className="flex items-center justify-between px-4 py-3">
                          <div>
                            <p className="font-bold text-sm">{dateStr}</p>
                            <p className="text-xs text-muted-foreground">{timeStr}</p>
                          </div>
                          <p className="font-black text-sm" style={{ color: "#86efac" }}>${Number(p.amount).toFixed(2)}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Salary Tab ───────────────────────────────────────────────────────────────
function SalaryTab({ cashiers, ownerId }: { cashiers: Cashier[]; ownerId: string }) {
  const [salaries, setSalaries] = useState<SalaryRecord[]>([]);
  const [loadingSalaries, setLoadingSalaries] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [paying, setPaying] = useState<string | null>(null);
  const [paid, setPaid] = useState<string | null>(null);
  const [formAmount, setFormAmount] = useState("");
  const [formMode,   setFormMode]   = useState<"now"|"schedule">("now");
  const [formFreq,   setFormFreq]   = useState<"daily"|"weekly"|"biweekly"|"monthly">("monthly");
  const [formPayDay, setFormPayDay] = useState<number>(1);
  const [formTime,   setFormTime]   = useState("18:00");
  const [formIncludeThisWeek, setFormIncludeThisWeek] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmPayCashier,      setConfirmPayCashier]      = useState<Cashier | null>(null);
  const [confirmScheduleCashier, setConfirmScheduleCashier] = useState<string | null>(null);
  const [historyCashier,         setHistoryCashier]         = useState<Cashier | null>(null);

  const loadSalaries = async () => {
    setLoadingSalaries(true);
    const { data } = await supabase.from("cashier_salaries").select("*").eq("owner_id", ownerId);
    setSalaries((data ?? []) as SalaryRecord[]);
    setLoadingSalaries(false);
  };

  // Auto-fire overdue scheduled payments on tab mount
  useEffect(() => {
    if (!ownerId) return;
    (async () => {
      await loadSalaries();
      const { data: due } = await supabase
        .from("cashier_salaries")
        .select("*, profiles!cashier_id(username)")
        .eq("owner_id", ownerId)
        .eq("active", true)
        .not("next_pay_at", "is", null)
        .lte("next_pay_at", new Date().toISOString());
      if (!due || due.length === 0) return;
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Port_of_Spain" });
      for (const row of due as (SalaryRecord & { profiles: { username: string } })[]) {
        const name = row.profiles?.username ?? row.cashier_id;
        await supabase.from("owner_expenses").insert({
          owner_id: ownerId, amount: row.amount,
          description: `Non-Stock Expense\nCashier Salary: ${name} = $${Number(row.amount).toFixed(2)}`,
          expense_date: today,
        });
        const nextAt = row.frequency ? computeNextPayAt(row.frequency, row.pay_day ?? 1, row.pay_time ?? "18:00") : null;
        await supabase.from("cashier_salaries").update({ last_paid_at: new Date().toISOString(), next_pay_at: nextAt }).eq("id", row.id);
      }
      if (due.length > 0) { toast.success(`${due.length} scheduled salary payment${due.length > 1 ? "s" : ""} auto-processed`); loadSalaries(); }
    })();
  }, [ownerId]); // eslint-disable-line react-hooks/exhaustive-deps

  const getSalary = (cashierId: string) => salaries.find((s) => s.cashier_id === cashierId) ?? null;

  const openAccordion = (cashierId: string) => {
    if (openId === cashierId) { setOpenId(null); return; }
    setOpenId(cashierId);
    const ex = getSalary(cashierId);
    setFormAmount(ex ? String(ex.amount) : "");
    setFormMode(ex?.frequency ? "schedule" : "now");
    setFormFreq(ex?.frequency ?? "monthly");
    setFormPayDay(ex?.pay_day ?? 1);
    setFormTime(ex?.pay_time ?? "18:00");
  };

  const saveSalary = async (cashierId: string) => {
    const amount = parseFloat(formAmount);
    if (isNaN(amount) || amount <= 0) { toast.error("Enter a valid amount"); return; }
    setSaving(true);
    const ex = getSalary(cashierId);
    const payload = {
      cashier_id: cashierId, owner_id: ownerId, amount,
      frequency:   formMode === "schedule" ? formFreq : null,
      pay_day:     formMode === "schedule" ? formPayDay : null,
      pay_time:    formMode === "schedule" && formFreq !== "monthly" ? formTime : null,
      next_pay_at: formMode === "schedule" ? computeNextPayAt(formFreq, formPayDay, formTime, formIncludeThisWeek) : null,
      active: true,
    };
    let error;
    if (ex) ({ error } = await supabase.from("cashier_salaries").update(payload).eq("id", ex.id));
    else    ({ error } = await supabase.from("cashier_salaries").insert(payload));
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(formMode === "now" ? "Salary amount saved" : "Schedule saved");
    setOpenId(null);
    loadSalaries();
  };

  // Save amount (if changed) then immediately fire a payment
  const saveAndPayNow = async (cashier: Cashier) => {
    const amount = parseFloat(formAmount);
    if (isNaN(amount) || amount <= 0) { toast.error("Enter a valid amount"); return; }
    setSaving(true);
    const ex = getSalary(cashier.id);
    const payload = { cashier_id: cashier.id, owner_id: ownerId, amount, frequency: null, pay_day: null, pay_time: null, next_pay_at: null, active: true };
    let saveError;
    if (ex) ({ error: saveError } = await supabase.from("cashier_salaries").update(payload).eq("id", ex.id));
    else    ({ error: saveError } = await supabase.from("cashier_salaries").insert(payload));
    if (saveError) { setSaving(false); toast.error(saveError.message); return; }
    // Now pay
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Port_of_Spain" });
    const { error: expError } = await supabase.from("owner_expenses").insert({
      owner_id: ownerId, amount,
      description: `Non-Stock Expense\nCashier Salary: ${cashier.username} = $${amount.toFixed(2)}`,
      expense_date: today,
    });
    await supabase.from("cashier_salaries").update({ last_paid_at: new Date().toISOString() }).eq("cashier_id", cashier.id);
    setSaving(false);
    if (expError) { toast.error(expError.message); return; }
    toast.success(`$${amount.toFixed(2)} paid to ${cashier.username}`);
    setPaid(cashier.id);
    setTimeout(() => setPaid(null), 4000);
    setOpenId(null);
    loadSalaries();
  };

  const removeSalary = async (cashierId: string) => {
    const ex = getSalary(cashierId);
    if (!ex) return;
    await supabase.from("cashier_salaries").delete().eq("id", ex.id);
    toast.success("Salary removed");
    loadSalaries();
  };

  const paySalaryNow = async (cashier: Cashier) => {
    const salary = getSalary(cashier.id);
    if (!salary) return;
    setPaying(cashier.id);
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Port_of_Spain" });
    const { error } = await supabase.from("owner_expenses").insert({
      owner_id: ownerId, amount: salary.amount,
      description: `Non-Stock Expense\nCashier Salary: ${cashier.username} = $${Number(salary.amount).toFixed(2)}`,
      expense_date: today,
    });
    if (!error) await supabase.from("cashier_salaries").update({ last_paid_at: new Date().toISOString() }).eq("id", salary.id);
    setPaying(null);
    if (error) { toast.error(error.message); return; }
    toast.success(`$${Number(salary.amount).toFixed(2)} paid to ${cashier.username}`);
    setPaid(cashier.id);
    setTimeout(() => setPaid(null), 4000);
    loadSalaries();
  };

  const scheduleLabel = (s: SalaryRecord): string => {
    if (!s.frequency) return "";
    if (s.frequency === "daily") return `Daily at ${s.pay_time ?? "—"}`;
    if (s.frequency === "monthly") { const d = s.pay_day ?? 1; return `Monthly · ${d}${ordSuffix(d)}`; }
    const day = s.pay_day !== null ? DAYS_OF_WEEK[s.pay_day] ?? "?" : "?";
    return `${FREQ_LABELS[s.frequency]} · ${day} at ${s.pay_time ?? "—"}`;
  };

  const nextPayLabel = (s: SalaryRecord): string | null => {
    if (!s.next_pay_at) return null;
    return new Date(s.next_pay_at).toLocaleString("en-GB", {
      timeZone: "America/Port_of_Spain", weekday: "short", day: "numeric",
      month: "short", hour: "2-digit", minute: "2-digit", hour12: true,
    });
  };

  if (loadingSalaries) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (cashiers.length === 0) return <div className="text-muted-foreground py-10 text-center text-sm">No cashiers yet.</div>;

  return (
  <>
    <div className="space-y-3 mt-4">
      {cashiers.map((c) => {
        const salary   = getSalary(c.id);
        const isOpen   = openId === c.id;
        const isPaying = paying === c.id;
        const wasPaid  = paid === c.id;

        return (
          <div key={c.id} className="rounded-2xl border border-border overflow-hidden" style={{ background: "var(--gradient-card)" }}>
            {/* ── Card header row ── */}
            <div className="flex items-center gap-3 px-4 pt-3 pb-2">
              {/* Avatar */}
              <div className="h-9 w-9 rounded-full flex items-center justify-center shrink-0" style={{ background: "var(--gradient-hero)" }}>
                <User className="h-4 w-4 text-primary-foreground" />
              </div>
              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="font-black text-sm">{c.username}</p>
                {salary ? (
                  <>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-black" style={{ color: "#86efac" }}>${Number(salary.amount).toFixed(2)}</span>
                      {salary.frequency && <> · {FREQ_LABELS[salary.frequency]}</>}
                      {!salary.frequency && <span className="text-muted-foreground"> · Pay Now only</span>}
                    </p>
                    {nextPayLabel(salary) && (
                      <p className="text-[10px] text-primary font-semibold">Next: {nextPayLabel(salary)}</p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">No salary set</p>
                )}
              </div>
              {/* History button */}
              <button
                type="button"
                onClick={() => setHistoryCashier(c)}
                className="h-9 px-3 rounded-xl text-xs font-black border border-border hover:bg-muted/30 transition shrink-0"
                style={{ color: "var(--muted-foreground)" }}
              >
                History
              </button>
            </div>

            {/* ── Chevron — bottom center, opens accordion ── */}
            <button
              type="button"
              className="w-full flex items-center justify-center py-1.5 hover:bg-muted/20 transition"
              onClick={() => openAccordion(c.id)}
            >
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
            </button>

            {/* ── Accordion body ── */}
            {isOpen && (
              <div className="border-t border-border px-4 pb-4 pt-3 space-y-4">
                {/* Amount */}
                <div>
                  <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block mb-1">Salary Amount ($)</label>
                  <Input type="number" min="0.01" step="0.01" placeholder="e.g. 500.00"
                    value={formAmount} onChange={(e) => setFormAmount(e.target.value)}
                    className="h-11 font-bold text-base" />
                </div>

                {/* Pay Now vs Schedule */}
                <div>
                  <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block mb-2">Payment Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(["now","schedule"] as const).map((m) => (
                      <button key={m} type="button" onClick={() => setFormMode(m)}
                        className="h-11 rounded-xl font-black text-sm transition active:scale-95 flex items-center justify-center gap-2"
                        style={formMode === m
                          ? { background: "var(--gradient-hero)", color: "var(--primary-foreground)" }
                          : { background: "rgba(255,255,255,0.05)", border: "1px solid var(--border)", color: "var(--muted-foreground)" }}>
                        {m === "now" ? <><DollarSign className="h-4 w-4" /> Pay Now</> : <><CheckCircle2 className="h-4 w-4" /> Schedule</>}
                      </button>
                    ))}
                  </div>
                  {formMode === "now" && (
                    <p className="text-xs text-muted-foreground mt-2 text-center">Enter amount and tap Pay Now to record instantly.</p>
                  )}
                </div>

                {/* Schedule sub-form */}
                {formMode === "schedule" && (
                  <>
                    <div>
                      <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block mb-2">Frequency</label>
                      <div className="grid grid-cols-2 gap-2">
                        {(["daily","weekly","biweekly","monthly"] as const).map((f) => (
                          <button key={f} type="button"
                            onClick={() => { setFormFreq(f); setFormPayDay(1); }}
                            className="h-11 rounded-xl font-black text-sm transition active:scale-95"
                            style={formFreq === f
                              ? { background: "var(--gradient-hero)", color: "var(--primary-foreground)" }
                              : { background: "rgba(255,255,255,0.05)", border: "1px solid var(--border)", color: "var(--muted-foreground)" }}>
                            {FREQ_LABELS[f]}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Day picker — shown for ALL frequencies except monthly */}
                    {formFreq !== "monthly" && (
                      <div>
                        <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block mb-2">
                          {formFreq === "daily" ? "Starting Day" : "Day of Week"}
                        </label>
                        <div className="grid grid-cols-7 gap-1">
                          {DAYS_OF_WEEK.map((day, i) => (
                            <button key={i} type="button" onClick={() => setFormPayDay(i)}
                              className="h-9 rounded-lg font-bold text-[10px] transition active:scale-95"
                              style={formPayDay === i
                                ? { background: "var(--gradient-hero)", color: "var(--primary-foreground)" }
                                : { background: "rgba(255,255,255,0.05)", border: "1px solid var(--border)", color: "var(--muted-foreground)" }}>
                              {day}
                            </button>
                          ))}
                        </div>
                        {/* Include this week checkbox */}
                        <button type="button" onClick={() => setFormIncludeThisWeek(v => !v)}
                          className="mt-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition">
                          <div className="h-4 w-4 rounded border border-border flex items-center justify-center shrink-0"
                            style={formIncludeThisWeek
                              ? { background: "var(--gradient-hero)", borderColor: "var(--primary)" }
                              : { background: "white" }}>
                            {formIncludeThisWeek && (
                              <svg className="h-3 w-3 text-black" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            )}
                          </div>
                          Include this week
                        </button>
                      </div>
                    )}

                    {/* Day of Month — monthly only */}
                    {formFreq === "monthly" && (
                      <div>
                        <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block mb-2">Day of Month (1–28)</label>
                        <div className="grid grid-cols-7 gap-1">
                          {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                            <button key={d} type="button" onClick={() => setFormPayDay(d)}
                              className="h-9 rounded-lg font-bold text-xs transition active:scale-95"
                              style={formPayDay === d
                                ? { background: "var(--gradient-hero)", color: "var(--primary-foreground)" }
                                : { background: "rgba(255,255,255,0.05)", border: "1px solid var(--border)", color: "var(--muted-foreground)" }}>
                              {d}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Time — all except monthly */}
                    {formFreq !== "monthly" && (
                      <div>
                        <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block mb-1">Pay Time</label>
                        <input type="time" value={formTime} onChange={(e) => setFormTime(e.target.value)}
                          className="w-full h-11 rounded-xl border border-border bg-background px-3 text-sm font-bold outline-none focus:ring-1 focus:ring-primary" />
                        {/* 12h display hint */}
                        {formTime && (
                          <p className="text-xs font-black mt-1" style={{ color: "var(--primary)" }}>
                            {new Date(`2000-01-01T${formTime}`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
                          </p>
                        )}
                      </div>
                    )}
                  </>
                )}

                {/* ── Action buttons ── */}
                {formMode === "now" ? (
                  /* Pay Now mode: single Pay Now button + optional Remove */
                  <div className="flex gap-2 pt-1">
                    {salary && (
                      <button type="button" onClick={() => removeSalary(c.id)}
                        className="h-12 px-4 rounded-xl font-black text-sm border border-red-500/40 text-red-400 hover:bg-red-500/10 transition">
                        Remove
                      </button>
                    )}
                    <button type="button"
                      disabled={saving || !formAmount || parseFloat(formAmount) <= 0}
                      onClick={() => setConfirmPayCashier(c)}
                      className="flex-1 h-12 rounded-xl font-black text-sm transition active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 border-2"
                      style={{ background: "rgba(134,239,172,0.08)", borderColor: "#86efac", color: "#86efac" }}>
                      <DollarSign className="h-4 w-4" />
                      Pay ${parseFloat(formAmount) > 0 ? parseFloat(formAmount).toFixed(2) : "0.00"} Now
                    </button>
                  </div>
                ) : (
                  /* Schedule mode: Save Schedule + optional Remove */
                  <div className="flex gap-2 pt-1">
                    {salary && (
                      <button type="button" onClick={() => removeSalary(c.id)}
                        className="h-12 px-4 rounded-xl font-black text-sm border border-red-500/40 text-red-400 hover:bg-red-500/10 transition">
                        Remove
                      </button>
                    )}
                    <button type="button"
                      disabled={saving || !formAmount || parseFloat(formAmount) <= 0}
                      onClick={() => setConfirmScheduleCashier(c.id)}
                      className="flex-1 h-12 rounded-xl font-black text-sm text-primary-foreground transition active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
                      style={{ background: "var(--gradient-hero)" }}>
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="h-4 w-4" /> Save Schedule</>}
                    </button>
                  </div>
                )}

                {/* ── Confirm Pay Now modal ── */}
                {confirmPayCashier?.id === c.id && (
                  <div className="fixed inset-0 z-[80] flex items-center justify-center p-6 bg-black/70 backdrop-blur-sm" onClick={() => setConfirmPayCashier(null)}>
                    <div className="w-full max-w-xs rounded-3xl border border-border shadow-2xl overflow-hidden" style={{ background: "var(--gradient-card)" }} onClick={(e) => e.stopPropagation()}>
                      <div className="px-6 pt-6 pb-2 text-center">
                        <div className="h-12 w-12 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: "rgba(134,239,172,0.12)", border: "1px solid rgba(134,239,172,0.3)" }}>
                          <DollarSign className="h-6 w-6" style={{ color: "#86efac" }} />
                        </div>
                        <h3 className="font-black text-base">Confirm Payment</h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          Pay <span className="font-black text-foreground">${parseFloat(formAmount).toFixed(2)}</span> to <span className="font-black text-foreground">{c.username}</span>?
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">This will be recorded as an expense immediately.</p>
                      </div>
                      <div className="px-6 pb-6 pt-4 flex gap-3">
                        <button type="button" onClick={() => setConfirmPayCashier(null)}
                          className="flex-1 h-11 rounded-xl font-black text-sm border border-border hover:bg-muted/30 transition">
                          Cancel
                        </button>
                        <button type="button" disabled={saving}
                          onClick={() => { setConfirmPayCashier(null); saveAndPayNow(c); }}
                          className="flex-1 h-11 rounded-xl font-black text-sm transition active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-1.5"
                          style={{ background: "rgba(134,239,172,0.15)", border: "1.5px solid #86efac", color: "#86efac" }}>
                          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm Pay"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Confirm Schedule modal ── */}
                {confirmScheduleCashier === c.id && (
                  <div className="fixed inset-0 z-[80] flex items-center justify-center p-6 bg-black/70 backdrop-blur-sm" onClick={() => setConfirmScheduleCashier(null)}>
                    <div className="w-full max-w-xs rounded-3xl border border-border shadow-2xl overflow-hidden" style={{ background: "var(--gradient-card)" }} onClick={(e) => e.stopPropagation()}>
                      <div className="px-6 pt-6 pb-2 text-center">
                        <div className="h-12 w-12 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: "rgba(251,146,60,0.12)", border: "1px solid rgba(251,146,60,0.3)" }}>
                          <CheckCircle2 className="h-6 w-6" style={{ color: "var(--primary)" }} />
                        </div>
                        <h3 className="font-black text-base">Confirm Schedule</h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          Schedule <span className="font-black text-foreground">${parseFloat(formAmount).toFixed(2)}</span> for <span className="font-black text-foreground">{c.username}</span>?
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {FREQ_LABELS[formFreq]}
                          {formFreq !== "monthly" && ` · ${DAYS_OF_WEEK[formPayDay]}`}
                          {formFreq === "monthly" && ` · ${formPayDay}${ordSuffix(formPayDay)} of month`}
                          {formFreq !== "monthly" && ` at ${new Date(`2000-01-01T${formTime}`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}`}
                          {formIncludeThisWeek && formFreq !== "monthly" && " (this week)"}
                        </p>
                      </div>
                      <div className="px-6 pb-6 pt-4 flex gap-3">
                        <button type="button" onClick={() => setConfirmScheduleCashier(null)}
                          className="flex-1 h-11 rounded-xl font-black text-sm border border-border hover:bg-muted/30 transition">
                          Cancel
                        </button>
                        <button type="button" disabled={saving}
                          onClick={() => { setConfirmScheduleCashier(null); saveSalary(c.id); }}
                          className="flex-1 h-11 rounded-xl font-black text-sm text-primary-foreground transition active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-1.5"
                          style={{ background: "var(--gradient-hero)" }}>
                          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>

    {/* ── Salary History popup ── */}
    {historyCashier && (
      <SalaryHistory
        cashier={historyCashier}
        ownerId={ownerId}
        onClose={() => setHistoryCashier(null)}
      />
    )}
  </>
  );
}

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

// ─── Cashier Statement Modal ──────────────────────────────────────────────────
type CashierFlatRecord =
  | { kind: "order"; data: Order; ts: number }
  | { kind: "tx"; data: WalletTx; ts: number };

function CashierStatement({ cashier, ownerName, onClose }: { cashier: Cashier; ownerName: string; onClose: () => void }) {
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
      supabase
        .from("orders")
        .select("*")
        .eq("cashier_id", cashier.id)
        .order("created_at", { ascending: false })
        .then(({ data }) => setOrders((data ?? []) as unknown as Order[])),
      supabase
        .from("wallet_transactions")
        .select("*")
        .eq("profile_id", cashier.id)
        .in("type", ["sale", "transfer_out", "credit_charge", "credit_payment"])
        .order("created_at", { ascending: false })
        .then(({ data }) => setTxs((data ?? []) as WalletTx[])),
    ]).finally(() => setLoading(false));
  }, [cashier.id]);

  // Build flat merged list newest-first
  const allRecords: CashierFlatRecord[] = [
    ...orders.map((o): CashierFlatRecord => ({ kind: "order", data: o, ts: new Date(o.created_at).getTime() })),
    ...txs.map((tx): CashierFlatRecord => ({ kind: "tx", data: tx, ts: new Date(tx.created_at).getTime() })),
  ].sort((a, b) => b.ts - a.ts);

  // Derive unique months for the dropdown rows
  const months = Array.from(
    new Set(
      allRecords.map((r) =>
        new Date(r.data.created_at).toLocaleDateString("en-GB", { year: "numeric", month: "long" })
      )
    )
  );

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

      const generated = new Date().toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true, day: "2-digit", month: "2-digit", year: "numeric" });
      let y = await drawHeader(doc, ownerName, "Cashier Statement", month, generated);

      // ── Calculate summary figures ──────────────────────────────────────────
      const orders = monthRecords.filter((r) => r.kind === "order");
      const txs    = monthRecords.filter((r) => r.kind === "tx");
      const totalSales   = orders.reduce((s, r) => s + Number((r.data as Order).total), 0);
      const totalCleared = txs
        .filter((r) => (r.data as WalletTx).type === "transfer_out")
        .reduce((s, r) => s + Math.abs(Number((r.data as WalletTx).amount)), 0);
      const totalCreditPayments = txs
        .filter((r) => (r.data as WalletTx).type === "credit_payment" && Number((r.data as WalletTx).amount) > 0)
        .reduce((s, r) => s + Number((r.data as WalletTx).amount), 0);
      const orderCount   = orders.length;

      // ── Cashier sub-line ──────────────────────────────────────────────────
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      doc.text("Statement for cashier: " + cashier.username, LM, y);
      y += 7;
      doc.setTextColor(0, 0, 0);

      // ── Summary box ───────────────────────────────────────────────────────
      const boxW = RM - LM;
      const boxH = 24;
      doc.setFillColor(245, 240, 230);
      doc.roundedRect(LM, y, boxW, boxH, 2, 2, "F");
      doc.setDrawColor(232, 146, 42);
      doc.setLineWidth(0.4);
      doc.roundedRect(LM, y, boxW, boxH, 2, 2, "S");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(100, 70, 10);
      doc.text("PERIOD SUMMARY", LM + 3, y + 5);

      const cols = [
        { label: "Total Orders",    value: String(orderCount) },
        { label: "Total Sales",     value: "$" + totalSales.toFixed(2) },
        { label: "Credit Collected", value: "$" + totalCreditPayments.toFixed(2) },
        { label: "Net Outstanding", value: "$" + (totalSales + totalCreditPayments - totalCleared).toFixed(2) },
      ];
      const colW = boxW / cols.length;
      cols.forEach((col, i) => {
        const cx = LM + i * colW + colW / 2;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.5);
        doc.setTextColor(100, 100, 100);
        doc.text(col.label, cx, y + 12, { align: "center" });
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        const net = totalSales - totalCleared;
        if (col.label === "Net Outstanding") {
          doc.setTextColor(net <= 0 ? 40 : 180, net <= 0 ? 140 : 60, 40);
        } else {
          doc.setTextColor(30, 30, 30);
        }
        doc.text(col.value, cx, y + 20, { align: "center" });
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
          doc.text(new Date(o.created_at).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true, day: "2-digit", month: "2-digit", year: "numeric" }), LM, y);
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
          doc.setFont("helvetica", "bold");
          doc.setTextColor(40, 140, 80);
          doc.text(new Date(tx.created_at).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true, day: "2-digit", month: "2-digit", year: "numeric" }), LM, y);
          doc.text(tx.note ?? "Cleared to owner", LM + 55, y);
          doc.text("-$" + Math.abs(Number(tx.amount)).toFixed(2), RM, y, { align: "right" });
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

      const filename = "cashier-statement-" + cashier.username + "-" + month.replace(/\s/g, "-") + ".pdf";
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
      <div
        className="relative w-full max-w-lg rounded-3xl border border-border shadow-2xl mt-4 mb-8"
        style={{ background: "var(--gradient-card)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border">
          <div>
            <h2 className="text-xl font-black">{t("statement", "Statement")}</h2>
            <p className="text-sm text-muted-foreground">{cashier.username}</p>
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
            <div className="text-muted-foreground text-sm py-8 text-center">No orders yet.</div>
          ) : (
            <div className="space-y-4">
              {months.map((month) => {
                const monthRecords = getRecordsForMonth(month);
                const monthTotal = monthRecords
                  .filter((r) => r.kind === "order")
                  .reduce((s, r) => s + Number((r.data as Order).total), 0)
                  + monthRecords
                  .filter((r) => r.kind === "tx" && (r.data as WalletTx).type === "credit_payment" && Number((r.data as WalletTx).amount) > 0)
                  .reduce((s, r) => s + Number((r.data as WalletTx).amount), 0);
                const hasCleared = monthRecords.some((r) => r.kind === "tx");
                const isOpen = selectedMonth === month;

                return (
                  <div key={month} className="rounded-2xl border border-border overflow-hidden">
                    {/* Row header — month info top row, arrow + PDF bottom row */}
                    <button
                      className="w-full flex flex-col px-4 py-3 hover:bg-muted/30 transition"
                      onClick={() => setSelectedMonth(isOpen ? null : month)}
                    >
                      {/* Top row: month name + Sales badge + total */}
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-3">
                          <span className="font-black text-sm">{month}</span>
                          {hasCleared && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 border border-green-500/30 font-semibold">
                              Sales
                            </span>
                          )}
                        </div>
                        <span className="font-black text-primary">${monthTotal.toFixed(2)}</span>
                      </div>
                      {/* Bottom row: arrow centered + PDF at end */}
                      <div className="flex items-center justify-between w-full mt-2">
                        <div className="flex-1" />
                        <ChevronDown
                          className={`h-5 w-5 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
                        />
                        <div className="flex-1 flex justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-10 px-4 text-sm font-bold gap-1.5"
                            type="button"
                            disabled={downloadingMonth === month}
                            onClick={(e) => { e.stopPropagation(); handleDownload(month); }}
                            style={downloadedMonth === month ? { background: "#16a34a", color: "#fff", borderColor: "#16a34a" } : {}}
                          >
                            {downloadingMonth === month
                              ? <Loader2 className="h-4 w-4 animate-spin" />
                              : downloadedMonth === month
                              ? <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                              : <Download className="h-4 w-4" />}
                            {downloadingMonth === month ? "…" : downloadedMonth === month ? "Done" : "PDF"}
                          </Button>
                        </div>
                      </div>
                    </button>

                    {isOpen && (
                      <div className="border-t border-border divide-y divide-border/50">
                        {monthRecords.map((rec) => {
                          if (rec.kind === "tx") {
                            const tx = rec.data;
                            const isTransferOut = tx.type === "transfer_out";
                            const isCreditPayment = tx.type === "credit_payment";
                            const isCreditCharge = tx.type === "credit_charge";
                            if (isTransferOut) {
                              return (
                                <div key={tx.id} className="px-4 py-3 flex items-center gap-3 bg-green-500/5">
                                  <ArrowDownLeft className="h-3.5 w-3.5 text-green-400 shrink-0" />
                                  <div className="flex-1 text-xs text-green-400">
                                    {tx.note ?? "Cleared to owner"} · {new Date(tx.created_at).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true, day: "2-digit", month: "2-digit", year: "numeric" })}
                                  </div>
                                  <span className="font-black text-green-400 text-sm">
                                    -${Math.abs(Number(tx.amount)).toFixed(2)}
                                  </span>
                                </div>
                              );
                            }
                            if (isCreditPayment) {
                              return (
                                <div key={tx.id} className="px-4 py-3 flex items-center gap-3 bg-blue-500/5">
                                  <div className="h-3.5 w-3.5 shrink-0 text-blue-400 font-black text-xs flex items-center justify-center">💳</div>
                                  <div className="flex-1 text-xs text-blue-300">
                                    {tx.note ?? "Credit payment"} · {new Date(tx.created_at).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true, day: "2-digit", month: "2-digit", year: "numeric" })}
                                  </div>
                                  <span className="font-black text-blue-300 text-sm">
                                    +${Number(tx.amount).toFixed(2)}
                                  </span>
                                </div>
                              );
                            }
                            if (isCreditCharge) {
                              return (
                                <div key={tx.id} className="px-4 py-3 flex items-center gap-3 bg-amber-500/5">
                                  <div className="h-3.5 w-3.5 shrink-0 text-amber-400 font-black text-xs flex items-center justify-center">🪙</div>
                                  <div className="flex-1 text-xs text-amber-300">
                                    {tx.note ?? "Credit charge"} · {new Date(tx.created_at).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true, day: "2-digit", month: "2-digit", year: "numeric" })}
                                  </div>
                                  <span className="font-black text-amber-300 text-sm">Credit</span>
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
                                  <span className="text-xs text-muted-foreground">
                                    {new Date(o.created_at).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true, day: "2-digit", month: "2-digit", year: "numeric" })}
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

// ─── Main Cashiers Page ───────────────────────────────────────────────────────
export default function CashiersPage() {
  const { profile, session, refreshProfile } = useAuth();
  const { effectiveOwnerId, activeBarId, isChainOwner } = useChain();
  const { t } = useTranslation();
  const [list, setList] = useState<Cashier[]>([]);
  const [tab, setTab] = useState("add");
  // ── Role picker state ──────────────────────────────────────────────────────
  const [rolePickerOpen, setRolePickerOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<"cashier" | "manager" | "custom" | null>(null);
  // cashier / manager fields
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  // custom worker fields
  const [customName, setCustomName]   = useState("");
  const [customTitle, setCustomTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [statementCashier, setStatementCashier] = useState<Cashier | null>(null);
  const [resetPwCashier, setResetPwCashier] = useState<Cashier | null>(null);
  const [newPw, setNewPw] = useState("");
  const [clearModalCashier, setClearModalCashier] = useState<Cashier | null>(null);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showCreatePw, setShowCreatePw] = useState(false);
  const [resettingPw, setResettingPw] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const create = createCashier;
  const del = deleteCashier;

  const load = async () => {
    if (!profile) return;
    const ownerIdForQuery = effectiveOwnerId(profile.id);
    const { data } = await supabase
      .from("profiles")
      .select("id,username,wallet_balance,role,job_title")
      .eq("parent_id", ownerIdForQuery)
      .in("role", ["cashier", "manager", "custom"])
      .order("created_at", { ascending: false });
    setList(((data ?? []) as Cashier[]).sort((a, b) => a.username.localeCompare(b.username)));
  };

  useEffect(() => { load(); }, [profile?.id]);

  useEffect(() => {
    if (!profile?.id) return;
    if (channelRef.current) supabase.removeChannel(channelRef.current);
    const ownerIdForQuery = effectiveOwnerId(profile.id);
    const ch = supabase
      .channel(`cashiers-${ownerIdForQuery}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles", filter: `parent_id=eq.${ownerIdForQuery}` }, () => load())
      .subscribe();
    channelRef.current = ch;
    return () => { supabase.removeChannel(ch); channelRef.current = null; };
  }, [profile?.id]);

  if (profile?.role !== "owner") {
    return <div className="text-center text-muted-foreground py-20">Only owners can manage cashiers.</div>;
  }

  const authHeaders: HeadersInit | undefined = session?.access_token
    ? { authorization: `Bearer ${session.access_token}` }
    : undefined;
  void authHeaders; // unused now but kept for reference

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.access_token) { toast.error("Not authenticated"); return; }
    if (/\s/.test(u)) { const m = "Username cannot contain spaces"; setUsernameError(m); toast.error(m); return; }
    if (!/^[a-z0-9_]+$/.test(u)) { const m = "Lowercase letters, numbers and underscores only"; setUsernameError(m); toast.error(m); return; }
    setUsernameError(null);
    setBusy(true);
    try {
      await create({
        username: u,
        password: p,
        role: selectedRole === "manager" ? "manager" : "cashier",
        ...(activeBarId ? { barOwnerId: activeBarId } : {}),
      });
      setU(""); setP(""); setSelectedRole(null);
      setTab("manage");
      load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create account");
    } finally {
      setBusy(false);
    }
  };

  const onCreateCustom = async () => {
    if (!customName.trim()) { toast.error("Enter a name for this worker"); return; }
    if (!customTitle.trim()) { toast.error("Enter a job title"); return; }
    setBusy(true);
    try {
      const ownerIdForQuery = effectiveOwnerId(profile!.id);
      // Custom workers have no auth user — insert directly into profiles
      const { error } = await (supabase as any).from("profiles").insert({
        username: customName.trim().toLowerCase().replace(/\s+/g, "_"),
        full_name: customName.trim(),
        job_title: customTitle.trim(),
        role: "custom",
        parent_id: ownerIdForQuery,
        has_login: false,
        wallet_balance: 0,
        status: "approved",
      });
      if (error) { toast.error(error.message); return; }
      toast.success(`${customName.trim()} added as ${customTitle.trim()}`);
      setCustomName(""); setCustomTitle(""); setSelectedRole(null);
      setTab("manage");
      load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create worker");
    } finally {
      setBusy(false);
    }
  };

  const onClear = async (c: Cashier) => {
    const { error } = await supabase.rpc("transfer_cashier_to_owner", { _cashier_id: c.id });
    if (error) {
      toast.error(error.message);
    } else {
      load();
      refreshProfile();
      // Ask owner whether to keep bar open or close it for the night
      setClearModalCashier(c);
    }
  };

  const onResetPassword = async () => {
    if (!resetPwCashier || newPw.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    setResettingPw(true);
    try {
      await resetCashierPassword({ cashier_id: resetPwCashier.id, new_password: newPw });
      toast.success(`Password updated for ${resetPwCashier.username}`);
      setResetPwCashier(null);
      setNewPw("");
      setShowNewPw(false);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to reset password");
    } finally {
      setResettingPw(false);
    }
  };

  const onDelete = async (c: Cashier) => {
    if (!session?.access_token) { toast.error("Not authenticated"); return; }
    try {
      await del({ cashier_id: c.id });
      toast.success(`Removed ${c.username}`);
      load();
      refreshProfile();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete cashier");
    }
  };

  const handleKeepBarOpen = () => {
    toast.success("Bar stays open — session continues");
    setClearModalCashier(null);
  };

  const handleCloseBar = async () => {
    // Write bar_closed_at timestamp to owner profile
    const now = new Date().toISOString();
    const ownerId = effectiveOwnerId(profile.id);

    // First read the current session start so we can record the full period
    const { data: ownerRow } = await supabase.from("profiles")
      .select("bar_session_start")
      .eq("id", ownerId)
      .single();

    const sessionStart: string | null = ownerRow?.bar_session_start ?? null;

    // Record this session in bar_sessions history table
    if (sessionStart) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("bar_sessions").insert({
        owner_id: ownerId,
        session_start: sessionStart,
        session_end: now,
      });
    }

    // Mark the profile as closed (cast to any — new column not in generated types)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("profiles")
      .update({ bar_closed_at: now })
      .eq("id", ownerId);

    if (error) {
      toast.error("Failed to close bar: " + error.message);
    } else {
      toast.success("Bar closed — session ended at " + new Date(now).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
    }
    setClearModalCashier(null);
  };

  return (
    <div>
      {/* Sticky page title */}
      <div className="sticky top-0 z-20 -mx-3 px-3 pt-2 pb-2 bg-background/95 backdrop-blur border-b border-border">
        <h1 className="text-xl font-black leading-tight">{t("cashiers_title", "Cashiers")}</h1>
      </div>
      <div className="pt-3">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-3 w-full">
          <TabsTrigger value="add">Create</TabsTrigger>
          <TabsTrigger value="manage">{t("cashier_name", "Manage")} ({list.length})</TabsTrigger>
          <TabsTrigger value="salary">Salary</TabsTrigger>
        </TabsList>

        <TabsContent value="add">
          {/* ── Step 1: Role picker ── */}
          {!selectedRole && (
            <div className="mt-6 space-y-3">
              <p className="text-sm text-muted-foreground text-center">Select the type of staff member to create</p>
              <div className="grid grid-cols-3 gap-3">
                {/* Cashier */}
                <button type="button" onClick={() => setSelectedRole("cashier")}
                  className="rounded-2xl border-2 p-4 flex flex-col items-center gap-2 transition active:scale-95"
                  style={{ background: "var(--gradient-card)", borderColor: "var(--border)" }}>
                  <div className="h-12 w-12 rounded-xl flex items-center justify-center text-2xl"
                    style={{ background: "rgba(var(--primary-rgb,251 146 60)/0.15)" }}>💰</div>
                  <span className="font-black text-sm">Cashier</span>
                  <span className="text-[10px] text-muted-foreground text-center leading-tight">Full bar access, login required</span>
                </button>
                {/* Manager */}
                <button type="button" onClick={() => setSelectedRole("manager")}
                  className="rounded-2xl border-2 p-4 flex flex-col items-center gap-2 transition active:scale-95"
                  style={{ background: "var(--gradient-card)", borderColor: "var(--border)" }}>
                  <div className="h-12 w-12 rounded-xl flex items-center justify-center text-2xl"
                    style={{ background: "rgba(134,239,172,0.15)" }}>👔</div>
                  <span className="font-black text-sm">Manager</span>
                  <span className="text-[10px] text-muted-foreground text-center leading-tight">Items, Wallet & Machines only</span>
                </button>
                {/* Custom */}
                <button type="button" onClick={() => setSelectedRole("custom")}
                  className="rounded-2xl border-2 p-4 flex flex-col items-center gap-2 transition active:scale-95"
                  style={{ background: "var(--gradient-card)", borderColor: "var(--border)" }}>
                  <div className="h-12 w-12 rounded-xl flex items-center justify-center text-2xl"
                    style={{ background: "rgba(167,139,250,0.15)" }}>🏷️</div>
                  <span className="font-black text-sm">Custom</span>
                  <span className="text-[10px] text-muted-foreground text-center leading-tight">No login, salary tracking only</span>
                </button>
              </div>
            </div>
          )}

          {/* ── Step 2a: Cashier / Manager form ── */}
          {(selectedRole === "cashier" || selectedRole === "manager") && (
            <form onSubmit={onCreate}
              className="mt-6 rounded-2xl p-4 space-y-4 border border-border"
              style={{ background: "var(--gradient-card)", boxShadow: "var(--shadow-elegant)" }}>
              <div className="flex items-center justify-between">
                <span className="font-black text-sm">
                  {selectedRole === "manager" ? "👔 New Manager" : "💰 New Cashier"}
                </span>
                <button type="button" onClick={() => { setSelectedRole(null); setU(""); setP(""); setUsernameError(null); }}
                  className="text-xs font-bold text-muted-foreground hover:text-foreground transition">← Back</button>
              </div>
              <div>
                <Label>{t("username", "Username")}</Label>
                <Input value={u}
                  onChange={(e) => {
                    const val = e.target.value;
                    setU(val);
                    if (val.length > 0) {
                      if (/\s/.test(val)) setUsernameError("No spaces allowed");
                      else if (!/^[a-z0-9_]+$/.test(val)) setUsernameError("Only lowercase letters, numbers, and underscores");
                      else setUsernameError(null);
                    } else setUsernameError(null);
                  }}
                  placeholder={selectedRole === "manager" ? "manager1" : "cashier1"}
                  required minLength={3} autoComplete="off"
                  className={usernameError ? "border-red-500 focus-visible:ring-red-500" : ""}
                />
                {usernameError
                  ? <p className="text-xs text-red-500 mt-1 font-medium">{usernameError}</p>
                  : <p className="text-xs text-muted-foreground mt-1">Single word only. Lowercase letters, numbers or underscores.</p>}
              </div>
              <div>
                <Label>{t("cashier_password", "Password")}</Label>
                <div className="relative mt-1">
                  <Input type={showCreatePw ? "text" : "password"} value={p}
                    onChange={(e) => setP(e.target.value)} required minLength={6} autoComplete="new-password" className="pr-10" />
                  <button type="button" onClick={() => setShowCreatePw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition">
                    {showCreatePw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" disabled={busy || !!usernameError} className="w-full h-12 font-black"
                style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}>
                {busy ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating...</> : <><UserPlus className="h-4 w-4 mr-2" /> Create {selectedRole === "manager" ? "Manager" : "Cashier"}</>}
              </Button>
            </form>
          )}

          {/* ── Step 2b: Custom worker form (no login) ── */}
          {selectedRole === "custom" && (
            <div className="mt-6 rounded-2xl p-4 space-y-4 border border-border"
              style={{ background: "var(--gradient-card)", boxShadow: "var(--shadow-elegant)" }}>
              <div className="flex items-center justify-between">
                <span className="font-black text-sm">🏷️ New Custom Worker</span>
                <button type="button" onClick={() => { setSelectedRole(null); setCustomName(""); setCustomTitle(""); }}
                  className="text-xs font-bold text-muted-foreground hover:text-foreground transition">← Back</button>
              </div>
              <div className="rounded-xl px-3 py-2 text-xs text-muted-foreground"
                style={{ background: "rgba(167,139,250,0.08)", border: "1px solid rgba(167,139,250,0.2)" }}>
                Custom workers have no login access. They're used for salary tracking only.
              </div>
              <div>
                <Label>Full Name</Label>
                <Input value={customName} onChange={(e) => setCustomName(e.target.value)}
                  placeholder="e.g. John Smith" autoComplete="off" />
              </div>
              <div>
                <Label>Job Title</Label>
                <Input value={customTitle} onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder="e.g. Bouncer, DJ, Waitress" autoComplete="off" />
              </div>
              <Button onClick={onCreateCustom} disabled={busy || !customName.trim() || !customTitle.trim()}
                className="w-full h-12 font-black"
                style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}>
                {busy ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating...</> : <><UserPlus className="h-4 w-4 mr-2" /> Add Worker</>}
              </Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="manage">
          <div className="mt-6 space-y-2">
            {list.length === 0 && <div className="text-muted-foreground py-8 text-center">No staff yet.</div>}
            {list.map((c) => {
              const isCustom = (c as any).role === "custom";
              const isManager = (c as any).role === "manager";
              const roleBadge = isCustom
                ? { label: (c as any).job_title ?? "Custom", color: "rgba(167,139,250,0.2)", border: "rgba(167,139,250,0.4)", text: "#c4b5fd" }
                : isManager
                ? { label: "Manager", color: "rgba(134,239,172,0.15)", border: "rgba(134,239,172,0.4)", text: "#86efac" }
                : { label: "Cashier", color: "rgba(var(--primary-rgb,251 146 60)/0.15)", border: "rgba(var(--primary-rgb,251 146 60)/0.4)", text: "var(--primary)" };
              return (
              <div key={c.id} className="rounded-2xl p-3 border border-border" style={{ background: "var(--gradient-card)" }}>
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 rounded-full flex items-center justify-center shrink-0" style={{ background: "var(--gradient-hero)" }}>
                    <User className="h-5 w-5 text-primary-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold truncate">{c.username}</span>
                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full shrink-0"
                        style={{ background: roleBadge.color, border: `1px solid ${roleBadge.border}`, color: roleBadge.text }}>
                        {roleBadge.label}
                      </span>
                    </div>
                    {!isCustom && (
                      <div className="text-sm text-muted-foreground">
                        Balance: <span className="text-primary font-black">${Number(c.wallet_balance).toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                  {/* Delete button */}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="destructive" className="h-9 w-9 p-0 shrink-0"><Trash2 className="h-4 w-4" /></Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete {c.username}?</AlertDialogTitle>
                        <AlertDialogDescription>
                          {isCustom
                            ? "This custom worker record will be permanently removed."
                            : "Any wallet balance will be transferred to your account first, then the account is removed permanently."}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter className="flex-row gap-3 mt-2">
                        <AlertDialogCancel className="flex-1 h-14 text-base font-black m-0">Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => onDelete(c)} className="flex-1 h-14 text-base font-black bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
                {/* Action buttons — custom workers only get Delete (no clear/password) */}
                {!isCustom && (
                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    <Button size="sm" variant="outline" className="flex-1 min-w-[90px] h-12 text-sm font-black" onClick={() => setStatementCashier(c)}>
                      <FileText className="h-5 w-5 mr-1.5" /> Statement
                    </Button>
                    <Button size="sm" variant="secondary" className="flex-1 min-w-[90px] h-12 text-sm font-black" onClick={() => onClear(c)} disabled={Number(c.wallet_balance) === 0}>
                      <Eraser className="h-5 w-5 mr-1.5" /> Clear
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1 min-w-[90px] h-12 text-sm font-black" onClick={() => { setResetPwCashier(c); setNewPw(""); setShowNewPw(false); }}>
                      <KeyRound className="h-5 w-5 mr-1.5" /> Password
                    </Button>
                  </div>
                )}
              </div>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="salary">
          <SalaryTab cashiers={list} ownerId={effectiveOwnerId(profile.id)} />
        </TabsContent>
      </Tabs>

      {statementCashier && (
        <CashierStatement
          cashier={statementCashier}
          ownerName={profile.username}
          onClose={() => setStatementCashier(null)}
        />
      )}

      {/* ── Reset Password Modal ── */}
      {resetPwCashier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-xs rounded-3xl border border-border shadow-2xl overflow-hidden" style={{ background: "var(--gradient-card)" }}>
            <div className="px-6 pt-6 pb-2 text-center">
              <div className="h-12 w-12 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: "rgba(251,146,60,0.15)", border: "1px solid rgba(251,146,60,0.3)" }}>
                <KeyRound className="h-6 w-6" style={{ color: "var(--primary)" }} />
              </div>
              <h3 className="font-black text-base">{t("change_password", "Reset Password")}</h3>
              <p className="text-xs text-muted-foreground mt-1">Set a new password for <span className="font-bold text-foreground">{resetPwCashier.username}</span></p>
            </div>
            <div className="px-6 pb-6 pt-4 space-y-4">
              <div className="relative">
                <Input
                  type={showNewPw ? "text" : "password"}
                  placeholder="New password (min 6 chars)"
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  className="pr-10 h-11"
                  minLength={6}
                />
                <button type="button" onClick={() => setShowNewPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition">
                  {showNewPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button variant="outline" className="flex-1 min-w-[100px] h-11" onClick={() => { setResetPwCashier(null); setNewPw(""); }}>
                  {t("cancel", "Cancel")}
                </Button>
                <Button
                  className="flex-1 min-w-[100px] h-11 font-black"
                  disabled={resettingPw || newPw.length < 6}
                  onClick={onResetPassword}
                  style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}
                >
                  {resettingPw ? <Loader2 className="h-4 w-4 animate-spin" /> : t("save", "Save")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Keep Bar Open / Close Bar Modal ── */}
      {clearModalCashier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-border shadow-2xl overflow-hidden" style={{ background: "var(--gradient-card)" }}>
            <div className="px-6 pt-6 pb-2 text-center">
              <div className="h-12 w-12 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: "rgba(251,146,60,0.15)", border: "1px solid rgba(251,146,60,0.3)" }}>
                <CheckCircle2 className="h-6 w-6" style={{ color: "var(--primary)" }} />
              </div>
              <h3 className="font-black text-base">{t("clear_complete", "Balance Cleared")}</h3>
              <p className="text-xs text-muted-foreground mt-1">
                ${Number(clearModalCashier.wallet_balance).toFixed(2)} transferred from {clearModalCashier.username}
              </p>
            </div>
            <div className="px-6 pb-6 pt-4 space-y-3">
              <p className="text-sm text-center" style={{ color: "var(--primary)" }}>Is the bar staying open?</p>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="outline"
                  className="h-14 font-black text-sm"
                  onClick={handleKeepBarOpen}
                >
                  Keep Bar Open
                </Button>
                <Button
                  className="h-14 font-black text-sm"
                  onClick={handleCloseBar}
                  style={{ background: "#dc2626", color: "#fff" }}
                >
                  Close Bar
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground text-center leading-snug">
                <span className="font-bold">Keep Bar Open</span> continues the session. <span className="font-bold">Close Bar</span> marks the end of the day for Summary reports.
              </p>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
