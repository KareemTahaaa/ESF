-- =============================================================================
-- 0006_results — results entry, review, approval, publication, correction
--
-- Lifecycle of a round's results (brief §10):
--
--   draft ──submit──▶ submitted ──approve──▶ approved ──publish──▶ published
--     ▲                  │
--     └────return────────┘
--
--   approved/published ──correct──▶ new draft version (old one superseded)
--
-- Who may do what:
--   * Federation admins and results officials enter results and submit them.
--   * Only a federation admin returns, approves, publishes or corrects.
--
-- The round's status follows its results: submitting moves it to
-- results_submitted, approving to completed (which is what unlocks the rounds
-- that depend on it), and a correction moves it back. These transitions can
-- no longer be made with the generic set_round_status(): a round cannot be
-- marked completed without an approved result set.
--
-- A correction to approved results flags every later round that already
-- started from them, so nothing downstream keeps looking valid on old inputs.
-- =============================================================================

create type public.result_set_status as enum ('draft', 'submitted', 'approved', 'published', 'superseded');

alter table public.competition_rounds
  add column needs_review boolean not null default false,
  add column review_reason text;

create table public.result_sets (
  id                 uuid primary key default gen_random_uuid(),
  round_id           uuid not null references public.competition_rounds (id),
  start_list_id      uuid not null references public.start_lists (id),
  version            integer not null check (version > 0),
  status             public.result_set_status not null default 'draft',
  created_by         uuid not null references public.profiles (id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  submitted_by       uuid references public.profiles (id),
  submitted_at       timestamptz,
  approved_by        uuid references public.profiles (id),
  approved_at        timestamptz,
  published_by       uuid references public.profiles (id),
  published_at       timestamptz,
  supersedes         uuid references public.result_sets (id),
  correction_reason  text,
  superseded_at      timestamptz,
  unique (round_id, version),
  check ((status = 'superseded') = (superseded_at is not null))
);

-- One live (non-superseded) result set per round.
create unique index result_sets_one_live on public.result_sets (round_id) where status <> 'superseded';

create table public.result_lines (
  result_set_id    uuid not null references public.result_sets (id) on delete cascade,
  athlete_id       uuid not null references public.athletes (id),
  -- Copied from the published start list so a published result can be shown
  -- publicly without exposing the athlete registry (no birth year here).
  federation_number integer not null,
  full_name_ar     text not null,
  club_code        text not null,
  event_number     integer not null,
  category_id      text not null,
  heat_number      integer,
  lane             integer not null,
  status           text not null check (status in ('ok', 'dns', 'dnf', 'dq', 'fs')),
  time_cs          integer check (time_cs > 0),
  -- Finishing position within the heat (or the pack in a mass start), as the
  -- officials recorded it. Ties are allowed; their treatment is Q6.
  position         integer check (position > 0),
  note             text,
  primary key (result_set_id, athlete_id),
  -- A finisher needs a time or a position; a non-starter has neither.
  check (status <> 'ok' or time_cs is not null or position is not null),
  check (status <> 'dns' or (time_cs is null and position is null))
);

-- -----------------------------------------------------------------------------
-- Status guard: results-driven transitions only through the results functions
-- -----------------------------------------------------------------------------

create or replace function public.guard_start_list_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'start_list_published' and old.status = 'registration_closed'
     and new.entry_mode = 'registration'
     and coalesce(current_setting('esf.publishing_start_list', true), '') <> new.id::text then
    raise exception 'Publish the start list from the start-list screen; it checks the list against the entries.'
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

-- Moves a round's status from inside a results function.
create or replace function public.results_move_round(round uuid, new_status public.round_status)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('esf.results_transition', round::text, true);
  update public.competition_rounds set status = new_status, status_changed_at = now() where id = round;
  perform set_config('esf.results_transition', '', true);
end;
$$;

revoke all on function public.results_move_round(uuid, public.round_status) from public, anon, authenticated;

create or replace function public.require_results_staff()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_federation_staff() then
    raise exception 'Only federation staff can enter results.' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.require_results_staff() from public, anon;

create or replace function public.live_result_set(round uuid)
returns public.result_sets
language sql
stable
security definer
set search_path = public
as $$
  select * from public.result_sets where round_id = round and status <> 'superseded';
$$;

revoke all on function public.live_result_set(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Entry
-- -----------------------------------------------------------------------------

-- Saves the draft results of a round. `lines` is a JSON array of
-- {athlete_id, status, time_cs, position, note}. Every athlete on the
-- published start list must appear exactly once, and nobody else.
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
  select rs.id, sl.athlete_id, a.federation_number, a.full_name_ar, c.code,
         sl.event_number, sl.category_id, sl.heat_number, sl.lane,
         l ->> 'status', nullif(l ->> 'time_cs', '')::integer, nullif(l ->> 'position', '')::integer, nullif(trim(l ->> 'note'), '')
  from jsonb_array_elements(lines) l
  join public.start_list_lanes sl on sl.start_list_id = list.id and sl.athlete_id = (l ->> 'athlete_id')::uuid
  join public.athletes a on a.id = sl.athlete_id
  join public.race_entries re on re.round_id = round and re.athlete_id = sl.athlete_id and re.status = 'active'
  join public.clubs c on c.id = re.club_id;
  get diagnostics n = row_count;
  if n <> coalesce(array_length(listed, 1), 0) then
    raise exception 'Could not match every result to an entry (% of %).', n, array_length(listed, 1) using errcode = '22023';
  end if;

  update public.result_sets set updated_at = now() where id = rs.id;
  insert into public.audit_log (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), 'results.save', 'competition_round', round::text, jsonb_build_object('result_set', rs.id, 'lines', n));
  return n;
end;
$$;

create or replace function public.submit_results(round uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rs public.result_sets%rowtype;
begin
  perform public.require_results_staff();
  perform 1 from public.competition_rounds where id = round for update;
  rs := public.live_result_set(round);
  if rs.id is null or rs.status <> 'draft' then
    raise exception 'There are no draft results to submit.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.result_lines where result_set_id = rs.id) then
    raise exception 'Save the results before submitting them.' using errcode = '22023';
  end if;
  update public.result_sets set status = 'submitted', submitted_by = auth.uid(), submitted_at = now() where id = rs.id;
  perform public.results_move_round(round, 'results_submitted');
  insert into public.audit_log (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), 'results.submit', 'competition_round', round::text, jsonb_build_object('result_set', rs.id, 'version', rs.version));
end;
$$;

-- -----------------------------------------------------------------------------
-- Review: return, approve, publish (federation admin only)
-- -----------------------------------------------------------------------------

create or replace function public.return_results(round uuid, reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rs public.result_sets%rowtype;
begin
  perform public.require_federation_admin();
  perform public.require_reason(reason);
  perform 1 from public.competition_rounds where id = round for update;
  rs := public.live_result_set(round);
  if rs.id is null or rs.status <> 'submitted' then
    raise exception 'Only submitted results can be returned.' using errcode = '22023';
  end if;
  update public.result_sets set status = 'draft', submitted_by = null, submitted_at = null where id = rs.id;
  perform public.results_move_round(round, 'start_list_published');
  insert into public.audit_log (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), 'results.return', 'competition_round', round::text, jsonb_build_object('result_set', rs.id, 'reason', trim(reason)));
end;
$$;

create or replace function public.approve_results(round uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rs public.result_sets%rowtype;
begin
  perform public.require_federation_admin();
  perform 1 from public.competition_rounds where id = round for update;
  rs := public.live_result_set(round);
  if rs.id is null or rs.status <> 'submitted' then
    raise exception 'Only submitted results can be approved.' using errcode = '22023';
  end if;
  update public.result_sets set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = rs.id;
  perform public.results_move_round(round, 'completed');
  insert into public.audit_log (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), 'results.approve', 'competition_round', round::text,
          jsonb_build_object('result_set', rs.id, 'version', rs.version, 'submitted_by', rs.submitted_by));
end;
$$;

create or replace function public.publish_results(round uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rs public.result_sets%rowtype;
begin
  perform public.require_federation_admin();
  rs := public.live_result_set(round);
  if rs.id is null or rs.status <> 'approved' then
    raise exception 'Only approved results can be published.' using errcode = '22023';
  end if;
  update public.result_sets set status = 'published', published_by = auth.uid(), published_at = now() where id = rs.id;
  insert into public.audit_log (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), 'results.publish', 'competition_round', round::text, jsonb_build_object('result_set', rs.id, 'version', rs.version));
end;
$$;

-- -----------------------------------------------------------------------------
-- Correction of approved results
-- -----------------------------------------------------------------------------

-- Opens a new draft version, copied from the approved one. The approved version
-- is kept (superseded), the round goes back to awaiting results, and every
-- later round that already started from these results is flagged for review.
create or replace function public.correct_results(round uuid, reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  rs public.result_sets%rowtype;
  created uuid;
  flagged integer;
begin
  perform public.require_federation_admin();
  perform public.require_reason(reason);
  perform 1 from public.competition_rounds where id = round for update;
  rs := public.live_result_set(round);
  if rs.id is null or rs.status not in ('approved', 'published') then
    raise exception 'Only approved or published results can be corrected.' using errcode = '22023';
  end if;

  update public.result_sets set status = 'superseded', superseded_at = now() where id = rs.id;
  insert into public.result_sets (round_id, start_list_id, version, created_by, supersedes, correction_reason)
  values (round, rs.start_list_id, rs.version + 1, auth.uid(), rs.id, trim(reason))
  returning id into created;
  insert into public.result_lines (result_set_id, athlete_id, federation_number, full_name_ar, club_code,
                                   event_number, category_id, heat_number, lane, status, time_cs, position, note)
  select created, athlete_id, federation_number, full_name_ar, club_code,
         event_number, category_id, heat_number, lane, status, time_cs, position, note
  from public.result_lines where result_set_id = rs.id;

  perform public.results_move_round(round, 'start_list_published');

  with recursive downstream(id) as (
    select p.round_id from public.round_prerequisites p where p.prerequisite_round_id = round
    union
    select p.round_id from public.round_prerequisites p join downstream d on p.prerequisite_round_id = d.id
  )
  update public.competition_rounds cr
    set needs_review = true,
        review_reason = 'Results of a prerequisite round are being corrected: ' || trim(reason)
    from downstream d
    where cr.id = d.id and cr.status not in ('draft', 'cancelled');
  get diagnostics flagged = row_count;

  insert into public.audit_log (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), 'results.correct', 'competition_round', round::text,
          jsonb_build_object('from_version', rs.version, 'new_result_set', created, 'reason', trim(reason),
                             'downstream_rounds_flagged', flagged));
  return created;
end;
$$;

-- Clears a downstream review flag once its prerequisites are approved again.
create or replace function public.clear_round_review(round uuid, note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  blocking text[];
begin
  perform public.require_federation_admin();
  perform public.require_reason(note);
  blocking := public.incomplete_prerequisites(round);
  if array_length(blocking, 1) > 0 then
    raise exception 'Prerequisite results are not approved again yet: %.', array_to_string(blocking, '; ') using errcode = '22023';
  end if;
  update public.competition_rounds set needs_review = false, review_reason = null where id = round and needs_review;
  if not found then
    raise exception 'This round is not flagged for review.' using errcode = '22023';
  end if;
  insert into public.audit_log (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), 'round.review_cleared', 'competition_round', round::text, jsonb_build_object('note', trim(note)));
end;
$$;

-- -----------------------------------------------------------------------------
-- Privileges and RLS
-- -----------------------------------------------------------------------------

revoke all on function public.save_results(uuid, jsonb) from public, anon;
revoke all on function public.submit_results(uuid) from public, anon;
revoke all on function public.return_results(uuid, text) from public, anon;
revoke all on function public.approve_results(uuid) from public, anon;
revoke all on function public.publish_results(uuid) from public, anon;
revoke all on function public.correct_results(uuid, text) from public, anon;
revoke all on function public.clear_round_review(uuid, text) from public, anon;

grant execute on function public.save_results(uuid, jsonb) to authenticated;
grant execute on function public.submit_results(uuid) to authenticated;
grant execute on function public.return_results(uuid, text) to authenticated;
grant execute on function public.approve_results(uuid) to authenticated;
grant execute on function public.publish_results(uuid) to authenticated;
grant execute on function public.correct_results(uuid, text) to authenticated;
grant execute on function public.clear_round_review(uuid, text) to authenticated;

alter table public.result_sets enable row level security;
alter table public.result_lines enable row level security;

create policy result_sets_staff_read on public.result_sets
  for select to authenticated using (public.is_federation_staff());
-- Published results are public: anyone may read them, signed in or not.
create policy result_sets_published_read on public.result_sets
  for select to anon, authenticated using (status = 'published');

create policy result_lines_staff_read on public.result_lines
  for select to authenticated using (public.is_federation_staff());
create policy result_lines_published_read on public.result_lines
  for select to anon, authenticated using (
    exists (select 1 from public.result_sets s where s.id = result_lines.result_set_id and s.status = 'published')
  );

-- The event and round names of published results are public too.
create policy events_published_read on public.events
  for select to anon, authenticated using (
    exists (select 1 from public.competition_rounds cr join public.result_sets s on s.round_id = cr.id
            where cr.event_id = events.id and s.status = 'published')
  );
create policy rounds_published_read on public.competition_rounds
  for select to anon, authenticated using (
    exists (select 1 from public.result_sets s where s.round_id = competition_rounds.id and s.status = 'published')
  );
