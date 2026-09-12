ALTER TABLE public.bot_users ADD COLUMN IF NOT EXISTS welcome_bonus_granted boolean NOT NULL DEFAULT false;
UPDATE public.bot_users SET welcome_bonus_granted = true WHERE welcome_bonus_granted = false;

CREATE TABLE public.job_state (
  name text PRIMARY KEY,
  status text NOT NULL DEFAULT 'active',
  locked_until timestamptz,
  last_run_at timestamptz,
  last_result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.job_state TO service_role;
ALTER TABLE public.job_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read job state" ON public.job_state FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
GRANT SELECT ON public.job_state TO authenticated;
CREATE TRIGGER trg_job_state_updated BEFORE UPDATE ON public.job_state FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.daily_promo_log (
  id bigserial PRIMARY KEY,
  run_date date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  user_id bigint NOT NULL REFERENCES public.bot_users(id) ON DELETE CASCADE,
  sent boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_date, user_id)
);
GRANT ALL ON public.daily_promo_log TO service_role;
ALTER TABLE public.daily_promo_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read daily promo log" ON public.daily_promo_log FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
GRANT SELECT ON public.daily_promo_log TO authenticated;

INSERT INTO public.job_state (name) VALUES ('daily_promo') ON CONFLICT (name) DO NOTHING;