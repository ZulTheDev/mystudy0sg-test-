/** Abort a public git commit if it includes known secret paths or credential tokens.
 * Conservative smoke check, not a substitute for secret-scanning tools. */
import {execFileSync} from 'node:child_process';import fs from 'node:fs';
let files=[];
try{files=execFileSync('git',['diff','--cached','--name-only','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);}catch{console.error('Run inside your git project after staging files.');process.exit(1);}
if(!files.length){console.log('No staged files yet.');process.exit(0);}
const forbidden=/(^|\/)(\.env(\.|$)|.*(private.?jwk|signing_keys|database_backup|service_account).*|.*\.(pem|p12|pfx|key|backup|dump)$)|(^|\/)(MY_STUDY0SG_PORTAL_ARCHITECTURE|STUDY0SG_IDENTITY_GOOGLE_VIA_ADDENDUM|FRONTEND_FIX_REPORT|START_HERE)(\.md|$)/i;
const key=/-----BEGIN (?:EC|RSA|OPENSSH|PRIVATE) PRIVATE KEY-----|sb_secret_[A-Za-z0-9_-]{15,}|ghp_[A-Za-z0-9]{20,}|sk-proj-[A-Za-z0-9_-]{20,}|secret-(?:live|test)-[A-Za-z0-9]{24,}/;
let fail=false;
for(const file of files){if(forbidden.test(file)){console.error('Do not commit internal/secret file:',file);fail=true;continue;}
 if(!fs.existsSync(file)||!fs.statSync(file).isFile())continue;
 if(fs.statSync(file).size>1_500_000){console.error('Large staged file; review manually:',file);fail=true;continue;}
 const content=fs.readFileSync(file,'utf8');if(key.test(content)){console.error('Possible private credential in',file);fail=true;}}
if(fail)process.exit(1);
console.log(`PASS: ${files.length} staged paths passed the basic public-release safety checks. Please review git diff --cached as well.`);
