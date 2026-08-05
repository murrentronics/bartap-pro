import { createFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { Loader2, Wine, Package, Wallet, Users, ShieldAlert, Ban, UserMinus, Menu, X, Receipt, Gamepad2, TrendingDown, ClipboardList } from "lucide-react";
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

  // ── Open Bar modal ─────────────────────────────────────────────────────────
  const [showOpenBarModal, setShowOpenBarModal] = useState(false);
  const [openBarFloat, setOpenBarFloat] = useState("");
  const [openMachineFloat, setOpenMachineFloat] = useState("");
  const [hasMachines, setHasMachines] = useState(false);
  const [isMachinesAccount, setIsMachinesAccount] = useState(false);
  const [showCloseBarConfirm, setShowCloseBarConfirm] = useState(false);
  const [activeOpenBarField, setActiveOpenBarField] = useState<"bar" | "machine" | null>(null);

  const handleOpenBarNumpad = (field: "bar" | "machine", k: string) => {
    const current = field === "bar" ? openBarFloat : openMachineFloat;
    const setter  = field === "bar" ? setOpenBarFloat : setOpenMachineFloat;
    if (k === "⌫") { setter(current.slice(0, -1)); return; }
    setter(current === "0" || current === "" ? k : current + k);
  };

  useEffect(() => {
    if (!loading && !session) nav({ to: "/login" });
  }, [session, loading, nav]);

  useEffect(() => {
    if (!loading && session && !profile) {
      // Give profile a moment to load before signing out — avoids false logout on slow connections
      const t = setTimeout(() => {
        signOut().then(() => nav({ to: "/login" }));
      }, 3000);
      return () => clearTimeout(t);
    }
  }, [loading, session, profile]);

  useEffect(() => {
    if (!loading && profile?.role === "admin" && !loc.pathname.startsWith("/admin")) {
      nav({ to: "/admin" as "/" });
    }
  }, [loading, profile, loc.pathname, nav]);

  useEffect(() => {
    const isMgr = profile?.role === "manager" || (profile as any)?.job_title === "manager";
    const isMachinesOnly = (profile as any)?.is_machines_account || profile?.plan_type === "machines_only";
    if (!loading && isMgr && loc.pathname === "/register") {
      nav({ to: "/products" as "/" });
    } else if (!loading && isMachinesOnly && loc.pathname === "/register") {
      nav({ to: "/machines" as "/" });
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

  // Load bar session state for owner/manager toggle
  useEffect(() => {
    if (!profile || (profile.role !== "owner" && !(profile.role === "manager" || (profile as any).job_title === "manager"))) return;
    // Managers operate on the owner's profile row (parent_id), not their own
    const isManagerProfile = profile.role === "manager" || (profile as any).job_title === "manager";
    const barOwnerId = effectiveOwnerId(isManagerProfile ? (profile.parent_id ?? profile.id) : profile.id);
    if (!barOwnerId) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from("profiles")
      .select("bar_session_start, bar_closed_at")
      .eq("id", barOwnerId)
      .single()
      .then(({ data }: { data: { bar_session_start: string | null; bar_closed_at: string | null } | null }) => {
        setBarSessionStart(data?.bar_session_start ?? null);
        setBarClosedAt(data?.bar_closed_at ?? null);
      });
    const ch = supabase
      .channel(`bar-session-layout-${barOwnerId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${barOwnerId}` },
        (payload) => {
          const rec = payload.new as Record<string, unknown>;
          if ("bar_session_start" in rec) setBarSessionStart((rec.bar_session_start as string | null) ?? null);
          if ("bar_closed_at"     in rec) setBarClosedAt((rec.bar_closed_at as string | null) ?? null);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  // Use stable primitives (not the whole profile object) so the channel isn't
  // torn down and recreated every time auth.tsx merges a realtime profile update.
  }, [profile?.id, profile?.parent_id, profile?.role]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleOpenBar = async () => {
    if (!profile || (profile.role !== "owner" && !(profile.role === "manager" || (profile as any).job_title === "manager"))) return;
    const isManagerProfile = profile.role === "manager" || (profile as any).job_title === "manager";
    const ownerId = effectiveOwnerId(isManagerProfile ? (profile.parent_id ?? profile.id) : profile.id);
    // Fetch owner's full plan info to determine which float fields to show
    const { data: ownerProfile } = await (supabase as any)
      .from("profiles").select("machines_addon_active, plan_type, is_machines_account, bar_addon_active").eq("id", ownerId).single();

    const planType: string = ownerProfile?.plan_type ?? "";
    const isMachinesOnlyPlan = planType === "machines_only" || !!(ownerProfile?.is_machines_account);
    const hasBarAddon        = !!(ownerProfile?.bar_addon_active);
    const hasMachinesAddon   = !!(ownerProfile?.machines_addon_active) || planType === "premium" || planType === "chain" || isMachinesOnlyPlan;

    // machines-only owner without bar add-on → machines float only, no bar float
    // machines-only owner with bar add-on    → both floats
    // bar-only owner                         → bar float only
    // bar + machines owner                   → both floats
    const showBarFloat     = !isMachinesOnlyPlan || hasBarAddon;
    const showMachineFloat = hasMachinesAddon;

    setHasMachines(showMachineFloat);
    setIsMachinesAccount(!showBarFloat); // reuse this flag: true = skip bar float
    setOpenBarFloat("");
    setOpenMachineFloat("");
    setActiveOpenBarField(null);
    setShowOpenBarModal(true);
  };

  const confirmOpenBar = async () => {
    if (!profile || (profile.role !== "owner" && !(profile.role === "manager" || (profile as any).job_title === "manager"))) return;
    const isManagerProfile = profile.role === "manager" || (profile as any).job_title === "manager";
    const ownerId = effectiveOwnerId(isManagerProfile ? (profile.parent_id ?? profile.id) : profile.id);
    const barFloatVal = isMachinesAccount ? 0 : parseInt(openBarFloat, 10);
    if (!isMachinesAccount && (isNaN(barFloatVal) || barFloatVal < 0)) { toast.error("Enter a valid bar float amount"); return; }
    if (hasMachines) {
      const machineFloatVal = parseInt(openMachineFloat, 10);
      if (isNaN(machineFloatVal) || machineFloatVal < 0) { toast.error("Enter a valid machine float amount"); return; }
    }
    setBarToggleBusy(true);
    setShowOpenBarModal(false);

    // Guard: do not create a new session if one is already open
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingOpen } = await (supabase as any).from("bar_sessions")
      .select("id").eq("owner_id", ownerId).is("closed_at", null).limit(1).maybeSingle();
    if (existingOpen) {
      setBarToggleBusy(false);
      toast.error("Bar is already open — close the current session first");
      return;
    }

    const now = new Date().toISOString();
    // 1. Update profiles: set bar_session_start, clear bar_closed_at, set cashier float
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("profiles")
      .update({ bar_session_start: now, bar_closed_at: null, cashier_float: barFloatVal, cashier_float_set_at: now })
      .eq("id", ownerId);
    if (error) { setBarToggleBusy(false); toast.error("Failed to open bar"); return; }

    // 2. Insert bar_sessions row
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: newSession } = await (supabase as any).from("bar_sessions")
      .insert({ owner_id: ownerId, opened_at: now })
      .select("id").single();

    // 3. Insert first sub-session for this bar open
    if (newSession?.id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("bar_sub_sessions").insert({
        owner_id: ownerId,
        bar_session_id: newSession.id,
        opened_at: now,
        cashier_float: barFloatVal,
      });
    }

    // 4. Set machine float if machines enabled
    if (hasMachines) {
      const machineFloatVal = parseFloat(openMachineFloat) || 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("machine_float_sessions").insert({
        owner_id: ownerId, amount: machineFloatVal, set_at: now,
      });
    }

    setBarToggleBusy(false);
    setBarSessionStart(now);
    setBarClosedAt(null);
    toast.success("🟢 Bar opened");
  };

  const handleCloseBar = async () => {
    if (!profile || (profile.role !== "owner" && !(profile.role === "manager" || (profile as any).job_title === "manager"))) return;
    const isManagerProfile = profile.role === "manager" || (profile as any).job_title === "manager";
    const ownerId = effectiveOwnerId(isManagerProfile ? (profile.parent_id ?? profile.id) : profile.id);
    setBarToggleBusy(true);
    const now = new Date().toISOString();
    // 1. Close any open sub-sessions for this owner
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("bar_sub_sessions")
      .update({ closed_at: now })
      .eq("owner_id", ownerId)
      .is("closed_at", null);
    // 2. Close the open bar_sessions row
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("bar_sessions")
      .update({ closed_at: now })
      .eq("owner_id", ownerId)
      .is("closed_at", null);
    // 3. Stamp bar_closed_at on profiles
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("profiles").update({ bar_closed_at: now }).eq("id", ownerId);
    setBarToggleBusy(false);
    if (error) { toast.error("Failed to close bar"); return; }
    setBarClosedAt(now);
    toast.success("🔴 Bar closed");
  };

  const [managerHasMachinesNav, setManagerHasMachinesNav] = useState(false);

  useEffect(() => {
    const isMgr = profile?.role === "manager" || (profile as any)?.job_title === "manager";
    if (!profile || !isMgr) return;
    const ownerId = effectiveOwnerId(profile.parent_id ?? profile.id);
    if (!ownerId) return;
    (supabase as any).from("profiles")
      .select("machines_addon_active, plan_type")
      .eq("id", ownerId).single()
      .then(({ data }: any) => {
        setManagerHasMachinesNav(!!(data?.machines_addon_active) || data?.plan_type === "premium" || data?.plan_type === "chain");
      });
  }, [profile]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading || !session || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const isOwner   = profile.role === "owner";
  const isAdmin   = profile.role === "admin";
  const isManager = profile.role === "manager" || (profile as any).job_title === "manager";

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
        { to: "/products",     label: "Items",        icon: Package       },
        { to: "/stock-check",  label: "Stock Check",  icon: ClipboardList },
        { to: "/manager",      label: "Manage",       icon: TrendingDown  },
        ...(managerHasMachinesNav ? [{ to: "/machines", label: "Machines", icon: Gamepad2 }] : []),
      ]
    : [
        { to: "/register",    label: "Cashier",      icon: Wine          },
        { to: "/credit",      label: "Customers",    icon: Receipt       },
        { to: "/machines",    label: "Machines",     icon: Gamepad2      },
        ...(isOwner ? [{ to: "/products",    label: "Items",       icon: Package       }] : []),
        ...(isOwner ? [{ to: "/stock-check", label: "Stock Check", icon: ClipboardList }] : []),
        ...(isOwner ? [{ to: "/cashiers",    label: "Staff",       icon: Users         }] : []),
        { to: "/wallet",      label: "Wallet",       icon: Wallet        },
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
            {/* Bar open/close toggle — owner and manager, inline with username */}
            {(isOwner || isManager) && (
              <button
                type="button"
                disabled={barToggleBusy}
                onClick={barIsOpen ? () => setShowCloseBarConfirm(true) : handleOpenBar}
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

      {/* ── Close Bar Confirm Modal ────────────────────────────────────── */}
      {showCloseBarConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-border shadow-2xl overflow-hidden"
            style={{ background: "var(--gradient-card)" }}>
            <div className="px-6 pt-6 pb-2 text-center">
              <div className="h-14 w-14 rounded-full flex items-center justify-center mx-auto mb-3"
                style={{ background: "rgba(239,68,68,0.12)", border: "1.5px solid #f87171" }}>
                <span className="text-2xl">🔴</span>
              </div>
              <h2 className="font-black text-xl">Close Bar?</h2>
              <p className="text-sm text-muted-foreground mt-2">This will end the current session. Are you sure?</p>
            </div>
            <div className="px-6 pb-6 pt-4 flex gap-3">
              <button
                onClick={() => setShowCloseBarConfirm(false)}
                className="flex-1 h-12 rounded-2xl font-black text-sm border border-border hover:bg-muted/30 transition">
                Cancel
              </button>
              <button
                onClick={() => { setShowCloseBarConfirm(false); handleCloseBar(); }}
                disabled={barToggleBusy}
                className="flex-1 h-12 rounded-2xl font-black text-sm transition active:scale-95 disabled:opacity-50"
                style={{ background: "rgba(239,68,68,0.15)", border: "1.5px solid #f87171", color: "#f87171" }}>
                {barToggleBusy ? <Loader2 className="h-4 w-4 animate-spin inline" /> : "Close Bar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Open Bar Modal ─────────────────────────────────────────────── */}
      {showOpenBarModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-border shadow-2xl overflow-hidden"
            style={{ background: "var(--gradient-card)" }}>
            <div className="px-6 pt-6 pb-2 text-center">
              <div className="h-14 w-14 rounded-full flex items-center justify-center mx-auto mb-3"
                style={{ background: "rgba(134,239,172,0.12)", border: "1.5px solid #86efac" }}>
                <span className="text-2xl">🟢</span>
              </div>
              <h2 className="font-black text-xl">Open Bar</h2>
              <p className="text-xs text-muted-foreground mt-1">Set floats before starting the session</p>
            </div>

            <div className="px-6 pb-6 pt-4 space-y-4">
              {/* Bar Float — hidden for machines-only accounts */}
              {!isMachinesAccount && (
                <div className="space-y-1">
                  <label className="text-xs font-black text-muted-foreground uppercase tracking-wider">Bar Float</label>
                  <div
                    onClick={() => setActiveOpenBarField(activeOpenBarField === "bar" ? null : "bar")}
                    className="w-full h-11 rounded-xl border bg-background px-4 flex items-center cursor-pointer transition"
                    style={{ borderColor: activeOpenBarField === "bar" ? "var(--primary)" : "var(--border)" }}
                  >
                    <span className={`text-base font-black ${activeOpenBarField === "bar" ? "text-primary" : openBarFloat ? "text-foreground" : "text-muted-foreground"}`}>
                      {openBarFloat || "0"}
                    </span>
                  </div>
                </div>
              )}

              {/* Machine Float — only if machines enabled */}
              {hasMachines && (
                <div className="space-y-1">
                  <label className="text-xs font-black text-muted-foreground uppercase tracking-wider">Machine Float</label>
                  <div
                    onClick={() => setActiveOpenBarField(activeOpenBarField === "machine" ? null : "machine")}
                    className="w-full h-11 rounded-xl border bg-background px-4 flex items-center cursor-pointer transition"
                    style={{ borderColor: activeOpenBarField === "machine" ? "var(--primary)" : "var(--border)" }}
                  >
                    <span className={`text-base font-black ${activeOpenBarField === "machine" ? "text-primary" : openMachineFloat ? "text-foreground" : "text-muted-foreground"}`}>
                      {openMachineFloat || "0"}
                    </span>
                  </div>
                </div>
              )}

              {/* Inline numpad — integers only */}
              {activeOpenBarField !== null && (
                <div className="grid grid-cols-3 gap-1.5">
                  {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((k, i) => (
                    k === "" ? <div key={i} /> :
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleOpenBarNumpad(activeOpenBarField, k)}
                      className={`h-12 rounded-xl font-black text-lg transition active:scale-95 ${
                        k === "⌫"
                          ? "bg-destructive/20 text-destructive hover:bg-destructive/30"
                          : "bg-muted hover:bg-muted/70 text-foreground"
                      }`}
                    >{k}</button>
                  ))}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowOpenBarModal(false)}
                  className="flex-1 h-12 rounded-2xl font-black text-sm border border-border hover:bg-muted/30 transition">
                  Cancel
                </button>
                <button
                  onClick={confirmOpenBar}
                  disabled={(!isMachinesAccount && !openBarFloat) || (hasMachines && !openMachineFloat)}
                  className="flex-1 h-12 rounded-2xl font-black text-sm transition active:scale-95 disabled:opacity-50"
                  style={{ background: "rgba(134,239,172,0.15)", border: "1.5px solid #86efac", color: "#86efac" }}>
                  Open Bar
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
