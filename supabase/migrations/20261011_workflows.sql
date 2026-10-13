-- Study0SG workflow migration. Apply after 20261010_portal_core.sql.

begin;

-- Two distinct reviewers are required for elevated assignments.
create table if not exists public.application_reviews (
  application_id uuid not null references public.applications(id) on delete cascade,
  reviewer_id uuid not null references public.organizers(id),
  requested_role public.portal_role not null,
  requested_department public.portal_department not null,
  created_at timestamptz not null default now(),
  primary key(application_id, reviewer_id)
);
alter table public.application_reviews enable row level security;
revoke all on public.application_reviews from anon, authenticated;
create policy fore_reviews_read on public.application_reviews
  for select to authenticated using (public.has_grant('fore_director'));
grant select on public.application_reviews to authenticated;

-- Reviewers cannot choose any role for which their department lacks scope.
create or replace function public.approve_application(
  p_id uuid, p_role public.portal_role, p_department public.portal_department
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_app public.applications%rowtype;
  v_owner uuid := public.current_actor();
  v_count integer;
  v_new uuid;
  v_high boolean := p_role in ('fore_director','director','tech_security');
begin
  if not public.is_active_actor() then
    raise exception 'Not active' using errcode = '42501';
  end if;
  select * into v_app from public.applications where id = p_id for update;
  if not found or v_app.status not in ('pending','reviewing') then
    raise exception 'Application unavailable' using errcode = '22023';
  end if;
  if v_app.email_verified_at is null then
    raise exception 'Email verification is required' using errcode = '42501';
  end if;
  if not (p_department = any(v_app.preferred_departments)) then
    raise exception 'Invalid department' using errcode = '22023';
  end if;
  if (p_role='community_crew' and p_department<>'community')
     or (p_role='media_crew' and p_department<>'media')
     or (p_role='tech_security' and p_department<>'technology')
     or (p_role='educator_circle' and p_department<>'education')
     or (p_role='fore_director' and p_department<>'executive') then
    raise exception 'Role and department do not match';
  end if;
  if lower(v_app.email) = (select lower(email) from public.organizers where id=v_owner) then
    raise exception 'Cannot approve own application' using errcode = '42501';
  end if;
  if v_high then
    if not public.has_grant('fore_director') then
      raise exception 'Owner review needed' using errcode = '42501';
    end if;
  elsif not public.can_review_department(p_department) then
    raise exception 'Department not assigned' using errcode = '42501';
  end if;

  -- Ensure reviews cannot silently change the intended role mid-review.
  if exists (select 1 from public.application_reviews r
    where r.application_id=p_id and (r.requested_role <> p_role
      or r.requested_department <> p_department)) then
    raise exception 'Approval choices disagree; restart review';
  end if;

  insert into public.application_reviews
    (application_id, reviewer_id, requested_role, requested_department)
    values (p_id, v_owner, p_role, p_department)
    on conflict do nothing;
  select count(*) into v_count from public.application_reviews where application_id=p_id;

  if v_high and v_count < 2 then
    update public.applications set status='reviewing' where id=p_id;
    return 'waiting_for_second_approval';
  end if;

  -- People remain invited until identity and training checks finish.
  insert into public.organizers(
    display_name,email,status,primary_department,private_bio,
    public_card_opt_in,consent_version
  ) values (
    v_app.display_name,lower(v_app.email),'invited',p_department,
    v_app.biography,v_app.public_card_opt_in,v_app.consent_version
  ) returning id into v_new;
  insert into public.organizer_grants(organizer_id,role,department,granted_by)
    values (v_new,p_role,
      case when p_role='fore_director' then null else p_department end,
      v_owner);
  update public.applications
    set status='approved',organizer_id=v_new,reviewed_at=now(),reviewed_by=v_owner
    where id=p_id;
  insert into public.audit_logs(actor_id,target_id,event_code,severity,outcome,details)
    values (v_owner,v_new,'application.approved',
      case when v_high then 'attention' else 'normal' end,'completed',
      jsonb_build_object('application_id',p_id,'role',p_role,'department',p_department));
  insert into public.delivery_outbox(event_key,event_type,payload)
    values ('application-approve-'||p_id::text,'notification.send',
      jsonb_build_object('organizer_id',v_new,'template','approved_invitation'))
    on conflict (event_key) do nothing;
  return 'invited';
end; $$;
revoke all on function public.approve_application(
  uuid,public.portal_role,public.portal_department) from public;
grant execute on function public.approve_application(
  uuid,public.portal_role,public.portal_department) to authenticated;

-- A provider-verified Edge handler activates a previously invited member.
-- This is only callable with the server-owned service-role key.
create or replace function public.activate_invited_organizer(p_organizer_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.identity_links
    where organizer_id = p_organizer_id) then
    raise exception 'No verified identity link';
  end if;
  update public.organizers
    set status='active', joined_at=coalesce(joined_at, now()),
        last_profile_verified_at=coalesce(last_profile_verified_at, now()),
        updated_at=now()
    where id=p_organizer_id and status='invited';
  if not found then raise exception 'Not invited'; end if;
end; $$;
revoke all on function public.activate_invited_organizer(uuid) from public;
grant execute on function public.activate_invited_organizer(uuid) to service_role;

-- Fore Director completes offboarding only after every service is checked.
create or replace function public.finalize_offboarding(p_resignation uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_target uuid;
  v_count integer;
  v_pending integer;
begin
  if not public.has_grant('fore_director') then
    raise exception 'Fore Director only' using errcode = '42501';
  end if;
  select organizer_id into v_target from public.resignations
    where id=p_resignation and status='pending' for update;
  if not found then raise exception 'Pending resignation not found'; end if;
  select count(*), count(*) filter (where status='requested'
     or verified_by is null or verified_at is null)
    into v_count,v_pending
    from public.offboarding_checks where resignation_id=p_resignation;
  if v_count <> 12 or v_pending > 0 then
    raise exception 'Offboarding evidence incomplete';
  end if;
  if v_target = public.current_actor() then
    raise exception 'Second reviewer required for own offboarding';
  end if;
  update public.organizers set status='offboarded',offboarded_at=now(),
    session_epoch=session_epoch+1,updated_at=now() where id=v_target;
  update public.organizer_grants set revoked_at=now()
    where organizer_id=v_target and revoked_at is null;
  update public.public_team_cards set published=false,
    revision=revision+1,updated_at=now() where organizer_id=v_target;
  update public.resignations set status='approved',decided_at=now(),
    decided_by=public.current_actor() where id=p_resignation;
  insert into public.delivery_outbox(event_key,event_type,payload)
    values ('complete-offboard-'||p_resignation,'card.rebuild',
      jsonb_build_object('organizer_id',v_target));
  insert into public.audit_logs(actor_id,target_id,event_code,severity,outcome)
    values (public.current_actor(),v_target,'offboard.finalized','attention','completed');
end; $$;
revoke all on function public.finalize_offboarding(uuid) from public;
grant execute on function public.finalize_offboarding(uuid) to authenticated;

-- Record verified checklist outcomes with live organiser authority.
create or replace function public.verify_offboarding_check(
  p_resignation uuid, p_system text, p_evidence text,
  p_exception boolean default false
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_target uuid;
  v_dept public.portal_department;
begin
  select r.organizer_id, o.primary_department into v_target, v_dept
  from public.resignations r
  join public.organizers o on o.id=r.organizer_id
  where r.id=p_resignation and r.status='pending';
  if not found then raise exception 'Pending resignation required'; end if;
  if not (
    public.has_grant('fore_director')
    or public.has_grant('director', v_dept)
    or public.has_grant('tech_security','technology')
  ) then
    raise exception 'No offboarding permission' using errcode='42501';
  end if;
  if length(coalesce(trim(p_evidence),'')) < 10 then
    raise exception 'Evidence or justified exception note is required';
  end if;
  update public.offboarding_checks set
    status = case when p_exception then 'exception' else 'verified' end,
    performed_by=public.current_actor(),verified_by=public.current_actor(),
    evidence_reference=left(p_evidence,500),verified_at=now()
  where resignation_id=p_resignation and system_key=p_system;
  if not found then raise exception 'Checklist item not found'; end if;
  insert into public.audit_logs(actor_id,target_id,event_code,severity,outcome,details)
    values (public.current_actor(),v_target,'offboard.check.verified',
      case when p_exception then 'attention' else 'notice' end,'completed',
      jsonb_build_object('system',p_system,'exception',p_exception));
end; $$;
revoke all on function public.verify_offboarding_check(uuid,text,text,boolean) from public;
grant execute on function public.verify_offboarding_check(uuid,text,text,boolean)
  to authenticated;

-- Daily server-only profile review notices and soft locks.
create or replace function public.run_profile_review_cron()
returns table(warned integer, locked integer)
language plpgsql security definer set search_path = '' as $$
declare
  v_o record;
  v_warning integer := 0;
  v_locked integer := 0;
  v_due timestamptz;
begin
  for v_o in
    select id,coalesce(last_profile_verified_at,joined_at,created_at) as verified
    from public.organizers
    where status='active' and lock_reason is null
    for update skip locked
  loop
    v_due := v_o.verified + interval '30 days';
    if now() >= v_due then
      update public.organizers set lock_reason='profile_review_due',
        session_epoch=session_epoch+1,updated_at=now() where id=v_o.id;
      insert into public.delivery_outbox(event_key,event_type,payload)
        values ('profile-lock-'||v_o.id::text||'-'||v_o.verified::text,
          'profile.review_due',jsonb_build_object('organizer_id',v_o.id,'state','locked'))
        on conflict do nothing;
      v_locked := v_locked + 1;
    elsif now() >= v_o.verified + interval '25 days' then
      insert into public.delivery_outbox(event_key,event_type,payload)
        values ('profile-warning-'||v_o.id::text||'-'||v_o.verified::text,
          'profile.review_due',jsonb_build_object('organizer_id',v_o.id,'state','warning'))
        on conflict do nothing;
      v_warning := v_warning + 1;
    end if;
  end loop;
  return query select v_warning,v_locked;
end; $$;
revoke all on function public.run_profile_review_cron() from public;
grant execute on function public.run_profile_review_cron() to service_role;

-- Mark a profile verified only after a backend provider step-up check.
create or replace function public.finish_profile_review(p_organizer_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.organizers set last_profile_verified_at=now(),
    lock_reason=case when lock_reason='profile_review_due' then null else lock_reason end,
    session_epoch=session_epoch+1,updated_at=now()
  where id=p_organizer_id and status='active'
    and (lock_reason is null or lock_reason='profile_review_due');
  if not found then raise exception 'Profile cannot be unlocked automatically'; end if;
  insert into public.audit_logs(target_id,event_code,severity,outcome)
    values(p_organizer_id,'profile.review.completed','normal','completed');
end; $$;
revoke all on function public.finish_profile_review(uuid) from public;
grant execute on function public.finish_profile_review(uuid) to service_role;

commit;
