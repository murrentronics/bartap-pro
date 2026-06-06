/**
 * Shared context for the persistent in-app YouTube player.
 * The iframe lives in AppLayout (never unmounts — audio keeps playing on navigation).
 * MusicPage reads/sets the video ID and search results via this context.
 *
 * NOTE: With the native YouTubeOverlay approach, videoId/search are no longer
 * used for playback — the native WebView handles that. This context is kept
 * for the MusicPage local-file player state only.
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
  // Search state (used only if API key is configured)
  query:        string;
  setQuery:     (q: string) => void;
  results:      YTResult[];
  searching:    boolean;
  searchError:  string | null;
  search:       (q: string) => Promise<void>;

  // Now-playing title shown in the header indicator
  nowPlayingTitle: string;
  setNowPlayingTitle: (t: string) => void;
};

const Ctx = createContext<YouTubeCtx | null>(null);

export function YouTubeProvider({ children }: { children: ReactNode }) {
  const [query,           setQuery          ] = useState("");
  const [results,         setResults        ] = useState<YTResult[]>([]);
  const [searching,       setSearching      ] = useState(false);
  const [searchError,     setSearchError    ] = useState<string | null>(null);
  const [nowPlayingTitle, setNowPlayingTitle ] = useState("");

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
        headers: {
          "Authorization": `Bearer ${anonKey}`,
          "Content-Type":  "application/json",
        },
      });
      const json = await res.json();

      if (!res.ok || json.error) {
        setSearchError(json.error ?? "Search failed");
        return;
      }

      setResults(json.items ?? []);
    } catch {
      setSearchError("Could not reach search service");
    } finally {
      setSearching(false);
    }
  }, []);

  return (
    <Ctx.Provider value={{
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
