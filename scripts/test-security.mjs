import fs from 'node:fs';import vm from 'node:vm';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
const source=fs.readFileSync(new URL('../src/security/tool-rules.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const obj={exports:{}};vm.runInNewContext(js,{exports:obj.exports,console});
const lab={name:'Study0SG simulated defence',rules:['missing_auth','sensitive_path','rate_spike','script_marker','sql_marker'].map(kind=>({kind,id:kind,enabled:true,decision:'block'}))};
const cases=[
 [{path:'/events',signedIn:true,count:2,input:'hello'},'allow'],
 [{path:'/admin',signedIn:false,count:2,input:'hello'},'block'],
 [{path:'/events',signedIn:true,count:150,input:'hello'},'block'],
 [{path:'/comments',signedIn:true,count:1,input:'<script>example</script>'},'block'],
 [{path:'/search',signedIn:true,count:1,input:"' OR 1=1 --"},'block'],
];
for(const [input,expected] of cases){const result=obj.exports.evaluateLab(lab,input);if(result.verdict!==expected)throw Error(`Rule case failed: ${JSON.stringify(input)} (got ${result.verdict})`);}
lab.rules.forEach(r=>r.enabled=false);
if(obj.exports.evaluateLab(lab,cases[2][0]).verdict!=='allow')throw Error('Disabled rules should not block');
// Ensure the migration includes the primary security invariants.
const sql=fs.readFileSync(new URL('../supabase/migrations/20261013100000_collaboration_security_marketing.sql',import.meta.url),'utf8');
for(const phrase of ['for update','p_expected_revision','v16_studio_members','enable row level security','created_by<>public.current_actor()','revoke all on function public.v14_save_studio']){
 if(!sql.includes(phrase))throw Error('Security migration invariant missing: '+phrase);
}
console.log('PASS: 6 defensive simulation cases and migration authorization invariants');
