-- Mini App login credentials on the Telegram store account
ALTER TABLE public.bot_users
  ADD COLUMN IF NOT EXISTS login_username text,
  ADD COLUMN IF NOT EXISTS password_hash text,
  ADD COLUMN IF NOT EXISTS password_salt text,
  ADD COLUMN IF NOT EXISTS credentials_sent_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS idx_bot_users_login_username
  ON public.bot_users (lower(login_username)) WHERE login_username IS NOT NULL;

-- Mini App sessions (username/password login outside Telegram)
CREATE TABLE IF NOT EXISTS public.miniapp_sessions (
  id bigserial PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES public.bot_users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 days'
);
GRANT ALL ON public.miniapp_sessions TO service_role;
ALTER TABLE public.miniapp_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage miniapp sessions" ON public.miniapp_sessions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Private notes from the admin to a single store user
CREATE TABLE IF NOT EXISTS public.user_notes (
  id bigserial PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES public.bot_users(id) ON DELETE CASCADE,
  subject text,
  body text NOT NULL,
  sent_to_telegram boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_notes_user ON public.user_notes (user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_notes TO authenticated;
GRANT ALL ON public.user_notes TO service_role;
ALTER TABLE public.user_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage user notes" ON public.user_notes
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));