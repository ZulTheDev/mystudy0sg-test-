-- Study0SG v2 VIA: real work evidence, draft statements, Fore Director-only approval.
-- Does NOT provide Singpass/Myinfo login or official LEAPS recognition.
-- Prerequisite: service_hours.sql applied; develop on Supabase DEV first.
begin;

alter table public.service_claims add column if not exists work_summary text;
alter table public.service_claims add column if not exists drafted_letter text;
alter table public.service_claims add column if not exists evidence_url text;
alter table public.service_claims add constraint service_claims_work_summary_bound check(work_summary is null or length(work_summary)<=2500);
alter table public.service_claims add constraint service_claims_drafted_letter_bound check(drafted_letter is null or length(drafted_letter)<=5000);
alter table public.service_claims add constraint service_claims_evidence_url_bound check(evidence_url is null or length(evidence_url)<=700);

-- Counts only meaningful organizer-triggered work events, not browser presence.
create table if not exists public.work_activity_events (
 id uuid primary key default gen_random_uuid(), organizer_id uuid not null references public.organizers(id),
 task_id uuid not null references public.tasks(id),
 action text not null check(action in ('work_started','status_updated','progress_note','evidence_added','work_finished')),
 detail text not null default '' check(length(detail)<=500),
 created_at timestamptz not null default now()
);
create index if not exists work_activity_actor_idx on public.work_activity_events(organizer_id,created_at desc);
alter table public.work_activity_events enable row level security;
revoke all on public.work_activity_events from anon,authenticated;
grant select on public.work_activity_events to authenticated;
create policy work_activity_scoped_read on public.work_activity_events for select to authenticated using (
 public.is_active_actor() and (organizer_id=public.current_actor() or
  exists(select 1 from public.tasks t where t.id=task_id and public.can_review_department(t.department)))
);

create or replace function public.v20_log_work_action(p_task uuid,p_action text,p_detail text default '')
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_task public.tasks%rowtype;
begin
 if not public.is_active_actor() then raise exception 'No organizer session';end if;
 if p_action not in ('work_started','status_updated','progress_note','evidence_added','work_finished')
    or length(coalesce(p_detail,''))>500 then raise exception 'Invalid activity event';end if;
 select * into v_task from public.tasks where id=p_task and archived_at is null;
 if not found or (v_task.assignee_id is distinct from public.current_actor() and not public.can_review_department(v_task.department))
 then raise exception 'Task not assigned or manageable';end if;
 insert into public.work_activity_events(organizer_id,task_id,action,detail)
 values(public.current_actor(),p_task,p_action,left(coalesce(p_detail,''),500)) returning id into v_id;
 return v_id;
end $$;

-- Every organizer may submit own evidence; Directors may prepare/edit within their own
-- departments; Fore Directors can prepare/edit records for any department.
-- Only pending evidence may be edited. Award ledger remains immutable.
create or replace function public.v20_via_upsert(
 p_claim uuid, p_organizer uuid, p_department public.portal_department,
 p_title text, p_minutes integer, p_summary text, p_letter text,
 p_evidence_url text default null, p_potential_via boolean default true
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=public.current_actor();v_id uuid;v_ref text;v_evidence uuid;
  v_existing public.service_claims%rowtype;
begin
 if not public.is_active_actor() then raise exception 'Not authenticated';end if;
 if p_organizer<>v_actor and not (
  public.has_grant('fore_director'::public.portal_role) or
  public.has_grant('director'::public.portal_role,p_department)
 ) then raise exception 'Only a department Director can submit for colleagues';end if;
 if not (public.has_grant('fore_director'::public.portal_role) or
  public.can_access_department(p_department) or
  (p_organizer=v_actor and exists(select 1 from public.organizers o
    where o.id=v_actor and o.primary_department=p_department)))
 then raise exception 'This department is not assigned to you';end if;
 if not exists(select 1 from public.organizers where id=p_organizer and status='active' and lock_reason is null)
 then raise exception 'Organizer is inactive';end if;
 if length(btrim(coalesce(p_title,''))) not between 5 and 200
   or p_minutes not between 1 and 480 or length(btrim(coalesce(p_summary,''))) not between 20 and 2500
   or length(coalesce(p_letter,''))>5000 or length(coalesce(p_evidence_url,''))>700
 then raise exception 'Title, duration, and work summary are required';end if;
 if p_claim is null then
   v_ref:='offline:'||gen_random_uuid()::text;
   insert into public.service_evidence(organizer_id,department,source_kind,source_ref,event_code,source_event_key,evidence_summary,evidence_ref)
   values(p_organizer,p_department,'offline',v_ref,'review.requested',
      'v20-via:'||gen_random_uuid()::text,left(btrim(p_summary),400),nullif(left(p_evidence_url,400),''))
   returning id into v_evidence;
   insert into public.service_claims(organizer_id,department,evidence_id,source_kind,source_ref,
     activity_label,candidate_minutes,potential_via,work_summary,drafted_letter,evidence_url)
   values(p_organizer,p_department,v_evidence,'offline',v_ref,btrim(p_title),p_minutes,
    p_potential_via,btrim(p_summary),nullif(p_letter,''),nullif(p_evidence_url,'')) returning id into v_id;
 else
   select * into v_existing from public.service_claims where id=p_claim for update;
   if not found or v_existing.status<>'pending' or v_existing.organizer_id<>p_organizer
     or v_existing.department<>p_department then raise exception 'Claim is no longer editable';end if;
   update public.service_claims set activity_label=btrim(p_title),candidate_minutes=p_minutes,
     work_summary=btrim(p_summary),drafted_letter=nullif(p_letter,''),
     evidence_url=nullif(p_evidence_url,''),potential_via=p_potential_via
    where id=p_claim returning id into v_id;
 end if;
 insert into public.audit_logs(actor_id,target_id,department,event_code,severity,outcome,details)
 values(v_actor,p_organizer,p_department,'via.evidence.saved','normal','completed',
  jsonb_build_object('claim_id',v_id,'minutes_requested',p_minutes));
 return v_id;
end $$;

-- A separate, cheap DB quota caps formal-letter AI drafting at 5 per organizer/day.
create table if not exists public.via_letter_credits(
 id uuid primary key default gen_random_uuid(), organizer_id uuid not null references public.organizers(id),
 created_at timestamptz not null default now()
);
create index if not exists via_letter_credit_person_time_idx on public.via_letter_credits(organizer_id,created_at);
alter table public.via_letter_credits enable row level security;
revoke all on public.via_letter_credits from anon,authenticated;
create or replace function public.v20_reserve_via_letter(p_actor uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_count integer;
begin
 if not exists(select 1 from public.organizers o where o.id=p_actor and o.status='active' and o.lock_reason is null)
 then raise exception 'Inactive organizer';end if;
 perform pg_advisory_xact_lock(hashtext(p_actor::text));
 select count(*) into v_count from public.via_letter_credits where organizer_id=p_actor
 and created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
 if v_count>=5 then raise exception 'AI drafting quota reached for today';end if;
 insert into public.via_letter_credits(organizer_id) values(p_actor) returning id into v_id;
 return v_id;
end $$;

-- Re-define existing award and reversal operations with Fore Director-only grants.
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
          and g.role = 'fore_director'::public.portal_role
      )
  ) then
    raise exception 'Only a Fore Director may approve or reject VIA claims';
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
        and g.role='fore_director'::public.portal_role)
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

revoke all on function public.v20_log_work_action(uuid,text,text) from public,anon;
grant execute on function public.v20_log_work_action(uuid,text,text) to authenticated;
revoke all on function public.v20_via_upsert(uuid,uuid,public.portal_department,text,integer,text,text,text,boolean) from public,anon;
grant execute on function public.v20_via_upsert(uuid,uuid,public.portal_department,text,integer,text,text,text,boolean) to authenticated;
revoke all on function public.v20_reserve_via_letter(uuid) from public,anon,authenticated;
grant execute on function public.v20_reserve_via_letter(uuid) to service_role;
commit;
