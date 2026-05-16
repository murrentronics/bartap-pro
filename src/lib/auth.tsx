import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type UserStatus = "pending" | "approved" | "suspended" | "expelled";
export type Profile = {
  id: string;
  username: string;
  role: "owner" | "cashier" | "admin";
  parent_id: string | null;
  wallet_balance: number;
  status: UserStatus;
  phone?: string;
  address?: string;
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
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", uid)
        .maybeSingle();
      setProfile(data ? (data as unknown as Profile) : null);
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
