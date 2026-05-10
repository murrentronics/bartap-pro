import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Wallet as WalletIcon, ArrowDownRight, ArrowUpRight, Receipt } from "lucide-react";

export const Route = createFileRoute("/_app/wallet")({
  component: WalletPage,
});

type Tx = { id: string; amount: number; type: string; note: string | null; created_at: string; order_id: string | null };
type Order = { id: string; total: number; paid: number; change_given: number; items: { name: string; qty: number; price: number }[]; created_at: string };

function WalletPage() {
  const { profile } = useAuth();
  const [txs, setTxs] = useState<Tx[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    if (!profile) return;
    supabase.from("wallet_transactions").select("*").eq("profile_id", profile.id)
      .order("created_at", { ascending: false }).limit(50)
      .then(({ data }) => setTxs((data ?? []) as Tx[]));
    const ownerId = profile.role === "owner" ? profile.id : profile.parent_id!;
    supabase.from("orders").select("*").eq(profile.role === "owner" ? "owner_id" : "cashier_id", profile.role === "owner" ? ownerId : profile.id)
      .order("created_at", { ascending: false }).limit(20)
      .then(({ data }) => setOrders((data ?? []) as Order[]));
  }, [profile?.id]);

  if (!profile) return null;

  return (
    <div className="space-y-6">
      <section className="rounded-3xl p-8 relative overflow-hidden" style={{ background: "var(--gradient-hero)", boxShadow: "var(--shadow-glow)" }}>
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="relative">
          <div className="flex items-center gap-2 text-primary-foreground/80 text-sm font-medium">
            <WalletIcon className="h-4 w-4" /> Wallet Balance
          </div>
          <div className="text-6xl font-black text-primary-foreground mt-2 tracking-tight">
            ${Number(profile.wallet_balance).toFixed(2)}
          </div>
          <div className="mt-4 text-primary-foreground/80 text-sm">
            {profile.role === "owner" ? "Owner account" : "Cashier — clears to owner"}
          </div>
        </div>
      </section>

      <section>
        <h2 className="font-black text-xl mb-3">Recent Orders</h2>
        <div className="space-y-2">
          {orders.length === 0 && <div className="text-muted-foreground text-sm">No orders yet.</div>}
          {orders.map((o) => (
            <div key={o.id} className="rounded-xl p-4 border border-border" style={{ background: "var(--gradient-card)" }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-primary" />
                  <span className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString()}</span>
                </div>
                <div className="font-black text-primary text-lg">${Number(o.total).toFixed(2)}</div>
              </div>
              <div className="mt-2 text-sm text-muted-foreground">
                {(o.items || []).map((i) => `${i.qty}× ${i.name}`).join(" · ")}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Paid ${Number(o.paid).toFixed(2)} · Change ${Number(o.change_given).toFixed(2)}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-black text-xl mb-3">Wallet Activity</h2>
        <div className="space-y-2">
          {txs.length === 0 && <div className="text-muted-foreground text-sm">No activity yet.</div>}
          {txs.map((t) => {
            const positive = Number(t.amount) >= 0;
            return (
              <div key={t.id} className="rounded-xl p-3 flex items-center gap-3 border border-border" style={{ background: "var(--gradient-card)" }}>
                <div className={`h-9 w-9 rounded-full flex items-center justify-center ${positive ? "bg-success/20 text-success" : "bg-destructive/20 text-destructive"}`}>
                  {positive ? <ArrowDownRight className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm">{t.note || t.type}</div>
                  <div className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleString()}</div>
                </div>
                <div className={`font-black ${positive ? "text-success" : "text-destructive"}`}>
                  {positive ? "+" : ""}${Number(t.amount).toFixed(2)}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
