-- =============================================================================
-- 0007_require_reason_search_path — pin the search path of require_reason()
--
-- Every other function sets search_path; this one (added in 0005) did not,
-- which the Supabase security advisor flags (lint 0011). It only checks a text
-- argument, so there was no exposure, but it is fixed for consistency.
-- =============================================================================

alter function public.require_reason(text) set search_path = public;
