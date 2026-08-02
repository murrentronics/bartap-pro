import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useChain } from "@/lib/ChainContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, TrendingDown, X, BarChart3, Pencil, Trash2, AlertTriangle } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

export const Route = createFileRoute("/_app/manager")({
  component: ManagerPage,
});

// ── Types ─────────────────────────────────────────────────────────────────────
type Expense = {
  id: string;
  amount: number;
  description: string | null;
  expense_date: string;
  created_at: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────
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

// ── Main Page ─────────────────────────────────────────────────────────────────
function ManagerPage() {
  const { profile } = useAuth();
  const { effectiveOwnerId } = useChain();
  const { t } = useTranslation();

  if (!profile || (profile.role !== "manager" && (profile as any).job_title !== "manager")) {
    return (
      <div className="text-center text-muted-foreground py-20">
        {t("manager_only", "Manager access only.")}
      </div>
    );
  }

  const ownerId = effectiveOwnerId((profile as any).parent_id ?? profile.id);
  return <ManagerExpenses profile={profile} ownerId={ownerId} />;
}

// ── Manager Expenses ──────────────────────────────────────────────────────────
function ManagerExpenses({
  profile,
  ownerId,
}: {
  profile: { id: string; username?: string | null; wallet_balance: number };
  ownerId: string;
}) {
  const managerName = profile.username ?? profile.id;
  const tag = `[Manager: ${managerName}]`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const { t } = useTranslation();

  // ── Bar open/closed state ─────────────────────────────────────────────────
  const [barSessionStart, setBarSessionStart] = useState<string | null>(null);
  const [barClosedAt, setBarClosedAt] = useState<string | null>(null);
  const [barStateLoading, setBarStateLoading] = useState(true);
  const barIsOpen = !!barSessionStart && !barClosedAt;

  useEffect(() => {
    if (!ownerId) return;
    setBarStateLoading(true);
    sb.from("profiles")
      .select("bar_session_start, bar_closed_at")
      .eq("id", ownerId)
      .single()
      .then(({ data }: { data: { bar_session_start: string | null; bar_closed_at: string | null } | null }) => {
        setBarSessionStart(data?.bar_session_start ?? null);
        setBarClosedAt(data?.bar_closed_at ?? null);
        setBarStateLoading(false);
      });
    const ch = supabase
      .channel(`manager-bar-state-${ownerId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${ownerId}` },
        (payload: any) => {
          const rec = payload.new as Record<string, unknown>;
          if ("bar_session_start" in rec) setBarSessionStart((rec.bar_session_start as string | null) ?? null);
          if ("bar_closed_at" in rec) setBarClosedAt((rec.bar_closed_at as string | null) ?? null);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [ownerId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Float state (cashier_float set by owner for this session) ─────────────
  const [floatSet, setFloatSet] = useState<number | null>(null);
  const [floatSetAt, setFloatSetAt] = useState<string | null>(null);
  const [floatUsed, setFloatUsed] = useState<number>(0);

  const loadFloat = useCallback(async () => {
    // Read the float the owner set on the profile row
    const { data: ownerData } = await sb.from("profiles")
      .select("cashier_float, cashier_float_set_at")
      .eq("id", ownerId)
      .single();
    const famt = Number(ownerData?.cashier_float ?? 0);
    const since: string | null = ownerData?.cashier_float_set_at ?? null;
    setFloatSet(famt > 0 ? famt : null);
    setFloatSetAt(since);

    // Sum up cashier_expense transactions logged since the last float reset
    let q = sb.from("wallet_transactions")
      .select("amount")
      .eq("profile_id", profile.id)
      .eq("type", "cashier_expense");
    if (since) q = q.gte("created_at", since);
    const { data: expTxs } = await q;
    const used = (expTxs ?? []).reduce((s: number, tx: { amount: number }) => s + Number(tx.amount), 0);
    setFloatUsed(used);
  }, [ownerId, profile.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadFloat(); }, [loadFloat]);

  // Realtime — refresh float when owner changes it
  useEffect(() => {
    const ch = supabase
      .channel(`manager-float-${profile.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${ownerId}` }, () => loadFloat())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "wallet_transactions", filter: `profile_id=eq.${profile.id}` }, () => loadFloat())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [ownerId, profile.id, loadFloat]);

  const floatRemaining = floatSet !== null ? Math.max(0, floatSet - floatUsed) : null;

  // ── Expense list ──────────────────────────────────────────────────────────
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [openMonth, setOpenMonth] = useState<string | null>(null);

  const loadExpenses = useCallback(async () => {
    setLoading(true);
    const { data } = await sb
      .from("owner_expenses")
      .select("*")
      .eq("owner_id", ownerId)
      .ilike("description", `%[Manager: ${managerName}]%`)
      .order("created_at", { ascending: false });
    setExpenses((data ?? []) as Expense[]);
    setLoading(false);
  }, [ownerId, managerName]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadExpenses(); }, [loadExpenses]);

  useEffect(() => {
    const ch = supabase
      .channel(`manager-expenses-${profile.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "owner_expenses", filter: `owner_id=eq.${ownerId}` },
        () => loadExpenses()
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [ownerId, profile.id, loadExpenses]);

  // ── Financial summary cards ───────────────────────────────────────────────
  // Total: all time expenses tagged with this manager
  // Today: expenses since bar_session_start (same anchor as wallet Today)
  // Session: expenses since bar_session_start (same window — bar session = today for managers)
  const totalAllTime = expenses.reduce((s, e) => s + Number(e.amount), 0);

  const todayExpenses = expenses
    .filter((e) => barSessionStart && new Date(e.created_at) >= new Date(barSessionStart))
    .reduce((s, e) => s + Number(e.amount), 0);

  const sessionExpenses = todayExpenses; // session = bar open period = today anchor

  // ── Add Expense form ──────────────────────────────────────────────────────
  const [showForm, setShowForm] = useState(false);
  const [lines, setLines] = useState<{ description: string; amount: string }[]>([
    { description: "", amount: "" },
  ]);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const lineTotal = lines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
  const addLine = () => setLines((l) => [...l, { description: "", amount: "" }]);
  const removeLine = (i: number) => setLines((l) => l.filter((_, idx) => idx !== i));
  const updateLine = (i: number, field: "description" | "amount", val: string) =>
    setLines((l) => l.map((line, idx) => (idx === i ? { ...line, [field]: val } : line)));

  const handleSave = async () => {
    const valid = lines.filter((l) => l.description.trim() && parseFloat(l.amount) > 0);
    if (!valid.length) { toast.error("Add at least one item with a description and amount"); return; }
    setSaving(true);
    const total = valid.reduce((s, l) => s + parseFloat(l.amount), 0);
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Port_of_Spain" });
    const description =
      valid.length === 1
        ? `Non-Stock Expense\n${valid[0].description.trim()} = $${parseFloat(valid[0].amount).toFixed(2)} ${tag}`
        : `Non-Stock Expense\n${valid.map((l) => `${l.description.trim()} = $${parseFloat(l.amount).toFixed(2)}`).join("\n")}\n${tag}`;

    try {
      const { error: expErr } = await sb.from("owner_expenses").insert({
        owner_id: ownerId,
        amount: total,
        description,
        expense_date: today,
      });
      if (expErr) { toast.error(expErr.message); return; }

      const { data: ownerRow } = await sb.from("profiles").select("wallet_balance").eq("id", ownerId).single();
      const newBal = Number(ownerRow?.wallet_balance ?? 0) - total;
      await sb.from("profiles").update({ wallet_balance: newBal }).eq("id", ownerId);

      const expenseNote = valid.length === 1 ? `Expense: ${valid[0].description.trim()}` : `Bulk Expense (${valid.length} items)`;

      // 1. Record on the manager's own cashier wallet (tracks against float)
      await sb.from("wallet_transactions").insert({
        profile_id: profile.id,
        amount: total,
        type: "cashier_expense",
        note: expenseNote + ` ${tag}`,
      });

      // 2. Record on the owner's wallet so it appears in their Wallet expense history
      await sb.from("wallet_transactions").insert({
        profile_id: ownerId,
        amount: total,
        type: "cashier_expense",
        note: expenseNote + ` ${tag}`,
      });

      toast.success("Expense saved");
      setLines([{ description: "", amount: "" }]);
      setShowForm(false);
      setConfirming(false);
      loadExpenses();
      loadFloat();
    } finally {
      setSaving(false);
    }
  };

  // ── Edit / Delete — last entry only, blocked when bar is closed ───────────
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLines, setEditLines] = useState<{ description: string; amount: string }[]>([]);
  const [editSaving, setEditSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const lastExpenseId = expenses.length > 0 ? expenses[0].id : null;

  const startEdit = (e: Expense) => {
    // Parse description lines back into editable lines
    const raw = (e.description ?? "").replace(tag, "").trim();
    const parsed = raw
      .split("\n")
      .filter((l) => l && l !== "Non-Stock Expense")
      .map((l) => {
        const match = l.match(/^(.+?)\s*=\s*\$?([\d.]+)$/);
        if (match) return { description: match[1].trim(), amount: match[2] };
        return { description: l.trim(), amount: String(e.amount) };
      });
    setEditLines(parsed.length > 0 ? parsed : [{ description: "", amount: String(e.amount) }]);
    setEditingId(e.id);
  };

  const cancelEdit = () => { setEditingId(null); setEditLines([]); };

  const handleEditSave = async (e: Expense) => {
    const valid = editLines.filter((l) => l.description.trim() && parseFloat(l.amount) > 0);
    if (!valid.length) { toast.error("Add at least one item with description and amount"); return; }
    setEditSaving(true);
    const newTotal = valid.reduce((s, l) => s + parseFloat(l.amount), 0);
    const oldTotal = Number(e.amount);
    const diff = newTotal - oldTotal; // positive = more spent

    const description =
      valid.length === 1
        ? `Non-Stock Expense\n${valid[0].description.trim()} = $${parseFloat(valid[0].amount).toFixed(2)} ${tag}`
        : `Non-Stock Expense\n${valid.map((l) => `${l.description.trim()} = $${parseFloat(l.amount).toFixed(2)}`).join("\n")}\n${tag}`;

    try {
      const { error: upErr } = await sb.from("owner_expenses")
        .update({ amount: newTotal, description })
        .eq("id", e.id);
      if (upErr) { toast.error(upErr.message); return; }

      // Adjust owner wallet by the difference
      if (diff !== 0) {
        const { data: ownerRow } = await sb.from("profiles").select("wallet_balance").eq("id", ownerId).single();
        const newBal = Number(ownerRow?.wallet_balance ?? 0) - diff;
        await sb.from("profiles").update({ wallet_balance: newBal }).eq("id", ownerId);
      }

      toast.success("Expense updated");
      setEditingId(null);
      loadExpenses();
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async (e: Expense) => {
    setDeleting(true);
    try {
      const { error: delErr } = await sb.from("owner_expenses").delete().eq("id", e.id);
      if (delErr) { toast.error(delErr.message); return; }

      // Refund amount back to owner wallet
      const { data: ownerRow } = await sb.from("profiles").select("wallet_balance").eq("id", ownerId).single();
      const newBal = Number(ownerRow?.wallet_balance ?? 0) + Number(e.amount);
      await sb.from("profiles").update({ wallet_balance: newBal }).eq("id", ownerId);

      toast.success("Expense deleted and wallet refunded");
      setDeleteConfirmId(null);
      loadExpenses();
    } finally {
      setDeleting(false);
    }
  };

  // ── Group by month ────────────────────────────────────────────────────────
  const byMonth: Record<string, Expense[]> = {};
  expenses.forEach((e) => {
    const k = monthKey(e.expense_date);
    if (!byMonth[k]) byMonth[k] = [];
    byMonth[k].push(e);
  });
  const months = Object.keys(byMonth).sort((a, b) => b.localeCompare(a));

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="py-3 space-y-4 pb-24">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-2xl flex items-center justify-center shrink-0"
          style={{ background: "var(--gradient-hero)" }}>
          <BarChart3 className="h-5 w-5 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-xl font-black leading-tight">{t("bar_expense", "Bar Expense")}</h1>
          <p className="text-xs text-muted-foreground">{managerName}</p>
        </div>
      </div>

      {/* Bar closed banner */}
      {!barStateLoading && !barIsOpen && (
        <div className="rounded-2xl px-4 py-3 flex items-center gap-3"
          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}>
          <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
          <span className="text-sm font-semibold text-red-400">
            {t("bar_closed_msg", "Bar is closed — expenses cannot be added, edited, or deleted.")}
          </span>
        </div>
      )}

      {/* Float row cards — Float Set / Used / Remaining */}
      {floatSet !== null && (
        <div className="rounded-3xl px-4 py-3 relative overflow-hidden"
          style={{ background: "var(--gradient-hero)", boxShadow: "var(--shadow-glow)" }}>
          <div className="absolute -right-8 -bottom-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
          <div className="relative">
            <p className="text-[10px] font-black mb-2" style={{ color: "rgba(0,0,0,0.55)" }}>{t("float_lbl", "FLOAT")}</p>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-2xl px-2 py-2.5 flex flex-col gap-0.5 text-center"
                style={{ background: "oklch(0.18 0.04 60)" }}>
                <div className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.45)" }}>{t("set_lbl", "Set")}</div>
                <div className="font-black text-sm" style={{ color: "#fbbf24" }}>${fmt(floatSet)}</div>
                {floatSetAt && (
                  <div className="text-[8px] leading-tight" style={{ color: "rgba(255,255,255,0.3)" }}>
                    {new Date(floatSetAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true })}
                  </div>
                )}
              </div>
              <div className="rounded-2xl px-2 py-2.5 flex flex-col gap-0.5 text-center"
                style={{ background: "oklch(0.18 0.04 60)" }}>
                <div className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.45)" }}>{t("used_lbl", "Used")}</div>
                <div className="font-black text-sm" style={{ color: floatUsed > 0 ? "#fca5a5" : "rgba(255,255,255,0.3)" }}>
                  {floatUsed > 0 ? `$${fmt(floatUsed)}` : "—"}
                </div>
              </div>
              <div className="rounded-2xl px-2 py-2.5 flex flex-col gap-0.5 text-center"
                style={{ background: "oklch(0.18 0.04 60)" }}>
                <div className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.45)" }}>{t("remaining_lbl2", "Remaining")}</div>
                <div className="font-black text-sm" style={{
                  color: floatRemaining !== null && floatRemaining > 0 ? "#86efac" : "#fca5a5"
                }}>
                  {floatRemaining !== null ? `$${fmt(floatRemaining)}` : "—"}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Financial summary cards */}
      <div className="rounded-3xl p-4 space-y-3 relative overflow-hidden"
        style={{ background: "var(--gradient-hero)", boxShadow: "var(--shadow-glow)" }}>
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <p className="text-xs font-black relative" style={{ color: "rgba(0,0,0,0.65)" }}>{t("my_expense_summary", "My Expense Summary")}</p>
        <div className="grid grid-cols-3 gap-2 relative">
          <div className="rounded-2xl p-2.5 flex flex-col gap-0.5 text-center"
            style={{ background: "oklch(0.18 0.02 60)" }}>
            <div className="text-[9px] font-semibold leading-tight" style={{ color: "rgba(255,255,255,0.5)" }}>{t("session_expense", "Session")}{"\n"}{t("total_expense", "Expense")}</div>
            <div className="font-black text-xs" style={{ color: barIsOpen ? "#fca5a5" : "rgba(255,255,255,0.3)" }}>
              {barIsOpen ? `$${fmt(sessionExpenses)}` : "—"}
            </div>
          </div>
          <div className="rounded-2xl p-2.5 flex flex-col gap-0.5 text-center"
            style={{ background: "oklch(0.18 0.02 60)" }}>
            <div className="text-[9px] font-semibold leading-tight" style={{ color: "rgba(255,255,255,0.5)" }}>{t("todays_expense", "Today's")}{"\n"}{t("total_expense", "Expense")}</div>
            <div className="font-black text-xs" style={{ color: "#fca5a5" }}>
              {barIsOpen ? `$${fmt(todayExpenses)}` : "—"}
            </div>
          </div>
          <div className="rounded-2xl p-2.5 flex flex-col gap-0.5 text-center"
            style={{ background: "oklch(0.18 0.02 60)" }}>
            <div className="text-[9px] font-semibold leading-tight" style={{ color: "rgba(255,255,255,0.5)" }}>{t("total_expense", "Total")}{"\n"}{t("total_expense", "Expense")}</div>
            <div className="font-black text-xs" style={{ color: totalAllTime > 0 ? "#fca5a5" : "rgba(255,255,255,0.3)" }}>
              {totalAllTime > 0 ? `$${fmt(totalAllTime)}` : "$0.00"}
            </div>
          </div>
        </div>
      </div>

      {/* ── Add Expense — only when bar is open ─────────────────────────── */}
      {barIsOpen && (
        <div className="space-y-2">
          <button
            onClick={() => { setShowForm((v) => !v); setConfirming(false); }}
            className="w-full h-11 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition active:scale-[0.98] border"
            style={showForm
              ? { background: "var(--gradient-hero)", color: "var(--primary-foreground)", borderColor: "transparent" }
              : { background: "var(--gradient-card)", borderColor: "var(--border)", color: "var(--primary)" }
            }
          >
            {showForm ? t("cancel_add", "✕ Cancel") : t("add_expense_btn", "+ Add Expense")}
          </button>

          {showForm && (
            <div className="rounded-2xl border border-border p-4 space-y-3"
              style={{ background: "var(--gradient-card)" }}>
              <p className="text-xs font-black text-muted-foreground uppercase tracking-widest">{t("expense_lines", "Expense Lines")}</p>

              {lines.map((line, i) => (
                <div key={i} className="space-y-1.5">
                  <input
                    value={line.description}
                    onChange={(e) => updateLine(i, "description", e.target.value)}
                    placeholder={t("description_ph", "Description (e.g. Supplies)")}
                    className="w-full h-10 rounded-xl border border-border bg-muted px-3 text-sm font-bold outline-none focus:ring-1 focus:ring-primary"
                  />
                  <div className="flex gap-2 items-center">
                    <input
                      value={line.amount}
                      onChange={(e) => updateLine(i, "amount", e.target.value)}
                      placeholder="$0.00"
                      type="number" min="0" step="0.01"
                      className="flex-1 h-10 rounded-xl border border-border bg-muted px-3 text-sm font-bold outline-none focus:ring-1 focus:ring-primary"
                    />
                    {lines.length > 1 && (
                      <button onClick={() => removeLine(i)}
                        className="h-10 w-10 rounded-xl flex items-center justify-center bg-destructive/15 text-destructive active:scale-90 transition shrink-0">
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}

              <button onClick={addLine}
                className="w-full h-9 rounded-xl border border-dashed border-border text-xs font-black text-muted-foreground hover:text-foreground transition active:scale-[0.98]">
                {t("add_line", "+ Add Line")}
              </button>

              <div className="pt-1 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground font-semibold">
                    Total: <span className="font-black text-foreground">${lineTotal.toFixed(2)}</span>
                  </span>
                </div>
                {!confirming ? (
                  <button onClick={() => setConfirming(true)} disabled={lineTotal <= 0}
                    className="w-full h-10 rounded-xl font-black text-sm text-primary-foreground flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-40"
                    style={{ background: "var(--gradient-hero)" }}>
                    {t("save_expense", "Save Expense")}
                  </button>
                ) : (
                  <div className="space-y-2">
                    <div className="rounded-xl px-3 py-2 text-xs text-center font-semibold"
                      style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171" }}>
                      {t("deduct_confirm", "Deduct")} ${lineTotal.toFixed(2)} {t("deduct_from_wallet", "from owner wallet?")}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => setConfirming(false)}
                        className="h-10 rounded-xl font-black text-sm border border-border transition active:scale-95">
                        {t("back", "Back")}
                      </button>
                      <button onClick={handleSave} disabled={saving}
                        className="h-10 rounded-xl font-black text-sm text-primary-foreground flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-50"
                        style={{ background: "#dc2626" }}>
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t("confirm", "Confirm")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Expense History ───────────────────────────────────────────────── */}
      <div className="space-y-2">
        <p className="text-xs font-black text-muted-foreground uppercase tracking-widest">{t("my_expenses", "My Expenses")}</p>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-xl h-14 bg-muted/30 animate-pulse" />
            ))}
          </div>
        ) : months.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">{t("no_expenses_yet", "No expenses logged yet.")}</div>
        ) : (
          months.map((mk) => {
            const monthExpenses = byMonth[mk];
            const monthTotal = monthExpenses.reduce((s, e) => s + Number(e.amount), 0);
            const isOpen = openMonth === mk;
            return (
              <div key={mk} className="rounded-2xl border border-border overflow-hidden"
                style={{ background: "var(--gradient-card)" }}>
                {/* Month header */}
                <button type="button" onClick={() => setOpenMonth(isOpen ? null : mk)}
                  className="w-full flex items-center justify-between px-4 py-3 transition hover:bg-muted/20">
                  <div className="text-left">
                    <p className="font-black text-sm">{monthLabel(mk)}</p>
                    <p className="text-xs text-muted-foreground">{monthExpenses.length} {monthExpenses.length !== 1 ? t("expense_count_n", "expenses") : t("expense_count_1", "expense")}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-black text-sm text-red-400">${fmt(monthTotal)}</span>
                    <span className="text-muted-foreground transition-transform"
                      style={{ display: "inline-block", transform: isOpen ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-border divide-y divide-border/40">
                    {monthExpenses.map((e) => {
                      const isLast = e.id === lastExpenseId;
                      const canEdit = isLast && barIsOpen;
                      const raw = (e.description ?? "").replace(tag, "").trim();
                      const descLines = raw.split("\n")
                        .filter((l) => l && l !== "Non-Stock Expense")
                        .map((l) => l.trim());
                      const isEditing = editingId === e.id;

                      return (
                        <div key={e.id} className="px-4 py-3 space-y-2">
                          {isEditing ? (
                            /* ── Inline edit form ── */
                            <div className="space-y-2">
                              <p className="text-xs font-black text-muted-foreground uppercase tracking-widest">{t("edit_expense", "Edit Expense")}</p>
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
                                {t("add_line", "+ Add Line")}
                              </button>
                              <div className="grid grid-cols-2 gap-2 pt-1">
                                <button onClick={cancelEdit}
                                  className="h-9 rounded-xl font-black text-xs border border-border transition active:scale-95">
                                  {t("cancel", "Cancel")}
                                </button>
                                <button onClick={() => handleEditSave(e)} disabled={editSaving}
                                  className="h-9 rounded-xl font-black text-xs text-primary-foreground flex items-center justify-center transition active:scale-95 disabled:opacity-50"
                                  style={{ background: "var(--gradient-hero)" }}>
                                  {editSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("save", "Save")}
                                </button>
                              </div>
                            </div>
                          ) : deleteConfirmId === e.id ? (
                            /* ── Delete confirm ── */
                            <div className="space-y-2">
                              <p className="text-xs font-semibold text-center text-red-400">
                                {t("deduct_confirm", "Delete")} ${fmt(Number(e.amount))} {t("deduct_from_wallet", "expense and refund to wallet?")}
                              </p>
                              <div className="grid grid-cols-2 gap-2">
                                <button onClick={() => setDeleteConfirmId(null)}
                                  className="h-9 rounded-xl font-black text-xs border border-border transition active:scale-95">
                                  {t("cancel", "Cancel")}
                                </button>
                                <button onClick={() => handleDelete(e)} disabled={deleting}
                                  className="h-9 rounded-xl font-black text-xs text-white flex items-center justify-center transition active:scale-95 disabled:opacity-50"
                                  style={{ background: "#dc2626" }}>
                                  {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("delete", "Delete")}
                                </button>
                              </div>
                            </div>
                          ) : (
                            /* ── Normal row ── */
                            <div className="flex items-start gap-3">
                              <div className="h-8 w-8 rounded-full flex items-center justify-center shrink-0 border"
                                style={{ background: "rgba(239,68,68,0.10)", borderColor: "rgba(239,68,68,0.25)" }}>
                                <TrendingDown className="h-3.5 w-3.5 text-red-400" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-muted-foreground">
                                  {new Date(e.created_at).toLocaleString("en-GB", {
                                    hour: "2-digit", minute: "2-digit", hour12: true,
                                    day: "numeric", month: "short", year: "numeric",
                                  })}
                                </p>
                                {descLines.map((l, i) => (
                                  <p key={i} className="text-sm font-semibold leading-snug mt-0.5 break-words">{l}</p>
                                ))}
                              </div>
                              <div className="flex flex-col items-end gap-1 shrink-0">
                                <span className="font-black text-sm text-red-400">${fmt(Number(e.amount))}</span>
                                {/* Edit/delete only for last entry, only when bar is open */}
                                {canEdit && (
                                  <div className="flex gap-1 mt-0.5">
                                    <button onClick={() => startEdit(e)}
                                      className="h-7 w-7 rounded-lg flex items-center justify-center transition active:scale-90"
                                      style={{ background: "rgba(255,255,255,0.08)" }}
                                      title="Edit">
                                      <Pencil className="h-3 w-3 text-muted-foreground" />
                                    </button>
                                    <button onClick={() => setDeleteConfirmId(e.id)}
                                      className="h-7 w-7 rounded-lg flex items-center justify-center transition active:scale-90"
                                      style={{ background: "rgba(239,68,68,0.12)" }}
                                      title="Delete">
                                      <Trash2 className="h-3 w-3 text-red-400" />
                                    </button>
                                  </div>
                                )}
                                {isLast && !barIsOpen && (
                                  <span className="text-[9px] text-muted-foreground/50 mt-0.5">{t("bar_closed_label", "Bar closed")}</span>
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
