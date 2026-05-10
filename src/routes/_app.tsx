import { createFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { Loader2, Wine, Package, Wallet, Users, LogOut, ShieldAlert, Ban, UserMinus } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { session, profile, loading, signOut } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();

  useEffect(() => {
    if (!loading && !session) nav({ to: "/login" });
  }, [session, loading, nav]);

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
      return <FullScreenStatus icon={UserMinus} title="Account expelled"
        message="Your account has been expelled. You no longer have access to Bartendaz Pro."
        onSignOut={() => { signOut(); nav({ to: "/login" }); }} />;
    }
    if (profile.status === "suspended") {
      return <FullScreenStatus icon={Ban} title="Account suspended"
        message="Please wait while admin is reviewing your account."
        onSignOut={() => { signOut(); nav({ to: "/login" }); }} />;
    }
    if (profile.status === "pending") {
      return <FullScreenStatus icon={ShieldAlert} title="Awaiting approval"
        message="Your owner account is pending admin approval. You'll get access once approved."
        onSignOut={() => { signOut(); nav({ to: "/login" }); }} />;
    }
  }

  const navItems = isAdmin
    ? [{ to: "/admin", label: "Users", icon: Users }]
    : [
        { to: "/register", label: "Register", icon: Wine },
        ...(isOwner ? [{ to: "/products", label: "Items", icon: Package }] : []),
        { to: "/wallet", label: "Wallet", icon: Wallet },
        ...(isOwner ? [{ to: "/cashiers", label: "Cashiers", icon: Users }] : []),
      ];

  return (
    <div className="min-h-screen pb-24">
      <header className="sticky top-0 z-30 backdrop-blur-md bg-background/80 border-b border-border">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ background: "var(--gradient-hero)" }}>
              <Wine className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-black tracking-tight">Bartendaz Pro</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:block">
              {profile.username} <span className="text-xs uppercase opacity-60">· {profile.role}</span>
            </span>
            <Button variant="ghost" size="sm" onClick={() => { signOut(); nav({ to: "/login" }); }}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 inset-x-0 z-30 bg-card/95 backdrop-blur border-t border-border">
        <div className="max-w-7xl mx-auto grid" style={{ gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))` }}>
          {navItems.map((it) => {
            const active = loc.pathname.startsWith(it.to);
            const Icon = it.icon;
            return (
              <Link key={it.to} to={it.to}
                className={`flex flex-col items-center justify-center py-3 gap-1 text-xs transition ${
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}>
                <Icon className="h-5 w-5" />
                <span className="font-medium">{it.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function FullScreenStatus({
  icon: Icon, title, message, onSignOut,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  message: string;
  onSignOut: () => void;
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
        <Button variant="outline" onClick={onSignOut}>Sign out</Button>
      </div>
    </div>
  );
}
