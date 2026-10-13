-- Study0SG v2: split private and shared organization AI workspaces.
-- Apply after the portal core, department and collaboration migrations, in DEV first.
-- Identity and authority come from the signed ES256 portal JWT, never browser user IDs.
begin;

create table if not exists public.ai_projects (
 id uuid primary key default gen_random_uuid(),
 title text not null check(char_length(title) between 3 and 160),
 description text not null default '' check(char_length(description) <= 1000),
 department public.portal_department,
 creator_id uuid not null references public.organizers(id),
 created_at timestamptz not null default now(),
 archived_at timestamptz
);
create table if not exists public.ai_threads (
 id uuid primary key default gen_random_uuid(),
 project_id uuid references public.ai_projects(id),
 parent_thread_id uuid references public.ai_threads(id),
 branch_message_id uuid,
 owner_id uuid not null references public.organizers(id),
 title text not null check(char_length(title) between 3 and 160),
 assistant_profile text not null default 'general' check (assistant_profile in ('general','tech_security')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check(parent_thread_id is null or parent_thread_id <> id)
);
create index if not exists ai_threads_project_idx on public.ai_threads(project_id,created_at);
create index if not exists ai_threads_owner_idx on public.ai_threads(owner_id,updated_at desc);
create table if not exists public.ai_messages (
 id uuid primary key default gen_random_uuid(),
 thread_id uuid not null references public.ai_threads(id) on delete restrict,
 author_id uuid references public.organizers(id),
 role text not null check(role in ('user','assistant')),
 body text not null check(char_length(body) between 1 and 8000),
 model_tier text not null default 'standard' check(model_tier in ('standard','pro')),
 reply_to uuid references public.ai_messages(id),
 created_at timestamptz not null default now(),
 check((role='user' and author_id is not null) or (role='assistant' and author_id is null))
);
alter table public.ai_threads add constraint ai_threads_branch_message_fk foreign key(branch_message_id) references public.ai_messages(id);
create index if not exists ai_messages_thread_idx on public.ai_messages(thread_id,created_at,id);
create table if not exists public.ai_usage (
 id uuid primary key default gen_random_uuid(),
 organizer_id uuid not null references public.organizers(id),
 thread_id uuid not null references public.ai_threads(id),
 tier text not null check(tier in ('standard','pro')),
 scope text not null check(scope in ('personal','organization')),
 message_id uuid not null unique references public.ai_messages(id),
 created_at timestamptz not null default now()
);
create index if not exists ai_usage_by_person_idx on public.ai_usage(organizer_id,scope,tier,created_at);

alter table public.ai_projects enable row level security;
alter table public.ai_threads enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_usage enable row level security;
revoke all on public.ai_projects,public.ai_threads,public.ai_messages,public.ai_usage from anon,authenticated;
grant select on public.ai_projects,public.ai_threads,public.ai_messages,public.ai_usage to authenticated;
create policy ai_projects_read on public.ai_projects for select to authenticated
 using(public.is_active_actor());
create policy ai_threads_read on public.ai_threads for select to authenticated
 using(public.is_active_actor() and (project_id is not null or owner_id=public.current_actor()));
create policy ai_messages_read on public.ai_messages for select to authenticated
 using(public.is_active_actor() and exists (
  select 1 from public.ai_threads t where t.id=thread_id and
   (t.project_id is not null or t.owner_id=public.current_actor())
 ));
create policy ai_usage_read on public.ai_usage for select to authenticated
 using(public.is_active_actor() and organizer_id=public.current_actor());

-- Only Fore Directors, Directors, and approved EXCO department members make project folders.
create or replace function public.ai_create_project(p_title text,p_description text default '',p_department public.portal_department default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if not public.is_active_actor() or not (
  public.has_grant('fore_director'::public.portal_role) or
  exists(select 1 from public.organizer_grants g
    where g.organizer_id=public.current_actor() and g.revoked_at is null
    and (g.role='director'::public.portal_role or g.department='executive'::public.portal_department))
 ) then raise exception 'Only EXCO, Directors or Fore Directors can create a project'; end if;
 if length(btrim(coalesce(p_title,''))) not between 3 and 160
    or length(coalesce(p_description,''))>1000 then raise exception 'Invalid project';end if;
 if p_department is not null and not (
  public.has_grant('fore_director'::public.portal_role) or
  exists(select 1 from public.organizer_grants g where g.organizer_id=public.current_actor()
    and g.role='director'::public.portal_role and g.department=p_department and g.revoked_at is null)
 ) then raise exception 'Project department not granted'; end if;
 insert into public.ai_projects(title,description,department,creator_id)
 values(btrim(p_title),coalesce(p_description,''),p_department,public.current_actor()) returning id into v_id;
 return v_id;
end $$;

-- Any verified member can start a project subthread or their own private chat.
create or replace function public.ai_create_thread(p_title text,p_project_id uuid default null,p_parent_thread_id uuid default null,p_profile text default 'general',p_branch_message_id uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_parent public.ai_threads%rowtype;
begin
 if not public.is_active_actor() then raise exception 'Access denied';end if;
 if length(btrim(coalesce(p_title,''))) not between 3 and 160 then raise exception 'Invalid title';end if;
 if p_profile not in ('general','tech_security') then raise exception 'Invalid assistant profile';end if;
 if p_project_id is not null and not exists(select 1 from public.ai_projects where id=p_project_id and archived_at is null)
 then raise exception 'No active project';end if;
 if p_parent_thread_id is not null then
  select * into v_parent from public.ai_threads where id=p_parent_thread_id;
  if not found or v_parent.project_id is distinct from p_project_id or (p_project_id is null and v_parent.owner_id<>public.current_actor())
  then raise exception 'Parent thread is not accessible';end if;
 end if;
 if p_branch_message_id is not null and (p_parent_thread_id is null or not exists(
   select 1 from public.ai_messages m where m.id=p_branch_message_id and m.thread_id=p_parent_thread_id
 )) then raise exception 'Selected branch message is not in the parent thread';end if;
 if p_profile='tech_security' and not (
   public.has_grant('fore_director'::public.portal_role) or public.can_access_department('technology'::public.portal_department)
 ) then raise exception 'Tech assistant requires Technology access';end if;
 insert into public.ai_threads(project_id,parent_thread_id,branch_message_id,owner_id,title,assistant_profile)
 values(p_project_id,p_parent_thread_id,p_branch_message_id,public.current_actor(),btrim(p_title),p_profile) returning id into v_id;
 return v_id;
end $$;

-- Called ONLY from a server-verified Edge Function with service_role.
-- Race-safe per-user message budgets (UTC days and calendar months).
create or replace function public.ai_reserve_user_message(p_actor uuid,p_thread uuid,p_tier text,p_content text,p_reply_to uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_thread public.ai_threads%rowtype;v_id uuid;v_scope text;v_now timestamptz:=now();v_count integer;
begin
 if p_tier not in ('standard','pro') or length(btrim(coalesce(p_content,''))) not between 2 and 3000 then
   raise exception 'Invalid AI request';end if;
 if not exists(select 1 from public.organizers o where o.id=p_actor and o.status='active' and o.lock_reason is null)
 then raise exception 'Organizer inactive';end if;
 perform pg_advisory_xact_lock(hashtext(p_actor::text));
 select * into v_thread from public.ai_threads where id=p_thread;
 if not found or (v_thread.project_id is null and v_thread.owner_id<>p_actor)
   or (v_thread.project_id is not null and not exists(select 1 from public.ai_projects p where p.id=v_thread.project_id and p.archived_at is null))
 then raise exception 'Thread not accessible';end if;
 v_scope:=case when v_thread.project_id is null then 'personal' else 'organization' end;
 if p_reply_to is not null and not exists(select 1 from public.ai_messages m where m.id=p_reply_to and m.thread_id=p_thread)
 then raise exception 'Reply must belong to the same thread';end if;
 if v_thread.assistant_profile='tech_security' and not (
   exists(select 1 from public.organizer_grants g where g.organizer_id=p_actor and g.revoked_at is null and
    (g.role='fore_director'::public.portal_role or g.department='technology'::public.portal_department))
 ) then raise exception 'Technology access required';end if;
 if v_scope='personal' and p_tier='standard' then
  select count(*) into v_count from public.ai_usage
   where organizer_id=p_actor and scope='personal' and tier='standard'
     and created_at>=date_trunc('day',v_now at time zone 'UTC') at time zone 'UTC';
  if v_count>=10 then raise exception 'Daily personal message limit (10) reached';end if;
 elsif v_scope='personal' and p_tier='pro' then
  select count(*) into v_count from public.ai_usage
   where organizer_id=p_actor and scope='personal' and tier='pro'
     and created_at>=date_trunc('month',v_now at time zone 'UTC') at time zone 'UTC';
  if v_count>=4 then raise exception 'Monthly personal Pro limit (4) reached';end if;
 else
  -- Organizational collaboration gets a separate high but finite safety cap.
  select count(*) into v_count from public.ai_usage where organizer_id=p_actor
   and scope='organization' and created_at>=date_trunc('day',v_now at time zone 'UTC') at time zone 'UTC';
  if v_count>=100 then raise exception 'Organization AI daily fair-use cap reached';end if;
 end if;
 insert into public.ai_messages(thread_id,author_id,role,body,model_tier,reply_to)
 values(p_thread,p_actor,'user',btrim(p_content),p_tier,p_reply_to) returning id into v_id;
 insert into public.ai_usage(organizer_id,thread_id,tier,scope,message_id)
 values(p_actor,p_thread,p_tier,v_scope,v_id);
 update public.ai_threads set updated_at=v_now where id=p_thread;
 return v_id;
end $$;

create or replace function public.ai_record_assistant(p_message uuid,p_content text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_thread uuid;v_id uuid;
begin
 select thread_id into v_thread from public.ai_messages where id=p_message and role='user';
 if not found then raise exception 'Unknown user message';end if;
 if length(btrim(coalesce(p_content,'')))<1 or length(p_content)>8000 then raise exception 'Invalid AI answer';end if;
 if exists(select 1 from public.ai_messages where reply_to=p_message and role='assistant') then
  raise exception 'Assistant answer already recorded';end if;
 insert into public.ai_messages(thread_id,role,body,reply_to)
 values(v_thread,'assistant',btrim(p_content),p_message) returning id into v_id;
 update public.ai_threads set updated_at=now() where id=v_thread;
 return v_id;
end $$;

revoke all on function public.ai_create_project(text,text,public.portal_department) from public,anon;
revoke all on function public.ai_create_thread(text,uuid,uuid,text,uuid) from public,anon;
grant execute on function public.ai_create_project(text,text,public.portal_department) to authenticated;
grant execute on function public.ai_create_thread(text,uuid,uuid,text,uuid) to authenticated;
revoke all on function public.ai_reserve_user_message(uuid,uuid,text,text,uuid) from public,anon,authenticated;
revoke all on function public.ai_record_assistant(uuid,text) from public,anon,authenticated;
grant execute on function public.ai_reserve_user_message(uuid,uuid,text,text,uuid) to service_role;
grant execute on function public.ai_record_assistant(uuid,text) to service_role;
commit;
