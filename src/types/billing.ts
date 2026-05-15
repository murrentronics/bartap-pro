export type BillingPlan = {
  id: string;
  name: string;
  amount: number;
  duration_months: number;
  currency: string;
  created_at: string;
};

export type PaymentStatus = 'pending' | 'paid' | 'rejected';

export type BillingPayment = {
  id: string;
  owner_id: string;
  plan_id: string;
  reference_number: string;
  amount: number;
  status: PaymentStatus;
  payment_date: string | null;
  due_date: string;
  next_due_date: string | null;
  approved_by: string | null;
  approved_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type AdminBankDetails = {
  id: string;
  admin_id: string;
  bank_name: string;
  account_name: string;
  account_number: string;
  branch: string | null;
  swift_code: string | null;
  instructions: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type BillingStatus = 'pending_setup' | 'active' | 'suspended' | 'expired';
