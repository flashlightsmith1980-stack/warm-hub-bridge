-- Storage policies for the media library (admin-managed images)
CREATE POLICY "Admins upload media" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'media' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update media" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'media' AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (bucket_id = 'media' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete media" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'media' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins read media" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'media' AND public.has_role(auth.uid(), 'admin'));

-- Daily promotional broadcast
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

SELECT cron.unschedule('daily-store-promo') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'daily-store-promo'
);

SELECT cron.schedule(
  'daily-store-promo',
  '0 15 * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--b2e5599e-1e7c-4c0b-8754-7ef9ce0297d8.lovable.app/api/public/hooks/daily-promo',
    headers := '{"Content-Type":"application/json","apikey":"sb_publishable_ow6f0G4EWx6Lk-osNUQ0Mw_LuEqyhtk"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);