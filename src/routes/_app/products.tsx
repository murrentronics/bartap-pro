import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Camera, ImagePlus, Plus, Minus, Trash2, Loader2, LayoutGrid, ArrowLeft, X, Search, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { CATEGORIES, categoryIcon } from "@/lib/categories";
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
};

// ─── Stock Qty Numberpad Modal ────────────────────────────────────────────────
function StockNumpad({ productId, currentQty, onClose, onSaved }: {
  productId: string;
  currentQty: number;
  onClose: () => void;
  onSaved: (newQty: number) => void;
}) {
  const [value, setValue] = useState(String(currentQty));
  const [busy, setBusy] = useState(false);

  const handleKey = (k: string) => {
    if (k === "⌫") { setValue((v) => (v.length > 1 ? v.slice(0, -1) : "0")); return; }
    if (k === "C") { setValue("0"); return; }
    setValue((v) => {
      const next = v === "0" ? k : v + k;
      return Number(next) > 9999 ? v : next;
    });
  };

  const save = async () => {
    setBusy(true);
    const newQty = Number(value);
    const { error } = await supabase
      .from("products")
      .update({ stock_qty: newQty })
      .eq("id", productId);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    onSaved(newQty);
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
          <span className="text-base font-black">Set Stock Qty</span>
          <button onClick={onClose} className="h-8 w-8 rounded-full flex items-center justify-center bg-muted hover:bg-muted/80 transition">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mx-5 mb-4 h-14 rounded-2xl border border-border bg-muted/30 flex items-center justify-center">
          <span className="text-4xl font-black text-primary">{value}</span>
        </div>
        <div className="px-5 pb-5 space-y-2">
          <div className="grid grid-cols-3 gap-2">
            {["1","2","3","4","5","6","7","8","9","C","0","⌫"].map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => handleKey(k)}
                className={`h-14 rounded-2xl font-black text-xl transition active:scale-95 ${
                  k === "⌫" ? "bg-destructive/20 text-destructive hover:bg-destructive/30"
                  : k === "C" ? "bg-orange-500/20 text-orange-400 hover:bg-orange-500/30"
                  : "bg-muted hover:bg-muted/70 text-foreground"
                }`}
              >{k}</button>
            ))}
          </div>
          <button
            onClick={save}
            disabled={busy}
            className="w-full rounded-2xl font-black text-base text-primary-foreground transition active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 py-4"
            style={{ background: "var(--gradient-hero)" }}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Done"}
          </button>
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
    <div className="grid grid-cols-2 gap-2">
      {visible.map((t) => (
        <button
          key={t.url}
          onPointerDown={(e) => { e.preventDefault(); onSelect(t.url, t.label, category); }}
          className="aspect-[3/4] relative rounded-xl overflow-hidden border border-border hover:border-primary active:scale-95 transition"
          style={{ background: "var(--gradient-card)" }}
        >
          <img src={t.url} alt={t.label} className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/85 to-transparent">
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
      <div className="sticky top-[44px] z-20 -mx-3 px-3 pt-3 pb-3 bg-background/95 backdrop-blur border-b border-border space-y-2">
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
            <AddItemDialog key={open ? "open" : "closed"} ownerId={profile.id} onDone={() => { setOpen(false); load(); }} />
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
              <div
                key={p.id}
                className="aspect-[3/4] relative rounded-2xl overflow-hidden border border-border"
                style={{ background: "var(--gradient-card)" }}
              >
                {p.image_url
                  ? <img src={p.image_url} alt={p.name} className="absolute inset-0 w-full h-full object-cover" />
                  : <div className="absolute inset-0 flex items-center justify-center text-4xl">
                      {categoryIcon(p.category ?? "drinks")}
                    </div>}

                {/* Out-of-stock overlay — covers only the middle (image area), not the bottom bar */}
                {(p.stock_qty ?? 0) === 0 && (
                  <div className="absolute inset-x-0 top-10 bottom-10 z-[5] flex items-center justify-center bg-red-950/70 backdrop-blur-[1px] pointer-events-none">
                    <div className="bg-red-600 rounded-xl px-2 py-1 shadow-lg">
                      <span className="text-white text-[10px] font-black uppercase tracking-wider leading-none">Out of Stock</span>
                    </div>
                  </div>
                )}

                {/* Stock controls */}
                <div className="absolute top-0 inset-x-0 flex items-center justify-between px-1.5 pt-1.5 gap-1 z-10">
                  <button
                    onClick={(e) => { e.stopPropagation(); updateStock(p.id, -1); }}
                    className="h-7 w-7 rounded-full flex items-center justify-center bg-black/60 hover:bg-red-600/80 active:scale-90 transition text-white shadow shrink-0"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setStockNumpadId(p.id); }}
                    className="flex-1 h-7 rounded-full flex items-center justify-center bg-black/70 hover:bg-black/90 active:scale-95 transition shadow"
                  >
                    <span className="text-xs font-black text-white leading-none">{p.stock_qty ?? 0}</span>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); updateStock(p.id, 1); }}
                    className="h-7 w-7 rounded-full flex items-center justify-center bg-black/60 hover:bg-green-600/80 active:scale-90 transition text-white shadow shrink-0"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/85 to-transparent">
                  <div className="font-bold text-sm text-white truncate">{p.name}</div>
                  <div className="flex justify-between items-center">
                    <span className="text-primary font-black">${Number(p.price).toFixed(2)}</span>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button className="p-1 rounded text-white/70 hover:text-destructive">
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
              </div>
            ))}
          </div>
        )}
      </div>

      {stockNumpadId && stockNumpadProduct && (
        <StockNumpad
          productId={stockNumpadId}
          currentQty={stockNumpadProduct.stock_qty ?? 0}
          onClose={() => setStockNumpadId(null)}
          onSaved={(newQty) => {
            setItems((prev) => prev.map((p) => p.id === stockNumpadId ? { ...p, stock_qty: newQty } : p));
          }}
        />
      )}
    </div>
  );
}

// ─── Add Item Dialog ──────────────────────────────────────────────────────────
function AddItemDialog({ onDone, ownerId }: { onDone: () => void; ownerId: string }) {
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
    const { error } = await supabase.from("products").insert({
      owner_id: profile.id, name: name.trim(), price: Number(price), image_url, category,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Item added");
    setName(""); setPrice(""); setCategory("beers"); setFile(null); setPreview(null); setTemplateUrl(null);
    onDone();
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
                <Button type="button" size="sm" variant="secondary" className="w-full" onClick={() => setShowTemplates(true)}>
                  <LayoutGrid className="h-4 w-4 mr-1.5" /> Template
                </Button>
                <Button type="button" size="sm" variant="secondary" className="w-full" onClick={() => camRef.current?.click()}>
                  <Camera className="h-4 w-4 mr-1.5" /> Take Photo
                </Button>
                <Button type="button" size="sm" variant="secondary" className="w-full" onClick={() => fileRef.current?.click()}>
                  <ImagePlus className="h-4 w-4 mr-1.5" /> Upload
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
        <Button onClick={submit} disabled={busy || !name || !price} className="font-bold h-11 shrink-0">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Item"}
        </Button>
      )}
    </DialogContent>
  );
}
