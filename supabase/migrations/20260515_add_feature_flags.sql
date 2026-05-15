-- Create feature_flags table for system-wide settings
CREATE TABLE IF NOT EXISTS feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_name TEXT NOT NULL UNIQUE,
  enabled BOOLEAN DEFAULT false,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES profiles(id)
);

-- Insert default feature flags
INSERT INTO feature_flags (flag_name, enabled, description) VALUES
  ('bank_transfer_enabled', false, 'Enable bank transfer payment method for users')
ON CONFLICT (flag_name) DO NOTHING;

-- Enable RLS
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

-- Anyone can read feature flags
CREATE POLICY "Anyone can view feature flags"
  ON feature_flags FOR SELECT
  USING (true);

-- Only admins can update feature flags
CREATE POLICY "Admins can update feature flags"
  ON feature_flags FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Trigger to update updated_at
CREATE TRIGGER update_feature_flags_updated_at
  BEFORE UPDATE ON feature_flags
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
