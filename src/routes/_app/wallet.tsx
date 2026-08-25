import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useChain } from "@/lib/ChainContext";
import { useTranslation } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import {
  Wallet as WalletIcon,
  Receipt,
  ChevronLeft,
  ChevronRight,
  ArrowDownLeft,
  RotateCcw,
  Loader2,
  FileText,
  Download,
  X,
  TrendingUp,
  TrendingDown,
  DollarSign,
  ChevronDown,
  BarChart3,
  List,
  Trash2,
  Pencil,
  Printer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { downloadPdf } from "@/lib/download";
import { drawHeader, addFootersToAllPages, LM, RM, CONTENT_BOTTOM } from "@/lib/pdfHelpers";
import { printReceipt, pairPrinter, isPrinterPaired, type ReceiptData } from "@/lib/receiptPrinter";

// ─── Typed supabase helpers for new tables ────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

// ─── Types ────────────────────────────────────────────────────────────────────
type Order = {
  id: string;
  total: number;
  paid: number;
  change_given: number;
  discount_amount?: number;
  original_total?: number;
  items: { name: string; qty: number; price: number; discount?: number; original_price?: number }[];
  created_at: string;
  payment_method?: string | null;
  cashier_id?: string | null;
  owner_id?: string | null;
  order_number?: number | null;
};

type WalletTx = {
  id: string;
  amount: number;
  type: string;
  note: string | null;
  order_id?: string | null;
  credit_tx_id?: string | null;
  created_at: string;
};

type OwnerFinancials = {
  id: string;
  initial_expense: number;
  updated_at?: string;
};

type OwnerExpense = {
  id: string;
  amount: number;
  description: string | null;
  expense_date: string;
  created_at: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────
const TX_PAGE_SIZE = 100;
const ORDERS_PAGE_SIZE = 200;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmt(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function monthKey(date: string) {
  // Use Trinidad timezone so accordion grouping matches the displayed date
  const d = new Date(date);
  const tt = d.toLocaleDateString("en-CA", { timeZone: "America/Port_of_Spain" }); // YYYY-MM-DD
  return tt.slice(0, 7); // YYYY-MM
}
function monthLabel(key: string) {
  const [y, m] = key.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "long",
  });
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// ─── Pagination Bar ──────────────────────────────────────────────────────────
function PaginationBar({
  page,
  totalPages,
  total,
  pageCount,
  onPrev,
  onNext,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageCount?: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  if (total <= 100) return null;
  return (
    <div
      className="flex flex-col gap-1 rounded-xl px-3 py-2.5 border border-border"
      style={{ background: "var(--gradient-card)" }}
    >
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          className="h-9 font-bold"
          disabled={page === 0}
          onClick={onPrev}
        >
          <ChevronLeft className="h-4 w-4 mr-1" /> Prev
        </Button>
        <span className="text-sm font-semibold text-muted-foreground">
          Page {page + 1} of {totalPages} ·{" "}
          <span className="text-foreground font-black">{total}</span> records
        </span>
        <Button
          variant="outline"
          size="sm"
          className="h-9 font-bold"
          disabled={page >= totalPages - 1}
          onClick={onNext}
        >
          Next <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
      {pageCount !== undefined && (
        <p className="text-center text-xs text-muted-foreground">
          Showing <span className="font-black text-foreground">{pageCount}</span> records on this
          page
        </p>
      )}
    </div>
  );
}

// ─── Cashier Wallet ───────────────────────────────────────────────────────────
// ── ExpenseRow — shared row renderer for cashier expense history ──────────────
function ExpenseRow({ expense: e }: { expense: OwnerExpense }) {
  const raw = (e.description ?? "").replace(/\[Cashier:[^\]]+\]\s*$/, "").trim();
  const isReverted = raw.startsWith("Reverted Stock Expense");
  const isBulk =
    raw.startsWith("Bulk Expense") || raw.startsWith("Non-Stock Expense") || isReverted;
  const amt = Number(e.amount);
  const isRefund = amt < 0;
  const dateStr = new Date(e.created_at).toLocaleString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "America/Port_of_Spain",
  });

  if (isBulk) {
    const lines = raw.split("\n").filter(Boolean);
    const title = lines[0];
    const itemLines = lines.slice(1);
    return (
      <div className="px-4 py-3" style={isRefund ? { background: "rgba(134,239,172,0.04)" } : {}}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="font-black text-sm" style={isRefund ? { color: "#86efac" } : {}}>
              {title}
            </div>
            <div className="mt-1 space-y-0.5">
              {itemLines.map((line, li) => {
                const eqIdx = line.lastIndexOf(" = ");
                const left = eqIdx !== -1 ? line.slice(0, eqIdx) : line;
                const right = eqIdx !== -1 ? line.slice(eqIdx + 3) : null;
                if (left.startsWith("[Cashier:")) return null;
                return (
                  <div key={li} className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground flex-1">{left}</span>
                    {right && (
                      <span
                        className="text-xs font-black shrink-0"
                        style={{ color: isRefund ? "#86efac" : "#f9a8d4" }}
                      >
                        {right}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="text-xs text-muted-foreground mt-1">{dateStr}</div>
          </div>
          <div
            className="shrink-0 font-black text-sm"
            style={{ color: isRefund ? "#86efac" : "#f9a8d4" }}
          >
            {isRefund
              ? `+$${Number(Math.abs(amt)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : `-$${amt.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="px-4 py-3 flex items-center justify-between gap-3"
      style={isRefund ? { background: "rgba(134,239,172,0.04)" } : {}}
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold break-words" style={isRefund ? { color: "#86efac" } : {}}>
          {raw || "Expense"}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">{dateStr}</div>
      </div>
      <div
        className="shrink-0 font-black text-sm"
        style={{ color: isRefund ? "#86efac" : "#f9a8d4" }}
      >
        {isRefund
          ? `+$${Math.abs(amt).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          : `-$${amt.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
      </div>
    </div>
  );
}

function CashierWallet({
  profile,
}: {
  profile: {
    id: string;
    wallet_balance: number;
    role: string;
    username?: string;
    parent_id?: string | null;
    cashier_shift_start?: string;
  };
}) {
  const { t } = useTranslation();
  const { refreshProfile } = useAuth();
  const [cashierTab, setCashierTab] = useState<"sales" | "expenses">("sales");
  const [orders, setOrders] = useState<Order[]>([]);
  const [txs, setTxs] = useState<WalletTx[]>([]);
  const [page, setPage] = useState(0);
  const [totalOrders, setTotalOrders] = useState(0);
  const [totalTxs, setTotalTxs] = useState(0);
  const [loading, setLoading] = useState(true);
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);
  const [deletableOrderId, setDeletableOrderId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [billData, setBillData] = useState<BillData | null>(null);
  const [printingBill, setPrintingBill] = useState(false);
  const [ownerName, setOwnerName] = useState<string>("");
  const nav = useNavigate();

  const ownerId = profile.parent_id ?? profile.id;

  // Load owner's username once as the store name for receipts
  useEffect(() => {
    if (!ownerId || ownerId === profile.id) return;
    sb.from("profiles").select("username").eq("id", ownerId).single()
      .then(({ data }: any) => { if (data?.username) setOwnerName(data.username); });
  }, [ownerId]);

  const handleConfirmEdit = (order: Order) => {
    sessionStorage.setItem("edit_order", JSON.stringify(order));
    nav("/register");
  };

  const handlePrintBill = async () => {
    if (!billData) return;
    setPrintingBill(true);
    try {
      await printReceipt(billData);
      toast.success("Receipt sent to printer");
    } catch {
      toast.error("Print failed");
    } finally {
      setPrintingBill(false);
    }
  };

  const handlePdfShare = async () => {
    if (!billData) return;
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "mm", format: "a4" });
      const y = 20;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text(billData.storeName || "My Business", LM, y);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(billData.date, LM, y + 6);
      doc.text("ORDER #" + billData.orderNumber, LM, y + 12);
      doc.setFontSize(10);
      let cy = y + 20;
      billData.items.forEach((it) => {
        doc.text(`${it.qty}x ${it.name}   $${(it.qty * it.price).toFixed(2)}`, LM, cy);
        cy += 6;
      });
      cy += 4;
      doc.setFont("helvetica", "bold");
      doc.text(`Total: $${billData.total.toFixed(2)}`, LM, cy); cy += 6;
      doc.setFont("helvetica", "normal");
      doc.text(`Paid: $${billData.paid.toFixed(2)}`, LM, cy); cy += 6;
      doc.text(`Change: $${billData.change.toFixed(2)}`, LM, cy);
      if (billData.customerName) {
        cy += 6;
        doc.text(`Customer: ${billData.customerName}`, LM, cy);
      }
      const filename = `receipt-${billData.orderNumber}.pdf`;
      const dataUri = doc.output("datauristring");
      await downloadPdf(filename, dataUri);
      toast.success("Receipt PDF downloaded");

      const text = `Receipt: ${billData.storeName}\nORDER #${billData.orderNumber}\nDate: ${billData.date}\nTotal: $${billData.total.toFixed(2)}\nPaid: $${billData.paid.toFixed(2)}\nChange: $${billData.change.toFixed(2)}${billData.customerName ? "\nCustomer: " + billData.customerName : ""}`;
      const waUrl = "https://wa.me/?text=" + encodeURIComponent(text);
      window.open(waUrl, "_blank");
    } catch (e) {
      toast.error("Failed to generate PDF");
    }
  };

  const openBillForOrder = async (order: Order) => {
    const parts = (order as any).note_parts ?? [];
    const customerName = parts.find((p: string) => p.startsWith("Customer:"))?.replace("Customer: ", "");
    const bill: BillData = {
      storeName: ownerName || profile.username || "Bar",
      orderNumber: order.payment_method === "credit" ? "CREDIT" : String((order as any).order_number ?? order.id.slice(0, 8)),
      date: new Date(order.created_at).toLocaleString("en-US", {
        month: "numeric", day: "numeric", year: "numeric",
        hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true,
      }),
      items: (order.items || []).map((i) => ({ name: i.name, qty: i.qty, price: Number(i.price) })),
      subtotal: Number(order.total),
      total: Number(order.total),
      paid: Number(order.paid),
      change: Number(order.change_given),
      payMode: order.payment_method === "credit" ? "credit" : "cash",
      customerName: customerName || undefined,
      serverName: profile.username || "Staff",
    };
    setBillData(bill);
  };

  const openBillForCreditTx = async (tx: WalletTx) => {
    const ctid = tx.credit_tx_id;
    if (!ctid) {
      toast.error("No credit record linked");
      return;
    }
    const { data: ct } = await sb
      .from("credit_transactions")
      .select("id, credit_account_id, amount, items, created_at")
      .eq("id", ctid)
      .maybeSingle();
    if (!ct) {
      toast.error("Could not load credit sale");
      return;
    }
    const { data: acct } = await sb
      .from("credit_accounts")
      .select("full_name")
      .eq("id", ct.credit_account_id)
      .maybeSingle();
    const items = (ct.items ?? []) as { name: string; qty: number; price: number }[];
    const bill: BillData = {
      storeName: ownerName || profile.username || "Bar",
      orderNumber: "CREDIT",
      date: new Date(ct.created_at).toLocaleString("en-US", {
        month: "numeric", day: "numeric", year: "numeric",
        hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true,
      }),
      items: items.map((i) => ({ name: i.name, qty: i.qty, price: Number(i.price) })),
      subtotal: Number(ct.amount),
      total: Number(ct.amount),
      paid: Number(ct.amount),
      change: 0,
      payMode: "credit",
      customerName: acct?.full_name || undefined,
      serverName: profile.username || "Staff",
    };
    setBillData(bill);
  };

  // ── Float cards state ────────────────────────────────────────────────────────
  const [floatRemaining, setFloatRemaining] = useState<number | null>(null);
  const [floatSet, setFloatSet] = useState<number | null>(null);
  const [floatSetAt, setFloatSetAt] = useState<string | null>(null);

  // Load original float (from latest sub-session) + live remaining (cashier_float)
  const loadFloat = useCallback(async () => {
    const { data: ownerData } = await sb
      .from("profiles")
      .select("cashier_float, cashier_float_set_at")
      .eq("id", ownerId)
      .single();

    const remaining = Number(ownerData?.cashier_float ?? 0);
    const since: string | null = ownerData?.cashier_float_set_at ?? null;

    setFloatRemaining(remaining > 0 ? remaining : null);
    setFloatSetAt(since);

    let original = remaining;
    if (since) {
      const { data: lastSubSession } = await sb
        .from("bar_sub_sessions")
        .select("cashier_float")
        .eq("owner_id", ownerId)
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      original = Number(lastSubSession?.cashier_float ?? remaining);
    }
    setFloatSet(original > 0 ? original : null);
  }, [ownerId]);

  useEffect(() => {
    loadFloat();
  }, [loadFloat]);

  // Stable ref so realtime callbacks don't re-create the channel
  const loadFloatRef = useRef(loadFloat);
  useEffect(() => {
    loadFloatRef.current = loadFloat;
  }, [loadFloat]);

  // Stable ref for expense list realtime refresh
  const loadCashierExpensesRef = useRef<() => void>(() => {});

  // Realtime — watch owner profile for float changes + own expense txs + owner expenses
  useEffect(() => {
    const ch = supabase
      .channel(`cashier-float-${profile.id}`)
      // Owner updates cashier_float or cashier_float_set_at → reload everything
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${ownerId}` },
        () => loadFloatRef.current(),
      )
      // Cashier logs an expense → reload float + expense list
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "wallet_transactions",
          filter: `profile_id=eq.${profile.id}`,
        },
        () => {
          loadFloatRef.current();
          loadCashierExpensesRef.current();
        },
      )
      // Manager adds expense (owner_expenses) → float changes + expense list → reload both
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "owner_expenses",
          filter: `owner_id=eq.${ownerId}`,
        },
        () => {
          loadFloatRef.current();
          loadCashierExpensesRef.current();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
   }, [profile.id, ownerId]);

  const totalRecords = totalOrders + totalTxs;
  const totalPages = Math.max(1, Math.ceil(totalRecords / ORDERS_PAGE_SIZE));

  const handlePrev = () => {
    setPage((p) => p - 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const handleNext = () => {
    setPage((p) => p + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Resolve which order (if any) qualifies for the delete button.
  // Rules:
  //   1. Must be the most recent order for this cashier.
  //   2. Must have been created no more than 2 seconds before the last delete
  //      — if the record is older than 2s before the delete, it's a different sale, no button.
  const resolveDeletable = async (newestOrder: Order | null) => {
    if (!newestOrder) {
      setDeletableOrderId(null);
      return;
    }

    // Hide delete button if order is older than 1 hour
    if (Date.now() - new Date(newestOrder.created_at).getTime() > 60 * 60 * 1000) {
      setDeletableOrderId(null);
      return;
    }

    // Block delete if a wallet clear (transfer_out) happened after this order was created.
    // That means the sale's money already moved to the owner — deleting would cause a negative balance.
    const { data: clearData } = await supabase
      .from("wallet_transactions")
      .select("created_at")
      .eq("profile_id", profile.id)
      .eq("type", "transfer_out")
      .gt("created_at", newestOrder.created_at)
      .limit(1)
      .maybeSingle();

    if (clearData) {
      setDeletableOrderId(null);
      return;
    }

    const { data } = await (supabase as any)
      .from("cashier_last_delete")
      .select("deleted_at")
      .eq("cashier_id", profile.id)
      .maybeSingle();

    if ((data as any)?.deleted_at) {
      const orderTime = new Date(newestOrder.created_at).getTime();
      const deletedTime = new Date((data as any).deleted_at).getTime();
      // Hide button if order is older than 2 seconds before the last delete
      if (orderTime < deletedTime - 2000) {
        setDeletableOrderId(null);
        return;
      }
    }

    setDeletableOrderId(newestOrder.id);
  };

  useEffect(() => {
    setLoading(true);
    const txCountQ = supabase
      .from("wallet_transactions")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", profile.id)
      .in("type", [
        "transfer_in",
        "transfer_out",
        "bottle_finished",
        "pack_finished",
        "credit_payment",
        "credit_charge",
      ]);
    if (profile.cashier_shift_start) txCountQ.gte("created_at", profile.cashier_shift_start);

    const txDataQ = supabase
      .from("wallet_transactions")
      .select("*")
      .eq("profile_id", profile.id)
      .in("type", [
        "transfer_in",
        "transfer_out",
        "bottle_finished",
        "pack_finished",
        "credit_payment",
        "credit_charge",
      ]);
    if (profile.cashier_shift_start) txDataQ.gte("created_at", profile.cashier_shift_start);

    Promise.all([
      supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("cashier_id", profile.id)
        .then(({ count }) => setTotalOrders(count ?? 0)),
      supabase
        .from("orders")
        .select("*")
        .eq("cashier_id", profile.id)
        .order("created_at", { ascending: false })
        .range(page * ORDERS_PAGE_SIZE, page * ORDERS_PAGE_SIZE + ORDERS_PAGE_SIZE - 1)
        .then(({ data }) => {
          const o = (data ?? []) as unknown as Order[];
          setOrders(o);
          resolveDeletable(o[0] ?? null);
        }),
      txCountQ.then(({ count }) => setTotalTxs(count ?? 0)),
      txDataQ
        .order("created_at", { ascending: false })
        .range(page * ORDERS_PAGE_SIZE, page * ORDERS_PAGE_SIZE + ORDERS_PAGE_SIZE - 1)
        .then(({ data }) => setTxs((data ?? []) as WalletTx[])),
    ]).finally(() => setLoading(false));
  }, [profile.id, page, profile.cashier_shift_start]); // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime — stable channel
  const fetchRef = useRef<() => void>(() => {});
  useEffect(() => {
    fetchRef.current = () => {
      setLoading(true);
      const txQ = supabase
        .from("wallet_transactions")
        .select("id", { count: "exact", head: true })
        .eq("profile_id", profile.id)
        .in("type", [
          "transfer_in",
          "transfer_out",
          "bottle_finished",
          "pack_finished",
          "credit_payment",
          "credit_charge",
        ]);
      if (profile.cashier_shift_start) txQ.gte("created_at", profile.cashier_shift_start);

      const txDataQ = supabase
        .from("wallet_transactions")
        .select("*")
        .eq("profile_id", profile.id)
        .in("type", [
          "transfer_in",
          "transfer_out",
          "bottle_finished",
          "pack_finished",
          "credit_payment",
          "credit_charge",
        ]);
      if (profile.cashier_shift_start) txDataQ.gte("created_at", profile.cashier_shift_start);

      Promise.all([
        supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("cashier_id", profile.id)
          .then(({ count }) => setTotalOrders(count ?? 0)),
        supabase
          .from("orders")
          .select("*")
          .eq("cashier_id", profile.id)
          .order("created_at", { ascending: false })
          .range(page * ORDERS_PAGE_SIZE, page * ORDERS_PAGE_SIZE + ORDERS_PAGE_SIZE - 1)
          .then(({ data }) => {
            const o = (data ?? []) as unknown as Order[];
            setOrders(o);
            resolveDeletable(o[0] ?? null);
          }),
        txQ.then(({ count }) => setTotalTxs(count ?? 0)),
        txDataQ
          .order("created_at", { ascending: false })
          .range(page * ORDERS_PAGE_SIZE, page * ORDERS_PAGE_SIZE + ORDERS_PAGE_SIZE - 1)
          .then(({ data }) => setTxs((data ?? []) as WalletTx[])),
      ]).finally(() => setLoading(false));
    };
  }); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const ch = supabase
      .channel(`cashier-wallet-${profile.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `cashier_id=eq.${profile.id}` },
        () => fetchRef.current(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "wallet_transactions",
          filter: `profile_id=eq.${profile.id}`,
        },
        () => fetchRef.current(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [profile.id]);

  const deleteLatestCashierOrder = async (order: Order) => {
    setDeletableOrderId(null);
    setDeletingOrderId(order.id);

    const items = Array.isArray(order.items) ? order.items : [];

    const hasShotOrPack = items.some(
      (i: any) => i.id?.startsWith("shot-") || i.id?.startsWith("pack-"),
    );
    if (hasShotOrPack) {
      await (supabase as any).rpc("reverse_order_shot_pack", { p_items: items });
    }

    const restorableItems = items.filter(
      (i: any) => !i.id?.startsWith("shot-") && !i.id?.startsWith("pack-"),
    );
    if (restorableItems.length > 0) {
      await supabase.rpc("restore_stock_item", {
        p_items: restorableItems.map((i: any) => ({ id: i.id, qty: i.qty })),
      });
    }

    const itemDesc = items.map((i: any) => `${i.qty || 1}x ${i.name} = $${Number(i.price).toFixed(2)}`).join("\n");
    const description = `Reverted Stock Expense\n${itemDesc}\nTotal: $${Number(order.total).toFixed(2)}`;
    await (supabase as any).from("owner_expenses").insert({ owner_id: order.owner_id, amount: Number(order.total), description, expense_date: new Date().toISOString().slice(0, 10) });

    // Delete ALL wallet_transactions for this order (cashier 'sale' row + owner 'cashier_sale' row)
    // The DB trigger (migration 20260628000003) also does this server-side once applied.
    await supabase.from("wallet_transactions").delete().eq("order_id", order.id);

    const { error } = await supabase.from("orders").delete().eq("id", order.id);
    setDeletingOrderId(null);
    if (error) {
      toast.error(error.message);
      return;
    }

    // Persist delete timestamp in DB — survives refresh, prevents button jumping
    await (supabase as any)
      .from("cashier_last_delete")
      .upsert(
        { cashier_id: profile.id, deleted_at: new Date().toISOString() },
        { onConflict: "cashier_id" },
      );

    toast.success("Sale deleted — stock restored");
    setTimeout(() => refreshProfile(), 800);
    fetchRef.current();
  };

  // -- Cashier Expenses state
  const [cashierExpenses, setCashierExpenses] = useState<OwnerExpense[]>([]);
  const [loadingExpenses, setLoadingExpenses] = useState(false);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [expenseLines, setExpenseLines] = useState<{ description: string; amount: string }[]>([
    { description: "", amount: "" },
  ]);
  const [savingExpense, setSavingExpense] = useState(false);
  const [confirmingExpense, setConfirmingExpense] = useState(false);
  const [openExpenseMonth, setOpenExpenseMonth] = useState<string | null>(null);
  const [openExpenseSession, setOpenExpenseSession] = useState<string | null>(null);

  // Edit / delete for cashier's own last expense
  const [cashierExpenseEditId, setCashierExpenseEditId] = useState<string | null>(null);
  const [cashierExpenseEditLines, setCashierExpenseEditLines] = useState<{ description: string; amount: string }[]>([]);
  const [cashierExpenseEditSaving, setCashierExpenseEditSaving] = useState(false);
  const [cashierExpenseDeleteId, setCashierExpenseDeleteId] = useState<string | null>(null);
  const [cashierExpenseDeleting, setCashierExpenseDeleting] = useState(false);

  // Bar sessions for expense grouping + date filter
  const [barSessions, setBarSessions] = useState<
    { id: string; session_start: string; session_end: string | null }[]
  >([]);
  const [activeBarSession, setActiveBarSession] = useState<{
    start: string;
    end: string | null;
  } | null>(null);
  const [expenseDateFilter, setExpenseDateFilter] = useState<
    "session" | "day" | "week" | "month" | "all"
  >("session");

  const loadBarSessions = useCallback(async () => {
    const { data: profileData } = await sb
      .from("profiles")
      .select("bar_session_start, bar_closed_at")
      .eq("id", ownerId)
      .single();
    const sessionStart: string | null = profileData?.bar_session_start ?? null;
    const closedAt: string | null = profileData?.bar_closed_at ?? null;
    setActiveBarSession(sessionStart ? { start: sessionStart, end: closedAt } : null);

    const { data: hist } = await sb
      .from("bar_sessions")
      .select("id, opened_at, closed_at")
      .eq("owner_id", ownerId)
      .order("opened_at", { ascending: false })
      .limit(30);
    const all: { id: string; session_start: string; session_end: string | null }[] = [];
    if (sessionStart)
      all.push({ id: "active", session_start: sessionStart, session_end: closedAt });
    // Exclude the currently-open session from history — it's already added above as "active"
    (hist ?? []).forEach((s: any) => {
      if (sessionStart && s.opened_at === sessionStart) return; // skip duplicate
      all.push({ id: s.id, session_start: s.opened_at, session_end: s.closed_at });
    });
    setBarSessions(all);
  }, [ownerId]);

  useEffect(() => {
    loadBarSessions();
  }, [loadBarSessions]);

  const addExpenseLine = () => setExpenseLines((l) => [...l, { description: "", amount: "" }]);
  const removeExpenseLine = (i: number) => setExpenseLines((l) => l.filter((_, idx) => idx !== i));
  const updateExpenseLine = (i: number, field: "description" | "amount", val: string) =>
    setExpenseLines((l) => l.map((line, idx) => (idx === i ? { ...line, [field]: val } : line)));

  const loadCashierExpenses = useCallback(async () => {
    setLoadingExpenses(true);
    let query = sb
      .from("owner_expenses")
      .select("*")
      .eq("owner_id", ownerId)
      .ilike("description", `%[Cashier: ${profile.username ?? profile.id}]%`);
    if (profile.cashier_shift_start) query = query.gte("created_at", profile.cashier_shift_start);
    const { data } = await query.order("created_at", { ascending: false });
    setCashierExpenses((data ?? []) as OwnerExpense[]);
    setLoadingExpenses(false);
  }, [ownerId, profile.id, profile.username, profile.cashier_shift_start]);

  // Keep the realtime ref in sync
  useEffect(() => {
    loadCashierExpensesRef.current = loadCashierExpenses;
  }, [loadCashierExpenses]);

  useEffect(() => {
    if (cashierTab === "expenses") loadCashierExpenses();
  }, [cashierTab, loadCashierExpenses]);

  // -- Edit cashier's own last expense ----------------------------------------
  const startCashierExpenseEdit = (e: OwnerExpense) => {
    const cashierTag = `[Cashier: ${profile.username ?? profile.id}]`;
    const raw = (e.description ?? "").replace(cashierTag, "").trim();
    const parsed = raw
      .split("\n")
      .filter((l) => l && l !== "Non-Stock Expense")
      .map((l) => {
        const match = l.match(/^(.+?)\s*=\s*\$?([\d.]+)$/);
        if (match) return { description: match[1].trim(), amount: match[2] };
        return { description: l.trim(), amount: String(e.amount) };
      });
    setCashierExpenseEditLines(parsed.length > 0 ? parsed : [{ description: "", amount: String(e.amount) }]);
    setCashierExpenseEditId(e.id);
  };

  const handleCashierExpenseEditSave = async (e: OwnerExpense) => {
    const valid = cashierExpenseEditLines.filter((l) => l.description.trim() && parseFloat(l.amount) > 0);
    if (!valid.length) { toast.error("Add at least one item with description and amount"); return; }
    setCashierExpenseEditSaving(true);
    const cashierTag = `[Cashier: ${profile.username ?? profile.id}]`;
    const newTotal = valid.reduce((s, l) => s + parseFloat(l.amount), 0);
    const description =
      valid.length === 1
        ? `Non-Stock Expense\n${valid[0].description.trim()} = $${parseFloat(valid[0].amount).toFixed(2)} ${cashierTag}`
        : `Non-Stock Expense\n${valid.map((l) => `${l.description.trim()} = $${parseFloat(l.amount).toFixed(2)}`).join("\n")}\n${cashierTag}`;
    const diff = newTotal - Number(e.amount);
    try {
      const { error: upErr } = await sb.from("owner_expenses").update({ amount: newTotal, description }).eq("id", e.id);
      if (upErr) { toast.error(upErr.message); return; }
      if (diff !== 0) {
        const { error: rpcErr } = await sb.rpc("add_cashier_expense", {
          _cashier_id: profile.id,
          _owner_id: ownerId,
          _amount: diff,
          _description: `Expense adjustment`,
          _expense_date: new Date().toLocaleDateString("en-CA", { timeZone: "America/Port_of_Spain" }),
        });
        if (rpcErr) { toast.error(rpcErr.message); return; }
      }
      toast.success("Expense updated");
      setCashierExpenseEditId(null);
      loadCashierExpenses();
      loadFloat();
    } finally {
      setCashierExpenseEditSaving(false);
    }
  };

  const handleCashierExpenseDelete = async (e: OwnerExpense) => {
    setCashierExpenseDeleting(true);
    try {
      const { error: delErr } = await sb.from("owner_expenses").delete().eq("id", e.id);
      if (delErr) { toast.error(delErr.message); return; }
      // Refund the amount back (reverse the deduction)
      const { error: rpcErr } = await sb.rpc("refund_cashier_expense", {
        _cashier_id: profile.id,
        _owner_id: ownerId,
        _amount: Number(e.amount),
      });
      if (rpcErr) { toast.error(rpcErr.message); return; }
      toast.success("Expense deleted — float refunded");
      setCashierExpenseDeleteId(null);
      loadCashierExpenses();
      loadFloat();
    } finally {
      setCashierExpenseDeleting(false);
    }
  };

  const handleSaveCashierExpense = async () => {
    const valid = expenseLines.filter((l) => l.description.trim() && parseFloat(l.amount) > 0);
    if (!valid.length) {
      toast.error("Add at least one item with a description and amount");
      return;
    }
    const total = valid.reduce((s, l) => s + parseFloat(l.amount), 0);
    const cashierName = profile.username ?? profile.id;
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Port_of_Spain" });

    let description: string;
    if (valid.length === 1) {
      description = `Non-Stock Expense\n${valid[0].description.trim()} = $${parseFloat(valid[0].amount).toFixed(2)} [Cashier: ${cashierName}]`;
    } else {
      description =
        "Non-Stock Expense\n" +
        valid
          .map((l) => `${l.description.trim()} = $${parseFloat(l.amount).toFixed(2)}`)
          .join("\n") +
        `\n[Cashier: ${cashierName}]`;
    }

    setSavingExpense(true);
    try {
      const { error } = await (supabase as any).rpc("add_cashier_expense", {
        _cashier_id: profile.id,
        _owner_id: ownerId,
        _amount: total,
        _description: description,
        _expense_date: today,
      });
      if (error) {
        toast.error(error.message);
        return;
      }

      const expenseNote =
        valid.length === 1
          ? `Expense: ${valid[0].description.trim()}`
          : `Bulk Expense (${valid.length} items)`;
      const walletCovers = Math.min(Number(profile.wallet_balance), total);
      const floatCovers = total - walletCovers;

      toast.success(
        walletCovers > 0 && floatCovers === 0
          ? `Expense saved — deducted $${fmt(total)} from wallet`
          : walletCovers > 0
            ? `Expense saved — $${fmt(walletCovers)} from wallet, $${fmt(floatCovers)} from float`
            : `Expense saved — deducted $${fmt(total)} from float`,
      );
      setExpenseLines([{ description: "", amount: "" }]);
      setShowAddExpense(false);
      setConfirmingExpense(false);
      loadCashierExpenses();
      refreshProfile();
      loadFloat();
    } finally {
      setSavingExpense(false);
    }
  };

  // Apply date filter to cashier expenses
  const tzNow = () =>
    new Date(new Date().toLocaleString("en-US", { timeZone: "America/Port_of_Spain" }));
  const todayTT = tzNow().toLocaleDateString("en-CA");

  const filteredCashierExpenses = (() => {
    if (expenseDateFilter === "all") return cashierExpenses;
    if (expenseDateFilter === "day") {
      return cashierExpenses.filter(
        (e) =>
          new Date(e.created_at).toLocaleDateString("en-CA", {
            timeZone: "America/Port_of_Spain",
          }) === todayTT,
      );
    }
    if (expenseDateFilter === "week") {
      const weekAgo = new Date(tzNow());
      weekAgo.setDate(weekAgo.getDate() - 7);
      return cashierExpenses.filter((e) => new Date(e.created_at) >= weekAgo);
    }
    if (expenseDateFilter === "month") {
      const monthAgo = new Date(tzNow());
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      return cashierExpenses.filter((e) => new Date(e.created_at) >= monthAgo);
    }
    if (expenseDateFilter === "session") {
      // Group into bar sessions — each session = session_start to session_end (or now if active)
      return cashierExpenses; // full list — we group by session below
    }
    return cashierExpenses;
  })();

  // Group filtered expenses into bar sessions
  const fmtSessionTs = (iso: string) => {
    const d = new Date(iso);
    return (
      d.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        timeZone: "America/Port_of_Spain",
      }) +
      " · " +
      d.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
        timeZone: "America/Port_of_Spain",
      })
    );
  };

  // Build session buckets: each bar session is a time window
  type ExpenseSession = { id: string; start: string; end: string | null; expenses: OwnerExpense[] };
  const expenseSessions: ExpenseSession[] = (() => {
    if (expenseDateFilter !== "session" || barSessions.length === 0) return [];
    return barSessions
      .map((s) => {
        const startMs = new Date(s.session_start).getTime();
        const endMs = s.session_end ? new Date(s.session_end).getTime() : Date.now();
        const inSession = filteredCashierExpenses.filter((e) => {
          const t = new Date(e.created_at).getTime();
          return t >= startMs && t <= endMs;
        });
        return { id: s.id, start: s.session_start, end: s.session_end, expenses: inSession };
      })
      .filter((s) => s.expenses.length > 0);
  })();

  // For non-session filters: still group by month for display
  const cashierExpensesByMonth: Record<string, OwnerExpense[]> = {};
  filteredCashierExpenses.forEach((e) => {
    const key = monthKey(e.expense_date);
    if (!cashierExpensesByMonth[key]) cashierExpensesByMonth[key] = [];
    cashierExpensesByMonth[key].push(e);
  });
  const cashierExpenseMonths = Object.keys(cashierExpensesByMonth).sort((a, b) =>
    b.localeCompare(a),
  );
  // Merge orders and txs into flat list sorted by date, capped at page size
  const flatRecords: Array<
    { kind: "order"; data: Order; ts: number } | { kind: "tx"; data: WalletTx; ts: number }
  > = [
    ...orders.map((o) => ({
      kind: "order" as const,
      data: o,
      ts: new Date(o.created_at).getTime(),
    })),
    ...txs.map((tx) => ({ kind: "tx" as const, data: tx, ts: new Date(tx.created_at).getTime() })),
  ]
    .sort((a, b) => b.ts - a.ts)
    .slice(0, ORDERS_PAGE_SIZE);

  const latestPaymentId = flatRecords.find(
    (r) => r.kind === "tx" && r.data.type === "credit_payment",
  )?.data.id ?? null;

  return (
    <div className="space-y-5">
      <div className="sticky top-0 z-20 -mx-3 px-3 pt-2 pb-2 bg-background/95 backdrop-blur border-b border-border">
        <h1 className="text-xl font-black leading-tight">{t("wallet", "Wallet")}</h1>
      </div>
      <section
        className="rounded-3xl p-6 relative overflow-hidden"
        style={{ background: "var(--gradient-hero)", boxShadow: "var(--shadow-glow)" }}
      >
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="relative">
          <div className="flex items-center gap-2 text-primary-foreground/80 text-sm font-medium">
            <WalletIcon className="h-4 w-4" /> Wallet Balance
          </div>
          <div className="text-4xl sm:text-6xl font-black text-primary-foreground mt-2 tracking-tight">
            ${fmt(Number(profile.wallet_balance))}
          </div>
          <div className="mt-3 text-primary-foreground/80 text-sm">Cashier — clears to owner</div>

          {/* Float cards — only shown when owner has set a float */}
          {floatSet !== null && (
            <div className="grid grid-cols-2 gap-2 mt-4">
              <div
                className="rounded-xl px-3 py-2.5 flex flex-col gap-0.5 text-center"
                style={{ background: "oklch(0.18 0.04 60)" }}
              >
                <div
                  className="text-[9px] sm:text-[11px] font-semibold uppercase tracking-wider"
                  style={{ color: "rgba(255,255,255,0.45)" }}
                >
                  Float
                </div>
                <div className="font-black text-xs" style={{ color: "#fbbf24" }}>
                  ${fmt(floatSet)}
                </div>
              </div>
              <div
                className="rounded-xl px-3 py-2.5 flex flex-col gap-0.5 text-center"
                style={{ background: "oklch(0.18 0.04 60)" }}
              >
                <div
                  className="text-[9px] sm:text-[11px] font-semibold uppercase tracking-wider"
                  style={{ color: "rgba(255,255,255,0.45)" }}
                >
                  Remaining
                </div>
                <div
                  className="font-black text-xs"
                  style={{
                    color:
                      floatRemaining !== null && floatRemaining > 0
                        ? "#86efac"
                        : "rgba(255,255,255,0.3)",
                  }}
                >
                  {floatRemaining !== null && floatRemaining > 0
                    ? `$${fmt(floatRemaining)}`
                    : "—"}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
      {/* ── Sales / Expenses Tabs ── */}
      <div className="rounded-2xl border border-border overflow-hidden">
        <div className="grid grid-cols-2">
          <button
            onClick={() => setCashierTab("sales")}
            className={`flex items-center justify-center gap-2 py-3 text-sm font-black transition ${
              cashierTab === "sales"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Receipt className="h-4 w-4" /> Sales
          </button>
          <button
            onClick={() => setCashierTab("expenses")}
            className={`flex items-center justify-center gap-2 py-3 text-sm font-black transition ${
              cashierTab === "expenses"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <TrendingDown className="h-4 w-4" /> Expenses
          </button>
        </div>
      </div>

      {cashierTab === "sales" && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-black text-xl">{t("records", "Records")}</h2>
            <span className="text-sm text-muted-foreground">{totalRecords} records</span>
          </div>
          <PaginationBar
            page={page}
            totalPages={totalPages}
            total={totalRecords}
            onPrev={handlePrev}
            onNext={handleNext}
          />
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-xl h-20 bg-muted/30 animate-pulse" />
              ))}
            </div>
          ) : flatRecords.length === 0 ? (
            <div className="text-muted-foreground text-sm py-8 text-center">No records yet.</div>
          ) : (
            <div className="space-y-2">
              {flatRecords.map((rec) => {
                if (rec.kind === "tx") {
                  const tx = rec.data;
                  const isTransferIn = tx.type === "transfer_in";
                  const isTransferOut = tx.type === "transfer_out";
                  const isBottlePack = tx.type === "bottle_finished" || tx.type === "pack_finished";
                  const isCreditPay = tx.type === "credit_payment";
                  const isCreditCharge = tx.type === "credit_charge";
                  const isCashierExpense = tx.type === "cashier_expense";

                  if (isCashierExpense) {
                    return (
                      <div
                        key={tx.id}
                        className="rounded-xl p-4 border border-pink-500/30 flex items-center gap-3"
                        style={{ background: "oklch(0.18 0.05 340 / 0.35)" }}
                      >
                        <div className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 border bg-pink-500/20 border-pink-500/30">
                          <TrendingDown className="h-4 w-4 text-pink-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-muted-foreground">
                            {new Date(tx.created_at).toLocaleString("en-GB", {
                              hour: "2-digit",
                              minute: "2-digit",
                              hour12: true,
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </div>
                          <div className="text-sm font-semibold text-pink-300 break-words whitespace-normal">
                            {tx.note ?? "Expense"}
                          </div>
                        </div>
                        <div className="font-black text-lg shrink-0 text-pink-400">
                          -${fmt(Math.abs(Number(tx.amount)))}
                        </div>
                      </div>
                    );
                  }

                  if (isTransferOut) {
                    return (
                      <div
                        key={tx.id}
                        className="rounded-xl p-4 border border-red-500/30 flex items-center gap-3"
                        style={{ background: "oklch(0.20 0.05 27 / 0.35)" }}
                      >
                        <div className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 border bg-red-500/20 border-red-500/30">
                          <ArrowDownLeft className="h-4 w-4 text-red-400 rotate-180" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-muted-foreground">
                            {new Date(tx.created_at).toLocaleString("en-GB", {
                              hour: "2-digit",
                              minute: "2-digit",
                              hour12: true,
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </div>
                          <div className="text-sm font-semibold text-red-300 break-words whitespace-normal">
                            {tx.note ?? "Cleared to owner"}
                          </div>
                        </div>
                        <div className="font-black text-lg shrink-0 text-red-400">
                          ${fmt(Math.abs(Number(tx.amount)))}
                        </div>
                      </div>
                    );
                  }

                  if (isTransferIn) {
                    return (
                      <div
                        key={tx.id}
                        className="rounded-xl p-4 border border-green-500/30 flex items-center gap-3"
                        style={{ background: "oklch(0.22 0.06 145 / 0.3)" }}
                      >
                        <div className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 border bg-green-500/20 border-green-500/30">
                          <ArrowDownLeft className="h-4 w-4 text-green-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-muted-foreground">
                            {new Date(tx.created_at).toLocaleString("en-GB", {
                              hour: "2-digit",
                              minute: "2-digit",
                              hour12: true,
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </div>
                          <div className="text-sm font-semibold text-green-300 break-words whitespace-normal">
                            {tx.note ?? "Cleared from cashier"}
                          </div>
                        </div>
                        <div className="font-black text-lg shrink-0 text-green-400">
                          +${fmt(Number(tx.amount))}
                        </div>
                      </div>
                    );
                  }
                  if (isBottlePack) {
                    const isPack = tx.type === "pack_finished";
                    const bpParts = (tx.note ?? "").split(" | ");
                    const bpTitle = bpParts[0] ?? (isPack ? "Pack sold out" : "Bottle closed");
                    const bpSub1 = bpParts[1] ?? ""; // price
                    const bpSub2 = bpParts[2] ?? ""; // units/shots sold
                    const bpSub3 = bpParts[3] ?? ""; // revenue
                    const bpGainLoss = bpParts[4] ?? ""; // Gain/Loss
                    const bpPrice = parseFloat((bpSub1.match(/\$([\d.]+)/) ?? [])[1] ?? "0");
                    const bpRev = parseFloat((bpSub3.match(/\$([\d.]+)/) ?? [])[1] ?? "0");
                    const bpDiff = bpRev - bpPrice;
                    const bpHasNums =
                      !isNaN(bpPrice) && !isNaN(bpRev) && (bpPrice > 0 || bpRev > 0);
                    return (
                      <div
                        key={tx.id}
                        className={`rounded-xl p-4 border flex items-start gap-3 ${isPack ? "border-green-500/30" : "border-amber-500/30"}`}
                        style={{
                          background: isPack
                            ? "oklch(0.20 0.05 145 / 0.35)"
                            : "oklch(0.20 0.06 80 / 0.35)",
                        }}
                      >
                        <div
                          className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 border text-lg ${isPack ? "bg-green-500/20 border-green-500/30" : "bg-amber-500/20 border-amber-500/30"}`}
                        >
                          {isPack ? "🚬" : "🍾"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-muted-foreground">
                            {new Date(tx.created_at).toLocaleString("en-GB", {
                              hour: "2-digit",
                              minute: "2-digit",
                              hour12: true,
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </div>
                          <div
                            className={`text-sm font-black mt-0.5 ${isPack ? "text-green-300" : "text-amber-300"}`}
                          >
                            {bpTitle}
                          </div>
                          {bpSub1 && (
                            <div className="text-xs text-muted-foreground mt-0.5">{bpSub1}</div>
                          )}
                          {bpSub2 && (
                            <div className="text-xs text-muted-foreground mt-0.5">{bpSub2}</div>
                          )}
                          {bpSub3 && (
                            <div
                              className={`text-xs font-semibold mt-0.5 ${isPack ? "text-green-400" : "text-amber-400"}`}
                            >
                              {bpSub3}
                            </div>
                          )}
                          {bpHasNums && (
                            <div
                              className="text-xs font-black mt-1"
                              style={{ color: bpDiff >= 0 ? "#86efac" : "#fca5a5" }}
                            >
                              {bpDiff >= 0
                                ? `Gain: +$${bpDiff.toFixed(2)}`
                                : `Loss: -$${Math.abs(bpDiff).toFixed(2)}`}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  }
                  if (isCreditPay) {
                    const cpParts = (tx.note ?? "").split(" | ");
                    const cpTitle = cpParts[0] ?? "Credit payment";
                    const cpPaid = cpParts.find((p) => p.startsWith("Paid:")) ?? "";
                    const cpRemain =
                      cpParts.find(
                        (p) => p.startsWith("Remaining:") || p.startsWith("Balance remaining:"),
                      ) ?? "";
                    return (
                      <div
                        key={tx.id}
                        className="rounded-xl p-4 border border-green-500/30 flex items-start gap-3"
                        style={{ background: "oklch(0.20 0.06 145 / 0.25)" }}
                      >
                        <div className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 border bg-green-500/15 border-green-500/30 text-lg">
                          💳
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-muted-foreground">
                            {new Date(tx.created_at).toLocaleString("en-GB", {
                              hour: "2-digit",
                              minute: "2-digit",
                              hour12: true,
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </div>
                          <div className="text-sm font-black text-green-300 mt-0.5">{cpTitle}</div>
                          {(cpPaid || cpRemain) && (
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {[cpPaid, cpRemain].filter(Boolean).join(" · ")}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          {Number(tx.amount) > 0 && (
                            <div className="font-black text-lg shrink-0 text-green-400 mt-1">
                              +${fmt(Number(tx.amount))}
                            </div>
                          )}
                          {tx.id === latestPaymentId && Number(tx.amount) > 0 && (
                            <div className="flex flex-row gap-2">
                              <button
                                onClick={() => openBillForCreditTx(tx)}
                                className="h-9 w-9 sm:h-10 sm:w-10 rounded-full flex items-center justify-center bg-blue-500/20 active:scale-95 transition shrink-0"
                                title="Print receipt"
                              >
                                <Printer className="h-4 w-4 sm:h-5 sm:w-5 text-blue-300" />
                              </button>
                              <button
                                onClick={async () => {
                                  const ctid = tx.credit_tx_id;
                                  if (!ctid) {
                                    toast.error("No credit record linked to this payment");
                                    return;
                                  }
                                  const { data: ct } = await sb
                                    .from("credit_transactions")
                                    .select("id, credit_account_id, amount, items, created_at")
                                    .eq("id", ctid)
                                    .maybeSingle();
                                  if (!ct) {
                                    toast.error("Could not load credit payment for editing");
                                    return;
                                  }
                                  const { data: acct } = await sb
                                    .from("credit_accounts")
                                    .select("full_name")
                                    .eq("id", ct.credit_account_id)
                                    .maybeSingle();
                                  sessionStorage.setItem(
                                    "edit_credit_order",
                                    JSON.stringify({
                                      credit_tx_id: ct.id,
                                      credit_account_id: ct.credit_account_id,
                                      customer_name: acct?.full_name ?? "Customer",
                                      items: (ct.items ?? []) as {
                                        id: string;
                                        name: string;
                                        qty: number;
                                        price: number;
                                      }[],
                                      amount: ct.amount,
                                      created_at: ct.created_at,
                                    }),
                                  );
                                  nav("/register");
                                }}
                                className="h-9 w-9 sm:h-10 sm:w-10 rounded-full flex items-center justify-center bg-primary/20 active:scale-95 transition shrink-0"
                                title="Edit payment"
                              >
                                <Pencil className="h-4 w-4 sm:h-5 sm:w-5" style={{ color: "var(--primary)" }} />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  }
                  if (isCreditCharge) {
                    const ccParts = (tx.note ?? "").split(" | ");
                    const ccTitle = ccParts[0] ?? "Credit charge";
                    const ccAmount = ccParts.find((p) => p.startsWith("$")) ?? "";
                    const ccBal = ccParts.find((p) => p.startsWith("Balance owed:")) ?? "";
                    const ccItems =
                      ccParts.find((p) => p.startsWith("Items:"))?.replace("Items: ", "") ?? "";
                    const ccDiscRaw = ccParts.find((p) => p.startsWith("Disc:")) ?? "";
                    // parse "Disc: -$X.XX (orig $Y.YY)"
                    const ccDiscMatch = ccDiscRaw.match(
                      /Disc:\s*-\$?([\d.]+)(?:\s*\(orig\s*\$?([\d.]+)\))?/,
                    );
                    const ccDiscAmt = ccDiscMatch ? Number(ccDiscMatch[1]) : 0;
                    const ccDiscOrig = ccDiscMatch?.[2] ? Number(ccDiscMatch[2]) : null;
                    return (
                      <div
                        key={tx.id}
                        className="rounded-xl p-4 border border-orange-500/30 flex items-start gap-3"
                        style={{ background: "oklch(0.20 0.04 45 / 0.30)" }}
                      >
                        <div className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 border bg-orange-500/15 border-orange-500/30 text-lg">
                          🪙
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-muted-foreground">
                            {new Date(tx.created_at).toLocaleString("en-GB", {
                              hour: "2-digit",
                              minute: "2-digit",
                              hour12: true,
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </div>
                          <div
                            className="text-sm font-black mt-0.5"
                            style={{ color: "var(--primary)" }}
                          >
                            {ccTitle}
                          </div>
                          {ccItems && (
                            <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed break-words whitespace-normal">
                              {ccItems}
                            </div>
                          )}
                          {ccAmount && (
                            <div className="text-sm font-black text-green-400 mt-0.5">
                              {ccAmount}
                            </div>
                          )}
                          {ccDiscAmt > 0 && (
                            <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
                              {ccDiscOrig != null && (
                                <span className="text-[9px] text-muted-foreground line-through">
                                  ${fmt(ccDiscOrig)}
                                </span>
                              )}
                              <span
                                className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-black leading-tight"
                                style={{
                                  background: "rgba(251,191,36,0.2)",
                                  color: "#fbbf24",
                                  border: "1px solid rgba(251,191,36,0.4)",
                                }}
                              >
                                -{fmt(ccDiscAmt)} off
                              </span>
                            </div>
                          )}
                          {ccBal && (
                            <div
                              className="text-xs font-semibold mt-0.5"
                              style={{ color: "var(--primary)" }}
                            >
                              {ccBal}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-row gap-2">
                          <button
                            onClick={() => openBillForCreditTx(tx)}
                            className="h-8 w-8 rounded-full flex items-center justify-center bg-blue-500/20 active:scale-95 transition mt-1 shrink-0 self-end"
                            title="Print bill"
                          >
                            <Receipt className="h-3.5 w-3.5 text-blue-300" />
                          </button>
                          {(profile.role === "owner" ||
                            profile.role === "manager" ||
                            (profile as any).job_title === "manager" ||
                            profile.role === "cashier") && (
                            <button
                              onClick={async () => {
                                const ctid = tx.credit_tx_id;
                                if (!ctid) {
                                  toast.error("No credit record linked to this charge");
                                  return;
                                }
                                const { data: ct } = await sb
                                  .from("credit_transactions")
                                  .select("id, credit_account_id, amount, items, created_at")
                                  .eq("id", ctid)
                                  .maybeSingle();
                                if (!ct) {
                                  toast.error("Could not load credit sale for editing");
                                  return;
                                }
                                const { data: acct } = await sb
                                  .from("credit_accounts")
                                  .select("full_name")
                                  .eq("id", ct.credit_account_id)
                                  .maybeSingle();
                                sessionStorage.setItem(
                                  "edit_credit_order",
                                  JSON.stringify({
                                    credit_tx_id: ct.id,
                                    credit_account_id: ct.credit_account_id,
                                    customer_name: acct?.full_name ?? "Customer",
                                    items: (ct.items ?? []) as {
                                      id: string;
                                      name: string;
                                      qty: number;
                                      price: number;
                                    }[],
                                    amount: ct.amount,
                                    created_at: ct.created_at,
                                  }),
                                );
                                nav("/register");
                              }}
                              className="h-8 w-8 rounded-full flex items-center justify-center bg-primary/20 active:scale-95 transition mt-1 shrink-0 self-end"
                              title="Edit this credit sale"
                            >
                              <Pencil className="h-3.5 w-3.5" style={{ color: "var(--primary)" }} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  }
                  return null;
                }
                const o = rec.data as Order;
                return (
                  <div
                    key={o.id}
                    className="rounded-xl p-4 border border-green-500/20 flex items-start gap-3"
                    style={{ background: "oklch(0.20 0.05 145 / 0.20)" }}
                  >
                    <div className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 border bg-green-500/15 border-green-500/25 text-base">
                      💵
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-muted-foreground">
                        {new Date(o.created_at).toLocaleString("en-GB", {
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: true,
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </div>
                      <div
                        className="text-sm font-black mt-0.5"
                        style={{ color: "var(--primary)" }}
                      >
                        ORDER #{(o as any).order_number ?? o.id.slice(0, 8)} · Cash: Sale
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed break-words whitespace-normal">
                        {(o.items || []).map((i, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 mr-1.5 flex-wrap"
                          >
                            <span>
                              {i.qty}× {i.name}
                            </span>
                            {i.discount && Number(i.discount) > 0 ? (
                              <>
                                {i.original_price != null && (
                                  <span className="text-[9px] text-muted-foreground line-through">
                                    ${fmt(Number(i.original_price))}
                                  </span>
                                )}
                                <span
                                  className="inline-flex items-center px-1 py-0 rounded-full text-[9px] font-black leading-tight"
                                  style={{
                                    background: "rgba(251,191,36,0.2)",
                                    color: "#fbbf24",
                                    border: "1px solid rgba(251,191,36,0.4)",
                                  }}
                                >
                                  -{fmt(Number(i.discount))} off
                                </span>
                              </>
                            ) : null}
                          </span>
                        ))}
                      </div>
                      {o.discount_amount != null && Number(o.discount_amount) > 0 && (
                        <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
                          {o.original_total != null && (
                            <span className="text-[9px] text-muted-foreground line-through">
                              ${fmt(Number(o.original_total))}
                            </span>
                          )}
                          <span
                            className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-black leading-tight"
                            style={{
                              background: "rgba(251,191,36,0.2)",
                              color: "#fbbf24",
                              border: "1px solid rgba(251,191,36,0.4)",
                            }}
                          >
                            -{fmt(Number(o.discount_amount))} off
                          </span>
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Paid ${fmt(Number(o.paid))} · Change ${fmt(Number(o.change_given))}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <span className="font-black text-sm text-green-400">
                        +${fmt(Number(o.total))}
                      </span>
                      <div className="flex flex-row gap-2">
                        <button
                          onClick={() => openBillForOrder(o)}
                          className="h-9 w-9 sm:h-10 sm:w-10 rounded-full flex items-center justify-center bg-blue-500/20 active:scale-95 transition"
                          title="Print bill"
                        >
                          <Receipt className="h-4 w-4 sm:h-5 sm:w-5 text-blue-300" />
                        </button>
                        {(profile.role === "owner" ||
                          profile.role === "manager" ||
                          (profile as any).job_title === "manager" ||
                          profile.role === "cashier") && (
                          <button
                            onClick={() => setEditingOrder(o)}
                            className="h-9 w-9 sm:h-10 sm:w-10 rounded-full flex items-center justify-center bg-primary/20 active:scale-95 transition"
                            title="Edit this sale"
                          >
                            <Pencil className="h-4 w-4 sm:h-5 sm:w-5" style={{ color: "var(--primary)" }} />
                          </button>
                        )}
                        {o.id === deletableOrderId && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <button
                                onClick={() => setDeleteConfirmId(o.id)}
                                className="h-9 w-9 sm:h-10 sm:w-10 rounded-full flex items-center justify-center bg-red-600 active:scale-95 transition"
                                title="Delete this sale"
                              >
                                <Trash2 className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                              </button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete this sale?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will remove the order and restore stock. This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => {
                                    if (deleteConfirmId) deleteLatestCashierOrder({ ...o, id: deleteConfirmId });
                                    setDeleteConfirmId(null);
                                  }}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <PaginationBar
            page={page}
            totalPages={totalPages}
            total={totalRecords}
            onPrev={handlePrev}
            onNext={handleNext}
          />
        </section>
      )}

      {cashierTab === "expenses" && (
        <section className="space-y-3 pb-24">
          {/* Add Expense form */}
          <div className="space-y-2">
            <button
              onClick={() => setShowAddExpense((v) => !v)}
              className="w-full h-11 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition active:scale-[0.98] border"
              style={
                showAddExpense
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
              {showAddExpense ? "✕ Cancel" : "+ Add Expense"}
            </button>

            {showAddExpense && (
              <div
                className="rounded-2xl border border-border p-4 space-y-3"
                style={{ background: "var(--gradient-card)" }}
              >
                <p className="text-xs font-black text-muted-foreground uppercase tracking-widest">
                  Expense Lines
                </p>
                {expenseLines.map((line, i) => (
                  <div key={i} className="space-y-1.5">
                    <input
                      value={line.description}
                      onChange={(e) => updateExpenseLine(i, "description", e.target.value)}
                      placeholder="Description (e.g. Staff Salary)"
                      className="w-full h-10 rounded-xl border border-border bg-muted px-3 text-sm font-bold outline-none focus:ring-1 focus:ring-primary"
                    />
                    <div className="flex gap-2 items-center">
                      <input
                        value={line.amount}
                        onChange={(e) => updateExpenseLine(i, "amount", e.target.value)}
                        placeholder="$0.00"
                        type="number"
                        min="0"
                        step="0.01"
                        className="flex-1 h-10 rounded-xl border border-border bg-muted px-3 text-sm font-bold outline-none focus:ring-1 focus:ring-primary"
                      />
                      {expenseLines.length > 1 && (
                        <button
                          onClick={() => removeExpenseLine(i)}
                          className="h-10 w-10 rounded-xl flex items-center justify-center bg-destructive/15 text-destructive active:scale-90 transition shrink-0"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                <button
                  onClick={addExpenseLine}
                  className="w-full h-9 rounded-xl border border-dashed border-border text-xs font-black text-muted-foreground hover:text-foreground transition active:scale-[0.98]"
                >
                  + Add Line
                </button>
                <div className="pt-1 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground font-semibold">
                      Total:{" "}
                      <span className="font-black text-foreground">
                        $
                        {expenseLines
                          .reduce((s, l) => s + (parseFloat(l.amount) || 0), 0)
                          .toFixed(2)}
                      </span>
                    </span>
                  </div>
                  {!confirmingExpense ? (
                    <button
                      onClick={() => {
                        const valid = expenseLines.filter(
                          (l) => l.description.trim() && parseFloat(l.amount) > 0,
                        );
                        if (!valid.length) {
                          toast.error("Add at least one item with a description and amount");
                          return;
                        }
                        setConfirmingExpense(true);
                      }}
                      className="w-full h-10 rounded-xl font-black text-sm text-primary-foreground flex items-center justify-center gap-2 transition active:scale-95"
                      style={{ background: "var(--gradient-hero)" }}
                    >
                      Save Expense
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs font-black text-center text-muted-foreground">
                        Confirm save this expense?
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => setConfirmingExpense(false)}
                          className="h-10 rounded-xl font-black text-sm border border-border transition active:scale-95"
                          style={{ background: "var(--gradient-card)" }}
                        >
                          ← Go Back
                        </button>
                        <button
                          onClick={handleSaveCashierExpense}
                          disabled={savingExpense}
                          className="h-10 rounded-xl font-black text-sm text-primary-foreground disabled:opacity-50 flex items-center justify-center gap-2 transition active:scale-95"
                          style={{ background: "var(--gradient-hero)" }}
                        >
                          {savingExpense ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                          Confirm Save
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Date filter tabs — hidden, always show session view */}

          {/* Expense history */}
          {loadingExpenses ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-xl h-16 bg-muted/30 animate-pulse" />
              ))}
            </div>
          ) : expenseDateFilter === "session" ? (
            expenseSessions.length === 0 ? (
              <div className="text-muted-foreground text-sm py-8 text-center">No expenses yet.</div>
            ) : (
              <div className="space-y-2">
                <h3 className="font-black text-sm text-muted-foreground px-1">Expense History</h3>
                {expenseSessions.map((sess) => {
                  const sTotal = sess.expenses.reduce((s, e) => s + Number(e.amount), 0);
                  const isOpen = openExpenseSession === sess.id;
                  const isActive = !sess.end;
                  return (
                    <div key={sess.id} className="rounded-2xl border border-border overflow-hidden">
                      <button
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition"
                        onClick={() => setOpenExpenseSession(isOpen ? null : sess.id)}
                      >
                        <div className="flex flex-col items-start gap-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-xs">{isActive ? "🟢" : "🔴"}</span>
                            <span className="font-black text-sm">{fmtSessionTs(sess.start)}</span>
                          </div>
                          {sess.end && (
                            <span className="text-[10px] text-muted-foreground pl-5">
                              → {fmtSessionTs(sess.end)}
                            </span>
                          )}
                          <span className="text-[10px] text-muted-foreground pl-5">
                            {sess.expenses.length}{" "}
                            {sess.expenses.length === 1 ? "entry" : "entries"}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-sm font-black text-pink-400">-${fmt(sTotal)}</span>
                          <ChevronDown
                            className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
                          />
                        </div>
                      </button>
                      {isOpen && (
                        <div className="border-t border-border divide-y divide-border/50">
                          {sess.expenses.map((e) => {
                            const isLatest = e.id === cashierExpenses[0]?.id;
                            const isEditing = cashierExpenseEditId === e.id;
                            const isDeleteConfirm = cashierExpenseDeleteId === e.id;
                            return (
                              <div key={e.id}>
                                {isEditing ? (
                                  <div className="px-4 py-3 space-y-2">
                                    <p className="text-xs font-black text-muted-foreground uppercase tracking-widest">Edit Expense</p>
                                    {cashierExpenseEditLines.map((el, i) => (
                                      <div key={i} className="space-y-1">
                                        <input value={el.description} onChange={(ev) => setCashierExpenseEditLines((ls) => ls.map((l, idx) => idx === i ? { ...l, description: ev.target.value } : l))} placeholder="Description" className="w-full h-9 rounded-xl border border-border bg-muted px-3 text-sm font-bold outline-none focus:ring-1 focus:ring-primary" />
                                        <div className="flex gap-2">
                                          <input value={el.amount} onChange={(ev) => setCashierExpenseEditLines((ls) => ls.map((l, idx) => idx === i ? { ...l, amount: ev.target.value } : l))} placeholder=".00" type="number" min="0" step="0.01" className="flex-1 h-9 rounded-xl border border-border bg-muted px-3 text-sm font-bold outline-none focus:ring-1 focus:ring-primary" />
                                          {cashierExpenseEditLines.length > 1 && <button onClick={() => setCashierExpenseEditLines((ls) => ls.filter((_, idx) => idx !== i))} className="h-9 w-9 rounded-xl flex items-center justify-center bg-destructive/15 text-destructive active:scale-90 transition"><X className="h-3.5 w-3.5" /></button>}
                                        </div>
                                      </div>
                                    ))}
                                    <button onClick={() => setCashierExpenseEditLines((ls) => [...ls, { description: "", amount: "" }])} className="w-full h-8 rounded-xl border border-dashed border-border text-xs font-black text-muted-foreground transition active:scale-[0.98]">+ Add Line</button>
                                    <div className="grid grid-cols-2 gap-2 pt-1">
                                      <button onClick={() => { setCashierExpenseEditId(null); setCashierExpenseEditLines([]); }} className="h-9 rounded-xl font-black text-xs border border-border transition active:scale-95">Cancel</button>
                                      <button onClick={() => handleCashierExpenseEditSave(e)} disabled={cashierExpenseEditSaving} className="h-9 rounded-xl font-black text-xs text-primary-foreground flex items-center justify-center transition active:scale-95 disabled:opacity-50" style={{ background: "var(--gradient-hero)" }}>{cashierExpenseEditSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}</button>
                                    </div>
                                  </div>
                                ) : isDeleteConfirm ? (
                                  <div className="px-4 py-3 space-y-2">
                                    <p className="text-xs font-semibold text-center text-red-400">Delete expense and refund to float?</p>
                                    <div className="grid grid-cols-2 gap-2">
                                      <button onClick={() => setCashierExpenseDeleteId(null)} className="h-9 rounded-xl font-black text-xs border border-border transition active:scale-95">Cancel</button>
                                      <button onClick={() => handleCashierExpenseDelete(e)} disabled={cashierExpenseDeleting} className="h-9 rounded-xl font-black text-xs text-white flex items-center justify-center transition active:scale-95 disabled:opacity-50" style={{ background: "#dc2626" }}>{cashierExpenseDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Delete"}</button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex items-center">
                                    <div className="flex-1"><ExpenseRow expense={e} /></div>
                                    {isLatest && (
                                      <div className="flex gap-1 pr-3 shrink-0">
                                        <button onClick={() => startCashierExpenseEdit(e)} className="h-7 w-7 rounded-lg flex items-center justify-center transition active:scale-90" style={{ background: "rgba(255,255,255,0.08)" }} title="Edit expense"><Pencil className="h-3 w-3 text-muted-foreground" /></button>
                                        <button onClick={() => setCashierExpenseDeleteId(e.id)} className="h-7 w-7 rounded-lg flex items-center justify-center transition active:scale-90" style={{ background: "rgba(239,68,68,0.12)" }} title="Delete expense"><Trash2 className="h-3 w-3 text-red-400" /></button>
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
                })}
              </div>
            )
          ) : cashierExpenseMonths.length === 0 ? (
            <div className="text-muted-foreground text-sm py-8 text-center">
              No expenses for this period.
            </div>
          ) : (
            <div className="space-y-2">
              <h3 className="font-black text-sm text-muted-foreground px-1">Expense History</h3>
              {cashierExpenseMonths.map((mk) => {
                const mExpenses = cashierExpensesByMonth[mk];
                const mTotal = mExpenses.reduce((s, e) => s + Number(e.amount), 0);
                const isOpen = openExpenseMonth === mk;
                return (
                  <div key={mk} className="rounded-2xl border border-border overflow-hidden">
                    <button
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition"
                      onClick={() => setOpenExpenseMonth(isOpen ? null : mk)}
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-black text-sm">{monthLabel(mk)}</span>
                        <span className="text-xs text-muted-foreground">
                          {mExpenses.length} {mExpenses.length === 1 ? "entry" : "entries"}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-black text-pink-400">-${fmt(mTotal)}</span>
                        <ChevronDown
                          className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
                        />
                      </div>
                    </button>
                    {isOpen && (
                      <div className="border-t border-border divide-y divide-border/50">
                        {mExpenses.map((e) => {
                          const isLatest = e.id === cashierExpenses[0]?.id;
                          const isEditing = cashierExpenseEditId === e.id;
                          const isDeleteConfirm = cashierExpenseDeleteId === e.id;
                          return (
                            <div key={e.id}>
                              {isEditing ? (
                                <div className="px-4 py-3 space-y-2">
                                  <p className="text-xs font-black text-muted-foreground uppercase tracking-widest">Edit Expense</p>
                                  {cashierExpenseEditLines.map((el, i) => (
                                    <div key={i} className="space-y-1">
                                      <input value={el.description} onChange={(ev) => setCashierExpenseEditLines((ls) => ls.map((l, idx) => idx === i ? { ...l, description: ev.target.value } : l))} placeholder="Description" className="w-full h-9 rounded-xl border border-border bg-muted px-3 text-sm font-bold outline-none focus:ring-1 focus:ring-primary" />
                                      <div className="flex gap-2">
                                        <input value={el.amount} onChange={(ev) => setCashierExpenseEditLines((ls) => ls.map((l, idx) => idx === i ? { ...l, amount: ev.target.value } : l))} placeholder=".00" type="number" min="0" step="0.01" className="flex-1 h-9 rounded-xl border border-border bg-muted px-3 text-sm font-bold outline-none focus:ring-1 focus:ring-primary" />
                                        {cashierExpenseEditLines.length > 1 && <button onClick={() => setCashierExpenseEditLines((ls) => ls.filter((_, idx) => idx !== i))} className="h-9 w-9 rounded-xl flex items-center justify-center bg-destructive/15 text-destructive active:scale-90 transition"><X className="h-3.5 w-3.5" /></button>}
                                      </div>
                                    </div>
                                  ))}
                                  <button onClick={() => setCashierExpenseEditLines((ls) => [...ls, { description: "", amount: "" }])} className="w-full h-8 rounded-xl border border-dashed border-border text-xs font-black text-muted-foreground transition active:scale-[0.98]">+ Add Line</button>
                                  <div className="grid grid-cols-2 gap-2 pt-1">
                                    <button onClick={() => { setCashierExpenseEditId(null); setCashierExpenseEditLines([]); }} className="h-9 rounded-xl font-black text-xs border border-border transition active:scale-95">Cancel</button>
                                    <button onClick={() => handleCashierExpenseEditSave(e)} disabled={cashierExpenseEditSaving} className="h-9 rounded-xl font-black text-xs text-primary-foreground flex items-center justify-center transition active:scale-95 disabled:opacity-50" style={{ background: "var(--gradient-hero)" }}>{cashierExpenseEditSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}</button>
                                  </div>
                                </div>
                              ) : isDeleteConfirm ? (
                                <div className="px-4 py-3 space-y-2">
                                  <p className="text-xs font-semibold text-center text-red-400">Delete expense and refund to float?</p>
                                  <div className="grid grid-cols-2 gap-2">
                                    <button onClick={() => setCashierExpenseDeleteId(null)} className="h-9 rounded-xl font-black text-xs border border-border transition active:scale-95">Cancel</button>
                                    <button onClick={() => handleCashierExpenseDelete(e)} disabled={cashierExpenseDeleting} className="h-9 rounded-xl font-black text-xs text-white flex items-center justify-center transition active:scale-95 disabled:opacity-50" style={{ background: "#dc2626" }}>{cashierExpenseDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Delete"}</button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center">
                                  <div className="flex-1"><ExpenseRow expense={e} /></div>
                                  {isLatest && (
                                    <div className="flex gap-1 pr-3 shrink-0">
                                      <button onClick={() => startCashierExpenseEdit(e)} className="h-7 w-7 rounded-lg flex items-center justify-center transition active:scale-90" style={{ background: "rgba(255,255,255,0.08)" }} title="Edit expense"><Pencil className="h-3 w-3 text-muted-foreground" /></button>
                                      <button onClick={() => setCashierExpenseDeleteId(e.id)} className="h-7 w-7 rounded-lg flex items-center justify-center transition active:scale-90" style={{ background: "rgba(239,68,68,0.12)" }} title="Delete expense"><Trash2 className="h-3 w-3 text-red-400" /></button>
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
              })}
            </div>
          )}
        </section>
      )}

      {/* ── Edit sale confirm modal ───────────────────────────────────── */}
      {editingOrder && (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setEditingOrder(null)}
        >
          <div
            className="w-full max-w-sm rounded-t-3xl border border-border shadow-2xl overflow-hidden"
            style={{ background: "var(--gradient-card)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 pt-5 pb-3 flex items-center justify-between">
              <span className="text-base font-black">Edit Sale</span>
              <button
                onClick={() => setEditingOrder(null)}
                className="h-8 w-8 rounded-full flex items-center justify-center bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-5 pb-2 text-xs text-muted-foreground space-y-1">
              <p className="font-bold text-foreground">
                {new Date(editingOrder.created_at).toLocaleString("en-GB", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: true,
                  day: "numeric",
                  month: "short",
                })}
                {" · "}${fmt(Number(editingOrder.total))}
              </p>
              <p>{(editingOrder.items || []).map((i) => `${i.qty}× ${i.name}`).join(", ")}</p>
              <p className="text-yellow-400 font-semibold pt-1">
                This will reload the sale on the register for editing. The original date and time
                will be preserved.
              </p>
            </div>
            <div className="px-5 pb-6 pt-3 grid grid-cols-2 gap-3">
              <button
                onClick={() => setEditingOrder(null)}
                className="h-11 rounded-2xl font-black text-sm border border-border transition active:scale-95"
                style={{ background: "var(--gradient-card)" }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleConfirmEdit(editingOrder)}
                className="h-11 rounded-2xl font-black text-sm text-primary-foreground flex items-center justify-center gap-2 transition active:scale-95"
                style={{ background: "var(--gradient-hero)" }}
              >
                <Pencil className="h-4 w-4" /> Edit
              </button>
            </div>
          </div>
        </div>
      )}

      {billData && (
        <BillModal
          bill={billData}
          onClose={() => setBillData(null)}
          onPrint={handlePrintBill}
          onPdfShare={handlePdfShare}
          printing={printingBill}
        />
      )}
    </div>
  );
}
type OwnerFlatRecord =
  | { kind: "order"; data: Order; ts: number }
  | { kind: "tx"; data: WalletTx; ts: number };

function OwnerStatement({
  profile,
  onClose,
  chainBarIds,
}: {
  profile: { id: string; username?: string };
  onClose: () => void;
  chainBarIds?: string[];
}) {
  const { t } = useTranslation();
  const sb = supabase as any;
  const [orders, setOrders] = useState<Order[]>([]);
  const [txs, setTxs] = useState<WalletTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [downloadingMonth, setDownloadingMonth] = useState<string | null>(null);
  const [downloadedMonth, setDownloadedMonth] = useState<string | null>(null);
  const [billData, setBillData] = useState<BillData | null>(null);
  const [printingBill, setPrintingBill] = useState(false);

  const handlePrintBill = async () => {
    if (!billData) return;
    setPrintingBill(true);
    try {
      const { printReceipt } = await import("@/lib/receiptPrinter");
      await printReceipt(billData as any);
      toast.success("Receipt sent to printer");
    } catch { toast.error("Print failed"); }
    finally { setPrintingBill(false); }
  };

  const handlePdfShare = async () => {
    if (!billData) return;
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "mm", format: "a4" });
      let y = 20;
      doc.setFont("helvetica", "bold"); doc.setFontSize(14);
      doc.text(billData.storeName || "Bar", LM, y);
      doc.setFont("helvetica", "normal"); doc.setFontSize(10);
      doc.text(billData.date, LM, y + 6);
      doc.text("ORDER #" + billData.orderNumber, LM, y + 12);
      let cy = y + 20;
      (billData.items || []).forEach((it: any) => {
        doc.text(`${it.qty}x ${it.name}   $${(it.qty * it.price).toFixed(2)}`, LM, cy); cy += 6;
      });
      cy += 4; doc.setFont("helvetica", "bold");
      doc.text(`Total: $${billData.total.toFixed(2)}`, LM, cy);
      const dataUri = doc.output("datauristring");
      await downloadPdf(`receipt-${billData.orderNumber}.pdf`, dataUri);
      toast.success("Receipt PDF downloaded");
    } catch { toast.error("Failed to generate PDF"); }
  };

  const openBillForOrder = (order: Order) => {
    setBillData({
      storeName: profile.username || "Bar",
      orderNumber: String((order as any).order_number ?? order.id.slice(0, 8)),
      date: new Date(order.created_at).toLocaleString("en-US", {
        month: "numeric", day: "numeric", year: "numeric",
        hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true,
      }),
      items: (order.items || []).map((i) => ({ name: i.name, qty: i.qty, price: Number(i.price) })),
      subtotal: Number(order.total),
      total: Number(order.total),
      paid: Number(order.paid),
      change: Number(order.change_given),
      payMode: order.payment_method === "credit" ? "credit" : "cash",
    });
  };

  const openBillForCreditTx = async (tx: WalletTx) => {
    const ctid = tx.credit_tx_id;
    if (!ctid) { toast.error("No credit record linked"); return; }
    const { data: ct } = await sb.from("credit_transactions")
      .select("id, credit_account_id, amount, items, created_at").eq("id", ctid).maybeSingle();
    if (!ct) { toast.error("Could not load credit sale"); return; }
    const { data: acct } = await sb.from("credit_accounts")
      .select("full_name").eq("id", ct.credit_account_id).maybeSingle();
    const items = (ct.items ?? []) as { name: string; qty: number; price: number }[];
    setBillData({
      storeName: profile.username || "Bar",
      orderNumber: "CREDIT",
      date: new Date(ct.created_at).toLocaleString("en-US", {
        month: "numeric", day: "numeric", year: "numeric",
        hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true,
      }),
      items: items.map((i) => ({ name: i.name, qty: i.qty, price: Number(i.price) })),
      subtotal: Number(ct.amount),
      total: Number(ct.amount),
      paid: Number(ct.amount),
      change: 0,
      payMode: "credit",
      customerName: acct?.full_name || undefined,
    });
  };

  useEffect(() => {
    setLoading(true);
    // Collect all owner IDs to fetch orders from: own profile + all chain bars
    const allOwnerIds = [profile.id, ...(chainBarIds ?? [])];
    Promise.all([
      // All orders for this owner (owner's own sales + manager/cashier sales on owner's bars)
      supabase
        .from("orders")
        .select("*")
        .in("owner_id", allOwnerIds)
        .order("created_at", { ascending: false })
        .then(({ data }) => setOrders((data ?? []) as unknown as Order[])),
      supabase
        .from("wallet_transactions")
        .select("*")
        .eq("profile_id", profile.id)
        .in("type", [
          "transfer_in",
          "cashier_sale",
          "manager_sale",
          "bottle_finished",
          "pack_finished",
          "credit_payment",
          "credit_charge",
        ])
        .order("created_at", { ascending: false })
        .then(({ data }) => setTxs((data ?? []) as WalletTx[])),
    ]).finally(() => setLoading(false));
  }, [profile.id, chainBarIds?.join(",")]);

  const orderIds = new Set(orders.map((o) => o.id));

  const allRecords: OwnerFlatRecord[] = [
    ...orders.map(
      (o): OwnerFlatRecord => ({ kind: "order", data: o, ts: new Date(o.created_at).getTime() }),
    ),
    // Exclude cashier_sale txs that are already represented by a fetched order row (avoid duplicates)
    ...txs
      .filter((tx) => !(tx.type === "cashier_sale" && tx.order_id && orderIds.has(tx.order_id)))
      .map(
        (tx): OwnerFlatRecord => ({ kind: "tx", data: tx, ts: new Date(tx.created_at).getTime() }),
      ),
  ].sort((a, b) => b.ts - a.ts);

  const months = Array.from(
    new Set(
      allRecords.map((r) =>
        new Date(r.data.created_at).toLocaleDateString("en-GB", {
          year: "numeric",
          month: "long",
          timeZone: "America/Port_of_Spain",
        }),
      ),
    ),
  );

  const getRecordsForMonth = (month: string) =>
    allRecords.filter(
      (r) =>
        new Date(r.data.created_at).toLocaleDateString("en-GB", {
          year: "numeric",
          month: "long",
          timeZone: "America/Port_of_Spain",
        }) === month,
    );

  const handleDownload = async (month: string) => {
    if (downloadingMonth) return;
    setDownloadingMonth(month);
    try {
      const monthRecords = getRecordsForMonth(month);
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "mm", format: "a4" });
      const businessName = profile.username ?? "Owner";
      const generated = new Date().toLocaleString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
        day: "numeric",
        month: "short",
        year: "numeric",
      });
      const ordersR = monthRecords.filter((r) => r.kind === "order");
      const txsR = monthRecords.filter((r) => r.kind === "tx");
      const totalSales = ordersR.reduce((s, r) => s + Number((r.data as Order).total), 0);
      const totalTransfersIn = txsR
        .filter((r) => (r.data as WalletTx).type === "transfer_in")
        .reduce((s, r) => s + Number((r.data as WalletTx).amount), 0);
      const openingBalance = 0;
      const closingBalance = totalSales + totalTransfersIn;
      let y = await drawHeader(doc, businessName, "Wallet Statement", month, generated);
      const boxX = LM;
      const boxW = RM - LM;
      const boxH = 28;
      doc.setFillColor(245, 240, 230);
      doc.roundedRect(boxX, y, boxW, boxH, 2, 2, "F");
      doc.setDrawColor(232, 146, 42);
      doc.setLineWidth(0.4);
      doc.roundedRect(boxX, y, boxW, boxH, 2, 2, "S");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(100, 70, 10);
      doc.text("PERIOD SUMMARY", boxX + 3, y + 5);
      const cols = [
        { label: "Opening Balance", value: "$" + fmt(openingBalance) },
        { label: "Closing Balance", value: "$" + fmt(closingBalance) },
      ];
      const colW = boxW / cols.length;
      cols.forEach((col, i) => {
        const cx = boxX + i * colW + colW / 2;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.5);
        doc.setTextColor(100, 100, 100);
        doc.text(col.label, cx, y + 13, { align: "center" });
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        if (col.label === "Closing Balance") {
          doc.setTextColor(closingBalance >= 0 ? 40 : 180, closingBalance >= 0 ? 140 : 40, 40);
        } else {
          doc.setTextColor(30, 30, 30);
        }
        doc.text(col.value, cx, y + 21, { align: "center" });
      });
      doc.setTextColor(0, 0, 0);
      y += boxH + 5;
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
        if (y > CONTENT_BOTTOM) {
          doc.addPage();
          y = 20;
        }
        if (rec.kind === "order") {
          const o = rec.data as Order;
          doc.setFont("helvetica", "bold");
          doc.text(
            new Date(o.created_at).toLocaleString("en-GB", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: true,
              day: "numeric",
              month: "short",
              year: "numeric",
            }),
            LM,
            y,
          );
          doc.text("$" + Number(o.total).toFixed(2), RM, y, { align: "right" });
          y += 5;
          doc.setFont("helvetica", "normal");
          const items = (o.items || [])
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((i) => {
              const discountNote =
                i.discount && Number(i.discount) > 0
                  ? ` [was $${Number(i.original_price ?? i.price).toFixed(2)}, -$${Number(i.discount).toFixed(2)} off]`
                  : "";
              return i.qty + "x " + i.name + discountNote;
            })
            .join(", ");
          const wrapped = doc.splitTextToSize("  " + items, 155);
          doc.text(wrapped, LM, y);
          y += wrapped.length * 4.5 + 1;
          doc.setTextColor(100, 100, 100);
          doc.text(
            "  Paid $" +
              Number(o.paid).toFixed(2) +
              "   Change $" +
              Number(o.change_given).toFixed(2),
            LM,
            y,
          );
          if (o.discount_amount && Number(o.discount_amount) > 0) {
            y += 4;
            doc.setTextColor(180, 130, 10);
            doc.text(
              "  Order discount: -$" +
                Number(o.discount_amount).toFixed(2) +
                (o.original_total ? "  (was $" + Number(o.original_total).toFixed(2) + ")" : ""),
              LM,
              y,
            );
          }
          doc.setTextColor(0, 0, 0);
          y += 4;
          doc.setDrawColor(220, 220, 220);
          doc.setLineWidth(0.1);
          doc.line(LM, y, RM, y);
          y += 4;
        } else {
          const tx = rec.data as WalletTx;
          const isCashierSale = tx.type === "cashier_sale";
          const isTransferIn = tx.type === "transfer_in";
          const isBottlePack = tx.type === "bottle_finished" || tx.type === "pack_finished";

          doc.setFont("helvetica", "bold");
          if (isCashierSale) {
            // Blue read-only — show inline, no amount column
            doc.setTextColor(60, 100, 200);
            const parts = (tx.note ?? "").split(" | ");
            const cashierLabel = parts[0] ?? "Cashier sale";
            const totalStr = parts[1] ?? "";
            const itemsStr = parts.slice(2).join(", ");
            doc.text(
              new Date(tx.created_at).toLocaleString("en-GB", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: true,
                day: "numeric",
                month: "short",
                year: "numeric",
              }),
              LM,
              y,
            );
            doc.text(cashierLabel + (totalStr ? " — " + totalStr : ""), LM + 45, y);
            doc.setTextColor(0, 0, 0);
            doc.setFont("helvetica", "normal");
            if (itemsStr) {
              y += 4;
              doc.setFontSize(8);
              doc.setTextColor(100, 100, 100);
              const wrapped = doc.splitTextToSize("  " + itemsStr, 155);
              doc.text(wrapped, LM, y);
              y += wrapped.length * 3.5;
              doc.setFontSize(9);
              doc.setTextColor(0, 0, 0);
            }
          } else if (isTransferIn) {
            doc.setTextColor(40, 140, 40);
            const label = tx.note ?? "Cleared from cashier";
            doc.text(
              new Date(tx.created_at).toLocaleString("en-GB", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: true,
                day: "numeric",
                month: "short",
                year: "numeric",
              }),
              LM,
              y,
            );
            doc.text(label, LM + 45, y);
            doc.text("+$" + Number(tx.amount).toFixed(2), RM, y, { align: "right" });
            doc.setTextColor(0, 0, 0);
            doc.setFont("helvetica", "normal");
          } else if (isBottlePack) {
            doc.setTextColor(180, 120, 30);
            const label = tx.note ?? "Pack/Bottle closed";
            doc.text(
              new Date(tx.created_at).toLocaleString("en-GB", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: true,
                day: "numeric",
                month: "short",
                year: "numeric",
              }),
              LM,
              y,
            );
            const wrapped = doc.splitTextToSize(label, 140);
            doc.text(wrapped, LM + 45, y);
            doc.setTextColor(0, 0, 0);
            doc.setFont("helvetica", "normal");
            y += (wrapped.length - 1) * 4.5;
          } else {
            doc.setTextColor(100, 100, 100);
            const label = tx.note ?? tx.type;
            doc.text(
              new Date(tx.created_at).toLocaleString("en-GB", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: true,
                day: "numeric",
                month: "short",
                year: "numeric",
              }),
              LM,
              y,
            );
            doc.text(label, LM + 45, y);
            if (Number(tx.amount) !== 0)
              doc.text("$" + Math.abs(Number(tx.amount)).toFixed(2), RM, y, { align: "right" });
            doc.setTextColor(0, 0, 0);
            doc.setFont("helvetica", "normal");
          }
          y += 4;
          doc.setDrawColor(220, 220, 220);
          doc.setLineWidth(0.1);
          doc.line(LM, y, RM, y);
          y += 4;
        }
      });
      addFootersToAllPages(doc);
      const filename =
        "wallet-statement-" + businessName + "-" + month.replace(/\s/g, "-") + ".pdf";
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
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border">
          <div>
            <h2 className="text-xl font-black">{t("statement", "Owner Statement")}</h2>
            <p className="text-sm text-muted-foreground">Your wallet records</p>
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
            <div className="text-muted-foreground text-sm py-8 text-center">No records yet.</div>
          ) : (
            <div className="space-y-4">
              {months.map((month) => {
                const monthRecords = getRecordsForMonth(month);
                const monthTotal = monthRecords.reduce((s, r) => {
                  if (r.kind === "order") return s + Number((r.data as Order).total);
                  if (r.kind === "tx" && (r.data as WalletTx).type === "transfer_in")
                    return s + Number((r.data as WalletTx).amount);
                  return s;
                }, 0);
                const isOpen = selectedMonth === month;
                return (
                  <div key={month} className="rounded-2xl border border-border overflow-hidden">
                    <button
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition"
                      onClick={() => setSelectedMonth(isOpen ? null : month)}
                    >
                      <span className="font-black text-sm sm:text-base lg:text-lg">{month}</span>
                      <div className="flex items-center gap-3">
                        <span className="font-black text-primary">${fmt(monthTotal)}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1"
                          type="button"
                          disabled={downloadingMonth === month}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownload(month);
                          }}
                          style={
                            downloadedMonth === month
                              ? { background: "#16a34a", color: "#fff", borderColor: "#16a34a" }
                              : {}
                          }
                        >
                          {downloadingMonth === month ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : downloadedMonth === month ? (
                            <svg
                              className="h-3 w-3 sm:h-4 sm:w-4"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          ) : (
                            <Download className="h-3 w-3 sm:h-4 sm:w-4" />
                          )}
                          {downloadingMonth === month
                            ? "…"
                            : downloadedMonth === month
                              ? "Done"
                              : "PDF"}
                        </Button>
                        <ChevronRight
                          className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`}
                        />
                      </div>
                    </button>
                    {isOpen && (
                      <div className="border-t border-border divide-y divide-border/50">
                        {monthRecords.map((rec) => {
                          if (rec.kind === "tx") {
                            const tx = rec.data;
                            const isCashierSale = tx.type === "cashier_sale";
                            const isTransferIn = tx.type === "transfer_in";
                            const isBottlePack =
                              tx.type === "bottle_finished" || tx.type === "pack_finished";
                            const isCreditTx =
                              tx.type === "credit_payment" || tx.type === "credit_charge";

                            if (isCashierSale) {
                              const parts = (tx.note ?? "").split(" | ");
                              const cashierLabel = parts[0] ?? "Cashier sale";
                              const totalStr = parts[1] ?? "";
                              const rawItems = parts.slice(2).join(", ");
                              const itemsStr = rawItems
                                .replace(/├ù/g, "x")
                                .replace(/\u00d7/g, "x")
                                .replace(/Shot \(extras\)/g, "Drink (extras)")
                                .replace(/\bShot\b/g, "Drink");
                              return (
                                <div
                                  key={tx.id}
                                  className="px-4 py-3 bg-blue-500/5 flex items-start gap-3"
                                >
                                  <div className="h-3.5 w-3.5 mt-0.5 shrink-0 text-blue-400">
                                    🧾
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-xs text-blue-400 font-bold">
                                      {cashierLabel}
                                      {totalStr ? " — " + totalStr : ""}
                                    </div>
                                    {itemsStr && (
                                      <div className="text-xs text-muted-foreground mt-0.5 break-words whitespace-normal">
                                        {itemsStr}
                                      </div>
                                    )}
                                    <div className="text-xs text-muted-foreground mt-0.5">
                                      {new Date(tx.created_at).toLocaleString("en-GB", {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                        hour12: true,
                                        day: "numeric",
                                        month: "short",
                                        year: "numeric",
                                      })}
                                    </div>
                                  </div>
                                  {tx.order_id && (
                                    <button
                                      onClick={async () => {
                                        const { data: ord } = await sb.from("orders")
                                          .select("id, items, total, paid, change_given, payment_method, order_number, created_at")
                                          .eq("id", tx.order_id)
                                          .maybeSingle();
                                        if (ord) openBillForOrder(ord as any);
                                      }}
                                      className="h-7 w-7 rounded-full flex items-center justify-center bg-blue-500/20 active:scale-95 transition shrink-0 self-center"
                                      title="Print bill"
                                    >
                                      <Receipt className="h-3.5 w-3.5 text-blue-300" />
                                    </button>
                                  )}
                                </div>
                              );
                            }
                            if (isTransferIn) {
                              return (
                                <div
                                  key={tx.id}
                                  className="px-4 py-3 flex items-center gap-3 bg-green-500/5"
                                >
                                  <ArrowDownLeft className="h-3.5 w-3.5 text-green-400 shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <div className="text-xs text-green-400 font-bold break-words whitespace-normal">
                                      {tx.note ?? "Cleared from cashier"}
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-0.5">
                                      {new Date(tx.created_at).toLocaleString("en-GB", {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                        hour12: true,
                                        day: "numeric",
                                        month: "short",
                                        year: "numeric",
                                      })}
                                    </div>
                                  </div>
                                  <span className="font-black text-sm text-green-400">
                                    +${Number(tx.amount).toFixed(2)}
                                  </span>
                                </div>
                              );
                            }
                            if (isBottlePack) {
                              const isPack = tx.type === "pack_finished";
                              return (
                                <div
                                  key={tx.id}
                                  className={`px-4 py-3 flex items-start gap-3 ${isPack ? "bg-green-500/5" : "bg-amber-500/5"}`}
                                >
                                  <span className="text-base shrink-0">{isPack ? "🚬" : "🍾"}</span>
                                  <div className="flex-1 min-w-0">
                                    <div
                                      className={`text-xs font-bold break-words whitespace-normal ${isPack ? "text-green-400" : "text-amber-400"}`}
                                    >
                                      {tx.note}
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-0.5">
                                      {new Date(tx.created_at).toLocaleString("en-GB", {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                        hour12: true,
                                        day: "numeric",
                                        month: "short",
                                        year: "numeric",
                                      })}
                                    </div>
                                  </div>
                                </div>
                              );
                            }
                            if (isCreditTx) {
                              const isPayment = tx.type === "credit_payment";
                              const isReadOnly = isPayment && Number(tx.amount) === 0;
                              const noteParts = (tx.note ?? "").split(" | ");
                              const titlePart =
                                noteParts[0] ?? (isPayment ? "Credit payment" : "Credit charge");
                              const paidPart = noteParts.find((p) => p.startsWith("Paid:")) ?? "";
                              const remainPart =
                                noteParts.find(
                                  (p) =>
                                    p.startsWith("Remaining:") ||
                                    p.startsWith("Balance remaining:"),
                                ) ?? "";
                              const cashierPart =
                                noteParts.find((p) => p.startsWith("Cashier:")) ?? "";
                              const amountPart = !isPayment
                                ? (noteParts.find((p) => p.startsWith("$")) ?? "")
                                : "";
                              const itemsPart =
                                noteParts
                                  .find((p) => p.startsWith("Items:"))
                                  ?.replace("Items: ", "") ?? "";
                              const discRaw = noteParts.find((p) => p.startsWith("Disc:")) ?? "";
                              const discMatch = discRaw.match(
                                /Disc:\s*-\$?([\d.]+)(?:\s*\(orig\s*\$?([\d.]+)\))?/,
                              );
                              const discAmt = discMatch ? Number(discMatch[1]) : 0;
                              const discOrig = discMatch?.[2] ? Number(discMatch[2]) : null;
                              return (
                                <div
                                  key={tx.id}
                                  className={`px-4 py-3 flex items-start gap-3 ${isPayment ? "bg-green-500/5" : "bg-orange-500/5"}`}
                                >
                                  <span className="text-base shrink-0">
                                    {isPayment ? "💳" : "🪙"}
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <div
                                      className={`text-xs font-bold leading-snug ${isPayment ? "text-green-400" : "text-primary"}`}
                                    >
                                      {titlePart}
                                    </div>
                                    {(paidPart || remainPart) && (
                                      <div className="text-xs text-muted-foreground mt-0.5">
                                        {[paidPart, remainPart].filter(Boolean).join(" · ")}
                                      </div>
                                    )}
                                    {itemsPart && (
                                      <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed break-words whitespace-normal">
                                        {itemsPart}
                                      </div>
                                    )}
                                    {discAmt > 0 && (
                                      <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
                                        {discOrig != null && (
                                          <span className="text-[9px] text-muted-foreground line-through">
                                            ${fmt(discOrig)}
                                          </span>
                                        )}
                                        <span
                                          className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-black leading-tight"
                                          style={{
                                            background: "rgba(251,191,36,0.2)",
                                            color: "#fbbf24",
                                            border: "1px solid rgba(251,191,36,0.4)",
                                          }}
                                        >
                                          -{fmt(discAmt)} off
                                        </span>
                                      </div>
                                    )}
                                    {cashierPart && (
                                      <div className="text-xs text-muted-foreground mt-0.5">
                                        {cashierPart}
                                      </div>
                                    )}
                                    <div className="text-xs text-muted-foreground mt-0.5">
                                      {new Date(tx.created_at).toLocaleString("en-GB", {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                        hour12: true,
                                        day: "numeric",
                                        month: "short",
                                        year: "numeric",
                                      })}
                                    </div>
                                  </div>
                                  {isPayment &&
                                    (!isReadOnly ? (
                                      <span className="font-black text-lg shrink-0 text-green-400">
                                        +${Number(tx.amount).toFixed(2)}
                                      </span>
                                    ) : cashierPart ? (
                                      <span
                                        className="text-xs shrink-0 px-1.5 py-0.5 rounded-full font-semibold"
                                        style={{
                                          background: "rgba(34,197,94,0.12)",
                                          color: "#86efac",
                                        }}
                                      >
                                        with cashier
                                      </span>
                                    ) : null)}
                                  {!isPayment && (
                                    <button
                                      onClick={() => openBillForCreditTx(tx)}
                                      className="h-7 w-7 rounded-full flex items-center justify-center bg-blue-500/20 active:scale-95 transition shrink-0 self-center"
                                      title="Print receipt"
                                    >
                                      <Receipt className="h-3.5 w-3.5 text-blue-300" />
                                    </button>
                                  )}
                                </div>
                              );
                            }
                            return null;
                          }
                          const o = rec.data as Order;
                          return (
                            <div key={o.id} className="px-4 py-3 md:px-6 md:py-4">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 min-w-0">
                                  <Receipt className="h-3.5 w-3.5 md:h-4 md:w-4 text-primary shrink-0" />
                                  <span className="text-xs md:text-sm text-muted-foreground">
                                    {new Date(o.created_at).toLocaleString("en-GB", {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                      hour12: true,
                                      day: "numeric",
                                      month: "short",
                                      year: "numeric",
                                    })}
                                  </span>
                                </div>
                                <span className="font-black text-primary text-sm md:text-base ml-2">
                                  ${fmt(Number(o.total))}
                                </span>
                              </div>
                              <div className="mt-1 text-xs md:text-sm text-muted-foreground break-words whitespace-normal">
                                {(o.items || [])
                                  .slice()
                                  .sort((a, b) => a.name.localeCompare(b.name))
                                  .map((i, idx) => (
                                    <span
                                      key={idx}
                                      className="inline-flex items-center gap-1 mr-1.5 flex-wrap"
                                    >
                                      <span>
                                        {i.qty}× {i.name}
                                      </span>
                                      {i.discount && Number(i.discount) > 0 ? (
                                        <>
                                          {i.original_price != null && (
                                            <span className="text-[9px] md:text-[10px] text-muted-foreground line-through">
                                              ${fmt(Number(i.original_price))}
                                            </span>
                                          )}
                                          <span
                                            className="inline-flex items-center px-1 py-0 rounded-full text-[9px] md:text-[10px] font-black leading-tight"
                                            style={{
                                              background: "rgba(251,191,36,0.2)",
                                              color: "#fbbf24",
                                              border: "1px solid rgba(251,191,36,0.4)",
                                            }}
                                          >
                                            -{fmt(Number(i.discount))} off
                                          </span>
                                        </>
                                      ) : null}
                                    </span>
                                  ))}
                              </div>
                              {o.discount_amount != null && Number(o.discount_amount) > 0 && (
                                <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
                                  {o.original_total != null && (
                                    <span className="text-[9px] md:text-[10px] text-muted-foreground line-through">
                                      ${fmt(Number(o.original_total))}
                                    </span>
                                  )}
                                  <span
                                    className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] md:text-[10px] font-black leading-tight"
                                    style={{
                                      background: "rgba(251,191,36,0.2)",
                                      color: "#fbbf24",
                                      border: "1px solid rgba(251,191,36,0.4)",
                                    }}
                                  >
                                    -{fmt(Number(o.discount_amount))} off
                                  </span>
                                </div>
                              )}
                              <div className="mt-0.5 text-xs md:text-sm text-muted-foreground">
                                Paid ${fmt(Number(o.paid))} · Change ${fmt(Number(o.change_given))}
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
      {billData && (
        <BillModal
          bill={billData}
          onClose={() => setBillData(null)}
          onPrint={handlePrintBill}
          onPdfShare={handlePdfShare}
          printing={printingBill}
        />
      )}
    </div>
  );
}

// ─── In-App Number Pad ────────────────────────────────────────────────────────
function NumPad({
  value,
  onChange,
  onDone,
  onCancel,
  label,
  confirmLabel,
  sessionType,
  onSessionChange,
}: {
  value: string;
  onChange: (v: string) => void;
  onDone: () => void;
  onCancel: () => void;
  label?: string;
  confirmLabel?: string;
  sessionType?: "same" | "new";
  onSessionChange?: (mode: "same" | "new") => void;
}) {
  const press = (key: string) => {
    if (key === "⌫") {
      onChange(value.slice(0, -1));
    } else if (key === ".") {
      if (!value.includes(".")) onChange(value + ".");
    } else {
      // Prevent more than 2 decimal places
      const parts = value.split(".");
      if (parts[1] !== undefined && parts[1].length >= 2) return;
      onChange(value + key);
    }
  };

  const pressRef = useRef(press);
  pressRef.current = press;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        pressRef.current(e.key);
      } else if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        pressRef.current("⌫");
      } else if (e.key === ".") {
        e.preventDefault();
        pressRef.current(".");
      } else if (e.key === "Enter") {
        e.preventDefault();
        onDone();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDone, onCancel]);

  const display = value === "" ? "0" : value;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-t-3xl pb-8 pt-4 px-4 space-y-3"
        style={{ background: "oklch(0.13 0.03 60)", border: "1px solid oklch(0.3 0.08 60)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Label */}
        {label && (
          <p className="text-center text-xs font-semibold" style={{ color: "oklch(0.65 0.15 65)" }}>
            {label}
          </p>
        )}

        {/* Session selector — only shown when onSessionChange is provided */}
        {onSessionChange && sessionType && (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onSessionChange("same")}
              className="h-12 rounded-2xl font-black text-sm transition active:scale-95"
              style={
                sessionType === "same"
                  ? { background: "oklch(0.60 0.18 65)", color: "#000" }
                  : {
                      background: "oklch(0.20 0.05 60)",
                      color: "oklch(0.65 0.15 65)",
                      border: "1.5px solid oklch(0.35 0.10 60)",
                    }
              }
            >
              Same Session
            </button>
            <button
              type="button"
              onClick={() => onSessionChange("new")}
              className="h-12 rounded-2xl font-black text-sm transition active:scale-95"
              style={
                sessionType === "new"
                  ? { background: "oklch(0.60 0.18 65)", color: "#000" }
                  : {
                      background: "oklch(0.20 0.05 60)",
                      color: "oklch(0.65 0.15 65)",
                      border: "1.5px solid oklch(0.35 0.10 60)",
                    }
              }
            >
              New Session
            </button>
          </div>
        )}

        {/* Session hint */}
        {onSessionChange && sessionType && (
          <p className="text-center text-[11px]" style={{ color: "oklch(0.55 0.10 65)" }}>
            {sessionType === "same"
              ? "Adds to current float — used amount unchanged"
              : "Starts fresh — used amount resets to $0"}
          </p>
        )}

        {/* Display */}
        <div
          className="rounded-2xl px-5 py-4 text-right"
          style={{ background: "oklch(0.18 0.04 60)", border: "1px solid oklch(0.28 0.08 60)" }}
        >
          <span className="font-black text-4xl" style={{ color: "oklch(0.82 0.18 65)" }}>
            ${display}
          </span>
        </div>

        {/* Keys */}
        <div className="grid grid-cols-3 gap-2">
          {["7", "8", "9", "4", "5", "6", "1", "2", "3"].map((k) => (
            <button
              key={k}
              onClick={() => press(k)}
              className="rounded-2xl py-4 text-xl font-black active:scale-95 transition"
              style={{ background: "oklch(0.20 0.05 60)", color: "#fff" }}
            >
              {k}
            </button>
          ))}
          <button
            onClick={() => press(".")}
            className="rounded-2xl py-4 text-xl font-black active:scale-95 transition"
            style={{ background: "oklch(0.20 0.05 60)", color: "#fff" }}
          >
            .
          </button>
          <button
            onClick={() => press("0")}
            className="rounded-2xl py-4 text-xl font-black active:scale-95 transition"
            style={{ background: "oklch(0.20 0.05 60)", color: "#fff" }}
          >
            0
          </button>
          <button
            onClick={() => press("⌫")}
            className="rounded-2xl py-4 text-xl font-black active:scale-95 transition"
            style={{ background: "oklch(0.20 0.05 60)", color: "oklch(0.75 0.15 65)" }}
          >
            ⌫
          </button>
        </div>

        {/* Done */}
        <button
          onClick={onDone}
          className="w-full py-4 rounded-2xl text-base font-black active:scale-95 transition"
          style={{ background: "oklch(0.60 0.18 65)", color: "#000" }}
        >
          {confirmLabel ?? "Done"}
        </button>
      </div>
    </div>
  );
}

// ─── Financials Tab ───────────────────────────────────────────────────────────
function FinancialsTab({
  ownerId,
  ownerWalletBalance,
  totalIncome,
  onDataChange,
  barSessionStart,
  barClosedAt,
}: {
  ownerId: string;
  ownerWalletBalance: number;
  totalIncome: number;
  onDataChange?: () => void;
  barSessionStart?: string | null;
  barClosedAt?: string | null;
}) {
  const [expenses, setExpenses] = useState<OwnerExpense[]>([]);
  const [monthlyIncome, setMonthlyIncome] = useState<Record<string, number>>({});
  const [loadingData, setLoadingData] = useState(true);
  const [downloadingMonth, setDownloadingMonth] = useState<string | null>(null);
  const [downloadedMonth, setDownloadedMonth] = useState<string | null>(null);

  // ── Add Expense form state ────────────────────────────────────────────────
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [expenseLines, setExpenseLines] = useState<{ description: string; amount: string }[]>([
    { description: "", amount: "" },
  ]);
  const [savingExpense, setSavingExpense] = useState(false);
  const [confirmingExpense, setConfirmingExpense] = useState(false);
  // Session picker — shown after confirm when bar is closed
  const [pickingSession, setPickingSession] = useState(false);
  const [pendingExpenseTotal, setPendingExpenseTotal] = useState(0);
  const [pendingExpenseDesc, setPendingExpenseDesc] = useState("");
  const [pendingExpenseDate, setPendingExpenseDate] = useState("");

  // ── Edit / Delete non-stock expense ───────────────────────────────────────
  const [editExpenseId, setEditExpenseId] = useState<string | null>(null);
  const [editExpenseLines, setEditExpenseLines] = useState<{ description: string; amount: string }[]>([]);
  const [editExpenseSaving, setEditExpenseSaving] = useState(false);
  const [deleteExpenseId, setDeleteExpenseId] = useState<string | null>(null);
  const [deleteExpenseDeleting, setDeleteExpenseDeleting] = useState(false);

  const lastNonStockExpenseId = expenses.find(
    (e) => (e.description ?? "").startsWith("Non-Stock Expense")
  )?.id ?? null;

  const barIsOpen = !!barSessionStart && !barClosedAt;

  // Sessions from bar_sessions table for the picker
  const [availableSessions, setAvailableSessions] = useState<
    { id: string; session_start: string; session_end: string | null }[]
  >([]);
  useEffect(() => {
    if (!ownerId) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("bar_sessions")
      .select("id, opened_at, closed_at")
      .eq("owner_id", ownerId)
      .order("opened_at", { ascending: false })
      .limit(10)
      .then(
        ({
          data,
        }: {
          data: { id: string; opened_at: string; closed_at: string | null }[] | null;
        }) => {
          // Map to the shape the rest of this component expects (session_start/session_end)
          setAvailableSessions(
            (data ?? []).map((s) => ({
              id: s.id,
              session_start: s.opened_at,
              session_end: s.closed_at,
            })),
          );
        },
      );
  }, [ownerId]);

  const fmtSessionTs = (iso: string) => {
    const d = new Date(iso);
    return (
      d.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        timeZone: "America/Port_of_Spain",
      }) +
      " · " +
      d.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
        timeZone: "America/Port_of_Spain",
      })
    );
  };

  const addExpenseLine = () => setExpenseLines((l) => [...l, { description: "", amount: "" }]);
  const removeExpenseLine = (i: number) => setExpenseLines((l) => l.filter((_, idx) => idx !== i));
  const updateLine = (i: number, field: "description" | "amount", val: string) =>
    setExpenseLines((l) => l.map((line, idx) => (idx === i ? { ...line, [field]: val } : line)));

  const handleSaveExpense = async (overrideCreatedAt?: string) => {
    const valid = expenseLines.filter((l) => l.description.trim() && parseFloat(l.amount) > 0);
    if (!valid.length) {
      toast.error("Add at least one item with a description and amount");
      return;
    }
    setSavingExpense(true);
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Port_of_Spain" });
    try {
      const total = valid.reduce((s, l) => s + parseFloat(l.amount), 0);
      const description =
        "Non-Stock Expense\n" +
        valid
          .map((l) => `${l.description.trim()} = $${parseFloat(l.amount).toFixed(2)}`)
          .join("\n");
      const insertData: Record<string, unknown> = {
        owner_id: ownerId,
        amount: total,
        description,
        expense_date: today,
      };
      // If a session override timestamp is provided, use it so the expense lands in that session
      if (overrideCreatedAt) insertData.created_at = overrideCreatedAt;
      const { error } = await (sb as any).from("owner_expenses").insert(insertData);
      if (error) {
        toast.error(error.message);
        return;
      }
      const newBal = Number(ownerWalletBalance) - total;
      await (sb as any).from("profiles").update({ wallet_balance: newBal }).eq("id", ownerId);
      toast.success("Expense saved");
      setExpenseLines([{ description: "", amount: "" }]);
      setShowAddExpense(false);
      setConfirmingExpense(false);
      setPickingSession(false);
      setPendingExpenseTotal(0);
      setPendingExpenseDesc("");
      setPendingExpenseDate("");
      loadData();
      onDataChange?.();
    } finally {
      setSavingExpense(false);
    }
  };

  // Called from the first "Save Expense" button — intercepts if bar is closed to ask which session
  const handleExpenseSubmit = () => {
    const valid = expenseLines.filter((l) => l.description.trim() && parseFloat(l.amount) > 0);
    if (!valid.length) {
      toast.error("Add at least one item with a description and amount");
      return;
    }

    if (!barIsOpen) {
      // Bar is closed — need to pick which session this expense belongs to
      const total = valid.reduce((s, l) => s + parseFloat(l.amount), 0);
      const desc =
        "Non-Stock Expense\n" +
        valid
          .map((l) => `${l.description.trim()} = $${parseFloat(l.amount).toFixed(2)}`)
          .join("\n");
      setPendingExpenseTotal(total);
      setPendingExpenseDesc(desc);
      setPendingExpenseDate(
        new Date().toLocaleDateString("en-CA", { timeZone: "America/Port_of_Spain" }),
      );
      setConfirmingExpense(false);
      setPickingSession(true);
    } else {
      setConfirmingExpense(true);
    }
  };

  // Accordion
  const [openMonth, setOpenMonth] = useState<string | null>(null);

  // ── Edit non-stock expense handler ──────────────────────────────────────
  const startEditExpense = (e: OwnerExpense) => {
    const raw = (e.description ?? "").replace("Non-Stock Expense\n", "").trim();
    const parsed = raw
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => {
        const match = l.match(/^(.+?)\s*=\s*\$?([\d.]+)$/);
        if (match) return { description: match[1].trim(), amount: match[2] };
        return { description: l.trim(), amount: String(e.amount) };
      });
    setEditExpenseLines(parsed.length > 0 ? parsed : [{ description: "", amount: String(e.amount) }]);
    setEditExpenseId(e.id);
  };

  const handleEditExpenseSave = async (e: OwnerExpense) => {
    const valid = editExpenseLines.filter((l) => l.description.trim() && parseFloat(l.amount) > 0);
    if (!valid.length) { toast.error("Add at least one item with description and amount"); return; }
    setEditExpenseSaving(true);
    const newTotal = valid.reduce((s, l) => s + parseFloat(l.amount), 0);
    const diff = newTotal - Number(e.amount);
    const description =
      "Non-Stock Expense\n" +
      valid.map((l) => `${l.description.trim()} = $${parseFloat(l.amount).toFixed(2)}`).join("\n");
    try {
      const { error: upErr } = await (sb as any)
        .from("owner_expenses").update({ amount: newTotal, description }).eq("id", e.id);
      if (upErr) { toast.error(upErr.message); return; }
      // Adjust owner wallet balance by the diff
      if (diff !== 0) {
        await (sb as any).from("profiles")
          .update({ wallet_balance: Number(ownerWalletBalance) - diff }).eq("id", ownerId);
      }
      toast.success("Expense updated");
      setEditExpenseId(null);
      loadData();
      onDataChange?.();
    } finally {
      setEditExpenseSaving(false);
    }
  };

  const handleDeleteExpense = async (e: OwnerExpense) => {
    setDeleteExpenseDeleting(true);
    try {
      const { error } = await (sb as any).from("owner_expenses").delete().eq("id", e.id);
      if (error) { toast.error(error.message); return; }
      // Refund amount back to owner wallet
      await (sb as any).from("profiles")
        .update({ wallet_balance: Number(ownerWalletBalance) + Number(e.amount) }).eq("id", ownerId);
      toast.success("Expense deleted — wallet refunded");
      setDeleteExpenseId(null);
      loadData();
      onDataChange?.();
    } finally {
      setDeleteExpenseDeleting(false);
    }
  };

  const loadData = useCallback(async () => {
    setLoadingData(true);
    const [expRes, ownerOrdRes, transfersRes, creditRes] = await Promise.all([
      sb
        .from("owner_expenses")
        .select("*")
        .eq("owner_id", ownerId)
        .order("created_at", { ascending: false }),
      // Only owner's OWN direct orders (not cashier orders — cash still with cashier until cleared)
      supabase
        .from("orders")
        .select("total, created_at")
        .eq("owner_id", ownerId)
        .eq("cashier_id", ownerId),
      // Transfer-in: cashier balances cleared to owner
      supabase
        .from("wallet_transactions")
        .select("amount, created_at")
        .eq("profile_id", ownerId)
        .eq("type", "transfer_in"),
      // Credit payments collected directly by the owner
      supabase
        .from("wallet_transactions")
        .select("amount, created_at")
        .eq("profile_id", ownerId)
        .eq("type", "credit_payment")
        .gt("amount", 0),
    ]);
    setExpenses((expRes.data ?? []) as OwnerExpense[]);
    // Build per-month income map: owner direct sales + transfers in + credit payments
    const incomeMap: Record<string, number> = {};
    for (const o of (ownerOrdRes.data ?? []) as { total: number; created_at: string }[]) {
      const mk = monthKey(o.created_at);
      incomeMap[mk] = (incomeMap[mk] ?? 0) + Number(o.total);
    }
    for (const t of (transfersRes.data ?? []) as { amount: number; created_at: string }[]) {
      const mk = monthKey(t.created_at);
      incomeMap[mk] = (incomeMap[mk] ?? 0) + Number(t.amount);
    }
    for (const t of (creditRes.data ?? []) as { amount: number; created_at: string }[]) {
      const mk = monthKey(t.created_at);
      incomeMap[mk] = (incomeMap[mk] ?? 0) + Number(t.amount);
    }
    setMonthlyIncome(incomeMap);
    setLoadingData(false);
  }, [ownerId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Realtime — refresh financials when orders or expenses change
  useEffect(() => {
    const ch = supabase
      .channel(`wallet-financials-${ownerId}`)
      // All orders for this owner (cashier + direct)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `owner_id=eq.${ownerId}` },
        () => loadData(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "owner_expenses", filter: `owner_id=eq.${ownerId}` },
        () => loadData(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "wallet_transactions",
          filter: `profile_id=eq.${ownerId}`,
        },
        () => loadData(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [ownerId, loadData]);

  // ── Derived totals ────────────────────────────────────────────────────────
  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const netProfit = totalIncome - totalExpenses;

  // ── Group expenses by month ───────────────────────────────────────────────
  const expensesByMonth: Record<string, OwnerExpense[]> = {};
  expenses.forEach((e) => {
    const key = monthKey(e.expense_date);
    if (!expensesByMonth[key]) expensesByMonth[key] = [];
    expensesByMonth[key].push(e);
  });
  const expenseMonths = Object.keys(expensesByMonth).sort((a, b) => b.localeCompare(a));

  const handleDownloadExpenseSheet = async (mk: string) => {
    if (downloadingMonth) return;
    setDownloadingMonth(mk);
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "mm", format: "a4" });
      const label = monthLabel(mk);
      const generated = new Date().toLocaleString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
        day: "numeric",
        month: "short",
        year: "numeric",
      });

      const mExpenses = expensesByMonth[mk] ?? [];
      const mExpTotal = mExpenses.reduce((s, e) => s + Number(e.amount), 0);
      const mIncome = monthlyIncome[mk] ?? 0;
      // All-time totals for net profit
      const allTimeIncome = Object.values(monthlyIncome).reduce((s, v) => s + v, 0);
      const allTimeExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);
      const allTimeNet = allTimeIncome - allTimeExpenses;

      let y = await drawHeader(doc, "Owner Financials", "Expense Report", label, generated);

      // ── Generated timestamp ───────────────────────────────────────────────
      doc.setFont("helvetica", "italic");
      doc.setFontSize(7);
      doc.setTextColor(150, 100, 30);
      doc.text(
        "Generated: " + generated + "  |  This document is system-generated and tamper-evident.",
        LM,
        y,
      );
      doc.setTextColor(0, 0, 0);
      y += 5;

      // ── Summary box ──────────────────────────────────────────────────────
      const boxX = LM;
      const boxW = RM - LM;
      const boxH = 28;
      doc.setFillColor(245, 240, 230);
      doc.roundedRect(boxX, y, boxW, boxH, 2, 2, "F");
      doc.setDrawColor(232, 146, 42);
      doc.setLineWidth(0.4);
      doc.roundedRect(boxX, y, boxW, boxH, 2, 2, "S");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(100, 70, 10);
      doc.text("SUMMARY (ALL TIME TO " + label.toUpperCase() + ")", boxX + 3, y + 5);

      const cols = [
        {
          label: "This Month Income",
          value: "$" + fmt(mIncome),
          color: [40, 140, 40] as [number, number, number],
        },
        {
          label: "Non-Stock Expenses",
          value: "$" + fmt(allTimeExpenses),
          color: [180, 40, 40] as [number, number, number],
        },
        {
          label: "Net Profit",
          value: (allTimeNet >= 0 ? "+" : "") + "$" + fmt(allTimeNet),
          color: (allTimeNet >= 0 ? [40, 140, 40] : [180, 40, 40]) as [number, number, number],
        },
      ];
      const colW = boxW / cols.length;
      cols.forEach((col, i) => {
        const cx = boxX + i * colW + colW / 2;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.5);
        doc.setTextColor(100, 100, 100);
        doc.text(col.label, cx, y + 13, { align: "center" });
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(col.color[0], col.color[1], col.color[2]);
        doc.text(col.value, cx, y + 21, { align: "center" });
      });
      doc.setTextColor(0, 0, 0);
      y += boxH + 5;

      // ── Column headers ────────────────────────────────────────────────────
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(130, 130, 130);
      doc.text("DATE / DESCRIPTION", LM, y);
      doc.text("AMOUNT", RM, y, { align: "right" });
      y += 3;
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.2);
      doc.line(LM, y, RM, y);
      y += 5;
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(0, 0, 0);

      // ── Rows — grouped by date ────────────────────────────────────────────
      // Sort by date descending then group
      const byDate: Record<string, typeof mExpenses> = {};
      mExpenses.forEach((e) => {
        const dk = e.expense_date; // "YYYY-MM-DD"
        if (!byDate[dk]) byDate[dk] = [];
        byDate[dk].push(e);
      });
      const dateKeys = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

      dateKeys.forEach((dk) => {
        if (y > CONTENT_BOTTOM) {
          doc.addPage();
          y = 20;
        }

        // Date header row
        const dateStr = new Date(dk + "T00:00:00").toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        });
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(80, 50, 10);
        doc.text(dateStr, LM, y);
        y += 5;

        // Items under this date
        byDate[dk].forEach((e) => {
          if (y > CONTENT_BOTTOM) {
            doc.addPage();
            y = 20;
          }

          // Description line
          const desc = e.description?.trim() || "Expense";
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8.5);
          doc.setTextColor(40, 40, 40);
          // Wrap long descriptions
          const maxW = RM - LM - 30;
          const lines = doc.splitTextToSize("  " + desc, maxW);
          lines.forEach((line: string, li: number) => {
            if (y > CONTENT_BOTTOM) {
              doc.addPage();
              y = 20;
            }
            if (li === 0) {
              // First line — print amount on same row
              doc.text(line, LM, y);
              doc.setFont("helvetica", "bold");
              doc.setFontSize(8.5);
              doc.setTextColor(180, 40, 40);
              doc.text("$" + Number(e.amount).toFixed(2), RM, y, { align: "right" });
              doc.setTextColor(40, 40, 40);
              doc.setFont("helvetica", "normal");
            } else {
              doc.text(line, LM, y);
            }
            y += 4.5;
          });

          // Thin separator between items
          doc.setDrawColor(230, 230, 230);
          doc.setLineWidth(0.1);
          doc.line(LM + 4, y, RM, y);
          y += 3;
        });

        // Slightly thicker separator between date groups
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.2);
        doc.line(LM, y, RM, y);
        y += 4;
      });

      // ── This month subtotal ───────────────────────────────────────────────
      if (mExpenses.length > 0) {
        if (y > CONTENT_BOTTOM) {
          doc.addPage();
          y = 20;
        }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setDrawColor(232, 146, 42);
        doc.setLineWidth(0.4);
        doc.line(LM, y, RM, y);
        y += 4;
        doc.setTextColor(100, 70, 10);
        doc.text("THIS MONTH'S EXPENSES", LM, y);
        doc.setTextColor(180, 40, 40);
        doc.text("$" + fmt(mExpTotal), RM, y, { align: "right" });
        doc.setTextColor(0, 0, 0);
        y += 4;
      }

      addFootersToAllPages(doc);
      const filename = `expense-report-${label.replace(/\s/g, "-")}.pdf`;
      await downloadPdf(filename, doc.output("datauristring"));
      toast.success("PDF saved to Downloads folder");
      setDownloadedMonth(mk);
      setTimeout(() => setDownloadedMonth(null), 5000);
    } catch (err: any) {
      console.error("Expense PDF error:", err);
      toast.error("Download failed: " + (err?.message ?? "unknown error"));
    } finally {
      setDownloadingMonth(null);
    }
  };

  if (loadingData) {
    return (
      <div className="space-y-3 pt-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl h-16 bg-muted/30 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5 pt-2 pb-24">
      {/* ── Expense History by Month ──────────────────────────────────────── */}
      {/* Add Expense button + form */}
      <div className="space-y-2">
        <button
          onClick={() => setShowAddExpense((v) => !v)}
          className="w-full h-11 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition active:scale-[0.98] border"
          style={
            showAddExpense
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
          {showAddExpense ? "✕ Cancel" : "+ Add Expense"}
        </button>

        {showAddExpense && (
          <div
            className="rounded-2xl border border-border p-4 space-y-3"
            style={{ background: "var(--gradient-card)" }}
          >
            <p className="text-xs font-black text-muted-foreground uppercase tracking-widest">
              Expense Lines
            </p>
            {expenseLines.map((line, i) => (
              <div key={i} className="space-y-1.5">
                <input
                  value={line.description}
                  onChange={(e) => updateLine(i, "description", e.target.value)}
                  placeholder="Description (e.g. Staff Salary)"
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
                  {expenseLines.length > 1 && (
                    <button
                      onClick={() => removeExpenseLine(i)}
                      className="h-10 w-10 rounded-xl flex items-center justify-center bg-destructive/15 text-destructive active:scale-90 transition shrink-0"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
            <button
              onClick={addExpenseLine}
              className="w-full h-9 rounded-xl border border-dashed border-border text-xs font-black text-muted-foreground hover:text-foreground transition active:scale-[0.98]"
            >
              + Add Line
            </button>
            <div className="pt-1 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground font-semibold">
                  Total:{" "}
                  <span className="font-black text-foreground">
                    ${expenseLines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0).toFixed(2)}
                  </span>
                </span>
              </div>
              {!confirmingExpense ? (
                <button
                  onClick={handleExpenseSubmit}
                  className="w-full h-10 rounded-xl font-black text-sm text-primary-foreground flex items-center justify-center gap-2 transition active:scale-95"
                  style={{ background: "var(--gradient-hero)" }}
                >
                  Save Expense
                </button>
              ) : pickingSession ? (
                <div className="space-y-3">
                  <p className="text-xs font-black text-center" style={{ color: "var(--primary)" }}>
                    Bar is closed — which session is this expense for?
                  </p>
                  <p className="text-xs text-center text-muted-foreground">
                    ${pendingExpenseTotal.toFixed(2)} expense
                  </p>
                  {/* Previous session — most recent closed session */}
                  {availableSessions.length > 0 ? (
                    <div className="space-y-2">
                      {availableSessions.slice(0, 3).map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          disabled={savingExpense}
                          onClick={() => {
                            // Use a timestamp just before session_end so it lands inside that session
                            const ts = s.session_end
                              ? new Date(new Date(s.session_end).getTime() - 1000).toISOString()
                              : new Date().toISOString();
                            handleSaveExpense(ts);
                          }}
                          className="w-full rounded-xl px-3 py-2.5 text-left transition active:scale-[0.98] disabled:opacity-50"
                          style={{
                            background: "rgba(255,255,255,0.04)",
                            border: "1px solid var(--border)",
                          }}
                        >
                          <p className="text-xs font-black text-foreground">
                            {s.session_end ? "Closed session" : "🟢 Current session"}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {fmtSessionTs(s.session_start)}
                            {s.session_end && ` → ${fmtSessionTs(s.session_end)}`}
                          </p>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={savingExpense}
                      onClick={() => handleSaveExpense()}
                      className="w-full h-10 rounded-xl font-black text-sm text-primary-foreground disabled:opacity-50 flex items-center justify-center transition active:scale-95"
                      style={{ background: "var(--gradient-hero)" }}
                    >
                      {savingExpense ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Save to Previous Session"
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setPickingSession(false)}
                    className="w-full h-9 rounded-xl font-black text-sm border border-border transition active:scale-95"
                    style={{ background: "var(--gradient-card)" }}
                  >
                    ← Go Back
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs font-black text-center text-muted-foreground">
                    Confirm save this expense?
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setConfirmingExpense(false)}
                      className="h-10 rounded-xl font-black text-sm border border-border transition active:scale-95"
                      style={{ background: "var(--gradient-card)" }}
                    >
                      ← Go Back
                    </button>
                    <button
                      onClick={() => handleSaveExpense()}
                      disabled={savingExpense}
                      className="h-10 rounded-xl font-black text-sm text-primary-foreground disabled:opacity-50 flex items-center justify-center gap-2 transition active:scale-95"
                      style={{ background: "var(--gradient-hero)" }}
                    >
                      {savingExpense ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Confirm Save
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Expense history list */}
      {expenseMonths.length > 0 ? (
        <div className="space-y-2">
          <h3 className="font-black text-sm text-muted-foreground uppercase tracking-wider px-1">
            Expense History
          </h3>
          {expenseMonths.map((mk) => {
            const mExpenses = expensesByMonth[mk];
            const mTotal = mExpenses.reduce((s, e) => s + Number(e.amount), 0);
            const mIncome = monthlyIncome[mk] ?? 0;
            // All-time income up to and including this month
            const allIncomeToMonth = Object.entries(monthlyIncome)
              .filter(([k]) => k <= mk)
              .reduce((s, [, v]) => s + v, 0);
            const allExpenses = totalExpenses;
            const runningNet = allIncomeToMonth - allExpenses;
            const isOpen = openMonth === mk;
            return (
              <div key={mk} className="rounded-2xl border border-border overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition"
                  onClick={() => setOpenMonth(isOpen ? null : mk)}
                >
                  <div className="flex items-center gap-3">
                    <span className="font-black text-sm sm:text-base lg:text-lg">
                      {monthLabel(mk)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {mExpenses.length} {mExpenses.length === 1 ? "entry" : "entries"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-xs text-red-400 font-bold">${fmt(mTotal)}</div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1"
                      type="button"
                      disabled={downloadingMonth === mk}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownloadExpenseSheet(mk);
                      }}
                      style={
                        downloadedMonth === mk
                          ? { background: "#16a34a", color: "#fff", borderColor: "#16a34a" }
                          : {}
                      }
                    >
                      {downloadingMonth === mk ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : downloadedMonth === mk ? (
                        <svg
                          className="h-3 w-3 sm:h-4 sm:w-4"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      ) : (
                        <Download className="h-3 w-3 sm:h-4 sm:w-4" />
                      )}
                      {downloadingMonth === mk ? "…" : downloadedMonth === mk ? "Done" : "PDF"}
                    </Button>
                    <ChevronDown
                      className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
                    />
                  </div>
                </button>
                {isOpen && (
                  <div className="border-t border-border divide-y divide-border/50">
                    {mExpenses.map((e) => {
                      const raw = e.description ?? "Stock expense";
                      const isReverted = raw.startsWith("Reverted Stock Expense");
                      const isNonStock = raw.startsWith("Non-Stock Expense\n");
                      const isBulk =
                        raw.startsWith("Bulk Stock Update\n") ||
                        raw.startsWith("Bulk Expense\n") ||
                        isNonStock ||
                        isReverted;

                      const isLastNonStock = isNonStock && e.id === lastNonStockExpenseId;
                      const isEditing = editExpenseId === e.id;
                      const isDeleteConfirm = deleteExpenseId === e.id;

                      // ── Inline edit form ──
                      if (isEditing) {
                        return (
                          <div key={e.id} className="px-4 py-3 space-y-2">
                            <p className="text-xs font-black text-muted-foreground uppercase tracking-widest">Edit Expense</p>
                            {editExpenseLines.map((el, i) => (
                              <div key={i} className="space-y-1">
                                <input value={el.description} onChange={(ev) => setEditExpenseLines((ls) => ls.map((l, idx) => idx === i ? { ...l, description: ev.target.value } : l))} placeholder="Description" className="w-full h-9 rounded-xl border border-border bg-muted px-3 text-sm font-bold outline-none focus:ring-1 focus:ring-primary" />
                                <div className="flex gap-2">
                                  <input value={el.amount} onChange={(ev) => setEditExpenseLines((ls) => ls.map((l, idx) => idx === i ? { ...l, amount: ev.target.value } : l))} placeholder=".00" type="number" min="0" step="0.01" className="flex-1 h-9 rounded-xl border border-border bg-muted px-3 text-sm font-bold outline-none focus:ring-1 focus:ring-primary" />
                                  {editExpenseLines.length > 1 && <button onClick={() => setEditExpenseLines((ls) => ls.filter((_, idx) => idx !== i))} className="h-9 w-9 rounded-xl flex items-center justify-center bg-destructive/15 text-destructive active:scale-90 transition"><X className="h-3.5 w-3.5" /></button>}
                                </div>
                              </div>
                            ))}
                            <button onClick={() => setEditExpenseLines((ls) => [...ls, { description: "", amount: "" }])} className="w-full h-8 rounded-xl border border-dashed border-border text-xs font-black text-muted-foreground transition active:scale-[0.98]">+ Add Line</button>
                            <div className="grid grid-cols-2 gap-2 pt-1">
                              <button onClick={() => { setEditExpenseId(null); setEditExpenseLines([]); }} className="h-9 rounded-xl font-black text-xs border border-border transition active:scale-95">Cancel</button>
                              <button onClick={() => handleEditExpenseSave(e)} disabled={editExpenseSaving} className="h-9 rounded-xl font-black text-xs text-primary-foreground flex items-center justify-center transition active:scale-95 disabled:opacity-50" style={{ background: "var(--gradient-hero)" }}>{editExpenseSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}</button>
                            </div>
                          </div>
                        );
                      }

                      // ── Delete confirm ──
                      if (isDeleteConfirm) {
                        return (
                          <div key={e.id} className="px-4 py-3 space-y-2">
                            <p className="text-xs font-semibold text-center text-red-400">Delete expense and refund to wallet?</p>
                            <div className="grid grid-cols-2 gap-2">
                              <button onClick={() => setDeleteExpenseId(null)} className="h-9 rounded-xl font-black text-xs border border-border transition active:scale-95">Cancel</button>
                              <button onClick={() => handleDeleteExpense(e)} disabled={deleteExpenseDeleting} className="h-9 rounded-xl font-black text-xs text-white flex items-center justify-center transition active:scale-95 disabled:opacity-50" style={{ background: "#dc2626" }}>{deleteExpenseDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Delete"}</button>
                            </div>
                          </div>
                        );
                      }

                      if (isBulk) {
                        const lines = raw.split("\n").filter(Boolean);
                        const title = lines[0];
                        const itemLines = lines.slice(1);
                        const amt = Number(e.amount);
                        const isRefund = amt < 0;
                        return (
                          <div
                            key={e.id}
                            className="px-4 py-3 flex items-start justify-between gap-3"
                            style={isRefund ? { background: "rgba(134,239,172,0.04)" } : {}}
                          >
                            <div className="flex-1 min-w-0">
                              <div
                                className="font-black text-sm sm:text-base lg:text-lg"
                                style={isRefund ? { color: "#86efac" } : {}}
                              >
                                {title}
                              </div>
                              <div className="mt-1 space-y-0.5">
                                {itemLines.map((line, i) => {
                                  const eqIdx = line.lastIndexOf(" = ");
                                  const left = eqIdx !== -1 ? line.slice(0, eqIdx) : line;
                                  const right = eqIdx !== -1 ? line.slice(eqIdx + 3) : null;
                                  const cleanLeft = left
                                    .replace(/\s*\[Cashier:[^\]]+\]/, "")
                                    .trim();
                                  if (cleanLeft.startsWith("[Cashier:")) return null;
                                  return (
                                    <div
                                      key={i}
                                      className="flex items-center justify-between gap-2"
                                    >
                                      <span className="text-xs text-muted-foreground flex-1">
                                        {cleanLeft}
                                      </span>
                                      {right && (
                                        <span
                                          className="text-xs font-black shrink-0"
                                          style={{ color: isRefund ? "#86efac" : "#f87171" }}
                                        >
                                          {right}
                                        </span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                              <div className="text-xs text-muted-foreground mt-1.5">
                                {new Date(e.created_at).toLocaleString("en-GB", {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  hour12: true,
                                })}
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1.5 shrink-0">
                              <span
                                className="font-black text-sm"
                                style={{ color: isRefund ? "#86efac" : "#f87171" }}
                              >
                                {isRefund ? `+$${fmt(Math.abs(amt))}` : `-$${fmt(amt)}`}
                              </span>
                              {isLastNonStock && !isRefund && (
                                <div className="flex gap-1">
                                  <button onClick={() => startEditExpense(e)} className="h-7 w-7 rounded-lg flex items-center justify-center transition active:scale-90" style={{ background: "rgba(255,255,255,0.08)" }} title="Edit expense"><Pencil className="h-3 w-3 text-muted-foreground" /></button>
                                  <button onClick={() => setDeleteExpenseId(e.id)} className="h-7 w-7 rounded-lg flex items-center justify-center transition active:scale-90" style={{ background: "rgba(239,68,68,0.12)" }} title="Delete expense"><Trash2 className="h-3 w-3 text-red-400" /></button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      }

                      // Single-item expense: "Name ×12 @ $5.00 each"
                      const atIdx = raw.indexOf(" ×");
                      const hasDetail = atIdx !== -1;
                      const title = hasDetail ? raw.slice(0, atIdx).trim() : raw;
                      const detail = hasDetail ? raw.slice(atIdx + 1).trim() : null;
                      const amt = Number(e.amount);
                      const isRefund = amt < 0;

                      return (
                        <div
                          key={e.id}
                          className="px-4 py-3 flex items-start justify-between gap-3"
                          style={isRefund ? { background: "rgba(134,239,172,0.04)" } : {}}
                        >
                          <div className="flex-1 min-w-0">
                            <div
                              className="font-black text-sm sm:text-base lg:text-lg"
                              style={isRefund ? { color: "#86efac" } : {}}
                            >
                              {title}
                            </div>
                            {detail && (
                              <div className="text-xs text-muted-foreground mt-0.5 break-words whitespace-normal">
                                {detail}
                              </div>
                            )}
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {new Date(e.created_at).toLocaleString("en-GB", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                                hour12: true,
                              })}
                            </div>
                          </div>
                          <span
                            className="font-black text-sm shrink-0"
                            style={{ color: isRefund ? "#86efac" : "#f87171" }}
                          >
                            {isRefund ? `+$${fmt(Math.abs(amt))}` : `-$${fmt(amt)}`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-center text-sm text-muted-foreground py-8">
          No expenses yet. Expenses are auto-generated when you add stock to items with a Cost Price
          set.
        </p>
      )}

      {/* empty bottom spacer */}
    </div>
  );
}

// ─── Transactions Tab ─────────────────────────────────────────────────────────
type FlatRecord =
  | { kind: "order"; data: Order; ts: number }
  | { kind: "tx"; data: WalletTx; ts: number };

function StaffBadge({ label = "Cashier" }: { label?: string }) {
  return (
    <span
      className="text-xs shrink-0 px-2 py-0.5 rounded-full font-semibold self-start mt-0.5"
      style={{
        background: "rgba(99,102,241,0.15)",
        color: "#a5b4fc",
        border: "1px solid rgba(99,102,241,0.3)",
      }}
    >
      {label}
    </span>
  );
}

function TransactionsTab({
  profile,
  onDeleted,
  onPrintBill,
  onPrintBillCredit,
}: {
  profile: { id: string };
  onDeleted?: () => void;
  onPrintBill?: (order: Order) => void;
  onPrintBillCredit?: (tx: WalletTx) => void;
}) {
  const { refreshProfile } = useAuth();
  const { profile: authProfile } = useAuth();
  const canEdit =
    authProfile?.role === "owner" ||
    authProfile?.role === "manager" ||
    (authProfile as any)?.job_title === "manager";
  const nav = useNavigate();
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [allTxs, setAllTxs] = useState<WalletTx[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [cashierRoles, setCashierRoles] = useState<Record<string, string>>({});
  const [cashierNames, setCashierNames] = useState<Record<string, string>>({});
  // The id of the owner-direct order that qualifies for the delete button
  const [deletableOrderId, setDeletableOrderId] = useState<string | null>(null);
  // Confirm id for the delete modal
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const handleConfirmEdit = (order: Order) => {
    sessionStorage.setItem("edit_order", JSON.stringify(order));
    nav("/register");
  };

  // Resolve which owner-direct order (if any) shows the delete button.
  // Same rules as cashier: newest, within 10 seconds, after last delete timestamp.
  const resolveDeletable = async (ownerOrders: Order[]) => {
    if (ownerOrders.length === 0) {
      setDeletableOrderId(null);
      return;
    }
    const newest = ownerOrders.reduce((a, b) =>
      new Date(a.created_at) > new Date(b.created_at) ? a : b,
    );

    // Hide delete button if order is older than 1 hour
    if (Date.now() - new Date(newest.created_at).getTime() > 60 * 60 * 1000) {
      setDeletableOrderId(null);
      return;
    }

    const { data } = await (supabase as any)
      .from("cashier_last_delete")
      .select("deleted_at")
      .eq("cashier_id", profile.id)
      .maybeSingle();

    if ((data as any)?.deleted_at) {
      const orderTime = new Date(newest.created_at).getTime();
      const deletedTime = new Date((data as any).deleted_at).getTime();
      // Hide button if order is older than 2 seconds before the last delete
      if (orderTime < deletedTime - 2000) {
        setDeletableOrderId(null);
        return;
      }
    }
    setDeletableOrderId(newest.id);
  };

  const fetchData = useCallback(() => {
    setLoading(true);
    Promise.all([
      supabase
        .from("orders")
        .select("*")
        .eq("owner_id", profile.id)
        .order("created_at", { ascending: false })
        .then(({ data }) => {
          const orders = (data ?? []) as unknown as Order[];
          const ownerOrders = orders.filter(
            (o: any) => o.cashier_id === profile.id || o.owner_id === profile.id,
          );
          setAllOrders(orders);
          resolveDeletable(ownerOrders);
        }),
      // Fetch ALL wallet txs (no range limit)
      supabase
        .from("wallet_transactions")
        .select("*")
        .eq("profile_id", profile.id)
        .in("type", [
          "transfer_in",
          "bottle_finished",
          "cashier_sale",
          "pack_finished",
          "credit_payment",
          "credit_charge",
        ])
        .order("created_at", { ascending: false })
        .then(({ data }) => setAllTxs((data ?? []) as WalletTx[])),
      // Fetch cashier roles and names for badge display and bill server name
      supabase
        .from("profiles")
        .select("id, role, job_title, username")
        .eq("parent_id", profile.id)
        .in("role", ["cashier", "manager"])
        .then(({ data }) => {
          const roles: Record<string, string> = {};
          const names: Record<string, string> = {};
          (data ?? []).forEach((p: any) => {
            roles[p.id] = p.role === "manager" ? "manager" : (p.job_title === "manager" ? "manager" : "cashier");
            if (p.username) names[p.id] = p.username;
          });
          setCashierRoles(roles);
          setCashierNames(names);
        }),
    ]).finally(() => setLoading(false));
  }, [profile.id]);

  // Keep a stable ref to fetchData so the realtime channel never needs to be recreated
  const fetchDataRef = useRef(fetchData);
  useEffect(() => {
    fetchDataRef.current = fetchData;
  }, [fetchData]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Clear stale data immediately when switching bars
  useEffect(() => {
    setAllOrders([]);
    setAllTxs([]);
    setLoading(true);
  }, [profile.id]);

  // Realtime — one stable channel per owner, never torn down on data refresh
  useEffect(() => {
    const ch = supabase
      .channel(`wallet-tx-${profile.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `owner_id=eq.${profile.id}` },
        () => fetchDataRef.current(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "wallet_transactions",
          filter: `profile_id=eq.${profile.id}`,
        },
        () => fetchDataRef.current(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [profile.id]);

  // Merge ALL records sorted by date, then paginate client-side
  const allFlat: FlatRecord[] = [
    ...allOrders.map(
      (o): FlatRecord => ({ kind: "order", data: o, ts: new Date(o.created_at).getTime() }),
    ),
    ...allTxs.map(
      (tx): FlatRecord => ({ kind: "tx", data: tx, ts: new Date(tx.created_at).getTime() }),
    ),
  ].sort((a, b) => b.ts - a.ts);

  // Show orders where: cashier_id = profile.id (owner acted as cashier)
  // OR owner_id = profile.id (manager/cashier sale on owner's bar)
  // Exclude orders that already have a cashier_sale tx (avoid double-count for owner-as-cashier)
  const cashierSaleTxOrderIds = new Set(
    allTxs
      .filter((tx: any) => tx.type === "cashier_sale" && tx.order_id)
      .map((tx: any) => tx.order_id),
  );
  const allFlatVisible = allFlat.filter((rec) => {
    if (rec.kind === "order") {
      const o = rec.data as any;
      if (o.cashier_id === profile.id) return true;
      // Show manager/cashier sales on owner's bar if not already represented by cashier_sale
      if (o.owner_id === profile.id && !cashierSaleTxOrderIds.has(o.id)) return true;
      return false;
    }
    return true;
  });

  const total = allFlatVisible.length;
  const totalPages = Math.max(1, Math.ceil(total / TX_PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const flatRecords = allFlatVisible.slice(
    safePage * TX_PAGE_SIZE,
    safePage * TX_PAGE_SIZE + TX_PAGE_SIZE,
  );
  const pageRecordCount = flatRecords.length;

  const latestPaymentId = flatRecords.find(
    (r) => r.kind === "tx" && r.data.type === "credit_payment"
  )?.data.id ?? null;

  const deleteLatestOrder = async (order: Order) => {
    setDeletingOrderId(order.id);

    const items = Array.isArray(order.items)
      ? (order.items as any[] as { id: string; qty: number; price?: number }[])
      : [];

    // 1. Reverse shots_sold / units_sold / revenue on any opened bottles or packs.
    //    Also reopens any bottle/pack that was subsequently marked empty (finished),
    //    removing the bottle_finished / pack_finished wallet entry in the process.
    const hasShotOrPack = items.some((i) => i.id?.startsWith("shot-") || i.id?.startsWith("pack-"));
    if (hasShotOrPack) {
      await (supabase as any).rpc("reverse_order_shot_pack", { p_items: items });
    }

    // 2. Restore stock for every real product in the order (skip shot-xxx and pack-xxx)
    const restorableItems = items.filter(
      (i) => !i.id?.startsWith("shot-") && !i.id?.startsWith("pack-"),
    );
    if (restorableItems.length > 0) {
      await supabase.rpc("restore_stock_item", {
        p_items: restorableItems.map((i) => ({ id: i.id, qty: i.qty })),
      });
    }

    // 3. DB trigger on_order_delete handles deleting ALL wallet_transactions
    //    for this order (owner + cashier rows) and deducting wallet_balance.

    const itemDesc = items.map((i: any) => `${i.qty || 1}x ${i.name} = $${Number(i.price).toFixed(2)}`).join("\n");
    const description = `Reverted Stock Expense\n${itemDesc}\nTotal: $${Number(order.total).toFixed(2)}`;
    await (supabase as any).from("owner_expenses").insert({ owner_id: order.owner_id, amount: Number(order.total), description, expense_date: new Date().toISOString().slice(0, 10) });

    // 4. Delete the order itself
    const { error } = await supabase.from("orders").delete().eq("id", order.id);
    if (error) {
      toast.error(error.message);
      setDeletingOrderId(null);
      return;
    }

    toast.success("Sale removed — stock restored");
    setDeletingOrderId(null);
    setDeletableOrderId(null);

    // Persist delete timestamp so button never reappears on refresh
    await (supabase as any)
      .from("cashier_last_delete")
      .upsert(
        { cashier_id: profile.id, deleted_at: new Date().toISOString() },
        { onConflict: "cashier_id" },
      );

    setTimeout(() => refreshProfile(), 800);
    fetchData();
    onDeleted?.();
  };

  const deletePayment = async (tx: WalletTx) => {
    setDeletingOrderId(tx.id);
    const ownerId = profile.id;

    const { error } = await supabase
      .from("credit_transactions")
      .delete()
      .eq("id", tx.id);
    if (error) { toast.error(error.message); setDeletingOrderId(null); return; }

    if (ownerId) {
      const t = new Date(tx.created_at);
      await (supabase as any).rpc("delete_credit_charge_wallet_rows", {
        p_owner_id:   ownerId,
        p_cashier_id: profile.id,
        p_from_time:  new Date(t.getTime() - 5000).toISOString(),
        p_to_time:    new Date(t.getTime() + 5000).toISOString(),
      });
    }

    const { error: balErr } = await supabase.rpc("reduce_credit_balance", {
      p_credit_account_id: (tx as any).credit_account_id,
      p_amount: -tx.amount,
    });
    if (balErr) { toast.error("Transaction deleted but balance update failed"); setDeletingOrderId(null); return; }

    setDeletingOrderId(null);
    toast.success("Payment removed — balance restored");
    fetchData();
    onDeleted?.();
  };

  const handlePrev = () => {
    setPage((p) => Math.max(0, p - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const handleNext = () => {
    setPage((p) => Math.min(totalPages - 1, p + 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Use the locked snapshot — never moves after first load
  const newestOrderId = deletableOrderId;

  return (
    <div className="space-y-3 pt-2 pb-24">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{total} total records</span>
      </div>

      <PaginationBar
        page={safePage}
        totalPages={totalPages}
        total={total}
        pageCount={pageRecordCount}
        onPrev={handlePrev}
        onNext={handleNext}
      />

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl h-16 bg-muted/30 animate-pulse" />
          ))}
        </div>
      ) : flatRecords.length === 0 ? (
        <div className="text-muted-foreground text-sm py-8 text-center">No records yet.</div>
      ) : (
        <div className="space-y-2">
          {flatRecords.map((rec) => {
            if (rec.kind === "tx") {
              const tx = rec.data;
              const isBottle = tx.type === "bottle_finished";
              const isCashierSale = tx.type === "cashier_sale";

              if (isCashierSale) {
                const parts = (tx.note ?? "").split(" | ");
                const cashierLabel = parts[0] ?? "Cashier";
                const totalStr = parts[1] ?? "";
                // Clean up garbled × characters from old stored records
                const rawItems = parts.slice(2).join(", ") ?? "";
                const itemsStr = rawItems.replace(/├ù/g, "x").replace(/\u00d7/g, "x");
                // Parse paid/change from totalStr e.g. "Total: $X · Paid: $Y · Change: $Z"
                const paidMatch = totalStr.match(/Paid:\s*\$([\d.]+)/);
                const changeMatch = totalStr.match(/Change:\s*\$([\d.]+)/);
                const totalMatch = totalStr.match(/Total:\s*\$([\d.]+)/);
                const paidStr = paidMatch ? `Paid $${fmt(parseFloat(paidMatch[1]))}` : "";
                const changeStr = changeMatch ? `Change $${fmt(parseFloat(changeMatch[1]))}` : "";
                const saleTotal = totalMatch ? `+$${fmt(parseFloat(totalMatch[1]))}` : "";
                return (
                  <div
                    key={tx.id}
                    className="rounded-xl p-4 border border-blue-500/20 flex items-start gap-3"
                    style={{ background: "oklch(0.20 0.04 240 / 0.30)" }}
                  >
                    <div className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 border bg-blue-500/15 border-blue-500/25 text-base">
                      🧾
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-muted-foreground">
                        {new Date(tx.created_at).toLocaleString("en-GB", {
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: true,
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </div>
                      <div className="text-sm font-black text-blue-300 mt-0.5">{cashierLabel}</div>
                      {saleTotal && (
                        <div className="text-sm font-black text-green-400 mt-0.5">{saleTotal}</div>
                      )}
                      {itemsStr && (
                        <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                          {itemsStr}
                        </div>
                      )}
                      {(paidStr || changeStr) && (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {[paidStr, changeStr].filter(Boolean).join(" · ")}
                        </div>
                      )}
                    </div>
                    <StaffBadge />
                  </div>
                );
              }

              // ── Credit payment / credit charge card ─────────────────────
              const isCreditTx = tx.type === "credit_payment" || tx.type === "credit_charge";
              if (isCreditTx) {
                const isPayment = tx.type === "credit_payment";
                const isReadOnly = isPayment && Number(tx.amount) === 0;
                const noteParts = (tx.note ?? "").split(" | ");
                const titlePart = noteParts[0] ?? (isPayment ? "Credit payment" : "Credit charge");
                const paidPart = noteParts.find((p) => p.startsWith("Paid:")) ?? "";
                const remainPart =
                  noteParts.find(
                    (p) => p.startsWith("Remaining:") || p.startsWith("Balance remaining:"),
                  ) ?? "";
                const cashierPart = noteParts.find((p) => p.startsWith("Cashier:")) ?? "";
                // Charge records: amount shown as "$X" part, items listed after "Items:"
                const amountPart = !isPayment
                  ? (noteParts.find((p) => p.startsWith("$")) ?? "")
                  : "";
                const itemsPart =
                  noteParts.find((p) => p.startsWith("Items:"))?.replace("Items: ", "") ?? "";
                const balOwedPart = noteParts.find((p) => p.startsWith("Balance owed:")) ?? "";
                const discRaw = noteParts.find((p) => p.startsWith("Disc:")) ?? "";
                const discMatch = discRaw.match(
                  /Disc:\s*-\$?([\d.]+)(?:\s*\(orig\s*\$?([\d.]+)\))?/,
                );
                const discAmt = discMatch ? Number(discMatch[1]) : 0;
                const discOrig = discMatch?.[2] ? Number(discMatch[2]) : null;

                return (
                  <div
                    key={tx.id}
                    className="rounded-xl p-4 border flex items-start gap-3"
                    style={{
                      borderColor: isPayment ? "rgba(34,197,94,0.3)" : "rgba(251,146,60,0.25)",
                      background: isPayment
                        ? "oklch(0.20 0.06 145 / 0.25)"
                        : "oklch(0.20 0.04 45 / 0.30)",
                    }}
                  >
                    <div
                      className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 border text-base"
                      style={{
                        background: isPayment ? "rgba(34,197,94,0.15)" : "rgba(251,146,60,0.12)",
                        borderColor: isPayment ? "rgba(34,197,94,0.3)" : "rgba(251,146,60,0.25)",
                      }}
                    >
                      {isPayment ? "💳" : "🪙"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-muted-foreground">
                        {new Date(tx.created_at).toLocaleString("en-GB", {
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: true,
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </div>
                      <div
                        className="text-sm font-black mt-0.5"
                        style={{ color: isPayment ? "#86efac" : "var(--primary)" }}
                      >
                        {titlePart}
                      </div>
                      {/* Payment sub-lines */}
                      {(paidPart || remainPart) && (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {[paidPart, remainPart].filter(Boolean).join(" · ")}
                        </div>
                      )}
                      {/* Charge: items list + order cost in green + balance owed */}
                      {itemsPart && (
                        <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                          {itemsPart}
                        </div>
                      )}
                      {!isPayment && amountPart && (
                        <div className="text-sm font-black text-green-400 mt-0.5">{amountPart}</div>
                      )}
                      {discAmt > 0 && (
                        <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
                          {discOrig != null && (
                            <span className="text-[9px] text-muted-foreground line-through">
                              ${fmt(discOrig)}
                            </span>
                          )}
                          <span
                            className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-black leading-tight"
                            style={{
                              background: "rgba(251,191,36,0.2)",
                              color: "#fbbf24",
                              border: "1px solid rgba(251,191,36,0.4)",
                            }}
                          >
                            -{fmt(discAmt)} off
                          </span>
                        </div>
                      )}
                      {balOwedPart && (
                        <div
                          className="text-xs mt-0.5 font-semibold"
                          style={{ color: "var(--primary)" }}
                        >
                          {balOwedPart}
                        </div>
                      )}
                      {cashierPart && (
                        <div className="text-xs text-muted-foreground mt-0.5">{cashierPart}</div>
                      )}
                    </div>
                    {/* Credit payment: +$X if owner collected, Staff/Manager badge if staff collected */}
                    {/* Credit charge: print + edit inline, Staff badge top-right */}
                    {!isPayment ? (
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {cashierPart && (
                          <StaffBadge
                            label={(tx.note ?? "").includes("[Manager:") ? "Manager" : "Staff"}
                          />
                        )}
                        <div className="flex flex-row gap-2">
                          <button
                            onClick={() => onPrintBillCredit?.(tx)}
                            className="h-9 w-9 sm:h-10 sm:w-10 rounded-full flex items-center justify-center bg-blue-500/20 active:scale-95 transition shrink-0"
                            title="Print receipt"
                          >
                            <Printer className="h-4 w-4 sm:h-5 sm:w-5 text-blue-300" />
                          </button>
                          {canEdit && (
                            <button
                              onClick={async () => {
                                const ctid = tx.credit_tx_id;
                                if (!ctid) {
                                  toast.error("No credit record linked to this charge");
                                  return;
                                }
                                const { data: ct } = await sb
                                  .from("credit_transactions")
                                  .select("id, credit_account_id, amount, items, created_at")
                                  .eq("id", ctid)
                                  .maybeSingle();
                                if (!ct) {
                                  toast.error("Could not load credit sale for editing");
                                  return;
                                }
                                const { data: acct } = await sb
                                  .from("credit_accounts")
                                  .select("full_name")
                                  .eq("id", ct.credit_account_id)
                                  .maybeSingle();
                                sessionStorage.setItem(
                                  "edit_credit_order",
                                  JSON.stringify({
                                    credit_tx_id: ct.id,
                                    credit_account_id: ct.credit_account_id,
                                    customer_name: acct?.full_name ?? "Customer",
                                    items: (ct.items ?? []) as {
                                      id: string;
                                      name: string;
                                      qty: number;
                                      price: number;
                                    }[],
                                    amount: ct.amount,
                                    created_at: ct.created_at,
                                  }),
                                );
                                nav("/register");
                              }}
                              className="h-9 w-9 sm:h-10 sm:w-10 rounded-full flex items-center justify-center bg-primary/20 active:scale-95 transition shrink-0"
                              title="Edit this credit sale"
                            >
                              <Pencil className="h-4 w-4 sm:h-5 sm:w-5" style={{ color: "var(--primary)" }} />
                            </button>
                          )}
                        </div>
                      </div>
                    ) : isReadOnly && cashierPart ? (
                      <StaffBadge
                        label={(tx.note ?? "").includes("[Manager:") ? "Manager" : "Staff"}
                      />
                    ) : !isReadOnly ? (
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="font-black text-lg shrink-0" style={{ color: "#86efac" }}>
                          +${fmt(Number(tx.amount))}
                        </span>
                        {tx.id === latestPaymentId && Number(tx.amount) > 0 && (
                          <div className="flex flex-row gap-2">
                            <button
                              onClick={() => onPrintBillCredit?.(tx)}
                              className="h-9 w-9 sm:h-10 sm:w-10 rounded-full flex items-center justify-center bg-blue-500/20 active:scale-95 transition shrink-0"
                              title="Print receipt"
                            >
                              <Printer className="h-4 w-4 sm:h-5 sm:w-5 text-blue-300" />
                            </button>
                            <button
                              onClick={async () => {
                                const ctid = tx.credit_tx_id;
                                if (!ctid) {
                                  toast.error("No credit record linked to this payment");
                                  return;
                                }
                                const { data: ct } = await sb
                                  .from("credit_transactions")
                                  .select("id, credit_account_id, amount, items, created_at")
                                  .eq("id", ctid)
                                  .maybeSingle();
                                if (!ct) {
                                  toast.error("Could not load credit payment for editing");
                                  return;
                                }
                                const { data: acct } = await sb
                                  .from("credit_accounts")
                                  .select("full_name")
                                  .eq("id", ct.credit_account_id)
                                  .maybeSingle();
                                sessionStorage.setItem(
                                  "edit_credit_order",
                                  JSON.stringify({
                                    credit_tx_id: ct.id,
                                    credit_account_id: ct.credit_account_id,
                                    customer_name: acct?.full_name ?? "Customer",
                                    items: (ct.items ?? []) as {
                                      id: string;
                                      name: string;
                                      qty: number;
                                      price: number;
                                    }[],
                                    amount: ct.amount,
                                    created_at: ct.created_at,
                                  }),
                                );
                                nav("/register");
                              }}
                              className="h-9 w-9 sm:h-10 sm:w-10 rounded-full flex items-center justify-center bg-primary/20 active:scale-95 transition shrink-0"
                              title="Edit payment"
                            >
                              <Pencil className="h-4 w-4 sm:h-5 sm:w-5" style={{ color: "var(--primary)" }} />
                            </button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <button
                                  onClick={() => setDeleteConfirmId(tx.id)}
                                  className="h-9 w-9 sm:h-10 sm:w-10 rounded-full flex items-center justify-center bg-red-600 active:scale-95 transition shrink-0"
                                  title="Delete payment"
                                >
                                  <Trash2 className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                                </button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete this payment?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will remove the payment and restore ${fmt(Number(tx.amount))} to the customer's balance. This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => {
                                      if (deleteConfirmId) deletePayment(tx);
                                      setDeleteConfirmId(null);
                                    }}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              }

              const isTransferIn = tx.type === "transfer_in";
              if (isTransferIn) {
                // Check if this is a chain bar owner's direct sale (has order_id)
                const linkedOrder = (tx as any).order_id
                  ? allOrders.find((o: any) => o.id === (tx as any).order_id)
                  : null;
                if (linkedOrder) {
                  // Render exactly like a cash sale order card
                  const o = linkedOrder as any;
                  const isLatest = o.id === deletableOrderId;
                  return (
                    <div
                      key={tx.id}
                      className="rounded-xl p-4 border border-green-500/20 flex items-start gap-3"
                      style={{ background: "oklch(0.20 0.05 145 / 0.20)" }}
                    >
                      <div className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 border bg-green-500/15 border-green-500/25 text-base">
                        💵
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-muted-foreground">
                          {new Date(o.created_at).toLocaleString("en-GB", {
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: true,
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </div>
                        <div
                          className="text-sm font-black mt-0.5"
                          style={{ color: "var(--primary)" }}
                        >
                          ORDER #{(o as any).order_number ?? o.id.slice(0, 8)} · Cash: Sale
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed break-words whitespace-normal">
                          {(o.items || []).map((i: any, idx: number) => (
                            <span
                              key={idx}
                              className="inline-flex items-center gap-1 mr-1.5 flex-wrap"
                            >
                              <span>
                                {i.qty}× {i.name}
                              </span>
                              {i.discount && Number(i.discount) > 0 ? (
                                <>
                                  {i.original_price != null && (
                                    <span className="text-[9px] text-muted-foreground line-through">
                                      ${fmt(Number(i.original_price))}
                                    </span>
                                  )}
                                  <span
                                    className="inline-flex items-center px-1 py-0 rounded-full text-[9px] font-black leading-tight"
                                    style={{
                                      background: "rgba(251,191,36,0.2)",
                                      color: "#fbbf24",
                                      border: "1px solid rgba(251,191,36,0.4)",
                                    }}
                                  >
                                    -{fmt(Number(i.discount))} off
                                  </span>
                                </>
                              ) : null}
                            </span>
                          ))}
                        </div>
                        {o.discount_amount != null && Number(o.discount_amount) > 0 && (
                          <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
                            {o.original_total != null && (
                              <span className="text-[9px] text-muted-foreground line-through">
                                ${fmt(Number(o.original_total))}
                              </span>
                            )}
                            <span
                              className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-black leading-tight"
                              style={{
                                background: "rgba(251,191,36,0.2)",
                                color: "#fbbf24",
                                border: "1px solid rgba(251,191,36,0.4)",
                              }}
                            >
                              -{fmt(Number(o.discount_amount))} off
                            </span>
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Paid ${fmt(Number(o.paid))} · Change ${fmt(Number(o.change_given))}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <span className="font-black text-sm text-green-400">
                          +${fmt(Number(o.total))}
                        </span>
                        <div className="flex flex-row gap-2">
                          {canEdit && (
                            <button
                              onClick={() => setEditingOrder(o as Order)}
                              className="h-9 w-9 sm:h-10 sm:w-10 rounded-full flex items-center justify-center bg-primary/20 active:scale-95 transition"
                              title="Edit this sale"
                            >
                              <Pencil className="h-4 w-4 sm:h-5 sm:w-5" style={{ color: "var(--primary)" }} />
                            </button>
                          )}
                          {isLatest && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <button
                                  onClick={() => setDeleteConfirmId(o.id)}
                                  className="h-9 w-9 sm:h-10 sm:w-10 rounded-full flex items-center justify-center bg-red-600 active:scale-95 transition"
                                  title="Delete this sale"
                                >
                                  <Trash2 className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                                </button>
                              </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete this sale?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will remove the order and restore stock. This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => {
                                    if (deleteConfirmId) deleteLatestOrder({ ...o, id: deleteConfirmId });
                                    setDeleteConfirmId(null);
                                  }}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </div>
                  </div>
                  );
                }
                return (
                  <div
                    key={tx.id}
                    className="rounded-xl p-4 border border-green-500/30 flex items-center gap-3"
                    style={{ background: "oklch(0.22 0.06 145 / 0.3)" }}
                  >
                    <div className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 border bg-green-500/20 border-green-500/30">
                      <ArrowDownLeft className="h-4 w-4 text-green-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-muted-foreground">
                        {new Date(tx.created_at).toLocaleString("en-GB", {
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: true,
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </div>
                      <div className="text-sm font-semibold text-green-300">
                        {tx.note ?? "Cleared from cashier"}
                      </div>
                    </div>
                    <div className="font-black text-lg shrink-0 text-green-400">
                      +${fmt(Number(tx.amount))}
                    </div>
                  </div>
                );
              }

              if (isBottle) {
                const noteParts = (tx.note ?? "").split(" | ");
                const title = noteParts[0] ?? tx.note ?? "Bottle closed";
                const sub1 = noteParts[1] ?? ""; // "Bottle price: $X"
                const sub2 = noteParts[2] ?? ""; // "Shots revenue: $X"
                const bottlePrice = parseFloat((sub1.match(/\$([\d.]+)/) ?? [])[1] ?? "0");
                const shotsRevenue = parseFloat((sub2.match(/\$([\d.]+)/) ?? [])[1] ?? "0");
                const diff = shotsRevenue - bottlePrice;
                const hasNumbers =
                  !isNaN(bottlePrice) &&
                  !isNaN(shotsRevenue) &&
                  (bottlePrice > 0 || shotsRevenue > 0);
                const bottleByPart =
                  noteParts.find((p) => p.startsWith("By:") || p.startsWith("Cashier:")) ?? "";
                const bottleCashierName = bottleByPart.replace(/^(By:|Cashier:)\s*/, "").trim();
                const sub2Display = sub2.replace(/^Shots revenue/, "Drinks revenue");
                return (
                  <div
                    key={tx.id}
                    className="rounded-xl p-4 border border-amber-500/30 flex items-start gap-3"
                    style={{ background: "oklch(0.20 0.06 80 / 0.35)" }}
                  >
                    <div className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 border bg-amber-500/20 border-amber-500/30 text-lg">
                      🍾
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-muted-foreground">
                        {new Date(tx.created_at).toLocaleString("en-GB", {
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: true,
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </div>
                      <div className="text-sm font-black text-amber-300 mt-0.5">{title}</div>
                      {sub1 && <div className="text-xs text-muted-foreground mt-0.5">{sub1}</div>}
                      {sub2 && (
                        <div className="text-xs text-amber-400 font-semibold mt-0.5">
                          {sub2Display}
                        </div>
                      )}
                      {hasNumbers && (
                        <div
                          className="text-xs font-black mt-1"
                          style={{ color: diff >= 0 ? "#86efac" : "#fca5a5" }}
                        >
                          {diff >= 0
                            ? `Gain: +$${fmt(diff)}`
                            : `Loss: -$${Math.abs(diff).toFixed(2)}`}
                        </div>
                      )}
                      {bottleCashierName && (
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          Closed by: {bottleCashierName}
                        </div>
                      )}
                    </div>
                    {bottleCashierName && <StaffBadge />}
                  </div>
                );
              }

              const isPack = tx.type === "pack_finished";
              if (isPack) {
                const noteParts = (tx.note ?? "").split(" | ");
                const title = noteParts[0] ?? "Pack sold out";
                const sub1 = noteParts[1] ?? "";
                const sub2 = noteParts[2] ?? "";
                const sub3 = noteParts[3] ?? "";
                const packPrice = parseFloat((sub1.match(/\$([\d.]+)/) ?? [])[1] ?? "0");
                const packRevenue = parseFloat((sub3.match(/\$([\d.]+)/) ?? [])[1] ?? "0");
                const diff = packRevenue - packPrice;
                const hasNumbers =
                  !isNaN(packPrice) && !isNaN(packRevenue) && (packPrice > 0 || packRevenue > 0);
                const packCashierPart =
                  noteParts.find((p) => p.startsWith("By:") || p.startsWith("Cashier:")) ?? "";
                const packCashierName = packCashierPart.replace(/^(By:|Cashier:)\s*/, "").trim();
                return (
                  <div
                    key={tx.id}
                    className="rounded-xl p-4 border border-green-500/30 flex items-start gap-3"
                    style={{ background: "oklch(0.20 0.05 145 / 0.35)" }}
                  >
                    <div className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 border bg-green-500/20 border-green-500/30 text-lg">
                      🚬
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-muted-foreground">
                        {new Date(tx.created_at).toLocaleString("en-GB", {
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: true,
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </div>
                      <div className="text-sm font-black text-green-300 mt-0.5">{title}</div>
                      {sub1 && <div className="text-xs text-muted-foreground mt-0.5">{sub1}</div>}
                      {sub2 && <div className="text-xs text-muted-foreground mt-0.5">{sub2}</div>}
                      {sub3 && (
                        <div className="text-xs text-green-400 font-semibold mt-0.5">{sub3}</div>
                      )}
                      {hasNumbers && (
                        <div
                          className="text-xs font-black mt-1"
                          style={{ color: diff >= 0 ? "#86efac" : "#fca5a5" }}
                        >
                          {diff >= 0
                            ? `Gain: +$${fmt(diff)}`
                            : `Loss: -$${Math.abs(diff).toFixed(2)}`}
                        </div>
                      )}
                      {packCashierName && (
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          Closed by: {packCashierName}
                        </div>
                      )}
                    </div>
                    {packCashierName && <StaffBadge />}
                  </div>
                );
              }

              const isReset = tx.type === "wallet_reset";
              return (
                <div
                  key={tx.id}
                  className={`rounded-xl p-4 border flex items-center gap-3 ${isReset ? "border-orange-500/30" : "border-green-500/30"}`}
                  style={{
                    background: isReset
                      ? "oklch(0.22 0.06 50 / 0.3)"
                      : "oklch(0.22 0.06 145 / 0.3)",
                  }}
                >
                  <div
                    className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 border ${isReset ? "bg-orange-500/20 border-orange-500/30" : "bg-green-500/20 border-green-500/30"}`}
                  >
                    {isReset ? (
                      <RotateCcw className="h-4 w-4 text-orange-400" />
                    ) : (
                      <ArrowDownLeft className="h-4 w-4 text-green-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground">
                      {new Date(tx.created_at).toLocaleString("en-GB", {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: true,
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </div>
                    <div
                      className={`text-sm font-semibold ${isReset ? "text-orange-300" : "text-green-300"}`}
                    >
                      {tx.note ?? (isReset ? "Wallet reset" : "Cleared from cashier")}
                    </div>
                  </div>
                  <div
                    className={`font-black text-lg shrink-0 ${isReset ? "text-orange-400" : "text-green-400"}`}
                  >
                    {isReset
                      ? `-$${Math.abs(Number(tx.amount)).toFixed(2)}`
                      : `+$${fmt(Number(tx.amount))}`}
                  </div>
                </div>
              );
            }
            const o = rec.data as Order;
            // Show owner-as-cashier sales and manager/cashier sales on owner's bar
            if ((o as any).cashier_id !== profile.id && (o as any).owner_id !== profile.id) return null;
            const isNewest = o.id === newestOrderId;
            // Is this the owner's own direct sale, or a staff/manager sale (read-only)?
            const isOwnerSale = (o as any).cashier_id === profile.id;
            return (
              <div
                key={o.id}
                className="rounded-xl p-4 border flex items-start gap-3"
                style={{
                  background: isOwnerSale
                    ? "oklch(0.20 0.05 145 / 0.20)"
                    : "oklch(0.20 0.04 240 / 0.20)",
                  borderColor: isOwnerSale
                    ? "rgba(34,197,94,0.2)"
                    : "rgba(99,102,241,0.2)",
                }}
              >
                <div className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 border bg-green-500/15 border-green-500/25 text-base">
                  💵
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-muted-foreground">
                    {new Date(o.created_at).toLocaleString("en-GB", {
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: true,
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </div>
                  <div className="text-xs font-black text-primary mt-0.5">
                    ORDER #{(o as any).order_number ?? o.id.slice(0, 8)}
                  </div>
                  <div className="text-sm font-black mt-0.5" style={{ color: "var(--primary)" }}>
                    {(o as any).cashier_id === (o as any).owner_id
                      ? "Cash: Sale"
                      : cashierRoles[(o as any).cashier_id] === "manager"
                        ? `Manager: ${cashierNames[(o as any).cashier_id] ?? "Sale"}`
                        : `Cashier: ${cashierNames[(o as any).cashier_id] ?? "Sale"}`}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    {(o.items || []).map((i, idx) => (
                      <span key={idx} className="inline-flex items-center gap-1 mr-1.5 flex-wrap">
                        <span>
                          {i.qty}× {i.name}
                        </span>
                        {i.discount && Number(i.discount) > 0 ? (
                          <>
                            {i.original_price != null && (
                              <span className="text-[9px] text-muted-foreground line-through">
                                ${fmt(Number(i.original_price))}
                              </span>
                            )}
                            <span
                              className="inline-flex items-center px-1 py-0 rounded-full text-[9px] font-black leading-tight"
                              style={{
                                background: "rgba(251,191,36,0.2)",
                                color: "#fbbf24",
                                border: "1px solid rgba(251,191,36,0.4)",
                              }}
                            >
                              -{fmt(Number(i.discount))} off
                            </span>
                          </>
                        ) : null}
                      </span>
                    ))}
                  </div>
                  {o.discount_amount != null && Number(o.discount_amount) > 0 && (
                    <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
                      {o.original_total != null && (
                        <span className="text-[9px] text-muted-foreground line-through">
                          ${fmt(Number(o.original_total))}
                        </span>
                      )}
                      <span
                        className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-black leading-tight"
                        style={{
                          background: "rgba(251,191,36,0.2)",
                          color: "#fbbf24",
                          border: "1px solid rgba(251,191,36,0.4)",
                        }}
                      >
                        -{fmt(Number(o.discount_amount))} off
                      </span>
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Paid ${fmt(Number(o.paid))} · Change ${fmt(Number(o.change_given))}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  {isOwnerSale ? (
                    <>
                      <span className="font-black text-lg text-green-400">
                        +${fmt(Number(o.total))}
                      </span>
                      <div className="flex flex-row gap-2">
                        <button
                          onClick={() => onPrintBill?.(o)}
                          className="h-9 w-9 sm:h-10 sm:w-10 rounded-full flex items-center justify-center bg-blue-500/20 active:scale-95 transition"
                          title="Print bill"
                        >
                          <Printer className="h-4 w-4 sm:h-5 sm:w-5 text-blue-300" />
                        </button>
                        <button
                          onClick={() => setEditingOrder(o)}
                          className="h-9 w-9 sm:h-10 sm:w-10 rounded-full flex items-center justify-center bg-primary/20 active:scale-95 transition"
                          title="Edit this sale"
                        >
                          <Pencil className="h-4 w-4 sm:h-5 sm:w-5" style={{ color: "var(--primary)" }} />
                        </button>
                        {isNewest && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <button
                                onClick={() => setDeleteConfirmId(o.id)}
                                className="h-9 w-9 sm:h-10 sm:w-10 rounded-full flex items-center justify-center bg-red-600 active:scale-95 transition"
                                title="Delete this sale"
                              >
                                <Trash2 className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                              </button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete this sale?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will remove the order and restore stock. This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => {
                                    if (deleteConfirmId) deleteLatestOrder({ ...o, id: deleteConfirmId });
                                    setDeleteConfirmId(null);
                                  }}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="font-black text-lg" style={{ color: "#86efac" }}>
                        +${fmt(Number(o.total))}
                      </span>
                      <div className="flex flex-row gap-2">
                        <StaffBadge
                          label={cashierRoles[(o as any).cashier_id] === "manager" ? "Manager" : "Staff"}
                        />
                        <button
                          onClick={() => onPrintBill?.(o)}
                          className="h-9 w-9 sm:h-10 sm:w-10 rounded-full flex items-center justify-center bg-blue-500/20 active:scale-95 transition"
                          title="Print bill"
                        >
                          <Printer className="h-4 w-4 sm:h-5 sm:w-5 text-blue-300" />
                        </button>
                        {canEdit && (
                          <button
                            onClick={() => setEditingOrder(o)}
                            className="h-9 w-9 sm:h-10 sm:w-10 rounded-full flex items-center justify-center bg-primary/20 active:scale-95 transition"
                            title="Edit this sale"
                          >
                            <Pencil className="h-4 w-4 sm:h-5 sm:w-5" style={{ color: "var(--primary)" }} />
                          </button>
                        )}
                        {isNewest && canEdit && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <button
                                onClick={() => setDeleteConfirmId(o.id)}
                                className="h-9 w-9 sm:h-10 sm:w-10 rounded-full flex items-center justify-center bg-red-600 active:scale-95 transition"
                                title="Delete this sale"
                              >
                                <Trash2 className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                              </button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete this sale?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will remove the order and restore stock. This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => {
                                    if (deleteConfirmId) deleteLatestOrder({ ...o, id: deleteConfirmId });
                                    setDeleteConfirmId(null);
                                  }}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <PaginationBar
        page={safePage}
        totalPages={totalPages}
        total={total}
        pageCount={pageRecordCount}
        onPrev={handlePrev}
        onNext={handleNext}
      />

      {/* ── Edit sale confirm modal ─────────────────────────────────────── */}
      {editingOrder && (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setEditingOrder(null)}
        >
          <div
            className="w-full max-w-sm rounded-t-3xl border border-border shadow-2xl overflow-hidden"
            style={{ background: "var(--gradient-card)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 pt-5 pb-3 flex items-center justify-between">
              <span className="text-base font-black">Edit Sale</span>
              <button
                onClick={() => setEditingOrder(null)}
                className="h-8 w-8 rounded-full flex items-center justify-center bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-5 pb-2 text-xs text-muted-foreground space-y-1">
              <p className="font-bold text-foreground">
                {new Date(editingOrder.created_at).toLocaleString("en-GB", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: true,
                  day: "numeric",
                  month: "short",
                })}
                {" · "}${fmt(Number(editingOrder.total))}
              </p>
              <p>{(editingOrder.items || []).map((i) => `${i.qty}× ${i.name}`).join(", ")}</p>
              <p className="text-yellow-400 font-semibold pt-1">
                This will reload the sale on the register for editing. The original date and time
                will be preserved.
              </p>
            </div>
            <div className="px-5 pb-6 pt-3 grid grid-cols-2 gap-3">
              <button
                onClick={() => setEditingOrder(null)}
                className="h-11 rounded-2xl font-black text-sm border border-border transition active:scale-95"
                style={{ background: "var(--gradient-card)" }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleConfirmEdit(editingOrder)}
                className="h-11 rounded-2xl font-black text-sm text-primary-foreground flex items-center justify-center gap-2 transition active:scale-95"
                style={{ background: "var(--gradient-hero)" }}
              >
                <Pencil className="h-4 w-4" /> Edit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Owner Wallet ─────────────────────────────────────────────────────────────
function OwnerWallet({
  profile,
}: {
  profile: {
    id: string;
    wallet_balance: number;
    cashier_float?: number;
    role: string;
    username?: string;
  };
}) {
  const { t } = useTranslation();
  const { chainBars, activeBar } = useChain();
  const chainBarIds = chainBars.map((b) => b.id);
  const { refreshProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<"transactions" | "financials">("transactions");
  const [showStatement, setShowStatement] = useState(false);
  // Derive balance directly from the prop so it updates when refreshProfile() runs
  const balance = Number(profile.wallet_balance);

  // ── Cashier Float ───────────────────────────────────────────────────────────
  // cashier_float in profiles IS the live remaining balance
  const [floatRemaining, setFloatRemaining] = useState<number | null>(null);
  const [floatSet, setFloatSet] = useState<number | null>(null);
  const [floatSetAt, setFloatSetAt] = useState<string | null>(null);
  const [showSetFloat, setShowSetFloat] = useState(false);
  const [floatInput, setFloatInput] = useState("");
  const [savingFloat, setSavingFloat] = useState(false);
  const [billData, setBillData] = useState<BillData | null>(null);
  const [printingBill, setPrintingBill] = useState(false);

  async function openBillForOrder(order: Order) {
    const parts = (order as any).note_parts ?? [];
    const customerName = parts.find((p: string) => p.startsWith("Customer:"))?.replace("Customer: ", "");
    // Determine who served: owner → use owner name, manager/cashier → look up name
    const cashierId = (order as any).cashier_id;
    const isOwnerSale = cashierId === profile.id;
    const cashierName = isOwnerSale
      ? (profile.username || "Staff")
      : ((await (async () => {
          const { data } = await sb.from("profiles").select("username").eq("id", cashierId).maybeSingle();
          return data?.username ?? "Staff";
        })()));
    const bill: BillData = {
      storeName: activeBar?.bar_name || profile.username || "Bar",
      orderNumber: String((order as any).order_number ?? order.id.slice(0, 8)),
      date: new Date(order.created_at).toLocaleString("en-US", {
        month: "numeric", day: "numeric", year: "numeric",
        hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true,
      }),
      items: (order.items || []).map((i) => ({ name: i.name, qty: i.qty, price: Number(i.price) })),
      subtotal: Number(order.total),
      total: Number(order.total),
      paid: Number(order.paid),
      change: Number(order.change_given),
      payMode: order.payment_method === "credit" ? "credit" : "cash",
      customerName: customerName || undefined,
      serverName: cashierName,
    };
    setBillData(bill);
  }

  async function openBillForCreditTx(tx: WalletTx) {
    const ctid = tx.credit_tx_id;
    if (!ctid) {
      toast.error("No credit record linked");
      return;
    }
    const { data: ct } = await sb
      .from("credit_transactions")
      .select("id, credit_account_id, amount, items, created_at")
      .eq("id", ctid)
      .maybeSingle();
    if (!ct) {
      toast.error("Could not load credit sale");
      return;
    }
    const { data: acct } = await sb
      .from("credit_accounts")
      .select("full_name")
      .eq("id", ct.credit_account_id)
      .maybeSingle();
    const items = (ct.items ?? []) as { name: string; qty: number; price: number }[];
    const bill: BillData = {
      storeName: activeBar?.bar_name || profile.username || "Bar",
      orderNumber: "CREDIT",
      date: new Date(ct.created_at).toLocaleString("en-US", {
        month: "numeric", day: "numeric", year: "numeric",
        hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true,
      }),
      items: items.map((i) => ({ name: i.name, qty: i.qty, price: Number(i.price) })),
      subtotal: Number(ct.amount),
      total: Number(ct.amount),
      paid: Number(ct.amount),
      change: 0,
      payMode: "credit",
      customerName: acct?.full_name || undefined,
      serverName: profile.username || "Staff",
    };
    setBillData(bill);
  }

  // Load original float (from latest sub-session) + live remaining (cashier_float)
  const loadFloat = useCallback(async () => {
    const { data: ownerData } = await sb
      .from("profiles")
      .select("cashier_float, cashier_float_set_at")
      .eq("id", profile.id)
      .single();

    const remaining = Number(ownerData?.cashier_float ?? 0);
    const since: string | null = ownerData?.cashier_float_set_at ?? null;

    setFloatRemaining(remaining > 0 ? remaining : null);
    setFloatSetAt(since);

    let original = remaining;
    if (since) {
      const { data: lastSubSession } = await sb
        .from("bar_sub_sessions")
        .select("cashier_float")
        .eq("owner_id", profile.id)
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      original = Number(lastSubSession?.cashier_float ?? remaining);
    }
    setFloatSet(original > 0 ? original : null);
  }, [profile.id]);

  useEffect(() => {
    loadFloat();
  }, [loadFloat]);

  // Stable ref for realtime callbacks
  const loadFloatRef = useRef(loadFloat);
  useEffect(() => {
    loadFloatRef.current = loadFloat;
  }, [loadFloat]);

  const handlePrintBill = async () => {
    if (!billData) return;
    setPrintingBill(true);
    try {
      await printReceipt(billData);
      toast.success("Receipt sent to printer");
    } catch {
      toast.error("Print failed");
    } finally {
      setPrintingBill(false);
    }
  };

  const handlePdfShare = async () => {
    if (!billData) return;
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "mm", format: "a4" });
      const y = 20;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text(billData.storeName || "My Business", LM, y);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(billData.date, LM, y + 6);
      doc.text("ORDER #" + billData.orderNumber, LM, y + 12);
      doc.setFontSize(10);
      let cy = y + 20;
      billData.items.forEach((it) => {
        doc.text(`${it.qty}x ${it.name}   $${(it.qty * it.price).toFixed(2)}`, LM, cy);
        cy += 6;
      });
      cy += 4;
      doc.setFont("helvetica", "bold");
      doc.text(`Total: $${billData.total.toFixed(2)}`, LM, cy); cy += 6;
      doc.setFont("helvetica", "normal");
      doc.text(`Paid: $${billData.paid.toFixed(2)}`, LM, cy); cy += 6;
      doc.text(`Change: $${billData.change.toFixed(2)}`, LM, cy);
      if (billData.customerName) {
        cy += 6;
        doc.text(`Customer: ${billData.customerName}`, LM, cy);
      }
      const filename = `receipt-${billData.orderNumber}.pdf`;
      const dataUri = doc.output("datauristring");
      await downloadPdf(filename, dataUri);
      toast.success("Receipt PDF downloaded");

      const text = `Receipt: ${billData.storeName}\nORDER #${billData.orderNumber}\nDate: ${billData.date}\nTotal: $${billData.total.toFixed(2)}\nPaid: $${billData.paid.toFixed(2)}\nChange: $${billData.change.toFixed(2)}${billData.customerName ? "\nCustomer: " + billData.customerName : ""}`;
      const waUrl = "https://wa.me/?text=" + encodeURIComponent(text);
      window.open(waUrl, "_blank");
    } catch (e) {
      toast.error("Failed to generate PDF");
    }
  };

  // Realtime — watch owner profile for float changes + cashier expenses
  useEffect(() => {
    const ch = supabase
      .channel(`owner-float-${profile.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${profile.id}` },
        () => loadFloatRef.current(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "wallet_transactions",
          filter: `profile_id=in.(${profile.id},${profile.id})`,
        },
        () => loadFloatRef.current(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "owner_expenses",
          filter: `owner_id=eq.${profile.id}`,
        },
        () => loadFloatRef.current(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [profile.id]);

  // Session mode for float update — set before opening numpad
  const [floatSessionMode, setFloatSessionMode] = useState<"same" | "new">("new");

  const handleSetFloat = async () => {
    const val = parseFloat(floatInput);
    if (isNaN(val) || val < 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setSavingFloat(true);
    const now = new Date().toISOString();

    if (floatSessionMode === "same") {
      // Same Session — add the entered amount to the current float total
      // Does NOT reset float_set_at so the used calculation window stays the same
      const currentRemaining = floatRemaining ?? 0;
      const newTotal = currentRemaining + val;
      const { error } = await sb
        .from("profiles")
        .update({ cashier_float: newTotal })
        .eq("id", profile.id);
      setSavingFloat(false);
      if (error) {
        toast.error(error.message);
        return;
      }
      setFloatRemaining(newTotal);
      setFloatInput("");
      setShowSetFloat(false);
      toast.success(`Float topped up by $${val.toFixed(2)} — total now $${newTotal.toFixed(2)}`);
      setTimeout(() => refreshProfile(), 300);
    } else {
      // New Session (cashier change) — close the current open sub-session and create a new one.
      // This does NOT touch bar_session_start — the bar parent session stays open.
      // Reset the cashier float to the new value and stamp a new cashier_float_set_at anchor.

      // Find the current open bar_session to attach the new sub-session to
      const { data: openBarSession } = await sb
        .from("bar_sessions")
        .select("id")
        .eq("owner_id", profile.id)
        .is("closed_at", null)
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Close the current open sub-session
      if (openBarSession?.id) {
        await sb
          .from("bar_sub_sessions")
          .update({ closed_at: now })
          .eq("owner_id", profile.id)
          .eq("bar_session_id", openBarSession.id)
          .is("closed_at", null);
        // Insert new sub-session
        await sb.from("bar_sub_sessions").insert({
          owner_id: profile.id,
          bar_session_id: openBarSession.id,
          opened_at: now,
          cashier_float: val,
        });
      }

      const { error } = await sb
        .from("profiles")
        .update({ cashier_float: val, cashier_float_set_at: now })
        .eq("id", profile.id);
      setSavingFloat(false);
      if (error) {
        toast.error(error.message);
        return;
      }
      setFloatRemaining(val > 0 ? val : null);
      setFloatSet(val > 0 ? val : null);
      setFloatSetAt(now);
      setFloatInput("");
      setShowSetFloat(false);
      toast.success(
        val === 0
          ? "Float cleared"
          : "New cashier session started — float set to $" + val.toFixed(2),
      );
      setTimeout(() => refreshProfile(), 300);
    }
  };

  // Financial summary state (loaded for hero display)
  const [financialSummary, setFinancialSummary] = useState<{
    initialExpense: number;
    monthlyExpenses: number;
    totalIncome: number;
    totalStockSoldCost: number;
    sessionIncome: number;
    sessionExpense: number;
    sessionStockCost: number;
    stockResaleValue: number;
    stockExpectedProfit: number;
    stockCost: number;
    todayIncome: number;
    todayProfit: number;
    todayStockCost: number;
    todayExpenses: number;
  } | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);

  const loadSummary = useCallback(async () => {
    setLoadingSummary(true);

    // Bar session start — used for BOTH today's and session income/expense
    // "Today" = from current bar_session_start → now (resets only when bar closes & reopens)
    const barSessionStart: string | null = (profile as any).bar_session_start ?? null;

    // Session cards anchor = cashier_float_set_at (resets when owner clicks New Session on float)
    // This is independent of bar_session_start so machines/register/cashiers are unaffected.
    const floatSessionStart: string | null = (profile as any).cashier_float_set_at ?? null;

    // "Today's" anchor = bar_session_start when open, or bar_closed_at's session start when closed.
    // We look at bar_sessions to find the most recent closed session so Today still shows
    // the right numbers after the bar has been closed.
    const barClosedAtVal: string | null = (profile as any).bar_closed_at ?? null;
    let todayAnchor: string | null = barSessionStart; // bar is open — use current session start
    if (!barSessionStart && barClosedAtVal) {
      // Bar was closed — find the most recent closed session's start time
      const lastSessionRes = await (sb as any)
        .from("bar_sessions")
        .select("opened_at")
        .eq("owner_id", profile.id)
        .order("opened_at", { ascending: false })
        .limit(1);
      todayAnchor =
        lastSessionRes.data && lastSessionRes.data.length > 0
          ? lastSessionRes.data[0].opened_at
          : null;
    }

    const [
      finRes,
      expRes,
      transfersRes,
      ownerOrdersRes,
      cashierOrdersRes,
      creditPaymentsRes,
      productsRes,
      openBottlesRes,
      todayOrdersRes,
      todayItemOrdersRes,
      todayNonStockExpRes,
      sessionOrdersRes,
      sessionExpenseRes,
      sessionItemOrdersRes,
      allItemOrdersRes,
    ] = await Promise.all([
      sb
        .from("owner_financials")
        .select("initial_expense")
        .eq("owner_id", profile.id)
        .maybeSingle(),
      sb.from("owner_expenses").select("amount, description").eq("owner_id", profile.id),
      supabase
        .from("wallet_transactions")
        .select("amount")
        .eq("profile_id", profile.id)
        .eq("type", "transfer_in"),
      supabase
        .from("orders")
        .select("total")
        .eq("owner_id", profile.id)
        .eq("cashier_id", profile.id),
      // cashierOrdersRes: only cashier orders that flow to owner wallet (not manager sales)
      // We use transfer_in txs instead — those represent actual money cleared to the owner
      // from cashiers. Manager sales stay in manager wallet until manually cleared.
      // So cashierOrdersIncome = 0 here; transfers_in already captures cleared cashier sales.
      Promise.resolve({ data: [] as { total: number }[] }),
      supabase
        .from("wallet_transactions")
        .select("amount")
        .eq("profile_id", profile.id)
        .eq("type", "credit_payment")
        .gt("amount", 0),
      supabase
        .from("products")
        .select("id, name, price, cost_price, units_per_item, stock_qty")
        .eq("owner_id", profile.id),
      sb
        .from("opened_bottles")
        .select("revenue, product_id, products(price)")
        .eq("owner_id", profile.id)
        .eq("status", "open"),
      // Today's orders: from bar_session_start → now (resets only on bar close+reopen, not midnight)
      todayAnchor
        ? supabase
            .from("orders")
            .select("total")
            .eq("owner_id", profile.id)
            .gte("created_at", todayAnchor)
        : Promise.resolve({ data: [] }),
      // Today's orders with items for cost calculation (same window)
      todayAnchor
        ? supabase
            .from("orders")
            .select("items")
            .eq("owner_id", profile.id)
            .gte("created_at", todayAnchor)
        : Promise.resolve({ data: [] }),
      // Today's non-stock expenses (same window — from bar open anchor)
      todayAnchor
        ? supabase
            .from("owner_expenses")
            .select("amount, description")
            .eq("owner_id", profile.id)
            .gt("amount", 0)
            .gte("created_at", todayAnchor)
        : Promise.resolve({ data: [] }),
      // Session income: orders only since cashier_float_set_at (resets on New Session float)
      floatSessionStart
        ? supabase
            .from("orders")
            .select("total")
            .eq("owner_id", profile.id)
            .gte("created_at", floatSessionStart)
        : Promise.resolve({ data: [] }),
      // Session expense: manual (non-stock) expenses since cashier_float_set_at
      floatSessionStart
        ? supabase
            .from("owner_expenses")
            .select("amount, description")
            .eq("owner_id", profile.id)
            .gt("amount", 0)
            .gte("created_at", floatSessionStart)
        : Promise.resolve({ data: [] }),
      // Session orders with items for stock cost calculation (same window as session income)
      floatSessionStart
        ? supabase
            .from("orders")
            .select("items")
            .eq("owner_id", profile.id)
            .gte("created_at", floatSessionStart)
        : Promise.resolve({ data: [] }),
      // All-time orders with items — for Est. Total Out calculation
      supabase.from("orders").select("items").eq("owner_id", profile.id),
    ]);

    const initialExpense = finRes.data ? Number(finRes.data.initial_expense) : 0;
    // Only count manual (non-stock) expenses for Est. Total Out — stock costs are in totalStockSoldCost
    const monthlyExpenses = (expRes.data ?? [])
      .filter((e: { description: string | null }) =>
        (e.description ?? "").startsWith("Non-Stock Expense"),
      )
      .reduce((s: number, e: { amount: number }) => s + Number(e.amount), 0);
    const transfersIncome = (transfersRes.data ?? []).reduce(
      (s: number, t: { amount: number }) => s + Number(t.amount),
      0,
    );
    const ownerOrdersIncome = (ownerOrdersRes.data ?? []).reduce(
      (s: number, o: { total: number }) => s + Number(o.total),
      0,
    );
    const cashierOrdersIncome = (cashierOrdersRes.data ?? []).reduce(
      (s: number, o: { total: number }) => s + Number(o.total),
      0,
    );
    const creditPaymentsIncome = (creditPaymentsRes.data ?? []).reduce(
      (s: number, t: { amount: number }) => s + Number(t.amount),
      0,
    );
    const totalIncome =
      transfersIncome + ownerOrdersIncome + cashierOrdersIncome + creditPaymentsIncome;

    const closedStockValue = (productsRes.data ?? []).reduce(
      (s: number, p: { price: number; cost_price: number; stock_qty: number }) =>
        s + Number(p.price) * Number(p.stock_qty),
      0,
    );
    const closedStockCost = (productsRes.data ?? []).reduce(
      (s: number, p: { price: number; cost_price: number; stock_qty: number }) =>
        s + Number(p.cost_price) * Number(p.stock_qty),
      0,
    );
    const openBottles = (openBottlesRes.data ?? []) as {
      revenue: number;
      products: { price: number } | null;
    }[];
    const openedBottlesNetValue = openBottles.reduce((s, b) => {
      const bottlePrice = b.products ? Number(b.products.price) : 0;
      return s + bottlePrice - Number(b.revenue);
    }, 0);
    const stockResaleValue = closedStockValue + openedBottlesNetValue;
    const stockExpectedProfit = stockResaleValue - closedStockCost;

    const todayIncome = (todayOrdersRes.data ?? []).reduce(
      (s: number, o: { total: number }) => s + Number(o.total),
      0,
    );

    // Build product cost map: id → effective cost per unit (cost_price ÷ units_per_item if set)
    const prodCostById = new Map<string, number>(
      ((productsRes.data ?? []) as any[]).map((p) => [
        p.id,
        Number(p.units_per_item) > 0
          ? Number(p.cost_price) / Number(p.units_per_item)
          : Number(p.cost_price),
      ]),
    );
    // Name-based fallback for shots with synthetic IDs (e.g. "shot-<bottleId>-<variationKey>-...")
    const prodCostByName = new Map<string, number>(
      ((productsRes.data ?? []) as any[]).map((p) => [
        p.name,
        Number(p.units_per_item) > 0
          ? Number(p.cost_price) / Number(p.units_per_item)
          : Number(p.cost_price),
      ]),
    );

    // Resolve cost for an order item — handles exact ID, name fallback, and shot synthetic IDs
    const SHOT_SYNTHETIC_PREFIXES = ["Shot", "2oz", "1oz", "Retail", "Pack"];
    const resolveItemCost = (it: { id?: string; name: string }): number => {
      if (it.id && prodCostById.has(it.id)) return prodCostById.get(it.id)!;
      if (prodCostByName.has(it.name)) return prodCostByName.get(it.name)!;
      // Shot items: "<variation.label>: <product_name>" with id starting "shot-"
      const colonIdx = it.name.indexOf(": ");
      const isShotId = (it.id ?? "").startsWith("shot-");
      if (colonIdx !== -1) {
        const prefix = it.name.slice(0, colonIdx).trim();
        const isSyntheticPrefix = SHOT_SYNTHETIC_PREFIXES.some((p) =>
          prefix.toLowerCase().startsWith(p.toLowerCase()),
        );
        if (isSyntheticPrefix || isShotId) {
          const productName = it.name.slice(colonIdx + 2);
          if (prodCostByName.has(productName)) return prodCostByName.get(productName)!;
        }
      }
      return 0;
    };

    // Today's cost = sum of (qty × cost_price) across all today's order items
    type OrderItemRaw = {
      id?: string;
      name: string;
      qty: number;
      price: number;
      units_consumed?: number | null;
    };
    const todayCostFromItems = ((todayItemOrdersRes.data ?? []) as any[]).reduce(
      (s: number, o: { items: any }) => {
        const items: OrderItemRaw[] = Array.isArray(o.items) ? o.items : [];
        return (
          s +
          items.reduce((cs, it) => {
            const costUnits =
              it.units_consumed != null && it.units_consumed > 0 ? it.units_consumed : it.qty;
            return cs + resolveItemCost(it) * costUnits;
          }, 0)
        );
      },
      0,
    );

    // Today's non-stock expenses (positive only, same filter as Summary page)
    const todayNonStock = (todayNonStockExpRes.data ?? [])
      .filter((e: { description: string | null }) =>
        (e.description ?? "").startsWith("Non-Stock Expense"),
      )
      .reduce((s: number, e: { amount: number }) => s + Number(e.amount), 0);

    // todayProfit matches Summary page Day filter: income - item costs - non-stock expenses
    const todayProfit = todayIncome - todayCostFromItems - todayNonStock;

    // Session income: orders only since current bar_session_start (resets on New Session, never exceeds Today)
    const sessionIncome = barSessionStart
      ? (sessionOrdersRes.data ?? []).reduce(
          (s: number, o: { total: number }) => s + Number(o.total),
          0,
        )
      : 0;

    // Session expense: manual (non-stock) expenses only since current bar_session_start
    const sessionExpense = barSessionStart
      ? (sessionExpenseRes.data ?? [])
          .filter((e: { description: string | null }) =>
            (e.description ?? "").startsWith("Non-Stock Expense"),
          )
          .reduce((s: number, e: { amount: number }) => s + Number(e.amount), 0)
      : 0;

    // Session stock cost: cost of items sold since current bar_session_start
    type SessionOrderItem = {
      id?: string;
      name: string;
      qty: number;
      price: number;
      units_consumed?: number | null;
    };
    const sessionStockCost = barSessionStart
      ? ((sessionItemOrdersRes.data ?? []) as any[]).reduce((s: number, o: { items: any }) => {
          const items: SessionOrderItem[] = Array.isArray(o.items) ? o.items : [];
          return (
            s +
            items.reduce((cs, it) => {
              const costUnits =
                it.units_consumed != null && it.units_consumed > 0 ? it.units_consumed : it.qty;
              return cs + resolveItemCost(it) * costUnits;
            }, 0)
          );
        }, 0)
      : 0;

    // All-time stock sold cost = sum of (qty × cost_price) across ALL order items ever
    type AllOrderItemRaw = {
      id?: string;
      name: string;
      qty: number;
      price: number;
      units_consumed?: number | null;
    };
    const totalStockSoldCost = ((allItemOrdersRes.data ?? []) as any[]).reduce(
      (s: number, o: { items: any }) => {
        const items: AllOrderItemRaw[] = Array.isArray(o.items) ? o.items : [];
        return (
          s +
          items.reduce((cs, it) => {
            const costUnits =
              it.units_consumed != null && it.units_consumed > 0 ? it.units_consumed : it.qty;
            return cs + resolveItemCost(it) * costUnits;
          }, 0)
        );
      },
      0,
    );

    setFinancialSummary({
      initialExpense,
      monthlyExpenses,
      totalIncome,
      totalStockSoldCost,
      sessionIncome,
      sessionExpense,
      sessionStockCost,
      stockResaleValue,
      stockExpectedProfit,
      stockCost: closedStockCost,
      todayIncome,
      todayProfit,
      todayStockCost: todayCostFromItems,
      todayExpenses: todayNonStock,
    });
    setLoadingSummary(false);
  }, [
    profile.id,
    (profile as any).cashier_float_set_at,
    (profile as any).bar_session_start,
    (profile as any).bar_closed_at,
  ]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  // Clear stale data immediately when switching bars so old bar's data doesn't flash
  useEffect(() => {
    setFinancialSummary(null);
    setLoadingSummary(true);
  }, [profile.id]);

  // Stable ref so the realtime channel never needs to be recreated when loadSummary re-runs
  const loadSummaryRef = useRef(loadSummary);
  useEffect(() => {
    loadSummaryRef.current = loadSummary;
  }, [loadSummary]);

  // Stable ref for loadFloat
  const ownerLoadFloatRef = useRef(loadFloat);
  useEffect(() => {
    ownerLoadFloatRef.current = loadFloat;
  }, [loadFloat]);

  // Realtime — one stable channel, never torn down on data refresh
  useEffect(() => {
    const ch = supabase
      .channel(`wallet-summary-${profile.id}`)
      // Any order (owner or cashier sale) → income + stock changes
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `owner_id=eq.${profile.id}` },
        () => loadSummaryRef.current(),
      )
      // Wallet transactions: transfers_in, credit_payments → income changes
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "wallet_transactions",
          filter: `profile_id=eq.${profile.id}`,
        },
        () => loadSummaryRef.current(),
      )
      // Expenses added/removed → expenses + net profit cards
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "owner_expenses",
          filter: `owner_id=eq.${profile.id}`,
        },
        () => loadSummaryRef.current(),
      )
      // Stock added/removed/updated → stock resale + expected profit cards
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "products", filter: `owner_id=eq.${profile.id}` },
        () => loadSummaryRef.current(),
      )
      // Opened/finished bottles → stock resale value changes
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "opened_bottles",
          filter: `owner_id=eq.${profile.id}`,
        },
        () => loadSummaryRef.current(),
      )
      // Profile updates (bar_session_start, cashier_float_set_at) → session/today cards re-calculate
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${profile.id}` },
        () => loadSummaryRef.current(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [profile.id]);

  // Realtime — watch all wallet_transactions for cashier_expense type to update float remaining
  useEffect(() => {
    const ch = supabase
      .channel(`float-used-${profile.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "wallet_transactions",
          filter: `profile_id=eq.${profile.id}`,
        },
        () => ownerLoadFloatRef.current(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [profile.id]);

  const totalExpenses = financialSummary ? financialSummary.monthlyExpenses : 0;
  const totalIncome = financialSummary ? financialSummary.totalIncome : balance;
  const totalStockSoldCost = financialSummary ? financialSummary.totalStockSoldCost : 0;
  const sessionIncome = financialSummary ? financialSummary.sessionIncome : 0;
  const sessionExpense = financialSummary ? financialSummary.sessionExpense : 0;
  const sessionStockCost = financialSummary ? financialSummary.sessionStockCost : 0;
  const barSessionStart: string | null = (profile as any).bar_session_start ?? null;
  const barIsOpenWallet = !!barSessionStart && !(profile as any).bar_closed_at;
  const todayIncome = financialSummary ? financialSummary.todayIncome : 0;
  const todayProfit = financialSummary ? financialSummary.todayProfit : 0;
  const netProfit = totalIncome - totalExpenses;
  const stockResaleValue = financialSummary ? financialSummary.stockResaleValue : 0;
  const stockExpectedProfit = financialSummary ? financialSummary.stockExpectedProfit : 0;
  const stockCost = financialSummary ? financialSummary.stockCost : 0;
  const todayStockCost = financialSummary ? financialSummary.todayStockCost : 0;
  const todayExpenses = financialSummary ? financialSummary.todayExpenses : 0;
  const hasFinancials = financialSummary !== null && financialSummary.monthlyExpenses > 0;

  return (
    <div className="space-y-5 pt-3 pb-24">
      {/* ── Hero 1: Today’s stats ──────────────────────────────────────────────────────────── */}
      {/* ── Hero 3: Float ─────────────────────────────────────── */}
      <section
        className="rounded-3xl px-4 py-3 relative overflow-hidden"
        style={{ background: "var(--gradient-hero)", boxShadow: "var(--shadow-glow)" }}
      >
        <div className="absolute -right-8 -bottom-8 h-36 w-36 rounded-full bg-white/10 blur-2xl" />
        <div className="relative space-y-3">
          <div className="flex gap-3 items-stretch">
            <button
              onClick={() => {
                setFloatInput("");
                setShowSetFloat(true);
              }}
              disabled={!barIsOpenWallet}
              className="shrink-0 w-24 rounded-2xl font-black text-[11px] leading-tight active:scale-95 transition flex items-center justify-center text-center px-2 py-3 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: "oklch(0.20 0.04 60)",
                color: "#fbbf24",
                border: "1.5px solid oklch(0.35 0.10 60)",
              }}
            >
              {floatSet !== null ? "Update\nFloat" : "Set\nFloat"}
            </button>
            <div
              className="flex-1 flex flex-col justify-center gap-0.5 rounded-2xl px-4 py-2"
              style={{
                background: "oklch(0.18 0.02 60)",
                border:
                  floatSet !== null
                    ? "1px solid oklch(0.38 0.12 60)"
                    : "1px solid oklch(0.28 0.04 60)",
              }}
            >
              {floatSet !== null ? (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="text-[10px] sm:text-xs font-semibold"
                      style={{ color: "rgba(255,255,255,0.45)" }}
                    >
                      {t("established", "Set")}
                    </span>
                    <span className="font-black text-sm sm:text-base" style={{ color: "#fbbf24" }}>
                      ${fmt(floatSet)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="text-[10px] sm:text-xs font-semibold"
                      style={{ color: "rgba(255,255,255,0.45)" }}
                    >
                      {t("remain", "Remain")}
                    </span>
                    <span
                      className="font-black text-sm sm:text-base"
                      style={{ color: floatRemaining !== null && floatRemaining > 0 ? "#86efac" : "#fca5a5" }}
                    >
                      {floatRemaining !== null && floatRemaining > 0 ? `$${fmt(floatRemaining)}` : "—"}
                    </span>
                  </div>
                </>
              ) : (
                <span className="font-black text-sm" style={{ color: "rgba(255,255,255,0.25)" }}>
                  —
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Hero 1: Session stats ──────────────────────────────────────────── */}
      <section
        className="rounded-3xl p-4 relative overflow-hidden space-y-3"
        style={{ background: "var(--gradient-hero)", boxShadow: "var(--shadow-glow)" }}
      >
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="relative">
          <div className="flex items-center justify-between mb-3">
            <div
              className="flex items-center gap-2 text-sm font-medium"
              style={{ color: "rgba(0,0,0,0.75)" }}
            >
              <WalletIcon className="h-4 w-4" /> {t("period_session", "Session")}
            </div>
            <button
              onClick={() => setShowStatement(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl active:scale-95 transition text-xs font-black"
              style={{ background: "oklch(0.18 0.02 60)", color: "oklch(0.78 0.17 65)" }}
            >
              <FileText className="h-3.5 w-3.5" /> {t("statement", "Statement")}
            </button>
          </div>
          {loadingSummary ? (
            <div className="grid grid-cols-2 gap-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="rounded-2xl h-16 bg-white/10 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {/* Row 1 — Session Sales / Session Stock Cost / Session Gross Profit */}
              <div className="grid grid-cols-3 gap-2">
                <div
                  className="rounded-2xl p-2.5 flex flex-col gap-0.5 text-center"
                  style={{ background: "oklch(0.18 0.02 60)" }}
                >
                  <div
                    className="text-[9px] font-semibold leading-tight"
                    style={{ color: "rgba(255,255,255,0.5)" }}
                  >
                    {t("session_sales", "Session\nSales")}
                  </div>
                  <div
                    className="font-black text-xs"
                    style={{ color: barIsOpenWallet ? "#86efac" : "rgba(255,255,255,0.3)" }}
                  >
                    {barIsOpenWallet ? `$${fmt(sessionIncome)}` : "—"}
                  </div>
                </div>
                <div
                  className="rounded-2xl p-2.5 flex flex-col gap-0.5 text-center"
                  style={{ background: "oklch(0.18 0.02 60)" }}
                >
                  <div
                    className="text-[9px] font-semibold leading-tight"
                    style={{ color: "rgba(255,255,255,0.5)" }}
                  >
                    {t("session_stock_cost", "Session\nStock Cost")}
                  </div>
                  <div
                    className="font-black text-xs"
                    style={{ color: barIsOpenWallet ? "#fca5a5" : "rgba(255,255,255,0.3)" }}
                  >
                    {barIsOpenWallet ? `$${fmt(sessionStockCost)}` : "—"}
                  </div>
                </div>
                <div
                  className="rounded-2xl p-2.5 flex flex-col gap-0.5 text-center"
                  style={{ background: "oklch(0.18 0.02 60)" }}
                >
                  <div
                    className="text-[9px] font-semibold leading-tight"
                    style={{ color: "rgba(255,255,255,0.5)" }}
                  >
                    {t("session_gross", "Session\nGross Profit")}
                  </div>
                  {(() => {
                    const sgp = sessionIncome - sessionStockCost;
                    return (
                      <div
                        className="font-black text-xs"
                        style={{
                          color: !barIsOpenWallet
                            ? "rgba(255,255,255,0.3)"
                            : sgp >= 0
                              ? "#86efac"
                              : "#fca5a5",
                        }}
                      >
                        {barIsOpenWallet ? `${sgp >= 0 ? "+" : ""}$${fmt(sgp)}` : "—"}
                      </div>
                    );
                  })()}
                </div>
              </div>
              {/* Row 2 — Session Expenses / Session Net Profit */}
              <div className="grid grid-cols-2 gap-2">
                <div
                  className="rounded-2xl p-2.5 flex flex-col gap-0.5 text-center"
                  style={{ background: "oklch(0.18 0.02 60)" }}
                >
                  <div
                    className="text-[9px] font-semibold leading-tight"
                    style={{ color: "rgba(255,255,255,0.5)" }}
                  >
                    {t("session_expenses", "Session\nExpenses")}
                  </div>
                  <div className="font-black text-xs" style={{ color: "#fca5a5" }}>
                    {barIsOpenWallet ? `$${fmt(sessionExpense)}` : "$0.00"}
                  </div>
                </div>
                <div
                  className="rounded-2xl p-2.5 flex flex-col gap-0.5 text-center"
                  style={{ background: "oklch(0.18 0.02 60)" }}
                >
                  <div
                    className="text-[9px] font-semibold leading-tight"
                    style={{ color: "rgba(255,255,255,0.5)" }}
                  >
                    {t("session_net", "Session\nNet Profit")}
                  </div>
                  {(() => {
                    const sgp = sessionIncome - sessionStockCost;
                    const snp = sgp - sessionExpense;
                    return (
                      <div
                        className="font-black text-xs"
                        style={{
                          color: !barIsOpenWallet
                            ? "rgba(255,255,255,0.3)"
                            : snp >= 0
                              ? "#86efac"
                              : "#fca5a5",
                        }}
                      >
                        {barIsOpenWallet ? `${snp >= 0 ? "+" : ""}$${fmt(snp)}` : "—"}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── Hero 2: Today ── */}
      <section
        className="rounded-3xl p-4 relative overflow-hidden space-y-3"
        style={{ background: "var(--gradient-hero)", boxShadow: "var(--shadow-glow)" }}
      >
        <div className="absolute -left-10 -bottom-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="relative">
          <div
            className="flex items-center gap-2 text-sm font-medium mb-3"
            style={{ color: "rgba(0,0,0,0.75)" }}
          >
            <WalletIcon className="h-4 w-4" /> {t("period_today", "Today")}
          </div>
          {loadingSummary ? (
            <div className="grid grid-cols-2 gap-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="rounded-2xl h-16 bg-white/10 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {/* Row 1 — Today's Sales / Today's Stock Cost / Today's Gross Profit */}
              <div className="grid grid-cols-3 gap-2">
                <div
                  className="rounded-2xl p-2.5 flex flex-col gap-0.5 text-center"
                  style={{ background: "oklch(0.18 0.02 60)" }}
                >
                  <div
                    className="text-[9px] font-semibold leading-tight"
                    style={{ color: "rgba(255,255,255,0.5)" }}
                  >
                    {t("today_sales", "Today's\nSales")}
                  </div>
                  <div className="font-black text-xs" style={{ color: "#86efac" }}>
                    ${fmt(todayIncome)}
                  </div>
                </div>
                <div
                  className="rounded-2xl p-2.5 flex flex-col gap-0.5 text-center"
                  style={{ background: "oklch(0.18 0.02 60)" }}
                >
                  <div
                    className="text-[9px] font-semibold leading-tight"
                    style={{ color: "rgba(255,255,255,0.5)" }}
                  >
                    {t("today_stock_cost", "Today's\nStock Cost")}
                  </div>
                  <div className="font-black text-xs" style={{ color: "#fca5a5" }}>
                    {todayStockCost > 0 ? `$${fmt(todayStockCost)}` : "$0.00"}
                  </div>
                </div>
                <div
                  className="rounded-2xl p-2.5 flex flex-col gap-0.5 text-center"
                  style={{ background: "oklch(0.18 0.02 60)" }}
                >
                  <div
                    className="text-[9px] font-semibold leading-tight"
                    style={{ color: "rgba(255,255,255,0.5)" }}
                  >
                    {t("today_gross", "Today's\nGross Profit")}
                  </div>
                  {(() => {
                    const tgp = todayIncome - todayStockCost;
                    return (
                      <div
                        className="font-black text-xs"
                        style={{ color: tgp >= 0 ? "#86efac" : "#fca5a5" }}
                      >
                        {tgp >= 0 ? "+" : ""}${fmt(tgp)}
                      </div>
                    );
                  })()}
                </div>
              </div>
              {/* Row 2 — Today's Expenses / Today's Net Profit */}
              <div className="grid grid-cols-2 gap-2">
                <div
                  className="rounded-2xl p-2.5 flex flex-col gap-0.5 text-center"
                  style={{ background: "oklch(0.18 0.02 60)" }}
                >
                  <div
                    className="text-[9px] font-semibold leading-tight"
                    style={{ color: "rgba(255,255,255,0.5)" }}
                  >
                    {t("today_expenses", "Today's\nExpenses")}
                  </div>
                  <div className="font-black text-xs" style={{ color: "#fca5a5" }}>
                    {todayExpenses > 0 ? `$${fmt(todayExpenses)}` : "$0.00"}
                  </div>
                </div>
                <div
                  className="rounded-2xl p-2.5 flex flex-col gap-0.5 text-center"
                  style={{ background: "oklch(0.18 0.02 60)" }}
                >
                  <div
                    className="text-[9px] font-semibold leading-tight"
                    style={{ color: "rgba(255,255,255,0.5)" }}
                  >
                    {t("today_net", "Today's\nNet Profit")}
                  </div>
                  {(() => {
                    const tgp = todayIncome - todayStockCost;
                    const tnp = tgp - todayExpenses;
                    return (
                      <div
                        className="font-black text-xs"
                        style={{ color: tnp >= 0 ? "#86efac" : "#fca5a5" }}
                      >
                        {tnp >= 0 ? "+" : ""}${fmt(tnp)}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── Hero 2: Running totals + stock ──────────────────────────────────────── */}
      <section
        className="rounded-3xl p-4 relative overflow-hidden"
        style={{ background: "var(--gradient-hero)", boxShadow: "var(--shadow-glow)" }}
      >
        <div className="absolute -left-8 -bottom-8 h-36 w-36 rounded-full bg-white/10 blur-2xl" />
        <div className="relative">
          <div
            className="flex items-center gap-2 text-sm font-medium mb-3"
            style={{ color: "rgba(0,0,0,0.75)" }}
          >
            <WalletIcon className="h-4 w-4" /> {t("period_all_time", "All Time")}
          </div>
          {loadingSummary ? (
            <div className="grid grid-cols-2 gap-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="rounded-2xl h-16 bg-white/10 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {/* Row 1 — Total Cash Sales / Total Stock Cost / Gross Sales Profit */}
              <div className="grid grid-cols-3 gap-2">
                <div
                  className="rounded-2xl p-2.5 flex flex-col gap-0.5 text-center"
                  style={{ background: "oklch(0.18 0.02 60)" }}
                >
                  <div
                    className="text-[9px] font-semibold leading-tight"
                    style={{ color: "rgba(255,255,255,0.5)" }}
                  >
                    {t("alltime_sales", "Total\nSales")}
                  </div>
                  <div className="font-black text-xs" style={{ color: "#86efac" }}>
                    ${fmt(totalIncome)}
                  </div>
                </div>
                <div
                  className="rounded-2xl p-2.5 flex flex-col gap-0.5 text-center"
                  style={{ background: "oklch(0.18 0.02 60)" }}
                >
                  <div
                    className="text-[9px] font-semibold leading-tight"
                    style={{ color: "rgba(255,255,255,0.5)" }}
                  >
                    {t("alltime_stock_cost", "Total\nStock Cost")}
                  </div>
                  <div className="font-black text-xs" style={{ color: "#fca5a5" }}>
                    ${fmt(totalStockSoldCost)}
                  </div>
                </div>
                <div
                  className="rounded-2xl p-2.5 flex flex-col gap-0.5 text-center"
                  style={{ background: "oklch(0.18 0.02 60)" }}
                >
                  <div
                    className="text-[9px] font-semibold leading-tight"
                    style={{ color: "rgba(255,255,255,0.5)" }}
                  >
                    {t("alltime_gross", "Total\nGross Profit")}
                  </div>
                  {(() => {
                    const gsp = totalIncome - totalStockSoldCost;
                    return (
                      <div
                        className="font-black text-xs"
                        style={{ color: gsp >= 0 ? "#86efac" : "#fca5a5" }}
                      >
                        {gsp >= 0 ? "+" : ""}${fmt(gsp)}
                      </div>
                    );
                  })()}
                </div>
              </div>
              {/* Row 2 — Total Expense / Total Net Profit */}
              <div className="grid grid-cols-2 gap-2">
                <div
                  className="rounded-2xl p-2.5 flex flex-col gap-0.5 text-center"
                  style={{ background: "oklch(0.18 0.02 60)" }}
                >
                  <div
                    className="text-[9px] font-semibold leading-tight"
                    style={{ color: "rgba(255,255,255,0.5)" }}
                  >
                    {t("alltime_expenses", "Total\nExpenses")}
                  </div>
                  <div className="font-black text-xs" style={{ color: "#fca5a5" }}>
                    ${fmt(totalExpenses)}
                  </div>
                </div>
                <div
                  className="rounded-2xl p-2.5 flex flex-col gap-0.5 text-center"
                  style={{ background: "oklch(0.18 0.02 60)" }}
                >
                  <div
                    className="text-[9px] font-semibold leading-tight"
                    style={{ color: "rgba(255,255,255,0.5)" }}
                  >
                    {t("alltime_net", "Total\nNet Profit")}
                  </div>
                  {(() => {
                    const tnp = totalIncome - totalStockSoldCost - totalExpenses;
                    return (
                      <div
                        className="font-black text-xs"
                        style={{ color: tnp >= 0 ? "#86efac" : "#fca5a5" }}
                      >
                        {tnp >= 0 ? "+" : ""}${fmt(tnp)}
                      </div>
                    );
                  })()}
                </div>
              </div>
              {/* Row 3 — Total Stock Value / Total Stock Cost / Total Stock Profit */}
              <div className="grid grid-cols-3 gap-2">
                <div
                  className="rounded-2xl p-2.5 flex flex-col gap-0.5 text-center"
                  style={{ background: "oklch(0.18 0.02 60)" }}
                >
                  <div
                    className="text-[9px] font-semibold leading-tight"
                    style={{ color: "rgba(255,255,255,0.5)" }}
                  >
                     {t("stock_value", "Projected\nStock Value")}
                  </div>
                  <div className="font-black text-xs" style={{ color: "#86efac" }}>
                    ${fmt(stockResaleValue)}
                  </div>
                </div>
                <div
                  className="rounded-2xl p-2.5 flex flex-col gap-0.5 text-center"
                  style={{ background: "oklch(0.18 0.02 60)" }}
                >
                  <div
                    className="text-[9px] font-semibold leading-tight"
                    style={{ color: "rgba(255,255,255,0.5)" }}
                  >
                    {t("stock_cost_current", "Current\nStock Cost")}
                  </div>
                  <div className="font-black text-xs" style={{ color: "#fca5a5" }}>
                    ${fmt(stockCost)}
                  </div>
                </div>
                <div
                  className="rounded-2xl p-2.5 flex flex-col gap-0.5 text-center"
                  style={{ background: "oklch(0.18 0.02 60)" }}
                >
                  <div
                    className="text-[9px] font-semibold leading-tight"
                    style={{ color: "rgba(255,255,255,0.5)" }}
                  >
                     {t("stock_profit", "Projected\nStock Profit")}
                  </div>
                  <div
                    className="font-black text-xs"
                    style={{ color: stockExpectedProfit >= 0 ? "#86efac" : "#fca5a5" }}
                  >
                    {stockExpectedProfit >= 0 ? "+" : ""}${fmt(Math.abs(stockExpectedProfit))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <div
        className="flex rounded-2xl border border-border overflow-hidden"
        style={{ background: "var(--gradient-card)" }}
      >
        <button
          onClick={() => setActiveTab("transactions")}
          className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-black transition ${
            activeTab === "transactions"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <List className="h-4 w-4" /> {t("transactions_tab", "Transactions")}
        </button>
        <button
          onClick={() => setActiveTab("financials")}
          className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-black transition ${
            activeTab === "financials"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <BarChart3 className="h-4 w-4" /> {t("finances_tab", "Finances")}
        </button>
      </div>

      {/* ── Tab content ──────────────────────────────────────────────────── */}
      {activeTab === "transactions" ? (
        <TransactionsTab profile={profile} onDeleted={loadSummary} onPrintBill={openBillForOrder} onPrintBillCredit={openBillForCreditTx} />
      ) : (
        <FinancialsTab
          ownerId={profile.id}
          ownerWalletBalance={profile.wallet_balance}
          totalIncome={totalIncome}
          onDataChange={() => {
            loadSummary();
            ownerLoadFloatRef.current();
            refreshProfile();
          }}
          barSessionStart={(profile as any).bar_session_start ?? null}
          barClosedAt={(profile as any).bar_closed_at ?? null}
        />
      )}

      {showStatement && (
        <OwnerStatement
          profile={profile}
          onClose={() => setShowStatement(false)}
          chainBarIds={chainBarIds}
        />
      )}

      {/* Set / Update Float numpad */}
      {showSetFloat && (
        <NumPad
          label={floatSet !== null ? "Update Cashier Float" : "Set Cashier Float"}
          value={floatInput}
          onChange={setFloatInput}
          onCancel={() => {
            setShowSetFloat(false);
            setFloatInput("");
            setFloatSessionMode("new");
          }}
          onDone={handleSetFloat}
          confirmLabel={
            savingFloat ? "Saving…" : floatSet !== null ? "Update Float" : "Set Float"
          }
          sessionType={floatSet !== null ? floatSessionMode : undefined}
          onSessionChange={floatSet !== null ? setFloatSessionMode : undefined}
        />
      )}

      {billData && (
        <BillModal
          bill={billData}
          onClose={() => setBillData(null)}
          onPrint={handlePrintBill}
          onPdfShare={handlePdfShare}
          printing={printingBill}
        />
      )}
    </div>
  );
}

// ── Bill Data ──────────────────────────────────────────────────────────────────
type BillData = {
  storeName: string;
  orderNumber: string;
  date: string;
  items: { name: string; qty: number; price: number }[];
  subtotal: number;
  total: number;
  paid: number;
  change: number;
  payMode: string;
  customerName?: string;
  serverName?: string;
};

// ── Bill Modal ────────────────────────────────────────────────────────────────
function BillModal({ bill, onClose, onPrint, onPdfShare, printing }: {
  bill: BillData;
  onClose: () => void;
  onPrint: () => void;
  onPdfShare: () => void;
  printing: boolean;
}) {
  const [printerPaired, setPrinterPaired] = useState<boolean | null>(null);
  const [pairing, setPairing] = useState(false);

  useEffect(() => {
    isPrinterPaired().then(setPrinterPaired);
  }, []);

  const handlePrint = async () => {
    if (printerPaired === false) {
      // Trigger pairing first
      setPairing(true);
      const paired = await pairPrinter();
      setPairing(false);
      if (!paired) return;
      setPrinterPaired(true);
    }
    onPrint();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-sm rounded-3xl overflow-hidden border border-border shadow-2xl"
        style={{ background: "var(--gradient-card)" }}>
        <div className="px-5 pt-5 pb-2 shrink-0 space-y-1">
          <div className="flex justify-between items-center">
            <h2 className="font-black text-lg">Bill</h2>
            <button onClick={onClose} className="h-8 w-8 rounded-full flex items-center justify-center bg-muted">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Receipt Paper Card */}
        <div className="px-5 py-2 overflow-y-auto flex-1">
          <div className="bg-white text-zinc-900 rounded-xl p-4 shadow-inner text-left font-mono text-xs leading-tight border border-zinc-300 select-none">
            <div className="text-center font-black text-zinc-950 text-base font-sans tracking-tight uppercase mb-0.5">
              {bill.storeName || "My Business"}
            </div>
            <div className="text-center text-[10px] text-zinc-600">{bill.date || ""}</div>
            {bill.serverName && (
              <div className="text-center text-[10px] text-zinc-600">Served by {bill.serverName}</div>
            )}
            <div className="text-center text-[10px] text-zinc-600">ORDER #{bill.orderNumber || 1}</div>

            <div className="border-t border-dashed border-zinc-400 my-2" />

            <div className="space-y-1 my-2">
              {bill.items.map((it, idx) => (
                <div key={idx} className="flex justify-between items-start">
                  <span className="font-semibold text-zinc-900 pr-2 break-all">
                    {it.qty}x {it.name}
                  </span>
                  <span className="font-bold text-zinc-950 whitespace-nowrap">
                    ${(it.qty * it.price).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>

            <div className="border-t border-dashed border-zinc-400 my-2" />

            <div className="space-y-1">
              <div className="flex justify-between text-zinc-700">
                <span>Total</span>
                <span>${bill.total.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-zinc-700">
                <span>{bill.payMode === "credit" ? "Credit" : "Cash Tendered"}</span>
                <span>${bill.paid.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold text-zinc-900">
                <span>Change</span>
                <span>${bill.change.toFixed(2)}</span>
              </div>
              {bill.customerName && (
                <div className="border-t border-dashed border-zinc-400 my-2">
                  <span className="text-zinc-700">Customer: {bill.customerName}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 pb-5 pt-2 flex flex-col gap-2 shrink-0">
          <div className="flex gap-2">
            <button
              onClick={handlePrint}
              disabled={printing || pairing}
              className="flex-1 h-12 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-50 text-primary-foreground shadow-lg"
              style={{ background: "var(--gradient-hero)" }}
            >
              {printing || pairing
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : printerPaired === false ? "🔌 Connect Printer" : "Print"}
            </button>
            <button
              onClick={onPdfShare}
              className="flex-1 h-12 rounded-2xl font-black text-sm border border-border hover:bg-muted/30 transition active:scale-95 text-foreground/80"
            >
              PDF / WhatsApp
            </button>
          </div>
          {printerPaired && (
            <button
              onClick={() => { setPrinterPaired(false); localStorage.removeItem("bartap-receipt-vid"); localStorage.removeItem("bartap-receipt-pid"); }}
              className="text-[11px] text-muted-foreground underline text-center active:opacity-70"
            >
              Change printer
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Page Entry Point ─────────────────────────────────────────────────────────
export default function WalletPage() {
  const { profile } = useAuth();
  const { effectiveOwnerId, activeBar } = useChain();
  if (!profile) return null;
  // For chain owners, use the active bar's id AND bar name so PDFs/queries are scoped to that bar
  const walletProfile =
    profile.role === "owner"
      ? {
          ...profile,
          id: effectiveOwnerId(profile.id),
          username: activeBar?.bar_name ?? profile.username,
        }
      : profile;
  if (walletProfile.role === "owner") return <OwnerWallet profile={walletProfile} />;
  return <CashierWallet profile={walletProfile} />;
}
