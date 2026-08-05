import { createFileRoute } from "@tanstack/react-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, X, Pencil, ClipboardList, FileDown } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useChain } from "@/lib/ChainContext";
import { supabase } from "@/integrations/supabase/client";
import { productImageUrl } from "@/lib/imageUrl";
import { CATEGORIES, categoryIcon, categoryLabel } from "@/lib/categories";
import { toast } from "sonner";
import { downloadPdf } from "@/lib/download";
import { drawHeader, addFootersToAllPages, LM, RM, CONTENT_BOTTOM } from "@/lib/pdfHelpers";

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
  units_per_item: number;
};

type ActualMap = Record<string, number>; // product_id → actual_qty

// open bottle/pack info keyed by product_id
type OpenItemInfo = {
  type: "bottle" | "pack";
  packType?: string; // 'retail' | 'paper'
  unitsSold: number;
  unitsPerItem: number; // from products.units_per_item
  shotPrice?: number;   // per-drink selling price (bottles only)
};

// ─── Numpad Modal ─────────────────────────────────────────────────────────────

function ActualNumpad({
  product,
  currentActual,
  onClose,
  onSave,
  priceOverride,
}: {
  product: Product;
  currentActual: number;
  onClose: () => void;
  onSave: (newActual: number) => void;
  priceOverride?: number;
}) {
  const [inputVal, setInputVal] = useState(String(currentActual));
  const [busy, setBusy] = useState(false);

  const parsed = parseInt(inputVal, 10);
  const isValid = !isNaN(parsed) && parsed >= 0;

  const unitPrice = priceOverride ?? product.price;
  const qty = product.stock_qty;
  const diff = isValid ? qty - parsed : 0;
  const loss = isValid ? diff * unitPrice : 0;

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
          <span className="font-black text-foreground">${unitPrice.toFixed(2)}</span>
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
  const [openItems, setOpenItems] = useState<Record<string, OpenItemInfo>>({});
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
      .select("id, name, price, image_url, category, stock_qty, units_per_item")
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

  // ── Load open bottles & packs ────────────────────────────────────────────
  const loadOpenItems = useCallback(async () => {
    if (!ownerIdForQuery) return;
    const [bottlesRes, packsRes] = await Promise.all([
      (supabase as any)
        .from("opened_bottles")
        .select("product_id, shots_sold, shot_price")
        .eq("owner_id", ownerIdForQuery)
        .eq("status", "open"),
      (supabase as any)
        .from("opened_packs")
        .select("product_id, units_sold, pack_type, unit_price")
        .eq("owner_id", ownerIdForQuery)
        .eq("status", "open"),
    ]);
    const map: Record<string, OpenItemInfo> = {};
    for (const row of bottlesRes.data ?? []) {
      const product = items.find((p) => p.id === row.product_id);
      // Only write if no pack entry already claimed this product_id
      if (!map[row.product_id]) {
        map[row.product_id] = {
          type: "bottle",
          unitsSold: row.shots_sold,
          unitsPerItem: product?.units_per_item ?? 0,
          shotPrice: row.shot_price ?? undefined,
        };
      }
    }
    for (const row of packsRes.data ?? []) {
      const product = items.find((p) => p.id === row.product_id);
      // Only write if no bottle entry already claimed this product_id
      if (!map[row.product_id]) {
        map[row.product_id] = {
          type: "pack",
          packType: row.pack_type,
          unitsSold: row.units_sold,
          unitsPerItem: product?.units_per_item ?? 0,
          shotPrice: row.unit_price ?? undefined,
        };
      }
    }
    setOpenItems(map);
  }, [ownerIdForQuery, items]);

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
  }, [profile?.id, ownerIdForQuery, loadProducts, loadActuals, loadOpenItems]);

  // Re-load open items whenever the items list is refreshed
  useEffect(() => {
    if (items.length > 0) loadOpenItems();
  }, [items, loadOpenItems]);

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
    let loss = diff > 0 ? diff * p.price : 0;

    // Add open item loss using per-drink price
    const openInfo = openItems[p.id];
    if (openInfo) {
      const remaining = Math.max(0, openInfo.unitsPerItem - openInfo.unitsSold);
      const openActual = actuals[`${p.id}_open`] ?? remaining;
      const openDiff = remaining - openActual;
      const openPrice = (openInfo.shotPrice != null && openInfo.shotPrice > 0) ? openInfo.shotPrice : p.price;
      loss += openDiff > 0 ? openDiff * openPrice : 0;
    }

    return sum + loss;
  }, 0);

  const totalMissing = items.reduce((sum, p) => {
    const actual = actuals[p.id] ?? p.stock_qty;
    const diff = p.stock_qty - actual;
    return sum + (diff > 0 ? diff : 0);
  }, 0);

  const activeProduct = activeNumpadId
    ? items.find((p) => p.id === activeNumpadId || activeNumpadId === `${p.id}_open`)
    : null;
  const activeIsOpen = activeNumpadId?.endsWith("_open") ?? false;
  const activeProductId = activeIsOpen && activeNumpadId
    ? activeNumpadId.replace("_open", "")
    : activeNumpadId;
  const activeProductForNumpad = activeProductId ? items.find(p => p.id === activeProductId) : null;

  // ── PDF generation ───────────────────────────────────────────────────────
  const [pdfBusy, setPdfBusy] = useState<string | null>(null); // category value or "all"

  const generatePdf = async (catFilter: string | null) => {
    const key = catFilter ?? "all";
    setPdfBusy(key);
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "mm", format: "a4" });
      const now = new Date();
      const dateStr = now.toLocaleDateString("en-GB");
      const timeStr = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
      const title = catFilter ? `Stock Check — ${categoryLabel(catFilter)}` : "Stock Check — All Items";
      let y = await drawHeader(doc, profile?.username ?? "Stock Check", title, dateStr, `${dateStr} ${timeStr}`);

      const COL = { name: LM, qty: 110, actual: 135, price: 160, loss: 185 };
      const ROW_H = 7;

      const checkPage = () => {
        if (y > CONTENT_BOTTOM - ROW_H) { doc.addPage(); y = 20; }
      };

      const sectionsToDraw = catFilter
        ? grouped.filter(g => g.cat.value === catFilter)
        : grouped;

      for (const { cat, products } of sectionsToDraw) {
        // Category header
        checkPage();
        doc.setFillColor(232, 146, 42);
        doc.rect(LM, y - 4, RM - LM, 6, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(0, 0, 0);
        doc.text(`${cat.icon}  ${cat.label.toUpperCase()}`, LM + 2, y);
        y += 5;

        // Column header
        checkPage();
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(80, 80, 80);
        doc.text("Name", COL.name, y);
        doc.text("QTY", COL.qty, y, { align: "right" });
        doc.text("Actual", COL.actual, y, { align: "right" });
        doc.text("Price", COL.price, y, { align: "right" });
        doc.text("Loss", COL.loss, y, { align: "right" });
        y += 4;
        doc.setDrawColor(200, 200, 200);
        doc.line(LM, y - 1, RM, y - 1);

        for (const p of products) {
          // Sealed row
          checkPage();
          const actual = actuals[p.id] ?? p.stock_qty;
          const diff = p.stock_qty - actual;
          const loss = diff > 0 ? diff * p.price : 0;
          doc.setFont("helvetica", "normal");
          doc.setFontSize(7.5);
          doc.setTextColor(0, 0, 0);
          const nameLines = doc.splitTextToSize(p.name, 85);
          doc.text(nameLines, COL.name, y);
          doc.text(String(p.stock_qty), COL.qty, y, { align: "right" });
          doc.text(String(actual), COL.actual, y, { align: "right" });
          doc.text(`$${p.price.toFixed(2)}`, COL.price, y, { align: "right" });
          if (loss > 0) {
            doc.setTextColor(220, 38, 38);
            doc.text(`-$${loss.toFixed(2)}`, COL.loss, y, { align: "right" });
            doc.setTextColor(0, 0, 0);
          } else {
            doc.text("—", COL.loss, y, { align: "right" });
          }
          y += nameLines.length > 1 ? nameLines.length * 4.5 : ROW_H;

          // Open sub-row
          const openInfo = openItems[p.id];
          if (openInfo) {
            checkPage();
            const remaining = Math.max(0, openInfo.unitsPerItem - openInfo.unitsSold);
            const openActual = actuals[`${p.id}_open`] ?? remaining;
            const openDiff = remaining - openActual;
            const openPrice = (openInfo.shotPrice != null && openInfo.shotPrice > 0) ? openInfo.shotPrice : p.price;
            const openLoss = openDiff > 0 ? openDiff * openPrice : 0;
            doc.setTextColor(180, 100, 20);
            doc.setFontSize(7);
            const label = openInfo.type === "bottle" ? "🍾 Open bottle" : "🚬 Open pack";
            doc.text(`  ↳ ${label}`, COL.name, y);
            doc.text(String(remaining), COL.qty, y, { align: "right" });
            doc.text(String(openActual), COL.actual, y, { align: "right" });
            if (openLoss > 0) {
              doc.setTextColor(220, 38, 38);
              doc.text(`-$${openLoss.toFixed(2)}`, COL.loss, y, { align: "right" });
            } else {
              doc.setTextColor(180, 100, 20);
              doc.text("—", COL.loss, y, { align: "right" });
            }
            doc.setTextColor(0, 0, 0);
            y += ROW_H;
          }
        }
        y += 4;
      }

      addFootersToAllPages(doc);
      const filename = `stock-check-${catFilter ?? "all"}-${dateStr.replace(/\//g, "-")}.pdf`;
      await downloadPdf(filename, doc.output("datauristring"));
    } catch (e: any) {
      toast.error("PDF failed: " + (e?.message ?? "unknown"));
    } finally {
      setPdfBusy(null);
    }
  };

  return (
    <div>
      {/* ── Sticky sub-header ─────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 -mt-3">
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
        {/* Column header row — orange, full bleed */}
        <div className="-mx-3 flex items-center py-2 px-3 gap-2 text-xs font-black text-black uppercase tracking-wide border-b border-black/20" style={{ background: "var(--gradient-hero)" }}>
          <div className="w-8 shrink-0" />
          <div className="flex-1 min-w-0">Name</div>
          <div className="w-[46px] text-right">Qty</div>
          <div className="w-[60px] text-right">Actual</div>
          <div className="w-[52px] text-right">Price</div>
          <div className="w-[56px] text-right">Loss</div>
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
          {/* ── Item groups ─────────────────────────────────────────────── */}
          <div className="pb-10">
            {grouped.map(({ cat, products }, groupIdx) => (
              <React.Fragment key={cat.value}>
                {/* Category section header with PDF button(s) */}
                <div className="flex items-center justify-between px-3 pt-5 pb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-base leading-none">{cat.icon}</span>
                    <span
                      className="text-xs font-black uppercase tracking-widest"
                      style={{ color: "var(--primary)" }}
                    >
                      {cat.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {/* Beer gets an extra "All" PDF button */}
                    {groupIdx === 0 && (
                      <button
                        type="button"
                        onClick={() => generatePdf(null)}
                        disabled={pdfBusy !== null}
                        className="flex items-center gap-1 h-6 px-2 rounded-lg text-[10px] font-black transition active:scale-95 disabled:opacity-50"
                        style={{ background: "rgba(255,255,255,0.08)", border: "1px solid var(--border)", color: "var(--foreground)" }}
                      >
                        {pdfBusy === "all" ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileDown className="h-3 w-3" />}
                        All
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => generatePdf(cat.value)}
                      disabled={pdfBusy !== null}
                      className="flex items-center gap-1 h-6 px-2 rounded-lg text-[10px] font-black transition active:scale-95 disabled:opacity-50"
                      style={{ background: "rgba(251,146,60,0.12)", border: "1px solid rgba(251,146,60,0.35)", color: "var(--primary)" }}
                    >
                      {pdfBusy === cat.value ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileDown className="h-3 w-3" />}
                      {cat.label}
                    </button>
                  </div>
                </div>

                {products.map((p) => {
                  const actual = actuals[p.id] ?? p.stock_qty;
                  const diff = p.stock_qty - actual;
                  const loss = diff > 0 ? diff * p.price : 0;
                  const isActive = activeNumpadId === p.id;
                  const hasLoss = loss > 0;
                  const openInfo = openItems[p.id];

                  // Open item actuals keyed separately so sealed and open track independently
                  const openKey = `${p.id}_open`;
                  const remaining = openInfo ? Math.max(0, openInfo.unitsPerItem - openInfo.unitsSold) : null;
                  const openActual = openInfo ? (actuals[openKey] ?? remaining ?? 0) : null;
                  const openDiff = openInfo && openActual !== null ? remaining! - openActual : 0;
                  const openPrice = (openInfo?.shotPrice != null && openInfo.shotPrice > 0) ? openInfo.shotPrice : p.price;
                  const openLoss = openDiff > 0 ? openDiff * openPrice : 0;
                  const isOpenActive = activeNumpadId === openKey;

                  return (
                    <React.Fragment key={p.id}>
                      {/* ── Sealed item row ── */}
                      <div
                        className="flex items-center gap-2 px-3 py-2 border-t border-border/40 transition"
                        style={hasLoss ? { background: "rgba(239,68,68,0.04)" } : {}}
                      >
                        {/* Thumbnail */}
                        <div
                          className="h-8 w-8 rounded-lg overflow-hidden border border-border shrink-0 flex items-center justify-center text-base"
                          style={{ background: "var(--gradient-card)" }}
                        >
                          {p.image_url ? (
                            <img
                              src={productImageUrl(p.image_url)!}
                              alt=""
                              className="h-full w-full object-cover"
                              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                            />
                          ) : (
                            categoryIcon(p.category ?? "drinks")
                          )}
                        </div>

                        {/* Name */}
                        <div className="flex-1 min-w-0">
                          <span className="font-bold text-xs leading-tight line-clamp-2">{p.name}</span>
                        </div>

                        {/* Qty — sealed bottles in stock */}
                        <div className="w-[46px] flex justify-end">
                          <span className={`font-black text-xs ${p.stock_qty === 0 ? "text-red-400" : p.stock_qty <= 5 ? "text-yellow-400" : "text-green-400"}`}>
                            {p.stock_qty}
                          </span>
                        </div>

                        {/* Actual — always editable */}
                        <div className="w-[60px] flex justify-end">
                          <button
                            type="button"
                            onClick={() => setActiveNumpadId(isActive ? null : p.id)}
                            className="flex items-center gap-1 h-8 px-2 rounded-lg border font-black text-xs transition active:scale-95"
                            style={{
                              background: isActive ? "rgba(251,146,60,0.15)" : "var(--gradient-card)",
                              borderColor: isActive ? "var(--primary)" : hasLoss ? "rgba(239,68,68,0.50)" : "var(--border)",
                              color: isActive ? "var(--primary)" : hasLoss ? "#f87171" : "var(--foreground)",
                              minWidth: "44px",
                            }}
                          >
                            <span>{actual}</span>
                            <Pencil className="h-2.5 w-2.5 shrink-0 opacity-60" />
                          </button>
                        </div>

                        {/* Price */}
                        <div className="w-[52px] text-right">
                          <span className="font-bold text-xs text-muted-foreground">${p.price.toFixed(2)}</span>
                        </div>

                        {/* Loss */}
                        <div className="w-[56px] text-right">
                          {hasLoss
                            ? <span className="font-black text-xs text-red-400 tabular-nums">−${loss.toFixed(2)}</span>
                            : <span className="font-black text-xs text-muted-foreground/40">—</span>}
                        </div>
                      </div>

                      {/* ── Open sub-row (indented, below sealed) ── */}
                      {openInfo && remaining !== null && openActual !== null && (
                        <div
                          className="flex items-center gap-2 px-3 py-1.5 border-t border-dashed border-border/30"
                          style={{ background: openLoss > 0 ? "rgba(239,68,68,0.04)" : "rgba(251,146,60,0.04)", paddingLeft: "24px" }}
                        >
                          {/* Indent spacer + open label */}
                          <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 text-sm"
                            style={{ background: "rgba(251,146,60,0.12)", border: "1px solid rgba(251,146,60,0.25)" }}>
                            {openInfo.type === "bottle" ? "🍾" : "🚬"}
                          </div>

                          {/* Name */}
                          <div className="flex-1 min-w-0">
                            <span className="text-xs font-black" style={{ color: "var(--primary)" }}>
                              {openInfo.type === "bottle" ? "Open bottle" : openInfo.packType === "retail" ? "Open pack" : "Open papers"}
                            </span>
                            <p className="text-[10px] text-muted-foreground">
                              {openInfo.unitsSold} sold · {remaining} left
                            </p>
                          </div>

                          {/* Qty = remaining drinks */}
                          <div className="w-[46px] flex justify-end">
                            <span className={`font-black text-xs ${remaining === 0 ? "text-red-400" : remaining <= 3 ? "text-yellow-400" : "text-green-400"}`}>
                              {remaining}
                            </span>
                          </div>

                          {/* Actual — editable, tracks open bottle loss */}
                          <div className="w-[60px] flex justify-end">
                            <button
                              type="button"
                              onClick={() => setActiveNumpadId(isOpenActive ? null : openKey)}
                              className="flex items-center gap-1 h-8 px-2 rounded-lg border font-black text-xs transition active:scale-95"
                              style={{
                                background: isOpenActive ? "rgba(251,146,60,0.15)" : "var(--gradient-card)",
                                borderColor: isOpenActive ? "var(--primary)" : openLoss > 0 ? "rgba(239,68,68,0.50)" : "var(--border)",
                                color: isOpenActive ? "var(--primary)" : openLoss > 0 ? "#f87171" : "var(--foreground)",
                                minWidth: "44px",
                              }}
                            >
                              <span>{openActual}</span>
                              <Pencil className="h-2.5 w-2.5 shrink-0 opacity-60" />
                            </button>
                          </div>

                          {/* Price */}
                          <div className="w-[52px] text-right">
                            <span className="font-bold text-xs text-muted-foreground">${openPrice.toFixed(2)}</span>
                          </div>

                          {/* Loss */}
                          <div className="w-[56px] text-right">
                            {openLoss > 0
                              ? <span className="font-black text-xs text-red-400 tabular-nums">−${openLoss.toFixed(2)}</span>
                              : <span className="font-black text-xs text-muted-foreground/40">—</span>}
                          </div>
                        </div>
                      )}
                    </React.Fragment>
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
      {activeProductForNumpad && (
        <ActualNumpad
          product={activeIsOpen
            ? {
                ...activeProductForNumpad,
                // For open row: system qty = remaining drinks
                stock_qty: Math.max(0, (activeProductForNumpad.units_per_item ?? 0) - ((openItems[activeProductForNumpad.id]?.unitsSold) ?? 0)),
              }
            : activeProductForNumpad
          }
          currentActual={
            activeIsOpen
              ? (actuals[activeNumpadId!] ?? Math.max(0, (activeProductForNumpad.units_per_item ?? 0) - ((openItems[activeProductForNumpad.id]?.unitsSold) ?? 0)))
              : (actuals[activeNumpadId!] ?? activeProductForNumpad.stock_qty)
          }
          onClose={() => setActiveNumpadId(null)}
          onSave={(newActual) => saveActual(activeNumpadId!, newActual)}
          priceOverride={
            activeIsOpen
              ? (() => {
                  const info = openItems[activeProductForNumpad.id];
                  return (info?.shotPrice != null && info.shotPrice > 0) ? info.shotPrice : undefined;
                })()
              : undefined
          }
        />
      )}
    </div>
  );
}

export default StockCheckPage;
