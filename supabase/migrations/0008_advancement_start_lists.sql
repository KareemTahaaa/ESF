-- =============================================================================
-- 0008_advancement_start_lists — start lists for rounds fed by earlier rounds
--
-- The League and Cup rounds after the qualification (rounds of 16/24, quarter-
-- and semi-finals, finals, level B) take their field from the APPROVED results
-- of their prerequisite round. The rules engine (lib/competition/advancement.ts)
-- works out who goes through and builds the heats; publish_start_list() now
-- accepts such a list only if:
--
--   * every prerequisite round is completed (its results approved);
--   * the list says which result sets it was built from, and they are exactly
--     the current approved results of the prerequisites — a list built before a
--     correction is refused;
--   * every athlete on it raced in one of those approved result sets.
--
-- Also:
--   * start_list_lanes records each athlete's club, so results can be entered
--     for a round with no club entries (save_results joined race_entries).
--   * an advancement round can no longer be moved to start_list_published
--     without a list (the guard only covered registration rounds).
--   * a start list can be re-published while the round has no results yet,
--     which is how a round flagged by a correction upstream is put right; a
--     re-publish built from the current approved results clears that flag.
-- =============================================================================

alter table public.start_list_lanes add column club_code text;

update public.start_list_lanes sl
   set club_code = c.code
  from public.start_lists s, public.race_entries re, public.clubs c
 where s.id = sl.start_list_id
   and re.round_id = s.round_id and re.athlete_id = sl.athlete_id
   and c.id = re.club_id;

alter table public.start_list_lanes alter column club_code set not null;

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
  end if;

  update public.start_lists set superseded_at = now() where round_id = round and superseded_at is null;
  select coalesce(max(version), 0) + 1 into next_version from public.start_lists where round_id = round;
  insert into public.start_lists (round_id, version, ruleset_version, payload, published_by)
  values (round, next_version, cr.ruleset_version, payload, auth.uid())
  returning id into list;

  insert into public.start_list_lanes (start_list_id, athlete_id, event_number, category_id, heat_number, lane, seed, club_code)
  select list, athlete_id, event_number, category_id, heat_number, lane, seed, club_code from pg_temp.publishing_lanes;

  if not republish then
    -- Transaction-local marker the status guard below checks; it ends with this transaction.
    perform set_config('esf.publishing_start_list', round::text, true);
    update public.competition_rounds set status = 'start_list_published', status_changed_at = now() where id = round;
  end if;
  -- Built from the current approved results, so a review flag raised by an upstream correction is resolved.
  if cr.needs_review and cr.entry_mode = 'advancement' then
    update public.competition_rounds set needs_review = false, review_reason = null where id = round;
    cleared := true;
  end if;
  insert into public.audit_log (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), 'start_list.publish', 'competition_round', round::text,
          jsonb_build_object('version', next_version, 'athletes', array_length(listed, 1),
                             'sources', payload -> 'sources', 'review_cleared', cleared));
  return next_version;
end;
$$;

revoke all on function public.publish_start_list(uuid, jsonb) from public, anon;
grant execute on function public.publish_start_list(uuid, jsonb) to authenticated;

-- Every round, whatever its entry mode, gets its start list from publish_start_list().
create or replace function public.guard_start_list_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'start_list_published' and old.status = 'registration_closed'
     and coalesce(current_setting('esf.publishing_start_list', true), '') <> new.id::text then
    raise exception 'Publish the start list from the start-list screen; it checks the list before the round can run.'
      using errcode = '22023';
  end if;
  if new.status is distinct from old.status
     and (new.status in ('results_submitted', 'completed') or old.status in ('results_submitted', 'completed'))
     and new.status <> 'cancelled'
     and coalesce(current_setting('esf.results_transition', true), '') <> new.id::text then
    raise exception 'Results are submitted, returned and approved from the results screen.' using errcode = '22023';
  end if;
  return new;
end;
$$;

-- Same as 0006, except the club comes from the start list rather than the
-- round's club entries, which advancement rounds do not have.
create or replace function public.save_results(round uuid, lines jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  cr public.competition_rounds%rowtype;
  list public.start_lists%rowtype;
  rs public.result_sets%rowtype;
  listed uuid[];
  given uuid[];
  n integer;
begin
  perform public.require_results_staff();
  select * into cr from public.competition_rounds where id = round for update;
  if not found then
    raise exception 'Round % does not exist.', round using errcode = 'P0002';
  end if;
  if cr.status <> 'start_list_published' then
    raise exception 'Results can be entered once the start list is published and before they are submitted.' using errcode = '22023';
  end if;
  select * into list from public.start_lists where round_id = round and superseded_at is null;
  if not found then
    raise exception 'This round has no published start list.' using errcode = '22023';
  end if;

  select coalesce(array_agg(athlete_id order by athlete_id), '{}') into listed
    from public.start_list_lanes where start_list_id = list.id;
  select coalesce(array_agg((l ->> 'athlete_id')::uuid order by (l ->> 'athlete_id')::uuid), '{}') into given
    from jsonb_array_elements(lines) l;
  if given is distinct from listed then
    raise exception 'Results must cover exactly the % athletes on the start list (got %).',
      coalesce(array_length(listed, 1), 0), coalesce(array_length(given, 1), 0) using errcode = '22023';
  end if;

  rs := public.live_result_set(round);
  if rs.id is null then
    insert into public.result_sets (round_id, start_list_id, version, created_by)
    values (round, list.id, coalesce((select max(version) from public.result_sets where round_id = round), 0) + 1, auth.uid())
    returning * into rs;
  elsif rs.status <> 'draft' then
    raise exception 'These results are already %.', rs.status using errcode = '22023';
  elsif rs.start_list_id <> list.id then
    raise exception 'The start list changed after results were started. Ask a federation admin to review.' using errcode = '22023';
  end if;

  delete from public.result_lines where result_set_id = rs.id;
  insert into public.result_lines (result_set_id, athlete_id, federation_number, full_name_ar, club_code,
                                   event_number, category_id, heat_number, lane, status, time_cs, position, note)
  select rs.id, sl.athlete_id, a.federation_number, a.full_name_ar, sl.club_code,
         sl.event_number, sl.category_id, sl.heat_number, sl.lane,
         l ->> 'status', nullif(l ->> 'time_cs', '')::integer, nullif(l ->> 'position', '')::integer, nullif(trim(l ->> 'note'), '')
  from jsonb_array_elements(lines) l
  join public.start_list_lanes sl on sl.start_list_id = list.id and sl.athlete_id = (l ->> 'athlete_id')::uuid
  join public.athletes a on a.id = sl.athlete_id;
  get diagnostics n = row_count;
  if n <> coalesce(array_length(listed, 1), 0) then
    raise exception 'Could not match every result to the start list (% of %).', n, array_length(listed, 1) using errcode = '22023';
  end if;

  update public.result_sets set updated_at = now() where id = rs.id;
  insert into public.audit_log (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), 'results.save', 'competition_round', round::text, jsonb_build_object('result_set', rs.id, 'lines', n));
  return n;
end;
$$;

revoke all on function public.save_results(uuid, jsonb) from public, anon;
grant execute on function public.save_results(uuid, jsonb) to authenticated;
