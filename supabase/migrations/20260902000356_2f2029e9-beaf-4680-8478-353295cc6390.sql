REVOKE EXECUTE ON FUNCTION public.adjust_balance(bigint, numeric, text, bigint, bigint) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.checkout_cart(bigint) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.adjust_balance(bigint, numeric, text, bigint, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.checkout_cart(bigint) TO service_role;