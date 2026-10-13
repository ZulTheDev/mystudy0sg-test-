-- Study0SG v1.2 interactive operations.
-- Run AFTER portal core, workflows and service-hours migrations.
-- No hard deletes for organizers, tasks, applications, or audit records.
begin;

-- Historical tasks stay available to auditors instead of being permanently deleted.
alter table public.tasks add column if not exists archived_at timestamptz;
alter table public.tasks add column if not exists created_by uuid references public.organizers(id);

-- Events can be edited by their department Director or a Fore Director.
create table if not exists public.portal_events (
  id uuid primary key default gen_random_uuid(),
  department public.portal_department not null,
  title text not null check (char_length(title) between 3 and 160),
  description text not null default '' check (char_length(description) <= 3000),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  venue text not null default '' check (char_length(venue) <= 160),
  status text not null default 'draft' check (status in ('draft','published','cancelled')),
  created_by uuid not null references public.organizers(id),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
alter table public.portal_events enable row level security;
create policy portal_events_department_read on public.portal_events for select to authenticated
using (public.is_active_actor() and public.can_access_department(department));
revoke all on public.portal_events from anon, authenticated;
grant select on public.portal_events to authenticated;

-- Fore Directors may view the full organizer directory; department Directors
-- can see assigned members without an organization-wide directory grant.
create policy organizers_director_team_read on public.organizers for select to authenticated
using (
  public.is_active_actor() and exists (
    select 1 from public.organizer_grants member_grant
    where member_grant.organizer_id = organizers.id
      and member_grant.department is not null
      and member_grant.revoked_at is null
      and public.has_grant('director'::public.portal_role, member_grant.department)
  )
);

-- Every write requires live authorization and produces an audit event.
-- This helper is only invoked by SECURITY DEFINER functions below.
create or replace function public.portal_log_change(
  p_event text, p_actor uuid, p_target uuid,
  p_department public.portal_department, p_details jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_logs(actor_id,target_id,department,event_code,severity,outcome,details)
  values(p_actor,p_target,p_department,left(p_event,80),'notice','completed',coalesce(p_details,'{}'::jsonb));
end; $$;
revoke all on function public.portal_log_change(text,uuid,uuid,public.portal_department,jsonb) from public,anon,authenticated;

-- Authorized department managers can create tasks for any organizer
-- assigned to the same department (including Support Pool assistants).
create or replace function public.portal_task_create(
  p_department public.portal_department, p_title text,
  p_description text default '', p_assignee_id uuid default null,
  p_due_at timestamptz default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.is_active_actor() or not public.can_review_department(p_department) then
    raise exception 'Department manager required' using errcode='42501';
  end if;
  if length(trim(coalesce(p_title,''))) not between 3 and 200
     or length(coalesce(p_description,'')) > 4000 then
    raise exception 'Invalid task title or description';
  end if;
  if p_assignee_id is not null and not exists (
    select 1 from public.organizers o where o.id=p_assignee_id and o.status='active'
      and (o.primary_department=p_department or exists (
        select 1 from public.organizer_grants g where g.organizer_id=o.id
          and g.department=p_department and g.revoked_at is null
      ) or exists (
        select 1 from public.organizer_grants g where g.organizer_id=o.id
          and g.role='support_pool' and g.revoked_at is null
      ))
  ) then raise exception 'Assignee is not active or assigned to this department'; end if;
  insert into public.tasks(department,title,description,assignee_id,due_at,created_by)
    values(p_department,trim(p_title),p_description,p_assignee_id,p_due_at,public.current_actor())
    returning id into v_id;
  perform public.portal_log_change('task.created',public.current_actor(),p_assignee_id,p_department,jsonb_build_object('task_id',v_id));
  return v_id;
end; $$;

-- This operation is for department managers; assignees can only change status.
create or replace function public.portal_task_update(
  p_id uuid, p_title text, p_description text, p_assignee_id uuid,
  p_status text, p_due_at timestamptz
) returns void language plpgsql security definer set search_path = '' as $$
declare v_department public.portal_department;
begin
  select department into v_department from public.tasks where id=p_id and archived_at is null for update;
  if not found then raise exception 'Task not found'; end if;
  if not public.is_active_actor() or not public.can_review_department(v_department) then
    raise exception 'Department manager required' using errcode='42501';
  end if;
  if length(trim(coalesce(p_title,''))) not between 3 and 200
      or length(coalesce(p_description,'')) > 4000
      or p_status not in ('todo','doing','blocked','done') then
    raise exception 'Invalid task data';
  end if;
  if p_assignee_id is not null and not exists (
    select 1 from public.organizers o where o.id=p_assignee_id and o.status='active'
      and (o.primary_department=v_department or exists (
        select 1 from public.organizer_grants g where g.organizer_id=o.id
          and g.department=v_department and g.revoked_at is null
      ) or exists (
        select 1 from public.organizer_grants g where g.organizer_id=o.id
          and g.role='support_pool' and g.revoked_at is null
      ))
  ) then raise exception 'Assignee is not eligible'; end if;
  update public.tasks set title=trim(p_title),description=p_description,assignee_id=p_assignee_id,
      status=p_status,due_at=p_due_at,updated_at=now() where id=p_id;
  perform public.portal_log_change('task.updated',public.current_actor(),p_assignee_id,v_department,jsonb_build_object('task_id',p_id));
end; $$;

-- Individual assignees can move their own tasks through the workflow.
create or replace function public.portal_task_set_status(p_id uuid,p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_task public.tasks%rowtype;
begin
  select * into v_task from public.tasks where id=p_id and archived_at is null for update;
  if not found then raise exception 'Task not found'; end if;
  if not public.is_active_actor() or not (
    v_task.assignee_id=public.current_actor() or public.can_review_department(v_task.department)
  ) then raise exception 'Task access denied' using errcode='42501'; end if;
  if p_status not in ('todo','doing','blocked','done') then raise exception 'Invalid status'; end if;
  update public.tasks set status=p_status, updated_at=now() where id=p_id;
  perform public.portal_log_change('task.status_changed',public.current_actor(),v_task.assignee_id,v_task.department,jsonb_build_object('task_id',p_id,'status',p_status));
end; $$;

-- Archive (soft delete) preserves audit and VIA references.
create or replace function public.portal_task_archive(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_task public.tasks%rowtype;
begin
  select * into v_task from public.tasks where id=p_id and archived_at is null for update;
  if not found then raise exception 'Task not found'; end if;
  if not public.is_active_actor() or not public.can_review_department(v_task.department) then
    raise exception 'Department manager required' using errcode='42501';
  end if;
  update public.tasks set archived_at=now(),updated_at=now() where id=p_id;
  perform public.portal_log_change('task.archived',public.current_actor(),v_task.assignee_id,v_task.department,jsonb_build_object('task_id',p_id));
end; $$;

-- The Fore Director can register volunteers for invitation, but not
-- impersonate members or activate them before Stytch linking.
create or replace function public.portal_organizer_create(
  p_name text, p_email text, p_department public.portal_department
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.has_grant('fore_director'::public.portal_role) then
    raise exception 'Fore Director only' using errcode='42501';
  end if;
  if length(trim(coalesce(p_name,''))) not between 2 and 100 or
     lower(trim(coalesce(p_email,''))) !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Invalid name or email';
  end if;
  insert into public.organizers(display_name,email,status,primary_department)
    values(trim(p_name),lower(trim(p_email)),'invited',p_department)
    returning id into v_id;
  perform public.portal_log_change('organizer.invited',public.current_actor(),v_id,p_department);
  return v_id;
end; $$;

-- Organization-wide admin can edit staff details and suspend access.
-- Activation of invited accounts still requires verified Stytch linking.
create or replace function public.portal_organizer_update(
  p_id uuid, p_name text, p_department public.portal_department, p_status text
) returns void language plpgsql security definer set search_path = '' as $$
declare v_old public.organizers%rowtype;
begin
  if not public.has_grant('fore_director'::public.portal_role) then
    raise exception 'Fore Director only' using errcode='42501'; end if;
  select * into v_old from public.organizers where id=p_id for update;
  if not found then raise exception 'Organizer not found'; end if;
  if length(trim(coalesce(p_name,''))) not between 2 and 100 then raise exception 'Invalid name'; end if;
  if p_status not in ('active','suspended','invited') then raise exception 'Offboarding requires its review workflow'; end if;
  if p_status='invited' and v_old.status<>'invited' then
    raise exception 'Cannot revert an existing organizer to invited'; end if;
  if p_status='active' and v_old.status='invited' then
    raise exception 'Complete Stytch identity verification to activate';
  end if;
  if p_status <> v_old.status::text and exists (select 1 from public.organizer_grants g
    where g.organizer_id=p_id and g.role='fore_director' and g.revoked_at is null) then
    raise exception 'Fore Director status changes require independent review'; end if;
  if p_status <> v_old.status::text and p_id=public.current_actor() then
    raise exception 'Cannot change your own account status';
  end if;
  if v_old.status in ('pending_offboard','offboarded') then
    raise exception 'Offboarding cannot be bypassed'; end if;
  if p_status='active' and not exists(select 1 from public.identity_links where organizer_id=p_id) then
    raise exception 'An active organizer must have a verified identity link'; end if;
  update public.organizers set display_name=trim(p_name),primary_department=p_department,
    status=p_status::public.portal_status,session_epoch=session_epoch+case when p_status<>v_old.status::text then 1 else 0 end,
    updated_at=now() where id=p_id;
  perform public.portal_log_change('organizer.updated',public.current_actor(),p_id,p_department,jsonb_build_object('status',p_status));
end; $$;

-- Profile editing is limited to safe fields; no role or identity changes.
create or replace function public.portal_profile_update(p_bio text,p_public_bio text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_active_actor() then raise exception 'Active session required' using errcode='42501'; end if;
  if length(coalesce(p_bio,'')) > 2000 or length(coalesce(p_public_bio,'')) > 300 then
    raise exception 'Biography exceeds length limit'; end if;
  update public.organizers set private_bio=p_bio, public_bio=p_public_bio,updated_at=now()
    where id=public.current_actor();
  perform public.portal_log_change('profile.updated',public.current_actor(),public.current_actor(),null);
end; $$;

-- Fore Directors manage scoped roles, but cannot silently create new owners.
-- Creating/revoking fore_director grants requires a separate two-person process.
create or replace function public.portal_grant_add(
  p_organizer_id uuid,p_role public.portal_role,p_department public.portal_department
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.has_grant('fore_director'::public.portal_role) then
    raise exception 'Fore Director only' using errcode='42501'; end if;
  if p_role='fore_director' or p_department is null then
    raise exception 'Owner-level grants require second-review process'; end if;
  if (p_role='support_pool' and p_department<>'support') or
     (p_role='community_crew' and p_department<>'community') or
     (p_role='media_crew' and p_department<>'media') or
     (p_role='tech_security' and p_department<>'technology') or
     (p_role='educator_circle' and p_department<>'education') then
    raise exception 'Role does not match department'; end if;
  if not exists(select 1 from public.organizers where id=p_organizer_id and status in ('invited','active','suspended')) then
    raise exception 'Organizer cannot receive grants'; end if;
  select id into v_id from public.organizer_grants
  where organizer_id=p_organizer_id and role=p_role and department=p_department
    and revoked_at is null;
  if v_id is null then
    insert into public.organizer_grants(organizer_id,role,department,granted_by)
      values(p_organizer_id,p_role,p_department,public.current_actor()) returning id into v_id;
    update public.organizers set session_epoch=session_epoch+1,updated_at=now() where id=p_organizer_id;
    perform public.portal_log_change('grant.added',public.current_actor(),p_organizer_id,p_department,jsonb_build_object('role',p_role));
  end if;
  return v_id;
end; $$;

create or replace function public.portal_grant_revoke(p_grant_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_grant public.organizer_grants%rowtype;
begin
  if not public.has_grant('fore_director'::public.portal_role) then
    raise exception 'Fore Director only' using errcode='42501'; end if;
  select * into v_grant from public.organizer_grants where id=p_grant_id and revoked_at is null for update;
  if not found then raise exception 'Active grant not found'; end if;
  if v_grant.role='fore_director' or v_grant.organizer_id=public.current_actor() then
    raise exception 'Owner/self grant changes require independent review'; end if;
  update public.organizer_grants set revoked_at=now() where id=p_grant_id;
  update public.organizers set session_epoch=session_epoch+1,updated_at=now() where id=v_grant.organizer_id;
  perform public.portal_log_change('grant.revoked',public.current_actor(),v_grant.organizer_id,v_grant.department,jsonb_build_object('role',v_grant.role));
end; $$;

-- Event CRUD is department-scoped and audited.
create or replace function public.portal_event_create(
  p_department public.portal_department,p_title text,p_description text,
  p_starts_at timestamptz,p_ends_at timestamptz,p_venue text,
  p_status text default 'draft'
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.is_active_actor() or not public.can_review_department(p_department) then
    raise exception 'Department manager required' using errcode='42501'; end if;
  if length(trim(coalesce(p_title,''))) not between 3 and 160 or
     length(coalesce(p_description,'')) > 3000 or length(coalesce(p_venue,'')) > 160 or
     p_ends_at <= p_starts_at or p_status not in ('draft','published') then
     raise exception 'Invalid event details'; end if;
  insert into public.portal_events(department,title,description,starts_at,ends_at,venue,status,created_by)
    values(p_department,trim(p_title),p_description,p_starts_at,p_ends_at,p_venue,p_status,public.current_actor())
    returning id into v_id;
  perform public.portal_log_change('event.created',public.current_actor(),null,p_department,jsonb_build_object('event_id',v_id));
  return v_id;
end; $$;

create or replace function public.portal_event_update(
  p_id uuid,p_title text,p_description text,p_starts_at timestamptz,
  p_ends_at timestamptz,p_venue text,p_status text
) returns void language plpgsql security definer set search_path = '' as $$
declare v_event public.portal_events%rowtype;
begin
  select * into v_event from public.portal_events where id=p_id for update;
  if not found then raise exception 'Event not found'; end if;
  if not public.is_active_actor() or not public.can_review_department(v_event.department) then
    raise exception 'Department manager required' using errcode='42501'; end if;
  if v_event.status='cancelled' then raise exception 'Cancelled event cannot be edited'; end if;
  if length(trim(coalesce(p_title,''))) not between 3 and 160 or
     length(coalesce(p_description,'')) > 3000 or length(coalesce(p_venue,'')) > 160 or
     p_ends_at <= p_starts_at or p_status not in ('draft','published') then
    raise exception 'Invalid event details'; end if;
  update public.portal_events set title=trim(p_title),description=p_description,
    starts_at=p_starts_at,ends_at=p_ends_at,venue=p_venue,status=p_status,updated_at=now() where id=p_id;
  perform public.portal_log_change('event.updated',public.current_actor(),null,v_event.department,jsonb_build_object('event_id',p_id));
end; $$;

create or replace function public.portal_event_cancel(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_event public.portal_events%rowtype;
begin
  select * into v_event from public.portal_events where id=p_id for update;
  if not found then raise exception 'Event not found'; end if;
  if not public.is_active_actor() or not public.can_review_department(v_event.department) then
    raise exception 'Department manager required' using errcode='42501'; end if;
  if v_event.status='cancelled' then return; end if;
  update public.portal_events set status='cancelled',updated_at=now() where id=p_id;
  perform public.portal_log_change('event.cancelled',public.current_actor(),null,v_event.department,jsonb_build_object('event_id',p_id));
end; $$;

-- Reviewers may decline; approval continues through the existing
-- approve_application workflow that creates an invited organizer.
create or replace function public.portal_application_decline(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_app public.applications%rowtype;
begin
  select * into v_app from public.applications where id=p_id for update;
  if not found then raise exception 'Application not found'; end if;
  if not public.is_active_actor() or not public.can_review_application(v_app.preferred_departments) then
    raise exception 'Application reviewer required' using errcode='42501'; end if;
  if v_app.status not in ('pending','reviewing') then raise exception 'Application already decided'; end if;
  update public.applications set status='declined',reviewed_by=public.current_actor(),reviewed_at=now()
    where id=p_id;
  perform public.portal_log_change('application.declined',public.current_actor(),null,null,jsonb_build_object('application_id',p_id));
end; $$;

-- Never grant blanket table writes to browsers.
revoke all on function public.portal_task_create(public.portal_department,text,text,uuid,timestamptz),
 public.portal_task_update(uuid,text,text,uuid,text,timestamptz),
 public.portal_task_set_status(uuid,text),public.portal_task_archive(uuid),
 public.portal_organizer_create(text,text,public.portal_department),
 public.portal_organizer_update(uuid,text,public.portal_department,text),
 public.portal_profile_update(text,text),
 public.portal_grant_add(uuid,public.portal_role,public.portal_department),
 public.portal_grant_revoke(uuid),
 public.portal_event_create(public.portal_department,text,text,timestamptz,timestamptz,text,text),
 public.portal_event_update(uuid,text,text,timestamptz,timestamptz,text,text),
 public.portal_event_cancel(uuid),public.portal_application_decline(uuid)
 from public,anon;

grant execute on function public.portal_task_create(public.portal_department,text,text,uuid,timestamptz),
 public.portal_task_update(uuid,text,text,uuid,text,timestamptz),
 public.portal_task_set_status(uuid,text),public.portal_task_archive(uuid),
 public.portal_organizer_create(text,text,public.portal_department),
 public.portal_organizer_update(uuid,text,public.portal_department,text),
 public.portal_profile_update(text,text),
 public.portal_grant_add(uuid,public.portal_role,public.portal_department),
 public.portal_grant_revoke(uuid),
 public.portal_event_create(public.portal_department,text,text,timestamptz,timestamptz,text,text),
 public.portal_event_update(uuid,text,text,timestamptz,timestamptz,text,text),
 public.portal_event_cancel(uuid),public.portal_application_decline(uuid)
 to authenticated;

-- Retire an inaccurate knowledge resource without erasing its audit trail.
-- The match_knowledge function stops retrieving it immediately.
create or replace function public.portal_knowledge_retire(p_document_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_dept public.portal_department;
begin
  if not public.has_grant('fore_director'::public.portal_role) then
    raise exception 'Fore Director only' using errcode='42501'; end if;
  select allowed_departments[1] into v_dept from public.knowledge_documents
    where id=p_document_id and approved_at is not null for update;
  if not found then raise exception 'Active knowledge document not found'; end if;
  update public.knowledge_documents set license_status='retired',approved_at=null
    where id=p_document_id;
  perform public.portal_log_change('knowledge.retired',public.current_actor(),null,v_dept,
    jsonb_build_object('document_id',p_document_id));
end; $$;
revoke all on function public.portal_knowledge_retire(uuid) from public,anon;
grant execute on function public.portal_knowledge_retire(uuid) to authenticated;

commit;
