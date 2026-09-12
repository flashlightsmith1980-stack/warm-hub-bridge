CREATE TABLE public.store_reviews (
  id bigint generated always as identity primary key,
  author text not null,
  initials text not null,
  product_label text,
  rating int not null default 5 check (rating between 1 and 5),
  body text not null,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);
GRANT SELECT ON public.store_reviews TO anon;
GRANT SELECT ON public.store_reviews TO authenticated;
GRANT ALL ON public.store_reviews TO service_role;
ALTER TABLE public.store_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read published reviews" ON public.store_reviews FOR SELECT TO anon, authenticated USING (is_published);
CREATE POLICY "Admins manage reviews" ON public.store_reviews FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.store_reviews (author, initials, product_label, rating, body) VALUES
('Marcus D.', 'MD', 'Plaid Bank Log - Chase', 5, 'Delivered in under a minute, log was live and balance checked out. Been buying here for weeks now.'),
('Vera K.', 'VK', 'Premium Email Access', 5, 'Clean inbox access, no lockouts. Support replied on Telegram in two minutes.'),
('Tunde A.', 'TA', 'USDT top up', 4, 'Deposit confirmed automatically after the hash. Smooth, balance updated instantly.'),
('Sonia R.', 'SR', 'MyCheck Log', 5, 'Exactly as described in the product notes. The txt file has everything you need.'),
('Dmitri P.', 'DP', 'Calling Logs', 5, 'Great stock rotation, replacements handled with no argument. Solid vendor.'),
('Ada N.', 'AN', 'Proxy Pack', 4, 'Fast checkout from the mini app, proxies working on first test.');

ALTER TABLE public.bot_users ADD COLUMN IF NOT EXISTS web_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS bot_users_web_user_id_key ON public.bot_users(web_user_id) WHERE web_user_id IS NOT NULL;