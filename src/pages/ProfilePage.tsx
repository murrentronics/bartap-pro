import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, AlertTriangle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function ProfilePage() {
  const { user, profile, loading, signOut, refreshProfile } = useAuth();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // Business info
  const [businessName, setBusinessName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  // Email change — OTP flow (no redirect links)
  const [newEmail, setNewEmail] = useState("");
  const [emailOtp, setEmailOtp] = useState("");
  const [emailStep, setEmailStep] = useState<"idle" | "otp">("idle");
  const [emailBusy, setEmailBusy] = useState(false);

  // Password change
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Redirect non-owners
  useEffect(() => {
    if (!loading && profile && profile.role !== "owner") {
      nav("/register", { replace: true });
    }
  }, [loading, profile, nav]);

  // Load current data
  useEffect(() => {
    if (user && profile) {
      setBusinessName(profile.username);
      setNewEmail(user.email || "");
      setPhone(profile.phone || "");
      setAddress(profile.address || "");
    }
  }, [user, profile]);

  // ── Business info (name, phone, address) ──────────────────────────────────
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          username: businessName.trim(),
          phone: phone.trim(),
          address: address.trim(),
        })
        .eq("id", profile.id);
      if (error) throw error;
      await refreshProfile();
      toast.success("Profile updated");
    } catch (err: any) {
      toast.error(err.message || "Failed to update profile");
    } finally {
      setBusy(false);
    }
  };

  // ── Email change — step 1: send 6-digit OTP to the NEW email ──────────────
  const handleSendEmailOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.email) return;
    if (newEmail.trim() === user.email) {
      toast.error("That's already your current email");
      return;
    }
    setEmailBusy(true);
    try {
      // updateUser with just the new email — Supabase sends a 6-digit OTP
      // to the NEW address with no redirect link when email OTP is enabled.
      const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
      if (error) throw error;
      toast.success("6-digit code sent to " + newEmail.trim());
      setEmailStep("otp");
    } catch (err: any) {
      toast.error(err.message || "Failed to send code");
    } finally {
      setEmailBusy(false);
    }
  };

  // ── Email change — step 2: verify the OTP ─────────────────────────────────
  const handleVerifyEmailOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (emailOtp.length !== 6) {
      toast.error("Enter the 6-digit code");
      return;
    }
    setEmailBusy(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: newEmail.trim(),
        token: emailOtp,
        type: "email_change",
      });
      if (error) throw error;
      toast.success("Email updated successfully");
      setEmailStep("idle");
      setEmailOtp("");
      await refreshProfile();
    } catch (err: any) {
      toast.error(err.message || "Invalid or expired code");
    } finally {
      setEmailBusy(false);
    }
  };

  // ── Password change ────────────────────────────────────────────────────────
  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.email) return;
    if (newPassword !== confirmPassword) {
      toast.error("Passwords don't match");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setBusy(true);
    try {
      // Verify current password first
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });
      if (signInError) {
        toast.error("Current password is incorrect");
        return;
      }
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success("Password updated");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      toast.error(err.message || "Failed to update password");
    } finally {
      setBusy(false);
    }
  };

  // ── Delete account ─────────────────────────────────────────────────────────
  const handleDeleteAccount = async () => {
    if (!profile) return;
    setDeleteBusy(true);
    try {
      const { error } = await supabase.rpc("delete_own_account");
      if (error) throw error;
      toast.success("Account deleted");
      await signOut();
      nav("/login", { replace: true });
    } catch (err: any) {
      toast.error(err.message || "Failed to delete account");
      setDeleteBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!profile || profile.role !== "owner") return null;

  return (
    <div className="space-y-6 pb-8">
      <div>
        <h1 className="text-3xl font-black tracking-tight">Profile Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your business information and account</p>
      </div>

      {/* ── Business Information ── */}
      <Card>
        <CardHeader>
          <CardTitle>Business Information</CardTitle>
          <CardDescription>Update your business name, phone, and address</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpdateProfile} className="space-y-4">
            <div>
              <Label htmlFor="business-name">Business Name</Label>
              <Input
                id="business-name"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="My Bar & Grill"
                required
                minLength={3}
              />
            </div>
            <div>
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 868 555 1234"
                required
              />
            </div>
            <div>
              <Label htmlFor="address">Business Address</Label>
              <Input
                id="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="123 Main St, Port of Spain"
                required
              />
            </div>
            <Button type="submit" disabled={busy}>
              {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : "Save Changes"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* ── Change Email (OTP — no redirect link) ── */}
      <Card>
        <CardHeader>
          <CardTitle>Change Email</CardTitle>
          <CardDescription>
            Current: <span className="font-semibold text-foreground">{user?.email}</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {emailStep === "idle" ? (
            <form onSubmit={handleSendEmailOtp} className="space-y-4">
              <div>
                <Label htmlFor="new-email">New Email Address</Label>
                <Input
                  id="new-email"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="newemail@bar.com"
                  required
                />
              </div>
              <Button type="submit" disabled={emailBusy}>
                {emailBusy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending...</> : "Send 6-Digit Code"}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleVerifyEmailOtp} className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Enter the 6-digit code sent to <span className="font-semibold text-foreground">{newEmail}</span>
              </p>
              <div>
                <Label htmlFor="email-otp">6-Digit Code</Label>
                <Input
                  id="email-otp"
                  type="number"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  value={emailOtp}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "").slice(0, 6);
                    setEmailOtp(val);
                  }}
                  placeholder="123456"
                  className="text-center text-2xl font-bold tracking-widest [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  required
                />
              </div>
              <div className="flex gap-3">
                <Button type="button" variant="outline" onClick={() => { setEmailStep("idle"); setEmailOtp(""); }}>
                  Cancel
                </Button>
                <Button type="submit" disabled={emailBusy}>
                  {emailBusy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Verifying...</> : "Confirm Email"}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      {/* ── Change Password ── */}
      <Card>
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
          <CardDescription>You must enter your current password to change it</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpdatePassword} className="space-y-4">
            <div>
              <Label htmlFor="current-password">Current Password</Label>
              <Input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            <div>
              <Label htmlFor="new-password">New Password</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            <div>
              <Label htmlFor="confirm-password">Confirm New Password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            <Button type="submit" disabled={busy}>
              {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Updating...</> : "Update Password"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* ── Danger Zone ── */}
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
          <CardDescription>Permanently delete your account and all associated data</CardDescription>
        </CardHeader>
        <CardContent>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={deleteBusy}>
                <AlertTriangle className="mr-2 h-4 w-4" />
                Delete Account
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This cannot be undone. Your account, all cashiers, products, orders, and
                  transaction history will be permanently deleted.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteAccount}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {deleteBusy
                    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Deleting...</>
                    : "Yes, delete my account"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <p className="text-xs text-muted-foreground mt-2">
            Deletes all cashiers, products, orders, and wallet transactions.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
