import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Wallet as WalletIcon, Receipt, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

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
        Page {page + 1} of {totalPages} · {total} orders
      </span>
      <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={onNext}>
        Next <ChevronRight className="h-4 w-4 ml-1" />
      </Button>
    </div>
  );
}

function WalletPage() {
  const { profile } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    if (!profile) return;
    setLoading(true);

    const col = profile.role === "owner" ? "owner_id" : "cashier_id";

    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq(col, profile.id)
      .then(({ count }) => setTotal(count ?? 0));

    supabase
      .from("orders")
      .select("*")
      .eq(col, profile.id)
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
      .then(({ data }) => {
        setOrders((data ?? []) as unknown as Order[]);
        setLoading(false);
      });
  }, [profile?.id, page]);

  if (!profile) return null;

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
            {profile.role === "owner" ? "Owner account" : "Cashier — clears to owner"}
          </div>
        </div>
      </section>

      {/* Orders */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-black text-xl">Orders</h2>
          <span className="text-sm text-muted-foreground">{total} total</span>
        </div>

        {/* Top pagination */}
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

        {/* Bottom pagination */}
        <PaginationBar page={page} totalPages={totalPages} total={total} onPrev={handlePrev} onNext={handleNext} />
      </section>
    </div>
  );
}
