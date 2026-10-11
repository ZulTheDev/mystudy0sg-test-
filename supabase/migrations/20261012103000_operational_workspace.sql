-- Study0SG v1.4.1 operational organizer workspaces (after v1.4 starter).
-- Staging-first. No public participant intake or social autoposting is enabled by this migration.
-- Security: audited SECURITY DEFINER writes; no browser table write grants; no raw PII disclosure to Media.
begin;

-- The v1.4 starter is a required earlier migration.
do $$ begin
  if to_regclass('public.registration_forms') is null or to_regclass('public.organizer_chat_threads') is null then
    raise exception 'Apply 20261012090000_event_handoff_chat_starter.sql before operational workspace migration';
  end if;
end $$;

-- Media can see event names without getting access to another department's internal task records.
create or replace function public.v14_event_directory()
returns table(id uuid, title text, starts_at timestamptz, status text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_active_actor() or not (
    public.can_access_department('media'::public.portal_department)
    or public.can_access_department('community'::public.portal_department)
  ) then raise exception 'Event access required' using errcode='42501'; end if;
  return query select e.id,e.title,e.starts_at,e.status from public.portal_events e
    where e.status<>'cancelled' and (e.department in ('media','community','education') or public.has_grant('fore_director'::public.portal_role)) order by e.starts_at desc limit 150;
end $$;

-- Form preview authoring: no 'published' status until a guardian-aware public intake API exists.
create or replace function public.v14_save_form(p_event_id uuid,p_title text,p_schema jsonb,p_id uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_owner uuid;
begin
  if not public.is_active_actor() or not public.can_access_department('media'::public.portal_department)
    then raise exception 'Media team access required' using errcode='42501'; end if;
  if char_length(trim(coalesce(p_title,''))) not between 3 and 160
    or p_schema is null or jsonb_typeof(p_schema)<>'object' or pg_column_size(p_schema)>12000
    then raise exception 'Invalid form title or schema'; end if;
  if not exists(select 1 from public.portal_events e where e.id=p_event_id and e.status<>'cancelled' and (e.department in ('media','community','education') or public.has_grant('fore_director'::public.portal_role)))
    then raise exception 'Select an existing active event'; end if;
  if p_id is null then
    insert into public.registration_forms(event_id,title,schema_json,created_by,status)
      values(p_event_id,trim(p_title),p_schema,public.current_actor(),'draft') returning id into v_id;
  else
    select created_by into v_owner from public.registration_forms where id=p_id for update;
    if v_owner is null then raise exception 'Form does not exist'; end if;
    if v_owner<>public.current_actor() and not public.can_review_department('media'::public.portal_department)
      then raise exception 'Only creator or Media Director may edit' using errcode='42501'; end if;
    update public.registration_forms set title=trim(p_title),schema_json=p_schema,
      event_id=p_event_id,form_version=form_version+1,status='draft',updated_at=now() where id=p_id;
    v_id:=p_id;
  end if;
  perform public.portal_log_change('form.saved',public.current_actor(),null,'media'::public.portal_department,jsonb_build_object('form_id',v_id));
  return v_id;
end $$;

create or replace function public.v14_submit_handoff(p_event_id uuid,p_notes text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_registered int; v_confirmed int;
begin
  if not public.is_active_actor() or not public.can_review_department('media'::public.portal_department)
    then raise exception 'Media Director approval required' using errcode='42501'; end if;
  if char_length(coalesce(p_notes,''))>1200 then raise exception 'Notes too long'; end if;
  if not exists(select 1 from public.portal_events where id=p_event_id and status<>'cancelled' and (department in ('media','community','education') or public.has_grant('fore_director'::public.portal_role)))
    then raise exception 'Unknown or cancelled event'; end if;
  select count(*)::int,count(*) filter(where r.status='confirmed')::int into v_registered,v_confirmed
  from public.event_registrations r join public.registration_forms f on f.id=r.form_id
  where f.event_id=p_event_id and r.status<>'withdrawn';
  insert into public.event_handoffs(event_id,created_by,registered_count,confirmed_count,notes)
    values(p_event_id,public.current_actor(),v_registered,v_confirmed,left(coalesce(p_notes,''),1200))
    returning id into v_id;
  perform public.portal_log_change('handoff.submitted',public.current_actor(),null,'media'::public.portal_department,jsonb_build_object('handoff_id',v_id,'registered',v_registered,'confirmed',v_confirmed));
  return v_id;
end $$;

create or replace function public.v14_review_handoff(p_id uuid,p_status text,p_notes text default '')
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_active_actor() or not public.can_review_department('community'::public.portal_department)
    then raise exception 'Community Director required' using errcode='42501'; end if;
  if p_status not in ('reviewing','approved','returned') or char_length(coalesce(p_notes,''))>1200
    then raise exception 'Invalid review'; end if;
  update public.event_handoffs set status=p_status,reviewed_by=public.current_actor(),reviewed_at=now(),notes=left(coalesce(p_notes,''),1200) where id=p_id;
  if not found then raise exception 'Handoff not found'; end if;
  perform public.portal_log_change('handoff.reviewed',public.current_actor(),null,'community'::public.portal_department,jsonb_build_object('handoff_id',p_id,'status',p_status));
end $$;

-- Organizers only see confirmed participants for grouping, never public participant records.
create or replace function public.v14_group_candidates(p_event_id uuid)
returns table(registration_id uuid,participant_name text,interest_data jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_active_actor() or not public.can_access_department('community'::public.portal_department)
    then raise exception 'Community team required' using errcode='42501'; end if;
  return query select r.id,p.display_name,r.interest_data
    from public.event_registrations r join public.event_participants p on p.id=r.participant_id
    join public.registration_forms f on f.id=r.form_id
    where f.event_id=p_event_id and r.status='confirmed' and r.guardian_confirmed_at is not null
    order by r.created_at asc limit 500;
end $$;

create table if not exists public.v14_group_plans(
 id uuid primary key default gen_random_uuid(),event_id uuid not null references public.portal_events(id),
 title text not null check(char_length(title) between 3 and 120),group_count integer not null check(group_count between 1 and 40),
 assignments jsonb not null default '[]'::jsonb, status text not null default 'draft' check(status in ('draft','approved')),
 created_by uuid not null references public.organizers(id),approved_by uuid references public.organizers(id),created_at timestamptz not null default now());
alter table public.v14_group_plans enable row level security;
revoke all on public.v14_group_plans from public,anon,authenticated;
grant select on public.v14_group_plans to authenticated;
create policy v14_group_plans_read on public.v14_group_plans for select to authenticated using
  (public.is_active_actor() and public.can_access_department('community'::public.portal_department));

create or replace function public.v14_save_group_plan(p_event_id uuid,p_title text,p_group_count int,p_assignments jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;v_input_count int;v_valid_count int;
begin
 if not public.is_active_actor() or not public.can_access_department('community'::public.portal_department)
   then raise exception 'Community access required' using errcode='42501'; end if;
 if char_length(trim(coalesce(p_title,''))) not between 3 and 120 or p_group_count not between 1 and 40
   or jsonb_typeof(p_assignments)<>'array' or pg_column_size(p_assignments)>50000
   then raise exception 'Invalid group plan'; end if;
 -- Only UUIDs in confirmed, guardian-verified event registrations may be assigned.
 select count(*) into v_input_count from jsonb_array_elements(p_assignments);
 if v_input_count>500 then raise exception 'Too many members in group plan'; end if;
 if not exists(select 1 from public.portal_events e where e.id=p_event_id and e.department in ('media','community','education')) and not public.has_grant('fore_director'::public.portal_role) then raise exception 'Event not available' using errcode='42501'; end if;
 if exists (select 1 from jsonb_array_elements(p_assignments) a where
     jsonb_typeof(a)<>'object' or not(a ? 'id' and a ? 'group')
     or coalesce(a->>'id','') !~ '^[0-9a-fA-F-]{36}$'
     or coalesce(a->>'group','') !~ '^[0-9]{1,2}$'
     or (a->>'group')::integer not between 1 and p_group_count) then
   raise exception 'Invalid group assignments'; end if;
 if (select count(distinct a->>'id') from jsonb_array_elements(p_assignments) a)<>v_input_count
    then raise exception 'Duplicate participant in plan'; end if;
 select count(*) into v_valid_count from public.event_registrations r
   join public.registration_forms f on f.id=r.form_id
   join jsonb_array_elements(p_assignments) a on r.id::text=a->>'id'
   where f.event_id=p_event_id and r.status='confirmed' and r.guardian_confirmed_at is not null;
 if v_valid_count<>v_input_count then raise exception 'Plan includes ineligible registrations'; end if;
 insert into public.v14_group_plans(event_id,title,group_count,assignments,created_by)
 values(p_event_id,trim(p_title),p_group_count,p_assignments,public.current_actor()) returning id into v_id;
 perform public.portal_log_change('groups.proposed',public.current_actor(),null,'community'::public.portal_department,jsonb_build_object('plan_id',v_id,'participants',v_input_count));
 return v_id;
end $$;

create or replace function public.v14_approve_group_plan(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if not public.is_active_actor() or not public.can_review_department('community'::public.portal_department)
   then raise exception 'Community Director required' using errcode='42501'; end if;
 update public.v14_group_plans set status='approved',approved_by=public.current_actor() where id=p_id and status='draft';
 if not found then raise exception 'Draft plan not found'; end if;
 perform public.portal_log_change('groups.approved',public.current_actor(),null,'community'::public.portal_department,jsonb_build_object('plan_id',p_id));
end $$;

-- Secure organizer chats. No hidden global admin DM bypass.
create or replace function public.v14_chat_directory()
returns table(id uuid,display_name text) language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_active_actor() then raise exception 'Active organizer required' using errcode='42501'; end if;
 return query select o.id,o.display_name from public.organizers o where o.status='active' and o.lock_reason is null order by o.display_name limit 500;
end $$;

create unique index if not exists v14_only_one_global_thread on public.organizer_chat_threads(kind) where kind='global';
create or replace function public.v14_chat_open_global() returns uuid
language plpgsql security definer set search_path='' as $$
declare v_thread uuid;
begin
 if not public.is_active_actor() then raise exception 'Active organizer required' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(1874311);
 select id into v_thread from public.organizer_chat_threads where kind='global' limit 1;
 if v_thread is null then
   insert into public.organizer_chat_threads(kind,title,created_by)
    values('global','All Organizers',public.current_actor()) returning id into v_thread;
 end if;
 insert into public.organizer_chat_members(thread_id,organizer_id) values(v_thread,public.current_actor()) on conflict do nothing;
 return v_thread;
end $$;

create or replace function public.v14_chat_open_direct(p_partner uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_thread uuid;
begin
 if not public.is_active_actor() or p_partner=public.current_actor() then raise exception 'Invalid conversation' using errcode='42501'; end if;
 if not exists(select 1 from public.organizers where id=p_partner and status='active' and lock_reason is null)
    then raise exception 'Organizer unavailable'; end if;
 -- Prevent duplicate direct threads under concurrent requests.
 perform pg_catalog.pg_advisory_xact_lock(hashtext(least(p_partner::text,public.current_actor()::text)||greatest(p_partner::text,public.current_actor()::text)));
 select t.id into v_thread from public.organizer_chat_threads t
   where t.kind='direct' and (select count(*) from public.organizer_chat_members m where m.thread_id=t.id)=2
   and exists(select 1 from public.organizer_chat_members m where m.thread_id=t.id and m.organizer_id=public.current_actor())
   and exists(select 1 from public.organizer_chat_members m where m.thread_id=t.id and m.organizer_id=p_partner) limit 1;
 if v_thread is null then
   insert into public.organizer_chat_threads(kind,title,created_by) values('direct','Direct message',public.current_actor()) returning id into v_thread;
   insert into public.organizer_chat_members(thread_id,organizer_id) values(v_thread,public.current_actor()),(v_thread,p_partner);
 end if;
 return v_thread;
end $$;

create or replace function public.v14_chat_send(p_thread uuid,p_body text) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if not public.is_chat_member(p_thread) then raise exception 'Not a chat member' using errcode='42501'; end if;
 if char_length(trim(coalesce(p_body,''))) not between 1 and 2000 then raise exception 'Message must be 1–2000 characters'; end if;
 if (select count(*) from public.organizer_chat_messages where organizer_id=public.current_actor() and sent_at>now()-interval '1 minute')>=20
   then raise exception 'Too many messages; wait a minute'; end if;
 insert into public.organizer_chat_messages(thread_id,organizer_id,body) values(p_thread,public.current_actor(),trim(p_body)) returning id into v_id;
 return v_id;
end $$;

-- Workbench documents: EDM layouts and simple wireframe plans, not executable code.
create table if not exists public.v14_studio_documents(
 id uuid primary key default gen_random_uuid(),kind text not null check(kind in ('edm','wireframe')),
 title text not null check(char_length(title) between 3 and 150),
 body jsonb not null default '{}'::jsonb,author_id uuid not null references public.organizers(id),
 updated_at timestamptz not null default now());
alter table public.v14_studio_documents enable row level security;
revoke all on public.v14_studio_documents from public,anon,authenticated;
grant select on public.v14_studio_documents to authenticated;
create policy v14_studio_read on public.v14_studio_documents for select to authenticated using
(public.is_active_actor() and ((kind='edm' and public.can_access_department('media'::public.portal_department)) or
 (kind='wireframe' and public.can_access_department('technology'::public.portal_department))));

create or replace function public.v14_save_studio(p_kind text,p_title text,p_body jsonb,p_id uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_owner uuid;v_kind text;
begin
 if not public.is_active_actor() or not(
   (p_kind='edm' and public.can_access_department('media'::public.portal_department)) or
   (p_kind='wireframe' and public.can_access_department('technology'::public.portal_department)))
   then raise exception 'Workspace access required' using errcode='42501'; end if;
 if char_length(trim(coalesce(p_title,''))) not between 3 and 150 or
   p_body is null or jsonb_typeof(p_body)<>'object' or pg_column_size(p_body)>50000
   then raise exception 'Invalid document'; end if;
 if p_id is null then
   insert into public.v14_studio_documents(kind,title,body,author_id) values(p_kind,trim(p_title),p_body,public.current_actor()) returning id into v_id;
 else
   select author_id,kind into v_owner,v_kind from public.v14_studio_documents where id=p_id for update;
   if v_owner is null or v_kind<>p_kind then raise exception 'Document not found'; end if;
   if v_owner<>public.current_actor() and not public.can_review_department(
       (case when p_kind='edm' then 'media' else 'technology' end)::public.portal_department)
      then raise exception 'Only owner or Director can edit' using errcode='42501'; end if;
   update public.v14_studio_documents set title=trim(p_title),body=p_body,updated_at=now() where id=p_id;
   v_id:=p_id;
 end if;
 perform public.portal_log_change('studio.saved',public.current_actor(),null,
   (case when p_kind='edm' then 'media' else 'technology' end)::public.portal_department,jsonb_build_object('document_id',v_id,'kind',p_kind));
 return v_id;
end $$;

-- Course / SOP library, editable only by department managers.
create table if not exists public.v14_learning_resources(
 id uuid primary key default gen_random_uuid(),title text not null check(char_length(title) between 3 and 160),
 department public.portal_department,category text not null default 'sop' check(category in ('sop','course')),
 content_text text not null check(char_length(content_text) between 1 and 12000),
 version integer not null default 1,approved boolean not null default false,
 author_id uuid not null references public.organizers(id),updated_at timestamptz not null default now());
alter table public.v14_learning_resources enable row level security;
revoke all on public.v14_learning_resources from public,anon,authenticated;
grant select on public.v14_learning_resources to authenticated;
create policy v14_learning_read on public.v14_learning_resources for select to authenticated using
 (public.is_active_actor() and (public.has_grant('fore_director'::public.portal_role) or
 (approved and (department is null or public.can_access_department(department))) or
 (department is not null and public.can_review_department(department))));

create or replace function public.v14_learning_save(p_title text,p_department public.portal_department,p_category text,p_content text,p_id uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_dept public.portal_department;
begin
 if not public.is_active_actor() or not(public.has_grant('fore_director'::public.portal_role) or
    (p_department is not null and public.can_review_department(p_department)))
    then raise exception 'Department manager required' using errcode='42501'; end if;
 if char_length(trim(coalesce(p_title,''))) not between 3 and 160 or char_length(coalesce(p_content,'')) not between 1 and 12000
   or p_category not in ('sop','course') then raise exception 'Invalid learning resource'; end if;
 if p_id is null then
   insert into public.v14_learning_resources(title,department,category,content_text,author_id)
     values(trim(p_title),p_department,p_category,p_content,public.current_actor()) returning id into v_id;
 else
   select department into v_dept from public.v14_learning_resources where id=p_id for update;
   if not found then raise exception 'Resource not found'; end if;
   if not public.has_grant('fore_director'::public.portal_role) and (v_dept is distinct from p_department or not public.can_review_department(v_dept))
     then raise exception 'Cannot change resource department' using errcode='42501'; end if;
   update public.v14_learning_resources set title=trim(p_title),category=p_category,content_text=p_content,
    version=version+1,approved=false,department=p_department,updated_at=now() where id=p_id;
   v_id:=p_id;
 end if;
 perform public.portal_log_change('learning.saved',public.current_actor(),null,p_department,jsonb_build_object('resource_id',v_id));
 return v_id;
end $$;

create or replace function public.v14_learning_approve(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v_dept public.portal_department;
begin
 select department into v_dept from public.v14_learning_resources where id=p_id for update;
 if not found then raise exception 'Resource not found'; end if;
 if not public.has_grant('fore_director'::public.portal_role) and (v_dept is null or not public.can_review_department(v_dept))
   then raise exception 'Department manager required' using errcode='42501'; end if;
 update public.v14_learning_resources set approved=true,updated_at=now() where id=p_id;
 perform public.portal_log_change('learning.approved',public.current_actor(),null,v_dept,jsonb_build_object('resource_id',p_id));
end $$;

-- Marketing: contact CRM and ledger entries are accessed by Fore Director or scoped department.
-- Existing enum uses no marketing department; Fore Director administers until approved role migration.
create table if not exists public.v14_partner_contacts(
 id uuid primary key default gen_random_uuid(),name text not null check(char_length(name) between 2 and 160),
 organization text not null check(char_length(organization) between 2 and 160),purpose text not null default '',
 stage text not null default 'research' check(stage in ('research','contacted','discussion','partner','inactive')),
 source_url text not null default '',created_by uuid not null references public.organizers(id),updated_at timestamptz not null default now());
create table if not exists public.v14_finance_entries(
 id uuid primary key default gen_random_uuid(),project text not null check(char_length(project) between 2 and 140),
 kind text not null check(kind in ('budget','income','expense')),
 amount_cents bigint not null check(amount_cents>=0 and amount_cents<=100000000000),
 notes text not null default '',created_by uuid not null references public.organizers(id),created_at timestamptz not null default now());
alter table public.v14_partner_contacts enable row level security;
alter table public.v14_finance_entries enable row level security;
revoke all on public.v14_partner_contacts,public.v14_finance_entries from public,anon,authenticated;
grant select on public.v14_partner_contacts,public.v14_finance_entries to authenticated;
create policy v14_partner_read on public.v14_partner_contacts for select to authenticated using
(public.has_grant('fore_director'::public.portal_role));
create policy v14_finance_read on public.v14_finance_entries for select to authenticated using
(public.has_grant('fore_director'::public.portal_role));

create or replace function public.v14_partner_add(p_name text,p_organization text,p_purpose text,p_stage text,p_source_url text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if not public.has_grant('fore_director'::public.portal_role) then raise exception 'Fore Director required' using errcode='42501'; end if;
 if char_length(trim(coalesce(p_name,''))) not between 2 and 160 or char_length(trim(coalesce(p_organization,''))) not between 2 and 160
  or char_length(coalesce(p_purpose,''))>2000 or p_stage not in ('research','contacted','discussion','partner','inactive')
  or char_length(coalesce(p_source_url,''))>600 then raise exception 'Invalid contact'; end if;
 insert into public.v14_partner_contacts(name,organization,purpose,stage,source_url,created_by)
 values(trim(p_name),trim(p_organization),coalesce(p_purpose,''),p_stage,coalesce(p_source_url,''),public.current_actor()) returning id into v_id;
 perform public.portal_log_change('partner.added',public.current_actor(),null,'executive'::public.portal_department,jsonb_build_object('contact_id',v_id));return v_id;
end $$;

create or replace function public.v14_finance_add(p_project text,p_kind text,p_amount_cents bigint,p_notes text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if not public.has_grant('fore_director'::public.portal_role) then raise exception 'Fore Director required' using errcode='42501'; end if;
 if char_length(trim(coalesce(p_project,''))) not between 2 and 140 or p_kind not in ('budget','income','expense')
  or p_amount_cents not between 0 and 100000000000 or char_length(coalesce(p_notes,''))>2000
  then raise exception 'Invalid ledger entry'; end if;
 insert into public.v14_finance_entries(project,kind,amount_cents,notes,created_by)
 values(trim(p_project),p_kind,p_amount_cents,coalesce(p_notes,''),public.current_actor()) returning id into v_id;
 perform public.portal_log_change('finance.recorded',public.current_actor(),null,'executive'::public.portal_department,jsonb_build_object('entry_id',v_id,'kind',p_kind));return v_id;
end $$;

-- Aggregates only: individual interest responses must not appear in marketing views.
create or replace function public.v14_growth_metrics() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_events int;v_confirmed int;v_submitted int;v_partners int;
begin
 if not public.has_grant('fore_director'::public.portal_role) then raise exception 'Growth access required' using errcode='42501'; end if;
 select count(*) into v_events from public.portal_events where status<>'cancelled';
 select count(*) filter(where status='confirmed'),count(*) filter(where status<>'withdrawn') into v_confirmed,v_submitted from public.event_registrations;
 select count(*) into v_partners from public.v14_partner_contacts where stage='partner';
 return jsonb_build_object('events',v_events,'confirmed_registrations',v_confirmed,'total_registrations',v_submitted,'partner_contacts',v_partners);
end $$;

-- Explicit execute grants, never grant write to browser roles on tables.
do $$ declare r record;begin
 for r in select p.oid::regprocedure::text as sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname like 'v14_%' loop
   execute format('revoke all on function %s from public,anon',r.sig);
   execute format('grant execute on function %s to authenticated',r.sig);
 end loop;
end $$;
commit;
