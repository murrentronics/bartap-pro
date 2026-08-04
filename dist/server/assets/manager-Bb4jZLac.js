import { W as jsxRuntimeExports, r as reactExports } from "./server-DwZtvdF3.js";
import { m as createLucideIcon, i as useAuth, n as useChain, r as useTranslation, s as supabase, T as TriangleAlert, X, o as LoaderCircle, v as Pencil, w as Trash2, t as toast } from "./router-CerKS5nD.js";
import { T as TrendingDown } from "./trending-down-hUEhDHaI.js";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
const __iconNode = [
  ["path", { d: "M3 3v16a2 2 0 0 0 2 2h16", key: "c24i48" }],
  ["path", { d: "M18 17V9", key: "2bz60n" }],
  ["path", { d: "M13 17V5", key: "1frdt8" }],
  ["path", { d: "M8 17v-3", key: "17ska0" }]
];
const ChartColumn = createLucideIcon("chart-column", __iconNode);
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
  const {
    t
  } = useTranslation();
  if (!profile || profile.role !== "manager" && profile.job_title !== "manager") {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-center text-muted-foreground py-20", children: t("manager_only", "Manager access only.") });
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
  const sb = supabase;
  const {
    t
  } = useTranslation();
  const [barSessionStart, setBarSessionStart] = reactExports.useState(null);
  const [barClosedAt, setBarClosedAt] = reactExports.useState(null);
  const [barStateLoading, setBarStateLoading] = reactExports.useState(true);
  const barIsOpen = !!barSessionStart && !barClosedAt;
  reactExports.useEffect(() => {
    if (!ownerId) return;
    setBarStateLoading(true);
    sb.from("profiles").select("bar_session_start, bar_closed_at").eq("id", ownerId).single().then(({
      data
    }) => {
      setBarSessionStart(data?.bar_session_start ?? null);
      setBarClosedAt(data?.bar_closed_at ?? null);
      setBarStateLoading(false);
    });
    const ch = supabase.channel(`manager-bar-state-${ownerId}`).on("postgres_changes", {
      event: "UPDATE",
      schema: "public",
      table: "profiles",
      filter: `id=eq.${ownerId}`
    }, (payload) => {
      const rec = payload.new;
      if ("bar_session_start" in rec) setBarSessionStart(rec.bar_session_start ?? null);
      if ("bar_closed_at" in rec) setBarClosedAt(rec.bar_closed_at ?? null);
    }).subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [ownerId]);
  const [floatSet, setFloatSet] = reactExports.useState(null);
  const [floatSetAt, setFloatSetAt] = reactExports.useState(null);
  const [floatUsed, setFloatUsed] = reactExports.useState(0);
  const loadFloat = reactExports.useCallback(async () => {
    const {
      data: ownerData
    } = await sb.from("profiles").select("cashier_float, cashier_float_set_at").eq("id", ownerId).single();
    const famt = Number(ownerData?.cashier_float ?? 0);
    const since = ownerData?.cashier_float_set_at ?? null;
    setFloatSet(famt > 0 ? famt : null);
    setFloatSetAt(since);
    let q = sb.from("wallet_transactions").select("amount").eq("profile_id", profile.id).eq("type", "cashier_expense");
    if (since) q = q.gte("created_at", since);
    const {
      data: expTxs
    } = await q;
    const used = (expTxs ?? []).reduce((s, tx) => s + Number(tx.amount), 0);
    setFloatUsed(used);
  }, [ownerId, profile.id]);
  reactExports.useEffect(() => {
    loadFloat();
  }, [loadFloat]);
  reactExports.useEffect(() => {
    const ch = supabase.channel(`manager-float-${profile.id}`).on("postgres_changes", {
      event: "UPDATE",
      schema: "public",
      table: "profiles",
      filter: `id=eq.${ownerId}`
    }, () => loadFloat()).on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "wallet_transactions",
      filter: `profile_id=eq.${profile.id}`
    }, () => loadFloat()).subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [ownerId, profile.id, loadFloat]);
  const floatRemaining = floatSet !== null ? Math.max(0, floatSet - floatUsed) : null;
  const [expenses, setExpenses] = reactExports.useState([]);
  const [loading, setLoading] = reactExports.useState(true);
  const [openMonth, setOpenMonth] = reactExports.useState(null);
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
  const totalAllTime = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const todayExpenses = expenses.filter((e) => barSessionStart && new Date(e.created_at) >= new Date(barSessionStart)).reduce((s, e) => s + Number(e.amount), 0);
  const sessionExpenses = todayExpenses;
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
        note: expenseNote + ` ${tag}`
      });
      await sb.from("wallet_transactions").insert({
        profile_id: ownerId,
        amount: total,
        type: "cashier_expense",
        note: expenseNote + ` ${tag}`
      });
      toast.success("Expense saved");
      setLines([{
        description: "",
        amount: ""
      }]);
      setShowForm(false);
      setConfirming(false);
      loadExpenses();
      loadFloat();
    } finally {
      setSaving(false);
    }
  };
  const [editingId, setEditingId] = reactExports.useState(null);
  const [editLines, setEditLines] = reactExports.useState([]);
  const [editSaving, setEditSaving] = reactExports.useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = reactExports.useState(null);
  const [deleting, setDeleting] = reactExports.useState(false);
  const lastExpenseId = expenses.length > 0 ? expenses[0].id : null;
  const startEdit = (e) => {
    const raw = (e.description ?? "").replace(tag, "").trim();
    const parsed = raw.split("\n").filter((l) => l && l !== "Non-Stock Expense").map((l) => {
      const match = l.match(/^(.+?)\s*=\s*\$?([\d.]+)$/);
      if (match) return {
        description: match[1].trim(),
        amount: match[2]
      };
      return {
        description: l.trim(),
        amount: String(e.amount)
      };
    });
    setEditLines(parsed.length > 0 ? parsed : [{
      description: "",
      amount: String(e.amount)
    }]);
    setEditingId(e.id);
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditLines([]);
  };
  const handleEditSave = async (e) => {
    const valid = editLines.filter((l) => l.description.trim() && parseFloat(l.amount) > 0);
    if (!valid.length) {
      toast.error("Add at least one item with description and amount");
      return;
    }
    setEditSaving(true);
    const newTotal = valid.reduce((s, l) => s + parseFloat(l.amount), 0);
    const oldTotal = Number(e.amount);
    const diff = newTotal - oldTotal;
    const description = valid.length === 1 ? `Non-Stock Expense
${valid[0].description.trim()} = $${parseFloat(valid[0].amount).toFixed(2)} ${tag}` : `Non-Stock Expense
${valid.map((l) => `${l.description.trim()} = $${parseFloat(l.amount).toFixed(2)}`).join("\n")}
${tag}`;
    try {
      const {
        error: upErr
      } = await sb.from("owner_expenses").update({
        amount: newTotal,
        description
      }).eq("id", e.id);
      if (upErr) {
        toast.error(upErr.message);
        return;
      }
      if (diff !== 0) {
        const {
          data: ownerRow
        } = await sb.from("profiles").select("wallet_balance").eq("id", ownerId).single();
        const newBal = Number(ownerRow?.wallet_balance ?? 0) - diff;
        await sb.from("profiles").update({
          wallet_balance: newBal
        }).eq("id", ownerId);
      }
      toast.success("Expense updated");
      setEditingId(null);
      loadExpenses();
    } finally {
      setEditSaving(false);
    }
  };
  const handleDelete = async (e) => {
    setDeleting(true);
    try {
      const {
        error: delErr
      } = await sb.from("owner_expenses").delete().eq("id", e.id);
      if (delErr) {
        toast.error(delErr.message);
        return;
      }
      const {
        data: ownerRow
      } = await sb.from("profiles").select("wallet_balance").eq("id", ownerId).single();
      const newBal = Number(ownerRow?.wallet_balance ?? 0) + Number(e.amount);
      await sb.from("profiles").update({
        wallet_balance: newBal
      }).eq("id", ownerId);
      toast.success("Expense deleted and wallet refunded");
      setDeleteConfirmId(null);
      loadExpenses();
    } finally {
      setDeleting(false);
    }
  };
  const byMonth = {};
  expenses.forEach((e) => {
    const k = monthKey(e.expense_date);
    if (!byMonth[k]) byMonth[k] = [];
    byMonth[k].push(e);
  });
  const months = Object.keys(byMonth).sort((a, b) => b.localeCompare(a));
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "py-3 space-y-4 pb-24", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-10 w-10 rounded-2xl flex items-center justify-center shrink-0", style: {
        background: "var(--gradient-hero)"
      }, children: /* @__PURE__ */ jsxRuntimeExports.jsx(ChartColumn, { className: "h-5 w-5 text-primary-foreground" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-xl font-black leading-tight", children: t("bar_expense", "Bar Expense") }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-muted-foreground", children: managerName })
      ] })
    ] }),
    !barStateLoading && !barIsOpen && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-2xl px-4 py-3 flex items-center gap-3", style: {
      background: "rgba(239,68,68,0.08)",
      border: "1px solid rgba(239,68,68,0.25)"
    }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "h-4 w-4 text-red-400 shrink-0" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm font-semibold text-red-400", children: t("bar_closed_msg", "Bar is closed — expenses cannot be added, edited, or deleted.") })
    ] }),
    floatSet !== null && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-3xl px-4 py-3 relative overflow-hidden", style: {
      background: "var(--gradient-hero)",
      boxShadow: "var(--shadow-glow)"
    }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "absolute -right-8 -bottom-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[10px] font-black mb-2", style: {
          color: "rgba(0,0,0,0.55)"
        }, children: t("float_lbl", "FLOAT") }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-3 gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-2xl px-2 py-2.5 flex flex-col gap-0.5 text-center", style: {
            background: "oklch(0.18 0.04 60)"
          }, children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[9px] font-semibold uppercase tracking-wider", style: {
              color: "rgba(255,255,255,0.45)"
            }, children: t("set_lbl", "Set") }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "font-black text-sm", style: {
              color: "#fbbf24"
            }, children: [
              "$",
              fmt(floatSet)
            ] }),
            floatSetAt && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[8px] leading-tight", style: {
              color: "rgba(255,255,255,0.3)"
            }, children: new Date(floatSetAt).toLocaleTimeString("en-GB", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: true
            }) })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-2xl px-2 py-2.5 flex flex-col gap-0.5 text-center", style: {
            background: "oklch(0.18 0.04 60)"
          }, children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[9px] font-semibold uppercase tracking-wider", style: {
              color: "rgba(255,255,255,0.45)"
            }, children: t("used_lbl", "Used") }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "font-black text-sm", style: {
              color: floatUsed > 0 ? "#fca5a5" : "rgba(255,255,255,0.3)"
            }, children: floatUsed > 0 ? `$${fmt(floatUsed)}` : "—" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-2xl px-2 py-2.5 flex flex-col gap-0.5 text-center", style: {
            background: "oklch(0.18 0.04 60)"
          }, children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[9px] font-semibold uppercase tracking-wider", style: {
              color: "rgba(255,255,255,0.45)"
            }, children: t("remaining_lbl2", "Remaining") }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "font-black text-sm", style: {
              color: floatRemaining !== null && floatRemaining > 0 ? "#86efac" : "#fca5a5"
            }, children: floatRemaining !== null ? `$${fmt(floatRemaining)}` : "—" })
          ] })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-3xl p-4 space-y-3 relative overflow-hidden", style: {
      background: "var(--gradient-hero)",
      boxShadow: "var(--shadow-glow)"
    }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-black relative", style: {
        color: "rgba(0,0,0,0.65)"
      }, children: t("my_expense_summary", "My Expense Summary") }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-3 gap-2 relative", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-2xl p-2.5 flex flex-col gap-0.5 text-center", style: {
          background: "oklch(0.18 0.02 60)"
        }, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-[9px] font-semibold leading-tight", style: {
            color: "rgba(255,255,255,0.5)"
          }, children: [
            t("session_expense", "Session"),
            "\n",
            t("total_expense", "Expense")
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "font-black text-xs", style: {
            color: barIsOpen ? "#fca5a5" : "rgba(255,255,255,0.3)"
          }, children: barIsOpen ? `$${fmt(sessionExpenses)}` : "—" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-2xl p-2.5 flex flex-col gap-0.5 text-center", style: {
          background: "oklch(0.18 0.02 60)"
        }, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-[9px] font-semibold leading-tight", style: {
            color: "rgba(255,255,255,0.5)"
          }, children: [
            t("todays_expense", "Today's"),
            "\n",
            t("total_expense", "Expense")
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "font-black text-xs", style: {
            color: "#fca5a5"
          }, children: barIsOpen ? `$${fmt(todayExpenses)}` : "—" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-2xl p-2.5 flex flex-col gap-0.5 text-center", style: {
          background: "oklch(0.18 0.02 60)"
        }, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-[9px] font-semibold leading-tight", style: {
            color: "rgba(255,255,255,0.5)"
          }, children: [
            t("total_expense", "Total"),
            "\n",
            t("total_expense", "Expense")
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "font-black text-xs", style: {
            color: totalAllTime > 0 ? "#fca5a5" : "rgba(255,255,255,0.3)"
          }, children: totalAllTime > 0 ? `$${fmt(totalAllTime)}` : "$0.00" })
        ] })
      ] })
    ] }),
    barIsOpen && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
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
      }, children: showForm ? t("cancel_add", "✕ Cancel") : t("add_expense_btn", "+ Add Expense") }),
      showForm && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-2xl border border-border p-4 space-y-3", style: {
        background: "var(--gradient-card)"
      }, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-black text-muted-foreground uppercase tracking-widest", children: t("expense_lines", "Expense Lines") }),
        lines.map((line, i) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("input", { value: line.description, onChange: (e) => updateLine(i, "description", e.target.value), placeholder: t("description_ph", "Description (e.g. Supplies)"), className: "w-full h-10 rounded-xl border border-border bg-muted px-3 text-sm font-bold outline-none focus:ring-1 focus:ring-primary" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-2 items-center", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("input", { value: line.amount, onChange: (e) => updateLine(i, "amount", e.target.value), placeholder: "$0.00", type: "number", min: "0", step: "0.01", className: "flex-1 h-10 rounded-xl border border-border bg-muted px-3 text-sm font-bold outline-none focus:ring-1 focus:ring-primary" }),
            lines.length > 1 && /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => removeLine(i), className: "h-10 w-10 rounded-xl flex items-center justify-center bg-destructive/15 text-destructive active:scale-90 transition shrink-0", children: /* @__PURE__ */ jsxRuntimeExports.jsx(X, { className: "h-4 w-4" }) })
          ] })
        ] }, i)),
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: addLine, className: "w-full h-9 rounded-xl border border-dashed border-border text-xs font-black text-muted-foreground hover:text-foreground transition active:scale-[0.98]", children: t("add_line", "+ Add Line") }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "pt-1 space-y-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-between", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs text-muted-foreground font-semibold", children: [
            "Total: ",
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "font-black text-foreground", children: [
              "$",
              lineTotal.toFixed(2)
            ] })
          ] }) }),
          !confirming ? /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => setConfirming(true), disabled: lineTotal <= 0, className: "w-full h-10 rounded-xl font-black text-sm text-primary-foreground flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-40", style: {
            background: "var(--gradient-hero)"
          }, children: t("save_expense", "Save Expense") }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-xl px-3 py-2 text-xs text-center font-semibold", style: {
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.25)",
              color: "#f87171"
            }, children: [
              t("deduct_confirm", "Deduct"),
              " $",
              lineTotal.toFixed(2),
              " ",
              t("deduct_from_wallet", "from owner wallet?")
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => setConfirming(false), className: "h-10 rounded-xl font-black text-sm border border-border transition active:scale-95", children: t("back", "Back") }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: handleSave, disabled: saving, className: "h-10 rounded-xl font-black text-sm text-primary-foreground flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-50", style: {
                background: "#dc2626"
              }, children: saving ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-4 w-4 animate-spin" }) : t("confirm", "Confirm") })
            ] })
          ] })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-black text-muted-foreground uppercase tracking-widest", children: t("my_expenses", "My Expenses") }),
      loading ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-2", children: Array.from({
        length: 3
      }).map((_, i) => /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rounded-xl h-14 bg-muted/30 animate-pulse" }, i)) }) : months.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-center py-10 text-muted-foreground text-sm", children: t("no_expenses_yet", "No expenses logged yet.") }) : months.map((mk) => {
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
                " ",
                monthExpenses.length !== 1 ? t("expense_count_n", "expenses") : t("expense_count_1", "expense")
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
            const isLast = e.id === lastExpenseId;
            const canEdit = isLast && barIsOpen;
            const raw = (e.description ?? "").replace(tag, "").trim();
            const descLines = raw.split("\n").filter((l) => l && l !== "Non-Stock Expense").map((l) => l.trim());
            const isEditing = editingId === e.id;
            return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "px-4 py-3 space-y-2", children: isEditing ? (
              /* ── Inline edit form ── */
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-black text-muted-foreground uppercase tracking-widest", children: t("edit_expense", "Edit Expense") }),
                editLines.map((el, i) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("input", { value: el.description, onChange: (ev) => setEditLines((ls) => ls.map((l, idx) => idx === i ? {
                    ...l,
                    description: ev.target.value
                  } : l)), placeholder: "Description", className: "w-full h-9 rounded-xl border border-border bg-muted px-3 text-sm font-bold outline-none focus:ring-1 focus:ring-primary" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-2", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("input", { value: el.amount, onChange: (ev) => setEditLines((ls) => ls.map((l, idx) => idx === i ? {
                      ...l,
                      amount: ev.target.value
                    } : l)), placeholder: "$0.00", type: "number", min: "0", step: "0.01", className: "flex-1 h-9 rounded-xl border border-border bg-muted px-3 text-sm font-bold outline-none focus:ring-1 focus:ring-primary" }),
                    editLines.length > 1 && /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => setEditLines((ls) => ls.filter((_, idx) => idx !== i)), className: "h-9 w-9 rounded-xl flex items-center justify-center bg-destructive/15 text-destructive active:scale-90 transition", children: /* @__PURE__ */ jsxRuntimeExports.jsx(X, { className: "h-3.5 w-3.5" }) })
                  ] })
                ] }, i)),
                /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => setEditLines((ls) => [...ls, {
                  description: "",
                  amount: ""
                }]), className: "w-full h-8 rounded-xl border border-dashed border-border text-xs font-black text-muted-foreground transition active:scale-[0.98]", children: t("add_line", "+ Add Line") }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-2 pt-1", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: cancelEdit, className: "h-9 rounded-xl font-black text-xs border border-border transition active:scale-95", children: t("cancel", "Cancel") }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => handleEditSave(e), disabled: editSaving, className: "h-9 rounded-xl font-black text-xs text-primary-foreground flex items-center justify-center transition active:scale-95 disabled:opacity-50", style: {
                    background: "var(--gradient-hero)"
                  }, children: editSaving ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-3.5 w-3.5 animate-spin" }) : t("save", "Save") })
                ] })
              ] })
            ) : deleteConfirmId === e.id ? (
              /* ── Delete confirm ── */
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-xs font-semibold text-center text-red-400", children: [
                  t("deduct_confirm", "Delete"),
                  " $",
                  fmt(Number(e.amount)),
                  " ",
                  t("deduct_from_wallet", "expense and refund to wallet?")
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-2", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => setDeleteConfirmId(null), className: "h-9 rounded-xl font-black text-xs border border-border transition active:scale-95", children: t("cancel", "Cancel") }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => handleDelete(e), disabled: deleting, className: "h-9 rounded-xl font-black text-xs text-white flex items-center justify-center transition active:scale-95 disabled:opacity-50", style: {
                    background: "#dc2626"
                  }, children: deleting ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-3.5 w-3.5 animate-spin" }) : t("delete", "Delete") })
                ] })
              ] })
            ) : (
              /* ── Normal row ── */
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start gap-3", children: [
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
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-end gap-1 shrink-0", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "font-black text-sm text-red-400", children: [
                    "$",
                    fmt(Number(e.amount))
                  ] }),
                  canEdit && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-1 mt-0.5", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => startEdit(e), className: "h-7 w-7 rounded-lg flex items-center justify-center transition active:scale-90", style: {
                      background: "rgba(255,255,255,0.08)"
                    }, title: "Edit", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Pencil, { className: "h-3 w-3 text-muted-foreground" }) }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => setDeleteConfirmId(e.id), className: "h-7 w-7 rounded-lg flex items-center justify-center transition active:scale-90", style: {
                      background: "rgba(239,68,68,0.12)"
                    }, title: "Delete", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Trash2, { className: "h-3 w-3 text-red-400" }) })
                  ] }),
                  isLast && !barIsOpen && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[9px] text-muted-foreground/50 mt-0.5", children: t("bar_closed_label", "Bar closed") })
                ] })
              ] })
            ) }, e.id);
          }) })
        ] }, mk);
      })
    ] })
  ] });
}
export {
  ManagerPage as component
};
