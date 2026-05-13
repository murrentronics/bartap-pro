import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/lib/auth";
import { SplashScreen } from "@/components/SplashScreen";
import { useState } from "react";
import appCss from "../styles.css?url";

function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="text-center">
        <h1 className="text-6xl font-black text-primary">404</h1>
        <p className="mt-2 text-muted-foreground">Page not found</p>
        <Link to="/" className="mt-6 inline-block rounded-lg bg-primary px-5 py-2 font-semibold text-primary-foreground">
          Go home
        </Link>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      // Viewport: covers notch/safe areas, prevents zoom
      { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" },
      { title: "Bartendaz Pro — Bar POS & Wallet" },
      { name: "description", content: "Fast bar POS for owners and cashiers. Cash items, track wallet, manage staff." },
      { property: "og:title", content: "Bartendaz Pro — Bar POS & Wallet" },
      { name: "twitter:title", content: "Bartendaz Pro — Bar POS & Wallet" },
      { property: "og:description", content: "Fast bar POS for owners and cashiers. Cash items, track wallet, manage staff." },
      { name: "twitter:description", content: "Fast bar POS for owners and cashiers. Cash items, track wallet, manage staff." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/68fb9316-47d7-4abe-9d45-1e3f5a182351/id-preview-01dc6fae--5bfccddf-6cf7-4a91-9cbb-1edabd90b8ab.lovable.app-1778420278990.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/68fb9316-47d7-4abe-9d45-1e3f5a182351/id-preview-01dc6fae--5bfccddf-6cf7-4a91-9cbb-1edabd90b8ab.lovable.app-1778420278990.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
      // PWA / Android
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      // "black-translucent" lets content go under the status bar (notch area)
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Bartendaz" },
      { name: "theme-color", content: "#0a0a0a" },
      // Android Chrome — hide address bar when added to home screen
      { name: "application-name", content: "Bartendaz Pro" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.json" },
      { rel: "apple-touch-icon", href: "/icon-192.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFound,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const [splashDone, setSplashDone] = useState(false);

  // Register service worker for PWA/Android install support
  if (typeof window !== "undefined" && "serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {/* ignore */});
    });
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {!splashDone && <SplashScreen onDone={() => setSplashDone(true)} />}
        <Outlet />
        <Toaster richColors position="top-center" />
      </AuthProvider>
    </QueryClientProvider>
  );
}
