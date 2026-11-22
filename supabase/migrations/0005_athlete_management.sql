-- =============================================================================
-- 0005_athlete_management — federation edits to the registry, club requests
--
-- The federation stays the master of athlete records (confirmed decision 4).
-- This migration adds the two ways a record changes outside a full Excel
-- re-import:
--
--   * Federation staff edit, add, transfer or deactivate one athlete. Every
--     change needs a reason and is audited with its before and after values.
--   * A club PROPOSES a new athlete or a correction to one of its own athletes.
--     Nothing changes until a federation admin approves the request; the
--     approval applies the change and records which request caused it.
--
-- Both paths go through the same internal functions, so the same checks apply
-- however a record changes: valid values, no duplicate federation number, a
-- warning on a likely duplicate person, and no change that would silently move
-- an athlete out of the category of a race they are already entered in.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Internal helpers — not callable through the API
-- -----------------------------------------------------------------------------

create or replace function public.validate_athlete_values(v jsonb)
returns void
language plpgsql
immutable
set search_path = public
as $$
begin
  if coalesce(length(trim(v ->> 'full_name_ar')), 0) = 0 then
    raise exception 'The athlete''s full name is required.' using errcode = '22023';
  end if;
  if coalesce(length(trim(v ->> 'name_normalised')), 0) = 0 then
    raise exception 'name_normalised is required.' using errcode = '22023';
  end if;
  if coalesce(v ->> 'gender', '') not in ('M', 'F') then
    raise exception 'Gender must be M or F.' using errcode = '22023';
  end if;
  if v ->> 'birth_year' is not null
     and (v ->> 'birth_year' !~ '^[0-9]{4}$' or (v ->> 'birth_year')::integer not between 1920 and 2030) then
    raise exception 'Birth year % is not valid.', v ->> 'birth_year' using errcode = '22023';
  end if;
end;
$$;

-- Applies new values to an existing athlete. `v` holds the COMPLETE new record
-- (full_name_ar, name_normalised, birth_year, gender, registration_number).
create or replace function public.apply_athlete_update(athlete uuid, v jsonb, reason text, source text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.athletes%rowtype;
  clash record;
begin
  perform public.validate_athlete_values(v);
  select * into a from public.athletes where id = athlete for update;
  if not found then
    raise exception 'Athlete % does not exist.', athlete using errcode = 'P0002';
  end if;

  -- A new birth year must not move the athlete out of the category of a race
  -- they are already entered in: the start list and points would no longer
  -- match. Withdraw the entry first, then correct the record.
  if (v ->> 'birth_year')::integer is distinct from a.birth_year then
    select re.category_id, cr.name_ar, cr.race_code,
           public.category_for(e.season_id, (v ->> 'birth_year')::integer) as new_category
      into clash
    from public.race_entries re
    join public.competition_rounds cr on cr.id = re.round_id
    join public.events e on e.id = cr.event_id
    where re.athlete_id = athlete and re.status = 'active'
      and cr.status not in ('completed', 'cancelled')
      and public.category_for(e.season_id, (v ->> 'birth_year')::integer) is distinct from re.category_id
    limit 1;
    if found then
      raise exception 'Athlete % is entered in % (%) as category %; the new birth year would make them %. Withdraw that entry first.',
        a.federation_number, clash.name_ar, clash.race_code, clash.category_id, coalesce(clash.new_category, 'no category')
        using errcode = '22023';
    end if;
  end if;

  update public.athletes
    set full_name_ar = trim(v ->> 'full_name_ar'),
        name_normalised = v ->> 'name_normalised',
        birth_year = (v ->> 'birth_year')::integer,
        gender = v ->> 'gender',
        registration_number = nullif(trim(v ->> 'registration_number'), ''),
        updated_at = now()
    where id = athlete;

  insert into public.audit_log (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), 'athlete.update', 'athlete', athlete::text,
          jsonb_build_object('source', source, 'reason', reason,
            'before', jsonb_build_object('full_name_ar', a.full_name_ar, 'birth_year', a.birth_year,
                                         'gender', a.gender, 'registration_number', a.registration_number),
            'after', jsonb_build_object('full_name_ar', trim(v ->> 'full_name_ar'), 'birth_year', (v ->> 'birth_year')::integer,
                                        'gender', v ->> 'gender', 'registration_number', nullif(trim(v ->> 'registration_number'), ''))));
end;
$$;

-- Creates an athlete and their current-season membership of `club`.
create or replace function public.create_athlete(v jsonb, club uuid, reason text, source text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  number integer;
  similar_numbers text;
  season uuid;
  created uuid;
begin
  perform public.validate_athlete_values(v);
  if coalesce(v ->> 'federation_number', '') !~ '^[0-9]+$' or (v ->> 'federation_number')::integer <= 0 then
    raise exception 'A federation number is required.' using errcode = '22023';
  end if;
  number := (v ->> 'federation_number')::integer;
  if exists (select 1 from public.athletes where federation_number = number) then
    raise exception 'Federation number % is already used.', number using errcode = '23505';
  end if;

  -- Same normalised name and birth year under another number is probably the
  -- same person. Refused unless the federation confirms they are different.
  if coalesce((v ->> 'allow_similar')::boolean, false) is not true then
    select string_agg(federation_number::text, ', ') into similar_numbers
    from public.athletes
    where name_normalised = v ->> 'name_normalised'
      and birth_year is not distinct from (v ->> 'birth_year')::integer;
    if similar_numbers is not null then
      raise exception 'Possible duplicate: athlete % has the same name and birth year. Confirm they are a different person to continue.',
        similar_numbers using errcode = '23505';
    end if;
  end if;

  if club is null or not exists (select 1 from public.clubs where id = club) then
    raise exception 'Choose the athlete''s club.' using errcode = '22023';
  end if;
  select id into season from public.seasons where is_current;

  insert into public.athletes (federation_number, registration_number, full_name_ar, name_normalised, birth_year, gender)
  values (number, nullif(trim(v ->> 'registration_number'), ''), trim(v ->> 'full_name_ar'), v ->> 'name_normalised',
          (v ->> 'birth_year')::integer, v ->> 'gender')
  returning id into created;
  insert into public.club_memberships (athlete_id, club_id, season_id) values (created, club, season);

  insert into public.audit_log (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), 'athlete.create', 'athlete', created::text,
          jsonb_build_object('source', source, 'reason', reason, 'club', club, 'values', v - 'allow_similar'));
  return created;
end;
$$;

revoke all on function public.validate_athlete_values(jsonb) from public, anon, authenticated;
revoke all on function public.apply_athlete_update(uuid, jsonb, text, text) from public, anon, authenticated;
revoke all on function public.create_athlete(jsonb, uuid, text, text) from public, anon, authenticated;

create or replace function public.require_reason(reason text)
returns text
language plpgsql
immutable
as $$
begin
  if reason is null or length(trim(reason)) < 3 then
    raise exception 'Give a reason; it is kept in the audit log.' using errcode = '22023';
  end if;
  return trim(reason);
end;
$$;

-- -----------------------------------------------------------------------------
-- Federation: edit, add, transfer, deactivate
-- -----------------------------------------------------------------------------

create or replace function public.federation_update_athlete(athlete uuid, v jsonb, reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_federation_admin();
  perform public.apply_athlete_update(athlete, v, public.require_reason(reason), 'federation');
end;
$$;

create or replace function public.federation_add_athlete(v jsonb, club_code text, reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_federation_admin();
  return public.create_athlete(v, (select id from public.clubs where code = club_code), public.require_reason(reason), 'federation');
end;
$$;

-- Moves an athlete to another club for the current season. The old membership
-- is closed, never rewritten, so past results keep the club of the time.
create or replace function public.federation_transfer_athlete(athlete uuid, club_code text, reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
  season uuid;
  previous uuid;
begin
  perform public.require_federation_admin();
  perform public.require_reason(reason);
  select id into target from public.clubs where code = club_code;
  if target is null then
    raise exception 'Unknown club %.', club_code using errcode = '22023';
  end if;
  select id into season from public.seasons where is_current;
  select club_id into previous from public.club_memberships
    where athlete_id = athlete and season_id = season and valid_to is null for update;
  if previous = target then
    raise exception 'The athlete is already registered to this club.' using errcode = '22023';
  end if;
  update public.club_memberships set valid_to = current_date
    where athlete_id = athlete and season_id = season and valid_to is null;
  insert into public.club_memberships (athlete_id, club_id, season_id) values (athlete, target, season);
  insert into public.audit_log (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), 'athlete.transfer', 'athlete', athlete::text,
          jsonb_build_object('from_club', previous, 'to_club', target, 'reason', trim(reason)));
end;
$$;

create or replace function public.federation_set_athlete_active(athlete uuid, active boolean, reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_federation_admin();
  perform public.require_reason(reason);
  if not active and exists (
    select 1 from public.race_entries re join public.competition_rounds cr on cr.id = re.round_id
    where re.athlete_id = athlete and re.status = 'active' and cr.status not in ('completed', 'cancelled')
  ) then
    raise exception 'The athlete is entered in a race that has not finished. Withdraw the entry first.' using errcode = '22023';
  end if;
  update public.athletes set is_active = active, updated_at = now() where id = athlete;
  if not found then
    raise exception 'Athlete % does not exist.', athlete using errcode = 'P0002';
  end if;
  insert into public.audit_log (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), case when active then 'athlete.activate' else 'athlete.deactivate' end, 'athlete', athlete::text,
          jsonb_build_object('reason', trim(reason)));
end;
$$;

-- -----------------------------------------------------------------------------
-- Club requests — proposed by a club, decided by the federation
-- -----------------------------------------------------------------------------

create table public.athlete_requests (
  id                 uuid primary key default gen_random_uuid(),
  club_id            uuid not null references public.clubs (id),
  kind               text not null check (kind in ('new_athlete', 'correction')),
  -- The athlete to correct; null for a new athlete.
  athlete_id         uuid references public.athletes (id),
  -- Proposed values: full_name_ar, birth_year, gender, registration_number.
  proposed           jsonb not null,
  note               text,
  status             text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  submitted_by       uuid not null references public.profiles (id),
  submitted_at       timestamptz not null default now(),
  reviewed_by        uuid references public.profiles (id),
  reviewed_at        timestamptz,
  review_note        text,
  -- The athlete created or changed by an approval.
  result_athlete_id  uuid references public.athletes (id),
  check ((kind = 'correction') = (athlete_id is not null)),
  check (status <> 'rejected' or length(trim(coalesce(review_note, ''))) > 0)
);

create index athlete_requests_status_idx on public.athlete_requests (status, submitted_at);
create index athlete_requests_club_idx on public.athlete_requests (club_id);

create or replace function public.submit_athlete_request(kind text, athlete uuid, proposed jsonb, note text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  club uuid := public.current_club_id();
  allowed constant text[] := array['full_name_ar', 'birth_year', 'gender', 'registration_number'];
  key text;
  request uuid;
begin
  if club is null then
    raise exception 'Only an approved club admin can send a request.' using errcode = '42501';
  end if;
  if kind not in ('new_athlete', 'correction') then
    raise exception 'Unknown request type %.', kind using errcode = '22023';
  end if;
  if jsonb_typeof(proposed) <> 'object' or proposed = '{}'::jsonb then
    raise exception 'Say what should change.' using errcode = '22023';
  end if;
  for key in select jsonb_object_keys(proposed) loop
    if not key = any (allowed) then
      raise exception 'Field % cannot be requested.', key using errcode = '22023';
    end if;
  end loop;
  if proposed ? 'gender' and proposed ->> 'gender' not in ('M', 'F') then
    raise exception 'Gender must be M or F.' using errcode = '22023';
  end if;
  if proposed ? 'birth_year' and (proposed ->> 'birth_year' !~ '^[0-9]{4}$'
                                  or (proposed ->> 'birth_year')::integer not between 1920 and 2030) then
    raise exception 'Birth year % is not valid.', proposed ->> 'birth_year' using errcode = '22023';
  end if;
  if proposed ? 'full_name_ar' and length(trim(proposed ->> 'full_name_ar')) = 0 then
    raise exception 'The name cannot be empty.' using errcode = '22023';
  end if;

  if kind = 'correction' then
    -- Only an athlete currently registered to this club.
    if athlete is null or not exists (
      select 1 from public.club_memberships m join public.seasons s on s.id = m.season_id and s.is_current
      where m.athlete_id = athlete and m.valid_to is null and m.club_id = club
    ) then
      raise exception 'This athlete is not registered to your club.' using errcode = '42501';
    end if;
  else
    athlete := null;
    if not (proposed ? 'full_name_ar' and proposed ? 'gender' and proposed ? 'birth_year') then
      raise exception 'A new athlete needs a full name, gender and birth year.' using errcode = '22023';
    end if;
  end if;

  insert into public.athlete_requests (club_id, kind, athlete_id, proposed, note, submitted_by)
  values (club, kind, athlete, proposed, nullif(trim(note), ''), auth.uid())
  returning id into request;
  insert into public.audit_log (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), 'athlete_request.submit', 'athlete_request', request::text,
          jsonb_build_object('kind', kind, 'athlete', athlete, 'proposed', proposed));
  return request;
end;
$$;

create or replace function public.withdraw_athlete_request(request uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.athlete_requests set status = 'withdrawn'
    where id = request and club_id = public.current_club_id() and status = 'pending';
  if not found then
    raise exception 'No pending request of your club with that id.' using errcode = 'P0002';
  end if;
  insert into public.audit_log (actor_id, action, target_type, target_id)
  values (auth.uid(), 'athlete_request.withdraw', 'athlete_request', request::text);
end;
$$;

-- Approves or rejects a request. On approval `final` holds the values to apply,
-- which the reviewer may have adjusted: for a correction, the fields to change
-- (merged over the current record); for a new athlete, the whole record
-- including the federation number. name_normalised comes from the website's
-- normaliser (lib/competition/arabic.ts).
create or replace function public.review_athlete_request(request uuid, decision text, final jsonb, review_note text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  rq public.athlete_requests%rowtype;
  a public.athletes%rowtype;
  merged jsonb;
  result uuid;
begin
  perform public.require_federation_admin();
  select * into rq from public.athlete_requests where id = request for update;
  if not found then
    raise exception 'Request % does not exist.', request using errcode = 'P0002';
  end if;
  if rq.status <> 'pending' then
    raise exception 'This request is already %.', rq.status using errcode = '22023';
  end if;

  if decision = 'reject' then
    if review_athlete_request.review_note is null or length(trim(review_athlete_request.review_note)) = 0 then
      raise exception 'Give the club a reason for the rejection.' using errcode = '22023';
    end if;
    update public.athlete_requests
      set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), review_note = trim(review_athlete_request.review_note)
      where id = request;
  elsif decision = 'approve' then
    if rq.kind = 'correction' then
      select * into a from public.athletes where id = rq.athlete_id;
      merged := jsonb_build_object('full_name_ar', a.full_name_ar, 'name_normalised', a.name_normalised,
                                   'birth_year', a.birth_year, 'gender', a.gender,
                                   'registration_number', a.registration_number) || coalesce(final, '{}'::jsonb);
      perform public.apply_athlete_update(rq.athlete_id, merged, coalesce(nullif(trim(review_athlete_request.review_note), ''), 'Club request'),
                                          'club_request:' || request::text);
      result := rq.athlete_id;
    else
      result := public.create_athlete(final, rq.club_id, coalesce(nullif(trim(review_athlete_request.review_note), ''), 'Club request'),
                                      'club_request:' || request::text);
    end if;
    update public.athlete_requests
      set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(),
          review_note = nullif(trim(review_athlete_request.review_note), ''), result_athlete_id = result
      where id = request;
  else
    raise exception 'Unknown decision %.', decision using errcode = '22023';
  end if;

  insert into public.audit_log (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), 'athlete_request.' || decision, 'athlete_request', request::text,
          jsonb_build_object('final', final, 'note', review_athlete_request.review_note, 'athlete', result));
  return result;
end;
$$;

-- -----------------------------------------------------------------------------
-- Privileges and RLS
-- -----------------------------------------------------------------------------

revoke all on function public.federation_update_athlete(uuid, jsonb, text) from public, anon;
revoke all on function public.federation_add_athlete(jsonb, text, text) from public, anon;
revoke all on function public.federation_transfer_athlete(uuid, text, text) from public, anon;
revoke all on function public.federation_set_athlete_active(uuid, boolean, text) from public, anon;
revoke all on function public.submit_athlete_request(text, uuid, jsonb, text) from public, anon;
revoke all on function public.withdraw_athlete_request(uuid) from public, anon;
revoke all on function public.review_athlete_request(uuid, text, jsonb, text) from public, anon;

grant execute on function public.federation_update_athlete(uuid, jsonb, text) to authenticated;
grant execute on function public.federation_add_athlete(jsonb, text, text) to authenticated;
grant execute on function public.federation_transfer_athlete(uuid, text, text) to authenticated;
grant execute on function public.federation_set_athlete_active(uuid, boolean, text) to authenticated;
grant execute on function public.submit_athlete_request(text, uuid, jsonb, text) to authenticated;
grant execute on function public.withdraw_athlete_request(uuid) to authenticated;
grant execute on function public.review_athlete_request(uuid, text, jsonb, text) to authenticated;

alter table public.athlete_requests enable row level security;

create policy athlete_requests_staff_read on public.athlete_requests
  for select to authenticated using (public.is_federation_staff());
create policy athlete_requests_club_read on public.athlete_requests
  for select to authenticated using (club_id = public.current_club_id());
