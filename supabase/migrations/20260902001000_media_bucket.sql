insert into storage.buckets (id, name, public)
values ('media', 'media', false)
on conflict (id) do nothing;

create policy "Admins upload media" on storage.objects
for insert to authenticated
with check (bucket_id = 'media' and public.has_role(auth.uid(), 'admin'::public.app_role));

create policy "Admins manage media" on storage.objects
for update to authenticated
using (bucket_id = 'media' and public.has_role(auth.uid(), 'admin'::public.app_role))
with check (bucket_id = 'media' and public.has_role(auth.uid(), 'admin'::public.app_role));