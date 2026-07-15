import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/lib/auth";
import { useChain } from "@/lib/ChainContext";
import { useTranslation } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Camera, ImagePlus, Plus, Trash2, Loader2, LayoutGrid, ArrowLeft, X, Search, ChevronDown, Pencil, ListChecks } from "lucide-react";
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
  cost_price: number;
  image_url: string | null;
  category?: string;
  stock_qty: number;
  sort_order: number;
  stock_qty_undo: number | null;
  stock_qty_undo_saved: number | null;
  stock_last_expense_id: string | null;
};

// ─── Stock Qty Numberpad Modal ────────────────────────────────────────────────
// ── Stock button definitions ─────────────────────────────────────────────────
const STOCK_BTNS = [
  { qty: 30 }, { qty: 24 }, { qty: 12 },
  { qty: 10 }, { qty: 6  }, { qty: 1  },
];

function StockNumpad({ productId, productName, ownerId, currentQty, costPrice, stockQtyUndo, stockQtyUndoSaved, lastExpenseId, onClose, onSaved }: {
  productId: string;
  productName: string;
  ownerId: string;
  currentQty: number;
  costPrice: number;
  stockQtyUndo: number | null;
  stockQtyUndoSaved: number | null;
  lastExpenseId: string | null;
  onClose: () => void;
  onSaved: (patch: Partial<Pick<Product, "stock_qty" | "stock_qty_undo" | "stock_qty_undo_saved" | "stock_last_expense_id">>) => void;
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

    // Auto-generate expense record if cost_price is set
    let newExpenseId: string | null = null;
    if (costPrice > 0) {
      const expenseAmount = costPrice * addAmount;
      const today = new Date().toISOString().split("T")[0];
      const { data: expData, error: expErr } = await supabase
        .from("owner_expenses")
        .insert({
          owner_id: ownerId,
          amount: expenseAmount,
          description: `${productName} ×${addAmount} @ $${costPrice.toFixed(2)} each`,
          expense_date: today,
        })
        .select("id")
        .single();
      if (expErr) { toast.error(expErr.message); setBusy(false); return; }
      newExpenseId = expData?.id ?? null;
    }

    // stock_qty_undo = what qty was before this add (for reverting)
    // stock_qty_undo_saved = what qty became after this add (to detect any sales)
    const { error } = await supabase
      .from("products")
      .update({
        stock_qty: newTotal,
        stock_qty_undo: currentQty,
        stock_qty_undo_saved: newTotal,
        stock_last_expense_id: newExpenseId,
      })
      .eq("id", productId);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    onSaved({ stock_qty: newTotal, stock_qty_undo: currentQty, stock_qty_undo_saved: newTotal, stock_last_expense_id: newExpenseId });
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

    // Delete the linked auto-generated expense record
    if (lastExpenseId) {
      await supabase.from("owner_expenses").delete().eq("id", lastExpenseId);
    }

    const { error } = await supabase
      .from("products")
      .update({ stock_qty: stockQtyUndo, stock_qty_undo: null, stock_qty_undo_saved: null, stock_last_expense_id: null })
      .eq("id", productId);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    onSaved({ stock_qty: stockQtyUndo, stock_qty_undo: null, stock_qty_undo_saved: null, stock_last_expense_id: null });
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
  return createPortal(
    <div
      className="fixed bottom-0 inset-x-0 z-[200] bg-background/98 backdrop-blur border-t border-border px-1 pt-1.5 space-y-1"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 6px)", boxShadow: "0 -4px 20px rgba(0,0,0,0.4)" }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Dismiss tab */}
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
            className="flex-1 h-9 sm:h-12 rounded-lg font-bold text-sm sm:text-base bg-muted hover:bg-muted/70 text-foreground transition active:scale-90 select-none"
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
              className={`flex-1 max-w-[2.6rem] sm:max-w-[3.5rem] h-9 sm:h-12 rounded-lg font-bold text-sm sm:text-base transition active:scale-90 select-none ${
                k === "⌫"
                  ? "bg-destructive/30 text-destructive max-w-[3.5rem] sm:max-w-[4.5rem]"
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
          className="flex-1 h-9 sm:h-12 rounded-lg bg-muted hover:bg-muted/70 text-xs sm:text-sm font-bold text-muted-foreground transition active:scale-95 select-none"
        >
          SPACE
        </button>
      </div>
    </div>,
    document.body
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

// ─── Bulk Edit Modal ──────────────────────────────────────────────────────────
function BulkEditModal({ items, ownerId, onClose, onSaved }: {
  items: Product[];
  ownerId: string;
  onClose: () => void;
  onSaved: (patches: { id: string; stock_qty: number; stock_last_expense_id: string | null; cost_price?: number; price?: number }[]) => void;
}) {
  // newQty keyed by product id — only items with a value > 0 will be processed
  const [newQtys, setNewQtys] = useState<Record<string, string>>({});
  // editable cost price and sell price — pre-seeded from items
  const [costPrices, setCostPrices] = useState<Record<string, string>>(() =>
    Object.fromEntries(items.map((p) => [p.id, String(p.cost_price ?? "")]))
  );
  const [sellPrices, setSellPrices] = useState<Record<string, string>>(() =>
    Object.fromEntries(items.map((p) => [p.id, String(p.price ?? "")]))
  );
  const [busy, setBusy] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  // id + field for active numpad in the table
  const [activeNumpad, setActiveNumpad] = useState<{ id: string; field: "cp" | "sp" | "qty" } | null>(null);

  const handleNumpad = (k: string) => {
    if (!activeNumpad) return;
    const { id, field } = activeNumpad;
    const isDecimal = field === "cp" || field === "sp";
    const current = field === "cp" ? (costPrices[id] ?? "") : field === "sp" ? (sellPrices[id] ?? "") : (newQtys[id] ?? "");
    const setter = field === "cp"
      ? (v: string) => setCostPrices((p) => ({ ...p, [id]: v }))
      : field === "sp"
      ? (v: string) => setSellPrices((p) => ({ ...p, [id]: v }))
      : (v: string) => setNewQtys((p) => ({ ...p, [id]: v }));
    if (k === "⌫") { setter(current.slice(0, -1)); return; }
    if (k === ".") { if (isDecimal && !current.includes(".")) setter(current + "."); return; }
    const dotIdx = current.indexOf(".");
    if (dotIdx !== -1 && current.length - dotIdx > 2) return;
    setter(current === "0" ? k : current + k);
  };

  // Sort all items alphabetically, group by category
  const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name));
  const grouped = CATEGORIES.map((cat) => ({
    cat,
    products: sorted.filter((p) => (p.category || "beers") === cat.value),
  })).filter((g) => g.products.length > 0);

  // Items with a new qty entered
  const updates = items.filter((p) => {
    const v = parseInt(newQtys[p.id] ?? "", 10);
    return !isNaN(v) && v > 0;
  });

  // Items with price-only changes (no qty added)
  const priceOnlyChanges = items.filter((p) => {
    const v = parseInt(newQtys[p.id] ?? "", 10);
    if (!isNaN(v) && v > 0) return false; // already in updates
    const newCp = parseFloat(costPrices[p.id] ?? "");
    const newSp = parseFloat(sellPrices[p.id] ?? "");
    const cpChanged = !isNaN(newCp) && newCp !== Number(p.cost_price ?? 0);
    const spChanged = !isNaN(newSp) && newSp !== Number(p.price ?? 0);
    return cpChanged || spChanged;
  });

  // All items with any change — shown in preview
  const allChanged = [...updates, ...priceOnlyChanges];

  // Use the edited cost price for the expense calc
  const totalCost = updates.reduce((sum, p) => {
    const addQty = parseInt(newQtys[p.id], 10);
    const cp = parseFloat(costPrices[p.id] ?? "") || Number(p.cost_price ?? 0);
    return sum + cp * addQty;
  }, 0);

  const save = async () => {
    if (allChanged.length === 0) return;
    setBusy(true);

    const today = new Date().toISOString().split("T")[0];

    // Build description — title then one item per line, no total (shown separately)
    const lines = updates.map((p) => {
      const addQty = parseInt(newQtys[p.id], 10);
      const cp = parseFloat(costPrices[p.id] ?? "") || Number(p.cost_price ?? 0);
      const lineTotal = cp * addQty;
      return `${p.name} ×${addQty} @ $${cp.toFixed(2)} each = $${lineTotal.toFixed(2)}`;
    });
    const description = `Bulk Stock Update\n${lines.join("\n")}`;

    // Insert one combined expense record (only if there's a cost)
    let expenseId: string | null = null;
    if (totalCost > 0) {
      const { data: expData, error: expErr } = await supabase
        .from("owner_expenses")
        .insert({
          owner_id: ownerId,
          amount: totalCost,
          description,
          expense_date: today,
        })
        .select("id")
        .single();
      if (expErr) { toast.error("Could not create expense record: " + expErr.message); setBusy(false); return; }
      expenseId = expData?.id ?? null;
    }

    // Update each product — stock qty + any edited prices
    const patches: { id: string; stock_qty: number; stock_last_expense_id: string | null; cost_price?: number; price?: number }[] = [];
    for (const p of updates) {
      const addQty = parseInt(newQtys[p.id], 10);
      const newTotal = (p.stock_qty ?? 0) + addQty;
      const newCp = parseFloat(costPrices[p.id] ?? "");
      const newSp = parseFloat(sellPrices[p.id] ?? "");
      const cpChanged = !isNaN(newCp) && newCp !== Number(p.cost_price ?? 0);
      const spChanged = !isNaN(newSp) && newSp !== Number(p.price ?? 0);
      const { error } = await supabase
        .from("products")
        .update({
          stock_qty: newTotal,
          stock_qty_undo: p.stock_qty ?? 0,
          stock_qty_undo_saved: newTotal,
          stock_last_expense_id: expenseId,
          ...(cpChanged ? { cost_price: newCp } : {}),
          ...(spChanged ? { price: newSp } : {}),
        })
        .eq("id", p.id);
      if (error) { toast.error(`Failed to update ${p.name}: ${error.message}`); }
      else {
        patches.push({
          id: p.id,
          stock_qty: newTotal,
          stock_last_expense_id: expenseId,
          ...(cpChanged ? { cost_price: newCp } : {}),
          ...(spChanged ? { price: newSp } : {}),
        });
      }
    }

    // Also save price-only changes for items where no qty was added
    for (const p of items.filter((p) => !updates.includes(p))) {
      const newCp = parseFloat(costPrices[p.id] ?? "");
      const newSp = parseFloat(sellPrices[p.id] ?? "");
      const cpChanged = !isNaN(newCp) && newCp !== Number(p.cost_price ?? 0);
      const spChanged = !isNaN(newSp) && newSp !== Number(p.price ?? 0);
      if (!cpChanged && !spChanged) continue;
      const { error } = await supabase
        .from("products")
        .update({
          ...(cpChanged ? { cost_price: newCp } : {}),
          ...(spChanged ? { price: newSp } : {}),
        })
        .eq("id", p.id);
      if (!error) {
        patches.push({
          id: p.id,
          stock_qty: p.stock_qty,
          stock_last_expense_id: p.stock_last_expense_id,
          ...(cpChanged ? { cost_price: newCp } : {}),
          ...(spChanged ? { price: newSp } : {}),
        });
      }
    }

    setBusy(false);
    toast.success(`${patches.length} item${patches.length !== 1 ? "s" : ""} updated`);
    onSaved(patches);
    onClose();
  };

  const SaveBar = () => (
    <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-background/95 shrink-0">
      <div className="text-sm font-black">
        {allChanged.length > 0 ? (
          <span style={{ color: "var(--primary)" }}>
            {allChanged.length} item{allChanged.length !== 1 ? "s" : ""}
            {updates.length > 0 && <span className="text-green-400"> · ${totalCost.toFixed(2)}</span>}
          </span>
        ) : (
          <span className="text-muted-foreground">Edit prices or enter qty to add stock</span>
        )}
      </div>
      <button
        onClick={() => {
          // Block if any item has qty > 0 but cp or sp is 0
          const invalid = updates.find((p) => {
            const cp = parseFloat(costPrices[p.id] ?? "") || Number(p.cost_price ?? 0);
            const sp = parseFloat(sellPrices[p.id] ?? "") || Number(p.price ?? 0);
            return cp === 0 || sp === 0;
          });
          if (invalid) {
            toast.error(`"${invalid.name}" has qty > 0 but Cost Price or Sell Price is $0.00 — set both prices first.`);
            return;
          }
          if (allChanged.length > 0) setShowPreview(true);
        }}
        disabled={busy || allChanged.length === 0}
        className="h-10 px-5 rounded-xl font-black text-sm text-primary-foreground transition active:scale-95 disabled:opacity-40 flex items-center gap-2"
        style={{ background: "var(--gradient-hero)" }}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Bulk"}
      </button>
    </div>
  );

  // shared input style
  const numInputCls = "w-full h-8 rounded-lg border text-right pr-2 text-xs font-black bg-muted/50 outline-none focus:ring-1 focus:ring-primary transition";

  return (
    <>
    <div className="fixed inset-0 z-[70] flex flex-col bg-background" onClick={onClose}>
      <div className="flex flex-col h-full max-w-4xl mx-auto w-full" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-3 border-b border-border shrink-0"
          style={{ paddingTop: "calc(44px + env(safe-area-inset-top, 0px) + 0.75rem)" }}>
          <div className="flex items-center gap-2">
            <ListChecks className="h-5 w-5" style={{ color: "var(--primary)" }} />
            <span className="text-lg font-black">Bulk Edit Stock</span>
          </div>
          <button onClick={onClose} className="h-10 px-5 rounded-xl font-black text-sm flex items-center gap-2 bg-muted hover:bg-muted/80 transition active:scale-95">
            <X className="h-4 w-4" /> Exit
          </button>
        </div>

        {/* Save bar — top */}
        <SaveBar />

        {/* Scrollable table */}
        <div className="flex-1 overflow-y-auto overflow-x-auto" style={{ scrollbarWidth: "thin" }}>
          <table className="min-w-[600px] w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-background border-b border-border">
              <tr>
                <th className="text-left pl-3 pr-2 py-2 font-black text-xs text-muted-foreground w-10 sm:w-14"></th>
                <th className="text-left px-2 py-2 font-black text-xs text-muted-foreground min-w-[110px]">Name</th>
                <th className="text-right px-2 py-2 font-black text-xs text-muted-foreground w-[76px] sm:w-[96px]">Cost $</th>
                <th className="text-right px-2 py-2 font-black text-xs text-muted-foreground w-[76px] sm:w-[96px]">Sell $</th>
                <th className="text-right px-2 py-2 font-black text-xs text-muted-foreground w-[46px] sm:w-[60px]">Qty</th>
                <th className="text-right pr-4 pl-2 py-2 font-black text-xs w-[76px] sm:w-[96px]" style={{ color: "var(--primary)" }}>+ Add</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map(({ cat, products }) => (
                <>
                  {/* Category section header */}
                  <tr key={`hdr-${cat.value}`}>
                    <td colSpan={6} className="pl-3 pt-4 pb-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-lg leading-none">{cat.icon}</span>
                        <span className="text-xs font-black uppercase tracking-widest" style={{ color: "var(--primary)" }}>{cat.label}</span>
                      </div>
                    </td>
                  </tr>
                  {products.map((p) => {
                    const addVal = newQtys[p.id] ?? "";
                    const hasAdd = parseInt(addVal, 10) > 0;
                    const cpVal = costPrices[p.id] ?? "";
                    const spVal = sellPrices[p.id] ?? "";
                    const cpIsZero = hasAdd && (parseFloat(cpVal) || 0) === 0;
                    const spIsZero = hasAdd && (parseFloat(spVal) || 0) === 0;
                    return (
                      <tr
                        key={p.id}
                        className="border-t border-border/40 transition"
                        style={hasAdd ? { background: "rgba(251,146,60,0.07)" } : {}}
                      >
                        {/* Thumbnail */}
                        <td className="pl-3 pr-2 py-1.5 w-10 sm:w-14">
                          <div className="h-8 w-8 sm:h-12 sm:w-12 rounded-lg overflow-hidden border border-border shrink-0 flex items-center justify-center text-base sm:text-xl" style={{ background: "var(--gradient-card)" }}>
                            {p.image_url
                              ? <img src={p.image_url} alt="" className="h-full w-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                              : categoryIcon(p.category ?? "drinks")}
                          </div>
                        </td>
                        {/* Name */}
                        <td className="px-2 py-1.5 min-w-[110px]">
                          <span className="font-bold text-xs leading-tight line-clamp-2">{p.name}</span>
                        </td>
                        {/* Cost price — editable */}
                        <td className="px-2 py-1.5 w-[76px] sm:w-[96px]">
                          <div
                            onClick={() => setActiveNumpad(activeNumpad?.id === p.id && activeNumpad.field === "cp" ? null : { id: p.id, field: "cp" })}
                            className="h-8 sm:h-11 rounded-lg border text-right pr-2 text-xs sm:text-sm font-black bg-muted/50 flex items-center justify-end cursor-pointer active:bg-muted/70 transition"
                            style={{ borderColor: activeNumpad?.id === p.id && activeNumpad.field === "cp" ? "var(--primary)" : cpIsZero ? "#ef4444" : "var(--border)", color: "var(--muted-foreground)" }}
                          >
                            {cpVal || "0.00"}
                          </div>
                        </td>
                        {/* Sell price — editable */}
                        <td className="px-2 py-1.5 w-[76px] sm:w-[96px]">
                          <div
                            onClick={() => setActiveNumpad(activeNumpad?.id === p.id && activeNumpad.field === "sp" ? null : { id: p.id, field: "sp" })}
                            className="h-8 sm:h-11 rounded-lg border text-right pr-2 text-xs sm:text-sm font-black bg-muted/50 flex items-center justify-end cursor-pointer active:bg-muted/70 transition"
                            style={{ borderColor: activeNumpad?.id === p.id && activeNumpad.field === "sp" ? "var(--primary)" : spIsZero ? "#ef4444" : "var(--border)", color: "var(--foreground)" }}
                          >
                            {spVal || "0.00"}
                          </div>
                        </td>
                        {/* Current qty — read only */}
                        <td className="px-2 py-1.5 text-right w-[46px] sm:w-[60px]">
                          <span className={`font-black text-xs sm:text-sm ${(p.stock_qty ?? 0) === 0 ? "text-red-400" : (p.stock_qty ?? 0) <= 5 ? "text-yellow-400" : "text-green-400"}`}>
                            {p.stock_qty ?? 0}
                          </span>
                        </td>
                        {/* New qty input */}
                        <td className="pr-4 pl-2 py-1.5 text-right w-[76px] sm:w-[96px]">
                          <div
                            onClick={() => setActiveNumpad(activeNumpad?.id === p.id && activeNumpad.field === "qty" ? null : { id: p.id, field: "qty" })}
                            className="h-8 sm:h-11 rounded-lg border text-right pr-2 text-xs sm:text-sm font-black bg-muted/50 flex items-center justify-end cursor-pointer active:bg-muted/70 transition"
                            style={{
                              borderColor: activeNumpad?.id === p.id && activeNumpad.field === "qty" ? "var(--primary)" : hasAdd ? "var(--primary)" : "var(--border)",
                              color: hasAdd ? "var(--primary)" : "var(--muted-foreground)",
                            }}
                          >
                            {addVal || "0"}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </>
              ))}
            </tbody>
          </table>
        </div>

        {/* Numpad — shown above bottom save bar when a cell is active */}
        {activeNumpad && (
          <div className="shrink-0 border-t border-border px-4 pt-3 pb-2" style={{ background: "var(--background)" }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-black text-muted-foreground uppercase tracking-widest">
                {activeNumpad.field === "cp" ? "Cost Price" : activeNumpad.field === "sp" ? "Sell Price" : "Add Qty"}
              </span>
              <button onClick={() => setActiveNumpad(null)}
                className="h-10 px-5 rounded-xl font-black text-sm flex items-center gap-2 active:scale-95 transition"
                style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}>
                Done ✓
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {["1","2","3","4","5","6","7","8","9", activeNumpad.field !== "qty" ? "." : "", "0","⌫"].map((k, i) => (
                k === "" ? <div key={i} /> :
                <button
                  key={i}
                  type="button"
                  onClick={() => handleNumpad(k)}
                  className={`h-11 sm:h-14 rounded-xl font-black text-lg sm:text-xl transition active:scale-95 ${
                    k === "⌫" ? "bg-destructive/20 text-destructive hover:bg-destructive/30" : "bg-muted hover:bg-muted/70 text-foreground"
                  }`}
                >{k}</button>
              ))}
            </div>
          </div>
        )}

        {/* Save bar — bottom */}
        <SaveBar />
      </div>
    </div>

    {/* ── Preview / Confirm modal ── */}
    {showPreview && (
      <div className="fixed inset-0 z-[80] flex flex-col items-center bg-background">
        <div className="flex flex-col h-full w-full max-w-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-5 pb-3 border-b border-border shrink-0">
          <div>
            <h2 className="text-lg font-black">Confirm Changes</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{allChanged.length} item{allChanged.length !== 1 ? "s" : ""} will be updated</p>
          </div>
          <button onClick={() => setShowPreview(false)} className="h-9 w-9 rounded-full flex items-center justify-center bg-muted hover:bg-muted/80 transition">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Preview list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {allChanged.map((p) => {
            const addQty = parseInt(newQtys[p.id] ?? "", 10);
            const hasQty = !isNaN(addQty) && addQty > 0;
            const newCp = parseFloat(costPrices[p.id] ?? "");
            const newSp = parseFloat(sellPrices[p.id] ?? "");
            const cpChanged = !isNaN(newCp) && newCp !== Number(p.cost_price ?? 0);
            const spChanged = !isNaN(newSp) && newSp !== Number(p.price ?? 0);
            const cp = hasQty ? (parseFloat(costPrices[p.id] ?? "") || Number(p.cost_price ?? 0)) : Number(p.cost_price ?? 0);
            const lineTotal = hasQty ? cp * addQty : 0;
            return (
              <div key={p.id} className="rounded-2xl border border-border p-3 flex items-start gap-3"
                style={{ background: "var(--gradient-card)" }}>
                {/* Thumbnail */}
                <div className="h-10 w-10 rounded-xl overflow-hidden border border-border shrink-0 flex items-center justify-center text-lg"
                  style={{ background: "var(--gradient-card)" }}>
                  {p.image_url
                    ? <img src={p.image_url} alt="" className="h-full w-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                    : categoryIcon(p.category ?? "drinks")}
                </div>
                {/* Details */}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="font-black text-sm truncate">{p.name}</div>
                  {hasQty && (
                    <div className="text-xs font-bold" style={{ color: "var(--primary)" }}>
                      Stock: {p.stock_qty ?? 0} → <span className="text-green-400">{(p.stock_qty ?? 0) + addQty}</span>
                      <span className="text-muted-foreground ml-2">(+{addQty} @ ${cp.toFixed(2)} = ${lineTotal.toFixed(2)})</span>
                    </div>
                  )}
                  {cpChanged && (
                    <div className="text-xs text-muted-foreground">
                      Cost: <span className="line-through">${Number(p.cost_price ?? 0).toFixed(2)}</span>
                      <span className="text-yellow-400 font-black ml-1"> → ${newCp.toFixed(2)}</span>
                    </div>
                  )}
                  {spChanged && (
                    <div className="text-xs text-muted-foreground">
                      Sell: <span className="line-through">${Number(p.price ?? 0).toFixed(2)}</span>
                      <span className="text-yellow-400 font-black ml-1"> → ${newSp.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Expense total summary */}
          {totalCost > 0 && (
            <div className="rounded-2xl border border-green-500/30 px-4 py-3 flex items-center justify-between mt-2"
              style={{ background: "rgba(34,197,94,0.06)" }}>
              <span className="text-sm font-black text-muted-foreground">Stock expense total</span>
              <span className="text-lg font-black text-green-400">${totalCost.toFixed(2)}</span>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="px-4 pb-6 pt-3 border-t border-border shrink-0 flex gap-3">
          <button
            onClick={() => setShowPreview(false)}
            className="flex-1 h-12 rounded-2xl font-black text-sm border border-border transition active:scale-[0.98]"
            style={{ background: "rgba(255,255,255,0.04)" }}
          >
            ← Back
          </button>
          <button
            onClick={save}
            disabled={busy}
            className="flex-[2] h-12 rounded-2xl font-black text-sm text-primary-foreground disabled:opacity-40 flex items-center justify-center gap-2 transition active:scale-[0.98]"
            style={{ background: "var(--gradient-hero)" }}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm Save"}
          </button>
        </div>
        </div>{/* end max-w-2xl wrapper */}
      </div>
    )}
    </>
  );
}

// ─── Products Page ────────────────────────────────────────────────────────────
export default function ProductsPage() {
  const { profile } = useAuth();
  const { effectiveOwnerId } = useChain();
  const { t } = useTranslation();
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editItem, setEditItem] = useState<Product | null>(null);
  const [category, setCategory] = useState<string>("beers");
  const [stockNumpadId, setStockNumpadId] = useState<string | null>(null);
  const [showBulkEdit, setShowBulkEdit] = useState(false);

  const profileRef = useRef(profile);
  useEffect(() => { profileRef.current = profile; }, [profile]);

  const load = useCallback(async () => {
    const p = profileRef.current;
    if (!p) return;
    const ownerIdForQuery = effectiveOwnerId(p.id);
    const { data } = await supabase
      .from("products")
      .select("*")
      .eq("owner_id", ownerIdForQuery)
      .order("name", { ascending: true });
    setItems((data ?? []) as Product[]);
    setLoading(false);
  }, [effectiveOwnerId]);

  useEffect(() => {
    if (!profile?.id) return;
    load();
    const ownerIdForQuery = effectiveOwnerId(profile.id);
    const ch = supabase
      .channel(`products-mgmt-${ownerIdForQuery}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "products", filter: `owner_id=eq.${ownerIdForQuery}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile?.id, load, effectiveOwnerId]);

  if (profile?.role !== "owner") {
    return <div className="text-center text-muted-foreground py-20">Only owners can manage items.</div>;
  }

  const ownerIdForQuery = effectiveOwnerId(profile.id);
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
      <div className="sticky top-0 z-30 -mx-3 px-3 py-2 bg-background/95 backdrop-blur border-b border-border space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black leading-tight">{t("products_title", "Bar Items")}</h1>
            <p className="text-muted-foreground text-xs">{items.length} items</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => setShowBulkEdit(true)}
              className="font-bold h-8 px-3"
              variant="outline"
              style={{ borderColor: "var(--primary)", color: "var(--primary)" }}
            >
              <Pencil className="h-3.5 w-3.5 mr-1" /> Bulk Edit
            </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="font-bold h-8" style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}>
                <Plus className="h-4 w-4 mr-1" /> Add Item
              </Button>
            </DialogTrigger>
            <AddItemDialog
                key={open ? "open" : "closed"}
                ownerId={ownerIdForQuery}
                onDone={() => { setOpen(false); load(); }}
                onSaved={(product) => {
                  // inject the new product into items immediately so the numpad can find it
                  setItems((prev) => [...prev, product]);
                  setStockNumpadId(product.id);
                }}
              />
          </Dialog>
          </div>
        </div>
        <div className="grid grid-cols-6 gap-1.5">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setCategory(cat.value)}
              className={`h-14 rounded-xl font-bold transition flex flex-col items-center justify-center gap-0.5 ${
                category === cat.value ? "text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
              style={category === cat.value ? { background: "var(--gradient-hero)" } : {}}
              title={cat.label}
            >
              <span className="text-xl sm:text-2xl leading-none">{cat.icon}</span>
              <span className="hidden sm:block text-[11px] font-black leading-none">
                {cat.value === "miscellaneous" ? "Misc." : cat.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="pt-3">
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">No {CATEGORIES.find(c=>c.value===category)?.label ?? category} yet — tap Add Item.</div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-6 gap-2">
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
                      onClick={(e) => { e.stopPropagation(); setEditItem(p); }}
                      className="absolute inset-0 z-[5] flex items-center justify-center bg-red-950/75 backdrop-blur-[1px] cursor-pointer active:bg-red-950/90 transition"
                    >
                      <div className="bg-red-600 rounded-xl px-2 py-1 shadow-lg">
                        <span className="text-white text-[10px] font-black uppercase tracking-wider leading-none">Out of Stock</span>
                      </div>
                    </div>
                  )}

                  {/* Stock qty — top-left, display only */}
                  <div
                    className="absolute top-1.5 left-1.5 h-10 min-w-[2.5rem] px-2 rounded-full flex items-center justify-center bg-black/70 shadow z-10"
                  >
                    <span className="text-base font-black text-white leading-none">{p.stock_qty ?? 0}</span>
                  </div>

                  {/* Edit button — bottom-left orange circle */}
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditItem(p); }}
                    className="absolute bottom-1.5 left-1.5 h-10 w-10 rounded-full flex items-center justify-center active:scale-95 transition shadow z-20"
                    style={{ background: "var(--gradient-hero)" }}
                    title="Edit item"
                  >
                    <Pencil className="h-4 w-4 text-black" />
                  </button>

                  {/* LOW stock badge — top-right */}
                  {(p.stock_qty ?? 0) > 0 && (p.stock_qty ?? 0) <= 5 && (
                    <div className="absolute top-1.5 right-1.5 z-10 bg-red-600 rounded-md px-1.5 py-0.5 shadow">
                      <span className="text-white text-[9px] font-black uppercase tracking-wider leading-none">LOW</span>
                    </div>
                  )}

                  {/* Delete button — bottom-right red circle, same size as edit */}
                  <div className="absolute bottom-1.5 right-1.5 z-20">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button
                          onClick={(e) => e.stopPropagation()}
                          className="h-10 w-10 rounded-full flex items-center justify-center bg-red-600 active:scale-95 transition shadow"
                        >
                          <Trash2 className="h-4 w-4 text-white" />
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete {p.name}?</AlertDialogTitle>
                          <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter className="flex-row gap-3 mt-2">
                          <AlertDialogCancel className="flex-1 h-14 text-base font-black m-0">Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            className="flex-1 h-14 text-base font-black bg-destructive hover:bg-destructive/90"
                            onClick={async () => {
                              await supabase.from("products").delete().eq("id", p.id);
                              load();
                            }}
                          >Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>

                {/* ── Title + CP / SP below image ── */}
                {(() => {
                  const cp = Number(p.cost_price ?? 0);
                  const sp = Number(p.price ?? 0);
                  const cpMissing = cp === 0;
                  const spMissing = sp === 0;
                  return (
                    <div className="px-1.5 py-1.5 pointer-events-none select-none" style={{ background: "rgba(var(--primary-rgb, 251 146 60) / 0.10)", borderTop: "1px solid rgba(var(--primary-rgb, 251 146 60) / 0.35)" }}>
                      <div className="font-bold text-[11px] truncate leading-tight" style={{ color: "var(--primary)" }}>{p.name}</div>
                      <div className="font-black text-[10px] leading-tight mt-0.5" style={{ color: cpMissing ? "#f87171" : "var(--primary)" }}>
                        CP: ${cp.toFixed(2)}
                      </div>
                      <div className="font-black text-[10px] leading-tight" style={{ color: spMissing ? "#f87171" : "var(--primary)" }}>
                        SP: ${sp.toFixed(2)}
                      </div>
                    </div>
                  );
                })()}

              </div>
            ))}
          </div>
        )}

        {/* ── Bulk Edit button — full-width, shown below grid ── */}
        {!loading && (
          <div className="pt-3 pb-2">
            <button
              onClick={() => setShowBulkEdit(true)}
              className="w-full h-14 rounded-2xl font-black text-sm flex items-center justify-center gap-2 border-2 transition active:scale-[0.98]"
              style={{
                background: "rgba(251,146,60,0.08)",
                borderColor: "var(--primary)",
                color: "var(--primary)",
              }}
            >
              <Pencil className="h-4 w-4" />
              Bulk Edit
            </button>
          </div>
        )}      </div>

      {stockNumpadId && stockNumpadProduct && (
        <StockNumpad
          productId={stockNumpadId}
          productName={stockNumpadProduct.name}
          ownerId={ownerIdForQuery}
          currentQty={stockNumpadProduct.stock_qty ?? 0}
          costPrice={stockNumpadProduct.cost_price ?? 0}
          stockQtyUndo={stockNumpadProduct.stock_qty_undo ?? null}
          stockQtyUndoSaved={stockNumpadProduct.stock_qty_undo_saved ?? null}
          lastExpenseId={stockNumpadProduct.stock_last_expense_id ?? null}
          onClose={() => setStockNumpadId(null)}
          onSaved={(patch) => {
            setItems((prev) => prev.map((p) => p.id === stockNumpadId ? { ...p, ...patch } : p));
          }}
        />
      )}

      {/* Edit Item Dialog */}
      {editItem && (
        <Dialog open={!!editItem} onOpenChange={(o) => { if (!o) setEditItem(null); }}>
          <AddItemDialog
            key={`edit-${editItem.id}`}
            ownerId={ownerIdForQuery}
            editProduct={editItem}
            onDone={() => { setEditItem(null); load(); }}
            onSaved={(updated) => {
              setItems((prev) => prev.map((p) => p.id === updated.id ? { ...p, ...updated } : p));
              setEditItem(null);
              // Open the stock numpad so the user can add new stock at the updated cost price
              setStockNumpadId(updated.id);
            }}
          />
        </Dialog>
      )}

      {/* Bulk Edit Modal */}
      {showBulkEdit && (
        <BulkEditModal
          items={items}
          ownerId={ownerIdForQuery}
          onClose={() => setShowBulkEdit(false)}
          onSaved={(patches) => {
            setItems((prev) => prev.map((p) => {
              const patch = patches.find((x) => x.id === p.id);
              return patch ? {
                ...p,
                stock_qty: patch.stock_qty,
                stock_last_expense_id: patch.stock_last_expense_id,
                ...(patch.cost_price !== undefined ? { cost_price: patch.cost_price } : {}),
                ...(patch.price !== undefined ? { price: patch.price } : {}),
              } : p;
            }));
          }}
        />
      )}
    </div>
  );
}

// ─── Add Item Dialog ──────────────────────────────────────────────────────────
function AddItemDialog({ onDone, onSaved, ownerId, editProduct }: { onDone: () => void; onSaved: (product: Product) => void; ownerId: string; editProduct?: Product | null }) {
  const { profile } = useAuth();
  const isEdit = !!editProduct;
  const [name, setName] = useState(editProduct?.name ?? "");
  const [price, setPrice] = useState(editProduct ? String(editProduct.price) : "");
  const [costPrice, setCostPrice] = useState(editProduct ? String(editProduct.cost_price ?? "") : "");
  const [category, setCategory] = useState<string>(editProduct?.category ?? "beers");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(editProduct?.image_url ?? null);
  const [templateUrl, setTemplateUrl] = useState<string | null>(editProduct?.image_url ?? null);
  const [busy, setBusy] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  // which field the numpad is for: "selling" | "cost" | null
  const [activeNumpad, setActiveNumpad] = useState<"selling" | "cost" | null>(null);
  // which category tab is active inside the template picker
  const [templateCat, setTemplateCat] = useState<string>("beers");
  const [templateSearch, setTemplateSearch] = useState("");
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
  };

  const clearImage = () => { setFile(null); setTemplateUrl(null); setPreview(null); };

  const handleNumpad = (k: string) => {
    const setter = activeNumpad === "cost" ? setCostPrice : setPrice;
    const current = activeNumpad === "cost" ? costPrice : price;
    if (k === "⌫") { setter(current.slice(0, -1)); return; }
    if (k === ".") { if (!current.includes(".")) setter(current + "."); return; }
    const dotIdx = current.indexOf(".");
    if (dotIdx !== -1 && current.length - dotIdx > 2) return;
    setter(current === "0" ? k : current + k);
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
    } else if (isEdit) {
      // keep the existing image if no new one was picked
      image_url = editProduct?.image_url ?? null;
    }

    const costVal = parseFloat(costPrice) || 0;

    if (isEdit && editProduct) {
      // ── UPDATE existing product ──────────────────────────────────────────
      // Only save the product details here — no expense record is created.
      // Expense records are only generated in the StockNumpad when new stock
      // is actually added, so only the newly purchased qty is multiplied by
      // the new cost price (not the existing stock already on hand).
      const { data: updated, error } = await supabase
        .from("products")
        .update({
          name: name.trim(),
          price: Number(price),
          cost_price: costVal,
          image_url,
          category,
        })
        .eq("id", editProduct.id)
        .select("*")
        .single();
      setBusy(false);
      if (error) { toast.error(error.message); return; }
      toast.success("Item updated");
      onDone();
      onSaved(updated);
    } else {
      // ── INSERT new product ───────────────────────────────────────────────
      const { data: inserted, error } = await supabase.from("products").insert({
        owner_id: ownerId, name: name.trim(), price: Number(price), cost_price: costVal, image_url, category,
      }).select("*").single();
      setBusy(false);
      if (error) { toast.error(error.message); return; }
      toast.success("Item added");
      setName(""); setPrice(""); setCostPrice(""); setCategory("beers"); setFile(null); setPreview(null); setTemplateUrl(null);
      onDone();
      onSaved(inserted);
    }
  };

  return (
    <DialogContent className="max-w-lg w-[calc(100vw-2rem)] max-h-[90dvh] flex flex-col p-4 gap-0">
      <DialogHeader className="shrink-0 pb-3">
        <div className="flex items-center gap-3">
          {showTemplates && (
            <button
              onClick={() => { setShowTemplates(false); }}
              className="h-8 w-8 rounded-full flex items-center justify-center bg-muted hover:bg-muted/80 transition shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <DialogTitle>{showTemplates ? "Choose Template" : isEdit ? "Edit Bar Item" : "Add Bar Item"}</DialogTitle>
        </div>
      </DialogHeader>

      <div className="flex-1 min-h-0 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
        {showTemplates ? (
          <div className="flex flex-col h-full">
            {/* Sticky search + category tabs */}
            <div className="sticky top-0 z-10 pb-2 space-y-2" style={{ background: "var(--background)", paddingTop: "1px" }}>
              {/* Search — real input, device keyboard */}
              <div className="flex items-center gap-2">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <input
                    type="text"
                    value={templateSearch}
                    onChange={(e) => setTemplateSearch(e.target.value)}
                    placeholder="Search templates…"
                    className="w-full pl-8 h-8 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                {templateSearch && (
                  <button
                    onClick={() => setTemplateSearch("")}
                    className="h-8 px-3 rounded-md text-xs font-black transition active:scale-95 shrink-0 border"
                    style={{ background: "#000", color: "#ef4444", borderColor: "#ef4444" }}
                  >
                    Clear
                  </button>
                )}
              </div>
              {/* Category tabs — no Misc since templates aren't available for that category */}
              <div className="grid grid-cols-5 gap-2">
                {CATEGORIES.filter((cat) => cat.value !== "miscellaneous").map((cat) => (
                  <button
                    key={cat.value}
                    onClick={() => setTemplateCat(cat.value)}
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
            <TemplatePicker
              onSelect={onTemplateSelect}
              ownerId={ownerId}
              category={templateCat}
              search={templateSearch}
            />
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

            {/* Category + Cost Price side by side */}
            <div className="flex gap-2">
              <div className="flex-1">
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
              <div className="flex-1">
                <Label className="text-xs">Cost Price</Label>
                <div
                  className="mt-1 h-9 rounded-lg border border-border bg-muted/30 flex items-center px-3 cursor-pointer active:bg-muted/50 transition"
                  onClick={() => setActiveNumpad(activeNumpad === "cost" ? null : "cost")}
                >
                  <span className={`text-base font-black ${activeNumpad === "cost" ? "text-primary" : "text-muted-foreground"}`}>
                    ${costPrice || "0.00"}
                  </span>
                </div>
              </div>
            </div>

            {/* Selling Price */}
            <div>
              <Label className="text-xs">Selling Price</Label>
              <div
                className="h-10 rounded-lg border border-border bg-muted/30 flex items-center px-3 mb-2 cursor-pointer active:bg-muted/50 transition"
                onClick={() => setActiveNumpad(activeNumpad === "selling" ? null : "selling")}
              >
                <span className={`text-lg font-black ${activeNumpad === "selling" ? "text-primary" : "text-muted-foreground"}`}>
                  ${price || "0.00"}
                </span>
              </div>
              {activeNumpad !== null && (
                <div className="space-y-1">
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
              )}
            </div>
          </div>
        )}
      </div>

      {!showTemplates && (
        <div className="pt-3">
          <Button
            onClick={submit}
            disabled={
              busy ||
              !name ||
              !price ||
              // Require cost price on new items, and on edits where cost price was never set (0 or null)
              (!isEdit && (!costPrice || parseFloat(costPrice) <= 0)) ||
              (isEdit && (editProduct?.cost_price ?? 0) === 0 && (!costPrice || parseFloat(costPrice) <= 0))
            }
            className="w-full font-bold h-11 shrink-0"
            style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Next →"}
          </Button>
        </div>
      )}
    </DialogContent>
  );
}
