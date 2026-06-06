/**
 * Shared YouTube context.
 *
 * Features:
 * - videoId / setVideoId — drives the persistent iframe in AppLayout
 * - search — calls the edge function, enforces a 100-search/day client-side quota
 * - history — auto-saves every played video to localStorage (max 50 entries)
 *             replaying from history costs 0 API calls
 * - searchesRemaining / searchResetTime — shown in the UI as a countdown
 */
import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";

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
  playedAt:  number; // timestamp ms
};

// ── localStorage keys ─────────────────────────────────────────────────────────
const LS_QUOTA   = "yt_search_quota";   // { count: number, date: string "YYYY-MM-DD" }
const LS_HISTORY = "yt_play_history";   // YTHistoryItem[]
const DAILY_LIMIT = 100;
const HISTORY_MAX = 50;

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function loadQuota(): { count: number; date: string } {
  try {
    const raw = localStorage.getItem(LS_QUOTA);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.date === todayStr()) return parsed;
    }
  } catch { /* ignore */ }
  return { count: 0, date: todayStr() };
}

function saveQuota(q: { count: number; date: string }) {
  try { localStorage.setItem(LS_QUOTA, JSON.stringify(q)); } catch { /* ignore */ }
}

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

  // Controls whether the iframe is visible (fullscreen) or hidden behind the page
  ytFullscreen:    boolean;
  setYtFullscreen: (v: boolean) => void;

  query:        string;
  setQuery:     (q: string) => void;
  results:      YTResult[];
  searching:    boolean;
  searchError:  string | null;
  search:       (q: string) => Promise<void>;

  // Quota
  searchesRemaining: number;
  searchResetTime:   string; // e.g. "midnight"

  // History
  history:         YTHistoryItem[];
  addToHistory:    (item: Omit<YTHistoryItem, "playedAt">) => void;
  clearHistory:    () => void;
  removeFromHistory: (id: string) => void;

  nowPlayingTitle:    string;
  setNowPlayingTitle: (t: string) => void;

  // Last active music tab — persists across navigation
  lastMusicTab:    string;
  setLastMusicTab: (tab: string) => void;
};

const Ctx = createContext<YouTubeCtx | null>(null);

export function YouTubeProvider({ children }: { children: ReactNode }) {
  const [videoId,          setVideoIdRaw    ] = useState<string | null>(null);
  const [isPlaylist,       setIsPlaylist    ] = useState(false);
  const [ytFullscreen,     setYtFullscreen  ] = useState(false);
  const [query,            setQuery         ] = useState("");
  const [results,          setResults       ] = useState<YTResult[]>([]);
  const [searching,        setSearching     ] = useState(false);
  const [searchError,      setSearchError   ] = useState<string | null>(null);
  const [nowPlayingTitle,  setNowPlayingTitle] = useState("");
  const [lastMusicTab,     setLastMusicTab   ] = useState("playlist");
  const [quota,            setQuota         ] = useState(loadQuota);
  const [history,          setHistoryState  ] = useState<YTHistoryItem[]>(loadHistory);

  // Reset quota if the day has changed
  useEffect(() => {
    const interval = setInterval(() => {
      setQuota(q => {
        if (q.date !== todayStr()) {
          const fresh = { count: 0, date: todayStr() };
          saveQuota(fresh);
          return fresh;
        }
        return q;
      });
    }, 60_000); // check every minute
    return () => clearInterval(interval);
  }, []);

  const searchesRemaining = Math.max(0, DAILY_LIMIT - quota.count);

  // Show time until midnight local time
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
      // Move to top if already exists, else prepend
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

    // Enforce daily client-side quota
    const current = loadQuota(); // re-read in case another tab updated it
    if (current.count >= DAILY_LIMIT) {
      setSearchError(`Daily search limit reached (${DAILY_LIMIT}/day). Resets in ${searchResetTime}.`);
      return;
    }

    setSearching(true);
    setSearchError(null);
    setResults([]);

    // Increment quota before the request
    const updated = { count: current.count + 1, date: todayStr() };
    saveQuota(updated);
    setQuota(updated);

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
        // Refund the quota count on failure
        const refund = { count: Math.max(0, updated.count - 1), date: todayStr() };
        saveQuota(refund);
        setQuota(refund);
        return;
      }
      setResults(json.items ?? []);
    } catch {
      setSearchError("Could not reach search service");
      const refund = { count: Math.max(0, updated.count - 1), date: todayStr() };
      saveQuota(refund);
      setQuota(refund);
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
