-- =============================================================================
-- Test-only stand-in for the parts of Supabase the migrations depend on.
--
-- Loaded BEFORE the migrations, in PGlite, by supabase/tests/harness.ts. Never
-- run against a real Supabase project: there these objects already exist.
--
-- Mirrors Supabase where it matters for security:
--   * auth.uid() reads the JWT subject from the request settings, as PostgREST
--     sets it per request.
--   * The anon and authenticated roles get Supabase's default grants on the
--     public schema, so Row Level Security — not missing privileges — is what
--     the tests exercise.
-- =============================================================================

create role anon nologin;
create role authenticated nologin;

create schema auth;
grant usage on schema auth to anon, authenticated;

create table auth.users (
  id                  uuid primary key,
  email               text,
  raw_user_meta_data  jsonb not null default '{}'::jsonb
);

create function auth.uid() returns uuid
language sql stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

grant execute on function auth.uid() to anon, authenticated;

grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
