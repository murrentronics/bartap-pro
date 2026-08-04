import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import AdminBillingManagementPage from "@/pages/AdminBillingManagementPage";
import {
  listAllProfiles,
  setUserStatus,
  adminDeleteUser,
} from "@/lib/admin.functions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { CATEGORIES, type CategoryValue } from "@/lib/categories";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Check, X, Ban, UserMinus, RotateCw, RotateCcw, Trash2, Loader2,
  ShieldAlert, Search, ImagePlus, Link as LinkIcon, LayoutGrid, CalendarClock, AlertCircle,
  Youtube, Key, BarChart3, RefreshCw, CheckCircle2, XCircle, Zap, Camera, Plus, GitBranch,
  DollarSign, TrendingUp, Calendar, History,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { confirm } from "@/components/ui/confirm-dialog";

// ─── Shareholder Config ───────────────────────────────────────────────────────
const SHAREHOLDERS = [
  { name: "Renard Sankersingh", share: 0.8, color: "text-emerald-400", bg: "border-emerald-500/30", gradient: "linear-gradient(135deg, rgba(16,185,129,0.12), rgba(16,185,129,0.04))" },
  { name: "Theron Murren",      share: 0.2, color: "text-blue-400",    bg: "border-blue-500/30",    gradient: "linear-gradient(135deg, rgba(59,130,246,0.12), rgba(59,130,246,0.04))" },
] as const;

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

type MonthlyRecord = { year: number; month: number; total: number };
type ShareholderMonthly = { year: number; month: number; total: number; shares: number[] };

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
        .select("plan_id, amount")
        .eq("owner_id", ownerId)
        .eq("status", "paid")
        .order("created_at", { ascending: false })
        .limit(1);
      if (!payments?.length) return;
      // Use amount directly from payment row (faster, no extra query)
      if (payments[0].amount) {
        setAmount(Number(payments[0].amount));
        return;
      }
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

const TEMPLATE_CATEGORIES = CATEGORIES.filter(c => c.value !== "miscellaneous" && c.value !== "food").map(c => c.value) as CategoryValue[];
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

// ─── Template Import Panel (Image Link Scraper style) ────────────────────────
//
// How it works:
//  1. User pastes image URLs (one per line) or drags/pastes actual image files
//  2. All images land in a grid; each gets an editable name and a category badge
//  3. "Auto-Label All" calls @huggingface/transformers in the browser — no API key,
//     no server, no limits. Model (~40MB) downloads once and is cached forever.
//  4. Master category picker assigns every image at once; per-card picker overrides
//  5. "Add to Templates" saves selected images to template_images via cache-template-image
//
// Google Cloud Vision is the most reliable choice:
//  - WEB_DETECTION returns actual product names ("Heineken 330ml", "Marlboro Red")
//  - Works from public URLs and base64 data URIs (for local file drops)
//  - 1 000 free requests/month; ~$1.50/1 000 after — negligible for admin use
//  - No SDK, single REST call, no CORS (called via edge function)

type ScrapeItem = {
  id: string;           // local uuid — React key
  url: string;          // remote URL or object-URL for local files
  dataUri?: string;     // base64 data URI (for local files, sent to Vision)
  label: string;
  category: TemplateCategory;
  selected: boolean;
  duplicate: boolean;
  labeling: boolean;    // auto-label in progress
  labelSource?: "web" | "label" | "fallback"; // which Vision signal won
};

function TemplateImportPanel() {
  // ── State ──────────────────────────────────────────────────────────────────
  const [items, setItems] = useState<ScrapeItem[]>([]);
  const [existingUrls, setExistingUrls] = useState<Set<string>>(new Set());
  const [masterCategory, setMasterCategory] = useState<TemplateCategory>("beers");
  const [saving, setSaving] = useState(false);
  const [autoLabelingAll, setAutoLabelingAll] = useState(false);
  const [removingBg, setRemovingBg] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // ── Load existing template URLs to detect duplicates ─────────────────────
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("template_images")
      .select("url")
      .then(({ data }: { data: { url: string }[] | null }) => {
        setExistingUrls(new Set((data ?? []).map((r) => r.url)));
      });
  }, []);

  // ── Convert a file to base64 data URI (for Vision API) ────────────────────
  const fileToDataUri = (file: File): Promise<string> =>
    new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });

  // ── Add items from image files (dropped or picked) ────────────────────────
  const addFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (arr.length === 0) return;
    const newItems: ScrapeItem[] = await Promise.all(arr.map(async (f) => {
      const objectUrl = URL.createObjectURL(f);
      const dataUri = await fileToDataUri(f);
      const nameFromFile = f.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase()).trim();
      return {
        id: crypto.randomUUID(),
        url: objectUrl,
        dataUri,
        label: nameFromFile || "Untitled",
        category: masterCategory,
        selected: true,
        duplicate: false,
        labeling: false,
      };
    }));
    setItems((prev) => [...prev, ...newItems]);
  };

  // ── Add items from pasted / typed image URLs ───────────────────────────────
  const addUrls = (raw: string) => {
    const urls = raw
      .split(/[\n,\s]+/)
      .map((u) => u.trim())
      .filter((u) => u.startsWith("http") && /\.(jpg|jpeg|png|webp|gif|avif)(\?|$)/i.test(u));
    if (urls.length === 0) {
      toast.error("No image URLs found. URLs must end in .jpg/.png/.webp etc.");
      return;
    }
    const newItems: ScrapeItem[] = urls.map((u) => ({
      id: crypto.randomUUID(),
      url: u,
      label: u.split("/").pop()?.split("?")[0]?.replace(/[-_]/g, " ").replace(/\.\w+$/, "") || "Untitled",
      category: masterCategory,
      selected: !existingUrls.has(u),
      duplicate: existingUrls.has(u),
      labeling: false,
    }));
    setItems((prev) => [...prev, ...newItems]);
    toast.success(`Added ${newItems.length} image${newItems.length !== 1 ? "s" : ""}`);
  };

  // ── Global paste handler ───────────────────────────────────────────────────
  useEffect(() => {
    const onPaste = async (e: ClipboardEvent) => {
      // Files pasted (e.g. right-click copy image → paste)
      const imageFiles = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
      if (imageFiles.length > 0) {
        e.preventDefault();
        await addFiles(imageFiles);
        return;
      }
      // Text pasted — could be image URLs
      const text = e.clipboardData?.getData("text") ?? "";
      if (text && (text.includes("http") || text.includes("data:image"))) {
        e.preventDefault();
        addUrls(text);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [masterCategory, existingUrls]);

  // ── Auto-label one image — runs 100% in the browser, no API key needed ──
  // Uses @huggingface/transformers (ONNX/WASM) — same approach as Lovable's
  // "Auto-correct all names". Model downloads once (~40MB) then cached forever.
  const labelOneItem = async (id: string, url: string, dataUri?: string): Promise<void> => {
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, labeling: true } : i));
    try {
      const { labelImage } = await import("@/lib/labelImage");
      // Prefer the object URL (works for both local files and remote URLs).
      // dataUri is only passed when we have a base64 version — use url instead
      // since transformers.js handles blob: and https: URLs natively.
      const label = await labelImage(url);
      setItems((prev) => prev.map((i) => i.id === id
        ? { ...i, label: decodeAndCleanLabel(label, url), labelSource: "web", labeling: false }
        : i
      ));
    } catch {
      setItems((prev) => prev.map((i) => i.id === id ? { ...i, labeling: false } : i));
    }
  };

  // ── Auto-label ALL images in parallel (3 at a time) ─────────────────────
  const handleAutoLabelAll = async () => {
    const toLabel = items.filter((i) => !i.duplicate && !i.labeling);
    if (toLabel.length === 0) { toast.error("No images to label"); return; }
    setAutoLabelingAll(true);
    const BATCH = 3;
    for (let idx = 0; idx < toLabel.length; idx += BATCH) {
      await Promise.all(toLabel.slice(idx, idx + BATCH).map((item) => labelOneItem(item.id, item.url, item.dataUri)));
    }
    setAutoLabelingAll(false);
    toast.success("Auto-label complete");
  };

  // ── Remove BG + resize + center + sharpen (full pipeline) ────────────────
  const handleRemoveBgAll = async () => {
    const toProcess = items.filter((i) => i.selected && !i.duplicate && i.url.startsWith("blob:"));
    if (toProcess.length === 0) { toast.error("Select local images first (dragged/pasted files)"); return; }
    setRemovingBg(true);
    for (const item of toProcess) {
      try {
        const { processProductImage } = await import("@/lib/processProductImage");
        const blob = await fetch(item.url).then((r) => r.blob());
        const file = new File([blob], `img_${item.id}.${blob.type === "image/png" ? "png" : "jpg"}`, { type: blob.type || "image/png" });
        // Full pipeline: remove BG → tight crop → center on 500×500 → sharpen
        const result = await processProductImage(file, { removeBg: true });
        const newObjectUrl = URL.createObjectURL(result);
        const newDataUri = await fileToDataUri(result);
        setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, url: newObjectUrl, dataUri: newDataUri } : i));
      } catch { /* skip — keeps original if pipeline fails */ }
    }
    setRemovingBg(false);
    toast.success("Done — backgrounds removed, images centered & sharpened");
  };

  // ── Save selected items to template_images ────────────────────────────────
  const handleSave = async () => {
    const toSave = items.filter((i) => i.selected && !i.duplicate);
    if (toSave.length === 0) { toast.error("No images selected"); return; }
    setSaving(true);
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
    const rows = await Promise.all(toSave.map(async (item) => {
      try {
        if (item.url.startsWith("blob:")) {
          // Local file — run through full pipeline: crop, center, sharpen, then upload
          const blob = await fetch(item.url).then((r) => r.blob());
          const isPng = blob.type === "image/png";
          const ext = isPng ? "png" : "jpg";
          const { processProductImage } = await import("@/lib/processProductImage");
          const processed = await processProductImage(
            new File([blob], `img.${ext}`, { type: blob.type }),
            { removeBg: false }, // BG already removed if user ran Remove BG; skip re-processing
          );
          const path = `templates/import/${crypto.randomUUID()}.png`;
          const { error: upErr } = await supabase.storage.from("product-images").upload(path, processed, { upsert: false });
          if (upErr) throw upErr;
          const storedUrl = supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
          return { url: storedUrl, label: item.label, category: item.category };
        }
        // Remote URL — cache via edge function
        const res = await fetch(`${supabaseUrl}/functions/v1/cache-template-image`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseKey}`, "apikey": supabaseKey },
          body: JSON.stringify({ url: item.url }),
          signal: AbortSignal.timeout(20000),
        });
        const json = await res.json() as { storedUrl?: string; error?: string };
        return { url: json.storedUrl ?? item.url, label: item.label, category: item.category };
      } catch {
        return { url: item.url, label: item.label, category: item.category };
      }
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("template_images").upsert(rows, { onConflict: "url", ignoreDuplicates: true });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${toSave.length} template${toSave.length !== 1 ? "s" : ""} added`);
    setExistingUrls((prev) => { const next = new Set(prev); toSave.forEach((i) => next.add(i.url)); return next; });
    setItems((prev) => prev.map((i) => i.selected ? { ...i, duplicate: true, selected: false } : i));
  };

  // ── Drag-and-drop handlers ────────────────────────────────────────────────
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = () => setIsDragging(false);
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
    if (files.length > 0) { await addFiles(files); return; }
    const text = e.dataTransfer.getData("text");
    if (text) addUrls(text);
  };

  // ── Derived counts ────────────────────────────────────────────────────────
  const selectedCount = items.filter((i) => i.selected && !i.duplicate).length;
  const newCount = items.filter((i) => !i.duplicate).length;
  const labelingCount = items.filter((i) => i.labeling).length;

  // ── Maintenance state ─────────────────────────────────────────────────────
  const [recaching, setRecaching] = useState(false);
  const [recacheResult, setRecacheResult] = useState<string | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [compressProgress, setCompressProgress] = useState<{ done: number; total: number } | null>(null);
  const [compressResult, setCompressResult] = useState<string | null>(null);

  const handleCompressAll = async () => {
    setCompressing(true);
    setCompressResult(null);
    setCompressProgress(null);
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from("template_images").select("id, url").order("id");
      if (error) { toast.error(error.message); return; }
      const dbRows = (data as { id: string; url: string }[]).filter((r) => r.url?.startsWith(supabaseUrl));
      if (dbRows.length === 0) { setCompressResult("No Supabase-hosted images to compress."); return; }
      setCompressProgress({ done: 0, total: dbRows.length });
      let succeeded = 0; let skipped = 0;
      for (let i = 0; i < dbRows.length; i++) {
        const row = dbRows[i];
        try {
          const fetchRes = await fetch(row.url, { cache: "no-store" });
          if (!fetchRes.ok) { skipped++; continue; }
          const blob = await fetchRes.blob();
          const isPng = blob.type === "image/png" || row.url.toLowerCase().includes(".png");
          const ext = isPng ? "png" : "jpg";
          const orig = new File([blob], `original.${ext}`, { type: blob.type || (isPng ? "image/png" : "image/jpeg") });
          const compressed = await compressImageFile(orig);
          if (compressed.size >= orig.size * 0.95) { skipped++; setCompressProgress({ done: i + 1, total: dbRows.length }); continue; }
          const match = row.url.match(/\/object\/public\/product-images\/(.+?)(\?|$)/);
          if (!match) { skipped++; continue; }
          const { error: upErr } = await supabase.storage.from("product-images").upload(match[1], compressed, { upsert: true, contentType: compressed.type });
          if (upErr) { skipped++; continue; }
          succeeded++;
        } catch { skipped++; }
        setCompressProgress({ done: i + 1, total: dbRows.length });
      }
      setCompressResult(`Done — ${succeeded} compressed, ${skipped} skipped.`);
      toast.success("Compression complete");
    } catch (e) { toast.error((e as Error).message); }
    finally { setCompressing(false); setCompressProgress(null); }
  };

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
    } catch (e) { toast.error((e as Error).message); }
    finally { setRecaching(false); }
  };

  return (
    <div className="space-y-5">

      {/* ══ DROP ZONE ══ */}
      <div
        ref={dropRef}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className="relative rounded-2xl border-2 border-dashed transition-all cursor-pointer select-none"
        style={{
          borderColor: isDragging ? "var(--primary)" : "rgba(255,255,255,0.15)",
          background: isDragging ? "oklch(0.22 0.06 260 / 0.5)" : "oklch(0.16 0.02 260 / 0.6)",
          minHeight: 140,
        }}
      >
        <input ref={fileInputRef} type="file" accept="image/*" multiple hidden
          onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
        <div className="flex flex-col items-center justify-center gap-2 py-8 px-4 pointer-events-none">
          <div className="h-10 w-10 rounded-full flex items-center justify-center" style={{ background: "oklch(0.24 0.04 260)" }}>
            <ImagePlus className="h-5 w-5 text-primary" />
          </div>
          <p className="font-black text-sm text-center">Paste or drag images here</p>
          <p className="text-xs text-muted-foreground text-center">
            Ctrl/Cmd + V · drag from any site · or click to pick files
          </p>
          <p className="text-xs font-bold text-primary/60">{items.length} / 500 added</p>
        </div>
        {isDragging && (
          <div className="absolute inset-0 rounded-2xl flex items-center justify-center pointer-events-none"
            style={{ background: "oklch(0.24 0.08 260 / 0.4)", border: "2px solid var(--primary)" }}>
            <p className="font-black text-primary text-lg">Drop here</p>
          </div>
        )}
      </div>

      {/* ══ ACTION BAR — only shown when images are loaded ══ */}
      {items.length > 0 && (
        <div className="space-y-3">

          {/* Bulk action buttons */}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={handleAutoLabelAll}
              disabled={autoLabelingAll || newCount === 0}
              className="gap-1.5 border-violet-500/40 text-violet-300 hover:bg-violet-500/10 font-bold">
              {autoLabelingAll
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Labeling {labelingCount}…</>
                : <><Zap className="h-3.5 w-3.5" />Auto-label all ({newCount})</>}
            </Button>
            <Button size="sm" variant="outline" onClick={handleRemoveBgAll}
              disabled={removingBg || selectedCount === 0}
              className="gap-1.5 border-pink-500/40 text-pink-300 hover:bg-pink-500/10 font-bold">
              {removingBg
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Removing BG…</>
                : <><Camera className="h-3.5 w-3.5" />Remove BG ({selectedCount})</>}
            </Button>
            <Button size="sm" variant="outline"
              onClick={() => setItems((prev) => prev.map((i) => i.duplicate ? i : { ...i, selected: true }))}>
              Select All
            </Button>
            <Button size="sm" variant="outline"
              onClick={() => setItems((prev) => prev.map((i) => ({ ...i, selected: false })))}>
              Deselect All
            </Button>
            <Button size="sm" variant="outline" onClick={() => setItems([])}
              className="text-red-400 border-red-500/30 hover:bg-red-500/10">
              Clear All
            </Button>
          </div>

          {/* Master category picker */}
          <div className="rounded-xl border border-border p-3 space-y-2" style={{ background: "var(--gradient-card)" }}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-black text-muted-foreground uppercase tracking-wider">Master Category</p>
              <Button size="sm" variant="ghost" className="h-6 text-[10px] font-black text-primary px-2"
                onClick={() => setItems((prev) => prev.map((i) => i.duplicate ? i : { ...i, category: masterCategory }))}>
                Apply to all
              </Button>
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {TEMPLATE_CATEGORIES.map((cat) => {
                const catDef = CATEGORIES.find((c) => c.value === cat);
                return (
                  <button key={cat}
                    onClick={() => { setMasterCategory(cat); setItems((prev) => prev.map((i) => i.duplicate ? i : { ...i, category: cat })); }}
                    className={`h-9 rounded-xl font-black text-xs transition border ${masterCategory === cat ? "text-primary-foreground border-transparent" : "bg-muted text-muted-foreground border-border hover:text-foreground"}`}
                    style={masterCategory === cat ? { background: "var(--gradient-hero)" } : {}}>
                    {catDef?.icon} {catDef?.label ?? cat}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Stats + Add to Templates CTA */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="text-sm text-muted-foreground">
              <span className="font-black text-foreground">{selectedCount}</span> selected ·{" "}
              <span className="font-black text-primary">{newCount}</span> new ·{" "}
              <span>{items.filter((i) => i.duplicate).length} already saved</span>
            </div>
            <Button disabled={selectedCount === 0 || saving} onClick={handleSave}
              className="gap-2 font-black"
              style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}>
              {saving ? <><Loader2 className="h-4 w-4 animate-spin" />Saving…</> : <><Plus className="h-4 w-4" />Add {selectedCount} to Templates</>}
            </Button>
          </div>

          {/* Image grid */}
          <div className="grid grid-cols-3 gap-2">
            {items.map((item) => (
              <div key={item.id}
                className={`relative rounded-xl overflow-hidden border-2 transition ${item.duplicate ? "border-muted opacity-40" : item.selected ? "border-primary" : "border-border"}`}
                style={{ background: "var(--gradient-card)" }}>
                {/* Tap to toggle */}
                <button className="block w-full aspect-[3/4] relative" style={{ background: "oklch(0.14 0.01 260)" }}
                  onClick={() => { if (item.duplicate) return; setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, selected: !i.selected } : i)); }}>
                  <img src={item.url} alt={item.label} loading="lazy" decoding="async"
                    className="absolute inset-0 w-full h-full object-contain"
                    onError={(e) => { (e.target as HTMLImageElement).style.opacity = "0.2"; }} />
                  {!item.duplicate && (
                    <div className={`absolute top-1.5 right-1.5 h-5 w-5 rounded-full border-2 flex items-center justify-center transition ${item.selected ? "bg-primary border-primary" : "bg-black/50 border-white/40"}`}>
                      {item.selected && <Check className="h-3 w-3 text-primary-foreground" />}
                    </div>
                  )}
                  {item.duplicate && <div className="absolute top-1.5 left-1.5 bg-black/70 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">SAVED</div>}
                  {item.labeling && <div className="absolute inset-0 flex items-center justify-center bg-black/40"><Loader2 className="h-5 w-5 animate-spin text-violet-400" /></div>}
                </button>
                {/* Info panel */}
                <div className="px-1.5 pt-1 pb-1.5 space-y-1" style={{ background: "rgba(0,0,0,0.85)" }}>
                  <div className="flex items-center gap-1">
                    <input className="flex-1 bg-transparent text-white text-xs font-bold outline-none min-w-0"
                      value={item.label} onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, label: e.target.value } : i))} />
                    {!item.duplicate && (
                      <button onClick={(e) => { e.stopPropagation(); labelOneItem(item.id, item.url, item.dataUri); }}
                        disabled={item.labeling} title="Auto-label this image"
                        className="shrink-0 h-5 w-5 rounded flex items-center justify-center hover:bg-violet-500/20">
                        {item.labeling ? <Loader2 className="h-3 w-3 animate-spin text-violet-400" /> : <Zap className="h-3 w-3 text-violet-400/70" />}
                      </button>
                    )}
                  </div>
                  {!item.duplicate && (
                    <>
                      {/* Category badge */}
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] text-white/40 uppercase tracking-wider font-bold">Cat:</span>
                        <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full"
                          style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}>
                          {CATEGORIES.find((c) => c.value === item.category)?.icon}{" "}
                          {CATEGORIES.find((c) => c.value === item.category)?.label ?? item.category}
                        </span>
                      </div>
                      {/* Per-image category mini-picker */}
                      <div className="grid grid-cols-5 gap-0.5">
                        {TEMPLATE_CATEGORIES.map((cat) => {
                          const catDef = CATEGORIES.find((c) => c.value === cat);
                          return (
                            <button key={cat}
                              onClick={(e) => { e.stopPropagation(); setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, category: cat } : i)); }}
                              className={`h-6 rounded text-[9px] font-black transition leading-none ${item.category === cat ? "text-primary-foreground" : "bg-white/10 text-white/50 hover:text-white/80"}`}
                              style={item.category === cat ? { background: "var(--gradient-hero)" } : {}}>
                              {catDef?.label ?? cat}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══ MAINTENANCE (collapsed) ══ */}
      <details>
        <summary className="cursor-pointer text-xs font-black text-muted-foreground/60 uppercase tracking-wider flex items-center gap-2 select-none list-none">
          <RefreshCw className="h-3.5 w-3.5" /> Maintenance Tools
          <span className="text-[10px] font-normal normal-case">(fix broken / compress images)</span>
        </summary>
        <div className="mt-3 space-y-3">
          <div className="rounded-2xl p-4 border border-amber-500/30 space-y-3" style={{ background: "rgba(245,158,11,0.06)" }}>
            <h2 className="font-black text-sm flex items-center gap-2 text-amber-400"><RefreshCw className="h-4 w-4" /> Fix Broken Images</h2>
            <p className="text-xs text-muted-foreground">Re-downloads all external images into Supabase storage.</p>
            <Button onClick={handleRecacheAll} disabled={recaching} variant="outline" className="border-amber-500/40 text-amber-400 hover:bg-amber-500/10 font-bold">
              {recaching ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Re-caching…</> : "Re-cache All Images Now"}
            </Button>
            {recacheResult && <p className="text-xs text-green-400 font-semibold">{recacheResult}</p>}
          </div>
          <div className="rounded-2xl p-4 border border-blue-500/30 space-y-3" style={{ background: "rgba(59,130,246,0.06)" }}>
            <h2 className="font-black text-sm flex items-center gap-2 text-blue-400"><ImagePlus className="h-4 w-4" /> Compress Existing Templates</h2>
            <p className="text-xs text-muted-foreground">Re-compresses all template images to max 500px.</p>
            <Button onClick={handleCompressAll} disabled={compressing} variant="outline" className="border-blue-500/40 text-blue-400 hover:bg-blue-500/10 font-bold">
              {compressing ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Compressing… {compressProgress ? `${compressProgress.done}/${compressProgress.total}` : ""}</> : "Compress All Template Images"}
            </Button>
            {compressResult && <p className="text-xs text-green-400 font-semibold">{compressResult}</p>}
          </div>
        </div>
      </details>
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
      className="relative rounded-xl overflow-hidden border border-border group select-none"
      style={{ background: "var(--gradient-card)" }}
      onDragStart={(e) => e.preventDefault()}
    >
      <div className="aspect-[3/4] relative" style={{ background: "var(--gradient-card)" }}>
        <img
          src={t.url}
          alt={label}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 w-full h-full object-contain"
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
        {/* Category — text buttons */}
        <div className="grid grid-cols-5 gap-0.5">
          {TEMPLATE_CATEGORIES.map((cat) => {
            const catDef = CATEGORIES.find(c => c.value === cat);
            return (
              <button
                key={cat}
                onClick={() => {
                  setCategory(cat);
                  save(label, cat);
                }}
                className={`h-5 rounded text-[9px] font-black transition leading-none ${
                  category === cat
                    ? "text-primary-foreground"
                    : "bg-white/10 text-white/40 hover:text-white/70"
                }`}
                style={category === cat ? { background: "var(--gradient-hero)" } : {}}
              >
                {catDef?.label ?? cat}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Image compression helper ─────────────────────────────────────────────────
/**
 * Resize an image file so its longest edge is at most MAX_PX pixels.
 * - PNG input → PNG output  (alpha channel / transparency preserved)
 * - Everything else → JPEG at 82% quality
 * Already-small images are returned as-is without re-encoding.
 */
function compressImageFile(f: File): Promise<File> {
  const MAX_PX = 500;
  const isPng = f.type === "image/png" || f.name.toLowerCase().endsWith(".png");
  return new Promise((resolve) => {
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const { naturalWidth: w, naturalHeight: h } = img;
      if (w <= MAX_PX && h <= MAX_PX) { resolve(f); return; }
      const scale = MAX_PX / Math.max(w, h);
      const canvas = document.createElement("canvas");
      canvas.width  = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      const ctx = canvas.getContext("2d")!;
      if (isPng) ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const mimeType = isPng ? "image/png" : "image/jpeg";
      const quality  = isPng ? undefined : 0.82;
      canvas.toBlob(
        (blob) => {
          if (!blob) { resolve(f); return; }
          const ext = isPng ? "png" : "jpg";
          resolve(new File([blob], `${f.name.replace(/\.[^.]+$/, "")}.${ext}`, { type: mimeType }));
        },
        mimeType,
        quality,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(f); };
    img.src = url;
  });
}

// ─── Add Template Modal ───────────────────────────────────────────────────────
function AddTemplateModal({ onDone }: { onDone: () => void }) {
  const [mode, setMode]         = useState<"single" | "bulk">("single");

  // ── Single mode state ──
  const [name, setName]         = useState("");
  const [category, setCategory] = useState<string>("beers");
  const [file, setFile]         = useState<File | null>(null);
  const [preview, setPreview]   = useState<string | null>(null);
  const [busy, setBusy]         = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef  = useRef<HTMLInputElement>(null);

  // ── Bulk mode state ──
  type BulkItem = { file: File; previewUrl: string; name: string };
  const [bulkItems, setBulkItems]   = useState<BulkItem[]>([]);
  const [bulkCat, setBulkCat]       = useState<string>("beers");
  const [bulkBusy, setBulkBusy]     = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);
  const bulkFileRef = useRef<HTMLInputElement>(null);

  const onPick = (f: File | undefined | null) => {
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const clearImage = () => { setFile(null); setPreview(null); };

  // Derive a clean name from filename
  const nameFromFile = (f: File) =>
    f.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase()).trim();

  const onBulkPick = (files: FileList | null) => {
    if (!files) return;
    const incoming: BulkItem[] = Array.from(files).map(f => ({
      file: f,
      previewUrl: URL.createObjectURL(f),
      name: nameFromFile(f),
    }));
    setBulkItems(prev => [...prev, ...incoming]);
  };

  const removeBulkItem = (idx: number) => {
    setBulkItems(prev => {
      URL.revokeObjectURL(prev[idx].previewUrl);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const updateBulkName = (idx: number, val: string) =>
    setBulkItems(prev => prev.map((it, i) => i === idx ? { ...it, name: val } : it));

  // ── Single submit ──
  const submit = async () => {
    if (!name.trim()) { toast.error("Enter a title"); return; }
    setBusy(true);
    let url: string | null = null;
    if (file) {
      // Full pipeline: remove BG → tight crop → center 500×500 → sharpen
      const { processProductImage } = await import("@/lib/processProductImage");
      const processed = await processProductImage(file, { removeBg: true });
      const path = `templates/manual/${crypto.randomUUID()}.png`;
      const { error: upErr } = await supabase.storage
        .from("product-images")
        .upload(path, processed, { upsert: false });
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

  // ── Bulk submit ──
  const submitBulk = async () => {
    if (bulkItems.length === 0) { toast.error("No images selected"); return; }
    if (bulkItems.some(it => !it.name.trim())) { toast.error("All items need a name"); return; }
    setBulkBusy(true);
    setBulkProgress(0);
    let saved = 0;
    for (let i = 0; i < bulkItems.length; i++) {
      const it = bulkItems[i];
      const { processProductImage } = await import("@/lib/processProductImage");
      const processed = await processProductImage(it.file, { removeBg: true });
      const path = `templates/manual/${crypto.randomUUID()}.png`;
      const { error: upErr } = await supabase.storage
        .from("product-images")
        .upload(path, processed, { upsert: false });
      if (upErr) { toast.error(`${it.name}: ${upErr.message}`); continue; }
      const url = supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("template_images").insert({
        url,
        label: it.name.trim(),
        category: bulkCat,
      });
      if (error) { toast.error(`${it.name}: ${error.message}`); continue; }
      saved++;
      setBulkProgress(Math.round(((i + 1) / bulkItems.length) * 100));
    }
    setBulkBusy(false);
    if (saved > 0) {
      toast.success(`${saved} template${saved !== 1 ? "s" : ""} saved`);
      onDone();
    }
  };

  const CategoryPicker = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <div>
      <Label className="text-xs mb-1.5 block">Category</Label>
      <div className="grid grid-cols-5 gap-2">
        {CATEGORIES.filter((cat) => cat.value !== "miscellaneous" && cat.value !== "food").map((cat) => (
          <button key={cat.value} type="button"
            onClick={() => onChange(cat.value)}
            className={`h-10 rounded-xl font-bold text-xs transition ${
              value === cat.value ? "text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
            style={value === cat.value ? { background: "var(--gradient-hero)" } : {}}>
            {cat.label}
          </button>
        ))}
      </div>
    </div>
  );

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

        {/* Mode toggle */}
        <div className="px-5 pb-3">
          <div className="flex rounded-xl overflow-hidden border border-border">
            <button type="button"
              onClick={() => setMode("single")}
              className="flex-1 h-9 text-xs font-black transition"
              style={mode === "single" ? { background: "var(--gradient-hero)", color: "var(--primary-foreground)" } : { background: "transparent", color: "rgba(255,255,255,0.4)" }}>
              Single
            </button>
            <button type="button"
              onClick={() => setMode("bulk")}
              className="flex-1 h-9 text-xs font-black transition"
              style={mode === "bulk" ? { background: "var(--gradient-hero)", color: "var(--primary-foreground)" } : { background: "transparent", color: "rgba(255,255,255,0.4)" }}>
              Bulk Upload
            </button>
          </div>
        </div>

        <div className="px-5 pb-6 space-y-4 max-h-[75vh] overflow-y-auto">

          {/* ── SINGLE MODE ── */}
          {mode === "single" && (<>
            {/* Image area */}
            <div className="flex gap-3 items-stretch">
              <div className="relative w-1/2 aspect-[3/4] rounded-xl border-2 border-dashed border-border overflow-hidden shrink-0"
                style={{ background: "var(--gradient-card)" }}>
                {preview
                  ? <img src={preview} className="absolute inset-0 w-full h-full object-contain" alt="preview" />
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

            <CategoryPicker value={category} onChange={setCategory} />

            <div>
              <Label className="text-xs mb-1.5 block">Title</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Heineken 330ml" className="h-11" />
            </div>

            <Button className="w-full h-12 font-black text-base"
              disabled={!name.trim() || busy}
              onClick={submit}
              style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Template"}
            </Button>
          </>)}

          {/* ── BULK MODE ── */}
          {mode === "bulk" && (<>
            <CategoryPicker value={bulkCat} onChange={setBulkCat} />

            {/* Pick images button */}
            <input ref={bulkFileRef} type="file" accept="image/*" multiple hidden
              onChange={(e) => onBulkPick(e.target.files)} />
            <Button type="button" variant="secondary" className="w-full h-12 font-bold text-sm"
              onClick={() => bulkFileRef.current?.click()}>
              <ImagePlus className="h-5 w-5 mr-2" />
              {bulkItems.length === 0 ? "Select Images" : `Add More Images (${bulkItems.length} selected)`}
            </Button>

            {/* Preview list */}
            {bulkItems.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-black text-white/40 uppercase tracking-wider">
                  {bulkItems.length} image{bulkItems.length !== 1 ? "s" : ""} · edit names before saving
                </p>
                {bulkItems.map((it, idx) => (
                  <div key={idx} className="flex items-center gap-2 rounded-xl border border-border p-2"
                    style={{ background: "oklch(0.18 0.015 60)" }}>
                    <img src={it.previewUrl} alt={it.name}
                      className="h-14 w-10 rounded-lg object-contain shrink-0 border border-border"
                      style={{ background: "var(--gradient-card)" }} />
                    <input
                      value={it.name}
                      onChange={(e) => updateBulkName(idx, e.target.value)}
                      className="flex-1 h-9 rounded-lg border border-border bg-background px-2 text-sm font-bold outline-none min-w-0"
                      placeholder="Template name" />
                    <button type="button" onClick={() => removeBulkItem(idx)}
                      className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0 transition active:scale-90"
                      style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)" }}>
                      <Trash2 className="h-3.5 w-3.5 text-red-400" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Progress bar */}
            {bulkBusy && (
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>Uploading…</span><span>{bulkProgress}%</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${bulkProgress}%`, background: "var(--gradient-hero)" }} />
                </div>
              </div>
            )}

            <Button className="w-full h-12 font-black text-base"
              disabled={bulkItems.length === 0 || bulkBusy}
              onClick={submitBulk}
              style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}>
              {bulkBusy
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : `Save ${bulkItems.length > 0 ? bulkItems.length : ""} Template${bulkItems.length !== 1 ? "s" : ""}`}
            </Button>
          </>)}

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
                className={`h-10 rounded-xl font-bold text-xs transition border ${
                  filterCat === cat
                    ? "text-primary-foreground border-transparent"
                    : "bg-muted text-muted-foreground border-border hover:text-foreground"
                }`}
                style={filterCat === cat ? { background: "var(--gradient-hero)" } : {}}
              >
                {catDef?.label ?? cat}
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

// ─── AdminBillingInline ───────────────────────────────────────────────────────
// Wraps AdminBillingManagementPage for embedding in the admin panel billing tab.
// Keeps the pending count in sync with the parent AdminPage for the badge.
function AdminBillingInline({ onCountChange }: { onCountChange: (n: number) => void }) {
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from("billing_payments").select("*", { count: "exact", head: true }).eq("status", "pending")
      .then(({ count }: { count: number | null }) => onCountChange(count ?? 0));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <AdminBillingManagementPage />;
}

// ─── Main Admin Page ──────────────────────────────────────────────────────────
export default function AdminPage() {
  const { profile, loading, signOut, user } = useAuth();
  const nav = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [nearExpiryCount, setNearExpiryCount] = useState(0);
  const [pendingBillingCount, setPendingBillingCount] = useState(0);
  const [outerTab, setOuterTab] = useState("panel");
  const [panelSubTab, setPanelSubTab] = useState("dashboard");

  // ── Shareholder income state ────────────────────────────────────────────────
  const [currentMonthIncome, setCurrentMonthIncome] = useState(0);
  const [lastMonthIncome, setLastMonthIncome] = useState(0);
  const [monthlyHistory, setMonthlyHistory] = useState<ShareholderMonthly[]>([]);
  const [incomeLoading, setIncomeLoading] = useState(true);

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

  // ── Load shareholder income from billing_payments ──────────────────────────
  const loadShareholderIncome = useCallback(async () => {
    setIncomeLoading(true);
    try {
      // Exclude demo account from income calculations
      const { data: demoProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", "isabel@gmail.com")
        .maybeSingle();
      const demoId = demoProfile?.id;

      // Master account (renard.sankersingh@gmail.com) has no billing payments — no filtering needed
      const masterId: string | undefined = undefined;

      let query = supabase
        .from("billing_payments")
        .select("amount, approved_at")
        .eq("status", "paid")
        .not("approved_at", "is", null);

      if (demoId) query = query.neq("owner_id", demoId);
      if (masterId) query = query.neq("owner_id", masterId);

      const { data } = await query;
      const payments = (data ?? []) as { amount: number; approved_at: string }[];

      const now = new Date();
      const curYear = now.getFullYear();
      const curMonth = now.getMonth(); // 0-indexed

      // Previous month
      const lastMonthDate = new Date(curYear, curMonth - 1, 1);
      const lastYear = lastMonthDate.getFullYear();
      const lastMonth = lastMonthDate.getMonth();

      let curTotal = 0;
      let lastTotal = 0;
      const monthMap = new Map<string, number>(); // "YYYY-MM" -> total

      for (const p of payments) {
        const d = new Date(p.approved_at);
        const y = d.getFullYear();
        const m = d.getMonth();
        const amt = Number(p.amount);

        if (y === curYear && m === curMonth) curTotal += amt;
        if (y === lastYear && m === lastMonth) lastTotal += amt;

        const key = `${y}-${String(m).padStart(2, "0")}`;
        monthMap.set(key, (monthMap.get(key) ?? 0) + amt);
      }

      setCurrentMonthIncome(curTotal);
      setLastMonthIncome(lastTotal);

      // Build sorted history with shareholder splits
      const history: ShareholderMonthly[] = Array.from(monthMap.entries())
        .map(([key, total]) => {
          const [y, m] = key.split("-").map(Number);
          return {
            year: y,
            month: m,
            total,
            shares: SHAREHOLDERS.map(s => Math.round(total * s.share * 100) / 100),
          };
        })
        .sort((a, b) => b.year - a.year || b.month - a.month);

      setMonthlyHistory(history);
    } catch {
      // silent — non-critical
    } finally {
      setIncomeLoading(false);
    }
  }, []);

  useEffect(() => {
    if (profile?.role !== "admin") return;
    refresh();
    loadShareholderIncome();

    const ch = supabase
      .channel("admin-profiles")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "billing_payments" }, () => {
        supabase.from("billing_payments").select("*", { count: "exact", head: true }).eq("status", "pending")
          .then(({ count }) => setPendingBillingCount(count ?? 0));
        loadShareholderIncome();
      })
      .subscribe();

    // Load initial pending billing count
    supabase.from("billing_payments").select("*", { count: "exact", head: true }).eq("status", "pending")
      .then(({ count }) => setPendingBillingCount(count ?? 0));

    const poll = setInterval(refresh, 10_000);
    return () => { supabase.removeChannel(ch); clearInterval(poll); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.role]);

  const buckets = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const MASTER_ACCOUNT_EMAILS = ["renard.sankersingh@gmail.com", "isabel@gmail.com"];
    const filtered = needle
      ? rows.filter((r) =>
          r.username.toLowerCase().includes(needle) ||
          r.email.toLowerCase().includes(needle) ||
          (r.phone ?? "").toLowerCase().includes(needle) ||
          (r.address ?? "").toLowerCase().includes(needle)
        )
      : rows;
    return {
      // Never show master account in pending — treat as approved regardless of DB status
      pending: filtered.filter((r) => r.status === "pending" && !MASTER_ACCOUNT_EMAILS.includes(r.email)),
      // Approved: hide bar sub-accounts (chain bars) — only show real account owners
      // Master account always appears in approved list
      approved: filtered.filter((r) => (r.status === "approved" || MASTER_ACCOUNT_EMAILS.includes(r.email)) && !r.is_bar_account),
      suspended: filtered.filter((r) => r.status === "suspended" && !r.is_bar_account && !MASTER_ACCOUNT_EMAILS.includes(r.email)),
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
          <h1 className="text-xl font-black leading-tight">Admin — {profile.username.charAt(0).toUpperCase() + profile.username.slice(1)}</h1>
        </div>
      </div>

      <Tabs value={outerTab} onValueChange={setOuterTab}>
        <TabsList className={`grid w-full ${user?.email === "renard@bartendazpro.com" ? "grid-cols-5" : "grid-cols-6"}`}>
          {(["panel","billing","users","import","templates","youtube"] as const).filter(key => {
            if (key === "youtube" && user?.email === "renard@bartendazpro.com") return false;
            return true;
          }).map((key) => (
            <TabsTrigger
              key={key}
              value={key}
              className="gap-1 relative text-[10px] sm:text-xs"
              style={outerTab === key
                ? { background: "var(--gradient-hero)", color: "#fff", boxShadow: "0 2px 8px rgba(251,146,60,0.4)" }
                : { background: "transparent", boxShadow: "none", color: "var(--muted-foreground)" }
              }
            >
              {key === "youtube" ? <Youtube className="h-3.5 w-3.5" /> : key.charAt(0).toUpperCase() + key.slice(1)}
              {key === "billing" && pendingBillingCount > 0 && (
                <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center">
                  {pendingBillingCount > 9 ? "9+" : pendingBillingCount}
                </span>
              )}
              {key === "users" && buckets.pending.length > 0 && (
                <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-orange-500 text-white text-[9px] font-black flex items-center justify-center">
                  {buckets.pending.length > 9 ? "9+" : buckets.pending.length}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ── Panel (Dashboard + History sub-tabs) ── */}
        <TabsContent value="panel" className="mt-4">
          <Tabs value={panelSubTab} onValueChange={setPanelSubTab}>
            <TabsList className="grid grid-cols-2 w-full mb-4">
              <TabsTrigger value="dashboard" className="gap-1.5 font-bold"
                style={panelSubTab === "dashboard"
                  ? { background: "var(--gradient-hero)", color: "#fff" }
                  : { background: "transparent", color: "var(--muted-foreground)" }
                }>
                <BarChart3 className="h-3.5 w-3.5" /> Dashboard
              </TabsTrigger>
              <TabsTrigger value="history" className="gap-1.5 font-bold"
                style={panelSubTab === "history"
                  ? { background: "var(--gradient-hero)", color: "#fff" }
                  : { background: "transparent", color: "var(--muted-foreground)" }
                }>
                <History className="h-3.5 w-3.5" /> History
              </TabsTrigger>
            </TabsList>

            {/* ── Dashboard Sub-tab ── */}
            <TabsContent value="dashboard" className="space-y-5 mt-0">
              {/* Stat cards */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-border p-4 space-y-1" style={{ background: "var(--gradient-card)" }}>
                  <p className="text-xs text-muted-foreground font-medium">Pending Users</p>
                  <p className="text-3xl font-black">{buckets.pending.length}</p>
                  <p className="text-xs text-muted-foreground">awaiting billing approval</p>
                </div>
                <div className="rounded-2xl border border-border p-4 space-y-1" style={{ background: "var(--gradient-card)" }}>
                  <p className="text-xs text-muted-foreground font-medium">Approved Users</p>
                  <p className="text-3xl font-black text-green-400">{buckets.approved.length}</p>
                  <p className="text-xs text-muted-foreground">active accounts</p>
                </div>
                <div className="rounded-2xl border border-border p-4 space-y-1" style={{ background: "var(--gradient-card)" }}>
                  <p className="text-xs text-muted-foreground font-medium">Pending Payments</p>
                  <p className="text-3xl font-black text-yellow-400">{pendingBillingCount}</p>
                  <p className="text-xs text-muted-foreground">waiting review</p>
                </div>
                <div className="rounded-2xl border border-border p-4 space-y-1" style={{ background: "var(--gradient-card)" }}>
                  <p className="text-xs text-muted-foreground font-medium">Due Soon</p>
                  <p className="text-3xl font-black text-orange-400">{nearExpiryCount}</p>
                  <p className="text-xs text-muted-foreground">within 7 days</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-border p-4 space-y-1" style={{ background: "var(--gradient-card)" }}>
                  <p className="text-xs text-muted-foreground font-medium">Suspended</p>
                  <p className="text-2xl font-black text-red-400">{buckets.suspended.length}</p>
                </div>
                <div className="rounded-2xl border border-border p-4 space-y-1" style={{ background: "var(--gradient-card)" }}>
                  <p className="text-xs text-muted-foreground font-medium">Total Registered</p>
                  <p className="text-2xl font-black">{rows.filter(r => !r.is_bar_account && !["renard.sankersingh@gmail.com", "isabel@gmail.com"].includes(r.email)).length}</p>
                </div>
              </div>

              {/* ── Shareholder Income Split ── */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-black text-muted-foreground uppercase tracking-widest">Shareholder Income</h2>
                </div>

                {/* Total revenue row */}
                <div className="rounded-2xl border border-primary/30 p-4" style={{ background: "linear-gradient(135deg, rgba(251,146,60,0.10), rgba(251,146,60,0.03))" }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground font-medium">Total Revenue This Month</p>
                      <p className="text-3xl font-black text-primary">
                        {incomeLoading ? "…" : `$${currentMonthIncome.toLocaleString("en", { minimumFractionDigits: 0 })}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground font-medium">Last Month</p>
                      <p className="text-xl font-black text-muted-foreground">
                        {incomeLoading ? "…" : `$${lastMonthIncome.toLocaleString("en", { minimumFractionDigits: 0 })}`}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Per-shareholder cards */}
                {SHAREHOLDERS.map((sh, idx) => (
                  <div key={sh.name} className="space-y-2">
                    <p className={`text-xs font-black uppercase tracking-widest ${sh.color}`}>
                      {sh.name} · {Math.round(sh.share * 100)}%
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className={`rounded-2xl border ${sh.bg} p-4 space-y-1`} style={{ background: sh.gradient }}>
                        <div className="flex items-center gap-1.5">
                          <TrendingUp className={`h-3.5 w-3.5 ${sh.color}`} />
                          <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">This Month</p>
                        </div>
                        <p className={`text-2xl font-black ${sh.color}`}>
                          {incomeLoading ? "…" : `$${Math.round(currentMonthIncome * sh.share).toLocaleString()}`}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {new Date().toLocaleString("en", { month: "long", year: "numeric" })}
                        </p>
                      </div>
                      <div className={`rounded-2xl border ${sh.bg} p-4 space-y-1`} style={{ background: sh.gradient }}>
                        <div className="flex items-center gap-1.5">
                          <Calendar className={`h-3.5 w-3.5 ${sh.color} opacity-60`} />
                          <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Last Month</p>
                        </div>
                        <p className={`text-2xl font-black ${sh.color} opacity-70`}>
                          {incomeLoading ? "…" : `$${Math.round(lastMonthIncome * sh.share).toLocaleString()}`}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {(() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toLocaleString("en", { month: "long", year: "numeric" }); })()}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>

            {/* ── History Sub-tab ── */}
            <TabsContent value="history" className="mt-0">
              {incomeLoading ? (
                <div className="flex justify-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : monthlyHistory.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                  <DollarSign className="h-10 w-10 opacity-30" />
                  <p className="text-sm">No payment history yet.</p>
                </div>
              ) : (
                <Accordion type="multiple" className="space-y-2">
                  {/* Group by year */}
                  {Array.from(new Set(monthlyHistory.map(h => h.year)))
                    .sort((a, b) => b - a)
                    .map(year => {
                      const yearRecords = monthlyHistory.filter(h => h.year === year);
                      const yearTotal = yearRecords.reduce((s, r) => s + r.total, 0);
                      return (
                        <AccordionItem key={year} value={String(year)} className="rounded-2xl border border-border overflow-hidden" style={{ background: "var(--gradient-card)" }}>
                          <AccordionTrigger className="px-4 py-3 hover:no-underline">
                            <div className="flex items-center gap-3 flex-1">
                              <span className="text-lg font-black">{year}</span>
                              <Badge variant="secondary" className="font-black text-xs">
                                {yearRecords.length} month{yearRecords.length !== 1 ? "s" : ""}
                              </Badge>
                              <span className="ml-auto text-sm font-black text-primary mr-2">
                                ${yearTotal.toLocaleString("en", { minimumFractionDigits: 0 })}
                              </span>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="px-0 pb-0">
                            <div className="divide-y divide-border">
                              {yearRecords
                                .sort((a, b) => b.month - a.month)
                                .map(rec => (
                                  <div key={`${rec.year}-${rec.month}`} className="px-4 py-3 space-y-2">
                                    <div className="flex items-center justify-between">
                                      <span className="font-black text-sm">{MONTH_NAMES[rec.month]}</span>
                                      <span className="font-black text-primary">${rec.total.toLocaleString("en", { minimumFractionDigits: 0 })}</span>
                                    </div>
                                    {SHAREHOLDERS.map((sh, idx) => (
                                      <div key={sh.name} className="flex items-center justify-between text-xs">
                                        <span className={`font-bold ${sh.color}`}>
                                          {sh.name.split(" ")[0]} ({Math.round(sh.share * 100)}%)
                                        </span>
                                        <span className={`font-black ${sh.color}`}>
                                          ${rec.shares[idx].toLocaleString("en", { minimumFractionDigits: 0 })}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                ))}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                </Accordion>
              )}
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* ── Billing ── */}
        <TabsContent value="billing" className="mt-4">
          <AdminBillingInline onCountChange={setPendingBillingCount} />
        </TabsContent>

        {/* ── Users ── */}
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
                    <div className="flex flex-row items-start justify-between gap-3">
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
                            <Button size="sm" variant="outline" onClick={() => act(() => setUserStatus(r.id, "pending"), "Set to Pending")}
                              title="Revert to pending — user will see the select a plan page">
                              <RotateCcw className="h-4 w-4 mr-1" /> Pending
                            </Button>
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
      if ((statsRes as any).data) setStats((statsRes as any).data as YtStats);
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


      {/* ── Key Pool ─────────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-black text-base flex items-center gap-2">
            <Key className="h-4 w-4 text-yellow-400" />
            API Key Pool
          </h2>

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
