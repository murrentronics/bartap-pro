-- Add DELETE policy for opened_bottles so factory reset and owners can clear open bottles

CREATE POLICY "Delete opened_bottles in scope" ON public.opened_bottles
  FOR DELETE
  USING (owner_id = public.get_owner_id(auth.uid()));