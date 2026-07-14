import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useChain } from "@/lib/ChainContext";
import { supabase } from "@/integrations/supabase/client";
import { useYouTube } from "@/lib/YouTubeContext";
import { usePushNotifications } from "@/lib/usePushNotifications";
import { useTranslation } from "@/lib/i18n";
import { Loader2, Wine, Package, Wallet, Users, ShieldAlert, Ban, UserMinus, Menu, X, CreditCard, Building2, DollarSign, UserCircle, Receipt, Gamepad2, RotateCcw, Globe, Tag, GitBranch, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppLayout() {
  const { session, profile, loading, signOut } = useAuth();
  const { isChainOwner, activeBarId, activeBar } = useChain();
  const nav = useNavigate();
  const loc = useLocation();
  const { t } = useTranslation();
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
    // Machines-only approved owner → land on /machines, not /register
    if (!loading && profile?.role === "owner" && profile.status === "approved" && profile.plan_type === "machines_only"
      && loc.pathname === "/register") {
      nav("/machines", { replace: true });
    }
    // Chain owner with no bar selected → force them to pick a bar first
    if (!loading && isChainOwner && !activeBarId && loc.pathname !== "/switch-bar" && loc.pathname !== "/create-bar") {
      nav("/switch-bar", { replace: true });
    }
  }, [loading, profile, loc.pathname, nav, isChainOwner, activeBarId]);

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

  // Register FCM push token for the owner's device — must be before any early returns (Rules of Hooks)
  usePushNotifications(profile?.role === "owner" ? profile.id : null);

  // ── In-app payout alert modal ─────────────────────────────────────────────
  const [payoutAlert, setPayoutAlert] = useState<{ title: string; body: string; machineName: string; barId?: string; navigate?: (to: string) => void } | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const { title, body, machineName, barId, navigate: navFn } = (e as CustomEvent).detail;
      setPayoutAlert({ title, body, machineName, barId, navigate: navFn });
      // Play alert sound using Web Audio API
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        // Three ascending beeps
        [0, 0.3, 0.6].forEach((delay) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.value = 880 + delay * 400;
          osc.type = "sine";
          gain.gain.setValueAtTime(0.6, ctx.currentTime + delay);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.25);
          osc.start(ctx.currentTime + delay);
          osc.stop(ctx.currentTime + delay + 0.3);
        });
      } catch { /* audio not available */ }
    };
    window.addEventListener("payoutAlert", handler);
    return () => window.removeEventListener("payoutAlert", handler);
  }, []);

  // ── Deep-link navigation from push notification tap (background / killed) ─
  useEffect(() => {
    const handler = (e: Event) => {
      const { path } = (e as CustomEvent).detail as { path: string };
      if (path) nav(path);
    };
    window.addEventListener("pushNotificationNavigate", handler);
    return () => window.removeEventListener("pushNotificationNavigate", handler);
  }, [nav]);

  // Load owner plan to decide whether to show Machines in nav — must be before early returns (Rules of Hooks)
  const [ownerHasMachines, setOwnerHasMachines] = useState(false);
  const [ownerHasBar, setOwnerHasBar] = useState(true); // false only for machines_only without bar_addon
  const [isMachinesOnlyUser, setIsMachinesOnlyUser] = useState(false);
  const [ownerEmail, setOwnerEmail] = useState("");
  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setOwnerEmail(user?.email ?? "");
      if (!profile?.id) return;
      const ownerId = isChainOwner && activeBarId
        ? activeBarId
        : profile.role === "cashier" ? profile.parent_id : profile.id;
      if (!ownerId) return;
      const { data } = await (supabase as any).from("profiles")
        .select("plan_type, machines_addon_active, bar_addon_active").eq("id", ownerId).single();
      const planType = data?.plan_type ?? "basic";
      const addonActive = data?.machines_addon_active ?? false;
      const barAddonActive = data?.bar_addon_active ?? false;
      const machinesOnly = planType === "machines_only";
      setIsMachinesOnlyUser(machinesOnly);
      setOwnerHasMachines(planType === "premium" || planType === "chain" || addonActive || machinesOnly || user?.email === "renard.sankersingh@gmail.com");
      setOwnerHasBar(!machinesOnly || barAddonActive || user?.email === "renard.sankersingh@gmail.com");
    };
    load();
  }, [profile?.id, isChainOwner, activeBarId]);

  // Realtime: re-check machines status when the active bar's profile updates
  // (e.g. after enabling machines from within the machines page)
  useEffect(() => {
    if (!isChainOwner || !activeBarId) return;
    const ch = supabase
      .channel(`applayout-bar-profile-${activeBarId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${activeBarId}` },
        async () => {
          const { data } = await (supabase as any)
            .from("profiles").select("machines_addon_active").eq("id", activeBarId).single();
          if (data) {
            setOwnerHasMachines((prev) => prev || !!data.machines_addon_active);
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [isChainOwner, activeBarId]);

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
          <div className="max-w-2xl lg:max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
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
                <div className="absolute right-0 top-10 w-44 rounded-2xl border border-border shadow-2xl overflow-hidden z-[9999]"
                  style={{ background: "var(--gradient-card)" }}>
                  <Link to="/billing" className="flex items-center gap-3 px-4 py-4 text-sm font-bold transition border-b border-border/50 text-primary">
                    <CreditCard className="h-5 w-5 shrink-0" /> {t("billing", "Billing")}
                  </Link>
                  <button onClick={async () => { try { await signOut(); } catch { /* ignore */ } nav("/login"); }}
                    className="w-full flex items-center gap-3 px-4 py-4 text-sm font-bold text-destructive hover:bg-muted/50 transition">
                    <X className="h-5 w-5 shrink-0" /> {t("logout", "Logout")}
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="max-w-2xl lg:max-w-4xl mx-auto px-3 py-3">
          <div className="flex items-center justify-center min-h-[calc(100vh-8rem)]">
            <div className="max-w-md text-center space-y-6">
              <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-yellow-500/20 border border-yellow-500/40">
                <ShieldAlert className="h-10 w-10 text-yellow-500" />
              </div>
              <h1 className="text-3xl font-black">{t("awaiting_approval", "Account Pending")}</h1>
              <p className="text-muted-foreground">{t("account_pending_msg", "Your account is awaiting admin approval. Please complete your billing setup to activate your account.")}</p>
              <Button onClick={() => nav("/billing")} size="lg">{t("go_to_billing", "Go to Billing")}</Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const navItems = isAdmin
    ? [
        { to: "/admin",          label: "Users",   icon: Users },
        { to: "/admin/billing",  label: t("billing", "Billing"), icon: DollarSign },
        { to: "/admin/banking",  label: "Banking", icon: Building2 },
      ]
    : isMachinesOnlyUser ? [
        // Machines-only plan: Machines first, then Cashiers, Billing, Profile only
        { to: "/machines", label: t("machines", "Machines"), icon: Gamepad2 },
        ...(isOwner ? [{ to: "/cashiers", label: t("cashiers", "Cashiers"), icon: Users }] : []),
        ...(isOwner ? [{ to: "/billing",  label: t("billing", "Billing"),   icon: CreditCard }] : []),
        ...(isOwner ? [{ to: "/profile",  label: t("profile", "Profile"),   icon: UserCircle }] : []),
      ]
    : [
        ...(ownerHasBar ? [{ to: "/register", label: t("bar", "Bar"), icon: Wine }] : []),
        ...(ownerHasBar ? [{ to: "/credit",   label: t("credit", "Credit"), icon: Receipt }] : []),
        ...(ownerHasMachines ? [{ to: "/machines", label: t("machines", "Machines"), icon: Gamepad2 }] : []),
        ...(isOwner && ownerHasBar ? [{ to: "/products", label: t("products_title", "Items"),    icon: Package  }] : []),
        ...(isOwner && ownerHasBar ? [{ to: "/specials", label: t("specials", "Specials"), icon: Tag }] : []),
        ...(isOwner ? [{ to: "/cashiers", label: t("cashiers", "Cashiers"), icon: Users }] : []),
        { to: "/wallet",   label: t("wallet", "Wallet"),     icon: Wallet },
        ...(isOwner ? [{ to: "/summary",  label: "Summary",              icon: BarChart3 }] : []),
        ...(isOwner ? [{ to: "/billing",  label: t("billing", "Billing"), icon: CreditCard }] : []),
        ...(isOwner ? [{ to: "/profile",  label: t("profile", "Profile"), icon: UserCircle }] : []),
      ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", overflow: "hidden", position: "fixed", inset: 0 }}>
      <header
        className="shrink-0 z-50 bg-background/90 backdrop-blur border-b border-border"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <div className="max-w-2xl lg:max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">

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
            {isOnMusic ? t("bar", "Bar") : t("music", "Music")}
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
              {t("menu", "Menu")}
            </button>

            {/* ── CASHIER MENU — full-width big-button grid + brown backdrop ── */}
            {/* menus rendered below at root level */}
          </div>
        </div>
      </header>

      {/* ── CASHIER MENU — at root level, always above page content ── */}
      {menuOpen && isCashier && (
        <>
          <div className="fixed inset-x-0 mx-auto max-w-2xl lg:max-w-4xl rounded-b-2xl border border-border shadow-2xl z-[9999] overflow-y-auto"
            style={{ top: "calc(56px + env(safe-area-inset-top, 0px))", bottom: 0, background: "var(--gradient-card)", scrollbarWidth: "none" }}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-4 border-b border-border/50">
              <span className="text-sm font-black text-foreground">{profile.username}</span>
            </div>
            <div className="p-4 pb-[30vh]">
              <div className="grid grid-cols-3 gap-3">
                {navItems.map((it) => {
                  const active = loc.pathname.startsWith(it.to);
                  const Icon = it.icon;
                  return (
                    <button key={it.to} onClick={() => { setMenuOpen(false); nav(it.to); }}
                      className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 py-4 px-2 active:scale-95 transition-transform select-none"
                      style={{ background: active ? "var(--gradient-hero)" : "var(--gradient-card)", borderColor: active ? "var(--primary)" : "var(--border)", boxShadow: active ? "0 6px 18px rgba(251,146,60,0.35)" : "0 2px 8px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.06)" }}>
                      <div className="h-12 w-12 rounded-xl flex items-center justify-center shrink-0"
                        style={{ background: active ? "rgba(255,255,255,0.20)" : "rgba(255,255,255,0.06)", boxShadow: "inset 0 2px 4px rgba(0,0,0,0.25)" }}>
                        <Icon className={`h-6 w-6 ${active ? "text-white" : "text-primary"}`} />
                      </div>
                      <span className={`text-xs font-black text-center leading-tight ${active ? "text-white" : "text-foreground"}`}>{it.label}</span>
                    </button>
                  );
                })}
                <button onClick={() => { setMenuOpen(false); nav("/language"); }}
                  className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 py-4 px-2 active:scale-95 transition-transform select-none"
                  style={{ background: loc.pathname === "/language" ? "var(--gradient-hero)" : "var(--gradient-card)", borderColor: loc.pathname === "/language" ? "var(--primary)" : "var(--border)", boxShadow: loc.pathname === "/language" ? "0 6px 18px rgba(251,146,60,0.35)" : "0 2px 8px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.06)" }}>
                  <div className="h-12 w-12 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: loc.pathname === "/language" ? "rgba(255,255,255,0.20)" : "rgba(255,255,255,0.06)", boxShadow: "inset 0 2px 4px rgba(0,0,0,0.25)" }}>
                    <Globe className={`h-6 w-6 ${loc.pathname === "/language" ? "text-white" : "text-primary"}`} />
                  </div>
                  <span className={`text-xs font-black text-center leading-tight ${loc.pathname === "/language" ? "text-white" : "text-foreground"}`}>{t("language", "Language")}</span>
                </button>
                <button onClick={async () => { try { await signOut(); } catch { /* ignore */ } nav("/login"); }}
                  className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-destructive/40 py-4 px-2 active:scale-95 transition-transform select-none"
                  style={{ background: "rgba(239,68,68,0.08)", boxShadow: "0 2px 8px rgba(0,0,0,0.2)" }}>
                  <div className="h-12 w-12 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: "rgba(239,68,68,0.12)", boxShadow: "inset 0 2px 4px rgba(0,0,0,0.25)" }}>
                    <X className="h-6 w-6 text-destructive" />
                  </div>
                  <span className="text-xs font-black text-destructive text-center leading-tight">{t("logout", "Logout")}</span>
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── OWNER / ADMIN MENU — at root level, always above page content ── */}
      {menuOpen && !isCashier && (
        <>
          <div className="fixed inset-x-0 mx-auto max-w-2xl lg:max-w-4xl border border-border shadow-2xl z-[9999] overflow-y-auto"
            style={{ top: "calc(56px + env(safe-area-inset-top, 0px))", bottom: 0, background: "var(--gradient-card)", scrollbarWidth: "none" }}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-border/50">
              <span className="text-sm font-semibold text-muted-foreground truncate block">{profile.username}</span>
              {isChainOwner && activeBar && <span className="text-xs font-black text-primary truncate block mt-0.5">📍 {activeBar.bar_name}</span>}
              {isChainOwner && !activeBar && <span className="text-xs font-black text-amber-400 truncate block mt-0.5">⚠ No bar selected</span>}
            </div>
            <div className="p-4 pb-[30vh]">
              <div className="grid grid-cols-3 gap-3">
                {navItems.map((it) => {
                  const active = loc.pathname.startsWith(it.to);
                  const Icon = it.icon;
                  return (
                    <button key={it.to} onClick={() => { setMenuOpen(false); nav(it.to); }}
                      className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 py-4 px-2 active:scale-95 transition-transform select-none"
                      style={{ background: active ? "var(--gradient-hero)" : "var(--gradient-card)", borderColor: active ? "var(--primary)" : "var(--border)", boxShadow: active ? "0 6px 18px rgba(251,146,60,0.35)" : "0 2px 8px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.06)" }}>
                      <div className="h-12 w-12 rounded-xl flex items-center justify-center shrink-0"
                        style={{ background: active ? "rgba(255,255,255,0.20)" : "rgba(255,255,255,0.06)", boxShadow: "inset 0 2px 4px rgba(0,0,0,0.25)" }}>
                        <Icon className={`h-6 w-6 ${active ? "text-white" : "text-primary"}`} />
                      </div>
                      <span className={`text-xs font-black text-center leading-tight ${active ? "text-white" : "text-foreground"}`}>{it.label}</span>
                    </button>
                  );
                })}
                {!isAdmin && !isMachinesOnlyUser && (
                <button onClick={() => { setMenuOpen(false); nav("/language"); }}
                  className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 py-4 px-2 active:scale-95 transition-transform select-none"
                  style={{ background: loc.pathname === "/language" ? "var(--gradient-hero)" : "var(--gradient-card)", borderColor: loc.pathname === "/language" ? "var(--primary)" : "var(--border)", boxShadow: loc.pathname === "/language" ? "0 6px 18px rgba(251,146,60,0.35)" : "0 2px 8px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.06)" }}>
                  <div className="h-12 w-12 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: loc.pathname === "/language" ? "rgba(255,255,255,0.20)" : "rgba(255,255,255,0.06)", boxShadow: "inset 0 2px 4px rgba(0,0,0,0.25)" }}>
                    <Globe className={`h-6 w-6 ${loc.pathname === "/language" ? "text-white" : "text-primary"}`} />
                  </div>
                  <span className={`text-xs font-black text-center leading-tight ${loc.pathname === "/language" ? "text-white" : "text-foreground"}`}>{t("language", "Language")}</span>
                </button>
                )}
                {isChainOwner && (
                  <button onClick={() => { setMenuOpen(false); nav("/switch-bar"); }}
                    className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 py-4 px-2 active:scale-95 transition-transform select-none"
                    style={{ background: loc.pathname === "/switch-bar" ? "var(--gradient-hero)" : "var(--gradient-card)", borderColor: loc.pathname === "/switch-bar" ? "var(--primary)" : "var(--border)", boxShadow: loc.pathname === "/switch-bar" ? "0 6px 18px rgba(251,146,60,0.35)" : "0 2px 8px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.06)" }}>
                    <div className="h-12 w-12 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: loc.pathname === "/switch-bar" ? "rgba(255,255,255,0.20)" : "rgba(255,255,255,0.06)", boxShadow: "inset 0 2px 4px rgba(0,0,0,0.25)" }}>
                      <GitBranch className={`h-6 w-6 ${loc.pathname === "/switch-bar" ? "text-white" : "text-primary"}`} />
                    </div>
                    <span className={`text-xs font-black text-center leading-tight ${loc.pathname === "/switch-bar" ? "text-white" : "text-foreground"}`}>{t("switch_bar", "Switch Bar")}</span>
                  </button>
                )}
                {isOwner && (
                  <button onClick={() => { setMenuOpen(false); nav("/factory-reset"); }}
                    className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 py-4 px-2 active:scale-95 transition-transform select-none"
                    style={{ background: loc.pathname === "/factory-reset" ? "var(--gradient-hero)" : "var(--gradient-card)", borderColor: loc.pathname === "/factory-reset" ? "var(--primary)" : "var(--border)", boxShadow: "0 2px 8px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.06)" }}>
                    <div className="h-12 w-12 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: "rgba(255,255,255,0.06)", boxShadow: "inset 0 2px 4px rgba(0,0,0,0.25)" }}>
                      <RotateCcw className="h-6 w-6 text-primary" />
                    </div>
                    <span className="text-xs font-black text-center leading-tight text-foreground">{t("factory_reset", "Factory Reset")}</span>
                  </button>
                )}
                <button onClick={async () => { try { await signOut(); } catch { /* ignore */ } nav("/login"); }}
                  className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-destructive/40 py-4 px-2 active:scale-95 transition-transform select-none"
                  style={{ background: "rgba(239,68,68,0.08)", boxShadow: "0 2px 8px rgba(0,0,0,0.2)" }}>
                  <div className="h-12 w-12 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: "rgba(239,68,68,0.12)", boxShadow: "inset 0 2px 4px rgba(0,0,0,0.25)" }}>
                    <X className="h-6 w-6 text-destructive" />
                  </div>
                  <span className="text-xs font-black text-destructive text-center leading-tight">{t("logout", "Logout")}</span>
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      <main className="max-w-2xl lg:max-w-4xl mx-auto w-full px-3 overflow-y-auto flex-1 scrollbar-none" style={{ overscrollBehavior: "none", WebkitOverflowScrolling: "auto", scrollbarWidth: "none", msOverflowStyle: "none" }}>
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
            top: "calc(56px + env(safe-area-inset-top, 0px))",
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

      {/* ── In-app payout alert modal ── */}
      {payoutAlert && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm"
          onClick={() => setPayoutAlert(null)}>
          <div
            className="w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl border-2 border-amber-500/60"
            style={{ background: "oklch(0.15 0.04 45)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Orange flash header */}
            <div className="px-6 pt-6 pb-4 text-center"
              style={{ background: "linear-gradient(135deg, #c0441a, #f0a030)" }}>
              <div className="text-5xl mb-2">⚠️</div>
              <h2 className="font-black text-white text-xl leading-tight">Payout Alert</h2>
              <p className="text-white/90 font-bold text-base mt-1">{payoutAlert.machineName}</p>
            </div>

            {/* Body */}
            <div className="px-6 py-5 text-center space-y-5">
              <p className="text-amber-200 font-semibold text-sm leading-relaxed">
                {payoutAlert.body}
              </p>
              <div className="flex flex-col gap-2">
                {/* Go to machine history tab */}
                <button
                  onClick={() => {
                    setPayoutAlert(null);
                    localStorage.setItem("payout_alert_open_machine", payoutAlert.machineName);
                    localStorage.setItem("payout_alert_open_tab", "history");
                    if (payoutAlert.barId) localStorage.setItem("payout_alert_open_bar", payoutAlert.barId);
                    nav("/machines");
                  }}
                  className="w-full h-12 rounded-2xl font-black text-sm text-white active:scale-95 transition"
                  style={{ background: "linear-gradient(135deg, #c0441a, #f0a030)" }}
                >
                  View History →
                </button>
                <button
                  onClick={() => setPayoutAlert(null)}
                  className="w-full h-11 rounded-2xl font-black text-sm border border-white/20 text-white/60 active:scale-95 transition"
                  style={{ background: "rgba(255,255,255,0.06)" }}
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
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
