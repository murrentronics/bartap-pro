import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useChain } from "@/lib/ChainContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Loader2, TrendingDown, X, Settings2, Pencil, Trash2,
  AlertTriangle, Clock, LogIn, LogOut, ChevronDown, LayoutGrid,
  FileDown, Users, CalendarDays,
} from "lucide-react";
import { downloadPdf } from "@/lib/download";
import { drawHeader, addFootersToAllPages, LM, RM, CONTENT_BOTTOM } from "@/lib/pdfHelpers";

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
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-GB", { year: "numeric", month: "long" });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: "America/Port_of_Spain", hour: "numeric", minute: "2-digit", hour12: true,
  });
}
function trinidadDate() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Port_of_Spain" });
}
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
    return <div className="text-center text-muted-foreground py-20">Manager access only.</div>;
  }
  const ownerId = effectiveOwnerId((profile as any).parent_id ?? profile.id);
  return <ManagerMain profile={profile} ownerId={ownerId} />;
}

// ─── Main shell ───────────────────────────────────────────────────────────────
function ManagerMain({
  profile,
  ownerId,
}: {
  profile: { id: string; username?: string | null; wallet_balance: number };
  ownerId: string;
}) {
  const sb = supabase as any;
  const managerName = profile.username ?? profile.id;

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
  const [activeOpenBarField, setActiveOpenBarField] = useState<"bar" | "machine" | null>(null);
  const barIsOpen = !!barSessionStart && !barClosedAt;

  useEffect(() => {
    if (!ownerId) return;
    setBarStateLoading(true);
    const fetchBarState = () =>
      sb.from("profiles").select("bar_session_start, bar_closed_at").eq("id", ownerId).single()
        .then(({ data }: any) => {
          setBarSessionStart(data?.bar_session_start ?? null);
          setBarClosedAt(data?.bar_closed_at ?? null);
          setBarStateLoading(false);
        });
    fetchBarState();

    const ch = supabase.channel(`mgr-bar-state-${ownerId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${ownerId}` },
        (payload: any) => {
          const rec = payload.new as Record<string, unknown>;
          if ("bar_session_start" in rec) setBarSessionStart((rec.bar_session_start as string | null) ?? null);
          if ("bar_closed_at" in rec) setBarClosedAt((rec.bar_closed_at as string | null) ?? null);
        }).subscribe();

    // Re-fetch when the tab regains focus (handles page refresh / tab switch)
    const onVisible = () => { if (document.visibilityState === "visible") fetchBarState(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      supabase.removeChannel(ch);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [ownerId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleOpenBar = async () => {
    const { data: ownerProfile } = await sb.from("profiles")
      .select("machines_addon_active, plan_type, is_machines_account").eq("id", ownerId).single();
    setHasMachines(!!(ownerProfile?.machines_addon_active) || ownerProfile?.plan_type === "premium" || ownerProfile?.plan_type === "chain");
    setIsMachinesAccount(!!(ownerProfile?.is_machines_account));
    setOpenBarFloat(""); setOpenMachineFloat("");
    setActiveOpenBarField(null);
    setShowOpenBarModal(true);
  };

  const confirmOpenBar = async () => {
    const barFloatVal = isMachinesAccount ? 0 : parseInt(openBarFloat, 10);
    if (!isMachinesAccount && (isNaN(barFloatVal) || barFloatVal < 0)) { toast.error("Enter a valid bar float amount"); return; }
    if (hasMachines) {
      const mf = parseInt(openMachineFloat, 10);
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
      await sb.from("machine_float_sessions").insert({ owner_id: ownerId, amount: parseInt(openMachineFloat, 10) || 0, set_at: now });
    }
    setBarToggleBusy(false); setBarSessionStart(now); setBarClosedAt(null);
    toast.success("🟢 Bar opened");
  };

  const handleCloseBar = async () => {
    setBarToggleBusy(true);
    const now = new Date().toISOString();
    // Auto clock-out all open time cards for this owner
    await sb.from("time_cards").update({ clocked_out_at: now }).eq("owner_id", ownerId).is("clocked_out_at", null);
    await sb.from("bar_sub_sessions").update({ closed_at: now }).eq("owner_id", ownerId).is("closed_at", null);
    await sb.from("bar_sessions").update({ closed_at: now }).eq("owner_id", ownerId).is("closed_at", null);
    const { error } = await sb.from("profiles").update({ bar_closed_at: now }).eq("id", ownerId);
    setBarToggleBusy(false);
    if (error) { toast.error("Failed to close bar"); return; }
    setBarClosedAt(now); toast.success("🔴 Bar closed");
  };

  const [tab, setTab] = useState<"dashboard" | "timecards">("dashboard");

  return (
    <div className="py-3 space-y-4 pb-24">

      {/* Page header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl flex items-center justify-center shrink-0" style={{ background: "var(--gradient-hero)" }}>
            <Settings2 className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-black leading-tight">Manage</h1>
            <p className="text-xs text-muted-foreground">{managerName}</p>
          </div>
        </div>
        {!barStateLoading && (
          <button type="button" disabled={barToggleBusy}
            onClick={barIsOpen ? () => setShowCloseBarConfirm(true) : handleOpenBar}
            className="h-9 px-3 rounded-xl font-black text-xs flex items-center gap-1.5 transition active:scale-95 disabled:opacity-50 shrink-0"
            style={barIsOpen
              ? { background: "rgba(134,239,172,0.12)", border: "1.5px solid #86efac", color: "#86efac" }
              : { background: "rgba(239,68,68,0.12)", border: "1.5px solid #f87171", color: "#f87171" }}>
            {barToggleBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <span className="text-[11px]">{barIsOpen ? "🟢" : "🔴"}</span>}
            {barIsOpen ? "Open" : "Closed"}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-2 gap-2 rounded-2xl p-1" style={{ background: "var(--gradient-card)", border: "1px solid var(--border)" }}>
        {(["dashboard", "timecards"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className="h-10 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition active:scale-[0.98]"
            style={tab === t ? { background: "var(--gradient-hero)", color: "var(--primary-foreground)" } : { color: "var(--muted-foreground)" }}>
            {t === "dashboard" ? <LayoutGrid className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
            {t === "dashboard" ? "Dashboard" : "Time Cards"}
          </button>
        ))}
      </div>

      {tab === "dashboard" ? (
        <DashboardTab profile={profile} ownerId={ownerId} managerName={managerName}
          barIsOpen={barIsOpen} barStateLoading={barStateLoading} barSessionStart={barSessionStart} />
      ) : (
        <TimeCardsTab profile={profile} ownerId={ownerId} managerName={managerName} barIsOpen={barIsOpen} />
      )}

      {/* Close Bar Confirm */}
      {showCloseBarConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-border shadow-2xl overflow-hidden" style={{ background: "var(--gradient-card)" }}>
            <div className="px-6 pt-6 pb-2 text-center">
              <div className="h-14 w-14 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: "rgba(239,68,68,0.12)", border: "1.5px solid #f87171" }}>
                <span className="text-2xl">🔴</span>
              </div>
              <h2 className="font-black text-xl">Close Bar?</h2>
              <p className="text-sm text-muted-foreground mt-2">This will end the current session.</p>
            </div>
            <div className="px-6 pb-6 pt-4 flex gap-3">
              <button onClick={() => setShowCloseBarConfirm(false)} className="flex-1 h-12 rounded-2xl font-black text-sm border border-border transition active:scale-95">Cancel</button>
              <button onClick={() => { setShowCloseBarConfirm(false); handleCloseBar(); }} disabled={barToggleBusy}
                className="flex-1 h-12 rounded-2xl font-black text-sm transition active:scale-95 disabled:opacity-50"
                style={{ background: "rgba(239,68,68,0.15)", border: "1.5px solid #f87171", color: "#f87171" }}>
                {barToggleBusy ? <Loader2 className="h-4 w-4 animate-spin inline" /> : "Close Bar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Open Bar Modal */}
      {showOpenBarModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-border shadow-2xl overflow-hidden" style={{ background: "var(--gradient-card)" }}>
            <div className="px-6 pt-6 pb-2 text-center">
              <div className="h-14 w-14 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: "rgba(134,239,172,0.12)", border: "1.5px solid #86efac" }}>
                <span className="text-2xl">🟢</span>
              </div>
              <h2 className="font-black text-xl">Open Bar</h2>
              <p className="text-sm text-muted-foreground mt-1">Set the opening float</p>
            </div>
            <div className="px-6 pb-6 pt-4 space-y-3">
              {!isMachinesAccount && (
                <div className="space-y-1">
                  <label className="text-xs font-black text-muted-foreground uppercase tracking-widest block">Bar Float ($)</label>
                  <div
                    onClick={() => setActiveOpenBarField(activeOpenBarField === "bar" ? null : "bar")}
                    className="w-full h-11 rounded-xl border bg-background px-4 flex items-center cursor-pointer transition"
                    style={{ borderColor: activeOpenBarField === "bar" ? "var(--primary)" : "var(--border)" }}
                  >
                    <span className={`text-base font-black ${activeOpenBarField === "bar" ? "text-primary" : openBarFloat ? "text-foreground" : "text-muted-foreground"}`}>
                      {openBarFloat || "0"}
                    </span>
                  </div>
                </div>
              )}
              {hasMachines && (
                <div className="space-y-1">
                  <label className="text-xs font-black text-muted-foreground uppercase tracking-widest block">Machine Float ($)</label>
                  <div
                    onClick={() => setActiveOpenBarField(activeOpenBarField === "machine" ? null : "machine")}
                    className="w-full h-11 rounded-xl border bg-background px-4 flex items-center cursor-pointer transition"
                    style={{ borderColor: activeOpenBarField === "machine" ? "var(--primary)" : "var(--border)" }}
                  >
                    <span className={`text-base font-black ${activeOpenBarField === "machine" ? "text-primary" : openMachineFloat ? "text-foreground" : "text-muted-foreground"}`}>
                      {openMachineFloat || "0"}
                    </span>
                  </div>
                </div>
              )}
              {/* Inline numpad — integers only, no decimal */}
              {activeOpenBarField !== null && (
                <div className="grid grid-cols-3 gap-1.5 pt-1">
                  {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((k, i) => (
                    k === "" ? <div key={i} /> :
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        const current = activeOpenBarField === "bar" ? openBarFloat : openMachineFloat;
                        const setter  = activeOpenBarField === "bar" ? setOpenBarFloat : setOpenMachineFloat;
                        if (k === "⌫") { setter(current.slice(0, -1)); return; }
                        setter(current === "0" || current === "" ? k : current + k);
                      }}
                      className={`h-12 rounded-xl font-black text-lg transition active:scale-95 ${
                        k === "⌫"
                          ? "bg-destructive/20 text-destructive hover:bg-destructive/30"
                          : "bg-muted hover:bg-muted/70 text-foreground"
                      }`}
                    >{k}</button>
                  ))}
                </div>
              )}
              <div className="flex gap-3 pt-1">
                <button onClick={() => setShowOpenBarModal(false)} className="flex-1 h-12 rounded-2xl font-black text-sm border border-border transition active:scale-95">Cancel</button>
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

// ─── Dashboard Tab ────────────────────────────────────────────────────────────
function DashboardTab({
  profile, ownerId, managerName, barIsOpen, barStateLoading, barSessionStart,
}: {
  profile: { id: string; username?: string | null; wallet_balance: number };
  ownerId: string; managerName: string;
  barIsOpen: boolean; barStateLoading: boolean; barSessionStart: string | null;
}) {
  const sb = supabase as any;
  const tag = `[Manager: ${managerName}]`;

  // ── Bar float (live) ───────────────────────────────────────────────────────
  const [floatBalance, setFloatBalance] = useState<number>(0);
  const loadFloat = useCallback(async () => {
    const { data } = await sb.from("profiles").select("cashier_float").eq("id", ownerId).single();
    setFloatBalance(Number(data?.cashier_float ?? 0));
  }, [ownerId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadFloat(); }, [loadFloat]);
  useEffect(() => {
    const ch = supabase.channel(`mgr-float-${ownerId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${ownerId}` },
        (payload: any) => {
          const rec = payload.new as Record<string, unknown>;
          if ("cashier_float" in rec) setFloatBalance(Number(rec.cashier_float ?? 0));
        }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [ownerId]);

  // ── Dashboard data (floats, sales, machine) ────────────────────────────────
  const [barFloatSet,          setBarFloatSet]          = useState<number>(0);
  const [machineFloatSet,      setMachineFloatSet]      = useState<number>(0);
  const [machineFloatBal,      setMachineFloatBal]      = useState<number>(0);
  const [machineFloatAnchor,   setMachineFloatAnchor]   = useState<string | null>(null);
  const [sessionBarSales,      setSessionBarSales]      = useState<number>(0);
  const [sessionMachineIn,     setSessionMachineIn]     = useState<number>(0);
  const [sessionMachinePayout, setSessionMachinePayout] = useState<number>(0);
  const [hasMachinesEnabled,   setHasMachinesEnabled]   = useState(false);

  const loadDashboard = useCallback(async () => {
    const { data: ownerRow } = await sb.from("profiles")
      .select("cashier_float, machines_addon_active, plan_type, is_machines_account")
      .eq("id", ownerId).single();
    const hasMach = !!(ownerRow?.machines_addon_active) || ownerRow?.plan_type === "premium" || ownerRow?.plan_type === "chain";
    setHasMachinesEnabled(hasMach);

    // "Amount Set" = the float value from the latest sub-session (original set amount)
    // "Remaining"  = live cashier_float (updated by all deductions in realtime)
    const { data: lastSubSession } = await sb.from("bar_sub_sessions")
      .select("cashier_float").eq("owner_id", ownerId)
      .order("opened_at", { ascending: false }).limit(1).maybeSingle();
    setBarFloatSet(Number(lastSubSession?.cashier_float ?? ownerRow?.cashier_float ?? 0));

    if (barSessionStart) {
      const { data: orders } = await sb.from("orders")
        .select("total").eq("owner_id", ownerId).gte("created_at", barSessionStart);
      setSessionBarSales((orders ?? []).reduce((s: number, o: { total: number }) => s + Number(o.total), 0));
    } else { setSessionBarSales(0); }

    if (hasMach) {
      const { data: floatSess } = await sb.from("machine_float_sessions")
        .select("amount, set_at").eq("owner_id", ownerId)
        .order("set_at", { ascending: false }).limit(1).maybeSingle();
      const mfAmt = Number(floatSess?.amount ?? 0);
      const mfAnchor: string | null = floatSess?.set_at ?? null;
      setMachineFloatSet(mfAmt); setMachineFloatAnchor(mfAnchor);
      if (mfAnchor) {
        const { data: entries } = await sb.from("machine_entries")
          .select("type, amount").eq("owner_id", ownerId).gte("created_at", mfAnchor);
        const rows = (entries ?? []) as { type: string; amount: number }[];
        const mIn  = rows.filter(e => e.type === "income").reduce((s, e) => s + Number(e.amount), 0);
        const mOut = rows.filter(e => e.type === "payout" || e.type === "expense").reduce((s, e) => s + Number(e.amount), 0);
        setSessionMachineIn(mIn); setSessionMachinePayout(mOut);
        setMachineFloatBal(Math.max(0, mfAmt - mOut));
      } else { setSessionMachineIn(0); setSessionMachinePayout(0); setMachineFloatBal(0); }
    }
  }, [ownerId, barSessionStart]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadDashboard(); }, [loadDashboard]);
  useEffect(() => {
    const ch = supabase.channel(`mgr-dash-${ownerId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `owner_id=eq.${ownerId}` }, () => loadDashboard())
      .on("postgres_changes", { event: "*", schema: "public", table: "machine_entries", filter: `owner_id=eq.${ownerId}` }, () => loadDashboard())
      .on("postgres_changes", { event: "*", schema: "public", table: "machine_float_sessions", filter: `owner_id=eq.${ownerId}` }, () => loadDashboard())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [ownerId, loadDashboard]);

  // ── Set float modal state ──────────────────────────────────────────────────
  const [showSetBarFloat,  setShowSetBarFloat]  = useState(false);
  const [showSetMachFloat, setShowSetMachFloat] = useState(false);
  const [setFloatInput,    setSetFloatInput]    = useState("");
  const [setFloatBusy,     setSetFloatBusy]     = useState(false);
  const [barFloatMode,     setBarFloatMode]     = useState<"same" | "new">("new");

  const handleSetBarFloat = async () => {
    const val = parseFloat(setFloatInput);
    if (isNaN(val) || val < 0) { toast.error("Enter a valid amount"); return; }
    setSetFloatBusy(true);
    const now = new Date().toISOString();
    if (barFloatMode === "same") {
      // Same session: add to current float, keep cashier_float_set_at unchanged
      const newTotal = barFloatSet + val;
      await sb.from("profiles").update({ cashier_float: newTotal }).eq("id", ownerId);
      setFloatBalance(newTotal); setBarFloatSet(newTotal);
      toast.success(`Float topped up by $${val.toFixed(2)} — total $${newTotal.toFixed(2)}`);
    } else {
      // New session: close current sub-session, open new one, reset float anchor
      const { data: openBarSession } = await sb.from("bar_sessions")
        .select("id").eq("owner_id", ownerId).is("closed_at", null)
        .order("opened_at", { ascending: false }).limit(1).maybeSingle();
      if (openBarSession?.id) {
        await sb.from("bar_sub_sessions").update({ closed_at: now })
          .eq("owner_id", ownerId).eq("bar_session_id", openBarSession.id).is("closed_at", null);
        await sb.from("bar_sub_sessions").insert({
          owner_id: ownerId, bar_session_id: openBarSession.id, opened_at: now, cashier_float: val,
        });
      }
      await sb.from("profiles").update({ cashier_float: val, cashier_float_set_at: now }).eq("id", ownerId);
      setFloatBalance(val); setBarFloatSet(val);
      toast.success(`New session started — float set to $${val.toFixed(2)}`);
    }
    setSetFloatBusy(false); setShowSetBarFloat(false); setSetFloatInput(""); setBarFloatMode("new");
    loadDashboard();
  };

  const handleSetMachFloat = async () => {
    const val = parseFloat(setFloatInput);
    if (isNaN(val) || val < 0) { toast.error("Enter a valid amount"); return; }
    setSetFloatBusy(true);
    await sb.from("machine_float_sessions").insert({ owner_id: ownerId, amount: val, set_at: new Date().toISOString() });
    setSetFloatBusy(false); setShowSetMachFloat(false); setSetFloatInput("");
    toast.success(`Machine float set to $${val.toFixed(2)}`);
    loadDashboard();
  };

  // ── Expenses state ─────────────────────────────────────────────────────────
  const [expenses,  setExpenses]  = useState<Expense[]>([]);
  const [loading,   setLoading]   = useState(true);

  const loadExpenses = useCallback(async () => {
    setLoading(true);
    let query = sb.from("owner_expenses").select("*")
      .eq("owner_id", ownerId).ilike("description", `%[Manager: ${managerName}]%`)
      .order("created_at", { ascending: false });
    if (barSessionStart) query = query.gte("created_at", barSessionStart);
    const { data } = await query;
    setExpenses((data ?? []) as Expense[]);
    setLoading(false);
  }, [ownerId, managerName, barSessionStart]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadExpenses(); }, [loadExpenses]);
  // Reload when bar opens or closes
  useEffect(() => { loadExpenses(); }, [barSessionStart]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const ch = supabase.channel(`mgr-expenses-${profile.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "owner_expenses", filter: `owner_id=eq.${ownerId}` },
        () => loadExpenses()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [ownerId, profile.id, loadExpenses]);

  const totalAllTime = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const sessionExpenses = expenses
    .filter((e) => barSessionStart && new Date(e.created_at) >= new Date(barSessionStart))
    .reduce((s, e) => s + Number(e.amount), 0);

  // ── Add expense form ───────────────────────────────────────────────────────
  const [showForm,   setShowForm]   = useState(false);
  const [lines,      setLines]      = useState<{ description: string; amount: string }[]>([{ description: "", amount: "" }]);
  const [saving,     setSaving]     = useState(false);
  const [confirming, setConfirming] = useState(false);
  const lineTotal = lines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);

  const handleSave = async () => {
    const valid = lines.filter((l) => l.description.trim() && parseFloat(l.amount) > 0);
    if (!valid.length) { toast.error("Add at least one item with a description and amount"); return; }
    const total = valid.reduce((s, l) => s + parseFloat(l.amount), 0);
    if (total > floatBalance) { toast.error(`Insufficient float — balance is $${fmt(floatBalance)}`); return; }
    setSaving(true);
    const today = trinidadDate();
    const description = valid.length === 1
      ? `Non-Stock Expense\n${valid[0].description.trim()} = $${parseFloat(valid[0].amount).toFixed(2)} ${tag}`
      : `Non-Stock Expense\n${valid.map((l) => `${l.description.trim()} = $${parseFloat(l.amount).toFixed(2)}`).join("\n")}\n${tag}`;
    try {
      const { error: expErr } = await sb.from("owner_expenses").insert({ owner_id: ownerId, amount: total, description, expense_date: today });
      if (expErr) { toast.error(expErr.message); return; }
      const newFloat = Math.max(0, floatBalance - total);
      await sb.from("profiles").update({ cashier_float: newFloat }).eq("id", ownerId);
      setFloatBalance(newFloat);
      const note = valid.length === 1 ? `Expense: ${valid[0].description.trim()}` : `Bulk Expense (${valid.length} items)`;
      await sb.from("wallet_transactions").insert({ profile_id: profile.id, amount: total, type: "cashier_expense", note });
      toast.success("Expense saved");
      setLines([{ description: "", amount: "" }]); setShowForm(false); setConfirming(false);
      loadExpenses();
    } finally { setSaving(false); }
  };

  const [editingId,      setEditingId]      = useState<string | null>(null);
  const [editLines,      setEditLines]      = useState<{ description: string; amount: string }[]>([]);
  const [editSaving,     setEditSaving]     = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting,       setDeleting]       = useState(false);
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
    if (diff > 0 && diff > floatBalance) { setEditSaving(false); toast.error(`Insufficient float — balance is $${fmt(floatBalance)}`); return; }
    const description = valid.length === 1
      ? `Non-Stock Expense\n${valid[0].description.trim()} = $${parseFloat(valid[0].amount).toFixed(2)} ${tag}`
      : `Non-Stock Expense\n${valid.map((l) => `${l.description.trim()} = $${parseFloat(l.amount).toFixed(2)}`).join("\n")}\n${tag}`;
    try {
      const { data: updated, error: upErr } = await sb.from("owner_expenses").update({ amount: newTotal, description }).eq("id", e.id).select("id");
      if (upErr) { toast.error(upErr.message); return; }
      if (!updated || updated.length === 0) { toast.error("Could not update expense — permission denied"); return; }
      if (diff !== 0) {
        const newFloat = Math.max(0, floatBalance - diff);
        await sb.from("profiles").update({ cashier_float: newFloat }).eq("id", ownerId);
        setFloatBalance(newFloat);
      }
      toast.success("Expense updated"); setEditingId(null); loadExpenses();
    } finally { setEditSaving(false); }
  };

  const handleDelete = async (e: Expense) => {
    setDeleting(true);
    try {
      const { data: deleted, error: delErr } = await sb.from("owner_expenses").delete().eq("id", e.id).select("id");
      if (delErr) { toast.error(delErr.message); return; }
      if (!deleted || deleted.length === 0) { toast.error("Could not delete expense — permission denied"); return; }
      const newFloat = floatBalance + Number(e.amount);
      await sb.from("profiles").update({ cashier_float: newFloat }).eq("id", ownerId);
      setFloatBalance(newFloat);
      toast.success("Expense deleted and float refunded"); setDeleteConfirmId(null); loadExpenses();
    } finally { setDeleting(false); }
  };

  const sessionTotal = expenses.reduce((s, e) => s + Number(e.amount), 0);

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

      {/* ── Hero 1: Floats ── */}
      <div className="rounded-3xl p-4 space-y-3 relative overflow-hidden"
        style={{ background: "var(--gradient-hero)", boxShadow: "var(--shadow-glow)" }}>
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="relative space-y-1.5">
          <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: "rgba(0,0,0,0.55)" }}>Bar Float</p>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => { setSetFloatInput(String(barFloatSet)); setShowSetBarFloat(true); }}
              className="rounded-2xl p-2.5 flex flex-col items-center justify-center gap-0.5 font-black text-xs transition active:scale-95"
              style={{ background: "oklch(0.18 0.02 60)", border: "1.5px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.85)" }}>
              <span className="text-base">💰</span>
              <span>{barFloatSet > 0 ? "Update" : "Set"} Float</span>
            </button>
            <div className="rounded-2xl p-2.5 flex flex-col gap-0.5 text-center" style={{ background: "oklch(0.18 0.02 60)" }}>
              <div className="text-[9px] font-semibold" style={{ color: "rgba(255,255,255,0.5)" }}>Amount Set</div>
              <div className="font-black text-sm" style={{ color: "#86efac" }}>{barIsOpen ? `$${fmt(barFloatSet)}` : "$0"}</div>
            </div>
            <div className="rounded-2xl p-2.5 flex flex-col gap-0.5 text-center" style={{ background: "oklch(0.18 0.02 60)" }}>
              <div className="text-[9px] font-semibold" style={{ color: "rgba(255,255,255,0.5)" }}>Remaining</div>
              <div className="font-black text-sm" style={{ color: barIsOpen && floatBalance < 10 ? "#fde68a" : "#86efac" }}>{barIsOpen ? `$${fmt(floatBalance)}` : "$0"}</div>
            </div>
          </div>
        </div>
        {hasMachinesEnabled && (
          <div className="relative space-y-1.5">
            <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: "rgba(0,0,0,0.55)" }}>Machine Float</p>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => { setSetFloatInput(String(machineFloatSet)); setShowSetMachFloat(true); }}
                className="rounded-2xl p-2.5 flex flex-col items-center justify-center gap-0.5 font-black text-xs transition active:scale-95"
                style={{ background: "oklch(0.18 0.02 60)", border: "1.5px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.85)" }}>
                <span className="text-base">🎰</span>
                <span>{machineFloatSet > 0 ? "Update" : "Set"} Float</span>
              </button>
              <div className="rounded-2xl p-2.5 flex flex-col gap-0.5 text-center" style={{ background: "oklch(0.18 0.02 60)" }}>
                <div className="text-[9px] font-semibold" style={{ color: "rgba(255,255,255,0.5)" }}>Amount Set</div>
                <div className="font-black text-sm" style={{ color: "#86efac" }}>{machineFloatSet > 0 ? `$${fmt(machineFloatSet)}` : "$0"}</div>
              </div>
              <div className="rounded-2xl p-2.5 flex flex-col gap-0.5 text-center" style={{ background: "oklch(0.18 0.02 60)" }}>
                <div className="text-[9px] font-semibold" style={{ color: "rgba(255,255,255,0.5)" }}>Remaining</div>
                <div className="font-black text-sm" style={{ color: machineFloatSet > 0 && machineFloatBal < 10 ? "#fde68a" : "#86efac" }}>{machineFloatSet > 0 ? `$${fmt(machineFloatBal)}` : "$0"}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Hero 2: Session ── */}
      <div className="rounded-3xl p-4 space-y-3 relative overflow-hidden"
        style={{ background: "oklch(0.18 0.02 60)", border: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="absolute -left-10 -bottom-10 h-40 w-40 rounded-full bg-white/5 blur-2xl" />
        <p className="text-[10px] font-black uppercase tracking-widest relative" style={{ color: "rgba(255,255,255,0.4)" }}>Session</p>
        <div className="relative space-y-1.5">
          <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.3)" }}>Bar</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl p-2.5 flex flex-col gap-0.5 text-center" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="text-[9px] font-semibold" style={{ color: "rgba(255,255,255,0.4)" }}>Cash Sales</div>
              <div className="font-black text-sm" style={{ color: "#86efac" }}>{barIsOpen ? `$${fmt(sessionBarSales)}` : "—"}</div>
            </div>
            <div className="rounded-2xl p-2.5 flex flex-col gap-0.5 text-center" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="text-[9px] font-semibold" style={{ color: "rgba(255,255,255,0.4)" }}>Bar Expenses</div>
              <div className="font-black text-sm" style={{ color: "#fca5a5" }}>{barIsOpen ? `$${fmt(sessionExpenses)}` : "—"}</div>
            </div>
          </div>
        </div>
        {hasMachinesEnabled && (
          <div className="relative space-y-1.5">
            <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.3)" }}>Machines</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-2xl p-2.5 flex flex-col gap-0.5 text-center" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="text-[9px] font-semibold" style={{ color: "rgba(255,255,255,0.4)" }}>Cash in Machine</div>
                <div className="font-black text-sm" style={{ color: "#86efac" }}>{machineFloatAnchor ? `$${fmt(sessionMachineIn)}` : "—"}</div>
              </div>
              <div className="rounded-2xl p-2.5 flex flex-col gap-0.5 text-center" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="text-[9px] font-semibold" style={{ color: "rgba(255,255,255,0.4)" }}>Machines Payout</div>
                <div className="font-black text-sm" style={{ color: "#fca5a5" }}>{machineFloatAnchor ? `$${fmt(sessionMachinePayout)}` : "—"}</div>
              </div>
            </div>
          </div>
        )}
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
                      Deduct ${lineTotal.toFixed(2)} from bar float? (Balance: ${fmt(floatBalance)})
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => setConfirming(false)} className="h-10 rounded-xl font-black text-sm border border-border transition active:scale-95">Back</button>
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

      {/* ── Set Bar Float Modal ── */}
      {showSetBarFloat && (
        <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => { setShowSetBarFloat(false); setSetFloatInput(""); setBarFloatMode("new"); }}>
          <div className="w-full max-w-sm rounded-t-3xl pb-8 pt-4 px-4 space-y-3"
            style={{ background: "oklch(0.13 0.03 60)", border: "1px solid oklch(0.3 0.08 60)" }}
            onClick={e => e.stopPropagation()}>
            <p className="text-center text-xs font-semibold" style={{ color: "oklch(0.65 0.15 65)" }}>
              {barFloatSet > 0 ? "Update Bar Float" : "Set Bar Float"}
            </p>
            {/* Same / New session selector — only when a float is already set */}
            {barFloatSet > 0 && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  {(["same", "new"] as const).map(mode => (
                    <button key={mode} type="button" onClick={() => setBarFloatMode(mode)}
                      className="h-12 rounded-2xl font-black text-sm transition active:scale-95"
                      style={barFloatMode === mode
                        ? { background: "oklch(0.60 0.18 65)", color: "#000" }
                        : { background: "oklch(0.20 0.05 60)", color: "oklch(0.65 0.15 65)", border: "1.5px solid oklch(0.35 0.10 60)" }}>
                      {mode === "same" ? "Same Session" : "New Session"}
                    </button>
                  ))}
                </div>
                <p className="text-center text-[11px]" style={{ color: "oklch(0.55 0.10 65)" }}>
                  {barFloatMode === "same"
                    ? "Adds to current float — used amount unchanged"
                    : "Starts fresh — used amount resets to $0"}
                </p>
              </>
            )}
            {/* Display */}
            <div className="rounded-2xl px-5 py-4 text-right" style={{ background: "oklch(0.18 0.04 60)", border: "1px solid oklch(0.28 0.08 60)" }}>
              <span className="font-black text-4xl" style={{ color: "oklch(0.82 0.18 65)" }}>
                ${setFloatInput === "" ? "0" : setFloatInput}
              </span>
            </div>
            {/* Keys */}
            <div className="grid grid-cols-3 gap-2">
              {["7","8","9","4","5","6","1","2","3"].map(k => (
                <button key={k} onClick={() => setSetFloatInput(v => { const parts = v.split("."); if (parts[1] !== undefined && parts[1].length >= 2) return v; return v + k; })}
                  className="rounded-2xl py-4 text-xl font-black active:scale-95 transition" style={{ background: "oklch(0.20 0.05 60)", color: "#fff" }}>{k}</button>
              ))}
              <button onClick={() => setSetFloatInput(v => v.includes(".") ? v : v + ".")}
                className="rounded-2xl py-4 text-xl font-black active:scale-95 transition" style={{ background: "oklch(0.20 0.05 60)", color: "#fff" }}>.</button>
              <button onClick={() => setSetFloatInput(v => { const parts = v.split("."); if (parts[1] !== undefined && parts[1].length >= 2) return v; return v + "0"; })}
                className="rounded-2xl py-4 text-xl font-black active:scale-95 transition" style={{ background: "oklch(0.20 0.05 60)", color: "#fff" }}>0</button>
              <button onClick={() => setSetFloatInput(v => v.slice(0, -1))}
                className="rounded-2xl py-4 text-xl font-black active:scale-95 transition" style={{ background: "oklch(0.20 0.05 60)", color: "oklch(0.75 0.15 65)" }}>⌫</button>
            </div>
            <button onClick={handleSetBarFloat} disabled={setFloatBusy || !setFloatInput}
              className="w-full py-4 rounded-2xl text-base font-black active:scale-95 transition disabled:opacity-50"
              style={{ background: "oklch(0.60 0.18 65)", color: "#000" }}>
              {setFloatBusy ? "Saving…" : barFloatSet > 0 ? "Update Float" : "Set Float"}
            </button>
          </div>
        </div>
      )}

      {/* ── Set Machine Float Modal ── */}
      {showSetMachFloat && (
        <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => { setShowSetMachFloat(false); setSetFloatInput(""); }}>
          <div className="w-full max-w-sm rounded-t-3xl pb-8 pt-4 px-4 space-y-3"
            style={{ background: "oklch(0.13 0.03 60)", border: "1px solid oklch(0.3 0.08 60)" }}
            onClick={e => e.stopPropagation()}>
            <p className="text-center text-xs font-semibold" style={{ color: "oklch(0.65 0.15 65)" }}>
              {machineFloatSet > 0 ? "Update Machine Float" : "Set Machine Float"}
            </p>
            <div className="rounded-2xl px-5 py-4 text-right" style={{ background: "oklch(0.18 0.04 60)", border: "1px solid oklch(0.28 0.08 60)" }}>
              <span className="font-black text-4xl" style={{ color: "oklch(0.82 0.18 65)" }}>
                ${setFloatInput === "" ? "0" : setFloatInput}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {["7","8","9","4","5","6","1","2","3"].map(k => (
                <button key={k} onClick={() => setSetFloatInput(v => { const parts = v.split("."); if (parts[1] !== undefined && parts[1].length >= 2) return v; return v + k; })}
                  className="rounded-2xl py-4 text-xl font-black active:scale-95 transition" style={{ background: "oklch(0.20 0.05 60)", color: "#fff" }}>{k}</button>
              ))}
              <button onClick={() => setSetFloatInput(v => v.includes(".") ? v : v + ".")}
                className="rounded-2xl py-4 text-xl font-black active:scale-95 transition" style={{ background: "oklch(0.20 0.05 60)", color: "#fff" }}>.</button>
              <button onClick={() => setSetFloatInput(v => { const parts = v.split("."); if (parts[1] !== undefined && parts[1].length >= 2) return v; return v + "0"; })}
                className="rounded-2xl py-4 text-xl font-black active:scale-95 transition" style={{ background: "oklch(0.20 0.05 60)", color: "#fff" }}>0</button>
              <button onClick={() => setSetFloatInput(v => v.slice(0, -1))}
                className="rounded-2xl py-4 text-xl font-black active:scale-95 transition" style={{ background: "oklch(0.20 0.05 60)", color: "oklch(0.75 0.15 65)" }}>⌫</button>
            </div>
            <button onClick={handleSetMachFloat} disabled={setFloatBusy || !setFloatInput}
              className="w-full py-4 rounded-2xl text-base font-black active:scale-95 transition disabled:opacity-50"
              style={{ background: "oklch(0.60 0.18 65)", color: "#000" }}>
              {setFloatBusy ? "Saving…" : machineFloatSet > 0 ? "Update Float" : "Set Float"}
            </button>
          </div>
        </div>
      )}

      {/* Expense History */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-black text-muted-foreground uppercase tracking-widest">Session Expenses</p>
          {expenses.length > 0 && <span className="text-xs font-black text-red-400">${fmt(sessionTotal)}</span>}
        </div>
        {loading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="rounded-xl h-14 bg-muted/30 animate-pulse" />)}</div>
        ) : expenses.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">No expenses this session.</div>
        ) : (
          <div className="rounded-2xl border border-border overflow-hidden divide-y divide-border/40" style={{ background: "var(--gradient-card)" }}>
            {expenses.map((e) => {
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
                        <button onClick={() => { setEditingId(null); setEditLines([]); }} className="h-9 rounded-xl font-black text-xs border border-border transition active:scale-95">Cancel</button>
                        <button onClick={() => handleEditSave(e)} disabled={editSaving}
                          className="h-9 rounded-xl font-black text-xs text-primary-foreground flex items-center justify-center transition active:scale-95 disabled:opacity-50"
                          style={{ background: "var(--gradient-hero)" }}>
                          {editSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
                        </button>
                      </div>
                    </div>
                  ) : deleteConfirmId === e.id ? (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-center text-red-400">Delete ${fmt(Number(e.amount))} expense and refund to float?</p>
                      <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => setDeleteConfirmId(null)} className="h-9 rounded-xl font-black text-xs border border-border transition active:scale-95">Cancel</button>
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

      {/* ── Set Bar Float Modal ── */}
      {showSetBarFloat && (
        <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => { setShowSetBarFloat(false); setSetFloatInput(""); setBarFloatMode("new"); }}>
          <div className="w-full max-w-sm rounded-t-3xl pb-8 pt-4 px-4 space-y-3"
            style={{ background: "oklch(0.13 0.03 60)", border: "1px solid oklch(0.3 0.08 60)" }}
            onClick={e => e.stopPropagation()}>
            <p className="text-center text-xs font-semibold" style={{ color: "oklch(0.65 0.15 65)" }}>
              {barFloatSet > 0 ? "Update Bar Float" : "Set Bar Float"}
            </p>
            {barFloatSet > 0 && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  {(["same", "new"] as const).map(mode => (
                    <button key={mode} type="button" onClick={() => setBarFloatMode(mode)}
                      className="h-12 rounded-2xl font-black text-sm transition active:scale-95"
                      style={barFloatMode === mode
                        ? { background: "oklch(0.60 0.18 65)", color: "#000" }
                        : { background: "oklch(0.20 0.05 60)", color: "oklch(0.65 0.15 65)", border: "1.5px solid oklch(0.35 0.10 60)" }}>
                      {mode === "same" ? "Same Session" : "New Session"}
                    </button>
                  ))}
                </div>
                <p className="text-center text-[11px]" style={{ color: "oklch(0.55 0.10 65)" }}>
                  {barFloatMode === "same"
                    ? "Adds to current float — used amount unchanged"
                    : "Starts fresh — used amount resets to $0"}
                </p>
              </>
            )}
            <div className="rounded-2xl px-5 py-4 text-right" style={{ background: "oklch(0.18 0.04 60)", border: "1px solid oklch(0.28 0.08 60)" }}>
              <span className="font-black text-4xl" style={{ color: "oklch(0.82 0.18 65)" }}>
                ${setFloatInput === "" ? "0" : setFloatInput}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {["7","8","9","4","5","6","1","2","3"].map(k => (
                <button key={k} onClick={() => setSetFloatInput(v => { const parts = v.split("."); if (parts[1] !== undefined && parts[1].length >= 2) return v; return v + k; })}
                  className="rounded-2xl py-4 text-xl font-black active:scale-95 transition" style={{ background: "oklch(0.20 0.05 60)", color: "#fff" }}>{k}</button>
              ))}
              <button onClick={() => setSetFloatInput(v => v.includes(".") ? v : v + ".")}
                className="rounded-2xl py-4 text-xl font-black active:scale-95 transition" style={{ background: "oklch(0.20 0.05 60)", color: "#fff" }}>.</button>
              <button onClick={() => setSetFloatInput(v => { const parts = v.split("."); if (parts[1] !== undefined && parts[1].length >= 2) return v; return v + "0"; })}
                className="rounded-2xl py-4 text-xl font-black active:scale-95 transition" style={{ background: "oklch(0.20 0.05 60)", color: "#fff" }}>0</button>
              <button onClick={() => setSetFloatInput(v => v.slice(0, -1))}
                className="rounded-2xl py-4 text-xl font-black active:scale-95 transition" style={{ background: "oklch(0.20 0.05 60)", color: "oklch(0.75 0.15 65)" }}>⌫</button>
            </div>
            <button onClick={handleSetBarFloat} disabled={setFloatBusy || !setFloatInput}
              className="w-full py-4 rounded-2xl text-base font-black active:scale-95 transition disabled:opacity-50"
              style={{ background: "oklch(0.60 0.18 65)", color: "#000" }}>
              {setFloatBusy ? "Saving…" : barFloatSet > 0 ? "Update Float" : "Set Float"}
            </button>
          </div>
        </div>
      )}

      {/* ── Set Machine Float Modal ── */}
      {showSetMachFloat && (
        <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => { setShowSetMachFloat(false); setSetFloatInput(""); }}>
          <div className="w-full max-w-sm rounded-t-3xl pb-8 pt-4 px-4 space-y-3"
            style={{ background: "oklch(0.13 0.03 60)", border: "1px solid oklch(0.3 0.08 60)" }}
            onClick={e => e.stopPropagation()}>
            <p className="text-center text-xs font-semibold" style={{ color: "oklch(0.65 0.15 65)" }}>
              {machineFloatSet > 0 ? "Update Machine Float" : "Set Machine Float"}
            </p>
            <div className="rounded-2xl px-5 py-4 text-right" style={{ background: "oklch(0.18 0.04 60)", border: "1px solid oklch(0.28 0.08 60)" }}>
              <span className="font-black text-4xl" style={{ color: "oklch(0.82 0.18 65)" }}>
                ${setFloatInput === "" ? "0" : setFloatInput}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {["7","8","9","4","5","6","1","2","3"].map(k => (
                <button key={k} onClick={() => setSetFloatInput(v => { const parts = v.split("."); if (parts[1] !== undefined && parts[1].length >= 2) return v; return v + k; })}
                  className="rounded-2xl py-4 text-xl font-black active:scale-95 transition" style={{ background: "oklch(0.20 0.05 60)", color: "#fff" }}>{k}</button>
              ))}
              <button onClick={() => setSetFloatInput(v => v.includes(".") ? v : v + ".")}
                className="rounded-2xl py-4 text-xl font-black active:scale-95 transition" style={{ background: "oklch(0.20 0.05 60)", color: "#fff" }}>.</button>
              <button onClick={() => setSetFloatInput(v => { const parts = v.split("."); if (parts[1] !== undefined && parts[1].length >= 2) return v; return v + "0"; })}
                className="rounded-2xl py-4 text-xl font-black active:scale-95 transition" style={{ background: "oklch(0.20 0.05 60)", color: "#fff" }}>0</button>
              <button onClick={() => setSetFloatInput(v => v.slice(0, -1))}
                className="rounded-2xl py-4 text-xl font-black active:scale-95 transition" style={{ background: "oklch(0.20 0.05 60)", color: "oklch(0.75 0.15 65)" }}>⌫</button>
            </div>
            <button onClick={handleSetMachFloat} disabled={setFloatBusy || !setFloatInput}
              className="w-full py-4 rounded-2xl text-base font-black active:scale-95 transition disabled:opacity-50"
              style={{ background: "oklch(0.60 0.18 65)", color: "#000" }}>
              {setFloatBusy ? "Saving…" : machineFloatSet > 0 ? "Update Float" : "Set Float"}
            </button>
          </div>
        </div>
      )}

    </div>
  );
}


// ─── Mini calendar ────────────────────────────────────────────────────────────
function MgrCalendar({ workedDates, selectedDate, onSelect }: {
  workedDates: Set<string>; selectedDate: string | null; onSelect: (d: string | null) => void;
}) {
  const today = new Date();
  const [vy, setVy] = useState(today.getFullYear());
  const [vm, setVm] = useState(today.getMonth());
  const firstDay = new Date(vy, vm, 1).getDay();
  const daysInMonth = new Date(vy, vm + 1, 0).getDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  const label = new Date(vy, vm, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const todayStr = today.toLocaleDateString("en-CA", { timeZone: "America/Port_of_Spain" });
  const prev = () => vm === 0 ? (setVm(11), setVy(y => y - 1)) : setVm(m => m - 1);
  const next = () => vm === 11 ? (setVm(0), setVy(y => y + 1)) : setVm(m => m + 1);
  return (
    <div className="rounded-2xl border border-border p-3" style={{ background: "var(--gradient-card)" }}>
      <div className="flex items-center justify-between mb-3">
        <button onClick={prev} className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-muted/40 transition active:scale-90">
          <ChevronDown className="h-4 w-4 rotate-90" />
        </button>
        <span className="font-black text-sm">{label}</span>
        <button onClick={next} className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-muted/40 transition active:scale-90">
          <ChevronDown className="h-4 w-4 -rotate-90" />
        </button>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {["S","M","T","W","T","F","S"].map((d, i) => (
          <div key={i} className="text-center text-[10px] font-black text-muted-foreground py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const ds = `${vy}-${pad(vm + 1)}-${pad(day)}`;
          const worked = workedDates.has(ds);
          const sel = selectedDate === ds;
          const isToday = ds === todayStr;
          return (
            <button key={day} disabled={!worked} onClick={() => onSelect(sel ? null : ds)}
              className="h-9 w-full rounded-xl flex items-center justify-center text-xs font-black transition active:scale-90 disabled:cursor-default"
              style={sel
                ? { background: "var(--gradient-hero)", color: "var(--primary-foreground)" }
                : worked
                ? { background: "rgba(251,146,60,0.12)", border: "1.5px solid rgba(251,146,60,0.4)", color: "var(--primary)" }
                : isToday ? { color: "var(--primary)", opacity: 0.4 }
                : { color: "var(--muted-foreground)", opacity: 0.22 }}>
              {day}
            </button>
          );
        })}
      </div>
      {selectedDate && (
        <button onClick={() => onSelect(null)} className="mt-2 w-full text-[11px] font-black text-muted-foreground hover:text-foreground transition text-center">
          Show all dates ✕
        </button>
      )}
    </div>
  );
}


// ─── Timesheet PDF (manager) ──────────────────────────────────────────────────
async function downloadTimesheetPdf(
  cards: TimeCard[],
  staffName: string | null,
  periodLabel: string,
  businessName: string,
) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const generated = new Date().toLocaleString("en-US", { timeZone: "America/Port_of_Spain", dateStyle: "medium", timeStyle: "short" });
  let y = await drawHeader(doc, businessName, "Timesheet Report", periodLabel, generated);

  // Group by employee then by date
  const byEmp: Record<string, { name: string; cards: TimeCard[] }> = {};
  cards.forEach(tc => {
    if (!byEmp[tc.employee_id]) byEmp[tc.employee_id] = { name: tc.employee_name, cards: [] };
    byEmp[tc.employee_id].cards.push(tc);
  });

  const BRAND = [232, 146, 42] as [number, number, number];

  for (const { name, cards: empCards } of Object.values(byEmp)) {
    // Employee header
    if (y + 10 > CONTENT_BOTTOM) { doc.addPage(); y = 20; }
    doc.setFillColor(232, 146, 42, 0.15);
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
    // Employee total
    const totalH = Math.floor(empTotalMins / 60); const totalM = empTotalMins % 60;
    const totalStr = empTotalMins < 60 ? `${empTotalMins}m` : `${totalH}h ${totalM}m`;
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...BRAND);
    doc.text(`Total: ${totalStr}`, RM, y + 3, { align: "right" });
    y += 9;
  }

  addFootersToAllPages(doc);
  const safeName = (staffName ?? "all-staff").replace(/\s+/g, "-").toLowerCase();
  await downloadPdf(`timesheet-${safeName}-${periodLabel.replace(/\s+/g, "-")}.pdf`, doc.output("datauristring"));
}

// ─── Time Cards Tab ───────────────────────────────────────────────────────────
export function TimeCardsTab({ profile, ownerId, managerName, barIsOpen }: {
  profile: { id: string; username?: string | null; wallet_balance: number };
  ownerId: string; managerName: string; barIsOpen: boolean;
}) {
  const sb = supabase as any;
  const [tcSubTab, setTcSubTab] = useState<"clock" | "timesheets">("clock");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [empLoading, setEmpLoading] = useState(true);

  const loadEmployees = useCallback(async () => {
    setEmpLoading(true);
    const { data: staff } = await sb.from("profiles")
      .select("id, username, role, job_title").eq("parent_id", ownerId)
      .in("role", ["cashier", "manager", "custom"]).order("username", { ascending: true });
    const staffList = (staff ?? []) as Employee[];
    const self: Employee = { id: profile.id, username: managerName, role: "manager" };
    const hasSelf = staffList.some(e => e.id === profile.id);
    setEmployees(hasSelf ? staffList : [self, ...staffList]);
    setEmpLoading(false);
  }, [ownerId, profile.id, managerName]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadEmployees(); }, [loadEmployees]);

  const [timeCards, setTimeCards] = useState<TimeCard[]>([]);
  const [tcLoading, setTcLoading] = useState(true);

  const loadTimeCards = useCallback(async () => {
    setTcLoading(true);
    const { data } = await sb.from("time_cards").select("*").eq("owner_id", ownerId)
      .order("clocked_in_at", { ascending: false });
    setTimeCards((data ?? []) as TimeCard[]);
    setTcLoading(false);
  }, [ownerId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadTimeCards(); }, [loadTimeCards]);
  useEffect(() => {
    const ch = supabase.channel(`mgr-tc-${ownerId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "time_cards", filter: `owner_id=eq.${ownerId}` },
        () => loadTimeCards()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [ownerId, loadTimeCards]);

  // Clock sub-tab state
  const [selectedEmp, setSelectedEmp] = useState<Employee | null>(null);
  const [clockBusy, setClockBusy] = useState(false);
  const [openDate, setOpenDate] = useState<string | null>(null);
  const [openMonth, setOpenMonth] = useState<string | null>(null);
  const [tsSelectedDate, setTsSelectedDate] = useState<string | null>(null);
  const [tsShowCal, setTsShowCal] = useState(false);
  const [tsPeriod, setTsPeriod] = useState<"day" | "week" | "month" | "year">("day");
  const [tsStaffEmp, setTsStaffEmp] = useState<Employee | null>(null);
  const [tsShowStaffPicker, setTsShowStaffPicker] = useState(false);
  const [tsPdfBusy, setTsPdfBusy] = useState(false);
  const openCard = selectedEmp ? timeCards.find(tc => tc.employee_id === selectedEmp.id && !tc.clocked_out_at) ?? null : null;
  const isClockedIn = !!openCard;
  const workedDates = new Set(timeCards.map(tc => tc.work_date));

  const handleClockIn = async () => {
    if (!selectedEmp) return;
    setClockBusy(true);
    const { error } = await sb.from("time_cards").insert({
      owner_id: ownerId, employee_id: selectedEmp.id,
      employee_name: selectedEmp.username, clocked_in_at: new Date().toISOString(), work_date: trinidadDate(),
    });
    setClockBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${selectedEmp.username} clocked in`); loadTimeCards();
  };
  const handleClockOut = async () => {
    if (!openCard) return;
    setClockBusy(true);
    const { error } = await sb.from("time_cards").update({ clocked_out_at: new Date().toISOString() }).eq("id", openCard.id);
    setClockBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${openCard.employee_name} clocked out`); loadTimeCards();
  };
  function roleLabel(emp: Employee) {
    if (emp.role === "manager") return "Manager";
    if (emp.role === "custom" && emp.job_title) return emp.job_title;
    return "Cashier";
  }

  // ── Timesheets filter helpers ──────────────────────────────────────────────
  function getTsFilteredCards(): TimeCard[] {
    const base = (tsStaffEmp ? timeCards.filter(tc => tc.employee_id === tsStaffEmp.id) : timeCards)
      .filter(tc => !!tc.clocked_out_at); // timesheets only shows completed shifts
    if (!tsSelectedDate) return base;
    const ref = new Date(tsSelectedDate + "T12:00:00");
    if (tsPeriod === "day") return base.filter(tc => tc.work_date === tsSelectedDate);
    if (tsPeriod === "week") {
      const dow = ref.getDay();
      const start = new Date(ref); start.setDate(ref.getDate() - dow);
      const end   = new Date(ref); end.setDate(ref.getDate() + (6 - dow));
      const s = start.toLocaleDateString("en-CA"); const e = end.toLocaleDateString("en-CA");
      return base.filter(tc => tc.work_date >= s && tc.work_date <= e);
    }
    if (tsPeriod === "month") { const ym = tsSelectedDate.slice(0, 7); return base.filter(tc => tc.work_date.startsWith(ym)); }
    if (tsPeriod === "year")  { const yr = tsSelectedDate.slice(0, 4); return base.filter(tc => tc.work_date.startsWith(yr)); }
    return base;
  }
  function getTsPeriodLabel(): string {
    if (!tsSelectedDate) return "All Time";
    const ref = new Date(tsSelectedDate + "T12:00:00");
    if (tsPeriod === "day") return ref.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    if (tsPeriod === "week") {
      const dow = ref.getDay();
      const start = new Date(ref); start.setDate(ref.getDate() - dow);
      const end   = new Date(ref); end.setDate(ref.getDate() + (6 - dow));
      return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
    }
    if (tsPeriod === "month") return ref.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    if (tsPeriod === "year")  return String(ref.getFullYear());
    return "All Time";
  }
  const tsFilteredCards = getTsFilteredCards();
  const tsPeriodLabel   = getTsPeriodLabel();
  const tsByDate: Record<string, TimeCard[]> = {};
  tsFilteredCards.forEach(tc => { if (!tsByDate[tc.work_date]) tsByDate[tc.work_date] = []; tsByDate[tc.work_date].push(tc); });
  const tsSortedDates = Object.keys(tsByDate).sort((a, b) => b.localeCompare(a));

  return (
    <div className="space-y-3">
      {/* Clock / Timesheets tabs */}
      <div className="grid grid-cols-2 gap-1.5 rounded-xl p-1" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)" }}>
        {(["clock","timesheets"] as const).map(t => (
          <button key={t} onClick={() => setTcSubTab(t)}
            className="h-9 rounded-lg font-black text-xs flex items-center justify-center gap-1.5 transition active:scale-[0.98]"
            style={tcSubTab === t ? { background: "var(--gradient-hero)", color: "var(--primary-foreground)" } : { color: "var(--muted-foreground)" }}>
            {t === "clock" ? <><Clock className="h-3.5 w-3.5" /> Clock</> : <><CalendarDays className="h-3.5 w-3.5" /> Timesheets</>}
          </button>
        ))}
      </div>

      {/* ══ CLOCK TAB ══════════════════════════════════════════════════════ */}
      {tcSubTab === "clock" && (
        <div className="space-y-3">
          {empLoading
            ? <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="rounded-2xl h-16 bg-muted/30 animate-pulse" />)}</div>
            : employees.length === 0
            ? <div className="text-center py-10 text-muted-foreground text-sm">No staff found.</div>
            : employees.map(emp => {
                const empOpen = timeCards.find(tc => tc.employee_id === emp.id && !tc.clocked_out_at);
                const isSel = selectedEmp?.id === emp.id;
                const isCIn = isSel && isClockedIn;
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
                        {isSel && empOpen && <p className="text-[10px] mt-0.5" style={{ color: "rgba(134,239,172,0.8)" }}>Since {fmtTime(empOpen.clocked_in_at)} · {fmtDuration(empOpen.clocked_in_at, null)} on shift</p>}
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
                        Since {fmtTime(tc.clocked_in_at)} · {fmtDuration(tc.clocked_in_at, null)} on shift
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

      {/* ══ TIMESHEETS TAB ═════════════════════════════════════════════════ */}
      {tcSubTab === "timesheets" && (
        <div className="space-y-3">
          {/* Filter row: date picker + staff picker + PDF button */}
          <div className="flex gap-2 items-center">
            <button onClick={() => setTsShowCal(v => !v)}
              className="flex-1 h-10 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 border transition active:scale-[0.98] truncate"
              style={tsSelectedDate
                ? { background: "var(--gradient-hero)", color: "var(--primary-foreground)", borderColor: "transparent" }
                : { background: "var(--gradient-card)", borderColor: "var(--border)", color: "var(--primary)" }}>
              <CalendarDays className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{tsSelectedDate ? new Date(tsSelectedDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Pick Date"}</span>
            </button>
            <button onClick={() => setTsShowStaffPicker(v => !v)}
              className="h-10 px-3 rounded-xl font-black text-xs flex items-center gap-1.5 border transition active:scale-95 shrink-0"
              style={tsStaffEmp
                ? { background: "var(--gradient-hero)", color: "var(--primary-foreground)", borderColor: "transparent" }
                : { background: "var(--gradient-card)", borderColor: "var(--border)", color: "var(--primary)" }}>
              <Users className="h-3.5 w-3.5" />
              <span className="max-w-[72px] truncate">{tsStaffEmp ? tsStaffEmp.username : "Staff"}</span>
            </button>
            <button
              onClick={async () => {
                if (tsPdfBusy) return;
                setTsPdfBusy(true);
                try { await downloadTimesheetPdf(tsFilteredCards, tsStaffEmp?.username ?? null, tsPeriodLabel, managerName); }
                catch { toast.error("PDF failed"); }
                setTsPdfBusy(false);
              }}
              disabled={tsPdfBusy || tsFilteredCards.length === 0}
              className="h-10 w-10 rounded-xl flex items-center justify-center border transition active:scale-95 disabled:opacity-40 shrink-0"
              style={{ background: "var(--gradient-card)", borderColor: "var(--border)", color: "var(--primary)" }}>
              {tsPdfBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
            </button>
          </div>

          {/* Calendar popup */}
          {tsShowCal && (
            <MgrCalendar workedDates={workedDates} selectedDate={tsSelectedDate}
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

          {/* Week / Month / Year / Day period pickers — only shown when a date is selected */}
          {tsSelectedDate && (
            <div className="flex gap-1.5">
              {(["day","week","month","year"] as const).map(p => (
                <button key={p} onClick={() => setTsPeriod(p)}
                  className="flex-1 h-8 rounded-xl font-black text-[11px] transition active:scale-95 capitalize"
                  style={tsPeriod === p
                    ? { background: "var(--gradient-hero)", color: "var(--primary-foreground)" }
                    : { background: "var(--gradient-card)", border: "1px solid var(--border)", color: "var(--muted-foreground)" }}>
                  {p}
                </button>
              ))}
            </div>
          )}

          {/* Active filter badges */}
          {(tsSelectedDate || tsStaffEmp) && (
            <div className="flex items-center gap-2 flex-wrap">
              {tsSelectedDate && (
                <span className="text-[11px] font-black px-2.5 py-1 rounded-full" style={{ background: "rgba(251,146,60,0.12)", color: "var(--primary)", border: "1px solid rgba(251,146,60,0.3)" }}>
                  {tsPeriodLabel}
                </span>
              )}
              {tsStaffEmp && (
                <span className="text-[11px] font-black px-2.5 py-1 rounded-full" style={{ background: "rgba(134,239,172,0.1)", color: "#86efac", border: "1px solid rgba(134,239,172,0.3)" }}>
                  {tsStaffEmp.username}
                </span>
              )}
              <button onClick={() => { setTsSelectedDate(null); setTsStaffEmp(null); setTsPeriod("day"); setTsShowCal(false); }}
                className="text-[11px] font-black text-muted-foreground hover:text-foreground transition">Clear ✕</button>
            </div>
          )}

          {/* Records — Month accordion → Day rows → Employee entries */}
          {tcLoading
            ? <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="rounded-xl h-14 bg-muted/30 animate-pulse" />)}</div>
            : tsSortedDates.length === 0
            ? <div className="text-center py-12 text-muted-foreground text-sm">No records match these filters.</div>
            : (() => {
                // Group days into months
                const byMonth: Record<string, string[]> = {};
                tsSortedDates.forEach(d => {
                  const mk = d.slice(0, 7);
                  if (!byMonth[mk]) byMonth[mk] = [];
                  byMonth[mk].push(d);
                });
                const sortedMonths = Object.keys(byMonth).sort((a, b) => b.localeCompare(a));
                return sortedMonths.map(mk => {
                  const mDays = byMonth[mk];
                  const mLabel = new Date(mk + "-01T12:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" });
                  const mMins  = mDays.reduce((s, d) => s + tsByDate[d].reduce((ss, tc) => {
                    const out = tc.clocked_out_at ? new Date(tc.clocked_out_at) : new Date();
                    return ss + Math.max(0, Math.round((out.getTime() - new Date(tc.clocked_in_at).getTime()) / 60000));
                  }, 0), 0);
                  const mHM    = mMins < 60 ? `${mMins}m` : `${Math.floor(mMins / 60)}h ${mMins % 60}m`;
                  const mOpen  = openMonth === mk;
                  const mActive = mDays.some(d => tsByDate[d].some(tc => !tc.clocked_out_at));
                  return (
                    <div key={mk} className="rounded-2xl border border-border overflow-hidden" style={{ background: "var(--gradient-card)" }}>
                      {/* Month header */}
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
                      {/* Day rows inside month */}
                      {mOpen && (
                        <div className="border-t border-border/60 divide-y divide-border/30">
                          {mDays.map(d => {
                            const cards  = tsByDate[d];
                            const dOpen  = openDate === d;
                            const dActive = cards.filter(c => !c.clocked_out_at).length;
                            const dl     = new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
                            const dMins  = cards.reduce((s, tc) => {
                              const out = tc.clocked_out_at ? new Date(tc.clocked_out_at) : new Date();
                              return s + Math.max(0, Math.round((out.getTime() - new Date(tc.clocked_in_at).getTime()) / 60000));
                            }, 0);
                            const dHM = dMins < 60 ? `${dMins}m` : `${Math.floor(dMins / 60)}h ${dMins % 60}m`;
                            return (
                              <div key={d}>
                                <button type="button" onClick={() => setOpenDate(dOpen ? null : d)}
                                  className="w-full flex items-center justify-between px-4 py-2.5 transition hover:bg-muted/20 pl-6">
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
                                    {cards.map(tc => (
                                      <div key={tc.id} className="px-4 py-3 pl-7 flex items-center gap-3">
                                        <div className="h-8 w-8 rounded-full flex items-center justify-center shrink-0 font-black text-xs" style={{ background: "rgba(255,255,255,0.06)" }}>
                                          {tc.employee_name.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <p className="font-black text-sm truncate">{tc.employee_name}</p>
                                          <div className="flex items-center gap-1.5 text-xs mt-0.5 flex-wrap">
                                            <LogIn className="h-3 w-3 text-green-400 shrink-0" />
                                            <span className="text-green-400 font-bold">{fmtTime(tc.clocked_in_at)}</span>
                                            {tc.clocked_out_at
                                              ? <><span className="text-muted-foreground/40">→</span><LogOut className="h-3 w-3 text-red-400 shrink-0" /><span className="text-red-400 font-bold">{fmtTime(tc.clocked_out_at)}</span><span className="text-muted-foreground ml-1">· {fmtDuration(tc.clocked_in_at, tc.clocked_out_at)}</span></>
                                              : <span className="text-green-400 font-semibold">· Still on shift</span>}
                                          </div>
                                        </div>
                                        {!tc.clocked_out_at && <span className="text-[10px] font-black px-2 py-0.5 rounded-full shrink-0" style={{ background: "rgba(134,239,172,0.15)", color: "#86efac", border: "1px solid rgba(134,239,172,0.35)" }}>Active</span>}
                                      </div>
                                    ))}
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
