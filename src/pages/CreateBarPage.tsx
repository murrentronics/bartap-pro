import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useChain } from "@/lib/ChainContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Wine, Gamepad2, Loader2, ChevronLeft, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function CreateBarPage() {
  const { profile } = useAuth();
  const { isChainOwner, chainBars, refreshBars, setActiveBarId, activeBarId } = useChain();
  const nav = useNavigate();

  const [barName, setBarName] = useState("");
  const [barLocation, setBarLocation] = useState("");
  const [hasMachines, setHasMachines] = useState(false);
  const [copyItems, setCopyItems] = useState<boolean | null>(null);
  const [copySourceId, setCopySourceId] = useState<string | null>(null);
  const [barsWithProducts, setBarsWithProducts] = useState<{ id: string; bar_name: string }[]>([]);
  const [busy, setBusy] = useState(false);

  // Load which bars have products so owner can pick a valid source
  useEffect(() => {
    if (chainBars.length === 0) return;
    const load = async () => {
      const ids = chainBars.map((b) => b.id);
      const { data } = await (supabase as any)
        .from("products")
        .select("owner_id")
        .in("owner_id", ids);
      if (!data) return;
      const idsWithProducts = [...new Set(data.map((r: any) => r.owner_id as string))];
      const bars = chainBars.filter((b) => idsWithProducts.includes(b.id));
      setBarsWithProducts(bars);
    };
    load();
  }, [chainBars]);

  // Guard
  if (!isChainOwner && profile) {
    return (
      <div className="text-center text-muted-foreground py-20">
        This page is only available for Chain of Bars plan owners.
      </div>
    );
  }

  // Enforce max 10 bars
  if (chainBars.length >= 10) {
    return (
      <div className="text-center py-20 space-y-4 px-6">
        <p className="text-lg font-black">Maximum 10 bars reached</p>
        <p className="text-sm text-muted-foreground">
          Your Chain plan supports up to 10 bars. Remove an existing bar to add a new one.
        </p>
        <Button variant="outline" onClick={() => nav("/switch-bar")}>
          Back to My Bars
        </Button>
      </div>
    );
  }

  // If this is the first bar (chainBars.length === 0), skip the copyItems question
  const needsCopyAnswer = chainBars.length > 0;
  const canCreate = barName.trim().length >= 2 && barLocation.trim().length >= 2
    && (!needsCopyAnswer || copyItems !== null)
    && (copyItems !== true || copySourceId !== null);

  const handleCreate = async () => {
    if (!profile?.id || !canCreate) return;
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const res = await fetch(`${supabaseUrl}/functions/v1/create-bar`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token ?? ""}`,
          "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
        },
        body: JSON.stringify({
          p_name:           barName.trim(),
          p_location:       barLocation.trim(),
          p_has_machines:   hasMachines,
          p_copy_items:     copyItems === true,
          p_copy_source_id: copyItems === true ? copySourceId : null,
        }),
      });
      const data = await res.json() as { bar_id?: string; error?: string };
      if (!res.ok || data.error) {
        toast.error(data.error ?? "Failed to create bar");
        return;
      }
      await refreshBars();
      if (data.bar_id) {
        setActiveBarId(data.bar_id);
        toast.success(`"${barName.trim()}" created — switched to this bar`);
        nav("/register");
      } else {
        toast.success("Bar created");
        nav("/switch-bar");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create bar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-1 py-4 space-y-6">
      {/* Back button */}
      <button
        onClick={() => nav("/switch-bar")}
        className="flex items-center gap-1.5 text-sm font-bold text-muted-foreground hover:text-foreground transition"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to My Bars
      </button>

      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-black">Add New Bar</h1>
        <p className="text-sm text-muted-foreground">
          Each bar is fully independent — its own items, wallet, cashiers, and records.
        </p>
      </div>

      {/* Form */}
      <div className="space-y-5 rounded-2xl border border-border p-5"
        style={{ background: "var(--gradient-card)" }}>

        {/* Bar Name */}
        <div className="space-y-1.5">
          <Label className="text-xs font-black text-muted-foreground uppercase tracking-widest">
            Bar Name
          </Label>
          <Input
            placeholder="e.g. The Rusty Nail"
            value={barName}
            onChange={(e) => setBarName(e.target.value)}
            maxLength={60}
            className="h-11 font-bold"
          />
        </div>

        {/* District / Location */}
        <div className="space-y-1.5">
          <Label className="text-xs font-black text-muted-foreground uppercase tracking-widest">
            District / Location
          </Label>
          <Input
            placeholder="e.g. Port of Spain"
            value={barLocation}
            onChange={(e) => setBarLocation(e.target.value)}
            maxLength={60}
            className="h-11 font-bold"
          />
        </div>

        {/* Bar type toggle */}
        <div className="space-y-2">
          <Label className="text-xs font-black text-muted-foreground uppercase tracking-widest">
            Bar Type
          </Label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setHasMachines(false)}
              className="h-16 rounded-2xl flex flex-col items-center justify-center gap-1.5 border transition active:scale-[0.98]"
              style={{
                background: !hasMachines ? "rgba(251,146,60,0.12)" : "rgba(255,255,255,0.03)",
                borderColor: !hasMachines ? "var(--primary)" : "var(--border)",
              }}
            >
              <Wine className={`h-5 w-5 ${!hasMachines ? "text-primary" : "text-muted-foreground"}`} />
              <span className={`text-xs font-black ${!hasMachines ? "text-primary" : "text-muted-foreground"}`}>
                Bar only
              </span>
            </button>
            <button
              type="button"
              onClick={() => setHasMachines(true)}
              className="h-16 rounded-2xl flex flex-col items-center justify-center gap-1.5 border transition active:scale-[0.98]"
              style={{
                background: hasMachines ? "rgba(251,146,60,0.12)" : "rgba(255,255,255,0.03)",
                borderColor: hasMachines ? "var(--primary)" : "var(--border)",
              }}
            >
              <Gamepad2 className={`h-5 w-5 ${hasMachines ? "text-primary" : "text-muted-foreground"}`} />
              <span className={`text-xs font-black ${hasMachines ? "text-primary" : "text-muted-foreground"}`}>
                Bar + Machines
              </span>
            </button>
          </div>
        </div>

        {/* Copy items — only shown when there's at least one existing bar */}
        {chainBars.length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs font-black text-muted-foreground uppercase tracking-widest">
              Copy Items from Another Bar?
            </Label>
            <p className="text-xs text-muted-foreground -mt-1">
              Start this bar with the same product list as an existing bar.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => { setCopyItems(true); setCopySourceId(null); }}
                className="h-16 rounded-2xl flex flex-col items-center justify-center gap-1.5 border transition active:scale-[0.98]"
                style={{
                  background: copyItems === true ? "rgba(251,146,60,0.12)" : "rgba(255,255,255,0.03)",
                  borderColor: copyItems === true ? "var(--primary)" : "var(--border)",
                }}
              >
                <Copy className={`h-5 w-5 ${copyItems === true ? "text-primary" : "text-muted-foreground"}`} />
                <span className={`text-xs font-black ${copyItems === true ? "text-primary" : "text-muted-foreground"}`}>
                  Yes, copy items
                </span>
              </button>
              <button
                type="button"
                onClick={() => { setCopyItems(false); setCopySourceId(null); }}
                className="h-16 rounded-2xl flex flex-col items-center justify-center gap-1.5 border transition active:scale-[0.98]"
                style={{
                  background: copyItems === false ? "rgba(251,146,60,0.12)" : "rgba(255,255,255,0.03)",
                  borderColor: copyItems === false ? "var(--primary)" : "var(--border)",
                }}
              >
                <Wine className={`h-5 w-5 ${copyItems === false ? "text-primary" : "text-muted-foreground"}`} />
                <span className={`text-xs font-black ${copyItems === false ? "text-primary" : "text-muted-foreground"}`}>
                  Start fresh
                </span>
              </button>
            </div>

            {/* Bar picker — only shown if Yes selected */}
            {copyItems === true && (
              <div className="space-y-2 pt-1">
                <Label className="text-xs font-black text-muted-foreground uppercase tracking-widest">
                  Copy from which bar?
                </Label>
                {barsWithProducts.length === 0 ? (
                  <p className="text-xs text-amber-400 font-semibold">
                    None of your bars have products yet — start fresh instead.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {barsWithProducts.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setCopySourceId(b.id)}
                        className="w-full h-12 rounded-xl border-2 px-4 text-sm font-black text-left transition active:scale-[0.98]"
                        style={{
                          background: copySourceId === b.id ? "rgba(251,146,60,0.12)" : "rgba(255,255,255,0.03)",
                          borderColor: copySourceId === b.id ? "var(--primary)" : "var(--border)",
                          color: copySourceId === b.id ? "var(--primary)" : "var(--foreground)",
                        }}
                      >
                        {b.bar_name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create button */}
      <Button
        onClick={handleCreate}
        disabled={!canCreate || busy}
        className="w-full h-12 font-black text-sm gap-2"
        style={{ background: canCreate && !busy ? "var(--gradient-hero)" : undefined }}
      >
        {busy ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> Creating bar…</>
        ) : (
          "Create Bar"
        )}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        Bar {chainBars.length + 1} of 10
      </p>
    </div>
  );
}
