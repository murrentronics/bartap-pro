/**
 * Shared YouTube context.
 *
 * Quota is stored in Supabase (youtube_search_quota table) so it persists
 * across installs, devices and app reinstalls — tied to the account, not the device.
 * History stays in localStorage (non-sensitive, per-device preference).
 */
import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export type YTResult = {
  id:        string;
  kind:      string;
  title:     string;
  channel:   string;
  thumbnail: string;
};

export type YTHistoryItem = {
  id:        string;
  kind:      string;
  title:     string;
  channel:   string;
  thumbnail: string;
  playedAt:  number;
};

// ── History — stays in localStorage (per-device preference) ──────────────────
const LS_HISTORY  = "yt_play_history";
const DAILY_LIMIT = 75;
const HISTORY_MAX = 200;

function loadHistory(): YTHistoryItem[] {
  try {
    const raw = localStorage.getItem(LS_HISTORY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveHistory(h: YTHistoryItem[]) {
  try { localStorage.setItem(LS_HISTORY, JSON.stringify(h)); } catch { /* ignore */ }
}

// ── Context type ──────────────────────────────────────────────────────────────
type YouTubeCtx = {
  videoId:      string | null;
  isPlaylist:   boolean;
  setVideoId:   (id: string | null, playlist?: boolean) => void;

  ytFullscreen:    boolean;
  setYtFullscreen: (v: boolean) => void;

  query:        string;
  setQuery:     (q: string) => void;
  results:      YTResult[];
  searching:    boolean;
  searchError:  string | null;
  search:       (q: string) => Promise<void>;

  searchesRemaining: number;
  searchResetTime:   string;

  history:           YTHistoryItem[];
  addToHistory:      (item: Omit<YTHistoryItem, "playedAt">) => void;
  clearHistory:      () => void;
  removeFromHistory: (id: string) => void;

  nowPlayingTitle:    string;
  setNowPlayingTitle: (t: string) => void;

  lastMusicTab:    string;
  setLastMusicTab: (tab: string) => void;
};

const Ctx = createContext<YouTubeCtx | null>(null);

export function YouTubeProvider({ children }: { children: ReactNode }) {
  const [videoId,         setVideoIdRaw    ] = useState<string | null>(null);
  const [isPlaylist,      setIsPlaylist    ] = useState(false);
  const [ytFullscreen,    setYtFullscreen  ] = useState(false);
  const [query,           setQuery         ] = useState("");
  const [results,         setResults       ] = useState<YTResult[]>([]);
  const [searching,       setSearching     ] = useState(false);
  const [searchError,     setSearchError   ] = useState<string | null>(null);
  const [nowPlayingTitle, setNowPlayingTitle] = useState("");
  const [lastMusicTab,    setLastMusicTab  ] = useState("playlist");
  const [history,         setHistoryState  ] = useState<YTHistoryItem[]>(loadHistory);
  const [quotaCount,      setQuotaCount    ] = useState(0);
  const ownerIdRef = useRef<string | null>(null);

  // Load quota from DB on mount — reloads when auth changes
  useEffect(() => {
    const loadQuota = async (uid: string) => {
      try {
        ownerIdRef.current = uid;
        const { data } = await supabase.rpc("get_search_quota", { p_owner_id: uid });
        setQuotaCount(typeof data === "number" ? data : 0);
      } catch { /* RPC may not exist yet — fail silently */ }
    };

    // Get current session once on mount
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        ownerIdRef.current = data.session.user.id;  // set immediately, before async
        loadQuota(data.session.user.id);
      }
    });

    // Re-load when user signs in/out
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.user) {
        loadQuota(session.user.id);
      } else {
        ownerIdRef.current = null;
        setQuotaCount(0);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Poll every minute — catches midnight reset automatically
  useEffect(() => {
    const interval = setInterval(async () => {
      const id = ownerIdRef.current;
      if (!id) return;
      try {
        const { data } = await supabase.rpc("get_search_quota", { p_owner_id: id });
        setQuotaCount(typeof data === "number" ? data : 0);
      } catch { /* ignore */ }
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  const searchesRemaining = Math.max(0, DAILY_LIMIT - quotaCount);

  const searchResetTime = (() => {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const diffH = Math.floor((midnight.getTime() - now.getTime()) / 3600000);
    const diffM = Math.floor(((midnight.getTime() - now.getTime()) % 3600000) / 60000);
    if (diffH > 0) return `${diffH}h ${diffM}m`;
    return `${diffM}m`;
  })();

  const setVideoId = useCallback((id: string | null, playlist = false) => {
    setVideoIdRaw(id);
    setIsPlaylist(playlist);
    if (!id) { setNowPlayingTitle(""); setYtFullscreen(false); }
  }, []);

  const addToHistory = useCallback((item: Omit<YTHistoryItem, "playedAt">) => {
    setHistoryState(prev => {
      const filtered = prev.filter(h => h.id !== item.id);
      const updated  = [{ ...item, playedAt: Date.now() }, ...filtered].slice(0, HISTORY_MAX);
      saveHistory(updated);
      return updated;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setHistoryState([]);
    saveHistory([]);
  }, []);

  const removeFromHistory = useCallback((id: string) => {
    setHistoryState(prev => {
      const updated = prev.filter(h => h.id !== id);
      saveHistory(updated);
      return updated;
    });
  }, []);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) return;

    // Ensure we have an owner ID — get it inline if ref not set yet
    let ownerId = ownerIdRef.current;
    if (!ownerId) {
      const { data } = await supabase.auth.getSession();
      ownerId = data.session?.user?.id ?? null;
      if (ownerId) ownerIdRef.current = ownerId;
    }
    if (!ownerId) return;

    // Check quota before calling
    const { data: currentCount } = await supabase.rpc("get_search_quota", { p_owner_id: ownerId }).catch(() => ({ data: 0 }));
    const count = typeof currentCount === "number" ? currentCount : 0;
    if (count >= DAILY_LIMIT) {
      setSearchError(`Daily search limit reached (${DAILY_LIMIT}/day). Resets in ${searchResetTime}.`);
      return;
    }

    setSearching(true);
    setSearchError(null);
    setResults([]);

    // Increment in DB
    const { data: newCount } = await supabase.rpc("increment_search_quota", { p_owner_id: ownerId }).catch(() => ({ data: count + 1 }));
    setQuotaCount(typeof newCount === "number" ? newCount : count + 1);

    const projectUrl = import.meta.env.VITE_SUPABASE_URL as string;
    const anonKey    = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

    try {
      const url = `${projectUrl}/functions/v1/youtube-search?q=${encodeURIComponent(q)}&type=video&maxResults=15`;
      const res  = await fetch(url, {
        headers: { "Authorization": `Bearer ${anonKey}`, "Content-Type": "application/json" },
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setSearchError(json.error ?? "Search failed");
        await supabase.rpc("decrement_search_quota", { p_owner_id: ownerId }).catch(() => {});
        setQuotaCount(c => Math.max(0, c - 1));
        return;
      }
      setResults(json.items ?? []);
    } catch {
      setSearchError("Could not reach search service");
      await supabase.rpc("decrement_search_quota", { p_owner_id: ownerId }).catch(() => {});
      setQuotaCount(c => Math.max(0, c - 1));
    } finally {
      setSearching(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchResetTime]);

  return (
    <Ctx.Provider value={{
      videoId, isPlaylist, setVideoId,
      ytFullscreen, setYtFullscreen,
      query, setQuery,
      results, searching, searchError, search,
      searchesRemaining, searchResetTime,
      history, addToHistory, clearHistory, removeFromHistory,
      nowPlayingTitle, setNowPlayingTitle,
      lastMusicTab, setLastMusicTab,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useYouTube() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useYouTube must be inside YouTubeProvider");
  return ctx;
}
