import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/lib/auth";
import { Toaster } from "@/components/ui/sonner";
import { SplashScreen } from "@/components/SplashScreen";
import { useState } from "react";

import LoginPage from "@/pages/LoginPage";
import AppLayout from "@/pages/AppLayout";
import RegisterPage from "@/pages/RegisterPage";
import ProductsPage from "@/pages/ProductsPage";
import WalletPage from "@/pages/WalletPage";
import CashiersPage from "@/pages/CashiersPage";
import AdminPage from "@/pages/AdminPage";

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
      {!splashDone && <SplashScreen onDone={() => setSplashDone(true)} />}
      <HashRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<AppLayout />}>
            <Route index element={<Navigate to="/register" replace />} />
            <Route path="register" element={<RegisterPage />} />
            <Route path="products" element={<ProductsPage />} />
            <Route path="wallet" element={<WalletPage />} />
            <Route path="cashiers" element={<CashiersPage />} />
            <Route path="admin" element={<AdminPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </HashRouter>
      <Toaster richColors position="top-center" />
    </AuthProvider>
  );
}
