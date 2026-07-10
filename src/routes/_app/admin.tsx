import { useEffect, useMemo, useState, useCallback, useRef } from "react";
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
  Youtube, Key, BarChart3, RefreshCw, CheckCircle2, XCircle, Zap, Camera, Plus, GitBranch,
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
  phone: string | null;
  address: string | null;
  plan_type?: string;
  chain_bar_count?: number;
  is_bar_account?: boolean;
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
  return d.toLocaleDateString("en-GB", { month: "short", day: "numeric", year: "numeric" });
}

// ─── Subscription Badge ───────────────────────────────────────────────────────
// ─── Annual Fee Badge — shown big on right of card ───────────────────────────
function AnnualFeeBadge({ ownerId }: { ownerId: string }) {
  const [amount, setAmount] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const { data: payments } = await supabase
        .from("billing_payments")
        .select("plan_id")
        .eq("owner_id", ownerId)
        .eq("status", "paid")
        .order("paid_at", { ascending: false })
        .limit(1);
      if (!payments?.length) return;
      const { data: plan } = await supabase
        .from("billing_plans")
        .select("amount")
        .eq("id", payments[0].plan_id)
        .single();
      if (plan) setAmount(plan.amount);
    })();
  }, [ownerId]);

  if (amount === null) return null;
  return (
    <div className="shrink-0 text-right self-start">
      <div className="text-2xl font-black text-white leading-none">${amount.toFixed(0)}</div>
      <div className="text-[10px] text-white/60 font-bold mt-0.5">TT / yr</div>
    </div>
  );
}

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
        Due {formatDate(dueDate)}{isNearExpiry && ` (${daysUntil}d)`}
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
  const [clipboardText, setClipboardText] = useState<string>("");

  // Check clipboard content — runs on mount and whenever app regains focus
  const checkClipboard = async () => {
    try {
      const { Capacitor } = await import("@capacitor/core");
      if (Capacitor.isNativePlatform()) {
        const { Clipboard } = await import("@capacitor/clipboard");
        const { value } = await Clipboard.read();
        setClipboardText(value?.trim() ?? "");
      } else if (navigator.clipboard?.readText) {
        const text = await navigator.clipboard.readText();
        setClipboardText(text?.trim() ?? "");
      }
    } catch {
      setClipboardText("");
    }
  };

  useEffect(() => {
    checkClipboard();
    const onFocus = () => checkClipboard();
    const onVisible = () => { if (document.visibilityState === "visible") checkClipboard(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // Paste from clipboard into the URL field
  const pasteFromClipboard = async () => {
    try {
      const { Capacitor } = await import("@capacitor/core");
      if (Capacitor.isNativePlatform()) {
        const { Clipboard } = await import("@capacitor/clipboard");
        const { value } = await Clipboard.read();
        if (value) { setPageUrl(value.trim()); setClipboardText(value.trim()); }
      } else if (navigator.clipboard?.readText) {
        const text = await navigator.clipboard.readText();
        if (text) { setPageUrl(text.trim()); setClipboardText(text.trim()); }
      }
    } catch {
      toast.error("Could not read clipboard");
    }
  };

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

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

    // Download and store each image in Supabase storage so broken source URLs can't affect us
    const rows = await Promise.all(toSave.map(async (i) => {
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/cache-template-image`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseKey}`, "apikey": supabaseKey },
          body: JSON.stringify({ url: i.url }),
          signal: AbortSignal.timeout(20000),
        });
        const json = await res.json() as { storedUrl?: string; error?: string };
        return {
          url: json.storedUrl ?? i.url, // fall back to original if caching failed
          label: i.label,
          category: i.category,
          source_url: pageUrl.trim(),
        };
      } catch {
        // Network error — fall back to original URL
        return { url: i.url, label: i.label, category: i.category, source_url: pageUrl.trim() };
      }
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

  const [recaching, setRecaching] = useState(false);
  const [recacheResult, setRecacheResult] = useState<string | null>(null);

  const handleRecacheAll = async () => {
    setRecaching(true);
    setRecacheResult(null);
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/backfill-template-images`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseKey}`, "apikey": supabaseKey },
        signal: AbortSignal.timeout(120000),
      });
      const json = await res.json() as { templates?: { total: number; success: number; failed: number }; products?: { total: number; success: number; failed: number } };
      const t = json.templates ?? { total: 0, success: 0, failed: 0 };
      const p = json.products  ?? { total: 0, success: 0, failed: 0 };
      setRecacheResult(`Templates: ${t.success}/${t.total} fixed. Products: ${p.success}/${p.total} fixed.`);
      toast.success("Re-cache complete");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRecaching(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* ── Re-cache broken images ── */}
      <div className="rounded-2xl p-4 border border-amber-500/30 space-y-3" style={{ background: "rgba(245,158,11,0.06)" }}>
        <h2 className="font-black text-sm flex items-center gap-2 text-amber-400">
          <RefreshCw className="h-4 w-4" /> Fix Broken Images
        </h2>
        <p className="text-xs text-muted-foreground">
          Re-downloads all external template and product images into Supabase storage. Run this once to fix images that show broken on devices.
        </p>
        <Button
          onClick={handleRecacheAll}
          disabled={recaching}
          variant="outline"
          className="border-amber-500/40 text-amber-400 hover:bg-amber-500/10 font-bold"
        >
          {recaching ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Re-caching all images…</> : "Re-cache All Images Now"}
        </Button>
        {recacheResult && <p className="text-xs text-green-400 font-semibold">{recacheResult}</p>}
      </div>

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
                onPaste={async (e) => {
                  // Try native clipboard data first
                  const text = e.clipboardData?.getData("text");
                  if (text) {
                    e.preventDefault();
                    setPageUrl(text.trim());
                    return;
                  }
                  // Fallback: Capacitor clipboard (Android WebView often has empty clipboardData)
                  e.preventDefault();
                  await pasteFromClipboard();
                }}
                placeholder="https://example.com/products"
                className="pl-9"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                onKeyDown={(e) => e.key === "Enter" && handleImport()}
              />
            </div>
            {/* Explicit Paste button for Android users — only enabled when clipboard has content */}
            <Button
              type="button"
              variant="outline"
              onClick={pasteFromClipboard}
              disabled={!clipboardText}
              className="shrink-0 px-3"
              title={clipboardText ? `Paste: ${clipboardText.slice(0, 40)}${clipboardText.length > 40 ? "…" : ""}` : "Nothing copied"}
            >
              <LinkIcon className="h-4 w-4" />
            </Button>
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
                {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Caching images…</> : `Save ${selectedCount}`}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
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
    const ok = await confirm({
      title: "Delete Template?",
      description: `"${label}" will be permanently removed. This cannot be undone.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
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

// ─── Add Template Modal ───────────────────────────────────────────────────────
function AddTemplateModal({ onDone }: { onDone: () => void }) {
  const [name, setName]         = useState("");
  const [category, setCategory] = useState<string>("beers");
  const [file, setFile]         = useState<File | null>(null);
  const [preview, setPreview]   = useState<string | null>(null);
  const [busy, setBusy]         = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef  = useRef<HTMLInputElement>(null);

  const onPick = (f: File | undefined | null) => {
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const clearImage = () => { setFile(null); setPreview(null); };

  const submit = async () => {
    if (!name.trim()) { toast.error("Enter a title"); return; }
    setBusy(true);
    let url: string | null = null;
    if (file) {
      const ext  = file.name.split(".").pop() || "jpg";
      const path = `templates/manual/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("product-images")
        .upload(path, file, { upsert: false });
      if (upErr) { toast.error(upErr.message); setBusy(false); return; }
      url = supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("template_images").insert({
      url: url ?? `manual:${crypto.randomUUID()}`,
      label: name.trim(),
      category,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Template added");
    onDone();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm"
      onClick={onDone}>
      <div className="w-full max-w-md rounded-t-3xl border border-border shadow-2xl"
        style={{ background: "var(--gradient-card)" }}
        onClick={(e) => e.stopPropagation()}>

        {/* Handle */}
        <div className="w-10 h-1 rounded-full mx-auto mt-3 mb-1" style={{ background: "rgba(255,255,255,0.15)" }} />

        <div className="flex items-center justify-between px-5 pt-2 pb-3">
          <span className="font-black text-base">Add Template</span>
          <button onClick={onDone}
            className="h-8 w-8 rounded-full flex items-center justify-center bg-muted hover:bg-muted/80 transition">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 pb-6 space-y-4 max-h-[80vh] overflow-y-auto">

          {/* Image area */}
          <div className="flex gap-3 items-stretch">
            {/* Preview box */}
            <div className="relative w-1/2 aspect-[3/4] rounded-xl border-2 border-dashed border-border overflow-hidden shrink-0"
              style={{ background: "var(--gradient-card)" }}>
              {preview
                ? <img src={preview} className="absolute inset-0 w-full h-full object-cover" alt="preview" />
                : <div className="absolute inset-0 flex items-center justify-center"><ImagePlus className="h-8 w-8 text-muted-foreground/40" /></div>
              }
              {preview && (
                <button onClick={clearImage}
                  className="absolute top-1.5 right-1.5 bg-black/60 text-white rounded-full p-1">
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
              <input ref={camRef} type="file" accept="image/*" capture="environment" hidden
                onChange={(e) => onPick(e.target.files?.[0])} />
              <input ref={fileRef} type="file" accept="image/*" hidden
                onChange={(e) => onPick(e.target.files?.[0])} />
            </div>

            {/* Action buttons */}
            <div className="flex flex-col gap-2 flex-1 justify-center">
              <Button type="button" variant="secondary" className="w-full h-14 text-sm font-bold"
                onClick={() => camRef.current?.click()}>
                <Camera className="h-5 w-5 mr-2" /> Take Photo
              </Button>
              <Button type="button" variant="secondary" className="w-full h-14 text-sm font-bold"
                onClick={() => fileRef.current?.click()}>
                <ImagePlus className="h-5 w-5 mr-2" /> Upload Photo
              </Button>
            </div>
          </div>

          {/* Category */}
          <div>
            <Label className="text-xs mb-1.5 block">Category</Label>
            <div className="grid grid-cols-5 gap-2">
              {CATEGORIES.map((cat) => (
                <button key={cat.value} type="button"
                  onClick={() => setCategory(cat.value)}
                  className={`h-14 rounded-xl font-bold text-2xl transition ${
                    category === cat.value ? "text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                  style={category === cat.value ? { background: "var(--gradient-hero)" } : {}}
                  title={cat.label}>
                  {cat.icon}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <Label className="text-xs mb-1.5 block">Title</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Heineken 330ml"
              className="h-11" />
          </div>

          {/* Save */}
          <Button
            className="w-full h-12 font-black text-base"
            disabled={!name.trim() || busy}
            onClick={submit}
            style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Template"}
          </Button>
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
  const [addOpen, setAddOpen] = useState(false);

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
      {/* Category filter tabs — sticky below admin header */}
      <div className="sticky top-[48px] z-10 -mx-3 px-3 py-2 bg-background/95 backdrop-blur border-b border-border">
        <div className="grid grid-cols-5 gap-2 mb-2">
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
        {/* Add Template button */}
        <button
          onClick={() => setAddOpen(true)}
          className="w-full h-10 rounded-xl flex items-center justify-center gap-2 font-bold text-sm transition active:scale-[0.98] border-dashed border-2"
          style={{ borderColor: "var(--primary)", color: "var(--primary)" }}>
          <Plus className="h-4 w-4" /> Add Template
        </button>
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

      {addOpen && (
        <AddTemplateModal
          onDone={() => { setAddOpen(false); load(); }}
        />
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
  const [outerTab, setOuterTab] = useState("users");

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
      ? rows.filter((r) =>
          r.username.toLowerCase().includes(needle) ||
          r.email.toLowerCase().includes(needle) ||
          (r.phone ?? "").toLowerCase().includes(needle) ||
          (r.address ?? "").toLowerCase().includes(needle)
        )
      : rows;
    return {
      pending: filtered.filter((r) => r.status === "pending"),
      // Approved: hide bar sub-accounts (chain bars) — only show real account owners
      approved: filtered.filter((r) => r.status === "approved" && !r.is_bar_account),
      suspended: filtered.filter((r) => r.status === "suspended" && !r.is_bar_account),
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
      <div className="sticky top-0 z-20 -mx-3 px-3 pt-2 pb-2 bg-background/95 backdrop-blur border-b border-border">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-black leading-tight">Admin</h1>
        </div>
      </div>

      <Tabs value={outerTab} onValueChange={setOuterTab}>
        <TabsList className="grid grid-cols-4 w-full">
          {(["users","import","templates","youtube"] as const).map((tab) => (
            <TabsTrigger
              key={tab}
              value={tab}
              className="gap-1"
              style={outerTab !== tab ? { background: "transparent", boxShadow: "none", color: "var(--muted-foreground)" } : {}}
            >
              {tab === "youtube" ? <><Youtube className="h-3.5 w-3.5" /><span className="hidden sm:inline">YouTube</span></> : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </TabsTrigger>
          ))}
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
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold">{r.username}</span>
                          {r.plan_type === "chain" && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-400 border border-orange-500/30">
                              <GitBranch className="h-2.5 w-2.5" />
                              Chain · {r.chain_bar_count ?? 0} bar{(r.chain_bar_count ?? 0) !== 1 ? "s" : ""}
                            </span>
                          )}
                          {r.is_bar_account && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                              Sub-bar
                            </span>
                          )}
                        </div>
                        {r.email && (
                          <a
                            href={`mailto:${r.email}`}
                            className="text-xs text-primary hover:underline truncate block"
                            title={`Email ${r.username}`}
                          >
                            ✉ {r.email}
                          </a>
                        )}
                        {r.phone && (
                          <a
                            href={`tel:${r.phone}`}
                            className="inline-flex items-center gap-2 text-xs font-black text-black bg-primary border border-primary rounded-lg px-3 py-1.5 hover:opacity-90 transition active:scale-95"
                            title={`Call ${r.username}`}
                          >
                            📞 {r.phone}
                          </a>
                        )}
                        {r.address && (
                          <div className="text-xs text-muted-foreground">
                            📍 {r.address}
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground">
                          Joined {new Date(r.created_at).toLocaleDateString("en-GB", { month: "short", day: "numeric", year: "numeric" })}
                        </div>
                      </div>
                      {/* Annual fee — fetched by SubscriptionBadge, shown big on right */}
                      {(k === "approved" || k === "suspended") && (
                        <AnnualFeeBadge ownerId={r.id} />
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {k === "pending" && (
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">Awaiting payment approval in Billing tab</span>
                            <Button size="sm" variant="destructive" onClick={async () => {
                              const ok = await confirm({
                                title: `Delete ${r.username}?`,
                                description: "This will permanently remove this account. Cannot be undone.",
                                confirmLabel: "Delete",
                                destructive: true,
                              });
                              if (ok) act(() => adminDeleteUser(r.id), "Deleted");
                            }}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
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

        <TabsContent value="youtube" className="mt-4">
          <YouTubeAdminPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── YouTube Admin Panel ──────────────────────────────────────────────────────

type YtKeySlot = {
  slot: number;
  label: string;
  enabled: boolean;
  daily_limit: number;
  used_today: number;
  exhausted: boolean;
  last_used_at: string | null;
  reset_at: string | null;
};

type YtStats = {
  searches_today: number;
  successful_today: number;
  failed_today: number;
  quota_used_today: number;
  quota_remaining: number;
  active_keys: number;
  total_keys: number;
  unique_users_today: number;
};

type YtRecentSearch = {
  id: string;
  query: string;
  type: string;
  key_slot: number | null;
  success: boolean;
  error_code: string | null;
  created_at: string;
};

function YouTubeAdminPanel() {
  const [keys,    setKeys   ] = useState<YtKeySlot[]>([]);
  const [stats,   setStats  ] = useState<YtStats | null>(null);
  const [recent,  setRecent ] = useState<YtRecentSearch[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving ] = useState<number | null>(null); // slot being saved

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [keysRes, statsRes, recentRes] = await Promise.all([
        supabase.from("youtube_api_keys").select("*").order("slot"),
        supabase.rpc("get_youtube_daily_stats").single(),
        supabase
          .from("youtube_search_log")
          .select("id, query, type, key_slot, success, error_code, created_at")
          .order("created_at", { ascending: false })
          .limit(20),
      ]);
      if (keysRes.data)    setKeys(keysRes.data as YtKeySlot[]);
      if (statsRes.data)   setStats(statsRes.data as YtStats);
      if (recentRes.data)  setRecent(recentRes.data as YtRecentSearch[]);
    } catch (e) {
      toast.error("Failed to load YouTube stats");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleSlot = async (slot: number, enabled: boolean) => {
    setSaving(slot);
    const { error } = await supabase
      .from("youtube_api_keys")
      .update({ enabled })
      .eq("slot", slot);
    if (error) toast.error(error.message);
    else { toast.success(`Slot ${slot} ${enabled ? "enabled" : "disabled"}`); await load(); }
    setSaving(null);
  };

  const updateLabel = async (slot: number, label: string) => {
    setSaving(slot);
    const { error } = await supabase
      .from("youtube_api_keys")
      .update({ label })
      .eq("slot", slot);
    if (error) toast.error(error.message);
    else await load();
    setSaving(null);
  };

  const resetCounts = async () => {
    const ok = await confirm({
      title: "Reset all key counts?",
      description: "This manually resets the daily search counters for all keys. Use only if the daily cron hasn't run yet.",
      confirmLabel: "Reset",
    });
    if (!ok) return;
    const { error } = await supabase.rpc("reset_youtube_key_counts");
    if (error) toast.error(error.message);
    else { toast.success("Counters reset"); await load(); }
  };

  const totalCapacity = keys.filter(k => k.enabled).reduce((s, k) => s + k.daily_limit, 0);
  const totalUsed     = stats?.quota_used_today ?? 0;
  const pctUsed       = totalCapacity > 0 ? (totalUsed / totalCapacity) * 100 : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── Daily Summary ────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-black text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-red-400" />
            Today's Usage
          </h2>
          <Button size="sm" variant="outline" onClick={load} className="gap-1.5 h-8 text-xs">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        </div>

        {/* Big stat cards */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="rounded-xl p-4 border border-border bg-card space-y-1">
            <p className="text-xs text-muted-foreground font-medium">Searches Today</p>
            <p className="text-3xl font-black">{stats?.searches_today ?? 0}</p>
            <p className="text-xs text-muted-foreground">
              {stats?.unique_users_today ?? 0} user{stats?.unique_users_today !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="rounded-xl p-4 border border-border bg-card space-y-1">
            <p className="text-xs text-muted-foreground font-medium">Quota Remaining</p>
            <p className="text-3xl font-black text-green-400">
              {(stats?.quota_remaining ?? 0).toLocaleString("en-GB")}
            </p>
            <p className="text-xs text-muted-foreground">
              of {totalCapacity.toLocaleString("en-GB")} total
            </p>
          </div>
        </div>

        {/* Overall progress bar */}
        <div className="rounded-xl p-4 border border-border bg-card space-y-2">
          <div className="flex items-center justify-between text-xs font-medium">
            <span className="text-muted-foreground">Daily quota used</span>
            <span className={pctUsed > 85 ? "text-red-400" : pctUsed > 60 ? "text-yellow-400" : "text-green-400"}>
              {pctUsed.toFixed(1)}%
            </span>
          </div>
          <div className="h-3 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min(pctUsed, 100)}%`,
                background: pctUsed > 85 ? "#ef4444" : pctUsed > 60 ? "#eab308" : "#22c55e",
              }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>{totalUsed.toLocaleString("en-GB")} used</span>
            <span>
              <span className="text-green-400">{stats?.successful_today ?? 0} ok</span>
              {(stats?.failed_today ?? 0) > 0 && (
                <span className="text-red-400 ml-2">{stats?.failed_today} failed</span>
              )}
            </span>
            <span>{stats?.active_keys ?? 0}/{stats?.total_keys ?? 0} keys active</span>
          </div>
        </div>
      </div>

      {/* ── Key Pool ─────────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-black text-base flex items-center gap-2">
            <Key className="h-4 w-4 text-yellow-400" />
            API Key Pool
          </h2>
          <Button size="sm" variant="outline" onClick={resetCounts} className="gap-1.5 h-8 text-xs text-orange-400 border-orange-400/30">
            <RefreshCw className="h-3.5 w-3.5" /> Reset Counts
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Keys are stored as Supabase secrets <code className="text-xs bg-muted px-1 rounded">YOUTUBE_API_KEY_1</code> … <code className="text-xs bg-muted px-1 rounded">YOUTUBE_API_KEY_25</code>. Enable each slot once the secret is set.
        </p>

        <div className="space-y-2">
          {keys.map(key => {
            const pct = key.daily_limit > 0 ? (key.used_today / key.daily_limit) * 100 : 0;
            return (
              <div key={key.slot}
                className={`rounded-xl border p-3 space-y-2 transition ${
                  key.exhausted ? "border-red-500/30 bg-red-500/5"
                  : key.enabled  ? "border-green-500/20 bg-green-500/5"
                  : "border-border bg-card"
                }`}>
                <div className="flex items-center gap-3">
                  {/* Slot number */}
                  <div className={`h-8 w-8 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${
                    key.exhausted ? "bg-red-500/20 text-red-400"
                    : key.enabled  ? "bg-green-500/20 text-green-400"
                    : "bg-muted text-muted-foreground"
                  }`}>
                    {key.slot === 0 ? "★" : key.slot}
                  </div>

                  {/* Label (editable) */}
                  <Input
                    defaultValue={key.label}
                    onBlur={e => { if (e.target.value !== key.label) updateLabel(key.slot, e.target.value); }}
                    placeholder={key.slot === 0 ? "YOUTUBE_API_KEY (Primary)" : `YOUTUBE_API_KEY_${key.slot}`}
                    className="h-7 text-xs flex-1 bg-transparent border-muted"
                  />

                  {/* Status badge */}
                  {key.exhausted && (
                    <Badge variant="destructive" className="text-[10px] shrink-0">Exhausted</Badge>
                  )}

                  {/* Enable/disable toggle */}
                  <button
                    onClick={() => toggleSlot(key.slot, !key.enabled)}
                    disabled={saving === key.slot}
                    className={`h-7 px-3 rounded-lg text-xs font-bold transition shrink-0 ${
                      key.enabled
                        ? "bg-green-500/20 text-green-400 hover:bg-red-500/20 hover:text-red-400"
                        : "bg-muted text-muted-foreground hover:bg-green-500/20 hover:text-green-400"
                    }`}
                  >
                    {saving === key.slot
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : key.enabled ? "On" : "Off"
                    }
                  </button>
                </div>

                {/* Usage bar — only show when enabled */}
                {key.enabled && (
                  <div className="space-y-1">
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(pct, 100)}%`,
                          background: key.exhausted ? "#ef4444" : pct > 80 ? "#eab308" : "#22c55e",
                        }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>{key.used_today.toLocaleString("en-GB")} / {key.daily_limit.toLocaleString("en-GB")}</span>
                      <span>{pct.toFixed(1)}%</span>
                      {key.last_used_at && (
                        <span>Last: {new Date(key.last_used_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Recent Searches ───────────────────────────────────────────────── */}
      {recent.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-black text-base flex items-center gap-2">
              <Search className="h-4 w-4 text-blue-400" />
              Recent Searches
            </h2>
            <Button size="sm" variant="outline"
              className="gap-1.5 h-8 text-xs text-red-400 border-red-400/30 hover:bg-red-400/10"
              onClick={async () => {
                const ok = await confirm({
                  title: "Clear Search Log?",
                  description: "This will permanently delete all recent search history. Stats for today will still show.",
                  confirmLabel: "Clear",
                  destructive: true,
                });
                if (!ok) return;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await (supabase as any).from("youtube_search_log").delete().neq("id", "00000000-0000-0000-0000-000000000000");
                await load();
              }}>
              <Trash2 className="h-3.5 w-3.5" /> Clear Log
            </Button>
          </div>
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="divide-y divide-border">
              {recent.map(s => (
                <div key={s.id} className="flex items-center gap-3 px-3 py-2.5">
                  {s.success
                    ? <CheckCircle2 className="h-3.5 w-3.5 text-green-400 shrink-0" />
                    : <XCircle     className="h-3.5 w-3.5 text-red-400 shrink-0" />
                  }
                  <span className="flex-1 text-xs text-foreground truncate">{s.query}</span>
                  {s.key_slot && (
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      Key {s.key_slot}
                    </span>
                  )}
                  {s.error_code && (
                    <span className="text-[10px] text-red-400 shrink-0">{s.error_code}</span>
                  )}
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {new Date(s.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Setup Guide ──────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4 space-y-2">
        <p className="text-yellow-400 text-sm font-black flex items-center gap-2">
          <Zap className="h-4 w-4" /> Setup Checklist
        </p>
        <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
          <li>Get a free YouTube Data API v3 key from <span className="text-primary">console.cloud.google.com</span></li>
          <li>Run: <code className="bg-muted px-1 rounded">supabase secrets set YOUTUBE_API_KEY_1=AIzaSy...</code></li>
          <li>Repeat for each key (up to YOUTUBE_API_KEY_25)</li>
          <li>Toggle each slot <span className="text-green-400 font-bold">On</span> in the table above</li>
          <li>Run: <code className="bg-muted px-1 rounded">supabase functions deploy youtube-search</code></li>
          <li>Set up daily cron: <code className="bg-muted px-1 rounded">SELECT cron.schedule('reset-youtube-keys', '0 0 * * *', 'SELECT public.reset_youtube_key_counts()')</code></li>
        </ol>
      </div>
    </div>
  );
}
