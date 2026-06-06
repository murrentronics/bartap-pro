import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX,
  Music2, Youtube, FolderOpen, ListMusic,
  Loader2, X, Repeat, Repeat1, Shuffle,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Capacitor } from "@capacitor/core";

// ─── Types ────────────────────────────────────────────────────────────────────
type Track = {
  id: string;
  title: string;
  artist?: string;
  uri: string;
  type: "local" | "youtube" | "local-lost"; // local-lost = blob expired after reload
};

type PlayerState = "idle" | "loading" | "playing" | "paused";
type PlayMode = "normal" | "repeat-all" | "repeat-one" | "shuffle";

const STORAGE_KEY = "bartendaz_music_playlist";
const MODE_KEY    = "bartendaz_music_playmode";
const INDEX_KEY   = "bartendaz_music_index";

function savePlaylist(tracks: Track[], index: number, mode: PlayMode) {
  try {
    // Persist everything — mark local tracks as lost (blob URIs don't survive reload)
    const toSave = tracks.map(t =>
      t.type === "local" ? { ...t, type: "local-lost" as const, uri: "" } : t
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    localStorage.setItem(INDEX_KEY, String(index));
    localStorage.setItem(MODE_KEY, mode);
  } catch { /* storage full — ignore */ }
}

function loadPlaylist(): { tracks: Track[]; index: number; mode: PlayMode } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const tracks: Track[] = raw ? JSON.parse(raw) : [];
    const index = parseInt(localStorage.getItem(INDEX_KEY) ?? "-1", 10);
    const mode = (localStorage.getItem(MODE_KEY) ?? "normal") as PlayMode;
    return { tracks, index: isNaN(index) ? -1 : index, mode };
  } catch {
    return { tracks: [], index: -1, mode: "normal" };
  }
}

function formatTime(secs: number): string {
  if (!isFinite(secs) || secs < 0) return "0:00";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function randomId() {
  return Math.random().toString(36).slice(2);
}

export default function MusicPage() {
  const { profile } = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    if (profile && (profile.role !== "owner" || !(profile as any).music_addon)) {
      nav("/register", { replace: true });
    }
  }, [profile, nav]);

  // ── Playlist & player state ───────────────────────────────────────────────
  const saved = loadPlaylist();
  const [playlist, setPlaylist] = useState<Track[]>(saved.tracks);
  const [currentIndex, setCurrentIndex] = useState<number>(saved.index);
  const [playerState, setPlayerState] = useState<PlayerState>("idle");
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [playMode, setPlayMode] = useState<PlayMode>(saved.mode);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentIndexRef = useRef(currentIndex);
  const playlistRef = useRef(playlist);
  const playModeRef = useRef(playMode);

  // Keep refs in sync
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);
  useEffect(() => { playlistRef.current = playlist; }, [playlist]);
  useEffect(() => { playModeRef.current = playMode; }, [playMode]);

  // Persist playlist, index and mode whenever they change
  useEffect(() => {
    savePlaylist(playlist, currentIndex, playMode);
  }, [playlist, currentIndex, playMode]);

  const currentTrack = currentIndex >= 0 ? playlist[currentIndex] : null;

  // ── Audio setup ──────────────────────────────────────────────────────────
  useEffect(() => {
    const audio = new Audio();
    audio.preload = "auto";
    audioRef.current = audio;

    audio.addEventListener("loadedmetadata", () => setDuration(audio.duration));
    audio.addEventListener("ended", () => handleTrackEnded());
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

  const handleTrackEnded = () => {
    const pl = playlistRef.current;
    const idx = currentIndexRef.current;
    const mode = playModeRef.current;

    if (mode === "repeat-one") {
      // replay same track
      const audio = audioRef.current;
      if (audio) { audio.currentTime = 0; audio.play(); }
      return;
    }
    if (mode === "shuffle") {
      const next = Math.floor(Math.random() * pl.length);
      playTrack(next);
      return;
    }
    // normal or repeat-all
    const next = idx + 1;
    if (next < pl.length) {
      playTrack(next);
    } else if (mode === "repeat-all" && pl.length > 0) {
      playTrack(0);
    } else {
      setPlayerState("idle");
    }
  };

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

  const playTrack = async (index: number) => {
    const track = playlistRef.current[index];
    if (!track) return;

    // Can't play a local file whose blob URI was lost on reload
    if (track.type === "local-lost") {
      toast.error(`"${track.title}" needs to be re-loaded from storage. Tap the Files tab to pick it again.`);
      return;
    }

    setCurrentIndex(index);
    setPlayerState("loading");
    setProgress(0);
    setElapsed(0);
    setDuration(0);

    const audio = audioRef.current!;
    audio.src = track.uri;
    audio.muted = muted;
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
      if (playlist.length > 0) playTrack(0);
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
    if (playMode === "shuffle") {
      playTrack(Math.floor(Math.random() * playlist.length));
    } else {
      playTrack((currentIndex + 1) % playlist.length);
    }
  };

  const playPrev = () => {
    if (playlist.length === 0) return;
    // If >3 sec in, restart; else go previous
    const audio = audioRef.current;
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      setElapsed(0);
      setProgress(0);
      return;
    }
    playTrack(currentIndex <= 0 ? playlist.length - 1 : currentIndex - 1);
  };

  const cyclePlayMode = () => {
    setPlayMode(m => {
      const next: PlayMode = m === "normal" ? "repeat-all" : m === "repeat-all" ? "repeat-one" : m === "repeat-one" ? "shuffle" : "normal";
      toast.success(next === "normal" ? "Normal" : next === "repeat-all" ? "Repeat All" : next === "repeat-one" ? "Repeat 1" : "Shuffle");
      return next;
    });
  };

  const seekTo = (ratio: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = ratio * audio.duration;
    setProgress(ratio);
    setElapsed(audio.currentTime);
  };

  const toggleMute = () => {
    const audio = audioRef.current;
    if (audio) audio.muted = !muted;
    setMuted(m => !m);
  };

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

  // ── File picker ───────────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).filter(f => f.type.startsWith("audio/"));
    if (files.length === 0) { toast.error("No audio files found"); return; }

    setPlaylist(prev => {
      const updated = [...prev];
      let restored = 0;
      let added = 0;

      files.forEach(f => {
        const title = f.name.replace(/\.[^.]+$/, "");
        const uri = URL.createObjectURL(f);
        // Try to restore a lost track with the same name
        const lostIdx = updated.findIndex(t => t.type === "local-lost" && t.title === title);
        if (lostIdx !== -1) {
          updated[lostIdx] = { ...updated[lostIdx], type: "local", uri };
          restored++;
        } else {
          updated.push({ id: randomId(), title, uri, type: "local" });
          added++;
        }
      });

      const msg = [
        restored > 0 ? `${restored} track${restored > 1 ? "s" : ""} restored` : "",
        added > 0 ? `${added} new track${added > 1 ? "s" : ""} added` : "",
      ].filter(Boolean).join(", ");
      toast.success(msg || "Done");
      return updated;
    });

    e.target.value = "";
  };

  // ── Progress bar click ────────────────────────────────────────────────────
  const progressBarRef = useRef<HTMLDivElement>(null);
  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = progressBarRef.current?.getBoundingClientRect();
    if (!rect) return;
    seekTo(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
  };

  // ── YouTube browser open ──────────────────────────────────────────────────
  const openYouTube = async (url: string) => {
    try {
      if (Capacitor.isNativePlatform()) {
        const { Browser } = await import("@capacitor/browser");
        // popover keeps the app header visible so user can tap Bar button to go back
        await Browser.open({ url, presentationStyle: "popover", toolbarColor: "#0d1117" });
      } else {
        window.open(url, "_blank");
      }
    } catch {
      window.open(url, "_blank");
    }
  };

  // ── Play mode icon ────────────────────────────────────────────────────────
  const PlayModeIcon = () => {
    if (playMode === "repeat-one") return <Repeat1 className="h-4 w-4" />;
    if (playMode === "shuffle") return <Shuffle className="h-4 w-4" />;
    return <Repeat className="h-4 w-4" />;
  };

  const bars = Array.from({ length: 18 });

  if (!profile || profile.role !== "owner") return null;

  return (
    // Normal page flow — AppLayout header stays visible above this
    <div className="flex flex-col -mx-3 -mt-3" style={{ minHeight: "calc(100vh - 44px)", background: "#000" }}>

      {/* ── PLAYER SECTION — top portion ─────────────────────────────────── */}
      <div
        className="relative flex flex-col items-center px-4 pt-3 pb-3 overflow-hidden"
        style={{
          minHeight: "38vh",
          background: "linear-gradient(180deg, #0a0a2e 0%, #0d1117 70%, #000 100%)",
          borderBottom: "1px solid rgba(59,130,246,0.2)",
        }}
      >
        {/* Glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-72 h-28 rounded-full blur-3xl opacity-25 pointer-events-none"
          style={{ background: "radial-gradient(circle, #3b82f6 0%, #1d4ed8 50%, transparent 100%)" }} />

        {/* Visualizer bars */}
        <div className="flex items-end justify-center gap-0.5 h-10 w-full mt-1 relative z-10">
          {bars.map((_, i) => (
            <div key={i} className="rounded-full w-1.5"
              style={{
                background: "linear-gradient(to top, #3b82f6, #93c5fd)",
                height: "15%",
                animation: playerState === "playing" ? `musicBar ${0.45 + i * 0.04}s ease-in-out infinite alternate` : "none",
                animationDelay: `${i * 0.035}s`,
                opacity: playerState === "playing" ? 0.75 + (i % 4) * 0.06 : 0.2,
              }} />
          ))}
        </div>

        {/* Track info */}
        <div className="text-center w-full px-4 py-2 relative z-10">
          <div className="text-white font-black text-sm leading-tight line-clamp-1">
            {currentTrack?.title ?? "No track selected"}
          </div>
          {currentTrack?.artist && (
            <div className="text-blue-300/70 text-xs mt-0.5 line-clamp-1">{currentTrack.artist}</div>
          )}
        </div>

        {/* Progress bar */}
        <div className="w-full px-2 relative z-10">
          <div ref={progressBarRef} onClick={handleProgressClick}
            className="w-full h-1.5 rounded-full cursor-pointer mb-1 relative overflow-hidden"
            style={{ background: "rgba(59,130,246,0.2)" }}>
            <div className="absolute left-0 top-0 h-full rounded-full"
              style={{ width: `${progress * 100}%`, background: "linear-gradient(to right, #3b82f6, #93c5fd)" }} />
          </div>
          <div className="flex justify-between text-[10px] text-blue-300/50">
            <span>{formatTime(elapsed)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Controls row */}
        <div className="flex items-center justify-center gap-5 mt-1 relative z-10">
          {/* Play mode cycle */}
          <button onClick={cyclePlayMode}
            className={`transition active:scale-90 ${playMode !== "normal" ? "text-blue-400" : "text-blue-200/40 hover:text-blue-200/70"}`}>
            <PlayModeIcon />
          </button>

          <button onClick={playPrev} className="text-blue-200/70 hover:text-white active:scale-90 transition">
            <SkipBack className="h-6 w-6" />
          </button>

          <button onClick={togglePlay}
            className="h-12 w-12 rounded-full flex items-center justify-center active:scale-90 transition shadow-lg"
            style={{ background: "linear-gradient(135deg, #3b82f6, #1d4ed8)", boxShadow: "0 0 20px rgba(59,130,246,0.5)" }}>
            {playerState === "loading"
              ? <Loader2 className="h-5 w-5 text-white animate-spin" />
              : playerState === "playing"
              ? <Pause className="h-5 w-5 text-white" />
              : <Play className="h-5 w-5 text-white ml-0.5" />}
          </button>

          <button onClick={playNext} className="text-blue-200/70 hover:text-white active:scale-90 transition">
            <SkipForward className="h-6 w-6" />
          </button>

          <button onClick={toggleMute} className="text-blue-200/40 hover:text-blue-200/70 active:scale-90 transition">
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* ── TABS SECTION — bottom portion ────────────────────────────────── */}
      <div className="flex-1 flex flex-col" style={{ background: "#0d1117" }}>
        <Tabs defaultValue="playlist" className="flex flex-col flex-1">
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

          {/* ── Playlist tab ─────────────────────────────────────────────── */}
          <TabsContent value="playlist" className="flex-1 overflow-y-auto px-3 pb-24 mt-2">
            {playlist.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-blue-300/40 gap-2">
                <Music2 className="h-10 w-10" />
                <p className="text-sm">Playlist is empty</p>
                <p className="text-xs text-center opacity-70">Add files from the Files tab or open YouTube to play</p>
              </div>
            ) : (
              <div className="space-y-1">
                {playlist.map((track, i) => (
                  <div key={track.id} onClick={() => playTrack(i)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition active:scale-[0.98] border ${
                      i === currentIndex ? "border-blue-500/50" : "border-transparent hover:border-blue-500/20"
                    } ${track.type === "local-lost" ? "opacity-50" : ""}`}
                    style={{ background: i === currentIndex ? "rgba(59,130,246,0.15)" : "rgba(255,255,255,0.03)" }}>
                    <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: track.type === "local-lost" ? "rgba(239,68,68,0.2)" : "rgba(59,130,246,0.2)" }}>
                      <Music2 className={`h-4 w-4 ${track.type === "local-lost" ? "text-red-400" : "text-blue-400"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-white text-xs font-bold truncate">{track.title}</div>
                      {track.type === "local-lost"
                        ? <div className="text-red-400/70 text-[10px]">File lost — re-load from Files tab</div>
                        : track.artist && <div className="text-blue-300/60 text-[10px] truncate">{track.artist}</div>
                      }
                    </div>
                    {i === currentIndex && playerState === "playing" && (
                      <div className="flex items-end gap-0.5 h-4 shrink-0">
                        {[0, 1, 2].map(b => (
                          <div key={b} className="w-1 rounded-full bg-blue-400"
                            style={{ height: "100%", animation: `musicBar ${0.4 + b * 0.15}s ease-in-out infinite alternate`, animationDelay: `${b * 0.1}s` }} />
                        ))}
                      </div>
                    )}
                    <button onClick={e => { e.stopPropagation(); removeTrack(i); }}
                      className="text-red-400/50 hover:text-red-400 p-1 transition shrink-0">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── Files tab ────────────────────────────────────────────────── */}
          <TabsContent value="files" className="flex-1 overflow-y-auto px-3 pb-24 mt-2">
            <div className="space-y-4">
              <div
                className="rounded-2xl p-6 flex flex-col items-center gap-3 border-2 border-dashed cursor-pointer active:scale-[0.98] transition"
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
              <input ref={fileInputRef} type="file" accept="audio/*" multiple className="hidden" onChange={handleFileSelect} />

              {playlist.filter(t => t.type === "local").length > 0 && (
                <div>
                  <p className="text-blue-300/60 text-xs font-bold uppercase tracking-wider mb-2">
                    Local files ({playlist.filter(t => t.type === "local").length})
                  </p>
                  <div className="space-y-1">
                    {playlist.filter(t => t.type === "local").map(track => (
                      <div key={track.id} onClick={() => playTrack(playlist.indexOf(track))}
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

          {/* ── YouTube tab ──────────────────────────────────────────────── */}
          <TabsContent value="youtube" className="flex-1 overflow-y-auto px-3 pb-24 mt-2">
            <div className="space-y-4">

              {/* Launch card */}
              <div
                className="rounded-2xl p-6 flex flex-col items-center gap-4 cursor-pointer active:scale-[0.98] transition"
                style={{ background: "linear-gradient(135deg, rgba(239,68,68,0.15), rgba(0,0,0,0.6))", border: "1px solid rgba(239,68,68,0.3)" }}
                onClick={() => openYouTube("https://m.youtube.com")}>
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
                <div className="space-y-1.5 text-blue-200/70 text-xs leading-relaxed">
                  <p>🎵 Opens as an overlay — your app header stays visible at the top so you can tap the bar icon to switch back anytime.</p>
                  <p>🔊 Play music, then close the overlay — audio continues in the background.</p>
                  <p>🔄 Reopen YouTube from this tab to change tracks without stopping audio.</p>
                </div>
              </div>

              {/* Quick searches */}
              <div>
                <p className="text-blue-300/60 text-xs font-bold uppercase tracking-wider mb-2">Quick searches</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: "🎶 Top Hits", q: "top hits playlist" },
                    { label: "🍹 Bar Vibes", q: "bar music playlist" },
                    { label: "🔥 Soca Mix", q: "soca mix" },
                    { label: "😌 R&B Chill", q: "rnb chill mix" },
                    { label: "🎸 Classics", q: "classic rock hits" },
                    { label: "💃 Dancehall", q: "dancehall mix" },
                  ].map(({ label, q }) => (
                    <button key={q}
                      onClick={() => openYouTube(`https://m.youtube.com/results?search_query=${encodeURIComponent(q)}`)}
                      className="px-3 py-2.5 rounded-xl text-xs font-bold text-white text-left active:scale-95 transition"
                      style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.2)" }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
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
