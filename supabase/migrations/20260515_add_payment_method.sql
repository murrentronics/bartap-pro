-- Add payment_method column to billing_payments table
ALTER TABLE billing_payments 
ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'bank' CHECK (payment_method IN ('cash', 'bank'));

-- Add index for payment_method
CREATE INDEX IF NOT EXISTS idx_billing_payments_method ON billing_payments(payment_method);
