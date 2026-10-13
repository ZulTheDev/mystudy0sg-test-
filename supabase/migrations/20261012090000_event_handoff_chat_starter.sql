-- Study0SG v1.4 staging-only starter.
-- Run after v1.3 baseline migrations; review on a cloned test database first.
-- This does NOT implement the public registration API, report generation or notifications.

begin;

-- One versioned public form maps to an existing portal event.
create table if not exists public.registration_forms (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.portal_events(id) on delete restrict,
  title text not null check (char_length(title) between 3 and 160),
  schema_json jsonb not null default '{}'::jsonb,
  form_version integer not null default 1 check (form_version >= 1),
  status text not null default 'draft' check (status in ('draft','review','published','closed')),
  created_by uuid not null references public.organizers(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Private participant records are never readable by the public API role.
create table if not exists public.event_participants (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (char_length(display_name) between 1 and 120),
  contact_email text,
  guardian_email text,
  created_at timestamptz not null default now()
);

-- Each registration refers to one event and one participant.
create table if not exists public.event_registrations (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.registration_forms(id) on delete restrict,
  participant_id uuid not null references public.event_participants(id) on delete restrict,
  status text not null default 'submitted' check (status in ('submitted','guardian_pending','confirmed','waitlisted','withdrawn')),
  interest_data jsonb not null default '{}'::jsonb,
  consent_version text not null,
  guardian_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(form_id, participant_id)
);

-- Media submits summarized data to Community for review.
create table if not exists public.event_handoffs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.portal_events(id) on delete restrict,
  created_by uuid not null references public.organizers(id),
  reviewed_by uuid references public.organizers(id),
  registered_count integer not null check (registered_count >= 0),
  confirmed_count integer not null check (confirmed_count >= 0),
  report_storage_path text,
  status text not null default 'submitted' check (status in ('submitted','reviewing','approved','returned')),
  notes text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  check (confirmed_count <= registered_count)
);

-- Internal channels for organizer-to-organizer communication.
create table if not exists public.organizer_chat_threads (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('direct','department','global')),
  title text not null,
  created_by uuid not null references public.organizers(id),
  created_at timestamptz not null default now()
);
create table if not exists public.organizer_chat_members (
  thread_id uuid not null references public.organizer_chat_threads(id) on delete cascade,
  organizer_id uuid not null references public.organizers(id),
  joined_at timestamptz not null default now(),
  primary key(thread_id, organizer_id)
);
create table if not exists public.organizer_chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.organizer_chat_threads(id) on delete cascade,
  organizer_id uuid not null references public.organizers(id),
  body text not null check (char_length(body) between 1 and 4000),
  sent_at timestamptz not null default now(),
  removed_at timestamptz
);

-- Public inserts must go through a protected Edge Function; never expose raw tables.
alter table public.registration_forms enable row level security;
alter table public.event_participants enable row level security;
alter table public.event_registrations enable row level security;
alter table public.event_handoffs enable row level security;
alter table public.organizer_chat_threads enable row level security;
alter table public.organizer_chat_members enable row level security;
alter table public.organizer_chat_messages enable row level security;

revoke all on public.registration_forms, public.event_participants,
 public.event_registrations, public.event_handoffs,
 public.organizer_chat_threads, public.organizer_chat_members,
 public.organizer_chat_messages from anon, authenticated;

-- Restricted reading of form definitions. Writes need audited RPCs.
grant select on public.registration_forms to authenticated;
create policy v14_form_read on public.registration_forms for select to authenticated
 using (public.is_active_actor() and
   (public.has_grant('fore_director') or public.can_access_department('media') or public.can_access_department('community')));

-- Community members can see registration rows, while PII requires its own scoped API.
grant select on public.event_registrations to authenticated;
create policy v14_registration_read on public.event_registrations for select to authenticated
 using (public.is_active_actor() and
 (public.has_grant('fore_director') or public.can_access_department('community')));

-- Handoff metadata can be viewed by Media and Community.
grant select on public.event_handoffs to authenticated;
create policy v14_handoff_read on public.event_handoffs for select to authenticated
 using (public.is_active_actor() and
 (public.has_grant('fore_director') or public.can_access_department('media') or public.can_access_department('community')));

-- Chat membership checks are evaluated by a definer function to avoid RLS recursion.
create or replace function public.is_chat_member(p_thread uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select public.is_active_actor() and exists (
  select 1 from public.organizer_chat_members m
  where m.thread_id = p_thread and m.organizer_id = public.current_actor()
 );
$$;
revoke all on function public.is_chat_member(uuid) from public;
grant execute on function public.is_chat_member(uuid) to authenticated;

grant select on public.organizer_chat_threads, public.organizer_chat_members,
 public.organizer_chat_messages to authenticated;
create policy v14_thread_read on public.organizer_chat_threads for select to authenticated
 using (public.is_chat_member(id));
create policy v14_chat_members_read on public.organizer_chat_members for select to authenticated
 using (public.is_chat_member(thread_id));
create policy v14_chat_messages_read on public.organizer_chat_messages for select to authenticated
 using (public.is_chat_member(thread_id));

-- Deliberately no direct insert/update/delete grants. Create audited, rate-limited
-- Edge Function/RPC handlers before enabling public forms, handoffs or chat posting.
commit;
