-- Enable RLS if not already
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;

-- Allow owners to update their own business row
-- Cast auth.uid() to text because owner_id column is text (from CSV import)
CREATE POLICY "Owners can update own business"
ON businesses FOR UPDATE
USING (auth.uid()::text = owner_id)
WITH CHECK (auth.uid()::text = owner_id);
