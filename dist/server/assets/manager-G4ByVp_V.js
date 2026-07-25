import { W as jsxRuntimeExports, r as reactExports } from "./server-ql_THtAa.js";
import { g as createLucideIcon, b as useAuth, h as useChain, s as supabase, X, i as LoaderCircle, t as toast } from "./router-ChpB8xKS.js";
import { C as ChartColumn } from "./chart-column-Dp54bipr.js";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
const __iconNode = [
  ["path", { d: "M16 17h6v-6", key: "t6n2it" }],
  ["path", { d: "m22 17-8.5-8.5-5 5L2 7", key: "x473p" }]
];
const TrendingDown = createLucideIcon("trending-down", __iconNode);
function fmt(n) {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}
function monthKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(key) {
  const [y, m] = key.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "long"
  });
}
function ManagerPage() {
  const {
    profile
  } = useAuth();
  const {
    effectiveOwnerId
  } = useChain();
  if (!profile || profile.role !== "manager") {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-center text-muted-foreground py-20", children: "Manager access only." });
  }
  const ownerId = effectiveOwnerId(profile.parent_id ?? profile.id);
  return /* @__PURE__ */ jsxRuntimeExports.jsx(ManagerExpenses, { profile, ownerId });
}
function ManagerExpenses({
  profile,
  ownerId
}) {
  const managerName = profile.username ?? profile.id;
  const tag = `[Manager: ${managerName}]`;
  const [expenses, setExpenses] = reactExports.useState([]);
  const [loading, setLoading] = reactExports.useState(true);
  const [openMonth, setOpenMonth] = reactExports.useState(null);
  const [showForm, setShowForm] = reactExports.useState(false);
  const [lines, setLines] = reactExports.useState([{
    description: "",
    amount: ""
  }]);
  const [saving, setSaving] = reactExports.useState(false);
  const [confirming, setConfirming] = reactExports.useState(false);
  const lineTotal = lines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
  const addLine = () => setLines((l) => [...l, {
    description: "",
    amount: ""
  }]);
  const removeLine = (i) => setLines((l) => l.filter((_, idx) => idx !== i));
  const updateLine = (i, field, val) => setLines((l) => l.map((line, idx) => idx === i ? {
    ...line,
    [field]: val
  } : line));
  const sb = supabase;
  const loadExpenses = reactExports.useCallback(async () => {
    setLoading(true);
    const {
      data
    } = await sb.from("owner_expenses").select("*").eq("owner_id", ownerId).ilike("description", `%[Manager: ${managerName}]%`).order("created_at", {
      ascending: false
    });
    setExpenses(data ?? []);
    setLoading(false);
  }, [ownerId, managerName]);
  reactExports.useEffect(() => {
    loadExpenses();
  }, [loadExpenses]);
  reactExports.useEffect(() => {
    const ch = supabase.channel(`manager-expenses-${profile.id}`).on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "owner_expenses",
      filter: `owner_id=eq.${ownerId}`
    }, () => loadExpenses()).subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [ownerId, profile.id, loadExpenses]);
  const handleSave = async () => {
    const valid = lines.filter((l) => l.description.trim() && parseFloat(l.amount) > 0);
    if (!valid.length) {
      toast.error("Add at least one item with a description and amount");
      return;
    }
    setSaving(true);
    const total = valid.reduce((s, l) => s + parseFloat(l.amount), 0);
    const today = (/* @__PURE__ */ new Date()).toLocaleDateString("en-CA", {
      timeZone: "America/Port_of_Spain"
    });
    const description = valid.length === 1 ? `Non-Stock Expense
${valid[0].description.trim()} = $${parseFloat(valid[0].amount).toFixed(2)} ${tag}` : `Non-Stock Expense
${valid.map((l) => `${l.description.trim()} = $${parseFloat(l.amount).toFixed(2)}`).join("\n")}
${tag}`;
    try {
      const {
        error: expErr
      } = await sb.from("owner_expenses").insert({
        owner_id: ownerId,
        amount: total,
        description,
        expense_date: today
      });
      if (expErr) {
        toast.error(expErr.message);
        return;
      }
      const {
        data: ownerRow
      } = await sb.from("profiles").select("wallet_balance").eq("id", ownerId).single();
      const newBal = Number(ownerRow?.wallet_balance ?? 0) - total;
      await sb.from("profiles").update({
        wallet_balance: newBal
      }).eq("id", ownerId);
      const expenseNote = valid.length === 1 ? `Expense: ${valid[0].description.trim()}` : `Bulk Expense (${valid.length} items)`;
      await sb.from("wallet_transactions").insert({
        profile_id: profile.id,
        amount: total,
        type: "cashier_expense",
        note: expenseNote
      });
      toast.success("Expense saved");
      setLines([{
        description: "",
        amount: ""
      }]);
      setShowForm(false);
      setConfirming(false);
      loadExpenses();
    } finally {
      setSaving(false);
    }
  };
  const byMonth = {};
  expenses.forEach((e) => {
    const k = monthKey(e.expense_date);
    if (!byMonth[k]) byMonth[k] = [];
    byMonth[k].push(e);
  });
  const months = Object.keys(byMonth).sort((a, b) => b.localeCompare(a));
  const totalAllTime = expenses.reduce((s, e) => s + Number(e.amount), 0);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "py-3 space-y-4 pb-24", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-10 w-10 rounded-2xl flex items-center justify-center shrink-0", style: {
        background: "var(--gradient-hero)"
      }, children: /* @__PURE__ */ jsxRuntimeExports.jsx(ChartColumn, { className: "h-5 w-5 text-primary-foreground" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-xl font-black leading-tight", children: "Manager" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-muted-foreground", children: managerName })
      ] })
    ] }),
    totalAllTime > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-2xl px-4 py-3 flex items-center justify-between", style: {
      background: "rgba(239,68,68,0.08)",
      border: "1px solid rgba(239,68,68,0.25)"
    }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm font-black text-muted-foreground", children: "Total expenses logged" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-lg font-black text-red-400", children: [
        "$",
        fmt(totalAllTime)
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => {
        setShowForm((v) => !v);
        setConfirming(false);
      }, className: "w-full h-11 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition active:scale-[0.98] border", style: showForm ? {
        background: "var(--gradient-hero)",
        color: "var(--primary-foreground)",
        borderColor: "transparent"
      } : {
        background: "var(--gradient-card)",
        borderColor: "var(--border)",
        color: "var(--primary)"
      }, children: showForm ? "✕ Cancel" : "+ Add Expense" }),
      showForm && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-2xl border border-border p-4 space-y-3", style: {
        background: "var(--gradient-card)"
      }, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-black text-muted-foreground uppercase tracking-widest", children: "Expense Lines" }),
        lines.map((line, i) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("input", { value: line.description, onChange: (e) => updateLine(i, "description", e.target.value), placeholder: "Description (e.g. Supplies)", className: "w-full h-10 rounded-xl border border-border bg-muted px-3 text-sm font-bold outline-none focus:ring-1 focus:ring-primary" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-2 items-center", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("input", { value: line.amount, onChange: (e) => updateLine(i, "amount", e.target.value), placeholder: "$0.00", type: "number", min: "0", step: "0.01", className: "flex-1 h-10 rounded-xl border border-border bg-muted px-3 text-sm font-bold outline-none focus:ring-1 focus:ring-primary" }),
            lines.length > 1 && /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => removeLine(i), className: "h-10 w-10 rounded-xl flex items-center justify-center bg-destructive/15 text-destructive active:scale-90 transition shrink-0", children: /* @__PURE__ */ jsxRuntimeExports.jsx(X, { className: "h-4 w-4" }) })
          ] })
        ] }, i)),
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: addLine, className: "w-full h-9 rounded-xl border border-dashed border-border text-xs font-black text-muted-foreground hover:text-foreground transition active:scale-[0.98]", children: "+ Add Line" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "pt-1 space-y-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-between", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs text-muted-foreground font-semibold", children: [
            "Total:",
            " ",
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "font-black text-foreground", children: [
              "$",
              lineTotal.toFixed(2)
            ] })
          ] }) }),
          !confirming ? /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => setConfirming(true), disabled: lineTotal <= 0, className: "w-full h-10 rounded-xl font-black text-sm text-primary-foreground flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-40", style: {
            background: "var(--gradient-hero)"
          }, children: "Save Expense" }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-xl px-3 py-2 text-xs text-center font-semibold", style: {
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.25)",
              color: "#f87171"
            }, children: [
              "Deduct $",
              lineTotal.toFixed(2),
              " from owner wallet?"
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => setConfirming(false), className: "h-10 rounded-xl font-black text-sm border border-border transition active:scale-95", children: "Back" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: handleSave, disabled: saving, className: "h-10 rounded-xl font-black text-sm text-primary-foreground flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-50", style: {
                background: "#dc2626"
              }, children: saving ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-4 w-4 animate-spin" }) : "Confirm" })
            ] })
          ] })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-black text-muted-foreground uppercase tracking-widest", children: "My Expenses" }),
      loading ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-2", children: Array.from({
        length: 3
      }).map((_, i) => /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rounded-xl h-14 bg-muted/30 animate-pulse" }, i)) }) : months.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-center py-10 text-muted-foreground text-sm", children: "No expenses logged yet." }) : months.map((mk) => {
        const monthExpenses = byMonth[mk];
        const monthTotal = monthExpenses.reduce((s, e) => s + Number(e.amount), 0);
        const isOpen = openMonth === mk;
        return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-2xl border border-border overflow-hidden", style: {
          background: "var(--gradient-card)"
        }, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { type: "button", onClick: () => setOpenMonth(isOpen ? null : mk), className: "w-full flex items-center justify-between px-4 py-3 transition hover:bg-muted/20", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-left", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "font-black text-sm", children: monthLabel(mk) }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-xs text-muted-foreground", children: [
                monthExpenses.length,
                " expense",
                monthExpenses.length !== 1 ? "s" : ""
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "font-black text-sm text-red-400", children: [
                "$",
                fmt(monthTotal)
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-muted-foreground transition-transform", style: {
                display: "inline-block",
                transform: isOpen ? "rotate(90deg)" : "rotate(0deg)"
              }, children: "▶" })
            ] })
          ] }),
          isOpen && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "border-t border-border divide-y divide-border/40", children: monthExpenses.map((e) => {
            const raw = (e.description ?? "").replace(tag, "").trim();
            const descLines = raw.split("\n").filter((l) => l && l !== "Non-Stock Expense").map((l) => l.trim());
            return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "px-4 py-3 flex items-start gap-3", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-8 w-8 rounded-full flex items-center justify-center shrink-0 border", style: {
                background: "rgba(239,68,68,0.10)",
                borderColor: "rgba(239,68,68,0.25)"
              }, children: /* @__PURE__ */ jsxRuntimeExports.jsx(TrendingDown, { className: "h-3.5 w-3.5 text-red-400" }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 min-w-0", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-muted-foreground", children: new Date(e.created_at).toLocaleString("en-GB", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: true,
                  day: "numeric",
                  month: "short",
                  year: "numeric"
                }) }),
                descLines.map((l, i) => /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm font-semibold leading-snug mt-0.5 break-words", children: l }, i))
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "font-black text-sm text-red-400 shrink-0 mt-0.5", children: [
                "$",
                fmt(Number(e.amount))
              ] })
            ] }, e.id);
          }) })
        ] }, mk);
      })
    ] })
  ] });
}
export {
  ManagerPage as component
};
