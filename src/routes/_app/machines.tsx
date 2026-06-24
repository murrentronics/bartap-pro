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
  TrendingDown, TrendingUp, DollarSign, Gamepad2,
} from "lucide-react";
import { downloadPdf } from "@/lib/download";
import { drawHeader, addFootersToAllPages, LM, RM, CONTENT_BOTTOM } from "@/lib/pdfHelpers";

export const Route = createFileRoute("/_app/machines")({
  component: MachinesPage,
});

// ── Types ──────────────────────────────────────────────────────────────────────
type Machine = { id: string; owner_id: string; name: string; created_at: string };
type MachineEntry = {
  id: string; machine_id: string; owner_id: string;
  type: "payout" | "income"; amount: number;
  note: string | null; entry_date: string; created_at: string;
};

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

// ── Machine Detail Page ────────────────────────────────────────────────────────
function MachineDetail({ machine, screenNumber, ownerId, onBack, onDeleted }: {
  machine: Machine; screenNumber: number; ownerId: string;
  onBack: () => void; onDeleted: () => void;
}) {
  const [entries, setEntries] = useState<MachineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"payout" | "income" | "history">("payout");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayISO());
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [showDeleteMachine, setShowDeleteMachine] = useState(false);
  const [deletingMachine, setDeletingMachine] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await sb.from("machine_entries").select("*")
      .eq("machine_id", machine.id).order("entry_date", { ascending: false })
      .order("created_at", { ascending: false });
    setEntries((data ?? []) as MachineEntry[]);
    setLoading(false);
  }, [machine.id]);

  useEffect(() => { load(); }, [load]);

  // Realtime
  useEffect(() => {
    const ch = supabase.channel(`machine-${machine.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "machine_entries",
        filter: `machine_id=eq.${machine.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [machine.id, load]);

  // Totals
  const totalPayout = entries.filter(e => e.type === "payout").reduce((s, e) => s + Number(e.amount), 0);
  const totalIncome = entries.filter(e => e.type === "income").reduce((s, e) => s + Number(e.amount), 0);
  const totalProfit = totalIncome - totalPayout;
  const today = todayISO();
  const todayPayout = entries.filter(e => e.type === "payout" && e.entry_date === today).reduce((s, e) => s + Number(e.amount), 0);
  const todayIncome = entries.filter(e => e.type === "income" && e.entry_date === today).reduce((s, e) => s + Number(e.amount), 0);
  const todayProfit = todayIncome - todayPayout;

  const handleSave = async () => {
    const val = parseFloat(amount);
    if (isNaN(val) || val <= 0) { toast.error("Enter a valid amount"); return; }
    setBusy(true);
    const { error } = await sb.from("machine_entries").insert({
      machine_id: machine.id, owner_id: ownerId,
      type: tab as "payout" | "income",
      amount: val, note: note.trim() || null, entry_date: date,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(tab === "payout" ? "Payout recorded" : "Income recorded");
    setAmount(""); setNote(""); setDate(todayISO());
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
    setDownloading(true);
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "mm", format: "a4" });
      const generated = new Date().toLocaleString("en-GB", {
        hour: "2-digit", minute: "2-digit", hour12: true,
        day: "numeric", month: "short", year: "numeric",
      });
      let y = await drawHeader(doc, machine.name, "Machine Records", "Full History", generated);
      // Summary box
      const bw = RM - LM;
      doc.setFillColor(245, 240, 230);
      doc.roundedRect(LM, y, bw, 26, 2, 2, "F");
      doc.setDrawColor(232, 146, 42); doc.setLineWidth(0.4);
      doc.roundedRect(LM, y, bw, 26, 2, 2, "S");
      const cols = [
        { label: "Total Payout", value: "$" + fmt(totalPayout) },
        { label: "Total Income", value: "$" + fmt(totalIncome) },
        { label: "Total Profit", value: (totalProfit >= 0 ? "+" : "") + "$" + fmt(totalProfit) },
      ];
      const cw = bw / 3;
      cols.forEach((c, i) => {
        const cx = LM + i * cw + cw / 2;
        doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(100, 100, 100);
        doc.text(c.label, cx, y + 10, { align: "center" });
        doc.setFont("helvetica", "bold"); doc.setFontSize(9);
        doc.setTextColor(i === 2 ? (totalProfit >= 0 ? 40 : 180) : 30, i === 2 ? (totalProfit >= 0 ? 140 : 40) : 30, 30);
        doc.text(c.value, cx, y + 19, { align: "center" });
      });
      doc.setTextColor(0, 0, 0); y += 32;
      // Column headers
      doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(130, 130, 130);
      doc.text("DATE / NOTE", LM, y); doc.text("TYPE", LM + 85, y); doc.text("AMOUNT", RM, y, { align: "right" });
      y += 3; doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.2); doc.line(LM, y, RM, y); y += 5;
      doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(0, 0, 0);
      entries.forEach((e) => {
        if (y > CONTENT_BOTTOM) { doc.addPage(); y = 20; }
        doc.setFont("helvetica", "bold");
        doc.text(fmtDate(e.entry_date), LM, y);
        doc.setTextColor(e.type === "payout" ? 180 : 40, e.type === "payout" ? 40 : 140, 40);
        doc.text(e.type.toUpperCase(), LM + 85, y);
        doc.text((e.type === "payout" ? "-" : "+") + "$" + fmt(Number(e.amount)), RM, y, { align: "right" });
        doc.setTextColor(0, 0, 0); doc.setFont("helvetica", "normal"); y += 5;
        if (e.note) {
          doc.setFontSize(8); doc.setTextColor(100, 100, 100);
          doc.text("  " + e.note, LM, y); doc.setFontSize(9); doc.setTextColor(0, 0, 0); y += 4;
        }
        doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.1); doc.line(LM, y, RM, y); y += 4;
      });
      addFootersToAllPages(doc);
      await downloadPdf(`machine-${machine.name.replace(/\s+/g, "-")}.pdf`, doc.output("datauristring"));
      toast.success("PDF saved");
    } catch (err: any) { toast.error("PDF failed: " + err?.message); }
    finally { setDownloading(false); }
  };

  const handleDeleteMachine = async () => {
    setDeletingMachine(true);
    // Entries cascade on machine delete
    const { error } = await sb.from("machines").delete().eq("id", machine.id);
    setDeletingMachine(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${machine.name} deleted`);
    setShowDeleteMachine(false);
    onDeleted();
  };

  return (
    <div className="fixed inset-0 z-40 flex flex-col overflow-hidden"
      style={{ background: "var(--background)" }}>
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 px-3 h-11 border-b border-border bg-background/95 backdrop-blur z-10"
        style={{ paddingTop: "env(safe-area-inset-top,0px)" }}>
        <button onClick={onBack}
          className="h-9 w-9 rounded-full flex items-center justify-center bg-muted active:scale-95 transition">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="font-black text-lg flex-1 truncate">
          Screen {screenNumber} — {machine.name}
        </h1>
        <button onClick={() => setShowDeleteMachine(true)}
          className="h-9 w-9 rounded-full flex items-center justify-center bg-red-600 active:scale-95 transition shrink-0">
          <Trash2 className="h-4 w-4 text-white" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
        {/* Hero */}
        <section className="rounded-3xl p-5 relative overflow-hidden space-y-3"
          style={{ background: "var(--gradient-hero)", boxShadow: "var(--shadow-glow)" }}>
          <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
          <div className="relative grid grid-cols-3 gap-2">
            <StatCard label="Total Payout" value={"$" + fmt(totalPayout)} color="#fca5a5" icon={TrendingDown} />
            <StatCard label="Total Income" value={"$" + fmt(totalIncome)} color="#86efac" icon={TrendingUp} />
            <StatCard label="Total Profit"
              value={(totalProfit >= 0 ? "+" : "") + "$" + fmt(totalProfit)}
              color={totalProfit >= 0 ? "#86efac" : "#fca5a5"} icon={DollarSign} />
          </div>
          <div className="relative grid grid-cols-3 gap-2">
            <SmallStat label="Today Payout" value={"$" + fmt(todayPayout)} color="#fca5a5" />
            <SmallStat label="Today Income" value={"$" + fmt(todayIncome)} color="#86efac" />
            <SmallStat label="Today Profit"
              value={(todayProfit >= 0 ? "+" : "") + "$" + fmt(todayProfit)}
              color={todayProfit >= 0 ? "#86efac" : "#fca5a5"} />
          </div>
        </section>

        {/* Tabs */}
        <div className="flex gap-1 rounded-2xl p-1" style={{ background: "var(--gradient-card)" }}>
          {(["payout", "income", "history"] as const).map((t) => (
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
              {tab === "payout" ? "Record Payout" : "Record Income"}
            </h2>
            <div>
              <Label className="text-xs">Amount</Label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-bold">$</span>
                <Input type="number" min="0.01" step="0.01" placeholder="0.00"
                  value={amount} onChange={e => setAmount(e.target.value)}
                  className="pl-7 h-12 text-lg font-black" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Note (optional)</Label>
              <Input value={note} onChange={e => setNote(e.target.value)}
                placeholder="e.g. Friday night payout" className="mt-1 h-10" />
            </div>
            <div>
              <Label className="text-xs">Date</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1 h-10" />
            </div>
            <Button onClick={handleSave} disabled={busy || !amount}
              className="w-full h-12 font-black text-base"
              style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : tab === "payout" ? "Save Payout" : "Save Income"}
            </Button>
          </div>
        )}

        {/* History tab */}
        {tab === "history" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{entries.length} records</span>
              <Button size="sm" variant="outline" className="h-9 gap-1.5 font-bold"
                disabled={downloading || entries.length === 0} onClick={handleDownloadPdf}>
                {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                PDF
              </Button>
            </div>
            {loading ? (
              <div className="space-y-2">{[0,1,2].map(i => <div key={i} className="h-16 rounded-xl bg-muted/30 animate-pulse" />)}</div>
            ) : entries.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">No records yet.</div>
            ) : (
              <div className="space-y-2">
                {entries.map((e) => (
                  <div key={e.id} className={`rounded-xl p-4 border flex items-start gap-3 ${
                    e.type === "payout" ? "border-red-500/25" : "border-green-500/25"
                  }`} style={{ background: e.type === "payout" ? "oklch(0.20 0.04 10 / 0.25)" : "oklch(0.20 0.05 145 / 0.25)" }}>
                    <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 border text-sm font-black ${
                      e.type === "payout" ? "bg-red-500/15 border-red-500/30 text-red-400" : "bg-green-500/15 border-green-500/30 text-green-400"
                    }`}>
                      {e.type === "payout" ? "P" : "I"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-muted-foreground">{fmtDate(e.entry_date)}</div>
                      <div className={`font-black text-sm ${e.type === "payout" ? "text-red-400" : "text-green-400"}`}>
                        {e.type === "payout" ? "-" : "+"}${fmt(Number(e.amount))}
                      </div>
                      {e.note && <div className="text-xs text-muted-foreground mt-0.5">{e.note}</div>}
                    </div>
                    <button onClick={() => handleDelete(e.id)} disabled={deletingId === e.id}
                      className="h-8 w-8 rounded-full flex items-center justify-center bg-red-600 active:scale-95 transition shrink-0 disabled:opacity-50">
                      {deletingId === e.id ? <Loader2 className="h-3.5 w-3.5 text-white animate-spin" /> : <Trash2 className="h-3.5 w-3.5 text-white" />}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Delete machine confirm modal */}
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
                All records and history for this machine will be permanently deleted. This cannot be undone.
              </p>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <Button variant="outline" className="flex-1 h-14 text-base font-black"
                onClick={() => setShowDeleteMachine(false)} disabled={deletingMachine}>
                Cancel
              </Button>
              <Button className="flex-1 h-14 text-base font-black bg-red-600 hover:bg-red-700 text-white"
                disabled={deletingMachine} onClick={handleDeleteMachine}>
                {deletingMachine ? <Loader2 className="h-5 w-5 animate-spin" /> : "Delete"}
              </Button>
            </div>
          </div>
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
function ScreensTab({ machines, entries, ownerId, onSelect }: {
  machines: Machine[]; entries: MachineEntry[];
  ownerId: string; onSelect: (m: Machine) => void;
}) {
  const totalPayout = entries.filter(e => e.type === "payout").reduce((s, e) => s + Number(e.amount), 0);
  const totalIncome = entries.filter(e => e.type === "income").reduce((s, e) => s + Number(e.amount), 0);
  const totalProfit = totalIncome - totalPayout;

  if (machines.length === 0) {
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
      <section className="rounded-3xl p-5 relative overflow-hidden"
        style={{ background: "var(--gradient-hero)", boxShadow: "var(--shadow-glow)" }}>
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
        <div className="relative grid grid-cols-3 gap-2">
          <StatCard label="All Payouts" value={"$" + fmt(totalPayout)} color="#fca5a5" icon={TrendingDown} />
          <StatCard label="All Income"  value={"$" + fmt(totalIncome)} color="#86efac" icon={TrendingUp} />
          <StatCard label="All Profit"
            value={(totalProfit >= 0 ? "+" : "") + "$" + fmt(totalProfit)}
            color={totalProfit >= 0 ? "#86efac" : "#fca5a5"} icon={DollarSign} />
        </div>
      </section>

      {/* Machine grid — 3 per row mobile, 5 per row tablet, sorted by created_at for stable numbers */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        {[...machines].sort((a, b) => a.created_at.localeCompare(b.created_at)).map((m, idx) => {
          const screenNum = idx + 1;
          const mPayout = entries.filter(e => e.machine_id === m.id && e.type === "payout").reduce((s, e) => s + Number(e.amount), 0);
          const mIncome = entries.filter(e => e.machine_id === m.id && e.type === "income").reduce((s, e) => s + Number(e.amount), 0);
          const mProfit = mIncome - mPayout;
          return (
            <button key={m.id} onClick={() => onSelect(m)}
              className="relative flex flex-col items-center justify-between rounded-2xl active:scale-95 transition overflow-hidden"
              style={{
                minHeight: "110px",
                background: "linear-gradient(160deg, #1a1a2e 0%, #16213e 60%, #0f3460 100%)",
                border: "2px solid rgba(251,146,60,0.35)",
                boxShadow: "0 0 12px rgba(251,146,60,0.15), inset 0 0 20px rgba(0,0,0,0.4)",
              }}>
              {/* Screen bezel top */}
              <div className="w-full h-1.5 shrink-0"
                style={{ background: "linear-gradient(90deg, transparent, rgba(251,146,60,0.5), transparent)" }} />
              {/* Screen content */}
              <div className="flex-1 flex flex-col items-center justify-center gap-1 px-2">
                {/* Big screen number */}
                <span className="font-black leading-none"
                  style={{ fontSize: "clamp(1.6rem, 5vw, 2.2rem)", color: "rgba(251,146,60,0.9)",
                    textShadow: "0 0 12px rgba(251,146,60,0.6)" }}>
                  {screenNum}
                </span>
                <span className="text-[9px] font-black text-white/60 uppercase tracking-widest leading-tight text-center line-clamp-2 px-1">
                  {m.name}
                </span>
              </div>
              {/* Profit badge */}
              <div className="w-full px-2 pb-1.5 flex justify-center">
                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                  mProfit >= 0 ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                }`}>
                  {mProfit >= 0 ? "+" : ""}${fmt(mProfit)}
                </span>
              </div>
              {/* Screen bezel bottom */}
              <div className="w-full h-1.5 shrink-0"
                style={{ background: "linear-gradient(90deg, transparent, rgba(251,146,60,0.4), transparent)" }} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Payouts Tab ────────────────────────────────────────────────────────────────
function PayoutsTab({ entries, machines }: { entries: MachineEntry[]; machines: Machine[] }) {
  const payouts = entries.filter(e => e.type === "payout").sort((a, b) => b.entry_date.localeCompare(a.entry_date));
  if (payouts.length === 0) {
    return <div className="text-center py-12 text-muted-foreground text-sm">No payout records yet.</div>;
  }
  return (
    <div className="space-y-2">
      {payouts.map((e) => {
        const m = machines.find(x => x.id === e.machine_id);
        return (
          <div key={e.id} className="rounded-xl p-4 border border-red-500/25 flex items-start gap-3"
            style={{ background: "oklch(0.20 0.04 10 / 0.25)" }}>
            <div className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 bg-red-500/15 border border-red-500/30 text-red-400 text-sm font-black">P</div>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-muted-foreground">{fmtDate(e.entry_date)}</div>
              <div className="font-black text-sm text-red-400">-${fmt(Number(e.amount))}</div>
              {m && <div className="text-xs text-primary mt-0.5 font-semibold">{m.name}</div>}
              {e.note && <div className="text-xs text-muted-foreground mt-0.5">{e.note}</div>}
            </div>
          </div>
        );
      })}
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
  const ownerId = profile?.id ?? "";

  const load = useCallback(async () => {
    if (!ownerId) return;
    setLoading(true);
    const [mRes, eRes] = await Promise.all([
      sb.from("machines").select("*").eq("owner_id", ownerId).order("name"),
      sb.from("machine_entries").select("*").eq("owner_id", ownerId).order("entry_date", { ascending: false }),
    ]);
    setMachines((mRes.data ?? []) as Machine[]);
    setEntries((eRes.data ?? []) as MachineEntry[]);
    setLoading(false);
  }, [ownerId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!ownerId) return;
    const ch = supabase.channel(`machines-page-${ownerId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "machines", filter: `owner_id=eq.${ownerId}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "machine_entries", filter: `owner_id=eq.${ownerId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [ownerId, load]);

  if (profile?.role !== "owner") {
    return <div className="text-center text-muted-foreground py-20">Only owners can manage machines.</div>;
  }

  // Show machine detail full-screen
  if (selected) {
    const screenNumber = [...machines].sort((a, b) => a.created_at.localeCompare(b.created_at))
      .findIndex(m => m.id === selected.id) + 1;
    return (
      <MachineDetail
        machine={selected}
        screenNumber={screenNumber}
        ownerId={ownerId}
        onBack={() => setSelected(null)}
        onDeleted={() => { setSelected(null); load(); }}
      />
    );
  }

  const tabs = [
    { key: "screens", label: `Screens${machines.length ? ` (${machines.length})` : ""}` },
    { key: "payouts", label: "Payouts" },
    { key: "create",  label: "Create" },
  ] as const;

  return (
    <div className="py-3 space-y-4">
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
        <div className="grid grid-cols-3 gap-2">{[0,1,2].map(i => <div key={i} className="h-24 rounded-2xl bg-muted/30 animate-pulse" />)}</div>
      ) : (
        <>
          {tab === "screens" && <ScreensTab machines={machines} entries={entries} ownerId={ownerId} onSelect={setSelected} />}
          {tab === "payouts" && <PayoutsTab entries={entries} machines={machines} />}
          {tab === "create"  && <CreateTab ownerId={ownerId} onCreated={(m) => { setMachines(p => [...p, m].sort((a,b) => a.name.localeCompare(b.name))); setTab("screens"); }} />}
        </>
      )}
    </div>
  );
}
