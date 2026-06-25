import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Trash2, Minus, Plus, Loader2, X, CheckCircle2, Check,
} from "lucide-react";
import { toast } from "sonner";
import { CATEGORIES, type CategoryValue, categoryIcon } from "@/lib/categories";

type Product = { id: string; name: string; price: number; image_url: string | null; category?: CategoryValue; stock_qty?: number };
type CartItem = Product & { qty: number };
type OpenedBottle = {
  id: string; owner_id: string; product_id: string; product_name: string;
  shot_price: number; shots_sold: number; revenue: number;
  opened_at: string; finished_at: string | null; status: string;
};

export default function RegisterPage() {
  const { profile, refreshProfile } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [category, setCategory] = useState<CategoryValue>("beers");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [cashOpen, setCashOpen] = useState(false);
  const [creditOpen, setCreditOpen] = useState(false);
  const [saleResult, setSaleResult] = useState<{ paid: number; change: number } | null>(null);

  const ownerId = profile?.role === "owner" ? profile.id : profile?.parent_id;

  // Stable fetch  —  always reads latest ownerId via ref
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

  // ── Bar sort order ────────────────────────────────────────────────────────
  const [barSortMap, setBarSortMap] = useState<Record<string, number>>({});
  const [barEditMode, setBarEditMode] = useState(false);
  const [barDraggingId, setBarDraggingId] = useState<string | null>(null);
  const [barSavingOrder, setBarSavingOrder] = useState(false);
  const barLongPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [barOrdered, setBarOrdered] = useState<Product[]>([]);
  const barEditModeRef = useRef(false);
  const barSortMapRef = useRef<Record<string, number>>({});
  const profileIdRef = useRef(profile?.id);
  useEffect(() => { profileIdRef.current = profile?.id; }, [profile?.id]);

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

  const applyBarSort = (prods: Product[], cat: string, map: Record<string, number>) =>
    [...prods.filter(p => (p.category || "beers") === cat)].sort((a, b) => {
      const ia = map[a.id] ?? Infinity;
      const ib = map[b.id] ?? Infinity;
      if (ia !== ib) return ia - ib;
      return a.name.localeCompare(b.name);
    });

  const barStartLongPress = () => {
    if (barEditModeRef.current) return;
    barLongPressTimer.current = setTimeout(() => {
      barEditModeRef.current = true;
      setBarEditMode(true);
    }, 600);
  };
  const barCancelLongPress = () => {
    if (barLongPressTimer.current) { clearTimeout(barLongPressTimer.current); barLongPressTimer.current = null; }
  };

  const handleBarDone = async () => {
    barEditModeRef.current = false;
    setBarEditMode(false);
    await loadBarSort();
  };

  const handleBarDragStart = (id: string) => setBarDraggingId(id);

  const handleBarDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    setBarOrdered(prev => {
      if (!barDraggingId || barDraggingId === targetId) return prev;
      const from = prev.findIndex(p => p.id === barDraggingId);
      const to   = prev.findIndex(p => p.id === targetId);
      if (from === -1 || to === -1) return prev;
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };

  const handleBarDrop = async () => {
    setBarDraggingId(null);
    const pid = profileIdRef.current;
    if (!pid) return;
    setBarOrdered(current => {
      const ids = current.map(p => p.id);
      // fire-and-forget save
      (supabase as any).from("bar_sort_order").upsert(
        { owner_id: pid, order_json: ids, updated_at: new Date().toISOString() },
        { onConflict: "owner_id" }
      );
      return current;
    });
  };

  useEffect(() => {
    if (!ownerId) return;
    fetchProducts();
    loadBarSort();
    const ch = supabase
      .channel(`products-register-${ownerId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "products", filter: `owner_id=eq.${ownerId}` },
        (payload) => {
          if (barEditModeRef.current) return;
          if (payload.eventType === "DELETE") {
            if (payload.old?.owner_id && payload.old.owner_id !== ownerId) return;
            setProducts((prev) => prev.filter((p) => p.id !== payload.old?.id));
            setCart((c) => c.filter((i) => i.id !== payload.old?.id));
          } else {
            fetchProducts();
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [ownerId, fetchProducts]); // loadBarSort intentionally excluded — it's a plain async fn, not a callback

  const filtered = useMemo(() => applyBarSort(products, category, barSortMap),
    [products, category, barSortMap]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync barOrdered when products/category/sort changes — skip during edit mode
  useEffect(() => {
    if (barEditModeRef.current) return;
    setBarOrdered(applyBarSort(products, category, barSortMapRef.current));
    setBarDraggingId(null);
  }, [products, category, barSortMap]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = useMemo(() => cart.reduce((s, i) => s + i.qty * Number(i.price), 0), [cart]);
  const cartCount = useMemo(() => cart.reduce((s, i) => s + i.qty, 0), [cart]);

  // Close cash overlay immediately if cart becomes empty (e.g. order/item deleted)
  useEffect(() => {
    if (cashOpen && cart.length === 0) setCashOpen(false);
  }, [cart, cashOpen]);

  const addToCart = (p: Product) => {
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
  };

  const dec = (id: string) =>
    setCart((c) => c.flatMap((i) => (i.id === id ? (i.qty > 1 ? [{ ...i, qty: i.qty - 1 }] : []) : [i])));

  const removeItem = (id: string) => setCart((c) => c.filter((i) => i.id !== id));

  // -- Opened Bottles state ------------------------------------------------
  const [openedBottles, setOpenedBottles]       = useState<OpenedBottle[]>([]);
  const [bottlesModalOpen, setBottlesModalOpen] = useState(false);
  const [shotModalOpen, setShotModalOpen]       = useState(false);
  const [shotStep, setShotStep]                 = useState<"select" | "price">("select");
  const [showNewBottleGrid, setShowNewBottleGrid] = useState(false);
  const [shotBottleId, setShotBottleId]         = useState<string>("");
  const [shotPrice, setShotPrice]               = useState("");
  const selectedBottleRef                       = useRef<HTMLDivElement>(null);
  const [openNewMode, setOpenNewMode]           = useState(false);   // true = picking a new bottle from products
  const [newBottleProductId, setNewBottleProductId] = useState<string>("");
  const [newBottlePrice, setNewBottlePrice]     = useState("");
  const [bottleBusy, setBottleBusy]             = useState(false);
  const [markEmptyBottleId, setMarkEmptyBottleId] = useState<string | null>(null); // confirm modal
  const [cancelBottleId, setCancelBottleId]       = useState<string | null>(null); // confirm modal

  // -- Opened Packs state (cigarettes retail + rolling paper) --------------
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

  const cigaretteProducts = useMemo(() => {
    const openedProductIds = new Set(openedPacks.map(p => p.product_id));
    return products.filter((p) =>
      (p.category || "beers") === "cigarettes" &&
      (p.stock_qty ?? 0) > 0 &&
      !openedProductIds.has(p.id)
    );
  }, [products, openedPacks]);

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

  const addPackUnit = () => {
    const pack = openedPacks.find((p) => p.id === packPackId);
    const price = parseFloat(packPrice);
    if (!pack || isNaN(price) || price <= 0) { toast.error("Select a pack and set a price"); return; }
    const label = "Retail";
    const id = `pack-${pack.id}-${Date.now()}`;
    setCart((c) => [...c, {
      id, name: `${label}: ${pack.product_name}`, price,
      image_url: null, category: "cigarettes", qty: packQty,
      _pack_id: pack.id,
    } as CartItem & { _pack_id: string }]);
    setPackModalOpen(false);
    setPackStep("select");
    setPackPackId("");
    setPackPrice("");
    setPackQty(1);
  };

  const handleFinishPack = async (packId: string) => {
    if (!profile) return;
    setPackBusy(true);
    const { error } = await supabase.rpc("finish_pack", { p_pack_id: packId, p_cashier_id: profile.id });
    setPackBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Pack marked empty  —  revenue recorded");
    await fetchOpenedPacks();
    refreshProfile();
  };

  const handleCancelPack = async (packId: string) => {
    setPackBusy(true);
    const { error } = await supabase.rpc("cancel_pack", { p_pack_id: packId });
    setPackBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Pack cancelled  —  stock restored");
    await fetchOpenedPacks();
    await fetchProducts();
  };

  const liquorProducts = useMemo(
    () => {
      const openedProductIds = new Set(openedBottles.map(b => b.product_id));
      return products.filter((p) =>
        (p.category || "beers") === "liquor" &&
        (p.stock_qty ?? 0) > 0 &&
        !openedProductIds.has(p.id)
      );
    },
    [products, openedBottles]
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

  /** Open a new bottle  —  deducts 1 stock, creates opened_bottles row */
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
    setShotStep("price");
    setOpenNewMode(false);
    setNewBottleProductId("");
    setNewBottlePrice("");
  };

  /** Add a shot to the cart from an open bottle */
  const addShot = () => {
    const bottle = openedBottles.find((b) => b.id === shotBottleId);
    const price  = parseFloat(shotPrice);
    if (!bottle || isNaN(price) || price <= 0) {
      toast.error("Select a bottle and set a price");
      return;
    }
    const id = `shot-${bottle.id}-${Date.now()}`;
    setCart((c) => [...c, {
      id,
      name: `Shot: ${bottle.product_name}`,
      price,
      image_url: null,
      category: "liquor",
      qty: 1,
      _bottle_id: bottle.id,
    } as CartItem & { _bottle_id: string }]);
    setShotModalOpen(false);
    setShotStep("select");
    setShotBottleId("");
    setShotPrice("");
  };

  // Scroll to selected bottle when entering price step
  useEffect(() => {
    if (shotStep === "price" && selectedBottleRef.current) {
      setTimeout(() => {
        selectedBottleRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
    }
  }, [shotStep, shotBottleId]);
  /** Cancel an open bottle  —  only if 0 shots sold, restores 1 stock */
  const handleCancelBottle = async (bottleId: string) => {
    setBottleBusy(true);
    const { error } = await supabase.rpc("cancel_bottle", { p_bottle_id: bottleId });
    setBottleBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Bottle cancelled  —  stock restored");
    await fetchOpenedBottles();
    await fetchProducts();
  };

  const handleFinishBottle = async (bottleId: string) => {
    if (!profile) return;
    setBottleBusy(true);
    const { error } = await supabase.rpc("finish_bottle", {
      p_bottle_id:  bottleId,
      p_cashier_id: profile.id,
    });
    setBottleBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Bottle marked finished  —  revenue recorded");
    await fetchOpenedBottles();
    refreshProfile();
  };



  return (
    <>
      {/* Sticky category tabs  —  sits below the app header */}
      <div className="sticky top-0 z-20 -mx-3 px-3 py-2 bg-background/95 backdrop-blur border-b border-border">
        {/* Category tabs  —  icons only, 5 across */}
        <div className="max-w-2xl mx-auto grid grid-cols-5 gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => { setCategory(cat.value); document.querySelector("main")?.scrollTo({ top: 0, behavior: "instant" }); }}
              className={`h-14 rounded-xl font-bold text-2xl transition ${
                category === cat.value
                  ? "text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
              style={category === cat.value ? { background: "var(--gradient-hero)" } : {}}
              title={cat.label}
            >
              {cat.icon}
            </button>
          ))}
        </div>
      </div>

      {/* Items grid  —  bottom padding clears the fixed CASH + CREDIT buttons */}
      <div className="pt-4 pb-36">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* -- Shot button  —  liquor tab only -- */}
            {category === "liquor" && (
              <div className="mb-3">
                <button
                  onClick={() => setShotModalOpen(true)}
                  className="w-full h-12 rounded-2xl flex items-center justify-center gap-2 font-bold text-sm active:scale-[0.98] transition border"
                  style={{ background: "rgba(var(--primary-rgb, 251 146 60) / 0.10)", borderColor: "rgba(var(--primary-rgb, 251 146 60) / 0.35)", color: "var(--primary)" }}
                >
                  🥃 Shot from Opened Bottle
                  {openedBottles.length > 0 && (
                    <span className="h-5 min-w-[1.25rem] px-1 rounded-full flex items-center justify-center text-[10px] font-black text-primary-foreground"
                      style={{ background: "var(--gradient-hero)" }}>
                      {openedBottles.length}
                    </span>
                  )}
                </button>
              </div>
            )}

            {/* -- Cigarette pack button  —  cigarettes tab only -- */}
            {category === "cigarettes" && (
              <div className="mb-3">
                <button
                  onClick={() => { setPackModalOpen(true); }}
                  className="w-full h-12 rounded-2xl flex items-center justify-center gap-2 font-bold text-sm active:scale-[0.98] transition border"
                  style={{ background: "rgba(var(--primary-rgb,251 146 60)/0.10)", borderColor: "rgba(var(--primary-rgb,251 146 60)/0.35)", color: "var(--primary)" }}
                >
                  🚬 Retail Cigarette &amp; Paper
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
                {products.length === 0 ? "No items yet. Add some on the Items page." : `No ${CATEGORIES.find(c=>c.value===category)?.label ?? category} found.`}
              </div>
            ) : (
          <div>
            {barEditMode && (
              <div className="flex items-center justify-between rounded-2xl px-4 py-2.5 mb-2 border border-amber-500/40"
                style={{ background: "oklch(0.20 0.05 60)" }}>
                <span className="text-xs font-black text-amber-400">Hold & drag to reorder</span>
                <button
                  onClick={handleBarDone}
                  className="text-xs font-black text-white/60 px-3 py-1.5 rounded-lg hover:bg-white/10 transition">
                  Done
                </button>
              </div>
            )}
          <div className="grid grid-cols-3 gap-2">
            {barOrdered.map((p) => {
              const inCart = cart.find((i) => i.id === p.id);
              const outOfStock = (p.stock_qty ?? 1) === 0;
              const isDragging = barDraggingId === p.id;
              return (
                <div key={p.id}
                  className="relative"
                  draggable={barEditMode}
                  onDragStart={() => handleBarDragStart(p.id)}
                  onDragOver={(e) => handleBarDragOver(e, p.id)}
                  onDrop={handleBarDrop}
                  onDragEnd={() => setBarDraggingId(null)}
                  onPointerDown={barStartLongPress}
                  onPointerUp={barCancelLongPress}
                  onPointerLeave={barCancelLongPress}
                  onContextMenu={(e) => e.preventDefault()}
                  style={{ opacity: isDragging ? 0.4 : 1, transition: "opacity 0.15s", userSelect: "none", WebkitUserSelect: "none" }}
                >
                <button
                  onClick={() => !outOfStock && !barEditMode && addToCart(p)}
                  disabled={outOfStock}
                  className={`group relative rounded-2xl overflow-hidden border flex flex-col transition w-full ${outOfStock ? "cursor-not-allowed" : barEditMode ? "cursor-grab active:cursor-grabbing" : "active:scale-95"}`}
                  style={{
                    background: "var(--gradient-card)",
                    boxShadow: "var(--shadow-elegant)",
                    borderColor: barEditMode ? "rgba(251,146,60,0.8)" : inCart ? "var(--primary)" : "var(--border)",
                    pointerEvents: barEditMode ? "none" : "auto",
                  }}
                >
                  {/* -- Image area -- */}
                  <div className="aspect-[3/4] relative w-full">
                    {p.image_url ? (
                      <img src={p.image_url} alt="" className="absolute inset-0 w-full h-full object-cover"
                        onError={(e) => {
                          const img = e.currentTarget as HTMLImageElement;
                          img.style.display = "none";
                          const fallback = img.nextElementSibling as HTMLElement | null;
                          if (fallback) fallback.style.display = "flex";
                        }} />
                    ) : null}
                    <div
                      className="absolute inset-0 items-center justify-center text-4xl"
                      style={{ display: p.image_url ? "none" : "flex" }}
                    >
                      {categoryIcon(p.category ?? "drinks")}
                    </div>

                    {/* Stock qty badge top-left */}
                    {p.stock_qty !== undefined && !outOfStock && (
                      <div className="absolute top-1.5 left-1.5 h-6 min-w-[1.5rem] px-1.5 rounded-full flex items-center justify-center bg-black/70 shadow">
                        <span className="text-[10px] font-black text-white leading-none">{p.stock_qty}</span>
                      </div>
                    )}

                    {/* Red X remove button  —  top-right, same size as minus/qty circles */}
                    {inCart && (
                      <button
                        onClick={(e) => { e.stopPropagation(); removeItem(p.id); }}
                        className="absolute top-1.5 right-1.5 h-8 w-8 rounded-full flex items-center justify-center active:scale-90 transition text-black shadow z-10"
                        style={{ background: "#dc2626" }}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}

                    {/* Cart qty controls  —  sits just below the top row (X + stock badge) */}
                    {inCart && (
                      <div className="absolute top-10 left-0 right-0 flex items-center justify-center gap-4 py-3"
                        style={{ background: "rgba(0,0,0,0.75)" }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); dec(p.id); }}
                          className="h-8 w-8 rounded-full flex items-center justify-center active:scale-90 transition"
                          style={{ background: "#ef4444" }}
                        >
                          <Minus className="h-4 w-4 text-black" />
                        </button>
                        <div
                          className="h-8 w-8 rounded-full flex items-center justify-center text-sm font-black text-black"
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

                    {/* Low stock badge */}
                    {!outOfStock && !inCart && (p.stock_qty ?? 1) >= 1 && (p.stock_qty ?? 1) <= 5 && (
                      <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-full bg-red-600 shadow">
                        <span className="text-[9px] font-black uppercase tracking-wide text-white leading-none">Low</span>
                      </div>
                    )}
                  </div>

                  {/* -- Title + price strip below image -- */}
                  <div className="px-1.5 py-1.5 border-t border-border/30" style={{ background: "rgba(var(--primary-rgb, 251 146 60) / 0.10)", borderTop: "1px solid rgba(var(--primary-rgb, 251 146 60) / 0.35)" }}>
                    <div className="font-bold text-[11px] truncate leading-tight" style={{ color: "var(--primary)" }}>{p.name}</div>
                    <div className="font-black text-xs mt-0.5" style={{ color: "var(--primary)" }}>${Number(p.price).toFixed(2)}</div>
                  </div>
                </button>
                </div>
              );
            })}
          </div>
          </div>
            )}
          </>
        )}
      </div>

      {/* Sticky CASH + CREDIT buttons  —  fixed at bottom */}
      {cartCount > 0 && (
        <div
          className="fixed inset-x-0 z-[26] px-4 pb-2 pointer-events-none"
          style={{ bottom: 8 }}
        >
          <div className="max-w-2xl mx-auto pointer-events-auto space-y-2">
            {/* CASH button */}
            <button
              onClick={() => setCashOpen(true)}
              className="w-full h-14 rounded-2xl flex items-center justify-between px-5 font-black text-lg text-primary-foreground shadow-2xl active:scale-[0.98] transition"
              style={{ background: "var(--gradient-hero)" }}
            >
              <span className="flex items-center justify-center h-8 w-8 rounded-full bg-white/20 text-sm font-black">{cartCount}</span>
              <span className="flex items-center gap-2">CASH</span>
              <span className="text-primary-foreground/80 text-base font-bold">${total.toFixed(2)}</span>
            </button>
            {/* CREDIT button */}
            <button
              onClick={() => setCreditOpen(true)}
              className="w-full h-14 rounded-2xl flex items-center justify-between px-5 font-black text-lg shadow-2xl active:scale-[0.98] transition"
              style={{ background: "oklch(0.22 0.04 45)", border: "2px solid var(--primary)", color: "var(--primary)" }}
            >
              <span className="flex items-center justify-center h-8 w-8 rounded-full text-sm font-black" style={{ background: "rgba(var(--primary-rgb,251 146 60)/0.15)", border: "1.5px solid var(--primary)" }}>{cartCount}</span>
              <span className="flex items-center gap-2">CREDIT</span>
              <span className="text-base font-bold">${total.toFixed(2)}</span>
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
            fetchOpenedBottles();
          }}
        />
      )}

      {creditOpen && (
        <CreditSaleOverlay
          total={total}
          cart={cart}
          onDec={dec}
          onAdd={addToCart}
          onRemove={removeItem}
          onClearCart={() => setCart([])}
          onClose={() => setCreditOpen(false)}
          onSuccess={() => {
            setCart([]);
            setCreditOpen(false);
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

      {/* -- Shot Modal  —  Step 1: Select Liquor (3-column card grid) ---- */}
      {shotModalOpen && shotStep === "select" && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => { setShotModalOpen(false); setShotStep("select"); setShotPrice(""); setShotBottleId(""); setNewBottlePrice(""); setNewBottleProductId(""); setShowNewBottleGrid(false); }}>
          <div className="w-full max-w-md rounded-t-3xl border border-border shadow-2xl"
            style={{ background: "var(--gradient-card)" }}
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <span className="text-base font-black">🥃 Select Liquor</span>
              <button onClick={() => { setShotModalOpen(false); setShotStep("select"); setShotPrice(""); setShotBottleId(""); setNewBottlePrice(""); setNewBottleProductId(""); setShowNewBottleGrid(false); }}
                className="h-8 w-8 rounded-full flex items-center justify-center bg-muted hover:bg-muted/80 transition">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-4 pb-5 space-y-4 max-h-[75vh] overflow-y-auto">

              {!showNewBottleGrid ? (
                <>
                  {/* Currently open  —  3-col card grid */}
                  {openedBottles.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Currently Open</p>
                      <div className="grid grid-cols-3 gap-2">
                        {openedBottles.map((b) => {
                          const prod = products.find(p => p.id === b.product_id);
                          return (
                            <div key={b.id} className="flex flex-col rounded-2xl overflow-hidden border border-border">
                              {/* Top action bar  —  Mark Empty (shots > 0) OR Cancel (0 shots) */}
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
                                  ✕ Cancel
                                </button>
                              )}
                              {/* Tap image area to sell a shot */}
                              <button
                                onClick={() => { setShotBottleId(b.id); setShotPrice(b.shot_price ? String(b.shot_price) : ""); setShotStep("price"); setShotModalOpen(false); setShowNewBottleGrid(false); }}
                                className="aspect-[3/4] relative w-full active:scale-95 transition"
                                style={{ background: "var(--gradient-card)" }}>
                                {prod?.image_url ? <img src={prod.image_url} alt="" className="absolute inset-0 w-full h-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} /> : null}
                                <div className="absolute inset-0 flex items-center justify-center text-3xl" style={{ display: prod?.image_url ? "none" : "flex" }}>🍾</div>
                              </button>
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
                            const { error } = await supabase.rpc("open_bottle", {
                              p_owner_id: ownId, p_product_id: p.id, p_shot_price: 0,
                            });
                            if (error) { toast.error(error.message); setBottleBusy(false); return; }
                            await fetchOpenedBottles();
                            await fetchProducts();
                            const { data } = await supabase.from("opened_bottles").select("id")
                              .eq("owner_id", ownId).eq("product_id", p.id).eq("status", "open")
                              .order("opened_at", { ascending: false }).limit(1);
                            setBottleBusy(false);
                            if (data?.[0]) {
                              setShotBottleId(data[0].id);
                              setShotPrice("");
                              setShotStep("price");
                              setShotModalOpen(false);
                              setShowNewBottleGrid(false);
                            }
                          }}
                          disabled={bottleBusy}
                          className="flex flex-col rounded-2xl overflow-hidden border border-border active:scale-95 transition disabled:opacity-50">
                          <div className="aspect-[3/4] relative w-full" style={{ background: "var(--gradient-card)" }}>
                            {p.image_url ? <img src={p.image_url} alt="" className="absolute inset-0 w-full h-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} /> : null}
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

      {/* -- Shot Step 2: Price entry  —  bottom-sheet modal -- */}
      {shotStep === "price" && shotBottleId && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => { setShotStep("select"); setShotBottleId(""); setShotPrice(""); }}>
          <div className="w-full max-w-md rounded-t-3xl border border-border shadow-2xl"
            style={{ background: "var(--gradient-card)" }}
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <span className="font-black text-base">🥃 Add Shot</span>
              <button onClick={() => { setShotStep("select"); setShotBottleId(""); setShotPrice(""); setShotModalOpen(true); }}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 h-8 px-2 rounded-lg bg-muted">
                <X className="h-3.5 w-3.5" /> Change
              </button>
            </div>

            {/* 3-col card grid  —  all open bottles, selected one highlighted */}
            <div className="px-4 pb-2">
              <div className="grid grid-cols-3 gap-2">
                {openedBottles.map((b) => {
                  const bProd = products.find(p => p.id === b.product_id);
                  const isSelected = b.id === shotBottleId;
                  return (
                    <div key={b.id} ref={isSelected ? selectedBottleRef : null}>
                      <button
                        onClick={() => { setShotBottleId(b.id); setShotPrice(b.shot_price ? String(b.shot_price) : ""); }}
                        className="w-full flex flex-col rounded-2xl overflow-hidden border active:scale-95 transition"
                        style={{ borderWidth: isSelected ? 3 : 1, borderColor: isSelected ? "var(--primary)" : "transparent", background: "var(--gradient-card)" }}>
                        <div className="aspect-[3/4] relative w-full">
                          {bProd?.image_url ? <img src={bProd.image_url} alt="" className="absolute inset-0 w-full h-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} /> : null}
                          <div className="absolute inset-0 flex items-center justify-center text-3xl" style={{ display: bProd?.image_url ? "none" : "flex" }}>🍾</div>
                          {isSelected && <div className="absolute inset-0 flex items-center justify-center font-black" style={{ background: "rgba(var(--primary-rgb,251 146 60)/0.50)", color: "var(--primary)" }}><Check className="h-16 w-16" strokeWidth={3} /></div>}
                        </div>
                        <div className="px-1.5 py-1.5" style={{ background: "rgba(var(--primary-rgb,251 146 60)/0.10)", borderTop: "1px solid rgba(var(--primary-rgb,251 146 60)/0.35)" }}>
                          <div className="font-bold text-[11px] truncate leading-tight" style={{ color: "var(--primary)" }}>{b.product_name}</div>
                          <div className="font-black text-xs mt-0.5" style={{ color: "var(--primary)" }}>${Number(b.revenue).toFixed(2)} made</div>
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Numpad */}
            <div className="px-4 pb-5 space-y-2 border-t border-border/40 pt-3">
              <label className="text-xs font-semibold text-muted-foreground block">Shot Price ($)</label>
              <div className="h-12 rounded-xl border border-border flex items-center justify-center" style={{ background: "var(--muted)" }}>
                <span className={`text-2xl font-black ${shotPrice ? "text-foreground" : "text-muted-foreground"}`}>${shotPrice || "0.00"}</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {["1","2","3","4","5","6","7","8","9",".","0","⌫"].map((k) => (
                  <button key={k} type="button"
                    onClick={() => {
                      if (k === "⌫") { setShotPrice(v => v.slice(0,-1)); return; }
                      if (k === ".") { if (!shotPrice.includes(".")) setShotPrice(v => v + "."); return; }
                      const dotIdx = shotPrice.indexOf(".");
                      if (dotIdx !== -1 && shotPrice.length - dotIdx > 2) return;
                      setShotPrice(v => v === "0" ? k : v + k);
                    }}
                    className={`h-12 rounded-xl font-black text-lg transition active:scale-95 ${k === "⌫" ? "bg-destructive/20 text-destructive" : "bg-muted hover:bg-muted/70 text-foreground"}`}
                  >{k}</button>
                ))}
              </div>
              <button
                onClick={addShot}
                disabled={!shotPrice || parseFloat(shotPrice) <= 0}
                className="w-full h-11 rounded-xl font-black text-sm text-primary-foreground disabled:opacity-40 active:scale-[0.98] transition"
                style={{ background: "var(--gradient-hero)" }}
              >
                + Add to Order
              </button>
            </div>
          </div>
        </div>
      )}

      {/* -- Mark Empty Confirm Modal -------------------------------------- */}
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

      {/* -- Cancel Bottle Confirm Modal ------------------------------------ */}
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

      {/* -- Opened Bottles Modal ------------------------------------------ */}
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
                          ? <img src={prod.image_url} alt="" className="h-full w-full object-cover"
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
                    {/* Single centered button  —  Cancel if 0 shots, Mark Bottle Empty if shots sold */}
                    <div className="flex justify-center py-2">
                      <button
                        onClick={() => b.shots_sold === 0 ? handleCancelBottle(b.id) : handleFinishBottle(b.id)}
                        disabled={bottleBusy}
                        className="px-6 h-10 rounded-xl font-black text-sm text-white disabled:opacity-40 active:scale-[0.98] transition flex items-center justify-center gap-2"
                        style={{ background: b.shots_sold === 0 ? "linear-gradient(135deg,#374151,#1f2937)" : "linear-gradient(135deg,#dc2626,#991b1b)" }}
                      >
                        {bottleBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : b.shots_sold === 0 ? "✕ Cancel" : "Mark Bottle Empty"}
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

      {/* -- Pack Step 1: Select open pack + open new -- */}
      {packModalOpen && packStep === "select" && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => { setPackModalOpen(false); setPackStep("select"); setPackPrice(""); setPackPackId(""); setShowNewPackGrid(false); }}>
          <div className="w-full max-w-md rounded-t-3xl border border-border shadow-2xl"
            style={{ background: "var(--gradient-card)" }}
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <span className="text-base font-black">{packType === "paper" ? "📄 Select Paper Pack" : "🚬 Select Cigarette Pack"}</span>
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
                                  style={{ background: "#374151" }}>✕ Cancel</button>
                              )}
                              <button
                                onClick={() => { setPackPackId(pk.id); setPackPrice(pk.unit_price ? String(pk.unit_price) : ""); setPackStep("price"); setPackModalOpen(false); setShowNewPackGrid(false); }}
                                className="aspect-[3/4] relative w-full active:scale-95 transition"
                                style={{ background: "var(--gradient-card)" }}>
                                {prod?.image_url ? <img src={prod.image_url} alt="" className="absolute inset-0 w-full h-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} /> : null}
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
                            {p.image_url ? <img src={p.image_url} alt="" className="absolute inset-0 w-full h-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} /> : null}
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

      {/* -- Pack Step 2: Price entry numpad -- */}
      {packStep === "price" && packPackId && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => { setPackStep("select"); setPackPackId(""); setPackPrice(""); setPackQty(1); }}>
          <div className="w-full max-w-md rounded-t-3xl border border-border shadow-2xl"
            style={{ background: "var(--gradient-card)" }}
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <span className="font-black text-base">🚬 Add to Order</span>
              <button onClick={() => { setPackStep("select"); setPackPackId(""); setPackPrice(""); setPackQty(1); setPackModalOpen(true); }}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 h-8 px-2 rounded-lg bg-muted">
                <X className="h-3.5 w-3.5" /> Change
              </button>
            </div>

            {/* Pack grid  —  all open packs, selected highlighted with orange border + checkmark */}
            <div className="px-4 pb-2">
              <div className="grid grid-cols-3 gap-2">
                {openedPacks.map((pk) => {
                  const pkProd = products.find(p => p.id === pk.product_id);
                  const isSelected = pk.id === packPackId;
                  return (
                    <button key={pk.id}
                      onClick={() => { setPackPackId(pk.id); setPackPrice(pk.unit_price ? String(pk.unit_price) : ""); }}
                      className="w-full flex flex-col rounded-2xl overflow-hidden border active:scale-95 transition"
                      style={{ borderWidth: isSelected ? 3 : 1, borderColor: isSelected ? "var(--primary)" : "transparent", background: "var(--gradient-card)" }}>
                      <div className="aspect-[3/4] relative w-full">
                        {pkProd?.image_url ? <img src={pkProd.image_url} alt="" className="absolute inset-0 w-full h-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} /> : null}
                        <div className="absolute inset-0 flex items-center justify-center text-3xl"
                          style={{ display: pkProd?.image_url ? "none" : "flex" }}>{pk.pack_type === "paper" ? "📄" : "🚬"}</div>
                        {isSelected && <div className="absolute inset-0 flex items-center justify-center font-black"
                          style={{ background: "rgba(var(--primary-rgb,251 146 60)/0.50)", color: "var(--primary)" }}><Check className="h-16 w-16" strokeWidth={3} /></div>}
                      </div>
                      <div className="px-1.5 py-1.5" style={{ background: "rgba(var(--primary-rgb,251 146 60)/0.10)", borderTop: "1px solid rgba(var(--primary-rgb,251 146 60)/0.35)" }}>
                        <div className="font-bold text-[11px] truncate leading-tight" style={{ color: "var(--primary)" }}>{pk.product_name}</div>
                        <div className="font-black text-xs mt-0.5" style={{ color: "var(--primary)" }}>${Number(pk.revenue).toFixed(2)} made</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="px-4 pb-5 space-y-2 border-t border-border/40 pt-3">
              {/* Retail Price */}
              <label className="text-xs font-semibold text-muted-foreground block">Retail Price ($)</label>
              <div className="h-12 rounded-xl border border-border flex items-center justify-center" style={{ background: "var(--muted)" }}>
                <span className={`text-2xl font-black ${packPrice ? "text-foreground" : "text-muted-foreground"}`}>${packPrice || "0.00"}</span>
              </div>

              {/* Qty stepper  —  below price, full-height minus/plus buttons */}
              <label className="text-xs font-semibold text-muted-foreground block">Qty</label>
              <div className="flex rounded-xl overflow-hidden border border-border" style={{ background: "var(--muted)", height: 48 }}>
                <button type="button"
                  onClick={() => setPackQty(q => Math.max(1, q - 1))}
                  className="w-14 flex items-center justify-center font-black text-2xl border-r border-border active:bg-muted/60 transition shrink-0"
                  style={{ background: "var(--muted)" }}>−</button>
                <div className="flex-1 flex items-center justify-center font-black text-xl">{packQty}</div>
                <button type="button"
                  onClick={() => setPackQty(q => q + 1)}
                  className="w-14 flex items-center justify-center font-black text-2xl border-l border-border active:bg-muted/60 transition shrink-0"
                  style={{ background: "var(--muted)" }}>+</button>
              </div>

              {/* Numpad */}
              <div className="grid grid-cols-3 gap-1.5">
                {["1","2","3","4","5","6","7","8","9",".","0","⌫"].map((k) => (
                  <button key={k} type="button"
                    onClick={() => {
                      if (k === "⌫") { setPackPrice(v => v.slice(0,-1)); return; }
                      if (k === ".") { if (!packPrice.includes(".")) setPackPrice(v => v + "."); return; }
                      const dotIdx = packPrice.indexOf(".");
                      if (dotIdx !== -1 && packPrice.length - dotIdx > 2) return;
                      setPackPrice(v => v === "0" ? k : v + k);
                    }}
                    className={`h-12 rounded-xl font-black text-lg transition active:scale-95 ${k === "⌫" ? "bg-destructive/20 text-destructive" : "bg-muted hover:bg-muted/70 text-foreground"}`}
                  >{k}</button>
                ))}
              </div>
              <button onClick={addPackUnit}
                disabled={!packPrice || parseFloat(packPrice) <= 0}
                className="w-full h-11 rounded-xl font-black text-sm text-primary-foreground disabled:opacity-40 active:scale-[0.98] transition"
                style={{ background: "var(--gradient-hero)" }}>
                + Add to Order
              </button>
            </div>
          </div>
        </div>
      )}

      {/* -- Mark Pack Empty Confirm -- */}
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

      {/* -- Cancel Pack Confirm -- */}
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

// --- Cash Overlay -------------------------------------------------------------
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

    // 2. Decrement stock via RPC (SECURITY DEFINER  —  works for both owners and cashiers)
    const { error: stockErr } = await supabase.rpc("decrement_stock_item", {
      p_items: cart.map((c) => ({ id: c.id, qty: c.qty })),
    });
    if (stockErr) {
      console.warn("Stock decrement failed:", stockErr.message);
    }

    // 3. Record shots against their opened bottles
    const shotItems = cart.filter((c) => (c as any)._bottle_id);
    for (const shot of shotItems) {
      const { error: shotErr } = await supabase.rpc("record_shot", {
        p_bottle_id: (shot as any)._bottle_id,
        p_qty:       shot.qty,
        p_revenue:   shot.qty * Number(shot.price),
      });
      if (shotErr) console.warn("record_shot failed:", shotErr.message);
    }

    // 4. Record pack units against their opened packs (cigarettes / papers)
    const packItems = cart.filter((c) => (c as any)._pack_id);
    for (const unit of packItems) {
      const { error: packErr } = await supabase.rpc("record_pack_unit", {
        p_pack_id: (unit as any)._pack_id,
        p_qty:     unit.qty,
        p_revenue: unit.qty * Number(unit.price),
      });
      if (packErr) console.warn("record_pack_unit failed:", packErr.message);
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
                  <div key={i.id} className="flex gap-3 p-3 rounded-xl bg-background/50">
                    {/* Portrait image */}
                    <div className="h-20 w-14 shrink-0 rounded-xl overflow-hidden bg-muted flex items-center justify-center">
                      {i.image_url ? (
                        <img src={i.image_url} alt={i.name} className="h-full w-full object-cover" />
                      ) : i.id.startsWith("shot-") ? (
                        <span className="text-2xl">🥃</span>
                      ) : (
                        <span className="text-2xl">{categoryIcon(i.category ?? "drinks")}</span>
                      )}
                    </div>
                    {/* Content */}
                    <div className="flex-1 min-w-0 flex flex-col justify-between">
                      {/* Title row  —  full width */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-black text-sm leading-tight flex-1">{i.name}</div>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive shrink-0 -mt-0.5" onClick={() => onRemove(i.id)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      {/* Price + controls row */}
                      <div className="flex items-center justify-between mt-3">
                        <div className="font-black text-primary text-base">${(i.qty * Number(i.price)).toFixed(2)}</div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => onDec(i.id)}
                            className="h-9 w-9 rounded-full flex items-center justify-center active:scale-90 transition"
                            style={{ background: "#ef4444" }}>
                            <Minus className="h-4 w-4 text-black" />
                          </button>
                          <div className="h-9 w-9 rounded-full flex items-center justify-center text-sm font-black text-white"
                            style={{ background: "#1a1a1a" }}>
                            {i.qty}
                          </div>
                          <button
                            onClick={() => onAdd(i)}
                            className="h-9 w-9 rounded-full flex items-center justify-center active:scale-90 transition"
                            style={{ background: "var(--gradient-hero)" }}>
                            <Plus className="h-4 w-4 text-black" />
                          </button>
                        </div>
                      </div>
                      {/* Unit price */}
                      <div className="text-xs text-muted-foreground mt-0.5">${Number(i.price).toFixed(2)} each</div>
                    </div>
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
              {/* Amount received  —  smaller input display */}
              <div className="rounded-xl border border-green-500/30 px-4 py-3 text-center" style={{ background: "oklch(0.22 0.06 145 / 0.4)" }}>
                <div className="text-xs font-semibold text-green-300/70 uppercase tracking-widest mb-1">Amount Received</div>
                <div className="text-3xl font-black text-green-100">
                  ${paid || "0.00"}
                </div>
              </div>

              {/* Change output  —  bigger */}
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

// -- Credit Sale Overlay --------------------------------------------------------
// Step 1: Order review ΓåÆ Step 2: Pick/create credit account ΓåÆ confirm
type CreditAccount = {
  id: string; full_name: string; contact_number: string | null;
  balance_owed: number; status: string;
};

function CreditSaleOverlay({
  total, cart, onDec, onAdd, onRemove, onClearCart, onClose, onSuccess,
}: {
  total: number;
  cart: CartItem[];
  onDec: (id: string) => void;
  onAdd: (p: CartItem) => void;
  onRemove: (id: string) => void;
  onClearCart: () => void;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { profile } = useAuth();
  const ownerId = profile?.role === "owner" ? profile.id : profile?.parent_id;

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

  const chargeAccount = async (account: CreditAccount) => {
    if (!profile) return;
    setBusy(true);
    const itemsDesc = cart.map((c) => `${c.qty}x ${c.name}`).join(", ");
    const { error } = await supabase.rpc("record_credit_charge", {
      p_credit_account_id: account.id,
      p_cashier_id: profile.id,
      p_amount: total,
      p_items: cart.map((c) => ({ id: c.id, name: c.name, price: c.price, qty: c.qty })),
      p_note: itemsDesc,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Charged $${total.toFixed(2)} to ${account.full_name}`);
    onSuccess();
  };

  const createAndCharge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !ownerId || !profile) return;
    setBusy(true);
    // Create the account
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
    // Charge it
    const itemsDesc = cart.map((c) => `${c.qty}x ${c.name}`).join(", ");
    const { error: chargeErr } = await supabase.rpc("record_credit_charge", {
      p_credit_account_id: acc.id,
      p_cashier_id: profile.id,
      p_amount: total,
      p_items: cart.map((c) => ({ id: c.id, name: c.name, price: c.price, qty: c.qty })),
      p_note: itemsDesc,
    });
    setBusy(false);
    if (chargeErr) { toast.error(chargeErr.message); return; }
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
          <h2 className="text-xl font-black" style={{ color: "var(--primary)" }}>Credit Order</h2>
          <button onClick={onClose} className="h-9 w-9 rounded-full flex items-center justify-center bg-muted hover:bg-muted/80 transition">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* -- Step 1: Order review -- */}
        {step === "review" && (
          <>
            <div className="flex-1 overflow-y-auto px-5 space-y-4 pb-4">
              {/* Total banner  —  brown/orange theme */}
              <div className="rounded-2xl p-5 text-center" style={{ background: "oklch(0.18 0.04 45)", border: "2px solid var(--primary)" }}>
                <div className="text-sm font-medium" style={{ color: "var(--primary)" }}>Total to Credit</div>
                <div className="text-5xl font-black" style={{ color: "var(--primary)" }}>${total.toFixed(2)}</div>
              </div>

              {/* Order items  —  same layout as Cash Order */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Order</span>
                  <button onClick={onClearCart} className="text-xs text-destructive hover:underline flex items-center gap-1">
                    <Trash2 className="h-3 w-3" /> Clear
                  </button>
                </div>
                {cart.map((i) => (
                  <div key={i.id} className="flex gap-3 p-3 rounded-xl bg-background/50">
                    <div className="h-20 w-14 shrink-0 rounded-xl overflow-hidden bg-muted flex items-center justify-center">
                      {i.image_url ? (
                        <img src={i.image_url} alt={i.name} className="h-full w-full object-cover" />
                      ) : i.id.startsWith("shot-") ? (
                        <span className="text-2xl">🥃</span>
                      ) : (
                        <span className="text-2xl">{categoryIcon(i.category ?? "drinks")}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col justify-between">
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-black text-sm leading-tight flex-1">{i.name}</div>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive shrink-0 -mt-0.5" onClick={() => onRemove(i.id)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="flex items-center justify-between mt-3">
                        <div className="font-black text-base" style={{ color: "var(--primary)" }}>${(i.qty * Number(i.price)).toFixed(2)}</div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => onDec(i.id)} className="h-9 w-9 rounded-full flex items-center justify-center active:scale-90 transition" style={{ background: "#ef4444" }}>
                            <Minus className="h-4 w-4 text-black" />
                          </button>
                          <div className="h-9 w-9 rounded-full flex items-center justify-center text-sm font-black text-white" style={{ background: "#1a1a1a" }}>
                            {i.qty}
                          </div>
                          <button onClick={() => onAdd(i)} className="h-9 w-9 rounded-full flex items-center justify-center active:scale-90 transition" style={{ background: "var(--gradient-hero)" }}>
                            <Plus className="h-4 w-4 text-black" />
                          </button>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">${Number(i.price).toFixed(2)} each</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="shrink-0 px-5 pb-5 pt-3 border-t border-border flex gap-3">
              <Button variant="outline" className="flex-1 h-12" onClick={onClose}>Cancel</Button>
              <Button
                className="flex-1 h-12 font-black text-base"
                onClick={handleProceed}
                style={{ background: "oklch(0.22 0.04 45)", border: "2px solid var(--primary)", color: "var(--primary)" }}
              >
                Proceed
              </Button>
            </div>
          </>
        )}

        {/* -- Step 2: Pick account -- */}
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
              <Button variant="outline" className="flex-1 h-12" onClick={() => setStep("review")}>← Back</Button>
              <Button
                className="h-12 px-5 font-black text-sm"
                onClick={() => setStep("create")}
                style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}
              >
                + New Account
              </Button>
            </div>
          </>
        )}

        {/* -- Step 2b: Confirm account selection -- */}
        {confirmPick && (
          <div className="absolute inset-0 z-10 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm rounded-3xl">
            <div className="w-full max-w-xs rounded-2xl border border-border shadow-2xl p-6 space-y-4 text-center" style={{ background: "var(--gradient-card)" }}>
              <h3 className="font-black text-lg">Confirm Customer?</h3>
              <p className="text-muted-foreground text-sm">Charge this order to</p>
              <p className="font-black text-xl">{confirmPick.full_name}</p>
              <p className="font-black text-2xl" style={{ color: "var(--primary)" }}>${total.toFixed(2)}</p>
              {Number(confirmPick.balance_owed) > 0 && (
                <p className="text-xs text-red-400 font-semibold">Current balance: ${Number(confirmPick.balance_owed).toFixed(2)}</p>
              )}
              <div className="flex gap-3 pt-1">
                <Button variant="outline" className="flex-1 h-11" onClick={() => setConfirmPick(null)}>Cancel</Button>
                <Button
                  className="flex-1 h-11 font-black"
                  disabled={busy}
                  onClick={() => { chargeAccount(confirmPick); setConfirmPick(null); }}
                  style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Yes, Charge"}
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
                disabled={busy || !newName.trim()}
                className="w-full h-12 font-black text-base"
                style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create & Charge"}
              </Button>
            </form>
            <div className="shrink-0 px-5 pb-5 pt-2 border-t border-border">
              <Button variant="outline" className="w-full h-10" onClick={() => setStep("pick")}>← Back to Accounts</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// -- Credit form keyboard helpers ----------------------------------------------
function CreditNumPad({ value, onChange, maxLen = 20, onDone }: {
  value: string; onChange: (v: string) => void; maxLen?: number; onDone: () => void;
}) {
  return (
    <div className="mt-2 space-y-1.5">
      <div className="grid grid-cols-3 gap-1.5">
        {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((k, i) =>
          k === "" ? <div key={i} /> :
          <button key={k} type="button"
            onClick={() => {
              if (k === "⌫") onChange(value.slice(0, -1));
              else if (value.length < maxLen) onChange(value + k);
            }}
            className={`h-12 rounded-xl font-black text-xl transition active:scale-95 ${k === "⌫" ? "bg-destructive/20 text-destructive" : "bg-muted text-foreground"}`}
          >{k}</button>
        )}
      </div>
      <button type="button" onClick={onDone}
        className="w-full h-9 rounded-xl text-xs font-bold text-muted-foreground bg-muted/50 active:scale-95 transition">
        Done
      </button>
    </div>
  );
}

function CreditContactPad({ value, onChange, onDone }: {
  value: string; onChange: (v: string) => void; onDone: () => void;
}) {
  const handle = (k: string) => {
    if (k === "⌫") {
      const digits = value.replace("-", "").slice(0, -1);
      onChange(digits.length > 3 ? digits.slice(0, 3) + "-" + digits.slice(3) : digits);
    } else {
      const digits = (value.replace("-", "") + k).slice(0, 7);
      onChange(digits.length > 3 ? digits.slice(0, 3) + "-" + digits.slice(3) : digits);
    }
  };
  return (
    <div className="mt-2 space-y-1.5">
      <div className="grid grid-cols-3 gap-1.5">
        {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((k, i) =>
          k === "" ? <div key={i} /> :
          <button key={k} type="button" onClick={() => handle(k)}
            className={`h-12 rounded-xl font-black text-xl transition active:scale-95 ${k === "⌫" ? "bg-destructive/20 text-destructive" : "bg-muted text-foreground"}`}
          >{k}</button>
        )}
      </div>
      <button type="button" onClick={onDone}
        className="w-full h-9 rounded-xl text-xs font-bold text-muted-foreground bg-muted/50 active:scale-95 transition">
        Done
      </button>
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
