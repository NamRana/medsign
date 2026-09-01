-- Migration 008: Storage bucket for medical image uploads
--
-- NOTE: Supabase Storage buckets are typically created via the Dashboard or CLI,
-- not through SQL migrations. The SQL below uses Supabase's internal storage
-- schema and may need to be run via the Dashboard SQL editor or adapted for
-- your deployment method.
--
-- To create manually via Dashboard:
--   1. Go to Storage in your Supabase project
--   2. Create a new bucket named "medical-uploads"
--   3. Set it to private (not public)
--   4. Add the RLS policies below via SQL editor

-- Create the storage bucket (if using SQL approach)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'medical-uploads',
    'medical-uploads',
    false,
    10485760,  -- 10 MB
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- RLS Policy: Users can upload to their own folder
CREATE POLICY "Users can upload to own folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'medical-uploads'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

-- RLS Policy: Users can read their own uploads
CREATE POLICY "Users can read own uploads"
ON storage.objects
FOR SELECT
TO authenticated
USING (
    bucket_id = 'medical-uploads'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

-- RLS Policy: Users can delete their own uploads
CREATE POLICY "Users can delete own uploads"
ON storage.objects
FOR DELETE
TO authenticated
USING (
    bucket_id = 'medical-uploads'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

-- RLS Policy: Service role has full access (for backend operations)
CREATE POLICY "Service role full access"
ON storage.objects
FOR ALL
TO service_role
USING (bucket_id = 'medical-uploads')
WITH CHECK (bucket_id = 'medical-uploads');
