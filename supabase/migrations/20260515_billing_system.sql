-- Create billing_plans table
CREATE TABLE IF NOT EXISTS billing_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  duration_months INTEGER NOT NULL,
  currency TEXT DEFAULT 'TT',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default plans
INSERT INTO billing_plans (name, amount, duration_months) VALUES
  ('6 Month Plan', 300.00, 6),
  ('Annual Plan', 500.00, 12);

-- Create billing_payments table
CREATE TABLE IF NOT EXISTS billing_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES billing_plans(id),
  reference_number TEXT NOT NULL UNIQUE,
  amount DECIMAL(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'rejected')),
  payment_date TIMESTAMPTZ,
  due_date TIMESTAMPTZ NOT NULL,
  next_due_date TIMESTAMPTZ,
  approved_by UUID REFERENCES profiles(id),
  approved_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create admin_bank_details table
CREATE TABLE IF NOT EXISTS admin_bank_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  bank_name TEXT NOT NULL,
  account_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  branch TEXT,
  swift_code TEXT,
  instructions TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(admin_id)
);

-- Add billing status to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS billing_status TEXT DEFAULT 'pending_setup' CHECK (billing_status IN ('pending_setup', 'active', 'suspended', 'expired'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS current_plan_id UUID REFERENCES billing_plans(id);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_start_date TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_end_date TIMESTAMPTZ;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_billing_payments_owner ON billing_payments(owner_id);
CREATE INDEX IF NOT EXISTS idx_billing_payments_status ON billing_payments(status);
CREATE INDEX IF NOT EXISTS idx_billing_payments_due_date ON billing_payments(due_date);
CREATE INDEX IF NOT EXISTS idx_profiles_billing_status ON profiles(billing_status);

-- Enable RLS
ALTER TABLE billing_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_bank_details ENABLE ROW LEVEL SECURITY;

-- RLS Policies for billing_plans (everyone can read)
CREATE POLICY "Anyone can view billing plans"
  ON billing_plans FOR SELECT
  USING (true);

-- RLS Policies for billing_payments
CREATE POLICY "Owners can view their own payments"
  ON billing_payments FOR SELECT
  USING (
    owner_id = auth.uid() OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Owners can create their own payments"
  ON billing_payments FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Admins can update payments"
  ON billing_payments FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- RLS Policies for admin_bank_details
CREATE POLICY "Owners can view active bank details"
  ON admin_bank_details FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can manage their bank details"
  ON admin_bank_details FOR ALL
  USING (admin_id = auth.uid() AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Function to generate unique reference number
CREATE OR REPLACE FUNCTION generate_payment_reference()
RETURNS TEXT AS $$
DECLARE
  ref TEXT;
  exists BOOLEAN;
BEGIN
  LOOP
    ref := 'BP' || TO_CHAR(NOW(), 'YYYYMMDD') || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');
    SELECT EXISTS(SELECT 1 FROM billing_payments WHERE reference_number = ref) INTO exists;
    EXIT WHEN NOT exists;
  END LOOP;
  RETURN ref;
END;
$$ LANGUAGE plpgsql;

-- Function to update next due date when payment is approved
CREATE OR REPLACE FUNCTION update_billing_on_payment_approval()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'paid' AND OLD.status != 'paid' THEN
    -- Calculate next due date based on plan duration
    NEW.next_due_date := NEW.due_date + (
      SELECT (duration_months || ' months')::INTERVAL 
      FROM billing_plans 
      WHERE id = NEW.plan_id
    );
    
    -- Update profile subscription dates
    UPDATE profiles
    SET 
      billing_status = 'active',
      current_plan_id = NEW.plan_id,
      subscription_start_date = COALESCE(subscription_start_date, NEW.payment_date),
      subscription_end_date = NEW.next_due_date
    WHERE id = NEW.owner_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for payment approval
CREATE TRIGGER trigger_update_billing_on_approval
  BEFORE UPDATE ON billing_payments
  FOR EACH ROW
  EXECUTE FUNCTION update_billing_on_payment_approval();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_billing_payments_updated_at
  BEFORE UPDATE ON billing_payments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_admin_bank_details_updated_at
  BEFORE UPDATE ON admin_bank_details
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
