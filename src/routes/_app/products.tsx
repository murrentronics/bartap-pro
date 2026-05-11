import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Camera, ImagePlus, Plus, Trash2, Loader2, LayoutGrid, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_app/products")({
  component: ProductsPage,
});

type Product = { id: string; name: string; price: number; image_url: string | null; category?: "drinks" | "snacks" };

// ─── Template images ────────────────────────────────────────────────────────
// Auto-generated from public/assets/templates/
const TEMPLATE_IMAGES: { file: string; label: string }[] = [
  { file: "Allagash-White.jpeg", label: "Allagash White" },
  { file: "Amstel-Light.jpeg", label: "Amstel Light" },
  { file: "Beck8217s.jpeg", label: "Beck's" },
  { file: "Bell8217s-Two-Hearted-Ale-IPA.jpeg", label: "Bell's Two Hearted IPA" },
  { file: "Breckenridge-Brewery-Avalanche-Ale.jpeg", label: "Breckenridge Avalanche Ale" },
  { file: "Bud-ICE.jpeg", label: "Bud Ice" },
  { file: "Bud-Light-Lime.jpeg", label: "Bud Light Lime" },
  { file: "Bud-Light-Orange-1.jpeg", label: "Bud Light Orange" },
  { file: "Bud-Light-Platinum.jpeg", label: "Bud Light Platinum" },
  { file: "Bud-Light-Seltzer-Black-Cherry.jpeg", label: "Bud Light Seltzer Black Cherry" },
  { file: "Bud-Light-Seltzer-Mango.jpeg", label: "Bud Light Seltzer Mango" },
  { file: "Busch-Beer.jpeg", label: "Busch Beer" },
  { file: "Busch-Light.jpeg", label: "Busch Light" },
  { file: "Carib-Ginger-Shandy.jpeg", label: "Carib Ginger Shandy" },
  { file: "Carib-Lime-Shandy.jpeg", label: "Carib Lime Shandy" },
  { file: "Carib-Royal-Extra-Stout.jpeg", label: "Carib Royal Extra Stout" },
  { file: "Carib-Sorrel-Shandy.jpeg", label: "Carib Sorrel Shandy" },
  { file: "ci-carib-lager-9e90aefa7d7efd45.png", label: "Carib Lager" },
  { file: "ci-labatt-blue-166b3625536163c9.png", label: "Labatt Blue" },
  { file: "ci-mikes-hard-strawberry-lemonade-6d4febd243670fea.jpeg", label: "Mike's Hard Strawberry Lemonade" },
  { file: "Cigar-City-Brewing-Jai-Alai-IPA.jpeg", label: "Cigar City Jai Alai IPA" },
  { file: "Coors-Banquet-Lager-Beer.jpeg", label: "Coors Banquet" },
  { file: "Corona-Extra-Coronita.jpeg", label: "Corona Extra" },
  { file: "Corona-Hard-Seltzer-Gluten-Free-Spiked-Sparkling-Water-Variety-Pack.jpeg", label: "Corona Hard Seltzer" },
  { file: "Golden-Road-Brewing-Mango-Cart.jpeg", label: "Golden Road Mango Cart" },
  { file: "Guinness-Extra-Stout.jpeg", label: "Guinness Extra Stout" },
  { file: "Heineken-Light.jpeg", label: "Heineken Light" },
  { file: "Heineken-Non-Alcoholic-0.0.jpeg", label: "Heineken 0.0" },
  { file: "Lagunitas-Little-Sumpin8217-Sumpin8217-Ale.jpeg", label: "Lagunitas Little Sumpin' Ale" },
  { file: "Left-Hand-Milk-Stout-Nitro.jpeg", label: "Left Hand Milk Stout Nitro" },
  { file: "Mackeson-XXX-Stout-2.jpeg", label: "Mackeson XXX Stout" },
  { file: "Michelob-Ultra-Pure-Gold.jpeg", label: "Michelob Ultra Pure Gold" },
  { file: "Mike8217s-Hard-Black-Cherry-Lemonade.jpeg", label: "Mike's Hard Black Cherry" },
  { file: "Mike8217s-Hard-Lemonade.jpeg", label: "Mike's Hard Lemonade" },
  { file: "Miller-64-Extra-Light-Lager.jpeg", label: "Miller 64" },
  { file: "Miller-High-Life-American-Lager-Beer.jpeg", label: "Miller High Life" },
  { file: "Modelo-Negra.jpeg", label: "Modelo Negra" },
  { file: "Narragansett-Lager.jpeg", label: "Narragansett Lager" },
  { file: "Natural-Light.jpeg", label: "Natural Light" },
  { file: "Pabst-Blue-Ribbon-Hard-Coffee.jpeg", label: "PBR Hard Coffee" },
  { file: "Pacifico-Clara.jpeg", label: "Pacifico Clara" },
  { file: "Peroni-Nastro-Azzurro-Pale-Lager-Beer.jpeg", label: "Peroni Nastro Azzurro" },
  { file: "Presidente.jpeg", label: "Presidente" },
  { file: "Samuel-Adams-Boston-Lager-Beer.jpeg", label: "Samuel Adams Boston Lager" },
  { file: "Shiner-Bock.jpeg", label: "Shiner Bock" },
  { file: "Sierra-Nevada-Pale-Ale.jpeg", label: "Sierra Nevada Pale Ale" },
  { file: "Smirnoff-Ice-Green-Apple.jpeg", label: "Smirnoff Ice Green Apple" },
  { file: "Smirnoff-Ice-Original.jpeg", label: "Smirnoff Ice Original" },
  { file: "Smirnoff-Ice-Raspberry.jpeg", label: "Smirnoff Ice Raspberry" },
  { file: "Smirnoff-Ice-Red-White-038-Berry.jpeg", label: "Smirnoff Ice Red White & Berry" },
  { file: "Smirnoff-Ice-Screwdriver.jpeg", label: "Smirnoff Ice Screwdriver" },
  { file: "Smirnoff-Ice-Triple-Black.jpeg", label: "Smirnoff Ice Triple Black" },
  { file: "Smirnoff-Ice-Watermelon-Mimosa.jpeg", label: "Smirnoff Ice Watermelon Mimosa" },
  { file: "Victory-Brewing-Sour-Monkey.jpeg", label: "Victory Sour Monkey" },
  { file: "White-Claw-Ruby-Grapefruit-Hard-Seltzer.jpeg", label: "White Claw Ruby Grapefruit" },
];

function ProductsPage() {
  const { profile } = useAuth();
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<"drinks" | "snacks">("drinks");

  const load = async () => {
    if (!profile) return;
    const { data } = await supabase
      .from("products")
      .select("*")
      .eq("owner_id", profile.id)
      .order("name", { ascending: true });
    setItems((data ?? []) as Product[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [profile?.id]);

  if (profile?.role !== "owner") {
    return <div className="text-center text-muted-foreground py-20">Only owners can manage items.</div>;
  }

  const filtered = items.filter((p) => (p.category || "drinks") === category);

  return (
    <div>
      {/* Sticky header: title + add button + tabs */}
      <div className="sticky top-0 z-20 -mx-3 px-3 pt-2 pb-2 bg-background/95 backdrop-blur border-b border-border space-y-2">
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
            <AddItemDialog ownerId={profile.id} onDone={() => { setOpen(false); load(); }} />
          </Dialog>
        </div>

        {/* Drinks / Snacks tabs */}
        <div className="grid grid-cols-2 gap-2">
          {(["drinks", "snacks"] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`h-8 rounded-xl font-bold text-sm transition ${
                category === cat ? "text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
              style={category === cat ? { background: "var(--gradient-hero)" } : {}}
            >
              {cat === "drinks" ? "🍺 Drinks" : "🍟 Snacks"}
            </button>
          ))}
        </div>
      </div>

      <div className="pt-3">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            No {category} yet — tap Add Item.
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
            {filtered.map((p) => (
              <div
                key={p.id}
                className="aspect-[3/4] relative rounded-2xl overflow-hidden border border-border"
                style={{ background: "var(--gradient-card)" }}
              >
                {p.image_url
                  ? <img src={p.image_url} alt={p.name} className="absolute inset-0 w-full h-full object-cover" />
                  : <div className="absolute inset-0 flex items-center justify-center text-4xl">
                      {p.category === "snacks" ? "🍟" : "🍹"}
                    </div>}
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
    </div>
  );
}

// ─── Template Picker ─────────────────────────────────────────────────────────
function TemplatePicker({ onSelect, onBack, ownerId }: {
  onSelect: (url: string, label: string) => void;
  onBack: () => void;
  ownerId: string;
}) {
  const [usedUrls, setUsedUrls] = useState<Set<string>>(new Set());

  // Fetch used template URLs fresh every time picker mounts
  useEffect(() => {
    supabase
      .from("products")
      .select("image_url")
      .eq("owner_id", ownerId)
      .then(({ data }) => {
        const urls = new Set(
          (data ?? [])
            .map((r: { image_url: string | null }) => r.image_url)
            .filter((u): u is string => !!u && u.startsWith("/assets/templates/"))
        );
        setUsedUrls(urls);
      });
  }, [ownerId]);

  const available = TEMPLATE_IMAGES.filter(
    (t) => !usedUrls.has(`/assets/templates/${t.file}`)
  );

  if (available.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center text-muted-foreground gap-2 py-12">
        <LayoutGrid className="h-10 w-10 opacity-30" />
        <p className="text-sm">All templates are already in use.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-3 gap-2">
          {available.map((t) => {
            const url = `/assets/templates/${t.file}`;
            return (
              <button
                key={t.file}
                onClick={() => onSelect(url, t.label)}
                className="aspect-[3/4] relative rounded-xl overflow-hidden border border-border hover:border-primary active:scale-95 transition"
                style={{ background: "var(--gradient-card)" }}
              >
                <img src={url} alt={t.label} className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute inset-x-0 bottom-0 p-1.5 bg-gradient-to-t from-black/80 to-transparent">
                  <div className="text-white text-xs font-bold truncate">{t.label}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Add Item Dialog ──────────────────────────────────────────────────────────
function AddItemDialog({ onDone, ownerId }: { onDone: () => void; ownerId: string }) {
  const { profile } = useAuth();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState<"drinks" | "snacks">("drinks");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [templateUrl, setTemplateUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  const onPick = (f: File | undefined | null) => {
    if (!f) return;
    setFile(f);
    setTemplateUrl(null);
    setPreview(URL.createObjectURL(f));
  };

  const onTemplateSelect = (url: string, label: string) => {
    setTemplateUrl(url);
    setFile(null);
    setPreview(url);
    if (!name) setName(label);
    setShowTemplates(false);
  };

  const clearImage = () => { setFile(null); setTemplateUrl(null); setPreview(null); };

  // Numpad handler for price
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
      owner_id: profile.id, name: name.trim(), price: Number(price), image_url,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Item added");
    setName(""); setPrice(""); setCategory("drinks"); setFile(null); setPreview(null); setTemplateUrl(null);
    onDone();
  };

  return (
    <DialogContent className="max-w-sm max-h-[90dvh] flex flex-col p-4 gap-3">
      <DialogHeader className="shrink-0 pb-0">
        <div className="flex items-center gap-3">
          {showTemplates && (
            <button onClick={() => setShowTemplates(false)} className="h-8 w-8 rounded-full flex items-center justify-center bg-muted hover:bg-muted/80 transition shrink-0">
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <DialogTitle>{showTemplates ? "Choose Template" : "Add Bar Item"}</DialogTitle>
        </div>
      </DialogHeader>

      <div className="flex-1 min-h-0 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
        {showTemplates ? (
          <TemplatePicker onSelect={onTemplateSelect} onBack={() => setShowTemplates(false)} ownerId={ownerId} />
        ) : (
          <div className="space-y-3">

            {/* Image area with buttons top-right and category bottom-right */}
            <div className="flex gap-3 items-stretch">
              {/* Half-width portrait image */}
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

              {/* Right side: action buttons only */}
              <div className="flex flex-col gap-2 flex-1 justify-center">
                <Button type="button" size="sm" variant="secondary" className="w-full" onClick={() => camRef.current?.click()}>
                  <Camera className="h-4 w-4 mr-1.5" /> Take Photo
                </Button>
                <Button type="button" size="sm" variant="secondary" className="w-full" onClick={() => fileRef.current?.click()}>
                  <ImagePlus className="h-4 w-4 mr-1.5" /> Upload
                </Button>
                <Button type="button" size="sm" variant="secondary" className="w-full" onClick={() => setShowTemplates(true)}>
                  <LayoutGrid className="h-4 w-4 mr-1.5" /> Template
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
                onChange={(e) => setCategory(e.target.value as "drinks" | "snacks")}
                className="mt-1 h-9 w-full rounded-lg border border-border bg-muted px-2 text-sm font-bold outline-none cursor-pointer"
              >
                <option value="drinks">🍺 Drinks</option>
                <option value="snacks">🍟 Snacks</option>
              </select>
            </div>

            {/* Price display + numpad */}
            <div>
              <Label className="text-xs">Price</Label>
              {/* Preview box */}
              <div className="h-10 rounded-lg border border-border bg-muted/30 flex items-center px-3 mb-2">
                <span className="text-lg font-black text-primary">${price || "0.00"}</span>
              </div>
              {/* Compact numpad */}
              <div className="grid grid-cols-3 gap-1.5">
                {["1","2","3","4","5","6","7","8","9",".","0","⌫"].map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => handleNumpad(k)}
                    className={`h-11 rounded-xl font-black text-lg transition active:scale-95 ${
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
