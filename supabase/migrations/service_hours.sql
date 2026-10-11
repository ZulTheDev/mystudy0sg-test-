-- Study0SG v1.1: evidence-backed service-hours ledger.
-- Apply AFTER v1.0 portal_core and workflows migrations.
-- IMPORTANT: All writes are backend-only. Never pass a service-role key to the SPA.

begin;

-- These records identify which Google integration is permitted to access resources.
-- No OAuth access token or service-account private key belongs in this table.
create table if not exists public.google_integrations (
  purpose text primary key check (purpose in ('curriculum_reader','operations_writer','events_calendar')),
  service_account_email text not null,
  resource_allowlist text[] not null default '{}',
  enabled boolean not null default false,
  last_health_check_at timestamptz,
  last_health_status text check (last_health_status in ('ok','error','disabled')),
  updated_at timestamptz not null default now()
);

-- The backend inserts an event for real activity, not for passive page views.
create table if not exists public.service_evidence (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.organizers(id),
  department public.portal_department not null,
  source_kind text not null check (source_kind in
    ('task','lesson','event','asset','review','planning','reflection','offline')),
  source_ref text not null check (char_length(source_ref) between 1 and 200),
  event_code text not null check (char_length(event_code) between 2 and 80),
  source_event_key text not null unique check (char_length(source_event_key) between 10 and 200),
  evidence_summary text not null check (char_length(evidence_summary) between 5 and 400),
  evidence_ref text,
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (evidence_ref is null or char_length(evidence_ref) <= 400),
  unique(id,organizer_id,department,source_kind,source_ref)
);
create index if not exists service_evidence_actor_time_idx
  on public.service_evidence(organizer_id, observed_at desc);

-- A claim is a candidate: no approved hours appear from inserting this record.
create table if not exists public.service_claims (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.organizers(id),
  department public.portal_department not null,
  evidence_id uuid not null references public.service_evidence(id),
  source_kind text not null check (source_kind in
    ('task','lesson','event','asset','review','planning','reflection','offline')),
  source_ref text not null check (char_length(source_ref) between 1 and 200),
  activity_label text not null check (char_length(activity_label) between 5 and 200),
  candidate_minutes integer not null check (candidate_minutes between 1 and 480),
  start_at timestamptz,
  end_at timestamptz,
  potential_via boolean not null default false,
  status text not null default 'pending'
    check (status in ('pending','approved','rejected')),
  approved_minutes integer,
  reviewer_id uuid references public.organizers(id),
  reviewed_at timestamptz,
  review_reason text,
  created_at timestamptz not null default now(),
  unique (organizer_id, source_kind, source_ref),
  unique (id, organizer_id),
  foreign key (evidence_id,organizer_id,department,source_kind,source_ref)
    references public.service_evidence(id,organizer_id,department,source_kind,source_ref),
  check ((start_at is null and end_at is null) or
         (start_at is not null and end_at is not null and end_at > start_at)),
  check (
    (status = 'pending' and approved_minutes is null and reviewer_id is null and reviewed_at is null) or
    (status = 'rejected' and approved_minutes is null and reviewer_id is not null and reviewed_at is not null) or
    (status = 'approved' and approved_minutes is not null and approved_minutes between 1 and 480
       and reviewer_id is not null and reviewed_at is not null)
  ),
  check (reviewer_id is null or reviewer_id <> organizer_id),
  check (review_reason is null or char_length(review_reason) <= 1000)
);
create index if not exists service_claims_pending_idx
  on public.service_claims(department,created_at) where status = 'pending';
create index if not exists service_claims_actor_idx
  on public.service_claims(organizer_id,created_at desc);

-- Start/stop sessions use server timestamps, not a volunteer's local clock.
-- Session duration is only provisional until linked to proof of work and reviewed.
create table if not exists public.service_sessions (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.organizers(id),
  department public.portal_department not null,
  source_kind text not null check (source_kind in ('task','lesson','event','planning','reflection')),
  source_ref text not null,
  started_at timestamptz not null default now(),
  last_active_at timestamptz not null default now(),
  ended_at timestamptz,
  state text not null default 'active' check (state in ('active','stopped','discarded')),
  check ((state = 'active' and ended_at is null)
      or (state <> 'active' and ended_at is not null)),
  check (ended_at is null or ended_at >= started_at)
);
create unique index if not exists one_live_service_session_per_organizer
  on public.service_sessions(organizer_id) where state = 'active';
create index if not exists service_sessions_actor_time_idx
  on public.service_sessions(organizer_id,started_at desc);

-- Ledger rows are never edited; a correction adds a matching negative row.
create table if not exists public.service_entries (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.service_claims(id),
  organizer_id uuid not null references public.organizers(id),
  entry_type text not null check (entry_type in ('award','reversal')),
  minutes_delta integer not null check (minutes_delta <> 0 and abs(minutes_delta) <= 480),
  reviewer_id uuid not null references public.organizers(id),
  reversal_of uuid unique references public.service_entries(id),
  idempotency_key text not null unique check (char_length(idempotency_key) between 10 and 200),
  reason text not null check (char_length(reason) between 4 and 1000),
  created_at timestamptz not null default now(),
  check ((entry_type = 'award' and minutes_delta > 0 and reversal_of is null)
      or (entry_type = 'reversal' and minutes_delta < 0 and reversal_of is not null)),
  check (organizer_id <> reviewer_id),
  foreign key (claim_id,organizer_id)
    references public.service_claims(id,organizer_id)
);
create unique index if not exists service_entries_one_award_per_claim
  on public.service_entries(claim_id) where entry_type = 'award';
create index if not exists service_entries_actor_idx
  on public.service_entries(organizer_id,created_at desc);

-- Protect evidence and ledger from later rewriting, including privileged app mistakes.
create or replace function public.reject_service_history_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'service history is append-only; record a correction instead';
end $$;
create trigger service_evidence_immutable
before update or delete on public.service_evidence
for each row execute function public.reject_service_history_mutation();
create trigger service_entries_immutable
before update or delete on public.service_entries
for each row execute function public.reject_service_history_mutation();

-- A Support Pool assignee may read their own allocated task without receiving
-- a blanket cross-department grant. Existing tasks_scoped_read remains in place.
create policy tasks_assignee_read on public.tasks for select to authenticated
using (public.is_active_actor() and assignee_id = public.current_actor());

-- RLS: each volunteer sees their own records; Department Directors see scoped records.
alter table public.google_integrations enable row level security;
alter table public.service_evidence enable row level security;
alter table public.service_claims enable row level security;
alter table public.service_sessions enable row level security;
alter table public.service_entries enable row level security;

create policy service_evidence_read on public.service_evidence
for select to authenticated using (
  public.is_active_actor() and
  (organizer_id = public.current_actor()
   or public.can_review_department(department))
);
create policy service_claims_read on public.service_claims
for select to authenticated using (
  public.is_active_actor() and
  (organizer_id = public.current_actor()
   or public.can_review_department(department))
);
create policy service_sessions_read on public.service_sessions
for select to authenticated using (
  public.is_active_actor() and
  (organizer_id = public.current_actor() or public.can_review_department(department))
);
create policy service_entries_read on public.service_entries
for select to authenticated using (
  public.is_active_actor() and exists (
    select 1 from public.service_claims c
    where c.id = claim_id and
      (c.organizer_id = public.current_actor()
       or public.can_review_department(c.department))
  )
);

-- Avoid exposing Google integration metadata and backend-only writes to the browser.
revoke all on public.google_integrations, public.service_evidence,
  public.service_claims, public.service_sessions, public.service_entries from anon, authenticated;
grant select on public.service_evidence, public.service_claims,
  public.service_sessions, public.service_entries to authenticated;

-- This verifies a named reviewer against current live permissions.
-- Only a backend already holding the server-only DB secret may call this function.
create or replace function public.review_service_claim(
  p_claim_id uuid,
  p_reviewer_id uuid,
  p_decision text,
  p_minutes integer,
  p_reason text,
  p_idempotency_key text,
  p_potential_via boolean default false
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_claim public.service_claims%rowtype;
  v_existing_id uuid;
  v_new_entry_id uuid;
begin
  if p_decision not in ('approve','reject')
    or p_reason is null or length(btrim(p_reason)) < 4
    or p_idempotency_key is null or length(p_idempotency_key) < 10 then
    raise exception 'Invalid review request';
  end if;

  -- Retried approvals return the previous award instead of crediting twice.
  select id into v_existing_id from public.service_entries
  where idempotency_key = p_idempotency_key and claim_id = p_claim_id
    and entry_type = 'award';
  if found then return v_existing_id; end if;

  select * into v_claim from public.service_claims
    where id = p_claim_id for update;
  if not found or v_claim.status <> 'pending' then
    raise exception 'Claim is not pending';
  end if;
  if p_reviewer_id = v_claim.organizer_id then
    raise exception 'Self approval is forbidden';
  end if;
  if not exists (
    select 1 from public.organizers o
    where o.id = p_reviewer_id and o.status = 'active' and o.lock_reason is null
      and exists (
        select 1 from public.organizer_grants g
        where g.organizer_id = o.id and g.revoked_at is null
          and (g.role = 'fore_director'::public.portal_role
            or (g.role = 'director'::public.portal_role and
                g.department = v_claim.department))
      )
  ) then
    raise exception 'Reviewer has no current department approval grant';
  end if;

  if p_decision = 'reject' then
    update public.service_claims set status = 'rejected',
      reviewer_id = p_reviewer_id, reviewed_at = now(), review_reason = p_reason
    where id = p_claim_id;
    return null;
  end if;
  if p_minutes is null or p_minutes < 1 or
     p_minutes > v_claim.candidate_minutes then
    raise exception 'Approved minutes must be within candidate bounds';
  end if;

  -- Serialize a person's approvals so simultaneous reviewers cannot double-count.
  perform pg_advisory_xact_lock(hashtext(v_claim.organizer_id::text));
  if v_claim.start_at is not null and exists (
    select 1 from public.service_claims other
    where other.organizer_id = v_claim.organizer_id
      and other.status = 'approved' and other.id <> v_claim.id
      and other.start_at is not null
      and tstzrange(other.start_at,other.end_at,'[)') &&
          tstzrange(v_claim.start_at,v_claim.end_at,'[)')
  ) then
    raise exception 'Overlapping approved contribution session';
  end if;

  update public.service_claims set status = 'approved',
    approved_minutes = p_minutes, reviewer_id = p_reviewer_id,
    reviewed_at = now(), review_reason = p_reason,
    potential_via = coalesce(p_potential_via,false)
  where id = p_claim_id;

  insert into public.service_entries
    (claim_id,organizer_id,entry_type,minutes_delta,reviewer_id,
     idempotency_key,reason)
  values (p_claim_id,v_claim.organizer_id,'award',p_minutes,p_reviewer_id,
     p_idempotency_key,p_reason)
  returning id into v_new_entry_id;
  insert into public.audit_logs(actor_id,target_id,department,event_code,severity,outcome,details)
  values (p_reviewer_id,v_claim.organizer_id,v_claim.department,
          'service.claim.approved','normal','completed',
          jsonb_build_object('claim_id',p_claim_id,'minutes',p_minutes));
  return v_new_entry_id;
end $$;

-- A reversal preserves the original positive entry for audit and issues one offset.
create or replace function public.reverse_service_award(
  p_award_id uuid,
  p_reviewer_id uuid,
  p_reason text,
  p_idempotency_key text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_award public.service_entries%rowtype;
  v_claim public.service_claims%rowtype;
  v_existing_id uuid;
  v_new_id uuid;
begin
  if p_reason is null or length(btrim(p_reason)) < 4 or
     p_idempotency_key is null or length(p_idempotency_key) < 10 then
    raise exception 'Reason and idempotency key are required';
  end if;
  select id into v_existing_id from public.service_entries
    where idempotency_key = p_idempotency_key
      and reversal_of = p_award_id and entry_type = 'reversal';
  if found then return v_existing_id; end if;
  select * into v_award from public.service_entries where id=p_award_id for update;
  if not found or v_award.entry_type <> 'award' then
    raise exception 'Original award not found';
  end if;
  select * into v_claim from public.service_claims where id=v_award.claim_id;
  if p_reviewer_id = v_award.organizer_id or not exists (
    select 1 from public.organizers o where o.id=p_reviewer_id
    and o.status='active' and o.lock_reason is null
    and exists (select 1 from public.organizer_grants g
      where g.organizer_id = p_reviewer_id and g.revoked_at is null
        and (g.role='fore_director'::public.portal_role
         or (g.role='director'::public.portal_role and
             g.department=v_claim.department)))
  ) then raise exception 'Not authorised to reverse'; end if;
  if exists (select 1 from public.service_entries where reversal_of = p_award_id) then
    raise exception 'Award has already been reversed';
  end if;
  insert into public.service_entries
    (claim_id,organizer_id,entry_type,minutes_delta,reviewer_id,reversal_of,
     idempotency_key,reason)
  values (v_award.claim_id,v_award.organizer_id,'reversal',
          -v_award.minutes_delta,p_reviewer_id,p_award_id,
          p_idempotency_key,p_reason)
  returning id into v_new_id;
  insert into public.audit_logs(actor_id,target_id,department,event_code,severity,outcome,details)
  values (p_reviewer_id,v_award.organizer_id,v_claim.department,
          'service.award.reversed','notice','completed',
          jsonb_build_object('award_id',p_award_id,'minutes',-v_award.minutes_delta));
  return v_new_id;
end $$;

-- Open an attributed work session for a task already assigned to this organizer.
create or replace function public.start_service_task_session(
  p_organizer_id uuid, p_task_id uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_task public.tasks%rowtype;
  v_session_id uuid;
begin
  if not exists (select 1 from public.organizers o
    where o.id=p_organizer_id and o.status='active' and o.lock_reason is null) then
    raise exception 'Organizer is not active';
  end if;
  select * into v_task from public.tasks where id=p_task_id;
  if not found or v_task.assignee_id <> p_organizer_id or
     v_task.status <> 'doing' then
    raise exception 'Task must be assigned and in progress';
  end if;
  if exists (select 1 from public.service_claims c
    where c.organizer_id=p_organizer_id and c.source_kind='task'
      and c.source_ref=p_task_id::text) then
    raise exception 'Task already has a contribution claim';
  end if;
  insert into public.service_sessions
    (organizer_id,department,source_kind,source_ref)
  values (p_organizer_id,v_task.department,'task',p_task_id::text)
  returning id into v_session_id;
  return v_session_id;
end $$;

-- When work is finished, calculate only candidate time using the database clock.
-- An independent Director still verifies the minutes and service eligibility.
create or replace function public.finish_service_task_session(
  p_organizer_id uuid, p_session_id uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_session public.service_sessions%rowtype;
  v_task public.tasks%rowtype;
  v_elapsed_minutes integer;
  v_evidence_id uuid;
  v_claim_id uuid;
begin
  select * into v_session from public.service_sessions
    where id=p_session_id and organizer_id=p_organizer_id for update;
  if not found or v_session.state <> 'active' or
     v_session.source_kind <> 'task' then
    raise exception 'No active task session';
  end if;
  if not exists (select 1 from public.organizers o
    where o.id=p_organizer_id and o.status='active' and o.lock_reason is null) then
    raise exception 'Organizer is no longer active';
  end if;
  select * into v_task from public.tasks
    where id=v_session.source_ref::uuid and assignee_id=p_organizer_id;
  if not found or v_task.status <> 'done' or v_task.department <> v_session.department then
    raise exception 'Assigned task must be completed first';
  end if;
  v_elapsed_minutes := ceil(extract(epoch from (now()-v_session.started_at))/60.0)::int;
  if v_elapsed_minutes < 5 then
    raise exception 'Less than five minutes; use a short-task verification workflow';
  end if;
  update public.service_sessions set state='stopped', ended_at=now(),
    last_active_at=now() where id=p_session_id;
  insert into public.service_evidence
    (organizer_id,department,source_kind,source_ref,event_code,
     source_event_key,evidence_summary,evidence_ref)
  values (p_organizer_id,v_session.department,'task',v_session.source_ref,
    'task.completed','task-session:'||p_session_id::text,
    'Assigned task completed; session duration awaiting independent review',
    'task:'||v_task.id::text)
  returning id into v_evidence_id;
  insert into public.service_claims
    (organizer_id,department,evidence_id,source_kind,source_ref,
     activity_label,candidate_minutes,start_at,end_at,potential_via)
  values (p_organizer_id,v_session.department,v_evidence_id,'task',
    v_session.source_ref,left(v_task.title,200),
    least(v_elapsed_minutes,180),v_session.started_at,now(),false)
  returning id into v_claim_id;
  return v_claim_id;
end $$;

-- Database functions default to public execution; explicitly deny it.
revoke all on function public.start_service_task_session(uuid,uuid)
  from public, anon, authenticated;
revoke all on function public.finish_service_task_session(uuid,uuid)
  from public, anon, authenticated;
revoke all on function public.review_service_claim(uuid,uuid,text,integer,text,text,boolean)
  from public, anon, authenticated;
revoke all on function public.reverse_service_award(uuid,uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.start_service_task_session(uuid,uuid) to service_role;
grant execute on function public.finish_service_task_session(uuid,uuid) to service_role;
grant execute on function public.review_service_claim(uuid,uuid,text,integer,text,text,boolean)
  to service_role;
grant execute on function public.reverse_service_award(uuid,uuid,text,text)
  to service_role;

commit;
