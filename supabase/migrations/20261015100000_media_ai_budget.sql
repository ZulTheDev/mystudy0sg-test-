-- Study0SG: atomic server-side AI image quota; apply to DEV before deploying media-generate.
-- Usage counters contain NO prompts, images, student personal data, or secrets.
create table if not exists public.media_ai_daily_usage (
  organizer_id uuid not null references public.organizers(id) on delete cascade,
  usage_date date not null,
  request_count integer not null default 0 check (request_count between 0 and 5),
  primary key (organizer_id, usage_date)
);
alter table public.media_ai_daily_usage enable row level security;

-- A second daily cap prevents growth in the number of organizers from
-- increasing costs without limit. 20 image requests per UTC day organization-wide.
create table if not exists public.media_ai_org_daily_usage (
  usage_date date primary key,
  request_count integer not null default 0 check (request_count between 0 and 20)
);
alter table public.media_ai_org_daily_usage enable row level security;
revoke all on public.media_ai_org_daily_usage from public, anon, authenticated;
revoke all on public.media_ai_daily_usage from public, anon, authenticated;

create or replace function public.media_ai_reserve(p_organizer uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer;
        v_org_count integer;
begin
  if not exists (
    select 1 from public.organizers o
    where o.id = p_organizer and o.status = 'active' and o.lock_reason is null
  ) then
    raise exception 'Active organizer required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.organizer_grants g
    where g.organizer_id = p_organizer and g.revoked_at is null
      and (g.role = 'fore_director'::public.portal_role
        or (g.role = 'director'::public.portal_role and g.department = 'media'::public.portal_department)
        or (g.role = 'media_crew'::public.portal_role and g.department = 'media'::public.portal_department))
  ) then
    raise exception 'Media access required' using errcode = '42501';
  end if;
  insert into public.media_ai_daily_usage as q (organizer_id, usage_date, request_count)
  values (p_organizer, (now() at time zone 'UTC')::date, 1)
  on conflict (organizer_id, usage_date) do update
    set request_count = q.request_count + 1
    where q.request_count < 5
  returning request_count into v_count;
  if v_count is null then
    raise exception 'Daily generation budget exhausted' using errcode = 'P0001';
  end if;
  insert into public.media_ai_org_daily_usage as q (usage_date, request_count)
  values ((now() at time zone 'UTC')::date, 1)
  on conflict (usage_date) do update
    set request_count = q.request_count + 1
    where q.request_count < 20
  returning request_count into v_org_count;
  if v_org_count is null then
    raise exception 'Daily organizational image budget exhausted' using errcode = 'P0001';
  end if;
  return 5 - v_count;
end;
$$;
revoke all on function public.media_ai_reserve(uuid) from public, anon, authenticated;
grant execute on function public.media_ai_reserve(uuid) to service_role;
