import { useCallback, useEffect, useRef, useState } from "react";
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
  Clock, LogIn, LogOut, CalendarDays, ChevronLeft, ChevronRight,
  FileDown, Users,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { downloadPdf } from "@/lib/download";
import { drawHeader, addFootersToAllPages, LM, RM, CONTENT_BOTTOM } from "@/lib/pdfHelpers";

type Cashier = { id: string; username: string; wallet_balance: number; role?: string; job_title?: string; cashier_access?: string };

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

// ─── Hours Tab helpers ────────────────────────────────────────────────────────
type TimeCardRow = {
  id: string;
  employee_id: string;
  employee_name: string;
  clocked_in_at: string;
  clocked_out_at: string | null;
  work_date: string;
};

function fmtClockTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: "America/Port_of_Spain",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

function fmtWorkDuration(inIso: string, outIso: string | null) {
  const end = outIso ? new Date(outIso) : new Date();
  const totalMins = Math.max(0, Math.round((end.getTime() - new Date(inIso).getTime()) / 60000));
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function totalMinutesForDay(cards: TimeCardRow[]) {
  return cards.reduce((sum, tc) => {
    const out = tc.clocked_out_at ? new Date(tc.clocked_out_at) : new Date();
    return sum + Math.max(0, Math.round((out.getTime() - new Date(tc.clocked_in_at).getTime()) / 60000));
  }, 0);
}

function minutesToHM(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

// Simple inline calendar — shows only worked days as selectable dots
function WorkedCalendar({
  workedDates,
  selectedDate,
  onSelect,
}: {
  workedDates: Set<string>; // YYYY-MM-DD
  selectedDate: string | null;
  onSelect: (d: string | null) => void;
}) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth()); // 0-indexed

  const firstDay = new Date(viewYear, viewMonth, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString("en-US", {
    month: "long", year: "numeric",
  });

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="rounded-2xl border border-border p-3" style={{ background: "var(--gradient-card)" }}>
      {/* Month nav */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={prevMonth}
          className="h-8 w-8 rounded-lg flex items-center justify-center transition active:scale-90 hover:bg-muted/40">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="font-black text-sm">{monthLabel}</span>
        <button onClick={nextMonth}
          className="h-8 w-8 rounded-lg flex items-center justify-center transition active:scale-90 hover:bg-muted/40">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 mb-1">
        {["S","M","T","W","T","F","S"].map((d, i) => (
          <div key={i} className="text-center text-[10px] font-black text-muted-foreground py-1">{d}</div>
        ))}
      </div>
      {/* Date grid */}
      <div className="grid grid-cols-7 gap-y-1">
        {/* Empty leading cells */}
        {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const dateStr = `${viewYear}-${pad(viewMonth + 1)}-${pad(day)}`;
          const isWorked = workedDates.has(dateStr);
          const isSelected = selectedDate === dateStr;
          const isToday = dateStr === today.toLocaleDateString("en-CA", { timeZone: "America/Port_of_Spain" });
          return (
            <button
              key={day}
              disabled={!isWorked}
              onClick={() => onSelect(isSelected ? null : dateStr)}
              className="h-9 w-full rounded-xl flex items-center justify-center text-xs font-black transition active:scale-90 disabled:cursor-default"
              style={
                isSelected
                  ? { background: "var(--gradient-hero)", color: "var(--primary-foreground)" }
                  : isWorked
                  ? { background: "rgba(251,146,60,0.12)", border: "1.5px solid rgba(251,146,60,0.4)", color: "var(--primary)" }
                  : isToday
                  ? { color: "var(--primary)", opacity: 0.5 }
                  : { color: "var(--muted-foreground)", opacity: 0.35 }
              }
            >
              {day}
            </button>
          );
        })}
      </div>
      {selectedDate && (
        <button onClick={() => onSelect(null)}
          className="mt-2 w-full text-[11px] font-black text-muted-foreground hover:text-foreground transition text-center">
          Clear filter ✕
        </button>
      )}
    </div>
  );
}

// ─── Timesheet PDF (owner) ────────────────────────────────────────────────────
async function downloadOwnerTimesheetPdf(
  cards: TimeCardRow[],
  staffName: string | null,
  periodLabel: string,
  ownerLabel: string,
) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const generated = new Date().toLocaleString("en-US", { timeZone: "America/Port_of_Spain", dateStyle: "medium", timeStyle: "short" });
  let y = await drawHeader(doc, ownerLabel, "Timesheet Report", periodLabel, generated);
  const BRAND: [number, number, number] = [232, 146, 42];
  const byEmp: Record<string, { name: string; cards: TimeCardRow[] }> = {};
  cards.forEach(tc => {
    if (!byEmp[tc.employee_id]) byEmp[tc.employee_id] = { name: tc.employee_name, cards: [] };
    byEmp[tc.employee_id].cards.push(tc);
  });
  for (const { name, cards: empCards } of Object.values(byEmp)) {
    if (y + 10 > CONTENT_BOTTOM) { doc.addPage(); y = 20; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...BRAND);
    doc.text(name.toUpperCase(), LM, y + 4);
    y += 8;
    let empTotalMins = 0;
    for (const tc of empCards) {
      const inTime = new Date(tc.clocked_in_at).toLocaleString("en-US", { timeZone: "America/Port_of_Spain", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
      const outTime = tc.clocked_out_at ? new Date(tc.clocked_out_at).toLocaleTimeString("en-US", { timeZone: "America/Port_of_Spain", hour: "numeric", minute: "2-digit", hour12: true }) : "On shift";
      const mins = tc.clocked_out_at ? Math.max(0, Math.round((new Date(tc.clocked_out_at).getTime() - new Date(tc.clocked_in_at).getTime()) / 60000)) : 0;
      empTotalMins += mins;
      const dur = mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
      if (y + 7 > CONTENT_BOTTOM) { doc.addPage(); y = 20; }
      doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(40, 40, 40);
      doc.text(`${inTime}  -  ${outTime}`, LM + 3, y + 3);
      doc.text(dur, RM, y + 3, { align: "right" });
      doc.setDrawColor(220, 220, 220); doc.line(LM, y + 6, RM, y + 6);
      y += 7;
    }
    const totalH = Math.floor(empTotalMins / 60); const totalM = empTotalMins % 60;
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...BRAND);
    doc.text(`Total: ${empTotalMins < 60 ? empTotalMins + "m" : totalH + "h " + totalM + "m"}`, RM, y + 3, { align: "right" });
    y += 9;
  }
  addFootersToAllPages(doc);
  const safeName = (staffName ?? "all-staff").replace(/\s+/g, "-").toLowerCase();
  await downloadPdf(`timesheet-${safeName}-${periodLabel.replace(/\s+/g, "-")}.pdf`, doc.output("datauristring"));
}

// ─── HoursTab ─────────────────────────────────────────────────────────────────
function HoursTab({ ownerId, barIsOpen }: { ownerId: string; barIsOpen: boolean }) {
  const sb = supabase as any;

  // Shared data
  const [timeCards, setTimeCards] = useState<TimeCardRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [employees, setEmployees] = useState<{ id: string; username: string; role: string; job_title?: string }[]>([]);
  const [hoursSubTab, setHoursSubTab] = useState<"clock" | "timesheets">("clock");

  // Clock tab state
  const [selectedEmp, setSelectedEmp] = useState<{ id: string; username: string } | null>(null);
  const [clockBusy, setClockBusy] = useState(false);

  // Timesheets tab state
  const [tsSelectedDate, setTsSelectedDate] = useState<string | null>(null);
  const [tsShowCal, setTsShowCal] = useState(false);
  const [tsPeriod, setTsPeriod] = useState<"day" | "week" | "month" | "year">("day");
  const [tsStaffEmp, setTsStaffEmp] = useState<{ id: string; username: string; role: string; job_title?: string } | null>(null);
  const [tsShowStaffPicker, setTsShowStaffPicker] = useState(false);
  const [tsPdfBusy, setTsPdfBusy] = useState(false);
  const [openDate, setOpenDate] = useState<string | null>(null);
  const [openMonth, setOpenMonth] = useState<string | null>(null);

  const loadEmployees = useCallback(async () => {
    const { data } = await sb.from("profiles")
      .select("id, username, role, job_title").eq("parent_id", ownerId)
      .in("role", ["cashier", "manager", "custom"]).order("username", { ascending: true });
    setEmployees((data ?? []) as { id: string; username: string; role: string; job_title?: string }[]);
  }, [ownerId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadCards = useCallback(async () => {
    setLoading(true);
    const { data } = await sb.from("time_cards").select("*").eq("owner_id", ownerId)
      .order("clocked_in_at", { ascending: false });
    setTimeCards((data ?? []) as TimeCardRow[]);
    setLoading(false);
  }, [ownerId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadEmployees(); loadCards(); }, [loadEmployees, loadCards]);
  useEffect(() => {
    const ch = supabase.channel(`owner-timecards-${ownerId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "time_cards", filter: `owner_id=eq.${ownerId}` },
        () => loadCards()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [ownerId, loadCards]);

  const openCard    = selectedEmp ? timeCards.find(tc => tc.employee_id === selectedEmp.id && !tc.clocked_out_at) ?? null : null;
  const isClockedIn = !!openCard;
  const workedDates = new Set(timeCards.map(tc => tc.work_date));

  const handleClockIn = async () => {
    if (!selectedEmp) return; setClockBusy(true);
    const { error } = await sb.from("time_cards").insert({
      owner_id: ownerId, employee_id: selectedEmp.id,
      employee_name: selectedEmp.username, clocked_in_at: new Date().toISOString(), work_date: tzNow().toLocaleDateString("en-CA"),
    });
    setClockBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${selectedEmp.username} clocked in`); loadCards();
  };
  const handleClockOut = async () => {
    if (!openCard) return; setClockBusy(true);
    const { error } = await sb.from("time_cards").update({ clocked_out_at: new Date().toISOString() }).eq("id", openCard.id);
    setClockBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${openCard.employee_name} clocked out`); loadCards();
  };

  function roleLabel(emp: { role: string; job_title?: string }) {
    if (emp.role === "manager") return "Manager";
    if (emp.role === "custom" && emp.job_title) return emp.job_title;
    return "Cashier";
  }

  // Timesheets filter helpers
  function getTsCards(): TimeCardRow[] {
    const base = (tsStaffEmp ? timeCards.filter(tc => tc.employee_id === tsStaffEmp.id) : timeCards)
      .filter(tc => !!tc.clocked_out_at); // timesheets only shows completed shifts
    if (!tsSelectedDate) return base;
    const ref = new Date(tsSelectedDate + "T12:00:00");
    if (tsPeriod === "day") return base.filter(tc => tc.work_date === tsSelectedDate);
    if (tsPeriod === "week") {
      const dow = ref.getDay();
      const s = new Date(ref); s.setDate(ref.getDate() - dow);
      const e = new Date(ref); e.setDate(ref.getDate() + (6 - dow));
      return base.filter(tc => tc.work_date >= s.toLocaleDateString("en-CA") && tc.work_date <= e.toLocaleDateString("en-CA"));
    }
    if (tsPeriod === "month") return base.filter(tc => tc.work_date.startsWith(tsSelectedDate.slice(0, 7)));
    if (tsPeriod === "year")  return base.filter(tc => tc.work_date.startsWith(tsSelectedDate.slice(0, 4)));
    return base;
  }
  function getTsLabel(): string {
    if (!tsSelectedDate) return "All Time";
    const ref = new Date(tsSelectedDate + "T12:00:00");
    if (tsPeriod === "day") return ref.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    if (tsPeriod === "week") {
      const dow = ref.getDay();
      const s = new Date(ref); s.setDate(ref.getDate() - dow);
      const e = new Date(ref); e.setDate(ref.getDate() + (6 - dow));
      return `${s.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${e.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
    }
    if (tsPeriod === "month") return ref.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    if (tsPeriod === "year")  return String(ref.getFullYear());
    return "All Time";
  }
  const tsCards      = getTsCards();
  const tsPeriodLabel = getTsLabel();
  const tsByDate: Record<string, TimeCardRow[]> = {};
  tsCards.forEach(tc => { if (!tsByDate[tc.work_date]) tsByDate[tc.work_date] = []; tsByDate[tc.work_date].push(tc); });
  const tsSortedDates = Object.keys(tsByDate).sort((a, b) => b.localeCompare(a));

  if (loading) return (
    <div className="space-y-2 mt-4">
      {Array.from({ length: 4 }).map((_, i) => <div key={i} className="rounded-2xl h-16 bg-muted/30 animate-pulse" />)}
    </div>
  );

  return (
    <div className="space-y-3 mt-4">
      {/* Clock / Timesheets sub-tabs */}
      <div className="grid grid-cols-2 gap-1.5 rounded-xl p-1" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)" }}>
        {(["clock","timesheets"] as const).map(t => (
          <button key={t} onClick={() => setHoursSubTab(t)}
            className="h-9 rounded-lg font-black text-xs flex items-center justify-center gap-1.5 transition active:scale-[0.98]"
            style={hoursSubTab === t ? { background: "var(--gradient-hero)", color: "var(--primary-foreground)" } : { color: "var(--muted-foreground)" }}>
            {t === "clock" ? <><Clock className="h-3.5 w-3.5" /> Clock</> : <><CalendarDays className="h-3.5 w-3.5" /> Timesheets</>}
          </button>
        ))}
      </div>

      {/* ══ CLOCK TAB ══ */}
      {hoursSubTab === "clock" && (
        <div className="space-y-3">
          {employees.length === 0
            ? <div className="text-center py-10 text-muted-foreground text-sm">No staff found.</div>
            : employees.map(emp => {
                const empOpen  = timeCards.find(tc => tc.employee_id === emp.id && !tc.clocked_out_at);
                const isSel    = selectedEmp?.id === emp.id;
                const isCIn    = isSel && isClockedIn;
                return (
                  <div key={emp.id}>
                    <button onClick={() => setSelectedEmp(isSel ? null : emp)}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border transition active:scale-[0.98] text-left"
                      style={{ background: isSel ? (isCIn ? "rgba(134,239,172,0.08)" : "rgba(239,68,68,0.06)") : "var(--gradient-card)",
                        borderColor: empOpen ? "#86efac" : isSel ? "rgba(239,68,68,0.4)" : "var(--border)" }}>
                      <div className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0 font-black text-sm"
                        style={{ background: empOpen ? "rgba(134,239,172,0.15)" : "rgba(255,255,255,0.06)", color: empOpen ? "#86efac" : "var(--primary)" }}>
                        {emp.username.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-black text-sm truncate">{emp.username}</p>
                        <p className="text-xs text-muted-foreground">{roleLabel(emp)}</p>
                        {isSel && empOpen && <p className="text-[10px] mt-0.5" style={{ color: "rgba(134,239,172,0.8)" }}>Since {fmtClockTime(empOpen.clocked_in_at)} · {fmtWorkDuration(empOpen.clocked_in_at, null)} on shift</p>}
                      </div>
                      {empOpen
                        ? <span className="text-[10px] font-black px-2 py-0.5 rounded-full shrink-0" style={{ background: "rgba(134,239,172,0.15)", color: "#86efac", border: "1px solid rgba(134,239,172,0.4)" }}>Clocked In</span>
                        : <span className="text-[10px] font-black px-2 py-0.5 rounded-full shrink-0" style={{ background: "rgba(255,255,255,0.06)", color: "var(--muted-foreground)", border: "1px solid var(--border)" }}>Out</span>}
                    </button>
                    {isSel && (
                      <div className="grid grid-cols-2 gap-3 pt-2 pb-4">
                        <button onClick={handleClockIn} disabled={isCIn || clockBusy || !barIsOpen}
                          className="h-14 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                          style={!isCIn && barIsOpen ? { background: "rgba(134,239,172,0.15)", border: "1.5px solid #86efac", color: "#86efac" } : { background: "var(--gradient-card)", border: "1.5px solid var(--border)", color: "var(--muted-foreground)" }}>
                          {clockBusy && !isCIn ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />} Clock In
                        </button>
                        <button onClick={handleClockOut} disabled={!isCIn || clockBusy}
                          className="h-14 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                          style={isCIn ? { background: "rgba(239,68,68,0.12)", border: "1.5px solid #f87171", color: "#f87171" } : { background: "var(--gradient-card)", border: "1.5px solid var(--border)", color: "var(--muted-foreground)" }}>
                          {clockBusy && isCIn ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />} Clock Out
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

          {/* ── Active workers flat list ── */}
          {(() => {
            const activeCards = timeCards.filter(tc => !tc.clocked_out_at);
            if (activeCards.length === 0) return null;
            return (
              <div className="space-y-2 pt-2">
                <p className="text-xs font-black text-muted-foreground uppercase tracking-widest">On Shift Now</p>
                {activeCards.map(tc => (
                  <div key={tc.id} className="flex items-center gap-3 px-4 py-3 rounded-2xl"
                    style={{ background: "rgba(134,239,172,0.06)", border: "1.5px solid rgba(134,239,172,0.25)" }}>
                    <div className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 font-black text-sm"
                      style={{ background: "rgba(134,239,172,0.15)", color: "#86efac" }}>
                      {tc.employee_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-sm truncate">{tc.employee_name}</p>
                      <p className="text-xs mt-0.5" style={{ color: "rgba(134,239,172,0.8)" }}>
                        Since {fmtClockTime(tc.clocked_in_at)} · {fmtWorkDuration(tc.clocked_in_at, null)} on shift
                      </p>
                    </div>
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full shrink-0"
                      style={{ background: "rgba(134,239,172,0.15)", color: "#86efac", border: "1px solid rgba(134,239,172,0.4)" }}>Active</span>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {/* ══ TIMESHEETS TAB ══ */}
      {hoursSubTab === "timesheets" && (
        <div className="space-y-3">
          {/* Filter row */}
          <div className="flex gap-2 items-center">
            <button onClick={() => setTsShowCal(v => !v)}
              className="flex-1 h-10 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 border transition active:scale-[0.98] truncate"
              style={tsSelectedDate ? { background: "var(--gradient-hero)", color: "var(--primary-foreground)", borderColor: "transparent" } : { background: "var(--gradient-card)", borderColor: "var(--border)", color: "var(--primary)" }}>
              <CalendarDays className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{tsSelectedDate ? new Date(tsSelectedDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Pick Date"}</span>
            </button>
            <button onClick={() => setTsShowStaffPicker(v => !v)}
              className="h-10 px-3 rounded-xl font-black text-xs flex items-center gap-1.5 border transition active:scale-95 shrink-0"
              style={tsStaffEmp ? { background: "var(--gradient-hero)", color: "var(--primary-foreground)", borderColor: "transparent" } : { background: "var(--gradient-card)", borderColor: "var(--border)", color: "var(--primary)" }}>
              <Users className="h-3.5 w-3.5" />
              <span className="max-w-[72px] truncate">{tsStaffEmp ? tsStaffEmp.username : "Staff"}</span>
            </button>
            <button
              onClick={async () => {
                if (tsPdfBusy) return; setTsPdfBusy(true);
                try { await downloadOwnerTimesheetPdf(tsCards, tsStaffEmp?.username ?? null, tsPeriodLabel, "Owner"); }
                catch { toast.error("PDF failed"); }
                setTsPdfBusy(false);
              }}
              disabled={tsPdfBusy || tsCards.length === 0}
              className="h-10 w-10 rounded-xl flex items-center justify-center border transition active:scale-95 disabled:opacity-40 shrink-0"
              style={{ background: "var(--gradient-card)", borderColor: "var(--border)", color: "var(--primary)" }}>
              {tsPdfBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
            </button>
          </div>

          {/* Calendar popup */}
          {tsShowCal && (
            <WorkedCalendar workedDates={workedDates} selectedDate={tsSelectedDate}
              onSelect={d => { setTsSelectedDate(d); setTsShowCal(false); }} />
          )}

          {/* Staff picker popup */}
          {tsShowStaffPicker && (
            <div className="rounded-2xl border border-border overflow-hidden" style={{ background: "var(--gradient-card)" }}>
              <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
                <p className="font-black text-xs text-muted-foreground uppercase tracking-widest">Select Staff</p>
                <button onClick={() => setTsShowStaffPicker(false)} className="text-xs font-black text-muted-foreground hover:text-foreground">✕</button>
              </div>
              <div className="divide-y divide-border/50">
                <button onClick={() => { setTsStaffEmp(null); setTsShowStaffPicker(false); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/20 transition"
                  style={{ background: !tsStaffEmp ? "rgba(251,146,60,0.08)" : undefined }}>
                  <div className="h-8 w-8 rounded-full flex items-center justify-center shrink-0" style={{ background: "rgba(255,255,255,0.06)" }}>
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="font-black text-sm flex-1">All Staff</p>
                  {!tsStaffEmp && <span className="text-[10px] font-black px-2 py-0.5 rounded-full" style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}>Selected</span>}
                </button>
                {employees.map(emp => (
                  <button key={emp.id} onClick={() => { setTsStaffEmp(emp); setTsShowStaffPicker(false); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/20 transition"
                    style={{ background: tsStaffEmp?.id === emp.id ? "rgba(251,146,60,0.08)" : undefined }}>
                    <div className="h-8 w-8 rounded-full flex items-center justify-center shrink-0 font-black text-xs" style={{ background: "rgba(255,255,255,0.06)", color: "var(--primary)" }}>
                      {emp.username.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-sm truncate">{emp.username}</p>
                      <p className="text-xs text-muted-foreground">{roleLabel(emp)}</p>
                    </div>
                    {tsStaffEmp?.id === emp.id && <span className="text-[10px] font-black px-2 py-0.5 rounded-full" style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}>Selected</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Period pickers */}
          {tsSelectedDate && (
            <div className="flex gap-1.5">
              {(["day","week","month","year"] as const).map(p => (
                <button key={p} onClick={() => setTsPeriod(p)}
                  className="flex-1 h-8 rounded-xl font-black text-[11px] transition active:scale-95 capitalize"
                  style={tsPeriod === p ? { background: "var(--gradient-hero)", color: "var(--primary-foreground)" } : { background: "var(--gradient-card)", border: "1px solid var(--border)", color: "var(--muted-foreground)" }}>
                  {p}
                </button>
              ))}
            </div>
          )}

          {/* Active filter badges */}
          {(tsSelectedDate || tsStaffEmp) && (
            <div className="flex items-center gap-2 flex-wrap">
              {tsSelectedDate && <span className="text-[11px] font-black px-2.5 py-1 rounded-full" style={{ background: "rgba(251,146,60,0.12)", color: "var(--primary)", border: "1px solid rgba(251,146,60,0.3)" }}>{tsPeriodLabel}</span>}
              {tsStaffEmp && <span className="text-[11px] font-black px-2.5 py-1 rounded-full" style={{ background: "rgba(134,239,172,0.1)", color: "#86efac", border: "1px solid rgba(134,239,172,0.3)" }}>{tsStaffEmp.username}</span>}
              <button onClick={() => { setTsSelectedDate(null); setTsStaffEmp(null); setTsPeriod("day"); setTsShowCal(false); }} className="text-[11px] font-black text-muted-foreground hover:text-foreground transition">Clear ✕</button>
            </div>
          )}

          {/* Records — Month accordion → Day rows → Employee entries */}
          {tsSortedDates.length === 0
            ? <div className="text-center py-12 text-muted-foreground text-sm">No records match these filters.</div>
            : (() => {
                const byMonth: Record<string, string[]> = {};
                tsSortedDates.forEach(d => {
                  const mk = d.slice(0, 7);
                  if (!byMonth[mk]) byMonth[mk] = [];
                  byMonth[mk].push(d);
                });
                const sortedMonths = Object.keys(byMonth).sort((a, b) => b.localeCompare(a));
                return sortedMonths.map(mk => {
                  const mDays   = byMonth[mk];
                  const mLabel  = new Date(mk + "-01T12:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" });
                  const mMins   = mDays.reduce((s, d) => s + tsByDate[d].reduce((ss, tc) => {
                    const out = tc.clocked_out_at ? new Date(tc.clocked_out_at) : new Date();
                    return ss + Math.max(0, Math.round((out.getTime() - new Date(tc.clocked_in_at).getTime()) / 60000));
                  }, 0), 0);
                  const mHM     = mMins < 60 ? `${mMins}m` : `${Math.floor(mMins / 60)}h ${mMins % 60}m`;
                  const mOpen   = openMonth === mk;
                  const mActive = mDays.some(d => tsByDate[d].some(tc => !tc.clocked_out_at));
                  return (
                    <div key={mk} className="rounded-2xl border border-border overflow-hidden" style={{ background: "var(--gradient-card)" }}>
                      <button type="button" onClick={() => setOpenMonth(mOpen ? null : mk)}
                        className="w-full flex items-center justify-between px-4 py-3 transition hover:bg-muted/20">
                        <div className="text-left">
                          <p className="font-black text-sm">{mLabel}</p>
                          <p className="text-xs text-muted-foreground">
                            {mDays.length} day{mDays.length !== 1 ? "s" : ""}
                            {mActive && <span className="text-green-400 ml-1">· active</span>}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-black text-xs" style={{ color: "var(--primary)" }}>{mHM}</span>
                          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${mOpen ? "rotate-180" : ""}`} />
                        </div>
                      </button>
                      {mOpen && (
                        <div className="border-t border-border/60 divide-y divide-border/30">
                          {mDays.map(d => {
                            const cards   = tsByDate[d];
                            const dOpen   = openDate === d;
                            const dActive = cards.filter(c => !c.clocked_out_at).length;
                            const dl      = new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
                            const dMins   = cards.reduce((s, tc) => {
                              const out = tc.clocked_out_at ? new Date(tc.clocked_out_at) : new Date();
                              return s + Math.max(0, Math.round((out.getTime() - new Date(tc.clocked_in_at).getTime()) / 60000));
                            }, 0);
                            const dHM = dMins < 60 ? `${dMins}m` : `${Math.floor(dMins / 60)}h ${dMins % 60}m`;
                            return (
                              <div key={d}>
                                <button type="button" onClick={() => setOpenDate(dOpen ? null : d)}
                                  className="w-full flex items-center justify-between px-4 py-2.5 pl-6 transition hover:bg-muted/20">
                                  <div className="text-left">
                                    <p className="font-black text-xs">{dl}</p>
                                    <p className="text-[10px] text-muted-foreground">{cards.length} record{cards.length !== 1 ? "s" : ""}{dActive > 0 && <span className="text-green-400 ml-1">· {dActive} active</span>}</p>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-black text-[11px]" style={{ color: "var(--primary)" }}>{dHM}</span>
                                    <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${dOpen ? "rotate-180" : ""}`} />
                                  </div>
                                </button>
                                {dOpen && (
                                  <div className="divide-y divide-border/30 bg-black/10">
                                    {cards.map(tc => {
                                      const inTime  = fmtClockTime(tc.clocked_in_at);
                                      const outTime = tc.clocked_out_at ? fmtClockTime(tc.clocked_out_at) : null;
                                      const dur     = fmtWorkDuration(tc.clocked_in_at, tc.clocked_out_at);
                                      const isAct   = !tc.clocked_out_at;
                                      return (
                                        <div key={tc.id} className="px-4 py-3 pl-7 flex items-center gap-3">
                                          <div className="h-8 w-8 rounded-full flex items-center justify-center shrink-0 font-black text-xs"
                                            style={{ background: isAct ? "rgba(134,239,172,0.15)" : "rgba(255,255,255,0.06)", color: isAct ? "#86efac" : "var(--primary)" }}>
                                            {tc.employee_name.charAt(0).toUpperCase()}
                                          </div>
                                          <div className="flex-1 min-w-0">
                                            <p className="font-black text-sm truncate">{tc.employee_name}</p>
                                            <div className="flex items-center gap-1.5 text-xs mt-0.5 flex-wrap">
                                              <LogIn className="h-3 w-3 text-green-400 shrink-0" />
                                              <span className="text-green-400 font-bold">{inTime}</span>
                                              {outTime ? <><span className="text-muted-foreground/40">→</span><LogOut className="h-3 w-3 text-red-400 shrink-0" /><span className="text-red-400 font-bold">{outTime}</span><span className="text-muted-foreground ml-1">· {dur}</span></> : <span className="text-green-400 font-semibold">· still on shift</span>}
                                            </div>
                                          </div>
                                          {isAct && <span className="text-[10px] font-black px-2 py-0.5 rounded-full shrink-0" style={{ background: "rgba(134,239,172,0.15)", color: "#86efac", border: "1px solid rgba(134,239,172,0.35)" }}>Active</span>}
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
                  );
                });
              })()}
        </div>
      )}
    </div>
  );
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
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="font-black text-sm">{c.username}</p>
                  {(() => {
                    const isCustom = (c as any).role === "custom";
                    const isMgr = (c as any).job_title === "manager";
                    if (isCustom) return (
                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full shrink-0"
                        style={{ background: "rgba(167,139,250,0.2)", border: "1px solid rgba(167,139,250,0.4)", color: "#c4b5fd" }}>
                        {(c as any).job_title ?? "Worker"}
                      </span>
                    );
                    if (isMgr) return (
                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full shrink-0"
                        style={{ background: "rgba(134,239,172,0.15)", border: "1px solid rgba(134,239,172,0.4)", color: "#86efac" }}>
                        Manager
                      </span>
                    );
                    return (
                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full shrink-0"
                        style={{ background: "rgba(var(--primary-rgb,251 146 60)/0.15)", border: "1px solid rgba(var(--primary-rgb,251 146 60)/0.4)", color: "var(--primary)" }}>
                        Cashier
                      </span>
                    );
                  })()}
                </div>
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
          const items = (o.items || []).slice().sort((a: any, b: any) => a.name.localeCompare(b.name)).map((i) => i.qty + "x " + i.name).join(", ");
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
  const [cashierAccess, setCashierAccess] = useState<"bar" | "machines" | "both">("bar");
  const [createStep, setCreateStep] = useState<"role" | "form" | "access">("role");
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

  // ── Bar open/closed state ──────────────────────────────────────────────────
  const [barSessionStart, setBarSessionStart] = useState<string | null>(null);
  const [barClosedAt,     setBarClosedAt]     = useState<string | null>(null);
  const [barToggleBusy,   setBarToggleBusy]   = useState(false);
  const [showConfirmClose, setShowConfirmClose] = useState(false);
  const [showBarOpenedOverlay, setShowBarOpenedOverlay] = useState(false);
  // ── Float modal state ──────────────────────────────────────────────────────
  const [showFloatModal, setShowFloatModal] = useState(false);
  const [floatBarAmount, setFloatBarAmount] = useState("");
  const [floatMachineAmount, setFloatMachineAmount] = useState("");
  const [hasMachinesAddon, setHasMachinesAddon] = useState(false);
  const [isMachinesAccount, setIsMachinesAccount] = useState(false);
  const barIsOpen = !!barSessionStart && !barClosedAt;

  const ownerIdForBar = profile ? effectiveOwnerId(profile.id) : "";

  // Load bar session state
  useEffect(() => {
    if (!ownerIdForBar) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from("profiles")
      .select("bar_session_start, bar_closed_at")
      .eq("id", ownerIdForBar).single()
      .then(({ data }: any) => {
        setBarSessionStart(data?.bar_session_start ?? null);
        setBarClosedAt(data?.bar_closed_at ?? null);
      });
  }, [ownerIdForBar]);

  // Realtime: reflect open/close from any device immediately
  useEffect(() => {
    if (!ownerIdForBar) return;
    const ch = supabase
      .channel(`bar-session-cashiers-${ownerIdForBar}`)
      .on("postgres_changes" as any, { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${ownerIdForBar}` },
        (payload: any) => {
          const rec = payload.new as Record<string, unknown>;
          if ("bar_session_start" in rec) setBarSessionStart((rec.bar_session_start as string | null) ?? null);
          if ("bar_closed_at" in rec) setBarClosedAt((rec.bar_closed_at as string | null) ?? null);
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [ownerIdForBar]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const create = createCashier;
  const del = deleteCashier;

  const load = async () => {
    if (!profile) return;
    const ownerIdForQuery = effectiveOwnerId(profile.id);
    const { data } = await supabase
      .from("profiles")
      .select("id,username,wallet_balance,role,job_title,cashier_access")
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
      const { error } = await (supabase as any).from("profiles").insert({
        id: crypto.randomUUID(),
        username: customName.trim().toLowerCase().replace(/\s+/g, "_"),
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
    if (error) { toast.error(error.message); } else { load(); refreshProfile(); toast.success(`Balance cleared from ${c.username}`); }
  };

  const onResetPassword = async () => {
    if (!resetPwCashier || newPw.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    setResettingPw(true);
    try {
      await resetCashierPassword({ cashier_id: resetPwCashier.id, new_password: newPw });
      toast.success(`Password updated for ${resetPwCashier.username}`);
      setResetPwCashier(null); setNewPw(""); setShowNewPw(false);
    } catch (err: any) { toast.error(err.message ?? "Failed to reset password"); }
    finally { setResettingPw(false); }
  };

  const onDelete = async (c: Cashier) => {
    if (!session?.access_token) { toast.error("Not authenticated"); return; }
    try {
      await del({ cashier_id: c.id });
      toast.success(`Removed ${c.username}`); load(); refreshProfile();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : "Failed to delete cashier"); }
  };

  const handleOpenBar = async () => {
    // Check if machines addon is active before showing float modal
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: ownerRow } = await (supabase as any)
      .from("profiles")
      .select("machines_addon_active, plan_type, is_machines_account")
      .eq("id", ownerIdForBar)
      .single();
    const machinesActive = !!(ownerRow?.machines_addon_active) || ownerRow?.plan_type === "premium" || ownerRow?.plan_type === "chain";
    const machinesOnly = !!(ownerRow?.is_machines_account);
    setHasMachinesAddon(machinesActive);
    setIsMachinesAccount(machinesOnly);
    setFloatBarAmount("");
    setFloatMachineAmount("");
    setShowFloatModal(true);
  };

  const confirmOpenBarWithFloat = async () => {
    const barFloatVal = isMachinesAccount ? 0 : parseFloat(floatBarAmount);
    if (!isMachinesAccount && (isNaN(barFloatVal) || barFloatVal < 0)) { toast.error("Enter a valid bar float amount"); return; }
    if (hasMachinesAddon) {
      const machineFloatVal = parseFloat(floatMachineAmount);
      if (isNaN(machineFloatVal) || machineFloatVal < 0) { toast.error("Enter a valid machine float amount"); return; }
    }
    setBarToggleBusy(true);

    // Guard: do not create a new session if one is already open
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingOpen } = await (supabase as any).from("bar_sessions")
      .select("id").eq("owner_id", ownerIdForBar).is("closed_at", null).limit(1).maybeSingle();
    if (existingOpen) {
      setBarToggleBusy(false);
      toast.error("Bar is already open — close the current session first");
      return;
    }

    const now = new Date().toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("profiles")
      .update({ bar_session_start: now, bar_closed_at: null, cashier_float: barFloatVal, cashier_float_set_at: now })
      .eq("id", ownerIdForBar);
    if (error) { setBarToggleBusy(false); toast.error("Failed to open bar: " + error.message); return; }

    // Insert machine float session
    const machineAmt = hasMachinesAddon ? (parseFloat(floatMachineAmount) || 0) : 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("machine_float_sessions").insert({ owner_id: ownerIdForBar, amount: machineAmt, set_at: now });

    // Insert bar_sessions parent row + first sub-session
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: newSession } = await (supabase as any).from("bar_sessions")
      .insert({ owner_id: ownerIdForBar, opened_at: now })
      .select("id").single();
    if (newSession?.id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("bar_sub_sessions").insert({
        owner_id: ownerIdForBar,
        bar_session_id: newSession.id,
        opened_at: now,
        cashier_float: barFloatVal,
      });
    }

    setBarToggleBusy(false);
    setShowFloatModal(false);
    setBarSessionStart(now); setBarClosedAt(null);
    toast.success("🟢 Bar opened at " + new Date(now).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true }));
    setShowBarOpenedOverlay(true);
  };

  const handleCloseBar = async () => {
    setBarToggleBusy(true);
    const now = new Date().toISOString();
    // Auto clock-out all open time cards for this owner
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("time_cards")
      .update({ clocked_out_at: now }).eq("owner_id", ownerIdForBar).is("clocked_out_at", null);
    // Close open sub-sessions
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("bar_sub_sessions")
      .update({ closed_at: now }).eq("owner_id", ownerIdForBar).is("closed_at", null);
    // Close open bar_session row
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("bar_sessions")
      .update({ closed_at: now }).eq("owner_id", ownerIdForBar).is("closed_at", null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("profiles").update({ bar_closed_at: now }).eq("id", ownerIdForBar);
    setBarToggleBusy(false);
    if (error) { toast.error("Failed to close bar: " + error.message); return; }
    setBarClosedAt(now);
    toast.success("🔴 Bar closed at " + new Date(now).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true }));
  };

  return (
    <div>
      {/* Sticky page title */}
      {/* ── Confirm Close Bar modal ── */}
      {showConfirmClose && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-border shadow-2xl overflow-hidden"
            style={{ background: "var(--gradient-card)" }}>
            <div className="px-6 pt-7 pb-4 text-center space-y-3">
              <div className="text-5xl">🔴</div>
              <h2 className="font-black text-xl">Close the Bar?</h2>
              <p className="text-sm text-muted-foreground leading-snug">
                This will end the current session. Cashiers will not be able to make sales until the bar is reopened.
              </p>
            </div>
            <div className="grid grid-cols-2 border-t border-border">
              <button
                onClick={() => setShowConfirmClose(false)}
                className="h-14 font-black text-sm border-r border-border transition active:bg-muted/60">
                Cancel
              </button>
              <button
                disabled={barToggleBusy}
                onClick={async () => { setShowConfirmClose(false); await handleCloseBar(); }}
                className="h-14 font-black text-sm text-white transition active:opacity-80 disabled:opacity-40"
                style={{ background: "#dc2626" }}>
                {barToggleBusy ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Close Bar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Float Modal ── */}
      {showFloatModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-border shadow-2xl overflow-hidden"
            style={{ background: "var(--gradient-card)" }}>
            <div className="px-6 pt-6 pb-2 text-center">
              <div className="h-14 w-14 rounded-full flex items-center justify-center mx-auto mb-3"
                style={{ background: "rgba(134,239,172,0.12)", border: "1.5px solid #86efac" }}>
                <span className="text-2xl">🟢</span>
              </div>
              <h2 className="font-black text-xl">Open Bar</h2>
              <p className="text-xs text-muted-foreground mt-1">Set floats before starting the session</p>
            </div>
            <div className="px-6 pb-6 pt-4 space-y-4">
              {/* Bar Float — hidden for machines-only accounts */}
              {!isMachinesAccount && (
                <div className="space-y-1">
                  <label className="text-xs font-black text-muted-foreground uppercase tracking-wider">Bar Float</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="e.g. 500.00"
                    value={floatBarAmount}
                    onChange={e => setFloatBarAmount(e.target.value)}
                    className="w-full h-11 rounded-xl border border-border bg-background px-4 text-base font-black outline-none focus:ring-1 focus:ring-primary"
                    autoFocus
                  />
                </div>
              )}
              {/* Machine Float — only if machines addon active */}
              {hasMachinesAddon && (
                <div className="space-y-1">
                  <label className="text-xs font-black text-muted-foreground uppercase tracking-wider">Machine Float</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="e.g. 200.00"
                    value={floatMachineAmount}
                    onChange={e => setFloatMachineAmount(e.target.value)}
                    className="w-full h-11 rounded-xl border border-border bg-background px-4 text-base font-black outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowFloatModal(false)}
                  className="flex-1 h-12 rounded-2xl font-black text-sm border border-border hover:bg-muted/30 transition">
                  Cancel
                </button>
                <button
                  onClick={confirmOpenBarWithFloat}
                  disabled={barToggleBusy || (!isMachinesAccount && !floatBarAmount) || (hasMachinesAddon && !floatMachineAmount)}
                  className="flex-1 h-12 rounded-2xl font-black text-sm transition active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ background: "rgba(134,239,172,0.15)", border: "1.5px solid #86efac", color: "#86efac" }}>
                  {barToggleBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Open Bar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Bar Opened overlay ── */}
      {showBarOpenedOverlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-border shadow-2xl overflow-hidden"
            style={{ background: "var(--gradient-card)" }}>
            <div className="px-6 pt-7 pb-4 text-center space-y-2">
              <div className="text-5xl">🟢</div>
              <h2 className="font-black text-xl">Bar is Open!</h2>
              <p className="text-sm text-muted-foreground leading-snug">
                Session started. Floats have been set. Good luck tonight!
              </p>
            </div>
            <div className="px-6 pb-6 pt-2">
              <button
                onClick={() => setShowBarOpenedOverlay(false)}
                className="w-full h-12 rounded-2xl font-black text-sm transition active:scale-95 text-primary-foreground"
                style={{ background: "var(--gradient-hero)" }}>
                Let's Go
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="sticky top-0 z-20 -mx-3 px-3 pt-2 pb-2 bg-background/95 backdrop-blur border-b border-border">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-black leading-tight">{t("cashiers_title", "Staff")}</h1>
          {/* Bar Open / Closed toggle */}
          <button
            type="button"
            disabled={barToggleBusy}
            onClick={barIsOpen ? () => setShowConfirmClose(true) : handleOpenBar}
            className="h-10 px-4 rounded-xl font-black text-sm flex items-center gap-2 transition active:scale-95 disabled:opacity-50"
            style={barIsOpen
              ? { background: "rgba(134,239,172,0.15)", border: "1.5px solid #86efac", color: "#86efac" }
              : { background: "rgba(239,68,68,0.12)", border: "1.5px solid #f87171", color: "#f87171" }}>
            {barToggleBusy
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <span className="text-xs">{barIsOpen ? "🟢" : "🔴"}</span>}
            {barIsOpen ? "Bar Open" : "Bar Closed"}
          </button>
        </div>
      </div>
      <div className="pt-3">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-4 w-full">
          <TabsTrigger value="add">{t("tab_create", "Create")}</TabsTrigger>
          <TabsTrigger value="manage">{t("tab_manage", "Manage")} ({list.length})</TabsTrigger>
          <TabsTrigger value="salary">{t("tab_salary", "Salary")}</TabsTrigger>
          <TabsTrigger value="hours">{t("tab_hours", "Hours")}</TabsTrigger>
        </TabsList>

        <TabsContent value="add">
          {/* ── Step 1: Role picker ── */}
          {!selectedRole && (
            <div className="mt-6 space-y-3">
              <p className="text-sm text-muted-foreground text-center">{t("select_employee_type", "Select the type of employee to create")}</p>
              <div className="grid grid-cols-3 gap-3">
                {/* Cashier */}
                <button type="button" onClick={() => setSelectedRole("cashier")}
                  className="rounded-2xl border-2 p-4 flex flex-col items-center gap-2 transition active:scale-95"
                  style={{ background: "var(--gradient-card)", borderColor: "var(--border)" }}>
                  <div className="h-12 w-12 rounded-xl flex items-center justify-center text-2xl"
                    style={{ background: "rgba(var(--primary-rgb,251 146 60)/0.15)" }}>💰</div>
                  <span className="font-black text-sm">{t("role_cashier", "Cashier")}</span>
                  <span className="text-[10px] text-muted-foreground text-center leading-tight">{t("cashier_desc", "Full bar access, requires login")}</span>
                </button>
                {/* Manager */}
                <button type="button" onClick={() => setSelectedRole("manager")}
                  className="rounded-2xl border-2 p-4 flex flex-col items-center gap-2 transition active:scale-95"
                  style={{ background: "var(--gradient-card)", borderColor: "var(--border)" }}>
                  <div className="h-12 w-12 rounded-xl flex items-center justify-center text-2xl"
                    style={{ background: "rgba(134,239,172,0.15)" }}>👔</div>
                  <span className="font-black text-sm">{t("role_manager_label", "Manager")}</span>
                  <span className="text-[10px] text-muted-foreground text-center leading-tight">{t("manager_desc", "Items, Wallet & Machines only")}</span>
                </button>
                {/* Custom */}
                <button type="button" onClick={() => setSelectedRole("custom")}
                  className="rounded-2xl border-2 p-4 flex flex-col items-center gap-2 transition active:scale-95"
                  style={{ background: "var(--gradient-card)", borderColor: "var(--border)" }}>
                  <div className="h-12 w-12 rounded-xl flex items-center justify-center text-2xl"
                    style={{ background: "rgba(167,139,250,0.15)" }}>🏷️</div>
                  <span className="font-black text-sm">{t("role_custom", "Custom")}</span>
                  <span className="text-[10px] text-muted-foreground text-center leading-tight">{t("custom_desc", "No login, salary tracking only")}</span>
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
              const isManager = (c as any).job_title === "manager";
              const roleBadge = isCustom
                ? { label: (c as any).job_title ?? "Worker", color: "rgba(167,139,250,0.2)", border: "rgba(167,139,250,0.4)", text: "#c4b5fd" }
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
                    {!isCustom && !isManager && (
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
                {/* Action buttons — custom workers: none; managers: password only; cashiers: all */}
                {!isCustom && (
                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    {!isManager && (
                      <Button size="sm" variant="outline" className="flex-1 min-w-[90px] h-12 text-sm font-black" onClick={() => setStatementCashier(c)}>
                        <FileText className="h-5 w-5 mr-1.5" /> Statement
                      </Button>
                    )}
                    {!isManager && (
                      <Button size="sm" variant="secondary" className="flex-1 min-w-[90px] h-12 text-sm font-black" onClick={() => onClear(c)} disabled={Number(c.wallet_balance) === 0}>
                        <Eraser className="h-5 w-5 mr-1.5" /> Clear
                      </Button>
                    )}
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

        <TabsContent value="hours">
          <HoursTab ownerId={effectiveOwnerId(profile.id)} barIsOpen={barIsOpen} />
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

      {/* ── Keep Bar Open / Close Bar Modal removed — use toggle button in header instead ── */}
      </div>
    </div>
  );
}
