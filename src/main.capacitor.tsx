// Capacitor/Android entry point
import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createRouter, createHashHistory } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/lib/auth";
import { Toaster } from "@/components/ui/sonner";
import { routeTree } from "./routeTree.gen";
import "./styles.css";

const hashHistory = createHashHistory();
const queryClient = new QueryClient();

const router = createRouter({
  routeTree,
  history: hashHistory,
  context: { queryClient },
  defaultPreloadStaleTime: 0,
  defaultPreload: false,
  defaultViewTransition: false,
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
