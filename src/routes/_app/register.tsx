import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Trash2, Minus, Plus, DollarSign, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_app/register")({
  component: RegisterPage,
});

type Product = { id: string; name: string; price: number; image_url: string | null };
type CartItem = Product & { qty: number };

function RegisterPage() {
  const { profile, refreshProfile } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [cashOpen, setCashOpen] = useState(false);

  const ownerId = profile?.role === "owner" ? profile.id : profile?.parent_id;

  useEffect(() => {
    if (!ownerId) return;
    supabase.from("products").select("*").eq("owner_id", ownerId).order("created_at", { ascending: false })
      .then(({ data }) => {
        setProducts((data ?? []) as Product[]);
        setLoading(false);
      });
  }, [ownerId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? products.filter((p) => p.name.toLowerCase().includes(q)) : products;
  }, [products, search]);

  const total = useMemo(() => cart.reduce((s, i) => s + i.qty * Number(i.price), 0), [cart]);

  const addToCart = (p: Product) => {
    setCart((c) => {
      const ex = c.find((i) => i.id === p.id);
      return ex
        ? c.map((i) => (i.id === p.id ? { ...i, qty: i.qty + 1 } : i))
        : [...c, { ...p, qty: 1 }];
    });
  };
  const dec = (id: string) =>
    setCart((c) => c.flatMap((i) => (i.id === id ? (i.qty > 1 ? [{ ...i, qty: i.qty - 1 }] : []) : [i])));
  const removeItem = (id: string) => setCart((c) => c.filter((i) => i.id !== id));

  return (
    <div className="grid lg:grid-cols-[1fr,380px] gap-6">
      <section>
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search items..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-12 text-base"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            {products.length === 0 ? "No items yet. Add some on the Items page." : "No matches."}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => addToCart(p)}
                className="group relative aspect-square rounded-2xl overflow-hidden border border-border hover:border-primary transition active:scale-95"
                style={{ background: "var(--gradient-card)", boxShadow: "var(--shadow-elegant)" }}
              >
                {p.image_url ? (
                  <img src={p.image_url} alt={p.name} className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-4xl">🍹</div>
                )}
                <div className="absolute inset-x-0 bottom-0 p-2 text-left bg-gradient-to-t from-black/85 via-black/50 to-transparent">
                  <div className="font-bold text-sm leading-tight line-clamp-2 text-white">{p.name}</div>
                  <div className="text-primary font-black text-base">${Number(p.price).toFixed(2)}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      <aside className="lg:sticky lg:top-20 lg:self-start rounded-2xl p-5 border border-border"
        style={{ background: "var(--gradient-card)", boxShadow: "var(--shadow-elegant)" }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-black">Order</h2>
          {cart.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setCart([])}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
        <div className="max-h-[40vh] overflow-y-auto space-y-2 mb-4">
          {cart.length === 0 && <div className="text-center text-muted-foreground py-8 text-sm">Tap items to add</div>}
          {cart.map((i) => (
            <div key={i.id} className="flex items-center gap-2 p-2 rounded-lg bg-background/50">
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate text-sm">{i.name}</div>
                <div className="text-xs text-muted-foreground">${Number(i.price).toFixed(2)} × {i.qty}</div>
              </div>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => dec(i.id)}><Minus className="h-3 w-3" /></Button>
                <span className="w-6 text-center text-sm font-bold">{i.qty}</span>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => addToCart(i)}><Plus className="h-3 w-3" /></Button>
              </div>
              <div className="font-black text-primary w-16 text-right">${(i.qty * Number(i.price)).toFixed(2)}</div>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => removeItem(i.id)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
        <div className="border-t border-border pt-4 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Total</span>
            <span className="text-3xl font-black text-primary">${total.toFixed(2)}</span>
          </div>
          <Button
            className="w-full h-14 text-lg font-black"
            disabled={cart.length === 0}
            onClick={() => setCashOpen(true)}
            style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}
          >
            <DollarSign className="h-5 w-5 mr-1" /> CASH
          </Button>
        </div>
      </aside>

      <CashDialog
        open={cashOpen}
        onOpenChange={setCashOpen}
        total={total}
        cart={cart}
        onComplete={async () => {
          setCart([]);
          setCashOpen(false);
          await refreshProfile();
        }}
      />
    </div>
  );
}

function CashDialog({
  open, onOpenChange, total, cart, onComplete,
}: {
  open: boolean; onOpenChange: (o: boolean) => void;
  total: number; cart: CartItem[]; onComplete: () => Promise<void>;
}) {
  const { profile } = useAuth();
  const [paid, setPaid] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setPaid(""); }, [open]);

  const change = Math.max(0, (Number(paid) || 0) - total);
  const enough = (Number(paid) || 0) >= total;

  const submit = async () => {
    if (!enough || !profile) return;
    setBusy(true);
    const ownerId = profile.role === "owner" ? profile.id : profile.parent_id!;
    const { error } = await supabase.from("orders").insert({
      owner_id: ownerId,
      cashier_id: profile.id,
      items: cart.map((c) => ({ id: c.id, name: c.name, price: c.price, qty: c.qty })),
      total, paid: Number(paid), change_given: change,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Paid $${Number(paid).toFixed(2)} · Change $${change.toFixed(2)}`);
    await onComplete();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="text-2xl">Cash Order</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="rounded-2xl p-5 text-center" style={{ background: "var(--gradient-hero)" }}>
            <div className="text-sm font-medium text-primary-foreground/80">Total Due</div>
            <div className="text-5xl font-black text-primary-foreground">${total.toFixed(2)}</div>
          </div>
          <div>
            <Label>Amount paid by customer</Label>
            <Input
              autoFocus type="number" inputMode="decimal" step="0.01" min={0}
              value={paid} onChange={(e) => setPaid(e.target.value)}
              className="h-14 text-2xl font-bold text-center"
            />
          </div>
          {Number(paid) > 0 && (
            <div className={`rounded-xl p-4 text-center ${enough ? "bg-success/20" : "bg-destructive/20"}`}>
              <div className="text-sm text-muted-foreground">{enough ? "Change to give" : "Short by"}</div>
              <div className={`text-3xl font-black ${enough ? "text-success" : "text-destructive"}`}>
                ${(enough ? change : total - Number(paid)).toFixed(2)}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!enough || busy} className="font-black">
            {busy ? "Saving..." : "Confirm Sale"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
