import { O as useRouter, r as reactExports, W as jsxRuntimeExports, a1 as Outlet } from "./server-trY-Z65E.js";
import { g as createLucideIcon, b as useAuth, h as useChain, d as useNavigate, s as supabase, i as LoaderCircle, W as Wine, X, R as Receipt, G as Gamepad2, j as Link, B as Button, t as toast } from "./router-CRsJpeT2.js";
import { C as ChartColumn } from "./chart-column-DDPQUYpj.js";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
function useLocation(opts) {
  const router = useRouter();
  {
    const location = router.stores.location.get();
    return location;
  }
}
const __iconNode$6 = [
  ["circle", { cx: "12", cy: "12", r: "10", key: "1mglay" }],
  ["path", { d: "M4.929 4.929 19.07 19.071", key: "196cmz" }]
];
const Ban = createLucideIcon("ban", __iconNode$6);
const __iconNode$5 = [
  ["path", { d: "M4 5h16", key: "1tepv9" }],
  ["path", { d: "M4 12h16", key: "1lakjw" }],
  ["path", { d: "M4 19h16", key: "1djgab" }]
];
const Menu = createLucideIcon("menu", __iconNode$5);
const __iconNode$4 = [
  [
    "path",
    {
      d: "M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z",
      key: "1a0edw"
    }
  ],
  ["path", { d: "M12 22V12", key: "d0xqtd" }],
  ["polyline", { points: "3.29 7 12 12 20.71 7", key: "ousv84" }],
  ["path", { d: "m7.5 4.27 9 5.15", key: "1c824w" }]
];
const Package = createLucideIcon("package", __iconNode$4);
const __iconNode$3 = [
  [
    "path",
    {
      d: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
      key: "oel41y"
    }
  ],
  ["path", { d: "M12 8v4", key: "1got3b" }],
  ["path", { d: "M12 16h.01", key: "1drbdi" }]
];
const ShieldAlert = createLucideIcon("shield-alert", __iconNode$3);
const __iconNode$2 = [
  ["path", { d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", key: "1yyitq" }],
  ["circle", { cx: "9", cy: "7", r: "4", key: "nufk8" }],
  ["line", { x1: "22", x2: "16", y1: "11", y2: "11", key: "1shjgl" }]
];
const UserMinus = createLucideIcon("user-minus", __iconNode$2);
const __iconNode$1 = [
  ["path", { d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", key: "1yyitq" }],
  ["path", { d: "M16 3.128a4 4 0 0 1 0 7.744", key: "16gr8j" }],
  ["path", { d: "M22 21v-2a4 4 0 0 0-3-3.87", key: "kshegd" }],
  ["circle", { cx: "9", cy: "7", r: "4", key: "nufk8" }]
];
const Users = createLucideIcon("users", __iconNode$1);
const __iconNode = [
  [
    "path",
    {
      d: "M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1",
      key: "18etb6"
    }
  ],
  ["path", { d: "M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4", key: "xoc0q4" }]
];
const Wallet = createLucideIcon("wallet", __iconNode);
function AppLayout() {
  const {
    session,
    profile,
    loading,
    signOut
  } = useAuth();
  const {
    effectiveOwnerId
  } = useChain();
  const nav = useNavigate();
  const loc = useLocation();
  const [menuOpen, setMenuOpen] = reactExports.useState(false);
  const menuRef = reactExports.useRef(null);
  const [barSessionStart, setBarSessionStart] = reactExports.useState(null);
  const [barClosedAt, setBarClosedAt] = reactExports.useState(null);
  const [barToggleBusy, setBarToggleBusy] = reactExports.useState(false);
  const barIsOpen = !!barSessionStart && !barClosedAt;
  reactExports.useEffect(() => {
    if (!loading && !session) nav({
      to: "/login"
    });
  }, [session, loading, nav]);
  reactExports.useEffect(() => {
    if (!loading && session && !profile) {
      signOut().then(() => nav({
        to: "/login"
      }));
    }
  }, [loading, session, profile]);
  reactExports.useEffect(() => {
    if (!loading && profile?.role === "admin" && !loc.pathname.startsWith("/admin")) {
      nav({
        to: "/admin"
      });
    }
  }, [loading, profile, loc.pathname, nav]);
  reactExports.useEffect(() => {
    if (!loading && profile?.role === "manager" && loc.pathname === "/register") {
      nav({
        to: "/manager"
      });
    }
  }, [loading, profile, loc.pathname, nav]);
  reactExports.useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  reactExports.useEffect(() => {
    setMenuOpen(false);
  }, [loc.pathname]);
  reactExports.useEffect(() => {
    if (!profile || profile.role !== "owner") return;
    const ownerId = effectiveOwnerId(profile.id);
    if (!ownerId) return;
    supabase.from("profiles").select("bar_session_start, bar_closed_at").eq("id", ownerId).single().then(({
      data
    }) => {
      setBarSessionStart(data?.bar_session_start ?? null);
      setBarClosedAt(data?.bar_closed_at ?? null);
    });
    const ch = supabase.channel(`bar-session-layout-${ownerId}`).on("postgres_changes", {
      event: "UPDATE",
      schema: "public",
      table: "profiles",
      filter: `id=eq.${ownerId}`
    }, (payload) => {
      const rec = payload.new;
      if ("bar_session_start" in rec) setBarSessionStart(rec.bar_session_start ?? null);
      if ("bar_closed_at" in rec) setBarClosedAt(rec.bar_closed_at ?? null);
    }).subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [profile]);
  const handleOpenBar = async () => {
    if (!profile || profile.role !== "owner") return;
    const ownerId = effectiveOwnerId(profile.id);
    setBarToggleBusy(true);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const {
      error
    } = await supabase.from("profiles").update({
      bar_session_start: now,
      bar_closed_at: null
    }).eq("id", ownerId);
    if (!error) {
      await supabase.from("bar_sessions").insert({
        owner_id: ownerId,
        opened_at: now
      });
    }
    setBarToggleBusy(false);
    if (error) {
      toast.error("Failed to open bar");
      return;
    }
    setBarSessionStart(now);
    setBarClosedAt(null);
    toast.success("🟢 Bar opened");
  };
  const handleCloseBar = async () => {
    if (!profile || profile.role !== "owner") return;
    const ownerId = effectiveOwnerId(profile.id);
    setBarToggleBusy(true);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const {
      data: ownerRow
    } = await supabase.from("profiles").select("bar_session_start").eq("id", ownerId).single();
    const sessionStart = ownerRow?.bar_session_start ?? null;
    if (sessionStart) {
      await supabase.from("bar_sessions").update({
        closed_at: now
      }).eq("owner_id", ownerId).is("closed_at", null);
    }
    const {
      error
    } = await supabase.from("profiles").update({
      bar_closed_at: now
    }).eq("id", ownerId);
    setBarToggleBusy(false);
    if (error) {
      toast.error("Failed to close bar");
      return;
    }
    setBarClosedAt(now);
    toast.success("🔴 Bar closed");
  };
  if (loading || !session || !profile) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex min-h-screen items-center justify-center", children: /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-8 w-8 animate-spin text-primary" }) });
  }
  const isOwner = profile.role === "owner";
  const isAdmin = profile.role === "admin";
  const isManager = profile.role === "manager";
  if (!isAdmin) {
    if (profile.status === "expelled") {
      return /* @__PURE__ */ jsxRuntimeExports.jsx(FullScreenStatus, { icon: UserMinus, title: "Account expelled", message: "Your account has been expelled. You no longer have access to Bartendaz Pro.", onSignOut: () => {
        signOut();
        nav({
          to: "/login"
        });
      } });
    }
    if (profile.status === "suspended") {
      if (loc.pathname === "/billing") return /* @__PURE__ */ jsxRuntimeExports.jsx(Outlet, {});
      return /* @__PURE__ */ jsxRuntimeExports.jsx(FullScreenStatus, { icon: Ban, title: "Account suspended", message: "Your subscription has expired or your account has been suspended. Please renew your subscription or contact admin.", onSignOut: () => {
        signOut();
        nav({
          to: "/login"
        });
      }, showBillingButton: () => nav({
        to: "/billing"
      }) });
    }
    if (profile.status === "pending") {
      return /* @__PURE__ */ jsxRuntimeExports.jsx(FullScreenStatus, { icon: ShieldAlert, title: "Awaiting approval", message: "Your owner account is pending admin approval. You'll get access once approved.", onSignOut: () => {
        signOut();
        nav({
          to: "/login"
        });
      } });
    }
  }
  const navItems = isAdmin ? [{
    to: "/admin",
    label: "Users",
    icon: Users
  }] : isManager ? [{
    to: "/products",
    label: "Items",
    icon: Package
  }, {
    to: "/manager",
    label: "Manager",
    icon: ChartColumn
  }] : [{
    to: "/register",
    label: "Cashier",
    icon: Wine
  }, {
    to: "/credit",
    label: "Customers",
    icon: Receipt
  }, {
    to: "/machines",
    label: "Machines",
    icon: Gamepad2
  }, ...isOwner ? [{
    to: "/products",
    label: "Items",
    icon: Package
  }] : [], ...isOwner ? [{
    to: "/cashiers",
    label: "Staff",
    icon: Users
  }] : [], {
    to: "/wallet",
    label: "Wallet",
    icon: Wallet
  }];
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-h-screen", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("header", { className: "bg-background/90 backdrop-blur border-b border-border relative z-50", style: {
      paddingTop: "env(safe-area-inset-top, 0px)"
    }, children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "max-w-2xl mx-auto px-3 h-11 flex items-center justify-between", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-7 w-7 rounded-lg flex items-center justify-center shrink-0", style: {
          background: "var(--gradient-hero)"
        }, children: /* @__PURE__ */ jsxRuntimeExports.jsx(Wine, { className: "h-3.5 w-3.5 text-primary-foreground" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-black tracking-tight text-sm", children: "Bartendaz Pro" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", ref: menuRef, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-semibold text-muted-foreground truncate max-w-[100px]", children: profile.username }),
        isOwner && /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { type: "button", disabled: barToggleBusy, onClick: barIsOpen ? handleCloseBar : handleOpenBar, className: "h-7 px-2.5 rounded-lg font-black text-[11px] flex items-center gap-1 transition active:scale-95 disabled:opacity-50 shrink-0", style: barIsOpen ? {
          background: "rgba(134,239,172,0.12)",
          border: "1px solid #86efac",
          color: "#86efac"
        } : {
          background: "rgba(239,68,68,0.12)",
          border: "1px solid #f87171",
          color: "#f87171"
        }, children: [
          barToggleBusy ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-3 w-3 animate-spin" }) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px]", children: barIsOpen ? "🟢" : "🔴" }),
          barIsOpen ? "Open" : "Closed"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { onClick: () => setMenuOpen((o) => !o), className: "flex items-center gap-1.5 px-3 h-8 rounded-lg font-bold text-xs transition text-primary-foreground", style: {
          background: "var(--gradient-hero)"
        }, children: [
          menuOpen ? /* @__PURE__ */ jsxRuntimeExports.jsx(X, { className: "h-4 w-4" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(Menu, { className: "h-4 w-4" }),
          "Menu"
        ] }),
        menuOpen && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "absolute right-0 top-10 w-44 rounded-2xl border border-border shadow-2xl overflow-hidden z-[100]", style: {
          background: "var(--gradient-card)"
        }, children: [
          navItems.map((it) => {
            const active = loc.pathname.startsWith(it.to);
            const Icon = it.icon;
            return /* @__PURE__ */ jsxRuntimeExports.jsxs(Link, { to: it.to, className: `flex items-center gap-3 px-4 py-4 text-sm font-bold transition border-b border-border/50 last:border-0 ${active ? "text-primary" : "text-foreground hover:bg-muted/50"}`, children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Icon, { className: "h-5 w-5 shrink-0" }),
              it.label
            ] }, it.to);
          }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { onClick: () => {
            signOut();
            nav({
              to: "/login"
            });
          }, className: "w-full flex items-center gap-3 px-4 py-4 text-sm font-bold text-destructive hover:bg-muted/50 transition", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(X, { className: "h-5 w-5 shrink-0" }),
            "Logout / Salir"
          ] })
        ] })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("main", { className: "max-w-2xl mx-auto px-3 py-3", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Outlet, {}) })
  ] });
}
function FullScreenStatus({
  icon: Icon,
  title,
  message,
  onSignOut,
  showBillingButton
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center px-6", style: {
    background: "radial-gradient(circle at 50% 0%, oklch(0.25 0.05 30) 0%, oklch(0.12 0.02 30) 70%)"
  }, children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "max-w-md text-center space-y-6", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "inline-flex h-20 w-20 items-center justify-center rounded-full bg-destructive/20 border border-destructive/40", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Icon, { className: "h-10 w-10 text-destructive" }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-3xl font-black", children: title }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-muted-foreground", children: message }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-3 justify-center", children: [
      showBillingButton && /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { onClick: showBillingButton, children: "Go to Billing" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "outline", onClick: onSignOut, children: "Sign out" })
    ] })
  ] }) });
}
export {
  AppLayout as component
};
