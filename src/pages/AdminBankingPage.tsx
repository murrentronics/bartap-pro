import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Building2, Save } from "lucide-react";
import type { AdminBankDetails } from "@/types/billing";

export default function AdminBankingPage() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [bankDetails, setBankDetails] = useState<Partial<AdminBankDetails>>({
    bank_name: "",
    account_name: "",
    account_number: "",
    branch: "",
    swift_code: "",
    instructions: "",
  });

  useEffect(() => {
    loadBankDetails();
  }, [profile]);

  const loadBankDetails = async () => {
    if (!profile?.id) return;

    const { data, error } = await supabase
      .from("admin_bank_details")
      .select("*")
      .eq("admin_id", profile.id)
      .single();

    if (!error && data) {
      setBankDetails(data);
    }
  };

  const saveBankDetails = async () => {
    if (!profile?.id) return;

    if (!bankDetails.bank_name || !bankDetails.account_name || !bankDetails.account_number) {
      toast.error("Please fill in all required fields");
      return;
    }

    setLoading(true);

    const payload = {
      admin_id: profile.id,
      bank_name: bankDetails.bank_name,
      account_name: bankDetails.account_name,
      account_number: bankDetails.account_number,
      branch: bankDetails.branch || null,
      swift_code: bankDetails.swift_code || null,
      instructions: bankDetails.instructions || null,
      is_active: true,
    };

    const { error } = await supabase
      .from("admin_bank_details")
      .upsert(payload, { onConflict: "admin_id" });

    setLoading(false);

    if (error) {
      toast.error("Failed to save bank details");
      return;
    }

    toast.success("Bank details saved successfully");
    loadBankDetails();
  };

  return (
    <div className="min-h-screen p-6 pb-24">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-3 mb-6">
          <Building2 className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-black">Banking Details</h1>
        </div>

        <Card className="p-6">
          <p className="text-sm text-muted-foreground mb-6">
            These details will be shown to owners when they need to make payments
          </p>

          <div className="space-y-4">
            <div>
              <Label htmlFor="bank_name">Bank Name *</Label>
              <Input
                id="bank_name"
                value={bankDetails.bank_name || ""}
                onChange={(e) => setBankDetails({ ...bankDetails, bank_name: e.target.value })}
                placeholder="e.g., Republic Bank"
                required
              />
            </div>

            <div>
              <Label htmlFor="account_name">Account Name *</Label>
              <Input
                id="account_name"
                value={bankDetails.account_name || ""}
                onChange={(e) => setBankDetails({ ...bankDetails, account_name: e.target.value })}
                placeholder="e.g., Bartendaz Pro Ltd"
                required
              />
            </div>

            <div>
              <Label htmlFor="account_number">Account Number *</Label>
              <Input
                id="account_number"
                value={bankDetails.account_number || ""}
                onChange={(e) => setBankDetails({ ...bankDetails, account_number: e.target.value })}
                placeholder="e.g., 123456789"
                required
              />
            </div>

            <div>
              <Label htmlFor="branch">Branch (Optional)</Label>
              <Input
                id="branch"
                value={bankDetails.branch || ""}
                onChange={(e) => setBankDetails({ ...bankDetails, branch: e.target.value })}
                placeholder="e.g., Port of Spain"
              />
            </div>

            <div>
              <Label htmlFor="swift_code">SWIFT Code (Optional)</Label>
              <Input
                id="swift_code"
                value={bankDetails.swift_code || ""}
                onChange={(e) => setBankDetails({ ...bankDetails, swift_code: e.target.value })}
                placeholder="e.g., RBTTTTPX"
              />
            </div>

            <div>
              <Label htmlFor="instructions">Payment Instructions (Optional)</Label>
              <Textarea
                id="instructions"
                value={bankDetails.instructions || ""}
                onChange={(e) => setBankDetails({ ...bankDetails, instructions: e.target.value })}
                placeholder="Add any special instructions for owners making payments..."
                rows={4}
              />
            </div>

            <Button
              onClick={saveBankDetails}
              disabled={loading}
              className="w-full h-12 text-base font-bold"
            >
              <Save className="h-5 w-5 mr-2" />
              {loading ? "Saving..." : "Save Bank Details"}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
