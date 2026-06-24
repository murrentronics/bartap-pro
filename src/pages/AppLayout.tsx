import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useYouTube } from "@/lib/YouTubeContext";
import { Loader2, Wine, Package, Wallet, Users, ShieldAlert, Ban, UserMinus, Menu, X, CreditCard, Building2, DollarSign, UserCircle, Receipt, Gamepad2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppLayout() {
  const { session, profile, loading, signOut } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const yt = useYouTube();

  useEffect(() => {
    if (!loading && !session) nav("/login", { replace: true });
  }, [session, loading, nav]);

  useEffect(() => {
    if (!loading && session && !profile) {
      signOut().then(() => nav("/login", { replace: true }));
    }
  }, [loading, session, profile]);

  useEffect(() => {
    if (!loading && profile?.role === "admin" && !loc.pathname.startsWith("/admin")) {
      nav("/admin", { replace: true });
    }
    if (!loading && profile && profile.role !== "admin" && loc.pathname.startsWith("/admin")) {
      nav("/register", { replace: true });
    }
    if (!loading && profile && profile.role === "owner" && profile.status === "pending" && loc.pathname !== "/billing") {
      nav("/billing", { replace: true });
    }
  }, [loading, profile, loc.pathname, nav]);

  // Close menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Close menu on route change + scroll main back to top
  useEffect(() => {
    setMenuOpen(false);
    document.querySelector("main")?.scrollTo({ top: 0, behavior: "instant" });
  }, [loc.pathname]);

  // Hide YouTube fullscreen when navigating away from /music
  useEffect(() => {
    if (loc.pathname !== "/music" && yt.ytFullscreen) {
      yt.setYtFullscreen(false);
    }
  }, [loc.pathname]);

  // Auto-play next history track when current video ends (YT player state 0 = ended)
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      try {
        const data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
        // YouTube IFrame API fires: { event: "infoDelivery", info: { playerState: 0 } }
        if (data?.event === "infoDelivery" && data?.info?.playerState === 0) {
          yt.playNextFromHistory();
        }
      } catch { /* ignore non-JSON messages */ }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [yt.playNextFromHistory]);

  if (loading || !session || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const isOwner    = profile.role === "owner";
  const isAdmin    = profile.role === "admin";
  const isCashier  = profile.role === "cashier";
  const isPending  = !isAdmin && !isCashier && profile.status === "pending";
  const isSuspended = !isAdmin && !isCashier && profile.status === "suspended";
  const hasMusic   = isOwner || isCashier;
  const isOnMusic  = loc.pathname === "/music";

  if (!isAdmin && !isCashier && profile.status === "expelled") {
    return (
      <FullScreenStatus
        icon={UserMinus}
        title="Account expelled"
        message="Your account has been expelled. You no longer have access to Bartendaz Pro."
        onSignOut={() => { signOut(); nav("/login"); }}
      />
    );
  }

  if (isSuspended && loc.pathname !== "/billing") {
    return (
      <FullScreenStatus
        icon={Ban}
        title="Account suspended"
        message="Your account is suspended. Please check your billing page or contact admin."
        onSignOut={() => { signOut(); nav("/login"); }}
        showBillingButton={() => nav("/billing")}
      />
    );
  }

  if (isPending && loc.pathname !== "/billing") {
    return (
      <div className="min-h-screen">
        <header
          className="sticky top-0 z-40 bg-background/90 backdrop-blur border-b border-border"
          style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
        >
          <div className="max-w-2xl mx-auto px-3 h-11 flex items-center justify-between">
            <span className="font-black tracking-tight text-sm">Bartendaz Pro</span>
            <div className="flex items-center gap-2" ref={menuRef}>
              <span className="text-xs font-semibold text-muted-foreground truncate max-w-[100px]">{profile.username}</span>
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className="flex items-center gap-1.5 px-3 h-8 rounded-lg font-bold text-xs transition text-primary-foreground"
                style={{ background: "var(--gradient-hero)" }}
              >
                {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
                Menu
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-10 w-44 rounded-2xl border border-border shadow-2xl overflow-hidden z-[100]"
                  style={{ background: "var(--gradient-card)" }}>
                  <Link to="/billing" className="flex items-center gap-3 px-4 py-4 text-sm font-bold transition border-b border-border/50 text-primary">
                    <CreditCard className="h-5 w-5 shrink-0" /> Billing
                  </Link>
                  <button onClick={() => { signOut(); nav("/login"); }}
                    className="w-full flex items-center gap-3 px-4 py-4 text-sm font-bold text-destructive hover:bg-muted/50 transition">
                    <X className="h-5 w-5 shrink-0" /> Logout / Salir
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="max-w-2xl mx-auto px-3 py-3">
          <div className="flex items-center justify-center min-h-[calc(100vh-8rem)]">
            <div className="max-w-md text-center space-y-6">
              <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-yellow-500/20 border border-yellow-500/40">
                <ShieldAlert className="h-10 w-10 text-yellow-500" />
              </div>
              <h1 className="text-3xl font-black">Account Pending</h1>
              <p className="text-muted-foreground">Your account is awaiting admin approval. Please complete your billing setup to activate your account.</p>
              <Button onClick={() => nav("/billing")} size="lg">Go to Billing</Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const navItems = isAdmin
    ? [
        { to: "/admin",          label: "Users",   icon: Users },
        { to: "/admin/billing",  label: "Billing", icon: DollarSign },
        { to: "/admin/banking",  label: "Banking", icon: Building2 },
      ]
    : [
        { to: "/register", label: "Bar",      icon: Wine },
        { to: "/credit",   label: "Credit",   icon: Receipt },
        ...(isOwner ? [{ to: "/machines", label: "Machines", icon: Gamepad2  }] : []),
        ...(isOwner ? [{ to: "/products", label: "Items",    icon: Package  }] : []),
        ...(isOwner ? [{ to: "/cashiers", label: "Cashiers", icon: Users    }] : []),
        { to: "/wallet",   label: "Wallet",   icon: Wallet },
        ...(isOwner ? [{ to: "/billing",  label: "Billing",  icon: CreditCard }] : []),
        ...(isOwner ? [{ to: "/profile",  label: "Profile",  icon: UserCircle }] : []),
      ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", overflow: "hidden", position: "fixed", inset: 0 }}>
      <header
        className="shrink-0 z-50 bg-background/90 backdrop-blur border-b border-border"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <div className="max-w-2xl mx-auto px-3 h-11 flex items-center justify-between">

          {/* Logo */}
          <div className="flex items-center gap-2">
            <span className="font-black tracking-tight text-sm">Bartendaz Pro</span>
          </div>

          {/* Music / Bar toggle — always visible for owners with music addon */}
          {hasMusic && (
            <Link
              to={isOnMusic ? "/register" : "/music"}
              className="h-10 px-4 rounded-lg flex items-center justify-center font-black text-sm transition active:scale-95 text-primary-foreground"
              style={{ background: "var(--gradient-hero)" }}
              title={isOnMusic ? "Back to Bar" : "Open Music Player"}
            >
              {isOnMusic ? "Bar" : "Music"}
            </Link>
          )}

          {/* Hamburger — no username in header on mobile */}
          <div className="flex items-center gap-2 relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="flex items-center gap-2 px-4 h-10 rounded-lg font-black text-sm transition text-primary-foreground"
              style={{ background: "var(--gradient-hero)" }}
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              Menu
            </button>

            {menuOpen && (
              <div
                className="absolute right-0 top-[calc(100%+6px)] w-64 rounded-2xl border border-border shadow-2xl overflow-hidden z-[100]"
                style={{ background: "var(--gradient-card)" }}
              >
                {/* Owner name — small, at the top of the menu */}
                <div className="px-5 py-3 border-b border-border/50">
                  <span className="text-xs font-semibold text-muted-foreground truncate block">{profile.username}</span>
                </div>

                {navItems.map((it) => {
                  const active = loc.pathname.startsWith(it.to);
                  const Icon = it.icon;
                  return (
                    <Link
                      key={it.to}
                      to={it.to}
                      className={`flex items-center gap-4 px-5 py-5 text-base font-black transition border-b border-border/50 ${
                        active ? "text-primary" : "text-foreground hover:bg-muted/50"
                      }`}
                    >
                      <Icon className="h-6 w-6 shrink-0" />
                      {it.label}
                    </Link>
                  );
                })}
                {/* Factory Reset — owner only, before logout */}
                {isOwner && (
                  <Link
                    to={"/factory-reset" as "/"}
                    className="flex items-center gap-4 px-5 py-5 text-base font-black text-foreground hover:bg-muted/50 transition border-t border-border/50"
                  >
                    <RotateCcw className="h-6 w-6 shrink-0" />
                    Factory Reset
                  </Link>
                )}
                <button
                  onClick={() => { signOut(); nav("/login"); }}
                  className="w-full flex items-center gap-4 px-5 py-5 text-base font-black text-destructive hover:bg-muted/50 transition border-t border-border/50"
                >
                  <X className="h-6 w-6 shrink-0" />
                  Logout / Salir
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto w-full px-3 overflow-y-auto flex-1 scrollbar-none" style={{ overscrollBehavior: "none", WebkitOverflowScrolling: "auto", scrollbarWidth: "none", msOverflowStyle: "none" }}>
        <Outlet />
      </main>

      {/* ── Persistent YouTube iframe ─────────────────────────────────────────
          Mounted once, never destroyed. Sits fixed below the header.
          On /music: fully visible, fills screen below header.
          On other pages: visibility:hidden — invisible but audio keeps playing.
          Header is z-50 so it always shows on top.                          */}
      {hasMusic && yt.videoId && (
        <div
          style={{
            position: "fixed",
            top: "calc(44px + env(safe-area-inset-top, 0px))",
            left: 0, right: 0, bottom: 0,
            zIndex: 35,
            background: "#000",
            // Visible ONLY when fullscreen mode is active
            visibility: yt.ytFullscreen ? "visible" : "hidden",
            pointerEvents: yt.ytFullscreen ? "auto" : "none",
          }}
        >
          <iframe
            id="yt-iframe"
            src={
              yt.isPlaylist
                ? `https://www.youtube-nocookie.com/embed/videoseries?list=${yt.videoId}&autoplay=1&rel=0&modestbranding=1&playsinline=1&iv_load_policy=3&enablejsapi=1`
                : `https://www.youtube-nocookie.com/embed/${yt.videoId}?autoplay=1&rel=0&modestbranding=1&playsinline=1&iv_load_policy=3&enablejsapi=1`
            }
            allow="autoplay; fullscreen; encrypted-media"
            allowFullScreen
            style={{ width: "100%", height: "100%", border: "none" }}
            title="YouTube Player"
            onLoad={(e) => {
              // Tell the iframe to send state change events back via postMessage
              const iframe = e.currentTarget as HTMLIFrameElement;
              iframe.contentWindow?.postMessage(
                JSON.stringify({ event: "listening" }), "*"
              );
            }}
          />
        </div>
      )}

    </div>
  );
}

function FullScreenStatus({
  icon: Icon, title, message, onSignOut, showBillingButton,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  message: string;
  onSignOut: () => void;
  showBillingButton?: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6"
      style={{ background: "radial-gradient(circle at 50% 0%, oklch(0.25 0.05 30) 0%, oklch(0.12 0.02 30) 70%)" }}>
      <div className="max-w-md text-center space-y-6">
        <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-destructive/20 border border-destructive/40">
          <Icon className="h-10 w-10 text-destructive" />
        </div>
        <h1 className="text-3xl font-black">{title}</h1>
        <p className="text-muted-foreground">{message}</p>
        <div className="flex gap-3 justify-center">
          {showBillingButton && <Button onClick={showBillingButton}>Go to Billing</Button>}
          <Button variant="outline" onClick={onSignOut}>Sign out</Button>
        </div>
      </div>
    </div>
  );
}
