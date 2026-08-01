/**
 * useNetworkStatus.ts
 *
 * Reactive hook that tracks whether the browser/device has a network connection.
 * Uses both navigator.onLine for the initial value and the window online/offline
 * events for live updates.
 *
 * Returns { isOnline }
 */

import { useEffect, useState } from "react";

function getOnline(): boolean {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}

export function useNetworkStatus(): { isOnline: boolean } {
  const [isOnline, setIsOnline] = useState<boolean>(getOnline);

  useEffect(() => {
    const handleOnline  = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online",  handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online",  handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return { isOnline };
}
