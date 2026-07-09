import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useChain } from "@/lib/ChainContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Loader2, X, Check, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";

// ─── Types ────────────────────────────────────────────────────────────────────
type Product = { id: string; name: string; price: number; image_url: string | null; category?: string };

type Special = {
  id: string;
  owner_id: string;
  name: string;
  special_price: number;
  required_qty: number;
  product_ids: string[];
  is_recurring: boolean;
  run_days: number[]; // 0=Sun … 6=Sat
  start_date: string;  // YYYY-MM-DD
  start_time: string;  // HH:MM (24h), e.g. "09:00"
  end_date: string | null;
  end_time: string | null; // HH:MM or null
  active: boolean;
  created_at: string;
};

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Convert "HH:MM" (24h) to "h:MM AM/PM" */
function fmt12(time: string | null | undefined): string {
  if (!time) return "";
  const [hStr, mStr] = time.split(":");
  let h = parseInt(hStr, 10);
  const m = mStr ?? "00";
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

// ─── Helper: is a special active right now? ───────────────────────────────────
export function isSpecialActiveNow(s: Special): boolean {
  if (!s.active) return false;
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const nowTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  if (today < s.start_date) return false;
  if (today === s.start_date && s.start_time && nowTime < s.start_time) return false;

  if (s.end_date) {
    if (today > s.end_date) return false;
    if (today === s.end_date && s.end_time && nowTime > s.end_time) return false;
  }

  if (s.is_recurring && s.run_days.length > 0) {
    return s.run_days.includes(now.getDay());
  }
  return true;
}

// ─── Item selector popup ──────────────────────────────────────────────────────
function ProductSelector({
  products,
  selected,
  onClose,
  onConfirm,
}: {
  products: Product[];
  selected: string[];
  onClose: () => void;
  onConfirm: (ids: string[]) => void;
}) {
  const [draft, setDraft] = useState<string[]>(selected);

  const toggle = (id: string) =>
    setDraft((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  return (
    <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-3xl border border-border shadow-2xl flex flex-col max-h-[80dvh]"
        style={{ background: "var(--gradient-card)" }}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0 border-b border-border">
          <span className="font-black text-base">Select Items</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{draft.length} selected</span>
            <button onClick={onClose} className="h-8 w-8 rounded-full flex items-center justify-center bg-muted">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
          {products.map((p) => {
            const on = draft.includes(p.id);
            return (
              <button key={p.id} onClick={() => toggle(p.id)}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl transition active:scale-[0.98]"
                style={{ background: on ? "rgba(251,146,60,0.12)" : "rgba(255,255,255,0.03)", border: `1px solid ${on ? "var(--primary)" : "transparent"}` }}>
                <div className={`h-5 w-5 rounded flex items-center justify-center border-2 shrink-0 transition ${on ? "border-primary" : "border-muted-foreground/40"}`}
                  style={on ? { background: "var(--primary)" } : {}}>
                  {on && <Check className="h-3 w-3 text-black" />}
                </div>
                <span className="text-sm font-bold flex-1 text-left">{p.name}</span>
                <span className="text-xs text-muted-foreground shrink-0">${Number(p.price).toFixed(2)}</span>
              </button>
            );
          })}
        </div>
        <div className="px-4 pb-5 pt-3 border-t border-border shrink-0">
          <button onClick={() => { onConfirm(draft); onClose(); }}
            disabled={draft.length === 0}
            className="w-full h-12 rounded-2xl font-black text-sm text-primary-foreground disabled:opacity-40 transition active:scale-[0.98]"
            style={{ background: "var(--gradient-hero)" }}>
            OK — {draft.length} item{draft.length !== 1 ? "s" : ""} selected
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Create / Edit Special form ───────────────────────────────────────────────
function SpecialForm({
  products,
  ownerId,
  editSpecial,
  onClose,
  onSaved,
}: {
  products: Product[];
  ownerId: string;
  editSpecial?: Special | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!editSpecial;
  const [name, setName] = useState(editSpecial?.name ?? "");
  const [reqQty, setReqQty] = useState(String(editSpecial?.required_qty ?? "3"));
  const [price, setPrice] = useState(editSpecial?.special_price ? String(editSpecial.special_price) : "");
  const [selectedIds, setSelectedIds] = useState<string[]>(editSpecial?.product_ids ?? []);
  const [isRecurring, setIsRecurring] = useState(editSpecial?.is_recurring ?? false);
  const [runDays, setRunDays] = useState<number[]>(editSpecial?.run_days ?? []);
  const [startDate, setStartDate] = useState(editSpecial?.start_date ?? new Date().toISOString().split("T")[0]);
  const [startTime, setStartTime] = useState(editSpecial?.start_time ?? "00:00");
  const [endDate, setEndDate] = useState(editSpecial?.end_date ?? "");
  const [endTime, setEndTime] = useState(editSpecial?.end_time ?? "");
  const [showSelector, setShowSelector] = useState(false);
  const [busy, setBusy] = useState(false);
  const [activeNumpad, setActiveNumpad] = useState<"qty" | "price" | null>(null);

  const handleNumpad = (field: "qty" | "price", k: string) => {
    const current = field === "qty" ? reqQty : price;
    const setter = field === "qty" ? setReqQty : setPrice;
    const isDecimal = field === "price";
    if (k === "⌫") { setter(current.slice(0, -1)); return; }
    if (k === ".") { if (isDecimal && !current.includes(".")) setter(current + "."); return; }
    const dotIdx = current.indexOf(".");
    if (dotIdx !== -1 && current.length - dotIdx > 2) return;
    setter(current === "0" ? k : current + k);
  };

  const toggleDay = (d: number) =>
    setRunDays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]);

  const selectedNames = selectedIds
    .map((id) => products.find((p) => p.id === id)?.name)
    .filter(Boolean)
    .join(", ");

  const canSave = name.trim() && parseFloat(price) > 0 && parseInt(reqQty) > 0 && selectedIds.length > 0 && startDate;

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    const payload = {
      owner_id: ownerId,
      name: name.trim(),
      special_price: parseFloat(price),
      required_qty: parseInt(reqQty),
      product_ids: selectedIds,
      is_recurring: isRecurring,
      run_days: isRecurring ? runDays : [],
      start_date: startDate,
      start_time: startTime || "00:00",
      end_date: endDate || null,
      end_time: endTime || null,
      active: true,
    };
    let error;
    if (isEdit && editSpecial) {
      ({ error } = await (supabase as any).from("specials").update(payload).eq("id", editSpecial.id));
    } else {
      ({ error } = await (supabase as any).from("specials").insert(payload));
    }
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(isEdit ? "Special updated" : "Special created");
    onSaved();
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 z-[75] bg-black/70 backdrop-blur-sm flex items-end justify-center" onClick={onClose}>
        <div className="w-full max-w-md rounded-t-3xl border border-border shadow-2xl flex flex-col max-h-[92dvh]"
          style={{ background: "var(--gradient-card)" }}
          onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0 border-b border-border">
            <span className="font-black text-base">{isEdit ? "Edit Special" : "New Special"}</span>
            <button onClick={onClose} className="h-8 w-8 rounded-full flex items-center justify-center bg-muted">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {/* Name */}
            <div>
              <label className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-1 block">Special Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Friday Beer Special"
                className="w-full h-10 rounded-xl border border-border bg-muted/40 px-3 text-sm font-bold outline-none focus:ring-1 focus:ring-primary" />
            </div>

            {/* Qty + Price row */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-1 block">How Many Items</label>
                <div
                  className="h-10 rounded-xl border border-border bg-muted/40 flex items-center px-3 cursor-pointer active:bg-muted/50 transition"
                  onClick={() => setActiveNumpad(activeNumpad === "qty" ? null : "qty")}
                >
                  <span className={`text-base font-black ${activeNumpad === "qty" ? "text-primary" : "text-muted-foreground"}`}>
                    {reqQty || "0"}
                  </span>
                </div>
              </div>
              <div className="flex-1">
                <label className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-1 block">Special Price $</label>
                <div
                  className="h-10 rounded-xl border border-border bg-muted/40 flex items-center px-3 cursor-pointer active:bg-muted/50 transition"
                  onClick={() => setActiveNumpad(activeNumpad === "price" ? null : "price")}
                >
                  <span className={`text-base font-black ${activeNumpad === "price" ? "text-primary" : "text-muted-foreground"}`}>
                    ${price || "0.00"}
                  </span>
                </div>
              </div>
            </div>

            {/* Inline numpad — shows below qty/price when either is active */}
            {activeNumpad !== null && (
              <div className="grid grid-cols-3 gap-1.5">
                {["1","2","3","4","5","6","7","8","9", activeNumpad === "price" ? "." : "", "0","⌫"].map((k, i) => (
                  k === "" ? <div key={i} /> :
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleNumpad(activeNumpad, k)}
                    className={`h-11 rounded-xl font-black text-lg transition active:scale-95 ${
                      k === "⌫" ? "bg-destructive/20 text-destructive hover:bg-destructive/30" : "bg-muted hover:bg-muted/70 text-foreground"
                    }`}
                  >{k}</button>
                ))}
              </div>
            )}

            {/* Item picker */}
            <div>
              <label className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-1 block">Eligible Items</label>
              <button onClick={() => setShowSelector(true)}
                className="w-full min-h-[40px] rounded-xl border px-3 py-2 text-sm text-left transition active:scale-[0.98]"
                style={{ borderColor: selectedIds.length ? "var(--primary)" : "var(--border)", background: "rgba(255,255,255,0.03)" }}>
                {selectedIds.length === 0
                  ? <span className="text-muted-foreground">Tap to select items…</span>
                  : <span className="font-bold" style={{ color: "var(--primary)" }}>{selectedNames}</span>}
              </button>
              {selectedIds.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1">Any {reqQty} of these items in the cart triggers the special</p>
              )}
            </div>

            {/* Dates + Times */}
            <div className="flex gap-3">
              <div className="flex-1 space-y-2">
                <label className="text-xs font-black text-muted-foreground uppercase tracking-widest block">Start Date</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                  className="w-full h-10 rounded-xl border border-border bg-muted/40 px-3 text-sm font-bold outline-none focus:ring-1 focus:ring-primary" />
                <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)}
                  className="w-full h-10 rounded-xl border border-border bg-muted/40 px-3 text-sm font-bold outline-none focus:ring-1 focus:ring-primary" />
              </div>
              <div className="flex-1 space-y-2">
                <label className="text-xs font-black text-muted-foreground uppercase tracking-widest block">End Date (opt)</label>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                  className="w-full h-10 rounded-xl border border-border bg-muted/40 px-3 text-sm font-bold outline-none focus:ring-1 focus:ring-primary" />
                <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)}
                  placeholder="End time"
                  className="w-full h-10 rounded-xl border border-border bg-muted/40 px-3 text-sm font-bold outline-none focus:ring-1 focus:ring-primary" />
              </div>
            </div>

            {/* Recurring toggle */}
            <div>
              <label className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-2 block">Schedule</label>
              <div className="flex gap-3">
                <button onClick={() => setIsRecurring(false)}
                  className="flex-1 h-10 rounded-xl font-black text-sm transition active:scale-95"
                  style={{ background: !isRecurring ? "var(--gradient-hero)" : "rgba(255,255,255,0.05)", color: !isRecurring ? "var(--primary-foreground)" : "var(--muted-foreground)", border: "1px solid var(--border)" }}>
                  One-time
                </button>
                <button onClick={() => setIsRecurring(true)}
                  className="flex-1 h-10 rounded-xl font-black text-sm transition active:scale-95"
                  style={{ background: isRecurring ? "var(--gradient-hero)" : "rgba(255,255,255,0.05)", color: isRecurring ? "var(--primary-foreground)" : "var(--muted-foreground)", border: "1px solid var(--border)" }}>
                  Recurring
                </button>
              </div>
            </div>

            {/* Day picker — only when recurring */}
            {isRecurring && (
              <div>
                <label className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-2 block">Run on days</label>
                <div className="grid grid-cols-7 gap-1.5">
                  {DAY_LABELS.map((d, i) => {
                    const on = runDays.includes(i);
                    return (
                      <button key={i} onClick={() => toggleDay(i)}
                        className="h-10 rounded-xl font-black text-xs transition active:scale-95"
                        style={{ background: on ? "var(--gradient-hero)" : "rgba(255,255,255,0.05)", color: on ? "var(--primary-foreground)" : "var(--muted-foreground)", border: `1px solid ${on ? "var(--primary)" : "var(--border)"}` }}>
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Save button */}
          <div className="px-5 pb-6 pt-3 border-t border-border shrink-0">
            <button onClick={save} disabled={!canSave || busy}
              className="w-full h-12 rounded-2xl font-black text-sm text-primary-foreground disabled:opacity-40 flex items-center justify-center gap-2 transition active:scale-[0.98]"
              style={{ background: "var(--gradient-hero)" }}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : isEdit ? "Save Changes" : "Create Special"}
            </button>
          </div>
        </div>
      </div>

      {showSelector && (
        <ProductSelector
          products={products.filter((p) => (p.category || "beers") === "beers")}
          selected={selectedIds}
          onClose={() => setShowSelector(false)}
          onConfirm={(ids) => setSelectedIds(ids)} />
      )}
    </>
  );
}

// ─── Special actions modal ────────────────────────────────────────────────────
function SpecialActionsModal({
  special,
  onClose,
  onEdit,
  onToggle,
  onDelete,
}: {
  special: Special;
  onClose: () => void;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-end justify-center" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-3xl border border-border shadow-2xl overflow-hidden"
        style={{ background: "var(--gradient-card)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle + title */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border">
          <span className="font-black text-base truncate pr-3">{special.name}</span>
          <button onClick={onClose} className="h-8 w-8 rounded-full flex items-center justify-center bg-muted shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 py-4 space-y-2">
          {/* Edit */}
          <button
            onClick={() => { onEdit(); onClose(); }}
            className="w-full h-14 rounded-2xl font-black text-sm flex items-center gap-3 px-5 transition active:scale-[0.98]"
            style={{ background: "rgba(251,146,60,0.08)", border: "1.5px solid var(--primary)", color: "var(--primary)" }}
          >
            <Pencil className="h-4 w-4 shrink-0" />
            Edit Special
          </button>

          {/* Disable / Enable */}
          <button
            onClick={() => { onToggle(); onClose(); }}
            className="w-full h-14 rounded-2xl font-black text-sm flex items-center gap-3 px-5 transition active:scale-[0.98]"
            style={{
              background: special.active ? "rgba(234,179,8,0.08)" : "rgba(34,197,94,0.08)",
              border: `1.5px solid ${special.active ? "#eab308" : "#22c55e"}`,
              color: special.active ? "#facc15" : "#4ade80",
            }}
          >
            <span className="text-base leading-none shrink-0">{special.active ? "○" : "●"}</span>
            {special.active ? "Disable Special" : "Enable Special"}
          </button>

          {/* Delete */}
          <button
            onClick={() => { onDelete(); onClose(); }}
            className="w-full h-14 rounded-2xl font-black text-sm flex items-center gap-3 px-5 transition active:scale-[0.98]"
            style={{ background: "rgba(239,68,68,0.08)", border: "1.5px solid #ef4444", color: "#f87171" }}
          >
            <Trash2 className="h-4 w-4 shrink-0" />
            Delete Special
          </button>
        </div>

        {/* Safe-area spacer */}
        <div className="h-4" />
      </div>
    </div>
  );
}

// ─── Special card ─────────────────────────────────────────────────────────────
function SpecialCard({
  special,
  products,
  onEdit,
  onDelete,
  onToggle,
}: {
  special: Special;
  products: Product[];
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  const [showActions, setShowActions] = useState(false);

  const itemNames = special.product_ids
    .map((id) => products.find((p) => p.id === id)?.name)
    .filter(Boolean)
    .join(", ");
  const isLive = isSpecialActiveNow(special);

  return (
    <>
      <div className="rounded-2xl border border-border p-4 space-y-3" style={{ background: "var(--gradient-card)" }}>
        {/* Top row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${isLive ? "bg-green-400" : "bg-muted-foreground/40"}`} />
            <span className="font-black text-base leading-tight truncate">{special.name}</span>
          </div>
          <button
            onClick={() => setShowActions(true)}
            className="h-9 w-9 rounded-full flex items-center justify-center bg-muted hover:bg-muted/80 transition shrink-0"
          >
            <Pencil className="h-4 w-4" />
          </button>
        </div>

        {/* Deal summary */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-2xl font-black" style={{ color: "var(--primary)" }}>${special.special_price.toFixed(2)}</span>
          <span className="text-sm font-bold text-muted-foreground">for any {special.required_qty}</span>
          <span className={`ml-auto text-xs font-black px-2 py-0.5 rounded-full border ${special.active ? "border-green-500/40 text-green-400" : "border-border text-muted-foreground"}`}
            style={{ background: special.active ? "rgba(34,197,94,0.08)" : "rgba(255,255,255,0.03)" }}>
            {special.active ? "● Active" : "○ Inactive"}
          </span>
        </div>

        {/* Items */}
        <p className="text-sm text-muted-foreground leading-relaxed">
          <span className="font-black text-foreground/70">Items: </span>{itemNames || "—"}
        </p>

        {/* Schedule */}
        <div className="text-sm text-muted-foreground space-y-0.5">
          {special.is_recurring ? (
            <>
              <div>
                <span className="font-black text-foreground/70">Runs: </span>
                {special.run_days.map((d) => DAY_LABELS[d]).join(", ") || "every day"}
              </div>
              <div>
                <span className="font-black text-foreground/70">Time: </span>
                {fmt12(special.start_time) || "12:00 AM"}
                {special.end_time ? ` → ${fmt12(special.end_time)}` : " onwards"}
              </div>
            </>
          ) : (
            <div>
              <span className="font-black text-foreground/70">Period: </span>
              {special.start_date}{special.start_time ? ` ${fmt12(special.start_time)}` : ""}
              {special.end_date ? ` → ${special.end_date}${special.end_time ? ` ${fmt12(special.end_time)}` : ""}` : ""}
            </div>
          )}
        </div>
      </div>

      {showActions && (
        <SpecialActionsModal
          special={special}
          onClose={() => setShowActions(false)}
          onEdit={onEdit}
          onToggle={onToggle}
          onDelete={onDelete}
        />
      )}
    </>
  );
}

// ─── Main Specials Page ───────────────────────────────────────────────────────
export default function SpecialsPage() {
  const { profile } = useAuth();
  const { effectiveOwnerId } = useChain();
  const confirm = useConfirm();
  const [specials, setSpecials] = useState<Special[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editSpecial, setEditSpecial] = useState<Special | null>(null);

  // For chain owners, use the active bar's id; for regular owners, use their own id
  const ownerId = effectiveOwnerId(profile?.id ?? "");

  const load = async () => {
    const [{ data: sp }, { data: pr }] = await Promise.all([
      (supabase as any).from("specials").select("*").eq("owner_id", ownerId).order("created_at", { ascending: false }),
      (supabase as any).from("products").select("id, name, price, image_url, category").eq("owner_id", ownerId).order("name", { ascending: true }),
    ]);
    setSpecials((sp ?? []) as Special[]);
    setProducts((pr ?? []) as Product[]);
    setLoading(false);
  };

  useEffect(() => {
    if (!ownerId) return;
    load();
  }, [ownerId]); // eslint-disable-line react-hooks/exhaustive-deps

  const deleteSpecial = async (id: string, name: string) => {
    const ok = await confirm({
      title: `Delete "${name}"?`,
      description: "This special will be permanently removed and can't be undone.",
      confirmLabel: "Yes, Delete",
      cancelLabel: "No",
      destructive: true,
    });
    if (!ok) return;
    await (supabase as any).from("specials").delete().eq("id", id);
    setSpecials((prev) => prev.filter((s) => s.id !== id));
    toast.success("Special deleted");
  };

  const toggleActive = async (special: Special) => {
    const next = !special.active;
    await (supabase as any).from("specials").update({ active: next }).eq("id", special.id);
    setSpecials((prev) => prev.map((s) => s.id === special.id ? { ...s, active: next } : s));
  };

  if (profile?.role !== "owner") {
    return <div className="text-center text-muted-foreground py-20">Only owners can manage specials.</div>;
  }

  return (
    <div>
      {/* Sticky header */}
      <div className="sticky top-0 z-30 -mx-3 px-3 py-2 bg-background/95 backdrop-blur border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black leading-tight flex items-center gap-2">
              <Tag className="h-5 w-5" style={{ color: "var(--primary)" }} /> Specials
            </h1>
            <p className="text-muted-foreground text-xs">{specials.length} special{specials.length !== 1 ? "s" : ""}</p>
          </div>
          <Button size="sm" className="font-bold h-8" style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}
            onClick={() => { setEditSpecial(null); setShowForm(true); }}>
            <Plus className="h-4 w-4 mr-1" /> New Special
          </Button>
        </div>
      </div>

      <div className="pt-4 space-y-3">
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : specials.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <Tag className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p className="font-bold">No specials yet</p>
            <p className="text-xs mt-1">Tap New Special to create your first deal</p>
          </div>
        ) : (
          specials.map((s) => (
            <SpecialCard key={s.id} special={s} products={products}
              onEdit={() => { setEditSpecial(s); setShowForm(true); }}
              onDelete={() => deleteSpecial(s.id, s.name)}
              onToggle={() => toggleActive(s)} />
          ))
        )}
      </div>

      {showForm && (
        <SpecialForm products={products} ownerId={ownerId} editSpecial={editSpecial}
          onClose={() => { setShowForm(false); setEditSpecial(null); }}
          onSaved={load} />
      )}
    </div>
  );
}
