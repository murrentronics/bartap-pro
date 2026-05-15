import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth";
import { Toaster } from "@/components/ui/sonner";
import { SplashScreen } from "@/components/SplashScreen";
import { useState, useEffect } from "react";

import LoginPage from "@/pages/LoginPage";
import AppLayout from "@/pages/AppLayout";
import RegisterPage from "@/pages/RegisterPage";
import ProductsPage from "@/pages/ProductsPage";
import WalletPage from "@/pages/WalletPage";
import CashiersPage from "@/pages/CashiersPage";
import AdminPage from "@/pages/AdminPage";

// Admin-only guard component
function AdminOnlyGuard({ children }: { children: React.ReactNode }) {
  const { profile, loading, signOut } = useAuth();

  useEffect(() => {
    if (!loading && profile && profile.role !== "admin") {
      // Force sign out non-admin users immediately
      signOut();
    }
  }, [profile, loading, signOut]);

  // Don't render anything for non-admin users
  if (!loading && profile && profile.role !== "admin") {
    return null;
  }

  return <>{children}</>;
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
      <AdminOnlyGuard>
        {!splashDone && <SplashScreen onDone={() => setSplashDone(true)} />}
        <HashRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<AppLayout />}>
              <Route index element={<Navigate to="/admin" replace />} />
              <Route path="admin" element={<AdminPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </HashRouter>
        <Toaster richColors position="top-center" />
      </AdminOnlyGuard>
    </AuthProvider>
  );
}
