import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useChain } from "@/lib/ChainContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Loader2, TrendingDown, X, Settings2, Pencil, Trash2,
  AlertTriangle, Clock, LogIn, LogOut, ChevronDown,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type Expense = {
  id: string;
  amount: number;
  description: string | null;
  expense_date: string;
  created_at: string;
};

type Employee = {
  id: string;
  username: string;
  role: string;
  job_title?: string | null;
};

type TimeCard = {
  id: string;
  employee_id: string;
  employee_name: string;
  clocked_in_at: string;
  clocked_out_at: string | null;
  work_date: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n: number) {
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
/** Format a UTC ISO string in Trinidad time (UTC-4) as "3:45 PM" */
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: "America/Port_of_Spain",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}
/** Work-date string (YYYY-MM-DD) in Trinidad time */
function trinidadDate() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Port_of_Spain" });
}
/** Duration string e.g. "4h 23m" */
function fmtDuration(inIso: string, outIso: string | null) {
  const end = outIso ? new Date(outIso) : new Date();
  const mins = Math.round((end.getTime() - new Date(inIso).getTime()) / 60000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

// ─── Root export ──────────────────────────────────────────────────────────────
export default function ManagerPage() {
  const { profile } = useAuth();
  const { effectiveOwnerId } = useChain();

  if (!profile || (profile.role !== "manager" && (profile as any).job_title !== "manager")) {
    return (
      <div className="text-center text-muted-foreground py-20">
        Manager access only.
      </div>
    );
  }

  const ownerId = effectiveOwnerId((profile as any).parent_id ?? profile.id);
  return <ManagerMain profile={profile} ownerId={ownerId} />;
}


// ─── Main shell: tabs + bar toggle header ─────────────────────────────────────
function ManagerMain({
  profile,
  ownerId,
}: {
  profile: { id: string; username?: string | null; wallet_balance: number };
  ownerId: string;
}) {
  const sb = supabase as any;
  const managerName = profile.username ?? profile.id;

  // ── Bar state ──────────────────────────────────────────────────────────────
  const [barSessionStart, setBarSessionStart] = useState<string | null>(null);
  const [barClosedAt, setBarClosedAt] = useState<string | null>(null);
  const [barStateLoading, setBarStateLoading] = useState(true);
  const [barToggleBusy, setBarToggleBusy] = useState(false);
  const [showOpenBarModal, setShowOpenBarModal] = useState(false);
  const [openBarFloat, setOpenBarFloat] = useState("");
  const [openMachineFloat, setOpenMachineFloat] = useState("");
  const [hasMachines, setHasMachines] = useState(false);
  const [isMachinesAccount, setIsMachinesAccount] = useState(false);
  const [showCloseBarConfirm, setShowCloseBarConfirm] = useState(false);
  const barIsOpen = !!barSessionStart && !barClosedAt;

  useEffect(() => {
    if (!ownerId) return;
    setBarStateLoading(true);
    sb.from("profiles")
      .select("bar_session_start, bar_closed_at")
      .eq("id", ownerId)
      .single()
      .then(({ data }: any) => {
        setBarSessionStart(data?.bar_session_start ?? null);
        setBarClosedAt(data?.bar_closed_at ?? null);
        setBarStateLoading(false);
      });
    const ch = supabase
      .channel(`mgr-bar-state-${ownerId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${ownerId}` },
        (payload: any) => {
          const rec = payload.new as Record<string, unknown>;
          if ("bar_session_start" in rec) setBarSessionStart((rec.bar_session_start as string | null) ?? null);
          if ("bar_closed_at" in rec) setBarClosedAt((rec.bar_closed_at as string | null) ?? null);
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [ownerId]); // eslint-disable-line react-hooks/exhaustive-deps


  // ── Open bar ──────────────────────────────────────────────────────────────
  const handleOpenBar = async () => {
    const { data: ownerProfile } = await sb
      .from("profiles").select("machines_addon_active, plan_type, is_machines_account")
      .eq("id", ownerId).single();
    setHasMachines(!!(ownerProfile?.machines_addon_active) || ownerProfile?.plan_type === "premium");
    setIsMachinesAccount(!!(ownerProfile?.is_machines_account));
    setOpenBarFloat(""); setOpenMachineFloat("");
    setShowOpenBarModal(true);
  };

  const confirmOpenBar = async () => {
    const barFloatVal = isMachinesAccount ? 0 : parseFloat(openBarFloat);
    if (!isMachinesAccount && (isNaN(barFloatVal) || barFloatVal < 0)) { toast.error("Enter a valid bar float amount"); return; }
    if (hasMachines) {
      const mf = parseFloat(openMachineFloat);
      if (isNaN(mf) || mf < 0) { toast.error("Enter a valid machine float amount"); return; }
    }
    setBarToggleBusy(true); setShowOpenBarModal(false);
    const { data: existingOpen } = await sb.from("bar_sessions")
      .select("id").eq("owner_id", ownerId).is("closed_at", null).limit(1).maybeSingle();
    if (existingOpen) { setBarToggleBusy(false); toast.error("Bar is already open"); return; }
    const now = new Date().toISOString();
    const { error } = await sb.from("profiles")
      .update({ bar_session_start: now, bar_closed_at: null, cashier_float: barFloatVal, cashier_float_set_at: now })
      .eq("id", ownerId);
    if (error) { setBarToggleBusy(false); toast.error("Failed to open bar"); return; }
    const { data: newSession } = await sb.from("bar_sessions")
      .insert({ owner_id: ownerId, opened_at: now }).select("id").single();
    if (newSession?.id) {
      await sb.from("bar_sub_sessions").insert({ owner_id: ownerId, bar_session_id: newSession.id, opened_at: now, cashier_float: barFloatVal });
    }
    if (hasMachines) {
      await sb.from("machine_float_sessions").insert({ owner_id: ownerId, amount: parseFloat(openMachineFloat) || 0, set_at: now });
    }
    setBarToggleBusy(false); setBarSessionStart(now); setBarClosedAt(null);
    toast.success("🟢 Bar opened");
  };

  const handleCloseBar = async () => {
    setBarToggleBusy(true);
    const now = new Date().toISOString();
    await sb.from("bar_sub_sessions").update({ closed_at: now }).eq("owner_id", ownerId).is("closed_at", null);
    await sb.from("bar_sessions").update({ closed_at: now }).eq("owner_id", ownerId).is("closed_at", null);
    const { error } = await sb.from("profiles").update({ bar_closed_at: now }).eq("id", ownerId);
    setBarToggleBusy(false);
    if (error) { toast.error("Failed to close bar"); return; }
    setBarClosedAt(now); toast.success("🔴 Bar closed");
  };

  // ── Active tab ─────────────────────────────────────────────────────────────
  const [tab, setTab] = useState<"expenses" | "timecards">("expenses");


  return (
    <div className="py-3 space-y-4 pb-24">

      {/* ── Page header ── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: "var(--gradient-hero)" }}>
            <Settings2 className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-black leading-tight">Manage</h1>
            <p className="text-xs text-muted-foreground">{managerName}</p>
          </div>
        </div>

        {/* Bar open/close toggle — inline with title */}
        {!barStateLoading && (
          <button
            type="button"
            disabled={barToggleBusy}
            onClick={barIsOpen ? () => setShowCloseBarConfirm(true) : handleOpenBar}
            className="h-9 px-3 rounded-xl font-black text-xs flex items-center gap-1.5 transition active:scale-95 disabled:opacity-50 shrink-0"
            style={barIsOpen
              ? { background: "rgba(134,239,172,0.12)", border: "1.5px solid #86efac", color: "#86efac" }
              : { background: "rgba(239,68,68,0.12)", border: "1.5px solid #f87171", color: "#f87171" }}
          >
            {barToggleBusy
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <span className="text-[11px]">{barIsOpen ? "🟢" : "🔴"}</span>}
            {barIsOpen ? "Open" : "Closed"}
          </button>
        )}
      </div>

      {/* ── Tabs ── */}
      <div className="grid grid-cols-2 gap-2 rounded-2xl p-1"
        style={{ background: "var(--gradient-card)", border: "1px solid var(--border)" }}>
        {(["expenses", "timecards"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className="h-10 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition active:scale-[0.98]"
            style={tab === t
              ? { background: "var(--gradient-hero)", color: "var(--primary-foreground)" }
              : { color: "var(--muted-foreground)" }}>
            {t === "expenses" ? <TrendingDown className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
            {t === "expenses" ? "Expenses" : "Time Cards"}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      {tab === "expenses" ? (
        <ExpensesTab
          profile={profile}
          ownerId={ownerId}
          managerName={managerName}
          barIsOpen={barIsOpen}
          barStateLoading={barStateLoading}
          barSessionStart={barSessionStart}
        />
      ) : (
        <TimeCardsTab
          profile={profile}
          ownerId={ownerId}
          managerName={managerName}
        />
      )}


      {/* ── Close Bar Confirm Modal ── */}
      {showCloseBarConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-border shadow-2xl overflow-hidden"
            style={{ background: "var(--gradient-card)" }}>
            <div className="px-6 pt-6 pb-2 text-center">
              <div className="h-14 w-14 rounded-full flex items-center justify-center mx-auto mb-3"
                style={{ background: "rgba(239,68,68,0.12)", border: "1.5px solid #f87171" }}>
                <span className="text-2xl">🔴</span>
              </div>
              <h2 className="font-black text-xl">Close Bar?</h2>
              <p className="text-sm text-muted-foreground mt-2">This will end the current session.</p>
            </div>
            <div className="px-6 pb-6 pt-4 flex gap-3">
              <button onClick={() => setShowCloseBarConfirm(false)}
                className="flex-1 h-12 rounded-2xl font-black text-sm border border-border transition active:scale-95">
                Cancel
              </button>
              <button onClick={() => { setShowCloseBarConfirm(false); handleCloseBar(); }}
                disabled={barToggleBusy}
                className="flex-1 h-12 rounded-2xl font-black text-sm transition active:scale-95 disabled:opacity-50"
                style={{ background: "rgba(239,68,68,0.15)", border: "1.5px solid #f87171", color: "#f87171" }}>
                {barToggleBusy ? <Loader2 className="h-4 w-4 animate-spin inline" /> : "Close Bar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Open Bar Modal ── */}
      {showOpenBarModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-border shadow-2xl overflow-hidden"
            style={{ background: "var(--gradient-card)" }}>
            <div className="px-6 pt-6 pb-2 text-center">
              <div className="h-14 w-14 rounded-full flex items-center justify-center mx-auto mb-3"
                style={{ background: "rgba(134,239,172,0.12)", border: "1.5px solid #86efac" }}>
                <span className="text-2xl">🟢</span>
              </div>
              <h2 className="font-black text-xl">Open Bar</h2>
              <p className="text-sm text-muted-foreground mt-1">Set the opening float</p>
            </div>
            <div className="px-6 pb-6 pt-4 space-y-3">
              {!isMachinesAccount && (
                <div>
                  <label className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-1 block">Bar Float ($)</label>
                  <input value={openBarFloat} onChange={(e) => setOpenBarFloat(e.target.value)}
                    type="number" min="0" step="0.01" placeholder="0.00"
                    className="w-full h-11 rounded-xl border border-border bg-muted px-3 text-sm font-bold outline-none focus:ring-1 focus:ring-primary" />
                </div>
              )}
              {hasMachines && (
                <div>
                  <label className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-1 block">Machine Float ($)</label>
                  <input value={openMachineFloat} onChange={(e) => setOpenMachineFloat(e.target.value)}
                    type="number" min="0" step="0.01" placeholder="0.00"
                    className="w-full h-11 rounded-xl border border-border bg-muted px-3 text-sm font-bold outline-none focus:ring-1 focus:ring-primary" />
                </div>
              )}
              <div className="flex gap-3 pt-1">
                <button onClick={() => setShowOpenBarModal(false)}
                  className="flex-1 h-12 rounded-2xl font-black text-sm border border-border transition active:scale-95">
                  Cancel
                </button>
                <button onClick={confirmOpenBar} disabled={barToggleBusy}
                  className="flex-1 h-12 rounded-2xl font-black text-sm transition active:scale-95 disabled:opacity-50"
                  style={{ background: "rgba(134,239,172,0.15)", border: "1.5px solid #86efac", color: "#86efac" }}>
                  {barToggleBusy ? <Loader2 className="h-4 w-4 animate-spin inline" /> : "Open Bar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}


// ─── Expenses Tab (original view, unchanged logic) ────────────────────────────
function ExpensesTab({
  profile,
  ownerId,
  managerName,
  barIsOpen,
  barStateLoading,
  barSessionStart,
}: {
  profile: { id: string; username?: string | null; wallet_balance: number };
  ownerId: string;
  managerName: string;
  barIsOpen: boolean;
  barStateLoading: boolean;
  barSessionStart: string | null;
}) {
  const sb = supabase as any;
  const tag = `[Manager: ${managerName}]`;

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [openMonth, setOpenMonth] = useState<string | null>(null);

  const loadExpenses = useCallback(async () => {
    setLoading(true);
    const { data } = await sb.from("owner_expenses").select("*")
      .eq("owner_id", ownerId)
      .ilike("description", `%[Manager: ${managerName}]%`)
      .order("created_at", { ascending: false });
    setExpenses((data ?? []) as Expense[]);
    setLoading(false);
  }, [ownerId, managerName]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadExpenses(); }, [loadExpenses]);

  useEffect(() => {
    const ch = supabase.channel(`mgr-expenses-${profile.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "owner_expenses", filter: `owner_id=eq.${ownerId}` },
        () => loadExpenses())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [ownerId, profile.id, loadExpenses]);

  const totalAllTime = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const sessionExpenses = expenses
    .filter((e) => barSessionStart && new Date(e.created_at) >= new Date(barSessionStart))
    .reduce((s, e) => s + Number(e.amount), 0);

  const [showForm, setShowForm] = useState(false);
  const [lines, setLines] = useState<{ description: string; amount: string }[]>([{ description: "", amount: "" }]);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const lineTotal = lines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);


  const handleSave = async () => {
    const valid = lines.filter((l) => l.description.trim() && parseFloat(l.amount) > 0);
    if (!valid.length) { toast.error("Add at least one item with a description and amount"); return; }
    setSaving(true);
    const total = valid.reduce((s, l) => s + parseFloat(l.amount), 0);
    const today = trinidadDate();
    const description =
      valid.length === 1
        ? `Non-Stock Expense\n${valid[0].description.trim()} = $${parseFloat(valid[0].amount).toFixed(2)} ${tag}`
        : `Non-Stock Expense\n${valid.map((l) => `${l.description.trim()} = $${parseFloat(l.amount).toFixed(2)}`).join("\n")}\n${tag}`;
    try {
      const { error: expErr } = await sb.from("owner_expenses").insert({ owner_id: ownerId, amount: total, description, expense_date: today });
      if (expErr) { toast.error(expErr.message); return; }
      const { data: ownerRow } = await sb.from("profiles").select("wallet_balance").eq("id", ownerId).single();
      await sb.from("profiles").update({ wallet_balance: Number(ownerRow?.wallet_balance ?? 0) - total }).eq("id", ownerId);
      const expenseNote = valid.length === 1 ? `Expense: ${valid[0].description.trim()}` : `Bulk Expense (${valid.length} items)`;
      await sb.from("wallet_transactions").insert({ profile_id: profile.id, amount: total, type: "cashier_expense", note: expenseNote });
      toast.success("Expense saved");
      setLines([{ description: "", amount: "" }]); setShowForm(false); setConfirming(false);
      loadExpenses();
    } finally { setSaving(false); }
  };

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLines, setEditLines] = useState<{ description: string; amount: string }[]>([]);
  const [editSaving, setEditSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const lastExpenseId = expenses.length > 0 ? expenses[0].id : null;

  const startEdit = (e: Expense) => {
    const raw = (e.description ?? "").replace(tag, "").trim();
    const parsed = raw.split("\n").filter((l) => l && l !== "Non-Stock Expense").map((l) => {
      const match = l.match(/^(.+?)\s*=\s*\$?([\d.]+)$/);
      if (match) return { description: match[1].trim(), amount: match[2] };
      return { description: l.trim(), amount: String(e.amount) };
    });
    setEditLines(parsed.length > 0 ? parsed : [{ description: "", amount: String(e.amount) }]);
    setEditingId(e.id);
  };

  const handleEditSave = async (e: Expense) => {
    const valid = editLines.filter((l) => l.description.trim() && parseFloat(l.amount) > 0);
    if (!valid.length) { toast.error("Add at least one item with description and amount"); return; }
    setEditSaving(true);
    const newTotal = valid.reduce((s, l) => s + parseFloat(l.amount), 0);
    const diff = newTotal - Number(e.amount);
    const description =
      valid.length === 1
        ? `Non-Stock Expense\n${valid[0].description.trim()} = $${parseFloat(valid[0].amount).toFixed(2)} ${tag}`
        : `Non-Stock Expense\n${valid.map((l) => `${l.description.trim()} = $${parseFloat(l.amount).toFixed(2)}`).join("\n")}\n${tag}`;
    try {
      const { error: upErr } = await sb.from("owner_expenses").update({ amount: newTotal, description }).eq("id", e.id);
      if (upErr) { toast.error(upErr.message); return; }
      if (diff !== 0) {
        const { data: ownerRow } = await sb.from("profiles").select("wallet_balance").eq("id", ownerId).single();
        await sb.from("profiles").update({ wallet_balance: Number(ownerRow?.wallet_balance ?? 0) - diff }).eq("id", ownerId);
      }
      toast.success("Expense updated"); setEditingId(null); loadExpenses();
    } finally { setEditSaving(false); }
  };

  const handleDelete = async (e: Expense) => {
    setDeleting(true);
    try {
      const { error: delErr } = await sb.from("owner_expenses").delete().eq("id", e.id);
      if (delErr) { toast.error(delErr.message); return; }
      const { data: ownerRow } = await sb.from("profiles").select("wallet_balance").eq("id", ownerId).single();
      await sb.from("profiles").update({ wallet_balance: Number(ownerRow?.wallet_balance ?? 0) + Number(e.amount) }).eq("id", ownerId);
      toast.success("Expense deleted and wallet refunded"); setDeleteConfirmId(null); loadExpenses();
    } finally { setDeleting(false); }
  };

  const byMonth: Record<string, Expense[]> = {};
  expenses.forEach((e) => { const k = monthKey(e.expense_date); if (!byMonth[k]) byMonth[k] = []; byMonth[k].push(e); });
  const months = Object.keys(byMonth).sort((a, b) => b.localeCompare(a));


  return (
    <div className="space-y-4">
      {/* Bar closed banner */}
      {!barStateLoading && !barIsOpen && (
        <div className="rounded-2xl px-4 py-3 flex items-center gap-3"
          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}>
          <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
          <span className="text-sm font-semibold text-red-400">Bar is closed — expenses cannot be added, edited, or deleted.</span>
        </div>
      )}

      {/* Summary cards */}
      <div className="rounded-3xl p-4 space-y-3 relative overflow-hidden"
        style={{ background: "var(--gradient-hero)", boxShadow: "var(--shadow-glow)" }}>
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <p className="text-xs font-black relative" style={{ color: "rgba(0,0,0,0.65)" }}>My Expense Summary</p>
        <div className="grid grid-cols-2 gap-2 relative">
          {[
            { label: "Session\nExpense", value: barIsOpen ? `$${fmt(sessionExpenses)}` : "—" },
            { label: "Total\nExpense",   value: totalAllTime > 0 ? `$${fmt(totalAllTime)}` : "$0.00" },
          ].map((c) => (
            <div key={c.label} className="rounded-2xl p-2.5 flex flex-col gap-0.5 text-center"
              style={{ background: "oklch(0.18 0.02 60)" }}>
              <div className="text-[9px] font-semibold leading-tight whitespace-pre-line"
                style={{ color: "rgba(255,255,255,0.5)" }}>{c.label}</div>
              <div className="font-black text-xs" style={{ color: "#fca5a5" }}>{c.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Add Expense */}
      {barIsOpen && (
        <div className="space-y-2">
          <button onClick={() => { setShowForm((v) => !v); setConfirming(false); }}
            className="w-full h-11 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition active:scale-[0.98] border"
            style={showForm
              ? { background: "var(--gradient-hero)", color: "var(--primary-foreground)", borderColor: "transparent" }
              : { background: "var(--gradient-card)", borderColor: "var(--border)", color: "var(--primary)" }}>
            {showForm ? "✕ Cancel" : "+ Add Expense"}
          </button>

          {showForm && (
            <div className="rounded-2xl border border-border p-4 space-y-3" style={{ background: "var(--gradient-card)" }}>
              <p className="text-xs font-black text-muted-foreground uppercase tracking-widest">Expense Lines</p>
              {lines.map((line, i) => (
                <div key={i} className="space-y-1.5">
                  <input value={line.description} onChange={(e) => setLines((l) => l.map((ll, idx) => idx === i ? { ...ll, description: e.target.value } : ll))}
                    placeholder="Description (e.g. Supplies)"
                    className="w-full h-10 rounded-xl border border-border bg-muted px-3 text-sm font-bold outline-none focus:ring-1 focus:ring-primary" />
                  <div className="flex gap-2 items-center">
                    <input value={line.amount} onChange={(e) => setLines((l) => l.map((ll, idx) => idx === i ? { ...ll, amount: e.target.value } : ll))}
                      placeholder="$0.00" type="number" min="0" step="0.01"
                      className="flex-1 h-10 rounded-xl border border-border bg-muted px-3 text-sm font-bold outline-none focus:ring-1 focus:ring-primary" />
                    {lines.length > 1 && (
                      <button onClick={() => setLines((l) => l.filter((_, idx) => idx !== i))}
                        className="h-10 w-10 rounded-xl flex items-center justify-center bg-destructive/15 text-destructive active:scale-90 transition shrink-0">
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              <button onClick={() => setLines((l) => [...l, { description: "", amount: "" }])}
                className="w-full h-9 rounded-xl border border-dashed border-border text-xs font-black text-muted-foreground hover:text-foreground transition active:scale-[0.98]">
                + Add Line
              </button>
              <div className="pt-1 space-y-2">
                <span className="text-xs text-muted-foreground font-semibold">
                  Total: <span className="font-black text-foreground">${lineTotal.toFixed(2)}</span>
                </span>
                {!confirming ? (
                  <button onClick={() => setConfirming(true)} disabled={lineTotal <= 0}
                    className="w-full h-10 rounded-xl font-black text-sm text-primary-foreground flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-40"
                    style={{ background: "var(--gradient-hero)" }}>
                    Save Expense
                  </button>
                ) : (
                  <div className="space-y-2">
                    <div className="rounded-xl px-3 py-2 text-xs text-center font-semibold"
                      style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171" }}>
                      Deduct ${lineTotal.toFixed(2)} from owner wallet?
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => setConfirming(false)}
                        className="h-10 rounded-xl font-black text-sm border border-border transition active:scale-95">Back</button>
                      <button onClick={handleSave} disabled={saving}
                        className="h-10 rounded-xl font-black text-sm text-primary-foreground flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-50"
                        style={{ background: "#dc2626" }}>
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}


      {/* Expense History */}
      <div className="space-y-2">
        <p className="text-xs font-black text-muted-foreground uppercase tracking-widest">My Expenses</p>
        {loading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="rounded-xl h-14 bg-muted/30 animate-pulse" />)}</div>
        ) : months.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">No expenses logged yet.</div>
        ) : (
          months.map((mk) => {
            const me = byMonth[mk];
            const mt = me.reduce((s, e) => s + Number(e.amount), 0);
            const isOpen = openMonth === mk;
            return (
              <div key={mk} className="rounded-2xl border border-border overflow-hidden" style={{ background: "var(--gradient-card)" }}>
                <button type="button" onClick={() => setOpenMonth(isOpen ? null : mk)}
                  className="w-full flex items-center justify-between px-4 py-3 transition hover:bg-muted/20">
                  <div className="text-left">
                    <p className="font-black text-sm">{monthLabel(mk)}</p>
                    <p className="text-xs text-muted-foreground">{me.length} expense{me.length !== 1 ? "s" : ""}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-black text-sm text-red-400">${fmt(mt)}</span>
                    <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  </div>
                </button>
                {isOpen && (
                  <div className="border-t border-border divide-y divide-border/40">
                    {me.map((e) => {
                      const canEdit = e.id === lastExpenseId && barIsOpen;
                      const raw = (e.description ?? "").replace(tag, "").trim();
                      const descLines = raw.split("\n").filter((l) => l && l !== "Non-Stock Expense").map((l) => l.trim());
                      const isEditing = editingId === e.id;
                      return (
                        <div key={e.id} className="px-4 py-3 space-y-2">
                          {isEditing ? (
                            <div className="space-y-2">
                              <p className="text-xs font-black text-muted-foreground uppercase tracking-widest">Edit Expense</p>
                              {editLines.map((el, i) => (
                                <div key={i} className="space-y-1">
                                  <input value={el.description}
                                    onChange={(ev) => setEditLines((ls) => ls.map((l, idx) => idx === i ? { ...l, description: ev.target.value } : l))}
                                    placeholder="Description"
                                    className="w-full h-9 rounded-xl border border-border bg-muted px-3 text-sm font-bold outline-none focus:ring-1 focus:ring-primary" />
                                  <div className="flex gap-2">
                                    <input value={el.amount}
                                      onChange={(ev) => setEditLines((ls) => ls.map((l, idx) => idx === i ? { ...l, amount: ev.target.value } : l))}
                                      placeholder="$0.00" type="number" min="0" step="0.01"
                                      className="flex-1 h-9 rounded-xl border border-border bg-muted px-3 text-sm font-bold outline-none focus:ring-1 focus:ring-primary" />
                                    {editLines.length > 1 && (
                                      <button onClick={() => setEditLines((ls) => ls.filter((_, idx) => idx !== i))}
                                        className="h-9 w-9 rounded-xl flex items-center justify-center bg-destructive/15 text-destructive active:scale-90 transition">
                                        <X className="h-3.5 w-3.5" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))}
                              <button onClick={() => setEditLines((ls) => [...ls, { description: "", amount: "" }])}
                                className="w-full h-8 rounded-xl border border-dashed border-border text-xs font-black text-muted-foreground transition active:scale-[0.98]">
                                + Add Line
                              </button>
                              <div className="grid grid-cols-2 gap-2 pt-1">
                                <button onClick={() => { setEditingId(null); setEditLines([]); }}
                                  className="h-9 rounded-xl font-black text-xs border border-border transition active:scale-95">Cancel</button>
                                <button onClick={() => handleEditSave(e)} disabled={editSaving}
                                  className="h-9 rounded-xl font-black text-xs text-primary-foreground flex items-center justify-center transition active:scale-95 disabled:opacity-50"
                                  style={{ background: "var(--gradient-hero)" }}>
                                  {editSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
                                </button>
                              </div>
                            </div>
                          ) : deleteConfirmId === e.id ? (
                            <div className="space-y-2">
                              <p className="text-xs font-semibold text-center text-red-400">Delete ${fmt(Number(e.amount))} expense and refund to wallet?</p>
                              <div className="grid grid-cols-2 gap-2">
                                <button onClick={() => setDeleteConfirmId(null)}
                                  className="h-9 rounded-xl font-black text-xs border border-border transition active:scale-95">Cancel</button>
                                <button onClick={() => handleDelete(e)} disabled={deleting}
                                  className="h-9 rounded-xl font-black text-xs text-white flex items-center justify-center transition active:scale-95 disabled:opacity-50"
                                  style={{ background: "#dc2626" }}>
                                  {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Delete"}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-start gap-3">
                              <div className="h-8 w-8 rounded-full flex items-center justify-center shrink-0 border"
                                style={{ background: "rgba(239,68,68,0.10)", borderColor: "rgba(239,68,68,0.25)" }}>
                                <TrendingDown className="h-3.5 w-3.5 text-red-400" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-muted-foreground">
                                  {new Date(e.created_at).toLocaleString("en-GB", { timeZone: "America/Port_of_Spain", hour: "2-digit", minute: "2-digit", hour12: true, day: "numeric", month: "short", year: "numeric" })}
                                </p>
                                {descLines.map((l, i) => <p key={i} className="text-sm font-semibold leading-snug mt-0.5 break-words">{l}</p>)}
                              </div>
                              <div className="flex flex-col items-end gap-1 shrink-0">
                                <span className="font-black text-sm text-red-400">${fmt(Number(e.amount))}</span>
                                {canEdit && (
                                  <div className="flex gap-1 mt-0.5">
                                    <button onClick={() => startEdit(e)}
                                      className="h-7 w-7 rounded-lg flex items-center justify-center transition active:scale-90"
                                      style={{ background: "rgba(255,255,255,0.08)" }}>
                                      <Pencil className="h-3 w-3 text-muted-foreground" />
                                    </button>
                                    <button onClick={() => setDeleteConfirmId(e.id)}
                                      className="h-7 w-7 rounded-lg flex items-center justify-center transition active:scale-90"
                                      style={{ background: "rgba(239,68,68,0.12)" }}>
                                      <Trash2 className="h-3 w-3 text-red-400" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
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


// ─── Time Cards Tab ───────────────────────────────────────────────────────────
function TimeCardsTab({
  profile,
  ownerId,
  managerName,
}: {
  profile: { id: string; username?: string | null; wallet_balance: number };
  ownerId: string;
  managerName: string;
}) {
  const sb = supabase as any;

  // ── Employees list (includes manager themselves) ───────────────────────────
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [empLoading, setEmpLoading] = useState(true);

  const loadEmployees = useCallback(async () => {
    setEmpLoading(true);
    // Fetch all staff under this owner
    const { data: staff } = await sb.from("profiles")
      .select("id, username, role, job_title")
      .eq("parent_id", ownerId)
      .in("role", ["cashier", "manager", "custom"])
      .order("username", { ascending: true });
    // Include the manager themselves
    const self: Employee = { id: profile.id, username: managerName, role: "manager" };
    const staffList = (staff ?? []) as Employee[];
    // Put self first if not already in list
    const hasSelf = staffList.some((e) => e.id === profile.id);
    setEmployees(hasSelf ? staffList : [self, ...staffList]);
    setEmpLoading(false);
  }, [ownerId, profile.id, managerName]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadEmployees(); }, [loadEmployees]);

  // ── Time cards ─────────────────────────────────────────────────────────────
  const [timeCards, setTimeCards] = useState<TimeCard[]>([]);
  const [tcLoading, setTcLoading] = useState(true);

  const loadTimeCards = useCallback(async () => {
    setTcLoading(true);
    const { data } = await sb.from("time_cards")
      .select("*")
      .eq("owner_id", ownerId)
      .order("clocked_in_at", { ascending: false });
    setTimeCards((data ?? []) as TimeCard[]);
    setTcLoading(false);
  }, [ownerId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadTimeCards(); }, [loadTimeCards]);

  useEffect(() => {
    const ch = supabase.channel(`mgr-timecards-${ownerId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "time_cards", filter: `owner_id=eq.${ownerId}` },
        () => loadTimeCards())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [ownerId, loadTimeCards]);

  // ── Selected employee detail ───────────────────────────────────────────────
  const [selectedEmp, setSelectedEmp] = useState<Employee | null>(null);
  const [clockBusy, setClockBusy] = useState(false);

  // Open card for this employee — the most recent open (not clocked out) entry
  const openCard = selectedEmp
    ? timeCards.find((tc) => tc.employee_id === selectedEmp.id && !tc.clocked_out_at) ?? null
    : null;

  const isClockedIn = !!openCard;

  const handleClockIn = async () => {
    if (!selectedEmp) return;
    setClockBusy(true);
    const now = new Date().toISOString();
    const { error } = await sb.from("time_cards").insert({
      owner_id: ownerId,
      employee_id: selectedEmp.id,
      employee_name: selectedEmp.username,
      clocked_in_at: now,
      work_date: trinidadDate(),
    });
    setClockBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${selectedEmp.username} clocked in`);
    loadTimeCards();
  };

  const handleClockOut = async () => {
    if (!openCard) return;
    setClockBusy(true);
    const now = new Date().toISOString();
    const { error } = await sb.from("time_cards").update({ clocked_out_at: now }).eq("id", openCard.id);
    setClockBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${openCard.employee_name} clocked out`);
    loadTimeCards();
  };

  // Cards for the selected employee (history, latest first)
  const empCards = selectedEmp
    ? timeCards.filter((tc) => tc.employee_id === selectedEmp.id)
    : [];

  // Group all cards by work_date for the history section
  const byDate: Record<string, TimeCard[]> = {};
  timeCards.forEach((tc) => {
    if (!byDate[tc.work_date]) byDate[tc.work_date] = [];
    byDate[tc.work_date].push(tc);
  });
  const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

  const [openDate, setOpenDate] = useState<string | null>(null);

  function displayName(emp: Employee) {
    return emp.username;
  }
  function roleLabel(emp: Employee) {
    if (emp.role === "manager") return "Manager";
    if (emp.role === "custom" && emp.job_title) return emp.job_title;
    if (emp.role === "cashier") return "Cashier";
    return emp.role;
  }


  return (
    <div className="space-y-4">

      {/* ── Employee list or detail view ── */}
      {!selectedEmp ? (
        <>
          <p className="text-xs font-black text-muted-foreground uppercase tracking-widest">Select Employee</p>
          {empLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-2xl h-16 bg-muted/30 animate-pulse" />
              ))}
            </div>
          ) : employees.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">No staff found.</div>
          ) : (
            <div className="space-y-2">
              {employees.map((emp) => {
                const empOpen = timeCards.find((tc) => tc.employee_id === emp.id && !tc.clocked_out_at);
                return (
                  <button key={emp.id} onClick={() => setSelectedEmp(emp)}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border transition active:scale-[0.98] text-left"
                    style={{ background: "var(--gradient-card)", borderColor: empOpen ? "#86efac" : "var(--border)", boxShadow: empOpen ? "0 0 0 1px rgba(134,239,172,0.3)" : undefined }}>
                    <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 font-black text-sm"
                      style={{ background: empOpen ? "rgba(134,239,172,0.15)" : "rgba(255,255,255,0.06)", color: empOpen ? "#86efac" : "var(--primary)" }}>
                      {displayName(emp).charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-sm truncate">{displayName(emp)}</p>
                      <p className="text-xs text-muted-foreground">{roleLabel(emp)}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {empOpen ? (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full"
                          style={{ background: "rgba(134,239,172,0.15)", color: "#86efac", border: "1px solid rgba(134,239,172,0.4)" }}>
                          Clocked In
                        </span>
                      ) : (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full"
                          style={{ background: "rgba(255,255,255,0.06)", color: "var(--muted-foreground)", border: "1px solid var(--border)" }}>
                          Out
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </>
      ) : (
        /* ── Employee detail: clock in/out ── */
        <div className="space-y-4">
          {/* Back + employee header */}
          <div className="flex items-center gap-3">
            <button onClick={() => setSelectedEmp(null)}
              className="h-9 w-9 rounded-xl flex items-center justify-center border border-border transition active:scale-95"
              style={{ background: "var(--gradient-card)" }}>
              <X className="h-4 w-4" />
            </button>
            <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 font-black text-sm"
              style={{ background: isClockedIn ? "rgba(134,239,172,0.15)" : "rgba(255,255,255,0.06)", color: isClockedIn ? "#86efac" : "var(--primary)" }}>
              {displayName(selectedEmp).charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-black text-base truncate">{displayName(selectedEmp)}</p>
              <p className="text-xs text-muted-foreground">{roleLabel(selectedEmp)}</p>
            </div>
          </div>

          {/* Status card */}
          <div className="rounded-3xl p-5 relative overflow-hidden"
            style={{
              background: isClockedIn ? "rgba(134,239,172,0.08)" : "rgba(239,68,68,0.08)",
              border: isClockedIn ? "1.5px solid rgba(134,239,172,0.35)" : "1.5px solid rgba(239,68,68,0.25)",
            }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-widest mb-1"
                  style={{ color: isClockedIn ? "rgba(134,239,172,0.7)" : "rgba(239,68,68,0.6)" }}>
                  {isClockedIn ? "Currently Clocked In" : "Currently Clocked Out"}
                </p>
                {isClockedIn && openCard && (
                  <p className="font-black text-lg" style={{ color: "#86efac" }}>
                    Since {fmtTime(openCard.clocked_in_at)}
                  </p>
                )}
                {isClockedIn && openCard && (
                  <p className="text-xs mt-0.5" style={{ color: "rgba(134,239,172,0.6)" }}>
                    {fmtDuration(openCard.clocked_in_at, null)} on shift
                  </p>
                )}
                {!isClockedIn && (
                  <p className="font-black text-base text-muted-foreground">Not on shift</p>
                )}
              </div>
              <div className="text-4xl">{isClockedIn ? "🟢" : "⚫"}</div>
            </div>
          </div>

          {/* Clock In / Clock Out buttons */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handleClockIn}
              disabled={isClockedIn || clockBusy}
              className="h-14 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
              style={!isClockedIn
                ? { background: "rgba(134,239,172,0.15)", border: "1.5px solid #86efac", color: "#86efac" }
                : { background: "var(--gradient-card)", border: "1.5px solid var(--border)", color: "var(--muted-foreground)" }}>
              {clockBusy && !isClockedIn ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
              Clock In
            </button>
            <button
              onClick={handleClockOut}
              disabled={!isClockedIn || clockBusy}
              className="h-14 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
              style={isClockedIn
                ? { background: "rgba(239,68,68,0.12)", border: "1.5px solid #f87171", color: "#f87171" }
                : { background: "var(--gradient-card)", border: "1.5px solid var(--border)", color: "var(--muted-foreground)" }}>
              {clockBusy && isClockedIn ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
              Clock Out
            </button>
          </div>


          {/* This employee's time card history */}
          <div className="space-y-2">
            <p className="text-xs font-black text-muted-foreground uppercase tracking-widest">
              Time Card History
            </p>
            {tcLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => <div key={i} className="rounded-xl h-14 bg-muted/30 animate-pulse" />)}
              </div>
            ) : empCards.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">No time cards yet.</div>
            ) : (
              empCards.map((tc) => (
                <div key={tc.id}
                  className="rounded-2xl border px-4 py-3 flex items-center gap-3"
                  style={{
                    background: "var(--gradient-card)",
                    borderColor: !tc.clocked_out_at ? "rgba(134,239,172,0.35)" : "var(--border)",
                  }}>
                  {/* Date badge */}
                  <div className="rounded-xl px-2.5 py-1.5 text-center shrink-0"
                    style={{ background: "rgba(255,255,255,0.06)", minWidth: 52 }}>
                    <p className="text-[9px] font-black text-muted-foreground uppercase">
                      {new Date(tc.work_date + "T12:00:00").toLocaleDateString("en-US", { month: "short" })}
                    </p>
                    <p className="font-black text-base leading-none">
                      {new Date(tc.work_date + "T12:00:00").getDate()}
                    </p>
                  </div>
                  {/* Times */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 text-sm font-bold">
                      <LogIn className="h-3.5 w-3.5 text-green-400 shrink-0" />
                      <span className="text-green-400">{fmtTime(tc.clocked_in_at)}</span>
                      {tc.clocked_out_at && (
                        <>
                          <span className="text-muted-foreground/50">→</span>
                          <LogOut className="h-3.5 w-3.5 text-red-400 shrink-0" />
                          <span className="text-red-400">{fmtTime(tc.clocked_out_at)}</span>
                        </>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {tc.clocked_out_at
                        ? `Duration: ${fmtDuration(tc.clocked_in_at, tc.clocked_out_at)}`
                        : "Still on shift"}
                    </p>
                  </div>
                  {!tc.clocked_out_at && (
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full shrink-0"
                      style={{ background: "rgba(134,239,172,0.15)", color: "#86efac", border: "1px solid rgba(134,239,172,0.4)" }}>
                      Active
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}


      {/* ── Full time card history (all staff, grouped by date) ── */}
      {!selectedEmp && (
        <div className="space-y-2 mt-2">
          <p className="text-xs font-black text-muted-foreground uppercase tracking-widest">All Time Cards</p>
          {tcLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <div key={i} className="rounded-xl h-14 bg-muted/30 animate-pulse" />)}
            </div>
          ) : dates.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">No time cards recorded yet.</div>
          ) : (
            dates.map((d) => {
              const cards = byDate[d];
              const isOpen = openDate === d;
              const activeCount = cards.filter((c) => !c.clocked_out_at).length;
              const dateLabel = new Date(d + "T12:00:00").toLocaleDateString("en-US", {
                weekday: "short", month: "short", day: "numeric", year: "numeric",
              });
              return (
                <div key={d} className="rounded-2xl border border-border overflow-hidden"
                  style={{ background: "var(--gradient-card)" }}>
                  <button type="button" onClick={() => setOpenDate(isOpen ? null : d)}
                    className="w-full flex items-center justify-between px-4 py-3 transition hover:bg-muted/20">
                    <div className="text-left">
                      <p className="font-black text-sm">{dateLabel}</p>
                      <p className="text-xs text-muted-foreground">
                        {cards.length} record{cards.length !== 1 ? "s" : ""}
                        {activeCount > 0 && <span className="text-green-400 ml-1">· {activeCount} active</span>}
                      </p>
                    </div>
                    <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  </button>
                  {isOpen && (
                    <div className="border-t border-border divide-y divide-border/40">
                      {cards.map((tc) => (
                        <div key={tc.id} className="px-4 py-3 flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full flex items-center justify-center shrink-0 font-black text-xs"
                            style={{ background: "rgba(255,255,255,0.06)" }}>
                            {tc.employee_name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-black text-sm truncate">{tc.employee_name}</p>
                            <div className="flex items-center gap-1.5 text-xs mt-0.5">
                              <span className="text-green-400 font-bold">{fmtTime(tc.clocked_in_at)}</span>
                              {tc.clocked_out_at && (
                                <>
                                  <span className="text-muted-foreground/50">→</span>
                                  <span className="text-red-400 font-bold">{fmtTime(tc.clocked_out_at)}</span>
                                  <span className="text-muted-foreground">· {fmtDuration(tc.clocked_in_at, tc.clocked_out_at)}</span>
                                </>
                              )}
                              {!tc.clocked_out_at && (
                                <span className="text-green-400 font-semibold">· Still on shift</span>
                              )}
                            </div>
                          </div>
                          {!tc.clocked_out_at && (
                            <span className="text-[10px] font-black px-2 py-0.5 rounded-full shrink-0"
                              style={{ background: "rgba(134,239,172,0.15)", color: "#86efac", border: "1px solid rgba(134,239,172,0.35)" }}>
                              Active
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

    </div>
  );
}
