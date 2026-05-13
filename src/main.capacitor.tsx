// Client-only entry point for Capacitor/Android builds.
import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createRouter, createHashHistory } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/lib/auth";
import { Toaster } from "@/components/ui/sonner";
import { routeTree } from "./routeTree.gen";
import "./styles.css";

// Catch any unhandled errors and show them on screen so we can debug
window.onerror = (msg, src, line, col, err) => {
  document.body.style.cssText = "background:#000;color:#f00;padding:20px;font-size:14px;font-family:monospace;white-space:pre-wrap;overflow:auto;";
  document.body.innerHTML = "<b>APP ERROR</b>\n\n" + msg + "\n\nFile: " + src + "\nLine: " + line + "\n\n" + (err?.stack || "");
};
window.onunhandledrejection = (e) => {
  document.body.style.cssText = "background:#000;color:#f00;padding:20px;font-size:14px;font-family:monospace;white-space:pre-wrap;overflow:auto;";
  document.body.innerHTML = "<b>UNHANDLED PROMISE</b>\n\n" + (e.reason?.stack || e.reason || "unknown");
};

const hashHistory = createHashHistory();
const queryClient = new QueryClient();

const router = createRouter({
  routeTree,
  history: hashHistory,
  context: { queryClient },
});

declare module "@tanstack/react-router" {
  interface Register { router: typeof router; }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
        <Toaster richColors position="top-center" />
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
