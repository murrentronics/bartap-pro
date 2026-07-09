import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useChain } from "@/lib/ChainContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Wine, Gamepad2, Loader2, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export default function CreateBarPage() {
  const { profile } = useAuth();
  const { isChainOwner, chainBars, refreshBars, setActiveBarId } = useChain();
  const nav = useNavigate();

  const [barName, setBarName] = useState("");
  const [barLocation, setBarLocation] = useState("");
  const [hasMachines, setHasMachines] = useState(false);
  const [busy, setBusy] = useState(false);

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

  const canCreate = barName.trim().length >= 2 && barLocation.trim().length >= 2;

  const handleCreate = async () => {
    if (!profile?.id || !canCreate) return;
    setBusy(true);
    try {
      const { data, error } = await sb.rpc("create_bar_account", {
        p_owner_id:     profile.id,
        p_name:         barName.trim(),
        p_location:     barLocation.trim(),
        p_has_machines: hasMachines,
      });
      if (error) {
        toast.error(error.message ?? "Failed to create bar");
        return;
      }
      // Refresh the bar list, then switch to the new bar
      await refreshBars();
      if (data?.bar_id) {
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
