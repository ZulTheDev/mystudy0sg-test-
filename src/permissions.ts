// Menu visibility only. Backend RPCs and RLS enforce actual permissions.
import matrix from '../config/portal.permissions.json';
export type ModuleKey = keyof typeof matrix.modules;
export const labels: Record<ModuleKey,string> = matrix.modules;
export function visibleModules(grants:Array<{role:string;department:string|null}>):ModuleKey[]{
  const allow=new Set<string>(matrix.base);
  if(grants.some(g=>g.role==='fore_director'))return Object.keys(matrix.modules) as ModuleKey[];
  const roleMap=matrix.roles as Record<string,string[]>;
  for(const g of grants){
    for(const mod of roleMap[g.role]??[])allow.add(mod);
    if(g.role==='director') {
      if(g.department==='technology'){allow.add('security');allow.add('security_supply_chain');allow.add('tech_studio');allow.add('security_studio');allow.add('security_tools');allow.add('security_accounts');}
      if(g.department==='media'){allow.add('media');allow.add('media_forms');allow.add('media_edm');allow.add('social_media');}
      if(g.department==='community'){allow.add('community');allow.add('community_handoffs');}
      if(g.department==='education')allow.add('educator');
      if(g.department==='support')allow.add('support_queue');
    }
  }
  return (Object.keys(matrix.modules) as ModuleKey[]).filter(k=>allow.has(k));
}
