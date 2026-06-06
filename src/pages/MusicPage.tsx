import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX,
  Music2, Youtube, FolderOpen, ListMusic, ChevronUp, ChevronDown,
  Loader2, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Capacitor } from "@capacitor/core";

// ─── Types ────────────────────────────────────────────────────────────────────
type Track = {
  id: string;
  title: string;
  artist?: string;
  uri: string;       // local file URI or youtube video id
  type: "local" | "youtube";
  duration?: number; // seconds
};

type PlayerState = "idle" | "loading" | "playing" | "paused";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatTime(secs: number): string {
  if (!isFinite(secs) || secs < 0) return "0:00";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function randomId() {
  return Math.random().toString(36).slice(2);
}

// ─── MusicPage ────────────────────────────────────────────────────────────────
export default function MusicPage() {
  const { profile } = useAuth();
  const nav = useNavigate();

  // Gate — only owners with music_addon can access
  useEffect(() => {
    if (profile && (profile.role !== "owner" || !(profile as any).music_addon)) {
      nav("/register", { replace: true });
    }
  }, [profile, nav]);

  // ── Playlist state ──
  const [playlist, setPlaylist] = useState<Track[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [playerState, setPlayerState] = useState<PlayerState>("idle");
  const [progress, setProgress] = useState(0);   // 0-1
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [playerExpanded, setPlayerExpanded] = useState(true);

  // ── HTML Audio for local files ──
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── YouTube state ──
  const [ytVideoId, setYtVideoId] = useState<string | null>(null);
  const ytFrameRef = useRef<HTMLIFrameElement | null>(null);

  const currentTrack = currentIndex >= 0 ? playlist[currentIndex] : null;

  // ── Audio setup ──────────────────────────────────────────────────────────
  useEffect(() => {
    const audio = new Audio();
    audio.preload = "auto";
    audioRef.current = audio;

    audio.addEventListener("loadedmetadata", () => {
      setDuration(audio.duration);
    });
    audio.addEventListener("ended", () => {
      playNext();
    });
    audio.addEventListener("error", () => {
      toast.error("Could not play this file");
      setPlayerState("idle");
    });

    return () => {
      audio.pause();
      audio.src = "";
      if (progressTimer.current) clearInterval(progressTimer.current);
    };
  }, []);

  const startProgressTimer = () => {
    if (progressTimer.current) clearInterval(progressTimer.current);
    progressTimer.current = setInterval(() => {
      const audio = audioRef.current;
      if (!audio) return;
      setElapsed(audio.currentTime);
      setProgress(audio.duration ? audio.currentTime / audio.duration : 0);
    }, 500);
  };

  const stopProgressTimer = () => {
    if (progressTimer.current) { clearInterval(progressTimer.current); progressTimer.current = null; }
  };

  // ── Play a track ──────────────────────────────────────────────────────────
  const playTrack = async (index: number) => {
    const track = playlist[index];
    if (!track) return;
    setCurrentIndex(index);
    setPlayerState("loading");
    setProgress(0);
    setElapsed(0);
    setDuration(0);

    if (track.type === "youtube") {
      // Embed YouTube — keep playing with screen off via Capacitor Browser
      setYtVideoId(track.uri);
      setPlayerState("playing");
      return;
    }

    // Local file via HTML Audio
    setYtVideoId(null);
    const audio = audioRef.current!;
    audio.src = track.uri;
    audio.muted = muted;
    audio.volume = volume;
    try {
      await audio.play();
      setPlayerState("playing");
      startProgressTimer();
    } catch {
      toast.error("Playback failed");
      setPlayerState("idle");
    }
  };

  const togglePlay = async () => {
    if (!currentTrack) {
      if (playlist.length > 0) { playTrack(0); }
      return;
    }

    if (currentTrack.type === "youtube") {
      // Post message to iframe to toggle play/pause
      ytFrameRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: "command", func: playerState === "playing" ? "pauseVideo" : "playVideo", args: [] }),
        "*"
      );
      setPlayerState(s => s === "playing" ? "paused" : "playing");
      return;
    }

    const audio = audioRef.current!;
    if (playerState === "playing") {
      audio.pause();
      stopProgressTimer();
      setPlayerState("paused");
    } else {
      await audio.play();
      startProgressTimer();
      setPlayerState("playing");
    }
  };

  const playNext = () => {
    if (playlist.length === 0) return;
    const next = (currentIndex + 1) % playlist.length;
    playTrack(next);
  };

  const playPrev = () => {
    if (playlist.length === 0) return;
    const prev = currentIndex <= 0 ? playlist.length - 1 : currentIndex - 1;
    playTrack(prev);
  };

  const seekTo = (ratio: number) => {
    const audio = audioRef.current;
    if (!audio || currentTrack?.type === "youtube") return;
    audio.currentTime = ratio * audio.duration;
    setProgress(ratio);
    setElapsed(audio.currentTime);
  };

  const toggleMute = () => {
    const audio = audioRef.current;
    if (audio) audio.muted = !muted;
    setMuted(m => !m);
  };

  // ── Remove from playlist ──────────────────────────────────────────────────
  const removeTrack = (index: number) => {
    setPlaylist(p => {
      const next = [...p];
      next.splice(index, 1);
      if (index === currentIndex) {
        audioRef.current?.pause();
        stopProgressTimer();
        setPlayerState("idle");
        setCurrentIndex(-1);
      } else if (index < currentIndex) {
        setCurrentIndex(i => i - 1);
      }
      return next;
    });
  };

  // ── Local file picker ─────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    const tracks: Track[] = files
      .filter(f => f.type.startsWith("audio/"))
      .map(f => ({
        id: randomId(),
        title: f.name.replace(/\.[^.]+$/, ""),
        uri: URL.createObjectURL(f),
        type: "local" as const,
      }));

    if (tracks.length === 0) {
      toast.error("No audio files found in selection");
      return;
    }

    setPlaylist(p => [...p, ...tracks]);
    toast.success(`Added ${tracks.length} track${tracks.length > 1 ? "s" : ""}`);
    e.target.value = "";
  };

  // ── YouTube search using YouTube Data API v3 (or noembed as fallback) ─────
  // We use a simple approach: open the YouTube search in Capacitor Browser
  // which supports background audio, then user can add the video ID manually,
  // OR we use the YouTube iframe embed approach.
  
  const addYouTubeUrl = (urlOrId: string) => {
    // Accept full URLs or just video IDs
    let videoId = urlOrId.trim();
    
    // Extract from various URL formats
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
      /^([a-zA-Z0-9_-]{11})$/,
    ];
    
    for (const pattern of patterns) {
      const match = videoId.match(pattern);
      if (match) { videoId = match[1]; break; }
    }

    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      toast.error("Invalid YouTube URL or video ID");
      return;
    }

    // Fetch title via noembed (no API key needed)
    fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`)
      .then(r => r.json())
      .then((data: { title?: string; author_name?: string }) => {
        const track: Track = {
          id: randomId(),
          title: data.title ?? `YouTube — ${videoId}`,
          artist: data.author_name,
          uri: videoId,
          type: "youtube",
        };
        setPlaylist(p => [...p, track]);
        toast.success(`Added: ${track.title}`);
      })
      .catch(() => {
        const track: Track = {
          id: randomId(),
          title: `YouTube — ${videoId}`,
          uri: videoId,
          type: "youtube",
        };
        setPlaylist(p => [...p, track]);
        toast.success("Added YouTube track");
      });
  };

  const [ytInput, setYtInput] = useState("");
  void ytInput; void setYtInput; // kept for potential future use

  // ── Open YouTube in Capacitor Browser (background playback) ──────────────
  const openYouTubeInBrowser = async (videoId: string) => {
    try {
      if (Capacitor.isNativePlatform()) {
        const { Browser } = await import("@capacitor/browser");
        await Browser.open({
          url: `https://www.youtube.com/watch?v=${videoId}`,
          presentationStyle: "popover",
        });
      } else {
        window.open(`https://www.youtube.com/watch?v=${videoId}`, "_blank");
      }
    } catch {
      window.open(`https://www.youtube.com/watch?v=${videoId}`, "_blank");
    }
  };

  // ── Visualizer bars (CSS animation, no audio analysis needed) ────────────
  const bars = Array.from({ length: 20 });

  // ── Waveform progress bar click ──────────────────────────────────────────
  const progressBarRef = useRef<HTMLDivElement>(null);
  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = progressBarRef.current?.getBoundingClientRect();
    if (!rect) return;
    const ratio = (e.clientX - rect.left) / rect.width;
    seekTo(Math.max(0, Math.min(1, ratio)));
  };

  if (!profile || profile.role !== "owner") return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "#000", paddingTop: "env(safe-area-inset-top, 0px)" }}>

      {/* ── TOP 1/3 — Player ──────────────────────────────────────────────── */}
      <div
        className="relative flex-shrink-0 flex flex-col items-center justify-between px-4 pt-3 pb-2 overflow-hidden transition-all duration-300"
        style={{
          minHeight: playerExpanded ? "36vh" : "96px",
          background: "linear-gradient(180deg, #0a0a2e 0%, #0d1117 60%, #000 100%)",
          borderBottom: "1px solid rgba(59,130,246,0.2)",
        }}
      >
        {/* Background glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 rounded-full blur-3xl opacity-30"
            style={{ background: "radial-gradient(circle, #3b82f6 0%, #1d4ed8 50%, transparent 100%)" }} />
        </div>

        {/* Collapse toggle */}
        <button
          onClick={() => setPlayerExpanded(e => !e)}
          className="absolute top-1 right-2 text-blue-400/60 hover:text-blue-300 p-1"
        >
          {playerExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        {playerExpanded ? (
          <>
            {/* Visualizer */}
            <div className="flex items-end justify-center gap-0.5 h-12 w-full mt-2">
              {bars.map((_, i) => (
                <div
                  key={i}
                  className="rounded-full w-1.5 transition-all"
                  style={{
                    background: `linear-gradient(to top, #3b82f6, #93c5fd)`,
                    height: playerState === "playing"
                      ? `${20 + Math.sin(Date.now() / 200 + i * 0.8) * 15 + Math.random() * 20}%`
                      : "15%",
                    animation: playerState === "playing" ? `musicBar ${0.5 + i * 0.05}s ease-in-out infinite alternate` : "none",
                    animationDelay: `${i * 0.04}s`,
                    opacity: playerState === "playing" ? 0.8 + (i % 3) * 0.07 : 0.3,
                  }}
                />
              ))}
            </div>

            {/* Track info */}
            <div className="text-center w-full px-8 flex-1 flex flex-col items-center justify-center">
              <div className="text-white font-black text-base leading-tight line-clamp-1">
                {currentTrack?.title ?? "No track selected"}
              </div>
              {currentTrack?.artist && (
                <div className="text-blue-300/80 text-xs mt-0.5 line-clamp-1">{currentTrack.artist}</div>
              )}
              {currentTrack?.type === "youtube" && (
                <div className="flex items-center gap-1 mt-1">
                  <Youtube className="h-3 w-3 text-red-400" />
                  <span className="text-xs text-red-400/80">YouTube</span>
                  <button
                    onClick={() => currentTrack && openYouTubeInBrowser(currentTrack.uri)}
                    className="text-xs text-blue-400 underline ml-1"
                  >
                    Open in browser
                  </button>
                </div>
              )}
            </div>

            {/* Progress bar */}
            <div className="w-full px-2">
              <div
                ref={progressBarRef}
                onClick={handleProgressClick}
                className="w-full h-1.5 rounded-full cursor-pointer mb-1 relative overflow-hidden"
                style={{ background: "rgba(59,130,246,0.2)" }}
              >
                <div
                  className="absolute left-0 top-0 h-full rounded-full transition-all"
                  style={{ width: `${progress * 100}%`, background: "linear-gradient(to right, #3b82f6, #93c5fd)" }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-blue-300/60">
                <span>{formatTime(elapsed)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-6 pb-1">
              <button onClick={playPrev} className="text-blue-200/70 hover:text-white active:scale-90 transition">
                <SkipBack className="h-6 w-6" />
              </button>
              <button
                onClick={togglePlay}
                className="h-12 w-12 rounded-full flex items-center justify-center active:scale-90 transition shadow-lg"
                style={{ background: "linear-gradient(135deg, #3b82f6, #1d4ed8)", boxShadow: "0 0 20px rgba(59,130,246,0.5)" }}
              >
                {playerState === "loading"
                  ? <Loader2 className="h-5 w-5 text-white animate-spin" />
                  : playerState === "playing"
                  ? <Pause className="h-5 w-5 text-white" />
                  : <Play className="h-5 w-5 text-white ml-0.5" />
                }
              </button>
              <button onClick={playNext} className="text-blue-200/70 hover:text-white active:scale-90 transition">
                <SkipForward className="h-6 w-6" />
              </button>
              <button onClick={toggleMute} className="text-blue-200/70 hover:text-white active:scale-90 transition">
                {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
              </button>
            </div>
          </>
        ) : (
          /* Collapsed mini player */
          <div className="flex items-center gap-3 w-full py-1">
            <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: "linear-gradient(135deg, #3b82f6, #1d4ed8)" }}>
              <Music2 className="h-4 w-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white font-bold text-xs truncate">{currentTrack?.title ?? "No track"}</div>
              <div className="w-full h-1 rounded-full mt-1" style={{ background: "rgba(59,130,246,0.2)" }}>
                <div className="h-full rounded-full" style={{ width: `${progress * 100}%`, background: "#3b82f6" }} />
              </div>
            </div>
            <button onClick={togglePlay} className="h-8 w-8 rounded-full flex items-center justify-center shrink-0"
              style={{ background: "linear-gradient(135deg, #3b82f6, #1d4ed8)" }}>
              {playerState === "playing" ? <Pause className="h-3.5 w-3.5 text-white" /> : <Play className="h-3.5 w-3.5 text-white ml-0.5" />}
            </button>
          </div>
        )}
      </div>

      {/* Hidden YouTube iframe — plays audio even in background */}
      {ytVideoId && currentTrack?.type === "youtube" && (
        <iframe
          ref={ytFrameRef}
          style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
          src={`https://www.youtube.com/embed/${ytVideoId}?enablejsapi=1&autoplay=1&playsinline=1`}
          allow="autoplay; encrypted-media"
          title="yt-player"
        />
      )}

      {/* ── BOTTOM 2/3 — Tabs ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden flex flex-col" style={{ background: "#0d1117" }}>
        <Tabs defaultValue="playlist" className="flex flex-col h-full">
          <TabsList className="grid grid-cols-3 mx-3 mt-2 shrink-0"
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

          {/* ── Playlist tab ───────────────────────────────────────────────── */}
          <TabsContent value="playlist" className="flex-1 overflow-y-auto px-3 pb-8 mt-2">
            {playlist.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-blue-300/40 gap-2">
                <Music2 className="h-10 w-10" />
                <p className="text-sm">Playlist is empty</p>
                <p className="text-xs text-center">Add files from the Files tab or YouTube links from the YouTube tab</p>
              </div>
            ) : (
              <div className="space-y-1">
                {playlist.map((track, i) => (
                  <div
                    key={track.id}
                    onClick={() => playTrack(i)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition active:scale-[0.98] ${
                      i === currentIndex
                        ? "border border-blue-500/50"
                        : "border border-transparent hover:border-blue-500/20"
                    }`}
                    style={{ background: i === currentIndex ? "rgba(59,130,246,0.15)" : "rgba(255,255,255,0.03)" }}
                  >
                    <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: track.type === "youtube" ? "rgba(239,68,68,0.2)" : "rgba(59,130,246,0.2)" }}>
                      {track.type === "youtube"
                        ? <Youtube className="h-4 w-4 text-red-400" />
                        : <Music2 className="h-4 w-4 text-blue-400" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-white text-xs font-bold truncate">{track.title}</div>
                      {track.artist && <div className="text-blue-300/60 text-[10px] truncate">{track.artist}</div>}
                    </div>
                    {i === currentIndex && playerState === "playing" && (
                      <div className="flex items-end gap-0.5 h-4 shrink-0">
                        {[0, 1, 2].map(b => (
                          <div key={b} className="w-1 rounded-full bg-blue-400"
                            style={{ height: "100%", animation: `musicBar ${0.4 + b * 0.15}s ease-in-out infinite alternate`, animationDelay: `${b * 0.1}s` }} />
                        ))}
                      </div>
                    )}
                    <button
                      onClick={e => { e.stopPropagation(); removeTrack(i); }}
                      className="text-red-400/50 hover:text-red-400 p-1 transition shrink-0"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── Files tab ──────────────────────────────────────────────────── */}
          <TabsContent value="files" className="flex-1 overflow-y-auto px-3 pb-8 mt-2">
            <div className="space-y-4">
              <div
                className="rounded-2xl p-6 flex flex-col items-center gap-3 border-2 border-dashed cursor-pointer active:scale-[0.98] transition"
                style={{ borderColor: "rgba(59,130,246,0.3)", background: "rgba(59,130,246,0.05)" }}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="h-14 w-14 rounded-2xl flex items-center justify-center"
                  style={{ background: "linear-gradient(135deg, rgba(59,130,246,0.3), rgba(29,78,216,0.3))" }}>
                  <FolderOpen className="h-7 w-7 text-blue-400" />
                </div>
                <div className="text-center">
                  <p className="text-white font-bold">Browse Device Storage</p>
                  <p className="text-blue-300/60 text-xs mt-1">Tap to select MP3, M4A, OGG, FLAC, WAV files</p>
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                multiple
                className="hidden"
                onChange={handleFileSelect}
              />

              {/* Local tracks in playlist */}
              {playlist.filter(t => t.type === "local").length > 0 && (
                <div>
                  <p className="text-blue-300/60 text-xs font-bold uppercase tracking-wider mb-2">
                    Local files in playlist ({playlist.filter(t => t.type === "local").length})
                  </p>
                  <div className="space-y-1">
                    {playlist.filter(t => t.type === "local").map(track => {
                      const idx = playlist.indexOf(track);
                      return (
                        <div key={track.id}
                          onClick={() => playTrack(idx)}
                          className="flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer"
                          style={{ background: "rgba(59,130,246,0.07)" }}>
                          <Music2 className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                          <span className="text-white text-xs truncate flex-1">{track.title}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          {/* ── YouTube tab ────────────────────────────────────────────────── */}
          <TabsContent value="youtube" className="flex-1 overflow-y-auto px-3 pb-8 mt-2">
            <div className="space-y-4">

              {/* Main launch card */}
              <div
                className="rounded-2xl p-6 flex flex-col items-center gap-4 cursor-pointer active:scale-[0.98] transition"
                style={{ background: "linear-gradient(135deg, rgba(239,68,68,0.15), rgba(0,0,0,0.6))", border: "1px solid rgba(239,68,68,0.3)" }}
                onClick={async () => {
                  try {
                    if (Capacitor.isNativePlatform()) {
                      const { Browser } = await import("@capacitor/browser");
                      await Browser.open({
                        url: "https://m.youtube.com",
                        presentationStyle: "popover",
                        toolbarColor: "#0d1117",
                      });
                    } else {
                      window.open("https://m.youtube.com", "_blank");
                    }
                  } catch {
                    window.open("https://m.youtube.com", "_blank");
                  }
                }}
              >
                <div className="h-16 w-16 rounded-2xl flex items-center justify-center"
                  style={{ background: "linear-gradient(135deg, #ef4444, #b91c1c)", boxShadow: "0 0 30px rgba(239,68,68,0.4)" }}>
                  <Youtube className="h-9 w-9 text-white" />
                </div>
                <div className="text-center">
                  <p className="text-white font-black text-lg">Open YouTube</p>
                  <p className="text-red-300/70 text-sm mt-1">Search any song, artist or playlist</p>
                </div>
                <div className="rounded-xl px-4 py-2 text-white font-bold text-sm"
                  style={{ background: "linear-gradient(135deg, #ef4444, #b91c1c)" }}>
                  Launch YouTube →
                </div>
              </div>

              {/* How it works */}
              <div className="rounded-xl p-4 space-y-2"
                style={{ background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)" }}>
                <p className="text-blue-300 font-bold text-xs uppercase tracking-wider">How it works</p>
                <div className="space-y-2 text-blue-200/70 text-xs leading-relaxed">
                  <p>🎵 Opens YouTube in an overlay using your device's existing Google account — no separate login needed.</p>
                  <p>🔊 Search any song, artist, playlist or mix and hit play.</p>
                  <p>📱 Close the overlay to return to the bar — audio keeps playing in the background.</p>
                  <p>🔄 Tap the YouTube tab again to reopen and control playback.</p>
                </div>
              </div>

              {/* Quick launch shortcuts */}
              <div>
                <p className="text-blue-300/60 text-xs font-bold uppercase tracking-wider mb-2">Quick searches</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: "🎶 Top Hits", q: "top hits 2024 playlist" },
                    { label: "🍹 Bar Vibes", q: "bar music playlist" },
                    { label: "🔥 Soca Mix", q: "soca mix 2024" },
                    { label: "😌 R&B Chill", q: "rnb chill mix" },
                    { label: "🎸 Classics", q: "classic rock hits" },
                    { label: "💃 Dancehall", q: "dancehall mix 2024" },
                  ].map(({ label, q }) => (
                    <button
                      key={q}
                      onClick={async () => {
                        const url = `https://m.youtube.com/results?search_query=${encodeURIComponent(q)}`;
                        try {
                          if (Capacitor.isNativePlatform()) {
                            const { Browser } = await import("@capacitor/browser");
                            await Browser.open({ url, presentationStyle: "popover", toolbarColor: "#0d1117" });
                          } else {
                            window.open(url, "_blank");
                          }
                        } catch {
                          window.open(url, "_blank");
                        }
                      }}
                      className="px-3 py-2.5 rounded-xl text-xs font-bold text-white text-left active:scale-95 transition"
                      style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.2)" }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* CSS for visualizer animation */}
      <style>{`
        @keyframes musicBar {
          from { transform: scaleY(0.3); }
          to   { transform: scaleY(1); }
        }
      `}</style>
    </div>
  );
}
