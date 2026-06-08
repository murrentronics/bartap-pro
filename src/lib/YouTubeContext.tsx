import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export type YTResult = {
  id: string; kind: string; title: string; channel: string; thumbnail: string;
};
export type YTHistoryItem = {
  id: string; kind: string; title: string; channel: string; thumbnail: string; playedAt: number;
};

const LS_HISTORY  = "yt_play_history";
const DAILY_LIMIT = 75;
const HISTORY_MAX = 200;

function loadHistory(): YTHistoryItem[] {
  try { return JSON.parse(localStorage.getItem(LS_HISTORY) ?? "[]"); } catch { return []; }
}
function saveHistory(h: YTHistoryItem[]) {
  try { localStorage.setItem(LS_HISTORY, JSON.stringify(h)); } catch { /**/ }
}

type YTCtxType = {
  videoId: string | null; isPlaylist: boolean;
  setVideoId: (id: string | null, playlist?: boolean) => void;
  ytFullscreen: boolean; setYtFullscreen: (v: boolean) => void;
  query: string; setQuery: (q: string) => void;
  results: YTResult[]; searching: boolean; searchError: string | null;
  search: (q: string) => Promise<void>;
  searchesRemaining: number; searchResetTime: string;
  clearResults: () => void;
  history: YTHistoryItem[];
  addToHistory: (item: Omit<YTHistoryItem, "playedAt">) => void;
  clearHistory: () => void;
  removeFromHistory: (id: string) => void;
  nowPlayingTitle: string; setNowPlayingTitle: (t: string) => void;
  lastMusicTab: string; setLastMusicTab: (t: string) => void;
};

const YTCtx = createContext<YTCtxType | null>(null);

export function YouTubeProvider({ children }: { children: ReactNode }) {
  const [videoId, setVideoIdRaw] = useState<string | null>(null);
  const [isPlaylist, setIsPlaylist] = useState(false);
  const [ytFullscreen, setYtFullscreen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<YTResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [nowPlayingTitle, setNowPlayingTitle] = useState("");
  const [lastMusicTab, setLastMusicTab] = useState("playlist");
  const [history, setHistoryState] = useState<YTHistoryItem[]>(loadHistory);
  const [quotaCount, setQuotaCount] = useState(0);
  const ownerIdRef = useRef<string | null>(null);

  useEffect(() => {
    const load = async (uid: string) => {
      ownerIdRef.current = uid;
      try {
        const { data } = await sb.rpc("get_search_quota", { p_owner_id: uid });
        if (typeof data === "number") setQuotaCount(data);
      } catch { /**/ }
    };
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) load(data.session.user.id);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.user) load(session.user.id);
      else { ownerIdRef.current = null; setQuotaCount(0); }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const searchesRemaining = Math.max(0, DAILY_LIMIT - quotaCount);

  const searchResetTime = (() => {
    const now = new Date();
    const mid = new Date(now);
    mid.setHours(24, 0, 0, 0);
    const diffH = Math.floor((mid.getTime() - now.getTime()) / 3600000);
    const diffM = Math.floor(((mid.getTime() - now.getTime()) % 3600000) / 60000);
    return diffH > 0 ? `${diffH}h ${diffM}m` : `${diffM}m`;
  })();

  const setVideoId = useCallback((id: string | null, playlist = false) => {
    setVideoIdRaw(id);
    setIsPlaylist(playlist);
    if (!id) { setNowPlayingTitle(""); setYtFullscreen(false); }
  }, []);

  const clearResults = useCallback(() => {
    setResults([]);
    setSearchError(null);
  }, []);

  const addToHistory = useCallback((item: Omit<YTHistoryItem, "playedAt">) => {
    setHistoryState(prev => {
      const updated = [{ ...item, playedAt: Date.now() }, ...prev.filter(h => h.id !== item.id)].slice(0, HISTORY_MAX);
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

    // Ensure owner ID
    let ownerId = ownerIdRef.current;
    if (!ownerId) {
      const { data } = await supabase.auth.getSession();
      ownerId = data.session?.user?.id ?? null;
      if (ownerId) ownerIdRef.current = ownerId;
    }
    if (!ownerId) {
      setSearchError("Not signed in — please restart the app");
      return;
    }

    // Check quota
    let count: number | null = null;
    try { ({ data: count } = await sb.rpc("get_search_quota", { p_owner_id: ownerId })); } catch { count = 0; }
    if (typeof count === "number" && count >= DAILY_LIMIT) {
      setSearchError(`Daily limit reached. Resets in ${searchResetTime}.`);
      return;
    }

    setSearching(true);
    setSearchError(null);
    setResults([]);

    // Increment quota
    let newCount: number | null = null;
    try { ({ data: newCount } = await sb.rpc("increment_search_quota", { p_owner_id: ownerId })); } catch { newCount = null; }
    if (typeof newCount === "number") setQuotaCount(newCount);

    const projectUrl = import.meta.env.VITE_SUPABASE_URL as string;
    const anonKey    = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

    try {
      const res = await fetch(
        `${projectUrl}/functions/v1/youtube-search?q=${encodeURIComponent(q)}&type=video&maxResults=15`,
        { headers: { Authorization: `Bearer ${anonKey}`, "Content-Type": "application/json" } }
      );
      const json = await res.json();
      if (!res.ok || json.error) {
        setSearchError(json.error ?? `HTTP ${res.status}`);
        try { await sb.rpc("decrement_search_quota", { p_owner_id: ownerId }); } catch { /**/ }
        setQuotaCount(c => Math.max(0, c - 1));
        return;
      }
      setResults(json.items ?? []);
    } catch (err) {
      setSearchError(`Network error: ${String(err)}`);
      try { await sb.rpc("decrement_search_quota", { p_owner_id: ownerId }); } catch { /**/ }
      setQuotaCount(c => Math.max(0, c - 1));
    } finally {
      setSearching(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchResetTime]);

  return (
    <YTCtx.Provider value={{
      videoId, isPlaylist, setVideoId,
      ytFullscreen, setYtFullscreen,
      query, setQuery,
      results, searching, searchError, search,
      searchesRemaining, searchResetTime,
      clearResults,
      history, addToHistory, clearHistory, removeFromHistory,
      nowPlayingTitle, setNowPlayingTitle,
      lastMusicTab, setLastMusicTab,
    }}>
      {children}
    </YTCtx.Provider>
  );
}

export function useYouTube() {
  const ctx = useContext(YTCtx);
  if (!ctx) throw new Error("useYouTube must be inside YouTubeProvider");
  return ctx;
}
