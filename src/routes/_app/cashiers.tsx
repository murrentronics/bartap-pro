import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useTranslation } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { createCashier, deleteCashier, resetCashierPassword } from "@/lib/cashiers.functions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Trash2, Eraser, UserPlus, User, Loader2, FileText, ChevronDown,
  Receipt, ArrowDownLeft, X, Download, KeyRound, Eye, EyeOff,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { downloadPdf } from "@/lib/download";
import { drawHeader, addFootersToAllPages, LM, RM, CONTENT_BOTTOM } from "@/lib/pdfHelpers";

type Cashier = { id: string; username: string; wallet_balance: number };

type Order = {
  id: string;
  total: number;
  paid: number;
  change_given: number;
  items: { name: string; qty: number; price: number }[];
  created_at: string;
};

type WalletTx = {
  id: string;
  amount: number;
  type: string;
  note: string | null;
  created_at: string;
};

const PAGE_SIZE = 200;

// ─── Cashier Statement Modal ──────────────────────────────────────────────────
type CashierFlatRecord =
  | { kind: "order"; data: Order; ts: number }
  | { kind: "tx"; data: WalletTx; ts: number };

function CashierStatement({ cashier, ownerName, onClose }: { cashier: Cashier; ownerName: string; onClose: () => void }) {
  const { t } = useTranslation();
  const [orders, setOrders] = useState<Order[]>([]);
  const [txs, setTxs] = useState<WalletTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [downloadingMonth, setDownloadingMonth] = useState<string | null>(null);
  const [downloadedMonth, setDownloadedMonth] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      supabase
        .from("orders")
        .select("*")
        .eq("cashier_id", cashier.id)
        .order("created_at", { ascending: false })
        .then(({ data }) => setOrders((data ?? []) as unknown as Order[])),
      supabase
        .from("wallet_transactions")
        .select("*")
        .eq("profile_id", cashier.id)
        .eq("type", "transfer_out")
        .order("created_at", { ascending: false })
        .then(({ data }) => setTxs((data ?? []) as WalletTx[])),
    ]).finally(() => setLoading(false));
  }, [cashier.id]);

  // Build flat merged list newest-first
  const allRecords: CashierFlatRecord[] = [
    ...orders.map((o): CashierFlatRecord => ({ kind: "order", data: o, ts: new Date(o.created_at).getTime() })),
    ...txs.map((tx): CashierFlatRecord => ({ kind: "tx", data: tx, ts: new Date(tx.created_at).getTime() })),
  ].sort((a, b) => b.ts - a.ts);

  // Derive unique months for the dropdown rows
  const months = Array.from(
    new Set(
      allRecords.map((r) =>
        new Date(r.data.created_at).toLocaleDateString("en-GB", { year: "numeric", month: "long" })
      )
    )
  );

  const getRecordsForMonth = (month: string) =>
    allRecords.filter((r) =>
      new Date(r.data.created_at).toLocaleDateString("en-GB", { year: "numeric", month: "long" }) === month
    );

  const handleDownload = async (month: string) => {
    if (downloadingMonth) return;
    setDownloadingMonth(month);
    try {
      const monthRecords = getRecordsForMonth(month);
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "mm", format: "a4" });

      const generated = new Date().toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true, day: "2-digit", month: "2-digit", year: "numeric" });
      let y = await drawHeader(doc, ownerName, "Cashier Statement", month, generated);

      // ── Calculate summary figures ──────────────────────────────────────────
      const orders = monthRecords.filter((r) => r.kind === "order");
      const txs    = monthRecords.filter((r) => r.kind === "tx");
      const totalSales   = orders.reduce((s, r) => s + Number((r.data as Order).total), 0);
      const totalCleared = txs.reduce((s, r) => s + Math.abs(Number((r.data as WalletTx).amount)), 0);
      const orderCount   = orders.length;

      // ── Cashier sub-line ──────────────────────────────────────────────────
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      doc.text("Statement for cashier: " + cashier.username, LM, y);
      y += 7;
      doc.setTextColor(0, 0, 0);

      // ── Summary box ───────────────────────────────────────────────────────
      const boxW = RM - LM;
      const boxH = 24;
      doc.setFillColor(245, 240, 230);
      doc.roundedRect(LM, y, boxW, boxH, 2, 2, "F");
      doc.setDrawColor(232, 146, 42);
      doc.setLineWidth(0.4);
      doc.roundedRect(LM, y, boxW, boxH, 2, 2, "S");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(100, 70, 10);
      doc.text("PERIOD SUMMARY", LM + 3, y + 5);

      const cols = [
        { label: "Total Orders",    value: String(orderCount) },
        { label: "Total Sales",     value: "$" + totalSales.toFixed(2) },
        { label: "Total Cleared",   value: "$" + totalCleared.toFixed(2) },
        { label: "Net Outstanding", value: "$" + (totalSales - totalCleared).toFixed(2) },
      ];
      const colW = boxW / cols.length;
      cols.forEach((col, i) => {
        const cx = LM + i * colW + colW / 2;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.5);
        doc.setTextColor(100, 100, 100);
        doc.text(col.label, cx, y + 12, { align: "center" });
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        const net = totalSales - totalCleared;
        if (col.label === "Net Outstanding") {
          doc.setTextColor(net <= 0 ? 40 : 180, net <= 0 ? 140 : 60, 40);
        } else {
          doc.setTextColor(30, 30, 30);
        }
        doc.text(col.value, cx, y + 20, { align: "center" });
      });

      doc.setTextColor(0, 0, 0);
      y += boxH + 5;

      // ── Column headers ────────────────────────────────────────────────────
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
        if (y > CONTENT_BOTTOM) { doc.addPage(); y = 20; }
        if (rec.kind === "order") {
          const o = rec.data as Order;
          doc.setFont("helvetica", "bold");
          doc.text(new Date(o.created_at).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true, day: "2-digit", month: "2-digit", year: "numeric" }), LM, y);
          doc.text("$" + Number(o.total).toFixed(2), RM, y, { align: "right" });
          y += 5;
          doc.setFont("helvetica", "normal");
          const items = (o.items || []).map((i) => i.qty + "x " + i.name).join(", ");
          const wrapped = doc.splitTextToSize("  " + items, 155);
          doc.text(wrapped, LM, y);
          y += wrapped.length * 4.5 + 1;
          doc.setTextColor(100, 100, 100);
          doc.text("  Paid $" + Number(o.paid).toFixed(2) + "   Change $" + Number(o.change_given).toFixed(2), LM, y);
          doc.setTextColor(0, 0, 0);
          y += 4;
          doc.setDrawColor(220, 220, 220);
          doc.setLineWidth(0.1);
          doc.line(LM, y, RM, y);
          y += 4;
        } else {
          const tx = rec.data as WalletTx;
          doc.setFont("helvetica", "bold");
          doc.setTextColor(40, 140, 80);
          doc.text(new Date(tx.created_at).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true, day: "2-digit", month: "2-digit", year: "numeric" }), LM, y);
          doc.text(tx.note ?? "Cleared to owner", LM + 55, y);
          doc.text("-$" + Math.abs(Number(tx.amount)).toFixed(2), RM, y, { align: "right" });
          doc.setTextColor(0, 0, 0);
          doc.setFont("helvetica", "normal");
          y += 4;
          doc.setDrawColor(220, 220, 220);
          doc.setLineWidth(0.1);
          doc.line(LM, y, RM, y);
          y += 4;
        }
      });

      addFootersToAllPages(doc);

      const filename = "cashier-statement-" + cashier.username + "-" + month.replace(/\s/g, "-") + ".pdf";
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
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border">
          <div>
            <h2 className="text-xl font-black">{t("statement", "Statement")}</h2>
            <p className="text-sm text-muted-foreground">{cashier.username}</p>
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
            <div className="text-muted-foreground text-sm py-8 text-center">No orders yet.</div>
          ) : (
            <div className="space-y-4">
              {months.map((month) => {
                const monthRecords = getRecordsForMonth(month);
                const monthTotal = monthRecords
                  .filter((r) => r.kind === "order")
                  .reduce((s, r) => s + Number((r.data as Order).total), 0);
                const hasCleared = monthRecords.some((r) => r.kind === "tx");
                const isOpen = selectedMonth === month;

                return (
                  <div key={month} className="rounded-2xl border border-border overflow-hidden">
                    {/* Row header — month info top row, arrow + PDF bottom row */}
                    <button
                      className="w-full flex flex-col px-4 py-3 hover:bg-muted/30 transition"
                      onClick={() => setSelectedMonth(isOpen ? null : month)}
                    >
                      {/* Top row: month name + Sales badge + total */}
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-3">
                          <span className="font-black text-sm">{month}</span>
                          {hasCleared && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 border border-green-500/30 font-semibold">
                              Sales
                            </span>
                          )}
                        </div>
                        <span className="font-black text-primary">${monthTotal.toFixed(2)}</span>
                      </div>
                      {/* Bottom row: arrow centered + PDF at end */}
                      <div className="flex items-center justify-between w-full mt-2">
                        <div className="flex-1" />
                        <ChevronDown
                          className={`h-5 w-5 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
                        />
                        <div className="flex-1 flex justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-10 px-4 text-sm font-bold gap-1.5"
                            type="button"
                            disabled={downloadingMonth === month}
                            onClick={(e) => { e.stopPropagation(); handleDownload(month); }}
                            style={downloadedMonth === month ? { background: "#16a34a", color: "#fff", borderColor: "#16a34a" } : {}}
                          >
                            {downloadingMonth === month
                              ? <Loader2 className="h-4 w-4 animate-spin" />
                              : downloadedMonth === month
                              ? <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                              : <Download className="h-4 w-4" />}
                            {downloadingMonth === month ? "…" : downloadedMonth === month ? "Done" : "PDF"}
                          </Button>
                        </div>
                      </div>
                    </button>

                    {isOpen && (
                      <div className="border-t border-border divide-y divide-border/50">
                        {monthRecords.map((rec) => {
                          if (rec.kind === "tx") {
                            const tx = rec.data;
                            return (
                              <div key={tx.id} className="px-4 py-3 flex items-center gap-3 bg-green-500/5">
                                <ArrowDownLeft className="h-3.5 w-3.5 text-green-400 shrink-0" />
                                <div className="flex-1 text-xs text-green-400">
                                  {tx.note ?? "Cleared to owner"} · {new Date(tx.created_at).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true, day: "2-digit", month: "2-digit", year: "numeric" })}
                                </div>
                                <span className="font-black text-green-400 text-sm">
                                  -${Math.abs(Number(tx.amount)).toFixed(2)}
                                </span>
                              </div>
                            );
                          }
                          const o = rec.data as Order;
                          return (
                            <div key={o.id} className="px-4 py-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 min-w-0">
                                  <Receipt className="h-3.5 w-3.5 text-primary shrink-0" />
                                  <span className="text-xs text-muted-foreground">
                                    {new Date(o.created_at).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true, day: "2-digit", month: "2-digit", year: "numeric" })}
                                  </span>
                                </div>
                                <span className="font-black text-primary text-sm ml-2">
                                  ${Number(o.total).toFixed(2)}
                                </span>
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground line-clamp-2">
                                {(o.items || []).map((i) => `${i.qty}× ${i.name}`).join(" · ")}
                              </div>
                              <div className="mt-0.5 text-xs text-muted-foreground">
                                Paid ${Number(o.paid).toFixed(2)} · Change ${Number(o.change_given).toFixed(2)}
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
    </div>
  );
}

// ─── Main Cashiers Page ───────────────────────────────────────────────────────
export default function CashiersPage() {
  const { profile, session, refreshProfile } = useAuth();
  const { t } = useTranslation();
  const [list, setList] = useState<Cashier[]>([]);
  const [tab, setTab] = useState("add");
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [busy, setBusy] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [statementCashier, setStatementCashier] = useState<Cashier | null>(null);
  const [resetPwCashier, setResetPwCashier] = useState<Cashier | null>(null);
  const [newPw, setNewPw] = useState("");
  const [showNewPw, setShowNewPw] = useState(false);
  const [showCreatePw, setShowCreatePw] = useState(false);
  const [resettingPw, setResettingPw] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const create = createCashier;
  const del = deleteCashier;

  const load = async () => {
    if (!profile) return;
    const { data } = await supabase
      .from("profiles")
      .select("id,username,wallet_balance")
      .eq("parent_id", profile.id)
      .order("created_at", { ascending: false });
    setList(((data ?? []) as Cashier[]).sort((a, b) => a.username.localeCompare(b.username)));
  };

  useEffect(() => { load(); }, [profile?.id]);

  useEffect(() => {
    if (!profile?.id) return;
    if (channelRef.current) supabase.removeChannel(channelRef.current);
    const ch = supabase
      .channel(`cashiers-${profile.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles", filter: `parent_id=eq.${profile.id}` }, () => load())
      .subscribe();
    channelRef.current = ch;
    return () => { supabase.removeChannel(ch); channelRef.current = null; };
  }, [profile?.id]);

  if (profile?.role !== "owner") {
    return <div className="text-center text-muted-foreground py-20">Only owners can manage cashiers.</div>;
  }

  const authHeaders: HeadersInit | undefined = session?.access_token
    ? { authorization: `Bearer ${session.access_token}` }
    : undefined;
  void authHeaders; // unused now but kept for reference

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.access_token) { toast.error("Not authenticated"); return; }
    
    // Validate username format - no spaces, single word
    if (/\s/.test(u)) {
      const errorMsg = "Username cannot contain spaces. Use a single word (e.g., cashier1, john_doe)";
      setUsernameError(errorMsg);
      toast.error(errorMsg);
      return;
    }
    
    // Validate username format - only lowercase letters, numbers, underscore
    if (!/^[a-z0-9_]+$/.test(u)) {
      const errorMsg = "Username must contain only lowercase letters, numbers, and underscores";
      setUsernameError(errorMsg);
      toast.error(errorMsg);
      return;
    }
    
    setUsernameError(null);
    setBusy(true);
    try {
      await create({ username: u, password: p });
      setU(""); setP("");
      setTab("manage");
      load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create cashier");
    } finally {
      setBusy(false);
    }
  };

  const onClear = async (c: Cashier) => {
    const { error } = await supabase.rpc("transfer_cashier_to_owner", { _cashier_id: c.id });
    if (error) {
      toast.error(error.message);
    } else {
      load();
      refreshProfile();
    }
  };

  const onResetPassword = async () => {
    if (!resetPwCashier || newPw.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    setResettingPw(true);
    try {
      await resetCashierPassword({ cashier_id: resetPwCashier.id, new_password: newPw });
      toast.success(`Password updated for ${resetPwCashier.username}`);
      setResetPwCashier(null);
      setNewPw("");
      setShowNewPw(false);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to reset password");
    } finally {
      setResettingPw(false);
    }
  };

  const onDelete = async (c: Cashier) => {
    if (!session?.access_token) { toast.error("Not authenticated"); return; }
    try {
      await del({ cashier_id: c.id });
      toast.success(`Removed ${c.username}`);
      load();
      refreshProfile();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete cashier");
    }
  };

  return (
    <div>
      {/* Sticky page title */}
      <div className="sticky top-0 z-20 -mx-3 px-3 pt-2 pb-2 bg-background/95 backdrop-blur border-b border-border">
        <h1 className="text-xl font-black leading-tight">{t("cashiers_title", "Cashiers")}</h1>
      </div>
      <div className="pt-3">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-2 w-full">
          <TabsTrigger value="add">{t("add_cashier", "Add Cashier")}</TabsTrigger>
          <TabsTrigger value="manage">{t("cashier_name", "Manage")} ({list.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="add">
          <form
            onSubmit={onCreate}
            className="mt-6 rounded-2xl p-4 space-y-4 border border-border"
            style={{ background: "var(--gradient-card)", boxShadow: "var(--shadow-elegant)" }}
          >
            <div>
              <Label>{t("username", "Username")}</Label>
              <Input 
                value={u} 
                onChange={(e) => {
                  const val = e.target.value;
                  setU(val);
                  // Real-time validation
                  if (val.length > 0) {
                    if (/\s/.test(val)) {
                      setUsernameError("No spaces allowed");
                    } else if (!/^[a-z0-9_]+$/.test(val)) {
                      setUsernameError("Only lowercase letters, numbers, and underscores");
                    } else {
                      setUsernameError(null);
                    }
                  } else {
                    setUsernameError(null);
                  }
                }} 
                placeholder="cashier1" 
                required 
                minLength={3} 
                autoComplete="off"
                className={usernameError ? "border-red-500 focus-visible:ring-red-500" : ""}
              />
              {usernameError ? (
                <p className="text-xs text-red-500 mt-1 font-medium">{usernameError}</p>
              ) : (
                <p className="text-xs text-muted-foreground mt-1">Single word only. Use lowercase letters, numbers, or underscores (no spaces).</p>
              )}
            </div>
            <div>
              <Label>{t("cashier_password", "Password")}</Label>
              <div className="relative mt-1">
                <Input type={showCreatePw ? "text" : "password"} value={p} onChange={(e) => setP(e.target.value)} required minLength={6} autoComplete="new-password" className="pr-10" />
                <button type="button" onClick={() => setShowCreatePw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition">
                  {showCreatePw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" disabled={busy || !!usernameError} className="w-full h-12 font-black" style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}>
              {busy ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating...</> : <><UserPlus className="h-4 w-4 mr-2" /> Create Cashier</>}
            </Button>
          </form>
        </TabsContent>

        <TabsContent value="manage">
          <div className="mt-6 space-y-2">
            {list.length === 0 && <div className="text-muted-foreground py-8 text-center">No cashiers yet.</div>}
            {list.map((c) => (
              <div key={c.id} className="rounded-2xl p-3 border border-border" style={{ background: "var(--gradient-card)" }}>
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 rounded-full flex items-center justify-center shrink-0" style={{ background: "var(--gradient-hero)" }}>
                    <User className="h-5 w-5 text-primary-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold">{c.username}</div>
                    <div className="text-sm text-muted-foreground">
                      Balance: <span className="text-primary font-black">${Number(c.wallet_balance).toFixed(2)}</span>
                    </div>
                  </div>
                  {/* Delete button — top right */}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="destructive" className="h-9 w-9 p-0 shrink-0"><Trash2 className="h-4 w-4" /></Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete {c.username}?</AlertDialogTitle>
                        <AlertDialogDescription>Any wallet balance will be transferred to your account first, then the account is removed permanently.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter className="flex-row gap-3 mt-2">
                        <AlertDialogCancel className="flex-1 h-14 text-base font-black m-0">Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => onDelete(c)} className="flex-1 h-14 text-base font-black bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <Button size="sm" variant="outline" className="flex-1 min-w-[90px] h-12 text-sm font-black" onClick={() => setStatementCashier(c)}>
                    <FileText className="h-5 w-5 mr-1.5" /> Statement
                  </Button>
                  <Button size="sm" variant="secondary" className="flex-1 min-w-[90px] h-12 text-sm font-black" onClick={() => onClear(c)} disabled={Number(c.wallet_balance) === 0}>
                    <Eraser className="h-5 w-5 mr-1.5" /> Clear
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1 min-w-[90px] h-12 text-sm font-black" onClick={() => { setResetPwCashier(c); setNewPw(""); setShowNewPw(false); }}>
                    <KeyRound className="h-5 w-5 mr-1.5" /> Password
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {statementCashier && (
        <CashierStatement
          cashier={statementCashier}
          ownerName={profile.username}
          onClose={() => setStatementCashier(null)}
        />
      )}

      {/* ── Reset Password Modal ── */}
      {resetPwCashier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-xs rounded-3xl border border-border shadow-2xl overflow-hidden" style={{ background: "var(--gradient-card)" }}>
            <div className="px-6 pt-6 pb-2 text-center">
              <div className="h-12 w-12 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: "rgba(251,146,60,0.15)", border: "1px solid rgba(251,146,60,0.3)" }}>
                <KeyRound className="h-6 w-6" style={{ color: "var(--primary)" }} />
              </div>
              <h3 className="font-black text-base">{t("change_password", "Reset Password")}</h3>
              <p className="text-xs text-muted-foreground mt-1">Set a new password for <span className="font-bold text-foreground">{resetPwCashier.username}</span></p>
            </div>
            <div className="px-6 pb-6 pt-4 space-y-4">
              <div className="relative">
                <Input
                  type={showNewPw ? "text" : "password"}
                  placeholder="New password (min 6 chars)"
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  className="pr-10 h-11"
                  minLength={6}
                />
                <button type="button" onClick={() => setShowNewPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition">
                  {showNewPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button variant="outline" className="flex-1 min-w-[100px] h-11" onClick={() => { setResetPwCashier(null); setNewPw(""); }}>
                  {t("cancel", "Cancel")}
                </Button>
                <Button
                  className="flex-1 min-w-[100px] h-11 font-black"
                  disabled={resettingPw || newPw.length < 6}
                  onClick={onResetPassword}
                  style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}
                >
                  {resettingPw ? <Loader2 className="h-4 w-4 animate-spin" /> : t("save", "Save")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
