import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Wallet as WalletIcon, Receipt, ChevronLeft, ChevronRight, ArrowDownLeft, RotateCcw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/wallet")({
  component: WalletPage,
});

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

function PaginationBar({
  page,
  totalPages,
  total,
  onPrev,
  onNext,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between">
      <Button variant="outline" size="sm" disabled={page === 0} onClick={onPrev}>
        <ChevronLeft className="h-4 w-4 mr-1" /> Prev
      </Button>
      <span className="text-sm text-muted-foreground">
        Page {page + 1} of {totalPages} · {total} records
      </span>
      <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={onNext}>
        Next <ChevronRight className="h-4 w-4 ml-1" />
      </Button>
    </div>
  );
}

// ─── Cashier wallet: shows their own orders in chronological order ────────────
function CashierWallet({ profile }: { profile: { id: string; wallet_balance: number; role: string } }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    setLoading(true);
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("cashier_id", profile.id)
      .then(({ count }) => setTotal(count ?? 0));

    supabase
      .from("orders")
      .select("*")
      .eq("cashier_id", profile.id)
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
      .then(({ data }) => {
        setOrders((data ?? []) as unknown as Order[]);
        setLoading(false);
      });
  }, [profile.id, page]);

  const handlePrev = () => { setPage((p) => p - 1); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const handleNext = () => { setPage((p) => p + 1); window.scrollTo({ top: 0, behavior: "smooth" }); };

  return (
    <div className="space-y-5">
      {/* Balance card */}
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
            ${Number(profile.wallet_balance).toFixed(2)}
          </div>
          <div className="mt-3 text-primary-foreground/80 text-sm">
            Cashier — clears to owner
          </div>
        </div>
      </section>

      {/* Orders */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-black text-xl">Orders</h2>
          <span className="text-sm text-muted-foreground">{total} total</span>
        </div>

        <PaginationBar page={page} totalPages={totalPages} total={total} onPrev={handlePrev} onNext={handleNext} />

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-xl h-20 bg-muted/30 animate-pulse" />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="text-muted-foreground text-sm py-8 text-center">No orders yet.</div>
        ) : (
          <div className="space-y-2">
            {orders.map((o) => (
              <div
                key={o.id}
                className="rounded-xl p-4 border border-border"
                style={{ background: "var(--gradient-card)" }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <Receipt className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-xs text-muted-foreground truncate">
                      {new Date(o.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div className="font-black text-primary text-lg shrink-0 ml-2">
                    ${Number(o.total).toFixed(2)}
                  </div>
                </div>
                <div className="mt-1.5 text-sm text-muted-foreground line-clamp-2">
                  {(o.items || []).map((i) => `${i.qty}× ${i.name}`).join(" · ")}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Paid ${Number(o.paid).toFixed(2)} · Change ${Number(o.change_given).toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        )}

        <PaginationBar page={page} totalPages={totalPages} total={total} onPrev={handlePrev} onNext={handleNext} />
      </section>
    </div>
  );
}

// ─── Owner wallet: all records flat in chronological order ───────────────────
type FlatRecord =
  | { kind: "order"; data: Order; ts: number }
  | { kind: "tx"; data: WalletTx; ts: number };

function OwnerWallet({ profile }: { profile: { id: string; wallet_balance: number; role: string } }) {
  const { refreshProfile } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [txs, setTxs] = useState<WalletTx[]>([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [balance, setBalance] = useState(Number(profile.wallet_balance));

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const fetchData = () => {
    setLoading(true);
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("cashier_id", profile.id)
      .then(({ count }) => setTotal(count ?? 0));

    supabase
      .from("orders")
      .select("*")
      .eq("cashier_id", profile.id)
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
      .then(({ data }) => {
        setOrders((data ?? []) as unknown as Order[]);
        setLoading(false);
      });

    // transfer_in (cleared from cashier) + wallet_reset records
    supabase
      .from("wallet_transactions")
      .select("*")
      .eq("profile_id", profile.id)
      .in("type", ["transfer_in", "wallet_reset"])
      .order("created_at", { ascending: false })
      .then(({ data }) => setTxs((data ?? []) as WalletTx[]));
  };

  useEffect(() => {
    fetchData();
  }, [profile.id, page]);

  // Keep local balance in sync with profile
  useEffect(() => { setBalance(Number(profile.wallet_balance)); }, [profile.wallet_balance]);

  const handleReset = async () => {
    if (balance === 0) { toast.error("Balance is already $0.00"); return; }
    setResetting(true);
    const prevBalance = balance;

    // Use the DB function so it runs as SECURITY DEFINER (bypasses RLS)
    const { error } = await supabase.rpc("owner_reset_wallet", {
      _owner_id: profile.id,
      _prev_balance: prevBalance,
    });
    if (error) { toast.error(error.message); setResetting(false); return; }

    setBalance(0);
    setResetting(false);
    toast.success("Wallet reset to $0.00");
    refreshProfile();
    fetchData();
  };

  const handlePrev = () => { setPage((p) => p - 1); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const handleNext = () => { setPage((p) => p + 1); window.scrollTo({ top: 0, behavior: "smooth" }); };

  // Merge orders + txs into a single flat list sorted newest first
  const flatRecords: FlatRecord[] = [
    ...orders.map((o): FlatRecord => ({ kind: "order", data: o, ts: new Date(o.created_at).getTime() })),
    ...txs.map((tx): FlatRecord => ({ kind: "tx", data: tx, ts: new Date(tx.created_at).getTime() })),
  ].sort((a, b) => b.ts - a.ts);

  return (
    <div className="space-y-5">
      <section className="rounded-3xl p-6 relative overflow-hidden" style={{ background: "var(--gradient-hero)", boxShadow: "var(--shadow-glow)" }}>
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-primary-foreground/80 text-sm font-medium">
              <WalletIcon className="h-4 w-4" /> Wallet Balance
            </div>
            {/* Reset button */}
            <button
              onClick={handleReset}
              disabled={resetting || balance === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 active:scale-95 transition text-primary-foreground text-xs font-black disabled:opacity-40"
              title="Reset wallet balance to $0.00"
            >
              {resetting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
              Reset
            </button>
          </div>
          <div className="text-4xl sm:text-6xl font-black text-primary-foreground mt-2 tracking-tight">
            ${balance.toFixed(2)}
          </div>
          <div className="mt-3 text-primary-foreground/80 text-sm">Owner account</div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-black text-xl">Records</h2>
          <span className="text-sm text-muted-foreground">{total} orders</span>
        </div>
        <PaginationBar page={page} totalPages={totalPages} total={total} onPrev={handlePrev} onNext={handleNext} />

        {loading ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="rounded-xl h-16 bg-muted/30 animate-pulse" />)}</div>
        ) : flatRecords.length === 0 ? (
          <div className="text-muted-foreground text-sm py-8 text-center">No records yet.</div>
        ) : (
          <div className="space-y-2">
            {flatRecords.map((rec) => {
              if (rec.kind === "tx") {
                const tx = rec.data;
                const isReset = tx.type === "wallet_reset";
                return (
                  <div
                    key={tx.id}
                    className={`rounded-xl p-4 border flex items-center gap-3 ${
                      isReset ? "border-orange-500/30" : "border-green-500/30"
                    }`}
                    style={{
                      background: isReset
                        ? "oklch(0.22 0.06 50 / 0.3)"
                        : "oklch(0.22 0.06 145 / 0.3)",
                    }}
                  >
                    <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 border ${
                      isReset
                        ? "bg-orange-500/20 border-orange-500/30"
                        : "bg-green-500/20 border-green-500/30"
                    }`}>
                      {isReset
                        ? <RotateCcw className="h-4 w-4 text-orange-400" />
                        : <ArrowDownLeft className="h-4 w-4 text-green-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-muted-foreground">{new Date(tx.created_at).toLocaleString()}</div>
                      <div className={`text-sm font-semibold ${isReset ? "text-orange-300" : "text-green-300"}`}>
                        {tx.note ?? (isReset ? "Wallet reset" : "Cleared from cashier")}
                      </div>
                    </div>
                    <div className={`font-black text-lg shrink-0 ${isReset ? "text-orange-400" : "text-green-400"}`}>
                      {isReset
                        ? `-$${Math.abs(Number(tx.amount)).toFixed(2)}`
                        : `+$${Number(tx.amount).toFixed(2)}`}
                    </div>
                  </div>
                );
              }

              const o = rec.data;
              return (
                <div key={o.id} className="rounded-xl p-4 border border-border" style={{ background: "var(--gradient-card)" }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <Receipt className="h-4 w-4 text-primary shrink-0" />
                      <span className="text-xs text-muted-foreground truncate">{new Date(o.created_at).toLocaleString()}</span>
                    </div>
                    <div className="font-black text-primary text-lg shrink-0 ml-2">${Number(o.total).toFixed(2)}</div>
                  </div>
                  <div className="mt-1.5 text-sm text-muted-foreground line-clamp-2">
                    {(o.items || []).map((i) => `${i.qty}× ${i.name}`).join(" · ")}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Paid ${Number(o.paid).toFixed(2)} · Change ${Number(o.change_given).toFixed(2)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <PaginationBar page={page} totalPages={totalPages} total={total} onPrev={handlePrev} onNext={handleNext} />
      </section>
    </div>
  );
}

function WalletPage() {
  const { profile } = useAuth();
  if (!profile) return null;
  if (profile.role === "owner") return <OwnerWallet profile={profile} />;
  return <CashierWallet profile={profile} />;
}
