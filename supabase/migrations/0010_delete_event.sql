-- =============================================================================
-- 0010_delete_event — a federation admin can delete an event set up by mistake
--
-- Deleting is permanent, so it is allowed only while nothing has happened in
-- the event: no club entries (even withdrawn ones), no start list, no results,
-- and no race in another event taking its athletes from it. Once any of that
-- exists the event is part of the season's record; its races are cancelled
-- instead (set_round_status → cancelled), which keeps the history.
--
-- The audit log keeps what was deleted (name, date, venue, every round) and
-- the reason given.
-- =============================================================================

create or replace function public.delete_event(event uuid, reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ev public.events%rowtype;
  rounds jsonb;
begin
  perform public.require_federation_admin();
  if reason is null or length(trim(reason)) < 3 then
    raise exception 'Give a reason for deleting this event; it is kept in the audit log.' using errcode = '22023';
  end if;
  select * into ev from public.events where id = event for update;
  if not found then
    raise exception 'Event % does not exist.', event using errcode = 'P0002';
  end if;
  perform 1 from public.competition_rounds where event_id = event for update;

  if exists (select 1 from public.race_entries re join public.competition_rounds r on r.id = re.round_id where r.event_id = event) then
    raise exception 'Clubs have entered athletes in this event, so it cannot be deleted. Cancel its races instead.' using errcode = '22023';
  end if;
  if exists (select 1 from public.start_lists s join public.competition_rounds r on r.id = s.round_id where r.event_id = event) then
    raise exception 'A start list has been published in this event, so it cannot be deleted. Cancel its races instead.' using errcode = '22023';
  end if;
  if exists (select 1 from public.result_sets s join public.competition_rounds r on r.id = s.round_id where r.event_id = event) then
    raise exception 'Results have been entered in this event, so it cannot be deleted. Cancel its races instead.' using errcode = '22023';
  end if;
  if exists (select 1 from public.round_prerequisites p
               join public.competition_rounds src on src.id = p.prerequisite_round_id
               join public.competition_rounds dep on dep.id = p.round_id
              where src.event_id = event and dep.event_id <> event) then
    raise exception 'Races in another event take their athletes from this event. Delete or cancel those first.' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'catalogue_number', r.catalogue_number, 'race', r.race_code,
                                               'round_key', r.round_key, 'status', r.status) order by r.catalogue_number, r.round_key), '[]')
    into rounds from public.competition_rounds r where r.event_id = event;

  insert into public.audit_log (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), 'event.delete', 'event', event::text,
          jsonb_build_object('name', ev.name_ar, 'championship', ev.championship, 'event_date', ev.event_date,
                             'venue', ev.venue_ar, 'rounds', rounds, 'reason', trim(reason)));

  delete from public.round_prerequisites
   where round_id in (select id from public.competition_rounds where event_id = event)
      or prerequisite_round_id in (select id from public.competition_rounds where event_id = event);
  delete from public.competition_rounds where event_id = event;
  delete from public.events where id = event;
end;
$$;

revoke all on function public.delete_event(uuid, text) from public, anon;
grant execute on function public.delete_event(uuid, text) to authenticated;
