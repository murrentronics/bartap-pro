import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, usernameToEmail } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Wine, Eye, EyeOff, X, FileText } from "lucide-react";
import { PhoneInput } from "@/components/PhoneInput";
import { friendlyError } from "@/lib/network-error";
import { useTranslation } from "@/lib/i18n";

export default function LoginPage() {
  const { session, profile, loading } = useAuth();
  const nav = useNavigate();
  const { t } = useTranslation();
  // Track if forgot-password flow is open so we don't auto-redirect
  // when the OTP verification temporarily signs the user in
  const [forgotOpen, setForgotOpen] = useState(false);

  useEffect(() => {
    // Don't redirect while the forgot-password flow is active —
    // verifyOtp signs the user in but we need to stay on the password step
    if (forgotOpen) return;
    if (!loading && session && profile) {
      const isManager = profile.role === "manager" || (profile as any)?.job_title === "manager";
      const isMachinesOnly = (profile as any)?.is_machines_account || profile.plan_type === "machines_only";
      const dest = profile.role === "admin"
        ? "/admin"
        : isManager
        ? "/products"
        : isMachinesOnly
        ? "/machines"
        : "/register";
      nav(dest, { replace: true });
    }
  }, [session, profile, loading, nav, forgotOpen]);

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
          <p className="text-muted-foreground mt-1">{t("bar_pos_wallet", "Bar POS & Wallet")}</p>
        </div>

        <Tabs defaultValue="signin" className="w-full">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="signin">{t("sign_in", "Sign in")}</TabsTrigger>
            <TabsTrigger value="signup">{t("owner_sign_up", "Owner sign up")}</TabsTrigger>
          </TabsList>
          <TabsContent value="signin">
            <SignInForm onForgotChange={setForgotOpen} />
          </TabsContent>
          <TabsContent value="signup">
            <SignUpForm />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function SignInForm({ onForgotChange }: { onForgotChange: (open: boolean) => void }) {
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const submitBtnRef = useRef<HTMLButtonElement>(null);
  const { t } = useTranslation();

  const handlePasswordFocus = () => {
    // Give the keyboard time to animate open before scrolling
    setTimeout(() => {
      submitBtnRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 400);
  };

  const setForgot = (val: boolean) => {
    setShowForgot(val);
    onForgotChange(val);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const email = id.includes("@") ? id.trim() : usernameToEmail(id);
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
    setBusy(false);
    if (error) toast.error(friendlyError(error));
  };

  if (showForgot) {
    return <ForgotPasswordFlow onBack={() => setForgot(false)} />;
  }
  return (
    <form
      onSubmit={submit}
      className="mt-6 space-y-4 rounded-2xl p-6"
      style={{ background: "var(--gradient-card)", boxShadow: "var(--shadow-elegant)" }}
    >
      <div>
        <Label htmlFor="signin-id">{t("email_or_username", "Email or Cashier Username")}</Label>
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
        <Label htmlFor="signin-pw">{t("password", "Password")}</Label>
        <div className="relative">
          <Input
            id="signin-pw"
            name="password"
            type={showPw ? "text" : "password"}
            autoComplete="current-password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            onFocus={handlePasswordFocus}
            required
            className="pr-10"
          />
          <button type="button" onClick={() => setShowPw(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition">
            {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <Button ref={submitBtnRef} type="submit" className="w-full h-12 text-base font-bold" disabled={busy}>
        {busy ? t("signing_in", "Signing in...") : t("sign_in", "Sign in")}
      </Button>
      <div className="text-center pt-2">
        <button
          type="button"
          onClick={() => setForgot(true)}
          className="text-base font-bold text-primary hover:text-primary/80 underline"
        >
          {t("forgot_password_q", "Forgot password?")}
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
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recoverySession, setRecoverySession] = useState(false);
  const { t } = useTranslation();

  // Auto-read clipboard only when app regains focus (user switched to email to copy code)
  // Does NOT auto-paste on mount — avoids filling stale codes from clipboard history
  useEffect(() => {
    if (step !== "otp") return;

    const tryPaste = async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        let text = "";
        if (Capacitor.isNativePlatform()) {
          const { Clipboard } = await import("@capacitor/clipboard");
          const { value } = await Clipboard.read();
          text = value ?? "";
        } else if (navigator.clipboard?.readText) {
          text = await navigator.clipboard.readText();
        }
        const digits = text.replace(/\D/g, "").slice(0, 6);
        if (digits.length === 6) {
          setOtp(digits);
          toast.success("Code pasted from clipboard");
        }
      } catch {
        // Clipboard read denied — user types or taps Paste manually
      }
    };

    // Only trigger when app comes back into focus — not on mount
    const onFocus = () => tryPaste();
    const onVisible = () => { if (document.visibilityState === "visible") tryPaste(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [step]);
  // When it fires we are on the password step — block the normal redirect
  // by tracking that we're in recovery mode.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" && step === "otp") {
        // OTP verified and user is now signed in — go to password step
        setRecoverySession(true);
        setStep("password");
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [step]);

  const sendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    // signInWithOtp sends a pure 6-digit code — no redirect link in the email
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false },
    });
    setBusy(false);
    // Always advance to OTP step regardless — don't reveal if email exists
    if (error) {
      toast.success("If an account exists with this email, you'll receive a 6-digit code");
    } else {
      toast.success("Check your email for the 6-digit code");
    }
    setStep("otp");
  };

  const verifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length !== 6) { toast.error("Enter the 6-digit code"); return; }
    setBusy(true);
    // verifyOtp with type "email" signs the user in — the onAuthStateChange
    // listener above catches SIGNED_IN and moves to the password step
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: otp,
      type: "email",
    });
    setBusy(false);
    if (error) {
      toast.error("Invalid or expired code. Try again.");
    }
    // On success the auth listener handles the step transition
  };

  const updatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPw !== confirmPw) { toast.error("Passwords don't match"); return; }
    if (newPw.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: newPw });
    setBusy(false);
    if (error) {
      toast.error(friendlyError(error));
    } else {
      toast.success("Password updated — please sign in");
      // Sign out so they land back on the login form cleanly
      await supabase.auth.signOut();
      setRecoverySession(false);
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
        {t("back_to_sign_in", "← Back to sign in")}
      </button>

      {step === "email" && (
        <form onSubmit={sendOtp} className="space-y-4">
          <div>
            <h3 className="text-lg font-bold mb-1">{t("reset_password", "Reset Password")}</h3>
            <p className="text-sm text-muted-foreground">{t("enter_email", "Enter your email to receive a 6-digit code")}</p>
          </div>
          <div>
            <Label htmlFor="forgot-email">{t("email_lbl", "Email")}</Label>
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
            {busy ? t("sending_code", "Sending...") : t("send_code", "Send code")}
          </Button>
        </form>
      )}

      {step === "otp" && (
        <form onSubmit={verifyOtp} className="space-y-4">
          <div>
            <h3 className="text-lg font-bold mb-1">{t("enter_code", "Enter Code")}</h3>
            <p className="text-sm text-muted-foreground">{t("check_email_code", "Check your email for the 6-digit code")}</p>
          </div>
          <div>
            <Label htmlFor="otp-code">{t("digit6_lbl", "6-Digit Code")}</Label>
            <div className="flex gap-2 mt-1">
              <Input
                id="otp-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                value={otp}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "").slice(0, 6);
                  setOtp(val);
                }}
                placeholder="123456"
                className="text-center text-2xl font-bold tracking-widest flex-1"
                required
              />
              <Button
                type="button"
                variant="outline"
                className="shrink-0 h-10 px-3 text-xs font-bold"
                onClick={async () => {
                  try {
                    const { Capacitor } = await import("@capacitor/core");
                    let text = "";
                    if (Capacitor.isNativePlatform()) {
                      const { Clipboard } = await import("@capacitor/clipboard");
                      const { value } = await Clipboard.read();
                      text = value ?? "";
                    } else if (navigator.clipboard?.readText) {
                      text = await navigator.clipboard.readText();
                    }
                    const digits = text.replace(/\D/g, "").slice(0, 6);
                    if (digits.length === 6) {
                      setOtp(digits);
                      toast.success(t("copied", "Code pasted"));
                    } else {
                      toast.error("No 6-digit code found in clipboard");
                    }
                  } catch {
                    toast.error("Could not read clipboard");
                  }
                }}
              >
                {t("paste", "Paste")}
              </Button>
            </div>
          </div>
          <Button type="submit" className="w-full h-12 text-base font-bold" disabled={busy}>
            {busy ? t("verifying_code", "Verifying...") : t("verify_code", "Verify code")}
          </Button>
          <button
            type="button"
            onClick={() => setStep("email")}
            className="w-full text-sm text-muted-foreground hover:text-foreground"
          >
            {t("resend_code", "Resend code")}
          </button>
        </form>
      )}

      {step === "password" && (
        <form onSubmit={updatePassword} className="space-y-4">
          <div>
            <h3 className="text-lg font-bold mb-1">{t("new_password_step", "New Password")}</h3>
            <p className="text-sm text-muted-foreground">{t("enter_new_password", "Enter your new password")}</p>
          </div>
          <div>
            <Label htmlFor="new-pw">{t("new_pw_lbl", "New Password")}</Label>
            <div className="relative">
              <Input
                id="new-pw"
                type={showNewPw ? "text" : "password"}
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                minLength={6}
                required
                className="pr-10"
              />
              <button type="button" onClick={() => setShowNewPw(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition">
                {showNewPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div>
            <Label htmlFor="confirm-pw">{t("confirm_pw_lbl", "Confirm Password")}</Label>
            <div className="relative">
              <Input
                id="confirm-pw"
                type={showConfirmPw ? "text" : "password"}
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                minLength={6}
                required
                className="pr-10"
              />
              <button type="button" onClick={() => setShowConfirmPw(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition">
                {showConfirmPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <Button type="submit" className="w-full h-12 text-base font-bold" disabled={busy}>
            {busy ? t("updating_password", "Updating...") : t("update_password_btn", "Update password")}
          </Button>
        </form>
      )}
    </div>
  );
}

// ── Inline terms content for the signup popup ──────────────────────────────
function TermsConditionsContent() {
  const p: React.CSSProperties = { fontSize: "0.82rem", color: "#c8b090", lineHeight: 1.7, margin: "0 0 10px" };
  const h: React.CSSProperties = { fontSize: "0.85rem", fontWeight: 900, color: "#F0A030", margin: "18px 0 6px" };
  const li: React.CSSProperties = { fontSize: "0.82rem", color: "#c8b090", lineHeight: 1.7, marginBottom: 3 };
  return (
    <div style={{ color: "#e8d5b0" }}>
      <p style={{ ...p, marginBottom: 16 }}>Last updated: August 2026. By creating an account you agree to these Terms.</p>
      <p style={h}>1. Account Registration</p>
      <ul style={{ paddingLeft: 18, margin: "0 0 10px" }}>
        <li style={li}>You must provide accurate information during registration.</li>
        <li style={li}>You are responsible for all activity under your account, including actions by staff you create.</li>
        <li style={li}>Notify us immediately of any unauthorized account use.</li>
      </ul>
      <p style={h}>2. Subscription & Billing</p>
      <ul style={{ paddingLeft: 18, margin: "0 0 10px" }}>
        <li style={li}>Access requires a paid subscription. Plans are listed within the app.</li>
        <li style={li}>Failure to renew results in suspension. Data is held 30 days then deleted.</li>
        <li style={li}>All payments are final unless a technical failure on our end is documented.</li>
      </ul>
      <p style={h}>3. Permitted Use</p>
      <ul style={{ paddingLeft: 18, margin: "0 0 10px" }}>
        <li style={li}>For legitimate bar/hospitality business operations only.</li>
        <li style={li}>No reselling, reverse engineering, or illegal transactions.</li>
        <li style={li}>No circumventing security or accessing other users' data.</li>
      </ul>
      <p style={h}>4. Data Ownership</p>
      <p style={p}>You retain full ownership of your business data. We process it only to deliver the service.</p>
      <p style={h}>5. Limitation of Liability</p>
      <p style={p}>Bartendaz Pro is not liable for indirect, incidental, or consequential damages arising from your use of the platform.</p>
      <p style={h}>6. Governing Law</p>
      <p style={p}>These Terms are governed by the laws of Trinidad and Tobago.</p>
      <p style={h}>7. Contact</p>
      <p style={p}>Questions? Email <span style={{ color: "#F0A030" }}>support@bartendazpro.com</span></p>
    </div>
  );
}

function TermsOfUseContent() {
  const p: React.CSSProperties = { fontSize: "0.82rem", color: "#c8b090", lineHeight: 1.7, margin: "0 0 10px" };
  const h: React.CSSProperties = { fontSize: "0.85rem", fontWeight: 900, color: "#F0A030", margin: "18px 0 6px" };
  const li: React.CSSProperties = { fontSize: "0.82rem", color: "#c8b090", lineHeight: 1.7, marginBottom: 3 };
  return (
    <div style={{ color: "#e8d5b0" }}>
      <p style={{ ...p, marginBottom: 16 }}>Last updated: August 2026. These Terms govern your day-to-day use of Bartendaz Pro.</p>
      <p style={h}>1. Acceptable Use</p>
      <ul style={{ paddingLeft: 18, margin: "0 0 10px" }}>
        <li style={li}>Use the app only for lawful purposes consistent with all applicable laws.</li>
        <li style={li}>Ensure your business is licensed to sell the products you manage.</li>
        <li style={li}>Keep your account credentials secure — do not share your owner login.</li>
      </ul>
      <p style={h}>2. Prohibited Conduct</p>
      <ul style={{ paddingLeft: 18, margin: "0 0 10px" }}>
        <li style={li}>No illegal transactions, money laundering, or false financial records.</li>
        <li style={li}>No uploading malicious software or scripts.</li>
        <li style={li}>No unauthorized access to other accounts or system infrastructure.</li>
        <li style={li}>No scraping or bulk extraction of data without written permission.</li>
      </ul>
      <p style={h}>3. Content You Submit</p>
      <p style={p}>You are solely responsible for all product images, names, prices, and customer data you upload. You confirm you have rights to all submitted content.</p>
      <p style={h}>4. Intellectual Property</p>
      <p style={p}>All software, design, graphics, and trademarks belong to Bartendaz Pro. These Terms grant only a limited license to use the platform as described.</p>
      <p style={h}>5. Disclaimer of Warranties</p>
      <p style={p}>Bartendaz Pro is provided "as is" without warranties of any kind. We do not guarantee the app will be error-free or uninterrupted.</p>
      <p style={h}>6. Contact</p>
      <p style={p}>Violations or questions? Email <span style={{ color: "#F0A030" }}>support@bartendazpro.com</span></p>
    </div>
  );
}

function SignUpForm() {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [pw, setPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [showTermsPopup, setShowTermsPopup] = useState(false);
  const [termsTab, setTermsTab] = useState<"conditions" | "use">("conditions");
  const { t } = useTranslation();

  const scrollIntoView = (e: React.FocusEvent<HTMLElement>) => {
    setTimeout(() => {
      e.target.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 350);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw !== confirmPw) { toast.error("Passwords don't match"); return; }
    setBusy(true);
    // No emailRedirectTo — Supabase is configured to use OTP (6-digit code)
    // for email confirmation, so no redirect link is sent in the email.
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password: pw,
      options: {
        data: {
          username: username.trim(),
          role: "owner",
          phone: phone.trim(),
          address: address.trim(),
        },
      },
    });
    setBusy(false);
    if (error) toast.error(friendlyError(error));
    else toast.success("Account created — signing you in");
  };

  return (
    <form
      onSubmit={submit}
      className="mt-6 space-y-4 rounded-2xl p-6"
      style={{ background: "var(--gradient-card)", boxShadow: "var(--shadow-elegant)" }}
    >
      <div>
        <Label htmlFor="signup-username">{t("business_name", "Business Name")}</Label>
        <Input
          id="signup-username"
          name="username"
          autoComplete="organization"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onFocus={scrollIntoView}
          placeholder="My Bar & Grill"
          required
          minLength={3}
        />
      </div>
      <div>
        <Label htmlFor="signup-email">{t("email_lbl", "Email")}</Label>
        <Input
          id="signup-email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onFocus={scrollIntoView}
          placeholder="owner@mybar.com"
          required
        />
      </div>
      <div>
        <Label htmlFor="signup-phone">{t("phone_number", "Phone Number")}</Label>
        <PhoneInput
          id="signup-phone"
          name="phone"
          value={phone}
          onChange={setPhone}
          onFocus={scrollIntoView}
          required
        />
      </div>
      <div>
        <Label htmlFor="signup-address">{t("business_address", "Business Address")}</Label>
        <Input
          id="signup-address"
          name="address"
          autoComplete="street-address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          onFocus={scrollIntoView}
          placeholder="123 Main St, Port of Spain"
          required
        />
      </div>
      <div>
        <Label htmlFor="signup-pw">{t("password", "Password")}</Label>
        <div className="relative">
          <Input
            id="signup-pw"
            name="password"
            type={showPw ? "text" : "password"}
            autoComplete="new-password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            onFocus={scrollIntoView}
            required
            minLength={6}
            className="pr-10"
          />
          <button type="button" onClick={() => setShowPw(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition">
            {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <div>
        <Label htmlFor="signup-confirm-pw">{t("confirm_password_lbl", "Confirm Password")}</Label>
        <div className="relative">
          <Input
            id="signup-confirm-pw"
            name="confirm-password"
            type={showConfirm ? "text" : "password"}
            autoComplete="new-password"
            value={confirmPw}
            onChange={(e) => setConfirmPw(e.target.value)}
            onFocus={scrollIntoView}
            required
            minLength={6}
            className="pr-10"
          />
          <button type="button" onClick={() => setShowConfirm(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition">
            {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <Button type="submit" className="w-full h-12 text-base font-bold" disabled={busy || !agreedToTerms}>
        {busy ? t("creating_acct", "Creating...") : t("create_owner_acct", "Create owner account")}
      </Button>

      {/* Terms agreement checkbox */}
      <div className="flex items-start gap-3 pt-1">
        <button
          type="button"
          onClick={() => setAgreedToTerms(v => !v)}
          className="mt-0.5 h-5 w-5 rounded flex items-center justify-center shrink-0 border-2 transition-all"
          style={{
            background: agreedToTerms ? "var(--gradient-hero)" : "transparent",
            borderColor: agreedToTerms ? "var(--primary)" : "rgba(255,255,255,0.25)",
          }}
          aria-checked={agreedToTerms}
          role="checkbox"
        >
          {agreedToTerms && (
            <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
              <path d="M1 4L4 7.5L10 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
        <p className="text-xs text-muted-foreground leading-relaxed">
          I have read and agree to the{" "}
          <button
            type="button"
            onClick={() => { setTermsTab("conditions"); setShowTermsPopup(true); }}
            className="font-bold underline underline-offset-2 transition-colors"
            style={{ color: "var(--primary)", background: "none", border: "none", padding: 0, cursor: "pointer" }}
          >
            Terms &amp; Conditions
          </button>
          {" "}and{" "}
          <button
            type="button"
            onClick={() => { setTermsTab("use"); setShowTermsPopup(true); }}
            className="font-bold underline underline-offset-2 transition-colors"
            style={{ color: "var(--primary)", background: "none", border: "none", padding: 0, cursor: "pointer" }}
          >
            Terms of Use
          </button>
          {" "}of Bartendaz Pro.
        </p>
      </div>

      {/* Terms inline popup */}
      {showTermsPopup && (
        <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4">
          <div
            className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl border border-border shadow-2xl flex flex-col overflow-hidden"
            style={{ background: "#0f0a04", maxHeight: "88dvh" }}
          >
            {/* Popup header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border/40 shrink-0">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5" style={{ color: "var(--primary)" }} />
                <span className="font-black text-base" style={{ color: "#e8d5b0" }}>
                  {termsTab === "conditions" ? "Terms & Conditions" : "Terms of Use"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowTermsPopup(false)}
                className="h-8 w-8 rounded-full flex items-center justify-center bg-muted hover:bg-muted/80 transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Tab switcher */}
            <div className="flex gap-2 px-5 py-3 border-b border-border/40 shrink-0">
              {(["conditions", "use"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setTermsTab(tab)}
                  className="flex-1 h-9 rounded-xl font-black text-xs transition active:scale-95"
                  style={termsTab === tab
                    ? { background: "linear-gradient(135deg, #F0A030, #C0441A)", color: "#fff", border: "none" }
                    : { background: "rgba(255,255,255,0.06)", color: "#a08060", border: "none" }}
                >
                  {tab === "conditions" ? "Terms & Conditions" : "Terms of Use"}
                </button>
              ))}
            </div>

            {/* Scrollable content */}
            <div className="overflow-y-auto flex-1 px-5 py-4" style={{ scrollbarWidth: "thin" }}>
              {termsTab === "conditions" ? <TermsConditionsContent /> : <TermsOfUseContent />}
            </div>

            {/* Agree button */}
            <div className="px-5 py-4 border-t border-border/40 shrink-0">
              <button
                type="button"
                onClick={() => { setAgreedToTerms(true); setShowTermsPopup(false); }}
                className="w-full h-12 rounded-2xl font-black text-sm transition active:scale-95"
                style={{ background: "linear-gradient(135deg, #F0A030, #C0441A)", color: "#fff", border: "none" }}
              >
                I Agree — Close
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
