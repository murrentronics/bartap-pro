import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Trash2, Minus, Plus, DollarSign, Loader2, X, CheckCircle2, Delete,
} from "lucide-react";
import { toast } from "sonner";

type Product = { id: string; name: string; price: number; image_url: string | null; category?: Category; stock_qty?: number };
type CartItem = Product & { qty: number };

type Category = "beers" | "liquor" | "drinks" | "snacks";

const CATEGORIES: { value: Category; label: string; emoji: string }[] = [
  { value: "beers",   label: "Beers",   emoji: "🍺" },
  { value: "liquor",  label: "Liquor",  emoji: "🥃" },
  { value: "drinks",  label: "Drinks",  emoji: "🥤" },
  { value: "snacks",  label: "Snacks",  emoji: "🍟" },
];

export default function RegisterPage() {
  const { profile, refreshProfile } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<Category>("beers");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [cashOpen, setCashOpen] = useState(false);
  const [saleResult, setSaleResult] = useState<{ paid: number; change: number } | null>(null);
  const [kbHeight, setKbHeight] = useState(120); // keyboard height in px, updated on mount

  const ownerId = profile?.role === "owner" ? profile.id : profile?.parent_id;

  // Stable fetch — always reads latest ownerId via ref
  const ownerIdRef = useRef(ownerId);
  useEffect(() => { ownerIdRef.current = ownerId; }, [ownerId]);

  const fetchProducts = useCallback(async () => {
    const id = ownerIdRef.current;
    if (!id) return;
    const { data } = await supabase
      .from("products")
      .select("*")
      .eq("owner_id", id)
      .order("name", { ascending: true });
    setProducts((data ?? []) as Product[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!ownerId) return;

    fetchProducts();

    // Realtime: re-fetch on any product change for this owner
    // Note: no filter on DELETE events — deleted rows can't match column filters
    const ch = supabase
      .channel(`products-register-${ownerId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "products", filter: `owner_id=eq.${ownerId}` },
        () => { fetchProducts(); }
      )
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "products", filter: `owner_id=eq.${ownerId}` },
        () => { fetchProducts(); }
      )
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "products" },
        (payload) => {
          // Only act if the deleted product belonged to this owner
          if (payload.old?.owner_id && payload.old.owner_id !== ownerId) return;
          setProducts((prev) => prev.filter((p) => p.id !== payload.old?.id));
          setCart((c) => c.filter((i) => i.id !== payload.old?.id));
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [ownerId, fetchProducts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const byCat = products.filter((p) => (p.category || "beers") === category);
    return q ? byCat.filter((p) => p.name.toLowerCase().includes(q)) : byCat;
  }, [products, search, category]);

  const total = useMemo(() => cart.reduce((s, i) => s + i.qty * Number(i.price), 0), [cart]);
  const cartCount = useMemo(() => cart.reduce((s, i) => s + i.qty, 0), [cart]);

  // Close cash overlay immediately if cart becomes empty (e.g. order/item deleted)
  useEffect(() => {
    if (cashOpen && cart.length === 0) setCashOpen(false);
  }, [cart, cashOpen]);

  const addToCart = (p: Product) => {
    setCart((c) => {
      const ex = c.find((i) => i.id === p.id);
      return ex ? c.map((i) => (i.id === p.id ? { ...i, qty: i.qty + 1 } : i)) : [...c, { ...p, qty: 1 }];
    });
  };

  const dec = (id: string) =>
    setCart((c) => c.flatMap((i) => (i.id === id ? (i.qty > 1 ? [{ ...i, qty: i.qty - 1 }] : []) : [i])));

  const removeItem = (id: string) => setCart((c) => c.filter((i) => i.id !== id));

  return (
    <>
      {/* Sticky category tabs only — no search bar */}
      <div className="sticky top-0 z-20 -mx-3 px-3 pt-2 pb-2 bg-background/95 backdrop-blur border-b border-border">
        {/* Category tabs — 4 across */}
        <div className="max-w-2xl mx-auto grid grid-cols-4 gap-1.5">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setCategory(cat.value)}
              className={`h-8 rounded-xl font-bold text-xs transition ${
                category === cat.value
                  ? "text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
              style={category === cat.value ? { background: "var(--gradient-hero)" } : {}}
            >
              {cat.emoji} {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Items grid — extra bottom padding for keyboard + cash button */}
      <div className="pt-4 pb-64">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            {products.length === 0 ? "No items yet. Add some on the Items page." : `No ${CATEGORIES.find(c=>c.value===category)?.label ?? category} found.`}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {filtered.map((p) => {
              const inCart = cart.find((i) => i.id === p.id);
              const outOfStock = (p.stock_qty ?? 1) === 0;
              return (
                <button
                  key={p.id}
                  onClick={() => !outOfStock && addToCart(p)}
                  disabled={outOfStock}
                  className={`group relative aspect-[3/4] rounded-2xl overflow-hidden border transition ${outOfStock ? "cursor-not-allowed" : "active:scale-95"}`}
                  style={{
                    background: "var(--gradient-card)",
                    boxShadow: "var(--shadow-elegant)",
                    borderColor: inCart ? "var(--primary)" : "var(--border)",
                  }}
                >
                  {p.image_url ? (
                    <img src={p.image_url} alt={p.name} className="absolute inset-0 w-full h-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-4xl">
                      {p.category === "snacks" ? "🍟" : "🍹"}
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 p-2 text-left bg-gradient-to-t from-black/85 via-black/50 to-transparent">
                    <div className="font-bold text-sm leading-tight line-clamp-2 text-white">{p.name}</div>
                    <div className="text-primary font-black text-base">${Number(p.price).toFixed(2)}</div>
                  </div>

                  {/* Stock qty badge (top-left) — always visible when stock_qty is defined */}
                  {p.stock_qty !== undefined && !outOfStock && (
                    <div className="absolute top-1.5 left-1.5 h-6 min-w-[1.5rem] px-1.5 rounded-full flex items-center justify-center bg-black/70 shadow">
                      <span className="text-[10px] font-black text-white leading-none">{p.stock_qty}</span>
                    </div>
                  )}

                  {/* Cart qty badge (top-right) */}
                  {inCart && (
                    <div className="absolute top-2 right-2 flex items-center gap-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); dec(p.id); }}
                        className="h-8 w-8 rounded-full flex items-center justify-center bg-red-500 hover:bg-red-600 active:scale-90 transition text-white shadow"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <div
                        className="h-8 w-8 rounded-full flex items-center justify-center text-sm font-black text-primary-foreground shadow"
                        style={{ background: "var(--gradient-hero)" }}
                      >
                        {inCart.qty}
                      </div>
                    </div>
                  )}

                  {/* Out-of-stock overlay */}
                  {outOfStock && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-950/75 backdrop-blur-[1px]">
                      <div className="bg-red-600 rounded-xl px-2 py-1 shadow-lg">
                        <span className="text-white text-[10px] font-black uppercase tracking-wider leading-none">Out of Stock</span>
                      </div>
                    </div>
                  )}

                  {/* Low stock badge (top-right corner) — only when in cart badge is not showing */}
                  {!outOfStock && !inCart && (p.stock_qty ?? 1) >= 1 && (p.stock_qty ?? 1) <= 5 && (
                    <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-full bg-red-600 shadow">
                      <span className="text-[9px] font-black uppercase tracking-wide text-white leading-none">Low</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Sticky CASH button — animates up when search text is present */}
      {cartCount > 0 && (
        <div
          className="fixed inset-x-0 z-[26] px-4 pb-2 pointer-events-none transition-all duration-300 ease-in-out"
          style={{ bottom: search ? kbHeight + 52 : kbHeight + 8 }}
        >
          <div className="max-w-2xl mx-auto pointer-events-auto">
            <button
              onClick={() => setCashOpen(true)}
              className="w-full h-14 rounded-2xl flex items-center justify-between px-5 font-black text-lg text-primary-foreground shadow-2xl active:scale-[0.98] transition"
              style={{ background: "var(--gradient-hero)" }}
            >
              <span className="flex items-center justify-center h-8 w-8 rounded-full bg-white/20 text-sm font-black">{cartCount}</span>
              <span className="flex items-center gap-2"><DollarSign className="h-5 w-5" /> CASH</span>
              <span className="text-primary-foreground/80 text-base font-bold">${total.toFixed(2)}</span>
            </button>
          </div>
        </div>
      )}

      {cashOpen && (
        <CashOverlay
          total={total}
          cart={cart}
          onDec={dec}
          onAdd={addToCart}
          onRemove={removeItem}
          onClearCart={() => setCart([])}
          onClose={() => setCashOpen(false)}
          onSuccess={(paidAmt, changeAmt) => {
            setCart([]);
            setCashOpen(false);
            setSaleResult({ paid: paidAmt, change: changeAmt });
            refreshProfile();
          }}
        />
      )}

      {saleResult && (
        <SaleSuccessBanner
          paid={saleResult.paid}
          change={saleResult.change}
          onOk={() => setSaleResult(null)}
        />
      )}

      {/* Search text display — sits right on top of keyboard */}
      {search && (
        <div
          className="fixed inset-x-0 z-30 px-3 pointer-events-none"
          style={{ bottom: kbHeight }}
        >
          <div className="max-w-2xl mx-auto flex items-center justify-between bg-black/95 rounded-t-xl px-4 py-2.5 border-x border-t border-white/10 shadow-2xl">
            <span className="text-white font-bold text-lg tracking-widest">{search}</span>
            <button
              className="pointer-events-auto text-white/50 hover:text-white transition ml-3 shrink-0"
              onPointerDown={(e) => { e.preventDefault(); setSearch(""); }}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      {/* Permanent on-screen keyboard — above footer nav */}
      <OnScreenKeyboard searchText={search} onKey={(k) => {
        if (k === "⌫") { setSearch((s) => s.slice(0, -1)); return; }
        if (k === "SPACE") { setSearch((s) => s + " "); return; }
        setSearch((s) => s + k.toLowerCase());
      }} onHeightChange={setKbHeight} />
    </>
  );
}

// ─── On-Screen Keyboard ───────────────────────────────────────────────────────
const ROWS = [
  ["Q","W","E","R","T","Y","U","I","O","P"],
  ["A","S","D","F","G","H","J","K","L"],
  ["Z","X","C","V","B","N","M","⌫"],
];

function OnScreenKeyboard({ onKey, onHeightChange, searchText }: { 
  onKey: (k: string) => void; 
  onHeightChange?: (h: number) => void;
  searchText: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current && onHeightChange) {
      onHeightChange(ref.current.offsetHeight);
    }
  });

  return (
    <div
      ref={ref}
      className="fixed bottom-0 inset-x-0 z-[25] bg-background/95 backdrop-blur border-t border-border px-1 pt-1.5 space-y-1"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 6px)", boxShadow: "0 -4px 20px rgba(0,0,0,0.4)" }}
    >
      {ROWS.map((row, ri) => (
        <div key={ri} className="flex justify-center gap-1">
          {row.map((k) => (
            <button
              key={k}
              onPointerDown={(e) => { e.preventDefault(); onKey(k); }}
              className={`flex-1 max-w-[2.6rem] h-9 rounded-lg font-bold text-sm transition active:scale-90 select-none ${
                k === "⌫"
                  ? "bg-destructive/30 text-destructive max-w-[3.5rem]"
                  : "bg-muted hover:bg-muted/70 text-foreground"
              }`}
            >
              {k === "⌫" ? <Delete className="h-4 w-4 mx-auto" /> : k}
            </button>
          ))}
        </div>
      ))}
      {/* Space bar row */}
      <div className="flex justify-center gap-1 px-2">
        <button
          onPointerDown={(e) => { e.preventDefault(); onKey("SPACE"); }}
          className="flex-1 h-9 rounded-lg bg-muted hover:bg-muted/70 text-xs font-bold text-muted-foreground transition active:scale-95 select-none"
        >
          SPACE
        </button>
      </div>
    </div>
  );
}

function CashOverlay({
  total, cart, onDec, onAdd, onRemove, onClearCart, onClose, onSuccess,
}: {
  total: number; cart: CartItem[];
  onDec: (id: string) => void; onAdd: (p: CartItem) => void;
  onRemove: (id: string) => void; onClearCart: () => void;
  onClose: () => void; onSuccess: (paid: number, change: number) => void;
}) {
  const { profile } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
  const [paid, setPaid] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (step === 2) setPaid("");
  }, [step]);

  const change = Math.max(0, (Number(paid) || 0) - total);
  const enough = (Number(paid) || 0) >= total;

  const submit = async () => {
    if (!enough || !profile) return;
    setBusy(true);
    const ownerId = profile.role === "owner" ? profile.id : profile.parent_id!;

    // 1. Insert the order
    const { error } = await supabase.from("orders").insert({
      owner_id: ownerId, cashier_id: profile.id,
      items: cart.map((c) => ({ id: c.id, name: c.name, price: c.price, qty: c.qty })),
      total, paid: Number(paid), change_given: change,
    });
    if (error) { setBusy(false); toast.error(error.message); return; }

    // 2. Decrement stock via RPC (SECURITY DEFINER — works for both owners and cashiers)
    const { error: stockErr } = await supabase.rpc("decrement_stock_item", {
      p_items: cart.map((c) => ({ id: c.id, qty: c.qty })),
    });
    if (stockErr) {
      // Non-fatal: order is already saved, just log it
      console.warn("Stock decrement failed:", stockErr.message);
    }

    setBusy(false);
    onSuccess(Number(paid), change);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-md max-h-[90dvh] flex flex-col rounded-3xl overflow-hidden border border-border shadow-2xl" style={{ background: "var(--gradient-card)" }}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
          <h2 className="text-xl font-black">Cash Order</h2>
          <button onClick={onClose} className="h-9 w-9 rounded-full flex items-center justify-center bg-muted hover:bg-muted/80 transition" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        {step === 1 && (
          <>
            <div className="flex-1 overflow-y-auto px-5 space-y-4 pb-4">
              <div className="rounded-2xl p-5 text-center" style={{ background: "var(--gradient-hero)" }}>
                <div className="text-sm font-medium text-primary-foreground/80">Total Due</div>
                <div className="text-5xl font-black text-primary-foreground">${total.toFixed(2)}</div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Order</span>
                  <button onClick={onClearCart} className="text-xs text-destructive hover:underline flex items-center gap-1">
                    <Trash2 className="h-3 w-3" /> Clear
                  </button>
                </div>
                {cart.map((i) => (
                  <div key={i.id} className="flex items-center gap-2 p-2 rounded-xl bg-background/50">
                    <div className="h-10 w-10 shrink-0 rounded-lg overflow-hidden bg-muted flex items-center justify-center">
                      {i.image_url ? (
                        <img src={i.image_url} alt={i.name} className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-lg">{i.category === "snacks" ? "🍟" : "🍹"}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate text-sm whitespace-nowrap">{i.name}</div>
                      <div className="text-xs text-muted-foreground">${Number(i.price).toFixed(2)} × {i.qty}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onDec(i.id)}><Minus className="h-3 w-3" /></Button>
                      <span className="w-6 text-center text-sm font-bold">{i.qty}</span>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onAdd(i)}><Plus className="h-3 w-3" /></Button>
                    </div>
                    <div className="font-black text-primary w-16 text-right">${(i.qty * Number(i.price)).toFixed(2)}</div>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => onRemove(i.id)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
            <div className="shrink-0 px-5 pb-5 pt-3 border-t border-border flex gap-3">
              <Button variant="outline" className="flex-1 h-12" onClick={onClose}>Cancel</Button>
              <Button className="flex-1 h-12 font-black text-base" onClick={() => setStep(2)} style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}>Proceed</Button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-3">
              {/* Amount received — smaller input display */}
              <div className="rounded-xl border border-green-500/30 px-4 py-3 text-center" style={{ background: "oklch(0.22 0.06 145 / 0.4)" }}>
                <div className="text-xs font-semibold text-green-300/70 uppercase tracking-widest mb-1">Amount Received</div>
                <div className="text-3xl font-black text-green-100">
                  ${paid || "0.00"}
                </div>
              </div>

              {/* Change output — bigger */}
              <div className={`rounded-xl px-4 py-4 text-center border transition-all ${
                Number(paid) === 0
                  ? "opacity-40 bg-green-500/10 border-green-500/20"
                  : enough
                  ? "bg-green-500/25 border-green-500/40"
                  : "bg-red-500/25 border-red-500/40"
              }`}>
                <div className={`text-xs font-semibold uppercase tracking-widest mb-1 ${enough ? "text-green-300/70" : "text-red-300/70"}`}>
                  {enough ? "Change to Give" : "Short by"}
                </div>
                <div className={`text-5xl font-black ${enough ? "text-green-300" : "text-red-400"}`}>
                  ${Number(paid) === 0 ? "0.00" : (enough ? change : total - Number(paid)).toFixed(2)}
                </div>
              </div>

              {/* Numpad */}
              <div className="grid grid-cols-3 gap-2">
                {["1","2","3","4","5","6","7","8","9",".","0","⌫"].map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      if (k === "⌫") {
                        setPaid((v) => v.slice(0, -1));
                      } else if (k === ".") {
                        if (!paid.includes(".")) setPaid((v) => v + ".");
                      } else {
                        // max 2 decimal places
                        const dotIdx = paid.indexOf(".");
                        if (dotIdx !== -1 && paid.length - dotIdx > 2) return;
                        setPaid((v) => (v === "0" ? k : v + k));
                      }
                    }}
                    className={`h-14 rounded-2xl font-black text-xl transition active:scale-95 ${
                      k === "⌫"
                        ? "bg-destructive/20 text-destructive hover:bg-destructive/30"
                        : "bg-muted hover:bg-muted/70 text-foreground"
                    }`}
                  >
                    {k}
                  </button>
                ))}
              </div>
            </div>

            <div className="shrink-0 px-5 pb-5 pt-3 border-t border-border flex gap-3">
              <Button variant="outline" className="flex-1 h-12" onClick={() => { setStep(1); setPaid(""); }}>Back</Button>
              <Button
                className="flex-1 h-12 font-black text-base"
                disabled={!enough || busy}
                onClick={submit}
                style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm Sale"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SaleSuccessBanner({ paid, change, onOk }: { paid: number; change: number; onOk: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-3xl overflow-hidden border-2 border-green-500/50 shadow-2xl text-center" style={{ background: "oklch(0.18 0.07 145)" }}>
        <div className="pt-10 pb-6 flex justify-center">
          <div className="h-24 w-24 rounded-full bg-green-500/20 border-2 border-green-500/40 flex items-center justify-center">
            <CheckCircle2 className="h-14 w-14 text-green-400" strokeWidth={1.5} />
          </div>
        </div>
        <div className="px-8 pb-2">
          <div className="text-xs font-semibold uppercase tracking-widest text-orange-400/80 mb-1">Customer Paid</div>
          <div className="text-3xl font-black text-orange-300">${paid.toFixed(2)}</div>
        </div>
        <div className="mx-8 my-5 border-t border-green-500/20" />
        <div className="px-8 pb-8">
          <div className="rounded-2xl bg-green-500/20 border border-green-500/30 px-6 py-5">
            <div className="text-xs font-semibold uppercase tracking-widest text-green-300/60 mb-2">Change to Give</div>
            <div className="text-6xl font-black text-green-300">${change.toFixed(2)}</div>
          </div>
        </div>
        <div className="px-8 pb-10">
          <button onClick={onOk} className="w-full h-14 rounded-2xl font-black text-xl text-white bg-green-600 hover:bg-green-500 active:scale-95 transition shadow-lg">OK</button>
        </div>
      </div>
    </div>
  );
}
