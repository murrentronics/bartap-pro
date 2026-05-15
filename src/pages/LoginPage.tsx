import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, usernameToEmail } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Wine } from "lucide-react";

export default function LoginPage() {
  const { session, profile, loading } = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    if (!loading && session && profile) {
      nav(profile.role === "admin" ? "/admin" : "/register", { replace: true });
    }
  }, [session, profile, loading, nav]);

  return (
    <div
      className="min-h-screen flex items-center justify-center px-3 py-8"
      style={{ background: "radial-gradient(circle at 20% 0%, oklch(0.3 0.05 60) 0%, oklch(0.15 0.02 60) 60%)" }}
    >
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div
            className="inline-flex h-16 w-16 items-center justify-center rounded-2xl mb-4"
            style={{ background: "var(--gradient-hero)", boxShadow: "var(--shadow-glow)" }}
          >
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
          <TabsContent value="signin">
            <SignInForm />
          </TabsContent>
          <TabsContent value="signup">
            <SignUpForm />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function SignInForm() {
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [showForgot, setShowForgot] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const email = id.includes("@") ? id.trim() : usernameToEmail(id);
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success("Welcome back");
  };

  if (showForgot) {
    return <ForgotPasswordFlow onBack={() => setShowForgot(false)} />;
  }

  return (
    <form
      onSubmit={submit}
      className="mt-6 space-y-4 rounded-2xl p-6"
      style={{ background: "var(--gradient-card)", boxShadow: "var(--shadow-elegant)" }}
    >
      <div>
        <Label htmlFor="signin-id">Email or Cashier Username</Label>
        <Input
          id="signin-id"
          name="username"
          autoComplete="username"
          value={id}
          onChange={(e) => setId(e.target.value)}
          placeholder="owner@bar.com or cashier1"
          required
        />
      </div>
      <div>
        <Label htmlFor="signin-pw">Password</Label>
        <Input
          id="signin-pw"
          name="password"
          type="password"
          autoComplete="current-password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          required
        />
      </div>
      <Button type="submit" className="w-full h-12 text-base font-bold" disabled={busy}>
        {busy ? "Signing in..." : "Sign in"}
      </Button>
      <div className="text-center pt-2">
        <button
          type="button"
          onClick={() => setShowForgot(true)}
          className="text-base font-bold text-primary hover:text-primary/80 underline"
        >
          Forgot password?
        </button>
      </div>
    </form>
  );
}

function ForgotPasswordFlow({ onBack }: { onBack: () => void }) {
  const [step, setStep] = useState<"email" | "otp" | "password">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [busy, setBusy] = useState(false);

  const sendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("email")
      .eq("email", email.trim())
      .single();
    
    if (profileError || !profile) {
      setBusy(false);
      toast.error("No account found with this email");
      return;
    }
    
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin + "/login",
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Check your email for the 6-digit code");
      setStep("otp");
    }
  };

  const verifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length !== 6) {
      toast.error("Enter the 6-digit code");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: otp,
      type: "recovery",
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Code verified");
      setStep("password");
    }
  };

  const updatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPw !== confirmPw) {
      toast.error("Passwords don't match");
      return;
    }
    if (newPw.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: newPw });
    setBusy(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Password updated successfully");
      onBack();
    }
  };

  return (
    <div className="mt-6 rounded-2xl p-6 space-y-4"
      style={{ background: "var(--gradient-card)", boxShadow: "var(--shadow-elegant)" }}>
      <button
        onClick={onBack}
        className="text-sm text-muted-foreground hover:text-foreground transition"
      >
        ← Back to sign in
      </button>

      {step === "email" && (
        <form onSubmit={sendOtp} className="space-y-4">
          <div>
            <h3 className="text-lg font-bold mb-1">Reset Password</h3>
            <p className="text-sm text-muted-foreground">Enter your email to receive a 6-digit code</p>
          </div>
          <div>
            <Label htmlFor="forgot-email">Email</Label>
            <Input
              id="forgot-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="owner@bar.com"
              required
            />
          </div>
          <Button type="submit" className="w-full h-12 text-base font-bold" disabled={busy}>
            {busy ? "Sending..." : "Send code"}
          </Button>
        </form>
      )}

      {step === "otp" && (
        <form onSubmit={verifyOtp} className="space-y-4">
          <div>
            <h3 className="text-lg font-bold mb-1">Enter Code</h3>
            <p className="text-sm text-muted-foreground">Check your email for the 6-digit code</p>
          </div>
          <div>
            <Label htmlFor="otp-code">6-Digit Code</Label>
            <Input
              id="otp-code"
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              placeholder="123456"
              className="text-center text-2xl font-bold tracking-widest"
              required
            />
          </div>
          <Button type="submit" className="w-full h-12 text-base font-bold" disabled={busy}>
            {busy ? "Verifying..." : "Verify code"}
          </Button>
          <button
            type="button"
            onClick={() => setStep("email")}
            className="w-full text-sm text-muted-foreground hover:text-foreground"
          >
            Resend code
          </button>
        </form>
      )}

      {step === "password" && (
        <form onSubmit={updatePassword} className="space-y-4">
          <div>
            <h3 className="text-lg font-bold mb-1">New Password</h3>
            <p className="text-sm text-muted-foreground">Enter your new password</p>
          </div>
          <div>
            <Label htmlFor="new-pw">New Password</Label>
            <Input
              id="new-pw"
              type="password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              minLength={6}
              required
            />
          </div>
          <div>
            <Label htmlFor="confirm-pw">Confirm Password</Label>
            <Input
              id="confirm-pw"
              type="password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              minLength={6}
              required
            />
          </div>
          <Button type="submit" className="w-full h-12 text-base font-bold" disabled={busy}>
            {busy ? "Updating..." : "Update password"}
          </Button>
        </form>
      )}
    </div>
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
      email: email.trim(),
      password: pw,
      options: {
        data: { username: username.trim(), role: "owner" },
        emailRedirectTo: window.location.origin,
      },
    });
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success("Account created — signing you in");
  };

  return (
    <form
      onSubmit={submit}
      className="mt-6 space-y-4 rounded-2xl p-6"
      style={{ background: "var(--gradient-card)", boxShadow: "var(--shadow-elegant)" }}
    >
      <div>
        <Label htmlFor="signup-username">Bar / Owner Username</Label>
        <Input
          id="signup-username"
          name="username"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          minLength={3}
        />
      </div>
      <div>
        <Label htmlFor="signup-email">Email</Label>
        <Input
          id="signup-email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <div>
        <Label htmlFor="signup-pw">Password</Label>
        <Input
          id="signup-pw"
          name="password"
          type="password"
          autoComplete="new-password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          required
          minLength={6}
        />
      </div>
      <Button type="submit" className="w-full h-12 text-base font-bold" disabled={busy}>
        {busy ? "Creating..." : "Create owner account"}
      </Button>
    </form>
  );
}
