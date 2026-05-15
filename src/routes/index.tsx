import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/")({
  component: IndexRedirect,
});

function IndexRedirect() {
  const { session, loading } = useAuth();
  const nav = useNavigate();
  useEffect(() => {
    if (loading) return;
    // Admin-only web: always go to admin page
    nav({ to: session ? "/admin" : "/login", replace: true });
  }, [session, loading, nav]);
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}
