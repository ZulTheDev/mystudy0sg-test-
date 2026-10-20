-- Private Realtime rooms for Yjs studio updates.
-- Supabase Realtime must support broadcast RLS in the staging project.
-- Anonymous browsers cannot join or send; view members receive, editors send.
create policy study0sg_yjs_read on realtime.messages
 for select to authenticated using (
  public.is_active_actor()
  and realtime.topic() ~ '^studio-yjs:[a-f0-9-]{36}$'
  and exists (
   select 1 from public.v14_studio_documents d
   where d.id=substring(realtime.topic() from 12)::uuid
   and (d.author_id=public.current_actor()
    or public.has_grant('fore_director'::public.portal_role)
    or exists(select 1 from public.v16_studio_members m where m.document_id=d.id and m.organizer_id=public.current_actor()))
  )
 );
create policy study0sg_yjs_write on realtime.messages
 for insert to authenticated with check (
  public.is_active_actor()
  and realtime.topic() ~ '^studio-yjs:[a-f0-9-]{36}$'
  and exists (
   select 1 from public.v14_studio_documents d
   where d.id=substring(realtime.topic() from 12)::uuid
   and (d.author_id=public.current_actor()
    or public.has_grant('fore_director'::public.portal_role)
    or exists(select 1 from public.v16_studio_members m
      where m.document_id=d.id and m.organizer_id=public.current_actor() and m.permission='editor'))
  )
 );
-- RLS broadcasts are ephemeral; v16_studio_save persists reviewed revisions.
