ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'pending';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_error text;

CREATE TABLE IF NOT EXISTS public.message_templates (
  id bigserial PRIMARY KEY,
  title text NOT NULL,
  category text NOT NULL DEFAULT 'custom',
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_templates TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.message_templates_id_seq TO authenticated;
GRANT ALL ON public.message_templates TO service_role;
GRANT ALL ON SEQUENCE public.message_templates_id_seq TO service_role;

ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage message templates" ON public.message_templates
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_message_templates_updated
  BEFORE UPDATE ON public.message_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.message_templates (title, category, body) VALUES
  ('Warm welcome', 'welcome', E'👋 Welcome to our store!\n\nBrowse the catalog, top up with BTC, USDT (TRC20) or USDC and get instant delivery 24/7.'),
  ('Thank you for your purchase', 'thanks', E'🙏 Thank you for your order!\n\nYour items were delivered instantly. Need anything else? Just tap Support.'),
  ('Daily promo', 'advertising', E'🔥 Fresh stock just landed!\n\nOpen the store now and cash out today — no delays, instant delivery.'),
  ('Payment received', 'payment', E'✅ Your payment has been confirmed and your balance is updated. Happy shopping!'),
  ('Support follow-up', 'support', E'🆘 We received your message and our team is on it. We will reply here shortly.')
ON CONFLICT DO NOTHING;