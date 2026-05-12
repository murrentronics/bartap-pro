import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { createCashier, deleteCashier } from "@/lib/cashiers.functions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Trash2, Eraser, UserPlus, User, Loader2, FileText, ChevronLeft,
  ChevronRight, Receipt, ArrowDownLeft, X,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { downloadPdf } from "@/lib/download";

export const Route = createFileRoute("/_app/cashiers")({
  component: CashiersPage,
});

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
function CashierStatement({ cashier, onClose }: { cashier: Cashier; onClose: () => void }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [txs, setTxs] = useState<WalletTx[]>([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    setLoading(true);
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("cashier_id", cashier.id)
      .then(({ count }) => setTotal(count ?? 0));

    supabase
      .from("orders")
      .select("*")
      .eq("cashier_id", cashier.id)
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
      .then(({ data }) => {
        setOrders((data ?? []) as unknown as Order[]);
        setLoading(false);
      });

    supabase
      .from("wallet_transactions")
      .select("*")
      .eq("profile_id", cashier.id)
      .eq("type", "transfer_out")
      .order("created_at", { ascending: false })
      .then(({ data }) => setTxs((data ?? []) as WalletTx[]));
  }, [cashier.id, page]);

  const grouped = orders.reduce<Record<string, Order[]>>((acc, o) => {
    const key = new Date(o.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long" });
    if (!acc[key]) acc[key] = [];
    acc[key].push(o);
    return acc;
  }, {});

  const months = Object.keys(grouped);

  const getClearedForMonth = (month: string) =>
    txs.find((tx) => {
      const txMonth = new Date(tx.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long" });
      return txMonth === month;
    });

  // PDF download — works on Android via Capacitor Share, on web via browser download
  const handleDownload = async (month: string) => {
    const monthOrders = grouped[month] ?? [];
    const monthTotal = monthOrders.reduce((s, o) => s + Number(o.total), 0);
    const cleared = getClearedForMonth(month);

    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const lm = 15;
    let y = 20;

    // Title
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("Bartendaz Pro", lm, y); y += 8;
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text("Cashier Statement", lm, y); y += 6;
    doc.text("Cashier: " + cashier.username, lm, y); y += 6;
    doc.text("Period: " + month, lm, y); y += 6;
    doc.text("Generated: " + new Date().toLocaleString(), lm, y); y += 10;

    // Divider
    doc.setDrawColor(180, 120, 40);
    doc.line(lm, y, 195, y); y += 6;

    // Orders heading
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Orders", lm, y); y += 7;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);

    monthOrders.forEach((o) => {
      if (y > 270) { doc.addPage(); y = 20; }
      doc.text(new Date(o.created_at).toLocaleString(), lm, y);
      doc.text("$" + Number(o.total).toFixed(2), 175, y, { align: "right" });
      y += 5;
      const items = (o.items || []).map((i) => i.qty + "x " + i.name).join(", ");
      const wrapped = doc.splitTextToSize("  " + items, 155);
      doc.text(wrapped, lm, y);
      y += wrapped.length * 4.5 + 1;
      doc.text(
        "  Paid $" + Number(o.paid).toFixed(2) + "  Change $" + Number(o.change_given).toFixed(2),
        lm, y
      );
      y += 6;
    });

    // Total
    y += 2;
    doc.line(lm, y, 195, y); y += 6;
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Month Total:", lm, y);
    doc.text("$" + monthTotal.toFixed(2), 175, y, { align: "right" });
    y += 8;

    // Cleared record
    if (cleared) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(40, 160, 80);
      doc.text("Cleared to owner: $" + Math.abs(Number(cleared.amount)).toFixed(2), lm, y);
      doc.text(new Date(cleared.created_at).toLocaleString(), 175, y, { align: "right" });
      doc.setTextColor(0, 0, 0);
    }

    const filename = "statement-" + cashier.username + "-" + month.replace(/\s/g, "-") + ".pdf";
    await downloadPdf(filename, doc.output("datauristring"));
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
            <h2 className="text-xl font-black">Statement</h2>
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
                const monthOrders = grouped[month];
                const monthTotal = monthOrders.reduce((s, o) => s + Number(o.total), 0);
                const cleared = getClearedForMonth(month);
                const isOpen = selectedMonth === month;

                return (
                  <div key={month} className="rounded-2xl border border-border overflow-hidden">
                    <button
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition"
                      onClick={() => setSelectedMonth(isOpen ? null : month)}
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-black text-sm">{month}</span>
                        {cleared && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 border border-green-500/30 font-semibold">
                            Cleared
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-black text-primary">${monthTotal.toFixed(2)}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={(e) => { e.stopPropagation(); handleDownload(month); }}
                        >
                          PDF
                        </Button>
                        <ChevronRight
                          className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`}
                        />
                      </div>
                    </button>

                    {isOpen && (
                      <div className="border-t border-border divide-y divide-border/50">
                        {monthOrders.map((o) => (
                          <div key={o.id} className="px-4 py-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 min-w-0">
                                <Receipt className="h-3.5 w-3.5 text-primary shrink-0" />
                                <span className="text-xs text-muted-foreground">
                                  {new Date(o.created_at).toLocaleString()}
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
                        ))}
                        {cleared && (
                          <div className="px-4 py-3 flex items-center gap-3 bg-green-500/5">
                            <ArrowDownLeft className="h-3.5 w-3.5 text-green-400 shrink-0" />
                            <div className="flex-1 text-xs text-green-400">
                              Cleared to owner on {new Date(cleared.created_at).toLocaleString()}
                            </div>
                            <span className="font-black text-green-400 text-sm">
                              -${Math.abs(Number(cleared.amount)).toFixed(2)}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Prev
              </Button>
              <span className="text-sm text-muted-foreground">Page {page + 1} of {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Cashiers Page ───────────────────────────────────────────────────────
function CashiersPage() {
  const { profile, session, refreshProfile } = useAuth();
  const [list, setList] = useState<Cashier[]>([]);
  const [tab, setTab] = useState("add");
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [busy, setBusy] = useState(false);
  const [statementCashier, setStatementCashier] = useState<Cashier | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const create = useServerFn(createCashier);
  const del = useServerFn(deleteCashier);

  const load = async () => {
    if (!profile) return;
    const { data } = await supabase
      .from("profiles")
      .select("id,username,wallet_balance")
      .eq("parent_id", profile.id)
      .order("created_at", { ascending: false });
    setList((data ?? []) as Cashier[]);
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

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.access_token) { toast.error("Not authenticated"); return; }
    setBusy(true);
    try {
      await create({ data: { username: u, password: p }, headers: authHeaders });
      toast.success(`Cashier "${u}" created`);
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
      toast.success(`Cleared $${Number(c.wallet_balance).toFixed(2)} from ${c.username}`);
      load();
      refreshProfile();
    }
  };

  const onDelete = async (c: Cashier) => {
    if (!session?.access_token) { toast.error("Not authenticated"); return; }
    try {
      await del({ data: { cashier_id: c.id }, headers: authHeaders });
      toast.success(`Removed ${c.username}`);
      load();
      refreshProfile();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete cashier");
    }
  };

  return (
    <div>
      <h1 className="text-3xl font-black mb-6">Cashiers</h1>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-2 w-full">
          <TabsTrigger value="add">Add Cashier</TabsTrigger>
          <TabsTrigger value="manage">Manage ({list.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="add">
          <form
            onSubmit={onCreate}
            className="mt-6 rounded-2xl p-4 space-y-4 border border-border"
            style={{ background: "var(--gradient-card)", boxShadow: "var(--shadow-elegant)" }}
          >
            <div>
              <Label>Username</Label>
              <Input value={u} onChange={(e) => setU(e.target.value)} placeholder="cashier1" required minLength={3} autoComplete="off" />
              <p className="text-xs text-muted-foreground mt-1">Lowercase letters, numbers, underscore.</p>
            </div>
            <div>
              <Label>Password</Label>
              <Input type="password" value={p} onChange={(e) => setP(e.target.value)} required minLength={6} autoComplete="new-password" />
            </div>
            <Button type="submit" disabled={busy} className="w-full h-12 font-black" style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}>
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
                </div>
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <Button size="sm" variant="outline" className="flex-1 h-9" onClick={() => setStatementCashier(c)}>
                    <FileText className="h-4 w-4 mr-1" /> Statement
                  </Button>
                  <Button size="sm" variant="secondary" className="flex-1 h-9" onClick={() => onClear(c)} disabled={Number(c.wallet_balance) === 0}>
                    <Eraser className="h-4 w-4 mr-1" /> Clear
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="destructive" className="h-9 w-9 p-0"><Trash2 className="h-4 w-4" /></Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete {c.username}?</AlertDialogTitle>
                        <AlertDialogDescription>Any wallet balance will be transferred to your account first, then the account is removed permanently.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => onDelete(c)}>Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {statementCashier && (
        <CashierStatement cashier={statementCashier} onClose={() => setStatementCashier(null)} />
      )}
    </div>
  );
}
