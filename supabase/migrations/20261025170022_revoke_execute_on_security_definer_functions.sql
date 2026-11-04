/*
# Revoke EXECUTE on SECURITY DEFINER functions from authenticated

Both `generate_referral_code` and `handle_new_user` are SECURITY DEFINER
functions that should only run internally (via trigger or by service_role).
Authenticated users should not be able to call them directly via the REST API.

This migration revokes EXECUTE from PUBLIC and authenticated, keeping only
service_role access. The trigger on auth.users still works because triggers
execute with the function's SECURITY DEFINER privileges regardless of caller.
*/

REVOKE EXECUTE ON FUNCTION generate_referral_code(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION handle_new_user() FROM authenticated;
