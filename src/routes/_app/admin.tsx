import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import {
  listAllProfiles,
  setUserStatus,
  adminDeleteUser,
} from "@/lib/admin.functions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { CATEGORIES, type CategoryValue } from "@/lib/categories";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Check, X, Ban, UserMinus, RotateCw, Trash2, Loader2,
  ShieldAlert, Search, ImagePlus, Link as LinkIcon, LayoutGrid, CalendarClock, AlertCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { confirm } from "@/components/ui/confirm-dialog";

type Row = {
  id: string;
  username: string;
  email: string;
  role: string;
  status: "pending" | "approved" | "suspended" | "expelled";
  wallet_balance: number;
  created_at: string;
};

type SubPayment = {
  id: string;
  owner_id: string;
  paid_at: string;
  due_date: string;
};

// Compute next due date: 1 year after the given date, minus 1 day
function nextDueDate(fromDate: string): Date {
  const d = new Date(fromDate);
  d.setFullYear(d.getFullYear() + 1);
  d.setDate(d.getDate() - 1);
  return d;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ─── Subscription Badge ───────────────────────────────────────────────────────
function SubscriptionBadge({ ownerId }: {
  ownerId: string;
}) {
  const [profile, setProfile] = useState<any>(null);
  const [paidCount, setPaidCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      // Get profile with subscription details
      const { data: profileData } = await supabase
        .from("profiles")
        .select("subscription_end_date, billing_status")
        .eq("id", ownerId)
        .single();
      
      // Get count of paid payments
      const { data: payments } = await supabase
        .from("billing_payments")
        .select("id, plan_id")
        .eq("owner_id", ownerId)
        .eq("status", "paid");
      
      // Get plan amount from the most recent payment
      let planAmount = 0;
      if (payments && payments.length > 0) {
        const { data: plan } = await supabase
          .from("billing_plans")
          .select("amount")
          .eq("id", payments[0].plan_id)
          .single();
        
        if (plan) planAmount = plan.amount;
      }
      
      setProfile({ ...profileData, planAmount });
      setPaidCount(payments?.length || 0);
      setLoading(false);
    };
    
    loadData();
  }, [ownerId]);

  if (loading || !profile) return null;

  const dueDate = profile.subscription_end_date ? new Date(profile.subscription_end_date) : null;
  if (!dueDate) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysUntil = Math.ceil((dueDate.getTime() - today.getTime()) / 86400000);
  const isNearExpiry = daysUntil <= 7;

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold ${
      isNearExpiry
        ? "bg-red-500/15 border border-red-500/30 text-red-400"
        : "bg-muted border border-border text-muted-foreground"
    }`}>
      {isNearExpiry ? (
        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
      ) : (
        <CalendarClock className="h-3.5 w-3.5 shrink-0" />
      )}
      <span>
        {paidCount} cycle{paidCount !== 1 ? 's' : ''} • ${profile.planAmount?.toFixed(2) || '0.00'} • Due {formatDate(dueDate)}
        {isNearExpiry && ` (${daysUntil}d)`}
      </span>
    </div>
  );
}

type ImportedImage = {
  url: string;
  label: string;
  category: TemplateCategory;
  selected: boolean;
  duplicate: boolean;
};

const TEMPLATE_CATEGORIES = CATEGORIES.map(c => c.value) as CategoryValue[];
type TemplateCategory = CategoryValue;

// ─── Shared label cleaner (used by import panel + fix-all) ───────────────────
function decodeAndCleanLabel(raw: string, fallbackUrl = ""): string {
  let s = raw.trim();
  if (!s) {
    s = fallbackUrl.split("/").pop()?.split("?")[0]?.replace(/[-_]/g, " ").replace(/\.\w+$/, "") ?? "";
  }
  // Decode HTML entities
  s = s
    .replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"').replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
  // Strip site name after separators: " - Caribshopper", " | Site", " – "
  s = s.replace(/\s*[-–|]\s*[A-Z][^|–\-]{2,}$/, "").trim();
  // Strip pack/count quantities — keep size/weight like 330ml, 12oz
  s = s.replace(/\s*\(\s*(?:\d+\s+or\s+\d+\s+)?(?:pack|count|case|ct|pk)(?:\s+of\s+\d+)?\s*\)/gi, "").trim();
  s = s.replace(/\s*\[\s*(?:\d+\s+or\s+\d+\s+)?(?:pack|count|case|ct|pk)(?:\s+of\s+\d+)?\s*\]/gi, "").trim();
  s = s.replace(/\s*[-,]?\s*\d+\s*(?:pack|count|ct|pk)\b/gi, "").trim();
  s = s.replace(/\s*[-,]?\s*pack\s+of\s+\d+\b/gi, "").trim();
  // Strip empty parens/brackets: "()", "[]", "( )"
  s = s.replace(/\s*[(\[]\s*[)\]]\s*/g, "").trim();
  // Collapse spaces
  s = s.replace(/\s+/g, " ").trim();

  // Title case — capitalize first letter of each word, lowercase the rest
  // but preserve known all-caps brands and size units
  const PRESERVE_UPPER = new Set(["VS", "KBS", "IPA", "XO", "VSOP", "XXX"]);
  const LOWERCASE_WORDS = new Set(["a", "an", "the", "and", "or", "of", "in", "on", "at", "to", "for", "with", "by"]);
  s = s
    .split(" ")
    .map((word, i) => {
      // Keep size/weight tokens as-is: 330ml, 12oz, 1.4oz, 750ml, 12fl
      if (/^\d+(\.\d+)?(ml|oz|fl|cl|l|g|kg|lb)\b/i.test(word)) return word.toLowerCase();
      // Preserve known all-caps abbreviations
      if (PRESERVE_UPPER.has(word.toUpperCase())) return word.toUpperCase();
      // Lowercase connector words (unless first word)
      if (i > 0 && LOWERCASE_WORDS.has(word.toLowerCase())) return word.toLowerCase();
      // Capitalize first letter, lowercase rest — but keep letters after apostrophe lowercase
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");

  return s || "Untitled";
}

// ─── Template Import Panel ────────────────────────────────────────────────────
function TemplateImportPanel() {
  const [pageUrl, setPageUrl] = useState("");
  const [defaultCategory, setDefaultCategory] = useState<TemplateCategory>("beers");
  const [importing, setImporting] = useState(false);
  const [importCount, setImportCount] = useState(0);
  const [importStatus, setImportStatus] = useState<"idle" | "fetching" | "parsing" | "done">("idle");
  const [saving, setSaving] = useState(false);
  const [images, setImages] = useState<ImportedImage[]>([]);
  const [existingUrls, setExistingUrls] = useState<Set<string>>(new Set());

  // Load existing template URLs to detect duplicates
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("template_images")
      .select("url")
      .then(({ data }: { data: { url: string }[] | null }) => {
        setExistingUrls(new Set((data ?? []).map((r) => r.url)));
      });
  }, []);

  // Call the Supabase Edge Function — runs server-side, no CORS/proxy issues
  const fetchViaEdgeFunction = async (targetUrl: string, onProgress: (n: number) => void): Promise<{ url: string; label: string }[]> => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

    const res = await fetch(`${supabaseUrl}/functions/v1/scrape-images`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseKey}`,
        "apikey": supabaseKey,
      },
      body: JSON.stringify({ url: targetUrl }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as { error?: string };
      throw new Error(err.error ?? `Server error ${res.status}`);
    }

    const data = await res.json() as { images: { url: string; label: string }[]; count: number; error?: string };
    if (data.error) throw new Error(data.error);

    // Simulate live count ticking up as we process results
    const results = data.images ?? [];
    for (let i = 1; i <= results.length; i++) {
      onProgress(i);
      // Small yield so React can re-render the counter
      if (i % 5 === 0) await new Promise((r) => setTimeout(r, 0));
    }

    return results;
  };

  // Clean up scraped product titles — strip site names, pack counts, keep size/weight
  const cleanLabel = (raw: string, fallbackUrl: string): string => {
    let s = raw.trim();
    if (!s) {
      s = fallbackUrl.split("/").pop()?.split("?")[0]?.replace(/[-_]/g, " ").replace(/\.\w+$/, "") ?? "";
    }
    // Decode HTML entities
    s = s
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    // Strip site name after separators: " - Caribshopper", " | Site", " – "
    s = s.replace(/\s*[-–|]\s*[A-Z][^|–\-]{2,}$/, "").trim();
    // Strip pack/count quantities — but NOT size/weight like 330ml, 12oz, 1.4oz
    // Matches: (3 Pack), (6 Pack), (3 or 6 Pack), (12 Count), (Pack of 4), (Case of 24)
    s = s.replace(/\s*\(\s*(?:\d+\s+or\s+\d+\s+)?(?:pack|count|case|ct|pk)(?:\s+of\s+\d+)?\s*\)/gi, "").trim();
    s = s.replace(/\s*\[\s*(?:\d+\s+or\s+\d+\s+)?(?:pack|count|case|ct|pk)(?:\s+of\s+\d+)?\s*\]/gi, "").trim();
    // Strip bare "X Pack" / "Pack of X" not in parens
    s = s.replace(/\s*[-,]?\s*\d+\s*(?:pack|count|ct|pk)\b/gi, "").trim();
    s = s.replace(/\s*[-,]?\s*pack\s+of\s+\d+\b/gi, "").trim();
    // Strip empty parens/brackets left behind: "()", "[]", "( )"
    s = s.replace(/\s*[(\[]\s*[)\]]\s*/g, "").trim();
    // Collapse spaces
    s = s.replace(/\s+/g, " ").trim();
    return s || "Untitled";
  };

  const handleImport = async () => {
    const input = pageUrl.trim();
    if (!input) { toast.error("Enter a URL"); return; }
    
    // Only allow URLs
    if (!input.startsWith("http://") && !input.startsWith("https://")) {
      toast.error("Please enter a valid URL (must start with http:// or https://)");
      return;
    }
    
    setImporting(true);
    setImportCount(0);
    setImportStatus("fetching");
    setImages([]);

    try {
      setImportStatus("parsing");
      
      // URL scraping only
      const rawImages = await fetchViaEdgeFunction(input, (n) => setImportCount(n));

      const found: ImportedImage[] = rawImages.map((img) => ({
        url: img.url,
        label: decodeAndCleanLabel(img.label, img.url),
        category: defaultCategory,
        selected: !existingUrls.has(img.url),
        duplicate: existingUrls.has(img.url),
      }));

      setImportStatus("done");

      if (found.length === 0) {
        toast.error("No product images found on that page.");
      } else {
        setImages(found);
        toast.success(`Found ${found.length} images — ${found.filter(i => !i.duplicate).length} new`);
      }
    } catch (e) {
      toast.error((e as Error).message || "Failed to fetch images.");
      console.error(e);
      setImportStatus("idle");
    } finally {
      setImporting(false);
    }
  };

  const toggleAll = (val: boolean) =>
    setImages((imgs) => imgs.map((i) => ({ ...i, selected: i.duplicate ? false : val })));

  const handleSave = async () => {
    const toSave = images.filter((i) => i.selected && !i.duplicate);
    if (toSave.length === 0) { toast.error("No images selected"); return; }
    setSaving(true);

    const rows = toSave.map((i) => ({
      url: i.url,
      label: i.label,
      category: i.category,
      source_url: pageUrl.trim(),
    }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("template_images")
      .upsert(rows, { onConflict: "url", ignoreDuplicates: true });

    setSaving(false);
    if (error) { toast.error(error.message); return; }

    toast.success(`Saved ${toSave.length} templates`);
    setExistingUrls((prev) => {
      const next = new Set(prev);
      toSave.forEach((i) => next.add(i.url));
      return next;
    });
    setImages((imgs) =>
      imgs.map((i) => i.selected ? { ...i, duplicate: true, selected: false } : i)
    );
  };

  const selectedCount = images.filter((i) => i.selected).length;
  const newCount = images.filter((i) => !i.duplicate).length;

  const CAT_EMOJI = Object.fromEntries(CATEGORIES.map(c => [c.value, c.icon])) as Record<TemplateCategory, string>;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl p-4 border border-border space-y-4" style={{ background: "var(--gradient-card)" }}>
        <h2 className="font-black text-lg flex items-center gap-2">
          <ImagePlus className="h-5 w-5 text-primary" /> Import Templates from URL
        </h2>

        {/* URL or Search input */}
        <div>
          <Label className="text-xs">URL or Search Term</Label>
          <div className="flex gap-2 mt-1">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={pageUrl}
                onChange={(e) => setPageUrl(e.target.value)}
                placeholder="https://example.com/products"
                className="pl-9"
                onKeyDown={(e) => e.key === "Enter" && handleImport()}
              />
            </div>
            <Button onClick={handleImport} disabled={importing || !pageUrl.trim()}>
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Import"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Paste a URL to scrape product images from a website
          </p>
        </div>

        {/* Live import progress */}
        {importing && (
          <div className="rounded-xl border border-primary/30 px-4 py-3 flex items-center gap-3" style={{ background: "oklch(0.18 0.04 260 / 0.5)" }}>
            <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-primary/80 uppercase tracking-wider">
                {importStatus === "fetching" ? (pageUrl.startsWith("http") ? "Fetching page…" : "Searching images…") : "Processing results…"}
              </div>
              {importStatus === "parsing" && importCount > 0 && (
                <div className="text-2xl font-black text-primary mt-0.5">{importCount} found</div>
              )}
            </div>
          </div>
        )}
        {!importing && importStatus === "done" && images.length > 0 && (
          <div className="rounded-xl border border-green-500/30 px-4 py-2 flex items-center gap-2" style={{ background: "oklch(0.18 0.06 145 / 0.4)" }}>
            <Check className="h-4 w-4 text-green-400 shrink-0" />
            <span className="text-sm font-bold text-green-300">Import complete — {images.length} images found</span>
          </div>
        )}

        {/* Default category selector */}
        <div>
          <Label className="text-xs">Default Category (can change per image below)</Label>
          <div className="grid grid-cols-5 gap-2 mt-1">
            {TEMPLATE_CATEGORIES.map((cat) => {
              const catDef = CATEGORIES.find(c => c.value === cat);
              return (
                <button
                  key={cat}
                  onClick={() => {
                    setDefaultCategory(cat);
                    setImages((imgs) => imgs.map((i) => i.duplicate ? i : { ...i, category: cat }));
                  }}
                  className={`h-11 rounded-xl font-bold text-xl transition border ${
                    defaultCategory === cat
                      ? "text-primary-foreground border-transparent"
                      : "bg-muted text-muted-foreground border-border hover:text-foreground"
                  }`}
                  style={defaultCategory === cat ? { background: "var(--gradient-hero)" } : {}}
                  title={catDef?.label ?? cat}
                >
                  {CAT_EMOJI[cat]}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Image grid */}
      {images.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="text-sm text-muted-foreground">
              <span className="font-black text-foreground">{selectedCount}</span> selected ·{" "}
              <span className="font-black text-primary">{newCount}</span> new ·{" "}
              <span className="text-muted-foreground">{images.filter(i => i.duplicate).length} duplicates</span>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => toggleAll(true)}>Select All New</Button>
              <Button size="sm" variant="outline" onClick={() => toggleAll(false)}>Deselect All</Button>
              <Button
                size="sm"
                disabled={selectedCount === 0 || saving}
                onClick={handleSave}
                style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : `Save ${selectedCount}`}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {images.map((img, idx) => (
              <div
                key={img.url}
                className={`relative rounded-xl overflow-hidden border-2 transition ${
                  img.duplicate
                    ? "border-muted opacity-40"
                    : img.selected
                    ? "border-primary"
                    : "border-border"
                }`}
                style={{ background: "var(--gradient-card)" }}
              >
                {/* Image — tapping toggles selection */}
                <button
                  className="block w-full aspect-[3/4] relative"
                  onClick={() => {
                    if (img.duplicate) return;
                    setImages((imgs) =>
                      imgs.map((i, i2) => i2 === idx ? { ...i, selected: !i.selected } : i)
                    );
                  }}
                >
                  <img
                    src={img.url}
                    alt={img.label}
                    className="absolute inset-0 w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                  {!img.duplicate && (
                    <div className={`absolute top-1.5 right-1.5 h-5 w-5 rounded-full border-2 flex items-center justify-center transition ${
                      img.selected ? "bg-primary border-primary" : "bg-black/50 border-white/50"
                    }`}>
                      {img.selected && <Check className="h-3 w-3 text-primary-foreground" />}
                    </div>
                  )}
                  {img.duplicate && (
                    <div className="absolute top-1.5 right-1.5 bg-black/70 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
                      DUP
                    </div>
                  )}
                </button>

                {/* Label + category controls below image */}
                <div className="p-1.5 space-y-1 bg-black/80">
                  <input
                    className="w-full bg-transparent text-white text-xs font-bold truncate outline-none"
                    value={img.label}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setImages((imgs) =>
                      imgs.map((i, i2) => i2 === idx ? { ...i, label: e.target.value } : i)
                    )}
                  />
                  {/* Per-image category selector */}
                  {!img.duplicate && (
                    <div className="grid grid-cols-4 gap-0.5">
                      {TEMPLATE_CATEGORIES.map((cat) => (
                        <button
                          key={cat}
                          onClick={(e) => {
                            e.stopPropagation();
                            setImages((imgs) =>
                              imgs.map((i, i2) => i2 === idx ? { ...i, category: cat } : i)
                            );
                          }}
                          className={`h-6 rounded text-[10px] font-black transition ${
                            img.category === cat
                              ? "text-primary-foreground"
                              : "bg-white/10 text-white/50 hover:text-white/80"
                          }`}
                          style={img.category === cat ? { background: "var(--gradient-hero)" } : {}}
                          title={cat}
                        >
                          {CAT_EMOJI[cat]}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Template Gallery Panel ───────────────────────────────────────────────────
type SavedTemplate = { id: string; url: string; label: string; category: string; created_at: string };

const CAT_EMOJI: Record<string, string> = Object.fromEntries(CATEGORIES.map(c => [c.value, c.icon]));

function TemplateCard({ t, onDelete, onCategoryChange }: {
  t: SavedTemplate;
  onDelete: (id: string) => void;
  onCategoryChange: (id: string, newCategory: string) => void;
}) {
  const [label, setLabel] = useState(t.label);
  const [category, setCategory] = useState(t.category);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [hidden, setHidden] = useState(false); // hide immediately on category change

  const save = async (newLabel: string, newCategory: string) => {
    if (newLabel === t.label && newCategory === t.category) return;
    setSaving(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("template_images")
      .update({ label: newLabel, category: newCategory })
      .eq("id", t.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      // revert local state on error
      setCategory(t.category);
      return;
    }
    toast.success("Saved");
    if (newCategory !== t.category) {
      setHidden(true); // remove from current view immediately
      onCategoryChange(t.id, newCategory);
    }
  };

  if (hidden) return null;

  const handleDelete = async () => {
    setDeleting(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("template_images").delete().eq("id", t.id);
    setDeleting(false);
    if (error) { toast.error(error.message); return; }
    onDelete(t.id);
  };

  return (
    <div
      className="relative rounded-xl overflow-hidden border border-border group"
      style={{ background: "var(--gradient-card)" }}
    >
      <div className="aspect-[3/4] relative">
        <img
          src={t.url}
          alt={label}
          className="absolute inset-0 w-full h-full object-cover"
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
        {/* Saving indicator */}
        {saving && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <Loader2 className="h-5 w-5 animate-spin text-white" />
          </div>
        )}
        {/* Delete button */}
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="absolute top-1.5 right-1.5 h-7 w-7 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center transition shadow-lg"
          title="Delete template"
        >
          {deleting
            ? <Loader2 className="h-3.5 w-3.5 animate-spin text-white" />
            : <Trash2 className="h-3.5 w-3.5 text-white" />}
        </button>
      </div>

      {/* Editable label + category */}
      <div className="px-1.5 pt-1 pb-1.5 bg-black/85 space-y-1">
        {/* Label — inline editable, up to 3 lines */}
        <textarea
          className="w-full bg-transparent text-white text-xs font-bold outline-none border-b border-transparent focus:border-primary/60 transition resize-none leading-tight"
          style={{ minHeight: "1.2em", maxHeight: "3.6em", overflow: "hidden" }}
          rows={1}
          value={label}
          onChange={(e) => {
            setLabel(e.target.value);
            // Auto-grow up to 3 lines
            e.target.style.height = "auto";
            e.target.style.height = Math.min(e.target.scrollHeight, 57) + "px";
          }}
          onFocus={(e) => {
            e.target.style.height = "auto";
            e.target.style.height = Math.min(e.target.scrollHeight, 57) + "px";
          }}
          onBlur={() => save(label, category)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); } }}
          title="Click to edit name"
        />
        {/* Category — 4 emoji buttons */}
        <div className="grid grid-cols-4 gap-0.5">
          {TEMPLATE_CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => {
                setCategory(cat);
                save(label, cat);
              }}
              className={`h-5 rounded text-[10px] font-black transition ${
                category === cat
                  ? "text-primary-foreground"
                  : "bg-white/10 text-white/40 hover:text-white/70"
              }`}
              style={category === cat ? { background: "var(--gradient-hero)" } : {}}
              title={cat}
            >
              {CAT_EMOJI[cat]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function TemplateGalleryPanel() {
  const [templates, setTemplates] = useState<SavedTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCat, setFilterCat] = useState<TemplateCategory>("beers");
  const [fixing, setFixing] = useState(false);

  const load = async () => {
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("template_images")
      .select("id, url, label, category, created_at")
      .order("category", { ascending: true })
      .order("label", { ascending: true });
    setTemplates((data ?? []) as SavedTemplate[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Fix all titles: decode entities + clean labels in one batch
  const handleFixAllTitles = async () => {
    setFixing(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("template_images")
      .select("id, url, label");

    const all = (data ?? []) as { id: string; url: string; label: string }[];
    const toUpdate = all
      .map((t) => ({ id: t.id, cleaned: decodeAndCleanLabel(t.label, t.url) }))
      .filter((t) => t.cleaned !== all.find((a) => a.id === t.id)?.label);

    if (toUpdate.length === 0) {
      toast.success("All titles are already clean!");
      setFixing(false);
      return;
    }

    // Update in batches of 50
    let updated = 0;
    for (const item of toUpdate) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("template_images")
        .update({ label: item.cleaned })
        .eq("id", item.id);
      updated++;
    }

    setFixing(false);
    toast.success(`Fixed ${updated} title${updated !== 1 ? "s" : ""}`);
    load(); // refresh gallery
  };

  const visible = templates.filter((t) => t.category === filterCat);

  const counts = templates.reduce<Record<string, number>>((acc, t) => {
    acc[t.category] = (acc[t.category] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {/* Category filter tabs — sticky below header */}
      <div className="sticky top-[88px] z-10 -mx-3 px-3 py-2 bg-background/95 backdrop-blur border-b border-border">
        <div className="grid grid-cols-5 gap-2">
          {TEMPLATE_CATEGORIES.map((cat) => {
            const catDef = CATEGORIES.find(c => c.value === cat);
            return (
              <button
                key={cat}
                onClick={() => setFilterCat(cat)}
                className={`h-14 rounded-xl font-bold text-2xl transition border ${
                  filterCat === cat
                    ? "text-primary-foreground border-transparent"
                    : "bg-muted text-muted-foreground border-border hover:text-foreground"
                }`}
                style={filterCat === cat ? { background: "var(--gradient-hero)" } : {}}
                title={`${catDef?.label ?? cat} (${counts[cat] ?? 0})`}
              >
                {CAT_EMOJI[cat]}
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
          <LayoutGrid className="h-10 w-10 opacity-30" />
          <p className="text-sm">No templates yet. Use the Import tab to add some.</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2">
          {visible.map((t) => (
            <TemplateCard
              key={t.id}
              t={t}
              onDelete={(id) => setTemplates((prev) => prev.filter((x) => x.id !== id))}
              onCategoryChange={(id, newCat) =>
                setTemplates((prev) => prev.map((x) => x.id === id ? { ...x, category: newCat } : x))
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Admin Page ──────────────────────────────────────────────────────────
export default function AdminPage() {
  const { profile, loading, signOut } = useAuth();
  const nav = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [nearExpiryCount, setNearExpiryCount] = useState(0);

  useEffect(() => {
    if (!loading && profile && profile.role !== "admin") {
      // Admin-only web: sign out non-admin users
      signOut().then(() => nav("/login", { replace: true }));
    }
  }, [profile, loading, nav, signOut]);

  const refresh = async () => {
    setBusy(true);
    try {
      const data = await listAllProfiles();
      setRows((data ?? []).filter((r) => r.role === "owner") as Row[]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Calculate near-expiry count for approved users
  useEffect(() => {
    const checkNearExpiry = async () => {
      const approvedUsers = rows.filter(r => r.status === "approved");
      let count = 0;
      
      for (const user of approvedUsers) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("subscription_end_date")
          .eq("id", user.id)
          .single();
        
        if (profileData?.subscription_end_date) {
          const dueDate = new Date(profileData.subscription_end_date);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const daysUntil = Math.ceil((dueDate.getTime() - today.getTime()) / 86400000);
          
          if (daysUntil <= 7) {
            count++;
          }
        }
      }
      
      setNearExpiryCount(count);
    };
    
    if (rows.length > 0) {
      checkNearExpiry();
    }
  }, [rows]);

  useEffect(() => {
    if (profile?.role !== "admin") return;
    refresh();

    const ch = supabase
      .channel("admin-profiles")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => refresh())
      .subscribe();

    const poll = setInterval(refresh, 10_000);
    return () => { supabase.removeChannel(ch); clearInterval(poll); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.role]);

  const buckets = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = needle
      ? rows.filter((r) => r.username.toLowerCase().includes(needle) || r.email.toLowerCase().includes(needle))
      : rows;
    return {
      pending: filtered.filter((r) => r.status === "pending"),
      approved: filtered.filter((r) => r.status === "approved"),
      suspended: filtered.filter((r) => r.status === "suspended"),
      expelled: filtered.filter((r) => r.status === "expelled"),
    };
  }, [rows, q]);

  const act = async (fn: () => Promise<unknown>, msg: string) => {
    try { await fn(); toast.success(msg); await refresh(); }
    catch (e) { toast.error((e as Error).message); }
  };

  if (loading || !profile) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }
  if (profile.role !== "admin") return null;

  return (
    <div className="space-y-6">
      {/* Sticky page title */}
      <div className="sticky top-[44px] z-20 -mx-3 px-3 pt-2 pb-2 bg-background/95 backdrop-blur border-b border-border">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-black leading-tight">Admin</h1>
        </div>
      </div>

      <Tabs defaultValue="users">
        <TabsList className="grid grid-cols-3 w-full">
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="import">Import</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-4 mt-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by username or email…"
              className="pl-9"
            />
          </div>

          <Tabs defaultValue="pending">
            <TabsList className="grid grid-cols-4 w-full">
              <TabsTrigger value="pending" className="gap-1 sm:gap-2 relative">
                <span className="hidden sm:inline">Pending</span>
                <span className="sm:hidden text-lg">⏳</span>
                {buckets.pending.length > 0 && (
                  <Badge variant="default" className="rounded-full px-1.5 py-0 text-xs min-w-[20px] h-5 flex items-center justify-center bg-red-500 text-white">
                    {buckets.pending.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="approved" className="gap-1 sm:gap-2">
                <span className="hidden sm:inline">Approved</span>
                <span className="sm:hidden text-lg">✅</span>
                {nearExpiryCount > 0 && (
                  <Badge variant="destructive" className="rounded-full px-1.5 py-0 text-xs min-w-[20px] h-5 flex items-center justify-center hidden sm:flex">
                    {nearExpiryCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="suspended" className="gap-1 sm:gap-2">
                <span className="hidden sm:inline">Suspended</span>
                <span className="sm:hidden text-lg">⛔</span>
                {buckets.suspended.length > 0 && (
                  <Badge variant="default" className="rounded-full px-1.5 py-0 text-xs min-w-[20px] h-5 flex items-center justify-center bg-orange-500 text-white">
                    {buckets.suspended.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="expelled" className="gap-1 sm:gap-2">
                <span className="hidden sm:inline">Expelled</span>
                <span className="sm:hidden text-lg">🚫</span>
              </TabsTrigger>
            </TabsList>

            {(["pending", "approved", "suspended", "expelled"] as const).map((k) => (
              <TabsContent key={k} value={k} className="mt-4 space-y-3">
                {buckets[k].length === 0 && (
                  <p className="text-sm text-muted-foreground py-8 text-center">No {k} users</p>
                )}
                {buckets[k].map((r) => (
                  <div key={r.id} className="flex flex-col gap-3 p-4 rounded-xl border border-border bg-card">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold">{r.username}</div>
                        <div className="text-xs text-muted-foreground truncate">{r.email}</div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {k === "pending" && (
                          <span className="text-sm text-muted-foreground">Awaiting payment approval in Billing tab</span>
                        )}
                        {k === "approved" && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => act(() => setUserStatus(r.id, "suspended"), "Suspended")}>
                              <Ban className="h-4 w-4 mr-1" /> Suspend
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => act(() => setUserStatus(r.id, "expelled"), "Expelled")}>
                              <UserMinus className="h-4 w-4 mr-1" /> Expel
                            </Button>
                            <Button size="sm" variant="destructive" onClick={async () => {
                              const ok = await confirm({
                                title: `Delete ${r.username}?`,
                                description: "This cannot be undone.",
                                confirmLabel: "Delete",
                                destructive: true,
                              });
                              if (ok) act(() => adminDeleteUser(r.id), "Deleted");
                            }}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        {k === "suspended" && (
                          <>
                            <Button size="sm" onClick={() => act(() => setUserStatus(r.id, "approved"), "Re-activated")}>
                              <RotateCw className="h-4 w-4 mr-1" /> Re-activate
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => act(() => setUserStatus(r.id, "expelled"), "Expelled")}>
                              <UserMinus className="h-4 w-4 mr-1" /> Expel
                            </Button>
                            <Button size="sm" variant="destructive" onClick={async () => {
                              const ok = await confirm({
                                title: `Delete ${r.username}?`,
                                description: "This cannot be undone.",
                                confirmLabel: "Delete",
                                destructive: true,
                              });
                              if (ok) act(() => adminDeleteUser(r.id), "Deleted");
                            }}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        {k === "expelled" && (
                          <span className="text-xs text-muted-foreground">Account expelled - no actions available</span>
                        )}
                      </div>
                    </div>
                    {/* Subscription reminder — show for approved/suspended users */}
                    {(k === "approved" || k === "suspended") && (
                      <SubscriptionBadge ownerId={r.id} />
                    )}
                  </div>
                ))}
              </TabsContent>
            ))}
          </Tabs>
          {busy && <div className="text-xs text-muted-foreground">Loading…</div>}
        </TabsContent>

        <TabsContent value="import" className="mt-4">
          <TemplateImportPanel />
        </TabsContent>

        <TabsContent value="templates" className="mt-4">
          <TemplateGalleryPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
