-- Study0SG v1.3: privacy-first service health and incident tracking.
-- Run after the v1.2 interactive-management migration.
begin;

-- The target names are fixed. Browser users cannot add arbitrary probe URLs.
create table if not exists public.monitor_services (
  id text primary key check (id ~ '^[a-z][a-z0-9_]{2,39}$'),
  display_name text not null,
  category text not null check (category in ('website','database','identity','integration')),
  summary text not null,
  expected_interval_seconds integer not null default 60 check (expected_interval_seconds between 30 and 3600)
);

insert into public.monitor_services (id,display_name,category,summary) values
 ('organizer_portal','Organizer portal','website','GitHub Pages HTML and its compiled JavaScript asset'),
 ('public_website','Public Astro website','website','Public main-site HTTP availability'),
 ('supabase_database','Supabase database','database','Query through the Supabase data API'),
 ('stytch_identity','Stytch authentication API','identity','Authenticated, read-only Study0SG organization API check'),
 ('google_drive','Google Drive integration','integration','Awaiting an authenticated curriculum access health adapter'),
 ('cloudflare_r2','Cloudflare R2 storage','integration','Awaiting an authenticated object-access health adapter')
on conflict (id) do update set
  display_name = excluded.display_name,
  category = excluded.category,
  summary = excluded.summary;

-- Each sample is a sanitized measurement, not a packet capture.
create table if not exists public.monitor_checks (
  id bigint generated always as identity primary key,
  service_id text not null references public.monitor_services(id),
  state text not null check (state in ('healthy','degraded','down','unconfigured')),
  response_ms integer check (response_ms between 0 and 120000),
  http_status integer check (http_status between 100 and 599),
  note text not null default '' check (length(note) <= 200),
  checked_at timestamptz not null default now()
);
create index if not exists monitor_checks_latest_idx on public.monitor_checks(service_id,checked_at desc,id desc);

-- Only one unresolved incident is allowed per service.
create table if not exists public.monitor_incidents (
  id uuid primary key default gen_random_uuid(),
  service_id text not null references public.monitor_services(id),
  severity text not null check (severity in ('notice','attention')),
  headline text not null check (length(headline) <= 180),
  opened_at timestamptz not null default now(),
  last_detected_at timestamptz not null default now(),
  acknowledged_by uuid references public.organizers(id),
  acknowledged_at timestamptz,
  resolved_at timestamptz
);
create unique index if not exists monitor_one_open_incident on public.monitor_incidents(service_id) where resolved_at is null;
create index if not exists monitor_incidents_recent on public.monitor_incidents(opened_at desc);

-- Every read requires an active Technology security grant or a Fore Director.
alter table public.monitor_services enable row level security;
alter table public.monitor_checks enable row level security;
alter table public.monitor_incidents enable row level security;
revoke all on public.monitor_services, public.monitor_checks, public.monitor_incidents from public,anon,authenticated;
grant select on public.monitor_services, public.monitor_checks, public.monitor_incidents to authenticated;

create policy security_monitor_services_read on public.monitor_services
  for select to authenticated using (
    public.is_active_actor() and (
      public.has_grant('fore_director'::public.portal_role)
      or public.has_grant('tech_security'::public.portal_role,'technology'::public.portal_department)
      or public.has_grant('director'::public.portal_role,'technology'::public.portal_department)
    )
  );
create policy security_monitor_checks_read on public.monitor_checks
  for select to authenticated using (
    public.is_active_actor() and (
      public.has_grant('fore_director'::public.portal_role)
      or public.has_grant('tech_security'::public.portal_role,'technology'::public.portal_department)
      or public.has_grant('director'::public.portal_role,'technology'::public.portal_department)
    )
  );
create policy security_monitor_incidents_read on public.monitor_incidents
  for select to authenticated using (
    public.is_active_actor() and (
      public.has_grant('fore_director'::public.portal_role)
      or public.has_grant('tech_security'::public.portal_role,'technology'::public.portal_department)
      or public.has_grant('director'::public.portal_role,'technology'::public.portal_department)
    )
  );

-- Authorized human reviewers can acknowledge, but cannot erase incidents.
create or replace function public.monitor_acknowledge(p_incident_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_active_actor() or not (
       public.has_grant('fore_director'::public.portal_role)
       or public.has_grant('tech_security'::public.portal_role,'technology'::public.portal_department)
       or public.has_grant('director'::public.portal_role,'technology'::public.portal_department)
     ) then
    raise exception 'Technology security access required' using errcode='42501';
  end if;

  update public.monitor_incidents
     set acknowledged_by = public.current_actor(), acknowledged_at = now()
   where id = p_incident_id and resolved_at is null and acknowledged_at is null;
  if not found then raise exception 'Incident is resolved or already acknowledged'; end if;

  perform public.portal_log_change('monitor.incident_acknowledged', public.current_actor(), null,
    'technology'::public.portal_department, jsonb_build_object('incident_id',p_incident_id));
end; $$;
revoke all on function public.monitor_acknowledge(uuid) from public,anon;
grant execute on function public.monitor_acknowledge(uuid) to authenticated;

-- Publish only sanitized measurements, under their existing RLS policies.
-- Postgres Changes is suitable for a small volunteer monitoring dashboard.
do $$ begin
 if exists (select 1 from pg_publication where pubname='supabase_realtime') then
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='monitor_checks') then
   execute 'alter publication supabase_realtime add table public.monitor_checks';
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='monitor_incidents') then
   execute 'alter publication supabase_realtime add table public.monitor_incidents';
  end if;
 end if;
end $$;
commit;
