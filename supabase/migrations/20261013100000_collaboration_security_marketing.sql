-- Study0SG v1.6: collaboration, defensive tool lab, security event journal, marketing approval queue.
-- REQUIRES v1.4.1 SQL. Run on staging first; no public participant data.
begin;
do $$ begin
  if to_regclass('public.v14_studio_documents') is null then
    raise exception 'Install v1.4.1 operational workspace migration before v1.6';
  end if;
end $$;

-- Keep the existing document format. A revision prevents silent last-write-wins edits.
alter table public.v14_studio_documents add column if not exists revision integer not null default 0;
alter table public.v14_studio_documents drop constraint if exists v14_studio_documents_kind_check;
alter table public.v14_studio_documents add constraint v14_studio_documents_kind_check
  check(kind in ('edm','wireframe','security','tool'));

create table if not exists public.v16_studio_members (
  document_id uuid not null references public.v14_studio_documents(id) on delete cascade,
  organizer_id uuid not null references public.organizers(id),
  permission text not null check(permission in ('editor','viewer')),
  invited_by uuid not null references public.organizers(id),
  invited_at timestamptz not null default now(),
  primary key (document_id, organizer_id)
);
alter table public.v16_studio_members enable row level security;
revoke all on public.v16_studio_members from public, anon, authenticated;
grant select on public.v16_studio_members to authenticated;

-- A collaborator can see only the projects to which they have been explicitly invited.
drop policy if exists v14_studio_read on public.v14_studio_documents;
create policy v16_studio_read on public.v14_studio_documents for select to authenticated using (
 public.is_active_actor() and (
  (kind='edm' and public.can_access_department('media'::public.portal_department)) or
  (kind in ('wireframe','security','tool') and public.can_access_department('technology'::public.portal_department)) or
  author_id=public.current_actor() or
  exists(select 1 from public.v16_studio_members m where m.document_id=id and m.organizer_id=public.current_actor())
 )
);
-- SECURITY DEFINER owner lookup avoids an RLS recursion between documents and members.
create or replace function public.v16_is_studio_owner(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.v14_studio_documents d
   where d.id=p_id and d.author_id=public.current_actor() and public.is_active_actor());
$$;
create policy v16_studio_members_read on public.v16_studio_members for select to authenticated using (
 public.is_active_actor() and (organizer_id=public.current_actor() or public.v16_is_studio_owner(document_id))
);

create or replace function public.v16_studio_share(p_document uuid,p_organizer uuid,p_permission text)
returns void language plpgsql security definer set search_path='' as $$
declare v_author uuid;v_kind text;
begin
 if not public.is_active_actor() then raise exception 'Not authenticated' using errcode='42501'; end if;
 select author_id,kind into v_author,v_kind from public.v14_studio_documents where id=p_document;
 if not found or (v_author<>public.current_actor() and not public.has_grant('fore_director'::public.portal_role))
   then raise exception 'Only document owner or Fore Director can invite collaborators' using errcode='42501'; end if;
 if p_organizer=v_author or p_permission not in ('editor','viewer','remove') or (p_permission<>'remove' and not exists(
   select 1 from public.organizers where id=p_organizer and status='active' and lock_reason is null))
   then raise exception 'Invalid participant or permission'; end if;
 if p_permission='remove' then delete from public.v16_studio_members where document_id=p_document and organizer_id=p_organizer;
 else insert into public.v16_studio_members(document_id,organizer_id,permission,invited_by)
   values(p_document,p_organizer,p_permission,public.current_actor())
   on conflict(document_id,organizer_id) do update set permission=excluded.permission,invited_by=excluded.invited_by,invited_at=now();
 end if;
 perform public.portal_log_change('studio.collaborator_changed',public.current_actor(),p_organizer,
   (case when v_kind='edm' then 'media' else 'technology' end)::public.portal_department,
   jsonb_build_object('document_id',p_document,'permission',p_permission));
end $$;

-- Atomic revision check: prevents silent overwriting when two people edit at once.
-- DO NOT send local image base64 or secrets inside a design document.
create or replace function public.v16_studio_save(
 p_kind text,p_title text,p_body jsonb,p_id uuid default null,p_expected_revision int default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_author uuid;v_kind text;v_revision int;v_can_edit boolean;
begin
 if not public.is_active_actor() then raise exception 'Active organizer required' using errcode='42501'; end if;
 if p_kind not in ('edm','wireframe','security','tool') or
    char_length(trim(coalesce(p_title,''))) not between 3 and 150 or
    p_body is null or jsonb_typeof(p_body)<>'object' or pg_column_size(p_body)>50000
    then raise exception 'Invalid document data'; end if;
 if p_id is null then
   if not ((p_kind='edm' and public.can_access_department('media'::public.portal_department)) or
      (p_kind in ('wireframe','security','tool') and public.can_access_department('technology'::public.portal_department)))
      then raise exception 'Workspace access required' using errcode='42501'; end if;
   insert into public.v14_studio_documents(kind,title,body,author_id,revision)
   values(p_kind,trim(p_title),p_body,public.current_actor(),1) returning id,revision into v_id,v_revision;
 else
   select id,author_id,kind,revision into v_id,v_author,v_kind,v_revision
   from public.v14_studio_documents where id=p_id for update;
   if not found or v_kind<>p_kind then raise exception 'Document not found'; end if;
   select (v_author=public.current_actor() or public.has_grant('fore_director'::public.portal_role)
       or exists(select 1 from public.v16_studio_members m where m.document_id=p_id
          and m.organizer_id=public.current_actor() and m.permission='editor')) into v_can_edit;
   if not v_can_edit then raise exception 'You do not have edit permission' using errcode='42501'; end if;
   if v_revision<>p_expected_revision then
     raise exception 'COLLAB_CONFLICT: Another organizer saved a newer version. Download your local JSON, then reopen the latest version.' using errcode='40001';
   end if;
   update public.v14_studio_documents set title=trim(p_title),body=p_body,revision=revision+1,updated_at=now()
   where id=p_id returning revision into v_revision;
 end if;
 perform public.portal_log_change('studio.version_saved',public.current_actor(),null,
   (case when p_kind='edm' then 'media' else 'technology' end)::public.portal_department,
   jsonb_build_object('document_id',v_id,'revision',v_revision));
 return jsonb_build_object('id',v_id,'revision',v_revision);
end $$;

-- Only a reviewed human operator can record account-security events. No passwords, tokens or raw breach dumps.
create table if not exists public.v16_account_security_events (
 id uuid primary key default gen_random_uuid(),application text not null check(char_length(application) between 2 and 120),
 event_type text not null check(event_type in ('suspected_breach','access_changed','password_reset_requested','password_changed','account_deactivated','account_deleted','provider_notice')),
 subject_ref text not null check(char_length(subject_ref) between 2 and 140),
 notes text not null default '' check(char_length(notes)<=1500),
 source text not null default 'manual' check(source in ('manual','verified_webhook')),
 logged_by uuid references public.organizers(id),occurred_at timestamptz not null default now());
alter table public.v16_account_security_events enable row level security;
revoke all on public.v16_account_security_events from public,anon,authenticated;
grant select on public.v16_account_security_events to authenticated;
create policy v16_security_events_read on public.v16_account_security_events for select to authenticated using
 (public.is_active_actor() and public.can_access_department('technology'::public.portal_department));
create or replace function public.v16_security_event_add(p_application text,p_event_type text,p_subject_ref text,p_notes text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if not public.is_active_actor() or not public.can_review_department('technology'::public.portal_department)
   then raise exception 'Tech & Security manager required' using errcode='42501'; end if;
 if p_event_type not in ('suspected_breach','access_changed','password_reset_requested','password_changed','account_deactivated','account_deleted','provider_notice') or
    char_length(trim(coalesce(p_application,''))) not between 2 and 120 or
    char_length(trim(coalesce(p_subject_ref,''))) not between 2 and 140 or char_length(coalesce(p_notes,''))>1500
    then raise exception 'Invalid security event'; end if;
 insert into public.v16_account_security_events(application,event_type,subject_ref,notes,logged_by)
 values(trim(p_application),p_event_type,trim(p_subject_ref),coalesce(p_notes,''),public.current_actor()) returning id into v_id;
 perform public.portal_log_change('security.account_event_logged',public.current_actor(),null,'technology'::public.portal_department,jsonb_build_object('event_id',v_id,'event_type',p_event_type));
 return v_id;
end $$;

-- Social publishing is intentionally two-person: drafts then explicit management approval.
-- Buffer dispatch is server-side only; never store API keys in these rows.
create table if not exists public.v16_social_posts (
 id uuid primary key default gen_random_uuid(),title text not null check(char_length(title) between 3 and 150),
 body text not null check(char_length(body) between 3 and 2500),
 channel_id text not null check(char_length(channel_id) between 1 and 120),
 status text not null default 'draft' check(status in ('draft','approved','queued','failed')),
 provider_post_id text,created_by uuid not null references public.organizers(id),
 approved_by uuid references public.organizers(id),approved_at timestamptz,
 error_text text,updated_at timestamptz not null default now(),created_at timestamptz not null default now());
alter table public.v16_social_posts enable row level security;
revoke all on public.v16_social_posts from public,anon,authenticated;
grant select on public.v16_social_posts to authenticated;
create policy v16_social_posts_read on public.v16_social_posts for select to authenticated using (
 public.is_active_actor() and (public.can_access_department('media'::public.portal_department)
   or public.has_grant('fore_director'::public.portal_role))
);
create or replace function public.v16_social_draft(p_title text,p_body text,p_channel_id text,p_id uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if not public.is_active_actor() or not public.can_access_department('media'::public.portal_department)
   then raise exception 'Media access required' using errcode='42501'; end if;
 if char_length(trim(coalesce(p_title,''))) not between 3 and 150 or
    char_length(trim(coalesce(p_body,''))) not between 3 and 2500 or
    char_length(trim(coalesce(p_channel_id,''))) not between 1 and 120
   then raise exception 'Invalid draft'; end if;
 if p_id is null then
   insert into public.v16_social_posts(title,body,channel_id,created_by)
   values(trim(p_title),trim(p_body),trim(p_channel_id),public.current_actor()) returning id into v_id;
 else
   update public.v16_social_posts set title=trim(p_title),body=trim(p_body),channel_id=trim(p_channel_id),updated_at=now()
    where id=p_id and status='draft' and (created_by=public.current_actor() or public.can_review_department('media'::public.portal_department)) returning id into v_id;
   if v_id is null then raise exception 'Draft cannot be changed' using errcode='42501'; end if;
 end if;
 perform public.portal_log_change('marketing.draft_saved',public.current_actor(),null,'media'::public.portal_department,jsonb_build_object('post_id',v_id));
 return v_id;
end $$;
create or replace function public.v16_social_approve(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.is_active_actor() or not public.can_review_department('media'::public.portal_department)
   then raise exception 'Media Director approval required' using errcode='42501'; end if;
 update public.v16_social_posts set status='approved',approved_by=public.current_actor(),approved_at=now(),updated_at=now()
 where id=p_id and status='draft' and created_by<>public.current_actor();
 if not found then raise exception 'No eligible draft or reviewer must be someone else' using errcode='42501'; end if;
 perform public.portal_log_change('marketing.post_approved',public.current_actor(),null,'media'::public.portal_department,jsonb_build_object('post_id',p_id));
end $$;

-- Additional controls for server dispatch: the Edge Function can only enqueue an approved post.
-- This RPC checks the review separately before Buffer receives any user-generated text.
create or replace function public.v16_social_dispatch_claim(p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_row public.v16_social_posts%rowtype;
begin
 if not public.is_active_actor() or not public.can_review_department('media'::public.portal_department)
    then raise exception 'Media Director required' using errcode='42501'; end if;
 select * into v_row from public.v16_social_posts where id=p_id and status='approved' for update;
 if not found then raise exception 'Post must be approved first' using errcode='42501'; end if;
 update public.v16_social_posts set status='queued',updated_at=now() where id=p_id;
 perform public.portal_log_change('marketing.post_claimed',public.current_actor(),null,'media'::public.portal_department,jsonb_build_object('post_id',p_id));
 return jsonb_build_object('id',v_row.id,'text',v_row.body,'channel_id',v_row.channel_id);
end $$;
-- A failed API call is stored as failed; a retry needs a new approval / explicit handling, never silent repost.
create or replace function public.v16_social_dispatch_result(p_id uuid,p_status text,p_provider_id text,p_error text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_active_actor() or not public.can_review_department('media'::public.portal_department)
  then raise exception 'Media Director required' using errcode='42501'; end if;
 if p_status not in ('queued','failed') then raise exception 'Invalid dispatch result'; end if;
 update public.v16_social_posts set status=p_status,provider_post_id=left(coalesce(p_provider_id,''),200),error_text=left(coalesce(p_error,''),400),updated_at=now()
 where id=p_id and status='queued';
 if not found then raise exception 'Post is not awaiting dispatch'; end if;
end $$;

-- Lightweight campaign planner; never store participant-level survey responses here.
create table if not exists public.v16_marketing_campaigns (
 id uuid primary key default gen_random_uuid(),
 name text not null check(char_length(name) between 3 and 160),
 audience text not null check(char_length(audience) between 2 and 150),
 goal text not null check(char_length(goal) between 2 and 1000),
 stage text not null default 'planning' check(stage in ('planning','review','active','complete')),
 estimated_budget_cents bigint not null default 0 check(estimated_budget_cents between 0 and 10000000000),
 notes text not null default '' check(char_length(notes)<=1500),
 created_by uuid not null references public.organizers(id),created_at timestamptz not null default now());
alter table public.v16_marketing_campaigns enable row level security;
revoke all on public.v16_marketing_campaigns from public,anon,authenticated;
grant select on public.v16_marketing_campaigns to authenticated;
create policy v16_marketing_campaigns_read on public.v16_marketing_campaigns for select to authenticated using
 (public.is_active_actor() and public.has_grant('fore_director'::public.portal_role));
create or replace function public.v16_marketing_campaign_add(
 p_name text,p_audience text,p_goal text,p_stage text,p_budget_cents bigint,p_notes text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if not public.is_active_actor() or not public.has_grant('fore_director'::public.portal_role)
  then raise exception 'Growth leadership required' using errcode='42501'; end if;
 if char_length(trim(coalesce(p_name,''))) not between 3 and 160 or
 char_length(trim(coalesce(p_audience,''))) not between 2 and 150 or
 char_length(coalesce(p_goal,'')) not between 2 and 1000 or
 p_stage not in ('planning','review','active','complete') or
 p_budget_cents not between 0 and 10000000000 or char_length(coalesce(p_notes,''))>1500
 then raise exception 'Invalid campaign'; end if;
 insert into public.v16_marketing_campaigns(name,audience,goal,stage,estimated_budget_cents,notes,created_by)
 values(trim(p_name),trim(p_audience),trim(p_goal),p_stage,p_budget_cents,coalesce(p_notes,''),public.current_actor()) returning id into v_id;
 perform public.portal_log_change('marketing.campaign_created',public.current_actor(),null,'executive'::public.portal_department,jsonb_build_object('campaign_id',v_id));
 return v_id;
end $$;

create or replace function public.v16_partner_stage(p_id uuid,p_stage text,p_purpose text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_active_actor() or not public.has_grant('fore_director'::public.portal_role)
 then raise exception 'Growth leadership required' using errcode='42501'; end if;
 if p_stage not in ('research','contacted','discussion','partner','inactive') or char_length(coalesce(p_purpose,''))>2000
 then raise exception 'Invalid stage'; end if;
 update public.v14_partner_contacts set stage=p_stage,purpose=coalesce(p_purpose,'') where id=p_id;
 if not found then raise exception 'Contact not found'; end if;
 perform public.portal_log_change('partner.stage_changed',public.current_actor(),null,'executive'::public.portal_department,jsonb_build_object('contact_id',p_id,'stage',p_stage));
end $$;

-- Old unversioned save would bypass optimistic locking. Block it once v1.6 is installed.
revoke all on function public.v14_save_studio(text,text,jsonb,uuid) from public,anon,authenticated;

-- Realtime for saved design revisions; RLS still filters recipients.
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and
    not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='v14_studio_documents') then
  alter publication supabase_realtime add table public.v14_studio_documents;
 end if;
end $$;

-- Explicit grants, no browser insert/update/delete to any new tables.
do $$ declare r record;begin
 for r in select p.oid::regprocedure::text as sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname like 'v16_%' loop
   execute format('revoke all on function %s from public,anon',r.sig);
   execute format('grant execute on function %s to authenticated',r.sig);
 end loop;
end $$;
commit;
