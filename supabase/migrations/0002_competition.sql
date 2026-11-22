-- =============================================================================
-- 0002_competition — athletes, imports, events, rounds, race entries
--
-- Builds on 0001_accounts. Same security model:
--   * Users get READ policies only. Every write goes through a security-definer
--     function that checks the caller's role, validates the change, and writes
--     the audit entry in the same transaction. A missed check in the website
--     cannot therefore write anything the database would not allow.
--   * Club admins see only athletes and entries of the club the federation
--     confirmed for them (public.current_club_id()).
--   * Age category is never stored on the athlete: it is derived from the birth
--     year and the season's category table, so a new season never rewrites a
--     past one.
--
-- Rule sources: docs/rules/RULE_MATRIX.md. Import design:
-- docs/phase-2/DATA_MIGRATION_MAP.md.
-- =============================================================================

create type public.championship as enum ('qualifications', 'national_league', 'egypt_cup');
create type public.entry_mode as enum ('registration', 'advancement');
create type public.round_status as enum (
  'draft',                 -- being configured; invisible to clubs
  'registration_open',     -- clubs may enter athletes until the deadline
  'registration_closed',   -- entries frozen; start list can be generated
  'start_list_published',  -- start list issued; race can be run
  'results_submitted',     -- results entered, awaiting approval
  'completed',             -- results approved; feeds later rounds
  'cancelled'
);
create type public.import_kind as enum ('athletes', 'historical_results');
create type public.import_batch_status as enum ('preview', 'committed', 'discarded');
create type public.import_row_status as enum ('accepted', 'warning', 'needs_review', 'rejected', 'suspected_duplicate');

-- -----------------------------------------------------------------------------
-- Seasons and their age categories (Article 3)
-- -----------------------------------------------------------------------------

create table public.seasons (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique check (code ~ '^[0-9]{4}-[0-9]{4}$'),
  ruleset_version  text,
  is_current       boolean not null default false,
  created_at       timestamptz not null default now()
);

create unique index seasons_one_current on public.seasons (is_current) where is_current;

create table public.season_categories (
  season_id        uuid not null references public.seasons (id),
  category_id      text not null,
  name_ar          text not null,
  name_en          text not null,
  birth_year_from  integer,
  birth_year_to    integer,
  sort_order       integer not null,
  primary key (season_id, category_id),
  check (birth_year_from is null or birth_year_to is null or birth_year_from <= birth_year_to)
);

comment on table public.season_categories is
  'Article 3 birth-year ranges per season. Must match lib/competition/rules/rulesets — a test asserts it.';

-- The category an athlete born in `birth_year` belongs to in `season`, or null.
create or replace function public.category_for(season uuid, birth_year integer)
returns text
language sql
stable
set search_path = public
as $$
  select category_id from public.season_categories
  where season_id = season
    and birth_year is not null
    and (birth_year_from is null or birth_year >= birth_year_from)
    and (birth_year_to is null or birth_year <= birth_year_to)
  order by sort_order
  limit 1;
$$;

-- -----------------------------------------------------------------------------
-- Imports — every committed row is traceable to its source file and row
-- -----------------------------------------------------------------------------

create table public.import_batches (
  id            uuid primary key default gen_random_uuid(),
  kind          public.import_kind not null,
  season_id     uuid not null references public.seasons (id),
  file_name     text not null,
  -- SHA-256 of the file's bytes. Byte-identical files circulate (400m.xlsx and
  -- its renamed copy), so duplicates are detected by content, not by name.
  file_sha256   text not null check (file_sha256 ~ '^[0-9a-f]{64}$'),
  status        public.import_batch_status not null default 'preview',
  counts        jsonb not null default '{}'::jsonb,
  created_by    uuid not null references public.profiles (id),
  created_at    timestamptz not null default now(),
  committed_by  uuid references public.profiles (id),
  committed_at  timestamptz,
  result        jsonb,
  supersedes    uuid references public.import_batches (id)
);

create unique index import_batches_no_duplicate_commit
  on public.import_batches (kind, file_sha256) where status = 'committed';

create table public.import_rows (
  id          bigint generated always as identity primary key,
  batch_id    uuid not null references public.import_batches (id),
  sheet       text not null,
  row_number  integer not null,
  status      public.import_row_status not null,
  -- Normalised values the commit uses.
  data        jsonb not null,
  -- The original cell values, verbatim.
  raw         jsonb not null,
  issues      jsonb not null default '[]'::jsonb,
  unique (batch_id, sheet, row_number)
);

-- -----------------------------------------------------------------------------
-- Athletes — the federation's master registry
-- -----------------------------------------------------------------------------

create table public.athletes (
  id                   uuid primary key default gen_random_uuid(),
  -- `الرقم` in the legacy Database sheet: verified unique across all 777 rows.
  federation_number    integer not null unique check (federation_number > 0),
  -- `رقم التسجيل`: opaque, stored verbatim (OPEN_QUESTIONS Q9).
  registration_number  text,
  full_name_ar         text not null check (length(trim(full_name_ar)) > 0),
  -- For duplicate DETECTION only. Never used to merge records automatically.
  name_normalised      text not null,
  birth_year           integer check (birth_year between 1920 and 2030),
  gender               text not null check (gender in ('M', 'F')),
  is_active            boolean not null default true,
  source_import_row    bigint references public.import_rows (id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index athletes_name_normalised_idx on public.athletes (name_normalised);

-- Membership is versioned so a result keeps the club the athlete skated for at
-- the time, even after a transfer (Article 8).
create table public.club_memberships (
  id                 uuid primary key default gen_random_uuid(),
  athlete_id         uuid not null references public.athletes (id),
  club_id            uuid not null references public.clubs (id),
  season_id          uuid not null references public.seasons (id),
  valid_from         date not null default current_date,
  valid_to           date,
  source_import_row  bigint references public.import_rows (id),
  created_at         timestamptz not null default now(),
  check (valid_to is null or valid_to >= valid_from)
);

create unique index club_memberships_one_current
  on public.club_memberships (athlete_id, season_id) where valid_to is null;
create index club_memberships_club_idx on public.club_memberships (club_id, season_id) where valid_to is null;

-- Previous-season rankings — the seeding input of Article 9 Table 9.
create table public.previous_season_rankings (
  id                    uuid primary key default gen_random_uuid(),
  athlete_id            uuid not null references public.athletes (id),
  -- The season the ranking was EARNED in (2025-2026 for 2026-27 seeding).
  season_id             uuid not null references public.seasons (id),
  race_code             text not null,
  championship          public.championship not null,
  classification_level  text check (classification_level in ('A', 'B')),
  rank                  integer check (rank > 0),
  -- The original cell. 138 Cup 800/1000m values are `Heat N`, not ranks (Q2).
  rank_raw              text,
  needs_review          boolean not null default false,
  import_batch_id       uuid not null references public.import_batches (id),
  unique (athlete_id, season_id, race_code, championship)
);

-- Historical measured times. No finishing positions exist in the source, so
-- these never generate championship points (DATA_MIGRATION_MAP §4.3).
create table public.historical_results (
  id                uuid primary key default gen_random_uuid(),
  athlete_id        uuid not null references public.athletes (id),
  club_id           uuid not null references public.clubs (id),
  season_id         uuid not null references public.seasons (id),
  event_raw         text not null,
  race_code         text not null,
  result_date       date not null,
  time_cs           integer check (time_cs > 0),
  time_raw          text not null,
  status            text not null check (status in ('ok', 'dq', 'fs', 'dns', 'dnf')),
  import_batch_id   uuid not null references public.import_batches (id),
  source_import_row bigint not null references public.import_rows (id),
  check ((status = 'ok') = (time_cs is not null))
);

create index historical_results_athlete_idx on public.historical_results (athlete_id, race_code);

-- -----------------------------------------------------------------------------
-- Events and rounds
-- -----------------------------------------------------------------------------

create table public.events (
  id            uuid primary key default gen_random_uuid(),
  season_id     uuid not null references public.seasons (id),
  championship  public.championship not null,
  name_ar       text not null check (length(trim(name_ar)) > 0),
  venue_ar      text,
  event_date    date,
  created_by    uuid not null references public.profiles (id),
  created_at    timestamptz not null default now()
);

-- One round of one race in one event, built from a row of the season's race
-- catalogue (Races 2026-2027.docx). A catalogue row can hold several rounds
-- (row 7: R24 + semi-final + level B), so the round is the unit of status,
-- deadline, entries and prerequisites.
create table public.competition_rounds (
  id                     uuid primary key default gen_random_uuid(),
  event_id               uuid not null references public.events (id),
  catalogue_number       integer not null check (catalogue_number > 0),
  race_code              text not null,
  round_key              text not null,
  -- Official round name, preserved verbatim (`دور ال 12` is not `نصف النهائي`).
  name_ar                text not null,
  entry_mode             public.entry_mode not null,
  status                 public.round_status not null default 'draft',
  registration_deadline  timestamptz,
  scheduled_at           timestamptz,
  -- Categories allowed to enter, computed by the rules engine (Article 7) when
  -- the round is created and enforced here on every entry.
  eligible_categories    text[] not null,
  ruleset_version        text not null,
  status_changed_at      timestamptz not null default now(),
  created_at             timestamptz not null default now(),
  unique (event_id, catalogue_number, round_key)
);

create index competition_rounds_status_idx on public.competition_rounds (status);

create table public.round_prerequisites (
  round_id               uuid not null references public.competition_rounds (id) on delete cascade,
  prerequisite_round_id  uuid not null references public.competition_rounds (id),
  primary key (round_id, prerequisite_round_id),
  check (round_id <> prerequisite_round_id)
);

-- Rejects any prerequisite edge that would close a cycle.
create or replace function public.reject_prerequisite_cycle()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    with recursive upstream(id) as (
      select new.prerequisite_round_id
      union
      select p.prerequisite_round_id
      from public.round_prerequisites p join upstream u on p.round_id = u.id
    )
    select 1 from upstream where id = new.round_id
  ) then
    raise exception 'This prerequisite would create a cycle between rounds.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger round_prerequisites_no_cycle
  before insert or update on public.round_prerequisites
  for each row execute function public.reject_prerequisite_cycle();

-- -----------------------------------------------------------------------------
-- Race entries
-- -----------------------------------------------------------------------------

create table public.race_entries (
  id            uuid primary key default gen_random_uuid(),
  round_id      uuid not null references public.competition_rounds (id),
  athlete_id    uuid not null references public.athletes (id),
  -- The club the athlete entered for, fixed at entry time.
  club_id       uuid not null references public.clubs (id),
  -- Category at entry, derived — recorded so the start list is reproducible.
  category_id   text not null,
  status        text not null default 'active' check (status in ('active', 'withdrawn')),
  submitted_by  uuid not null references public.profiles (id),
  submitted_at  timestamptz not null default now(),
  -- Set only when federation staff entered the athlete outside the normal window.
  exception_reason text,
  withdrawn_by  uuid references public.profiles (id),
  withdrawn_at  timestamptz,
  check ((status = 'withdrawn') = (withdrawn_at is not null))
);

-- An athlete is entered in a round at most once. Different distances are
-- different rounds, so multi-distance entry is allowed.
create unique index race_entries_one_active
  on public.race_entries (round_id, athlete_id) where status = 'active';
create index race_entries_club_idx on public.race_entries (club_id, round_id);

-- -----------------------------------------------------------------------------
-- Role helpers
-- -----------------------------------------------------------------------------

-- Federation admins and results officials: read access to competition data.
create or replace function public.is_federation_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('federation_admin', 'results_official') and status = 'approved'
  );
$$;

create or replace function public.require_federation_admin()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_federation_admin() then
    raise exception 'Only an approved federation admin can do this.' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.season_id_for(season_code text)
returns uuid
language plpgsql
stable
set search_path = public
as $$
declare
  found_id uuid;
begin
  select id into found_id from public.seasons where code = season_code;
  if found_id is null then
    raise exception 'Unknown season %.', season_code using errcode = 'P0002';
  end if;
  return found_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Import: create a preview batch, then commit or discard it
-- -----------------------------------------------------------------------------

-- `rows` is a JSON array of {sheet, row_number, status, data, raw, issues},
-- produced by the server-side parser (lib/competition/import). Nothing is
-- written to athletes or results here: this only stores the preview.
create or replace function public.create_import_batch(
  kind         public.import_kind,
  season_code  text,
  file_name    text,
  file_sha256  text,
  counts       jsonb,
  rows         jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  batch uuid;
  previous public.import_batches%rowtype;
begin
  perform public.require_federation_admin();

  select * into previous from public.import_batches b
  where b.kind = create_import_batch.kind and b.file_sha256 = create_import_batch.file_sha256 and b.status = 'committed';
  if found then
    raise exception 'This exact file was already imported on % (%). Nothing was changed.',
      to_char(previous.committed_at, 'YYYY-MM-DD'), previous.file_name
      using errcode = '23505';
  end if;

  insert into public.import_batches (kind, season_id, file_name, file_sha256, counts, created_by)
  values (kind, public.season_id_for(season_code), file_name, file_sha256, counts, auth.uid())
  returning id into batch;

  insert into public.import_rows (batch_id, sheet, row_number, status, data, raw, issues)
  select batch, r ->> 'sheet', (r ->> 'row_number')::integer, (r ->> 'status')::public.import_row_status,
         r -> 'data', r -> 'raw', coalesce(r -> 'issues', '[]'::jsonb)
  from jsonb_array_elements(rows) as r;

  insert into public.audit_log (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), 'import.preview', 'import_batch', batch::text,
          jsonb_build_object('kind', kind, 'file_name', file_name, 'file_sha256', file_sha256, 'counts', counts));
  return batch;
end;
$$;

create or replace function public.discard_import_batch(batch uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_federation_admin();
  update public.import_batches set status = 'discarded' where id = batch and status = 'preview';
  if not found then
    raise exception 'Only a batch still in preview can be discarded.' using errcode = '22023';
  end if;
  insert into public.audit_log (actor_id, action, target_type, target_id)
  values (auth.uid(), 'import.discard', 'import_batch', batch::text);
end;
$$;

-- Commits a previewed batch in one transaction. Rows marked `rejected` or
-- `suspected_duplicate` are never written. Athletes are matched ONLY on
-- federation number; names never merge records.
create or replace function public.commit_import_batch(batch uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.import_batches%rowtype;
  r public.import_rows%rowtype;
  athlete public.athletes%rowtype;
  target_club uuid;
  ranking_season uuid;
  ranking jsonb;
  inserted integer := 0;
  updated integer := 0;
  unchanged integer := 0;
  transfers integer := 0;
  rankings integer := 0;
  results integer := 0;
  superseded uuid;
begin
  perform public.require_federation_admin();

  select * into b from public.import_batches where id = batch for update;
  if not found then
    raise exception 'Import batch % does not exist.', batch using errcode = 'P0002';
  end if;
  if b.status <> 'preview' then
    raise exception 'This batch is already %.', b.status using errcode = '22023';
  end if;
  if exists (select 1 from public.import_batches
             where kind = b.kind and file_sha256 = b.file_sha256 and status = 'committed') then
    raise exception 'This exact file was already imported. Nothing was changed.' using errcode = '23505';
  end if;

  for r in
    select * from public.import_rows
    where batch_id = batch and status in ('accepted', 'warning', 'needs_review')
    order by sheet, row_number
  loop
    if b.kind = 'athletes' then
      select id into target_club from public.clubs where code = r.data ->> 'club_code';
      if target_club is null then
        raise exception 'Row %: club % is not registered. Add the club first.', r.row_number, r.data ->> 'club_code'
          using errcode = '23503';
      end if;

      select * into athlete from public.athletes
      where federation_number = (r.data ->> 'federation_number')::integer for update;

      if not found then
        insert into public.athletes (federation_number, registration_number, full_name_ar, name_normalised,
                                     birth_year, gender, source_import_row)
        values ((r.data ->> 'federation_number')::integer, r.data ->> 'registration_number',
                r.data ->> 'full_name_ar', r.data ->> 'name_normalised',
                (r.data ->> 'birth_year')::integer, r.data ->> 'gender', r.id)
        returning * into athlete;
        inserted := inserted + 1;
      elsif athlete.full_name_ar is distinct from r.data ->> 'full_name_ar'
         or athlete.registration_number is distinct from r.data ->> 'registration_number'
         or athlete.birth_year is distinct from (r.data ->> 'birth_year')::integer
         or athlete.gender is distinct from r.data ->> 'gender' then
        insert into public.audit_log (actor_id, action, target_type, target_id, detail)
        values (auth.uid(), 'athlete.update_from_import', 'athlete', athlete.id::text,
                jsonb_build_object('batch', batch, 'row', r.row_number,
                  'before', jsonb_build_object('full_name_ar', athlete.full_name_ar,
                    'registration_number', athlete.registration_number,
                    'birth_year', athlete.birth_year, 'gender', athlete.gender),
                  'after', r.data));
        update public.athletes
          set registration_number = r.data ->> 'registration_number',
              full_name_ar = r.data ->> 'full_name_ar',
              name_normalised = r.data ->> 'name_normalised',
              birth_year = (r.data ->> 'birth_year')::integer,
              gender = r.data ->> 'gender',
              source_import_row = r.id,
              updated_at = now()
          where id = athlete.id;
        updated := updated + 1;
      else
        unchanged := unchanged + 1;
      end if;

      -- Current club for the batch's season. A different club is a transfer:
      -- the old membership is closed, never rewritten.
      if not exists (select 1 from public.club_memberships
                     where athlete_id = athlete.id and season_id = b.season_id
                       and valid_to is null and club_id = target_club) then
        if exists (select 1 from public.club_memberships
                   where athlete_id = athlete.id and season_id = b.season_id and valid_to is null) then
          transfers := transfers + 1;
        end if;
        update public.club_memberships set valid_to = current_date
          where athlete_id = athlete.id and season_id = b.season_id and valid_to is null;
        insert into public.club_memberships (athlete_id, club_id, season_id, source_import_row)
        values (athlete.id, target_club, b.season_id, r.id);
      end if;

      -- Previous-season rankings: a re-import replaces this athlete's rankings
      -- for that season rather than adding a second copy.
      if jsonb_typeof(r.data -> 'rankings') = 'array' and jsonb_array_length(r.data -> 'rankings') > 0 then
        ranking_season := public.season_id_for(r.data ->> 'rankings_season');
        delete from public.previous_season_rankings
          where athlete_id = athlete.id and season_id = ranking_season;
        for ranking in select * from jsonb_array_elements(r.data -> 'rankings') loop
          insert into public.previous_season_rankings
            (athlete_id, season_id, race_code, championship, classification_level, rank, rank_raw, needs_review, import_batch_id)
          values (athlete.id, ranking_season, ranking ->> 'race_code', (ranking ->> 'championship')::public.championship,
                  ranking ->> 'classification_level', (ranking ->> 'rank')::integer, ranking ->> 'rank_raw',
                  coalesce((ranking ->> 'needs_review')::boolean, false), batch);
          rankings := rankings + 1;
        end loop;
      end if;

    elsif b.kind = 'historical_results' then
      select * into athlete from public.athletes where federation_number = (r.data ->> 'federation_number')::integer;
      if not found then
        raise exception 'Row %: athlete % is not in the registry. Import athletes first.', r.row_number, r.data ->> 'federation_number'
          using errcode = '23503';
      end if;
      select id into target_club from public.clubs where code = r.data ->> 'club_code';
      if target_club is null then
        raise exception 'Row %: club % is not registered.', r.row_number, r.data ->> 'club_code' using errcode = '23503';
      end if;
      insert into public.historical_results
        (athlete_id, club_id, season_id, event_raw, race_code, result_date, time_cs, time_raw, status, import_batch_id, source_import_row)
      values (athlete.id, target_club, public.season_id_for(r.data ->> 'season'), r.data ->> 'event_raw',
              r.data ->> 'race_code', (r.data ->> 'result_date')::date, (r.data ->> 'time_cs')::integer,
              r.data ->> 'time_raw', r.data ->> 'status', batch, r.id);
      results := results + 1;
    end if;
  end loop;

  -- A corrected Records workbook replaces the previous committed one for the
  -- same season wholesale, so results are never duplicated. Historical times
  -- carry no positions and feed no official calculation (DATA_MIGRATION_MAP §4.3).
  if b.kind = 'historical_results' then
    select id into superseded from public.import_batches
      where kind = 'historical_results' and season_id = b.season_id and status = 'committed'
      order by committed_at desc limit 1;
    if superseded is not null then
      delete from public.historical_results where import_batch_id <> batch
        and import_batch_id in (select id from public.import_batches
                                where kind = 'historical_results' and season_id = b.season_id and status = 'committed');
    end if;
  end if;

  update public.import_batches
    set status = 'committed', committed_by = auth.uid(), committed_at = now(), supersedes = superseded,
        result = jsonb_build_object('inserted', inserted, 'updated', updated, 'unchanged', unchanged,
                                    'transfers', transfers, 'rankings', rankings, 'results', results)
    where id = batch
    returning result into ranking;

  insert into public.audit_log (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), 'import.commit', 'import_batch', batch::text,
          jsonb_build_object('kind', b.kind, 'file_name', b.file_name, 'file_sha256', b.file_sha256, 'result', ranking));
  return ranking;
end;
$$;

-- -----------------------------------------------------------------------------
-- Events and rounds — configured by the federation
-- -----------------------------------------------------------------------------

create or replace function public.create_event(
  season_code   text,
  championship  public.championship,
  name_ar       text,
  venue_ar      text default null,
  event_date    date default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  event uuid;
begin
  perform public.require_federation_admin();
  insert into public.events (season_id, championship, name_ar, venue_ar, event_date, created_by)
  values (public.season_id_for(season_code), championship, trim(name_ar), nullif(trim(venue_ar), ''), event_date, auth.uid())
  returning id into event;
  insert into public.audit_log (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), 'event.create', 'event', event::text,
          jsonb_build_object('championship', championship, 'name_ar', name_ar));
  return event;
end;
$$;

-- Adds one round. Prerequisites must be rounds of the same season. The website
-- derives round structure and eligible categories from the rules engine
-- (lib/competition/rounds.ts); the database enforces them from then on.
create or replace function public.add_competition_round(
  event                uuid,
  catalogue_number     integer,
  race_code            text,
  round_key            text,
  name_ar              text,
  entry_mode           public.entry_mode,
  eligible_categories  text[],
  ruleset_version      text,
  prerequisite_rounds  uuid[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  ev public.events%rowtype;
  round uuid;
  prerequisite uuid;
begin
  perform public.require_federation_admin();
  select * into ev from public.events where id = event;
  if not found then
    raise exception 'Event % does not exist.', event using errcode = 'P0002';
  end if;
  if entry_mode = 'registration' and coalesce(array_length(eligible_categories, 1), 0) = 0 then
    raise exception 'A round clubs register for needs at least one eligible category.' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(eligible_categories) c
             where c not in (select category_id from public.season_categories where season_id = ev.season_id)) then
    raise exception 'Eligible categories must belong to the event''s season.' using errcode = '22023';
  end if;

  insert into public.competition_rounds
    (event_id, catalogue_number, race_code, round_key, name_ar, entry_mode, eligible_categories, ruleset_version)
  values (event, catalogue_number, race_code, round_key, name_ar, entry_mode, eligible_categories, ruleset_version)
  returning id into round;

  foreach prerequisite in array prerequisite_rounds loop
    if not exists (select 1 from public.competition_rounds cr join public.events e on e.id = cr.event_id
                   where cr.id = prerequisite and e.season_id = ev.season_id) then
      raise exception 'Prerequisite round % is not a round of this season.', prerequisite using errcode = '22023';
    end if;
    insert into public.round_prerequisites (round_id, prerequisite_round_id) values (round, prerequisite);
  end loop;

  insert into public.audit_log (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), 'round.create', 'competition_round', round::text,
          jsonb_build_object('event', event, 'catalogue_number', catalogue_number, 'race_code', race_code,
                             'round_key', round_key, 'prerequisites', prerequisite_rounds));
  return round;
end;
$$;

-- Adds every round of one catalogue row in one transaction. `rounds` is the
-- JSON produced by lib/competition/rounds.ts planRounds(): each round names its
-- prerequisites by (championship, race_code, round_key), resolved here against
-- the season's existing rounds and the rounds created earlier in this call.
create or replace function public.add_catalogue_rounds(event uuid, rounds jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  ev public.events%rowtype;
  r jsonb;
  ref jsonb;
  created uuid;
  prerequisite uuid;
  matches integer;
  prerequisites uuid[];
  n integer := 0;
begin
  perform public.require_federation_admin();
  select * into ev from public.events where id = event;
  if not found then
    raise exception 'Event % does not exist.', event using errcode = 'P0002';
  end if;

  for r in select * from jsonb_array_elements(rounds) loop
    if (r ->> 'championship') <> ev.championship::text then
      raise exception 'Catalogue row % belongs to another championship.', r ->> 'catalogue_number' using errcode = '22023';
    end if;
    prerequisites := '{}';
    for ref in select * from jsonb_array_elements(coalesce(r -> 'prerequisites', '[]'::jsonb)) loop
      select count(*), min(cr.id::text)::uuid into matches, prerequisite
      from public.competition_rounds cr join public.events e on e.id = cr.event_id
      where e.season_id = ev.season_id and e.championship::text = ref ->> 'championship'
        and cr.race_code = ref ->> 'race_code' and cr.round_key = ref ->> 'round_key'
        and cr.status <> 'cancelled';
      if matches = 0 then
        raise exception 'Add the prerequisite round first: % — % (%).',
          ref ->> 'championship', ref ->> 'round_key', ref ->> 'race_code' using errcode = '22023';
      elsif matches > 1 then
        raise exception 'More than one % round of % exists in this season; cancel the extra one first.',
          ref ->> 'round_key', ref ->> 'race_code' using errcode = '22023';
      end if;
      prerequisites := prerequisites || prerequisite;
    end loop;

    created := public.add_competition_round(
      event, (r ->> 'catalogue_number')::integer, r ->> 'race_code', r ->> 'round_key', r ->> 'name_ar',
      (r ->> 'entry_mode')::public.entry_mode,
      array(select jsonb_array_elements_text(r -> 'eligible_categories')),
      r ->> 'ruleset_version', prerequisites);
    n := n + 1;
  end loop;
  return n;
end;
$$;

create or replace function public.set_round_schedule(
  round                  uuid,
  registration_deadline  timestamptz,
  scheduled_at           timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cr public.competition_rounds%rowtype;
begin
  perform public.require_federation_admin();
  select * into cr from public.competition_rounds where id = round for update;
  if not found then
    raise exception 'Round % does not exist.', round using errcode = 'P0002';
  end if;
  if cr.status in ('completed', 'cancelled') then
    raise exception 'A % round cannot be rescheduled.', cr.status using errcode = '22023';
  end if;
  update public.competition_rounds
    set registration_deadline = set_round_schedule.registration_deadline,
        scheduled_at = set_round_schedule.scheduled_at
    where id = round;
  insert into public.audit_log (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), 'round.schedule', 'competition_round', round::text,
          jsonb_build_object('before', jsonb_build_object('registration_deadline', cr.registration_deadline,
                                                          'scheduled_at', cr.scheduled_at),
                             'after', jsonb_build_object('registration_deadline', registration_deadline,
                                                         'scheduled_at', scheduled_at)));
end;
$$;

-- Names of prerequisite rounds that are not yet completed (approved results).
create or replace function public.incomplete_prerequisites(round uuid)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(e.name_ar || ' — ' || cr.name_ar || ' (' || cr.race_code || ')' order by cr.created_at), '{}')
  from public.round_prerequisites p
  join public.competition_rounds cr on cr.id = p.prerequisite_round_id
  join public.events e on e.id = cr.event_id
  where p.round_id = round and cr.status <> 'completed';
$$;

-- The only way a round changes status. Allowed transitions:
--   draft                -> registration_open (registration rounds) | registration_closed (advancement rounds)
--   registration_open    -> registration_closed
--   registration_closed  -> registration_open (reopen, reason required) | start_list_published
--   start_list_published -> results_submitted
--   results_submitted    -> completed | start_list_published (returned for correction)
--   any but completed    -> cancelled (reason required)
-- Leaving draft requires every prerequisite round to be completed.
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
begin
  perform public.require_federation_admin();
  select * into cr from public.competition_rounds where id = round for update;
  if not found then
    raise exception 'Round % does not exist.', round using errcode = 'P0002';
  end if;

  allowed := case
    when new_status = 'cancelled' then cr.status not in ('completed', 'cancelled')
    when cr.status = 'draft' and new_status = 'registration_open' then cr.entry_mode = 'registration'
    when cr.status = 'draft' and new_status = 'registration_closed' then cr.entry_mode = 'advancement'
    when cr.status = 'registration_open' and new_status = 'registration_closed' then true
    when cr.status = 'registration_closed' and new_status = 'registration_open' then cr.entry_mode = 'registration'
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

  if cr.status = 'draft' and new_status <> 'cancelled' then
    blocking := public.incomplete_prerequisites(round);
    if array_length(blocking, 1) > 0 then
      raise exception 'This round cannot start until its prerequisite rounds have approved results: %.',
        array_to_string(blocking, '; ') using errcode = '22023';
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
-- Race entries — club self-service, enforced here
-- -----------------------------------------------------------------------------

-- Checks one athlete against one round for one club. Raises with a message a
-- club admin can act on. Shared by club entry and federation exceptions.
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
  if category is null or not (category = any (cr.eligible_categories)) then
    raise exception 'Athlete % (%) is not eligible for this race (category %).', a.federation_number, a.full_name_ar,
      coalesce(category, 'unknown') using errcode = '22023';
  end if;
  if exists (select 1 from public.race_entries re
             where re.round_id = cr.id and re.athlete_id = a.id and re.status = 'active') then
    raise exception 'Athlete % (%) is already entered in this race.', a.federation_number, a.full_name_ar
      using errcode = '23505';
  end if;
  return category;
end;
$$;

-- A club admin enters athletes from their own roster. All or nothing.
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
  if cr.entry_mode <> 'registration' or cr.status <> 'registration_open' then
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

-- A club admin withdraws their own entry while registration is open.
create or replace function public.withdraw_race_entry(entry uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  club uuid := public.current_club_id();
  re public.race_entries%rowtype;
  cr public.competition_rounds%rowtype;
begin
  if club is null then
    raise exception 'Only an approved club admin can withdraw an entry.' using errcode = '42501';
  end if;
  select * into re from public.race_entries where id = entry for update;
  if not found or re.club_id <> club then
    raise exception 'Entry not found.' using errcode = 'P0002';
  end if;
  if re.status <> 'active' then
    raise exception 'This entry is already withdrawn.' using errcode = '22023';
  end if;
  select * into cr from public.competition_rounds where id = re.round_id;
  if cr.status <> 'registration_open' or now() > cr.registration_deadline then
    raise exception 'Registration for this race is closed. Contact the federation to change entries.' using errcode = '22023';
  end if;
  update public.race_entries set status = 'withdrawn', withdrawn_by = auth.uid(), withdrawn_at = now() where id = entry;
  insert into public.audit_log (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), 'entry.withdraw', 'race_entry', entry::text, jsonb_build_object('round', re.round_id));
end;
$$;

-- Federation exception path: enter an athlete after the deadline or while
-- registration is closed. Eligibility is still enforced; a reason is required
-- and audited.
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
  if cr.entry_mode <> 'registration' or cr.status not in ('registration_open', 'registration_closed') then
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
-- Privileges: functions are callable only by signed-in users, and each checks
-- the caller's role itself.
-- -----------------------------------------------------------------------------

revoke all on function public.create_import_batch(public.import_kind, text, text, text, jsonb, jsonb) from public, anon;
revoke all on function public.discard_import_batch(uuid) from public, anon;
revoke all on function public.commit_import_batch(uuid) from public, anon;
revoke all on function public.create_event(text, public.championship, text, text, date) from public, anon;
revoke all on function public.add_competition_round(uuid, integer, text, text, text, public.entry_mode, text[], text, uuid[]) from public, anon;
revoke all on function public.add_catalogue_rounds(uuid, jsonb) from public, anon;
revoke all on function public.set_round_schedule(uuid, timestamptz, timestamptz) from public, anon;
revoke all on function public.set_round_status(uuid, public.round_status, text) from public, anon;
revoke all on function public.submit_race_entries(uuid, uuid[]) from public, anon;
revoke all on function public.withdraw_race_entry(uuid) from public, anon;
revoke all on function public.federation_enter_athlete(uuid, uuid, text) from public, anon;
revoke all on function public.check_entry(public.competition_rounds, uuid, uuid) from public, anon, authenticated;
revoke all on function public.incomplete_prerequisites(uuid) from public, anon;
revoke all on function public.require_federation_admin() from public, anon;

grant execute on function public.create_import_batch(public.import_kind, text, text, text, jsonb, jsonb) to authenticated;
grant execute on function public.discard_import_batch(uuid) to authenticated;
grant execute on function public.commit_import_batch(uuid) to authenticated;
grant execute on function public.create_event(text, public.championship, text, text, date) to authenticated;
grant execute on function public.add_competition_round(uuid, integer, text, text, text, public.entry_mode, text[], text, uuid[]) to authenticated;
grant execute on function public.add_catalogue_rounds(uuid, jsonb) to authenticated;
grant execute on function public.set_round_schedule(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.set_round_status(uuid, public.round_status, text) to authenticated;
grant execute on function public.submit_race_entries(uuid, uuid[]) to authenticated;
grant execute on function public.withdraw_race_entry(uuid) to authenticated;
grant execute on function public.federation_enter_athlete(uuid, uuid, text) to authenticated;
grant execute on function public.incomplete_prerequisites(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Row Level Security — read policies only
-- -----------------------------------------------------------------------------

alter table public.seasons enable row level security;
alter table public.season_categories enable row level security;
alter table public.import_batches enable row level security;
alter table public.import_rows enable row level security;
alter table public.athletes enable row level security;
alter table public.club_memberships enable row level security;
alter table public.previous_season_rankings enable row level security;
alter table public.historical_results enable row level security;
alter table public.events enable row level security;
alter table public.competition_rounds enable row level security;
alter table public.round_prerequisites enable row level security;
alter table public.race_entries enable row level security;

create policy seasons_read on public.seasons for select to anon, authenticated using (true);
create policy season_categories_read on public.season_categories for select to anon, authenticated using (true);

create policy import_batches_federation_read on public.import_batches
  for select to authenticated using (public.is_federation_admin());
create policy import_rows_federation_read on public.import_rows
  for select to authenticated using (public.is_federation_admin());

create policy athletes_staff_read on public.athletes
  for select to authenticated using (public.is_federation_staff());
-- A club sees only athletes currently registered to it.
create policy athletes_club_read on public.athletes
  for select to authenticated using (
    exists (select 1 from public.club_memberships m
            where m.athlete_id = athletes.id and m.valid_to is null and m.club_id = public.current_club_id())
  );

create policy memberships_staff_read on public.club_memberships
  for select to authenticated using (public.is_federation_staff());
create policy memberships_club_read on public.club_memberships
  for select to authenticated using (club_id = public.current_club_id());

create policy rankings_staff_read on public.previous_season_rankings
  for select to authenticated using (public.is_federation_staff());
create policy historical_results_staff_read on public.historical_results
  for select to authenticated using (public.is_federation_staff());

create policy events_staff_read on public.events
  for select to authenticated using (public.is_federation_staff());
-- Clubs see an event once at least one of its rounds has left draft.
create policy events_club_read on public.events
  for select to authenticated using (
    public.current_club_id() is not null
    and exists (select 1 from public.competition_rounds cr where cr.event_id = events.id and cr.status <> 'draft')
  );

create policy rounds_staff_read on public.competition_rounds
  for select to authenticated using (public.is_federation_staff());
create policy rounds_club_read on public.competition_rounds
  for select to authenticated using (public.current_club_id() is not null and status <> 'draft');

create policy prerequisites_staff_read on public.round_prerequisites
  for select to authenticated using (public.is_federation_staff());

create policy entries_staff_read on public.race_entries
  for select to authenticated using (public.is_federation_staff());
create policy entries_club_read on public.race_entries
  for select to authenticated using (club_id = public.current_club_id());

-- -----------------------------------------------------------------------------
-- Seed: seasons and the 2026-2027 categories (Article 3, Table 1).
-- Keep in step with lib/competition/rules/rulesets/season-2026-2027.ts.
-- -----------------------------------------------------------------------------

insert into public.seasons (code, ruleset_version, is_current) values
  ('2025-2026', null, false),
  ('2026-2027', '2026-2027.r1', true);

insert into public.season_categories (season_id, category_id, name_ar, name_en, birth_year_from, birth_year_to, sort_order)
select s.id, c.category_id, c.name_ar, c.name_en, c.birth_year_from, c.birth_year_to, c.sort_order
from public.seasons s,
  (values
    ('senior',     'عمومي',  'Senior',       null::integer, 2008, 1),
    ('junior',     'شباب',   'Junior',       2009,          2010, 2),
    ('youth',      'ناشئين', 'Youth',        2011,          2012, 3),
    ('cadet14',    'تحت 14', 'Cadet 14',     2013,          2013, 4),
    ('cadet13',    'تحت 13', 'Cadet 13',     2014,          2014, 5),
    ('cadet12',    'تحت 12', 'Cadet 12',     2015,          2015, 6),
    ('precadet11', 'تحت 11', 'Pre-cadet 11', 2016,          2016, 7),
    ('precadet10', 'تحت 10', 'Pre-cadet 10', 2017,          2017, 8),
    ('precadet9',  'تحت 9',  'Pre-cadet 9',  2018,          2018, 9),
    ('mini8',      'تحت 8',  'Mini 8',       2019,          null::integer, 10)
  ) as c(category_id, name_ar, name_en, birth_year_from, birth_year_to, sort_order)
where s.code = '2026-2027';
