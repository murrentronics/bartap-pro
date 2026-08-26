import { r as reactExports, W as jsxRuntimeExports } from "./server-z-pMUGxH.js";
import { m as createLucideIcon, i as useAuth, n as useChain, r as useTranslation, s as supabase, p as ClipboardList, x as ChevronRight, o as LoaderCircle, F as FileDown, v as Pencil, L as Label, I as Input, B as Button, X, w as Trash2, t as toast, C as Capacitor, y as drawHeader, z as LM, A as RM, D as CONTENT_BOTTOM, E as addFootersToAllPages } from "./router-BPIw-ywf.js";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
const __iconNode$3 = [
  ["circle", { cx: "12", cy: "12", r: "10", key: "1mglay" }],
  ["path", { d: "m9 12 2 2 4-4", key: "dzmm74" }]
];
const CircleCheck = createLucideIcon("circle-check", __iconNode$3);
const __iconNode$2 = [
  ["line", { x1: "12", x2: "12", y1: "2", y2: "22", key: "7eqyqh" }],
  ["path", { d: "M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6", key: "1b0p4s" }]
];
const DollarSign = createLucideIcon("dollar-sign", __iconNode$2);
const __iconNode$1 = [
  ["path", { d: "M9 14 4 9l5-5", key: "102s5s" }],
  ["path", { d: "M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11", key: "f3b9sd" }]
];
const Undo2 = createLucideIcon("undo-2", __iconNode$1);
const __iconNode = [
  ["path", { d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", key: "1yyitq" }],
  ["circle", { cx: "9", cy: "7", r: "4", key: "nufk8" }],
  ["line", { x1: "19", x2: "19", y1: "8", y2: "14", key: "1bvyxn" }],
  ["line", { x1: "22", x2: "16", y1: "11", y2: "11", key: "1shjgl" }]
];
const UserPlus = createLucideIcon("user-plus", __iconNode);
async function buildBillPdf(account, ownerName) {
  const {
    data: txs,
    error
  } = await supabase.from("credit_transactions").select("id, type, amount, note, items, created_at").eq("credit_account_id", account.id).order("created_at", {
    ascending: true
  });
  if (error) {
    toast.error("Failed to load transactions");
    return null;
  }
  const {
    data: products
  } = await supabase.from("products").select("id, name, cost_price, units_per_item").eq("owner_id", account.owner_id);
  new Map((products ?? []).map((p) => [p.id, p.units_per_item > 0 ? p.cost_price / p.units_per_item : p.cost_price]));
  new Map((products ?? []).map((p) => [p.name, p.units_per_item > 0 ? p.cost_price / p.units_per_item : p.cost_price]));
  const {
    jsPDF
  } = await import("./jspdf.es.min-BdO0f7xz.js").then((n) => n.j);
  const doc = new jsPDF({
    unit: "mm",
    format: "a4"
  });
  const generated = (/* @__PURE__ */ new Date()).toLocaleString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
  let y = await drawHeader(doc, ownerName, "Credit Bill", "Full History", generated);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.text("Customer:", LM, y);
  doc.setFont("helvetica", "normal");
  doc.text(account.full_name, LM + 24, y);
  y += 5;
  if (account.contact_number) {
    doc.text("Contact: " + account.contact_number, LM, y);
    y += 5;
  }
  if (account.id_number) {
    doc.text("ID: " + account.id_number, LM, y);
    y += 5;
  }
  doc.text("Account opened: " + new Date(account.created_at).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }), LM, y);
  y += 5;
  const ORANGE = [232, 146, 42];
  const cashPurchases = (txs ?? []).filter((t) => t.type === "charge").reduce((s, t) => s + Number(t.amount), 0);
  const creditBalance = Number(account.balance_owed);
  doc.setFillColor(245, 240, 230);
  doc.roundedRect(LM, y, RM - LM, 22, 2, 2, "F");
  doc.setDrawColor(...ORANGE);
  doc.setLineWidth(0.4);
  doc.roundedRect(LM, y, RM - LM, 22, 2, 2, "S");
  const cols = [{
    label: "Cash Purchases",
    value: "$" + cashPurchases.toFixed(2),
    red: false
  }, {
    label: "Credit Balance",
    value: "$" + creditBalance.toFixed(2),
    red: creditBalance > 0
  }];
  const colW = (RM - LM) / 2;
  cols.forEach((col, i) => {
    const cx = LM + i * colW + colW / 2;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(100, 100, 100);
    doc.text(col.label, cx, y + 7, {
      align: "center"
    });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(col.red ? 200 : 30, col.red ? 40 : 30, 40);
    doc.text(col.value, cx, y + 17, {
      align: "center"
    });
  });
  doc.setTextColor(0, 0, 0);
  y += 27;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(130, 130, 130);
  doc.text("DATE / DETAILS", LM, y);
  doc.text("AMOUNT", RM, y, {
    align: "right"
  });
  y += 3;
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.2);
  doc.line(LM, y, RM, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(0, 0, 0);
  for (const tx of txs ?? []) {
    if (y > CONTENT_BOTTOM) {
      doc.addPage();
      y = 20;
    }
    const isCharge = tx.type === "charge";
    const dateStr = new Date(tx.created_at).toLocaleString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      day: "2-digit",
      month: "short",
      year: "numeric"
    });
    doc.setFont("helvetica", "bold");
    doc.setTextColor(isCharge ? 200 : 40, isCharge ? 60 : 140, 40);
    doc.text(isCharge ? "CHARGE" : "PAYMENT", LM, y);
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");
    doc.text(dateStr, LM + 22, y);
    const amtStr = (isCharge ? "+" : "-") + "$" + Number(tx.amount).toFixed(2);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(isCharge ? 200 : 40, isCharge ? 60 : 140, 40);
    doc.text(amtStr, RM, y, {
      align: "right"
    });
    doc.setTextColor(0, 0, 0);
    y += 5;
    if (isCharge && tx.items && Array.isArray(tx.items) && tx.items.length > 0) {
      if (y > CONTENT_BOTTOM - 8) {
        doc.addPage();
        y = 20;
      }
      const C_ITEM = LM + 4;
      const C_QTY = LM + 100;
      const C_PRICE = LM + 140;
      const C_TOTAL = RM;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.5);
      doc.setTextColor(150, 150, 150);
      doc.text("ITEM", C_ITEM, y);
      doc.text("QTY", C_QTY, y, {
        align: "right"
      });
      doc.text("PRICE", C_PRICE, y, {
        align: "right"
      });
      doc.text("TOTAL", C_TOTAL, y, {
        align: "right"
      });
      y += 3.5;
      doc.setDrawColor(210, 210, 210);
      doc.setLineWidth(0.15);
      doc.line(C_ITEM, y, RM, y);
      y += 3;
      let chargeTotal = 0;
      for (const it of tx.items) {
        if (y > CONTENT_BOTTOM - 6) {
          doc.addPage();
          y = 20;
        }
        const qty = Number(it.qty ?? 1);
        const price = Number(it.price ?? 0);
        const total = price * qty;
        chargeTotal += total;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(30, 30, 30);
        const nameStr = doc.splitTextToSize(it.name ?? "", 90)[0];
        doc.text(nameStr, C_ITEM, y);
        doc.text(String(qty), C_QTY, y, {
          align: "right"
        });
        doc.setTextColor(...ORANGE);
        doc.text("$" + price.toFixed(2), C_PRICE, y, {
          align: "right"
        });
        doc.setFont("helvetica", "bold");
        doc.text("$" + total.toFixed(2), C_TOTAL, y, {
          align: "right"
        });
        doc.setTextColor(0, 0, 0);
        y += 4.5;
      }
      if (y > CONTENT_BOTTOM - 6) {
        doc.addPage();
        y = 20;
      }
      doc.setDrawColor(210, 210, 210);
      doc.setLineWidth(0.15);
      doc.line(C_ITEM, y, RM, y);
      y += 3;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(80, 80, 80);
      doc.text("Subtotal", C_ITEM, y);
      doc.setTextColor(...ORANGE);
      doc.text("$" + chargeTotal.toFixed(2), C_TOTAL, y, {
        align: "right"
      });
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(8.5);
      y += 5;
    }
    if (tx.note && !(isCharge && Array.isArray(tx.items) && tx.items.length > 0)) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(7.5);
      doc.setTextColor(120, 120, 120);
      doc.text("  " + tx.note, LM, y);
      y += 4;
      doc.setFontSize(8.5);
      doc.setTextColor(0, 0, 0);
    }
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.1);
    doc.line(LM, y, RM, y);
    y += 4;
  }
  if (y > CONTENT_BOTTOM - 10) {
    doc.addPage();
    y = 20;
  }
  y += 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...ORANGE);
  doc.text("Balance Remaining:", LM, y);
  doc.setTextColor(creditBalance <= 0 ? 40 : 200, creditBalance <= 0 ? 140 : 40, 40);
  doc.text("$" + creditBalance.toFixed(2), RM, y, {
    align: "right"
  });
  addFootersToAllPages(doc);
  account.full_name.replace(/\s+/g, "-").toLowerCase();
  return doc.output("datauristring");
}
function BillActionModal({
  account,
  ownerName,
  onClose,
  chargeId,
  charges: propCharges
}) {
  const [busy, setBusy] = reactExports.useState(null);
  const [charges, setCharges] = reactExports.useState([]);
  const safeName = account.full_name.replace(/\s+/g, "-").toLowerCase();
  const filename = `credit-bill-${safeName}.pdf`;
  reactExports.useEffect(() => {
    if (propCharges) {
      setCharges(propCharges);
      return;
    }
    let cancelled = false;
    supabase.from("credit_transactions").select("id, amount, items, created_at").eq("credit_account_id", account.id).eq("type", "charge").order("created_at", {
      ascending: true
    }).then(({
      data
    }) => {
      if (cancelled) return;
      setCharges((data ?? []).map((c) => ({
        id: c.id,
        amount: Number(c.amount),
        items: c.items ?? [],
        created_at: c.created_at
      })));
    });
    return () => {
      cancelled = true;
    };
  }, [account.id, propCharges]);
  const displayCharges = chargeId ? charges.filter((c) => c.id === chargeId) : charges;
  const totalOwed = displayCharges.reduce((s, c) => s + c.amount, 0);
  const handlePrint = async () => {
    setBusy("print");
    try {
      const b64 = await buildBillPdf(account, ownerName);
      if (!b64) {
        setBusy(null);
        return;
      }
      const {
        printReceipt
      } = await import("./receiptPrinter-Cj0HPMPu.js");
      const result = await printReceipt({
        storeName: ownerName,
        customerName: account.full_name,
        items: [],
        subtotal: Number(account.balance_owed),
        total: Number(account.balance_owed),
        paid: 0,
        change: 0,
        payMode: "credit",
        date: (/* @__PURE__ */ new Date()).toLocaleString("en-US", {
          month: "numeric",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
          second: "2-digit",
          hour12: true
        })
      });
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Receipt sent to printer");
      }
    } catch (e) {
      toast.error("Print failed: " + (e?.message ?? "unknown"));
    }
    setBusy(null);
  };
  const handleShare = async () => {
    setBusy("share");
    try {
      if (Capacitor.isNativePlatform()) {
        const b64 = await buildBillPdf(account, ownerName);
        if (!b64) {
          setBusy(null);
          return;
        }
        const {
          Filesystem,
          Directory
        } = await import("./index-DPWxkYjx.js");
        const {
          Share
        } = await import("./index-g6d9ED4p.js");
        const base64Data = b64.replace(/^data:[^;]+;base64,/, "");
        const writeResult = await Filesystem.writeFile({
          path: filename,
          data: base64Data,
          directory: Directory.Cache
        });
        const shareText = `Hi ${account.full_name}, please find your credit bill attached.`;
        await Share.share({
          title: `Credit Bill — ${account.full_name}`,
          text: shareText,
          url: writeResult.uri,
          dialogTitle: "Send Bill"
        });
      } else {
        const text = `Credit Bill — ${account.full_name}
Balance Owed: $${Number(account.balance_owed).toFixed(2)}`;
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
        toast.success("Opening WhatsApp share");
      }
    } catch (e) {
      if (!String(e?.message ?? "").includes("cancel")) {
        toast.error("Share failed: " + (e?.message ?? "unknown"));
      }
    }
    setBusy(null);
    onClose();
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "fixed inset-0 z-[60] flex items-center justify-center p-6 bg-black/70 backdrop-blur-sm", onClick: onClose, children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "w-full max-w-xs rounded-3xl border border-border shadow-2xl overflow-hidden", style: {
    background: "var(--gradient-card)"
  }, onClick: (e) => e.stopPropagation(), children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-5 pt-5 pb-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("h3", { className: "font-black text-base", children: [
        "Bill — ",
        account.full_name
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: onClose, className: "h-8 w-8 rounded-full flex items-center justify-center bg-muted transition", children: /* @__PURE__ */ jsxRuntimeExports.jsx(X, { className: "h-4 w-4" }) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "px-5 py-2 overflow-y-auto max-h-[50vh]", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-white text-zinc-900 rounded-xl p-4 shadow-inner text-left font-mono text-xs leading-tight border border-zinc-300 select-none", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-center font-black text-zinc-950 text-base font-sans tracking-tight uppercase mb-0.5", children: ownerName }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-center text-[10px] text-zinc-600", children: (/* @__PURE__ */ new Date()).toLocaleString("en-US", {
        month: "numeric",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        hour12: true
      }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-center text-[10px] text-zinc-600", children: [
        "Customer: ",
        account.full_name
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "border-t border-dashed border-zinc-400 my-2" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-center font-black text-base tracking-wide text-zinc-950 my-1", children: chargeId ? "ORDER RECEIPT" : "CREDIT BILL" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "border-t border-dashed border-zinc-400 my-2" }),
      displayCharges.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-center text-zinc-500 py-2", children: "No charges recorded" }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-1 my-2", children: displayCharges.map((c) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-between items-start", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-semibold text-zinc-900 pr-2 break-all", children: c.items && c.items.length > 0 ? c.items.map((it) => `${it.qty || 1}x ${it.name}`).join(", ") : "Charge" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "font-bold text-zinc-950 whitespace-nowrap", children: [
          "-$",
          Number(c.amount).toFixed(2)
        ] })
      ] }, c.id)) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "border-t border-dashed border-zinc-400 my-2" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-1", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-between", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-bold text-zinc-700", children: chargeId ? "Charge Total" : "Balance Owed" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "font-black text-zinc-950", children: [
          "$",
          chargeId ? totalOwed.toFixed(2) : Number(account.balance_owed).toFixed(2)
        ] })
      ] }) })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "px-5 pb-5 pt-3 flex flex-col gap-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { onClick: handlePrint, disabled: !!busy, className: "w-full h-12 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-50 border border-border", style: {
        background: "rgba(255,255,255,0.08)",
        color: "var(--foreground)"
      }, children: [
        busy === "print" ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-4 w-4 animate-spin" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(FileDown, { className: "h-4 w-4" }),
        "Print Bill"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { onClick: handleShare, disabled: !!busy, className: "w-full h-12 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-50 border border-green-500/40", style: {
        background: "rgba(37,211,102,0.12)",
        color: "#25D366"
      }, children: [
        busy === "share" ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-4 w-4 animate-spin" }) : null,
        "Share via WhatsApp"
      ] })
    ] })
  ] }) });
}
function CreditPage() {
  const {
    profile
  } = useAuth();
  const {
    effectiveOwnerId
  } = useChain();
  const {
    t
  } = useTranslation();
  const rawOwnerId = profile?.role === "owner" ? profile.id : profile?.parent_id;
  const ownerId = profile?.role === "owner" ? effectiveOwnerId(profile.id) : rawOwnerId;
  const ownerName = profile?.username ?? "Bar";
  const ownerIdRef = reactExports.useRef(ownerId);
  reactExports.useEffect(() => {
    ownerIdRef.current = ownerId;
  }, [ownerId]);
  const [tab, setTab] = reactExports.useState("credit");
  const [opened, setOpened] = reactExports.useState([]);
  const [closed, setClosed] = reactExports.useState([]);
  const [loading, setLoading] = reactExports.useState(true);
  const [billAccount, setBillAccount] = reactExports.useState(null);
  const [billChargeId, setBillChargeId] = reactExports.useState(null);
  const openBill = (account, chargeId) => {
    setBillAccount(account);
    setBillChargeId(chargeId ?? null);
  };
  const [payAccount, setPayAccount] = reactExports.useState(null);
  const [editAccount, setEditAccount] = reactExports.useState(null);
  const fetchAccounts = reactExports.useCallback(async () => {
    const id = ownerIdRef.current;
    if (!id) return;
    setLoading(true);
    const {
      data
    } = await supabase.from("credit_accounts").select("*").eq("owner_id", id).order("updated_at", {
      ascending: false
    });
    const all = data ?? [];
    setOpened(all.filter((a) => Number(a.balance_owed) > 0).sort((a, b) => a.full_name.localeCompare(b.full_name)));
    setClosed(all.filter((a) => Number(a.balance_owed) <= 0).sort((a, b) => a.full_name.localeCompare(b.full_name)));
    setLoading(false);
  }, []);
  reactExports.useEffect(() => {
    if (!ownerId) return;
    fetchAccounts();
  }, [ownerId, fetchAccounts]);
  reactExports.useEffect(() => {
    if (!ownerId) return;
    const ch = supabase.channel(`credit-page-${ownerId}`).on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "credit_accounts",
      filter: `owner_id=eq.${ownerId}`
    }, () => fetchAccounts()).on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "credit_transactions",
      filter: `owner_id=eq.${ownerId}`
    }, () => fetchAccounts()).subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [ownerId, fetchAccounts]);
  const handleCreated = (account) => {
    setClosed((prev) => [account, ...prev]);
    setTab("cleared");
  };
  const handlePaymentDone = () => {
    setPayAccount(null);
    fetchAccounts();
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "py-3 space-y-4", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-2xl font-black", children: "Customers" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex gap-1 rounded-2xl p-1", style: {
      background: "var(--gradient-card)"
    }, children: ["credit", "cleared", ...profile?.role !== "manager" && profile?.job_title !== "manager" ? ["create"] : []].map((tabKey) => /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => setTab(tabKey), className: `flex-1 py-2.5 rounded-xl text-sm font-black capitalize transition ${tab === tabKey ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`, style: tab === tabKey ? {
      background: "var(--gradient-hero)"
    } : {}, children: tabKey === "credit" ? `Abiertos${opened.length ? ` (${opened.length})` : ""}` : tabKey === "cleared" ? "Cerrados" : "Crear" }, tabKey)) }),
    tab === "credit" && /* @__PURE__ */ jsxRuntimeExports.jsx(OpenedTab, { accounts: opened, loading, ownerName, onSelect: (a) => {
    }, onEdit: setEditAccount, onOpenBill: openBill }),
    tab === "cleared" && /* @__PURE__ */ jsxRuntimeExports.jsx(ClosedTab, { accounts: closed, loading, ownerName, onEdit: setEditAccount, ownerId, onOpenBill: openBill, onReopen: (a) => {
      fetchAccounts();
      setTab("credit");
    }, cashierId: profile?.id ?? "" }),
    tab === "create" && /* @__PURE__ */ jsxRuntimeExports.jsx(CreateTab, { ownerId, onCreated: handleCreated }),
    payAccount && /* @__PURE__ */ jsxRuntimeExports.jsx(PaymentOverlay, { account: payAccount, ownerId, onClose: () => setPayAccount(null), onDone: handlePaymentDone, onOpenBill: openBill }),
    editAccount && /* @__PURE__ */ jsxRuntimeExports.jsx(EditCustomerModal, { account: editAccount, onClose: () => setEditAccount(null), onSaved: (updated) => {
      setEditAccount(null);
      setOpened((prev) => prev.map((a) => a.id === updated.id ? updated : a).sort((a, b) => a.full_name.localeCompare(b.full_name)));
      setClosed((prev) => prev.map((a) => a.id === updated.id ? updated : a).sort((a, b) => a.full_name.localeCompare(b.full_name)));
    } }),
    billAccount && /* @__PURE__ */ jsxRuntimeExports.jsx(BillActionModal, { account: billAccount, ownerName, chargeId: billChargeId ?? void 0, onClose: () => {
      setBillAccount(null);
      setBillChargeId(null);
    } })
  ] });
}
function OpenedTab({
  accounts,
  loading,
  ownerName,
  onSelect,
  onEdit,
  onOpenBill
}) {
  const [printing, setPrinting] = reactExports.useState(null);
  const [printed, setPrinted] = reactExports.useState(null);
  if (loading) return /* @__PURE__ */ jsxRuntimeExports.jsx(Spinner, {});
  if (accounts.length === 0) return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-center py-16 text-muted-foreground", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(ClipboardList, { className: "h-10 w-10 mx-auto mb-3 opacity-30" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "font-semibold", children: "No hay cuentas abiertas" })
  ] });
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-2", children: accounts.map((a) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "w-full rounded-2xl border border-border text-left overflow-hidden", style: {
    background: "var(--gradient-card)"
  }, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "px-4 pt-3 pb-2 border-b border-border/40", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { className: "w-full text-left active:scale-[0.98] transition", onClick: () => onSelect(a), children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "font-black text-base truncate", children: a.full_name }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-muted-foreground mt-0.5", children: new Date(a.created_at).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric"
      }) }),
      a.contact_number && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-muted-foreground mt-0.5", children: a.contact_number }),
      a.id_number && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-muted-foreground mt-0.5", children: a.id_number })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-4 py-2.5", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { className: "flex items-center gap-1.5 active:scale-95 transition", onClick: () => onSelect(a), children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-lg font-black text-red-400", children: [
          "$",
          Number(a.balance_owed).toFixed(2)
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronRight, { className: "h-4 w-4 text-muted-foreground" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => onOpenBill?.(a), disabled: printing === a.id, className: "h-9 w-9 rounded-xl flex items-center justify-center shrink-0 active:scale-90 transition disabled:opacity-50", style: printed === a.id ? {
          background: "#16a34a",
          border: "1px solid #16a34a"
        } : {
          background: "rgba(251,146,60,0.15)",
          border: "1px solid rgba(251,146,60,0.35)"
        }, title: "Print Bill", children: printing === a.id ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-4 w-4 animate-spin", style: {
          color: "var(--primary)"
        } }) : printed === a.id ? /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { className: "h-4 w-4 text-white", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "3", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ jsxRuntimeExports.jsx("polyline", { points: "20 6 9 17 4 12" }) }) : /* @__PURE__ */ jsxRuntimeExports.jsx(FileDown, { className: "h-4 w-4", style: {
          color: "var(--primary)"
        } }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => onEdit(a), className: "h-9 w-9 rounded-xl flex items-center justify-center shrink-0 active:scale-90 transition", style: {
          background: "rgba(251,146,60,0.15)",
          border: "1px solid rgba(251,146,60,0.35)"
        }, title: "Edit customer", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Pencil, { className: "h-4 w-4", style: {
          color: "var(--primary)"
        } }) })
      ] })
    ] })
  ] }, a.id)) });
}
function ClosedTab({
  accounts,
  loading,
  ownerName,
  onEdit,
  ownerId,
  onOpenBill,
  onReopen,
  cashierId
}) {
  const [printing, setPrinting] = reactExports.useState(null);
  const [printed, setPrinted] = reactExports.useState(null);
  const [cashAccounts, setCashAccounts] = reactExports.useState(/* @__PURE__ */ new Set());
  const [lastPayments, setLastPayments] = reactExports.useState({});
  const [reopenLoading, setReopenLoading] = reactExports.useState(null);
  reactExports.useEffect(() => {
    if (!ownerId || accounts.length === 0) return;
    supabase.from("credit_transactions").select("credit_account_id, note").eq("owner_id", ownerId).eq("type", "charge").then(({
      data
    }) => {
      const ids = new Set((data ?? []).filter((tx) => tx.note?.startsWith("[CASH]")).map((tx) => tx.credit_account_id));
      setCashAccounts(ids);
    });
  }, [ownerId, accounts]);
  reactExports.useEffect(() => {
    if (!ownerId || accounts.length === 0) return;
    const accountIds = accounts.map((a) => a.id);
    supabase.from("credit_transactions").select("id, credit_account_id, amount, created_at").eq("owner_id", ownerId).eq("type", "payment").in("credit_account_id", accountIds).order("created_at", {
      ascending: false
    }).then(({
      data
    }) => {
      const map = {};
      for (const tx of data ?? []) {
        if (!map[tx.credit_account_id]) {
          map[tx.credit_account_id] = {
            id: tx.id,
            amount: Number(tx.amount)
          };
        }
      }
      setLastPayments(map);
    });
  }, [ownerId, accounts]);
  const handleReopen = async (a) => {
    const payment = lastPayments[a.id];
    if (!payment) return;
    setReopenLoading(a.id);
    const {
      error
    } = await supabase.rpc("delete_credit_payment", {
      p_credit_tx_id: payment.id,
      p_cashier_id: cashierId
    });
    if (error) {
      toast.error(error.message);
      setReopenLoading(null);
      return;
    }
    toast.success("Payment removed — account reopened");
    setReopenLoading(null);
    onReopen?.(a);
  };
  if (loading) return /* @__PURE__ */ jsxRuntimeExports.jsx(Spinner, {});
  if (accounts.length === 0) return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-center py-16 text-muted-foreground", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { className: "h-10 w-10 mx-auto mb-3 opacity-30" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "font-semibold", children: "Sin clientes pagados aún" })
  ] });
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-2", children: accounts.map((a) => {
    const hasCashPurchase = cashAccounts.has(a.id);
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-2xl border border-border overflow-hidden", style: {
      background: "var(--gradient-card)"
    }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-4 pt-3 pb-2 border-b border-border/40", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 min-w-0", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "font-black text-base truncate", children: a.full_name }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-muted-foreground mt-0.5", children: new Date(a.created_at).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric"
          }) }),
          a.contact_number && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-muted-foreground mt-0.5", children: a.contact_number }),
          a.id_number && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-muted-foreground mt-0.5", children: a.id_number })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => onEdit(a), className: "h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ml-2 active:scale-90 transition", style: {
          background: "rgba(251,146,60,0.15)",
          border: "1px solid rgba(251,146,60,0.35)"
        }, title: "Edit customer", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Pencil, { className: "h-4 w-4", style: {
          color: "var(--primary)"
        } }) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-4 py-2.5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-bold text-green-500 px-2 py-1 rounded-lg bg-green-500/10", children: "Pagado" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
          hasCashPurchase && /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => onOpenBill?.(a), disabled: printing === a.id, className: "h-9 w-9 rounded-xl flex items-center justify-center shrink-0 active:scale-90 transition disabled:opacity-50", style: printed === a.id ? {
            background: "#16a34a",
            border: "1px solid #16a34a"
          } : {
            background: "rgba(251,146,60,0.15)",
            border: "1px solid rgba(251,146,60,0.35)"
          }, title: "Print Bill", children: printing === a.id ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-4 w-4 animate-spin", style: {
            color: "var(--primary)"
          } }) : printed === a.id ? /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { className: "h-4 w-4 text-white", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "3", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ jsxRuntimeExports.jsx("polyline", { points: "20 6 9 17 4 12" }) }) : /* @__PURE__ */ jsxRuntimeExports.jsx(FileDown, { className: "h-4 w-4", style: {
            color: "var(--primary)"
          } }) }),
          lastPayments[a.id] && /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => handleReopen(a), disabled: reopenLoading === a.id, className: "h-9 w-9 rounded-xl flex items-center justify-center shrink-0 active:scale-90 transition disabled:opacity-50", style: {
            background: "rgba(239,68,68,0.15)",
            border: "1px solid rgba(239,68,68,0.35)"
          }, title: "Undo last payment — reopen account", children: reopenLoading === a.id ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-4 w-4 animate-spin text-white" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(Undo2, { className: "h-4 w-4 text-red-400" }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => onEdit(a), className: "h-9 w-9 rounded-xl flex items-center justify-center shrink-0 active:scale-90 transition", style: {
            background: "rgba(251,146,60,0.15)",
            border: "1px solid rgba(251,146,60,0.35)"
          }, title: "Edit customer", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Pencil, { className: "h-4 w-4", style: {
            color: "var(--primary)"
          } }) })
        ] })
      ] })
    ] }, a.id);
  }) });
}
function EditCustomerModal({
  account,
  onClose,
  onSaved
}) {
  const parseContact = (c) => {
    if (!c) return "";
    const stripped = c.replace(/^868-?/, "");
    return stripped;
  };
  const parseIdType = (n) => {
    if (!n) return "national_id";
    return n.startsWith("DP:") ? "drivers_permit" : "national_id";
  };
  const parseIdNumber = (n) => {
    if (!n) return "";
    return n.replace(/^(DP|NID):\s*/, "");
  };
  const [name, setName] = reactExports.useState(account.full_name);
  const [contact, setContactRaw] = reactExports.useState(parseContact(account.contact_number));
  const [idType, setIdType] = reactExports.useState(parseIdType(account.id_number));
  const [idNumber, setIdNumberRaw] = reactExports.useState(parseIdNumber(account.id_number));
  const [busy, setBusy] = reactExports.useState(false);
  const [activeField, setActiveField] = reactExports.useState(null);
  const setContact = (v) => {
    const digits = v.replace("-", "");
    if (digits.length <= 7) setContactRaw(v);
  };
  const setIdNumber = (v) => {
    const digits = v.replace("-", "");
    if (digits.length <= 7) setIdNumberRaw(v);
  };
  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    const {
      data,
      error
    } = await supabase.from("credit_accounts").update({
      full_name: name.trim(),
      contact_number: contact.trim() ? "868-" + contact.trim() : null,
      id_number: idNumber.trim() ? `${idType === "drivers_permit" ? "DP" : "NID"}: ${idNumber.trim()}` : null
    }).eq("id", account.id).select().single();
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Customer updated");
    onSaved(data);
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "fixed inset-0 z-50 flex items-end justify-center p-4 bg-black/70 backdrop-blur-sm", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "w-full max-w-md rounded-3xl border border-border shadow-2xl overflow-hidden max-h-[90vh] flex flex-col", style: {
    background: "var(--gradient-card)"
  }, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-5 pt-5 pb-4 shrink-0", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-10 w-10 rounded-xl flex items-center justify-center shrink-0", style: {
          background: "var(--gradient-hero)"
        }, children: /* @__PURE__ */ jsxRuntimeExports.jsx(Pencil, { className: "h-5 w-5 text-primary-foreground" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "font-black text-base", children: "Edit Customer" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-muted-foreground", children: "Update account details" })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: onClose, className: "h-9 w-9 rounded-full flex items-center justify-center bg-muted hover:bg-muted/80 transition", children: /* @__PURE__ */ jsxRuntimeExports.jsx(X, { className: "h-4 w-4" }) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "px-5 pb-5 overflow-y-auto flex-1", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("form", { onSubmit: submit, className: "space-y-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { htmlFor: "edit-credit-name", children: "Full Name *" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { id: "edit-credit-name", value: name, onChange: (e) => setName(e.target.value), placeholder: "e.g. John Smith", required: true, className: "mt-1", style: {
          background: "#ffffff",
          color: "#000000"
        } })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { htmlFor: "edit-credit-idtype", children: "ID Type" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("select", { id: "edit-credit-idtype", value: idType, onChange: (e) => setIdType(e.target.value), className: "w-full h-10 rounded-md border border-input px-3 text-sm font-semibold mt-1", style: {
          background: "#ffffff",
          color: "#000000"
        }, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "drivers_permit", children: "Driver's Permit" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "national_id", children: "National ID" })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "ID Number" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: () => setActiveField((f) => f === "idNumber" ? null : "idNumber"), className: "w-full h-10 rounded-md border border-input px-3 text-sm text-left mt-1 font-semibold", style: {
          background: "#ffffff",
          color: idNumber ? "#000000" : "#9ca3af"
        }, children: idNumber || "e.g. 000-0000" }),
        activeField === "idNumber" && /* @__PURE__ */ jsxRuntimeExports.jsx(CreditIdPad, { value: idNumber, onChange: setIdNumber, onDone: () => setActiveField(null) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Contact Number" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-0 mt-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "h-10 px-3 flex items-center rounded-l-md border border-r-0 border-input bg-muted text-sm font-bold text-muted-foreground select-none", children: "868" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: () => setActiveField((f) => f === "contact" ? null : "contact"), className: "flex-1 h-10 rounded-r-md border border-input px-3 text-sm text-left font-semibold", style: {
            background: "#ffffff",
            color: contact ? "#000000" : "#9ca3af"
          }, children: contact || "XXX-XXXX" })
        ] }),
        activeField === "contact" && /* @__PURE__ */ jsxRuntimeExports.jsx(CreditContactPad, { value: contact, onChange: setContact, onDone: () => setActiveField(null) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { type: "submit", disabled: busy || !name.trim(), className: "w-full h-12 font-black text-base", style: {
        background: "var(--gradient-hero)",
        color: "var(--primary-foreground)"
      }, children: busy ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-4 w-4 animate-spin mr-2" }),
        "Saving…"
      ] }) : "Save Changes" })
    ] }) })
  ] }) });
}
function CreateTab({
  ownerId,
  onCreated
}) {
  const [name, setName] = reactExports.useState("");
  const [contactRaw, setContactRaw] = reactExports.useState("");
  const [idType, setIdType] = reactExports.useState("national_id");
  const [idNumberRaw, setIdNumberRaw] = reactExports.useState("");
  const [busy, setBusy] = reactExports.useState(false);
  const [done, setDone] = reactExports.useState(false);
  const [activeField, setActiveField] = reactExports.useState(null);
  const toggle = (f) => setActiveField((cur) => cur === f ? null : f);
  const setContact = (v) => {
    const digits = v.replace("-", "");
    if (digits.length <= 7) setContactRaw(v);
  };
  const setIdNumber = (v) => {
    const digits = v.replace("-", "");
    if (digits.length <= 7) setIdNumberRaw(v);
  };
  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    const {
      data,
      error
    } = await supabase.from("credit_accounts").insert({
      owner_id: ownerId,
      full_name: name.trim(),
      contact_number: contactRaw.trim() ? "868-" + contactRaw.trim() : null,
      id_number: idNumberRaw.trim() ? `${idType === "drivers_permit" ? "DP" : "NID"}: ${idNumberRaw.trim()}` : null,
      status: "closed"
    }).select().single();
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setDone(true);
    onCreated(data);
    setName("");
    setContactRaw("");
    setIdNumberRaw("");
    setIdType("national_id");
    setActiveField(null);
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-2xl p-5 space-y-4", style: {
    background: "var(--gradient-card)"
  }, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-10 w-10 rounded-xl flex items-center justify-center shrink-0", style: {
        background: "var(--gradient-hero)"
      }, children: /* @__PURE__ */ jsxRuntimeExports.jsx(UserPlus, { className: "h-5 w-5 text-primary-foreground" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "font-black text-base", children: "New Credit Account" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-muted-foreground", children: "Customer will be added to the Closed tab" })
      ] })
    ] }),
    done && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 p-3 rounded-xl bg-green-500/10 border border-green-500/30 text-sm text-green-400 font-semibold", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { className: "h-4 w-4 shrink-0" }),
      "Customer created. View in Closed tab."
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("form", { onSubmit: submit, className: "space-y-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { htmlFor: "credit-name", children: "Full Name *" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { id: "credit-name", value: name, onChange: (e) => {
          setName(e.target.value);
          setDone(false);
        }, placeholder: "e.g. John Smith", required: true, className: "mt-1", style: {
          background: "#ffffff",
          color: "#000000"
        } })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { htmlFor: "credit-idtype", children: "ID Type" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("select", { id: "credit-idtype", value: idType, onChange: (e) => setIdType(e.target.value), className: "w-full h-10 rounded-md border border-input px-3 text-sm font-semibold mt-1", style: {
          background: "#ffffff",
          color: "#000000"
        }, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "drivers_permit", children: "Driver's Permit" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "national_id", children: "National ID" })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "ID Number" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: () => toggle("idNumber"), className: "w-full h-10 rounded-md border border-input px-3 text-sm text-left mt-1 font-semibold", style: {
          background: "#ffffff",
          color: idNumberRaw ? "#000000" : "#9ca3af"
        }, children: idNumberRaw || "e.g. 000-0000" }),
        activeField === "idNumber" && /* @__PURE__ */ jsxRuntimeExports.jsx(CreditIdPad, { value: idNumberRaw, onChange: setIdNumber, onDone: () => setActiveField(null) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Contact Number" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-0 mt-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "h-10 px-3 flex items-center rounded-l-md border border-r-0 border-input bg-muted text-sm font-bold text-muted-foreground select-none", children: "868" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: () => toggle("contact"), className: "flex-1 h-10 rounded-r-md border border-input px-3 text-sm text-left font-semibold", style: {
            background: "#ffffff",
            color: contactRaw ? "#000000" : "#9ca3af"
          }, children: contactRaw || "XXX-XXXX" })
        ] }),
        contactRaw.replace("-", "").length > 0 && contactRaw.replace("-", "").length < 7 && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-xs font-semibold text-amber-400 mt-1", children: [
          7 - contactRaw.replace("-", "").length,
          " more digit",
          7 - contactRaw.replace("-", "").length !== 1 ? "s" : "",
          " needed"
        ] }),
        activeField === "contact" && /* @__PURE__ */ jsxRuntimeExports.jsx(CreditContactPad, { value: contactRaw, onChange: setContact, onDone: () => setActiveField(null) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { type: "submit", disabled: busy || !name.trim() || contactRaw.replace("-", "").length > 0 && contactRaw.replace("-", "").length < 7, className: "w-full h-12 font-black text-base", style: {
        background: "var(--gradient-hero)",
        color: "var(--primary-foreground)"
      }, children: busy ? "Creating…" : "Create Account" })
    ] })
  ] });
}
function PaymentOverlay({
  account,
  ownerId,
  onClose,
  onDone,
  onOpenBill
}) {
  const {
    profile
  } = useAuth();
  const [amount, setAmount] = reactExports.useState("");
  const [busy, setBusy] = reactExports.useState(false);
  const [printing, setPrinting] = reactExports.useState(false);
  const [printed, setPrinted] = reactExports.useState(false);
  const [charges, setCharges] = reactExports.useState([]);
  const [deletingId, setDeletingId] = reactExports.useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = reactExports.useState(null);
  profile?.username ?? "Bar";
  const amountNum = parseFloat(amount) || 0;
  const owed = Number(account.balance_owed);
  const tooMuch = amountNum > owed;
  const valid = amountNum > 0 && !tooMuch;
  const loadCharges = reactExports.useCallback(async () => {
    const {
      data
    } = await supabase.from("credit_transactions").select("id, amount, items, created_at, cashier_id").eq("credit_account_id", account.id).eq("type", "charge").order("created_at", {
      ascending: false
    });
    setCharges(data ?? []);
  }, [account.id]);
  reactExports.useEffect(() => {
    loadCharges();
  }, [loadCharges]);
  reactExports.useEffect(() => {
    const ch = supabase.channel(`credit-charges-${account.id}`).on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "credit_transactions",
      filter: `credit_account_id=eq.${account.id}`
    }, () => loadCharges()).subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [account.id, loadCharges]);
  const deleteCharge = async (chargeId) => {
    if (!profile) return;
    const ownerId2 = profile.role === "owner" ? profile.id : profile.parent_id;
    setDeletingId(chargeId);
    const {
      data: chargeTx
    } = await supabase.from("credit_transactions").select("created_at").eq("id", chargeId).single();
    const {
      error
    } = await supabase.rpc("delete_credit_charge", {
      p_credit_tx_id: chargeId,
      p_cashier_id: profile.id
    });
    setDeletingId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (chargeTx?.created_at && ownerId2) {
      const t = new Date(chargeTx.created_at);
      await supabase.rpc("delete_credit_charge_wallet_rows", {
        p_owner_id: ownerId2,
        p_cashier_id: profile.id,
        p_from_time: new Date(t.getTime() - 5e3).toISOString(),
        p_to_time: new Date(t.getTime() + 5e3).toISOString()
      });
    }
    toast.success("Charge removed — stock restored");
    await loadCharges();
    onDone();
  };
  const submit = async () => {
    if (!valid || !profile) return;
    setBusy(true);
    const {
      error
    } = await supabase.rpc("record_credit_payment", {
      p_credit_account_id: account.id,
      p_cashier_id: profile.id,
      p_amount: amountNum
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (amountNum >= owed) {
      toast.success(`${account.full_name}'s tab is fully settled!`);
    } else {
      toast.success(`Payment of $${amountNum.toFixed(2)} recorded`);
    }
    onDone();
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "fixed inset-0 z-50 flex items-end justify-center p-4 bg-black/70 backdrop-blur-sm", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "w-full max-w-md rounded-3xl border border-border shadow-2xl overflow-hidden max-h-[90vh] flex flex-col", style: {
    background: "var(--gradient-card)"
  }, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-5 pt-5 pb-4 shrink-0", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-xl font-black", children: account.full_name }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-muted-foreground", children: "Record payment toward balance" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => onOpenBill?.(account), disabled: printing, className: "flex items-center gap-1.5 px-3 h-9 rounded-xl font-bold text-xs transition active:scale-95 disabled:opacity-50", style: printed ? {
          background: "#16a34a",
          color: "#fff",
          border: "1px solid #16a34a"
        } : {
          background: "rgba(251,146,60,0.15)",
          color: "var(--primary)",
          border: "1px solid rgba(251,146,60,0.3)"
        }, children: printed ? "Done" : "Bill" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: onClose, className: "h-9 w-9 rounded-full flex items-center justify-center bg-muted hover:bg-muted/80 transition", children: /* @__PURE__ */ jsxRuntimeExports.jsx(X, { className: "h-4 w-4" }) })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "px-5 pb-5 space-y-4 overflow-y-auto flex-1", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-2xl p-4 text-center", style: {
        background: "var(--gradient-hero)"
      }, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-semibold text-primary-foreground/70 uppercase tracking-widest", children: "Balance Owed" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-4xl font-black text-primary-foreground", children: [
          "$",
          owed.toFixed(2)
        ] })
      ] }),
      charges.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-black text-muted-foreground uppercase tracking-wider", children: "Charges" }),
        charges.map((c) => {
          const itemsArr = Array.isArray(c.items) ? c.items : [];
          const isDeleteConfirm = deleteConfirmId === c.id;
          const hasCostData = itemsArr.some((i) => (i.cost_price ?? 0) > 0);
          const chargeCost = itemsArr.reduce((s, i) => s + (i.cost_price ?? 0) * (i.qty ?? 1), 0);
          const chargeProfit = Number(c.amount) - chargeCost;
          return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-xl border border-border overflow-hidden", style: {
            background: "oklch(0.20 0.04 45 / 0.30)"
          }, children: [
            isDeleteConfirm ? (
              /* ── Delete confirm ── */
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "px-3 py-3 space-y-2", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-semibold text-center text-red-400", children: "Delete this charge and restore stock/wallet?" }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-2", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => setDeleteConfirmId(null), className: "h-9 rounded-xl font-black text-xs border border-border transition active:scale-95", children: "Cancel" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => {
                    setDeleteConfirmId(null);
                    deleteCharge(c.id);
                  }, disabled: !!deletingId, className: "h-9 rounded-xl font-black text-xs text-white flex items-center justify-center transition active:scale-95 disabled:opacity-50", style: {
                    background: "#dc2626"
                  }, children: deletingId === c.id ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-3.5 w-3.5 animate-spin" }) : "Delete" })
                ] })
              ] })
            ) : (
              /* ── Normal view ── */
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start gap-2 px-3 pt-2.5 pb-1.5", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 min-w-0", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-muted-foreground", children: new Date(c.created_at).toLocaleString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: true
                  }) }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 mt-0.5", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-sm font-black", style: {
                      color: "var(--primary)"
                    }, children: [
                      "+$",
                      Number(c.amount).toFixed(2)
                    ] }),
                    hasCostData && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs text-muted-foreground", children: [
                        "cost $",
                        chargeCost.toFixed(2)
                      ] }),
                      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs font-bold", style: {
                        color: chargeProfit >= 0 ? "#86efac" : "#f87171"
                      }, children: [
                        "profit $",
                        chargeProfit.toFixed(2)
                      ] })
                    ] })
                  ] })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1.5 shrink-0 mt-0.5", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => onOpenBill?.(account, c.id), className: "h-8 w-8 rounded-full flex items-center justify-center bg-blue-500/20 active:scale-95 transition", title: "Print bill", children: /* @__PURE__ */ jsxRuntimeExports.jsx(FileDown, { className: "h-3.5 w-3.5 text-blue-300" }) }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => setDeleteConfirmId(c.id), disabled: !!deletingId, className: "h-8 w-8 rounded-full flex items-center justify-center bg-red-600 active:scale-95 transition disabled:opacity-50", title: "Delete charge", children: deletingId === c.id ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-3.5 w-3.5 text-white animate-spin" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(Trash2, { className: "h-3.5 w-3.5 text-white" }) })
                ] })
              ] })
            ),
            !isDeleteConfirm && itemsArr.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "border-t border-border/40 px-3 pb-2 pt-1.5 space-y-1", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-[1fr_auto_auto_auto] gap-x-3 text-[10px] font-black text-muted-foreground uppercase tracking-wide mb-1", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Item" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-right", children: "SP" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-right", children: "CP" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-right", children: "Profit" })
              ] }),
              itemsArr.map((it, idx) => {
                const sp = Number(it.price ?? 0) * (it.qty ?? 1);
                const cp = Number(it.cost_price ?? 0) * (it.qty ?? 1);
                const profit = sp - cp;
                const hasCP = (it.cost_price ?? 0) > 0;
                return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-[1fr_auto_auto_auto] gap-x-3 items-baseline", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs text-foreground font-semibold truncate", children: [
                    it.qty > 1 ? `${it.qty}× ` : "",
                    it.name
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs font-black text-right", style: {
                    color: "var(--primary)"
                  }, children: [
                    "$",
                    sp.toFixed(2)
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-right text-muted-foreground", children: hasCP ? `$${cp.toFixed(2)}` : "—" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-bold text-right", style: {
                    color: hasCP ? profit >= 0 ? "#86efac" : "#f87171" : "var(--muted-foreground)"
                  }, children: hasCP ? `$${profit.toFixed(2)}` : "—" })
                ] }, idx);
              })
            ] })
          ] }, c.id);
        })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { htmlFor: "pay-amount", children: "Amount Paying" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative mt-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(DollarSign, { className: "absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { id: "pay-amount", type: "number", min: "0.01", step: "0.01", className: "pl-8 text-xl font-black h-14", value: amount, onChange: (e) => setAmount(e.target.value), placeholder: "0.00" })
        ] }),
        tooMuch && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-destructive text-sm font-semibold mt-1.5", children: [
          "Cannot exceed balance owed ($",
          owed.toFixed(2),
          ")"
        ] }),
        valid && amountNum < owed && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-muted-foreground text-xs mt-1.5", children: [
          "Remaining after payment: $",
          (owed - amountNum).toFixed(2)
        ] }),
        valid && amountNum >= owed && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-green-500 text-sm font-semibold mt-1.5 flex items-center gap-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { className: "h-4 w-4" }),
          " Fully settles this account"
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "outline", className: "flex-1 h-12", onClick: onClose, children: "Cancel" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { className: "flex-1 h-12 font-black text-base", disabled: !valid || busy, onClick: submit, style: {
          background: "var(--gradient-hero)",
          color: "var(--primary-foreground)"
        }, children: busy ? "Saving…" : "Confirm Payment" })
      ] })
    ] })
  ] }) });
}
function Spinner() {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex justify-center py-12", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-7 w-7 rounded-full border-2 border-primary border-t-transparent animate-spin" }) });
}
function CreditContactPad({
  value,
  onChange,
  onDone
}) {
  const digits = value.replace("-", "");
  const complete = digits.length === 7;
  const handle = (k) => {
    if (k === "⌫") {
      const d = value.replace("-", "").slice(0, -1);
      onChange(d.length > 3 ? d.slice(0, 3) + "-" + d.slice(3) : d);
    } else if (k === "done") {
      if (complete) onDone();
    } else {
      const d = (value.replace("-", "") + k).slice(0, 7);
      onChange(d.length > 3 ? d.slice(0, 3) + "-" + d.slice(3) : d);
    }
  };
  const handleRef = reactExports.useRef(handle);
  handleRef.current = handle;
  reactExports.useEffect(() => {
    const onKey = (e) => {
      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        handleRef.current(e.key);
      } else if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        handleRef.current("⌫");
      } else if (e.key === "Enter") {
        e.preventDefault();
        handleRef.current("done");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [value, onChange, onDone]);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-2", children: [
    !complete && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-xs font-semibold text-amber-400 mb-1.5 text-center", children: [
      7 - digits.length,
      " digit",
      7 - digits.length !== 1 ? "s" : "",
      " remaining"
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-cols-3 gap-1.5", children: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "done", "0", "⌫"].map((k) => k === "done" ? /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: () => {
      if (complete) onDone();
    }, className: `h-12 rounded-xl font-black text-sm transition text-primary-foreground ${complete ? "active:scale-95" : "opacity-30 cursor-not-allowed"}`, style: {
      background: "var(--gradient-hero)"
    }, children: "Done" }, "done") : /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: () => handle(k), className: `h-12 rounded-xl font-black text-xl transition active:scale-95 ${k === "⌫" ? "bg-destructive/20 text-destructive" : "bg-muted text-foreground"}`, children: k }, k)) })
  ] });
}
function CreditIdPad({
  value,
  onChange,
  onDone
}) {
  const digits = value.replace("-", "");
  const complete = digits.length === 7;
  const handle = (k) => {
    if (k === "⌫") {
      const d = value.replace("-", "").slice(0, -1);
      onChange(d.length > 3 ? d.slice(0, 3) + "-" + d.slice(3) : d);
    } else if (k === "done") {
      if (complete) onDone();
    } else {
      const d = (value.replace("-", "") + k).slice(0, 7);
      onChange(d.length > 3 ? d.slice(0, 3) + "-" + d.slice(3) : d);
    }
  };
  const handleRef = reactExports.useRef(handle);
  handleRef.current = handle;
  reactExports.useEffect(() => {
    const onKey = (e) => {
      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        handleRef.current(e.key);
      } else if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        handleRef.current("⌫");
      } else if (e.key === "Enter") {
        e.preventDefault();
        handleRef.current("done");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [value, onChange, onDone]);
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-2", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-cols-3 gap-1.5", children: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "done", "0", "⌫"].map((k) => k === "done" ? /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: () => {
    if (complete) onDone();
  }, className: `h-12 rounded-xl font-black text-sm transition text-primary-foreground ${complete ? "active:scale-95" : "opacity-30 cursor-not-allowed"}`, style: {
    background: "var(--gradient-hero)"
  }, children: "Done" }, "done") : /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: () => handle(k), className: `h-12 rounded-xl font-black text-xl transition active:scale-95 ${k === "⌫" ? "bg-destructive/20 text-destructive" : "bg-muted text-foreground"}`, children: k }, k)) }) });
}
export {
  CreditPage as component
};
