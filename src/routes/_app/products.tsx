import { createFileRoute } from "@tanstack/react-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, Plus, Trash2, Loader2, LayoutGrid, ArrowLeft, X, Search, ChevronDown, ChevronLeft, Pencil, ListChecks, CheckCircle2 } from "lucide-react";
import { createPortal } from "react-dom";
import { useAuth } from "@/lib/auth";
import { useChain } from "@/lib/ChainContext";
import { useTranslation } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useImageCache } from "@/lib/useImageCache";
import { productImageUrl } from "@/lib/imageUrl";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { CATEGORIES, categoryIcon, categoryKey } from "@/lib/categories";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type BottleVariation = {
  key: string;
  label: string;
  units_consumed: number; // how many bottle-units this variation uses
  price: number;
};

type Product = {
  id: string;
  name: string;
  price: number;
  cost_price: number;
  units_per_item: number;
  bottle_variations: BottleVariation[] | null;
  image_url: string | null;
  category?: string;
  stock_qty: number;
  sort_order: number;
  stock_qty_undo: number | null;
  stock_qty_undo_saved: number | null;
  stock_last_expense_id: string | null;
};

// ─── Revert Stock Modal ───────────────────────────────────────────────────────
function RevertStockModal({
  productName,
  productId,
  ownerId,
  currentQty,
  costPrice,
  onClose,
  onSaved,
}: {
  productName: string;
  productId: string;
  ownerId: string;
  currentQty: number;
  costPrice: number;
  onClose: () => void;
  onSaved: (newQty: number) => void;
}) {
  const [inputVal, setInputVal] = useState("");
  const [busy, setBusy] = useState(false);

  const parsed   = parseInt(inputVal, 10);
  const removeQty = isNaN(parsed) ? 0 : Math.min(Math.max(parsed, 0), currentQty);
  const newQty    = currentQty - removeQty;
  const isValid   = !isNaN(parsed) && parsed > 0 && parsed <= currentQty;

  const NUMPAD_KEYS = ["1","2","3","4","5","6","7","8","9","","0","⌫"];

  const handleKey = (k: string) => {
    if (k === "⌫") { setInputVal((v) => v.slice(0, -1)); return; }
    const next = inputVal + k;
    const n = parseInt(next, 10);
    if (n > currentQty) return; // can't exceed current
    setInputVal(next);
  };

  const handleConfirm = async () => {
    if (!isValid) return;
    setBusy(true);

    const today = new Date().toISOString().split("T")[0];
    const refundAmount = costPrice * removeQty;

    // Insert a negative (refund) expense record if cost price is set
    if (costPrice > 0) {
      const { error: expErr } = await supabase.from("owner_expenses").insert({
        owner_id: ownerId,
        amount: -refundAmount,
        description: `Reverted Stock Expense\n${productName} ×${removeQty} reverted`,
        expense_date: today,
      });
      if (expErr) { toast.error(expErr.message); setBusy(false); return; }
    }

    // Update the product stock_qty only — don't touch undo fields
    const { error } = await supabase
      .from("products")
      .update({ stock_qty: newQty })
      .eq("id", productId);

    setBusy(false);
    if (error) { toast.error(error.message); return; }

    toast.success(`Reverted ${removeQty}× ${productName} — stock now ${newQty}`);
    onSaved(newQty);
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-t-3xl border border-border shadow-2xl overflow-hidden"
        style={{ background: "var(--gradient-card)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div>
            <span className="text-base font-black">Revert Stock</span>
            <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[220px]">{productName}</p>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-full flex items-center justify-center bg-muted hover:bg-muted/80 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Stats row */}
        <div className="mx-5 mb-4 grid grid-cols-3 gap-2">
          <div className="px-3 py-2 rounded-xl bg-muted/30 text-center">
            <div className="text-xs text-muted-foreground">Current</div>
            <div className="text-xl font-black">{currentQty}</div>
          </div>
          <div className="px-3 py-2 rounded-xl bg-muted/30 text-center border border-red-500/30">
            <div className="text-xs text-muted-foreground">Remove</div>
            <div className="text-xl font-black text-red-400">−{removeQty}</div>
          </div>
          <div className="px-3 py-2 rounded-xl bg-muted/30 text-center">
            <div className="text-xs text-muted-foreground">New Total</div>
            <div className="text-xl font-black text-green-400">{newQty}</div>
          </div>
        </div>

        {/* Display */}
        <div className="mx-5 mb-3 h-14 rounded-2xl flex items-center justify-center border border-border bg-background/60">
          {inputVal
            ? <span className="text-3xl font-black text-red-400">−{inputVal}</span>
            : <span className="text-base text-muted-foreground font-semibold">Enter qty to remove</span>
          }
        </div>

        {/* Info line */}
        <p className="text-center text-xs text-muted-foreground mb-3 px-5">
          Max removable: <span className="font-black text-foreground">{currentQty}</span>
          {costPrice > 0 && removeQty > 0 && (
            <> · Refund: <span className="font-black" style={{ color: "#86efac" }}>+${(costPrice * removeQty).toFixed(2)}</span></>
          )}
        </p>

        {/* Numpad */}
        <div className="px-5 pb-2">
          <div className="grid grid-cols-3 gap-2">
            {NUMPAD_KEYS.map((k, i) => (
              k === "" ? (
                <div key={i} />
              ) : (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleKey(k)}
                  className="h-14 rounded-2xl flex items-center justify-center font-black text-xl transition active:scale-95"
                  style={{
                    background: k === "⌫" ? "rgba(220,38,38,0.15)" : "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    color: k === "⌫" ? "#f87171" : "var(--foreground)",
                  }}
                >
                  {k === "⌫" ? "⌫" : k}
                </button>
              )
            ))}
          </div>
        </div>

        {/* Confirm button */}
        <div className="px-5 pb-6 pt-3">
          <button
            onClick={handleConfirm}
            disabled={busy || !isValid}
            className="w-full rounded-2xl font-black text-base text-white transition active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2 py-4"
            style={{ background: isValid ? "linear-gradient(135deg,#dc2626,#b91c1c)" : "rgba(220,38,38,0.3)" }}
          >
            {busy
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : `Revert ${removeQty > 0 ? removeQty + "×" : ""} → ${newQty} remaining`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Stock Qty Numberpad Modal ────────────────────────────────────────────────
// ── Stock button definitions ─────────────────────────────────────────────────
const STOCK_BTNS = [
  { qty: 30 }, { qty: 24 }, { qty: 12 },
  { qty: 10 }, { qty: 6  }, { qty: 1  },
];

function StockNumpad({ productId, productName, ownerId, currentQty, costPrice, stockQtyUndo, stockQtyUndoSaved, lastExpenseId, onClose, onBack, onSaved }: {
  productId: string;
  productName: string;
  ownerId: string;
  currentQty: number;
  costPrice: number;
  stockQtyUndo: number | null;
  stockQtyUndoSaved: number | null;
  lastExpenseId: string | null;
  onClose: () => void;
  onBack?: () => void;
  onSaved: (patch: Partial<Pick<Product, "stock_qty" | "stock_qty_undo" | "stock_qty_undo_saved" | "stock_last_expense_id">>) => void;
}) {
  const [counts, setCounts] = useState([0, 0, 0, 0, 0, 0]);
  const [busy, setBusy] = useState(false);
  const [revertOpen, setRevertOpen] = useState(false);
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
        <div className="relative flex items-center justify-center px-5 pt-5 pb-3">
          <button onClick={onBack ?? onClose} className="absolute left-5 flex items-center gap-1 text-sm font-bold text-muted-foreground hover:text-foreground transition">
            <ChevronLeft className="h-4 w-4" /> Back
          </button>
          <span className="text-base font-black">Add Stock</span>
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
          <div className="px-3 py-2 rounded-xl bg-muted/30 text-center relative">
            <div className="text-xs text-muted-foreground">Total</div>
            <div className="text-xl font-black text-green-400">{newTotal}</div>
            {/* Revert pencil — only active when nothing is being added */}
            <button
              type="button"
              disabled={addAmount !== 0 || currentQty === 0}
              onClick={() => setRevertOpen(true)}
              className="absolute -bottom-2 -right-2 h-7 w-7 rounded-full flex items-center justify-center shadow-lg transition active:scale-90 disabled:opacity-30"
              style={{ background: addAmount === 0 && currentQty > 0 ? "var(--gradient-hero)" : "rgba(255,255,255,0.08)" }}
              title="Revert stock quantity"
            >
              <Pencil className="h-3 w-3 text-black" />
            </button>
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

      {/* ── Revert Stock Modal ── */}
      {revertOpen && (
        <RevertStockModal
          productName={productName}
          productId={productId}
          ownerId={ownerId}
          currentQty={currentQty}
          costPrice={costPrice}
          onClose={() => setRevertOpen(false)}
          onSaved={(newQty) => {
            onSaved({ stock_qty: newQty });
            setRevertOpen(false);
          }}
        />
      )}
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
function TemplatePicker({ onSelect, onToggle, selectedUrls, ownerId, category, search }: {
  onSelect: (url: string, label: string, category: string) => void;
  onToggle?: (url: string, label: string, category: string) => void;
  selectedUrls?: Set<string>;
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

  // Multi-select mode when onToggle is provided
  const isMulti = !!onToggle;

  return (
    <div className="grid grid-cols-3 gap-2">
      {visible.map((t) => {
        const isSelected = selectedUrls?.has(t.url) ?? false;
        return (
          <button
            key={t.url}
            onClick={() => isMulti ? onToggle!(t.url, t.label, category) : onSelect(t.url, t.label, category)}
            onDragStart={(e) => e.preventDefault()}
            className="aspect-[3/4] relative rounded-xl overflow-hidden border-2 active:scale-95 transition touch-manipulation select-none"
            style={{
              background: "var(--gradient-card)",
              borderColor: isSelected ? "var(--primary)" : "rgba(255,255,255,0.1)",
              boxShadow: isSelected ? "0 0 0 2px var(--primary)" : "none",
            }}
          >
            <div className="absolute inset-0 flex items-center justify-center text-4xl">
              {categoryIcon(category)}
            </div>
            <img
              src={t.url}
              alt=""
              draggable={false}
              loading="lazy"
              decoding="async"
              className="absolute inset-0 w-full h-full object-contain pointer-events-none"
              onLoad={(e) => {
                const img = e.currentTarget as HTMLImageElement;
                const placeholder = img.previousElementSibling as HTMLElement | null;
                if (placeholder) placeholder.style.display = "none";
              }}
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
            />
            {/* Selected overlay */}
            {isSelected && (
              <div className="absolute inset-0 bg-primary/20 flex items-start justify-end p-1.5">
                <div className="h-6 w-6 rounded-full flex items-center justify-center shadow-lg" style={{ background: "var(--primary)" }}>
                  <CheckCircle2 className="h-4 w-4 text-black" />
                </div>
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/85 to-transparent pointer-events-none">
              <div className="text-white text-xs font-bold leading-tight line-clamp-2">{t.label}</div>
            </div>
          </button>
        );
      })}
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
  const { t } = useTranslation();
  // newQty keyed by product id — only items with a value > 0 will be processed
  const [newQtys, setNewQtys] = useState<Record<string, string>>({});
  // editable cost price and sell price — pre-seeded from items
  const [costPrices, setCostPrices] = useState<Record<string, string>>(() =>
    Object.fromEntries(items.map((p) => [p.id, String(p.cost_price ?? "")]))
  );
  const [sellPrices, setSellPrices] = useState<Record<string, string>>(() =>
    Object.fromEntries(items.map((p) => [p.id, String(p.price ?? "")]))
  );
  const [unitsPerItems, setUnitsPerItems] = useState<Record<string, string>>(() =>
    Object.fromEntries(items.map((p) => [p.id, p.units_per_item > 0 ? String(p.units_per_item) : ""]))
  );
  // Variation prices: keyed by `${productId}__${varKey}`
  const [varPrices, setVarPrices] = useState<Record<string, string>>(() => {
    const entries: [string, string][] = [];
    items.forEach((p) => {
      (p.bottle_variations ?? []).forEach((v) => {
        entries.push([`${p.id}__${v.key}`, String(v.price ?? "")]);
      });
    });
    return Object.fromEntries(entries);
  });
  const [busy, setBusy] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  // id + field for active numpad in the table
  const [activeNumpad, setActiveNumpad] = useState<{ id: string; field: "cp" | "sp" | "qty" | "units" | "vp" | "vu" | "rp" | "sq" | "spp" } | null>(null);
  // Product id whose qty is being reverted via the pencil
  const [revertItem, setRevertItem] = useState<Product | null>(null);
  // Live qty map so pencil shows updated qty after a revert without needing parent reload
  const [liveQtys, setLiveQtys] = useState<Record<string, number>>(() =>
    Object.fromEntries(items.map((p) => [p.id, p.stock_qty ?? 0]))
  );
  // Draft variations added inline in the table (keyed by product id)
  const [localVars, setLocalVars] = useState<Record<string, BottleVariation[]>>({});
  // Cigarette retail price per cig (keyed by product id)
  const [cigRetailPrices, setCigRetailPrices] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    items.forEach((p) => {
      if (p.category === "cigarettes") {
        const rv = (p.bottle_variations ?? []).find((v) => v.key === "retail");
        if (rv) init[p.id] = String(rv.price);
      }
    });
    return init;
  });
  // Cigarette special offers — array of rows per product id
  // Each row is { qty: string; price: string }. At least one empty row is always kept.
  const [cigSpecialData, setCigSpecialData] = useState<Record<string, { qty: string; price: string }[]>>(() => {
    const init: Record<string, { qty: string; price: string }[]> = {};
    items.forEach((p) => {
      if (p.category === "cigarettes") {
        // Collect all special* variations (key starts with "special")
        const specials = (p.bottle_variations ?? []).filter((v) => v.key === "special" || v.key.startsWith("special_"));
        init[p.id] = specials.length > 0
          ? specials.map((sv) => ({ qty: String(sv.units_consumed), price: String(sv.price) }))
          : [{ qty: "", price: "" }];
      }
    });
    return init;
  });

  const handleNumpad = (k: string) => {
    if (!activeNumpad) return;
    const { id, field } = activeNumpad;
    const isDecimal = field === "cp" || field === "sp" || field === "vp" || field === "rp" || field === "spp";

    // ── "vu" = variation units (integer), id = "${productId}__${varIdx}" ──
    if (field === "vu") {
      const [productId, varIdxStr] = id.split("__varIdx__");
      const varIdx = parseInt(varIdxStr, 10);
      if (isNaN(varIdx)) return;
      setLocalVars((prev) => {
        const arr = [...(prev[productId] ?? [])];
        if (!arr[varIdx]) return prev;
        const cur = String(arr[varIdx].units_consumed || "");
        let next: string;
        if (k === "⌫") { next = cur.slice(0, -1); }
        else if (k === ".") { return prev; } // integer only
        else { next = cur === "0" ? k : cur + k; }
        arr[varIdx] = { ...arr[varIdx], units_consumed: parseInt(next) || 0 };
        return { ...prev, [productId]: arr };
      });
      return;
    }

    // ── "rp" = cig retail price per cig ──
    if (field === "rp") {
      const cur = cigRetailPrices[id] ?? "";
      let next: string;
      if (k === "⌫") { next = cur.slice(0, -1); }
      else if (k === ".") { next = cur.includes(".") ? cur : cur + "."; }
      else { const di = cur.indexOf("."); if (di !== -1 && cur.length - di > 2) return; next = cur === "0" ? k : cur + k; }
      setCigRetailPrices((p) => ({ ...p, [id]: next }));
      return;
    }
    // ── "sq" = cig special qty (integer), id = "${productId}__specIdx__${idx}" ──
    if (field === "sq") {
      const sepIdx = id.lastIndexOf("__specIdx__");
      const productId = sepIdx !== -1 ? id.slice(0, sepIdx) : id;
      const specIdx = sepIdx !== -1 ? parseInt(id.slice(sepIdx + 11), 10) : 0;
      const rows = cigSpecialData[productId] ?? [{ qty: "", price: "" }];
      const cur = rows[specIdx]?.qty ?? "";
      let next: string;
      if (k === "⌫") { next = cur.slice(0, -1); }
      else if (k === ".") { return; }
      else { next = cur === "0" ? k : cur + k; }
      setCigSpecialData((prev) => {
        const arr = [...(prev[productId] ?? [{ qty: "", price: "" }])];
        arr[specIdx] = { ...arr[specIdx], qty: next };
        return { ...prev, [productId]: arr };
      });
      return;
    }
    // ── "spp" = cig special price, id = "${productId}__specIdx__${idx}" ──
    if (field === "spp") {
      const sepIdx = id.lastIndexOf("__specIdx__");
      const productId = sepIdx !== -1 ? id.slice(0, sepIdx) : id;
      const specIdx = sepIdx !== -1 ? parseInt(id.slice(sepIdx + 11), 10) : 0;
      const rows = cigSpecialData[productId] ?? [{ qty: "", price: "" }];
      const cur = rows[specIdx]?.price ?? "";
      let next: string;
      if (k === "⌫") { next = cur.slice(0, -1); }
      else if (k === ".") { next = cur.includes(".") ? cur : cur + "."; }
      else { const di = cur.indexOf("."); if (di !== -1 && cur.length - di > 2) return; next = cur === "0" ? k : cur + k; }
      setCigSpecialData((prev) => {
        const arr = [...(prev[productId] ?? [{ qty: "", price: "" }])];
        arr[specIdx] = { ...arr[specIdx], price: next };
        return { ...prev, [productId]: arr };
      });
      return;
    }

    const current = field === "cp" ? (costPrices[id] ?? "") : field === "sp" ? (sellPrices[id] ?? "") : field === "units" ? (unitsPerItems[id] ?? "") : field === "vp" ? (varPrices[id] ?? "") : (newQtys[id] ?? "");
    const setter = field === "cp"
      ? (v: string) => setCostPrices((p) => ({ ...p, [id]: v }))
      : field === "sp"
      ? (v: string) => setSellPrices((p) => ({ ...p, [id]: v }))
      : field === "units"
      ? (v: string) => setUnitsPerItems((p) => ({ ...p, [id]: v }))
      : field === "vp"
      ? (v: string) => setVarPrices((p) => ({ ...p, [id]: v }))
      : (v: string) => setNewQtys((p) => ({ ...p, [id]: v }));
    if (k === "⌫") { setter(current.slice(0, -1)); return; }
    if (k === ".") { if (isDecimal && !current.includes(".")) setter(current + "."); return; }
    if (!isDecimal && k === ".") return; // no decimals for qty/units
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
    if (!isNaN(v) && v > 0) return false;
    const newCp = parseFloat(costPrices[p.id] ?? "");
    const newSp = parseFloat(sellPrices[p.id] ?? "");
    const newUnits = parseInt(unitsPerItems[p.id] ?? "", 10);
    const cpChanged = !isNaN(newCp) && newCp !== Number(p.cost_price ?? 0);
    const spChanged = !isNaN(newSp) && newSp !== Number(p.price ?? 0);
    const unitsChanged = !isNaN(newUnits) && newUnits !== Number(p.units_per_item ?? 0);
    const varChanged = (p.bottle_variations ?? []).some((bv) => {
      const nv = parseFloat(varPrices[`${p.id}__${bv.key}`] ?? "");
      return !isNaN(nv) && nv !== Number(bv.price ?? 0);
    });
    const hasNewLocalVars = (localVars[p.id] ?? []).some((lv, idx) => {
      const price = parseFloat(varPrices[`${p.id}__localVar__${idx}`] ?? "") || lv.price;
      return lv.units_consumed > 0 && price > 0;
    });
    // Cig retail price change
    const existRetail = (p.bottle_variations ?? []).find((bv) => bv.key === "retail");
    const newRetail = parseFloat(cigRetailPrices[p.id] ?? "");
    const retailChanged = p.category === "cigarettes" && !isNaN(newRetail) && newRetail !== Number(existRetail?.price ?? 0);
    // Cig specials change — compare each row in cigSpecialData array against existing special* variations
    const specialChanged = p.category === "cigarettes" && (() => {
      const rows = cigSpecialData[p.id] ?? [];
      const existSpecials = (p.bottle_variations ?? []).filter((bv) => bv.key === "special" || bv.key.startsWith("special_"));
      if (rows.length !== existSpecials.length) return true;
      return rows.some((row, i) => {
        const sq = parseInt(row.qty, 10);
        const sp = parseFloat(row.price);
        const ex = existSpecials[i];
        return (!isNaN(sq) && sq !== Number(ex?.units_consumed ?? 0)) ||
               (!isNaN(sp) && sp !== Number(ex?.price ?? 0));
      });
    })();
    return cpChanged || spChanged || unitsChanged || varChanged || hasNewLocalVars || retailChanged || specialChanged;
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
    const patches: { id: string; stock_qty: number; stock_last_expense_id: string | null; cost_price?: number; price?: number; units_per_item?: number }[] = [];
    for (const p of updates) {
      const addQty = parseInt(newQtys[p.id], 10);
      const newTotal = (p.stock_qty ?? 0) + addQty;
      const newCp = parseFloat(costPrices[p.id] ?? "");
      const newSp = parseFloat(sellPrices[p.id] ?? "");
      const newUnits = parseInt(unitsPerItems[p.id] ?? "", 10);
      const cpChanged = !isNaN(newCp) && newCp !== Number(p.cost_price ?? 0);
      const spChanged = !isNaN(newSp) && newSp !== Number(p.price ?? 0);
      const unitsChanged = !isNaN(newUnits) && newUnits !== Number(p.units_per_item ?? 0);
      const { error } = await supabase
        .from("products")
        .update({
          stock_qty: newTotal,
          stock_qty_undo: p.stock_qty ?? 0,
          stock_qty_undo_saved: newTotal,
          stock_last_expense_id: expenseId,
          ...(cpChanged ? { cost_price: newCp } : {}),
          ...(spChanged ? { price: newSp } : {}),
          ...(unitsChanged ? { units_per_item: newUnits } : {}),
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
          ...(unitsChanged ? { units_per_item: newUnits } : {}),
        });
      }
    }

    // Also save price-only changes for items where no qty was added
    for (const p of items.filter((p) => !updates.includes(p))) {
      const newCp = parseFloat(costPrices[p.id] ?? "");
      const newSp = parseFloat(sellPrices[p.id] ?? "");
      const newUnits = parseInt(unitsPerItems[p.id] ?? "", 10);
      const cpChanged = !isNaN(newCp) && newCp !== Number(p.cost_price ?? 0);
      const spChanged = !isNaN(newSp) && newSp !== Number(p.price ?? 0);
      const unitsChanged = !isNaN(newUnits) && newUnits !== Number(p.units_per_item ?? 0);
      // Check variation price changes
      const varUpdates = (p.bottle_variations ?? []).map((bv) => {
        const nv = parseFloat(varPrices[`${p.id}__${bv.key}`] ?? "");
        const priceChanged = !isNaN(nv) && nv !== Number(bv.price ?? 0);
        const newPrice = priceChanged ? nv : bv.price;
        // Regenerate the label for "special" variations so "3 for $5" stays in sync
        const newLabel = bv.key === "special" && priceChanged
          ? `${bv.units_consumed} for $${newPrice.toFixed(2)}`
          : bv.label;
        return { ...bv, price: newPrice, label: newLabel, changed: priceChanged };
      });
      const anyVarChanged = varUpdates.some((v) => v.changed);
      // Merge new local variations — resolve price from varPrices (numpad stores it there)
      const newLocalVars = (localVars[p.id] ?? [])
        .map((lv, idx) => ({
          ...lv,
          price: parseFloat(varPrices[`${p.id}__localVar__${idx}`] ?? "") || lv.price,
        }))
        .filter((lv) => lv.units_consumed > 0 && lv.price > 0);
      const hasNewLocalVars = newLocalVars.length > 0;
      // Cig retail / special changes
      let cigVarsChanged = false;
      let cigVarsMerged: BottleVariation[] | undefined;
      if (p.category === "cigarettes") {
        const newRetail = parseFloat(cigRetailPrices[p.id] ?? "");
        const existRetail  = (p.bottle_variations ?? []).find((bv) => bv.key === "retail");
        const existSpecials = (p.bottle_variations ?? []).filter((bv) => bv.key === "special" || bv.key.startsWith("special_"));
        const retailChanged = !isNaN(newRetail) && newRetail !== Number(existRetail?.price ?? 0);
        const rows = cigSpecialData[p.id] ?? [];
        const specialEntries: BottleVariation[] = rows
          .map((row, i) => {
            const sq = parseInt(row.qty, 10);
            const sp = parseFloat(row.price);
            if (sq > 0 && sp > 0) {
              const key = i === 0 ? "special" : `special_${i}`;
              return { key, label: `${sq} for $${sp.toFixed(2)}`, units_consumed: sq, price: sp } as BottleVariation;
            }
            return null;
          })
          .filter((e): e is BottleVariation => e !== null);
        const specialChanged = rows.length !== existSpecials.length ||
          rows.some((row, i) => {
            const sq = parseInt(row.qty, 10);
            const sp = parseFloat(row.price);
            return (!isNaN(sq) && sq !== Number(existSpecials[i]?.units_consumed ?? 0)) ||
                   (!isNaN(sp) && sp !== Number(existSpecials[i]?.price ?? 0));
          });
        if (retailChanged || specialChanged) {
          cigVarsChanged = true;
          const retailEntry: BottleVariation | null = (!isNaN(newRetail) && newRetail > 0)
            ? { key: "retail", label: "Retail", units_consumed: 1, price: newRetail }
            : existRetail ?? null;
          cigVarsMerged = [
            ...(retailEntry ? [retailEntry] : []),
            ...specialEntries,
          ];
        }
      }
      if (!cpChanged && !spChanged && !unitsChanged && !anyVarChanged && !hasNewLocalVars && !cigVarsChanged) continue;
      const mergedVars = anyVarChanged || hasNewLocalVars
        ? [...varUpdates.map(({ changed: _c, ...rest }) => rest), ...newLocalVars]
        : cigVarsMerged;
      const updatePayload: Record<string, unknown> = {};
      if (cpChanged) updatePayload.cost_price = newCp;
      if (spChanged) updatePayload.price = newSp;
      if (unitsChanged) updatePayload.units_per_item = newUnits;
      if (mergedVars) updatePayload.bottle_variations = mergedVars;
      const { error } = await (supabase as any).from("products").update(updatePayload).eq("id", p.id);
      if (!error) {
        patches.push({
          id: p.id,
          stock_qty: p.stock_qty,
          stock_last_expense_id: p.stock_last_expense_id,
          ...(cpChanged ? { cost_price: newCp } : {}),
          ...(spChanged ? { price: newSp } : {}),
          ...(unitsChanged ? { units_per_item: newUnits } : {}),
        });
      }
    }
    // Save variation price changes (+ new local vars) for items that DID have qty updates too
    for (const p of updates) {
      const varUpdates = (p.bottle_variations ?? []).map((bv) => {
        const nv = parseFloat(varPrices[`${p.id}__${bv.key}`] ?? "");
        const priceChanged = !isNaN(nv) && nv !== Number(bv.price ?? 0);
        const newPrice = priceChanged ? nv : bv.price;
        const newLabel = bv.key === "special" && priceChanged
          ? `${bv.units_consumed} for $${newPrice.toFixed(2)}`
          : bv.label;
        return { ...bv, price: newPrice, label: newLabel, changed: priceChanged };
      });
      const newLocalVars = (localVars[p.id] ?? [])
        .map((lv, idx) => ({
          ...lv,
          price: parseFloat(varPrices[`${p.id}__localVar__${idx}`] ?? "") || lv.price,
        }))
        .filter((lv) => lv.units_consumed > 0 && lv.price > 0);
      // Cig retail / special changes for items that also had qty updates
      let cigMerged: BottleVariation[] | null = null;
      if (p.category === "cigarettes") {
        const newRetail = parseFloat(cigRetailPrices[p.id] ?? "");
        const existRetail  = (p.bottle_variations ?? []).find((bv) => bv.key === "retail");
        const existSpecials = (p.bottle_variations ?? []).filter((bv) => bv.key === "special" || bv.key.startsWith("special_"));
        const retailChanged = !isNaN(newRetail) && newRetail !== Number(existRetail?.price ?? 0);
        const rows = cigSpecialData[p.id] ?? [];
        const specialEntries: BottleVariation[] = rows
          .map((row, i) => {
            const sq = parseInt(row.qty, 10);
            const sp = parseFloat(row.price);
            if (sq > 0 && sp > 0) {
              const key = i === 0 ? "special" : `special_${i}`;
              return { key, label: `${sq} for $${sp.toFixed(2)}`, units_consumed: sq, price: sp } as BottleVariation;
            }
            return null;
          })
          .filter((e): e is BottleVariation => e !== null);
        const specialChanged = rows.length !== existSpecials.length ||
          rows.some((row, i) => {
            const sq = parseInt(row.qty, 10);
            const sp = parseFloat(row.price);
            return (!isNaN(sq) && sq !== Number(existSpecials[i]?.units_consumed ?? 0)) ||
                   (!isNaN(sp) && sp !== Number(existSpecials[i]?.price ?? 0));
          });
        if (retailChanged || specialChanged) {
          const retailEntry: BottleVariation | null = (!isNaN(newRetail) && newRetail > 0)
            ? { key: "retail", label: "Retail", units_consumed: 1, price: newRetail }
            : existRetail ?? null;
          cigMerged = [
            ...(retailEntry ? [retailEntry] : []),
            ...specialEntries,
          ];
        }
      }
      if (!varUpdates.some((v) => v.changed) && newLocalVars.length === 0 && !cigMerged) continue;
      const merged = cigMerged
        ? cigMerged
        : [...varUpdates.map(({ changed: _c, ...rest }) => rest), ...newLocalVars];
      await supabase.from("products").update({ bottle_variations: merged }).eq("id", p.id);
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
        <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-background border-b border-border">
              <tr>
                <th className="text-left pl-3 pr-2 py-2 font-black text-xs text-muted-foreground w-10 sm:w-14"></th>
                <th className="text-left px-2 py-2 font-black text-xs text-muted-foreground">Name</th>
                <th className="text-right px-2 py-2 font-black text-xs text-muted-foreground w-[76px] sm:w-[96px]">Cost</th>
                <th className="text-right px-2 py-2 font-black text-xs text-muted-foreground w-[76px] sm:w-[96px]">Sell</th>
                <th className="text-right px-2 py-2 font-black text-xs text-muted-foreground w-[56px] leading-tight">Drink/<br/>Retail</th>
                <th className="text-right px-2 py-2 font-black text-xs text-muted-foreground w-[46px] sm:w-[60px]">Qty</th>
                <th className="text-right pr-4 pl-2 py-2 font-black text-xs w-[76px] sm:w-[96px]" style={{ color: "var(--primary)" }}>+ Add</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map(({ cat, products }) => (
                <>
                  {/* Category section header */}
                  <tr key={`hdr-${cat.value}`}>
                    <td colSpan={7} className="pl-3 pt-4 pb-1">
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
                    const unitsVal = unitsPerItems[p.id] ?? "";
                    const isBottleOrPack = p.category === "liquor" || p.category === "cigarettes";
                    const cpIsZero = hasAdd && (parseFloat(cpVal) || 0) === 0;
                    const spIsZero = hasAdd && (parseFloat(spVal) || 0) === 0;
                    return (
                      <React.Fragment key={p.id}>
                      <tr
                        className="border-t border-border/40 transition"
                        style={hasAdd ? { background: "rgba(251,146,60,0.07)" } : {}}
                      >
                        {/* Thumbnail */}
                        <td className="pl-3 pr-2 py-1.5 w-10 sm:w-14">
                          <div className="h-8 w-8 sm:h-12 sm:w-12 rounded-lg overflow-hidden border border-border shrink-0 flex items-center justify-center text-base sm:text-xl" style={{ background: "var(--gradient-card)" }}>
                            {p.image_url
                    ? <img src={productImageUrl(p.image_url)!} alt="" className="h-full w-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
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
                        {/* Units per item — editable for liquor/cigarettes, dash otherwise */}
                        <td className="px-2 py-1.5 w-[56px]">
                          {isBottleOrPack ? (
                            <div
                              onClick={() => setActiveNumpad(activeNumpad?.id === p.id && activeNumpad.field === "units" ? null : { id: p.id, field: "units" })}
                              className="h-8 sm:h-11 rounded-lg border text-right pr-2 text-xs sm:text-sm font-black bg-muted/50 flex items-center justify-end cursor-pointer active:bg-muted/70 transition"
                              style={{ borderColor: activeNumpad?.id === p.id && activeNumpad.field === "units" ? "var(--primary)" : "var(--border)", color: "var(--muted-foreground)" }}
                            >
                              {unitsVal || "0"}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground flex justify-end pr-2">—</span>
                          )}
                        </td>
                        {/* Current qty — read only, with revert pencil */}
                        <td className="px-2 py-1.5 text-right w-[46px] sm:w-[60px]">
                          <div className="flex items-center justify-end gap-1">
                            <span className={`font-black text-xs sm:text-sm ${(liveQtys[p.id] ?? 0) === 0 ? "text-red-400" : (liveQtys[p.id] ?? 0) <= 5 ? "text-yellow-400" : "text-green-400"}`}>
                              {liveQtys[p.id] ?? 0}
                            </span>
                            {/* Pencil — revert existing qty (reduce only) */}
                            <button
                              type="button"
                              disabled={(liveQtys[p.id] ?? 0) === 0}
                              onClick={() => setRevertItem({ ...p, stock_qty: liveQtys[p.id] ?? p.stock_qty })}
                              className="h-5 w-5 rounded-full flex items-center justify-center flex-shrink-0 transition active:scale-90 disabled:opacity-25"
                              style={{ background: (liveQtys[p.id] ?? 0) > 0 ? "var(--gradient-hero)" : "rgba(255,255,255,0.06)" }}
                              title="Edit (reduce) existing qty"
                            >
                              <Pencil className="h-2.5 w-2.5 text-black" />
                            </button>
                          </div>
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
                      {/* Existing variation rows — price editable */}
                      {(p.bottle_variations ?? []).map((bv) => {
                        const varKey = `${p.id}__${bv.key}`;
                        const vPrice = varPrices[varKey] ?? "";
                        const isActive = activeNumpad?.id === varKey && activeNumpad.field === "vp";
                        return (
                          <tr key={varKey} className="border-t border-border/20" style={{ background: "rgba(255,255,255,0.02)" }}>
                            <td className="pl-3 pr-2 py-1" />
                            <td className="px-2 py-1">
                              <span className="text-[10px] font-semibold text-muted-foreground pl-3">↳ {bv.key === "shot" ? "Drink" : bv.label}</span>
                              <span className="text-[9px] text-muted-foreground/50 ml-1">({bv.units_consumed}u)</span>
                            </td>
                            <td className="px-2 py-1" colSpan={2}>
                              <div
                                onClick={() => setActiveNumpad(isActive ? null : { id: varKey, field: "vp" })}
                                className="h-7 rounded-lg border text-right pr-2 text-xs font-black bg-muted/50 flex items-center justify-end cursor-pointer active:bg-muted/70 transition"
                                style={{ borderColor: isActive ? "var(--primary)" : "var(--border)", color: "var(--foreground)" }}
                              >
                                {vPrice || "0.00"}
                              </div>
                            </td>
                            <td colSpan={3} />
                          </tr>
                        );
                      })}

                      {/* Local draft variation rows (newly added) */}
                      {p.category === "liquor" && (localVars[p.id] ?? []).map((lv, lvIdx) => {
                        const vuKey = `${p.id}__varIdx__${lvIdx}`;
                        const vpKey = `${p.id}__localVar__${lvIdx}`;
                        const isVuActive = activeNumpad?.id === vuKey && activeNumpad.field === "vu";
                        const isVpActive = activeNumpad?.id === vpKey && activeNumpad.field === "vp";
                        const vpVal = varPrices[vpKey] ?? "";
                        return (
                          <tr key={vuKey} className="border-t border-border/20" style={{ background: "rgba(251,146,60,0.04)" }}>
                            <td className="pl-3 pr-1 py-1">
                              {/* remove button */}
                              <button
                                type="button"
                                onClick={() => setLocalVars((prev) => {
                                  const arr = (prev[p.id] ?? []).filter((_, i) => i !== lvIdx);
                                  return { ...prev, [p.id]: arr };
                                })}
                                className="h-5 w-5 rounded-full flex items-center justify-center"
                                style={{ background: "rgba(220,38,38,0.25)", color: "#f87171" }}
                              >
                                <X className="h-2.5 w-2.5" />
                              </button>
                            </td>
                            {/* Label editable via native input */}
                            <td className="px-1 py-1">
                              <input
                                type="text"
                                value={lv.label}
                                onChange={(e) => setLocalVars((prev) => {
                                  const arr = [...(prev[p.id] ?? [])];
                                  arr[lvIdx] = { ...arr[lvIdx], label: e.target.value };
                                  return { ...prev, [p.id]: arr };
                                })}
                                placeholder="Label"
                                className="w-full h-7 rounded-md border border-border bg-muted/40 px-2 text-[10px] font-bold outline-none focus:ring-1 focus:ring-primary"
                              />
                            </td>
                            {/* Units used — numpad */}
                            <td className="px-1 py-1">
                              <div
                                onClick={() => setActiveNumpad(isVuActive ? null : { id: vuKey, field: "vu" })}
                                className="h-7 rounded-lg border text-right pr-2 text-xs font-black bg-muted/50 flex items-center justify-end cursor-pointer active:bg-muted/70 transition"
                                style={{ borderColor: isVuActive ? "var(--primary)" : "var(--border)", color: "var(--muted-foreground)" }}
                                title="Drinks used from bottle"
                              >
                                {lv.units_consumed || "0"}
                              </div>
                            </td>
                            {/* Price — numpad */}
                            <td className="px-1 py-1">
                              <div
                                onClick={() => setActiveNumpad(isVpActive ? null : { id: vpKey, field: "vp" })}
                                className="h-7 rounded-lg border text-right pr-2 text-xs font-black bg-muted/50 flex items-center justify-end cursor-pointer active:bg-muted/70 transition"
                                style={{ borderColor: isVpActive ? "var(--primary)" : "var(--border)", color: "var(--foreground)" }}
                                title="Drink price"
                              >
                                {vpVal || "0.00"}
                              </div>
                            </td>
                            <td colSpan={3} />
                          </tr>
                        );
                      })}

                      {/* Add Variation row — liquor only */}
                      {p.category === "liquor" && (
                        <tr className="border-t border-border/10">
                          <td colSpan={7} className="pl-8 py-1.5">
                            <button
                              type="button"
                              onClick={() => setLocalVars((prev) => {
                                const existing = prev[p.id] ?? [];
                                // Default: Drink / shot with 18 drinks used
                                const isFirst = (p.bottle_variations ?? []).length === 0 && existing.length === 0;
                                const newVar: BottleVariation = isFirst
                                  ? { key: "shot", label: "Drink", units_consumed: 18, price: 0 }
                                  : { key: `var_${Date.now()}`, label: "", units_consumed: 1, price: 0 };
                                return { ...prev, [p.id]: [...existing, newVar] };
                              })}
                              className="flex items-center gap-1 text-[10px] font-black transition active:scale-95"
                              style={{ color: "var(--primary)" }}
                            >
                              <span className="h-4 w-4 rounded-full flex items-center justify-center text-black text-[10px] font-black" style={{ background: "var(--gradient-hero)" }}>+</span>
                              Add Variation
                            </button>
                          </td>
                        </tr>
                      )}

                      {/* ── Cigarettes: Retail price row + Special rows ── */}
                      {p.category === "cigarettes" && (() => {
                        const rpVal = cigRetailPrices[p.id] ?? "";
                        const isRpActive = activeNumpad?.id === p.id && activeNumpad.field === "rp";
                        const specials = cigSpecialData[p.id] ?? [{ qty: "", price: "" }];
                        return (
                          <>
                          {/* Retail price per cig */}
                          <tr className="border-t border-border/20" style={{ background: "rgba(255,255,255,0.02)" }}>
                            <td className="pl-3 pr-2 py-1" />
                            <td className="px-2 py-1">
                              <span className="text-[10px] font-semibold text-muted-foreground pl-3">↳ Retail / cig</span>
                            </td>
                            <td className="px-2 py-1" colSpan={2}>
                              <div
                                onClick={() => setActiveNumpad(isRpActive ? null : { id: p.id, field: "rp" })}
                                className="h-7 rounded-lg border text-right pr-2 text-xs font-black bg-muted/50 flex items-center justify-end cursor-pointer active:bg-muted/70 transition"
                                style={{ borderColor: isRpActive ? "var(--primary)" : "var(--border)", color: "var(--foreground)" }}
                              >
                                {rpVal || "0.00"}
                              </div>
                            </td>
                            <td colSpan={3} />
                          </tr>

                          {/* Special rows — one per entry in cigSpecialData[p.id] */}
                          {specials.map((sd, specIdx) => {
                            const rowId = `${p.id}__specIdx__${specIdx}`;
                            const isSqActive  = activeNumpad?.id === rowId && activeNumpad.field === "sq";
                            const isSppActive = activeNumpad?.id === rowId && activeNumpad.field === "spp";
                            return (
                              <tr key={rowId} className="border-t border-border/20" style={{ background: "rgba(251,146,60,0.04)" }}>
                                <td className="pl-2 pr-1 py-1">
                                  {specials.length > 1 && (
                                    <button
                                      type="button"
                                      onClick={() => setCigSpecialData((prev) => {
                                        const arr = (prev[p.id] ?? []).filter((_, i) => i !== specIdx);
                                        return { ...prev, [p.id]: arr.length > 0 ? arr : [{ qty: "", price: "" }] };
                                      })}
                                      className="h-5 w-5 rounded-full flex items-center justify-center"
                                      style={{ background: "rgba(220,38,38,0.25)", color: "#f87171" }}
                                    >
                                      <X className="h-2.5 w-2.5" />
                                    </button>
                                  )}
                                </td>
                                <td className="px-2 py-1">
                                  <span className="text-[10px] font-semibold pl-3" style={{ color: "var(--primary)" }}>
                                    ↳ Special {specials.length > 1 ? specIdx + 1 : ""}
                                  </span>
                                </td>
                                {/* Qty */}
                                <td className="px-2 py-1">
                                  <div
                                    onClick={() => setActiveNumpad(isSqActive ? null : { id: rowId, field: "sq" })}
                                    className="h-7 rounded-lg border pr-2 text-xs font-black bg-muted/50 flex items-center cursor-pointer active:bg-muted/70 transition"
                                    style={{ borderColor: isSqActive ? "var(--primary)" : "var(--border)" }}
                                    title="Qty in bundle"
                                  >
                                    <span className="pl-2 text-muted-foreground/60 font-semibold shrink-0">qty:</span>
                                    <span className="flex-1 text-right" style={{ color: "var(--muted-foreground)" }}>{sd.qty || "0"}</span>
                                  </div>
                                </td>
                                {/* Price */}
                                <td className="px-2 py-1">
                                  <div
                                    onClick={() => setActiveNumpad(isSppActive ? null : { id: rowId, field: "spp" })}
                                    className="h-7 rounded-lg border text-right pr-2 text-xs font-black bg-muted/50 flex items-center justify-end cursor-pointer active:bg-muted/70 transition"
                                    style={{ borderColor: isSppActive ? "var(--primary)" : "var(--border)", color: "var(--foreground)" }}
                                    title="Bundle price"
                                  >
                                    {sd.price || "0.00"}
                                  </div>
                                </td>
                                <td colSpan={3} />
                              </tr>
                            );
                          })}

                          {/* + Add Variation — appends another special row */}
                          <tr className="border-t border-border/10">
                            <td colSpan={7} className="pl-8 py-1.5">
                              <button
                                type="button"
                                onClick={() => setCigSpecialData((prev) => {
                                  const arr = prev[p.id] ?? [{ qty: "", price: "" }];
                                  return { ...prev, [p.id]: [...arr, { qty: "", price: "" }] };
                                })}
                                className="flex items-center gap-1 text-[10px] font-black transition active:scale-95"
                                style={{ color: "var(--primary)" }}
                              >
                                <span className="h-4 w-4 rounded-full flex items-center justify-center text-black text-[10px] font-black" style={{ background: "var(--gradient-hero)" }}>+</span>
                                Add Special
                              </button>
                            </td>
                          </tr>
                          </>
                        );
                      })()}
                      </React.Fragment>
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
                {activeNumpad.field === "cp" ? t("numpad_cost", "Cost Price") : activeNumpad.field === "sp" ? t("numpad_sell", "Sell Price") : activeNumpad.field === "units" ? t("numpad_units", "Units per Item") : activeNumpad.field === "vp" ? t("numpad_var_price", "Variation Price") : activeNumpad.field === "vu" ? t("numpad_drinks_used", "Drinks Used") : t("numpad_add_qty", "Add Qty")}
              </span>
              <button onClick={() => setActiveNumpad(null)}
                className="h-10 px-5 rounded-xl font-black text-sm flex items-center gap-2 active:scale-95 transition"
                style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}>
                Done ✓
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {["1","2","3","4","5","6","7","8","9", (activeNumpad.field !== "qty" && activeNumpad.field !== "vu") ? "." : "", "0","⌫"].map((k, i) => (
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
                    ? <img src={productImageUrl(p.image_url)!} alt="" className="h-full w-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
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
                  {/* Cig retail price change */}
                  {p.category === "cigarettes" && (() => {
                    const nr = parseFloat(cigRetailPrices[p.id] ?? "");
                    const er = (p.bottle_variations ?? []).find((bv) => bv.key === "retail");
                    if (!isNaN(nr) && nr !== Number(er?.price ?? 0)) {
                      return (
                        <div className="text-xs text-muted-foreground">
                          Retail/cig: <span className="line-through">${Number(er?.price ?? 0).toFixed(2)}</span>
                          <span className="text-yellow-400 font-black ml-1"> → ${nr.toFixed(2)}</span>
                        </div>
                      );
                    }
                    return null;
                  })()}
                  {/* Cig special change */}
                  {p.category === "cigarettes" && (() => {
                    const sq = parseInt(cigSpecialData[p.id]?.[0]?.qty ?? "", 10);
                    const spr = parseFloat(cigSpecialData[p.id]?.[0]?.price ?? "");
                    if (!isNaN(sq) && sq > 0 && !isNaN(spr) && spr > 0) {
                      return (
                        <div className="text-xs font-bold" style={{ color: "var(--primary)" }}>
                          Special: {sq} for ${spr.toFixed(2)}
                        </div>
                      );
                    }
                    return null;
                  })()}
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

    {/* ── Revert qty modal from pencil in table ── */}
    {revertItem && (
      <RevertStockModal
        productName={revertItem.name}
        productId={revertItem.id}
        ownerId={ownerId}
        currentQty={liveQtys[revertItem.id] ?? revertItem.stock_qty ?? 0}
        costPrice={parseFloat(costPrices[revertItem.id] ?? "") || Number(revertItem.cost_price ?? 0)}
        onClose={() => setRevertItem(null)}
        onSaved={(newQty) => {
          setLiveQtys((prev) => ({ ...prev, [revertItem.id]: newQty }));
          setRevertItem(null);
        }}
      />
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
  // Tracks the source that opened StockNumpad so Back can return to it:
  // "addDialog" = came from the "+ Add Items" dialog (reopen it)
  // "editDialog" = came from editing an existing item (reopen it)
  // null = opened directly from product list card
  const [stockNumpadSource, setStockNumpadSource] = useState<"addDialog" | "editDialog" | null>(null);
  // Holds the product that was being edited when we navigated to StockNumpad,
  // so Back can reliably restore the Edit Item dialog regardless of Radix state.
  const editItemForBackRef = useRef<Product | null>(null);
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [bulkAddItems, setBulkAddItems] = useState<Product[] | null>(null);
  // Preload product images so the grid renders instantly and works offline
  useImageCache(items.map((p) => productImageUrl(p.image_url)));

  const profileRef = useRef(profile);
  useEffect(() => { profileRef.current = profile; }, [profile]);

  const load = useCallback(async () => {
    const p = profileRef.current;
    if (!p) return;
    const ownerIdForQuery = effectiveOwnerId((p.role === "manager" || p.job_title === "manager") ? (p.parent_id ?? p.id) : p.id);
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
    const ownerIdForQuery = effectiveOwnerId((profile.role === "manager" || profile.job_title === "manager") ? (profile.parent_id ?? profile.id) : profile.id);
    const ch = supabase
      .channel(`products-mgmt-${ownerIdForQuery}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "products", filter: `owner_id=eq.${ownerIdForQuery}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile?.id, load, effectiveOwnerId]);

  if (profile?.role !== "owner" && profile?.role !== "manager" && profile?.job_title !== "manager") {
    return <div className="text-center text-muted-foreground py-20">Only owners and managers can manage items.</div>;
  }

  const ownerIdForQuery = effectiveOwnerId(
    (profile.role === "manager" || (profile as any).job_title === "manager")
      ? (profile.parent_id ?? profile.id)
      : profile.id
  );
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
                + Add Items
              </Button>
            </DialogTrigger>
            <AddItemDialog
                key={open ? "open" : "closed"}
                ownerId={ownerIdForQuery}
                onDone={() => { setOpen(false); load(); }}
                onSaved={(product) => {
                  // inject the new product into items immediately so the numpad can find it
                  setItems((prev) => [...prev, product]);
                  setStockNumpadSource("addDialog");
                  setStockNumpadId(product.id);
                }}
                onBulkSelect={async (templates) => {
                  setOpen(false);
                  // Insert all stub products in parallel, then open bulk edit immediately
                  const results = await Promise.all(
                    templates.map((t) =>
                      supabase
                        .from("products")
                        .insert({
                          owner_id: ownerIdForQuery,
                          name: t.label,
                          image_url: t.url,
                          category: t.category,
                          price: 0,
                          cost_price: 0,
                          units_per_item: 0,
                          bottle_variations: null,
                          stock_qty: 0,
                        })
                        .select("*")
                        .single()
                    )
                  );
                  const inserted = results
                    .filter(({ error }) => !error)
                    .map(({ data }) => data as Product);
                  if (inserted.length > 0) {
                    setItems((prev) => [...prev, ...inserted]);
                    setBulkAddItems(inserted);
                  }
                }}
              />
          </Dialog>
          </div>
        </div>
        {/* Mobile: horizontal scroll; sm+: fixed grid */}
        <div className="sm:hidden flex gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setCategory(cat.value)}
              className={`h-10 shrink-0 rounded-xl font-black transition flex items-center justify-center px-4 ${
                category === cat.value ? "text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}
              style={category === cat.value ? { background: "var(--gradient-hero)" } : {}}
            >
              <span className="text-xs leading-none whitespace-nowrap">{t(categoryKey(cat.value), cat.label)}</span>
            </button>
          ))}
        </div>
        <div className="hidden sm:grid grid-cols-7 gap-1.5">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setCategory(cat.value)}
              className={`h-10 rounded-xl font-black transition flex items-center justify-center ${
                category === cat.value ? "text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
              style={category === cat.value ? { background: "var(--gradient-hero)" } : {}}
            >
              <span className="text-xs leading-none whitespace-nowrap">{t(categoryKey(cat.value), cat.label)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="pt-3">
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">No {t(categoryKey(CATEGORIES.find(c=>c.value===category)?.value ?? ""), CATEGORIES.find(c=>c.value===category)?.label ?? category)} yet — tap Add Item.</div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-6 gap-2">
            {filtered.map((p) => (
              <div key={p.id} className="flex flex-col rounded-2xl overflow-hidden border border-border" style={{ background: "var(--gradient-card)" }}>
                <div className="aspect-[3/4] relative w-full">
                  {p.image_url ? (
                    <img
                      src={productImageUrl(p.image_url)!}
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
          onClose={() => { setStockNumpadId(null); setStockNumpadSource(null); }}
          onBack={
            stockNumpadSource === "addDialog"
              ? () => { setStockNumpadId(null); setStockNumpadSource(null); setOpen(true); }
              : stockNumpadSource === "editDialog"
              ? () => {
                  setStockNumpadId(null);
                  setStockNumpadSource(null);
                  // Restore the edit dialog with the product that was being edited
                  if (editItemForBackRef.current) {
                    setEditItem(editItemForBackRef.current);
                    editItemForBackRef.current = null;
                  }
                }
              : undefined
          }
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
              // Save the updated product so Back can restore the edit dialog
              editItemForBackRef.current = { ...updated };
              setEditItem(null); // close the dialog cleanly before opening numpad
              setStockNumpadSource("editDialog");
              // Open the stock numpad so the user can add new stock at the updated cost price
              setStockNumpadId(updated.id);
            }}
          />
        </Dialog>
      )}

      {/* Bulk Edit Modal — regular */}
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

      {/* Bulk Edit Modal — bulk add from templates */}
      {bulkAddItems && (
        <BulkEditModal
          items={bulkAddItems}
          ownerId={ownerIdForQuery}
          onClose={() => { setBulkAddItems(null); load(); }}
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
            setBulkAddItems(null);
          }}
        />
      )}
    </div>
  );
}

// ─── Add Item Dialog ──────────────────────────────────────────────────────────
function AddItemDialog({ onDone, onSaved, onBulkSelect, ownerId, editProduct }: { onDone: () => void; onSaved: (product: Product) => void; onBulkSelect?: (templates: { url: string; label: string; category: string }[]) => void; ownerId: string; editProduct?: Product | null }) {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const isEdit = !!editProduct;
  const [name, setName] = useState(editProduct?.name ?? "");
  const [price, setPrice] = useState(editProduct ? String(editProduct.price) : "");
  const [costPrice, setCostPrice] = useState(editProduct ? String(editProduct.cost_price ?? "") : "");
  const [unitsPerItem, setUnitsPerItem] = useState(editProduct ? String(editProduct.units_per_item || "") : "");
  const [shotPricePerUnit, setShotPricePerUnit] = useState(() => {
    const shotVar = editProduct?.bottle_variations?.find((v) => v.key === "shot");
    return shotVar ? String(shotVar.price) : "";
  });
  const [bottleVariations, setBottleVariations] = useState<BottleVariation[]>(
    (editProduct?.bottle_variations ?? []).filter((v) => v.key !== "shot")
  );
  // Cigarette special offer
  const [cigSpecialQty,   setCigSpecialQty]   = useState(() => {
    const sv = editProduct?.bottle_variations?.find((v) => v.key === "special");
    return sv ? String(sv.units_consumed) : "";
  });
  const [cigSpecialPrice, setCigSpecialPrice] = useState(() => {
    const sv = editProduct?.bottle_variations?.find((v) => v.key === "special");
    return sv ? String(sv.price) : "";
  });
  // Cigarette retail sale price (per cigarette sold individually)
  const [cigRetailPrice, setCigRetailPrice] = useState(() => {
    const rv = editProduct?.bottle_variations?.find((v) => v.key === "retail");
    return rv ? String(rv.price) : "";
  });
  const [category, setCategory] = useState<string>(editProduct?.category ?? "beers");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(editProduct?.image_url ?? null);
  const [templateUrl, setTemplateUrl] = useState<string | null>(editProduct?.image_url ?? null);
  const [busy, setBusy] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  // which field the numpad is for: "selling" | "cost" | "units" | "shotprice" | "var_{i}_shots" | "var_{i}_price" | null
  const [activeNumpad, setActiveNumpad] = useState<string | null>(null);
  // which category tab is active inside the template picker
  const [templateCat, setTemplateCat] = useState<string>("beers");
  const [templateSearch, setTemplateSearch] = useState("");
  // multi-select: map url → {label, category}
  const [selectedTemplates, setSelectedTemplates] = useState<Map<string, { label: string; category: string }>>(new Map());
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  // Tracks whether the current submit should skip opening the stock numpad
  const skipStockRef = useRef(false);
  // Scroll the numpad into view when it opens
  const numpadRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (activeNumpad && numpadRef.current) {
      setTimeout(() => numpadRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
    }
  }, [activeNumpad]);

  // Inline numpad rendered directly under its field
  const InlineNumpad = ({ forField }: { forField: string }) => {
    if (activeNumpad !== forField) return null;
    return (
      <div ref={numpadRef} className="grid grid-cols-3 gap-1.5 mt-2">
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
    );
  };

  /**
   * Process a product image: remove background, tight-crop, center on 500×500
   * transparent canvas, sharpen — mirrors the Bartendaz Pro Bottle-Only Toolkit.
   * Falls back to simple resize if the pipeline fails.
   */
  const compressImage = async (f: File): Promise<File> => {
    const { processProductImage } = await import("@/lib/processProductImage");
    return processProductImage(f, { removeBg: true });
  };

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
    // Handle variation fields: "var_{i}_shots" or "var_{i}_price"
    if (activeNumpad?.startsWith("var_")) {
      const parts = activeNumpad.split("_"); // ["var", i, "shots"|"price"]
      const idx = parseInt(parts[1]);
      const field = parts[2] as "shots" | "price";
      const isInt = field === "shots";
      setBottleVariations(bv => bv.map((x, j) => {
        if (j !== idx) return x;
        const cur = isInt ? String(x.units_consumed || "") : String(x.price || "");
        let next: string;
        if (k === "⌫") {
          next = cur.slice(0, -1);
        } else if (!isInt && k === ".") {
          next = cur.includes(".") ? cur : cur + ".";
        } else {
          // Block extra decimal places
          if (!isInt) {
            const dotIdx = cur.indexOf(".");
            if (dotIdx !== -1 && cur.length - dotIdx > 2) return x;
          } else if (k === ".") {
            return x; // no decimals for shot count
          }
          next = cur === "0" ? k : cur + k;
        }
        return isInt
          ? { ...x, units_consumed: parseInt(next) || 0 }
          : { ...x, price: parseFloat(next) || 0 };
      }));
      return;
    }

    const setter = activeNumpad === "cost" ? setCostPrice
      : activeNumpad === "units" ? setUnitsPerItem
      : activeNumpad === "shotprice" ? setShotPricePerUnit
      : activeNumpad === "cigretail" ? setCigRetailPrice
      : setPrice;
    const current = activeNumpad === "cost" ? costPrice
      : activeNumpad === "units" ? unitsPerItem
      : activeNumpad === "shotprice" ? shotPricePerUnit
      : activeNumpad === "cigretail" ? cigRetailPrice
      : price;
    if (k === "⌫") { setter(current.slice(0, -1)); return; }
    if (activeNumpad !== "units") {
      if (k === ".") { if (!current.includes(".")) setter(current + "."); return; }
      const dotIdx = current.indexOf(".");
      if (dotIdx !== -1 && current.length - dotIdx > 2) return;
    } else {
      if (k === ".") return;
    }
    setter(current === "0" ? k : current + k);
  };

  const submit = async () => {
    if (!profile || !name || !price) return;
    setBusy(true);
    let image_url: string | null = null;
    if (templateUrl) {
      image_url = templateUrl;
    } else if (file) {
      const compressed = await compressImage(file);
      const ext = compressed.name.split(".").pop() || "png";
      const path = `${profile.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("product-images").upload(path, compressed, { upsert: false });
      if (upErr) { toast.error(upErr.message); setBusy(false); return; }
      image_url = supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
    } else if (isEdit) {
      // keep the existing image if no new one was picked
      image_url = editProduct?.image_url ?? null;
    }

    const costVal = parseFloat(costPrice) || 0;
    const unitsVal = parseInt(unitsPerItem, 10) || 0;
    const variationsVal = category === "liquor" ? [
      ...(unitsVal > 0 && parseFloat(shotPricePerUnit) > 0
        ? [{ key: "shot", label: "Drink", units_consumed: 1, price: parseFloat(shotPricePerUnit) }]
        : []),
      ...bottleVariations.filter((v) => v.key !== "shot" && v.label && v.units_consumed > 0),
    ] : category === "cigarettes" ? [
      ...(parseFloat(cigRetailPrice) > 0
        ? [{ key: "retail", label: "Retail", units_consumed: 1, price: parseFloat(cigRetailPrice) }]
        : []),
      ...(parseInt(cigSpecialQty) > 0 && parseFloat(cigSpecialPrice) > 0
        ? [{ key: "special", label: `${cigSpecialQty} for $${parseFloat(cigSpecialPrice).toFixed(2)}`, units_consumed: parseInt(cigSpecialQty), price: parseFloat(cigSpecialPrice) }]
        : []),
    ] : null;

    if (isEdit && editProduct) {
      const { data: updated, error } = await supabase
        .from("products")
        .update({
          name: name.trim(),
          price: Number(price),
          cost_price: costVal,
          units_per_item: unitsVal,
          bottle_variations: variationsVal,
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
      if (!skipStockRef.current) {
        onSaved({ ...updated, units_per_item: updated.units_per_item ?? 0, bottle_variations: (updated.bottle_variations ?? null) as any });
      }
    } else {
      // ── INSERT new product ───────────────────────────────────────────────
      const { data: inserted, error } = await supabase.from("products").insert({
        owner_id: ownerId, name: name.trim(), price: Number(price), cost_price: costVal,
        units_per_item: unitsVal, bottle_variations: variationsVal, image_url, category,
      }).select("*").single();
      setBusy(false);
      if (error) { toast.error(error.message); return; }
      toast.success("Item added");
      setName(""); setPrice(""); setCostPrice(""); setUnitsPerItem(""); setShotPricePerUnit(""); setCigSpecialQty(""); setCigSpecialPrice(""); setCigRetailPrice(""); setBottleVariations([]); setCategory("beers"); setFile(null); setPreview(null); setTemplateUrl(null);
      onDone();
      if (!skipStockRef.current) {
        onSaved({ ...inserted, units_per_item: inserted.units_per_item ?? 0, bottle_variations: (inserted.bottle_variations ?? null) as any });
      }
    }
  };

  return (
    <DialogContent
      className="max-w-lg w-[calc(100vw-2rem)] max-h-[90dvh] flex flex-col p-4 gap-0"
      onInteractOutside={(e) => e.preventDefault()}
      onEscapeKeyDown={(e) => e.preventDefault()}
    >
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
          <DialogTitle>{showTemplates ? t("choose_template", "Choose Template") : isEdit ? t("edit_item", "Edit Item") : t("add_item", "Add Item")}</DialogTitle>
          {/* Done button — shown in template view when ≥1 item selected */}
          {showTemplates && onBulkSelect && (
            <button
              onClick={() => {
                if (selectedTemplates.size === 0) return;
                const arr = Array.from(selectedTemplates.entries()).map(([url, { label, category }]) => ({ url, label, category }));
                if (arr.length === 1) {
                  // Single selection — use the normal single-item route
                  onTemplateSelect(arr[0].url, arr[0].label, arr[0].category);
                  return;
                }
                onBulkSelect(arr);
              }}
              disabled={selectedTemplates.size === 0}
              className="ml-auto mr-8 h-8 px-4 rounded-xl font-black text-sm text-primary-foreground flex items-center gap-1.5 transition active:scale-95 disabled:opacity-40 shrink-0"
              style={{ background: selectedTemplates.size > 0 ? "var(--gradient-hero)" : "rgba(255,255,255,0.08)" }}
            >
              Done {selectedTemplates.size > 0 && <span className="h-5 min-w-[1.25rem] px-1 rounded-full bg-black/30 flex items-center justify-center text-xs font-black">{selectedTemplates.size}</span>}
            </button>
          )}
        </div>
      </DialogHeader>

      <div className="flex-1 min-h-0 overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(251,146,60,0.4) transparent" }}>
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
              {/* Category tabs — no Misc or Food since templates aren't available for those categories */}
              <div className="grid grid-cols-5 gap-2">
                {CATEGORIES.filter((cat) => cat.value !== "miscellaneous" && cat.value !== "food").map((cat) => (
                  <button
                    key={cat.value}
                    onClick={() => setTemplateCat(cat.value)}
                    className={`h-10 rounded-xl font-black transition flex items-center justify-center ${
                      templateCat === cat.value ? "text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                    style={templateCat === cat.value ? { background: "var(--gradient-hero)" } : {}}
                  >
                    <span className="text-xs leading-none whitespace-nowrap">{t(categoryKey(cat.value), cat.label)}</span>
                  </button>
                ))}
              </div>
            </div>
            <TemplatePicker
              onSelect={onTemplateSelect}
              onToggle={onBulkSelect ? (url, label, cat) => {
                setSelectedTemplates((prev) => {
                  const next = new Map(prev);
                  if (next.has(url)) next.delete(url);
                  else next.set(url, { label, category: cat });
                  return next;
                });
              } : undefined}
              selectedUrls={onBulkSelect ? new Set(selectedTemplates.keys()) : undefined}
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
                  ? <img src={preview} className="absolute inset-0 w-full h-full object-contain" alt="preview" />
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
                  <LayoutGrid className="h-5 w-5 mr-2" /> {t("template_btn", "Template")}
                </Button>
                <Button type="button" variant="secondary" className="w-full h-14 text-sm font-bold" onClick={() => camRef.current?.click()}>
                  <Camera className="h-5 w-5 mr-2" /> {t("take_photo_btn", "Take Photo")}
                </Button>
                <Button type="button" variant="secondary" className="w-full h-14 text-sm font-bold" onClick={() => fileRef.current?.click()}>
                  <ImagePlus className="h-5 w-5 mr-2" /> {t("upload_btn", "Upload")}
                </Button>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground/70 leading-snug">
              💡 {t("best_results_tip", "For best results, upload a")} <span className="font-bold text-amber-400">{t("png_transparent", "PNG with transparent background")}</span>.
            </p>

            {/* Name */}
            <div>
              <Label className="text-xs">{t("item_name", "Name")}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Heineken 330ml" className="h-9" />
            </div>

            {/* Category + Cost Price + Bottle Price */}
            <div className="space-y-0">
              <div className="flex gap-2">
                <div className="flex-1">
                  <Label className="text-xs">{t("category_label", "Category")}</Label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="mt-1 h-9 w-full rounded-lg border border-border bg-muted px-2 text-sm font-bold outline-none cursor-pointer"
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat.value} value={cat.value}>{cat.icon} {t(categoryKey(cat.value), cat.label)}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <Label className="text-xs">{t("cost_price_label", "Cost Price")}</Label>
                  <div
                    className="mt-1 h-9 rounded-lg border border-border bg-muted/30 flex items-center px-3 cursor-pointer active:bg-muted/50 transition"
                    onClick={() => setActiveNumpad(activeNumpad === "cost" ? null : "cost")}
                  >
                    <span className={`text-base font-black ${activeNumpad === "cost" ? "text-primary" : "text-muted-foreground"}`}>
                      ${costPrice || "0.00"}
                    </span>
                  </div>
                </div>
                <div className="flex-1">
                  <Label className="text-xs">{category === "cigarettes" ? t("sell_price_label", "Sell Price") + " (Pack)" : category === "liquor" ? "Bottle Price" : t("sell_price_label", "Sell Price")}</Label>
                  <div
                    className="mt-1 h-9 rounded-lg border border-border bg-muted/30 flex items-center px-3 cursor-pointer active:bg-muted/50 transition"
                    onClick={() => setActiveNumpad(activeNumpad === "selling" ? null : "selling")}
                  >
                    <span className={`text-base font-black ${activeNumpad === "selling" ? "text-primary" : "text-muted-foreground"}`}>
                      ${price || "0.00"}
                    </span>
                  </div>
                </div>
              </div>
              <InlineNumpad forField="cost" />
              <InlineNumpad forField="selling" />
            </div>

            {/* Shots per Bottle + Shot Price — side by side, liquor only */}
            {category === "liquor" && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">🍾 Drinks per Bottle</Label>
                    <div
                      className="mt-1 h-9 rounded-lg border border-border bg-muted/30 flex items-center px-3 cursor-pointer active:bg-muted/50 transition"
                      onClick={() => setActiveNumpad(activeNumpad === "units" ? null : "units")}
                    >
                      <span className={`text-base font-black ${activeNumpad === "units" ? "text-primary" : "text-muted-foreground"}`}>
                        {unitsPerItem || "0"} drinks
                      </span>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Drink Price ($)</Label>
                    <div
                      className="mt-1 h-9 rounded-lg border border-border bg-muted/30 flex items-center px-3 cursor-pointer active:bg-muted/50 transition"
                      onClick={() => setActiveNumpad(activeNumpad === "shotprice" ? null : "shotprice")}
                    >
                      <span className={`text-base font-black ${activeNumpad === "shotprice" ? "text-primary" : "text-muted-foreground"}`}>
                        ${shotPricePerUnit || "0.00"}
                      </span>
                    </div>
                  </div>
                </div>
                <InlineNumpad forField="units" />
                <InlineNumpad forField="shotprice" />
                {unitsPerItem && parseInt(unitsPerItem) > 0 && parseFloat(costPrice) > 0 && (
                  <p className="text-xs" style={{ color: "var(--primary)" }}>
                    Cost per shot: ${(parseFloat(costPrice) / parseInt(unitsPerItem)).toFixed(2)}
                  </p>
                )}
              </div>
            )}

            {/* Units per pack — cigarettes only */}
            {category === "cigarettes" && (
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">🚬 Units per Pack</Label>
                  <div
                    className="mt-1 h-9 rounded-lg border border-border bg-muted/30 flex items-center px-3 cursor-pointer active:bg-muted/50 transition"
                    onClick={() => setActiveNumpad(activeNumpad === "units" ? null : "units")}
                  >
                    <span className={`text-base font-black ${activeNumpad === "units" ? "text-primary" : "text-muted-foreground"}`}>
                      {unitsPerItem || "0"} per pack
                    </span>
                  </div>
                  <InlineNumpad forField="units" />
                  {unitsPerItem && parseInt(unitsPerItem) > 0 && parseFloat(costPrice) > 0 && (
                    <p className="text-xs mt-1" style={{ color: "var(--primary)" }}>
                      Cost per unit: ${(parseFloat(costPrice) / parseInt(unitsPerItem)).toFixed(2)}
                    </p>
                  )}
                </div>
                {/* Retail Sale Price per cigarette */}
                <div>
                  <Label className="text-xs">Retail Sale Price (per cigarette)</Label>
                  <div
                    className="mt-1 h-9 rounded-lg border border-border bg-muted/30 flex items-center px-3 cursor-pointer active:bg-muted/50 transition"
                    onClick={() => setActiveNumpad(activeNumpad === "cigretail" ? null : "cigretail")}
                  >
                    <span className={`text-base font-black ${activeNumpad === "cigretail" ? "text-primary" : "text-muted-foreground"}`}>
                      ${cigRetailPrice || "0.00"}
                    </span>
                  </div>
                  <InlineNumpad forField="cigretail" />
                  {cigRetailPrice && parseFloat(cigRetailPrice) > 0 && unitsPerItem && parseInt(unitsPerItem) > 0 && (
                    <p className="text-xs mt-1" style={{ color: "var(--primary)" }}>
                      Full pack retail value: ${(parseFloat(cigRetailPrice) * parseInt(unitsPerItem)).toFixed(2)}
                    </p>
                  )}
                </div>
                {/* Special offer */}
                <div className="rounded-xl border border-border p-3 space-y-2" style={{ background: "var(--gradient-card)" }}>
                  <Label className="text-xs">🎁 Special Offer (optional)</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-0.5">Qty in deal</p>
                      <input type="number" min="2" step="1"
                        value={cigSpecialQty}
                        onChange={(e) => setCigSpecialQty(e.target.value)}
                        className="w-full h-9 rounded-lg border border-border bg-background px-2 text-sm font-bold outline-none"
                        placeholder="e.g. 3" />
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-0.5">Deal price ($)</p>
                      <input type="number" min="0.01" step="0.01"
                        value={cigSpecialPrice}
                        onChange={(e) => setCigSpecialPrice(e.target.value)}
                        className="w-full h-9 rounded-lg border border-border bg-background px-2 text-sm font-bold outline-none"
                        placeholder="e.g. 5.00" />
                    </div>
                  </div>
                  {cigSpecialQty && cigSpecialPrice && parseInt(cigSpecialQty) > 0 && parseFloat(cigSpecialPrice) > 0 && (
                    <p className="text-xs" style={{ color: "#86efac" }}>
                      {cigSpecialQty} for ${parseFloat(cigSpecialPrice).toFixed(2)} · ${(parseFloat(cigSpecialPrice) / parseInt(cigSpecialQty)).toFixed(2)} each
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Bottle variations (Half, Nip, PQ etc) — liquor only, no Shot row */}
            {category === "liquor" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">🥃 Bottle Variations</Label>
                  <p className="text-[10px] text-muted-foreground">Drinks used from bottle</p>
                </div>
                {bottleVariations.length === 0 && (
                  <button type="button"
                    onClick={() => setBottleVariations([
                      { key: "half", label: "Half Bottle", units_consumed: 0, price: 0 },
                      { key: "nip",  label: "Nip",         units_consumed: 0, price: 0 },
                      { key: "pq",   label: "PQ",          units_consumed: 0, price: 0 },
                    ])}
                    className="w-full h-9 rounded-lg border border-dashed border-border text-xs font-bold text-muted-foreground hover:bg-muted/20 transition">
                    + Set up variations
                  </button>
                )}
                {bottleVariations.filter((v) => v.key !== "shot").map((v, i) => (
                  <div key={v.key} className="rounded-xl border border-border p-2 space-y-1.5" style={{ background: "var(--gradient-card)" }}>
                    <div className="flex items-center justify-between gap-2">
                      <input type="text" value={v.label}
                        onChange={(e) => setBottleVariations(bv => bv.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                        className="flex-1 h-8 rounded-lg border border-border bg-background px-2 text-xs font-bold outline-none"
                        placeholder="e.g. Half Bottle" />
                      <button type="button"
                        onClick={() => setBottleVariations(bv => bv.filter((_, j) => j !== i))}
                        className="h-8 w-8 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-500/10 transition">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-[10px] text-muted-foreground mb-0.5">Drinks used</p>
                        <div
                          className="h-8 rounded-lg border border-border bg-muted/30 flex items-center px-2 cursor-pointer active:bg-muted/50 transition"
                          onClick={() => setActiveNumpad(activeNumpad === `var_${i}_shots` ? null : `var_${i}_shots`)}
                        >
                          <span className={`text-xs font-black ${activeNumpad === `var_${i}_shots` ? "text-primary" : "text-muted-foreground"}`}>
                            {v.units_consumed || "0"}
                          </span>
                        </div>
                        <InlineNumpad forField={`var_${i}_shots`} />
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground mb-0.5">Price ($)</p>
                        <div
                          className="h-8 rounded-lg border border-border bg-muted/30 flex items-center px-2 cursor-pointer active:bg-muted/50 transition"
                          onClick={() => setActiveNumpad(activeNumpad === `var_${i}_price` ? null : `var_${i}_price`)}
                        >
                          <span className={`text-xs font-black ${activeNumpad === `var_${i}_price` ? "text-primary" : "text-muted-foreground"}`}>
                            ${v.price ? v.price.toFixed(2) : "0.00"}
                          </span>
                        </div>
                        <InlineNumpad forField={`var_${i}_price`} />
                      </div>
                    </div>
                    {v.units_consumed > 0 && parseInt(unitsPerItem) > 0 && (
                      <p className="text-[10px]" style={{ color: "var(--primary)" }}>
                        = {Math.floor(parseInt(unitsPerItem) / v.units_consumed)} per bottle
                      </p>
                    )}
                  </div>
                ))}
                {bottleVariations.length > 0 && (
                  <button type="button"
                    onClick={() => setBottleVariations(bv => [...bv, { key: `var_${Date.now()}`, label: "", units_consumed: 1, price: 0 }])}
                    className="w-full h-8 rounded-lg border border-dashed border-border text-xs font-bold text-muted-foreground hover:bg-muted/20 transition">
                    + Add variation
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {!showTemplates && (
        <div className="pt-3 space-y-2">
          <Button
            onClick={() => { skipStockRef.current = false; submit(); }}
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
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("next", "Next →")}
          </Button>
          <Button
            onClick={() => { skipStockRef.current = true; submit(); }}
            disabled={
              busy ||
              !name ||
              !price ||
              (!isEdit && (!costPrice || parseFloat(costPrice) <= 0)) ||
              (isEdit && (editProduct?.cost_price ?? 0) === 0 && (!costPrice || parseFloat(costPrice) <= 0))
            }
            variant="outline"
            className="w-full font-bold h-11 shrink-0"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("save_and_exit", "Save & Exit")}
          </Button>
        </div>
      )}
    </DialogContent>
  );
}
