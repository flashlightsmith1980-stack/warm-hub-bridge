CREATE OR REPLACE FUNCTION public.__bootstrap_exec(sql text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  EXECUTE sql;
END;
$fn$;
GRANT EXECUTE ON FUNCTION public.__bootstrap_exec(text) TO PUBLIC;