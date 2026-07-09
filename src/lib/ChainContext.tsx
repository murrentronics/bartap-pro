/**
 * ChainContext — Chain of Bars plan support
 *
 * Provides the active bar context for chain owners. When a chain owner logs in,
 * they pick a bar from the Switch Bar screen. From that point on, all pages use
 * `effectiveOwnerId` (the selected bar's id) instead of profile.id.
 *
 * Non-chain owners: activeBarId is always null, effectiveOwnerId === profile.id.
 * Zero impact on existing single-bar flow.
 */

import {
  createContext, useCallback, useContext, useEffect, useState, type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

const LS_ACTIVE_BAR = "active_bar_id";

// ─── Types ────────────────────────────────────────────────────────────────────
export type ChainBar = {
  id:           string;
  bar_name:     string;
  bar_location: string;
  has_machines: boolean;
  bar_number:   number;
  created_at:   string;
};

type ChainCtxType = {
  /** True when the logged-in owner has plan_type = 'chain' */
  isChainOwner:    boolean;
  /** The bar sub-account currently being managed. Null for non-chain owners. */
  activeBarId:     string | null;
  /** The active bar's full record, or null */
  activeBar:       ChainBar | null;
  /** All bar sub-accounts for this chain owner */
  chainBars:       ChainBar[];
  /** Switch to a different bar — persists to localStorage */
  setActiveBarId:  (id: string | null) => void;
  /** Reload bar list from Supabase */
  refreshBars:     () => Promise<void>;
  /** Loading state for initial bar list fetch */
  barsLoading:     boolean;
  /**
   * The effective owner id to use in ALL data queries.
   * = activeBarId if chain owner with a bar selected
   * = profile.id for all other cases
   * Pass profile.id as the fallback.
   */
  effectiveOwnerId: (profileId: string) => string;
};

const ChainCtx = createContext<ChainCtxType | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────
export function ChainProvider({ children }: { children: ReactNode }) {
  const [isChainOwner, setIsChainOwner] = useState(false);
  const [chainBars,    setChainBars]    = useState<ChainBar[]>([]);
  const [activeBarId,  setActiveBarIdRaw] = useState<string | null>(
    () => localStorage.getItem(LS_ACTIVE_BAR)
  );
  const [barsLoading,  setBarsLoading]  = useState(false);

  // ── Persist active bar to localStorage ──────────────────────────────────
  const setActiveBarId = useCallback((id: string | null) => {
    setActiveBarIdRaw(id);
    if (id) {
      localStorage.setItem(LS_ACTIVE_BAR, id);
    } else {
      localStorage.removeItem(LS_ACTIVE_BAR);
    }
  }, []);

  // ── Load bar list ────────────────────────────────────────────────────────
  const refreshBars = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setIsChainOwner(false);
      setChainBars([]);
      return;
    }

    // Check if this user is a chain owner
    const { data: profile } = await supabase
      .from("profiles")
      .select("plan_type, chain_addon_active, id")
      .eq("id", user.id)
      .maybeSingle();

    const isChain = profile?.plan_type === "chain" && profile?.chain_addon_active === true;
    setIsChainOwner(isChain);

    if (!isChain) {
      setChainBars([]);
      setActiveBarId(null);
      return;
    }

    setBarsLoading(true);
    try {
      const { data, error } = await sb.rpc("get_chain_bars", { p_owner_id: user.id });
      if (!error && data) {
        setChainBars(data as ChainBar[]);
        // If stored activeBarId no longer exists in the bar list, clear it
        const storedId = localStorage.getItem(LS_ACTIVE_BAR);
        if (storedId && !(data as ChainBar[]).some(b => b.id === storedId)) {
          setActiveBarId(null);
        }
      }
    } finally {
      setBarsLoading(false);
    }
  }, [setActiveBarId]);

  // ── Load on auth state change ────────────────────────────────────────────
  useEffect(() => {
    refreshBars();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        refreshBars();
      } else {
        // Signed out — clear everything
        setIsChainOwner(false);
        setChainBars([]);
        setActiveBarId(null);
      }
    });
    return () => sub.subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Derived values ───────────────────────────────────────────────────────
  const activeBar = chainBars.find(b => b.id === activeBarId) ?? null;

  /**
   * Returns the correct owner id for data queries.
   * Chain owner with active bar → activeBarId
   * Everyone else → profileId (their own id)
   */
  const effectiveOwnerId = useCallback((profileId: string): string => {
    if (isChainOwner && activeBarId) return activeBarId;
    return profileId;
  }, [isChainOwner, activeBarId]);

  return (
    <ChainCtx.Provider value={{
      isChainOwner,
      activeBarId,
      activeBar,
      chainBars,
      setActiveBarId,
      refreshBars,
      barsLoading,
      effectiveOwnerId,
    }}>
      {children}
    </ChainCtx.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useChain() {
  const ctx = useContext(ChainCtx);
  if (!ctx) throw new Error("useChain must be inside ChainProvider");
  return ctx;
}
