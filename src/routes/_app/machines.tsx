import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Plus, Loader2, ChevronLeft, Trash2, Download, X,
  TrendingDown, TrendingUp, DollarSign, Gamepad2, Camera, AlertTriangle,
} from "lucide-react";
import { downloadPdf } from "@/lib/download";
import { drawHeader, addFootersToAllPages, LM, RM, CONTENT_BOTTOM } from "@/lib/pdfHelpers";

export const Route = createFileRoute("/_app/machines")({
  component: MachinesPage,
});

// ── Types ──────────────────────────────────────────────────────────────────────
type Machine = { id: string; owner_id: string; name: string; created_at: string; sort_order: number };
type MachineEntry = {
  id: string; machine_id: string; owner_id: string;
  type: "payout" | "income"; amount: number;
  note: string | null; entry_date: string; created_at: string;
  cashier_id: string | null; cashier_name: string | null;
  proof_image_url: string | null;
};
type FloatSession = {
  id: string; owner_id: string;
  amount: number; set_at: string; created_at: string;
};

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
// Whole-number formatter for hero stat cards — no cents
function fmtWhole(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function todayISO() { return new Date().toISOString().slice(0, 10); }
function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}

// ── Stat Card ──────────────────────────────────────────────────────────────────
function StatCard({ label, value, color, icon: Icon }: {
  label: string; value: string; color: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-2xl p-3 flex flex-col gap-1 text-center"
      style={{ background: "oklch(0.18 0.02 60)" }}>
      <div className="flex items-center justify-center gap-1 text-[10px] font-semibold text-white/50">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="font-black text-sm leading-tight" style={{ color }}>{value}</div>
    </div>
  );
}

// ── Small Stat ─────────────────────────────────────────────────────────────────
function SmallStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl px-3 py-2 flex flex-col gap-0.5 text-center"
      style={{ background: "oklch(0.22 0.02 60)" }}>
      <div className="text-[9px] font-semibold text-white/40 uppercase tracking-wider">{label}</div>
      <div className="font-black text-xs" style={{ color }}>{value}</div>
    </div>
  );
}

// ── History Month Accordion ────────────────────────────────────────────────────
function HistoryMonthAccordion({ entries, loading, downloading, deletingId, onDownloadAll, onDownloadMonth, onDelete, onLightbox, isCashier }: {
  entries: MachineEntry[];
  loading: boolean;
  downloading: boolean;
  deletingId: string | null;
  onDownloadAll: () => void;
  onDownloadMonth: (monthKey: string, monthEntries: MachineEntry[]) => void;
  onDelete: (id: string) => void;
  onLightbox: (url: string) => void;
  isCashier: boolean;
}) {
  const [openMonth, setOpenMonth] = useState<string | null>(null);
  const [downloadingMonth, setDownloadingMonth] = useState<string | null>(null);

  // Sort all entries newest first
  const allSorted = [...entries].sort((a, b) => b.created_at.localeCompare(a.created_at));
  // The globally newest entry — only this one gets the undo/delete button.
  // Once it's deleted it's gone from entries so the button naturally disappears.
  const newestId = allSorted[0]?.id ?? null;

  // Group by YYYY-MM
  const byMonth: Record<string, MachineEntry[]> = {};
  allSorted.forEach((e) => {
    const mk = e.created_at.slice(0, 7); // "YYYY-MM"
    if (!byMonth[mk]) byMonth[mk] = [];
    byMonth[mk].push(e);
  });
  const monthKeys = Object.keys(byMonth).sort((a, b) => b.localeCompare(a));

  const monthLabel = (mk: string) => {
    const [yr, mo] = mk.split("-");
    return new Date(Number(yr), Number(mo) - 1, 1)
      .toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  };

  const handleMonthPdf = async (mk: string) => {
    setDownloadingMonth(mk);
    await onDownloadMonth(mk, byMonth[mk]);
    setDownloadingMonth(null);
  };

  if (loading) {
    return <div className="space-y-2">{[0,1,2].map(i => <div key={i} className="h-16 rounded-xl bg-muted/30 animate-pulse" />)}</div>;
  }

  if (entries.length === 0) {
    return <div className="text-center py-12 text-muted-foreground text-sm">No records yet.</div>;
  }

  return (
    <div className="space-y-3">
      {/* Top bar — record count + Download All */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{entries.length} records</span>
        <Button size="sm" variant="outline" className="h-9 gap-1.5 font-bold"
          disabled={downloading || entries.length === 0} onClick={onDownloadAll}>
          {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          Download All
        </Button>
      </div>

      {/* Month accordions */}
      <div className="space-y-2">
        {monthKeys.map((mk) => {
          const mEntries = byMonth[mk];
          const mPayout = mEntries.filter(e => e.type === "payout").reduce((s, e) => s + Number(e.amount), 0);
          const mIncome = mEntries.filter(e => e.type === "income").reduce((s, e) => s + Number(e.amount), 0);
          const mProfit = mIncome - mPayout;
          const isOpen = openMonth === mk;
          return (
            <div key={mk} className="rounded-2xl border border-border overflow-hidden"
              style={{ background: "var(--gradient-card)" }}>
              {/* Month header */}
              <button
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/20 transition"
                onClick={() => setOpenMonth(isOpen ? null : mk)}>
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-black text-sm">{monthLabel(mk)}</span>
                  <span className="text-xs text-muted-foreground">{mEntries.length} records</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs font-black ${mProfit >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {mProfit >= 0 ? "+" : ""}${fmtWhole(mProfit)}
                  </span>
                  <button
                    onClick={(ev) => { ev.stopPropagation(); handleMonthPdf(mk); }}
                    disabled={downloadingMonth === mk}
                    className="h-7 px-2 rounded-lg flex items-center gap-1 text-xs font-bold border border-border hover:bg-muted/50 transition disabled:opacity-50"
                    title="Download this month PDF">
                    {downloadingMonth === mk
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <Download className="h-3 w-3" />}
                    PDF
                  </button>
                  <span className={`transition-transform text-muted-foreground text-sm ${isOpen ? "rotate-180" : ""}`}>▾</span>
                </div>
              </button>

              {/* Expanded rows */}
              {isOpen && (
                <div className="border-t border-border divide-y divide-border/40">
                  {mEntries.map((e) => {
                    const isPayout = e.type === "payout";
                    const isNewest = e.id === newestId;
                    const hasProof = !!e.proof_image_url;
                    return (
                      <div key={e.id} className="px-4 py-3 flex items-start gap-3">
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 border text-xs font-black ${
                          isPayout ? "bg-red-500/15 border-red-500/30 text-red-400" : "bg-green-500/15 border-green-500/30 text-green-400"
                        }`}>
                          {isPayout ? "P" : "I"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-muted-foreground">
                            {new Date(e.created_at).toLocaleString("en-GB", {
                              day: "numeric", month: "short", year: "numeric",
                              hour: "2-digit", minute: "2-digit", hour12: true,
                            })}
                          </div>
                          <div className={`font-black text-sm ${isPayout ? "text-red-400" : "text-green-400"}`}>
                            {isPayout ? "-" : "+"}${fmt(Number(e.amount))}
                          </div>
                          {!isPayout && (
                            <div className="text-xs font-semibold text-green-400/70 mt-0.5">Machine cleared by owner</div>
                          )}
                          {e.note && <div className="text-xs text-muted-foreground mt-0.5">{e.note}</div>}
                          {e.cashier_name && (
                            <div className="text-[10px] text-white/30 mt-0.5">
                              {isPayout ? "Paid by" : "Cleared by"}: {e.cashier_name}
                            </div>
                          )}
                          {isPayout && !hasProof && (
                            <div className="flex items-center gap-1 mt-1">
                              <AlertTriangle className="h-3 w-3 text-amber-400 shrink-0" />
                              <span className="text-[10px] font-bold text-amber-400">Unverified</span>
                            </div>
                          )}
                        </div>
                        {/* Proof photo — landscape, right side */}
                        {isPayout && hasProof && (
                          <button
                            onClick={() => onLightbox(e.proof_image_url!)}
                            className="shrink-0 rounded-xl overflow-hidden border border-green-500/30 active:opacity-80 transition"
                            style={{ width: 100, height: 65 }}>
                            <img src={e.proof_image_url!} alt="proof" className="w-full h-full object-cover" />
                          </button>
                        )}
                        {isNewest && !deletingId && isPayout && !isCashier && (
                          <button onClick={() => onDelete(e.id)}
                            className="h-8 w-8 rounded-full flex items-center justify-center bg-red-600 active:scale-95 transition shrink-0">
                            <Trash2 className="h-3.5 w-3.5 text-white" />
                          </button>
                        )}
                        {isNewest && deletingId === e.id && isPayout && !isCashier && (
                          <div className="h-8 w-8 rounded-full flex items-center justify-center bg-red-600 shrink-0 opacity-50">
                            <Loader2 className="h-3.5 w-3.5 text-white animate-spin" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Machine Detail Page ────────────────────────────────────────────────────────
function MachineDetail({ machine, screenNumber, ownerId, profile, floatSession, remainingFloat, onBack, onDeleted }: {
  machine: Machine; screenNumber: number; ownerId: string;
  profile: { id: string; username?: string; role?: string };
  floatSession: FloatSession | null;
  remainingFloat: number | null;
  onBack: () => void; onDeleted: () => void;
}) {
  const [entries, setEntries] = useState<MachineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const isCashier = profile.role === "cashier";
  const [tab, setTab] = useState<"payout" | "income" | "history">("payout");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [showDeleteMachine, setShowDeleteMachine] = useState(false);
  const [deletingMachine, setDeletingMachine] = useState(false);
  // Session anchor — ISO timestamp of the last income entry (machine cleared).
  const [sessionAnchor, setSessionAnchor] = useState<string | null>(null);

  // Proof photo — in-app camera using getUserMedia so music keeps playing
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [camOpen, setCamOpen] = useState(false);
  const [camStream, setCamStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const openCam = async () => {
    try {
      // Try rear camera first, fall back to any available camera
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { exact: "environment" } }, audio: false });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      setCamStream(stream);
      setCamOpen(true);
      setTimeout(() => { if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); } }, 50);
    } catch { toast.error("Camera not available"); }
  };

  const closeCam = () => {
    camStream?.getTracks().forEach(t => t.stop());
    setCamStream(null);
    setCamOpen(false);
  };

  const snapPhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    canvas.toBlob(blob => {
      if (!blob) return;
      const file = new File([blob], `proof-${Date.now()}.jpg`, { type: "image/jpeg" });
      setProofFile(file);
      setProofPreview(URL.createObjectURL(file));
      closeCam();
    }, "image/jpeg", 0.85);
  };
  // Lightbox — in-app full-screen image viewer
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // Stop camera stream when component unmounts
  useEffect(() => () => { camStream?.getTracks().forEach(t => t.stop()); }, [camStream]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await sb.from("machine_entries").select("*")
      .eq("machine_id", machine.id).order("entry_date", { ascending: false })
      .order("created_at", { ascending: false });
    const rows = (data ?? []) as MachineEntry[];
    setEntries(rows);
    // Auto-set session anchor to the most recent income entry's created_at.
    // This means session stats always start fresh after the last machine clear.
    const lastIncome = rows.find(e => e.type === "income");
    setSessionAnchor(prev => {
      // Only auto-set on first load; after that it's driven by handleSave resets.
      if (prev !== null) return prev;
      return lastIncome?.created_at ?? null;
    });
    setLoading(false);
  }, [machine.id]);

  useEffect(() => { load(); }, [load]);

  // Realtime — entries for this machine + float sessions so the second row stays live
  useEffect(() => {
    const ch = supabase.channel(`machine-detail-${machine.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "machine_entries",
        filter: `machine_id=eq.${machine.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [machine.id, load]);

  // ── All-time totals ────────────────────────────────────────────────────────
  const totalPayout = entries.filter(e => e.type === "payout").reduce((s, e) => s + Number(e.amount), 0);
  const totalIncome = entries.filter(e => e.type === "income").reduce((s, e) => s + Number(e.amount), 0);
  const totalProfit = totalIncome - totalPayout;

  // ── Session totals — payouts/income since the last machine clear (income entry).
  // If there's never been a clear, counts everything (anchor = null = all time).
  const sessionPayouts = entries
    .filter(e => e.type === "payout" && (!sessionAnchor || new Date(e.created_at) > new Date(sessionAnchor)))
    .reduce((s, e) => s + Number(e.amount), 0);
  const sessionIncome = entries
    .filter(e => e.type === "income" && (!sessionAnchor || new Date(e.created_at) > new Date(sessionAnchor)))
    .reduce((s, e) => s + Number(e.amount), 0);
  const sessionProfit = sessionIncome - sessionPayouts;

  // Remaining float — use the owner-wide remainingFloat prop (all machines combined).
  // This is kept live by the parent's realtime channel on machine_float_sessions + machine_entries.
  // We do NOT recompute locally — that would only subtract THIS machine's payouts which is wrong.

  const handleSave = async () => {
    const val = parseFloat(amount);
    if (isNaN(val) || val <= 0) { toast.error("Enter a valid amount"); return; }
    setBusy(true);
    const now = new Date();

    // Upload proof photo if captured
    let proof_image_url: string | null = null;
    if (proofFile) {
      const ext = proofFile.name.split(".").pop() || "jpg";
      const path = `machine-payouts/${ownerId}/${machine.id}/${now.getTime()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("product-images")
        .upload(path, proofFile, { upsert: false });
      if (upErr) {
        toast.error("Photo upload failed: " + upErr.message);
        setBusy(false);
        return;
      }
      proof_image_url = supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
    }

    const { error } = await sb.from("machine_entries").insert({
      machine_id: machine.id, owner_id: ownerId,
      type: tab as "payout" | "income",
      amount: val, note: null,
      entry_date: now.toISOString().slice(0, 10),
      created_at: now.toISOString(),
      cashier_id: profile.id,
      cashier_name: profile.username ?? null,
      proof_image_url,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }

    if (tab === "income") {
      setSessionAnchor(now.toISOString());
    }

    // Clear proof photo state
    setProofFile(null);
    setProofPreview(null);

    toast.success(tab === "payout" ? "Payout recorded" : "Amount recorded");
    setAmount("");
    load();
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    const { error } = await sb.from("machine_entries").delete().eq("id", id);
    setDeletingId(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Record deleted");
    load();
  };

  const handleDownloadPdf = async () => {
    // Download ALL entries for this machine
    setDownloading(true);
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "mm", format: "a4" });
      const generated = new Date().toLocaleString("en-GB", {
        hour: "2-digit", minute: "2-digit", hour12: true,
        day: "numeric", month: "short", year: "numeric",
      });
      let y = await drawHeader(doc, machine.name, "Machine Records", "Full History", generated);
      const bw = RM - LM;
      doc.setFillColor(245, 240, 230);
      doc.roundedRect(LM, y, bw, 26, 2, 2, "F");
      doc.setDrawColor(232, 146, 42); doc.setLineWidth(0.4);
      doc.roundedRect(LM, y, bw, 26, 2, 2, "S");
      const cols = [
        { label: "Total Payout", value: "-$" + fmt(totalPayout), r: 180, g: 40,  b: 40 },
        { label: "Total Income", value: "+$" + fmt(totalIncome), r: 40,  g: 140, b: 40 },
        { label: "Total Profit", value: (totalProfit >= 0 ? "+" : "") + "$" + fmt(totalProfit),
          r: totalProfit >= 0 ? 40 : 180, g: totalProfit >= 0 ? 140 : 40, b: 40 },
      ];
      const cw = bw / 3;
      cols.forEach((c, i) => {
        const cx = LM + i * cw + cw / 2;
        doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(100, 100, 100);
        doc.text(c.label, cx, y + 10, { align: "center" });
        doc.setFont("helvetica", "bold"); doc.setFontSize(9);
        doc.setTextColor(c.r, c.g, c.b);
        doc.text(c.value, cx, y + 19, { align: "center" });
      });
      doc.setTextColor(0, 0, 0); y += 32;
      doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(130, 130, 130);
      doc.text("DATE / TIME", LM, y); doc.text("TYPE", LM + 100, y); doc.text("AMOUNT", RM, y, { align: "right" });
      y += 3; doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.2); doc.line(LM, y, RM, y); y += 5;
      doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(0, 0, 0);
      const allSorted = [...entries].sort((a, b) => b.created_at.localeCompare(a.created_at));
      allSorted.forEach((e) => {
        if (y > CONTENT_BOTTOM) { doc.addPage(); y = 20; }
        const dateStr = new Date(e.created_at).toLocaleString("en-GB", {
          day: "numeric", month: "short", year: "numeric",
          hour: "2-digit", minute: "2-digit", hour12: true,
        });
        doc.setFont("helvetica", "bold"); doc.setTextColor(0, 0, 0);
        doc.text(dateStr, LM, y);
        doc.setTextColor(e.type === "payout" ? 180 : 40, e.type === "payout" ? 40 : 140, 40);
        doc.text(e.type.toUpperCase(), LM + 100, y);
        doc.text((e.type === "payout" ? "-" : "+") + "$" + fmt(Number(e.amount)), RM, y, { align: "right" });
        doc.setTextColor(0, 0, 0); doc.setFont("helvetica", "normal"); y += 5;
        if (e.note) {
          doc.setFontSize(8); doc.setTextColor(100, 100, 100);
          doc.text("  " + e.note, LM, y); doc.setFontSize(9); doc.setTextColor(0, 0, 0); y += 4;
        }
        doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.1); doc.line(LM, y, RM, y); y += 4;
      });
      addFootersToAllPages(doc);
      await downloadPdf(`machine-${machine.name.replace(/\s+/g, "-")}-all.pdf`, doc.output("datauristring"));
      toast.success("PDF saved");
    } catch (err: any) { toast.error("PDF failed: " + err?.message); }
    finally { setDownloading(false); }
  };

  const handleDownloadMonthPdf = async (monthKey: string, monthEntries: MachineEntry[]) => {
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "mm", format: "a4" });
      const generated = new Date().toLocaleString("en-GB", {
        hour: "2-digit", minute: "2-digit", hour12: true,
        day: "numeric", month: "short", year: "numeric",
      });
      const [yr, mo] = monthKey.split("-");
      const monthLabel = new Date(Number(yr), Number(mo) - 1, 1)
        .toLocaleDateString("en-GB", { month: "long", year: "numeric" });
      let y = await drawHeader(doc, machine.name, "Machine Records", monthLabel, generated);
      const bw = RM - LM;
      const mPayout = monthEntries.filter(e => e.type === "payout").reduce((s, e) => s + Number(e.amount), 0);
      const mIncome = monthEntries.filter(e => e.type === "income").reduce((s, e) => s + Number(e.amount), 0);
      const mProfit = mIncome - mPayout;
      doc.setFillColor(245, 240, 230);
      doc.roundedRect(LM, y, bw, 26, 2, 2, "F");
      doc.setDrawColor(232, 146, 42); doc.setLineWidth(0.4);
      doc.roundedRect(LM, y, bw, 26, 2, 2, "S");
      const cols = [
        { label: "Month Payout", value: "-$" + fmt(mPayout), r: 180, g: 40,  b: 40 },
        { label: "Month Income", value: "+$" + fmt(mIncome), r: 40,  g: 140, b: 40 },
        { label: "Month Profit", value: (mProfit >= 0 ? "+" : "") + "$" + fmt(mProfit),
          r: mProfit >= 0 ? 40 : 180, g: mProfit >= 0 ? 140 : 40, b: 40 },
      ];
      const cw = bw / 3;
      cols.forEach((c, i) => {
        const cx = LM + i * cw + cw / 2;
        doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(100, 100, 100);
        doc.text(c.label, cx, y + 10, { align: "center" });
        doc.setFont("helvetica", "bold"); doc.setFontSize(9);
        doc.setTextColor(c.r, c.g, c.b);
        doc.text(c.value, cx, y + 19, { align: "center" });
      });
      doc.setTextColor(0, 0, 0); y += 32;
      doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(130, 130, 130);
      doc.text("DATE / TIME", LM, y); doc.text("TYPE", LM + 100, y); doc.text("AMOUNT", RM, y, { align: "right" });
      y += 3; doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.2); doc.line(LM, y, RM, y); y += 5;
      doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(0, 0, 0);
      monthEntries.forEach((e) => {
        if (y > CONTENT_BOTTOM) { doc.addPage(); y = 20; }
        const dateStr = new Date(e.created_at).toLocaleString("en-GB", {
          day: "numeric", month: "short", year: "numeric",
          hour: "2-digit", minute: "2-digit", hour12: true,
        });
        doc.setFont("helvetica", "bold"); doc.setTextColor(0, 0, 0);
        doc.text(dateStr, LM, y);
        doc.setTextColor(e.type === "payout" ? 180 : 40, e.type === "payout" ? 40 : 140, 40);
        doc.text(e.type.toUpperCase(), LM + 100, y);
        doc.text((e.type === "payout" ? "-" : "+") + "$" + fmt(Number(e.amount)), RM, y, { align: "right" });
        doc.setTextColor(0, 0, 0); doc.setFont("helvetica", "normal"); y += 5;
        if (e.note) {
          doc.setFontSize(8); doc.setTextColor(100, 100, 100);
          doc.text("  " + e.note, LM, y); doc.setFontSize(9); doc.setTextColor(0, 0, 0); y += 4;
        }
        doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.1); doc.line(LM, y, RM, y); y += 4;
      });
      addFootersToAllPages(doc);
      const safeMonth = monthLabel.replace(/\s+/g, "-");
      await downloadPdf(`machine-${machine.name.replace(/\s+/g, "-")}-${safeMonth}.pdf`, doc.output("datauristring"));
      toast.success("PDF saved");
    } catch (err: any) { toast.error("PDF failed: " + err?.message); }
  };

  const handleDeleteMachine = async (wipeRecords: boolean) => {
    setDeletingMachine(true);
    if (wipeRecords) {
      // Delete all entries first so wallet balances reflect the removal
      await sb.from("machine_entries").delete().eq("machine_id", machine.id);
    }
    // Then delete the machine itself (entries cascade if any remain)
    const { error } = await sb.from("machines").delete().eq("id", machine.id);
    setDeletingMachine(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${machine.name} deleted`);
    setShowDeleteMachine(false);
    onDeleted();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden"
      style={{ background: "var(--background)" }}>
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 px-3 border-b border-border bg-background/95 backdrop-blur z-10"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.5rem)", paddingBottom: "0.5rem" }}>
        <button onClick={onBack}
          className="h-9 w-9 rounded-full flex items-center justify-center bg-muted active:scale-95 transition shrink-0">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="font-black text-lg flex-1 truncate">
          Screen {screenNumber} — {machine.name}
        </h1>
        {!isCashier && (
          <button onClick={() => setShowDeleteMachine(true)}
            className="h-9 w-9 rounded-full flex items-center justify-center bg-red-600 active:scale-95 transition shrink-0">
            <Trash2 className="h-4 w-4 text-white" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
        {/* Hero */}
        <section className="rounded-3xl p-5 relative overflow-hidden space-y-3"
          style={{ background: "var(--gradient-hero)", boxShadow: "var(--shadow-glow)" }}>
          <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
          {/* Machine title */}
          <div className="relative flex items-center gap-2">
            <Gamepad2 className="h-4 w-4 text-primary-foreground/70 shrink-0" />
            <span className="font-black text-base text-primary-foreground leading-tight truncate">
              {machine.name}
            </span>
          </div>
          <div className="relative grid grid-cols-3 gap-2">
            <StatCard label="Total Payout" value={"$" + fmtWhole(totalPayout)} color="#fca5a5" icon={TrendingDown} />
            <StatCard label="Total Income" value={"$" + fmtWhole(totalIncome)} color="#86efac" icon={TrendingUp} />
            <StatCard label="Total Profit"
              value={(totalProfit >= 0 ? "+" : "") + "$" + fmtWhole(totalProfit)}
              color={totalProfit >= 0 ? "#86efac" : "#fca5a5"} icon={DollarSign} />
          </div>
          <div className="relative grid grid-cols-3 gap-2">
            <SmallStat label="Session Float" value={floatSession ? "$" + fmtWhole(Number(floatSession.amount)) : "—"} color="#fbbf24" />
            <SmallStat label="Session Payout" value={"$" + fmtWhole(sessionPayouts)} color="#fca5a5" />
            <SmallStat label="Remaining"
              value={remainingFloat === null ? "—" : (remainingFloat >= 0 ? "" : "-") + "$" + fmtWhole(Math.abs(remainingFloat))}
              color={remainingFloat === null ? "oklch(0.45 0.02 60)" : remainingFloat >= 0 ? "#86efac" : "#fca5a5"} />
          </div>
        </section>

        {/* Tabs */}
        <div className="flex gap-1 rounded-2xl p-1" style={{ background: "var(--gradient-card)" }}>
          {(["payout", ...(!isCashier ? ["income"] : []), "history"] as ("payout" | "income" | "history")[]).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-black capitalize transition ${
                tab === t ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
              style={tab === t ? { background: "var(--gradient-hero)" } : {}}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* Payout / Income entry form */}
        {(tab === "payout" || tab === "income") && (
          <div className="rounded-2xl border border-border p-4 space-y-3"
            style={{ background: "var(--gradient-card)" }}>
            <h2 className="font-black text-sm">
              {tab === "payout" ? "Record Payout" : "Record amount cleared from machine"}
            </h2>
            {/* Amount display + Numpad — hidden when camera is open */}
            {!camOpen && (
              <>
            <div className="rounded-2xl px-5 py-4 text-center"
              style={{ background: "oklch(0.18 0.04 60)", border: "1px solid oklch(0.28 0.08 60)" }}>
              <span className="font-black text-4xl" style={{ color: "oklch(0.82 0.18 65)" }}>
                ${amount === "" ? "0" : amount}
              </span>
            </div>
            {/* Numpad */}
            <div className="grid grid-cols-3 gap-2">
              {["7","8","9","4","5","6","1","2","3"].map(k => (
                <button key={k} type="button"
                  onClick={() => {
                    const parts = amount.split(".");
                    if (parts[1] !== undefined && parts[1].length >= 2) return;
                    setAmount(prev => prev + k);
                  }}
                  className="rounded-2xl py-4 text-xl font-black active:scale-95 transition"
                  style={{ background: "oklch(0.20 0.05 60)", color: "#fff" }}>
                  {k}
                </button>
              ))}
              <button type="button"
                onClick={() => { if (!amount.includes(".")) setAmount(prev => prev + "."); }}
                className="rounded-2xl py-4 text-xl font-black active:scale-95 transition"
                style={{ background: "oklch(0.20 0.05 60)", color: "#fff" }}>
                .
              </button>
              <button type="button"
                onClick={() => {
                  const parts = amount.split(".");
                  if (parts[1] !== undefined && parts[1].length >= 2) return;
                  setAmount(prev => prev + "0");
                }}
                className="rounded-2xl py-4 text-xl font-black active:scale-95 transition"
                style={{ background: "oklch(0.20 0.05 60)", color: "#fff" }}>
                0
              </button>
              <button type="button"
                onClick={() => setAmount(prev => prev.slice(0, -1))}
                className="rounded-2xl py-4 text-xl font-black active:scale-95 transition"
                style={{ background: "oklch(0.20 0.05 60)", color: "oklch(0.75 0.15 65)" }}>
                ⌫
              </button>
            </div>
              </>
            )}

            {/* Proof photo — payout only, optional */}
            {tab === "payout" && (
              <div>
                <canvas ref={canvasRef} className="hidden" />
                {camOpen ? (
                  <div className="rounded-2xl overflow-hidden border-2 border-amber-500/40 relative"
                    style={{ background: "#000" }}>
                    <video ref={videoRef} autoPlay playsInline muted
                      className="w-full max-h-56 object-cover" />
                    <div className="flex gap-2 p-2">
                      <button type="button" onClick={closeCam}
                        className="flex-1 h-10 rounded-xl font-black text-sm bg-muted text-muted-foreground active:scale-95 transition">
                        Cancel
                      </button>
                      <button type="button" onClick={snapPhoto}
                        className="flex-1 h-10 rounded-xl font-black text-sm text-white active:scale-95 transition"
                        style={{ background: "var(--gradient-hero)" }}>
                        📸 Snap
                      </button>
                    </div>
                  </div>
                ) : proofPreview ? (
                  <div className="relative rounded-2xl overflow-hidden border-2 border-green-500/40"
                    style={{ background: "oklch(0.18 0.04 145 / 0.3)" }}>
                    <img src={proofPreview} alt="proof" className="w-full max-h-40 object-cover" />
                    <button type="button"
                      onClick={() => { setProofFile(null); setProofPreview(null); }}
                      className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/60 flex items-center justify-center active:scale-90 transition">
                      <X className="h-3.5 w-3.5 text-white" />
                    </button>
                    <div className="px-3 py-1.5 flex items-center gap-1.5">
                      <div className="h-2 w-2 rounded-full bg-green-400" />
                      <span className="text-xs font-bold text-green-400">Photo captured</span>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={openCam}
                    className="w-full rounded-2xl py-3 flex items-center justify-center gap-2 font-black text-sm active:scale-95 transition border-2 border-dashed"
                    style={{ borderColor: "oklch(0.38 0.08 60)", color: "oklch(0.65 0.12 65)", background: "oklch(0.18 0.03 60 / 0.4)" }}>
                    <Camera className="h-4 w-4" />
                    Take Proof Photo <span className="text-xs font-normal opacity-60">(optional)</span>
                  </button>
                )}
              </div>
            )}

            <Button onClick={handleSave} disabled={busy || !amount}
              className="w-full h-12 font-black text-base"
              style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : tab === "payout" ? "Save Payout" : "Save"}
            </Button>
          </div>
        )}

        {/* History tab */}
        {tab === "history" && (
          <HistoryMonthAccordion
            entries={entries}
            loading={loading}
            downloading={downloading}
            deletingId={deletingId}
            onDownloadAll={handleDownloadPdf}
            onDownloadMonth={handleDownloadMonthPdf}
            onDelete={handleDelete}
            onLightbox={(url) => setLightboxUrl(url)}
            isCashier={isCashier}
          />
        )}
      </div>

      {/* Delete machine confirm modal — two options: keep or wipe records */}
      {showDeleteMachine && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-red-500/40 shadow-2xl overflow-hidden"
            style={{ background: "var(--gradient-card)" }}>
            <div className="px-6 pt-6 pb-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-xl flex items-center justify-center bg-red-500/15 border border-red-500/30 shrink-0">
                  <Trash2 className="h-5 w-5 text-red-400" />
                </div>
                <h2 className="font-black text-lg">Delete {machine.name}?</h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Choose what happens to the payout and income records for this machine.
              </p>
              <div className="space-y-2">
                <button
                  disabled={deletingMachine}
                  onClick={() => handleDeleteMachine(false)}
                  className="w-full flex items-start gap-3 rounded-2xl border border-border p-3 text-left hover:bg-muted/30 transition active:scale-[0.98] disabled:opacity-50"
                  style={{ background: "var(--gradient-card)" }}>
                  <div className="h-8 w-8 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-sm">📁</span>
                  </div>
                  <div>
                    <div className="font-black text-sm">Remove Card Only</div>
                    <div className="text-xs text-muted-foreground mt-0.5">Remove this machine from the app. All payout/income totals stay intact in All History.</div>
                  </div>
                </button>
                <button
                  disabled={deletingMachine}
                  onClick={() => handleDeleteMachine(true)}
                  className="w-full flex items-start gap-3 rounded-2xl border border-red-500/30 p-3 text-left hover:bg-red-500/10 transition active:scale-[0.98] disabled:opacity-50">
                  <div className="h-8 w-8 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center shrink-0 mt-0.5">
                    <Trash2 className="h-4 w-4 text-red-400" />
                  </div>
                  <div>
                    <div className="font-black text-sm text-red-400">Delete Everything</div>
                    <div className="text-xs text-muted-foreground mt-0.5">Remove the machine card AND wipe all its payout/income history. Cannot be undone.</div>
                  </div>
                </button>
              </div>
            </div>
            <div className="px-6 pb-6">
              <Button variant="outline" className="w-full h-12 font-black"
                onClick={() => setShowDeleteMachine(false)} disabled={deletingMachine}>
                {deletingMachine ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cancel"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Lightbox ── */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/90 backdrop-blur-sm"
          onClick={() => setLightboxUrl(null)}
        >
          <img
            src={lightboxUrl}
            alt="proof"
            className="rounded-2xl shadow-2xl"
            style={{ maxWidth: "92vw", maxHeight: "88vh", objectFit: "contain" }}
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 h-10 w-10 rounded-full flex items-center justify-center bg-black/60 border border-white/20 text-white active:scale-90 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Create Tab ─────────────────────────────────────────────────────────────────
function CreateTab({ ownerId, onCreated }: { ownerId: string; onCreated: (m: Machine) => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    const { data, error } = await sb.from("machines")
      .insert({ owner_id: ownerId, name: name.trim() })
      .select().single();
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Machine created");
    setName("");
    onCreated(data as Machine);
  };

  return (
    <form onSubmit={submit} className="rounded-2xl border border-border p-4 space-y-4"
      style={{ background: "var(--gradient-card)" }}>
      <h2 className="font-black text-sm">New Machine</h2>
      <div>
        <Label className="text-xs">Machine Name</Label>
        <Input value={name} onChange={e => setName(e.target.value)}
          placeholder="e.g. Lucky Star, Pool Table 1" className="mt-1 h-11" required />
      </div>
      <Button type="submit" disabled={busy || !name.trim()}
        className="w-full h-12 font-black text-base"
        style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4 mr-2" />Create Machine</>}
      </Button>
    </form>
  );
}

// ── Screens Tab (machine grid + hero) ─────────────────────────────────────────
function ScreensTab({ machines: initialMachines, entries, ownerId, profileId, onSelect, floatSession, remainingFloat, isCashier, onSetFloat, onDeleteMachine }: {
  machines: Machine[]; entries: MachineEntry[];
  ownerId: string;
  profileId: string;
  onSelect: (m: Machine, screenNum: number) => void;
  floatSession: FloatSession | null;
  remainingFloat: number | null;
  isCashier: boolean;
  onSetFloat: () => void;
  onDeleteMachine: (id: string) => void;
}) {
  const totalPayout = entries.filter(e => e.type === "payout").reduce((s, e) => s + Number(e.amount), 0);
  const totalIncome = entries.filter(e => e.type === "income").reduce((s, e) => s + Number(e.amount), 0);
  const totalProfit = totalIncome - totalPayout;

  const sessionPayouts = floatSession
    ? entries
        .filter(e => e.type === "payout" && new Date(e.created_at) >= new Date(floatSession.set_at))
        .reduce((s, e) => s + Number(e.amount), 0)
    : 0;

  const [orderedMachines, setOrderedMachines] = useState<Machine[]>(() =>
    [...initialMachines].sort((a, b) =>
      a.sort_order !== b.sort_order ? a.sort_order - b.sort_order : a.created_at.localeCompare(b.created_at)
    )
  );
  const [editMode, setEditMode] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editModeRef = useRef(false);
  const orderedRef = useRef<Machine[]>(orderedMachines);
  const draggingRef = useRef<string | null>(null);
  // Keep ref in sync with state so closures always see the latest value
  useEffect(() => { editModeRef.current = editMode; }, [editMode]);
  useEffect(() => { orderedRef.current = orderedMachines; }, [orderedMachines]);

  // Clear timer on unmount
  useEffect(() => () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  }, []);

  // Reset edit state on mount (covers tab switches where ScreensTab remounts)
  // Also force-restore touch-action on the document in case a previous drag
  // session on another page left it locked — this is the self-healing mechanism.
  useEffect(() => {
    document.body.style.touchAction = "";
    document.documentElement.style.touchAction = "";
    editModeRef.current = false;
    setEditMode(false);
    draggingRef.current = null;
    setDraggingId(null);
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync when machines change — never during drag/edit
  useEffect(() => {
    if (editModeRef.current) return;
    const sorted = [...initialMachines].sort((a, b) =>
      a.sort_order !== b.sort_order ? a.sort_order - b.sort_order : a.created_at.localeCompare(b.created_at)
    );
    orderedRef.current = sorted;
    setOrderedMachines(sorted);
  }, [initialMachines]); // eslint-disable-line react-hooks/exhaustive-deps

  // Save only called from handleDone — not on every drop
  const saveOrder = async (newOrder: Machine[]) => {
    setSavingOrder(true);
    await Promise.all(
      newOrder.map((m, idx) =>
        (supabase as any).from("machines").update({ sort_order: idx }).eq("id", m.id)
      )
    );
    setSavingOrder(false);
  };

  const handleDone = async () => {
    document.body.style.touchAction = "";
    document.documentElement.style.touchAction = "";
    editModeRef.current = false;
    setEditMode(false);
    draggingRef.current = null;
    setDraggingId(null);
    await saveOrder(orderedRef.current);
  };

  const handleDragStart = (id: string) => {
    draggingRef.current = id;
    setDraggingId(id);
  };

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const dragging = draggingRef.current;
    if (!dragging || dragging === targetId) return;
    const current = orderedRef.current;
    const from = current.findIndex(m => m.id === dragging);
    const to   = current.findIndex(m => m.id === targetId);
    if (from === -1 || to === -1) return;
    const next = [...current];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    orderedRef.current = next;
    setOrderedMachines(next);
  };

  const handleDrop = () => {
    draggingRef.current = null;
    setDraggingId(null);
    // No save here — save happens on Done
  };

  const startLongPress = () => {
    if (editModeRef.current) return;
    if (isCashier) return; // cashiers cannot reorder machines
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => {
      longPressTimer.current = null;
      editModeRef.current = true;
      setEditMode(true);
    }, 600);
  };
  const cancelLongPress = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  };

  if (initialMachines.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Gamepad2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
        <p className="font-semibold text-sm">No machines yet</p>
        <p className="text-xs mt-1">Use the Create tab to add your first machine.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* All-machines hero */}
      <section className="rounded-3xl p-5 relative overflow-hidden space-y-3"
        style={{ background: "var(--gradient-hero)", boxShadow: "var(--shadow-glow)" }}>
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
        <div className="relative grid grid-cols-3 gap-2">
          <StatCard label="All Payouts" value={"$" + fmtWhole(totalPayout)} color="#fca5a5" icon={TrendingDown} />
          <StatCard label="All Income"  value={"$" + fmtWhole(totalIncome)} color="#86efac" icon={TrendingUp} />
          <StatCard label="All Profit"
            value={(totalProfit >= 0 ? "+" : "") + "$" + fmtWhole(totalProfit)}
            color={totalProfit >= 0 ? "#86efac" : "#fca5a5"} icon={DollarSign} />
        </div>
        {/* Float row */}
        <div className="relative grid grid-cols-3 gap-2">
          <div className="rounded-xl px-2 py-2 flex flex-col gap-0.5 text-center"
            style={{ background: "oklch(0.22 0.02 60)" }}>
            <div className="text-[9px] font-semibold text-white/40 uppercase tracking-wider">Float Set</div>
            <div className="font-black text-xs" style={{ color: "#fbbf24" }}>
              {floatSession ? "$" + fmtWhole(Number(floatSession.amount)) : "—"}
            </div>
          </div>
          <div className="rounded-xl px-2 py-2 flex flex-col gap-0.5 text-center"
            style={{ background: "oklch(0.22 0.02 60)" }}>
            <div className="text-[9px] font-semibold text-white/40 uppercase tracking-wider">Session Payout</div>
            <div className="font-black text-xs" style={{ color: "#fca5a5" }}>
              {floatSession ? "$" + fmtWhole(sessionPayouts) : "—"}
            </div>
          </div>
          <div className="rounded-xl px-2 py-2 flex flex-col gap-0.5 text-center"
            style={{ background: "oklch(0.22 0.02 60)" }}>
            <div className="text-[9px] font-semibold text-white/40 uppercase tracking-wider">Remaining</div>
            <div className="font-black text-xs"
              style={{ color: remainingFloat === null ? "oklch(0.45 0.02 60)" : remainingFloat >= 0 ? "#86efac" : "#fca5a5" }}>
              {remainingFloat === null ? "—" : (remainingFloat >= 0 ? "" : "-") + "$" + fmtWhole(Math.abs(remainingFloat))}
            </div>
          </div>
        </div>
        {/* Set Float button — owner only */}
        {!isCashier && (
          <div className="relative">
            <button onClick={onSetFloat}
              className="w-full py-2 rounded-xl text-xs font-black active:scale-95 transition"
              style={{ background: "oklch(0.28 0.06 60)", color: "#fbbf24", border: "1px solid oklch(0.38 0.10 60)" }}>
              {floatSession ? "Update Float" : "Set Float"}
            </button>
          </div>
        )}
      </section>

      {/* Edit mode toolbar */}
      {editMode && (
        <div className="flex items-center justify-between rounded-2xl px-4 py-2.5 border border-amber-500/40"
          style={{ background: "oklch(0.20 0.05 60)" }}>
          <span className="text-xs font-black text-amber-400">Hold & drag to reorder</span>
          <button
            onClick={handleDone}
            className="text-xs font-black text-white/60 px-3 py-1.5 rounded-lg hover:bg-white/10 transition">
            Done
          </button>
        </div>
      )}

      {/* Machine grid */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        {orderedMachines.map((m, idx) => {
          const screenNum = idx + 1;
          const mPayout = entries.filter(e => e.machine_id === m.id && e.type === "payout").reduce((s, e) => s + Number(e.amount), 0);
          const mIncome = entries.filter(e => e.machine_id === m.id && e.type === "income").reduce((s, e) => s + Number(e.amount), 0);
          const mProfit = mIncome - mPayout;
          const isDragging = draggingId === m.id;

          return (
            <div key={m.id} className="relative"
              draggable={editMode}
              onDragStart={() => handleDragStart(m.id)}
              onDragOver={(e) => handleDragOver(e, m.id)}
              onDrop={handleDrop}
              onDragEnd={() => setDraggingId(null)}
              onPointerDown={startLongPress}
              onPointerUp={cancelLongPress}
              onPointerLeave={cancelLongPress}
              onContextMenu={(e) => e.preventDefault()}
              style={{ opacity: isDragging ? 0.4 : 1, transition: "opacity 0.15s", userSelect: "none", WebkitUserSelect: "none" } as React.CSSProperties}>

              {/* Base card button */}
              <button
                onClick={() => !editMode && onSelect(m, screenNum)}
                className="w-full relative flex flex-col items-center justify-between rounded-2xl overflow-hidden"
                style={{
                  minHeight: "110px",
                  background: "linear-gradient(160deg, #1a1a2e 0%, #16213e 60%, #0f3460 100%)",
                  border: editMode ? "2px solid rgba(251,146,60,0.8)" : "2px solid rgba(251,146,60,0.35)",
                  boxShadow: "0 0 12px rgba(251,146,60,0.15), inset 0 0 20px rgba(0,0,0,0.4)",
                  cursor: editMode ? "grab" : "pointer",
                }}>
                <div className="w-full h-1.5 shrink-0"
                  style={{ background: "linear-gradient(90deg, transparent, rgba(251,146,60,0.5), transparent)" }} />
                <div className="flex-1 flex flex-col items-center justify-center gap-1 px-2">
                  <span className="font-black leading-none"
                    style={{ fontSize: "clamp(1.6rem, 5vw, 2.2rem)", color: "rgba(251,146,60,0.9)",
                      textShadow: "0 0 12px rgba(251,146,60,0.6)" }}>
                    {screenNum}
                  </span>
                  <span className="text-[9px] font-black text-white/60 uppercase tracking-widest leading-tight text-center line-clamp-2 px-1">
                    {m.name}
                  </span>
                </div>
                <div className="w-full px-2 pb-1.5 flex justify-center">
                  <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                    mProfit >= 0 ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                  }`}>
                    {mProfit >= 0 ? "+" : ""}${fmtWhole(mProfit)}
                  </span>
                </div>
                <div className="w-full h-1.5 shrink-0"
                  style={{ background: "linear-gradient(90deg, transparent, rgba(251,146,60,0.4), transparent)" }} />

                {/* Edit mode overlay */}
                {editMode && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-2xl"
                    style={{ background: "rgba(255,255,255,0.12)", backdropFilter: "blur(1px)" }}>
                    <span className="font-black text-white leading-none"
                      style={{ fontSize: "clamp(1.4rem, 4vw, 1.8rem)" }}>
                      {screenNum}
                    </span>
                    <span className="text-[8px] font-black text-white/80 uppercase tracking-widest text-center px-1 line-clamp-1">
                      {m.name}
                    </span>
                    <span className="text-[8px] font-black text-white/60 mt-0.5">← drag →</span>
                  </div>
                )}
              </button>

              {/* Delete button — top right, edit mode only */}
              {editMode && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDeleteMachine(m.id); }}
                  className="absolute -top-2 -right-2 z-10 h-6 w-6 rounded-full flex items-center justify-center bg-red-600 border-2 border-background active:scale-90 transition"
                  style={{ boxShadow: "0 0 6px rgba(0,0,0,0.5)" }}>
                  <X className="h-3 w-3 text-white" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── All History Tab ────────────────────────────────────────────────────────────
function AllHistoryTab({ entries, machines }: { entries: MachineEntry[]; machines: Machine[] }) {
  const [openMonth, setOpenMonth] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadingMonth, setDownloadingMonth] = useState<string | null>(null);

  // All records sorted newest first
  const sorted = [...entries].sort((a, b) => b.created_at.localeCompare(a.created_at));

  // Group by YYYY-MM
  const byMonth: Record<string, MachineEntry[]> = {};
  sorted.forEach(e => {
    const mk = e.created_at.slice(0, 7);
    if (!byMonth[mk]) byMonth[mk] = [];
    byMonth[mk].push(e);
  });
  const monthKeys = Object.keys(byMonth).sort((a, b) => b.localeCompare(a));

  const monthLabel = (mk: string) => {
    const [yr, mo] = mk.split("-");
    return new Date(Number(yr), Number(mo) - 1, 1)
      .toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  };

  // All-time totals
  const totalPayout = sorted.filter(e => e.type === "payout").reduce((s, e) => s + Number(e.amount), 0);
  const totalIncome = sorted.filter(e => e.type === "income").reduce((s, e) => s + Number(e.amount), 0);
  const totalProfit = totalIncome - totalPayout;

  const buildPdf = async (
    rows: MachineEntry[],
    title: string,
    subtitle: string,
  ) => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const generated = new Date().toLocaleString("en-GB", {
      hour: "2-digit", minute: "2-digit", hour12: true,
      day: "numeric", month: "short", year: "numeric",
    });
    let y = await drawHeader(doc, "All Machines", title, subtitle, generated);
    const bw = RM - LM;
    const mPayout = rows.filter(e => e.type === "payout").reduce((s, e) => s + Number(e.amount), 0);
    const mIncome = rows.filter(e => e.type === "income").reduce((s, e) => s + Number(e.amount), 0);
    const mProfit = mIncome - mPayout;
    doc.setFillColor(245, 240, 230);
    doc.roundedRect(LM, y, bw, 26, 2, 2, "F");
    doc.setDrawColor(232, 146, 42); doc.setLineWidth(0.4);
    doc.roundedRect(LM, y, bw, 26, 2, 2, "S");
    const cols = [
      { label: "Total Payout", value: "-$" + fmt(mPayout), r: 180, g: 40, b: 40 },
      { label: "Total Income", value: "+$" + fmt(mIncome), r: 40,  g: 140, b: 40 },
      { label: "Net Profit",   value: (mProfit >= 0 ? "+" : "") + "$" + fmt(mProfit),
        r: mProfit >= 0 ? 40 : 180, g: mProfit >= 0 ? 140 : 40, b: 40 },
    ];
    const cw = bw / 3;
    cols.forEach((c, i) => {
      const cx = LM + i * cw + cw / 2;
      doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(100, 100, 100);
      doc.text(c.label, cx, y + 10, { align: "center" });
      doc.setFont("helvetica", "bold"); doc.setFontSize(9);
      doc.setTextColor(c.r, c.g, c.b);
      doc.text(c.value, cx, y + 19, { align: "center" });
    });
    doc.setTextColor(0, 0, 0); y += 32;
    doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(130, 130, 130);
    doc.text("DATE / TIME", LM, y);
    doc.text("MACHINE", LM + 55, y);
    doc.text("TYPE", LM + 110, y);
    doc.text("AMOUNT", RM, y, { align: "right" });
    y += 3; doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.2); doc.line(LM, y, RM, y); y += 5;
    doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(0, 0, 0);
    rows.forEach(e => {
      if (y > CONTENT_BOTTOM) { doc.addPage(); y = 20; }
      const m = machines.find(x => x.id === e.machine_id);
      const isPayout = e.type === "payout";
      const dateStr = new Date(e.created_at).toLocaleString("en-GB", {
        day: "numeric", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit", hour12: true,
      });
      doc.setFont("helvetica", "bold"); doc.setTextColor(0, 0, 0);
      doc.text(dateStr, LM, y);
      doc.setFont("helvetica", "normal"); doc.setFontSize(8);
      doc.text(m?.name ?? "—", LM + 55, y);
      doc.setFontSize(9);
      doc.setTextColor(isPayout ? 180 : 40, isPayout ? 40 : 140, 40);
      doc.text(e.type.toUpperCase(), LM + 110, y);
      doc.text((isPayout ? "-" : "+") + "$" + fmt(Number(e.amount)), RM, y, { align: "right" });
      doc.setTextColor(0, 0, 0); doc.setFont("helvetica", "normal"); y += 5;
      if (e.note) {
        doc.setFontSize(8); doc.setTextColor(100, 100, 100);
        doc.text("  " + e.note, LM, y); doc.setFontSize(9); doc.setTextColor(0, 0, 0); y += 4;
      }
      doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.1); doc.line(LM, y, RM, y); y += 4;
    });
    addFootersToAllPages(doc);
    return doc;
  };

  const handleDownloadAll = async () => {
    if (downloading || sorted.length === 0) return;
    setDownloading(true);
    try {
      const doc = await buildPdf(sorted, "Full History", "All Records");
      await downloadPdf("machines-all-history.pdf", doc.output("datauristring"));
      toast.success("PDF saved");
    } catch (err: any) { toast.error("PDF failed: " + err?.message); }
    finally { setDownloading(false); }
  };

  const handleDownloadMonth = async (mk: string) => {
    if (downloadingMonth) return;
    setDownloadingMonth(mk);
    try {
      const doc = await buildPdf(byMonth[mk], monthLabel(mk), monthLabel(mk));
      await downloadPdf(`machines-${monthLabel(mk).replace(/\s+/g, "-")}.pdf`, doc.output("datauristring"));
      toast.success("PDF saved");
    } catch (err: any) { toast.error("PDF failed: " + err?.message); }
    finally { setDownloadingMonth(null); }
  };

  if (sorted.length === 0) {
    return <div className="text-center py-12 text-muted-foreground text-sm">No records yet.</div>;
  }

  return (
    <div className="space-y-3">
      {/* Header — all-time totals + Download All */}
      <div className="rounded-2xl border border-border p-3 space-y-2" style={{ background: "var(--gradient-card)" }}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-black text-muted-foreground uppercase tracking-wider">{sorted.length} records</span>
          <Button size="sm" variant="outline" className="h-8 gap-1.5 font-bold text-xs"
            disabled={downloading} onClick={handleDownloadAll}>
            {downloading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
            All PDF
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl px-2 py-2 text-center" style={{ background: "oklch(0.22 0.02 60)" }}>
            <div className="text-[9px] font-semibold text-white/40 uppercase tracking-wider">Payout</div>
            <div className="font-black text-xs text-red-400">${fmtWhole(totalPayout)}</div>
          </div>
          <div className="rounded-xl px-2 py-2 text-center" style={{ background: "oklch(0.22 0.02 60)" }}>
            <div className="text-[9px] font-semibold text-white/40 uppercase tracking-wider">Income</div>
            <div className="font-black text-xs text-green-400">${fmtWhole(totalIncome)}</div>
          </div>
          <div className="rounded-xl px-2 py-2 text-center" style={{ background: "oklch(0.22 0.02 60)" }}>
            <div className="text-[9px] font-semibold text-white/40 uppercase tracking-wider">Profit</div>
            <div className="font-black text-xs" style={{ color: totalProfit >= 0 ? "#86efac" : "#fca5a5" }}>
              {totalProfit >= 0 ? "+" : ""}${fmtWhole(totalProfit)}
            </div>
          </div>
        </div>
      </div>

      {/* Month accordions */}
      <div className="space-y-2">
        {monthKeys.map(mk => {
          const mEntries = byMonth[mk];
          const mPayout = mEntries.filter(e => e.type === "payout").reduce((s, e) => s + Number(e.amount), 0);
          const mIncome = mEntries.filter(e => e.type === "income").reduce((s, e) => s + Number(e.amount), 0);
          const mProfit = mIncome - mPayout;
          const isOpen = openMonth === mk;
          return (
            <div key={mk} className="rounded-2xl border border-border overflow-hidden"
              style={{ background: "var(--gradient-card)" }}>
              {/* Month header */}
              <button className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/20 transition"
                onClick={() => setOpenMonth(isOpen ? null : mk)}>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-black text-sm">{monthLabel(mk)}</span>
                  <span className="text-xs text-muted-foreground">{mEntries.length} records</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs font-black ${mProfit >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {mProfit >= 0 ? "+" : ""}${fmtWhole(mProfit)}
                  </span>
                  <button
                    onClick={ev => { ev.stopPropagation(); handleDownloadMonth(mk); }}
                    disabled={downloadingMonth === mk}
                    className="h-7 px-2 rounded-lg flex items-center gap-1 text-xs font-bold border border-border hover:bg-muted/50 transition disabled:opacity-50">
                    {downloadingMonth === mk
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <Download className="h-3 w-3" />}
                    PDF
                  </button>
                  <span className={`text-muted-foreground text-sm transition-transform ${isOpen ? "rotate-180" : ""}`}>▾</span>
                </div>
              </button>

              {/* Expanded rows */}
              {isOpen && (
                <div className="border-t border-border divide-y divide-border/40">
                  {/* Month summary strip */}
                  <div className="grid grid-cols-3 gap-2 px-4 py-2">
                    <div className="text-center">
                      <div className="text-[9px] text-muted-foreground">Payout</div>
                      <div className="font-black text-xs text-red-400">${fmtWhole(mPayout)}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-[9px] text-muted-foreground">Income</div>
                      <div className="font-black text-xs text-green-400">${fmtWhole(mIncome)}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-[9px] text-muted-foreground">Profit</div>
                      <div className="font-black text-xs" style={{ color: mProfit >= 0 ? "#86efac" : "#fca5a5" }}>
                        {mProfit >= 0 ? "+" : ""}${fmtWhole(mProfit)}
                      </div>
                    </div>
                  </div>
                  {mEntries.map(e => {
                    const m = machines.find(x => x.id === e.machine_id);
                    const isPayout = e.type === "payout";
                    return (
                      <div key={e.id} className="px-4 py-3 flex items-start gap-3">
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 border text-xs font-black ${
                          isPayout ? "bg-red-500/15 border-red-500/30 text-red-400" : "bg-green-500/15 border-green-500/30 text-green-400"
                        }`}>
                          {isPayout ? "P" : "I"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-muted-foreground">
                            {new Date(e.created_at).toLocaleString("en-GB", {
                              day: "numeric", month: "short", year: "numeric",
                              hour: "2-digit", minute: "2-digit", hour12: true,
                            })}
                          </div>
                          <div className={`font-black text-sm ${isPayout ? "text-red-400" : "text-green-400"}`}>
                            {isPayout ? "-" : "+"}${fmt(Number(e.amount))}
                          </div>
                          {m && <div className="text-xs font-semibold mt-0.5" style={{ color: "var(--primary)" }}>{m.name}</div>}
                          {e.note && <div className="text-xs text-muted-foreground mt-0.5">{e.note}</div>}
                          {e.cashier_name && (
                            <div className="text-[10px] text-white/30 mt-0.5">
                              {isPayout ? "Paid by" : "Cleared by"}: {e.cashier_name}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function MachinesPage() {
  const { profile } = useAuth();
  const [machines, setMachines] = useState<Machine[]>([]);
  const [entries, setEntries] = useState<MachineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"screens" | "payouts" | "create">("screens");
  const [selected, setSelected] = useState<Machine | null>(null);
  const [selectedScreenNum, setSelectedScreenNum] = useState(0);

  // Cashiers see their owner's machines; owners see their own
  const ownerId = profile?.role === "cashier" ? (profile.parent_id ?? "") : (profile?.id ?? "");
  const isOwner = profile?.role === "owner";

  // Float — one session covers ALL machines for this owner
  const [floatSession, setFloatSession] = useState<FloatSession | null>(null);
  const [showSetFloat, setShowSetFloat] = useState(false);
  const [floatAmount, setFloatAmount] = useState("");
  const [savingFloat, setSavingFloat] = useState(false);

  // Grid-level machine delete modal
  const [deleteTarget, setDeleteTarget] = useState<Machine | null>(null);
  const [deletingMachine, setDeletingMachine] = useState(false);

  const handleGridDeleteMachine = async (wipeRecords: boolean) => {
    if (!deleteTarget) return;
    setDeletingMachine(true);
    if (wipeRecords) {
      await sb.from("machine_entries").delete().eq("machine_id", deleteTarget.id);
    }
    const { error } = await sb.from("machines").delete().eq("id", deleteTarget.id);
    setDeletingMachine(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${deleteTarget.name} deleted`);
    setDeleteTarget(null);
    load();
  };

  const loadFloat = useCallback(async () => {
    if (!ownerId) return;
    const { data } = await sb.from("machine_float_sessions")
      .select("*").eq("owner_id", ownerId)
      .order("set_at", { ascending: false }).limit(1).maybeSingle();
    setFloatSession(data as FloatSession | null);
  }, [ownerId]);

  const handleSetFloat = async () => {
    const val = parseFloat(floatAmount);
    if (isNaN(val) || val < 0) { toast.error("Enter a valid amount"); return; }
    setSavingFloat(true);
    const { error } = await sb.from("machine_float_sessions").insert({
      owner_id: ownerId,
      amount: val,
      set_at: new Date().toISOString(),
    });
    setSavingFloat(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Float set");
    setFloatAmount(""); setShowSetFloat(false);
    loadFloat();
  };

  const load = useCallback(async () => {
    if (!ownerId) return;
    setLoading(true);
    const [mRes, eRes] = await Promise.all([
      sb.from("machines").select("*").eq("owner_id", ownerId).order("name"),
      sb.from("machine_entries").select("*").eq("owner_id", ownerId)
        .order("entry_date", { ascending: false }),
    ]);
    setMachines((mRes.data ?? []) as Machine[]);
    setEntries((eRes.data ?? []) as MachineEntry[]);
    setLoading(false);
  }, [ownerId]);

  useEffect(() => { load(); loadFloat(); }, [load, loadFloat]);

  useEffect(() => {
    if (!ownerId) return;
    const ch = supabase.channel(`machines-page-${ownerId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "machines",
        filter: `owner_id=eq.${ownerId}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "machine_entries",
        filter: `owner_id=eq.${ownerId}` }, () => { load(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "machine_float_sessions",
        filter: `owner_id=eq.${ownerId}` }, () => loadFloat())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [ownerId, load, loadFloat]);

  // Session payouts = all payouts across ALL machines (owner + cashier) since float was last set
  const sessionPayouts = floatSession
    ? entries
        .filter(e => e.type === "payout" && new Date(e.created_at) >= new Date(floatSession.set_at))
        .reduce((s, e) => s + Number(e.amount), 0)
    : 0;
  const remainingFloat = floatSession ? Number(floatSession.amount) - sessionPayouts : null;

  if (!profile) return null;

  const screenNumber = selectedScreenNum;

  const tabs = [
    { key: "screens", label: `Screens${machines.length ? ` (${machines.length})` : ""}` },
    { key: "payouts", label: "All History" },
    ...(isOwner ? [{ key: "create", label: "Create" }] : []),
  ] as const;

  return (
    <>
      {/* MachineDetail overlays the list but keeps MachinesPage mounted so
          realtime channels stay alive and float/entries update in the background */}
      {selected && (
        <MachineDetail
          machine={selected}
          screenNumber={screenNumber}
          ownerId={ownerId}
          profile={{ id: profile.id, username: profile.username ?? undefined, role: profile.role ?? undefined }}
          floatSession={floatSession}
          remainingFloat={remainingFloat}
          onBack={() => { setSelected(null); load(); }}
          onDeleted={() => { setSelected(null); load(); }}
        />
      )}

      {/* List view — always mounted, hidden behind MachineDetail when a machine is selected */}
      <div className="py-3 space-y-4" style={selected ? { visibility: "hidden", pointerEvents: "none" } : {}}>
      <h1 className="text-2xl font-black">Machines</h1>
      {/* Tab bar */}
      <div className="flex gap-1 rounded-2xl p-1" style={{ background: "var(--gradient-card)" }}>
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key as typeof tab)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-black transition ${
              tab === t.key ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
            style={tab === t.key ? { background: "var(--gradient-hero)" } : {}}>
            {t.label}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="grid grid-cols-3 gap-2">
          {[0,1,2].map(i => <div key={i} className="h-24 rounded-2xl bg-muted/30 animate-pulse" />)}
        </div>
      ) : (
        <>
          {tab === "screens" && (
            <ScreensTab
              machines={machines} entries={entries} ownerId={ownerId} profileId={profile.id} onSelect={(m, num) => { setSelected(m); setSelectedScreenNum(num); }}
              floatSession={floatSession}
              remainingFloat={remainingFloat} isCashier={!isOwner}
              onSetFloat={() => { setFloatAmount(""); setShowSetFloat(true); }}
              onDeleteMachine={(id) => {
                const m = machines.find(x => x.id === id);
                if (m) setDeleteTarget(m);
              }}
            />
          )}
          {tab === "payouts" && <AllHistoryTab entries={entries} machines={machines} />}
          {tab === "create" && (
            <CreateTab ownerId={ownerId} onCreated={(m) => {
              setMachines(p => [...p, m].sort((a, b) => a.name.localeCompare(b.name)));
              setTab("screens");
            }} />
          )}
        </>
      )}

      {/* Grid-level machine delete modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-red-500/40 shadow-2xl overflow-hidden"
            style={{ background: "var(--gradient-card)" }}>
            <div className="px-6 pt-6 pb-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-xl flex items-center justify-center bg-red-500/15 border border-red-500/30 shrink-0">
                  <Trash2 className="h-5 w-5 text-red-400" />
                </div>
                <h2 className="font-black text-lg">Delete {deleteTarget.name}?</h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Choose what happens to the payout and income records for this machine.
              </p>
              <div className="space-y-2">
                <button disabled={deletingMachine} onClick={() => handleGridDeleteMachine(false)}
                  className="w-full flex items-start gap-3 rounded-2xl border border-border p-3 text-left hover:bg-muted/30 transition active:scale-[0.98] disabled:opacity-50"
                  style={{ background: "var(--gradient-card)" }}>
                  <div className="h-8 w-8 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-sm">📁</span>
                  </div>
                  <div>
                    <div className="font-black text-sm">Remove Card Only</div>
                    <div className="text-xs text-muted-foreground mt-0.5">Remove this machine from the app. All payout/income totals stay intact in All History.</div>
                  </div>
                </button>
                <button disabled={deletingMachine} onClick={() => handleGridDeleteMachine(true)}
                  className="w-full flex items-start gap-3 rounded-2xl border border-red-500/30 p-3 text-left hover:bg-red-500/10 transition active:scale-[0.98] disabled:opacity-50">
                  <div className="h-8 w-8 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center shrink-0 mt-0.5">
                    <Trash2 className="h-4 w-4 text-red-400" />
                  </div>
                  <div>
                    <div className="font-black text-sm text-red-400">Delete Everything</div>
                    <div className="text-xs text-muted-foreground mt-0.5">Remove the machine card AND wipe all its payout/income history. Cannot be undone.</div>
                  </div>
                </button>
              </div>
            </div>
            <div className="px-6 pb-6">
              <Button variant="outline" className="w-full h-12 font-black"
                onClick={() => setDeleteTarget(null)} disabled={deletingMachine}>
                {deletingMachine ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cancel"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Set Float modal */}
      {showSetFloat && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-t-3xl pb-8 pt-4 px-4 space-y-3"
            style={{ background: "oklch(0.13 0.03 60)", border: "1px solid oklch(0.3 0.08 60)" }}>
            <p className="text-center text-xs font-semibold" style={{ color: "oklch(0.65 0.15 65)" }}>
              Set Cashier Float — All Machines
            </p>
            <div className="rounded-2xl px-5 py-4 text-right"
              style={{ background: "oklch(0.18 0.04 60)", border: "1px solid oklch(0.28 0.08 60)" }}>
              <span className="font-black text-4xl" style={{ color: "oklch(0.82 0.18 65)" }}>
                ${floatAmount === "" ? "0" : floatAmount}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {["7","8","9","4","5","6","1","2","3"].map(k => (
                <button key={k} type="button"
                  onClick={() => {
                    const parts = floatAmount.split(".");
                    if (parts[1] !== undefined && parts[1].length >= 2) return;
                    setFloatAmount(prev => prev + k);
                  }}
                  className="rounded-2xl py-4 text-xl font-black active:scale-95 transition"
                  style={{ background: "oklch(0.20 0.05 60)", color: "#fff" }}>
                  {k}
                </button>
              ))}
              <button type="button"
                onClick={() => { if (!floatAmount.includes(".")) setFloatAmount(prev => prev + "."); }}
                className="rounded-2xl py-4 text-xl font-black active:scale-95 transition"
                style={{ background: "oklch(0.20 0.05 60)", color: "#fff" }}>.</button>
              <button type="button"
                onClick={() => {
                  const parts = floatAmount.split(".");
                  if (parts[1] !== undefined && parts[1].length >= 2) return;
                  setFloatAmount(prev => prev + "0");
                }}
                className="rounded-2xl py-4 text-xl font-black active:scale-95 transition"
                style={{ background: "oklch(0.20 0.05 60)", color: "#fff" }}>0</button>
              <button type="button"
                onClick={() => setFloatAmount(prev => prev.slice(0, -1))}
                className="rounded-2xl py-4 text-xl font-black active:scale-95 transition"
                style={{ background: "oklch(0.20 0.05 60)", color: "oklch(0.75 0.15 65)" }}>⌫</button>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowSetFloat(false)}
                className="flex-1 py-4 rounded-2xl text-sm font-black active:scale-95 transition border"
                style={{ background: "transparent", color: "#fff", borderColor: "oklch(0.35 0.06 60)" }}>
                Cancel
              </button>
              <button onClick={handleSetFloat} disabled={savingFloat || !floatAmount}
                className="flex-1 py-4 rounded-2xl text-sm font-black active:scale-95 transition disabled:opacity-50"
                style={{ background: "oklch(0.60 0.18 65)", color: "#000" }}>
                {savingFloat ? "Saving…" : "Confirm Float"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}
