import { useState } from "react";
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
  const { isChainOwner, chainBars, refreshBars, setActiveBarId } = useChain();
  const nav = useNavigate();

  const [barName, setBarName] = useState("");
  const [barLocation, setBarLocation] = useState("");
  const [hasMachines, setHasMachines] = useState(false);
  const [accountType, setAccountType] = useState<"bar" | "bar_machines" | "machines_only">("bar");
  const [copyItems, setCopyItems] = useState<boolean | null>(null);
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

  // If this is the first bar (chainBars.length === 0), skip the copyItems question
  const needsCopyAnswer = chainBars.length > 0 && accountType !== "machines_only";
  const canCreate = barName.trim().length >= 2 && barLocation.trim().length >= 2 && (!needsCopyAnswer || copyItems !== null);

  const handleCreate = async () => {
    if (!profile?.id || !canCreate) return;
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;

      if (accountType === "machines_only") {
        // Call create-machines function
        const res = await fetch(`${supabaseUrl}/functions/v1/create-machines`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session?.access_token ?? ""}`,
            "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
          },
          body: JSON.stringify({
            p_name:     barName.trim(),
            p_location: barLocation.trim(),
          }),
        });
        const data = await res.json() as { machines_id?: string; error?: string };
        if (!res.ok || data.error) { toast.error(data.error ?? "Failed to create account"); return; }
        await refreshBars();
        if (data.machines_id) {
          setActiveBarId(data.machines_id);
          toast.success(`"${barName.trim()}" created — switched to this account`);
          nav("/machines");
        } else {
          toast.success("Machines account created");
          nav("/switch-bar");
        }
        return;
      }

      // Bar or Bar + Machines
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
          p_has_machines:   accountType === "bar_machines",
          p_copy_items:     copyItems === true,
        }),
      });
      const data = await res.json() as { bar_id?: string; error?: string };
      if (!res.ok || data.error) { toast.error(data.error ?? "Failed to create bar"); return; }
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
      toast.error(err instanceof Error ? err.message : "Failed to create");
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
        <h1 className="text-2xl font-black">Add New Account</h1>
        <p className="text-sm text-muted-foreground">
          Each account is fully independent — its own wallet, cashiers, and records.
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

        {/* Account type toggle */}
        <div className="space-y-2">
          <Label className="text-xs font-black text-muted-foreground uppercase tracking-widest">
            Account Type
          </Label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setAccountType("bar")}
              className="h-16 rounded-2xl flex flex-col items-center justify-center gap-1.5 border transition active:scale-[0.98]"
              style={{
                background: accountType === "bar" ? "rgba(251,146,60,0.12)" : "rgba(255,255,255,0.03)",
                borderColor: accountType === "bar" ? "var(--primary)" : "var(--border)",
              }}
            >
              <Wine className={`h-5 w-5 ${accountType === "bar" ? "text-primary" : "text-muted-foreground"}`} />
              <span className={`text-xs font-black ${accountType === "bar" ? "text-primary" : "text-muted-foreground"}`}>
                Bar only
              </span>
            </button>
            <button
              type="button"
              onClick={() => setAccountType("bar_machines")}
              className="h-16 rounded-2xl flex flex-col items-center justify-center gap-1.5 border transition active:scale-[0.98]"
              style={{
                background: accountType === "bar_machines" ? "rgba(251,146,60,0.12)" : "rgba(255,255,255,0.03)",
                borderColor: accountType === "bar_machines" ? "var(--primary)" : "var(--border)",
              }}
            >
              <Gamepad2 className={`h-5 w-5 ${accountType === "bar_machines" ? "text-primary" : "text-muted-foreground"}`} />
              <span className={`text-xs font-black ${accountType === "bar_machines" ? "text-primary" : "text-muted-foreground"}`}>
                Bar + Machines
              </span>
            </button>
            <button
              type="button"
              onClick={() => setAccountType("machines_only")}
              className="h-16 rounded-2xl flex flex-col items-center justify-center gap-1.5 border transition active:scale-[0.98]"
              style={{
                background: accountType === "machines_only" ? "rgba(139,92,246,0.12)" : "rgba(255,255,255,0.03)",
                borderColor: accountType === "machines_only" ? "#7c3aed" : "var(--border)",
              }}
            >
              <Gamepad2 className={`h-5 w-5 ${accountType === "machines_only" ? "text-purple-500" : "text-muted-foreground"}`} />
              <span className={`text-xs font-black ${accountType === "machines_only" ? "text-purple-500" : "text-muted-foreground"}`}>
                Machines only
              </span>
            </button>
          </div>
        </div>

        {/* Copy items — only shown for bar types when there's at least one existing bar */}
        {accountType !== "machines_only" && chainBars.length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs font-black text-muted-foreground uppercase tracking-widest">
              Copy Items from Bar 1?
            </Label>
            <p className="text-xs text-muted-foreground -mt-1">
              Start this bar with the same product list as your first bar.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setCopyItems(true)}
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
                onClick={() => setCopyItems(false)}
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
          <><Loader2 className="h-4 w-4 animate-spin" /> Creating…</>
        ) : accountType === "machines_only" ? (
          "Create Machines Account"
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
