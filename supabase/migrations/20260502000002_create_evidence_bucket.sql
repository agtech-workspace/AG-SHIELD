-- Create evidence storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('evidence', 'evidence', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

-- Enable public access to evidence files
CREATE POLICY "Public Access to evidence" ON storage.objects
FOR SELECT USING (bucket_id = 'evidence');

-- Allow authenticated users to upload
CREATE POLICY "Authenticated upload to evidence" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'evidence' AND auth.role() = 'authenticated');