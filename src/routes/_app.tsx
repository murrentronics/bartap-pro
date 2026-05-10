import { createFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { Loader2, Wine, Package, Wallet, Users, LogOut } from "lucide-react";
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
  const navItems = [
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
