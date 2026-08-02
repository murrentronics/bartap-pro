import { createFileRoute } from "@tanstack/react-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, X, Pencil, ClipboardList } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useChain } from "@/lib/ChainContext";
import { supabase } from "@/integrations/supabase/client";
import { productImageUrl } from "@/lib/imageUrl";
import { CATEGORIES, categoryIcon } from "@/lib/categories";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/stock-check")({
  component: StockCheckPage,
});

// ─── Types ────────────────────────────────────────────────────────────────────

type Product = {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
  category?: string;
  stock_qty: number;
};

type ActualMap = Record<string, number>; // product_id → actual_qty

// ─── Numpad Modal ─────────────────────────────────────────────────────────────

function ActualNumpad({
  product,
  currentActual,
  onClose,
  onSave,
}: {
  product: Product;
  currentActual: number;
  onClose: () => void;
  onSave: (newActual: number) => void;
}) {
  const [inputVal, setInputVal] = useState(String(currentActual));
  const [busy, setBusy] = useState(false);

  const parsed = parseInt(inputVal, 10);
  const isValid = !isNaN(parsed) && parsed >= 0;

  const qty = product.stock_qty;
  const diff = isValid ? qty - parsed : 0;
  const loss = isValid ? diff * product.price : 0;

  const NUMPAD_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

  const handleKey = (k: string) => {
    if (k === "⌫") {
      setInputVal((v) => (v.length > 1 ? v.slice(0, -1) : "0"));
      return;
    }
    setInputVal((v) => {
      if (v === "0") return k;
      return v + k;
    });
  };

  const handleSave = async () => {
    if (!isValid) return;
    setBusy(true);
    await onSave(parsed);
    setBusy(false);
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
            <span className="text-base font-black">Set Actual Count</span>
            <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[220px]">
              {product.name}
            </p>
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
            <div className="text-xs text-muted-foreground">System Qty</div>
            <div
              className={`text-xl font-black ${
                qty === 0 ? "text-red-400" : qty <= 5 ? "text-yellow-400" : "text-green-400"
              }`}
            >
              {qty}
            </div>
          </div>
          <div className="px-3 py-2 rounded-xl bg-muted/30 text-center border border-primary/30">
            <div className="text-xs text-muted-foreground">Actual</div>
            <div className="text-xl font-black text-primary">{isValid ? parsed : "—"}</div>
          </div>
          <div
            className="px-3 py-2 rounded-xl text-center"
            style={{
              background: loss > 0 ? "rgba(239,68,68,0.10)" : "rgba(255,255,255,0.04)",
              border: loss > 0 ? "1px solid rgba(239,68,68,0.30)" : "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div className="text-xs text-muted-foreground">Loss</div>
            <div
              className={`text-base font-black leading-tight ${loss > 0 ? "text-red-400" : "text-muted-foreground"}`}
            >
              {loss > 0 ? `-$${loss.toFixed(2)}` : "$0.00"}
            </div>
          </div>
        </div>

        {/* Display */}
        <div className="mx-5 mb-3 h-14 rounded-2xl flex items-center justify-center border border-border bg-background/60">
          <span className="text-3xl font-black" style={{ color: "var(--primary)" }}>
            {inputVal}
          </span>
        </div>

        {/* Sale price hint */}
        <p className="text-center text-xs text-muted-foreground mb-3 px-5">
          Sale price:{" "}
          <span className="font-black text-foreground">${product.price.toFixed(2)}</span>
          {diff > 0 && isValid && (
            <>
              {" "}· Missing:{" "}
              <span className="font-black text-red-400">{diff}</span>
            </>
          )}
        </p>

        {/* Numpad */}
        <div className="px-5 pb-2">
          <div className="grid grid-cols-3 gap-2">
            {NUMPAD_KEYS.map((k, i) =>
              k === "" ? (
                <div key={i} />
              ) : (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleKey(k)}
                  className="h-14 rounded-2xl flex items-center justify-center font-black text-xl transition active:scale-95"
                  style={{
                    background:
                      k === "⌫" ? "rgba(220,38,38,0.15)" : "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    color: k === "⌫" ? "#f87171" : "var(--foreground)",
                  }}
                >
                  {k}
                </button>
              )
            )}
          </div>
        </div>

        {/* Save button */}
        <div className="px-5 pb-6 pt-3">
          <button
            onClick={handleSave}
            disabled={busy || !isValid}
            className="w-full rounded-2xl font-black text-base text-primary-foreground transition active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2 py-4"
            style={{ background: "var(--gradient-hero)" }}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              `Save Actual: ${isValid ? parsed : "—"}`
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Stock Check Page ─────────────────────────────────────────────────────────

function StockCheckPage() {
  const { profile } = useAuth();
  const { effectiveOwnerId } = useChain();

  const [items, setItems] = useState<Product[]>([]);
  const [actuals, setActuals] = useState<ActualMap>({});
  const [loading, setLoading] = useState(true);
  const [activeNumpadId, setActiveNumpadId] = useState<string | null>(null);

  const profileRef = useRef(profile);
  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  // ── Derive owner id ──────────────────────────────────────────────────────
  const isManager =
    profile?.role === "manager" || (profile as any)?.job_title === "manager";
  const ownerIdForQuery = profile
    ? effectiveOwnerId(isManager ? (profile.parent_id ?? profile.id) : profile.id)
    : null;

  // ── Load products ────────────────────────────────────────────────────────
  const loadProducts = useCallback(async () => {
    const p = profileRef.current;
    if (!p) return;
    const oid = effectiveOwnerId(
      p.role === "manager" || (p as any).job_title === "manager"
        ? (p.parent_id ?? p.id)
        : p.id
    );
    const { data } = await supabase
      .from("products")
      .select("id, name, price, image_url, category, stock_qty")
      .eq("owner_id", oid)
      .order("name", { ascending: true });
    setItems((data ?? []) as Product[]);
    setLoading(false);
  }, [effectiveOwnerId]);

  // ── Load actuals ─────────────────────────────────────────────────────────
  const loadActuals = useCallback(async () => {
    if (!ownerIdForQuery) return;
    const { data } = await (supabase as any)
      .from("stock_check_actuals")
      .select("product_id, actual_qty")
      .eq("owner_id", ownerIdForQuery);
    if (data) {
      const map: ActualMap = {};
      for (const row of data) map[row.product_id] = row.actual_qty;
      setActuals(map);
    }
  }, [ownerIdForQuery]);

  useEffect(() => {
    if (!profile?.id) return;
    loadProducts();
    loadActuals();

    if (!ownerIdForQuery) return;
    // Realtime: product qty changes
    const prodCh = supabase
      .channel(`stock-check-products-${ownerIdForQuery}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "products",
          filter: `owner_id=eq.${ownerIdForQuery}`,
        },
        (payload) => {
          const rec = payload.new as Partial<Product> & { id: string };
          if (payload.eventType === "DELETE") {
            setItems((prev) => prev.filter((p) => p.id !== rec.id));
            return;
          }
          setItems((prev) => {
            const exists = prev.find((p) => p.id === rec.id);
            if (!exists) {
              loadProducts();
              return prev;
            }
            return prev.map((p) => {
              if (p.id !== rec.id) return p;
              return {
                ...p,
                stock_qty: rec.stock_qty ?? p.stock_qty,
                price: rec.price ?? p.price,
                name: rec.name ?? p.name,
                image_url: rec.image_url !== undefined ? rec.image_url : p.image_url,
                category: rec.category ?? p.category,
              };
            });
          });
          // The DB trigger (trg_sync_actual_qty) automatically applies the same
          // delta to actual_qty whenever stock_qty changes, preserving the gap.
          // The realtime subscription on stock_check_actuals picks up those
          // changes and updates the actuals map — nothing extra needed here.
        }
      )
      .subscribe();

    // Realtime: actuals changes
    const actualsCh = (supabase as any)
      .channel(`stock-check-actuals-${ownerIdForQuery}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "stock_check_actuals",
          filter: `owner_id=eq.${ownerIdForQuery}`,
        },
        (payload: any) => {
          const rec = payload.new as { product_id: string; actual_qty: number } | undefined;
          if (payload.eventType === "DELETE") {
            const old = payload.old as { product_id: string };
            setActuals((prev) => {
              const next = { ...prev };
              delete next[old.product_id];
              return next;
            });
            return;
          }
          if (rec) {
            setActuals((prev) => ({ ...prev, [rec.product_id]: rec.actual_qty }));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(prodCh);
      supabase.removeChannel(actualsCh);
    };
  }, [profile?.id, ownerIdForQuery, loadProducts, loadActuals]);

  // ── Save actual ──────────────────────────────────────────────────────────
  const saveActual = async (productId: string, newActual: number) => {
    if (!ownerIdForQuery) return;
    const { error } = await (supabase as any)
      .from("stock_check_actuals")
      .upsert(
        {
          owner_id: ownerIdForQuery,
          product_id: productId,
          actual_qty: newActual,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "owner_id,product_id" }
      );
    if (error) {
      toast.error("Failed to save: " + error.message);
      return;
    }
    setActuals((prev) => ({ ...prev, [productId]: newActual }));
    setActiveNumpadId(null);
    toast.success("Actual count saved");
  };

  // ── Access guard ─────────────────────────────────────────────────────────
  if (
    profile?.role !== "owner" &&
    profile?.role !== "manager" &&
    (profile as any)?.job_title !== "manager"
  ) {
    return (
      <div className="text-center text-muted-foreground py-20">
        Only owners and managers can access Stock Check.
      </div>
    );
  }

  // ── Group alphabetically by category ────────────────────────────────────
  const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name));
  const grouped = CATEGORIES.map((cat) => ({
    cat,
    products: sorted.filter((p) => (p.category || "beers") === cat.value),
  })).filter((g) => g.products.length > 0);

  // ── Summary totals ───────────────────────────────────────────────────────
  const totalLoss = items.reduce((sum, p) => {
    const actual = actuals[p.id] ?? p.stock_qty;
    const diff = p.stock_qty - actual;
    return sum + (diff > 0 ? diff * p.price : 0);
  }, 0);

  const totalMissing = items.reduce((sum, p) => {
    const actual = actuals[p.id] ?? p.stock_qty;
    const diff = p.stock_qty - actual;
    return sum + (diff > 0 ? diff : 0);
  }, 0);

  const activeProduct = activeNumpadId ? items.find((p) => p.id === activeNumpadId) : null;

  return (
    <div>
      {/* ── Sticky sub-header ─────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 -mx-3 -mt-3">
        {/* Title row with pills inline */}
        <div className="flex items-center justify-between px-3 py-2 bg-background border-b border-border">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" style={{ color: "var(--primary)" }} />
            <div>
              <h1 className="text-xl font-black leading-tight">Stock Check</h1>
              <p className="text-muted-foreground text-xs">{items.length} items</p>
            </div>
          </div>
          {/* Summary pills */}
          <div className="flex items-center gap-2">
            {totalMissing > 0 && (
              <div
                className="px-3 py-1.5 rounded-xl text-xs font-black"
                style={{
                  background: "rgba(239,68,68,0.12)",
                  border: "1px solid rgba(239,68,68,0.30)",
                  color: "#f87171",
                }}
              >
                {totalMissing} missing
              </div>
            )}
            {totalLoss > 0 && (
              <div
                className="px-3 py-1.5 rounded-xl text-xs font-black"
                style={{
                  background: "rgba(239,68,68,0.12)",
                  border: "1px solid rgba(239,68,68,0.30)",
                  color: "#f87171",
                }}
              >
                −${totalLoss.toFixed(2)}
              </div>
            )}
          </div>
        </div>
        {/* Column header row — orange */}
        <div className="flex items-center py-2 px-3 gap-2 text-xs font-black text-black uppercase tracking-wide border-b border-black/20" style={{ background: "var(--gradient-hero)" }}>
          <div className="flex-1 min-w-0">Name</div>
          <div className="w-[52px] text-center">Qty</div>
          <div className="w-[64px] text-center">Actual</div>
          <div className="w-[58px] text-center">Price</div>
          <div className="w-[62px] text-right">Loss</div>
        </div>
      </div>

      {/* ── Loading ──────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center text-muted-foreground py-20">
          <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-bold">No items found.</p>
          <p className="text-xs mt-1">Add items from the Items page first.</p>
        </div>
      ) : (
        <>
          {/* ── Column header now lives in the sticky wrapper above ── */}

          {/* ── Item groups ─────────────────────────────────────────────── */}
          <div className="pb-10">
            {grouped.map(({ cat, products }) => (
              <React.Fragment key={cat.value}>
                {/* Category section header */}
                <div className="flex items-center gap-1.5 px-3 pt-5 pb-2">
                  <span className="text-base leading-none">{cat.icon}</span>
                  <span
                    className="text-xs font-black uppercase tracking-widest"
                    style={{ color: "var(--primary)" }}
                  >
                    {cat.label}
                  </span>
                </div>

                {products.map((p) => {
                  // If no actual has been set yet, mirror current qty so loss starts at $0
                  const actual = actuals[p.id] ?? p.stock_qty;
                  const diff = p.stock_qty - actual; // positive = missing from bar
                  const loss = diff > 0 ? diff * p.price : 0;
                  const isActive = activeNumpadId === p.id;
                  const hasLoss = loss > 0;

                  return (
                    <div
                      key={p.id}
                      className="flex items-center gap-2 px-3 py-2 border-t border-border/40 transition"
                      style={hasLoss ? { background: "rgba(239,68,68,0.04)" } : {}}
                    >
                      {/* Thumbnail */}
                      <div
                        className="h-10 w-10 rounded-xl overflow-hidden border border-border shrink-0 flex items-center justify-center text-lg"
                        style={{ background: "var(--gradient-card)" }}
                      >
                        {p.image_url ? (
                          <img
                            src={productImageUrl(p.image_url)!}
                            alt=""
                            className="h-full w-full object-cover"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display = "none";
                            }}
                          />
                        ) : (
                          categoryIcon(p.category ?? "drinks")
                        )}
                      </div>

                      {/* Name */}
                      <div className="flex-1 min-w-0">
                        <span className="font-bold text-sm leading-tight line-clamp-2">
                          {p.name}
                        </span>
                      </div>

                      {/* Qty — read only, colour-coded */}
                      <div className="w-[52px] flex justify-center">
                        <span
                          className={`font-black text-sm ${
                            p.stock_qty === 0
                              ? "text-red-400"
                              : p.stock_qty <= 5
                              ? "text-yellow-400"
                              : "text-green-400"
                          }`}
                        >
                          {p.stock_qty}
                        </span>
                      </div>

                      {/* Actual — editable via numpad */}
                      <div className="w-[64px] flex justify-center">
                        <button
                          type="button"
                          onClick={() => setActiveNumpadId(isActive ? null : p.id)}
                          className="flex items-center gap-1 h-9 px-2 rounded-xl border font-black text-sm transition active:scale-95"
                          style={{
                            background: isActive
                              ? "rgba(251,146,60,0.15)"
                              : "var(--gradient-card)",
                            borderColor: isActive
                              ? "var(--primary)"
                              : hasLoss
                              ? "rgba(239,68,68,0.50)"
                              : "var(--border)",
                            color: isActive
                              ? "var(--primary)"
                              : hasLoss
                              ? "#f87171"
                              : "var(--foreground)",
                            minWidth: "48px",
                          }}
                        >
                          <span>{actual}</span>
                          <Pencil className="h-2.5 w-2.5 shrink-0 opacity-60" />
                        </button>
                      </div>

                      {/* Sale Price */}
                      <div className="w-[58px] text-center">
                        <span className="font-bold text-xs text-muted-foreground">
                          ${p.price.toFixed(2)}
                        </span>
                      </div>

                      {/* Loss */}
                      <div className="w-[62px] text-right">
                        {hasLoss ? (
                          <span className="font-black text-xs text-red-400">
                            −${loss.toFixed(2)}
                          </span>
                        ) : (
                          <span className="font-black text-xs text-muted-foreground/40">
                            —
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>

          {/* ── Total loss footer ────────────────────────────────────────── */}
          {totalLoss > 0 && (
            <div
              className="fixed bottom-0 inset-x-0 mx-auto max-w-2xl px-4 py-3 border-t border-border flex items-center justify-between"
              style={{ background: "var(--background)" }}
            >
              <div className="text-sm font-black text-muted-foreground">
                Total estimated loss
              </div>
              <div className="text-lg font-black text-red-400">
                −${totalLoss.toFixed(2)}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Numpad Modal ─────────────────────────────────────────────────── */}
      {activeProduct && (
        <ActualNumpad
          product={activeProduct}
          currentActual={actuals[activeProduct.id] ?? activeProduct.stock_qty}
          onClose={() => setActiveNumpadId(null)}
          onSave={(newActual) => saveActual(activeProduct.id, newActual)}
        />
      )}
    </div>
  );
}

export default StockCheckPage;
