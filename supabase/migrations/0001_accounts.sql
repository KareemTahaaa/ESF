-- =============================================================================
-- 0001_accounts — clubs, accounts, approval, audit log
--
-- Clubs create their own accounts. A new account is INERT: it is created as a
-- pending club admin with no club, and sees nothing until a federation admin
-- approves it and links it to its club. This stops anyone registering in a
-- club's name and reading that club's athletes.
--
-- Security rules this migration enforces:
--   * Role and status come from column defaults only — never from signup
--     metadata, which the signing-up user controls.
--   * Nobody can update their own profile row (no self-update policy), so a
--     user cannot change their own role, status or club.
--   * Approval, rejection and suspension happen only through
--     review_club_account(), which checks the caller is an approved federation
--     admin and writes the audit entry in the same transaction.
--   * The audit log is append-only: no update or delete policy exists.
-- =============================================================================

create extension if not exists pgcrypto;

create type public.account_role as enum ('federation_admin', 'results_official', 'club_admin');
create type public.account_status as enum ('pending', 'approved', 'rejected', 'suspended');

-- -----------------------------------------------------------------------------
-- Clubs
-- -----------------------------------------------------------------------------

create table public.clubs (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (code ~ '^[A-Z]{2,6}$'),
  name_ar     text not null unique,
  is_foreign  boolean not null default false,
  created_at  timestamptz not null default now()
);

comment on table public.clubs is
  'Clubs registered with the federation. Seeded from the Club Codes sheet of Egypt Skate Database.xlsm.';

-- -----------------------------------------------------------------------------
-- Profiles — one per auth user
-- -----------------------------------------------------------------------------

create table public.profiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  email              text not null,
  full_name          text not null,
  phone              text,
  position           text,
  role               public.account_role not null default 'club_admin',
  status             public.account_status not null default 'pending',
  -- The club the person SAYS they represent. Unverified until approval.
  requested_club_id  uuid references public.clubs (id),
  -- The club the federation CONFIRMED. Only this grants access to club data.
  club_id            uuid references public.clubs (id),
  rejection_reason   text,
  reviewed_by        uuid references public.profiles (id),
  reviewed_at        timestamptz,
  created_at         timestamptz not null default now(),

  constraint approved_club_admin_has_club
    check (role <> 'club_admin' or status <> 'approved' or club_id is not null),
  constraint rejection_has_reason
    check (status <> 'rejected' or (rejection_reason is not null and length(trim(rejection_reason)) > 0))
);

create index profiles_status_idx on public.profiles (status);
create index profiles_club_idx on public.profiles (club_id);

-- -----------------------------------------------------------------------------
-- Audit log — append-only
-- -----------------------------------------------------------------------------

create table public.audit_log (
  id           bigint generated always as identity primary key,
  actor_id     uuid references public.profiles (id),
  action       text not null,
  target_type  text not null,
  target_id    text not null,
  detail       jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index audit_log_target_idx on public.audit_log (target_type, target_id);

-- -----------------------------------------------------------------------------
-- Helper functions used by policies
-- -----------------------------------------------------------------------------

create or replace function public.is_federation_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'federation_admin' and status = 'approved'
  );
$$;

-- The club an approved club admin may act for, or null for everyone else.
create or replace function public.current_club_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select club_id from public.profiles
  where id = auth.uid() and role = 'club_admin' and status = 'approved';
$$;

-- -----------------------------------------------------------------------------
-- New signups become pending club admins
-- -----------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested uuid;
begin
  -- Only the requested club is read from metadata, and only as a request. An
  -- unknown code simply leaves it null for the approver to set.
  select id into requested from public.clubs
  where code = new.raw_user_meta_data ->> 'requested_club_code';

  -- role and status are deliberately NOT supplied: they take their defaults
  -- ('club_admin', 'pending'), whatever the signup request contained.
  insert into public.profiles (id, email, full_name, phone, position, requested_club_id)
  values (
    new.id,
    new.email,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), new.email),
    nullif(trim(new.raw_user_meta_data ->> 'phone'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'position'), ''),
    requested
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Federation review of a club account — atomic and audited
-- -----------------------------------------------------------------------------

create or replace function public.review_club_account(
  target_profile uuid,
  decision       text,
  confirmed_club uuid default null,
  reason         text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.profiles%rowtype;
begin
  if not public.is_federation_admin() then
    raise exception 'Only an approved federation admin can review club accounts.'
      using errcode = '42501';
  end if;

  select * into target from public.profiles where id = target_profile for update;
  if not found then
    raise exception 'Account % does not exist.', target_profile using errcode = 'P0002';
  end if;
  if target.role <> 'club_admin' then
    raise exception 'Only club admin accounts are reviewed here.' using errcode = '22023';
  end if;

  if decision = 'approve' then
    if confirmed_club is null then
      raise exception 'Choose the club this account represents before approving.' using errcode = '22023';
    end if;
    update public.profiles
      set status = 'approved', club_id = confirmed_club, rejection_reason = null,
          reviewed_by = auth.uid(), reviewed_at = now()
      where id = target_profile;
  elsif decision = 'reject' then
    if reason is null or length(trim(reason)) = 0 then
      raise exception 'Give a reason when rejecting an account.' using errcode = '22023';
    end if;
    update public.profiles
      set status = 'rejected', club_id = null, rejection_reason = trim(reason),
          reviewed_by = auth.uid(), reviewed_at = now()
      where id = target_profile;
  elsif decision = 'suspend' then
    update public.profiles
      set status = 'suspended', reviewed_by = auth.uid(), reviewed_at = now()
      where id = target_profile;
  else
    raise exception 'Unknown decision %.', decision using errcode = '22023';
  end if;

  insert into public.audit_log (actor_id, action, target_type, target_id, detail)
  values (
    auth.uid(),
    'club_account.' || decision,
    'profile',
    target_profile::text,
    jsonb_build_object(
      'previous_status', target.status,
      'requested_club_id', target.requested_club_id,
      'confirmed_club_id', confirmed_club,
      'reason', reason
    )
  );
end;
$$;

revoke all on function public.review_club_account(uuid, text, uuid, text) from public;
grant execute on function public.review_club_account(uuid, text, uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------

alter table public.clubs enable row level security;
alter table public.profiles enable row level security;
alter table public.audit_log enable row level security;

-- Club names and codes are public: the signup form lists them.
create policy clubs_read on public.clubs
  for select to anon, authenticated using (true);

create policy clubs_federation_manage on public.clubs
  for all to authenticated
  using (public.is_federation_admin())
  with check (public.is_federation_admin());

-- A person can read their own account, so the pending screen can show status.
create policy profiles_read_own on public.profiles
  for select to authenticated using (id = auth.uid());

-- Federation admins can read every account, for the approval queue.
create policy profiles_federation_read on public.profiles
  for select to authenticated using (public.is_federation_admin());

-- Deliberately NO insert, update or delete policy on profiles: rows are
-- created by the signup trigger and changed only by review_club_account().

create policy audit_federation_read on public.audit_log
  for select to authenticated using (public.is_federation_admin());

-- Deliberately NO insert, update or delete policy on audit_log for users:
-- entries are written only inside security-definer functions.

-- -----------------------------------------------------------------------------
-- Seed clubs — from the Club Codes sheet; keep in step with lib/competition/clubs.ts
-- -----------------------------------------------------------------------------

insert into public.clubs (code, name_ar, is_foreign) values
  ('WDC',  'وادي دجلة',              false),
  ('TGC',  'طلائع الجيش',            false),
  ('SSC',  'الشمس',                  false),
  ('ZSC',  'الزهور',                 false),
  ('AERO', 'ايروسبورت',              false),
  ('MSC',  'المقطم',                 false),
  ('MYC',  'مركز شباب المدينة',      false),
  ('OSC',  'العبور',                 false),
  ('NCSC', 'مدينة نصر',              false),
  ('CITY', 'سيتي كلوب',              false),
  ('AESC', 'الصيد بالاسكندرية',      false),
  ('SUD',  'الاتحاد السوداني العام', true),
  ('NPC',  'النصر للبترول',          false);
