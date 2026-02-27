-- Create the "uploads" storage bucket for user-uploaded product images
INSERT INTO storage.buckets (id, name, public)
VALUES ('uploads', 'uploads', false)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload files to their own folder
CREATE POLICY "Users upload own files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'uploads'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow authenticated users to read their own files (for signed URLs)
CREATE POLICY "Users read own files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'uploads'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow service role full access (for API routes, webhooks)
CREATE POLICY "Service role full access storage"
  ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'uploads')
  WITH CHECK (bucket_id = 'uploads');
