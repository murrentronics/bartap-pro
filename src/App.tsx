import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/lib/auth";
import { I18nProvider } from "@/lib/i18n";
import { Toaster } from "@/components/ui/sonner";
import { SplashScreen } from "@/components/SplashScreen";
import { useState, useEffect } from "react";
import { useAppUpdate } from "@/lib/useAppUpdate";
import { UpdateBanner } from "@/components/UpdateBanner";
import { OfflineProvider, useOffline } from "@/lib/OfflineProvider";

import LoginPage from "@/pages/LoginPage";
import AppLayout from "@/pages/AppLayout";
import RegisterPage from "@/pages/RegisterPage";
import ProductsPage from "@/pages/ProductsPage";
import WalletPage from "@/pages/WalletPage";
import CashiersPage from "@/pages/CashiersPage";
import AdminPage from "@/pages/AdminPage";
import BillingPage from "@/pages/BillingPage";
import AdminBankingPage from "@/pages/AdminBankingPage";
import AdminBillingManagementPage from "@/pages/AdminBillingManagementPage";
import ProfilePage from "@/pages/ProfilePage";
import MusicPage from "@/pages/MusicPage";
import CreditPage from "@/pages/CreditPage";
import MachinesPage from "@/pages/MachinesPage";
import FactoryResetPage from "@/pages/FactoryResetPage";
import LanguagePage from "@/pages/LanguagePage";
import SpecialsPage from "@/pages/SpecialsPage";
import SwitchBarPage from "@/pages/SwitchBarPage";
import SummaryPage from "@/pages/SummaryPage";
import ManagerPage from "@/pages/ManagerPage";
import StockCheckPage from "@/pages/StockCheckPage";
import ManualPage from "@/pages/ManualPage";
import PrivacyPolicyPage from "@/pages/PrivacyPolicyPage";
import TermsPage from "@/pages/TermsPage";
import { MusicPlayerProvider } from "@/lib/MusicPlayerContext";
import { YouTubeProvider } from "@/lib/YouTubeContext";
import { ChainProvider } from "@/lib/ChainContext";

// ── Offline status banner ─────────────────────────────────────────────────────
const BANNER_H = 32; // px — matches py-2 + text-xs line height

function OfflineBanner() {
  const { isOnline, queueSize } = useOffline();
  const visible = !isOnline || queueSize > 0;

  // Push the rest of the layout down by setting a CSS variable on <html>
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--offline-banner-h",
      visible ? `${BANNER_H}px` : "0px"
    );
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[200] flex items-center justify-center gap-2 px-4 text-xs font-semibold select-none"
      style={{
        height: `${BANNER_H}px`,
        background: isOnline ? "rgba(22,163,74,0.92)" : "rgba(220,38,38,0.92)",
        backdropFilter: "blur(6px)",
        color: "#fff",
      }}
    >
      {isOnline ? (
        <>
          <span>✅ Back online</span>
          {queueSize > 0 && <span>— syncing {queueSize} pending {queueSize === 1 ? "record" : "records"}…</span>}
        </>
      ) : (
        <>
          <span>📴 No internet</span>
          {queueSize > 0 && (
            <span>— {queueSize} {queueSize === 1 ? "order" : "orders"} saved, will sync on reconnect</span>
          )}
          {queueSize === 0 && <span>— orders will be saved locally</span>}
        </>
      )}
    </div>
  );
}

function AppWithUpdateCheck() {
  const { update, dismiss } = useAppUpdate();

  return (
    <>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<AppLayout />}>
            <Route index element={<Navigate to="/register" replace />} />
            <Route path="register" element={<RegisterPage />} />
            <Route path="products" element={<ProductsPage />} />
            <Route path="wallet" element={<WalletPage />} />
            <Route path="cashiers" element={<CashiersPage />} />
            <Route path="billing" element={<BillingPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="music" element={<MusicPage />} />
            <Route path="credit" element={<CreditPage />} />
            <Route path="machines" element={<MachinesPage />} />
            <Route path="factory-reset" element={<FactoryResetPage />} />
            <Route path="language" element={<LanguagePage />} />
            <Route path="specials" element={<SpecialsPage />} />
            <Route path="switch-bar" element={<SwitchBarPage />} />
            <Route path="summary" element={<SummaryPage />} />
            <Route path="manager" element={<ManagerPage />} />
            <Route path="stock-check" element={<StockCheckPage />} />
            <Route path="manual" element={<ManualPage />} />
            <Route path="admin" element={<AdminPage />} />
            <Route path="admin/banking" element={<AdminBankingPage />} />
            <Route path="admin/billing" element={<AdminBillingManagementPage />} />
            <Route path="privacy" element={<PrivacyPolicyPage />} />
            <Route path="terms" element={<TermsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </HashRouter>

      {/* Offline status banner — sits above everything */}
      <OfflineBanner />

      {/* Update banner — shown on top of everything when a new APK is available */}
      {update && <UpdateBanner update={update} onDismiss={dismiss} />}

      <Toaster richColors position="top-center" />
    </>
  );
}

export default function App() {
  const [splashDone, setSplashDone] = useState(false);

  // Register service worker for PWA/Android install support + offline caching
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").then((reg) => {
      // Once the SW is active and controlling the page, warm the JS/CSS assets
      const warm = () => {
        const ctrl = navigator.serviceWorker.controller;
        if (!ctrl) return;
        const assetUrls: string[] = [];
        document.querySelectorAll<HTMLScriptElement>("script[src]").forEach((s) => {
          if (s.src.includes("/assets/")) assetUrls.push(s.src);
        });
        document.querySelectorAll<HTMLLinkElement>("link[rel=stylesheet][href]").forEach((l) => {
          if (l.href.includes("/assets/")) assetUrls.push(l.href);
        });
        if (assetUrls.length > 0) ctrl.postMessage({ type: "CACHE_ASSETS", urls: assetUrls });
      };
      if (navigator.serviceWorker.controller) {
        warm();
      } else {
        navigator.serviceWorker.addEventListener("controllerchange", warm, { once: true });
      }
      return reg;
    }).catch(() => {/* ignore */});
  }, []);

  return (
    <AuthProvider>
      <I18nProvider>
        <OfflineProvider>
          {!splashDone && <SplashScreen onDone={() => setSplashDone(true)} />}
          <ChainProvider>
            <MusicPlayerProvider>
              <YouTubeProvider>
                <AppWithUpdateCheck />
              </YouTubeProvider>
            </MusicPlayerProvider>
          </ChainProvider>
        </OfflineProvider>
      </I18nProvider>
    </AuthProvider>
  );
}
