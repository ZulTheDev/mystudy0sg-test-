/** Small educational request-checker: pure calculation, no network I/O or untrusted code execution. */
export type RuleKind='missing_auth'|'sensitive_path'|'rate_spike'|'script_marker'|'sql_marker';
export type Rule={id:string;kind:RuleKind;enabled:boolean;decision:'block'|'review'};
export type Lab={name:string;rules:Rule[]};
export function evaluateLab(lab:Lab,input:{path:string;signedIn:boolean;count:number;input:string}){
 const findings:string[]=[];let verdict:'allow'|'review'|'block'='allow';
 for(const rule of lab.rules.filter(r=>r.enabled)){
  const triggered=rule.kind==='missing_auth'?!input.signedIn&&input.path.startsWith('/admin'):
    rule.kind==='sensitive_path'?/\/(admin|internal|private)(\/|$)/i.test(input.path):
    rule.kind==='rate_spike'?input.count>60:
    rule.kind==='script_marker'?/<\s*script\b/i.test(input.input):
    /(?:\bor\s+1\s*=\s*1\b|union\s+select)/i.test(input.input);
  if(triggered){findings.push(rule.kind);if(rule.decision==='block')verdict='block';else if(verdict!=='block')verdict='review';}
 }
 return {verdict,findings};
}
