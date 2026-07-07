import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/lib/auth";
import { I18nProvider } from "@/lib/i18n";
import { Toaster } from "@/components/ui/sonner";
import { SplashScreen } from "@/components/SplashScreen";
import { useState, useEffect } from "react";
import { useAppUpdate } from "@/lib/useAppUpdate";
import { UpdateBanner } from "@/components/UpdateBanner";

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
import { MusicPlayerProvider } from "@/lib/MusicPlayerContext";
import { YouTubeProvider } from "@/lib/YouTubeContext";

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
            <Route path="admin" element={<AdminPage />} />
            <Route path="admin/banking" element={<AdminBankingPage />} />
            <Route path="admin/billing" element={<AdminBillingManagementPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </HashRouter>

      {/* Update banner — shown on top of everything when a new APK is available */}
      {update && <UpdateBanner update={update} onDismiss={dismiss} />}

      <Toaster richColors position="top-center" />
    </>
  );
}

export default function App() {
  const [splashDone, setSplashDone] = useState(false);

  // Register service worker for PWA/Android install support
  if (typeof window !== "undefined" && "serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {/* ignore */});
    });
  }

  return (
    <AuthProvider>
      <I18nProvider>
      {!splashDone && <SplashScreen onDone={() => setSplashDone(true)} />}
      <MusicPlayerProvider>
        <YouTubeProvider>
          <AppWithUpdateCheck />
        </YouTubeProvider>
      </MusicPlayerProvider>
      </I18nProvider>
    </AuthProvider>
  );
}
