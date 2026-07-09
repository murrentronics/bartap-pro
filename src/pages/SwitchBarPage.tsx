import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useChain } from "@/lib/ChainContext";
import { Wine, Gamepad2, ChevronRight, Plus, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function SwitchBarPage() {
  const { profile } = useAuth();
  const { chainBars, activeBarId, setActiveBarId, barsLoading, isChainOwner } = useChain();
  const nav = useNavigate();

  // Guard: only chain owners can access this page
  if (!isChainOwner && profile) {
    return (
      <div className="text-center text-muted-foreground py-20">
        This page is only available for Chain of Bars plan owners.
      </div>
    );
  }

  const handleSelect = (barId: string) => {
    setActiveBarId(barId);
    nav("/register");
  };

  const canAddBar = chainBars.length < 10;

  return (
    <div className="px-1 py-4 space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-black">Your Bars</h1>
        <p className="text-sm text-muted-foreground">
          Select a bar to manage, or add a new one.
        </p>
      </div>

      {/* Bar count badge */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-black px-2.5 py-1 rounded-full border border-primary/30 text-primary"
          style={{ background: "rgba(251,146,60,0.08)" }}>
          {chainBars.length} / 10 bars
        </span>
      </div>

      {/* Loading state */}
      {barsLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {/* Bar cards */}
      {!barsLoading && (
        <div className="space-y-3">
          {chainBars.length === 0 && (
            <div className="text-center py-16 space-y-3">
              <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl border border-border"
                style={{ background: "var(--gradient-card)" }}>
                <Wine className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground text-sm font-semibold">No bars yet</p>
              <p className="text-xs text-muted-foreground">Add your first bar to get started.</p>
            </div>
          )}

          {chainBars.map((bar, idx) => {
            const isActive = bar.id === activeBarId;
            return (
              <button
                key={bar.id}
                onClick={() => handleSelect(bar.id)}
                className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl border text-left transition active:scale-[0.98]"
                style={{
                  background: isActive ? "rgba(251,146,60,0.10)" : "var(--gradient-card)",
                  borderColor: isActive ? "var(--primary)" : "var(--border)",
                }}
              >
                {/* Bar number badge */}
                <div
                  className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 font-black text-base"
                  style={{
                    background: isActive ? "var(--gradient-hero)" : "rgba(255,255,255,0.08)",
                    color: isActive ? "var(--primary-foreground)" : "var(--muted-foreground)",
                  }}
                >
                  {idx + 1}
                </div>

                {/* Bar info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-black text-base truncate">{bar.bar_name}</span>
                    {isActive && <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs text-muted-foreground truncate">{bar.bar_location}</span>
                    {bar.has_machines
                      ? <span className="flex items-center gap-1 text-xs font-bold text-amber-400 shrink-0"><Gamepad2 className="h-3 w-3" />Bar + Machines</span>
                      : <span className="flex items-center gap-1 text-xs font-bold text-muted-foreground shrink-0"><Wine className="h-3 w-3" />Bar only</span>
                    }
                  </div>
                </div>

                <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
              </button>
            );
          })}
        </div>
      )}

      {/* Add new bar button */}
      {!barsLoading && (
        <div className="pt-2">
          <Button
            onClick={() => nav("/create-bar")}
            disabled={!canAddBar}
            className="w-full h-12 font-black text-sm gap-2"
            style={{ background: canAddBar ? "var(--gradient-hero)" : undefined }}
          >
            <Plus className="h-4 w-4" />
            {canAddBar ? "Add New Bar" : "Maximum 10 bars reached"}
          </Button>
          {!canAddBar && (
            <p className="text-center text-xs text-muted-foreground mt-2">
              You've reached the maximum of 10 bars on your Chain plan.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
