import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useChain } from "@/lib/ChainContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, TrendingDown, X, BarChart3 } from "lucide-react";

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

  if (!profile || profile.role !== "manager") {
    return (
      <div className="text-center text-muted-foreground py-20">
        Manager access only.
      </div>
    );
  }

  const ownerId = effectiveOwnerId(profile.parent_id ?? profile.id);

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

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [openMonth, setOpenMonth] = useState<string | null>(null);

  // ── Add Expense form state ────────────────────────────────────────────────
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

  // ── Load expenses ─────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;

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

  useEffect(() => {
    loadExpenses();
  }, [loadExpenses]);

  // Realtime
  useEffect(() => {
    const ch = supabase
      .channel(`manager-expenses-${profile.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "owner_expenses",
          filter: `owner_id=eq.${ownerId}`,
        },
        () => loadExpenses()
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [ownerId, profile.id, loadExpenses]);

  // ── Save expense ──────────────────────────────────────────────────────────
  const handleSave = async () => {
    const valid = lines.filter(
      (l) => l.description.trim() && parseFloat(l.amount) > 0
    );
    if (!valid.length) {
      toast.error("Add at least one item with a description and amount");
      return;
    }
    setSaving(true);
    const total = valid.reduce((s, l) => s + parseFloat(l.amount), 0);
    const today = new Date().toLocaleDateString("en-CA", {
      timeZone: "America/Port_of_Spain",
    });

    // Description format: same as cashier but tagged [Manager: name]
    const description =
      valid.length === 1
        ? `Non-Stock Expense\n${valid[0].description.trim()} = $${parseFloat(valid[0].amount).toFixed(2)} ${tag}`
        : `Non-Stock Expense\n${valid
            .map((l) => `${l.description.trim()} = $${parseFloat(l.amount).toFixed(2)}`)
            .join("\n")}\n${tag}`;

    try {
      // 1. Insert into owner_expenses (RLS: manager can insert where owner_id = parent_id)
      const { error: expErr } = await sb.from("owner_expenses").insert({
        owner_id: ownerId,
        amount: total,
        description,
        expense_date: today,
      });
      if (expErr) { toast.error(expErr.message); return; }

      // 2. Deduct from owner wallet balance
      const { data: ownerRow } = await sb
        .from("profiles")
        .select("wallet_balance")
        .eq("id", ownerId)
        .single();
      const newBal = Number(ownerRow?.wallet_balance ?? 0) - total;
      await sb.from("profiles").update({ wallet_balance: newBal }).eq("id", ownerId);

      // 3. Record wallet_transaction on manager's own profile for audit trail
      const expenseNote =
        valid.length === 1
          ? `Expense: ${valid[0].description.trim()}`
          : `Bulk Expense (${valid.length} items)`;
      await sb.from("wallet_transactions").insert({
        profile_id: profile.id,
        amount: total,
        type: "cashier_expense",
        note: expenseNote,
      });

      toast.success("Expense saved");
      setLines([{ description: "", amount: "" }]);
      setShowForm(false);
      setConfirming(false);
      loadExpenses();
    } finally {
      setSaving(false);
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
  const totalAllTime = expenses.reduce((s, e) => s + Number(e.amount), 0);

  return (
    <div className="py-3 space-y-4 pb-24">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <div
          className="h-10 w-10 rounded-2xl flex items-center justify-center shrink-0"
          style={{ background: "var(--gradient-hero)" }}
        >
          <BarChart3 className="h-5 w-5 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-xl font-black leading-tight">Manager</h1>
          <p className="text-xs text-muted-foreground">{managerName}</p>
        </div>
      </div>

      {/* Summary card */}
      {totalAllTime > 0 && (
        <div
          className="rounded-2xl px-4 py-3 flex items-center justify-between"
          style={{
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.25)",
          }}
        >
          <span className="text-sm font-black text-muted-foreground">
            Total expenses logged
          </span>
          <span className="text-lg font-black text-red-400">
            ${fmt(totalAllTime)}
          </span>
        </div>
      )}

      {/* ── Add Expense ────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <button
          onClick={() => { setShowForm((v) => !v); setConfirming(false); }}
          className="w-full h-11 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition active:scale-[0.98] border"
          style={
            showForm
              ? {
                  background: "var(--gradient-hero)",
                  color: "var(--primary-foreground)",
                  borderColor: "transparent",
                }
              : {
                  background: "var(--gradient-card)",
                  borderColor: "var(--border)",
                  color: "var(--primary)",
                }
          }
        >
          {showForm ? "✕ Cancel" : "+ Add Expense"}
        </button>

        {showForm && (
          <div
            className="rounded-2xl border border-border p-4 space-y-3"
            style={{ background: "var(--gradient-card)" }}
          >
            <p className="text-xs font-black text-muted-foreground uppercase tracking-widest">
              Expense Lines
            </p>

            {lines.map((line, i) => (
              <div key={i} className="space-y-1.5">
                <input
                  value={line.description}
                  onChange={(e) => updateLine(i, "description", e.target.value)}
                  placeholder="Description (e.g. Supplies)"
                  className="w-full h-10 rounded-xl border border-border bg-muted px-3 text-sm font-bold outline-none focus:ring-1 focus:ring-primary"
                />
                <div className="flex gap-2 items-center">
                  <input
                    value={line.amount}
                    onChange={(e) => updateLine(i, "amount", e.target.value)}
                    placeholder="$0.00"
                    type="number"
                    min="0"
                    step="0.01"
                    className="flex-1 h-10 rounded-xl border border-border bg-muted px-3 text-sm font-bold outline-none focus:ring-1 focus:ring-primary"
                  />
                  {lines.length > 1 && (
                    <button
                      onClick={() => removeLine(i)}
                      className="h-10 w-10 rounded-xl flex items-center justify-center bg-destructive/15 text-destructive active:scale-90 transition shrink-0"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}

            <button
              onClick={addLine}
              className="w-full h-9 rounded-xl border border-dashed border-border text-xs font-black text-muted-foreground hover:text-foreground transition active:scale-[0.98]"
            >
              + Add Line
            </button>

            <div className="pt-1 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground font-semibold">
                  Total:{" "}
                  <span className="font-black text-foreground">
                    ${lineTotal.toFixed(2)}
                  </span>
                </span>
              </div>

              {!confirming ? (
                <button
                  onClick={() => setConfirming(true)}
                  disabled={lineTotal <= 0}
                  className="w-full h-10 rounded-xl font-black text-sm text-primary-foreground flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-40"
                  style={{ background: "var(--gradient-hero)" }}
                >
                  Save Expense
                </button>
              ) : (
                <div className="space-y-2">
                  <div
                    className="rounded-xl px-3 py-2 text-xs text-center font-semibold"
                    style={{
                      background: "rgba(239,68,68,0.08)",
                      border: "1px solid rgba(239,68,68,0.25)",
                      color: "#f87171",
                    }}
                  >
                    Deduct ${lineTotal.toFixed(2)} from owner wallet?
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setConfirming(false)}
                      className="h-10 rounded-xl font-black text-sm border border-border transition active:scale-95"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="h-10 rounded-xl font-black text-sm text-primary-foreground flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-50"
                      style={{ background: "#dc2626" }}
                    >
                      {saving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Confirm"
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Expense History ───────────────────────────────────────────────── */}
      <div className="space-y-2">
        <p className="text-xs font-black text-muted-foreground uppercase tracking-widest">
          My Expenses
        </p>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-xl h-14 bg-muted/30 animate-pulse" />
            ))}
          </div>
        ) : months.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">
            No expenses logged yet.
          </div>
        ) : (
          months.map((mk) => {
            const monthExpenses = byMonth[mk];
            const monthTotal = monthExpenses.reduce(
              (s, e) => s + Number(e.amount),
              0
            );
            const isOpen = openMonth === mk;
            return (
              <div
                key={mk}
                className="rounded-2xl border border-border overflow-hidden"
                style={{ background: "var(--gradient-card)" }}
              >
                {/* Month header — tap to expand */}
                <button
                  type="button"
                  onClick={() => setOpenMonth(isOpen ? null : mk)}
                  className="w-full flex items-center justify-between px-4 py-3 transition hover:bg-muted/20"
                >
                  <div className="text-left">
                    <p className="font-black text-sm">{monthLabel(mk)}</p>
                    <p className="text-xs text-muted-foreground">
                      {monthExpenses.length} expense
                      {monthExpenses.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-black text-sm text-red-400">
                      ${fmt(monthTotal)}
                    </span>
                    <span
                      className="text-muted-foreground transition-transform"
                      style={{
                        display: "inline-block",
                        transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
                      }}
                    >
                      ▶
                    </span>
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-border divide-y divide-border/40">
                    {monthExpenses.map((e) => {
                      // Parse the description lines — strip the [Manager: …] tag for display
                      const raw = (e.description ?? "").replace(tag, "").trim();
                      const descLines = raw
                        .split("\n")
                        .filter((l) => l && l !== "Non-Stock Expense")
                        .map((l) => l.trim());

                      return (
                        <div key={e.id} className="px-4 py-3 flex items-start gap-3">
                          <div
                            className="h-8 w-8 rounded-full flex items-center justify-center shrink-0 border"
                            style={{
                              background: "rgba(239,68,68,0.10)",
                              borderColor: "rgba(239,68,68,0.25)",
                            }}
                          >
                            <TrendingDown className="h-3.5 w-3.5 text-red-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-muted-foreground">
                              {new Date(e.created_at).toLocaleString("en-GB", {
                                hour: "2-digit",
                                minute: "2-digit",
                                hour12: true,
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })}
                            </p>
                            {descLines.map((l, i) => (
                              <p
                                key={i}
                                className="text-sm font-semibold leading-snug mt-0.5 break-words"
                              >
                                {l}
                              </p>
                            ))}
                          </div>
                          <span className="font-black text-sm text-red-400 shrink-0 mt-0.5">
                            ${fmt(Number(e.amount))}
                          </span>
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
