/**
 * OfflinePageGuard.tsx
 *
 * Wraps any page that requires a live network connection.
 * When the device is offline, renders a friendly "unavailable offline"
 * screen instead of the real page content (which would show empty spinners).
 *
 * Usage: wrap the <Outlet /> in AppLayout, or wrap individual page components.
 *
 * Pages that are EXCLUDED (always work offline):
 *   /register  — has full IndexedDB cache
 *   /music     — streams from YouTube but shows cached queue regardless
 *   /language  — pure local settings, no network needed
 */

import { useOffline } from "@/lib/OfflineProvider";
import { useLocation, useNavigate } from "react-router-dom";
import { WifiOff, ShoppingCart } from "lucide-react";
import type { ReactNode } from "react";

// Routes that work fully offline — let them through unconditionally
const OFFLINE_OK = ["/register", "/music", "/language"];

interface Props {
  children: ReactNode;
}

export function OfflinePageGuard({ children }: Props) {
  const { isOnline } = useOffline();
  const loc = useLocation();
  const nav = useNavigate();

  // Check if the current route is offline-capable
  const isOfflineOk = OFFLINE_OK.some((prefix) => loc.pathname.startsWith(prefix));

  // If online, or this route is safe offline, render normally
  if (isOnline || isOfflineOk) return <>{children}</>;

  // Otherwise show the offline placeholder
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100dvh-8rem)] px-6 text-center gap-6">
      {/* Icon */}
      <div className="h-24 w-24 rounded-full flex items-center justify-center"
        style={{ background: "rgba(249,115,22,0.12)", border: "2px solid rgba(249,115,22,0.25)" }}>
        <WifiOff className="h-11 w-11" style={{ color: "#f97316" }} />
      </div>

      {/* Heading */}
      <div className="space-y-2">
        <h2 className="text-2xl font-black">No Internet</h2>
        <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
          This section needs an internet connection. Check your connection and try again.
        </p>
      </div>

      {/* Go to Register — always works offline */}
      <button
        onClick={() => nav("/register")}
        className="flex items-center gap-2 px-6 h-12 rounded-2xl font-black text-sm text-black transition active:scale-95"
        style={{ background: "var(--gradient-hero)" }}
      >
        <ShoppingCart className="h-4 w-4" />
        Go to Register
      </button>
    </div>
  );
}
