-- =============================================================================
-- 0004_function_grants — no security-definer function is callable while signed out
--
-- Supabase grants EXECUTE on new public functions to `anon` explicitly, so the
-- `revoke ... from public` in 0001 left these callable by signed-out visitors
-- (flagged by the Supabase security advisor, lint 0028). None of them returned
-- anything useful to anon — each checks auth.uid() — but they are not meant to
-- be part of the public API.
--
-- handle_new_user() is a trigger function: triggers run whatever its grants,
-- so nobody needs to call it directly.
-- =============================================================================

revoke execute on function public.is_federation_admin() from public, anon;
revoke execute on function public.is_federation_staff() from public, anon;
revoke execute on function public.current_club_id() from public, anon;
revoke execute on function public.review_club_account(uuid, text, uuid, text) from public, anon;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

grant execute on function public.is_federation_admin() to authenticated;
grant execute on function public.is_federation_staff() to authenticated;
grant execute on function public.current_club_id() to authenticated;
