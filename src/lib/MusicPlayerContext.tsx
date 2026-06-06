/**
 * Global music player context — lives at the App root so audio never stops
 * when the user navigates between pages.
 *
 * Local files are copied into Capacitor's permanent Documents directory
 * so they survive app restarts and page navigation.
 */
import {
  createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode,
} from "react";
import { Capacitor } from "@capacitor/core";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────
export type Track = {
  id: string;
  title: string;
  artist?: string;
  /** On native: a Filesystem URI (capacitor://...). On web: a blob URI. */
  uri: string;
  type: "local" | "youtube";
};

export type PlayerState = "idle" | "loading" | "playing" | "paused";
export type PlayMode   = "normal" | "repeat-all" | "repeat-one" | "shuffle";

// ─── Storage keys ─────────────────────────────────────────────────────────────
const LS_PLAYLIST = "bpro_music_playlist";
const LS_INDEX    = "bpro_music_index";
const LS_MODE     = "bpro_music_mode";

function persist(playlist: Track[], index: number, mode: PlayMode) {
  try {
    localStorage.setItem(LS_PLAYLIST, JSON.stringify(playlist));
    localStorage.setItem(LS_INDEX,    String(index));
    localStorage.setItem(LS_MODE,     mode);
  } catch { /* ignore */ }
}

function restore(): { playlist: Track[]; index: number; mode: PlayMode } {
  try {
    const raw   = localStorage.getItem(LS_PLAYLIST);
    const idx   = parseInt(localStorage.getItem(LS_INDEX) ?? "-1", 10);
    const mode  = (localStorage.getItem(LS_MODE) ?? "normal") as PlayMode;
    const all   = raw ? (JSON.parse(raw) as Track[]) : [];

    // Blob URIs are session-only — they die on app restart/navigation.
    // Keep only tracks with persistent URIs (file:// saved by Filesystem).
    const persistent = all.filter(t =>
      t.type !== "local" ||          // keep youtube type as-is
      t.uri.startsWith("file://") || // native Filesystem URI — valid
      t.uri.startsWith("_capacitor_") // already converted
    );

    return {
      playlist: persistent.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" })),
      index:    isNaN(idx) ? -1 : Math.min(idx, persistent.length - 1),
      mode,
    };
  } catch {
    return { playlist: [], index: -1, mode: "normal" };
  }
}

// ─── Context shape ────────────────────────────────────────────────────────────
type MusicCtx = {
  playlist:     Track[];
  currentIndex: number;
  playerState:  PlayerState;
  progress:     number;
  elapsed:      number;
  duration:     number;
  muted:        boolean;
  playMode:     PlayMode;
  currentTrack: Track | null;

  playTrack:      (index: number) => void;
  togglePlay:     () => void;
  stopPlayback:   () => void;          // hard stop — clears src, resets state
  playNext:       () => void;
  playPrev:       () => void;
  seekTo:         (ratio: number) => void;
  toggleMute:     () => void;
  cyclePlayMode:  () => void;
  addFiles:       (files: File[]) => Promise<void>;
  removeTrack:    (index: number) => void;
  clearPlaylist:  () => void;
};

const Ctx = createContext<MusicCtx | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────
export function MusicPlayerProvider({ children }: { children: ReactNode }) {
  const saved = restore();
  const [playlist,     setPlaylist    ] = useState<Track[]>   (saved.playlist);
  const [currentIndex, setCurrentIndex] = useState<number>    (saved.index);
  const [playerState,  setPlayerState ] = useState<PlayerState>("idle");
  const [progress,     setProgress    ] = useState(0);
  const [elapsed,      setElapsed     ] = useState(0);
  const [duration,     setDuration    ] = useState(0);
  const [muted,        setMuted       ] = useState(false);
  const [playMode,     setPlayMode    ] = useState<PlayMode>  (saved.mode);

  const audioRef       = useRef<HTMLAudioElement | null>(null);
  const timerRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const playlistRef    = useRef(playlist);
  const indexRef       = useRef(currentIndex);
  const modeRef        = useRef(playMode);

  // Keep refs in sync
  useEffect(() => { playlistRef.current = playlist; }, [playlist]);
  useEffect(() => { indexRef.current    = currentIndex; }, [currentIndex]);
  useEffect(() => { modeRef.current     = playMode; }, [playMode]);

  // Persist on change
  useEffect(() => { persist(playlist, currentIndex, playMode); }, [playlist, currentIndex, playMode]);

  // Create Audio once on mount — never destroyed
  useEffect(() => {
    const audio = new Audio();
    audio.preload = "auto";
    audioRef.current = audio;

    audio.addEventListener("loadedmetadata", () => setDuration(audio.duration));
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", () => {
      // Suppress error toast when src was cleared intentionally (stopPlayback)
      if (audio.dataset.intentionalStop === "1") {
        delete audio.dataset.intentionalStop;
        return;
      }
      toast.error("Playback error");
      setPlayerState("idle");
    });

    return () => { audio.pause(); audio.src = ""; stopTimer(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Internal helpers ────────────────────────────────────────────────────
  function startTimer() {
    stopTimer();
    timerRef.current = setInterval(() => {
      const a = audioRef.current;
      if (!a) return;
      setElapsed(a.currentTime);
      setProgress(a.duration ? a.currentTime / a.duration : 0);
    }, 500);
  }

  function stopTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  function handleEnded() {
    const pl   = playlistRef.current;
    const idx  = indexRef.current;
    const mode = modeRef.current;

    if (mode === "repeat-one") {
      const a = audioRef.current;
      if (a) { a.currentTime = 0; a.play(); }
      return;
    }
    if (mode === "shuffle") {
      playTrack(Math.floor(Math.random() * pl.length));
      return;
    }
    const next = idx + 1;
    if (next < pl.length) {
      playTrack(next);
    } else if (mode === "repeat-all" && pl.length > 0) {
      playTrack(0);
    } else {
      setPlayerState("idle");
    }
  }

  // ── Resolve URI to something the Audio element can play ─────────────────
  async function resolveUri(track: Track): Promise<string> {
    if (!Capacitor.isNativePlatform()) return track.uri;

    const uri = track.uri;

    // Already a blob — use as-is (web session only)
    if (uri.startsWith("blob:")) return uri;

    // Already converted to a Capacitor web URL
    if (uri.startsWith("_capacitor_") || uri.startsWith("capacitor://")) {
      return uri;
    }

    // Native file:// URI from Filesystem.writeFile/getUri
    // convertFileSrc maps it to the WebView's internal scheme so it can load it
    if (uri.startsWith("file://")) {
      return Capacitor.convertFileSrc(uri);
    }

    // http(s) — streaming URL, use directly
    return uri;
  }

  // ── Public API ───────────────────────────────────────────────────────────
  const playTrack = useCallback(async (index: number) => {
    const pl = playlistRef.current;
    const track = pl[index];
    if (!track) return;

    setCurrentIndex(index);
    setPlayerState("loading");
    setProgress(0);
    setElapsed(0);
    setDuration(0);

    const audio = audioRef.current!;
    try {
      const src = await resolveUri(track);
      audio.src = src;
      audio.muted = muted;
      await audio.play();
      setPlayerState("playing");
      startTimer();
    } catch (e) {
      console.error("playTrack error:", e);
      toast.error("Could not play this track");
      setPlayerState("idle");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [muted]);

  const togglePlay = useCallback(async () => {
    const audio = audioRef.current!;
    if (playerState === "playing") {
      audio.pause();
      stopTimer();
      setPlayerState("paused");
    } else if (playerState === "paused" || playerState === "idle") {
      if (audio.src) {
        await audio.play();
        startTimer();
        setPlayerState("playing");
      } else if (playlistRef.current.length > 0) {
        playTrack(indexRef.current >= 0 ? indexRef.current : 0);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerState, playTrack]);

  const stopPlayback = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    // Set flag before clearing src so the error listener doesn't fire a toast
    audio.dataset.intentionalStop = "1";
    audio.pause();
    audio.src = "";
    stopTimer();
    setPlayerState("idle");
    setProgress(0);
    setElapsed(0);
    setDuration(0);
  }, []);

  const playNext = useCallback(() => {
    const pl = playlistRef.current;
    if (!pl.length) return;
    if (modeRef.current === "shuffle") {
      playTrack(Math.floor(Math.random() * pl.length));
    } else {
      playTrack((indexRef.current + 1) % pl.length);
    }
  }, [playTrack]);

  const playPrev = useCallback(() => {
    const pl    = playlistRef.current;
    const audio = audioRef.current;
    if (!pl.length) return;
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      setElapsed(0); setProgress(0);
      return;
    }
    playTrack(indexRef.current <= 0 ? pl.length - 1 : indexRef.current - 1);
  }, [playTrack]);

  const seekTo = useCallback((ratio: number) => {
    const a = audioRef.current;
    if (!a || !a.duration) return;
    a.currentTime = ratio * a.duration;
    setElapsed(a.currentTime);
    setProgress(ratio);
  }, []);

  const toggleMute = useCallback(() => {
    const a = audioRef.current;
    if (a) a.muted = !muted;
    setMuted(m => !m);
  }, [muted]);

  const cyclePlayMode = useCallback(() => {
    setPlayMode(m => {
      const order: PlayMode[] = ["normal", "repeat-all", "repeat-one", "shuffle"];
      const next = order[(order.indexOf(m) + 1) % order.length];
      toast.success({ normal: "Normal", "repeat-all": "Repeat All", "repeat-one": "Repeat 1", shuffle: "Shuffle" }[next]);
      return next;
    });
  }, []);

  /**
   * Add audio files — copies them to permanent Capacitor Documents storage on
   * native so they survive navigation and app restarts.
   */
  const addFiles = useCallback(async (files: File[]) => {
    const audio = files.filter(f => f.type.startsWith("audio/"));
    if (!audio.length) { toast.error("No audio files selected"); return; }

    const newTracks: Track[] = [];

    for (const file of audio) {
      const title = file.name.replace(/\.[^.]+$/, "");

      if (Capacitor.isNativePlatform()) {
        try {
          const { Filesystem, Directory } = await import("@capacitor/filesystem");

          // Read file as base64
          const reader = new FileReader();
          const base64 = await new Promise<string>((res, rej) => {
            reader.onload  = () => res((reader.result as string).split(",")[1]);
            reader.onerror = rej;
            reader.readAsDataURL(file);
          });

          const safeName = `music/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

          await Filesystem.writeFile({
            path:      safeName,
            data:      base64,
            directory: Directory.Documents,
            recursive: true,
          });

          // Get the canonical file:// URI — this is what we store and later pass to convertFileSrc
          const { uri } = await Filesystem.getUri({
            path:      safeName,
            directory: Directory.Documents,
          });

          newTracks.push({ id: Math.random().toString(36).slice(2), title, uri, type: "local" });
        } catch (e) {
          console.error("Failed to save file:", e);
          toast.error(`Could not save ${file.name}`);
        }
      } else {
        // Web — blob URI works fine (session only, same as before)
        newTracks.push({ id: Math.random().toString(36).slice(2), title, uri: URL.createObjectURL(file), type: "local" });
      }
    }

    setPlaylist(p => {
      const updated = [...p];
      let added = 0;
      for (const t of newTracks) {
        const existing = updated.findIndex(e => e.title === t.title && e.type === "local");
        if (existing !== -1) {
          updated[existing] = t;
        } else {
          updated.push(t);
          added++;
        }
      }
      // Keep playlist in alphabetical order by title
      updated.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
      toast.success(`${added > 0 ? `${added} added` : ""}${added > 0 && newTracks.length - added > 0 ? ", " : ""}${newTracks.length - added > 0 ? `${newTracks.length - added} restored` : ""}`);
      return updated;
    });
  }, []);

  const removeTrack = useCallback((index: number) => {
    setPlaylist(p => {
      const next = [...p];
      next.splice(index, 1);
      if (index === indexRef.current) {
        audioRef.current?.pause();
        stopTimer();
        setPlayerState("idle");
        setCurrentIndex(-1);
      } else if (index < indexRef.current) {
        setCurrentIndex(i => i - 1);
      }
      return next;
    });
  }, []);

  const clearPlaylist = useCallback(() => {
    audioRef.current?.pause();
    stopTimer();
    setPlaylist([]);
    setCurrentIndex(-1);
    setPlayerState("idle");
    setProgress(0); setElapsed(0); setDuration(0);
  }, []);

  const currentTrack = currentIndex >= 0 && currentIndex < playlist.length
    ? playlist[currentIndex] : null;

  return (
    <Ctx.Provider value={{
      playlist, currentIndex, playerState, progress, elapsed, duration,
      muted, playMode, currentTrack,
      playTrack, togglePlay, stopPlayback, playNext, playPrev, seekTo,
      toggleMute, cyclePlayMode, addFiles, removeTrack, clearPlaylist,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useMusicPlayer() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useMusicPlayer must be inside MusicPlayerProvider");
  return ctx;
}
