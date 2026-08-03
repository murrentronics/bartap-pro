import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";

export type UserStatus = "pending" | "approved" | "suspended" | "expelled";
export type Profile = {
  id: string;
  username: string;
  role: "owner" | "cashier" | "admin" | "manager";
  parent_id: string | null;
  wallet_balance: number;
  status: UserStatus;
  phone?: string;
  address?: string;
  music_addon?: boolean;
  billing_status?: string;
  subscription_end_date?: string;
  subscription_start_date?: string;
  plan_type?: "basic" | "premium" | "premium_20" | "chain" | "machines_only" | "machines_only_20";
  machines_addon_active?: boolean;
  machines_addon_start_date?: string;
  machines_addon_end_date?: string;
  premium_subscription_start_date?: string;
  premium_subscription_end_date?: string;
  // Chain of Bars plan
  chain_addon_active?: boolean;
  chain_bar_count?: number;
  is_bar_account?: boolean;
  is_machines_account?: boolean;
  // Multi-bar addon
  addon_bar_count?: number;
  is_multi_bar?: boolean;
  job_title?: string;
};

type AuthCtx = {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  // loading = true until we've both resolved the session AND attempted a profile fetch
  const [loading, setLoading] = useState(true);
  // track whether a profile fetch is in flight so we don't sign out prematurely
  const profileFetching = useRef(false);

  const loadProfile = async (uid: string) => {
    profileFetching.current = true;
    try {
      // Race against a 6 s timeout so we never hang the app loader while offline
      const fetchPromise = supabase
        .from("profiles")
        .select("*")
        .eq("id", uid)
        .maybeSingle();

      const timeoutPromise = new Promise<{ data: null; error: { message: string } }>(
        (resolve) => setTimeout(() => resolve({ data: null, error: { message: "offline" } }), 6000)
      );

      const { data, error } = await Promise.race([fetchPromise, timeoutPromise]) as { data: unknown; error: { message?: string } | null };

      // If the request failed due to a network error (offline), keep whatever
      // profile is already in state rather than wiping it — this prevents the
      // AppLayout guard from triggering a forced sign-out while offline.
      if (error) {
        const msg = (error as { message?: string }).message ?? "";
        const isNetworkError =
          msg.includes("Failed to fetch") ||
          msg.includes("NetworkError") ||
          msg.includes("network") ||
          msg.includes("offline") ||
          !navigator.onLine;
        if (isNetworkError) {
          // Leave profile unchanged — user is still logged in, just offline
          return;
        }
      }

      const p = data ? (data as unknown as Profile) : null;
      setProfile(p);
    } finally {
      profileFetching.current = false;
      setLoading(false);
    }
  };

  useEffect(() => {
    // 1. Get the current session immediately on mount
    supabase.auth.getSession().then(({ data }) => {
      const s = data.session;
      setSession(s);
      if (s?.user) {
        loadProfile(s.user.id);
      } else {
        setLoading(false);
      }
    });

    // 2. Listen for auth state changes (login, logout, token refresh)
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s?.user) {
        loadProfile(s.user.id);
      } else {
        // Session ended — clear profile
        setProfile(null);
        setLoading(false);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  // Realtime: watch own profile row for updates and deletes
  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) return;

    const ch = supabase
      .channel(`profile-${uid}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${uid}` },
        (payload) => {
          setProfile((prev) => ({ ...(prev as Profile), ...(payload.new as Profile) }));
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "profiles", filter: `id=eq.${uid}` },
        () => {
          setProfile(null);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [session?.user?.id]);

  const value: AuthCtx = {
    user: session?.user ?? null,
    session,
    profile,
    loading,
    refreshProfile: async () => {
      if (session?.user) await loadProfile(session.user.id);
    },
    signOut: async () => {
      // Remove push notification listeners before signing out to prevent
      // the cleanup race on Android that causes the brown screen crash
      if (Capacitor.isNativePlatform()) {
        try {
          const { PushNotifications } = await import("@capacitor/push-notifications");
          await PushNotifications.removeAllListeners();
        } catch { /* ignore — listeners may not be registered */ }
      }
      await supabase.auth.signOut();
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside AuthProvider");
  return v;
};

export const CASHIER_DOMAIN = "bartendaz.cashier";
export const usernameToEmail = (u: string) => `${u.trim().toLowerCase()}@${CASHIER_DOMAIN}`;
