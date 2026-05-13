import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth, usernameToEmail } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Wine } from "lucide-react";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { session, profile, loading } = useAuth();
  const nav = useNavigate();
  useEffect(() => {
    if (!loading && session && profile) {
      nav({ to: profile.role === "admin" ? "/admin" : "/register" });
    }
  }, [session, profile, loading, nav]);

  return (
    <div className="min-h-screen flex items-center justify-center px-3 py-8"
      style={{ background: "radial-gradient(circle at 20% 0%, oklch(0.3 0.05 60) 0%, oklch(0.15 0.02 60) 60%)" }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl mb-4"
            style={{ background: "var(--gradient-hero)", boxShadow: "var(--shadow-glow)" }}>
            <Wine className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="text-4xl font-black tracking-tight">Bartendaz Pro</h1>
          <p className="text-muted-foreground mt-1">Bar POS & Wallet</p>
        </div>

        <Tabs defaultValue="signin" className="w-full">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="signin">Sign in</TabsTrigger>
            <TabsTrigger value="signup">Owner sign up</TabsTrigger>
          </TabsList>
          <TabsContent value="signin"><SignInForm /></TabsContent>
          <TabsContent value="signup"><SignUpForm /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function SignInForm() {
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const email = id.includes("@") ? id.trim() : usernameToEmail(id);
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success("Welcome back");
  };
  return (
    <form onSubmit={submit} className="mt-6 space-y-4 rounded-2xl p-6"
      style={{ background: "var(--gradient-card)", boxShadow: "var(--shadow-elegant)" }}>
      <div>
        <Label htmlFor="signin-id">Email or Cashier Username</Label>
        <Input id="signin-id" name="username" autoComplete="username" value={id} onChange={(e) => setId(e.target.value)} placeholder="owner@bar.com or cashier1" required />
      </div>
      <div>
        <Label htmlFor="signin-pw">Password</Label>
        <Input id="signin-pw" name="password" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} required />
      </div>
      <Button type="submit" className="w-full h-12 text-base font-bold" disabled={busy}>
        {busy ? "Signing in..." : "Sign in"}
      </Button>
    </form>
  );
}

function SignUpForm() {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email: email.trim(), password: pw,
      options: { data: { username: username.trim(), role: "owner" }, emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success("Account created — signing you in");
  };
  return (
    <form onSubmit={submit} className="mt-6 space-y-4 rounded-2xl p-6"
      style={{ background: "var(--gradient-card)", boxShadow: "var(--shadow-elegant)" }}>
      <div>
        <Label htmlFor="signup-username">Bar / Owner Username</Label>
        <Input id="signup-username" name="username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required minLength={3} />
      </div>
      <div>
        <Label htmlFor="signup-email">Email</Label>
        <Input id="signup-email" name="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div>
        <Label htmlFor="signup-pw">Password</Label>
        <Input id="signup-pw" name="password" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={6} />
      </div>
      <Button type="submit" className="w-full h-12 text-base font-bold" disabled={busy}>
        {busy ? "Creating..." : "Create owner account"}
      </Button>
    </form>
  );
}
