import { createFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { Loader2, Wine, Package, Wallet, Users, ShieldAlert, Ban, UserMinus, Menu, X, Receipt, Gamepad2, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useChain } from "@/lib/ChainContext";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { session, profile, loading, signOut } = useAuth();
  const { effectiveOwnerId } = useChain();
  const nav = useNavigate();
  const loc = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // ── Bar session state (owner only — for the toggle in the header) ──────────
  const [barSessionStart, setBarSessionStart] = useState<string | null>(null);
  const [barClosedAt,     setBarClosedAt]     = useState<string | null>(null);
  const [barToggleBusy,   setBarToggleBusy]   = useState(false);
  const barIsOpen = !!barSessionStart && !barClosedAt;

  useEffect(() => {
    if (!loading && !session) nav({ to: "/login" });
  }, [session, loading, nav]);

  useEffect(() => {
    if (!loading && session && !profile) {
      signOut().then(() => nav({ to: "/login" }));
    }
  }, [loading, session, profile]);

  useEffect(() => {
    if (!loading && profile?.role === "admin" && !loc.pathname.startsWith("/admin")) {
      nav({ to: "/admin" as "/" });
    }
  }, [loading, profile, loc.pathname, nav]);

  useEffect(() => {
    if (!loading && profile?.role === "manager" && loc.pathname === "/register") {
      nav({ to: "/manager" as "/" });
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

  // Close menu on route change
  useEffect(() => { setMenuOpen(false); }, [loc.pathname]);

  // Load bar session state for owner toggle
  useEffect(() => {
    if (!profile || profile.role !== "owner") return;
    const ownerId = effectiveOwnerId(profile.id);
    if (!ownerId) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from("profiles")
      .select("bar_session_start, bar_closed_at")
      .eq("id", ownerId)
      .single()
      .then(({ data }: { data: { bar_session_start: string | null; bar_closed_at: string | null } | null }) => {
        setBarSessionStart(data?.bar_session_start ?? null);
        setBarClosedAt(data?.bar_closed_at ?? null);
      });
    const ch = supabase
      .channel(`bar-session-layout-${ownerId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${ownerId}` },
        (payload) => {
          const rec = payload.new as Record<string, unknown>;
          if ("bar_session_start" in rec) setBarSessionStart((rec.bar_session_start as string | null) ?? null);
          if ("bar_closed_at"     in rec) setBarClosedAt((rec.bar_closed_at as string | null) ?? null);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleOpenBar = async () => {
    if (!profile || profile.role !== "owner") return;
    const ownerId = effectiveOwnerId(profile.id);
    setBarToggleBusy(true);
    const now = new Date().toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("profiles")
      .update({ bar_session_start: now, bar_closed_at: null })
      .eq("id", ownerId);
    setBarToggleBusy(false);
    if (error) { toast.error("Failed to open bar"); return; }
    setBarSessionStart(now);
    setBarClosedAt(null);
    toast.success("🟢 Bar opened");
  };

  const handleCloseBar = async () => {
    if (!profile || profile.role !== "owner") return;
    const ownerId = effectiveOwnerId(profile.id);
    setBarToggleBusy(true);
    const now = new Date().toISOString();
    const { data: ownerRow } = await supabase.from("profiles").select("bar_session_start").eq("id", ownerId!).single();
    const sessionStart: string | null = (ownerRow as any)?.bar_session_start ?? null;
    if (sessionStart) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("bar_sessions").insert({ owner_id: ownerId, session_start: sessionStart, session_end: now });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("profiles").update({ bar_closed_at: now }).eq("id", ownerId);
    setBarToggleBusy(false);
    if (error) { toast.error("Failed to close bar"); return; }
    setBarClosedAt(now);
    toast.success("🔴 Bar closed");
  };

  if (loading || !session || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const isOwner   = profile.role === "owner";
  const isAdmin   = profile.role === "admin";
  const isManager = profile.role === "manager";

  if (!isAdmin) {
    if (profile.status === "expelled") {
      return <FullScreenStatus icon={UserMinus} title="Account expelled"
        message="Your account has been expelled. You no longer have access to Bartendaz Pro."
        onSignOut={() => { signOut(); nav({ to: "/login" }); }} />;
    }
    if (profile.status === "suspended") {
      // Allow access to /billing so they can submit a renewal payment
      if (loc.pathname === "/billing") return <Outlet />;
      return <FullScreenStatus icon={Ban} title="Account suspended"
        message="Your subscription has expired or your account has been suspended. Please renew your subscription or contact admin."
        onSignOut={() => { signOut(); nav({ to: "/login" }); }}
        showBillingButton={() => nav({ to: "/billing" as "/" })} />;
    }
    if (profile.status === "pending") {
      return <FullScreenStatus icon={ShieldAlert} title="Awaiting approval"
        message="Your owner account is pending admin approval. You'll get access once approved."
        onSignOut={() => { signOut(); nav({ to: "/login" }); }} />;
    }
  }

  const navItems = isAdmin
    ? [{ to: "/admin", label: "Users", icon: Users }]
    : isManager
    ? [
        { to: "/products", label: "Items",   icon: Package  },
        { to: "/manager",  label: "Manager", icon: BarChart3 },
      ]
    : [
        { to: "/register", label: "Cashier",  icon: Wine },
        { to: "/credit",   label: "Credit",   icon: Receipt },
        { to: "/machines", label: "Machines", icon: Gamepad2 },
        ...(isOwner ? [{ to: "/products", label: "Items",    icon: Package  }] : []),
        ...(isOwner ? [{ to: "/cashiers", label: "Staff",    icon: Users    }] : []),
        { to: "/wallet",   label: "Wallet",   icon: Wallet },
      ];

  return (
    <div className="min-h-screen">
      <header className="bg-background/90 backdrop-blur border-b border-border relative z-50" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <div className="max-w-2xl mx-auto px-3 h-11 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--gradient-hero)" }}>
              <Wine className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            <span className="font-black tracking-tight text-sm">Bartendaz Pro</span>
          </div>

          {/* Right side: username + bar toggle (owner) + hamburger menu */}
          <div className="flex items-center gap-2" ref={menuRef}>
            <span className="text-xs font-semibold text-muted-foreground truncate max-w-[100px]">
              {profile.username}
            </span>
            {/* Bar open/close toggle — owner only, inline with username */}
            {isOwner && (
              <button
                type="button"
                disabled={barToggleBusy}
                onClick={barIsOpen ? handleCloseBar : handleOpenBar}
                className="h-7 px-2.5 rounded-lg font-black text-[11px] flex items-center gap-1 transition active:scale-95 disabled:opacity-50 shrink-0"
                style={barIsOpen
                  ? { background: "rgba(134,239,172,0.12)", border: "1px solid #86efac", color: "#86efac" }
                  : { background: "rgba(239,68,68,0.12)", border: "1px solid #f87171", color: "#f87171" }}
              >
                {barToggleBusy
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : <span className="text-[10px]">{barIsOpen ? "🟢" : "🔴"}</span>}
                {barIsOpen ? "Open" : "Closed"}
              </button>
            )}
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="flex items-center gap-1.5 px-3 h-8 rounded-lg font-bold text-xs transition text-primary-foreground"
              style={{ background: "var(--gradient-hero)" }}
            >
              {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
              Menu
            </button>

            {/* Dropdown */}
            {menuOpen && (
              <div
                className="absolute right-0 top-10 w-44 rounded-2xl border border-border shadow-2xl overflow-hidden z-[100]"
                style={{ background: "var(--gradient-card)" }}
              >
                {navItems.map((it) => {
                  const active = loc.pathname.startsWith(it.to);
                  const Icon = it.icon;
                  return (
                    <Link
                      key={it.to}
                      to={it.to}
                      className={`flex items-center gap-3 px-4 py-4 text-sm font-bold transition border-b border-border/50 last:border-0 ${
                        active ? "text-primary" : "text-foreground hover:bg-muted/50"
                      }`}
                    >
                      <Icon className="h-5 w-5 shrink-0" />
                      {it.label}
                    </Link>
                  );
                })}
                {/* Logout last */}
                <button
                  onClick={() => { signOut(); nav({ to: "/login" }); }}
                  className="w-full flex items-center gap-3 px-4 py-4 text-sm font-bold text-destructive hover:bg-muted/50 transition"
                >
                  <X className="h-5 w-5 shrink-0" />
                  Logout / Salir
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-3 py-3">
        <Outlet />
      </main>
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
