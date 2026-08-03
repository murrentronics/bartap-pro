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
  id:                  string;
  bar_name:            string;
  bar_location:        string;
  has_machines:        boolean;
  is_machines_account: boolean;
  bar_number:          number;
  created_at:          string;
};

type ChainCtxType = {
  /** True when the logged-in owner has plan_type = 'chain' */
  isChainOwner:    boolean;
  /** True when this is a non-chain multi-bar owner (bar_only/machines/premium with addon bars) */
  isMultiBarOwner: boolean;
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
  const [isMultiBarOwner, setIsMultiBarOwner] = useState(false);
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

    // Check if this user is a chain owner or multi-bar addon owner
    const { data: profileRaw } = await supabase
      .from("profiles")
      .select("plan_type, chain_addon_active, id, is_multi_bar, addon_bar_count")
      .eq("id", user.id)
      .maybeSingle();

    const profile = profileRaw as {
      plan_type?: string | null;
      chain_addon_active?: boolean | null;
      id?: string;
      is_multi_bar?: boolean | null;
      addon_bar_count?: number | null;
    } | null;

    // Also count actual sub-accounts so premium owners who deleted all addons
    // but still have sub-account rows (e.g. machines sub) still see Switch Bars
    const { count: subCount } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("parent_id", user.id)
      .eq("is_bar_account", true);

    // isChainOwner = plan_type is 'chain'
    const isChain = profile?.plan_type === "chain";
    // isMultiBarOwner = non-chain owner who has sub-accounts (regardless of addon_bar_count)
    const isMulti = !isChain && (subCount ?? 0) > 0;
    setIsChainOwner(isChain);
    setIsMultiBarOwner(isMulti);

    if (!isChain && !isMulti) {
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
        setIsMultiBarOwner(false);
        setChainBars([]);
        setActiveBarId(null);
      }
    });

    // ── Realtime: re-check when the profile row changes (e.g. admin approves chain plan) ──
    let profileChannel: ReturnType<typeof supabase.channel> | null = null;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      profileChannel = supabase
        .channel(`chain-profile-${user.id}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${user.id}` },
          () => refreshBars()
        )
        .subscribe();
    });

    return () => {
      sub.subscription.unsubscribe();
      if (profileChannel) supabase.removeChannel(profileChannel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Derived values ───────────────────────────────────────────────────────
  const activeBar = chainBars.find(b => b.id === activeBarId) ?? null;

  /**
   * Returns the correct owner id for data queries.
   * Chain owner OR multi-bar addon owner with active bar → activeBarId
   * Everyone else → profileId (their own id)
   */
  const effectiveOwnerId = useCallback((profileId: string): string => {
    if ((isChainOwner || isMultiBarOwner) && activeBarId) return activeBarId;
    return profileId;
  }, [isChainOwner, isMultiBarOwner, activeBarId]);

  return (
    <ChainCtx.Provider value={{
      isChainOwner,
      isMultiBarOwner,
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
