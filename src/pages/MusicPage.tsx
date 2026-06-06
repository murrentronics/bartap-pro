/**
 * MusicPage
 *
 * Two views controlled by `ytActive` (a video ID is set in YouTubeContext):
 *
 * VIEW A — Local player  (ytActive = false)
 *   Compact player strip at top + scrollable Playlist / Files tabs
 *   Normal page flow, no fixed positioning, no overflow issues
 *   YouTube tab shows search — tapping a result sets videoId → switches to View B
 *
 * VIEW B — YouTube fullscreen  (ytActive = true)
 *   The iframe is rendered in AppLayout fixed below the header (z-35)
 *   This page renders ONLY a thin "← Back" bar (z-36) at the very top of its area
 *   Everything else is transparent so the iframe fills the screen
 *   User taps ← Back → clears videoId → back to View A (audio stops)
 *
 * Screen never sleeps while this page is mounted (WakeLock API).
 */

import { useRef, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useMusicPlayer } from "@/lib/MusicPlayerContext";
import { useYouTube } from "@/lib/YouTubeContext";
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX,
  Music2, Youtube, FolderOpen, ListMusic,
  Loader2, X, Repeat, Repeat1, Shuffle, Search, ListVideo,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";

function formatTime(secs: number): string {
  if (!isFinite(secs) || secs < 0) return "0:00";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const QUICK_SEARCHES = [
  { label: "🔥 Soca Mix",   q: "soca party mix 2024" },
  { label: "💃 Dancehall",  q: "dancehall mix 2024" },
  { label: "😌 R&B Chill",  q: "rnb chill playlist" },
  { label: "🍹 Bar Vibes",  q: "bar background music mix" },
  { label: "🎶 Top Hits",   q: "top hits 2024 playlist" },
  { label: "🎸 Classics",   q: "classic rock hits playlist" },
  { label: "🌴 Reggae",     q: "reggae mix playlist" },
  { label: "🎵 Hip Hop",    q: "hip hop mix 2024" },
];

export default function MusicPage() {
  const { profile } = useAuth();
  const nav          = useNavigate();
  const player       = useMusicPlayer();
  const yt           = useYouTube();
  const [searchInput, setSearchInput] = useState(yt.query);
  const [searchOpen, setSearchOpen]   = useState(false);
  const [ytSubTab, setYtSubTab]       = useState<"results" | "history">("results");
  const [lastMainTab, setLastMainTab] = useState("playlist"); // default to playlist on first open
  const [showYTFullscreen, setShowYTFullscreen] = useState(false); // controls View B independently
  const fileInputRef   = useRef<HTMLInputElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const wakeLockRef    = useRef<any>(null);

  // When a NEW video is selected, go fullscreen automatically
  // (but NOT when returning from Exit — videoId is still set then)
  const prevVideoIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (yt.videoId && yt.videoId !== prevVideoIdRef.current) {
      setShowYTFullscreen(true);
    }
    prevVideoIdRef.current = yt.videoId;
  }, [yt.videoId]);

  // ── Keep screen awake the entire time this page is open ──────────────────
  useEffect(() => {
    let sentinel: any = null;
    const acquire = async () => {
      try {
        if ("wakeLock" in navigator) {
          sentinel = await (navigator as any).wakeLock.request("screen");
          wakeLockRef.current = sentinel;
        }
      } catch { /* device doesn't support it */ }
    };
    acquire();
    // Re-acquire if page becomes visible again (e.g. after tab switch)
    const onVisible = () => { if (document.visibilityState === "visible") acquire(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      sentinel?.release().catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (profile && (profile.role !== "owner" || !(profile as any).music_addon)) {
      nav("/register", { replace: true });
    }
  }, [profile, nav]);

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = progressBarRef.current?.getBoundingClientRect();
    if (!rect) return;
    player.seekTo(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
  };

  const handleSearch = () => {
    if (!searchInput.trim()) return;
    yt.setQuery(searchInput);
    yt.search(searchInput);
  };

  const playResult = (item: { id: string; kind: string; title: string; channel?: string; thumbnail?: string }) => {
    // Hard-stop local MP3
    player.stopPlayback();
    yt.setVideoId(item.id, item.kind === "youtube#playlist");
    yt.setNowPlayingTitle(item.title);
    yt.addToHistory({
      id:        item.id,
      kind:      item.kind,
      title:     item.title,
      channel:   item.channel   ?? "",
      thumbnail: item.thumbnail ?? "",
    });
    setShowYTFullscreen(true); // go to fullscreen View B
    setSearchOpen(false);
  };

  const PlayModeIcon = () => {
    if (player.playMode === "repeat-one") return <Repeat1 className="h-4 w-4" />;
    if (player.playMode === "shuffle")    return <Shuffle  className="h-4 w-4" />;
    return <Repeat className="h-4 w-4" />;
  };

  const bars = Array.from({ length: 14 });
  if (!profile || profile.role !== "owner") return null;

  const ytActive = !!yt.videoId; // video is loaded in iframe (may or may not be fullscreen)

  // ─────────────────────────────────────────────────────────────────────────
  // VIEW B — YouTube fullscreen (only when showYTFullscreen is true)
  // ─────────────────────────────────────────────────────────────────────────
  if (showYTFullscreen && yt.videoId) {
    return (
      <div className="-mx-3 -mt-3" style={{ minHeight: "calc(100vh - 44px)" }}>

        {/* Transparent tap-blocker — covers YouTube's title/CC/settings row
            so tapping those controls doesn't open the external YouTube app  */}
        {!searchOpen && (
          <div
            style={{
              position: "fixed",
              top: "calc(44px + env(safe-area-inset-top, 0px))",
              left: 0, right: 0,
              height: 72, // covers title + icon row at top of player
              zIndex: 36,
              background: "transparent",
            }}
          />
        )}

        {/* Search panel — slides in over the iframe when searchOpen */}
        {searchOpen ? (
          <div
            style={{
              position: "fixed",
              left: 0, right: 0, bottom: 0,
              zIndex: 36,
              maxHeight: "70vh",
              background: "rgba(10,10,20,0.97)",
              borderTop: "1px solid rgba(239,68,68,0.25)",
              backdropFilter: "blur(12px)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Search input row */}
            <div className="flex gap-2 px-3 pt-3 pb-1 shrink-0">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-red-400/70 pointer-events-none" />
                <Input
                  autoFocus
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && yt.searchesRemaining > 0 && handleSearch()}
                  placeholder="Search songs, artists…"
                  className="pl-9 text-sm bg-black/60 border-red-500/40 text-white placeholder:text-white/30 h-10 rounded-xl"
                />
              </div>
              <button onClick={handleSearch}
                disabled={!searchInput.trim() || yt.searching || yt.searchesRemaining === 0}
                className="h-10 px-3 rounded-xl text-white font-bold text-sm disabled:opacity-40 active:scale-95 transition shrink-0"
                style={{ background: "linear-gradient(135deg, #ef4444, #b91c1c)" }}>
                {yt.searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </button>
              <button
                onClick={() => { yt.setQuery(""); setSearchOpen(false); }}
                className="h-10 px-3 rounded-xl text-white/60 hover:text-white transition shrink-0"
                style={{ background: "rgba(255,255,255,0.06)" }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {/* Quota bar */}
            <div className="flex items-center justify-between px-4 pb-2 shrink-0">
              <span className="text-xs">
                {yt.searchesRemaining > 0
                  ? <><span className={`font-bold ${yt.searchesRemaining <= 10 ? "text-yellow-400" : "text-white/50"}`}>{yt.searchesRemaining}</span><span className="text-white/30"> searches left</span></>
                  : <span className="text-red-400 font-bold">Limit reached — resets in {yt.searchResetTime}</span>
                }
              </span>
              <div className="h-1 w-20 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full rounded-full transition-all"
                  style={{
                    width: `${(yt.searchesRemaining / 100) * 100}%`,
                    background: yt.searchesRemaining <= 10 ? "#eab308" : "#22c55e",
                  }} />
              </div>
            </div>

            {/* Results list */}
            <div className="overflow-y-auto px-3 pb-4 flex-1">
              {yt.searching && (
                <div className="flex items-center justify-center py-10 gap-3 text-white/40">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-sm">Searching…</span>
                </div>
              )}
              {yt.searchError && !yt.searching && (
                <div className="rounded-xl p-4 text-center"
                  style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                  <p className="text-red-400 text-sm font-bold">Search unavailable</p>
                  <p className="text-white/50 text-xs mt-1">{yt.searchError}</p>
                </div>
              )}
              {!yt.searching && yt.results.length > 0 && (
                <div className="space-y-1">
                  {yt.results.map(item => (
                    <button key={item.id}
                      onClick={() => { playResult(item); setSearchOpen(false); yt.setQuery(""); }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left active:scale-[0.98] transition border border-transparent hover:border-red-500/20"
                      style={{ background: "rgba(255,255,255,0.04)" }}>
                      <div className="h-12 w-20 rounded-lg overflow-hidden shrink-0 bg-black/40">
                        {item.thumbnail
                          ? <img src={item.thumbnail} alt="" className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center"><Youtube className="h-5 w-5 text-red-400/50" /></div>
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-xs font-bold line-clamp-2 leading-tight">{item.title}</p>
                        <p className="text-white/40 text-[10px] mt-0.5 truncate">{item.channel}</p>
                      </div>
                      {item.kind === "youtube#playlist" && <ListVideo className="h-4 w-4 text-red-400/60 shrink-0" />}
                    </button>
                  ))}
                </div>
              )}
              {/* History shown when no search results yet */}
              {!yt.searching && yt.results.length === 0 && yt.history.length > 0 && (
                <div>
                  <p className="text-white/40 text-xs font-bold uppercase tracking-wider mb-2">Recently Played</p>
                  <div className="space-y-1">
                    {yt.history.map(item => (
                      <button key={item.id + item.playedAt}
                        onClick={() => { playResult(item); setSearchOpen(false); }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left active:scale-[0.98] transition border border-transparent hover:border-red-500/20"
                        style={{ background: "rgba(255,255,255,0.04)" }}>
                        <div className="h-10 w-16 rounded-lg overflow-hidden shrink-0 bg-black/40">
                          {item.thumbnail
                            ? <img src={item.thumbnail} alt="" className="w-full h-full object-cover" />
                            : <div className="w-full h-full flex items-center justify-center"><Youtube className="h-4 w-4 text-red-400/50" /></div>
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-xs font-bold line-clamp-1">{item.title}</p>
                          <p className="text-white/40 text-[10px] truncate">{item.channel}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ── Minimised footer — track playing, search icon ── */
          <div
            style={{
              position: "fixed",
              left: 0, right: 0, bottom: 0,
              zIndex: 36,
              background: "rgba(0,0,0,0.82)",
              borderTop: "1px solid rgba(239,68,68,0.2)",
              backdropFilter: "blur(8px)",
            }}
          >
            <div className="flex items-center gap-3 px-3 h-14">
              {/* Animated bars */}
              <div className="flex items-end gap-px h-4 shrink-0">
                {[0,1,2,3].map(b => (
                  <div key={b} className="w-0.5 rounded-full bg-red-400"
                    style={{ height: "100%", animation: `musicBar ${0.35+b*0.12}s ease-in-out infinite alternate`, animationDelay: `${b*0.08}s` }} />
                ))}
              </div>
              {/* Track title */}
              <span className="text-white text-xs font-bold truncate flex-1">{yt.nowPlayingTitle || "YouTube playing"}</span>
              {/* Search button */}
              <button
                onClick={() => { setSearchInput(""); setSearchOpen(true); }}
                className="h-9 px-3 rounded-lg flex items-center gap-1.5 text-xs font-bold text-white shrink-0 active:scale-95 transition"
                style={{ background: "rgba(239,68,68,0.7)" }}
              >
                <Search className="h-3.5 w-3.5" /> Search
              </button>
              {/* Red Exit button — hides fullscreen, music keeps playing */}
              <button
                onClick={() => {
                  setShowYTFullscreen(false);
                  setLastMainTab("youtube");
                }}
                className="h-9 px-3 rounded-lg flex items-center gap-1.5 text-xs font-bold text-white shrink-0 active:scale-95 transition"
                style={{ background: "rgba(180,0,0,0.85)" }}
              >
                <X className="h-3.5 w-3.5" /> Exit
              </button>
            </div>
            <style>{`
              @keyframes musicBar {
                from { transform: scaleY(0.3); }
                to   { transform: scaleY(1); }
              }
            `}</style>
          </div>
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // VIEW A — Local player + Playlist / Files / YouTube search
  // ─────────────────────────────────────────────────────────────────────────
  const onYouTubeTab = lastMainTab === "youtube";

  return (
    <div className="-mx-3 -mt-3" style={{ background: "#000", minHeight: "calc(100vh - 44px)" }}>

      {/* ── Top section: MP3 player (Playlist/Files) OR YouTube mini-player (YouTube tab) ── */}
      {onYouTubeTab ? (
        /* YouTube mini now-playing strip */
        <div
          className="px-4 py-3"
          style={{
            background: "linear-gradient(180deg, #1a0808 0%, #0d0a0a 100%)",
            borderBottom: "1px solid rgba(239,68,68,0.2)",
          }}
        >
          {yt.nowPlayingTitle ? (
            <div className="flex items-center gap-3">
              {/* Animated bars */}
              <div className="flex items-end gap-px h-6 shrink-0">
                {[0,1,2,3,4].map(b => (
                  <div key={b} className="w-1 rounded-full bg-red-400"
                    style={{
                      height: "100%",
                      animation: `musicBar ${0.35+b*0.1}s ease-in-out infinite alternate`,
                      animationDelay: `${b*0.07}s`,
                    }} />
                ))}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-xs font-black truncate">{yt.nowPlayingTitle}</p>
                <p className="text-red-400/60 text-[10px] mt-0.5">YouTube playing in background</p>
              </div>
              {/* Tap to go back to fullscreen */}
              <button
                onClick={() => setShowYTFullscreen(true)}
                className="h-8 px-3 rounded-lg text-xs font-bold text-white shrink-0 active:scale-95 transition"
                style={{ background: "rgba(239,68,68,0.6)" }}
              >
                ▶ Resume
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-center py-2 gap-2 text-white/30">
              <Youtube className="h-4 w-4" />
              <span className="text-xs">No video playing</span>
            </div>
          )}
        </div>
      ) : (
      /* ── Compact MP3 player strip ── */
      <div
        className="relative px-4 pt-3 pb-3"
        style={{
          background: "linear-gradient(180deg, #0a0a2e 0%, #0d1117 100%)",
          borderBottom: "1px solid rgba(59,130,246,0.2)",
        }}
      >
        {/* Glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-16 rounded-full blur-3xl opacity-20 pointer-events-none"
          style={{ background: "radial-gradient(circle, #3b82f6 0%, #1d4ed8 100%)" }} />

        {/* Visualizer bars */}
        <div className="flex items-end justify-center gap-0.5 h-6 w-full relative z-10 mb-2">
          {bars.map((_, i) => (
            <div key={i} className="rounded-full w-1.5"
              style={{
                background: "linear-gradient(to top, #3b82f6, #93c5fd)",
                height: "40%",
                animation: player.playerState === "playing"
                  ? `musicBar ${0.45 + i * 0.05}s ease-in-out infinite alternate` : "none",
                animationDelay: `${i * 0.04}s`,
                opacity: player.playerState === "playing" ? 0.8 : 0.2,
              }} />
          ))}
        </div>

        {/* Track name */}
        <div className="text-center relative z-10 mb-2">
          <div className="text-white font-black text-sm leading-tight truncate px-4">
            {player.currentTrack?.title ?? "No track selected"}
          </div>
          {player.currentTrack?.artist && (
            <div className="text-blue-300/60 text-xs mt-0.5 truncate px-4">{player.currentTrack.artist}</div>
          )}
        </div>

        {/* Progress bar */}
        <div className="relative z-10 mb-1.5">
          <div ref={progressBarRef} onClick={handleProgressClick}
            className="w-full h-1.5 rounded-full cursor-pointer relative overflow-hidden"
            style={{ background: "rgba(59,130,246,0.2)" }}>
            <div className="absolute left-0 top-0 h-full rounded-full transition-all"
              style={{ width: `${player.progress * 100}%`, background: "linear-gradient(to right, #3b82f6, #93c5fd)" }} />
          </div>
          <div className="flex justify-between text-[10px] text-blue-300/40 mt-0.5">
            <span>{formatTime(player.elapsed)}</span>
            <span>{formatTime(player.duration)}</span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-5 relative z-10">
          <button onClick={player.cyclePlayMode}
            className={`transition active:scale-90 ${player.playMode !== "normal" ? "text-blue-400" : "text-blue-200/30"}`}>
            <PlayModeIcon />
          </button>
          <button onClick={player.playPrev} className="text-blue-200/70 hover:text-white active:scale-90 transition">
            <SkipBack className="h-6 w-6" />
          </button>
          <button onClick={player.togglePlay}
            className="h-11 w-11 rounded-full flex items-center justify-center active:scale-90 transition"
            style={{ background: "linear-gradient(135deg, #3b82f6, #1d4ed8)", boxShadow: "0 0 16px rgba(59,130,246,0.45)" }}>
            {player.playerState === "loading"
              ? <Loader2 className="h-5 w-5 text-white animate-spin" />
              : player.playerState === "playing"
              ? <Pause className="h-5 w-5 text-white" />
              : <Play  className="h-5 w-5 text-white ml-0.5" />}
          </button>
          <button onClick={player.playNext} className="text-blue-200/70 hover:text-white active:scale-90 transition">
            <SkipForward className="h-6 w-6" />
          </button>
          <button onClick={player.toggleMute} className="text-blue-200/30 hover:text-blue-200/70 active:scale-90 transition">
            {player.muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
        </div>
      </div>
      )} {/* end MP3 player / YouTube mini-player conditional */}

      {/* ── Tabs — scrollable, no fixed positioning ───────────────────── */}
      <div style={{ background: "#0d1117" }}>
        <Tabs defaultValue={lastMainTab} onValueChange={v => setLastMainTab(v)}>
          <TabsList className="grid grid-cols-3 mx-3 mt-2"
            style={{ background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.2)" }}>
            <TabsTrigger value="playlist" className="gap-1.5 data-[state=active]:text-blue-300">
              <ListMusic className="h-3.5 w-3.5" /> Playlist
            </TabsTrigger>
            <TabsTrigger value="files" className="gap-1.5 data-[state=active]:text-blue-300">
              <FolderOpen className="h-3.5 w-3.5" /> Files
            </TabsTrigger>
            <TabsTrigger value="youtube" className="gap-1.5 data-[state=active]:text-blue-300">
              <Youtube className="h-3.5 w-3.5" /> YouTube
            </TabsTrigger>
          </TabsList>

          {/* Playlist */}
          <TabsContent value="playlist" className="px-3 pb-8 mt-2">
            {player.playlist.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-blue-300/40 gap-2">
                <Music2 className="h-10 w-10" />
                <p className="text-sm">Playlist is empty</p>
                <p className="text-xs opacity-70">Add files from the Files tab</p>
              </div>
            ) : (
              <div className="space-y-1">
                {player.playlist.map((track, i) => (
                  <div key={track.id} onClick={() => { if (yt.videoId) yt.setVideoId(null); player.playTrack(i); }}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer active:scale-[0.98] transition border ${
                      i === player.currentIndex ? "border-blue-500/50" : "border-transparent"
                    }`}
                    style={{ background: i === player.currentIndex ? "rgba(59,130,246,0.15)" : "rgba(255,255,255,0.03)" }}>
                    <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: "rgba(59,130,246,0.2)" }}>
                      <Music2 className="h-4 w-4 text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-white text-xs font-bold truncate">{track.title}</div>
                      {track.artist && <div className="text-blue-300/60 text-[10px] truncate">{track.artist}</div>}
                    </div>
                    {i === player.currentIndex && player.playerState === "playing" && (
                      <div className="flex items-end gap-0.5 h-4 shrink-0">
                        {[0,1,2].map(b => (
                          <div key={b} className="w-1 rounded-full bg-blue-400"
                            style={{ height: "100%", animation: `musicBar ${0.4+b*0.15}s ease-in-out infinite alternate`, animationDelay: `${b*0.1}s` }} />
                        ))}
                      </div>
                    )}
                    <button onClick={e => { e.stopPropagation(); player.removeTrack(i); }}
                      className="text-red-400/40 hover:text-red-400 p-1 transition shrink-0">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Files */}
          <TabsContent value="files" className="px-3 pb-8 mt-2">
            <div className="space-y-4">
              <div className="rounded-2xl p-6 flex flex-col items-center gap-3 border-2 border-dashed cursor-pointer active:scale-[0.98] transition"
                style={{ borderColor: "rgba(59,130,246,0.3)", background: "rgba(59,130,246,0.05)" }}
                onClick={() => fileInputRef.current?.click()}>
                <div className="h-14 w-14 rounded-2xl flex items-center justify-center"
                  style={{ background: "linear-gradient(135deg, rgba(59,130,246,0.3), rgba(29,78,216,0.3))" }}>
                  <FolderOpen className="h-7 w-7 text-blue-400" />
                </div>
                <div className="text-center">
                  <p className="text-white font-bold">Browse Device Storage</p>
                  <p className="text-blue-300/60 text-xs mt-1">MP3, M4A, OGG, FLAC, WAV</p>
                </div>
              </div>
              <input ref={fileInputRef} type="file" accept="audio/*" multiple className="hidden"
                onChange={e => { player.addFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
              {player.playlist.filter(t => t.type === "local").length > 0 && (
                <div>
                  <p className="text-blue-300/60 text-xs font-bold uppercase tracking-wider mb-2">
                    Saved files ({player.playlist.filter(t => t.type === "local").length})
                  </p>
                  <div className="space-y-1">
                    {player.playlist.filter(t => t.type === "local").map(track => (
                      <div key={track.id}
                        onClick={() => { if (yt.videoId) yt.setVideoId(null); player.playTrack(player.playlist.indexOf(track)); }}
                        className="flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer"
                        style={{ background: "rgba(59,130,246,0.07)" }}>
                        <Music2 className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                        <span className="text-white text-xs truncate flex-1">{track.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          {/* YouTube — search + sub-tabs */}
          <TabsContent value="youtube" className="px-3 pb-8 mt-2">
            <div className="space-y-3">

              {/* Search bar */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-red-400/70 pointer-events-none" />
                  <Input
                    value={searchInput}
                    onChange={e => setSearchInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter" && yt.searchesRemaining > 0) {
                        handleSearch();
                        setYtSubTab("results");
                      }
                    }}
                    placeholder="Search songs, artists…"
                    className="pl-9 text-sm bg-black/50 border-red-500/40 text-white placeholder:text-white/30 h-11 rounded-xl"
                  />
                </div>
                <button
                  onClick={() => { handleSearch(); setYtSubTab("results"); }}
                  disabled={!searchInput.trim() || yt.searching || yt.searchesRemaining === 0}
                  className="h-11 px-4 rounded-xl text-white font-bold text-sm disabled:opacity-40 active:scale-95 transition shrink-0 flex items-center gap-1.5"
                  style={{ background: "linear-gradient(135deg, #ef4444, #b91c1c)" }}>
                  {yt.searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </button>
              </div>

              {/* Quota */}
              <div className="flex items-center justify-between px-1">
                <span className="text-white/30 text-xs">
                  {yt.searchesRemaining > 0
                    ? <><span className={`font-bold ${yt.searchesRemaining <= 10 ? "text-yellow-400" : "text-white/50"}`}>{yt.searchesRemaining}</span> searches left today</>
                    : <span className="text-red-400 font-bold">Limit reached — resets in {yt.searchResetTime}</span>
                  }
                </span>
                <div className="h-1 w-24 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full rounded-full transition-all"
                    style={{
                      width: `${(yt.searchesRemaining / 100) * 100}%`,
                      background: yt.searchesRemaining <= 10 ? "#eab308" : yt.searchesRemaining <= 25 ? "#f97316" : "#22c55e",
                    }} />
                </div>
              </div>

              {/* Sub-tabs: Results | History */}
              <div className="flex gap-1 p-1 rounded-xl" style={{ background: "rgba(255,255,255,0.05)" }}>
                <button
                  onClick={() => setYtSubTab("results")}
                  className={`flex-1 h-8 rounded-lg text-xs font-bold transition ${ytSubTab === "results" ? "text-white" : "text-white/40 hover:text-white/70"}`}
                  style={ytSubTab === "results" ? { background: "rgba(239,68,68,0.7)" } : {}}
                >
                  Results {yt.results.length > 0 && `(${yt.results.length})`}
                </button>
                <button
                  onClick={() => setYtSubTab("history")}
                  className={`flex-1 h-8 rounded-lg text-xs font-bold transition ${ytSubTab === "history" ? "text-white" : "text-white/40 hover:text-white/70"}`}
                  style={ytSubTab === "history" ? { background: "rgba(239,68,68,0.7)" } : {}}
                >
                  History {yt.history.length > 0 && `(${yt.history.length})`}
                </button>
              </div>

              {/* ── Results sub-tab ── */}
              {ytSubTab === "results" && (
                <>
                  {yt.searching && (
                    <div className="flex items-center justify-center py-10 gap-3 text-white/40">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span className="text-sm">Searching…</span>
                    </div>
                  )}
                  {yt.searchError && !yt.searching && (
                    <div className="rounded-xl p-4 text-center"
                      style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                      <p className="text-red-400 text-sm font-bold">Search unavailable</p>
                      <p className="text-white/50 text-xs mt-1">{yt.searchError}</p>
                    </div>
                  )}
                  {!yt.searching && yt.results.length === 0 && !yt.searchError && (
                    <div>
                      <p className="text-white/40 text-xs font-bold uppercase tracking-wider mb-2">Quick Play</p>
                      <div className="grid grid-cols-2 gap-2">
                        {QUICK_SEARCHES.map(({ label, q }) => (
                          <button key={q}
                            onClick={() => { setSearchInput(q); yt.setQuery(q); yt.search(q); setYtSubTab("results"); }}
                            className="px-3 py-3 rounded-xl text-sm font-bold text-white text-left active:scale-95 transition leading-tight"
                            style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {!yt.searching && yt.results.length > 0 && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-white/40 text-xs font-bold uppercase tracking-wider">
                          Results for "{yt.query}"
                        </p>
                        <button onClick={() => { yt.setQuery(""); setSearchInput(""); }}
                          className="text-white/30 hover:text-white/60 transition">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {yt.results.map(item => (
                        <button key={item.id} onClick={() => playResult(item)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left active:scale-[0.98] transition border ${
                            yt.videoId === item.id ? "border-red-500/60" : "border-transparent hover:border-red-500/20"
                          }`}
                          style={{ background: yt.videoId === item.id ? "rgba(239,68,68,0.18)" : "rgba(255,255,255,0.04)" }}>
                          <div className="h-12 w-20 rounded-lg overflow-hidden shrink-0 bg-black/40">
                            {item.thumbnail
                              ? <img src={item.thumbnail} alt="" className="w-full h-full object-cover" />
                              : <div className="w-full h-full flex items-center justify-center"><Youtube className="h-5 w-5 text-red-400/50" /></div>
                            }
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-xs font-bold line-clamp-2 leading-tight">{item.title}</p>
                            <p className="text-white/40 text-[10px] mt-0.5 truncate">{item.channel}</p>
                          </div>
                          {item.kind === "youtube#playlist" && <ListVideo className="h-4 w-4 text-red-400/60 shrink-0" />}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* ── History sub-tab ── */}
              {ytSubTab === "history" && (
                <>
                  {yt.history.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-white/30 gap-2">
                      <Youtube className="h-8 w-8" />
                      <p className="text-sm">No history yet</p>
                      <p className="text-xs">Played videos appear here</p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-white/40 text-xs font-bold uppercase tracking-wider">Recently Played</p>
                        <button onClick={yt.clearHistory} className="text-white/20 hover:text-white/50 text-xs transition">
                          Clear all
                        </button>
                      </div>
                      {yt.history.map(item => (
                        <button key={item.id + item.playedAt}
                          onClick={() => playResult(item)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left active:scale-[0.98] transition border border-transparent hover:border-red-500/20"
                          style={{ background: "rgba(255,255,255,0.04)" }}>
                          <div className="h-12 w-20 rounded-lg overflow-hidden shrink-0 bg-black/40">
                            {item.thumbnail
                              ? <img src={item.thumbnail} alt="" className="w-full h-full object-cover" />
                              : <div className="w-full h-full flex items-center justify-center"><Youtube className="h-5 w-5 text-red-400/50" /></div>
                            }
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-xs font-bold line-clamp-2 leading-tight">{item.title}</p>
                            <p className="text-white/40 text-[10px] mt-0.5 truncate">{item.channel}</p>
                          </div>
                          <button onClick={e => { e.stopPropagation(); yt.removeFromHistory(item.id); }}
                            className="text-white/20 hover:text-white/50 p-1.5 transition shrink-0">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <style>{`
        @keyframes musicBar {
          from { transform: scaleY(0.3); }
          to   { transform: scaleY(1); }
        }
      `}</style>
    </div>
  );
}
