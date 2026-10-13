-- Study0SG v1.7: secure organizer announcements and personal read receipts.
-- Run once AFTER earlier portal migrations. No anon access to announcement data.
BEGIN;
CREATE TABLE IF NOT EXISTS public.v17_announcements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 title text NOT NULL CHECK (char_length(trim(title)) BETWEEN 5 AND 140),
 body text NOT NULL CHECK (char_length(trim(body)) BETWEEN 1 AND 6000),
 department public.portal_department,
 importance text NOT NULL DEFAULT 'normal' CHECK (importance IN ('normal','important','urgent')),
 pinned boolean NOT NULL DEFAULT false,
 published_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz,
 author_id uuid NOT NULL REFERENCES public.organizers(id),
 deleted_at timestamptz,
 CHECK (expires_at IS NULL OR expires_at > published_at)
);
CREATE INDEX IF NOT EXISTS v17_announcements_visible_idx ON public.v17_announcements(published_at DESC) WHERE deleted_at IS NULL;
CREATE TABLE IF NOT EXISTS public.v17_announcement_reads (
 announcement_id uuid NOT NULL REFERENCES public.v17_announcements(id) ON DELETE CASCADE,
 organizer_id uuid NOT NULL REFERENCES public.organizers(id),
 read_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (announcement_id,organizer_id)
);
CREATE INDEX IF NOT EXISTS v17_announcement_reads_organizer_idx ON public.v17_announcement_reads(organizer_id,read_at DESC);
ALTER TABLE public.v17_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v17_announcement_reads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.v17_announcements FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.v17_announcement_reads FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.v17_announcements TO authenticated;
CREATE POLICY v17_announcements_view ON public.v17_announcements FOR SELECT TO authenticated USING (
 public.is_active_actor() AND deleted_at IS NULL AND published_at <= now()
 AND (expires_at IS NULL OR expires_at > now())
 AND (department IS NULL OR public.can_access_department(department))
);
-- Reads are deliberately served by a single verified RPC to prevent leaks via joins.

CREATE OR REPLACE FUNCTION public.v17_announcements_inbox()
RETURNS TABLE(id uuid,title text,body text,department public.portal_department,importance text,pinned boolean,published_at timestamptz,expires_at timestamptz,author_name text,read_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT a.id,a.title,a.body,a.department,a.importance,a.pinned,a.published_at,a.expires_at,
        coalesce(o.display_name,'Organizer')::text AS author_name,r.read_at
 FROM public.v17_announcements a
 JOIN public.organizers o ON o.id=a.author_id
 LEFT JOIN public.v17_announcement_reads r ON r.announcement_id=a.id AND r.organizer_id=public.current_actor()
 WHERE public.is_active_actor()
   AND a.deleted_at IS NULL AND a.published_at<=now()
   AND (a.expires_at IS NULL OR a.expires_at>now())
   AND (a.department IS NULL OR public.can_access_department(a.department))
 ORDER BY a.pinned DESC,(r.read_at IS NULL) DESC,
  CASE a.importance WHEN 'urgent' THEN 3 WHEN 'important' THEN 2 ELSE 1 END DESC,
  a.published_at DESC
 LIMIT 200;
$$;

CREATE OR REPLACE FUNCTION public.v17_announcement_mark_read(p_announcement uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_department public.portal_department;
BEGIN
 IF NOT public.is_active_actor() THEN RAISE EXCEPTION 'Active organizer required' USING errcode='42501'; END IF;
 SELECT a.department INTO v_department FROM public.v17_announcements a
 WHERE a.id=p_announcement AND a.deleted_at IS NULL AND a.published_at<=now()
 AND (a.expires_at IS NULL OR a.expires_at>now());
 IF NOT FOUND OR (v_department IS NOT NULL AND NOT public.can_access_department(v_department))
 THEN RAISE EXCEPTION 'Announcement not available' USING errcode='42501'; END IF;
 INSERT INTO public.v17_announcement_reads (announcement_id,organizer_id)
 VALUES (p_announcement,public.current_actor()) ON CONFLICT DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.v17_announcement_publish(
 p_title text,p_body text,p_department public.portal_department DEFAULT NULL,
 p_importance text DEFAULT 'normal',p_pinned boolean DEFAULT false
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_id uuid;
BEGIN
 IF NOT public.is_active_actor() THEN RAISE EXCEPTION 'Active organizer required' USING errcode='42501'; END IF;
 IF p_department IS NULL THEN
  IF NOT public.has_grant('fore_director'::public.portal_role)
  THEN RAISE EXCEPTION 'Fore Director required for organization-wide announcement' USING errcode='42501'; END IF;
 ELSIF NOT public.can_review_department(p_department) THEN
  RAISE EXCEPTION 'Department Director required' USING errcode='42501';
 END IF;
 IF char_length(trim(coalesce(p_title,''))) NOT BETWEEN 5 AND 140 OR
    char_length(trim(coalesce(p_body,''))) NOT BETWEEN 1 AND 6000 OR
    coalesce(p_importance,'') NOT IN ('normal','important','urgent')
 THEN RAISE EXCEPTION 'Invalid title, message or priority'; END IF;
 INSERT INTO public.v17_announcements(title,body,department,importance,pinned,author_id)
 VALUES(trim(p_title),trim(p_body),p_department,p_importance,coalesce(p_pinned,false),public.current_actor())
 RETURNING id INTO v_id;
 PERFORM public.portal_log_change('announcement.published',public.current_actor(),null,p_department,
 jsonb_build_object('announcement_id',v_id,'audience',coalesce(p_department::text,'all'),'importance',p_importance));
 RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.v17_announcements_inbox() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.v17_announcement_mark_read(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.v17_announcement_publish(text,text,public.portal_department,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.v17_announcements_inbox() TO authenticated;
GRANT EXECUTE ON FUNCTION public.v17_announcement_mark_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.v17_announcement_publish(text,text,public.portal_department,text,boolean) TO authenticated;
-- Enable realtime delivery if possible. Polling on the frontend is a reliable fallback.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime')
    AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='v17_announcements') THEN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.v17_announcements;
 END IF;
END $$;
COMMIT;
