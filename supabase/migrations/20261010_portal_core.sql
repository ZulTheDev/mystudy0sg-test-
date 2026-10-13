-- Study0SG portal core migration.
-- Run once in a fresh Supabase project, then review the SQL diff before release.

begin;

-- Keep the vector type in a separate extension schema.
create schema if not exists extensions;
create extension if not exists vector with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- Create strict allowed values for statuses, roles and departments.
do $$ begin
  if not exists (select 1 from pg_type where typname = 'portal_status') then
    create type public.portal_status as enum
      ('invited','active','suspended','pending_offboard','offboarded');
  end if;
  if not exists (select 1 from pg_type where typname = 'portal_role') then
    create type public.portal_role as enum
      ('fore_director','director','support_pool','community_crew',
       'media_crew','tech_security','educator_circle');
  end if;
  if not exists (select 1 from pg_type where typname = 'portal_department') then
    create type public.portal_department as enum
      ('executive','support','community','media','technology','education');
  end if;
end $$;

-- Organizers have internal random UUIDs, never national identifiers.
create table if not exists public.organizers (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (char_length(display_name) between 2 and 100),
  email text,
  status public.portal_status not null default 'invited',
  primary_department public.portal_department not null,
  private_bio text check (char_length(private_bio) <= 2000),
  public_bio text check (char_length(public_bio) <= 300),
  public_avatar_url text,
  social_links jsonb not null default '{}'::jsonb,
  public_card_opt_in boolean not null default false,
  consent_version text,
  joined_at timestamptz,
  last_profile_verified_at timestamptz,
  lock_reason text check (lock_reason in ('profile_review_due','security_incident','admin_hold')),
  session_epoch integer not null default 1 check (session_epoch > 0),
  offboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'offboarded') = (offboarded_at is not null))
);
create unique index if not exists organizers_email_unique
  on public.organizers (lower(email)) where email is not null;

-- Provider subjects are HMAC digests computed by an Edge Function.
-- Do not store Singpass sub, NRIC, FIN or the HMAC pepper here.
create table if not exists public.identity_links (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.organizers(id) on delete cascade,
  provider text not null check (provider in ('stytch','singpass')),
  subject_digest text not null check (subject_digest ~ '^[a-f0-9]{64}$'),
  linked_at timestamptz not null default now(),
  assurance text not null default 'verified',
  unique(provider, subject_digest)
);

-- Each grant is reviewed in the DB, not trusted from a browser role field.
create table if not exists public.organizer_grants (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.organizers(id) on delete cascade,
  role public.portal_role not null,
  department public.portal_department,
  granted_by uuid references public.organizers(id),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  check ((role = 'fore_director' and department is null)
      or (role <> 'fore_director' and department is not null))
);
create unique index if not exists grants_one_active_role_per_department
  on public.organizer_grants (organizer_id, role, coalesce(department, 'executive'::public.portal_department))
  where revoked_at is null;

-- Public application data remains private to reviewers.
create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  receipt_code text not null unique default encode(extensions.gen_random_bytes(12),'hex'),
  display_name text not null check (char_length(display_name) between 2 and 100),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  email_verified_at timestamptz,
  biography text not null check (char_length(biography) between 50 and 500),
  preferred_departments public.portal_department[] not null,
  availability_hours_per_week smallint check (availability_hours_per_week between 0 and 60),
  consent_version text not null,
  public_card_opt_in boolean not null default false,
  status text not null default 'pending'
    check (status in ('pending','reviewing','approved','declined','withdrawn')),
  reviewed_by uuid references public.organizers(id),
  reviewed_at timestamptz,
  organizer_id uuid unique references public.organizers(id),
  created_at timestamptz not null default now(),
  check (array_length(preferred_departments, 1) between 1 and 3)
);
create index if not exists applications_pending_idx
  on public.applications(status, created_at);

-- One organizer can file one unresolved resignation at a time.
create table if not exists public.resignations (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.organizers(id),
  reason text check (char_length(reason) <= 1000),
  status text not null default 'pending'
    check (status in ('pending','approved','withdrawn')),
  submitted_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.organizers(id)
);
create unique index if not exists one_pending_resignation
  on public.resignations(organizer_id) where status = 'pending';

-- Append-only security events must contain redacted metadata only.
create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  request_id uuid not null default gen_random_uuid(),
  actor_id uuid references public.organizers(id) on delete set null,
  target_id uuid references public.organizers(id) on delete set null,
  department public.portal_department,
  event_code text not null check (char_length(event_code) <= 80),
  severity text not null check (severity in ('normal','notice','attention')),
  outcome text not null check (outcome in ('allowed','denied','queued','completed','failed')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_time_idx on public.audit_logs(created_at desc);
create index if not exists audit_actor_idx on public.audit_logs(actor_id, created_at desc);

-- An outbox makes external publishing and revocation retryable.
create table if not exists public.delivery_outbox (
  id bigint generated always as identity primary key,
  event_key text not null unique,
  event_type text not null check (event_type in (
    'card.publish','card.unpublish','card.rebuild',
    'access.revoke','notification.send','profile.review_due')),
  payload jsonb not null,
  state text not null default 'pending'
    check (state in ('pending','processing','done','dead_letter')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists outbox_due_idx
  on public.delivery_outbox(next_attempt_at) where state = 'pending';

-- Public profiles are stored as a separate safe projection.
create table if not exists public.public_team_cards (
  organizer_id uuid primary key references public.organizers(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,64}$'),
  display_name text not null,
  department_label text not null,
  bio text not null default '',
  avatar_url text,
  social_links jsonb not null default '{}'::jsonb,
  published boolean not null default false,
  revision integer not null default 1,
  published_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Every public-card revision queues a retryable website update.
-- This trigger never calls GitHub directly inside a database transaction.
create or replace function public.enqueue_public_card_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' and not new.published then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.published = old.published
      and new.revision = old.revision then
    return new;
  end if;
  insert into public.delivery_outbox(event_key,event_type,payload)
    values ('card-revision-'||new.organizer_id::text||'-'||new.revision::text,
      case when new.published then 'card.publish' else 'card.unpublish' end,
      jsonb_build_object('organizer_id',new.organizer_id,
        'revision',new.revision))
    on conflict(event_key) do nothing;
  return new;
end; $$;
drop trigger if exists public_card_change on public.public_team_cards;
create trigger public_card_change
  after insert or update of published,revision on public.public_team_cards
  for each row execute function public.enqueue_public_card_change();

-- Resource visibility is additionally checked at query time.
create table if not exists public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  source_storage_key text not null,
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  source_uri text,
  classification text not null check (classification in ('internal','restricted')),
  collection text not null,
  allowed_departments public.portal_department[] not null default '{}',
  embedding_model text not null,
  corpus_version integer not null check (corpus_version >= 1),
  license_status text not null default 'pending',
  reviewed_by uuid references public.organizers(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique(sha256, embedding_model, corpus_version)
);

-- Store stable page references for exact RAG citations.
create table if not exists public.knowledge_vectors (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.knowledge_documents(id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  page_from integer not null check (page_from >= 1),
  page_to integer not null check (page_to >= page_from),
  content text not null check (length(content) between 1 and 5000),
  content_sha256 text not null check (content_sha256 ~ '^[a-f0-9]{64}$'),
  embedding extensions.vector(1536) not null,
  created_at timestamptz not null default now(),
  unique(document_id,chunk_index)
);
create index if not exists knowledge_vectors_hnsw
  on public.knowledge_vectors using hnsw (embedding extensions.vector_cosine_ops);
create index if not exists knowledge_vectors_document_idx
  on public.knowledge_vectors (document_id, chunk_index);

-- Department-owned tasks support the flexible Support Pool.
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  department public.portal_department not null,
  title text not null check (length(title) between 3 and 200),
  description text,
  assignee_id uuid references public.organizers(id),
  status text not null default 'todo' check (status in ('todo','doing','blocked','done')),
  due_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Training results are written through verified backend workflows.
create table if not exists public.training_progress (
  organizer_id uuid not null references public.organizers(id) on delete cascade,
  track_key text not null,
  module_key text not null,
  completed_at timestamptz,
  verified_by uuid references public.organizers(id),
  primary key (organizer_id, track_key, module_key)
);
create table if not exists public.course_resources (
  id uuid primary key default gen_random_uuid(),
  department public.portal_department not null,
  title text not null,
  drive_file_id text,
  r2_object_key text,
  mime_type text not null,
  approved boolean not null default false,
  reviewed_by uuid references public.organizers(id),
  created_at timestamptz not null default now(),
  check (num_nonnulls(drive_file_id,r2_object_key) = 1)
);

-- Media uploads start private and cannot publish themselves.
create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  department public.portal_department not null default 'media',
  uploader_id uuid references public.organizers(id),
  r2_key text not null unique,
  mime_type text not null,
  byte_size bigint not null check (byte_size > 0 and byte_size <= 104857600),
  sha256 text,
  status text not null default 'quarantine'
    check (status in ('quarantine','approved','published','rejected')),
  created_at timestamptz not null default now()
);

-- Checklist evidence is verified by a responsible staff member.
create table if not exists public.offboarding_checks (
  id uuid primary key default gen_random_uuid(),
  resignation_id uuid not null references public.resignations(id),
  system_key text not null,
  status text not null default 'requested'
    check (status in ('requested','verified','exception')),
  performed_by uuid references public.organizers(id),
  verified_by uuid references public.organizers(id),
  evidence_reference text,
  verified_at timestamptz,
  unique(resignation_id,system_key)
);

-- Custom JWTs use the organizer UUID in the verified sub claim.
create or replace function public.current_actor() returns uuid
language sql stable set search_path = '' as $$
  select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
$$;

-- This definer function reads live status despite RLS on organizers.
create or replace function public.is_active_actor() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organizers o
    where o.id = public.current_actor()
      and o.status = 'active'
      and o.lock_reason is null
      and (current_setting('request.jwt.claims', true)::jsonb->>'ep')::int = o.session_epoch
  );
$$;

-- Check current grants from Postgres, not JWT role claims.
create or replace function public.has_grant(
  p_role public.portal_role,
  p_department public.portal_department default null
) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_active_actor() and exists (
    select 1 from public.organizer_grants g
    where g.organizer_id = public.current_actor()
      and g.role = p_role
      and g.revoked_at is null
      and (p_department is null or g.department = p_department)
  );
$$;

-- Fore Directors can view all assigned departments.
create or replace function public.can_access_department(
  p_department public.portal_department
) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.has_grant('fore_director'::public.portal_role)
    or (public.is_active_actor() and exists (
      select 1 from public.organizer_grants g
      where g.organizer_id = public.current_actor()
        and g.department = p_department
        and g.revoked_at is null
    ));
$$;

-- Only reviewers can read applications. Applicants never get DB access.
create or replace function public.can_review_department(
  p_department public.portal_department
) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.has_grant('fore_director'::public.portal_role)
      or public.has_grant('director'::public.portal_role, p_department);
$$;

-- The applicant's first preferred department controls default review scope.
create or replace function public.can_review_application(
  p_preferences public.portal_department[]
) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.has_grant('fore_director'::public.portal_role)
    or exists (
      select 1 from unnest(p_preferences) d
      where public.has_grant('director'::public.portal_role, d)
    );
$$;

-- RAG access is based on approved collection + team membership.
create or replace function public.can_access_collection(
  p_collection text,
  p_departments public.portal_department[]
) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.has_grant('fore_director'::public.portal_role)
      or public.has_grant('support_pool'::public.portal_role)
      or (
        public.is_active_actor()
        and exists (
          select 1 from unnest(p_departments) d
          where public.can_access_department(d)
        )
      );
$$;

-- Prevent direct writes to append-only audit events.
create or replace function public.reject_audit_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'audit_logs are append-only';
end; $$;
drop trigger if exists audit_immutable on public.audit_logs;
create trigger audit_immutable before update or delete on public.audit_logs
for each row execute function public.reject_audit_mutation();

-- Deny direct access by default until these specific policies apply.
alter table public.organizers enable row level security;
alter table public.identity_links enable row level security;
alter table public.organizer_grants enable row level security;
alter table public.applications enable row level security;
alter table public.resignations enable row level security;
alter table public.audit_logs enable row level security;
alter table public.delivery_outbox enable row level security;
alter table public.public_team_cards enable row level security;
alter table public.knowledge_documents enable row level security;
alter table public.knowledge_vectors enable row level security;
alter table public.tasks enable row level security;
alter table public.training_progress enable row level security;
alter table public.course_resources enable row level security;
alter table public.media_assets enable row level security;
alter table public.offboarding_checks enable row level security;

-- Select the minimal rows needed. Secrets and identity links stay service-only.
create policy organizer_self_or_owner_read on public.organizers
  for select to authenticated using (
    public.is_active_actor() and
    (id = public.current_actor() or public.has_grant('fore_director'))
  );
create policy grants_self_or_owner_read on public.organizer_grants
  for select to authenticated using (
    public.is_active_actor() and
    (organizer_id = public.current_actor() or public.has_grant('fore_director'))
  );
create policy reviewer_applications_read on public.applications
  for select to authenticated using (
    public.is_active_actor() and public.can_review_application(preferred_departments)
  );
create policy fore_director_resignations_read on public.resignations
  for select to authenticated using (public.has_grant('fore_director'));
create policy authorised_audit_read on public.audit_logs
  for select to authenticated using (
    public.is_active_actor() and (
      actor_id = public.current_actor()
      or public.has_grant('fore_director')
      or public.has_grant('tech_security')
      or (department is not null and public.has_grant('director', department))
    )
  );
-- Only these explicitly allowlisted fields are exposed to anonymous visitors.
-- The view owner must remain a trusted migration owner, not a regular user.
create or replace view public.public_team_directory
with (security_barrier = true) as
  select c.slug, c.display_name, c.department_label, c.bio,
         c.avatar_url, c.social_links, c.published_at, c.revision
  from public.public_team_cards c
  join public.organizers o on o.id = c.organizer_id
  where c.published and o.status = 'active' and o.public_card_opt_in;
create policy approved_knowledge_metadata_read on public.knowledge_documents
  for select to authenticated using (
    public.is_active_actor() and classification = 'internal'
    and approved_at is not null
    and license_status = 'approved'
    and public.can_access_collection(collection, allowed_departments)
  );
create policy tasks_scoped_read on public.tasks
  for select to authenticated using (
    public.is_active_actor() and public.can_access_department(department)
  );
create policy self_training_read on public.training_progress
  for select to authenticated using (
    public.is_active_actor() and
    (organizer_id = public.current_actor() or public.has_grant('fore_director'))
  );
create policy coursework_scoped_read on public.course_resources
  for select to authenticated using (
    public.is_active_actor() and approved
    and public.can_access_department(department)
  );
create policy media_scoped_read on public.media_assets
  for select to authenticated using (
    public.is_active_actor() and (
      public.has_grant('media_crew',department)
      or public.has_grant('director',department)
      or public.has_grant('fore_director')
      or (public.has_grant('tech_security') and status = 'quarantine')
    )
  );
create policy fore_offboarding_read on public.offboarding_checks
  for select to authenticated using (public.has_grant('fore_director'));

-- No INSERT/UPDATE/DELETE policies for auth/anon; use audited RPCs/Edge.
-- Postgres grants are an independent protection layer beside RLS.
revoke all on public.organizers, public.identity_links, public.organizer_grants,
  public.applications, public.resignations, public.audit_logs,
  public.delivery_outbox, public.public_team_cards, public.knowledge_documents,
  public.knowledge_vectors, public.tasks, public.training_progress,
  public.course_resources, public.media_assets, public.offboarding_checks
  from anon, authenticated;
grant usage on schema public to anon, authenticated;
grant select on public.public_team_directory to anon, authenticated;
grant select on public.organizers, public.organizer_grants,
  public.applications, public.resignations, public.audit_logs,
  public.knowledge_documents, public.tasks, public.training_progress,
  public.course_resources, public.media_assets, public.offboarding_checks
  to authenticated;

-- The self-service resignation transition is atomic and can't be undone by SPA.
create or replace function public.submit_resignation(p_reason text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := public.current_actor();
  v_id uuid;
begin
  if not public.is_active_actor() then
    raise exception 'No active organizer session' using errcode = '42501';
  end if;
  if length(coalesce(p_reason,'')) > 1000 then
    raise exception 'Reason is too long' using errcode = '22001';
  end if;

  perform 1 from public.organizers where id=v_actor and status='active' for update;
  if not found then
    raise exception 'Organizer is not active' using errcode = '42501';
  end if;

  update public.organizers
    set status='pending_offboard', session_epoch=session_epoch+1,
        updated_at=now()
    where id=v_actor;
  insert into public.resignations(organizer_id,reason)
    values (v_actor,p_reason) returning id into v_id;
  update public.public_team_cards
    set published=false, revision=revision+1, updated_at=now()
    where organizer_id=v_actor;
  -- Seed real external-access work, so final review cannot skip it.
  insert into public.offboarding_checks(resignation_id,system_key)
    select v_id, unnest(array[
      'stytch','singpass_link','google_workspace','google_drive',
      'r2','supabase','github','discord_telegram','social_accounts',
      'content_handover','public_profile','pdpa'
    ]);
  insert into public.delivery_outbox(event_key,event_type,payload)
    values ('revoke-resignation-'||v_id::text,'access.revoke',
      jsonb_build_object('organizer_id',v_actor,'resignation_id',v_id));
  insert into public.audit_logs(actor_id,target_id,event_code,severity,outcome,details)
    values (v_actor,v_actor,'organizer.resignation.submitted','attention','completed',
      jsonb_build_object('resignation_id',v_id));
  return v_id;
end; $$;

-- Verify and return only chunks the current actor may read.
create or replace function public.match_knowledge(
  p_query extensions.vector(1536),
  p_collection text,
  p_limit integer default 8
)
returns table(
  chunk_id uuid, document_id uuid, title text, page_from integer,
  page_to integer, content text, distance float8
)
language sql stable security definer set search_path = '' as $$
  select v.id, d.id, d.title, v.page_from, v.page_to, v.content,
         (v.embedding OPERATOR(extensions.<=>) p_query)::float8 as distance
  from public.knowledge_vectors v
  join public.knowledge_documents d on d.id = v.document_id
  where public.is_active_actor()
    and d.collection = p_collection
    and d.classification = 'internal'
    and d.approved_at is not null
    and d.license_status = 'approved'
    and public.can_access_collection(d.collection,d.allowed_departments)
  order by v.embedding OPERATOR(extensions.<=>) p_query, d.id, v.chunk_index
  limit least(greatest(p_limit, 1), 12);
$$;

-- Explicitly prevent PUBLIC from calling privileged security-definer helpers.
revoke all on function public.current_actor() from public;
revoke all on function public.is_active_actor() from public;
revoke all on function public.has_grant(public.portal_role,public.portal_department) from public;
revoke all on function public.can_access_department(public.portal_department) from public;
revoke all on function public.can_review_department(public.portal_department) from public;
revoke all on function public.can_review_application(public.portal_department[]) from public;
revoke all on function public.can_access_collection(text,public.portal_department[]) from public;
revoke all on function public.submit_resignation(text) from public;
revoke all on function public.match_knowledge(extensions.vector(1536),text,integer) from public;
grant execute on function public.current_actor(), public.is_active_actor(),
  public.has_grant(public.portal_role,public.portal_department),
  public.can_access_department(public.portal_department),
  public.can_review_department(public.portal_department),
  public.can_review_application(public.portal_department[]),
  public.can_access_collection(text,public.portal_department[]),
  public.submit_resignation(text),
  public.match_knowledge(extensions.vector(1536),text,integer)
  to authenticated;

commit;
