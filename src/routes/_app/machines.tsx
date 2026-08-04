import { createFileRoute, useNavigate } from "@tanstack/react-router";


import { useCallback, useEffect, useRef, useState } from "react";


import { createPortal } from "react-dom";


import { useAuth } from "@/lib/auth";


import { useChain } from "@/lib/ChainContext";


import { useTranslation } from "@/lib/i18n";


import { supabase } from "@/integrations/supabase/client";


// eslint-disable-next-line @typescript-eslint/no-explicit-any


const sb = supabase as any;


import { toast } from "sonner";


import { Button } from "@/components/ui/button";


import { Input } from "@/components/ui/input";


import { Label } from "@/components/ui/label";


import { useConfirm } from "@/components/ui/confirm-dialog";

import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";


import {


  Plus, Loader2, ChevronLeft, Trash2, Download, X, Pencil, Receipt,
  TrendingDown, TrendingUp, DollarSign, Gamepad2, Camera, AlertTriangle, Bell, BarChart3, CalendarIcon,
} from "lucide-react";


import { downloadPdf } from "@/lib/download";


import { drawHeader, addFootersToAllPages, LM, RM, CONTENT_BOTTOM } from "@/lib/pdfHelpers";


import {


  loadAlertSettings, saveAlertSettings, syncAlertSettingsToServer, requestNotificationPermission,


  checkAndFirePayoutAlert, registerPayoutAlertTapHandler, THRESHOLD_OPTIONS, type AlertSettings,


  ALERT_OPEN_MACHINE_KEY, ALERT_OPEN_BAR_KEY,


} from "@/lib/machineAlerts";





export const Route = createFileRoute("/_app/machines")({


  component: MachinesPage,


});





// ── Types ──────────────────────────────────────────────────────────────────────


type Machine = { id: string; owner_id: string; name: string; created_at: string; sort_order: number };


type MachineEntry = {


  id: string; machine_id: string; owner_id: string;


  type: "payout" | "income" | "expense"; amount: number;


  note: string | null; entry_date: string; created_at: string;


  cashier_id: string | null; cashier_name: string | null;


  proof_image_url: string | null;


};


type FloatSession = {


  id: string; owner_id: string;


  amount: number; set_at: string; created_at: string;


};





// ── Helpers ────────────────────────────────────────────────────────────────────


// ── CalendarPopover — reusable date picker used in summary tabs ──────────────
function isoToDateM(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function dateToIsoM(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function CalendarPopover({ value, onChange, minDate, maxDate, label }: {
  value: string; onChange: (iso: string) => void; minDate?: string; maxDate?: string; label: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = isoToDateM(value);
  return (
    <div className="w-full">
      <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block mb-1">{label}</label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" className="w-full h-11 rounded-xl border border-border bg-background px-3 text-sm font-bold outline-none focus:ring-1 focus:ring-primary flex items-center justify-between gap-2 hover:bg-accent/40 transition-colors">
            <span>{selected.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
            <CalendarIcon className="h-4 w-4 text-muted-foreground shrink-0" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 z-[200]" align="start" sideOffset={4}>
          <Calendar mode="single" selected={selected}
            onSelect={(day) => { if (day) { onChange(dateToIsoM(day)); setOpen(false); } }}
            defaultMonth={selected}
            startMonth={minDate ? isoToDateM(minDate) : undefined}
            endMonth={maxDate ? isoToDateM(maxDate) : undefined}
            disabled={[
              ...(minDate ? [{ before: isoToDateM(minDate) }] : []),
              ...(maxDate ? [{ after:  isoToDateM(maxDate) }] : []),
            ]}
            captionLayout="dropdown" className="rounded-xl border-0" />
        </PopoverContent>
      </Popover>
    </div>
  );
}

function fmt(n: number) {


  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });


}


// Whole-number formatter for hero stat cards — no cents


function fmtWhole(n: number) {


  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });


}


// Returns today's date as YYYY-MM-DD in Trinidad/Port_of_Spain time (UTC-4)


function todayTT(): string {


  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Port_of_Spain" });


  // en-CA gives YYYY-MM-DD format which is what we need for date inputs


}


function todayISO() { return todayTT(); }


function fmtDate(d: string) {


  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", {


    day: "numeric", month: "short", year: "numeric",


  });


}





// ── Stat Card ──────────────────────────────────────────────────────────────────


function StatCard({ label, value, color }: {


  label: string; value: string; color: string;


}) {


  return (


    <div className="rounded-2xl p-3 flex flex-col gap-1 text-center"


      style={{ background: "oklch(0.18 0.02 60)" }}>


      <div className="text-[9px] sm:text-[11px] lg:text-xs font-semibold text-white/50 leading-tight">{label}</div>


      <div className="font-black text-sm sm:text-base lg:text-lg leading-tight" style={{ color }}>{value}</div>


    </div>


  );


}





// ── Small Stat ─────────────────────────────────────────────────────────────────


function SmallStat({ label, value, color }: { label: string; value: string; color: string }) {


  return (


    <div className="rounded-xl px-3 py-2 flex flex-col gap-0.5 text-center"


      style={{ background: "oklch(0.22 0.02 60)" }}>


      <div className="text-[7px] sm:text-[9px] font-semibold text-white/40 leading-tight">{label}</div>


      <div className="font-black text-xs" style={{ color }}>{value}</div>


    </div>


  );


}





// ── History Month Accordion ────────────────────────────────────────────────────


function HistoryMonthAccordion({ entries, loading, downloading, deletingId, lastDeletedAt, floatSession, onDownloadAll, onDownloadMonth, onDelete, onLightbox, isCashier, ownerId, currentBarSession, barOpen }: {


  entries: MachineEntry[];


  loading: boolean;


  downloading: boolean;


  deletingId: string | null;


  lastDeletedAt: number | null;


  floatSession: FloatSession | null;


  onDownloadAll: () => void;


  onDownloadMonth: (monthKey: string, monthEntries: MachineEntry[]) => void;


  onDelete: (id: string) => void;


  onLightbox: (url: string) => void;


  isCashier: boolean;


  ownerId: string;


  currentBarSession: string | null;


  barOpen: boolean;


}) {


  const [openMonth, setOpenMonth] = useState<string | null>(null);


  const [downloadingMonth, setDownloadingMonth] = useState<string | null>(null);


  const [downloadedAll, setDownloadedAll] = useState(false);


  const [downloadedMonth, setDownloadedMonth] = useState<string | null>(null);





  // ── Edit income state ───────────────────────────────────────────────────────


  const [editEntry, setEditEntry] = useState<MachineEntry | null>(null);


  const [editAmount, setEditAmount] = useState("");


  const [savingEdit, setSavingEdit] = useState(false);





  const handleSaveEdit = async () => {


    if (!editEntry) return;


    const val = parseFloat(editAmount);


    if (isNaN(val) || val < 0) { toast.error("Enter a valid amount"); return; }


    setSavingEdit(true);


    // eslint-disable-next-line @typescript-eslint/no-explicit-any


    const { error } = await (supabase as any).from("machine_entries")


      .update({ amount: val })


      .eq("id", editEntry.id);


    setSavingEdit(false);


    if (error) { toast.error(error.message); return; }


    toast.success("Income updated");


    setEditEntry(null);


    setEditAmount("");


  };





  // ── Bar session state ───────────────────────────────────────────────────────


  const [barSessionStart, setBarSessionStart] = useState<string | null>(null);


  const [barClosedAt,     setBarClosedAt]     = useState<string | null>(null);


  const barIsOpen = !!barSessionStart && !barClosedAt;





  const fmtSessionTs = (iso: string) => {


    const d = new Date(iso);


    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "America/Port_of_Spain" })


      + " · " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "America/Port_of_Spain" });


  };





  useEffect(() => {


    if (!ownerId) return;


    // eslint-disable-next-line @typescript-eslint/no-explicit-any


    (supabase as any).from("profiles")


      .select("bar_session_start, bar_closed_at")


      .eq("id", ownerId)


      .single()


      .then(({ data }: { data: { bar_session_start: string | null; bar_closed_at: string | null } | null }) => {


        setBarSessionStart(data?.bar_session_start ?? null);


        setBarClosedAt(data?.bar_closed_at ?? null);


      });


  }, [ownerId]);





  // Realtime — keep bar open/closed in sync


  useEffect(() => {


    if (!ownerId) return;


    const ch = supabase


      .channel(`bar-session-history-${ownerId}`)


      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${ownerId}` },


        (payload) => {


          const rec = payload.new as Record<string, unknown>;


          if ("bar_session_start" in rec) setBarSessionStart((rec.bar_session_start as string | null) ?? null);


          if ("bar_closed_at"     in rec) setBarClosedAt((rec.bar_closed_at as string | null) ?? null);


        })


      .subscribe();


    return () => { supabase.removeChannel(ch); };


  }, [ownerId]);





  // Sort all entries newest first


  const allSorted = [...entries].sort((a, b) => b.created_at.localeCompare(a.created_at));


  // Only show delete on the newest payout entry if:


  //   1. It was made more than 2 seconds after the last delete (prevents button jumping)


  //   2. It was made AFTER the last float update — once the owner updates the float,


  //      all prior entries are locked and the delete button must not appear on them.


  //      It only re-appears when a new payout is recorded in the new float session.


  const newestPayoutEntry = allSorted.find(e => e.type === "payout") ?? null;


  const newestId = (() => {


    if (!newestPayoutEntry) return null;


    // Guard: entry must be newer than 2s after last delete


    if (lastDeletedAt !== null) {


      const entryTime = new Date(newestPayoutEntry.created_at).getTime();


      if (entryTime < lastDeletedAt - 2000) return null;


    }


    // Guard: entry must be from the current float session (after floatSession.set_at).


    // If it predates the last float update, the session is closed — hide the button.


    if (floatSession) {


      const entryTime = new Date(newestPayoutEntry.created_at).getTime();


      const floatTime = new Date(floatSession.set_at).getTime();


      if (entryTime < floatTime) return null;


    }


    return newestPayoutEntry.id;


  })();






  // Only show delete on the newest income entry for owner/manager when bar is still open.
  // Hidden when: bar is closed, or entry predates the current bar session.
  const newestIncomeEntry = allSorted.find(e => e.type === "income") ?? null;
  const newestIncomeId = (() => {
    if (isCashier) return null;
    if (!barOpen) return null;
    if (!newestIncomeEntry) return null;
    if (lastDeletedAt !== null) {
      const entryTime = new Date(newestIncomeEntry.created_at).getTime();
      if (entryTime < lastDeletedAt - 2000) return null;
    }
    if (currentBarSession) {
      const entryTime = new Date(newestIncomeEntry.created_at).getTime();
      if (entryTime < new Date(currentBarSession).getTime()) return null;
    }
    return newestIncomeEntry.id;
  })();
  // Group by YYYY-MM


  const byMonth: Record<string, MachineEntry[]> = {};


  allSorted.forEach((e) => {


    const mk = e.created_at.slice(0, 7); // "YYYY-MM"


    if (!byMonth[mk]) byMonth[mk] = [];


    byMonth[mk].push(e);


  });


  const monthKeys = Object.keys(byMonth).sort((a, b) => b.localeCompare(a));





  const monthLabel = (mk: string) => {


    const [yr, mo] = mk.split("-");


    return new Date(Number(yr), Number(mo) - 1, 1)


      .toLocaleDateString("en-GB", { month: "long", year: "numeric" });


  };





  const handleMonthPdf = async (mk: string) => {


    setDownloadingMonth(mk);


    await onDownloadMonth(mk, byMonth[mk]);


    setDownloadingMonth(null);


    setDownloadedMonth(mk);


    setTimeout(() => setDownloadedMonth(null), 5000);


  };





  if (loading) {


    return <div className="space-y-2">{[0,1,2].map(i => <div key={i} className="h-16 rounded-xl bg-muted/30 animate-pulse" />)}</div>;


  }





  if (entries.length === 0) {


    return <div className="text-center py-12 text-muted-foreground text-sm">No records yet.</div>;


  }





  return (


    <>


    <div className="space-y-3">


      {/* Top bar — record count + Download All */}


      <div className="flex items-center justify-between">


        <span className="text-sm text-muted-foreground">{entries.length} records</span>


        <Button size="sm" variant="outline" className="h-9 gap-1.5 font-bold"


          disabled={downloading || entries.length === 0} onClick={async () => { await onDownloadAll(); setDownloadedAll(true); setTimeout(() => setDownloadedAll(false), 5000); }}


          style={downloadedAll ? { background: "#16a34a", color: "#fff", borderColor: "#16a34a" } : {}}>


          {downloading


            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />


            : downloadedAll


            ? <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>


            : <Download className="h-3.5 w-3.5" />}


          {downloadedAll ? "Done" : "Download All"}


        </Button>


      </div>





      {/* Month accordions */}


      <div className="space-y-2">


        {monthKeys.map((mk) => {


          const mEntries = byMonth[mk];


          const mPayout = mEntries.filter(e => e.type === "payout").reduce((s, e) => s + Number(e.amount), 0);


          const mIncome = mEntries.filter(e => e.type === "income").reduce((s, e) => s + Number(e.amount), 0);


          const mExpense = mEntries.filter(e => e.type === "expense").reduce((s, e) => s + Number(e.amount), 0);


          const mProfit = mIncome - mPayout - mExpense;


          const isOpen = openMonth === mk;


          return (


            <div key={mk} className="rounded-2xl border border-border overflow-hidden"


              style={{ background: "var(--gradient-card)" }}>


              {/* Month header */}


              <button


                className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/20 transition"


                onClick={() => setOpenMonth(isOpen ? null : mk)}>


                <div className="flex items-center gap-3 min-w-0">


                  <span className="font-black text-sm">{monthLabel(mk)}</span>


                  <span className="text-xs text-muted-foreground">{mEntries.length} records</span>


                </div>


                <div className="flex items-center gap-2 shrink-0">


                  <span className={`text-xs font-black ${mProfit >= 0 ? "text-green-400" : "text-red-400"}`}>


                    {mProfit >= 0 ? "+" : ""}${fmtWhole(mProfit)}


                  </span>


                  <button


                    onClick={(ev) => { ev.stopPropagation(); handleMonthPdf(mk); }}


                    disabled={downloadingMonth === mk}


                    className="h-7 px-2 rounded-lg flex items-center gap-1 text-xs font-bold border border-border hover:bg-muted/50 transition disabled:opacity-50"


                    style={downloadedMonth === mk ? { background: "#16a34a", color: "#fff", borderColor: "#16a34a" } : {}}


                    title="Download this month PDF">


                    {downloadingMonth === mk


                      ? <Loader2 className="h-3 w-3 animate-spin" />


                      : downloadedMonth === mk


                      ? <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>


                      : <Download className="h-3 w-3" />}


                    {downloadedMonth === mk ? "Done" : "PDF"}


                  </button>


                  <span className={`transition-transform text-muted-foreground text-sm ${isOpen ? "rotate-180" : ""}`}>▾</span>


                </div>


              </button>





              {/* Expanded rows */}


              {isOpen && (


                <div className="border-t border-border divide-y divide-border/40">


                  {mEntries.filter(e => e.type !== "expense").map((e) => {


                    const isPayout = e.type === "payout" || e.type === "expense";


                    const isNewest = e.id === newestId;


                    const hasProof = !!e.proof_image_url;


                    return (


                      <div key={e.id} className="px-4 py-3 flex items-start gap-3">


                        <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 border text-xs font-black ${


                          isPayout ? "bg-red-500/15 border-red-500/30 text-red-400" : "bg-green-500/15 border-green-500/30 text-green-400"


                        }`}>


                          {isPayout ? "P" : "I"}


                        </div>


                        <div className="flex-1 min-w-0">


                          <div className="text-xs text-muted-foreground">


                            {new Date(e.created_at).toLocaleString("en-GB", {


                              day: "numeric", month: "short", year: "numeric",


                              hour: "2-digit", minute: "2-digit", hour12: true,


                            })}


                          </div>


                          <div className={`font-black text-sm ${isPayout ? "text-red-400" : "text-green-400"}`}>


                            {isPayout ? "-" : "+"}${fmt(Number(e.amount))}


                          </div>


                          {!isPayout && (


                            <div className="text-xs font-semibold text-green-400/70 mt-0.5">Machine cleared by owner</div>


                          )}


                          {e.note && <div className="text-xs text-muted-foreground mt-0.5">{e.note}</div>}


                          {e.cashier_name && (


                            <div className="text-[10px] text-white/30 mt-0.5">


                              {isPayout ? "Expense by" : "Cleared by"}: {e.cashier_name}


                            </div>


                          )}





                        </div>


                        {/* Proof photo — landscape, right side */}


                        {e.type === "payout" && !hasProof && (
                          <div className="flex items-center gap-1 mt-1">
                            <AlertTriangle className="h-3 w-3 text-amber-400 shrink-0" />
                            <span className="text-[10px] font-bold text-amber-400">Unverified</span>
                          </div>
                        )}
                        {isPayout && hasProof && (


                          <button


                            onClick={() => onLightbox(e.proof_image_url!)}


                            className="shrink-0 rounded-xl overflow-hidden border border-green-500/30 active:opacity-80 transition"


                            style={{ width: 100, height: 65 }}>


                            <img src={e.proof_image_url!} alt="proof" className="w-full h-full object-cover" loading="lazy" onError={(ev) => { (ev.target as HTMLImageElement).style.display = "none"; }} />


                          </button>


                        )}


                        {isNewest && !deletingId && isPayout && (


                          <button onClick={() => onDelete(e.id)}


                            className="h-8 w-8 rounded-full flex items-center justify-center bg-red-600 active:scale-95 transition shrink-0">


                            <Trash2 className="h-3.5 w-3.5 text-white" />


                          </button>


                        )}


                        {isNewest && deletingId === e.id && isPayout && (


                          <div className="h-8 w-8 rounded-full flex items-center justify-center bg-red-600 shrink-0 opacity-50">


                            <Loader2 className="h-3.5 w-3.5 text-white animate-spin" />


                          </div>


                        )}


                        {/* Delete income — owner/manager only, bar open, newest in current session */}
                        {e.id === newestIncomeId && !deletingId && !isPayout && (
                          <button onClick={() => onDelete(e.id)}
                            className="h-8 w-8 rounded-full flex items-center justify-center bg-red-600 active:scale-95 transition shrink-0">
                            <Trash2 className="h-3.5 w-3.5 text-white" />
                          </button>
                        )}
                        {e.id === newestIncomeId && deletingId === e.id && !isPayout && (
                          <div className="h-8 w-8 rounded-full flex items-center justify-center bg-red-600 shrink-0 opacity-50">
                            <Loader2 className="h-3.5 w-3.5 text-white animate-spin" />
                          </div>
                        )}


                        {/* Edit income — owner/manager only, bar open, entry in current session */}


                        {!isPayout && !isCashier && barOpen && currentBarSession &&


                          new Date(e.created_at) >= new Date(currentBarSession) && (


                          <button


                            onClick={() => { setEditEntry(e); setEditAmount(String(Number(e.amount))); }}


                            className="h-8 w-8 rounded-full flex items-center justify-center active:scale-95 transition shrink-0"


                            style={{ background: "rgba(251,146,60,0.20)", border: "1px solid rgba(251,146,60,0.4)" }}


                            title="Edit income"


                          >


                            <Pencil className="h-3.5 w-3.5" style={{ color: "var(--primary)" }} />


                          </button>


                        )}


                      </div>


                    );


                  })}


                </div>


              )}


            </div>


          );


        })}


      </div>


    </div>





    {/* ── Edit Income Modal ── */}


    {editEntry && (


      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm px-6">


        <div className="w-full max-w-xs rounded-2xl border border-border shadow-2xl overflow-hidden"


          style={{ background: "var(--gradient-card)" }}>


          <div className="px-5 pt-5 pb-3">


            <p className="font-black text-base">Edit Income</p>


            <p className="text-xs text-muted-foreground mt-0.5">


              {new Date(editEntry.created_at).toLocaleString("en-GB", {


                day: "numeric", month: "short", year: "numeric",


                hour: "2-digit", minute: "2-digit", hour12: true,


              })}


            </p>


          </div>


          <div className="px-5 pb-2">


            <label className="text-xs font-black text-muted-foreground uppercase tracking-wide">Amount ($)</label>


            <input


              type="number"


              min="0"


              step="0.01"


              value={editAmount}


              onChange={(e) => setEditAmount(e.target.value)}


              className="mt-1 w-full h-11 rounded-xl border border-border bg-muted px-3 text-lg font-black outline-none focus:ring-1 focus:ring-primary"


              autoFocus


            />


          </div>


          <div className="grid grid-cols-2 border-t border-border mt-4">


            <button


              onClick={() => { setEditEntry(null); setEditAmount(""); }}


              disabled={savingEdit}


              className="h-12 font-black text-sm border-r border-border transition active:bg-muted/60 disabled:opacity-40"


            >


              Cancel


            </button>


            <button


              onClick={handleSaveEdit}


              disabled={savingEdit}


              className="h-12 font-black text-sm text-white transition active:opacity-80 disabled:opacity-40 flex items-center justify-center gap-2"


              style={{ background: "var(--gradient-hero)" }}


            >


              {savingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}


            </button>


          </div>


        </div>


      </div>


    )}


    </>


  );


}





function MachineDetail({ machine, screenNumber, ownerId, profile, floatSession, remainingFloat, initialTab, onBack, onDeleted, barSessionStart, barClosedAt, onMonitorLogChange }: {


  machine: Machine; screenNumber: number; ownerId: string;


  profile: { id: string; username?: string; role?: string; job_title?: string };


  floatSession: FloatSession | null;


  remainingFloat: number | null;


  initialTab?: "payout" | "income" | "history" | "monitor";


  onBack: () => void; onDeleted: () => void;


  barSessionStart: string | null;


  barClosedAt: string | null;


  onMonitorLogChange?: () => void;


}) {


  const barIsOpen = !!barSessionStart && !barClosedAt;
  const { t } = useTranslation();


  const navigate = useNavigate();


  const [entries, setEntries] = useState<MachineEntry[]>([]);


  const [loading, setLoading] = useState(true);


  const isCashier = profile.role === "cashier";
  const isOwner = profile.role === "owner";
  const isManager = profile.role === "manager" || profile.job_title === "manager";


  const [tab, setTab] = useState<"payout" | "income" | "history" | "monitor">(initialTab ?? "payout");

  // ── Monitor tab state ────────────────────────────────────────────────────
  const [monitorIn,       setMonitorIn]       = useState<string>("");
  const [monitorOut,      setMonitorOut]      = useState<string>("");
  const [monitorInTotal,  setMonitorInTotal]  = useState<string>("");
  const [monitorOutTotal, setMonitorOutTotal] = useState<string>("");
  const [monitorInDiff,   setMonitorInDiff]   = useState<string>("");
  const [monitorOutDiff,  setMonitorOutDiff]  = useState<string>("");
  const [monitorLoading,  setMonitorLoading]  = useState(false);
  const [monitorSaving,   setMonitorSaving]   = useState(false);
  const [monitorFocus,    setMonitorFocus]    = useState<"in" | "out" | "lastIn" | "lastOut" | null>(null);
  const [monitorUpdateDone, setMonitorUpdateDone] = useState(false); // blocks re-click after save
  const [showConfirmUpdate, setShowConfirmUpdate] = useState(false); // confirm modal before saving log
  const [monitorInputsLocked, setMonitorInputsLocked] = useState(false); // locked after update until New Entry
  // Stat cards: only show values after Update is clicked; zero out on New Entry
  const [monitorCardIn,  setMonitorCardIn]  = useState<number | null>(null);
  const [monitorCardOut, setMonitorCardOut] = useState<number | null>(null);

  // First-entry "seed" values — only used when there are no logs yet
  // The user can optionally enter the machine's previous Last IN / OUT so the
  // first log diff is accurate for an already-running machine.
  const [firstEntryLastIn,  setFirstEntryLastIn]  = useState<string>("");
  const [firstEntryLastOut, setFirstEntryLastOut] = useState<string>("");

  // Reset the "already saved" lock whenever the owner changes an input
  useEffect(() => { setMonitorUpdateDone(false); }, [monitorIn, monitorOut]);

  // Monitor sub-tab: "monitor" | "logs"
  const [monitorSubTab, setMonitorSubTab] = useState<"monitor" | "logs">("monitor");

  // Monitor logs
  type MonitorLog = {
    id: string; machine_id: string; owner_id: string;
    in_present: number; out_present: number;
    in_last: number; out_last: number;
    in_diff: number; out_diff: number;
    seq: number; logged_at: string;
  };
  const [monitorLogs, setMonitorLogs] = useState<MonitorLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [openLogId,   setOpenLogId]   = useState<string | null>(null);
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [editLogIn,    setEditLogIn]   = useState("");
  const [editLogOut,   setEditLogOut]  = useState("");
  const [savingLogEdit, setSavingLogEdit] = useState(false);
  const [openMonthKeys,      setOpenMonthKeys]      = useState<Set<string>>(() => new Set());
  const [downloadingMonthKey, setDownloadingMonthKey] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    const { data } = await sb.from("machine_monitor_logs")
      .select("*").eq("machine_id", machine.id)
      .order("seq", { ascending: false });
    setMonitorLogs((data ?? []) as MonitorLog[]);
    setLogsLoading(false);
  }, [machine.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Always load logs on mount so the hero stat cards have the latest log immediately,
  // regardless of which tab the user opens first.
  useEffect(() => { loadLogs(); }, [loadLogs]);

  useEffect(() => {
    if (monitorSubTab === "logs") loadLogs();
  }, [monitorSubTab, loadLogs]);

  const handleSaveLogEdit = async (log: MonitorLog) => {
    const newIn  = parseFloat(editLogIn);
    const newOut = parseFloat(editLogOut);
    if (isNaN(newIn) || isNaN(newOut)) { toast.error("Enter valid numbers"); return; }
    setSavingLogEdit(true);
    // Recalculate this log's diff against its last values
    const newInDiff  = newIn  - log.in_last;
    const newOutDiff = newOut - log.out_last;
    // Update this log row
    await sb.from("machine_monitor_logs").update({
      in_present: newIn, out_present: newOut,
      in_diff: newInDiff, out_diff: newOutDiff,
    }).eq("id", log.id);
    // Recalculate all subsequent logs in order (seq > this one)
    const { data: subsequent } = await sb.from("machine_monitor_logs")
      .select("*").eq("machine_id", machine.id)
      .gt("seq", log.seq).order("seq", { ascending: true });
    if (subsequent && subsequent.length > 0) {
      // The "last" for the next entry is the present of the current entry
      let runningInLast  = newIn;
      let runningOutLast = newOut;
      for (const s of subsequent as MonitorLog[]) {
        const sInDiff  = s.in_present  - runningInLast;
        const sOutDiff = s.out_present - runningOutLast;
        await sb.from("machine_monitor_logs").update({
          in_last:  runningInLast,  out_last:  runningOutLast,
          in_diff:  sInDiff,        out_diff:  sOutDiff,
        }).eq("id", s.id);
        runningInLast  = s.in_present;
        runningOutLast = s.out_present;
      }
    }
    setSavingLogEdit(false);
    setEditingLogId(null);
    toast.success("Log updated");
    await loadLogs();

    // Sync latest log to machine_monitor
    const { data: latestLogs } = await sb.from("machine_monitor_logs")
      .select("*").eq("machine_id", machine.id)
      .order("seq", { ascending: false }).limit(1);
    const latest = (latestLogs ?? [])[0] as MonitorLog | undefined;
    if (latest) {
      const inEntryStr  = String(latest.in_present);
      const outEntryStr = String(latest.out_present);
      const inTotalStr  = String(latest.in_last);
      const outTotalStr = String(latest.out_last);
      const inDiffStr   = String(latest.in_diff);
      const outDiffStr  = String(latest.out_diff);

      setMonitorIn(inEntryStr);
      setMonitorOut(outEntryStr);
      setMonitorInTotal(inTotalStr);
      setMonitorOutTotal(outTotalStr);
      setMonitorInDiff(inDiffStr);
      setMonitorOutDiff(outDiffStr);

      await saveMonitor({
        in_entry: inEntryStr, in_total: inTotalStr, in_diff: inDiffStr,
        out_entry: outEntryStr, out_total: outTotalStr, out_diff: outDiffStr,
      });
    }
    onMonitorLogChange?.(); // refresh all-screens totals
  };

  const [deletingLogId, setDeletingLogId] = useState<string | null>(null);
  const [confirmDeleteLogId, setConfirmDeleteLogId] = useState<string | null>(null);
  const handleDeleteLog = async (id: string) => {
    setDeletingLogId(id);
    await sb.from("machine_monitor_logs").delete().eq("id", id);
    const remaining = monitorLogs.filter(l => l.id !== id);
    setMonitorLogs(remaining);
    setOpenLogId(null);
    setDeletingLogId(null);
    setConfirmDeleteLogId(null);
    toast.success("Log deleted");

    const latest = remaining[0];
    if (latest) {
      const inEntryStr  = String(latest.in_present);
      const outEntryStr = String(latest.out_present);
      const inTotalStr  = String(latest.in_last);
      const outTotalStr = String(latest.out_last);
      const inDiffStr   = String(latest.in_diff);
      const outDiffStr  = String(latest.out_diff);

      setMonitorIn(inEntryStr);
      setMonitorOut(outEntryStr);
      setMonitorInTotal(inTotalStr);
      setMonitorOutTotal(outTotalStr);
      setMonitorInDiff(inDiffStr);
      setMonitorOutDiff(outDiffStr);

      await saveMonitor({
        in_entry: inEntryStr, in_total: inTotalStr, in_diff: inDiffStr,
        out_entry: outEntryStr, out_total: outTotalStr, out_diff: outDiffStr,
      });
    } else {
      setMonitorIn("");
      setMonitorOut("");
      setMonitorInTotal("");
      setMonitorOutTotal("");
      setMonitorInDiff("");
      setMonitorOutDiff("");
      // No logs left — reset the hero stat cards to zero
      setMonitorCardIn(null);
      setMonitorCardOut(null);

      await saveMonitor({
        in_entry: "", in_total: "", in_diff: "",
        out_entry: "", out_total: "", out_diff: "",
      });
    }
    onMonitorLogChange?.(); // refresh all-screens totals
  };

  // Load monitor row from Supabase on mount
  useEffect(() => {
    let cancelled = false;
    setMonitorLoading(true);
    sb.from("machine_monitor")
      .select("in_entry, in_total, in_diff, out_entry, out_total, out_diff")
      .eq("machine_id", machine.id)
      .eq("owner_id", ownerId)
      .maybeSingle()
      .then(({ data }: { data: any }) => {
        if (cancelled || !data) { setMonitorLoading(false); return; }
        setMonitorIn(data.in_entry   ? String(data.in_entry)   : "");
        setMonitorOut(data.out_entry  ? String(data.out_entry)  : "");
        setMonitorInTotal(data.in_total   ? String(data.in_total)   : "");
        setMonitorOutTotal(data.out_total  ? String(data.out_total)  : "");
        setMonitorInDiff(data.in_diff    ? String(data.in_diff)    : "");
        setMonitorOutDiff(data.out_diff   ? String(data.out_diff)   : "");
        // If Update was previously clicked (in_entry and in_diff both exist), restore card values
        if (data.in_entry && data.in_diff) {
          setMonitorCardIn(parseFloat(data.in_entry) || 0);
          setMonitorCardOut(parseFloat(data.out_entry) || 0);
          setMonitorInputsLocked(true);
          setMonitorUpdateDone(true);
        }
        setMonitorLoading(false);
      });
    return () => { cancelled = true; };
  }, [machine.id, ownerId]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveMonitor = async (fields: {
    in_entry: string; in_total: string; in_diff: string;
    out_entry: string; out_total: string; out_diff: string;
  }) => {
    await sb.from("machine_monitor").upsert({
      machine_id: machine.id,
      owner_id:   ownerId,
      in_entry:   parseFloat(fields.in_entry)   || 0,
      in_total:   parseFloat(fields.in_total)   || 0,
      in_diff:    parseFloat(fields.in_diff)    || 0,
      out_entry:  parseFloat(fields.out_entry)  || 0,
      out_total:  parseFloat(fields.out_total)  || 0,
      out_diff:   parseFloat(fields.out_diff)   || 0,
      updated_at: new Date().toISOString(),
    }, { onConflict: "machine_id,owner_id" });
  };

  // ── Per-month monitor log PDF ────────────────────────────────────────────
  const handleDownloadMonthMonitorPdf = async (monthKey: string, logs: MonitorLog[]) => {
    if (logs.length === 0) return;
    setDownloadingMonthKey(monthKey);
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "mm", format: "a4" });
      const TZ  = "America/Port_of_Spain";
      const fmt2 = (n: number) => n.toFixed(2);
      const sign = (n: number) => (n >= 0 ? "+" : "") + fmt2(n);

      const generated = new Date().toLocaleString("en-GB", {
        hour: "2-digit", minute: "2-digit", hour12: true,
        day: "numeric", month: "short", year: "numeric",
      });
      const [yr, mo] = monthKey.split("-");
      const monthLabel = new Date(Number(yr), Number(mo) - 1, 1)
        .toLocaleDateString("en-GB", { month: "long", year: "numeric" });

      let y = await drawHeader(doc, machine.name, "Machine Monitor Log", monthLabel, generated);
      const bw = RM - LM;

      // Month summary header card — use the FIRST log in the array (most recent = highest seq)
      const latestLog = logs[0];
      const monthProfit = latestLog.in_diff - latestLog.out_diff;

      doc.setFillColor(240, 240, 240);
      doc.roundedRect(LM, y, bw, 28, 2, 2, "F");
      doc.setDrawColor(60, 60, 60); doc.setLineWidth(0.4);
      doc.roundedRect(LM, y, bw, 28, 2, 2, "S");

      // Header card title
      doc.setFont("helvetica", "bold"); doc.setFontSize(7);
      doc.setTextColor(60, 60, 60);
      doc.text("MONTH SUMMARY — " + monthLabel.toUpperCase(), LM + bw / 2, y + 7, { align: "center" });

      const summCols = [
        { label: "Latest IN Present",  value: fmt2(latestLog.in_present)  },
        { label: "Latest OUT Present", value: fmt2(latestLog.out_present) },
        { label: "Latest Profit",      value: sign(monthProfit)           },
      ];
      const cw = bw / 3;
      summCols.forEach((c, i) => {
        const cx = LM + i * cw + cw / 2;
        doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(100, 100, 100);
        doc.text(c.label, cx, y + 14, { align: "center" });
        doc.setFont("helvetica", "bold"); doc.setFontSize(10);
        doc.setTextColor(30, 30, 30);
        doc.text(c.value, cx, y + 23, { align: "center" });
      });
      doc.setTextColor(0, 0, 0);
      y += 34;

      // One card per log entry (newest first = same order as UI)
      for (const log of logs) {
        const cardH = 58;
        if (y + cardH > CONTENT_BOTTOM) { doc.addPage(); y = 20; }

        // Outer card border
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(180, 180, 180); doc.setLineWidth(0.3);
        doc.roundedRect(LM, y, bw, cardH, 2, 2, "FD");

        // Date / time header strip
        const dt = new Date(log.logged_at);
        const dateStr = dt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: TZ });
        const timeStr = dt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: TZ });
        const logProfit = log.in_diff - log.out_diff;

        doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(30, 30, 30);
        doc.text(dateStr, LM + 4, y + 7);
        doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(120, 120, 120);
        doc.text(timeStr, LM + 4, y + 12);

        // IN diff / OUT diff / Profit on the right of the header strip
        doc.setFont("helvetica", "bold"); doc.setFontSize(7.5);
        doc.setTextColor(30, 100, 30);
        doc.text("IN " + sign(log.in_diff), RM - 4, y + 7, { align: "right" });
        doc.setTextColor(140, 40, 40);
        doc.text("OUT " + sign(log.out_diff), RM - 4, y + 13, { align: "right" });
        doc.setTextColor(logProfit >= 0 ? 30 : 160, logProfit >= 0 ? 100 : 30, 30);
        doc.text("PROFIT " + sign(logProfit), RM - 4, y + 19, { align: "right" });

        // Thin divider under header strip
        y += 22;
        doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.2);
        doc.line(LM + 2, y, LM + bw - 2, y);
        y += 4;

        // IN / OUT columns — 3 rows each (Present, Last, Total)
        const colW   = (bw - 8) / 2;
        const leftX  = LM + 4;
        const rightX = LM + 4 + colW + 4;

        const inRows  = [
          { label: "Present", val: fmt2(log.in_present)  },
          { label: "Last",    val: fmt2(log.in_last)     },
          { label: "Total",   val: sign(log.in_diff)     },
        ];
        const outRows = [
          { label: "Present", val: fmt2(log.out_present) },
          { label: "Last",    val: fmt2(log.out_last)    },
          { label: "Total",   val: sign(log.out_diff)    },
        ];

        // Column headers
        doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(30, 30, 30);
        doc.text("IN",  leftX  + colW / 2, y, { align: "center" });
        doc.text("OUT", rightX + colW / 2, y, { align: "center" });
        y += 4;

        inRows.forEach((row, ri) => {
          // cell background
          doc.setFillColor(248, 248, 248);
          doc.setDrawColor(210, 210, 210); doc.setLineWidth(0.15);
          doc.roundedRect(leftX,  y - 3, colW, 6, 1, 1, "FD");
          doc.roundedRect(rightX, y - 3, colW, 6, 1, 1, "FD");

          // labels
          doc.setFont("helvetica", "normal"); doc.setFontSize(5.5); doc.setTextColor(130, 130, 130);
          doc.text(row.label.toUpperCase(),      leftX  + 2, y);
          doc.text(outRows[ri].label.toUpperCase(), rightX + 2, y);

          // values
          doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(30, 30, 30);
          doc.text(row.val,          leftX  + colW - 2, y + 0.5, { align: "right" });
          doc.text(outRows[ri].val,  rightX + colW - 2, y + 0.5, { align: "right" });

          y += 7;
        });

        y += 3; // gap between cards
      }

      addFootersToAllPages(doc);
      const safeMonth = monthLabel.replace(/\s+/g, "-");
      await downloadPdf(`monitor-${machine.name.replace(/\s+/g, "-")}-${safeMonth}.pdf`, doc.output("datauristring"));
    } finally {
      setDownloadingMonthKey(null);
    }
  };

  const handleMonitorUpdate = async () => {
    const inVal   = parseFloat(monitorIn)       || 0;
    const outVal  = parseFloat(monitorOut)      || 0;

    // Always derive "last" from the most recent log in the DB — immune to stale state
    const { data: prevLog } = await sb.from("machine_monitor_logs")
      .select("in_present, out_present")
      .eq("machine_id", machine.id)
      .order("seq", { ascending: false })
      .limit(1)
      .maybeSingle();
    // On first entry (no prev log) use the user-seeded "last" values if they provided them,
    // otherwise fall back to the monitorInTotal state (which will be 0 for a brand-new machine).
    const inLast  = prevLog
      ? (prevLog.in_present  as number)
      : (parseFloat(firstEntryLastIn)  || parseFloat(monitorInTotal)  || 0);
    const outLast = prevLog
      ? (prevLog.out_present as number)
      : (parseFloat(firstEntryLastOut) || parseFloat(monitorOutTotal) || 0);

    const inDiff  = inVal  - inLast;
    const outDiff = outVal - outLast;
    const inDiffStr  = inDiff.toFixed(2);
    const outDiffStr = outDiff.toFixed(2);
    setMonitorInDiff(inDiffStr);
    setMonitorOutDiff(outDiffStr);
    setMonitorSaving(true);
    await saveMonitor({
      in_entry: monitorIn, in_total: String(inLast), in_diff: inDiffStr,
      out_entry: monitorOut, out_total: String(outLast), out_diff: outDiffStr,
    });
    // Insert a log snapshot so the Logs tab records this moment
    const { data: seqData } = await sb.from("machine_monitor_logs")
      .select("seq").eq("machine_id", machine.id).order("seq", { ascending: false }).limit(1).maybeSingle();
    const nextSeq = ((seqData?.seq as number) ?? 0) + 1;
    const { data: newLog } = await sb.from("machine_monitor_logs").insert({
      machine_id:  machine.id,
      owner_id:    ownerId,
      in_present:  inVal,
      out_present: outVal,
      in_last:     inLast,
      out_last:    outLast,
      in_diff:     parseFloat(inDiffStr),
      out_diff:    parseFloat(outDiffStr),
      seq:         nextSeq,
      logged_at:   new Date().toISOString(),
    }).select().maybeSingle();
    if (newLog) setMonitorLogs(prev => [newLog as MonitorLog, ...prev]);
    // Keep monitorInTotal / monitorOutTotal in sync with the last values
    setMonitorInTotal(String(inLast));
    setMonitorOutTotal(String(outLast));
    setMonitorSaving(false);
    setMonitorUpdateDone(true); // block re-click until inputs change
    setMonitorInputsLocked(true); // lock Present inputs until New Entry is clicked
    setMonitorFocus(null); // close numpad
    setMonitorCardIn(inVal);   // show PRESENT IN value in Total Income card
    setMonitorCardOut(outVal); // show PRESENT OUT value in Total Expense card
    // Clear first-entry seed values — no longer needed after first save
    setFirstEntryLastIn("");
    setFirstEntryLastOut("");
    onMonitorLogChange?.(); // refresh all-screens totals
  };

  const handleNewEntry = async () => {
    // The new "last" is always the present value from the most recent log
    const { data: prevLog } = await sb.from("machine_monitor_logs")
      .select("in_present, out_present")
      .eq("machine_id", machine.id)
      .order("seq", { ascending: false })
      .limit(1)
      .maybeSingle();
    const newInTotal  = prevLog ? String(prevLog.in_present)  : (monitorIn  !== "" ? monitorIn  : monitorInTotal);
    const newOutTotal = prevLog ? String(prevLog.out_present) : (monitorOut !== "" ? monitorOut : monitorOutTotal);
    setMonitorInTotal(newInTotal);
    setMonitorOutTotal(newOutTotal);
    setMonitorIn("");
    setMonitorOut("");
    setMonitorInDiff("");
    setMonitorOutDiff("");
    setMonitorFocus("in");
    setMonitorInputsLocked(false);
    setMonitorUpdateDone(false);
    // Keep card values from the latest log — they don't drop when awaiting new entry
    // monitorCardIn/Out stay as-is (don't null them)
    await saveMonitor({
      in_entry: "", in_total: newInTotal, in_diff: "",
      out_entry: "", out_total: newOutTotal, out_diff: "",
    });
  };

  // When bar opens — move box1 into box2 (running total), clear box1 and diffs
  const handleMonitorSessionReset = async () => {
    const newInTotal  = ((parseFloat(monitorInTotal)  || 0) + (parseFloat(monitorIn)  || 0)).toFixed(2);
    const newOutTotal = ((parseFloat(monitorOutTotal) || 0) + (parseFloat(monitorOut) || 0)).toFixed(2);
    setMonitorInTotal(newInTotal);
    setMonitorOutTotal(newOutTotal);
    setMonitorIn("");
    setMonitorOut("");
    setMonitorInDiff("");
    setMonitorOutDiff("");
    await saveMonitor({
      in_entry: "", in_total: newInTotal, in_diff: "",
      out_entry: "", out_total: newOutTotal, out_diff: "",
    });
  };

  // Manual rollup — REPLACE running total with the current new entry, clear new entry and diffs
  const handleMonitorRollup = async () => {
    if (monitorIn === "" && monitorOut === "") return;
    setMonitorSaving(true);
    // Replace running total with new entry value (not accumulate)
    const newInTotal  = monitorIn  !== "" ? monitorIn  : monitorInTotal;
    const newOutTotal = monitorOut !== "" ? monitorOut : monitorOutTotal;
    setMonitorInTotal(newInTotal);
    setMonitorOutTotal(newOutTotal);
    setMonitorIn("");
    setMonitorOut("");
    setMonitorInDiff("");
    setMonitorOutDiff("");
    setMonitorFocus(null);
    await saveMonitor({
      in_entry: "", in_total: newInTotal, in_diff: "",
      out_entry: "", out_total: newOutTotal, out_diff: "",
    });
    setMonitorSaving(false);
  };

  // Detect bar session start changing → reset monitor
  const prevBarSessionRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevBarSessionRef.current !== null && barSessionStart !== prevBarSessionRef.current) {
      handleMonitorSessionReset();
    }
    prevBarSessionRef.current = barSessionStart;
  }, [barSessionStart]); // eslint-disable-line react-hooks/exhaustive-deps


  const [amount, setAmount] = useState("");
  const [amountFocused, setAmountFocused] = useState(false);


  const [busy, setBusy] = useState(false);


  const [deletingId, setDeletingId] = useState<string | null>(null);


  const MACHINE_DELETE_KEY = `machine_last_delete_${machine.id}`;


  const [lastDeletedAt, setLastDeletedAt] = useState<number | null>(() => {


    const v = localStorage.getItem(`machine_last_delete_${machine.id}`);


    return v ? Number(v) : null;


  });


  const [downloading, setDownloading] = useState(false);


  const [downloadedAll, setDownloadedAll] = useState(false);


  const [showDeleteMachine, setShowDeleteMachine] = useState(false);


  const [deletingMachine, setDeletingMachine] = useState(false);


  const confirm = useConfirm();


  // Session anchor — ISO timestamp of the last income entry (machine cleared).


  const [sessionAnchor, setSessionAnchor] = useState<string | null>(null);





  // Proof photo — in-app camera using getUserMedia so music keeps playing


  const [proofFile, setProofFile] = useState<File | null>(null);


  const [proofPreview, setProofPreview] = useState<string | null>(null);


  const [camOpen, setCamOpen] = useState(false);


  const [camStream, setCamStream] = useState<MediaStream | null>(null);


  const videoRef = useRef<HTMLVideoElement>(null);


  const canvasRef = useRef<HTMLCanvasElement>(null);





  const openCam = async () => {


    try {


      // Try rear camera first, fall back to any available camera


      let stream: MediaStream;


      try {


        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { exact: "environment" } }, audio: false });


      } catch {


        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });


      }


      setCamStream(stream);


      setCamOpen(true);


      setTimeout(() => { if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); } }, 50);


    } catch { toast.error("Camera not available"); }


  };





  const closeCam = () => {


    camStream?.getTracks().forEach(t => t.stop());


    setCamStream(null);


    setCamOpen(false);


  };





  const snapPhoto = () => {


    const video = videoRef.current;


    const canvas = canvasRef.current;


    if (!video || !canvas) return;


    canvas.width = video.videoWidth;


    canvas.height = video.videoHeight;


    canvas.getContext("2d")?.drawImage(video, 0, 0);


    canvas.toBlob(blob => {


      if (!blob) return;


      const file = new File([blob], `proof-${Date.now()}.jpg`, { type: "image/jpeg" });


      setProofFile(file);


      setProofPreview(URL.createObjectURL(file));


      closeCam();


    }, "image/jpeg", 0.85);


  };


  // Lightbox — in-app full-screen image viewer


  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);





  // Stop camera stream when component unmounts


  useEffect(() => () => { camStream?.getTracks().forEach(t => t.stop()); }, [camStream]);





  const load = useCallback(async () => {


    setLoading(true);


    const { data } = await sb.from("machine_entries").select("*")


      .eq("machine_id", machine.id).order("entry_date", { ascending: false })


      .order("created_at", { ascending: false });


    const rows = (data ?? []) as MachineEntry[];
    setEntries(rows);

    // Auto-set session anchor to the most recent income entry's created_at.
    // This means session stats always start fresh after the last machine clear.
    const lastIncome = rows.find(e => e.type === "income");
    setSessionAnchor(prev => {
      // Only auto-set on first load; after that it's driven by handleSave resets.
      if (prev !== null) return prev;
      return lastIncome?.created_at ?? null;
    });
    setLoading(false);
  }, [machine.id]);

  // ── Machine Totals (directly from latest log header — no calculations) ──────
  const latestLog = monitorLogs[0];
  const manualPayouts = entries.filter(e => (e.type === "payout" || e.type === "expense")).reduce((s, e) => s + Number(e.amount), 0);

  // Total Income  = latest log's PRESENT IN  (exactly as shown in log)
  // Total Expense = latest log's PRESENT OUT (exactly as shown in log)
  // Total Profit  = latest log header PROFIT (in_diff − out_diff, exactly as shown in log header)
  const totalIncome = latestLog ? latestLog.in_present  : (monitorCardIn  ?? 0);
  const totalPayout = latestLog ? latestLog.out_present : (monitorCardOut ?? 0);
  const totalProfit = latestLog ? (latestLog.in_diff - latestLog.out_diff) : (totalIncome - totalPayout);

  // ── Today's totals (bar_session_start → now) — machine payouts only, not manual expenses ──
  const todayPayouts = barSessionStart
    ? entries.filter(e => e.type === "payout" && new Date(e.created_at) >= new Date(barSessionStart)).reduce((s, e) => s + Number(e.amount), 0)
    : entries.filter(e => e.type === "payout").reduce((s, e) => s + Number(e.amount), 0);

  const todayIncome = barSessionStart
    ? entries.filter(e => e.type === "income" && new Date(e.created_at) >= new Date(barSessionStart)).reduce((s, e) => s + Number(e.amount), 0)
    : entries.filter(e => e.type === "income").reduce((s, e) => s + Number(e.amount), 0);

  const todayProfit = todayIncome - todayPayouts;





  useEffect(() => { load(); }, [load]);





  // Realtime — entries for this machine + float sessions so the second row stays live


  useEffect(() => {


    const ch = supabase.channel(`machine-detail-${machine.id}`)


      .on("postgres_changes", { event: "*", schema: "public", table: "machine_entries",


        filter: `machine_id=eq.${machine.id}` }, () => load())


      .subscribe();


    return () => { supabase.removeChannel(ch); };


  }, [machine.id, load]);











  // ── Session totals — machine payouts only since float was last set, NOT manual expenses.
  // Manual expenses only count in the all-screens hero totals.
  const sessionPayouts = entries
    .filter(e => e.type === "payout" && (!floatSession || new Date(e.created_at) >= new Date(floatSession.set_at)))
    .reduce((s, e) => s + Number(e.amount), 0);


  const sessionIncome = entries


    .filter(e => e.type === "income" && (!floatSession || new Date(e.created_at) >= new Date(floatSession.set_at)))


    .reduce((s, e) => s + Number(e.amount), 0);


  const sessionProfit = sessionIncome - sessionPayouts;





  // ── Float session payout — payouts for THIS machine since float was last set.


  // Resets to $0 each time the float is updated. Feeds into the main page remaining calc.


  const floatSessionPayout = floatSession


    ? entries


        .filter(e => e.type === "payout" && new Date(e.created_at) >= new Date(floatSession.set_at))


        .reduce((s, e) => s + Number(e.amount), 0)


    : null;





  const handleSave = async () => {


    const val = parseFloat(amount);


    if (isNaN(val) || val <= 0) { toast.error("Enter a valid amount"); return; }





    // Block payout if no float has been set


    if (tab === "payout" && remainingFloat === null) {


      toast.error("Set a float before recording an expense");


      return;


    }





    // Block payout if the entered amount exceeds the remaining float


    if (tab === "payout" && remainingFloat !== null && Math.round(val * 100) / 100 > Math.round(remainingFloat * 100) / 100) {


      toast.error(`Expense $${val.toFixed(2)} exceeds remaining float $${remainingFloat.toFixed(2)}`);


      return;


    }





    // Confirm before saving a payout


    if (tab === "payout") {


      const ok = await confirm({


        title: "Save Expense?",


        description: `Confirm saving an expense of $${val.toFixed(2)} for ${machine.name}.`,


      });


      if (!ok) return;


    }


    // Confirm before saving income


    if (tab === "income") {


      const ok = await confirm({


        title: "Add Income?",


        description: `Confirm recording income of $${val.toFixed(2)} for ${machine.name}.`,


      });


      if (!ok) return;


    }





    setBusy(true);


    const now = new Date();





    // Upload proof photo if captured


    let proof_image_url: string | null = null;


    if (proofFile) {


      const ext = proofFile.name.split(".").pop() || "jpg";


      const path = `machine-payouts/${ownerId}/${machine.id}/${now.getTime()}.${ext}`;


      const { error: upErr } = await supabase.storage


        .from("product-images")


        .upload(path, proofFile, { upsert: false });


      if (upErr) {


        toast.error("Photo upload failed: " + upErr.message);


        setBusy(false);


        return;


      }


      proof_image_url = supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;


    }





    const { error } = await sb.from("machine_entries").insert({


      machine_id: machine.id, owner_id: ownerId,


      type: tab as "payout" | "income",


      amount: val, note: null,


      entry_date: now.toISOString().slice(0, 10),


      created_at: now.toISOString(),


      cashier_id: profile!.id,


      cashier_name: profile!.username ?? null,


      proof_image_url,


    });


    setBusy(false);


    if (error) { toast.error(error.message); return; }





    if (tab === "income") {


    }





    // Clear proof photo state


    setProofFile(null);


    setProofPreview(null);





    toast.success(tab === "payout" ? "Payout recorded" : "Cash In recorded");





    // Fire local payout alert only on the owner's device — not cashier devices


    if (tab === "payout" && profile.role === "owner") {


      const alerts = loadAlertSettings(ownerId);


      await checkAndFirePayoutAlert(val, machine.name, alerts, (to) => navigate({ to }), ownerId);


    }





    setAmount("");


    load();


  };





  const handleDelete = async (id: string) => {


    setDeletingId(id);


    // Add cashier_id filter so RLS policy matches for cashier deletes


    const query = isCashier


      ? sb.from("machine_entries").delete().eq("id", id).eq("cashier_id", profile.id)


      : sb.from("machine_entries").delete().eq("id", id);


    const { error } = await query;


    setDeletingId(null);


    if (error) { toast.error("Delete failed: " + error.message); return; }


    // Store delete timestamp so button won't jump to next record


    const now = Date.now();


    localStorage.setItem(MACHINE_DELETE_KEY, String(now));


    setLastDeletedAt(now);


    toast.success("Record deleted");


    load();


  };





  const handleDownloadPdf = async () => {


    // Download ALL entries for this machine


    setDownloading(true);


    try {


      const { jsPDF } = await import("jspdf");


      const doc = new jsPDF({ unit: "mm", format: "a4" });


      const generated = new Date().toLocaleString("en-GB", {


        hour: "2-digit", minute: "2-digit", hour12: true,


        day: "numeric", month: "short", year: "numeric",


      });


      let y = await drawHeader(doc, machine.name, "Machine Records", "Full History", generated);


      const bw = RM - LM;


      doc.setFillColor(245, 240, 230);


      doc.roundedRect(LM, y, bw, 26, 2, 2, "F");


      doc.setDrawColor(232, 146, 42); doc.setLineWidth(0.4);


      doc.roundedRect(LM, y, bw, 26, 2, 2, "S");


      const cols = [


        { label: "Total Payout", value: "-$" + fmt(totalPayout), r: 180, g: 40,  b: 40 },


        { label: "Total Cash In", value: "+$" + fmt(totalIncome), r: 40,  g: 140, b: 40 },


        { label: "Total Profit", value: (totalProfit >= 0 ? "+" : "") + "$" + fmt(totalProfit),


          r: totalProfit >= 0 ? 40 : 180, g: totalProfit >= 0 ? 140 : 40, b: 40 },


      ];


      const cw = bw / 3;


      cols.forEach((c, i) => {


        const cx = LM + i * cw + cw / 2;


        doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(100, 100, 100);


        doc.text(c.label, cx, y + 10, { align: "center" });


        doc.setFont("helvetica", "bold"); doc.setFontSize(9);


        doc.setTextColor(c.r, c.g, c.b);


        doc.text(c.value, cx, y + 19, { align: "center" });


      });


      doc.setTextColor(0, 0, 0); y += 32;


      doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(130, 130, 130);


      doc.text("DATE / TIME", LM, y); doc.text("TYPE", LM + 100, y); doc.text("AMOUNT", RM, y, { align: "right" });


      y += 3; doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.2); doc.line(LM, y, RM, y); y += 5;


      doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(0, 0, 0);


      const allSorted = [...entries].sort((a, b) => b.created_at.localeCompare(a.created_at));


      allSorted.forEach((e) => {


        if (y > CONTENT_BOTTOM) { doc.addPage(); y = 20; }


        const dateStr = new Date(e.created_at).toLocaleString("en-GB", {


          day: "numeric", month: "short", year: "numeric",


          hour: "2-digit", minute: "2-digit", hour12: true,


        });


        doc.setFont("helvetica", "bold"); doc.setTextColor(0, 0, 0);


        doc.text(dateStr, LM, y);


        doc.setTextColor(e.type === "payout" ? 180 : 40, e.type === "payout" ? 40 : 140, 40);


        doc.text(e.type.toUpperCase(), LM + 100, y);


        doc.text((e.type === "payout" ? "-" : "+") + "$" + fmt(Number(e.amount)), RM, y, { align: "right" });


        doc.setTextColor(0, 0, 0); doc.setFont("helvetica", "normal"); y += 5;


        if (e.note) {


          doc.setFontSize(8); doc.setTextColor(100, 100, 100);


          doc.text("  " + e.note, LM, y); doc.setFontSize(9); doc.setTextColor(0, 0, 0); y += 4;


        }


        doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.1); doc.line(LM, y, RM, y); y += 4;


      });


      addFootersToAllPages(doc);


      await downloadPdf(`machine-${machine.name.replace(/\s+/g, "-")}-all.pdf`, doc.output("datauristring"));


      toast.success("PDF saved");


      setDownloadedAll(true);


      setTimeout(() => setDownloadedAll(false), 5000);


    } catch (err: any) { toast.error("PDF failed: " + err?.message); }


    finally { setDownloading(false); }


  };





  const handleDownloadMonthPdf = async (monthKey: string, monthEntries: MachineEntry[]) => {


    try {


      const { jsPDF } = await import("jspdf");


      const doc = new jsPDF({ unit: "mm", format: "a4" });


      const generated = new Date().toLocaleString("en-GB", {


        hour: "2-digit", minute: "2-digit", hour12: true,


        day: "numeric", month: "short", year: "numeric",


      });


      const [yr, mo] = monthKey.split("-");


      const monthLabel = new Date(Number(yr), Number(mo) - 1, 1)


        .toLocaleDateString("en-GB", { month: "long", year: "numeric" });


      let y = await drawHeader(doc, machine.name, "Machine Records", monthLabel, generated);


      const bw = RM - LM;


      const mPayout = monthEntries.filter(e => e.type === "payout").reduce((s, e) => s + Number(e.amount), 0);


      const mIncome = monthEntries.filter(e => e.type === "income").reduce((s, e) => s + Number(e.amount), 0);


      const mExpense = monthEntries.filter(e => e.type === "expense").reduce((s, e) => s + Number(e.amount), 0);


      const mProfit = mIncome - mPayout - mExpense;


      doc.setFillColor(245, 240, 230);


      doc.roundedRect(LM, y, bw, 26, 2, 2, "F");


      doc.setDrawColor(232, 146, 42); doc.setLineWidth(0.4);


      doc.roundedRect(LM, y, bw, 26, 2, 2, "S");


      const cols = [


        { label: "Month Payout", value: "-$" + fmt(mPayout), r: 180, g: 40,  b: 40 },


        { label: "Month Income", value: "+$" + fmt(mIncome), r: 40,  g: 140, b: 40 },


        { label: "Month Profit", value: (mProfit >= 0 ? "+" : "") + "$" + fmt(mProfit),


          r: mProfit >= 0 ? 40 : 180, g: mProfit >= 0 ? 140 : 40, b: 40 },


      ];


      const cw = bw / 3;


      cols.forEach((c, i) => {


        const cx = LM + i * cw + cw / 2;


        doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(100, 100, 100);


        doc.text(c.label, cx, y + 10, { align: "center" });


        doc.setFont("helvetica", "bold"); doc.setFontSize(9);


        doc.setTextColor(c.r, c.g, c.b);


        doc.text(c.value, cx, y + 19, { align: "center" });


      });


      doc.setTextColor(0, 0, 0); y += 32;


      doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(130, 130, 130);


      doc.text("DATE / TIME", LM, y); doc.text("TYPE", LM + 100, y); doc.text("AMOUNT", RM, y, { align: "right" });


      y += 3; doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.2); doc.line(LM, y, RM, y); y += 5;


      doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(0, 0, 0);


      monthEntries.forEach((e) => {


        if (y > CONTENT_BOTTOM) { doc.addPage(); y = 20; }


        const dateStr = new Date(e.created_at).toLocaleString("en-GB", {


          day: "numeric", month: "short", year: "numeric",


          hour: "2-digit", minute: "2-digit", hour12: true,


        });


        doc.setFont("helvetica", "bold"); doc.setTextColor(0, 0, 0);


        doc.text(dateStr, LM, y);


        doc.setTextColor(e.type === "payout" ? 180 : 40, e.type === "payout" ? 40 : 140, 40);


        doc.text(e.type.toUpperCase(), LM + 100, y);


        doc.text((e.type === "payout" ? "-" : "+") + "$" + fmt(Number(e.amount)), RM, y, { align: "right" });


        doc.setTextColor(0, 0, 0); doc.setFont("helvetica", "normal"); y += 5;


        if (e.note) {


          doc.setFontSize(8); doc.setTextColor(100, 100, 100);


          doc.text("  " + e.note, LM, y); doc.setFontSize(9); doc.setTextColor(0, 0, 0); y += 4;


        }


        doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.1); doc.line(LM, y, RM, y); y += 4;


      });


      addFootersToAllPages(doc);


      const safeMonth = monthLabel.replace(/\s+/g, "-");


      await downloadPdf(`machine-${machine.name.replace(/\s+/g, "-")}-${safeMonth}.pdf`, doc.output("datauristring"));


      toast.success("PDF saved");


    } catch (err: any) { toast.error("PDF failed: " + err?.message); }


  };





  const handleDeleteMachine = async (wipeRecords: boolean) => {


    setDeletingMachine(true);


    if (wipeRecords) {


      // "Delete Everything" — explicitly wipe entries before removing the machine


      await sb.from("machine_entries").delete().eq("machine_id", machine.id);


    }


    // Delete the machine card (entries are NOT cascaded — they survive with machine_id = null)


    const { error } = await sb.from("machines").delete().eq("id", machine.id);


    setDeletingMachine(false);


    if (error) { toast.error(error.message); return; }


    toast.success(`${machine.name} deleted`);


    setShowDeleteMachine(false);


    onDeleted();


  };





  return (


    <div className="fixed inset-0 z-[9999] flex flex-col overflow-hidden"


      style={{ background: "var(--background)" }}>


      {/* Constrain content to max-w-2xl on tablets/desktop */}


      <div className="flex flex-col h-full w-full max-w-2xl mx-auto">


      {/* Header */}


      <div className="shrink-0 flex items-center gap-3 px-3 border-b border-border bg-background/95 backdrop-blur z-10"


        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.5rem)", paddingBottom: "0.5rem" }}>


        <button onClick={onBack}


          className="h-10 px-4 rounded-2xl flex items-center justify-center gap-1.5 bg-muted active:scale-95 transition shrink-0 font-black text-sm">


          <ChevronLeft className="h-4 w-4" />


          {screenNumber}


        </button>


        <h1 className="font-black text-lg flex-1 truncate">


          {machine.name}


        </h1>


        {!isCashier && (


          <button onClick={() => setShowDeleteMachine(true)}


            className="h-9 w-9 rounded-full flex items-center justify-center bg-red-600 active:scale-95 transition shrink-0">


            <Trash2 className="h-4 w-4 text-white" />


          </button>


        )}


      </div>





      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-4" style={{ WebkitOverflowScrolling: "touch", overscrollBehavior: "contain" }}>


        {/* Hero */}


        <section className="rounded-3xl p-5 relative overflow-hidden space-y-3"


          style={{ background: "var(--gradient-hero)", boxShadow: "var(--shadow-glow)" }}>


          <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />


          {/* Machine title */}


          <div className="relative flex items-center gap-2">


            <Gamepad2 className="h-4 w-4 text-primary-foreground/70 shrink-0" />


            <span className="font-black text-base text-primary-foreground leading-tight truncate">


              {machine.name}


            </span>


          </div>


          {/* Float Set / Remaining — top */}
          <div className="relative grid grid-cols-2 gap-2">


            <SmallStat label={t("session_float", "Float Set")} value={floatSession ? "$" + fmtWhole(Number(floatSession.amount)) : "$0"} color="#fbbf24" />


            <SmallStat label={t("remaining", "Remaining")}


              value={(remainingFloat === null ? 0 : remainingFloat) >= 0 ? "" + "$" + fmtWhole(Math.abs(remainingFloat ?? 0)) : "-$" + fmtWhole(Math.abs(remainingFloat ?? 0))}


              color={(remainingFloat ?? 0) >= 0 ? "#86efac" : "#fca5a5"} />


          </div>


          {/* Lifetime totals — owner only */}
          {/* Session stats */}
          <div className="relative grid grid-cols-3 gap-2">
            <SmallStat label={t("session_income", "Session Cash In")}
              value={"$" + fmtWhole(sessionIncome)}
              color="#86efac" />
            <SmallStat label={t("session_payout", "Session Payout")}
              value={"$" + fmtWhole(sessionPayouts)}
              color="#fca5a5" />
            <SmallStat label={t("session_profit", "Session Profit")}
              value={(sessionProfit >= 0 ? "+" : "") + "$" + fmtWhole(sessionProfit)}
              color={sessionProfit >= 0 ? "#86efac" : "#fca5a5"} />
          </div>

          {/* Today's stats — owner and manager */}
          {!isCashier && (isOwner || isManager) && (
          <div className="relative grid grid-cols-3 gap-2">
            <StatCard label={t("today_income", "Today's Cash In")} value={"$" + fmtWhole(todayIncome)} color="#86efac" />
            <StatCard label={t("today_payout", "Today's Payout")} value={"$" + fmtWhole(todayPayouts)} color="#fca5a5" />
            <StatCard label={t("today_profit", "Today's Profit")}
              value={(todayProfit >= 0 ? "+" : "") + "$" + fmtWhole(todayProfit)}
              color={todayProfit >= 0 ? "#86efac" : "#fca5a5"} />
          </div>
          )}

          {/* Total / All-time stats — owner only */}
          {!isCashier && isOwner && (
          <div className="relative grid grid-cols-3 gap-2">
            <StatCard label={t("all_time_income", "Total Cash In")} value={"$" + fmtWhole(totalIncome)} color="#86efac" />
            <StatCard label={t("all_time_payout", "Total Payouts")} value={"$" + fmtWhole(totalPayout)} color="#fca5a5" />
            <StatCard label={t("all_time_profit", "Profit")}
              value={(totalProfit >= 0 ? "+" : "") + "$" + fmtWhole(totalProfit)}
              color={totalProfit >= 0 ? "#86efac" : "#fca5a5"} />
          </div>
          )}


        </section>





        {/* Tabs */}


        <div className="flex gap-1 rounded-2xl p-1" style={{ background: "var(--gradient-card)" }}>


          {([...(isOwner || isManager ? ["income"] : []), "payout", ...(isOwner || isManager ? ["history"] : []), ...(isOwner || isManager ? ["monitor"] : [])] as ("payout" | "income" | "history" | "monitor")[]).map((tabKey) => (

            <button key={tabKey} onClick={() => { if (tabKey === "payout" && !barIsOpen) return; setTab(tabKey); }}
              disabled={tabKey === "payout" && !barIsOpen}
              className={`flex-1 py-2.5 rounded-xl text-xs font-black capitalize transition ${
                tab === tabKey ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              } disabled:opacity-40 disabled:cursor-not-allowed`}
              style={tab === tabKey ? { background: "var(--gradient-hero)" } : {}}>
              {tabKey === "payout" ? t("payout", "Payout") : tabKey === "income" ? t("income", "Income") : tabKey === "history" ? t("history", "History") : "Meters"}
            </button>

          ))}


        </div>





        {/* Payout / Income entry form */}


        {(tab === "payout" || tab === "income") && (


          <div className="rounded-2xl border border-border p-4 space-y-3"


            style={{ background: "var(--gradient-card)" }}>


            <h2 className="font-black text-sm">


              {tab === "payout" ? t("save_payout", "Record Payout") : t("save_income", "Record Income")}


            </h2>


            {/* Tappable amount display — tap to show/hide numpad */}


            {!camOpen && (


              <>


            <button
              type="button"
              onClick={() => setAmountFocused(f => !f)}
              className="w-full rounded-2xl px-5 py-4 text-center transition"
              style={{
                background: amountFocused ? "oklch(0.22 0.06 65 / 0.4)" : "oklch(0.18 0.04 60)",
                border: amountFocused ? "1px solid oklch(0.60 0.18 65)" : "1px solid oklch(0.28 0.08 60)",
              }}>
              <span className="font-black text-4xl" style={{ color: "oklch(0.82 0.18 65)" }}>
                ${amount === "" ? "0" : amount}
              </span>
            </button>


            {amountFocused && (
            <div className="grid grid-cols-3 gap-2">
              {["7","8","9","4","5","6","1","2","3"].map(k => (
                <button key={k} type="button"
                  onClick={() => {
                    const parts = amount.split(".");
                    if (parts[1] !== undefined && parts[1].length >= 2) return;
                    setAmount(prev => prev + k);
                  }}
                  className="rounded-2xl py-4 text-xl font-black active:scale-95 transition"
                  style={{ background: "oklch(0.20 0.05 60)", color: "#fff" }}>
                  {k}
                </button>
              ))}
              <button type="button"
                onClick={() => { if (!amount.includes(".")) setAmount(prev => prev + "."); }}
                className="rounded-2xl py-4 text-xl font-black active:scale-95 transition"
                style={{ background: "oklch(0.20 0.05 60)", color: "#fff" }}>
                .
              </button>
              <button type="button"
                onClick={() => {
                  const parts = amount.split(".");
                  if (parts[1] !== undefined && parts[1].length >= 2) return;
                  setAmount(prev => prev + "0");
                }}
                className="rounded-2xl py-4 text-xl font-black active:scale-95 transition"
                style={{ background: "oklch(0.20 0.05 60)", color: "#fff" }}>
                0
              </button>
              <button type="button"
                onClick={() => setAmount(prev => prev.slice(0, -1))}
                className="rounded-2xl py-4 text-xl font-black active:scale-95 transition"
                style={{ background: "oklch(0.20 0.05 60)", color: "oklch(0.75 0.15 65)" }}>
                ⌫
              </button>
            </div>
            )}


              </>


            )}





            {/* Proof photo — payout only, camera view */}


            {tab === "payout" && (


              <div>


                <canvas ref={canvasRef} className="hidden" />


                {camOpen ? (


                  <div className="rounded-2xl overflow-hidden border-2 border-amber-500/40 relative"


                    style={{ background: "#000" }}>


                    <video ref={videoRef} autoPlay playsInline muted


                      className="w-full max-h-56 object-cover" />


                    <div className="flex gap-2 p-2">


                      <button type="button" onClick={closeCam}


                        className="flex-1 h-10 rounded-xl font-black text-sm bg-muted text-muted-foreground active:scale-95 transition">


                        Cancel


                      </button>


                      <button type="button" onClick={snapPhoto}


                        className="flex-1 h-10 rounded-xl font-black text-sm text-white active:scale-95 transition"


                        style={{ background: "var(--gradient-hero)" }}>


                        📸 Snap


                      </button>


                    </div>


                  </div>


                ) : proofPreview ? (


                  <div className="relative rounded-2xl overflow-hidden border-2 border-green-500/40"


                    style={{ background: "oklch(0.18 0.04 145 / 0.3)" }}>


                    <img src={proofPreview} alt="proof" className="w-full max-h-40 object-cover" />


                    <button type="button"


                      onClick={() => { setProofFile(null); setProofPreview(null); }}


                      className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/60 flex items-center justify-center active:scale-90 transition">


                      <X className="h-3.5 w-3.5 text-white" />


                    </button>


                    <div className="px-3 py-1.5 flex items-center gap-1.5">


                      <div className="h-2 w-2 rounded-full bg-green-400" />


                      <span className="text-xs font-bold text-green-400">Photo captured</span>


                    </div>


                  </div>


                ) : null}


              </div>


            )}





            {/* Proof photo + Save — side by side on payout tab */}


            {tab === "payout" ? (


              <div className="flex gap-2">


                {/* Take Proof Photo button — left */}


                {!camOpen && !proofPreview && (


                  <button type="button" onClick={openCam}


                    className="flex-1 h-14 rounded-2xl flex items-center justify-center gap-2 font-black text-sm active:scale-95 transition border-2 border-dashed"


                    style={{ borderColor: "oklch(0.38 0.08 60)", color: "oklch(0.65 0.12 65)", background: "oklch(0.18 0.03 60 / 0.4)" }}>


                    <Camera className="h-4 w-4" />


                    Proof Photo


                  </button>


                )}


                {proofPreview && (


                  <button type="button" onClick={() => { setProofFile(null); setProofPreview(null); }}


                    className="flex-1 h-14 rounded-2xl flex items-center justify-center gap-2 font-black text-sm active:scale-95 transition border-2 border-green-500/40"


                    style={{ background: "oklch(0.18 0.04 145 / 0.3)", color: "#4ade80" }}>


                    <Camera className="h-4 w-4" />


                    ✓ Photo


                  </button>


                )}


                {/* Save Expense button — right */}


                {(() => {


                  const enteredVal = Math.round((parseFloat(amount) || 0) * 100) / 100;


                  const noFloat = remainingFloat === null;


                  const overFloat = !noFloat && enteredVal > 0 && enteredVal > Math.round(remainingFloat! * 100) / 100;


                  const blocked = noFloat || overFloat;


                  return (


                    <Button onClick={handleSave} disabled={busy || !amount || blocked}


                      className="flex-1 h-14 font-black text-base rounded-2xl"


                      style={{ background: blocked ? "oklch(0.30 0.04 60)" : "var(--gradient-hero)", color: "var(--primary-foreground)" }}


                      title={noFloat ? "Set a float first" : overFloat ? `Amount exceeds remaining float ($${remainingFloat?.toFixed(2)})` : undefined}>


                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : noFloat ? "Set Float First" : overFloat ? "Exceeds Float" : tab === "payout" ? "Save Payout" : "Save Cash In"}


                    </Button>


                  );


                })()}


              </div>


            ) : (


              <Button onClick={handleSave} disabled={busy || !amount}


                className="w-full h-12 font-black text-base"


                style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}>


                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}


              </Button>


            )}


          </div>


        )}





        {/* History tab */}


        {tab === "history" && (


          <HistoryMonthAccordion

            entries={isManager && barSessionStart ? entries.filter(e => new Date(e.created_at) >= new Date(barSessionStart)) : entries}


            loading={loading}


            downloading={downloading}


            deletingId={deletingId}


            lastDeletedAt={lastDeletedAt}


            floatSession={floatSession}


            onDownloadAll={handleDownloadPdf}


            onDownloadMonth={handleDownloadMonthPdf}


            onDelete={handleDelete}


            onLightbox={(url) => setLightboxUrl(url)}


            isCashier={isCashier}


            ownerId={ownerId}


            currentBarSession={barSessionStart}


            barOpen={barIsOpen}


          />


        )}


        {/* ── Monitor Tab ─────────────────────────────────────────────────── */}
        {tab === "monitor" && (isOwner || isManager) && (
          <div className="space-y-4">

            {/* Sub-tab: Monitor / Logs */}
            <div className="flex gap-1 rounded-2xl p-1" style={{ background: "var(--gradient-card)" }}>
              {(["monitor", "logs"] as const).map(st => (
                <button key={st} onClick={() => setMonitorSubTab(st)}
                  className={`flex-1 py-2 rounded-xl text-xs font-black capitalize transition ${monitorSubTab === st ? "text-primary-foreground" : "text-muted-foreground"}`}
                  style={monitorSubTab === st ? { background: "var(--gradient-hero)" } : {}}>
                  {st === "monitor" ? "Update" : "Logs"}
                </button>
              ))}
            </div>

            {/* ── Monitor sub-tab ── */}
            {monitorSubTab === "monitor" && (
            <div className="rounded-2xl border border-border p-4" style={{ background: "var(--gradient-card)" }}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-black text-sm tracking-wide uppercase" style={{ color: "oklch(0.82 0.18 65)" }}>
                  Machine Monitor
                </h2>
                <button
                  onClick={handleNewEntry}
                  disabled={monitorSaving}
                  className="h-8 px-3 rounded-xl font-black text-[11px] uppercase tracking-wide transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                  style={{ background: "oklch(0.22 0.04 60)", color: "oklch(0.82 0.18 65)", border: "1px solid oklch(0.35 0.10 60)" }}
                >
                  <Plus className="h-3 w-3" /> New Entry
                </button>
              </div>

              {monitorLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
              ) : (
              <>
              {/* ── First-entry helper notice ── */}
              {monitorLogs.length === 0 && (
                <div className="mb-3 rounded-xl px-3 py-2.5 text-[11px] font-bold leading-snug"
                  style={{ background: "oklch(0.20 0.05 60)", color: "oklch(0.82 0.18 65)", border: "1px solid oklch(0.35 0.10 60)" }}>
                  First entry — tap <span style={{ color: "oklch(0.72 0.18 145)" }}>Last</span> to seed prior values for an existing machine, or leave blank for a brand-new machine.
                </div>
              )}
              {(() => {
                const isFirstEntry = monitorLogs.length === 0;
                // For the numpad, focus can now be "in" | "out" | "lastIn" | "lastOut"
                type MonFocus = "in" | "out" | "lastIn" | "lastOut";
                const focus = monitorFocus as MonFocus | null;

                // Helpers that route numpad input to the right state setter
                const focusSetter = (f: MonFocus): ((v: string) => void) => {
                  if (f === "in")     return setMonitorIn;
                  if (f === "out")    return setMonitorOut;
                  if (f === "lastIn") return setFirstEntryLastIn;
                  return setFirstEntryLastOut;
                };
                const focusVal = (f: MonFocus): string => {
                  if (f === "in")     return monitorIn;
                  if (f === "out")    return monitorOut;
                  if (f === "lastIn") return firstEntryLastIn;
                  return firstEntryLastOut;
                };
                const focusColor = (f: MonFocus) =>
                  f === "in" || f === "lastIn" ? "oklch(0.72 0.18 145)" : "oklch(0.65 0.22 25)";
                const focusLabel = (f: MonFocus) => {
                  if (f === "in")     return "Present IN";
                  if (f === "out")    return "Present OUT";
                  if (f === "lastIn") return "Last IN";
                  return "Last OUT";
                };

                // Profit preview — when first entry use the editable last fields as baseline
                const effectiveLastIn  = isFirstEntry ? (parseFloat(firstEntryLastIn)  || 0) : (parseFloat(monitorInTotal)  || 0);
                const effectiveLastOut = isFirstEntry ? (parseFloat(firstEntryLastOut) || 0) : (parseFloat(monitorOutTotal) || 0);
                const calcInDiff  = monitorIn  !== "" ? (parseFloat(monitorIn)  || 0) - effectiveLastIn  : (monitorInDiff  !== "" ? parseFloat(monitorInDiff)  : null);
                const calcOutDiff = monitorOut !== "" ? (parseFloat(monitorOut) || 0) - effectiveLastOut : (monitorOutDiff !== "" ? parseFloat(monitorOutDiff) : null);
                const profitVal   = (calcInDiff !== null || calcOutDiff !== null)
                  ? (calcInDiff ?? 0) - (calcOutDiff ?? 0) : null;

                return (
                  <>
                  <div className="grid grid-cols-2 gap-4">

                    {/* ── IN column ── */}
                    <div className="space-y-3">
                      <p className="text-xs font-black text-center uppercase tracking-widest" style={{ color: "oklch(0.72 0.18 145)" }}>IN</p>

                      {/* Present IN — always editable when not locked */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Present</label>
                        <button
                          onClick={() => !monitorInputsLocked && setMonitorFocus(focus === "in" ? null : "in")}
                          disabled={monitorInputsLocked}
                          className="w-full rounded-xl border px-3 py-2.5 text-sm font-bold text-center transition disabled:opacity-50 disabled:cursor-not-allowed"
                          style={{
                            background: monitorInputsLocked ? "var(--muted)" : focus === "in" ? "oklch(0.22 0.06 145 / 0.3)" : "var(--background)",
                            borderColor: monitorInputsLocked ? "var(--border)" : focus === "in" ? "oklch(0.72 0.18 145)" : "var(--border)",
                            color: "oklch(0.72 0.18 145)",
                          }}>
                          {monitorIn || "0"}
                        </button>
                      </div>

                      {/* Last IN — editable on first entry, read-only otherwise */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase tracking-wider"
                          style={{ color: isFirstEntry ? "oklch(0.72 0.18 145 / 0.8)" : "var(--muted-foreground)" }}>
                          Last{isFirstEntry ? " ✎" : ""}
                        </label>
                        {isFirstEntry ? (
                          <button
                            onClick={() => !monitorInputsLocked && setMonitorFocus(focus === "lastIn" ? null : "lastIn")}
                            disabled={monitorInputsLocked}
                            className="w-full rounded-xl border px-3 py-2.5 text-sm font-bold text-center transition disabled:opacity-50 disabled:cursor-not-allowed"
                            style={{
                              background: monitorInputsLocked ? "var(--muted)" : focus === "lastIn" ? "oklch(0.22 0.06 145 / 0.3)" : "var(--background)",
                              borderColor: monitorInputsLocked ? "var(--border)" : focus === "lastIn" ? "oklch(0.72 0.18 145)" : "oklch(0.72 0.18 145 / 0.35)",
                              color: "oklch(0.72 0.18 145)",
                            }}>
                            {firstEntryLastIn || <span style={{ color: "var(--muted-foreground)" }}>optional</span>}
                          </button>
                        ) : (
                          <div className="w-full rounded-xl border border-border/50 bg-muted/30 px-3 py-2.5 text-sm font-bold text-center select-none"
                            style={{ color: "oklch(0.72 0.18 145)" }}>
                            {monitorInTotal || "—"}
                          </div>
                        )}
                      </div>

                      {/* Total diff */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Total</label>
                        <div className="w-full rounded-xl border border-border/50 bg-muted/30 px-3 py-2.5 text-sm font-bold text-center select-none"
                          style={{ color: calcInDiff != null && calcInDiff >= 0 ? "oklch(0.72 0.18 145)" : "oklch(0.65 0.22 25)" }}>
                          {calcInDiff == null ? "—" : `${calcInDiff >= 0 ? "+" : ""}${calcInDiff.toFixed(2)}`}
                        </div>
                      </div>
                    </div>

                    {/* ── OUT column ── */}
                    <div className="space-y-3">
                      <p className="text-xs font-black text-center uppercase tracking-widest" style={{ color: "oklch(0.65 0.22 25)" }}>OUT</p>

                      {/* Present OUT — always editable when not locked */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Present</label>
                        <button
                          onClick={() => !monitorInputsLocked && setMonitorFocus(focus === "out" ? null : "out")}
                          disabled={monitorInputsLocked}
                          className="w-full rounded-xl border px-3 py-2.5 text-sm font-bold text-center transition disabled:opacity-50 disabled:cursor-not-allowed"
                          style={{
                            background: monitorInputsLocked ? "var(--muted)" : focus === "out" ? "oklch(0.22 0.05 25 / 0.3)" : "var(--background)",
                            borderColor: monitorInputsLocked ? "var(--border)" : focus === "out" ? "oklch(0.65 0.22 25)" : "var(--border)",
                            color: "oklch(0.65 0.22 25)",
                          }}>
                          {monitorOut || "0"}
                        </button>
                      </div>

                      {/* Last OUT — editable on first entry, read-only otherwise */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase tracking-wider"
                          style={{ color: isFirstEntry ? "oklch(0.65 0.22 25 / 0.8)" : "var(--muted-foreground)" }}>
                          Last{isFirstEntry ? " ✎" : ""}
                        </label>
                        {isFirstEntry ? (
                          <button
                            onClick={() => !monitorInputsLocked && setMonitorFocus(focus === "lastOut" ? null : "lastOut")}
                            disabled={monitorInputsLocked}
                            className="w-full rounded-xl border px-3 py-2.5 text-sm font-bold text-center transition disabled:opacity-50 disabled:cursor-not-allowed"
                            style={{
                              background: monitorInputsLocked ? "var(--muted)" : focus === "lastOut" ? "oklch(0.22 0.05 25 / 0.3)" : "var(--background)",
                              borderColor: monitorInputsLocked ? "var(--border)" : focus === "lastOut" ? "oklch(0.65 0.22 25)" : "oklch(0.65 0.22 25 / 0.35)",
                              color: "oklch(0.65 0.22 25)",
                            }}>
                            {firstEntryLastOut || <span style={{ color: "var(--muted-foreground)" }}>optional</span>}
                          </button>
                        ) : (
                          <div className="w-full rounded-xl border border-border/50 bg-muted/30 px-3 py-2.5 text-sm font-bold text-center select-none"
                            style={{ color: "oklch(0.65 0.22 25)" }}>
                            {monitorOutTotal || "—"}
                          </div>
                        )}
                      </div>

                      {/* Total diff */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Total</label>
                        <div className="w-full rounded-xl border border-border/50 bg-muted/30 px-3 py-2.5 text-sm font-bold text-center select-none"
                          style={{ color: "oklch(0.65 0.22 25)" }}>
                          {calcOutDiff == null ? "—" : `${calcOutDiff >= 0 ? "+" : ""}${calcOutDiff.toFixed(2)}`}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ── Profit card ── */}
                  <div className="mt-3 flex justify-center">
                    <div className="w-full max-w-[200px] space-y-1 text-center">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Profit</label>
                      <div className="w-full rounded-xl border border-border/50 bg-muted/30 px-3 py-2.5 text-sm font-bold text-center select-none"
                        style={{ color: profitVal === null ? "var(--muted-foreground)" : profitVal >= 0 ? "oklch(0.72 0.18 145)" : "oklch(0.65 0.22 25)" }}>
                        {profitVal === null ? "—" : `${profitVal >= 0 ? "+" : ""}${profitVal.toFixed(2)}`}
                      </div>
                    </div>
                  </div>

                  {/* ── Inline numpad — shown when a field is focused and not locked ── */}
                  {focus && !monitorInputsLocked && (
                    <div className="mt-4">
                      <p className="text-[10px] font-black uppercase tracking-widest text-center mb-2"
                        style={{ color: focusColor(focus) }}>
                        Entering {focusLabel(focus)}
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        {["7","8","9","4","5","6","1","2","3"].map(k => (
                          <button key={k} type="button"
                            onClick={() => {
                              const setter = focusSetter(focus);
                              const val    = focusVal(focus);
                              const parts  = val.split(".");
                              if (parts[1] !== undefined && parts[1].length >= 2) return;
                              setter(val + k);
                            }}
                            className="rounded-2xl py-4 text-xl font-black active:scale-95 transition"
                            style={{ background: "oklch(0.20 0.05 60)", color: "#fff" }}>
                            {k}
                          </button>
                        ))}
                        <button type="button"
                          onClick={() => {
                            const setter = focusSetter(focus);
                            const val    = focusVal(focus);
                            if (!val.includes(".")) setter(val + ".");
                          }}
                          className="rounded-2xl py-4 text-xl font-black active:scale-95 transition"
                          style={{ background: "oklch(0.20 0.05 60)", color: "#fff" }}>
                          .
                        </button>
                        <button type="button"
                          onClick={() => {
                            const setter = focusSetter(focus);
                            const val    = focusVal(focus);
                            const parts  = val.split(".");
                            if (parts[1] !== undefined && parts[1].length >= 2) return;
                            setter(val + "0");
                          }}
                          className="rounded-2xl py-4 text-xl font-black active:scale-95 transition"
                          style={{ background: "oklch(0.20 0.05 60)", color: "#fff" }}>
                          0
                        </button>
                        <button type="button"
                          onClick={() => {
                            const setter = focusSetter(focus);
                            const val    = focusVal(focus);
                            setter(val.slice(0, -1));
                          }}
                          className="rounded-2xl py-4 text-xl font-black active:scale-95 transition"
                          style={{ background: "oklch(0.20 0.05 60)", color: "oklch(0.75 0.15 65)" }}>
                          ⌫
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Update button */}
                  <button
                    onClick={() => { setShowConfirmUpdate(true); setMonitorFocus(null); }}
                    disabled={
                      monitorSaving || monitorUpdateDone || monitorInputsLocked ||
                      monitorIn === "" || monitorOut === ""
                    }
                    className="mt-4 w-full py-3 rounded-xl font-black text-sm uppercase tracking-wider transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}
                  >
                    {monitorSaving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : monitorUpdateDone ? "✓ Saved" : "Update"}
                  </button>
                  </>
                );
              })()}

              {/* Confirm Update modal */}
              {showConfirmUpdate && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
                  <div className="w-full max-w-sm rounded-3xl border border-border shadow-2xl overflow-hidden" style={{ background: "var(--gradient-card)" }}>
                    <div className="px-6 pt-7 pb-4 text-center space-y-2">
                      <div className="text-4xl">📋</div>
                      <h2 className="font-black text-lg">Save Log Entry?</h2>
                      <p className="text-sm text-muted-foreground leading-snug">This will record a snapshot of the current IN / OUT values to the Logs tab.</p>
                    </div>
                    <div className="grid grid-cols-2 border-t border-border">
                      <button onClick={() => setShowConfirmUpdate(false)}
                        className="h-14 font-black text-sm border-r border-border transition active:bg-muted/60">Cancel</button>
                      <button onClick={() => { setShowConfirmUpdate(false); handleMonitorUpdate(); }}
                        className="h-14 font-black text-sm transition active:opacity-80"
                        style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}>
                        Save Log
                      </button>
                    </div>
                  </div>
                </div>
              )}
              </>
              )}
            </div>
            )} {/* end monitor sub-tab */}

            {/* ── Logs sub-tab ── */}
            {monitorSubTab === "logs" && (
              <div className="space-y-2">

                {/* Delete confirm modal */}
                {confirmDeleteLogId && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
                    <div className="w-full max-w-sm rounded-3xl border border-red-500/40 shadow-2xl overflow-hidden" style={{ background: "var(--gradient-card)" }}>
                      <div className="px-6 pt-7 pb-4 text-center space-y-2">
                        <div className="text-4xl">🗑️</div>
                        <h2 className="font-black text-lg">Delete Log Entry?</h2>
                        <p className="text-sm text-muted-foreground leading-snug">This record will be permanently removed. This cannot be undone.</p>
                      </div>
                      <div className="grid grid-cols-2 border-t border-border">
                        <button onClick={() => setConfirmDeleteLogId(null)}
                          className="h-14 font-black text-sm border-r border-border transition active:bg-muted/60">Cancel</button>
                        <button onClick={() => handleDeleteLog(confirmDeleteLogId)} disabled={deletingLogId === confirmDeleteLogId}
                          className="h-14 font-black text-sm transition active:opacity-80 disabled:opacity-50 flex items-center justify-center gap-2"
                          style={{ background: "rgba(239,68,68,0.15)", color: "#f87171" }}>
                          {deletingLogId === confirmDeleteLogId ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                {logsLoading ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
                ) : monitorLogs.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground text-sm">No logs yet. Press Update on the monitor to create entries.</div>
                ) : (() => {
                  // ── Group logs by YYYY-MM (TT timezone) ──────────────────
                  const TZ = "America/Port_of_Spain";
                  const grouped: { monthKey: string; label: string; logs: MonitorLog[] }[] = [];
                  const seenMonths = new Map<string, MonitorLog[]>();
                  for (const log of monitorLogs) {
                    const dt  = new Date(log.logged_at);
                    const key = dt.toLocaleDateString("en-CA", { year: "numeric", month: "2-digit", timeZone: TZ }); // "YYYY-MM"
                    if (!seenMonths.has(key)) seenMonths.set(key, []);
                    seenMonths.get(key)!.push(log);
                  }
                  seenMonths.forEach((logs, key) => {
                    const [yr, mo] = key.split("-");
                    const label = new Date(Number(yr), Number(mo) - 1, 1)
                      .toLocaleDateString("en-GB", { month: "long", year: "numeric" });
                    grouped.push({ monthKey: key, label, logs });
                  });
                  // Keep newest month first
                  grouped.sort((a, b) => b.monthKey.localeCompare(a.monthKey));

                  return grouped.map(({ monthKey, label, logs: mLogs }) => {
                    const isMonthOpen = openMonthKeys.has(monthKey);
                    const isDownloading = downloadingMonthKey === monthKey;
                    // Summary numbers from the most recent log in this month
                    const latest = mLogs[0];
                    const mProfit = latest.in_diff - latest.out_diff;

                    return (
                      <div key={monthKey} className="rounded-2xl border border-border overflow-hidden" style={{ background: "var(--gradient-card)" }}>

                        {/* ── Month accordion header ── */}
                        <div className="flex items-center gap-2 px-4 py-3">
                          {/* Expand / collapse */}
                          <button
                            className="flex-1 flex items-center gap-3 text-left min-w-0"
                            onClick={() => setOpenMonthKeys(prev => {
                              const next = new Set(prev);
                              next.has(monthKey) ? next.delete(monthKey) : next.add(monthKey);
                              return next;
                            })}
                          >
                            <svg className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isMonthOpen ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                            <div className="flex-1 min-w-0">
                              <div className="font-black text-sm truncate" style={{ color: "oklch(0.82 0.18 65)" }}>{label}</div>
                              <div className="text-[10px] text-muted-foreground mb-2">{mLogs.length} {mLogs.length === 1 ? "entry" : "entries"}</div>
                              {/* Running Totals label */}
                              <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1">Running Totals</div>
                              {/* 3 stat cards */}
                              <div className="grid grid-cols-3 gap-1">
                                <div className="rounded-lg px-1 py-1.5 text-center" style={{ background: "oklch(0.18 0.04 145 / 0.5)", border: "1px solid oklch(0.72 0.18 145 / 0.2)" }}>
                                  <div className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">IN</div>
                                  <div className="text-[11px] font-black leading-tight" style={{ color: "oklch(0.72 0.18 145)" }}>{Math.round(latest.in_present)}</div>
                                </div>
                                <div className="rounded-lg px-1 py-1.5 text-center" style={{ background: "oklch(0.18 0.04 25 / 0.5)", border: "1px solid oklch(0.65 0.22 25 / 0.2)" }}>
                                  <div className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">OUT</div>
                                  <div className="text-[11px] font-black leading-tight" style={{ color: "oklch(0.65 0.22 25)" }}>{Math.round(latest.out_present)}</div>
                                </div>
                                <div className="rounded-lg px-1 py-1.5 text-center" style={{ background: mProfit >= 0 ? "oklch(0.18 0.04 145 / 0.5)" : "oklch(0.18 0.04 25 / 0.5)", border: `1px solid ${mProfit >= 0 ? "oklch(0.72 0.18 145 / 0.25)" : "oklch(0.65 0.22 25 / 0.25)"}` }}>
                                  <div className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">PROFIT</div>
                                  <div className="text-[11px] font-black leading-tight" style={{ color: mProfit >= 0 ? "oklch(0.72 0.18 145)" : "oklch(0.65 0.22 25)" }}>{mProfit >= 0 ? "+" : ""}{Math.round(mProfit)}</div>
                                </div>
                              </div>
                            </div>
                          </button>

                          {/* PDF download button */}
                          <button
                            onClick={() => handleDownloadMonthMonitorPdf(monthKey, mLogs)}
                            disabled={isDownloading}
                            className="shrink-0 h-8 w-8 rounded-xl flex items-center justify-center transition active:scale-95 disabled:opacity-50 self-start mt-1"
                            style={{ background: "oklch(0.22 0.04 60)", color: "oklch(0.82 0.18 65)" }}
                            title={`Download ${label} PDF`}
                          >
                            {isDownloading
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <Download className="h-3.5 w-3.5" />
                            }
                          </button>
                        </div>

                        {/* ── Log entries (existing accordion cards) ── */}
                        {isMonthOpen && (
                          <div className="border-t border-border px-2 pb-2 pt-2 space-y-1">
                            {mLogs.map((log, logIdx) => {
                              const isOpen    = openLogId   === log.id;
                              const isEditing = editingLogId === log.id;
                              const dt = new Date(log.logged_at);
                              const dateStr = dt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: TZ });
                              const timeStr = dt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: TZ });
                              const logProfit = log.in_diff - log.out_diff;
                              // Alternate row backgrounds: even = slightly lighter, odd = darker
                              const rowBg = logIdx % 2 === 0
                                ? "oklch(0.16 0.03 60 / 0.5)"
                                : "oklch(0.12 0.02 60 / 0.35)";
                              return (
                                <div key={log.id} className="rounded-xl border border-border/60 overflow-hidden"
                                  style={{ background: rowBg }}>
                                  {/* Log accordion header */}
                                  <div className="flex items-center justify-between px-3 pt-3 pb-2">
                                    <button className="flex-1 text-left" onClick={() => setOpenLogId(isOpen ? null : log.id)}>
                                      <div className="font-black text-sm">{dateStr}</div>
                                      <div className="text-xs text-muted-foreground mb-2">{timeStr}</div>
                                      {/* 3 stat cards on each log row */}
                                      <div className="grid grid-cols-3 gap-1">
                                        <div className="rounded-lg px-1 py-1.5 text-center" style={{ background: "oklch(0.18 0.04 145 / 0.5)", border: "1px solid oklch(0.72 0.18 145 / 0.2)" }}>
                                          <div className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">IN</div>
                                          <div className="text-[11px] font-black leading-tight" style={{ color: "oklch(0.72 0.18 145)" }}>{log.in_diff >= 0 ? "+" : ""}{Math.round(log.in_diff)}</div>
                                        </div>
                                        <div className="rounded-lg px-1 py-1.5 text-center" style={{ background: "oklch(0.18 0.04 25 / 0.5)", border: "1px solid oklch(0.65 0.22 25 / 0.2)" }}>
                                          <div className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">OUT</div>
                                          <div className="text-[11px] font-black leading-tight" style={{ color: "oklch(0.65 0.22 25)" }}>{log.out_diff >= 0 ? "+" : ""}{Math.round(log.out_diff)}</div>
                                        </div>
                                        <div className="rounded-lg px-1 py-1.5 text-center" style={{ background: logProfit >= 0 ? "oklch(0.18 0.04 145 / 0.5)" : "oklch(0.18 0.04 25 / 0.5)", border: `1px solid ${logProfit >= 0 ? "oklch(0.72 0.18 145 / 0.25)" : "oklch(0.65 0.22 25 / 0.25)"}` }}>
                                          <div className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">PROFIT</div>
                                          <div className="text-[11px] font-black leading-tight" style={{ color: logProfit >= 0 ? "oklch(0.72 0.18 145)" : "oklch(0.65 0.22 25)" }}>{logProfit >= 0 ? "+" : ""}{Math.round(logProfit)}</div>
                                        </div>
                                      </div>
                                    </button>
                                    {/* Edit pencil */}
                                    <button
                                      onClick={() => {
                                        setOpenLogId(log.id);
                                        if (editingLogId === log.id) { setEditingLogId(null); }
                                        else { setEditingLogId(log.id); setEditLogIn(String(log.in_present)); setEditLogOut(String(log.out_present)); }
                                      }}
                                      className="h-8 w-8 rounded-xl flex items-center justify-center transition active:scale-95 ml-2 self-start"
                                      style={{ background: isEditing ? "var(--gradient-hero)" : "oklch(0.22 0.04 60)", color: isEditing ? "var(--primary-foreground)" : "oklch(0.72 0.18 145)" }}>
                                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                    </button>
                                  </div>
                                  {/* Chevron */}
                                  <button onClick={() => setOpenLogId(isOpen ? null : log.id)}
                                    className="w-full flex justify-center pb-1 -mt-1">
                                    <svg className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                                  </button>

                                  {/* Expanded detail */}
                                  {isOpen && (
                                    <div className="px-4 pb-4 pt-3 space-y-3"
                                      style={{ background: "oklch(0.20 0.035 60)", borderTop: "1px solid oklch(0.82 0.18 65 / 0.2)" }}>
                                      {isEditing ? (
                                        <div className="space-y-3">
                                          <div className="flex items-center justify-between">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Edit Present Values</p>
                                            {log.id === monitorLogs[0]?.id && (
                                              <button onClick={() => setConfirmDeleteLogId(log.id)} disabled={deletingLogId === log.id}
                                                className="h-7 w-7 rounded-lg flex items-center justify-center transition active:scale-95 disabled:opacity-50 border border-red-500/40"
                                                style={{ background: "rgba(239,68,68,0.08)", color: "#f87171" }}>
                                                {deletingLogId === log.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                                              </button>
                                            )}
                                          </div>
                                          <div className="grid grid-cols-2 gap-3">
                                            <div className="space-y-1">
                                              <label className="text-[10px] font-black uppercase tracking-widest" style={{ color: "oklch(0.72 0.18 145)" }}>IN Present</label>
                                              <input type="number" value={editLogIn} onChange={e => setEditLogIn(e.target.value)}
                                                className="w-full h-10 rounded-xl border border-border bg-background px-3 text-sm font-black outline-none focus:ring-1 focus:ring-primary text-center"
                                                style={{ color: "oklch(0.72 0.18 145)" }} />
                                            </div>
                                            <div className="space-y-1">
                                              <label className="text-[10px] font-black uppercase tracking-widest" style={{ color: "oklch(0.65 0.22 25)" }}>OUT Present</label>
                                              <input type="number" value={editLogOut} onChange={e => setEditLogOut(e.target.value)}
                                                className="w-full h-10 rounded-xl border border-border bg-background px-3 text-sm font-black outline-none focus:ring-1 focus:ring-primary text-center"
                                                style={{ color: "oklch(0.65 0.22 25)" }} />
                                            </div>
                                          </div>
                                          <div className="flex gap-2">
                                            <button onClick={() => setEditingLogId(null)}
                                              className="flex-1 h-10 rounded-xl font-black text-xs border border-border transition">Cancel</button>
                                            <button onClick={() => handleSaveLogEdit(log)} disabled={savingLogEdit}
                                              className="flex-1 h-10 rounded-xl font-black text-xs transition active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5"
                                              style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}>
                                              {savingLogEdit ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save & Recalculate"}
                                            </button>
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="space-y-3">
                                          <div className="grid grid-cols-2 gap-4">
                                            {/* IN */}
                                            <div className="space-y-2">
                                              <p className="text-xs font-black text-center uppercase tracking-widest" style={{ color: "oklch(0.72 0.18 145)" }}>IN</p>
                                              {[
                                                { label: "Present", value: log.in_present.toFixed(2), color: "oklch(0.72 0.18 145)" },
                                                { label: "Last",    value: log.in_last.toFixed(2),    color: "oklch(0.72 0.18 145)" },
                                                { label: "Total",   value: (log.in_diff >= 0 ? "+" : "") + log.in_diff.toFixed(2), color: log.in_diff >= 0 ? "oklch(0.72 0.18 145)" : "oklch(0.65 0.22 25)" },
                                              ].map(({ label, value, color }) => (
                                                <div key={label} className="space-y-0.5">
                                                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{label}</label>
                                                  <div className="w-full rounded-xl border border-border/50 bg-muted/30 px-3 py-2 text-sm font-bold text-center" style={{ color }}>{value}</div>
                                                </div>
                                              ))}
                                            </div>
                                            {/* OUT */}
                                            <div className="space-y-2">
                                              <p className="text-xs font-black text-center uppercase tracking-widest" style={{ color: "oklch(0.65 0.22 25)" }}>OUT</p>
                                              {[
                                                { label: "Present", value: log.out_present.toFixed(2), color: "oklch(0.65 0.22 25)" },
                                                { label: "Last",    value: log.out_last.toFixed(2),    color: "oklch(0.65 0.22 25)" },
                                                { label: "Total",   value: (log.out_diff >= 0 ? "+" : "") + log.out_diff.toFixed(2), color: "oklch(0.65 0.22 25)" },
                                              ].map(({ label, value, color }) => (
                                                <div key={label} className="space-y-0.5">
                                                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{label}</label>
                                                  <div className="w-full rounded-xl border border-border/50 bg-muted/30 px-3 py-2 text-sm font-bold text-center" style={{ color }}>{value}</div>
                                                </div>
                                              ))}
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
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
            )}
          </div>
        )}


      </div>





      {/* Delete machine confirm modal — two options: keep or wipe records */}


      {showDeleteMachine && (


        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">


          <div className="w-full max-w-sm rounded-3xl border border-red-500/40 shadow-2xl overflow-hidden"


            style={{ background: "var(--gradient-card)" }}>


            <div className="px-6 pt-6 pb-4 space-y-3">


              <div className="flex items-center gap-3">


                <div className="h-11 w-11 rounded-xl flex items-center justify-center bg-red-500/15 border border-red-500/30 shrink-0">


                  <Trash2 className="h-5 w-5 text-red-400" />


                </div>


                <h2 className="font-black text-lg">Delete {machine.name}?</h2>


              </div>


              <p className="text-sm text-muted-foreground leading-relaxed">


                Choose what happens to the payout and income records for this machine.


              </p>


              <div className="space-y-2">


                <button


                  disabled={deletingMachine}


                  onClick={() => handleDeleteMachine(false)}


                  className="w-full flex items-start gap-3 rounded-2xl border border-border p-3 text-left hover:bg-muted/30 transition active:scale-[0.98] disabled:opacity-50"


                  style={{ background: "var(--gradient-card)" }}>


                  <div className="h-8 w-8 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0 mt-0.5">


                    <span className="text-sm">📁</span>


                  </div>


                  <div>


                    <div className="font-black text-sm">Remove Card Only</div>


                    <div className="text-xs text-muted-foreground mt-0.5">Remove this machine from the app. All payout/income totals stay intact in All History.</div>


                  </div>


                </button>


                <button


                  disabled={deletingMachine}


                  onClick={() => handleDeleteMachine(true)}


                  className="w-full flex items-start gap-3 rounded-2xl border border-red-500/30 p-3 text-left hover:bg-red-500/10 transition active:scale-[0.98] disabled:opacity-50">


                  <div className="h-8 w-8 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center shrink-0 mt-0.5">


                    <Trash2 className="h-4 w-4 text-red-400" />


                  </div>


                  <div>


                    <div className="font-black text-sm text-red-400">Delete Everything</div>


                    <div className="text-xs text-muted-foreground mt-0.5">Remove the machine card AND wipe all its payout/income history. Cannot be undone.</div>


                  </div>


                </button>


              </div>


            </div>


            <div className="px-6 pb-6">


              <Button variant="outline" className="w-full h-12 font-black"


                onClick={() => setShowDeleteMachine(false)} disabled={deletingMachine}>


                {deletingMachine ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cancel"}


              </Button>


            </div>


          </div>


        </div>


      )}





      {/* ── Lightbox ── */}


      {lightboxUrl && (


        <div


          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/90 backdrop-blur-sm"


          onClick={() => setLightboxUrl(null)}


        >


          <img


            src={lightboxUrl}


            alt="proof"


            className="rounded-2xl shadow-2xl"


            style={{ maxWidth: "92vw", maxHeight: "88vh", objectFit: "contain" }}


            onClick={(e) => e.stopPropagation()}


          />


          <button


            onClick={() => setLightboxUrl(null)}


            className="absolute top-4 right-4 h-10 w-10 rounded-full flex items-center justify-center bg-black/60 border border-white/20 text-white active:scale-90 transition"


          >


            <X className="h-5 w-5" />


          </button>


        </div>


      )}


      </div>{/* end max-w-2xl wrapper */}


    </div>


  );


}





// ── Create Tab ─────────────────────────────────────────────────────────────────


function CreateTab({ ownerId, machineCount, maxScreens, onCreated }: { ownerId: string; machineCount: number; maxScreens: number; onCreated: (m: Machine) => void }) {


  const { t } = useTranslation();


  const [name, setName] = useState("");


  const [busy, setBusy] = useState(false);





  const submit = async (e: React.FormEvent) => {


    e.preventDefault();


    if (!name.trim()) return;


    if (machineCount >= maxScreens) { toast.error(`Maximum ${maxScreens} machines reached for this account`); return; }


    setBusy(true);


    const { data, error } = await sb.from("machines")


      .insert({ owner_id: ownerId, name: name.trim() })


      .select().single();


    setBusy(false);


    if (error) { toast.error(error.message); return; }


    toast.success("Machine created");


    setName("");


    onCreated(data as Machine);


  };





  return (


    <form onSubmit={submit} className="rounded-2xl border border-border p-4 space-y-4"


      style={{ background: "var(--gradient-card)" }}>


      <h2 className="font-black text-sm">{t("add_machine", "Add Machine")}</h2>


      <div>


        <Label className="text-xs">{t("machine_name", "Machine Name")}</Label>


        <Input value={name} onChange={e => setName(e.target.value)}


          placeholder="e.g. Lucky Star, Pool Table 1" className="mt-1 h-11" required />


      </div>


      <Button type="submit" disabled={busy || !name.trim()}


        className="w-full h-12 font-black text-base"


        style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}>


        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4 mr-2" />{t("create_machine", "Create Machine")}</>}


      </Button>


    </form>


  );


}





// ── Screens Tab (machine grid + hero) ─────────────────────────────────────────


function ScreensTab({ machines: initialMachines, entries, ownerId, profileId, onSelect, floatSession, remainingFloat, isCashier, isOwner, isManager, onSetFloat, onAddExpense, onDeleteMachine, barSessionStart, barIsOpen, monitorRefreshKey }: {


  machines: Machine[]; entries: MachineEntry[];


  ownerId: string;


  profileId: string;


  onSelect: (m: Machine, screenNum: number) => void;


  floatSession: FloatSession | null;


  remainingFloat: number | null;


  isCashier: boolean;


  isOwner: boolean;


  isManager: boolean;


  onSetFloat: () => void;


  onAddExpense: () => void;


  onDeleteMachine: (id: string) => void;


  barSessionStart: string | null;
  barIsOpen: boolean;

  monitorRefreshKey: number;


}) {


  const { t } = useTranslation();

  const [monitorTotals, setMonitorTotals] = useState<{ totalIn: number; totalOut: number; totalProfit: number }>({ totalIn: 0, totalOut: 0, totalProfit: 0 });
  const [monitorPerMachine, setMonitorPerMachine] = useState<Record<string, { in_present: number; out_present: number; in_diff: number; out_diff: number }>>({});

  useEffect(() => {
    if (!ownerId) return;
    // Pull the latest log per machine — in_present/out_present never get wiped by New Entry
    sb.from("machine_monitor_logs")
      .select("machine_id, in_present, out_present, in_diff, out_diff, seq")
      .eq("owner_id", ownerId)
      .order("seq", { ascending: false })
      .then(({ data }: any) => {
        if (data) {
          // Keep only the most recent log per machine
          const seen = new Set<string>();
          const latest: any[] = [];
          for (const row of data) {
            if (!seen.has(row.machine_id)) {
              seen.add(row.machine_id);
              latest.push(row);
            }
          }
          const inSum     = latest.reduce((s: number, m: any) => s + Number(m.in_present  || 0), 0);
          const outSum    = latest.reduce((s: number, m: any) => s + Number(m.out_present || 0), 0);
          const profitSum = latest.reduce((s: number, m: any) => s + (Number(m.in_diff || 0) - Number(m.out_diff || 0)), 0);
          setMonitorTotals({ totalIn: inSum, totalOut: outSum, totalProfit: profitSum });
          // Store per-machine for individual card TP
          const perMachine: Record<string, { in_present: number; out_present: number; in_diff: number; out_diff: number }> = {};
          for (const row of latest) {
            perMachine[row.machine_id] = {
              in_present:  Number(row.in_present  || 0),
              out_present: Number(row.out_present || 0),
              in_diff:     Number(row.in_diff     || 0),
              out_diff:    Number(row.out_diff    || 0),
            };
          }
          setMonitorPerMachine(perMachine);
        }
      });
  }, [ownerId, monitorRefreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Manual cashier expenses only (Add Expense button)
  const manualExpenses = entries.filter(e => e.type === "expense").reduce((s, e) => s + Number(e.amount), 0);
  const totalIncome = monitorTotals.totalIn;                      // sum of in_present from latest logs
  const totalPayout = monitorTotals.totalOut;                     // All Machines Payout — machine payouts only, no manual expenses
  const grossProfit = (monitorTotals.totalProfit ?? 0);           // Gross Profit = machine in_diff − out_diff
  const netProfit = grossProfit - manualExpenses;                 // Net Profit = Gross Profit − manual expenses
  const totalProfit = grossProfit;                                // keep alias for any other usages

  // Today's sessions — machine payouts only since bar_session_start (manual expenses excluded)
  const todayPayouts = barSessionStart
    ? entries.filter(e => e.type === "payout" && new Date(e.created_at) >= new Date(barSessionStart)).reduce((s, e) => s + Number(e.amount), 0)
    : entries.filter(e => e.type === "payout" && e.entry_date === todayTT()).reduce((s, e) => s + Number(e.amount), 0);
  const todayIncome = barSessionStart
    ? entries.filter(e => e.type === "income" && new Date(e.created_at) >= new Date(barSessionStart)).reduce((s, e) => s + Number(e.amount), 0)
    : entries.filter(e => e.type === "income" && e.entry_date === todayTT()).reduce((s, e) => s + Number(e.amount), 0);
  const todayProfit = todayIncome - todayPayouts;





  // Machine session anchor = floatSession.set_at only.
  // Bar "Update Float / New Session" uses bar_session_start (separate system).
  // Machine "Update Float / New Session" inserts a new machine_float_sessions row → floatSession updates.
  const machineSessionAnchor = floatSession ? floatSession.set_at : null;

  const sessionPayouts = machineSessionAnchor


    ? entries


        .filter(e => e.type === "payout" && new Date(e.created_at) >= new Date(machineSessionAnchor))


        .reduce((s, e) => s + Number(e.amount), 0)


    : entries.filter(e => e.type === "payout").reduce((s, e) => s + Number(e.amount), 0);


  const sessionIncome = machineSessionAnchor


    ? entries


        .filter(e => e.type === "income" && new Date(e.created_at) >= new Date(machineSessionAnchor))


        .reduce((s, e) => s + Number(e.amount), 0)


    : entries.filter(e => e.type === "income").reduce((s, e) => s + Number(e.amount), 0);


  const sessionProfit = sessionIncome - sessionPayouts;





  const [orderedMachines, setOrderedMachines] = useState<Machine[]>(() =>


    [...initialMachines].sort((a, b) =>


      a.sort_order !== b.sort_order ? a.sort_order - b.sort_order : a.created_at.localeCompare(b.created_at)


    )


  );


  const [editMode, setEditMode] = useState(false);


  const [draggingId, setDraggingId] = useState<string | null>(null);


  const [savingOrder, setSavingOrder] = useState(false);


  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);


  const editModeRef = useRef(false);


  const orderedRef = useRef<Machine[]>(orderedMachines);


  const draggingRef = useRef<string | null>(null);


  // Keep ref in sync with state so closures always see the latest value


  useEffect(() => { editModeRef.current = editMode; }, [editMode]);


  useEffect(() => { orderedRef.current = orderedMachines; }, [orderedMachines]);





  // Clear timer on unmount


  useEffect(() => () => {


    if (longPressTimer.current) clearTimeout(longPressTimer.current);


  }, []);





  // Reset edit state on mount (covers tab switches where ScreensTab remounts)


  // Also force-restore touch-action on the document in case a previous drag


  // session on another page left it locked — this is the self-healing mechanism.


  useEffect(() => {


    document.body.style.touchAction = "";


    document.documentElement.style.touchAction = "";


    editModeRef.current = false;


    setEditMode(false);


    draggingRef.current = null;


    setDraggingId(null);


    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }


  }, []); // eslint-disable-line react-hooks/exhaustive-deps





  // Sync when machines change — never during drag/edit


  useEffect(() => {


    if (editModeRef.current) return;


    const sorted = [...initialMachines].sort((a, b) =>


      a.sort_order !== b.sort_order ? a.sort_order - b.sort_order : a.created_at.localeCompare(b.created_at)


    );


    orderedRef.current = sorted;


    setOrderedMachines(sorted);


  }, [initialMachines]); // eslint-disable-line react-hooks/exhaustive-deps





  // Save only called from handleDone — not on every drop


  const saveOrder = async (newOrder: Machine[]) => {


    setSavingOrder(true);


    await Promise.all(


      newOrder.map((m, idx) =>


        (supabase as any).from("machines").update({ sort_order: idx }).eq("id", m.id)


      )


    );


    setSavingOrder(false);


  };





  const handleDone = async () => {


    document.body.style.touchAction = "";


    document.documentElement.style.touchAction = "";


    editModeRef.current = false;


    setEditMode(false);


    draggingRef.current = null;


    setDraggingId(null);


    await saveOrder(orderedRef.current);


  };





  const handleDragStart = (id: string) => {


    draggingRef.current = id;


    setDraggingId(id);


  };





  const handleDragOver = (e: React.DragEvent, targetId: string) => {


    e.preventDefault();


    const dragging = draggingRef.current;


    if (!dragging || dragging === targetId) return;


    const current = orderedRef.current;


    const from = current.findIndex(m => m.id === dragging);


    const to   = current.findIndex(m => m.id === targetId);


    if (from === -1 || to === -1) return;


    const next = [...current];


    const [item] = next.splice(from, 1);


    next.splice(to, 0, item);


    orderedRef.current = next;


    setOrderedMachines(next);


  };





  const handleDrop = () => {


    draggingRef.current = null;


    setDraggingId(null);


    // No save here — save happens on Done


  };





  const startLongPress = () => {


    if (editModeRef.current) return;


    if (isCashier) return; // cashiers cannot reorder machines


    if (longPressTimer.current) clearTimeout(longPressTimer.current);


    longPressTimer.current = setTimeout(() => {


      longPressTimer.current = null;


      editModeRef.current = true;


      setEditMode(true);


    }, 600);


  };


  const cancelLongPress = () => {


    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }


  };





  if (initialMachines.length === 0) {


    return (


      <div className="text-center py-16 text-muted-foreground">


        <Gamepad2 className="h-10 w-10 mx-auto mb-3 opacity-30" />


        <p className="font-semibold text-sm">No machines yet</p>


        <p className="text-xs mt-1">Use the Create tab to add your first machine.</p>


      </div>


    );


  }





  return (


    <div className="space-y-4">


      {/* All-machines hero — float set + remaining (all roles), update float button (owner/manager only) */}
      <section className="rounded-3xl p-5 relative overflow-hidden space-y-3"


        style={{ background: "var(--gradient-hero)", boxShadow: "var(--shadow-glow)" }}>


        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />


        {/* Float row — top */}


        <div className="relative grid gap-2" style={{ gridTemplateColumns: isOwner ? "1fr 1fr 1fr" : "1fr 1fr" }}>


          {isOwner && (
          <div className="flex justify-center">
            <button onClick={onSetFloat}
              className="rounded-xl font-black text-xs active:scale-95 transition flex items-center justify-center px-3 py-2"
              style={{ background: "oklch(0.28 0.06 60)", color: "#fbbf24", border: "1.5px solid oklch(0.38 0.10 60)", width: "70%" }}>
              {floatSession ? t("update_float", "Update Float") : t("set_float", "Set Float")}
            </button>
          </div>
          )}


          <div className="rounded-xl px-2 py-2 flex flex-col gap-0.5 text-center"


            style={{ background: "oklch(0.22 0.02 60)" }}>


            <div className="text-[9px] sm:text-[11px] lg:text-xs font-semibold text-white/40">{t("float_set", "Float Set")}</div>


            <div className="font-black text-xs" style={{ color: "#fbbf24" }}>


              {floatSession ? "$" + fmtWhole(Number(floatSession.amount)) : "—"}


            </div>


          </div>


          <div className="rounded-xl px-2 py-2 flex flex-col gap-0.5 text-center"


            style={{ background: "oklch(0.22 0.02 60)" }}>


            <div className="text-[9px] sm:text-[11px] lg:text-xs font-semibold text-white/40">{t("remaining", "Remaining")}</div>


            <div className="font-black text-xs"


              style={{ color: remainingFloat === null ? "oklch(0.45 0.02 60)" : remainingFloat >= 0 ? "#86efac" : "#fca5a5" }}>


              {remainingFloat === null ? "—" : (remainingFloat >= 0 ? "" : "-") + "$" + fmtWhole(Math.abs(remainingFloat))}


            </div>


          </div>



        </div>


      </section>

      {/* Hero 2 — Stats */}
      <section className="rounded-3xl p-5 relative overflow-hidden space-y-3"
        style={{ background: "var(--gradient-hero)", boxShadow: "var(--shadow-glow)" }}>
        <div className="absolute -left-8 -bottom-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />

        {/* Title */}
        <div className="relative text-xs font-black uppercase tracking-widest text-center" style={{ color: "rgba(0,0,0,0.55)" }}>
          {t("screen_totals", "Machine Totals")}
        </div>

        {/* Row 1 — Session stats — visible to all roles */}
        <div className="relative grid grid-cols-3 gap-2">
          <StatCard label={t("session_income", "Session Cash In")} value={"$" + fmtWhole(sessionIncome)} color="#86efac" />
          <StatCard label={t("session_payout", "Session Payout")} value={"$" + fmtWhole(sessionPayouts)} color="#fca5a5" />
          <StatCard label={t("session_profit", "Session Profit")}
            value={(sessionProfit >= 0 ? "+" : "") + "$" + fmtWhole(sessionProfit)}
            color={sessionProfit >= 0 ? "#86efac" : "#fca5a5"} />
        </div>

        {/* Row 2 — Today's stats — owner only */}
        {isOwner && (
        <div className="relative grid grid-cols-3 gap-2">
          <StatCard label={t("today_income", "Today's Cash In")} value={"$" + fmtWhole(todayIncome)} color="#86efac" />
          <StatCard label={t("today_payout", "Today's Payout")} value={"$" + fmtWhole(todayPayouts)} color="#fca5a5" />
          <StatCard label={t("today_profit", "Today's Profit")}
            value={(todayProfit >= 0 ? "+" : "") + "$" + fmtWhole(todayProfit)}
            color={todayProfit >= 0 ? "#86efac" : "#fca5a5"} />
        </div>
        )}

        {/* Row 3 — Lifetime totals — owner only */}
        {isOwner && (
        <div className="relative grid grid-cols-3 gap-2">
          <StatCard label={t("all_time_income", "Total Cash In")} value={"$" + fmtWhole(totalIncome)} color="#86efac" />
          <StatCard label={t("all_machines_payout", "Total Payouts")} value={"$" + fmtWhole(totalPayout)} color="#fca5a5" />
          <StatCard label={t("all_time_gross_profit", "Profit")}
            value={(grossProfit >= 0 ? "+" : "") + "$" + fmtWhole(grossProfit)}
            color={grossProfit >= 0 ? "#86efac" : "#fca5a5"} />
        </div>
        )}

        {/* Row 4 — Manual Expenses — owner only */}
        {isOwner && (
        <div className="relative grid grid-cols-2 gap-2">
          <StatCard label={t("total_manual_expenses", "Total Expenses")} value={"$" + fmtWhole(manualExpenses)} color="#fca5a5" />
          <StatCard label={t("net_profit", "Net Profit")}
            value={(netProfit >= 0 ? "+" : "") + "$" + fmtWhole(netProfit)}
            color={netProfit >= 0 ? "#86efac" : "#fca5a5"} />
        </div>
        )}


        {/* Add Expense — full width on mobile, one column on tablet+ */}
        {orderedMachines.length > 0 && (
          <div className="relative">
            <button
              onClick={() => onAddExpense()}
              disabled={!barIsOpen}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 rounded-xl font-black text-sm active:scale-95 transition disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: "oklch(0.28 0.06 60)", color: "#fbbf24", border: "1.5px solid oklch(0.38 0.10 60)", height: "2.75rem" }}>
              <Receipt className="h-4 w-4" />
              {t("add_expense", "Add Expense")}
            </button>
          </div>
        )}


      </section>







      {/* Edit mode toolbar */}


      {editMode && (


        <div className="flex items-center justify-between rounded-2xl px-4 py-2.5 border border-amber-500/40"


          style={{ background: "oklch(0.20 0.05 60)" }}>


          <span className="text-xs font-black text-amber-400">{t("hold_to_sort", "Hold to reorder")}</span>


          <button


            onClick={handleDone}


            className="text-xs font-black text-white/60 px-3 py-1.5 rounded-lg hover:bg-white/10 transition">


            {t("done", "Listo")}


          </button>


        </div>


      )}





      {!editMode && !isCashier && (


        <p className="text-xs text-center" style={{ color: "rgba(180,160,130,0.6)" }}>


          {t("hold_to_sort", "Hold to sort")}


        </p>


      )}





      {/* Machine grid */}


      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">


        {orderedMachines.map((m, idx) => {


          const screenNum = idx + 1;


          const mPayout = entries.filter(e => e.machine_id === m.id && e.type === "payout").reduce((s, e) => s + Number(e.amount), 0);


          const mIncome = entries.filter(e => e.machine_id === m.id && e.type === "income").reduce((s, e) => s + Number(e.amount), 0);


          const mExpense = entries.filter(e => e.machine_id === m.id && e.type === "expense").reduce((s, e) => s + Number(e.amount), 0);


          // TP: use latest monitor log (in_diff - out_diff) = difference between readings only.
          // Manual expenses are NOT subtracted here — they show in the all-screens hero totals only.
          const mLog = monitorPerMachine[m.id];
          const mProfit = mLog ? (mLog.in_diff - mLog.out_diff) : (mIncome - mPayout);


          // Session profit — since last float update, resets to 0 on every float update


          const mSessionPayout = floatSession


            ? entries.filter(e => e.machine_id === m.id && e.type === "payout" && new Date(e.created_at) >= new Date(floatSession.set_at)).reduce((s, e) => s + Number(e.amount), 0)


            : 0;


          const mSessionIncome = floatSession


            ? entries.filter(e => e.machine_id === m.id && e.type === "income" && new Date(e.created_at) >= new Date(floatSession.set_at)).reduce((s, e) => s + Number(e.amount), 0)


            : 0;


          const mSessionProfit = mSessionIncome - mSessionPayout;


          const isDragging = draggingId === m.id;


          return (


            <div key={m.id} className="relative"


              draggable={editMode}


              onDragStart={() => handleDragStart(m.id)}


              onDragOver={(e) => handleDragOver(e, m.id)}


              onDrop={handleDrop}


              onDragEnd={() => setDraggingId(null)}


              onPointerDown={startLongPress}


              onPointerUp={cancelLongPress}


              onPointerLeave={cancelLongPress}


              onContextMenu={(e) => e.preventDefault()}


              style={{ opacity: isDragging ? 0.4 : 1, transition: "opacity 0.15s", userSelect: "none", WebkitUserSelect: "none" } as React.CSSProperties}>





              {/* Base card button */}


              <button


                onClick={() => !editMode && onSelect(m, screenNum)}


                className="w-full relative flex flex-col items-center justify-between rounded-2xl overflow-hidden"


                style={{


                  minHeight: "110px",


                  background: "linear-gradient(160deg, #1a1a2e 0%, #16213e 60%, #0f3460 100%)",


                  border: editMode ? "2px solid rgba(251,146,60,0.8)" : "2px solid rgba(251,146,60,0.35)",


                  boxShadow: "0 0 12px rgba(251,146,60,0.15), inset 0 0 20px rgba(0,0,0,0.4)",


                  cursor: editMode ? "grab" : "pointer",


                }}>


                <div className="w-full h-1.5 shrink-0"


                  style={{ background: "linear-gradient(90deg, transparent, rgba(251,146,60,0.5), transparent)" }} />


                <div className="flex-1 flex flex-col items-center justify-center gap-1 px-2">


                  <span className="font-black leading-none"


                    style={{ fontSize: "clamp(1.6rem, 5vw, 2.2rem)", color: "rgba(251,146,60,0.9)",


                      textShadow: "0 0 12px rgba(251,146,60,0.6)" }}>


                    {screenNum}


                  </span>


                  <span className="font-black text-white/80 uppercase leading-tight text-center w-full px-0.5 block"
                    style={{
                      fontSize: m.name.length > 9 ? (m.name.length > 13 ? "7px" : "9px") : "11px",
                      letterSpacing: m.name.length > 9 ? "0.03em" : "0.08em",
                      wordBreak: "break-word", overflowWrap: "break-word", lineHeight: 1.2,
                    }}>


                    {m.name}


                  </span>


                </div>


                <div className="w-full px-2 pb-1.5 space-y-0.5">
                  {isOwner && (
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[10px] font-black text-white/50 uppercase tracking-wider">TP</span>
                    <span className={`text-[11px] font-black ${mProfit >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {mProfit >= 0 ? "+" : ""}${fmtWhole(mProfit)}
                    </span>
                  </div>
                  )}
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[10px] font-black text-white/50 uppercase tracking-wider">SP</span>
                    <span className={`text-[11px] font-black ${mSessionProfit >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {mSessionProfit >= 0 ? "+" : ""}${fmtWhole(mSessionProfit)}
                    </span>
                  </div>
                </div>


                <div className="w-full h-1.5 shrink-0"


                  style={{ background: "linear-gradient(90deg, transparent, rgba(251,146,60,0.4), transparent)" }} />





                {/* Edit mode overlay */}


                {editMode && (


                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-2xl"


                    style={{ background: "rgba(255,255,255,0.12)", backdropFilter: "blur(1px)" }}>


                    <span className="font-black text-white leading-none"


                      style={{ fontSize: "clamp(1.4rem, 4vw, 1.8rem)" }}>


                      {screenNum}


                    </span>


                    <span className="font-black text-white/80 uppercase leading-tight text-center w-full px-0.5 block"
                      style={{
                        fontSize: m.name.length > 9 ? (m.name.length > 13 ? "7px" : "9px") : "11px",
                        letterSpacing: m.name.length > 9 ? "0.03em" : "0.08em",
                        wordBreak: "break-word", overflowWrap: "break-word", lineHeight: 1.2,
                      }}>


                      {m.name}


                    </span>


                    <span className="text-[8px] font-black text-white/60 mt-0.5">â† drag â†’</span>


                  </div>


                )}


              </button>





              {/* Delete button — top right, edit mode only */}


              {editMode && (


                <button


                  onClick={(e) => { e.stopPropagation(); onDeleteMachine(m.id); }}


                  className="absolute -top-2 -right-2 z-10 h-6 w-6 rounded-full flex items-center justify-center bg-red-600 border-2 border-background active:scale-90 transition"


                  style={{ boxShadow: "0 0 6px rgba(0,0,0,0.5)" }}>


                  <X className="h-3 w-3 text-white" />


                </button>


              )}


            </div>


          );


        })}


      </div>


    </div>


  );


}





// ── All History Tab ────────────────────────────────────────────────────────────


function AllHistoryTab({ entries, machines }: { entries: MachineEntry[]; machines: Machine[] }) {


  const [openMonth, setOpenMonth] = useState<string | null>(null);


  const [downloading, setDownloading] = useState(false);


  const [downloadedAll, setDownloadedAll] = useState(false);


  const [downloadingMonth, setDownloadingMonth] = useState<string | null>(null);


  const [downloadedMonth, setDownloadedMonth] = useState<string | null>(null);


  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);



  // All records sorted newest first


  const sorted = [...entries].sort((a, b) => b.created_at.localeCompare(a.created_at));





  // Group by YYYY-MM


  const byMonth: Record<string, MachineEntry[]> = {};


  sorted.forEach(e => {


    const mk = e.created_at.slice(0, 7);


    if (!byMonth[mk]) byMonth[mk] = [];


    byMonth[mk].push(e);


  });


  const monthKeys = Object.keys(byMonth).sort((a, b) => b.localeCompare(a));





  const monthLabel = (mk: string) => {


    const [yr, mo] = mk.split("-");


    return new Date(Number(yr), Number(mo) - 1, 1)


      .toLocaleDateString("en-GB", { month: "long", year: "numeric" });


  };





  const buildPdf = async (


    rows: MachineEntry[],


    title: string,


    subtitle: string,


  ) => {


    const { jsPDF } = await import("jspdf");


    const doc = new jsPDF({ unit: "mm", format: "a4" });


    const generated = new Date().toLocaleString("en-GB", {


      hour: "2-digit", minute: "2-digit", hour12: true,


      day: "numeric", month: "short", year: "numeric",


    });


    let y = await drawHeader(doc, "All Machines", title, subtitle, generated);


    const bw = RM - LM;


    const mPayout = rows.filter(e => e.type === "payout").reduce((s, e) => s + Number(e.amount), 0);


    const mIncome = rows.filter(e => e.type === "income").reduce((s, e) => s + Number(e.amount), 0);


    const mExpense = rows.filter(e => e.type === "expense").reduce((s, e) => s + Number(e.amount), 0);


    const mProfit = mIncome - mPayout - mExpense;


    doc.setFillColor(245, 240, 230);


    doc.roundedRect(LM, y, bw, 26, 2, 2, "F");


    doc.setDrawColor(232, 146, 42); doc.setLineWidth(0.4);


    doc.roundedRect(LM, y, bw, 26, 2, 2, "S");


    const cols = [


      { label: "Total Payout", value: "-$" + fmt(mPayout), r: 180, g: 40, b: 40 },


      { label: "Total Cash In", value: "+$" + fmt(mIncome), r: 40,  g: 140, b: 40 },


      { label: "Net Profit",   value: (mProfit >= 0 ? "+" : "") + "$" + fmt(mProfit),


        r: mProfit >= 0 ? 40 : 180, g: mProfit >= 0 ? 140 : 40, b: 40 },


    ];


    const cw = bw / 3;


    cols.forEach((c, i) => {


      const cx = LM + i * cw + cw / 2;


      doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(100, 100, 100);


      doc.text(c.label, cx, y + 10, { align: "center" });


      doc.setFont("helvetica", "bold"); doc.setFontSize(9);


      doc.setTextColor(c.r, c.g, c.b);


      doc.text(c.value, cx, y + 19, { align: "center" });


    });


    doc.setTextColor(0, 0, 0); y += 32;


    doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(130, 130, 130);


    doc.text("DATE / TIME", LM, y);


    doc.text("MACHINE", LM + 55, y);


    doc.text("TYPE", LM + 110, y);


    doc.text("AMOUNT", RM, y, { align: "right" });


    y += 3; doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.2); doc.line(LM, y, RM, y); y += 5;


    doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(0, 0, 0);


    rows.forEach(e => {


      if (y > CONTENT_BOTTOM) { doc.addPage(); y = 20; }


      const m = machines.find(x => x.id === e.machine_id);


      const isPayout = e.type === "payout" || e.type === "expense";


      const dateStr = new Date(e.created_at).toLocaleString("en-GB", {


        day: "numeric", month: "short", year: "numeric",


        hour: "2-digit", minute: "2-digit", hour12: true,


      });


      doc.setFont("helvetica", "bold"); doc.setTextColor(0, 0, 0);


      doc.text(dateStr, LM, y);


      doc.setFont("helvetica", "normal"); doc.setFontSize(8);


      doc.text(m?.name ?? "—", LM + 55, y);


      doc.setFontSize(9);


      doc.setTextColor(isPayout ? 180 : 40, isPayout ? 40 : 140, 40);


      doc.text(e.type.toUpperCase(), LM + 110, y);


      doc.text((isPayout ? "-" : "+") + "$" + fmt(Number(e.amount)), RM, y, { align: "right" });


      doc.setTextColor(0, 0, 0); doc.setFont("helvetica", "normal"); y += 5;


      if (e.note) {


        doc.setFontSize(8); doc.setTextColor(100, 100, 100);


        doc.text("  " + e.note, LM, y); doc.setFontSize(9); doc.setTextColor(0, 0, 0); y += 4;


      }


      doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.1); doc.line(LM, y, RM, y); y += 4;


    });


    addFootersToAllPages(doc);


    return doc;


  };





  // Saves via downloadPdf helper (handles both native Android and web correctly)


  const savePdfNative = async (filename: string, doc: import("jspdf").jsPDF) => {


    await downloadPdf(filename, doc.output("datauristring"));


  };





  const handleDownloadAll = async () => {


    if (downloading || sorted.length === 0) return;


    setDownloading(true);


    try {


      const doc = await buildPdf(sorted, "Full History", "All Records");


      await savePdfNative("machines-all-history.pdf", doc);


      toast.success("PDF ready — check your Documents folder");


      setDownloadedAll(true);


      setTimeout(() => setDownloadedAll(false), 5000);


    } catch (err: any) { toast.error("PDF failed: " + err?.message); }


    finally { setDownloading(false); }


  };





  const handleDownloadMonth = async (mk: string) => {


    if (downloadingMonth) return;


    setDownloadingMonth(mk);


    try {


      const doc = await buildPdf(byMonth[mk], monthLabel(mk), monthLabel(mk));


      await savePdfNative(`machines-${monthLabel(mk).replace(/\s+/g, "-")}.pdf`, doc);


      toast.success("PDF ready — check your Documents folder");


      setDownloadedMonth(mk);


      setTimeout(() => setDownloadedMonth(null), 5000);


    } catch (err: any) { toast.error("PDF failed: " + err?.message); }


    finally { setDownloadingMonth(null); }


  };





  if (sorted.length === 0) {


    return <div className="text-center py-12 text-muted-foreground text-sm">No records yet.</div>;


  }





  return (


    <div className="space-y-3">


      {/* Header — Download All */}
      <div className="rounded-2xl border border-border p-3" style={{ background: "var(--gradient-card)" }}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-black text-muted-foreground uppercase tracking-wider">{sorted.length} records</span>
          <Button size="sm" variant="outline" className="h-8 gap-1.5 font-bold text-xs"
            disabled={downloading} onClick={handleDownloadAll}
            style={downloadedAll ? { background: "#16a34a", color: "#fff", borderColor: "#16a34a" } : {}}>
            {downloading
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : downloadedAll
              ? <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              : <Download className="h-3 w-3" />}
            {downloadedAll ? "Done" : "All PDF"}
          </Button>
        </div>
      </div>




      {/* Month accordions */}


      <div className="space-y-2">


        {monthKeys.map(mk => {


          const mEntries = byMonth[mk];


          const mPayout = mEntries.filter(e => e.type === "payout").reduce((s, e) => s + Number(e.amount), 0);


          const mIncome = mEntries.filter(e => e.type === "income").reduce((s, e) => s + Number(e.amount), 0);


          const mExpense = mEntries.filter(e => e.type === "expense").reduce((s, e) => s + Number(e.amount), 0);


          const mProfit = mIncome - mPayout - mExpense;


          const isOpen = openMonth === mk;


          return (


            <div key={mk} className="rounded-2xl border border-border overflow-hidden"


              style={{ background: "var(--gradient-card)" }}>


              {/* Month header */}


              <button className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/20 transition"


                onClick={() => setOpenMonth(isOpen ? null : mk)}>


                <div className="flex items-center gap-2 min-w-0">


                  <span className="font-black text-sm sm:text-base lg:text-lg">{monthLabel(mk)}</span>


                  <span className="text-xs sm:text-sm text-muted-foreground">{mEntries.length} records</span>


                </div>


                <div className="flex items-center gap-2 shrink-0">


                  <span className={`text-xs sm:text-sm lg:text-base font-black ${mProfit >= 0 ? "text-green-400" : "text-red-400"}`}>


                    {mProfit >= 0 ? "+" : ""}${fmtWhole(mProfit)}


                  </span>


                  <button


                    onClick={ev => { ev.stopPropagation(); handleDownloadMonth(mk); }}


                    disabled={downloadingMonth === mk}


                    className="h-7 px-2 rounded-lg flex items-center gap-1 text-xs font-bold border border-border hover:bg-muted/50 transition disabled:opacity-50"


                    style={downloadedMonth === mk ? { background: "#16a34a", color: "#fff", borderColor: "#16a34a" } : {}}>


                    {downloadingMonth === mk


                      ? <Loader2 className="h-3 w-3 animate-spin" />


                      : downloadedMonth === mk


                      ? <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>


                      : <Download className="h-3 w-3" />}


                    {downloadedMonth === mk ? "Done" : "PDF"}


                  </button>


                  <span className={`text-muted-foreground text-sm transition-transform ${isOpen ? "rotate-180" : ""}`}>▾</span>


                </div>


              </button>





              {/* Expanded rows */}


              {isOpen && (


                <div className="border-t border-border divide-y divide-border/40">


                  {/* Month summary strip */}


                  <div className="grid grid-cols-4 gap-2 px-4 py-2">


                    <div className="text-center">


                      <div className="text-[9px] text-muted-foreground">Cash In</div>


                      <div className="font-black text-xs sm:text-sm lg:text-base text-green-400">${fmtWhole(mIncome)}</div>


                    </div>


                    <div className="text-center">


                      <div className="text-[9px] text-muted-foreground">Payout</div>


                      <div className="font-black text-xs sm:text-sm lg:text-base text-red-400">${fmtWhole(mPayout)}</div>


                    </div>


                    <div className="text-center">


                      <div className="text-[9px] text-muted-foreground">Expense</div>


                      <div className="font-black text-xs sm:text-sm lg:text-base" style={{ color: "#fbbf24" }}>${fmtWhole(mExpense)}</div>


                    </div>


                    <div className="text-center">


                      <div className="text-[9px] text-muted-foreground">Profit</div>


                      <div className="font-black text-xs sm:text-sm lg:text-base" style={{ color: mProfit >= 0 ? "#86efac" : "#fca5a5" }}>


                        {mProfit >= 0 ? "+" : ""}${fmtWhole(mProfit)}


                      </div>


                    </div>


                  </div>


                  {mEntries.map(e => {


                    const m = machines.find(x => x.id === e.machine_id);


                    const isPayout = e.type === "payout" || e.type === "expense";


                    const hasProof = !!e.proof_image_url;


                    return (


                      <div key={e.id} className="px-4 py-3 flex items-start gap-3">


                        <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 border text-xs font-black ${


                          isPayout ? "bg-red-500/15 border-red-500/30 text-red-400" : "bg-green-500/15 border-green-500/30 text-green-400"


                        }`}>


                          {isPayout ? "P" : "I"}


                        </div>


                        <div className="flex-1 min-w-0">


                          <div className="text-xs text-muted-foreground">


                            {new Date(e.created_at).toLocaleString("en-GB", {


                              day: "numeric", month: "short", year: "numeric",


                              hour: "2-digit", minute: "2-digit", hour12: true,


                            })}


                          </div>


                          <div className={`font-black text-sm ${isPayout ? "text-red-400" : "text-green-400"}`}>


                            {isPayout ? "-" : "+"}${fmt(Number(e.amount))}


                          </div>


                          {e.type === "expense"
                            ? <span className="inline-block mt-0.5 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wide" style={{ background: "oklch(0.28 0.06 50)", color: "oklch(0.82 0.18 65)" }}>Cashier Expense</span>
                            : m && <div className="text-xs font-semibold mt-0.5" style={{ color: "var(--primary)" }}>{m.name}</div>
                          }


                          {e.note && <div className="text-xs text-muted-foreground mt-0.5">{e.note}</div>}


                          {e.cashier_name && (


                            <div className="text-[10px] text-white/30 mt-0.5">


                              {isPayout ? "Expense by" : "Cleared by"}: {e.cashier_name}


                            </div>


                          )}





                          {isPayout && hasProof && (


                            <div className="flex items-center gap-1 mt-1">


                              <svg className="h-3 w-3 text-green-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>


                              <span className="text-[10px] font-bold text-green-400">Verified</span>


                            </div>


                          )}


                        </div>


                        {/* Proof photo — landscape, right side */}


                        {e.type === "payout" && !hasProof && (
                          <div className="flex items-center gap-1 mt-1">
                            <AlertTriangle className="h-3 w-3 text-amber-400 shrink-0" />
                            <span className="text-[10px] font-bold text-amber-400">Unverified</span>
                          </div>
                        )}
                        {isPayout && hasProof && (


                          <button


                            onClick={() => setLightboxUrl(e.proof_image_url!)}


                            className="shrink-0 rounded-xl overflow-hidden border border-green-500/30 active:opacity-80 transition"


                            style={{ width: 100, height: 65 }}>


                            <img src={e.proof_image_url!} alt="proof" className="w-full h-full object-cover" loading="lazy" onError={(ev) => { (ev.target as HTMLImageElement).style.display = "none"; }} />


                          </button>


                        )}


                      </div>


                    );


                  })}


                </div>


              )}


            </div>


          );


        })}


      </div>





      {/* Lightbox */}


      {lightboxUrl && (


        <div


          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/90 backdrop-blur-sm"


          onClick={() => setLightboxUrl(null)}


        >


          <img


            src={lightboxUrl}


            alt="proof"


            className="rounded-2xl shadow-2xl"


            style={{ maxWidth: "92vw", maxHeight: "88vh", objectFit: "contain" }}


            onClick={(e) => e.stopPropagation()}


          />


          <button


            onClick={() => setLightboxUrl(null)}


            className="absolute top-4 right-4 h-10 w-10 rounded-full flex items-center justify-center bg-black/60 border border-white/20 text-white active:scale-90 transition"


          >


            <X className="h-5 w-5" />


          </button>


        </div>


      )}


    </div>


  );


}






// ── Summary Tab ─────────────────────────────────────────────────────────────

function SummaryTab({ entries, machines, ownerId }: { entries: MachineEntry[]; machines: Machine[]; ownerId: string }) {

  type SummaryFilter = "all" | "day" | "week" | "month" | "year";
  const [summaryFilter, setSummaryFilter] = useState<SummaryFilter>("all");
  const { t } = useTranslation();
  const today = todayTT();
  const [pickerDate, setPickerDate] = useState(today);
  const [pickerMonth, setPickerMonth] = useState(new Date().getMonth());

  // Machine sessions = machine_float_sessions rows (newest first)
  type FloatSessionRow = { id: string; set_at: string; amount: number };
  const [floatSessions, setFloatSessions] = useState<FloatSessionRow[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [loadingSessionsList, setLoadingSessionsList] = useState(true);

  useEffect(() => {
    if (!ownerId) return;
    setLoadingSessionsList(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from("machine_float_sessions")
      .select("id, set_at, amount")
      .eq("owner_id", ownerId)
      .order("set_at", { ascending: false })
      .then(({ data }: { data: FloatSessionRow[] | null }) => {
        setFloatSessions(data ?? []);
        setLoadingSessionsList(false);
      });
  }, [ownerId]);

  const availableYears = Array.from(
    new Set(entries.map(e => parseInt(e.created_at.slice(0, 4))))
  ).sort((a, b) => b - a);
  const defaultYear = availableYears[0] ?? new Date().getFullYear();
  const [pickerYear, setPickerYear] = useState(defaultYear);

  const handleFilterChange = (f: SummaryFilter) => {
    setSummaryFilter(f);
    setSelectedSessionId(null);
    setPickerDate(today);
    setPickerMonth(new Date().getMonth());
    setPickerYear(availableYears[0] ?? new Date().getFullYear());
  };

  // Filter sessions list by active date tab
  const filteredSessions: FloatSessionRow[] = (() => {
    if (summaryFilter === "all") return floatSessions;
    if (summaryFilter === "day") {
      const s = new Date(pickerDate + "T00:00:00-04:00").toISOString();
      const e = new Date(pickerDate + "T23:59:59-04:00").toISOString();
      return floatSessions.filter(r => r.set_at >= s && r.set_at <= e);
    }
    if (summaryFilter === "week") {
      const we = new Date(pickerDate + "T00:00:00-04:00"); we.setDate(we.getDate() + 6);
      const s = new Date(pickerDate + "T00:00:00-04:00").toISOString();
      const e = new Date(we.toLocaleDateString("en-CA") + "T23:59:59-04:00").toISOString();
      return floatSessions.filter(r => r.set_at >= s && r.set_at <= e);
    }
    if (summaryFilter === "month") {
      const first = new Date(pickerYear, pickerMonth, 1);
      const last  = new Date(pickerYear, pickerMonth + 1, 0);
      const s = new Date(first.toLocaleDateString("en-CA") + "T00:00:00-04:00").toISOString();
      const e = new Date(last.toLocaleDateString("en-CA") + "T23:59:59-04:00").toISOString();
      return floatSessions.filter(r => r.set_at >= s && r.set_at <= e);
    }
    if (summaryFilter === "year") {
      const s = new Date(`${pickerYear}-01-01T00:00:00-04:00`).toISOString();
      const e = new Date(`${pickerYear}-12-31T23:59:59-04:00`).toISOString();
      return floatSessions.filter(r => r.set_at >= s && r.set_at <= e);
    }
    return floatSessions;
  })();

  // Entry range for the selected session:
  // from session.set_at → the next session's set_at (floatSessions sorted newest-first)
  const getEntryRange = (): { startIso: string; endIso: string } | null => {
    if (!selectedSessionId) return null;
    const idx = floatSessions.findIndex(s => s.id === selectedSessionId);
    if (idx === -1) return null;
    const sel = floatSessions[idx];
    // Entries in this session run until the next newer session's set_at (idx-1)
    const newerSession = idx > 0 ? floatSessions[idx - 1] : null;
    return { startIso: sel.set_at, endIso: newerSession ? newerSession.set_at : new Date().toISOString() };
  };

  const entryRange = getEntryRange();
  const sorted = [...entries].sort((a, b) => b.created_at.localeCompare(a.created_at));

  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  if (sorted.length === 0) {
    return <div className="text-center py-12 text-muted-foreground text-sm">No records yet.</div>;
  }

  // Only show data when a session is selected (or "all" tab with nothing selected = all entries)
  const filteredEntries = selectedSessionId && entryRange
    ? sorted.filter(e => e.created_at >= entryRange.startIso && e.created_at <= entryRange.endIso)
    : !selectedSessionId && summaryFilter === "all" ? sorted
    : [];

  const totalMachinePayout = filteredEntries.filter(e => e.type === "payout").reduce((s, e) => s + Number(e.amount), 0);
  const totalSessionExpense = filteredEntries.filter(e => e.type === "expense").reduce((s, e) => s + Number(e.amount), 0);
  const totalExpense = totalMachinePayout + totalSessionExpense;
  const totalIncome = filteredEntries.filter(e => e.type === "income").reduce((s, e) => s + Number(e.amount), 0);
  const totalProfit = totalIncome - totalExpense;

  // Expense entries list (manual session-level expenses)
  const expenseEntries = filteredEntries.filter(e => e.type === "expense");

  if (sorted.length === 0) {
    return <div className="text-center py-12 text-muted-foreground text-sm">No records yet.</div>;
  }

  // Machine breakdown — only payout/income entries (expense entries are session-level, not per-machine)
  const machineStats: Record<string, { name: string; income: number; payout: number }> = {};
  filteredEntries.filter(e => e.type !== "expense").forEach(e => {
    const m = machines.find(x => x.id === e.machine_id);
    const name = m?.name ?? "Unknown";
    if (!machineStats[e.machine_id]) machineStats[e.machine_id] = { name, income: 0, payout: 0 };
    if (e.type === "income") machineStats[e.machine_id].income += Number(e.amount);
    else machineStats[e.machine_id].payout += Number(e.amount);
  });
  const statList = Object.values(machineStats);
  const byIncome = [...statList].sort((a, b) => b.income - a.income);
  const byPayout = [...statList].sort((a, b) => b.payout - a.payout);
  const profitList = [...statList].map(m => ({ ...m, profit: m.income - m.payout })).sort((a, b) => b.profit - a.profit);

  const handleDownloadPdf = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "mm", format: "a4" });
      const generated = new Date().toLocaleString("en-GB", {
        hour: "2-digit", minute: "2-digit", hour12: true,
        day: "numeric", month: "short", year: "numeric",
      });
      // Build title from active filter
      let title = "All Time";
      if (selectedSessionId) {
        const s = floatSessions.find(b => b.id === selectedSessionId);
        if (s) title = "Session: " + new Date(s.set_at).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
      } else if (summaryFilter !== "all") {
        title = summaryFilter.charAt(0).toUpperCase() + summaryFilter.slice(1);
      }
      let y = await drawHeader(doc, "All Machines", "Summary", title, generated);
      const bw = RM - LM;
      // Summary box
      doc.setFillColor(245, 240, 230);
      doc.roundedRect(LM, y, bw, 26, 2, 2, "F");
      doc.setDrawColor(232, 146, 42); doc.setLineWidth(0.4);
      doc.roundedRect(LM, y, bw, 26, 2, 2, "S");
      const cols = [
        { label: "Cash In",       value: "+$" + fmtWhole(totalIncome),          r: 40,  g: 140, b: 40 },
        { label: "Payout",        value: "-$" + fmtWhole(totalMachinePayout),   r: 180, g: 40,  b: 40 },
        { label: "Expense",       value: "-$" + fmtWhole(totalSessionExpense),  r: 180, g: 140, b: 0 },
        { label: "Net Profit",    value: (totalProfit >= 0 ? "+" : "") + "$" + fmtWhole(totalProfit), r: totalProfit >= 0 ? 40 : 180, g: totalProfit >= 0 ? 140 : 40, b: 40 },
      ];
      const cw = bw / 4;
      cols.forEach((c, i) => {
        const cx = LM + i * cw + cw / 2;
        doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(100, 100, 100);
        doc.text(c.label, cx, y + 10, { align: "center" });
        doc.setFont("helvetica", "bold"); doc.setFontSize(9);
        doc.setTextColor(c.r, c.g, c.b);
        doc.text(c.value, cx, y + 19, { align: "center" });
      });
      doc.setTextColor(0, 0, 0); y += 32;
      // Machine breakdown
      if (statList.length > 0) {
        doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(80, 80, 80);
        doc.text("Machine Breakdown", LM, y); y += 6;
        doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(130, 130, 130);
        doc.text("MACHINE", LM, y); doc.text("INCOME", LM + 80, y, { align: "right" }); doc.text("PAYOUT", LM + 130, y, { align: "right" }); doc.text("PROFIT", RM, y, { align: "right" });
        y += 3; doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.2); doc.line(LM, y, RM, y); y += 4;
        doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(0, 0, 0);
        profitList.forEach(m => {
          if (y > CONTENT_BOTTOM) { doc.addPage(); y = 20; }
          const isPos = m.profit >= 0;
          doc.text(m.name, LM, y);
          doc.setTextColor(40, 140, 40); doc.text("$" + fmtWhole(m.income), LM + 80, y, { align: "right" });
          doc.setTextColor(180, 40, 40); doc.text("$" + fmtWhole(m.payout), LM + 130, y, { align: "right" });
          doc.setTextColor(isPos ? 40 : 180, isPos ? 140 : 40, 40); doc.text((isPos ? "+" : "") + "$" + fmtWhole(m.profit), RM, y, { align: "right" });
          doc.setTextColor(0, 0, 0); y += 5;
        });
        y += 4;
      }
      // Expenses list
      if (expenseEntries.length > 0) {
        doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(80, 80, 80);
        doc.text("Expenses", LM, y); y += 6;
        doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(0, 0, 0);
        expenseEntries.forEach(e => {
          if (y > CONTENT_BOTTOM) { doc.addPage(); y = 20; }
          const label = e.note || new Date(e.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
          doc.text(label, LM, y);
          doc.setTextColor(180, 40, 40); doc.text("-$" + fmtWhole(Number(e.amount)), RM, y, { align: "right" });
          doc.setTextColor(0, 0, 0); y += 5;
        });
      }
      addFootersToAllPages(doc);
      await downloadPdf("machines-summary.pdf", doc.output("datauristring"));
      setDownloaded(true);
      setTimeout(() => setDownloaded(false), 4000);
    } catch (err: any) { toast.error("PDF failed: " + err?.message); }
    finally { setDownloading(false); }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-border p-3 space-y-3" style={{ background: "var(--gradient-card)" }}>

        {/* Header row: filter tabs + PDF button */}
        <div className="flex items-center gap-2">
          <div className="flex gap-1 flex-1">
            {(["all", "day", "week", "month", "year"] as SummaryFilter[]).map(f => (
              <button key={f} onClick={() => handleFilterChange(f)}
                className="flex-1 h-8 rounded-lg text-[10px] font-black transition active:scale-95 capitalize"
                style={summaryFilter === f && !selectedSessionId
                  ? { background: "var(--gradient-hero)", color: "var(--primary-foreground)" }
                  : { background: "oklch(0.22 0.02 60)", color: "rgba(255,255,255,0.5)" }}>
                {f === "all" ? t("all", "All") : f === "day" ? "Day" : f === "week" ? t("filter_week", "Week") : f === "month" ? t("filter_month", "Month") : t("filter_year", "Year")}
              </button>
            ))}
          </div>
          <Button size="sm" variant="outline" className="h-8 gap-1 font-black text-xs shrink-0"
            disabled={downloading}
            onClick={handleDownloadPdf}
            style={downloaded ? { background: "#16a34a", color: "#fff", borderColor: "#16a34a" } : {}}>
            {downloading
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : downloaded
              ? <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              : <Download className="h-3 w-3" />}
            PDF
          </Button>
        </div>

        {/* Sessions list — filtered by active date tab, always visible */}
        <div className="space-y-1">
          <p className="text-[9px] font-black text-white/40 uppercase tracking-wider">
            {filteredSessions.length > 0 ? t("sessions_count", `Sessions (${filteredSessions.length})`) : t("sessions", "Sessions")}
          </p>
          {loadingSessionsList ? (
            <div className="h-8 rounded-xl bg-muted/30 animate-pulse" />
          ) : filteredSessions.length === 0 ? (
            <p className="text-[10px] text-white/30 text-center py-2">No sessions for this period</p>
          ) : (
            <div className="rounded-xl border border-border/40 p-1" style={{ background: "oklch(0.18 0.015 60)" }}>
              <div className="space-y-1 max-h-44 overflow-y-auto pr-1" style={{ scrollbarWidth: "thin", scrollbarColor: "var(--primary) transparent" }}>
                {filteredSessions.map(s => {
                  const isSelected = selectedSessionId === s.id;
                  const fmtd = new Date(s.set_at).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
                  return (
                    <button key={s.id}
                      onClick={() => setSelectedSessionId(isSelected ? null : s.id)}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-left transition active:scale-[0.98]"
                      style={isSelected
                        ? { background: "var(--gradient-hero)", color: "var(--primary-foreground)" }
                        : { background: "oklch(0.22 0.02 60)", color: "rgba(255,255,255,0.7)" }}>
                      <span className="text-[10px] font-bold truncate">{fmtd}</span>
                      <span className="text-[9px] shrink-0 ml-2" style={{ color: isSelected ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.4)" }}>
                        Float ${fmtWhole(Number(s.amount))}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Date pickers */}
        {summaryFilter === "day" && (
          <CalendarPopover label={t("select_day", "Select Day")} value={pickerDate} maxDate={today} onChange={v => { setPickerDate(v); setSelectedSessionId(null); }} />
        )}
        {summaryFilter === "week" && (
          <div className="space-y-1">
            <CalendarPopover label="Inicio de Semana" value={pickerDate} maxDate={today} onChange={v => { setPickerDate(v); setSelectedSessionId(null); }} />
            <p className="text-xs text-muted-foreground pl-1">
              {(() => { const d = new Date(pickerDate + "T12:00:00"); d.setDate(d.getDate() + 6); return `${new Date(pickerDate + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })} → ${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`; })()}
            </p>
          </div>
        )}
        {summaryFilter === "month" && (
          <div className="flex gap-2">
            <select value={pickerMonth} onChange={e => { setPickerMonth(Number(e.target.value)); setSelectedSessionId(null); }}
              className="flex-1 h-9 rounded-xl border border-border bg-background px-2 text-xs font-bold outline-none">
              {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
            <select value={pickerYear} onChange={e => { setPickerYear(Number(e.target.value)); setSelectedSessionId(null); }}
              className="w-20 h-9 rounded-xl border border-border bg-background px-2 text-xs font-bold outline-none">
              {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        )}
        {summaryFilter === "year" && (
          <select value={pickerYear} onChange={e => { setPickerYear(Number(e.target.value)); setSelectedSessionId(null); }}
            className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm font-bold outline-none">
            {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        )}

        {/* Stats — shown when session selected or on All tab */}
        {filteredEntries.length > 0 && (
          <>
            <div className="grid grid-cols-4 gap-2">
              <div className="rounded-xl px-2 py-2 text-center" style={{ background: "oklch(0.22 0.02 60)" }}>
                <div className="text-[9px] font-semibold text-white/40 uppercase tracking-wider">{t("income", "Income")}</div>
                <div className="font-black text-xs text-green-400">${fmtWhole(totalIncome)}</div>
              </div>
              <div className="rounded-xl px-2 py-2 text-center" style={{ background: "oklch(0.22 0.02 60)" }}>
                <div className="text-[9px] font-semibold text-white/40 uppercase tracking-wider">{t("payout", "Payout")}</div>
                <div className="font-black text-xs text-red-400">${fmtWhole(totalMachinePayout)}</div>
              </div>
              <div className="rounded-xl px-2 py-2 text-center" style={{ background: "oklch(0.22 0.02 60)" }}>
                <div className="text-[9px] font-semibold text-white/40 uppercase tracking-wider">{t("add_expense", "Expense")}</div>
                <div className="font-black text-xs text-yellow-400">${fmtWhole(totalSessionExpense)}</div>
              </div>
              <div className="rounded-xl px-2 py-2 text-center" style={{ background: "oklch(0.22 0.02 60)" }}>
                <div className="text-[9px] font-semibold text-white/40 uppercase tracking-wider">{t("net_profit", "Net Profit")}</div>
                <div className="font-black text-xs" style={{ color: totalProfit >= 0 ? "#86efac" : "#fca5a5" }}>
                  {totalProfit >= 0 ? "+" : ""}${fmtWhole(totalProfit)}
                </div>
              </div>
            </div>
            {statList.length > 0 && (
              <div className="space-y-2 pt-1 border-t border-border/40">
                <div>
                  <p className="text-[9px] font-black text-green-400/70 uppercase tracking-wider mb-1.5">{t("income", "Machine Income")}</p>
                  <div className="space-y-1">
                    {byIncome.map((m, i) => (
                      <div key={m.name + "i"} className="flex items-center gap-2">
                        <span className="text-[9px] font-black text-white/30 w-4 shrink-0">{i + 1}</span>
                        <span className="text-xs font-black text-white/80 truncate flex-1">{m.name}</span>
                        <span className="text-xs font-black text-green-400 shrink-0">${fmtWhole(m.income)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[9px] font-black text-red-400/70 uppercase tracking-wider mb-1.5">{t("payout", "Machine Payout")}</p>
                  <div className="space-y-1">
                    {byPayout.filter(m => m.payout > 0).map((m, i) => (
                      <div key={m.name + "p"} className="flex items-center gap-2">
                        <span className="text-[9px] font-black text-white/30 w-4 shrink-0">{i + 1}</span>
                        <span className="text-xs font-black text-white/80 truncate flex-1">{m.name}</span>
                        <span className="text-xs font-black text-red-400 shrink-0">${fmtWhole(m.payout)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-wider mb-1.5" style={{ color: "rgba(134,239,172,0.7)" }}>Machine Profit</p>
                  <div className="space-y-1">
                    {profitList.map((m, i) => {
                      const isPos = m.profit >= 0;
                      return (
                        <div key={m.name + "prof"} className="flex items-center gap-2">
                          <span className="text-[9px] font-black text-white/30 w-4 shrink-0">{i + 1}</span>
                          <span className="text-xs font-black text-white/80 truncate flex-1">{m.name}</span>
                          <span className="text-xs font-black shrink-0" style={{ color: isPos ? "#86efac" : "#f472b6" }}>
                            {isPos ? "+" : ""}${fmtWhole(m.profit)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                {expenseEntries.length > 0 && (
                  <div>
                    <p className="text-[9px] font-black text-amber-400/70 uppercase tracking-wider mb-1.5">Expense</p>
                    <div className="space-y-1">
                      {expenseEntries.map((e, i) => (
                        <div key={e.id} className="flex items-center gap-2">
                          <span className="text-[9px] font-black text-white/30 w-4 shrink-0">{i + 1}</span>
                          <span className="text-xs text-white/60 truncate flex-1">
                            {e.note || new Date(e.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                          </span>
                          <span className="text-xs font-black text-amber-400 shrink-0">${fmtWhole(Number(e.amount))}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {!selectedSessionId && summaryFilter !== "all" && filteredSessions.length > 0 && (
          <p className="text-[10px] text-white/40 text-center py-1">Select a session above to view its breakdown</p>
        )}
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────





const MASTER_EMAILS = ["renard.sankersingh@gmail.com"];

/** Returns true if this owner has premium access (premium/chain plan OR master account) */
function hasPremiumAccess(profile: { plan_type?: string } | null, email?: string | null): boolean {
  if (!profile) return false;
  if (email && MASTER_EMAILS.includes(email)) return true;
  return profile.plan_type === "premium" || profile.plan_type === "chain";
}





export default function MachinesPage() {


  const { profile, user } = useAuth();


  const { effectiveOwnerId, isChainOwner, activeBarId, setActiveBarId } = useChain();


  const { t } = useTranslation();


  const navigate = useNavigate();


  const [machines, setMachines] = useState<Machine[]>([]);


  const [entries, setEntries] = useState<MachineEntry[]>([]);


  const [loading, setLoading] = useState(true);


  const [tab, setTab] = useState<"screens" | "allHistory" | "summary" | "create">("screens");


  const [selected, setSelected] = useState<Machine | null>(null);


  const [selectedScreenNum, setSelectedScreenNum] = useState(0);


  const [selectedInitialTab, setSelectedInitialTab] = useState<"payout" | "income" | "history" | "monitor">("payout");





  // Cashiers see their owner's machines; owners see their own


  const isSubAccount = profile?.role === "cashier" || profile?.role === "manager" || (profile as any)?.job_title === "manager";
  const ownerId = effectiveOwnerId(isSubAccount ? ((profile as any)?.parent_id ?? profile?.id ?? "") : (profile?.id ?? ""));


  const isOwner = profile?.role === "owner";
  const isManager = profile?.role === "manager" || (profile as any)?.job_title === "manager";


  // Bar session state — used by ScreensTab for session stats anchor
  const [barSessionStart, setBarSessionStart] = useState<string | null>(null);
  const [barClosedAtMachines, setBarClosedAtMachines] = useState<string | null>(null);
  // Increment to force ScreensTab to re-query monitor logs after a log edit/delete
  const [monitorRefreshKey, setMonitorRefreshKey] = useState(0);
  const [barSessionLoadingMachines, setBarSessionLoadingMachines] = useState(true);
  const [barOverlayReadyMachines, setBarOverlayReadyMachines] = useState(false);
  const barIsOpenMachines = !!barSessionStart && !barClosedAtMachines;

  useEffect(() => {
    if (!ownerId) return;
    setBarSessionLoadingMachines(true);
    setBarOverlayReadyMachines(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from("profiles")
      .select("bar_session_start, bar_closed_at")
      .eq("id", ownerId)
      .single()
      .then(({ data }: { data: { bar_session_start: string | null; bar_closed_at: string | null } | null }) => {
        setBarSessionStart(data?.bar_session_start ?? null);
        setBarClosedAtMachines(data?.bar_closed_at ?? null);
        setBarSessionLoadingMachines(false);
        setTimeout(() => setBarOverlayReadyMachines(true), 150);
      });
    const ch = supabase.channel("machines-page-bar-session-" + ownerId)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: "id=eq." + ownerId },
        (payload: any) => {
          const r = payload.new as Record<string, unknown>;
          if ("bar_session_start" in r) setBarSessionStart((r.bar_session_start as string | null) ?? null);
          if ("bar_closed_at" in r) setBarClosedAtMachines((r.bar_closed_at as string | null) ?? null);
        }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [ownerId]);





  // Register tap handler so tapping a payout alert notification navigates here


  useEffect(() => {


    let cleanup = () => {};


    registerPayoutAlertTapHandler((to) => navigate({ to })).then((fn) => { cleanup = fn; });


    return () => cleanup();


  }, [navigate]);





  // Auto-open a specific machine if the user arrived via a payout alert tap or toast action


  useEffect(() => {


    const targetName = localStorage.getItem(ALERT_OPEN_MACHINE_KEY);


    const targetBar  = localStorage.getItem(ALERT_OPEN_BAR_KEY);


    const targetTab  = localStorage.getItem("payout_alert_open_tab") as "history" | null;


    if (!targetName || machines.length === 0) return;


    localStorage.removeItem(ALERT_OPEN_MACHINE_KEY);


    localStorage.removeItem(ALERT_OPEN_BAR_KEY);


    localStorage.removeItem("payout_alert_open_tab");


    // Switch to the bar the alert came from if needed


    if (targetBar && targetBar !== ownerId) {


      setActiveBarId(targetBar);


    }


    const match = machines.find(m => m.name === targetName);


    if (match) {


      const screenNum = machines.filter(m => m.name <= match.name).length;


      setSelected(match);


      setSelectedScreenNum(screenNum);


      setSelectedInitialTab(targetTab === "history" ? "history" : "payout");


    }


  }, [machines]); // eslint-disable-line react-hooks/exhaustive-deps





  // Payout alert settings — scoped per bar so each bar can have its own threshold


  const [showAlertsModal, setShowAlertsModal] = useState(false);


  const [alertSettings, setAlertSettings] = useState<AlertSettings>(() => loadAlertSettings(ownerId));





  // Reload settings when active bar changes


  useEffect(() => {


    setAlertSettings(loadAlertSettings(ownerId));


  }, [ownerId]);





  const handleSaveAlerts = async (next: AlertSettings) => {


    if (next.enabled && !alertSettings.enabled) {


      const granted = await requestNotificationPermission();


      if (!granted) {


        toast.error("Notification permission denied. Enable it in device settings.");


        return;


      }


    }


    saveAlertSettings(next, ownerId);


    setAlertSettings(next);


    // Sync to Supabase keyed by barId so edge function reads correct settings


    await syncAlertSettingsToServer(ownerId, next);


    toast.success(next.enabled ? `Alert set — $${next.threshold.toLocaleString()} TT threshold` : "Alerts disabled");


    setShowAlertsModal(false);


  };





  // Premium gate — check owner's plan (cashiers inherit from owner)


  const [ownerPlanType, setOwnerPlanType] = useState<string | null>(null);


  const [ownerMachinesAddon, setOwnerMachinesAddon] = useState(false);


  const [isBarAccount, setIsBarAccount] = useState(false);


  const [planLoading, setPlanLoading] = useState(true);


  const [enablingMachines, setEnablingMachines] = useState(false);


  const [showEnableConfirm, setShowEnableConfirm] = useState(false);





  useEffect(() => {


    if (!ownerId) return;


    (supabase as any).from("profiles").select("plan_type, machines_addon_active, is_bar_account").eq("id", ownerId).single()


      .then(({ data }: { data: { plan_type: string; machines_addon_active: boolean; is_bar_account: boolean } | null }) => {


        setOwnerPlanType(data?.plan_type ?? "basic");


        setOwnerMachinesAddon(data?.machines_addon_active ?? false);


        setIsBarAccount(data?.is_bar_account ?? false);


        setPlanLoading(false);


      });


  }, [ownerId]);





  const handleEnableMachines = async () => {


    if (!ownerId) return;


    setEnablingMachines(true);


    const { error } = await (supabase as any)


      .from("profiles")


      .update({ machines_addon_active: true })


      .eq("id", ownerId);


    setEnablingMachines(false);


    if (error) { toast.error("Failed to enable machines: " + error.message); return; }


    setOwnerMachinesAddon(true);


    setShowEnableConfirm(false);


    toast.success("Machines enabled for this bar");


  };





  const isPremium = ownerPlanType === "premium" || MASTER_EMAILS.includes(user?.email ?? "");





  // Float — one session covers ALL machines for this owner


  const [floatSession, setFloatSession] = useState<FloatSession | null>(null);


  const [showSetFloat, setShowSetFloat] = useState(false);


  const [showAddMachineExpense, setShowAddMachineExpense] = useState(false);


  const [expenseMachineId, setExpenseMachineId] = useState<string | null>(null);


  const [expenseAmount, setExpenseAmount] = useState("");


  const [expenseNote, setExpenseNote] = useState("");


  const [savingExpense, setSavingExpense] = useState(false);


  const [floatAmount, setFloatAmount] = useState("");


  const [machineFloatMode, setMachineFloatMode] = useState<"same" | "new">("new");


  const [savingFloat, setSavingFloat] = useState(false);





  // Grid-level machine delete modal


  const [deleteTarget, setDeleteTarget] = useState<Machine | null>(null);


  const [deletingMachine, setDeletingMachine] = useState(false);





  const handleGridDeleteMachine = async (wipeRecords: boolean) => {


    if (!deleteTarget) return;


    setDeletingMachine(true);


    if (wipeRecords) {


      await sb.from("machine_entries").delete().eq("machine_id", deleteTarget.id);


    }


    const { error } = await sb.from("machines").delete().eq("id", deleteTarget.id);


    setDeletingMachine(false);


    if (error) { toast.error(error.message); return; }


    toast.success(`${deleteTarget.name} deleted`);


    setDeleteTarget(null);


    load();


  };





  const loadFloat = useCallback(async () => {


    if (!ownerId) return;


    const { data } = await sb.from("machine_float_sessions")


      .select("*").eq("owner_id", ownerId)


      .order("set_at", { ascending: false }).limit(1).maybeSingle();


    setFloatSession(data as FloatSession | null);


  }, [ownerId]);





  const handleSetFloat = async () => {


    const val = parseFloat(floatAmount);


    if (isNaN(val) || val < 0) { toast.error("Enter a valid amount"); return; }


    setSavingFloat(true);


    let error: any = null;


    if (machineFloatMode === "same" && floatSession) {


      // Same Session — add to existing float amount, payouts stay intact
      const newAmount = Number(floatSession.amount) + val;


      ({ error } = await sb.from("machine_float_sessions")


        .update({ amount: newAmount })


        .eq("id", floatSession.id));


      if (!error) toast.success(`Float topped up by $${val.toFixed(2)} — total now $${newAmount.toFixed(2)}`);


    } else {


      // New Session — fresh row, payout counter resets to $0
      ({ error } = await sb.from("machine_float_sessions").insert({


        owner_id: ownerId,


        amount: val,


        set_at: new Date().toISOString(),


      }));


      if (!error) toast.success(val === 0 ? "Float cleared" : "New machine session — float set to $" + val.toFixed(2));


    }


    setSavingFloat(false);


    if (error) { toast.error(error.message); return; }


    setFloatAmount(""); setMachineFloatMode("new"); setShowSetFloat(false);


    loadFloat();


  };


  const handleSaveMachineExpense = async () => {


    const val = parseFloat(expenseAmount);


    if (isNaN(val) || val <= 0) { toast.error("Enter a valid amount"); return; }


    if (remainingFloat === null) { toast.error("Set a float before adding an expense"); return; }


    if (val > remainingFloat) { toast.error(`Expense $${val.toFixed(2)} exceeds remaining float $${remainingFloat.toFixed(2)}`); return; }


    // Session-level expense — not tied to any specific machine.
    // We still need a machine_id for the FK, so we use the first available.
    const targetMachineId = machines[0]?.id ?? null;


    setSavingExpense(true);


    const now = new Date();


    const { error } = await sb.from("machine_entries").insert({


      machine_id: targetMachineId,


      owner_id: ownerId,


      type: "expense",


      amount: val,


      note: expenseNote.trim() || null,


      entry_date: now.toISOString().slice(0, 10),


      created_at: now.toISOString(),


      cashier_id: profile!.id,


      cashier_name: profile!.username ?? null,


      proof_image_url: null,


    });


    setSavingExpense(false);


    if (error) { toast.error(error.message); return; }


    toast.success("Expense recorded");


    setShowAddMachineExpense(false);


    load();


  };





  const load = useCallback(async () => {


    if (!ownerId) return;


    setLoading(true);


    const [mRes, eRes] = await Promise.all([


      sb.from("machines").select("*").eq("owner_id", ownerId).order("name"),


      sb.from("machine_entries").select("*").eq("owner_id", ownerId)


        .order("entry_date", { ascending: false }),


    ]);


    setMachines((mRes.data ?? []) as Machine[]);


    setEntries((eRes.data ?? []) as MachineEntry[]);


    setLoading(false);


  }, [ownerId]);





  useEffect(() => { load(); loadFloat(); }, [load, loadFloat]);





  useEffect(() => {


    if (!ownerId) return;


    const ch = supabase.channel(`machines-page-${ownerId}`)


      .on("postgres_changes", { event: "*", schema: "public", table: "machines",


        filter: `owner_id=eq.${ownerId}` }, () => load())


      .on("postgres_changes", { event: "*", schema: "public", table: "machine_entries",


        filter: `owner_id=eq.${ownerId}` }, () => { load(); })


      .on("postgres_changes", { event: "*", schema: "public", table: "machine_float_sessions",


        filter: `owner_id=eq.${ownerId}` }, () => loadFloat())


      .subscribe();


    return () => { supabase.removeChannel(ch); };


  }, [ownerId, load, loadFloat]);





  // Session payouts = all payouts + expenses across ALL machines since float was last set
  const sessionPayouts = floatSession
    ? entries
        .filter(e => (e.type === "payout" || e.type === "expense") && new Date(e.created_at) >= new Date(floatSession.set_at))
        .reduce((s, e) => s + Number(e.amount), 0)
    : 0;

  const remainingFloat = floatSession ? Number(floatSession.amount) - sessionPayouts : null;





  if (!profile) return null;





  // Show loading while we check the plan


  if (planLoading) {


    return (


      <div className="flex justify-center py-20">


        <Loader2 className="h-8 w-8 animate-spin text-primary" />


      </div>


    );


  }





  // Premium gate — basic plan users without machines add-on see an upgrade wall


  // Chain bar sub-accounts without machines see a simple "Enable" button instead


  if (!isPremium && !ownerMachinesAddon) {


    // ── Chain bar: one-tap enable (no billing needed, already on chain plan) ──


    if (isChainOwner && isBarAccount) {


      return (


        <div className="py-6 space-y-6 max-w-lg mx-auto">


          <h1 className="text-2xl font-black">{t("machines_title", "Machines")}</h1>





          <div className="rounded-3xl border border-amber-500/30 overflow-hidden"


            style={{ background: "linear-gradient(160deg, #1a1a2e 0%, #16213e 60%, #0f3460 100%)" }}>


            <div className="px-6 pt-8 pb-6 text-center space-y-3">


              <div className="h-16 w-16 rounded-2xl flex items-center justify-center mx-auto"


                style={{ background: "rgba(251,146,60,0.15)", border: "1px solid rgba(251,146,60,0.4)" }}>


                <Gamepad2 className="h-8 w-8" style={{ color: "var(--primary)" }} />


              </div>


              <h2 className="text-xl font-black text-white">Machines Tracker</h2>


              <p className="text-sm text-white/50 mt-2 leading-relaxed">


                This bar was created without machines. Enable it to start tracking payouts, income and profit.


              </p>


              <p className="text-xs font-black text-amber-400/80 mt-1">


                âš  This cannot be undone — the bar will become Bar + Machines permanently.


              </p>


            </div>


          </div>





          {!showEnableConfirm ? (


            <Button


              onClick={() => setShowEnableConfirm(true)}


              className="w-full h-14 text-base font-black gap-2"


              style={{ background: "var(--gradient-hero)" }}


            >


              <Gamepad2 className="h-5 w-5" />


              Enable Machines for this Bar


            </Button>


          ) : (


            <div className="rounded-2xl border border-amber-500/40 p-5 space-y-4"


              style={{ background: "rgba(251,146,60,0.06)" }}>


              <p className="text-sm font-black text-amber-400 text-center">


                Are you sure? This bar will permanently become Bar + Machines.


              </p>


              <div className="flex gap-3">


                <Button


                  variant="outline"


                  className="flex-1 h-12 font-black"


                  onClick={() => setShowEnableConfirm(false)}


                  disabled={enablingMachines}


                >


                  Cancel


                </Button>


                <Button


                  className="flex-1 h-12 font-black bg-amber-500 hover:bg-amber-600 text-black"


                  onClick={handleEnableMachines}


                  disabled={enablingMachines}


                >


                  {enablingMachines ? <Loader2 className="h-4 w-4 animate-spin" /> : "Yes, Enable"}


                </Button>


              </div>


            </div>


          )}


        </div>


      );


    }





    // ── Regular basic plan: show billing upgrade wall ──


    return (


      <div className="py-3 space-y-4">


        <h1 className="text-2xl font-black">{t("machines_title", "Machines")}</h1>





        {/* ── Hero card ─────────────────────────────────────────────────── */}


        <div className="rounded-3xl border border-amber-500/30 overflow-hidden"


          style={{ background: "linear-gradient(160deg, #1a1a2e 0%, #16213e 60%, #0f3460 100%)" }}>


          <div className="px-6 pt-8 pb-6 text-center space-y-3">


            <div className="h-16 w-16 rounded-2xl flex items-center justify-center mx-auto"


              style={{ background: "rgba(251,146,60,0.15)", border: "1px solid rgba(251,146,60,0.4)" }}>


              <Gamepad2 className="h-8 w-8" style={{ color: "var(--primary)" }} />


            </div>


            <span className="inline-block px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider"


              style={{ background: "rgba(251,146,60,0.18)", color: "rgba(251,146,60,0.9)", border: "1px solid rgba(251,146,60,0.35)" }}>


              Basic Plan — Active


            </span>


            <div>


              <h2 className="text-xl font-black text-white">Machines Tracker</h2>


              <p className="text-sm text-white/50 mt-2 leading-relaxed">


                Track payouts, income and profit across all your gaming machines. Upgrade to unlock this feature.


              </p>


            </div>


          </div>


        </div>





        {/* ── Upgrade section ───────────────────────────────────────────── */}


        <div className="mt-6 space-y-3">


          <p className="text-xs font-black uppercase tracking-widest px-1"


            style={{ color: "rgba(251,146,60,0.7)" }}>


            Upgrade


          </p>





          {/* Option 1 — Machines Add-on */}


          <div>


            <p className="text-sm font-black text-white mb-2 px-1">Machines Add-on</p>


            <a href="/billing?upgrade=machines_addon"


              className="block rounded-2xl p-4 text-left space-y-2 active:scale-[0.98] transition"


              style={{


                background: "rgba(251,146,60,0.08)",


                border: "1.5px solid rgba(251,146,60,0.6)",


                boxShadow: "0 0 18px 2px rgba(251,146,60,0.25)",


              }}>


              <p className="text-2xl font-black" style={{ color: "var(--primary)" }}>$600 TT/yr</p>


              <p className="text-xs text-white/60">Add Machines Tracker to your existing Basic plan. You'll have two separate subscriptions.</p>


              <p className="text-xs font-black mt-1" style={{ color: "var(--primary)" }}>Tap to go to Billing â†’</p>


            </a>


          </div>





          {/* Option 2 — Upgrade to Premium */}


          <div>


            <p className="text-sm font-black text-white mb-2 px-1">Upgrade to Premium</p>


            <a href="/billing?upgrade=premium"


              className="block rounded-2xl p-4 text-left space-y-2 active:scale-[0.98] transition"


              style={{


                background: "rgba(251,146,60,0.05)",


                border: "1.5px solid rgba(251,146,60,0.6)",


                boxShadow: "0 0 18px 2px rgba(251,146,60,0.25)",


              }}>


              <p className="text-2xl font-black text-amber-400">$1,300 TT/yr</p>


              <p className="text-xs text-white/60">Replace your Basic plan with one Premium subscription covering everything.</p>


              <p className="text-xs font-black text-amber-400 mt-1">Tap to go to Billing â†’</p>


            </a>


          </div>


        </div>





      </div>


    );


  }





  const screenNumber = selectedScreenNum;





  const maxScreens =
    ownerPlanType === "premium_20" || ownerPlanType === "machines_only_20" ? 20 : 10;

  const tabs = [


    { key: "screens", label: `${t("screens", "Machines")} ${machines.length}/${maxScreens}` },


    ...(isOwner ? [{ key: "allHistory", label: t("all_history", "All History") }] : []),


    ...(isOwner ? [{ key: "summary", label: t("summary", "Summary") }] : []),


    ...(isOwner ? [{ key: "create", label: t("create_machine", "Create") }] : []),


  ] as const;





  return (


    <>


      {/* ── Machines locked when bar is closed ── */}
      {barOverlayReadyMachines && !barSessionLoadingMachines && !barIsOpenMachines && (
        <div className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-black/85 backdrop-blur-sm px-6">
          <div className="w-full max-w-sm rounded-3xl border border-border shadow-2xl overflow-hidden text-center"
            style={{ background: "var(--gradient-card)" }}>
            <div className="px-6 pt-8 pb-6">
              <div className="text-5xl mb-4">🔒</div>
              <h2 className="font-black text-xl mb-2">Machines Locked</h2>
              <p className="text-sm text-muted-foreground leading-snug">
                The bar is closed. Machine records are view-only until the owner opens a new bar session.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* MachineDetail overlays the list but keeps MachinesPage mounted so


          realtime channels stay alive and float/entries update in the background */}


      {selected && createPortal(


        <MachineDetail


          machine={selected}


          screenNumber={screenNumber}


          ownerId={ownerId}


          profile={{ id: profile.id, username: profile.username ?? undefined, role: profile.role ?? undefined, job_title: (profile as any).job_title ?? undefined }}


          floatSession={floatSession}


          remainingFloat={remainingFloat}


          barSessionStart={barSessionStart}


          barClosedAt={barClosedAtMachines}


          initialTab={selectedInitialTab}


          onBack={() => { setSelected(null); load(); }}


          onDeleted={() => { setSelected(null); load(); }}


          onMonitorLogChange={() => setMonitorRefreshKey(k => k + 1)}


        />,


        document.body


      )}





      {/* List view — always mounted, hidden behind MachineDetail when a machine is selected */}


      <div className="py-3 space-y-4" style={selected ? { visibility: "hidden", pointerEvents: "none" } : {}}>


      <div className="flex items-center justify-between">


        <h1 className="text-2xl font-black">{t("machines_title", "Machines")}</h1>


        {isOwner && (


          <button


            onClick={() => setShowAlertsModal(true)}


            className="flex items-center gap-1.5 h-9 px-3 rounded-xl font-bold text-xs transition active:scale-95"


            style={{


              background: alertSettings.enabled ? "rgba(251,146,60,0.18)" : "var(--gradient-card)",


              color: alertSettings.enabled ? "var(--primary)" : "var(--muted-foreground)",


              border: alertSettings.enabled ? "1px solid rgba(251,146,60,0.4)" : "1px solid var(--border)",


            }}


          >


            <Bell className={`h-3.5 w-3.5 ${alertSettings.enabled ? "fill-current" : ""}`} />


            {t("set_alerts", "Alerts")}


            {alertSettings.enabled && (


              <span className="h-4 w-4 rounded-full flex items-center justify-center text-[9px] font-black text-black"


                style={{ background: "var(--gradient-hero)" }}>


                ✓


              </span>


            )}


          </button>


        )}


      </div>


      {/* Tab bar */}


      <div className="flex gap-1 rounded-2xl p-1" style={{ background: "var(--gradient-card)" }}>


        {tabs.map((t) => (


          <button key={t.key} onClick={() => setTab(t.key as typeof tab)}


            className={`flex-1 py-2.5 rounded-xl text-sm font-black transition ${


              tab === t.key ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"


            }`}


            style={tab === t.key ? { background: "var(--gradient-hero)" } : {}}>


            {t.label}


          </button>


        ))}


      </div>


      {loading ? (


        <div className="grid grid-cols-3 gap-2">


          {[0,1,2].map(i => <div key={i} className="h-24 rounded-2xl bg-muted/30 animate-pulse" />)}


        </div>


      ) : (


        <>


          {tab === "screens" && (


            <ScreensTab


              machines={machines} entries={entries} ownerId={ownerId} profileId={profile.id} onSelect={(m, num) => { setSelected(m); setSelectedScreenNum(num); setSelectedInitialTab("payout"); }}


              floatSession={floatSession}


              remainingFloat={remainingFloat} isCashier={profile.role === "cashier"}


              isOwner={isOwner}


              isManager={isManager}


              barSessionStart={barSessionStart}
              barIsOpen={barIsOpenMachines}


              monitorRefreshKey={monitorRefreshKey}


              onSetFloat={() => { setFloatAmount(""); setShowSetFloat(true); }}


              onAddExpense={() => { setShowAddMachineExpense(true); setExpenseAmount(""); setExpenseNote(""); }}


              onDeleteMachine={(id) => {


                const m = machines.find(x => x.id === id);


                if (m) setDeleteTarget(m);


              }}


            />


          )}


          {tab === "allHistory" && <AllHistoryTab entries={entries} machines={machines} />}


          {tab === "summary" && <SummaryTab entries={entries} machines={machines} ownerId={ownerId} />}


          {tab === "create" && (


            <CreateTab ownerId={ownerId} machineCount={machines.length} maxScreens={maxScreens} onCreated={(m) => {


              setMachines(p => [...p, m].sort((a, b) => a.name.localeCompare(b.name)));


              setTab("screens");


            }} />


          )}


        </>


      )}





      {/* Grid-level machine delete modal */}


      {deleteTarget && (


        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">


          <div className="w-full max-w-sm rounded-3xl border border-red-500/40 shadow-2xl overflow-hidden"


            style={{ background: "var(--gradient-card)" }}>


            <div className="px-6 pt-6 pb-4 space-y-3">


              <div className="flex items-center gap-3">


                <div className="h-11 w-11 rounded-xl flex items-center justify-center bg-red-500/15 border border-red-500/30 shrink-0">


                  <Trash2 className="h-5 w-5 text-red-400" />


                </div>


                <h2 className="font-black text-lg">Delete {deleteTarget.name}?</h2>


              </div>


              <p className="text-sm text-muted-foreground leading-relaxed">


                Choose what happens to the payout and income records for this machine.


              </p>


              <div className="space-y-2">


                <button disabled={deletingMachine} onClick={() => handleGridDeleteMachine(false)}


                  className="w-full flex items-start gap-3 rounded-2xl border border-border p-3 text-left hover:bg-muted/30 transition active:scale-[0.98] disabled:opacity-50"


                  style={{ background: "var(--gradient-card)" }}>


                  <div className="h-8 w-8 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0 mt-0.5">


                    <span className="text-sm">📁</span>


                  </div>


                  <div>


                    <div className="font-black text-sm">Remove Card Only</div>


                    <div className="text-xs text-muted-foreground mt-0.5">Remove this machine from the app. All payout/income totals stay intact in All History.</div>


                  </div>


                </button>


                <button disabled={deletingMachine} onClick={() => handleGridDeleteMachine(true)}


                  className="w-full flex items-start gap-3 rounded-2xl border border-red-500/30 p-3 text-left hover:bg-red-500/10 transition active:scale-[0.98] disabled:opacity-50">


                  <div className="h-8 w-8 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center shrink-0 mt-0.5">


                    <Trash2 className="h-4 w-4 text-red-400" />


                  </div>


                  <div>


                    <div className="font-black text-sm text-red-400">Delete Everything</div>


                    <div className="text-xs text-muted-foreground mt-0.5">Remove the machine card AND wipe all its payout/income history. Cannot be undone.</div>


                  </div>


                </button>


              </div>


            </div>


            <div className="px-6 pb-6">


              <Button variant="outline" className="w-full h-12 font-black"


                onClick={() => setDeleteTarget(null)} disabled={deletingMachine}>


                {deletingMachine ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cancel"}


              </Button>


            </div>


          </div>


        </div>


      )}





      {/* Set Float modal */}


      {showSetFloat && (


        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm">


          <div className="w-full max-w-sm rounded-t-3xl pb-8 pt-4 px-4 space-y-3"


            style={{ background: "oklch(0.13 0.03 60)", border: "1px solid oklch(0.3 0.08 60)" }}>


            <p className="text-center text-xs font-semibold" style={{ color: "oklch(0.65 0.15 65)" }}>


              Set Cashier Float — All Machines


            </p>


            {/* Session mode selector */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMachineFloatMode("same")}
                className="h-12 rounded-2xl font-black text-sm transition active:scale-95"
                style={machineFloatMode === "same"
                  ? { background: "oklch(0.60 0.18 65)", color: "#000" }
                  : { background: "oklch(0.20 0.05 60)", color: "oklch(0.65 0.15 65)", border: "1.5px solid oklch(0.35 0.10 60)" }}>
                Same Session
              </button>
              <button
                type="button"
                onClick={() => setMachineFloatMode("new")}
                className="h-12 rounded-2xl font-black text-sm transition active:scale-95"
                style={machineFloatMode === "new"
                  ? { background: "oklch(0.60 0.18 65)", color: "#000" }
                  : { background: "oklch(0.20 0.05 60)", color: "oklch(0.65 0.15 65)", border: "1.5px solid oklch(0.35 0.10 60)" }}>
                New Session
              </button>
            </div>
            <p className="text-center text-[11px]" style={{ color: "oklch(0.55 0.10 65)" }}>
              {machineFloatMode === "same"
                ? "Adds to current float — used amount unchanged"
                : "Starts fresh — used amount resets to $0"}
            </p>


            <div className="rounded-2xl px-5 py-4 text-right"


              style={{ background: "oklch(0.18 0.04 60)", border: "1px solid oklch(0.28 0.08 60)" }}>


              <span className="font-black text-4xl" style={{ color: "oklch(0.82 0.18 65)" }}>


                ${floatAmount === "" ? "0" : floatAmount}


              </span>


            </div>


            <div className="grid grid-cols-3 gap-2">


              {["7","8","9","4","5","6","1","2","3"].map(k => (


                <button key={k} type="button"


                  onClick={() => {


                    const parts = floatAmount.split(".");


                    if (parts[1] !== undefined && parts[1].length >= 2) return;


                    setFloatAmount(prev => prev + k);


                  }}


                  className="rounded-2xl py-4 text-xl font-black active:scale-95 transition"


                  style={{ background: "oklch(0.20 0.05 60)", color: "#fff" }}>


                  {k}


                </button>


              ))}


              <button type="button"


                onClick={() => { if (!floatAmount.includes(".")) setFloatAmount(prev => prev + "."); }}


                className="rounded-2xl py-4 text-xl font-black active:scale-95 transition"


                style={{ background: "oklch(0.20 0.05 60)", color: "#fff" }}>.</button>


              <button type="button"


                onClick={() => {


                  const parts = floatAmount.split(".");


                  if (parts[1] !== undefined && parts[1].length >= 2) return;


                  setFloatAmount(prev => prev + "0");


                }}


                className="rounded-2xl py-4 text-xl font-black active:scale-95 transition"


                style={{ background: "oklch(0.20 0.05 60)", color: "#fff" }}>0</button>


              <button type="button"


                onClick={() => setFloatAmount(prev => prev.slice(0, -1))}


                className="rounded-2xl py-4 text-xl font-black active:scale-95 transition"


                style={{ background: "oklch(0.20 0.05 60)", color: "oklch(0.75 0.15 65)" }}>⌫</button>


            </div>


            <div className="flex gap-2">


              <button onClick={() => setShowSetFloat(false)}


                className="flex-1 py-4 rounded-2xl text-sm font-black active:scale-95 transition border"


                style={{ background: "transparent", color: "#fff", borderColor: "oklch(0.35 0.06 60)" }}>


                Cancel


              </button>


              <button onClick={handleSetFloat} disabled={savingFloat || !floatAmount}


                className="flex-1 py-4 rounded-2xl text-sm font-black active:scale-95 transition disabled:opacity-50"


                style={{ background: "oklch(0.60 0.18 65)", color: "#000" }}>


                {savingFloat ? "Savingâ€¦" : "Confirm Float"}


              </button>


            </div>


          </div>


        </div>


      )}


      {/* Add Machine Expense modal */}


      {showAddMachineExpense && (


        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm">


          <div className="w-full max-w-sm rounded-t-3xl pb-8 pt-4 px-4 space-y-3"


            style={{ background: "oklch(0.13 0.03 60)", border: "1px solid oklch(0.3 0.08 60)" }}>


            <div className="flex items-center justify-between">


              <p className="text-sm font-black" style={{ color: "#f87171" }}>Add Machine Expense</p>


              <button onClick={() => setShowAddMachineExpense(false)}


                className="h-8 w-8 rounded-full flex items-center justify-center bg-white/10 active:opacity-70">


                <X className="h-4 w-4 text-white" />


              </button>


            </div>


            {/* Remaining float info */}


            {remainingFloat === null ? (


              <div className="rounded-xl px-3 py-2 text-center text-xs font-black text-red-400" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)" }}>


                No float set — set a float first


              </div>


            ) : (


              <div className="rounded-xl px-3 py-2 flex items-center justify-between" style={{ background: "oklch(0.18 0.04 60)", border: "1px solid oklch(0.28 0.08 60)" }}>


                <span className="text-[10px] font-semibold text-white/40">Remaining Float</span>


                <span className="text-sm font-black" style={{ color: remainingFloat <= 0 ? "#f87171" : "#86efac" }}>${remainingFloat.toFixed(2)}</span>


              </div>


            )}


            {/* Amount */}


            <div className="rounded-2xl px-5 py-4 text-right"


              style={{ background: "oklch(0.18 0.04 60)", border: "1px solid oklch(0.28 0.08 60)" }}>


              <span className="font-black text-4xl" style={{ color: "#f87171" }}>


                ${expenseAmount === "" ? "0" : expenseAmount}


              </span>


            </div>


            {/* Numpad */}


            <div className="grid grid-cols-3 gap-2">


              {["7","8","9","4","5","6","1","2","3"].map(k => (


                <button key={k} type="button"


                  onClick={() => {


                    const parts = expenseAmount.split(".");


                    if (parts[1] !== undefined && parts[1].length >= 2) return;


                    setExpenseAmount(prev => prev + k);


                  }}


                  className="rounded-2xl py-4 text-xl font-black active:scale-95 transition"


                  style={{ background: "oklch(0.20 0.05 60)", color: "#fff" }}>


                  {k}


                </button>


              ))}


              <button type="button"


                onClick={() => { if (!expenseAmount.includes(".")) setExpenseAmount(prev => prev + "."); }}


                className="rounded-2xl py-4 text-xl font-black active:scale-95 transition"


                style={{ background: "oklch(0.20 0.05 60)", color: "#fff" }}>.</button>


              <button type="button"


                onClick={() => {


                  const parts = expenseAmount.split(".");


                  if (parts[1] !== undefined && parts[1].length >= 2) return;


                  setExpenseAmount(prev => prev + "0");


                }}


                className="rounded-2xl py-4 text-xl font-black active:scale-95 transition"


                style={{ background: "oklch(0.20 0.05 60)", color: "#fff" }}>0</button>


              <button type="button"


                onClick={() => setExpenseAmount(prev => prev.slice(0, -1))}


                className="rounded-2xl py-4 text-xl font-black active:scale-95 transition"


                style={{ background: "oklch(0.20 0.05 60)", color: "oklch(0.75 0.15 65)" }}>⌫</button>


            </div>


            {/* Note */}


            <input


              type="text"


              placeholder="Note (optional)"


              value={expenseNote}


              onChange={e => setExpenseNote(e.target.value)}


              className="w-full h-11 rounded-xl px-4 text-sm font-semibold outline-none focus:ring-1 focus:ring-red-500/50"


              style={{ background: "oklch(0.18 0.04 60)", border: "1px solid oklch(0.28 0.08 60)", color: "#fff" }}


            />


            <div className="flex gap-2">


              <button onClick={() => setShowAddMachineExpense(false)}


                className="flex-1 py-4 rounded-2xl text-sm font-black active:scale-95 transition border"


                style={{ background: "transparent", color: "#fff", borderColor: "oklch(0.35 0.06 60)" }}>


                Cancel


              </button>


              <button onClick={handleSaveMachineExpense} disabled={savingExpense || !expenseAmount || remainingFloat === null || parseFloat(expenseAmount) > (remainingFloat ?? 0)}


                className="flex-1 py-4 rounded-2xl text-sm font-black active:scale-95 transition disabled:opacity-50"


                style={{ background: "rgba(239,68,68,0.5)", color: "#fff", border: "1px solid rgba(239,68,68,0.7)" }}>


                {savingExpense ? "Saving…" : remainingFloat === null ? "Set Float First" : "Save Expense"}


              </button>


            </div>


          </div>


        </div>


      )}


      {/* Set Alerts modal */}


      {showAlertsModal && (


        <SetAlertsModal


          settings={alertSettings}


          onSave={handleSaveAlerts}


          onClose={() => setShowAlertsModal(false)}


        />


      )}


    </div>


    </>


  );


}





// ── Set Alerts Modal ───────────────────────────────────────────────────────────


function SetAlertsModal({


  settings,


  onSave,


  onClose,


}: {


  settings: AlertSettings;


  onSave: (next: AlertSettings) => void;


  onClose: () => void;


}) {


  const [enabled, setEnabled] = useState(settings.enabled);


  const [threshold, setThreshold] = useState(settings.threshold);





  return (


    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm"


      onClick={onClose}>


      <div


        className="w-full max-w-md rounded-t-3xl border border-border shadow-2xl overflow-hidden"


        style={{ background: "var(--gradient-card)" }}


        onClick={(e) => e.stopPropagation()}


      >


        {/* Header */}


        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border/40">


          <div className="flex items-center gap-3">


            <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"


              style={{ background: "var(--gradient-hero)" }}>


              <Bell className="h-5 w-5 text-black" />


            </div>


            <div>


              <h2 className="font-black text-base">Payment Alerts</h2>


              <p className="text-xs text-muted-foreground">Get notified when a payout reaches your limit</p>


            </div>


          </div>


          <button onClick={onClose}


            className="h-9 w-9 rounded-full flex items-center justify-center bg-muted transition">


            <X className="h-4 w-4" />


          </button>


        </div>





        <div className="px-5 py-5 space-y-5">


          {/* Enable toggle */}


          <div className="flex items-center justify-between">


            <div>


              <p className="font-black text-sm">Enable Payment Alerts</p>


              <p className="text-xs text-muted-foreground mt-0.5">


                Send notification when a payout meets or exceeds the limit


              </p>


            </div>


            <button


              onClick={() => setEnabled((v) => !v)}


              className="relative h-7 w-12 rounded-full transition-colors shrink-0"


              style={{ background: enabled ? "var(--gradient-hero)" : "var(--muted)" }}


            >


              <span


                className="absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all"


                style={{ left: enabled ? "calc(100% - 1.5rem)" : "0.25rem" }}


              />


            </button>


          </div>





          {/* Threshold options — only visible when enabled */}


          {enabled && (


            <div className="space-y-2">


              <p className="text-xs font-black text-muted-foreground uppercase tracking-wider">


                Alert Limit


              </p>


              <div className="grid grid-cols-3 gap-2">


                {THRESHOLD_OPTIONS.map((t) => (


                  <button


                    key={t}


                    onClick={() => setThreshold(t)}


                    className={`h-12 rounded-xl font-black text-sm transition active:scale-95 ${


                      threshold === t


                        ? "text-black"


                        : "text-muted-foreground"


                    }`}


                    style={threshold === t


                      ? { background: "var(--gradient-hero)", border: "none" }


                      : { background: "var(--muted)", border: "1px solid var(--border)" }


                    }


                  >


                    ${t >= 1000 ? (t / 1000) + "k" : t}


                  </button>


                ))}


              </div>


              <p className="text-xs text-muted-foreground text-center pt-1">


                You'll get an alert when a payout of{" "}


                <span className="font-black" style={{ color: "var(--primary)" }}>


                  ${threshold.toLocaleString()} TT


                </span>{" "}


                or more is recorded


              </p>


            </div>


          )}





          {/* Save button */}


          <button


            onClick={() => onSave({ enabled, threshold })}


            className="w-full h-12 rounded-2xl font-black text-base text-black active:scale-[0.98] transition"


            style={{ background: "var(--gradient-hero)" }}


          >


            {enabled ? `Save — Alert $${threshold.toLocaleString()} TT` : `Save — Alerts Off`}


          </button>


        </div>


      </div>


    </div>


  );


}















