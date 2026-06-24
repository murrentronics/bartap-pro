import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Plus, Loader2, ChevronLeft, Trash2, Download, X,
  TrendingDown, TrendingUp, DollarSign, Gamepad2,
} from "lucide-react";
import { downloadPdf } from "@/lib/download";
import { drawHeader, addFootersToAllPages, LM, RM, CONTENT_BOTTOM } from "@/lib/pdfHelpers";

export const Route = createFileRoute("/_app/machines")({
  component: MachinesPage,
});

// ── Types ──────────────────────────────────────────────────────────────────────
type Machine = { id: string; owner_id: string; name: string; created_at: string };
type MachineEntry = {
  id: string; machine_id: string; owner_id: string;
  type: "payout" | "income"; amount: number;
  note: string | null; entry_date: string; created_at: string;
  cashier_id: string | null; cashier_name: string | null;
};
type FloatSession = {
  id: string; machine_id: string; owner_id: string;
  amount: number; set_at: string; created_at: string;
};

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
// Whole-number formatter for hero stat cards — no cents
function fmtWhole(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function todayISO() { return new Date().toISOString().slice(0, 10); }
function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}

// ── Stat Card ──────────────────────────────────────────────────────────────────
function StatCard({ label, value, color, icon: Icon }: {
  label: string; value: string; color: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-2xl p-3 flex flex-col gap-1 text-center"
      style={{ background: "oklch(0.18 0.02 60)" }}>
      <div className="flex items-center justify-center gap-1 text-[10px] font-semibold text-white/50">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="font-black text-sm leading-tight" style={{ color }}>{value}</div>
    </div>
  );
}

// ── Small Stat ─────────────────────────────────────────────────────────────────
function SmallStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl px-3 py-2 flex flex-col gap-0.5 text-center"
      style={{ background: "oklch(0.22 0.02 60)" }}>
      <div className="text-[9px] font-semibold text-white/40 uppercase tracking-wider">{label}</div>
      <div className="font-black text-xs" style={{ color }}>{value}</div>
    </div>
  );
}

// ── History Month Accordion ────────────────────────────────────────────────────
function HistoryMonthAccordion({ entries, loading, downloading, deletingId, onDownloadAll, onDownloadMonth, onDelete }: {
  entries: MachineEntry[];
  loading: boolean;
  downloading: boolean;
  deletingId: string | null;
  onDownloadAll: () => void;
  onDownloadMonth: (monthKey: string, monthEntries: MachineEntry[]) => void;
  onDelete: (id: string) => void;
}) {
  const [openMonth, setOpenMonth] = useState<string | null>(null);
  const [downloadingMonth, setDownloadingMonth] = useState<string | null>(null);

  // Sort all entries newest first
  const allSorted = [...entries].sort((a, b) => b.created_at.localeCompare(a.created_at));
  // The globally newest entry id — only this one gets the delete button
  const newestId = allSorted[0]?.id ?? null;

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
  };

  if (loading) {
    return <div className="space-y-2">{[0,1,2].map(i => <div key={i} className="h-16 rounded-xl bg-muted/30 animate-pulse" />)}</div>;
  }

  if (entries.length === 0) {
    return <div className="text-center py-12 text-muted-foreground text-sm">No records yet.</div>;
  }

  return (
    <div className="space-y-3">
      {/* Top bar — record count + Download All */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{entries.length} records</span>
        <Button size="sm" variant="outline" className="h-9 gap-1.5 font-bold"
          disabled={downloading || entries.length === 0} onClick={onDownloadAll}>
          {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          Download All
        </Button>
      </div>

      {/* Month accordions */}
      <div className="space-y-2">
        {monthKeys.map((mk) => {
          const mEntries = byMonth[mk];
          const mPayout = mEntries.filter(e => e.type === "payout").reduce((s, e) => s + Number(e.amount), 0);
          const mIncome = mEntries.filter(e => e.type === "income").reduce((s, e) => s + Number(e.amount), 0);
          const mProfit = mIncome - mPayout;
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
                    title="Download this month PDF">
                    {downloadingMonth === mk
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <Download className="h-3 w-3" />}
                    PDF
                  </button>
                  <span className={`transition-transform text-muted-foreground text-sm ${isOpen ? "rotate-180" : ""}`}>▾</span>
                </div>
              </button>

              {/* Expanded rows */}
              {isOpen && (
                <div className="border-t border-border divide-y divide-border/40">
                  {mEntries.map((e) => {
                    const isPayout = e.type === "payout";
                    const isNewest = e.id === newestId;
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
                        </div>
                        {isNewest && (
                          <button onClick={() => onDelete(e.id)} disabled={deletingId === e.id}
                            className="h-8 w-8 rounded-full flex items-center justify-center bg-red-600 active:scale-95 transition shrink-0 disabled:opacity-50">
                            {deletingId === e.id
                              ? <Loader2 className="h-3.5 w-3.5 text-white animate-spin" />
                              : <Trash2 className="h-3.5 w-3.5 text-white" />}
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
  );
}

// ── Machine Detail Page ────────────────────────────────────────────────────────
function MachineDetail({ machine, screenNumber, ownerId, profile, onBack, onDeleted }: {
  machine: Machine; screenNumber: number; ownerId: string;
  profile: { id: string; username?: string; role?: string };
  onBack: () => void; onDeleted: () => void;
}) {
  const [entries, setEntries] = useState<MachineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const isCashier = profile.role === "cashier";
  const [tab, setTab] = useState<"payout" | "income" | "history">("payout");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [showDeleteMachine, setShowDeleteMachine] = useState(false);
  const [deletingMachine, setDeletingMachine] = useState(false);

  // Float session
  const [floatSession, setFloatSession] = useState<FloatSession | null>(null);
  const [floatAmount, setFloatAmount] = useState("");
  const [showSetFloat, setShowSetFloat] = useState(false);
  const [savingFloat, setSavingFloat] = useState(false);

  // Active cashier (the one currently logged in under this owner)
  const [activeCashier, setActiveCashier] = useState<{ id: string; username: string } | null>(null);

  const loadActiveCashier = useCallback(async () => {
    const { data } = await sb.from("profiles")
      .select("id, username")
      .eq("parent_id", ownerId)
      .eq("role", "cashier")
      .eq("is_active", true)
      .maybeSingle();
    setActiveCashier(data as { id: string; username: string } | null);
  }, [ownerId]);

  const loadFloat = useCallback(async () => {
    const { data } = await sb.from("machine_float_sessions")
      .select("*").eq("machine_id", machine.id)
      .order("set_at", { ascending: false }).limit(1).maybeSingle();
    setFloatSession(data as FloatSession | null);
  }, [machine.id]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await sb.from("machine_entries").select("*")
      .eq("machine_id", machine.id).order("entry_date", { ascending: false })
      .order("created_at", { ascending: false });
    setEntries((data ?? []) as MachineEntry[]);
    setLoading(false);
  }, [machine.id]);

  useEffect(() => { load(); loadFloat(); loadActiveCashier(); }, [load, loadFloat, loadActiveCashier]);

  // Realtime — entries + float sessions + active cashier changes
  useEffect(() => {
    const ch = supabase.channel(`machine-${machine.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "machine_entries",
        filter: `machine_id=eq.${machine.id}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "machine_float_sessions",
        filter: `machine_id=eq.${machine.id}` }, () => loadFloat())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" },
        (payload) => {
          // Only re-fetch if a cashier under this owner changed their is_active flag
          const row = payload.new as { parent_id?: string; role?: string; is_active?: boolean };
          if (row.parent_id === ownerId && row.role === "cashier") loadActiveCashier();
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [machine.id, ownerId, load, loadFloat, loadActiveCashier]);

  const handleSetFloat = async () => {
    const val = parseFloat(floatAmount);
    if (isNaN(val) || val < 0) { toast.error("Enter a valid amount"); return; }
    setSavingFloat(true);
    const { error } = await sb.from("machine_float_sessions").insert({
      machine_id: machine.id,
      owner_id: ownerId,
      amount: val,
      set_at: new Date().toISOString(),
    });
    setSavingFloat(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Float set");
    setFloatAmount("");
    setShowSetFloat(false);
    loadFloat();
  };

  // ── All-time totals ────────────────────────────────────────────────────────
  const totalPayout = entries.filter(e => e.type === "payout").reduce((s, e) => s + Number(e.amount), 0);
  const totalIncome = entries.filter(e => e.type === "income").reduce((s, e) => s + Number(e.amount), 0);
  // Profit = machine earnings (income cleared by owner) minus payouts given to players.
  // Float money never appears here — it lives only in machine_float_sessions.
  const totalProfit = totalIncome - totalPayout;

  // ── Session totals (since float was last set) ──────────────────────────────
  // "Session" = everything after the most recent float set_at.
  // If no float has ever been set, session === all-time.
  const sessionStart = floatSession?.set_at ?? null;
  const sessionEntries = sessionStart
    ? entries.filter(e => e.created_at >= sessionStart)
    : entries;

  // Payouts this session — what the cashier paid out from the float
  const sessionPayouts = sessionEntries
    .filter(e => e.type === "payout")
    .reduce((s, e) => s + Number(e.amount), 0);

  // Income this session — what the owner cleared from the machine this session
  const sessionIncome = sessionEntries
    .filter(e => e.type === "income")
    .reduce((s, e) => s + Number(e.amount), 0);

  // Session profit = what the machine earned minus what was paid out to players.
  // This is pure machine profit. The float is NOT deducted here — float is a cash
  // advance to the cashier, not a cost. Remaining float is tracked separately below.
  const sessionProfit = sessionIncome - sessionPayouts;

  // Remaining float = what the cashier should still have in hand
  const remainingFloat = floatSession ? Number(floatSession.amount) - sessionPayouts : null;

  const handleSave = async () => {
    const val = parseFloat(amount);
    if (isNaN(val) || val <= 0) { toast.error("Enter a valid amount"); return; }
    setBusy(true);
    const now = new Date();
    const { error } = await sb.from("machine_entries").insert({
      machine_id: machine.id, owner_id: ownerId,
      type: tab as "payout" | "income",
      amount: val, note: null,
      entry_date: now.toISOString().slice(0, 10),
      created_at: now.toISOString(),
      cashier_id: profile.id,
      cashier_name: profile.username ?? null,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(tab === "payout" ? "Payout recorded" : "Amount recorded");
    setAmount("");
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    const { error } = await sb.from("machine_entries").delete().eq("id", id);
    setDeletingId(null);
    if (error) { toast.error(error.message); return; }
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
        { label: "Total Income", value: "+$" + fmt(totalIncome), r: 40,  g: 140, b: 40 },
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
      const mProfit = mIncome - mPayout;
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

  const handleDeleteMachine = async () => {
    setDeletingMachine(true);
    // Entries cascade on machine delete
    const { error } = await sb.from("machines").delete().eq("id", machine.id);
    setDeletingMachine(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${machine.name} deleted`);
    setShowDeleteMachine(false);
    onDeleted();
  };

  return (
    <div className="fixed inset-0 z-40 flex flex-col overflow-hidden"
      style={{ background: "var(--background)" }}>
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 px-3 border-b border-border bg-background/95 backdrop-blur z-10"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.5rem)", paddingBottom: "0.5rem" }}>
        <button onClick={onBack}
          className="h-9 w-9 rounded-full flex items-center justify-center bg-muted active:scale-95 transition shrink-0">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="font-black text-lg flex-1 truncate">
          Screen {screenNumber} — {machine.name}
        </h1>
        <button onClick={() => setShowDeleteMachine(true)}
          className="h-9 w-9 rounded-full flex items-center justify-center bg-red-600 active:scale-95 transition shrink-0">
          <Trash2 className="h-4 w-4 text-white" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
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
          <div className="relative grid grid-cols-3 gap-2">
            <StatCard label="Total Payout" value={"$" + fmtWhole(totalPayout)} color="#fca5a5" icon={TrendingDown} />
            <StatCard label="Total Income" value={"$" + fmtWhole(totalIncome)} color="#86efac" icon={TrendingUp} />
            <StatCard label="Total Profit"
              value={(totalProfit >= 0 ? "+" : "") + "$" + fmtWhole(totalProfit)}
              color={totalProfit >= 0 ? "#86efac" : "#fca5a5"} icon={DollarSign} />
          </div>
          <div className="relative grid grid-cols-3 gap-2">
            <SmallStat label="Session Payout" value={"$" + fmtWhole(sessionPayouts)} color="#fca5a5" />
            <SmallStat label="Session Income" value={"$" + fmtWhole(sessionIncome)} color="#86efac" />
            <SmallStat label="Session Profit"
              value={(sessionProfit >= 0 ? "+" : "") + "$" + fmtWhole(sessionProfit)}
              color={sessionProfit >= 0 ? "#86efac" : "#fca5a5"} />
          </div>

          {/* Float row */}
          <div className="relative grid grid-cols-3 gap-2">
            {/* Card 1 — active cashier name */}
            <div className="rounded-xl px-2 py-2 flex flex-col items-center justify-center text-center gap-0.5"
              style={{ background: "oklch(0.22 0.02 60)" }}>
              <span className="text-[9px] font-semibold text-white/40 uppercase tracking-wider">Cashier</span>
              <span className="font-black text-[10px] leading-tight"
                style={{ color: activeCashier ? "#fbbf24" : "oklch(0.45 0.02 60)" }}>
                {activeCashier ? activeCashier.username : "—"}
              </span>
            </div>
            {/* Card 2 — float set by owner */}
            <div className="rounded-xl px-2 py-2 flex flex-col gap-0.5 text-center"
              style={{ background: "oklch(0.22 0.02 60)" }}>
              <div className="text-[9px] font-semibold text-white/40 uppercase tracking-wider">Float Set</div>
              <div className="font-black text-xs" style={{ color: "#fbbf24" }}>
                {floatSession ? "$" + fmtWhole(Number(floatSession.amount)) : "—"}
              </div>
            </div>
            {/* Card 3 — remaining */}
            <div className="rounded-xl px-2 py-2 flex flex-col gap-0.5 text-center"
              style={{ background: "oklch(0.22 0.02 60)" }}>
              <div className="text-[9px] font-semibold text-white/40 uppercase tracking-wider">Remaining</div>
              <div className="font-black text-xs"
                style={{ color: !activeCashier || remainingFloat === null ? "oklch(0.45 0.02 60)" : remainingFloat >= 0 ? "#86efac" : "#fca5a5" }}>
                {!activeCashier || remainingFloat === null ? "—" : (remainingFloat >= 0 ? "" : "-") + "$" + fmtWhole(Math.abs(remainingFloat))}
              </div>
            </div>
          </div>

          {/* Set Float button — owner only */}
          {!isCashier && (
            <div className="relative">
              <button
                onClick={() => { setFloatAmount(""); setShowSetFloat(true); }}
                className="w-full py-2 rounded-xl text-xs font-black active:scale-95 transition"
                style={{ background: "oklch(0.28 0.06 60)", color: "#fbbf24", border: "1px solid oklch(0.38 0.10 60)" }}>
                {floatSession ? "Update Float" : "Set Float"}
              </button>
            </div>
          )}
        </section>

        {/* Tabs */}
        <div className="flex gap-1 rounded-2xl p-1" style={{ background: "var(--gradient-card)" }}>
          {(["payout", ...(!isCashier ? ["income"] : []), "history"] as ("payout" | "income" | "history")[]).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-black capitalize transition ${
                tab === t ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
              style={tab === t ? { background: "var(--gradient-hero)" } : {}}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* Payout / Income entry form */}
        {(tab === "payout" || tab === "income") && (
          <div className="rounded-2xl border border-border p-4 space-y-3"
            style={{ background: "var(--gradient-card)" }}>
            <h2 className="font-black text-sm">
              {tab === "payout" ? "Record Payout" : "Record amount cleared from machine"}
            </h2>
            {/* Amount display */}
            <div className="rounded-2xl px-5 py-4 text-right"
              style={{ background: "oklch(0.18 0.04 60)", border: "1px solid oklch(0.28 0.08 60)" }}>
              <span className="font-black text-4xl" style={{ color: "oklch(0.82 0.18 65)" }}>
                ${amount === "" ? "0" : amount}
              </span>
            </div>
            {/* Numpad */}
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
            <Button onClick={handleSave} disabled={busy || !amount}
              className="w-full h-12 font-black text-base"
              style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : tab === "payout" ? "Save Payout" : "Save"}
            </Button>
          </div>
        )}

        {/* History tab */}
        {tab === "history" && (
          <HistoryMonthAccordion
            entries={entries}
            loading={loading}
            downloading={downloading}
            deletingId={deletingId}
            onDownloadAll={handleDownloadPdf}
            onDownloadMonth={handleDownloadMonthPdf}
            onDelete={handleDelete}
          />
        )}
      </div>

      {/* Set Float modal */}
      {showSetFloat && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-t-3xl pb-8 pt-4 px-4 space-y-3"
            style={{ background: "oklch(0.13 0.03 60)", border: "1px solid oklch(0.3 0.08 60)" }}>
            <p className="text-center text-xs font-semibold" style={{ color: "oklch(0.65 0.15 65)" }}>
              Set Cashier Float — {machine.name}
            </p>
            {/* Display */}
            <div className="rounded-2xl px-5 py-4 text-right"
              style={{ background: "oklch(0.18 0.04 60)", border: "1px solid oklch(0.28 0.08 60)" }}>
              <span className="font-black text-4xl" style={{ color: "oklch(0.82 0.18 65)" }}>
                ${floatAmount === "" ? "0" : floatAmount}
              </span>
            </div>
            {/* Numpad */}
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
                style={{ background: "oklch(0.20 0.05 60)", color: "#fff" }}>
                .
              </button>
              <button type="button"
                onClick={() => {
                  const parts = floatAmount.split(".");
                  if (parts[1] !== undefined && parts[1].length >= 2) return;
                  setFloatAmount(prev => prev + "0");
                }}
                className="rounded-2xl py-4 text-xl font-black active:scale-95 transition"
                style={{ background: "oklch(0.20 0.05 60)", color: "#fff" }}>
                0
              </button>
              <button type="button"
                onClick={() => setFloatAmount(prev => prev.slice(0, -1))}
                className="rounded-2xl py-4 text-xl font-black active:scale-95 transition"
                style={{ background: "oklch(0.20 0.05 60)", color: "oklch(0.75 0.15 65)" }}>
                ⌫
              </button>
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
                {savingFloat ? "Saving…" : "Confirm Float"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete machine confirm modal */}
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
                All records and history for this machine will be permanently deleted. This cannot be undone.
              </p>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <Button variant="outline" className="flex-1 h-14 text-base font-black"
                onClick={() => setShowDeleteMachine(false)} disabled={deletingMachine}>
                Cancel
              </Button>
              <Button className="flex-1 h-14 text-base font-black bg-red-600 hover:bg-red-700 text-white"
                disabled={deletingMachine} onClick={handleDeleteMachine}>
                {deletingMachine ? <Loader2 className="h-5 w-5 animate-spin" /> : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Create Tab ─────────────────────────────────────────────────────────────────
function CreateTab({ ownerId, onCreated }: { ownerId: string; onCreated: (m: Machine) => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
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
      <h2 className="font-black text-sm">New Machine</h2>
      <div>
        <Label className="text-xs">Machine Name</Label>
        <Input value={name} onChange={e => setName(e.target.value)}
          placeholder="e.g. Lucky Star, Pool Table 1" className="mt-1 h-11" required />
      </div>
      <Button type="submit" disabled={busy || !name.trim()}
        className="w-full h-12 font-black text-base"
        style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4 mr-2" />Create Machine</>}
      </Button>
    </form>
  );
}

// ── Screens Tab (machine grid + hero) ─────────────────────────────────────────
function ScreensTab({ machines, entries, ownerId, onSelect }: {
  machines: Machine[]; entries: MachineEntry[];
  ownerId: string; onSelect: (m: Machine) => void;
}) {
  const totalPayout = entries.filter(e => e.type === "payout").reduce((s, e) => s + Number(e.amount), 0);
  const totalIncome = entries.filter(e => e.type === "income").reduce((s, e) => s + Number(e.amount), 0);
  const totalProfit = totalIncome - totalPayout;

  if (machines.length === 0) {
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
      {/* All-machines hero */}
      <section className="rounded-3xl p-5 relative overflow-hidden"
        style={{ background: "var(--gradient-hero)", boxShadow: "var(--shadow-glow)" }}>
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
        <div className="relative grid grid-cols-3 gap-2">
          <StatCard label="All Payouts" value={"$" + fmtWhole(totalPayout)} color="#fca5a5" icon={TrendingDown} />
          <StatCard label="All Income"  value={"$" + fmtWhole(totalIncome)} color="#86efac" icon={TrendingUp} />
          <StatCard label="All Profit"
            value={(totalProfit >= 0 ? "+" : "") + "$" + fmtWhole(totalProfit)}
            color={totalProfit >= 0 ? "#86efac" : "#fca5a5"} icon={DollarSign} />
        </div>
      </section>

      {/* Machine grid — 3 per row mobile, 5 per row tablet, sorted by created_at for stable numbers */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        {[...machines].sort((a, b) => a.created_at.localeCompare(b.created_at)).map((m, idx) => {
          const screenNum = idx + 1;
          const mPayout = entries.filter(e => e.machine_id === m.id && e.type === "payout").reduce((s, e) => s + Number(e.amount), 0);
          const mIncome = entries.filter(e => e.machine_id === m.id && e.type === "income").reduce((s, e) => s + Number(e.amount), 0);
          const mProfit = mIncome - mPayout;
          return (
            <button key={m.id} onClick={() => onSelect(m)}
              className="relative flex flex-col items-center justify-between rounded-2xl active:scale-95 transition overflow-hidden"
              style={{
                minHeight: "110px",
                background: "linear-gradient(160deg, #1a1a2e 0%, #16213e 60%, #0f3460 100%)",
                border: "2px solid rgba(251,146,60,0.35)",
                boxShadow: "0 0 12px rgba(251,146,60,0.15), inset 0 0 20px rgba(0,0,0,0.4)",
              }}>
              {/* Screen bezel top */}
              <div className="w-full h-1.5 shrink-0"
                style={{ background: "linear-gradient(90deg, transparent, rgba(251,146,60,0.5), transparent)" }} />
              {/* Screen content */}
              <div className="flex-1 flex flex-col items-center justify-center gap-1 px-2">
                {/* Big screen number */}
                <span className="font-black leading-none"
                  style={{ fontSize: "clamp(1.6rem, 5vw, 2.2rem)", color: "rgba(251,146,60,0.9)",
                    textShadow: "0 0 12px rgba(251,146,60,0.6)" }}>
                  {screenNum}
                </span>
                <span className="text-[9px] font-black text-white/60 uppercase tracking-widest leading-tight text-center line-clamp-2 px-1">
                  {m.name}
                </span>
              </div>
              {/* Profit badge */}
              <div className="w-full px-2 pb-1.5 flex justify-center">
                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                  mProfit >= 0 ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                }`}>
                  {mProfit >= 0 ? "+" : ""}${fmtWhole(mProfit)}
                </span>
              </div>
              {/* Screen bezel bottom */}
              <div className="w-full h-1.5 shrink-0"
                style={{ background: "linear-gradient(90deg, transparent, rgba(251,146,60,0.4), transparent)" }} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── All History Tab ────────────────────────────────────────────────────────────
const ALL_HISTORY_PAGE_SIZE = 20;

function AllHistoryTab({ entries, machines }: { entries: MachineEntry[]; machines: Machine[] }) {
  const [page, setPage] = useState(0);
  const [downloading, setDownloading] = useState(false);

  // All records sorted by created_at descending
  const sorted = [...entries].sort((a, b) => b.created_at.localeCompare(a.created_at));

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / ALL_HISTORY_PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageRecords = sorted.slice(safePage * ALL_HISTORY_PAGE_SIZE, safePage * ALL_HISTORY_PAGE_SIZE + ALL_HISTORY_PAGE_SIZE);

  // Totals across all entries
  const totalPayout = sorted.filter(e => e.type === "payout").reduce((s, e) => s + Number(e.amount), 0);
  const totalIncome = sorted.filter(e => e.type === "income").reduce((s, e) => s + Number(e.amount), 0);
  const totalProfit = totalIncome - totalPayout;

  const handleDownloadPdf = async () => {
    if (downloading || sorted.length === 0) return;
    setDownloading(true);
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "mm", format: "a4" });
      const generated = new Date().toLocaleString("en-GB", {
        hour: "2-digit", minute: "2-digit", hour12: true,
        day: "numeric", month: "short", year: "numeric",
      });
      let y = await drawHeader(doc, "All Machines", "Full History", "All Records", generated);

      // Summary box
      const bw = RM - LM;
      doc.setFillColor(245, 240, 230);
      doc.roundedRect(LM, y, bw, 26, 2, 2, "F");
      doc.setDrawColor(232, 146, 42); doc.setLineWidth(0.4);
      doc.roundedRect(LM, y, bw, 26, 2, 2, "S");
      const cols = [
        { label: "Total Payout", value: "-$" + fmt(totalPayout), r: 180, g: 40, b: 40 },
        { label: "Total Income", value: "+$" + fmt(totalIncome), r: 40,  g: 140, b: 40 },
        { label: "Net Profit",   value: (totalProfit >= 0 ? "+" : "") + "$" + fmt(totalProfit),
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

      // Column headers
      doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(130, 130, 130);
      doc.text("DATE / TIME", LM, y);
      doc.text("MACHINE", LM + 55, y);
      doc.text("TYPE", LM + 110, y);
      doc.text("AMOUNT", RM, y, { align: "right" });
      y += 3; doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.2); doc.line(LM, y, RM, y); y += 5;
      doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(0, 0, 0);

      sorted.forEach((e) => {
        if (y > CONTENT_BOTTOM) { doc.addPage(); y = 20; }
        const m = machines.find(x => x.id === e.machine_id);
        const isPayout = e.type === "payout";
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
      await downloadPdf("machines-all-history.pdf", doc.output("datauristring"));
      toast.success("PDF saved to Downloads");
    } catch (err: any) { toast.error("PDF failed: " + err?.message); }
    finally { setDownloading(false); }
  };

  if (sorted.length === 0) {
    return <div className="text-center py-12 text-muted-foreground text-sm">No records yet.</div>;
  }

  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{total} records</span>
        <Button size="sm" variant="outline" className="h-9 gap-1.5 font-bold"
          disabled={downloading} onClick={handleDownloadPdf}>
          {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          PDF
        </Button>
      </div>

      {/* Records */}
      <div className="space-y-2">
        {pageRecords.map((e) => {
          const m = machines.find(x => x.id === e.machine_id);
          const isPayout = e.type === "payout";
          return (
            <div key={e.id} className={`rounded-xl p-4 border flex items-start gap-3 ${
              isPayout ? "border-red-500/25" : "border-green-500/25"
            }`} style={{ background: isPayout ? "oklch(0.20 0.04 10 / 0.25)" : "oklch(0.20 0.05 145 / 0.25)" }}>
              <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 border text-sm font-black ${
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
                {m && <div className="text-xs font-semibold mt-0.5" style={{ color: "var(--primary)" }}>{m.name}</div>}
                {!isPayout && (
                  <div className="text-xs font-semibold text-green-400/70 mt-0.5">Machine cleared by owner</div>
                )}
                {e.note && <div className="text-xs text-muted-foreground mt-0.5">{e.note}</div>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 border border-border"
          style={{ background: "var(--gradient-card)" }}>
          <Button variant="outline" size="sm" className="h-9 font-bold"
            disabled={safePage === 0}
            onClick={() => { setPage(p => Math.max(0, p - 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
            ‹ Prev
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {safePage + 1} of {totalPages}
            <span className="text-muted-foreground/60 ml-1">({total} total)</span>
          </span>
          <Button variant="outline" size="sm" className="h-9 font-bold"
            disabled={safePage >= totalPages - 1}
            onClick={() => { setPage(p => Math.min(totalPages - 1, p + 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
            Next ›
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function MachinesPage() {
  const { profile } = useAuth();
  const [machines, setMachines] = useState<Machine[]>([]);
  const [entries, setEntries] = useState<MachineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"screens" | "payouts" | "create">("screens");
  const [selected, setSelected] = useState<Machine | null>(null);
  // Cashiers see their owner's machines; owners see their own
  const ownerId = profile?.role === "cashier" ? (profile.parent_id ?? "") : (profile?.id ?? "");

  const load = useCallback(async () => {
    if (!ownerId) return;
    setLoading(true);
    const [mRes, eRes] = await Promise.all([
      sb.from("machines").select("*").eq("owner_id", ownerId).order("name"),
      sb.from("machine_entries").select("*").eq("owner_id", ownerId).order("entry_date", { ascending: false }),
    ]);
    setMachines((mRes.data ?? []) as Machine[]);
    setEntries((eRes.data ?? []) as MachineEntry[]);
    setLoading(false);
  }, [ownerId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!ownerId) return;
    const ch = supabase.channel(`machines-page-${ownerId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "machines", filter: `owner_id=eq.${ownerId}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "machine_entries", filter: `owner_id=eq.${ownerId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [ownerId, load]);

  if (!profile) return null;

  // Show machine detail full-screen
  if (selected) {
    const screenNumber = [...machines].sort((a, b) => a.created_at.localeCompare(b.created_at))
      .findIndex(m => m.id === selected.id) + 1;
    return (
      <MachineDetail
        machine={selected}
        screenNumber={screenNumber}
        ownerId={ownerId}
        profile={{ id: profile.id, username: profile.username ?? undefined, role: profile.role ?? undefined }}
        onBack={() => setSelected(null)}
        onDeleted={() => { setSelected(null); load(); }}
      />
    );
  }

  const isOwner = profile?.role === "owner";

  const tabs = [
    { key: "screens", label: `Screens${machines.length ? ` (${machines.length})` : ""}` },
    { key: "payouts", label: "All History" },
    ...(isOwner ? [{ key: "create", label: "Create" }] : []),
  ] as const;

  return (
    <div className="py-3 space-y-4">
      <h1 className="text-2xl font-black">Machines</h1>
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
        <div className="grid grid-cols-3 gap-2">{[0,1,2].map(i => <div key={i} className="h-24 rounded-2xl bg-muted/30 animate-pulse" />)}</div>
      ) : (
        <>
          {tab === "screens" && <ScreensTab machines={machines} entries={entries} ownerId={ownerId} onSelect={setSelected} />}
          {tab === "payouts" && <AllHistoryTab entries={entries} machines={machines} />}
          {tab === "create"  && <CreateTab ownerId={ownerId} onCreated={(m) => { setMachines(p => [...p, m].sort((a,b) => a.name.localeCompare(b.name))); setTab("screens"); }} />}
        </>
      )}
    </div>
  );
}
