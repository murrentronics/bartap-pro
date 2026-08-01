/**
 * OfflineProvider.tsx
 *
 * React context that:
 *  1. Tracks live network status (isOnline)
 *  2. Exposes the current pending queue size (queueSize)
 *  3. Automatically syncs the queue when the network comes back online
 *  4. Exposes a manual triggerSync() for imperative use
 *
 * Wrap this around the app (inside AuthProvider) so every component
 * can read isOnline and queueSize without prop drilling.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { useNetworkStatus } from "@/lib/useNetworkStatus";
import { getQueueSize } from "@/lib/offlineQueue";
import { syncAllQueued } from "@/lib/syncQueue";

// ─── Context ─────────────────────────────────────────────────────────────────

type OfflineCtx = {
  isOnline: boolean;
  queueSize: number;
  triggerSync: () => Promise<void>;
};

const Ctx = createContext<OfflineCtx>({
  isOnline: true,
  queueSize: 0,
  triggerSync: async () => {},
});

export function useOffline(): OfflineCtx {
  return useContext(Ctx);
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function OfflineProvider({ children }: { children: ReactNode }) {
  const { isOnline } = useNetworkStatus();
  const [queueSize, setQueueSize] = useState(0);
  const syncingRef = useRef(false);
  const wasOfflineRef = useRef(!isOnline);

  /** Refresh the displayed queue count from IndexedDB. */
  const refreshCount = useCallback(async () => {
    try {
      const n = await getQueueSize();
      setQueueSize(n);
    } catch {
      // IndexedDB unavailable (e.g. private browsing edge case) — ignore
    }
  }, []);

  /** Run a full sync pass silently. Toast only on meaningful result. */
  const triggerSync = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    try {
      const result = await syncAllQueued();
      await refreshCount();

      if (result.synced > 0) {
        const label = result.synced === 1 ? "1 order" : `${result.synced} operations`;
        toast.success(`✅ Back online — ${label} synced`, { duration: 4000 });
      }
      if (result.abandoned > 0) {
        toast.warning(
          `⚠️ ${result.abandoned} offline operation${result.abandoned > 1 ? "s" : ""} could not be synced and were discarded.`,
          { duration: 6000 }
        );
      }
    } catch (err) {
      console.error("[OfflineProvider] Sync error:", err);
    } finally {
      syncingRef.current = false;
    }
  }, [refreshCount]);

  // Auto-sync when coming back online
  useEffect(() => {
    if (isOnline && wasOfflineRef.current) {
      // Small delay — let the connection stabilise before firing requests
      const t = setTimeout(() => triggerSync(), 1500);
      wasOfflineRef.current = false;
      return () => clearTimeout(t);
    }
    if (!isOnline) {
      wasOfflineRef.current = true;
    }
  }, [isOnline, triggerSync]);

  // Refresh queue count on mount and whenever isOnline changes
  useEffect(() => {
    refreshCount();
  }, [isOnline, refreshCount]);

  // Also refresh count periodically so it stays accurate
  useEffect(() => {
    const interval = setInterval(refreshCount, 10_000);
    return () => clearInterval(interval);
  }, [refreshCount]);

  return (
    <Ctx.Provider value={{ isOnline, queueSize, triggerSync }}>
      {children}
    </Ctx.Provider>
  );
}
