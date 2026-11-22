-- =============================================================================
-- 0009_qualified_registration — clubs register qualified athletes for the
-- first League / Cup round (federation answer to OPEN_QUESTIONS Q12)
--
-- The federation's rule: athletes ranked A in the Qualifications go to the
-- level A round (round of 16 / 24 / the 200m final of 12) — but only those
-- whose club registers them. If fewer register than the round holds, the best
-- registered level B athletes, by qualification time, are promoted to fill it.
-- Level B then runs with the registered B athletes who were not promoted.
--
-- So the first round after the Qualifications is now registered for, like the
-- Qualifications themselves:
--
--   * a round "takes qualified entries" when it is an advancement round, not
--     level B, and its prerequisite is a Qualifications round;
--   * clubs enter athletes into that round while registration is open; an
--     athlete can only be entered if they raced in the approved Qualification
--     results;
--   * level B has no registration of its own: it uses the entries of the level
--     A round of the same race;
--   * publish_start_list() refuses any athlete on such a list who is not
--     registered, and refuses level B while level A registration is still open.
--
-- Who goes into level A and who is promoted is decided by the rules engine
-- (lib/competition/advancement.ts); the database checks membership.
-- Later rounds (quarter-finals onwards) are still filled automatically from
-- approved results, with no registration.
-- =============================================================================

-- Rounds clubs register for although their field comes from earlier results.
create or replace function public.takes_qualified_entries(cr public.competition_rounds)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select cr.entry_mode = 'advancement'
     and cr.round_key <> 'level_b'
     and exists (select 1 from public.round_prerequisites p
                   join public.competition_rounds q on q.id = p.prerequisite_round_id
                  where p.round_id = cr.id and q.round_key = 'qualification')
$$;

-- The round whose club entries decide this round's field: itself for a level A
-- round taking qualified entries, the level A round of the same race for level
-- B, and null for every other advancement round.
create or replace function public.entry_round_for(round uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cr public.competition_rounds%rowtype;
  sibling uuid;
begin
  select * into cr from public.competition_rounds where id = round;
  if not found or cr.entry_mode <> 'advancement' then
    return null;
  end if;
  if public.takes_qualified_entries(cr) then
    return cr.id;
  end if;
  if cr.round_key = 'level_b' then
    select s.id into sibling from public.competition_rounds s
     where s.event_id = cr.event_id and s.catalogue_number = cr.catalogue_number and s.id <> cr.id
       and public.takes_qualified_entries(s)
     limit 1;
    return sibling;
  end if;
  return null;
end;
$$;

-- -----------------------------------------------------------------------------
-- Status changes: qualified-entry rounds open for registration like club rounds
-- -----------------------------------------------------------------------------

create or replace function public.set_round_status(
  round       uuid,
  new_status  public.round_status,
  reason      text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cr public.competition_rounds%rowtype;
  blocking text[];
  allowed boolean;
  registered boolean;
begin
  perform public.require_federation_admin();
  select * into cr from public.competition_rounds where id = round for update;
  if not found then
    raise exception 'Round % does not exist.', round using errcode = 'P0002';
  end if;
  registered := cr.entry_mode = 'registration' or public.takes_qualified_entries(cr);

  -- Checked first, so the message names what the round is waiting for.
  if cr.status = 'draft' and new_status <> 'cancelled' then
    blocking := public.incomplete_prerequisites(round);
    if array_length(blocking, 1) > 0 then
      raise exception 'This round cannot start until its prerequisite rounds have approved results: %.',
        array_to_string(blocking, '; ') using errcode = '22023';
    end if;
  end if;


  allowed := case
    when new_status = 'cancelled' then cr.status not in ('completed', 'cancelled')
    when cr.status = 'draft' and new_status = 'registration_open' then registered
    when cr.status = 'draft' and new_status = 'registration_closed' then not registered
    when cr.status = 'registration_open' and new_status = 'registration_closed' then true
    when cr.status = 'registration_closed' and new_status = 'registration_open' then registered
    when cr.status = 'registration_closed' and new_status = 'start_list_published' then true
    when cr.status = 'start_list_published' and new_status = 'results_submitted' then true
    when cr.status = 'results_submitted' and new_status in ('completed', 'start_list_published') then true
    else false
  end;
  if not allowed then
    raise exception 'A round cannot move from % to %.', cr.status, new_status using errcode = '22023';
  end if;

  if new_status = 'cancelled' or (cr.status = 'registration_closed' and new_status = 'registration_open') then
    if reason is null or length(trim(reason)) = 0 then
      raise exception 'Give a reason for this change.' using errcode = '22023';
    end if;
  end if;

  if new_status = 'registration_open' then
    if cr.registration_deadline is null then
      raise exception 'Set a registration deadline before opening registration.' using errcode = '22023';
    end if;
    if cr.registration_deadline <= now() then
      raise exception 'The registration deadline has already passed. Set a new deadline first.' using errcode = '22023';
    end if;
  end if;

  update public.competition_rounds set status = new_status, status_changed_at = now() where id = round;
  insert into public.audit_log (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), 'round.status', 'competition_round', round::text,
          jsonb_build_object('from', cr.status, 'to', new_status, 'reason', reason));
end;
$$;

-- -----------------------------------------------------------------------------
-- Entry checks: a qualified-entry round admits only athletes who raced in the
-- approved Qualification results
-- -----------------------------------------------------------------------------

create or replace function public.check_entry(cr public.competition_rounds, athlete_id uuid, for_club uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  a public.athletes%rowtype;
  season uuid;
  category text;
begin
  select e.season_id into season from public.events e where e.id = cr.event_id;
  select * into a from public.athletes where id = athlete_id;
  if not found then
    raise exception 'Athlete % does not exist.', athlete_id using errcode = 'P0002';
  end if;
  if not a.is_active then
    raise exception 'Athlete % (%) is not active in the federation registry.', a.federation_number, a.full_name_ar
      using errcode = '22023';
  end if;
  if not exists (select 1 from public.club_memberships m
                 where m.athlete_id = a.id and m.season_id = season and m.valid_to is null and m.club_id = for_club) then
    raise exception 'Athlete % (%) is not registered to this club for the season.', a.federation_number, a.full_name_ar
      using errcode = '42501';
  end if;
  if a.birth_year is null then
    raise exception 'Athlete % (%) has no birth year on record, so their age category cannot be set. The federation must complete the record first.',
      a.federation_number, a.full_name_ar using errcode = '22023';
  end if;
  category := public.category_for(season, a.birth_year);
  if category is null then
    raise exception 'Athlete % (%) is in no age category this season (born %).', a.federation_number, a.full_name_ar, a.birth_year
      using errcode = '22023';
  end if;
  if public.takes_qualified_entries(cr) then
    if not exists (select 1 from public.round_prerequisites p
                     join public.result_sets rs on rs.round_id = p.prerequisite_round_id and rs.status in ('approved', 'published')
                     join public.result_lines l on l.result_set_id = rs.id and l.athlete_id = a.id
                    where p.round_id = cr.id) then
      raise exception 'Athlete % (%) did not race in the approved Qualification results for this race.', a.federation_number, a.full_name_ar
        using errcode = '22023';
    end if;
    if coalesce(array_length(cr.eligible_categories, 1), 0) > 0 and not (category = any (cr.eligible_categories)) then
      raise exception 'Athlete % (%) is not eligible for this race (category %).', a.federation_number, a.full_name_ar,
        coalesce(category, 'unknown') using errcode = '22023';
    end if;
  elsif not (category = any (cr.eligible_categories)) then
    raise exception 'Athlete % (%) is not eligible for this race (category %).', a.federation_number, a.full_name_ar,
      category using errcode = '22023';
  end if;
  if exists (select 1 from public.race_entries re
             where re.round_id = cr.id and re.athlete_id = a.id and re.status = 'active') then
    raise exception 'Athlete % (%) is already entered in this race.', a.federation_number, a.full_name_ar
      using errcode = '23505';
  end if;
  return category;
end;
$$;

create or replace function public.submit_race_entries(round uuid, athlete_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  club uuid := public.current_club_id();
  cr public.competition_rounds%rowtype;
  athlete uuid;
  category text;
  n integer := 0;
begin
  if club is null then
    raise exception 'Only an approved club admin can enter athletes.' using errcode = '42501';
  end if;
  select * into cr from public.competition_rounds where id = round for share;
  if not found or cr.status = 'draft' then
    raise exception 'This race is not open for registration.' using errcode = 'P0002';
  end if;
  if not (cr.entry_mode = 'registration' or public.takes_qualified_entries(cr)) or cr.status <> 'registration_open' then
    raise exception 'This race is not open for registration.' using errcode = '22023';
  end if;
  if now() > cr.registration_deadline then
    raise exception 'The registration deadline for this race has passed (%). Contact the federation.',
      to_char(cr.registration_deadline at time zone 'Africa/Cairo', 'YYYY-MM-DD HH24:MI') using errcode = '22023';
  end if;
  if coalesce(array_length(athlete_ids, 1), 0) = 0 then
    raise exception 'Select at least one athlete.' using errcode = '22023';
  end if;

  foreach athlete in array athlete_ids loop
    category := public.check_entry(cr, athlete, club);
    insert into public.race_entries (round_id, athlete_id, club_id, category_id, submitted_by)
    values (round, athlete, club, category, auth.uid());
    n := n + 1;
  end loop;

  insert into public.audit_log (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), 'entry.submit', 'competition_round', round::text,
          jsonb_build_object('club', club, 'athletes', athlete_ids));
  return n;
end;
$$;

create or replace function public.federation_enter_athlete(round uuid, athlete uuid, reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  cr public.competition_rounds%rowtype;
  club uuid;
  category text;
  entry uuid;
begin
  perform public.require_federation_admin();
  if reason is null or length(trim(reason)) = 0 then
    raise exception 'Give a reason for entering an athlete outside the normal registration.' using errcode = '22023';
  end if;
  select * into cr from public.competition_rounds where id = round for share;
  if not found then
    raise exception 'Round % does not exist.', round using errcode = 'P0002';
  end if;
  if not (cr.entry_mode = 'registration' or public.takes_qualified_entries(cr))
     or cr.status not in ('registration_open', 'registration_closed') then
    raise exception 'Entries can only be changed before the start list is published.' using errcode = '22023';
  end if;
  select m.club_id into club from public.club_memberships m join public.events e on e.season_id = m.season_id
    where m.athlete_id = athlete and m.valid_to is null and e.id = cr.event_id;
  if club is null then
    raise exception 'Athlete has no current club for this season.' using errcode = '22023';
  end if;
  category := public.check_entry(cr, athlete, club);
  insert into public.race_entries (round_id, athlete_id, club_id, category_id, submitted_by, exception_reason)
  values (round, athlete, club, category, auth.uid(), trim(reason))
  returning id into entry;
  insert into public.audit_log (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), 'entry.federation_exception', 'race_entry', entry::text,
          jsonb_build_object('round', round, 'athlete', athlete, 'reason', reason,
                             'deadline', cr.registration_deadline, 'round_status', cr.status));
  return entry;
end;
$$;

-- -----------------------------------------------------------------------------
-- Publishing: as 0008, plus the registration check for qualified-entry rounds
-- and their level B
-- -----------------------------------------------------------------------------

create or replace function public.publish_start_list(round uuid, payload jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  cr public.competition_rounds%rowtype;
  next_version integer;
  list uuid;
  listed uuid[];
  expected uuid[];
  blocking text[];
  given_sources text[];
  current_sources text[];
  sets uuid[];
  stray integer;
  republish boolean;
  cleared boolean := false;
  entries_from uuid;
  entries_status public.round_status;
begin
  perform public.require_federation_admin();
  select * into cr from public.competition_rounds where id = round for update;
  if not found then
    raise exception 'Round % does not exist.', round using errcode = 'P0002';
  end if;
  republish := cr.status = 'start_list_published';
  if republish then
    if (public.live_result_set(round)).id is not null then
      raise exception 'Results have been entered for this round; its start list can no longer be replaced.' using errcode = '22023';
    end if;
  elsif cr.status <> 'registration_closed' then
    raise exception 'Close registration before publishing the start list.' using errcode = '22023';
  end if;
  if coalesce((payload ->> 'official')::boolean, false) is not true then
    raise exception 'This start list is not official: %. It cannot be published until the federation resolves it.',
      coalesce((select string_agg(b ->> 'openQuestion', ', ') from jsonb_array_elements(payload -> 'blockers') b), 'unknown reason')
      using errcode = '22023';
  end if;
  if payload ->> 'rulesetVersion' is distinct from cr.ruleset_version then
    raise exception 'The start list was generated with ruleset %, but the round uses %.',
      payload ->> 'rulesetVersion', cr.ruleset_version using errcode = '22023';
  end if;

  create temporary table if not exists pg_temp.publishing_lanes (
    athlete_id uuid, event_number integer, category_id text, heat_number integer, lane integer, seed integer, club_code text
  ) on commit drop;
  truncate pg_temp.publishing_lanes;
  insert into pg_temp.publishing_lanes (athlete_id, event_number, category_id, heat_number, lane, seed)
  select (lane -> 'entrant' ->> 'athleteId')::uuid, (g ->> 'eventNumber')::integer, g ->> 'categoryId',
         (h ->> 'heatNumber')::integer, (lane ->> 'lane')::integer, (lane ->> 'seed')::integer
  from jsonb_array_elements(payload -> 'groups') g,
       jsonb_array_elements(g -> 'heats') h,
       jsonb_array_elements(h -> 'lanes') lane;

  select coalesce(array_agg(athlete_id order by athlete_id), '{}') into listed from pg_temp.publishing_lanes;
  if coalesce(array_length(listed, 1), 0) = 0 then
    raise exception 'This round has no athletes to start.' using errcode = '22023';
  end if;
  if (select count(distinct athlete_id) from pg_temp.publishing_lanes) <> array_length(listed, 1) then
    raise exception 'An athlete appears more than once on the start list.' using errcode = '22023';
  end if;

  if cr.entry_mode = 'registration' then
    select coalesce(array_agg(athlete_id order by athlete_id), '{}') into expected
    from public.race_entries where round_id = round and status = 'active';
    if listed is distinct from expected then
      raise exception 'The start list does not match the entries for this round (% listed, % entered). Regenerate it.',
        coalesce(array_length(listed, 1), 0), coalesce(array_length(expected, 1), 0) using errcode = '22023';
    end if;
    update pg_temp.publishing_lanes pl set club_code = c.code
      from public.race_entries re join public.clubs c on c.id = re.club_id
     where re.round_id = round and re.athlete_id = pl.athlete_id and re.status = 'active';
  else
    if not exists (select 1 from public.round_prerequisites where round_id = round) then
      raise exception 'This round has no prerequisite round to take its athletes from.' using errcode = '22023';
    end if;
    blocking := public.incomplete_prerequisites(round);
    if array_length(blocking, 1) > 0 then
      raise exception 'The results of % are not approved.', array_to_string(blocking, '; ') using errcode = '22023';
    end if;

    select coalesce(array_agg((s ->> 'roundId') || '/' || (s ->> 'resultSetId')
                              order by (s ->> 'roundId') || '/' || (s ->> 'resultSetId')), '{}') into given_sources
      from jsonb_array_elements(coalesce(payload -> 'sources', '[]'::jsonb)) s;
    select coalesce(array_agg(p.prerequisite_round_id::text || '/' || rs.id::text
                              order by p.prerequisite_round_id::text || '/' || rs.id::text), '{}'),
           coalesce(array_agg(rs.id), '{}')
      into current_sources, sets
      from public.round_prerequisites p
      join public.result_sets rs on rs.round_id = p.prerequisite_round_id and rs.status in ('approved', 'published')
     where p.round_id = round;
    if given_sources is distinct from current_sources then
      raise exception 'The start list was built from results that are no longer the approved ones. Regenerate it.' using errcode = '22023';
    end if;

    update pg_temp.publishing_lanes pl set club_code = l.club_code
      from public.result_lines l
     where l.result_set_id = any (sets) and l.athlete_id = pl.athlete_id;
    select count(*) into stray from pg_temp.publishing_lanes where club_code is null;
    if stray > 0 then
      raise exception '% athlete(s) on the start list did not race in the approved prerequisite results.', stray using errcode = '22023';
    end if;

    -- Q12: the first round after the Qualifications takes only registered athletes.
    entries_from := public.entry_round_for(round);
    if entries_from is not null then
      if entries_from <> round then
        select status into entries_status from public.competition_rounds where id = entries_from;
        if entries_status in ('draft', 'registration_open') then
          raise exception 'Close registration for the level A round of this race first: level B takes the registered athletes who are not in level A.'
            using errcode = '22023';
        end if;
      end if;
      select count(*) into stray from pg_temp.publishing_lanes pl
       where not exists (select 1 from public.race_entries re
                          where re.round_id = entries_from and re.athlete_id = pl.athlete_id and re.status = 'active');
      if stray > 0 then
        raise exception '% athlete(s) on the start list are not registered for this race.', stray using errcode = '22023';
      end if;
    end if;
  end if;

  update public.start_lists set superseded_at = now() where round_id = round and superseded_at is null;
  select coalesce(max(version), 0) + 1 into next_version from public.start_lists where round_id = round;
  insert into public.start_lists (round_id, version, ruleset_version, payload, published_by)
  values (round, next_version, cr.ruleset_version, payload, auth.uid())
  returning id into list;

  insert into public.start_list_lanes (start_list_id, athlete_id, event_number, category_id, heat_number, lane, seed, club_code)
  select list, athlete_id, event_number, category_id, heat_number, lane, seed, club_code from pg_temp.publishing_lanes;

  if not republish then
    perform set_config('esf.publishing_start_list', round::text, true);
    update public.competition_rounds set status = 'start_list_published', status_changed_at = now() where id = round;
  end if;
  if cr.needs_review and cr.entry_mode = 'advancement' then
    update public.competition_rounds set needs_review = false, review_reason = null where id = round;
    cleared := true;
  end if;
  insert into public.audit_log (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), 'start_list.publish', 'competition_round', round::text,
          jsonb_build_object('version', next_version, 'athletes', array_length(listed, 1),
                             'sources', payload -> 'sources', 'review_cleared', cleared,
                             'entries_from', entries_from));
  return next_version;
end;
$$;

-- The caller's own athletes who may be entered in a qualified-entry round: they
-- raced in its approved Qualification results and are in the caller's club now.
-- Clubs cannot read result lines before they are published, so the entry page
-- asks here.
create or replace function public.qualified_club_athletes(round uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select distinct l.athlete_id
    from public.competition_rounds cr
    join public.events e on e.id = cr.event_id
    join public.round_prerequisites p on p.round_id = cr.id
    join public.result_sets rs on rs.round_id = p.prerequisite_round_id and rs.status in ('approved', 'published')
    join public.result_lines l on l.result_set_id = rs.id
    join public.club_memberships m on m.athlete_id = l.athlete_id and m.season_id = e.season_id and m.valid_to is null
   where cr.id = round
     and public.takes_qualified_entries(cr)
     and m.club_id = public.current_club_id()
$$;

revoke all on function public.qualified_club_athletes(uuid) from public, anon;
grant execute on function public.qualified_club_athletes(uuid) to authenticated;
revoke all on function public.takes_qualified_entries(public.competition_rounds) from public, anon, authenticated;
revoke all on function public.entry_round_for(uuid) from public, anon;
grant execute on function public.entry_round_for(uuid) to authenticated;
revoke all on function public.set_round_status(uuid, public.round_status, text) from public, anon;
grant execute on function public.set_round_status(uuid, public.round_status, text) to authenticated;
revoke all on function public.check_entry(public.competition_rounds, uuid, uuid) from public, anon, authenticated;
revoke all on function public.submit_race_entries(uuid, uuid[]) from public, anon;
grant execute on function public.submit_race_entries(uuid, uuid[]) to authenticated;
revoke all on function public.federation_enter_athlete(uuid, uuid, text) from public, anon;
grant execute on function public.federation_enter_athlete(uuid, uuid, text) to authenticated;
revoke all on function public.publish_start_list(uuid, jsonb) from public, anon;
grant execute on function public.publish_start_list(uuid, jsonb) to authenticated;
