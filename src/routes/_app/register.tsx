import React, { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useChain } from "@/lib/ChainContext";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Trash2, Minus, Plus, Loader2, X, CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { CATEGORIES, type CategoryValue, categoryIcon, categoryKey } from "@/lib/categories";
import { useTranslation } from "@/lib/i18n";
import { useNetworkStatus } from "@/lib/useNetworkStatus";
import { enqueue } from "@/lib/offlineQueue";
import { useImageCache } from "@/lib/useImageCache";
import { productImageUrl } from "@/lib/imageUrl";
import {
  cacheProducts, getCachedProducts,
  cacheBarSession, getCachedBarSession,
  cacheCreditAccounts, getCachedCreditAccounts,
  type CachedProduct,
} from "@/lib/offlineCache";

type BottleVariation = { key: string; label: string; units_consumed: number; price: number };
type Product = { id: string; name: string; price: number; cost_price?: number; image_url: string | null; category?: CategoryValue; stock_qty?: number; units_per_item?: number; bottle_variations?: BottleVariation[] | null };
type CartItem = Product & { qty: number; _discount?: number; _originalPrice?: number };
type OpenedBottle = {
  id: string; owner_id: string; product_id: string; product_name: string;
  shot_price: number; shots_sold: number; revenue: number;
  opened_at: string; finished_at: string | null; status: string;
  variation_counts: Record<string, number>;
  units_consumed: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// Memoized product card — only re-renders when its own data actually changes.
// Keeping this outside RegisterPage means category tab switches don't touch
// cards that haven't changed at all.
// ─────────────────────────────────────────────────────────────────────────────
type ProductCardProps = {
  p: Product;
  inCartQty: number; // 0 = not in cart
  // Resolved image src string — passed as a plain value so React.memo can do
  // a simple equality check. Each card re-renders only when its own image
  // resolves, not when any other product's image finishes loading.
  resolvedImgSrc: string | null;
  onAdd: (p: Product) => void;
  onRemove: (id: string) => void;
  onDec: (id: string) => void;
};
const ProductCard = React.memo(function ProductCard({ p, inCartQty, resolvedImgSrc, onAdd, onRemove, onDec }: ProductCardProps) {
  const outOfStock  = (p.stock_qty ?? 1) === 0;
  const incomplete  = !p.price || Number(p.price) <= 0;
  const inCart      = inCartQty > 0;
  return (
    <div data-bar-id={p.id} className="relative">
      <button
        onClick={() => !outOfStock && !incomplete && onAdd(p)}
        disabled={outOfStock || incomplete}
        className={`group relative rounded-2xl overflow-hidden border flex flex-col transition w-full ${outOfStock || incomplete ? "cursor-not-allowed opacity-50 grayscale" : "active:scale-95"}`}
        style={{
          background: "var(--gradient-card)",
          boxShadow: "var(--shadow-elegant)",
          borderColor: inCart ? "var(--primary)" : "var(--border)",
        }}
      >
        <div className="aspect-[3/4] relative w-full">
          {p.image_url ? (
            <img
              src={resolvedImgSrc ?? p.image_url}
              alt=""
              loading="eager"
              decoding="async"
              className="absolute inset-0 w-full h-full object-contain"
              onError={(e) => {
                const img = e.currentTarget as HTMLImageElement;
                img.style.display = "none";
                const fb = img.nextElementSibling as HTMLElement | null;
                if (fb) fb.style.display = "flex";
              }}
            />
          ) : null}
          <div className="absolute inset-0 items-center justify-center text-4xl"
            style={{ display: p.image_url ? "none" : "flex" }}>
            {categoryIcon(p.category ?? "drinks")}
          </div>
          {p.stock_qty !== undefined && !outOfStock && (
            <div className="absolute top-1.5 left-1.5 h-6 min-w-[1.5rem] px-1.5 rounded-full flex items-center justify-center bg-black/70 shadow">
              <span className="text-[10px] font-black text-white leading-none">{p.stock_qty}</span>
            </div>
          )}
          {inCart && (
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(p.id); }}
              className="absolute top-1.5 right-1.5 h-8 w-8 rounded-full flex items-center justify-center active:scale-90 transition text-black shadow z-10"
              style={{ background: "#dc2626" }}
            >
              <X className="h-4 w-4" />
            </button>
          )}
          {inCart && (
            <div className="absolute top-10 left-0 right-0 flex items-center justify-center gap-4 py-3"
              style={{ background: "rgba(0,0,0,0.75)" }}>
              <button
                onClick={(e) => { e.stopPropagation(); onDec(p.id); }}
                className="h-8 w-8 rounded-full flex items-center justify-center active:scale-90 transition"
                style={{ background: "#ef4444" }}
              >
                <Minus className="h-4 w-4 text-black" />
              </button>
              <div className="h-8 w-8 rounded-full flex items-center justify-center text-sm font-black text-black"
                style={{ background: "var(--gradient-hero)" }}>
                {inCartQty}
              </div>
            </div>
          )}
          {outOfStock && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-950/75 backdrop-blur-[1px]">
              <div className="bg-red-600 rounded-xl px-2 py-1 shadow-lg">
                <span className="text-white text-[10px] font-black uppercase tracking-wider leading-none">Out of Stock</span>
              </div>
            </div>
          )}
          {!outOfStock && incomplete && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-[1px]">
              <div className="rounded-xl px-2 py-1 shadow-lg" style={{ background: "#92400e" }}>
                <span className="text-white text-[10px] font-black uppercase tracking-wider leading-none">No Price</span>
              </div>
            </div>
          )}
          {!outOfStock && !incomplete && !inCart && (p.stock_qty ?? 1) >= 1 && (p.stock_qty ?? 1) <= 5 && (
            <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-full bg-red-600 shadow">
              <span className="text-[9px] font-black uppercase tracking-wide text-white leading-none">Low</span>
            </div>
          )}
        </div>
        <div className="px-1.5 py-1.5 border-t border-border/30" style={{ background: "rgba(var(--primary-rgb,251 146 60)/0.10)", borderTop: "1px solid rgba(var(--primary-rgb,251 146 60)/0.35)" }}>
          <div className="font-bold text-[11px] truncate leading-tight" style={{ color: "var(--primary)" }}>{p.name}</div>
          <div className="font-black text-xs mt-0.5" style={{ color: "var(--primary)" }}>${Number(p.price).toFixed(2)}</div>
        </div>
      </button>
    </div>
  );
});

type ProductGridProps = {
  barOrdered: Product[];
  cartQtyMap: Record<string, number>; // productId → qty in cart (0 = not in cart)
  // Map of productId → resolved image src string (objectURL or original URL).
  // Passing pre-resolved strings lets React.memo do a cheap string equality
  // check per card instead of comparing a shared function reference.
  resolvedImgMap: Record<string, string | null>;
  onAdd: (p: Product) => void;
  onRemove: (id: string) => void;
  onDec: (id: string) => void;
  onEnterEditMode: () => void;
  showSortButton: boolean;
  sortLabel: string;
};
const ProductGrid = React.memo(function ProductGrid({
  barOrdered, cartQtyMap, resolvedImgMap, onAdd, onRemove, onDec,
  onEnterEditMode, showSortButton, sortLabel,
}: ProductGridProps) {
  return (
    <>
      <div
        className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-6 gap-2"
        onContextMenu={(e) => e.preventDefault()}
      >
        {barOrdered.map((p) => (
          <ProductCard
            key={p.id}
            p={p}
            inCartQty={cartQtyMap[p.id] ?? 0}
            resolvedImgSrc={resolvedImgMap[p.id] ?? null}
            onAdd={onAdd}
            onRemove={onRemove}
            onDec={onDec}
          />
        ))}
      </div>
      {showSortButton && (
        <div className="pt-3 pb-1">
          <button
            onClick={onEnterEditMode}
            className="w-full h-12 rounded-2xl font-black text-sm active:scale-[0.98] transition border"
            style={{ background: "rgba(251,146,60,0.08)", color: "var(--primary)", borderColor: "rgba(251,146,60,0.30)" }}
          >
            {sortLabel}
          </button>
        </div>
      )}
    </>
  );
});

export default function RegisterPage() {
  const { profile, refreshProfile } = useAuth();
  const { effectiveOwnerId } = useChain();
  const { t } = useTranslation();
  const { isOnline } = useNetworkStatus();
  const nav = useNavigate();

  const ownerId = effectiveOwnerId(profile?.role === "owner" ? profile.id : (profile?.parent_id ?? ""));

  // Managers have no register page — send them to /products
  useEffect(() => {
    if (!profile) return;
    const isManager = profile.role === "manager" || (profile as any)?.job_title === "manager";
    if (isManager) {
      nav("/products");
    }
  }, [profile]);

  // Machines-only accounts have no register page — send them to /machines
  useEffect(() => {
    if ((profile as any)?.is_machines_account) {
      nav("/machines");
    }
  }, [profile]);

  // ── Bar session state — blocks sales when bar is closed ────────────────────
  const [barSessionStart, setBarSessionStart] = useState<string | null>(null);
  const [barClosedAt,     setBarClosedAt]     = useState<string | null>(null);
  // Start as false — only set true once we have an ownerId and kick off the fetch
  const [barSessionLoading, setBarSessionLoading] = useState(false);
  // Delay showing the overlay so we don't flash it during initial profile/ownerId resolution
  const [barOverlayReady, setBarOverlayReady] = useState(false);
  const barIsOpen = !!barSessionStart && !barClosedAt;

  useEffect(() => {
    if (!ownerId) return;
    setBarSessionLoading(true);
    setBarOverlayReady(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from("profiles")
      .select("bar_session_start, bar_closed_at")
      .eq("id", ownerId)
      .single()
      .then(async ({ data, error }: { data: { bar_session_start: string | null; bar_closed_at: string | null } | null; error: unknown }) => {
        if (data) {
          // Network success — update state and refresh cache
          setBarSessionStart(data.bar_session_start ?? null);
          setBarClosedAt(data.bar_closed_at ?? null);
          cacheBarSession(ownerId, {
            bar_session_start: data.bar_session_start ?? null,
            bar_closed_at: data.bar_closed_at ?? null,
          });
        } else {
          // Network failed (offline) — serve from IndexedDB cache
          console.warn("[register] bar session fetch failed, using cache:", error);
          const cached = await getCachedBarSession(ownerId);
          if (cached) {
            setBarSessionStart(cached.bar_session_start);
            setBarClosedAt(cached.bar_closed_at);
          }
        }
        setBarSessionLoading(false);
        // Small delay so the overlay only appears after the data is confirmed — no flash
        setTimeout(() => setBarOverlayReady(true), 150);
      });

    // Realtime: watch for bar open/close changes on the owner profile
    const ch = supabase
      .channel(`bar-session-register-${ownerId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${ownerId}` },
        (payload) => {
          const rec = payload.new as Record<string, unknown>;
          const newStart = "bar_session_start" in rec ? (rec.bar_session_start as string | null) ?? null : undefined;
          const newClosed = "bar_closed_at" in rec ? (rec.bar_closed_at as string | null) ?? null : undefined;
          if (newStart !== undefined) setBarSessionStart(newStart);
          if (newClosed !== undefined) setBarClosedAt(newClosed);
          // Keep IndexedDB cache in sync with realtime updates
          if (newStart !== undefined || newClosed !== undefined) {
            getCachedBarSession(ownerId).then((prev) => {
              cacheBarSession(ownerId, {
                bar_session_start: newStart !== undefined ? newStart : (prev?.bar_session_start ?? null),
                bar_closed_at:     newClosed !== undefined ? newClosed : (prev?.bar_closed_at ?? null),
              });
            });
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [ownerId]);

  // ── Bar open / close toggle (owner only) ─────────────────────────────────
  const [barToggleBusy, setBarToggleBusy] = useState(false);
  const [showFloatModal, setShowFloatModal] = useState(false);
  const [floatBarAmount, setFloatBarAmount] = useState("");
  const [floatMachineAmount, setFloatMachineAmount] = useState("");
  const [hasMachinesAddon, setHasMachinesAddon] = useState(false);
  const [isMachinesAccount, setIsMachinesAccount] = useState(false);
  const [activeFloatField, setActiveFloatField] = useState<"bar" | "machine" | null>(null);
  const [showBarOpenedOverlay, setShowBarOpenedOverlay] = useState(false);

  const handleOpenBar = async () => {
    // Check if machines addon is active before showing float modal
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: ownerRow } = await (supabase as any)
      .from("profiles")
      .select("machines_addon_active, plan_type, is_machines_account, bar_addon_active")
      .eq("id", ownerId)
      .single();

    const planType: string = ownerRow?.plan_type ?? "";
    const isMachinesOnlyPlan = planType === "machines_only" || !!(ownerRow?.is_machines_account);
    const hasBarAddon        = !!(ownerRow?.bar_addon_active);
    const hasMachinesAddon   = !!(ownerRow?.machines_addon_active) || planType === "premium" || planType === "chain" || isMachinesOnlyPlan;

    const showBarFloat     = !isMachinesOnlyPlan || hasBarAddon;
    const showMachineFloat = hasMachinesAddon;

    setHasMachinesAddon(showMachineFloat);
    setIsMachinesAccount(!showBarFloat);
    setFloatBarAmount("");
    setFloatMachineAmount("");
    setActiveFloatField(null);
    setShowFloatModal(true);
  };

  const confirmOpenBarWithFloat = async () => {
    const barFloatVal = isMachinesAccount ? 0 : parseInt(floatBarAmount, 10);
    if (!isMachinesAccount && (isNaN(barFloatVal) || barFloatVal < 0)) { toast.error("Enter a valid bar float amount"); return; }
    if (hasMachinesAddon) {
      const machineFloatVal = parseInt(floatMachineAmount, 10);
      if (isNaN(machineFloatVal) || machineFloatVal < 0) { toast.error("Enter a valid machine float amount"); return; }
    }
    setBarToggleBusy(true);

    // Guard: do not create a new session if one is already open
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingOpen } = await (supabase as any).from("bar_sessions")
      .select("id").eq("owner_id", ownerId).is("closed_at", null).limit(1).maybeSingle();
    if (existingOpen) {
      setBarToggleBusy(false);
      toast.error("Bar is already open — close the current session first");
      return;
    }

    const now = new Date().toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("profiles")
      .update({ bar_session_start: now, bar_closed_at: null, cashier_float: barFloatVal, cashier_float_set_at: now })
      .eq("id", ownerId);
    if (error) { setBarToggleBusy(false); toast.error("Failed to open bar: " + error.message); return; }

    // Insert machine float session if machines addon active
    if (hasMachinesAddon) {
      const machineAmt = parseInt(floatMachineAmount, 10) || 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("machine_float_sessions").insert({ owner_id: ownerId, amount: machineAmt, set_at: now });
    }

    // Insert bar_sessions parent row + first sub-session
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: newSession } = await (supabase as any).from("bar_sessions")
      .insert({ owner_id: ownerId, opened_at: now })
      .select("id").single();
    if (newSession?.id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("bar_sub_sessions").insert({
        owner_id: ownerId,
        bar_session_id: newSession.id,
        opened_at: now,
        cashier_float: barFloatVal,
      });
    }

    setBarToggleBusy(false);
    setShowFloatModal(false);
    setBarSessionStart(now);
    setBarClosedAt(null);
    toast.success("🟢 Bar opened at " + new Date(now).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true }));
    setShowBarOpenedOverlay(true);
  };

  const handleCloseBar = async () => {
    setBarToggleBusy(true);
    const now = new Date().toISOString();
    // Close open sub-sessions
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("bar_sub_sessions")
      .update({ closed_at: now }).eq("owner_id", ownerId).is("closed_at", null);
    // Close open bar_session row
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("bar_sessions")
      .update({ closed_at: now }).eq("owner_id", ownerId).is("closed_at", null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("profiles").update({ bar_closed_at: now }).eq("id", ownerId);
    setBarToggleBusy(false);
    if (error) { toast.error("Failed to close bar: " + error.message); return; }
    setBarClosedAt(now);
    toast.success("🔴 Bar closed");
  };

  const [products, setProducts] = useState<Product[]>([]);
  const [category, setCategory] = useState<CategoryValue>("beers");
  // Stable array reference — only changes when the product list actually changes,
  // not on every cart state update. Without useMemo, every tap (cart change) would
  // create a new array and re-trigger the entire IndexedDB read pipeline.
  const productImageUrls = useMemo(
    () => products.map((p) => productImageUrl(p.image_url)),
    [products]
  );
  // Preload all product images — returns imgSrc() helper that serves objectURLs
  // from IndexedDB instantly, falling back to the network URL while loading.
  const imgSrc = useImageCache(productImageUrls);

  // Pre-resolve image sources into a plain id→src map so ProductGrid/ProductCard
  // receive stable string values. React.memo can then do a simple string equality
  // check per card — a card only re-renders when its own image resolves, not when
  // any other image finishes loading.
  const resolvedImgMap = useMemo(() => {
    const m: Record<string, string | null> = {};
    products.forEach((p) => {
      const url = productImageUrl(p.image_url);
      m[p.id] = url ? imgSrc(url) : null;
    });
    return m;
  // imgSrc is stable (empty deps []); products changes trigger productImageUrls
  // → useImageCache effect → new objectUrlMap → imgSrc reads fresh ref value.
  // We rebuild this map whenever either products or the imgSrc function changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, imgSrc]);
  // Initialize cart from localStorage on mount
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem(`bartap-cart-${ownerId}`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [loading, setLoading] = useState(false);
  const [cashOpen, setCashOpen] = useState(false);
  const [creditOpen, setCreditOpen] = useState(false);

  // Persist cart to localStorage whenever it changes
  useEffect(() => {
    if (ownerId) {
      localStorage.setItem(`bartap-cart-${ownerId}`, JSON.stringify(cart));
    }
  }, [cart, ownerId]);

  // Stable map of productId → qty for passing to memoized ProductCard/ProductGrid
  // without triggering full re-renders on every cart change
  const cartQtyMap = useMemo(() => {
    const m: Record<string, number> = {};
    cart.forEach((i) => { m[i.id] = i.qty; });
    return m;
  }, [cart]);

  // Stable fetch — always reads latest ownerId via ref
  const ownerIdRef = useRef(ownerId);
  useEffect(() => { ownerIdRef.current = ownerId; }, [ownerId]);

  const fetchProducts = useCallback(async () => {
    const id = ownerIdRef.current;
    if (!id) return;
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("owner_id", id)
      .order("name", { ascending: true });
    if (data) {
      // Network success — update state and refresh the cache
      setProducts((data ?? []) as Product[]);
      setLoading(false);
      cacheProducts(id, data as CachedProduct[]);
    } else {
      // Network failed (offline) — serve from IndexedDB cache
      console.warn("[register] fetchProducts network error:", error?.message ?? "offline");
      const cached = await getCachedProducts(id);
      if (cached.length > 0) {
        setProducts(cached as Product[]);
      }
      setLoading(false);
    }
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
    return products.filter((p) => (p.category || "beers") === category);
  }, [products, category]);

  // ── Bar sort order ────────────────────────────────────────────────────────
  const [barSortMap, setBarSortMap] = useState<Record<string, number>>({});
  const [barEditMode, setBarEditMode] = useState(false);
  const [barSelectedId, setBarSelectedId] = useState<string | null>(null);
  const [barOrdered, setBarOrdered] = useState<Product[]>([]);
  const barEditModeRef = useRef(false);
  const barSortMapRef = useRef<Record<string, number>>({});
  const barOrderedRef = useRef<Product[]>([]);
  const profileIdRef = useRef(profile?.id);
  useEffect(() => { profileIdRef.current = profile?.id; }, [profile?.id]);
  const cartLengthRef = useRef(0);
  // Ref for the edit-mode grid — used to block native long-press browser behaviour
  const barEditGridRef = useRef<HTMLDivElement>(null);

  // Pre-sort all categories at once so switching tabs is a map lookup, not a re-sort
  const allCategorySorted = useMemo(() => {
    const map: Record<string, Product[]> = {};
    for (const cat of CATEGORIES) {
      map[cat.value] = applyBarSort(products, cat.value, barSortMapRef.current);
    }
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, barSortMap]);

  // Block the browser's built-in long-press (context menu / text-selection grab)
  // which steals touch focus and freezes buttons. Must be non-passive so we can
  // call preventDefault().
  useEffect(() => {
    const el = barEditGridRef.current;
    if (!el) return;
    const block = (e: TouchEvent) => {
      if (barEditModeRef.current) e.preventDefault();
    };
    el.addEventListener("touchstart", block, { passive: false });
    return () => el.removeEventListener("touchstart", block);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadBarSort = async () => {
    const pid = profileIdRef.current;
    if (!pid) return;
    const { data } = await (supabase as any)
      .from("bar_sort_order").select("order_json").eq("owner_id", pid).maybeSingle();
    const arr: string[] = data?.order_json && Array.isArray(data.order_json) ? data.order_json : [];
    const map: Record<string, number> = {};
    arr.forEach((id: string, i: number) => { map[id] = i; });
    barSortMapRef.current = map;
    setBarSortMap(map);
  };

  const saveBarSortIds = (newCatIds: string[]) => {
    const pid = profileIdRef.current;
    if (!pid) return;
    // Merge the new category order into the full map, keeping all other categories' positions
    const currentMap = barSortMapRef.current;
    const newMap = { ...currentMap };
    newCatIds.forEach((id, idx) => { newMap[id] = idx; });
    // Rebuild a flat ordered array: all ids sorted by their position in the map
    const allIds = Object.entries(newMap)
      .sort(([, a], [, b]) => a - b)
      .map(([id]) => id);
    (supabase as any).from("bar_sort_order").upsert(
      { owner_id: pid, order_json: allIds, updated_at: new Date().toISOString() },
      { onConflict: "owner_id" }
    ).then(() => {}).catch(() => {});
  };

  function applyBarSort(prods: Product[], cat: string, map: Record<string, number>) {
    return [...prods.filter(p => (p.category || "beers") === cat)].sort((a, b) => {
      const ia = map[a.id] ?? Infinity;
      const ib = map[b.id] ?? Infinity;
      if (ia !== ib) return ia - ib;
      return a.name.localeCompare(b.name);
    });
  }

  const barEnterEditMode = useCallback(() => {
    if (barEditModeRef.current) return;
    barEditModeRef.current = true;
    setBarEditMode(true);
  }, []);

  const handleBarDone = () => {
    barEditModeRef.current = false;
    setBarEditMode(false);
    setBarSelectedId(null);
  };

  // Load bar sort on mount and sync barOrdered when products/category/sort changes
  useEffect(() => {
    if (ownerId) loadBarSort();
  }, [ownerId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (barEditModeRef.current) return;
    const sorted = allCategorySorted[category] ?? applyBarSort(products, category, barSortMapRef.current);
    barOrderedRef.current = sorted;
    setBarOrdered(sorted);
  }, [products, barSortMap]); // category changes are handled synchronously in the tab click handler

  // Track cart length via ref so handlers always see live value
  useEffect(() => {
    cartLengthRef.current = cart.length;
  }, [cart.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const rawTotal = useMemo(() => cart.reduce((s, i) => s + i.qty * Number(i.price), 0), [cart]);
  const cartCount = useMemo(() => cart.reduce((s, i) => s + i.qty, 0), [cart]);

  // ── Specials: load active deals for this owner ─────────────────────────────
  type Special = {
    id: string; name: string; special_price: number; required_qty: number;
    product_ids: string[]; is_recurring: boolean; run_days: number[];
    start_date: string; start_time: string | null;
    end_date: string | null; end_time: string | null; active: boolean;
  };
  const [activeSpecials, setActiveSpecials] = useState<Special[]>([]);

  useEffect(() => {
    const id = ownerIdRef.current;
    if (!id) return;
    const loadSpecials = async () => {
      const { data } = await (supabase as any)
        .from("specials")
        .select("*")
        .eq("owner_id", id)
        .eq("active", true);
      setActiveSpecials((data ?? []) as Special[]);
    };
    loadSpecials();
    // Refresh when specials change for this owner
    const ch = supabase
      .channel(`specials-register-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "specials", filter: `owner_id=eq.${id}` },
        () => loadSpecials()
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [ownerId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Specials: compute total with bundle pricing applied ───────────────────
  const { total, appliedSpecial, specialBundles } = useMemo(() => {
    // Helper: is this special active right now?
    const isLive = (s: Special) => {
      const now = new Date();
      const today = now.toISOString().split("T")[0];
      const nowTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      if (today < s.start_date) return false;
      if (today === s.start_date && s.start_time && nowTime < s.start_time) return false;
      if (s.end_date) {
        if (today > s.end_date) return false;
        if (today === s.end_date && s.end_time && nowTime > s.end_time) return false;
      }
      if (s.is_recurring && s.run_days.length > 0) return s.run_days.includes(now.getDay());
      return true;
    };

    // Expand cart into a flat list of individual product ids (one per unit)
    const cartUnits: string[] = [];
    for (const item of cart) {
      for (let i = 0; i < item.qty; i++) cartUnits.push(item.id);
    }

    let bestSaving = 0;
    let bestSpecial: Special | null = null;
    let bestBundles = 0;

    for (const s of activeSpecials) {
      if (!isLive(s)) continue;
      // Count how many cart units are eligible
      const eligible = cartUnits.filter((id) => s.product_ids.includes(id));
      const bundles = Math.floor(eligible.length / s.required_qty);
      if (bundles === 0) continue;
      // Normal cost of those eligible items
      const normalCost = eligible.slice(0, bundles * s.required_qty)
        .reduce((sum, id) => {
          const item = cart.find((c) => c.id === id);
          return sum + Number(item?.price ?? 0);
        }, 0);
      const specialCost = bundles * s.special_price;
      const saving = normalCost - specialCost;
      if (saving > bestSaving) {
        bestSaving = saving;
        bestSpecial = s;
        bestBundles = bundles;
      }
    }

    const finalTotal = rawTotal - bestSaving;
    return { total: finalTotal, appliedSpecial: bestSpecial, specialBundles: bestBundles };
  }, [cart, rawTotal, activeSpecials]);

  // Close cash overlay immediately if cart becomes empty (e.g. order/item deleted)
  useEffect(() => {
    if (cashOpen && cart.length === 0) setCashOpen(false);
  }, [cart, cashOpen]);

  const addToCart = useCallback((p: Product) => {
    // Block items with no price or no cost price set
    if (!p.price || Number(p.price) <= 0) {
      toast.error(`${p.name} has no sale price set. Ask the owner to update it in Items.`);
      return;
    }
    if (!p.cost_price || Number(p.cost_price) <= 0) {
      toast.error(`${p.name} has no cost price set. Ask the owner to update it in Items.`);
      return;
    }
    setCart((c) => {
      const ex = c.find((i) => i.id === p.id);
      const currentQty = ex?.qty ?? 0;
      const availableStock = p.stock_qty ?? Infinity;
      
      // Don't add if we've already reached the stock limit
      if (currentQty >= availableStock) {
        toast.error(`Only ${availableStock} in stock`);
        return c;
      }
      
      return ex ? c.map((i) => (i.id === p.id ? { ...i, qty: i.qty + 1 } : i)) : [...c, { ...p, qty: 1 }];
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const dec = useCallback((id: string) =>
    setCart((c) => c.flatMap((i) => (i.id === id ? (i.qty > 1 ? [{ ...i, qty: i.qty - 1 }] : []) : [i]))), []);

  const removeItem = useCallback((id: string) => setCart((c) => c.filter((i) => i.id !== id)), []);

  // ΓöÇΓöÇ Opened Bottles state ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  const [openedBottles, setOpenedBottles]       = useState<OpenedBottle[]>([]);
  const [bottlesModalOpen, setBottlesModalOpen] = useState(false);
  const [shotModalOpen, setShotModalOpen]       = useState(false);
  const [shotStep, setShotStep]                 = useState<"select" | "variation">("select");
  const [showNewBottleGrid, setShowNewBottleGrid] = useState(false);
  const [shotBottleId, setShotBottleId]         = useState<string>("");
  const [shotPrice, setShotPrice]               = useState("");
  const [selectedVariation, setSelectedVariation] = useState<BottleVariation | null>(null);
  const selectedBottleRef                       = useRef<HTMLDivElement>(null);
  const [openNewMode, setOpenNewMode]           = useState(false);   // true = picking a new bottle from products
  const [newBottleProductId, setNewBottleProductId] = useState<string>("");
  const [newBottlePrice, setNewBottlePrice]     = useState("");
  const [bottleBusy, setBottleBusy]             = useState(false);
  const [markEmptyBottleId, setMarkEmptyBottleId] = useState<string | null>(null); // confirm modal
  const [cancelBottleId, setCancelBottleId]       = useState<string | null>(null); // confirm modal

  // ΓöÇΓöÇ Opened Packs state (cigarettes retail + rolling paper) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  type OpenedPack = {
    id: string; owner_id: string; product_id: string; product_name: string;
    pack_type: "retail" | "paper"; unit_price: number; units_sold: number;
    revenue: number; opened_at: string; finished_at: string | null; status: string;
  };
  const [openedPacks, setOpenedPacks]             = useState<OpenedPack[]>([]);
  const [packModalOpen, setPackModalOpen]         = useState(false);
  const [packType, setPackType]                   = useState<"retail" | "paper">("retail");
  const [packStep, setPackStep]                   = useState<"select" | "price">("select");
  const [packPackId, setPackPackId]               = useState<string>("");
  const [packPrice, setPackPrice]                 = useState("");
  const [showNewPackGrid, setShowNewPackGrid]     = useState(false);
  const [packBusy, setPackBusy]                   = useState(false);
  const [markEmptyPackId, setMarkEmptyPackId]     = useState<string | null>(null);
  const [cancelPackId, setCancelPackId]           = useState<string | null>(null);
  const [packQty, setPackQty]                     = useState(1);
  const [packSellMode, setPackSellMode]           = useState<"retail" | "special">("retail");
  const [specialQty, setSpecialQty]               = useState(2);
  const [specialPrice, setSpecialPrice]           = useState("");
  // Packs opened mid-order that need reverting if order is cancelled
  const [packsPendingClose, setPacksPendingClose] = useState<string[]>([]);

  // Called after successful order — close packs that hit capacity
  const closeFullPacksAfterOrder = async (completedCart: CartItem[]) => {
    const packQtys = new Map<string, number>();
    for (const item of completedCart) {
      const pid = (item as any)._pack_id as string | undefined;
      if (!pid) continue;
      const units = (item as any)._pack_units ?? item.qty;
      packQtys.set(pid, (packQtys.get(pid) ?? 0) + units);
    }
    for (const [packId, soldQty] of packQtys) {
      const pack = openedPacks.find((p) => p.id === packId);
      if (!pack) continue;
      const prod = products.find((p) => p.id === pack.product_id);
      const cap = prod?.units_per_item ?? 0;
      if (cap > 0 && (pack.units_sold + soldQty) >= cap) {
        await handleFinishPack(packId);
      }
    }
    setPacksPendingClose([]);
  };

  // Called when order is cancelled/cleared — revert any packs opened mid-order
  const revertPendingPacks = async () => {
    for (const packId of packsPendingClose) {
      await handleCancelPack(packId);
    }
    setPacksPendingClose([]);
    for (const bottleId of bottlesPendingCancel) {
      await handleCancelBottle(bottleId);
    }
    setBottlesPendingCancel([]);
  };

  const cigaretteProducts = useMemo(() => {
    const openedProductIds = new Set(openedPacks.map(p => p.product_id));
    return products.filter((p) => {
      if ((p.category || "beers") !== "cigarettes") return false;
      if (openedProductIds.has(p.id)) return false;
      // Require retail pricing to be set up (non-zero retail price variation)
      const hasValidRetailPrice = (p.bottle_variations ?? []).some((v) => v.key === "retail" && v.price > 0);
      if (!hasValidRetailPrice) return false;
      const inCart = cart.filter(c => c.id === p.id).reduce((s, c) => s + c.qty, 0);
      return (p.stock_qty ?? 0) - inCart > 0;
    });
  }, [products, openedPacks, cart]);

  const fetchOpenedPacks = useCallback(async () => {
    const id = ownerIdRef.current;
    if (!id) return;
    const { data } = await supabase
      .from("opened_packs")
      .select("*")
      .eq("owner_id", id)
      .eq("status", "open")
      .order("opened_at", { ascending: false });
    setOpenedPacks((data ?? []) as OpenedPack[]);
  }, []);

  useEffect(() => {
    if (!ownerId) return;
    fetchOpenedPacks();
    const ch = supabase
      .channel(`opened-packs-${ownerId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "opened_packs", filter: `owner_id=eq.${ownerId}` },
        () => fetchOpenedPacks())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [ownerId, fetchOpenedPacks]);

  const addPackUnit = async () => {
    const pack = openedPacks.find((p) => p.id === packPackId);
    if (!pack) { toast.error("Select a pack"); return; }
    const product = products.find((p) => p.id === pack.product_id);
    // Use the retail variation price (set by owner in Items page) not the pack sale price
    const retailVariation = (product?.bottle_variations ?? []).find((v) => v.key === "retail");
    const unitPrice = retailVariation?.price ?? product?.price ?? 0;
    if (unitPrice <= 0) { toast.error("No retail price set for this item — edit the product first"); return; }
    const capacity = product?.units_per_item ?? 0;
    const alreadySold = pack.units_sold;
    const cartQtyForPack = cart.filter((c) => (c as any)._pack_id === pack.id).reduce((s, c) => s + c.qty, 0);
    const remaining = capacity > 0 ? capacity - alreadySold - cartQtyForPack : Infinity;
    const qtyToSell = capacity > 0 ? Math.min(packQty, remaining) : packQty;
    if (qtyToSell <= 0) { toast.error("Pack is empty — open a new pack"); return; }
    const cartId = `pack-${pack.id}-${Date.now()}`;
    setCart((c) => [...c, {
      id: cartId, name: `Retail: ${pack.product_name}`, price: unitPrice,
      image_url: null, category: "cigarettes", qty: qtyToSell,
      _pack_id: pack.id,
    } as CartItem & { _pack_id: string }]);
    // Close modal after adding so cashier can see the cash order button
    setPackQty(1);
    setPackSellMode("retail");
    setPackStep("select");
    setPackPackId("");
    setPackPrice("");
    setPackModalOpen(false);
  };

  const handleFinishPack = async (packId: string) => {
    if (!profile) return;
    setPackBusy(true);
    const { error } = await supabase.rpc("finish_pack", { p_pack_id: packId, p_cashier_id: ownerId });
    setPackBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Pack marked empty — revenue recorded");
    await fetchOpenedPacks();
    refreshProfile();
  };

  const handleCancelPack = async (packId: string) => {
    setPackBusy(true);
    const { error } = await supabase.rpc("cancel_pack", { p_pack_id: packId });
    setPackBusy(false);
    if (error) { toast.error(error.message); return; }
    // Remove any retail cart items that were staged from this pack
    setCart((c) => c.filter((item) => (item as any)._pack_id !== packId));
    toast.success("Pack cancelled — stock restored");
    await fetchOpenedPacks();
    await fetchProducts();
  };

  const liquorProducts = useMemo(
    () => {
      // Count how many bottles of each product are already open
      const openedBottleCounts = new Map<string, number>();
      for (const b of openedBottles) {
        openedBottleCounts.set(b.product_id, (openedBottleCounts.get(b.product_id) ?? 0) + 1);
      }
      return products.filter((p) => {
        if ((p.category || "beers") !== "liquor") return false;
        // Require shot pricing to be set up (non-zero shot price variation)
        const hasValidShotPrice = (p.bottle_variations ?? []).some((v) => v.key === "shot" && v.price > 0);
        if (!hasValidShotPrice) return false;
        // All non-shot variations must also have a price set
        const hasIncompleteVariation = (p.bottle_variations ?? [])
          .filter((v) => v.key !== "shot")
          .some((v) => v.label && v.units_consumed > 0 && v.price <= 0);
        if (hasIncompleteVariation) return false;
        // Subtract how many are already in the cart as whole-bottle sales
        const inCart = cart.filter(c => c.id === p.id).reduce((s, c) => s + c.qty, 0);
        // Subtract open bottles from available stock so we don't open more than we have
        const openedCount = openedBottleCounts.get(p.id) ?? 0;
        return (p.stock_qty ?? 0) - inCart - openedCount > 0;
      });
    },
    [products, openedBottles, cart]
  );

  const fetchOpenedBottles = useCallback(async () => {
    const id = ownerIdRef.current;
    if (!id) return;
    const { data } = await supabase
      .from("opened_bottles")
      .select("*")
      .eq("owner_id", id)
      .eq("status", "open")
      .order("opened_at", { ascending: false });
    setOpenedBottles((data ?? []) as OpenedBottle[]);
  }, []);

  useEffect(() => {
    if (!ownerId) return;
    fetchOpenedBottles();
    const ch = supabase
      .channel(`opened-bottles-${ownerId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "opened_bottles", filter: `owner_id=eq.${ownerId}` },
        () => fetchOpenedBottles()
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [ownerId, fetchOpenedBottles]);

  /** Open a new bottle — deducts 1 stock, creates opened_bottles row */
  const handleOpenNewBottle = async () => {
    if (!newBottleProductId || !newBottlePrice) return;
    setBottleBusy(true);
    const id = ownerIdRef.current;
    if (!id) { setBottleBusy(false); return; }
    const { error } = await supabase.rpc("open_bottle", {
      p_owner_id: id,
      p_product_id: newBottleProductId,
      p_shot_price: parseFloat(newBottlePrice),
    });
    setBottleBusy(false);
    if (error) { toast.error(error.message); return; }
    await fetchOpenedBottles();
    await fetchProducts();
    // Auto-select the newly opened bottle
    const { data } = await supabase
      .from("opened_bottles")
      .select("id")
      .eq("owner_id", id)
      .eq("product_id", newBottleProductId)
      .eq("status", "open")
      .order("opened_at", { ascending: false })
      .limit(1);
    if (data?.[0]) setShotBottleId(data[0].id);
    setShotPrice(newBottlePrice);
    setShotStep("variation");
    setOpenNewMode(false);
    setNewBottleProductId("");
    setNewBottlePrice("");
  };

  // Bottles opened mid-order that need reverting if order is cancelled
  const [bottlesPendingCancel, setBottlesPendingCancel] = useState<string[]>([]);
  const [shotBuffer, setShotBuffer] = useState<Array<{ variation: BottleVariation; qty: number }>>([]);

  /** Add a shot/variation to the cart from an open bottle */
  const addShotToBuffer = (variation: BottleVariation) => {
    setShotBuffer((buf) => {
      const existing = buf.find((b) => b.variation.key === variation.key);
      if (existing) return buf.map((b) => b.variation.key === variation.key ? { ...b, qty: b.qty + 1 } : b);
      return [...buf, { variation, qty: 1 }];
    });
  };

  const removeShotFromBuffer = (varKey: string) => {
    setShotBuffer((buf) => {
      const existing = buf.find((b) => b.variation.key === varKey);
      if (!existing) return buf;
      if (existing.qty <= 1) return buf.filter((b) => b.variation.key !== varKey);
      return buf.map((b) => b.variation.key === varKey ? { ...b, qty: b.qty - 1 } : b);
    });
  };

  const bufferUnitsConsumed = shotBuffer.reduce((s, b) => s + b.variation.units_consumed * b.qty, 0);
  const bufferTotal = shotBuffer.reduce((s, b) => s + b.variation.price * b.qty, 0);

  const commitShotBuffer = () => {
    const bottle = openedBottles.find((b) => b.id === shotBottleId);
    if (!bottle || shotBuffer.length === 0) return;
    const product = products.find((p) => p.id === bottle.product_id);
    const capacity = product?.units_per_item ?? 0;
    const isAtCapacity = capacity > 0 && bottle.units_consumed >= capacity;

    for (const { variation, qty } of shotBuffer) {
      const isExtra = isAtCapacity;
      const itemName = isExtra
        ? `Drink (extras): ${bottle.product_name}`
        : `${variation.label}: ${bottle.product_name}`;
      setCart((c) => [...c, {
        id: `shot-${bottle.id}-${variation.key}-${Date.now()}-${Math.random()}`,
        name: itemName,
        price: variation.price,
        image_url: null,
        category: "liquor",
        qty,
        _bottle_id: bottle.id,
        _units_consumed: variation.units_consumed * qty,
        _variation_key: variation.key,
      } as CartItem & { _bottle_id: string; _units_consumed: number; _variation_key: string }]);
    }

    // NO local openedBottles state update here — that only happens at order confirm
    setShotModalOpen(false);
    setShotStep("select");
    setShotBottleId("");
    setShotPrice("");
    setSelectedVariation(null);
    setShotBuffer([]);
  };

  const cancelShotBuffer = () => {
    // Just close — no DB write, no cart changes
    setShotModalOpen(false);
    setShotStep("select");
    setShotBottleId("");
    setShotPrice("");
    setSelectedVariation(null);
    setShotBuffer([]);
  };

  // Scroll to selected bottle when entering price step
  useEffect(() => {
    if (shotStep === "variation" && selectedBottleRef.current) {
      setTimeout(() => {
        selectedBottleRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
    }
  }, [shotStep, shotBottleId]);
  /** Cancel an open bottle — only if 0 shots sold, restores 1 stock */
  const handleCancelBottle = async (bottleId: string) => {
    setBottleBusy(true);
    const { error } = await supabase.rpc("cancel_bottle", { p_bottle_id: bottleId });
    setBottleBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Bottle cancelled — stock restored");
    await fetchOpenedBottles();
    await fetchProducts();
  };

  const handleFinishBottle = async (bottleId: string) => {
    if (!profile) return;
    setBottleBusy(true);
    const { error } = await supabase.rpc("finish_bottle", {
      p_bottle_id:  bottleId,
      p_cashier_id: ownerId,
    });
    setBottleBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Bottle marked finished — revenue recorded");
    await fetchOpenedBottles();
    refreshProfile();
  };



  return (
    <>
      {/* ── Float Modal (Open Bar) ── */}
      {showFloatModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-border shadow-2xl overflow-hidden"
            style={{ background: "var(--gradient-card)" }}>
            <div className="px-6 pt-6 pb-2 text-center">
              <div className="h-14 w-14 rounded-full flex items-center justify-center mx-auto mb-3"
                style={{ background: "rgba(134,239,172,0.12)", border: "1.5px solid #86efac" }}>
                <span className="text-2xl">🟢</span>
              </div>
              <h2 className="font-black text-xl">Open Bar</h2>
              <p className="text-xs text-muted-foreground mt-1">Set floats before starting the session</p>
            </div>
            <div className="px-6 pb-6 pt-4 space-y-4">
              {/* Bar Float — hidden for machines-only accounts */}
              {!isMachinesAccount && (
                <div className="space-y-1">
                  <label className="text-xs font-black text-muted-foreground uppercase tracking-wider">Bar Float</label>
                  <div
                    onClick={() => setActiveFloatField(activeFloatField === "bar" ? null : "bar")}
                    className="w-full h-11 rounded-xl border bg-background px-4 flex items-center cursor-pointer transition"
                    style={{ borderColor: activeFloatField === "bar" ? "var(--primary)" : "var(--border)" }}
                  >
                    <span className={`text-base font-black ${activeFloatField === "bar" ? "text-primary" : floatBarAmount ? "text-foreground" : "text-muted-foreground"}`}>
                      {floatBarAmount || "0"}
                    </span>
                  </div>
                </div>
              )}
              {hasMachinesAddon && (
                <div className="space-y-1">
                  <label className="text-xs font-black text-muted-foreground uppercase tracking-wider">Machine Float</label>
                  <div
                    onClick={() => setActiveFloatField(activeFloatField === "machine" ? null : "machine")}
                    className="w-full h-11 rounded-xl border bg-background px-4 flex items-center cursor-pointer transition"
                    style={{ borderColor: activeFloatField === "machine" ? "var(--primary)" : "var(--border)" }}
                  >
                    <span className={`text-base font-black ${activeFloatField === "machine" ? "text-primary" : floatMachineAmount ? "text-foreground" : "text-muted-foreground"}`}>
                      {floatMachineAmount || "0"}
                    </span>
                  </div>
                </div>
              )}
              {/* Inline numpad — integers only */}
              {activeFloatField !== null && (
                <div className="grid grid-cols-3 gap-1.5">
                  {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((k, i) => (
                    k === "" ? <div key={i} /> :
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        const current = activeFloatField === "bar" ? floatBarAmount : floatMachineAmount;
                        const setter  = activeFloatField === "bar" ? setFloatBarAmount : setFloatMachineAmount;
                        if (k === "⌫") { setter(current.slice(0, -1)); return; }
                        setter(current === "0" || current === "" ? k : current + k);
                      }}
                      className={`h-12 rounded-xl font-black text-lg transition active:scale-95 ${
                        k === "⌫"
                          ? "bg-destructive/20 text-destructive hover:bg-destructive/30"
                          : "bg-muted hover:bg-muted/70 text-foreground"
                      }`}
                    >{k}</button>
                  ))}
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowFloatModal(false)}
                  className="flex-1 h-12 rounded-2xl font-black text-sm border border-border hover:bg-muted/30 transition">
                  Cancel
                </button>
                <button onClick={confirmOpenBarWithFloat}
                  disabled={barToggleBusy || (!isMachinesAccount && !floatBarAmount) || (hasMachinesAddon && !floatMachineAmount)}
                  className="flex-1 h-12 rounded-2xl font-black text-sm transition active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ background: "rgba(134,239,172,0.15)", border: "1.5px solid #86efac", color: "#86efac" }}>
                  {barToggleBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Open Bar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Bar Opened overlay ── */}
      {showBarOpenedOverlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-border shadow-2xl overflow-hidden"
            style={{ background: "var(--gradient-card)" }}>
            <div className="px-6 pt-7 pb-4 text-center space-y-2">
              <div className="text-5xl">🟢</div>
              <h2 className="font-black text-xl">Bar is Open!</h2>
              <p className="text-sm text-muted-foreground leading-snug">
                Session started. Floats have been set. Good luck tonight!
              </p>
            </div>
            <div className="px-6 pb-6 pt-2">
              <button onClick={() => setShowBarOpenedOverlay(false)}
                className="w-full h-12 rounded-2xl font-black text-sm transition active:scale-95 text-primary-foreground"
                style={{ background: "var(--gradient-hero)" }}>
                Let's Go
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Page loading spinner while bar session state is being fetched ── */}
      {barSessionLoading && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {/* ── Bar Closed overlay — blocks all selling ── */}
      {barOverlayReady && !barSessionLoading && !barIsOpen && (
        <div className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-black/85 backdrop-blur-sm px-6">
          <div className="w-full max-w-sm rounded-3xl border border-border shadow-2xl overflow-hidden text-center"
            style={{ background: "var(--gradient-card)" }}>
            <div className="px-6 pt-8 pb-4">
              <div className="text-5xl mb-4">🔒</div>
              <h2 className="font-black text-xl mb-2">Bar is Closed</h2>
              <p className="text-sm text-muted-foreground leading-snug">
                {barSessionStart
                  ? "The bar session has ended. The owner needs to set a new float to open a new session before sales can be made."
                  : "No session has been started yet. The owner needs to set the cashier float to open the bar."}
              </p>
            </div>
            <div className="px-6 pb-6 pt-2">
              {profile?.role === "owner" ? (
                <button
                  type="button"
                  disabled={barToggleBusy}
                  onClick={handleOpenBar}
                  className="w-full h-12 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-50"
                  style={{ background: "rgba(134,239,172,0.15)", border: "1.5px solid #86efac", color: "#86efac" }}
                >
                  {barToggleBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "🟢 Open Bar Now"}
                </button>
              ) : (
                <div className="rounded-xl px-4 py-3 text-xs text-muted-foreground"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)" }}>
                  Ask the owner to go to <span className="font-black text-foreground">Wallet → Update Float → New Session</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Sticky category tabs — sits below the app header */}
      <div className="sticky top-0 z-20 -mx-3 px-3 py-2 bg-background/95 backdrop-blur border-b border-border">
        {/* Mobile: horizontal scroll strip; sm+: fixed grid */}
        <div className="sm:hidden flex gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => {
                handleBarDone();
                const sorted = allCategorySorted[cat.value] ?? applyBarSort(products, cat.value, barSortMapRef.current);
                barOrderedRef.current = sorted;
                setCategory(cat.value);
                setBarOrdered(sorted);
                document.querySelector("main")?.scrollTo({ top: 0, behavior: "instant" });
              }}
              className={`h-10 shrink-0 rounded-xl font-black transition flex items-center justify-center px-4 ${
                category === cat.value
                  ? "text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
              style={category === cat.value ? { background: "var(--gradient-hero)" } : {}}
            >
              <span className="text-xs leading-none whitespace-nowrap">{t(categoryKey(cat.value), cat.label)}</span>
            </button>
          ))}
        </div>
        {/* Tablet / desktop: fixed grid, all tabs visible */}
        <div className="hidden sm:grid max-w-2xl lg:max-w-4xl mx-auto grid-cols-7 gap-1.5">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => {
                handleBarDone();
                const sorted = allCategorySorted[cat.value] ?? applyBarSort(products, cat.value, barSortMapRef.current);
                barOrderedRef.current = sorted;
                setCategory(cat.value);
                setBarOrdered(sorted);
                document.querySelector("main")?.scrollTo({ top: 0, behavior: "instant" });
              }}
              className={`h-10 lg:h-11 rounded-xl font-black transition flex items-center justify-center ${
                category === cat.value
                  ? "text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
              style={category === cat.value ? { background: "var(--gradient-hero)" } : {}}
              title={t(categoryKey(cat.value), cat.label)}
            >
              <span className="text-xs lg:text-sm leading-none text-center">{t(categoryKey(cat.value), cat.label)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Items grid — bottom padding clears the fixed CASH + CREDIT buttons */}
      <div className="pt-4 pb-36">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* ── Edit mode instruction banner — sticky just below category tabs ── */}
            {barEditMode && (
              <div
                className="sticky z-[19] -mx-3 px-3 flex items-center justify-between py-2 mb-3 border-b border-amber-500/40 bg-background/95 backdrop-blur"
                style={{ top: "72px" }}
              >
                <span className="text-xs font-black text-amber-400">
                  {barSelectedId
                    ? t("sort_tap_swap", "Now tap another item to swap its position")
                    : t("sort_tap_select", "Tap an item to select, then tap another to swap")}
                </span>
                <button
                  onClick={handleBarDone}
                  className="shrink-0 h-8 px-4 rounded-xl font-black text-xs text-white active:scale-95 transition"
                  style={{ background: "var(--gradient-hero)" }}
                >
                  {t("done", "Done")}
                </button>
              </div>
            )}

            {/* ── Shot button — liquor tab only (hidden in edit/sort mode) ── */}
            {category === "liquor" && !barEditMode && (
              <div className="mb-3">
                <button
                  onClick={() => {
                    // If there's a currently selected bottle that is at capacity with 0 shots sold,
                    // auto-open a new bottle instead of showing the same useless empty bottle.
                    if (shotBottleId) {
                      const curBottle = openedBottles.find((b) => b.id === shotBottleId);
                      if (curBottle) {
                        const curProd = products.find((p) => p.id === curBottle.product_id);
                        const curCap = curProd?.units_per_item ?? 0;
                        const isAtCap = curCap > 0 && curBottle.units_consumed >= curCap;
                        if (isAtCap && curBottle.shots_sold === 0) {
                          // Empty bottle with no shots sold — go straight to new bottle picker
                          setShotModalOpen(true);
                          setShowNewBottleGrid(true);
                          return;
                        }
                      }
                    }
                    setShotModalOpen(true);
                  }}
                  className="w-full h-12 rounded-2xl flex items-center justify-center gap-2 font-bold text-sm active:scale-[0.98] transition border"
                  style={{ background: "rgba(var(--primary-rgb, 251 146 60) / 0.10)", borderColor: "rgba(var(--primary-rgb, 251 146 60) / 0.35)", color: "var(--primary)" }}
                >
                  {t("shot_from_bottle", "🥃 Drink from Opened Bottle")}
                  {openedBottles.length > 0 && (
                    <span className="h-5 min-w-[1.25rem] px-1 rounded-full flex items-center justify-center text-[10px] font-black text-primary-foreground"
                      style={{ background: "var(--gradient-hero)" }}>
                      {openedBottles.length}
                    </span>
                  )}
                </button>
              </div>
            )}

            {/* ── Cigarette pack button — cigarettes tab only (hidden in edit/sort mode) ── */}
            {category === "cigarettes" && !barEditMode && (
              <div className="mb-3">
                <button
                  onClick={() => { setPackModalOpen(true); setPackStep("select"); setPackPackId(""); setPackPrice(""); setPackQty(1); setShowNewPackGrid(false); }}
                  className="w-full h-12 rounded-2xl flex items-center justify-center gap-2 font-bold text-sm active:scale-[0.98] transition border"
                  style={{ background: "rgba(var(--primary-rgb,251 146 60)/0.10)", borderColor: "rgba(var(--primary-rgb,251 146 60)/0.35)", color: "var(--primary)" }}
                >
                  {t("retail_cigg_paper", "🚬 Retail Cigarette & Paper")}
                  {openedPacks.length > 0 && (
                    <span className="h-5 min-w-[1.25rem] px-1 rounded-full flex items-center justify-center text-[10px] font-black text-primary-foreground"
                      style={{ background: "var(--gradient-hero)" }}>
                      {openedPacks.length}
                    </span>
                  )}
                </button>
              </div>
            )}


            {filtered.length === 0 && !loading ? (
              <div className="text-center py-20 text-muted-foreground">
                {products.length === 0 ? "No items yet. Add some on the Items page." : `No ${t(categoryKey(CATEGORIES.find(c=>c.value===category)?.value ?? ""), CATEGORIES.find(c=>c.value===category)?.label ?? category)} found.`}
              </div>
            ) : (
          <div>
            {barEditMode ? (
              /* ── Edit mode: tap-to-select then tap-to-swap ── */
              <div>
                {/* Grid — normal scrolling, taps drive selection/swap */}
                <div
                  ref={barEditGridRef}
                  className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-6 gap-2"
                  onContextMenu={(e) => e.preventDefault()}
                  style={{ touchAction: "pan-y" }}
                >
                  {barOrdered.map((p) => {
                    const inCart = cart.find((i) => i.id === p.id);
                    const outOfStock = (p.stock_qty ?? 1) === 0;
                    const missingPrice = !p.price || Number(p.price) <= 0;
                    const incomplete   = missingPrice;
                    const isSelected = barSelectedId === p.id;
                    return (
                      <div key={p.id}
                        data-bar-id={p.id}
                        className="relative"
                        onContextMenu={(e) => e.preventDefault()}
                        style={{ userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none", touchAction: "manipulation" } as React.CSSProperties}
                      >
                        <button
                          onClick={() => {
                            if (!barEditModeRef.current) return;
                            const current = barOrderedRef.current;
                            if (!barSelectedId) {
                              setBarSelectedId(p.id);
                              return;
                            }
                            if (barSelectedId === p.id) {
                              setBarSelectedId(null);
                              return;
                            }
                            const from = current.findIndex(x => x.id === barSelectedId);
                            const to = current.findIndex(x => x.id === p.id);
                            if (from === -1 || to === -1) { setBarSelectedId(null); return; }
                            const next = [...current];
                            const [moved] = next.splice(from, 1);
                            next.splice(to, 0, moved);
                            barOrderedRef.current = next;
                            setBarOrdered(next);
                            // Rebuild the full sort map: keep other categories' positions, update this category
                            const newMap = { ...barSortMapRef.current };
                            next.forEach((item, idx) => { newMap[item.id] = idx; });
                            barSortMapRef.current = newMap;
                            setBarSortMap(newMap);
                            saveBarSortIds(next.map(x => x.id));
                            setBarSelectedId(null);
                          }}
                          className={`group relative rounded-2xl overflow-hidden border flex flex-col transition w-full ${outOfStock ? "opacity-80" : ""} ${incomplete ? "opacity-50 grayscale" : ""}`}
                          style={{
                            background: "var(--gradient-card)",
                            boxShadow: isSelected ? "0 0 0 3px rgba(251,191,36,0.95), var(--shadow-elegant)" : "var(--shadow-elegant)",
                            borderColor: isSelected ? "rgb(251,191,36)" : "rgba(251,146,60,0.8)",
                          }}
                        >
                          <div className="aspect-[3/4] relative w-full">
                            {p.image_url ? (
                              <img src={imgSrc(p.image_url) ?? productImageUrl(p.image_url)!} alt="" loading="eager" decoding="sync" fetchPriority="high" className="absolute inset-0 w-full h-full object-cover"
                                onError={(e) => { const img = e.currentTarget as HTMLImageElement; img.style.display = "none"; const fb = img.nextElementSibling as HTMLElement | null; if (fb) fb.style.display = "flex"; }} />
                            ) : null}
                            <div className="absolute inset-0 items-center justify-center text-4xl"
                              style={{ display: p.image_url ? "none" : "flex" }}>
                              {categoryIcon(p.category ?? "drinks")}
                            </div>
                            {p.stock_qty !== undefined && !outOfStock && (
                              <div className="absolute top-1.5 left-1.5 h-6 min-w-[1.5rem] px-1.5 rounded-full flex items-center justify-center bg-black/70 shadow">
                                <span className="text-[10px] font-black text-white leading-none">{p.stock_qty}</span>
                              </div>
                            )}
                            {inCart && (
                              <button onClick={(e) => { e.stopPropagation(); removeItem(p.id); }}
                                className="absolute top-1.5 right-1.5 h-8 w-8 rounded-full flex items-center justify-center active:scale-90 transition text-black shadow z-10"
                                style={{ background: "#dc2626" }}>
                                <X className="h-4 w-4" />
                              </button>
                            )}
                            {inCart && (
                              <div className="absolute top-10 left-0 right-0 flex items-center justify-center gap-4 py-3"
                                style={{ background: "rgba(0,0,0,0.75)" }}>
                                <button onClick={(e) => { e.stopPropagation(); dec(p.id); }}
                                  className="h-8 w-8 rounded-full flex items-center justify-center active:scale-90 transition"
                                  style={{ background: "#ef4444" }}>
                                  <Minus className="h-4 w-4 text-black" />
                                </button>
                                <div className="h-8 w-8 rounded-full flex items-center justify-center text-sm font-black text-black"
                                  style={{ background: "var(--gradient-hero)" }}>
                                  {inCart.qty}
                                </div>
                              </div>
                            )}
                            {outOfStock && (
                              <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-950/75 backdrop-blur-[1px]">
                                <div className="bg-red-600 rounded-xl px-2 py-1 shadow-lg">
                                  <span className="text-white text-[10px] font-black uppercase tracking-wider leading-none">Out of Stock</span>
                                </div>
                              </div>
                            )}
                            {!outOfStock && !inCart && (p.stock_qty ?? 1) >= 1 && (p.stock_qty ?? 1) <= 5 && (
                              <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-full bg-red-600 shadow">
                                <span className="text-[9px] font-black uppercase tracking-wide text-white leading-none">Low</span>
                              </div>
                            )}
                          </div>
                          <div className="px-1.5 py-1.5 border-t border-border/30" style={{ background: "rgba(var(--primary-rgb,251 146 60)/0.10)", borderTop: "1px solid rgba(var(--primary-rgb,251 146 60)/0.35)" }}>
                            <div className="font-bold text-[11px] truncate leading-tight" style={{ color: "var(--primary)" }}>{p.name}</div>
                            <div className="font-black text-xs mt-0.5" style={{ color: "var(--primary)" }}>${Number(p.price).toFixed(2)}</div>
                          </div>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* ── Normal mode: memoized grid — only re-renders when barOrdered/cart changes ── */
              <ProductGrid
                barOrdered={barOrdered}
                cartQtyMap={cartQtyMap}
                resolvedImgMap={resolvedImgMap}
                onAdd={addToCart}
                onRemove={removeItem}
                onDec={dec}
                onEnterEditMode={barEnterEditMode}
                showSortButton={cart.length === 0}
                sortLabel={t("sort_item_order", "⇅ Sort Item Order")}
              />
            )}
          </div>
            )}
          </>
        )}
      </div>

      {/* Sticky CASH button — fixed at bottom */}
      {cartCount > 0 && (
        <div
          className="fixed inset-x-0 z-[26] px-4 pb-2 pointer-events-none"
          style={{ bottom: 8 }}
        >
          <div className="max-w-2xl mx-auto pointer-events-auto space-y-2">
            {/* Special deal banner */}
            {appliedSpecial && (
              <div className="w-full rounded-2xl px-4 py-2 flex items-center justify-between border border-green-500/40"
                style={{ background: "oklch(0.20 0.07 145 / 0.9)" }}>
                <span className="text-green-300 font-black text-xs">🏷 {appliedSpecial.name}</span>
                <span className="text-green-300 font-black text-xs">
                  {specialBundles}× deal · save ${(rawTotal - total).toFixed(2)}
                </span>
              </div>
            )}
            {/* Place Order button */}
            <button
              onClick={() => setCashOpen(true)}
              className="w-full h-14 rounded-2xl flex items-center justify-between px-5 font-black text-lg text-primary-foreground shadow-2xl active:scale-[0.98] transition"
              style={{ background: "var(--gradient-hero)" }}
            >
              <span className="flex items-center justify-center h-8 w-8 rounded-full bg-white/20 text-sm font-black">{cartCount}</span>
              <span>Place Order</span>
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
          onClearCart={() => { setCart([]); localStorage.removeItem(`bartap-cart-${ownerId}`); revertPendingPacks(); }}
          onClose={() => { setCashOpen(false); revertPendingPacks(); }}
          ownerId={ownerId}
          onSuccess={async (paidAmt, changeAmt) => {
            // Write bottle variation tracking (needs openedBottles state — not available in CashOverlay)
            const shotItems = cart.filter((c) => (c as any)._bottle_id);
            const bottleUpdates = new Map<string, { units_consumed: number; variation_counts: Record<string, number> }>();
            for (const shot of shotItems) {
              const bid = (shot as any)._bottle_id as string;
              const vKey = (shot as any)._variation_key as string ?? "shot";
              const unitsUsed = (shot as any)._units_consumed as number ?? shot.qty;
              const ex = bottleUpdates.get(bid) ?? { units_consumed: 0, variation_counts: {} };
              ex.units_consumed += unitsUsed;
              ex.variation_counts[vKey] = (ex.variation_counts[vKey] ?? 0) + shot.qty;
              bottleUpdates.set(bid, ex);
            }
            for (const [bottleId, update] of bottleUpdates) {
              const bottle = openedBottles.find((b) => b.id === bottleId);
              if (!bottle) continue;
              const merged: Record<string, number> = { ...bottle.variation_counts };
              for (const [k, v] of Object.entries(update.variation_counts)) merged[k] = (merged[k] ?? 0) + v;
              await supabase.from("opened_bottles").update({ units_consumed: bottle.units_consumed + update.units_consumed, variation_counts: merged }).eq("id", bottleId);
            }
            closeFullPacksAfterOrder(cart);
            setBottlesPendingCancel([]);
            setCart([]);
            localStorage.removeItem(`bartap-cart-${ownerId}`);
            setCashOpen(false);
            refreshProfile();
            fetchOpenedBottles();
            fetchOpenedPacks();
          }}
        />
      )}

      {/* ── Shot Modal — Step 1: Select Liquor (3-column card grid) ──── */}
      {shotModalOpen && shotStep === "select" && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => { setShotModalOpen(false); setShotStep("select"); setShotPrice(""); setShotBottleId(""); setNewBottlePrice(""); setNewBottleProductId(""); setShowNewBottleGrid(false); }}>
          <div className="w-full max-w-md rounded-t-3xl border border-border shadow-2xl"
            style={{ background: "var(--gradient-card)" }}
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <span className="text-base font-black">{t("select_liquor", "🥃 Select Liquor")}</span>
              <button onClick={() => { setShotModalOpen(false); setShotStep("select"); setShotPrice(""); setShotBottleId(""); setNewBottlePrice(""); setNewBottleProductId(""); setShowNewBottleGrid(false); }}
                className="h-8 w-8 rounded-full flex items-center justify-center bg-muted hover:bg-muted/80 transition">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-4 pb-5 space-y-4 max-h-[75vh] overflow-y-auto">

              {!showNewBottleGrid ? (
                <>
                  {/* Currently open — 3-col card grid (exclude already-selected bottle) */}
                  {openedBottles.filter((b) => b.id !== shotBottleId).length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Currently Open</p>
                      <div className="grid grid-cols-3 gap-2">
                        {openedBottles.filter((b) => b.id !== shotBottleId).map((b) => {
                          const prod = products.find(p => p.id === b.product_id);
                          return (
                            <div key={b.id} className="flex flex-col rounded-2xl overflow-hidden border border-border">
                              {/* Top action bar — Mark Empty (shots > 0) OR Cancel (0 shots) */}
                              {b.shots_sold > 0 ? (
                                <button
                                  onClick={(e) => { e.stopPropagation(); setMarkEmptyBottleId(b.id); }}
                                  className="w-full h-10 flex items-center justify-center font-black text-xs text-white active:opacity-80 transition shrink-0"
                                  style={{ background: "#dc2626" }}
                                >
                                  Mark Empty
                                </button>
                              ) : (
                                <button
                                  onClick={(e) => { e.stopPropagation(); setCancelBottleId(b.id); }}
                                  disabled={bottleBusy}
                                  className="w-full h-10 flex items-center justify-center font-black text-xs text-white active:opacity-80 transition disabled:opacity-40 shrink-0"
                                  style={{ background: "#374151" }}
                                >
                                  ✗ Cancel
                                </button>
                              )}
                              {/* Tap image area to sell a shot — blocked if owner hasn't set up shot prices */}
                              {(() => {
                                const hasShots = (prod?.bottle_variations ?? []).length > 0;
                                const bCap = prod?.units_per_item ?? 0;
                                const isEmptyNoShots = bCap > 0 && b.units_consumed >= bCap && b.shots_sold === 0;
                                return hasShots ? (
                                  <button
                                    onClick={() => {
                                      if (isEmptyNoShots) {
                                        // Bottle is empty with 0 shots — skip to open new bottle
                                        setShowNewBottleGrid(true);
                                        return;
                                      }
                                      setShotBottleId(b.id); setShotPrice(b.shot_price ? String(b.shot_price) : ""); setShotStep("variation"); setShotModalOpen(false); setShowNewBottleGrid(false);
                                    }}
                                    className="aspect-[3/4] relative w-full active:scale-95 transition"
                                    style={{ background: "var(--gradient-card)" }}>
                                    {prod?.image_url ? <img src={productImageUrl(prod.image_url)!} alt="" className="absolute inset-0 w-full h-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} /> : null}
                                    <div className="absolute inset-0 flex items-center justify-center text-3xl" style={{ display: prod?.image_url ? "none" : "flex" }}>🍾</div>
                                    {isEmptyNoShots && (
                                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/60 px-2 text-center">
                                        <span className="text-lg">🍾</span>
                                        <span className="text-[9px] font-black text-amber-400 leading-tight">Tap to open new</span>
                                      </div>
                                    )}
                                  </button>
                                ) : (
                                  <div
                                    className="aspect-[3/4] relative w-full flex items-center justify-center"
                                    style={{ background: "var(--gradient-card)" }}>
                                    {prod?.image_url ? <img src={productImageUrl(prod.image_url)!} alt="" className="absolute inset-0 w-full h-full object-cover opacity-30" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} /> : null}
                                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/50 px-2 text-center">
                                      <span className="text-lg">🔒</span>
                                      <span className="text-[9px] font-black text-white/80 leading-tight">No shots set up by owner</span>
                                    </div>
                                  </div>
                                );
                              })()}
                              <div className="px-1.5 py-1.5" style={{ background: "rgba(var(--primary-rgb,251 146 60)/0.10)", borderTop: "1px solid rgba(var(--primary-rgb,251 146 60)/0.35)" }}>
                                <div className="font-bold text-[11px] truncate leading-tight" style={{ color: "var(--primary)" }}>{b.product_name}</div>
                                <div className="font-black text-xs mt-0.5" style={{ color: "var(--primary)" }}>${Number(b.revenue).toFixed(2)} made</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* + Open New Bottle button */}
                  <div className="pt-3">
                  <button
                    onClick={() => setShowNewBottleGrid(true)}
                    className="w-full h-11 rounded-xl border-dashed border-2 flex items-center justify-center gap-2 font-bold text-sm transition active:scale-[0.98]"
                    style={{ borderColor: "var(--primary)", color: "var(--primary)" }}
                  >
                    + Open New Bottle
                  </button>
                  </div>
                </>
              ) : (
                <>
                  {/* Back button + inventory grid */}
                  <div className="flex items-center gap-2">
                    <button onClick={() => setShowNewBottleGrid(false)} className="text-muted-foreground hover:text-foreground transition">
                      <X className="h-4 w-4" />
                    </button>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Select from Inventory</p>
                  </div>
                  {liquorProducts.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">No liquor in stock.</p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      {liquorProducts.map((p) => (
                        <button key={p.id}
                          onClick={async () => {
                            setBottleBusy(true);
                            const ownId = ownerIdRef.current;
                            if (!ownId) { setBottleBusy(false); return; }
                            const shotVariation = (p.bottle_variations ?? []).find((v: BottleVariation) => v.key === "shot");
                            const { error } = await supabase.rpc("open_bottle", {
                              p_owner_id: ownId, p_product_id: p.id, p_shot_price: shotVariation?.price ?? 0,
                            });
                            if (error) { toast.error(error.message); setBottleBusy(false); return; }
                            await fetchOpenedBottles();
                            await fetchProducts();
                            const { data } = await supabase.from("opened_bottles").select("id")
                              .eq("owner_id", ownId).eq("product_id", p.id).eq("status", "open")
                              .order("opened_at", { ascending: false }).limit(1);
                            setBottleBusy(false);
                            if (data?.[0]) {
                              // Track for revert if order is cancelled
                              setBottlesPendingCancel((prev) => [...prev, data[0].id]);
                              // Go back to select step so cashier taps the newly opened bottle
                              // — do NOT replace the previously selected bottle
                              setShowNewBottleGrid(false);
                            }
                          }}
                          disabled={bottleBusy}
                          className="flex flex-col rounded-2xl overflow-hidden border border-border active:scale-95 transition disabled:opacity-50">
                          <div className="aspect-[3/4] relative w-full" style={{ background: "var(--gradient-card)" }}>
                            {p.image_url ? <img src={productImageUrl(p.image_url)!} alt="" className="absolute inset-0 w-full h-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} /> : null}
                            <div className="absolute inset-0 flex items-center justify-center text-3xl" style={{ display: p.image_url ? "none" : "flex" }}>🍾</div>
                            <div className="absolute top-1 left-1 bg-black/70 rounded-full px-1.5 py-0.5"><span className="text-[9px] font-black text-white">{p.stock_qty}</span></div>
                            {bottleBusy && <div className="absolute inset-0 flex items-center justify-center bg-black/40"><Loader2 className="h-6 w-6 animate-spin text-white" /></div>}
                          </div>
                          <div className="px-1.5 py-1.5" style={{ background: "rgba(var(--primary-rgb,251 146 60)/0.10)", borderTop: "1px solid rgba(var(--primary-rgb,251 146 60)/0.35)" }}>
                            <div className="font-bold text-[11px] truncate leading-tight" style={{ color: "var(--primary)" }}>{p.name}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Shot Step 2: Variation picker (buffer — modal stays open) ── */}
      {shotStep === "variation" && shotBottleId && (() => {
        const bottle = openedBottles.find((b) => b.id === shotBottleId);
        const product = products.find((p) => p.id === bottle?.product_id);
        const capacity = product?.units_per_item ?? 0;
        const vars = product?.bottle_variations ?? [];
        const consumed = bottle?.units_consumed ?? 0;
        // Units already committed to cart (from previous Add to Order taps this session)
        const cartUnitsForBottle = cart
          .filter((c) => (c as any)._bottle_id === shotBottleId)
          .reduce((s, c) => s + ((c as any)._units_consumed ?? 0), 0);
        const effectiveConsumed = consumed + cartUnitsForBottle + bufferUnitsConsumed;
        const remaining = capacity > 0 ? capacity - effectiveConsumed : null;
        const atCapacity = capacity > 0 && effectiveConsumed >= capacity;
        return (
          <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/70 backdrop-blur-sm"
            onClick={cancelShotBuffer}>
            <div className="w-full max-w-md mx-auto rounded-t-3xl border border-border shadow-2xl flex flex-col max-h-[92dvh]"
              style={{ background: "var(--gradient-card)" }}
              onClick={(e) => e.stopPropagation()}>
              {/* ── Opened bottles grid — tap to switch active bottle ── */}
              <div className="px-4 pb-2">
                <div className="grid grid-cols-3 gap-2">
                  {openedBottles.map((b) => {
                    const bProd = products.find(p => p.id === b.product_id);
                    const bCap = bProd?.units_per_item ?? 0;
                    const bCartUnits = cart.filter((c) => (c as any)._bottle_id === b.id).reduce((s, c) => s + ((c as any)._units_consumed ?? 0), 0);
                    const bConsumed = b.units_consumed + bCartUnits;
                    const bAtCap = bCap > 0 && bConsumed >= bCap;
                    const isSelected = b.id === shotBottleId;
                    return (
                      <div key={b.id} ref={isSelected ? selectedBottleRef : null}>
                        <button type="button"
                          onClick={() => { setShotBottleId(b.id); setShotBuffer([]); }}
                          className="w-full flex flex-col rounded-2xl overflow-hidden border active:scale-95 transition"
                          style={{ borderWidth: isSelected ? 3 : 1, borderColor: isSelected ? "var(--primary)" : "transparent", background: "var(--gradient-card)" }}>
                          <div className="aspect-[3/4] relative w-full">
                            {bProd?.image_url ? <img src={productImageUrl(bProd.image_url)!} alt="" className="absolute inset-0 w-full h-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} /> : null}
                            <div className="absolute inset-0 flex items-center justify-center text-3xl" style={{ display: bProd?.image_url ? "none" : "flex" }}>🍾</div>
                            {isSelected && <div className="absolute inset-0 flex items-center justify-center text-5xl font-black" style={{ background: "rgba(var(--primary-rgb,251 146 60)/0.30)", color: "var(--primary)" }}>✔</div>}
                            {bAtCap && !isSelected && <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(239,68,68,0.5)" }}><span className="text-[9px] font-black text-white uppercase">Empty</span></div>}
                          </div>
                          <div className="px-1.5 py-1.5" style={{ background: "rgba(var(--primary-rgb,251 146 60)/0.10)", borderTop: "1px solid rgba(var(--primary-rgb,251 146 60)/0.35)" }}>
                            <div className="font-bold text-[11px] truncate leading-tight" style={{ color: "var(--primary)" }}>{b.product_name}</div>
                            <div className="font-black text-xs mt-0.5" style={{ color: bAtCap ? "#fca5a5" : "#86efac" }}>
                              {bCap > 0 ? `${Math.max(0, bCap - bConsumed)} left` : `$${Number(b.revenue).toFixed(2)}`}
                            </div>
                          </div>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* Header — bottle name + capacity bar + cancel */}
              <div className="flex items-center gap-3 px-4 pt-3 pb-2">
                <div className="min-w-0 flex-1">
                  <span className="font-black text-base">🥃 {bottle?.product_name}</span>
                  {capacity > 0 && (
                    <div className="flex items-center gap-2 mt-1">
                      <div className="h-2 flex-1 rounded-full bg-muted/40 overflow-hidden">
                        <div className="h-full rounded-full transition-all"
                          style={{ width: `${Math.min(100, (effectiveConsumed / capacity) * 100)}%`, background: atCapacity ? "#f87171" : "var(--gradient-hero)" }} />
                      </div>
                      <span className="text-xs font-black shrink-0" style={{ color: atCapacity ? "#f87171" : "#86efac" }}>
                        {atCapacity ? "⚠ Should be empty" : `${remaining} left`}
                      </span>
                    </div>
                  )}
                  {atCapacity && <p className="text-[10px] text-amber-400 font-semibold">Only extra drinks allowed</p>}
                </div>
                <button type="button" onClick={cancelShotBuffer}
                  className="shrink-0 h-8 px-3 rounded-lg bg-muted text-xs font-bold text-muted-foreground flex items-center gap-1">
                  <X className="h-3.5 w-3.5" /> Cancel
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-4 pb-2 space-y-2">
                {vars.length > 0 ? (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      {vars.map((v) => {
                        const isShot = v.key === "shot";
                        const bufEntry = shotBuffer.find((b) => b.variation.key === v.key);
                        const bufQty = bufEntry?.qty ?? 0;
                        const wouldExceed = capacity > 0 && (effectiveConsumed + v.units_consumed) > capacity;
                        const isDisabled = !isShot && wouldExceed;
                        const maxCan = capacity > 0 && v.units_consumed > 0
                          ? Math.floor((capacity - effectiveConsumed) / v.units_consumed)
                          : 999;
                        const countSold = bottle?.variation_counts?.[v.key] ?? 0;
                        const isSelected = bufQty > 0;
                        return (
                          <div key={v.key} className="rounded-2xl border-2 overflow-hidden transition"
                            style={{
                              borderColor: isDisabled
                                ? "rgba(255,255,255,0.06)"
                                : isSelected ? "var(--primary)"
                                : isShot && atCapacity ? "#fbbf24"
                                : "rgba(255,255,255,0.12)",
                              background: isSelected
                                ? "rgba(var(--primary-rgb,251 146 60)/0.10)"
                                : isShot && atCapacity ? "rgba(251,191,36,0.08)"
                                : "rgba(255,255,255,0.04)",
                              opacity: isDisabled ? 0.35 : 1,
                            }}>
                            <button type="button" disabled={isDisabled}
                              onClick={() => addShotToBuffer(v)}
                              className="w-full p-3 flex flex-col items-center gap-0.5 active:bg-white/5 transition">
                              <span className="font-black text-sm">
                                {isShot ? "Drink" : v.label}
                                {isShot && atCapacity && <span className="text-amber-400 text-[10px] ml-1">extras</span>}
                              </span>
                              <span className="font-black text-lg" style={{ color: isDisabled ? "var(--muted-foreground)" : "#86efac" }}>
                                ${v.price.toFixed(2)}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                {v.units_consumed} unit{v.units_consumed !== 1 ? "s" : ""}
                                {!isDisabled && capacity > 0 && maxCan > 0 ? ` - ${maxCan} avail` : ""}
                              </span>
                              {countSold > 0 && (
                                <span className="text-[10px]" style={{ color: "var(--primary)" }}>{countSold} sold</span>
                              )}
                            </button>
                            {isSelected && (
                              <div className="flex items-center justify-between px-3 pb-2 gap-2">
                                <button type="button" onClick={() => removeShotFromBuffer(v.key)}
                                  className="h-7 w-7 rounded-full flex items-center justify-center font-black text-sm active:scale-90 transition"
                                  style={{ background: "#ef4444" }}>−</button>
                                <span className="font-black text-base" style={{ color: "var(--primary)" }}>{bufQty}</span>
                                <button type="button"
                                  disabled={isDisabled || (capacity > 0 && maxCan <= 0)}
                                  onClick={() => addShotToBuffer(v)}
                                  className="h-7 w-7 rounded-full flex items-center justify-center font-black text-sm active:scale-90 transition disabled:opacity-30"
                                  style={{ background: "var(--gradient-hero)" }}>+</button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {capacity > 0 && !atCapacity && shotBuffer.length > 0 && (
                      <div className="rounded-xl border border-border/40 px-3 py-2" style={{ background: "rgba(255,255,255,0.02)" }}>
                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">Remaining after order</p>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                          {vars.filter((v) => v.units_consumed > 0 && Math.floor((capacity - effectiveConsumed) / v.units_consumed) > 0).map((v) => (
                            <span key={v.key} className="text-xs font-semibold" style={{ color: "#86efac" }}>
                              {Math.floor((capacity - effectiveConsumed) / v.units_consumed)}x {v.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Open New Bottle — shown when bottle is at/near capacity */}
                    {capacity > 0 && vars.some((v) => v.key !== "shot" && (effectiveConsumed + v.units_consumed) > capacity) && (
                      <button type="button" disabled={bottleBusy}
                        onClick={async () => {
                          if (!product || !bottle) return;
                          setBottleBusy(true);
                          const shotVar = (product.bottle_variations ?? []).find((v: BottleVariation) => v.key === "shot");
                          const { error } = await supabase.rpc("open_bottle", {
                            p_owner_id: ownerIdRef.current, p_product_id: product.id, p_shot_price: shotVar?.price ?? 0,
                          });
                          setBottleBusy(false);
                          if (error) { toast.error(error.message); return; }
                          await fetchOpenedBottles();
                          await fetchProducts();
                          const { data } = await supabase.from("opened_bottles").select("id")
                            .eq("owner_id", ownerIdRef.current!).eq("product_id", product.id)
                            .eq("status", "open").order("opened_at", { ascending: false }).limit(1);
                          if (data?.[0]) {
                            const newBottleId = data[0].id;
                            // Track new bottle for revert if order is cancelled
                            setBottlesPendingCancel((prev) => [...prev, newBottleId]);
                            // Commit any buffered shots from the current bottle directly into cart
                            // WITHOUT closing the modal, then switch to the new bottle
                            if (shotBuffer.length > 0) {
                              const currentBottle = openedBottles.find((b) => b.id === shotBottleId);
                              const currentProduct = products.find((p) => p.id === currentBottle?.product_id);
                              const currentCapacity = currentProduct?.units_per_item ?? 0;
                              const isAtCap = currentCapacity > 0 && (currentBottle?.units_consumed ?? 0) >= currentCapacity;
                              for (const { variation, qty } of shotBuffer) {
                                const isExtra = isAtCap;
                                const itemName = isExtra
                                  ? `Drink (extras): ${currentBottle?.product_name}`
                                  : `${variation.label}: ${currentBottle?.product_name}`;
                                setCart((c) => [...c, {
                                  id: `shot-${shotBottleId}-${variation.key}-${Date.now()}-${Math.random()}`,
                                  name: itemName,
                                  price: variation.price,
                                  image_url: null,
                                  category: "liquor",
                                  qty,
                                  _bottle_id: shotBottleId,
                                  _units_consumed: variation.units_consumed * qty,
                                  _variation_key: variation.key,
                                } as CartItem & { _bottle_id: string; _units_consumed: number; _variation_key: string }]);
                              }
                            }
                            // Switch to the new bottle and clear buffer — modal stays open
                            setShotBottleId(newBottleId);
                            setShotBuffer([]);
                          }
                        }}
                        className="w-full h-10 rounded-xl font-black text-sm border-2 flex items-center justify-center gap-2 transition active:scale-95"
                        style={{ borderColor: "var(--primary)", color: "var(--primary)", background: "rgba(var(--primary-rgb,251 146 60)/0.08)" }}>
                        {bottleBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "🍾 Open New Bottle"}
                      </button>
                    )}
                  </>
                ) : (
                  <div className="rounded-2xl border border-border/40 px-4 py-6 flex flex-col items-center gap-2 text-center"
                    style={{ background: "rgba(255,255,255,0.03)" }}>
                    <span className="text-3xl">🔒</span>
                    <p className="font-black text-sm text-foreground">Shots not set up</p>
                    <p className="text-xs text-muted-foreground leading-snug">
                      The owner hasn't configured drink prices for this product. Ask the owner to add drink pricing in Product Settings.
                    </p>
                  </div>
                )}
              </div>

              {shotBuffer.length > 0 && (
                <div className="px-4 pb-5 pt-1">
                  <button type="button"
                    onClick={async () => { await commitShotBuffer(); }}
                    className="w-full h-12 rounded-xl font-black text-base text-primary-foreground active:scale-[0.98] transition flex items-center justify-center gap-2"
                    style={{ background: "var(--gradient-hero)" }}>
                    + Add to Order
                    {bufferTotal > 0 && <span className="font-semibold text-sm opacity-80">— ${bufferTotal.toFixed(2)}</span>}
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}
      {/* Mark Empty Confirm Modal */}
      {markEmptyBottleId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 backdrop-blur-sm px-6">
          <div className="w-full max-w-xs rounded-2xl border border-border shadow-2xl overflow-hidden"
            style={{ background: "var(--gradient-card)" }}>
            <div className="px-5 pt-6 pb-4 text-center">
              <div className="text-3xl mb-2">🍾</div>
              <div className="font-black text-base">Mark Bottle Empty?</div>
              <div className="text-xs text-muted-foreground mt-1">
                This will close the bottle and record the wallet entry.
              </div>
            </div>
            <div className="grid grid-cols-2 border-t border-border">
              <button
                onClick={() => setMarkEmptyBottleId(null)}
                disabled={bottleBusy}
                className="h-12 font-black text-sm border-r border-border transition active:bg-muted/60 disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const id = markEmptyBottleId;
                  setMarkEmptyBottleId(null);
                  await handleFinishBottle(id);
                }}
                disabled={bottleBusy}
                className="h-12 font-black text-sm text-white transition active:opacity-80 disabled:opacity-40"
                style={{ background: "#dc2626" }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ΓöÇΓöÇ Cancel Bottle Confirm Modal ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */}
      {cancelBottleId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 backdrop-blur-sm px-6">
          <div className="w-full max-w-xs rounded-2xl border border-border shadow-2xl overflow-hidden"
            style={{ background: "var(--gradient-card)" }}>
            <div className="px-5 pt-6 pb-4 text-center">
              <div className="text-3xl mb-2">🍾</div>
              <div className="font-black text-base">Cancel Bottle?</div>
              <div className="text-xs text-muted-foreground mt-1">
                This will remove the bottle and restore 1 to stock.
              </div>
            </div>
            <div className="grid grid-cols-2 border-t border-border">
              <button
                onClick={() => setCancelBottleId(null)}
                disabled={bottleBusy}
                className="h-12 font-black text-sm border-r border-border transition active:bg-muted/60 disabled:opacity-40"
              >
                Keep
              </button>
              <button
                onClick={async () => {
                  const id = cancelBottleId;
                  setCancelBottleId(null);
                  await handleCancelBottle(id);
                }}
                disabled={bottleBusy}
                className="h-12 font-black text-sm text-white transition active:opacity-80 disabled:opacity-40"
                style={{ background: "#374151" }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ΓöÇΓöÇ Opened Bottles Modal ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */}
      {bottlesModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setBottlesModalOpen(false)}>
          <div
            className="w-full max-w-md rounded-t-3xl border border-border shadow-2xl pb-safe"
            style={{ background: "var(--gradient-card)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <span className="text-base font-black">🍾 Opened Bottles</span>
              <button onClick={() => setBottlesModalOpen(false)}
                className="h-8 w-8 rounded-full flex items-center justify-center bg-muted hover:bg-muted/80 transition">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-5 pb-6 space-y-3 max-h-[70vh] overflow-y-auto">
              {openedBottles.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground text-sm">No bottles currently open.</div>
              ) : (
                openedBottles.map((b) => {
                  const prod = products.find(p => p.id === b.product_id);
                  return (
                  <div key={b.id}
                    className="rounded-2xl border border-border overflow-hidden"
                    style={{ background: "rgba(var(--primary-rgb,251 146 60)/0.06)" }}>
                    {/* Image + info row */}
                    <div className="flex items-center gap-3 p-3">
                      <div className="h-14 w-14 shrink-0 rounded-xl overflow-hidden bg-black/30 flex items-center justify-center">
                        {prod?.image_url
                          ? <img src={productImageUrl(prod.image_url)!} alt="" className="h-full w-full object-cover"
                              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                          : <span className="text-3xl">🍾</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-black text-sm leading-tight truncate">{b.product_name}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Opened {new Date(b.opened_at).toLocaleDateString("en-GB", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-muted-foreground">{b.shots_sold} shot{b.shots_sold !== 1 ? "s" : ""}</span>
                          <span className="text-xs font-black text-primary">${Number(b.revenue).toFixed(2)} made</span>
                        </div>
                      </div>
                    </div>
                    {/* Single centered button — Cancel if 0 shots, Mark Bottle Empty if shots sold */}
                    <div className="flex justify-center py-2">
                      <button
                        onClick={() => b.shots_sold === 0 ? handleCancelBottle(b.id) : handleFinishBottle(b.id)}
                        disabled={bottleBusy}
                        className="px-6 h-10 rounded-xl font-black text-sm text-white disabled:opacity-40 active:scale-[0.98] transition flex items-center justify-center gap-2"
                        style={{ background: b.shots_sold === 0 ? "linear-gradient(135deg,#374151,#1f2937)" : "linear-gradient(135deg,#dc2626,#991b1b)" }}
                      >
                        {bottleBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : b.shots_sold === 0 ? "✗ Cancel" : "Mark Bottle Empty"}
                      </button>
                    </div>
                  </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ΓòÉΓòÉ PACK MODALS (cigarettes / rolling papers) ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ */}

      {/* ΓöÇΓöÇ Pack Step 1: Select open pack + open new ΓöÇΓöÇ */}
      {packModalOpen && packStep === "select" && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => { setPackModalOpen(false); setPackStep("select"); setPackPrice(""); setPackPackId(""); setShowNewPackGrid(false); }}>
          <div className="w-full max-w-md rounded-t-3xl border border-border shadow-2xl"
            style={{ background: "var(--gradient-card)" }}
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <span className="text-base font-black">{packType === "paper" ? t("select_cigg_paper", "🚬 Select Cigarette or Paper") : t("select_cigg_paper", "🚬 Select Cigarette or Paper")}</span>
              <button onClick={() => { setPackModalOpen(false); setPackStep("select"); setPackPrice(""); setPackPackId(""); setShowNewPackGrid(false); }}
                className="h-8 w-8 rounded-full flex items-center justify-center bg-muted hover:bg-muted/80 transition">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-4 pb-5 space-y-4 max-h-[75vh] overflow-y-auto">
              {!showNewPackGrid ? (
                <>
                  {/* Currently open packs of this type */}
                  {openedPacks.filter(p => p.pack_type === packType).length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Currently Open</p>
                      <div className="grid grid-cols-3 gap-2">
                        {openedPacks.filter(p => p.pack_type === packType).map((pk) => {
                          const prod = products.find(p => p.id === pk.product_id);
                          return (
                            <div key={pk.id} className="flex flex-col rounded-2xl overflow-hidden border border-border">
                              {pk.units_sold > 0 ? (
                                <button onClick={(e) => { e.stopPropagation(); setMarkEmptyPackId(pk.id); }}
                                  className="w-full h-10 flex items-center justify-center font-black text-xs text-white active:opacity-80 transition shrink-0"
                                  style={{ background: "#dc2626" }}>Mark Empty</button>
                              ) : (
                                <button onClick={(e) => { e.stopPropagation(); setCancelPackId(pk.id); }}
                                  disabled={packBusy}
                                  className="w-full h-10 flex items-center justify-center font-black text-xs text-white active:opacity-80 transition disabled:opacity-40 shrink-0"
                                  style={{ background: "#374151" }}>✗ Cancel</button>
                              )}
                              <button
                                onClick={() => { setPackPackId(pk.id); setPackPrice(pk.unit_price ? String(pk.unit_price) : ""); setPackStep("price"); setPackModalOpen(false); setShowNewPackGrid(false); }}
                                className="aspect-[3/4] relative w-full active:scale-95 transition"
                                style={{ background: "var(--gradient-card)" }}>
                                {prod?.image_url ? <img src={productImageUrl(prod.image_url)!} alt="" className="absolute inset-0 w-full h-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} /> : null}
                                <div className="absolute inset-0 flex items-center justify-center text-3xl"
                                  style={{ display: prod?.image_url ? "none" : "flex" }}>{packType === "paper" ? "📄" : "🚬"}</div>
                              </button>
                              <div className="px-1.5 py-1.5" style={{ background: "rgba(var(--primary-rgb,251 146 60)/0.10)", borderTop: "1px solid rgba(var(--primary-rgb,251 146 60)/0.35)" }}>
                                <div className="font-bold text-[11px] truncate leading-tight" style={{ color: "var(--primary)" }}>{pk.product_name}</div>
                                <div className="font-black text-xs mt-0.5" style={{ color: "var(--primary)" }}>${Number(pk.revenue).toFixed(2)} made</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <div className="pt-3">
                    <button onClick={() => setShowNewPackGrid(true)}
                      className="w-full h-11 rounded-xl border-dashed border-2 flex items-center justify-center gap-2 font-bold text-sm transition active:scale-[0.98]"
                      style={{ borderColor: "var(--primary)", color: "var(--primary)" }}>
                      + Open New Pack
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setShowNewPackGrid(false)} className="text-muted-foreground hover:text-foreground transition"><X className="h-4 w-4" /></button>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Select from Inventory</p>
                  </div>
                  {cigaretteProducts.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">No cigarettes in stock.</p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      {cigaretteProducts.map((p) => (
                        <button key={p.id}
                          onClick={async () => {
                            setPackBusy(true);
                            const ownId = ownerIdRef.current;
                            if (!ownId) { setPackBusy(false); return; }
                            const { error } = await supabase.rpc("open_pack", {
                              p_owner_id: ownId, p_product_id: p.id, p_pack_type: packType, p_unit_price: 0,
                            });
                            if (error) { toast.error(error.message); setPackBusy(false); return; }
                            await fetchOpenedPacks();
                            await fetchProducts();
                            const { data } = await supabase.from("opened_packs").select("id")
                              .eq("owner_id", ownId).eq("product_id", p.id).eq("status", "open").eq("pack_type", packType)
                              .order("opened_at", { ascending: false }).limit(1);
                            setPackBusy(false);
                            if (data?.[0]) { setPackPackId(data[0].id); setPackPrice(""); setPackStep("price"); setPackModalOpen(false); setShowNewPackGrid(false); }
                          }}
                          disabled={packBusy}
                          className="flex flex-col rounded-2xl overflow-hidden border border-border active:scale-95 transition disabled:opacity-50">
                          <div className="aspect-[3/4] relative w-full" style={{ background: "var(--gradient-card)" }}>
                            {p.image_url ? <img src={productImageUrl(p.image_url)!} alt="" className="absolute inset-0 w-full h-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} /> : null}
                            <div className="absolute inset-0 flex items-center justify-center text-3xl"
                              style={{ display: p.image_url ? "none" : "flex" }}>{packType === "paper" ? "📄" : "🚬"}</div>
                            <div className="absolute top-1 left-1 bg-black/70 rounded-full px-1.5 py-0.5"><span className="text-[9px] font-black text-white">{p.stock_qty}</span></div>
                            {packBusy && <div className="absolute inset-0 flex items-center justify-center bg-black/40"><Loader2 className="h-6 w-6 animate-spin text-white" /></div>}
                          </div>
                          <div className="px-1.5 py-1.5" style={{ background: "rgba(var(--primary-rgb,251 146 60)/0.10)", borderTop: "1px solid rgba(var(--primary-rgb,251 146 60)/0.35)" }}>
                            <div className="font-bold text-[11px] truncate leading-tight" style={{ color: "var(--primary)" }}>{p.name}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Pack Step 2: Price + Qty entry ── */}
      {packStep === "price" && packPackId && (() => {
        const pack = openedPacks.find((p) => p.id === packPackId);
        const product = products.find((p) => p.id === pack?.product_id);
        const capacity = product?.units_per_item ?? 0;
        const alreadySold = pack?.units_sold ?? 0;
        const remaining = capacity > 0 ? capacity - alreadySold : null;
        return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => { setPackStep("select"); setPackPackId(""); setPackPrice(""); setPackQty(1); }}>
          <div className="w-full max-w-md rounded-t-3xl border border-border shadow-2xl"
            style={{ background: "var(--gradient-card)" }}
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <div>
                <span className="font-black text-base">🚬 Add to Order</span>
                {remaining !== null && (
                  <p className="text-xs mt-0.5 font-semibold" style={{ color: remaining <= 3 ? "#fca5a5" : "#86efac" }}>
                    {remaining} unit{remaining !== 1 ? "s" : ""} remaining
                  </p>
                )}
              </div>
              <button onClick={() => { setPackStep("select"); setPackPackId(""); setPackPrice(""); setPackQty(1); setPackModalOpen(true); }}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 h-8 px-2 rounded-lg bg-muted">
                <X className="h-3.5 w-3.5" /> Change
              </button>
            </div>

            {/* Pack card grid — tap to add, shows qty banner, price from retail variation */}
            <div className="px-4 pb-2">
              <div className="grid grid-cols-3 gap-2">
                {openedPacks.map((pk) => {
                  const pkProd = products.find(p => p.id === pk.product_id);
                  const pkCap = pkProd?.units_per_item ?? 0;
                  const pkRemaining = pkCap > 0 ? pkCap - pk.units_sold : null;
                  const unitPrice = (pkProd?.bottle_variations ?? []).find((v: any) => v.key === "retail")?.price ?? pkProd?.price ?? 0;
                  // Cart qty already added for this pack
                  const cartQtyForPack = cart
                    .filter((c) => (c as any)._pack_id === pk.id)
                    .reduce((s, c) => s + c.qty, 0);
                  const effectiveRemaining = pkRemaining !== null ? pkRemaining - cartQtyForPack : null;
                  const isSelected = pk.id === packPackId;
                  const isOutOfStock = effectiveRemaining !== null && effectiveRemaining <= 0;
                  return (
                    <div key={pk.id} className="rounded-2xl border-2 overflow-hidden transition"
                      style={{
                        borderColor: isSelected ? "var(--primary)" : "rgba(255,255,255,0.1)",
                        background: isSelected ? "rgba(var(--primary-rgb,251 146 60)/0.08)" : "var(--gradient-card)",
                        opacity: isOutOfStock ? 0.4 : 1,
                      }}>
                      {/* Card image area — tap to select + add 1 */}
                      <button type="button" disabled={isOutOfStock}
                        onClick={() => {
                          setPackPackId(pk.id);
                          setPackQty((q) => {
                            const next = isSelected ? q + 1 : 1;
                            return effectiveRemaining !== null ? Math.min(next, effectiveRemaining) : next;
                          });
                          if (!isSelected) setPackQty(1);
                        }}
                        className="w-full relative active:bg-white/5 transition">
                        <div className="aspect-[3/4] relative w-full">
                          {pkProd?.image_url ? <img src={productImageUrl(pkProd.image_url)!} alt="" className="absolute inset-0 w-full h-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} /> : null}
                          <div className="absolute inset-0 flex items-center justify-center text-4xl"
                            style={{ display: pkProd?.image_url ? "none" : "flex" }}>{pk.pack_type === "paper" ? "📄" : "🚬"}</div>
                          {effectiveRemaining !== null && (
                            <div className="absolute top-1.5 left-1.5 rounded-full px-1.5 py-0.5 bg-black/70">
                              <span className="text-[10px] font-black text-white">{effectiveRemaining} left</span>
                            </div>
                          )}
                        </div>
                        <div className="px-2 py-1.5" style={{ background: "rgba(var(--primary-rgb,251 146 60)/0.10)", borderTop: "1px solid rgba(var(--primary-rgb,251 146 60)/0.35)" }}>
                          <div className="font-bold text-[11px] truncate" style={{ color: "var(--primary)" }}>{pk.product_name}</div>
                          <div className="font-black text-xs" style={{ color: "#86efac" }}>${unitPrice.toFixed(2)} each</div>
                          {pkCap > 0 && (
                            <div className="text-[10px] font-semibold mt-0.5" style={{ color: "var(--muted-foreground)" }}>{pkCap} per pack</div>
                          )}
                        </div>
                      </button>
                      {/* Qty banner — shown only when selected */}
                      {isSelected && (
                        <div className="flex items-center justify-between px-2 py-1.5 gap-2 border-t border-border/40">
                          <button type="button"
                            onClick={() => { if (packQty <= 1) { setPackPackId(""); setPackQty(1); } else setPackQty(q => q - 1); }}
                            className="h-8 w-8 rounded-full flex items-center justify-center font-black active:scale-90 transition"
                            style={{ background: "#ef4444" }}>−</button>
                          <span className="font-black text-base" style={{ color: "var(--primary)" }}>{packQty}</span>
                          <button type="button"
                            disabled={effectiveRemaining !== null && packQty >= effectiveRemaining}
                            onClick={() => setPackQty(q => effectiveRemaining !== null ? Math.min(q + 1, effectiveRemaining) : q + 1)}
                            className="h-8 w-8 rounded-full flex items-center justify-center font-black active:scale-90 transition disabled:opacity-30"
                            style={{ background: "var(--gradient-hero)" }}>+</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Action area — Add to Order + Open New Pack when full */}
            <div className="px-4 pb-4 pt-1 space-y-2">
              {/* Running cart summary for this pack session */}
              {(() => {
                const sessionItems = cart.filter((c) => (c as any)._pack_id);
                if (sessionItems.length === 0) return null;
                const sessionTotal = sessionItems.reduce((s, c) => s + c.price * c.qty, 0);
                const sessionQty = sessionItems.reduce((s, c) => s + c.qty, 0);
                return (
                  <div className="rounded-xl px-3 py-2 flex items-center justify-between"
                    style={{ background: "rgba(var(--primary-rgb,251 146 60)/0.10)", border: "1px solid rgba(var(--primary-rgb,251 146 60)/0.25)" }}>
                    <span className="text-xs font-black" style={{ color: "var(--primary)" }}>
                      {sessionQty} unit{sessionQty !== 1 ? "s" : ""} added
                    </span>
                    <span className="text-xs font-black" style={{ color: "var(--primary)" }}>
                      ${sessionTotal.toFixed(2)}
                    </span>
                  </div>
                );
              })()}

              {/* Add to Order — only shown when a pack is selected and qty > 0 */}
              {packPackId && packQty > 0 && (() => {
                const pack = openedPacks.find((p) => p.id === packPackId);
                const prod = products.find((p) => p.id === pack?.product_id);
                const unitPrice = (prod?.bottle_variations ?? []).find((v: any) => v.key === "retail")?.price ?? prod?.price ?? 0;
                return (
                  <button onClick={() => addPackUnit()}
                    disabled={!packPackId || unitPrice <= 0}
                    className="w-full h-12 rounded-xl font-black text-sm text-primary-foreground disabled:opacity-40 active:scale-[0.98] transition flex items-center justify-center gap-2"
                    style={{ background: "var(--gradient-hero)" }}>
                    + Add {packQty > 1 ? `${packQty}x ` : ""}to Order
                    {unitPrice > 0 && <span className="opacity-80 text-sm">— ${(unitPrice * packQty).toFixed(2)}</span>}
                  </button>
                );
              })()}

              {/* Open New Pack — shown when current pack is tapped out in cart */}
              {packPackId && (() => {
                const pack = openedPacks.find((p) => p.id === packPackId);
                const prod = products.find((p) => p.id === pack?.product_id);
                const pkCap = prod?.units_per_item ?? 0;
                const cartQty = cart.filter((c) => (c as any)._pack_id === packPackId).reduce((s, c) => s + c.qty, 0);
                const alreadySold = pack?.units_sold ?? 0;
                const isFull = pkCap > 0 && (alreadySold + cartQty) >= pkCap;
                if (!isFull) return null;
                return (
                  <button type="button" disabled={packBusy}
                    onClick={async () => {
                      if (!pack || !prod) return;
                      setPackBusy(true);
                      const { error } = await supabase.rpc("open_pack", {
                        p_owner_id: ownerIdRef.current, p_product_id: prod.id,
                        p_pack_type: pack.pack_type,
                        p_unit_price: (prod.bottle_variations ?? []).find((v: BottleVariation) => v.key === "retail")?.price ?? prod.price,
                      });
                      setPackBusy(false);
                      if (error) { toast.error(error.message); return; }
                      await fetchOpenedPacks();
                      await fetchProducts();
                      const { data: newPack } = await supabase.from("opened_packs")
                        .select("id").eq("owner_id", ownerIdRef.current!)
                        .eq("product_id", prod.id).eq("status", "open")
                        .order("opened_at", { ascending: false }).limit(1);
                      if (newPack?.[0]) {
                        setPacksPendingClose((prev) => [...prev, newPack[0].id]);
                        setPackPackId(newPack[0].id);
                        setPackQty(1);
                      }
                    }}
                    className="w-full h-11 rounded-xl font-black text-sm border-2 flex items-center justify-center gap-2 transition active:scale-95"
                    style={{ borderColor: "var(--primary)", color: "var(--primary)", background: "rgba(var(--primary-rgb,251 146 60)/0.08)" }}>
                    {packBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "📦 Open New Pack"}
                  </button>
                );
              })()}

            </div>
          </div>
        </div>
        );
      })()}

      {/* ΓöÇΓöÇ Mark Pack Empty Confirm ΓöÇΓöÇ */}
      {markEmptyPackId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 backdrop-blur-sm px-6">
          <div className="w-full max-w-xs rounded-2xl border border-border shadow-2xl overflow-hidden" style={{ background: "var(--gradient-card)" }}>
            <div className="px-5 pt-6 pb-4 text-center">
              <div className="text-3xl mb-2">🚬</div>
              <div className="font-black text-base">Mark Pack Empty?</div>
              <div className="text-xs text-muted-foreground mt-1">This will close the pack and record the wallet entry.</div>
            </div>
            <div className="grid grid-cols-2 border-t border-border">
              <button onClick={() => setMarkEmptyPackId(null)} disabled={packBusy}
                className="h-12 font-black text-sm border-r border-border transition active:bg-muted/60 disabled:opacity-40">Cancel</button>
              <button onClick={async () => { const id = markEmptyPackId; setMarkEmptyPackId(null); await handleFinishPack(id!); }}
                disabled={packBusy}
                className="h-12 font-black text-sm text-white transition active:opacity-80 disabled:opacity-40"
                style={{ background: "#dc2626" }}>OK</button>
            </div>
          </div>
        </div>
      )}

      {/* ΓöÇΓöÇ Cancel Pack Confirm ΓöÇΓöÇ */}
      {cancelPackId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 backdrop-blur-sm px-6">
          <div className="w-full max-w-xs rounded-2xl border border-border shadow-2xl overflow-hidden" style={{ background: "var(--gradient-card)" }}>
            <div className="px-5 pt-6 pb-4 text-center">
              <div className="text-3xl mb-2">🚬</div>
              <div className="font-black text-base">Cancel Pack?</div>
              <div className="text-xs text-muted-foreground mt-1">This will remove the pack and restore 1 to stock.</div>
            </div>
            <div className="grid grid-cols-2 border-t border-border">
              <button onClick={() => setCancelPackId(null)} disabled={packBusy}
                className="h-12 font-black text-sm border-r border-border transition active:bg-muted/60 disabled:opacity-40">Keep</button>
              <button onClick={async () => { const id = cancelPackId; setCancelPackId(null); await handleCancelPack(id!); }}
                disabled={packBusy}
                className="h-12 font-black text-sm text-white transition active:opacity-80 disabled:opacity-40"
                style={{ background: "#374151" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

    </>
  );
}

// ΓöÇΓöÇΓöÇ Cash Overlay ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
// ── CashItemActions — shared action bar for cash & credit order item rows ──────
function CashItemActions({ item, onDec, onAdd, onRemove }: {
  item: CartItem;
  onDec: (id: string) => void;
  onAdd: (p: CartItem) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      {/* − */}
      <button
        onClick={() => onDec(item.id)}
        className="h-11 w-11 ml-3 rounded-full flex items-center justify-center active:scale-90 transition shrink-0"
        style={{ background: "#ef4444" }}>
        <Minus className="h-5 w-5 text-white" />
      </button>
      {/* qty */}
      <div className="h-11 min-w-[2.75rem] px-2 rounded-full flex items-center justify-center text-base font-black text-white shrink-0"
        style={{ background: "#1a1a1a" }}>
        {item.qty}
      </div>
      {/* + */}
      <button
        onClick={() => onAdd(item)}
        className="h-11 w-11 rounded-full flex items-center justify-center active:scale-90 transition shrink-0"
        style={{ background: "var(--gradient-hero)" }}>
        <Plus className="h-5 w-5 text-black" />
      </button>
      {/* X — removes item */}
      <button
        onClick={() => onRemove(item.id)}
        className="h-11 w-11 rounded-full flex items-center justify-center active:scale-90 transition shrink-0"
        style={{ background: "rgba(239,68,68,0.12)", border: "1.5px solid rgba(239,68,68,0.35)" }}>
        <X className="h-5 w-5 text-red-400" />
      </button>
    </div>
  );
}

function CashOverlay({
  total, cart, onDec, onAdd, onRemove, onClearCart, onClose, onSuccess, ownerId,
}: {
  total: number; cart: CartItem[];
  onDec: (id: string) => void; onAdd: (p: CartItem) => void;
  onRemove: (id: string) => void;
  onClearCart: () => void;
  onClose: () => void; onSuccess: (paid: number, change: number) => void;
  ownerId: string;
}) {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const { isOnline } = useNetworkStatus();
  const [step, setStep] = useState<1 | 2>(1);
  const [paid, setPaid] = useState("");
  const [busy, setBusy] = useState(false);

  // Order-level discount
  const [orderDiscount, setOrderDiscount] = useState(0);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [discountVal, setDiscountVal] = useState("");
  const discountedTotal = Math.max(0, total - orderDiscount);

  // Customer / payment mode selection
  const [payMode, setPayMode] = useState<null | "cash" | "credit">(null);
  const [selectedCustomer, setSelectedCustomer] = useState<CreditAccount | null>(null);
  const [customers, setCustomers] = useState<CreditAccount[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [showRightPanel, setShowRightPanel] = useState(false);

  useEffect(() => {
    if (!ownerId) return;
    setLoadingCustomers(true);
    supabase.from("credit_accounts")
      .select("id, full_name, contact_number, balance_owed, status")
      .eq("owner_id", ownerId)
      .order("full_name")
      .then(async ({ data, error }) => {
        if (data) {
          // Network success — update state and refresh cache
          setCustomers(data as CreditAccount[]);
          cacheCreditAccounts(ownerId, data as CreditAccount[]);
        } else {
          // Network failed (offline) — serve from IndexedDB cache
          console.warn("[CashOverlay] customers fetch failed, using cache:", error?.message ?? "offline");
          const cached = await getCachedCreditAccounts(ownerId);
          setCustomers(cached as CreditAccount[]);
        }
        setLoadingCustomers(false);
      });
  }, [ownerId]);

  useEffect(() => {
    if (step === 2) setPaid("");
  }, [step]);

  const change = Math.max(0, (Number(paid) || 0) - discountedTotal);
  const enough = (Number(paid) || 0) >= discountedTotal;

  // Shared stock/shot/pack helpers — enqueue offline if no network
  const doStockAndShots = async (groupId: string) => {
    const stockItems = cart.filter((c) => !c.id.startsWith("shot-") && !c.id.startsWith("pack-")).map((c) => ({ id: c.id, qty: c.qty }));
    if (isOnline) {
      await supabase.rpc("decrement_stock_item", { p_items: stockItems });
    } else {
      await enqueue("rpc_decrement_stock_item", { p_items: stockItems }, groupId);
    }
    for (const shot of cart.filter((c) => (c as any)._bottle_id)) {
      const payload = { p_bottle_id: (shot as any)._bottle_id, p_qty: shot.qty, p_revenue: shot.qty * Number(shot.price) };
      if (isOnline) {
        await supabase.rpc("record_shot", payload);
      } else {
        await enqueue("rpc_record_shot", payload, groupId);
      }
    }
    for (const unit of cart.filter((c) => (c as any)._pack_id)) {
      const payload = { p_pack_id: (unit as any)._pack_id, p_qty: (unit as any)._pack_units ?? unit.qty, p_revenue: ((unit as any)._pack_units ?? unit.qty) * Number(unit.price) };
      if (isOnline) {
        await supabase.rpc("record_pack_unit", payload);
      } else {
        await enqueue("rpc_record_pack_unit", payload, groupId);
      }
    }
  };

  const submit = async () => {
    if (payMode === "credit") {
      if (!selectedCustomer || !profile) {
        if (!selectedCustomer) toast.error("Please select a customer");
        return;
      }
    } else {
      if (!enough || !profile) return;
    }
    setBusy(true);
    const paidNum = Number(paid);
    const changeNum = change;
    // Unique id to group all ops from this checkout together
    const groupId = `order-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    if (payMode === "credit" && selectedCustomer) {
      // ── Credit order ──────────────────────────────────────────────────
      const itemsDesc = cart.map((c) => `${c.qty}x ${c.name}`).join(", ");
      const discountNote = orderDiscount > 0 ? ` | Disc: -$${orderDiscount.toFixed(2)} (orig $${total.toFixed(2)})` : "";
      const creditPayload = {
        p_credit_account_id: selectedCustomer.id,
        p_cashier_id: profile.id,
        p_amount: discountedTotal,
        p_items: cart.map((c) => ({ id: c.id, name: c.name, price: c.price, cost_price: (c as any).cost_price ?? 0, qty: c.qty })),
        p_note: itemsDesc + discountNote,
      };
      if (!isOnline) {
        await enqueue("rpc_record_credit_charge", creditPayload, groupId);
        await doStockAndShots(groupId);
        setBusy(false);
        toast.success(`💾 Saved offline — will sync when reconnected`);
        onSuccess(paidNum, changeNum);
        return;
      }
      const { error } = await supabase.rpc("record_credit_charge", creditPayload);
      if (error) { setBusy(false); toast.error(error.message); return; }
      await doStockAndShots(groupId);
      setBusy(false);
      toast.success(`Charged $${discountedTotal.toFixed(2)} to ${selectedCustomer.full_name}`);
      onSuccess(paidNum, changeNum);
      return;
    }

    // ── Cash order (guest or customer) ────────────────────────────────
    const orderPayload = {
      owner_id: ownerId, cashier_id: profile.id,
      items: cart.map((c) => ({ id: c.id, name: c.name, price: c.price, qty: c.qty, units_consumed: (c as any)._units_consumed ?? null, ...(c._discount ? { discount: c._discount, original_price: c._originalPrice ?? c.price } : {}) })),
      total: discountedTotal, paid: paidNum, change_given: changeNum,
      ...(orderDiscount > 0 ? { discount_amount: orderDiscount, original_total: total } : {}),
    };

    if (!isOnline) {
      await enqueue("orders_insert", orderPayload, groupId);
      await doStockAndShots(groupId);
      if (payMode === "cash" && selectedCustomer) {
        const itemsDesc = cart.map((c) => `${c.qty}x ${c.name}`).join(", ");
        await enqueue("credit_transactions_insert", {
          credit_account_id: selectedCustomer.id,
          owner_id: ownerId,
          cashier_id: profile.id,
          type: "charge",
          amount: discountedTotal,
          items: cart.map((c) => ({ id: c.id, name: c.name, price: c.price, qty: c.qty, units_consumed: (c as any)._units_consumed ?? null })),
          note: "[CASH] " + itemsDesc,
        }, groupId);
      }
      setBusy(false);
      toast.success(`💾 Saved offline — will sync when reconnected`);
      onSuccess(paidNum, changeNum);
      return;
    }

    const { error } = await supabase.from("orders").insert(orderPayload);
    if (error) { setBusy(false); toast.error(error.message); return; }
    await doStockAndShots(groupId);

    // If a customer was selected with cash, record history without changing balance
    if (payMode === "cash" && selectedCustomer) {
      const itemsDesc = cart.map((c) => `${c.qty}x ${c.name}`).join(", ");
      await (supabase as any).from("credit_transactions").insert({
        credit_account_id: selectedCustomer.id,
        owner_id: ownerId,
        cashier_id: profile.id,
        type: "charge",
        amount: discountedTotal,
        items: cart.map((c) => ({ id: c.id, name: c.name, price: c.price, qty: c.qty, units_consumed: (c as any)._units_consumed ?? null })),
        note: "[CASH] " + itemsDesc,
      });
    }

    setBusy(false);
    onSuccess(paidNum, changeNum);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      {/* Outer container: side-by-side on md+, stacked on mobile */}
      <div className="relative w-full max-w-3xl max-h-[90dvh] flex flex-col md:flex-row rounded-3xl overflow-hidden border border-border shadow-2xl" style={{ background: "var(--gradient-card)" }}>

        {/* ── Left panel: order review ── */}
        <div className="flex flex-col flex-1 min-h-0 md:border-r md:border-border">
          <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
            <h2 className="text-xl font-black">{t("cash_order", "Place Order")}</h2>
            <div className="flex items-center gap-2">
              {/* Customer toggle — mobile only */}
              {step === 1 && (
                <button
                  onClick={() => setShowRightPanel(v => !v)}
                  className="md:hidden h-11 px-4 rounded-xl font-black text-sm flex items-center gap-1.5 active:scale-95 transition"
                  style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}>
                  👤
                  {selectedCustomer ? selectedCustomer.full_name.split(" ")[0] : payMode ?? "Guest"}
                </button>
              )}
              <button onClick={onClose} className="h-11 w-11 rounded-full flex items-center justify-center bg-muted hover:bg-muted/80 transition" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {step === 1 && (
            <>
              <div className="flex-1 overflow-y-auto px-5 space-y-4 pb-4">
                <div className="rounded-2xl p-5 text-center" style={{ background: "var(--gradient-hero)" }}>
                  <div className="text-sm font-medium text-primary-foreground/80">Total Due</div>
                  {orderDiscount > 0 && (
                    <div className="text-xs line-through text-primary-foreground/50 mb-0.5">${total.toFixed(2)}</div>
                  )}
                  <div className="text-5xl font-black text-primary-foreground">${discountedTotal.toFixed(2)}</div>
                  {orderDiscount > 0 && (
                    <div className="text-xs font-semibold text-white/90 mt-0.5">-${orderDiscount.toFixed(2)} discount</div>
                  )}
                  {selectedCustomer && (
                    <div className="mt-2 text-xs font-black text-primary-foreground/70">
                      {payMode === "credit" ? "🧾 Credit" : "💵 Cash"} · {selectedCustomer.full_name}
                    </div>
                  )}
                  {!selectedCustomer && <div className="mt-2 text-xs text-primary-foreground/50">Guest</div>}
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Order</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => { if (orderDiscount > 0) { setOrderDiscount(0); setDiscountVal(""); setDiscountOpen(false); } else { setDiscountOpen(v => !v); } }}
                        className="flex items-center gap-1.5 px-3 h-9 rounded-xl text-sm font-black transition active:scale-95"
                        style={orderDiscount > 0
                          ? { background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.4)", color: "#4ade80" }
                          : { background: "rgba(250,204,21,0.1)", border: "1px solid rgba(250,204,21,0.25)", color: "#facc15" }}>
                        {orderDiscount > 0 ? `✕ -$${orderDiscount.toFixed(2)}` : <><span className="text-base font-black leading-none">+</span> Discount</>}
                      </button>
                      <button onClick={onClearCart} className="flex items-center gap-1.5 px-3 h-9 rounded-xl text-sm font-black text-destructive transition active:scale-95" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)" }}>
                        <Trash2 className="h-4 w-4" /> Clear all
                      </button>
                    </div>
                  </div>
                  {discountOpen && orderDiscount === 0 && (
                    <div className="rounded-xl border border-yellow-500/30 p-3 space-y-2" style={{ background: "oklch(0.18 0.04 80 / 0.5)" }}>
                      <div className="text-xs font-semibold text-yellow-300/70 uppercase tracking-widest text-center">Order Discount ($)</div>
                      <div className="rounded-lg border border-yellow-500/20 px-3 py-2 text-center text-xl font-black text-yellow-100" style={{ background: "oklch(0.12 0.02 80)" }}>
                        {discountVal || "0"}
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {["1","2","3","4","5","6","7","8","9",".","0","⌫"].map((k) => (
                          <button key={k} type="button"
                            onClick={() => {
                              if (k === "⌫") setDiscountVal(v => v.slice(0, -1));
                              else if (k === ".") { if (!discountVal.includes(".")) setDiscountVal(v => v + "."); }
                              else { const dot = discountVal.indexOf("."); if (dot !== -1 && discountVal.length - dot > 2) return; setDiscountVal(v => v === "0" ? k : v + k); }
                            }}
                            className={`h-11 rounded-xl font-black text-lg transition active:scale-95 ${k === "⌫" ? "bg-destructive/20 text-destructive" : "bg-muted hover:bg-muted/70 text-foreground"}`}>
                            {k}
                          </button>
                        ))}
                      </div>
                      <button
                        className="w-full h-10 rounded-xl font-black text-sm transition active:scale-95"
                        style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}
                        onClick={() => { const d = Math.min(parseFloat(discountVal) || 0, total); setOrderDiscount(d); setDiscountOpen(false); }}>
                        Apply Discount
                      </button>
                    </div>
                  )}
                  {cart.map((i) => (
                    <div key={i.id} className="flex gap-3 p-3 rounded-xl bg-background/50">
                      <div className="h-20 w-14 sm:h-28 sm:w-20 md:h-32 md:w-24 shrink-0 rounded-xl overflow-hidden bg-muted flex items-center justify-center">
                        {i.image_url ? <img src={productImageUrl(i.image_url)!} alt={i.name} className="h-full w-full object-cover" />
                          : i.id.startsWith("shot-") ? <span className="text-2xl">🥃</span>
                          : <span className="text-2xl">{categoryIcon(i.category ?? "drinks")}</span>}
                      </div>
                      <div className="flex-1 min-w-0 flex flex-col gap-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="font-black text-sm leading-tight flex-1">{i.name}</div>
                          <div className="flex flex-col items-end shrink-0">
                            <span className="font-black text-base" style={{ color: "var(--primary)" }}>${(i.qty * Number(i.price)).toFixed(2)}</span>
                            <span className="text-[11px] text-muted-foreground">${Number(i.price).toFixed(2)} each</span>
                          </div>
                        </div>
                        <CashItemActions item={i} onDec={onDec} onAdd={onAdd} onRemove={onRemove} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="shrink-0 px-5 pb-5 pt-3 border-t border-border flex gap-3">
                <Button variant="outline" className="flex-1 h-12" onClick={onClose}>{t("cancel", "Cancel")}</Button>
                <Button className="flex-1 h-12 font-black text-base" onClick={() => setStep(2)} style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}>{t("proceed", "Proceed")}</Button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-3">
                {payMode === "credit" && selectedCustomer ? (
                  /* Credit — no cash collection needed, confirm directly */
                  <div className="rounded-2xl p-6 text-center space-y-2" style={{ background: "oklch(0.18 0.04 45)", border: "2px solid var(--primary)" }}>
                    <div className="text-sm font-semibold" style={{ color: "var(--primary)" }}>Charging to</div>
                    <div className="text-2xl font-black" style={{ color: "var(--primary)" }}>{selectedCustomer.full_name}</div>
                    <div className="text-4xl font-black" style={{ color: "var(--primary)" }}>${discountedTotal.toFixed(2)}</div>
                    {orderDiscount > 0 && (
                      <div className="text-xs text-green-400 font-semibold">-${orderDiscount.toFixed(2)} discount applied</div>
                    )}
                    {Number(selectedCustomer.balance_owed) > 0 && (
                      <div className="text-sm text-red-400 font-semibold">Current balance: ${Number(selectedCustomer.balance_owed).toFixed(2)}</div>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="rounded-xl border border-green-500/30 px-4 py-3 text-center" style={{ background: "oklch(0.22 0.06 145 / 0.4)" }}>
                      <div className="text-xs font-semibold text-green-300/70 uppercase tracking-widest mb-1">Amount Received</div>
                      <div className="text-3xl font-black text-green-100">${paid || "0.00"}</div>
                    </div>
                    <div className={`rounded-xl px-4 py-4 text-center border transition-all ${Number(paid) === 0 ? "opacity-40 bg-green-500/10 border-green-500/20" : enough ? "bg-green-500/25 border-green-500/40" : "bg-red-500/25 border-red-500/40"}`}>
                      <div className={`text-xs font-semibold uppercase tracking-widest mb-1 ${enough ? "text-green-300/70" : "text-red-300/70"}`}>{enough ? "Change to Give" : "Short by"}</div>
                      <div className={`text-5xl font-black ${enough ? "text-green-300" : "text-red-400"}`}>
                        ${Number(paid) === 0 ? "0.00" : (enough ? change : discountedTotal - Number(paid)).toFixed(2)}
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {["1","2","3","4","5","6","7","8","9",".","0","⌫"].map((k) => (
                        <button key={k} type="button" onClick={() => {
                          if (k === "⌫") setPaid((v) => v.slice(0, -1));
                          else if (k === ".") { if (!paid.includes(".")) setPaid((v) => v + "."); }
                          else { const dotIdx = paid.indexOf("."); if (dotIdx !== -1 && paid.length - dotIdx > 2) return; setPaid((v) => (v === "0" ? k : v + k)); }
                        }} className={`h-14 rounded-2xl font-black text-xl transition active:scale-95 ${k === "⌫" ? "bg-destructive/20 text-destructive hover:bg-destructive/30" : "bg-muted hover:bg-muted/70 text-foreground"}`}>
                          {k}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <div className="shrink-0 px-5 pb-5 pt-3 border-t border-border flex gap-3">
                <Button variant="outline" className="flex-1 h-12" onClick={() => { setStep(1); setPaid(""); }}>{t("back", "Back")}</Button>
                <Button className="flex-1 h-12 font-black text-base"
                  disabled={(payMode === "credit" ? false : !enough) || busy}
                  onClick={submit}
                  style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : payMode === "credit" ? "Confirm Credit" : t("confirm_sale", "Confirm Sale")}
                </Button>
              </div>
            </>
          )}
        </div>

        {/* ── Right panel: payment type + customer list ── */}
        {step === 1 && (
          <div className={`
            w-full md:w-64 flex flex-col shrink-0
            md:static
            ${showRightPanel
              ? "absolute inset-0 z-[60] rounded-3xl"
              : "hidden md:flex"}
          `} style={{ background: "oklch(0.15 0.02 60)", border: "3px solid #f97316", borderRadius: "1rem" }}>
            {/* Done button — mobile only, closes the panel */}
            <div className="md:hidden flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
              <span className="text-sm font-black text-white/60">Customer / Payment</span>
              <button onClick={() => setShowRightPanel(false)}
                className="h-9 px-5 rounded-xl font-black text-sm text-primary-foreground active:scale-95 transition"
                style={{ background: "var(--gradient-hero)" }}>
                Done
              </button>
            </div>
            {/* Cash / Credit big square buttons */}
            <div className="grid grid-cols-2 gap-3 px-4 py-3 shrink-0">
              <button
                onClick={() => { setPayMode(payMode === "cash" ? null : "cash"); if (payMode === "credit") setSelectedCustomer(null); }}
                className="h-20 rounded-2xl font-black text-base flex flex-col items-center justify-center gap-1.5 transition active:scale-95"
                style={payMode === "cash"
                  ? { background: "var(--gradient-hero)", color: "var(--primary-foreground)" }
                  : { background: "oklch(0.22 0.02 60)", color: "rgba(255,255,255,0.6)" }}>
                <span className="text-2xl">💵</span>
                Cash
              </button>
              <button
                onClick={() => { setPayMode(payMode === "credit" ? null : "credit"); if (payMode === "cash") setSelectedCustomer(null); }}
                className="h-20 rounded-2xl font-black text-base flex flex-col items-center justify-center gap-1.5 transition active:scale-95"
                style={payMode === "credit"
                  ? { background: "oklch(0.22 0.04 45)", border: "2px solid var(--primary)", color: "var(--primary)" }
                  : { background: "oklch(0.22 0.02 60)", color: "rgba(255,255,255,0.6)" }}>
                <span className="text-2xl">🧾</span>
                Credit
              </button>
            </div>
            {/* Customer list — visible when Cash or Credit is selected */}
            {payMode && (
              <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2 min-h-0 pt-1">
                {loadingCustomers ? (
                  <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
                ) : customers.length === 0 ? (
                  <p className="text-xs text-white/30 text-center py-6">No customers yet</p>
                ) : (
                  customers.map((c) => (
                    <button key={c.id}
                      onClick={() => setSelectedCustomer(selectedCustomer?.id === c.id ? null : c)}
                      className="w-full flex items-center justify-between px-4 py-4 rounded-2xl text-left transition active:scale-[0.98] min-h-[60px]"
                      style={selectedCustomer?.id === c.id
                        ? { background: "var(--gradient-hero)", color: "var(--primary-foreground)" }
                        : { background: "oklch(0.22 0.02 60)", color: "rgba(255,255,255,0.85)" }}>
                      <span className={`text-sm font-black leading-tight flex-1 pr-3 ${selectedCustomer?.id === c.id ? "text-black" : ""}`}>{c.full_name}</span>
                      <span className={`text-xs font-black shrink-0 ${
                        selectedCustomer?.id === c.id
                          ? "text-black"
                          : Number(c.balance_owed) > 0
                            ? "text-red-400"
                            : "text-amber-700"
                      }`}>
                        {Number(c.balance_owed) > 0 ? `-$${Number(c.balance_owed).toFixed(2)}` : "$0.00"}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
            {!payMode && (
              <div className="flex-1 flex items-center justify-center px-4 pb-4 min-h-[80px]">
                <p className="text-xs text-white/30 text-center">Select Cash or Credit<br/>to assign a customer,<br/>or Proceed as Guest</p>
              </div>
            )}
          </div>
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

// ΓöÇΓöÇ Credit Sale Overlay ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
// Step 1: Order review ΓåÆ Step 2: Pick/create credit account ΓåÆ confirm
type CreditAccount = {
  id: string; full_name: string; contact_number: string | null;
  balance_owed: number; status: string;
};

// ── Cash Customer Overlay ─────────────────────────────────────────────────────
// Lets cashier pick or create a customer for a cash sale.
// Records a credit_charge + immediate credit_payment so the transaction history
// shows the purchase while balance stays at $0 (cleared).
function CashCustomerOverlay({
  total, cart, onDec, onAdd, onRemove, onClearCart, onClose, onSuccess, ownerId,
}: {
  total: number;
  cart: CartItem[];
  onDec: (id: string) => void;
  onAdd: (p: CartItem) => void;
  onRemove: (id: string) => void;
  onClearCart: () => void;
  onClose: () => void;
  onSuccess: (paid: number, change: number) => void;
  ownerId: string;
}) {
  const { profile } = useAuth();
  const { isOnline } = useNetworkStatus();
  const [step, setStep] = useState<"pick" | "confirm" | "create" | "pay">("pick");
  const [accounts, setAccounts] = useState<CreditAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [confirmPick, setConfirmPick] = useState<CreditAccount | null>(null);
  const [busy, setBusy] = useState(false);
  const [paid, setPaid] = useState("");
  const [selectedAccount, setSelectedAccount] = useState<CreditAccount | null>(null);

  // Order-level discount (mirrors CashOverlay)
  const [orderDiscount, setOrderDiscount] = useState(0);

  // Create account form
  const [newName, setNewName] = useState("");
  const [newContact, setNewContact] = useState("");
  const [newIdType, setNewIdType] = useState<"drivers_permit" | "national_id">("national_id");
  const [newIdNumber, setNewIdNumber] = useState("");
  const [newActiveField, setNewActiveField] = useState<null | "name" | "idNumber" | "contact">(null);
  const toggleNew = (f: "name" | "idNumber" | "contact") => setNewActiveField((cur) => cur === f ? null : f);

  const change = Math.max(0, (Number(paid) || 0) - total);
  const enough = (Number(paid) || 0) >= total;

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    if (!ownerId) return;
    setLoadingAccounts(true);
    const { data } = await supabase
      .from("credit_accounts")
      .select("id, full_name, contact_number, balance_owed, status")
      .eq("owner_id", ownerId)
      .order("full_name");
    setAccounts((data ?? []) as CreditAccount[]);
    setLoadingAccounts(false);
  };

  const recordShotPack = async (groupId: string) => {
    const shotItems = cart.filter((c) => (c as any)._bottle_id);
    for (const shot of shotItems) {
      const payload = { p_bottle_id: (shot as any)._bottle_id, p_qty: shot.qty, p_revenue: shot.qty * Number(shot.price) };
      if (isOnline) {
        await supabase.rpc("record_shot", payload);
      } else {
        await enqueue("rpc_record_shot", payload, groupId);
      }
    }
    const packItems = cart.filter((c) => (c as any)._pack_id);
    for (const unit of packItems) {
      const payload = { p_pack_id: (unit as any)._pack_id, p_qty: (unit as any)._pack_units ?? unit.qty, p_revenue: ((unit as any)._pack_units ?? unit.qty) * Number(unit.price) };
      if (isOnline) {
        await supabase.rpc("record_pack_unit", payload);
      } else {
        await enqueue("rpc_record_pack_unit", payload, groupId);
      }
    }
  };

  const submitCashOrder = async (account: CreditAccount) => {
    if (!profile || !enough) return;
    setBusy(true);
    const paidNum = Number(paid);
    const changeNum = change;
    const groupId = `order-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const orderPayload = {
      owner_id: ownerId,
      cashier_id: profile.id,
      items: cart.map((c) => ({ id: c.id, name: c.name, price: c.price, qty: c.qty, units_consumed: (c as any)._units_consumed ?? null, ...(c._discount ? { discount: c._discount, original_price: c._originalPrice ?? c.price } : {}) })),
      total,
      paid: paidNum,
      change_given: changeNum,
      ...(orderDiscount > 0 ? { discount_amount: orderDiscount, original_total: total + orderDiscount } : {}),
    };
    const stockItems = cart.filter((c) => !c.id.startsWith("shot-") && !c.id.startsWith("pack-")).map((c) => ({ id: c.id, qty: c.qty }));
    const itemsDesc = cart.map((c) => `${c.qty}x ${c.name}`).join(", ");
    const creditTxPayload = {
      credit_account_id: account.id,
      owner_id: ownerId,
      cashier_id: profile.id,
      type: "charge",
      amount: total,
      items: cart.map((c) => ({ id: c.id, name: c.name, price: c.price, qty: c.qty, units_consumed: (c as any)._units_consumed ?? null })),
      note: "[CASH] " + itemsDesc,
    };

    if (!isOnline) {
      // Queue all operations — they will replay in order when network returns
      await enqueue("orders_insert", orderPayload, groupId);
      await enqueue("rpc_decrement_stock_item", { p_items: stockItems }, groupId);
      await recordShotPack(groupId);
      await enqueue("credit_transactions_insert", creditTxPayload, groupId);
      setBusy(false);
      toast.success(`💾 Saved offline — will sync when reconnected`);
      onSuccess(paidNum, changeNum);
      return;
    }

    // 1. Normal cash order (triggers cashier wallet update)
    const { error: orderErr } = await supabase.from("orders").insert(orderPayload);
    if (orderErr) { setBusy(false); toast.error(orderErr.message); return; }

    // 2. Stock decrement
    await supabase.rpc("decrement_stock_item", { p_items: stockItems });

    // 3. Record shot/pack units
    await recordShotPack(groupId);

    // 4. Record the purchase in the customer's credit history (no balance change — cash was paid)
    await (supabase as any).from("credit_transactions").insert(creditTxPayload);

    setBusy(false);
    onSuccess(paidNum, changeNum);
  };

  const createAndPay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !profile) return;
    setBusy(true);
    const { data: acc, error: createErr } = await supabase
      .from("credit_accounts")
      .insert({
        owner_id: ownerId,
        full_name: newName.trim(),
        contact_number: newContact.trim() ? "868-" + newContact.trim() : null,
        id_number: newIdNumber.trim() ? `${newIdType === "drivers_permit" ? "DP" : "NID"}: ${newIdNumber.trim()}` : null,
        status: "closed",
      })
      .select()
      .single();
    if (createErr || !acc) { setBusy(false); toast.error(createErr?.message ?? "Failed to create account"); return; }
    setBusy(false);
    setSelectedAccount(acc as CreditAccount);
    setStep("pay");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-md max-h-[90dvh] flex flex-col rounded-3xl overflow-hidden border border-border shadow-2xl" style={{ background: "var(--gradient-card)" }}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
          <h2 className="text-xl font-black">Cash — Customer</h2>
          <button onClick={onClose} className="h-9 w-9 rounded-full flex items-center justify-center bg-muted hover:bg-muted/80 transition"><X className="h-4 w-4" /></button>
        </div>

        {/* Step: pick customer */}
        {step === "pick" && (
          <>
            <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-3">
              <p className="text-sm text-muted-foreground">Select the customer's account</p>
              {loadingAccounts ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
              ) : accounts.length === 0 ? (
                <p className="text-center text-muted-foreground py-8 text-sm">No customers yet</p>
              ) : (
                <div className="space-y-2">
                  {accounts.map((a) => (
                    <button key={a.id} onClick={() => setConfirmPick(a)} disabled={busy}
                      className="w-full flex items-center justify-between p-4 rounded-2xl border border-border hover:border-primary/50 active:scale-[0.98] transition text-left disabled:opacity-50"
                      style={{ background: "var(--gradient-card)" }}>
                      <div className="flex-1 min-w-0">
                        <p className="font-black text-sm">{a.full_name}</p>
                        {a.contact_number && <p className="text-xs text-muted-foreground">{a.contact_number}</p>}
                      </div>
                      {Number(a.balance_owed) > 0 && (
                        <span className="text-xs font-black text-red-400 shrink-0 ml-2">owes ${Number(a.balance_owed).toFixed(2)}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="shrink-0 px-5 pb-5 pt-3 border-t border-border flex gap-3">
              <Button variant="outline" className="flex-1 h-12" onClick={onClose}>Cancel</Button>
              <Button className="h-12 px-5 font-black text-sm" onClick={() => setStep("create")} style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}>+ New Customer</Button>
            </div>
          </>
        )}

        {/* Confirm customer pick → go to pay step */}
        {confirmPick && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="w-full max-w-sm mx-6 py-12 px-8 space-y-6 text-center rounded-3xl" style={{ background: "var(--gradient-card)" }}>
              <h3 className="font-black text-2xl">Confirm Customer?</h3>
              <p className="font-black text-3xl">{confirmPick.full_name}</p>
              <p className="font-black text-4xl" style={{ color: "var(--primary)" }}>${total.toFixed(2)}</p>
              <div className="flex gap-3 pt-4">
                <Button variant="outline" className="flex-1 h-16 font-black text-base" onClick={() => setConfirmPick(null)}>Cancel</Button>
                <Button className="flex-1 h-16 font-black text-base" style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}
                  onClick={() => { setSelectedAccount(confirmPick); setConfirmPick(null); setStep("pay"); }}>
                  Yes, Select
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Step: create new customer */}
        {step === "create" && (
          <>
            <form onSubmit={createAndPay} className="flex-1 overflow-y-auto px-5 pb-4 space-y-4">
              <p className="text-sm text-muted-foreground">Create a new customer account</p>
              <div>
                <Label>Full Name *</Label>
                <button type="button" onClick={() => toggleNew("name")} className="w-full h-10 rounded-md border border-input bg-background px-3 text-left mt-1">
                  <span className={`text-sm font-black ${newName ? "text-foreground" : "text-muted-foreground"}`}>{newName || "e.g. John Smith"}</span>
                </button>
                {newActiveField === "name" && <CreditAlphaKeyboard value={newName} onChange={setNewName} onDone={() => setNewActiveField(null)} />}
              </div>
              <div>
                <Label htmlFor="cash-new-idtype">ID Type</Label>
                <select id="cash-new-idtype" value={newIdType} onChange={(e) => setNewIdType(e.target.value as "drivers_permit" | "national_id")}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm font-semibold mt-1">
                  <option value="drivers_permit">Driver's Permit</option>
                  <option value="national_id">National ID</option>
                </select>
              </div>
              <div>
                <Label>ID Number</Label>
                <button type="button" onClick={() => toggleNew("idNumber")} className="w-full h-10 rounded-md border border-input bg-background px-3 text-left mt-1">
                  <span className={`text-sm font-black ${newIdNumber ? "text-foreground" : "text-muted-foreground"}`}>{newIdNumber || "e.g. 00000000"}</span>
                </button>
                {newActiveField === "idNumber" && <CreditNumPad value={newIdNumber} onChange={setNewIdNumber} maxLen={20} onDone={() => setNewActiveField(null)} />}
              </div>
              <div>
                <Label>Contact Number</Label>
                <div className="flex items-center mt-1">
                  <span className="h-10 px-3 flex items-center rounded-l-md border border-r-0 border-input bg-muted text-sm font-bold text-muted-foreground select-none">868</span>
                  <button type="button" onClick={() => toggleNew("contact")} className="flex-1 h-10 rounded-r-md border border-input bg-background px-3 text-left">
                    <span className={`text-sm font-black ${newContact ? "text-foreground" : "text-muted-foreground"}`}>{newContact || "XXX-XXXX"}</span>
                  </button>
                </div>
                {newActiveField === "contact" && <CreditContactPad value={newContact} onChange={setNewContact} onDone={() => setNewActiveField(null)} />}
              </div>
              <Button type="submit" disabled={busy || !newName.trim()} className="w-full h-12 font-black text-base" style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create & Continue"}
              </Button>
            </form>
            <div className="shrink-0 px-5 pb-5 pt-2 border-t border-border">
              <Button variant="outline" className="w-full h-10" onClick={() => setStep("pick")}>← Back to Customers</Button>
            </div>
          </>
        )}

        {/* Step: numpad payment for selected customer */}
        {step === "pay" && selectedAccount && (
          <>
            <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-3">
              <div className="rounded-xl px-4 py-2 text-center" style={{ background: "var(--gradient-hero)" }}>
                <div className="text-xs font-semibold text-primary-foreground/70">Customer</div>
                <div className="font-black text-lg text-primary-foreground">{selectedAccount.full_name}</div>
              </div>
              <div className="rounded-xl border border-green-500/30 px-4 py-3 text-center" style={{ background: "oklch(0.22 0.06 145 / 0.4)" }}>
                <div className="text-xs font-semibold text-green-300/70 uppercase tracking-widest mb-1">Amount Received</div>
                <div className="text-3xl font-black text-green-100">${paid || "0.00"}</div>
              </div>
              <div className={`rounded-xl px-4 py-4 text-center border transition-all ${Number(paid) === 0 ? "opacity-40 bg-green-500/10 border-green-500/20" : enough ? "bg-green-500/25 border-green-500/40" : "bg-red-500/25 border-red-500/40"}`}>
                <div className={`text-xs font-semibold uppercase tracking-widest mb-1 ${enough ? "text-green-300/70" : "text-red-300/70"}`}>{enough ? "Change to Give" : "Short by"}</div>
                <div className={`text-5xl font-black ${enough ? "text-green-300" : "text-red-400"}`}>
                  ${Number(paid) === 0 ? "0.00" : (enough ? change : total - Number(paid)).toFixed(2)}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {["1","2","3","4","5","6","7","8","9",".","0","⌫"].map((k) => (
                  <button key={k} type="button" onClick={() => {
                    if (k === "⌫") setPaid((v) => v.slice(0, -1));
                    else if (k === ".") { if (!paid.includes(".")) setPaid((v) => v + "."); }
                    else { const dotIdx = paid.indexOf("."); if (dotIdx !== -1 && paid.length - dotIdx > 2) return; setPaid((v) => (v === "0" ? k : v + k)); }
                  }}
                  className={`h-14 rounded-2xl font-black text-xl transition active:scale-95 ${k === "⌫" ? "bg-destructive/20 text-destructive hover:bg-destructive/30" : "bg-muted hover:bg-muted/70 text-foreground"}`}>
                    {k}
                  </button>
                ))}
              </div>
            </div>
            <div className="shrink-0 px-5 pb-5 pt-3 border-t border-border flex gap-3">
              <Button variant="outline" className="flex-1 h-12" onClick={() => { setStep("pick"); setSelectedAccount(null); setPaid(""); }}>← Back</Button>
              <Button className="flex-1 h-12 font-black text-base" disabled={!enough || busy} onClick={() => submitCashOrder(selectedAccount)}
                style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm Sale"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function CreditSaleOverlay({
  total, cart, onDec, onAdd, onRemove, onClearCart, onClose, onSuccess, ownerId,
}: {
  total: number;
  cart: CartItem[];
  onDec: (id: string) => void;
  onAdd: (p: CartItem) => void;
  onRemove: (id: string) => void;
  onClearCart: () => void;
  onClose: () => void;
  onSuccess: () => void;
  ownerId: string;
}) {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const { isOnline } = useNetworkStatus();
  const [step, setStep] = useState<"review" | "pick" | "confirm" | "create">("review");
  const [accounts, setAccounts] = useState<CreditAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmPick, setConfirmPick] = useState<CreditAccount | null>(null);

  // Create account form
  const [newName, setNewName] = useState("");
  const [newContact, setNewContact] = useState("");
  const [newContactPadOpen, setNewContactPadOpen] = useState(false);
  const [newIdType, setNewIdType] = useState<"drivers_permit" | "national_id">("national_id");
  const [newIdNumber, setNewIdNumber] = useState("");
  const [newActiveField, setNewActiveField] = useState<null | "name" | "idNumber" | "contact">(null);
  const toggleNew = (f: "name" | "idNumber" | "contact") => setNewActiveField((cur) => cur === f ? null : f);

  const loadAccounts = async () => {
    if (!ownerId) return;
    setLoadingAccounts(true);
    const { data } = await supabase
      .from("credit_accounts")
      .select("id, full_name, contact_number, balance_owed, status")
      .eq("owner_id", ownerId)
      .order("full_name");
    setAccounts((data ?? []) as CreditAccount[]);
    setLoadingAccounts(false);
  };

  const handleProceed = () => {
    setStep("pick");
    loadAccounts();
  };

  // After a credit charge succeeds, record shots/pack-units against open bottles/packs
  // exactly the same as a cash sale does — the physical items are consumed regardless
  // of how the customer pays.
  const recordShotPackForCredit = async (groupId: string) => {
    const shotItems = cart.filter((c) => (c as any)._bottle_id);
    for (const shot of shotItems) {
      const payload = {
        p_bottle_id: (shot as any)._bottle_id,
        p_qty:       shot.qty,
        p_revenue:   shot.qty * Number(shot.price),
      };
      if (isOnline) {
        const { error } = await supabase.rpc("record_shot", payload);
        if (error) console.warn("record_shot (credit) failed:", error.message);
      } else {
        await enqueue("rpc_record_shot", payload, groupId);
      }
    }
    const packItems = cart.filter((c) => (c as any)._pack_id);
    for (const unit of packItems) {
      const payload = {
        p_pack_id: (unit as any)._pack_id,
        p_qty:     (unit as any)._pack_units ?? unit.qty,
        p_revenue: ((unit as any)._pack_units ?? unit.qty) * Number(unit.price),
      };
      if (isOnline) {
        const { error } = await supabase.rpc("record_pack_unit", payload);
        if (error) console.warn("record_pack_unit (credit) failed:", error.message);
      } else {
        await enqueue("rpc_record_pack_unit", payload, groupId);
      }
    }
  };

  const chargeAccount = async (account: CreditAccount) => {
    if (!profile) return;
    setBusy(true);
    const groupId = `order-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const itemsDesc = cart.map((c) => `${c.qty}x ${c.name}`).join(", ");
    const creditPayload = {
      p_credit_account_id: account.id,
      p_cashier_id: profile.id,
      p_amount: total,
      p_items: cart.map((c) => ({ id: c.id, name: c.name, price: c.price, cost_price: c.cost_price ?? 0, qty: c.qty })),
      p_note: itemsDesc,
    };
    if (!isOnline) {
      await enqueue("rpc_record_credit_charge", creditPayload, groupId);
      await recordShotPackForCredit(groupId);
      setBusy(false);
      toast.success(`💾 Saved offline — will sync when reconnected`);
      onSuccess();
      return;
    }
    const { error } = await supabase.rpc("record_credit_charge", creditPayload);
    if (error) { setBusy(false); toast.error(error.message); return; }
    await recordShotPackForCredit(groupId);
    setBusy(false);
    toast.success(`Charged $${total.toFixed(2)} to ${account.full_name}`);
    onSuccess();
  };

  const createAndCharge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !ownerId || !profile) return;
    setBusy(true);
    // Create the account (account creation always needs network — no offline path here)
    if (!isOnline) {
      setBusy(false);
      toast.error("No internet connection — connect to create a new account.");
      return;
    }
    const { data: acc, error: createErr } = await supabase
      .from("credit_accounts")
      .insert({
        owner_id: ownerId,
        full_name: newName.trim(),
        contact_number: newContact.trim() ? "868-" + newContact.trim() : null,
        id_number: newIdNumber.trim() ? `${newIdType === "drivers_permit" ? "DP" : "NID"}: ${newIdNumber.trim()}` : null,
        status: "closed",
      })
      .select()
      .single();
    if (createErr || !acc) { setBusy(false); toast.error(createErr?.message ?? "Failed to create account"); return; }
    const groupId = `order-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const itemsDesc = cart.map((c) => `${c.qty}x ${c.name}`).join(", ");
    const { error: chargeErr } = await supabase.rpc("record_credit_charge", {
      p_credit_account_id: acc.id,
      p_cashier_id: profile.id,
      p_amount: total,
      p_items: cart.map((c) => ({ id: c.id, name: c.name, price: c.price, cost_price: c.cost_price ?? 0, qty: c.qty })),
      p_note: itemsDesc,
    });
    if (chargeErr) { setBusy(false); toast.error(chargeErr.message); return; }
    await recordShotPackForCredit(groupId);
    setBusy(false);
    toast.success(`Account created & $${total.toFixed(2)} charged to ${newName.trim()}`);
    onSuccess();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div
        className="relative w-full max-w-md max-h-[90dvh] flex flex-col rounded-3xl overflow-hidden border shadow-2xl"
        style={{ background: "var(--gradient-card)", borderColor: "var(--primary)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
          <h2 className="text-xl font-black" style={{ color: "var(--primary)" }}>{t("credit_order", "Credit Order")}</h2>
          <button onClick={onClose} className="h-9 w-9 rounded-full flex items-center justify-center bg-muted hover:bg-muted/80 transition">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ΓöÇΓöÇ Step 1: Order review ΓöÇΓöÇ */}
        {step === "review" && (
          <>
            <div className="flex-1 overflow-y-auto px-5 space-y-4 pb-4">
              {/* Total banner — brown/orange theme */}
              <div className="rounded-2xl p-5 text-center" style={{ background: "oklch(0.18 0.04 45)", border: "2px solid var(--primary)" }}>
                <div className="text-sm font-medium" style={{ color: "var(--primary)" }}>Total to Credit</div>
                <div className="text-5xl font-black" style={{ color: "var(--primary)" }}>${total.toFixed(2)}</div>
              </div>

              {/* Order items — same layout as Cash Order */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Order</span>
                  <button onClick={onClearCart} className="flex items-center gap-1.5 px-3 h-9 rounded-xl text-sm font-black text-destructive transition active:scale-95" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)" }}>
                    <Trash2 className="h-4 w-4" /> Clear all
                  </button>
                </div>
                {cart.map((i) => (
                  <div key={i.id} className="flex gap-3 p-3 rounded-xl bg-background/50">
                    <div className="h-20 w-14 shrink-0 rounded-xl overflow-hidden bg-muted flex items-center justify-center">
                      {i.image_url ? (
                        <img src={productImageUrl(i.image_url)!} alt={i.name} className="h-full w-full object-cover" />
                      ) : i.id.startsWith("shot-") ? (
                        <span className="text-2xl">🥃</span>
                      ) : (
                        <span className="text-2xl">{categoryIcon(i.category ?? "drinks")}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col gap-2">
                      {/* Top row: name left, prices right */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-black text-sm leading-tight flex-1">{i.name}</div>
                        <div className="flex flex-col items-end shrink-0">
                          <span className="font-black text-base" style={{ color: "var(--primary)" }}>${(i.qty * Number(i.price)).toFixed(2)}</span>
                          <span className="text-[11px] text-muted-foreground">${Number(i.price).toFixed(2)} each</span>
                        </div>
                      </div>
                      {/* Action bar: − qty + X */}
                      <CashItemActions
                        item={i}
                        onDec={onDec}
                        onAdd={onAdd}
                        onRemove={onRemove}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="shrink-0 px-5 pb-5 pt-3 border-t border-border flex gap-3">
              <Button variant="outline" className="flex-1 h-12" onClick={onClose}>{t("cancel", "Cancel")}</Button>
              <Button
                className="flex-1 h-12 font-black text-base"
                onClick={handleProceed}
                style={{ background: "oklch(0.22 0.04 45)", border: "2px solid var(--primary)", color: "var(--primary)" }}
              >
                {t("proceed", "Proceed")}
              </Button>
            </div>
          </>
        )}

        {/* ΓöÇΓöÇ Step 2: Pick account ΓöÇΓöÇ */}
        {step === "pick" && (
          <>
            <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-3">
              <p className="text-sm text-muted-foreground">Select the customer's credit account</p>
              {loadingAccounts ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : accounts.length === 0 ? (
                <p className="text-center text-muted-foreground py-8 text-sm">No accounts yet</p>
              ) : (
                <div className="space-y-2">
                  {accounts.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => setConfirmPick(a)}
                      disabled={busy}
                      className="w-full flex items-center justify-between p-4 rounded-2xl border border-border hover:border-primary/50 active:scale-[0.98] transition text-left disabled:opacity-50"
                      style={{ background: "var(--gradient-card)" }}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-black text-sm">{a.full_name}</p>
                        {a.contact_number && <p className="text-xs text-muted-foreground">{a.contact_number}</p>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className={`text-sm font-black ${Number(a.balance_owed) > 0 ? "text-red-400" : "text-green-400"}`}>
                          ${Number(a.balance_owed).toFixed(2)}
                        </span>
                        <CheckCircle2 className="h-5 w-5 text-primary opacity-50" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="shrink-0 px-5 pb-5 pt-3 border-t border-border flex gap-3">
              <Button variant="outline" className="flex-1 h-12" onClick={() => setStep("review")}>← {t("back", "Back")}</Button>
              <Button
                className="h-12 px-5 font-black text-sm"
                onClick={() => setStep("create")}
                style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}
              >
                {t("new_account", "+ New Account")}
              </Button>
            </div>
          </>
        )}

        {/* ΓöÇΓöÇ Step 2b: Confirm account selection ΓöÇΓöÇ */}
        {confirmPick && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="w-full max-w-sm mx-6 py-12 px-8 space-y-6 text-center rounded-3xl" style={{ background: "var(--gradient-card)" }}>
              <h3 className="font-black text-2xl">{t("confirm_customer", "Confirm Customer?")}</h3>
              <p className="text-muted-foreground text-base">{t("charge_to", "Charge this order to")}</p>
              <p className="font-black text-3xl">{confirmPick.full_name}</p>
              <p className="font-black text-4xl" style={{ color: "var(--primary)" }}>${total.toFixed(2)}</p>
              {Number(confirmPick.balance_owed) > 0 && (
                <p className="text-base text-red-400 font-semibold">Current balance: ${Number(confirmPick.balance_owed).toFixed(2)}</p>
              )}
              <div className="flex gap-3 pt-4">
                <Button variant="outline" className="flex-1 h-16 font-black text-base" onClick={() => setConfirmPick(null)}>{t("cancel", "Cancel")}</Button>
                <Button
                  className="flex-1 h-16 font-black text-base"
                  disabled={busy}
                  onClick={() => { chargeAccount(confirmPick); setConfirmPick(null); }}
                  style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("yes_charge", "Yes, Charge")}
                </Button>
              </div>
            </div>
          </div>
        )}

        {step === "create" && (
          <>
            <form onSubmit={createAndCharge} className="flex-1 overflow-y-auto px-5 pb-4 space-y-4">
              <p className="text-sm text-muted-foreground">Create a new credit account and charge this order to it</p>

              {/* Full Name */}
              <div>
                <Label>Full Name *</Label>
                <button type="button" onClick={() => toggleNew("name")}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-left mt-1">
                  <span className={`text-sm font-black ${newName ? "text-foreground" : "text-muted-foreground"}`}>
                    {newName || "e.g. John Smith"}
                  </span>
                </button>
                {newActiveField === "name" && (
                  <CreditAlphaKeyboard value={newName} onChange={setNewName} onDone={() => setNewActiveField(null)} />
                )}
              </div>

              {/* ID Type */}
              <div>
                <Label htmlFor="credit-new-idtype">ID Type</Label>
                <select id="credit-new-idtype" value={newIdType}
                  onChange={(e) => setNewIdType(e.target.value as "drivers_permit" | "national_id")}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm font-semibold mt-1">
                  <option value="drivers_permit">Driver's Permit</option>
                  <option value="national_id">National ID</option>
                </select>
              </div>

              {/* ID Number */}
              <div>
                <Label>ID Number</Label>
                <button type="button" onClick={() => toggleNew("idNumber")}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-left mt-1">
                  <span className={`text-sm font-black ${newIdNumber ? "text-foreground" : "text-muted-foreground"}`}>
                    {newIdNumber || "e.g. 00000000"}
                  </span>
                </button>
                {newActiveField === "idNumber" && (
                  <CreditNumPad value={newIdNumber} onChange={setNewIdNumber} maxLen={20} onDone={() => setNewActiveField(null)} />
                )}
              </div>

              {/* Contact Number */}
              <div>
                <Label>Contact Number</Label>
                <div className="flex items-center mt-1">
                  <span className="h-10 px-3 flex items-center rounded-l-md border border-r-0 border-input bg-muted text-sm font-bold text-muted-foreground select-none">868</span>
                  <button type="button" onClick={() => toggleNew("contact")}
                    className="flex-1 h-10 rounded-r-md border border-input bg-background px-3 text-left">
                    <span className={`text-sm font-black ${newContact ? "text-foreground" : "text-muted-foreground"}`}>
                      {newContact || "XXX-XXXX"}
                    </span>
                  </button>
                </div>
                {newActiveField === "contact" && (
                  <CreditContactPad value={newContact} onChange={setNewContact} onDone={() => setNewActiveField(null)} />
                )}
              </div>

              <div className="rounded-xl p-3 text-sm" style={{ background: "oklch(0.22 0.04 45)", border: "1px solid var(--primary)" }}>
                <div className="flex justify-between font-black">
                  <span style={{ color: "var(--primary)" }}>Amount to charge</span>
                  <span style={{ color: "var(--primary)" }}>${total.toFixed(2)}</span>
                </div>
              </div>
              <Button
                type="submit"
                disabled={busy || !newName.trim() || (newContact.trim() !== "" && newContact.replace("-", "").length < 7)}
                className="w-full h-12 font-black text-base"
                style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("create_and_charge", "Create & Charge")}
              </Button>
            </form>
            <div className="shrink-0 px-5 pb-5 pt-2 border-t border-border">
              <Button variant="outline" className="w-full h-10" onClick={() => setStep("pick")}>← {t("back", "Back to Accounts")}</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Credit form keyboard helpers 
function CreditNumPad({ value, onChange, maxLen = 20, onDone }: {
  value: string; onChange: (v: string) => void; maxLen?: number; onDone: () => void;
}) {
  return (
    <div className="mt-2">
      <div className="grid grid-cols-3 gap-1.5">
        {["1","2","3","4","5","6","7","8","9","done","0","⌫"].map((k, i) =>
          k === "done"
            ? <button key="done" type="button" onClick={onDone}
                className="h-12 rounded-xl font-black text-sm active:scale-95 transition text-primary-foreground"
                style={{ background: "var(--gradient-hero)" }}>Done</button>
            : <button key={k} type="button"
                onClick={() => {
                  if (k === "⌫") onChange(value.slice(0, -1));
                  else if (value.length < maxLen) onChange(value + k);
                }}
                className={`h-12 rounded-xl font-black text-xl transition active:scale-95 ${k === "⌫" ? "bg-destructive/20 text-destructive" : "bg-muted text-foreground"}`}
              >{k}</button>
        )}
      </div>
    </div>
  );
}

function CreditContactPad({ value, onChange, onDone }: {
  value: string; onChange: (v: string) => void; onDone: () => void;
}) {
  const digits = value.replace("-", "");
  const complete = digits.length === 7;
  const handle = (k: string) => {
    if (k === "⌫") {
      const d = value.replace("-", "").slice(0, -1);
      onChange(d.length > 3 ? d.slice(0, 3) + "-" + d.slice(3) : d);
    } else {
      const d = (value.replace("-", "") + k).slice(0, 7);
      onChange(d.length > 3 ? d.slice(0, 3) + "-" + d.slice(3) : d);
    }
  };
  return (
    <div className="mt-2">
      {!complete && (
        <p className="text-xs font-semibold text-amber-400 mb-1.5 text-center">
          {7 - digits.length} digit{7 - digits.length !== 1 ? "s" : ""} remaining
        </p>
      )}
      <div className="grid grid-cols-3 gap-1.5">
        {["1","2","3","4","5","6","7","8","9","done","0","⌫"].map((k) =>
          k === "done"
            ? <button key="done" type="button"
                onClick={() => { if (complete) onDone(); }}
                className={`h-12 rounded-xl font-black text-sm transition text-primary-foreground ${complete ? "active:scale-95" : "opacity-30 cursor-not-allowed"}`}
                style={{ background: "var(--gradient-hero)" }}>Done</button>
            : <button key={k} type="button" onClick={() => handle(k)}
                className={`h-12 rounded-xl font-black text-xl transition active:scale-95 ${k === "⌫" ? "bg-destructive/20 text-destructive" : "bg-muted text-foreground"}`}
              >{k}</button>
        )}
      </div>
    </div>
  );
}

const CREDIT_ALPHA_ROWS = [
  ["Q","W","E","R","T","Y","U","I","O","P"],
  ["A","S","D","F","G","H","J","K","L"],
  ["Z","X","C","V","B","N","M","⌫"],
];

function CreditAlphaKeyboard({ value, onChange, onDone }: {
  value: string; onChange: (v: string) => void; onDone: () => void;
}) {
  return (
    <div className="mt-2 space-y-1.5">
      {CREDIT_ALPHA_ROWS.map((row, ri) => (
        <div key={ri} className="flex gap-1 justify-center">
          {row.map((k) => (
            <button key={k} type="button"
              onClick={() => {
                if (k === "⌫") onChange(value.slice(0, -1));
                else onChange(value + k);
              }}
              className={`flex-1 h-10 rounded-lg font-bold text-sm transition active:scale-95 max-w-[38px] ${
                k === "⌫" ? "bg-destructive/20 text-destructive" : "bg-muted text-foreground"
              }`}
            >{k}</button>
          ))}
        </div>
      ))}
      <div className="flex gap-1.5">
        <button type="button" onClick={() => onChange(value + " ")}
          className="flex-1 h-10 rounded-lg bg-muted text-foreground font-bold text-sm active:scale-95 transition">
          SPACE
        </button>
        <button type="button" onClick={onDone}
          className="w-20 h-10 rounded-lg font-bold text-sm active:scale-95 transition text-primary-foreground"
          style={{ background: "var(--gradient-hero)" }}>
          Done
        </button>
      </div>
    </div>
  );
}

