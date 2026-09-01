-- Create or repair the private storage bucket used by lab reports and images.
-- The lab-report API accepts PDF, JPEG, PNG, and WebP files up to 20 MB.

INSERT INTO storage.buckets (
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
)
VALUES (
    'medical-uploads',
    'medical-uploads',
    false,
    20971520,
    ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;
