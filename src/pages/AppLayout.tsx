import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Loader2, Wine, Package, Wallet, Users, ShieldAlert, Ban, UserMinus, Menu, X, CreditCard, Building2, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppLayout() {
  const { session, profile, loading, signOut } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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
    // Redirect pending owners to billing page
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

  // Close menu on route change
  useEffect(() => { setMenuOpen(false); }, [loc.pathname]);

  if (loading || !session || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const isOwner = profile.role === "owner";
  const isAdmin = profile.role === "admin";

  if (!isAdmin) {
    if (profile.status === "expelled") {
      return (
        <FullScreenStatus
          icon={UserMinus}
          title="Account expelled"
          message="Your account has been expelled. You no longer have access to Bartendaz Pro."
          onSignOut={() => { signOut(); nav("/login"); }}
        />
      );
    }
    if (profile.status === "suspended" && loc.pathname !== "/billing") {
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
    // Don't show pending screen anymore - just redirect to billing (handled in useEffect above)
  }

  const navItems = isAdmin
    ? [
        { to: "/admin", label: "Users", icon: Users },
        { to: "/admin/billing", label: "Billing", icon: DollarSign },
        { to: "/admin/banking", label: "Banking", icon: Building2 },
      ]
    : [
        { to: "/register", label: "Cashier", icon: Wine },
        ...(isOwner ? [{ to: "/products", label: "Items", icon: Package }] : []),
        { to: "/wallet", label: "Wallet", icon: Wallet },
        ...(isOwner ? [{ to: "/cashiers", label: "Cashiers", icon: Users }] : []),
        ...(isOwner ? [{ to: "/billing", label: "Billing", icon: CreditCard }] : []),
      ];

  return (
    <div className="min-h-screen">
      <header
        className="sticky top-0 z-40 bg-background/90 backdrop-blur border-b border-border"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <div className="max-w-2xl mx-auto px-3 h-11 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div
              className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: "var(--gradient-hero)" }}
            >
              <Wine className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            <span className="font-black tracking-tight text-sm">Bartendaz Pro</span>
          </div>

          {/* Right side: username + hamburger menu */}
          <div className="flex items-center gap-2" ref={menuRef}>
            <span className="text-xs font-semibold text-muted-foreground truncate max-w-[100px]">
              {profile.username}
            </span>
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
                  onClick={() => { signOut(); nav("/login"); }}
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
  icon: Icon,
  title,
  message,
  onSignOut,
  showBillingButton,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  message: string;
  onSignOut: () => void;
  showBillingButton?: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      style={{ background: "radial-gradient(circle at 50% 0%, oklch(0.25 0.05 30) 0%, oklch(0.12 0.02 30) 70%)" }}
    >
      <div className="max-w-md text-center space-y-6">
        <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-destructive/20 border border-destructive/40">
          <Icon className="h-10 w-10 text-destructive" />
        </div>
        <h1 className="text-3xl font-black">{title}</h1>
        <p className="text-muted-foreground">{message}</p>
        <div className="flex gap-3 justify-center">
          {showBillingButton && (
            <Button onClick={showBillingButton}>Go to Billing</Button>
          )}
          <Button variant="outline" onClick={onSignOut}>Sign out</Button>
        </div>
      </div>
    </div>
  );
}
