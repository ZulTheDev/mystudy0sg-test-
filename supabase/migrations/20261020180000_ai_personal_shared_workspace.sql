-- Study0SG internal AI: verified organisers, private threads and shared projects.
-- Apply to the staging Supabase project before enabling the new page.
create table if not exists public.ai_projects (
 id uuid primary key default gen_random_uuid(),
 title text not null check (length(trim(title)) between 2 and 140),
 description text not null default '',
 creator_id uuid not null references public.organizers(id),
 created_at timestamptz not null default now(),
 archived_at timestamptz
);
create table if not exists public.ai_threads (
 id uuid primary key default gen_random_uuid(),
 project_id uuid references public.ai_projects(id) on delete cascade,
 parent_thread_id uuid references public.ai_threads(id) on delete cascade,
 branch_message_id uuid,
 owner_id uuid not null references public.organizers(id),
 title text not null check (length(trim(title)) between 2 and 140),
 assistant_profile text not null default 'general' check (assistant_profile in ('general','tech_security')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.ai_messages (
 id uuid primary key default gen_random_uuid(),
 thread_id uuid not null references public.ai_threads(id) on delete cascade,
 author_id uuid references public.organizers(id),
 role text not null check (role in ('user','assistant')),
 body text not null check(length(body) between 1 and 12000),
 model_tier text not null default 'standard' check(model_tier in ('standard','pro')),
 reply_to uuid references public.ai_messages(id),
 created_at timestamptz not null default now()
);
create table if not exists public.ai_usage (
 id uuid primary key default gen_random_uuid(),
 organizer_id uuid not null references public.organizers(id),
 thread_id uuid not null references public.ai_threads(id),
 scope text not null check(scope in ('personal','organization')),
 tier text not null check(tier in ('standard','pro')),
 created_at timestamptz not null default now()
);
create index if not exists ai_threads_project_idx on public.ai_threads(project_id, updated_at desc);
create index if not exists ai_messages_thread_idx on public.ai_messages(thread_id, created_at);
create index if not exists ai_usage_quota_idx on public.ai_usage(organizer_id,scope,tier,created_at);

alter table public.ai_projects enable row level security;
alter table public.ai_threads enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_usage enable row level security;
revoke all on public.ai_projects,public.ai_threads,public.ai_messages,public.ai_usage from public,anon,authenticated;
grant select on public.ai_projects,public.ai_threads,public.ai_messages,public.ai_usage to authenticated;

create or replace function public.ai_can_access_thread(p_thread uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select public.is_active_actor() and exists(
  select 1 from public.ai_threads t where t.id=p_thread
  and (t.project_id is not null or t.owner_id=public.current_actor())
 );
$$;
revoke all on function public.ai_can_access_thread(uuid) from public,anon;
grant execute on function public.ai_can_access_thread(uuid) to authenticated;

create policy ai_projects_select on public.ai_projects for select to authenticated
 using (public.is_active_actor());
create policy ai_threads_select on public.ai_threads for select to authenticated
 using(public.ai_can_access_thread(id));
create policy ai_messages_select on public.ai_messages for select to authenticated
 using(public.ai_can_access_thread(thread_id));
create policy ai_usage_select on public.ai_usage for select to authenticated
 using(public.is_active_actor() and organizer_id=public.current_actor());

create or replace function public.ai_create_project(p_title text,p_description text default '')
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if not public.is_active_actor() or not (
  public.has_grant('fore_director'::public.portal_role)
  or public.has_grant('director'::public.portal_role)
  or exists(select 1 from public.organizer_grants g
   where g.organizer_id=public.current_actor() and g.department='executive'::public.portal_department and g.revoked_at is null)
 ) then raise exception 'Only EXCO or Directors may create project folders'; end if;
 if length(trim(p_title)) not between 2 and 140 or length(coalesce(p_description,''))>1000
 then raise exception 'Invalid project name/description'; end if;
 insert into public.ai_projects(title,description,creator_id)
 values(trim(p_title),coalesce(p_description,''),public.current_actor()) returning id into v_id;
 return v_id;
end $$;

create or replace function public.ai_create_thread(p_title text,p_project_id uuid default null,
 p_parent_thread_id uuid default null,p_branch_message_id uuid default null,p_profile text default 'general')
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_parent public.ai_threads%rowtype;
begin
 if not public.is_active_actor() then raise exception 'Organiser session is inactive'; end if;
 if length(trim(p_title)) not between 2 and 140 then raise exception 'Invalid thread title'; end if;
 if p_profile not in ('general','tech_security') then raise exception 'Invalid assistant'; end if;
 if p_profile='tech_security' and not (
   public.has_grant('fore_director'::public.portal_role)
   or public.has_grant('tech_security'::public.portal_role)
   or public.has_grant('director'::public.portal_role,'technology'::public.portal_department)
 ) then raise exception 'Tech assistant is restricted'; end if;
 if p_parent_thread_id is not null then
   select * into v_parent from public.ai_threads where id=p_parent_thread_id;
   if not found or not public.ai_can_access_thread(p_parent_thread_id)
      or v_parent.project_id is distinct from p_project_id
   then raise exception 'Invalid parent thread'; end if;
 end if;
 if p_project_id is not null and not exists(
   select 1 from public.ai_projects where id=p_project_id and archived_at is null
 ) then raise exception 'Project not available'; end if;
 if p_branch_message_id is not null and not exists(
   select 1 from public.ai_messages where id=p_branch_message_id and thread_id=p_parent_thread_id
 ) then raise exception 'Invalid branch reply'; end if;
 insert into public.ai_threads(project_id,parent_thread_id,branch_message_id,owner_id,title,assistant_profile)
 values(p_project_id,p_parent_thread_id,p_branch_message_id,public.current_actor(),trim(p_title),p_profile)
 returning id into v_id;
 return v_id;
end $$;

-- Actor is taken from signed JWT; charge limits atomically under a per-user lock.
create or replace function public.ai_submit_prompt(p_thread uuid,p_body text,p_tier text default 'standard')
returns uuid language plpgsql security definer set search_path='' as $$
declare v_thread public.ai_threads%rowtype; v_count int; v_id uuid; v_scope text;
begin
 if not public.ai_can_access_thread(p_thread) then raise exception 'No access to thread'; end if;
 if length(trim(p_body)) not between 2 and 3000 then raise exception 'Message is 2–3000 characters'; end if;
 if p_tier not in ('standard','pro') then raise exception 'Invalid model tier'; end if;
 select * into v_thread from public.ai_threads where id=p_thread;
 v_scope:=case when v_thread.project_id is null then 'personal' else 'organization' end;
 perform pg_advisory_xact_lock(hashtext(public.current_actor()::text));
 if v_scope='personal' then
  if p_tier='standard' then
   select count(*) into v_count from public.ai_usage
    where organizer_id=public.current_actor() and scope=v_scope and tier=p_tier
    and created_at >= date_trunc('day',now() at time zone 'utc') at time zone 'utc';
   if v_count>=10 then raise exception 'Daily standard limit reached (10 messages)'; end if;
  else
   select count(*) into v_count from public.ai_usage
    where organizer_id=public.current_actor() and scope=v_scope and tier=p_tier
    and created_at >= date_trunc('month',now() at time zone 'utc') at time zone 'utc';
   if v_count>=4 then raise exception 'Monthly Pro limit reached (4 messages)'; end if;
  end if;
 end if;
 insert into public.ai_messages(thread_id,author_id,role,body,model_tier)
 values(p_thread,public.current_actor(),'user',trim(p_body),p_tier) returning id into v_id;
 insert into public.ai_usage(organizer_id,thread_id,scope,tier)
 values(public.current_actor(),p_thread,v_scope,p_tier);
 update public.ai_threads set updated_at=now() where id=p_thread;
 return v_id;
end $$;
revoke all on function public.ai_create_project(text,text),
 public.ai_create_thread(text,uuid,uuid,uuid,text),
 public.ai_submit_prompt(uuid,text,text) from public,anon;
grant execute on function public.ai_create_project(text,text),
 public.ai_create_thread(text,uuid,uuid,uuid,text),
 public.ai_submit_prompt(uuid,text,text) to authenticated;

-- Only a protected Edge Function with the service role may insert assistant replies.
-- Access to this table remains read-only to ordinary clients.
