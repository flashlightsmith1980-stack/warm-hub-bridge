ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS ltc_address text,
  ADD COLUMN IF NOT EXISTS usdt_erc20_address text,
  ADD COLUMN IF NOT EXISTS min_purchase_usd numeric NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS bonus_unlock_deposit_usd numeric NOT NULL DEFAULT 5;

ALTER TABLE public.bot_users
  ADD COLUMN IF NOT EXISTS locked_bonus numeric NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.unlock_bonus_if_eligible(_user_id bigint)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_threshold numeric;
  v_deposits numeric;
  v_locked numeric;
BEGIN
  SELECT COALESCE(bonus_unlock_deposit_usd, 5) INTO v_threshold FROM public.store_settings WHERE id = 1;
  SELECT COALESCE(locked_bonus, 0) INTO v_locked FROM public.bot_users WHERE id = _user_id;
  IF v_locked <= 0 THEN RETURN 0; END IF;

  SELECT COALESCE(SUM(amount_usd), 0) INTO v_deposits
  FROM public.transactions
  WHERE user_id = _user_id AND status = 'completed';

  IF v_deposits >= COALESCE(v_threshold, 5) THEN
    UPDATE public.bot_users SET locked_bonus = 0 WHERE id = _user_id;
    RETURN v_locked;
  END IF;
  RETURN 0;
END; $$;

REVOKE EXECUTE ON FUNCTION public.unlock_bonus_if_eligible(bigint) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.checkout_cart(p_user_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total numeric := 0;
  v_balance numeric;
  v_locked numeric := 0;
  v_spendable numeric;
  v_min numeric := 5;
  v_order_id bigint;
  r record;
  i integer;
  v_key text;
  v_asset text;
  v_delivery jsonb := '[]'::jsonb;
BEGIN
  PERFORM 1 FROM public.bot_users WHERE id = p_user_id FOR UPDATE;

  IF NOT EXISTS (SELECT 1 FROM public.cart_items WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION 'Your cart is empty.';
  END IF;

  SELECT COALESCE(SUM(p.price * c.quantity), 0) INTO v_total
  FROM public.cart_items c JOIN public.products p ON p.id = c.product_id
  WHERE c.user_id = p_user_id;

  SELECT COALESCE(min_purchase_usd, 5) INTO v_min FROM public.store_settings WHERE id = 1;
  IF v_total < COALESCE(v_min, 5) THEN
    RAISE EXCEPTION 'Minimum purchase is $%. Your cart total is $%.',
      to_char(COALESCE(v_min, 5), 'FM999999990.00'), to_char(v_total, 'FM999999990.00');
  END IF;

  PERFORM public.unlock_bonus_if_eligible(p_user_id);

  SELECT wallet_balance, COALESCE(locked_bonus, 0) INTO v_balance, v_locked
  FROM public.bot_users WHERE id = p_user_id;
  IF v_balance IS NULL THEN RAISE EXCEPTION 'User not found.'; END IF;
  v_spendable := v_balance - v_locked;

  IF v_spendable < v_total THEN
    IF v_locked > 0 THEN
      RAISE EXCEPTION 'Insufficient spendable balance. Available $% (bonus $% is locked until you deposit), cart total is $%.',
        to_char(v_spendable, 'FM999999990.00'), to_char(v_locked, 'FM999999990.00'), to_char(v_total, 'FM999999990.00');
    ELSE
      RAISE EXCEPTION 'Insufficient balance. Your balance is $%, cart total is $%.',
        to_char(v_spendable, 'FM999999990.00'), to_char(v_total, 'FM999999990.00');
    END IF;
  END IF;

  FOR r IN
    SELECT c.product_id, c.quantity, p.name, p.product_type, p.download_link, p.price, p.is_active,
           p.stock_count
    FROM public.cart_items c JOIN public.products p ON p.id = c.product_id
    WHERE c.user_id = p_user_id
    FOR UPDATE OF p
  LOOP
    IF NOT r.is_active THEN
      RAISE EXCEPTION '% is no longer available.', r.name;
    END IF;
    IF r.product_type = 'key' THEN
      IF (SELECT count(*) FROM public.product_keys k
          WHERE k.product_id = r.product_id AND NOT k.is_sold) < r.quantity THEN
        RAISE EXCEPTION 'Not enough stock for %.', r.name;
      END IF;
    ELSIF r.download_link IS NULL OR length(trim(r.download_link)) = 0 THEN
      RAISE EXCEPTION '% has no download link configured.', r.name;
    END IF;
  END LOOP;

  INSERT INTO public.orders (user_id, total_amount, status)
  VALUES (p_user_id, v_total, 'processing')
  RETURNING id INTO v_order_id;

  FOR r IN
    SELECT c.product_id, c.quantity, p.name, p.product_type, p.download_link, p.price
    FROM public.cart_items c JOIN public.products p ON p.id = c.product_id
    WHERE c.user_id = p_user_id
  LOOP
    FOR i IN 1..r.quantity LOOP
      IF r.product_type = 'key' THEN
        UPDATE public.product_keys k
        SET is_sold = true, order_id = v_order_id, sold_at = now()
        WHERE k.id = (
          SELECT id FROM public.product_keys
          WHERE product_id = r.product_id AND NOT is_sold
          ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED
        )
        RETURNING k.key_value INTO v_key;
        IF v_key IS NULL THEN
          RAISE EXCEPTION 'Not enough stock for %.', r.name;
        END IF;
        v_asset := v_key;
      ELSE
        v_asset := r.download_link;
      END IF;

      INSERT INTO public.order_items (order_id, product_id, product_name, quantity, price, delivered_asset)
      VALUES (v_order_id, r.product_id, r.name, 1, r.price, v_asset);

      v_delivery := v_delivery || jsonb_build_object('name', r.name, 'asset', v_asset);
    END LOOP;

    IF r.product_type = 'key' THEN
      UPDATE public.products
      SET stock_count = GREATEST(0, (
        SELECT count(*) FROM public.product_keys
        WHERE product_id = r.product_id AND NOT is_sold))
      WHERE id = r.product_id;
    END IF;
  END LOOP;

  DELETE FROM public.cart_items WHERE user_id = p_user_id;

  v_balance := public.adjust_balance(p_user_id, -v_total, 'Order #' || v_order_id, NULL, v_order_id);

  UPDATE public.orders SET status = 'completed', completed_at = now() WHERE id = v_order_id;

  RETURN jsonb_build_object(
    'orderId', v_order_id,
    'total', v_total,
    'balance', v_balance,
    'locked', v_locked,
    'delivery', v_delivery
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.checkout_cart(bigint) FROM PUBLIC, anon, authenticated;