ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'pending';

CREATE INDEX IF NOT EXISTS idx_order_items_delivery
  ON public.order_items(order_id, delivery_status);