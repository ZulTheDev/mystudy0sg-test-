// Browser data layer. Reads are limited by RLS; writes use audited SQL RPCs.
import { db } from './supabase-portal';

export type Department = 'executive'|'support'|'community'|'media'|'technology'|'education';
export type PortalRole = 'director'|'support_pool'|'community_crew'|'media_crew'|'tech_security'|'educator_circle';
export const departments: Department[] = ['executive','support','community','media','technology','education'];
export const grantRoles: PortalRole[] = ['director','support_pool','community_crew','media_crew','tech_security','educator_circle'];
export type Organizer = {
  id: string; display_name: string; email: string|null; status: string;
  primary_department: Department; private_bio?: string|null; public_bio?: string|null;
};
export type Grant = { id: string; organizer_id: string; role: string; department: Department|null; revoked_at: string|null };
export type Task = {
  id: string; title: string; description: string|null; department: Department;
  assignee_id: string|null; status: string; due_at: string|null; archived_at?: string|null;
};
export type PortalEvent = {
  id: string; department: Department; title: string; description: string;
  starts_at: string; ends_at: string; venue: string; status: string;
};
export type Application = {
  id: string; display_name: string; email: string; biography: string;
  preferred_departments: Department[]; status: string; email_verified_at: string|null;
};
export type Claim = {
  id: string; organizer_id: string; department: Department; activity_label: string;
  candidate_minutes: number; approved_minutes: number|null; potential_via: boolean;
  status: string; created_at: string;
};
export type Entry = { id: string; organizer_id: string; minutes_delta: number; entry_type: string; created_at: string };
export type Audit = { id: number; actor_id: string|null; event_code: string; severity: string; outcome: string; created_at: string };
export type KnowledgeDoc = { id: string; title: string; collection: string; approved_at: string|null };

// Centralize error checking so forms never silently succeed.
export async function rows<T>(table: string, columns='*'): Promise<T[]> {
  const { data, error } = await db.from(table).select(columns).limit(300);
  if (error) throw new Error(`${table}: ${error.message}`);
  return (data ?? []) as T[];
}

// Every mutation is authorized again inside a database SECURITY DEFINER function.
export async function mutation<T = unknown>(name: string, parameters: Record<string,unknown>): Promise<T> {
  const { data, error } = await db.rpc(name, parameters);
  if (error) throw new Error(error.message);
  return data as T;
}

export function permitsAdmin(roles: string[]): boolean { return roles.includes('fore_director'); }
export function permitsManager(grants: Array<{role:string;department:string|null}>, dept: string): boolean {
  return grants.some(g=>g.role==='fore_director' || (g.role==='director'&&g.department===dept));
}

export function readableDate(value:string|null):string {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-SG',{dateStyle:'medium',timeStyle:'short'});
}

// Send knowledge questions to the secure API. This endpoint never mutates records.
export type ChatSource = {document_id:string;title:string;page_from:number;page_to:number;distance:number};
export type ChatResult = {answer:string;sources:ChatSource[];notice?:string};
export async function askKnowledge(question:string, history: Array<{role:'user'|'assistant';content:string}>, token:string):Promise<ChatResult> {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const res = await fetch(`${url}/functions/v1/knowledge-chat`, {
    method:'POST',
    headers:{'Content-Type':'application/json',apikey:key,Authorization:`Bearer ${token}`},
    body:JSON.stringify({question,history:history.slice(-6),collection:'organization'})
  });
  const body = await res.json().catch(()=>null) as ChatResult & {error?:string}|null;
  if(!res.ok) throw new Error(body?.error ?? `AI chat unavailable (HTTP ${res.status})`);
  return body!;
}
