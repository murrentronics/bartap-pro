import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Camera, ImagePlus, Plus, Trash2, Loader2, LayoutGrid, ArrowLeft, X, Search, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { CATEGORIES, categoryIcon } from "@/lib/categories";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type Product = {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
  category?: string;
  stock_qty: number;
  stock_qty_undo: number | null;      // qty BEFORE the last add (revert target)
  stock_qty_undo_saved: number | null; // qty AFTER the last add (baseline to detect sales)
};

// ─── Stock Qty Numberpad Modal ────────────────────────────────────────────────
// ── Stock button definitions ─────────────────────────────────────────────────
const STOCK_BTNS = [
  { qty: 30 }, { qty: 24 }, { qty: 12 },
  { qty: 10 }, { qty: 6  }, { qty: 1  },
];

function StockNumpad({ productId, currentQty, stockQtyUndo, stockQtyUndoSaved, onClose, onSaved }: {
  productId: string;
  currentQty: number;
  stockQtyUndo: number | null;
  stockQtyUndoSaved: number | null;
  onClose: () => void;
  onSaved: (patch: Partial<Pick<Product, "stock_qty" | "stock_qty_undo" | "stock_qty_undo_saved">>) => void;
}) {
  const [counts, setCounts] = useState([0, 0, 0, 0, 0, 0]);
  const [busy, setBusy] = useState(false);
  const confirmDialog = useConfirm();

  const addAmount = STOCK_BTNS.reduce((s, b, i) => s + b.qty * counts[i], 0);
  const newTotal  = currentQty + addAmount;

  const tap   = (i: number) => setCounts(c => c.map((v, j) => j === i ? v + 1 : v));
  const untap = (i: number) => setCounts(c => c.map((v, j) => j === i ? Math.max(0, v - 1) : v));
  const reset = () => setCounts([0, 0, 0, 0, 0, 0]);

  // Undo disabled the moment any single sale reduces qty — currentQty must equal stock_qty_undo_saved exactly
  const canUndo = stockQtyUndo !== null && stockQtyUndoSaved !== null && currentQty === stockQtyUndoSaved;

  const save = async () => {
    if (addAmount === 0) return;
    setBusy(true);
    // stock_qty_undo = what qty was before this add (for reverting)
    // stock_qty_undo_saved = what qty became after this add (to detect any sales)
    const { error } = await supabase
      .from("products")
      .update({ stock_qty: newTotal, stock_qty_undo: currentQty, stock_qty_undo_saved: newTotal })
      .eq("id", productId);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    onSaved({ stock_qty: newTotal, stock_qty_undo: currentQty, stock_qty_undo_saved: newTotal });
    reset();
    onClose();
  };

  const doUndo = async () => {
    if (stockQtyUndo === null) return;
    const ok = await confirmDialog({
      title: "Undo Last Stock Edit?",
      description: `This will revert the quantity back to ${stockQtyUndo} (currently ${currentQty}).`,
      confirmLabel: "Yes, Undo",
      cancelLabel: "Cancel",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    const { error } = await supabase
      .from("products")
      .update({ stock_qty: stockQtyUndo, stock_qty_undo: null, stock_qty_undo_saved: null })
      .eq("id", productId);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    onSaved({ stock_qty: stockQtyUndo, stock_qty_undo: null, stock_qty_undo_saved: null });
    toast.success("Last stock edit undone");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-t-3xl border border-border shadow-2xl"
        style={{ background: "var(--gradient-card)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <span className="text-base font-black">Add Stock</span>
          <button onClick={onClose} className="h-8 w-8 rounded-full flex items-center justify-center bg-muted hover:bg-muted/80 transition">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Stats row */}
        <div className="mx-5 mb-4 grid grid-cols-3 gap-2">
          <div className="px-3 py-2 rounded-xl bg-muted/30 text-center">
            <div className="text-xs text-muted-foreground">Current</div>
            <div className="text-xl font-black">{currentQty}</div>
          </div>
          <div className="px-3 py-2 rounded-xl bg-muted/30 text-center border border-primary/30">
            <div className="text-xs text-muted-foreground">Adding</div>
            <div className="text-xl font-black text-primary">+{addAmount}</div>
          </div>
          <div className="px-3 py-2 rounded-xl bg-muted/30 text-center">
            <div className="text-xs text-muted-foreground">Total</div>
            <div className="text-xl font-black text-green-400">{newTotal}</div>
          </div>
        </div>

        {/* 6 buttons — 3 per row */}
        <div className="px-5 pb-5 space-y-3">
          <div>
            <p className="text-sm font-black text-center mb-3" style={{ color: "var(--primary)" }}>
              Select qty by Case / Pack / Single
            </p>
            <div className="grid grid-cols-3 gap-3">
              {STOCK_BTNS.map((b, i) => {
                const count  = counts[i];
                const active = count > 0;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => tap(i)}
                    className="relative flex items-center justify-center rounded-2xl border-2 overflow-hidden transition active:scale-95"
                    style={{
                      height: "110px",
                      background: active ? "oklch(0.22 0.06 50 / 0.6)" : "rgba(255,255,255,0.05)",
                      borderColor: active ? "var(--primary)" : "rgba(255,255,255,0.1)",
                      boxShadow: active ? "0 4px 18px rgba(251,146,60,0.3)" : "none",
                      paddingBottom: active ? "36px" : "0",
                    }}
                  >
                    {active && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setCounts(c => c.map((v,j) => j===i ? 0 : v)); }}
                        className="absolute top-1.5 right-1.5 h-7 w-7 rounded-full flex items-center justify-center text-black shadow z-10 active:scale-90 transition"
                        style={{ background: "#dc2626" }}
                      >
                        <span className="text-xs font-black">×</span>
                      </button>
                    )}
                    <span className="text-3xl font-black text-white leading-none">{b.qty}</span>
                    {active && (
                      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-3 py-1.5"
                        style={{ background: "rgba(0,0,0,0.80)" }}>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); untap(i); }}
                          className="h-7 w-7 rounded-full flex items-center justify-center active:scale-90 transition"
                          style={{ background: "#ef4444" }}
                        >
                          <span className="text-xs font-black text-black leading-none">−</span>
                        </button>
                        <div
                          className="h-7 w-7 rounded-full flex items-center justify-center text-sm font-black text-black"
                          style={{ background: "var(--gradient-hero)" }}
                        >
                          {count}
                        </div>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Row 1: Undo Last Edit + Clear */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={doUndo}
              disabled={busy || !canUndo}
              className="flex-[2] rounded-2xl font-black text-sm py-4 active:scale-95 transition disabled:opacity-40 flex items-center justify-center gap-1.5"
              style={{
                background: canUndo ? "rgba(220,38,38,0.15)" : "rgba(255,255,255,0.05)",
                border: `2px solid ${canUndo ? "#dc2626" : "rgba(255,255,255,0.08)"}`,
                color: canUndo ? "#f87171" : "var(--muted-foreground)",
              }}
            >
              <span className="text-base leading-none">↩</span> Undo Last Edit
            </button>
            <button
              onClick={reset}
              disabled={addAmount === 0}
              className="flex-1 rounded-2xl font-black text-sm py-4 bg-muted/60 text-muted-foreground active:scale-95 transition disabled:opacity-40"
            >Clear</button>
          </div>

          {/* Row 2: Add full width */}
          <div>
            <button
              onClick={save}
              disabled={busy || addAmount === 0}
              className="w-full rounded-2xl font-black text-base text-primary-foreground transition active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 py-4"
              style={{ background: "var(--gradient-hero)" }}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : `Add ${addAmount} → ${newTotal}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Template Keyboard ───────────────────────────────────────────────────────
const TMPL_NUM_ROW = ["1","2","3","4","5","6","7","8","9","0","."];
const TMPL_ROWS = [
  ["Q","W","E","R","T","Y","U","I","O","P"],
  ["A","S","D","F","G","H","J","K","L"],
  ["Z","X","C","V","B","N","M","⌫"],
];

function TemplateKeyboard({ onKey, onClose }: { onKey: (k: string) => void; onClose: () => void }) {
  return (
    <div
      className="fixed bottom-0 inset-x-0 z-[80] bg-background/98 backdrop-blur border-t border-border px-1 pt-1.5 space-y-1"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 6px)", boxShadow: "0 -4px 20px rgba(0,0,0,0.4)" }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Dismiss tab — sits above the keyboard top border.
          Uses a full-width invisible hit area so nothing behind it gets tapped. */}
      <div
        className="absolute inset-x-0 flex justify-center"
        style={{ top: "-28px", height: "28px", pointerEvents: "auto" }}
        onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onClick={(e) => { e.stopPropagation(); onClose(); }}
      >
        <div className="h-7 w-16 rounded-t-2xl flex items-center justify-center bg-background border border-b-0 border-border hover:bg-muted/70 transition active:scale-95">
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>
      {/* Number row */}
      <div className="flex justify-center gap-1">
        {TMPL_NUM_ROW.map((k) => (
          <button
            key={k}
            onPointerDown={(e) => { e.preventDefault(); onKey(k); }}
            className="flex-1 h-9 rounded-lg font-bold text-sm bg-muted hover:bg-muted/70 text-foreground transition active:scale-90 select-none"
          >
            {k}
          </button>
        ))}
      </div>
      {/* Letter rows */}
      {TMPL_ROWS.map((row, ri) => (
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
              {k === "⌫" ? "⌫" : k}
            </button>
          ))}
        </div>
      ))}
      {/* Space bar */}
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
function TemplatePicker({ onSelect, ownerId, category, search }: {
  onSelect: (url: string, label: string, category: string) => void;
  ownerId: string;
  category: string;
  search: string;
}) {
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState<{ url: string; label: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);

      const { data: usedData } = await supabase
        .from("products")
        .select("image_url")
        .eq("owner_id", ownerId);
      const usedUrls = new Set(
        (usedData ?? [])
          .map((r: { image_url: string | null }) => r.image_url)
          .filter((u): u is string => !!u)
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: dbTemplates } = await (supabase as any)
        .from("template_images")
        .select("url, label")
        .eq("category", category)
        .order("label", { ascending: true });

      const templates = ((dbTemplates as { url: string; label: string }[]) ?? [])
        .filter((t) => !usedUrls.has(t.url));

      if (!cancelled) {
        setAvailable(templates);
        setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [ownerId, category]);

  const q = search.trim().toLowerCase();
  const visible = q
    ? available.filter((t) => t.label.toLowerCase().includes(q))
    : available;

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  if (available.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center text-muted-foreground gap-2 py-12">
        <LayoutGrid className="h-10 w-10 opacity-30" />
        <p className="text-sm font-semibold">No templates in this category yet.</p>
        <p className="text-xs opacity-60">Ask your admin to import some from the Admin → Import tab.</p>
      </div>
    );
  }

  if (visible.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center text-muted-foreground gap-2 py-12">
        <p className="text-sm">No results for "{search}"</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {visible.map((t) => (
        <button
          key={t.url}
          onClick={() => onSelect(t.url, t.label, category)}
          className="aspect-[3/4] relative rounded-xl overflow-hidden border border-border hover:border-primary active:scale-95 transition touch-manipulation"
          style={{ background: "var(--gradient-card)" }}
        >
          <div className="absolute inset-0 flex items-center justify-center text-4xl">
            {categoryIcon(category)}
          </div>
          <img
            src={t.url}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
          <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/85 to-transparent pointer-events-none">
            <div className="text-white text-xs font-bold leading-tight line-clamp-2">{t.label}</div>
          </div>
        </button>
      ))}
    </div>
  );
}

// ─── Products Page ────────────────────────────────────────────────────────────
export default function ProductsPage() {
  const { profile } = useAuth();
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string>("beers");
  const [stockNumpadId, setStockNumpadId] = useState<string | null>(null);

  const profileRef = useRef(profile);
  useEffect(() => { profileRef.current = profile; }, [profile]);

  const load = useCallback(async () => {
    const p = profileRef.current;
    if (!p) return;
    const { data } = await supabase
      .from("products")
      .select("*")
      .eq("owner_id", p.id)
      .order("name", { ascending: true });
    setItems((data ?? []) as Product[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!profile?.id) return;
    load();
    const ch = supabase
      .channel(`products-mgmt-${profile.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "products", filter: `owner_id=eq.${profile.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile?.id, load]);

  if (profile?.role !== "owner") {
    return <div className="text-center text-muted-foreground py-20">Only owners can manage items.</div>;
  }

  const filtered = items.filter((p) => (p.category || "beers") === category);

  const updateStock = async (id: string, delta: number) => {
    const item = items.find((p) => p.id === id);
    if (!item) return;
    const newQty = Math.max(0, (item.stock_qty ?? 0) + delta);
    setItems((prev) => prev.map((p) => p.id === id ? { ...p, stock_qty: newQty } : p));
    const { error } = await supabase.from("products").update({ stock_qty: newQty }).eq("id", id);
    if (error) {
      toast.error(error.message);
      setItems((prev) => prev.map((p) => p.id === id ? { ...p, stock_qty: item.stock_qty } : p));
    }
  };

  const stockNumpadProduct = stockNumpadId ? items.find((p) => p.id === stockNumpadId) : null;

  return (
    <div>
      {/* Sticky sub-header — sits below the app header */}
      <div className="sticky top-0 z-20 -mx-3 px-3 py-2 bg-background/95 backdrop-blur border-b border-border space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black leading-tight">Bar Items</h1>
            <p className="text-muted-foreground text-xs">{items.length} items</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="font-bold h-8" style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}>
                <Plus className="h-4 w-4 mr-1" /> Add Item
              </Button>
            </DialogTrigger>
            <AddItemDialog
                key={open ? "open" : "closed"}
                ownerId={profile.id}
                onDone={() => { setOpen(false); load(); }}
                onSaved={(product) => {
                  // inject the new product into items immediately so the numpad can find it
                  setItems((prev) => [...prev, product]);
                  setStockNumpadId(product.id);
                }}
              />
          </Dialog>
        </div>
        <div className="grid grid-cols-5 gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setCategory(cat.value)}
              className={`h-14 rounded-xl font-bold text-2xl transition ${
                category === cat.value ? "text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
              style={category === cat.value ? { background: "var(--gradient-hero)" } : {}}
              title={cat.label}
            >
              {cat.icon}
            </button>
          ))}
        </div>
      </div>

      <div className="pt-3">        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">No {CATEGORIES.find(c=>c.value===category)?.label ?? category} yet — tap Add Item.</div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {filtered.map((p) => (
              <div key={p.id} className="flex flex-col rounded-2xl overflow-hidden border border-border" style={{ background: "var(--gradient-card)" }}>
                <div className="aspect-[3/4] relative w-full">
                  {p.image_url ? (
                    <img
                      src={p.image_url}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover"
                      onError={(e) => {
                        const img = e.currentTarget as HTMLImageElement;
                        img.style.display = "none";
                        const fallback = img.nextElementSibling as HTMLElement | null;
                        if (fallback) fallback.style.display = "flex";
                      }}
                    />
                  ) : null}
                  <div
                    className="absolute inset-0 items-center justify-center text-4xl"
                    style={{ display: p.image_url ? "none" : "flex" }}
                  >
                    {categoryIcon(p.category ?? "drinks")}
                  </div>

                  {/* Out-of-stock overlay — tappable to open qty editor */}
                  {(p.stock_qty ?? 0) === 0 && (
                    <div
                      onClick={(e) => { e.stopPropagation(); setStockNumpadId(p.id); }}
                      className="absolute inset-0 z-[5] flex items-center justify-center bg-red-950/75 backdrop-blur-[1px] cursor-pointer active:bg-red-950/90 transition"
                    >
                      <div className="bg-red-600 rounded-xl px-2 py-1 shadow-lg">
                        <span className="text-white text-[10px] font-black uppercase tracking-wider leading-none">Out of Stock</span>
                      </div>
                    </div>
                  )}

                  {/* Stock qty — top-left, larger, tappable to open numpad */}
                  <button
                    onClick={(e) => { e.stopPropagation(); setStockNumpadId(p.id); }}
                    className="absolute top-1.5 left-1.5 h-10 min-w-[2.5rem] px-2 rounded-full flex items-center justify-center bg-black/70 active:scale-95 transition shadow z-10"
                  >
                    <span className="text-base font-black text-white leading-none">{p.stock_qty ?? 0}</span>
                  </button>

                  {/* LOW stock badge — shows when stock is 1–5 */}
                  {(p.stock_qty ?? 0) > 0 && (p.stock_qty ?? 0) <= 5 && (
                    <div className="absolute top-1.5 right-1.5 z-10 bg-red-600 rounded-md px-1.5 py-0.5 shadow">
                      <span className="text-white text-[9px] font-black uppercase tracking-wider leading-none">LOW</span>
                    </div>
                  )}
                  {/* Delete button on image bottom-right, price moves to footer */}
                  <div className="absolute inset-x-0 bottom-0 px-2 py-1.5 z-10 flex justify-end">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button className="p-1 rounded text-white/70 hover:text-destructive bg-black/50 rounded-lg">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete {p.name}?</AlertDialogTitle>
                          <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={async () => {
                            await supabase.from("products").delete().eq("id", p.id);
                            load();
                          }}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>

                {/* ── Title + price below image ── */}
                <div className="px-1.5 py-1.5" style={{ background: "rgba(var(--primary-rgb, 251 146 60) / 0.10)", borderTop: "1px solid rgba(var(--primary-rgb, 251 146 60) / 0.35)" }}>
                  <div className="font-bold text-[11px] truncate leading-tight" style={{ color: "var(--primary)" }}>{p.name}</div>
                  <div className="font-black text-xs mt-0.5" style={{ color: "var(--primary)" }}>${Number(p.price).toFixed(2)}</div>
                </div>

              </div>
            ))}
          </div>
        )}
      </div>

      {stockNumpadId && stockNumpadProduct && (
        <StockNumpad
          productId={stockNumpadId}
          currentQty={stockNumpadProduct.stock_qty ?? 0}
          stockQtyUndo={stockNumpadProduct.stock_qty_undo ?? null}
          stockQtyUndoSaved={stockNumpadProduct.stock_qty_undo_saved ?? null}
          onClose={() => setStockNumpadId(null)}
          onSaved={(patch) => {
            setItems((prev) => prev.map((p) => p.id === stockNumpadId ? { ...p, ...patch } : p));
          }}
        />
      )}
    </div>
  );
}

// ─── Add Item Dialog ──────────────────────────────────────────────────────────
function AddItemDialog({ onDone, onSaved, ownerId }: { onDone: () => void; onSaved: (product: Product) => void; ownerId: string }) {
  const { profile } = useAuth();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState<string>("beers");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [templateUrl, setTemplateUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  // which category tab is active inside the template picker
  const [templateCat, setTemplateCat] = useState<string>("beers");
  const [templateSearch, setTemplateSearch] = useState("");
  const [templateKbOpen, setTemplateKbOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  const onPick = (f: File | undefined | null) => {
    if (!f) return;
    setFile(f);
    setTemplateUrl(null);
    setPreview(URL.createObjectURL(f));
  };

  const onTemplateSelect = (url: string, label: string, templateCategory: string) => {
    setTemplateUrl(url);
    setFile(null);
    setPreview(url);
    setName(label);  // always update name from the selected template
    setCategory(templateCategory);
    setShowTemplates(false);
    setTemplateSearch("");
    setTemplateKbOpen(false);
  };

  const clearImage = () => { setFile(null); setTemplateUrl(null); setPreview(null); };

  const handleNumpad = (k: string) => {
    if (k === "⌫") { setPrice((v) => v.slice(0, -1)); return; }
    if (k === ".") { if (!price.includes(".")) setPrice((v) => v + "."); return; }
    const dotIdx = price.indexOf(".");
    if (dotIdx !== -1 && price.length - dotIdx > 2) return;
    setPrice((v) => (v === "0" ? k : v + k));
  };

  const submit = async () => {
    if (!profile || !name || !price) return;
    setBusy(true);
    let image_url: string | null = null;
    if (templateUrl) {
      image_url = templateUrl;
    } else if (file) {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${profile.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("product-images").upload(path, file, { upsert: false });
      if (upErr) { toast.error(upErr.message); setBusy(false); return; }
      image_url = supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
    }
    const { data: inserted, error } = await supabase.from("products").insert({
      owner_id: profile.id, name: name.trim(), price: Number(price), image_url, category,
    }).select("*").single();
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Item added");
    setName(""); setPrice(""); setCategory("beers"); setFile(null); setPreview(null); setTemplateUrl(null);
    onDone();
    onSaved(inserted);
  };

  return (
    <DialogContent className="max-w-lg w-[calc(100vw-2rem)] max-h-[90dvh] flex flex-col p-4 gap-0">
      <DialogHeader className="shrink-0 pb-3">
        <div className="flex items-center gap-3">
          {showTemplates && (
            <button
              onClick={() => { setShowTemplates(false); setTemplateKbOpen(false); }}
              className="h-8 w-8 rounded-full flex items-center justify-center bg-muted hover:bg-muted/80 transition shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <DialogTitle>{showTemplates ? "Choose Template" : "Add Bar Item"}</DialogTitle>
        </div>
      </DialogHeader>

      <div className="flex-1 min-h-0 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
        {showTemplates ? (
          <div className="flex flex-col h-full">
            {/* Sticky search + category tabs — top:-1px bleeds over the gap */}
            <div className="sticky top-0 z-10 pb-2 space-y-2" style={{ background: "var(--background)", paddingTop: "1px" }}>
              {/* Search */}
              <div className="flex items-center gap-2">
                <div
                  className="flex-1 pl-8 h-8 text-sm rounded-md border border-border bg-background flex items-center cursor-pointer select-none relative"
                  onPointerDown={(e) => { e.preventDefault(); setTemplateKbOpen(true); }}
                >
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <span className={templateSearch ? "text-foreground" : "text-muted-foreground"}>
                    {templateSearch || "Search templates…"}
                  </span>
                </div>
                {templateSearch && (
                  <button
                    onPointerDown={(e) => { e.preventDefault(); setTemplateSearch(""); }}
                    className="h-8 px-3 rounded-md text-xs font-black transition active:scale-95 shrink-0 border"
                    style={{ background: "#000", color: "#ef4444", borderColor: "#ef4444" }}
                  >
                    Delete
                  </button>
                )}
              </div>
              {/* Category tabs */}
              <div className="grid grid-cols-5 gap-2">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.value}
                    onClick={() => { setTemplateCat(cat.value); setTemplateKbOpen(false); }}
                    className={`h-14 rounded-xl font-bold text-2xl transition ${
                      templateCat === cat.value ? "text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                    style={templateCat === cat.value ? { background: "var(--gradient-hero)" } : {}}
                    title={cat.label}
                  >
                    {cat.icon}
                  </button>
                ))}
              </div>
            </div>
            {/* Scrollable grid — add bottom padding when keyboard is open */}
            <div style={templateKbOpen ? { paddingBottom: "14rem" } : {}}>
              <TemplatePicker
                onSelect={onTemplateSelect}
                ownerId={ownerId}
                category={templateCat}
                search={templateSearch}
              />
            </div>
            {/* Custom keyboard — stop propagation so tapping keys doesn't dismiss */}
            {templateKbOpen && (
              <TemplateKeyboard
                onKey={(k) => {
                  if (k === "⌫") { setTemplateSearch((s) => s.slice(0, -1)); return; }
                  if (k === "SPACE") { setTemplateSearch((s) => s + " "); return; }
                  setTemplateSearch((s) => s + k.toLowerCase());
                }}
                onClose={() => setTemplateKbOpen(false)}
              />
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {/* Image area */}
            <div className="flex gap-3 items-stretch">
              <div className="relative w-1/2 aspect-[3/4] rounded-xl border-2 border-dashed border-border overflow-hidden shrink-0" style={{ background: "var(--gradient-card)" }}>
                {preview
                  ? <img src={preview} className="absolute inset-0 w-full h-full object-cover" alt="preview" />
                  : <div className="absolute inset-0 flex items-center justify-center"><ImagePlus className="h-8 w-8 text-muted-foreground/40" /></div>
                }
                {preview && (
                  <button onClick={clearImage} className="absolute top-1.5 right-1.5 bg-black/60 text-white rounded-full p-1">
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
                <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => onPick(e.target.files?.[0])} />
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => onPick(e.target.files?.[0])} />
              </div>
              <div className="flex flex-col gap-2 flex-1 justify-center">
                <Button type="button" variant="secondary" className="w-full h-14 text-sm font-bold" onClick={() => setShowTemplates(true)}>
                  <LayoutGrid className="h-5 w-5 mr-2" /> Template
                </Button>
                <Button type="button" variant="secondary" className="w-full h-14 text-sm font-bold" onClick={() => camRef.current?.click()}>
                  <Camera className="h-5 w-5 mr-2" /> Take Photo
                </Button>
                <Button type="button" variant="secondary" className="w-full h-14 text-sm font-bold" onClick={() => fileRef.current?.click()}>
                  <ImagePlus className="h-5 w-5 mr-2" /> Upload
                </Button>
              </div>
            </div>

            {/* Name */}
            <div>
              <Label className="text-xs">Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Heineken 330ml" className="h-9" />
            </div>

            {/* Category */}
            <div>
              <Label className="text-xs">Category</Label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-border bg-muted px-2 text-sm font-bold outline-none cursor-pointer"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>{cat.icon} {cat.label}</option>
                ))}
              </select>
            </div>

            {/* Price */}
            <div>
              <Label className="text-xs">Price</Label>
              <div className="h-10 rounded-lg border border-border bg-muted/30 flex items-center px-3 mb-2">
                <span className="text-lg font-black text-primary">${price || "0.00"}</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {["1","2","3","4","5","6","7","8","9",".","0","⌫"].map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => handleNumpad(k)}
                    className={`h-11 rounded-xl font-black text-lg transition active:scale-95 ${
                      k === "⌫" ? "bg-destructive/20 text-destructive hover:bg-destructive/30" : "bg-muted hover:bg-muted/70 text-foreground"
                    }`}
                  >{k}</button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {!showTemplates && (
        <Button onClick={submit} disabled={busy || !name || !price} className="font-bold h-11 shrink-0" style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Next →"}
        </Button>
      )}
    </DialogContent>
  );
}
