/**
 * Shared YouTube context.
 * - videoId / setVideoId — drives the persistent iframe in AppLayout
 * - search — calls the edge function to get results
 * The iframe is mounted once in AppLayout and never unmounts.
 * visibility:hidden when not on /music keeps audio playing on navigation.
 */
import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export type YTResult = {
  id:        string;
  kind:      string;   // "youtube#video" | "youtube#playlist"
  title:     string;
  channel:   string;
  thumbnail: string;
};

type YouTubeCtx = {
  // Active video/playlist driving the iframe
  videoId:      string | null;
  isPlaylist:   boolean;
  setVideoId:   (id: string | null, playlist?: boolean) => void;

  // Search
  query:        string;
  setQuery:     (q: string) => void;
  results:      YTResult[];
  searching:    boolean;
  searchError:  string | null;
  search:       (q: string) => Promise<void>;

  // Now-playing label
  nowPlayingTitle:    string;
  setNowPlayingTitle: (t: string) => void;
};

const Ctx = createContext<YouTubeCtx | null>(null);

export function YouTubeProvider({ children }: { children: ReactNode }) {
  const [videoId,          setVideoIdRaw     ] = useState<string | null>(null);
  const [isPlaylist,       setIsPlaylist     ] = useState(false);
  const [query,            setQuery          ] = useState("");
  const [results,          setResults        ] = useState<YTResult[]>([]);
  const [searching,        setSearching      ] = useState(false);
  const [searchError,      setSearchError    ] = useState<string | null>(null);
  const [nowPlayingTitle,  setNowPlayingTitle ] = useState("");

  const setVideoId = useCallback((id: string | null, playlist = false) => {
    setVideoIdRaw(id);
    setIsPlaylist(playlist);
    if (!id) setNowPlayingTitle("");
  }, []);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setSearching(true);
    setSearchError(null);
    setResults([]);

    const projectUrl = import.meta.env.VITE_SUPABASE_URL as string;
    const anonKey    = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

    try {
      const url = `${projectUrl}/functions/v1/youtube-search?q=${encodeURIComponent(q)}&type=video&maxResults=15`;
      const res  = await fetch(url, {
        headers: { "Authorization": `Bearer ${anonKey}`, "Content-Type": "application/json" },
      });
      const json = await res.json();
      if (!res.ok || json.error) { setSearchError(json.error ?? "Search failed"); return; }
      setResults(json.items ?? []);
    } catch {
      setSearchError("Could not reach search service");
    } finally {
      setSearching(false);
    }
  }, []);

  return (
    <Ctx.Provider value={{
      videoId, isPlaylist, setVideoId,
      query, setQuery,
      results, searching, searchError, search,
      nowPlayingTitle, setNowPlayingTitle,
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
